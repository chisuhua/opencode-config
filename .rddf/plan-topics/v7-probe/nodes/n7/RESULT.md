# RESULT — n7：失败模式与回滚可达性

> 类别标注：**〔事实〕** = 本仓可直接引用（带 `path:line`）；**〔推断〕** = 由事实推出、本仓无直接断言；**〔git 语义〕** = 外部工具行为，未在本仓核实；**〔建议〕** = 供 archtect 合稿 / 后续实现批消费。
> 输入：n3 已给合并模型（每 wave 一次 `--no-ff --no-commit` + 独立 gated commit）与 6 类冲突（`nodes/n3/RESULT.md:8`、`:131-142`）；n4 已给 15 条判据 / 14 个违规码（`nodes/n4/RESULT.md:73-89`、`:101-116`）。本文**只写失败面与回滚可达性**，不重分类、不重定判据。

## 0. 结论先行

**结论一（失败面）：`build` 多 wave 并行通道的失败面里，真正危险的不是「并行」本身，而是「两条既有机制的缺口被并行放大」——`claim→spawn` 两步无补偿、`reap` 不吊销旧 worker。并行把这两个缺口从「一次浪费」变成「两个写者同时写」。**

**结论二（回滚面）：机制面三步可回滚（照 `plan-topics` 体例可写成清单）；但「已合进主分支的实施 commit」不可能靠清单回退 —— 清单只回退仓库内文本，回退不了 git 历史与分支。⇒ ADR 的回滚口径必须**分两层**写，把「revert -m 1」写成唯一的产物层退路，并强制 merge commit 带 `Wave-Tip:` / `Base:` trailer 作为 revert 的定位件。**

五条硬结论：

| # | 结论 | 一句话理由 |
|---|---|---|
| R1 | 失败模式共 **12 条**，其中 **可机判 5 / 仅显示提示 3 / 不可检出 4** —— 「不可检出」不是遗漏，是归因与活性两类缺口的结构性结果 | 判据只能落在 git 对象与磁盘事实上（`nodes/n4/RESULT.md:6`）；写入者与活性都不在其中 |
| R2 | **最重的三条**都在「在飞 → 收尾」这一小段：`claim-spawn-gap`、`reap-no-revoke`、`subagent-no-stop-evidence` | 三者叠加 = 节点永久不可派 或 两个写者并存，且**都无判据** |
| R3 | 回滚 = **三步**：① 关闸（配置）② 退判据与教学（代码 + prompt + 文档投影）③ 收运行态（worktree / 分支 / 锁）；每步都有命令级判据 | 与 D9/D10 步同构；第 ③ 步是**唯一不可清单化**的部分（运行态不在仓库内） |
| R4 | 回滚条目必须**逐字节钉死 5 类 `find` 串**，且 `replace` 同样钉死 | 只改 `find` ⇒ 未来回滚把旧文本/旧 capability 块写回 ⇒ 派生守卫红（本仓已有该事故形态，`docs/adr/ADR-plan-multi-session-collaboration.md:101`） |
| R5 | 对本仓反哺 **9 条**（第二部分），其中 5 条是 BRIEF 点名项、4 条是本次新踩到的 | 每条都落到「现象 + `path:line` + 建议动作」 |

〔必须上报〕（最重）`claim-spawn-gap` —— `claim` 写 attempt 成功而 `spawn` 失败 ⇒ 节点**永久在飞且不可派**；`claim` 拒重复（`scripts/plan-topic-check.ts:437-440`），而「spawn 失败同回合 close」只有散文（`docs/adr/ADR-plan-multi-session-collaboration.md:358-359`）⇒ 无人值守下会静默饿死整条 DAG 分支（§2 FM-4、§6 F2-01）。

〔必须上报〕（最重）`reap-no-revoke` —— `reap` 只写 `finished_at` + `inputs_reviewed`（`scripts/plan-topic-check.ts:499-511`），**不吊销**旧 subagent session（`docs/adr/ADR-plan-multi-session-collaboration.md:341-346` 自述「同父仍可复活它」）⇒ 人工接管同样留复活窗口 ⇒ 「误接管制造双活体写者」（§2 FM-5、§6 F2-02）。

〔必须上报〕`subagent-no-stop-evidence` —— 若 `build-worker` 走宿主 `subagent`，它连 delegate 那套**停机证据门控**都没有：`docs/adr/ADR-plan-delegate-engineering-session.md:29` 明写 subagent「无登记、无台账、无 workRoot 槽位、**无停机证据门控**、无 scope 越界检测」⇒ 僵尸判定只剩 mtime 显示提示，接管全凭人（§2 FM-3/FM-5、§6 F2-03）。

〔必须上报〕`manifest-cannot-rollback-history` —— 回滚清单的判据是「`find` 恰好 1 次 / `delete` 目标存在」（`.rddf/rollback/README.md:41-47`），对象是**仓库文本**；分支、worktree、已合入的 merge commit 都不在其中 ⇒ 「回滚到现状」这一句若不限定范围，就是一句**做不到的承诺**（§4.1、§6 F2-09）。

〔必须上报〕`lock-leak-live` —— topic 长锁「释放步骤不可执行」已**在盘上发生**：`.rddf/state/plan-topics/e2e-probe.lock/owner` 仍存在（2026-11-20 至今）；根因是 `rmdir` 对含 `owner` 文件的目录必然失败（`prompts/plan.md:280-281`、`docs/adr/ADR-plan-multi-session-collaboration.md:351-353`）（§2 FM-12、§6 F2-04）。

---

## 1. 依据与边界

### 1.1 只消费的前提（不重选）

| # | 前提 | 依据 |
|---|---|---|
| P1 | 一个 wave = 一棵 linked worktree = 一个活跃后端；合并对象是 N 个 branch | `nodes/n2/RESULT.md:175`、`nodes/n3/RESULT.md:27-37` |
| P2 | 合并一律 `--no-ff --no-commit` + 另起一次受门禁的 `git commit`；禁止自动提交 | `nodes/n3/RESULT.md:8`、`:118-127` |
| P3 | 每 wave join 后立即合一次到 `rddf/integ/<topic>`，最后一次性进主分支 | `nodes/n3/RESULT.md:83-97` |
| P4 | 判据面 = 15 条判据 / 14 个新码，`wave_` 前缀，退出码不扩 | `nodes/n4/RESULT.md:73-89`、`:116-120` |
| P5 | 合并记录的 trailer（`Wave-Id` / `Wave-Tip` / `Base` / `Verify-Exit`）是唯一对账件 | `nodes/n3/RESULT.md:137`、`nodes/n4/RESULT.md:82` |

### 1.2 边界

- **不重分类**：冲突的 6 类形态（C-1…C-6）只引用，不重定义（`nodes/n3/RESULT.md:135-142`）。
- **不重定判据**：只写「某失败模式在判据面有没有落点」，落点一律引 n4 的编号（D1–D15）。
- **不执行回滚**：本文只给路径、判据、草案；任何 `bun` / `git` 动作都不在本节点执行。
- 前置缺失处理：n3 / n4 均已产出，故无「前置未定」项。

---

## 2. 失败模式表

> 可检出性三分：**可机判** = 有判据/命令能给出布尔；**仅显示提示** = 有信号但只进 info 或需人读；**不可检出** = 无任何机械信号。

| # | 失败模式 | 触发条件（具体序列） | 可见症状 | 可检出性 | 现行兜底 | 残余风险 |
|---|---|---|---|---|---|---|
| **FM-1** | 并行写冲突（同文件同 hunk） | wave A / B 的 BRIEF 写域重叠；两边都改同一函数；父在 A join 后合 A，再合 B ⇒ `git merge --no-commit` 报冲突 | integ 上 `UU`，index 半合并，`MERGE_HEAD` 存在 | **可机判**（`git status --porcelain` 含 `UU`；n4 D6） | n4 `wave_conflict_residue`（阻断）；n3 C-2 禁止自动解 | 「该保留哪一侧」不可机判；无人裁决时 integ 停在冲突态，下一波可能从脏 integ 切出 ⇒ 连锁 |
| **FM-2** | 合并残留（冲突标记入树 / abort 遗漏） | 手删标记不全 ⇒ `git add -A` + `git commit`（形态仍是受门禁 commit，但 gate 只跑验证，不查标记） | 文件里残留 `<<<<<<<`；测试可能全绿（若该分支未被验证集覆盖） | **仅显示提示**（`grep -n '^<<<<<<<'` 可搜，但无码消费） | 全量验证 + commit-gate 三判据 | 无「冲突标记不得入树」的机判码 ⇒ 只能靠 `bun test` 偶然命中 |
| **FM-3** | 中途中断（wave 后端死亡 / 父会话崩溃） | `claim` → spawn 成功 → 改到一半父崩 / 后端被 kill | worktree 有未提交 diff；attempt 未闭合；节点停在「在飞」 | **部分可机判**（未闭合 attempt + 槽位态 + 差集）；**「还活着吗」仅显示提示**（`lib/plan-topics.ts:852-865`） | `reap --confirm`（`scripts/plan-topic-check.ts:484-486`）；n4 D12 info | 半成品 diff 由谁接手无契约；`finished_at` 无法区分「完工 / 失败」 |
| **FM-4** | 僵尸 worker（claim→spawn 无补偿） | `claim` 成功（写 attempt）→ `subagent` 因 agent 名/深度/权限失败 → 父没 close | 节点永久不可派：`claim` 打印「已有未闭合 attempt」（`scripts/plan-topic-check.ts:437-440`） | 可机判「有未闭合 attempt」；**不可检出**「这是 spawn 失败还是真在跑」 | 手工 `reap --confirm` | 〔推断〕无人值守下静默饿死该节点及其下游整支 |
| **FM-5** | 双活体写者 | ① `reap --confirm` 后立刻重派，旧 worker 仍被同父 `subagent(sessionID=)` 续接；② 父死、子活（子权限是 agent 级静态） | 两方写同一 worktree / 同一 `nodes/<id>/`；后写覆盖前者，diff 无作者 | **不可检出**（git 不记作者；attempt 无 generation） | `reap --confirm` 的人工语义「旧 worker 已死且不再被 resume」（`docs/adr/ADR-plan-multi-session-collaboration.md:145`） | 机制面最硬的洞：接管动作本身制造风险（§6 F2-02） |
| **FM-6** | 孤儿 worktree | `git worktree add` 成功后 spawn 失败 / 收尾忘记 `worktree remove`；或分支已删而树还在 | `git worktree list` 多出 `rddf-wt/*`；目录存在但无占槽者 | **可机判**（list 差 + 目录枚举）；`git worktree prune` 可清 | n4 D14 `wave_worktree_leak` **info**（不阻断） | info ⇒ 无人处理；强制 prune 会连未提交改动一起丢 |
| **FM-7** | 上游语义漂移 | 宿主重构 `permission.ts` 的合并式；或 `sessions.create` 新增 per-session permissions 参数 | ① 语义未变但锚点红（假红 ⇒ 全仓不可提交）② 语义变了锚点绿（漏报） | **仅显示提示**（语义 token 锚点）；「建会话不传 per-session permissions」是否定命题 ⇒ **不可检出**（`docs/adr/ADR-plan-multi-session-collaboration.md:260`） | `scripts/check-upstream-anchors.sh` 30/30 + 人工重估 | 上游若补上该通道，「写域只到 topic 树」的降级理由消失而无人知 |
| **FM-8** | 合并绕门 | 执行者省掉 `--no-commit`（`git merge` 自建 commit）或用 `-X ours` 单侧吞冲突 | integ 出现未经 gated commit 的 merge；或冲突被静默取一侧 | **形态可机判**（双亲 + trailer，n4 D8）；「验证是否真跑过」**不可检出**（trailer 可手写） | n4 `wave_merge_ungated`（阻断）+ `git rev-list --merges` 对账 | `merge-commit-bypass`（`nodes/n3/RESULT.md:21`）在单会话 build 里照样存在，判据只能事后 |
| **FM-9** | 基线漂移 | wave 从 `base0` 切出；期间 main 前进；合入时 integ 已含 `base1` | 干净合入、验证绿，但 wave 的假设已过时 | 可机判「漂移幅度」（`merge-base` vs 声明的 `Base:`）；**当前不可检出**因为 `attempts[].baseline` 是死字段（`lib/plan-topics.ts:50`、`docs/adr/ADR-plan-multi-session-collaboration.md:354`） | 全量验证重跑 + 记录显式标注（n3 C-4） | 漂移 >0 与干净合入在产物上不可区分 ⇒ 审计时被当作一次正常合并 |
| **FM-10** | 收敛伪造 | 父删掉未合 wave 的分支，或从「计划清单」里去掉一项 ⇒ `converged=true` 而 main 缺实现 | 收敛信号绿，交付缺块 | **部分可机判**（`wave_record_missing` 能抓「trailer 指向的分支没了」）；「从未被计划的 wave」**不可检出**（无目标集合载体，`docs/adr/ADR-plan-multi-session-collaboration.md:191`、`:347`） | `summary` 逐条列 `{wave,tip,merge_commit,verify_exit}` 同屏；分支保留策略（`nodes/n3/RESULT.md:246`） | 与 D11 同型的操纵面；不加载体就不可闭合 |
| **FM-11** | 跨 wave 归因缺口（越界写误报/漏报） | 并行两 wave；A 越写域写了某文件；在 B 的 worktree 里跑 `scope-check` | B 报 15+ 条假阳性（`docs/adr/ADR-plan-multi-session-collaboration.md:336` 实测）；真越界被噪声淹没 | **不可检出（归因层面）**；单树差集只判「变了什么」 | n4 D9 单树阻断 / D10 info；并行时**暂不做** `scope-check`（`docs/architecture/plan-topics-topic-model.md:139`） | alert fatigue 会训练父忽略输出 ⇒ 连真越界一并忽略 |
| **FM-12** | 锁泄漏 / 独占失效 | 按 `prompts/plan.md:281` 执行 `rmdir`（目录含 `owner` ⇒ 必失败）；或根本没 `mkdir`（写命令不看长锁） | `.rddf/state/plan-topics/<slug>.lock` 长期存在（实测 `e2e-probe.lock` 自 2026-11-20） | 可机判「锁存在」；「持有者是否活」**不可检出** | 人确认接管（不自动抢占） | 已实测发生；且「仅 owner 可写」**无任何代码路径**（`docs/adr/ADR-plan-multi-session-collaboration.md:351-353`） |

**表的自检**：12 条覆盖 BRIEF 点名的 7 类（并行写冲突 FM-1/2、合并残留 FM-2、中途中断 FM-3、僵尸 worker FM-4、双活体写者 FM-5、孤儿 worktree FM-6、上游语义漂移 FM-7），并补 5 条本次新踩到的（绕门、基线漂移、收敛伪造、归因缺口、锁泄漏）。可检出性三分均出现（5 / 3 / 4），**没有一条写「全部可检出」**。

---

## 3. 可检出性分层：信号落在哪个载体上

| 层 | 载体 | 能判什么 | 判不了什么 | 依据 |
|---|---|---|---|---|
| **L1 git 对象** | ref / merge-base / commit trailer / worktree 目录 | 合过没有、是否重复合、是否双亲、trailer 齐全、漂移幅度 | 谁写的、为什么写、验证是否真跑 | `nodes/n4/RESULT.md:6`、`:82` |
| **L2 台账** | `graph.json` 的 `attempts[]` / pair 槽位态 | 有没有未闭合 attempt、槽位是否被占 | attempt 的真实性（父可手写）、worker 是否还活 | `docs/adr/ADR-plan-multi-session-collaboration.md:301` |
| **L3 磁盘 mtime** | `TODO.md` / `BRIEF.md` | 「多久没动」 | 「是否还活着」 | `lib/plan-topics.ts:852-865` |
| **L4 语义锚点** | `scripts/check-upstream-anchors.sh` 的 token | 上游某语义形状是否仍在 | 否定命题（「不传某参数」）、语义等价改写 | `docs/adr/ADR-plan-multi-session-collaboration.md:260`、`:377` |

〔推断〕**「显示提示」这一档不是中间态，而是设计选择**：L3 与 L4 都被刻意压成提示，因为把提示升成阻断会产生「必然误报的报警器」（`nodes/n4/RESULT.md:26` 的同一裁决）。⇒ 回滚路径里凡是依赖 L3 的判断，都只能是**人确认**，不能写成判据。

---

## 4. 回滚路径（三步，回到「`build` 无并行实施通道」）

### 4.1 先分层：哪些能回滚，哪些不能（这是本节的前提）

| 层 | 内容 | 能否回滚 | 手段 |
|---|---|---|---|
| **L-A 机制面** | 配置 / 代码 / prompt / 文档投影 / 守卫 | ✅ 能 | 清单（`delete` + `edits`），判据 = `rollback-drill --dry-run` exit 0 |
| **L-B 运行态** | worktree / wave 分支 / integ 分支 / 锁目录 / `.rddf/state/build-topics/**` | ✅ 能（但在清单覆盖之外，第 ③ 步手做） | `git worktree remove` / `git branch -d` / `rm -rf`（**须人能跑 reset 的会话**） |
| **L-C 产物面** | 已合入主分支的实施 commit 及其 merge commit | ❌ **不能「回滚」** | 只有 `git revert -m 1 <merge>`；定位件 = trailer |

⇒ **`manifest-cannot-rollback-history`**：回滚清单的能力边界是「仓库文本」（`.rddf/rollback/README.md:41-47`），分支与历史不在其中。ADR 若写「回滚到现状」而不限定层，就是做不到的承诺（`manifest-cannot-rollback-history`）。

### 4.2 三步

**① 关闸：撤派发入口（配置层）**

- **动作**：删 `build-worker` agent 条目；从 `build` 的 `subagent` 白名单里**只摘掉** `build-worker` 一项，保留其其余 enumerate 项（不整条 `allow` 置空 ⇒ 否则连带撤掉既有只读子会话能力）；`front` / `plan` 的白名单不动。
- **落点**：`opencode.jsonc.opencode-go`（`build` 与 `build-worker` 两处）；`scripts/agent-guard-rules.ts` 的 `GUARDED_AGENTS` 摘一项。
- **可验证判据**：
  - `opencode debug agents | grep -c 'build-worker'` ⇒ `0`；
  - `bun test tests/config-guards.test.ts` ⇒ 绿（配置矩阵断言 + agent 闭集断言）；
  - `bun scripts/agent-guard-gen.ts --check` ⇒ 无漂移（`nodes/n4/RESULT.md:76` 同型：生成器与配置同源）。

**② 退判据与教学（代码 + prompt + 文档投影）**

- **动作**：删 `lib/build-waves.ts` / `scripts/build-wave-check.ts` / `tests/build-waves*.test.ts` / `prompts/build-worker.md`；撤 `prompts/build.md` 的「并行 wave 实施」整节与 `capability:build` 机读块中的对应行；撤 3 处文档投影（`docs/MULTI-AGENT-DESIGN.md` 计数行 + 表行 + 卡片、`docs/SUBAGENT-ORCHESTRATION.md` 表行与 §、`.rddf/rollback/registry.json` 条目转 `retired`）。
- **落点**：见 §5 草案的 `delete[]` / `edits[]`。
- **可验证判据**：
  - `bun scripts/rollback-drill.ts .rddf/rollback/build-worker.json --dry-run` ⇒ exit `0`（`find` 恰好 1 次 / `delete` 目标存在 / 无路径重叠）；
  - `git grep -n 'build-worker' -- ':!docs/CHANGELOG.md' ':!.rddf/reviews' ':!.rddf/roadmap'` ⇒ 空（**悬空指针 = 0**）；
  - `bun test tests/` ⇒ 全绿（`plan-delegate` 的教训：只跑绿不代表实质退役，见 `.rddf/rollback/README.md:133`）。

**③ 收运行态（git 面）**

- **动作（按序，每步前置校验不满足就不许往下走）**：
  1. 逐棵 worktree：`git worktree list --porcelain` 取路径 ⇒ 非空 diff 的树**拒绝** `remove`（交人判），干净的树 `git worktree remove <path>`；
  2. 逐个 wave 分支：先 `git merge-base --is-ancestor rddf/wave/<topic>/<id> main` ⇒ **非祖先则拒绝删**（那意味着有未合交付，删 = 丢工作）；
  3. `rddf/integ/<topic>`：全部 wave 已是其祖先**且**是 main 祖先才 `git branch -d`；否则保留并登记；
  4. 锁与运行态：删 `.rddf/state/plan-topics/<slug>.lock/owner` 再 `rmdir`（`prompts/plan.md:281` 的错误就在这里，见 §6 F2-04）；`rm -rf .rddf/state/build-topics/`（已 gitignore）。
- **落点**：`<repo>/rddf-wt/*`、`refs/heads/rddf/*`、`.rddf/state/**`。
- **可验证判据**：
  - `git worktree list` ⇒ 恰 1 行（主树）；
  - `git branch --list 'rddf/*'` ⇒ 空（或有逐条保留理由的登记）；
  - `git status --porcelain` ⇒ 空（不留被 prune 丢掉的未提交改动）；
  - `test ! -e .rddf/state/plan-topics/<slug>.lock` ⇒ 真。
- ⚠ **执行者约束**：这些命令里含 `git reset --hard` / `git clean -fd` / `git branch -D`，在 delegate 后端是 `CONSTANT_DENY`（`lib/delegate-core.ts:49-60`）⇒ **回滚必须由 `build` 主会话执行**；`build-worker` 的 shell 白名单必须**明确 deny** 这三个（否则一个 worker 能抹掉别人的 wave，见 §6 F2-08）。

### 4.3 必须保留 / 必须清理

| 保留（否则审计断裂或套件红） | 清理（否则「退役」是假的） |
|---|---|
| `.rddf/plan-topics/**`（版本化产物，停写即可 · `.rddf/rollback/README.md:141`） | 所有 `rddf-wt/*` worktree |
| 主分支上已合入的实施 commit **与** 其 merge commit 的 trailer（`Wave-Tip` / `Base` 是 revert 的唯一定位件） | wave 分支（仅当已 ancestor）与 `rddf/integ/<topic>` |
| ADR / CHANGELOG / `.rddf/reviews/**`（README:137「退役的是机制，不是决策记录」） | `.rddf/state/plan-topics/*.lock`（含 `owner` 文件）、`.rddf/state/build-topics/**` |
| `tests/commit-gate-d9-registration.test.ts` 等既有守卫载体 | `prompts/build-worker.md` 及三个新代码/测试文件 |
| 退役证据（`retired_at` + `retired_evidence`，清单本身按 README:97 删除） | 文档里对 `build-worker` 的所有正向措辞（含表格/卡片/计数） |

---

## 5. 回滚条目草案（`.rddf/rollback/build-worker.json`）

> **性质**：〔草案／非可执行〕。`find` 里的 `…` 是**省略标记**，落盘前必须展开为整节原文；直接落盘会 0 命中（README:43）。字段形状照 `plan-topics.json`，`retire[]` 走结构化退役（README:45）。

```jsonc
{
  "version": 1,
  "mechanism": "build-worker",
  "adr": "docs/adr/ADR-build-multi-wave-parallel.md",
  "notes": "覆盖面 = 回滚三步：① 撤 `build-worker` agent 条目 + 从 `build` 的 `subagent` 白名单摘掉该项（目标文件 opencode.jsonc.opencode-go）+ `GUARDED_AGENTS` 摘一项；② 删 4 个新文件（lib / scripts / prompts / 两份测试）+ 撤 `prompts/build.md` 的「并行 wave 实施」整节与 capability 行 + 撤 3 处文档投影；③ 运行态（worktree / wave 分支 / integ 分支 / 锁）**不属本清单能力范围**：清单只覆盖仓库文本（README:41-47），分支与已合入 commit 的回退只有 `git revert -m 1`，定位件是 merge commit 的 `Wave-Tip:` / `Base:` trailer。⚠ 已合入主分支的实施 commit **不回退**（那是用户要的代码），退役的是通道。⚠ `docs/MULTI-AGENT-DESIGN.md` 的 agent 计数是手写的 ⇒ 回退时须**重算**（12 → 11），不是还原引入前的旧值（同 plan-topics.json 的教训）。⚠ `scripts/check-upstream-anchors.sh` 的 P1–P6 是上游语义锚点，与本机制退役无关 ⇒ 保留；若本机制新增 P8（build-worker 建会话不传 permissions）则同批删除。",
  "delete": [
    "lib/build-waves.ts",
    "scripts/build-wave-check.ts",
    "prompts/build-worker.md",
    "tests/build-waves.test.ts",
    "tests/build-waves-dag.test.ts",
    "tests/helpers/build-wave-fixture.ts",
    ".rddf/rollback/build-worker.json"
  ],
  "edits": [
    {
      "path": "opencode.jsonc.opencode-go",
      "find": ",\n    \"build-worker\": {\n      …（整块：model / temperature / mode / hidden / description / permission 全量，含 shell 白名单与三段式守卫键）…\n    }",
      "replace": ""
    },
    {
      "path": "opencode.jsonc.opencode-go",
      "find": ",\n        \"build-worker\": \"allow\"\n      }\n    },",
      "replace": "\n      }\n    },"
    },
    {
      "path": "prompts/build.md",
      "find": "#### 并行 wave 实施（`build-worker`）\n…（整节至下一个同级标题前的空行）…\n",
      "replace": ""
    },
    {
      "path": "prompts/build.md",
      "find": "<!-- capability:build -->\n…（机读块原文；含新增的 `subagent: build-worker` 行）…",
      "replace": "<!-- capability:build -->\n…（回滚后的机读块原文）…"
    },
    {
      "path": "tests/config-guards.test.ts",
      "find": "    ).toEqual([\"context-builder\", \"critic\", \"explore\", \"general\", \"metis\", \"oracle\", \"plan-worker\"])",
      "replace": "    ).toEqual([\"context-builder\", \"critic\", \"explore\", \"general\", \"metis\", \"oracle\"])"
    },
    {
      "path": "tests/config-guards.test.ts",
      "find": "  prompts: [\n    …（平铺清单原文，逐项含 \"prompts/build-worker.md\"）…\n  ],",
      "replace": "  prompts: [\n    …（去掉该项后的原文）…\n  ],"
    },
    {
      "path": "docs/MULTI-AGENT-DESIGN.md",
      "find": "- **少而精**：13 个 agent（4 primary：build / front / plan / title + 9 subagent：… / plan-worker / build-worker），每个有明确边界",
      "replace": "- **少而精**：12 个 agent（4 primary：build / front / plan / title + 8 subagent：… / plan-worker），每个有明确边界"
    },
    {
      "path": "docs/MULTI-AGENT-DESIGN.md",
      "find": "| **build-worker** | subagent | build 侧多 wave 并行实施子会话（只推进自己 wave 的分支） | … |\n",
      "replace": ""
    },
    {
      "path": "docs/MULTI-AGENT-DESIGN.md",
      "find": "#### `build-worker` —— build 侧多 wave 并行实施的子会话（ADR-build-multi-wave-parallel）\n…（整张卡片）…\n\n",
      "replace": ""
    },
    {
      "path": "docs/SUBAGENT-ORCHESTRATION.md",
      "find": "| `build-worker` | subagent | … | build 侧多 wave 并行实施 | `prompts/build-worker.md` |\n",
      "replace": ""
    },
    {
      "path": "docs/SUBAGENT-ORCHESTRATION.md",
      "find": "### 2.4 build 侧多 wave 并行实施（`build-worker`）\n…（整节）…\n",
      "replace": ""
    }
  ],
  "drill_env": {
    "seed_files": [
      { "path": ".rddf/state/role.json", "content": "{\n  \"current_role\": \"builder\",\n  \"updated_at\": \"2026-11-27T00:00:00Z\"\n}\n" }
    ]
  },
  "retire": ["build-worker"],
  "verify": { "commands": [["bun", "test", "tests/"]] }
}
```

### 5.1 必须逐字节钉死的 5 类串（以及为什么）

| # | 串 | 位置 | 为什么必须逐字节钉死 | 同型经验 |
|---|---|---|---|---|
| 1 | `build-worker` 的**整个配置块**（含 shell 白名单 40+ 键） | `opencode.jsonc.opencode-go` | 该块由 `scripts/agent-guard-gen.ts` 生成/校验 ⇒ 任何一项被后续实现改动，`find` 就 0 命中 ⇒ **清单立刻红**（不是静默 no-op）；若只钉首尾两行，则中段改动会被漏掉，回滚留下半个 agent | `.rddf/rollback/plan-topics.json` 的 `plan-worker` 块就是整块钉死（`edits[0]`） |
| 2 | `build` 的 `subagent` 白名单项 | 同上 | 它是**一行内的一个键**（`"build-worker": "allow"`）⇒ 钉太短会和其它 agent 的同名键撞（≥2 次命中 ⇒ 无从确定改哪处，README:43）；必须带足够上下文到唯一 | `plan-topics.json` 对 `prompts/plan.md` 的 9 处钉死都是带上下文的唯一串（ADR:329） |
| 3 | `prompts/build.md` 的「并行 wave 实施」**整节** | `prompts/build.md` | 短串 `wave` / `build-worker` 在同一文件多处出现 ⇒ 必须整节（含唯一小标题），否则 `find` 命中 ≥2 次直接拒 | README:47（`find` 是字面串，正则元字符按字面匹配）；ADR:101（该节与 capability 块必须同批钉） |
| 4 | `<!-- capability:build -->` 机读块 | `prompts/build.md` | **`replace` 也必须钉死**：只改 `find` 不改 `replace` ⇒ 未来回滚把**旧** capability 块写回 ⇒ AC23 派生守卫红 | ADR:101 明写这条：「⚠ **replace 也钉死旧路径**：只改 find 会让未来回滚把旧 edit 行写回 ⇒ AC23 派生守卫回滚后撞红」 |
| 5 | 文档计数行 + agent 名单数组 | `docs/MULTI-AGENT-DESIGN.md`、`tests/config-guards.test.ts` | 计数是**手写**的：回退须**重算**为 12（不是还原 11 以外的旧值）；名单数组是**有序字面量**，少一项/换序都会让守卫红 | `plan-topics.json` 的 `notes` 原文：「agent 计数是**手写**的，回退时须重算为 11，**不是**还原成引入前的旧值 10（那个值在引入时就已陈旧，漏算 front）」 |

另两条**不得**用 `edits` 的地方：

- `.rddf/rollback/registry.json` ⇒ **用 `retire[]`**（结构化退役），不钉字符串（README:45 的六条 fail-closed 就是为它设计的；钉字符串会与 `watch[]` 校验打架）。
- `delete` 与 `edits` **不得指向同一路径**（README:44）⇒ `prompts/build-worker.md` 只能出现在 `delete`。

### 5.2 落盘前必须做的三件事

1. 把所有 `…` 展开为**当前 HEAD 的真实原文**（README:51：drill 基于 HEAD，未提交改动不参与 ⇒ 改完清单要先提交）。
2. `bun scripts/rollback-drill.ts .rddf/rollback/build-worker.json --dry-run` ⇒ exit 0（毫秒级、零写盘）。
3. 在 `registry.json` 建条目：`state: "proving"` + `manifest_ref` + `watch[]`（指向 3 个最易漂移的载体：`lib/build-waves.ts` / `scripts/build-wave-check.ts` / `prompts/build-worker.md`）⇒ 演练证据回填后才转 `active`（README:95-103 的自举死锁）。

---

## 6. 对既有 `plan` / `plan-worker` 机制的反哺清单（第二部分）

> 与 n4 的差分：n4 的 F1–F8（`nodes/n4/RESULT.md:168-183`）从**判据设计**角度看这些缺口；本节从**失败面**看，因此新增「失败时谁承担代价」与「并行是否放大」两列，并补 n4 未覆盖的 4 条（F2-03 / F2-06 / F2-08 / F2-09）。

| # | 现象 | 依据 | 建议动作 |
|---|---|---|---|
| **F2-01** | **`claim` → `spawn` 是两步、无补偿**：`claim` 成功即写 attempt ⇒ 节点变「在飞」；`subagent` 因 agent 名/深度/权限失败 ⇒ attempt 仍开 ⇒ 节点永久不可派（`claim` 拒重复），只能人工 `reap --confirm` | `docs/adr/ADR-plan-multi-session-collaboration.md:358-359`、`scripts/plan-topic-check.ts:418-467`（写 attempt 在 `:464-465`）、`:437-440`（拒重复） | 二选一落地：**(a)** `claim --spawn …` 把两步合成一条命令（失败即回滚 attempt）；**(b)** 新增 `abandon-spawn <topic> <node>`（闭合 + `reason: "spawn_failed"`）。**不要只改 prompt** —— 处方已经是散文（`:142`「spawn 失败同回合 close」）且无 CLI |
| **F2-02** | **`reap` 不吊销旧 worker**：只写 `finished_at` + `inputs_reviewed`，无任何吊销动作 ⇒ 同父仍可 `subagent(sessionID=)` 复活 ⇒ 人工接管**同样**留双活体写者窗口（不只是 TTL 路径） | `docs/adr/ADR-plan-multi-session-collaboration.md:341-346`、`:145`、`scripts/plan-topic-check.ts:499-511` | 加 `attempt.generation`（`claim` 递增）+ 产物必须带 `gen` + 判据比对；在此之前**至少**让 `reap` 的输出带一条「旧 worker 未被吊销」告警，使危险出现在父的上下文里（ADR 原话） |
| **F2-03** | **`subagent` 通道没有停机证据门控**：`build-worker` 若走 `subagent`，就继承「无台账 / 无槽位 / 无停机证据 / 无 scope 差集」；僵尸判定只剩 mtime 显示提示 ⇒ 「接管」在机制上永远是猜 | `docs/adr/ADR-plan-delegate-engineering-session.md:29`、`docs/adr/ADR-front-multi-backend.md:197`（`cancel` 的停机证据门控）、`lib/plan-topics.ts:852-865` | 在 ADR 里**显式登记**这条不对称（delegate 有、subagent 没有），并把「接管 = 人确认 + 旧 worker 不再被 resume」写成**唯一的**接管语义；**不要**给 subagent 造第二套停机证据（第二套谓词必然漂移，`ADR-plan-delegate:96` 已否决） |
| **F2-04** | **topic 独占锁零机械强制 + 释放步骤不可执行**：`lock` 是纯只读报告（`:286-320`），写命令只取 graph **短**锁（`:336-372`），全仓无命令 `mkdir` 长锁；`prompts/plan.md:281` 的 `rmdir` 对含 `owner` 的目录必失败 ⇒ **锁已泄漏在盘上** | `docs/adr/ADR-plan-multi-session-collaboration.md:351-353`、`prompts/plan.md:280-281`、`scripts/plan-topic-check.ts:286-320`、`.rddf/state/plan-topics/e2e-probe.lock/owner`（现存） | ① 把「拿锁 + 校验归属」合成一个原子命令（`claim` 内校验，不等即拒 `owner_mismatch`）；② 释放改「先删 `owner` 再 `rmdir`」；③ `lock` 更名 `lock-status`（命名即承诺）；④ 若本期不动 ⇒ D7 与 prompt 必须降级为「协议约定（无机械强制）」并删掉「必须是」类暗示 |
| **F2-05** | **并行下跨 node 污染的不可检出面**：`cmdScopeCheck` 强制 `<node-id>`，`allowedPrefix` 恒为 `nodes/<nodeId>`（`:233`）⇒ 并行时按文档跑会报 15+ 条假阳性 ⇒ 告警被训练成噪声 | `docs/adr/ADR-plan-multi-session-collaboration.md:330-338`、`docs/architecture/plan-topics-topic-model.md:139`、`scripts/plan-topic-check.ts:233-240` | 并行期**明令停用** `scope-check`（已写在 topic-model §10），并在 CLI 加显式拒绝：并行（`in_flight.length > 1`）时 `scope-check` 直接 exit 2「不可判定」，**不要**输出一堆假阳性 —— 错误的输出比没有输出更糟（人学会忽略它） |
| **F2-06** | **`owner` 字段被声明但不消费 + 关闭通道无归属区分**：`owner` 只做枚举校验（`lib/plan-topics.ts:197-199`），`dispatchableNodes` / `cmdClaim` / `deriveStatus` 全不读 ⇒ `owner: "parent"` 的节点被派给 worker；**叠加** F2-01 后出现新后果：父自己的节点若被误 claim 成僵尸，`close` 的授权语义也不区分「父关闭自己的误操作」与「接管他人」 | `docs/adr/ADR-plan-multi-session-collaboration.md:348-350`、`lib/plan-topics.ts:61`、`:197-199`、`scripts/plan-topic-check.ts:418-449`（claim 无 owner 检查） | 与 n4 F1 同一处方（`executor` + `owner_mismatch`，或删字段）；**追加**一条：`close` / `reap` 的输出必须带 `by: "parent" \| "takeover"` 区分，否则回滚审计读不出是谁闭合的 |
| **F2-07** | **`precheck` 是自述式凭据，判据侧从不读**：`claim` 写 `{at, exit, graph_rev}`，checker 零消费，且 `claim` 自注「不因此拒绝」⇒ 「派发前 check 必须 exit 0」无机械强制；从失败面看，这是「派发时图已坏」的唯一留痕，却被判据忽略 | `docs/adr/ADR-plan-multi-session-collaboration.md:356-358`、`scripts/plan-topic-check.ts:455-457` | 改成**闸门**（`preExit !== 0` ⇒ 拒 claim），或删字段；**保留 + 不消费 + 名字像闸门 = 三件坏事同时发生**（ADR 原话） |
| **F2-08** | **失败原因的载体缺失**：attempt 只有 `finished_at`，无法区分「正常完工 / spawn 失败 / reap 接管 / cancel 废弃」⇒ 回滚审计与「谁该负责」都读不出；且 delegate 后端 `CONSTANT_DENY` 封死 `reset --hard` / `clean -fd` / `branch -D`（`lib/delegate-core.ts:49-60`）⇒ 回滚动作只能由主会话执行，但**没有任何字段记录这件事发生过** | `docs/adr/ADR-plan-multi-session-collaboration.md:298`、`:301`、`lib/delegate-core.ts:49-60` | attempt 加 `close_reason: "done" \| "spawn_failed" \| "reaped" \| "cancelled"`（与 F2-01 的 `abandon-spawn` 同批）；`build-worker` 的 shell 白名单**显式 deny** `git reset --hard` / `git clean -f*` / `git branch -D`（不是靠「没在 allow 列表里」这种隐式 deny） |
| **F2-09** | **把「回滚清单」当成「回滚一切」**：清单判据只覆盖仓库文本（`find` / `delete`），而并行机制的运行态（worktree / 分支 / 已合 commit）全在清单之外；ADR 的「三步回到现状」若不限定层，会在真回滚时被发现「形式上成立、实质上半退役」 | `.rddf/rollback/README.md:41-47`、`:126-133`、`docs/adr/ADR-plan-multi-session-collaboration.md:231-234` | ADR 的「回滚口径」写成**两层**：机制面三步（可清单化）+ 产物面一句（`revert -m 1`，定位件 = `Wave-Tip:` / `Base:`）；并写明「已合入的实施 commit 不回退」。判据不是「套件绿」，而是「prompt / 文档 / 守卫是否还在宣称那个能力」（README:133 的实测结论） |

**收敛判断**：F2-01 / F2-02 / F2-08 是**同一条链**（claim 写入 → 无人闭合 → 无原因字段）；F2-03 / F2-04 / F2-05 / F2-06 / F2-07 是**同一类病**（声明在场、消费缺席）；F2-09 是**范畴错误**（把「机制回滚」当「状态回滚」）。⇒ 若只允许做一件事，做 F2-01；若允许做两件，加 F2-02 的告警（不是 generation，那要动 schema）。

---

## 7. 与相邻节点的接口（不越界）

| 交给谁 | 内容 | 依据 |
|---|---|---|
| n5（单槽关系） | 若 `build-worker` 走 `subagent` ⇒ **不占 `workRoot` 槽**，并行合法；但代价是**失去停机证据门控**（`ADR-plan-delegate:29`）⇒ 「并行」与「可停机」在本仓当前是**二选一** | §2 FM-5、§6 F2-03 |
| n2（写隔离） | worktree 隔离只把归因边界抬到「一棵树」，抬不到「一个 wave」⇒ FM-11 不可通过隔离消解 | `nodes/n3/RESULT.md:156` |
| n3（合并语义） | FM-2 / FM-8 / FM-9 的判据落点是 n3 的 trailer 契约；**基线漂移**（FM-9）必须先把 `Base:` trailer 写成硬契约，否则回滚时找不到 reset 目标 | `nodes/n3/RESULT.md:183`、`:232` |
| 合稿 / architect | 回滚口径**必须分两层**写（§4.1）；否则「三步回到现状」是做不到的承诺 | §5.1、§6 F2-09 |

---

## 8. 薄弱点与待父裁决

### 8.1 薄弱点（带稳定 token）

- （最重）`claim-spawn-gap` —— 见 §0 上报与 F2-01；本节点只给处方，不评估实现成本。
- （最重）`reap-no-revoke` —— 见 §0 上报与 F2-02；**「接管」这个动作本身是风险源**，不是缓解手段。
- 【必须上报】`stage3-not-manifestable` —— 第 ③ 步（运行态清理）**不可能**写进回滚清单，因为清单跑在 `git clone` 出来的副本里（README:49），副本里没有 worktree 与锁。⇒ 它必须是 ADR 里的**人工步骤**，并带命令级判据（§4.2 ③）。这是本文最容易被误读成「清单已覆盖」的地方。
- 薄弱点 `verification-is-necessary-not-sufficient`：`bun test tests/` 是本仓唯一真闸门（`docs/adr/ADR-plan-multi-session-collaboration.md:14`），所以 FM-2 的残留标记只能「偶然命中」；本文不声称验证能兜住合并残留。
- 薄弱点 `close-reason-absent`：`finished_at` 的语义歧义（ADR:298）让**回滚审计**读不出真实原因 —— 这是 F2-08 的动因，不是本文新发现。

### 8.2 待父裁决

1. **回滚口径是否接受「两层」写法**（机制面三步 + 产物面一句 revert）？若父要求「一次回滚把主分支也恢复」，那是**另一件事**（要 `reset --hard main` + 强推），与「不回退用户要的代码」冲突，本节点不建议。
2. **F2-01 / F2-02 是否单开节点**？两者都动 `scripts/plan-topic-check.ts` 与 schema，超出本节点「只写失败面」的边界。
3. **第 ③ 步的执行者**：本文定为 `build` 主会话（因 delegate 后端封死 reset/clean/branch -D）。若未来 `build-worker` 需要自清理自己的 worktree，需裁决「worker 能否 `git worktree remove` 自己那棵」（建议：能，但只能删自己那棵，且 `--force` 永久禁止）。
4. **`wave-branch-retention` 的期限**：n3 已定分支不删（`nodes/n3/RESULT.md:246`）；若长期保留，`git branch --list 'rddf/*'` 会持续增长 —— 需要一条归档策略（本文不展开）。

---

## 9. 自检（对照 BRIEF 验收口径）

| BRIEF 要求 | 本文落点 | 状态 |
|---|---|---|
| 失败模式 ≥6 条，每条含 6 列 | §2 共 12 条，列齐全 | ✅ |
| 覆盖并行写冲突 / 合并残留 / 中途中断 / 僵尸 worker / 双活体写者 / 孤儿 worktree / 上游漂移 | FM-1/2、FM-2、FM-3、FM-4、FM-5、FM-6、FM-7 | ✅ |
| 可检出性三分，不得全写「可检出」 | 5 可机判 / 3 仅显示提示 / 4 不可检出；§3 给分层 | ✅ |
| 回滚三步，每步有可验证判据 | §4.2（命令 / 断言级，非「检查一下」） | ✅ |
| 说明哪些落盘产物必须保留 / 必须清理 | §4.3 双列表 | ✅ |
| 回滚条目草案（`edits[]` / `notes` / `retire[]`） | §5 JSONC 草案 + `drill_env` / `verify` | ✅ |
| 指明哪些 `find` 必须逐字节钉死 + 原因 + 同型经验 | §5.1 五类 + 两条禁用 `edits` 处；引 README:43/44/47、ADR:101、`plan-topics.json` notes | ✅ |
| 反哺清单第二部分 ≥4 条，现象 + path:line + 建议动作 | §6 共 9 条，含 BRIEF 点名的 5 项 | ✅ |
| ≥8 处 `path:line` | 全文 40+ 处 | ✅ |
| 正文 ≥100 行 | 本文件 ≫100 行 | ✅ |
| 结论先行 | §0（五条硬结论 + 五条上报） | ✅ |

## STATUS: COMPLETE
