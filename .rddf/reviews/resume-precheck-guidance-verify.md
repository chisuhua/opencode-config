# 验收报告：resume-precheck-guidance

- 验收对象：`openspec/changes/resume-precheck-guidance/`（proposal AC1–AC10）
- 验收日期：2026-11-13
- 验收角色：builder 内建的 verifier 环节（角色内建，非 subagent）
- 已用轮次：**1 轮**（无失败项 → 无返工）
- 结论：**通过**（AC1–AC9 结构判据有机器证据；AC10 手工判据有走查记录）

## 判据来源

1. `openspec/changes/resume-precheck-guidance/proposal.md` 的「## 验收标准」表（AC1–AC10）—— 本 change 自身的判据即最高优先级
2. `docs/adr/ADR-backend-handoff-role-class.md`（D5 / D6，**Accepted**）—— 判据的决策依据
3. 本次变更声明的行为（`prompts/plan.md` 新增小节 + 引用改写、`prompts/front.md` §3.3 改写、守卫测试）

## 逐条判定 + 证据

| AC | 判定 | 证据 |
|---|---|---|
| AC1 | ✅ | `tests/config-guards.test.ts`「AC1：A 小节存在且是表格；**表内** feedback → last_assistant_text → outcome 下标递增」—— 表行集合 ≥4 行 + 分隔行形态；下标**只在表行内**计算；标题从 plan.md 动态抽取（围栏外唯一 `###`） |
| AC2 | ✅ | 同文件「AC2：含「outcome=succeeded + state=idle 不等于完成」断言句」 |
| AC3 | ✅ | 同文件「AC3：三条 resume 禁令齐全…+ 可续接的正向条件」（三条禁令 + 正向条件 + 「不需要也不应先 `suspend`」） |
| AC4 | ✅ | 同文件「AC4：增量记账…+ 记账缺失时的降级」（`last_feedback_id` / `created_at` / 「写不进」/「文本 5 项正文」/「不得凭猜测取条目」） |
| AC5 | ✅ | 同文件「AC5：front.md 按**标题名**引用；plan.md 硬规则 #5 与 front.md §3.3 的旧正文已消失」（含两条负向 `not.toContain` + 引用行不含 `§数字` + 硬规则 #5 已改为引用） |
| AC6 | ✅ | 同文件「AC6：5 项模板字段名与 prompts/build.md 的 ①–⑤ 动态对照，且**顺序一致**」—— 字段名从 build.md「5 项缺一即无效」行抽取，测试内**不硬编码**；marker 恰好 5 个；plan.md 顺序 `toEqual(fromBuild)`。**变红演练**：build.md 临时加 ⑥ ⇒ AC6 变红（已还原） |
| AC7 | ✅ | 同文件「AC7：负向 —— 无 handoff_pending / set_class / 正则 / 门禁 / 通知；无新标识符（含大写）」 |
| AC8 | ✅ | 同文件「AC8：未新增状态字段 / outcome 值」—— `SLOT_STATES` 从 lib 导入断言 5 值不变；outcome 值集合从 `front.md` 的 `outcome` 说明行**动态抽取** |
| AC9 | ✅ | `bun test tests/` = **490 pass / 0 fail**（8 files，2147 expect）；`scripts/check-upstream-anchors.sh` = **23/23**；`openspec validate resume-precheck-guidance` 通过；`openspec status` = 3/3 artifacts |
| AC10 | ✅（手工） | 见下方走查记录 |

## AC10 手工走查（给定一条真实交回记录）

**样本**：live e2e（`rdd-workflow-e2e` commit `5b37903`，RC-2 / RC-3）产生的交回记录 ——
首行 `HANDOFF: ac-fail` / `HANDOFF: blocked`，其后是 5 项正文（① kind；② 阻塞点；③ 需要什么决策；④ 已完成 / 未完成；⑤ 建议的下一步指令草案），
台账 `outcome=succeeded`、`state=idle`、ADR 未被改动。

按新小节「交回后的收尾三问」逐步走查：

| 问 | 取证 | 判定 |
|---|---|---|
| ① 为什么交回 | 优先 `rddf feedback` **新增条目**；本次按小节规则用增量记账（派发时刻后的条目）判定为「本轮」。**记账缺失的等价情形**（历史派发 / 上下文丢失）⇒ 退到优先级链 ②：读 `last_assistant_text` 首行 `HANDOFF: <kind>` + 5 项正文 ⇒ 得 kind 与第 ③ 项（需要什么决策 = 改派 `architect` 类 / 补什么决策） | ✅ 证据优先级与降级路径都能定位到唯一结论 |
| ② 我该动什么 | 第 ③ 项是「需别的类」⇒ **重派该类**（`role_class=architect`），不是自己改 ADR；若是「改 plan/AC/tasks」⇒ 先给草案、用户确认后再改；若是「缺外部信息」⇒ 交用户 | ✅ 三路分流与样本的 kind 相符 |
| ③ 续接还是重派 | 三条禁令：本次**不是**扩 scope，但换类在同 session 内显式声明不同 `role_class` 会被硬拒 ⇒ 存量/换类一律**重派**（新 session，上下文不继承、计划要点重贴）；交回后 `state=idle`、槽已释放 ⇒ **不需要也不应先 `suspend`**（与「切换是四步」处理的是抢占运行中后端，不是同一件事） | ✅ 结论 = 重派，不 resume，不先 suspend |
| 交回后不接管实施 | 主会话只做路由（重派 / 改计划草案 / 问用户），**不自己上手**改被交回的那部分 | ✅ 与 plan 角色「你不写实现」一致（plan 的写集只有 `.rddf/plans/**`） |

**走查结论**：AC10 成立 —— 给定该交回记录，证据优先级能定位唯一结论、分流为「重派 `architect` 类」、且主会话不接管实施。

## 遗留清扫复核（本次范围内）

| 项 | 结果 |
|---|---|
| TODO / FIXME / XXX / HACK | `git diff` 新增行 grep **零命中** |
| 临时调试日志 | 新增行 **零命中** |
| 被 skip 的测试 / `only` | 无 |
| 未替换的 mock | 无 |
| 半截实现 | 无（新小节 6 条要点 + 3 条禁令 + 正向条件全部有断言覆盖） |
| 治理面评审闭合 | oracle `PASS-WITH-NOTES`（8 条全处置）→ critic `APPROVE_WITH_CONDITIONS`（2 SHOULD_FIX + 3 NIT 全处置）—— 记录见 `.rddf/reviews/resume-precheck-guidance-prompt-review.md` |
| follow-up 可追 | `openspec/changes/resume-precheck-guidance/design.md` §6「遗留登记」（L1 ADR D5:84 措辞 / L2 `backend-handoff-protocol-spec.md:45` / L3 `build.md:482` 全类断言） |

## 归档前条件核对

- ✅ tasks 全勾（AC1–AC10 全有对应 task 行）
- ✅ `openspec validate` 通过；工件齐备（proposal / design / tasks；`skip_specs` 无 spec delta）
- ✅ 遗留清扫通过
- ⚠ **已知漂移（非本 change 造成）**：`docs/adr/ADR-backend-handoff-role-class.md:84`（D5）的描述性措辞与工具契约不一致 —— 已登记为 L1（architect 修订），**不阻塞本 change 归档**（D5 的机制决策本身与本实现一致）

## 结论

**PASS** —— AC1–AC10 逐条有证据（AC10 为手工走查，记录在案）⇒ 可归档
（`openspec archive resume-precheck-guidance --skip-specs`）。
