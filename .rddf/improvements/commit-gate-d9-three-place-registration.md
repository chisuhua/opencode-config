---
revision_count: 1
last_feedback_id: null
last_feedback_at: null
feedback_status: none
---

# commit-gate-d9-three-place-registration — ADR D9 十六项的「三处登记」补齐 + 机械守卫

> **实施状态**：**已立项**（2026-11-18）⇒ `openspec/changes/commit-gate-d9-three-place-registration/`（逐条判据以该 proposal 的 AC1–AC13 为**唯一真源**；本文只保留**动机与机制**）
> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。**由 builder 代 planner 起草**（用户 2026-11-18 指定）⇒ **metis 1 轮审后已修订**（rev 1；逐条处置见 `.rddf/reviews/commit-gate-d9-three-place-registration-planner-review.md`）。
> ⚠ **rdd-workflow 的 `add-improve` 前置在本仓不适用**：无 `improvement-suggestions.md`、无 `.rddf/roadmap.md` 的 Phase Skeleton ⇒ 无 `主题:` 字段可匹配（本仓 20 个 improvement 全部同样不满足该 schema）—— 同例见 `docs/CHANGELOG.md:410-412`（`delegate-base-resolved-return`）。
> 决策依据：`docs/adr/ADR-commit-verification-gate.md` **D9 表前言**（`:221`）+ **V10**（`:302`，Status `Accepted`）—— 本项**不新增决策**，只把既有承诺落到**可机械校验**的形态。
> 事实依据（逐项缺口表 + 扫描方法）：`.rddf/reviews/commit-verification-gate-review.md` **§11.2** —— 结论：**十六项中只有 ⑯ 三处齐全**，①–⑮ 各缺 1–3 处（⑤⑥⑦⑨⑩⑪ **三处皆无**）。
> 来源：`commit-gate-force-push-heredoc` 批的**归档前核对** + 用户裁决（2026-11-18，路径 **A：补登记 + 加机械守卫**）。
> 执行路径预估：**常规 change**（落点 = `tests/**` 守卫 + `docs/MULTI-AGENT-DESIGN.md` **§2.8.8**（新增） + `openspec/changes/<name>/proposal.md` 的 AC 面 + ADR `:221`/`:240`/`:302` 措辞）⇒ 触及治理面 ⇒ **oracle → critic 各 1 轮**；ADR 措辞由 **architect** 落笔。

## Why

ADR 自己给 D9 表写下了登记承诺，Verification 又把它写成可验收判据，但实际登记没跟上 —— 这是一类**宣称与实现不一致**的病（与本批 critic 在实施审查里抓到的是同一类，只是对象从「未登记的行为」换成「未兑现的登记承诺」）。

| 落点 | 原文（口径） |
|---|---|
| `ADR-commit-verification-gate.md:221`（D9 表前言） | 「每项写清『防什么 / 不防什么 / 缓解』，并在 **AC + 测试注释 + 主题文档三处**登记」 |
| `ADR-commit-verification-gate.md:302`（V10） | 「**免宣称十六项三处登记**（AC + 测试注释 + 主题文档）…… **变红**：删掉任一处登记 ⇒ V10 红」 |

**事实**（逐项核对见审稿报告 §11.2）：十六项里**只有 ⑯ 三处齐全**；①–⑮ 各缺 1–3 处（⑤⑥⑦⑨⑩⑪ 三处皆无）⇒ **V10 按字面严格核验判不通过**。

**真问题不是「今天补齐十六项」**（metis 指出的隐藏意图）：若守卫只写死今天的十六项 id，ADR 加第 ⑰ 行时守卫**照样绿** ⇒ 「新增项忘登记立刻红」的能力宣称是**空的**。⇒ **期望集必须从 ADR 派生**，且必须有「加第 ⑰ 行 ⇒ 必红」的判别力用例。

**为什么不能靠「改口径」糊过去**（用户已裁决路径 A）：V10 的价值在于**机械可判**。降级成人工核 ⇒ 下一条 D9 项仍然只写 ADR 一处 ⇒ 病复发；而 D9 是**免宣称表** —— 它的每一格都在替门禁的边界背书，背书不落地等于宣称虚高。

## What Changes

> 顺序 = **先定标识口径 → 再补三处 → 最后加守卫**（守卫红着无法提交：`.rddf/commit-gate.json` 的 `verify_commands` 含 `bun test tests/` ⇒ **自锁**）。

| # | 变更 | 落点 | 归属 |
|---|---|---|---|
| D1 | **标识口径定死**：标识 = `D9` + ADR D9 表 `#` 列**原文**（`D9①` … `D9⑯`），与 `D5①`…`D5⑥` **同构**。⚠ **不给 ADR 表加标识列** —— 标识由 `#` 列**派生**即够（改表是多余改动，且会与「决策文字零改动」自相矛盾） | 无（口径写进 proposal + ADR `:221` 一句） | architect（一句）/ builder（落地） |
| D2 | **AC 面登记**：任意 change 的 `proposal.md` 里的**行首标题** `## D9 十六项登记（AC 面）` 小节，一行一项（`- **D9①** <ADR 标题原文> ⇒ 见 ADR D9 表`）；**各小节并集**须恰好覆盖全部 id（每项**恰好一次**） | 本 change 的 proposal（已含） | builder |
| D3 | **测试注释面登记**：新文件 `tests/commit-gate-d9-registration.test.ts` 的 **JSDoc 头**（首个 `import` 之前）逐项列出十六项 | `tests/` | builder |
| D4 | **主题文档面登记**：`docs/MULTI-AGENT-DESIGN.md` **新增 `### 2.8.8`**（不是塞进 §2.8.7 —— 后者自称「免宣称**六项**」、真源是 `ADR-role-aware-permissions` D5）⇒ 段首一句真源 pointer + 16 行索引，**只写标题 + 指回 ADR**，**禁写**「防什么 / 不防什么 / 缓解」 | MAD | builder（治理面 ⇒ 审查） |
| D5 | **机械守卫**（判据见 proposal C 段）：① 期望集**从 ADR 派生**（不写死）② **区段作用域**（行首标题 / JSDoc 头 / `### 2.8.8`；散文与反引号里的同名串**不算**）③ **行形态 + 标题保真**（去反引号 + 空白归一后比较）④ **唯一性**（并集里每项恰好 1 次）⑤ **负向词**（`TODO/待补/待定/不登记/不适用/不做`；索引段禁 `缓解：`）⑥ **归档韧性**（活跃 + `archive/<date>-<n>` 两形态）⑦ **不空转**（0 skip / 0 todo）⑧ 载体缺失给**带指引的专用错误** | `tests/commit-gate-d9-registration.test.ts` | builder |
| D6 | **ADR 措辞对齐**（architect）：`:221` 增「标识口径 + 三处载体」；`:302` 增「机械载体 = 守卫文件（含「加第 ⑰ 行 ⇒ 必红」）」；`:240`（⑯ 行）的「主题文档 = §2.8.7」改 **§2.8.8**。⚠ **只增改这三处句子**，D9 表体与其余正文零改动 | ADR | architect |
| D7 | **明确不改什么**：D9 各项的决策内容（防什么 / 不防什么 / 缓解）**一律不动**；**不改** `lib/**`、`plugins/**`、`opencode.jsonc` ⇒ 门禁运行时行为**零变化** | — | — |

## Acceptance

> 判据真源 = `openspec/changes/commit-gate-d9-three-place-registration/proposal.md` 的 **AC1–AC13**（本文不重复，避免两处判据漂移）。摘要：

- [x] **AC1** 三处齐全（AC 面并集 / 测试文件头 / MAD §2.8.8 各覆盖全部 id，缺项 = 0）（**取红**）
- [x] **AC2** 行形态 + 标题保真（只写编号 / `……` / 标题走样 ⇒ 红）（**取红**）
- [x] **AC3** 期望集**从 ADR 派生**（ADR 恰 16 项 / 标识唯一 / 标题非空；「不写死」由 **AC4 的判别力用例**证明 —— 不声称代码里无 id 字面量，本文件 JSDoc 头本就含十六项）（**取红**）
- [x] **AC4** **加第 ⑰ 行 ⇒ 必红**（合成 ADR 文本的判别力用例）（**取红**）
- [x] **AC5** 区段作用域（删 MAD §2.8.8 一行后，即使散文散落命中仍在 ⇒ 仍红）（**取红**）
- [x] **AC6** 归档韧性（fixture 两形态都绿）（**钉住**）
- [x] **AC7** 负向词（行内 `TODO/待补/…` ⇒ 红；索引段 `缓解：` ⇒ 红）（**取红**）
- [x] **AC8** 唯一性（重复登记 ⇒ 红）（**取红**）
- [x] **AC9** 不空转（单文件全绿、0 skip / 0 todo）（**取红**）
- [x] **AC10** ADR 改动面可机械复核：`numstat = 9 增 2 删`、**4 个 hunk**、**D9 表仅 ⑯ 行一处**被改（其余 15 行零差异；⑯ 行改的是同格「登记」句 ⇒ 决策内容逐字未变）（**钉住**）
- [x] **AC11** 证据包 **7 条**必需突变（另 **M8** 补充 = 载体改名锚 ⇒ 实际 **8 条**）落 `.rddf/reviews/commit-gate-d9-registration-mutations.md`（**钉住**）
- [x] **AC12** 回归：`bun test tests/` 全绿、anchors 全绿、`openspec validate --strict` valid、**§2.8.7 的 D5② 锚点句未被碰**（**钉住**）
- [x] **AC13** **人工核**：十六项**语义**由 oracle 逐项核（16 行 verdict 落证据包）—— 机器**不判**语义（**人工**）

## Capabilities

- **免宣称项有了机械登记载体** ⇒ 新增 D9 项时「忘登记」立刻变红（**AC4** 钉住「加第 ⑰ 行 ⇒ 必红」），不必靠人工翻三处文档。
- **判别力自证内建**（AC4 / AC5 / AC7 / AC8 四个分支突变）⇒ 守卫不会退化成恒真判定（**不照抄** `tests/role-exemptions.test.ts` 里 `text.slice(at, at+400)` 那种近乎恒真的判据，只借它的**形态**：`PLACES` + 缺项列表 + 判别力用例）。
- **归档韧性**（AC6）⇒ 本 change 归档当天守卫不断（对照：既有 AC23 守卫把 `openspec/changes/role-aware-permissions/proposal.md` 写死 ⇒ 该 change 一归档即断，已登记为另案）。
- **V10 从人工核升级为机械核** ⇒ ADR 的 Verification 项第一次有可指认的执行点。

## Impact

| 面 | 影响 |
|---|---|
| 治理面 | `tests/**`（新增守卫文件 ⇒ 进 `bun test tests/`）、`docs/MULTI-AGENT-DESIGN.md`（新增 §2.8.8）、ADR 三处句子 ⇒ **oracle → critic 各 1 轮**（ADR 措辞 = architect + oracle；MAD 索引 = 叙述性 pointer，按先例不新增 critic 轮；守卫 = 治理面 ⇒ critic 1 轮） |
| 运行时 | **零影响** —— 不改 `lib/**` / `plugins/**` / `opencode.jsonc` |
| 文档体量 | MAD 增一个小节（≈ 20 行）；ADR 增 3 句；本 change 的 proposal 含 16 行 AC 面 |
| 工期体感 | 三处登记 + 1 个守卫文件 + 7 条突变 ⇒ 体量与 `commit-gate-force-push-heredoc` 相当，**独立 change** |

⚠ **风险与缓解**：

1. **守卫红 ⇒ 提交自锁**（`verify_commands` 含 `bun test tests/`）⇒ **缓解**：实施顺序固定为「先登记、后守卫」，突变演练必须在**同一工作树内复原后**再提交（proposal E 段）。
2. **登记退化成「只写编号」凑数** ⇒ 缓解 = AC2（标题保真）+ AC7（负向词）。
3. **主题文档变成 ADR 的副本**（第二真源）⇒ 缓解 = 只写「标题 + pointer」、禁复述决策列（AC7 断言索引段无 `缓解：`）。
4. **改 ADR 措辞** ⇒ 属 architect 产出归属 ⇒ 不得由 builder 单方面改（切 architect 或 HANDOFF）。
5. ⚠ **本项与 `commit-gate-force-push-heredoc` 无耦合** ⇒ 后者已归档（2026-11-18），不依赖本项；本项也**不得**塞进后者的 change。

## 不做什么（Out of Scope）

见 proposal 的 `## Out of Scope`（七条，逐条带理由）。⚠ 其中两条**必须知道**：

~~**V10 的第二子句**~~ **已于 2026-11-18 闭合**（用户裁决一并修）：`role-aware-permissions/proposal.md` 的 D5② 行已同步为「已由 `ADR-commit-verification-gate` D5 部分闭合」措辞 ⇒ **V10 两个子句都闭合**。
- **十六项「防 / 不防 / 缓解」的语义正确性**：机器判不了 ⇒ 交 **oracle 人工核**（AC13），不写成机判 AC（否则自造「宣称 ≠ 实现」）。
