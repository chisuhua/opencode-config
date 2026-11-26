# ADR `plan-multi-session-collaboration` 审查记录：残留闭合标注 + 判据编号范围订正

> 触发：路线图 `.rddf/roadmap/test-debt-e2e-followup.md` 任务 **A5**（原路线图记为「走 architect 另案」）。
> 审查路径：§审查配对 的 **ADR 行** —— 本次只做**措辞/闭合标注**（不改决策条目、不反转既有决策）⇒ 走**只 oracle** 的豁免路径，**不需 critic 双审**。
> 判定：**APPROVE**（oracle，第 1 轮）＋ 2 条 SHOULD_FIX 已同批应用。

## 1. 改动范围（三处措辞 + 一处范围外搭车）

| # | 位置 | 改动 |
|---|---|---|
| 1 | §残留 第 9 条 | 加 `✅ 已闭合（D9/D10/D11 批；2026-11-26 复核）` 闭合标注，**原登记原文完整保留** |
| 2 | §残留 第 11 条 | 同上 |
| 3 | §Verification 章导语 | 编号范围补 `+ V22–V29（D10 增补）+ V30–V36（D11 增补）`（此前只写到 V16–V21，与表内已有 V22–V36 不一致） |
| 4 | §元数据「AC 映射」行 | 同类不一致搭车补齐：D10 ⇒ V22–V29、D11 ⇒ V30–V36（change 未立项 ⇒ AC 编号暂缺，立项后回填）。⚠ **范围外提示项**，由 architect 决定同批做（决定：做 —— 与第 3 项同性质、同一处不一致） |

**未改动**：任何决策条目（选项对比表 / 后果章 / Verification 表的判据内容 / Status 行）。

## 2. oracle 判定（第 1 轮，`审查域: 其他审查`）

**判定：APPROVE。** 三处改动的事实核心全部成立；无「误标闭合」；无错误断言。oracle 逐条核实：

| 问题 | oracle 结论 |
|---|---|
| Q1 #9 闭合断言是否成立 | **成立**。逐条数了 `.rddf/rollback/plan-topics.json` 的 `edits[]` 共 27 条，其中 `prompts/plan.md` **9 条**、`docs/SUBAGENT-ORCHESTRATION.md` **2 条**；钉死的有效性有机械保证（`tests/rollback-manifests.test.ts:65` 守卫「find 串在当前工作树恰好 1 次」）。原登记第二句（「D9 schema 不得先于代码进 prompt」）**不需要单独活着** —— 那是时序约束，前提已随该批消失；同类通用原则仍由 ADR 正文 D10 落地硬约束承载 |
| Q2 #11 闭合断言是否有反例 | **成立，无反例**。`input` 快照的全仓写入点只有两处（claim 创建 attempt / cancel 事务刷新既有 attempt），二者都以「attempt 正由 claim 创建或已存在」为前提；`stale_inputs` 在无 attempt 时不可能产生（`for (const a of n.attempts)` + `if (!a.input) continue`），且仅 `final` 口径产出。唯一「绕过」是手写 `graph.json` —— 那是 D10 已登记的「协议级、非权限强制」威胁模型，不构成反例 |
| Q3 导语编号范围是否正确 | **正确**。V22–V29 = D10（判据阶段化/严重度/在飞/claim/close·reap/stale_inputs/豁免/graph_rev），V30–V36 = D11（converged 七桶）。**V35 的「依赖 D10」是实现依赖标注，不是归属标注** —— 与 ADR 自身的 D11 硬约束口径一致 |
| Q4 有无误标闭合 | **无**。两条标注都完整保留原登记文字，闭合范围与事实逐条对齐 |
| Q5 措辞 | 两处 SHOULD_FIX（见下） |

## 3. oracle 的 SHOULD_FIX 与处置

| # | finding | 处置 |
|---|---|---|
| **P-1（中）** | 「已按 V8 回填」**撞号** —— 本 ADR 自己的 V8 是「checker 负向 fixture 进 `bun test tests/`」，与本句无关；实际所指是 **`ADR-rollback-manifest-enforcement` 的 V8**（证据时效判据）⇒ 写进本文件后，文件内严格读者会判该句为假 | **已改**（本批应用）：改为「已按回滚登记表（`ADR-rollback-manifest-enforcement`）的 V8 判据回填」 |
| **P-2（低）** | 「V25 的并发子句已由本仓 A4 补进 CI」与本仓口径相抵 —— 本仓**无 CI、无生效 git hook**（本 ADR V01 自述）；实际落点是本地测试套件 | **已改**（本批应用）：改为「补进测试套件 `bun test tests/`」 |

## 4. oracle 的范围外提示（已采纳）

verify 报告 SF-2 指出**两处**导语不一致；本次修了 Verification 章导语，**元数据「AC 映射」行**同样只声明到 D9 ⇒ 已一并补齐（见 §1 第 4 项）。

## 5. 收口核对

- [x] `bun test tests/` **1232 pass / 1 skip / 0 fail**（1233 例，34 文件）
- [x] `bash scripts/check-upstream-anchors.sh` **30/30**
- [x] 未引入新的旧路径字面量（AC20 扫 `docs/**`；守卫绿）
- [x] 闭合证据与拟改措辞的前置材料：`.rddf/reviews/adr-plan-multi-session-collaboration-residue-closure.md`
- [x] 审查记录落本文件（oracle 判定 + 逐条处置）

## 6. 披露（oracle 自报）

oracle 尝试用 `git log` 核实 commit `cb91be2` 时 shell 被权限拒绝一次，按纪律未重试；该 commit 的存在性以仓内多处交叉引用代替（`roadmap/test-debt-e2e-followup.md` 与 `residue-closure.md`）。**architect 侧已用有权限的会话独立核实**：`git log --oneline` 可见 `cb91be2 feat(tests): A 批收尾 —— A1 闭合 F-1 / A6 增量守卫 / A3 去 skip / A4 V25 并发子句`。
