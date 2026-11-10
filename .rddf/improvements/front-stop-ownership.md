# front-stop-ownership — 槽位释放的授权模型（代号条件化 + 跨实例 tripwire）

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> **实施状态**：已立项 → `openspec/changes/archive/2026-11-11-front-stop-ownership/`（2026-11-11，planner 起草 proposal，AC1–AC18）。
> 决策依据：`docs/adr/ADR-front-stop-ownership.md`（**Accepted** 2026-11-11 用户签批；oracle 1 轮 + critic 2 轮）。

## Why

`ADR-front-stop-confirmation` 的 D1 ⑧ 与 `ADR-front-multi-backend` 的 D11.2 都要求「**锁内重验后再翻转**」，但实现是**无条件写** `state`（`lib/delegate-async.ts` 的 `updateSlotState` → `setSlotState`）。探针（`/tmp/opencode/probe/probe-cross-instance-claim.ts`）已复现：停机窗口内让「另一进程的 claim 已落盘」（条目 `dispatching`）⇒ `suspend` 仍写 `suspended` ⇒ **覆盖了更新的 claim** ⇒ 同工作树可再准入 ⇒ **两个写入者**。

同时，跨实例下 `ctx.session.wait` **必然空转**（上游 `executions` 是进程内 Map）、停机守卫是**进程内**的 ⇒ 另一实例看不到 ⇒ 假停机可达。本仓无法根治（上游不向插件暴露跨进程原语），但可以把「单实例」从**约定**变成**前提 + 机器化 tripwire + 严格判据**。

## What Changes

1. **`pair.json` 条目新增 `claim_gen`（整数归属版本）**：任何**改变槽位归属**的写都 bump；良性写（字段回填 / `sessions` backfill）不 bump；写者必须**保留** `claim_gen`（`registerSession` 当前整条重建条目 ⇒ 改）。
2. **授权释放**：`suspend` / `cancel` 的释放改为「**锁内授权**」——条目存在 ∧ `claim_gen` 与判读时一致 ∧ 状态是预期的那一个 ⇒ 才释放；否则**不释放**并返回分开的 reason（`slot_reclaimed` / `slot_state_changed` / `slot_entry_gone` / `slot_already_released`）。释放与 `suspended_at_message_id`/`steer_residue` 回填**同一临界区**。
3. **跨实例 tripwire**：state dir 写实例戳（`.rddf/state/.instance-<uuid>`，含 pid/host/started_at，mtime 每次工具调用刷新，TTL 60s）；检测到 ≥2 存活戳 ⇒ 多实例 ⇒ 落 `event:"foreign_instance"` ledger 行 + `suspend` 切**严格模式**（`running0=false` 也要求水位线前移）+ 返回 `foreign_instance:true` + `stop_judge:"degraded"`（**不扩展**父篇三值枚举）；严格模式下 `RDDF_SUSPEND_ALLOW_DEGRADED=1` **不生效**。
4. **矛盾检测**：`wait` 有界返回 ∧ 判活为真 ⇒ reason `wait_no_op`（≠ `still_running`）+ 文案给出两个可区分出口。
5. **前端文案同步**：`prompts/front.md` 与 `docs/front-delegate-usage.md` 在严格模式 / `wait_no_op` 下**不得**建议「用 `cancel` 释放空闲后端」。
6. **上游锚点扩充**：`scripts/check-upstream-anchors.sh` 增 `executions` 进程内 Map / `time_busy` Started 投影两条锚点。

## Acceptance

- **AC1–AC14 ↔ ADR Verification S1–S14（同号）**：见 `openspec/changes/archive/2026-11-11-front-stop-ownership/proposal.md` 的映射表。
- 关键判据（摘要）：归属版本递增且良性写不 bump（S1）；代号/状态不符 ⇒ 不释放（S2/S3）；良性写**不误伤**正常释放（S4）；`cancel` 同样条件化（S5）；`state` 枚举不变（S6）；**已删路径与改动前逐字一致**（S7）；tripwire 触发严格模式 + ledger + `foreign_instance`（S8）；严格模式不可赎回（S9）；矛盾检测 `wait_no_op`（S10）；戳生命周期（TTL/删戳/人工清理，S11）；同步 `delegate` 后归属版本**不回退**（S12）；单槽不变式 + 全量回归 + 上游锚点（S13）；前端文案（S14）。

## Capabilities

- 需要新增/修改：**无新依赖、无新公开工具、无新状态枚举**。
- 需要扩展的契约：`pair.json` 条目新增**一个整数字段**（`claim_gen`）；`suspend`/`cancel` 的返回值新增/复用 `reason` 词汇（授权类 4 个 + 证据类 `wait_no_op`）与 `foreign_instance` 布尔。
- 上下游影响：两个派发面共用同一张槽位表 ⇒ `claim_gen` 的写者纪律必须覆盖**同步 `delegate` 的 `registerSession`**（整条重建）。
- 明确**不做**：`cancel` 的停机证据改造（另立 backlog `cancel-stop-evidence`）；跨进程锁/租约（ADR 选项表 C2/C3 已否）；上游 feature request（不属本仓）。

## Impact

- **行为变化**：`suspend`/`cancel` 在「归属已变」时**拒绝释放**（此前会无条件覆盖）⇒ 属**收紧**，此前被掩盖的两个写入者路径被关闭。
- **可用性代价（已登记）**：多实例部署下 `suspend` 一个**空闲**后端必然失败（严格模式要求水位线前移）；实际出口是下一次 `dispatch` 的 reconcile 顺带释放；若该后端在另一实例确实在跑 ⇒ 工作树被**正确**占住。
- **风险**：tripwire 假阳性（单实例多插件副本 / 崩溃残留戳 ≤60s）⇒ 该窗口内空闲后端的 `suspend` 失败。
- **兼容性**：`pair.json` 旧文件无 `claim_gen` ⇒ 读作 `0`，第一次写时补齐；`state` 枚举不变 ⇒ 父篇 D12 矩阵与 V09 不受影响。
- **变更规模**：改动集中在 `lib/delegate-async.ts`、`lib/delegate-core.ts`、`prompts/front.md`、`docs/front-delegate-usage.md`、`scripts/check-upstream-anchors.sh` + 测试；不改公开工具签名。
