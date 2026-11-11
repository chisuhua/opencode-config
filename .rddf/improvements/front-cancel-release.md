# front-cancel-release — `cancel` 的释放判据：与 `suspend` 同源 + 显式 `force` 出口

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 决策：`docs/adr/ADR-front-cancel-release.md`（**Accepted** 2026-11-11 用户签批；oracle 1 轮 + critic 2 轮）。

## Why

`cancel` 只看 `interrupt` 的返回值就释放槽位并置墓碑，而 `ADR-front-stop-confirmation` D1 已裁定该返回值**不是**停机判据。探针实证：`cancel` 在后端仍在跑时释放槽位 ⇒ 同工作树两个写入者；反向也坏（`interrupted:false` ⇒ 纯 no-op ⇒ D7.2「cancel 后重派」死锁）。⇒ `ADR-front-multi-backend` D7.3 的**推荐**恢复路径本身是双写者生成器。

## What Changes

1. `cancel` 复用 `suspend` 的停机判据 + 授权释放；`interrupt` 返回值降级为诊断。
2. 证据不足 ⇒ 整单拒绝（不墓碑、不放槽）+ `cancel_refused` ledger + `forced_available`。
3. `cancel_pending` 字段：记录尝试起点、**挡住 reconcile 的自动放行**、只钉证据类拒绝。
4. `cancel({force:true})`：per-call 显式（**非 env**）、只跳过证据门控、落 `cancel_forced`。
5. front 恢复序列改为四步（含用户知情要求）；多实例走严格模式。

## Acceptance

AC1–AC19 ↔ ADR Verification F1–F19（同号）；详见 `openspec/changes/front-cancel-release/proposal.md`。

## Capabilities

- **无新依赖、无新工具、无新状态枚举**；新增一个条目标字段 `cancel_pending` + 两个 ledger `event` + `cancel` 的返回体新增字段（`reason`/`stop_judge`/`forced`/`forced_available`）⇒ 属**返回契约的破坏性变更**（下游按旧字段解析会失配）。
- 需同步修订既有 ADR 16 处条款（ADR 的「必须同步修订」清单）。

## Impact

- 行为：`cancel` 不再「总是能终止」；证据不足 ⇒ 拒绝 + 留痕（目标仍可 resume）。
- 代价：多一次 `wait` 往返；新增持久字段且**重启不解钉**（崩溃恢复出口三条）；`force` 与普通 `cancel` 同一权限 action（治理面无法区分，已登记）。
- 风险：跨实例下严格模式实为「等它自然跑完」（上游 `interrupt` 跨实例语义未核对）。
