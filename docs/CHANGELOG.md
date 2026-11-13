# Multi-Agent 设计变更日志

> 本文件记录 `docs/MULTI-AGENT-DESIGN.md` 的**历史增量**：按版本切分的权限加固史、各版本验证记录、已完成改动台账、演进日志。
>
> **当前态只看 [MULTI-AGENT-DESIGN.md](MULTI-AGENT-DESIGN.md)**——本文档不描述现状，只记录「什么时候改了什么、为什么」。

---

## 版本变更摘要

---

> **v2.18 变更摘要（2026-11-13，context-builder 收窄为「机械搬运工」）**：
> ① **问题（实测）**：310 个 critic prompt 中只有 **22 个（12%）**真正用了 context-builder 的输出；`hidden: true` 使它被 `!agent.hidden` 过滤出父模型的「Available subagents」清单（`subagent.ts:289-303`）；prompt 内 **6 处**对"缺 intent/focus 怎么办"给出互斥指令；「你返回」示例只有 6 字段（缺 `review_profile`）；文档口径互相矛盾（谁能调 / 何时调）。
> ② **收窄**：职责限定为**只搬运**（`changes_summary` / `review_profile` / `diff_or_paths` / `context` / `expected_format`）；`focus` 可推断但每条标「推断：」；**`intent` 不可推断** —— 缺失时**首行 `ERROR: missing intent`**、不产出 7 字段 prompt（可附机械字段 + "补 intent 后重发，可直接合并"）。**移除 `hidden`** ⇒ 回到选择面；description 改写为「只搬运、不推断、调用方中性」并保留「critic 的 7 字段 prompt」功能锚点。
> ③ **一致性**：prompt 内 6 处漂移源统一（`:27` / `:50` / `:89` / `:90` / `:110` / `:141` / `:197`）+ 调用方中性化（`:3` / `:15-25` / `:89` 等）；示例补 `## review_profile`（补齐到 7 字段）；`build.md` 窄条件（**大 diff >200 行 / 跨多文件 且已给 intent**）；**撤回 `plan.md:38`**（plan 无 critic 下游 —— `MULTI-AGENT-DESIGN.md:551`「plan agent 不需要审稿」、矩阵 plan→critic = ❌ ⇒ 组装出的 prompt 无消费者），并修 `:41` 的悬空引用；文档补「**可见 ≠ 可调**（front 清单可见但执行期 deny）/ 可达 ≠ 有消费者」。
> ④ **审查**：oracle `PASS-WITH-NOTES`（8 条 finding：漏 `:50`/`:197` 两处漂移源、description 未列、plan 投递环断裂、ERROR 形态细化等）→ 规格 v2 → critic `APPROVE_WITH_CONDITIONS / mergeable: yes`（3 条措辞级 SHOULD_FIX 已并入）。规格：`.rddf/reviews/context-builder-narrowing-spec.md`。
> ⑤ **验证**：`bun test tests/` **385 pass**（config-guards +2 护栏）；anchors 23/23；`opencode debug agents` 确认 context-builder 可见且 `hidden=False`。
> ⑥ **残留**：采纳率是否回升只能上线后观察（`ERROR: missing intent` 出现频率是"调用方不给 intent"的先行指标）；「plan → critic 条件配对」登记为 backlog。

> **v2.20 变更摘要（2026-11-13，收敛「两份表述漂移」并把投影纳入机械校验）**：
> ① **问题**：同一规则在两处各写一份 ⇒ 改一处、另一处静默过期。本轮实体的三例：判定词表曾有三份拷贝；`review_profile` 路径映射有**四份**（build.md 权威 + context-builder + critic 兜底 + MULTI-AGENT-DESIGN 自称权威）；`accepted roots` 在 4 处投影且**运行时真读** `PLAN_REF_ROOTS` —— 投影多写一个根，agent 会照它行动而运行时拒绝。
> ② **归属收敛**：`prompts/context-builder.md` 的路径映射表头声明**权威在 `prompts/build.md` 的「档位选择」**（自己只作兜底副本）；`docs/MULTI-AGENT-DESIGN.md` 的「本表是权威映射」改为指针 —— 现在只有 build.md 保留「权威映射」自称。
> ③ **投影收敛**：`docs/SUBAGENT-ORCHESTRATION.md` 判定词表改指针、删掉全部**编号式章节引用**（`§5.2` 等 → 改用小节标题名）、agent 表模型列写全（消除「同上」）。
> ④ **守卫**（`tests/config-guards.test.ts`，新增 9 条）：review_profile 映射**逐档比对**（**含 critic.md 那份兜底链** —— 它是消费方本尊的兜底副本，此前是漏网的第四份）且接受「指针 / 清单」两种合法形态：段内必须出现该档路径 token、映射区域内必须出现 fallback 目录集、build 档额外做**反向闭集**（副本不得多列真源没有的目录）；accepted roots 与 `PLAN_REF_ROOTS` **双向**校验（根是闭集）；`priority_blocked` 字段清单**提升为 `lib/delegate-core.ts` 的导出常量**（守卫不再手抄第二份）；agent 模型清单按**模型表表头作用域 + 表格行**定位比对；**审查链与预算**三处按「预算」列数字集合**跨文档相等**（基准 = build.md）；context-builder 的 7 字段模板字段名集 == `CONTRACTS.requiredSections`；汇总文档禁编号式章节引用；既有 metis 六节与判定词表守卫**扩展到汇总文档**。
> ⑤ **治理面作用域表**（`prompts/build.md`）扩两项：`docs/SUBAGENT-ORCHESTRATION.md`（复述各真源判据，漂移即误导）与 `tests/config-guards.test.ts` 的**断言增删 / 放宽 / 字段清单变更**（守卫即「什么算漂移」的判据本身）。
> ⑥ **顺带闭环**：`docs/MULTI-AGENT-DESIGN.md` 的「10 个独立 agent」订正为 **11 个**（补 `front`）；该文档两处**派生推论**（预算分层 / 窗口 4 条）标注真源出处。
> ⑦ **验证**：`bun test tests/` **404 pass / 0 fail**；anchors 23/23；**八条变异**均被捕获（删 context-builder 映射 token / 删 **critic.md 兜底链 token** / design 多列一个目录 `bin` / 改单行模型 / 引入编号 § / 改预算 1→2 / 文档多列一个 accepted root / 把 critic.md 的散文形态改成半角括号）。映射守卫另加**非空断言**（解析不出档位即失败）—— 否则映射形态被改坏时 token 校验会被静默跳过，守卫「已覆盖」的声明随之失真（同一根因，本轮已闭环）。
> ⑧ **审查链**：oracle `PASS-WITH-NOTES`（6 条 finding 全并入）→ critic `REJECT`（1 BLOCKER：critic.md 兜底链未真进守卫而 CHANGELOG 已声称覆盖 = 伪决策）→ 改写闭合 → critic 复审 `APPROVE_WITH_CONDITIONS / mergeable: yes`（1 条 SHOULD_FIX 非空断言已并入）。

> **v2.19 变更摘要（2026-11-13，沉淀 `docs/SUBAGENT-ORCHESTRATION.md`）**：
> ① **目的**：把本轮（oracle 判定行单一真源 + critic 评审对象边界 + metis 措辞收敛 + review_profile A/C/D + context-builder 收窄 + plan 派发主体 + D7 优先级）的**当前态**沉淀成一篇常驻文档，避免知识只散在 ADR 与 `.rddf/reviews/` 里。
> ② **文档**：`docs/SUBAGENT-ORCHESTRATION.md` —— agent 清单与模型档位 / 委派拓扑与门控（subagent 清单过滤、delegate 五工具与权限项）/ 审查链与 `review_profile` 档位（含继承式档位）/ 输入契约 L1–L5 与日志事件 / critic 的评审对象边界 / oracle 双模式与判定行 / metis 与 context-builder 定位 / delegate 通道（plan_ref / owner_agent / 单槽 / D7 优先级）/ 已知限制与残留 8 条 / 索引（8 篇 ADR + 8 份审稿记录 + 守卫清单）。
> ③ **定位声明**：该文是**汇总 + 索引**，**不是规则真源** —— 真源仍是 `prompts/*.md`、`docs/adr/*.md`、`opencode.jsonc.opencode-go`、`lib/*.ts`；若冲突以真源为准。
> ④ **验证**：`bun test tests/` 396 pass（该 commit 时点）；anchors 23/23（本文不含断言，未改真源）。

> **v2.18 变更摘要（2026-11-13，D7 派发优先级：plan 优先、但不抢占）**：
> ① **诉求**：「plan 活跃的情况下，front 不能调用 build 的后端 session」。已确认边界：作用域**保持按工作树**、**只报错不抢占**。
> ② **ADR 修订**：`docs/adr/ADR-plan-delegate-engineering-session.md` 新增 **D7**（D4 增补指向）。核心：① **D7.2** 冲突判定**富化既有占槽拒绝点**（不新建锁外预检，避免 TOCTOU 与两面活体口径漂移），holder 结构体扩 `owner_agent`；② **D7.3** 跨 owner-kind 的 **resume 硬拒**（判据用 owner-kind 而非 session id ⇒ 保住"隔天回来继续"；亡主例外复用 `frontAlive`）；③ **D7.4** 两种指名文案（被 plan 占 / 被 front 占）+ 可执行下一步；④ **D7.5** owner 亡主**不消解冲突**（只看后端活体；出口是既有亡主门控回收后再派）；⑤ **D7.6** 拒绝点落 ledger 事件 `priority_blocked`（caller_kind / holder_kind / holder_state / holder_session_id / work_root / path）；⑥ **D7.8** 跨 owner-kind 的 **cancel 硬拒**（补齐归属门控只在 suspend 路径的缺口，否则 front 可绕过优先级直接终止 plan 的活后端）。
> ③ **审查链**：oracle `PASS-WITH-NOTES`（7 条 finding 全部并入）→ critic `REJECT`（1 BLOCKER：D7.5 与 D7.2 二义）→ 修订 → critic 复审 `APPROVE_WITH_CONDITIONS / mergeable: yes`（2 条措辞级 SHOULD_FIX + 1 NIT 已并入）。
> ④ **实施**：代码（`frontAlive` **下沉到 core** 作全仓唯一实现、holder 扩 owner 字段、`describeHolderByOwner` 两文案、`appendPriorityBlocked` 拒绝点落行、delegate/dispatch/resume/cancel 四条路径的跨 owner-kind 硬拒）；prompt（`front.md` 增「占槽者是 plan 时不要 suspend、也不要 cancel」的指引；`plan.md` 增「plan 优先但不自动抢占」指引）；测试（+13：V16–V25）。
> ⑤ **验证**：`bun test tests/` **396 pass / 0 fail**；anchors 23/23；owner 判活全仓仅一份实现。
> ⑥ **残留**：① 同 owner-kind 的跨会话 resume 仍放行（"隔天回来继续"不受影响，这是有意的）；② plan 的后端转 suspended 后，front 仍可占用该工作树（plan resume 时才冲突）—— 未加规则，登记备查；③ `priority_blocked` 的线上频次统计待部署后积累。

> **v2.17 变更摘要（2026-11-13，plan 获得 delegate 派发主体 + ADR 签批）**：
> ① **问题**：plan（planner 角色）只有 `subagent`（全量 allow），**没有任何工程行动出口** —— 计划与实施之间没有可编程的交接面。
> ② **ADR**：`docs/adr/ADR-plan-delegate-engineering-session.md`（**Accepted**）—— 只扩展"谁可以派发"，不改单槽 / 归属门控 / 停机证据 / 写隔离 / grants 白名单。关键决策：D1 plan 与 front 并列放行同一 delegate 通道（顶层仍全 deny）+ plan 计划产出口径收敛到 `.rddf/plans/`；D2 派可写实施须带 **`plan_ref`**（accepted roots：`.rddf/plans/**`、`.rddf/improvements/**`、`.rddf/roadmap/**`、`openspec/changes/*/proposal.md`；**可写 ≠ 可引用**；存在性校验是强制函数、非相关性证明）；D3 `sessions` 按 **owner 过滤**（过滤只发生在 sessions 的 execute 内，`countActiveBackends` / dispatch 超限诊断保持 owner 无关）；D4 槽位仍按 `workRoot` 全局单槽；D5 `owner_agent` 落 pair/ledger（缺失按 front 解释）；D6 关闭范围。
> ③ **审查链**：oracle `BLOCK`（D2 白名单与 plan 实际产出契约不符 + "task 引用"不可判定 + 解析根未定义）→ 修订 → critic `REJECT`（1 BLOCKER：accepted roots 与 plan 实际可写路径矛盾）→ 修订 → critic 复审 `APPROVE_WITH_CONDITIONS / mergeable: yes`（2 条措辞级 SHOULD_FIX 已并入）。审稿报告：`.rddf/reviews/adr-plan-delegate-engineering-session-review.md`。
> ④ **实施**：配置（plan 放行五个 delegate 权限项 + `edit` 放行 `.rddf/plans/*.md`）；代码（`plan_ref` 校验 + `owner_agent` 写入 + `sessions` owner 过滤 + 工具描述去 front 化 + 「可写 ≠ 可引用」通则）；prompt（`plan.md` 新增「委派工程实施」章节与边界句、口径收敛；`build.md` planner 行同句）；测试（+14：plan_ref/owner 单测 8 + 派发主体与 owner 过滤集成 6；config-guards +3）。
> ⑤ **验证**：`bun test tests/` **379 pass / 0 fail**；anchors 23/23。
> ⑥ **残留**：① plan 与 front 争同一工作树会互斥（单槽，需人协调）；② `sessions` 按 owner 过滤后失去"全机后端"运维视图（候选增强 `scope: owner|all`，v1 不做）；③ 后端 session 写 `.rddf/state/role.json` 顶层镜像的展示面冲突（属残留，非权限冲突）。

> **v2.16 变更摘要（2026-11-12，critic 档位显式化 A+C+D）**：
> ① **问题**：11-03 后 182 个 critic prompt 里，显式声明 `review_profile` 的只有首审轮 **55%**、复审轮 **33%**。最伤的是复审轮——协议规定「只提交闭合证据 + 增量」，档位不在其中，而 critic 缺档位时按路径猜 ⇒ 同一 change 两轮可能用**不同判据集**，闭合验证结论不稳。
> ② **A 继承式档位**：`build.md:86` 复审协议改为「两样东西 + 一行档位」（`继承第 N 轮：<profile>`），**内容可豁免、档位不可豁免**；`critic.md:90` 复审轮缺档位时按继承声明取值，无法确定则 `mixed` 并声明。
> ③ **C 首审轮默认骨架**：`build.md:149` 明确「首审轮默认先跑 `build_critic_prompt.sh` 取骨架」（档位由脚本按路径预填），并订正脚本实际自动填的 3 个字段（原文漏了 `review_profile`）。
> ④ **D 可观测**：`Evaluation` 新增 `profileMissing`（**独立于 violations**，复审轮豁免时仍可观测）；L1/L2 日志记 `profileMissing` 并在缺失时追加 `event: "profile_missing"`，使「档位声明率」可 grep 统计。
> ⑤ **验证**：`bun test tests/` **365 pass**（新增 5 条）；anchors 23/23。**暂缓**：B（缺档位一律 mixed）、E（契约提为独立必填 + enforce）等 D 的线上数据。方案全文见 `.rddf/reviews/review-profile-improvement-plan.md`。

> **v2.15 变更摘要（2026-11-12，critic 的「评审对象边界」）**：
> ① **问题**：critic 的判据轴是**产物档位**（arch / plan / build / archive），但"评审对象必须是可签批产物、建议类产出只作上下文"这条边界只存在于设计文档与口头共识 —— critic 自己的 prompt 里没有。父模型若把 oracle 四节结论 / metis 六节 gap 分析塞进 `diff_or_paths`，critic 会拿只对决策文档成立的判据（如 arch 档「决策缺备选方案」）去评一份**结论**，产出无法落地的 BLOCKER；而 `build.md:85` 规定「只有 BLOCKER 触发返工」⇒ 白触发一轮返工并消耗「同一 change 最多 2 轮 critic」预算。
> ② **改动**：`prompts/critic.md` 新增「评审对象边界」小节 —— 评审对象须**证据自足、可签批**（ADR / proposal / 代码 / 归档增量 / 治理面规则文件等）；建议类产出只作上下文（写进 `context` 或作为 `intent` 来源）；复核建议要审**它指向的产物**、按该产物路径对应的档位；建议将被采纳则**先落成产物**再审；整份输入都是建议类 ⇒ 走**无评审对象出口**（`profile: none` + 理由，不产出任何 finding、不给 `mergeable`）。档位推断段加先后约束：推断前先过对象边界。
> ③ **审查**：oracle `PASS-WITH-NOTES`（3 条 note 全部并入：示例补"治理面规则文件等"、"全建议输入"出口、"按该产物路径对应的档位"、`:87` 先后句）→ critic `APPROVE_WITH_CONDITIONS / mergeable: yes`（2 条 SHOULD_FIX 并入：新出口同时禁 SHOULD_FIX/NITS + 定义输出形状 `profile: none`；另 1 条 NIT 标记 `scope_exceeded: true` 记 backlog —— 四档"审什么"列未接住治理面配置类对象，属既有缝隙非本轮引入）。
> ④ **验证**：`tests/` **360 pass**；anchors 23/23。**自指限制**：改的是 `prompts/critic.md` 自身，"新边界是否真会让 critic 拒绝/接受某类输入"不能由本轮审稿独立证明 —— 需后续非自指会话投喂"只含 oracle 报告、无产物"的合成输入验证。
> ⑤ **另立**：critic 档位显式率不足（首审轮 55% / 复审轮 33%，n=182）→ 改进方案见 `.rddf/reviews/review-profile-improvement-plan.md`（推荐 A+C+D，待用户定组合）。

> **v2.14 变更摘要（2026-11-12，metis 检查：stale 引用订正 + 6 节契约守卫）**：
> ① **检查结论**：metis 的"意图—能力—输出"基本自洽（6 节契约写在 `prompts/metis.md` 自己手里；89 个有文本输出的真实会话里 **85% 完整给出 6 节**；92% 的调用方自带产物路径）⇒ **不存在 oracle 那种"判定规则放错文件"的结构缺陷**。仅 3 处小问题：M1 严重度分级只写在 Rules 未进 Output 契约（实测 96% 输出自带某种分级，但三档词在全仓**零消费方**）；M2 stale 引用；M3 三处契约零守卫。
> ② **改动**：M2 `prompts/metis.md:7` 把幽灵 agent 名 `Prometheus` 订正为 `planner`（全仓 grep `Prometheus` 零匹配；planner 是 metis 的固定审查调用方，见 `build.md:419`，build 直调路径保留）；M3 `tests/config-guards.test.ts` 新增守卫：metis 的 6 节输出契约在 `metis.md`（真源）/ `build.md` 返回结构行 / `MULTI-AGENT-DESIGN.md` 卡片三处**有序全等**；M1 最终以**改措辞**关闭 —— `metis.md:31` 的三档词（`blocker / quality / nice-to-have`）改为「按优先级排序：说明哪些必须先解决、哪些可以后置」，与 Output 末节的「按优先级排序」收敛为同一判据（理由：三档零消费方、73% 会话本就用替代分级、`blocker` 与 critic 的闸门词跨界）。
> ③ **审查**：oracle `PASS-WITH-NOTES`（4 条 finding）。其中 finding 2 指出守卫是"单向包含 + 未钉顺序"，存在真实假阴性 ⇒ **当场补强**为有序全等 + 名单提取（不再逐项 `toContain`）+ 卡片搜索域收敛到 `#### metis` 段。
> ④ **验证**：`tests/` **360 pass**；anchors 23/23；三条变异（节名改动 / 节序对调 / 消费者行残留旧节名）均被守卫捕获并报出准确信息。
> ⑤ **残留**：`MULTI-AGENT-DESIGN.md:917` 文件树注释「（Markdown 六节输出）」是同一契约的散文投影，未纳入守卫（低影响，备查）；`metis.md:31` 与 Output 末节属同义复述，无守卫能抓两处分叉（叙述性文字的已知限制）。

> **v2.13 变更摘要（2026-11-12，oracle 的审查身份与判定行下沉）**：
> ① **问题**：治理面 oracle 审查 23 个样本里 **6 个（26%）没有要求判定行** ⇒ 审完了拿不到机读结论，且无机制发现。根因是判定要求写在**调用方**文档（`build.md`），执行体（oracle）不知道；同时 oracle 的 description 只写 consultant，而 critic 的 description 把"目标场景失败模式"揽走 —— 与 `build.md` 审查配对表的分工相反。另：210 个 oracle 子会话里 **75% 的调用方自己在 prompt 里重述审查框架**（措辞各异）⇒ 选择面没把能力说清。
> ② **改动**：① 两条 description 改为「oracle 先行失败模式 / critic 主审冲突（oracle 未前置时兼审）」，并限定 critic 的"architect 流程第二审"作用域；② `prompts/oracle.md` 新增「模式」段：**默认审查档**（输入带产物/判据即审查）+ 纯问答才降级咨询 + **拿不准按审查** + 判定行两种词表（治理面 / 通用）+ **BLOCK 必须有证据**（反判定通胀）；③ 判定词表**降格为单一真源**（只在 `oracle.md`，`build.md` 与 `MULTI-AGENT-DESIGN.md` 改为指针）。
> ③ **审查**：oracle `PASS-WITH-NOTES`（8 条 finding 逐条处置，5 条改变补丁形态）→ critic `REJECT`（1 BLOCKER：`MULTI-AGENT-DESIGN.md` 持有第三份词表）→ 修 → 复审 `APPROVE / mergeable: yes`。
> ④ **验证**：`tests/` **359 pass**（新增 2 条守卫：description 分工非 orphan、判定词表单一真源）；anchors 23/23；`opencode debug agents` 可见新描述。
> ⑤ **残留**：AC6「部署后审计」（复测原 6 个漏判定会话）待做 —— 它是"默认审查档是否对症"的唯一独立证据；oracle 的输入契约仍属 tasks 7.4（前置未到）。

> **v2.12 变更摘要（2026-11-12，修复 explore/librarian/title 全不可用 + 订正模型归属表）**：
> ① **症状**：explore / librarian / title 切到 `opencode-go` 后**每次调用都失败** —— `Error: Variant unavailable for opencode-go/deepseek-v4.1-flash: low`（HTTP 请求发不出去，请求根本没到 provider）。
> ② **根因**：变体由 `Variant.resolve()`（上游 `packages/core/src/variant.ts` 的 `PROTOCOLS`）按 **package** 查协议生成；models.dev 对该模型没有 variants，而自定义 provider 的 package 不在协议表里 ⇒ 变体表为空。配置里声明 `capabilities.reasoning` 会让运行时走"按能力重建变体"分支，但同样查不到协议 ⇒ 仍为空。
> ③ **修复**：`providers.opencode-go.models.deepseek-v4.1-flash` 显式声明 `variants`（`low/medium/high` → `settings.reasoningEffort`），写法照抄 kimi-code 的既有声明。**package 名保持 `@ai-sdk/openai-compatible` 不动** —— 单独把 package 改成 V2 名**不解决问题**（已实测）。
> ④ **验证**：独立进程 `opencode run --standalone --agent explore|librarian|title "只回答：OK"` 三者全部成功；本会话内 `subagent` 调 explore / librarian 也成功（能读文件、能查外部文档）。
> ⑤ **连带订正**：`docs/MULTI-AGENT-DESIGN.md` 的模型归属表此前仍写 `opencode/deepseek-v4.1-flash-free` ⇒ 已按 `opencode debug agents` + 配置解析 + 实跑三重核对订正 §2.1 / §2.3 / §5.1 / §5.2 / §5.3。**轻量链路（explore / librarian / context-builder / title）最终落到 `commandcode/deepseek/deepseek-v4.1-flash`**（Context 1,000,000†，models.dev 值）；`opencode`（内建免费）与 `opencode-go` 当前**均无 agent 声明**（后者仍是降级链候选）。
> ⑥ **残留**：`openstarry` / `minimax-cn` 仍用 V1 包名，但它们的模型没有 agent 声明变体 ⇒ 不受影响（**未改**）；免费档 HTTP 426 的限制随本次切走已不再阻塞 explore / librarian。
> ⑦ **包名统一（追加）**：`minimax-cn` 的 `@ai-sdk/anthropic` → `@opencode/ai/providers/anthropic`；`openstarry` 的 `@ai-sdk/openai-compatible` → `@opencode/ai/providers/openai-compatible`。理由：当前运行时的 provider 内置表只含 **V2** 包名（`packages/core/src/provider.ts` 的 `builtins`，61 个键全是 `@opencode/ai/providers/*`），V1 名是遗留拼写；变体协议表 `PROTOCOLS` 同样只认 V2 名。实测：minimax-cn 正常（含**工具调用**：读文件并回答）；openstarry 仍是**订阅额度不足**（403，切换前就如此，与包名无关）。**残留**：`opencode-go` 仍用 V1 名（它已显式声明 `variants`，不受影响），要统一只差一行。
> **v2.11 变更摘要（2026-11-11，新增 subagent 输入契约门）**：把 `prompts/build.md` 里「7 字段上下文契约」从**散文**变成**可判定的门**。
> ① **问题**：`subagent` 工具的 `prompt` 声明为 `string` —— 无 schema、无模板、无校验 ⇒ 父模型写什么子 agent 就收到什么；实测同一个 critic 子会话的输入有编号版 / 加粗版 / 复审版三种形态，7 字段契约只靠模型自觉。
> ② **新增**：`lib/subagent-contract-core.ts`（纯逻辑内核：规则表 `CONTRACTS` + 小节识别 5 种实测写法 + 豁免语义 + 三钩子处理函数）、`plugins/subagent-contract.ts`（宿主接线）、`scripts/audit-subagent-prompts.ts`（审计 CLI）。
> ③ **三个执行点**：L3 `session.hook("context")` 把契约注入 subagent 工具描述（父模型采样前可见，幂等）；**L1 `tool.hook("execute.before")` 硬门**（宿主唯一允许失败的钩子 ⇒ 抛错被包成受控 `Tool.Error`，父模型看到缺失项与修正指引后同回合重发）；L2 `session.hook("prompt")` 兜底**检测**（session 域钩子不可失败 ⇒ 不可拦，只能审计）。
> ④ **豁免五重收窄**：关键词（复审/第 N 轮/闭合证据）**+ 结构前置**（缺失小节 ≥ 4/7 才可能豁免）+ **任务陈述区窗口**（关键词只认 prompt 开头 400 字符）+ **状态继承**（继承"上一轮是复审模式"，不是"上一轮合规"；续接轮不清零）+ **继承需自证**（本轮自己也要引用上一轮）。前两条来自 critic 第 1 轮 SHOULD_FIX；后两条来自豁免误命中抽样（真实库 90 条豁免全量复核，误命中 12 条 = 13.3% > 10% 阈值 ⇒ 收紧；收紧后真豁免命中位置全在 47–231 字符，误命中全在 1194–5377）。
> ⑤ **灰度**：默认 **warn**（只记录 + 审计），逐 agent 可切 `enforce`（配置每次重读 ⇒ 即时生效）。基线：真实库 331 次 critic 调用 / 110 违规 / 78 豁免（合规 143，43.2%；收紧前为 98 违规 / 90 豁免 —— 差的 12 条是抽样纠正的误豁免）。
> ⑥ **live 证据**：warn 模式 L1+L2 各落一条日志；enforce 模式 `subagent` 调用被拒并返回可执行修正文案。
> ⑥b **可观测性补齐**（2026-11-12）：① 豁免也落日志（`level:"exempted"`，带 `exemption`）——否则"这条为什么放行"线上不可见，且 `exempted`/`exemption` 字段永远为 false；② L3 注入可观测：契约注入进 `subagent` 工具描述这件事**不进日志、不进 DB、服务端也没有 tool 列表接口** ⇒ 线上完全无法判断"到底注没注入"。插件改为**每进程记一条**注入日志（`{"level":"info","gate":"L3","event":"injected"}`）—— 逐次记会刷屏（注入发生在每个模型请求前），完全不记则不可观测。
> ⑥c **端到端测试**（2026-11-12 新增）：`rdd-workflow-e2e` 仓新增 `tests/integration/test_subagent_contract_runtime.bats` —— 真实运行时（真实模型 + 真实宿主）+ **hermetic HOME**（契约配置 / 日志 / 会话 DB 全部隔离，配置目录用符号链接农场指向真实安装态），11 个场景覆盖 L3 / L1 warn-vs-enforce / L2 检出 / 合规放行 / 豁免三条路径 / 逐 agent 覆盖 / off / 审计 CLI；默认 skip，`E2E_REAL_RUNTIME=1` 才执行。
> ⑦ **配套**：`prompts/build.md` 补「被契约拒绝的调用不计入评审轮」；`scripts/check-upstream-anchors.sh` 加 A13/A13b（"只有 tool 域允许失败"）⇒ 23/23 命中；`tests/` 新增 52 例（core 40 + audit 8 + config-guards L4 4）⇒ 全量 **356 pass / 0 fail**。
> ⑧ **豁免抽样报告**：`.rddf/reviews/subagent-contract-exemption-sampling.md`（方法 / 12 条误命中逐条证据 / 收紧方案 / 前后对比 / 残留边界）。
> ⑨ **范围外残留**：`docs/MULTI-AGENT-DESIGN.md` 的模型归属表漂移 —— **已在 v2.12 订正**（explore / librarian / context-builder / title 的 model 与 Context）。

> **v2.10 变更摘要（2026-11-11，本地构建改为双分支 + 锁定官方版本）**：本地构建的源码来源从「`dev` 分支」改为「`local/build` 构建分支」。
> ① **分支模型**：`dev` = **纯上游镜像**（跟踪 `upstream/dev`，只做 fast-forward）；`local/build` = `dev` + 尚未被上游合并的本地改动（`git merge feat/xxx`）。脚本每次构建前先更新 `dev`，再 merge 进 `local/build` ⇒ 既能跟踪上游，又能带着本地未合入的修复跑；`dev` 不被本地提交污染，永远能 `pull --ff-only`。
> ② **锁定版本模式**：`--lock 2.2.5` 把构建固定到官方 v2.2.5 对应的 **dev 提交**（官方 tag 是 `release: vX`，其父提交才是 dev 提交），并在本地创建 `local/v2.2.5` tag；`--list` 列出官方版本 / 对应 dev 提交 / 本地 tag / 当前锁；`--unlock` 回到 `local/build`。锁文件 `~/.local/state/opencode-update/lock.json`。**锁定期间只构建纯官方版本**（不含本地改动），`--check` 会明确提示。
> ③ **脚本健壮性**（实测踩到的坑）：重启服务会杀掉当前会话 ⇒ **在重启前**恢复源码仓到原分支（不再依赖 EXIT trap）；`build.ts` 内部会跑 `bun install` 改写 `bun.lock` ⇒ 切换分支前还原（registry 镜像改写直接丢弃）；GitHub TLS 偶发中断 ⇒ fetch 重试 3 次。
> ④ **验证**：锁定构建（`v0.0.0-local-202611110702`）→ 解锁构建（`…0721`）→ 再次 `--lock`（幂等，tag 不重复创建）→ 失败路径（老版本 v0.0.1 / v0.3.59 拒绝、缺 tag、互斥参数、坏锁文件、锁与 tag 不一致）+ 2 个变异体（去掉祖先校验 / 用 tag 自身代替父提交）全部符合预期；锚点 21/21；服务 `local=true`、两插件加载、无 ERROR。

> **v2.9 变更摘要（2026-11-11，本机 opencode 改为「从源码构建 + 自更新」）**：**运行中的 opencode 二进制不再来自上游发布版，而是从 `/workspace/main/opencode`（fork `chisuhua/opencode` 的 `dev` 分支）本地构建**。
> ① **为什么**：让「运行版本」= 「可见源码」⇒ 上游语义漂移能被**立刻**发现并**就地**修复（修复走 PR 回上游，如 `anomalyco/opencode#63244`），而不是对着发布版猜。
> ② **自更新**：`scripts/opencode-update.sh`（新增）——`拉 dev → bun install → build --single → 原子替换 → 重启服务`；自举 bun（按上游 `packageManager` 要求版本，本机装在 `~/.local/share/bun-<ver>/`）；工作区有未提交改动时**拒绝**构建（除 `bun.lock` 的 registry 镜像改写，会被归一化比较后丢弃）；构建失败**不动**现有二进制。
> ③ **不会被发布版顶掉**：构建时 `OPENCODE_CHANNEL=local` ⇒ 二进制 `local=true` ⇒ opencode 自带的自动更新**自动跳过**（上游 `packages/cli/src/services/updater.ts`：`OPENCODE_LOCAL` 时 `inspect()` 直接返回）。⚠️ **手动 `opencode upgrade` 仍会覆盖** ⇒ 已在脚本输出与 `docs/front-delegate-architecture.md` §6.9 标明「不要用」。
> ④ **锚点改指真实运行源码**：`scripts/check-upstream-anchors.sh` 的默认 `--src` 从 `/workspace/project/opencode`（另一个开发 checkout，早已与运行版本分叉）改为 **`/workspace/main/opencode`** ⇒ **21/21 全绿** ⇒ 本轮的上游语义断言（`interrupt` 跨实例 / `remove` 语义 / `time_suspended` 语义）在 `dev` 上**依然成立** ⇒ 两篇 ADR 的「前置事实」已同步改写为「本机跑的是从源码构建的版本」。
> ⑤ **副作用修正**：源码构建的二进制换掉后，旧的发布版服务进程成了孤儿（端口 49374，exe 已 unlink）⇒ 已清理；E2E 的 `l2_cleanup_backends` 端口兜底从写死 49374 改为读 `opencode service status` 的实际地址（外部仓 `rdd-workflow-e2e` 的 commit `c7336c0`）。
> ⑥ **bun 版本**：上游要求 `bun@1.4.4`（`packageManager` 字段 + `packages/script/src/index.ts` 的硬校验）⇒ 本机全局 bun 仍是 1.3.14 ⇒ 构建用**局部** bun 1.4.4（`~/.local/share/bun-1.4.4/`），**不动全局**。

> **v2.8 变更摘要（2026-11-11，ADR-front-cancel-release 落地）**：**`cancel` 的释放判据 = 与 `suspend` 同源 + 显式 `force` 出口**。
> ① **背景（探针实证）**：`ADR-front-stop-confirmation` D1 早已裁定「`interrupt` 的返回值**不是**停机判据」，但 `cancel` 至今**只看该返回值**就放槽 + 置墓碑 ⇒ 探针复现：**后端仍在跑时 `cancel` 释放了槽位 ⇒ 同一工作树两个写入者**。⇒ 该路径正是 `ADR-front-multi-backend` **D7.3「强制接管」（推荐恢复路径）**的实现 ⇒ **推荐路径本身是双写者生成器**；反向也坏（`interrupted:false` ⇒ 纯 no-op ⇒ D7.2「cancel 后重派」在后端从未起跑时是**死锁**）。
> ② **判据**：`cancel` 复用 `suspend` 的停机判据（`wait` + 判活 + 水位线）；`interrupt` 的返回值**降级为诊断字段**。
> ③ **证据不足 ⇒ 整单拒绝**（不墓碑、不放槽，条目保持原状、仍可 resume）+ 返回 `reason`（证据类 5 + 授权类 4）/ `stop_judge` / `forced_available` + 落 `event:"cancel_refused"` ledger 行。
> ④ **`cancel_pending` 钉住**（`pair.json` 条目字段）：被拒 ⇒ 该后端可能还在写 ⇒ **reconcile 不得把它翻 `idle`**（否则双写者从后门回来）。代价 = 新增一条持久条件 ⇒ **崩溃恢复规则**（重启**不解钉**；出口三条：`cancel` 成功 / `force` / 后端被删）⇒ 已登记为「新增死槽面（已接受）」，并由 `sessions` 的 `cancel_pending` 字段保证**可见**。
> ⑤ **`force:true` 是 per-call 参数、不是 env**：**只跳过停机证据门控，不跳过授权门控** ⇒ 墓碑 + 放槽 + 落 `event:"cancel_forced"`（含 `reason` / `forced` / `strict_mode` / `baseline_idle`）+ 返回风险文案。理由：env 是**部署级默认** ⇒ 全体 front 无差别放行、用户未逐次知情；per-call 则**逐次可见 + 落盘可审计**。⚠️ 严格模式（多实例）下 `force` **仍可用**（偏离仅限 per-call 通道，env 通道仍不可用）。
> ⑥ **front 恢复序列从两步变四步**：`sessions` → `suspend` → 失败则 `cancel` → 失败则 `cancel(force)`（**须先向用户说明「该后端可能仍在写这个工作树」**）→ `dispatch`。`prompts/front.md` 与 `docs/front-delegate-usage.md` 同步，并删改两处「槽位会由下一次派发的回收顺带释放」的旧句（被钉住时该句不成立）。
> ⑦ **跨实例**：严格模式的作用域从 `suspend` **扩到 `cancel`**（`running0=false` 也要求水位线前移）+ `foreign_instance:true` + `strict_mode:true`；⚠️ 上游 `interrupt` 能否打断**另一实例**的 execution **未核对** ⇒ 严格模式下的 `cancel` 实为「等它自然跑完」。
> ⑧ **既有 ADR 同步修订 16 处**（multi-backend D1/D7.1/D7.2/D7.3/D9/D11.3/D12 注记/V08/V32/V33/V36/V37/V42、stop-confirmation D1/D2:68/D4、stop-ownership D2/S9/D3⑩/实现约束、knowledge-capability D5）+ ledger `event` 枚举新增 `cancel_refused` / `cancel_forced`。
> 验证：`bun test tests/` **304 pass / 0 fail**（新增 20 条 AC1–AC19 用例）；**变异验证 5/5 捕获**（`scripts/mutate-cancel-release.sh`）；上游锚点 **21/21**（对 v2.2.5，新增 A11/A12）；探针固化进仓库（`tests/probes/probe-cancel-release.ts`）；E2E **L2-19/L2-20/L2-22/L2-23 + 新增 L2-24 全绿**（真实模型 + 真实宿主）。ADR：`docs/adr/ADR-front-cancel-release.md`（D1–D7）；验收记录 `.rddf/reviews/front-cancel-release-verify.md`，E2E 证据 `.rddf/reviews/front-cancel-release-e2e-evidence.md`。
> ⚠️ **已知缺口 / 后续 backlog（2026-11-11 登记）**：① **跨实例根治不可在本仓实现**（上游无锁/租约/跨进程执行可见性原语）⇒ 登记为 **6 条上游 feature request**（**2026-11-11 更新**：其中 **3 条已核对闭合为事实**（`interrupt` 跨实例 / `remove` 语义）⇒ 不必上游改；**暴露 `time_suspended` 已提 PR** [anomalyco/opencode#63244](https://github.com/anomalyco/opencode/pull/63244)；余 2 条待议）（`time_suspended` 暴露、原子准入+投递、跨进程执行可见性、`interrupt` 跨实例语义、`session.remove` 是否中断 execution 等）；② **`cancel` 对不占槽条目（`idle`/`suspended`）仍是幂等 no-op**（不墓碑）⇒ backlog `cancel-idle-tombstone`（改动面涉及 4 处条款，另立 change）；③ **`cancel_pending` 重启不解钉** ⇒ 需要显式处理（front 靠 `sessions` 看得见）；④ **E2E 无法在真实运行时确定性触发「拒绝」分支**（上游 settle 快）⇒ 该分支靠单测 + 探针 + 变异守住。

> **v2.7 变更摘要（2026-11-09，ADR-front-multi-backend 落地）**：**front 从「同步单发」升级为「异步派发 + 只读观测 + 名册索引 + 单槽切换」**。
> ① **工具面三→四**：新增 `dispatch`（异步派发，立即返回）/ `sessions`（只读观测，**绝不投递 prompt**）/ `suspend`（暂停、**保留上下文可续**）/ `cancel`（终止、墓碑）；四个新工具各有**独立权限 action**（`delegate_dispatch`/`delegate_sessions`/`delegate_suspend`/`delegate_cancel`），全局 deny + 仅 front allow。既有 `delegate` 保留，**语义与判据不变**（唯一**行为**影响：与新工具共用一张槽位表的检查；另有两处登记字段写盘 `state`/`work_root`）。
> ② **单槽模型**：同一 git 工作树内**同一时刻只允许一个后端在跑**（槽位键 = `workRoot`；`dispatching`/`active` 占槽，`idle`/`suspended`/`tombstone` 不占）。同一仓的不同 linked worktree 各自一槽 ⇒ 想并行需先准备独立工作树。
> ③ **切换两步**：`suspend(当前)` → `dispatch/resume(目标)`，由 front 编排；**暂停 ≠ 终止**（`cancel` 才是墓碑、永久不可续）。
> ④ **「投递 ≠ 消费」**：上游 drain 是 `peek → awaitActivation(可无限阻塞) → prepareContext → promote`，且 `interrupt({resume:false})` **不删 pending 行** ⇒ 旧简报会在恢复后抢先跑（幽灵注入，**已运行时坐实**）。故 dispatch 返回前须**确认消费**（判据 = 该简报的 `message.id` 出现在 `session.context()` 的消息 id 集合里），未确认则停在 `dispatching`（只可 `cancel`）。
> ⑤ **ledger 增 `event` 独立字段**（不塞进 `outcome`）：`dispatched`/`dispatch_failed`/`cancelled`/`taken_over`；`outcome` 枚举新增 **`vanished`**（后端被外部删除）。
> ⑥ **已删后端不可见**（能力边界）：插件 ctx 无 `project` 域 ⇒ 无法枚举 repo ⇒ `sessions` 不列已删后端、观测面不补记。**派发面处置矩阵已按 ADR D12 定稿**（拿到 404 正面证据 ⇒ 旧条目墓碑 + 落 `outcome:"vanished"` 行 + 释放槽位），**实现已于 2026-11-10 落地**（builder：派发面拿到 404 正面证据 ⇒ 旧条目墓碑 + 落 `outcome:"vanished"` 行 + 释放槽位；`suspend`/`cancel` 不再因「无法定位」抛错）（**死槽风险已解除**）。
> ⑦ **双根归一**：`stateRoot`（状态落盘）与 `workRoot`（工作树）分离，linked worktree 下 pair 落主仓、变更检测在 worktree（`ADR-canonical-root-normalization`，commit `23584cd`）。
> ⑧ **上游语义实测**：`get()` 在 run 中**确实**返回 `time.busy`（此前探针 Q2/R4 冲突，R4 正确）；`list` 的 item 带 `metadata`（为空时省略字段）。
> 验证：`bun test tests/` **216 pass / 0 fail**；Phase 0 消费判据探针 16/16；权限矩阵 `opencode debug agents` 实测。ADR：`docs/adr/ADR-front-multi-backend.md`（D1–D12）；实施与验收记录见 `.rddf/reviews/front-multi-backend-*.md`。
> ✅ **后续已补齐（2026-11-10）**：E2E bats **L2-16…L2-22 + L2-99 全量 23/23 全绿**（外部仓库，真实模型 + 真实宿主）；**AC44 连续 10 次时延**（中位 0.2s，10/10）；**AC57 的完整往返序列**（E2E L2-22：dispatch A → suspend A → dispatch B → sessions → suspend B → resume A ⇒ A 以**同一 session_id** 恢复）；**停机判据按上游语义订正**（`interrupt` 的返回值 ≠ 停机判据 ⇒ 判据 = 「判活为假」+（基线在跑时）终态水位线前移，见 ADR D11.3）。
> ⚠️ **已知缺口 / 后续 backlog（2026-11-10 登记，均需另立 change）**：① **异步 `dispatch` 的 resume 目标无活体守卫**（AC19/D8.1「对正在运行的后端 resume ⇒ 拒绝」目前只落在同步 `delegate` 面）——这是本轮唯一会导致「两个写入者」的可达路径；② `isSessionMissingError` 用 `/404/` **宽判** ⇒ 含 "404" 的传输错误会被判成「已删除」⇒ 误放槽；③ `ctx.session.wait()` 在 run 中途被 interrupt 时的返回语义**未实测**（探针缺口）——「改用 `session.wait` 作停机判据」这个备选的前置；④ ADR 里三处**行号级**上游引用（`session.ts:278-281` / `run-coordinator.ts:164-171` / `adapter.ts:641`）应纳入「上游语义漂移」回归清单（opencode 升级后会静默漂移）。
> ✅ **本轮已补齐**：AC13 判据改写（planner，按 D12 改成五段）、**D12 派发面处置矩阵的实现**（builder：死槽已解除）、AC36 余下两处同步（`docs/dual-session-delegation.md` 补 `taken_over`、`prompts/front.md` 补 `vanished` 与 `event` 说明）、`proposal.md` AC4 脚注修正。

> **v2.6 增补（2026-11-09，ADR-delegate-delivery-evidence 落地）**：上面 v2.6 段的「**outcome 枚举不变**」一句已过时（历史不改，此处增补）：`outcome` 现扩展为 `succeeded` / **`unverified`** / `failed` / `interrupted` / `unknown` / `busy`。
> - `unverified` = 宿主报成功但本轮没有可验证的交付证据（`no_work_evidence=true` 时触发；判定链见 ADR D2）。
> - 摘要与 ledger 行同时保留宿主原值 `host_outcome`（`unverified` 时恒为 `succeeded`）。
> - 迁移面：`prompts/front.md`、`docs/front-delegate-usage.md`、`docs/dual-session-delegation.md`、`docs/front-delegate-architecture.md`、`ADR-front-knowledge-capability` D5、单测与 E2E —— **同一 patch 内完成**（ADR D3.1 八项）。

> **v2.6 变更摘要（2026-11-09）**：**静默失败检测** —— 宿主说 succeeded ≠ 工程 session 真的交付了东西。
> ① **缺陷来源**：E2E 实跑中发现，工程 session 在模型于 run 中途被切换后重来时，可能只读了 role.json 就输出角色开场白并 idle；宿主仍把该 run 记为 `succeeded` → delegate 回传 `succeeded` + `changed_files: []`，front 遂向用户转述"已完成"，而实际什么都没产出。
> ② delegate 回传**交付面证据**：`tool_calls`（工具调用总数）、`write_tool_calls`（写盘类调用数：`edit`/`write`/`patch`/`apply_patch`/`multiedit`；**shell 不算**，无法从命令文本判定落盘）、`artifacts`（本次产生的文件变更数，**git 可见口径**：被忽略 / 工程根外 / worktree 内的改动数不到）、`final_is_role_opening`（最后一条文本是否停在角色开场白）、`model_switched`（本轮是否中途换过模型 —— **根因信号**，宿主消息 `type == "model-switched"`，不依赖任何文本格式），以及判定结果 `no_work_evidence`。
> ③ 判定规则：`no_work_evidence = (final_is_role_opening || model_switched > 0) && write_tool_calls === 0 && artifacts === 0`。
>   - **只看本轮消息**（`sliceRoundMessages`，按 baseline 切片）——否则 resume 时上一轮的写盘调用会掩盖本轮零交付；找不到 baseline 时退回全量（宁可漏报不误报）。
>   - **仍在跑时不判定**（`still_running`：wait 超时或宿主未给 outcome）——此时读到的 outcome 可能是上一轮的陈旧值（resume 场景），据此判"没有产出"会误报。
>   - **只对 `kind=engineering` 判定**（知识 session 的产物本就是"回答"，通常零工具调用，套用会误报）。
> ④ **`outcome` 枚举不变**（仍是宿主视角的 `succeeded`）："没交付"由 `no_work_evidence` 单独表达，不改既有契约；front 契约同步（`prompts/front.md`）：`no_work_evidence=true` 时**不得转述为"已完成"**，必须转述"没有产出"并给出证据数、问用户重试还是换做法；§五 禁止事项新增一条。
> ⑤ ledger 行增记 `no_work_evidence` / `tool_calls` / `write_tool_calls` / `final_is_role_opening` / `model_switched`（审计可追溯）。
> ⑥ 判定逻辑集中在 `lib/delegate-core.ts::summarizeDelivery`（纯函数，可单测）；回归夹具 `tests/fixtures/real-no-work-session.json`（真实失败会话实录，回放 → `no_work_evidence=true`）。
> ⑦ 验证：单测 **144 pass**（覆盖率 99.14%）；E2E **15/15 ok**，L2-3 增断言（真实交付不得被误判：`no_work_evidence=false` 且 `write_tool_calls ≥ 1`）。
> ⑧ **已知缺口（待 architect 决策）**：目前"没交付"只由 `no_work_evidence` 标志位表达，防御**依赖 front 遵守 prompt**——不遵守的消费者读 `outcome=succeeded` 仍会误报。机读化方案（新增 `outcome="unverified"` + ledger 保留 `host_outcome`）属契约变更，未擅自实施。

> **v2.5 变更摘要（2026-11-08）**：**front 获得知识获取能力** —— 在「front 不获得写 / 执行能力」的前提下，放行只读 subagent 并引入记忆层。
> ① `agent.front.permission.subagent` 由 `"deny"` 改为逐 agent 对象：`explore` / `librarian` / `oracle` / `metis` / `critic` allow + `"*": "deny"`（显式排除 `general` / `plan` / `build`）。粒度实测：`opencode reload` 后 `debug agents` 解析出六条规则，`"*": deny` 末尾。
> ② 五个被放行 agent 的 `shell` 从 `"*": allow` 改为**三段式**（`"*": deny` 打头 → 只读白名单 → 尾部守卫 deny）：补 `* > *` / `* >> *` / `tee` / `find -fls` / `sort -o` / `uniq -o` / `git --output|--format|--pretty`；网络写落盘（`curl -o|--output|-O`、`wget -O|--output-document|-P`）与文件外泄（`curl -T|--upload-file|-d @|--data @|--data-binary @`）守卫；`git clone * /*` deny → `git clone * /tmp/opencode/*` allow。`librarian` 额外保留 `curl`/`wget`/`git clone`/`git ls-remote` 且不套 `* /*` 守卫；其 `subagent: allow` 改为 `deny`（封深度 2 链）。
> ③ `prompts/front.md` 同步：`subagent` 行改为「仅五个只读 agent ✅，其余 deny」；理解性出口扩为「直读 或 召只读 subagent」；新增 §2.1「只读 / 改判 / 信任定级」。`prompts/{explore,oracle,metis,librarian}.md` 的 `awk/env/printenv/jq` 措辞由「需人工放行」改为「被拒」；`critic.md` 删去白名单外的 `sed -n`；`librarian.md` 的 clone 目标改为 `/tmp/opencode`。
> ④ 决策依据：[ADR-front-knowledge-capability](../../docs/adr/ADR-front-knowledge-capability.md)（Proposed）；探针：[front-subagent-granularity-probe](../reviews/front-subagent-granularity-probe.md)；审稿：[adr-front-knowledge-capability-review](../reviews/adr-front-knowledge-capability-review.md)（oracle BLOCK→闭合，critic APPROVE_WITH_CONDITIONS，0 BLOCKER）。
> ⑤ **配套实施项未完成（转 builder）**：`delegate` 的 agent 白名单（create + resume）、只读 agent 恒注入 `edit:* deny`、`kind=engineering|knowledge` 登记类型、`.rddf/state/ledger.jsonl`。在此之前，D2 的放行与 D4 的约束**尚未同时成立**——front 已能召只读 subagent，但 `delegate(agent=...)` 仍未受限。
> ⑥ 生效条件：配置改动经 `opencode reload` 生效；**prompt 文件内容改动需 `opencode service restart`**（service 缓存，见 v2.3 的 D8.1）。

> **v2.4 变更摘要（2026-11-06）**：**模型降级链** —— OpenCode v2.2.5 无原生 `fallback` 配置（`agent.model` 单值），改由 `plugins/model-fallback.ts` + `lib/model-fallback-core.ts` 实现：挂 `session.hook("retry")`，按错误分类决定「原地退避 / `switchModel` 换链 / 放弃」，build 内置默认链 `commandcode → minimax-cn → openstarry → opencode-go`（当前生效链以 `model-fallback.json` 为准，见 ④）。
> ① 401/403/404 与订阅额度硬失败立即换链；5xx/网络类先退避 2 次；429 优先按 `retryAfterMs` 等待；**内容策略 / 上下文超限（`context length` / `token limit`）/ 400 / 413 / 422 不降级**，且这两类**先于**状态码短路（否则 400 + `forbidden` 会被误判成模型不可用，拿弱模型重试被拒内容）；
> ①' 冷却表**进程级**（跨 session 共享，内核仍保持纯函数：冷却条目由 plan 带出、宿主落盘）；会话状态按 location 重复 setup 时模块级共享 + 事件级去重；session 状态 30 分钟不活跃即淘汰；
> ② 失败模型 5 分钟冷却，链尾可绕回已恢复的链首；链耗尽即 `retry: false`；
> ③ 可见性：切换触发 TUI 模型指示器变化 + `~/.local/share/opencode/model-fallback.log`；实测 `session.synthetic` 通知会被当作新输入**再触发一轮模型调用**并重置降级状态，故默认关闭、降为显式选项 `notify: "synthetic"`；
> ④ 链与策略走独立配置文件 `~/.config/opencode/model-fallback.json`（`chains` / `policy` / `notify`），环境变量 `MODEL_FALLBACK_CONFIG` 可改路径 —— **本地插件拿不到 opencode 配置里的 options**（实测三种写法 `ctx.options` 恒为 `{}`），故不用 `plugins` 配置项；**链头不单独配**，失败时正在用的模型即链首，改默认模型 = 改 `opencode.jsonc` 的 `agent.model`；
> ⑤ 同步订正 MD §2.1 / §5.1 / §5.2 的 model 归属，新增 §5.4 降级链。**订正以运行时真值（`opencode debug agents`）为准** —— 初稿曾照抄配置文件的一次中间态，把 build / explore / oracle 误记成 `commandcode/deepseek/deepseek-v4.1-flash`（实际分别是 `minimax-cn/MiniMax-M3.1-Flash` / `opencode/deepseek-v4.1-flash-free` / `kimi-code/kimi-for-coding`），已在 §2.1 的订正说明里记下这个坑；
> ⑥ 验证：`tests/model-fallback-core.test.ts` 33 条单测（全量 `bun test tests/` 96 pass）；端到端探针以坏 `MINIMAX_API_KEY` 驱动，实测两次换链后由 `opencode-go` 成功作答（见 `~/.local/share/opencode/model-fallback.log`）；
> ⑦ 新增面向使用者的手册 `docs/model-fallback-usage.md`（默认模型 vs 后备链分别改哪 / 什么错误会换模型 / 日志怎么读 / 怎么停用降级），§5.4 与之互相指向；停用降级的做法均为实测结论（`chains.<agent>: []` **无效**，会回落到内置默认）。

> **v2.3 变更摘要（2026-11-06）**：**front agent 重设计** —— front 从"prompt 里的君子协定"变成**权限层强制 + 单通道委托**。
> ① front 的 `shell` 从 `"*": allow` + 30 deny 改为**只读白名单**（`*: deny` 打头 + 47 条只读 allow + 尾部守卫 deny），并追加 `"* /*": deny` 禁绝对路径；
> ② `external_directory` 由 `ask` 改为**路径对象**（放行 `/workspace/**` + 治理面目录）；
> ③ 新增 **front agent**（第 11 个 agent，第 3 个 primary），职责为用户交互内核 + 委托出口；
> ④ 新增 `delegate` **插件工具**（`plugins/delegate.ts`）：工具声明 `options.permission="delegate"` → 全局 deny + 仅 `agent.front` allow ⇒ **只有 front 拿得到**；
> 工程 session 在**建立时**权限定型（`[常量deny, scope edit 规则, grants]`），`grants` 受类目白名单（`question`/`form`/`edit`/`write` 永不可 grant）；
> ⑤ **退役** `scripts/delegate.sh` + `scripts/captoken.sh`（外部脚本 + 自研 HTTP + capability token）；
> ⑥ 工程 session 登记：`pair.json`（pair-v2）+ `role.json` 的 `sessions` 分区，**在 prompt 之前**写（否则角色退化为 `general`）；
> ⑦ 决策依据：[ADR-front-agent-redesign](../.rddf/state/adr-front-agent-redesign.md)；实施路径与验收：[front-agent-redesign](../.rddf/improvements/front-agent-redesign.md)；探针实测：[p0-probes](../.rddf/reviews/front-agent-redesign-p0-probes.md)。
> 实施期修正了 ADR 三处假设：`external_directory` **不约束 shell**（D4.1）、`session.update` **可原地改权限**（D5.1，救援不必全量重跑）、代答**仅同 location 可用**（D5.3）。


> 本节内的 § 引用为**当时的**章节编号；原 §4.4–§4.6 / §7.1–§7.3.1 / §8.1–§8.1.3 现位于本文件后续小节，原 §9 演进日志位于文末。

> **v2.0 变更摘要**：新增**审查配对**（角色 → 审查者）—— `architect` → oracle + critic（oracle 先行）、`planner` → metis、`builder` → verifier（角色内建）+ critic（架构面）。审查是角色矩阵**内核**，不依赖 rdd-workflow；预算按**文档粒度**分层（单条 change 上限 = critic 2 + verifier 3）；补充**审查者不可用降级**（内置自检清单 + 结论首行注明，禁止把「不可用」当「通过」）。
>
> **v1.9 变更摘要**：角色矩阵与 rdd-workflow **解耦**——角色矩阵改为**自足内核**（权限/产出契约/切换机制不依赖 rdd-workflow 是否安装），rdd-workflow 降为**可选增强层**；新增 `scripts/rdd-skills.sh`（懒探测：installed / available[] / sources[] / rddf_cli）；角色 ↔ 可选增强映射 + 工件归属规则（同一路径上单一写入者）写入 `prompts/build.md`（§2.6）。
>
> **v1.7 变更摘要**：新增项目级架构文档配置 `.rddf/config/arch-docs.json`（`arch_paths` / `exclude_paths`），**architect 可写范围**与 critic `arch` 档判据改为读配置；新增 `/arch-docs-init`（首次梳理写入、`--refresh` 更新、`--check` 查漂移）；`build_critic_prompt.sh` 按配置推断档位。
>
> **v1.6 变更摘要**：critic 引入**审稿档位** `review_profile`（`arch` / `plan` / `build` / `archive`），BLOCKER 判据按产物而不是按角色；上下文契约从 6 字段扩为 7 字段（§2.3、§2.4）；`build_critic_prompt.sh` 按改动路径自动推断档位；build 角色矩阵补齐 cwd 变更重解析、非法角色值、verifier 评审预算、builder 改 ADR 决策的边界（§2.2）。
>
> **v1.5 变更摘要**：critic 收窄为**架构与决策审稿**（不再报文档计数/格式/测试边角/护栏绕过面）；BLOCKER 限定三类；结论必须与 `mergeable` 一致，禁止用 NITS 凑 REJECT；`build.md` 新增**评审预算**（每 change ≤2 轮，第 3 轮需用户批准）、增量复审、禁止"攻击新判据"式委派、`scope_exceeded` 不入返工队列（§2.3、§2.4）。执行层校验的自动化迁移清单见 `docs/review-automation-backlog.md`。
>
> **v1.4 变更摘要**：模型元数据补全（`capabilities` + `limit.context` 按实测/上游值分级修正，§5.1、§5.2）；`librarian` 换成本最低档的 `kimi-k2.6`（`deepseek-v4-flash` / `glm-5.1` 实测不在套餐，§5.2、§7.3.1）；新增 `title` agent 用实测不思考的 `glm-5.3-flash`（§2.1）；`context-builder` 转为 `hidden`（§2.3）；`plan`/`oracle` 去掉 `temperature`（模型不支持该参数）；角色矩阵从 `AGENTS.md` 移入 `prompts/build.md`（§1.2、§6）；6 个 subagent prompt 补"被权限拒绝即终止"纪律（§3.3）。
>
> **v1.2 变更摘要**：新增 `critic` subagent（§2.3、§2.4、§3.1、§3.2、§4.3）；`build.md` 加入"何时调 critic"委派触发规则（§3.2）；critic prompt 4 段式输出格式（BLOCKERS / SHOULD_FIX / NITS / 验证建议）首次文档化（§2.4）；同步更新 §6 文件结构、§7 验证清单。
>
> **v1.1 变更摘要**：4 轮权限加固（详见 §4.3 后的小节 "v1.1 权限加固"）；plan agent 写入路径从 `.opencode/plan/` 改为 `.plans/`（§6 联动）；新增 `/plans-init` slash command（§6.1、§8.1）。

---

## 权限加固记录

> 原 `MULTI-AGENT-DESIGN.md` §4.4 / §4.5 / §4.6。当前生效的加固项见该文档 §4.4。

### 4.4 v1.1 权限加固（2026-10-13）

v1.0 部署后由 oracle 后审发现 3 类真问题，本节记录修复与理由。

#### 4.4.1 build bash 无界（修复 R-01）

**问题**：`bash: "allow"` 让 build agent 可执行任意 shell 命令，包括 `git push --force`、`rm -rf`、`sudo` 等不可逆操作。`snapshot: false` 意味着没有 undo 检查点。

**修复**：bash 改为 `* + 危险命令 ask` 模式，拦截 19 条高频危险模式：

| 类别 | 拦截模式 |
|---|---|
| git 推送 | `git push` / `git push *` |
| git 丢工作区 | `git reset --hard` / `git clean -fd*` / `git clean -fdx*` / `git checkout --` / `git checkout .` / `git restore *` |
| git 丢分支/栈 | `git branch -D *` / `git stash drop *` / `git stash clear *` |
| 删文件 | `rm -rf *` / `rm -fr *` / `rm -r *` / `rm -f *` |
| 提权 | `sudo *` |

**机制**：opencode V1 bash 对象采用 **last-match-wins**，catch-all `"*": "allow"` 放第一条，具体 ask 规则后续追加——匹配到 ask 规则时取 ask 生效。

#### 4.4.2 MCP 写工具无界（修复 R-02）

**问题**：v1.0 仅限制 `edit` 权限，但 `codebase-memory-mcp` 提供 5 个写工具（`delete_project` / `index_repository` / `ingest_traces` / `manage_adr` / `query_graph`）——explore / oracle / librarian / metis / general 这些"只读" agent 都能调，一条 `delete_project` 就能毁掉整个知识图谱索引。`query_graph` 特别隐蔽：Cypher 支持 `CREATE/SET/DELETE`，除非服务端强制只读，否则等于通用改图通道。

**修复**：

| MCP 工具 | build | plan / explore / librarian / oracle / metis / general |
|---|---|---|
| `delete_project` / `index_repository` / `ingest_traces` / `manage_adr` | ask | deny |
| `query_graph` | ask | deny |

**机制**：V1 permission action 命名 `<server>_<tool>`（连字符保留，`.` 替换为 `_`），opencode 源码 `lifecycle.test.ts` 验证。`codebase-memory-mcp_query_graph` 与实际工具名精确对齐。

#### 4.4.3 描述/权限自相矛盾（修复 R-03 / R-04）

**问题**：

- `general` 描述"Read-only"但 bash 白名单含 `npx *` / `node *` / `npm test *`——`npx` 能下载执行任意 npm 包，比 build 的 `bash: allow` 还隐蔽
- `explore` 描述"Read-only"但保留 `doom_loop: deny`、websearch `ask`——prompt 与权限不一致

**修复**：

- general：砍 `npx *` / `node *` / `npm test *`，bash 白名单回归纯只读子集
- explore：`websearch` 改 `deny`（本职是本地搜索，外网搜索走 librarian）
- oracle / metis：`bash` 改 `deny + 白名单`（原本是 `*` 全 ask，每次想 `ls` 都弹窗，非交互上下文有挂起风险）
- 所有 subagent：`question: deny`（subagent 弹问题给用户的交互路径别扭，应返回"不确定"给 parent）

#### 4.4.4 plan 写入路径修正（修复 R-05）

**问题**：v1.0 权限白名单 `.opencode/plans/*.md`（复数 `plans`）与 prompt 要求的 `.opencode/plan/*.md`（单数）不一致——plan agent 的主写入路径被自己的权限 deny 掉，工作流直接断。

**修复**：统一为 `<project-root>/.plans/<slug>.md`（与 opencode 引擎自身的 `.opencode/` 命名空间隔离）。`scripts/plans-init.sh` + `commands/plans-init.md` 提供 `/plans-init [path]` 自动化 `.gitignore` 初始化（详见 MULTI-AGENT-DESIGN.md §6.1）。

### 4.5 v1.2 权限加固（2026-10-15）

v1.1 部署后由外部代码审查（oh-my-openagent 项目调研，详见 §10）发现 critic 类角色缺失；本次新增 critic agent 时同步加固 3 项。

#### 4.5.1 新增 critic agent（建立审稿门禁）

**问题**：v1.0/1.1 的 7 个 agent 全部是"先于 build"或"build 并行"，**没有任何"build 之后做对抗式审稿"的角色**。大改动（≥3 文件 / 跨 API / 跨模块）经常带着隐藏缺陷过线；build agent 自我审查又会陷入"作者 = 评审人"的偏差。

**修复**：新增第 8 个 subagent `critic`，专责对抗式审稿：

- **模型**：`kimi-code/k3-256k`（256k 长上下文 + 已用于 oracle 审稿类）
- **temperature**：0.1（冷静对抗，不情绪化）
- **prompt 强制 4 段式输出**（§2.3）：BLOCKERS / SHOULD_FIX / NITS / 验证建议 + `mergeable` / `scope_exceeded`（v1.5 去掉 10 项旁路清单）
- **默认怀疑、结论与证据匹配**：禁止"整体看起来不错"等零信息话术；v1.5 起只有 BLOCKER 才能给 REJECT

#### 4.5.2 critic 权限最严化（修复 R-06）

**问题**：critic 必须严格只读——它不是写代码的人，是挑刺的人。如果允许它写、改、调子 agent，会破坏审稿的客观性。

**修复**：critic 是**唯一** `webfetch: deny` + `websearch: deny` + `task: deny` + `question: deny` 全 deny 的 agent（其它 subagent 至少 task 或 webfetch 有一个 allow）：

| 工具 | critic | 其它 subagent（对比） |
|---|---|---|
| edit | deny | deny |
| webfetch | **deny** | allow（librarian/oracle/metis 都要联网） |
| websearch | **deny** | allow（librarian/oracle） |
| task | **deny** | librarian: allow（调 explore）|
| question | **deny** | 同其它 subagent |

v1.2 设计：critic 的 `codebase-memory-mcp` 10 个工具（5 写 + 5 读）**全部 deny**——critic 不查代码图谱，只看 git diff + 文件内容（避免 graph 查询把"模型视角"和"代码现状"混淆）。

**bash 白名单收窄**（比 librarian 严）：不包含 `curl / wget / git clone`——critic 不下载、不 clone，只读已有文件。

> **v1.3 修正（§4.6.4）**：迁移到 v2 扁平权限时 critic 的只读图谱工具被误降级成 deny，与 `prompts/critic.md` 要求的 `list_projects` 冲突。v1.3 已恢复 10 个只读工具 allow，4 个写工具保持 deny。

#### 4.5.3 build.md 加入 critic 触发规则（修复 R-07）

**问题**：v1.1 的 build agent 完全不知道 critic 存在——8 个 agent 注册到 opencode.jsonc，但 build agent 的 prompt 没说"什么时候该调 critic"。结果 critic 配置 100% 闲置。

**修复**：`prompts/build.md` "委派原则"段加 1 条 + "何时调 critic"段加 5 个条件 + 4 段式输出协议。详见 §3.2.1。

#### 4.5.4 未来权限审查 TODO（继承自 v1.1 §8.2 P1 清单）

- ❌ 未在真实 session 实测 critic 是否真的按 4 段式输出
- ❌ 未实测 critic 6 个 git 只读子命令是否能涵盖 PR review 全部需求
- ❌ v1.1 的 MCP `query_graph: ask/deny` 在 v1.2 改成 critic 全 deny 后是否影响 build agent 查询图谱（不变：build 仍是 ask）

### 4.6 v1.3 权限加固与 v2 schema 迁移（2026-10-21）

OpenCode 升级到 **v2.1.2** 后做了 4 项修复。前两项是**迁移期静默失效**（配置能加载、但权限不生效），后两项是**迁移过程中引入的越权**。

#### 4.6.1 v2 schema 迁移：MCP 权限键形态（修复 R-08）

**问题**：v1 的嵌套写法

```jsonc
"permission": { "codebase-memory-mcp": { "search_graph": "allow", "*": "deny" } }
```

在 v2 下会被归一化成 `{ action: "codebase-memory-mcp", resource: "search_graph" }`——但 v2 的 MCP 工具 action 名是 `<server>_<tool>`（`codebase-memory-mcp_search_graph`），**永远匹配不上**。后果不是"被拒"而是"落到默认 ask"：所有图谱调用每次都弹审批框。

**修复**：全部改成扁平键（§6.2）。

| 位置 | v1 写法 | v2 写法 |
|---|---|---|
| 全局 | `"codebase-memory-mcp": { "*": "deny", "search_graph": "allow" }` | `"codebase-memory-mcp_*": "deny"` + `"codebase-memory-mcp_search_graph": "allow"` |
| agent 级 | 同上 | `"codebase-memory-mcp_index_repository": "ask"`（扁平单键）|

其它同批迁移项：`provider` → `providers`、`npm` → `package`、`options` → `settings`、顶层 `subagent_depth` → `experimental.subagent_depth`（顶层写法在 v2 下被**静默丢弃并只留一条 WARN**，限深形同失效）。

> `bash` 键在 v2 会被自动归一化成 `shell`（`normalizeAction()`），所以配置里继续写 `bash` 也能用；但文档与新配置统一按 v2 语义描述。

#### 4.6.2 `.env` 保护被 agent 权限覆盖（修复 R-09）

**问题**：opencode 内置 `read *.env → ask` 保护排在规则链**前面**，而每个 agent 又写了 `"read": "allow"`——按 last-match-wins，agent 的规则**更靠后** → 内置保护被覆盖。实测：所有 agent（含 critic）都能 `read` 读取 `.env`，且 `cat *.env` 走 shell 权限（`cat *` allow）完全绕过 read 规则。

**修复**：

1. 每个 agent 的 read 改成对象形式，把 `.env` 规则写在 `*` 之后（顺序即策略）：
   ```jsonc
   "read": { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" }
   ```
2. shell 层补 `.env` 拦截（只读 agent `deny`，build `ask`）：`cat/head/tail *.env` 与 `*.env.*`。

**残留**：shell 是**整串前缀匹配**，重定向不在匹配范围内——`git show HEAD:.env > /tmp/x` 这类仍会绕过。权限模型的固有限制，不是配置问题。

#### 4.6.3 只读白名单越权（修复 R-10）

**问题**：v1.3 迁移时为"减少 ask 弹窗"把只读 agent 的 bash 白名单大幅放宽，其中 4 条是越权原语：

| 允许项 | 风险 |
|---|---|
| `awk *` | awk 可 `system()` 任意命令、可 `> file` 写文件——`edit: deny` 被绕过 |
| `env *` / `printenv *` | 直接把 `OPENSTARRY_API_KEY` 等密钥打进 transcript → 第三方模型 |
| `jq *` | 辅助写文件（配合重定向）|

**修复**：只读 agent 移除这 4 条 → 落回 catch-all `"*": "ask"`，人工放行。build 是信任边界内的主 agent，保留其能力。

> **保留的既有 deny**：`find * -exec *` / `find * -execdir *` / `find * -delete`（只读 agent）。

#### 4.6.4 critic 图谱工具与 plan 写操作的迁移误降级（修复 R-11）

**问题**：v1.2 设计里 critic 是"不查代码图谱、10 个 MCP 工具全 deny"（§4.5.2）。但 v1.3 迁移后的 critic 块只剩 `codebase-memory-mcp_*: deny` + `trace_path: allow`——**连 `list_projects` 都被 deny**，而 `prompts/critic.md` 明确要求 critic 先调 `list_projects` 查 project 名。提示词与权限直接打架。

同理，plan 的 4 个 MCP 写操作在 v1.1 是 `ask`，迁移时被静默降级成继承全局 `deny`。

**修复**：

- critic 恢复 10 个**只读**图谱工具 allow（`search_graph` / `get_code_snippet` / `trace_path` / `get_architecture` / `get_graph_schema` / `query_graph` / `search_code` / `detect_changes` / `list_projects` / `index_status`），4 个写工具（`index_repository` / `ingest_traces` / `manage_adr` / `delete_project`）保持 deny；
- plan 的 4 个写操作恢复 `ask`。

> **`query_graph` 的决定（v1.4，用户拍板）**：它被放进了**全局** allow 列表 → 8 个只读 agent 都能调。按 本文件「v1.1 权限加固 §4.4.2」的判定它应属"写工具"（Cypher 可写），但**保持 allow** —— 理由是该 MCP server 的 `query_graph` 只用于读查询，实际风险远低于 `delete_project` / `index_repository`；逐个 agent 加 deny 会让每次查询都弹 ask，破坏只读 agent 的可用性。此决定已记录在 MULTI-AGENT-DESIGN.md §8.1 P0。


---

## 各版本验证记录

> 原 `MULTI-AGENT-DESIGN.md` §7.1 / §7.2 / §7.3 / §7.3.1。当前态汇总见该文档 §7.1。

### 7.1 已完成验证（2026-10-13）

| 测试 | 状态 |
|---|---|
| JSON 合法性（7 个 JSON 文件）| ✅ 通过 |
| 7 个 agent 全部注册 | ✅ 通过 |
| 7 个 `{file:...}` 引用全部解析 | ✅ 通过 |
| permission schema 字段全部合法 | ✅ 通过 |
| model/provider 路由全部存在 | ✅ 通过 |
| `default_agent: "build"` 指向合法 primary | ✅ 通过 |
| `subagent_depth: 2` 合理 | ✅ 通过 |
| explore subagent 核心能力（grep）| ✅ 通过（静态+实跑）|
| librarian subagent 元规则 | ✅ 通过（prompt 内容含 8 处 explore 引用、6 处付费墙 fallback）|
| 解析器兼容性（模拟 OpenCode 启动）| ✅ 通过（0 错误 0 警告）|
| v1.1 后权限 schema 合规 | ✅ 通过（`json5` 解析 + 字段结构核查）|
| v1.1 plans-init.sh 幂等性 | ✅ 通过（重复跑 + 已存在条目场景 dry-test）|
| v1.1 bash last-match-wins 行为 | ✅ 通过（oracle 文档核查 + pattern 顺序验证）|
| v1.1 MCP action 命名格式 | ✅ 通过（opencode 源码 `lifecycle.test.ts` 验证）|

### 7.2 v1.2 新增验证（2026-10-15）

| 测试 | 状态 |
|---|---|
| JSONC 严格解析（node 解析，模拟 opencode 行为）| ✅ 通过 |
| 8 个 agent 全部注册（含 critic）| ✅ 通过 |
| 8 个 `{file:...}` 引用全部解析（含 critic）| ✅ 通过 |
| critic 必填字段完整（model/temperature/mode/description/permission/prompt）| ✅ 通过 |
| critic 关键 deny：edit/webfetch/websearch/task/question | ✅ 通过 |
| critic model `kimi-code/k3-256k` 在 provider 池中 | ✅ 通过 |
| build.md 改后 schema 合规 | ✅ 通过 |
| build.md 反向引用 critic 的位置（§"委派原则" + §"何时调 critic"）| ✅ 通过 |

### 7.3 v1.3 新增验证（2026-10-21）

用 opencode v2.1.2 自带命令实测（`opencode debug config` / `opencode debug agents`），按 v2 的 last-match-wins + Wildcard 规则复算生效权限：

| 测试 | 状态 |
|---|---|
| `opencode debug config` 归一化诊断 | ✅ 通过（0 错误 0 警告）|
| `experimental.subagent_depth: 2` 生效 | ✅ 通过（出现在解析结果里）|
| 顶层 `subagent_depth` 已移除 | ✅ 通过（v2 会以 `unsupported` 告警丢弃）|
| 9 个 agent 全部注册 + 9 个 `{file:...}` 全部解析 | ✅ 通过 |
| MCP 权限扁平键生效（`codebase-memory-mcp_search_graph` 等）| ✅ 通过（10 个只读工具 allow、4 个写工具 deny）|
| critic 的 `list_projects`（prompt 要求调用的工具）不再被 deny | ✅ 通过 |
| `.env` 读取：read → ask（全部 agent）| ✅ 通过 |
| `.env` 读取：shell cat/head/tail → deny（只读 agent）/ ask（build）| ✅ 通过 |
| `awk`/`env`/`printenv`/`jq` → ask（只读 agent）| ✅ 通过 |
| `find * -exec *` → deny（只读 agent）| ✅ 通过 |
| provider 模型 id 与上游一致（`opencode models` 核对）| ✅ 通过（`mimo-v2.5-pro` / `deepseek-v4.1-flash` / `kimi-k2.6` 均存在）|
| `.gitignore` 覆盖所有备份文件（`git check-ignore` 复核）| ✅ 通过 |
| 备份文件里的明文 API key 已隔离出索引 | ✅ 通过（**key 本身仍需轮换**）|

### 7.3.1 v1.4 新增验证（2026-10-21）

**配置层**（`opencode debug config` / `debug agents`）：

| 测试 | 状态 |
|---|---|
| `capabilities` 字段被接受、无归一化诊断 | ✅ 通过（0 错误 0 警告）|
| 10 个 agent 全部注册（含新增 `title`）| ✅ 通过 |
| `title` 接上 `openstarry/glm-5.3-flash`、`hidden=true` | ✅ 通过 |
| `context-builder.hidden` 生效 | ✅ 通过 |
| `librarian` 切到 `openstarry/deepseek-v4.1-flash` | ✅ 通过 |
| `plan` / `oracle` 不含 `temperature` | ✅ 通过 |
| 角色矩阵移出 AGENTS.md 后 build prompt 仍完整（7361 字符）| ✅ 通过 |

**模型层**（直接打 openstarry / models.dev 元数据）：

| 测试 | 结果 |
|---|---|
| `deepseek-v4.1-flash` 基本对话 | ✅ 正常返回（含 `reasoning_content`）|
| `deepseek-v4.1-flash` 工具调用 | ✅ `finish_reason: tool_calls`，参数正确 |
| `deepseek-v4.1-flash` 210,074 token 输入 | ✅ 被接受 → 现声明 262,144 有实测支撑 |
| `deepseek-v4.1-flash` 关思考（`thinking.type=disabled` / `enable_thinking=false` / `reasoning_effort=none`）| ❌ **三种参数全被网关忽略**，思考关不掉 |
| `glm-5.3-flash` 是否思考 | ✅ **不思考**（`reasoning_tokens=0`，无 `reasoning_content`）—— 成为 title/context-builder 的选型依据 |
| `MiniMax-M2.7-highspeed` 是否思考 | ⚠️ 无 `reasoning_content` 但正文内联 `<think>`，且 `reasoning_tokens>0` |
| 其余池内模型（qwen3.7-plus / kimi-k2.6）| ⚠️ 均返回 `reasoning_content` |
| openstarry `/v1/models` 是否返回 limit 元数据 | ❌ 不返回（只有 id + `supported_endpoint_types`）|
| `deepseek-v4-flash` 是否可用 | ❌ `model_price_error`（不在该套餐可用列表），且不在 `/v1/models` |
| `glm-5.1` 是否可用 | ❌ `model_price_error`；`/v1/models` 只有 `glm-5.3` / `glm-5.2` / `glm-5.3-flash` |
| `glm-5.3` / `glm-5.2` 是否可用 | ✅ 对话 + 工具调用均通过（未入池）|


---

## 已完成改动台账

> 原 `MULTI-AGENT-DESIGN.md` §8.1 / §8.1.1 / §8.1.2 / §8.1.3。剩余待办见该文档 §8.1 起。

### 8.1 v1.1 已完成

| 改动 | 章节 | 备注 |
|---|---|---|
| build 19 条危险命令 ask | §4.4.1 | bash last-match-wins |
| MCP 5 个写工具 deny/ask | §4.4.2 | 含 query_graph |
| subagent question 统一 deny | §4.4.3 | 与 prompt 自洽 |
| general 砍 npx/node/npm test | §4.4.3 | 严格 read-only |
| oracle/metis bash 改 deny+白名单 | §4.4.3 | 消除 ask 挂起风险 |
| explore websearch 改 deny | §4.4.3 | 本职是本地搜索 |
| plan 写入路径改 `.plans/` | §4.4.4 / §6.1 | 命名空间隔离 |
| `scripts/plans-init.sh` | §6.1 | 幂等 .gitignore 配置 |
| `commands/plans-init.md` | §6.1 | `/plans-init [path]` 命令 |

### 8.1.1 v1.2 已完成（2026-10-15）

| 改动 | 章节 | 备注 |
|---|---|---|
| 新增 `critic` subagent | §2.3 / §2.4 | 对抗式审稿，第 8 个 agent |
| `prompts/critic.md` 4 段式 prompt | §2.3 | 强制 BLOCKERS/SHOULD_FIX/NITS/验证建议 |
| critic 权限最严化（webfetch/websearch/task/question 全 deny）| §4.5.2 | R-06 |
| critic MCP 10 工具全 deny | §4.5.2 | 不查代码图谱 |
| `build.md` 加入 "何时调 critic" 5 条件 | §3.2 / §3.2.1 | R-07 |
| `build.md` 加入 critic 委派原则 | §2.2 | build agent 知道 critic 存在 |
| 移除 `zhipuai` 空 provider | §5.1 | 2026-10-15 清理 |
| 同步更新 §2.1 总览表 / §3.1 矩阵 / §4.3 权限表 | — | 反映 8 agent 现状 |
| 同步更新 §6 文件结构 / §6.2 JSONC 结构 | — | 反映 8 agent + 3 provider |

### 8.1.2 v1.3 已完成（2026-10-21）

| 改动 | 章节 | 备注 |
|---|---|---|
| OpenCode v2.1.2 schema 迁移（permission 扁平化 / `providers` / `experimental.subagent_depth`）| §4.6.1 | 旧写法在 v2 下静默失效 |
| `.env` 保护修复（agent 级 `read` 改对象形式 + shell 级 deny）| §4.6.2 | 内置 `*.env` ask 曾被 `read: allow` 覆盖 |
| 只读白名单收敛（砍 `awk` / `env` / `printenv` / `jq`）| §4.6.3 | `awk` 可 `system()` 任意命令 |
| critic 只读图谱工具恢复 + plan 的 MCP 写操作恢复 `ask` | §4.6.4 | 迁移时误降级 |
| 5 个只读 subagent 输出 XML → Markdown | §2.3 | 省 token、可读性更好 |
| 新增 `context-builder` subagent + `/critic-review` command | §2.3 / §3.1 / §3.2 | critic 上下文组装器 |
| 备份文件与明文密钥隔离（`.gitignore` + 移出索引）| §6 | `backup_v1/opencode.jsonc` 含明文 key |

### 8.1.3 v1.4 已完成（2026-10-21）

| 改动 | 章节 | 备注 |
|---|---|---|
| 模型元数据补全（`capabilities` × 12、`limit.context` 修正 × 4）| §5.1 | 按"厂商直连 / 实测 / 上游一致"分级取证据 |
| `librarian` → `openstarry/kimi-k2.6` | §5.2 | 成本优先；`deepseek-v4-flash` / `glm-5.1` 实测不在套餐，未采用 |
| 新增 `title` agent（glm-5.3-flash，不思考）| §2.1 / §2.3 | 替代 deprecated 的 `small_model` |
| `context-builder` 改 `hidden: true` | §2.3 | 避免污染用户手选列表 |
| `plan` / `oracle` 去掉 `temperature` | §2.1 | 模型 `temperature=false`，设了被忽略 |
| 角色矩阵从 `AGENTS.md` 移入 `prompts/build.md` | §1.2 / §6 | 消除与 subagent「固定小节」输出的冲突 |
| 6 个 subagent prompt 补「被权限拒绝即终止」+ 禁区清单 | §3.3 | 阻止 agent 换写法绕过权限 |
| `critic.md` 补「无法验证必须说明」 | §2.3 | 避免未验证结论被当成 PASS |
| `build.md` 补 subagent 返回结构表 + context-builder 触发条件 + 委派带 project 名 | §3.2 / §3.3 | 减少空转工具调用 |

### 8.1.4 v1.9 已完成（2026-11-03）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 新增「rdd-workflow 增强层（可选）」节 | §2.6 | 角色矩阵自足；skill 只在前置条件满足时调用 |
| 角色 ↔ 可选增强映射表（architect/planner/builder/verifier/general）| §2.6 | 前置条件取自各 skill frontmatter 原文 |
| 工件归属规则（同一路径上单一写入者 + 下游阶段写输入工件）| §2.6 | 解 `proposal.md` 双写风险 |
| 内置流程降级细节（openspec CLI / rddf CLI 缺失 / skill 调用失败）| §2.6 | 增强层故障不阻塞交付 |
| 新增 `scripts/rdd-skills.sh`（探测 + `--json`）| §6 | 探测顺序对齐 rdd-workflow `resolve_rdd_skill_dir` |
| verifier 产出契约的 `rdd-verifier` 分流条件 3 增补脚本判定路径 | §2.6 | 与增强层判定口径一致 |
| 角色矩阵自查清单增 2 项（探测 / 单一写入者）| §2.6 | 防止"装了 workflow 就乱调 skill" |
| 协作审计：统一 verifier 判定口径（以 skill frontmatter 为权威）| §2.6 | 消除「分流三条件」与增强层前置条件两套标准 |
| 协作审计：planner/builder 角色列表标注 `proposal.md` 归属 | §2.6 | 角色权限与工件归属规则不再自相矛盾 |
| 协作审计：补 `deps` / `execute` 的完整前置条件 | §2.6 | 映射表此前缺 2 个 skill 的可判定条件 |
| 协作审计：新增 pause / commit 契约（HARD pause 优先、commit 全局确认优先、`rdd-quick` 不自行进入）| §2.6 | `rdd-builder` P2 COMMIT GATE 与全局"不主动 commit"直接冲突 |
| 协作审计：可用性以 `skill` 工具为准，脚本仅作预筛 | §2.6 | 脚本 skill 名单是上游镜像，会漏判新增 skill |
| 协作审计：`design.md` 实际归属（`rdd-builder` P1 只生成 `tasks.md`）| §2.6 | owns 声明与 `phase1_plan.sh` 实现不一致 |
| `role-init.sh` 增 `.gitignore` 提示 | §6 | `role.json` 是个人状态，rdd-workflow 的 gitignore 守卫只覆盖 `openspec/` |
| 明确 `design.md` 定稿责任：`plan` agent 产出为草稿，`builder` 角色定稿 | §2.6 | 权限保持不动（方案 a），只消除"谁定稿"的模糊 |

### 8.1.5 v2.0 已完成（2026-11-04）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 新增「审查配对（每个角色由谁审）」节 | §2.7 | 4 行配对表 + 顺序约束 + 预算分层 + 不可用降级 |
| `architect` 审查改为 **oracle 先行 + critic 后审** | §2.7 | oracle 审「会怎么坏」，critic 审「是否越界 / 冲突」；顺序颠倒会白烧一轮预算 |
| `planner` 审查固化为 **metis**（新建或重写 ≥1/3 才触发）| §2.7 | 纯状态推进不审，避免噪音 |
| `builder` 审查固化为 **verifier（角色内建）+ critic（仅架构面）** | §2.7 | verifier 是角色不是 subagent → 不依赖 rdd-workflow |
| 审查预算按**文档粒度**分层（ADR 级 / improvement 级 / change 级）| §2.7 | 单条 change 审查上限 = critic 2 + verifier 3，不叠乘 |
| 审查者不可用**降级路径**（内置自检清单 + 结论首行注明）| §2.7 | 2026-11-04 实测 subagent 因 Token Plan 上限全部失败 |
| `build.md` 委派原则增加交叉引用（本节管「何时委派」，审查配对管「必须委派给谁」）| §2.7 | 两处规则此前互不知情 |
| `build.md` 自查清单增 2 项（固定审查者执行 / 不可用降级注明）| §2.7 | 防止「忘了审」与「静默跳过」 |
| 治理面改动（`prompts/**`、矩阵文档）归入 `architect` 产出，**必须过 oracle**（增删规则再加 critic `arch` 档）| §2.7 | 此前改矩阵本身不属于任何角色 → 零审查；上一轮 A1「verifier 两套判定标准」就是改错后返工的实例 |
| 治理面**降级自检清单** 6 条（不变式 / 权限 / 双判据 / 可判定 / 降级路径 / 预算冲突）| §2.7 | oracle 不可用时逐条自问，缺一条判未通过 |
| 治理面规则**首轮 oracle 审查**：8 条 finding（A1–A8）全部闭合 | §2.7 | 复审 `PASS-WITH-NOTES`；3 处一词级残留（§2.7 镜像摘要漂移）已按最小修法补齐 |
| 关键修正：治理面作用域补 `~/.config/opencode/` 前缀 + `AGENTS.md` / `docs/CHANGELOG.md` | §2.7 | 裸相对路径在项目 cwd 解析不到 → 规则永不触发；`AGENTS.md` 注入所有 agent 却此前不在作用域 |
| 关键修正：oracle 治理面审查须给 `PASS \| BLOCK \| PASS-WITH-NOTES` verdict + finding 逐条应答 | §2.7 | oracle 原生只有 4 节建议、无 pass/fail → 「调用过」会被误读成「通过」 |
| 关键修正：builder 撞到治理面缺陷 → findings + halted，不静默越权 / 不静默忽略 / 不死等 | §2.7 | 治理面归属 architect 但 builder 有仓库 edit 权限，原规则下 agent 只能二选一地犯错 |
| 关键修正：审查调用**一次失败即降级、不换模型重试**；「一次改动」= 一个 patch series 的文件集合 | §2.7 | 额度类失败是持续态，重试只烧预算；未定义计数单位会导致逐文件重复审查 |

### 8.1.6 v2.0.1 已完成（2026-11-04）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 架构文档范围节改为**判定三态**（配置存在且路径存在 → `arch_paths` / 配置缺失·空·损坏 → fallback 目录集 / 都不存在 → 只讨论不落文档）| §2.5 / §2.3 | 原规则「缺失或 `arch_paths` 为空 → 先跑 `/arch-docs-init` 再继续」在**没有架构文档目录的项目里死循环**：脚本扫不到目录就写空 `arch_paths` 并 WARN，重跑不收敛 → `architect` 第一步即卡死 |
| `/arch-docs-init` 从**前置闸门**降为**可选工具**（第 2 态判定时最多跑一次 `--dry-run`）| §2.5 | 只有用户想建立/更新目录结构时才跑（首次梳理 / 结构变更后 `--refresh`），不再因配置缺失而反复调用 |
| 消除 `build.md` 内部两套判定标准 | §2.5 / §2.3 | §2.3 档位映射已有 fallback 目录口径，§架构文档范围 此前没有 → 同一文件对「配置缺失」给出两种处置；本轮统一到同一套目录口径（§档位选择 的 `arch` 档路径集 = **权威映射**，critic 侧路径推断仅兜底）|
| 治理面**首轮 oracle 审查**：4 条 finding（F1–F4）全部闭合 | §2.5 | verdict `PASS-WITH-NOTES`，无 BLOCKER；F1 顶层架构目录漏判 → 目录集扩为 fallback ∪ `survey()` 目录；F2 配置路径全失效 → 态 1 加存在性校验；F3 `--check` 的 `MISSING`/`EMPTY` 误示为漂移 → 规则侧注明；F4 措辞 → 出口条件放宽 |
| 治理面**首轮 critic 审查 REJECT**：1 条 BLOCKER 闭合 | §2.5 / §2.7 | 态 3「只讨论不落文档」与治理面归属冲突 → 本仓（`~/.config/opencode`，无 ADR 目录）出现「**无角色可写 `prompts/**`**」：architect 按态 3 拒写，builder 按 §2.7 halted → 修法：§架构文档范围 加「管辖边界」（**治理面文件 `~/.config/opencode/**` 不受项目级 `arch_paths` 管辖**）+ 角色列表 architect 行补治理面编辑权 |
| critic SHOULD_FIX / NITS 闭合（口径统一 + 措辞补齐）| §2.5 / §2.3 | 可写范围拓宽到 `survey()` 目录后「什么算 arch 产物」仍是第二套判据 → §档位选择 的 `arch` 行扩为同一套目录集 + 明写「本表是权威映射」；`MULTI-AGENT-DESIGN.md` 路径映射同步；出口条件与触发时机补「JSON 损坏 / 路径全部失效」 |

### 8.1.7 v2.0.2 已完成（2026-11-04）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 治理面作用域表新增 `commands/**`（slash command = agent 行为指令，与 prompt 同级）与**被治理面规则行为依赖**的 `scripts/**`（改其退出码 / 报错文案 / 落盘行为时）| §2.7 | 此前两者都不在作用域表 → 改 agent 行为指令、改被引用脚本的退出码**都不触发审查**；触发条件收紧为「行为依赖」以排除历史记述性提及 |
| `scripts/arch-docs-init.sh` `--check`：**漂移只在配置已声明 `arch_paths`（判定三态 第 1 态）时成立**；配置缺失 / `arch_paths` 为空 / 配置损坏时只输出 `NOTE`、exit 0 | §2.5 | 旧语义把「未配置 / 空」判为漂移（exit 2）并输出「运行 /arch-docs-init 生成」→ agent 见它就回头跑 init → **半死循环残留**。10 场景夹具实跑全 PASS（`/tmp/opencode/p0/test-check3.sh`，含 init 产物往返自检）|
| `commands/arch-docs-init.md` 用法与报告要求同步（`NOTE` 的 4 种情形；报告要求 3 限定「仅当配置已声明 `arch_paths`」；要求 4「不要据此反复跑 init 或 `--refresh`」）| §2.5 | 消除「#3 跑 --refresh」与「#4 不要跑 init」互相冲突的下一步指令 → 无用户意图写盘 |
| `commands/role-init.md` 提示改为「按判定三态确定可写范围（不阻塞），需要固定时再跑 init（可选）」| §2.5 | 原提示「先运行 /arch-docs-init」与「可选工具、非闸门」冲突 |
| `prompts/critic.md` arch 档兜底目录集改引用 build 侧权威映射 + build 档补 `tools/**` + 锚点改指 §架构文档范围 | §2.3 | 消除「build 权威 / critic 兜底」两套目录口径 |
| `prompts/context-builder.md` 路径映射 arch 行同步为同一套目录集口径 | §2.3 | 第三套旧 5 目录口径收尾 |
| `docs/MULTI-AGENT-DESIGN.md` 头部状态 v1.9 → v2.0.2 + 本版变更行；§2.7 治理面作用域同步（谓词改「行为依赖」）| 头部 / §2.7 | MD 头部停在 v1.9、§2.7 作用域列表落后于 build.md |
| 治理面审查（v2.0.2 批）：oracle `PASS-WITH-NOTES`（7 finding 全闭）→ critic 首轮 `REJECT`（BLOCKER：文档承诺「exit 0」在**盘上有架构目录**时为假）→ 脚本侧收敛为「漂移仅态 1 成立」→ 复审 `APPROVE` | §2.7 | **自指审查**（本批含 `prompts/critic.md`、`prompts/context-builder.md`、§2.7 本身）→ 结论**不构成独立证据**；复审记 1 条 NIT 入 backlog（态 1 / 态 2 在「声明路径全部失效」场景下的名义差异，两者动作一致均为 `--refresh`）|

### 8.1.8 v2.0.3 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `scripts/arch-docs-init.sh` `load_arch_paths()` 重写：逐字符扫描、引号外的 `]` 即数组结束符、字符串转义反转义 | §2.5 | 旧实现按正则抓所有引号串、不知道数组在哪结束 → 手写**单行** JSON 会把 `]` 之后的键名/值当路径 → **假 STALE** → exit 2 → agent 被误导去 `--refresh`（而 `--refresh` 会覆盖配置、丢掉该条目）|
| `scripts/arch-docs-init.sh` 新增 `arch_paths_state()` 状态机（`ok` / `empty` / `corrupt` / `missing`），`--check` 三态各有专属 NOTE | §2.5 | 「多行空数组」原被误判「损坏」；「含 `arch_paths` 字段但数组截断」原被并入「为空」（不提示修复）→ 现按数组是否闭合区分 |
| `prompts/build.md` 态 1 补「部分路径失效仍属本态」；字段说明补键顺序约束；`--refresh` 补「先 `--dry-run` 比对会丢弃的条目」护栏 | §2.5 | 收掉上一批 critic 的 NIT（态 1 / 态 2 名义差异）与「`--refresh` 静默覆盖手写配置」隐患 |
| 新增 `tests/verify_arch_docs_scope.sh`（验证夹具，35 条断言）| §2.5 | 项目形状**直接复用 rdd-workflow-e2e 测试床的真实 fixture**（`setup_fake_project` / `write_arch_fixture` / `write_proposal_fixture`）→ 验证对象与 arch→planner→builder 工作流里的真实布局一致；断言脚本行为（exit code + 输出）+ 规则文本一致性 |
| 治理面审查（v2.0.3 批）：oracle `PASS-WITH-NOTES`（7 finding）→ critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 2 SHOULD_FIX）| §2.7 | **非自指批次**（不改 `prompts/critic.md`、§2.7 治理面作用域表）→ 结论**可作独立证据**；oracle 的 7 条 finding 全部处置；critic 的 2 条 SHOULD_FIX（截断 JSON 误标「为空」、「`--refresh` 无护栏」）**在审查后按建议修复**（按预算规则未再开复审轮，以夹具 35/35 + e2e 48/48 为证据）|

### 8.1.9 v2.1.0 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` architect 产出形态契约新增**「一次成稿流程」聚合块**（4 步：定位 / 成形 / 送审 / 收口，每步给判据落点）| §2.5 | architect 写一份 ADR 所需的判据此前散在 build.md 的 11 处、跨约 380 行 → 聚合块作**单点入口**，自查清单与降级自检改为只引用它（消除复述漂移点）|
| `build.md` 新增**「ADR 完成的标志」**（5 条：四要素齐 / oracle+critic 双审且报过 BLOCKER 须 1 次复审确认闭合 / `Status` 转已决 / 关联 change 已落库**或已登记**为 `backlog: <improvement 名>` / 审稿报告由 architect 誊写落 `.rddf/reviews/<adr>.md` 且被元数据引用）| §2.5 | 此前只有「形态清单」没有「什么算写完、审完谁改 Status、change 何时填」；**关联 change 允许暂态** → architect 不越权建 change、不永远停在 Draft |
| `build.md` 新增**「arch 档审稿判据摘要」**（BLOCKER 四类 + SHOULD_FIX 六类），并注明「以 `prompts/critic.md` 为准，本摘要是随取随用的索引」| §2.5 / §2.3 | 调 critic 时据此**选 2–3 条最相关重点**填 `focus`（不罗列全量）；oracle 不可用时据此逐条自检（不必再翻 critic.md）|
| `build.md`「对齐已有样板」补**无样板时的默认骨架**（元数据 → 背景与问题 → 决策 → 选项对比表 → 后果 / 代价 → Verification（可勾选验收判据））| §2.5 | 原先只让人向「ADR-091 / ADR-089 这类六段骨架」收敛，但既没给六段是哪六段、项目里也常无样板 |
| `build.md` 四要素：元数据加 **AC 映射**（change 未立项时允许暂缺、以 `backlog: <名>` 占位）、章节名统一为 **Verification（可勾选验收判据）**；verifier 产出契约的判据来源补第 4 项 | §2.5 / §2.6 | 消除「Verification 一词双义」与「ADR↔change 的 AC 断链」——verifier 现在能直接消费 ADR 的判据 |
| `build.md` §审查配对 architect 行：「产出去向」补齐 Decision 段 / 选项对比表；预算补「**BLOCKER → 允许 1 次复审**（只验闭合）」；§自查清单与 §降级自检改为引用聚合块 | §2.7 | finding 落点不再只限两章；复审轮次与治理面行同构（此前 architect 行漏写，完成标志因此永不可满足）|
| `docs/MULTI-AGENT-DESIGN.md` §2.5 同步 3 条要点 + 头部 v2.1.0；`tests/verify_arch_docs_scope.sh` 补 7 条断言（含 4 条**防漂移断言**：内联摘要条目数 == `critic.md` arch 档原始条数）| §2.5 | 摘要与 `critic.md` 是两份文本 → 用夹具锁住条数，防漂移 |
| 治理面审查（v2.1.0 批）：oracle `BLOCK`（1 BLOCKER + 2 SHOULD_FIX + 3 NITS）→ 全部处置 → critic 复审 `APPROVE`（BLOCKER 已闭合、无新 BLOCKER、1 SHOULD_FIX）| §2.7 | **自指审查**（本批改动的正是 §审查配对 表格行 / §自查清单 / §降级路径）→ 结论**不构成独立证据**；critic 复审的 1 条 SHOULD_FIX（AC 映射强制性与 backlog 暂态的字面顶牛）**在审查后按建议补一句消除**（未再开复审轮，证据：夹具 43/43 + e2e 48/48）|

### 8.1.10 v2.1.1 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 角色列表表后新增「**固定审查者不受『允许』列限制**」：逐角色枚举（architect: oracle → critic / planner: metis / builder: verifier 为角色内建 / 另有治理面行与架构面行 —— 以 §审查配对 为准，枚举非全集），`no-role` 按本表禁止列**不得调写类 subagent**（只读调研类仍可用）| §2.7 | **修 G1 硬矛盾**：architect 的允许列未列 `critic`，而 §2.7 要求 oracle → critic 双审 → 角色表（权限上限）与配对表（流程下限）互相限制。取**通用不变量**而非逐行补词（逐行补词只治一个角色，且诱导「没列 = 不能调」）|
| `build.md` §委派原则新增「**调研委派协议（explore / librarian）**」：材料不触发审查 / 必须委托 / 不必委托 / 一次一问（给清范围 + 期望输出）/ 权限不扩权（planner 走自读或 metis，verifier 走自读）/ 场景表指向 MD §3.2 且执行口径以本节为准 | §2.3 | **修 G2 协议缺口**：调研型此前只有任务类型映射 + 两条软约束，没有「何时必须/不必委托 / 一次一问 / 权限不扩权」，而审查型（oracle/critic/metis）有完整协议 —— 完备度差一个量级 |
| `build.md` `:37` 的 explore 映射加「**简单定位除外**」指针 | §2.3 | 消除 build.md 内部新旧口径冲突（旧 bullet 是无条件映射，新协议是有条件豁免，同节无优先级声明）|
| `docs/MULTI-AGENT-DESIGN.md` §3.1 注 + §3.2 指针 + 头部 v2.1.1 | §3 | §3.1 是 **agent 级**委派矩阵，与 build.md 的**角色列表表**不是同一张表 → 头部注与正文注统一主语并限定「本节 agent 矩阵的 ❌ 不在豁免范围」 |
| `tests/verify_arch_docs_scope.sh` 补 2 条 needle + 3 条**角色表结构完整性**断言 | §2.5 | 「表被插入内容劈开」这条断言在编写过程中**真的抓到一次**我造成的表格断裂（clause 插在 `no-role` 与 `general` 行之间）→ 修复后复跑通过；结构断言已固化，可防同类事故 |
| 治理面审查（v2.1.1 批）：oracle `PASS-WITH-NOTES`（2 SHOULD_FIX + 4 NITS）→ 全部处置 → critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 2 SHOULD_FIX）| §2.7 | **部分自指**（新增条款涉及角色权限表与 §审查配对 的关系）→ 结论**不构成独立证据**；oracle S1（内部口径冲突）/S2（no-role 与禁止列矛盾）/S3（「等 subagent」可被读成类型）/S6（协议对 planner/verifier 空转）已修；critic 的 2 条 SHOULD_FIX（verifier 无 metis 权限却由 :54 旁授 / MD 头部注主语错位）已修 |

### 8.1.11 v2.2.0 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` §角色切换新增「**实施阶段的新发现**」子节：5 行分类表（计划对实现漏 / `plan_drift` / `design_drift` / `blocked` / `noted`）× 判据 · 停下义务 · 增强层落点 · 无 rdd-workflow 落点 · 路由 | §2.2 | 补**真空 A**：实施阶段没有「新发现」分类法 —— `implementation_gap`/`proposal_drift` 只服务**验收**阶段，builder 实施中发现设计错误 / 计划漏项 / 新需求时归哪类、回给谁、要不要停，原先无规定 |
| 分类**复用 rdd-workflow 既有 kind**（`needs-revision` / `ac-fail` / `blocked` / `noted`），不新造 | §2.2 | 产品侧已有完整 backward 通道：`rddf feedback add`（single writer ADR-0037）+ loop guard + 双读通道；治理面只补「用哪个 kind / 落到哪 / 停下义务 / 路由 / 顺序 / 窗口触发条件」|
| 配套规则：先落记录→再切角色 / 停下粒度（量化阈值 + **无 task 清单时停整个 change**）/ 不得手写反馈文件 / 双重保险 / **预算共享**（revision_count 上限 3 → 同类 findings 合并提交）/ 跨层优先级（覆盖 skill advisory 续跑）/ 两类漂移并发 design_drift 优先 | §2.2 | 「先落记录」的理由是：切换会丢原上下文，而 feedback 通道正是 planner/architect 的读入口，先写才有交接凭据 |
| `build.md` §授权窗口新增 `builder → planner`（plan_drift）、`builder → architect`（design_drift）两条触发条件；统一「每一次窗口内的**角色间**自动切换都计入 `used += 1`」（→ no-role 不计入，窗口随即清空）；示例处加注「须用户把 `planner`/`architect` 写进 `roles`」 | §2.2 | 补**真空 B**：实施中最该自动化的两条**不在**窗口触发清单里 → 即使用户开了含这两个角色的窗口，也因「无明确触发条件」只能停下问用户 |
| `build.md` 角色列表 `builder` 行：「变更决策需切 `architect`」补成处置（findings + 停下 + 交用户 / 窗口内切 architect） | §2.2 | 与 §治理面缺陷条（findings + halted）同型，消除「只写禁令、不写停下义务」的名义不一致 |
| **读入口对齐产品源码**：`design_drift` 落 improvement 文件的 `## Feedback` 段，architect 经 `rddf feedback list <proposal>` 读 —— 明示**勿依赖 `.planner-feedback.json` 提升链** | §2.2 | oracle 查证：`route_feedback` **无生产调用方**；`rddf arch feedback` 读 `severity`/`status`/`proposal` 而 appender 不产出 → 真进了该文件会 KeyError → 原括注会让 architect 看不到 drift 内容、交接断裂 |
| `docs/MULTI-AGENT-DESIGN.md` §3.2.0 回环指针 + 头部 v2.2.0；`tests/verify_arch_docs_scope.sh` 补 3 条 needle + **kind 防漂移断言**（真读产品 `VALID_KINDS` 做**全集差集**，新 kind 会立刻报错）| §3 | 产品改 kind 集合时治理面同步告警，杜绝「自造分类」 |
| 治理面审查（v2.2.0 批）：oracle `PASS-WITH-NOTES`（3 SHOULD_FIX + 3 NITS）→ 全部处置 → critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 2 SHOULD_FIX + 3 NITS）| §2.7 | **自指审查**（本批改动的正是角色切换 / 授权窗口契约）→ 结论**不构成独立证据**；oracle F1（`.planner-feedback.json` 提升链未接线，括注错误）/F2（命令缺 `--from` 与位置参数）/F3（无 task 清单时停下不可判定）已修；critic 的 2 条 SHOULD_FIX（跨层优先级未覆盖「落点/读通道」冲突 / discovery 与验收重试共享 revision 预算无节流指引）与 3 条 NITS **在审查后按建议修补**（未再开复审轮，证据：夹具 52/52 + e2e 48/48）|
| `docs/rdd-workflow-product-issues.md`（**新增**）：把 v2.2.0 实施期核查中发现的 4 处产品缺陷整理成可直接提交上游的 issue 文本 | §3 | A：`route_feedback` 无生产调用方（提升链未接线）/ B：`rddf arch feedback` 对 appender 条目 KeyError / C：planner-feedback 重算静默丢 open 条目 / D：`skills/rdd-builder/SKILL.md` 落点描述与实现不符 —— 均附源码行号、复现步骤与建议修法 |
| `build.md` §角色列表权限修订（**v2.2.1**）：`planner` 补 `explore` / `librarian`（+「先自读」默认序 +「架构取舍停下请用户切 architect」的护栏）、`verifier` **只补** `explore`、`no-role` 允许列显式列出只读调研；§调研委派协议「权限不扩权」条目改为中性表述 | §2.2 | 补角色**只读调研**能力缺口（此前 planner/verifier 只能自读）；边界不变式保持（禁止列逐字未动，扩权只在「读」侧）。**同时取代 8.1.11 台账里「权限不扩权（planner 走自读或 metis，verifier 走自读）」的表述** —— 该 carve-out 已随本批删除 |
| `tests/verify_arch_docs_scope.sh`：内联摘要 ↔ `critic.md` 判据的**语义级**防漂移守卫（10/10 对应表）+ 「已废止 carve-out 措辞零命中」防回流断言 | §2.5 | 前者把防漂移从**条数**升级到**语义对应**（critic.md 改判据措辞 → 断言失败，要求同步对应表；负向测试确认会咬：改摘要一个词即 FAIL + exit 1）；后者防「planner/verifier 走自读」旧措辞回流成第二套判据 |
| `docs/MULTI-AGENT-DESIGN.md` 新增 **§2.8 角色切换与授权窗口**（角色轴投影）：三轴区分 / 角色一览 / `role.json` 状态文件 / 切换策略 / 授权窗口（四条件 + 6 条触发条件 + 关闭窗口 + 审计写入）/ 实施阶段新发现回环 | §2.8 | 补**结构性缺口**：MD 自称「当前态单写」，但**角色轴（persona）整条机制此前只存在于 `prompts/build.md`**（MD 有 agent 轴 §2/§3、有 tool 权限轴 §4，唯独缺角色轴）。投影**不改任何规则语义**，并声明执行权威在 build.md |
| `docs/MULTI-AGENT-DESIGN.md` §7.1 验证状态加 1 行 | §7.1 | 如实标注：机制为 prompt 级软约束，**未在真实 session 做运行时验证**（与 §7.2 口径一致）|
| `tests/verify_arch_docs_scope.sh` 加 9 条 MD 投影护栏 | §2.8 | 5 条锚点存在性 + 触发条件表**行数**（防漏行类漂移）+ 关闭窗口 / 审计写入 / auto 标记 / architect 治理面编辑权 —— critic 指出「needle 只锁存在性、锁不住漏行」后补强 |
| 治理面审查（MD §2.8 批）：**oracle 不可用**（原因：`opencode.jsonc.opencode-go` 中 oracle/metis 切到 `kimi-code/kimi-for-coding`，该模型无 `high` 变体 → subagent 调用失败）→ 降级为 critic 审查 + 治理面降级自检清单 6 条自检 | §2.7 | critic 判 `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 3 SHOULD_FIX + 2 NIT）：3 条 SHOULD_FIX 均为**投影漏项**（漏「关闭窗口」、把权威源的 4 条条件写成「三条件」、architect 行漏治理面编辑权）→ 已修；NIT（`general` 同名消歧 / CHANGELOG 版本断链）→ 已修。**本次为单审查者 + 自检，非双审**，结论不构成独立证据 |

**本批遗留（记入 backlog / 待上报）**

- **待上报 rdd-workflow 产品仓**（不在本仓范围）：`route_feedback` 无生产调用方 → `.planner-feedback.json` 提升链实际不通；`rddf arch feedback` 对 appender 产出的条目会 KeyError（字段不匹配）；planner-feedback 重算会丢弃未 resolved 的 open 条目；`skills/rdd-builder/SKILL.md` 的落点描述（「add 写入 .planner-feedback.json」/「Architect reads via `rddf arch feedback`」）与实现不符。治理面的警示注释依赖这些事实，产品侧修掉后注释需同步更新。
- discovery 记录与验收重试共用 `revision_count`（默认 3）—— 两类消费同一预算，本仓无法分离；已在规则里写明「同类 findings 合并成一条提交」。
- 无 `tasks.md` 的路径（rdd-quick / 本地）一律按停整个 change 处理，粒度偏粗（保守方向）。

**本批遗留（记入 backlog）**

- `planner`（角色）与 `plan`（agent）同名近形：协议锚在「见 §角色列表」且有「执行口径以本节为准」兜底，暂不冲突；若 plan agent 的角色表将来扩行，需在协议里写明「planner 角色（非 plan agent）」消歧。
- `no-role` 的「只读调研类 subagent 仍可用」依赖「禁止列反推允许」的读法（no-role 允许列未列任何 subagent）——行为合理，但若将来给 no-role 行补「调 `explore` / `librarian`（只读）」可从根上消歧。

**本批遗留（记入 backlog）**

- 内联判据摘要与 `prompts/critic.md` 仍是两份文本 —— 夹具只锁住「条数」，不锁「每条语义」；critic.md 改判据时需同步摘要。
- 「一次成稿流程」的 4 步是**入口收敛**，不消除 build.md 内部其余章节（角色列表 / 增强层 / 权限模型）的跨段引用成本。
- 「ADR 完成的标志」第 4 条的 `backlog: <improvement 名>` 登记位目前**无落盘位置约定**（未指定写在哪），暂由 architect 在响应正文声明。

**本批遗留（记入 backlog，不在 v2.0.3 处理）**

- 夹具的规则断言是**文本存在性**校验（非语义校验）——若规则被改写但保留锚点短语，needle 仍会过；语义正确性主要由行为断言组承载。
- `prompts/build.md` 字段说明里的键顺序约束构成「合法 JSON ∧ 生成器形状」的第二重 conformance（手写配置违约面变大）。
- 夹具组④与 e2e 床 fixture 内容耦合（床新增架构目录时需同步扩展，已加显式假设断言 + fallback 降级告警）。
- awk 对 `\n` / `\t` 等控制字符转义保留双字符（路径含字面 `
` 时仍是假路径，已注释声明为降级行为）。

### 8.1.12 运行环境修复：kimi-code provider（2026-11-05，v2.2.3）

| 改动 | 章节 | 备注 |
|---|---|---|
| `opencode.jsonc.opencode-go`：`providers["kimi-code"].package` 由 `@ai-sdk/openai-compatible`（V1 老名）改为 **`@opencode/ai/providers/openai-compatible`**（V2 官方名） | §5.1 | V2 文档列的是后者；二进制内两名并存（V2 名 7 处 / 旧名 4 处），故属**迁移**而非「修复不存在的东西」 |
| `providers["kimi-code"].models["kimi-for-coding"]` 补 `variants`：`none→reasoning_effort:off` / `low` / `high` / `max`；`models["k3-256k"]` 补 `low` / `high` / `max` | §5.1 | 真正病因：oracle 声明了 `"variant": "high"`，而该模型的 variant 集为空（配置覆盖了目录条目且未声明 `variants`）→ `Variant unavailable for kimi-code/kimi-for-coding: high`。`metis`/`critic` 未声明 variant 所以不受影响 |
| 实测确定字段名：`reasoning_effort`（字符串）被解析，`effort` / `reasoning` 被忽略，`thinking` 被 400 拒绝 | §5.1 | 用**类型违规探针**判定（传数字/对象 → 若字段被解析必 400），而非按文档措辞猜测；Kimi 文档模型表写 `reasoning_effort`、映射段写「传入 `effort`」两者矛盾，以实测为准 |
| 验证：JSONC 合法 → `opencode models` 即时反映 variants → 实跑 `kimi-for-coding#none/low/high/max` + `k3-256k#high` 全部正常 → 工具调用（read）正常 → 负向探针（`reasoning_effort: 123`）触发上游 400 | §7.1 | 负向探针是**决定性证据**：证明 `variants[].body` 真的合并进请求体，而不只是「没报错」 |
| `agent.oracle.variant` 由 `max` → `high`（**用户暂存改动**，随本批一并落地，非本批作者所做） | §2.1 | 补记以免 `git log` 考古断链；该改动只影响 oracle 的思考档位，不影响可用性（`high` 为 Kimi 文档推荐档） |
| MD 头部「下游/真源」两处 `opencode.jsonc.openstarry` → `opencode.jsonc.opencode-go`（符号链接实际指向；openstarry 文件已不存在） | 头部 / §2.1 | oracle 审查发现：读者按 MD 找真源会扑空，§11 校验流程锚错文件 |
| `docs/MULTI-AGENT-DESIGN.md` §5.1 变更注记 + §7.1 两行验证状态 + 头部 → v2.2.3 | §5.1 / §7.1 | 纯投影，不改规则语义 |
| 治理面审查（kimi-code provider 批）：oracle `PASS-WITH-NOTES`（4 条 NIT/none-blocking）→ critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 1 SHOULD_FIX + 3 NITS） | §2.7 | oracle 从**二进制源码**证伪了「agent 不声明 variant 时默认取 variants 首项」的风险（`r===undefined` → 原样返回，无首项逻辑）→ `metis`/`critic` 行为与本批前逐字节一致；并确认换包名是**真实代码路径切换**（V2 名命中内建包表，走原生 route 实现），非 no-op。处置：SHOULD_FIX（§11 校验流程仍指 `opencode.jsonc.openstarry`）→ 已连同 §6 文件树 / §4.4 **6 处**一并修正；NIT（§5.1 注记把 `k3-256k` 写成含 `none`）→ 已修。**本批即双审链恢复的证据**：oracle 全程 `variant: high` 正常工作 |

**本批遗留（记入 backlog）**

- `docs/MULTI-AGENT-DESIGN.md` §11「修改后必做」与 §6 文件树、§4.4 的真源指向此前仍写 `opencode.jsonc.openstarry`（该文件已不存在）—— **本批已一并改为 `opencode.jsonc.opencode-go`**（残留的历史 v1.8 注记保留原文，它们描述的是当时的事实）。
- `opencode-go` / `openstarry` / `minimax-cn` 仍用 V1 包名（`@ai-sdk/*`）。旧名**实测仍可用**（`opencode-go/deepseek-v4.1-flash` 实跑通过），故未一并迁移：`minimax-cn` 是 build/plan/critic 的载体，改错会中断当前会话；`openstarry` 当前无 agent 使用。建议单独一批迁移 + 逐 provider 实跑。
- `docs/MULTI-AGENT-DESIGN.md` §2.1 / §5.1 / §5.2 / §5.3 的**模型归属**已与当前配置不符（例：表中 explore / critic 仍写 `minimax-cn`，实际为 `opencode/deepseek-v4.1-flash-free` / `kimi-code/kimi-for-coding`；oracle / metis 表写 `k3-256k`，实际已切 `kimi-for-coding`）—— 漂移源自用户尚未提交的模型切换，非本批引入；待该改动定稿后一次性重算这几张表。**闭合触发（v2.2.4 补）**：工作区内模型相关未提交改动（`agents.*.model` / `providers.*.models` / `apiKey` 引用）全部提交或明确放弃后，整批重算；在此之前每批治理面改动可引用本条目递延，但递延不得超过一个批次，否则 §11 的 MUST 同步义务在事实上失效。

### 8.1.13 运行环境修复：oracle model 引用（2026-11-06，v2.2.4）

| 改动 | 章节 | 备注 |
|---|---|---|
| `opencode.jsonc.opencode-go`：`agents.oracle.model` 由工作区未提交值 `CommandCode/deepseek-v4.1-flash` 改为 **`commandcode/deepseek/deepseek-v4.1-flash`** | §2.1 | provider id 大小写敏感（实际为小写 `commandcode`）+ model 路径缺 `deepseek/` 一层，启动即 `ModelUnavailableError`；该引用形态是 `providerID/modelPath`（modelPath 自身可含 `/`，如 `deepseek/deepseek-v4.1-flash`），`variant: "max"` 与目录 `effort: low/high/max` 一致，未改 |
| 验证：`opencode models` 含该引用 → oracle subagent 实测启动并返回 4 节格式 | §7.1 | 修复前错误原文：`SessionRunnerModel.ModelUnavailableError: Model unavailable: CommandCode/deepseek-v4.1-flash` |
| 治理面审查：oracle `PASS-WITH-NOTES`（0 BLOCKER；F2「文档同步义务」报为未闭合）→ critic `APPROVE`（0 BLOCKER / 2 SHOULD_FIX / 2 NITS，`mergeable: yes`） | §2.7 | F2 处置：MD 四张表的重算并入 §8.1.12 已登记的「用户挂起模型切换批次」，本批不逐表手改，仅在此留痕 |
| 附带收益（未改配置） | §5.2 | oracle（`commandcode/deepseek`）与 critic（`kimi-code/kimi-for-coding`）自此跨厂商，审查盲区不再重合。写进留痕，避免日后以「统一模型省事」为由回退到同厂 |

**本批遗留（记入 backlog，不在本批处理）**

- `commandcode` provider **无本地 `providers` 块**（32 个模型全部来自 models.dev 目录 + 本机 credential store，凭据环境变量 `CMD_API_KEY`），§5.1 provider 池表未登记该 provider。并入模型切换批次补齐。
- oracle 的 `agent.*.model` 变更后 §2.1 / §5.1（含 provider 池表）/ §5.2 / §5.3 **未同步**（§11「修改后必做」的 MUST 条款）。已明确合并至 §8.1.12 遗留条目所述批次，不单独重算。
- 未做 oracle 的「召回校准」（F1）：`deepseek-v4.1-flash` 是否胜任第一顺位审查者，需用 §8.1.12 的已知 finding 当 ground truth 比对召回率；本批只修可用性，不验证能力。

---

## 演进日志

| 日期 | 版本 | 变更 | 原因 |
|---|---|---|---|
| 2026-11-06 | v2.4 | 新增 `model-fallback` 插件（`session.retry` 钩子 + `switchModel`）实现 build 模型降级链；同步订正 MD 的 9 处 model 漂移并补 §5.4 | 用户要求"模型不可用自动切到 `commandcode/deepseek/deepseek-v4.1-flash`"。调研确认 v2.2.5 **无**原生 fallback：schema 的 `agent.model` 是单值、插件无请求错误钩子；`SessionRetry` 钩子（error/attempt/decision）与 `SessionDomain.switchModel` 是唯一可用原语，故需自研插件。探针发现 `session.synthetic` 通知会额外触发一轮模型调用并重置降级状态，改为日志 + 原生模型指示器 |
| 2026-11-05 | v2.2.3 | 运行环境修复：`kimi-code` provider 迁 V2 包名 `@opencode/ai/providers/openai-compatible`；`kimi-for-coding` / `k3-256k` 补 `variants`（`reasoning_effort` 映射） | oracle 因 `Variant unavailable for kimi-code/kimi-for-coding: high` **持续不可用**，整条 oracle→critic 双审链断掉（上一批只能降级为单审查者）。根因是配置**覆盖**了目录条目却没声明 `variants` → variant 集为空；同一批把 V1 包名迁到 V2 官方名。字段名靠类型违规探针实测确定，不靠文档措辞（文档自相矛盾） |
| 2026-11-05 | v2.2.2 | MD 新增 §2.8「角色切换与授权窗口」：补**角色轴（persona）在设计文档里的结构性缺口** —— 此前该机制只存在于 `prompts/build.md`，MD 有 agent 轴、有 tool 权限轴，唯独缺「角色是谁 / 怎么切 / 窗口怎么授权」这一轴；新增三轴区分表以免跨轴误读 | MD 自称「当前态单写」设计参考，却缺了角色切换/授权窗口整节 → 读者按 MD 理解会以为「授权只能等用完」、也会以为 architect 可写范围仅限 `arch_paths` 命中目录（漏了治理面文件编辑权） |
| 2026-11-05 | v2.2.0 | 新增「实施阶段的新发现」：builder 实施中发现的计划层 / 决策层问题**停下并路由**（`plan_drift` → planner / `design_drift` → architect / `blocked` → 交用户 / `noted` → 仅记录），kind 复用 rdd-workflow 既有词表；授权窗口新增 `builder → planner` / `builder → architect` 触发条件 | 两处规则真空：**A** 实施阶段没有「新发现」分类法 —— `implementation_gap`/`proposal_drift` 只服务验收阶段，实施中撞上设计错误/计划漏项时归哪类、回给谁、要不要停，原先无规定；**B** 窗口内自动切换清单只有 `builder→verifier` 等四条，实施中最该自动化的 `builder→architect`/`builder→planner` 不在其中 → 即使用户开了窗口也只能停下问用户。调研发现产品侧已有完整 backward feedback 通道（`rddf feedback add` + 5 种 kind + loop guard + 双读通道），故本批**不新造分类**，只补治理面的映射、停下义务、顺序（先落记录再切角色）与窗口触发条件 |
| 2026-11-05 | v2.1.1 | 角色列表「固定审查者不受允许列限制」（修 architect 调不了自己 critic 的硬矛盾）+ 新增「调研委派协议」（explore/librarian 的必须/不必委托、一次一问、权限不扩权、材料不触发审查）+ 角色表结构完整性断言 | 分析发现两个缺口：**G1** architect 允许列未列 `critic` 而 §2.7 要求 oracle → critic 双审 → 权限表（上限）与配对表（下限）互相限制；**G2** 调研型 subagent 只有任务类型映射、无「何时必须/不必委托 / 一次一问 / 权限不扩权」，与审查型（oracle/critic/metis）的协议完备度差一个量级 → 现实里表现为「什么都先 explore 一遍」与「本该 explore 却自己 grep 十几轮」|
| 2026-11-05 | v2.1.0 | architect 产出形态契约重构：新增**一次成稿流程**聚合块（4 步单点入口）+「ADR 完成的标志」（完成闭环）+ **arch 档审稿判据摘要内联** + 无样板默认骨架 + Verification 统一命名与 AC 映射接入 verifier | 此前 architect 的判据散在 11 处、跨约 380 行，每回合跨段拼接；只有「形态清单」没有「什么算写完」（Status 谁改、change 何时填、审稿报告谁写都没规定）；调 critic 时 build 不知道 arch 档查什么（critic 是被动审稿人），oracle 不可用时「四要素逐条」是形态不是判据；样板引用（ADR-091/089）在项目无样板时不可得；「Verification」一词双义且 ADR↔change 的 AC 断链 → verifier 消费不到 |
| 2026-11-05 | v2.0.3 | `arch-docs-init` 的 `arch_paths` 解析器重写（数组边界识别 + 反转义）+ 状态机（ok/empty/corrupt/missing）+ 判定三态措辞收敛 + 新增基于 rdd-workflow-e2e 真实 fixture 的验证夹具 | v2.0.1/v2.0.2 把 `arch-docs-init` 降为可选工具后，解析器仍按正则抓引号串、不知道数组在哪结束 → 手写单行 JSON 产生**假 STALE** → agent 被误导跑 `--refresh`（会覆盖配置、丢掉手写条目）；「多行空数组」与「截断 JSON」被误判为「损坏/为空」，与规则的「损坏时提示修复」不同源。验证载体此前只有临时夹具，现固化为 `tests/verify_arch_docs_scope.sh`（35 条断言，项目形状取自 rdd-workflow-e2e 真实 fixture）|
| 2026-11-04 | v2.0.2 | 治理面作用域补 `commands/**` 与被规则**行为依赖**的 `scripts/**`；`arch-docs-init --check` 的漂移判定收紧为「仅态 1」；目录集口径在 build / critic / context-builder 三处统一 | v2.0.1 把 `/arch-docs-init` 降为可选工具后配套面没跟上：`--check` 仍把「未配置 / 空」判为漂移并指示跑 init（半死循环残留）；`role-init` 仍把 init 当前置；`critic` / `context-builder` 仍是旧 5 目录口径；`commands/**` 与 `scripts/**` 不在治理面作用域表 → 这些改动都不触发审查 |
| 2026-11-04 | v2.0.1 | 修复 `architect`「配置缺失 → 反复 `/arch-docs-init`」死循环 + 统一 fallback 判定 + 补治理面管辖豁免 | `arch-docs-init.sh` 在项目没有架构文档目录时写出空 `arch_paths` 并 WARN、重跑不收敛；而 `build.md` §架构文档范围 要求「缺失/为空就先跑 `/arch-docs-init` 再继续」→ 无 ADR 目录的项目里 `architect` 第一步即死循环。另：`build.md` 内部对「配置缺失」存在两套处置（§档位选择 有 fallback 目录口径，§架构文档范围 没有）。审查：oracle `PASS-WITH-NOTES`（4 finding 全闭）→ critic 首轮 `REJECT`（BLOCKER：态 3 挡住治理面文件 → 本仓「无角色可写 `prompts/**`」）→ 修复后复审 `APPROVE_WITH_CONDITIONS`（BLOCKER 已闭合，无新 BLOCKER）|
| 2026-11-04 | v2.0 | 新增「审查配对」（角色 → 审查者）+ 审查预算分层 + 审查者不可用降级 | 角色矩阵此前只有「什么时候委派 subagent」的触发规则，没有「哪个角色必须委派给谁」的固定配对 → 产出物可以不经任何审查就落地。实测：手上 3 个 openspec change 在 planner 阶段未过 metis 深度审查，到 critic 第 1 轮才暴露 3 处**事实性错误**（ADR 引用引反 / 目录深度写错 / 连字符模块路径 SyntaxError）。另：`architect` 原先只写「用 critic `arch` 档审稿」，漏了 oracle 的「会怎么坏」这一层，等于只审一致性不审方案本身 |
| 2026-11-03 | v1.9 | 角色矩阵与 rdd-workflow 解耦（自足内核 + 可选增强层）+ `scripts/rdd-skills.sh` | 调研发现两套角色模型零耦合：agent 角色不读 workflow 状态、workflow 不读 agent 角色；`proposal.md` 存在双写风险（agent planner 可写 / rdd-planner not_owns / rdd-builder owns）；且 `rddf guide` 的阶段检测仍认 v3 handoff 文件名，不能作为阶段真值 |
| 2026-10-13 | v1.0 | 初始设计 | 从 0 个 agent 演进到 7 个 agent |
| 2026-10-13 | v1.1 | 权限加固 4 项 + 路径修正 1 项 + slash command 1 项 | oracle 后审发现 3 类真问题（bash 无界 / MCP 写工具无界 / 描述-权限矛盾）+ plan 写入路径不一致 |
| 2026-10-15 | v1.2 | 新增 critic subagent + 权限最严化 + build.md 触发规则 | oh-my-openagent 调研发现"build 之后无审稿环节"是质量门禁缺失；critic 用 k3-256k 长上下文扫 PR diff；4 段式输出强制对抗立场 |
| 2026-10-21 | v1.4 | 模型元数据补全 + librarian 换低成本模型 + title agent + 提示词交叉修复 | 配置层三处硬伤（温度参数对不支持的模型、context limit 低报 4-8 倍、`capabilities` 缺失）；提示词层角色矩阵放错位置（AGENTS.md 注入所有 agent，与 subagent 固定小节输出冲突）；subagent 缺「被拒即终止」纪律；`small_model` 已 deprecated |
| 2026-10-21 | v1.3 | OpenCode v2.1.2 schema 迁移 + context-builder + XML→Markdown 输出 + 权限加固 | v2 的 MCP 权限 action 名改为 `<server>_<tool>`，v1 嵌套写法整体失效；顶层 `subagent_depth` 被静默丢弃；`.env` 保护被 agent 的 `read: allow` 覆盖；只读白名单里的 `awk`/`env`/`printenv`/`jq` 构成越权 |
