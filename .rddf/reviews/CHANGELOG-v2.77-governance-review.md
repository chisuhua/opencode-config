# 审稿记录：`docs/CHANGELOG.md` v2.77 条目（治理面）

- **审查域**：治理面（`docs/CHANGELOG.md` 在 `governance-paths.json` 的清单内）
- **审查者**：oracle（只读；未改文件、未跑测试）
- **判定**：**PASS-WITH-NOTES**（N1 建议随本条一起落笔；N2 属 ADR 侧对账，另批）
- **critic 是否需要**：**不需要** —— 按「可点数判据」：本 patch 未增删/修改**表格行、不变式条目、自查清单项、触发条件**，属**叙述性文字**（新增一条历史条目 + 一句覆盖面登记）⇒ 不触发 critic 必审条件。
- **改动范围**：`docs/CHANGELOG.md` 单文件、新增一条 v2.77 条目（零删改）；配套代码改动在 `9d98f2d`（代码 + 清单 + registry 过渡态）与 `4eb9451`（回填 `last_drill` + 转回 active）两个提交里。

## oracle 的事实核对结论（要点）

| claim | oracle 的独立核对 | 结论 |
|---|---|---|
| 闭集 23 码 / 旧快照 15 码 | `lib/plan-topics.ts:86-110`（`VIOLATION_CODES` 23 项 `as const`）+ `:112`（类型由其派生）；`git show 9d98f2d` 显示改前为纯类型联合（23 成员）、改前 `allowed` 为手抄 15 码 | ✅ |
| 「无 `tsc` 门禁」 | `.rddf/commit-gate.json` 的 `verify_commands` 只有 `bun test tests/` + anchors；`package.json` 无 `tsc` | ✅ |
| 完备性断言 + fixture 自证 | `tests/plan-topics.test.ts:33`（`CODE_EMITTER_FILES`）、`:443-458`（四种发射形态）、`:417-425`（完备性 + 反向自证）、`:427-439`（**确有 fixture 自证**，不依赖人工变异） | ✅ |
| 「回滚语义不变」 | 清单第 5 条 edit 的 find 串改前（联合类型形态）改后（数组形态）**都是删这三个码**，`replace` 恒为 `""` | ✅ |
| drill PASS + 证据落盘 | 清单 `last_drill{sha 9d98f2d…, at 2026-11-28, result pass, content_hash af057fed…}`；registry 条目 `state: active`；census 19 条 = 16 active + 3 exempt | ✅ |
| 闸门数字 | 43 files（glob）、1391→1394 = 本批新增 3 条用例、anchors 31/31（23 个调用点 + A7 循环 8 个方法）、census 16-0-0-3 | ✅ |
| 体例 / 无过程日志 | 与 v2.76（13 行）、v2.75（9 行）同型；未写审稿轮次 / BLOCKER 清单 ⇒ 不触「结论须审稿记录落盘后才可写进 CHANGELOG」的规则 | ✅ |

## 逐条处置

| # | finding | 级别 | 处置 |
|---|---|---|---|
| **N1** | 「全部码发射点」的**覆盖面**未如实登记：扫描面硬编码为 2 个文件、形态硬编码为 4 条正则 ⇒ 新增第三个发射文件或改用常量/变量发射码 ⇒ 覆盖面**静默缩小** | 高影响 / 低风险 | **已采纳**：v2.77「断言」段末补一句「⚠ **覆盖面如实登记**：覆盖面 = 两个文件 × 四种发射形态 ⇒ 新增第三个发射文件、或改用常量/变量发射码 ⇒ 覆盖面会静默缩小（同步义务已在 `tests/plan-topics.test.ts` 的常量与函数注释里留痕）」 |
| **N2** | `docs/adr/ADR-plan-collaboration-hardening.md:219` 仍写「`allowed` 集只列 15 码且是子集断言……**属既有缺陷，记 backlog**」—— 本批已闭合该缺陷，但 ADR（Accepted）无对账行 | 中 | **不在本批落地**：ADR 正文属架构文档面，改动需单独一轮 oracle（只同步/对账 ⇒ 按审查配对的 architect 行豁免，不需 critic）。⇒ 登记为待办（见下「遗留」） |
| **N3** | `docs/architecture/plan-topics-topic-model.md:75` 仍手抄 23 码清单（**第三份副本**），且无守卫（只有回滚清单逐字 pin 它 ⇒ 闭集扩容时会静默陈旧） | 低 / 可选 | **不在本批落地**（oracle 明确「本批『只记增量事实』的范围内不算缺陷」）⇒ 登记为待办；⚠ 该文件被回滚清单 `edits` pin ⇒ 改动需同批刷新清单 + 重跑 drill |
| **N4** | v2.77 标题行在加粗闭合后追加了「（闭合 v2.76 的…）」，与既有「`**标题（日期）**：`」形态有细微差异 | 低 / 格式 NIT | **不改**：信息量有价值（闭合指针），且无守卫机械解析标题行 |

## 判据未被改动（自证）

- 本批的判据面改动在 `lib/plan-topics.ts`（闭集的**表示形态**：纯类型联合 → 运行期常量 + 派生类型；**码的集合本身一字未改**，仍是那 23 个）与 `tests/plan-topics.test.ts`（断言改为引用真源 + 新增完备性断言）⇒ **判据谓词未变**（闭集成员、阻断/INFO 分级、结算门语义均未动）。
- `bun test tests/` **1394 pass / 1 skip / 0 fail**（1395 tests / 43 files）；`scripts/check-upstream-anchors.sh` **31/31**；`bun scripts/rollback-registry.ts` **PASS**（16 active / 0 proving / 0 unmanifested / 3 exempt）；`bun scripts/rollback-drill.ts .rddf/rollback/plan-collaboration-hardening.json` **PASS**（基线 `9d98f2d`）。
- 审稿记录落盘**先于** CHANGELOG 的提交（按 `tests/config-guards.test.ts` 的「结论只有在审稿记录落盘后才可写进 CHANGELOG」口径；本条目本身未写任何审查结论）。

## 遗留（不在本批范围）

1. **N2**：`docs/adr/ADR-plan-collaboration-hardening.md:219` 的「既有缺陷，记 backlog」陈述已过时 ⇒ 需另立一条 **D7 SU 对账 bullet**（**不改该行原文** —— 决策记录留存），走一轮 oracle（只同步/对账 ⇒ 不需 critic）。
2. **N3**：`docs/architecture/plan-topics-topic-model.md:75` 的第三份手抄闭集 ⇒ 若收口，需把该清单改成「计数 + 引用真源」并由守卫核；⚠ 该文件被回滚清单 `edits` pin ⇒ 同批须刷新清单 + 重跑 drill。
