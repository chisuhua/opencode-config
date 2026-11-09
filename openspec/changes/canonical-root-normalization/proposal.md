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

1. 把 ADR 的 Verification 1–9 收敛为 AC 编号，给出**可逆的映射表**（ADR 条目 ↔ AC），供 ADR 元数据回填。
2. 每条 AC 标明**最低可接受证据**与可直接复制的**证据命令**。
3. 明确 Out of Scope 与"Notes to verifier"（已披露残留），避免把有意取舍判成失败。

## 证据规则（先于 AC 生效）

1. **E2E 默认全 skip**（`E2E_REAL_RUNTIME` 未设置时 bats 退出码 0）。**skip ≠ pass**：E2E 未实际执行时，该 AC 判**不可判定**，禁止判通过；须改用该 AC 的"降级证据"。
2. **证据类型只有三种**：`单测`（`bun test tests/`）、`E2E`（真实运行时 + 真实模型）、`静态`（配置/`git show`/`grep`/构造 git 场景的 shell 命令）。**不设"人工"类型**——verifier 契约要求每条判据至少 1 条工具证据。
3. **git 场景必须真构造**：worktree / submodule 判据需要 verifier **实际创建**这些 git 结构（`git init` / `git worktree add` / `git submodule add`），不得以"按代码推断"代替。
4. **git 版本记录**：AC9 依赖 `--path-format=absolute`（需 git ≥ 2.31）。verifier 须先记录 `git --version`；若低于 2.31，AC9 判**不可判定**并改用降级证据。
5. **`opencode debug agents` 首跑可能非 JSON**（location 激活竞争）：重试 ≤3 次或截取首个 `[` 到末尾 `]`。

## 验收标准

### A. 归一判别式（stateRoot / workRoot）

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC1** | **主仓场景零行为变化**：`stateRoot == workRoot == <主仓路径>`；pair/role/ledger 仍落在主仓 `.rddf/state/` | 单测（`canonicalRoot` 主仓用例）；静态：构造主仓 → `git rev-parse` 三口径对照 |
| **AC2** | **linked worktree 下 pair.json 落主仓**：在 worktree 里派发一次委托后，**主仓**的 `.rddf/state/pair.json` 有该条目（归一前没有） | E2E（worktree 里跑 `delegate`）；降级：单测（`canonicalRoot` worktree 用例断言 stateRoot=主仓） |
| **AC3** | **worktree 内变更可见**（`artifacts` 不再恒 0）：在 worktree 里改动一个受 scope 约束的文件 → 本轮 `artifacts > 0` | E2E（worktree 内真实交付）；降级：单测（`gitStatusPaths` 在 workRoot 执行） |
| **AC4** | **submodule 归一到 superproject**：`stateRoot` == superproject 工作树路径（**不是** `.git/modules/…`） | 单测（`canonicalRoot` submodule 用例）；静态：构造 submodule → 三口径对照 |
| **AC5** | **非 git 目录**：`stateRoot == workRoot == <目录>`，`vcs=false`（既有行为不变） | 单测（既有非 git 用例） |
| **AC6** | **三个用途分别绑定**：pair/role/ledger 用 stateRoot；`git status` 差集与 `scope` 解析用 workRoot | 静态：`lib/delegate-core.ts` 中 `canonicalRoot` 的调用点逐个核对；单测（scope 解析基准） |
| **AC7** | **git 版本回退路径**：git < 2.31 或 `--path-format` 不可用时，归一仍正确（相对路径以**调用 cwd** 为基准解析，不以进程 cwd） | 单测（回退分支用例，mock `execFileSync` 返回相对路径） |

### B. 兼容与回归

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC8** | **resume 双值接受**：传入归一前登记的（worktree 路径）`canonical_root` 的 session → **仍可续接**；新登记条目的 `canonical_root` == **stateRoot**（不是 workRoot） | 单测（resume 双值用例 + 新登记字段断言） |
| **AC9** | **跨仓冒充不成立**：用一个**不属于本仓**的路径作 `canonical_root` → resume 被拒 | 单测（跨仓 path 被拒用例） |
| **AC10** | **既有判据无回归**：`bun test tests/` 全绿；既有 `canonical_root` 不匹配被拒的用例**仍通过**（语义从"单值相等"变为"stateRoot 或 workRoot 任一相等"，但**跨仓**仍拒——见 AC9） | 单测（`bun test tests/`） |
| **AC11** | **文档同步**：架构文档 §4.3 的 canonical 口径、dual-session 手册的 canonical_root 说明已更新为 stateRoot/workRoot 双根 | 静态：`grep` 核对 `docs/front-delegate-architecture.md` / `docs/dual-session-delegation.md` |
| **AC12** | **上游语义锚定**：归一函数依赖的三个 git 输出（`--show-toplevel` / `--path-format=absolute --git-common-dir` / `--show-superproject-working-tree`）在**装好的 opencode 所在环境**实测取值符合本 AC 的判据（尤其 submodule 的 common-dir 指向 `.git/modules/…`、非 submodule 的 superproject 为空串） | 静态：shell 构造三场景 + `git rev-parse` 实测 |

## AC ↔ ADR Verification 映射

| ADR-canonical-root-normalization Verification | AC |
|---|---|
| 1（主仓 stateRoot == workRoot，零行为变化） | **AC1**（+ AC5 非 git、AC6 用途绑定） |
| 2（worktree 下 pair.json 落主仓） | **AC2** |
| 3（worktree 内 artifacts > 0） | **AC3** |
| 4（submodule 归一到 superproject） | **AC4**（+ AC12 上游锚定） |
| 5（非 git 目录不变） | **AC5** |
| 6（resume 双值接受） | **AC8**（+ AC9 跨仓冒充不成立） |
| 7（新登记只写 stateRoot） | **AC8**（后半） |
| 8（`bun test` 全绿 + 三场景用例） | **AC10** |
| 9（git 版本回退路径） | **AC7** |

> 扩展项（非 Verification 原文）：**AC6**（三个用途分别绑定）、**AC11**（文档同步）、**AC12**（上游语义锚定）。

## Notes to verifier（不参与通过/失败判定）

- **N1 已知残留 —— `.git` 为文件（非目录）的 submodule 形态未实测**：本 AC 覆盖的是 `git submodule add` 产生的标准形态（common-dir 指向 `.git/modules/…`）。若用户环境用 `.git` 文件指向别处的 submodule，归一结果**未经实测**，不得因此判 AC4 失败，但也**不得**声称已覆盖。
- **N2 已知残留 —— git 版本回退未在真实旧版 git 上实跑**：AC7 用 mock 覆盖逻辑分支。真实 git < 2.31 环境的行为未验证。
- **N3 环境依赖 —— E2E 需真实模型与可用 provider**：额度不足时用 AC 的降级证据（静态/单测），并把"E2E 不可执行"如实记录，**不判失败也不判通过**。

## Out of Scope

1. **状态文件的存量迁移** —— ADR D4 已明确"不写迁移脚本"：pair.json 每工程一份且通常被 gitignore，遍历所有工程 worktree 的收益远小于误改运行时状态的风险。AC8 的双值接受已覆盖存量。
2. **`stateRoot` / `workRoot` 之外的第三根** —— 本次不引入。
3. **worktree 隔离方案**（每后端一个 worktree）—— 属 `ADR-front-multi-backend` D6 的第二步，**后置**。
4. **pair.json 过期清理策略** —— 属既有 backlog（`docs/front-delegate-architecture.md` §9 #3），不在本次范围。

## 风险

- **证据类型不均**：AC2/AC3 的核心部分依赖 E2E（真实 worktree + 真实模型）；无 provider 时降级为单测，验收强度下降（已由"证据规则 1/3"约束，不允许 skip 当 pass）。
- **AC12 是环境锚定判据**：它证明的是"装好的这台机器上三个 git 输出符合预期"，不是"所有 git 版本都如此"。上游 git 行为变更时该 AC 会先红。
- **AC10 是回归判据**：语义从"单值相等"放宽为"任一相等"（ADR D3），实现时若误把放宽做成"只比 workRoot"，AC8 与 AC9 会分别暴露。
