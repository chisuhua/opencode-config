# Tasks — ac10-four-decision-anchor（AC10④ 判据对象收窄到「决策锚点」）

> **判据真源**：`openspec/changes/ac10-four-decision-anchor/proposal.md` 的 `## 验收标准` 表（AC1–AC8）。
> **执行纪律**：TDD 5 步 —— fixture 先写（四态）→ helper → 守卫改判据 → 机制面连带面 → 全量回归。
> **审查**：改守卫判据 ⇒ **治理面** ⇒ oracle（`审查域: 治理面`）→ critic 必审。

## 0. 前置核对

- [x] **T0** 确认阻塞事实：提交 `0f09b9c`（纯文档）之后 AC10④ 转红 ⇒ `.rddf/commit-gate.json` 的 `bun test tests/` 退出非 0 ⇒ 工具层验证门 fail-closed ⇒ `librarian-delegate-contradiction` 的提交被实测拒绝（拒绝原文已记录在 proposal 的 Why 段）。
- [x] **T0b** 确认判据意图：归档 change `class-write-scope-alignment` 的 C.5「**与代码同批**」+ AC10①–④（顺序判据的对象 = 父篇 D3 行 + Status 修订记录）。
- [x] **T0c** 确认内容判据另有守卫：`AC10：父篇 D3 verifier 行已落改 + Status 有修订记录` ⇒ 本条**只动顺序判据**，不动内容判据。
- [x] **T0d** 确认锚点可用性：`.rddf/state/verifier/**` 在父篇 ADR 中**恰好 1 次**（`docs/adr/ADR-backend-handoff-role-class.md:50`，D3 写集行）；`git log -1 -S'.rddf/state/verifier/**' --format=%H -- <adr>` ⇒ `8131d0c`（2026-11-14 的类写集对齐提交）⇒ 它是 `lib/delegate-core.ts` 最后提交 `4b31d19` 的祖先 ⇒ 精化后转绿。
- [x] **T0e** **pin 普查**（决定落点与连带面）：`tests/config-guards.test.ts` 被 9 份回滚清单**逐字节 pin**（67 处）。本次改动的三个区块（AC10④ 用例 / fixture 用例 / 命令形态用例）**正落在** `role-class-write-set.json` 的 `edits[113]/[114]/[115]` ⇒ 该清单**必须同批更新**（不可避免的机制面连带面）；而 **import 片段**（`governance-paths-config.json` 的 `edits[10]`）与**元守卫**（`role-class-write-set.json` 的 `edits[0]` + `tests/real-repo-git-budget.test.ts`）**刻意不动** ⇒ 靠「可选参数」形态（不改 import）+ 「用例标题逐字保留」实现 ⇒ 漂移面从 4 处降到 3 处。

## T. helper（唯一入口）

- [x] **T1（AC1）** `tests/helpers/real-repo-git.ts`：`lastCommitSha(cwd, file, literal?)` / `lastCommitShaInRepo(file, literal?)` 增加**可选第三参** —— 给出 `literal` 时用 `git log -1 -S<literal> --format=%H -- <file>`（内容锚点），不给出 ⇒ 文件级语义**逐字不变**；两条命令形态在源码里**逐字并存**（三元表达式，不拼接参数）。
  > **验收证据**：helper 内 `timeout: REAL_REPO_GIT_CALL_TIMEOUT_MS` 仍 2 处、catch 块仍 2 处 ⇒ 元守卫计数**零改动**；命令形态用例的三条断言全绿。

## I. 守卫判据（红 → 绿）

- [x] **I2（AC3/AC4）** fixture 用例扩到**四态**：① 锚点行先改、代码后改 ⇒ 绿；② 代码先改、锚点行后改 ⇒ **红**（判别力保留）；③ 同提交 ⇒ 绿；④ **锚点改动之后另有纯元数据提交** ⇒ **仍绿**（误报类被钉死）。
  > **验收证据**：fixture 用例绿；态② 用 `expect(isAncestor(repo, decisionSha, codeSha)).toBe(false)` 显式断言红；态④ 同时断言「文件级定位会被带偏」⇒ 两者的差异被钉死。
- [x] **I3（AC1/AC2）** `tests/config-guards.test.ts` 的 AC10④ 改为「锚点 commit vs 代码 commit」（**标题逐字保留**）；新增一条零 git 断言：锚点在父篇中**恰好 1 次**且位于 D3 写集行。
  > **验收证据**：真实仓跑 ⇒ 绿（锚点 commit `8131d0c` 是代码 commit `4b31d19` 的祖先）；把锚点字面量改掉 ⇒ 精度断言红。
- [x] **I4（AC7）** 「命令形态不得漂移」用例**增钉**新形态 `["log", "-1", "-S", literal, "--format=%H", "--", file]`；原两条形态逐字保留。
- [x] **I5（AC8）** **机制面连带面**：`.rddf/rollback/role-class-write-set.json` 的 `edits[113]/[114]/[115]` 的 `find` 按新实现更新（各命中恰好 1 次）；同批**撤 `last_drill`** + `.rddf/rollback/registry.json` 的两个条目（组清单）退 `proving` + 注记。
  > **验收证据**：`bun test tests/rollback-manifests.test.ts` 绿（`find_count` == 1）；`bun test tests/rollback-registry.test.ts` 绿（`proving` ⇒ 证据可缺失）。
- [x] **I6（AC6）** 全量 `bun test tests/` ⇒ **全绿**（含本条自身）⇒ 提交门恢复可用。

## D. 文档与记录

- [x] **D1** `docs/test-authoring.md` §9 规则 1：唯一入口补「可选字面量参数」形态。
- [x] **D2** `docs/CHANGELOG.md` 一条版本条目（判据精化 + 误报消除 + 审查结论）。
- [x] **D3** 审稿记录 `.rddf/reviews/ac10-four-decision-anchor-review.md` + 验收报告 `.rddf/reviews/ac10-four-decision-anchor-verify.md`。
- [x] **D4** **两段式收口**：提交（撤 `last_drill` + `proving`）⇒ 演练 `bun scripts/rollback-drill.ts .rddf/rollback/role-class-write-set.json` ⇒ PASS ⇒ 回填 `last_drill` + 转 `active` ⇒ 下一提交。

## 归档条件

- T1–T6 落地，AC1–AC8 逐条有证据；
- 全量套件全绿（提交门恢复）；
- oracle → critic 审查记录落盘且 BLOCKER 全闭；
- 回滚清单演练 PASS 且 `last_drill` 已回填（两段式闭合）。
