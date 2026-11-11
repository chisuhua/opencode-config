# ADR-front-stop-confirmation — 停机确认：execution 级证据 + 进程内准入守卫

| 字段 | 值 |
|------|-----|
| Status | **Accepted**（2026-11-10 **用户签批**；oracle 1 轮 + critic 2 轮（REJECT → 闭合复审 **APPROVE_WITH_CONDITIONS**，`mergeable: yes`）+ metis gap 分析；审稿记录 `.rddf/reviews/adr-front-stop-confirmation-review.md`） |
| Date | 2026-11-10 |
| Author | architect |
| Parent | **部分取代** `ADR-front-multi-backend` **D11.3 的「判据选型」**（其**分支结构**「基线不在跑 ⇒ 无附加要求」与**有界**要求继续有效）；承接该篇 D11.3 登记的备选「改用 `ctx.session.wait`」 |
| 关联 change | **`openspec/changes/archive/2026-11-10-front-stop-confirmation/`**（2026-11-10 立项 → **实施完成并归档**；planner 起草 proposal，**AC1–AC18**；其中 AC1–AC9 直接沿用本文件的 Verification S1–S11）。配套 `openspec/changes/archive/2026-11-10-front-async-resume-guard/`（AC1–AC14）覆盖同一竞争面的「运行窗口」。improvement：[`front-stop-confirmation.md`](../../.rddf/improvements/front-stop-confirmation.md) / [`front-async-resume-guard.md`](../../.rddf/improvements/front-async-resume-guard.md) |
| AC 映射 | 待回填（change 未立项 ⇒ 允许暂缺） |

## 背景与问题

`ADR-front-multi-backend` D11.3 的判据（判活为假 + 基线在跑时水位线前移）在验收中通过，但该篇**风险章**登记了两个可达的假停机窗口，后果都是**两个写入者**：

1. **陈旧 busy**：session 曾空闲过（`idle > 0`），新一轮 execution 刚起、`Execution.Started` 尚未投影 ⇒ 读到陈旧 `busy`（`< idle`）⇒ 两级判活都不成立 ⇒ 基线判为「不在跑」⇒ 按 D11.3 不要求水位线 ⇒ 判停机。
2. **后继 execution**：清理期间到达的 wake 在 `settle` 时起后继 execution ⇒ 水位线已前移而新一轮已在跑。

**可达性**：插件自己的四工具即可触发 —— `dispatch(resume=X)` 会给 X 投递简报并 ring 上游 doorbell（`session.ts:187`，插件不传 `resume:false`）。

**本轮实测**（`/tmp/opencode/probe/p2-*.ts`，opencode v2.2.5；可复跑）：

| 探针 | 结果 | 含义 |
|---|---|---|
| 空闲 session `wait` | 27ms | 空闲即返回 |
| 运行中 `wait` | 173s，`time.idle` 前移 | 阻塞到 run 结束 |
| `interrupt` + **清理期间再 prompt** ⇒ `wait` | **2921ms**，`idle` 前移 | **覆盖后继 execution** |
| **跨实例**（后端在实例 B，`wait` 在实例 A） | **3ms** 返回，而 `busy` 有值、`idle`=null | **跨实例不可靠**（`awaitIdle` 只查本进程表；该端点**无** location 中间件） |

## 决策

**「停机」= 观测（execution 级证据 + 读侧一致 + DB 终态可见）+ 进程内准入守卫。任一判不出来 ⇒ 不释放槽位。**

### D1 观测：`wait` 返回 ∧ 判活为假 ∧（基线在跑时）水位线前移

`ctx.session.wait` = `get` + `execution.awaitIdle`，而 `awaitIdle` 在每次 `done` 解析后**递归重查**（上游注释：「re-check after it settles to cover a successor execution started by a late doorbell」，`run-coordinator.ts:164-171`）⇒ 它回答「**本进程内该 session 的 execution 链已跑完**」，不依赖时间戳。

- **条件 1（execution 级证据）**：`wait` 有界返回。关掉 ① 与「`wait` 返回**前**到达的后继」。
- **条件 2（读侧一致）**：`判活为假`（沿用 D4 两级判据）。
- **条件 3（DB 终态可见）**：`time.idle` 相对快照前移 —— **仅当基线判为「在跑」时**要求。
- **成立假设（写进决策，不只写进风险章）**：条件 1 只对**同一 `opencode serve` 实例内的 execution** 成立。**本篇的保证以「单实例部署」为前提**；跨实例时 `wait` 归零 ⇒ 本篇判据**退化为 `ADR-front-multi-backend` D11.3 现状（B0）**，其残留见风险章。

**唯一序列（写死；守卫与观测在一条序列里，避免编排二义）**：

```
① 锁外快照：v0 = time.idle、running0 = 判活、baselineLastMessageID
② 锁内置准入守卫（D2）：把「该 workRoot 正在停机」的标记置上
   ⚠️ ①→② 之间有一个**无守卫窗口**（快照还没取完）：这是「守卫必须在 `interrupt` 之前置上」的固有代价，但如果倒过来（先置守卫再快照），快照读到的可能是被守卫拒绝前的最后一刻状态 —— 两者都只是缩小窗口、不能归零；本篇选择「先快照后置守卫」，因为快照是**只读**的，而守卫置上后 `interrupt` 越早越好。
③ 锁外 interrupt({resume:false})
④ deadline = now + W（W = `min(RDDF_STOP_TIMEOUT_MS, 60s)`，默认 8s；**单一预算**，不是每步各 8s）
⑤ await race(ctx.session.wait(...), deadline)          ← 覆盖 cleanup 与返回前的后继
⑥ 判活为假（轮询至 deadline）
⑦ running0 = true ⇒ 要求 time.idle > v0（轮询至 deadline）
⑧ 全部通过 ⇒ 锁内重验条目仍是 active ⇒ 释放槽位并置 suspended
⑨ finally：锁内清除守卫（成功/失败/异常都必须清；守卫按 **owner token + 引用计数**，只删自己）
   ⚠️ ⑥/⑦ **各自至少判一次**（即使 W 被设得极小，也不能跳过）
```

⚠️ **`wait` 必须在 `interrupt` 之后**：放在之前会变成「等当前任务自然跑完」，把「暂停」变成「等待」，与 D1.1 的 execute 硬超时冲突。

⚠️ **适用范围（`ADR-front-cancel-release` 扩写）**：本条的判据适用于**任何释放槽位的路径**，不只 `suspend` —— `cancel` 的释放同样以「本条的停机确认」为前提（证据不足 ⇒ **整单拒绝**：不墓碑、不放槽）。⇒ **「任一判不出来 ⇒ 不释放」不再是 `suspend` 的专属约定**。

### D2 进程内准入守卫（**不落盘**）：`wait` 返回**之后**的准入窗只能由写侧关闭

`wait` 返回后仍有窗口（读水位线、锁内重验、释放槽位），其中到达的准入同样会起后继 execution —— **轮询关不掉「未来」**。

- **实现形态：以 `stateRoot` + `workRoot` 为键的**进程内标记集**，**不写 `pair.json`。`claimSlot` 与既有同步 `delegate` 的槽位检查见到「同 `workRoot` 正在停机」⇒ **拒绝**并说明占槽后端（两处共用同一检查，D7.4「共用一张槽位表」不破）。
- **为什么不持久化**：守卫的作用域是**进程内准入**（跨实例的准入不归本篇管，见 D1 的成立假设）⇒ 进程内标记足以覆盖可达面，且**崩溃即丢失**，不会留下持久化的中间态。**这直接消除「新增持久化状态 ⇒ 需要崩溃恢复规则 ⇒ 进程在停机窗口内死掉即死槽」的整类风险**。
- **撤销路径**：删除集合与两处检查即可回退，**无落盘残留**（`pair.json` 枚举不变 ⇒ `ADR-front-multi-backend` D6.3 / D12 矩阵**无需修订**）。
- **与 D7.3「强制接管」的边界**：停机**失败/超时**后守卫即清（③ 步的 `finally`），此时强制接管恢复正常（**序列见 `ADR-front-cancel-release` D5**）。⇒ 守卫持有窗口内（`suspend` 仍在等）的 `cancel` **允许**（它**不产生**新写入者——本篇的 `cancel` 只 `interrupt` 不放槽），但随后的 `dispatch` 会被守卫拒绝 —— 这是**正确的保守行为**：接管必须等这次停机结束（成功或失败）后再做。
  ⚠️ **真正的写入者窗口在「守卫清掉之后」**：`ADR-front-cancel-release` 起 `cancel` **会放槽**（墓碑 ⇒ 不占槽）⇒ 守卫清掉后的任何 `dispatch` 都可能被准入 ⇒ **「`cancel` 不产生新写入者」这句只对「守卫持有窗口内」成立**；`cancel` 落墓碑后放出的窗口由该篇的**停机证据门控**承担（证据不足 ⇒ 不放槽）。
- **代价**：跨进程不生效（已由 D1 的成立假设覆盖）；必须保证 `finally` 清理（否则同进程内该 `workRoot` 永久拒派 —— 由 Verification **S4b** 兜住）。

### D3 已删后端：`wait` 抛 `NotFound` ⇒ **视为已停机**

`session.wait` 的第一步是 `get`，后端被删时抛 `NotFound`（服务端 `catchTag("Session.NotFoundError", missingSession)`）⇒ 按 `ADR-front-multi-backend` D12 矩阵（`active` + 已删 ⇒ 释放槽位并置 `suspended`）处置，**不得**按「读失败 ⇒ 不释放」处理 —— 否则死槽，抹掉 D12 的全部意义。

### D4 退化：`wait` 不可用 ⇒ **默认拒绝释放**，可用环境变量显式赎回（且必须留痕）

`ctx.session.wait` 是**实验性端点**（`/api/experimental/session/:id/wait`），且上游已把**非实验别名**标为「Removed in the next minor」⇒ 端点面会变，退化是**将来态而非边角**。

- `running0 = true` 分支：水位线前移是**正面证据** ⇒ 退化后仍可照常释放。
- `running0 = false` 分支：**无正面证据**（只有「判活为假」这个否定证据）⇒ 退化时**拒绝释放**，返回「`wait` 不可用 ⇒ 无法确认该后端未在跑；请用 `cancel`，或设置 `RDDF_SUSPEND_ALLOW_DEGRADED=1` 显式承担风险」。
- **留痕（「显式」必须可见）**：`stop_judge: "wait" | "degraded" | "degraded-forced"` 挂在**停机尝试的返回值**上（它是**一次停机尝试的结论**，不是 session 的观测属性 ⇒ 不污染只读的 `sessions`）；强开变量而成功释放的，另落一行 ledger（`event:"suspend_degraded"`）。
  ⚠️ **作用域扩到 `cancel`**（`ADR-front-cancel-release` D2）：`cancel` 也返回 `stop_judge` ⇒ 本条的「退化」词汇对两个工具一致。
  ⚠️ **本条的 env 赎回通道（`RDDF_SUSPEND_ALLOW_DEGRADED`）只对 `suspend` 有效**：`cancel` 侧**没有** env 通道，唯一的显式出口是 **per-call `force:true`**（`ADR-front-cancel-release` D4）⇒ **一条 env 通道（suspend）+ 一条 per-call 通道（cancel）并存**。
- **启动自检**：`typeof ctx.session.wait === "function"`（不做真调用）；**存在但调用返回 4xx / `HandlerNotFound`** 同样归 `degraded`（`stop_judge` **不得**报 `"wait"`）。

### D5 关闭范围（写死，避免读者高估）

| # | 形态 | 状态 |
|---|---|---|
| ① | 陈旧 busy（**同进程**，execution 已入本进程表） | **关闭**（`wait` 看得到 execution） |
| ② | 清理期间到达的 wake 起的后继（**`wait` 返回之前**） | **关闭**（实测 2921ms） |
| ③ | `wait` 返回**之后**、**同进程内**的新准入 | **缩小**（D2 守卫）：守卫在 `interrupt` 前置上 ⇒ 此后的 `claimSlot` 全被拒；但见 ⑥ |
| ④ | 跨进程 / 跨 `opencode serve` 实例 | **未关闭**（退化为 B0 现状，见风险） |
| ⑤ | 用户不经插件直接操作后端 | **未覆盖**（`D8.3` 范围假设，不变） |
| ⑥ | **`claimSlot` 通过之后、`prompt` 之前**（同进程） | **未关闭**：准入在守卫置上**之前**已通过，简报仍会被投递 ⇒ settle 时起后继。缓解：释放槽位后**复检**一次判活，命中即落 `event:"stop_raced"` 并**如实报**（不得假装关掉）；根治需把「准入 + 投递」做成不可分割的写侧动作（另立 change） |

## 选项对比表

| # | 方案 | 结论 | 理由 |
|---|---|---|---|
| B0 | 沿用 D11.3（判活 + 水位线） | **否** | ①② 可达且后果是两个写入者 |
| **B1** | `wait` + 判活 + 水位线（合取）**+ 进程内准入守卫** | **采用** | ①② 由 `wait` 关闭（实测）；③ 由进程内守卫关闭；④ 退化为 B0（不劣于现状） |
| B2 | 只用 `wait` | 否 | 跨实例 3ms 返回 ⇒ 判停机 ⇒ 两个写入者；且不保证终态已投影 |
| B3 | 只用 `isRunning`（时间戳推断） | 否 | 陈旧 busy / Started 未投影 / 无消息新 execution 三个假窗 |
| B4 | `running0=false` 也一律要求水位线前移 | 否 | 空闲后端水位线不动 ⇒ 必然超时（父篇风险章已裁定） |
| B5 | 只观测、不做写侧守卫（把 ③ 登记为残留） | 否 | 守卫成本 = 一个进程内集合 + 两处检查；③ 的后果是两个写入者、可由模型一次并发调用触发 |
| B6 | 把守卫做成**持久化**状态（`pair.json` 新增 `suspending`） | 否 | 持久化中间态必须定义崩溃恢复（否则进程在 8s 窗口内死掉 ⇒ 条目永久占槽 ⇒ **该工作树永久失去切换能力**）；而守卫的真实作用域是**进程内**准入 ⇒ 持久化只带来死槽面，不带来覆盖收益 |

## 后果 / 代价

**正面**

- ①② 关闭（单实例）：判据不再依赖 `busy` 的投影/清空语义。
- ③ 关闭且**无新增持久化契约**：`pair.json` 枚举不变，D6.3 / D12 矩阵无需修订，崩溃不留中间态。
- 竞争面收敛为「同一把锁 + 一个进程内标记」。

**负面 / 代价**

- **依赖实验性端点**：必须实现 D4 的退化、留痕与启动自检，并纳入上游升级回归清单。
- **`suspend` 可能变慢甚至失败**：`wait` 的上界**不是投影周期，而是后继 execution 的完整运行时长**（实测 2921ms 是一次真实后继 run）⇒ 后继是真实任务时**必然超时**。**这是期望行为**（宁可不释放）。必须给 front 的文案：「该后端在暂停期间又被唤起，请再次 `suspend` 或 `cancel`」，否则模型会在超时上循环重试、每次再 `interrupt` 一次。
- **多一次往返**（`wait` + 两次 `get`）；`wait` 无超时参数 ⇒ 与计时器竞速。
- **守卫靠 `finally` 保证清理**：漏清 = 同进程内该 `workRoot` 永久拒派（比持久化死槽容易发现、重启即恢复，但实现必须正确）。

**风险**

- **④ 跨实例**：`wait` 归零 ⇒ 判据退化为 **B0**（已 Accepted 的现状判据），而 B0 的「陈旧 busy」残留早已在 `ADR-front-multi-backend` 风险章登记。**接受理由**：本篇在跨实例下**不引入新风险**（等价于现状），且**单实例是本篇的显式成立假设**（D1）；若将来多实例成为常态，应改用上游持久 claim（见「已排除」）。
- **`wait` 语义漂移**：若上游把 `awaitIdle` 改成只等当前 execution 不重查 ⇒ ② 静默消失。⇒ 源码级回归断言（Verification S8）。
- **实验性端点移除**：D4 已把「拿不到 ⇒ 拒绝」写死，不会变成「拿不到 ⇒ 放行」。

## Verification（可勾选验收判据，前瞻）

> 每条必须**客观可判**（命令 / 假 ctx / 事件时间戳 / 落盘字段）。编号供 change 的 AC 映射引用。

**观测侧（D1）**

- [ ] **S1 陈旧 busy（同进程）**：假 ctx 让 `session.get` 的 `busy` 停在小于 `idle` 的值、但 execution 仍在本进程表（`wait` 不返回）⇒ `suspend` **不得**释放槽位。
- [ ] **S2 `wait` 覆盖 cleanup**（前提：`wait` 在 deadline 前 resolve）：`interrupt` 后 `wait` 阻塞（真实上游形态）⇒ `suspend` 的返回时刻 **≥** `wait` 的 resolve 时刻。
- [ ] **S3 后继 execution（`wait` 返回前）**：清理期间投递简报后，**在 `suspend` 成功释放**的情形下，其返回时刻 **≥** 后继的**终态事件时刻**（订阅 `Execution.Succeeded/Failed/Interrupted` 取时间戳）。⚠️ 后继是长任务时 `suspend` 会**超时失败**（`suspended:false`）——该情形**不**断言此条。
- [ ] **S3b 条件 2 负向**：假 ctx 令 `wait` 返回但**判活恒为真** ⇒ **不得**释放槽位。
- [ ] **S3c 条件 3 负向**：假 ctx 令 `wait` 返回、判活为假、基线为「在跑」而 `time.idle` **停在 `v0`** ⇒ **不得**释放槽位。

**写侧守卫（D2）**

- [ ] **S4 停机窗口内同 `workRoot` 的准入被拒（三个入口都要测）**：守卫置上后，`dispatch`、`dispatch(resume=X)`、**同步 `delegate`** ⇒ **均拒绝**，错误含占槽者 id。⚠️ 同步 `delegate` 的槽位检查会传 `excludeSessionID = resume_session`（`lib/delegate-core.ts:957`）⇒ **守卫检查不得被该排除项影响**（专门用例：`delegate(resume=正在被 suspend 的后端)` 必须被拒）。
- [ ] **S4b 守卫必须被清理**：`suspend` 成功后、失败后、抛异常后三种情形——成功 ⇒ 同 `workRoot` 的 `dispatch` **立即成功**；失败/异常 ⇒ 错误**不得再是「正在停机」**（槽位是否释放不作断言）。
- [ ] **S4c 无持久化残留**：`suspend` 全程结束后 `pair.json` 的 `state` 取值仍在五值枚举内（`dispatching/active/idle/suspended/tombstone`），**不出现**中间态。

**已删 / 判不出来（D3 / 保守侧）**

- [ ] **S5 已删后端 ⇒ 释放**：`wait` 抛 `NotFound` ⇒ 条目 `suspended`、槽位释放（符合 D12，不得死槽）。
- [ ] **S6 判不出来 ⇒ 不释放**：`wait` 超时 / `wait` 抛非 `NotFound` 错误 / `session.get` 读失败（原因不明）/ `session.context` 读失败 ⇒ 一律 `suspended:false` 且条目回到 `active`。

**退化（D4）**

- [ ] **S7 退化三分支**：`ctx.session.wait` 缺失时——(a) `running0=true` 且水位线前移 ⇒ 可释放；(b) `running0=false` ⇒ **拒绝**并给出「请用 cancel 或设置 `RDDF_SUSPEND_ALLOW_DEGRADED=1`」；(c) 设了该变量 ⇒ 放行**且** `suspend` 返回 `stop_judge:"degraded-forced"`（`sessions` 不输出该字段，见 S7b）并落 `event:"suspend_degraded"` 行（**留痕必须有断言**）。
- [ ] **S7b 正常态标记**：`wait` 可用时 **`suspend` 返回值**含 `stop_judge:"wait"`；缺失或调用 4xx 时为 `"degraded"`（`sessions` 不输出该字段）。

**其他**

- [ ] **S8 端点缺失自检**：`ctx.session.wait` 缺失或调用 4xx ⇒ `stop_judge` 报 `"degraded"`，行为按 S7。⚠️「上游 `settle` 顺序 / `awaitIdle` 重查」的**源码级回归断言**属 P2 第 4 项（上游语义漂移清单），**不在本篇**。
- [ ] **S9 有界 + 单调**：`suspend` 总耗时 ≤ `W` + 少量往返（用**配置窗口**取值）；进程不挂死；`wait` promise 的 rejection 必须被 catch（不得 unhandled rejection）。
- [ ] **S10 回归**：既有单测全绿；E2E L2-19 / L2-20 / L2-22 全绿；`suspend` 空闲路径不明显变慢（L2-20 实测耗时 ≤ 改动前实测值 + 1.5s）。
- [ ] **S11 无两个写入者（限定）**：以上任一情形下都不得出现「两个 `active` 同占一个 `workRoot`」——**限定为「准入判定发生在守卫置上之后」**；⑤/⑥ 两类窗口不在保证内（⑥ 由 `stop_raced` 留痕）。

## 实现约束（不属于决策，但会误导实现，先写死）

- `suspend` 目前在校验通过后**又整段读一次 `session.context`**（用于 AC54 的 `suspended_at_message_id`）⇒ 应复用 D1 步骤① 的快照，避免把释放窗撑大（一次完整 context 读的窗口随会话长度增长）。
- `ctx.session.wait` 经插件 promise 适配层暴露，**只接受 `input`、不接受 signal/timeout** ⇒ 竞速后那个 promise **无法取消**。写法必须**先取原 promise、再分叉**：`w.catch(() => {})` 只用于消除 unhandled rejection；竞速用 `w.then(r => ({ok:true}), e => ({ok:false, e}))` —— **不得**直接吞掉错误，否则分不出 `NotFound`（D3）与其它错误（S6）。

## 已排除的替代方案

- **`running0=false` 分支也一律要求水位线前移（B4）**：空闲后端水位线不动 ⇒ 必然超时。`wait` 只让「本进程内的新 execution」可见，不足以让该分支安全 —— 这正是 D4 退化时对该分支**拒绝释放**的原因。
- **持久化 `suspending` 态（B6）**：见选项表 —— 需要崩溃恢复规则，而守卫作用域是进程内 ⇒ 只增死槽面。
- **用上游持久 claim（`time_suspended`）作跨进程判据**：语义正确且是 write-ahead 事实，但**不在 `Session.Info` 里**（只有 `busy`/`idle`），插件只能直读 opencode 的 SQLite ⇒ schema 耦合 + 跨版本必碎，违背「只经插件 ctx」的边界。作为上游 feature request 登记。
- **用 `ctx.event` 自建 execution 轨迹当判据**：冷启动无历史、事件投递不保证被本插件 location 收到、无初始快照 ⇒ 只能事后存疑，不能做停机前置判据。
- **「`wait` 返回太快 ⇒ 不信任」的启发式**：魔法数字，且会把真空闲后端判成未停机。
- **换传输层/加实例路由解决跨实例**：`session.wait` 端点**无** location 中间件，handler 直接调本进程 `session.wait` ⇒ 换传输不改变语义。
- **把 `wait` 放在 `interrupt` 之前**：会变成「等任务跑完」，与 D1.1 冲突且语义错误。
