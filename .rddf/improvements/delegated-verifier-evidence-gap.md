# delegated-verifier-evidence-gap — 被派发 verifier 类的「无法取证」缺口 + 降级例外的全类悬空

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D5 handoff 形态）+ `.rddf/reviews/backend-handoff-role-class-prompt-review.md` 的「待立项」条目
> 来源：oracle（`backend-handoff-role-class` 的 prompt 评审第 4 条 finding）+ critic NIT 1
> 关联 change：`openspec/changes/delegated-verifier-evidence-gap/`（**已立项** 2026-11-13；逐条判据以该 change 的 proposal AC 表为唯一真源）
> planner 审查：metis 1 轮（`.rddf/reviews/delegated-verifier-evidence-gap-planner-review.md`）
> ⚠ 本项**改 `prompts/build.md` §审查配对 本节自身** ⇒ 按 `prompts/build.md` §审查配对 的自指审查口径，oracle / critic 的结论只能记为**自指审查，不构成独立证据**，须在当回合响应正文声明。

## Why

被派发后端的「无人值守 ⇒ 不得自审自批」规则目前只覆盖 `architect` 一类，另留两个缺口：

1. **`verifier` 类无「无法取证 ⇒ 交回」的分支** ⇒ 无人值守 + 可写产出 = **可伪造 pass 证据**。
   机制事实（不是推测）：交付面证据判据是 `summarizeDelivery` 里的
   `(final_is_role_opening || model_switched) && write_tool_calls === 0 && artifacts === 0`
   （`lib/delegate-core.ts`）。verifier 落一份报告 ⇒ `write_tool_calls ≥ 1`、`artifacts ≥ 1`
   ⇒ 该判据**恒为 false** ⇒ 「写一份无证据的 pass 报告」在**机器侧不会被抓**。
   `prompts/build.md` §verifier 产出契约 的「0 工具调用就判 pass = 假阳性，判定作废」是**文本禁令、无执行点**，且**未规定「作废之后往哪走」** —— 缺的正是这个分支。
2. **`prompts/build.md:482` 的降级例外是全类断言、只写了 `architect` 的后果**：「被派发的后端不适用本降级」适用于全部后端，但后续只给 `architect` 类的 `HANDOFF: blocked`；`builder` / `verifier` 遇审查者不可用时该做什么**没写** ⇒ 断言了「禁止」，没写「该做什么」（悬空读法）。

**边界澄清**（避免过度收紧）：`builder` 类**不存在**同类 subagent 缺口 —— 其逐 change 验收审查者是 **verifier（角色内建，非 subagent）**，且 `builder` 的自查走 `shell`（不受 subagent 约束）⇒ 「subagent 不可用」对 builder 不构成受阻；`verifier` 的 `explore` 仅用于定位（主会话「不必委托」口径下可自读降级）⇒ 二者**不因 `subagent` 不可用而受阻**。真正需要补分支的只有**「本类有强制 subagent 审查者且该审查者不可用」**这一形态。

## What Changes

1. **§verifier 产出契约 增「取证不可用 ⇒ 交回」分支**（**只补「作废之后往哪走」，不改既有判据来源与证据要求**，避免第二套标准）：
   > 任一判据的取证**不可用** ⇒ **整份判定不得判 pass**，也不得只按已取证部分下结论。
   > 判据：**同一取证命令在不含本 change 的基线上也失败或无法运行** ⇒ 取证不可用（`blocked`）；仅在本 change 上失败 ⇒ 这是**判据不通过**的证据（`ac-fail`），不得记为取证不可用。基线取不含本 change 的 HEAD（worktree 场景用同一 canonical root 的基线提交）。
   > kind 优先级：① 已有带证据的判据不通过 ⇒ `ac-fail`（body 第 ④ 项写明剩余哪些判据无法取证）；② 无任何判据可判定 ⇒ `blocked`。
   > 两种情况都**不落** `.rddf/reviews/` 报告（受阻即不得收口），已取得的证据写进 feedback 5 项正文的第 ④ 项。
   > 瞬态失败（网络抖动）**不重试**，一次即交回（对齐「审查调用失败不重试」）。
2. **`prompts/build.md:482` 例外段改为**逐类后果**只在「被派发后端的运行身份与交回契约」一处定义**（例外段只做指针，不复述 ⇒ 不产生第二套判据）：
   > ⚠ **例外：被派发的后端不适用本降级**。后端无人值守，自检即自审自批。逐类后果**只在「被派发后端的运行身份与交回契约」定义**（本节不复述）：`architect` 类（oracle→critic 强制）与 `builder` 类的**架构面 critic 行**遇审查者不可用 ⇒ `HANDOFF: blocked`；`builder` 的逐 change 验收审查者是 verifier（角色内建，非 subagent）、`verifier` 的 `explore` 仅用于定位（可自读降级）⇒ 二者不因 `subagent` 不可用而受阻。受阻时**不得完成任何收口动作**。本节第 1–3 条只适用于**主会话**。
3. **守卫**（`tests/config-guards.test.ts`）：
   - **逐类共现**：例外段内每个类名与 `HANDOFF: blocked` **同一行**共现（不是 section 级 `toContain`，否则只写 architect 也过）；例外段含「逐类后果只在…定义」的指针句。
   - **HANDOFF 允许 kind 集合** == `{needs-revision, ac-fail, blocked}`，从 `prompts/build.md` §HANDOFF 契约**动态抽取**（不硬编码第二份真源）。
   - **未新增**三判据：① `git diff --stat` 白名单（只 `prompts/build.md` + `tests/config-guards.test.ts`）；② 反引号 token allowlist（复用既有形态）；③ `SLOT_STATES` 与 `prompts/front.md` 动态抽取的 outcome 集合不变。
   - **负向**：新段不得把 `explore` 与 `blocked` 同行（防把可降级项列为受阻）；既有三条防回归断言必须保留。
   - **文本锚点**：新段含「基线」「任一判据」「不落」三个可 grep 词。

> 全部落在治理面文本（`prompts/**`）+ 守卫测试 ⇒ **无代码路径改动**；实施时由 architect 落笔，走 oracle → critic。

## Acceptance

逐条判据已写入 `openspec/changes/delegated-verifier-evidence-gap/proposal.md` 的 AC 表（AC1–AC7）；本段是它的**可判口径来源**：

| 判据 | 类型 |
|---|---|
| §verifier 产出契约含「取证不可用 ⇒ `HANDOFF: blocked`，不得判 pass」句，且含**基线对照**表述 | 结构（可 grep：含「基线」「任一判据」「不落」） |
| 降级例外段**逐类共现**：每个类名与 `HANDOFF: blocked` 同行；且含「逐类后果只在…定义」指针句 | 结构 |
| HANDOFF 允许 kind 集合 == `{needs-revision, ac-fail, blocked}`（从 §HANDOFF 契约动态抽取比对） | 结构 |
| 负向：新段不得有 `explore` 与 `blocked` 同行；既有三条防回归断言仍在 | 结构 |
| 未新增三判据：diff 白名单 + 反引号 token allowlist + `SLOT_STATES` / outcome 集合不变 | 结构 |
| 回归：`bun test tests/` 全绿；`scripts/check-upstream-anchors.sh` **退出码 0**（**不写死 23/23**，锚点数会随维护变化） | 结构 |
| 手工：给 verifier 类一个「测试跑不起来」的 fixture ⇒ 交回而非判 pass ⇒ **回放记录**（输入命令 + 输出首行 `HANDOFF: blocked` + 5 项正文）落 `.rddf/reviews/<change>-acceptance.md` | 手工（不进 CI，但**有载体可 grep**） |

## Capabilities

- **新增**：被派发 verifier 类的「取证不可用 ⇒ 交回」路径（`blocked` / `ac-fail` 的区分规则 + 部分取证的落点规则）；降级例外段的逐类后果指针。
- **不新增**：工具、状态字段、outcome 值、通知通道（沿用既有 HANDOFF 契约；HANDOFF kind 集合不变）。
- **既有能力不变**：verifier 类的 `edit` 边界（仅 `.rddf/reviews/**`）、subagent 白名单、架构类的双审收口流程、§verifier 产出契约的判据来源与证据要求。
- ⚠ **不变式声明（防高估收益）**：本项**不加机读校验**，「报告里是否真有证据」仍靠 prompt + 人工 ⇒ **伪造 pass 的机器面不变**（`no_work_evidence` 仍不覆盖「有写盘但无证据」）。

## Impact

| 面 | 影响 |
|---|---|
| `prompts/build.md` | §verifier 产出契约 +1 段；§审查配对 例外段改为逐类指针（**改的是本节自身 ⇒ 自指审查**） |
| `tests/config-guards.test.ts` | 新增 1 个 describe（结构判据，含负向断言） |
| 行为 | verifier 后端在取证不可用时交回主会话，不再「无证据判 pass」；受阻时不落报告 |
| 代价 | 一次交回往返（`rddf feedback add` + 读回） |
| 风险 | verifier 类交回变多 ⇒ 主会话须区分「受阻」与「不通过」。**未覆盖**：现有证据优先级（`prompts/plan.md`「交回后的收尾三问」）只解决「读哪条证据」，**不解决分类** ⇒ 分类靠 feedback 5 项正文第 ③ 项的必填措辞（「阻塞类型：取证不可用 / 判据不通过」），该措辞在本项文本里固定 |

## Out of Scope（相邻缺口，本项不做，登记为 backlog）

| 缺口 | 为什么不在本项 |
|---|---|
| `verifier` 类命中 `rdd-verifier` 分流三条件时要写 `.rddf/state/verifier/<change>.json`，而 verifier 类的写集只有 `.rddf/reviews/**` ⇒ 越类；且 `shell` 不受类约束（存在重定向绕过路径） | 属**产品侧 skill 与类写集的对齐**，不是 prompt 措辞问题 ⇒ 单独立项 |
| `builder` 类能否落 §审查配对「架构面 critic」的产出去向 `.rddf/reviews/`（builder 写集未含该目录） | 属**类写集设计**，改动面是权限面（`classPermissions`）⇒ 单独立项 |

## 依赖与顺序

1. 依赖 `backend-handoff-role-class`（已归档）与 `resume-precheck-guidance`（已归档）的 HANDOFF 契约与交回判据。
2. 顺序：§verifier 产出契约 ⇒ 降级例外段改逐类指针 ⇒ 守卫 ⇒ 回归。
3. 治理面 ⇒ architect 落笔 + oracle → critic 各 1 轮；因改的是 §审查配对 本节，结论按自指审查口径声明。
4. 若实施时改守卫断言 ⇒ 属治理面（`prompts/build.md` §治理面作用域表：「断言增删 / 放宽 / 字段清单变更」＝改判据）⇒ critic **必审**。
