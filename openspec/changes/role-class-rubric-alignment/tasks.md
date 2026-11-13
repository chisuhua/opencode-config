# Tasks — role-class-rubric-alignment（能力面判据对齐：空间面 + 内容面）

> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC11）。
> 性质：**纯 prompts + 守卫测试**，无代码路径改动；治理面 ⇒ oracle → critic 各 1 轮。

## A. `prompts/plan.md`（派发侧）

- [x] A1 选类表 builder 行 ⇒ 「简报 `scope` **减去架构文档目录**（窄目标派发被拒；宽 scope 下写 arch 路径被拒）」—— 与 build.md 运行身份表一致 → AC1 / AC2
- [x] A2 「选错类」拆成**两种失败形态**：① 窄目标 ⇒ **派发被拒**（硬拒在建 session 之前）② 宽目标 ⇒ 权限拒 ⇒ 后端 `HANDOFF:` 交回 → AC3
- [x] A3 A2 的**归因句**：类×scope 不相容 ⇒ 改派；`scope` 写错 ⇒ 修正后**原类重派**；错误指向 `arch-docs-init.sh` ⇒ **先初始化**（不是改派）→ AC3
- [x] A4 删「机制未启用」过期降级句 ⇒ 「该字段现在**始终生效**（缺省 `builder`；非法值直接抛；`kind=knowledge` 互斥）」→ AC3b / AC4
- [x] A5 新增 `#### 架构内容分流：讨论 / 决策 / 实现` 小节：三路表 + 三个触发问题 + 「派 architect 时 brief 必带候选集」+ 「不重新发明备选」+ 「决策文档只回答三件事」（**条目名引用**，不复制枚举）→ AC6 / AC7
- [x] A6 计划模板「决策日志」⇒ 「方案取舍理由（未决留在本文件；已决的架构决策另见架构文档）」→ AC6

## B. `prompts/front.md`（派发侧）

- [x] B1 四分类「理解性」行 ⇒ 补「**只解释、不落盘**（架构内容该落哪一份、「讨论 vs 决策」怎么分 ⇒ `prompts/plan.md` 的「架构内容分流」小节）」→ AC5
- [x] B2 「实施性」行 ⇒ 补「写改 ADR / 架构文档（**架构决策落盘**）⇒ `architect`」→ AC5
- [x] B3 §3.1 `role_class` 字段说明 ⇒ 两种失败形态 + 删过期句 + 「始终生效」→ AC3 / AC3b / AC4
- [x] B4 §六 排障表 ⇒ 新增「派发**报错**（不是返回结果）：`role_class=... 的 scope 项越界` ⇒ 类 × scope 不相容的硬拒（与 `outcome: busy` 的占槽拒绝不同）」+ 归因动作 → AC3c

## C. `tests/config-guards.test.ts`（投影守卫，新增 1 个 describe）

- [x] C1 AC1 / AC2：两份完整表三行齐 + builder 行含「减去架构文档目录」+ architect / verifier 行一致；front.md 含三个类名 → AC1 / AC2
- [x] C2 AC3：**结构锚定**（非词频）—— plan.md 的 ① / ② 子 bullet + front.md 的 role_class 行；归因句三成因 → AC3
- [x] C3 AC3b：「始终生效」双侧 + `kind=knowledge` 互斥 → AC3b
- [x] C4 AC3c：front.md 排障表的「类 × scope 不相容」行 → AC3c
- [x] C5 AC4：过期句负向（plan/front）+ 存量派发兜底句正向（build.md）→ AC4
- [x] C6 AC5：front.md 的「只解释、不落盘」+「架构决策落盘」+ 标题名引用 + 四关键词双侧齐 → AC5
- [x] C7 AC6：分流小节三路 + 三触发问题 + brief 必带候选集 + 不重新发明备选 → AC6
- [x] C8 AC7：**只引用不复制**（落点路由正文计数=1 + 「只回答三件事」枚举正文计数=1）→ AC7
- [x] C9 AC8：token allowlist + `SLOT_STATES` + 无新 outcome/state → AC8
- [x] C10 describe 头部**边界注释**（钉结构不钉路径全集 / 白名单只覆盖反引号 token / 关键词断言不是语义断言）—— 兑现 proposal 风险行的承诺 → AC8
- [x] C11 回归：`bun test tests/` **500 pass / 0 fail**；`scripts/check-upstream-anchors.sh` **23/23** → AC10

## D. 变红演练（AC9，实测 4 例，还原后全绿）

- [x] D1 plan.md builder 行退回「简报 `scope`」⇒ AC1 红
- [x] D2 plan.md 复制「落点路由」正文 ⇒ AC7 红
- [x] D3 front.md 删「派发被拒」⇒ AC3 红
- [x] D4 plan.md 复制「只回答三件事」枚举正文 ⇒ AC7 红（critic SHOULD_FIX 1 新增断言）

## E. 评审与收口

- [x] E1 oracle 1 轮（`PASS-WITH-NOTES`，5 条全处置）→ critic 1 轮（`APPROVE_WITH_CONDITIONS`，2 SHOULD_FIX + 1 NIT 全处置）—— 记录见 `.rddf/reviews/role-class-rubric-alignment-prompt-review.md`
- [x] E2 proposal Acceptance 镜像 AC1–AC11 逐条勾选 + 验收报告 `.rddf/reviews/role-class-rubric-alignment-verify.md`
