# ADR-canonical-root-normalization：状态文件根归一（worktree / submodule）与 stateRoot / workRoot 拆分

## 元数据

| 字段 | 值 |
|------|-----|
| Status | **Accepted**（2026-11-09，architect 起草；oracle 已评审 + critic arch 档审稿完成，**0 BLOCKER**，1 SHOULD_FIX 全部闭合）。**未实施**——关联 change 尚未立项 |
| Date | 2026-11-09 |
| Author | architect |
| Parent | 部分取代 `docs/adr/ADR-front-agent-redesign.md` 的 D6（登记与并发协议）中的 `canonical_root` 口径：原裁定未定义 worktree 场景的归一规则，与 `prompts/build.md:195,199` 已写明的「worktree → canonical 归一（`git rev-parse --git-common-dir`）」**口径不一致**；本篇把它写成**可执行的判别式**。该篇 D6 的 pair-v2 schema、锁协议、single-writer 规则**继续有效**。与 `ADR-front-multi-backend` **决策面正交**（后者只在 goal_key 里引用归一后的 `canonical_root`），但**实施顺序有依赖**：本篇应先于后者落地 |
| 关联 change | `openspec/changes/archive/2026-11-10-canonical-root-normalization/`（已立项 2026-11-09，planner 起草） |
| AC 映射 | 本文件 Verification 1–12 → proposal 的 **AC1–AC18**（逐条映射见 proposal 的「AC ↔ ADR Verification 映射」表） |
| 审稿报告 | `.rddf/reviews/adr-front-multi-backend-review.md`（两篇同批评审报告，见该报告 §4） |
| 前置事实 | 3 种 git 场景的实测（主仓 / linked worktree / submodule），原始输出见 `.rddf/reviews/front-multi-backend-probes.md` 的 P4 节 |

## 背景与问题

`lib/delegate-core.ts` 的 `canonicalRoot()` 用 `git rev-parse --show-toplevel` 算出 `canonical_root`，它同时决定三件事：

1. `pair.json` / `role.json` / `ledger.jsonl` 的**落盘位置**（`<root>/.rddf/state/`）
2. `git status` 差集的**执行目录**（越界检测与 `artifacts` 计数的来源）
3. `scope` 相对路径的**解析基准**

而 `prompts/build.md:195,199` 要求角色状态按「`git rev-parse --git-common-dir` 归一」解析，并明确「进入 worktree、`session_move`、切换仓库目录后，项目级 `role.json` 可能不同，不得沿用上一轮的缓存值」。

**两处口径不一致，且不一致的那一处是真 bug。**

实测三种场景：

| 场景 | `--show-toplevel` | abs `--git-common-dir` | `--show-superproject-working-tree` |
|---|---|---|---|
| 主仓 | `/…/main` | `/…/main/.git` | 空 |
| **linked worktree** | `/…/wt` | **`/…/main/.git`** | 空 |
| **submodule 工作树** | `/…/super/vendor/sub` | **`/…/super/.git/modules/vendor/sub`** | **`/…/super`** |

**linked worktree 下的后果**：`--show-toplevel` 返回 worktree 路径 → `pair.json` / `role.json` / `ledger.jsonl` 全部落进 **worktree 工作树副本**，主仓看不到。而 build agent 按主仓路径读 `role.json`（canonical 归一后的路径）就**读不到自己那份** ⇒ 两份状态文件物理分裂 ⇒ `delegate` 的 resume 校验（`lookupPair(root, sessionID)`）在主仓路径下**查无此条** ⇒ 续接被拒（"resume_session 未登记"），而实际那个 session 明明在 pair 表里。

**submodule 下的后果**：`--git-common-dir` 指向 `.git/modules/…`，直接取 `dirname` 会得到 `.git/modules/vendor` 这种**非工作区路径**当状态根 ⇒ 状态文件落到 git 内部目录，完全错误。

## 决策

**主决策**：状态文件的落盘根（**stateRoot**）与变更检测的工作根（**workRoot**）**必须拆成两个值**；stateRoot 按 `git-common-dir` 归一并先判 superproject，workRoot 按 `--show-toplevel` 取；两者在非 worktree 场景恒等，**零行为变化**。

### D1 归一判别式

```
stateRoot = superproject 非空 ? superproject
          : dirname(abs(--git-common-dir))
workRoot  = abs(--show-toplevel)
```

- `abs(--git-common-dir)` 用 `git rev-parse --path-format=absolute --git-common-dir`（git ≥ 2.31；本机 2.43 实测可用）——**不能用裸 `--git-common-dir`**，主仓下它返回相对路径 `.git`。
- **必须先判 superproject**：`--show-superproject-working-tree` 非空即说明当前在 submodule 内，此时 stateRoot 是 superproject 的工作树，**不是** `.git/modules/…`。
- 非 worktree 场景：`dirname(abs(--git-common-dir))` == `abs(--show-toplevel)` ⇒ **stateRoot == workRoot，行为零变化**（这是本篇不惊动既有部署的关键）。

### D2 三个用途分别绑定

| 用途 | 用哪个根 | 理由 |
|---|---|---|
| `pair.json` / `role.json` / `ledger.jsonl` 落盘 | **stateRoot** | 状态是"仓库级"的，worktree 只是工作区；两份状态分裂即状态丢失 |
| `git status` 差集（越界检测 + `artifacts` 计数） | **workRoot** | 变更发生在 worktree 里；在主仓跑 `git status` **数不到 worktree 的变更** |
| `scope` 相对路径解析基准 | **workRoot** | scope 描述的是"要改哪个工作区的哪个路径" |

**不拆开的后果**：worktree 里跑 `git status` 数不到变更 ⇒ `artifacts` 恒为 0 ⇒ `ADR-delegate-delivery-evidence` 的 `no_work_evidence` 判定**系统性误报** `unverified`（本该有产物却报"无可验证交付"）。这不是边缘形态，是 worktree 场景的**必然结果**。

### D3 `canonical_root` 字段语义的兼容处理

`pair.json` 的 `canonical_root` 字段（pair-v2）语义是「这个后端 session 属于哪个仓库」。归一后它存 **stateRoot**。

#### D3.1 两层兼容机制（缺一不可）

既有 pair.json 的存量条目有两处与归一后不一致：**① 文件物理落在 workRoot**（旧代码用 `--show-toplevel`）；**② `canonical_root` 值是 worktree 路径**。只修 ② 不够——在比较 `canonical_root` 之前，`lookupPair` 就已经因为"读的是 stateRoot 路径"而**找不到那条记录**，直接判"未登记"。

| 层 | 机制 | 解决什么 |
|---|---|---|
| **① 读回退** | `lookupPair` 先查 `stateRoot`；找不到再查 `workRoot` | 存量 pair.json 物理在 workRoot，只查 stateRoot 会"未登记" |
| **② 双值接受** | `canonical_root` 与本次的 `stateRoot` **或** `workRoot` 任一相等即通过 | 存量条目的 `canonical_root` 是 worktree 路径 |

新登记的条目**只写 stateRoot**（文件落 stateRoot、字段值 = stateRoot）。

#### D3.2 读回退的真实覆盖面（必须如实声明，不可说成"存量全覆盖"）

实测（主仓 + 两个 worktree `wtA` / `wtB`）：

| 从哪回来 | `stateRoot` | `workRoot` | 能读到 wtA 的存量 pair.json？ |
|---|---|---|---|
| `wtA`（原 worktree） | 主仓 | `wtA` | ✅ 能（回退读命中 workRoot） |
| `wtB`（另一个 worktree） | 主仓 | `wtB` | ❌ 不能（存量在 wtA 目录下） |
| 主仓 | 主仓 | 主仓 | ❌ 不能 |
| `wtA` 已被 `git worktree remove` | 主仓 | 主仓 | ❌ 不能（目录已不存在） |

→ **读回退只覆盖「从同一个 worktree 回来」这一条路径**。这不引入回归（修复前从任何位置都读不到 wtA 的存量），但也**不能声称"存量用户全部不受影响"**——从别处回来仍会"未登记"。

这是有意的取舍：要覆盖全部位置，必须**扫描所有 worktree 目录**去搜 pair.json，那会把"读一个文件"变成"遍历未知数量的目录"，代价与风险都不对称。**用户的实际恢复路径是回到原 worktree 继续**（这与 `prompts/build.md:199` 的「进入 worktree……不得沿用上一轮的缓存值」语义一致）。

#### D3.3 安全边界（回退读不放大身份边界）

两层机制都只放宽**同一仓库内**的路径变体：

- `workRoot` 恒为真实的 `git rev-parse --show-toplevel`（不是调用方声明的路径）；
- 回退读的目录也是由 git 推导的 `workRoot`，不是任意路径；
- 要让 `canonical_root` 校验通过，存量值必须等于本次的 stateRoot 或 workRoot ⇒ **物理上必须处于该仓或其某个 worktree 内**；
- 落在别处的路径既不等于该仓的 stateRoot 也不等于其 workRoot ⇒ 校验失败。

即：放宽的是**同一仓库内**的路径变体与**同一 worktree 内**的读取位置，不是身份边界本身。

### D4 存量迁移

- **不写迁移脚本**。理由：pair.json 是**每工程仓一份**的运行时状态，且 `.rddf/state/` 通常在 `.gitignore` 里；迁移脚本要遍历所有工程的 worktree 副本，收益（统一口径）远小于风险（误改用户的运行时状态）。
- **替代方案**：D3 的两层机制覆盖了**最可能的恢复路径**（回到原 worktree 继续）。已知未覆盖：从其他 worktree / 主仓 / 已删除的 worktree 回来 —— 这些位置本来就"未登记"（修复前同样如此，**不引入回归**），用户需从原 worktree 重新进入。
- **存量条目的处置**：一旦用户从原 worktree 回来并成功 resume，`registerSession` 的 upsert 会把该条目**写回 stateRoot** 并刷新 `last_used_at`；因此存量条目会随使用自然迁到正确位置，无需批量操作。

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **拆 stateRoot / workRoot + superproject 判别式（选中）** | 采用 | 唯一同时满足"状态不分裂"与"变更检测不错位"的方案；非 worktree 场景零行为变化；superproject 判别式补掉 submodule 这个会写到 `.git/modules/` 的错误分支 |
| 继续用 `--show-toplevel` | 否决 | 在 worktree 下状态文件落进工作树副本、主仓读不到 ⇒ resume 查无此条、状态物理分裂 |
| 只改 `--show-toplevel` → `--git-common-dir`，不拆两根 | 否决 | 状态归对了，但变更检测会在主仓跑 ⇒ worktree 里的改动数不到 ⇒ `artifacts` 恒 0 ⇒ `unverified` 系统性误报 |
| `dirname(--git-common-dir)`（不带 superproject 判别） | 否决 | submodule 下得到 `.git/modules/vendor` 这种非工作区路径，状态文件落进 git 内部 |
| 写迁移脚本把存量 worktree 副本的 pair.json 合并回主仓 | 否决 | pair.json 每工程一份且通常被 gitignore；遍历所有工程 worktree 的收益远小于误改运行时状态的风险。D3 的两层机制覆盖了最可能的恢复路径（回到原 worktree） |
| **只做双值接受、不做读回退** | 否决 | 存量 pair.json **物理在 workRoot**，只查 stateRoot 会在比较 `canonical_root` 之前就"未登记"——双值接受永远执行不到。这是 critiс 审稿时被漏掉、metis 审查抓出的缺口 |
| **扫描所有 worktree 目录**以覆盖全部存量位置 | 否决 | 把"读一个文件"变成"遍历未知数量的目录"，代价与风险不对称；且用户的实际恢复路径是回到原 worktree（与 `prompts/build.md:199` 语义一致）。覆盖面已如实声明（D3.2） |
| 上游改 opencode 提供 canonical 路径原语 | 否决（留复审口） | 改动落在上游 fork，维护成本转移；判别式只有 3 行 git 调用，自己做成本更低。若上游日后提供该原语，本篇 D1 可整段替换 |

## 后果 / 代价

**正面**

- worktree 场景下状态文件不再分裂，resume 恢复可用。
- 变更检测在正确的工作区执行，`artifacts` / `no_work_evidence` 的判定恢复可信。
- 非 worktree 场景**零行为变化**——既有部署不受影响。

**负面 / 代价**

- `canonicalRoot()` 的返回形状变了（一个值 → 两个值 + vcs 标志）⇒ 既有调用点必须同步改。`canonicalRoot` 是 `lib/delegate-core.ts` 的导出符号，属**公开 API 变更**，需与既有单测（`tests/delegate-core.test.ts`）同步。
- "stateRoot ≠ workRoot"成为常态路径后，**每个**用到 `root` 的地方都要重新确认该用哪个——这是本篇最贵的部分（不是代码量，是**审阅注意力**）。
- 归一函数多一次 git 调用（`--path-format=absolute` + `--show-superproject-working-tree`），每次 `canonicalRoot()` 多两条子进程。既有实现已调用一次 git，再加一次可接受（非热路径）。

**风险**

- **git 版本依赖**：`--path-format=absolute` 需 git ≥ 2.31。低于此版本需回退到 `path.resolve(cwd, raw)`——但裸 `--git-common-dir` 在主仓返回相对路径 `.git`，回退必须以**调用 cwd** 为基准而非进程 cwd，否则归一错位。→ 实施期需显式处理版本回退路径。
- **submodule 的第三种形态**：`.git` 文件（非目录）指向别处的 submodule，`--git-common-dir` 的行为需单独验一次——本篇的实测覆盖了 `git submodule add` 产生的标准形态。
- **`--show-superproject-working-tree` 在非 submodule 场景返回空字符串**（实测），判别式依赖这个空值语义；上游若改为返回路径而非空串，判别式会误判。→ 归一函数必须**先判空再判路径**。
- **D3 的两层机制只覆盖「从同一个 worktree 回来」**：见 D3.2 的实测表。从其他 worktree / 主仓 / 已删除的 worktree 回来仍会"未登记"——**与修复前一致，不引入回归**，但**不得声称"存量用户全部不受影响"**。要覆盖全部位置必须扫描所有 worktree 目录，代价与风险不对称（已否决）。
- **读回退会让 `lookupPair` 多一次文件读取**：stateRoot 未命中时读 workRoot 的 pair.json。非 worktree 场景两者同路径，故实际只读一次；worktree 场景最多两次。
- **回退读 + upsert 的组合可能产生"两处都有该条目"的短暂状态**：用户从原 worktree 回来 → 回退读到存量 → resume 成功后 upsert 写 stateRoot → 此时 worktree 副本与 stateRoot 各有一份。下次从主仓调用时只读 stateRoot（正确的那份），worktree 副本成为孤儿但不被读取。**孤儿副本不清除**（删除用户文件风险更大），随 worktree 生命周期消亡。
- **D3.3 的安全边界依赖 `workRoot` 不可伪造**：`workRoot` 与回退读目录都必须由 git 推导，实施时**不得**让 `workRoot` 接受任何调用方入参。

## Verification（可勾选验收判据，前瞻）

- [ ] 主仓：`stateRoot == workRoot == <主仓路径>`（**与既有行为逐字节一致**——既有 `pair.json` / `role.json` 路径不变）。
- [ ] linked worktree：`stateRoot` == 主仓路径、`workRoot` == worktree 路径；**在 worktree 里派发一次委托后，主仓的 `.rddf/state/pair.json` 有该条目**（归一前没有）。
- [ ] linked worktree：在 worktree 里派发的委托，其 `git status` 差集能数到 worktree 内的变更（`artifacts > 0`），不再恒为 0。
- [ ] submodule 工作树：`stateRoot` == superproject 工作树路径（**不是** `.git/modules/…`）。
- [ ] 非 git 目录：`stateRoot == workRoot == <目录>`，`vcs=false`（既有行为不变）。
- [ ] **读回退（D3.1 ①）**：存量 pair.json 位于 **workRoot**（模拟归一前的物理位置）且 `canonical_root` 为 worktree 路径 → 从**同一 worktree** 发起 resume → **成功**（证明先读 stateRoot 找不到时会回退读 workRoot）。
- [ ] **读回退的覆盖面如实（D3.2）**：从**另一个 worktree** 或**主仓**发起同一个 resume → **仍未登记**（如实失败，不得伪装成功）；从原 worktree 发起 → 成功。两方向都要有断言。
- [ ] **双值接受（D3.1 ②）**：`canonical_root` 等于本次 `workRoot`（不等于 stateRoot）时 → resume 通过；等于两者都不相等的外部路径 → 拒绝（D3.3）。
- [ ] **存量条目随使用迁移**：从原 worktree resume 成功后，stateRoot 的 pair.json 出现该条目且 `canonical_root == stateRoot`（D4）。
- [ ] 新登记的 pair 条目 `canonical_root` == **stateRoot**（不是 workRoot）。
- [ ] git < 2.31 的环境（或 `--path-format` 不可用时）：归一仍正确（相对路径以调用 cwd 为基准解析）。
- [ ] `bun test tests/` 全绿，且新增用例覆盖三种 git 场景的归一结果。
