# 审稿记录：oracle 调用前的意图检查点（治理面）

> 触发：用户提问「启动 oracle 之前先挖掘 hidden intent / ambiguity / AI slop / missing AC / edge cases 是不是更合理」→ 分析确认缺口在 architect 路径 → 用户选定「方案 1+2，落成治理面改动」
> 角色：architect（治理面）｜日期：2026-11-16
> 结论：**采纳**。oracle `PASS-WITH-NOTES`（0 BLOCKER）→ critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER，mergeable: yes）
> 改动文件：`prompts/oracle.md`、`prompts/build.md`、`opencode.jsonc.opencode-go`（oracle `description`）、`docs/MULTI-AGENT-DESIGN.md`、`docs/SUBAGENT-ORCHESTRATION.md`、`docs/CHANGELOG.md`

---

## 1. 缺口（取证）

| 事实 | 证据 |
|---|---|
| plan agent 路径**已有** metis 硬性前置（先于 explore/librarian/oracle，且不并行） | `prompts/plan.md:38-42` |
| metis 的输入本就允许「一份准备进入规划的 prompt」 | `prompts/metis.md:7` |
| architect 路径的审查链是 oracle → critic，**无**意图/歧义检查点 | `prompts/build.md:485`（审查配对 architect 行） |
| metis 在 architect 的允许列里，但只是**自由裁量**的调研工具，无顺序约束 | `prompts/build.md:449` |
| oracle 的输出四节（根因 / 建议 / 已排除的替代方案 / 下一步）**不含**「问题陈述对不对」 | `prompts/oracle.md:56-70` |
| metis 无判定行、无输入契约，产出是改稿建议不是通过闸门 | `.rddf/reviews/metis-check-findings.md:64` |

**后果链**：意图偏了 ⇒ oracle 在错误的「目标场景」里给出专业但错误的方案对比 ⇒ critic 只判「与既有 ADR 一致」⇒ **一致地错** ⇒ 错到 ADR 签批后才在 planner 的 metis 或实施阶段暴露 ⇒ `design_drift` ⇒ 整轮 architect 返工。

## 2. 改动清单

| # | 文件 | 改动 | 归属方案 |
|---|---|---|---|
| 1 | `prompts/oracle.md`「模式」段 | 新增**意图前提**表（3 行输入状态）+ 三轴措辞（审查 / 咨询 / 拿不准）对齐；未新增判定词 | 方案 1（执行体侧） |
| 2 | `prompts/build.md` `:39` 入口行 | 审查形态补「**可判定的意图陈述**」+ 指向检查点小节 | 方案 1 |
| 3 | `prompts/build.md` §审查配对 新增小节 | 「oracle 调用前的意图检查点」：4 行分流表（明确 / 只有用户知道 / 未枚举 / 两者都缺）+ 8 条 bullet | 方案 1 + 方案 2 |
| 4 | `prompts/build.md` §审查配对 表 architect 行 | 触发条件格 + 指针；预算格 + 「metis 至多 1 轮 / 拒发重跑不另计」 | 方案 2 |
| 5 | `prompts/build.md`「治理面判定（verdict）」段 | 新增第 3 条硬条件：**已调用但拒发判定行 ⇒ 审查不成立 ⇒ 不得收口**（并排除「oracle 不可用」→ 走降级路径） | 方案 1 的收口 |
| 6 | `opencode.jsonc.opencode-go` oracle `description` | 补意图陈述要求 + 指向 `prompts/oracle.md`「模式」段 | 防 F3 型「入口行漏写」 |
| 7 | `docs/MULTI-AGENT-DESIGN.md` §2.7 / §3.2.0 | 索引同步（表指针 + 摘要段，含被派发后端分档） | 防漂移 |
| 8 | `docs/SUBAGENT-ORCHESTRATION.md` §3 | 索引同步（意图闸门摘要） | 防漂移 |

**关键设计取舍**（为什么不照搬 plan 路径的无条件硬前置）：
1. **意图不是模型能挖的** —— 「隐藏意图」只有用户有权威；模型猜出来的意图当 oracle 的输入前提 = 把不确定性前置而非消除。故意图类问题走 `question`，metis 只负责**可枚举**的歧义 / slop / 边界情况。
2. **零新增轮次优先** —— 方案 1 把闸门做成输入前置条件（0 额外 agent 调用）；只有「真需要枚举」时才加一轮 metis（轻量链路 `deepseek-v4.1-flash`，边际成本比 oracle（`kimi-for-coding` + `variant: max`）低一个数量级）。
3. **不新增判定词** —— 「无判定行 ⇒ 审查不成立」由父侧规则承载，词表单一真源（`prompts/oracle.md`）不动，守卫断言（`tests/config-guards.test.ts:1125-1136`）不红。

## 3. oracle 审查（治理面档，第一审查者）

判定：**`治理面判定: PASS-WITH-NOTES`**（0 BLOCKER / 2 高影响 / 2 中等 / 1 可选）

| # | 严重度 | finding | 处置 |
|---|---|---|---|
| O1 | 高 | 「无判定行 ⇒ 审查不成立」只写在检查点 bullet，而治理面收口的**操作段**（verdict 段）条件集不含「无判定」⇒ 可被机械执行穿过 | **已修**：verdict 段新增第 3 条硬条件（改动 #5） |
| O2 | 高 | 被派发 architect 后端**无 `question` 通道**（`lib/delegate-core.ts:69` 常量 deny + `:91` 永不可 grant）⇒ 照字面执行 row 2 无法落地 | **已修**：新增「被派发后端」bullet（意图陈述由派发方在 brief 的 `goal`+`acceptance`+`constraints` 给齐；缺失 ⇒ `HANDOFF: blocked`），并把 row 2 的「谁做」格指向该条 |
| O3 | 中 | 检查点处置无**落盘载体**（降级自检清单第 5 条） | **已修**：「落盘载体」bullet —— 审稿报告必须记录意图检查点处置 + 判定行原文（或「无判定（意图未定）」） |
| O4 | 中 | 条件式 metis 在 ADR 路径**无轮次上限**（清单第 6 条） | **已修**：「预算」bullet + 审查配对表 architect 行预算格（每 ADR 至多 1 轮、不占 improvement 级预算、不触发复审、拒发重跑不另计） |
| O5 | 低 | `docs/MULTI-AGENT-DESIGN.md` §3.2.0 表可加指针（oracle 说「不加也行」）；建议给守卫加 `toContain` 断言 | **§3.2.0 已加**（一行，防漂移）；**守卫断言本轮不做** —— 该测试文件属治理面、需另起一轮 oracle → critic，记入第 5 节 backlog |
| O6 | 低（不建议做） | 让 oracle 在咨询口径输出首行加「（咨询口径：未给判定）」负向标记 | **不采纳** —— 会在判定词表单一真源门口新增准判定短语，收益不抵成本（同意 oracle 的反对意见） |

## 4. critic 审查（`arch` 档）

判定：**`APPROVE_WITH_CONDITIONS`**｜`mergeable: yes`｜`scope_exceeded: false`

critic 逐条核过三个 focus（自相矛盾 / 死锁 / 第二套判定标准），均判「不成立」：
- architect 允许列**本含** metis（`:449`）⇒ 新增调用不越权；主会话 `question: allow` 属实（`opencode.jsonc.opencode-go:88`）；
- 「顺序不可颠倒」只管 oracle↔critic，闸门插在 oracle 之前不构成颠倒；规则显式 scoped「（architect 路径）」⇒ 不误伤 verifier/builder；
- 拒发 ≠ 不可用，触发条件可区分；且「≥2 种合理解读仍给判定行」把最常见拒发原因移出拒发空间 ⇒ 剩余拒发必经过用户/派发方，有界，**不构成死锁**；
- 「可判定的意图陈述」三处表述逐字一致，caller 侧分流表与执行体侧前提表是**分层防线**而非矛盾口径。

| # | 严重度 | finding | 处置 |
|---|---|---|---|
| C1 | SHOULD_FIX | `prompts/build.md:535`「oracle 未给判定行 ⇒ 不得收口」**触发面过宽** —— 同时覆盖 (a) 已调用但拒发（目标）与 (b) 不可用根本没调用成功；后者由「审查者不可用时」降级路径管辖 ⇒ 同一可观测状态两个出口 | **已采纳并修**：窄化为「**oracle 已调用但拒发判定行**（意图未定）」，并补「oracle **不可用**导致的无判定行 ⇒ 走『审查者不可用时』降级，**不适用**本条」。（按 §评审预算：SHOULD_FIX 不触发复审，本轮无复审轮次消耗） |
| C2 | NITS | architect 行预算格未枚举 metis 面；「意图拒发后的 oracle 重跑是否计入 oracle 1 轮」未点数 | **已修**：预算格补「metis 至多 1 轮；因意图拒发而重跑的 oracle **不另计**（补齐同一轮，非新一轮审查）」 |
| C3 | NITS | oracle `description` 是规则的**第三份文本副本**，建议改指针式以降漂移面 | **部分采纳**：已补指向 `prompts/oracle.md`「模式」段；**保留可执行要求**（description 是父模型选 subagent 时唯一会读的位置，纯指针会失去作用）。**完全指针化**记入 backlog |

critic 的验证建议「收口前复跑守卫」已执行（见 §6）。

## 5. 残留 / backlog（交用户决定，本轮不做）

1. **守卫断言**：`tests/config-guards.test.ts` 现只锚定判定词表，新语义（oracle.md 的「意图前提」段、build.md 的「oracle 调用前的意图检查点」小节）对守卫**不可见** ⇒ 可新增两条 `toContain` 断言。该测试文件属治理面（`prompts/build.md` 治理面作用域表），增补需**另起一轮** oracle → critic。
2. **oracle `description` 完全指针化**：降漂移面，但牺牲父模型的直接可读性 —— 需先确认 description 是否支持多行/长度预算再决定，本轮不动。
3. **软约束的可靠性**：本规则无机器校验（未给 oracle 加 L1–L5 输入契约）。四层防御（入口行 / description / 检查点小节 / verdict 段）只能提高采纳率，不能保证。oracle 明确评估「可接受（前提是 O1 的镜像行已补）」。

## 6. 验证

| 项 | 结果 |
|---|---|
| `python3 -c "import json;json.load(open('opencode.jsonc.opencode-go'))"` | **JSON OK**（`opencode.jsonc` 是指向它的符号链接） |
| `bun test tests/config-guards.test.ts` | **103 pass / 0 fail**（1426 expect；本轮未改任何断言） |
| 审查预算记账 | oracle 1 轮 + critic 1 轮 = **§审查配对 治理面行的「一次改动」预算**；0 BLOCKER ⇒ **无复审**；本轮改动同时触及 `prompts/**` + `docs/` 索引 + 配置 agent 段 ⇒ 属**一个 patch series**，不按文件数相乘 |
| 自指审查 | 本 patch 改 `prompts/oracle.md` 本身 ⇒ oracle 实例跑的是**旧契约** ⇒ 该轮结论**不构成独立证据**；critic 未改契约，不受此限 |
