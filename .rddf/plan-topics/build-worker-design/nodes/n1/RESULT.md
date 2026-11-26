# RESULT — n1：现有派发通道盘点

> 节点：`build-worker-design / n1`｜执行者：plan-worker（子会话）｜日期：2026-11-26
> 边界：只测绘「是什么、能与不能」，不做选型（n2–n7）、不改任何实现/配置/ADR。
> 分类标记：**【事实】**= 本仓可引 `path:line`；**【推断】**= 由事实推出、无单一出处；**【建议】**= 给父/下游节点的动作建议。凡涉上游行为且本仓无锚点者，标「上游语义（未在本仓核实）」。

---

## 0. 结论先行（可判定布尔陈述）

**【事实/判定】** 对「`build` 主会话是否存在**受治理的**并行实施通道」这一问题，答案是 **否（false）**：

- `build` 的 agent 配置块内**没有任何** `delegate` / `delegate_dispatch` / `delegate_sessions` / `delegate_suspend` / `delegate_cancel` 键 ⇒ 继承顶层五项 `deny`（`opencode.jsonc:30-34`；`build` 块 `opencode.jsonc:43-113` 全文无 delegate 项）⇒ 五个 delegate 工具对 `build` **不可见**（`docs/front-delegate-usage.md:26`：「其余 agent（含 build 与各 subagent）调用时工具根本不存在」）。
- 本仓**不存在** `build-worker`（或任何「可写子会话」）形态的 agent：`agent` 段共 12 个 agent，8 个 subagent 的 `edit` 全为 `deny`（`opencode.jsonc:542,691,838,981,1082,1228,1348,1491-1494`）⇒ 没有「能被派去改源码」的 subagent。
- 因此 `build` 只能**自己串行做**工程实施；它能拉起的子会话要么只读、要么（`plan-worker`）只能写 `.rddf/plan-topics/*`。

**【事实/判定】** 但「`build` 完全没有把工作交给另一个会话的通道」是 **假**：`build` 的 `subagent` 是字符串 `"allow"`（`opencode.jsonc:102`），且 `experimental.subagent_depth: 2`（`opencode.jsonc:7`）⇒ 它可拉起任何 `mode:"subagent"` 的 agent。其中 `general` 的 `shell` 首键是 `"*": "allow"`（`opencode.jsonc:1006`）且不在只读守卫集里（`scripts/agent-guard-rules.ts:84`）⇒ 存在一条**不受治理的写旁路**（无登记、无台账、无槽位、无 scope 差集）。这条旁路不构成「并行**实施**通道」，只构成「能把命令转给另一个会话执行」。

---

## 1. 通道清单表（6 条）

> 表内 7 列严格按 BRIEF 口径；类别标记内联在单元格（【事实】/【推断】）。

| 通道 | 机制 | 能做什么 | 不能做什么 | 权限依据(path:line) | 写隔离语义 | 并发语义 |
|---|---|---|---|---|---|---|
| **T1 宿主 `subagent`（通用）** | 宿主内建工具：建子会话、原生设 `parentID`、完成时把合成消息投回父、`sessionID` 可续接 | 派只读知识会话拿「回答」；子会话可并行 `background`；父被完成消息唤醒（join）；子会话自带磁盘续接能力 | 拉不起可写实施（`build` 是 primary，内核拒 primary 当 subagent：`lib/delegate-core.ts:1244` 注释 + `docs/adr/ADR-plan-multi-session-collaboration.md:14` 前置事实①）【事实】；**不传 per-session permissions**（同上 前置事实⑤）⇒ 权限是 agent 级静态；无登记/台账/槽位/scope 差集/停机门控（`docs/adr/ADR-plan-delegate-engineering-session.md:29`）【事实】 | 【事实】`opencode.jsonc:102`（build 全量 allow）、`opencode.jsonc:7`（depth=2）、`opencode.jsonc:386-393`（front 是字典白名单，不含可写 agent）、`tests/config-guards.test.ts:313,4573`（字符串 allow 集合 == {build, plan}） | **无写隔离**：写权=子 agent 自身 `edit`/`shell` 配置，与父的 worktree/scope 无关；父无法按次收窄（前置事实⑤）。`plan-worker` 是唯一「有写区但极窄」的形态：`edit` 只 `.rddf/plan-topics/*`（`opencode.jsonc:1491-1494`，前缀语义 ⇒ 只到 topic 树粒度） | **真并行**（同轮多次 `background:true`，`docs/adr/ADR-plan-multi-session-collaboration.md:68`）【事实】；无全局并发上限、无槽位互斥 ⇒ 两个子会话可同时写同一目录（除 `plan-worker` 的 topic 树内单一写者协议外无强制） |
| **T2 `delegate` 同步** | 插件工具（`plugins/delegate.ts:15`）：建/复用 session → 投递 brief → `session.wait` → 返回 `outcome` | 派**可写** `build` 后端做工程实施；返回交付证据（`changed_files`/`out_of_scope_files`/`outcome`/`last_assistant_text`）；`resume_session` 续接；`remove` 可回收 | `build` 不可见（无 delegate 键）；同 `workRoot` 已有活跃后端 ⇒ 拒；不并行、不排队；单一 brief 一次一个目标 | 【事实】`lib/delegate-core.ts:2325`（`options.permission: "delegate"`）、`opencode.jsonc:228-232`（plan）、`opencode.jsonc:395-399`（front）、`opencode.jsonc:30`（顶层 deny） | **强**：`scope` 派生 session 级 `edit` 规则（`lib/delegate-core.ts:1266-1288` 的 `classPermissions` + `scopeEditRules`），`kind=engineering` 才给 `subagent` 白名单（`:1283`）；委托前后 `git status` 差集算越界（`:2504,2593-2604`）；但 `shell` **不受** scope 约束（`prompts/build.md:693`）【事实】 | **串行**：同 `workRoot` 单槽（`lib/delegate-core.ts:2357-2378`）；`wait` 最长 30 分钟（`:2557-2573`），返回即自翻转 `idle` 释放槽位（`:2634-2636`）⇒ 一个 worktree 同时只有一个写者 |
| **T3 `delegate` 异步 `dispatch`** | 同一插件的异步面：投递即返回（等「消费确认」，不等完成）；配 `sessions`/`suspend`/`cancel` | 一次派多个后端（跨**不同** worktree 才有意义）；`sessions` 只读查名册；`suspend` 让槽保上下文；`cancel` 停机取证后墓碑 | 同 `workRoot` 第二次派发被拒（不排队）；全局在跑上限默认 3，超限 fail-fast；`dispatch` 返回 ≠ 完成 | 【事实】`lib/delegate-async.ts:76,1213`（`delegate_dispatch`）、`:96`（`DEFAULT_MAX_ACTIVE_BACKENDS = 3`）、`:1337-1347`（超限诊断列占额者）、`opencode.jsonc:229,396` | 同 T2（同一个 `classPermissions`，`:1361-1367`；建会话时传 `permissions`：`:1371-1376`）——**注意**这是本仓唯一「per-session 权限」的落地点，与 T1 的「不传 permissions」形成对照 | **并行但受双重上限**：per-`workRoot` 单槽 + 全局配额 ⇒ 实际并发度 = min(活跃工作树数, 3)（`docs/adr/ADR-front-multi-backend.md:251`）；`claimSlot` 在锁内重验占槽者（`lib/delegate-async.ts:594-640`） |
| **T4 `.rddf/plan-topics/**` 协作区** | 版本化目录 + 宿主 `subagent` 派 `plan-worker`；每文件单一写者；`graph.json` 派生状态 + per-topic 独占锁 + checker CLI | 根会话并行推进多个讨论 node；子会话进度跨会话存活（`TODO.md` 恢复锚点）；fork/join 可机判（deps 派生）；可取消（`cancelled` 声明字段） | **只产离线讨论产物**：`plan-worker` 无 `delegate`（`opencode.jsonc:1502-1506`），且 `.rddf/plan-topics/**` **不在** `PLAN_REF_ROOTS` ⇒ 协作产物不能直接当 `plan_ref` 派工程（`lib/delegate-core.ts:1321-1326`；`docs/adr/ADR-plan-multi-session-collaboration.md:51`）；写域只能到 topic 树粒度（不可到 node）；无派发事前闸门 | 【事实】`opencode.jsonc:1356-1508`（plan-worker 全套）、`:218`（plan 可写 `*.rddf/plan-topics/*`）、`docs/adr/ADR-plan-multi-session-collaboration.md:42-50`（单一写者表）、`:110-115`（D7 锁与并发上限） | **协议级，非权限强制**：`edit` 白名单前缀语义 + 单一写者约定 + 独占锁 + 事后 `scope-check`（`docs/adr/ADR-plan-multi-session-collaboration.md:213` 自述「已知最弱一环」）；并行下越界只能做 **topic 级 union 核对**（同文件 `:255` V10） | **并行**（同轮多 `background`），同 topic 由 `.rddf/state/plan-topics/<slug>.lock` 独占，每轮扇出上限写在 prompt 里、**不是**机械闸门（`:115`） |
| **T5 `rdd-builder` 的 worktree/branch 准备** | builder 角色 + `rdd-builder` skill 的 P2 worktree 模式；`execute` skill 要求「worktree context 已设 或 lightweight」 | 为一批改动准备独立工作树（`git worktree add`）与分支，使「同仓并行」在 delegate 的单槽模型下变得可行 | **不自动创建**：插件拿不到 `projectID`，`ctx.worktree.create` 不可用 ⇒ 自动建 worktree 被刻意后置；无生命周期/清理策略；`build` 自身不能用它派活（只是准备目录） | 【事实】`prompts/build.md:412`（builder 行：`rdd-builder` / `execute` 的前置条件）、`docs/adr/ADR-front-multi-backend.md:175`（自动创建后置）、`:321,368`（目录需显式准备）、`prompts/front.md:78`、`docs/front-delegate-usage.md:308`；**上游语义（未在本仓核实）**：`skills/rdd-builder/SKILL.md` 的 P2 细节不在本仓 | **工作树级**：不同 `workRoot` ⇒ 独立 git index/工作树 ⇒ 写同一文件互不覆盖（`docs/adr/ADR-front-multi-backend.md:157`）；同 worktree 内仍是单槽 | **并行度来源**：并行不是靠「多会话」，而是靠「多工作树 + 每树一槽」；缺这步 ⇒ 同仓只能串行（`prompts/front.md:78`） |
| **T6 `subagent`→`general` 的 shell 写旁路（不受治理）** | `build` 拉 `general` 子会话，后者 `shell` 首键 `"*": "allow"` | 可把 shell 命令转给另一个会话执行（`>` / `tee` 等重定向在 general 块内**无 deny** ⇒ 实际可写盘）；能读、能跑测试类命令 | 无 `edit`（`opencode.jsonc:1082` 为 `deny`）⇒ 改文件只能靠 shell 重定向；无登记/台账/槽位/scope 差集/停机门控；无审查者、无 `acceptance` 判据 | 【事实】`opencode.jsonc:989-1091`（general 全块）、`:1006`（shell `*: allow`）、`:1082`（edit deny）、`:1088`（subagent deny）；`scripts/agent-guard-rules.ts:84`（`GUARDED_AGENTS` **不含** general，也不含 build） | **无**：写隔离全靠 general 的 shell 白名单尾部 deny（`git push`/`rm -rf`/`.env` 等，`opencode.jsonc:1051-1080`），但 `>` / `tee` / `sort -o` 这类在 general 块里**没有**通用守卫（对比 `scripts/agent-guard-rules.ts:44-60` 的 `COMMON_GUARDS` 只施加于 `GUARDED_AGENTS`）【推断：由两份清单差异直接推得】 | 可并行（同 T1），但**没有任何互斥**⇒ 两个 general 子会话可同时写同一 worktree |

### 1.1 逐通道补充（含「为什么要单列」）

**【事实】T2/T3 是**同一条门控边界的两面**：`delegate` 与 `dispatch` 共用同一张槽位表（`lib/delegate-core.ts:2372` 错误文案「既有 delegate 与 dispatch 共用槽位表」），共用同一个 `classPermissions`（`lib/delegate-async.ts:1360-1367` 注释「单一实现，D8」）。因此「同步 vs 异步」不是两条能力，而是两种等待语义。

**【事实】T3 的「并行」在本仓的官方口径是**跨工作树**：`docs/front-delegate-usage.md:27` 与 `prompts/front.md:78` 都写「同一个仓要并行，必须先是不同的 git worktree」。⇒ 即使把 build 接进 delegate，**同 worktree 并行仍被刻意排除**（见 §3 的刻意项 K2/K3）。

**【事实】T4 与 T1 是同一宿主工具，但语义不同**：`docs/SUBAGENT-ORCHESTRATION.md:55-59` 明确「plan 侧离线协作是 `subagent` 的**第二种用法**，不是 delegate 通道」，且「不占 delegate 的 `workRoot` 单槽」。⇒ 「用 subagent 做协作」与「用 delegate 做实施」在本仓是**两条并列的分工**，不是同一条通道的强弱两档。

**【事实】T5 不是「派发通道」，而是「并行前置条件」**。它不把工作交给另一个会话，只把**物理写域**切开。BRIEF 要求覆盖它的原因正在于此：本仓的并行语义是「先切工作树，再谈会话」。

**【推断】T6 为什么必须单列**：`docs/adr/ADR-plan-delegate-engineering-session.md:29` 断言「`subagent` 的定位是临时、只读、单次问答的子会话」，并以「用 subagent 拉一个可写 agent 会得到能写但没有保护的通道 —— 比没有更危险」为由否决该路径。但当前配置里 `general` 的 `shell: "*": allow`（`opencode.jsonc:1006`）与「只读」不一致；`general` 也不在 `GUARDED_AGENTS`（`scripts/agent-guard-rules.ts:84`，该文件头注释自述「五个只读 subagent 的 shell 守卫规则 —— 唯一真源」）。⇒ ADR 的「只读」口径与配置在 `general` 一行上**不一致**，属可核事实，非本文评价。

---

## 2. 可派矩阵

### 2.1 权限可达（配置层事实）

| 调用方 ↓ | 可拉的 subagent（配置层） | delegate 五动作 | 依据 |
|---|---|---|---|
| `build` | **全部** subagent（字符串 `allow`）：explore / librarian / oracle / metis / general / critic / context-builder / plan-worker | **全不可见**（继承顶层 deny） | `opencode.jsonc:102,30-34`；`tests/config-guards.test.ts:313` |
| `plan` | **全部** subagent（字符串 `allow`） | 五项 **allow** | `opencode.jsonc:226,228-232` |
| `front` | 字典白名单：explore / librarian / oracle / metis / critic（`"*": "deny"` 打头） | 五项 **allow** | `opencode.jsonc:386-393,395-399` |
| `librarian` | 只 `explore` | 无 | `opencode.jsonc:694-697` |
| 其余 subagent（explore / oracle / metis / general / critic / context-builder / plan-worker） | 全 `deny` | 无 | `opencode.jsonc:545,841,984,1088,1231,1351,1500` |
| `title` | 无 `permission` 块（默认） | 无 | `opencode.jsonc:1247-1252` |

**【事实】`build` → `plan-worker` 是「权限可达但流程无消费者」的典型**：`docs/MULTI-AGENT-DESIGN.md:659` 明确「**流程上只由 plan 派**（`prompts/build.md` 未列该路径）⇒ 权限可达 ≠ 流程有消费者」；实测 `prompts/build.md` 全文无 `plan-worker` / `plan-topics` 命中（`grep` 零命中）。

**【事实】同类但方向相反的一例：`context-builder`**：`docs/MULTI-AGENT-DESIGN.md:656` 记「权限拓扑上 build/plan 均可调」但「流程上只由 build 调用」。⇒ 该矩阵必须带「有无消费者」列，否则会把「权限上限」误读成「既有能力」。

### 2.2 有效可派（流程层事实）

| 调用方 ↓ | 实际会被派的对象 | 依据 |
|---|---|---|
| `build` | explore / librarian / oracle / metis / critic / context-builder / general（**只读**，产物是「回答」或一次性 shell 结果） | `prompts/build.md:37-42`；`docs/MULTI-AGENT-DESIGN.md:642-653` |
| `plan` | metis（优先）/ explore / librarian / oracle；`plan-worker`（离线协作） | `docs/MULTI-AGENT-DESIGN.md:645,675-680` |
| `front` | 5 个只读 agent；工程实施**经 delegate 插件**（不是 agent 委派，`docs/MULTI-AGENT-DESIGN.md:657`） | `opencode.jsonc:386-399` |

**【推断】** 综合两表：本仓**唯一**「把写动作交给另一个会话」的流程化路径是 **front/plan → delegate → agent=build 的后端**。`build` 处在**被派方**，不在派方 ⇒ 没有任何上游角色把「build 拆成多个 builder」这一能力交给 build 自己。

---

## 3. `build` 缺口的判定：能力缺口 vs 刻意串行化

### 3.1 刻意（有决策文本 / 有不变式）—— 不是缺口

**【事实】K1：`delegate` 从设计起就是「仅 front 可得」，并把 build 明确列为「不可见」的验收项。**
- `.rddf/state/adr-front-agent-redesign.md:143`：「### D6 门控与登记（`delegate` **仅 front 可得**）」；
- 同文件 `:225` 的验收条目：「除 front 外任一 agent（**build**/plan/general/各 subagent）调用 `delegate` 时工具不可见」；
- 同文件 `:32`：「front 收敛为只读交互内核；一切工程行动经唯一的 `delegate` 插件工具转交工程 session」。
⇒ build 无 delegate 是**被写进验收判据的设计**，不是遗漏。

**【事实】K2：`build` 自身就是那个「被派发的可写后端」；给它派发能力等于允许「后端再派后端」。**
- 后端 agent 白名单 = `build` + 5 个只读（`lib/delegate-core.ts:105`；`docs/adr/ADR-plan-delegate-engineering-session.md:15` 前置事实⑦）；
- 被派发后端拿到的权限里，`subagent` 是「`deny *` + 5 个只读 allow」，**不含**任何可写 agent（`lib/delegate-core.ts:1246-1253`，且 `:1283` 只在 `kind=engineering` 时注入）；
- `budget`/`role_class` 的写集在创建时定型、`resume` 不重设（`prompts/build.md:690`）⇒ 后端若再派写会话，会把「一次派发一个角色类」这条不变式打穿。
⇒ 「build 拿不到 delegate」是**防止递归后端**的结构性选择。

**【事实】K3：同 `workRoot` 单槽 + 「同 worktree 同角色至多一个活跃 session」是刻意的串行化。**
- 单槽理由原文：「单槽是写隔离的来源；按 owner 分槽会让两个后端同时写同一工作树，破坏 `scope` + `git status` 差集检测的前提」（`docs/adr/ADR-plan-delegate-engineering-session.md:77`）；
- 槽位键 = `workRoot`，且「两个 linked worktree 各占一槽 ⇒ 同工作树内一次一个」（`docs/adr/ADR-front-multi-backend.md:155-157`）；
- 角色租约：键 = `(workRoot, 角色)`，`EXCLUSIVE_ROLES` 含 `builder`（`lib/role-lease.ts:262,284`），他人持有且存活 ⇒ 拒（`:481-488`）；`prompts/build.md:196` 记「同一 worktree 同角色至多一个活跃 session；无租约 ⇒ 只能读 + 报告」。
⇒ 即使明天做出 `build-worker`，**只要它落在同一 worktree 且工作角色是 builder，就会撞租约**。这是刻意的写隔离，不是「缺一个开关」。

**【事实】K4：worktree 自动创建被**刻意**后置。**
- `docs/adr/ADR-front-multi-backend.md:175`：「每后端一个 git worktree 的**自动创建**仍不在本篇：`ctx.worktree.create` 需 `projectID` 而插件拿不到 ⇒ 需插件自建 `git worktree add`，生命周期与**清理策略**全归插件（**不配即定时炸弹**）」；`:321` 记「不做清理策略即定时炸弹」。
⇒ 「并行要先人工准备 worktree」是**有意的代价项**，不是实现没跟上。

**【事实】K5：plan-worker 的写入面被刻意收在讨论树内，且**不能**升级为工程派发。**
- `docs/adr/ADR-plan-multi-session-collaboration.md:119`（D8 关闭范围）：「**不做**：子会话派工程实施（`plan-worker` 无 `delegate`）」；
- 同文件 `:51`：`PLAN_REF_ROOTS` **不含** `.rddf/plan-topics/**` ⇒ 协作产物不能直接当 `plan_ref`。
⇒ 「子会话能写但只写讨论产物、不能派工程」是**明写的边界**，与「build 缺通道」是两件事（前者是 plan 侧的主动设限）。

### 3.2 能力缺口（无决策文本、无机制承载）

**【事实】G1：没有任何 agent 形态能把「工程实施」拆给多个受治理的会话，除 front/plan 之外。**
- 8 个 subagent 的 `edit` 全为 `deny`（`opencode.jsonc:542,691,838,981,1082,1228,1348,1491-1494`）；
- 唯一有写的 subagent 是 `plan-worker`，写域 = `.rddf/plan-topics/*`（`:1491-1494`），且 `delegate*`/`subagent`/`skill`/`question` 全 deny（`:1500-1506`）。
⇒ 「可写 + 受治理」的会话只有 `agent=build` 一种，而它的**唯一入口**在 front/plan 手里。

**【事实】G2：`build` 无法把自己手上的实施工作交给任何写会话 —— 因为它既没有 delegate（§0），也没有可写的 subagent 可派。**
- 它流程上可派的 7 个对象（explore / librarian / oracle / metis / critic / context-builder / general）`edit` **全为 `deny`**；其中 6 个连 `shell` 也是只读白名单，只有 `general` 的 `shell` 首键是 `"*": "allow"`（T6，不受治理）；
- `docs/adr/ADR-plan-delegate-engineering-session.md:23` 记 plan 侧的同一缺口（「plan 只有 subagent，没有任何工程行动出口」）并据此立项 —— **build 侧的这一条从未被立项，也没有被否决**（`docs/adr/` 全目录无对应篇；`docs/MULTI-AGENT-DESIGN.md:642-653` 矩阵中 build 行在 delegate 面为空）。

**【事实】G3：大改造只能单会话串行，且上下文/墙钟随规模线性增长 —— 这是 TOPIC 的前提，本仓无相反机制。**
- `build` 的上下文与执行都在单一 primary 会话内（`opencode.jsonc:37-42`），`subagent` 只能拿回「回答」，不能分摊写；
- delegate 后端虽可承接实施，但入口不在 build（§2）⇒ build 面板上不存在「拆批」动作。

**【推断】G1–G3 合起来即「能力缺口」的判定依据**：这里的缺口不是「某个开关被关掉」，而是**从来没有任何设计把 build 当作派发主体**；K1–K5 只解释了 *为什么 build 不该拿到既有 delegate 通道*，**没有**解释「为什么 build 不该有自己的并行实施形态」——后一问题在本仓**没有决策文本**。

### 3.3 一句话区分

**【事实/判定】** 「`build` 没有 delegate」= **刻意设计**（K1/K2，有验收判据）；「`build` 没有**任何**并行实施形态」= **能力缺口**（G1/G2，无决策文本）；「同 worktree 内并行写」= **刻意排除**（K3，有不变式）。

---

## 4. 结论段

**【事实/判定】** `build` 主会话**不存在**受治理的并行实施通道：它既无 `delegate` 五动作（`opencode.jsonc:30-34,43-113`），也无任何可写子会话形态（8 个 subagent 的 `edit` 全 `deny`），唯一的源码写旁路（`general` 的 shell，`opencode.jsonc:1006`）不携带任何登记/槽位/scope/停机证据语义。**其中「无 delegate」是刻意（K1/K2），「无任何并行实施形态」是能力缺口（G1/G2），而「同 worktree 并行写被拒绝」是刻意的写隔离不变式（K3）** —— 三者必须分开记账，否则会把「不该给 build 开 delegate」误当成「build 不需要并行能力」。

---

## 5. 事实清单（本仓可核，供 n2–n7 复用）

| # | 断言 | 类别 | 依据 |
|---|---|---|---|
| F1 | 顶层五个 delegate 动作全 `deny` | 事实 | `opencode.jsonc:30-34` |
| F2 | `build` 块无 delegate 键；`subagent` 为字符串 `allow` | 事实 | `opencode.jsonc:43-113,102` |
| F3 | `plan` / `front` 各 allow 五项 | 事实 | `opencode.jsonc:228-232,395-399` |
| F4 | 后端白名单 = `build` + 5 个只读 | 事实 | `lib/delegate-core.ts:103-105` |
| F5 | `PLAN_REF_ROOTS` 四根，不含 `plan-topics` | 事实 | `lib/delegate-core.ts:1321-1326` |
| F6 | `plan_ref` 校验只判「根内 + 存在」，不判相关性 | 事实 | `lib/delegate-core.ts:1358-1384`；ADR D2 `:59` |
| F7 | 同步 delegate 用 `session.wait` 阻塞等待，30 min 上限 | 事实 | `lib/delegate-core.ts:2555-2573` |
| F8 | 同步 delegate 返回即 `idle`（不占槽） | 事实 | `lib/delegate-core.ts:2634-2636` |
| F9 | 异步 `dispatch` 全局上限默认 3，超限不排队 | 事实 | `lib/delegate-async.ts:96,1337-1347` |
| F10 | `claimSlot` 在锁内重验占槽者；`planSlot` 活体判定在锁外 | 事实 | `lib/delegate-async.ts:533-563,594-640` |
| F11 | 两面对称：建会话时传 per-session `permissions` | 事实 | `lib/delegate-core.ts:2473-2479`；`lib/delegate-async.ts:1371-1376` |
| F12 | 宿主 `subagent` 不传 permissions（权限 = agent 级静态） | 事实（上游语义，本仓以 ADR 记录为据） | `docs/adr/ADR-plan-multi-session-collaboration.md:14` 事实⑤ |
| F13 | `subagent` L1 硬门挂在 `tool.hook("execute.before")`，只对 `critic` 生效且默认 `warn`（不拦） | 事实 | `plugins/subagent-contract.ts:87-90,130`；`subagent-contract.json:2-5`；`lib/subagent-contract-core.ts:114-142` |
| F14 | `GUARDED_AGENTS` = front + 5 只读 + plan-worker；**不含** build、general | 事实 | `scripts/agent-guard-rules.ts:84` |
| F15 | 角色租约独占 `(workRoot, builder)`，他人存活 ⇒ 拒 | 事实 | `lib/role-lease.ts:262,284,481-488` |
| F16 | 写门只门控 build 主会话；后端/非 build agent 一律 skipped（放行） | 事实 | `lib/role-policy.ts:520-526,538-545` |
| F17 | plan 侧并行 = 同轮多 `background`，不占 delegate 槽位 | 事实 | `docs/adr/ADR-plan-multi-session-collaboration.md:68`；`docs/SUBAGENT-ORCHESTRATION.md:59` |
| F18 | 同 topic 并发由 `.lock` 独占；扇出上限只是 prompt 约定 | 事实 | `docs/adr/ADR-plan-multi-session-collaboration.md:113-115`；`scripts/plan-topic-check.ts:297` |
| F19 | 并行写隔离在并行下只能做 topic 级 union 核对（无法按节点归因） | 事实 | `docs/adr/ADR-plan-multi-session-collaboration.md:255`（V10） |
| F20 | `build` 是 primary，内核拒它当 subagent | 事实（注释 + ADR 前置事实①） | `lib/delegate-core.ts:1244`；ADR `:14` |

---

## 6. 待父裁决 / 不确定项

1. **【推断，需父确认】「能力缺口 vs 未设计」的措辞**：本文判定为「能力缺口（无决策文本、无机制承载）」。若父认为「凡是没人提需求的能力缺失都算缺口」口径太宽，可改写为「未设计（no decision on record）」，但布尔结论（无并行实施通道）不变。
2. **【事实，需上游核实】T5 的 P2 细节**：`skills/rdd-builder/SKILL.md` 不在本仓（`glob skills/**` 只有 `cpp-pro`），P2 的 worktree 分支命名/清理策略属**上游语义（未在本仓核实）**；本仓锚点仅到「builder 角色用 rdd-builder；`execute` 需 worktree context 或 lightweight」（`prompts/build.md:412`）。
3. **【事实，配置与文档不一致，登记不评价】`general` 的 `shell: "*": allow`**（`opencode.jsonc:1006`）与 ADR「subagent 只读」口径（`docs/adr/ADR-plan-delegate-engineering-session.md:29`）、以及 `scripts/agent-guard-rules.ts:84` 的守卫覆盖面不一致。这不是本 node 的裁决对象，但会被 n2（写隔离选型）当作现成反例使用。
4. **【建议】给 n2/n6 的两个直接输入**：① 任何「多 worker」设计都必须先回答「与 `(workRoot, builder)` 租约独占的关系」（F15），否则第一个 worker 就会被租约或单槽拒；② 任何「多 worker」设计都必须先回答「写域是 topic 树那种前缀白名单，还是 delegate 那种 per-session `permissions`」（F11 vs F12）—— 本仓**两种都有先例**，且都自带已知缺口（F19 / `prompts/build.md:693` 的 shell 不受 scope 约束）。
5. **【建议】给 n4（判据面）**：本仓「唯一真实闸门」是 `bun test tests/` + `scripts/check-upstream-anchors.sh`（`docs/adr/ADR-plan-multi-session-collaboration.md:14` 事实⑧）；`plan-worker` 类形态**不能跑 bun**（`tests/config-guards.test.ts:4570` 断言 shell 不得 allow bun/node）⇒ 若 build-worker 沿用该形态，判据只能由主会话跑。

---

## STATUS: COMPLETE
