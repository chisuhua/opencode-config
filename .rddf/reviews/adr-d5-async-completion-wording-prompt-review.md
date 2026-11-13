# 审稿记录：Accepted ADR 措辞修订 + 架构类文档的治理归属（`adr-d5-async-completion-wording`）

- 审稿对象：`docs/adr/ADR-backend-handoff-role-class.md`（D5 识别条目）、`.rddf/reviews/backend-handoff-protocol-spec.md`、`prompts/plan.md`、`prompts/build.md`（作用域裁定行 + 判例）、`tests/config-guards.test.ts`、`docs/CHANGELOG.md`
- 变更类型：**治理面**（`prompts/**` + `docs/CHANGELOG.md` + 守卫断言）+ **ADR 行**（`docs/adr/**`）
- 固定配对：**oracle → critic**（顺序不可颠倒）
- 审稿日期：2026-11-14
- 关联 change：`openspec/changes/adr-d5-async-completion-wording/`
- 结论：**oracle `BLOCK` → 闭合后 critic `APPROVE_WITH_CONDITIONS`（`mergeable: yes`，无 BLOCKER）**；oracle 4 条 finding + critic 2 SHOULD_FIX + 1 NIT 全部处置

## 变更主题

① ADR D5 写着「异步路径在**完成通知**后…」，而工具契约里**没有推送通道**（`dispatch` 返回 ≠ 完成）⇒ 按字面等待一个不存在的通知 = **卡死**；② `prompts/plan.md` 为此加过一句临时消歧（ADR 措辞修正后其前提消失）；③ §治理面作用域表未裁定**本仓**（既是配置根又是项目仓）的 `docs/adr/**` 归属 ⇒ 「改 ADR 要不要走 critic」每次都要重新判；④ 「Accepted ADR 的**描述性措辞**修订走哪条审查」无成文判例 ⇒ 同类措辞漂移会复发。

## oracle（第一审）—— **`BLOCK`**，1 BLOCK + 4 finding + 2 低影响

| # | 影响 | finding | 处置 |
|---|---|---|---|
| **BLOCK** | — | `docs/CHANGELOG.md` v2.22 条目**预先断言了尚未发生**的审查结论（`oracle 1 轮 PASS-WITH-NOTES → critic 1 轮 APPROVE_WITH_CONDITIONS`）、归档状态（「已归档」）与**不存在的**审稿记录路径 ⇒ 治理面文件失真（比不写更糟） | ② 行「已归档」⇒「已立项 / 实施完成，归档状态见归档记录」；③ 行 ⇒「审查：待进行 —— 结论与审稿记录路径**在审查实际发生后回填**」；守卫 AC8 改为**机械判据**：CHANGELOG **可以**写结论，但**当且仅当**审稿记录文件已落盘（`existsSync`）—— 既禁预断言，又允许事后如实记录 |
| 2 | 高 | D5 原措辞要求 `running=false` **且** `state=idle`，但槽位释放是 **reconcile-on-read（惰性）**：自然完成后 `state` 可能仍为 `active` ⇒ 常见轮询场景「`running=false` + `outcome=succeeded` + `state=active`」按字面可能**永远等不到** ⇒ 与本 change 要消灭的「字面等待 → 卡死」同型 | D5 行内补**逃逸口径**：「⚠ **不必等 `state=idle`**：槽位释放是 reconcile-on-read（惰性），自然完成后 `state` 可能仍为 `active`；此时 `running=false` + `outcome=succeeded` 即足以继续，**不得因 `state` 未翻转而等待**」；`prompts/plan.md` 同步；守卫 AC1 增该三组 token 断言 |
| 3 | 中 | `prompts/plan.md` 的触发句是**单字段**（`running=false`），ADR 是双字段 ⇒ 两处文档教两个口径 | 两处**同一口径**：触发点 = `running=false`；完成判据 = `rddf feedback list`；`state=idle` **非必要**（并说明惰性 reconcile）；守卫 AC12 同步 |
| 4 | 中 | 判例边界不可数（「描述性措辞」怎么判）；且**非豁免修订无默认归槽**（「改了选项表理由但未反转结论」落入无审区） | 判例补**可数正向句**（只改同一条 bullet 的表述：不增删 bullet、不改表格行、不动章节标题 / 决策条目 / 选项对比表 / 后果章 / Verification 章 / Status 行）+ **默认归槽**（不满足豁免 ⇒ 默认按「决策相关」处理 ⇒ oracle → critic，举证责任在修订者）；守卫 AC14 逐 token 钉 |
| 5 | 中 | 守卫三处缺口：CHANGELOG 条目**零断言**；AC13 没钉「既是配置根」与「oracle → critic 必审」后半句；AC14 没钉排除清单四要素 | 全部补齐（AC8 存在性 + 预断言机械判据；AC13 三组 token；AC14 四要素 + 可数句 + 默认归槽） |
| 6 | 低 | AC1 负向 `/完成通知后/` 窄（「在完成通知到来时」可过） | oracle 判定可接受（正面断言「没有完成通知」兜底；宽负向会把自己判红）⇒ **不改** |
| 7 | 低 | `.rddf/improvements/adr-d5-async-completion-wording.md` 头注仍写「执行路径：rdd-quick」，与扩展后的 proposal 不一致 | 已同步为「常规 change（治理面 ⇒ oracle → critic 各 1 轮）」 |

**oracle 核实的机制事实**（本回合由 build 独立复核）：`isRunning`（展示层）用 `time.busy` vs `time.idle` 判活（`lib/delegate-core.ts:215-224`）；`updateSlotState` 的全部调用点（`lib/delegate-async.ts:1240/1443/1722/2120/2283`）**无一在「自然完成」时翻 `idle`**；槽位释放只有 reconcile-on-read（`:613-623`，下次读/派发时触发）与 suspend/cancel ⇒ **逃逸口径必要且正确**。

## critic（第二审）—— `APPROVE_WITH_CONDITIONS`（`mergeable: yes`，`scope_exceeded: false`）

**BLOCKER：无。**（critic 逐项核对了 oracle BLOCK 与 4 条 finding 的闭合证据，未因「已闭」默认通过。）

| # | 类别 | finding | 处置 |
|---|---|---|---|
| 1 | SHOULD_FIX | `docs/CHANGELOG.md` v2.22 ② 行的**引文**与实际落笔的 D5 新文本**不符**（引文仍写「`running=false` **且** `state=idle` 后」，实际已删「且」并加逃逸口径）⇒ 治理记录里重新引入了本 change 正要消灭的前置条件 | 引文改为**实际新文本**（含逃逸口径），与 ADR / plan.md / spec v4 三方一致 |
| 2 | SHOULD_FIX | `proposal.md:29` 的 bullet（「`running=false` **且** `state=idle`（不是『或』…）」）与同文逐字目标文本**自相矛盾** ⇒ 归档后矛盾会被存档为「本 change 声称的性质」 | bullet 改为「**不必等 `state=idle`**（惰性 reconcile ⇒ 自然完成后 `state` 可能仍 `active`）：`running=false` + `outcome=succeeded` 即足以继续」；AC5 同步 |
| 3 | NIT | ADR D5 的「③ 结束回合（槽自动释放）」与 `:84` 的「惰性 reconcile」字面有张力（只读 ①②③ 会重蹈字面等待） | 「槽自动释放」后补半句「**状态投影惰性**，识别判据见下行的『识别』条」 |

**critic 的 focus 2 结论**：① 本仓特例裁定是**消歧而非重复**（右列预设「配置根 ≠ 项目仓」，本仓双重身份下字面读者确有把 `docs/adr/**` 归入左列的余地）② 判例是 ADR 行既有豁免的**规格化**（补齐真空区，非第二套判据）③ D5 的张力已在实施点消解，不达 BLOCKER 级。

**critic 的 focus 3 结论**：判例默认归槽与治理面行可点数判据分属不同路径族（ADR 正文 vs 治理面文件），同 patch 双触时取严者，**无第二标准**；逃逸口径的假信号窗口在契约内不可达，唯一可达窗口是「用户绕过插件直触后端」（`ADR-front-stop-confirmation:98` 已登记的未覆盖窗口，后果有界）。

## 验证

- `bun test tests/` = **507 pass / 0 fail**（8 files，2296 expect）
- `scripts/check-upstream-anchors.sh` = **23/23** OK
- `openspec validate adr-d5-async-completion-wording` 通过
- diff 形状：ADR `2 2`（D5 识别条目 + 「槽自动释放」补半句；选项对比 / 后果 / Verification / Status **零改动**）；spec `2 1`（行尾 v4 注 + 自定口径段）

## 结论

治理面改动双审闭合（oracle 的 BLOCK 已闭；critic 无 BLOCKER，2 SHOULD_FIX + 1 NIT 全处置）⇒ 可合入。
**残留**（已在 CHANGELOG ⑤ 登记）：类写集对齐（`verifier` 类写 `.rddf/state/verifier/*` 越类 / `builder` 类能否落 `.rddf/reviews/**`）属**权限面 + 产品侧 skill**，不是措辞问题 ⇒ 另立，需 architect 先出 ADR。
