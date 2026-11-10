# design — front-async-resume-guard

## 1. 判据演进（必须留档）

`ADR-front-multi-backend` D4 的原文是：「第二级兜底的前提是 `busy` 未定义或为 0；**stale-busy 不被它覆盖**」。
⇒ D4 **没有**授权「不加 `busy===0` 前置」；本 change 是在其之上**补一条更强的准入谓词**，不是「按 D4 实现」。

新增（`lib/delegate-core.ts`）：

```
stillRunning(info, messages) :=
    (busy > 0 ∧ (idle = 0 ∨ busy > idle))     // ① 有在跑的 execution
  ∨ (lastMsg > idle)                           // ② 有未终结活动（含「刚起但还没有消息」）
```

两支都不可省（这是本 change 的核心论证）：

| 只用 | 会漏 |
|---|---|
| ②「最后消息 > idle」 | **刚起、还没有消息**的新 execution（`Started` 已投影、`busy` 已写，但 assistant 还没产出） |
| `isRunning` 的第二级（`busy === 0` 前置） | **stale-busy**：`busy` 陈旧 `< idle` 且 `busy ≠ 0` ⇒ 前置不成立 ⇒ 第二级不生效 |

## 2. 四个读者：改 / 不改

| 读者 | 位置 | 处置 | 结论是否变化 |
|---|---|---|---|
| `isRunning`（展示） | `lib/delegate-core.ts` | **不改** | 不变（D4 口径；`sessions.running` 的表现由 AC14 固定） |
| `slotBusyHolders`（两个派发面共用） | `lib/delegate-core.ts` | 补 `messages` + `stillRunning` | **变**：stale-busy / 刚起无消息 ⇒ 从「空闲」变「在跑」 |
| `planSlot.busyOf`（reconcile 用） | `lib/delegate-async.ts` | 补 `messages` + `stillRunning` | 同上 |
| 同步 `delegate` 的 in-flight | `lib/delegate-core.ts`（原 `lastMsg > idle`） | 改 `stillRunning(before, beforeMessages)` | 变（更严） |
| `dispatch` 的 resume 分支 | `lib/delegate-async.ts` | **新增**检查 | 新增 |

⚠️ 命名冲突：`delegate` 内部原有一个局部变量 `const stillRunning = waitTimedOut || outcome == null`（用于 ledger 的 `still_running` 字段），会**遮蔽**模块级谓词 ⇒ 已改名 `runStillRunning`（3 处）。

## 3. 落点与顺序（零副作用）

```
lookupPair → 未登记 / canonical_root / tombstone / goal_key
  → readSessionInfo（unknown ⇒ 拒；NotFound ⇒ D12 墓碑+vanished 行+新建）
  → ★ dispatching ⇒ 拒（文案指向 cancel）
  → ★ stillRunning(targetInfo, targetMessages) ⇒ 拒（文案固定前缀）
  → 全局上限 → create/复用 → claimSlot → ledger → metadata → prompt
```

★ 两处刻意放在 **create 之前、写墓碑之前、判上限之前** ⇒ 拒绝时：

- `ctx.session.prompt` / `create` 调用次数不变（不 ring doorbell、不建 session）；
- `pair.json` 的 `state`/`last_used_at`/`registered_at` 不变（**尤其**不得被 `claimSlot` 覆写成 `dispatching` —— 那会让该后端**不可 suspend**）；
- `ledger.jsonl` 不新增行；全局额度计数不变。

## 4. 已知限制（如实登记，不在本 change）

- **同会话并发 resume 不串行化**：两条 `dispatch(resume=X)` 在 X 空闲时都能通过 `claimSlot` 的自排除（`c.session_id === sessionID`）⇒ 两份简报进同一会话。属单槽表既有语义。
- **跨实例**：活体判定依赖本进程 `session.get`/`context`，跨 `opencode serve` 实例不在保证面。
- **AC9 / AC10 阻塞**：依赖 `front-stop-confirmation` 的停机守卫（未实施）。

## 5. 测试策略

- 夹具扩 `s.time` 显式覆盖（原 `time` 由 `busy` 标志派生，**表达不出** `busy < idle`）。
- 变异验证（本 change 实做）：
  - 禁用 `dispatch` 的活体检查 ⇒ AC1/AC5 失败 ✓
  - `slotBusyHolders` 退回 `isRunning` ⇒ AC1 失败 ✓
