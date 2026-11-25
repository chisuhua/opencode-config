# 审稿报告：ADR-plan-multi-session-collaboration —— D5 落点表修订（每会话一文件）

> 对象：`docs/adr/ADR-plan-multi-session-collaboration.md` 的 **D5 落点表修订**（第 5 项：`plan-sessions.json` 单文件 → `.rddf/state/plan-sessions/<session_id>.json` 每会话一文件）+ 随之的标题订正 / 表格结构修复 / 三处陈旧引用刷新 / 落地硬约束条 / 选项表注记 / `lock` 措辞与失败模式（未提交工作树 diff）
> 日期：2026-11-25｜作者：architect（主会话）｜审查者：oracle → critic（只读）
> 审查域：其他审查（ADR 行）

## 1. 修订了什么（一句话）

运行态绑定是**单文件** `.rddf/state/plan-sessions.json`（内容按 session id 建键），而父会话用 `edit` 工具读-改-写它（**非原子**）⇒ **两个根会话（哪怕不同 topic）会互相覆盖** ⇒ 与 D7「不同 topic 天然隔离 ⇒ 零冲突」**矛盾**，且 D1「每文件恰一写者」表未登记这个跨 topic 多写者例外。改为**每会话一文件** ⇒ **结构性**免并发（不是靠锁纪律）；同时修正由此引起的标题失真、表格截断、三处陈旧引用、以及在 two 份回滚清单里的**逐字节钉死**问题。

## 2. oracle（先行）

判定：**PASS-WITH-NOTES**。核心结论：

- **D7 真命题成立**：修订消除了最后一个**跨 topic 共享可变文件**（`graph.json` / `nodes/` / 锁均 per-topic）；无覆盖点转移 —— 同 topic 的覆盖点（`graph.json`）本就在 D7 长锁 + D10 短锁的射程内，且 ADR 已如实点明「协议级、非权限强制」。
- **标题收窄忠实于初版意图**：初版否决「session id 编进路径」的三条理由（路径不可读 / git 噪音 / 跨机器死指针）**全部只适用于入 git 的路径**；收窄在三处同步标注（标题 / 选项表行 / 新 bullet），非静默改写。
- **`lock` 的 binding 语义等价**：`owner → <owner>.json` 是 **O(1) 路径构造**（扫目录只在枚举全体绑定时需要）；owner 指向的会话文件缺失 ⇒ `binding = null`，与旧形态 `sessions[owner] ?? null` 等价；僵尸判定无回归。

### finding 与处置（逐条）

| # | finding（oracle） | 处置 |
|---|---|---|
| N1（合入前必做） | **D5 标题字面失真**：「路径不含 session id」与新文件名 `<session_id>.json` 直接打架；该原则的真实对象从既有文本可判定为**版本化产物** | **已改**：标题 → 「会话身份三落点（**版本化产物路径不含 session id**）」；新增 bullet 写明「运行态落点（gitignored）的文件名含 session id **不违反**本原则 —— 原则约束的是**入版本库的落点**；运行态文件本机专用，跨机器不可移植是**一切**运行态的固有属性」；选项表否决行补「（**指版本化路径**）」 |
| N2（合入前必做） | **Markdown 表格被两条新 bullet 截断**：两条 bullet 插在第 1 行与第 2/3 行之间 ⇒ 后两行渲染成**无表头的新表**（「三落点」表散架） | **已改**：两条 bullet 移到三行表**之后**，表结构恢复（awk 列数自检通过） |
| N3（合入前必做） | **三处陈旧交叉引用**：V07 仍断言旧单文件路径被 ignore（实现批改 `.gitignore` 形态后**必红**）；后果章「单一真源（`graph.json` + `plan-sessions.json`）」；回滚口径的旧路径 | **已改**：V07 改断言**目录形态** + 加「旧单文件路径**不再被 ignore**」的**反向断言**（防形态回退）；后果章与回滚口径同步新路径 |
| N4（合入前必做） | **「同批」爆炸半径未登记**（D9/D10/D11 每段都有「落地顺序（硬约束）」条，唯独 D5 没有 —— 而这恰是本篇自己立的范式） | **已改**：新增 D5「落地顺序（硬约束）」条，枚举 7 组同批项（`opencode.jsonc` 的 plan `edit` 白名单 / `.gitignore` / `prompts/plan.md` 两处 + 两份回滚清单 / `cmdLock` / 两处测试 / 文档 + 清单 notes / **V07 断言同批反转**） |
| N5（建议） | 「本修订只消除运行态绑定文件的覆盖」需钉死（防读者过度泛化） | **已改**：新增 bullet「`graph.json` 的写互斥**不变** —— 不同 topic 本就各写各的 `graph.json`；**同 topic** 仍由 D7 独占锁 + D10 短锁负责（**协议级**）」 |
| N6（建议） | `lock` 的两个失败模式须点明；措辞从「扫目录按 owner 找」修正为「按 owner **直接构造路径**」 | **已改**：措辞修正 + 登记两失败模式（① 崩溃窗口 ⇒ `binding=null` 读作「**未知**」而非无绑定；② 死会话文件残留 ⇒ **清理策略 defer 至实现批**） |

## 3. critic 合审

判定：**APPROVE_WITH_CONDITIONS**（`mergeable: yes`｜`scope_exceeded: false`｜**无 BLOCKER**）。三个 focus 的答复：D7 真命题成立（无覆盖点转移）；标题收窄忠实（三处同步标注）；落地顺序完备性 —— `plan-delegate.json` 的旧路径**已列入**，但**只写 find 不写 replace**（漏项，见 S1）；`lock` 的 usage 文本不含旧路径 ⇒ **无需改**；`MULTI-AGENT-DESIGN.md` 为**误列**（见 N1）。

### finding 与处置（逐条）

| # | finding（critic） | 处置 |
|---|---|---|
| S1 | **落地顺序③ 只写「find 串」，漏了 `replace` 串** —— `.rddf/rollback/plan-delegate.json` 的 **replace** 串内嵌 capability 块、同样钉死旧路径 ⇒ 只改 find ⇒ 未来执行 plan-delegate 回滚会把旧 `edit` 行**写回** `prompts/plan.md` ⇒ AC23 派生守卫回滚后撞红（正是该枚举自称要防的「无关的红」） | **已改**：③ 改为「**逐字节 `find` 串 *与 `replace` 串***」+ 显式告警；⑤ 的测试清单补 **AC23** |
| S2 | **`.rddf/roadmap/plan-multi-session-collaboration.md` 被本修订直接反转但未获同步口径** —— 其 D5 行 / §5 第 1 条（「精确单文件，不扩 `.rddf/state/` 整目录」）/ 任务 C9·E1·E2·B7 / 风险行 / 回滚三步 全写旧形态，而 ADR 实施记录以**活指针**指向该文件 §5 ⇒ 读者被带到无「已被取代」标记的反转裁决上 | **已改（两处）**：① 落地顺序新增 **⑧**（枚举受影响位置 + 「须标注『2026-11-25 D5 修订已取代』」+ **角色边界**「该文件在 **planner 写集**，不在 architect 写集 ⇒ 本次只登记，由对应角色在同批补」）；② ADR 实施记录的指针句改为「**该节是初版实施期的历史记录**，其中**第 1 条**已被 D5 修订取代（见硬约束 ⑧）」 |
| N1 | 落地顺序⑥ **误列 `docs/MULTI-AGENT-DESIGN.md`**（两处 grep 核实无任何 plan-sessions 引用 ⇒ 实现批空转） | **已改**：⑥ 删除该项，只留 `.rddf/rollback/README.md` + 追加 `.rddf/rollback/plan-topics.json` 的 `notes` 散文 |
| N2 | `plan-topics.json` 的 `notes` 字段散文仍写旧路径 | **已改**：并入⑥ |
| N3 | `docs/CHANGELOG.md` 的「代价 = binding 查询改为**扫目录**」与 ADR 定稿措辞不一致 | **已改**：CHANGELOG v2.74 该句改为「按 owner **直接构造路径**（扫目录仅用于枚举全体绑定）」 |

## 4. 复审（第 2 轮，只验落笔）

结论：**S1 / S2 已闭合**；N1–N3 落笔**无新问题**；`mergeable: yes`｜`scope_exceeded: false`。

复审核验摘录：S1 —— 事实基础核实通过（`plan-delegate.json` 的 replace 串确实内嵌 `<!-- capability:plan edit: *.rddf/state/plan-sessions.json … -->` ⇒ 「只改 find ⇒ 回滚把旧 `edit` 行写回 ⇒ AC23 撞红」的因果链成立），且③ 的 ⚠ **精确限定在 `plan-delegate.json`**（`plan-topics.json` 的 replace 不含旧路径，未被误伤）⇒ 措辞与两个清单的实际内容一致；S2 —— roadmap 的 7 处旧形态位置（行 24 / 130 / 138 / 145–146 / 276 / 302 / 308）与 ⑧ 的枚举一致，角色边界声明经 `lib/role-policy.ts` 核实属实（`.rddf/roadmap/**` 确在 planner 写集），⑧ 与行 328 的指针句互指一致，且「本次只登记」是**登记而非已决**（未犯伪决策）。N1 —— 删留均与事实相符（`MULTI-AGENT-DESIGN.md` 零命中；`rollback/README.md:141` 与 `plan-topics.json` 的 `notes` 确含旧路径）；N2 —— 并入⑥ 落点正确；N3 —— CHANGELOG 与 ADR 行 91 语义一致（仅句末「时」字散文简写，不构成二义）。

**收口结论**：双审闭合 ⇒ 元数据 Status 补第五段 **`Accepted`（2026-11-25 修订 D5 落点表）**；审稿报告索引（元数据「审稿报告」行）补齐五份；版本史并入 `docs/CHANGELOG.md` v2.74。

## 5. 收口自检

| 项 | 结果 |
|---|---|
| 正文行数 | 332（超 250 目标；自检结论与 backlog 见 D10 报告 §5） |
| 四要素 | 元数据 / 决策（D1–D11，D5 已修订）/ 选项对比表（含「指版本化路径」注记）/ 后果·代价 / Verification（V01–V36，**V07 已按新形态改写**）齐备 |
| 表格结构 | awk 列数自检通过；**无截断表**（本轮修的第二处结构错）；无乱码 |
| 陈旧引用 | ADR 内旧路径仅剩 V07 的**反向断言**一处（刻意保留）；后果章 / 回滚口径 / 实施记录指针均已刷新 |
| 角色边界 | roadmap 的同步**不在 architect 写集** ⇒ 已在 D5 硬约束 ⑧ 显式登记，交对应角色同批补 |
| 闸门 | `bun test tests/` 1205 pass / 1 skip / 1 fail（唯一 fail = 预存模型名漂移，与本 diff 无关）；`bash scripts/check-upstream-anchors.sh` = 30/30 全绿；记录纪律 OK |
