---
状态: 已立项
优先级: P1
---
# plan-synthesis-offload — plan 侧多节点协作的「合成」步骤外置

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 决策依据：`docs/adr/ADR-plan-synthesis-offload.md`（**Proposed**，D1–D7；oracle 3 轮 + critic 3 轮，第 3 轮 **APPROVE_WITH_CONDITIONS / `mergeable: yes` / 无 BLOCKER**）
> 关联 change：`openspec/changes/plan-synthesis-offload/`（本次立项）
> ⚠ **本路径未启用 `rdd-planner` / `add-improve`**：`rdd-planner` 前置（`.rddf/state/.arch-handoff.json`）不存在；`add-improve` 的 HARD-GATE 形态与本仓 5 段排版不兼容（本仓先例见 `.rddf/roadmap/test-debt-e2e-followup.md` §6 说明）⇒ 走**内置流程**。

## Why

`plan` 侧多节点协作（`ADR-plan-multi-session-collaboration`）在 **dispatch / join** 阶段不要求父读子产出全文（子结果只回「指针 + 2–4 行摘要」）。但**合成**阶段必须：父要把 N 个节点的结论收敛成一份 topic 级答案 ⇒ **父必须吸收 N 份全文**。

实测（`build-worker-design`，7 内容节点 / 4 波）：

| 量 | 值 |
|---|---|
| 子产出合计 | 244,703 B |
| 根会话上下文增量 | **+114,842 tokens** |
| 父写出的合成稿 | 23,649 B（收敛比 ≈ 1:10） |

三处硬伤：

1. **成本落在用户面对的会话上** —— 根既要维持整场交互的意图，又要吞全部材料；
2. **合成质量无痕** —— `progress`/`status` 从磁盘派生，而合成稿是**自述**产物 ⇒ 父的裁剪、遗漏都不留痕；
3. **换根不可重建** —— 「父当时怎么合的」没有任何持久载体。

## What Changes

1. **合成成为 DAG 里的一个普通 node**（ADR D1/D2）
   - id 形状可机判：`^m[1-9][0-9]*$`（禁前导零）；
   - `deps` = 该 topic 的**全部内容节点** ⇒ deps 门控自动保证「内容节点全 done 后才可派」；
   - 产物落**合成节点自己的** `nodes/<m-id>/RESULT.md` ⇒ 父的写面不变、不进 `PLAN_REF_ROOTS`（「讨论稿 ≠ 可执行计划」保持）。
2. **模型三档，默认 A 档**（ADR D3）
   - C = 现有弱模型 `plan-worker`（实测部分达标：丢「最重」项 ⇒ FAIL）；
   - **A = `subagent(agent="plan-worker", model="<强模型>")` 按次覆盖**（零配置 / 零新 agent）—— 实测 PASS（三条「最重」项 3/3 进结论层）；
   - B = 新增 `plan-merger` agent（兜底，A 档失败才启用；实测未触发）。
3. **BRIEF 契约新增结论层硬判据**（ADR D4）
   - 稳定 token：内容节点 RESULT 的「最重 / 必须上报 / 薄弱点」标注须带 `path:line` 或 slug；
   - 五节固定结构（§结论 / §各节点结论的合并 / §父的裁决汇总 / §反哺清单 / §不声称的东西）；
   - **根裁决集结构化**：合成 BRIEF 必含 `## 根裁决集`（每条 slug `R1…`，无裁决写「无」）⇒ 判据 = `BRIEF 的 slug 集 ⊆ 合成稿 §父的裁决汇总 的 slug 集`。
4. **质量判据独立承载**（ADR D5）
   - 载体 = `scripts/plan-synthesis-check.ts`（自包含 CLI，**不 import `lib/plan-topics.ts`**）+ `tests/plan-synthesis.test.ts`；
   - ⇒ 机制面（`lib/plan-topics.ts` / `scripts/plan-topic-check.ts` / 20 码闭集 / 四值退出码）**零改动**。
5. **起用阈值**（ADR D7，粗口径非机械闸门）
   - 主判据 = 子产出合计 ≳ 50 KB；辅助 = 内容节点 ≥ 4；总量优先。
6. **落地顺序**：B0（已随 ADR 落地：ADR + 父篇残留 #19 闭合 / #20 补登 + 架构文档 + registry 条目 `declared`）；**B1 = 本 change**。

## Acceptance

判据真源 = **ADR 的 `## Verification` 章（V1–V11b）**；本表只做映射与状态登记，不复制判据正文。

| AC | 来源 V | 判据摘要 | 当前状态 |
|---|---|---|---|
| AC1 | V1 | 合成节点以 `deps`=全部内容节点存在；全 done 前 `ready` 不列、全 done 后自动列 | ✅ 已实测 |
| AC2 | V2 | `lib/plan-topics.ts` 与 `scripts/plan-topic-check.ts` **零改动** | ✅ 已实测（限场景口径） |
| AC3 | V3 | 产物落 `nodes/<m-id>/RESULT.md`；父写面不变；不进 `PLAN_REF_ROOTS` | ✅ 已实测 |
| AC4 | V4 | 「最重项必须进结论层」有机械判据（前提：稳定 token + 五节结构） | ⬜ B1 |
| AC5 | V5a | 全部合成节点 `deps` 之**并集** == 全部内容节点 | ⬜ B1 |
| AC6 | V5b | **当前答案节点**（id 整数后缀最大）的 `deps` 覆盖全部内容节点 | ⬜ B1 |
| AC7 | V5c | 合成节点不互依（`deps` 不含其它合成节点） | ⬜ B1 |
| AC8 | V6 | 根材料吸收量 = 合成稿体积（实测 244,703 B → 35,265 B，−86%） | ✅ 已实测 |
| AC9 | V7 | 根 `tokens_input` 增量 ≤ 60,000，且无 `nodes/n[1-7]/RESULT.md` 的 read | ⬜ **需新根会话** |
| AC10 | V8 | 合成质量 A/B：结论一致性 / 缺陷覆盖 / 裁决覆盖 + 最重项进结论层 | ✅ A 档 PASS |
| AC11 | V9 | 上游语义锚点 P7 存在且绿（`check-upstream-anchors.sh` 报 OK） | ⬜ B1 步骤 ① |
| AC12 | V10 | 零治理面漂移（仅 `prompts/plan.md` + `check-upstream-anchors.sh` 明列改动） | ✅ 限 B0 |
| AC13 | V11 | 模型覆盖生效于**会话配置层**（`session_v2.model`） | ✅ 已实测 |
| AC14 | V11b | provider **实际服务模型**（`session_message` per-message `model`）== 覆盖模型 | 🟡 语义已确认／判据待 B1 |
| AC15 | D6 B1 | P7 锚点 → prompts → 载体 → 回滚迁移，四步**同批** | ⬜ B1 |

**附加 AC（判据追踪缺口，critic 第 3 轮 SF③）**：

| AC | 判据 |
|---|---|
| AC16 | D4 的 **slug 集合包含判据**与**无 token「最重」标注的 info 级前置检查**在 B1 步骤 0 补 V 编号 + 载体指派 |
| AC17 | `prompts/plan-worker.md:28` 落「严重度标注带稳定 token」纪律（**唯一落点**；存量 RESULT 不追溯） |
| AC18 | `prompts/plan.md` 合成节含：五节结构、`## 根裁决集`、答案惯例（整数后缀最大）、起用阈值（总量为主）、模型覆盖说明 |

## Capabilities

**新增能力**：合成可外置到隔离会话、留痕（`nodes/<m>/RESULT.md`）、可 A/B 对照、质量可机判（V4/V5）。

**不变式保持**：单一写者（父写 TOPIC/graph/BRIEF，子写 TODO/RESULT）；合成稿不进 `PLAN_REF_ROOTS`；机制面 checker 零改动；不新增 agent、不新增派发通道。

**明确不承诺**：

- 「让规模无上限」—— 合成会话自身仍要装下全部子产出（实测 132,909 tokens），**不可缓解**；
- provider 层「已覆盖」—— V11b 语义已确认，但判据未实现前不得如此声称。

## Impact

| 面 | 影响 | 归属 |
|---|---|---|
| 机制面 `lib/plan-topics.ts` / `scripts/plan-topic-check.ts` | **零改动** | — |
| 治理面 `prompts/plan.md` | 加「合成节点」一节 + D4 判据 + D3 模型覆盖 + D7 阈值 | builder（B1 步骤②） |
| 治理面 `prompts/plan-worker.md:28` | 落「严重度标注带稳定 token」纪律（**全部内容节点**契约，存量不追溯） | builder（B1 步骤②） |
| 治理面 `scripts/check-upstream-anchors.sh` | 补 P7 语义锚点（**批内最先**，假红即停） | builder（B1 步骤①） |
| 新增文件闸门 | `scripts/plan-synthesis-check.ts` + `tests/plan-synthesis.test.ts`（须显式过一次新增文件决定） | builder |
| 回滚 | registry 条目 `declared`（已增）→ B1 写清单 → `proving` → drill → `active` | builder |
| 风险 | ① provider 静默换模型（V11b 可判但未实现）；② 稳定 token 纪律未落则 V4 退化为不可机判；③ 「根是否写全裁决」不可机判（已登记）；④ D7 阈值未跨规模标定 | 见 ADR「已知不可机判清单」 |

**审查路径**：B1 跨 `prompts/**` + `scripts/**`（均治理面）⇒ 须走治理面 **oracle → critic** 双审。
