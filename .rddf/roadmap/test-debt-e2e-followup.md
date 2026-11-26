# test-debt-e2e-followup — 测试完备性 / 债务 / e2e 覆盖的后续路线图（planner 产出）

> 决策依据（**无 ADR** —— 本路线图是**债务治理**，不是架构决策；不引入新机制，只补判据与登记）：
> - `.rddf/reviews/test-completeness-debt-e2e-audit-2026-11-25.md`（测试完备性 / 债务 / `rdd-workflow-e2e` 审计，verifier）
> - `.rddf/reviews/plan-topics-d9-d10-d11-verify.md`（D9/D10/D11 + D5 实现批验收，verdict=`needs-revision`，1 项未闭合）
> 关联 change：**尚未立项**（本路线图 = 立项前的分批计划；每批的落点是 §2 的任务表，**由 builder 按 openspec change 流程实施**）
> ⚠ **本路径未启用 `rdd-planner` / `add-improve`**：`rdd-planner` 前置（`.rddf/state/.arch-handoff.json`）不存在；`add-improve` 的 HARD-GATE（YAML frontmatter + 7 段 + `.rddf/roadmap.md` 的 Phase Skeleton Theme 列）与本仓形态（32 个 improvement 全 5 段散文、**无** `状态` 字段（7 份有 YAML frontmatter 但只含 `feedback_status`）、且**无** `.rddf/roadmap.md`）**不可兼容** ⇒ 走**内置流程**，本文件按 `.rddf/roadmap/plan-multi-session-collaboration.md` 的既有体例写。
> 修订记录：**第 5 版**（并入第 2 轮：oracle 复核 + metis 决策界面 gap 分析（**用户显式授权的超预算轮**）→ critic 第 2 轮，`APPROVE_WITH_CONDITIONS`，7 条 SHOULD_FIX、无 BLOCKER）—— ① B1 收益**三层化**（L0/L1 今天兑现、**L2「CI 自动抓漂移」降为跟踪项**，前置 = e2e 仓 CI 红清零）；② B2 改**源码先行 → 窄探针**（源码只补充不替代；探针与用例分离；补「无结论」第四态 + 三 token）；③ 决策面压为 **2 决策位 + 3 确认位 + 2 登记项**；④ **A1 判据加「补验记录落盘」**（F-1 闭合需新证据，原 verify 报告不回改）；⑤ **归属重排（SF-5 方案 B）**：A2 移出 change（planner 自办）、A 批 change = A1/A3/A4/A6，§4 补 A6 行、§6 同步；⑥ §3.2 `pending 4 → 7` 订正；⑦ §7 前插 **e2e 仓 CI 实况**（连红 5 天 / `已知失败0·新增17` / 8 条未推送 / 9 条真新增）。
> 修订记录：**第 4 版**（并入 critic 审查第 1 轮，`APPROVE_WITH_CONDITIONS`，7 条 SHOULD_FIX + 3 条 NITS，**无 BLOCKER**）—— ⓐ **B2 形状收窄为唯一候选 `-uf`**（critic 指出「短簇」没钉簇序 ⇒ `-fu` 会撞 `git push -f*`；我另行核出**带引号形态在 fnmatch 下并不撞 glob**，推翻了 oracle 与 critic 的共识，但宿主语义未实测 ⇒ 仍不列）；ⓑ **A6 补联合断言**（front-matter 行数 × AC20 的 15 行窗口）；ⓒ **token 登记删掉「本仓审计模板」这一假前提**（`.rddf/reviews/` 无模板文件）；ⓓ **B2「钩子先」分支补世界限定** + 第三个 token `PUSH-GATE-ALLOW-ALWAYS-WORLD-UNVERIFIED`；ⓔ **Q5 横幅不得列行号**（插入后行号即失真）；ⓕ **§2 顺序行去掉 A5**、改为 A1 → A2 → A6 → A3 → A4；ⓖ **零模型层漂移信号的 CI 前提**（e2e 仓 CI 实况已核：push/PR/nightly 跑 `bats tests/integration/ tests/_lib/`；但基线带 8 条已知失败 ⇒ **C1 是信号先决条件**）。
> 修订记录：**第 3 版**（并入 oracle 顾问分析）—— ⑤ **A 批顺序改为 A1 → A2 → A3 → A4**（oracle：A1 是唯一闭合**已开口环路**的项 —— verify 仍判 `needs-revision` 就开新工，正是债的形成方式）；⑥ 新增 **A6**（本地守卫「新增 improvement 必带 `状态`/`优先级` front-matter」⇒ 增量侧在本仓自闭环 ⇒ 让 C4 变得不必要）；⑦ **B1 拆成两个子决策**（零模型层不吃额度 ⇒ **无论哪条都批**；「只做零模型层」是第 4 个自洽选项）；⑧ B2 改为「**先探针 + 两分支处置预承诺**」；⑨ C4 **不按现规格立项**（现规格会把审计抓到的 3 个反例自动化 ⇒ re-scope 为「模板侧默认字段」）；⑩ Q5 采纳 oracle 形态（**只加顶部 dated 横幅，零行内改写**）；⑪ §7 每项标注 oracle 推荐 + 新增 SF-5 / feedback 残留 / 本地守卫三项。
> 修订记录：**第 2 版** —— ① 本路线图本身无独立 metis 轮次（metis 固定审查配对落在**两份改进提案**上，各 1 轮 ⇒ 处置记录见各自文末 §7）；② 本版按 metis 的两条 P0 改写了 **A2**（统一中文键 + frontmatter 写入形态 + 名单资格口径 + AC 时序自引用）与 **B1/B2**（把「4 条真会话」拆成「真宿主 1 条 + 零模型 3 条」⇒ 额度成本从 4 次真会话降到 1 次）；③ **A5③ 被删**（metis：回改已关闭 improvement 的历史判据 = 篡改判据真值 ⇒ 违反本仓「历史不回改」惯例 ⇒ 外化为 §7 的独立裁决项）；④ A 批由 5 项收敛为 **4 项**（A5①② 走 architect 另案）。

---

## 0. 完成度总表（2026-11-26 回写）

> 证据链：本仓 `cb91be2`（A1/A3/A4/A6）· `6550a00`（A2 + Q5）· `9e57463`（A5）· `3bb6f1c`（model-fallback 立项）· `e5f03f5`（本机触发机制）；e2e 仓 `28669e6`（零模型 3 例）· `30b4d44`（push-gate 2 例）· `0ec0084`（CI 两步 + 缺口表）· `b58ff6b`（计数底账）。

| 项 | 状态 | 落点 / 备注 |
|---|---|---|
| **A1** 补 F-1 | ✅ 完成 | `cb91be2`；补验记录 `.rddf/reviews/plan-topics-d9-d10-d11-verify-f1-closure.md` ⇒ 本批验收可转 `pass` |
| **A2** 改进池机读化 | ✅ 完成 | `6550a00`；pending **12 → 8**（7 真待办 + 1 部分闭合） |
| **A3** 去 `skipIf` | ✅ 完成 | `cb91be2`；两条取材路径都断言 `FAIL=0` + 兜底 `PASS=64` |
| **A4** V25 并发子句 | ✅ 完成 | `cb91be2`；barrier 编排，连跑 10 次全绿 |
| **A6** 增量守卫 | ✅ 完成 | `cb91be2`；22 份祖父名单冻结 + 双向变红演练 |
| **A5** ADR 闭合标注 | ✅ 完成 | `9e57463`；oracle 判 APPROVE，审查记录 `.rddf/reviews/adr-plan-multi-session-collaboration-review-residue-closure.md` |
| **Q5** 历史加注横幅 | ✅ 完成 | `6550a00`；目标文件实测在 `improvements/`（oracle 判错已订正 `acaac11`） |
| **B1 零模型层（3 例）** | ✅ 已落（L1） | e2e `28669e6`；**CI 已能真跑**（`0ec0084` 加了完整克隆 + bun） |
| **B1 真宿主 PT-1** | ✅ 完成（一次性 + 变更触发） | e2e 仓新增 `test_plan_topics_runtime.bats`，**首次真跑即通过**（1 次会话）；证据 `.rddf/reviews/plan-topics-pt1-runtime.md`；重跑触发 = plan agent 权限/白名单/接线变更（已写进 `scripts/e2e-runtime.sh` 触发表，`prompts/plan*` 映射到该文件） |
| **B2 前半 push-gate** | ✅ 完成 | 源码探针 `.rddf/reviews/runtime-e2e-push-gate-source-probe.md` + 运行时 2 例（e2e `30b4d44`，真跑记录 `.rddf/reviews/runtime-e2e-push-gate-verify.md`） |
| **B2 后半 model-fallback** | 📋 已立项、未实施 | `.rddf/improvements/model-fallback-runtime-e2e.md`（`3bb6f1c`，metis 12 条已处置） |
| **本机触发机制** | ✅ 已实施 | `e5f03f5`；`scripts/e2e-runtime.sh` + `.githooks/post-commit`（opt-in，advisory）；偏差与未实测项见提案 §8 |
| **C1** 基线未进 CI | 🟡 根因 A 已闭合 | 8 条基线随 push 进 `origin/master`；**剩**上游真删 `guide` hook 的 8 条用例迁移 |
| **C2** 缺口表刷新 | ✅ 完成 | e2e `0ec0084`；#5 标闭合（证据 `delegate-tool.test.ts:519`）、#1 维持开放（复核结论与审计相反，已注明） |
| **C3** README 计数漂移 | ✅ 完成 | e2e `b58ff6b`；改为实跑口径 **148 / 70 / 8 / 70** |
| **C4** 产品侧增强 | ⏳ 待拍板 | 结论 = 不按现规格立项，re-scope 为「模板侧默认字段」⇒ 需产品侧有人接 |
| **SF-5** CHANGELOG v2.75 | ⏳ 用户自办 | 未做 |
| **feedback `resolution` 残留** | 📋 已登记 | `rddf feedback` 无 resolve 子命令 ⇒ backlog |

---

## 1. 范围与依据

### 1.1 做什么（3 批 + 1 张归属表）

审计给出的 10 条建议（S-1…S-10）按**「本仓能否自闭环」**与**「是否需要用户拍板」**切成三批：

| 批 | 内容 | 是否需要用户裁决 | 是否需要跨仓 | 归属 |
|---|---|---|---|---|
| **A** | 本仓自闭环的 5 项（判据补强 + 债可见性 + 增量守卫）：**A1 → A2 → A6 → A3 → A4**（A2 在 change 外由 planner 自办；A 批 change = A1/A3/A4/A6） | ❌ 否 | ❌ 否 | planner / builder（逐项见 §2）｜**A5（ADR 措辞与闭合标注）走 architect ⇒ 另案**（见 §6 末条） |
| **B** | 需要**花钱（模型额度）或改变覆盖策略**的 2 项：B1 = plan-topics 的 e2e（**真宿主 1 条 + 零模型 3 条**）；B2 = push-gate（前半）与 model-fallback（后半，另立 improvement） | ✅ **是**（B1 的真宿主部分） | ✅ 是（e2e 仓） | 待裁决后立项 |
| **C** | 跨仓维护项（e2e 仓的已知失败迁移 / 缺口表刷新 / 计数漂移；产品侧债可见性增强） | ❌ 否 | ✅ 是 | 跨仓，各自仓内立项 |

### 1.2 不做什么（显式排除，防范围蔓延）

- ❌ **不动已归档 change 与既有 ADR 的决策内容** —— 本路线图只改**登记面**（状态字段 / 指针 / 残留标注），不改判据语义。
- ❌ **不改 ADR 的 Verification 判据表** —— V16–V36 全部通过（`.rddf/reviews/plan-topics-d9-d10-d11-verify.md`）；要加判据属 architect 的 ADR 修订流程，不是本路线图的事（SF-2 已单列给 architect）。
- ❌ **不回改已关闭 improvement 的历史判据** —— 本仓惯例（`tests/config-guards.test.ts` AC20 注释）：已关闭的 improvement 是**历史记录**（记的是当时的路径）⇒ 不参与现行判据 ⇒ **不回改**（`plan-multi-session-collaboration.md` 的 AC7 / AC13 是历史验收判据 ⇒ 回改 = 篡改当时判据的真值）⇒ 那 6 处旧路径只作 §7 第 5 条的**独立裁决项**（只允许动非判据位置）。
- ❌ **不把 e2e 仓的债搬进本仓** —— `rdd-workflow-e2e` / `rdd-workflow` 的债在各自仓清（Batch C），本仓只做**指向与依赖登记**。
- ❌ **不改 `prompts/**` / `lib/**` / `plugins/**` 的行为** —— A 批只加**测试/登记**；治理面若要改（SF-2 的 ADR 导语、SF-4 的 ADR 残留标注）走 architect 流程（oracle → critic）。
- ❌ **不承诺 CI 接线** —— 本仓**默认无 CI、无生效 git hook**（ADR V01 / `docs/test-authoring.md` §5）；A 批的所有判据都落在**本地规范命令**（`bun test tests/` + 上游锚点）里。
  ⚠ **事实修正（2026-11-26）**：本仓新增了**本机 opt-in** 的 `post-commit` hook（`scripts/install-git-hooks.sh` ⇒ `core.hooksPath=.githooks`），它只做**真运行时的 advisory 采集**（后台跑、永不阻断、按路径过滤、失败不记闸门）⇒ **不改变「唯一硬闸门 = `bun test tests/`」**，但「无生效 git hook」这句话在**已 opt-in 的机器上**不再字面为真。设计与本机行为见 `.rddf/improvements/local-e2e-runtime-trigger.md`。
- ❌ **不在本路线图里实施任何代码** —— planner 只出计划与改进提案；实施属 builder（按 openspec change 流程）。

---

## 2. 任务分解（每项含归属 / 依赖 / 判据）

> 纪律：**每项先写判据（红）→ 再改（绿）→ 跑该批判据**。
> **实施顺序**：**A1 → A2 → A6 → A3 → A4**（A6 的祖父名单基线 = A2 之后的实际状态 ⇒ 必须排在 A2 之后；A5 不在此列，走 architect 另案）。⚠ **A2 由 planner 在 change 外自办**（`.rddf/improvements/**` 在其写集内）⇒ **A 批 change = A1 / A3 / A4 / A6（全 builder 面）**，A2 的完成态是 A6 的 change 外前置（critic SF-5 方案 B）；**B / C 批在 A 批完成后启动**（先清债面，再动需要花钱与跨仓的件）。

### A1 ｜ 补 F-1：回滚清单 `notes` 的旧路径（一行）

| 项 | 内容 |
|---|---|
| **问题** | ADR D5 落地硬约束 ⑥ 要求 `.rddf/rollback/plan-topics.json` 的 `notes` 散文刷新旧单文件路径；README 侧已刷、**notes 未刷** ⇒ 本批验收判定 `needs-revision`（`implementation_gap`，文档级、零机械影响） |
| **改什么** | `.rddf/rollback/plan-topics.json` 的 `notes` 里 `.rddf/state/plan-sessions.json` ⇒ `.rddf/state/plan-sessions/`（与 `.rddf/rollback/README.md:141` 同措辞） |
| **归属** | **builder**（`.rddf/rollback/**` 不在 planner 写集；也不是架构文档 ⇒ builder 面） |
| **判据** | ① `python3 -c "import json;print('plan-sessions.json' in json.load(open('.rddf/rollback/plan-topics.json'))['notes'])"` ⇒ `False`；② `bun test tests/` 仍全绿；③ `bun scripts/rollback-drill.ts` 的清单自检（该清单的 `planDrill` 仍可执行）；④ **补验记录落盘（critic SF-4）**：新出一份 `.rddf/reviews/plan-topics-d9-d10-d11-verify-f1-closure.md`（**原报告不回改**，本仓惯例）⇒ 引原 verify 报告编号 + 复跑命令 + 输出 ⇒ 「闭合 needs-revision」有**新的**可见证据（`.rddf/reviews/**` 属 builder 面，A1 归属本就 builder） |
| **依赖 / 风险** | 无依赖；风险 = 改散文时误改 `edits[]`（⇒ 逐字节 diff 复核 `edits[]` 未变） |
| **状态** | ✅ 2026-11-25 完成（commit `cb91be2`）：`notes` 已刷 + 补验记录 `.rddf/reviews/plan-topics-d9-d10-d11-verify-f1-closure.md` 落盘（原报告不回改）+ 按 V8 回填 `last_drill.content_hash` |

### A2 ｜ 改进池状态机读化 + 失效指针修正

| 项 | 内容 |
|---|---|
| **问题** | 实测 `rddf status`：**pending 10 条，STATUS 列全「待讨论」、PRI 列全 `-`**。逐条核 Acceptance 后：**3 条其实已完成**（`rdd-verifier-state-consolidation` / `role-write-set-machine-block` / `rollback-drill-replace-pattern` ⇒ 虚报待办），**7 条是真待办**（但标签全是兜底 ⇒ 不可读）。根因：产品侧 `collect_pending()` 只有两条「已归档 ⇒ 不是待办」的通路（① improvement 文件名命中 `openspec/changes/archive/<date>-<name>/` 的 `<name>`；② **front-matter `状态` 字段**），而本仓 **0/32** 提供该字段 |
| **改什么** | ① **逐条核 Acceptance / 核产物在盘上**（**不是**看 change 指针 ⇒ 已抓到 3 个反例），给 3 条已完成项补 terminal front-matter、7 条真待办补非 terminal front-matter（`未立项`/`待审查`/`部分闭合`/`规划输入`）+ `priority:`；② 修 `rollback-manifest-find-narrowing` 的失效指针（正文写「尚未立项」但 change 已归档 2026-11-24） |
| **归属** | **planner**（`.rddf/improvements/**` 在 planner 写集内 ⇒ **planner 可自办**，不需 builder）。⚠ **critic SF-5 方案 B：本项在 openspec change 之外执行**（不进 A 批 change）⇒ 它的完成态是 A6 的 **change 外前置**；A 批 change 只含 builder 面的 A1/A3/A4/A6 |
| **判据** | ① `rddf status` 的 `Total pending` = **7**（= 真待办那 7 条）；② 7 条的 STATUS 列**不是**「待讨论」（分别是未立项/待审查/部分闭合/规划输入）；③ PRI 列**无 `-`**；④ **键语言统一为中文键**（`状态:` / `优先级:`）⇒ grep 判据用 `grep -lE "^(status|状态):"`；⑤ **frontmatter 形态**：已有块**合并键**、不新建第二块（产品侧只读第一个 `---` 块）⇒ `role-write-set-machine-block.md` 的 `feedback_status` 仍在；⑥ **词表硬断言**（用本机产品侧 lib 逐一断言 `(terminal, label)`）；⑦ **散文状态行不动**（AC20 的 15 行窗口）；⑧ **变红演练带名字断言**（新增条目名 == 被删项）；⑨ `bun test tests/` 全绿（`tests/rollback-registry.test.ts` / `record-discipline.test.ts` 不因 front-matter 变更而红） |
| **详情** | 完整实施形态、10 条的逐条核对结论与 metis 处置记录 ⇒ `.rddf/improvements/improvement-pool-status-frontmatter.md`。**✅ 2026-11-25 已完成（commit `6550a00`）**：`rddf status` pending **12 → 8**、词表硬断言 **10/10**、frontmatter 形态断言与变红演练（带名字断言）均通过 |
| **已验证** | 产品侧 `collect_pending()` 在**临时副本**上实测：补 front-matter 前 pending 32 → 补后 26（合成目录口径，terminal 词命中项被移出）⇒ 真实仓口径 10 → **7**。**本项不需要改产品仓** |
| **依赖 / 风险** | 无依赖；风险 ① = front-matter 的 `状态:` 前导词不在产品侧词表内 ⇒ 被兜底成「待讨论」⇒ 词表必须命中；风险 ② = **把真待办误标成已完成 ⇒ 债从视野里消失**（已抓到 3 个「表面已完成实际未完成」的反例 ⇒ 必须逐条核 Acceptance）；风险 ③ = **已有 frontmatter 的文件被新建第二块** ⇒ 产品侧只读第一个块 ⇒ `feedback_status` 消失 ⇒ 须**合并键**；风险 ④ = **AC20 的 15 行窗口**被 frontmatter 挤出 ⇒ 须**不插空行**；风险 ⑤ = 0/32 提供 `状态` ⇒ **新增提案若不写字段，池子会重新变脏** ⇒ 约定「新增 improvement 默认带 `状态` + `优先级`」（**增量机制的归属在产品侧模板 ⇒ 跨仓另立项**，本条只清存量） |

### A3 ｜ arch-docs 守卫：去掉让「本地兜底」变死的 `skipIf`

| 项 | 内容 |
|---|---|
| **问题** | `tests/arch-docs-scope.test.ts:22` 用 `test.skipIf(!existsSync(BED))` 把整个 shell 守卫挡在门外；而 `tests/verify_arch_docs_scope.sh:71-80` **自带本地兜底**（床不在 ⇒ 本地构造等价项目形状 + WARN）⇒ **兜底路径被 wrapper 杀死** ⇒ 无床环境下 **64 条断言静默 skip**（零判别力，且不红不黄） |
| **改什么** | ① wrapper 改为**总是执行**（不再 `skipIf`）；② 断言脚本输出含 `项目形状：` 行（`e2e-bed` 或 `local-fallback`）⇒ 降级**可见**；③ 断言 `FAIL=0`；④ `tests/README.md` 把「床不在时 64 条断言静默 skip」的描述改成「床不在 ⇒ 走本地兜底，仍全量断言」 |
| **归属** | **builder**（`tests/**`；`tests/README.md` 亦 builder 面） |
| **判据** | ① `E2E_BED_DIR=/nonexistent bun test tests/arch-docs-scope.test.ts` ⇒ **1 pass**（不再是 skip），输出含 `local-fallback`；② 床在时 ⇒ 1 pass 且输出含 `e2e-bed`；③ 变红演练：临时改坏脚本里一条断言 ⇒ 该用例红 ⇒ 恢复复绿；④ `bun test tests/` 全绿 |
| **依赖 / 风险** | 无依赖；风险 = 本地兜底的项目形状与 e2e 真实 fixture 有细微差异 ⇒ 降级时必须**可见**（第 ② 条判据） |
| **状态** | ✅ 2026-11-25 完成（commit `cb91be2`）：wrapper 总是执行 + 断言 `项目形状：e2e-bed|local-fallback` + 强制 `/nonexistent` 时仍 `PASS=64 FAIL=0`；`tests/README.md` 已同步 |

### A4 ｜ V25 并发子句进 CI（确定性编排，禁裸并发）

| 项 | 内容 |
|---|---|
| **问题** | ADR V25 明写「并发 `claim` 恰好一个 exit 0（⚠ 实现批注意：该并发用例**易 flaky**，须用**确定性编排**而非裸并发）」，但实现批只落了**顺序**双 claim 的用例 ⇒ 该子句无 CI 保护（本轮 verifier 用 5 轮 × 6 并发探针验证过机制，但探针不入库） |
| **改什么** | ① 新增 `tests/fixtures/plan-claim-child.ts`（子进程 fixture：ready-file barrier ⇒ **真并发**）；② `tests/plan-topics-lifecycle.test.ts` 加一条「两子进程并发 claim 同一节点 ⇒ 恰好一个 exit 0、另一方被拒、且 `graph.json` 只多一条 attempt」；③ **复用** `tests/role-lease-claims.test.ts:283` 的 barrier 模式（本仓已有可抄的确定性并发范式） |
| **归属** | **builder**（`tests/**`） |
| **判据** | ① 新用例在 `bun test tests/` 中**连续跑 10 次全绿**（防 flaky）；② 断言 `attempts.length === 1` 且被拒方 exit ≠ 0；③ 变红演练：把 `scripts/plan-topic-check.ts` 的锁判据去掉（临时）⇒ 新用例红 ⇒ 恢复复绿；④ 既有 `plan-topics*` 用例零回归 |
| **依赖 / 风险** | 无依赖；风险 = barrier 实现不当 ⇒ flaky ⇒ 判据第 ① 条（连跑 10 次）即为兜底 |
| **状态** | ✅ 2026-11-25 完成（commit `cb91be2`）：`tests/fixtures/plan-claim-child.ts` + V25 并发用例；连跑 10 次全绿；变红演练两条 V25 用例均红 |

### A5 ｜ 登记订正：ADR 残留「已闭合」标注 + Verification 章导语（**走 architect ⇒ 另案，不进 A 批**）

| 项 | 内容 |
|---|---|
| **问题** | ① ADR 残留 #9（prompt 与回滚清单同步）与 #11（D10 落地顺序约束）**已由 D9/D10/D11 批完成**，但 ADR 残留章仍列为「待办」；② SF-2：ADR Verification 章导语仍写「V01–V15 + V16–V21」而表内已有 V22–V36 |
| **改什么** | ① ADR 残留章：#9 / #11 标「✅ 已由 D9/D10/D11 批闭合（2026-11-25）」；② ADR Verification 章导语补 V22–V36 的来源（D10 / D11 增补） |
| **归属** | **architect**（`docs/adr/**` ⇒ oracle → critic；**只改登记措辞与已闭合标注 ⇒ 走 ADR 行的「改措辞」豁免路径，只 oracle**，但若触及决策条目则双审）⇒ **不进 A 批 change，另案**（见 §6 末条） |
| **判据** | ① ADR 残留章不再把 #9 / #11 列为未闭合；② 导语与表的编号范围一致（V01–V36）；③ `bun test tests/` 全绿；④ 审查记录落 `.rddf/reviews/adr-plan-multi-session-collaboration-review-<n>.md` |
| **依赖 / 风险** | 与 A 批无依赖 ⇒ 可并行 |

### B1 ｜ 新机制（plan-topics D9/D10/D11）的运行时 e2e —— **待用户裁决**

| 项 | 内容 |
|---|---|
| **问题** | 按本仓自己的口径（`docs/test-authoring.md` §1）量，本批机制**只到 L1**（静态契约 + 纯逻辑单测，21 条 V 全覆盖），**L2 行为端到端 = 0、L3 手工验收 = 0**（人工 e2e 记录只有 2026-11-20 初版，且 V12 三项「⏳ 未执行」） |
| **缺口要分三层**（metis 的核心发现 ⇒ 直接改成本结构） | ① **协议逻辑**（取消 / 在飞 / 收敛 / 派生）—— 单测**能**证明 ⇒ **零模型 CLI 层**就够；② **安装态 / 外部消费者视角**（CLI 被调、默认套件 cadence 下的漂移）—— 单测**不能**、但**不需要模型** ⇒ 零模型层（**进 e2e 默认套件 ⇒ 本仓改 CLI 契约后 CI 会红**）；③ **宿主接线**（plan agent 的权限 / shell 白名单 / 工具接线让协议命令在真宿主里可执行）—— 单测与纯 CLI **都证明不了** ⇒ **只有这一格需要真宿主** |
| **候选路径** | **① 不补**（现状：单层覆盖，代价 = 宿主接线漂移无人发现）；**② 补最小 L2**（真 `plan` 会话派真 `plan-worker` ⇒ **含 fork-join 编排**（spawn → 宿主唤醒 → join）与模型行为）；**③ 真宿主 + 假 worker**（真 `plan` 会话 + 假 worker 落盘 + 真 checker ⇒ **只覆盖第 ③ 格**） |
| **建议** | **③ 优先、② 次之**；但**真宿主用例只留 1 条**（PT-1「登记 → 交付 → 关闭」，**无 spawn**）⇒ **额度成本从 4 次真会话降到 1 次**；其余 3 条（取消事务 / 在飞排除 / 锁无关）下沉到**零模型层**（不门控 ⇒ 默认跑）⇒ 顺带补上「契约漂移无 CI 发现」的洞 |
| **归属** | 待裁决后立项；跨仓（e2e 仓新文件）+ 本仓 builder 面（fixture / prompt 侧配合） |
| **判据（若走 ③）** | ① **零模型层 3 条**：无 `E2E_REAL_RUNTIME` 时**不 skip 且全绿**；② **真宿主 1 条**：`E2E_REAL_RUNTIME=1` 下通过、默认 skip（行为端到端层不塞 CI，`docs/test-authoring.md` §5）；③ **两条前置探针**（PT-1 的「`opencode run --session <existing>` 续接可用性」= e2e 仓零先例 ⇒ 探针前不写用例；探针失败 ⇒ 登记形态偏差）；④ 每条用例有**一次变红演练记录**（e2e 仓 `docs/runtime-assertion-discipline.md` 三条纪律）；⑤ 判据审计记录 `{case_id, oracle_sha, auditor, author}`（ADR-0003 转正规则，**全引**：含「替代正确解也必须通过」与「每 trial 干净环境」）；⑥ **未覆盖面用机械 token 登记**（`PLAN-TOPICS-MODEL-BEHAVIOR-NOT-COVERED`）⇒ 本仓审计模板加 grep 计数 |
| **详情** | 完整方案、候选形态、边界与处置记录 ⇒ `.rddf/improvements/runtime-e2e-coverage-new-mechanisms.md` |

### B2 ｜ `push-gate`（前半）与 `model-fallback`（后半）的运行时 e2e —— **待用户裁决**

| 项 | 内容 |
|---|---|
| **问题** | 这两个运行面在 e2e 仓 **0 例**：`plugins/model-fallback.ts` 的 `retry`/`prompt` 两钩子是否真被宿主挂上、`lib/push-gate.ts` 的 force-push 硬拒是否真拦得住，都只有单测 |
| **B2 前半（push-gate）** | 按 metis 的 P0-2 **重设计**：① 形状必须选 config 8 条 `deny` glob **表达不了的超集形态** —— **唯一候选 = 短簇 `-uf`**（**f 不得居首**：`-fu` 会撞 `git push -f*`；带引号形态已按 glob 逐条核验，不作为候选 ⇒ 见提案 2 的对照表）；朴素 `git push --force` 会**先撞 config deny**，插件根本摸不到；② 断言必须匹配**精确文案** `push-gate:`（只断言「有 Tool.Error」⇒ 权限层会冒充）；③ **正向对照**（非 force push ⇒ 错误**不含** `push-gate:`）；④ fixture 必须是**本地 bare 远端**（`file://`）⇒ 变红演练零网络副作用；⑤ **前置探针**：permission 评估与 `tool.execute.before` 钩子的先后顺序 + 「config 失效前提」如何构造（push-gate 的存在理由是宿主持久化 Allow-always 覆盖 config deny ⇒ fresh 非交互会话**没有**这个前提）⇒ 若探针结论是「结构性不可达」或「候选形状全部到不了插件」⇒ **如实降级目标**，不许硬写 |
| **B2 后半（model-fallback）** | **另立 improvement**（形态与 push-gate 完全不同：要真模型失败才触发链推进 ⇒ flaky 最高）⇒ 不并入 B1/B2 的 change；本批**只登记** |
| **候选路径** | ① 不补（单测够：内核逻辑已覆盖 33 例）；② 补 push-gate 一条（**须先过前置探针**）；③ 补 model-fallback 接线面（真会话里模型失败 ⇒ 链推进）—— 需要真模型/真额度 |
| **建议** | 先做 **②**（但**必须先做前置探针** ⇒ 探针结论可能把目标降级）；③ 的成本与 flaky 风险最高，放最后并**另立 improvement** |

### A6 ｜ 本地守卫：新增 improvement 必须带 `状态` / `优先级`（增量侧在本仓自闭环）

| 项 | 内容 |
|---|---|
| **问题** | A2 只给 10/32 补了 `状态` 字段 ⇒ **存量里仍剩 22 份无字段**；而**增量侧**（新提案落盘时带不带字段）本仓完全没有约束 ⇒ 池子会**重新变脏**，且没有任何机械信号会告诉你（这正是 commit `81131e8`「清得掉但不可重复」的根因） |
| **改什么** | 新增一条守卫断言：**本目录内不在「祖父名单」里的 improvement 文件，必须带 `状态:` 与 `优先级:` front-matter**。祖父名单 = **A2 完成判据通过后** `grep -L '^状态:' .rddf/improvements/*.md` 的**实测清单**（当前预估 22 份；**以实测为准，不以 22 这个数字为准**），逐条列名后**冻结**（只减不增）⇒ 新增文件漏字段 ⇒ 守卫红 |
| **归属** | **builder**（`tests/**`；守卫落点建议 `tests/config-guards.test.ts` 的 plan-topics 块**之外**的新用例。⚠ **真实交互不是同文件冲突，而是「front-matter 行数 × AC20 的 15 行窗口」** —— 见判据 ③） |
| **判据** | ① 祖父名单 22 份**逐条列名**且被断言冻结（改动名单 ⇒ 守卫红 ⇒ 只能通过给该文件补字段来减）；② 名单外的任一文件缺 `状态:` ⇒ 守卫红（**变红演练**：临时新建一份无字段的 improvement ⇒ 红 ⇒ 删掉复绿）；③ **联合断言（critic S5）**：新增文件的 `> **实施状态**` / `> **状态**` 引用行必须落在文件**前 15 行内**（= AC20 `isClosedImprovement()` 的窗口，`tests/config-guards.test.ts:3141`）⇒ 否则该文件日后被关闭时 AC20 判它「未关闭」而扫正文旧 token ⇒ **A6 绿、AC20 红**（两条判据无边界）；④ `bun test tests/` 全绿 + `bun test tests/config-guards.test.ts` 专项确认 AC20 未翻转；⑤ **落地时点断言（oracle Q4）**：A2→A6 窗口期内新增的 improvement 已带字段（防换人起草时守卫落地即红） |
| **依赖 / 风险** | 依赖 A2（祖父名单的基线 = A2 之后的实际状态）⇒ **必须排在 A2 之后**；**change 落点 = A 批 change（`test-debt-cleanup-local`）**，A2 是其 change 外前置；风险 = 守卫太紧 ⇒ 新人写 improvement 忘了字段就被红 ⇒ 缓解：守卫的失败信息直接给出「补这两行」的提示；风险 = 与产品侧 C4 重复 ⇒ **互补不冲突**（本条管本仓纪律，产品侧管模板产出） |
| **状态** | ✅ 2026-11-25 完成（commit `cb91be2`）：22 份祖父名单冻结 + 名单外缺字段红 + 已补未移出名单红 + 散文状态行 ≤15 行；双向变红演练均带名字断言 |

### C1–C4 ｜ 跨仓维护项（不阻塞本仓）

| # | 仓 | 内容 | 判据 |
|---|---|---|---|
| **C1** | `rdd-workflow-e2e` | 8 条 `KNOWN_FAILURES` 迁到新推荐器实现路径（上游退役 `guide` skill ⇒ `rddf_session_hook_poll_events` / `guide_entry.sh` 不存在）⇒ 迁完清空该清单。⚠ **同时是 B1 零模型层的先决条件**：基线不干净 ⇒ `report_regression` 的「新增失败」淹没在既有噪声里 ⇒ 「漂移会被 CI 抓到」不成立 | `bats -r tests/` 全绿（0 失败）⇒ 删除 `KNOWN_FAILURES.txt` 的 8 行 |
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
| **静态 / 派生** | 「`rddf status` 的 pending = **7**（critic SF-6 订正：4 是旧口径残留）」「脚本输出含 `local-fallback`」「并发 claim 恰好一个 exit 0」 | `bun test tests/`（本地规范命令） | builder / planner |
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
| A2 | `.rddf/improvements/**` | **planner**（**change 外自办**，不进 A 批 change） | ✅（但「新增 improvement 默认带 front-matter」这条约定需在实施时写进本仓的 improvement 写法说明） |
| A3 | `tests/arch-docs-scope.test.ts` + `tests/README.md` | **builder** | ❌（planner 写集不含 `tests/**`） |
| A4 | `tests/fixtures/**` + `tests/plan-topics-lifecycle.test.ts` | **builder** | ❌ |
| A6 | `tests/config-guards.test.ts`（新增守卫用例） | **builder**（落点 = A 批 change；A2 为 change 外前置） | ❌ |
| A5 | `docs/adr/**` | **architect**（oracle → critic；**只改措辞/闭合标注 ⇒ 只 oracle**） | ❌ |
| B1 / B2 前半 | e2e 仓新文件 + 本仓 builder 面配合 | **跨仓 + builder** | ❌ |
| B2 后半（model-fallback） | 另立 improvement | **planner**（起草）+ 跨仓 builder | ❌（跨仓） |
| C1–C3 | e2e 仓 | **跨仓** | ❌ |
| C4 | 产品侧仓 | **跨仓** | ❌ |

> ⚠ **治理面补充**：A 批**不改** `prompts/**`、`lib/**`、`plugins/**`、`opencode.jsonc*`、`docs/MULTI-AGENT-DESIGN.md`、`docs/CHANGELOG.md`、`docs/SUBAGENT-ORCHESTRATION.md`、`tests/config-guards.test.ts` ⇒ **不触发治理面 oracle→critic 必审通道**（A5 的 ADR 措辞改动走 ADR 行的独立通道）。

---

## 5. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| **A2 的 front-matter 词表不命中**（`状态:` 前导词不在产品侧 terminal 词表 ⇒ 兜底「待讨论」） | 用产品侧词表内的词（`已归档`/`已完成`/`已实施`/`archived`/`implemented`）＋ **A2 判据第 ⑥ 条用本机产品侧 lib 逐一断言 `(terminal, label)`**（硬兜底，不是「产品侧会走自己的评审」那种软兜底） | 删 front-matter（其余内容不动） |
| **A2 误标「已完成」**（把真待办标成已归档 ⇒ 债从视野里消失） | **逐条核 Acceptance / 核产物在盘上**（已抓到 3 个「表面已完成、实际未完成」的反例）⇒ 只标 3 条已完成项；7 条真待办一律用**非 terminal** 词 | 逐条改回 |
| **A2 的 frontmatter 形态出错**（已有块被新建第二块 ⇒ `feedback_status` 消失；或 frontmatter 挤出 AC20 的 15 行窗口） | 合并键不新建块（产品侧只读第一个 `---` 块）＋ 不插空行；判据第 ⑤ ⑦ 条当场可验 | 恢复该文件的 frontmatter 形态 |
| **A3 去掉 `skipIf` 后脚本在无床环境红** | 脚本自带本地兜底；判据第 ① 条要求 `E2E_BED_DIR=/nonexistent` 仍 1 pass | 恢复 `skipIf`（并把 A3 的「降级可见」另记 backlog） |
| **A4 并发用例 flaky** | 复用本仓已有 barrier 范式（`tests/role-lease-claims.test.ts:283`）＋ 连跑 10 次的判据 | 该用例改 `test.skipIf`（并登记为已知不可判面） |
| **B 批吃额度 / 触发 flaky** | 真宿主用例走 e2e 仓**默认 skip** 门控、不进 CI；**真宿主只留 1 条**（额度成本 1 次真会话）；每条用例带变红演练记录；额度/超时按「未判定」skip（复用 `ib_skip_if_out_of_quota` / `ib_skip_if_timeout`） | 撤下用例（e2e 仓回滚） |
| **B2 的 push-gate 用例空转**（插件摸不到 / permission 先判 ⇒ 用例必绿或必红） | **前置探针 AC 先行**（permission vs `tool.execute.before` 顺序 + 「config 失效前提」如何构造）⇒ 探针不可达时**如实降级目标**，不许硬写 | 撤下该用例并登记为「已知不可判面」 |
| **跨仓依赖缺失**（e2e 仓不可达 ⇒ A3 的床路径也不可达） | A 批**全部不依赖** e2e 仓（A3 正是为消除该依赖）⇒ 跨仓不可达时本仓判据仍全可跑 | — |
| **债面被「清得太干净」**（把没做完的事标成已完成） | A2 判据第 ⑧ 条的变红演练**带名字断言**（新增条目名 == 被删项）⇒ 删错文件不能蒙混；**真待办的 7 条必须仍可见** | 见风险 2 |
| **范围蔓延**（顺手改 `prompts/**` / 动 ADR 决策 / **回改已关闭 improvement 的历史判据**） | §1.2 的排除清单 + §4 的归属矩阵；**历史不回改**（`tests/config-guards.test.ts` AC20 注释：已关闭的 improvement 是历史记录）⇒ 那 6 处旧路径只作为 §7 第 5 条的**独立裁决项**，不进 A 批 | — |

---

## 6. 立项路径与工件归属（谁写哪个件，防归属漂移）

> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：`rdd-planner` 前置（`.rddf/state/.arch-handoff.json`）不存在、`rdd-builder` 前置（`.rddf/improvements/<change>.md` + `.rddf/state/.planner-handoff.json`）也不满足 ⇒ 走**内置流程** ⇒ 工件归属按 `prompts/build.md` §工件归属规则 的「skill 不可用 ⇒ agent 走内置流程写」一支。

| 批 | change 名（建议） | `proposal.md` | `design.md` / `tasks.md` | TDD 计划 | 执行 | 验收报告落点 |
|---|---|---|---|---|---|---|
| **A** | `test-debt-cleanup-local`（**A1 / A3 / A4 / A6 合一**：全 builder 面（critic SF-5 方案 B）；**A2 由 planner 在 change 外自办** ⇒ 其完成态是本 change 的前置；**A5 走 architect 另案**） | planner（起草，AC = §2 的判据栏） | builder | `.rddf/plans/test-debt-cleanup-local.md` | builder | `.rddf/reviews/test-debt-cleanup-local-verify.md` |
| **A5** | architect 另案（**不进 A 批 change**） | architect | architect | — | architect | `.rddf/reviews/adr-plan-multi-session-collaboration-review-<n>.md` |
| **B1** | `runtime-e2e-plan-topics`（**真宿主 1 条 + 零模型 3 条** ⇒ 额度成本 1 次真会话） | planner | builder（**跨仓**：e2e 仓新文件 + 本仓配合） | 同上 | builder（**跨仓仓内各自立项**） | `.rddf/reviews/runtime-e2e-plan-topics-verify.md` |
| **B2 前半** | `runtime-e2e-push-gate`（**须先过前置探针**） | planner | builder | 同上 | builder | `.rddf/reviews/runtime-e2e-push-gate-verify.md` |
| **B2 后半** | model-fallback 接线面 ⇒ **另立 improvement**（形态不同、flaky 最高） | planner | builder | — | builder | — |
| **C1–C3** | e2e 仓自己的 change（**不在本仓立项**） | e2e 仓内 planner | e2e 仓内 builder | e2e 仓内 | e2e 仓内 | e2e 仓内 `.rddf/reviews/` |
| **C4** | 产品侧 change（`rddf-status-improvement-status-mismatch` 的立项体） | 产品侧 | 产品侧 | 产品侧 | 产品侧 | 产品侧 |

⚠ **A 批的 AC 必须逐条落到 proposal 的「验收标准」段**（不能只留在本路线图里）⇒ 否则 verifier 侧的判据来源会掉到第 3 优先级（「本次变更自己声明了什么」），与 ADR 判据混在一起。
⚠ **A5 走 architect**（ADR 措辞与闭合标注）⇒ 若与 A 批的 change 合并，则该 change 内会出现**两种归属**（builder 面 + architect 面）⇒ **A5 单独走 architect**（不进 A 批 change）。

---

## 7. 待用户裁决（**不猜**）

> **oracle 顾问分析（2026-11-25）已并入下列各项**（推荐已标 ⭐）；oracle 的原始分析见本报告附录。oracle 明确指出**唯一一处站不住**的地方：「把零模型层捆进路径③、让『① 不补』连带丢弃它」⇒ 已按此改写 B1。
>
> **第 2 轮（oracle 复核 + metis 决策界面 gap 分析 → critic）后的最终形态**：**2 个真决策位**（B1 运维承诺 / B2 探针链启动）+ **3 个一行确认位**（C4 跨仓登记 / Q5 横幅形态 / A 批开工）+ **2 个登记项**（SF-5 CHANGELOG、feedback `resolution` 残留）。metis 第 2 轮为**用户显式授权**（超既定 1 轮预算）。
>
> ### ⚠ e2e 仓 CI 实况（2026-11-25 核，拍板前必读）
>
> | 事实 | 值 |
> |---|---|
> | 最近运行 | `gh run list` 近 5 次 nightly（11-21 ~ 11-25）**全部 failure** |
> | 失败日志 | `已知失败: 0` / `新增失败: 17`（`report_regression.sh` 按测试名 `comm` 比对基线） |
> | 根因 A | `origin/master:tests/KNOWN_FAILURES.txt` **0 条有效条目**（13 行全注释）；8 条写在**未推送**的本地 commit `073421b` |
> | 根因 B | 另 **9 条真新增**（C1–C7 真实仓纪律、AC7-①/①b），性质**未查明**，且不在基线内 |
> | 机制本身 | `report_regression.sh:103-123` 正确（按名 diff + 新增 ⇒ exit 1）⇒ 坏的是**数据**，不是代码 |
>
> ⇒ **「零模型层会被 CI 自动抓到漂移」今天不成立**；该收益降为 **L2 跟踪项**（见 §7.1）。

1. **B1：plan-topics D9/D10/D11 要不要补运行时 e2e？** ⭐ **oracle 推荐：③，但拆成两个子决策** ——
   - **子决策 A（零模型 CLI 层 PT-2/3/4）**：**无论 ①/②/③ 都该批** —— 它**不吃额度、不需要覆盖策略拍板**，进 e2e 默认套件 ⇒ **本地可跑、可作 builder 的 CLI 契约检查**（⚠ 「CI 自动抓漂移」另属 L2，见下；今天不成立）。oracle 判：把它放在「① 不补」的丢弃面里是**范畴错误** ⇒ 「**只做零模型层**」是现有三条之外**自洽的第 4 选项**。
   - **子决策 B（真宿主 PT-1）**：⭐ 推荐 **③**（真宿主 1 条，只覆盖「宿主接线」这一格）；**但 oracle 附了一个硬条件**：③ 只有在**有运维承诺定期跑 `E2E_REAL_RUNTIME=1`** 时才严格优于 ①（默认 skip ⇒ 没人跑 ⇒ 与无覆盖同构）⇒ 建议**绑定批次收尾**：「凡动 plan-topics 的批，收尾必须跑一次 PT-1 并按提案 §9 模板记录 HEAD sha + git status 干净度」；**没有这个运行节奏承诺 ⇒ 诚实选 ①**。
   - **缺口登记**：oracle 要求**两个 token**（不是一个）：`PLAN-TOPICS-MODEL-BEHAVIOR-NOT-COVERED`（模型行为面）+ **`PLAN-TOPICS-FORK-JOIN-NOT-COVERED`**（fork-join 编排：spawn → 宿主合成消息唤醒 → join）—— 一个 token 会把两个面揉成糊涂账 ⇒ 下一批照样误读。另加**重开触发器**：「e2e 仓 harness-p1（capability 集，ADR-0003 P1）立项时，模型行为面评估移交该处」⇒ 让缺口有 owner-event，不只是标签。
   - **第一动作**（两子决策都适用）：**先跑 PT-1 编排探针**（`opencode run --session <existing>` 续接可用性，e2e 仓零先例）⇒ **探针结论写进提案头部之前不写任何用例**；探针失败时的退路形态（模型自写产物 / 两会话）**偏差必须登记**。
   - ⚠ **子决策 A 的收益必须三层化（critic SF-1，取代「C1 是先决条件」口径）**：e2e 仓**有** CI（`.github/workflows/test.yml`，push / PR / `workflow_dispatch` / nightly cron），跑 `bats tests/integration/ tests/_lib/` ⇒ 零模型用例**必须落 `tests/integration/`**。收益分三层 —— **L0 用例存在**（今天兑现）；**L1 本地可跑 + 可作 builder 的 CLI 契约检查**（今天兑现、成本≈0 ⇒ **这足以支撑「现在批」**）；**L2「CI 自动抓漂移」= 跟踪项**，前置 = **e2e 仓 CI 红清零**（8 条基线 + 9 条真新增的归属处理），归 C 批、**不进 B1 验收门** ⇒ **B1 不会因此无限期挂起**，挂起的只是 L2。拍板文本**不得把 L2 写成已兑现收益**。
2. **B2：`push-gate` 要不要补 L2？** ⭐ **本轮最终推荐：源码先行 → 窄探针**（**原「现在就做探针」已被 oracle 撤回**）—— 源码先行 = 读 opencode 对应版本 tag 的源码，回答「permission 评估 vs `tool.execute.before` 顺序」与「Allow-always 持久化 vs config deny 合并语义」，**0 额度**，并**先钉版本锚**（`opencode --version` ↔ 源码 commit sha）。⚠ **源码只补充、不替代探针（critic SF-2）**：源码答的是「该版本设计行为」，答不了运行时三件事（安装版本是否对齐 / 注入持久化授权是否成功 / 插件在该配置下是否真被挂上）⇒ 源码不确定或版本不对齐 ⇒ **全量探针**；确定且对齐 ⇒ 探针收窄为「运行时确认」。**探针与用例必须分离**（合并成一次 ⇒ 红了无法区分「编排形态错」与「断言错」）。**各出口处置已预承诺**：
   - **钩子先**（`tool.execute.before` 先于 permission）⇒ 写用例，目标如实**降级**为「证明插件挂在 push 路径上」；形状必须实测 —— oracle 指出**带引号形态大概率无效**（`git push "origin" "+main:main"` 串里含 ` +` ⇒ 仍命中 config 的 `git push * +*` glob）⇒ **可靠超集形状是短簇 `-uf`**（串中无 ` -f` 子串 ⇒ config 8 条 glob 全部落空）。⚠ **形状钉死（critic S1）**：**f 不得居首**（`-fu` 撞 `git push -f*`）；带引号形态按 fnmatch 实测**不撞**任何 8 条 glob（oracle 与 critic 的「会撞」判定为误 —— `git push * +*` 要求「空格 + `+`」），但宿主语义未实测 ⇒ 仍不列。
   - **permission 先 / 结构性不可达** ⇒ **不写用例**；登记 `PUSH-GATE-E2E-UNREACHABLE` token（与 B1 同一套机械登记纪律）+ 探针证据进 backlog；force-push 验证移交**人工验收层**（交互会话 + 已持久化 Allow-always + 本地 bare 远端）。
   - oracle 的判词：「**没探针就干脆不做**是错的；**探针 documented 不可达后不做**是对的」⇒ backlog 条目必须带探针证据，防下一批重新吵一遍。
   - ⚠ **最终形态（critic SF-2 / SF-7）** —— 固定链条：**① 源码先行（0 额度 + 版本锚）→ ② 源码确定且对齐 ⇒ 窄探针（运行时确认）；否则全量探针 → ③ 探针三出口**：钩子先 ⇒ 降级用例「**fresh 非交互会话**里插件挂在 push 路径上」；permission 先 / 不可达 / **候选形状全失效** ⇒ 不写 + `PUSH-GATE-E2E-UNREACHABLE`；**探针无结论**（额度/超时/拒执行）⇒ `PUSH-GATE-PROBE-INCONCLUSIVE` + 至多重试 1 轮，仍无结论按不可达处置但 token 区分。
   - ⚠ **世界限定（critic S4）**：即使「钩子先」，也只证明 fresh 世界；门禁真正防的 **Allow-always 世界**只能用人工验收 ⇒ 登记 `PUSH-GATE-ALLOW-ALWAYS-WORLD-UNVERIFIED`。
   - ✅ **2026-11-26 已完成（B2 前半）**：源码探针（`.rddf/reviews/runtime-e2e-push-gate-source-probe.md`）证明钩子在上游；运行时 e2e（e2e 仓 `30b4d44`，`test_push_gate_runtime.bats` 2 例，实跑记录 `.rddf/reviews/runtime-e2e-push-gate-verify.md`）PG-1 force 被 `push-gate:` 拒绝且远端未变、PG-2 非 force 不产生该文案 ⇒ 插件接线与判别力均实测。`model-fallback` 仍为另立 improvement（B2 后半，未启动）。
   - `model-fallback` 另立 improvement：**oracle 认可**（形态本质不同：需真模型失败才触发链推进，flaky 最高）⇒ 本批只登记。
3. **C4（产品侧 `collect_pending` 增强）做不做？** ⭐ **oracle 推荐：不按现规格立项** —— 现规格（「正文 change 指针已归档 ⇒ 视为 terminal」）会把审计**亲手抓到的 3 个反例自动化、规模化**（让所有仓的真待办在**无人核 Acceptance** 的情况下被移出视野）⇒ 比「不做」更差。front-matter 约定恰恰把「人核一遍」留在环路里 ⇒ **这是特性不是成本**。
   - **值得跨仓做的是 re-scope 后的版本**：① **模板侧默认字段**（`add-improve` / proposal 模板产出即带 `状态`+`优先级`）—— 这才是增量的持久解；② 可选：产品侧对「正文指针已归档但无 front-matter」给 **WARN（永不 auto-terminal）**。
   - 本仓侧**不等它**：A2（存量止血）+ **A6**（增量守卫）已在本仓自闭环。
   - ⇒ **最终形态（critic SF-3）：确认位，非决策位** —— 你只需一行确认：**「不按现规格立项 + 把 re-scope 版（模板侧默认字段）登记为产品侧 backlog」**；跨仓登记由你/planner 走产品侧通道，本仓不代劳、也不承诺时点。
4. **A 批是否现在就开工？** ⭐ **oracle 推荐顺序：A1 → A2 → A6 → A3 → A4** —— 理由：**A1 最先**（它是唯一闭合**已开口环路**的项：verify 仍判 `needs-revision` ⇒ 带着一个已知 needs-revision 开新工，正是当前债的形成方式；它一行、builder 面）；**A2 次之**（planner 自办、核对表已预填、执行是机械 + 演练）；**A3 先于 A4**（A3 消除的是「静默 skip 的死判别力」= 测试套件自身的正确性，A4 是新增覆盖且带 flaky 风险 ⇒ 放在 A1–A3 全绿之后）；**A6 紧随 A2**（它的祖父名单基线 = A2 之后的实际状态 ⇒ 必须排在 A2 之后）。
   - oracle 点出**该列却没列**的三项，已补进本路线图：**A6**（增量守卫，见 §2）、**SF-5**（CHANGELOG v2.75 用户自办 ⇒ 列进路线图防丢）、以及 **条件项**「若 B1 获批 ⇒ 登记 builder AC 纪律：动 `scripts/plan-topic-check.ts` 输出契约的 change，AC 必含『同步 e2e 期望』一步」（零模型层的漂移捕捉价值**只在同步步存在时成立**）。
   - ⇒ **最终形态（critic SF-3 / SF-5）：确认位** —— 顺序本身由 planner 依理由链自决；**你只需确认「A 批在 §6 归属重排（A2 移出 change）后开工」**。
5. **`plan-multi-session-collaboration.md` 里那 6 处旧单文件路径要不要清？** ⭐ **oracle 推荐：(ii) 的精神，但只用「顶部 dated 横幅」这一种形态，零行内改写** ——
   - **形态**：文件顶部加一条带日期的横幅（仿本仓自己的先例 —— roadmap 在 `:8/:25/:277/:303/:309` 加了 5 处「2026-11-25 D5 修订已取代」标注，**是加注不是改写**）：「**2026-11-25（D5 修订）之后**，plan 会话状态为 `.rddf/state/plan-sessions/` **目录**形态；本文其余处按当时路径记述，其中 **AC7 / AC9 / AC13 为历史验收判据**（不回改）」。
   - ⚠ **critic S6：横幅本身不得列行号** —— 横幅插在文件顶部 ⇒ 全文行号 +1 ⇒ 横幅里的 `:37/:58/…` 落盘那一刻即失真（照 `:37` 会读到原 `:36`）。要么不列行号（本方案已改为不列），要么写明「行号为 D5 修订前编号」。
   - **为什么不是裸 (ii)（静默改写非判据位置）**：会在同一份文件里造出**第三态**（`:96` 是新路径、`:64` 是旧路径 ⇒ 读者无法判断哪行算数）⇒ 本仓先例已给出判别线：**加注（带日期、可看见）≠ 回改；静默编辑 = 回改**。
   - **为什么不是 (i) 不清**：oracle 补了一条我漏掉的硬事实 —— **AC9 今天已字面为假**（旧路径 `git check-ignore` 现在 exit 1，本批 verify 报告 B2 探针已实证）⇒ 没有横幅，未来某个 agent 会照着旧 AC 去「修」仓库 ⇒ **横幅恰恰是防这个的**。
   - **为什么不是 (iii) 整份清**：AC9 的反转正是「历史必须原样保留」的理由 —— 改写它 = 篡改「当时 V07 验了什么」的记录。
   - **oracle 已核安全面**：该文件无 front-matter、无 `> **实施状态**` 行 ⇒ 顶部加一行把状态行从 `:4` 挤到 `:5` ⇒ **仍在 AC20 的 15 行窗口内**。
   - ⚠ **oracle 修正了我写漏的一处**：**AC9 也是历史判据**（我只点名了 AC7 / AC13）⇒ 横幅须含 AC7 / **AC9** / AC13 三条。
   - ⇒ **最终形态（critic SF-3）：知会 + 否决口** —— 默认按上述形态执行；**你有异议即停**。不占决策位是因为「加注 ≠ 回改」有本仓先例，但这是该先例的**首次适用** ⇒ 给你否决权，而非 planner 默认自决。
   - **归属（critic/oracle 订正 + 我复核）**：**目标文件是 `.rddf/improvements/plan-multi-session-collaboration.md`** —— 实测该文件含 **6 处** `plan-sessions.json` 且 **AC7/AC9/AC13 都在此**；`.rddf/roadmap/` 下同名的另一份**不含** AC7/AC9/AC13（11 处旧路径是另一件事，不在本项范围）⇒ planner 写集覆盖 `.rddf/improvements/**`；**不进 A 批**（A 批 = A1/A3/A4/A6）⇒ 与 A2 同批执行（同写集、同 planner 自办）。
6. **SF-5（`docs/CHANGELOG.md` v2.75）** —— 用户自办，但**当前只活在 verify 报告里** ⇒ oracle 建议**列进路线图防丢** ⇒ 登记在此（§2 无独立任务项，随 A1 收尾一并提醒）。
7. **`rddf feedback` 的 `resolution` 永久残留**（`feedback-20261113-001`；`rddf feedback` CLI **无 resolve 子命令** ⇒ 无 single-writer 途径）—— oracle 判为**次要**但建议登记进 backlog ⇒ 防下一批重新发现。
