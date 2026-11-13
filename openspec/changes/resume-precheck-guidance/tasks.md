# Tasks — resume-precheck-guidance（交回后的收尾三问）

> 性质：**纯 prompts + 守卫测试**，无代码路径改动（proposal 非目标）。
> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC10）。

## A. 唯一真源（`prompts/plan.md`）

- [x] A1 新增「交回后的收尾三问」小节：**表格**三问（为什么交回 / 我该动什么 / 续接还是重派）+ 证据优先级链 `rddf feedback` 新增条目 **>** `last_assistant_text` 首行 **>** `outcome` / `state` → AC1
- [x] A2 「`outcome=succeeded` + `state=idle` 不等于完成」断言句 + 异步面**无完成信号**（触发点 =「用户回来」或「下次读 `sessions` 看到 `running=false`」）→ AC2
- [x] A3 列出 5 项模板（① `kind` ② 阻塞点 ③ 需要什么决策 ④ 已完成 / 未完成 ⑤ 建议的下一步指令草案）→ AC6
- [x] A4 **resume 三条禁令**：扩 `scope` ⇒ 新建 session（上下文不继承）/ 不得显式声明不同 `role_class`（硬拒）/ 存量条目一律重派不复用 → AC3
- [x] A5 **增量记账**（派发时记 `last_feedback_id`，只认 `created_at` 晚于派发时刻的条目）+ `rddf` 写不进时的文本兜底（新增为空且首行 `HANDOFF:` ⇒ 以文本 5 项正文为准）→ AC4
- [x] A6 「交回后不接管实施」：只做路由（改计划草案 / 重派 / 问用户）→ AC10

## C. 引用改写（`prompts/plan.md`）

- [x] C1 硬规则 #5 由「凭据在哪 + 按第 ③ 项分流」的正文改为**引用小节标题名**；旧重复正文删除 → AC5

## B. 引用改写（`prompts/front.md`）

- [x] B1 §3.3 的 `HANDOFF:` 分流句改为按**标题名**引用（不写 `§x.y` 编号）；旧重复正文删除 → AC5

## D. 守卫（`tests/config-guards.test.ts`）

- [x] D1 新增 describe「交回后的收尾三问（resume-precheck-guidance 投影守卫）」：8 条断言覆盖 AC1–AC8 → AC1 / AC2 / AC3 / AC4 / AC5 / AC6 / AC7 / AC8
- [x] D2 动态对照（测试内**不硬编码**）：5 项字段名从 `prompts/build.md` 的「5 项缺一即无效」行抽取；outcome 值集合从 `prompts/front.md` 的 `outcome` 说明行抽取；`SLOT_STATES` 从 `lib/delegate-core.ts` 导入 → AC6 / AC8
- [x] D3 回归：`bun test tests/` **490 pass / 0 fail**；`scripts/check-upstream-anchors.sh` **23/23** → AC9

## 手工判据

- [x] AC10 给定一条交回记录 ⇒ 按证据优先级分流、且**不接管实施**（手工走查记录见 `.rddf/reviews/resume-precheck-guidance-verify.md`）

## 评审与收口

- [x] oracle 1 轮（治理面首审）→ critic 1 轮（第二审）—— 记录见 `.rddf/reviews/resume-precheck-guidance-prompt-review.md`
- [x] proposal Acceptance 镜像 AC1–AC10 逐条勾选 + 验收报告 `.rddf/reviews/resume-precheck-guidance-verify.md`
