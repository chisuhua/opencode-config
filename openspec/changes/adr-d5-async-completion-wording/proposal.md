# adr-d5-async-completion-wording — ADR D5「完成通知」措辞与工具契约不一致

> 输入：`.rddf/improvements/adr-d5-async-completion-wording.md`（5 段草稿，metis 1 轮审后修订）
> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D5，**Accepted**）—— **本 change 是既有 ADR 的描述性措辞修订，不是新决策**
> 来源：oracle（`resume-precheck-guidance` 的 prompt 评审第 1 条 finding）+ critic（第二审 SHOULD_FIX 2）
> 性质：**ADR 措辞 1 行 + spec 注 + 守卫 + 两处治理面口径**（跨 `docs/adr/**` / `prompts/**` / `tests/**`）
> 执行路径：**常规 change**（治理面 ⇒ oracle → critic 各 1 轮）；ADR 落笔由 **architect** 承担，prompts / 守卫由 **builder** 实施
> **扩展说明（2026-11-14）**：本 change 原只做「ADR D5 措辞修订」；现合并同主题的三个遗留项 —— ① 删 `prompts/plan.md` 的临时消歧句（**必须在 ADR 措辞修正之后**，否则消歧句的前提消失而 ADR 仍说旧话）② §治理面作用域表 对本仓 `docs/adr/**` 的归属裁定 ③ 「Accepted ADR 的描述性措辞修订」的判例规则化（防同类漂移复发）。三者与原目标同主题（**架构类文档的落点与治理归属**）⇒ 合并为一个 change、一次双审。
> planner 审查：metis 1 轮（`.rddf/reviews/adr-d5-async-completion-wording-planner-review.md`）
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置（`.arch-handoff.json` / `.planner-handoff.json`）不存在 ⇒ 按工件归属规则第 3 条走**内置流程**。

## Why

`docs/adr/ADR-backend-handoff-role-class.md` 的 D5「识别」条目有一句**描述性措辞**与工具契约不一致：

- **ADR 现状**：「异步路径在**完成通知**后 `rddf feedback list`（权威）+ `sessions` 确认 `idle`」。
- **工具契约**：`dispatch` 返回 ≠ 任务完成、**没有推送通道**；异步面的观察点是「用户回来」或「主会话下次读 `sessions` 观测到 `running=false` 且 `state=idle`」。
- **性质澄清**（oracle / critic 一致判定）：D5 的**可操作决策**（不新增状态 / 工具 / outcome 值；`rddf feedback` 记录为唯一权威；选项 E「新增 `handoff_pending` 状态 + 新工具」被否）本身就是「**没有**完成通知通道」的来源 ⇒ 矛盾只在 ADR 自身的**描述性措辞**与其机制决策之间，**不是**「已签批 ADR 与实现冲突」。

为什么值得立项（不只是「会被误读」）：按字面等待一个**不存在**的通知，agent 会停在那里直到用户介入 —— 失败模式是**卡死**，不只是理解偏差。同一措辞也残留在 `.rddf/reviews/backend-handoff-protocol-spec.md`（该文件自定「裁定表是唯一口径」，`:45` 是**被自家裁定表否决的残留正文**）。

## What Changes

### A. ADR D5「识别」条目改写（**逐字目标文本**）

> `- 识别：同步路径看 `summary.last_assistant_text` 首行（**triage 提示，不作门禁**）；异步路径**没有完成通知** —— 由用户回来、或主会话下次读 `sessions` 观测到 `running=false` 后，再读 `rddf feedback list`（记录为唯一权威）。⚠ **不必等 `state=idle`**：槽位释放是 **reconcile-on-read**（惰性），自然完成后 `state` 可能仍为 `active`；此时 `running=false` + `outcome=succeeded` 即足以继续，**不得因 `state` 未翻转而等待**。`

- 「完成」不作为名词出现（ADR 标题是「handoff = 自然结束」，`prompts/plan.md` 写的是「没有完成信号」）⇒ 三种说法收敛为一种**纯观测式**表述。
- **不必等 `state=idle`**（`state` 与 `running` 是两列，且槽位释放是 **reconcile-on-read 惰性** ⇒ 自然完成后 `state` 可能仍为 `active`）：`running=false` + `outcome=succeeded` 即足以继续 —— 2026-11-14 oracle 修正：原口径要求 `state=idle`，而该条件在惰性释放下可能永不满足（与本 change 要消灭的「字面等待 → 卡死」同型）。
- 决策内容、选项对比表、后果章、Verification 章**不动**（`git diff --numstat` 应为 `1 1`）。

### B. 修订可追落点

在 D5「识别」条目行尾加一句 `（D5 措辞修订 2026-11-14：澄清「完成」= 轮询观测，无决策变更）`；**Status 行文本保持不变**（避免「元数据头膨胀」这条既有 SHOULD_FIX）。另在 `docs/CHANGELOG.md` 记一条。

### C. spec 文件用注不改写

`.rddf/reviews/backend-handoff-protocol-spec.md:45` **保留原文**，行尾追加 `（v4 修订 2026-11-14：异步面无推送通道，删「完成通知」表述；口径见 R-11）`，并在该文件的自定口径段补 `v4 = v3 + 本行注`（保住 v3 的审计痕迹）。

### D. 守卫（`tests/config-guards.test.ts`，**新增 ⇒ 属治理面 ⇒ oracle → critic 必审**）

- 切片：`const d5 = adr.split(/^### D5 /m)[1].split(/^### D6 /m)[0]`，再取以 `- 识别：` 开头的**那一行**（不扫整段、不依赖行号）。
- 断言：`expect(bullet).not.toMatch(/完成通知后/)` —— **只禁「在…后」的等待语义**，允许正确的「**没有**完成通知」表述（负向断言比语义窄，否则一句真话会被自己的守卫判红）；`expect(bullet).toMatch(/running=false/)`；`expect(bullet).toMatch(/state=idle/)`。
- **不做**「正向断言 D5 机制决策仍在」—— 防「修措辞时误删决策」用 `git diff --numstat`（`1 1`）即可验，不需要在测试里复制 ADR 语义（那是把 ADR 变成第二份被钉文本）。

### E. 审查路径（按**改动对象**分列）

| 改动对象 | 归属 | 审查 |
|---|---|---|
| `docs/adr/ADR-backend-handoff-role-class.md`（D5 识别条目 + 行尾注） | **ADR 行**（`prompts/build.md` §审查配对；`docs/adr/**` 在 §治理面作用域表右列明确排除出治理面） | **只 oracle**（「改措辞 → 只 oracle」豁免路径） |
| `.rddf/reviews/backend-handoff-protocol-spec.md` | `.rddf/**`，**不属治理面**（§治理面作用域表右列）；且它是**规格件**（非审稿报告）⇒ 不受「审查者只读」约束 | 不审，仅记录 |
| `tests/config-guards.test.ts`（新增断言） | **治理面**（§治理面作用域表：「断言增删 / 放宽 / 字段清单变更」＝改判据） | **oracle → critic**（§审查配对 的可点数判据） |
| `docs/CHANGELOG.md` | 治理面 | 随守卫那次一并由 critic 覆盖 |

⇒ **critic 必审的原因是「改了守卫」，不是因为「改了 ADR 正文」**。

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | ADR D5 的「识别」条目含 `running=false` + 「没有完成通知」+ **逃逸口径**（「不必等 `state=idle`」/「reconcile-on-read」/「outcome=succeeded」），且**不含**「完成通知后」这一等待语义 | 结构 | `tests/config-guards.test.ts` |
| AC2 | `git diff --numstat` 对 ADR 为 `2 2`（D5「识别」条目 1 行改写 + 「③ 结束回合（槽自动释放）」补半句消除字面张力）；选项对比表 / 后果章 / Verification 章 / Status 行**零改动** | 结构 | git |
| AC3 | D5「识别」条目行尾含修订标注（日期 + 「无决策变更」）；Status 文本不变 | 结构 | ADR 文本 |
| AC4 | `.rddf/reviews/backend-handoff-protocol-spec.md` 保留原文 + 行尾 `v4 修订` 注 + 自定口径段含 `v4 = v3 + 本行注` | 结构 | 该文件 |
| AC5 | 守卫断言：切片 D5 的「识别」行 + `not.toMatch(/完成通知后/)` + `toMatch(/running=false/)` + **逃逸口径三组 token**（「不必等」「reconcile-on-read」「outcome=succeeded」） | 结构 | `tests/config-guards.test.ts` |
| AC6 | oracle verdict 落 `.rddf/reviews/adr-d5-async-completion-wording-review.md`（由 architect 誊写）并被 ADR 元数据引用 | 结构 | 审稿报告 |
| AC7 | critic 对守卫改动的逐条处置记录已在当回合响应正文（治理面产出） | 结构 | 响应正文 |
| AC8 | `docs/CHANGELOG.md` 有对应条目（含 change 名）；且条目**不预先断言尚未发生的审查结论 / 归档状态** | 结构 | changelog + `tests/config-guards.test.ts` |
| AC9 | 传播面清扫：`grep -rn "完成通知" docs/ prompts/` 的命中数已记录（已知：`docs/backend-handoff-role-class.md` 与 `docs/MULTI-AGENT-DESIGN.md` 零命中，已核） | 结构 | grep 输出 |
| AC10 | 归档目录 `openspec/changes/archive/**` 内的同措辞**不判失败**（归档不可变，in-place 不改） | 结构（负向） | grep 输出 |
| AC11 | 回归：`bun test tests/` 全绿（`scripts/check-upstream-anchors.sh` 需 upstream 源码 checkout，缺失则记 **SKIP**，不判失败） | 结构 | 全量 |
| AC12 | `prompts/plan.md` 的**临时消歧句**「（ADR D5 所述的「完成」以轮询观测为准，**没有推送通道**）」**已删**（ADR 措辞修正后其前提消失）；该文件异步面 bullet 仍含「没有完成信号」+「`running=false`」，且与 ADR **同一口径**（完成判据以 `rddf feedback list` 为准 +「不必等 `state=idle`」） | 结构（负向 + 正向） | `tests/config-guards.test.ts` |
| AC13 | `prompts/build.md` §治理面作用域表**新增裁定行**：本仓 `docs/adr/**` 属 **ADR 行**（不属治理面），并写明「本仓既是配置根又是项目仓」时的读法 | 结构 | 同上 |
| AC14 | `prompts/build.md` **新增判例**：Accepted ADR 的**描述性措辞**修订走 architect 行的豁免路径（只 oracle）；豁免条件**可数**（只改同一条 bullet 的表述：不增删 bullet、不改表格行、不动章节标题 / 决策条目 / 选项对比表 / 后果章 / Verification 章 / Status 行）；同时改**守卫断言** ⇒ 治理面 ⇒ oracle → critic 必审；**非豁免修订 ⇒ 默认按「决策相关」处理 ⇒ oracle → critic**（举证责任在修订者） | 结构 | 同上 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [x] AC1 识别条目含两个观测条件、不含等待语义
- [x] AC2 diff 形状 `1 1` + 决策章零改动
- [x] AC3 行尾修订标注 + Status 不变
- [x] AC4 spec 用注 + `v4 = v3 + 本行注`
- [x] AC5 守卫断言四件套
- [x] AC6 oracle verdict 落盘并被元数据引用
- [x] AC7 critic 处置记录在响应正文
- [x] AC8 CHANGELOG 条目
- [x] AC9 传播面清扫命中数已记录
- [x] AC10 归档目录命中不判失败
- [x] AC11 回归绿（anchors 可 SKIP）
- [x] AC12 临时消歧句已删 + 异步面 bullet 正向内容仍在
- [x] AC13 作用域表新增归属裁定行
- [x] AC14 新增「Accepted ADR 描述性措辞修订」判例

## 非目标

- 不新增工具、状态字段、outcome 值、通知通道（**明确不造**完成通知）。
- 不改 D5 的任何决策条目、选项对比、后果章、Verification 章、ADR 的 Status。
- 不做「ADR 措辞判例」的规则化 ⇒ **已在本 change 内做**（AC14；原 Out of Scope 第 3 条随之关闭）。
- 不改 `prompts/build.md` 的其它条款（§角色矩阵 / §审查配对 的主体判据 / §architect 产出形态契约 的内容）；本 change 只**新增**一条作用域裁定行与一条判例。

## Out of Scope（本 change 不做，登记为 backlog）

| 缺口 | 为什么不在本 change |
|---|---|
| ~~`prompts/plan.md`「交回后的收尾三问」里的临时消歧句的删除~~ | **已并入本 change**（AC12）—— 前提是本 change 的 ADR 措辞修正先落地 |
| §治理面作用域表里「项目仓库 `docs/adr/**`」与本仓（配置根同时是项目仓）`docs/adr/**` 的归属未裁定 | 属作用域**表格行增改** ⇒ 治理面 ⇒ oracle + critic ⇒ 不在本 change 顺手做 |
| ~~「Accepted ADR 的描述性措辞由谁改、走哪条审查」的**判例**本身~~ | **已并入本 change**（AC14） |

## 影响面与风险

| 面 | 影响 |
|---|---|
| `docs/adr/ADR-backend-handoff-role-class.md` | D5「识别」条目 1 行改写 + 行尾修订注 |
| `.rddf/reviews/backend-handoff-protocol-spec.md` | 1 行行尾注 + 自定口径段 1 行 |
| `tests/config-guards.test.ts` | 新增 1 条断言（**属治理面 ⇒ 触发 oracle + critic**） |
| `docs/CHANGELOG.md` | 1 条条目 |
| 行为 | **无运行时变化**（纯文档 + 守卫） |
| 代价 | 一次 ADR 措辞修订 + 一次守卫的治理面双审 |
| 风险 | 修措辞时误删决策内容 ⇒ 由 `git diff --numstat` 形状判据兜住 |

## 依赖与顺序

1. 依赖 `resume-precheck-guidance`（已归档）—— 它的小节按「无完成信号」写，本 change 把 ADR 侧对齐到同一口径。
2. 顺序：ADR 措辞修订 ⇒ spec 同步 ⇒ 守卫 ⇒ 回归。
3. 执行路径：**常规 change**（跨 ADR / prompts / 守卫 ⇒ 治理面双审）；顺序：ADR 措辞修正 → 删 plan.md 消歧句 → 作用域表裁定 + 判例 → 守卫 → 回归。
