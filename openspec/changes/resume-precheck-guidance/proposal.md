# resume-precheck-guidance — 交回后的收尾三问（plan / front 侧）

> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D5 / D6，**Accepted**）
> 输入：`.rddf/improvements/resume-precheck-guidance.md`（5 段草稿，metis 审后修订）
> 来源：`backend-handoff-role-class` 的 What Changes C.11（明确拆出）
> 性质：**纯 prompts + 守卫测试**，无代码路径改动；planner 审查：metis 1 轮

## Why

后端交回后，主会话最容易犯的三个错都源于**认错证据**：

1. 真完成与交回完成**都是** `outcome=succeeded` + `state=idle` ⇒ 只看 `outcome` 会把交回读成完成，带着旧指令再派一次（白烧共享 `revision_count`）。
2. `rddf feedback list <proposal>` 返回该 proposal 的**全部**记录 ⇒ 取第一条会把上一轮的 `blocked` 当成本轮的。
3. `resume` 不重设 permissions ⇒ 扩 scope 必被权限拒；显式改 `role_class` 被硬拒（D6）；交回后**不需要也不应**先 `suspend`（`state=idle`、槽已释放）。

## What Changes

### A. `prompts/plan.md` —— 唯一真源

新增「交回后的收尾三问」小节（**表格**，非散文）：

| 问 | 内容 | 证据 |
|---|---|---|
| ① 为什么交回 | kind + 5 项模板第 ③ 项（需要什么决策） | `rddf feedback` **新增条目** |
| ② 我该动什么 | 改 plan/AC/tasks ⇒ **给草案、用户确认后再改**；需别的类 ⇒ 重派该类；缺外部信息 ⇒ 交用户 | 同上 |
| ③ 续接还是重派 | 见下方三条禁令 | `sessions` + `pair.json` |

**证据优先级（有序，不得并列）**：`rddf feedback` 新增条目 **>** `last_assistant_text` 首行 **>** `outcome` / `slot.state`。

- **`outcome=succeeded` + `state=idle` 不等于完成** —— `idle` 只证明回合结束、槽已释放。
- 异步面**没有**完成通知：触发点是「用户回来」或「你下次读 `sessions` 看到 `running=false`」。
- **增量记账**：派发时记 `last_feedback_id`（改善文件已有字段），收尾只认 `created_at >` 派发时刻的条目；**新增为空且首行为 `HANDOFF:` ⇒ 以文本 5 项为准**（`rddf` 写不进时的兜底，不是异常）。
- **resume 三条禁令**：① 不得用 resume 扩 scope（扩 = 新建 session，**上下文不继承**）；② 不得显式声明不同的 `role_class`（硬拒）；③ 存量条目（`pair.json` 无 `role_class`，或 scope 越过新边界）**一律重派、不复用**。
- **交回后不接管实施**：主会话只做路由（改计划草案 / 重派 / 问用户），不得自己上手做被交回的那部分。

### B. `prompts/front.md` —— 只留引用

§3.3 的旧分流句改为指向 A 小节**标题名**的引用（不写 `§x.y` 编号），删掉重复正文。

### C. `prompts/plan.md` 硬规则 #5 —— 同样改为引用

### D. `tests/config-guards.test.ts` —— 投影守卫（新增 1 个 describe）

## 验收标准

| AC | 判据 | 类型 |
|---|---|---|
| AC1 | A 小节存在且是**表格**（表头解析成功）；表内按序出现 `feedback` → `last_assistant_text`/首行 → `outcome`/`state`（下标递增） | 结构 |
| AC2 | A 小节含「`outcome=succeeded` + `state=idle` 不等于完成」的断言句 | 结构 |
| AC3 | A 小节含三条 resume 禁令（扩 scope ⇒ 新建 session / 不得改 `role_class` / 存量条目重派不复用） | 结构 |
| AC4 | A 小节含增量记账（`last_feedback_id` 或等价「只认新增条目」）+ `rddf` 不可用时的文本兜底 | 结构 |
| AC5 | `front.md` 只含指向该小节**标题名**的引用；`plan.md` 硬规则 #5 与 `front.md §3.3` 的旧重复正文**已消失**（负向 `not.toContain`） | 结构 |
| AC6 | 5 项模板字段名与 `prompts/build.md` 的 ①–⑤ **动态对照**（测试内不得硬编码字段名） | 结构 |
| AC7 | 新小节不得出现 `handoff_pending` / `set_class` / 新工具名 / 「正则」/「门禁」；异步触发点不得出现「通知」 | 结构（负向） |
| AC8 | 无新增工具 / 状态字段 / outcome 值（`SLOT_STATES` 与 outcome 断言不变） | 结构 |
| AC9 | 回归：`bun test tests/` 全绿 + `scripts/check-upstream-anchors.sh` 23/23 | 结构 |
| AC10 | （prompt 判据，不进 CI）给定一条交回记录 ⇒ 按证据优先级分流、且不接管实施 | 手工 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [ ] AC1 小节是表格 + 证据优先级顺序成立
- [ ] AC2 `succeeded + idle ≠ 完成` 断言句
- [ ] AC3 三条 resume 禁令
- [ ] AC4 增量记账 + 文本兜底
- [ ] AC5 front 只引用、旧重复正文消失
- [ ] AC6 5 项字段名动态对照 build.md
- [ ] AC7 无新状态/工具/「通知」等负向 token
- [ ] AC8 无新增枚举值
- [ ] AC9 全量回归绿
- [ ] AC10（手工）按优先级分流且不接管实施

## 非目标

- 不新增工具、状态字段、outcome 值、通知通道。
- 不改 `prompts/build.md`（后端侧契约已闭环）—— **若 AC6 需要改它而非只读，则本 change 必须回并**。
- 不做自动闭环（不自动改计划、不自动 resume）；「改计划」必须先给草案、用户确认。
- 不判定「能力正确性」（该类是否本应能做这件事）⇒ 对 D3 修订免疫。
- 不修 `rddf feedback` 通道的产品侧缺陷（Issue A/B）；只把它当主证据 + 文本兜底。

## 影响面与风险

| 面 | 影响 |
|---|---|
| prompts | `plan.md` 增 1 小节（表格）+ 硬规则 #5 改写；`front.md §3.3` 改为引用 |
| 测试 | `config-guards.test.ts` 新增 1 个 describe（7 条断言，含 2 条负向） |
| 行为 | 交回后不再「看 `outcome` 就重派」；异步面改为读 feedback 增量 |
| 代价 | 每轮多 1 次只读调用 |
| 风险 | `rddf` 通道已知不一致 ⇒ 主证据 + 文本兜底，不新造通道 |

## 依赖与顺序

1. 依赖 `backend-handoff-role-class` 的 HANDOFF 契约（已合并：`9663ec5` / `f8b333f`）。
2. A → C（引用改写）→ B（front 引用）→ D（守卫）→ 回归。可一次合入。
3. 治理面 ⇒ 由 architect 落笔 + oracle → critic 各 1 轮（`prompts/**` 属治理面）。
