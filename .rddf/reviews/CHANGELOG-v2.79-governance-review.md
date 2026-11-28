# 审稿记录：v2.79 主题文档闭集收口（治理面）

- **审查域**：治理面（`docs/CHANGELOG.md` 在 `governance-paths.json` 清单内；同批还触及 `docs/architecture/plan-topics-topic-model.md`、`docs/adr/ADR-plan-collaboration-hardening.md` 与一条测试 —— 按 **ADR 行 / 主题文档行** 处理：只同步/对账 ⇒ **只 oracle、不需 critic**）
- **审查者**：oracle（只读；未改文件、未跑测试）
- **轮次**：第 1 轮 **BLOCK**（1 条，很硬）→ 修复 → 第 2 轮**复审**（只验闭合 + 本轮新增 diff）⇒ **PASS-WITH-NOTES**
- **critic 是否需要**：**不需要** —— 本 patch 未增删/修改表格行、不变式条目、自查清单项、触发条件（文档段落改写 + 一条测试断言 + 清单 1 处 `find` 修正）⇒ 不触发 critic 必审条件。

## 第 1 轮 BLOCK：`edits[23]` 的 `find` 缩成 1 行 ⇒ **静默改掉回滚语义**

**oracle 的根因**（我复核后确认属实）：原 `find` 跨 **7 行**（闭集枚举行 + 空行 + 「**结算门**（D4…）」prose 段），而 `replace` 只给回 **20 码单行** ⇒ 回滚的净效果本就包含**删掉结算门段**（对应 ADR 回滚步骤 ②「撤结算两码 + grandfather 与结算段」）。我把 `find` 缩成 1 行（271 字符）后，回滚只把闭集行换回、结算门段**原封不动留文** ⇒ 回滚后文档描述的是已被删掉的判据（`settlement_missing` / `settlement_failed_not_superseded` 在回滚后的闭集里已不存在），而 **drill 因无断言对着该段 ⇒ 假绿**。

**闭合**：`find` 修回 = **新闭集行 + 原「空行 + 结算门段」**（7 行 / **1173 字符**），`replace` **不动**（其职责是忠实还原 hardening 之前的字面 20 码形态）。

**证据（三条互相独立）**：

| # | 证据 | 结果 |
|---|---|---|
| 1 | `bun test tests/rollback-manifests.test.ts` | **42 pass / 0 fail**（`find` 在当前文本恰好命中 1 次；形态基线未越界：默认 `{sep 0, pipe 1, maxLen 2894}`，实测 1173） |
| 2 | `bun scripts/rollback-drill.ts <清单> --keep` + **副本核实** | drill **PASS**（基线 `ed8a004`）；副本里：文档 `settlement_` 命中 **0** ／ 闭集行回到「（20 个）」／ 回滚后闭集 **20 码** ⇒ 三者自洽；计数断言（`20 == VIOLATION_CODES.length`）在副本里同样绿 |
| 3 | 复审的**静态穷举** | `grep -i settlement` 该文档 ⇒ **只有 78/79/80 三行**，全部落在 `find` 的 75–80 区间内、`replace` 内零命中 ⇒ 「回滚后 0 命中」是**逻辑必然**，不是抽样巧合；`find` 与 `replace` 的字符数（1173 / 421）逐字对得上 `wc -m` 实测 |

**复审补记**：`replace` 逐字等于 `61ae526^` 的第 75 行 + `\n`（421 字符）✓；段尾衔接正常（`find` 结束于第 80 行 `\n`，其后保留空行 + 「**退出码**」段）✓；形态基线三闸全过且比原 1442 更小 ✓。

## 第 2 轮复审（PASS-WITH-NOTES）的核验摘要

- CHANGELOG v2.79 逐条对得上：1442 → 1173 / 271 / `replace` 不动 / 基线 `ed8a004` / `settlement_` 命中 0 / 43 个测试文件且 1395+1 = 1396 / census 16 active + 3 exempt（无 proving）。
- 「仍未做」那条**准确**：该文档第 79 行手抄 4 个 `synth_*` + 以「V6 三码」代称（`grep` 证实该文档没有任何一处枚举 V6 三码）；`tests/` 里对 `REPAIRABLE_SYNTH_CODES` 的清单**零断言**。
- ADR 的 D7 SU-2 bullet① 与测试断言（正则）与现文一致，且回滚态下 `（20 个）` + `VIOLATION_CODES.length = 20` ⇒ 断言同样绿。
- **本域未覆盖（如实登记，不伪造信心）**：`1395 pass / 1 skip / 0 fail` 与 anchors 31/31 未由 oracle 复算（只读 + 不跑测试口径；只核实了 43 个测试文件与算术自洽）；`last_drill.content_hash` 未复算（`stripLastDrill` 排除该字段 ⇒ 理论上回填不影响哈希）。

## 本批顺带挖出的教训（值得记住）

> **drill 只保证「回滚后 `bun test` 全绿」，不保证「回滚真的撤掉了该撤的东西」。** 这类「断言覆盖不到的语义漂移」，drill 是盲的；本轮的闭合靠的是**副本静态穷举 + 字符数逐字比对**，比再跑一遍测试更强。

## 未在本批落地的已知项（下一批候选，均已定位）

### 1. 同类「运行期常量被手抄」的收口候选（复审逐处定位）

| 常量（真源） | 手抄位置 |
|---|---|
| `REPAIRABLE_SYNTH_CODES`（`lib/plan-topics.ts`） | `docs/architecture/plan-topics-topic-model.md:79`（4 条 + 「V6 三码」代称）／`prompts/plan.md:315`（V6 三码**明列** ⇒ 两处形态不一致、各自陈旧）——「第四份副本」 |
| `UNREPAIRABLE_SYNTH_CODES` | `prompts/plan.md:316` 用 `synth_dep_*` **通配压缩** ⇒ 扩容方向不自洽（新增不带该前缀的不可修复码会静默缺失）；`UNREACHABLE_SYNTH_CODES`（`synth_answer_missing`）未提及 |
| `SETTLEMENT_REQUIRED_KEYS` | 该文档 `:77` + `prompts/plan.md:314`（7 键枚举 + 「7 个必填键」计数，两处手抄） |
| `SETTLEMENT_CRITERIA_SINCE` | 该文档 `:80` + `prompts/plan.md:317`（日期字面量 `2026-11-27`） |
| `INFO_CODES` | 该文档 `:72-73` |
| `SYNTH_ID_RE` | 该文档 `:25,26,27,77,150` + `prompts/plan.md:304,305`（共 7 处） |
| `NODE_ID_RE` / 黑名单 | 该文档 `:21` + `prompts/plan.md:223` |
| `STATUS_SENTINEL` | 该文档 `:19` + `prompts/plan.md:221` + `prompts/plan-worker.md:20` |
| `TOPIC_GOAL_SECTIONS` | 该文档 §1/§4 + `prompts/plan.md` |
| `C_TOKEN_RE` 的 `C1–C99` 界 / `CHAIN_WINDOW = 3` | `prompts/plan.md:327` + `prompts/plan-worker.md:38` |
| §5「命令面」表 | 该文档 `:86-97` + `prompts/plan.md`（手抄 `plan-topic-check` 的 `switch` 分支集） |

> ⚠ 收口它们大多要动 `prompts/plan.md` 与主题文档 ⇒ 连带 4 处以上 `find` 刷新 + 一轮完整 drill 往返 + **复审**（本轮的教训：`find` 覆盖范围是语义，不是可以随手缩的字符串）。

### 2. 清单精确性小缺口（复审顺带发现）

本批新增的计数断言（`tests/plan-topics.test.ts`）是**机制产物**，但 `plan-collaboration-hardening.json` **没有**对该文件的 edit（只在 **base** `plan-topics.json` 的 `delete[]` 里）⇒ 硬化的**单清单回滚**会留下这条断言（无害：`20 == 20` 仍绿，drill 副本已实测），但清单 `notes` 声称的「机制产物全删」在这一项上不精确。⇒ 下一批二选一：加一条 edit 删该 test，或在 notes 里明写「该断言由 base 清单的 delete 覆盖」。⚠ 复审明确建议**不要为本次闭合再改清单**（任何 `edits` 改动都要撤 `last_drill` + 转 `proving` + 重跑 drill，代价远大于收益）。

### 3. 形态判据的盲区（建议单独立项，不顺手加）

`tests/rollback-manifests.test.ts` 的 `maxLen` 只约束 `find` **长度**，对「`find` 覆盖段数 / 行数」无断言 ⇒ 本轮这类「缩成 1 行改语义」的坑没有形态判据能抓。若要做，属**新判据**（软闸：同清单内 `find` 的行数下界），须单独评审。

## 判据未被改动（自证）

- 本批**未新增机判码**、未改 `VIOLATION_CODES`、未动检查器逻辑 ⇒ 判据面不变；新增的只是一条**对着文档计数**的断言 + 文档段落改写。
- 闸门：`bun test tests/` **1395 pass / 1 skip / 0 fail**（1396 tests / 43 files）；`scripts/check-upstream-anchors.sh` **31/31**；`bun scripts/rollback-registry.ts` **PASS**（16 active / 0 proving / 0 unmanifested / 3 exempt）；`plan-collaboration-hardening` 的 drill **PASS**（基线 `ed8a004`，`settlement_` 命中 0 已核实）。
