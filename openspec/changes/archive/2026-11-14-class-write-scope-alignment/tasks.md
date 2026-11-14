# Tasks — class-write-scope-alignment（能力面写集与产品侧 skill / 审查配对的对齐）

> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC19）。
> 决策：`docs/adr/ADR-class-write-scope-alignment.md`（**Accepted** 2026-11-14，用户签批「方向」）。
> 性质：代码 + 父篇 ADR + 三处 prompt + 两份设计文档 + 守卫 ⇒ 治理面双审。

## A. 代码（`lib/delegate-core.ts`）

- [x] A1 `classAllowRoots("verifier")` ⇒ `[".rddf/reviews", ".rddf/state/verifier"]`（产品落点 + 记账落点）→ AC1 / AC2
- [x] A2 导出常量：`VERIFIER_OWNS_PATHS`（6 项）、`VERIFIER_BACKLOG_ROOT_FILES`（**由前者派生**的 4 项）、`VERIFIER_ALLOW_ROOTS` → AC6
- [x] A3 **上限 ≠ 授权**：`classPermissions` **不改**（edit 权限仍只由 `scopeEditRules(scope)` 派生）→ AC4 / AC16

## B. 父篇 ADR（`docs/adr/ADR-backend-handoff-role-class.md`）

- [x] B1 D3 表 verifier 行 ⇒ 「`.rddf/reviews/**` + `.rddf/state/verifier/**`（记账落点；过渡期规则见 `ADR-class-write-scope-alignment` D1b）」→ AC10
- [x] B2 Status 行追加「D3 verifier 写集修订」并**删掉**未完成指针 → AC10
- [x] B3 与代码**同批**（`git merge-base --is-ancestor`：父篇 commit 必须是代码 commit 的祖先或同一 commit）→ AC10④

## C. 派发侧与后端侧文本

- [x] C1 `prompts/build.md` 运行身份表 verifier 行（含「派发侧要求见 plan.md 选类表」括注）→ AC7
- [x] C2 §verifier 产出契约：三处落点**三元表述** + **过渡期规则四要素** + **症状桥接句** + `:324` 归档门事实陈述保留 + `:393` 归属表行 → AC8 / AC11 / AC13
- [x] C3 §审查配对 `builder`（架构面）行：「`scope` 必须包含」+「未包含时只落响应正文」→ AC9
- [x] C4 §架构文档范围：「`arch_paths` 不得取 `.rddf/state` 的祖先或本身」→ AC5 承接
- [x] C5 `prompts/plan.md` 选类表（verifier 的 scope 义务 + builder 的产出去向规则）→ AC7 / AC9
- [x] C6 `prompts/front.md` §3.1（verifier scope 义务 + 主会话代跑处置提示，触发锚放宽到 5 项正文任一项）→ AC7
- [x] C7 角色矩阵 `verifier` 行加「**手工**写」消歧（主体不同层）→ NIT 处置
- [x] C8 陈旧写集陈述清除（`docs/backend-handoff-role-class.md`、`docs/MULTI-AGENT-DESIGN.md`）→ AC14

## D. 守卫

- [x] D1 `tests/delegate-core.test.ts`：AC1 / AC2 / AC3（6 个 scope 形态）/ AC4（组合路径 + 后半）/ AC5（负向不变量 + 合法配置不红）/ AC6（常量与派生）/ AC12（四个 state 文件全拒）→ AC1–AC6 / AC12
- [x] D2 `tests/config-guards.test.ts`：AC7 / AC8 / AC9（含 plan.md 落点）/ AC10（含④顺序）/ AC11 / AC13 / AC14（**排除集全域扫描**）/ AC18（backlog stub + owns 核对项）→ AC7–AC14 / AC18
- [x] D3 变红演练 **4 例**：退回允许集 / 删 plan.md 写集 / 删 build.md 写集 / 删 plan.md builder 的 scope 规则 ⇒ 各自变红，还原后全绿 → AC15
- [x] D4 无新机制核对（`classAllowRoots` 签名不变 / 无 glob token / `assertRoleClassCompatible` 无新分支）→ AC16
- [x] D5 回归：`bun test tests/` **525 pass / 0 fail**；`scripts/check-upstream-anchors.sh` **23/23** → AC17

## E. 产品侧 backlog stub

- [x] E1 `.rddf/improvements/rdd-verifier-state-consolidation.md`（5 段式；Acceptance 含「`VERIFIER_OWNS_PATHS` ↔ `SKILL.md:28-32` 逐项核对」）→ AC18

## F. e2e（`rdd-workflow-e2e` 仓，`tests/integration/test_class_scope_runtime.bats`）

- [x] F1 CS-1（AC3/AC4/AC12）verifier + scope 含记账目录 ⇒ 能写记账、不能写 `pair.json`
- [x] F2 CS-2（AC4 后半）scope 不含记账目录 ⇒ 写该目录被权限拒（上限 ≠ 授权）
- [x] F3 CS-3（AC7）取证失败 ⇒ 交回（HANDOFF 首行），不产出 pass 结论
- [x] F4 CS-4（AC2 前提）审计 CLI `--json` 含 `timeCreated` / `messageIndex` / `evaluation{ok,exempted}`

## G. 审查与收口

- [x] G1 proposal 三段审查（metis 17 → oracle 5 → critic 1，全落盘）
- [x] G2 子篇 ADR 双审（oracle 2 轮 + critic 2 轮）
- [x] G3 实施轮治理面双审：oracle 1 轮 `PASS-WITH-NOTES`（5 条全落）→ critic 1 轮 `APPROVE_WITH_CONDITIONS`（1 SHOULD_FIX + 4 NIT 全落）—— 记录见 `.rddf/reviews/class-write-scope-alignment-prompt-review.md`
- [x] G4 验收报告 `.rddf/reviews/class-write-scope-alignment-verify.md` + Acceptance 镜像 AC1–AC19 逐条勾选
