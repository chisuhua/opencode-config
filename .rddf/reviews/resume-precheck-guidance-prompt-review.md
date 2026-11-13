# 审稿记录：交回后的收尾三问（`resume-precheck-guidance` 的 prompts 侧）

- 审稿对象：`prompts/plan.md`（新增小节 + 硬规则 #5）、`prompts/front.md`（§3.3）、`tests/config-guards.test.ts`（新增 describe）
- 变更类型：**治理面**（`prompts/**`）⇒ 固定配对 **oracle → critic**，顺序不可颠倒
- 审稿日期：2026-11-13
- 关联 change：`openspec/changes/resume-precheck-guidance/`
- 结论：**oracle `PASS-WITH-NOTES` → critic `APPROVE_WITH_CONDITIONS`（mergeable: yes，无 BLOCKER）**；两条 SHOULD_FIX 与三条 NIT 全部处置

## oracle（第一审）—— `PASS-WITH-NOTES`，8 条 finding

| # | 影响 | finding | 处置 |
|---|---|---|---|
| 1 | 中 | ADR D5:84 写「异步路径在**完成通知**后…」，与小节「异步面**没有**完成信号」**字面矛盾**；AC7 又禁 plan.md 出现「通知」⇒ 小节侧无从调和 | 小节加就地消歧：「（ADR D5 所述的「完成」以轮询观测为准，**没有推送通道**）」；ADR 侧措辞修订**登记为 follow-up**（L1/L2，见 design.md §6）。oracle 判定：**实质决策不冲突**（D5 的机制决策本身就是「无推送通道」的来源），矛盾只在描述性措辞 |
| 2 | 中低 | 「增量记账」只定义 happy path：**派发时刻/记账缺失时**（历史派发、上下文丢失、并发多后端）无降级规则 ⇒ 可能把上一轮记录当本轮 | 小节补：「派发时刻 / 记账缺失 ⇒ **退到优先级链 ②**（首行 + 文本 5 项正文），**不得凭猜测取条目**」 |
| 3 | 中低 | 问③只给三条**禁令**，不给「可续接」的**正向条件**；`resume` 一词与「切换是四步」两种语境并存 | 小节补「可续接的正向条件」（同 `role_class` + 新 `scope` ⊆ 原 `scope` + 新 `task` 用第 ⑤ 项草案）+ 与「切换是四步」的区分说明 + 「交回后不需要也不应先 `suspend`」 |
| 4 | 低 | AC6 `slice(1,6)` 截断 ⇒ build.md 扩到 ⑥ 时**恒绿**；且未断言 plan.md 的 ①–⑤ **顺序**与 build.md 一致（编号有语义：③ = 需要什么决策） | 改为：断言 build.md 该行 marker **恰好 5 个**（扩到 ⑥ 变红）+ plan.md 模板行按位置对齐 `toEqual(fromBuild)`。**已做变红演练**（见下） |
| 5 | 低 | AC7 的 token 正则只匹配小写 ⇒ 新增**大写**标识符（如 `HANDOFF_PENDING`）绕过白名单 | 正则放宽为 `/^[A-Za-z][A-Za-z0-9_]*$/`，白名单显式登记既有大写 token（`HANDOFF`） |
| 6 | 低 | AC1「下标递增」实为**全节** `indexOf`，而判据说的是「**表内**按序」 | 改为只在**表行集合**内计算下标；并断言表格 ≥4 行 + 分隔行形态 |
| 7 | 低 | front.md 的标题引用靠测试字面量「涌现式」耦合 | 改为：小节标题**从 plan.md 动态抽取**（围栏外唯一 `###` 标题即契约名），front.md 按该标题断言；AC5 同时断言引用行不含 `§数字` |
| 8 | 低 | proposal Why #3 承诺治「交回后不应先 suspend」但正文/tasks 无对应句；tasks 引用的两份产物不存在 | ① 随 finding 3 一并补入小节；② **本次补齐** `.rddf/reviews/resume-precheck-guidance-prompt-review.md`（本文件）与 `-verify.md` |

## critic（第二审）—— `APPROVE_WITH_CONDITIONS`（`mergeable: yes`，`scope_exceeded: false`）

**BLOCKER：无。**

| # | 类别 | finding | 处置 |
|---|---|---|---|
| 1 | SHOULD_FIX | tasks.md 勾选并指向两份**不存在**的产物（`-verify.md` / `-prompt-review.md`）；AC10 是手工判据，走查记录必须真实存在才可勾选 | **已补齐两份产物**（本文件 + `-verify.md`），tasks.md 的引用与文件一一对应 |
| 2 | SHOULD_FIX | ADR D5:84 的 follow-up 只停留在口头「登记为 follow-up」，**没落在可追台账** ⇒ 会蒸发的 follow-up | 在本 change 的 `design.md` §6 建「遗留登记」表（L1 ADR 措辞 / L2 `backend-handoff-protocol-spec.md:45` 同措辞 / L3 `build.md:482` 全类断言），并指向 owner（architect / planner） |
| 3 | NIT | AC7 白名单只覆盖**带反引号**的 token ⇒ 纯文本新标识符不在覆盖内 | 守卫内加注释点明边界（「只覆盖反引号 token + 5 个明文禁用项」），避免后人误信其完备 |
| 4 | NIT | 「退到 **②**」有两个指涉（表格第 ② 问 vs 优先级链第 ② 级） | 改为「退到**优先级链 ②**」 |
| 5 | NIT | 「改善文件已有字段」略超实（`last_feedback_id` 无 schema/工具支撑） | 改为「`rddf feedback list <proposal>` 的**输出里带该字段**」（事实表述） |

critic 对 focus 1 的判定（原文要点）：**处置方向可接受、不构成「已签批 ADR 与实现矛盾」** —— D5 的可操作决策（不新增状态/工具、feedback 记录为唯一权威、选项 E「推送完成通知」被拒）恰恰是「没有完成通知」的来源；本 patch 遵守 ADR 的全部操作性决策。

## 变红演练（critic 建议，已执行）

```
# 临时给 prompts/build.md 的 5 项模板追加「；⑥ 模拟项」
$ bun test tests/config-guards.test.ts
(fail) AC6：5 项模板字段名与 prompts/build.md 的 ①–⑤ 动态对照，且**顺序一致**
# 还原后
 45 pass / 0 fail
```

⇒ oracle finding 4 指出的「`slice` 截断 ⇒ 静默变绿」已**实测**堵住。

## 验证

- `bun test tests/` = **490 pass / 0 fail**（8 files，2147 expect）
- `scripts/check-upstream-anchors.sh` = **23/23** OK
- `openspec validate resume-precheck-guidance` 通过；`openspec status` = 3/3 artifacts

## 结论

治理面改动双审闭合（无 BLOCKER，两条 SHOULD_FIX 与三条 NIT 均已处置并可追）⇒ 可合入。
遗留登记见 `openspec/changes/resume-precheck-guidance/design.md` §6（L1/L2/L3 → 与其它遗留一并立项）。
