# role-class-rubric-alignment — 能力面判据对齐：空间面（allow 集）+ 内容面（架构内容分流）

> 输入：`.rddf/improvements/`（本轮无新 improvement —— 由 `backend-handoff-role-class` / `resume-precheck-guidance` 的评审遗留 + 本轮对话的实测漂移合并而来）
> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D1–D9，**Accepted**）+ `prompts/build.md` §architect 产出形态契约（落点路由 / 只回答三件事 / 一文档一决策 / 三层分离）
> 性质：**纯 prompts + 守卫测试**，无代码路径改动
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置（`.rddf/state/.arch-handoff.json` / `.rddf/state/.planner-handoff.json`）在本仓均不存在 ⇒ 按工件归属规则第 3 条走**内置流程**（proposal 由 planner 手写；`design.md` / `tasks.md` 由 builder 在实施阶段产出）。
> ⚠ 本 change 改 `prompts/**` ⇒ **治理面** ⇒ oracle → critic 各 1 轮（顺序不可颠倒）。

## Why

「能力面」（`role_class`）的判据现在**手抄 4 份**（lib 1 + plan 1 + build 1 + front 2 行），**没有任何守卫**把 prompt 里的三份钉在代码上。实测已出现**两个方向**的缺口：

### 空间面（谁能写哪些路径）—— 已实测 3 处漂移

| # | 位置 | 现状 | 问题 |
|---|---|---|---|
| 1 | `prompts/plan.md` 选类表 builder 行 | 「简报 `scope`」 | **D3 修订漏改派发侧**：`a537b5d` 只动了 `prompts/build.md`，该行停留在 D3 之前（最后改动 `9663ec5`）⇒ 派发方按 plan.md 会以为 builder 能写 `docs/adr`，而实际窄目标**派发被拒**、宽目标**权限拒** |
| 2 | `prompts/plan.md` + `prompts/front.md` | 「选错类 ⇒ **后端会停下交回**」 | D3 修订后**窄目标下不成立**：`architect + src/**`、`builder + docs/adr` 都是**派发前硬拒**（`assertRoleClassCompatible`，在 `session.create` 之前）⇒ 派发方拿到的是**错误**、不是 HANDOFF。派发侧只被告知了交回这一条路径 |
| 3 | `prompts/plan.md` + `prompts/front.md` | 「⚠ 机制未启用时（派发侧尚未落地 `role_class`）⇒ 该字段会被**忽略**」 | **现在是假的**：机制已落地并归档，该字段不会被忽略、不合法值会抛。`prompts/build.md` 的同款提示是**存量派发**兜底（仍有效），不能一起删 |

### 内容面（谁能定哪些内容）—— 判据只在 architect 侧

用户与 plan 会话讨论架构（设想 / 思路 / 设计 / 需求）时，**分流的判据已经存在但 plan 侧看不到**：

| 位置 | 内容 | plan 可见？ |
|---|---|---|
| `prompts/build.md` §architect 产出形态契约「落点路由」 | 决策与取舍 → ADR；当前态快照 → 架构主题文档；实现步骤 → design.md；可枚举清单 → tasks.md | ❌ |
| 同上「只回答三件事」 | 定什么、为什么这么定、代价是什么 | ❌ |
| 同上「一文档一决策」/「三层分离」 | 一个文档一个决策；推导与证据不进正文 | ❌ |
| `prompts/plan.md` | **只有禁令**「你自己不写 ADR / 验收报告」 | ✅ 但没有「**何时该派 `role_class=architect`**」的判据 |

⇒ 缺口双向：plan 被禁止写 ADR，却不知道何时该派 architect、派时 brief 该带什么 ⇒ 该派不派（架构决策沉在计划里、不落 ADR、不受双审）或乱派（architect 收到没有候选集的任务、重新发明 ⇒ 重复劳动）。

`prompts/front.md` 同样有洞：四分类路由里**没有「架构决策」这一类**（理解性 → 不建 session；实施性 → 才按 `role_class` 选类）⇒ 用户说「帮我设计一下 X 的架构」时，当前文本给不出确定答案。

## What Changes

### A. 共享判据的**真源**（不新建第二份，只指认已有的）

| 面 | 真源 | 谁读 |
|---|---|---|
| 空间面：每类**允许写集** | `lib/delegate-core.ts::classAllowRoots`（代码侧唯一；`builder → []`、`verifier → [".rddf/reviews"]`、`architect → archRoots + .rddf/reviews + .rddf/config/arch-docs.json`） | 代码 + 守卫 |
| 内容面：**架构内容分流** | `prompts/build.md` §architect 产出形态契约 的「落点路由 / 只回答三件事 / 一文档一决策 / 三层分离」（文档侧唯一） | plan / front **按标题名引用**，不复制正文 |

### B. `prompts/plan.md`

1. **选类表 builder 行**改为「简报 `scope` **减去架构文档目录**（窄目标派发被拒；宽 scope 下写 arch 路径被拒）」—— 与 `prompts/build.md` 运行身份表一致。
2. **「选错类」补两种失败形态**：① 窄目标 ⇒ **派发被拒**（`scope` 越界，硬拒发生在建 session 之前）⇒ 改派；② 宽目标 ⇒ 后端写越界路径被**权限拒** ⇒ 后端 `HANDOFF:` 交回 ⇒ 重派。
3. **删「机制未启用」过期降级句**（机制已落地）；保留 `prompts/build.md` 的**存量派发**兜底句（仍有效）。
4. **新增「架构内容分流」小节**：三路（讨论 / 决策 / 实现）+ 三个触发问题（候选是否收敛 / 是否要跨会话生效 / 是「取舍」还是「怎么做」）+ 「派 `role_class=architect` 时 brief 必带 plan 的候选集（architect 不重新发明备选）」+ **按标题名引用** build.md 的「落点路由」（不复制正文）。

### C. `prompts/front.md`

1. §3.1 `role_class` 字段说明：删过期降级句；「填错」补两种失败形态（硬拒 ⇒ 改派 / 权限拒 ⇒ 交回 ⇒ 重派）。
2. 四分类路由**补「架构决策」归属**：架构决策类请求 ⇒ 派 `role_class=architect`（不建 session 的只有「理解性」：只解释、不落盘）。

### D. `tests/config-guards.test.ts` —— 投影守卫（新增 1 个 describe）

- **两份完整表结构一致**：`prompts/plan.md` 选类表 与 `prompts/build.md` 运行身份表 —— 三行齐、builder 行含「减去架构文档目录」、architect 行含 `.rddf/reviews` 与 `arch-docs.json`、verifier 行含「仅」+ `.rddf/reviews`。
- **front.md** 必须出现三个类名与 architect 的落点关键词。
- **两种失败形态**在 plan.md 与 front.md 都可 grep 到（硬拒 / 交回）。
- **过期降级句已删**（plan.md / front.md 负向）+ **存量兜底句仍在**（build.md 正向）。
- **分流小节**存在、三路关键词齐、三个触发问题齐、「brief 必带候选集」在。
- **只引用不复制**：仓内「落点路由」正文**只出现一次**（在 build.md）；plan.md / front.md 只能出现引用。
- **未新增**：反引号 token allowlist 不引入新标识符；`SLOT_STATES` 与 outcome 集合不变。

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | `prompts/plan.md` 选类表与 `prompts/build.md` 运行身份表的 **builder 行一致**（都含「减去架构文档目录」）；两表**三行齐** | 结构 | `tests/config-guards.test.ts` |
| AC2 | 两份完整表的 architect 行含 `.rddf/reviews` + `arch-docs.json`；verifier 行含「仅」+ `.rddf/reviews`；`prompts/front.md` 出现三个类名与 architect 落点关键词 | 结构 | 同上 |
| AC3 | 「选错类」的**两种失败形态**在 plan.md 与 front.md 都写到：① 窄目标 ⇒ **派发被拒**（改派）② 宽目标 ⇒ 权限拒 ⇒ 后端**交回**（重派） | 结构（可 grep） | 同上 |
| AC4 | plan.md / front.md 的「机制未启用」过期句**已删**（负向）；`prompts/build.md` 的**存量派发**兜底句**仍在**（正向） | 结构 | 同上 |
| AC5 | front.md 四分类路由含**架构决策**归属（派 `role_class=architect`）；与 plan.md 的分流判据**同源**（同一组关键词） | 结构 | 同上 |
| AC6 | plan.md 有「架构内容分流」小节，含**三路**（讨论 / 决策 / 实现）、**三个触发问题**（候选收敛 / 跨会话生效 / 取舍还是怎么做）、以及「派 architect 时 brief 必带候选集」 | 结构（可 grep） | 同上 |
| AC7 | 分流小节**只引用不复制**：仓内「落点路由」正文**只出现一次**（在 build.md）；plan.md / front.md 含指向它的引用 | 结构（计数断言） | 同上 |
| AC8 | **未新增**：反引号 token allowlist 不引入新标识符；`SLOT_STATES` 与 outcome 集合不变；无新增状态 / 工具 / outcome | 结构 | 同上 |
| AC9 | 守卫**变红有效性**（实测演练）：改任一 prompt 的 class 表 / 分流小节 ⇒ 对应断言变红 | 手工（有演练记录） | 验收报告 |
| AC10 | 回归：`bun test tests/` 全绿；`scripts/check-upstream-anchors.sh` **无 FAIL**（不写死 23/23） | 结构 | 全量 |
| AC11 | 治理面双审闭合：oracle → critic 各 1 轮（顺序不可颠倒），审稿记录落 `.rddf/reviews/role-class-rubric-alignment-prompt-review.md` | 结构 | 审稿记录 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [x] AC1 两表 builder 行一致 + 三行齐
- [x] AC2 architect / verifier 行一致 + front 含三类名
- [x] AC3 两种失败形态（硬拒 / 交回）双侧齐
- [x] AC4 过期句已删 + 存量兜底句仍在
- [x] AC5 front 架构决策归属 + 与 plan 同源
- [x] AC6 分流小节三路 + 三触发问题 + brief 必带候选集
- [x] AC7 只引用不复制（落点路由正文仅一处）
- [x] AC8 未新增（token allowlist / SLOT_STATES / outcome 集合）
- [x] AC9 变红演练已执行并记录
- [x] AC10 回归绿 + anchors 无 FAIL
- [x] AC11 oracle → critic 双审闭合，审稿记录落盘

## 非目标

- **不改** lib 的 `classAllowRoots` / `assertRoleClassCompatible` / `classPermissions`（本 change 只对齐**文档投影**，不改行为）。
- **不改** `prompts/build.md` 的 §architect 产出形态契约 的判据内容（它是**真源**，只被引用）。
- 不新增工具、状态字段、outcome 值、通知通道。
- 不改 `prompts/front.md` 四分类的其它三类（理解性 / 实施性 / 流程性 / 需裁决）的既有语义。
- 不做「Accepted ADR 描述性措辞判例」规则化（另见 `adr-d5-async-completion-wording` 的 Out of Scope）。

## 影响面与风险

| 面 | 影响 |
|---|---|
| `prompts/plan.md` | 选类表 builder 行 + 选错类两种形态 + 删过期句 + **新增「架构内容分流」小节** |
| `prompts/front.md` | §3.1 字段说明（两种形态 + 删过期句）+ 四分类**补架构决策归属** |
| `prompts/build.md` | **不改**（落点路由是真源，只被引用） |
| `tests/config-guards.test.ts` | 新增 1 个 describe（结构判据，含负向与计数断言） |
| 行为 | 派发侧不再按旧口径选类；架构讨论有了明确的三路分流；front 对「设计架构」类请求有了确定出口 |
| 代价 | 派发侧多一次分流判断（只读判断，无额外调用） |
| 风险 | ① 分流小节与 build.md 的落点路由**措辞漂移** ⇒ 守卫用「只引用不复制 + 三路关键词」双夹 ② 守卫把**结构**钉住但**路径全集**钉不住（`archRoots` 是运行期按工程根算的，prompt 只能写抽象名「架构文档目录」）⇒ 覆盖边界必须在守卫注释里写明，不得宣称完备 |

## 依赖与顺序

1. 依赖 `backend-handoff-role-class`（已归档，D3 修订）与 `resume-precheck-guidance`（已归档，引用改写手法）。
2. 顺序：B（plan.md 四处）⇒ C（front.md 两处）⇒ D（守卫）⇒ 回归 ⇒ oracle → critic。
3. 与已立项的三个 change 并列，无冲突（不同文件面：`delegated-verifier-evidence-gap` 改 `prompts/build.md`；本 change **不改** build.md 的判据内容）。
