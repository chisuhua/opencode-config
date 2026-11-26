# plan-synthesis-offload — 任务

> **判据真源**：`docs/adr/ADR-plan-synthesis-offload.md` 的 `## Verification`（V1–V11b）。
> **V4/V5 实现规格**：`design.md`。**执行路径**：治理面 ⇒ oracle → critic 各 1 轮。
> **B1 四步顺序是硬约束**：① P7 锚点（批内最先，假红即停）→ ② prompts → ③ 载体 → ④ 回滚迁移。

## B1 步骤 0 —— V4/V5 判据规格（先设计）

- [x] `design.md`：解析规则（id 形状 / 内容节点 / 答案节点 / 歧义 id）、V4a/V4b/V4c、V5a–V5d、违规码闭集、退出码、`--json` 形状、测试计划
- [x] 规格自检：三个正则经实测（含「多词反引号不得部分匹配」的修正）

## B1 步骤 ① —— P7 上游语义锚点（批内最先）

- [x] `scripts/check-upstream-anchors.sh` 增 **P7**：`override ?? agent.model`（显式 model 优先于 agent 配置）
- [x] 锚点全绿：**31/31**
- [x] 判别力边界登记：provider 是否真按该模型服务**钉不住** ⇒ 由 V11b 覆盖

## B1 步骤 ② —— prompts（治理面）

- [x] `prompts/plan.md`：增「合成节点（可选）」节 —— 起用阈值（总量 ≳ 50 KB 为主）/ id 形状 / deps 口径 / 产物位置 / 强模型覆盖（机制的一部分）/ 追加式返工与答案惯例 / BRIEF 必含四件（五节结构、`## 根裁决集`、最重项进反哺清单、回指 slug）
- [x] `prompts/plan-worker.md:28`：增「严重度标注必须带稳定 token」（唯一落点；存量不追溯）
- [x] 未打断回滚清单：`tests/rollback-manifests.test.ts` 全绿

## B1 步骤 ③ —— 判据载体

- [x] `scripts/plan-synthesis-check.ts`（**自包含**，不 import `lib/plan-topics.ts`）
- [x] `tests/plan-synthesis.test.ts`（24 例：解析规则 / V4a/V4b / V5a–V5d / V4c / 无合成节点 / graph 异常 / CLI 四值退出码 / 与 `lib/plan-topics.ts` 的交叉断言）
- [x] 新文件闸门：`scripts/` 与 `tests/` 新文件**不在任何既有清单内**（本仓现状）⇒ 本批显式决定：**新增两个，不扩任何清单**（与 `ADR-plan-multi-session-collaboration` 对同类文件的处理一致）
- [x] 机制面零改动：`lib/plan-topics.ts` 与 `scripts/plan-topic-check.ts` **一行未动**（V2）

## B1 步骤 ④ —— 回滚迁移

- [x] `.rddf/rollback/plan-synthesis-offload.json`：`delete` = 两个载体 + 自身；`edits` = 三处文本增补（plan.md 合成节 / plan-worker.md token 纪律 / anchors P7）；`retire[] = ["plan-synthesis-offload"]`（结构化退役，自动清 `manifest_ref` 并转 `retired`）
- [x] registry：`declared` → `proving`（`manifest_ref` = `plan-synthesis-offload`）
- [x] drill PASS 后回填 `last_drill` 并转 `active`（首次：`caa17cb`）

## 审查（治理面双审）

- [x] oracle 第 1 轮：**BLOCK**（F1/F2 BLOCK + F3–F11）⇒ 已修 F1/F2/F4/F5/F6/F10/F11
- [x] oracle 第 2 轮（复审）：**PASS-WITH-NOTES**（无新 BLOCKER）⇒ 已修 note
- [x] critic 第 1 轮：**APPROVE_WITH_CONDITIONS / mergeable: yes / 无 BLOCKER**（SF①–④ + 2 NIT）⇒ 已全部闭合
- [x] 审稿报告：`.rddf/reviews/plan-synthesis-offload-b1-governance-review.md`

## 未做 / 遗留

- [ ] **AC14 / V11b**（provider 实际服务模型，响应级 `session_message.model`）**判据未实现** —— 语义已在 ADR 实施记录确认（2026-11-26），但本批只落了 V4/V5 载体 ⇒ **转交后续批**；ADR 的 V11b 行现仍写「待 B1 实现」⇒ 需 architect 回填为「待后续批」以免指针悬空（critic SF②）
- [ ] **V7**（根上下文降幅 ≤ 60,000 tokens）需**新根会话**实测（本会话根已吸收全部材料 ⇒ 不可归因）
- [ ] **V9**（P7 锚点）已绿 —— 与 ADR 的「B1 步骤 ①」对应，可视为 AC11 达成
- [ ] 父篇前置事实补「subagent 会话侧 = catalog 未暴露（与 `permission.rejected` 是两条拒绝路径）」（architect 面）
- [ ] `design.md` 新增的子编号 **V4a / V4b / V4c / V5d** 需同步进 ADR 的 Verification 表（architect 面）
