# planner 审查记录：adr-d5-async-completion-wording（metis 1 轮）

- 对象：`.rddf/improvements/adr-d5-async-completion-wording.md`（5 段草稿）
- 审查者：**metis**（planner 的固定审查者，1 轮 —— 预算上限，不复审）
- 日期：2026-11-13
- 结论：metis 提 **14 条**（P0×6 / P1×5 / P2×3）+ 8 条边界 ⇒ **全部处置**，草稿已按建议重写

## P0（不修则计划不可执行 / 判据错误）

| # | finding | 处置 |
|---|---|---|
| 1 | 两个溯源指针**不存在**：「ADR 侧以 `backlog: adr-d5-async-completion-wording` 占位」全仓 grep 零命中；metis 评审路径当时不存在 | **已改**：头注改为「登记载体 = 本 improvement 文件（ADR 元数据『关联 change』已指向 `backend-handoff-role-class`，**不新增 `backlog:` 占位**）」；metis 路径指向本轮实际产出的评审记录 |
| 2 | 「豁免 vs 必审」两处**依据不同、结论相反**（按治理面豁免 vs 按 ADR 正文必审）；`prompts/build.md` §治理面作用域表右列明确把「项目仓库 `docs/adr/**`」排除出治理面 | **已改**：新增「审查路径按**改动对象**分列」的表（ADR 行 ⇒ 只 oracle；`.rddf/**` 规格件 ⇒ 不审；守卫 ⇒ 治理面 ⇒ oracle→critic；CHANGELOG ⇒ 随守卫），并写明「**critic 必审的原因是『改了守卫』，不是因为『改了 ADR 正文』**」 |
| 3 | **「选项 E「推送完成通知」被明确否决」引用不实**：ADR `:113` 的选项 E 原文是「新增 `handoff_pending` 状态 + 新工具」，全仓 `docs/adr/**` grep `推送`/`notify` 零匹配；该说法在草稿出现 4 次 | **已改**：全部改为「选项 E『新增 `handoff_pending` 状态 + 新工具』被否 + 不新增 outcome 值 ⇒ 结论就是没有完成通知通道」 |
| 4 | 缺「改完的句子长什么样」⇒ 两个实施者会写出两句不同的话 | **已补**：What Changes 1 给出**逐字目标文本** |
| 5 | 守卫若写成「整段不含完成通知」是**否定式自伤**（正确的「**没有**完成通知」会被自己的守卫判红） | **已改**：断言改为 `not.toMatch(/完成通知后/)`（只禁等待语义）+ `toMatch(/running=false/)` + `toMatch(/state=idle/)`；切片到「识别」那一行 |
| 6 | 「正向断言 D5 机制决策仍在」会把 ADR 变成**第二份被钉文本**（用测试解决审查职责） | **已改**：删掉该正向断言，改用 `git diff --numstat` 形状判据（`1 1`） |

## P1（判据可追、边界封闭）

| # | finding | 处置 |
|---|---|---|
| 7 | 「修订可追」若落进 Status = 主动制造一条既有 SHOULD_FIX（元数据头膨胀） | **已改**：修订标注落 D5「识别」条目行尾；AC 明确「Status 文本不变」 |
| 8 | spec 文件应**用注不改写**（`:45` 是被自家裁定表否决的残留正文，直接改写会抹掉 v3 审计痕迹） | **已改**：保留原文 + 行尾 `v4 修订` 注 + 自定口径段补 `v4 = v3 + 本行注` |
| 9 | AC 缺：改动形状判据、审查落点（verdict 落 `.rddf/reviews/adr-d5-async-completion-wording-review.md` 并被元数据引用）、critic 处置记录、CHANGELOG 条目、传播面清扫证据、归档目录命中不判失败 | **已补**：Acceptance 重写为 11 行，全部含落点与路径 |
| 10 | 未声明执行路径 ⇒ 默认被升级成 openspec change + worktree（过重） | **已补**：头注加「执行路径：**rdd-quick**（纯文档 1 行 + 1 条守卫；不新建 openspec change、不开 worktree）」 |
| 11 | `prompts/plan.md` 的临时消歧句去留未决 | **已决**：**不在本项**（删它 = 改治理面 ⇒ 本项会整体升级）⇒ 列入 Out of Scope + backlog |

## P2（低成本、防复发）

| # | finding | 处置 |
|---|---|---|
| 12 | §治理面作用域表对本仓 `docs/adr/**` 的归属未裁定（判例缺口） | **已列 backlog**（属表格行增改 ⇒ 治理面 ⇒ 不在本项顺手做） |
| 13 | 冗余（Capabilities 与「不改运行时代码」重复表达） | **已改**：删去重复 |
| 14 | Why 不够硬：「会被误读」不足以立项 | **已补**：Why 增「按字面等待一个**不存在**的通知，agent 会停在那里直到用户介入 —— 失败模式是**卡死**」 |

## metis 指出的边界（全部纳入草稿）

| 边界 | 处置 |
|---|---|
| Status 行膨胀 | 修订标注落 D5 条目行尾，Status 不动（AC 明确） |
| 守卫 span 未定义（「D5 段落」含未来正常解释会被判红） | 守卫只取 `- 识别：` 开头的那一行 |
| 改 spec 的历史性 | 用注不改写 + `v4 = v3 + 本行注` |
| `.rddf/reviews/` 的只读纪律只约束**审稿报告** | 草稿注明该文件是**规格件**（非审稿报告）⇒ 可改 |
| `prompts/plan.md:96` 的连带 | 不在本项，另记 backlog |
| `lib/delegate-async.ts` 6 处运行时文案「请用 sessions 确认」 | 守卫**只锚定 ADR 单文件**，不做全仓 grep 式守卫 |
| 行号漂移 | 守卫用 `### D5` / `### D6` 切片；AC 用「D5 的『识别』条目」描述，不依赖行号 |
| 审查预算 | 头注声明 metis 1 轮（总计 1 轮上限），后续复审即超预算 |

## 备注（metis 自述的取证限制）

metis 本轮 shell 权限被拒，结论基于静态取证；其引用的事实（`prompts/build.md` §治理面作用域表右列、§审查配对 ADR 行豁免、`.rddf/reviews/backend-handoff-protocol-spec.md:5` 的「裁定表是唯一口径」自定口径、`ADR:113` 的选项 E 原文）由本回合重写时**逐条复核**。
