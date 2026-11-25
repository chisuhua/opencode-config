# 审计报告：测试完备性 / 债务清理 / `rdd-workflow-e2e` 端到端覆盖

> 作者：**verifier**（只读审计 + 报告）｜日期：2026-11-25｜触发：用户提问「测试是否完备 / 是否有债务清理 / rdd-workflow-e2e 的端到端测试是否完备」
> 范围：本仓 `~/.config/opencode`（含 `bun test tests/` 全量）+ 外部仓 `/workspace/main/rdd-workflow-e2e`（bats 套件）+ 债登记面（`.rddf/improvements/`、ADR 残留、e2e 仓 KNOWN_FAILURES 与跨仓缺口表）
> 性质：**诊断报告**，不改实现、不改债登记

---

## 0. 三问三答（结论速览）

| 问题 | 结论 | 一句话依据 |
|---|---|---|
| **测试是否完备** | **单测层完备且全绿；运行时层有 3 个开口** | `bun test tests/` = 1230 例（1229 pass / 1 skip / 0 fail，34 文件）；每个 `lib/*` / `plugins/*` 模块都有本地用例；**缺口**：`plan-topics`（本批 D9/D10/D11）、`model-fallback`、`push-gate` 三个运行面**无任何运行时 e2e**；另 `arch-docs-scope` 一族（64 条断言）**判别力依赖外部 fixture 床**，床不在即静默 skip |
| **是否有债务清理** | **未清**（但**本仓可自行止血**，已验证） | 实测 `rddf status`：**pending 10 条，STATUS 全「待讨论」、PRI 全 `-`，其中 6 条其实已完成**（真正待办只有 4 条）；根因定位到产品侧 `collect_pending()` 只认「同名归档目录」+「front-matter `状态`」两条通路，而本仓 **0/32** 提供该字段、名字又常与 change 名不同 ⇒ **补 front-matter 即可让 pending 10 → 4（已用产品侧 `collect_pending` 在临时副本上实测通过）**；另有本批验收遗留 **1 项未闭合**（F-1）+ **5 项观察项**（SF-1…SF-5）、ADR 残留 #9/#11 已完成却未标闭合、e2e 仓 **8 条 KNOWN_FAILURES** 与 **1 份自 2026-11-08 起未更新的跨仓缺口表**（其中 ≥2 条已在本仓闭合、3 条仍开放且无人认领） |
| **rdd-workflow-e2e 端到端是否完备** | **契约层完备；能力层 / 对抗层缺位（按设计分期到 P1，未立项）** | 22 个 bats 文件 / **143 例**（实跑）；**零模型 67 例默认跑全绿**，**68 例真实运行时默认 skip**，**8 条失败 = 已登记的已知失败**；e2e 仓自己的 ADR-0003 自陈「现有 e2e 几乎全是**契约测试**」；ADR-0005 的 **CI gate 属 P1 且未立项** ⇒ 今天只有「防回归」，没有「能力变好/变坏」的判据；本仓 5 个运行面 **0 例** |

---

## 1. 本仓测试完备性

### 1.1 规模与分层（现状快照）

| 层 | 载体 | 规模 | 默认跑 | 判别力 |
|---|---|---|---|---|
| **L1 单元 / 契约** | `bun test tests/` | **1230 例 / 34 文件**（1229 pass / 1 skip / 0 fail，40.95s） | ✅ 进 `.rddf/commit-gate.json` 的 `verify_commands` | 完整（唯一 skip 来自范围外 `skipIf`：`commit-gate-doctor` 的「宿主不可达」组） |
| **L1b 上游语义锚点** | `bash scripts/check-upstream-anchors.sh` | 30 个语义锚点 | ✅ 同上 | 完整（`OK（30/30）`） |
| **L1c 守卫派生一致性** | `bun scripts/agent-guard-gen.ts --check` | 7 个 agent 的 shell 块 | 手动（未进 commit gate 的 `verify_commands`） | 完整 |
| **L1d 记录纪律** | `tests/record-discipline.test.ts` + `verify_record_discipline.sh` | 7 条判据（C1–C7）+ `--selftest` 判别力自测 | 手动 | 完整 |
| **L2 运行时（真实宿主 + 真实模型）** | 外部仓 `rdd-workflow-e2e` 的 bats | **68 例实跑 skip**（`@test` 口径 71；8 个文件门控） | ❌ **默认 skip**（需 `E2E_REAL_RUNTIME=1`） | 需真实模型额度 ⇒ 本机默认不可用 |
| **L3 人工 e2e** | `.rddf/reviews/*e2e*.md`（8 份） | 手工取证 | ❌ | 一次性证据，**不可重跑** ⇒ 回归无保护 |
| **L4 观测（无判据）** | e2e 仓 `harness/`（P0） | session DB 离线快照 + 指标 | 手动 | **只有指标、无阈值门禁**（ADR-0005 的 gate 属 P1，未立项） |

### 1.2 模块级覆盖（逐个 `lib/` / `plugins/`）

**结论：13 个 `lib/` + 5 个 `plugins/` 全部有本地用例命中**，无「裸奔模块」：

`lib/`：`commit-gate` `commit-gate-doctor` `delegate-async` `delegate-core` `model-fallback-core` `plan-topics` `push-gate` `role-identity` `role-lease` `role-policy` `rollback-drill` `rollback-registry` `subagent-contract-core`
`plugins/`：`commit-gate` `delegate` `model-fallback` `role-gate` `subagent-contract`

用例密度 Top：`delegate-async` 162 · `delegate-core` 161 · `config-guards` 136 · `commit-gate` 75 · `delegate-tool` 54 · `subagent-contract-core` 46 · `rollback-drill` 39 · `role-policy` 39 · `plan-topics-dag` 39 · `plan-topics` 35 · `role-lease-claims` 34 · `model-fallback-core` 33 · `plan-topics-lifecycle` 22。

### 1.3 开口（完备性的真实边界）

| # | 缺口 | 证据 | 影响 |
|---|---|---|---|
| **G-1** | **`arch-docs-scope` 一族（64 条断言）判别力依赖外部 fixture 床** | `tests/arch-docs-scope.test.ts:22` `skipIf(!existsSync(BED))`，`BED = E2E_BED_DIR ?? /workspace/main/rdd-workflow-e2e`；`tests/README.md` 自陈「床不在时 64 条断言静默 skip……无该仓的检出上这一族等价于零判别力」 | 本机**床在** ⇒ 实测 `1 pass`（14.83s）；但在**无床的检出/CI 环境**上这一族零判别力，且因是 `skipIf` ⇒ **静默**（不红不黄） |
| **G-2** | **`plan-topics` 全机制（尤其本批 D9/D10/D11）无运行时 e2e** | e2e 仓 `grep -rl plan-topics tests/ harness/` ⇒ **0 命中**；本仓的人工 e2e 记录 `.rddf/reviews/plan-multi-session-collaboration-e2e.md` 日期 **2026-11-20**，只覆盖初版 V11/V12，**D9/D10/D11 无任何运行时证据** | 本批 21 条 V 判据的运行时面（真 `plan` 会话派真 `plan-worker`、真锁、真取消事务）**只靠单测 + 本轮 verifier 探针**；V11（独占锁）/ V12（宿主 session 树）按 ADR 标注为「人工」，至今**未补** |
| **G-3** | **`model-fallback` / `push-gate` 两个运行面无运行时 e2e** | e2e 仓 `grep -rl model-fallback` / `push-gate` ⇒ 各 **0 命中** | `model-fallback` 的 retry 钩子接线（`plugins/model-fallback.ts` 注册 `retry`/`prompt` 两个钩子）与 `push-gate` 的 force-push 硬拒（工具层兜底）**只有单测**；两者的「宿主是否真的挂上钩子 / 真的拦住」属宿主接线面，单测覆盖不到 |
| **G-4** | **AC17（`failed` / `interrupted` 返回结构）仍无覆盖** | `grep -rn "interrupted" lib/*.ts tests/*.test.ts` ⇒ 只命中 `lib/delegate-async.ts` 的**异步派发**路径（`:1921-1926`），`delegate-core` 的 `outcome` 分类用例为 0 | e2e 跨仓缺口表第 4 条（2026-11-06 登记）至今**未闭合** |
| **G-5** | `rollback-drill` / `commit-gate-doctor` 无 e2e（但有本地用例 + 真实演练留痕） | e2e 仓 ⇒ 各 0 命中；本仓 `tests/rollback-drill.test.ts`（39 例）+ `tests/commit-gate-doctor.test.ts`（12 例）+ 清单 `last_drill` 实跑记录（`plan-topics.json` 记 `sha=c604113`、`result=pass`） | 风险低（演练有留痕），但**留痕的时效性**无守卫（`rollback-registry.test.ts` 有 `last_drill` 时效检查，已覆盖） |

---

## 1b. 按本仓自己的口径复核（`docs/test-authoring.md` §1 / §5）

本仓有成文的测试分层标准（`docs/test-authoring.md` §1「先选层：四层各自能证明什么（也各不能证明什么）」），且 §1 明写「**不要把『我在 A 层建了测试』说成『A+B 都被覆盖了』**」。用本仓自己的尺子量本批：

| 层 | 本批（D9/D10/D11 + D5）到达的层 | 依据 |
|---|---|---|
| 静态契约 | ✅ 有（prompt / 回滚清单 / 配置投影同步） | `prompts/plan.md` 整节 + 两份回滚清单逐字节 find/replace + `tests/config-guards.test.ts` |
| 纯逻辑单测 | ✅ 有（V16–V36 全覆盖，21 条） | `tests/plan-topics-lifecycle.test.ts`（22 例）+ `plan-topics-dag.test.ts`（39 例）+ `plan-topics.test.ts`（35 例） |
| **行为端到端** | ❌ **0 例** | e2e 仓 `grep plan-topics` ⇒ 0 命中；无真 `plan` 会话派真 `plan-worker` 的 L2 用例 |
| **手工验收** | ❌ **0（对 D9/D10/D11）** | 人工 e2e 记录只有 2026-11-20 初版（覆盖 V11/V12，且 V12 有 3 项「⏳ 未执行」）；D9/D10/D11 落地后**没有**任何人工 e2e |

⇒ **按本仓自己的口径，这批机制目前是「单层覆盖」（L1 静态 + 纯逻辑），L2/L3 为零**。
⚠ §5 另注：「『进 CI』是**规范性要求，不是现状描述**——本仓 CI 尚未接入」⇒ 本仓的唯一真实闸门仍是本地 `bun test tests/` + 上游锚点（ADR V01 口径）；行为层**本就不该进 CI**，但也**没有替代它的东西**（既没有 CI，也没有定时跑的实跑记录）。

---

## 2. 债务清理

### 2.1 改进池：25 / 32 条指向已归档 change ⇒ 池里混着已完成的事

机读结果（`.rddf/improvements/*.md` 扫 `openspec/changes/archive/<name>/` 指针 + 状态标记）：

- **池文件数：32**
- **指向已归档 change 的：25** ⇒ 池里 **25/32 是已完成的事**
- **状态表达的形态：散文、且不统一** —— 有的写「**实施状态**：✅ 已归档（日期）」，有的写「关联 change：**已归档**」，有的只有 frontmatter `feedback_status: resolved`，有的**什么标记都没有** ⇒ **没有任何统一、机读的状态字段** ⇒ 产品侧 `rddf status` 读不出来（**这正是债清不掉的根因**）
- **既已归档又无任何状态标记**（抽检确定）：`canonical-root-normalization` · `delegate-base-resolved-return` · `front-cancel-release`
- **无 change 指针的 7 条**：`delegation-matrix-fill-semantics`（backlog）· `front-agent-redesign`（有 3 条未实测判据）· `rddf-status-improvement-status-mismatch`（backlog，跨仓）· `role-matrix-allow-deny-guard-design`（设计草案，明写「先设计，不硬上弱断言」）· `role-write-set-machine-block`（实现已在 `prompts/build.md` 的机读投影块）· `rollback-drill-replace-pattern`（**自陈已实施**）· `rollback-manifest-find-narrowing`（**正文写「尚未立项」但 change 已归档 2026-11-24 ⇒ 指针失效**）

**上一次清账**：`81131e8`（2026-11-24）只改了 **8 条**的状态行/指针，且在 commit body 里留了未清项：
> 「遗留（已在 backend-handoff-role-class 内登记）：feedback-20261113-001 条目正文的 resolution 字段仍为 open —— `rddf feedback` CLI 无 resolve 子命令，无 single-writer 途径更新」

⇒ **清账是逐条手工做的一次性动作，没有机制**；下一批新增的 8 条改进（本次 32 条中大部分）又落回「已完成但没标」的状态。

**根因（已定位到机制，且**本仓可自行止血**）**：
产品侧 `_lib/dashboard/__init__.py::collect_pending()` 的「已归档 ⇒ 不是待办」判定只有**两条**通路：
1. **同名短路** —— improvement 文件名命中 `openspec/changes/archive/<date>-<name>/` 的 `<name>` ⇒ 跳过；
2. **front-matter `状态` 字段** —— `read_improvement_entries` 归一 `status`/`状态`、`priority`/`优先级`、`phase`/`阶段`、`category`/`分类`、`source`/`来源`；`classify_improvement_status()` 按**前导标记**分类（`已归档`/`已完成`/`已实施`/`archived`/`implemented`… ⇒ terminal ⇒ 不进 pending；空 ⇒ 兜底「待讨论」）。

⇒ **本仓两条都不成立**：① improvement 名与归档 change 名**经常不同**（`adr-front-knowledge-librarian-whitelist-annotation` ↔ `2026-11-23-librarian-delegate-contradiction`；`delegate-base-resolved-return` ↔ `2026-11-19-delegate-base-channel`；`cross-repo-check-trigger-in-agent-checklist` ↔ `2026-11-16-cross-repo-workspace-check`；`rdd-verifier-state-consolidation` ↔ `2026-11-14-consolidate-verifier-state`）；② **本仓 0 / 32 个 improvement 带 front-matter `状态` 字段**（`grep -l "^状态:" .rddf/improvements/*.md` ⇒ 0；7 个文件有 YAML frontmatter 但只含 `feedback_status`）。

**实测（本机 `rddf status`）**：
```
📋 Improvement proposals
   Total pending: 10
NAME                                         PRI    STATUS       PHASE
adr-front-knowledge-librarian-whitelist-anno -      待讨论          -
cross-repo-check-trigger-in-agent-checklist  -      待讨论          -
delegate-base-resolved-return                -      待讨论          -
delegation-matrix-fill-semantics             -      待讨论          -
front-agent-redesign                         -      待讨论          -
rdd-verifier-state-consolidation             -      待讨论          -
rddf-status-improvement-status-mismatch      -      待讨论          -
role-matrix-allow-deny-guard-design          -      待讨论          -
role-write-set-machine-block                 -      待讨论          -
rollback-drill-replace-pattern               -      待讨论          -
```
⇒ **10 条待办里 6 条其实已完成**（4 条 = 名字不匹配的已归档项；2 条 = `role-write-set-machine-block` / `rollback-drill-replace-pattern` 实现已完成但未登记）⇒ 真正待办只有 **4 条**。

**止血验证（只读实验，不改仓库）**：把 `.rddf/improvements/` 复制到临时目录，给那 6 条已完成的加 YAML front-matter（`status: 已归档（YYYY-MM-DD）` + `priority: P2`），再用产品侧 `collect_pending()` 读：
```
补 front-matter 前：pending=32  errors=0   （合成目录里没有 archive 目录 ⇒ 同名短路不生效 ⇒ 全显「待讨论」）
补 front-matter 后：pending=26  errors=0   （6 条已完成项被移出 pending）
```
⇒ **补 front-matter 就能让「已完成的事」离开待办池**，**不需要改产品仓**（产品侧的分类器与别名已就位，缺的是本仓的数据）。
⚠ 前提：本仓的 5 段散文形态与 frontmatter 并存时，**`status` 前导标记必须命中 terminal 词表**（`已归档`/`已完成`/`已实施`/`archived`/`implemented`…）否则会被兜底成「待讨论」。

### 2.2 本批（D9/D10/D11 + D5）验收遗留

见 `.rddf/reviews/plan-topics-d9-d10-d11-verify.md`（本轮第 1 轮）：

| # | 项 | 级别 | 归属 |
|---|---|---|---|
| **F-1** | `.rddf/rollback/plan-topics.json` 的 `notes` 散文仍写旧单文件路径 `.rddf/state/plan-sessions.json`（ADR D5 落地硬约束 ⑥ 要求刷新，README 已刷、notes 未刷） | ❌ 未闭合（`implementation_gap`，文档级、零机械影响、一行可修） | builder |
| **SF-1** | V25 的**并发**子句未进 CI（单测只有顺序双 claim；ADR 明写「须用确定性编排而非裸并发」） | SHOULD_FIX | builder（下一批） |
| **SF-2** | ADR Verification 章导语仍写「V01–V15 + V16–V21」，表内已有 V22–V36 | SHOULD_FIX | architect |
| **SF-3** | `.rddf/improvements/plan-multi-session-collaboration.md` 仍有 6 处旧单文件路径（D5 硬约束只列了 roadmap ⇒ 不属本批 AC） | SHOULD_FIX | planner（可并入 2.1 的清账批） |
| **SF-4** | 决策段（D9/D10/D11）与实现同处一个提交 `ec28138` ⇒ git 历史里 authorship 不可分 | 观察 | 流程 |
| **SF-5** | `docs/CHANGELOG.md` 缺 v2.75（本批实现记录） | 收尾 | 用户 |

### 2.3 ADR 残留（plan-topics，13 条）

`docs/adr/ADR-plan-multi-session-collaboration.md:308-320` 登记残留 **#1–#13**。分类：

- **范围决定型（本期不做，登记即终态）**：#1 每节点精确写域 · #2 派发事前闸门 · #8 逐边策略 · #12 自动接管（TTL）· #13 交付信号
- **待后续能力到位**：#3（prompt 重复，靠守卫未实现）· #4（目录边界待产品侧确认）· #5（`docs/adr/` 平铺盲区 ⇒ 本篇选「靠 review 流程兜底」）· #6（重开/un-cancel）· #7（in-flight 与取消的中断）· #9（prompt 与回滚清单同步 ⇒ **本批已做**）· #10（scope-check 按节点归因）· #11（D10 落地顺序约束 ⇒ **本批已做**）

⇒ **ADR 残留登记本身是完备的**（13 条均有归属与触发条件）；**未清的是「已登记但已被后续批次消化」的那几条**（#9 / #11 已由本批完成，ADR 正文未标「已闭合」⇒ 又一处轻债）。

### 2.4 e2e 仓的债

| 面 | 内容 | 证据 |
|---|---|---|
| **KNOWN_FAILURES** | **8 条**，全部因上游 `rdd-workflow` 退役 `guide` skill（`rddf_session_hook_poll_events` 已移除）⇒ `command not found` | `tests/KNOWN_FAILURES.txt`（AC-G1/AC-G2/AC-G3/REAL-2P-1/REAL-2P-2/AC-5/AC-6a/AC-6b）｜归因说明：「在 pristine HEAD 树（`git archive HEAD`）上可复现，与 harness/ 新增代码无关」 |
| **跨仓缺口表** | **9 条**（opencode 仓归属），文档日期 **2026-11-06 / 最后修改 2026-11-08** ⇒ 距今 **17 天 / 本仓 347 个提交**未复核 | `docs/known-gaps-and-ownership.md`｜抽样复核：**#1 并发写盘**已由本仓 `tests/role-lease-claims.test.ts:283`「两子进程并发 acquire ⇒ 恰好一方成功（barrier 真并发）」闭合 ⇒ **表未更新**；**#5 `unknown` 语义**已由 `tests/delegate-tool.test.ts:519` 闭合 ⇒ **表未更新**；**#4 `failed`/`interrupted`**、**#6 scope 只约束 edit 类目**、**#7 pair 过期清理**（`lib/delegate-core.ts` 无淘汰策略）**仍开放** |
| **README 计数漂移** | README 表格写 front_delegate **26**（实际 `@test` 25）· stage_guide **6**（实际 7） | `README.md:56-59` vs `grep -c "^@test"` |
| **文件内自述漂移** | `test_class_scope_runtime.bats` 头注写「E2E_REAL_RUNTIME=1 → **4 条**用例真正执行」，实际该文件有 **7** 条（CS-1…CS-7） | `tests/integration/test_class_scope_runtime.bats:9` vs `grep -n "^@test"` |

**旁证：产品侧 `rdd-workflow` 的 known-failure 面**（本轮顺带清点，未全量跑其套件）：
`~/.agents/skills/rdd-workflow/tests/KNOWN_FAILURES.txt` 历史登记过 **28（2026-08-28）+ 19（2026-08-25）** 条 bats 预存失败，**当前只剩 2 条**（`env-bootstrap --help` 只渲染 4 个 flag ⇒ 跟踪 `feat-rdd-env-bootstrap-help-audit`；`mark_approved_completed.sh` 二次调用覆盖 completion date ⇒ 跟踪 `feat-rdd-builder-idempotency-audit (TBD)`）⇒ 产品侧的「预存失败债」基本已清，只剩 2 条且各有跟踪项；
另 `KNOWN_PYTHON_FAILURES.txt` 1 条（`test_openspec_validate_any_active_change`）；`KNOWN_UNEVALUATED.txt` 的语义是「某 bats 文件重试后仍未跑完 ⇒ 它的失败不进失败集合 ⇒ 可能藏真实失败」⇒ **该清单非空即门失败**。

---

## 3. `rdd-workflow-e2e` 端到端完备性

### 3.1 事实盘点

| 项 | 值 | 证据 |
|---|---|---|
| bats 文件 | **22**（`tests/integration/` 18 + `tests/_lib/` 4） | `find tests -name "*.bats"` |
| `@test` 总数 | **约 141**（integration **129** + `_lib` 12） | 逐文件 `grep -c "^@test"`：front_delegate 25 · evidence_discipline 23 · subagent_contract 11 · role_gate 8 · stage_guide 7 · independent_build 7 · full_workflow 7 · class_scope 7 · rddf_cli 6 · oracle_intent 6 · install_global 6 · external_smoke 5 · role_class 4 · guide_polling 3 · two_owner 2 · vocab 2 · commit_gate 2 |
| **需真实运行时（默认 skip）** | **68**（实跑 skip 计数；8 个文件走 `E2E_REAL_RUNTIME=1` 门控；`@test` 计数口径为 71，差 3 条是门控粒度差异）—— front_delegate 25 · subagent_contract 11 · role_gate 8 · independent_build 7 · class_scope 7 · oracle_intent_gate 6 · role_class 4 · commit_gate 2 | `grep -rl E2E_REAL_RUNTIME tests/integration/*.bats` ⇒ 9 个文件（其中 `independent_build_session_vocab.bats` **不**随门控跳过 ⇒ 实算 8 个） |
| **零模型（默认跑）** | **67 条真跑全绿**（实跑计数；integration 55 + `_lib` 12） | evidence_discipline 23 · full_workflow 7 · stage_guide 7 · rddf_cli 6 · install_global 6 · external_smoke 5 · guide_polling 3 · two_owner 2 · vocab 2 · `_lib` 12 |
| ⚠ README 自身的计数 | e2e 仓 README 写「Plus **58** real-runtime cases」并只列 6 个文件 ⇒ **漏计** `class_scope` 7 + `oracle_intent_gate` 6（实算 71） | `README.md:68` vs 逐文件 `@test` 计数 |
| 被测对象 | **产品侧** = `$HOME/.agents/skills/rdd-workflow`（`RDD_WORKFLOW_REPO`）；**本仓侧** = `$HOME/.config/opencode`（`OC_ROOT` / `TARGET_REPO` / `SC_SRC`）⇒ **测的是本机活仓**，改动即时生效 | `tests/test_helper.bash:20-24` + `test_role_gate_runtime.bats:48` `test_evidence_discipline.bats:34` `test_subagent_contract_runtime.bats:101` |
| 本仓侧覆盖面 | 角色感知写门（8）· commit 验证门（2）· subagent 输入契约（11）· front 委派面（26）· 派发能力类边界（4）· 独立 build 会话（7）· oracle 意图闸门（6）· 能力面写集 + verifier 取证不可用（7）· 证据纪律（23） | 逐 bats 文件头注 |
| 编排 | `bats -r tests/`（**`-r` 必须**：漏了会跑出 `1..0`） | `README.md:48` |

### 3.2 覆盖映射：本仓运行面 ↔ e2e

| 本仓运行面 | 运行时 e2e | 备注 |
|---|---|---|
| `plugins/role-gate.ts` + `lib/role-lease.ts` | ✅ 8 例 | 同角色租约冲突 / 异类放行 / 接管后原会话被拒 / 分区隔离 / linked worktree 只写主仓 stateRoot / architect 写 `src/**` 真被拒 / 后端不受门控 / 非 build 主会话不参与 |
| `plugins/commit-gate.ts` + `lib/push-gate.ts` | ⚠️ 2 例（仅 commit 门禁的接线与反绕过） | **push-gate 的 force-push 硬拒 0 例**（G-3） |
| `plugins/subagent-contract.ts` | ✅ 11 例 | L3 注入 / L1 warn-vs-enforce / L2 兜底 / 豁免三路径 / 逐 agent 覆盖 / 审计 CLI |
| `plugins/delegate.ts` + `lib/delegate-core.ts` | ✅ 26 例 | 工具门控 / 真委托 / pair+role 登记 / scope 越界 / busy / 续接 / 知识 session / ledger / 权限加固 / 异步派发 |
| `plugins/model-fallback.ts` | ❌ 0 例 | G-3 |
| `lib/plan-topics.ts` + `scripts/plan-topic-check.ts` | ❌ 0 例 | **G-2：本批 D9/D10/D11 全部零运行时 e2e** |
| `lib/rollback-drill.ts` / `rollback-registry.ts` | ❌ 0 例（本地 39+21 例 + 演练留痕） | G-5 |
| `lib/commit-gate-doctor.ts` | ❌ 0 例（本地 12 例） | G-5 |
| 治理面文档投影（`docs/MULTI-AGENT-DESIGN.md` / `SUBAGENT-ORCHESTRATION.md` / `prompts/**`） | ⚠️ 间接（`arch-docs-scope` 一族，**依赖 fixture 床**） | G-1 |

### 3.3 e2e 仓自己的完备性边界（自陈）

| ADR | Status | 自陈的边界 |
|---|---|---|
| **ADR-0003**（评测集分层与 oracle 准入） | **Proposed**（2026-11-19） | 「现有 e2e 几乎全是**契约测试**，能防回归，但不能回答『agent 在这类任务上变好还是变坏』」；三层 = **contract**（每 PR）/ **capability**（夜间，≥30 条后拆分）/ **adversarial**（变异）；「**P0 只做观测指标，不建评测集**」；转正规则含「有 reference solution 且它通过该 oracle」「替代正确解也必须通过」「一次变红演练记录」「case 定义对被测 solver 不可达」「oracle 审计 `auditor ≠ author`」 |
| **ADR-0005**（度量、CI gate 与版本 pin） | **Proposed** | 指标公式**写死并版本钉住**（`METRICS_VERSION`，改公式须升版本）；但 **CI gate 属 P1**（`backlog: harness-p1`，**未立项**）⇒ 今天**只有指标、没有阈值门禁**；P0 实测三条指标回写（未知率 / 错误类别分布 / 执行失败率）**未经 critic 复审**（ADR 自陈） |
| **ADR-0001/0002/0004/0006** | Proposed | 数据面 / trace-outcome 契约 / RSI 写边界 / 评测隔离契约 —— 均**未立项** |

⇒ **结论**：e2e 仓的**完备性是分期的**。今天的套件在**契约层**是完备的（22 文件 / 143 例实跑：67 绿 + 68 跳过 + 8 条已知失败，零新增回归）；**能力层与对抗层尚不存在**，且 P1（评测集 + CI gate）**未立项** ⇒ 「agent 变好还是变坏」这个问题**当前无法回答**。

### 3.4 本轮实跑（默认模式）

```
$ cd /workspace/main/rdd-workflow-e2e && RDD_WORKFLOW_REPO=$HOME/.agents/skills/rdd-workflow bats -r tests/
1..143
… 67 条真跑全过 … 68 条 # skip（E2E_REAL_RUNTIME 门控）…
not ok 82  AC-G1     not ok 83  AC-G2     not ok 84  AC-G3
not ok 112 REAL-2P-1 not ok 113 REAL-2P-2
not ok 130 AC-5      not ok 131 AC-6a    not ok 132 AC-6b
（根因均为：bash: rddf_session_hook_poll_events: command not found
          / skills/guide/scripts/guide_entry.sh: No such file or directory）
exit=1
```

⇒ **失败集 == `tests/KNOWN_FAILURES.txt` 登记的 8 条，一一对应 ⇒ 零新增回归**；套件**当前可用**（67 条零模型用例全绿）；exit 1 仅因已知失败在场。
⇒ 真实运行时层（68 条）本轮**未跑**（需真实模型 + 真实宿主）⇒ 该层的当前状态**本轮无新证据**（历史实跑证据见 e2e 仓 README 与本仓 `.rddf/reviews/*-e2e*.md`）。

---

## 4. 三问之间的因果（一条线看完）

1. **e2e 仓最完备的部分 = 本仓的「门与契约」**（role-gate / commit-gate / subagent-contract / delegate / oracle 闸门 / 证据纪律）⇒ 本仓的**治理面**有运行时保护。
2. **e2e 仓完全没有的部分 = 本仓新长出来的「机制面」**（plan-topics 协作机制 / model-fallback / push-gate）⇒ **新机制只配了单测**（这正是本批的现状）。
3. **债的可见性坏掉 ⇒ 债清不掉**：改进池 25/32 是已完成的事，而 `rddf status` 全显「待讨论」；清账只能靠手工逐条（上次清 8 条用了 1 个 commit）。
4. **债可见性的修复在别的仓**（产品侧 `improvement_status.py`）⇒ 本仓能做的只有「给 25 条补统一 frontmatter 状态字段」这一件本地活。

---

## 5. 建议（按「本仓可独立做 / 需跨仓 / 需你拍板」三档排序）

| 档 | # | 建议 | 成本 |
|---|---|---|---|
| **本仓可独立做** | S-1 | **补 F-1**（回滚清单 `notes` 的旧路径，一行）⇒ 本批从 `needs-revision` 转 `pass` | 1 行 + 一次 `bun test tests/` |
| | S-2 | **改进池清账（本仓可独立做，已验证可行）**：给那 6 条「已完成却仍挂在待办池」的 improvement 补 YAML front-matter（`status: 已归档（YYYY-MM-DD）` + `priority: P2`）⇒ `rddf status` 的 pending **10 → 4**（只剩真待办的 `delegation-matrix-fill-semantics` / `front-agent-redesign` / `rddf-status-improvement-status-mismatch` / `role-matrix-allow-deny-guard-design`）；顺带修 `rollback-manifest-find-narrowing` 的失效指针（正文写「尚未立项」但 change 已归档 2026-11-24）⇒ 债立刻可见 | 6 个文件的 front-matter（各 3 行）+ 1 处指针 |
| | S-3 | **SF-1**：把 V25 的并发子句按 ADR 要求做成**确定性编排**用例进 CI（编排层预置锁 + 一次性放行，避免裸并发 flaky） | 1 个用例 + 1 个 fixture 助手 |
| | S-4 | **SF-3 / ADR 残留 #9 / #11**：在 ADR 残留章标「已由 D9/D10/D11 批闭合」⇒ 残留清单不骗人 | ADR 2 行（architect 面） |
| | S-5 | **G-1**：`arch-docs-scope` 一族的「床不在 ⇒ 静默 skip」改成**可见信号**（至少在 `bun test` 输出里打一行「床缺失 ⇒ 本族零判别力」，或让 commit gate 的 `verify_commands` 显式检查床） | 小（测试文件 + commit-gate 声明） |
| **需跨仓**（产品侧 `rdd-workflow`） | S-6 | **债可见性的产品侧增强**（可选，不是 S-2 的前提）：`collect_pending` 目前只认「同名归档目录」+「front-matter `状态`」⇒ 若希望**零 front-matter 也能判**，需产品侧加一条「关联 change 已归档 ⇒ 视为 terminal」的解析（读 improvement 正文里的 change 指针）⇒ 属 `rddf-status-improvement-status-mismatch` 的跨仓立项内容 | 跨仓 change（**不阻塞 S-2**） |
| | S-7 | **e2e 仓 P1**：`harness-p1`（CI gate + capability 集 ≥30 条）+ 把 8 条 KNOWN_FAILURES 迁到新推荐器实现路径 | 跨仓 change |
| | S-8 | **e2e 仓跨仓缺口表刷新**（2026-11-08 ⇒ 今日）：把已闭合的 #1 / #5 标闭合，把仍开放的 #4 / #6 / #7 的归属写清（#4/#6/#7 归本仓） | 跨仓文档小改 |
| **需你拍板** | S-9 | 本批 D9/D10/D11 是否补**运行时 e2e**（真 plan 会话派真 plan-worker 的 L2 用例）？成本 = 真实模型额度 + e2e 仓新文件；不补 = 这套机制永远只有单测保护 | 决策 |
| | S-10 | `model-fallback` / `push-gate` 两个运行面是否补 L2？（模型降级链的宿主接线、force-push 硬拒的真拦截） | 决策 |

---

## 6. 实跑记录

| 命令 | 结果 |
|---|---|
| `bun test tests/` | 1229 pass / 1 skip / 0 fail（34 文件 / 5053 expect / 40.95s） |
| `bun test tests/arch-docs-scope.test.ts` | 1 pass（14.83s）—— 床在本机 ⇒ 该族**有**判别力 |
| `bash scripts/check-upstream-anchors.sh` | `RESULT: OK（30/30）` |
| `bun scripts/agent-guard-gen.ts --check` | `OK：7 个 agent 的 shell 块与规则真源一致` |
| `rddf status`（本仓） | pending **10** 条，STATUS 列全「待讨论」、PRI 列全 `-`（其中 **6 条已完成**）⇒ 见 §2.1 |
| `cd /workspace/main/rdd-workflow-e2e && RDD_WORKFLOW_REPO=$HOME/.agents/skills/rdd-workflow bats -r tests/` | **143 例**：**67 真跑全过** + **68 跳过**（`E2E_REAL_RUNTIME` 门控）+ **8 失败** ⇒ **8 条失败与 `tests/KNOWN_FAILURES.txt` 登记的 8 条逐一对应**（AC-G1 / AC-G2 / AC-G3 / REAL-2P-1 / REAL-2P-2 / AC-5 / AC-6a / AC-6b），根因同为**上游 `rdd-workflow` 退役 `guide` skill**（`rddf_session_hook_poll_events: command not found` / `skills/guide/scripts/guide_entry.sh: No such file or directory`）⇒ **零新增回归**；bats exit 1（已知失败在场） |

---

## 7. 未取证 / 不在本轮范围

- **L2 真实运行时 68 例**：需真实模型 + 真实宿主（`E2E_REAL_RUNTIME=1`）⇒ 本轮**未跑**（模型额度 + 宿主行为）；本仓侧的历史实跑证据见 e2e 仓 README 与 `.rddf/reviews/*-e2e*.md`。
- **`rdd-workflow` 产品侧的单测/集成**（`~/.agents/skills/rdd-workflow/tests/`，含 `KNOWN_FAILURES.txt` / `KNOWN_PYTHON_FAILURES.txt` / `KNOWN_UNEVALUATED.txt` 三份基线）：本轮**未跑**（本仓无 `rddf` CI 接线）⇒ 产品侧的债面**未清点**（只清点了 e2e 仓的 KNOWN_FAILURES）。
- **本批 V16–V36 的运行时面**：见 `.rddf/reviews/plan-topics-d9-d10-d11-verify.md`（单测 + verifier 探针）；**人工 e2e 缺口**（V11 / V12）未补。
