# delegated-verifier-evidence-gap — 被派发 verifier 类的「无法取证」交回分支 + 降级例外的逐类后果

> 输入：`.rddf/improvements/delegated-verifier-evidence-gap.md`（5 段草稿，metis 1 轮审后修订）
> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D5 handoff 形态，**Accepted**）
> 来源：`backend-handoff-role-class` 的 prompt 评审（oracle 第 4 条 finding + critic NIT 1）
> 性质：**纯 prompts + 守卫测试**，无代码路径改动
> planner 审查：metis 1 轮（`.rddf/reviews/delegated-verifier-evidence-gap-planner-review.md`）
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：二者的 canonical 前置（`.rddf/state/.arch-handoff.json` / `.rddf/state/.planner-handoff.json`）在本仓均不存在 ⇒ 按工件归属规则第 3 条走**内置流程**（本 proposal 由 planner 手写；`design.md` / `tasks.md` 由 builder 在实施阶段产出）。

## Why

被派发后端的「无人值守 ⇒ 不得自审自批」规则目前只覆盖 `architect` 一类，另留两个缺口：

1. **`verifier` 类无「无法取证 ⇒ 交回」的分支** ⇒ 无人值守 + 可写产出 = **可伪造 pass 证据**。
   机制事实：交付面证据判据是 `summarizeDelivery` 里的
   `(final_is_role_opening || model_switched) && write_tool_calls === 0 && artifacts === 0`
   （`lib/delegate-core.ts`）。verifier 落一份报告 ⇒ `write_tool_calls ≥ 1`、`artifacts ≥ 1`
   ⇒ 该判据**恒为 false** ⇒ 「写一份无证据的 pass 报告」在**机器侧不会被抓**。
   `prompts/build.md` §verifier 产出契约 的「0 工具调用就判 pass = 假阳性，判定作废」是**文本禁令、无执行点**，且**未规定「作废之后往哪走」** —— 缺的正是这个分支。
2. **`prompts/build.md:482` 的降级例外是全类断言、只写了 `architect` 的后果**：「被派发的后端不适用本降级」适用于全部后端，但后续只给 `architect` 类的 `HANDOFF: blocked`；`builder` / `verifier` 遇审查者不可用时该做什么**没写** ⇒ 断言了「禁止」，没写「该做什么」（悬空读法）。

**边界澄清**（避免过度收紧）：`builder` 类**不存在**同类 subagent 缺口 —— 其逐 change 验收审查者是 **verifier（角色内建，非 subagent）**，且 `builder` 的自查走 `shell`（不受 subagent 约束）⇒ 「subagent 不可用」对 builder 不构成受阻；`verifier` 的 `explore` 仅用于定位（主会话「不必委托」口径下可自读降级）⇒ 二者**不因 `subagent` 不可用而受阻**。真正需要补分支的只有**「本类有强制 subagent 审查者且该审查者不可用」**这一形态。

## What Changes

### A. `prompts/build.md` §verifier 产出契约 —— 增「取证不可用 ⇒ 交回」分支

**只补「作废之后往哪走」，不改既有判据来源与证据要求**（避免第二套标准）：

> 任一判据的取证**不可用** ⇒ **整份判定不得判 pass**，也不得只按已取证部分下结论。
>
> 判据：**同一取证命令在不含本 change 的基线上也失败或无法运行** ⇒ 取证不可用（`blocked`）；仅在本 change 上失败 ⇒ 这是**判据不通过**的证据（`ac-fail`），不得记为取证不可用。基线取不含本 change 的 HEAD（worktree 场景用同一 canonical root 的基线提交）。
>
> kind 优先级：① 已有带证据的判据不通过 ⇒ `ac-fail`（body 第 ④ 项写明剩余哪些判据无法取证）；② 无任何判据可判定 ⇒ `blocked`。
>
> 两种情况都**不落** `.rddf/reviews/` 报告（受阻即不得收口），已取得的证据写进 feedback 5 项正文的第 ④ 项。
>
> 瞬态失败（网络抖动）**不重试**，一次即交回（对齐「审查调用失败不重试」）。

### B. `prompts/build.md` §审查配对 例外段 —— 逐类后果只在一处定义

例外段改为**只做指针**（不复述逐类后果 ⇒ 不产生第二套判据）：

> ⚠ **例外：被派发的后端不适用本降级**。后端无人值守，自检即自审自批。逐类后果**只在「被派发后端的运行身份与交回契约」定义**（本节不复述）：`architect` 类（oracle→critic 强制）与 `builder` 类的**架构面 critic 行**遇审查者不可用 ⇒ `HANDOFF: blocked`；`builder` 的逐 change 验收审查者是 verifier（角色内建，非 subagent）、`verifier` 的 `explore` 仅用于定位（可自读降级）⇒ 二者不因 `subagent` 不可用而受阻。受阻时**不得完成任何收口动作**。本节第 1–3 条只适用于**主会话**。

### C. `tests/config-guards.test.ts` —— 投影守卫（新增 1 个 describe）

- **逐类共现**：例外段内每个类名与 `HANDOFF: blocked` **同一行**共现（不是 section 级 `toContain`，否则只写 architect 也过）；例外段含「逐类后果只在…定义」的指针句。
- **HANDOFF 允许 kind 集合** == `{needs-revision, ac-fail, blocked}`，从 §HANDOFF 契约**动态抽取**（不硬编码第二份真源）。
- **未新增**三判据：① `git diff --stat` 白名单（只 `prompts/build.md` + `tests/config-guards.test.ts`）；② 反引号 token allowlist（复用既有形态）；③ `SLOT_STATES` 与 `prompts/front.md` 动态抽取的 outcome 集合不变。
- **负向**：新段不得把 `explore` 与 `blocked` 同行（防把可降级项列为受阻）；既有三条防回归断言必须保留。

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | §verifier 产出契约含「取证不可用 ⇒ `HANDOFF: blocked`，不得判 pass」句，**且**含基线对照表述 | 结构（可 grep：含「基线」「任一判据」「不落」） | `tests/config-guards.test.ts` |
| AC2 | 降级例外段**逐类共现**：每个类名与 `HANDOFF: blocked` **同行**；且含「逐类后果只在…定义」指针句 | 结构 | 同上 |
| AC3 | HANDOFF 允许 kind 集合 == `{needs-revision, ac-fail, blocked}`（**从 §HANDOFF 契约动态抽取**比对，不硬编码） | 结构 | 同上 |
| AC4 | 负向：新段不得有 `explore` 与 `blocked` 同行；既有三条防回归断言仍在 | 结构 | 同上 |
| AC5 | 未新增三判据：diff 白名单 + 反引号 token allowlist + `SLOT_STATES` / outcome 集合不变 | 结构 | 同上 |
| AC6 | 回归：`bun test tests/` 全绿；`scripts/check-upstream-anchors.sh` **退出码 0**（**不写死 23/23**） | 结构 | 全量 |
| AC7 | 手工：verifier 类「测试跑不起来」fixture ⇒ 交回而非判 pass ⇒ **回放记录**（输入命令 + 输出首行 `HANDOFF: blocked` + 5 项）落 `.rddf/reviews/<change>-acceptance.md` | 手工（不进 CI，但**有载体可 grep**） | 验收报告 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [ ] AC1 取证不可用 ⇒ 交回 + 基线对照句
- [ ] AC2 逐类共现 + 指针句
- [ ] AC3 kind 集合动态抽取一致
- [ ] AC4 负向：`explore` 不与 `blocked` 同行；既有三条断言保留
- [ ] AC5 未新增三判据
- [ ] AC6 回归绿 + anchors 退出码 0
- [ ] AC7（手工）回放记录落盘

## 非目标

- 不新增工具、状态字段、outcome 值、通知通道（沿用既有 HANDOFF 契约；HANDOFF kind 集合不变）。
- 不改 §verifier 产出契约的**判据来源与证据要求**（只补「作废之后往哪走」）。
- 不改 verifier 类的 `edit` 边界、subagent 白名单、架构类的双审收口流程。
- ⚠ **不变式声明（防高估收益）**：本 change **不加机读校验**，「报告里是否真有证据」仍靠 prompt + 人工 ⇒ **伪造 pass 的机器面不变**（`no_work_evidence` 仍不覆盖「有写盘但无证据」）。

## Out of Scope（相邻缺口，登记为 backlog，本 change 不做）

| 缺口 | 为什么不在本 change |
|---|---|
| `verifier` 类命中 `rdd-verifier` 分流三条件时要写 `.rddf/state/verifier/<change>.json`，而 verifier 类的写集只有 `.rddf/reviews/**` ⇒ 越类；且 `shell` 不受类约束（存在重定向绕过路径） | 属**产品侧 skill 与类写集的对齐**，不是 prompt 措辞问题 |
| `builder` 类能否落 §审查配对「架构面 critic」的产出去向 `.rddf/reviews/`（builder 写集未含该目录） | 属**类写集设计**，改动面是权限面（`classPermissions`） |

## 影响面与风险

| 面 | 影响 |
|---|---|
| `prompts/build.md` | §verifier 产出契约 +1 段；§审查配对 例外段改为逐类指针（**改的是本节自身 ⇒ 自指审查**） |
| `tests/config-guards.test.ts` | 新增 1 个 describe（结构判据，含负向断言） |
| 行为 | verifier 后端在取证不可用时交回主会话，不再「无证据判 pass」；受阻时不落报告 |
| 代价 | 一次交回往返（`rddf feedback add` + 读回） |
| 风险 | verifier 类交回变多 ⇒ 主会话须区分「受阻」与「不通过」。**未覆盖**：现有证据优先级（`prompts/plan.md`「交回后的收尾三问」）只解决「读哪条证据」，**不解决分类** ⇒ 分类靠 feedback 5 项正文第 ③ 项的必填措辞（「阻塞类型：取证不可用 / 判据不通过」），该措辞在本 change 的文本里固定 |

## 依赖与顺序

1. 依赖 `backend-handoff-role-class`（已归档）与 `resume-precheck-guidance`（已归档）的 HANDOFF 契约与交回判据。
2. 顺序：A（§verifier 产出契约）⇒ B（例外段改逐类指针）⇒ C（守卫）⇒ 回归。
3. 治理面 ⇒ architect 落笔 + oracle → critic 各 1 轮；因改的是 §审查配对 本节，结论按自指审查口径声明。
4. 改守卫断言 ⇒ 属治理面（断言增删 = 改判据）⇒ critic **必审**。
