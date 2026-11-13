# adr-d5-async-completion-wording — ADR D5「完成通知」措辞与工具契约不一致

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D5，**Accepted**）—— **本项是既有 ADR 的描述性措辞修订，不是新决策**
> 来源：oracle（`resume-precheck-guidance` 的 prompt 评审第 1 条 finding）+ critic（`resume-precheck-guidance` 第二审 SHOULD_FIX 2）
> 关联 change：`openspec/changes/adr-d5-async-completion-wording/`（**已立项** 2026-11-13；逐条判据以该 change 的 proposal AC 表为唯一真源。ADR 元数据「关联 change」仍指向 `backend-handoff-role-class`，**不新增 `backlog:` 占位**）
> planner 审查：metis 1 轮（`.rddf/reviews/adr-d5-async-completion-wording-planner-review.md`）
> 执行路径：**rdd-quick**（纯文档 1 行 + 1 条守卫；无公开 API / 无运行时行为 ⇒ 不新建 openspec change、不开 worktree）；ADR 落笔仍由 architect 承担。

## Why

`docs/adr/ADR-backend-handoff-role-class.md` 的 D5「识别」条目有一句**描述性措辞**与工具契约不一致：

- **ADR 现状**：「异步路径在**完成通知**后 `rddf feedback list`（权威）+ `sessions` 确认 `idle`」。
- **工具契约**：`dispatch` 返回 ≠ 任务完成、**没有推送通道**；异步面的观察点是「用户回来」或「主会话下次读 `sessions` 观测到 `running=false` 且 `state=idle`」。
- **性质澄清**（oracle / critic 一致判定）：D5 的**可操作决策**（不新增状态 / 工具 / outcome 值；`rddf feedback` 记录为唯一权威；选项 E「新增 `handoff_pending` 状态 + 新工具」被否）本身就是「**没有**完成通知通道」的来源 ⇒ 矛盾只在 ADR 自身的**描述性措辞**与其机制决策之间，**不是**「已签批 ADR 与实现冲突」。

为什么值得立项（不只是「会被误读」）：按字面等待一个**不存在**的通知，agent 会停在那里直到用户介入 —— 失败模式是**卡死**，不只是理解偏差。同一措辞也残留在 `.rddf/reviews/backend-handoff-protocol-spec.md`（该文件自定「裁定表是唯一口径」，`:45` 是**被自家裁定表否决的残留正文**）。

## What Changes

1. **ADR D5「识别」条目改写**（**逐字目标文本**，避免两个实施者写出两句不同的话）：

   > `- 识别：同步路径看 `summary.last_assistant_text` 首行（**triage 提示，不作门禁**）；异步路径**没有完成通知** —— 由用户回来、或主会话下次读 `sessions` 观测到 `running=false` **且** `state=idle` 后，再读 `rddf feedback list`（记录为唯一权威）。`

   - 「完成」不作为名词出现（ADR 标题是「handoff = 自然结束」，`prompts/plan.md` 写的是「没有完成信号」）⇒ 三种说法收敛为一种**纯观测式**表述。
   - `running=false` **且** `state=idle`（不是「或」—— `state` 与 `running` 是两列，单看一列会误判）。
   - 决策内容、选项对比表、后果章、Verification 章**不动**（`git diff --numstat` 应为 `1 1`）。
2. **修订可追落点**：在 D5「识别」条目行尾加一句 `（D5 措辞修订 2026-11-14：澄清「完成」= 轮询观测，无决策变更）`；**Status 行文本保持不变**（避免「元数据头膨胀」这条既有 SHOULD_FIX）。另在 `docs/CHANGELOG.md` 记一条。
3. **spec 文件用注不改写**：`.rddf/reviews/backend-handoff-protocol-spec.md:45` **保留原文**，行尾追加 `（v4 修订 2026-11-14：异步面无推送通道，删「完成通知」表述；口径见 R-11）`，并在该文件的自定口径段补 `v4 = v3 + 本行注`（保住 v3 的审计痕迹）。
4. **守卫**（`tests/config-guards.test.ts`，**新增 ⇒ 属治理面 ⇒ oracle → critic 必审**）：
   - 切片：`const d5 = adr.split(/^### D5 /m)[1].split(/^### D6 /m)[0]`，再取以 `- 识别：` 开头的**那一行**（不扫整段、不依赖行号）。
   - 断言：`expect(bullet).not.toMatch(/完成通知后/)` —— **只禁「在…后」的等待语义**，允许正确的「**没有**完成通知」表述（负向断言比语义窄，否则一句真话会被自己的守卫判红）；`expect(bullet).toMatch(/running=false/)`；`expect(bullet).toMatch(/state=idle/)`。
   - **不做**「正向断言 D5 机制决策仍在」—— 防「修措辞时误删决策」用 `git diff --numstat`（`1 1`）即可验，不需要在测试里复制 ADR 语义（那是把 ADR 变成第二份被钉文本）。

### 审查路径（按**改动对象**分列，消除「豁免 vs 必审」的矛盾）

| 改动对象 | 归属 | 审查 |
|---|---|---|
| `docs/adr/ADR-backend-handoff-role-class.md`（D5 识别条目 + 行尾注） | **ADR 行**（`prompts/build.md` §审查配对；`docs/adr/**` 在 §治理面作用域表右列明确排除出治理面） | **只 oracle**（「改措辞 → 只 oracle」豁免路径） |
| `.rddf/reviews/backend-handoff-protocol-spec.md` | `.rddf/**`，**不属治理面**（§治理面作用域表右列）；且它是**规格件**（非审稿报告）⇒ 不受「审查者只读」约束 | 不审，仅记录 |
| `tests/config-guards.test.ts`（新增断言） | **治理面**（§治理面作用域表：「断言增删 / 放宽 / 字段清单变更」＝改判据） | **oracle → critic**（§审查配对 的可点数判据） |
| `docs/CHANGELOG.md` | 治理面 | 随守卫那次一并由 critic 覆盖 |

⇒ **critic 必审的原因是「改了守卫」，不是因为「改了 ADR 正文」**。

## Acceptance

| 判据 | 类型 |
|---|---|
| ADR D5 的「识别」条目含 `running=false` **且** `state=idle`，且**不含**「完成通知后」这一等待语义 | 结构 |
| `git diff --numstat` 对 ADR 为 `1 1`（加行尾注则 `1 2`）；选项对比表 / 后果章 / Verification 章 / Status 行**零改动** | 结构 |
| D5「识别」条目行尾含修订标注（日期 + 「无决策变更」）；Status 文本不变 | 结构 |
| `.rddf/reviews/backend-handoff-protocol-spec.md` 保留原文 + 行尾 `v4 修订` 注 + 自定口径段含 `v4 = v3 + 本行注` | 结构 |
| 守卫断言：切片 D5 的「识别」行 + `not.toMatch(/完成通知后/)` + `toMatch(/running=false/)` + `toMatch(/state=idle/)` | 结构 |
| oracle verdict 落 `.rddf/reviews/adr-d5-async-completion-wording-review.md`（由 architect 誊写）并被 ADR 元数据引用 | 结构 |
| critic 对守卫改动的逐条处置记录已在当回合响应正文（治理面产出） | 结构 |
| `docs/CHANGELOG.md` 有对应条目 | 结构 |
| 传播面清扫：`grep -rn "完成通知" docs/ prompts/` 的命中数已记录（已知：`docs/backend-handoff-role-class.md` 与 `docs/MULTI-AGENT-DESIGN.md` 零命中，已核） | 结构 |
| 归档目录 `openspec/changes/archive/**` 内的同措辞**不判失败**（归档不可变，in-place 不改） | 结构（负向） |
| 回归：`bun test tests/` 全绿（`scripts/check-upstream-anchors.sh` 需 upstream 源码 checkout，缺失则记 **SKIP**，不判失败） | 结构 |

## Capabilities

- **新增**：ADR 措辞与工具契约的一致性守卫（只禁「等待语义」这一种误读形态）。
- **不新增**：工具、状态字段、outcome 值、通知通道（**明确不造**完成通知）。
- **不改**：D5 的任何决策条目、选项对比、后果章、Verification 章、ADR 的 Status。

## Impact

| 面 | 影响 |
|---|---|
| `docs/adr/ADR-backend-handoff-role-class.md` | D5「识别」条目 1 行改写 + 行尾修订注 |
| `.rddf/reviews/backend-handoff-protocol-spec.md` | 1 行行尾注 + 自定口径段 1 行 |
| `tests/config-guards.test.ts` | 新增 1 条断言（**属治理面 ⇒ 触发 oracle + critic**） |
| `docs/CHANGELOG.md` | 1 条条目 |
| 行为 | **无运行时变化**（纯文档 + 守卫） |
| 代价 | 一次 ADR 措辞修订 + 一次守卫的治理面双审 |
| 风险 | 修措辞时误删决策内容 ⇒ 由 `git diff --numstat` 形状判据兜住 |

## Out of Scope（本项不做，登记为 backlog）

| 缺口 | 为什么不在本项 |
|---|---|
| `prompts/plan.md`「交回后的收尾三问」里的临时消歧句「（ADR D5 所述的「完成」以轮询观测为准，**没有推送通道**）」的删除 | ADR 改对后它确实冗余，但删它 = 改 `prompts/**` = 治理面 ⇒ 本项会整体升级为治理面全量双审 ⇒ 另记一条 backlog |
| §治理面作用域表里「项目仓库 `docs/adr/**`」与本仓（配置根同时是项目仓）`docs/adr/**` 的归属未裁定 | 属作用域**表格行增改** ⇒ 治理面 ⇒ oracle + critic ⇒ 不在本项顺手做 |
| 「Accepted ADR 的描述性措辞由谁改、走哪条审查」的**判例**本身 | 本仓 `docs/adr/` 12+ 篇，同类措辞漂移会复发 ⇒ 需要一条**规则**，而规则改动属治理面表格增删 ⇒ 单独立项 |
