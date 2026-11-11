# ADR-front-cancel-release — `cancel` 的释放判据：与 `suspend` 同源 + 显式 `force` 出口

| 字段 | 值 |
|------|-----|
| Status | **Accepted**（2026-11-11 **用户签批**（指令：「请根据你的推荐进行实施」/「继续实施后续任务」）；oracle 1 轮（失败模式分析，含探针实证）+ **critic 2 轮**：第 1 轮 **REJECT**（3 BLOCKER：取代清单不完整 ⇒ 文档内两套口径）→ 第 2 轮 **APPROVE_WITH_CONDITIONS**（`mergeable: yes`，0 BLOCKER；8 SHOULD_FIX + 4 NITS **全部落实**）。⚠️ 关键取舍：**放弃原 D7**（`cancel` 对不占槽条目也墓碑）⇒ stop-ownership D1/S5 与共享函数零改动、`suspend` 零变化；代价登记为 backlog `cancel-idle-tombstone`。审稿记录 `.rddf/reviews/adr-front-cancel-release-review.md`） |
| Date | 2026-11-11 |
| Author | architect |
| Parent | **部分取代** `ADR-front-multi-backend` **D7.2 / D7.3 / D9（cancel 行）/ D11.3 / AC28 / V32–V37**；**部分取代** `ADR-front-stop-confirmation` **D1（判据适用于所有释放路径）/ D2:68 / D4（退化通道只对 suspend）**；**部分取代** `ADR-front-stop-ownership` **D2/S9（严格模式的赎回通道）/ D3⑩（多实例下空闲后端的出口）/ 实现约束·写者纪律（扩到 `cancel_pending`）**；**结案** `ADR-front-stop-ownership` **C7 / D3⑦**。**不动** stop-ownership 的 **D1（授权释放的判定顺序）/ S5** ⇒ `cancel` 对**不占槽**条目（`idle`/`suspended`）保持今天的**幂等 no-op**（见「已知行为」与 backlog） |
| 关联 change | `openspec/changes/front-cancel-release/`（**待立项**）。improvement：`front-cancel-release.md`（**待建**） |
| AC 映射 | 待回填（change 未立项 ⇒ 允许暂缺） |
| 前置事实 | 上游 opencode **v2.2.5**（`scripts/check-upstream-anchors.sh` 对 v2.2.5 **19/19**）；探针 `/tmp/opencode/probe/probe-cancel-release.ts`（`cancel` 误放槽的实证；**归档前须固化进仓库**，见 Verification F19） |

## 背景与问题

`ADR-front-stop-confirmation` D1 已裁定：**`interrupt` 的返回值不是停机判据**（上游 `interrupt` 只保证「已接受」，cleanup 异步 settle）。但 `cancel` 至今**只看这个返回值**就释放槽位并置墓碑。

**探针实证**（`/tmp/opencode/probe/probe-cancel-release.ts`，可复跑）：

```
X = ses_c1；后端在跑 = true
cancel → state=tombstone interrupted=true
cancel 后 X 的 state = tombstone（墓碑 ⇒ 不占槽）
Y = ses_c2（被准入）            ← 同工作树第二个后端
占槽条目 = 1: ses_c2@active
X 仍在跑 = true                ← X 还在写
结论：❌ cancel 在后端仍在跑时释放了槽位 ⇒ 同工作树两个写入者
```

⇒ 该路径正是 `ADR-front-multi-backend` **D7.3「强制接管」**（推荐恢复路径：`cancel` 旧条目 → `dispatch` 新后端）的直接实现 ⇒ **推荐的恢复路径本身是双写者生成器**。

### 同一个返回值还导致**反向**的故障（今天已存在）

上游 `interrupt` 返回 `false` 有**三种成因**（锚点 A5：无 execution / `stopping` 中（**仍在跑**）/ settle 窗口）⇒ 其中**两种其实还在跑**，而 `cancel` 把 `false` 一律判成「不在运行」⇒ **纯 no-op**（不墓碑、不放槽）：

- **D7.3 唯一该生效的场景里走不通**：后端正在停机过程中 ⇒ `false` ⇒ no-op ⇒ 工作树被占住。
- **D7.2/AC49 的「cancel 后重派」主路径在后端从未起跑时是 no-op** ⇒ `dispatching`（**永久占槽**）条目永远不放 ⇒ 而 `dispatch(resume=X)` 对 `dispatching` 被明确拒绝 ⇒ **死锁**。

⇒ 今天的 `cancel` 在**两个方向**都不可靠：假停机 ⇒ 误放槽（双写者）；假死槽 ⇒ 工作树砖死。

## 决策

**「取消」= 中断 + **停机确认** + 授权释放，三者缺一不可；证据不足 ⇒ **整单拒绝**（不墓碑、不放槽）并留痕；唯一的例外是**每次调用显式**的 `force`（可见、落盘、可审计）。**

### D1 `cancel` 的释放判据 = 与 `suspend` **同一条**停机判据

`cancel` 复用 `suspend` 的判据与授权机制（**判据本身不改**，只扩适用范围）：

```
⓪ 授权前置   条目不存在 ⇒ `slot_entry_gone`；条目已是 `idle`/`suspended` ⇒ `slot_already_released`
             （**幂等、优先于证据类**；同 stop-ownership D1 的 reason 优先级：授权类优先）
① 锁外快照     v0 = time.idle、running0 = 判活、**claim_gen 快照**（授权用）
② 锁内置守卫   （同 suspend 的进程内准入守卫；owner token + 引用计数）
③ 锁外 interrupt({resume:false})   ← 返回值**降级为诊断字段**（interrupted），不再决定墓碑与放槽
④ deadline     W = min(RDDF_STOP_TIMEOUT_MS, 60s)
⑤ race(ctx.session.wait(...), deadline)
⑥ 判活为假（至少判一次）
⑦ running0 = true ⇒ 要求 time.idle > v0（至少判一次）
   ⚠️ 多实例（tripwire 命中）⇒ running0 = false 也要求水位线前移（同 stop-ownership D2 严格模式）
⑧ 全部通过 ⇒ 锁内**授权释放**（代号 + 状态前置，同 stop-ownership D1）⇒ 置 tombstone（不占槽）
⑨ finally     清守卫
```

- **`interrupt` 的返回值不再是判据** ⇒ 关闭「假停机 ⇒ 误放槽」。
- **`cancel` 不再以「`interrupted:false` ⇒ no-op」为语义** ⇒ 关闭「假死槽 ⇒ 砖死 / D7.2 死锁」：**单实例**下，后端**从未起跑**时 `wait` 立即返回 + 判活为假 ⇒ 停机成立 ⇒ 墓碑 + 放槽（`dispatching` 死锁随之解除）。
  ⚠️ **多实例下不成立**（严格模式要求水位线前移，而从未起跑的后端没有水位线可前移 ⇒ 被拒）⇒ 与 D6 的代价一致。
- **`cancel` 与 `suspend` 的分界仍然成立**：两者**共用同一条释放判据**，差别只在成功时写入的终态（`suspended` vs `tombstone`）+ `remove` + 不可逆性 ⇒ multi-backend D1「用独立工具承载不可逆默认值」的论证不变。

### D2 证据不足 ⇒ **整单拒绝**（不墓碑、不放槽）+ 留痕

- **拒绝分两类，返回的 reason 取值取自既有词汇表**（stop-ownership D1）：
  - **证据类**：`wait_timeout` / `wait_no_op` / `still_running` / `degraded_no_evidence` / `unreadable`；
  - **授权类**：`slot_reclaimed` / `slot_state_changed` / `slot_entry_gone` / `slot_already_released`（其中 `slot_already_released` 只在**不占槽**条目上出现 ⇒ 见「已知行为」）。
- 拒绝 ⇒ **不墓碑、不放槽**，条目保持原状（仍占槽、仍可 resume）+ 返回 `stop_judge`（`wait` / `degraded`）+ `forced_available: true`（提示存在 `force` 出口）。
- **落 `event:"cancel_refused"` ledger 行**（含 reason + `forced_available`）⇒ 否则 ledger 无法区分「从未尝试」与「尝试过但被拒」（审计断链）。
- ⚠️ 被拒时**目标仍活在盘上**（可 resume）——与今天的 no-op **同形**（非新形态），但**必须留痕且 `sessions` 可见**，否则 front/用户会误以为「已终止」。
- ⚠️ **授权类拒绝不写 `cancel_pending`**（见 D3③）⇒ 不钉别人的条目。

### D3 `cancel_pending`：钉住判据 + 挡住 reconcile 的「后门」

被拒（**且仅限证据类拒绝**）时在条目上写**一个字段**（**不是**新状态、**不是**新枚举）：

```json
"cancel_pending": { "baseline_idle": <本次尝试前的 time.idle>, "baseline_running": <本次尝试前的 running0>, "at": "<ISO8601>" }
```

四件事：

1. **判据跨重试一致**：重试 `cancel` 时用**钉住的** `baseline_idle` / `baseline_running` ⇒ 水位线判据在重试间不漂移。
   ⚠️ **水位线必须相对「本次尝试的快照」前移**（`time.idle > 本次的 v0`），而**不是**相对钉住的旧基线 —— 否则「越过旧基线」只证明**过去**某次 execution 结束过，不证明**当前**这次结束 ⇒ 叠加「陈旧 busy」窗口可复现本篇要消灭的双写者。
   ⇒ **`baseline_idle` / `baseline_running` 只用于**记录与诊断**（供 front/人看清「这次停机尝试的起点」），**不作为水位线的比较基准**；水位线一律用**本次尝试**的快照。⇒ 「跨重试一致」指的是**判据形态**一致，不是**基线数值**一致。
2. **挡住 reconcile 的后门**：`claimSlot` 的 reconcile 会把「`active` 且判活为假」的条目翻成 `idle`（自动放槽）⇒ 被 `cancel_pending` 钉住的条目**不得**被自动放行 ⇒ 否则「刚拒绝释放的后端」会被 reconcile 放掉 ⇒ **双写者从后门回来**。
   ⇒ **修订** multi-backend **D7.1 / D7.3 / V32–V33**：reconcile 的自动放行**对被钉住的条目不适用**。
3. **钉住范围**：`cancel_pending` **只在证据类拒绝且 `claim_gen` 未变时**写。
   ⚠️ 授权类拒绝（`slot_reclaimed` ⇒ 槽位已被**另一路**认领）**不得**钉住 ⇒ 否则新占者的条目被 reconcile 挡住 ⇒ 新占者变死槽（本篇要消灭的「砖死」的新形态）。
4. **生命周期**：成功释放 ⇒ 字段随条目消失；后端被删（D12 路径）⇒ 字段消失；条目被墓碑 ⇒ **不得**带该字段。
   ⇒ **写者纪律**：`cancel_pending` 与 `claim_gen` 一样**必须被保留**（`registerSession` 的固定字段重建会丢它 ⇒ 后门保护静默失效）⇒ **扩展** stop-ownership 实现约束的「写者纪律」到 `cancel_pending`。

### D4 `force`：**每次调用显式**的参数（不是环境变量）

- `cancel({force: true})` ⇒ **只跳过停机证据门控**，**不跳过授权门控**（`releaseSlotAuthorized` 的判定顺序不变）⇒ 条目须处于 `active`/`dispatching` 才会墓碑 + 释放（`idle`/`suspended` ⇒ 仍 `slot_already_released`，不墓碑、不放槽） + 落 `event:"cancel_forced"`（含 `reason`（哪条证据没过）/ `forced: true` / `strict_mode` / `baseline_idle` / `baseline_running`）+ 返回 `forced: true` + **风险文案**（该后端可能仍在写这个工作树）。
- **为什么不用环境变量**（与 stop-confirmation D4 的 `RDDF_SUSPEND_ALLOW_DEGRADED` 的差别）：env 是**部署级默认** ⇒ 全体 front **无差别**放行、**用户未逐次知情**；per-call 则**逐次可见 + 落盘可审计**。
  ⚠️ **不**以「env 对 front 不可见」为理由 —— stop-confirmation D4 的 env 通道正是**用可见性**（`stop_judge:"degraded-forced"` + ledger）承载的 ⇒ 两条 env 通道在本仓**并存**（`RDDF_SUSPEND_ALLOW_DEGRADED` 只对 `suspend`；`cancel` 侧只用 per-call `force`）。
- **对 stop-ownership D2/S9 的偏离（**已登记**）**：严格模式下 `force` **仍允许** —— 偏离仅限 **per-call 通道**（env 通道在严格模式下依然不可用）；理由同上（可见 + 可审计 vs 部署级默认）。严格模式下必须带 `foreign_instance: true` + `strict_mode: true` + 落盘。
- ⚠️ `force` 是**不可逆动作的显式加强**（与 `cancel` 同一语义），**不是**把 `cancel` 变成 `suspend`；其缺省是**安全侧**（不写即不 force）⇒ 不落入 multi-backend D1「漏写即静默丢失」的形态。
  ⚠️ 但 `delegate_cancel` 的权限 action **无法区分** `force` 与普通 `cancel`（两者同一 action）⇒ 治理面若要「允许终止、禁止强制放槽」，需要独立工具（见选项表 K6，**本篇不做**）。

### D5 front 侧的恢复序列（**取代** D7.3 的两步）

```
0. sessions ⇒ 找 workRoot W 的占槽者 X（权威源是 pair.json，不是 metadata）
1. suspend(X)              ← 优雅路径；成功 ⇒ 槽已释放 ⇒ 跳 4
2. suspend(X) 失败（wait_no_op / still_running / wait_timeout / degraded_no_evidence）⇒ 进 3
3. cancel(X)               ← 证据门控
   成功 ⇒ 跳 4
   被拒（reason R）⇒ 工作树被「正确地」占着（X 可能还在写）⇒ front 二选一：
     3a 等 + 重试：数秒后重试 cancel(X)（判据形态一致；水位线仍相对本次尝试的快照）
     3b cancel(X, {force:true}) ⇒ 墓碑 + 放槽 + event:"cancel_forced"
         ⇒ **front 必须先向用户说明「该后端可能仍在写这个工作树」**
4. dispatch(Y)（同 workRoot）⇒ 成功
```

⚠️ `dispatch` 的 reconcile 会先尝试释放「已空闲的 `active`」⇒ **被 `cancel_pending` 钉住的条目不得被它自动释放**（D3②）。

### D6 跨实例：复用 tripwire + 严格模式（不假装可解）

- 命中 tripwire ⇒ 多实例 ⇒ `cancel` 切**严格模式**（`running0=false` 也要求水位线前移）⇒ `stop_judge:"degraded"` + `foreign_instance: true`。
- ⚠️ 严格模式下 `cancel` 的真实语义是「**等它自然跑完**」——上游 `interrupt` 能否打断**另一实例**的 execution **未核对**（上游 feature request #5）⇒ 必须对 front 如实说明，**不得**宣称「已打断」。
- 严格模式下 `cancel` 一个空闲后端也会被拒（同 `suspend` 的代价）⇒ 出路是 `force`。
- ⚠️ 与 stop-ownership D2 的**下游义务**协调：stop-ownership D2 要求「**不得**建议用 `cancel` 释放空闲后端」⇒ 本篇的出路是 **`force`**（终止该后端），**不是**「用 `cancel` 释放空闲后端」⇒ 两者不冲突，但文案必须区分。

### D7 已知行为与 backlog（**本篇不改**）

| 形态 | 现状 | 处置 |
|---|---|---|
| `cancel` 对**不占槽**条目（`idle`/`suspended`，**session 仍存在时**） | **幂等 no-op**（不墓碑、不放槽）——stop-ownership D1/S5 的直接后果 | **本篇不动**（改它要动 stop-ownership 的 D1/S5 与 multi-backend 的 D6.3 表 + D12 注记 ⇒ 变更面大）。⇒ 登记为 **backlog `cancel-idle-tombstone`**：将来若要「终止即墓碑」，须单独裁定并同步四处条款 |
| front 认知：「`cancel` 对**空闲**后端是空操作」 | 现文档写的是「对**本来就空闲**的后端，`cancel` 是空操作……槽位会由**下一次派发**的回收顺带释放」 | **必须改写**（不是保持）：那句话指的是「`active` 但当前没有 execution 在跑、**仍占槽**」的后端 —— 落在 D1 已改判的格子里 ⇒ 新语义下它**不再**是空操作（证据成立即可墓碑 + 放槽）。⇒ 术语拆成两类：**不占槽条目**（`idle`/`suspended` ⇒ 幂等 no-op，见上）与「`active` 但未在跑」（⇒ 本篇新语义：可终止并放槽）。⚠️ 后一句「槽位由下一次派发的回收顺带释放」在**被 `cancel_pending` 钉住**时也不成立（D3②）⇒ 两处 front 文案都要删改 |

## 选项对比表

| # | 方案 | 结论 | 理由 |
|---|---|---|---|
| **K0** | **共用停机判据 + 证据不足整单拒绝 + per-call `force` + `cancel_pending` 钉住** | **采用** | 同时关掉「假停机误放槽」与「假死槽砖死」两个方向；**不新增状态枚举、不新增工具**；**不改变「墓碑 ⇒ 槽位已释放」**；`force` 提供**明确可审计**的出口（避免 K2 单独使用时的永久砖死）。代价：新增一个持久字段 `cancel_pending`（见「与 B6 的区别」） |
| K1 | 判不出来 ⇒ 不释放但仍置墓碑 | 否 | **自相矛盾**：墓碑按 D6.3 不占槽 ⇒ 「置墓碑」**就是**放槽；补 hold 字段即退化为 K5 |
| K2 | 判不出来 ⇒ 整单拒绝（**无** force 出口） | 否 | 单独使用 ⇒ 「后端真的停不下来」时 `cancel` 永久拒绝 ⇒ 工作树**永久**失去切换能力（比 K0 少一条明确且可审计的出口） |
| K3 | 判不出来 ⇒ 用**环境变量**赎回 | 否 | 理由**不是**「env 不可见」（stop-confirmation D4 的 env 通道正是靠可见性承载的 ⇒ 本仓并存一条 env 通道（suspend）+ 一条 per-call 通道（cancel））；真实理由是「**部署级默认 ⇒ 全体 front 无差别放行、用户未逐次知情**」⇒ 风险从「用户知情的一次显式动作」退化为「默认」 |
| K4 | 维持现状（`interrupt` 返回即释放）+ 如实登记风险 | 否 | 探针那两行原样保留：`占槽条目=1: ses_c2@active` + `X 仍在跑=true` ⇒ **两个写入者**；且 D7.3 仍把它当**推荐恢复路径** ⇒ 观测只登记风险，不阻止 D7.3 **主动生成**它 |
| K5 | 新增「已终止但仍占槽」状态 | 否 | 破坏五值枚举（stop-confirmation S4c / stop-ownership S6）；**持久化中间态** ⇒ 进程死 ⇒ 工作树**永久**失去切换能力（stop-confirmation B6 明文反对）；破坏「墓碑 ⇒ 已释放」⇒ D6.3/D9/D12 全要重写 |
| K6 | 拆 `cancel` + 独立 `release` 工具 | 否（次选） | 第 5 个工具 ⇒ 四工具表 / V01–V04 / prompt / 文档全改；「cancel 完了、release 没调」⇒ 半程两段式 ⇒ **仍需 hold** ⇒ 回到 K5 的持久化中间态坑。**唯一独占优势**：`release` 可有独立 permission action（治理面「允许终止、禁止强制放槽」）⇒ 若该需求是硬的，应采 K6 并把崩溃恢复规则写全 |

### 与 `ADR-front-stop-confirmation` **B6**（反对持久化中间态）的区别

B6 反对的是「**新增一个状态枚举值**（如 `suspending`）⇒ 进程死在窗口内 ⇒ 条目永久占槽 ⇒ 该工作树永久失去切换能力」，而**没有**定义崩溃恢复规则。

本篇的 `cancel_pending` **不是**状态枚举值：条目 `state` 仍在五值枚举内 ⇒ **不产生**「状态未知 ⇒ 死槽」那一整类。但它**确实**新增了一条持久条件（「被钉住 ⇒ 不可自动放行」）⇒ 必须有崩溃恢复规则：

- **崩溃恢复规则**：插件重启后钉住**仍在** ⇒ 出口只有三条 —— ① `cancel` 成功（证据成立）；② `cancel({force:true})`；③ 后端被删（D12 路径）。
  ⇒ 「插件重启 ⇒ 钉住自动解除」**不做**（那会让双写者从后门回来）⇒ 代价是「重启不能自动解钉」⇒ 已作为**新增死槽面（已接受）**登记 ⇒ 必须在 `sessions` 里可见（见「sessions 可见性」落点）⇒ front 才能知道「这个后端被钉住了，需显式处理」。
- ⇒ 与 K5 的**不对称**在于：K5 引入的是**未知态**（无法判断该做什么）⇒ 本篇引入的是**已知态 + 明确的三条出口** ⇒ 可恢复。

## 后果 / 代价

**正面**

- 「假停机 ⇒ 误放槽」关闭（探针形态）⇒ D7.3 不再**主动生成**双写者。
- 「假死槽 ⇒ 砖死 / D7.2 死锁」关闭（`cancel` 不再以 `interrupted:false` 为 no-op 语义）。
- `force` 给出**明确、可见、可审计**的出口 ⇒ 不必用 env 承担风险。

**负面 / 代价**

- **`cancel` 不再「总是能终止」**：证据不足 ⇒ 整单拒绝 ⇒ 目标仍活在盘上（可 resume）⇒ front 的措辞必须随之改（「`cancel` 成功」才意味着「已终止」）。
- **多一次 `wait` 往返**：`cancel` 变慢（与 `suspend` 同量级，W ≤ 8s）。
- **多一个持久字段** `cancel_pending` ⇒ 旧文件无该字段 ⇒ 读作「无」；**重启不解钉** ⇒ 需要显式处理（见上）。
- **reconcile 的自动放行不再无条件**（D3②）⇒ multi-backend D7.1/D7.3/V32–V33 必须改写。
- **`force` 是危险动作**：它把「可能双写者」的风险**显式转交**给用户；且 `delegate_cancel` 的权限 action **无法区分** `force` 与普通 `cancel` ⇒ 治理面若要区分，需独立工具（K6，本篇不做）。

**风险**

- **跨实例（⑥）**：严格模式下 `cancel` 空闲后端也会被拒；且 `interrupt` 能否打断另一实例的 execution **未核对** ⇒ 严格模式下的 `cancel` 实际是「等它自然跑完」。
- **上游 `session.remove` 是否中断运行中的 execution 未核对** ⇒ **不得**让 `remove` 承担停机语义（`cancel({remove:true})` 只删 session，不作为停机证据）。

## 必须同步修订的既有条款（本篇的「取代关系」落地清单）

| 文件 | 条款 | 修订 |
|---|---|---|
| `ADR-front-multi-backend` | D7.2 | 「`dispatching` 永久占槽 ⇒ 唯一恢复路径是 cancel」⇒ 改为「cancel（证据门控）→ 不足则 `force` → 重派」，并如实记录旧实现下该路径在后端从未起跑时是 no-op（死锁） |
| 同篇 | D7.1 / D7.3 / **V32–V33** | reconcile 的自动放行**对被 `cancel_pending` 钉住的条目不适用**；D7.3 的强制接管序列 ⇒ **D5**（含 `force` 的用户知情要求） |
| 同篇 | D9 表（cancel 行） | 「墓碑与放槽**同时**发生、以停机证据为前提；证据不足 ⇒ 整单拒绝」；`force` 路径下「墓碑 ⇒ **放弃该目标**」（不保证已终止） |
| 同篇 | D11.3 | 判据适用范围从 suspend 扩到「**任何释放**」 |
| 同篇 | **AC28 / V36 / V37** | 墓碑条件从 `interrupted:true` 改为「停机已确认」；**返回体新增字段**（`reason` / `stop_judge` / `forced` / `forced_available`）⇒ 属**返回契约的破坏性变更**（下游按旧字段解析会失配） |
| 同篇 | D6.3 表 / D12 矩阵 | **不变**（本篇不改墓碑语义 ⇒ 不占槽条目仍走 stop-ownership D1/S5 的幂等 no-op） |
| 同篇 | **D12 ⚠️ 注记**（`:299`「`interrupted:false ⇒ 纯 no-op、不墓碑」这一半适用于「session 仍存在但不在跑」）| **同步改写**：该一半被本篇取代（墓碑条件改为「停机已确认」）⇒ 注记改为「`cancel` 对**不占槽**条目幂等 no-op；`active` 但未在跑的条目按停机证据判定」 |
| 同篇 | **D1 工具表 `cancel` 行**（`:63`「`interrupt({resume:false})` + 墓碑」）| 加「**证据门控**」（证据不足 ⇒ 整单拒绝） |
| `ADR-front-stop-confirmation` | D1 | 「任一判不出来 ⇒ 不释放」显式适用于**所有释放路径** |
| 同篇 | D2:68 | 「守卫窗口内的 `cancel` **允许**（它不产生新写入者）」⇒ **改写**：守卫**仍会挡住**该窗口内的 `dispatch`；真正的窗口在**守卫清掉之后**；且在**非 force** 路径上 D1 的证据门控已保证后端停了 ⇒「cancel 恰恰产生新写入者」**只对 force 路径成立** |
| 同篇 | D4 | 退化赎回通道（`RDDF_SUSPEND_ALLOW_DEGRADED`）**仅对 `suspend`**；cancel 侧只用 per-call `force` ⇒ 措辞需明确（**一条 env 通道（suspend）+ 一条 per-call 通道（cancel）并存**）。⚠️ 另：`stop_judge` 挂在 **`suspend` 的返回值**上这一句须**扩到 `cancel`**（本篇 D2 让 `cancel` 也返回 `stop_judge`） |
| `ADR-front-stop-ownership` | D2（**严格模式的作用域**）/ **S9** | 严格模式的作用域从 `suspend` **扩到 `cancel`**（本篇 D1 ⑦ 的多实例水位线要求）**+ 偏离登记**：严格模式下的赎回通道**新增 per-call `force`**（env 通道在严格模式下**仍不可用**）⇒ S9 的「不可赎回」限定为 env 通道 |
| 同篇 | D3⑩ | 「多实例下空闲后端**无直接释放动作**」的**前提已被本篇 D6 推翻**（多实例下可用 `force`）⇒ 改写为：「多实例下空闲后端的直接释放动作 = `cancel({force:true})`；**被 `cancel_pending` 钉住时，reconcile 顺带释放这条出口不可用**」 |
| 同篇 | 实现约束·写者纪律 | **扩展**到 `cancel_pending`（与 `claim_gen` 同等保留义务） |
| 同篇 | 实现约束·「`cancel` 的边界」那条 | 「不改它的停机证据要求（那是 C7 的另立 change）」⇒ **改为指向本篇**（C7 已在本篇结案） |
| 同篇 | C7 / D3⑦ | 本篇**结案** |
| `ADR-front-knowledge-capability` | D5（`event` 枚举 + **字段表** + 行产生时机表 + `outcome` 恒 `null` 规则） | 新增 `cancel_refused`（含 `reason` / `forced_available`）与 `cancel_forced`（含 `reason` / `forced` / `strict_mode` / `baseline_idle`）⇒ **单点耦合**（multi-backend D2.2 已预告） |
| `prompts/front.md` / `docs/front-delegate-usage.md` | 恢复序列 + **两处点名旧句** | 换成 **D5**；**不得**再把裸 `cancel` 写成「释放入口」；`force` 前必须向用户说明。⚠️ **点名改写**：`prompts/front.md:59` 与 `docs/front-delegate-usage.md:180` 的「槽位会由**下一次派发**的回收顺带释放」两句 —— 在**被 `cancel_pending` 钉住**时**不成立**（D3②）⇒ 必须删改 |
| `ADR-front-multi-backend` | **V08 / V42**（`sessions` 每项含状态与证据字段）+ 工具表 | `sessions` 输出契约**新增**「已钉住」标记（`cancel_pending` 可见）⇒ 否则「砖死不是静默的」没有落点 |

## Verification（可勾选验收判据，前瞻）

> 每条必须**客观可判**（假 ctx 形态 / ledger 行 / `pair.json` 字段 / 上游源码锚点）。编号供 change 的 AC 映射引用。

**停机确认（D1）**

- [ ] **F1 假停机不放槽**：`interrupt → {interrupted:true}` 且 `busy` 保持为真、`wait` 立即 resolve ⇒ `cancel` **不得**释放、**不得**墓碑；reason ∈ {`wait_no_op`,`still_running`}；条目仍 `active`；随后的 `dispatch` **被拒**（错误含占槽者 id）。
- [ ] **F2 终态可见 ⇒ 成功**：`time.idle` 在 interrupt 后前移 ⇒ `cancel` 成功 ⇒ `state=tombstone` + 槽位释放 + `event:"cancelled"`。
- [ ] **F3 退化（`wait` 缺失）+ `running0=false`** ⇒ 拒绝（`degraded_no_evidence`）+ `stop_judge:"degraded"`，不墓碑、不放槽。
- [ ] **F4 退化 + `running0=true` + 水位线前移** ⇒ 允许放行（D4 的 `running0=true` 分支对称）。
- [ ] **F5 其它不可判**：`wait` 超时 / `session.get` 读失败 ⇒ 拒绝（`wait_timeout` / `unreadable`），条目回原态。
- [ ] **F6 后端已删（NotFound）** ⇒ 走 D12：墓碑 + `outcome:"vanished"` 行 ⇒ **逐字比对** multi-backend V09「终止 / 暂停面」段（保 stop-ownership S7 绿）。

**显式出口与钉住（D2/D3/D4）**

- [ ] **F7 `force`**：`cancel({force:true})` ⇒ 墓碑 + 放槽 + `event:"cancel_forced"` + `forced:true` + 风险文案；**默认路径**在 F1 形态下**绝不放槽**。
- [ ] **F8 授权类拒绝**：`cancel` 窗口内 `claim_gen` 变化 ⇒ 不墓碑、不放槽，reason `slot_reclaimed`；**不得**写 `cancel_pending`（D3③）。
- [ ] **F9 `cancel_pending` 挡住 reconcile**：证据类拒绝后条目带 `cancel_pending` ⇒ 随后的 `dispatch` 的 reconcile **不得**把它翻 `idle`（构造 stale-busy：后端其实在跑 ⇒ 必须仍被占）。
- [ ] **F10 `cancel_pending` 生命周期**：成功释放 / 后端被删 / 墓碑 ⇒ 字段消失；且**经 `registerSession` 路径（同步 `delegate` 收尾）后字段仍在**（写者纪律）。
- [ ] **F11 钉住不削弱水位线**：第一次 `cancel` 被拒 → 后端跑完（`time.idle` 前移）→ 后端**重新起跑且 `Execution.Started` 未投影**（陈旧 busy 窗）⇒ 第二次 `cancel` **不得**放行（水位线相对**本次尝试**的快照）。

**不占槽条目与账目**

- [ ] **F12 `cancel` 对不占槽条目 ⇒ 幂等 no-op**（保持 stop-ownership D1/S5）：`state=idle` ⇒ reason `slot_already_released`、不墓碑、不放槽。
- [ ] **F13 不占槽 + 证据不足** ⇒ 拒绝（`slot_already_released` 优先于证据类）⇒ 不墓碑、条目仍是 `idle`。
- [ ] **F14 ledger**：证据类拒绝 ⇒ `event:"cancel_refused"`（含 reason + `forced_available`）；**不得**产生 `cancelled` 行；`force` ⇒ **不得**产生普通 `cancelled` 行（必须可区分）。

**跨实例与回归（D6）**

- [ ] **F15 严格模式**：多实例 ⇒ `cancel` 的 `running0=false` 也要求水位线前移 ⇒ 空闲后端被拒 + `foreign_instance:true` + `stop_judge:"degraded"`；`running0=true` ⇒ 保留 `"wait"`；严格模式下 `force` 仍可用且带 `strict_mode:true`。
- [ ] **F16 上游锚点**：`scripts/check-upstream-anchors.sh` 对 v2.2.5 全绿（≥19），并新增：`interrupt({resume:false})` **不删除** pending inbox 行、`nextPromotable` **优先提升** steer。
- [ ] **F17 单槽不变式 + 回归**：任一时刻同一 `work_root` 占槽条目 ≤ 1；单测全绿；E2E L2-19/L2-20/L2-22/L2-23 绿；新增 E2E「running → cancel 拒绝 → force → dispatch 成功」。
- [ ] **F18 前端文案**：`prompts/front.md` 与 `docs/front-delegate-usage.md` 含 **D5** 的恢复序列；**不得**出现「用裸 `cancel` 释放运行中的后端」的表述；`force` 前要求用户知情。
- [ ] **F19 探针固化**：本篇引用的探针 `/tmp/opencode/probe/probe-cancel-release.ts` **须固化进仓库**（否则归档后前置事实不可复核）⇒ 与 F1 的假 ctx 形态同源。

## 已排除的替代方案（逐条理由）

- **K1（判不出 ⇒ 不释放但仍置墓碑）**：墓碑按 D6.3 不占槽 ⇒ 「置墓碑」**就是**放槽 ⇒ 与「不释放」直接冲突；补 hold 字段即退化为 K5。
- **K2（整单拒绝但无 force）**：「后端真的停不下来」时 `cancel` 永久拒绝 ⇒ 工作树**永久**失去切换能力 ⇒ 少一条明确且可审计的出口。
- **K3（env 赎回）**：**部署级默认** ⇒ 全体 front 无差别放行、用户未逐次知情 ⇒ 风险从「用户知情的一次显式动作」退化为「默认」。⚠️ 真实理由**不是**「env 不可见」（stop-confirmation D4 的 env 通道正是靠可见性承载的 ⇒ 本仓并存一条 env 通道（suspend）+ 一条 per-call 通道（cancel））。
- **K4（维持现状）**：探针那两行原样保留 ⇒ 两个写入者；且 D7.3 仍把它当推荐恢复路径 ⇒ 观测只登记风险，不阻止 D7.3 **主动生成**它。
- **K5（新状态）**：破坏五值枚举；持久化中间态 ⇒ 进程死 ⇒ 工作树永久失去切换能力（B6 反对）；破坏「墓碑 ⇒ 已释放」。
- **K6（拆工具）**：第 5 个工具 ⇒ 四工具表/V01–V04/prompt/文档全改；半程两段式 ⇒ 仍需 hold ⇒ 回到 K5 的坑。唯一独占优势 = 独立 permission action（治理面「允许终止、禁止强制放槽」）⇒ 若该需求是硬的，应采 K6 并写全崩溃恢复规则。
- **「cancel 直接删 session 当停机手段」**：上游 `session.remove` 是否中断运行中的 execution **未核对** ⇒ 若不中断，删了 session 后 fiber 仍在写工作树 ⇒ 双写者且审计线索也没了 ⇒ 登记为上游 feature request。
- **「让 reconcile 用廉价 `busy` 判据自动放掉被拒的 `cancel`」**：我们**刚刚**拒绝释放的后端会被 reconcile 又放掉 ⇒ 双写者从后门回来 ⇒ 必须有 D3② 的钉住规则。
- **「cancel 永不释放槽位，让 front 自行决定何时放」**：工作树可用性完全依赖 front 再调一次 ⇒ 死槽；无独立 release 工具时 front 只能反复 cancel ⇒ 模型循环。

## 上游 feature request（追加）

5. **`interrupt` 的跨实例语义**：明确「`interrupt` 是否能打断另一实例的 execution」⇒ 决定多实例下 `cancel` 的真实语义（打断 vs 等它自然结束）。
6. **`session.remove` 是否中断运行中的 execution**：未核对 ⇒ **不得**让 `remove` 承担停机语义。

## 实现约束（不属于决策，但会误导实现，先写死）

1. **`claim_gen` 快照点在「判读条目时」取**（D1 ①）⇒ 取晚了授权即失效（stale 快照 ⇒ 该拒绝的没拒绝）。
2. **守卫的 owner token + 引用计数**：`cancel` 的守卫可能**嵌套**在 `suspend` 的守卫内 ⇒ 必须按 token 精确移除，**不得**清掉别人的守卫。
3. **`cancel_pending` 的写者保留纪律**（与 `claim_gen` 同等）⇒ `registerSession` 的固定字段重建必须保留它。
4. **ledger append 与 pair 写在同一次 `withLock` 临界区**（knowledge-capability D5 的单写者纪律）。
5. **`releaseSlotAuthorized` 的改动范围**：本篇**不改**它的判定顺序（`idle`/`suspended` 早退仍在）⇒ `suspend` 的行为**零变化**；`cancel` 走同一函数 ⇒ `cancel` 对不占槽条目得到 `slot_already_released`（F12）。
6. **`interrupt` 的返回值只作诊断字段**（`interrupted`）⇒ 不得再用它决定墓碑或放槽。
