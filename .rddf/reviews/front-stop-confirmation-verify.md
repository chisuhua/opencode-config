# 验收报告：front-stop-confirmation

> **验收者**：verifier（只验不改）。**判据来源**：① 用户要求（按契约验收本 change）；② `proposal.md` 的 AC1–AC18（其中 AC1–AC9 沿用 ADR Verification S1–S11）；③ `design.md` 的实现口径。
> **分流**：`rdd-verifier` skill 可加载，但 **P3 archive gate 未触发**（无 `iteration.json`；`rddf rdd-verify --dry-run` → 空队列）⇒ 本地 1–5 步。

## 1. 静态（含逐条读代码，不只信测试）

| 检查 | 结果 |
|---|---|
| `tsc`（两个改动文件） | ✅ **0 条新错误**（既有 TS7006/TS2345 未变） |
| `wait` 竞速写法 | ✅ `:388` `w.catch(() => {})`（仅消 unhandled）+ `:390` 竞速用 `w.then(ok, err)` —— **没有吞错**，因此 `:402` 的 `isSessionMissingError(waitErr)`（D3）能生效 |
| 退化分支 | ✅ `:409` `if (!baseline.running) return degraded_no_evidence`；`:1504` 只有显式赎回才放行并置 `degraded-forced` |
| 守卫引用计数 | ✅ `leaveStopGuard` 按 **token** 过滤（`:290`），最后一个删完才移除键；`enterStopGuard` 每次发唯一 token |
| 守卫落点（三条路） | ✅ `claimSlot` **锁内**重验（`:565`）+ `dispatch` 早拒（`:937`）+ 同步 `delegate` 入口（`delegate-core.ts:1051`，在 `slotBusyHolders` 之前 ⇒ **不受 `excludeSessionID` 影响**） |
| 守卫不落盘 | ✅ `lib/` 内**无** `suspending`/中间态字符串；`pair.json` 只有五值枚举 |
| 留痕 | ✅ `suspend_degraded`（`:1510`）/ `stop_raced`（`:1569`） |
| `stop_judge` 载体 | ✅ 只出现在 `suspend` 的两条返回路径（`:1534` 失败 / `:1591` 成功），**未进 `sessions`** |
| 测试钩子 | ✅ `__pendingStops` 仅 lib 定义 + tests 使用（生产无依赖） |

## 2. 单元测试

✅ **259 pass / 0 fail**（1084 expect）；本 change 区域（停机确认 + 锁内重验）12 条单独跑亦全绿。

## 3. 集成 / E2E（verifier 实跑，干净环境）

| 用例 | 结果 |
|---|---|
| L2-19（单槽） | ✅ |
| L2-20（suspend 释放槽位 + `state=suspended`） | ✅ |
| L2-22（往返切换，A 同一 `session_id`） | ✅ |
| L2-23（运行中 resume 被拒） | ✅ |

## 4. 边界与错误路径（**独立脚本**，不复用 `tests/` 夹具）

`/tmp/opencode/probe/verify-stop-confirmation.ts`：**23 PASS / 0 FAIL**。

| 组 | 覆盖 |
|---|---|
| W 钳制 2 条 | 默认 8s / 上界 60s |
| `waitStopped` 8 条 | 空闲+wait ⇒ 停机｜在跑+水位线不动 ⇒ 不停机｜在跑+前移 ⇒ 停机｜退化+空闲 ⇒ 不停机｜退化+在跑+前移 ⇒ 停机｜`NotFound` ⇒ 停机｜其它错误+空闲 ⇒ 不停机｜超时 ⇒ 不停机 |
| 守卫 3 条 | 两条 owner 并存｜删一条另一条仍在（引用计数）｜全删后为空 |
| 端到端 10 条 | 空闲 suspend ⇒ `suspended:true`+`stop_judge:wait`｜`pair.state=suspended`｜守卫已清｜**释放后立即 resume 成功**｜守卫期 dispatch 被拒（含发起者）｜文案**不含**「请先 suspend」｜`dispatched` 行仍为 1｜`allowDegradedSuspend` 读环境变量｜强开 ⇒ `degraded-forced`｜落 `suspend_degraded` 行 |

## 5. 遗留清扫

✅ 0 遗留（无 TODO/调试残留/`.only`/`.skip`）；`tasks.md` 无未完成项。

## 6. 逐条 AC 判定

| AC | 判定 | 证据 |
|---|---|---|
| AC1（`wait` 不返回 ⇒ 不释放，stale-busy 也被拦） | ✅ | 单测 + 脚本 |
| AC2（`wait` 覆盖 cleanup：返回 ≥ resolve） | ✅ | 单测 AC3 用例（`wait` 延迟 300ms） |
| AC3（成功释放时返回 ≥ 后继终态时刻） | ✅ | 单测（`idleAt` 时间戳比较） |
| AC4（判活恒真 ⇒ 不释放） | ✅ | 单测 + 脚本 |
| AC5（三入口在停机窗口内均拒；`delegate` 不被 `excludeSessionID` 排除） | ✅ | 代码 `:565`/`:937`/`core:1051` + 脚本（dispatch 入口）；`delegate` 路径由代码位置保证（早于 `slotBusyHolders`） |
| AC6（守卫清理三路 + 无中间态） | ✅ | 单测 AC14/AC16 + 脚本（引用计数） |
| AC7（`NotFound` ⇒ 释放；其它 ⇒ 不释放） | ✅ | 单测 + 脚本 |
| AC8（退化三分支 + 三值 + 留痕） | ✅ | 单测 + 脚本 |
| AC9（端点缺失/4xx ⇒ degraded；有界；E2E） | ✅ | 脚本（缺失 ⇒ degraded）+ 单测（钳制）+ E2E 4/4 |
| AC10（释放后立即 resume） | ✅ | 单测 + **脚本** |
| AC11（并发两次 suspend 互不清守卫） | ✅ | 单测（owners=2）+ 脚本（引用计数） |
| AC12（夹具先行） | ✅ | 夹具已扩（可控 `wait`/`noWait`/`onGet`/`calls`） |
| AC13（不额外整段读 context） | ✅ | 代码：`suspended_at_message_id` 取自 `outcome.messages`（`waitStopped` 最后一次判活） |
| AC14（守卫可观测） | ✅ | `__pendingStops` 单测 + 脚本 |
| AC15（`prompts/front.md` 文案） | ✅ | 单测 grep 断言 |
| AC16（重启无死槽） | ✅ | 守卫不落盘（代码 + `pair.json` 断言）+ 脚本 |
| AC17（交叉优先级文案） | ✅ | 单测 + 脚本（含「不得含『请先 suspend』」） |
| AC18（W 钳制 + 极小 W 仍成功） | ✅ | 单测 + 脚本 |

## 7. 结论

**PASS（18/18）。** 判据、退化、守卫、留痕均与 ADR/proposal/design 一致；关键实现细节（`then/catch` 分叉、token 引用计数、三条准入口、不落盘）经**读代码**确认，非仅依赖测试。

**遗留（已登记，不阻断）**：跨实例下 `wait` 归零 ⇒ 退化为现状判据（ADR 风险章 ④）；`claimSlot→prompt` 窗口由 `stop_raced` 留痕、根治另立 change。
**已用轮次**：本 change 第 1 轮 verifier 验收。
