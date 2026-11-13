# 审稿记录：能力面判据对齐（`role-class-rubric-alignment` 的 prompts 侧）

- 审稿对象：`prompts/plan.md`、`prompts/front.md`、`tests/config-guards.test.ts`
- 变更类型：**治理面**（`prompts/**`）⇒ 固定配对 **oracle → critic**，顺序不可颠倒
- 审稿日期：2026-11-14
- 关联 change：`openspec/changes/role-class-rubric-alignment/`
- 结论：**oracle `PASS-WITH-NOTES` → critic `APPROVE_WITH_CONDITIONS`（`mergeable: yes`，无 BLOCKER）**；2 条 SHOULD_FIX + 1 条 NIT 全部处置

## oracle（第一审）—— `PASS-WITH-NOTES`，5 条 finding

| # | 影响 | finding | 处置 |
|---|---|---|---|
| 1 | 中 | 「派发被拒 ⇒ 改派」**无条件路由**：同一信号至少四种成因（类×scope 不相容 / scope 不在工程根内 / arch 目录为空时 architect 被拒 / 占槽与非法字段值）⇒ 手滑 scope 被误判成类选错 ⇒ 改派后又被拒、**空转一圈** | plan.md bullet ① 补**归因句**（三种成因）：类×scope 不相容 ⇒ 改派；`scope` 自身写错 ⇒ 修正后**原类重派**；错误信息指向 `scripts/arch-docs-init.sh` ⇒ **先初始化**（不是改派）。front.md §六 同步新增排障行 + 同款归因 |
| 2 | 中 | 守卫**宣称 > 实际保证**：AC3 标题宣称「两种失败形态都写到」，实际只是整文件 grep 4 个词（把两条 bullet 改写成一句含同样 token 的平铺句也绿）；且 proposal 风险行承诺的「覆盖边界**必须在守卫注释里写明**」**未兑现** | ① AC3 改为**结构锚定**：plan.md 定位「选错类有两种失败形态」后的 ① / ② 子 bullet（① 段含「派发被拒」「类 × scope 不相容」「原类重派」「arch-docs-init.sh」，② 含「交回」「重派」）；front.md 定位「填错有两种形态」行逐词断言 ② describe 头部补**边界注释**三条 |
| 3 | 中 | **AC 未覆盖全部实际改动**：「始终生效」正向句、`kind=knowledge` 互斥、「不重新发明备选」均无断言 | 新增 **AC3b**（plan/front 都含「始终生效」；plan 含 `kind=knowledge` + 「互斥」）+ AC6 增「不重新发明备选」 |
| 4 | 低 | front「被拒」一词**双义**（占槽拒绝 vs 类×scope 硬拒），§六 排障表无对应行 | front.md §六 新增一行：「派发**报错**（不是返回结果）：`role_class=... 的 scope 项越界: <path>` ⇒ 类 × scope 不相容的硬拒（与 `outcome: busy` 的占槽拒绝不同）」+ 归因动作；并加 **AC3c** 断言该行存在 |
| 5 | 低 | plan 模板「决策日志：本次关键决策理由」与分流 ①「未决」字面相撞 | 模板改为「方案取舍理由：本次选了哪个方案、为什么（**未决**留在本文件；已决的架构决策另见架构文档）」 |

**oracle 已核验无问题**：三路/三触发自洽；「只满足 ① ⇒ 留在计划里」与「plan 不写 ADR」不冲突；需求澄清有反向判据（不会被误判进 ②）；「设计方案」段确在计划模板内、候选集经 `plan_ref` 可达；AC7 计数断言带位置正向、未过度宣称；AC8 token allowlist 封闭。

## critic（第二审）—— `APPROVE_WITH_CONDITIONS`（`mergeable: yes`，`scope_exceeded: false`）

**BLOCKER：无。**（未发现与已签批 ADR 冲突且未走修订流程的条目；Why/What Changes 有取舍理由；回滚路径为 prompts 回退；无「把未决写成已决」。）

| # | 类别 | finding | 处置 |
|---|---|---|---|
| 1 | SHOULD_FIX | plan.md:104 「**架构文档**只回答三件事（定什么、为什么这么定、代价是什么）」—— ① 把枚举正文**复制**进 plan.md（与本改动「只引用不复制」的立意相反，AC7 只夹住了「落点路由」正文）② 「架构文档」是「决策文档」的**上位表述**，主题文档（当前态快照 / 模块关系）并不回答这三件事 | 改为条目名引用：「**决策文档只回答三件事**（见 `prompts/build.md` 的「architect 产出形态契约」同名片段）」+ 明写「主题文档也不承担这三件事」；**AC7 增计数断言**：「只回答三件事」的枚举正文在 plan/front/build 三份里**只出现 1 次**（在 build.md），plan.md 只留条目名 |
| 2 | SHOULD_FIX | 归因句只枚举**两种**成因，缺第三种「`archRoots` 为空时 architect 被拒」⇒ 按「类不相容 ⇒ 改派」去改派 builder，builder 同样写不了 arch 路径 ⇒ 正是 oracle 警告的「空转一圈」 | 归因句补**第三分支**：错误信息指向 `scripts/arch-docs-init.sh`（本工程没有架构文档目录）⇒ **先初始化**，不是改派；AC3 增该 token 断言 |
| 3 | NIT | AC3b 注释自称「不是只钉负向」，但「非法值（`null`/空串）直接抛」的**正向事实断言**未钉（字段值语义边界：空串算缺失还是非法） | 注释改准确：「本守卫只钉**文档口径**；**字段值语义由 lib 侧单测负责**（`tests/delegate-core.test.ts` 的 validateBrief describe）」 |

**critic 已核验无冲突**：「始终生效」与 build.md「机制未启用时的缺省口径」**条件不同**（字段在场 ⇒ 永不忽略/非法抛；字段缺席 ⇒ 缺省 builder）⇒ 不冲突；「只解释、不落盘」与「实施性 ⇒ 派 architect」分属不同类别、按「是否落盘」划分 ⇒ 不互斥。

## 变红演练（实测 4 例，还原后全绿）

| # | 注入 | 结果 |
|---|---|---|
| 1 | plan.md builder 行退回「简报 `scope`」 | **AC1 红** |
| 2 | plan.md 复制「落点路由」正文 | **AC7 红** |
| 3 | front.md 删「派发被拒」 | **AC3 红** |
| 4 | plan.md 复制「只回答三件事」枚举正文（critic 新增断言后） | **AC7 红** |

## 验证

- `bun test tests/` = **500 pass / 0 fail**（8 files，2237 expect）
- `scripts/check-upstream-anchors.sh` = **23/23** OK
- `openspec validate role-class-rubric-alignment` 通过；`openspec status` = 3/3 artifacts
- 既有守卫未放宽：`resume-precheck-guidance` 的 `PLAN_HEADINGS toHaveLength(1)` 仍绿（新小节用 `####` ⇒ 不进 `###` 集合）

## 结论

治理面改动双审闭合（无 BLOCKER；2 SHOULD_FIX + 1 NIT + oracle 5 条全处置）⇒ 可合入。
