# delegated-verifier-evidence-gap — 被派发 verifier 类的「无法取证」交回分支 + 降级例外的逐类后果

> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D5 handoff 形态，**Accepted**）
> 输入：`.rddf/improvements/delegated-verifier-evidence-gap.md`（5 段草稿，metis 1 轮审后修订；**本 proposal 是其落地稿，机制细节以 improvement 为准，不在此复制**）
> 来源：`backend-handoff-role-class` 的 prompt 评审（oracle 第 4 条 finding + critic NIT 1）
> 性质：**纯 prompts + 守卫测试**，无代码路径改动
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在 ⇒ 按工件归属规则第 3 条走**内置流程**。
> ⚠ 本 change 改 `prompts/build.md` §审查配对 本节自身 ⇒ 按自指审查口径，oracle / critic 的结论只能记为**自指审查，不构成独立证据**。

## Why

被派发后端的「无人值守 ⇒ 不得自审自批」规则只覆盖 `architect` 一类，另留两个缺口：

1. **`verifier` 类无「无法取证 ⇒ 交回」的分支** ⇒ 无人值守 + 可写产出 = **可伪造 pass 证据**。
   机制事实：交付面证据判据是 `summarizeDelivery` 里的
   `(final_is_role_opening || model_switched) && write_tool_calls === 0 && artifacts === 0`
   （`lib/delegate-core.ts`）⇒ verifier 落一份报告 ⇒ `write_tool_calls ≥ 1` ⇒ 该判据**恒为 false**
   ⇒ 「写一份无证据的 pass 报告」在**机器侧不会被抓**。
   `prompts/build.md` §verifier 产出契约 的「0 工具调用就判 pass = 假阳性，判定作废」是**文本禁令、无执行点**，
   且**未规定「作废之后往哪走」** —— 缺的正是这个分支。
2. **`prompts/build.md` 的降级例外是全类断言、只写了 `architect` 的后果** ⇒ 断言了「禁止」，没写「该做什么」。

**边界澄清**（避免过度收紧）：`builder` 类**不存在**同类 subagent 缺口 —— 其逐 change 验收审查者是 **verifier（角色内建，非 subagent）**，且 `builder` 的自查走 `shell`（不受 subagent 约束）⇒ 「subagent 不可用」对 builder 不构成受阻；`verifier` 的 `explore` 仅用于定位（主会话「不必委托」口径下可自读降级）⇒ 二者**不因 `subagent` 不可用而受阻**。真正需要补分支的只有**「本类有强制 subagent 审查者且该审查者不可用」**这一形态。

## What Changes

### A. `prompts/build.md` §verifier 产出契约 —— 增「取证不可用 ⇒ 交回」分支

**只补「作废之后往哪走」，不改既有判据来源与证据要求**（避免第二套标准）：

> 任一判据的取证**不可用** ⇒ **不得判 pass**。**pass 结论必须全量取证**；**失败结论只需单条带证据的不通过**（不要求其余判据取证齐全）。
>
> 判据（基线对照）：同一取证命令在**不含本 change 的基线上**也**报错 / 无法运行** ⇒ 取证不可用（`blocked`）；仅在本 change 上失败 ⇒ 这是**判据不通过**的证据（`ac-fail`）。
> - ⚠ **「失败」只指命令报错 / 无法运行**；**不**包括「grep 未命中本 change 新增内容」与「产物尚未存在」（那是**判据信号**，不是环境信号）—— 否则存在性取证会被系统性误判为取证不可用。
> - 基线取法：`git merge-base HEAD <base>`（`<base>` 取自**派发方在简报里声明的基线**；本仓的简报**没有**该字段 ⇒ 缺省 `origin/main`，取不到即 `<base>` 不可解析）。判定只用只读命令 —— `git diff --name-only <base>...HEAD` 判取证对象是否被本 change 触及、`git show <base>:<path>` 读基线内容。**不得** stash / checkout / 新建 worktree（越出 verifier 类写集）。
> - ⚠ **`<base>` 不可解析**（缺省 ref 不存在 / merge-base 失败）⇒ **等同取证不可用（`blocked`）**，**不得**按 `ac-fail` 处理（否则环境故障会被路由成「回 builder 修 AC」，白烧 3 轮额度）。
> - 取证对象是本次**新增**文件（diff 中为 `A`）⇒ 基线不可比 ⇒ 按本 change 判据处理（默认 `ac-fail`）。
> - 命令退出 0 但**未执行任何用例**（0 tests / 输出为空 / 被过滤器排除）⇒ 等同取证不可用，**不得据此判 pass**。
> - 命令**超时**（> 简报 `timeout`，缺省 10 分钟）⇒ 取证不可用。
> - 同一命令**至多重试 1 次**（排除抖动）；重试后仍失败且基线同样失败 ⇒ 取证不可用。（额度类失败**不重试**，对齐「审查调用失败不重试」；取证命令的抖动不属于额度类。）
>
> kind 优先级：① 已有带证据的判据不通过 ⇒ `ac-fail`（body 第 ④ 项写明剩余哪些判据无法取证）；② 无任何判据可判定 ⇒ `blocked`。
>
> **不产出判定，但必须留痕**：**由 verifier 自己**落一份受阻记录 `.rddf/reviews/<change>-verify-blocked.md` —— 首行 `HANDOFF: <kind>`，正文含逐条判据的取证命令 + 输出摘要 + 已用轮次，**不含任何 pass 结论**。
>   （写者是 verifier 本身：`.rddf/reviews/**` 本就在它的写集内；**主会话代写会丢掉取证细节** —— `last_assistant_text` 会被 `redactAndTruncate` 截断，长命令最先丢。）
>   - ⚠ **本落点不替代 `rddf feedback` 凭据**，也不构成 D5「不新造落点」的例外：凭据通道仍是唯一权威；受阻记录只是**审计痕迹**（轮次 + 取证细节）。
>   - ⚠ **已用轮次的聚合**：轮 1 受阻（记账在 `-verify-blocked.md`）、轮 2 通过（记账在 `-verify.md`）时，轮 3 的 verifier 从**两份文件里取较大值**（受阻记录不具判定效力，但轮次要累计）。
>   - **主会话形态**（§verifier 产出契约 的适用对象不止被派发后端）：主会话侧的 verifier 遇取证不可用 ⇒ 向用户报告分类结果（不落受阻记录、不作判定），**不进入本 change 的交回流程**。
> （理由：审计痕迹与「已用轮次」的计数载体都在这份文件里；禁写会让 3 轮上限的记账失效。`architect` 类的「不得落审稿报告」是**收口动作**语境，verifier 无收口权，不得照搬。）
>
> 5 项正文的**追加句**（既有语义不变，不替换）：③ 首句固定 `阻塞类型：取证不可用 | 判据不通过`，其后写需要什么决策；④ 逐条列「已取证（命令 + 输出摘要）/ 未取证（原因）」。`--from rdd-builder` 是常量；`ac-fail` 必须带 `--ref-change <change>`。
>
> **不适用**（不是取证不可用）：① 「判据来源为空」（proposal 无 `## 验收标准` / `## Acceptance` 段）⇒ `proposal_drift` / `needs-revision`；② `rdd-verifier` skill 不可加载 ⇒ 视为未命中，走本地验收（既有分流口径）。

### B. `prompts/build.md` §审查配对 例外段 —— 逐类后果**只在**「被派发后端的运行身份与交回契约（`role_class`）」一处定义

例外段改为**逐类独立 bullet**（不复述逐类后果 ⇒ 不产生第二套判据）：

> ⚠ **例外：被派发的后端不适用本降级**。后端无人值守，自检即自审自批。逐类后果**只在「被派发后端的运行身份与交回契约（`role_class`）」定义**（本节不复述）：
> - `architect` 类（oracle→critic 强制）：审查者不可用 ⇒ `HANDOFF: blocked`。
> - `builder` 类（**架构面 critic 行**）：该行审查者不可用 ⇒ `HANDOFF: blocked`。⚠ 这是**新增**的受阻义务（现状只约束 `architect`）；架构面 critic 的额度耗尽在 2026-11-04 实测中是常态 ⇒ 后果须显式承认为「空手交回」。
> - `builder` 类（逐 change 验收）：审查者是 `verifier`（角色内建，非 subagent）⇒ 不因 `subagent` 不可用而受阻。
> - `verifier` 类：无固定 subagent 审查者 ⇒ 不因 `subagent` 不可用而受阻；但取证若依赖关系类定位（谁调用 / 影响面）而 `explore` 不可用 ⇒ 按 A 段「取证不可用」走。
>
> 受阻时**不得完成任何收口动作**（不得转 Status、不得落**判定类**报告、不得登记关联 change）—— **判定类**报告指「含 pass/fail 结论的验收报告」；§verifier 产出契约 的**受阻记录**（`<change>-verify-blocked.md`，不含任何判定结论）**不在此禁止范围内**。本节第 1–3 条只适用于**主会话**。

### C. 守卫 —— **扩展既有 describe**（不新建第二份守卫守同一段）

扩展 `tests/config-guards.test.ts` 中**已在守同一例外段**的 describe（避免同一段落两份守卫）：

- **逐类共现**：每个**受例**（含 `HANDOFF: blocked`）bullet 内类名与 `HANDOFF: blocked` 同行，且每个类名至多出现于一条**受例** bullet（**不受阻**的 bullet 里类名可复现 —— 否则 `builder` 必然出现两次，判据会与 B 段钦定文本自咬）。
- **kind 集合** == `{needs-revision, ac-fail, blocked}`，从 §HANDOFF 契约**动态抽取**（锚点：`#### HANDOFF：交回主会话的凭据化契约` → 下一个 `#### ` 标题；`noted` 在另一节的表格里，锚点放宽到整文件会得到 4 个 kind ⇒ 假失败）。
- **未新增**：反引号 token allowlist（复用既有形态）；`SLOT_STATES` 与 `prompts/front.md` 动态抽取的 outcome 集合不变。
- **负向**：新段不得有 `explore` 与 `blocked` 同行（防把可降级项列为受阻）；既有三条防回归断言必须保留 —— 三条**同在** `tests/config-guards.test.ts` 的 `test("例外段存在且限定为…")` **之内**（「只适用于**主会话**」/「不得完成任何收口动作」/「降级第 1 条仍在」），核验按**断言内容**而非 test 名书写。
- **文本锚点**：A 段含「基线」「任一判据」「不产出判定」「阻塞类型：」四组可 grep token。
- **防回归**：既有「0 工具调用就判 pass = 假阳性，判定作废」句与「报告落点 `.rddf/reviews/<change-or-task>-verify.md`」句**仍在**（B 段新增的受阻记录落点是**追加**，不是替换）。

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | §verifier 产出契约的**A 段窗口**（从「任一判据的取证**不可用**」起，到「不适用」bullet 止）内含**三段**可 grep 文本：①「取证**不可用**」定义句（含基线对照 + 零用例/超时边界 + `<base>` 不可解析 ⇒ blocked）；②「不得判 pass」+「pass 需全量取证 / 失败只需单条证据」分档；③ kind 优先级两条（有带证据的失败 ⇒ `ac-fail`；无任何可判定 ⇒ `blocked`）。**禁止**把「取证不可用 ⇒ blocked」写成无条件蕴含 —— 负向判据的边界形态：「取证不可用」与「blocked」之间**不得出现** `⇒` / `则`（裸正则会假命中钦定文本里的 kind 优先级句） | 结构（可 grep，按窗口切片） | `tests/config-guards.test.ts` |
| AC2 | 例外段**逐类独立 bullet**：每个**受例**（含 `HANDOFF: blocked`）bullet 内类名与 `HANDOFF: blocked` **同行**；每个类名至多出现于一条**受例** bullet（**不受阻**的 bullet 里类名可复现 —— 否则与 B 段钦定文本自咬） | 结构 | 同上 |
| AC3 | HANDOFF 允许 kind 集合 == `{needs-revision, ac-fail, blocked}`（从 §HANDOFF 契约**动态抽取**比对，不硬编码） | 结构 | 同上 |
| AC4 | 负向：新段不得有 `explore` 与 `blocked` 同行；既有三条防回归断言仍在 —— 三条**同在** `tests/config-guards.test.ts` 的 `test("例外段存在且限定为…")` **之内**（「只适用于**主会话**」/「不得完成任何收口动作」/「降级第 1 条仍在」），核验按**断言内容**（`toContain` 目标串）而非 test 名书写 | 结构 | 同上 |
| AC5 | 未新增：反引号 token allowlist + `SLOT_STATES` / outcome 集合不变 | 结构 | 同上 |
| AC6 | 文本锚点齐（**按 A 段窗口切片**查，不整文件 grep）：A 段窗口含「基线」「任一判据」「不产出判定」「阻塞类型：」；B 段含「逐类后果」指针与逐类 bullet | 结构（可 grep，按窗口切片） | 同上 |
| AC7 | 手工：verifier 类「测试跑不起来」fixture ⇒ 交回而非判 pass ⇒ 受阻记录 `.rddf/reviews/<change>-verify-blocked.md` 存在，且**由 verifier 自落**（不在其写集内则说明越类）⇒ **主会话核对**记录存在 + 首行 `HANDOFF: blocked` + 正文含取证命令与输出摘要（内容规格以 A 段为准） | 手工（不进 CI，但**有载体可 grep**） | 受阻记录 |
| AC8 | 回归：`bun test tests/` 全绿；`scripts/check-upstream-anchors.sh` 退出码 0 —— **有上游源码时**须无 `SKIP`；**本机无上游源码时**脚本按设计输出 `SKIP` 且 exit 0 ⇒ **允许勾选**，但验收报告必须标注「锚点未验证（本机无上游源码）」，**不得**写「锚点全部命中」；`openspec validate delegated-verifier-evidence-gap` 通过 | 结构 | 全量 |
| AC9 | 治理面双审闭合：oracle → critic 各 1 轮（顺序不可颠倒），审稿记录落 `.rddf/reviews/delegated-verifier-evidence-gap-prompt-review.md` | 结构 | 审稿记录 |

> **补丁范围的人工核对**（**不写成单测** —— 单元测试无法断言「本次 patch 没碰别的文件」，且依赖 git 状态）：`git diff --stat <base>...HEAD` 只含 `prompts/build.md`、`tests/config-guards.test.ts`、`.rddf/reviews/delegated-verifier-evidence-gap-*`。

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [ ] AC1 三段文本（定义 / 分档 / kind 优先级）
- [ ] AC2 逐类独立 bullet + 共现
- [ ] AC3 kind 集合动态抽取一致
- [ ] AC4 负向 + 既有三条断言保留
- [ ] AC5 未新增（token allowlist / SLOT_STATES / outcome 集合）
- [ ] AC6 文本锚点齐
- [ ] AC7（手工）回放记录落盘（主会话誊写）
- [ ] AC8 回归绿 + anchors 无 SKIP + openspec validate 通过
- [ ] AC9 oracle → critic 双审闭合

## 非目标

- 不新增工具、状态字段、outcome 值、通知通道（沿用既有 HANDOFF 契约；HANDOFF kind 集合不变）。
- 不改 §verifier 产出契约的**判据来源与证据要求**（只补「作废之后往哪走」）。
- 不改 verifier 类的 `edit` 边界、subagent 白名单、架构类的双审收口流程。
- **不改** `.rddf/reviews/` 的报告命名约定（`<change>-verify.md` 仍是正式验收报告；本 change 只**追加**一个受阻记录落点）。
- **权威序**：`-verify-blocked.md` **不具判定效力**；同一 change 存在 `-verify.md` 时**以 `-verify.md` 为准**，受阻记录仅作审计痕迹（轮 1 受阻、轮 2 通过 ⇒ 两份共存，以通过的那份为准）。
- ⚠ **不变式声明（防高估收益）**：本 change **不加机读校验**，「报告里是否真有证据」仍靠 prompt + 人工 ⇒ **伪造 pass 的机器面不变**（`no_work_evidence` 仍不覆盖「有写盘但无证据」）。

## 影响面与风险

| 面 | 影响 |
|---|---|
| `prompts/build.md` | §verifier 产出契约 +1 段（**新增**，不改既有判据来源）；§审查配对 例外段改逐类 bullet + 指针；报告落点句追加受阻记录落点 |
| `tests/config-guards.test.ts` | **扩展**既有 describe（不新建第二份守同一段的守卫） |
| 行为 | verifier 后端在取证不可用时交回主会话，**不再「无证据判 pass」**；受阻时仍留痕（不落判定产物，但落受阻记录） |
| 代价 | 一次交回往返 + 一份受阻记录；**`builder` 类（架构面）新增受阻义务**（critic 额度耗尽 ⇒ 空手交回）—— 已显式承认，非隐藏后果 |
| 风险 | ① verifier 类交回变多 ⇒ 主会话须区分「受阻」与「不通过」：**未覆盖** —— 现有证据优先级（`prompts/plan.md`「交回后的收尾三问」）只解决「读哪条证据」，**不解决分类** ⇒ 分类靠 A 段的 ③ 首句固定措辞（`阻塞类型：…`）② 空手交回导致架构面审查无产物 ⇒ 由主会话决定是否重派（**不自动**） |

## 依赖与顺序

1. 依赖 `backend-handoff-role-class`（已归档）与 `resume-precheck-guidance`（已归档）的 HANDOFF 契约与交回判据。
2. 顺序：A（§verifier 产出契约）⇒ B（例外段逐类 bullet）⇒ C（守卫扩展）⇒ 回归。
3. 治理面 ⇒ architect 落笔 + oracle → critic 各 1 轮；因改的是 §审查配对 本节，结论按自指审查口径声明。
4. 改守卫断言 ⇒ 属治理面（断言增删 = 改判据）⇒ critic **必审**。
