# 补丁记录：AC14 扫描集恢复「活文档」口径（post-archive 修正）

- 日期：2026-11-14
- 性质：**post-archive 修正**（无行为 / 决策变更 ⇒ 不新开 change；按 `prompts/build.md` §审查配对 判例「改守卫 ⇒ oracle → critic 必审」执行）
- 关联（已归档）：`openspec/changes/archive/2026-11-14-class-write-scope-alignment`
- 审查：oracle `PASS-WITH-NOTES`（7 条）→ critic **`APPROVE`**（`mergeable: yes`，无 BLOCKER / SHOULD_FIX；2 NIT 已处置）

## 问题（我自己的实施缺陷）

实施 `class-write-scope-alignment` 时，其 AC14（陈旧写集陈述清除）的扫描集被写成 `prompts/** + docs/** + commands/**` ⇒ **漏了 `.rddf/**`**，留下**三处现在时的假陈述**（都声称 verifier 的 edit 边界只含 `.rddf/reviews/**`，与 shipped code 矛盾）：

| # | 位置 | 陈旧表述 | 谁在读它 |
|---|---|---|---|
| 1 | `.rddf/improvements/delegated-verifier-evidence-gap.md:61` | 「既有能力不变：verifier 类的 `edit` 边界（**仅** `.rddf/reviews/**`）」 | 约束后续 change 的 Capabilities 声明 |
| 2 | 同上 `:78`（Out-of-Scope 表） | 「verifier 的写集**只有** `.rddf/reviews/**` ⇒ 越类」 | 立项依据 |
| 3 | `.rddf/reviews/backend-handoff-protocol-spec.md:66`（3.1 表） | 「edit 边界 = **仅** `.rddf/reviews/**`」 | **规格件**，被 ADR 元数据当权威引用 |

## 修正

1. **`:61`** 补记账落点（`.rddf/reviews/**` + `.rddf/state/verifier/**`，注明由 `class-write-scope-alignment` 2026-11-14 加入）。
2. **`:78`** 改为「**当时** verifier 类的写集**不含**该子目录 ⇒ 越类（**已由 `class-write-scope-alignment` 于 2026-11-14 关闭**；本行保留为立项依据）」—— **陈述缺口而不复述陈旧契约**（否则「写集只有 `.rddf/reviews`」这句仍会被读成现况）。
3. **spec 3.1 表** 改为「`.rddf/reviews/**`（v5 修订 2026-11-14：+ `.rddf/state/verifier/**` 记账落点）」—— 留旧值痕迹 + 日期，与该文件「历史条目保留原文，仅行尾标注修订」的惯例兼容；版本口径段补 `v5 = v4 + …`。
4. **守卫 AC14 扫描集恢复「活文档清单」**：
   - **扫**：`prompts/**`、`docs/**`（除 `docs/adr`）、`commands/**`、`.rddf/improvements/**`、`.rddf/roadmap/**`、**规格件** `.rddf/reviews/backend-handoff-protocol-spec.md`（单列白名单）
   - **不扫**：`docs/adr/**`（历史 ADR 描述写作时点状态；父篇由 AC10 覆盖）、`.rddf/state/**`（运行时）、`.rddf/reviews/**` 的历史记录
   - **措辞词表补 `只有|限于`**（oracle 实测：`:78` 的「只有」原先会静默绕过）
   - 注释登记**已知未来态缺口**（`.rddf/plans/**`、未归档 open change 的 `proposal.md` —— 当前不存在，出现时扩）
5. **`docs/CHANGELOG.md` v2.23** 条目（问题 / 修正 / 审查 / 验证 / 残留）；结论按「审稿落盘后才可写」的既有规则在 critic 后回填。
6. **根因登记为演进项**（并入 `.rddf/improvements/rdd-verifier-state-consolidation.md`）：把文档投影从「**散文正则**」升级为「**解析表格行 ↔ `VERIFIER_ALLOW_ROOTS` 集合的结构比对**」——枚举式词表本质是开集假设，新措辞必漏；两度先例（`priority_blocked` 提升常量 / accepted roots ↔ `PLAN_REF_ROOTS`）。

## 为什么「实现严格于归档判据」可接受

- 新扫描集是归档 AC14 的**超集** ⇒ 归档判据「命中数 == 0」在新守卫下仍成立且**只会更严**，没有削弱冻结判据；
- 无行为 / 决策变更；唯一新增的 spec 白名单是**收窄排除**（从历史记录区挑出一个活规格件），与归档 AC14「历史区不扫」的意图同向；
- 载体齐：CHANGELOG v2.23（全事件可追）+ 守卫注释（判据边界自载）+ 演进项（根治方向）。

## 验证

- `bun test tests/` = **531 pass / 0 fail**；anchors **23/23**
- **变红演练 3 例**：`:61` / `:78` / spec 表分别改回陈旧表述 ⇒ AC14 各自变红并**精确指出文件**，还原后全绿
- critic 独立复核：扩后词表对全仓 `.md` 命中 8 处、全部落在排除区（`docs/adr` ×2 / 归档 ×4 / `.rddf/reviews` 历史 ×2）⇒ 扫描集内**零命中**
