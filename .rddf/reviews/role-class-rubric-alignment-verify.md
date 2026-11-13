# 验收报告：role-class-rubric-alignment

- 验收对象：`openspec/changes/role-class-rubric-alignment/`（proposal AC1–AC11）
- 验收日期：2026-11-14
- 验收角色：builder 内建的 verifier 环节（角色内建，非 subagent）
- 已用轮次：**1 轮**（无失败项 → 无返工）
- 结论：**通过**（AC1–AC10 有机器证据；AC11 为治理面双审闭合证据）

## 判据来源

1. `openspec/changes/role-class-rubric-alignment/proposal.md` 的「## 验收标准」表（AC1–AC11）
2. `docs/adr/ADR-backend-handoff-role-class.md`（D1–D9，**Accepted**）—— 行为契约的决策依据
3. 本次变更声明的行为（`prompts/plan.md` 6 处 + `prompts/front.md` 4 处 + 守卫 describe）

## 逐条判定 + 证据

| AC | 判定 | 证据（`tests/config-guards.test.ts` 新 describe / 全量） |
|---|---|---|
| AC1 | ✅ | 「AC1：两份完整表的 builder 行一致（都含「减去架构文档目录」）且三行齐」—— `tableAfter` 分别定位 plan.md 选类表与 build.md 运行身份表，逐表断言三行齐 + builder 行 token |
| AC2 | ✅ | 「AC2：两份表的 architect / verifier 行一致；front.md 出现三个类名与 architect 落点」 |
| AC3 | ✅ | 「AC3：…（**结构锚定**，非词频）」—— plan.md 的 ① / ② 子 bullet（① 段含「派发被拒」「类 × scope 不相容」「原类重派」「arch-docs-init.sh」，② 含「交回」「重派」）+ front.md「填错有两种形态」行六词断言 |
| AC3b | ✅ | 「AC3b：「始终生效」与 `kind=knowledge` 互斥被钉住（文档口径；字段值语义由 lib 侧负责）」 |
| AC3c | ✅ | 「AC3c：front.md 排障表有「类 × scope 不相容」的硬拒行（与占槽拒绝区分）」 |
| AC4 | ✅ | 「AC4：过期降级句已删（plan/front）；存量派发兜底句仍在（build.md）」—— 负向「机制未启用 / 机制未落地」×2 + 正向「机制未启用时的缺省口径」「不得因字段缺失臆造一个 class」 |
| AC5 | ✅ | 「AC5：front.md 可见「架构决策落盘 ⇒ architect」且与 plan.md 分流判据同源」—— 含「只解释、不落盘」「架构决策落盘」「架构内容分流」（标题名引用）+ 四关键词（讨论/决策/落盘/架构文档）双侧齐 |
| AC6 | ✅ | 「AC6：plan.md 的「架构内容分流」小节含三路 + 三个触发问题 + brief 必带候选集」+「不重新发明备选」 |
| AC7 | ✅ | 「AC7：落点路由正文只出现一次（在 build.md）；plan.md / front.md 只引用」+ **critic 追加**：「只回答三件事」枚举正文三份里只 1 次、plan.md 只留条目名 |
| AC8 | ✅ | 「AC8：未新增 —— token allowlist / SLOT_STATES / outcome 集合不变」+ describe 头部**边界注释**三条（兑现 proposal 风险行） |
| AC9 | ✅ | 变红演练**实测 4 例**（builder 行退回 ⇒ AC1 红；复制落点路由正文 ⇒ AC7 红；front 删「派发被拒」⇒ AC3 红；复制三件事枚举 ⇒ AC7 红），四次还原后全绿 —— 记录见 `tasks.md` 块 D |
| AC10 | ✅ | `bun test tests/` = **500 pass / 0 fail**（8 files，2237 expect）；`scripts/check-upstream-anchors.sh` = **23/23**；`openspec validate role-class-rubric-alignment` 通过 |
| AC11 | ✅ | oracle `PASS-WITH-NOTES`（5 条全处置）→ critic `APPROVE_WITH_CONDITIONS`（2 SHOULD_FIX + 1 NIT 全处置，`mergeable: yes`）—— 记录见 `.rddf/reviews/role-class-rubric-alignment-prompt-review.md` |

## 遗留清扫复核（本次范围内）

| 项 | 结果 |
|---|---|
| TODO / FIXME / XXX / HACK | `git diff` 新增行 grep **零命中** |
| 临时调试日志 | 新增行 **零命中** |
| 被 skip 的测试 / `only` | 无 |
| 未替换的 mock | 无 |
| 半截实现 | 无（plan.md 6 处 + front.md 4 处改动逐条有断言覆盖） |
| 既有守卫未被放宽 | ✅ `resume-precheck-guidance` 的 `PLAN_HEADINGS toHaveLength(1)` 仍绿（新小节用 `####` ⇒ 不进 `###` 集合），实测 500 pass 全绿 |
| 治理面双审 | ✅ oracle → critic，顺序正确，2 条 SHOULD_FIX + 1 NIT + oracle 5 条全部处置并落盘 |

## 归档前条件核对

- ✅ tasks 全勾（AC1–AC11 全有对应 task 行）
- ✅ `openspec validate` 通过；工件齐备（proposal / design / tasks；`skip_specs` 无 spec delta）
- ✅ 遗留清扫通过

## 结论

**PASS** —— AC1–AC11 逐条有证据（AC9 为实测变红演练记录）⇒ 可归档
（`openspec archive role-class-rubric-alignment --skip-specs`）。
