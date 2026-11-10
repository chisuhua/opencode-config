# design — front-stop-confirmation

## 1. 判据与序列（落地口径）

```
① 锁外快照      snapshotStopBaseline → { idle: v0, running: running0 }
② 置准入守卫    enterStopGuard(stateRoot, workRoot, backendID, frontID) → token
③ 锁外 interrupt({resume:false})
④ deadline = now + W        W = min(RDDF_STOP_TIMEOUT_MS, 60s)
⑤ race(ctx.session.wait, deadline)      ← 覆盖 cleanup 与「返回前到达的后继」
⑥ 判活为假（isRunning）                  ← 至少判一次
⑦ running0 ⇒ time.idle > v0              ← 至少判一次
⑧ 锁内重验条目仍 active ⇒ 释放 + 置 suspended
⑨ finally: leaveStopGuard(token)         ← 成功/失败/异常都清
```

**`wait` 的竞速写法**（关键）：先取原 promise、再分叉 —— `w.catch(() => {})` 只用于消除
unhandled rejection；竞速用 `w.then(ok, err)`。**不得**直接 `.catch` 吞错，否则分不出
`NotFound`（D3：视为已停机）与其它错误（D4：退化）。

## 2. 守卫为什么在 `delegate-core`

两个准入口都要它：`dispatch`（`claimSlot` 锁内重验 + 早拒）与**同步 `delegate`**（它不走
`claimSlot`，走 `slotBusyHolders`）。放在 core 供两处共用，且**不落盘**：

- 键 = `stateRoot` + `workRoot`；
- 值 = `StopGuardEntry[]`（每条带唯一 `token`）⇒ **并发两次 `suspend` 互不清对方的守卫**；
- 崩溃即丢 ⇒ `pair.json` 里条目仍是 `active` ⇒ 走既有 reconcile 回收 ⇒ **无死槽**
  （这是 ADR 选项表 B6 否掉「持久化 `suspending` 态」的原因）。

## 3. 退化（D4）与留痕

| 情形 | 判据 | 行为 |
|---|---|---|
| `wait` 缺失 / 调用报错 | `judge="degraded"` | 基线**在跑** ⇒ 水位线是正面证据 ⇒ 允许；基线**不在跑** ⇒ `stopped:false`（`degraded_no_evidence`） |
| 后者 + `RDDF_SUSPEND_ALLOW_DEGRADED=1` | `judge="degraded-forced"` | 放行 + 落 `event:"suspend_degraded"` |
| `wait` 超时 | `reason:"wait_timeout"` | 不释放（条件 1 是硬前置） |
| `wait` 抛 `NotFound` | — | **视为已停机**（D3/D12），释放 |

`stop_judge` 挂在 **`suspend` 的返回值**上（不污染只读的 `sessions`）。

## 4. `stop_raced`：如实登记，不假装关闭

`claimSlot` 通过后、`prompt` 前仍有窗口（准入在守卫置上**之前**已放行）。释放槽位后**复检**
一次判活，命中即落 `event:"stop_raced"` 并在返回值带 `stop_raced:true`。根治需要把「准入 +
投递」做成不可分割的写侧动作 ⇒ 另立 change。

## 5. AC54 基线

`suspended_at_message_id` 复用**最后一次判活**用到的 messages（`waitStopped` 返回），
**不再**额外整段读一次 `context`（原来那一次读会把释放窗撑大，且窗口随会话长度增长）。

## 6. 测试策略（含变异验证）

| 变异 | 期望 | 实测 |
|---|---|---|
| 去掉「`wait` 必须先 settle」的前置 | AC7(b)/AC8 失败 | ✅ 失败 |
| 去掉 `dispatch` 的早拒 | AC17 **仍通过**（`claimSlot` 锁内重验兜住） | ✅（说明两条路并存） |
| 去掉 `claimSlot` 的锁内重验 | AC9b 失败 | ✅ 失败（该用例为补覆盖缺口而新增） |

⇒ 早拒 + 锁内重验**两条路都有覆盖**；新增的 **AC9b** 专门打「早检查之后、`claimSlot` 之前
置上守卫」的窗口（用 fake ctx 的 `onGet` 钩子在第 2 次 `get` 时注入守卫）。
