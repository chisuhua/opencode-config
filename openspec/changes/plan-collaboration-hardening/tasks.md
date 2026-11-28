# tasks — plan-collaboration-hardening

> **判据真源** = `docs/adr/ADR-plan-collaboration-hardening.md` 的 `## Verification`（V1–V13）+ `## 决策`（D1–D6）；**验收标准** = `proposal.md` 的 `## 验收标准`（AC1–AC13，AC↔V 映射 + 状态）。
> **批序约束**：P3 必须先于 P4（`add` 的验收 fixture 前提含三节）；P1/P2 可并批；P5 最后。**每批自带同批面**（判据面 / 文档面 / prompt 面同批齐备，避免中间态红）。
> **每批的同批面**：P0 回滚登记 ｜ P1 配置面 + 治理面自纳入 ｜ P2 结算闭环 + 闭集 20→23 ｜ P3 目标审查 + 主题文档 §10 ｜ P4 动态分解 + 主题文档 §5 ｜ P5 可追溯 + 合成 BRIEF 第 5 条。
> **验收报告**：`.rddf/reviews/plan-collaboration-hardening-verify.md`（13 条 AC 逐条取证；AC11 = 观察项不适用）。
> ⚠ **本文只记「做了什么 + 证据在哪」**；判据正文不在此复述（避免第二份可漂移副本）。

## P0 回滚登记

- [x] registry 加 `plan-collaboration-hardening` 条目（`state=unmanifested` + `watch[]` + `pending_backlog` 指针）
- [x] 新建 `.rddf/rollback/pending/plan-collaboration-hardening.md`（债指针 + 本 ADR 的批序与每批回退动作）
- [x] `bun scripts/rollback-registry.ts` 回绿（无 M1）
- 证据：registry 条目 + pending 文件在盘；`tests/rollback-registry.test.ts` 21 pass

## P1 配置面（模型配置化）

- [x] `plan-models.json`（全局；`schema_version=1` / `synthesis.model` / `fallback[]` / `content.model=null`）
- [x] `scripts/plan-models-check.sh`（schema 校验 + `opencode models` 可用性比对；**fail-closed**：配置缺失 exit 2、no-CLI / 空输出 / 非零退出 / 超时 ⇒ exit 1）
- [x] `prompts/plan.md` 合成派发段改读配置（删硬编码模型 ID 与「先查 models 工具」）
- [x] 同处三条纪律：spawn 失败 ⇒ 同回合 `close` + 按 `fallback[]` 重 `claim`；`fallback[]` 全序失败 ⇒ 停手（**有悬挂才 `reap --confirm`**，否则直接写 `blocked`）；配置缺失 ⇒ 给最小模板并停手
- [x] `.rddf/config/governance-paths.json` 自纳入（`plan-models.json`）
- 证据：`tests/plan-models-check.test.ts` 16 pass（含「非零退出 ⇒ exit 1」）；`bash scripts/plan-models-check.sh` exit 0

## P2 结算闭环（`## 结算记录` + 两码）

- [x] `## 结算记录` 精确形状（`yaml` 围栏块 + **7 必填键**：`checked_at` / `synthesis_check_exit` / `blocking` / `answer_node` / `action` / `model_resolution` / `model_id`）
- [x] `settlement_missing` / `settlement_failed_not_superseded` 两码（收尾条件 = D11 ②全终态 ∧ ③无在飞 ∧ **排除自身**的阻断数 = 0）
- [x] 失败码三分类（可修复 7 码 / 不可修复 7 码 / 不可达 1 码；未分类码 fail-closed）
- [x] `ViolationCode` 闭集 20 → **23**
- [x] `prompts/plan.md` 结算记录义务（父写）+ 三类失败集处置 + 顺序纪律
- 证据：`tests/plan-topics-settlement.test.ts` 29 pass；`check .rddf/plan-topics/v7-probe --phase final` exit 0

## P3 目标审查（`TOPIC.md` 三节）

- [x] 三节载体：`## 前提与证伪条件` / `## 非目标` / `## 目标审查结论`
- [x] `topic_goal_unreviewed`（**仅 `--phase dispatch` 且 ready 非空**；`TOPIC.md` 缺失 ⇒ 视同三节全缺）
- [x] fixture 改造：`tmpTopic()` / `gitTopic()` 默认写三节（存量 fixture 被打红的风险已消）
- [x] `prompts/plan.md` TOPIC 模板段 + 主题文档 §10 重写
- 证据：`tests/plan-topics-goal-review.test.ts` 7 pass；存量 3 个 plan-topics 测试文件全绿

## P4 动态分解（`add` + 追问分流）

- [x] `plan-topic-check add`（原子写 + graph 短锁 + **6 类拒绝**：已存在 id / 非法 id / deps 不存在 / deps 指向 cancelled / deps 重复 / 空 `--title`；**成环在 `add` 路径不可达**，由 `assertAcyclic` 防御性复检）
- [x] 追问分流写进 prompt（未 done ⇒ 改 BRIEF + 新 attempt；已 done ⇒ `add` 新节点；**禁止用 `resume` 替代新 `claim`**）
- [x] 主题文档 §5 命令面加 `add` 行
- 证据：`tests/plan-topics-add.test.ts` 11 pass

## P5 可追溯（结论级证据链）

- [x] `prompts/plan-worker.md` 的 C-token / 证据链纪律（行首、不加列表符号、C1–C99）
- [x] 合成 BRIEF 第 5 条（`**C<n>【判定】**` + 3 行内证据链 / 推断链 + `path:startline` 须在上游字面存在）
- [x] V6 三码（默认 `info`，`--strict-token` 升 `blocking`）
- 证据：`tests/plan-synthesis.test.ts` 40 pass（含 9 个 V6 用例）

## P6 grandfather（v3 定向修订；判据生效前已结算的 topic）

- [x] ADR v3：D4 加 grandfather 规则（由 attempt `max(finished_at)` 派生，不新增父自述字段）+ V8(f) + V10c 改写 + 选项表第 7 行 + 风险 5
- [x] `SETTLEMENT_CRITERIA_SINCE` / `isSettledBeforeCriteria()` + `assertSettlement` 分支（`gap_reason` 抽码集合 ⊇ 可修复码 ∪ 未分类码）
- [x] `build-worker-design` 补结算记录（`accept-with-gap` + 逐码 `gap_reason`）⇒ `--phase final` exit 0
- 证据：`tests/plan-topics-settlement.test.ts`（+9 个 grandfather 用例，含 4 条负向 + 边界日 `2026-11-26T23:59:59Z` vs `2026-11-27T00:00:00Z`）；`check .rddf/plan-topics/build-worker-design --phase final` exit 0

## 收口

- [x] ADR 审稿（oracle 治理面 PASS-WITH-NOTES 6/6 闭合；critic 第 3 轮 APPROVE_WITH_CONDITIONS，2 条 SHOULD_FIX 已修，0 BLOCKER）⇒ `.rddf/reviews/ADR-plan-collaboration-hardening.md`
- [x] 验收（13 条 AC 逐条取证）⇒ `.rddf/reviews/plan-collaboration-hardening-verify.md`
- [x] 实施期门禁（每批）：`bun test tests/plan-topics*.test.ts tests/plan-synthesis.test.ts tests/config-guards.test.ts tests/rollback-registry.test.ts tests/plan-models-check.test.ts` 全绿 + `openspec validate plan-collaboration-hardening` exit 0
- [x] 本 change 的回滚清单（`.rddf/rollback/plan-collaboration-hardening.json`）⇒ registry 条目由 `unmanifested` 转 `proving` → 演练 PASS → `active`
- [ ] **归档**（`openspec archive plan-collaboration-hardening`）：待全仓门绿 + 清单演练回填后执行
