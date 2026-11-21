# 审稿报告：`ADR-rollback-manifest-enforcement`（L2 强制化）

> **ADR**：`docs/adr/ADR-rollback-manifest-enforcement.md`（Status **Proposed**，2026-11-20）
> **审查链**：decisions 前 **metis**（差距分析，材料）→ **oracle**（对抗式：会怎么坏）→ **critic**（`arch` 档：与既有 ADR / 契约冲突）
> **预算**：oracle 1 轮 + critic 1 轮（无 BLOCKER ⇒ 无复审）
> **本报告由 architect 从审查者输出誊写**（审查者只读，不写盘）

## 0. 意图检查点（architect 路径）

| 项 | 处置 |
|---|---|
| 意图陈述（可判定） | 用户明确要求「L2 强制化（有机制 ⇒ 必须有清单 + ADR↔清单一致性守卫）」；范围边界：不改既有 ADR 决策 / 不改实现 / 不逐篇补清单 / 不把 drill 塞进默认门禁 |
| 隐藏意图需问用户？ | 否（意图明确，无 ≥2 种合理解读） |
| 歧义 / 边界未枚举？ | 是 ⇒ **先单独调 metis**（不与 oracle 同轮并行），其六节作材料进 oracle 输入 |
| metis 轮次 | 1 轮（材料，不是判据） |

## 1. metis（决策前差距分析）—— 材料与采纳

| metis 的发现 | 处置 |
|---|---|
| 「机制」粒度有四解（ADR / ADR 内增量 / 代码模块 / 一组投影），只有后两者语义正确但需登记面 | **采纳**：D1 以 **mechanism** 为键的 registry |
| 豁免必须有闭集 + 可判前提，否则是洗白通道 | **采纳**：M3（闭集 + 证据存在 + `watch[]` 极性） |
| 「必须」的**时点** = 实现合入时（签 ADR 时物理上不可能有清单） | **采纳**：D3 + D5（`declared` 状态） |
| 一致性只能机判三条；语义覆盖必须登记为不可判 | **采纳**：M1–M4 + U1–U6 |
| 追溯 = baseline 快照，不逐篇补（关键词口径 7 篇里 2 篇假阳性） | **采纳**：D4 |
| `retired` 后清单怎么办没有规则 | **采纳**：D5 `retired ⇒ 删清单` |
| ADR ⇄ 清单双向指针会成环 | **采纳**：D6 单向树 |
| 证据字段化（`last_drill`），套件不跑 drill | **采纳**：D7 |
| 删掉「≥2 份」计数守卫，改集合相等 | **采纳**：M1（实施批次替换现断言） |
| **未采纳**：每机制一声明文件 + 派生索引 | 理由：本仓单主会话为主；代价是多一层派生与其漂移判据（选项表 D） |
| **未采纳**：`adr_related[]` 加校验 | 理由：需语义判断 ⇒ 登记为 U5 |

## 2. oracle（对抗式）—— `判定: APPROVE`（4 条前置）

| # | oracle 的发现 | 处置 | ADR 落点 |
|---|---|---|---|
| 1 | **M3/V3 极性自相矛盾**（M3 写「至少一条不存在」、V3 写「任一存在即红」） | 统一为**每条都不得存在**（强极性：实现落地 ⇒ `not-implemented` 是谎言 ⇒ 红） | D2/M3 + V3 |
| 2 | **`declared` 是零成本永久恒绿口**（转 `active` 只是评审义务） | 加 **M4 落地 tripwire**：`declared` 必带 `watch[]`，任一已存在 ⇒ 必须已非 `declared` | D2/M4 + D5 表 |
| 3 | **V8「同批更新」按字面不可实现**（drill 基于 HEAD，拿不到未来 sha） | 写实操作口径（`commit → drill → 回填 → amend` 或两次提交）+ 登记「无 git ⇒ fail-open」 | D7 |
| 4 | **`no-mechanism` 零前提 = 洗白口** | M3 加：**所有**豁免类的 `exempt_evidence` 须指向**存在的**文件（表态成本 > 0） | D2/M3 |
| 5–9 | state×字段×前提表 / `retired_at` + 证据 / census / 背景段写明闭合边界 / U5 | 全部采纳 | D5 表 / V11 / 背景 / U5 |

## 3. critic（`arch` 档）—— `APPROVE_WITH_CONDITIONS`（8 条 SHOULD_FIX，无 BLOCKER）

| # | critic 的发现 | 处置 | ADR 落点 |
|---|---|---|---|
| 1 | M1 字面把 `registry.json` 算进机制集合 ⇒ 落地首日恒红 | 显式「**除 `registry.json` 外**的 `*.json`」 | D2/M1 |
| 2 | D3 的「**修订** ADR 新增机制」分支不成立（集合不变 ⇒ 零信号） | 收窄为「**新增** ADR」；修订分支登记为 **U6** | D3 + U6 |
| 3 | `last_drill` 是否必填在 D5 表与 D7/V8 间矛盾 | `active` 必填（baseline 三份实施批次回填） | D5 表 + V6 |
| 4 | `retired` 证据要求从 `notes` 解析路径 = **散文解析**（违反本仓教条） | 独立机读字段 `retired_evidence`；`notes` 只留人读 | D5 表 + M6 |
| 5 | **no-op 清单可全绿**（`find == replace` / `verify: [["true"]]` / 证据指向自身） | 加 **M5 形态判据** + V12 | D2/M5 + V12 |
| 6 | V4 把「真源选哪处」留给实施者，且描述与现状不符（`adr` 在 schema 里是可选的） | **点名**：治理面必填性只在 `tests/rollback-manifests.test.ts`；schema 保持最小并在注释声明分工 | V4 |
| 7 | **自指闭环未写明**（self 的 `watch[]` 一落地即要求转 `active`，但 D4 的划分把 self 归 `exempt`） | 新增 **D6b**：self 落地同批转 `active` + 一份自清单；**不得**用 `exempt(one-way)`（无自然证据 ⇒ 为绿编证据） | D6b + D4 |
| 8 | D6「ADR 正文不写清单路径」与既有 Accepted ADR 冲突，且退役后会重演「文档仍在宣称已撤掉的东西」 | D6 只约束**新增** ADR；退役流程加一步「同批改述仍活着的 ADR 里的清单路径」 | D6 |
| NIT | 标题/规范段的「三条」与 M1–M4 四条不符 | 全部对齐为四条（+ M5/M6 单列） | 标题 / D2 / 选项表 |

## 4. 结论

- **oracle：APPROVE**（4 条前置已处置）→ **critic：APPROVE_WITH_CONDITIONS**（无 BLOCKER，8 条 SHOULD_FIX 已全部处置）⇒ **Status 转 `Proposed`**。
- **未签批为 Accepted**：实施批次（registry + 守卫 + baseline 14/15 篇登记）落地后才转 `Accepted`（ADR 完成标志第 3 条）。
- **关联 change**：`backlog: rollback-manifest-enforcement`（architect 不创建 openspec change；立项后回填 AC 映射）。

## 5. 已知不可机判 / 盲区（转自 ADR，防本报告读成「全闭合」）

| # | 判不了什么 | 兜底 |
|---|---|---|
| U1 | 清单是否覆盖 ADR 回滚口径的**全部宣称面** | 评审 rubric（配置 / 实现 / prompt / 文档 / 守卫五类，每类至少一处） |
| U2 | 豁免理由成立性 | 评审 |
| U3 | **实质退役 vs 半退役**（套件绿 ≠ 实质退役） | 评审：逐条核「是否仍在宣称该能力」 |
| U4 | 机制改名（语义变、文件名不变） | 无机械信号 |
| U5 | `adr_related[]` 归属诚实性 | 只登记 |
| U6 | **修订**既有 ADR 时新增机制 | 评审：修订须说明增/撤了哪个机制 |
| 盲区 | `.rddf/state/adr-*.md`（含 Status Accepted 的 `adr-front-agent-redesign.md`）不在扫描面 | 登记备查 |

## 6. 增量审查（2026-11-21：新增 `exempt_class = no-single-baseline`）

**动因**：实施期实测发现豁免闭集缺「**无单一可回退状态**」这一类（见 §7）⇒ 若不设此类，它要么被硬塞进某个豁免类（谎），要么永远红。

| 轮次 | 结论 | 处置 |
|---|---|---|
| oracle（增量） | `APPROVE` | ① 类名改为 **`no-single-baseline`**（与正文「没有**单一**可回退状态」逐字对齐；`rewrite-only` 被否：它命名后果而非原因，且与 `one-way` 混淆面更大）—— 7 处同步；② M3 加 tie-break 句；③ 明确否掉「机判前提 = `adr_primary` 在初始提交即存在」（机制年龄 ≠ ADR 年龄，会漏掉混合形态）；④ 「守卫重跑 git 比对证据存档」列为**实施期候选**（不阻塞定稿） |
| critic（增量，arch） | `APPROVE_WITH_CONDITIONS`（无 BLOCKER） | ① M3 内联新类定义（≤15 字）—— 决策陈述不该只活在背景段；② tie-break 补半句「能举出**混合基线的 `git log` 事实证据**时**不报 `one-way`**」；③ NIT：tie-break 的「U 条目」措辞悬空（`not-implemented` / `superseded` 走机器前提）⇒ 改为「U 条目**或机器前提**」；④ 顺带修 15 篇 / 14 篇计数漂移 |

**判别式的一处修正（oracle）**：`no-single-baseline` 与 `one-way` 的差别是**可证伪性** —— 前者是**历史事实**（一条 `git log --diff-filter=A` 即可戳穿），后者是**价值判断**（无法证伪）⇒ 前者的洗白成本高得多；叠加 M3 的「`exempt_evidence` 须指向存在的文件」+ U7 的证据形态 + V11 的 census ⇒ 洗白面被压到与 `one-way` 同级或更低。

## 7. 实施期实测：为什么需要 `no-single-baseline`（ADR 背景段引用的证据）

**样本**：`role-gate`（角色感知权限）。

| 量测 | 结果 |
|---|---|
| 教学面规模 | `prompts/build.md` 的 `## 角色矩阵` **608 行** / 97 处 `role` 提及 |
| 教学面基线 | `git log --diff-filter=A -- prompts/build.md` ⇒ **只有一个提交** `132f389`；且 `132f389` == `git rev-list --max-parents=0 HEAD`（初始提交）⇒ **原生** |
| 实现面基线 | `lib/role-lease.ts`（`c713a58`）/ `lib/role-identity.ts`（`0152534`）/ `lib/role-policy.ts` + `plugins/role-gate.ts`（`1d1f42f`）/ `scripts/role-switch.ts`（`57326f7`）⇒ **都晚于**初始提交 ⇒ 有基线 |
| 退教学面的代价 | 隔离副本删该段 ⇒ **39 处红**（对比：`plan-delegate` 的「三步」只有 4 处红）+ 悬空引用（`## 输出` / `§HANDOFF` / `§越权处理` 都写「⇒ 按 §需要用户裁决时 …」，该节在角色段内 ⇒ 须**重写**） |
| 退实现面的代价 | 留下「教学说按角色限写、工具层不限」的矛盾（**v2.44 形态**：prompt 与权限层互相矛盾） |
| 结论 | 两面基线**不一致** ⇒ **没有单一可回退状态** ⇒ 退役 = 重写（需 ADR + change），不是清单 |

⇒ 同时修正了 `.rddf/rollback/README.md` 的边界判别式：**不是「能力面 vs 内核」，而是「有没有（单一的）回退基线」** —— `plan-delegate` 能做成清单，靠的是「有基线」（那五项放行 2026-11-13 才加），不是「它是能力面」。

## 6b. 增量审查 2（第 3 轮，**用户批准**：2026-11-21）—— M2 指针闭集 + V8 判据形态

**动因**：第二份清单（`model-fallback`）暴露 **M2 指针闭集缺口** —— 该机制**无 ADR**（决策记录 = 验收报告）⇒ 只认 `docs/adr/` ⇒ 它无法合法登记。另在实现期推演中发现 **V8 按提交号比对会自指回归**（回填 `sha` 本身要再提交 ⇒ 永远「晚于」⇒ 永远红）⇒ 判据形态必须写实。

| 轮次 | 结论 | 处置 |
|---|---|---|
| oracle（增量 2） | `APPROVE` | ① **M1/M2 不同步的实现陷阱**：M1「ADR 全集」若把 `reviews/` 指针也统计 ⇒ 落地首日恒红 ⇒ M1/V1 补闭集界定（只统计 `docs/adr/` 的 `adr_primary`）；② V8 实现注记（解析后剥顶层 `last_drill` + **深比较**，不做字节比较/正则剥文本）；③ 否掉「V8 只比 `delete`/`edits`」（漏 `verify`、前向兼容性差）；④ 否掉「`adr_primary` 在初始提交即存在」（机制年龄 ≠ ADR 年龄）；⑤ 建议 U8 加「report basename == mechanism」弱判据 —— **主会话判定不做**（`commit-gate` 的决策记录叫 `commit-verification-gate-review.md` ≠ mechanism 名 ⇒ 会假红） |
| critic（增量 2，第 3 轮） | **REJECT**（1 BLOCKER + 2 SHOULD_FIX + 2 NIT） | **BLOCKER**：V2 仍写「在 `docs/adr/` 内」⇒ 与放宽后的 M2 **自相矛盾**（文档内对同一闭集两套判据）⇒ V2 对齐 M2 + 补 reviews 指针变红演练；SHOULD_FIX：登记**触发器**本身无机器信号（如实登记为评审面，与 U6 同类）+ NIT：M1/V1 口径收窄到 `adr_primary`、V8 格式化噪声记账 |
| critic（复审，验 BLOCKER 闭合） | `APPROVE_WITH_CONDITIONS`（1 SHOULD_FIX） | BLOCKER **已真正闭合**（全文无旧闭集残留）；SHOULD_FIX：新增的「格式化会红」代价条目与 V8 的「解析 + 深比较 ⇒ 防 key 序/缩进假红」**自相矛盾** ⇒ 收窄为「残余噪声只有数组元素重排与字符串内换行」 |

**本轮的净结论**：M2 = 决策记录闭集（`docs/adr/` ∪ `.rddf/reviews/*-verify.md`）；M1 = 只管 `docs/adr/` 的 `adr_primary` 集合相等；M2 + U8 = 管指针闭集与 reviews 指针的语义相关性（评审面）；V8 = 按内容比对（剥 `last_drill`）+ 深比较。

## 8. 实施期实测（第二条）：**机制 ⇒ ADR 并不成立**

- `model-fallback` **没有 ADR** —— 其验收报告 `.rddf/reviews/model-fallback-verify.md` 自述「本仓库无 ADR（§arch-docs 判定态 3）」，决策记录 = 该报告（2026-11-06 architect 设计 + 用户选定的 D 方案 + 11 条判据）。
- ⇒ 清单的 `adr` 字段允许指向**验收报告**；⇒ L2 的 M2 指针闭集必须包含 `.rddf/reviews/*-verify.md`（第 3 轮增量已改）。
- ⚠ **该路径的机器覆盖从「登记那一刻」才开始** ⇒ **「这个无 ADR 的机制该不该进 registry」这个触发器本身仍无机器信号** ⇒ 归评审（与 U6 同类）。
- ⇒ `.rddf/rollback/README.md` 已登记该发现（「机制 ⇒ ADR **并不成立**」段）。

## 6c. 增量审查 3（第 4 轮，**用户批准**：2026-11-21）—— 新增 `state = unmanifested`

**动因（实测）**：现有 5 个豁免类**全部**是「该机制**不该**有清单」的判断；而 9 篇既有 ADR 是「**该有但还没写**」—— 硬塞进任何一类都是谎（U2 评审会当场否掉）⇒ 实施期无处安放 ⇒ 需要一个**债**状态。

| 轮次 | 结论 | 处置 |
|---|---|---|
| oracle（增量 3） | `APPROVE` | ① **M7 补区分性判据**（否则 `unmanifested` 比 `exempt` 约束更少 ⇒ 新的逃逸口）：`pending_backlog` **按机制命名**（债文件集合 == `unmanifested` 集合，双向）+ `watch[]` 每条**当前存在**（在跑锚点；与 M4 的 `declared` 对偶 ⇒ 两态机器可分）+ 指针闭集；② **D3 提为规范句**（`unmanifested` 仅限 baseline 存量 ⇒ 防逃逸口从后果段升到规范段）；③ **V11 census 加 `unmanifested` 计数**（否则 9 笔债在退化信号里不可见 ⇒ 无 ratchet 压力）；④ **工件完整性告警**：本轮脚本中途崩 ⇒ 规范正文未落盘（只有元数据与后果段）⇒ 已重跑落盘（8 处）；⑤ 未采纳「`declared` 改名」（要动 ~8 处且与既有术语耦合）⇒ 改在 D5 写**两态不变式**（机器可分才是实质）；⑥ 已采纳「`unmanifested` 允许迁移边」 |
| critic（增量 3，第 4 轮） | `APPROVE_WITH_CONDITIONS`（无 BLOCKER，2 SHOULD_FIX） | ① M7③ 的「**同时根治** exempt/declared/retired 的悬空指针洞」是**高估陈述**（M7③ 的主体只校验 `unmanifested`）⇒ 二选一：改措辞，**或**上提为独立 **M8**（指针闭集校验对**全部状态**生效）⇒ **采纳 M8**（成本低、真的堵住洞）；M2 保留 `active` 专属的「== 清单 `adr`」；② D3 的「`unmanifested` 仅限 baseline」**未如实登记其不可机判性**（评审面约束，机器判不了「新增 ADR 冒充存量」）⇒ 补登记 + 新增 **U9** |

**本轮净结论**：状态机 = `{declared, unmanifested, active, retired, exempt}`；`declared`（watch 指向**未来**路径）与 `unmanifested`（watch 指向**现有**路径）是**机器可分的对偶**；`unmanifested` = **债**（逐机制债指针 `pending/<mechanism>.md` + 在跑锚点）**不是豁免**；指针闭集校验上提为 **M8**（全部状态）。

## 6d. 增量审查 4（第 5 轮，**用户批准**：2026-11-21）—— L2 实施落地后的口径收口

**动因**：L2 **实施已落地**（`6c79142` 实施 + `8edb45a` 证据回填 + `8b44b0a` 哈希口径 + `613401c` 重跑演练）⇒ ADR（决策真源）与可执行形态（`lib/rollback-registry.ts`）出现**三处口径分歧** ⇒ 必须收口，否则「决策真源与实现各说一半」。

| 轮次 | 结论 | 处置 |
|---|---|---|
| oracle（增量 4） | `APPROVE` | 四问全闭合：① `proving` 的逃逸**价值**低（要停在该态必须先写过 M5 的真清单，只差一次 drill）+ census/评审兜底够用 ⇒ **不加**债指针第二前提（与 `unmanifested` 语义重叠、只加文件不加上限）；② M9 与 M2/M7/M8 是**正当的按状态分派**（实现里 `proving` 分支报 M2 code ⇒ 无第二真源）；③ V8 的严格性下降与「手改哈希」是**同一逃逸面**（已三处登记），把 `sha` 纳入哈希输入**自指不可行**；④ 转 `Accepted` 依据充分（V14/V11 已落地，U10 属**登记项**而非未落地项）。**采纳两条建议**：`contentHash` 加**递归 key 排序**（兑现「规范化」承诺）+ 清掉 ADR 里残留的旧「不区分 key 序」深比较文案 |
| critic（增量 4，第 5 轮） | **REJECT**（1 BLOCKER + 1 SHOULD_FIX + 2 NIT） | **BLOCKER**：M1 第二子句仍写「`state=active` 的 mechanism 全集」，而 V1/V14/D5/M9/实现都按 `active`∪`proving` 判 ⇒ **文档内同一判据两套口径**（照 M1 改实现会把 `proving` 的清单判成孤儿文件 ⇒ 恒红 ⇒ 自举死锁复活）⇒ M1 改为 `state ∈ {active, proving}` + 写明「与 V1/V14/D5/M9 同口径」；SHOULD_FIX：Status/修订行混入过程日志（逐轮审查史 / 轮次计数 / SHOULD_FIX 闭合清单）⇒ **瘦身**，版本史归本报告与 changelog；NIT ×2：V11 括号重复、D7 操作口径仍写「回填 `sha`」⇒ 改「回填证据（`last_drill` 整组）」 |
| critic（复审，验 BLOCKER 闭合） | **REJECT**（1 BLOCKER + 1 SHOULD_FIX + 2 NIT） | 上轮 BLOCKER **已真正闭合**（六处同口径：M1 / V1 / V14 / D5 标题与表行 / M9 / 实现；全文无「只算 `active`」的旧口径残留）。**新 BLOCKER**：ADR 本轮已声明「规范化 = **递归排序 key** ⇒ 键序无关」（两处），但**实现侧那一半尚未落地**（`contentHash` 仍是 `JSON.stringify` ⇒ 保文件键序 ⇒ **键序敏感**）⇒ 决策真源与实现再次各说一半 ⇒ 闭合路径二选一：① builder 批次落地实现 + 同批重算 5 份哈希；② 撤回 ADR 的两处断言。**采纳 ①**（`8b44b0a` 已落地 + `613401c` 重跑演练并回填证据）。SHOULD_FIX：D4 的「只允许 `active`」与「先落 `proving`」字面互斥 ⇒ 改为「只允许 `active` / `proving`（带清单）或闭集 `exempt_class`」；NIT ×2：修订行残留的过程句、V11 的接龙歧义 ⇒ 均已清 |

**本轮的净结论**：状态机 = `{declared, unmanifested, proving, active, retired, exempt}`（**六态**）；`proving` = **过渡态**（解自举死锁：机制落地的那个 commit 里，`declared` 的落地 tripwire 与 `active` 的证据必填**互斥** ⇒ 证据必然晚一个 commit）；V8 = **内容哈希**（去掉 `last_drill` 后**规范化（递归排序 key）** ⇒ 键序无关、零 git、零成本、不占真实仓预算、无自指回归）；baseline = **5 active / 10 unmanifested / 1 exempt / 0 declared**（存量上只放过 **1** 条豁免）。

**实施期的完整证据链**（均可复验）：
① `6c79142` 实施（registry 16 条 + 守卫 17 例 + 10 份债指针 + 自清单）；② 5 份清单隔离副本演练**全部 PASS**；③ `8edb45a` 证据回填（自机制转 `active`）；④ 退役副本 `bun test tests/` = **1032 pass / 1 skip / 0 fail**（1033 用例 / 29 文件）⇒ **退役本机制后仓库仍自洽**；⑤ `8b44b0a` 落地「递归排序 key」+ M7 全状态卫生 + 两条新判别力用例（19 例）；⑥ `613401c` 按新口径**重跑** 5 份演练并回填证据（基线 `8b44b0a`）。

## 6e. 增量审查 5（第 6 轮，**用户批准**：2026-11-21）—— 清存量债：**组清单**能力 + baseline 按组

**动因**：清 10 条存量债的实测给出**组**这个粒度 —— 机制之间存在**不可拆的内核耦合**（`cancel` 调用 `waitStopped` 与 `releaseSlotAuthorized`；`markCancelPending` 是 MB 的 reconcile 排除条件）⇒ 「一机制一清单」的 1:1 模型**表达不了**。

| 轮次 | 结论 | 处置 |
|---|---|---|
| oracle（增量 5） | **REJECT**（1 阻断 + 3 建议） | **阻断项**：M2 / V15 的相等子句只 scope 到 `active` ⇒ 与 M9（`proving` 的 `adr_primary` ∈ 声明集）在「还没转 `active`」的中间态**互斥** ⇒ 按 ADR 自己规定的两提交路径（`proving → active`）**债永远还不清** ⇒ 两处 scope 改为 **{active ∪ proving}** + M9 的谓词措辞与 M2 分开；建议 1：写死组清单的 `adr`（单值）= 组内核引入 ADR、其余进 `adr_related[]`（机器只判并集 ⇒ 单值归属是**约定**不是判据）；建议 2：U11 rubric 写实（调用点行号级证据 + 反向代价确认；**不设** watch 交集机判 —— 耦合走**调用链**不走 watch 锚点）；建议 3：把「是否该报 `no-single-baseline`」固化为 **T1/T2/T3 三测**（教学原生 / 删后可达性 / 依赖归属）⇒ U12。**已排除**（不必再提）：watch 交集机判（不 sound）、成员落点计数（无阈值原理）、`members[]`（第二真源）、两条豁免改回写清单（删后状态**从未存在过** ⇒ 目标态是新设计而非历史态）、Status 订正走完整审稿（纯事实订正三门槛已满足） |
| critic（增量 5，第 6 轮） | `APPROVE_WITH_CONDITIONS`（无 BLOCKER，1 SHOULD_FIX + 2 NIT） | **SHOULD_FIX**：D4 的豁免论证链缺两环 —— 「连带回退」**推不出**「清单做不到」（清单本就能多文件删除）⇒ 真正的决定性理由是 ① **教学面原生 ⇒ 没有 `find/replace` 形态**（实测 39 处红 + 引用悬空）② **连带面落在 `active` 机制上 ⇒「回退到先前状态」的前提不成立** ⇒ 补进 D4；NIT ×2：计数口径矛盾（ADR 写「7 个」vs 证据文件与 grep 实测「8 个」⇒ 统一为 8 并写明含机制自身 2 个 ⇒ 外部依赖方 6 个）、选项表补被否的「人读组声明」（F 行） |

**本轮的净结论**：registry 支持 **1:N 的组清单**（条目加 `manifest_ref`；M1 按**去重引用集**比；M2/M9/V15 的 scope 一律 **{active ∪ proving}**）；baseline = **8 条债合 3 组**（G1 delegate 槽位/停机/归属/取消释放内核链 4 条、G2 knowledge+delivery 2 条、G3 role_class+写集 2 条）+ **2 条判为「退役 = 重写」⇒ `exempt` / `no-single-baseline`**（证据 `.rddf/reviews/rollback-exempt-role-identity-canonical.md`，含 **T1/T2/T3** 评审 rubric）；另订正 `ADR-canonical-root-normalization` 的 Status（自述「未实施」与事实矛盾）。

## 6f. 增量审查 6（第 7 轮，**用户批准**：2026-11-21）—— 清单的**结构化退役** `retire[]`

**动因（实施期实测）**：G1 组清单在 `proving` 阶段**无法通过 drill** —— ① `proving` 要求 `watch[]` 每条当前存在（`lib/rollback-registry.ts:439-446`），而该清单的退役面正是删掉那两个 watch 文件（`lib/delegate-async.ts`）⇒ M7 恒红；② 清单唯一能改 registry 的手段是字面 `find/replace`，而 `find` 必须锚定条目**当前状态文本**（`proving`/`active` 随证据流转）⇒ **状态自指**（实测：锚 `proving` 的 find 在回填证据转 `active` 后命中 0 次）。取证全文见 `.rddf/reviews/rollback-g1-discovery.md`（隔离 clone 里把 4 条临时置 `active` 后同一份清单 ⇒ 877 pass / 0 fail）。

**用户裁决**：路径 A（清单加结构化 `retire[]`），否决 B（放宽 M7）/ C（反序证据流）。

| 轮次 | 结论 | 处置 |
|---|---|---|
| oracle（增量 6） | **APPROVE**（0 阻断 + 4 中等 + 1 可选） | **中等 1**：D5 与 V16 的约束编号不一致（D5 四条 / V16 五条且错位）⇒ 统一为**六条并逐条对齐**（V16 为真源回改 D5）；**中等 2**：`retired_evidence` 双口径（旧 D5「notes 指向的评审报告」vs 新「= `adr_primary`」）⇒ 回改旧 bullet：机读字段恒 = `adr_primary`（退役依据出处），演练/评审报告走 `notes` + git 历史，**两者不同物**；**中等 3**：钉死校验时序（校验材料 = **应用前**的 registry 原文，在 `edits` 模拟之前）+ 新增 **⑥ `edits` 不得触碰 `registry.json`**（同一文件两条写入胜负未定义）；**中等 4**：在 U10 增 **③ `retired_at` 的真实性不可判**（禁止搬运旧 drill 副本产物）；**可选**：把 ⑤ 的例外身份锁到 `mechanism == rollback-manifest-enforcement`（并明确该清单同时声明 `retire[]` ⇒ 红） |
| critic（增量 6，第 7 轮） | `APPROVE_WITH_CONDITIONS`（**0 BLOCKER**，2 SHOULD_FIX + 3 NIT，`mergeable: yes` / `scope_exceeded: false`） | **SHOULD_FIX 1**：`retire[]` 与 **D6 单向树**的关系未定位（严格读 D6「registry → 清单」会把它判成反向边；第 6 轮否 F 时引的正是 D6）⇒ D6 补一条：`retire[]` 只是**退役操作声明**（按 mechanism 身份，不读内容），状态真源仍只在 registry，且 ⑤⑥ 把写通道收敛为唯一一条 ⇒ 是**收窄**不是反向边；**SHOULD_FIX 2**：被否的 B/C 未登记进选项表（与本文第 5/6 轮补 E/F 的惯例不一致）⇒ 补 **G（放宽 M7）/ H（反序证据流）** 两行 + 否决理由；**NIT**：① 抬头「V16 的 ①–⑤」→ ①–⑥；② `retire[]` 组内重名 ⇒ 红（fail-closed 写实）；③ 补 `active → retired` 的显式迁移边 |

**审查结论**：0 BLOCKER ⇒ 不触发复审；2 SHOULD_FIX + 3 NIT **全部在本文已处置**（见上表「处置」列的落地文本）。

**本轮的净结论**：清单 schema 加 `retire?: string[]` —— drill 在隔离副本里按**结构**（不做文本替换）把 `retire[]` 列出的条目转 `retired`（`retired_at` = 执行日、`retired_evidence` = 该条目 `adr_primary`、撤 `watch`/`manifest_ref`/`pending_backlog`）；**六条 fail-closed 约束**（存在可解析 / 条目存在且不重名 / 来源态 ∈ {active, proving} / 同清单归属 / 与删 registry 互斥 / 与 edits 碰 registry 互斥），校验材料 = **应用前**的 registry 原文；退役完整性由 **M1 孤儿清单判据**兜住（不另设判据）；`retired_at` 真实性登记为 **U10③**（弱判据）。**实现（`lib/rollback-drill.ts`）+ G1 清单改写 + 负例测试 = 下一批 builder**。

## 6. 本报告的边界

- 本报告是**誊写**：审查者（metis / oracle / critic）的原文不在本文件内，只保留**结论与逐条处置**；过程细节以各轮 subagent 输出为准（不进决策文档，符合「正文三层分离」）。
- 审查者只读；本报告的写入者是 architect。

