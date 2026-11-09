# Phase 0 测量报告：front-multi-backend 的「简报已被消费」判据

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 执行 | builder |
| 目的 | ADR `ADR-front-multi-backend` D7.2 / proposal AC44 的**前置测量任务**：判定「简报已被消费」是否**可可靠观测** |
| 探针脚本 | `/tmp/opencode/probe/phase0-consume.ts`（可重放） |
| 环境 | opencode v2.2.5 后台服务 `http://127.0.0.1:49374`；git 2.43.0；上游 checkout `/tmp/opencode/upstream-v225` |
| 结果 | **16 PASS / 0 FAIL** |
| **结论** | ✅ **判据可靠 ⇒ 不触发降级 ⇒ 按完整形态实施**（含 `suspend` 与切换） |

## 1. 判据是什么

> **「简报已被消费」 ⟺ 该简报的 `message.id` 出现在 `ctx.session.context()` 返回的消息 id 集合中。**

（`session.context()` 在插件侧是 `ctx.session.context({sessionID})`；HTTP 侧对应 `GET /api/session/{id}/context`。）

**为什么用 id 比对而不是文本匹配**：文本可能被截断/编码，而 `message.id` 是稳定标识。

## 2. 源码层依据（先于实测）

| 事实 | 位置 |
|---|---|
| **message 行只在 `InboxDelivered` 的 projector 里创建**（`insertMessage`） | `packages/core/src/session/projector.ts:731-758` |
| `InboxDelivered` **只在 promote 路径发布** | `packages/core/src/session/inbox.ts:548`（`publish`） |
| **入队路径不建 message 行**（只 `projectAdmitted` + 更新 `time_updated`） | `packages/core/src/session/projector.ts:761-778` |
| ⇒ 消息行的唯一创建路径 = 消费（promote） | 推论 |

**推论**：message 行的存在 ⟺ 该简报已被消费。这在源码层是**等价关系**，不是近似。

## 3. 运行时实测（16 项断言全过）

### 3.1 构造 pending 态（确定性，不靠模型）

`POST /api/session/{id}/prompt` 支持 **`resume: false`**（只入队、不唤醒）⇒ 可**确定性**构造「已投递但未消费」的状态，无需让模型跑起来。

| # | 断言 | 结果 |
|---|---|---|
| 1 | session 创建成功 | ✅ |
| 2 | `prompt` 显式 `delivery:"queue"` 返回 `delivery=queue` | ✅ |
| 3 | 投递后 `GET /inbox` 有 1 条行，`delivery=queue` | ✅ |
| 4 | **pending 的简报文本不在 `context` 里** | ✅ |
| 5 | `context` 返回结构非空（排除"读不到 context"造成的假阴性） | ✅ |
| 6 | pending 窗口可读到 `time` 字段 | ✅ |
| 7 | **`interrupt({resume:false})` 后 pending 行仍在**（不被删除） | ✅ |
| 8 | 再投一份 ⇒ inbox 有 2 条 pending | ✅ |
| 9 | 两条 pending 都有可辨识 id | ✅ |
| 10 | **能观测到简报进入 context**（判据可观测） | ✅ |
| 11 | ⚠️ **先进入 context 的是第一份（M1），不是第二份** ⇒ **幽灵注入坐实** | ✅ |
| 12 | `prompt` 返回的 id **在入队时即已分配** ⇒ **id 存在 ≠ 已消费** | ✅ |
| 13 | **被提升的简报其 message id 出现在 context id 集合里** | ✅ |
| 14 | **仍有 id 未出现在 context 里**（= 仍 pending）⇒ **判据有区分力** | ✅ |
| 15 | 被提升的简报文本在 context 里 | ✅ |

> 第 14 项是关键：若「所有 id 都出现在 context 里」，则判据无区分力（任何 pending 都会被误判为已消费）。实测**未消费的两条 id 仍不在 context 里** ⇒ 判据可靠。

### 3.2 关键原始返回

```
prompt1 的 message id = msg_1bfa880d7001DX1gKbWCHdYtcA
[pending 窗口] time = {"created":1794216853243,"updated":1794216857017}
interrupt → 200 {"interrupted":false}
首份进入 context 的简报 = M1（第 0 次轮询）
context 消息 id 集合 = ["msg_1bfa880d7001DX1gKbWCHdYtcA"]
仍未消费的 inbox id = ["msg_1bfa88f31001k74hVDQQQ7uQzy","msg_1bfa88ffa001R7Zh6xnEVPrJNf"]
```

## 4. 对 ADR / proposal 决策的影响

### 4.1 ✅ 不触发降级

ADR D7.2 的降级路径（「若无法可靠观测已消费 ⇒ 退回单槽但不可切换」）**不成立** ⇒ 本 change 按**完整形态**实施（含 `suspend` 与切换）。

### 4.2 ⚠️ 幽灵注入已被运行时坐实（ADR D7.2 的论断成立）

两份 pending 简报时，**第一份先进 context** —— 不是第二份。结合第 7 项（interrupt 不删 pending 行）：

> **`suspend` 一个简报尚未被消费的 session，再恢复它 → 那份旧简报会抢先整轮执行。**

⇒ 这**正面支持** proposal 的两条设计：
- `dispatching` 态（简报未确认消费）**只可 cancel**（AC45）——**不可 suspend 保留**；
- `dispatch` 必须先**确认消费**才置 `active`（AC44）。

⇒ 同时说明 **ADR D7.2「消费确认」不是保守，是必需**。

### 4.3 ⚠️ 判据的具体化（回写 proposal AC44）

本报告把 AC44 的判据从「简报文本出现在 `session.context`」**具体化为「message id 出现在 context 的 id 集合」**，理由：文本可能被截断/编码，id 是稳定标识。

同时记录一条**实现要点**（实测得出，易踩）：
> **`prompt()` 在入队时就返回并分配了 `message.id`** ⇒ **「拿到了 id」不等于「已消费」**。消费确认必须以「该 id 出现在 `session.context()` 的消息 id 集合中」为准。

### 4.4 ⚠️ pending 窗口的活体信号不可用

pending 窗口实测 `time = {"created":...,"updated":...}` —— **没有 `busy`、也没有 `idle`**。

⇒ 与 ADR D4 的活体判据一致（`busy` 由 claim 写入、**早于** promote）⇒ **活体信号不能当消费信号用**；消费确认只能用 context 比对。

### 4.5 插件侧仍无 inbox API（与 ADR D7/N2 一致）

`GET /api/session/{id}/inbox` **只在 HTTP 层存在**；插件 ctx 的 session 方法全集里**没有** inbox（上游 `packages/plugin/src/promise/adapter.ts:622-645`）⇒ **插件实现只能用 `session.context()`**，与本判据一致。

附带发现：`Session.Inbox.Info` **没有 per-row 状态字段**（只有 `id`/`sessionID`/`time`/`delivery`/`payload`）⇒ 即便能读 inbox，也**无法从行本身区分 pending/delivered**，仍须与 context 比对。

## 5. 残留 / 局限（如实记录）

- **N-A** 本探针用的是 HTTP 层 `prompt`/`context`/`inbox`，**不是插件 ctx**。插件 ctx 的 `session.prompt`/`session.context` 是否行为一致未单独实测（但它们是同一套上游实现，且 `adapter.ts` 只是 HTTP 适配）。**实施期用单测补**：fake ctx 版的 `session.context` 返回 id 集合的判活函数。
- **N-B** 本次用 `resume:false` 构造 pending，**未覆盖**「session 正在跑时投递 queue 简报」这条自然路径（那条路径的 pending 态由 drain 的 peek 造成）。**实施期补一条 E2E**：运行中投递 → 断言简报不在 context、id 比对判为未消费。
- **N-C** `time.busy` 在 claim 时的写入时机未单独实测（本探针的 pending 窗口没有 busy）。它**不作为消费判据**使用，故不影响本报告结论。
- **N-D** 探针未覆盖 compaction/move 类型的 inbox 行（它们不是 user 消息，promote 后不进 context 的 user 消息集合）。**dispatch 只投 user 简报**，故不影响。

## 6. 结论

**判据可靠 ⇒ 完整形态实施。** 实施期按本报告的判据（message id ∈ context 消息 id 集合）实现消费确认，并遵守「id 在入队时即分配、消费以 context 比对为准」这两条实测要点。
