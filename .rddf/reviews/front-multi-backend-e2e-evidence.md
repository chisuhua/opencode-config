# E2E 与时延证据：front-multi-backend（T7.1 / T7.2）

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-10 |
| 执行 | builder |
| 目的 | 关闭 verifier 第 2 轮验收的 4 项**不可判定**项（AC1 的「实际可调用」/ AC11·AC12 真实换代 / AC44 有界时延与 E2E 面 / AC57 的 E2E 面） |
| 外部仓库 | `/workspace/main/rdd-workflow-e2e` |
| E2E commit | **`dc7875c8f814c1ac83bcf0db1d934b95da097665`**（L2-21）+ **`568ef284e78230c5af3ebde711b7ebe40bcac5c3`**（L2-16…L2-20） |
| E2E 结果 | **21 / 21 全绿**（`E2E_REAL_RUNTIME=1 bats tests/integration/test_front_delegate_runtime.bats`，真实模型 + 真实宿主） |
| AC44 时延 | **10 / 10 次在 60s 内完成「投递 → 消费确认」**（中位 0.2s、最大 1.4s）⇒ 判据（≥8/10）**达标** |
| 宿主 | opencode v2.2.5 后台服务（`opencode service restart` 重启以加载新插件代码） |

## 1. 新增 E2E 用例（L2-16…L2-21）

| 用例 | 覆盖 | 断言（结构化事实） |
|---|---|---|
| **L2-16** | 四个新 action 各自独立、只对 front 可见 | `opencode debug agents` 权限矩阵：front 对 `delegate_dispatch`/`delegate_sessions`/`delegate_suspend`/`delegate_cancel` 各有 allow；其它 agent **一条 allow 都不能有** |
| **L2-17** | dispatch 真派发 | 返回含 `session_id` + `state`；`pair.json` 有该条目且含 `work_root`（**等于 fixture 根**）+ `state`；`ledger.jsonl` 有 `event:"dispatched"` 行 |
| **L2-18** | sessions 只读（观测面不污染） | sessions 入参**不得**含任何简报字段（task/goal/scope/acceptance/grants）；**观测面不写 ledger**（ledger 行数仍为 1） |
| **L2-19** | 单槽 | 同一工作树第二个 dispatch 被拒，错误含「已占用」与占槽者 id |
| **L2-20** | suspend 暂停 | 返回 `suspended=true`；`pair.json` 该条目 `state=suspended` |
| **L2-21** | 名册兜底路径（front 换代） | 用**新的** front 会话（无 roster 快路径）查名册，仍能找回旧后端 ⇒ 兜底路径（全库 list + cursor 续扫 + metadata 过滤）有效 |

辅助新增 `l2_tool_calls`（任意 tool 的 `tool_use` 解析）。

## 2. 顺带修的两处**既有**缺陷（非本次新增，但在真实运行中暴露）

| # | 问题 | 影响 | 修法 |
|---|---|---|---|
| 1 | `l2_delegate_calls` / `l2_tool_calls` 的工具级错误提取只认 `{message:…}` 对象，而宿主给的是**字符串** ⇒ 错误文本一直取到 `null` | L2-19 首次运行**误判失败**（实际第二次 dispatch 已被正确拒绝，错误文本是 `后端 ses_…（state=active）已占用该工作树；先 suspend 它再派发`） | 两种形态都取 |
| 2 | L2-10 取**第一次** delegate 调用，而模型偶尔先发一次参数不合法的调用再重试（那次没有 `session_id`） | 用例**随模型行为随机失败** | 新增 `l2_first_ok_field_for_agent`（取首个**成功**调用），L2-10 改用它 |

## 3. AC44 有界时延实测（T7.2）

探针：`/tmp/opencode/probe/ac44-latency.ts`（连续 10 次「投递 → 简报出现在 `session.context()`」）。

```
#1: 1.4s ✅   #2: 0.1s ✅   #3: 0.2s ✅   #4: 0.1s ✅   #5: 0.2s ✅
#6: 0.1s ✅   #7: 0.2s ✅   #8: 0.2s ✅   #9: 0.1s ✅   #10: 0.1s ✅
成功消费 10/10 次；中位 0.2s；最大 1.4s；最小 0.1s
AC44 有界时延：10/10 次在 60s 内消费（判据：≥8/10）✅
```

**口径说明**：测的是 dispatch 的**关键路径下界**（`prompt` → promote）。工具侧另有 `create` 开销与 ≤200ms 的确认轮询粒度 ⇒ 实际 dispatch 返回时延**略高于**本探针数值，但离 60s 阈值有两个数量级裕度。

## 4. verifier 第 2 轮「不可判定项」的关闭情况

| 原不可判定项 | 现状 |
|---|---|
| AC1（四工具「实际可调用」） | ✅ **已关闭**：L2-16（权限矩阵）+ L2-17…L2-20（**真实调用**四个工具） |
| AC11 / AC12（真实 front 换代找回） | ✅ **已关闭**：L2-21（新 front 会话经兜底路径找回旧后端） |
| AC44 有界时延 | ✅ **已关闭**：§3（10/10） |
| AC44 的 E2E 面 / 既有 E2E 回归 | ✅ **已关闭**：21/21 全绿（含 15 条既有用例，**新产物**重跑 ⇒ 新增的槽位检查没破坏既有行为） |
| AC57 的 E2E 面 | ⚠️ 仍是**部分**：单测已覆盖完整往返（含「单步 resume A 必被拒」）；E2E 未覆盖往返序列（额度过省） |

## 5. 残留与如实记录

- **L2-19 的判据依赖模型照做两次 dispatch**：模型若只派一次，用例判「判据未被触发」⇒ FAIL（不是假绿）。
- **L2-18 的「观测面不写 ledger」是**行数**判据**（=1）：若 dispatch 场景本身写了多行，该断言会失效 ⇒ 已用「dispatch 只写一行」的既有事实兜底（L2-11 单独覆盖 ledger 行数与字段）。
- **AC57 的 E2E 面未做**（往返序列需要模型连续 4 次正确编排，成本高）⇒ 保持「部分」。
- E2E 仓库的 `.tmp-l2/` 产物（真实模型输出）**已被 .gitignore 覆盖**，未入库。
