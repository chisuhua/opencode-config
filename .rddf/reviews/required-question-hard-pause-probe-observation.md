# 观察记录 — required-question-hard-pause-probe

> 判据真源：`openspec/changes/required-question-hard-pause-probe/proposal.md`（AC1–AC5）+ `design.md`（D1 为什么只勘 / D3 最小成本路线）。
> 性质：**勘察**（本 change **不改任何行为** —— AC4）。
> 结论时限：以 `~/.agents/skills/rdd-workflow/skills/rdd-builder/SKILL.md` 的 **2026-11-18** 版本为准（`rdd-builder` 改版即过时）。

## 1. Q1–Q5 逐条答案（AC1）

| # | 问题 | 答案 | 证据来源 |
|---|---|---|---|
| **Q1** | 非交互跑 `rdd-builder`（P0）会怎样：停下 / 自行选 / 报错？ | **默认模式下「不会停下问」** —— P0 的 5 选项门在阶段 0.0.5 按 ADR-0049 **自动决策**（planner advisory + LLM assessment + AC count ⇒ 自动选 1–5，**不需要用户输入**）。⇒ 「HARD pause 被自行绕过」这个**担心的形态不存在**，因为默认模式压根不 pause。按 Q1 的三选一口径，这**命中了「自行选一个选项」** —— 但它是 ADR-0049 的 **by-design 协议**（不是缺陷）。⚠ **低置信度分支**（unknown / 冲突 / `RDDF_REQUIRE_USER_CONFIRM=yes`）的行为**未实测**（见 §3） | `SKILL.md:5`（`P0 (5-option approval gate, auto-decision per ADR-0049)`）、`:158`（`阶段 0.0.5 — 全自动决策逻辑 (默认 ON)`）、`:164`（自动决策表；4 行「暂停问用户」= 仅低置信度）；另见 `.rddf/reviews/oracle-intent-gate-e2e-observation.md` §9 行 2（同一份读证的原始记录） |
| **Q2** | pause 是否落盘？ | **默认模式不 pause ⇒ 无「pause 落盘」可查**；低置信度分支的落盘形态未读证到（产品侧实现） | 同上（`:158`–`:164`）；**未实测** |
| **Q3** | P0 与 P2.5 行为是否不同？ | **本轮不判**：Task 2 Step 2 的前置是「Task 1 读证不足以定性」⇒ 读证已足以定性默认模式，**未触发** | `design.md` D3 的「先读后跑」路线 |
| **Q4** | 是否已有非交互口径？ | **有，且是本仓 prompt 层提供的**：`prompts/build.md` 的「HARD pause **优先于** skill 内部的自动决策 —— 触发 pause 时把选项交给用户，不要按自己的判断选一个继续」⇒ 即使 skill 自动决策，agent 也不许替用户拍板；问不到时的兜底走 v2.42 的 `§需要用户裁决时` 停机形态 | `prompts/build.md` 的 `§rdd-workflow 增强层` 第一条；`required-question-fallback`（v2.42）的触发面 ② |
| **Q5** | 结论是否要求改本仓？ | **否** ⇒ 「**无需改动**」（AC2 的「无缺陷」分支）；残余缺口在**产品仓 skill 层**（低置信度时的暂停问用户在非交互环境问不到）⇒ 登记为产品侧议题 | `tests/config-guards.test.ts` 的未覆盖清单条目（`② §rdd-workflow 增强层的 rdd-builder P0 / P2.5 HARD pause —— 2026-11-17 读证：不是缺陷 … 残余缺口 = 低置信度时的「暂停问用户」⇒ 登记为产品侧议题`） |

## 2. 结论（AC2 的「无缺陷」分支）

**无需改动本仓**：`prompts/build.md` 的覆盖规则已经把「skill 自动决策」与「agent 不替用户拍板」的关系写清；非交互问不到的场景由 v2.42 的停机兜底接管。

**残余缺口（如实登记，不声称覆盖）**：低置信度时的「暂停问用户」（`RDDF_REQUIRE_USER_CONFIRM=yes` 等）在**非交互环境**下问不到 —— 但该分支在**产品仓 skill 层**，本仓 prompt 层无法改写 ⇒ **产品侧议题**。

## 3. Task 2（真跑）为什么没做 —— D3 读证豁免（如实记录）

`design.md` **D3** 的路线是「先读（零成本）⇒ 只有前两步答不出 Q1/Q3 ⇒ 才真跑一次（吃额度）」，`tasks.md` 的 Task 2 标题也写「**只在必要时真跑**」。

本轮 Task 1 的读证（`SKILL.md:5/:158/:164`）已经**直接否定**了本 change 立项时担心的形态（「HARD pause 被 agent 自行绕过」）—— 默认模式下根本没有 pause 可绕过。⇒ 按 D3 **豁免 Task 2**。

⚠ **代价（必须写清）**：**低置信度分支的行为未实测**。本报告**不声称**覆盖它；它是产品侧议题（§2），且本仓侧已有兜底（问不到 ⇒ 停机交付裁决）。

## 4. R1（治理面审查触发器）评估

- **触发条件**（`tasks.md` 的 R1）：「设计草案**若含拟改的 prompt 措辞**」⇒ 该部分按治理面审。
- **核实**：`design.md` **不含** `prompts/` 路径，也**不含**任何拟改的 prompt 措辞（`grep -nE 'prompts/|兜底句|拟改' design.md` 无命中）⇒ **条件未触发**。
- **§rdd-workflow 增强层的升级条款不适用**：本 change 的 §6 明确「纯错字 / 链接 / 日期 → 不审」，而本 change 连文档措辞都没改 prompt。
- ⇒ **R1：不触发**（本条即评估记录）。

## 5. 本 change 的产出与落点

| 产出 | 落点 |
|---|---|
| Q1–Q5 答案 + 证据 | 本文件 §1 |
| 「无需改动」结论 | 本文件 §2 + `proposal.md` 的 Acceptance 注记 |
| 守卫「未覆盖清单」更新（AC3） | `tests/config-guards.test.ts` 的未覆盖条目（`② … 2026-11-17 读证：不是缺陷`） |
| CHANGELOG（AC5） | `docs/CHANGELOG.md` 顶部新增一条（结论按勘察结果回填） |
| Task 2 豁免记录 | 本文件 §3 + `tasks.md` 的 Task 2 勾选处 |
