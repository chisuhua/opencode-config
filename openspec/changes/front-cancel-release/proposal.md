# front-cancel-release — `cancel` 的释放判据：与 `suspend` 同源 + 显式 `force` 出口

> 决策依据：`docs/adr/ADR-front-cancel-release.md`（**Accepted** 2026-11-11 用户签批；oracle 1 轮 + critic 2 轮：REJECT → APPROVE_WITH_CONDITIONS）。
> 探针（前置事实）：`/tmp/opencode/probe/probe-cancel-release.ts`（**须固化进仓库**，见 AC19）。

## Why

`ADR-front-stop-confirmation` D1 已裁定：**`interrupt` 的返回值不是停机判据**。但 `cancel` 至今只看这个返回值就释放槽位并置墓碑 ⇒ **探针实证**：

```
cancel 后 X 的 state = tombstone（墓碑 ⇒ 不占槽）
Y = ses_c2（被准入）            ← 同工作树第二个后端
X 仍在跑 = true                ← X 还在写
结论：❌ cancel 在后端仍在跑时释放了槽位 ⇒ 同工作树两个写入者
```

⇒ 该路径正是 `ADR-front-multi-backend` D7.3「强制接管」（**推荐**恢复路径）的实现 ⇒ 推荐路径本身是双写者生成器；反向也坏（`interrupted:false` ⇒ 纯 no-op ⇒ D7.2「cancel 后重派」在后端从未起跑时是**死锁**）。

## What Changes（ADR D1–D6）

1. **D1**：`cancel` 复用 `suspend` 的停机判据（⓪ 授权前置 → 快照 → 守卫 → interrupt → `wait` → 判活 → 水位线 → 授权释放）；`interrupt` 的返回值**降级为诊断字段**。
2. **D2**：证据不足 ⇒ **整单拒绝**（不墓碑、不放槽）+ `reason`（证据类/授权类）+ `stop_judge` + `forced_available:true` + `event:"cancel_refused"`。
3. **D3**：`cancel_pending` 字段（`{baseline_idle, baseline_running, at}`）—— 记录本次尝试的起点；**水位线仍相对本次尝试的快照**；**挡住 reconcile 的自动放行**（D7.1/D7.3/V32–V33 须改）；**只在证据类拒绝且 `claim_gen` 未变时**写钉；写者纪律扩展到该字段。
4. **D4**：`cancel({force: true})` ⇒ **只跳过停机证据门控，不跳过授权门控** ⇒ 墓碑 + 释放 + `event:"cancel_forced"` + `forced:true` + 风险文案；严格模式下仍可用（偏离仅限 per-call 通道，env 通道仍不可用）。
5. **D5**：front 侧恢复序列改为四步（sessions → suspend → 失败则 cancel → 失败则 force → dispatch）；force 前必须向用户说明。
6. **D6**：多实例 ⇒ 严格模式（`running0=false` 也要求水位线前移）+ `foreign_instance:true` + `stop_judge:"degraded"`。

## 目标

1. 关闭「假停机 ⇒ 误放槽 ⇒ 双写者」。
2. 关闭「假死槽 ⇒ 砖死 / D7.2 死锁」。
3. 保留**明确、可见、可审计**的人工出口（`force`），避免把双写者换成永久砖死。

## 非目标（明确不做）

- `cancel` 对**不占槽**条目（`idle`/`suspended`）的墓碑化（backlog `cancel-idle-tombstone`）⇒ stop-ownership D1/S5 与共享函数零改动。
- 独立 `release` 工具（ADR 选项表 K6）⇒ 治理面若要「允许终止、禁止强制放槽」，另立 change。
- `cancel` 的**停机证据**之外的新判据（沿用 `suspend` 的）。

## 验收标准

| # | 判据 | 对应 ADR Verification | 证据 |
|---|---|---|---|
| **AC1** | 假停机不放槽：`interrupt → {interrupted:true}` 且 `busy` 保持为真、`wait` 立即 resolve ⇒ **不释放、不墓碑**；reason ∈ {`wait_no_op`,`still_running`}；条目仍 `active`；随后的 `dispatch` **被拒**（错误含占槽者 id） | F1 | 单测 |
| **AC2** | 终态可见 ⇒ 成功：`time.idle` 在 interrupt 后前移 ⇒ `state=tombstone` + 槽位释放 + `event:"cancelled"` | F2 | 单测 |
| **AC3** | 退化（`wait` 缺失）+ `running0=false` ⇒ 拒绝（`degraded_no_evidence`）+ `stop_judge:"degraded"`，不墓碑不放槽 | F3 | 单测 |
| **AC4** | 退化 + `running0=true` + 水位线前移 ⇒ 允许放行 | F4 | 单测 |
| **AC5** | 其它不可判（`wait` 超时 / 读失败）⇒ 拒绝（`wait_timeout`/`unreadable`），条目回原态 | F5 | 单测 |
| **AC6** | 后端已删（NotFound）⇒ 走 D12：墓碑 + `outcome:"vanished"` 行 ⇒ **逐字比对** multi-backend V09「终止/暂停面」段（保 stop-ownership S7 绿） | F6 | 单测 + 源码比对 |
| **AC7** | `force`：墓碑 + 放槽 + `event:"cancel_forced"` + `forced:true` + 风险文案；**默认路径**在 AC1 形态下绝不放槽 | F7 | 单测 |
| **AC8** | 授权类拒绝：窗口内 `claim_gen` 变化 ⇒ 不墓碑不放槽，reason `slot_reclaimed`；**不得**写 `cancel_pending` | F8 | 单测 |
| **AC9** | `cancel_pending` 挡住 reconcile：证据类拒绝后 ⇒ 随后的 `dispatch` 的 reconcile **不得**把它翻 `idle`（stale-busy 形态下必须仍被占） | F9 | 单测 |
| **AC10** | `cancel_pending` 生命周期：成功释放 / 后端被删 / 墓碑 ⇒ 字段消失；且经 `registerSession`（同步 `delegate` 收尾）后字段**仍在** | F10 | 单测 |
| **AC11** | 钉住**不削弱**水位线：被拒 → 后端跑完（`time.idle` 前移）→ 后端重新起跑且 `Started` 未投影 ⇒ 第二次 `cancel` **不得**放行 | F11 | 单测 |
| **AC12** | `cancel` 对不占槽条目（`state=idle`，session 仍存在）⇒ **幂等 no-op**（`slot_already_released`，不墓碑、不放槽） | F12 | 单测 |
| **AC13** | 不占槽 + 证据不足 ⇒ 拒绝（`slot_already_released` **优先于**证据类）⇒ 不墓碑、条目仍 `idle` | F13 | 单测 |
| **AC14** | ledger 可区分：证据类拒绝 ⇒ `event:"cancel_refused"`（含 reason + `forced_available`）；**不得**产生 `cancelled` 行；`force` ⇒ **不得**产生普通 `cancelled` 行 | F14 | 单测 |
| **AC15** | 严格模式：多实例 ⇒ `running0=false` 也要求水位线前移 ⇒ 空闲后端被拒 + `foreign_instance:true` + `stop_judge:"degraded"`；`running0=true` ⇒ 保留 `"wait"`；严格模式下 `force` 仍可用且带 `strict_mode:true` | F15 | 单测 |
| **AC16** | 上游锚点：脚本对 v2.2.5 全绿（≥19）且新增两条（`interrupt({resume:false})` 不删 pending inbox 行、`nextPromotable` 优先提升 steer） | F16 | 脚本 |
| **AC17** | 单槽不变式 + 回归：同一 `work_root` 占槽条目 ≤ 1；单测全绿；E2E L2-19/20/22/23 绿；新增 E2E「running → cancel 拒绝 → force → dispatch 成功」 | F17 | 单测 + E2E |
| **AC18** | 前端文案：含 D5 的四步恢复序列；**不得**出现「用裸 `cancel` 释放运行中的后端」；`force` 前要求用户知情；**两处点名旧句**（front.md:59 / usage.md:180 的「顺带释放」）已删改 | F18 | 文案断言 |
| **AC19** | 探针固化：前置探针的等价形态进仓库（可复跑） | F19 | 仓库内脚本 |

### AC ↔ ADR Verification 映射

**AC1–AC19 ↔ F1–F19（同号）**；ADR：`docs/adr/ADR-front-cancel-release.md`。

## 影响面

- `lib/delegate-async.ts`：`cancel` 全流程（⓪ 授权前置 → 判据 → 守卫 → 授权释放）、`cancel_pending` 字段、`force` 分支、`cancel_refused`/`cancel_forced` ledger、`sessions` 的「已钉住」标记。
- `lib/delegate-core.ts`：`claimSlot` 的 reconcile 例外（被钉住 ⇒ 不自动放行）；`registerSession` 保留 `cancel_pending`。
- `prompts/front.md` / `docs/front-delegate-usage.md`：恢复序列 + 两处点名旧句。
- `docs/adr/ADR-front-multi-backend.md` / `ADR-front-stop-confirmation.md` / `ADR-front-stop-ownership.md` / `ADR-front-knowledge-capability.md`：**同步修订既有条款**（ADR 的「必须同步修订」清单 16 行）。
- `scripts/check-upstream-anchors.sh`：+2 锚点。

## 风险与已知代价

- `cancel` 不再「总是能终止」：证据不足 ⇒ 整单拒绝 ⇒ 目标仍可 resume（front 文案必须同步）。
- 多一次 `wait` 往返（`cancel` 变慢）。
- 新增持久字段 `cancel_pending` ⇒ **重启不解钉**（崩溃恢复规则：cancel 成功 / force / 后端被删）⇒ 登记为「新增死槽面（已接受）」。
- `force` 的权限 action 与普通 `cancel` 相同（治理面无法区分）⇒ 已在 ADR 登记。
