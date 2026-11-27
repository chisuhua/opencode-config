# RESULT — n6：与 `rdd-builder` P2 worktree 模式的关系

> 类别标注：**〔事实〕** = 本仓文件可直接引用（带 `path:line`）；**〔上游语义〕** = rdd-builder 的产品侧语义，**未在本仓核实**；**〔推断〕** = 由事实推出、本仓无直接断言；**〔建议〕** = 供父会话 / m1 参考。

## 0. 结论先行

**〔建议·单一推荐〕关系是「复用」，不是「并存」（指第二套 worktree 机制），也不是「替代」。**

准确表述：**新通道把 P2 的 worktree 模式当作唯一的 worktree 生命周期，只在其上加一层「编排层」（决定建几个、何时建、派给谁、何时收）；P2 的准备步骤在 wave 路径上由编排者前置完成，因而已有前置条件（`worktree context 已设`）让 backend 跳过重复准备。两者是同一机制的两个入口，不是一个机制的两份实现。**

三条可分别核对的布尔量：

| 命题 | 值 | 依据 |
|---|---|---|
| P2 的产物/落点/门控可以被 wave 通道沿用，而不必新造 | **真** | `prompts/build.md:413`（`worktree context 已设` 本就是 `execute` 的前置）、`prompts/build.md:204-208`（stateRoot/workRoot 双根）、`prompts/build.md:315`（`iteration.json` 的 `in_worktree`） |
| P2 能被 wave 编排器**当函数调用** | **假**（当前形态） | P2 是 LLM 阶段 + 每 change 的 HARD pause（`prompts/build.md:428`），本仓无任何 worktree 脚本（`scripts/` 仅 `git worktree list` 一条读命令，`scripts/agent-guard-rules.ts:28`） |
| P2 能在本仓被**核实** | **假** | 本仓 `skills/` 只有 `cpp-pro`（glob 实测）；`rdd-builder` 只出现在 `scripts/rdd-skills.sh:56` 的**兜底清单**里，`installed: true` 取决于 `~/.agents/skills`，本会话 `external_directory` 为 deny ⇒ 无法核实 |

（最重）`p2-unverifiable-upstream` —— **本节点所有「P2 做什么」的断言都只能到本仓的「语义落点」层**，到不了 SKILL.md 的步骤层。任何以「P2 会替我们做 X」为前提的方案都必须先补这一步核实，否则是拿未验证的上游行为当判据。

## 1. rdd-builder P2 现状

### 1.1 可核实性声明（先立规矩，再谈内容）

- 〔事实〕`rdd-builder` 属 rdd-workflow 产品侧 skill。本仓只做**探测**：`scripts/rdd-skills.sh` 把 `rdd-builder` 列在内置兜底清单（`scripts/rdd-skills.sh:56`），并明说清单「正常路径下不参与判定」（`scripts/rdd-skills.sh:30-34`）。
- 〔事实〕可用性的最终裁决在 `skill` 工具，脚本只是预筛（`prompts/build.md:405`）。
- 〔事实〕本仓项目级 `skills/` 下只有一个无关技能 `cpp-pro`（glob 实测：`skills/cpp-pro/SKILL.md`），**没有** `skills/rdd-workflow/skills/rdd-builder/`。
- ⇒ **〔上游语义〕之后的每条 P2 步骤描述都不带 `path:line`**，只带本仓的「语义落点」引用。BR-011（验收口径）要求「不得编造 `path:line`」，本节点严格执行。

唯一可引的上游文本是**本仓转述**：`docs/rdd-workflow-product-issues.md:138-140` 引了 `skills/rdd-builder/SKILL.md:291`、`:401-403` 两处。这是**二手引用**（本仓作者读上游后记录），只能证明「上游 SKILL.md 有这些行」，不能证明这些行现在还是这个语义。

### 1.2 本仓能确认的 P2 事实

| # | 事实 | 引用 |
|---|---|---|
| F1 | `builder` 的内置流程包含「**worktree 或轻量执行**」——即 P2 有**两种形态**，worktree 不是唯一路径 | `prompts/build.md:413` |
| F2 | 下游 `execute` 的前置条件是「`.rddf/plans/<name>.md` 已存在 **+ worktree context 已设（或 lightweight 模式）**」——**「已设」意味着可以由别人设**，这是复用的接口面 | `prompts/build.md:413` |
| F3 | `.rddf/plans/**` 是 P1 产物（TDD 5 步计划），本仓现存 3 份且首行自述「builder 产出」 | `docs/guard-authoring.md:222`、`.rddf/plans/plan-multi-session-collaboration.md:1`、`:19` |
| F4 | P0 与 P2.5 是 **HARD pause**：用户必须显式选择，agent 不得替用户拍板 | `prompts/build.md:428` |
| F5 | P2 **没有** commit gate（v5 起删除）；commit 义务被挪到归档前由 `archive.sh::check_worktree_commits` 强制 | `prompts/build.md:429` |
| F6 | P2 完成后 `iteration.json` 中该 change 的 `status ∈ {in_worktree, completed}`，这是 P3 归档门与本地验收的**读入面** | `prompts/build.md:315`、`:329` |
| F7 | worktree 场景下状态文件落 `stateRoot`（主仓），差集与 scope 解析用 `workRoot`（worktree）；两根本仓有唯一判别式 | `prompts/build.md:204-208` |
| F8 | 同一仓要并行，本仓既有口径是「**先准备独立工作树**再分别 `dispatch` 到各自目录，否则同一工作树只能串行」 | `prompts/front.md:78` |
| F9 | `build` 主会话的 `shell` 首键 `"*": "allow"` ⇒ `git worktree add` 不需要插件门控；但 `git branch -D` / `rm -r` 是 `ask` | `opencode.jsonc:58-101`、`:81`、`:84-87` |

### 1.3 P2 到底「做了什么准备」——本仓可确认的边界

〔事实〕P2 的可核实**产物面**只有三样：

1. **一个 worktree + 一个分支**（形态由 F1 给出，具体命令/命名属上游语义）；
2. **`iteration.json` 的 change 状态**从前置态推进到 `in_worktree`（F6）；
3. **实施期间不设 commit gate**（F5）⇒ P2 结束时工作区可能**未提交**。

〔事实〕P2 的**执行者**是 `builder` 角色（可能就是 `build` 主会话本身，也可能是被派发的 `build` 后端 —— 本仓两种都能跑，见 `lib/delegate-core.ts:105` 的 `ALLOWED_AGENTS` 含 `build`）。

〔上游语义〕P2 通常还包含「按 change 名派生 branch 名」「把 change 标成 in_worktree」「HARD pause 让用户确认隔离策略」等；**这些不在本仓核实范围内**，本节点不以它们为依据。

### 1.4 「配额」在本仓的实际含义

〔事实〕本仓能核实的「配额」只有两条，**都与 P2 无关**：

- `workRoot` 单槽：同一工作树同一时刻只有一个占槽后端；**同一仓的 linked worktree 各自一槽**（`lib/delegate-core.ts:151-169`）。
- 全局活跃后端上限默认 **3**，可用 `RDDF_MAX_ACTIVE_BACKENDS` 覆盖（`lib/delegate-async.ts:95-101`）。

〔推断〕P2 自身若带「worktree 数量配额」，本仓**零引用**（全文 grep `worktree` 无配额相关命中）⇒ 不能把「P2 有配额」写成事实。新通道的并发上界只能来自上面两条，这与 n5 的结论一致。

## 2. 可复用点（每条给复用方式 + 代价）

| # | 复用机制 | 复用方式 | 代价 / 限制 |
|---|---|---|---|
| R1 | **worktree 作为隔离单位**（每树一槽、每树一角色租约） | wave 不新建槽位表：1 wave = 1 linked worktree = 1 后端，`slotOccupants(workRoot)` 与 `leaseKey(workRoot, role)` 自动给出互斥与上界 | 零新代码；但上界被动继承为「每树 1 后端 + 全局 3」（`lib/delegate-core.ts:151-169`、`lib/delegate-async.ts:96`）⇒ wave 数 > 3 必然排队 |
| R2 | **stateRoot / workRoot 双根归一** | wave worktree 的 `role.json` / `pair.json` 自动落主仓 stateRoot（`prompts/build.md:204-208`）；wave 回收时无需搬状态文件 | 零成本；但 wave 的账**不得**落 worktree 副本（否则主仓读不到），与 n4「账本派生自 git」的选择同向 |
| R3 | **`worktree context 已设` 前置** | 编排者先 `git worktree add`，backend 直接视为前置已满足，跳过 P2 的准备步骤（`prompts/build.md:413`） | **不可机判**：本仓无插件校验「context 是否真由别人设好」；靠 prompt 纪律 + 事后 `git worktree list` 对账 |
| R4 | **`iteration.json` 的 change 状态** | wave 的完成/归档判据沿用同一字段（`prompts/build.md:315`），不新造 wave 状态文件 | 一个 change 跨多 wave 时该字段语义不足（见 C2）；且它由 `rddf` CLI 单写、**任何人不得手写**（`prompts/build.md:375`） |
| R5 | **归档前 `check_worktree_commits`** | wave backend 在自己的 worktree 里 commit；P3 归档门无需改动（`prompts/build.md:429`） | wave 的合并（n3）必须早于归档，否则 gate 读不到 commit；P2 自身不强制 commit ⇒ 编排者要自己加「合并前必须有 commit」的前置 |

〔事实·支撑 R1〕`prompts/front.md:78` 已经把「同仓并行 = 先建独立 worktree 再分别 dispatch」写成既有口径 —— 新通道**不是新发明**，而是把同一条口径从 front 侧搬到 build 侧。

〔事实·支撑 R1/R2〕角色租约的键是 `(workRoot 绝对路径, 工作角色)`，且**主会话 ↔ 后端同角色 ⇒ 拒绝**、异角色 ⇒ 并行（`lib/role-lease.ts:313-317`、`docs/adr/ADR-role-aware-permissions.md:84-98`）。⇒ 「build 主会话在 A 树编排 + bearer 后端在 B 树实施」天然合法；「build 主会话在 B 树也持 builder 租约」则会被拒。

## 3. 冲突点（每条给依据）

### C1 worktree 创建者变成双写者

〔事实〕P2 让 **builder 自己**做「worktree 或轻量执行」的选择与准备（`prompts/build.md:413`）；新通道让 **编排者**（build 主会话）先建 tree 再派发。同一时刻，`.git/worktrees/**` 与分支命名空间出现两个候选写者。

〔事实〕本仓的归属规则是**同一工件在同一路径上只允许一个写入者**（`prompts/build.md:418`）。而 worktree 元数据没有任何本仓判据：`scripts/` 里与 worktree 相关的只有 `git worktree list`（读）（`scripts/agent-guard-rules.ts:28`）。

⇒ **冲突是结构性的，不是措辞问题**：必须在「编排者建」与「backend 建」之间二选一，否则 wave 路径上会出现「backend 以为要建、编排者已经建好」的双建或漏建。

### C2 分支命名空间与 change 状态的两套标识

〔参考·非本节点核定〕兄弟节点 n4 已把 wave 身份定为分支 `rddf/wave/<topic>/<wave-id>`、合并为 `--no-ff --no-commit`（`nodes/n4/RESULT.md:15`、`:34`）；n2/n4 的 P1 前提是「一个 wave = 一个 linked worktree = 一个活跃后端」（`nodes/n4/RESULT.md:31`）。

〔事实〕P2 侧唯一的机器可读标识是 **change 名**（`iteration.json` 的 change 条目，`prompts/build.md:315`）。

⇒ 若一个 change 拆成 3 个 wave：3 个分支（合法）但只有 1 个 `iteration.json` 条目（`status=in_worktree`）⇒ 「哪个 wave 完成了这个 change」在 P2 的读入面上**不可判**。若反过来「一个 wave 跨 3 个 change」：一个 worktree 里 3 个 change 同时 `in_worktree`，P3 归档门按 change 逐条判，语义仍成立，但 P2 的暂停点（每 change 一次）会与 wave 的「一次批准」冲突。

### C3 每 change 的 HARD pause vs 每 wave 的无人值守

〔事实〕P0 / P2.5 是 HARD pause，用户必须显式选择（`prompts/build.md:428`）。

〔推断〕多 wave 的价值来自「**一次批准、N 波并发**」。若每个 wave 的 backend 都要走 P2 并触发 pause：① 没有用户在 backend 会话里可答（后端是无人值守，`prompts/build.md:696`「后端无人值守，自检即自审自批」的反面）；② 交互成本随 wave 数线性增长，把并行收益吃光。

⇒ 这不是实现冲突，是**语义冲突**：P2 的暂停点必须留在**编排层**（一次），而不能留在**每 wave 的执行层**。

### C4 P2 不强制 commit，而 wave 的 join 需要可判完成证据

〔事实〕P2 没有 commit gate（`prompts/build.md:429`）；commit 义务被延到归档前。

〔推断〕wave 的 join 必须在「有 commit / 有 tip」上做判据（n4 的 D5 用 `rev-list --count > 0` 或差集非空，`nodes/n4/RESULT.md:79`）。P2 的不提交形态会让「完成」与「可合并」两个状态错位 ⇒ 若照抄 P2 的宽松口径，join 会拿到一个空 tip。

⇒ 复用 P2 必须**加一条 P2 没有的前置**：wave 分支在 join 前必须有 commit。这是新增约束，不是复用。

### C5 P2 在本仓不可核实（最大的方案风险）

见 §0 的 `p2-unverifiable-upstream`。

〔事实〕本仓唯一与 P2 落地形态相关的外部引用，恰好登记了上游 SKILL.md 的**文档漂移**（`docs/rdd-workflow-product-issues.md:132-140`：SKILL.md 说写 `.planner-feedback.json`，实际写 `.rddf/improvements/*.md`）。〔推断〕一个连自己落点都写漂的上游 skill，其 P2 步骤细节更难作为本仓判据。

（必须上报）`execute-skill-retired` —— `prompts/build.md:413` 把 `execute` 列为 P2 之后的可选增强，并给出前置「worktree context 已设」；但 `scripts/rdd-skills.sh:39-45` 明写 **`execute` skill 已于 2026-11-20 归档退役**（能力由「执行该 change 的 agent」承担）。⇒ R3 的复用接口**指名了一个已退役的 skill**：接口语义仍成立（「worktree context 已设」是概念前置），但**引用面已陈旧**，m1 不得照抄「调 execute」这种表述。

## 4. 整合建议（单一推荐）

| 选项 | 判定 | 理由 |
|---|---|---|
| **复用**（P2 的 worktree 模式为唯一生命周期；新通道只加编排层） | ✅ **推荐** | 唯一不产生第二套 worktree 元数据写者、不复制 P2 状态口径的形态；并行能力来自「每树一槽」这一既有事实（`lib/delegate-core.ts:151-169`），不需要新机制 |
| **并存**（P2 一套、wave 一套，各自 provision） | ❌ 否决 | 两套都要写 `.git/worktrees/**` 与分支命名空间 ⇒ 直接违反单写者规则（`prompts/build.md:418`）；且本仓无任何 worktree 脚本可做仲裁（`scripts/agent-guard-rules.ts:28`）。**注意**：这里否决的是「并存两套机制」，不是否决「两条使用路径共存」 |
| **替代**（wave 通道取代 P2） | ❌ 否决 | ① P2 属上游产品侧，本仓改不了（BRIEF 边界 + `docs/adr/ADR-plan-multi-session-collaboration.md:119` 明说 rdd-builder 的 owns 面不在本仓改）；② P2 内嵌 HARD pause（`prompts/build.md:428`）与归档门 `check_worktree_commits`（`:429`），替代等于重写归档判据链；③ 无 `.rddf/plans/**` 的 TDD 计划就不该开工，替代会把「计划先行」一并拆掉 |

**为什么不是「并存」的进一步说明**：本节点要回答的是**机制**关系。路径上确实会有两种用法（单 change 交互式走 P2 / 多 wave 编排式走编排层），但**机制只有一套**：worktree 隔离 + 双根状态 + `iteration.json` + 归档 commits。若父会话要的就是「路径并存」这个词，本节点的答案是：**路径并存、机制复用** —— 用词可以争，方案只有一个。

## 5. 复用边界与职责归属

### 5.1 复用面（原样沿用，不改）

| 面 | 依据 | 谁维护 |
|---|---|---|
| worktree 作为隔离单位 + 每树一槽 | `lib/delegate-core.ts:151-169` | 本仓 `delegate` 插件（既有） |
| 角色租约 `(workRoot, role)` 与「同角色主/后互斥」 | `lib/role-lease.ts:313-317`、`docs/adr/ADR-role-aware-permissions.md:84-98` | 本仓 `role-gate` / `role-lease`（既有） |
| `stateRoot` / `workRoot` 双根判别式 | `prompts/build.md:204-208` | `lib/delegate-core.ts::canonicalRoot`（既有） |
| `.rddf/plans/<name>.md` 作为开工前置 | `prompts/build.md:413`、`.rddf/plans/plan-multi-session-collaboration.md:1` | 编排者产出 / backend 执行 |
| `.rddf/state/iteration.json` 作为 change 状态读入面 | `prompts/build.md:315` | `rddf` CLI 单写（`prompts/build.md:375`） |
| 归档前 `check_worktree_commits` | `prompts/build.md:429` | 上游 `archive.sh`（未在本仓核实） |

### 5.2 必须新做（P2 不提供）

1. **worktree 生命周期编排**：建 N 个 tree、命名、登记、回收。本仓零实现（`scripts/` 只有 `git worktree list` 读命令，`scripts/agent-guard-rules.ts:28`）。
2. **wave ↔ worktree ↔ 会话 的映射**：P2 的 `iteration.json` 只有 change 粒度（C2）。按 n4，wave 身份落**分支名**而非新账本（`nodes/n4/RESULT.md:15`）。
3. **一次批准、N 波派发**：把 P2 的 HARD pause 上提到编排层（C3）。
4. **join 前「必须有 commit」的前置**：P2 没有（C4）。

### 5.3 职责归属（owner，单一）

| 动作 | owner | 依据 / 理由 |
|---|---|---|
| 决定「这个 change 走 P2 还是走 wave」 | **用户**（在 build 主会话里显式选择） | P0/P2.5 本就是 HARD pause（`prompts/build.md:428`）；不得由 agent 代拍 |
| 建 / 删 wave worktree、建分支 | **build 主会话（编排者）** | 只有它有 `shell: "*": "allow"`（`opencode.jsonc:58-101`）；且这是 C1 的二选一里的「单写者」 |
| 实施（改代码、跑测试、commit） | **wave backend（`agent=build` 的 delegate 后端）** | `lib/delegate-core.ts:105`；写动作只发生在后端，与 n5 的口径一致 |
| 写 `.rddf/plans/<name>.md` 的执行段 | **wave backend**（builder 类） | `prompts/build.md:413`；plan 侧在同路径只有草稿权（`opencode.jsonc:214`） |
| 改 `iteration.json` | **`rddf` CLI** | `prompts/build.md:375`「任何人不得手写」 |
| 合并决策（wave → integ） | **build 主会话** | n3 的范围；本节点只声明「不是 P2 的职责」 |
| 归档 gate | 上游 `archive.sh` | `prompts/build.md:429` |

〔建议〕把 §5.3 写成「编排者不实施、实施者不编排」的一条边界句。它**不可机判**（差集只给路径不给写入者），只能靠事后 `git status` 差集 + 人工复核 —— 与 n5 的 `scope-diff-attribution` 空洞同源。

## 6. 对本仓工件归属的影响（逐路径，不得写「按惯例」）

### 6.1 `.rddf/plans/**`

- **owner = 执行该 wave 的 `build` 后端**（builder 类）。
- 依据：`prompts/build.md:413` 把「写 `.rddf/plans/<name>.md`（TDD 5 步）」列为 builder 内置流程；本仓现存 3 份计划首行即自述「builder 产出」（`.rddf/plans/plan-multi-session-collaboration.md:1`）。
- **plan 侧的权限是「草稿」而非 owner**：`opencode.jsonc:214` 给 plan 开了 `.rddf/plans/*.md` 的 edit，但一旦该文件被用作 `plan_ref` 派发（`lib/delegate-core.ts:1322` 的 accepted root 之一），**plan 必须停写**（单写者规则，`prompts/build.md:418`）。
- **编排者零写权**：build 主会话不得代写计划（否则与后端同路径双写）。
- 〔推断〕这条今天的**机器层没有隔离**：三条路径的允许集是重叠的，只在流程层靠单写者规则 —— m1 不得宣称「已机判」。

### 6.2 `.rddf/plan-topics/**`

- **owner = plan 侧**：父 `plan` 会话写 `TOPIC.md` / `graph.json` / `BRIEF.md`，`plan-worker` 只写自己 node 的 `TODO.md` / `RESULT.md`。
- 依据：`opencode.jsonc:1491-1494`（`plan-worker` 的 edit 白名单**恰好**是 `*.rddf/plan-topics/*` 前缀）；`opencode.jsonc:218`（plan 同前缀）。
- **build 侧（含编排者与 wave backend）在本路径上零写权，且不得把 wave 计划放这里**：
  - 依据一：`.rddf/plan-topics/**` **不在** `PLAN_REF_ROOTS`（`lib/delegate-core.ts:1321-1326`）⇒ 放这里的「计划」不能当 `plan_ref`，会被 `validatePlanRef` 拒；
  - 依据二：同一路径上已有一个写者集合（plan 侧），再加 build 侧就违反单写者（`prompts/build.md:418`）；
  - 依据三：D8 明确 plan-topics 的写域是「本期不做 per-node 写域」的残留（`docs/adr/ADR-plan-multi-session-collaboration.md:119`），没有可给第三方复用的写门。
- ⇒ 结论：**wave 的任何产物都不进 `.rddf/plan-topics/**`**；wave 的「契约」若要版本化，走 `.rddf/plans/**` 或 openspec，不走 plan-topics。

### 6.3 `openspec/changes/**`

- **owner 分三段，按文件**（同一目录不同文件不同 owner）：
  - `proposal.md`：增强层路径下由 `rdd-builder` P0 生成；内置流程下由 `planner` 起草（`prompts/build.md:436`）。
  - `tasks.md`：`rdd-builder` **owns**；`rdd-quick` 在 mode a 最小化生成（`prompts/build.md:437`）。
  - `design.md`：**无 skill owns**，由执行该 change 的 agent 写并定稿（`prompts/build.md:438`）。
- **wave 模式下的落点**：三段写动作**全部只能发生在 wave backend 内**，编排者不写；且同一 change 同一时刻只允许一个 backend 写（`workRoot` 单槽 + 每树一后端，`lib/delegate-core.ts:151-169`）。
- **本仓现存两个未归档 change**（`openspec/changes/subagent-contract-critic-reeval/`、`openspec/changes/plan-synthesis-offload/`）都显式声明「**本路径未启用 `rdd-planner` / `rdd-builder`**」⇒ 它们走的是**内置流程**。〔推断〕这正好说明：wave 通道不能假设「所有 change 都经过 P2」，否则会与内置流程的 change 撞上 —— 编排者必须先判「该 change 是否在 P2 路径上」。
- **未核实的部分**：上游 `rdd-builder` 的 `owns:` 清单（proposal/tasks）未在本仓核实；本节点只引用本仓「工件归属规则」表（`prompts/build.md:434-441`），不引用 SKILL.md 的 owns 段。

### 6.4 同路径多写者的汇总（一句话）

同一工件同一路径只允许一个写入者（`prompts/build.md:418`）；本提案下三条路径的 owner 分别是：`.rddf/plans/**` = wave backend、`.rddf/plan-topics/**` = plan 侧（build 侧不可入）、`openspec/changes/**` = 逐文件（P0/`rdd-builder`·`rdd-quick`·执行 agent），而**编排者在三条路径上都零写权**。

## 7. 后果与代价（含反向代价）

1. **正面**：不新增第二套 worktree 机制 ⇒ 无新账本、无新槽位表、无新围栏；并行上界继承了既有语义（每树 1 后端、全局 3，`lib/delegate-core.ts:151-169`、`lib/delegate-async.ts:96`）。
2. **反向**：复用把「P2 的不提交形态」一并继承（C4），wave 必须**加**前置（join 前有 commit）—— 这是复用的隐性成本，不能写成「零成本复用」。
3. **反向**：复用把「P2 的每 change 暂停」一并继承（C3），必须**上提**到编排层 → 等于新增一层批准面，本仓没有可机判的批准记录位。
4. （最重）`p2-upstream-drift` —— 复用面向的是一个**本仓不可核实**的上游 skill（C5）；一旦上游 P2 改名/改步骤，本仓所有「复用 P2」的判据都靠 `skill` 工具的加载结果兜底，没有 CI 可测（`prompts/build.md:405`）。
5. （薄弱点）`orchestrator-write-unattributable` —— 「编排者没写 wave worktree」**不可机判**：差集只给路径不给写入者（`lib/delegate-core.ts:2593-2604`，n5 亦已登记）。复用的边界只能靠 prompt 纪律。

## 8. 验证判据（本节点主张的可测面）

| 判据 | 怎么测 | 可机判 |
|---|---|---|
| 不新增 worktree 机制 | `grep -r "worktree add" scripts/ lib/ plugins/` 仍为空（现只有 `git worktree list`，`scripts/agent-guard-rules.ts:28`） | ✅ |
| 每树一槽未被改动 | `slotOccupants` 的键仍是 `workRoot`（`lib/delegate-core.ts:151-169`） | ✅ |
| 编排者零写权（`.rddf/plans/**`） | backend 存在时，编排会话的 `git status` 差集在 `worktree` 外 | ⚠ 部分（差异只到路径） |
| 复用接口存在 | `prompts/build.md:413` 仍含「worktree context 已设」 | ✅（文本断言） |
| P2 步骤语义未漂 | 只能靠 `skill` 工具加载 + 人工读 SKILL.md | ❌ 不可机判 |

## 9. 待父裁决

1. **用词**：本节点推荐「复用」，并解释为「路径并存、机制复用」。若 m1 的合成稿需要一个单一词，请裁定用「复用」还是「分层并存」——两者在方案上等价，只差措辞。
2. **C1 的二选一**：worktree 创建者定为**编排者**（本节点推荐）还是 **wave backend 沿用 P2 自建**？若选后者，则 R3（`worktree context 已设`）不成立，复用面收窄为 R1/R2/R4/R5。
3. **C2 的承载**：一个 change 拆多 wave 时，「哪个 wave 完成了这个 change」在 `iteration.json` 上不可判。是接受「以分支是否合并进 integ 为唯一判据」（n4 路线），还是要求「一个 change 只能一个 wave」？后者会显著降低并行度。
4. **C5 的核实责任**：`p2-unverifiable-upstream` 是否要 m1 明确写成「本提案带一个未核实的上游依赖」，并要求立项前补一次 SKILL.md 实读？本节点按 BRIEF 只标注、未展开。
5. **`execute-skill-retired`**：`prompts/build.md:413` 仍把已退役的 `execute` 当作前置载体。这属本仓 prompt 的陈旧引用（不是本提案引入），是否单列一条清理项交给后续 change？

## STATUS: COMPLETE
