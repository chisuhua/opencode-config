# proposal: canonical-root-normalization

## 背景

ADR `docs/adr/ADR-canonical-root-normalization.md`（Accepted）描述的是一批**未实施**的改动：状态文件根归一（worktree / submodule）+ `stateRoot` / `workRoot` 拆分。

`lib/delegate-core.ts` 的 `canonicalRoot()` 用 `git rev-parse --show-toplevel`，而 `prompts/build.md:195,199` 要求按 `git rev-parse --git-common-dir` 归一 —— **口径不一致，且不一致的那一处是真 bug**：

- **linked worktree 下**：状态文件（pair/role/ledger）落进 worktree 工作树副本，主仓读不到 ⇒ 两份状态物理分裂 ⇒ resume 校验查无此条。
- **submodule 下**：直接取 `dirname(--git-common-dir)` 会得到 `.git/modules/vendor` 这种非工作区路径。
- 且 `git status` 若在主仓跑，数不到 worktree 内的变更 ⇒ `artifacts` 恒为 0 ⇒ `no_work_evidence` **系统性误报** `unverified`。

本 change 的唯一目的是**把该 ADR 的行为固化为可被 verifier 逐条判定的 AC**。

前置事实：3 种 git 场景的实测（探针 P4），见 `.rddf/reviews/front-multi-backend-probes.md`。

## 目标

1. 把 ADR 的 Verification 1–12 收敛为 AC 编号，给出**可逆的映射表**（ADR 条目 ↔ AC），供 ADR 元数据回填。
2. 每条 AC 标明**最低可接受证据**与可直接复制的**证据命令**。
3. 明确 Out of Scope 与"Notes to verifier"（已披露残留），避免把有意取舍判成失败。

## 证据规则（先于 AC 生效）

1. **E2E 默认全 skip**（`E2E_REAL_RUNTIME` 未设置时 bats 退出码 0）。**skip ≠ pass**：E2E 未实际执行时，该 AC 判**不可判定**，禁止判通过；须改用该 AC 的"降级证据"。
2. **证据类型只有三种**：`单测`（`bun test tests/`）、`E2E`（真实运行时 + 真实模型）、`静态`（配置/`debug agents`/`git show`/`grep`/构造 git 场景的 shell 命令）。**不设"人工"类型**——verifier 契约要求每条判据至少 1 条工具证据。
3. **git 场景必须真构造**：worktree / submodule 判据需要 verifier **实际创建**这些 git 结构（`git init` / `git worktree add` / `git submodule add`），不得以"按代码推断"代替。
4. **权限与配置文件写实际生效路径**：`opencode.jsonc` 是**符号链接** → `opencode.jsonc.opencode-go`。静态证据必须解析到后者（`readlink -f`），否则改错文件而证据仍绿。
5. **git 版本记录**：AC7 依赖 `--path-format=absolute`（需 git ≥ 2.31）。verifier 须先记录 `git --version`；若低于 2.31，AC7 判**不可判定**并改用降级证据。
6. **单测注入点**：AC7 需要 mock git 输出。`canonicalRoot` 直接 import 了 `node:child_process`，**无注入点** ⇒ 实现必须在 AC7 之前提供可注入的 `gitRunner`（默认 `execFileSync`），否则该 AC 的证据做不出来（不得用 `mock.module` 全局替换——会污染同文件的 `gitRepo()` 夹具）。
7. **`opencode debug agents` 首跑可能非 JSON**（location 激活竞争）：重试 ≤3 次或截取首个 `[` 到末尾 `]`。

## 验收标准

### A. 归一判别式（stateRoot / workRoot）

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC1** | **主仓场景零行为变化**：`stateRoot == workRoot == <主仓路径>`；pair/role/ledger 仍落在主仓 `.rddf/state/` | 单测（`canonicalRoot` 主仓用例）；静态：构造主仓 → `git rev-parse` 三口径对照 |
| **AC2** | **linked worktree 下 pair.json 落主仓**：在 worktree 里派发一次委托后，**主仓**的 `.rddf/state/pair.json` 有该条目（归一前没有） | E2E（worktree 里跑 `delegate`）；降级：单测（`canonicalRoot` worktree 用例断言 stateRoot=主仓） |
| **AC3** | **worktree 内变更可见**（`artifacts` 不再恒 0）：在 worktree 里改动一个受 scope 约束的文件 → 本轮 `artifacts > 0` | E2E（worktree 内真实交付）；降级：单测（`gitStatusPaths` 在 workRoot 执行） |
| **AC4** | **submodule 归一到 superproject**：`stateRoot` == superproject 工作树路径（**不是** `.git/modules/…`） | 单测（`canonicalRoot` submodule 用例）；静态：构造 submodule → 三口径对照 |
| **AC5** | **非 git 目录**：`stateRoot == workRoot == <目录>`，`vcs=false`（既有行为不变） | 单测（既有非 git 用例） |
| **AC6** | **三个用途分别绑定**（逐点清单，不得只判"调用了两个根"）：① `registerSession`/`lookupPair`/`appendLedger` 的落盘目录用 **stateRoot**；② `gitStatusPaths`（委托前后 diff）用 **workRoot**；③ `scopeEditRules`/`scopeAbsolutePaths` 的相对基准用 **workRoot**；④ `buildBrief` 里的「工程根」与 summary 的 `project_root` 用 **workRoot**（对被派发方可见的是它实际工作的目录） | 静态：逐点核对调用点（`lib/delegate-core.ts:663` 的 `root` 变量分派到上述 6 处）；单测（scope 解析基准 + `buildBrief` 文本断言） |
| **AC7** | **git 版本回退路径**：git < 2.31 或 `--path-format` 不可用时，归一仍正确（相对路径以**调用 cwd** 为基准解析，不以进程 cwd） | 单测（注入 `gitRunner` 返回相对路径，断言归一结果） |

### B. 兼容与回归

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC8** | **读回退（D3.1 ①）**：`lookupPair` 先查 `stateRoot`，找不到再查 `workRoot`。存量 pair.json 物理位于 workRoot，只查 stateRoot 会**在比较 `canonical_root` 之前**就"未登记" | 单测（构造 pair.json 位于 workRoot + 从同一 worktree 发起 → resume 成功） |
| **AC9** | **双值接受（D3.1 ②）**：`canonical_root` 与本次的 `stateRoot` **或** `workRoot` 任一相等即通过 | 单测（等于 workRoot 而非 stateRoot 的存量值 → 通过） |
| **AC10** | **读回退的覆盖面如实（D3.2）**：从**同一 worktree** 回来 → 成功；从**另一个 worktree** 或**主仓**回来 → **仍未登记**（如实失败，不得伪装成功）。两方向都要断言 | 单测（三个位置各跑一次 resume，断言前成功、后两者失败） |
| **AC11** | **存量条目随使用迁移（D4）**：从原 worktree resume 成功后，**stateRoot** 的 pair.json 出现该条目且 `canonical_root == stateRoot` | 单测（resume 后读 stateRoot 的 pair.json） |
| **AC12** | **新登记只写 stateRoot**：新登记的 pair 条目 `canonical_root` == **stateRoot**（不是 workRoot），文件落在 stateRoot 的 `.rddf/state/` | 单测（新登记字段 + 文件路径断言） |
| **AC13** | **跨仓冒充不成立（D3.3）**：用一个**不属于本仓**的路径作 `canonical_root` → resume 被拒（证明两层机制放宽的是同仓内路径变体与同 worktree 读取位置，不是身份边界） | 单测（跨仓 path 被拒用例） |
| **AC14** | **既有判据无回归**：`bun test tests/` 全绿；既有 `canonical_root` 不匹配被拒的用例**仍通过** | 单测（`bun test tests/`） |
| **AC15** | **文档同步**：架构文档 §4.3 的 canonical 口径、dual-session 手册的 canonical_root 说明、**`prompts/build.md:195,199` 的归一规则**均已更新为 stateRoot/workRoot 双根，且明确「superproject 优先」 | 静态：`grep` 核对三处文档 |
| **AC16** | **build agent 与插件口径一致**：`prompts/build.md` 的归一规则必须与 `canonicalRoot()` 实现**逐条同构**（尤其 superproject 优先），否则 submodule 下 build agent 会去 `.git/modules/…` 找 role.json 而插件写到 superproject 工作树 —— 同一个 bug 在 prompt 侧原地保留 | 静态：对照 `prompts/build.md` 的归一描述与 `lib/delegate-core.ts::canonicalRoot` 的分支 |
| **AC17** | **上游语义锚定**：归一函数依赖的三个 git 输出（`--show-toplevel` / `--path-format=absolute --git-common-dir` / `--show-superproject-working-tree`）在**装好的环境**实测取值符合本 AC 的判据（尤其 submodule 的 common-dir 指向 `.git/modules/…`、非 submodule 的 superproject 为空串） | 静态：shell 构造三场景 + `git rev-parse` 实测 |
| **AC18** | **可注入的 gitRunner**：`canonicalRoot` 接受可选 `gitRunner` 参数（默认 `execFileSync`），供单测注入失败/相对路径场景 | 静态：导出签名含该参数；单测（注入用例） |

## AC ↔ ADR Verification 映射

| ADR-canonical-root-normalization Verification | AC |
|---|---|
| 1（主仓 stateRoot == workRoot，零行为变化） | **AC1**（+ AC5 非 git、AC6 用途绑定） |
| 2（worktree 下 pair.json 落主仓） | **AC2** |
| 3（worktree 内 artifacts > 0） | **AC3** |
| 4（submodule 归一到 superproject） | **AC4**（+ AC17 上游锚定） |
| 5（非 git 目录不变） | **AC5** |
| 6（**读回退**：存量 pair.json 物理在 workRoot） | **AC8**（读回退）+ **AC10**（覆盖面如实） |
| 7（**双值接受**：存量 `canonical_root` 是 worktree 路径） | **AC9**（双值接受）+ **AC13**（跨仓冒充不成立） |
| 8（新登记只写 stateRoot） | **AC12** |
| 9（存量条目随使用迁移） | **AC11** |
| 10（`bun test` 全绿 + 三场景用例） | **AC14** |
| 11（git 版本回退路径） | **AC7**（+ AC18 gitRunner 注入点） |
| 12（**build agent 与插件口径一致**） | **AC15**（文档同步）+ **AC16**（两侧同构） |

> **Verification 6–9 是本轮 metis 审查后重新拆分的**：原 ADR 只按"双值接受"写一条，实际需要**读回退**（存量文件物理在 workRoot）+ **双值接受**（存量字段是 worktree 路径）+ **覆盖面如实声明**（只覆盖从同一 worktree 回来）三件事。ADR D3.1–D3.3 已按此重写。
>
> 扩展项（非 Verification 原文）：**AC6**（三个用途的逐点绑定清单）、**AC12**（新登记只写 stateRoot 的独立判据）、**AC13**（跨仓冒充不成立）、**AC18**（可注入 gitRunner）。

## Out of Scope

1. **状态文件的批量迁移脚本** —— ADR D4 已明确"不写"：pair.json 每工程一份且通常被 gitignore，遍历所有工程 worktree 的收益远小于误改运行时状态的风险。ADR D3.1 的两层机制（读回退 + 双值接受）覆盖"从同一 worktree 回来"这一实际恢复路径；AC11 判"存量条目随使用自然迁移"。
2. **扫描所有 worktree 目录以覆盖全部存量位置** —— ADR 选项表已否决（把"读一个文件"变成"遍历未知数量的目录"，代价与风险不对称）。见 ADR D3.2 的实测覆盖面表。
3. **`stateRoot` / `workRoot` 之外的第三根** —— 本次不引入。
4. **worktree 隔离方案**（每后端一个 worktree）—— 属 `ADR-front-multi-backend` D6 的第二步，**后置**。
5. **pair.json 过期清理策略** —— 属既有 backlog（`docs/front-delegate-architecture.md` §9 #3），不在本次范围。

## 风险

- **证据类型不均**：AC2/AC3 的核心部分依赖 E2E（真实 worktree + 真实模型）；无 provider 时降级为单测，验收强度下降（已由"证据规则 1/3"约束，不允许 skip 当 pass）。
- **AC17 是环境锚定判据**：它证明的是"装好的这台机器上三个 git 输出符合预期"，不是"所有 git 版本都如此"。上游 git 行为变更时该 AC 会先红。
- **AC14 是回归判据**：语义从"单值相等"放宽为"读回退 + 任一相等"（ADR D3.1），实现时若只做其中一层，AC8 或 AC9 会分别暴露。
- **AC10 是"覆盖面如实"判据**：它要求**失败方向也有断言**（从别的 worktree/主仓回来必须仍"未登记"）。这是防止实现者为了让测试变绿而偷偷加"扫描所有 worktree"——那会违反 ADR 的取舍。
- **`prompts/build.md` 的 superproject 优先规则缺失**：该文件只写「`git rev-parse --git-common-dir` 归一」，没有 superproject 优先。AC15/AC16 要求补齐，但 `prompts/build.md` 是治理面文件（architect 归属），**builder 实施时能否直接改需确认**。
- **回退读会多一次文件读取**：非 worktree 场景 stateRoot == workRoot，实际只读一次；worktree 场景最多两次。可接受（非热路径）。

## Notes to verifier（不参与通过/失败判定）

- **N1 已知残留 —— `.git` 为文件（非目录）的 submodule 形态未实测**：本 AC 覆盖的是 `git submodule add` 产生的标准形态（common-dir 指向 `.git/modules/…`）。若用户环境用 `.git` 文件指向别处的 submodule，归一结果**未经实测**，不得因此判 AC4 失败，但也**不得**声称已覆盖。
- **N2 已知残留 —— superproject 本身是 worktree 的组合未测**：`superproject → worktree` 的嵌套场景，stateRoot 会取 superproject 的 worktree 路径（状态又可能分裂）。探针 P4 只测三种基础形态，不得要求 AC4 覆盖该组合。
- **N3 已知残留 —— 符号链接路径未测**：`--show-toplevel` 返回 realpath，而 `path.resolve` 不解析符号链接。在符号链接目录下 AC1 的"逐字节一致"可能误红（Linux 少见，macOS 常见）。verifier 遇到时应记 N3，不判失败。
- **N4 已知残留 —— git 版本回退未在真实旧版 git 上实跑**：AC7 用注入 `gitRunner` 覆盖逻辑分支；真实 git < 2.31 环境的行为未验证。
- **N5 环境依赖 —— E2E 需真实模型与可用 provider**：额度不足时用 AC 的降级证据，并把"E2E 不可执行"如实记录，**不判失败也不判通过**。
- **N6 已知残留 —— 存量覆盖只到"从同一 worktree 回来"**（ADR D3.2 实测表）：从其他 worktree / 主仓 / 已删除的 worktree 回来仍"未登记"，**与修复前一致，不引入回归**。AC10 明确要求该方向**如实失败**，verifier 不得把"失败"当成 bug。
- **N7 已知残留 —— 孤儿 pair.json 副本不清除**（ADR D4 风险章）：resume 成功后 worktree 副本与 stateRoot 各有一份，前者成孤儿但不被读取。删除用户文件风险更大，故保留。
