# RESULT — n5：与 delegate 全局单槽的关系

> 类别标注：**〔事实〕** = 本仓文件可直接引用（带 `path:line`）；**〔推断〕** = 由事实推出、本仓无直接断言；**〔上游语义〕** = 押在宿主行为上、本仓只有锚点无源码；**〔建议〕** = 供父会话 / 合稿消费。
> 本节点只答「新通道与 delegate 单槽是什么关系、该取哪种处置」；不改 `delegate` 实现，不重做 n2 的隔离选型，不设计合并语义（n3）。

## 0. 结论先行

**推荐「替代」：`build` 不做第二条派发通道，而是成为 `delegate` / `dispatch` 的第三个调用方；`build` 只做编排（建 worktree、派 wave、join、合并决策），任何工程写都发生在 delegate 后端 session 内。**

一句话理由：**n2 已经把承载者钉死为 delegate 系**（唯一能同时给 `location` 与 per-session `permissions` 的通道，`lib/delegate-async.ts:1371-1376`），而「并存」必然要么复制这套机制（第二本账），要么退回 `subagent`（已否决的伪隔离）；「分槽」则直接推翻 D4 的中心论据。三条路里只有「替代」是**扩展现有唯一出口**，不是新增出口。

配套的三条硬边界（任一不成立则本推荐不成立）：

1. **不改槽位键**：并行来自「每 wave 一个 worktree ⇒ 每树一槽」，不是把 `workRoot` 槽拆成按 owner 的多个槽（`lib/delegate-core.ts:151-155`）。
2. **不新增 `build-worker` agent**：后端仍是现有 `build`（`ALLOWED_AGENTS` 已含，`lib/delegate-core.ts:105`）；「worker 形态」由会话边界 + worktree 边界给出，不由新 agent 给出。
3. **计划先行门必须同批扩到 `build`**：现行 `plan_ref` 强制条件写死 `callerAgent === "plan"`（`lib/delegate-core.ts:2340`），不扩则「替代」会静默关掉「计划先行」。

〔必须上报〕`build-as-third-delegate-caller` —— 这是本节点对 TOPIC 主问题的判定：缺的不是「并行工具」，是「`build` 不在 delegate 主体集合内」；补法是扩主体集合，不是造通道。

---

## 1. 消费的前置结论（不重做，只当约束）

| 来源 | 结论 | 本节点如何使用 |
|---|---|---|
| n1 §0 | `build` 无**任何受门控**实施派发权；唯一子会话出口 `subagent` 的子 agent 全只读/仅 topic 树 | 「并存」若走 `subagent` 就是 n1 判定的无保护通道，直接出局 |
| n1 §3.1-7 | `general` 的 shell 写盘是一条无登记写旁路（`opencode.jsonc:1006`、`scripts/agent-guard-rules.ts:84`） | 它使「现状已能写」为真，但不构成可用通道；本节点不把它计入能力账 |
| n2 §4.1 | 推荐 worktree 隔离，且承载者必须是 delegate / dispatch | 决定了本节点的推荐只能是「替代」或「分槽」，不能是「并存」 |
| n2 §5.1 | 权限层最细只到「edit 工具的前缀」，`shell` 不受 `scope` 约束 | 「分槽」用 scope 换并行不成立：它换不到归因 |

〔事实〕n2 的「承载者必须是 delegate 系」不是偏好，而是能力约束：`classPermissions` 只有在 `ctx.session.create` 时下发才有意义（`lib/delegate-core.ts:1266-1288`、`lib/delegate-async.ts:1361-1376`）；宿主 `subagent` 的权限取 agent 自身配置（`scripts/check-upstream-anchors.sh:174-176`、`:187-189`），没有 per-session 入口。⇒ 任何「build-worker」只要是 `subagent`，写隔离就只剩提示词。

---

## 2. 与 delegate 单槽的关系：先给判定，再给理由

| 关系形态 | 是否可行 | 一句话判定 | 决定性依据 |
|---|---|---|---|
| **并存**（新通道自建槽位） | **不可行** | 两本台账/两套槽位必分叉，且新表看不见旧表 ⇒ D4 被绕过而非被遵守 | `docs/adr/ADR-plan-multi-session-collaboration.md:187`、`:65-71` |
| **替代**（build 纳入 delegate，只做编排） | **推荐** | 唯一不新增出口、不复制机制的形态；并行由 worktree 提供 | `docs/adr/ADR-plan-delegate-engineering-session.md:43-45`、`lib/delegate-core.ts:151-155` |
| **分槽**（按 `owner_agent` 细分槽位） | **明确否决** | 等于允许同树多写者，正是 D4 逐字反对的形态 | `docs/adr/ADR-plan-delegate-engineering-session.md:77`、`:207` |

**〔事实〕为什么「单槽」不是「build 并行的障碍」**：槽位键是 `workRoot`，且同一仓的多个 linked worktree **各自一槽**（`lib/delegate-core.ts:151-155`、`:160-169`）。所以「多 wave 并行」在 delegate 语义内**本来就合法** —— 前提是每个 wave 在不同工作树。真正挡住 `build` 的不是槽，是**它不在派发主体集合里**（`opencode.jsonc:30-34` + `:37-113`；对照 `plan` 的 `:228-232`、`front` 的 `:395-399`）。

〔推断〕把这两件事混为一谈，会得出两个错误结论：① 「给 build 开 delegate 就能并行」（错，同树仍单槽）；② 「单槽必须拆掉才能并行」（错，拆掉就破坏写隔离）。本节点的全部结论都建立在这个拆分上。

---

## 3. 冲突点清单（6 条，覆盖 BRIEF 点名的五个面 + 1 条附加）

### C1 槽位竞争：新通道的表外写者与 delegate 槽位表互盲

- **冲突描述**：`slotOccupants` 只认 `pair.json` 里 `work_root === workRoot` 的条目（`lib/delegate-core.ts:160-169`），`claimSlot` 在同一临界区内做 reconcile + 占槽判定 + 登记（`lib/delegate-async.ts:611-640`）。若 `build-worker` 是 `subagent`，它不登记 pair、不占槽，却可能写同一个 `workRoot` ⇒ delegate 侧看不到这个写者，`claimSlot` 会**合法放行**第二个写者。
- **触发条件**：build 在主 worktree 直接派 build-worker；或 build 的 wave worktree 与某个 delegate 后端的 `workRoot` 相同（例如都在主树）。
- **涉及的不变式**：D4「同一工作树同时只允许一个后端」（`docs/adr/ADR-plan-delegate-engineering-session.md:74-78`）；写隔离。
- **依据**：`lib/delegate-core.ts:151-155`、`:160-169`；`lib/delegate-async.ts:611-640`。
- 〔必须上报〕`slot-competition` —— 这是「并存」的第一条死因：它不是「多一个槽」，是「槽位表外面多一个写者」。

### C2 归属门控：`owner_agent` 是二值，build 会被静默坍缩成 front

- **冲突描述**：`ownerAgentOf` 实现为 `agent === "plan" ? "plan" : "front"`（`lib/delegate-core.ts:1413-1415`）；`SlotClaim` 类型把 `owner_agent` 写死为 `"front" | "plan"`（`lib/delegate-async.ts:568`）。build 派发的后端因此被记为 `front`：跨 owner-kind 的 resume / cancel 硬拒对它不生效（`lib/delegate-core.ts:2425-2446`、`lib/delegate-async.ts:2126-2140`），同 kind 跨会话 resume 仍按「隔天回来继续」放行（`docs/adr/ADR-plan-delegate-engineering-session.md:101`）⇒ **front 可以 resume/cancel build 的后端**。
- **触发条件**：build 获得 delegate 后派工程后端；front 拿到该后端 id（占槽冲突文案 / `dispatch` 超限诊断 / 历史记录）后 resume 或 cancel。
- **连带**：D7 的跨 owner-kind 文案也只认两值，`describeHolderByOwner` 的 `callerKind` 类型是 `"front" | "plan"`（`lib/delegate-core.ts:287-304`）⇒ build 被占槽时会被称作 `front`，模型拿到的下一步指引是错的。
- **涉及的不变式**：归属可追溯、跨 owner 的「不得静默顶掉」。
- **依据**：`lib/delegate-core.ts:1413-1415`、`:2425-2446`；`lib/delegate-async.ts:568`、`:2126-2140`；ADR 残留 #4 `docs/adr/ADR-plan-delegate-engineering-session.md:214`。
- 〔必须上报〕`owner-collapse` —— ADR 自己把这条登记为残留 #4；「替代」把它从 backlog 提升为 BLOCKER。

### C3 停机证据门控：对 `subagent` 通道完全不适用

- **冲突描述**：停机守卫是进程内、按 `workRoot` 索引的（`lib/delegate-core.ts:394-397`），槽位释放必须等「确认停机」（`lib/delegate-async.ts:1929-1966`）；cancel 也走同一条证据门控（`lib/delegate-async.ts:2368`）。`subagent` 通道没有 pair 登记、没有 `sessions` 条目、没有 `wait`/判活基线 ⇒ 既无法确认它停了，也无法在「它可能还在写」时扣住槽位。
- **触发条件**：build-worker 中途失败/被父放弃；父想「确认它不再写」后再合并或再派。
- **涉及的不变式**：停机证据 + 亡主接管（ADR D6 关闭范围明确「全部不动」，`docs/adr/ADR-plan-delegate-engineering-session.md:86-88`）。
- **依据**：`lib/delegate-core.ts:394-397`；`lib/delegate-async.ts:580-586`、`:1929-1966`、`:2368`。
- 〔必须上报〕`stop-evidence-gap` —— 「并存」若不做自己的判活/证据链，就得到一个「停不下来也证明不了停了」的批次；这直接进 n7 的回滚可达性问题。

### C4 `scope` 差集检测在多写者下失效（union，无归因）

- **冲突描述**：差集 = 委托前后 `gitStatusPaths(workRoot)` 的集合差（`lib/delegate-core.ts:2504`、`:2593-2596`），越界判定是「变更文件减去 scope 前缀」（`:2601-2604`）。`git status` 不记写入者 ⇒ 同树两个写者时，A 的 `changed` 必然包含 B 的新增文件 ⇒ **每轮并行都误报**；反过来，若 B 的文件在 A 的 `statusBefore` 之前已存在，A 自己越界写同一路径还会被 `beforeSet` 吃掉 ⇒ **漏报**。
- **触发条件**：任何「同一 `workRoot` 两个写者」的并行形态（含「分槽」后的合法多写者）。
- **涉及的不变式**：`scope` + `git status` 差集检测是 delegate 写隔离的取证面（D4 理由原文，`docs/adr/ADR-plan-delegate-engineering-session.md:77`）。
- **依据**：`lib/delegate-core.ts:2504`、`:2593-2604`；n2 已把同一结论用于否决分支/目录隔离。
- 〔必须上报〕`scope-diff-union` —— 这不是「误报率高一点」，是取证面**失去判别力**：每条都误报等于没有判据。

### C5 `PLAN_REF_ROOTS`「计划先行」门的覆盖面按调用方字符串分叉

- **冲突描述**：`plan_ref` 只在 `callerAgent === "plan" && kind === "engineering"` 时必填（`lib/delegate-core.ts:2340`，schema 描述也写「plan 派发可写实施时必填」，`:2289-2293`）。若 build 成为调用方而条件不改，build 派工程**不要求**任何计划 ⇒ 「计划先行」静默失效；若条件改，又有第二个问题：accepted roots 是闭集（`lib/delegate-core.ts:1321-1326`），**不含** `.rddf/plan-topics/**`（`docs/adr/ADR-plan-multi-session-collaboration.md:51`、`:119`），所以 topic 的 node 产物不能直接当 `plan_ref`。
- **触发条件**：build 第一次派 engineering 后端；或有人试图把 `.rddf/plan-topics/<topic>/nodes/<id>/RESULT.md` 当 wave 的计划。
- **涉及的不变式**：「计划先行」= 派实施必须引用**已存在**的计划文件（`docs/adr/ADR-plan-delegate-engineering-session.md:54-60`）。
- **依据**：`lib/delegate-core.ts:1321-1326`、`:1358-1384`、`:2289-2293`、`:2340`；`docs/adr/ADR-plan-multi-session-collaboration.md:51`。
- 〔必须上报〕`plan-ref-caller-keyed` —— 门的判据绑定在**调用方身份**上，是「换主体」时最容易漏改的一处；漏改是「静默失效」，不是报错。

### C6（附加）`delegate: allow` 会泄漏到被派发的后端

- **冲突描述**：`classPermissions` 只产出 `CONSTANT_DENY` + edit 规则 + grants + subagent 白名单 + arch deny，**没有任何 delegate 规则**（`lib/delegate-core.ts:1266-1288`、`:48-81`）；而 session 规则排在 agent 规则之后、last-match-wins（`lib/delegate-core.ts:2460-2462` 注释）⇒ 给 build 开 `delegate: allow` 后，**以 build 为后端的会话也拿到 delegate 工具** ⇒ 后端可再派后端，击穿「一次派发一个角色类、写集创建时定型」。
- **触发条件**：只改 `opencode.jsonc` 给 build 加五项 allow，不补 deny。
- **涉及的不变式**：一次派发一个角色类 / 写集创建时定型（ADR 残留 #5 原文，`docs/adr/ADR-plan-delegate-engineering-session.md:215`）。
- **依据**：`lib/delegate-core.ts:1266-1288`、`:48-81`、`:2460-2462`；ADR 残留 #5 `:215`。
- 〔必须上报〕`delegate-allow-leak` —— 这条使「替代」的落地**不可能是一行配置**；必须与 `classPermissions` 的 deny 同批。

### C7（附加）并发上限 3 与角色租约是两条独立的限流

- **冲突描述**：全局活跃后端上限默认 3，且计数 owner 无关（`lib/delegate-async.ts:96-101`、`:1036`、`:1337-1348`）；角色租约键是 `(workRoot, role)`（`lib/role-lease.ts:313-317`），同 worktree 同角色至多一个活跃 session（`prompts/build.md:197`）。⇒ 即使改成「替代」，多 wave 同时最多 3 个后端；且 build 主会话自己若持 builder 租约在某个 worktree，就不能在同树再当后端。
- **触发条件**：wave 数 >3；或 build 主会话在 wave worktree 里切了 builder 角色。
- **涉及的不变式**：全局并发配额（ADR D10）、租约独占。
- **依据**：`lib/delegate-async.ts:96-101`、`:1337-1348`；`lib/role-lease.ts:313-317`；`prompts/build.md:197`。
- 〔建议〕n4 的判据面必须把「配额 3」写成硬上界；n7 要覆盖「排队中的 wave 被父遗忘」这种失败。
- `concurrency-cap-3`

---

## 4. 三种处置逐一评估

> 每种都必须回答：机制 / 改动面 / 新增不变式 / 代价 / 失败面 / 与既有 ADR 冲突程度。不写「只有优点」的版本。

### 4.1 并存（新通道自建槽位，与 delegate 槽并列）

**机制**：`build-worker` 走宿主 `subagent`（或新插件），自建 wave 台账与 wave 槽位表（键可以是 `(workRoot, wave_id)`），写入前查自己的表；delegate 的表完全不参与。

**改动面（文件级）**
- 新增：`plugins/build-worker.ts`（或等价）、`lib/build-waves.ts`（台账 + 槽位 + 判活），`prompts/build-worker.md`。
- 修改：`opencode.jsonc`（新增 subagent agent 或工具 allow）、`prompts/build.md`（编排段）、`tests/`（新守卫）、`docs/`（新通道说明）。
- 若走 `subagent`：不需要 delegate 权限，但需要把 `build` 的 `edit: "*": "allow"`（`opencode.jsonc:50-54`）换成仅 wave worktree —— 而宿主没有 per-session 目录/权限入口（〔上游语义〕，锚点 `scripts/check-upstream-anchors.sh:174-176`、`:187-189`）。

**新增不变式**
1. 双表互斥：任一表在某 `workRoot` 占槽 ⇒ 另一表必须拒（需要跨表检查，且检查本身有 TOCTOU）。
2. 「build-worker 只写自己的 worktree」—— 只能靠提示词与事后 diff，权限层到不了（前缀通配跨斜杠，`scripts/check-upstream-anchors.sh:196-198`）。
3. wave 命名 ↔ worktree ↔ 台账三者一致。

**代价**
- 复制五件套：登记、槽位、停机证据、归属、差集（ADR 把「第二套协议 = 双份不变式与漂移源」列为否决理由，`docs/adr/ADR-plan-delegate-engineering-session.md:128`）。
- 跨表协调没有天然落点：两份 `pair`/`ledger` 谁是真源，冲突时按哪本账拒绝，都需新定义。

**失败面**
- `table-blind-writer`：新表占槽、旧表不知 ⇒ D4 被绕过（C1）。
- `wave-ledger-drift`：新台账与磁盘/会话状态漂移，且没有 `claim_gen` 式围栏。
- `subagent-no-stop-evidence`：父无法确认 worker 停了（C3）。

**与既有 ADR 冲突程度：高（四线冲突）**
- 违反 D1「delegate 仍是唯一的工程行动出口」（`docs/adr/ADR-plan-delegate-engineering-session.md:43-45`）。
- 撞选项表「给 plan 新建独立派发工具」的否决理由（`:128`）。
- 撞「用 `subagent` 拉可写 agent 代替 delegate」的否决理由（`:129`、`:29`）。
- 撞 `ADR-plan-multi-session-collaboration` D3「拒绝新造派发通道 / 与 delegate 争同一 `workRoot` 槽位」（`docs/adr/ADR-plan-multi-session-collaboration.md:65-71`）。
⇒ 若选它，必须先写一篇**取代 D1 门控唯一性**的新 ADR，而不是「增补」。

### 4.2 替代（把 build 的实施纳入 delegate，`build` 只做编排）—— **推荐**

**机制**：build 主会话持五个 delegate 工具；每个 wave：`git worktree add` → `dispatch`（异步）或 `delegate`（同步）→ join → 合并（n3）→ 清理。后端 `agent=build`，`project_dir` 指向该 worktree，`scope` 相对该 worktree 解析（`lib/delegate-async.ts:1371-1376`、`lib/delegate-core.ts:1266-1288`）。

**改动面（文件级）**
- `opencode.jsonc:37-113`（build 块新增五项 `allow`，模板 = `:228-232` / `:395-399`；顶层五项保持 `deny`，`:30-34`）。
- `lib/delegate-core.ts`：`ownerAgentOf`（`:1413-1415`）、`validatePlanRef` 的 required 条件（`:2340`）、`classPermissions` 增 delegate deny（`:1266-1288` 与 `CONSTANT_DENY` `:48-81`）、`describeHolderByOwner` 的类型与文案（`:287-304`）。
- `lib/delegate-async.ts`：`SlotClaim` / holder 类型（`:568`、`:415` 所在的 core 类型）、cancel 的 owner 判定（`:2126-2140`）；`sessions` 的过滤逻辑**不用改**（按 session id，`:1612`）。
- `prompts/build.md`：新增「编排者」边界（不 edit wave worktree；计划产出仍落 `.rddf/plans/<name>.md`，`:413`）。
- `tests/config-guards.test.ts`（build allow + 顶层 deny + 后端 delegate deny）、`tests/delegate-*.test.ts`（三值归属 / plan_ref 负例）。
- `docs/`：ADR 增补（见 §6）。

**新增不变式**
1. **工程写只发生在 delegate 后端**；build 主会话对 wave worktree 零 edit（软约束 + 事后 `git status` 差集，不能声称权限强制）。
2. **`owner_agent` 三值**（`front` / `plan` / `build`），旧数据缺失仍按 `front`（延续 D5，`:80-84`）。
3. **任何 engineering 派发都必须带 `plan_ref`**，不再按 caller 身份分叉（C5 的修法）。

**代价**
- owner 三值迁移：台账 schema、类型、`describeHolderByOwner`、D7 优先序都要碰；且旧 pair 条目要兼容（`lib/delegate-core.ts:1413-1415`、ADR D5 `:80-84`）。
- `plan_ref` 强制扩大后，build 首次派发多一步「先写计划」（ADR 已登记同型代价，`:148`）。
- 仍然受 3 并发上限（`lib/delegate-async.ts:96-101`）；worktree 建/删是 shell 运维面（`opencode.jsonc:58-59`、`:81`）。
- 多 worktree 共享 `stateRoot` ⇒ `role.json` 顶层镜像争用（ADR 残留已登记，`:147`；n2 失效模式 ②）。

**失败面**
- `owner-third-value-forgotten`：只改配置不改枚举 ⇒ build 的后端被 front 接管（C2）。
- `plan-ref-widened-too-late`：先开权限、后补门 ⇒ 窗口期内 build 可无计划派实施（C5）。
- `quota-exhaustion`：wave 数 >3 ⇒ 第 4 个 fail-fast 被拒，父若不排队就表现为「随机失败」（`lib/delegate-async.ts:1337-1347`）。

**与既有 ADR 冲突程度：中（增补为主，但有一处方向性对冲）**
- 不改 D4 / D6；增补 D1（主体集合）、D2（`plan_ref` 条件）、D5（枚举）、D7（优先序）。
- **方向性对冲**：ADR 末尾的 2026-11-20 订正说 plan delegate 已在做「半退役」演练，并给出可执行回滚清单（`docs/adr/ADR-plan-delegate-engineering-session.md:152-157`）。「给 build 开门」与「整体退役 delegate 作为工程出口」是相反方向 ⇒ 必须先由 architect 裁决顺序（见 §8）。

### 4.3 分槽（按 `owner_agent` 细分槽位，扩展既有单槽语义）

**机制**：槽位键从 `workRoot` 改为 `(workRoot, owner_agent)`；同一工作树允许 front / plan / build 各一个后端，用 `scope` 前缀划分文件写域。

**改动面（文件级）**
- `lib/delegate-core.ts:151-169`（`slotOccupants` 的键与过滤）、`registerSession` 的槽位字段。
- `lib/delegate-async.ts:594-717`（`claimSlot` 的占槽判定）、`:1337-1348`（配额口径）、D7 冲突判定（`:2360-2377`、`docs/adr/…:95`）。
- `lib/role-lease.ts:313-317`（租约键也要跟着改，否则两个 builder 后端仍被租约挡掉）。
- `tests/`（大量现有「同树互斥」用例要反转）、`docs/adr/ADR-plan-delegate-engineering-session.md:74-78`（重写 D4）。

**新增不变式**
1. 「每 `(workRoot, owner-kind)` 一槽」—— 这等于**同树多写者合法化**。
2. 越界判定必须能归因到 owner-kind —— 而 `git status` 不记写入者，做不到（C4）。

**代价**
- 改的是 D4 的中心论据（「单槽是写隔离的来源」），不是边角；连带 D7 的优先序、配额、租约、文案、测试全部重写。
- 换来的并行度仍受 scope 前缀能力限制：`shell` 不受 `scope` 约束（`lib/delegate-core.ts:48-81`），一次 `bun install`/格式化就跨域写。

**失败面**
- `same-tree-double-writer`：两个后端同时写一棵树，D4 原文所述差集前提被破坏（`docs/adr/ADR-plan-delegate-engineering-session.md:77`）。
- `lease-still-singleton`：只改槽不改租约 ⇒ 第二个 builder 后端仍被 `(workRoot, role)` 租约拒绝（`lib/role-lease.ts:313-317`）⇒ 「分槽」表现为「改了也没用」。
- `stop-guard-shared`：停机守卫按 `workRoot`（`lib/delegate-core.ts:394-397`），一个 owner 的停机窗口会拦住另一个 owner 的派发；反之停一个不影响另一个 ⇒ 守卫语义分裂。

**与既有 ADR 冲突程度：最高（直接推翻 D4 + 撞已排除项）**
- D4 逐字反对（`:74-78`），选项表「按 owner 分槽」已列**排除**（`:207`）。
⇒ 选它等于**取代** D4，且要连带重写 D7 与停机证据面；本节点明确否决。

---

## 5. 推荐与明确否决项

### 5.1 推荐（单一）

**「替代」：`build` 成为 delegate 的第三调用方，只做编排；并行由「每 wave 一个 worktree = 每树一槽」提供。**
〔必须上报〕`delegate-third-caller-form` —— 这是对 TOPIC「build-worker 形态」的直接回答：**形态不是新 subagent，是「调用方角色」**。

### 5.2 否决「并存」

- 否决理由：第二套通道 = 第二套登记/槽位/停机证据/归属，与既有机制争同一 `workRoot` 且互不可见（`docs/adr/ADR-plan-multi-session-collaboration.md:65-71`、`:187`；`docs/adr/ADR-plan-delegate-engineering-session.md:128`）。
- 若用 `subagent` 承载：ADR 已点名「能写但无保护，比没有更危险」（`docs/adr/ADR-plan-delegate-engineering-session.md:29`、`:129`），n2 §4.5 判为伪隔离。
- 依据出处：同上 + `lib/delegate-core.ts:160-169`（旧表看不见新写者）。

### 5.3 否决「分槽」

- 否决理由：它把「同树双写者」从事故变成合法态，而 D4 的中心论据正是「单槽是写隔离的来源」（`docs/adr/ADR-plan-delegate-engineering-session.md:77`）。
- 依据出处：同篇 `:207` 已把「按 owner 分槽」列入排除项；`lib/delegate-core.ts:151-155` 的槽键就是 `workRoot`，改键 = 改 D4 而非扩展它。

### 5.4 停止条件（什么事实出现时不应重启/继续「替代」）

1. architect 决定**整体退役** plan delegate（ADR 订正 `:152-157` 的方向被采纳）⇒ 不应单独给 build 开门；应改为「重建唯一门控出口」的新 ADR，三主体一起设计。
2. `owner_agent` 三值与 `classPermissions` delegate deny 无法同批落地 ⇒ 先别开 build 的 allow（否则 C2 + C6 同时发生）。
3. 实际 wave 并发需求长期 ≤1（测得墙钟收益可忽略）⇒ 退回 n2 的 C4「不并行 + 上下文外置」，本项不立项。

---

## 6. 「替代」的前置条件清单（BRIEF 第 4 项）

按依赖顺序，前一条不成立则后一条不做：

1. **方向裁决（第 0 条）**：先确定 v7 是「扩主体」还是「整体退役 delegate」。依据：`docs/adr/ADR-plan-delegate-engineering-session.md:152-157`。
2. **build 的委托边界写进 prompt**：build 不 edit wave worktree，只做 `worktree add / dispatch / join / 合并决策 / remove`；计划产出仍走 `.rddf/plans/<name>.md`（`prompts/build.md:413`）。
3. **`plan_ref` 怎么办**：把 required 条件从 `callerAgent === "plan"` 扩为「所有 `kind === "engineering"` 派发」（`lib/delegate-core.ts:2340`），或显式 `callerAgent ∈ {plan, build}`。**build 产出计划吗**：是 —— builder 角色的既定产出就是 `.rddf/plans/<name>.md`（`prompts/build.md:413`），且该前缀在 accepted roots 内（`lib/delegate-core.ts:1322`）。**不能**用 `.rddf/plan-topics/**`（不在闭集，`:1321-1326`；`docs/adr/ADR-plan-multi-session-collaboration.md:51`）⇒ 若要复用 topic 讨论稿，必须先物化成 `.rddf/plans/<slug>.md`。
4. **owner 三值**：`ownerAgentOf`、holder/SlotClaim 类型、`describeHolderByOwner` 文案、D7 优先序（build 与 plan/front 的先后）。依据：`lib/delegate-core.ts:1413-1415`、`:287-304`；`lib/delegate-async.ts:568`、`:2126-2140`；`docs/adr/ADR-plan-delegate-engineering-session.md:95-107`、`:214`。
5. **同批补 delegate deny**：在 `classPermissions` / `CONSTANT_DENY` 加五个 delegate action 的 deny，防后端再派。依据：`lib/delegate-core.ts:1266-1288`、`:48-81`、`:2460-2462`；ADR 残留 #5 `:215`。
6. **并发与租约的硬上界**：3 个活跃后端（`lib/delegate-async.ts:96-101`、`:1337-1348`）；build 主会话不得在 wave worktree 持 builder 租约（`lib/role-lease.ts:313-317`、`prompts/build.md:197`）。
7. **守卫与回滚**：`tests/config-guards.test.ts` 增 build allow / 后端 deny 断言；回滚清单需同步（参照 `.rddf/rollback/plan-delegate.json` 的形态，ADR `:155`）。

〔推断〕第 4、5 条是真正的工程量；第 2、3 条是治理语义；第 6、7 条是运维面。把第 4、5 条说成「一行配置」是本议题最危险的误判。

---

## 7. 对既有 ADR 的影响面（BRIEF 第 5 项）

| ADR / 决策 | 影响 | 增补还是取代 | 依据 |
|---|---|---|---|
| `ADR-plan-delegate-engineering-session` **D1**（派发主体） | 主体集合 `{front, plan}` → `{front, plan, build}`；「唯一出口」表述保留 | **增补**（但 D1 正文「plan 与 front 并列」需改写，不是纯追加） | `docs/adr/ADR-plan-delegate-engineering-session.md:41-45` |
| 同篇 **D2**（`plan_ref`） | required 条件从 caller 字符串改为「engineering 恒需」 | **增补** | 同篇 `:51-64`；`lib/delegate-core.ts:2340` |
| 同篇 **D4**（`workRoot` 单槽） | **不动**；并行靠 worktree，不靠拆槽 | 不改 | 同篇 `:74-78` |
| 同篇 **D5**（`owner_agent`） | 枚举二值 → 三值；旧数据仍默认 `front` | **增补** | 同篇 `:80-84` |
| 同篇 **D6**（关闭范围） | 写隔离 / 停机证据 / 台账语义全部沿用 | 不改 | 同篇 `:86-88` |
| 同篇 **D7**（plan 优先） | 三主体后需定义 build 与 plan/front 的优先序；现行文案只有两向 | **增补**（否则 build 参与时语义未定义） | 同篇 `:90-118`；`lib/delegate-core.ts:287-304` |
| 同篇 **残留 #4 / #5** | 从 backlog 提升为**本批 BLOCKER** | 状态变更 | 同篇 `:214-215` |
| 同篇 **2026-11-20 退役订正** | 与本决策**方向相反**（退役 vs 扩主体）⇒ 必须先裁决 | **冲突，需裁决** | 同篇 `:152-157` |
| `ADR-plan-multi-session-collaboration` **D3** | 不新造通道 ⇒ 本推荐不冲突（它是同一通道的第三调用方） | 不改 | `docs/adr/ADR-plan-multi-session-collaboration.md:65-71` |
| 同篇 **D8** | 「不做子会话派工程实施」仍成立：build-worker 不是 subagent 派工程 | 不改（但需在合稿里显式说明「形态不是 subagent」） | 同篇 `:119` |
| 同篇 **D1 的 plan_ref 闭集** | `.rddf/plan-topics/**` 仍不得当 `plan_ref`，对 build 同样生效 | 不改 | 同篇 `:51` |

〔建议〕若父会话要把本结论转成 ADR，最小形态是：**新增一篇「delegate 第三调用方（build 编排）」ADR，D1/D2/D5/D7 以「增补」方式引用父篇，D4/D6 明确不改**；不要改写父篇正文（V14 的「既有 ADR 未被静默改写」纪律，父篇 `:201`）。

---

## 8. 反哺清单（TOPIC 要求登记在 n4/n5/n7）

1. **给 n4**：可机判的只有「槽位占用 / worktree 内 `out_of_scope_files` / 全局并发数」；「build 主会话是否真的没写 wave worktree」**不可机判**（差集只给路径不给写入者，`lib/delegate-core.ts:2593-2604`）⇒ 只能做事后 diff + 人工复核。`scope-diff-attribution` 仍是最大空洞。
2. **给 n4**：三主体后 `sessions` 是按 **session id** 过滤（`lib/delegate-async.ts:1612`），不是按 owner-kind ⇒ 「本 owner-kind 名下所有后端」没有单一查询入口；跨 kind 协调仍靠占槽文案（ADR 残留 #2 同型，`:212`）。
3. **给 n7**：`subagent` 形态没有停机证据链（C3）；若任何阶段退回 `subagent`，回滚可达性必须按「无法确认是否还在写」设计。
4. **给 n7**：回滚「替代」= 撤 build 五项 allow + 撤三值 + 恢复 `plan_ref` 条件；字段是增量的（`owner_agent` 第三值），旧数据默认 `front` 可兼容（`lib/delegate-core.ts:1413-1415`；D5 `:83`）。
5. **给合稿**：TOPIC 的「build-worker 子会话形态」措辞会误导 —— 推荐形态**不是**子会话 agent，而是「build 作为 delegate 调用方」。若合稿保留「build-worker」一词，应加一句「指 build 编排 + 后端 session，不是新 subagent」。

---

## 9. 待父裁决

1. **方向冲突**：ADR 的 2026-11-20 退役订正（`docs/adr/ADR-plan-delegate-engineering-session.md:152-157`）与「给 build 开门」相反。是先退役、还是先扩主体？本节点按「扩主体（替代）」给结论，但这条裁决权不在 n5。
2. **三值 owner 是否本批做**：本节点判「必须本批」，否则 C2 直接把 build 的后端交给 front 接管。若父要分期，需显式接受「窗口期内 front 可 resume/cancel build 的后端」。
3. **`plan_ref` 推广范围**：改成「engineering 恒需」会改变 **front** 的既有行为（front 派 build 目前不要求计划，`lib/delegate-core.ts:2340`）⇒ 属跨 ADR 影响，需父确认是否只对 build/plan 生效。
4. **是否保留「build-worker」这一名词**：本节点建议改用「build 编排 + delegate 后端」，避免被读成新 subagent agent（与 ADR D8 的范围声明冲突，`docs/adr/ADR-plan-multi-session-collaboration.md:119`）。

## 10. 自检（对照 BRIEF 验收口径）

| 验收项 | 状态 |
|---|---|
| 冲突点 ≥4，每条含 描述/触发/不变式/`path:line` | 7 条（C1–C7），五个必覆盖面全含 |
| 三种处置各含 改动面/新增不变式/失败面/ADR 冲突程度 | §4.1–§4.3 逐项齐 |
| 推荐单一、不并列 | §5.1 单一「替代」；§5.4 给停止条件 |
| 否决项写理由 + 出处 | §5.2 / §5.3，各带 ADR 行号 |
| 若推荐替代 ⇒ 前置条件清单含 `plan_ref` / build 产出计划 | §6 第 2、3 条 |
| 影响面点名具体决策编号 | §7：D1/D2/D4/D5/D6/D7 + 残留 #4/#5 + 退役订正 |
| `path:line` ≥8 | 正文 30+ 处 |
| 正文 ≥100 行 | 见文件 |
| 不改实现 / 配置 / ADR | 本节点只写 `TODO.md` / `RESULT.md` |

## STATUS: COMPLETE
