# gap 分析记录：P2 两份 improvement（metis）

> 对象：`.rddf/improvements/front-async-resume-guard.md`、`.rddf/improvements/front-stop-confirmation.md`
> 上游决策：`docs/adr/ADR-front-stop-confirmation.md`（Proposed）

## 结论

metis 给 11 条「必须改」+ 8 条「建议改」。**全部采纳**（含对 ADR 的 5 处回改）。

## 对 ADR 的回改（metis 指出 ADR 与 improvement 同时有问题）

| # | 发现 | 处置 |
|---|---|---|
| M4 | `stop_judge` 挂 `sessions` **不可实现**（它是「一次停机尝试的结论」，不是 session 观测属性；`sessions` 明令只读） | ✅ 改为挂 **`suspend` 返回值**，`sessions` 不输出 |
| M5 | S3 不可满足（后继是长任务时 `suspend` 会超时失败，返回早于终态） | ✅ S3 限定「**成功释放**时」；S2 加「`wait` 在 deadline 前 resolve」前提；S4b 改为「失败后错误文案不得再是正在停机」（不要求 dispatch 成功） |
| M6 | 实现约束里「`wait` 必须 `.catch`」与 B3/S6 **冲突**（吞错就分不出 `NotFound`） | ✅ 改为 `w.then(ok, err)` 竞速 + `w.catch` 仅消 unhandled |
| M11 | D5 ③ 声称「关闭」**过强**（`claimSlot` 通过后、`prompt` 前仍可被投递 ⇒ 起后继） | ✅ ③ 改「**缩小**」；新增 ⑥「`claimSlot→prompt` 窗口 = **未关闭**」+ 缓解（释放后复检 ⇒ `event:"stop_raced"`）+ 根治另立 change；S11 加限定 |
| S-5 | ADR S4 写「两个入口」却列了三个 | ✅ 改「三个入口」并点明 `delegate` 的 `excludeSessionID` 陷阱 |
| M10 | `S8` 的「上游源码级顺序断言」属 P2 第 4 项（用户明确排除） | ✅ 降级为「端点缺失自检」；源码级顺序断言登记回 backlog |
| S-4 | `W` 无上界；`W` 极小时 ⑥/⑦ 会被跳过 | ✅ `W = min(RDDF_STOP_TIMEOUT_MS, 60s)`；⑥/⑦ **各自至少判一次** |

## 对两份 improvement 的回改

| # | 发现 | 处置 |
|---|---|---|
| M1 | 「复用同步面 `lastMsg>idle`」**单用不完备**（漏「无新消息的 wake 起的新 execution」）；且引 D4 支持「不加 `busy===0` 前置」是**引用反向**（D4 原文是说 stale-busy 不被兜底覆盖） | ✅ 改为**具名析取谓词** `stillRunning := (busy>0 ∧ (idle=0 ∨ busy>idle)) ∨ (lastMsg>idle)`；列出**四个读者**（`isRunning` / `slotBusyHolders`+`planSlot` / 同步 `delegate` / 异步面）逐条声明改不改；删掉对 D4 的错误引用，改述为「在其之上补更强谓词，需在 design 记录演进」 |
| M2 | 检查点位置与副作用集没写死（`claimSlot` 会把条目覆写成 `dispatching` ⇒ 后端**不可暂停**） | ✅ 落点钉在 `:847` 的 `readSessionInfo` 之后、`:854` vanished 处置之前；判定顺序写死（存在性 → 墓碑 → `goal_key` → 活体 → 停机守卫）；AC 增补「`prompt`/`create` 次数不变、`state`/`last_used_at`/`registered_at` 不变、无 `dispatch_failed` 行、额度不变」 |
| M3 | A2（投递前）与 A3（复用 D2 守卫同处）**物理冲突**（`withLock` 不可 await） | ✅ 改为「**两段一个函数** `preAdmission`」：锁外取活体 + 读标记，锁内只重验标记 |
| M7 | 守卫标记无 owner ⇒ 并发两次 `suspend`，先完成者的 `finally` 会解掉后完成者的守卫 | ✅ **owner token + 引用计数**；新增 X2/X3（并发两次 / 重入） |
| M8 | 同步 `delegate` 的槽位检查会传 `excludeSessionID = resume_session` ⇒ 守卫被绕过 | ✅ 写入 S4 与 X5：「守卫检查不得被该排除项影响」 |
| M9 | 两判据同时命中时优先级/文案未定 ⇒ 模型会在两种指令间循环 | ✅ 定为「停机守卫优先 + 含发起者 id + 不得返回『请先 suspend』」（ADR + 两份 improvement 各一条 AC） |
| S-1 | 测试夹具的 `wait: async () => ({})` 是**死桩**（今天没用它）；`time` 由 `busy` 标志派生，**表达不出 stale-busy** ⇒ S1/S3b/S3c/S5/S6/S7 会假绿 | ✅ 列为 X12「夹具先行」（可控 `wait` 四态 + 可控 stale-busy），并明确「既有单测全绿不能作为回归证据」 |
| S-2/S-3 | 「`W` + 少量往返」「+1.5s」不可判定；自检实现未定 | ✅ 改「`W` + 1s」；L2-20 基线值需落盘后引用；自检写死 `typeof ctx.session.wait === "function"`，4xx 归 `degraded` |
| S-5 | improvement 与 ADR 的判据**逐条重复**（必然再漂） | ✅ improvement 改为「AC 沿用 ADR S1…S11 + 本项新增 X1…X12」，不再抄一遍 |
| S-7 | `snapshotStopBaseline` 加 `messages` 会改**导出类型** | ✅ 写进 Impact（类型变更需同步调用点） |
| S-8 | 两份的接口与规模重复计账 | ✅ 各加「实现顺序 / 接口划分」，规模合并陈述 |

## 未采纳（附理由）

- **E4「跨进程两个 front 双写」**：ADR 风险章 ④ 已认领为「跨实例退化为现状」，improvement 的 X 系列不再重复要求缓解（只要求如实登记）。
- **「同会话并发 resume 串行化」**：属单槽表的既有语义，另立 change（improvement A 的 A6 已如实登记为「不做」）。
