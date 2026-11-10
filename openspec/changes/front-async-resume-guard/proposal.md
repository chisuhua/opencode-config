# front-async-resume-guard — 异步派发面对 resume 目标补活体守卫

## Why

`ADR-front-multi-backend` **D8.1** 已裁定「**只向空闲 session 投递**：目标在跑 ⇒ 拒绝」，**AC19** 已写明「对正在运行的后端 resume → 拒绝（不 steer 注入当前轮）」。但该判据**只落在同步 `delegate` 面**：

- 同步面：`lib/delegate-core.ts:1046` 用「最后一条消息时间 > 最后 idle」判 in-flight，并落 `outcome:"busy"` 行。
- 异步面：`dispatch` 路径（`lib/delegate-async.ts:800-940`）对 **resume 目标自身**没有任何活体判定；`claimSlot`（`:443-458`）在 reconcile 与占槽判定里都 `if (c.session_id === sessionID) continue` ⇒ 目标被排除在活体判定之外。

**后果**：① 违反 AC19（把新简报排进正在跑的会话）；② 在 `suspend(X)` 的停机窗口内并发 `dispatch(resume=X)` 会 ring 上游 doorbell（`session.ts:187`）⇒ `settle` 时起后继 execution —— 即 `ADR-front-stop-confirmation` 风险章所指的「两个写入者」可达路径之一。

**验收缺口**：AC19 在 `front-multi-backend` 验收中已被标 ✅，但证据只覆盖同步面 ⇒ **异步面从未被验**。本 change 同时补实现与验收。

来源：`.rddf/improvements/front-async-resume-guard.md`（planner；metis gap 分析记录 `.rddf/reviews/improvements-p2-metis.md`）。

## What Changes

- **AC 相关代码**：新增**具名析取谓词** `stillRunning(info, messages)` = `(busy>0 ∧ (idle=0 ∨ busy>idle)) ∨ (lastMsg > idle)`，供**四个读者**共用：
  - `lib/delegate-core.ts:199` `isRunning` —— **不改**（展示层口径，D4 已定）；
  - `lib/delegate-core.ts:245` `slotBusyHolders`、`lib/delegate-async.ts:421` `planSlot` —— **补 `messages`**（现不传 ⇒ 第二级兜底永不生效）；
  - `lib/delegate-core.ts:1046` 同步 `delegate` —— 改为 `stillRunning`（保留其「无 `busy===0` 前置」优点）；
  - `dispatch` 的 resume 分支（`:847` 之后）—— **新增检查**。
- **落点**：`lib/delegate-async.ts:847` 的 `readSessionInfo(ctx, brief.resume_session)` **之后、`:854` 的 vanished 处置之前**（此时尚未写墓碑、尚未 create、尚未判全局上限 ⇒ **拒绝时零副作用**）。
- **判定顺序写死**：存在性（读失败 ⇒ 拒）→ 墓碑（拒，终态）→ `goal_key`（不一致 ⇒ 拒）→ **活体（在跑 ⇒ 拒）** → 停机守卫（见 `front-stop-confirmation`，未立项）→ 槽位/上限 → 投递。
- **与停机守卫的关系**：新增 `preAdmission(ctx, { stateRoot, workRoot, sessionID? })` 作为**两段式**共用入口——**锁外**取活体、**锁内**只重验标记（`withLock` 是同步 `() => void`，**不可**在锁内 await）。本 change 只实现「活体」那一段；停机标记段由 `front-stop-confirmation` 提供，**不得在两处各写一份守卫**。
- **`dispatching` 语义钉死**：算「在跑」⇒ 对其 `dispatch(resume=X)` **拒绝**（现状是接受并再排一份 ⇒ 收紧）。
- **拒绝文案固定前缀**：`无法向运行中的后端 <id> 追加简报`（供 E2E 断言）。

## 验收标准

| AC | 判据 | 证据 |
|---|---|---|
| **AC1** | **四读者判据一致**：同一输入集（`busy>idle` / `busy` 陈旧`<idle` 且 `lastMsg>idle` / `busy` 陈旧且无新消息 / 全空闲）⇒ `isRunning`、`slotBusyHolders`、同步 `delegate`、`dispatch` 结论**逐条一致**且与 `stillRunning` 期望表一致 | 表驱动单测 |
| **AC2** | **负向（防单用 `isRunning`）**：`busy` 陈旧 `< idle` 且 `lastMsg > idle` ⇒ 判**在跑** | 单测 |
| **AC3** | **负向（防单用 `lastMsg>idle`）**：`busy > idle` 且无新消息 ⇒ 判**在跑** | 单测 |
| **AC4** | 同步 `delegate` **行为**不变：busy 拒 / 空闲放行 / 落 `outcome:"busy"` 行 / 不 prompt（4 条回归） | 单测（既有 + 新增） |
| **AC5** | `dispatch(resume=X)` 且 X 在跑 ⇒ **拒绝**，文案以固定前缀开头；且**零副作用**：`ctx.session.prompt` 与 `ctx.session.create` 调用次数不变、`pair.json` 该条目 `state`/`last_used_at`/`registered_at` 全部不变（尤其**不得**被 `claimSlot` 覆写成 `dispatching`）、`ledger.jsonl` 不新增任何行（含 `dispatched`/`dispatch_failed`）、`countActiveBackends` 前后相等 | fake ctx 计数 + 落盘断言 |
| **AC6** | `dispatch(resume=X)` 且 X 空闲 ⇒ 放行，行为与改动前逐字段一致 | 单测（既有回归） |
| **AC7** | X 状态读失败（原因不明）⇒ **拒绝**，文案说明「无法确认」；槽位与条目均不变 | 单测 |
| **AC8** | X **确认已删除**（上游 `NotFound`）⇒ 按 D12：旧条目墓碑 + `outcome:"vanished"` 行 + 同 `goal_key` 新建；不回退 | 单测（既有 D12 用例回归） |
| **AC9** | **交叉优先级**：停机守卫与活体判定**同时命中** ⇒ 文案为「正在停机（由 front `<id>` 发起），请等它结束」，**不含**「请先 suspend」字样 | 单测（需 `front-stop-confirmation` 的守卫；**未立项前**该条标 blocked） |
| **AC10** | `delegate(resume=X)` 且 X 正在被 `suspend` ⇒ **被拒**（验证 `lib/delegate-core.ts:957` 的 `excludeSessionID` **不排除**守卫） | 单测（依赖 AC9 的前置） |
| **AC11** | `dispatching` 态 ⇒ **拒绝**，文案指向 `cancel` / 等待进入 `active` | 单测 |
| **AC12** | `tombstone` 态 ⇒ 拒绝且文案为「已终止」（**不得**被活体判定抢先报「正在跑」） | 单测（判定顺序） |
| **AC13** | E2E：真实后端运行中 `dispatch(resume=X)` 被拒，且断言**没有**新的 `dispatched` 行 | E2E（外部仓，新增/复用一条 case） |
| **AC14** | 观测面不变：`sessions` 的 `running` 展示对同一输入与改动前一致（①`isRunning` 不改的直接证据） | 单测 |

## Out of Scope

- **停机窗口守卫**（`front-stop-confirmation`）：本 change 只做「目标在跑」这一个入口；两个判据的共用入口 `preAdmission` 先只留「活体」段。
- **同会话并发 resume 的串行化**：两条 `dispatch(resume=X)` 在 X 空闲时都能通过 `claimSlot` 的自排除 ⇒ 两份简报进同一会话。属单槽表既有语义，**如实登记、不在本 change 解决**。
- **跨实例**（`opencode serve` 多实例）：活体判定依赖本进程 `session.get`/`context`，跨实例本就不是本仓的保证面（见 `ADR-front-multi-backend` D8.3）。
- backlog 其它项：`isSessionMissingError` 的 `/404/` 宽判、上游行号/顺序漂移清单。

## Notes

- **判据演进必须记录**：`ADR-front-multi-backend` D4 **没有**授权「不加 `busy===0` 前置」——D4 原文说的是「第二级兜底的前提是 `busy` 未定义或为 0；stale-busy **不被它覆盖**」。`stillRunning` 是在其之上补的**更强谓词**，需在 `design.md` 记录这个演进，**不得**引 D4 当作既有授权。
- **口径变化的可见影响**：`slotBusyHolders`/`planSlot` 补 `messages` 后，「陈旧 busy 或刚起无消息」的占槽者可能从「空闲」变为「在跑」⇒ 同 `workRoot` 的**既有同步派发可能更多被拒**（保守侧，可接受；AC4 只保证 `delegate` 自身的 busy 拒/空闲放行行为不变，不保证「被拒次数」不变）。
- **`dispatching` 收紧的连带影响**：既有 E2E 的 `dispatch` 场景若对刚派发的后端再 `dispatch(resume)`，将从「成功」变「拒绝」⇒ 落地时需确认 L2-17/L2-18 的场景顺序不依赖旧行为。
- **夹具**：`tests/delegate-async.test.ts` 的 `time` 由 `busy` 标志派生，**表达不出** `busy < idle` ⇒ AC2/AC3 需要先扩夹具（与 `front-stop-confirmation` 的 X12 同一处改造，可合并做）。
