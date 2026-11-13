# resume-precheck-guidance — 交回后的收尾三问（plan / front 侧，写进 prompt 不落代码）

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：`backend-handoff-role-class` 的 What Changes C.11（**明确拆出**）
> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D5 / D6，Accepted）
> planner 审查：metis 1 轮（`.rddf/reviews/resume-precheck-guidance-planner-review.md`）

## Why

后端交回之后，主会话最容易犯的三个错，都不是「不知道有 HANDOFF」，而是**认错证据**：

1. **把交回读成完成**：真完成与交回完成**都是** `outcome=succeeded` + `state=idle` ⇒ 只看 `outcome` 必然误判，于是带着旧指令再派一次（白烧共享 `revision_count`）。
2. **认错那一条 feedback**：`rddf feedback list <proposal>` 返回该 proposal 的**全部**记录 ⇒ 直接取第一条会把上一轮的 `blocked` 当成本轮的。
3. **在 resume 上反复试错**：`resume` 不重设 permissions ⇒ 带扩大的 scope 必被权限拒；显式声明不同 `role_class` 会被硬拒（D6）；交回后**不需要也不应该**先 `suspend`。

现状 `prompts/plan.md` 只有一句「`HANDOFF:` 首行 = 交回不是完成」，`front.md` 只有一句分流提示，**没有证据优先级、没有增量记账、没有 resume 禁令**。

## What Changes

1. **`prompts/plan.md` 是唯一真源**：新增「交回后的收尾三问」小节（**表格**）：
   - 三问 = ① 这次交回的理由是什么（按 kind + 5 项模板第 ③ 项）；② 我要动的是计划还是派发（改 plan/AC/tasks vs 换类重派 vs 交用户）；③ 续接还是重派（scope 不可扩、class 不可改、存量条目不复用）。
   - **证据优先级（有序，不得并列）**：`rddf feedback` **新增条目** > `last_assistant_text` **首行** > `outcome` / `slot.state`。并明写一条：**`outcome=succeeded` + `state=idle` 不等于完成**（`idle` 只证明回合结束、槽已释放）。
   - **增量记账**：派发时记 `last_feedback_id`（improvement 已有字段，不新造状态）；收尾只认 `created_at >` 派发时刻的条目；**新增为空且首行为 `HANDOFF:` ⇒ 以文本 5 项为准**（`rddf` 写不进时代码路径的兜底，不是异常）。
   - **resume 三条禁令**：① 不得用 resume 扩 scope（扩 = 新建 session，**上下文不继承**）；② 不得显式声明不同的 `role_class`（硬拒）；③ 存量条目（`pair.json` 无 `role_class`，或 scope 越过新边界）**一律重派、不复用**。
   - **交回后不接管实施**：主会话只做路由（改计划草案 / 重派 / 问用户），不得自己上手做被交回的那部分。
2. **`prompts/front.md` 只留引用**（不复制正文）：把 §3.3 的旧分流句改成指向 `plan.md` 该小节的**标题名引用**（不写 `§x.y` 编号），并删掉重复正文。
3. **`prompts/plan.md` 硬规则 #5** 同样改为指向新小节的引用（不留两份正文）。
4. **`tests/config-guards.test.ts`** 新增 1 个 describe：投影守卫 —— 小节存在且是表格、证据优先级**顺序**成立、三条禁令 token、5 项字段名**动态**对照 `build.md`、以及**旧重复正文已消失**（负向）。

## Acceptance

| AC | 判据 | 类型 |
|---|---|---|
| AC1 | `plan.md` 存在该小节，且它是**表格**（解析表头成功）；表内按序出现 `feedback` → `last_assistant_text`（或首行）→ `outcome`/`state` 三个证据 token（下标递增） | 结构（CI） |
| AC2 | 该小节含「`outcome=succeeded` + `state=idle` 不等于完成」的明确断言句 | 结构（CI） |
| AC3 | 该小节含三条 resume 禁令（扩 scope ⇒ 新建 session / 不得改 `role_class` / 存量条目重派不复用） | 结构（CI） |
| AC4 | 该小节含增量记账（`last_feedback_id` 或等价「只认新增条目」措辞）+ `rddf` 不可用时的文本兜底 | 结构（CI） |
| AC5 | `front.md` **不复制**正文：只含指向该小节**标题名**的引用；`plan.md` 硬规则 #5 与 `front.md §3.3` 的旧重复正文**已消失**（负向 `not.toContain`） | 结构（CI） |
| AC6 | 5 项模板字段名与 `prompts/build.md` 的 ①–⑤ **动态对照**（测试内**不得硬编码**五个中文字段名） | 结构（CI） |
| AC7 | 新小节不得出现 `handoff_pending` / `set_class` / 新工具名 / 「正则」/「门禁」；异步触发点不得出现「通知」（负向 token） | 结构（CI） |
| AC8 | 无新增工具 / 状态字段 / outcome 值（`SLOT_STATES` 与 outcome 断言不变） | 结构（CI） |
| AC9 | 回归：`bun test tests/` 全绿 + anchors 23/23 | 结构（CI） |
| AC10 | （prompt 判据，不进 CI）给定一条交回记录，主会话按证据优先级分流、且交回后不接管实施 | 手工 |

## Capabilities

- 纯 prompts + 守卫测试：**零代码路径改动、零新字段、零新工具、零新通道**。
- 复用既有能力：`sessions` 回显 `role_class`、`rddf feedback list`、`summary.last_assistant_text`、`pair.json` 的 `role_class` / 改善文件的 `last_feedback_id`。
- **不判定「能力正确性」**：本文只判定**身份与回合状态**（谁、回没回合结束、这条 feedback 是不是新的），不判定「该类是否本应能做这件事」⇒ 对 `feedback-20261113-001` 可能引发的 D3 修订**免疫**。

## Impact

- **行为**：交回后不再「看 `outcome` 就重派」；异步面从「等 `outcome`」变为「读 feedback 增量 + 文本兜底」。
- **代价**：主会话每轮多 1 次只读调用（`rddf feedback list` / `sessions`）。
- **风险**：`rddf` 通道在产品侧有已知读写不一致（`docs/rdd-workflow-product-issues.md` Issue A/B）⇒ 只作主证据 + 文本兜底，**不新造第三通道**。
- **拆分解除条件**：若 AC6 需要**修改** `build.md` 的 5 项文本（而非只读它）⇒ 必须回并到 `backend-handoff-role-class`；本 change 以「只读 `build.md`」为前提成立。
