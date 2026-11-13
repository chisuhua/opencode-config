# 审稿记录：ADR-backend-handoff-role-class

> 审稿对象：`docs/adr/ADR-backend-handoff-role-class.md` + `docs/backend-handoff-role-class.md`
> 依据：`.rddf/reviews/backend-handoff-protocol-spec.md`（v3 裁定表）
> 档位：`arch`

## 轮次与判定

| 轮 | 审查者 | 判定 | 说明 |
|---|---|---|---|
| 1 | oracle | `PASS-WITH-NOTES`（8 条唯一裁定） | 审的是**工作规格 v2**（同一决策内容），非 ADR 文本；裁定已原样吸收为 D1–D9 |
| 1 | metis | 6 条 P0 + 8 个边界场景 | 差距分析；P0 已并入 v3（pair.json 来源、合并边界、kind 映射、白名单、禁自审等） |
| 2 | critic | `APPROVE_WITH_CONDITIONS`，`mergeable: yes`，`scope_exceeded: false` | 无 BLOCKER；3 条 SHOULD_FIX + 1 NIT，全部在范围内并已闭合 |

**预算**：architect 每 ADR = oracle 1 轮 + critic 1 轮；本轮无 BLOCKER，不触发复审。

## critic findings 与处置

| # | 级别 | finding | 处置 |
|---|---|---|---|
| 1 | SHOULD_FIX | 缺回滚口径（`role_class` 是持久化 schema 增量） | 已在「后果 / 代价」新增「回滚口径」小节：停传即回缺省 builder、旧读者 `?? "builder"`、无需迁移 |
| 2 | SHOULD_FIX | D9 / AC12 的「D4/D7」与本篇 D4/D7 同名不同义 | 改为「父篇 D4（单槽）/ 父篇 D7（优先级、跨 owner-kind 硬拒）」 |
| 3 | SHOULD_FIX | resume 对存量 `pair.json` 条目（无 `role_class`）判型未写 | D6 补「存量条目按缺省 `builder` 解释，与 D1 一致」 |
| 4 | NITS | 纯换类走 `blocked` 不复用 `revision_count` 缺理由 | 补一句：`revision_count` 衡量「同一 change 被修订几轮」，纯换类不改变计划内容 |

另：设计文档「验收」章的 AC 区间由 AC1–AC13 订正为 AC1–AC14（与 ADR 对齐）。

## critic 明确不报的项（记录备查）

- spec v3 §1 偏差表第 3 行与 R-5 的字面张力：v3 首行已声明「裁定表是唯一口径」，有仲裁机制，不构成自相矛盾。
- architect 类后端编辑 `docs/MULTI-AGENT-DESIGN.md` 会被自身 edit 边界拒绝：改动面表的「归属 architect」指**主会话** architect（治理面授权），不是被派发后端体。
- AC 编号漂移：属 L1 一致性脚本职责。

## 结论

无 BLOCKER，SHOULD_FIX 已闭合 ⇒ ADR 从 `Draft` 转 `Proposed`，等用户签批后转 `Accepted` 并立项（立项归 planner）。
