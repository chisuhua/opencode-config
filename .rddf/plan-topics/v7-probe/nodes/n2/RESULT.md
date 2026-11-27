# RESULT — n2：写隔离方案选型

> 类别标注：**〔事实〕** = 本仓文件可直接引用（带 `path:line`）；**〔推断〕** = 由事实推出、本仓无直接断言；**〔上游语义〕** = 押在宿主行为上、本仓只有锚点而无源码（按 BRIEF 要求不编造行号）；**〔建议〕** = 供 n3–n7 / 合稿消费。
> 本节点只答「**若做，用哪种写隔离**」；不答「要不要做」（n7 / 合稿），不设计合并语义（n3），不设计判据（n4）。

## 0. 结论先行

**推荐：worktree 隔离 —— 每个 wave 一个独立 linked worktree，worktree 内部仍严格「一个 worktree 一个写者」，且该隔离必须由「能同时指定会话目录 + 下发 per-session 权限」的通道承载（即 delegate / dispatch 的后端会话），不接受宿主 `subagent` 承载。**

一句话理由：**worktree 是唯一一种「不削弱 D4 单槽论证、还能让 `scope` + `git status` 差集检测重新成立」的隔离粒度** —— 差的不是更细的权限前缀，而是**归因边界**（每个 worktree 的 `git status` 只含自己的变更，`lib/delegate-core.ts:2593-2604`），而 `scope` 前缀永远给不出这种边界。

明确否决四项（理由见 §4，其中 B1 直接引用 D4 原文）：

| 被否决项 | 一句话否决理由 |
|---|---|
| B1 分支隔离（同一工作树） | 违反 D4：两个后端写同一工作树 ⇒ `scope` + `git status` 差集检测的前提被破坏（`docs/adr/ADR-plan-delegate-engineering-session.md:77`） |
| B2 目录 / 子树隔离 | 落在同一 worktree ⇒ 同一 index、同一 `git status` ⇒ 无归因；且先撞单槽（`lib/delegate-core.ts:154`） |
| B3 用宿主 `subagent` 承载 build-worker 做「worktree 隔离」 | 宿主不给 per-session 权限、不能指定目录 ⇒ 隔离只剩协议层约定，却对外表现为「已隔离」= **伪隔离**（`scripts/check-upstream-anchors.sh:174-176`、`:187-189`） |
| B4 独立 clone / 进程级隔离 | `stateRoot` 分裂 ⇒ pair/ledger/slot 三本账各一份 ⇒ 跨 clone 的双写者检测与合并语义全部失效（`lib/delegate-core.ts:474-478`） |

对照项 C4「不并行 + 上下文外置」不推荐为首选，但**保留为前置条件不成立时的退化路径**（§4.5）—— 它不新增任何不变式，代价是墙钟不降。

〔必须上报〕`worktree-is-write-isolation-ceiling` —— 本节点的核心判断是：在宿主能力下，**写隔离的最细有效单位是「工作树」，不是「文件」**；文件级隔离在权限层只能到 `edit` 工具前缀（相对会话目录），在归因层完全做不到（§5）。

---

## 1. 约束输入（来自 n1 与既有 ADR，逐条带引用）

| # | 约束 | 引用 | 对本节点的含义 |
|---|---|---|---|
| K1 | 同一 `workRoot` 同时只允许一个活跃后端，与 owner 无关 | `docs/adr/ADR-plan-delegate-engineering-session.md:74-78` | 任何「同一 working tree 内并行」的方案直接出局 |
| K2 | 槽位键 = `workRoot`；**同一仓的多个 linked worktree 各自一槽** | `lib/delegate-core.ts:154-155`、`docs/MULTI-AGENT-DESIGN.md:1208` | 「跨 worktree 并行」在 delegate 语义内**已经合法**，缺的不是许可而是载体与合并 |
| K3 | `scope` 差集检测 = 委托前后 `git status --porcelain` 的集合差，基准是 `workRoot` | `lib/delegate-core.ts:2504`、`:2593-2604`、`:476-477` | 差集**不记录写入者**，只记录「哪些路径变了」⇒ 同树双写者必假阳性 |
| K4 | 后端 session 的权限在**创建时**定型：`classPermissions` → `ctx.session.create({ …, permissions })` | `lib/delegate-core.ts:1266-1288`、`lib/delegate-async.ts:1361-1376`、`:2463-2478` | **存在** per-session 写隔离载体（仅 delegate 系） |
| K5 | 宿主 `subagent` 建子会话**不传 per-session permissions**，权限取 agent 自身配置 | `scripts/check-upstream-anchors.sh:174-176`（P5）、`:187-189`（P5b） | `subagent` 系的写隔离上限 = **agent 级静态**，不是会话级 |
| K6 | 通配是**前缀**语义且 `*` 跨斜杠 ⇒ 白名单表达不了「只有我的 node/目录」 | `scripts/check-upstream-anchors.sh:196-198`、`docs/adr/ADR-plan-multi-session-collaboration.md:308`（残留 #1） | 「每节点精确写域」在权限层不可行，已被 ADR 登记 |
| K7 | 每文件恰一写者（D1 单一写者表） | `docs/adr/ADR-plan-multi-session-collaboration.md:40-48` | 并行方案必须能给出「谁写哪个路径」的机械边界 |
| K8 | 「用 `subagent` 拉一个可写 agent ⇒ 能写但没有上述任何保护 ⇒ 比没有更危险」 | `docs/adr/ADR-plan-delegate-engineering-session.md:29` | B3（伪隔离）在既有裁决下已被点名 |
| K9 | `plan_ref` 门只在 `callerAgent === "plan" && kind === engineering` 时必填 | `lib/delegate-core.ts:1337-1342`、`:2340`、`lib/delegate-async.ts:1227-1232` | 换派发主体会**静默改变**「计划先行」的覆盖面 |
| K10 | 全局并发上限 3（`RDDF_MAX_ACTIVE_BACKENDS` 可覆盖） | `lib/delegate-async.ts:96-101` | 无论隔离多好，同时最多 3 个 wave |
| K11 | 角色租约键 = `(workRoot, role)`，同 worktree 同角色至多一个活跃 session | `lib/role-lease.ts:313-317`、`prompts/build.md:197` | worktree 隔离与租约语义**同构**；同树并行连租约都过不去 |
| K12 | 状态文件落 `stateRoot`（worktree 下 = 主仓），变更检测落 `workRoot` | `lib/delegate-core.ts:474-478`、`prompts/build.md:208` | 多 worktree 共享一本 pair/ledger = 单一审计面（优点），也是 `role.json` 争用的来源（代价） |

---

## 2. 候选方案（逐项：机制 / 粒度 / 不变式影响 / 代价 / 失效模式）

### C1 worktree 隔离（每 wave 一个 linked worktree）—— **推荐**

**机制**
- 建立者：**派发方会话**（若按推荐形态，是被授权派发的 `build` 主会话本身；若前置条件不成立，退回 `plan` / `front`）。生命周期 = wave 前 `git worktree add` → 派发一个后端（`location.directory` = 该 worktree）→ 收尾合并（n3）→ `git worktree remove`。
- 隔离成立的两个支点都是**既有机制**：① 槽位键是 `workRoot`，所以每个 worktree 天然一槽（`lib/delegate-core.ts:154-155`，实测口径见 `docs/MULTI-AGENT-DESIGN.md:1208`）；② 后端 session 的 `scope` 解析基准与 `git status` 基准都是 `workRoot`（`lib/delegate-core.ts:476-477`、`:2503`），因此差集只看得见本 worktree 的变更。
- 权限下发走 `classPermissions({ workRoot, scope, … })` → `ctx.session.create({ location: { directory: project_dir }, permissions })`（`lib/delegate-async.ts:1361-1376`）⇒ **scope 是相对 worktree 解析的文件前缀**，edit 规则第一条即 `edit:* deny`（`lib/delegate-core.ts:553-556`）。

**隔离粒度**：**工作树级**（跨 worktree 完全隔离 index / status / 未跟踪文件；worktree 内仍是全文件可写 —— 这是刻意的，见 §5.3）。

**对现有不变式的影响（逐条，不留空）**

| 不变式 | 影响 | 依据 |
|---|---|---|
| `scope` + `git status` 差集检测 | **不破坏，反而恢复其前提**：差集基准是 `workRoot`，每个 wave 一个 `workRoot` ⇒ 兄弟 wave 的变更不会进入本 wave 的 `statusAfter` | `lib/delegate-core.ts:476-477`、`:2593-2604` |
| delegate 全局单槽（D4） | **不冲突**：D4 管的是「同一工作树」，槽位键本来就是 `workRoot`；worktree 隔离把并行搬到**不同槽**上，是对 D4 的字面遵守而非绕过 | `docs/adr/ADR-plan-delegate-engineering-session.md:74-78`、`lib/delegate-core.ts:154-155` |
| `PLAN_REF_ROOTS`「计划先行」门 | **不冲突，但覆盖面会变**：该门只在 `callerAgent === "plan"` 时必填（`lib/delegate-core.ts:2340`）⇒ 若承载者是 `build`，门**静默不生效**（这是「换主体」的治理代价，登记给 n5 / n4，不属本节点否决理由） | `lib/delegate-core.ts:1337-1342`、`:2340` |
| 「单一写者」范式 | **强化**：写者单位从「文件」升到「工作树」，每棵树仍一个活跃后端 ⇒ 单一写者的机械边界变成 `workRoot`，比前缀白名单更硬 | `docs/adr/ADR-plan-multi-session-collaboration.md:40-48`、`lib/delegate-core.ts:154` |

**代价**
- 工程量：worktree 的建/删由派发方 shell 承担（`build` 的 `shell` 是 `*: allow`，`opencode.jsonc:58-59`；`git branch -D` 是 `ask`，`:81`）⇒ 技术上零新代码，但**流程工件**（worktree 命名、base 分支、清理清单）是新的运维面。
- 运维面：N 个 worktree = N 份 `node_modules` / 构建缓存（若不入仓则每次重建）；`.git/worktrees/` 元数据残留会污染 `git worktree list`。
- 新增不变式：**worktree 必须建在仓根之外**（仓内建 ⇒ 主 worktree 的 `git status` 出现未跟踪目录 ⇒ 污染**其它**会话的差集，见失效模式 ③）。
- 失败面：合并冲突（转 n3）、`role.json` 争用（见失效模式 ②）、并发上限 3（`lib/delegate-async.ts:96`）。

**失效模式（该方案自身怎么坏）**
1. `worktree-stale-slot`：后端异常终止未释放槽位 ⇒ 下一 wave 派同一 worktree 被拒（`lib/delegate-async.ts:621-640` 的 reconcile 只翻 `active→idle`，`cancel_pending` 的条目**故意不放**，`:623-627`）。缓解在既有出口（`suspend` / `cancel`），不在隔离机制内。
2. `role-json-mirror-race`：所有 worktree 共享 `stateRoot` ⇒ 共享一份 `role.json`（`lib/role-lease.ts:47-49`），写入由 `.role.lock` 串行化、`sessions` 按 session 分区（`prompts/build.md:210`），但**顶层 `current_role` 镜像**会被 N 个后端交替翻转 ⇒ 展示面歧义（ADR 已把「role.json 与主会话镜像打架」登记为残留，`docs/adr/ADR-plan-delegate-engineering-session.md:147`）。
3. `in-repo-worktree-status-noise`：worktree 若建在仓内（如 `<repo>/.worktrees/w1`），主 worktree 的 `git status` 会列出该未跟踪目录 ⇒ **别的会话**的 `outOfScope` 计算把它算成越界（`lib/delegate-core.ts:2601-2604`）⇒ 假阳性。
4. `merge-back-not-automated`：隔离只保证「写得干净」，不保证「合得回去」；一次性合并 N 棵树是 n3 的题，本方案只提供前提。

### C2 分支隔离（同一工作树，各后端切不同分支）

**机制**：所有后端共用同一 `workRoot`，各自 `git checkout -b wave/N`。隔离靠分支指针。

**粒度**：**分支级（逻辑）**，物理工作树**零隔离**。

**对不变式的影响**

| 不变式 | 影响 | 依据 |
|---|---|---|
| `scope` + `git status` 差集 | **直接破坏**：差集是工作树级快照，切换分支会整体改写 `statusAfter`；两个后端交替 checkout ⇒ 任一方的 `changed` 集合都包含对方的分支切换结果 ⇒ `out_of_scope_files` 双向外误报 | `lib/delegate-core.ts:2593-2604`；D4 原文 `docs/adr/ADR-plan-delegate-engineering-session.md:77` |
| delegate 单槽 | **先撞墙**：同 `workRoot` 第二个后端被拒（`lib/delegate-core.ts:154`、`lib/delegate-async.ts:635-640`）⇒ 根本走不到分支这一步 | 同上 |
| `PLAN_REF_ROOTS` | 无直接影响（门在派发前、按 `plan_ref` 路径判；与分支无关），**但**分支上不存在该计划文件时「存在性校验」通过而实际不可读 —— 属 n4 判据面问题 | `lib/delegate-core.ts:1373-1383` |
| 单一写者 | **失效**：分支不构成写隔离（未提交/未跟踪文件跨分支共享），两个写者仍写同一棵文件树 | `docs/adr/ADR-plan-multi-session-collaboration.md:40-48` 的反面 |

**代价**：工程量最低（一条 `git checkout -b`），运维面看似最轻 —— 这正是它危险的地方：**成本低到会被误用**。

**失效模式**：`branch-same-tree-slot-collision`（先撞单槽）；即使绕过单槽（例如两个 `build` 主会话 + 租约被手改），也只会得到 D4 明确防范的「双写者 + 差集无归因」，且 `git checkout` 会**在对方会话执行中途改写其工作树**——这是不可恢复的竞态，比合并冲突更糟。

### C3 目录 / 子树隔离（同工作树，按 `scope` 目录切分）

**机制**：所有后端同 `workRoot`，各自 `scope: ["src/a"]` / `["src/b"]`，靠 `scopeEditRules` 生成 per-session edit 白名单（`lib/delegate-core.ts:553-569`）。

**粒度**：**文件前缀级**（权限层），目录级（约定层）。

**对不变式的影响**

| 不变式 | 影响 | 依据 |
|---|---|---|
| `scope` 差集 | **半破**：`edit` 工具被限制在各自 `scope`，但差集是**全树** `git status` ⇒ A 的 `changed` 含 B 的文件 ⇒ `out_of_scope_files` 必然误报（每次并行都误报 ⇒ alert fatigue） | `lib/delegate-core.ts:2593-2604` |
| delegate 单槽 | **先撞墙**：同 `workRoot` 第二个后端被拒 | `lib/delegate-core.ts:154` |
| `PLAN_REF_ROOTS` | 无直接影响（门与 scope 正交） | `lib/delegate-core.ts:2340` |
| 单一写者 | **名义成立、实际失效**：`shell` 不受 `scope` 约束（`CONSTANT_DENY` 只封破坏性命令，`lib/delegate-core.ts:48-81`），且共享 index / 构建产物 / lockfile ⇒ 一次 `bun install` 或一次格式化就是跨 `scope` 写 | `lib/delegate-core.ts:48-81` |

**代价**：看似「零新机制」（`scope` 已存在）。真实代价是把**归因**问题伪装成**权限**问题：`scope` 能拦 `edit`，拦不住 `shell`、拦不住共享副产物。

**失效模式**：`subtree-no-attribution` —— 越界证据不可判（每条都误报 ⇒ 无人看）、`shell` 写洞（与 ADR 残留 #6 同型，`docs/adr/ADR-plan-delegate-engineering-session.md:216`）、共享 index 导致的 `git add` 交叉污染（两个后端 `git add .` 会把对方的改动一起提交）。

### C4 不并行 + 上下文外置（把「多 wave」换成别的解法）—— **对照项**

**机制**：保持单一 `build` 会话串行实施；把「多 wave」的收益换成**上下文外置**：每个 wave 的计划/进度/交接落在 `.rddf/plans/<slug>.md` 与交付件里，主会话只保留指针；必要时用 `delegate` 串行派单轮后端（一次一个，不并行）。

**粒度**：**无写隔离需求（单写者天然成立）**；隔离点变成**上下文隔离**（磁盘载体代替会话上下文）。

**对不变式的影响**

| 不变式 | 影响 | 依据 |
|---|---|---|
| `scope` 差集 | **零影响**（单写者，差集语义本就成立） | `lib/delegate-core.ts:2593-2604` |
| delegate 单槽 | **零影响**（串行使用单槽） | `docs/adr/ADR-plan-delegate-engineering-session.md:74-78` |
| `PLAN_REF_ROOTS` | **强化**：串行的每一轮都可要求带 `plan_ref`（若主体是 plan） | `lib/delegate-core.ts:2340` |
| 单一写者 | **零影响** | — |

**代价**：墙钟时间随改动规模线性增长（TOPIC 的问题本体）；上下文压力靠**外置件**缓解而非消除（写盘/读盘成本仍在）。**好处**：零新增不变式、零新增运维面。

**失效模式**：`context-offload-drift` —— 外置件与真实状态漂移（计划说 A、代码是 B），且无机械判据能发现（与 plan-topics 的 `stale_inputs` 同族问题，但工程侧没有 `claim/fence` 机制，`docs/adr/ADR-plan-multi-session-collaboration.md:136-157`）。

### C5 独立 clone / 进程级隔离（补充对照，用于定标）

**机制**：每个 wave 一份独立 `git clone`（或容器），各自完整仓库 + 各自 `.rddf/state`。

**粒度**：**进程 / 仓级**（最强隔离）。

**对不变式的影响**

| 不变式 | 影响 | 依据 |
|---|---|---|
| `scope` 差集 | 每 clone 内部成立，但**跨 clone 不可见** ⇒ 「谁写了什么」在派发方面前彻底消失 | `lib/delegate-core.ts:476-477` |
| delegate 单槽 | **语义失效**：`stateRoot` 分裂 ⇒ 每 clone 一张 pair/ledger/槽位表（`lib/delegate-core.ts:474-478`）⇒ 双写者检测退化 | 同上 |
| `PLAN_REF_ROOTS` | 失效：`plan_ref` 相对 `projectDir` 解析，跨 clone 的路径不共享 | `lib/delegate-core.ts:1373-1375` |
| 单一写者 | 单 clone 内成立；跨 clone 无任何账本 | — |

**代价**：合并退回「跨仓搬运 patch」，失去 git 的 merge-base / 三方合并；运维面最大（磁盘、依赖、状态三套）。

**失效模式**：`state-root-split` —— 台账分裂后**没有任何一处**能回答「这台机器上还有几个后端在跑」（这与 ADR 对「运行态第二本账」的一贯否决同向，`docs/adr/ADR-plan-multi-session-collaboration.md:187`）。

---

## 3. 选项对比表

| 方案 | 隔离粒度 | 结论 | 理由 |
|---|---|---|---|
| **C1 worktree 隔离（delegate/dispatch 承载）** | 工作树 | **采纳** | 唯一同时满足：不违 D4（槽位键本就按 `workRoot`）、差集归因重新成立（`workRoot` 基准）、写者边界从「文件前缀」升级为「git 工作树」、复用既有 per-session 权限载体（`lib/delegate-async.ts:1371-1376`） |
| C2 分支隔离（同树） | 分支（逻辑） | **否决** | 先撞单槽（`lib/delegate-core.ts:154`），绕过则破坏 D4 的差集前提；`git checkout` 会改写他人工作树（不可恢复竞态） |
| C3 目录 / 子树隔离 | 文件前缀 | **否决** | 同树 ⇒ 差集全树误报 + `shell` 写洞 + 共享 index；「精确写域」在权限层已被 ADR 判为不可行（`docs/adr/ADR-plan-multi-session-collaboration.md:308`） |
| C4 不并行 + 上下文外置 | 无（单写者） | **保留为退化路径**（非首选） | 零新增不变式、零运维面；但墙钟不降，且外置件漂移无机械判据 |
| C5 独立 clone / 进程级 | 仓 / 进程 | **否决** | 隔离最强但 `stateRoot` 分裂 ⇒ 台账/槽位/`plan_ref` 三处同时失效，隔离换来的安全被账单盲区吃掉 |
| B3（宿主 `subagent` 承载 C1） | 名义工作树 / 实际进程 | **否决** | 宿主不传 per-session 权限、不能指定目录（`scripts/check-upstream-anchors.sh:174-189`）⇒ 隔离只是「提示词里写了 cwd」；ADR 已有同型裁决（`docs/adr/ADR-plan-delegate-engineering-session.md:29`） |

**为什么不是「C1 与 C4 都可以」**：C4 不是另一种隔离机制，而是**否决并行本身**的替代解法。二者不是同层选项 —— C1 是「若要做并行，用哪种隔离」的答案，C4 是「不做并行时用什么替代」。本节点按 BRIEF 只答前者，故推荐单一（C1），C4 只作为前置条件不成立时的退化路径登记（§4.6）。

---

## 4. 推荐与明确否决项

### 4.1 推荐（单一）

**worktree 隔离：一个 wave = 一个 linked worktree = 一个活跃后端；后端由 delegate / dispatch 通道创建（`location.directory` 指向该 worktree，权限由 `scope` 相对该 worktree 派生）。**

- 隔离建立者：**派发方会话**（不是 worker 自己 —— worker 无权建自己的隔离，否则隔离就是对被隔离者的自证）。
- 生命周期：`worktree add` → `dispatch`（异步，返回即走）→ join（宿主完成消息 / `sessions` 轮询）→ 合并（n3）→ `worktree remove`。
- 承载者必须是 **delegate / dispatch**：它是全仓唯一能在 `session.create` 时同时给 `location` 与 `permissions` 的通道（`lib/delegate-async.ts:1371-1376`、`lib/delegate-core.ts:2473-2478`），因此也是唯一能让「隔离」落在**权限层**而不只是**约定层**的通道。

### 4.2 否决 B1：分支隔离（同树）—— 直接引用 D4

> D4 原文：「单槽是写隔离的来源；按 owner 分槽会让两个后端同时写同一工作树，**破坏 `scope` + `git status` 差集检测的前提**。」（`docs/adr/ADR-plan-delegate-engineering-session.md:77`）

分支隔离恰恰是「两个后端同时写同一工作树」的**教科书形态**：分支指针不构成写隔离（未跟踪文件、index 共享），而差集检测读的是工作树快照（`lib/delegate-core.ts:2593-2604`）。C2 与 B1 是同一条不变式的两种说法：D4 禁的是**同树双写者**，不是「没有分支」。**因此 C2 的否决理由必须来自 D4，而不能自创「分支不好管」之类的工程理由。**

### 4.3 否决 B2：目录 / 子树隔离

三条独立理由，任一足够：
1. **同树 ⇒ 先撞单槽**（`lib/delegate-core.ts:154`、`lib/delegate-async.ts:635-640`）—— 连并行都建立不起来。
2. **差集无归因**：`outOfScope` 是「全树 `statusAfter` 减去全树 `statusBefore`」，与本会话的 `scope` 取交集才判越界（`lib/delegate-core.ts:2596-2604`）⇒ 兄弟的写必然进本会话的 `changed` ⇒ 每轮都误报。
3. **权限层只覆盖 `edit`**：`classPermissions` 注入的 edit 规则之外，`shell` 仍继承 agent 配置（`build` 是 `*: allow`，`opencode.jsonc:58-59`；`lib/delegate-core.ts:1277-1287` 不含任何 shell 规则）⇒ 目录隔离可被一条重定向绕过。

### 4.4 否决 B5（=C5）：独立 clone

`stateRoot` 是 pair/ledger/槽位表/`plan_ref` 解析的唯一落盘根（`lib/delegate-core.ts:474-478`、`:2484`、`:1373-1375`）。clone 分裂它 ⇒ 「同一 workRoot 单槽」退化为「每 clone 单槽」，跨 clone 的双写者与越界**没有任何账本可查**（`docs/MULTI-AGENT-DESIGN.md:121` 的「唯一登记型通道」纪律被绕过）。

### 4.5 否决 B3：宿主 `subagent` 承载（伪隔离）

- 事实：宿主的 `subagent` **不传 per-session permissions**（`scripts/check-upstream-anchors.sh:174-176`、`:187-189`）⇒ 子会话权限 = 该 agent 配置。`build` 的 `edit` 是 `*: allow`（`opencode.jsonc:50-54`）⇒ 任何以 build 为 agent 的子会话都能写**整个工程**。
- 事实：`build` 的 `subagent` 是字符串 `allow`（`opencode.jsonc:102`）⇒ 它能拉起任意 subagent agent；但**拉起动作不携带目录**〔上游语义，本仓无源码可引：`subagent` 的入参集未在本仓核实〕。
- 因此「用 subagent 拉 build-worker + 口头约定它在某 worktree 里干活」= 隔离只在提示词里 ⇒ 一次 `cd` / 一次绝对路径写就击穿，且**看起来**是隔离的（比没有更危险，`docs/adr/ADR-plan-delegate-engineering-session.md:29`）。

〔必须上报〕`pseudo-worktree-isolation` —— 这是本节点最容易被误采纳的分支：它「不需要开 delegate 权限」，因此阻力最小、诱惑最大。

### 4.6 前置条件（不构成第二个推荐）

C1 的承载者是 delegate 通道，而 `build` **当前没有** delegate 权限（`opencode.jsonc:30-34` 顶层五项 `deny`）。⇒ C1 附带一个前置条件：**派发主体必须是已有 delegate 权限的会话（`plan` / `front`），或 `build` 获得 delegate 权限**。这条属 n5 / n7 的裁决面，本节点只登记其**对隔离机制的必要性**：没有 delegate，C1 只能退化成 B3（伪隔离）或 C4（不并行）。**这不是并列两个推荐** —— 推荐仍是 C1，只是它有一个必须由别的节点闭合的前提。

---

## 5. 隔离机制与写集粒度的关系（最细能到哪一级）

### 5.1 权限层强制（可机判、可被守卫钉住）

- **最细 = 会话级文件前缀，且仅对 `edit` 工具生效。** `classPermissions` 在 `session.create` 时注入 `edit:* deny` + 每条 `scope` 的 allow（`lib/delegate-core.ts:553-569`、`:1273-1279`），规则资源是**相对会话目录**的路径（`normalizeScopePath`，`:1040-1047`）⇒ 换 worktree 即换解析根，无需新机制。
- 更细的一级（**单文件 / 单节点精确写域**）在权限层**做不到**：宿主通配是前缀、`*` 跨斜杠（`scripts/check-upstream-anchors.sh:196-198`），`subagent` 系连 per-session 权限都没有（同文件 `:174-176`）⇒ ADR 已如实登记「每节点精确写域不可行」（`docs/adr/ADR-plan-multi-session-collaboration.md:308` 残留 #1）。
- 边界诚实口径：即使 delegate 后端，`shell` 也不受 `scope` 约束（`CONSTANT_DENY` 只封破坏性命令，`lib/delegate-core.ts:48-81`）⇒ 权限层最细是「**edit 工具级前缀**」，**不是**「文件系统级」。ADR 对这一点有一贯表述：「『单写者』在**权限层不可保证**」（`docs/adr/ADR-plan-multi-session-collaboration.md:213`）。

### 5.2 协议层约定（不可机判，只能事后核对）

- `subagent` 系（含 `plan-worker`、含任何 build-worker 子会话形态）：写域只能到「agent 级静态权限 + cwd 约定 + 提示词写域」⇒ ADR 明确「**不声称**权限强制」，四层兜底是「前缀白名单 + 单一写者 + 独占锁 + 事后核对」（`docs/adr/ADR-plan-multi-session-collaboration.md:134`、`:213`）。
- 事后核对的强度也有限：`scope-check` 按节点归因在并行下**必然假阳性**（git 不记写入者，`docs/adr/ADR-plan-multi-session-collaboration.md:330-338`）⇒ 协议层在「并行」场景下连事后归因都退化了。

### 5.3 由此得出的关键结论

1. **「更细的写集粒度」不是解，更细的归因边界才是解。** 目录/子树隔离试图用更细的权限前缀换并行，但差集是**工作树级**的（`lib/delegate-core.ts:2593-2604`）—— 粒度再细也没有归因。worktree 把归因边界交给 git 本身（每棵树一份 index/status），所以它是**在宿主能力内唯一能同时保住「隔离」与「归因」的粒度**。
2. **worktree 内部故意保持全文件可写**：这不是缺陷，而是 D4 的必然形态 —— 一个 worktree 一个写者，写者内部不需要再切粒度；若在 worktree 内再切 `scope`，得到的是 C3 的全部失效模式（无归因 + `shell` 洞）。
3. **做不到的那一级 = 单文件 / 单节点强制写域**；后果不是「隔离不够强」，而是：并行时**越界证据不可判**（ADR 残留 #10，`docs/adr/ADR-plan-multi-session-collaboration.md:330-338`）、`scope` 差集只能做「有/没有变更」而不能做「是谁改的」、以及**接管/重派的双活体写者无法被围栏挡住**（同篇残留 #12，`:340-346`）。worktree 隔离把这三条同时绕开：归因由工作树边界给，接管由「worktree 命名 + 槽位表」给。
4. **对本仓的诚实标注**：`worktree` 的创建/回收/合并**没有任何本仓判据**（`prompts/build.md:413` 只写「worktree 或轻量执行」，`prompts/build.md:197`/`:208` 只给语义），所以 C1 的**建立动作**本身是协议层的；能到权限层的只有「进了 worktree 之后 `scope` 相对它解析」这一段。⇒ n4 若要设计判据，盯的应是「worktree ↔ 槽位 ↔ 派发」三者的一致性，而不是「文件级越界」。

---

## 6. 与相邻节点的接口（不越界，只登记）

| 交给谁 | 接口事实 | 依据 |
|---|---|---|
| n3（合并语义） | C1 只保证「写得干净」，合并对象是 **N 个 branch**；C2/C3/C5 的合并形态分别退化为「不可分」「同 index 交叉污染」「跨仓 patch」 | §2 各方案失效模式 |
| n4（判据面） | 可机判的只有：槽位占用（`workRoot` 维度）、`out_of_scope_files`（worktree 内成立）、全局并发数；**不可机判**：谁写哪个文件、worktree 是否真被使用 | `lib/delegate-async.ts:96-101`、`lib/delegate-core.ts:2596-2604` |
| n5（单槽关系） | C1 **不要求**改单槽语义（槽位键已是 `workRoot`），只要求「建立多槽」的载体（delegate 权限 / 归属枚举 `ownerAgentOf` 只有 front/plan 两值，`lib/delegate-core.ts:1413-1415`） | 同左 |
| n7（失败模式/回滚） | C1 的回滚是「不建 worktree 即回到现状」，无 schema 变更、无运行态新文件；`role.json` 镜像争用与 `.git/worktrees` 残留是唯一两处需清理的痕迹 | `lib/role-lease.ts:47-49`、`docs/adr/ADR-plan-delegate-engineering-session.md:147` |

---

## 7. 自检清单（对照 BRIEF 验收口径）

| 验收项 | 状态 |
|---|---|
| 候选 ≥3 且每项含机制/粒度/不变式影响/代价/失效模式 | 5 个候选（C1–C5）+ 1 个否决变体（B3），影响栏无一留空（C4 写「零影响」并给依据） |
| 选项对比表每行含结论 + 理由 | §3，6 行 |
| 推荐单一、不并列 | §4.1 单一 C1；C4 明确标为「退化路径」而非第二推荐；§4.6 说明前置条件不构成第二推荐 |
| 至少一条否决理由直接引用 D4 | §4.2（B1/C2），逐字引用 `docs/adr/ADR-plan-delegate-engineering-session.md:77` |
| 区分权限层强制与协议层约定 | §5.1 / §5.2 |
| `path:line` 引用数 | 30+ 处（正文内） |
| 正文行数 | ≥100（见文件长度） |

## 8. 待父裁决

1. **C1 的承载者**：本节点按「隔离机制」推荐了 worktree + delegate 承载，但「由谁承载（build 自派 / plan 代派 / front 代派）」属 n5 与合稿的裁决面。若父会话认为 n2 不应涉及承载者，请把 §4.1 的「承载者必须是 delegate 系」降级为「必要前提」表述，结论（worktree）不变。
2. **是否把「不并行 + 上下文外置」写进推荐段**：BRIEF 把它列为「对照项」，本节点按「对照项 ⇒ 不推荐为首选」处理；若父会话希望它作为**并列的合法选项**（因为不新增权限面），需要在合稿中显式说明它不解决 TOPIC 的墙钟/上下文诉求。
3. **`general` shell 旁路（n1 §3.1-7）是否影响本节点**：不影响选型（它不构成「隔离」），但会让「没隔离也能写」这条路径一直存在；本文只登记（§5.1 边界诚实口径），未提关闭动作（属 n4/n7）。

## STATUS: COMPLETE
