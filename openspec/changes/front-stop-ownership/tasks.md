# tasks — front-stop-ownership

> 来源：`openspec/changes/front-stop-ownership/proposal.md`（AC1–AC18；AC1–AC14 与 ADR Verification S1–S14 同号，AC15–AC18 为 metis 新增的实施期判据）。
> 决策：`docs/adr/ADR-front-stop-ownership.md`（Accepted）。

## 不做什么（防顺手）

- 不新增 `reason` 取值（词汇表见 ADR D1）；不新增 `state` 枚举；不升 `pair.json` 版本；不写迁移脚本。
- 不把授权校验下沉到 `setSlotState`/`updateSlotState` 单一入口（已删路径与活会话路径语义不同）。
- 不改 `cancel` 的停机证据（另立 backlog `cancel-stop-evidence`）；不改父篇 D12 矩阵的**动作**。
- 不给 tripwire 加心跳定时器/后台 daemon；不引入 `suspending` 态 / TTL 租约。
- 不在 `sessions` 输出 `claim_gen` / `stop_judge`。

## 实现

- [x] 1.1 **归属版本字段**：`pair.json` 条目新增 `claim_gen`（整数，读缺省 `0`）；bump 助手（`delegate-core` 共享）— AC1 / AC6
- [x] 1.2 **写者纪律**：区分「归属变更（bump）」与「良性写（字段级合并，不 bump）」；`registerSession` 保留 `claim_gen`（认领/收尾按语义 bump）；**认领/消费确认时清空 `suspended_at_message_id`**（防远古基线误报 steer 残留）— AC1 / AC12 / AC16
- [x] 1.3 **锁边界**：所有条目写在 `.role.lock` 内；`sessions` 回填改为「锁内重读 + 只补缺失字段」；dispatch 已删路径的 `setSlotState` 改持锁路径 — AC16
- [x] 1.4 **授权释放 API**：`releaseSlotAuthorized(pairRoot, sessionID, expectedGen, expectedStates, newState, extraFields?)` ⇒ **判定顺序固定**（条目不存在 → 状态已 idle/suspended → 代号 → 状态匹配）⇒ 同临界区完成状态翻转 + 字段回填 + bump；失败返回分开的 reason — AC2 / AC3 / AC4 / AC5 / AC15 / AC25
- [x] 1.5 **`suspend` 接入**：判读时快照 `claim_gen`；释放走授权 API；不符 ⇒ 不释放并返回结构化失败（不抛错）；`idle`/`suspended` ⇒ 幂等 no-op（**不 interrupt、不 wait、不 bump**）— AC2 / AC3 / AC4 / AC15
- [x] 1.6 **`cancel` 接入**：同上；不符 ⇒ 不墓碑、不释放；返回新增 `reason`（纯增量）— AC5 / AC18
- [x] 1.7 **已删路径**：动作逐字不变（父篇 D12/V09）+ **叠加**代号校验；`missing` + 代号不符 ⇒ 返回同时说明「已删」与「未释放」— AC7 / AC18
- [x] 1.8 **tripwire**：戳 `.instance-<pid>-<uuid>.json`（含 pid/host/started_at）；存活判定 = **同 host 且 pid 存活**（不依赖 TTL），跨 host 视为存活；存活计数按 `(host, pid)` **去重**；每次工具调用刷新 mtime（ENOENT ⇒ 重建）；退出删戳 — AC8 / AC11 / AC17
- [x] 1.9 **严格模式**：多实例 ⇒ `running0=false` 也要求水位线前移；`running0=true` 且证据齐备 ⇒ 保留 `stop_judge:"wait"`；`running0=false` 分支 ⇒ `stop_judge:"degraded"`；`foreign_instance:true` 出现在**所有** `suspend` 返回；落 `event:"foreign_instance"` ledger 行；严格模式下赎回开关**不生效** — AC8 / AC9 / AC18
- [x] 1.10 **矛盾检测**：`wait` 有界返回 ∧ 判活为真 ⇒ reason `wait_no_op`（≠ `still_running`）；`still_running` 保留在「`wait` 缺失 + 基线在跑 + 到 deadline」路径 — AC10
- [x] 1.11 **`entry` 缺失 ≠ `idle`**：登记态缺失/损坏 ⇒ 明确失败（`slot_entry_gone`），不渲染成幂等成功 — AC18
- [x] 1.12 **前端文案**：`prompts/front.md` 三分支改写（严格模式 / `wait_no_op` / `slot_already_released`）；`docs/front-delegate-usage.md` **新增**三节 — AC14
- [x] 1.13 **上游锚点**：`scripts/check-upstream-anchors.sh` +2（`executions` 进程内 Map / `time_busy` Started 投影）— AC13

## 测试

- [x] 2.1 **夹具扩展**：支持「注入并发认领（改 `claim_gen`）/ 注入 reconcile / 注入 `dispatching` 态 / 伪造实例戳（可注入 pid）/ 良性写」；注入点锚定（**第 1 次 `get` 之后**）— AC2 / AC3 / AC15
- [x] 2.2 **用例**：AC1–AC13、AC15–AC18 各一条（AC13 的单槽不变式覆盖 stateRoot + workRoot 两个文件）— 全部
- [x] 2.3 **变异验证**：去掉代号比对 / 去掉状态前置 / 去掉严格模式 / 去掉 bump / 去掉 pid 去重 ⇒ 对应用例必须红 — 全部
- [x] 2.4 **回归**：单测全绿 + `tsc` 无新错 + E2E L2-19/20/22/23 全绿（外部仓）+ 上游锚点脚本对 v2.2.5 全绿 — AC13

## 收口

- [x] 3.1 **ADR 回填**：AC 映射回填到 `docs/adr/ADR-front-stop-ownership.md` 的「AC 映射」行
- [x] 3.2 **归档前**：路径引用扫尾（`openspec/changes/front-stop-ownership/` → `openspec/changes/archive/2026-11-11-front-stop-ownership/`）

## 已知边界（写进 design）

- 跨实例根治需上游（4 条 feature request，见 ADR）。
- `cancel` 的停机证据改造另立 backlog `cancel-stop-evidence`。
- tripwire 跨 host 的远端戳 ⇒ 保守判存活 ⇒ 可能长期钉住严格模式 ⇒ 人工删戳。
