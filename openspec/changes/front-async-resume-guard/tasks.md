# tasks — front-async-resume-guard

> 来源：`openspec/changes/front-async-resume-guard/proposal.md`（AC1–AC14）
> 顺序按「夹具先行」：先让测试能表达 `busy < idle`，否则 AC2/AC3 无法被测。

| # | 任务 | AC | 状态 |
|---|---|---|---|
| T1 | **夹具改造**：fake ctx 支持「显式 `time`」（能表达 `busy < idle` 且仍在跑）与「消息时间可控」；`wait` 扩为可控占位（供后续 `front-stop-confirmation` 复用） | AC2/AC3 前置 | ✅ 夹具扩 `s.time` 显式覆盖（能表达 `busy < idle`）；`wait` 扩展留给 `front-stop-confirmation`（X12） |
| T2 | 新增 **`stillRunning(info, messages?)`** 具名析取谓词（`(busy>0 ∧ (idle=0 ∨ busy>idle)) ∨ (lastMsg > idle)`），`delegate-core` 导出 | AC1–AC3 | ✅ `stillRunning`（`delegate-core`，导出；含「两支都不可省」的注释） |
| T3 | `slotBusyHolders` 补 `messages` 并用 `stillRunning` | AC1 | ✅ `slotBusyHolders` 补 `messages` + `stillRunning` |
| T4 | `planSlot` 的 `busyOf` 补 `messages` 并用 `stillRunning` | AC1 | ✅ `planSlot.busyOf` 补 `messages` + `stillRunning` |
| T5 | 同步 `delegate` 的 in-flight 判据改为 `stillRunning(before, beforeMessages)` | AC1/AC4 | ✅ 同步 `delegate` 改用 `stillRunning(before, beforeMessages)`（局部变量 `stillRunning` 改名 `runStillRunning` 避遮蔽） |
| T6 | `dispatch` 的 resume 分支新增活体检查（`readSessionInfo` 之后、vanished 处置之后；`dispatching` 文案单列；`tombstone` 保持在最前） | AC5–AC8/AC11/AC12 | ✅ `dispatch` resume 分支：`dispatching` 拒绝 + 活体拒绝（在 create/墓碑/上限之前 ⇒ 零副作用） |
| T7 | 单测：表驱动四读者一致（AC1）+ 两条负向（AC2/AC3）+ 同步 `delegate` 四条回归（AC4） | AC1–AC4 | ✅ 表驱动 + 两条负向 + 既有 `delegate` 回归全绿 |
| T8 | 单测：拒绝零副作用（`prompt`/`create` 计数、`state`/`last_used_at`/`registered_at`、无 ledger 行、额度不变）+ 空闲放行逐字段一致 | AC5/AC6 | ✅ 零副作用（prompt/create 计数、pair 三字段、ledger 行、额度）+ 空闲放行 |
| T9 | 单测：读失败拒绝 / 已删走 D12 / `dispatching` 拒绝 / `tombstone` 文案不被抢先 | AC7/AC8/AC11/AC12 | ✅ 读失败拒 / 已删走 D12（既有用例）/ `dispatching` 拒 / `tombstone` 文案不被抢先 |
| T10 | 单测：`sessions` 的 `running` 展示不变（`isRunning` 未改的直接证据） | AC14 | ✅ `sessions` 对 stale-busy 仍报非 running（`isRunning` 未改） |
| T11 | E2E：真实运行中 `dispatch(resume=X)` 被拒 + 无新增 `dispatched` 行 | AC13 | ✅ E2E **L2-23** 绿（证据：错误文案命中守卫、ledger 的 `dispatched` 行仍为 1） |
| T12 | 静态：`bunx tsc --noEmit` 零真错误；`bun test tests/` 全绿 | — | ✅ `tsc` 零新错误（`delegate-core` 6 条为既有 TS7006/TS2345）；`bun test` **247 pass**；E2E **24/24** |

## 原先的阻塞项（已解除）

| # | 说明 |
|---|---|
| AC9 | ✅ **已由 `front-stop-confirmation` 覆盖**：`tests/delegate-async.test.ts` 的「AC17 交叉优先级：停机守卫优先于活体判定，文案不得含『请先 suspend』」 |
| AC10 | ✅ **已补测**：`tests/delegate-tool.test.ts` 的「AC10 同步 delegate：该工作树正在停机 ⇒ 拒绝（即便 resume 目标正是被停机者）」+ 反向用例（守卫清掉后恢复）；**变异验证**：去掉 `delegate` 入口守卫 ⇒ 该用例失败 |

## 不在本 change

- 同会话并发 resume 的串行化（单槽表既有语义，proposal 已如实登记）
- 跨实例
- `/404/` 宽判、上游行号漂移（CHANGELOG 的 backlog）
