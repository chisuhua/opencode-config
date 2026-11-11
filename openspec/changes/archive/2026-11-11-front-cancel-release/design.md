# design — front-cancel-release

> 决策依据：`docs/adr/ADR-front-cancel-release.md`（**Accepted**；oracle 1 轮 + critic 2 轮 REJECT→APPROVE_WITH_CONDITIONS）。
> 实施依据：ADR 的 D1–D7 + 实现约束 6 条；验收判据：ADR Verification F1–F19 ↔ change 的 AC1–AC19。

## 1. 变更面（逐文件）

| 文件 | 改什么 | 依据 |
|---|---|---|
| `lib/delegate-async.ts` | `cancel` 判据链重写（⓪ 授权前置 → 快照 → 守卫 → interrupt → `waitStopped` → 授权释放）；`markCancelPending`（新）；`releaseSlotAuthorized` 增 `ledgerRows`/`ledgerRoot`；`setSlotState` 墓碑时清 `cancel_pending`；`claimSlot` 的 reconcile 例外；`sessions` 输出 `cancel_pending` | ADR D1–D7 |
| `lib/delegate-core.ts` | `registerSession` **保留** `cancel_pending`（写者纪律） | ADR D3④ |
| `tests/delegate-async.test.ts` | 夹具加 `staleBusyOnInterrupt`；改写 1 条语义已被取代的旧用例；新增 AC1–AC19 用例 | AC1–AC19 |
| `tests/probes/probe-cancel-release.ts` | **新**：把本 ADR 的前置探针固化为可复跑的回归脚本 | AC19 |
| `scripts/check-upstream-anchors.sh` | +2 锚点（A11 `resume:false` 不提升 inbox；A12 `nextPromotable` 优先 steer） | AC16 |
| `scripts/mutate-cancel-release.sh` | **新**：5 组变异的自动验证（每组都必须让对应用例变红） | AC 变异验证 |
| `prompts/front.md` / `docs/front-delegate-usage.md` | D5 四步恢复序列；`cancel` 的 reason 语义；`force` 的用户知情要求；删改两处点名旧句 | ADR D5 + 修订清单 |
| `docs/adr/ADR-front-multi-backend.md` | 13 处条款同步（D1 工具表 / D7.1 / D7.2 / D7.3 / D9 / D11.3 / D12 注记 / V08 / V32 / V33 / V36 / V37 / V42） | ADR 修订清单 |
| `docs/adr/ADR-front-stop-confirmation.md` | 3 处（D1 适用范围 / D2:68 / D4 通道分工 + `stop_judge` 作用域） | 同上 |
| `docs/adr/ADR-front-stop-ownership.md` | 6 处（D2 严格模式作用域 + `force` 偏离登记 / D3⑦ 结案 / D3⑩ / 实现约束·写者纪律 / 实现约束·cancel 边界 / C7 结案） | 同上 |
| `docs/adr/ADR-front-knowledge-capability.md` | D5 四处（`event` 枚举 + 字段表 + 行产生时机表 + `outcome` 恒 `null` 规则） | 同上 |
| `openspec/changes/archive/2026-11-10-front-multi-backend/proposal.md` | AC28 行加**取代注记**（保留历史记录 + 指向新 ADR） | AC28 |

## 2. `cancel` 的判据链（实现顺序，与 ADR D1 一致）

```
locateBackend
 ├─ unknown（读失败，原因不明）   ⇒ 未做任何处置，返回明确结果
 ├─ missing（NotFound 正面证据）  ⇒ D12：墓碑 + outcome:"vanished" 终态行
 └─ state == tombstone            ⇒ 幂等 no-op
⓪ 授权前置（**授权类优先于证据类**）
 ├─ 条目不存在                    ⇒ slot_entry_gone
 ├─ state ∈ {idle, suspended}     ⇒ slot_already_released（幂等 no-op）
 └─ state ∉ {active, dispatching} ⇒ slot_state_changed
快照：snapGen（归属版本）+ stopBaseline（time.idle / running0）—— **必须在 interrupt 之前**
 └─ 基线读不出来                   ⇒ unreadable（证据类拒绝）
跨实例 tripwire ⇒ foreign ⇒ waitStopped({strict:true})
守卫（enterStopGuard，finally 必清）
interrupt({resume:false}) ⇒ interrupted **只作诊断字段**
waitStopped(...) ⇒ stopped / judge / reason
 ├─ reason == "missing"          ⇒ D12（窗口内被外部删除）
 ├─ !stopped && !force           ⇒ **整单拒绝**：不墓碑、不放槽
 │    · markCancelPending（锁内；**不 bump** 归属版本）
 │    · 落 event:"cancel_refused"（同临界区）
 │    · 返回 reason / stop_judge / forced_available / pinned
 └─ 授权释放（releaseSlotAuthorized，锁内：代号 + 状态前置）
      ├─ 失败 ⇒ 授权类拒绝（**不得**钉住）
      └─ 成功 ⇒ tombstone（清 cancel_pending）+ 落 event:"cancelled" 或 event:"cancel_forced"
```

## 3. 三个关键取舍

1. **`interrupt` 的返回值降级为诊断字段**：`ADR-front-stop-confirmation` D1 早已裁定它不是停机判据；
   `cancel` 至今只看它 ⇒ 探针实证「同一工作树两个写入者」。⇒ 本篇把判据换成 `suspend` 的**同一条**。
2. **拒绝 ⇒ 钉住（`cancel_pending`）**：被拒说明「该后端可能还在写」⇒ `claimSlot` 的 reconcile
   **不得**把它翻 `idle`（否则双写者从后门回来）。代价 = 新增一条持久条件 ⇒ 必须有崩溃恢复规则
   （重启**不解钉**；出口三条：`cancel` 成功 / `force` / 后端被删）⇒ 登记为「新增死槽面（已接受）」。
3. **`force` 是 per-call 参数、不是 env**：env 是**部署级默认** ⇒ 全体 front 无差别放行、用户未逐次知情；
   per-call 则**逐次可见 + 落盘可审计**（`event:"cancel_forced"` 带 `reason` / `forced` / `strict_mode`）。
   ⚠️ `force` **只跳过停机证据门控**，**不跳过授权门控**（槽位已被别人认领时仍然拒绝）。

## 4. 已知边界（如实登记）

- **`cancel_pending` 重启不解钉**：插件重启后钉住仍在 ⇒ 出口只有三条（`cancel` 成功 / `force` / 后端被删）。
  ⇒ 「砖死不是静默的」靠 `sessions` 的 `cancel_pending` 字段保证可见（front 必须显式处理）。
- **跨实例**：`interrupt` 能否打断**另一实例**的 execution **未核对**（上游 feature request #5）⇒
  严格模式下的 `cancel` 实际是「等它自然跑完」；`strict_mode:true` + `foreign_instance:true` 必须如实带给 front。
- **`remove` 不承担停机语义**：上游 `session.remove` 是否中断运行中的 execution **未核对**
  （上游 feature request #6）⇒ `cancel({remove:true})` 只删 session，不作为停机证据。
- **展示层判活的 stale-busy 残留**（`ADR-front-multi-backend` D11.3）：`running0 = false` 时水位线**不是**判据
  ⇒ 「`Execution.Started` 未投影」那一变体不由本篇的判据拦住 ⇒ 已在 ADR F11 的口径澄清里如实登记。
- **返回契约的破坏性变更**：`cancel` 的返回体新增 `reason` / `stop_judge` / `forced` / `forced_available` /
  `pinned`（+ `pin_reason`）⇒ 下游按旧字段解析会失配（已在 ADR 修订清单登记）。

## 5. 验收对应

| AC | 落点（实现 / 用例） |
|---|---|
| AC1–AC6 | `cancel` 判据链 / `tests/delegate-async.test.ts` 的 AC1–AC6 |
| AC7–AC8 | `force` 分支 + 授权门控 / AC7–AC8 |
| AC9–AC10 | `claimSlot` reconcile 例外 + `registerSession` 写者纪律 + `sessions` 可见性 / AC9–AC10、AC10b |
| AC11 | 水位线相对本次尝试的快照 / AC11（+ 变异 M5） |
| AC12–AC13 | ⓪ 授权前置 / AC12–AC13 |
| AC14 | ledger 事件 / AC14 |
| AC15 | 严格模式 + `force` 仍可用 / AC15 |
| AC16 | `scripts/check-upstream-anchors.sh`（21/21，对 v2.2.5） |
| AC17 | 单槽不变式 + E2E 回归（L2-19/20/22/23）+ 新增 L2-24 / AC16、验收报告 |
| AC18 | `prompts/front.md` + `docs/front-delegate-usage.md` / AC18 |
| AC19 | `tests/probes/probe-cancel-release.ts`（可复跑回归）/ AC19 |
