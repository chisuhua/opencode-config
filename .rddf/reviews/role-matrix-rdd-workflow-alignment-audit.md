# 角色矩阵 × rdd-workflow 四阶段技能 —— 读写权限对齐审计

审计日期：2026-11-23
审计范围：`prompts/build.md` 角色矩阵（散文层）＋ `lib/role-policy.ts` 写集（机器层） ↔ `rdd-arch` / `rdd-planner` / `rdd-builder` / `rdd-verifier` 四个 skill 的 `role.boundaries.owns` 声明与脚本实际写入路径
审计人：build agent（architect 角色）

---

## 1. 结论摘要

**读侧全部对齐；写侧存在 2 个硬缺口 + 3 个软缺口，其中 1 个是散文层与机器层的结构性不对称。**

| 维度 | 结论 |
|---|---|
| 读权限 | ✅ 对齐。`build` agent 的 `read/grep/glob` = allow（仅 `.env` ask），读不受角色门控 ⇒ 四个 skill 的读需求（proposal / improvement / state json / 源码 / ADR）全部可读 |
| 工具面 | ✅ 对齐。`skill: allow`、`question: allow`、`subagent: allow` ⇒ 矩阵「可选增强」列列出的 skill 全部可加载，architect 的 `question` 意图检查点通道存在 |
| rdd-builder ↔ builder | ✅ 对齐（写集 `**` 覆盖 skill owns 的 7 项 + 全部实现面） |
| rdd-verifier ↔ verifier | ✅ 完全对齐且有机器守卫（6/6 owns 路径全在 `.rddf/state/verifier/` 下；`VERIFIER_OWNS_PATHS` 与 skill frontmatter 逐字一致，`tests/config-guards.test.ts` 校验三份 prompt 的机读块） |
| rdd-arch ↔ architect | ✅ 已修（2026-11-23，§4.1）：theme doc 落点 `docs/architecture` 已进 `arch_paths`；`.rddf/state/.arch-handoff.json` 等 3 项仍 DENY（脚本写，不受影响） |
| rdd-planner ↔ planner | ⚠️ 1 处硬缺口（stage-exit 门控产物全在 `.rddf/state/`）＋ 2 处软缺口 |
| （跨角色）`archPaths` 并入所有角色写集 | ⚠️ 新发现（§4.6）：planner / verifier 也能写 ADR 与 theme doc —— 与散文口径和 skill 的 `not_owns` 声明相反 |

### 1.1 审计基线（含在飞改动）

审计时工作区**非干净**（上一次会话的在飞改动）：

| 文件 | 状态 | 与本审计的关系 |
|---|---|---|
| `docs/adr/ADR-governance-paths-ownership.md`（新建） | Status = **Proposed**，待用户签批 | 裁定「治理面**清单**归 architect、机制代码归 builder」⇒ 本审计 §5 的建议已按其 D2/D3 口径订正（只动**审查口径表**，不动门控清单） |
| `.rddf/reviews/governance-paths-ownership-review.md`（新建） | oracle + critic 审稿报告 | 同上 |
| `prompts/build.md` / `docs/MULTI-AGENT-DESIGN.md` / `docs/adr/ADR-role-aware-permissions.md` | 已修改未提交 | 其中 `prompts/build.md` 的改动是 `opencode.json.*` 变体进治理面作用域表（与本审计 §5 同族） |

⇒ 本审计的结论基于**上述未提交状态**；若该 ADR 签批并落地（`GOVERNANCE_PATHS` 迁到 `.rddf/config/governance-paths.json`），§3 的 DENY 判定需按新读根重跑（`resolveGovernancePaths()` 的三态解析会改变门控清单的来源，但**角色写集**不变 ⇒ 本审计的结论对「写集」这一层仍然成立）。

---

## 2. 判定口径（三条前提，缺一条结论会翻转）

1. **门控只覆盖 `edit` / `write` 两个工具**：`lib/role-policy.ts:23`（`WRITE_TOOLS`）＋ `plugins/role-gate.ts:23`。skill 的 shell / python 脚本写盘**不受门控**（`lib/role-policy.ts:9-10` 的 D5① 免宣称：防事故，不防绕过）。
   ⇒ 判定「某路径写不了」的准确含义是：**agent 用 edit/write 手写该路径会被拒**；skill 脚本落同一路径不受影响。
2. **本仓 `arch_paths` 实值 = `["docs/adr"]`**（`.rddf/config/arch-docs.json`）⇒ 判定落在 §架构文档范围 的**第 1 态**（配置非空且至少一条实际存在）⇒ fallback 目录集**不生效**，`docs/architecture` 不在写集内。
3. **`.rddf/roadmap` 前缀不覆盖 `.rddf/roadmap.md`**：`matchesPattern`（`lib/role-policy.ts:139-144`）对无 `*` 的模式按「目录前缀」判定（`rel === p || rel.startsWith(p + "/")`）⇒ `.rddf/roadmap.md` 不命中 `.rddf/roadmap`。

复现命令（机器可执行，输出即本报告的 DENY 清单）：

```bash
bun /tmp/opencode/align_check.ts    # 用 lib/role-policy.ts 的真实 matchesPattern 跑 33 条路径
```

---

## 3. 逐技能对齐矩阵

### 3.1 rdd-arch → architect

| skill 产物 | 证据 | 判定 |
|---|---|---|
| `docs/adr/ADR-*.md` | `rdd-arch/SKILL.md:26`（owns） | ✅ OK（arch_paths 命中） |
| `docs/architecture/*.md`（theme doc） | `rdd-arch/SKILL.md:27`（owns）；Phase 2 theme-doc-sync 要求 agent 创建/编辑该文件（`SKILL.md:452-465`） | ✅ **OK（2026-11-23 已修，见 §8）** —— 原为 ❌ DENY |
| `.rddf/state/.arch-handoff.json` | `rdd-arch/SKILL.md:28`（owns）；`scripts/write_arch_handoff.py:131` | ❌ DENY（agent 手写被拒；脚本写不受影响） |
| `.rddf/state/.arch-quality-report.json` | `scripts/arch_quality_report.sh:29-30` | ❌ DENY（同上） |
| `.rddf/state/reflect-friction.log` | `scripts/write_arch_handoff.sh:26,51` | ❌ DENY（同上） |
| `.rddf/reviews/<adr>.md` | skill 明写「不写，由角色层产出」（`SKILL.md:117`） | ✅ OK（architect 写集含 `.rddf/reviews`） |
| `.rddf/config/arch-docs.json` | 角色层配置 | ✅ OK |

### 3.2 rdd-planner → planner

| skill 产物 | 证据 | 判定 |
|---|---|---|
| `.rddf/roadmap/{features,phases,objectives}/*.md` | `rdd-planner/SKILL.md:26-28`（owns） | ✅ OK |
| `.rddf/improvements/*.md`（5 段草稿） | `rdd-planner/SKILL.md:32`（owns） | ✅ OK |
| `openspec/changes/<name>/proposal.md` | 增强层路径下由 rdd-builder P0 生成；角色层允许起草 | ✅ OK |
| **`.rddf/state/.planner-handoff.json`** | `rdd-planner/SKILL.md:35`（owns）；`scripts/planner_stage_exit.sh:87` 调 `_lib.planner_handoff`；**rdd-builder 的前置条件**（`rdd-builder/SKILL.md` 描述 §Invoke when 条件 2） | ❌ **DENY** |
| **`.rddf/state/.planner-state.json`** | `rdd-planner/SKILL.md:33`（owns）；阶段门控 2 的 `recommended_route` 载体（`SKILL.md:125`；`planner_stage_exit.sh:22,54`） | ❌ **DENY** |
| `.rddf/state/.planner-feedback.json` | `rdd-planner/SKILL.md:34`（owns） | ❌ DENY（CLI 单写入口，见 §4.3） |
| `.rddf/state/.populate-state.json` | `rdd-planner/SKILL.md:29`（owns） | ❌ DENY |
| `.rddf/state/events.jsonl`（Stage 1 Hook 强制写） | `rdd-planner/SKILL.md:50-59` | ❌ DENY |
| `.rddf/roadmap.md`（主文档） | `rdd-planner/SKILL.md:73,100,124`；阶段门控 1 的判定对象 | ❌ DENY（前缀语义，见 §2.3） |
| `improvement-suggestions.md` / `improvement-approved.md`（项目根） | `rdd-planner/SKILL.md:30-31`（owns） | ❌ DENY |

### 3.3 rdd-builder → builder

写集 = `**` ⇒ skill owns 的 7 项全部可写，零缺口：
`openspec/changes/<name>/proposal.md`（`phase0_approval.sh:157-170`）、`tasks.md`、`openspec/specs/<name>/spec.md`、`.rddf/plans/<name>.md`（`phase1_plan.sh:31`）、`.rddf/wt/<name>/`（`phase2_execute.sh:126`）、`.rddf/state/builder/<name>.json`（`phase0_approval.sh:289`）、`.rddf/state/rdd-quick-context.json`（`phase0_approval.sh:343-344`）、`.rddf/state/.plan-handoff.json`（`phase1_5_deps.sh:29`）。

⚠️ 唯一不对称见 §4.1。

### 3.4 rdd-verifier → verifier

| skill 产物 | 证据 | 判定 |
|---|---|---|
| `.rddf/state/verifier/<name>.json` | `rdd-verifier/SKILL.md:29`；`_lib/verifier/state_paths.py:4-12` | ✅ OK |
| `.rddf/state/verifier/<name>.audit.jsonl` | 同上（`SKILL.md:30`） | ✅ OK |
| `.rddf/state/verifier/.ac-verdict-*.json` | 同上（`SKILL.md:31`） | ✅ OK |
| `.rddf/state/verifier/.ac-verification.jsonl` | 同上（`SKILL.md:32`） | ✅ OK |
| `.rddf/state/verifier/.ac-verifier-blocked.jsonl` | 同上（`SKILL.md:33`） | ✅ OK |
| `.rddf/state/verifier/rdd-verify-context-<name>.json` | 同上（`SKILL.md:34`） | ✅ OK |
| `.rddf/reviews/<change>-verify.md` / `-verify-blocked.md` | `rdd-verifier/SKILL.md`（产品落点） | ✅ OK |
| `.rddf/state/iteration.json` | `rddf rdd-verify` 会写（`_lib/cli/rdd_verify_cmd.py:106-119`） | ❌ DENY（agent 手写被拒；CLI 写不受影响） |
| `.rddf/improvements/<x>.md`（feedback 落点） | `_lib/cli/feedback_cmd.py:70` | ❌ DENY（同上） |

**这一族是全仓唯一有机器守卫的对齐面**：`lib/delegate-core.ts:961-991`（`VERIFIER_OWNS_PATHS` / `VERIFIER_ALLOW_ROOTS`）与 skill frontmatter 的 6 项逐字一致，并由 `tests/config-guards.test.ts:2881+` 校验三份 prompt 内嵌的 `role-class-write-set:verifier` 机读块。skill 侧若新增第 7 个状态文件，本仓守卫**不会红**（仓外依赖，见该常量的注释：同步靠人工）。

---

## 4. 缺口清单（按严重度）

### 4.1 ~~P0~~ ✅ 已修复（2026-11-23）—— architect 写不了 theme doc

- **原事实**：`rdd-arch` 的 owns 含 `docs/architecture/*.md`（ADR-0057 的「ADR + theme doc」双工件模型），Phase 2 的 theme-doc-sync 要求 agent 创建/编辑该文件；本仓 `arch_paths = ["docs/adr"]` 且 `docs/architecture` 目录不存在 ⇒ 判定第 1 态 ⇒ fallback 不接管 ⇒ agent 的 `edit`/`write` 被 role-gate 拒绝。
- **原影响**：rdd-arch 在本仓**无法完成 ADR-0057 的双工件交付**（只剩 ADR 一半）；agent 拿到 `role-gate: 角色「architect」禁止对「docs/architecture/xxx.md」执行 edit`。
- **修法（择一）**：
  - (a) 扩展配置：`arch_paths` 增 `docs/architecture` 并建目录（属 architect 写集内，可直接改 `.rddf/config/arch-docs.json`；或走 `/arch-docs-init --refresh`，注意 refresh 会覆盖手写条目）；
  - (b) 改 skill 边界：theme doc 落点迁到 `docs/adr/`（则需上游 rdd-workflow 仓改，跨仓）。
- **落地（采用 a）**：`.rddf/config/arch-docs.json` 的 `arch_paths` 增 `docs/architecture` + 新建 `docs/architecture/README.md`（Doc Map 索引 + Update Convention + 自检 + 归属说明，按 rdd-arch 的 Doc Map convention）⇒ `resolveArchPaths()` 返回 `["docs/adr", "docs/architecture"]`，architect 对 theme doc 放行；`scripts/arch-docs-init.sh --check` = ok（无漂移）。
- **⚠ 连带面**：本修复把 `docs/architecture/**` 加进了 `arch_paths` ⇒ 由于 `decideWrite` 把 `archPaths` **并入每个角色**的 allow（见 §4.6），planner / verifier 也一并获得该目录的写权 —— 与「架构文档归 architect」的散文口径不一致（该不一致在 `docs/adr/**` 上**早已存在**，本修复只是把它扩展到 theme doc）。

### 4.2 P0 —— planner 写不了自己阶段门控的产物（内置流程会断链）

- **事实**：planner 的 stage-exit 双门控依赖 `.rddf/roadmap.md`（门控 1）与 `.rddf/state/.planner-state.json::recommended_route`（门控 2），handoff 产物是 `.rddf/state/.planner-handoff.json`；三者都不在 planner 写集（planner allow = `.rddf/roadmap`、`.rddf/improvements`、`openspec/changes/*/proposal.md`）。
- **实践影响分层**：
  - 装了 rdd-workflow 时：全部由 CLI / shell 脚本写 ⇒ **不炸**（门控只管 edit/write）。
  - **没装 rdd-workflow 时**：`prompts/build.md` 的 rdd-workflow 增强层明写「没装 → 走内置流程」，而内置流程要求 planner 产出交接面（handoff / planner-state / roadmap 主文档）⇒ agent 手写被 role-gate 拒绝 ⇒ **内置流程断链**。
- **冲突点**：`prompts/build.md` 的工件归属规则写「`.rddf/state/.planner-handoff.json` —— 任何角色都不手写」（rdd-planner owns），但同一文件又说没装 skill 时走内置流程。**机器层口径与散文层口径互斥**，需要裁决：
  - (a) 内置流程改由**脚本/CLI 通道**产出交接面（保持「角色不手写」不变，落点是新增一个由 `scripts/` 提供的写入入口）；
  - (b) planner 写集显式放开 `.rddf/state/.planner-*.json` + `.rddf/roadmap.md`，并在散文里标注「仅内置流程路径手写，skill 路径由 CLI 写」。

### 4.3 P1 —— verifier 写不了 iteration.json / improvement 文件

- **事实**：`rddf rdd-verify` 会写 `.rddf/state/iteration.json`（`_lib/cli/rdd_verify_cmd.py:106-119`），归档门控读它；feedback 凭据落 `.rddf/improvements/<x>.md`（`_lib/cli/feedback_cmd.py:70`）。两者都不在 verifier 写集（`.rddf/reviews` + `.rddf/state/verifier`）。
- **判定**：**当前不构成缺陷** —— 两者都是 CLI 单写入口（ADR-0037），且 `prompts/build.md` 已把 verifier 的记账落点收拢为 `.rddf/state/verifier/`。列为 P1 是因为：一旦产品侧把其中任一改成 agent 直写，或 verifier 需要**直接修正**过期 iteration 记录，就会撞门控。
- **建议**：在 `prompts/build.md` 的 verifier 产出契约里补一句「iteration.json / improvement 文件由 CLI 单写，verifier 不得手写」，把口径写死（当前只对 improvement 文件有「single writer」表述，iteration.json 无）。

### 4.4 P1 —— 散文层「禁止 builder 改 ADR」在机器层没有对应实现

- **事实**：`lib/role-policy.ts:86-91` 给 builder 的 allow 是 `["**"]`，`why` 字段明写「builder 可写全部项目文件（**含 arch_paths 命名的架构文档**）」；而 `prompts/build.md` 的角色列表 builder 行禁止「单方面改已签批 ADR 的决策内容」。
- **判定**：机器层**允许** builder 改 ADR 决策；散文层禁止 ⇒ 散文禁止在主会话路径上**无强制力**（`lib/role-policy.ts:9-10` 的 D5① 免宣称：防事故，不防绕过）。
- **缓解事实**：**被派发后端**路径有硬边界 —— `lib/delegate-core.ts:882-895`（`archDenyRules`）对 arch 目录生成 `edit deny` 规则；`classAllowRoots("builder")` 返回 `[]`（builder 类 = scope 减去 arch roots）。⇒ **派发路径安全、主会话路径无保护**。
- **建议（择一）**：① 把 builder 类的 arch deny 同样应用到主会话（`decideWrite` 里对 builder 排除 archPaths，并把 `**` 改成「除 arch_paths 外的全量」）—— ⚠ 代价：`tests/role-policy.test.ts:412-415` 的守卫用例断言 `ROLE_WRITE_POLICY.builder.allow` 含 `**`，须同步改守卫 + 角色矩阵散文；② 明确写成「主会话 builder 改 ADR 决策属流程违规、无机器强制」，并在审计/回滚里补检出。

### 4.5 P2 —— 上游 owns 声明与实际路径脱节（产品侧 rdd-workflow 仓，非本仓缺陷）

| 声明 | 实际 | 影响 |
|---|---|---|
| `rdd-planner` owns `roadmap.md`（项目根） | canonical 主文档是 `.rddf/roadmap.md`（`rdd-planner/SKILL.md:73,124`；`roadmap` skill 的「唯一写入方矩阵」也指向 CLI） | 声明过时；且 `.rddf/roadmap` 前缀不覆盖 `.rddf/roadmap.md`（§2.3） |
| `rdd-planner` owns `improvement-suggestions.md` / `improvement-approved.md`（项目根） | 迁移后的主结构是 `.rddf/improvements/*.md`（`_lib/migrate_proposals.py` 仍在读根文件） | 声明与目录结构脱节 |
| `rdd-arch` owns `docs/architecture/*.md` | 通用项目可能无该目录 | 通用项目里该工件无处可落（与 §4.1 同源） |

### 4.6 P1 —— `archPaths` 被并入**每个角色**的写集（架构文档归属在机器层无差别）

- **事实**：`lib/role-policy.ts:280-284`（`decideWrite` 的仓库内分支）把 `archPaths` **无条件并入** `policy.allow`：
  ```ts
  const allow = [...policy.allow, ...archPaths]
  if (matchesAny(rel, allow)) return ok()
  ```
  ⇒ `arch_paths` 命中的目录**对所有角色可写**，不止 architect。
- **实测**（`resolveArchPaths()` 取本仓实值）：

  | 角色 | `docs/adr/ADR-x.md` | `docs/architecture/t.md` | `src/a.cpp` |
  |---|---|---|---|
  | architect | ALLOW | ALLOW | deny |
  | planner | **ALLOW** | **ALLOW** | deny |
  | builder | ALLOW | ALLOW | ALLOW |
  | verifier | **ALLOW** | **ALLOW** | deny |

  （`no-role` 不受影响 —— `denyAll` 在 allow 并集之前短路。）
- **与散文口径的冲突**：
  - 角色列表 planner 行禁止「edit `arch_paths` 之外的**项目内**文档」⇒ 按字面，planner **可**改架构文档；
  - 角色列表 verifier 行禁止「edit `src/**`」（不禁止 ADR），但 `rdd-verifier` 的 frontmatter 明写 `not_owns: docs/adr/ADR-*.md` ⇒ 机器层允许 = 与 skill 边界声明相反；
  - `rdd-arch` 的 owns 声明 `docs/adr/ADR-*.md` + `docs/architecture/*.md` 归 arch 阶段 ⇒ 机器层未体现该归属。
- **影响**：验收角色（verifier）**能改 ADR** ⇒ 「验收不改实现、不改决策记录」的硬边界在机器层不成立；本次 §4.1 的修复又把同一泄漏扩展到 theme doc。
- **修法（择一）**：① `decideWrite` 的 allow 并集改为**仅 architect 追加 archPaths**（其余角色用 `policy.allow` 原样）—— 需同步 `tests/role-policy.test.ts` 与 `tests/config-guards.test.ts` 的相关断言 + `prompts/build.md` 散文口径（属治理面 ⇒ 须 oracle→critic）；② 明确把「所有角色都可写架构文档」写成**既定设计**并改散文（则 verifier 的 `not_owns` 声明与 skill 侧需同步澄清）。
- **注**：本条与 §4.4（builder 改 ADR 决策无强制）是**同一个根因的两面** —— 架构文档归属在机器层只表现为「路径前缀」，没有角色维度。

---

## 5. 额外发现：治理面「审查口径表」漏掉执行层代码

⚠ **先分清两张表**（本节初稿曾把它们混为一谈，此处已订正）：

| 表 | 位置 | 管什么 | 谁能写 |
|---|---|---|---|
| **门控清单** | `lib/role-policy.ts:27-43`（`GOVERNANCE_PATHS`） | 哪些路径算「治理面」⇒ 决定**写权限**归属 | 机制面归 builder（在飞 ADR `ADR-governance-paths-ownership` 的 D3 口径下） |
| **审查口径表** | `prompts/build.md` §治理面作用域表 | 哪些改动**必须**走 oracle→critic | architect（表格行增删 = 必审对象） |

- 事实：`prompts/build.md` 的**审查口径表**覆盖 `prompts/**`、`commands/**`、`scripts/**`、`AGENTS.md`、`opencode.json*`、`docs/{MULTI-AGENT-DESIGN,CHANGELOG,SUBAGENT-ORCHESTRATION}.md`、`tests/config-guards.test.ts` —— **不含 `lib/**` 与 `plugins/**`**；而 `lib/role-policy.ts`（写集真源）、`lib/delegate-core.ts`（派发类边界）、`plugins/role-gate.ts`（门控）正是**权限的实际执行代码**。
- 在飞 ADR 的一致性：仓内未提交的 `docs/adr/ADR-governance-paths-ownership.md`（Status = **Proposed**，待用户签批）已裁定「机制面文件**不进核心集**」（D2 注）—— 即 `lib/**` 不得进入**门控清单**（否则 architect 借治理面身份拿到机制代码写权 = 被否决的方案 A）；同时 D3 声明「机制面归 builder，改动 `lib/**` 与守卫断言 ⇒ **治理面必审**」。
- 缺口：该「必审」声明目前**只活在 ADR 散文里** —— 审查口径表没有 `lib/**` 行 ⇒ 执行层改动的审查触发**无登记口径**（注：oracle→critic 触发本身对治理面全是散文驱动，故此处是「无声明」而非「机器漏判」）。
- 建议：**只**在 `prompts/build.md` 的**审查口径表**补 `lib/**` + `plugins/**` 行（审查范围 ≠ 写权限；不触碰 `GOVERNANCE_PATHS`）⇒ 与在飞 ADR 的 D2/D3 口径一致，且不与其冲突。

---

## 6. 建议的修复顺序

1. ~~**先解 §4.1**~~ ✅ **已做（2026-11-23）**：`arch_paths` 增 `docs/architecture` + 建目录（`docs/architecture/README.md`）。
2. **再裁决 §4.2**（内置流程的交接面通道）—— 需要口径决策，不能两说。
3. **然后处理 §4.6 + §4.4**（机器层收口：架构文档归属要角色维度）—— 属治理面改动，须走 oracle → critic。
4. **§5**（审查口径表补 `lib/**` + `plugins/**`）—— 与在飞 ADR D2/D3 口径一致（只动审查口径表，不动门控清单）。
5. §4.3 / §4.5 为口径与上游同步，可随文档修订一起做。

---

## 7. 修复记录（2026-11-23，本轮）

| # | 动作 | 落点 | 结果 |
|---|---|---|---|
| 1 | 补登记在飞 ADR（registry 缺口 ⇒ `bun test tests/` 红的唯一来源） | `.rddf/rollback/registry.json` | `exempt` / `not-implemented` 条目（按 `.rddf/reviews/governance-paths-ownership-review.md` §4 给出的精确 JSON）；`bun scripts/rollback-registry.ts` = PASS（census: exempt 3→4） |
| 2 | P0 修复（§4.1） | `.rddf/config/arch-docs.json` + `docs/architecture/README.md`（新建） | `resolveArchPaths()` → `["docs/adr", "docs/architecture"]`；`scripts/arch-docs-init.sh --check` = ok（无漂移）；architect 对 theme doc 放行 |
| 3 | 回填本报告 | 本文件 | §4.1 标记已修 + 新增 §4.6（`archPaths` 泄漏） |

⚠ **本轮的角色切换**：动作 1 触及 `.rddf/rollback/**`（architect 写集不含该目录 ⇒ role-gate 实证 DENY）⇒ 经用户口令切到 builder 后执行；动作 2、3 属 architect 写集。

---

## 8. 复核方式

```bash
# 1) 写集真源（角色 → 写根）
sed -n '72,110p' lib/role-policy.ts

# 2) skill owns 声明（产品侧仓外）
for s in rdd-arch rdd-planner rdd-builder rdd-verifier; do
  sed -n '/role:/,/^---/p' ~/.agents/skills/rdd-workflow/skills/$s/SKILL.md
done

# 3) 本仓实际写入路径判定（33 条路径 → OK/DENY）
bun /tmp/opencode/align_check.ts

# 4) 门控只管 edit/write
sed -n '20,30p' plugins/role-gate.ts
```
