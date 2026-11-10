# front-stop-ownership — 槽位释放的授权模型（代号条件化 + 跨实例 tripwire）

> 决策依据：`docs/adr/ADR-front-stop-confirmation` 的补充篇 `docs/adr/ADR-front-stop-ownership.md`（**Accepted** 2026-11-11 用户签批）。
> 改进稿：`.rddf/improvements/front-stop-ownership.md`（5 段草稿）。
> 本版已并入 metis gap 分析的 6 条 blocker 级修正（见 `tasks.md` 的「不做什么」与各 AC 的证据列）。

## 背景

`ADR-front-stop-confirmation` D1 ⑧ 与 `ADR-front-multi-backend` D11.2 要求「**锁内重验后再翻转**」，实现却是无条件写 `state`（`lib/delegate-async.ts` 的 `updateSlotState` → `setSlotState`）。探针复现：停机窗口内让「另一进程的 claim 已落盘」（条目 `dispatching`）⇒ `suspend` 仍写 `suspended` ⇒ **覆盖更新的 claim** ⇒ 同工作树可再准入 ⇒ 两个写入者。

跨实例侧：`ctx.session.wait` **必然空转**（上游 `executions` 是进程内 Map）、停机守卫是**进程内**的 ⇒ 另一实例看不到 ⇒ 假停机可达。本仓无跨进程原语可用 ⇒ 不假装根治，改为「前提 + tripwire + 严格判据」。

## 目标

1. 释放槽位必须**授权化**（归属版本 + 状态前置），不再可能覆盖别人的认领。
2. 跨实例残余从「不可见」变成「可见且降级」，且**不**把未决问题写成已决。

## 非目标（明确不做）

- `cancel` 的停机证据改造（另立 backlog `cancel-stop-evidence`）。
- 跨进程锁 / TTL 租约 / 直读上游 SQLite（ADR 选项表 C2/C3/C6 已否）。
- 上游 feature request 的实现（不属本仓）。
- **不新增 `reason` 取值**（词汇表见 ADR D1）、**不新增 `state` 枚举**、**不下沉**到 `setSlotState` 单一入口（已删路径与活会话路径语义不同）、**不升** `pair.json` 版本、**不写**迁移脚本、**不**给 tripwire 加心跳定时器、**不在** `sessions` 输出 `claim_gen`。

## 返回契约（本 change 的新增/变更）

| 工具 | 字段 | 语义 |
|---|---|---|
| `suspend` | `suspended` | 既有布尔；**新增**取值面：`false` + `idempotent:true` ⇒ 已释放过（`slot_already_released`） |
| `suspend` | `reason` | 词汇表见 ADR D1（授权类 4 个 + 证据类，含新增 `wait_no_op`）；**授权类优先** |
| `suspend` | `foreign_instance` | **布尔增量**：多实例判定为真时，**成功与失败返回都带** |
| `cancel` | `reason` | **纯增量**（授权类）；`cancel` 现无 `stop_judge`/`reason` |
| 所有工具 | — | **授权类拒绝一律结构化返回，不抛错**（含现状为 `throw` 的 `dispatching` 拒绝） |

## 验收标准

| # | 判据 | 对应 ADR Verification | 证据 |
|---|---|---|---|
| **AC1** | 一次认领（`claimSlot`）后条目 `claim_gen` 严格增大；**良性写**（字段级合并）后 `claim_gen` **不变** | S1 | 单测 |
| **AC2** | 判读与释放之间发生**归属变更**（认领落盘）⇒ `suspend` **不得**释放槽位；返回 `suspended:false` + reason `slot_reclaimed`；条目仍在当前占者名下 | S2 | 单测（注入点：**第 1 次 `get` 之后**） |
| **AC3** | 条目已被置 `dispatching`（另一路 resume 在途）⇒ `suspend` **不得**释放槽位（reason `slot_state_changed`） | S3 | 单测 |
| **AC4** | 判读与释放之间只有**良性写** ⇒ `suspend` **仍可**正常释放（不得出现 `slot_reclaimed`） | S4 | 单测 |
| **AC5** | `cancel` 同样条件化：代号/状态不符 ⇒ **不得**置墓碑、**不得**释放，并返回明确 reason；`idle`/`suspended` ⇒ 幂等 no-op（`slot_already_released`） | S5 | 单测 |
| **AC6** | `state` 取值仍在五值枚举内；`claim_gen` 是**整数**且**不参与任何状态判定**（置为 `"7"` / `-1` / 缺失 / `null` 时槽位判定结果逐字不变） | S6 | 单测（属性断言） |
| **AC7** | **已删路径的动作与改动前逐字一致**：父篇 D12 矩阵各组的 `suspend`/`cancel` 处置不变（比对**动作 + 返回体既有字段集合**；排除 `claim_gen` 与新增 `reason`/`foreign_instance`） | S7 | 单测（字段白名单比对） |
| **AC8** | state dir 出现 **2 个存活实例** ⇒ `suspend` 走**严格模式**（`running0=false` 也要求水位线前移 ⇒ 空闲后端**不被释放**）+ 落 `event:"foreign_instance"` ledger 行 + 返回值带 `foreign_instance:true` + `stop_judge:"degraded"` | S8 | 单测（伪造实例戳） |
| **AC9** | 严格模式下 `RDDF_SUSPEND_ALLOW_DEGRADED=1` **不生效**（不得出现 `degraded-forced`） | S9 | 单测 |
| **AC10** | `wait` 有界返回 **∧** 判活为真 ⇒ reason `wait_no_op`（≠ `still_running`）、未释放槽位、文案两个出口；**`still_running` 仍可达**（`wait` 缺失 + 基线在跑 + 到 deadline） | S10 | 单测（两条） |
| **AC11** | 戳的生命周期：进程退出删戳；**存活判定 = 同 host 且 pid 存活**（不依赖 TTL ⇒ 崩溃残留自动判死）；跨 host 视为存活；`utimes` ENOENT 时重建；mtime 在未来按存活 | S11 | 单测（伪造戳 + pid 注入） |
| **AC12** | 同步 `delegate` 走 `registerSession`（整条重建条目）之后，条目的 `claim_gen` **不得**下降 | S12 | 单测 |
| **AC13** | 同一 `work_root` 在 **stateRoot 与 workRoot 两个 `pair.json`** 上，`state ∈ {active, dispatching}` 的条目 **≤ 1**；单测全绿；E2E L2-19/L2-20/L2-22/L2-23 全绿（外部仓 `/workspace/main/rdd-workflow-e2e`）；`suspend` 空闲路径不明显变慢（+1.5s 内）；`scripts/check-upstream-anchors.sh` 对 v2.2.5 全绿 | S13 | 单测 + E2E + 脚本 |
| **AC14** | 严格模式 / `wait_no_op` / `slot_already_released` 三种形态下，`prompts/front.md` 与 `docs/front-delegate-usage.md` 都必须有**可 grep** 的对应段落：`front.md` 含「多实例」「可能仍在跑」「slot_already_released」「idempotent」；`usage.md` **新增**这三节（现状无 degraded 段落 ⇒ 属新增要求）；**不得**出现「用 `cancel` 释放空闲后端」的建议 | S14 | 文案断言（正向 substring + 负向 regex） |
| **AC15** | **授权判定顺序固定**：`条目不存在 → slot_entry_gone`；`state ∈ {idle, suspended} → slot_already_released`（幂等、**不 bump、不 interrupt、不 wait**）；`claim_gen ≠ G → slot_reclaimed`；`state ∉ expected → slot_state_changed`。⇒ 空闲后端 + 期间发生 reconcile ⇒ 必须报 `slot_already_released`（**不得**报 `slot_reclaimed`） | —（metis #1） | 单测（注入 reconcile） |
| **AC16** | **写者与锁边界**：所有 `pair.json` 条目写都在 `.role.lock` 内；`sessions` 的存量回填改为「**锁内重读 + 只补缺失字段**」（不得用锁外 `entry` 整条替换）；dispatch 的已删路径 `setSlotState` 改为持锁路径；`registerSession` 保留 `claim_gen` | —（metis #5 / #18 / #19） | 单测 + 源码 grep 断言 |
| **AC17** | **tripwire 身份与容错**：戳文件名含 pid（`.instance-<pid>-<uuid>.json`），**存活计数按 `(host, pid)` 去重** ⇒ 同进程多 plugin 副本**不得**判多实例；两个不同存活 pid ⇒ 判多实例；`utimes` ENOENT ⇒ 重建不抛错；mtime 在未来 ⇒ 按存活 | —（metis #2 / #3） | 单测 |
| **AC18** | **返回契约一致性**：授权类拒绝**一律结构化返回、不抛错**（含现状 `throw` 的 `dispatching` 拒绝）；`cancel` 的 `reason` 为纯增量；严格模式下 `running0=true` 且证据齐备 ⇒ 保留 `stop_judge:"wait"`（**不**误报 degraded）；`foreign_instance` 出现在**所有** `suspend` 返回（含失败）；`entry` 缺失（`pair.json` 无该条目/损坏）⇒ 明确失败（`slot_entry_gone`），**不得**渲染成 `idle` 的幂等成功 | —（metis #6 / #8 / #13） | 单测 |

### AC ↔ ADR Verification 映射

- **AC1–AC14 ↔ S1–S14（同号）**（ADR：`docs/adr/ADR-front-stop-ownership.md`）。
- **AC15–AC18** 为 metis gap 分析新增的**实施期判据**（ADR 层面已由 D1/D2 的原则覆盖；此处落到可执行粒度）。

## 影响面

- `lib/delegate-async.ts`：`claim_gen` 的 bump 落点、授权释放 API、`suspend`/`cancel` 接入、tripwire、矛盾检测、`sessions` 回填改写、已删路径持锁。
- `lib/delegate-core.ts`：`registerSession` 保留 `claim_gen`（并按认领/收尾区分是否 bump）。
- `prompts/front.md`、`docs/front-delegate-usage.md`：文案（三节新增/改写）。
- `scripts/check-upstream-anchors.sh`：+2 锚点。
- `tests/`：新增用例（夹具需支持「注入并发认领 / 注入 reconcile / 伪造实例戳 / 良性写 / pid 注入」）。

## 风险与已知代价

- 多实例下 `suspend` 空闲后端必然失败（严格模式）；实际出口是下一次 `dispatch` 的 reconcile 顺带释放。
- tripwire 假阳性：单实例多 plugin 副本 ⇒ **按 pid 去重后不成立**；跨 host 的远端戳 ⇒ 保守判存活（可能长期钉住严格模式 ⇒ 人工删戳）。
- `registerSession` 改为保留式写 ⇒ `suspended_at_message_id` 会被保留 ⇒ **认领/消费确认时必须清空**（否则后续 resume 拿远古基线误报 `steer_residue:"suspected"`）⇒ 落在 AC16/AC18 的实现要求里。
- `cancel` 的停机证据**不在本 change**（另立 backlog）。
