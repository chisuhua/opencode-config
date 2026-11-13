# Tasks — adr-d5-async-completion-wording（Accepted ADR 措辞修订 + 架构类文档的治理归属）

> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC14）。
> 性质：跨 `docs/adr/**`（ADR 行）+ `prompts/**`（治理面）+ `tests/**` 守卫 + `docs/CHANGELOG.md`（治理面）⇒ **治理面双审**（oracle → critic）。

## A. ADR D5 措辞修订（ADR 行，architect 落笔）

- [x] A1 D5「识别」条目改写为**纯观测式**表述（异步路径**没有完成通知** ⇒ 轮询 `sessions` 后读 `rddf feedback list`）+ **逃逸口径**（不必等 `state=idle`：槽位释放是 reconcile-on-read 惰性 ⇒ `running=false` + `outcome=succeeded` 即足以继续）→ AC1 / AC2
- [x] A2 **决策内容 / 选项对比表 / 后果章 / Verification 章 / Status 行零改动**；修订可追落**条目行尾**（日期 + 「无决策变更」）→ AC2 / AC3
- [x] A3 「③ 结束回合（槽自动释放）」补半句「状态投影惰性，识别判据见下行」—— 消除与 A1 的字面张力（critic NIT）→ AC1

## B. 规格件同步（`.rddf/reviews/backend-handoff-protocol-spec.md`）

- [x] B1 **保留原文**（不抹掉 v3 审计痕迹），第 4 条行尾追加 `v4 修订` 注 → AC4
- [x] B2 自定口径段追加 `v4 = v3 + …`（历史条目保留原文，仅行尾标注修订）→ AC4

## C. `prompts/plan.md`（派发侧）

- [x] C1 **删掉**临时消歧句「（ADR D5 所述的『完成』以轮询观测为准，**没有推送通道**）」→ AC12
- [x] C2 异步面 bullet 与 ADR **同一口径**：触发点 = `running=false`；完成判据 = `rddf feedback list`；**不必等 `state=idle`** → AC12

## D. `prompts/build.md`（治理面）

- [x] D1 §治理面作用域表**新增本仓特例裁定行**（本仓既是配置根也是项目仓 ⇒ 其 `docs/adr/**` 属 **ADR 行**、不属治理面；改守卫断言仍 ⇒ oracle → critic 必审）→ AC13
- [x] D2 **新增判例**（Accepted ADR 的描述性措辞修订）：可数豁免边界（只改同一条 bullet 的表述）+ **默认归槽**（不满足豁免 ⇒ 默认按「决策相关」处理 ⇒ oracle → critic，举证责任在修订者）+ Status 行不动 → AC14

## E. 守卫（`tests/config-guards.test.ts`，新增 1 个 describe）

- [x] E1 AC1：切片 D5 的「识别」行 + `not.toMatch(/完成通知后/)` + 「没有完成通知」+ 逃逸口径三组 token → AC1
- [x] E2 AC4：spec 保留原文 + `v4 修订` 注 + `v4 = v3 +` → AC4
- [x] E3 AC8：**机械判据** —— CHANGELOG 可写结论**当且仅当**审稿记录文件已落盘（`existsSync`）⇒ 禁「预先断言」，允许事后如实记录 → AC8
- [x] E4 AC12：plan.md 消歧句已删（负向）+ 「完成信号」/「running=false」/「完成判据以 `rddf feedback list` 为准」/「不必等 `state=idle`」（正向）→ AC12
- [x] E5 AC13 / AC14：裁定行（含「配置根」「项目仓」「oracle → critic 必审」）/ 判例行（含可数正向句 + 排除清单四要素 + 默认归槽）→ AC13 / AC14
- [x] E6 未新增：`SLOT_STATES` 仍 5 值 + 新增文本未引入新标识符（token allowlist）→ AC8
- [x] E7 回归：`bun test tests/` **507 pass / 0 fail**；`scripts/check-upstream-anchors.sh` **23/23** → AC11

## F. `docs/CHANGELOG.md`（治理面）

- [x] F1 v2.22 变更摘要条目（含问题 / 修正 / 审查 / 验证 / 残留）→ AC8
- [x] F2 **不得预先断言**未发生的审查结论 / 归档状态（oracle BLOCK 的直接对象）→ AC8
- [x] F3 审查实际发生后**回填**结论（审稿记录落盘后）→ AC8

## G. 评审与收口

- [x] G1 oracle 1 轮 **`BLOCK`**（CHANGELOG 预断言 + 4 条 finding）→ 全闭合
- [x] G2 critic 1 轮 **`APPROVE_WITH_CONDITIONS`**（`mergeable: yes`，无 BLOCKER；2 SHOULD_FIX + 1 NIT 全闭合）—— 记录见 `.rddf/reviews/adr-d5-async-completion-wording-prompt-review.md`
- [x] G3 proposal AC1 / AC2 / AC5 / AC8 / AC12 / AC14 与实现对齐（判据真源不得与实现矛盾）→ AC1–AC14
- [x] G4 验收报告 `.rddf/reviews/adr-d5-async-completion-wording-verify.md` + Acceptance 镜像逐条勾选
