---
revision_count: 0
last_feedback_id: null
last_feedback_at: null
feedback_status: none
---

# commit-gate-d9-three-place-registration — ADR D9 十六项的「三处登记」补齐 + 机械守卫

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。
> ⚠ **本文件由 builder 代 planner 起草**（用户 2026-11-18 直接指定）⇒ **待 planner 审查**（metis 1 轮）后方可立项。
> ⚠ **rdd-workflow 的 `add-improve` 前置在本仓不适用**：无 `improvement-suggestions.md`、无 `.rddf/roadmap.md` 的 Phase Skeleton ⇒ 无 `主题:` 字段可匹配 ⇒ `pre_create_brainstorm_check.sh` 的主题校验在本仓**结构性不可满足**（本仓 19 个既有 improvement 全部同样不满足该 schema）—— 同例见 `docs/CHANGELOG.md:410-412`（`delegate-base-resolved-return`）。
> 决策依据：`docs/adr/ADR-commit-verification-gate.md` **D9 表前言（`:221`）** + **V10（`:302`）**（Status `Accepted`）—— 本项**不新增决策**，只把既有承诺落到**可机械校验**的形态。
> 事实依据（逐项缺口表 + 扫描方法）：`.rddf/reviews/commit-verification-gate-review.md` **§11.2** —— 结论：**十六项中只有 ⑯ 三处齐全**，①–⑮ 各缺 1–3 处。
> 来源：`commit-gate-force-push-heredoc` 批的**归档前核对** + 用户裁决（2026-11-18，路径 **A：补登记 + 加机械守卫**）。
> 关联 change：**无**（尚未立项）⇒ 立项与 AC 编号由 planner 阶段补；ADR 元数据的「关联 change」届时回填。
> 执行路径预估：**常规 change**（落点 = `tests/**` 守卫 + `docs/MULTI-AGENT-DESIGN.md` 主题文档 + `openspec/changes/<name>/proposal.md` 的 AC 面 + ADR `:221`/`:302` 措辞）⇒ 触及治理面 ⇒ **oracle → critic 各 1 轮**；ADR 措辞由 **architect** 落笔。

## Why

ADR 自己给 D9 表写下了登记承诺，Verification 又把它写成可验收判据，但实际登记没跟上 —— 这是一类**宣称与实现不一致**的病（与本批 critic 在实施审查里抓到的是同一类，只是对象从「未登记的行为」换成「未兑现的登记承诺」）。

| 落点 | 原文（口径） |
|---|---|
| `ADR-commit-verification-gate.md:221`（D9 表前言） | 「每项写清『防什么 / 不防什么 / 缓解』，并在 **AC + 测试注释 + 主题文档三处**登记」 |
| `ADR-commit-verification-gate.md:302`（V10） | 「**免宣称十六项三处登记**（AC + 测试注释 + 主题文档）…… **变红**：删掉任一处登记 ⇒ V10 红」 |

**事实**（逐项核对见审稿报告 §11.2，方法 = 关键词机器扫描 + 对零命中项宽松复扫人工判读）：

- 十六项里**只有 ⑯ 三处齐全**（本批 oracle 的后续义务已闭环）；
- ①–⑮ 各缺 1–3 处：⑤⑥⑦⑨⑩⑪ **三处皆无**；②③⑧ 各缺 AC 面；①②④⑭ 各缺 DOC 面；⑫⑬⑮ 缺 TEST + DOC 面；
- ⇒ **V10 按字面严格核验会判不通过**（ADR 的承诺 ≠ 仓库的现状）。

**为什么不能靠「改口径」糊过去**（用户已裁决走路径 A）：V10 的价值在于**机械可判**。把它降级成「人工翻文档核一核」⇒ 下一条 D9 项仍然只写 ADR 一处 ⇒ 病复发；而 D9 是**免宣称表** —— 它的每一格都在替门禁的边界背书，背书不落地等于宣称虚高。

**为什么现在做**：本批刚把 ⑯ 做成三处齐全（差距被显式化）⇒ 归档前处理比归档后处理便宜；且本批的 ADR 已到 Rev 3 收尾，再加 Rev 会推高元数据头的膨胀成本。

## What Changes

> 顺序 = **先定标识 → 再补三处 → 最后加守卫**（标识是机械查的前提；守卫是「不再退化」的保险）。

| # | 变更 | 落点 | 归属 |
|---|---|---|---|
| D1 | **给 D9 每项一个稳定标识**（`D9①` … `D9⑯`，与 `ADR-role-aware-permissions` 的 `D5①`…`D5⑥` 同构）⇒ 三处机械可查 | ADR D9 表每行加标识 | architect |
| D2 | **AC 面登记**：在 `openspec/changes/<name>/proposal.md` 里放一张十六项登记表（每项一行：标识 + 一句话 + 指回 ADR 行） | 新 change 的 proposal | planner / builder |
| D3 | **测试注释面登记**：新增 `tests/commit-gate-d9-registration.test.ts`，**文件头**逐项列出十六项（照 `tests/role-exemptions.test.ts` 的 AC23 形态） | `tests/` | builder |
| D4 | **主题文档面登记**：`docs/MULTI-AGENT-DESIGN.md` §2.8.7 增一段 D9 十六项索引（每项一句 + 指回 ADR） | MAD | builder（治理面 ⇒ 审查） |
| D5 | **机械守卫**：① 三处各自命中十六项；② 每项在三处后面都要有**实质说明**（防「只写个编号」凑数）；③ **判别力自证**：删掉任一处的任一项 ⇒ 必红（突变用例） | `tests/commit-gate-d9-registration.test.ts` | builder |
| D6 | **ADR 措辞对齐**（architect 动作）：`:221` / `:302` 补一句「机械载体 = `tests/commit-gate-d9-registration.test.ts`；标识 = `D9①`–`D9⑯`」⇒ V10 的「变红」从**描述**变成**可指认的守卫** | ADR | architect |
| D7 | **明确不改什么**：D9 各项的决策内容（防什么 / 不防什么 / 缓解）**一律不动**；**不改** `lib/**`、`plugins/**`、`opencode.jsonc` ⇒ 门禁运行时行为**零变化** | — | — |

⚠ **不并入 `commit-gate-force-push-heredoc`**：那批是「强推口径 + heredoc + 词值还原」，本项是「登记与守卫」，**不同病**；混批会让边界失焦，且那批的 critic 预算已用满。

## Acceptance

> 每条都要**工具证据**（`read` / `grep` / `glob` / `shell`）；`skip` ≠ `pass`。

- [ ] **AC-A（三处齐全）**：AC 面（`proposal.md`）/ 测试注释面（守卫文件头）/ 主题文档面（MAD §2.8.7）**各自命中 `D9①`–`D9⑯` 全部十六项** ⇒ 机械扫描缺项数 = 0。
- [ ] **AC-B（有实质说明）**：守卫断言「每个标识在三处后面都有正文（不是只写编号）」⇒ 任一处只写编号 ⇒ 必红。
- [ ] **AC-C（判别力）**：突变演练「删掉任一处的任一项 ⇒ 必红」通过并留证（突变描述 + 红输出 + 复原 + 复跑全绿三件套）。
- [ ] **AC-D（ADR 措辞对齐）**：ADR `:221` / `:302` 已指明守卫载体与标识口径（architect 落笔）⇒ **D9 各项决策文字逐字未变**（diff 可证）。
- [ ] **AC-E（不回归）**：`bun test tests/` 全绿；`bash scripts/check-upstream-anchors.sh` 绿；`openspec validate --strict` valid。
- [ ] **AC-F（V10 升格）**：V10 的证据从「人工核对表」改为「守卫用例名」⇒ 归档报告里 V10 一行指向守卫用例 ⇒ **可复算**。

## Capabilities

- **免宣称项有了机械登记载体** ⇒ 新增 D9 项时「忘登记」立刻变红，不必靠人工翻三处文档。
- **判别力自证内建**（AC-C）⇒ 守卫不会退化成恒真判定（与本仓「守卫必须有判别力」的既有纪律一致）。
- **与 `ADR-role-aware-permissions` 的 AC23 守卫同构** ⇒ 一套读法、两处复用；维护者只需学一次。
- **V10 从人工核升级为机械核** ⇒ ADR 的 Verification 项第一次有可指认的执行点。

## Impact

| 面 | 影响 |
|---|---|
| 治理面 | `tests/**`（新增守卫文件 ⇒ 进 `bun test tests/`）、`docs/MULTI-AGENT-DESIGN.md`（主题文档登记）、ADR `:221`/`:302`（措辞）⇒ **oracle → critic 各 1 轮**（按 §审查配对 的治理面口径；只改叙述性文字的部分不审） |
| 运行时 | **零影响** —— 不改 `lib/**` / `plugins/**` / `opencode.jsonc` ⇒ 门禁行为、权限档位、提交面全部不变 |
| 文档体量 | MAD 增十六项索引（≈ 16–20 行）；ADR 增 1–2 句；新 change 的 proposal 增一张登记表 |
| 工期体感 | 15 项 × 3 处 ≈ **45 处登记** + 1 个守卫文件 ⇒ 体量与本批相当，**独立 change** |

⚠ **风险与缓解**：

1. **守卫用标识/关键词判命中** ⇒ 若某项在三处措辞不一致 ⇒ 或误红（改标识）或漏检 ⇒ **缓解**：标识唯一（`D9①`–`D9⑯`）且三处**都写标识**（照 AC23 的「三处用同一标识 ⇒ 机械可查」）。
2. **登记可能退化成「只写编号」凑数** ⇒ 缓解 = AC-B（标识后必须有实质说明）+ AC-C（判别力）。
3. **改动会碰 ADR 措辞** ⇒ 属 architect 产出归属 ⇒ 不得由 builder 单方面改（走 HANDOFF 或切 architect）。
4. ⚠ **本项与 `commit-gate-force-push-heredoc` 无耦合** ⇒ 后者归档不依赖本项完成；本项也不应被塞进后者的 change。
