# 审稿记录：能力面写集对齐的实施（`class-write-scope-alignment`）

- 审稿对象：`lib/delegate-core.ts`、`docs/adr/ADR-backend-handoff-role-class.md`（D3 表 + Status）、`docs/adr/ADR-class-write-scope-alignment.md`（指针回填）、`prompts/build.md` / `plan.md` / `front.md`、`docs/backend-handoff-role-class.md`、`docs/MULTI-AGENT-DESIGN.md`、`tests/delegate-core.test.ts` / `tests/config-guards.test.ts`、`.rddf/improvements/rdd-verifier-state-consolidation.md`
- 变更类型：**治理面**（`prompts/**` + `docs/**` + 守卫断言增删）⇒ 固定配对 **oracle → critic**（顺序不可颠倒）
- 审稿日期：2026-11-14
- 关联 change：`openspec/changes/class-write-scope-alignment/`
- 结论：**oracle `PASS-WITH-NOTES`（5 条全落）→ critic `APPROVE_WITH_CONDITIONS`（1 SHOULD_FIX + 4 NIT 全落）**；无 BLOCKER

## 前序（不重开）

- proposal 三段审查：metis 17 条 → oracle 5 条 → critic 1 条（全落盘，`.rddf/reviews/remaining-changes-review-trace.md`）
- 子篇 ADR：oracle 2 轮（BLOCK → PASS-WITH-NOTES）+ critic 2 轮（REJECT → APPROVE / `mergeable: yes`，`.rddf/reviews/adr-class-write-scope-alignment-review.md`）

## oracle（第一审）—— `PASS-WITH-NOTES`，5 条 finding

| # | 影响 | finding | 处置 |
|---|---|---|---|
| 1 | 中 | **守卫 4 处落差**（实施相对 proposal 收缩）：① §架构文档范围 禁句无文本断言 ② AC10④ 的 git 顺序判据缺失 ③ AC14 扫描面被收窄成固定 4 文件 ④ `prompts/plan.md` 的 builder 行（D2b）无守卫 | ①②③ 已落（禁句断言 / `git merge-base --is-ancestor` 顺序判据 / AC14 恢复为**排除集全域扫描**）；④ critic 复核时**主动补上**（AC9 断言扩到 plan.md 落点）—— 不留 backlog |
| 2 | 中 | 过渡期「主会话代跑」在**派发侧无指令落点**（`front.md`/`plan.md` 零命中）⇒ 会 stall（`.ac-verdict` 不落 ⇒ 归档门不触发） | front.md §3.1 补处置提示（「收到 verifier 类的 `HANDOFF:` 且 5 项正文提到『状态机未落盘』⇒ 由主会话执行 skill 补齐」，**触发锚在 critic 轮放宽到 5 项任一项**） |
| 3 | 中 | 子篇 ADR `:10` 的关联 change 指针 stale（仍写「尚未立项」） | 已回填为 `openspec/changes/class-write-scope-alignment/` |
| 4 | 低 | build.md 内需读者自行综合的一处（过渡期代跑 vs「不改 skill 状态文件」不变式 vs 角色矩阵禁写） | 过渡期规则② 补「**执行 skill，不是手工 edit 状态文件** —— 保住 single writer」 |
| 5 | 低 | 「skill 的 Step 5」有歧义（skill 另有一个 Orchestration 层的 Step 5） | 改为「**LLM Verification Protocol 的 Step 5**（持久化）」 |

## critic（第二审）—— `APPROVE_WITH_CONDITIONS`（`mergeable: yes`，`scope_exceeded: false`）

**BLOCKER：无。**（critic 逐面核过：父篇 Accepted ADR 的修订流程与先例一致（子篇 Accepted + 用户签批 + D3-4 要求同批落改 + Status 追加修订记录）；角色矩阵 `:415` 与 role_class 允许集**主体不同层**，不构成矛盾。）

| # | 类别 | finding | 处置 |
|---|---|---|---|
| 1 | SHOULD_FIX | front.md 的代跑触发锚**过窄**（只认 ⑤「建议的下一步指令草案」；「状态机未落盘」更可能写在 ② 阻塞点 / ④ 已完成·未完成）⇒ 后端写在 ②/④ 时主会话**不触发**代跑 ⇒ stall | 触发锚**放宽**为「5 项正文**任一项**（尤其 ② / ④ / ⑤）提到『状态机未落盘』」 |
| 2 | NIT | build.md:325「见**上方**过渡期规则」方向反了（规则在下方） | 改为「下方」（`:335` 的「见下方」保持） |
| 3 | NIT | build.md:415 角色矩阵 verifier 行「写 `.rddf/state/verifier/*`」与 role_class 允许集**同词异权** ⇒ 读者需自行综合 | 角色矩阵行加「**手工**写」二字消歧（主体：主会话 agent 角色 vs 被派发 session 的能力面） |
| 4 | NIT | `tests/delegate-core.test.ts` 的 `isPathWithin` **重复导入**（本补丁新增一份，与既有撞名） | 已去重（保留既有那一份）；bun 下未报 SyntaxError，但属应修的执行层瑕疵 |
| 5 | NIT | 子篇 ADR `:18-20` 的签批范围说明与 `:15` 的 AC 映射行过时（指针已被完成记录替换；change 已立项） | 两处过程注记更新（**不动决策段**） |

## 已知缺口的处置（不留在 backlog）

- oracle finding 1④（`prompts/plan.md` 的 builder 行 D2b 无守卫）—— critic 复核时确认属实，**本轮直接补上**：AC9 断言扩到 plan.md 选类表 builder 行（含「scope 必须包含」+「只落响应正文」）。

## 验证

- `bun test tests/` = **525 pass / 0 fail**（8 files，2374 expect）
- `scripts/check-upstream-anchors.sh` = **23/23** OK
- **e2e `CS-1..CS-4` 全绿**（`rdd-workflow-e2e` 仓 `tests/integration/test_class_scope_runtime.bats`，commit `6e6a766`）：CS-1 能写记账目录且不能写 `.rddf/state/pair.json`；CS-2 scope 不含 ⇒ 被权限拒；CS-3 取证失败 ⇒ HANDOFF 交回且不产出 pass；CS-4 审计 CLI 的 `--json` 形状满足四元组前提
- **变红演练 4 例**（退回允许集 / 删 plan.md 写集 / 删 build.md 写集 / 删 plan.md builder 的 scope 规则 ⇒ 各自变红，还原后全绿）

## 结论

治理面实施双审闭合（无 BLOCKER；oracle 5 条 + critic 1 SHOULD_FIX + 4 NIT 全落，且 1 处已知缺口被顺手关闭）⇒ 可归档。
