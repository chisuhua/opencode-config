# tasks — front-cancel-release

> 来源：`openspec/changes/front-cancel-release/proposal.md`（AC1–AC19；与 ADR Verification F1–F19 同号）。
> 决策：`docs/adr/ADR-front-cancel-release.md`（Accepted）。

## 不做什么（防顺手）

- 不改 `releaseSlotAuthorized` 的**判定顺序**（`idle`/`suspended` 早退仍在）⇒ `suspend` 行为**零变化**。
- 不给 `cancel` 增加 env 赎回通道（只有 per-call `force`）；不改 `RDDF_SUSPEND_ALLOW_DEGRADED`（只对 `suspend`）。
- 不新增状态枚举、不新增工具、不升 `pair.json` 版本、不写迁移脚本。
- 不新增未列入 ADR 词汇表的 `reason` 取值。
- 不改 `cancel` 对不占槽条目的墓碑化（backlog `cancel-idle-tombstone`）。
- 不动 `remove` 的停机语义（上游未核对 ⇒ `remove` 只删 session）。

## 实现

- [ ] 1.1 **`cancel` 判据链**：⓪ 授权前置（条目不存在 / 已是 `idle`\|`suspended` ⇒ 授权类 reason，**优先于**证据类）→ 快照（`v0` / `running0` / `claim_gen`）→ 守卫 → `interrupt`（返回值只作诊断）→ `waitStopped` → 授权释放 — AC1–AC6 / AC12 / AC13
- [ ] 1.2 **严格模式**：多实例 ⇒ `waitStopped({strict:true})` + `foreign_instance:true` + `stop_judge` 分支口径 — AC15
- [ ] 1.3 **`cancel_pending`**：字段 `{baseline_idle, baseline_running, at}`；**只在证据类拒绝且 `claim_gen` 未变时**写；成功释放 / 已删 / 墓碑 ⇒ 清除；`registerSession` 保留它 — AC8 / AC10 / AC11
- [ ] 1.4 **reconcile 例外**：`claimSlot` 的 reconcile **不得**把被 `cancel_pending` 钉住的条目翻 `idle` — AC9
- [ ] 1.5 **`force`**：per-call 参数；**只跳过停机证据门控**（授权门控仍在）；`event:"cancel_forced"` + `forced:true` + 风险文案 + `strict_mode` — AC7 / AC15
- [ ] 1.6 **ledger**：`event:"cancel_refused"`（reason + `forced_available`）与 `event:"cancel_forced"`；**不得**与 `cancelled` 混用 — AC14
- [ ] 1.7 **`sessions` 可见性**：输出「已钉住」标记 — AC10
- [ ] 1.8 **前端文案**：D5 的四步恢复序列；**不得**把裸 `cancel` 写成「释放入口」；force 前要求用户知情；删改 front.md:59 与 usage.md:180 的旧句 — AC18
- [ ] 1.9 **上游锚点**：`scripts/check-upstream-anchors.sh` +2 — AC16
- [ ] 1.10 **既有 ADR 同步修订**：按 ADR 的「必须同步修订」清单 16 行逐条改（multi-backend D7.1/D7.2/D7.3/D9/D11.3/AC28/V32–V37/D12 ⚠️ 注记/D1 工具表/V08/V42、stop-confirmation D1/D2:68/D4、stop-ownership D2/S9/D3⑩/实现约束·写者纪律/实现约束·cancel 边界、knowledge-capability D5）— 全部 AC
- [ ] 1.11 **探针固化**：把前置探针的等价形态落进仓库（可复跑）— AC19

## 测试

- [ ] 2.1 **夹具扩展**：`wait` 可控（已有）+ `interruptNoop` + 注入并发认领 + 伪造实例戳 — AC1/AC8/AC11/AC15
- [ ] 2.2 **用例**：AC1–AC19 各一条 — 全部
- [ ] 2.3 **变异验证**：去掉判据门控 / 去掉 `force` 的授权门控 / 去掉 reconcile 例外 / 去掉 `cancel_pending` 保留 ⇒ 对应用例必须红 — 全部
- [ ] 2.4 **回归**：单测全绿 + `tsc` 无新错 + E2E L2-19/20/22/23 + 新增 E2E「running → cancel 拒绝 → force → dispatch 成功」+ 上游锚点全绿 — AC17

## 收口

- [ ] 3.1 **ADR 回填**：AC 映射回填到 `docs/adr/ADR-front-cancel-release.md` 的「AC 映射」行
- [ ] 3.2 **归档前**：路径引用扫尾（`openspec/changes/front-cancel-release/` → `openspec/changes/archive/2026-11-11-front-cancel-release/`）

## 已知边界（写进 design）

- `cancel_pending` **重启不解钉**（崩溃恢复出口：cancel 成功 / force / 后端被删）。
- 跨实例：`interrupt` 能否打断另一实例的 execution **未核对**（上游 feature request #5）⇒ 严格模式下 `cancel` 实为「等它自然跑完」。
- `remove` 不承担停机语义（上游 feature request #6）。
