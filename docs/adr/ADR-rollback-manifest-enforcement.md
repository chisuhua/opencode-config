# ADR：回滚可达性的强制化（L2）—— 机制登记表 + 四条机器判据

## 元数据

| 字段 | 值 |
|---|---|
| Status | **Proposed**（2026-11-20 首轮：oracle `APPROVE` + critic `APPROVE_WITH_CONDITIONS`，8 条 SHOULD_FIX 已闭合；2026-11-21 增量 1：新增 `no-single-baseline` 类；增量 2（第 3 轮）：M2 指针闭集 + V8 判据形态；增量 3（第 4 轮）：新增 `unmanifested` 状态 —— 各轮 oracle / critic 均已复审。实施落地后转 `Accepted`） |
| Date | 2026-11-20 |
| Author | architect（主会话） |
| Parent | `ADR-commit-verification-gate`（「回滚 ≠ 彻底删除」+ V12 的机械载体）＋ `ADR-plan-delegate-engineering-session`（「形式可逆 ≠ 实质可逆」的实测）＋ `ADR-plan-multi-session-collaboration`（首个自包含清单） |
| 关联 change | 尚未立项 ⇒ `backlog: rollback-manifest-enforcement`（planner 立项后回填 AC 映射） |
| AC 映射 | 待立项后回填（当前以本文 **V1–V10** 为准） |
| 审稿报告 | `.rddf/reviews/adr-rollback-manifest-enforcement-review.md`（审查完成后誊写，审查者只读） |
| 修订 | **2026-11-21（第 4 轮，用户批准）**：实施期发现**豁免闭集装不下 9 篇「机制在跑、清单待写」的 ADR**（现有 5 类都是「该机制**不该**有清单」的判断 ⇒ 硬塞即谎）⇒ 新增 `state=unmanifested`（**债**而非豁免）：必填 `pending_backlog`（存在性可机判）+ M7 + V13；D4 归类口径改「按真实性质归类」。oracle → critic 增量各 1 轮（用户已批准第 4 轮）。**2026-11-21（第 3 轮，用户批准）**：第二份清单（`model-fallback`）暴露 **M2 指针闭集缺口**（机制可以没有 ADR ⇒ 决策真源在 `.rddf/reviews/`）⇒ M2 改「决策记录闭集」+ U8 登记；并把 **V8 的判据形态**写实（按内容比对、排除 `last_drill` 字段 —— 按提交号比对会自指回归）；oracle → critic **增量**各 1 轮（用户已批准第 3 轮）。**2026-11-21**：实施期实测发现豁免闭集缺「无单一可回退状态」这一类（`role-gate` 的教学面自初始提交即存在）⇒ 新增 `exempt_class=no-single-baseline`（成立性归 U7）+ 背景段补论证；oracle → critic **增量**各 1 轮。**2026-11-20**：oracle 1 轮（`APPROVE` + 4 条前置）→ critic 1 轮（`APPROVE_WITH_CONDITIONS`，8 条 SHOULD_FIX）均逐条处置（M1 排除 registry 自身 / 「修订 ADR 新增机制」登记为 U6 / `last_drill` 与 `retired_evidence` 入 state 表 / 空壳清单与自证证据入 M5 / V4 点名单一真源 / D6 只约束新增 + 退役时改述 / 自指闭环 D6b）—— 逐轮处置见审稿报告，本文只保留**结论** |
| 回滚清单 | **无**（`state: declared`）—— 本 ADR 的退役 = 撤守卫 + 删 registry 条目，属**低不可逆性**；按 D5 它以 `declared` 状态登记，实施落地后才转 `active`。**这是本 ADR 自指纪律的示范**，不是遗漏 |

## 背景与问题

**现状（L1）**：`.rddf/rollback/<mechanism>.json`（`delete` + `edits`）+ `bun scripts/rollback-drill.ts`（隔离 clone 里执行并跑验证）+ `tests/rollback-manifests.test.ts`（零成本漂移守卫：`find` 不唯一 ⇒ 套件红）。3 份清单已实测 PASS（`commit-gate` / `plan-topics` / `plan-delegate`）。

**L1 判不了的两件事**：

1. **「该有的清单在不在」** —— 现有守卫只判「已有的清单是否可执行」。一份清单都不写，套件照样绿（`≥2 份` 的计数断言对「删掉其中一份」零判别力）。
2. **「退役是否彻底」** —— `ADR-plan-delegate-engineering-session` 的实测给出反例：三步 + 3 处同步 ⇒ **套件绿**，但 `prompts/plan.md` 仍在教 plan 派发、文档仍说「plan 也是放行主体」、20 余处守卫仍要求 plan 覆盖派发契约 ⇒ **prompt 与权限层互相矛盾**（`docs/CHANGELOG.md` 的 v2.44 事故形态）。⇒ 判据不是「套件绿不绿」。

**要解决的问题**：把「机制退役前先备好可执行清单」从**善意**变成**流程义务**，并让「ADR ↔ 清单」的映射**可机判**（存在性 / 指针 / 生命周期），同时**不假装**判得了语义覆盖。

**闭合边界（必须写明，防误读）**：本 ADR **只能机判闭合 ①**（该有的清单在不在 / 映射是否完整）；对 **② 它只闭合「前置条件」**（机制落地时不得没有清单/豁免，见 D5 的落地 tripwire）——**检测「退役是否彻底」仍是 U3 / 评审**。不要按「② 也必须变红」来读本文。

**为什么现在做**：L1 的三份清单已验证格式泛化（含一个触到骨架的机制）⇒ 强制化的前置条件（格式稳定）已具备；再晚做，每新增一个机制就多一笔存量债。

**第二条实测发现（证据见审稿报告 §8）**：**机制 ⇒ ADR 并不成立** —— `model-fallback` 没有 ADR（其验收报告自述「本仓库无 ADR」）⇒ 决策记录可能在 `.rddf/reviews/` ⇒ M2 的指针闭集必须包含它，否则这类机制无法登记。

⚠ **该路径的机器覆盖从「登记那一刻」才开始**（登记后的机判完整：M2 强制指针存在 + ∈ 闭集 + == 清单 `adr`；无清单 ⇒ M2 必红）⇒ **「这个无 ADR 的机制该不该进 registry」这个触发器本身仍无机器信号** ⇒ 与 U6 同类，归评审（如实登记，不得宣称机器兜底）。

**清单做不到什么（实施期实测，证据见审稿报告 §7）**：清单的隐含前提是「存在一个可回退的先前状态」。**没有单一可回退状态**的机制（教学面自初始提交即存在、实现面被多个增量重塑过，回退任一面都会留下 prompt 与权限层的矛盾）⇒ 退役是**重写**，不是回退 ⇒ 需要 `no-single-baseline` 这个合法状态（否则会被硬塞进某个豁免类，或永远红）。

## 决策

### D1 登记面 = 以 **mechanism** 为键的 registry（`.rddf/rollback/registry.json`）

每条记录：`{ mechanism, adr_primary, adr_related[], state, watch[], exempt_class?, exempt_evidence?, retired_at?, notes? }`。

- **键是 mechanism，不是 ADR**：一 ADR 多机制（`ADR-front-multi-backend` 的 D1/D7/D11 可独立退役）与一机制多 ADR（`plan-delegate` 的退役面横跨 4 个增量）都真实存在 ⇒ 以 ADR 为键必然表达不了。
- `adr_primary` 单值（用于「一致性」的判据锚点），`adr_related[]` 表达其余关联。
- `state ∈ {declared, unmanifested, active, retired, exempt}`。
- `pending_backlog?`（仅 `unmanifested` 必填）：指向**存在的**债指针文件，**按机制命名**（`.rddf/rollback/pending/<mechanism>.md`）—— 「该有清单但还没写」的**可查证、逐机制**出处。
- registry 是**唯一登记面**；清单里不再重复登记 ADR 之外的元信息。

### D2 一致性只保留 **四条机器判据**，其余**明确登记为不可判**

| # | 机器判据 | 判什么 |
|---|---|---|
| M1 | **集合相等（双向）** | `docs/adr/*.md` 全集 == registry 中**落在 `docs/adr/` 的 `adr_primary` 全集**（⚠ **只统计 `docs/adr/` 的 `adr_primary`** —— `adr_related[]` 只登记不校验（U5） —— `.rddf/reviews/` 指针**不参与** M1，其存在性/一致性由 M2 + U8 面负责；否则 review 指针会让右侧多出集合外元素 ⇒ 落地首日恒红）；**除 `registry.json` 外**的 `.rddf/rollback/*.json` 全集 == `state=active` 的 mechanism 全集 |
| M2 | **指针有效 + 有范围** | `state=active` 的 `adr_primary` 必须存在、必须落在**决策记录闭集**（`docs/adr/` ∪ `.rddf/reviews/*-verify.md`）、且 == 对应清单的 `adr` 字段（两处同改才绿）。⚠ **机制不一定有 ADR**（实测 `model-fallback` 无 ADR ⇒ 决策真源是其验收报告）⇒ 只认 `docs/adr/` 会让这类机制**无法合法登记** |
| M3 | **豁免闭集 + 前提可判** | `exempt_class ∈ {no-mechanism, one-way, not-implemented, superseded, no-single-baseline}`（`no-single-baseline` = **无单一可回退状态 ⇒ 退役=重写**）；多类同时成立时**按实际理由归类** —— 能举出**混合基线的 `git log` 事实证据**（教学面自初始提交即存在 / 实现面被多个增量重塑）时**不报 `one-way`**；成立性按所报类对应的 **U 条目或机器前提**评审；**所有豁免类**：`exempt_evidence` 必须指向**存在的**文件（把「任意写一句」的表态成本从 0 变成 >0）；`not-implemented`：`watch[]` 非空且**每条**路径当前**都不得存在**（任一存在 ⇒ 实现已落地 ⇒ `not-implemented` 是谎言 ⇒ 红）；`superseded`：`exempt_evidence` 指向存在的 successor |
| M4 | **落地 tripwire（`declared` 的出口）** | `state=declared` 必须带 `watch[]`（实现合入后**将存在**的路径）；其中**任一**路径已存在 ⇒ 该条目必须已转 `active`（有清单）或合法 `exempt` ⇒ 否则红 |
| M5 | **清单形态（防空壳）** | `edits[].find ≠ edits[].replace`（no-op 替换不算回滚）；`verify.commands` 至少一条 == `DEFAULT_VERIFY` 之一**或** ∈ registry 的 `verify_allowlist[]`（闭集、显式声明）；`exempt_evidence` **不得**指向 `adr_primary` 或 `registry.json`（自证不算证据） |
| M6 | **退役证据可判** | `state=retired` 的 `retired_at` 形状合法（ISO 日期）+ `retired_evidence` 指向**存在的**文件 |
| M7 | **债可见（`unmanifested`）** | ① `pending_backlog` = `pending/<mechanism>.md`（**按机制命名** ⇒ 债文件集合 == `unmanifested` 机制集合，双向相等）；② `watch[]` 非空且**每条当前都存在**（**机制在跑的锚点** —— 与 M4 的 `declared`（watch 指向**未来**路径）恰是对偶，两态机器可分）；③ `adr_primary` 见 **M8**（指针闭集对全部状态生效） |
| M8 | **指针闭集（全部状态）** | **任何** `state` 的 `adr_primary` 必须存在、且 ∈ 决策记录闭集（`docs/adr/` ∪ `.rddf/reviews/*-verify.md`）⇒ 根治**全部状态**的悬空指针洞（此前只有 `active` 受 M2 约束）；M2 保留 `active` 专属的「== 对应清单的 `adr` 字段」 |

**不可判（写进本文末尾的「已知不可机判」表，任何守卫不得宣称覆盖）**：

- U1 **语义覆盖**：清单的 `delete+edits` 是否覆盖 ADR 回滚口径宣称的**全部面**（配置 / 实现 / prompt / 文档 / 守卫五类）。
- U2 **豁免理由成立性**：`one-way` 是否真是单向门、`no-mechanism` 是否真没有可退役增量。
- U5 **归属诚实性**：`adr_related[]` 只登记不校验 ⇒ 把新机制挂到旧 ADR 的 `adr_related` 里、`adr_primary` 指一篇无关 ADR，M1/M2 仍绿。**只登记、不加判据**（加判据需要语义判断）。

### D3 强制点 = `bun test tests/`；效力边界写死

- 判据落在**唯一真实闸门**（本仓无 CI、无生效 git hook）。
- 文案必须写明：**「不跑测试 ⇒ 不强制」**。禁止写成「CI 强制」「流程保证」。
- **沉默 = 违规**：**新增** ADR 若既不给清单也不给闭集豁免 ⇒ 必红（由 M1 的「ADR 全集」一侧兜住）。⚠ **修订既有 ADR 新增一个机制**时集合不变 ⇒ **零信号** ⇒ 登记为 U6（评审面）。
- 「必须」的**时点** = **实现合入时**（不是签 ADR 时）：未实施的 ADR 用 `state=declared` 或 `exempt(not-implemented)` 表达，不产出物理上不可能存在的清单。

### D4 追溯口径 = **baseline 快照**，不逐篇补清单

- 15 篇 ADR（含本文）**全部**进 registry（存量债可见），**外加**「无 ADR 的机制」条目（`model-fallback` ⇒ 其决策记录在 `.rddf/reviews/`）。每条按**真实性质**归类，不硬塞：
  - `active` = 已有清单（`commit-gate` / `plan-topics` / `plan-delegate` / `model-fallback`）；
  - `unmanifested` = **机制在跑、清单待写**（存量债：带 `pending_backlog` 逐机制指针）—— delegate 核心族、role 族、`role_class` 增量等；
  - `exempt` = **该机制不该有清单**（`not-implemented`：尚未立项的 `canonical-root-normalization`；`no-single-baseline`：教学面自初始提交即在的 `role-aware-permissions`）；
  - `declared` = 已签未落地（本文在落地前）。
- 新增/修订 ADR：只允许 `active`（带清单）或闭集 `exempt_class`。
- ⚠ **`unmanifested` 仅限 baseline 存量**（本次实施期一次性登记）—— 它**不是**新增 ADR 的出口。⚠ **本句是评审面约束**（机器判不了「这条是不是 baseline 存量」；新增 ADR 冒充存量只能靠评审拦）⇒ 与 U6 同类，如实登记见 U9。
- **不得**逐篇补清单：`role-aware-permissions` 的「回滚」是**切换失败的回退语义**、`front-multi-backend` 的「不可回滚」是**单向门表述** ⇒ 关键词口径会把它们判成假阳性（实测 7 篇命中里 2 篇是假的）。

### D5 生命周期：`declared → active → retired`（**落地即红**）

| state | 清单 | 必填字段 | 机器前提（不满足 ⇒ 红） |
|---|---|---|---|
| `declared` | 不需要 | `watch[]` | `watch[]` 非空；**任一**路径已存在 ⇒ 必须已转 `active` 或合法 `exempt` |
| `active` | **必须存在** | `adr_primary`、清单 `adr` 一致、清单 `last_drill{sha,at,result}`（**存量清单逐份回填**） | M1 + M2 + M5 |
| `retired` | **不得存在**（执行后删除） | `retired_at`（ISO 日期）+ `retired_evidence`（机读路径字段，**须存在**；`notes` 只留人读，不参与判定） | M1（清单集合不含它）+ M6 |
| `unmanifested` | **不得存在** | `pending_backlog`（**须存在**）、`watch[]`（每条**当前都存在**） | M7（债可见；**不是**豁免 ⇒ 不得用它躲清单） |
| `exempt` | 不需要 | `exempt_class`、`exempt_evidence`（**须存在**） | M3（`no-single-baseline` 的成立性见 U7） |

- `retired` ⇒ **删除清单文件**：退役后的清单 `find` 必然不匹配 ⇒ 留着会让 `planDrill` 恒红 ⇒ 恒红的守卫会被绕过。退役证据 = `retired_at` + `notes` 指向的评审/演练报告（git 历史为兜底）。
- `declared` **不是零成本恒绿口**：`watch[]` 是实现落地后将出现的路径（例：`plugins/foo.ts`）⇒ 实现一落地，路径就存在 ⇒ 该条目**必须**同批转 `active`（或给合法豁免）⇒ 否则红。这把「评审义务」变成机械信号。
- **两态不变式（机器可分的对偶）**：`declared` = 机制**未落地**（`watch[]` 指向未来路径，任一存在 ⇒ 必须离态）；`unmanifested` = 机制**已落地、清单未写**（`watch[]` 指向现有路径，锚点腐烂 ⇒ 红，逼迫重新表态）。
- `unmanifested` 的**允许迁移边**：写清单 ⇒ `active`；重新定性为「不该有清单」⇒ `exempt`（须给闭集 class + 证据）；机制退役 ⇒ `retired`（删清单 + `retired_at` + 证据）。
- 豁免不得成为洗白通道：`exempt_class` 闭集之外的值 ⇒ 红；`exempt_evidence` 必须指向存在的文件（表态成本 > 0）。豁免条目**只增不减**本身不红（避免为绿而逼人补假清单），但新增豁免需在评审里说明（U2）。

### D6 单向树，不成环

- ADR → registry：ADR 元数据加**机读行** `<!-- rollback: mechanism=<name> -->`（可选，仅用于人读导航）。
- registry → 清单 / ADR：单向引用。
- **清单不反向读 ADR 正文**；**新增** ADR 正文**不写清单路径**（避免改名级联与第二真源）。
- ⚠ **既有 ADR 已在正文写了清单路径**（`ADR-commit-verification-gate` 的「可执行真源」段）⇒ 不追溯改写；但**退役执行时**必须同批改述仍活着的 ADR 里指向该清单的句子（否则退役后文档仍在宣称一个已撤掉的清单 —— 正是本文要治的病）。

### D6b 自指闭环（本文自己怎么登记）

- 守卫落地前：`state=declared`，`watch[] = [<守卫文件路径>]`。
- 守卫落地**同批**：self 转 `state=active` + **一份自清单**（`delete` = [守卫文件, `.rddf/rollback/registry.json`]；`edits` = `tests/README.md` 覆盖表的新增行）—— 退役本机制 = 撤守卫 + 删 registry 条目，属**低不可逆性**。
- ⚠ **不得**用 `exempt(one-way)` 绕开：`exempt_evidence` 对本文**无自然指向**（没有一个存在的文件能证明「本文是单向门」）⇒ 那会变成「为绿而编证据」。

### D7 证据时效 + 三层命名

- 清单加 `last_drill: { sha, at, result }`；套件只判**形状** + 「清单文件在该 sha 之后被改过 ⇒ 字段必须同批更新」（`git log -1 --format=%H -- <manifest>`，经 `tests/helpers/real-repo-git.ts`）。
- **操作口径（写实，不易实现）**：drill 基于 HEAD ⇒ 拿不到「将来那个 commit」的 sha ⇒ 合法形态只有两种：① `commit → drill → 回填 sha → amend`（净一个提交）；② 两次提交（先 drill，再补字段）。**不接受**「事后任意时刻补一行日期」。
- **fail-open 如实登记**：`tests/helpers/real-repo-git.ts` 在非超时失败时返回空串 ⇒ 无 git 环境下该判据**静默跳过**（与仓内预算守卫同哲学）。守卫注释必须写明这一点（`docs/guard-authoring.md` 的登记纪律）。
- **不在套件里跑 drill**（`clone` + 整套测试 ≈30s/清单）。
- 三层各自证明什么，措辞不许混：

| 层 | 载体 | 证明什么 | 不证明什么 | 何时跑 |
|---|---|---|---|---|
| **presence** | `tests/rollback-manifests*.test.ts` | 映射完整 / 指针有效 / 豁免合法 | 清单可执行 | 每次 `bun test` |
| **executability** | 同上（`planDrill`） | 清单**现在**可执行（`find` 唯一 / 目标存在） | 执行后仓库自洽 | 每次 `bun test` |
| **drill** | `scripts/rollback-drill.ts` | 隔离副本里执行后**套件绿** | 语义覆盖（U1） | 手动 + 退役前必须 |

## 选项对比表

| 选项 | 结论 | 理由 |
|---|---|---|
| **A. registry（mechanism 为键）+ 四条机器判据（M1–M4）+ 两条形态/证据判据（M5–M6）+ baseline 快照**（本文） | **采纳** | 唯一能同时表达「一 ADR 多机制 / 一机制多 ADR」且可机判的形态；baseline 让存量债可见而不逼人补假清单 |
| B. 只约定、不强制（现状 + README 说明） | 否决 | 已在 L1 证明不可靠：`plan-delegate` 的清单是「有人想起来才做」的结果；且 L1 的计数守卫对「删一份」零判别力 |
| C. 按 ADR 散文解析「回滚」段推导 | 否决 | 实测 7 篇命中里 **2 篇假阳性**（切换回退 / 单向门）⇒ 分类器准确率连现状都不支撑；且散文换句式即失效 |
| D. 每机制一个声明文件 + 派生索引（避免单文件合并冲突） | 否决（本期） | 并发冲突只在「两个 agent 同时改 registry」时出现（本仓单主会话为主）；代价是多一层派生及其漂移判据。若将来并行度上升可再议 |

## 后果 / 代价

**正面**
- 「该有的清单在不在」从**人读**变**机判**：新增 ADR 不给清单/豁免 ⇒ 套件红。
- 存量债**可见**（15 篇全登记，含本文）而不阻塞；新增债不许欠。
- 三层命名把「映射完整」「清单可执行」「退役后自洽」分开 ⇒ 不再用「套件绿」冒充「可退役」。
- 与既有守卫**不重叠**：`planDrill` / drill 的能力原样保留，本 ADR 只补 presence 层。

**负面 / 代价**
- **改 ADR 就要同步 registry**（M1 的 ADR 全集）⇒ 每新增一篇 ADR 必须有一次「有没有机制」的判断（约 1 分钟，但不可省）。
- **`last_drill` 需同批更新**（清单改动后）⇒ 多一步；`sha` 记录只对那一个 commit 成立（如实登记）。⚠ V8 的「实质改动」判定（剥 `last_drill` 后**解析 + 深比较**）**不区分 key 序 / 缩进 / 纯换行**（解析后无差异 ⇒ 不判红）；残余噪声只有两类：**数组元素重排**（`edits[]` 顺序敏感）与**字符串值内的换行**（属实质内容变更）⇒ 代价是同批回填一次 `sha`（缓解成本低，噪声可接受）。
- registry 是**单文件**：两个 agent 并发各加一条会冲突（JSON 缩进下通常可按块合并，但不是零成本）。
- 豁免的语义成立性（U2）**仍靠评审** ⇒ 强制化只解决了「忘了表态」，没解决「表态错」。
- **`unmanifested` 是债不是豁免**：它把「该有清单但还没写」变成**可见且可查证**的一条记录（`pending_backlog`）⇒ 但**没有到期机制**（不引入「N 天后必须…」这类时间债）⇒ 存量债的清偿只能靠后续 change 主动写清单 ⇒ 如实登记。

**风险**
- **误报成本落在每次 `bun test`**：若 baseline 登记不全 ⇒ 立刻红。缓解：本 ADR 实施时一次性把 15 篇登记完（V5）。
- **`exempt` 变成默认选项**（全部标 `no-mechanism` ⇒ 恒绿）。缓解：M3 要求**所有豁免类的 `exempt_evidence` 指向存在的文件**（表态成本 > 0）+ `not-implemented` 的 `watch[]` 每条都不得存在；M4 让 `declared` 也有落地 tripwire；另外 V7 对「存在即证明在跑」的实现（`lib/role-*` / `plugins/commit-gate.ts` 等）断言**不得**标 `no-mechanism` —— 该枚举手维护，**如实登记为弱判据**。
- **`.rddf/state/adr-*.md` 在扫描面之外**（含 Status Accepted 的 `adr-front-agent-redesign.md`）⇒ 永久管外，登记为已知盲区。

## Verification（可勾选验收判据，前瞻）

> 形态：V1–V10 全部**可机判**（毫秒级、不 clone、不跑 drill）；U1/U2 只能评审。**关键判据必须配变红演练**（各条已内联突变动作）。

- [ ] **V1 映射集合相等（双向）**：`docs/adr/*.md` 全集 == registry 中**落在 `docs/adr/` 的 `adr_primary` 全集**（`adr_related[]` 与 `.rddf/reviews/` 指针均不参与本判据）；`.rddf/rollback/*.json` 全集 == `state=active` 的 mechanism 全集。**变红**：新增一篇 ADR 不登记 ⇒ 红；删一份清单不登记 ⇒ 红（现有「≥2 份」断言抓不到这一支）。
- [ ] **V2 指针有效且有范围**：**任何状态**的 `adr_primary` 都存在、且**在决策记录闭集内**（`docs/adr/` ∪ `.rddf/reviews/*-verify.md` —— 与 M8 同闭集）；**`active` 另须** == 清单的 `adr`。**变红**：把 `adr` 指向另一篇存在但无关的 ADR ⇒ 红；把 `model-fallback` 的 `adr` 改指另一份**存在的** `-verify.md` ⇒ 红（reviews 指针同样受「== 清单 `adr`」与 M2 闭集约束）。
- [ ] **V3 豁免闭集 + 前提可判**：`exempt_class` 取闭集（含 `no-single-baseline`）；**所有豁免类**的 `exempt_evidence` 指向存在的文件；`not-implemented` ⇒ `watch[]` 非空且**每条**路径当前**都不得存在**（任一存在 ⇒ 红）；`superseded` ⇒ evidence 指向存在的 successor。**变红**：写 `exempt_class: "later"` ⇒ 红；`not-implemented` 的 `watch[]` 里有一条已存在 ⇒ 红；`exempt_evidence` 指向不存在的路径 ⇒ 红。
- [ ] **V4 必填性单一真源**：**治理面必填性**（`adr` 存在且 == `adr_primary`、`verify.commands` 非空、`last_drill` 形状）只在 `tests/rollback-manifests.test.ts` 断言；`lib/rollback-drill.ts` 的 schema **保持最小**（只保证 drill 能跑）并在注释里声明「必填性由 registry 守卫负责，schema 不重复」。**变红**：在 schema 里另加一份必填性断言（第二真源）⇒ 红；注释里的分工声明缺失 ⇒ 红。
- [ ] **V5 baseline 完整**：15 篇 ADR 全有 registry 条目（一次性核对）。**变红**：删一条 ⇒ V1 红。
- [ ] **V6 生命周期 + 落地 tripwire**：`declared` 的 `watch[]` 非空且**任一已存在 ⇒ 必须已非 `declared`**；`active` 必须有清单 + `last_drill`；`retired` 不得有清单且 `retired_at` + `retired_evidence` 齐（证据路径须存在）。**变红**：`declared` 的 watch 路径已落地却不转 `active` ⇒ 红；退役后保留清单 ⇒ 红；`retired` 缺 `retired_at` / 证据路径不存在 ⇒ 红。
- [ ] **V7 弱判据（如实登记）**：对「存在即证明在跑」的实现（`lib/role-identity.ts` / `lib/role-lease.ts` / `lib/role-policy.ts` / `plugins/role-gate.ts` / `plugins/delegate.ts` / `plugins/commit-gate.ts` / `plugins/subagent-contract.ts` / `plugins/model-fallback.ts`）断言其对应条目**不得**标 `no-mechanism`。**变红**：把 `role-gate` 标 `no-mechanism` ⇒ 红。⚠ 该枚举**手维护** ⇒ 弱判据（新增插件不会自动被覆盖）；若能从 `plugins/` + `lib/` 目录派生则升级，否则维持自登。
- [ ] **V8 证据时效**：`last_drill {sha, at, result}` 形状合法；清单在 `sha` 之后**实质改动过** ⇒ 字段必须同批更新。**操作口径** = `commit → drill → 回填 sha → amend`（或两次提交）。**判据形态（按内容比对，排除 `last_drill` 字段本身）**：`git show <sha>:<manifest>` **解析为对象后剥除顶层 `last_drill`** 再与当前**深比较**（不做字节比较、不用正则剥文本 ⇒ 防 key 序/缩进假红） —— 按**提交号**比对会**自指回归**（回填 sha 本身就要再提交一次 ⇒ 永远「晚于」⇒ 永远红）⇒ 排除该字段后「sha 之后是否实质改过」才可判。**变红**：改清单（`delete` / `edits` / `notes` 等实质字段）不改 `sha` ⇒ 红；只改 `last_drill` ⇒ 绿。⚠ 无 git 环境 ⇒ 本判据静默跳过（fail-open，须在守卫注释登记）。
- [ ] **V9 零成本**：新守卫不 spawn 进程、不在套件里调 drill；套件时长增幅 ≤ 1s。
- [ ] **V10 文档登记**：`tests/README.md` 覆盖表**新增** rollback 守卫行（现状该表**没有**任何 rollback 行 ⇒ 是新增不是改行）；`.rddf/rollback/README.md` 的「现有清单」表改为**派生**（或删除并指向 registry）。**变红**：表与目录不一致 ⇒ 红；新守卫未登记 ⇒ 红。
- [ ] **V12 清单形态（防空壳，M5）**：每条 `edits` 的 `find ≠ replace`；`verify.commands` 至少一条 == `DEFAULT_VERIFY` 之一或 ∈ `verify_allowlist[]`；`exempt_evidence` 不得指向 `adr_primary` / `registry.json`。**变红**：`find == replace` ⇒ 红；`verify: [["true"]]` 且不在 allowlist ⇒ 红；证据指向 ADR 自身 ⇒ 红。⚠ 这是**形态**判据 —— 它不证明清单**有效**（U1），只证明它不是空壳。
- [ ] **V13 债指针可查 + 债是逐机制的**：`state=unmanifested` 的 `pending_backlog` = `pending/<mechanism>.md` 且存在；`watch[]` 每条当前都存在；该机制**无清单**；债文件集合 == `unmanifested` 机制集合（双向）。**变红**：指针指向不存在的文件 ⇒ 红；`unmanifested` 却有清单 ⇒ 红；两个 `unmanifested` 共指一份债文件 ⇒ 红；`watch[]` 指向已不存在的路径 ⇒ 红。
- [ ] **V11 退化可见性（census）**：守卫输出打印 `active / unmanifested / exempt / declared / retired` **五态**计数（`unmanifested` 计数 = 存量债的规模 ⇒ 债在退化信号里不可见就没有 ratchet 压力）（给人读评审一个一瞥即见的退化信号）。**变红**：输出缺失 ⇒ 红；计数与 registry 不符 ⇒ 红。⚠ 只做可见性，**不做**「active 只增不减」之类的计数断言（与 `retired` 生命周期冲突）。

**已知不可机判（不得宣称覆盖）**

| # | 判不了什么 | 兜底 |
|---|---|---|
| U1 | 清单的 `delete+edits` 是否覆盖 ADR 回滚口径的**全部宣称面**（配置 / 实现 / prompt / 文档 / 守卫五类） | 评审 rubric：每类至少一处落点，缺类必须写进清单 `notes` 的「残留」段 |
| U2 | 豁免理由是否成立（`one-way` / `no-mechanism`） | 评审 |
| U3 | 「实质退役 vs 半退役」（`plan-delegate` 的教训：套件绿 ≠ 实质退役） | 评审：逐条核对「prompt / 文档 / 守卫是否仍在宣称该能力」 |
| U4 | 机制**改名**（语义变、文件名不变） | 无机械信号 ⇒ 登记备查 |
| U5 | `adr_related[]` 的归属诚实性（把新机制挂进旧 ADR 的 related 里，M1/M2 仍绿） | 只登记、不加判据（加判据需语义判断） |
| U6 | **修订**既有 ADR 时**新增**一个机制（ADR 集合不变 ⇒ M1 零信号） | 评审：修订 ADR 时须说明「新增/撤掉了哪个机制」 |
| U7 | `no-single-baseline` 的成立性（是否真的没有单一可回退状态） | 评审：须能指出「教学面自初始提交即存在 / 实现面被多个增量重塑」的具体证据（`git log --diff-filter=A` 的输出存档） |
| U8 | `adr_primary` 指向 `.rddf/reviews/` 时，它**是否真对应本机制**（路径存在 ≠ 相关） | 评审 |
| U9 | `unmanifested` 的「仅限 baseline 存量」成立性（新增 ADR 冒充存量） | 评审（机器只能给审计线索：与 baseline diff 比对） |

**范围外（已知盲区）**：`.rddf/state/adr-*.md`（含 Status Accepted 的 `adr-front-agent-redesign.md`）不在扫描面；`docs/adr/archive/**` 若建立归档目录，需另立决定（本期无该目录）。
