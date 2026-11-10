# 验收报告：front-async-resume-guard

> **验收者**：verifier（只验不改）。**判据来源**：① 用户本次要求（验收本 change，AC1–AC14）；② `openspec/changes/archive/2026-11-10-front-async-resume-guard/proposal.md` 的 `## 验收标准`（AC1–AC14）；③ `design.md` 的落点/顺序声明。
> **分流**：`rdd-verifier` skill 可加载，但 **P3 archive gate 未触发**（无 `.rddf/state/iteration.json`；`rddf rdd-verify --dry-run` → "No eligible changes"）⇒ 走**本地 1–5 步**。

## 1. 静态检查

| 项 | 结果 |
|---|---|
| `lib/delegate-async.ts` / `lib/delegate-core.ts` | ✅ **零新增错误**。现存 6 条（`TS7006`×4 + `TS2345`×2）经比对 **HEAD 版本同样 6 条**（行号仅位移）⇒ 既有问题（`lib/delegate-core.ts` 的 `.map` 隐式 any 与 `registerSession` 的 `string｜undefined`），**非本 change 引入** |
| 遗留清扫 | ✅ 0 遗留（无 TODO/调试残留/`.only`/`.skip`） |

## 2. 单元测试

✅ **247 pass / 0 fail**（1040 expect）；本 change 的 8 条用例单独跑亦全绿。

## 3. 集成 / E2E（真跑）

| 用例 | 结果 | 说明 |
|---|---|---|
| L2-3（同步 `delegate` 真落文件） | ✅ | 同步面未被改坏 |
| L2-8（续接不新建） | ✅ | resume 正常路径 |
| L2-17（`dispatch` 真派发） | ✅ | dispatch 正常路径 |
| **L2-23（运行中 resume 被拒，本 change 新增）** | ✅ | **verifier 实跑**；错误文案精确命中「无法向运行中的后端 … 追加简报」，且 fixture 的 `dispatched` 行仍为 **1** |
| L2-19（单槽） | ⚠️ **批内失败 / 单独跑通过** | 见下「发现 1」 |

**发现 1（测试卫生，非实现回归）**：L2-19 在批内运行 3 次失败，逐次定位为：

| 次 | 失败原因（工具证据） |
|---|---|
| 1 | 两次 `dispatch` 间隔 **35s**，第一个后端已自然跑完（fixture `pair.json` 显示 `slot-one=idle`）⇒ 按 D6.2「拒绝只针对 reconcile 之后仍然活跃的槽位」，第二次放行是**正确行为** |
| 2 | 全局上限 `4/3`（上轮残留 4 个 delegated 后端，诊断信息列出了 id 与 workRoot） |
| 3 | 全局上限 `3/3`（批内前面场景的后端 + 本场景第一个后端） |

清干净环境后**单独跑 L2-19 通过**。⇒ 判定：**L2-19 依赖「批内清理 + 模型延迟」，与本 change 无关**（本 change 只把占用判据**收紧**，不可能导致「本该拒的被放行」）。
**路由**：builder —— L2-19 应在第二次 `dispatch` 前断言「第一个后端仍在跑」，否则该用例的时序假设不成立（记 SHOULD_FIX，不阻断本 change）。

## 4. 边界与错误路径（**独立脚本**，不复用 `tests/` 夹具）

脚本 `/tmp/opencode/probe/verify-resume-guard.ts`（自建 fake ctx + 临时 git 仓库）：**18 PASS / 0 FAIL**。

| 组 | 覆盖 |
|---|---|
| 谓词形态 7 条 | `busy>idle` / `busy>0` 且 `idle` 未定义 / `busy=0` + 新消息 / **stale-busy + 新消息** / stale-busy 无消息 / 全空闲 / 无 `time` 字段 |
| 拒绝与副作用 7 条 | 在跑 ⇒ 拒（文案命中）｜**不投递简报**｜**不建 session**｜`pair.state` **未被覆写成 `dispatching`**｜`registered_at` 不变｜ledger 不新增行｜全局额度不变 |
| 其它 4 条 | 空闲 ⇒ 复用同一 `session_id`｜`dispatching` ⇒ 拒（指向 `cancel`）｜`tombstone` ⇒ 「已终止」（不被活体抢先）｜读失败 ⇒ 拒（「无法确认」） |

## 5. 逐条 AC 判定

| AC | 判定 | 证据 |
|---|---|---|
| AC1 三准入读者对 stale-busy 一致 | ✅ | 单测（`planSlot`/`slotBusyHolders`/`dispatch`）+ 独立脚本 |
| AC2 负向：stale-busy + 新消息 ⇒ 在跑 | ✅ | 单测 + 脚本 |
| AC3 负向：`busy>idle` 无新消息 ⇒ 在跑 | ✅ | 单测 + 脚本 |
| AC4 同步 `delegate` 四条行为不变 | ✅ | 既有用例全绿（L2-3 亦绿） |
| AC5 在跑 ⇒ 拒 + **零副作用** | ✅ | 单测 + **独立脚本 7 条**（含 `pair.state` 不得被覆写） |
| AC6 空闲 ⇒ 放行 | ✅ | 单测 + 脚本 |
| AC7 读失败 ⇒ 拒 | ✅ | 单测 + 脚本 |
| AC8 已删 ⇒ D12 不回退 | ✅ | 既有 D12 用例全绿 |
| AC9 交叉优先级（与停机守卫） | ⛔ **blocked** | 依赖 `front-stop-confirmation` 的守卫（未实施）；tasks.md 已标 |
| AC10 `delegate` 入口不被 `excludeSessionID` 排除 | ⛔ **blocked** | 同上 |
| AC11 `dispatching` ⇒ 拒 | ✅ | 单测 + 脚本 |
| AC12 `tombstone` 文案不被抢先 | ✅ | 单测 + 脚本 |
| AC13 E2E 运行中 resume 被拒 + 无 `dispatched` 行 | ✅ | **L2-23 verifier 实跑** |
| AC14 展示口径不变 | ✅ | 单测（`sessions` 对 stale-busy 仍报非 running） |

## 6. 结论

**PASS（12/12 可判定 AC；AC9/AC10 blocked，依赖另一 change）。**

- 实现与 proposal/design 一致；拒绝**零副作用**经独立脚本逐项验证（这是本 change 最容易被做错的地方）。
- 一项**测试卫生**问题（L2-19 时序/全局上限脆弱）路由给 builder，**不构成实现缺口**。
- 已用轮次：本 change 第 1 轮 verifier 验收。
