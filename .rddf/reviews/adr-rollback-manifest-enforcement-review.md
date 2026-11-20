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

## 6. 本报告的边界

- 本报告是**誊写**：审查者（metis / oracle / critic）的原文不在本文件内，只保留**结论与逐条处置**；过程细节以各轮 subagent 输出为准（不进决策文档，符合「正文三层分离」）。
- 审查者只读；本报告的写入者是 architect。

