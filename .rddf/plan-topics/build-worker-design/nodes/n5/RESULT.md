# RESULT — n5：与 delegate 全局单槽的关系

> 节点：`build-worker-design / n5`｜执行者：plan-worker（子会话）｜日期：2026-11-26
> 边界：只判定「`build` 的多 wave 并行实施通道」与既有 `delegate` 全局单槽的**关系**（并存 / 替代 / 分槽）；不改 `delegate` 实现、不重做 n2 的隔离选型、不设计 n3 的合并语义。
> 标记：**【事实】**= 本仓可引 `path:line`；**【推断】**= 由事实推出、无单一出处；**【建议】**= 给父会话/下游节点的动作建议。涉上游行为而本仓无锚点者标「上游语义（未在本仓核实）」。
> 引用口径：行号一律取自**活配置** `opencode.jsonc`（非 `.opencode-go` 副本，两份 offset 不同；n2 的引用同样事实、不同行号）。

---

## 0. 结论先行

**判定 A（关系，唯一推荐）：替代 —— 把 `build` 的实施纳入既有 `delegate`，`build` 只做编排；不为 `build` 新建实施通道、不细分 delegate 的槽位。**

- 「多 wave 并行」不靠「更多写者同处一棵工作树」，而靠 n2 选定的 **linked worktree 隔离**；在 worktree 维度上，delegate 的单槽**本来就是并行的**（槽位键 = `workRoot`，两棵树两把键）。
- 因此新能力应当表达为「**`build` 成为 delegate 的第三个派发主体**」，而不是「第二条通道」。这与 D1 把 plan 加进来是同一种动作（扩主体，不扩通道）。

**判定 B（明确否决）：**
1. **否决「并存」**（新通道自建槽位）—— 会产生**同一 worktree 上两个合法写者入口**，并使 `pair.json` 不再是唯一真相源。
2. **否决「分槽」**（按 `owner_agent` 细分槽位）—— 正面撞 D4 的原文论证（`docs/adr/ADR-plan-delegate-engineering-session.md:77`），且**即使分了槽也仍被角色租约挡住**，属「改了最贵的地方、还得不到并行」。
3. **否决「build-worker 走 `subagent`、不要槽位」**（即 n1 的 T6/G1 路线的温和版）—— 宿主 `subagent` 不传 per-session 权限（`docs/adr/ADR-plan-multi-session-collaboration.md:14` 前置事实⑤），且 `role-gate` 对 `parentID != null` 的会话**整段跳过**写集与租约校验（`plugins/role-gate.ts:150-155`、`lib/role-policy.ts:520-526`）⇒ 写隔离为**零强制**。

**判定 C（时序，硬约束）：替代必须「机制同批」落地，不得先开权限。** 直接给 `build` 加五项 `delegate: allow` 会在三处立刻产生反向效果：后端递归（§4-C6）、`plan_ref` 门对 build 整体失效（§4-C5）、`owner_agent` 把 build 塌成 front（§4-C2）。这三条都**不是**「后续再补」，而是**开权限当天就生效**。

**一句话**：单槽不是一条不变式，而是**共用同一个 `workRoot` 键的四件机制**（槽位表 / 角色租约 / 停机守卫 / 差集基准）。「并存」要复制这四件，「分槽」要拆掉其中一件，只有「替代 + 换工作树」能四件全留。

---

## 1. 输入与口径（消费 n1 / n2，不重复其结论）

**【事实】n1 的可用结论**（`nodes/n1/RESULT.md:11-17,127,133`）：
- `build` 无 delegate 是**刻意**（K1/K2，有验收判据）；「无任何并行实施形态」是**能力缺口**（G1/G2，无决策文本）；「同 worktree 并行写」是**刻意排除**（K3，有租约与单槽两条不变式）。
- `build` 唯一「不受治理的写旁路」是 `subagent → general` 的 `shell: "*": allow`（`opencode.jsonc:1006` 同块），无登记/槽位/差集/停机证据。

**【事实】n2 的可用结论**（`nodes/n2/RESULT.md:9-26,327-328`）：
- 写隔离单元 = **一个 linked worktree**；承重不变式 = **每 worktree 恰一个可写会话**，它是 delegate 单槽语义的**字面沿用**，不是新机制；
- 强制等级**取决于通道**：走 delegate ⇒ 权限层（per-session `scope`），走 subagent ⇒ **仅协议层**（§6.2/6.3）；
- 明确交办：若 n5 把单槽改成仓库级，A 立刻失效。

**【建议】本节点的定位**：n2 已经选定了「并行单元」，n5 只回答「走哪条既有通道去落这个单元」。因此本节点的推荐**必须**与 n2 的「每树一写者」相容 —— 这也是「分槽」被否决的独立理由之一。

---

## 2. 事实底座（本仓可核，供 n3/n4/n7 复用）

| # | 断言 | 类别 | 依据 |
|---|---|---|---|
| N1 | 顶层五个 delegate 动作全 `deny`；`build` 块内**无** delegate 键 | 事实 | `opencode.jsonc:30-34`、`:37-113` |
| N2 | `plan` / `front` agent 级各 allow 五项 | 事实 | `opencode.jsonc:228-232`、`:395-399` |
| N3 | `build` 的 `subagent` 是字符串 `allow`，`experimental.subagent_depth: 2` | 事实 | `opencode.jsonc:102`、`:6-8` |
| N4 | 槽位键 = `workRoot`；占槽者结构体带 `owner_agent` / `owner_session_id` | 事实 | `lib/delegate-core.ts:160-178`（`:173-174` 取 owner 字段） |
| N5 | 同 `workRoot` 有占槽者 ⇒ 拒绝（不排队）；跨 owner-kind ⇒ 指名占用者、不抢占 | 事实 | `lib/delegate-async.ts:635-639`、`:1434-1447`；`lib/delegate-core.ts:2357-2378` |
| N6 | `owner_agent` 只有两个取值；**非 plan 一律按 front 解释** | 事实 | `lib/delegate-core.ts:1413-1415`、`:173` |
| N7 | 归属判活唯一实现 = `frontAlive`（owner 会话是否仍存在） | 事实 | `lib/delegate-core.ts:1392-1399` |
| N8 | 跨 owner-kind 的 resume / cancel **硬拒**，owner 已亡 ⇒ 放行（亡主例外） | 事实 | `lib/delegate-core.ts:2427-2446`；`docs/adr/ADR-plan-delegate-engineering-session.md:98-105,117` |
| N9 | 停机守卫是**进程内**标记集，键 = `(stateRoot, workRoot)` | 事实 | `lib/delegate-core.ts:393-397`、`:2350-2356` |
| N10 | 停机证据 = `wait` 返回 ∧ 判活为假 ∧（基线在跑时）水位线前移；「任一判不出来 ⇒ 不释放槽位」，且 `cancel` 同样适用 | 事实 | `docs/adr/ADR-front-stop-confirmation.md:32,34-38,61` |
| N11 | 差集 = 派发前 `git status` 快照 vs 派发后快照，**基准是 `workRoot`**，`scope` 越界按绝对路径前缀判 | 事实 | `lib/delegate-core.ts:530-550,2593-2604` |
| N12 | 角色租约独占 `(workRoot, 角色)`；`builder` 在独占集；后端租约在 `claimSlot` 同一临界区申请 | 事实 | `lib/role-lease.ts:284,693-748`；`lib/delegate-async.ts:657-680`；`lib/delegate-core.ts:1854-1866` |
| N13 | `role-gate` 只对 `gated` 会话校验租约；`parentID != null` ⇒ 整段跳过 | 事实 | `plugins/role-gate.ts:150-155`、`lib/role-policy.ts:520-526` |
| N14 | `classPermissions` **不含任何 delegate 规则**；且 session 规则排在 agent 规则之后（last-match-wins）⇒ 未列出的动作**沿用 agent 级值** | 事实 | `lib/delegate-core.ts:1266-1288`（无 delegate 项）、`:2460-2462`（顺序注释）、`:2463-2478`（随 `session.create` 下发） |
| N15 | `plan_ref` 必填的判据是 `callerAgent === "plan" && kind === "engineering"` | 事实 | `lib/delegate-core.ts:2337-2342`；`lib/delegate-async.ts:1227-1232` |
| N16 | `PLAN_REF_ROOTS` 四根，含 `.rddf/plans/**`（**builder P1 的 TDD 计划**），**不含** `.rddf/plan-topics/**` | 事实 | `lib/delegate-core.ts:1321-1326`；`docs/adr/ADR-plan-delegate-engineering-session.md:57` |
| N17 | 相对 `plan_ref` 的解析根 = `project_dir`（即目标工作树），绝对路径按全路径判根 | 事实 | `lib/delegate-core.ts:1373-1379` |
| N18 | 全局活跃后端上限默认 3，计数 **owner 无关** | 事实 | `lib/delegate-async.ts:96-100,1337-1348,1608` |
| N19 | `sessions` 展示层按 `metadata.front_session_id === 调用方 session id` 过滤 | 事实 | `lib/delegate-async.ts:1605-1613` |
| N20 | `build` 的 `edit`/`shell` 均为 `"*": "allow"`；后端 `shell` **不受** `scope` 约束 | 事实 | `opencode.jsonc:50-54,58-59`；`prompts/build.md:693` |
| N21 | `builder` 角色的内置流程包含「写 `.rddf/plans/<name>.md`（TDD 5 步）」 | 事实 | `prompts/build.md:412` |
| N22 | `plan-worker` 的 `delegate*` 全 deny（它是「有写区但无派发」的唯一 subagent 先例） | 事实 | `opencode.jsonc:1491-1506` |

**【建议】** n1 的 F 表与本表重叠项以两边一致为准；若二者冲突，以本次直读的 `path:line` 为准并回改 n1（本次未发现冲突）。

---

## 3. 机制解剖：所谓「全局单槽」实际是四件共用 `workRoot` 键的机制

这一节是本节点的**判别性分析**。把「单槽」当成一条不变式，会得出「改一个谓词就能分槽」的错误结论；实际它是四件机制：

**3.1 槽位表（`pair.json`）** —— 键 = `workRoot`（N4）。决定「这次派发能不能开工」，且是全仓**唯一**的槽位真相源（`docs/adr/ADR-front-multi-backend.md:83`「后端身份 + 目标 + 槽位状态」）。

**3.2 角色租约（`role-claims.json`）** —— 键 = `(workRoot, 角色)`（N12）。它与槽位表**独立**：即使槽位表允许两个写者，同一 worktree 的同角色第二个写者仍被租约拒。⇒ **「分槽」不足以产生并行**，这是它被否决的技术理由（不是口径理由）。

**3.3 停机守卫（进程内标记集）** —— 键 = `(stateRoot, workRoot)`（N9）。它的作用是「被 suspend/cancel 的窗口内不许新写者进来」，即**释放槽位与准入之间的缝**（`docs/adr/ADR-front-stop-confirmation.md:47,67`）。它按 worktree 而不是按通道计。

**3.4 差集基准（`git status @ workRoot`）** —— 差集回答「这次委托改了哪些文件」，基准只能是 `workRoot`（N11）。它是**事后归因**的唯一手段，也是 `out_of_scope_files` 的全部数据来源。

**⇒ 结论（【推断】由 N4/N9/N11/N12 直接推出）**：四件机制的共同键都是 `workRoot`，这才是「单槽 = 写隔离来源」的真实含义（ADR 原文只说了一句「单槽是写隔离的来源」，机制上是这四件）。任何新增并行入口，
- 若**不共用**这四件 ⇒ 在 `workRoot` 上出现一个不受租约、不受停机守卫、不受差集覆盖的写者（**并存**的必然后果）；
- 若**共用**这四件 ⇒ 它就不是「第二通道」，只是同一通道的第二种调用方式（即**替代**）。

这就是本节点结论的机制根据：**三种处置里只有一种没有新增写者入口。**

---

## 4. 冲突点清单（9 条）

> BRIEF 要求的五类（槽位竞争 / owner 语义 / 停机证据适用性 / 差集失效 / `PLAN_REF_ROOTS`）在 C1–C5 逐条对上；C6–C9 是本次直读新发现的、同等级的四条。

### C1 槽位竞争：新通道要么撞槽，要么绕过槽（**双向死路**）

- **冲突描述**：若新通道复用 `pair.json` 槽位表 ⇒ 同 worktree 第二个写者被 `claimSlot` 拒（N5），「并行」只剩跨 worktree 一种形态 —— 而此时它已等价于「替代 + 换树」，不需要新通道；若新通道自建槽位表 ⇒ 两张表互不可见，同一 worktree 上 delegate 后端与新 worker 可同时写。
- **触发条件**：任何「同一工作树、≥2 个 build 写者」的调度。
- **涉及不变式**：「同工作树一次一个后端」（`docs/adr/ADR-plan-delegate-engineering-session.md:76`）+「每文件一写者」（`docs/adr/ADR-plan-multi-session-collaboration.md:40-48`）。
- **依据**：`lib/delegate-core.ts:160-178`；`lib/delegate-async.ts:594-640`。

### C2 归属门控的 owner 语义：`owner_agent` 是二值枚举，build 无处安放

- **冲突描述**：`ownerAgentOf` 把非 plan 一律映射为 front（N6）。若给 `build` 开 delegate 而不改枚举，则 build 派出的后端**在台账里冒充 front**：① `sessions` 归属、② `priority_blocked.caller_kind`、③ 跨 owner-kind 的 resume/cancel 硬拒判据（N8）三处同时把 build 当 front；后果是 **front 可 resume/cancel build 的后端**（同 kind 跨会话 resume 放行，ADR `:101`），而 build 的主会话一旦结束，其 worker 又变成「亡主」可被任何人接管。
- **触发条件**：build 派发 + front 或 plan 同时活跃于同一仓库；或 build 主会话（长寿命 primary）中途重启。
- **涉及不变式**：「归属可追溯」（ADR-plan-delegate D5 `:80-84`）+「跨 owner-kind 不接管」（D7.3 `:98-105`）。
- **依据**：`lib/delegate-core.ts:1413-1415,2427-2446`；`lib/delegate-async.ts:1274-1294,1434-1447`。

### C3 停机证据门控的适用性：守卫按 worktree 计，不按通道计

- **冲突描述**：停机证据（`wait` 返回 + 判活 + 水位线）与守卫（进程内 `(stateRoot, workRoot)`）都是**单槽的配套件**，它们假设「该 worktree 只有一个已登记后端」。新通道若不登记到 `pair.json`，`stopGuardAt` 对其**不存在**（N9）⇒ 一个 worktree 正在被 suspend 的窗口内，新 worker 可以合法进入 ⇒ 两个写者。若新通道自建守卫，则同一个 worktree 有两个守卫键空间，两条通道可互不阻塞。
- **触发条件**：任一 suspend/cancel 窗口内 dispatch 到同一 worktree 的另一条通道。
- **涉及不变式**：「任一判不出来 ⇒ 不释放槽位」以及「释放窗口内不许新准入」（`docs/adr/ADR-front-stop-confirmation.md:32,47`）。
- **依据**：`lib/delegate-core.ts:393-397,2350-2356`；`lib/delegate-async.ts:613-617`。

### C4 `scope` 差集检测在多写者下失效（且不可归因）

- **冲突描述**：差集是「派发前快照 vs 派发后快照」的**工作树级**集合差（N11）。两个写者同树并行时，各自的 `changed` 都是**并集减去各自基线** ⇒ ① A 的越界判定会把 B 的文件算进 `out_of_scope_files`（假阳性，告警失判别力）；② 真越界无法归因到人（与残留 #10「并行下只能做 topic 级 union 核对」同型）。若走子会话通道则更坏：**根本没有差集**（无登记即无 before/after 配对）。
- **触发条件**：同 worktree ≥2 写者；或非 delegate 通道的 worker。
- **涉及不变式**：「一次委托的变更必须可归因到这次委托」（ADR D4 `:77` 的原句论点）。
- **依据**：`lib/delegate-core.ts:2593-2604`；`docs/adr/ADR-plan-multi-session-collaboration.md:317`（残留 #10）。

### C5 与 `PLAN_REF_ROOTS`「计划先行」门的关系：门是**主体级**的，不是通道级的

- **冲突描述**：必填条件写死为 `callerAgent === "plan"`（N15）。因此：
  - **build 接入后不会自动继承**该门（它不会因为走 delegate 就必须带计划）；
  - **该门今天对 front 也不生效**（front 派工程实施可不带 `plan_ref`）—— 即「计划先行」目前是**plan 主体的授权约束**，不是通道级不变式；
  - 于是「把实施通道给 build」这件事会**扩大**「无计划派工」的可用面，而 build 恰恰是实施主体、风险最高的一侧；
  - 另一条独立约束：相对 `plan_ref` 解析根是 `project_dir` = **目标工作树**（N17）；在 n2 的 worktree 方案下，若计划只在主仓、未进新树 ⇒ 派发被 `existsSync` 拒（`lib/delegate-core.ts:1380-1382`）；`.rddf/plan-topics/**` **不在** accepted roots（N16）⇒ 本 topic 的讨论稿**不能被引用来派工**（与 TOPIC 的「只产离线讨论稿」一致）。
- **触发条件**：build（或 front）派 `agent=build` 的实施且不写 `plan_ref`；或计划文件未进目标树。
- **涉及不变式**：D2「没有计划就派实施 = 绕过计划先行」（ADR `:60`）。
- **依据**：`lib/delegate-core.ts:1321-1326,1358-1384,2337-2342`。

### C6 后端递归：agent 级 `delegate: allow` 会**泄漏到被派发的后端**

- **冲突描述**：`classPermissions` 只产出 `CONSTANT_DENY` + edit 规则 + grants + subagent 白名单 + arch deny，**没有 delegate 规则**（N14）；而 session 规则排在 agent 规则之后、last-match-wins ⇒ 未列出的动作**沿用 agent 级值**。因此给 `build` agent 加 `delegate: allow` 后，**每一个 build 后端会话也拿到 delegate 工具** ⇒ 后端可再派后端，直接击穿「一次派发一个角色类、写集创建时定型」（`prompts/build.md:690`）与并发配额语义。
- **触发条件**：`opencode.jsonc` 的 build 块加 delegate allow，且未同批给 `classPermissions` 加显式 deny。
- **涉及不变式**：n1 的 K2（「build 拿不到 delegate 是防递归后端」）；`grants`/`role_class` 的定型语义。
- **依据**：`lib/delegate-core.ts:1266-1288,2460-2478`；`lib/delegate-async.ts:1360-1376`。

### C7 角色租约与主会话自持：build 在自己所在的工作树派 builder 后端会被**租约**拒

- **冲突描述**：build 主会话首次写盘即通过 `checkLeaseForWrite` 取得 `(workRoot, builder)` 租约（`lib/role-lease.ts:699-708`）；后端在 `claimSlot` 同临界区申请 `(targetWorkRoot, role_class)`（N12）。若 `targetWorkRoot === build 当前树` 且 `role_class=builder` ⇒ **第二把锁先于槽位表拒绝**（`lib/delegate-async.ts:1411-1424`）。⇒ 替代方案隐含一条新的编排不变式：**派发目标树 ≠ build 主会话已占租约的树**（或派发前把自身角色落 `no-role`）。
- **触发条件**：build 在同一 worktree 派 builder 后端。
- **涉及不变式**：`(workRoot, 角色)` 独占（ADR-role-aware-permissions D6）。
- **依据**：`lib/role-lease.ts:284,693-748`；`lib/delegate-async.ts:657-680`；`lib/delegate-core.ts:1854-1866`。

### C8 全局并发配额：并行度上界不是「wave 宽度」，而是 `min(树数, 3)`

- **冲突描述**：配额默认 3 且 owner 无关（N18）⇒ 即使 build 有 5 个 wave 的独立树，第 4 个被 fail-fast 拒（不排队）。这与「多 wave 并行」的直觉预期不符，且**不因替代/并存而改变**（并存若自建配额，则两套配额互不可见 ⇒ 实际并发翻倍，写者更多）。
- **触发条件**：同时活跃后端 ≥3。
- **涉及不变式**：`ADR-front-multi-backend` 的并发上限语义（fail-fast，不排队）。
- **依据**：`lib/delegate-async.ts:96-100,1337-1348,1608`。

### C9 `sessions` 的归属可见性按 **session id**：主会话重建后看不见旧 worker

- **冲突描述**：`sessions` 用 `metadata.front_session_id === 调用方 session id` 过滤（N19）。build 主会话若被重建（新 session id，长任务中常见），它此前的 worker 仍活着但**从 build 视野消失**；而它们对 front/plan 的 `sessions` 也不可见（owner 不同）⇒ 出现「无名册的活写者」。这是既有机制对**长寿命编排者**的结构性不适配。
- **触发条件**：编排会话重建 / 压缩后新会话接续。
- **涉及不变式**：D2.1 名册是「可丢弃索引」而非真相源（`docs/adr/ADR-front-multi-backend.md:83-87`）—— 该不变式本身允许丢索引，但**要求台账可重建**；重建路径对 build 缺失。
- **依据**：`lib/delegate-async.ts:1605-1613`；`docs/adr/ADR-front-multi-backend.md:83-87`。

---

## 5. 三种处置评估

### 5.1 并存（新通道自建槽位，与 delegate 槽并列）

- **机制**：新增一条派发面（新插件 + 新登记文件），build 用它拉 `build-worker`；槽位表独立于 `pair.json`。
- **改动面（文件级）**：新 `lib/build-worker-*.ts`（槽位 / 台账 / 归属 / 配额四件复制）；新 `plugins/*.ts`（工具出口 + `options.permission`）；`opencode.jsonc`（新 action 的顶层 deny + build 级 allow）；`prompts/build.md`（新工具教学）；`tests/config-guards.test.ts`（新权限矩阵 + 新「可派者集合」断言）；`.rddf/rollback/*`（新回滚清单）。**注意**：新 action 必须重走一遍「顶层 deny + 单主体 allow + 全部 agent 未见」的验收流程（先例：`tests/config-guards.test.ts:1686-1705`）。
- **新增不变式（至少三条）**：① 两张槽位表必须**互相可见**（否则同树双写者）；② 新台账与 `ledger.jsonl` 的写入顺序必须可合并（否则「派发过」这一事实有两个时间线）；③ 新守卫与停机守卫必须共用键空间。
- **失败面**：① 双写者（最坏，静默）；② 第二本账 ⇒ resume/取消的授权链分叉（`docs/adr/ADR-front-multi-backend.md:83` 明写「不用治理面全局 roster ⇒ 会成第三份真相源」）；③ 停机窗口内互不阻塞；④ 配额双算 ⇒ 并发翻倍；⑤ 所有守卫测试作废重写。
- **与既有 ADR 的冲突程度**：**正面冲突（否决级）**。撞 `ADR-front-multi-backend` D1 的「门控边界唯一」口径（`:71`）；撞 `ADR-plan-multi-session-collaboration` D3 的「拒绝新造派发通道，因与 delegate 争同一 workRoot 槽位」（`:65-71,179-180`）；撞 D2.1 真相源切分（`:83`）。
- **代价**：工程量最大（复制四件机制 + 全套守卫），收益为零（并行单元仍是 worktree，而 worktree 并行 delegate 已支持）。

### 5.2 替代（把 build 的实施纳入 delegate，build 只编排）

- **机制**：build 建树（`git worktree add`，它 shell 全 allow，N20）→ `delegate_dispatch` 派 `agent=build` 后端（`scope`/`role_class`/`acceptance`/`plan_ref`）→ `delegate_sessions` 观测 → 树内提交 → 父侧合并（n3）。build 自己不写实现。
- **改动面（8 处，缺一不可）**：
  1. `opencode.jsonc` build 块加五项 `allow`（`:37-113`；顶层 `:30-34` 保持 deny）；
  2. `lib/delegate-core.ts::classPermissions` 加 `{action:"delegate", resource:"*", effect:"deny"}`（防 C6；单一实现，dispatch 同享）；
  3. `lib/delegate-core.ts:2337-2342` + `lib/delegate-async.ts:1227-1232` 的 `required` 判据扩到 `kind === "engineering"`（防 C5）；
  4. `owner_agent` 枚举增第三值（`lib/delegate-core.ts:275,689,1832,1874`；`lib/delegate-async.ts:568,913,1459`）或明确接受塌陷（**不推荐**，见 §6）；
  5. `prompts/build.md` 新增派发教学 + `capability:build` 机读块重生（`capabilityBlock` 渲染 edit/shell/delegate 三维，见 `tests/config-guards.test.ts:2845`）；
  6. `tests/config-guards.test.ts:1686-1705` 反向改写（build 从「不得放行」桶移入「放行」桶）；
  7. ADR 增补（§8）+ `.rddf/rollback/` 清单；
  8. 编排契约（建树/收树/失败回收）写进 prompt —— 否则模型只会在「自己做」与「派出去」之间摇摆（不可机判项，§10）。
- **新增不变式**：N1「build 派出的后端 = 普通 delegate 后端（同槽、同台账、同停机证据）」；N2「后端不可再派（显式 deny）」；N3「build 派实施必须带 `plan_ref`」；N4「派发目标树 ≠ build 已持租约的树」；N5「同一 wave 内同树只派一个写者（槽位表保证）」。
- **失败面**：① 漏改 2 或 3 ⇒ 反向效果当天生效（C6/C5）；② 漏改 4 ⇒ 归属冒充 front（C2）；③ build 主会话死亡 ⇒ worker 变孤儿可被接管（D7.5 亡主门控，属既有语义，登记为残留）；④ 并行度 ≤ `min(树数,3)`（C8）；⑤ 「build 只编排」是**纪律**，权限层不拦 build 自己动手（它 `edit`/`shell` 全 allow）——不可机判；⑥ 建树/收树生命周期无监护人（`docs/adr/ADR-front-multi-backend.md:175`「不配即定时炸弹」）。
- **与既有 ADR 的冲突程度**：**增补为主，一处取代**。增补 D1（派发主体加第三类）；收紧 D2（`plan_ref` 判据）；增补 D5（枚举第三值）；D4 **不动**；D7 机制本身 kind-agnostic（「≠ 调用方 ⇒ 报错指名」，`:95`）⇒ 只需扩文案与枚举；**取代** `.rddf/state/adr-front-agent-redesign.md:143,225`（D6「仅 front 可得」+ 验收条目「除 front 外任一 agent 调用 delegate 时工具不可见」）—— 该条**已被 D1 对 plan 取代过一次**，本次是二次取代（性质相同）。

### 5.3 分槽（按 `owner_agent` 细分槽位，扩展既有单槽语义）

- **机制**：`slotOccupants(pairs, workRoot)` 增加 owner 维 ⇒ 同 worktree 上 front / plan / build 各占一槽。
- **改动面（面最广）**：`lib/delegate-core.ts:160-178`（谓词）+ 全部消费点（`:415-430` `slotBusyHolders`、`lib/delegate-async.ts:533-563` `planSlot`、`:594-640` `claimSlot` 的 reconcile 与占槽判定）+ `stopGuardKey`（`:393-397` 需加 owner 维，否则跨 owner 的停机窗口仍互斥/或反之）+ 拒绝文案（`describeHolder*`）+ `sessions` 展示 + 全部槽位相关测试（`tests/delegate-async.test.ts` 803-832 一类跨树/同树用例的语义反转）。
- **新增不变式**：① 「每 `(workRoot, owner_agent)` 一槽」；② 必须同时回答「两个 owner 的差集如何归因」。
- **失败面**：① **差集变并集**（C4），越界告警不可归因；② **租约仍然挡**（C7）：同 worktree 两个 `builder` 后端，第二个在 `claimSlot` 的租约步被拒 ⇒ 分槽**得不到并行**；要得到并行还得再动租约键 ⇒ 变成「重写 D4 + 重写 ADR-role-aware-permissions D6」的双重改动；③ 停机守卫键空间必须同步扩，否则一处漏改即出现无守卫窗口；④ 同树两个写者 ⇒ `git index.lock` 争用（n2 §3.5/B.5）。
- **与既有 ADR 的冲突程度**：**取代级（否决）**。D4 的理由句原文：「单槽是写隔离的来源；**按 owner 分槽会让两个后端同时写同一工作树，破坏 `scope` + `git status` 差集检测的前提**」（`docs/adr/ADR-plan-delegate-engineering-session.md:77`）。分槽正是这句被否决的方案，逐字命中。

### 5.4 对比表

| 方案 | 改动面 | 新增不变式 | 失败面（首条） | ADR 冲突 | 结论 |
|---|---|---|---|---|---|
| 并存 | 新 lib + 新 plugin + 配置 + 守卫测试全量（四件机制复制） | 跨表互斥、双账可合并、守卫键共用（≥3 条） | 同树双写者（静默） | 否决级（D1 口径 / D3 拒自造通道 / D2.1 真相源） | **否决** |
| 替代 | 8 处（配置 1 + lib 3 + prompt 1 + 测试 1 + ADR 1 + 回滚 1） | 5 条（同槽同账 / 后端不再派 / 必带计划 / 租约不相交 / 每树一写者） | 漏改注入 ⇒ 递归或计划门失效 | 增补为主，取代 redesign D6 一条 | **采纳** |
| 分槽 | 槽位谓词 + 全部消费点 + 守卫键 + 文案 + 测试（面最广） | 「每 (workRoot, owner) 一槽」+ 差集归因口径 | 差集并集不可归因；且租约仍挡 ⇒ 得不到并行 | 取代级（D4 `:77` 逐字否决） | **否决** |

---

## 6. 推荐与明确否决项

### 6.1 推荐（单一）

**替代。** 三条支撑：

1. **唯一不新增写者入口的方案**（§3 的机制论证：四件机制全留）。
2. **把 n2 的隔离从协议层升到权限层**：走 delegate ⇒ `scope` 变 per-session `edit` 规则（`lib/delegate-core.ts:1266-1288,2463-2478`）；走 subagent ⇒ 只有 agent 静态前缀（n2 §6.2）。
3. **白拿三件配套**：台账（`lib/delegate-async.ts:1454-1468`）、停机证据（N10）、归属门控（N7/N8）—— 无需新写一行。

**顺序硬约束（与推荐绑定，不是可选建议）**：`opencode.jsonc` 开权限必须与 §5.2 的第 2/3/4 项**同批**提交。分两批 = 中间态是一个「有 delegate、无防递归、无计划门、归属冒充 front」的窗口。

### 6.2 明确否决项

| 被否决 | 否决理由 | 依据出处 |
|---|---|---|
| 并存（自建槽位） | 两张槽位表在同一 `workRoot` 上各判各的 ⇒ 出现第二个合法写者入口，且 `pair.json` 不再是唯一真相源 | `docs/adr/ADR-plan-multi-session-collaboration.md:65-71,179-180`；`docs/adr/ADR-front-multi-backend.md:71,83` |
| 分槽（按 owner 细分） | 逐字命中 D4 的否决理由（分槽 ⇒ 同树双写 ⇒ 差集失去前提）；且租约仍挡同角色，改动最贵而拿不到并行 | `docs/adr/ADR-plan-delegate-engineering-session.md:77`；`lib/role-lease.ts:284` |
| build-worker 走 `subagent`、无槽位 | 无 per-session 权限；`role-gate` 对 `parentID` 会话整段跳过 ⇒ 写集与租约**双重不设防**；无差集、无停机证据 | `docs/adr/ADR-plan-multi-session-collaboration.md:14` ⑤；`plugins/role-gate.ts:150-155`；`lib/role-policy.ts:520-526` |
| 「先开权限、机制后补」 | C6/C5/C2 三条在开权限当天生效，且都是静默型（递归要跑起来才看见、计划门失效无报错、归属冒充只在冲突文案里暴露） | §4-C2/C5/C6 |
| 「用 `general` 子会话代写」 | 无租约、无差集、无台账；`general` 不在 `GUARDED_AGENTS` | n1 §1 T6；`lib/role-policy.ts:520-526` |

### 6.3 触发条件（何时重启 / 何时彻底放弃）

- **重启「替代」的触发条件**（三条同时成立）：① 出现至少一次「单次改造可切成 ≥2 批、且各批写域不相交」的实测需求；② 该批次的计划文件已落在 `.rddf/plans/**`（可作 `plan_ref`）；③ 目标工作树可显式准备（`git worktree add` 由 build 执行）。
- **彻底放弃「build 具备并行实施能力」的触发条件**（任一成立）：① 决定维持 `.rddf/state/adr-front-agent-redesign.md:225` 的验收条目不变（build 永不可见 delegate）**且**不同意为 build 新建 agent 形态；② 团队接受「并行只由 front/plan 发起」（即 build 永远是被派方）—— **此时本 topic 的答案是「不做」**，并须在合稿里明写：`build` 的上下文压力只能靠 D（不并行 + 上下文外置）缓解。
- **不得重启的窗口**：任何「已经给 build 开了 delegate 但 §5.2 第 2/3/4 项未同批落地」的中间态 —— 必须回滚（撤 allow）而不是继续补。

---

## 7. 若推荐「替代」：`build` 作为 delegate 调用方的前置条件清单

> 每条都是**可判定的落地项**（文件 + 判据），不是原则。

| # | 前置条件 | 判据（可机判） | 依据/理由 |
|---|---|---|---|
| P1 | build 块加五项 `allow`，顶层五项保持 deny | `tests/config-guards.test.ts:1686-1705` 反向改写后绿 | D1 的形态（顶层 deny + 主体 allow） |
| P2 | `classPermissions` 注入 `delegate: * deny` | 单测：`classPermissions(...)` 返回数组含该条且位于 grants **之后**（last-match-wins） | 防 C6；N14 |
| P3 | `plan_ref` 必填判据改为 `kind === "engineering"`（不再绑 caller=plan） | 两处 `required` 表达式同源；负例（build 不带 plan_ref ⇒ 拒） | 防 C5；`lib/delegate-core.ts:2337-2342` |
| P4 | `owner_agent` 增第三值 `build`（`pair.json` / metadata / `priority_blocked` / holder 结构体 / 文案） | 类型不再写死 `"front" \| "plan"`；旧数据缺失按 front（兼容读不变） | 防 C2；D5 的兼容读规则照搬 |
| P5 | 编排契约：派发目标树 ≠ build 当前树（或派发前落 `no-role`） | prompt 断言 + 首派失败文案指名「租约冲突」 | C7；`lib/role-lease.ts:284` |
| P6 | `prompts/build.md` 增派发教学 + `capability:build` 重生 | 机读块逐字比对（同 `planRefRootsBlock` 范式） | 防「模型不知有工具」（ADR `:164` 风险） |
| P7 | 回滚清单（`.rddf/rollback/*.json`）含本次全部 edits | 隔离副本 `bun test tests/` 绿（由父会话跑） | 既有回滚纪律（ADR `:150-156`） |
| P8 | ADR 增补（§8）+ 残留登记（孤儿接管 / 树泄漏 / 并行度 ≤3） | ADR diff 只增不删既有不变式 | V14 式复核 |
| P9 | 并发度声明写进 prompt：真实并行 ≤ `min(树数, RDDF_MAX_ACTIVE_BACKENDS=3)` | 文本断言 | C8 |

**`plan_ref` 怎么办（关键问答）**：
- **build 产出计划吗？会。** `builder` 角色的内置流程明确包含「写 `.rddf/plans/<name>.md`（TDD 5 步）」（`prompts/build.md:412`），而 `.rddf/plans/**` 正在 accepted roots 内且被标注为「**builder P1 的 TDD 计划**所在」（`docs/adr/ADR-plan-delegate-engineering-session.md:57`）。
- ⇒ P3 不是「给 build 加一道它做不到的门」，而是**把既有的「计划先行」从 plan 主体扩到所有实施派发**；build 只需在派发前把自己那份 TDD 计划落盘。
- ⇒ **副作用（须预先声明）**：这同时**收紧 front**（front 目前派实施可不带 `plan_ref`）。这是有意的口径统一，但属于**行为变更**，必须在 ADR 影响面里点名（§8）。
- ⇒ 另一条独立约束：相对路径按 `project_dir`（目标树）解析（`lib/delegate-core.ts:1373-1379`）⇒ **计划必须在新树里可见**（提交后再开树，或用绝对路径并在树内存在）。此项属 n2 的 A.3 失效面，n5 只登记。
- ⇒ **不得**把 `.rddf/plan-topics/**` 加进 accepted roots（N16）—— 否则本 topic 的讨论稿可被直接派工，与 TOPIC 的「只产离线讨论稿」冲突。

---

## 8. 对既有 ADR 的影响面（逐条，点名决策编号）

| ADR | 决策 | 影响性质 | 具体说明 |
|---|---|---|---|
| `ADR-plan-delegate-engineering-session` | **D1** 派发主体 = plan 与 front 并列，共用同一 delegate 通道 | **增补** | 主体集合从 {front, plan} 扩到 {front, plan, build}；「不新增第二套派发通道」这条不变式**不变**（替代方案正是它的推论） |
| 同上 | **D2** `plan_ref` 必填（plan 派实施） | **收紧（判据字段变更）** | `required` 从 `caller=plan` 改为 `kind=engineering`；「存在性校验不是相关性证明」的定性不变 |
| 同上 | **D4** 槽位保持 `workRoot` 全局单槽 | **不变（且是本次结论的支点）** | 替代方案完全不动它；分槽被否正因为撞它的理由句 `:77` |
| 同上 | **D5** `owner_agent` 显式化 + 旧数据默认 front | **增补** | 枚举加第三值；兼容读规则（缺失按 front）保留，但**默认值语义需复核**：新值出现后「缺失=front」是否仍安全（本次判定：仍安全，因为旧数据确实只有两种） |
| 同上 | **D7** 优先级：plan 优先、不抢占（D7.1–D7.8） | **增补（机制不变）** | D7.2 的判据是「占用者 owner-kind ≠ 调用方 ⇒ 报错指名」——**kind-agnostic**，加第三类无需改判定，只需扩枚举与两段文案（`:107`）；D7.3/D7.8 的跨 kind 硬拒自动覆盖 build |
| 同上 | 「已排除的替代方案」中「用 `subagent` 拉可写 agent」 | **支持（本条被本次复核为仍然成立）** | 否决理由（无登记/槽位/差集/停机证据）在 n1 T6 得到实测面印证 |
| `.rddf/state/adr-front-agent-redesign.md` | **D6**「`delegate` 仅 front 可得」+ 验收条目「除 front 外任一 agent（**build**/plan/…）调用时工具不可见」 | **取代**（第二次） | 该条首已被 D1 对 plan 取代；本次对 build 再取代一档 ⇒ 必须显式标注「已被 D1 及本决策两次取代」，不得静默改写（V14 式复核对象） |
| `ADR-plan-multi-session-collaboration` | **D3** 拒绝自造派发通道 | **支持** | 替代方案**不**新建通道 ⇒ 与 D3 同向；并存方案正面违反 |
| 同上 | **D4** 可派者集合（`build`/`plan` 为字符串 allow） | **不变，但需复核断言** | 新增 agent 形态时才影响；替代方案不新增 agent ⇒ `tests/config-guards.test.ts:313` 的闭集断言不受影响 |
| `ADR-front-multi-backend` | **D1** 门控边界唯一（口径 = 插件 + action + 全局 deny） | **支持** | 扩主体不改边界 |
| 同上 | **D2.1** 真相源切分（`pair.json` 权威） | **支持** | 替代方案不产生第二本账；并存方案会 |
| 同上 | **D6.1/D6.2** 槽位键 = `workRoot`、同树一次一个 | **不变** | 替代方案恰恰靠它取得跨树并行 |
| 同上 | **D6.4** worktree 自动创建后置（不配即定时炸弹） | **代价继承** | 替代方案把「建树/收树」压到 build 的编排契约上（P5 邻居项），须登记运维残留 |
| `ADR-front-stop-confirmation` | D1/D2 停机证据 + 进程内守卫 | **不变（白拿）** | 替代方案复用同一守卫键 `(stateRoot, workRoot)`；并存方案拿不到 |

**一句话**：本次决策在 ADR 层面的净效果 = **D1 扩一次 + D2 收紧一档 + D5/D7 各加一个枚举值 + 取代一条已过时的旧验收条目**；**没有**任何一条既有写隔离不变式被削弱。

---

## 9. 反哺清单（登记给 plan / plan-worker 侧，TOPIC 要求）

1. **【事实】「不占 delegate 槽」是 plan-worker 的专属性质，不可外推。** `docs/SUBAGENT-ORCHESTRATION.md:55-59` 与 ADR-plan-multi-session-collaboration D3 都说「plan 侧离线协作是 subagent 的第二种用法，不占 workRoot 单槽」——前提是它**只写 `.rddf/plan-topics/*`**（`opencode.jsonc:1491-1494`）且**无 delegate**（`:1502-1506`）。build 侧要在**源码**上并行，就不能援引这句话：源码写入必须占槽（或换树）。
2. **【建议】plan 的 D7 优先级文案需同步一档**：D7.4 目前只有两种指名文案（被 plan 占 / 被 front 占，`docs/adr/ADR-plan-delegate-engineering-session.md:107`）。若采纳替代，须加第三段（被 build 占），否则 build 占槽时 front/plan 收到的是「被 front 占」的错文案（因为 C2 若未修则 build 塌成 front —— 这正是 P4 的必要性来源）。
3. **【建议】plan-worker 的「无 ask 档」纪律值得被 build 侧继承**：`docs/adr/ADR-plan-multi-session-collaboration.md:79` 明确「无人值守子会话里 `ask` 行为不可判」。build-worker（若最终以 delegate 后端形态存在）的 `scope` 已无 `ask`，但若将来走 subagent，必须以 deny 代替 ask。
4. **【建议】不要把本 topic 的产物接进派工链**：`.rddf/plan-topics/**` 不在 `PLAN_REF_ROOTS`（`lib/delegate-core.ts:1321-1326`）是**特性不是缺陷** —— 它保证「讨论稿 ≠ 可执行计划」。若 n5 的结论被采纳，正式 ADR 必须由 architect 产出到 `docs/adr/`（在 accepted roots 之外但属治理面）或 `.rddf/plans/`，才能被 `plan_ref` 引用。
5. **【事实】`sessions` 的 owner 过滤按 session id（N19）** ⇒ plan 侧的「多根会话」经验不能直接搬：build 没有「多根会话」，只有一个长寿命主会话，孤儿/名册丢失的处置需要独立设计（C9）。

---

## 10. 不可机判项与待父裁决

### 10.1 不可机判（不得伪装成有闸门）

1. **「build 只编排、不自己实施」**：权限层无法区分「build 写代码」与「build 写编排笔记」——它 `edit: "*": allow`（`opencode.jsonc:50-54`）。替代方案的这条不变式**只能靠 prompt 纪律 + 事后 diff 复核**。
2. **`plan_ref` 的相关性**：只校验「根内 + 存在」（`lib/delegate-core.ts:1360-1383`），不校验「这份计划描述的是这个任务」。ADR 已明示（`:59`）。
3. **跨树合并质量**：属 n3。
4. **孤儿 worker 的归属**：build 主会话消亡后，worker 由谁接管是**人的决定**（D7.5 给了机制，不给策略）。
5. **「并行收益 > 合并成本」**：无机械判据（n2 A.5-4）。

### 10.2 待父裁决

1. **推荐口径是否与合稿一致**：本节点给「替代」，与 n2 的「worktree 隔离」相容；但若父会话已倾向「subagent 通道」（精度换零配置），则 n5 的结论会与 n2 §6.2 的强制等级说明打架 —— 请父会话在合稿时**二选一**，不要并列。
2. **P4（owner 第三值）是否接受**：若父会话判定「归属枚举扩第三值成本过高」，可退到「build 塌成 front」的降级方案，但必须同时接受：front 可 resume/cancel build 的后端（跨会话同 kind 放行）。本节点**不推荐**该降级。
3. **P3 是否顺带收紧 front**：把 `plan_ref` 必填扩到所有 engineering 派发会改变 front 的既有行为（今天 front 可不带计划）。这是**有意统一**还是**范围蔓延**，请父裁决。
4. **n3 / n4 的输入**：n3 需知道「替代 ⇒ 合并发生在 git 层（分支 → 主仓）」；n4 需知道「台账里必须能查到派发主体（`owner_agent` 第三值）与 `plan_ref`，否则判据面无法区分『谁派的』与『带没带计划』」。

---

## 11. 引用索引（本节点用到的仓内锚点，去重后 ≥ 25 处）

配置：`opencode.jsonc:6-8`、`:30-34`、`:37-113`、`:50-54`、`:58-59`、`:102`、`:228-232`、`:395-399`、`:1491-1506`。
实现：`lib/delegate-core.ts:160-178`、`:173-174`、`:275`、`:393-397`、`:530-550`、`:1266-1288`、`:1321-1326`、`:1358-1384`、`:1392-1399`、`:1413-1415`、`:1854-1866`、`:2337-2342`、`:2357-2378`、`:2427-2446`、`:2460-2478`、`:2593-2604`；`lib/delegate-async.ts:96-100`、`:533-563`、`:594-640`、`:657-680`、`:1227-1232`、`:1274-1294`、`:1337-1348`、`:1387-1448`、`:1454-1468`、`:1605-1613`；`lib/role-lease.ts:284`、`:693-748`；`lib/role-policy.ts:520-526`；`plugins/role-gate.ts:96-106`、`:150-155`。
ADR / 文档：`docs/adr/ADR-plan-delegate-engineering-session.md:15`、`:41-49`、`:51-64`、`:74-78`、`:80-84`、`:90-118`、`:126-132`、`:144`、`:150-156`、`:164`；`docs/adr/ADR-plan-multi-session-collaboration.md:14`、`:26`、`:40-48`、`:65-71`、`:73-85`、`:179-180`、`:308`；`docs/adr/ADR-front-multi-backend.md:71`、`:83-87`、`:146-157`、`:175`；`docs/adr/ADR-front-stop-confirmation.md:32`、`:34-38`、`:47`、`:61`、`:67`；`docs/MULTI-AGENT-DESIGN.md:121`；`prompts/build.md:412`、`:690`、`:693`；`.rddf/state/adr-front-agent-redesign.md:143`、`:225`；测试：`tests/config-guards.test.ts:313`、`:1686-1705`、`:2845`；前置输入：`nodes/n1/RESULT.md`、`nodes/n2/RESULT.md`。

## STATUS: COMPLETE
