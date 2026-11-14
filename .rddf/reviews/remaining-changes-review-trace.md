# 剩余三项 change 的 proposal 审查轨迹（metis → oracle → critic）

> 日期：2026-11-14
> 范围：`delegated-verifier-evidence-gap` / `subagent-contract-critic-enforce` / `class-write-scope-alignment`
> 方法：每项 change 走 **metis（差距分析）→ oracle（会怎么坏）→ critic（与既有契约是否冲突）** 三段；三段的 finding **全部落盘**后才算审完。
> 角色归属：metis = planner 的固定审查者；oracle → critic = architect 的固定配对（顺序不可颠倒）。

## 汇总

| change | metis | oracle | critic | 落盘 finding |
|---|---|---|---|---|
| `delegated-verifier-evidence-gap` | 17 条 | **BLOCK**（7 条） | `APPROVE_WITH_CONDITIONS`（3 SHOULD_FIX + 3 NIT，无 BLOCKER） | 30 条，**全部落盘** |
| `subagent-contract-critic-enforce` | 17 条 | `PASS-WITH-NOTES`（5 条） | `APPROVE_WITH_CONDITIONS`（3 SHOULD_FIX + 2 NIT，无 BLOCKER） | 27 条，**全部落盘** |
| `class-write-scope-alignment` | 17 条 | `PASS-WITH-NOTES`（5 条） | `APPROVE_WITH_CONDITIONS`（1 SHOULD_FIX + 3 NIT，无 BLOCKER） | 26 条，**全部落盘** |

## 抓到的**真问题**（不是措辞挑刺）

| # | 出处 | 问题 | 后果 |
|---|---|---|---|
| 1 | metis #1 | 「不落报告」与「已用轮次记账在报告里」互斥 ⇒ 3 轮上限无法执行、审计痕迹被删 | 改为落**受限报告** `<change>-verify-blocked.md`（不含任何判定结论） |
| 2 | metis #1 | AC1 与 §A 的 kind 优先级**互斥**（AC1 说「取证不可用 ⇒ blocked」，§A 说「有带证据的失败 ⇒ ac-fail」） | AC 与实现文本不可能同时成立 |
| 3 | metis #1 | AC2 与 AC4 **机械冲突**（同一行里 `builder` 出现两次 + `explore` 不得与 `blocked` 同行） | 守卫按字面实现必假失败 |
| 4 | metis #2 | 趋势用「两次 `--since` 相减」**不是分区**（跨会话继承会系统性高估后段违规） | 趋势数据系统性偏高 |
| 5 | metis #2 | 「3/N ≤ 2%」在 `k>0` 时不适用（Rule of Three 只适用零事件）；「快路径 N=110≥150」**恒假** | 门槛判错 + 一条永不触发的伪快路径 |
| 6 | metis #3 | 「写集」≠「授权」：`classAllowRoots` 只是 scope 上限，edit 权限只由 `scopeEditRules` 派生 | AC4 写成「allow」会是**恒真式**（假绿） |
| 7 | oracle #1 | AC2 的「每个类名至多一条 bullet」与 B 段**钦定文本自咬**（`builder` 必然两条） | 守卫对钦定文本假失败 |
| 8 | oracle #1 | anchors 的「无 SKIP」判据在**本机恒假**（无上游源码时脚本按设计输出 SKIP 且 exit 0） | 验收永久卡死 |
| 9 | oracle #1 | `<base>` 字段在简报里**根本不存在** ⇒ 恒走缺省；且 base 不可解析无归宿 | 环境故障被路由成「回 builder 修 AC」，白烧 3 轮额度 |
| 10 | oracle #3 | AC14 的「全域清除」会**误伤已签批的子篇 ADR**（历史陈述是合法的） | 实现者被迫改签批 ADR |
| 11 | critic #1 | 「不得落审稿报告」（全类措辞）与「必须落受阻记录」在同一文件里**字面相抵** | build.md 落地后两节构成二义 |
| 12 | critic #2 | **我声称已闭合、实则未落盘**（脚本中途 assert 失败 ⇒ 前面 3 条修改没写进文件） | 「审查记录」与「实际文本」脱节 —— 由 critic 核 grep 时抓出 |

## 处置原则（三段共用）

1. **恒真 / 恒假判据一律作废**：改为「组合路径」或带前提的判据（如「有上游源码时无 SKIP；本机无源码时允许勾选但须标注」）。
2. **机制事实先核实再写判据**：`classAllowRoots` 只定上限 / `isResume` 结构性免检 / `maxChars` 不带 `!isResume` / `--since` 只过滤子会话 / `gate()` 先 log 后 throw / L2 带 `enforceable:false` —— 全部由 oracle 读码确认后再写进 AC。
3. **「已签批 ADR」只由 ADR 修订流程改**：本轮一处「实施性偏离」（AC5 收窄 ADR V5 的量词）被要求**如实记录收窄说明 + 由 prompt 承接**，而不是悄悄改小。

## 未决 / 后续

- 三份 proposal 的**实施**（代码 + prompt + 守卫）尚未开始；各 change 的 AC 表是实施与验收的唯一判据。
- `class-write-scope-alignment` 的**治理面双审**（改守卫断言 ⇒ critic 必审）在**实施 patch** 时再走一轮（本轮的 critic 审的是 proposal 本身）。
- `subagent-contract-critic-enforce` 仍受**时间门控**：最早累计首轮违规 N ≥ 150 时复评（当前 ≤ 110）。
- `delegated-verifier-evidence-gap` 改 `prompts/build.md` §审查配对 本节自身 ⇒ 实施期的 oracle / critic 结论只能记为**自指审查**。
