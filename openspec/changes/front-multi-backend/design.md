# design: front-multi-backend（实现设计）

> 本文件是**实现层**设计与决策落点；**决策本体在** `docs/adr/ADR-front-multi-backend.md`，判据在 `proposal.md`。
> 本文件只回答「怎么实现成 ADR 说的那样」+ 「实现中发现的问题」。

## 1. 模块划分

```
lib/delegate-core.ts     既有 18 步同步委托 + 共享原语（pair/role/ledger I/O、槽位纯函数、活体判据）
lib/delegate-async.ts    【新】异步派发面：dispatch / sessions / suspend / cancel + 槽位生命周期
plugins/delegate.ts      一个插件、五个工具、各自独立的 options.permission action
```

**为什么槽位原语放 core 而不是 async**：既有 `delegate` 也必须受同一张槽位表约束（AC50① / ADR D7.4），
而 `async → core` 是单向依赖；把 `planSlot`/`claimSlot` 放 async 会让 core 反向依赖 async（循环）。

**但最后落地的形态是**：真正共用的只有「纯函数 + 一个读侧检查」——`slotOccupants` / `isRunning` /
`slotBusyHolders` 放 core；**写侧**的 `planSlot`/`claimSlot`（reconcile + 原子登记）留在 async，
因为既有 `delegate` 是「先建后登记」的形态，用不上原子登记。

## 2. 关键实现决策

### 2.1 槽位生命周期（ADR D6/D7）

| 环节 | 实现 |
|---|---|
| 键 | `workRoot`（`canonicalRoot()` 的第二个返回值） |
| 占槽态 | `dispatching` / `active`（`dispatching` 也占槽——它的简报可能仍 pending） |
| 非占槽态 | `idle` / `suspended` / `tombstone` |
| 写位置 | `pair.json`（每仓，落 `stateRoot`）；**不新增全局槽位文件**（ADR D2.1 的第三真相源红线） |
| 读侧 reconcile | 每次 `dispatch` 前：锁外读 pair + **async 活体查询** → 锁内**重验** + 翻转 + 判定 + 登记 |
| 既有 `delegate` 的读侧 | `slotBusyHolders`：同 `workRoot` 下**仍在跑**的占槽条目（不写回；写回由下一次 `dispatch` 完成） |

### 2.2 锁的形态（ADR D7.1 / 证据规则 10）

`withLock` 是**同步** `() => void`、`mkdirSync(recursive:false)` 取锁、10s 硬 deadline ⇒ **不可重入**。

⇒ 三条硬约束，实现逐条遵守：

1. **锁内不得 `await`**：活体查询、消费确认、`prompt`、`metadata` 写全部在锁外。
2. **锁内不得调用自取锁的函数**：`appendLedger`（`:429`）与 `registerSession`（`:460`）都自取 `.role.lock`
   ⇒ 锁内只能用**已持锁版本**：`appendLedgerLine` / `writePairs` / `writeRoleSession`。
3. **翻转必须在锁内**：`claimSlot` 的 reconcile 与登记**同一次临界区**（check-then-act 跨两次锁会双双通过）。

### 2.3 消费确认（ADR D7.2 / Phase 0）

```
messageID = newBriefMessageID()            // 自生成，msg_ 前缀（上游 SessionMessage.ID 约束）
prompt({sessionID, text, delivery:"queue", id: messageID})
轮询 context() 直到 messageID ∈ 消息 id 集合  → active
超时 30s（RDDF_CONSUME_TIMEOUT_MS 可覆盖）    → 停在 dispatching（只可 cancel）
```

**为什么自生成 id**：`prompt` 的返回值形状不保证（既有可能返回 message，也可能返回空）；而 `id` 是
**调用方可指定**的（上游 `sessions.prompt` 的 `input.id ?? ID.create()`），且 inbox 行 id **就是** message id
（`insertMessage` 用 `row.id`）。⇒ 用自己生成的 id 做比对，不依赖返回值。

### 2.4 名册（ADR D2）

- **只有兜底路径**（全库 `list` + `cursor` 续扫 + `metadata.delegated_by` 过滤）；roster 快路径按 Out of Scope 2 不做。
- **`list` 的 item 带 `metadata`（为空时省略字段）** —— 已实证（见 impl 报告 §5.3）。
- 权威态读 `pair.json`；`metadata.state` 只是展示镜像（整体替换语义 ⇒ 写前先读回完整对象）。

### 2.5 `suspend` 的六档分派（ADR D9 / AC51）

| `state` | 行为 |
|---|---|
| `dispatching` | **拒绝**（简报可能仍 pending ⇒ 恢复会幽灵注入） |
| `active` + 实际在跑 | interrupt → 复查活体 → 停机才释放槽 + 置 `suspended` |
| `active` + 实际不 busy | **释放槽位** + 置 `suspended`（ADR V42「幂等释放槽位」口径） |
| `idle` / `suspended` | 幂等 no-op |
| `tombstone` | **拒绝**（终态） |

## 3. 与既有 `delegate` 的共存

- **共用槽位表**（AC50①）：既有 `delegate` 在 create 之前调 `slotBusyHolders`；有则拒绝（错误含占槽 id + 「先 suspend」提示）。
- **状态写入**：首登记 `active`、终登记 `idle`（`wait` 返回即本轮结束，无歧义）。
- **既有判据不变**：`outcome` 枚举、`busy` 拒绝、scope 越界检测、pair 登记、ledger 行时机全部保留（205 pass 含既有 172）。

## 4. 已知实现张力（如实记录，不擅自改既有形态）

### 4.1 既有 `delegate` 的槽位检查存在小竞态窗口

既有 `delegate` 是「检查（`slotBusyHolders`）→ create → `registerSession`」，**检查与登记不在同一临界区**
（`create` 是 await，`withLock` 不能 await）。

- 对比：`dispatch` 是「create → 锁内 check+register」，**同一临界区**，拒绝时**清理已建 session**（AC26③）。
- 既有路径若改成「先建后检」会引入"建了再删"的副作用，且与「既有语义不变」冲突。
- ⇒ 保持现状，**如实记录**。影响面：`delegate` 是 30 分钟阻塞的同步面，并发同一工作树的概率低。

### 4.2 `sessions` 对「已被外部删除的后端」不可见（**设计张力**）

`list` 不返回已删 session ⇒ 兜底路径**看不到它** ⇒ 无法报「已消失」，也无法补记 `outcome:"vanished"`。

- ADR D2.1：metadata 索引「随 session 删除自动消失」= **特性**（不悬挂）。
- AC13：`sessions` 要报「已消失」+ ledger 补记终态行（区分「从未派发」）。
- 要报「已消失」必须知道"曾经派发过哪些仓库"；而 ADR 明确否决全局 registry（第三真相源）。

⇒ **这是 `design_drift`，交 architect 决策**。三个候选：

| 候选 | 代价 |
|---|---|
| (a) `sessions` 扫描已知 stateRoot 的 `pair.json`，与 list 求差集 | 需维护「已知仓库集合」——又回到全局清单问题 |
| (b) 由调用方（front）传入可能的 repo 列表 | 契约变复杂；front 未必知道 |
| (c) 接受「已删 = 不可见」：ledger 的 `event:"dispatched"` 行即唯一痕迹，**不补记**，但文档写明 | 改动最小；但 AC13 需改判据 |

**本实现未擅自选**；`sessions` 目前只列出仍存在的后端。

## 5. 上游语义锚定结果（实测）

| 语义 | 结论 | 依据 |
|---|---|---|
| `prompt` 默认 `delivery` | `steer`（不是 queue） | 探针 P5.1 + `prompt.ts:52` |
| `get()` 在 run 中返回 `time.busy` | **是** | 本轮实测（run 中 `busy` 有值、`outcome` 不存在）→ **N7 的 Q2/R4 冲突：R4 正确** |
| pending 窗口的 `time` | 只有 `created`/`updated`，**无 `busy`/`idle`** | Phase 0 探针 |
| message 行的创建时机 | **只在 promote（`InboxDelivered` projector）** | `projector.ts:731-758` |
| 入队是否建 message 行 | **否**（只 `projectAdmitted`） | `projector.ts:761-778` |
| `list` item 是否带 `metadata` | **是**（为空时省略字段） | 本轮实证 |
| 插件可订阅的 session hook | 13 个，**不含 `session.inbox.delivered`** | `plugin/src/effect/session.ts:185-199` |
| `Session.Inbox.Info` 有 per-row 状态 | **无**（只有 id/sessionID/time/delivery/payload） | `schema/src/session-inbox.ts:59-90` |
