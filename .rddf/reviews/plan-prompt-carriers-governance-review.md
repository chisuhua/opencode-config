# 审稿记录：`prompts/plan.md` 补「add 建错规范操作」+「metis 结论落盘载体」（治理面）

- **审查域**：治理面（`prompts/plan.md` 在 `governance-paths.json` 的清单内；同批还触及 `docs/architecture/plan-topics-topic-model.md` 与 `docs/adr/ADR-plan-collaboration-hardening.md` —— 两者按 **ADR 行 / 主题文档行** 处理：只同步/对账 ⇒ **只 oracle、不需 critic**）
- **审查者**：oracle（只读；未改文件、未跑测试）
- **轮次**：第 1 轮 **BLOCK**（4 条）→ 修复 → 第 2 轮**复审**（只验闭合 + 本轮新增 diff）⇒ **PASS-WITH-NOTES**
- **critic 是否需要**：**不需要** —— 按可点数判据：本 patch **未增删/修改表格行、不变式条目、自查清单项、触发条件**（`prompts/plan.md` 的行内补充是操作口径；ADR 只加实施对账节；主题文档只加一条「已知边界」）⇒ 不触发 critic 必审条件。
- **改动范围**：`prompts/plan.md`（3 处行内补充）、`docs/architecture/plan-topics-topic-model.md`（§10 一条）、`docs/adr/ADR-plan-collaboration-hardening.md`（新增 D7 SU-2，只记实施对账）、两份回滚清单的 4 处 `find`（随文本更新）、`.rddf/rollback/registry.json`（两条目 active↔proving 往返 + notes 追加）。

## 第 1 轮 BLOCK 的闭合证据

| # | BLOCK | 闭合 | 证据 |
|---|---|---|---|
| ① | 三段文字被两份回滚清单的 `find` 逐字 pin 住 ⇒ 全失配 ⇒ `bun test` 会红；且回滚面**静默失效** | 同批刷新 **4 处 `find`**：`plan-collaboration-hardening` edits[17]（703→1281 字符）/ edits[19]（157→402）；`plan-topics` edits[5]（594→839）/ edits[8]（1738→2316） | `bun test tests/rollback-manifests.test.ts` ⇒ **42 pass / 0 fail**（含 `sep`/`pipe`/`maxLen` 形态检查 ⇒ 未动 `FIND_SHAPE_BASELINE`）；复审逐清单重放 `planDrill` ⇒ 11 份清单的 find 均「在其时点恰好命中 1 次」 |
| ② | 「cancel + 换 id 重建」在**有下游**时不成立；`--detach` 只删边、加不回 ⇒ 下游不再等该节点而**图仍是绿的**（静默错）；已 done ⇒ `cancel` 硬拒 ⇒ 规范操作被拒 | 写成三分叉：未 done ⇒ cancel（留审计痕迹、不再要求交付物）+ 换 id 重建（deps 指向活节点）；已 done ⇒ 走「追问（已 done）」；有活跃下游 ⇒ `--cascade` 后下游一并重建，`--detach` 只删边 ⇒ 只在「下游本就与本节点无依赖关系」时用 | 复审在实现里逐条对到：CLI 子命令闭集无改 deps 入口；`cancel` 对 done 硬拒 / 有活跃下游未消解则拒 / `--cascade` 递归 / `--detach` 只 `filter` 掉边；`add` 拒复用 id 与「deps 指向 cancelled」；cancelled 节点豁免交付物；`cancelled_dep_active` 只对活跃节点生效 |
| ③ | metis 结论双落点关系未说清（只写 TOPIC.md ⇒ 裁决入口丢；写成前提 ⇒ 下游把未裁决假设当既定前提）；`###` 子标题会截断该节正文 ⇒ `topic_goal_unreviewed` 误报红 | 双落点职责分明 + 「列表条目追加、勿用 `###` 子标题」 | 复审确认与 `topicSectionHasBody`（正文取到下一个任何级别标题为止）一致；与 metis 条目前半句（隐藏意图只是假设 ⇒ 交用户裁决）同向、不冲突 |
| ④ | 「必落」与有码项并列 ⇒ 误读成机判会查 | 两处显式标注「**prompt 义务，无机判** —— `topic_goal_unreviewed` 只判三节在场非空」 | 复审确认 `topic_goal_unreviewed` 实现只判三节在场非空 |

## 第 2 轮复审（PASS-WITH-NOTES）的额外核验（摘要）

- 4 处 `find` 与现文**逐字一致且恰好命中 1 次**；11 份清单按 `planDrill` 的**顺序语义**重放全绿。
- 形态基线未变即可（hardening 实测 `{sep 0, pipe 0, maxLen 2892}` ≤ 默认 `{0,1,2894}`；plan-topics 实测 `{1,1,4934}` ≤ 登记 `{1,1,5229}`）。
- **`content_hash` 独立重算 11/11 份全等**（剥 `last_drill` + 递归排 key）；两在范围内的分别为 `0ee3ee1c…`（sha `f5a32d2`）与 `98f23980…`（sha `ac4d9e4`），且两 sha 都是 HEAD 的祖先 ⇒ V8 自洽。
- registry 全判据（M1/M2/M3/M5/M7/M8/V8/V10）无问题；census 实算 = **16 active / 3 exempt**（与 CHANGELOG 一致）。
- 三处措辞的**关键子句逐字一致**（「只删边、没有 CLI 能把边加回」/「图仍是绿的」/「deps 指向新 id」/「本就与本节点无依赖关系」/「留作审计痕迹」/「不再要求交付物」）⇒ 无规则级漂移。
- ADR 的 D7 SU-2 只是实施对账：**未动 D1–D7 任何决策句、未动 Verification 谓词与勾选、未动后果章** ✓。
- 记录纪律守卫不触发（C6 只扫 `openspec/changes/**/proposal.md` 与 `.rddf/reviews/**/*-verify.md`；C7 的「150」谓词不命中）。

## 本轮新增的实际发现（非 oracle 提出，实测踩到并已登记）

**两份机制的回滚演练存在顺序耦合**：`plan-topics`（base）的 `delete[]` 含 `prompts/plan-worker.md` / `scripts/plan-topic-check.ts` / `lib/plan-topics.ts` —— 三者全在 `plan-collaboration-hardening`（overlay）条目的 `watch[]` 里 ⇒ base 的 drill 副本里，若 overlay 条目处于 `proving`，`lib/rollback-registry.ts` 的 watch 存在性检查**必红**（该检查只对 `proving` / `unmanifested` 生效）⇒ **必须先跑 overlay 的演练并把它转回 `active`，再跑 base 的演练**。本批实际执行顺序 = `ac4d9e4`（overlay）→ `f9cef1d`（base）✓；该约束已登记进 `registry.json` 的 `plan-topics` 条目 notes 与 CHANGELOG v2.78。

## 未在本批落地的已知项（复审 NIT，下批顺带）

> 复审判定：三项都**落在 `prompts/plan.md:217` 或 `:271`** ⇒ 任何改动必然连带刷新 4 处 `find` ⇒ 一轮完整 drill 往返（撤 `last_drill` / 转 `proving` / 先 overlay 后 base 两次 drill / 回填）⇒ **建议与下次触碰该文件的改动同批做，不单独起一轮**。

1. `--detach` 的适用条件改成**可执行形式**：现文「下游本就与本节点无依赖关系」在「有活跃下游」的前提下可消歧为「这条边本身是误记」，字面读会与 CLI 前置条件（`--detach` 目标**必须**是活跃下游）相冲；最坏情况只是 CLI 干净拒绝（不污染图）⇒ 非 BLOCK。
2. 重建**顺序**补一句：`add` 拒「deps 指向不存在的节点」⇒ 下游重建（deps 指向新 id）必须**在新节点 `add` 之后**；现文只说「deps 指向新 id」，顺序靠推断。
3. 标签字面对齐：`:217` 的「未裁决 ⇒ 仅作前提候选，不得当依据」与 `:43` / ADR 的「…+ 各自证伪条件，不得当依据」**字面不同**（同一规则三处两版）⇒ 语义无冲突但属漂移温床。
4. 纯排版：`docs/architecture/plan-topics-topic-model.md` §10 新增 bullet 与前一条之间多一空行（loose list）；不触任何 `find`，可随下次触碰该文件时处理。

## 判据未被改动（自证）

- 本批**未新增机判码**、未改 `VIOLATION_CODES`、未动 `TOPIC_GOAL_SECTIONS`、未动任何检查器逻辑 ⇒ 判据面不变（ADR D7 SU-2 同口径记录）。
- 闸门：`bun test tests/` **1394 pass / 1 skip / 0 fail**（1395 tests / 43 files）；`scripts/check-upstream-anchors.sh` **31/31**；`bun scripts/rollback-registry.ts` **PASS**（16 active / 0 proving / 0 unmanifested / 3 exempt）；两份回滚 drill **均 PASS**（overlay 基线 `f5a32d2`、base 基线 `ac4d9e4`）。
