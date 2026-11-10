# improvement: front-stop-confirmation

**实施状态**：已立项 → `openspec/changes/front-stop-confirmation/`（2026-11-10，planner 起草 proposal，**AC1–AC18**；AC1–AC9 沿用 ADR Verification S1–S11）。

## Why

`ADR-front-multi-backend` D11.3 的停机判据（判活为假 + 基线在跑时 `time.idle` 水位线前移）**留了两个可达的假停机窗口**（该篇风险章自陈），后果都是**两个写入者**：

1. **陈旧 busy**：session 曾空闲过（`idle > 0`），新一轮 execution 刚起、`Execution.Started` 未投影 ⇒ 读到陈旧 `busy`（`< idle`）⇒ 两级判活都不成立 ⇒ 基线判为「不在跑」⇒ 不要求水位线 ⇒ 判停机。
2. **后继 execution**：清理期间到达的 wake 在 `settle` 时起后继 ⇒ 水位线已前移而新一轮已在跑。**可达**：插件自己的 `dispatch(resume=X)` 会 ring 上游 doorbell。

D11.3 当时把「改用上游 `ctx.session.wait`」登记为**待实测的备选**；实测已完成（记录见 `.rddf/reviews/adr-front-stop-confirmation-review.md`）：空闲 27ms / 运行中 173s / **清理期间再投递 ⇒ 2921ms 覆盖后继** / **跨实例 3ms 返回（不可靠）**。

⇒ 决策：`wait`（execution 级证据）+ 判活为假 +（基线在跑时）水位线前移，并配**进程内准入守卫**。完整决策与判据见 `docs/adr/ADR-front-stop-confirmation.md`（Status: Proposed；oracle 1 轮 + critic 2 轮，含闭合复审 APPROVE_WITH_CONDITIONS）。

**为什么现在做**：`wait` 是**实验性端点**，上游已把非实验别名标「Removed in the next minor」⇒ 早做早把退化路径落进实现。

## What Changes

按 ADR 的 D1–D5 落实（**本 improvement 不重复 ADR 的判据文本**，只列 change 的增删与验收口径）：

- **B1 判据**：`suspend` 序列改为 9 步（锁外快照 → 锁内置守卫 → `interrupt` → `race(wait, deadline)` → 判活为假 → 水位线 → 锁内重验 → 释放 → finally 清守卫）；`W = min(RDDF_STOP_TIMEOUT_MS, 60s)`，**单一预算**；⑥/⑦ **各自至少判一次**（`W` 被设极小也不跳）。
- **B2 准入守卫**：以 `stateRoot`+`workRoot` 为键的**进程内标记**，**带 owner token + 引用计数**（`suspend` 用 `sessionID` 作 owner；`finally` 只删自己的 token，最后一个删完才移除键）。**不写 `pair.json`**。
- **B3 已删后端**：`wait` 抛 `NotFound` ⇒ 视为已停机（按 D12 释放 + 置 `suspended`）；**`NotFound` 优先于「读失败」**（两者可能先后出现）。
- **B4 退化**：`stop_judge` 挂在 **`suspend` 的返回值**（`"wait" | "degraded" | "degraded-forced"`，**不污染只读的 `sessions`**）；`wait` 缺失**或调用 4xx/`HandlerNotFound`** ⇒ `degraded`；`running0=false` + `degraded` ⇒ **拒绝释放**并提示 `cancel` 或 `RDDF_SUSPEND_ALLOW_DEGRADED=1`；强开而成功释放 ⇒ 落 `event:"suspend_degraded"`。
- **B5 实现约束**：`snapshotStopBaseline` 的返回类型增 `messages`（供 AC54 的 `lastMessageID` 复用，**删掉 `suspend` 里第二次整段 `session.context` 读**）⇒ 类型变更需同步调用点；`wait` promise 用 `w.then(ok, err)` 竞速 + `w.catch(()=>{})` 只消 unhandled（**不得**吞错，否则分不出 `NotFound`）。
- **B6 残留可观测**：释放槽位后**复检**一次判活，命中 ⇒ 落 `event:"stop_raced"` 并如实报（对应 ADR D5 ⑥ 的 `claimSlot→prompt` 窗口）。
- **B7 交叉优先级**：与 `front-async-resume-guard` 的活体判定同时命中 ⇒ 以停机守卫为准，文案含发起停机的前端 id，**不得**返回「请先 suspend」。

## Acceptance

> **不做两份真相**：change 的 AC **直接沿用 `ADR-front-stop-confirmation` 的 Verification S1…S11（回填编号）**，另加下列**本项新增**判据。

- [ ] **X1 释放之后（三合一）**：`suspend(X)` 成功返回后**立即** `dispatch(resume=X)` **成功**（证守卫已清 + 槽位真的空了 + 判据不误伤刚停的后端）。
- [ ] **X2 并发两次 `suspend`（同 `workRoot`）**：先完成者的 `finally` **不得**解除后完成者的守卫（owner token + 引用计数）；两路都结束后守卫清空。
- [ ] **X3 重入**：同一 front 对**同一 session** 再次 `suspend`（超时后按文案重试）**允许**，不得永久失败。
- [ ] **X4 交叉优先级**：`suspend(X)` 与 `dispatch(resume=X)` 同时命中两个判据 ⇒ 文案为「正在停机 + 发起者」，**不含**「请先 suspend”。
- [ ] **X5 `delegate` 入口不被排除**：`delegate(resume=X)` 且 X 正在被 `suspend` ⇒ 被拒（`lib/delegate-core.ts:957` 的 `excludeSessionID` 不得排除守卫）。
- [ ] **X6 `W` 极小（如 `1`）**：⑥/⑦ 仍各判一次 ⇒ 对**已空闲**的后端仍能成功（不得因预算耗尽跳过判定）。
- [ ] **X7 `W` 极大（如 `600000`）**：被 `min(…, 60s)` 钳制（`stopTimeoutMs()` 的注释同步更新）。
- [ ] **X8 进程重启模拟**：守卫持有窗口内 kill + 重启（新进程读旧 `pair.json`）⇒ 该 `workRoot` 仍可正常 `dispatch`（无死槽）。
- [ ] **X9 守卫可观测**：导出一个只读的测试钩子（如 `__pendingStops()`）或置/清 debug 日志，供 E2E 脏环境排障（守卫泄漏的表现是「永久拒派」且错误文案与「占槽」不同）。
- [ ] **X10 文案**：`prompts/front.md` 新增「该后端在暂停期间又被唤起 ⇒ 请再次 `suspend` 或 `cancel`」，grep 级断言存在，且**不含**「重试 suspend」的循环暗示。
- [ ] **X11 不重复读 context**：`suspend` 全程 `ctx.session.context` 调用次数 ≤ 1（fake ctx 计数）。
- [ ] **X12 判据夹具先行**：`tests/delegate-async.test.ts` 的 fake ctx 需扩成**可控 `wait`**（hold / resolveAt / reject-NotFound / reject-其它）与**可控 stale-busy**（当前 `time` 由 `busy` 标志派生，**表达不出** `busy < idle` 且仍在跑）——否则 S1/S3b/S3c/S5/S6/S7 全为**假绿**。

## Capabilities

- 停机确认从「时间戳推断」升级为「**execution 级证据 + DB 终态可见 + 写侧守卫**」：关掉 ①②（同进程），③ 缩小为「守卫置上之后的准入」，**⑥（`claimSlot→prompt` 窗口）如实登记并留痕**。
- 跨实例退化为现状判据（**不引入新风险**，见 ADR 风险章）。
- 退化路径**可见**：`stop_judge` 三值 + `suspend_degraded` ledger 行 ⇒ 「无正面证据下释放」可审计。

## Impact

- **行为变化**：`suspend` 在「清理期间后端又被唤起」时**超时失败**（而非放行）——**收紧**、期望行为；需同步 `prompts/front.md`（X10）。
- **能力下降（有意）**：`wait` 端点消失后，**空闲后端将无法 `suspend`**（只能 `cancel`）——与 D7.2「宁可失去切换能力，不失去单写者」同口径；可用环境变量显式赎回（留痕）。
- **不改**：`pair.json` schema / `state` 枚举 / `delegate` 行为 / 权限面。
- **规模**：实现 ≈ `waitStopped` 重写 + `preAdmission` + 守卫（owner/refcount）+ `stop_judge` + 退化分支 + 复检留痕；**夹具改造 ≈ 1 个文件**（X12，必须先做）；单测 ≈ +12；E2E 复用 L2-19/20/22 + 1 条退化注入。
- **与 `front-async-resume-guard` 的接口**：本项提供 `preAdmission` 的**守卫标记**部分，A 项提供**活体判定**部分；两者同批实施最省事，但**验收独立**（本项不依赖 AC19 的修复）。**中间态不得出现「两处各写一份守卫」**。
- **不属本项**（已登记在 `docs/CHANGELOG.md` v2.7 的 backlog）：`/404/` 宽判、上游行号/顺序漂移清单。
