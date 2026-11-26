# plan-synthesis-offload — plan 侧多节点协作的「合成」步骤外置

> **登记来源**：`.rddf/improvements/plan-synthesis-offload.md`（5 段草稿）
> **判据真源**：`docs/adr/ADR-plan-synthesis-offload.md` 的 `## Verification` 章（**V1–V11b 为唯一真源**）。本文件 `## 验收标准` 只做 **AC 编号 ↔ V 编号映射**与状态登记，**不复制判据正文**（避免第二份可漂移副本）。
> **决策依据**：`ADR-plan-synthesis-offload`（**Proposed**，D1–D7；oracle 3 轮 + critic 3 轮，第 3 轮 **APPROVE_WITH_CONDITIONS / `mergeable: yes` / 无 BLOCKER**）。
> **执行路径**：B1 跨 `prompts/plan.md` / `prompts/plan-worker.md` / `scripts/check-upstream-anchors.sh` / 新增两个文件（均治理面或新增文件闸门）⇒ **oracle → critic** 各 1 轮；**机制面零改动**（`lib/plan-topics.ts` 与 `scripts/plan-topic-check.ts` 一行不动）。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在（`.rddf/state/.arch-handoff.json` / `.rddf/state/.planner-handoff.json` 均缺失）⇒ 走**内置流程**（本目录的 `proposal.md` 由 planner 起草；`design.md` / `tasks.md` 归 builder）。

## Why

`plan` 侧多节点协作在 dispatch / join 阶段不要求父读子产出全文，但**合成**阶段必须把 N 个节点的结论收敛成一份 topic 级答案 ⇒ **父必须吸收 N 份全文**。

实测（`build-worker-design`，7 内容节点 / 4 波）：子产出合计 **244,703 B**，根会话上下文增量 **+114,842 tokens**，根写出的合成稿 23,649 B（收敛比 ≈ 1:10）。由此三处硬伤：

1. **成本落在用户面对的会话上**（根既要维持意图，又要吞全部材料）；
2. **合成质量无痕**（`progress`/`status` 从磁盘派生，合成稿是**自述**产物）； 
3. **换根不可重建**（「父当时怎么合的」无持久载体）。

## What Changes

合成外置为 **DAG 里的一个普通 node**：

1. 合成节点 id 形状 `^m[1-9][0-9]*$`；`deps` = 全部内容节点；产物落 `nodes/<m-id>/RESULT.md`（父写面不变、不进 `PLAN_REF_ROOTS`）。
2. 模型三档（C 现有弱模型 / **A 按次覆盖**（默认）/ B 新增 `plan-merger` 兜底）。
3. BRIEF 新增结论层硬判据：稳定 token（落 `prompts/plan-worker.md:28`，唯一落点）+ 五节固定结构 + **根裁决集结构化**（`## 根裁决集`，slug 集合包含判据）。
4. 质量判据独立载体：`scripts/plan-synthesis-check.ts` + `tests/plan-synthesis.test.ts`（自包含，不 import `lib/plan-topics.ts`）。
5. 起用阈值（ADR D7）：总量 ≳ 50 KB 为主判据、节点数 ≥ 4 为辅助。

**B1 落地四步（同批，顺序硬约束）**：

| 步骤 | 内容 | 约束 |
|---|---|---|
| 0 | V4/V5 判据规格：稳定 token 约定、结论层定位、结构发现规则；**补 AC16 的 V 编号与载体指派**；确认 V11b 语义（**已完成**，见 ADR 实施记录） | 先设计再落地 |
| ① | `scripts/check-upstream-anchors.sh` 补 **P7** 语义锚点（只写语义、不写行号、不钉函数名） | **批内最先**；假红即停 |
| ② | `prompts/plan.md` 加合成节（五节结构 / `## 根裁决集` / 答案惯例 / 起用阈值 / 模型覆盖说明）＋ `prompts/plan-worker.md:28` 落稳定 token 纪律 | **V4 的写入点**，不得晚于 ③ |
| ③ | 载体落地（`scripts/plan-synthesis-check.ts` + `tests/plan-synthesis.test.ts`） | 须过一次**新增文件闸门**显式决定 |
| ④ | 回滚迁移：写 `.rddf/rollback/plan-synthesis-offload.json` ⇒ registry 条目 `declared` → `proving` ⇒ drill ⇒ `active` | **必做**（`declared` 的 watch 路径一旦存在，M4 机械变红） |

## 验收标准

判据真源见 ADR `## Verification`；下表为 **AC ↔ V 映射 + 状态**。

| AC | V | 判据摘要 | 状态 |
|---|---|---|---|
| AC1 | V1 | 合成节点以 `deps`=全部内容节点存在；全 done 前 `ready` 不列、全 done 后自动列 | ✅ 已实测 |
| AC2 | V2 | `lib/plan-topics.ts` 与 `scripts/plan-topic-check.ts` 零改动 | ✅ 已实测（场景口径） |
| AC3 | V3 | 产物落 `nodes/<m-id>/RESULT.md`；父写面不变；不进 `PLAN_REF_ROOTS` | ✅ 已实测 |
| AC4 | V4 | 「最重项必须进结论层」有机械判据 | ⬜ B1 |
| AC5 | V5a | 全部合成节点 `deps` 之并集 == 全部内容节点 | ⬜ B1 |
| AC6 | V5b | 当前答案节点（id 整数后缀最大）`deps` 覆盖全部内容节点 | ⬜ B1 |
| AC7 | V5c | 合成节点不互依 | ⬜ B1 |
| AC8 | V6 | 根材料吸收量 = 合成稿体积（−86%） | ✅ 已实测 |
| AC9 | V7 | 根 `tokens_input` 增量 ≤ 60,000，且无 `nodes/n[1-7]/RESULT.md` 的 read | ⬜ **需新根会话** |
| AC10 | V8 | 合成质量 A/B（结论 / 缺陷 / 裁决 / 最重项进结论层） | ✅ A 档 PASS |
| AC11 | V9 | P7 上游语义锚点存在且绿 | ⬜ B1 步骤 ① |
| AC12 | V10 | 零治理面漂移（仅明列文件改动） | ✅ 限 B0 |
| AC13 | V11 | 模型覆盖生效于会话配置层（`session_v2.model`） | ✅ 已实测 |
| AC14 | V11b | provider 实际服务模型（`session_message` per-message `model`）== 覆盖模型 | 🟡 语义已确认／判据待 B1 |
| AC15 | D6 B1 | 四步同批且顺序符合 | ⬜ B1 |
| **AC16** | — | D4 的 slug 判据与 info 级前置检查在步骤 0 补 V 编号 + 载体 | ⬜ B1 步骤 0 |
| **AC17** | — | `prompts/plan-worker.md:28` 落稳定 token 纪律（唯一落点、存量不追溯） | ⬜ B1 步骤 ② |
| **AC18** | — | `prompts/plan.md` 合成节内容齐（五节 / 根裁决集 / 答案惯例 / 阈值 / 模型覆盖） | ⬜ B1 步骤 ② |

## 非目标

- 不追求「规模无上限」：合成会话自身仍要装下全部子产出（实测 132,909 tokens），**不可缓解**。
- 不在本 change 声称 provider 层「已覆盖」：V11b 语义已确认，但判据未实现前只能说「可机判」。
- 不改机制面（`lib/plan-topics.ts` / `scripts/plan-topic-check.ts` / 20 码闭集 / 四值退出码）。
- 不新增 agent（B 档兜底未触发）；不新增派发通道。

## 交付物

- `prompts/plan.md` 的「合成节点」节；`prompts/plan-worker.md:28` 的稳定 token 纪律
- `scripts/check-upstream-anchors.sh` 的 P7 锚点
- `scripts/plan-synthesis-check.ts` + `tests/plan-synthesis.test.ts`
- `.rddf/rollback/plan-synthesis-offload.json`（清单）+ registry 条目转 `active`

## 风险

| 风险 | 缓解 |
|---|---|
| provider 静默换模型 | V11b（响应级 `session_message.model`）—— 语义已确认，B1 实现判据 |
| 稳定 token 纪律未落 ⇒ V4 退化为不可机判 | AC17 与载体同批；缺则 V4 不成立 |
| 「根是否写全裁决」不可机判 | 已登记 ADR「已知不可机判清单」；机判只覆盖 BRIEF→合成稿转写保真 |
| D7 阈值未跨规模标定 | 粗口径、非机械闸门；偏离不留痕 |
| `prompts/plan-worker.md` 影响全部内容节点 | 存量不追溯；在 commit message / 审稿报告显式写明语义影响面 |
