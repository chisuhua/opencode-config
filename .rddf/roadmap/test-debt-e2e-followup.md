# test-debt-e2e-followup — 测试完备性 / 债务 / e2e 覆盖的后续路线图（planner 产出）

> 决策依据（**无 ADR** —— 本路线图是**债务治理**，不是架构决策；不引入新机制，只补判据与登记）：
> - `.rddf/reviews/test-completeness-debt-e2e-audit-2026-11-25.md`（测试完备性 / 债务 / `rdd-workflow-e2e` 审计，verifier）
> - `.rddf/reviews/plan-topics-d9-d10-d11-verify.md`（D9/D10/D11 + D5 实现批验收，verdict=`needs-revision`，1 项未闭合）
> 关联 change：**尚未立项**（本路线图 = 立项前的分批计划；每批的落点是 §2 的任务表，**由 builder 按 openspec change 流程实施**）
> ⚠ **本路径未启用 `rdd-planner` / `add-improve`**：`rdd-planner` 前置（`.rddf/state/.arch-handoff.json`）不存在；`add-improve` 的 HARD-GATE（YAML frontmatter + 7 段 + `.rddf/roadmap.md` 的 Phase Skeleton Theme 列）与本仓形态（32 个 improvement 全 5 段散文、**无** `状态` 字段（7 份有 YAML frontmatter 但只含 `feedback_status`）、且**无** `.rddf/roadmap.md`）**不可兼容** ⇒ 走**内置流程**，本文件按 `.rddf/roadmap/plan-multi-session-collaboration.md` 的既有体例写。
> 修订记录：**第 1 版** —— 本路线图本身无独立 metis 轮次（metis 固定审查配对落在**两份改进提案**上，各 1 轮）；本版的自查订正：① 把「用户裁决项」从任务表里**拆出去**（不混在可执行任务里）；② 给每个任务标**归属角色**（planner / builder / architect / 跨仓）—— 治理面与架构文档不属 planner 写集；③ 明确「本路线图不实施任何代码」；④ 补**判别力回退**的兜底（跨仓依赖缺失时怎么办）；⑤ **订正审计报告的一处过粗推断**（「improvement 指向已归档 change ⇒ 已完成」不成立 ⇒ 逐条核 Acceptance 后是 **3 条已完成 / 7 条真待办**，不是 6 / 4）。

---

## 1. 范围与依据

### 1.1 做什么（3 批 + 1 张归属表）

审计给出的 10 条建议（S-1…S-10）按**「本仓能否自闭环」**与**「是否需要用户拍板」**切成三批：

| 批 | 内容 | 是否需要用户裁决 | 是否需要跨仓 | 归属 |
|---|---|---|---|---|
| **A** | 本仓自闭环的 5 项（判据补强 + 债可见性 + 登记订正）：A1–A4 + **A5③** | ❌ 否 | ❌ 否 | planner / builder（逐项见 §2）｜**A5①② 是 architect 面 ⇒ 另案**（见 §6 末条） |
| **B** | 需要**花钱（模型额度）或改变覆盖策略**的 2 项（新机制运行时 e2e；model-fallback / push-gate 的 L2） | ✅ **是** | ✅ 是（e2e 仓） | 待裁决后立项 |
| **C** | 跨仓维护项（e2e 仓的已知失败迁移 / 缺口表刷新 / 计数漂移；产品侧债可见性增强） | ❌ 否 | ✅ 是 | 跨仓，各自仓内立项 |

### 1.2 不做什么（显式排除，防范围蔓延）

- ❌ **不动已归档 change 与既有 ADR 的决策内容** —— 本路线图只改**登记面**（状态字段 / 指针 / 残留标注），不改判据语义。
- ❌ **不改 ADR 的 Verification 判据表** —— V16–V36 全部通过（`.rddf/reviews/plan-topics-d9-d10-d11-verify.md`）；要加判据属 architect 的 ADR 修订流程，不是本路线图的事（SF-2 已单列给 architect）。
- ❌ **不把 e2e 仓的债搬进本仓** —— `rdd-workflow-e2e` / `rdd-workflow` 的债在各自仓清（Batch C），本仓只做**指向与依赖登记**。
- ❌ **不改 `prompts/**` / `lib/**` / `plugins/**` 的行为** —— A 批只加**测试/登记**；治理面若要改（SF-2 的 ADR 导语、SF-4 的 ADR 残留标注）走 architect 流程（oracle → critic）。
- ❌ **不承诺 CI 接线** —— 本仓无 CI、无生效 git hook（ADR V01 / `docs/test-authoring.md` §5）；A 批的所有判据都落在**本地规范命令**（`bun test tests/` + 上游锚点）里。
- ❌ **不在本路线图里实施任何代码** —— planner 只出计划与改进提案；实施属 builder（按 openspec change 流程）。

---

## 2. 任务分解（每项含归属 / 依赖 / 判据）

> 纪律：**每项先写判据（红）→ 再改（绿）→ 跑该批判据**。
> **实施顺序**：A1 → A2 → A3 → A4 → A5（各项互不依赖，可并行）；**B / C 批在 A 批完成后启动**（先清债面，再动需要花钱与跨仓的件）。

### A1 ｜ 补 F-1：回滚清单 `notes` 的旧路径（一行）

| 项 | 内容 |
|---|---|
| **问题** | ADR D5 落地硬约束 ⑥ 要求 `.rddf/rollback/plan-topics.json` 的 `notes` 散文刷新旧单文件路径；README 侧已刷、**notes 未刷** ⇒ 本批验收判定 `needs-revision`（`implementation_gap`，文档级、零机械影响） |
| **改什么** | `.rddf/rollback/plan-topics.json` 的 `notes` 里 `.rddf/state/plan-sessions.json` ⇒ `.rddf/state/plan-sessions/`（与 `.rddf/rollback/README.md:141` 同措辞） |
| **归属** | **builder**（`.rddf/rollback/**` 不在 planner 写集；也不是架构文档 ⇒ builder 面） |
| **判据** | ① `python3 -c "import json;print('plan-sessions.json' in json.load(open('.rddf/rollback/plan-topics.json'))['notes'])"` ⇒ `False`；② `bun test tests/` 仍全绿；③ `bun scripts/rollback-drill.ts` 的清单自检（该清单的 `planDrill` 仍可执行） |
| **依赖 / 风险** | 无依赖；风险 = 改散文时误改 `edits[]`（⇒ 逐字节 diff 复核 `edits[]` 未变） |

### A2 ｜ 改进池状态机读化 + 失效指针修正

| 项 | 内容 |
|---|---|
| **问题** | 实测 `rddf status`：**pending 10 条，STATUS 列全「待讨论」、PRI 列全 `-`**。逐条核 Acceptance 后：**3 条其实已完成**（`rdd-verifier-state-consolidation` / `role-write-set-machine-block` / `rollback-drill-replace-pattern` ⇒ 虚报待办），**7 条是真待办**（但标签全是兜底 ⇒ 不可读）。根因：产品侧 `collect_pending()` 只有两条「已归档 ⇒ 不是待办」的通路（① improvement 文件名命中 `openspec/changes/archive/<date>-<name>/` 的 `<name>`；② **front-matter `状态` 字段**），而本仓 **0/32** 提供该字段 |
| **改什么** | ① **逐条核 Acceptance / 核产物在盘上**（**不是**看 change 指针 ⇒ 已抓到 3 个反例），给 3 条已完成项补 terminal front-matter、7 条真待办补非 terminal front-matter（`未立项`/`待审查`/`部分闭合`/`规划输入`）+ `priority:`；② 修 `rollback-manifest-find-narrowing` 的失效指针（正文写「尚未立项」但 change 已归档 2026-11-24） |
| **归属** | **planner**（`.rddf/improvements/**` 在 planner 写集内 ⇒ **planner 可自办**，不需 builder） |
| **判据** | ① `rddf status` 的 `Total pending` = **7**（= 真待办那 7 条）；② 7 条的 STATUS 列**不是**「待讨论」（分别是未立项/待审查/部分闭合/规划输入）；③ PRI 列**无 `-`**；④ `bun test tests/` 全绿（`tests/rollback-registry.test.ts` / `record-discipline.test.ts` 不因 front-matter 变更而红）；⑤ **变红演练**：把某条已完成的 front-matter 去掉 ⇒ `rddf status` 的 pending 回到 5 ⇒ 恢复后复绿（证明判据有判别力，不是恒绿） |
| **已验证** | 产品侧 `collect_pending()` 在**临时副本**上实测：补 front-matter 前 pending 32 → 补后 26（合成目录口径，6 条已完成项被移出）⇒ 真实仓口径 10 → **7**。**本项不需要改产品仓** |
| **依赖 / 风险** | 无依赖；风险 ① = front-matter 的 `status` 前导词不在产品侧词表内 ⇒ 被兜底成「待讨论」⇒ 词表必须命中；风险 ② = **把真待办误标成已完成 ⇒ 债从视野里消失**（已抓到 3 个「表面已完成实际未完成」的反例 ⇒ 必须逐条核 Acceptance）；风险 ③ = 0/32 提供 front-matter ⇒ **新增提案若不写字段，池子会重新变脏** ⇒ 约定「新增 improvement 默认带 `status` + `priority`」（本仓形态首次引入 YAML ⇒ 实施时先跑 `bun test tests/` 看红红在哪） |

### A3 ｜ arch-docs 守卫：去掉让「本地兜底」变死的 `skipIf`

| 项 | 内容 |
|---|---|
| **问题** | `tests/arch-docs-scope.test.ts:22` 用 `test.skipIf(!existsSync(BED))` 把整个 shell 守卫挡在门外；而 `tests/verify_arch_docs_scope.sh:71-80` **自带本地兜底**（床不在 ⇒ 本地构造等价项目形状 + WARN）⇒ **兜底路径被 wrapper 杀死** ⇒ 无床环境下 **64 条断言静默 skip**（零判别力，且不红不黄） |
| **改什么** | ① wrapper 改为**总是执行**（不再 `skipIf`）；② 断言脚本输出含 `项目形状：` 行（`e2e-bed` 或 `local-fallback`）⇒ 降级**可见**；③ 断言 `FAIL=0`；④ `tests/README.md` 把「床不在时 64 条断言静默 skip」的描述改成「床不在 ⇒ 走本地兜底，仍全量断言」 |
| **归属** | **builder**（`tests/**`；`tests/README.md` 亦 builder 面） |
| **判据** | ① `E2E_BED_DIR=/nonexistent bun test tests/arch-docs-scope.test.ts` ⇒ **1 pass**（不再是 skip），输出含 `local-fallback`；② 床在时 ⇒ 1 pass 且输出含 `e2e-bed`；③ 变红演练：临时改坏脚本里一条断言 ⇒ 该用例红 ⇒ 恢复复绿；④ `bun test tests/` 全绿 |
| **依赖 / 风险** | 无依赖；风险 = 本地兜底的项目形状与 e2e 真实 fixture 有细微差异 ⇒ 降级时必须**可见**（第 ② 条判据） |

### A4 ｜ V25 并发子句进 CI（确定性编排，禁裸并发）

| 项 | 内容 |
|---|---|
| **问题** | ADR V25 明写「并发 `claim` 恰好一个 exit 0（⚠ 实现批注意：该并发用例**易 flaky**，须用**确定性编排**而非裸并发）」，但实现批只落了**顺序**双 claim 的用例 ⇒ 该子句无 CI 保护（本轮 verifier 用 5 轮 × 6 并发探针验证过机制，但探针不入库） |
| **改什么** | ① 新增 `tests/fixtures/plan-claim-child.ts`（子进程 fixture：ready-file barrier ⇒ **真并发**）；② `tests/plan-topics-lifecycle.test.ts` 加一条「两子进程并发 claim 同一节点 ⇒ 恰好一个 exit 0、另一方被拒、且 `graph.json` 只多一条 attempt」；③ **复用** `tests/role-lease-claims.test.ts:283` 的 barrier 模式（本仓已有可抄的确定性并发范式） |
| **归属** | **builder**（`tests/**`） |
| **判据** | ① 新用例在 `bun test tests/` 中**连续跑 10 次全绿**（防 flaky）；② 断言 `attempts.length === 1` 且被拒方 exit ≠ 0；③ 变红演练：把 `scripts/plan-topic-check.ts` 的锁判据去掉（临时）⇒ 新用例红 ⇒ 恢复复绿；④ 既有 `plan-topics*` 用例零回归 |
| **依赖 / 风险** | 无依赖；风险 = barrier 实现不当 ⇒ flaky ⇒ 判据第 ① 条（连跑 10 次）即为兜底 |

### A5 ｜ 登记订正：ADR 残留「已闭合」标注 + roadmap 同步

| 项 | 内容 |
|---|---|
| **问题** | ① ADR 残留 #9（prompt 与回滚清单同步）与 #11（D10 落地顺序约束）**已由 D9/D10/D11 批完成**，但 ADR 残留章仍列为「待办」；② SF-2：ADR Verification 章导语仍写「V01–V15 + V16–V21」而表内已有 V22–V36；③ SF-3：`.rddf/improvements/plan-multi-session-collaboration.md` 仍有 6 处旧单文件路径 |
| **改什么** | ① ADR 残留章：#9 / #11 标「✅ 已由 D9/D10/D11 批闭合（2026-11-25）」；② ADR Verification 章导语补 V22–V36 的来源（D10 / D11 增补）；③ improvement 文件的 6 处旧路径改新形态（**只改路径字串，不改判据语义**） |
| **归属** | ① ② **architect**（`docs/adr/**` ⇒ oracle → critic；**只改登记措辞与已闭合标注 ⇒ 走 ADR 行的「改措辞」豁免路径，只 oracle**，但若触及决策条目则双审）⇒ **不进 A 批 change，另案**（见 §6 末条）；③ **planner**（`.rddf/improvements/**`）⇒ **进 A 批 change** |
| **判据** | ① ADR 残留章不再把 #9 / #11 列为未闭合；② 导语与表的编号范围一致（V01–V36）；③ `grep -n "plan-sessions\.json" .rddf/improvements/plan-multi-session-collaboration.md` ⇒ 0 命中（历史记述段除外，须逐条判定）；④ `bun test tests/` 全绿；⑤ 审查记录落 `.rddf/reviews/adr-plan-multi-session-collaboration-review-<n>.md` |
| **依赖 / 风险** | ③ 与 A2 同属改进池改动 ⇒ 建议**合并到 A2 同一批**做（避免两次动同一文件） |

### B1 ｜ 新机制（plan-topics D9/D10/D11）的运行时 e2e —— **待用户裁决**

| 项 | 内容 |
|---|---|
| **问题** | 按本仓自己的口径（`docs/test-authoring.md` §1）量，本批机制**只到 L1**（静态契约 + 纯逻辑单测，21 条 V 全覆盖），**L2 行为端到端 = 0、L3 手工验收 = 0**（人工 e2e 记录只有 2026-11-20 初版，且 V12 三项「⏳ 未执行」） |
| **候选路径** | **① 不补**（现状：单层覆盖，回归只靠单测；代价 = 宿主接线漂移无人发现）；**② 补最小 L2**（真 `plan` 会话派真 `plan-worker`，覆盖「先登记后 spawn → join → close → converged」一条主链 + 「取消事务」一条；成本 = 真实模型额度 + e2e 仓新文件 + 每次跑的额度）；**③ 只补可机判的接线面**（如「`claim` 的 `input` 快照在真 `plan-worker` 写完 TODO/RESULT 后被 checker 认成 complete」—— 可用真宿主 + **假 worker**（直接写盘）实现，**不吃模型额度**） |
| **建议** | **③ 优先，② 次之**：③ 用真宿主（`opencode run --agent plan`）+ 假 worker 落盘，覆盖「协议面」而不覆盖「模型行为面」；把「模型是否真按纪律转述」留给 ② 并**如实登记为不可自动化面** |
| **归属** | 待裁决后立项；跨仓（e2e 仓新文件）+ 本仓 builder 面（fixture / prompt 侧配合） |
| **判据（若走 ③）** | ① e2e 仓新增用例在 `E2E_REAL_RUNTIME=1` 下通过且**默认 skip**（行为端到端层不塞 CI，`docs/test-authoring.md` §5）；② 每条用例有**一次变红演练记录**（e2e 仓 `docs/runtime-assertion-discipline.md` 三条纪律）；③ 判据审计记录 `{case_id, oracle_sha, auditor, author}`（ADR-0003 转正规则） |

### B2 ｜ `model-fallback` / `push-gate` 的运行时 e2e —— **待用户裁决**

| 项 | 内容 |
|---|---|
| **问题** | 这两个运行面在 e2e 仓 **0 例**：`plugins/model-fallback.ts` 的 `retry`/`prompt` 两钩子是否真被宿主挂上、`lib/push-gate.ts` 的 force-push 硬拒是否真拦得住，都只有单测 |
| **候选路径** | ① 不补（单测够：内核逻辑已覆盖 33 例）；② 补「真被拒」一条（push-gate：真发一条 force push 命令 ⇒ 工具层真抛错）；③ 补 model-fallback 接线面（真会话里模型失败 ⇒ 链推进）—— **②③ 需要真模型/真额度** |
| **建议** | 先做 **②**（成本低、不吃额度：force push 的工具层硬拒可由「真调用 + 断言 Tool.Error」覆盖）；③ 的成本与 flaky 风险最高，放最后 |

### C1–C4 ｜ 跨仓维护项（不阻塞本仓）

| # | 仓 | 内容 | 判据 |
|---|---|---|---|
| **C1** | `rdd-workflow-e2e` | 8 条 `KNOWN_FAILURES` 迁到新推荐器实现路径（上游退役 `guide` skill ⇒ `rddf_session_hook_poll_events` / `guide_entry.sh` 不存在）⇒ 迁完清空该清单 | `bats -r tests/` 全绿（0 失败）⇒ 删除 `KNOWN_FAILURES.txt` 的 8 行 |
| **C2** | `rdd-workflow-e2e` | 跨仓缺口表刷新（`docs/known-gaps-and-ownership.md`，最后更新 2026-11-08，距今 17 天 / 本仓 347 提交）：#1（并发写盘）已由 `tests/role-lease-claims.test.ts:283` 闭合、#5（`unknown` 语义）已由 `tests/delegate-tool.test.ts:519` 闭合 ⇒ 标闭合；#4（failed/interrupted）、#6（scope 只约束 edit 类目）、#7（pair 过期清理）**仍开放** ⇒ 归属本仓并进 B 批 / 登记 backlog | 缺口表每条有「当前判定 + 归属 + 复现命令 + 本仓闭合证据」四栏，无空行 |
| **C3** | `rdd-workflow-e2e` | 计数漂移订正：README「Plus 58 real-runtime cases」（实算 71，漏 `class_scope` 7 + `oracle_intent_gate` 6）· README 表格 front_delegate 26（实际 25）/ stage_guide 6（实际 7）· `test_class_scope_runtime.bats:9` 自述「4 条」（实际 7 条） | 三处计数与 `grep -c "^@test"` 一致 |
| **C4** | `rdd-workflow`（产品侧） | 债可见性增强（可选）：`collect_pending` 增加「improvement 正文里的 change 指针已归档 ⇒ 视为 terminal」⇒ 这样**零 front-matter** 也能判 | 新增用例 + 变红演练；**不阻塞 A2**（A2 已用 front-matter 止血） |

---

## 3. 验证面设计

### 3.1 判据来源（按 `prompts/build.md` §verifier 产出契约 的优先级）

1. **用户本次明确给出的验收条件**（本路线图 §2 的每条「判据」栏）；
2. 对应 openspec change 的「验收标准」段（**立项后**才有 ⇒ 本路线图阶段的判据 = §2 的判据栏）；
3. 本次变更自己声明了什么（各 improvement 的 Acceptance 段）；
4. ADR 的 Verification 章（V16–V36 —— **本批已全过**，A 批不新增也不改动它）。

### 3.2 验证方式分组

| 组 | 判据形态 | 载体 | 归属 |
|---|---|---|---|
| **静态 / 派生** | 「`rddf status` 的 pending = 4」「脚本输出含 `local-fallback`」「并发 claim 恰好一个 exit 0」 | `bun test tests/`（本地规范命令） | builder / planner |
| **行为（真宿主）** | L2 运行时层用例 | e2e 仓 bats（`E2E_REAL_RUNTIME=1`，**默认 skip**） | 跨仓 |
| **人工** | 「模型是否真按纪律转述」「AI 交叉审」 | 主会话执行 + 用户终裁 | 人工 |

### 3.3 验收顺序（早失败早停）

`bun test tests/`（含 A3 / A4 的新用例）→ `bash scripts/check-upstream-anchors.sh` → `bun scripts/agent-guard-gen.ts --check` → `rddf status`（A2 的可见性判据）→ （B 批才进）e2e 仓 `bats -r tests/`。

### 3.4 验收角色与失败处置

| 失败类型 | 分类 | 路由 |
|---|---|---|
| 判据写错 / 判据不成立（红在预期断言之外） | `proposal_drift` | 回 planner（改本路线图 / improvement 的 Acceptance） |
| 实现缺失 | `implementation_gap` | 回 builder |
| 取证不可用（如 e2e 床缺失、模型额度耗尽） | `blocked` | 交用户（**不判 pass**） |

---

## 4. 归属矩阵（planner 不越界的依据）

| 任务 | 写集 / 面 | 归属 | 本仓写集能否自办 |
|---|---|---|---|
| A1 | `.rddf/rollback/plan-topics.json` | **builder** | ❌（planner 写集不含 `.rddf/rollback/**`） |
| A2 | `.rddf/improvements/**` | **planner** | ✅（但「新增 improvement 默认带 front-matter」这条约定需在实施时写进本仓的 improvement 写法说明） |
| A3 | `tests/arch-docs-scope.test.ts` + `tests/README.md` | **builder** | ❌（planner 写集不含 `tests/**`） |
| A4 | `tests/fixtures/**` + `tests/plan-topics-lifecycle.test.ts` | **builder** | ❌ |
| A5① ② | `docs/adr/**` | **architect**（oracle → critic；**只改措辞/闭合标注 ⇒ 只 oracle**） | ❌ |
| A5③ | `.rddf/improvements/**` | **planner** | ✅ |
| B1 / B2 | e2e 仓新文件 + 本仓 builder 面配合 | **跨仓 + builder** | ❌ |
| C1–C3 | e2e 仓 | **跨仓** | ❌ |
| C4 | 产品侧仓 | **跨仓** | ❌ |

> ⚠ **治理面补充**：A 批**不改** `prompts/**`、`lib/**`、`plugins/**`、`opencode.jsonc*`、`docs/MULTI-AGENT-DESIGN.md`、`docs/CHANGELOG.md`、`docs/SUBAGENT-ORCHESTRATION.md`、`tests/config-guards.test.ts` ⇒ **不触发治理面 oracle→critic 必审通道**（A5 的 ADR 措辞改动走 ADR 行的独立通道）。

---

## 5. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| **A2 的 front-matter 词表不命中**（`status` 前导词不在产品侧 terminal 词表 ⇒ 兜底「待讨论」） | 用产品侧词表内的词（`已归档`/`已完成`/`已实施`/`archived`/`implemented`）＋ A2 判据第 ② 条当场可验 | 删 front-matter（其余内容不动） |
| **A2 误标「已完成」**（把真待办标成已归档 ⇒ 债从视野里消失） | 只标**有归档 change 指针 / 明确「实施状态：已实施」字样**的 6 条；真待办那 4 条标 `未立项` | 逐条改回 |
| **A3 去掉 `skipIf` 后脚本在无床环境红** | 脚本自带本地兜底；判据第 ① 条要求 `E2E_BED_DIR=/nonexistent` 仍 1 pass | 恢复 `skipIf`（并把 A3 的「降级可见」另记 backlog） |
| **A4 并发用例 flaky** | 复用本仓已有 barrier 范式（`tests/role-lease-claims.test.ts:283`）＋ 连跑 10 次的判据 | 该用例改 `test.skipIf`（并登记为已知不可判面） |
| **B 批吃额度 / 触发 flaky** | 走 e2e 仓**默认 skip** 门控；不进 CI；每条用例带变红演练记录 | 撤下用例（e2e 仓回滚） |
| **跨仓依赖缺失**（e2e 仓不可达 ⇒ A3 的床路径也不可达） | A 批**全部不依赖** e2e 仓（A3 正是为消除该依赖）⇒ 跨仓不可达时本仓判据仍全可跑 | — |
| **债面被「清得太干净」**（把没做完的事标成已完成） | A2 判据第 ⑤ 条的变红演练只验「判据有判别力」；**真待办的 4 条必须仍可见** | 见风险 2 |
| **范围蔓延**（顺手改 `prompts/**` / 动 ADR 决策） | §1.2 的排除清单 + §4 的归属矩阵 | — |

---

## 6. 立项路径与工件归属（谁写哪个件，防归属漂移）

> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：`rdd-planner` 前置（`.rddf/state/.arch-handoff.json`）不存在、`rdd-builder` 前置（`.rddf/improvements/<change>.md` + `.rddf/state/.planner-handoff.json`）也不满足 ⇒ 走**内置流程** ⇒ 工件归属按 `prompts/build.md` §工件归属规则 的「skill 不可用 ⇒ agent 走内置流程写」一支。

| 批 | change 名（建议） | `proposal.md` | `design.md` / `tasks.md` | TDD 计划 | 执行 | 验收报告落点 |
|---|---|---|---|---|---|---|
| **A** | `test-debt-cleanup-local`（A1–A5 合一：5 项都是低风险本仓改动，共一次回归） | planner（起草，AC = §2 的判据栏） | builder | `.rddf/plans/test-debt-cleanup-local.md` | builder | `.rddf/reviews/test-debt-cleanup-local-verify.md` |
| **B1** | `runtime-e2e-plan-topics` | planner | builder（**跨仓**：e2e 仓新文件 + 本仓配合） | 同上 | builder（**跨仓仓内各自立项**） | `.rddf/reviews/runtime-e2e-plan-topics-verify.md` |
| **B2** | `runtime-e2e-push-gate` | planner | builder | 同上 | builder | `.rddf/reviews/runtime-e2e-push-gate-verify.md` |
| **C1–C3** | e2e 仓自己的 change（**不在本仓立项**） | e2e 仓内 planner | e2e 仓内 builder | e2e 仓内 | e2e 仓内 | e2e 仓内 `.rddf/reviews/` |
| **C4** | 产品侧 change（`rddf-status-improvement-status-mismatch` 的立项体） | 产品侧 | 产品侧 | 产品侧 | 产品侧 | 产品侧 |

⚠ **A 批的 AC 必须逐条落到 proposal 的「验收标准」段**（不能只留在本路线图里）⇒ 否则 verifier 侧的判据来源会掉到第 3 优先级（「本次变更自己声明了什么」），与 ADR 判据混在一起。
⚠ **A5①② 走 architect**（ADR 措辞与闭合标注）⇒ 若与 A 批的 change 合并，则该 change 内会出现**两种归属**（builder 面 + architect 面）⇒ 建议 **A5①② 单独走 architect**（不进 A 批 change），A 批只留 A5③（planner 面）。

---

## 7. 待用户裁决（**不猜**）

1. **B1：plan-topics D9/D10/D11 要不要补运行时 e2e？** 候选 ① 不补 / ② 最小 L2（吃额度）/ ③ **真宿主 + 假 worker**（不吃额度，覆盖协议面）—— planner 建议 **③ 优先、② 次之**，**但这是花钱与覆盖策略的选择 ⇒ 由你拍板**。
2. **B2：`model-fallback` / `push-gate` 要不要补 L2？** 建议先做 push-gate 的「真被拒」一条（不吃额度），model-fallback 接线面放最后。
3. **C4（产品侧 `collect_pending` 增强）做不做？** 不做也能靠 A2 止血 ⇒ 建议**降级为可选**，先不立项。
4. **A 批是否现在就开工？** A 批共 5 项、其中 2 项 planner 可自办（A2 / A5③）、3 项 builder 面（A1 / A3 / A4）⇒ 建议 A2 + A5③ 先做（当仓可闭合并让债面可见），A1 随本批验收收尾一起做（它就是把本批从 `needs-revision` 转 `pass` 的那一行）。
