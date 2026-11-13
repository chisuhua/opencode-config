# backend-handoff-role-class — 设计（实现落点与决策映射）

> 本文件是**实现侧设计**（落点 / 顺序 / 风险），不是决策本身。
> 决策真源：`docs/adr/ADR-backend-handoff-role-class.md`（**Accepted**，D1–D9）。
> 架构视图：`docs/backend-handoff-role-class.md`（3.1 权限表 + fallback 目录集 + 失败模式）。
> 逐条判据真源：`proposal.md` 的「验收标准」表（AC1–AC31）。

## 1. 目标与非目标

| | |
|---|---|
| 目标 | 派发契约显式化：派发方声明本次后端的**能力类**（`role_class`），后端只做本类工作；越类必须交回主会话 |
| 非目标 | ① 不做并行派发（单槽不豁免，D9）② 不改 ADR 决策内容（只允许 architect 类在受限条件下转 Status）③ 不新增状态字段 / outcome 值（AC23）④ 不为 HANDOFF 文本建解析器 |

## 2. 决策 → 落点映射

| 决策 | 语义（一句话） | 实现落点 |
|---|---|---|
| D1 | `role_class` 是派发参数，缺省 `builder`；`null`/`""`/非法值抛 | `lib/delegate-core.ts` → `validateBrief` / `parseRoleClass` |
| D2 | 落点是**独立字段** `role_class`，`current_role` 恒 `builder` | `lib/delegate-core.ts` → `registerSession`（写 `role.json` 的 `sessions` 分区 + `pair.json`） |
| D3 | 三类的 edit 边界（**修订后为两级规则**，见 §3） | `lib/delegate-core.ts` → `archRoots` / `archBoundary` / `archDenyRules` / `assertRoleClassCompatible` / `classPermissions` |
| D4 | `subagent` 统一白名单 `{explore, librarian, oracle, metis, critic}` | `lib/delegate-core.ts` → `classSubagentRules`（`general` / `context-builder` 不在内） |
| D5 | handoff = 自然结束；凭据唯一权威 | `lib/delegate-core.ts` → `buildBrief`（5 项模板 + `rddf feedback add` 命令 + 首行指令） |
| D6 | resume 的 scope 与 class 都不可漂移 | `lib/delegate-core.ts` → `assertResumeRoleClass`（登记值为权威） |
| D7 | architect 类**可有条件**转 ADR Status（双审闭合 + 完成标志 5 条） | 治理面文本：`prompts/build.md` §architect 产出形态契约 + §被派发后端的运行身份 |
| D8 | 校验分两层，**硬拒早于建 session** | `lib/delegate-core.ts` → `assertRoleClassCompatible`（在 `session.create` / `registerSession` 之前） |
| D9 | 单槽不豁免，不做并行 | 既有 `lib/delegate-async.ts` 槽位逻辑，本 change 未放宽 |

异步链路（`dispatch` / `sessions` / `suspend` / `cancel` / `vanished`）共用同一份 class 判定，落点 `lib/delegate-async.ts`。

## 3. D3 修订：builder 上限 = `scope − archRoots`（两级规则）

原口径「builder 上限 = `scope`」是**恒真式**（类约束对 builder 真空）——live e2e 实证：Tier-2 真实派发下后端照改 ADR
（`changed_files=["docs/adr/ADR-demo.md","src/app.ts"]`，无 HANDOFF / 无 feedback），已记 `feedback-20261113-001`（kind `ac-fail`）。

修订后：

| 目标形态 | 判定 | 落点 |
|---|---|---|
| scope **落在** arch root 内（含混合 / 穿越 / 绝对路径 / 软链两方向，按 realpath 判） | **派发被拒**，报错指名 `architect` 类 | `assertRoleClassCompatible`（builder 分支 ①） |
| scope 是 arch root 的**祖先**（`.` / `docs`） | 放行；权限**数组末尾**追加 `<root>` + `<root>/*` 的 `edit deny` | `classPermissions`（末尾 deny，`findLast` 压过 allow；`write`/`patch` 同 action；`grants` 不可 grant `edit`） |
| arch 目录为空 | 类边界不存在（减法退化为空集，不追加 deny） | 同上 |

`archRoots` 的 fallback = **闭合清单** `ARCH_FALLBACK_DIRS`（8 项，与 `prompts/build.md` §架构文档范围 的目录集逐项一致，
由 `tests/config-guards.test.ts` 从该段**动态抽取**比对，防两份定义漂移）。

## 4. 实施顺序（已完成的真实顺序）

1. `prompts/` 治理面文本先行（带「机制未启用」窗口）→ A（lib 校验 + 权限）→ B（工具入参 + 登记 + 异步回显）→ C（收尾 prompt）。
2. D3 修订（builder 两级规则）在 A 之后追加：ADR → 设计文档 → `prompts/build.md` → proposal AC24–AC31 → lib → 测试。
3. 治理面每轮改动走 **oracle → critic**（顺序不可颠倒）；critic BLOCKER 全闭后方可继续。

## 5. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| 权限 deny 误伤正常改动（`docs/adr2` 之类兄弟目录） | 负向用例钉住：按**路径段**判边界（`isPathWithin`），`docs/adr2` 不在 `docs/adr` 内 | 撤销 `classPermissions` 末尾追加的 deny 段（单点） |
| 窄目标拒派发挡住合法窄任务 | 报错指名 `architect` 类 ⇒ 派发方可改派 | 放宽 builder 分支 ① 的判定 |
| `grants` 试图抵消 deny | `GRANT_FORBIDDEN` 含 `edit`/`write`；有单测钉住 | — |
| 后端自审自批（审查者不可用时） | `prompts/build.md` 降级例外（2026-11-13 修复）+ `config-guards` 守卫 | 见该 commit `277c206` |

## 6. 证据入口

| 判据 | 证据 |
|---|---|
| AC1–AC12 / AC15–AC20 / AC22–AC31 | `tests/delegate-core.test.ts` / `tests/delegate-async.test.ts` / `tests/delegate-tool.test.ts` / `tests/config-guards.test.ts` |
| AC13 / AC14 / AC21（手工 e2e） | `rdd-workflow-e2e` 仓 `tests/integration/test_role_class_runtime.bats`（RC-1…RC-4，commit `5b37903`） |
| 治理面评审轨迹 | `.rddf/reviews/backend-handoff-role-class-prompt-review.md` / `adr-backend-handoff-role-class-review.md` |
| 验收报告 | `.rddf/reviews/backend-handoff-role-class-verify.md` |
