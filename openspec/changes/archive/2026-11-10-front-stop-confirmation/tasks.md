# tasks — front-stop-confirmation

> 来源：`openspec/changes/front-stop-confirmation/proposal.md`（AC1–AC18；AC1–AC9 沿用 ADR Verification S1–S11）

| # | 任务 | AC | 状态 |
|---|---|---|---|
| T1 | **夹具先行（X12）**：fake ctx 支持可控 `wait`（resolve / hold / notfound / error）+ `noWait` + `calls.wait` / `calls.context`；`interrupt` 同步刷新显式 `time` 覆盖 | X12 | ✅ |
| T2 | `stopTimeoutMs()` 加 **60s 上界钳制** + 取值依据注释；新增 `allowDegradedSuspend()`（`RDDF_SUSPEND_ALLOW_DEGRADED=1`） | X6/X7 | ✅ |
| T3 | **进程内准入守卫**（`delegate-core`）：`enterStopGuard` / `leaveStopGuard` / `stopGuardAt` / `__pendingStops`；键 = `stateRoot`+`workRoot`，**owner token 引用计数**、**不落盘** | AC5/AC11/S4b | ✅ |
| T4 | `waitStopped` 重写：`wait`（有界、`then(ok,err)` 竞速 + `catch` 消 unhandled）+ 判活为假 +（基线在跑时）水位线前移；`NotFound ⇒ 已停机`；退化三分支；返回 `{stopped, judge, reason, messages}` | AC1–AC4/AC7/AC9 | ✅ |
| T5 | `suspend` 序列 9 步：快照 → 置守卫 → `interrupt` → `waitStopped` → `finally` 清守卫；`stop_judge` 挂在**返回值**；`degraded` 强开落 `suspend_degraded` | AC6/AC8/AC9 | ✅ |
| T6 | AC54 基线复用**最后一次判活**的 messages（不再额外整段读 `context`） | X11 | ✅ |
| T7 | 释放后**复检**：仍在跑 ⇒ 落 `event:"stop_raced"` + 返回 `stop_raced:true` | D5 ⑥ | ✅ |
| T8 | 准入守卫落点：`claimSlot`（锁内**重验**）+ `dispatch` 早拒 + 同步 `delegate` 入口（**不受 `excludeSessionID` 影响**），文案「正在停机（由 front … 发起）」 | AC5/AC9/AC10 | ✅ |
| T9 | `prompts/front.md`：`suspended:false` 的处置（**不要反复重试**）+ `stop_judge:"degraded"` 的含义 | X10 | ✅ |
| T10 | 单测 11 条（AC1/AC3/AC4/AC7/AC8/AC10/AC11/AC14/AC16/AC17/AC18/AC15） | 全部 | ✅ |
| T11 | `bun test` 全绿（258）；`tsc` 无新错误 | — | ✅ |
| T12 | E2E：重启服务后跑 L2-19 / L2-20 / L2-22 / L2-23 —— **4/4 全绿**（新判据下 suspend/切换/单槽均正常） | AC9 | ✅ |

## 已知边界（写进 design）

- 跨实例：`wait` 归零 ⇒ 退化为现状判据（ADR 风险章 ④，不引入新风险）。
- `claimSlot` 通过后、`prompt` 前的窗口 ⇒ 由 T7 的复检留痕（不假装关闭）。
- 同会话并发 resume 不做串行化（另一 change 的 Out of Scope）。
