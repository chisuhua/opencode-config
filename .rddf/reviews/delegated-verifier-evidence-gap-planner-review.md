# planner 审查记录：delegated-verifier-evidence-gap（metis 1 轮）

- 对象：`.rddf/improvements/delegated-verifier-evidence-gap.md`（5 段草稿）
- 审查者：**metis**（planner 的固定审查者，1 轮 —— 预算上限，不复审）
- 日期：2026-11-13
- 结论：metis 提 **12 条**（P0×5 / P1×5 / P2×2）⇒ **全部处置**，草稿已按建议重写

## P0（不修则计划会做错或做偏）

| # | finding | 处置 |
|---|---|---|
| 1 | **Why 的因果缺机制证据**：`no_work_evidence` 不兜底 —— 判据是 `(final_is_role_opening \|\| model_switched) && write_tool_calls === 0 && artifacts === 0`（`lib/delegate-core.ts::summarizeDelivery`）；verifier 落一份报告 ⇒ `write_tool_calls ≥ 1` ⇒ 恒 false ⇒ 「写无证据的 pass 报告」机器侧不会被抓；`build.md:303` 的「0 工具调用判 pass = 作废」是文本禁令、无执行点，且未规定「作废之后往哪走」 | **已补**：Why 直接引用该判据式与「无执行点」事实；What Changes 1 明确「只补『作废之后往哪走』，不改既有判据来源与证据要求」 |
| 2 | **「三类统一 blocked」是错的**：builder 的逐 change 验收审查者是 **verifier（角色内建，非 subagent）**、verifier 的 `explore` 仅用于定位（可自读降级）⇒ 二者不因 subagent 不可用而受阻；且逐类后果应在**一处**定义，例外段只做指针（避免第二套判据） | **已改**：Why 增「边界澄清」段；What Changes 2 改为「逐类后果只在『被派发后端的运行身份与交回契约』定义」，例外段复述改成指针句 |
| 3 | 「无法取证」**不可判定**：「测试跑不起来」可能是环境（blocked）也可能是本次变更引入的 failure（ac-fail） | **已补**：What Changes 1 增基线对照判据（同一命令在不含本 change 的基线上也失败 ⇒ blocked；仅本 change 失败 ⇒ ac-fail），基线取不含本 change 的 HEAD |
| 4 | 「无法取证」是**任一条**还是全部？两种 kind 的**优先级**未定；已取得的证据落哪未定；与「受阻不得落审稿报告」冲突 | **已补**：任一判据不可取证 ⇒ 整份不得判 pass；kind 优先级（有不通过 ⇒ `ac-fail`，第④项写明哪些判据未取证；无任何可判定 ⇒ `blocked`）；两种都**不落**报告，证据写进 feedback 第④项 |
| 5 | Impact 风险行**错引**：`resume-precheck-guidance` 的证据优先级解决「读哪条证据」，**不解决**「判 ac-fail 还是 blocked」 | **已改**：Impact 风险行改为「未覆盖：现有证据优先级只解决『读哪条证据』，不解决分类 ⇒ 分类靠 feedback 5 项正文第③项的必填措辞」 |

## P1（影响可验收性 / 一致性）

| # | finding | 处置 |
|---|---|---|
| 6 | 新段只做指针、不重述证据要求 ⇒ 防止与 `build.md:303` 形成第二套标准 | **已采纳**：What Changes 1 前置句「只补『作废之后往哪走』，不改既有判据来源与证据要求，避免第二套标准」 |
| 7 | Acceptance 不可判（方向 + 「待立项时写入」）；现守卫 section 级 `toContain` 会**恒绿**；缺「未新增」机读判据；缺 kind 集合判据；缺分类锚点；缺部分取证判据；缺负向断言；缺自指审查与 critic 义务判据；「23/23」会漂移；手工 AC 无载体 | **已改**：Acceptance 重写为可判表 —— 逐类共现（同 line）、kind 集合**从 §HANDOFF 契约动态抽取**、未新增三判据（diff 白名单 + token allowlist + `SLOT_STATES`/outcome 集合不变）、负向（`explore` 与 `blocked` 不得同行 + 既有三条断言保留）、可 grep 锚点（基线/任一判据/不落）、回归写**退出码 0**（不写死 23/23）、手工 AC 落 `.rddf/reviews/<change>-acceptance.md` 可 grep |
| 8 | 手工 AC 无载体 | **已采纳**：同上（回放记录落文件，含输入命令 + 输出首行 + 5 项） |
| 9 | 缺自指审查声明（改的是 §审查配对 本节自身）与 critic 必审判据（改守卫断言 ⇒ 治理面 ⇒ critic 必审） | **已补**：头注加自指审查声明；「依赖与顺序」第 3/4 条写明 |
| 10 | 头注不实：依据应为 D5 + prompt-review 的「待立项」条目；metis 评审路径当时不存在 | **已改**：头注改为「D5 handoff 形态 + `.rddf/reviews/backend-handoff-role-class-prompt-review.md` 的待立项条目」；metis 路径指向本轮实际产出的评审记录 |

## P2（划界，避免下一轮再开一项）

| # | finding | 处置 |
|---|---|---|
| 11 | 两条相邻缺口：`verifier` 命中 `rdd-verifier` 分流三条件时写 `.rddf/state/verifier/*` **越类**；`builder` 能否落 §审查配对 架构面 critic 的产出去向 `.rddf/reviews/`（builder 写集未含该目录） | **已列为 Out of Scope + backlog**，各给「为什么不在本项」（前者属产品侧 skill 与类写集对齐、后者属类写集设计/权限面改动） |
| 12 | 缺不变式声明：本项**不加机读校验**，「报告里是否真有证据」仍靠 prompt + 人工 ⇒ 伪造 pass 的**机器**面不变 | **已补**：Capabilities 段末的「⚠ 不变式声明（防高估收益）」 |

## 备注（metis 自述的取证限制）

metis 本轮**未执行任何命令**（shell 权限被拒），结论基于 `read` / `grep` / `glob` 静态取证；其引用的事实（`summarizeDelivery` 判据式、`isResume` 免检、`build.md:303` 文本禁令、`rdd-verifier` 写集冲突）由本回合在草稿重写时**逐条复核**（`lib/delegate-core.ts` 的 `summarizeDelivery`、`prompts/build.md` 的 §verifier 产出契约与 §被派发后端写集表）。
