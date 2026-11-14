# 验收报告：class-write-scope-alignment

- 验收对象：`openspec/changes/class-write-scope-alignment/`（proposal AC1–AC19）
- 验收日期：2026-11-14
- 验收角色：builder 内建的 verifier 环节（角色内建，非 subagent）
- 已用轮次：**2 轮**（第 1 轮：oracle 5 条 + critic 1 SHOULD_FIX + 4 NIT 落盘；第 2 轮：全绿）
- 结论：**通过**（AC1–AC19 逐条有证据，含 e2e 与变红演练）

## 判据来源

1. `openspec/changes/class-write-scope-alignment/proposal.md` 的「## 验收标准」表（AC1–AC19）
2. `docs/adr/ADR-class-write-scope-alignment.md`（**Accepted**，D1–D3 + V1–V11）—— 决策依据
3. 本次实施声明的行为（代码 + 父篇 ADR + 三处 prompt + 两份文档 + 守卫）

## 逐条判定 + 证据

| AC | 判定 | 证据 |
|---|---|---|
| AC1 | ✅ | `tests/delegate-core.test.ts`「AC1：verifier 允许集 == {.rddf/reviews, .rddf/state/verifier}（集合断言，顺序无关）」 |
| AC2 | ✅ | 同文件「AC2：builder 仍 []；architect 不含 .rddf/state/verifier」 |
| AC3 | ✅ | 同文件「AC3：6 个 scope 形态（放行 3 / 拒 3）」—— 含兄弟目录 `verifier2` 与穿越 `reviews/../state/pair.json` |
| AC4 | ✅ | 同文件「AC4（组合路径）」（派发被接受 + 记账 allow + `pair.json` deny）+「AC4 后半：scope 不含 ⇒ 写记账目录被拒」；**e2e CS-1 / CS-2** |
| AC5 | ✅ | 同文件「AC5：负向不变量」（内置条目不等于/祖先于 `.rddf/state`；后代仍允许；`arch_paths=[".rddf/state/adr"]` 合法配置不红）+ `config-guards`「AC5 承接：§架构文档范围 含禁句」 |
| AC6 | ✅ | 同文件「AC6：常量 6 项 + 派生视图 4 项（派生，不手抄）+ 正负向断言」 |
| AC7 | ✅ | `config-guards`「AC7：三处文本一致（plan 选类表 / front §3.1 / build 运行身份表）含写集与 scope 义务」 |
| AC8 | ✅ | 同文件「AC8：§verifier 产出契约 含过渡期规则四要素 + 症状桥接句」 |
| AC9 | ✅ | 同文件「AC9：…；plan.md 选类表 builder 行同款」（**双落点都钉住**） |
| AC10 | ✅ | 同文件「AC10：父篇 D3 verifier 行已落改 + Status 有修订记录」+「AC10④：父篇 commit 必须是代码 commit 的祖先或同一 commit」（`git merge-base --is-ancestor`） |
| AC11 | ✅ | 同文件「AC11：build.md 内部三处状态文件描述收口为三元表述」（含 `:324` 事实陈述保留的负向） |
| AC12 | ✅ | `delegate-core`「AC12：D1d-1 —— .rddf/state 的其它路径对 verifier 仍拒」+ **e2e CS-1**（`pair.json` 未被写） |
| AC13 | ✅ | `config-guards`「AC13：§verifier 产出契约 含落点区分（产品 vs 记账），负向不得写反」 |
| AC14 | ✅ | 同文件「AC14：活文档里不再有把 verifier 写集描述为「仅 .rddf/reviews」的句子（**全域扫描**，排除 `docs/adr/**`）」 |
| AC15 | ✅ | **变红演练 4 例**（退回允许集 / 删 plan.md 写集 / 删 build.md 写集 / 删 plan.md builder 的 scope 规则 ⇒ 各自变红，还原后全绿）—— 记录见 `tasks.md` D3 |
| AC16 | ✅ | 人工核对 `git diff`：① `classAllowRoots` 签名仍 `(RoleClass, string) => string[]` ② 返回值无 glob token ③ `assertRoleClassCompatible` 未新增分支（只改 `classAllowRoots` 的返回值来源） |
| AC17 | ✅ | `bun test tests/` = **525 pass / 0 fail**（8 files，2374 expect）；`scripts/check-upstream-anchors.sh` = **23/23**；`openspec validate class-write-scope-alignment` 通过 |
| AC18 | ✅ | `config-guards`「AC18：产品侧收拢 backlog stub 已建，且其 Acceptance 含 owns 核对项」⇒ `.rddf/improvements/rdd-verifier-state-consolidation.md` 存在且含 `VERIFIER_OWNS_PATHS` + 核对项 |
| AC19 | ✅ | 治理面双审闭合：oracle `PASS-WITH-NOTES`（5 条全落）→ critic `APPROVE_WITH_CONDITIONS`（1 SHOULD_FIX + 4 NIT 全落，`mergeable: yes`）—— 记录见 `.rddf/reviews/class-write-scope-alignment-prompt-review.md` |

## e2e（`rdd-workflow-e2e` 仓，`tests/integration/test_class_scope_runtime.bats`，commit `6e6a766`）

| 用例 | 结果 |
|---|---|
| CS-1（AC3/AC4/AC12）verifier + scope 含 `.rddf/state/verifier` ⇒ 派发被接受；**能**写记账目录；**不能**写 `.rddf/state/pair.json` | ✅ |
| CS-2（AC4 后半）scope 不含记账目录 ⇒ 写该目录被**权限拒绝**（上限 ≠ 授权） | ✅ |
| CS-3（AC7）取证命令失败 ⇒ **HANDOFF 交回**，不产出 pass 结论 | ✅ |
| CS-4（AC2 前提）审计 CLI `--json` 含 `timeCreated` / `messageIndex` / `evaluation{ok,exempted}` ⇒ 四元组可算 | ✅ |

## 遗留清扫复核（本次范围内）

| 项 | 结果 |
|---|---|
| TODO / FIXME / XXX / HACK | 新增行 grep **零命中** |
| 临时调试日志 | 新增行 **零命中** |
| 被 skip 的测试 / `only` | 无 |
| 重复导入 | 1 处（`isPathWithin`）—— **已去重**（critic NIT 4） |
| 半截实现 | 无（AC1–AC19 逐条有断言） |
| 治理面双审 | ✅ oracle → critic，顺序正确，5 + 1 + 4 条全落 |
| 已知缺口 | oracle finding 1④（plan.md builder 行无守卫）—— **本轮直接补上**，不留 backlog |

## 归档前条件核对

- ✅ tasks 全勾（AC1–AC19 全有对应 task 行）
- ✅ `openspec validate` 通过；工件齐备（proposal / design / tasks）
- ✅ 遗留清扫通过

## 结论

**PASS** —— AC1–AC19 逐条有证据（含 e2e 4/4 与变红演练 4 例）⇒ 可归档
（`openspec archive class-write-scope-alignment --skip-specs`）。

**残留**（已登记在 backlog stub `.rddf/improvements/rdd-verifier-state-consolidation.md`）：产品侧把 4 个根下点文件收拢进 `verifier/` 子目录 + 清理 dangling 的 `.verifier-report.json` + owns 清单人工同步核对。
