# ADR-plan-collaboration-hardening — plan 侧协作机制的五项补强

## 元数据

- **Status**: **Accepted**（2026-11-28）—— **已实施 + 已验收 + 已归档**（实现载体 = P0–P5 + v3 grandfather；验收报告 = `.rddf/reviews/plan-collaboration-hardening-verify.md`）。轮次与判定见下方「审稿」行
- **Date**: 2026-11-27
- **Author**: architect
- **Parent**: `ADR-plan-multi-session-collaboration`（topic / node / graph）、`ADR-plan-synthesis-offload`（合成外置 + V4/V5）
- **关联 change**: **已归档**（2026-11-28）：`openspec/changes/archive/2026-11-28-plan-collaboration-hardening/`（AC1–AC13 登记于其 `proposal.md`；本 ADR 的 D1–D6 = 实现面，P0–P5 + v3 grandfather = 批序）。⚠ **沿革**：本 change 由 `backlog: plan-collaboration-hardening` 占位起步（planner 立项 → 实施 → 2026-11-28 归档）
- **AC 映射**: 见 `openspec/changes/archive/2026-11-28-plan-collaboration-hardening/proposal.md` §验收标准（V→AC 一一映射：**V1→AC1 / V2→AC2 / V3→AC3 / V4→AC4 / V5→AC5 / V6→AC6 / V7→AC7 / V8→AC8 / V9→AC9 / V10→AC10a·b·c / V11→AC11（观察项）/ V12→AC12 / V13→AC13**）。⚠ **AC4 / AC10b 为「实质 pass」**：口径偏差见 **D7 SU** 与验收报告 §4.3（AC4 = **5 类可达拒绝 + 用法错误 exit 2 + 成环不可达**；AC10b 的追加节点实为 `m4`）—— 本 ADR 的 V4「五类」/ V10b「m2」判据正文**保持不改**（另案）
- **判据真源**: 本 ADR §Verification
- **范围**: 只改 plan 侧协作机制的**配置面 / 判据面 / prompt 面**；不改 delegate 通道、不改 `plan-worker` 权限模板、不动 `scope-check`、不新增 agent
- **审稿**: 轮次、判定与 finding 闭合证据见 `.rddf/reviews/ADR-plan-collaboration-hardening.md`（v1 首轮 + v2 / v3 定向修订各自一轮；末次 = critic 第 3 轮 `APPROVE_WITH_CONDITIONS`，**0 未闭合 BLOCKER**）
- **元数据同步（2026-11-28）**: 据实订正（**纯事实同步，不改决策**）：Status 转 `Accepted`、关联 change 回填归档路径、AC 映射回填、指针同步；除本元数据表外，D1–D6 与 §Verification 判据正文**均未动**（另加 **D7 SU** 声明 V4 / V10b / V13 的操作口径，判据谓词仍未改）
- **v2 定向修订（2026-11-27，实施期触发）**: 触发源 = 实施期 metis 复核（`design_drift`，凭据 `feedback-20261127-001`）⇒ 修 5 项：V10 拆 **V10a/b/c**（并要求真追加 m2）、D4 加**精确记录形状 + `model_id` 第 7 字段**、D1 配置缺失改 **fail-closed**（删「回落查 models」）、**P4 依赖 P3**、V11 降为**观察指标**。
- **v3 定向修订（2026-11-27，V10c 实施触发）**: 触发源 = `build-worker-design` 在 `--phase final` 下报 `settlement_missing`，而其实测失败集含**可修复码**（`synth_brief_no_ruling_set`，判据生效前既有）⇒ v2 的豁免条款（要求「全不可修复」）不成立；且实测 `cancel` **硬拒已 done 节点**（`禁止「完成后取消」`）⇒ 无法用「撤销合成」收口。修 3 项：D4 加 **grandfather 规则**（可豁免性由 attempt `finished_at` 派生，不新增父自述字段）、V8 加用例 **(f)**、V10c 改写为 grandfather 路径；选项对比表加第 **7** 行。

## 背景与问题

### ① 五条可引事实

1. **分解无判据**：`graph.json` / `BRIEF.md` 全由父手写（`prompts/plan.md:217-219`），判据只查结构（`lib/plan-topics.ts:716`），不查「分解是否覆盖目标」；`plan-topic-check` 无 `add` 子命令。
2. **模型 ID 以散文落盘且已漂移**：`prompts/plan.md:307` 记「当前实测强模型 = `minimax-cn/MiniMax-M3.1-Flash`」；2026-11-27 实测派发用 `opencode-go/kimi-k3.1-pro#high`（`session_v2.model`）。
3. **目标审查无载体**：`docs/architecture/plan-topics-topic-model.md:138` 自述「不存在『本轮目标集合』载体」。
4. **合成质量判据无闭环**：`plan-synthesis-check` 在 `v7-probe` 上 `exit 1`（7 阻断：6 × `synth_heavy_item_not_in_conclusion` + 1 × `synth_brief_no_ruling_set`），那 6 项**都带 `path:line` token**；`prompts/plan.md:309` 只写「不达标 ⇒ 追加 m2」，无强制，父只记录未行动。
5. **结论不可追溯**：合成稿结论只回指节点小节（`nX §Y`），证据埋在上游 `RESULT.md`。

### ② 实测成本结构（V7 Probe B，`ses_de4e553c7ffe0VKqZLpLFbvM6o`）

| 段 | 根上下文增量 | 占比 |
|---|---|---|
| 准备期（metis 8,362 + 找模型 7,739 + 建 topic ≈5,000 + 规格/DB ≈4,800） | **35,105** | **56%** |
| 8 次派发循环 | 15,872 | 25% |
| 读合成稿 | ≈5,000 | 8% |
| 量测 + 报告（探针自身） | 11,743 | 19% |

⇒ 根开销里 **12% 可直接归因于「找模型」**（配置化即可消除）；metis 的 8,362 是咨询成本（落文件只解决下游可见性，**不省**这笔）。

### ③ 真问题

不是缺功能（DAG / 模型覆盖 / resume 都有），而是**「有约定、无强制、无单一真源」**。

## 决策

### D1 模型配置化：全局 `plan-models.json` + 可机判的可用性检查

**载体**：`~/.config/opencode/plan-models.json`（全局，用户指定落点）。

```json
{ "schema_version": 1,
  "synthesis": { "model": "opencode-go/kimi-k3.1-pro#high",
                 "fallback": ["opencode-go/gemini-4-argon#high"] },
  "content":   { "model": null } }
```

- `synthesis.model` 直接作为 `subagent(agent="plan-worker", model=…)` 入参；`null` ⇒ agent 默认档（= 当前弱模型）。
- `fallback[]` 只供**人工**按序换用，**不自动重试**（自动重试会叠悬挂 attempt，见父篇残留 #18）。
- `content.model` 恒 `null` 为默认且推荐值（强模型只给合成节点，沿用合成篇 D3 限定）。

**可用性检查**：新增 `scripts/plan-models-check.sh`：(a) JSON/schema 校验；(b) `synthesis.model` 去掉 `#variant` 后必须出现在 **`opencode models`** 输出中（已实测可用）。exit≠0 ⇒ **不得派发合成节点**（协议级，派发前跑一次）。

**prompt 改动**（`prompts/plan.md` 的**合成派发段**，行号以**该批动手前的快照**为准）：删掉硬编码模型 ID 与「先查 models 工具」，改为「读配置 → 直接给 `model=`；**配置缺失 / 非法 ⇒ 停下补配置**（**不得**回落查 `models` 工具 —— 那会让单一真源失效），并在 `## 结算记录` 记 `model_resolution`」。**同处补三条纪律**：①「spawn 失败（provider 拒识 / 变体不可用）⇒ 同回合 `close` + 按 `fallback[]` 序重 `claim`」（父篇残留 #18）；②「`fallback[]` 全序失败 ⇒ 停手，`reap --confirm` 收悬挂 attempt 并写 `blocked` 说明」；③「配置缺失 ⇒ 给出最小模板并停手，不派发」。

**治理面归属**：`plan-models.json` 加入 `.rddf/config/governance-paths.json` 的 `paths[]`（自纳入，体例同 `ADR-governance-paths-ownership` D2.2）。

### D2 动态分解：按结论加节点；追问按 done/未 done 分流；**禁止复用 worker 会话**

| 动作 | 规则 | 依据 |
|---|---|---|
| 加节点 | 父是唯一写者：新增 `plan-topic-check add <topic> <id> --title <t> --deps <…> [--owner child]`（**实装另有 deps 重复一类拒绝 + 用法错误 exit 2，见 D7 SU**）。提供**原子写**（手写崩溃 = torn graph.json ⇒ 全 topic exit 3）、**短锁**（与并发 claim/close 串行）、**fail-fast 校验**（拒：已存在 id / 非法 id / deps 指向不存在节点 / **deps 指向 cancelled 节点** / 成环）。随后父写 `BRIEF.md` | `prompts/plan.md:218`；`scripts/plan-topic-check.ts:437-465`（claim 的守卫与原子写体例）；`lib/plan-topics.ts:609-613`（`cancelled_dep_active` 两口径皆阻断 ⇒ 进图即恒红） |
| 追问（节点**未** done） | 前提：该节点**无未闭合 attempt**（在飞时 `claim` 被拒，`scripts/plan-topic-check.ts:437-439`）。父改 BRIEF（追加一节）→ 重新 `claim`（新 attempt，`brief_sha256` 变 ⇒ 老 attempt 变 `stale_inputs`）→ 派发 → close | `prompts/plan.md:274` |
| 追问（节点**已** done） | **改 BRIEF 无效**（`deriveStatus` 只看 TODO/RESULT/deps/deliverables；claim 硬拒 done；D9 不支持重开）⇒ 追问 = **`add` 新节点，`deps` 含该节点** | `scripts/plan-topic-check.ts:442-445`；`ADR-plan-multi-session-collaboration.md:130` |
| 复用 worker 会话 | **禁止**。`resume` 不追加 attempt（`prompts/plan.md:270`）⇒ 新节点无 `claim` 快照；一 worker 会话绑定一 node（`prompts/plan-worker.md:9`、`:22`）⇒ 破单一写者 + 上下文污染 | 本节推理 + 上两条事实 |

**可选：分解节点** —— `deps` = 已完成节点，产出「建议新增节点 / 建议追问」清单到自己的 `RESULT.md`；父审核后按上表加节点。

### D3 结论级证据链 / 推断链（V6）

**合成稿每条结论的固定形状**：

```
**C1【判定】** <一句话结论>
- 证据链：C1 ← n3 §3 ← `scripts/plan-topic-check.ts:437-465`
- 推断链：F1（F 类事实，可引）⇒ F2（同上）⇒ 推断 ⇒ C1
```

**抽取规格**（照 V4b 的 F4/F7 体例，先钉语法再判）：

- **C token**：`(?<![A-Za-z0-9_])C[1-9][0-9]?(?![0-9A-Za-z])` ⇒ `AC1`、`C10a` 均不算；**定义处** = 行首 `**C<n>【` 起的行；**回指处** = 任意位置。
- **「紧跟」容差**：定义行之后 **3 行内**必须同时出现「证据链」「推断链」两行。
- **`path:line` 抽取**：反引号内 `path/to/file.ext:<int>[-<int>]`；比对只取 `path:startline`（忽略区间尾）。

**三码**（与 V4/V5 同档：默认 `info`，`--strict-token` 下升 `blocking`）：

| 码 | 触发条件（含非空前提） |
|---|---|
| `synth_conclusion_no_chain` | **答案节点 `## 结论` 至少有一个 C 定义**（零 C 定义 ⇒ 报此码，不「空集为真」）；或 C 定义后 3 行内缺证据链/推断链 |
| `synth_evidence_unresolvable` | 证据链里的 `path:startline` 在其回指的 `nX/RESULT.md` 中**字面不出现** |
| `synth_reasoning_missing` | 推断链行为空，或不含 `⇒` / `→` |

**诚实边界**：只验「引用完整性 + 格式」，不验结论真伪，也不验「该标的都标了」。

### D4 结算记录 + V4/V5 闭环门

**父在 `TOPIC.md` 写 `## 结算记录`**（父是唯一写者）。**精确形状**：`## 结算记录` 后紧跟**一个** ` ```yaml ` 围栏块，逐行 `key: value`：

```yaml
checked_at: 2026-11-27T12:20:00Z
synthesis_check_exit: 1
blocking: [synth_heavy_item_not_in_conclusion×6, synth_brief_no_ruling_set]
answer_node: m1
action: supersede:m2
model_resolution: config
model_id: opencode-go/kimi-k3.1-pro#high
```

**解析判据（机械，不依赖 YAML 库）**：取该节之后第一个 `yaml` 围栏块正文，按 `^([a-z_]+):[ ]?(.*)$` 逐行解析成 map；**必填 7 键** = `checked_at` / `synthesis_check_exit` / `blocking` / `answer_node` / `action` / `model_resolution` / `model_id`，**缺任一 ⇒ 视同无记录**（`settlement_missing`）。取值约束：`action ∈ {accept, accept-with-gap, supersede:<m-id>}`（`accept-with-gap` 必填 `gap_reason`）；`model_resolution ∈ {config, none}`（`none` = 该 topic 无合成节点）；`model_id` 记**实际派发**用的模型（支撑跨次可比）。

**两个码**（`plan-topic-check`，仅 `--phase final`）：

| 码 | 触发条件 |
|---|---|
| `settlement_missing` | 存在**非 cancelled** 合成节点 ∧ **收尾条件** ∧ 记录缺失/字段不全。**收尾条件 = `ADR-plan-multi-session-collaboration` D11 的 ②全终态 ∧ ③无在飞 ∧ 阻断违规数（显式排除本码与下一码自身）= 0**。⚠ 不得实现为 `reportTopic().converged` —— 那会 reintroduce「首跑变红 ⇒ 前提自毁 ⇒ 恒绿」 |
| `settlement_failed_not_superseded` | (a) 记录 `answer_node` ≠ 当前答案节点（`answerNodeId`，整数序最大，`scripts/plan-synthesis-check.ts:92-100`）⇒ 记录过期；或 (b) `answer_node` == 当前答案节点 ∧ `synthesis_check_exit ≠ 0` ∧ 失败集含**任一可修复码**（见下）∧ 不存在后缀更大的非 cancelled 合成节点 ⇒ 必须 supersede **（grandfather 适用时除外，见下段）** |

**失败码分类（全 12 码逐一归类，不留未分类码）**：

| 类 | 码 |
|---|---|
| **可修复**（合成侧重做能修） | `synth_conclusion_layer_missing`、`synth_heavy_item_not_in_conclusion`、`synth_brief_no_ruling_set`、`synth_ruling_not_propagated` + V6 三码 |
| **不可修复**（上游属性/结构性，`accept-with-gap` + `gap_reason`） | `synth_token_missing`、`synth_id_ambiguous`、`synth_dep_on_synth`、`synth_dep_union_incomplete`、`synth_dep_union_extra`、`synth_answer_dep_incomplete`、`synth_graph_error` |
| **结算门不可达**（前提已排除） | `synth_answer_missing`（仅在无可用合成节点时触发，而本门前提要求存在非 cancelled 合成节点） |

**兜底与量化规则（防新的恒绿通道）**：① **混合失败集** = 「任一可修复码存在 ⇒ 必须 supersede」（只有**全部**为不可修复时才允许 `accept-with-gap`），**唯一例外**见下段 grandfather；② 未来新增的未分类阻断码**一律按不可修复处理**（fail-closed：必须写 `gap_reason` + 记 backlog），不得默认通过。

**Grandfather：判据生效前已结算的 topic**（v3）。若**答案节点最后一次已闭合 attempt 的 `finished_at`（UTC 日期，取 `max(finished_at)` 而非数组末条）严格早于 `SETTLEMENT_CRITERIA_SINCE` = `2026-11-27`**（本 D4 分类的生效日），则 `blocking` 里的**可修复码**不再触发「必须 supersede」，但**必须** `action: accept-with-gap` ∧ `gap_reason` 覆盖这些码（口径见下）；不可修复码路径不变。

- **无已闭合 attempt ⇒ 不适用**（fail-closed）：`deriveStatus` 不看 attempts（父可手写 RESULT 而不 `claim`）⇒ 此时不存在「已结算」，不得援引 grandfather。
- **`gap_reason` 的机械口径**：用 `/synth_[a-z_]+/g` 从 `gap_reason` 抽码成集合（同 `lib/plan-topics.ts:864` 抽 `blocking` 的体例），判「`blocking` 里的**可修复码**与**未分类码** ⊆ 该集合」；不可修复码仍只要求 `gap_reason` 非空。不用纯子串包含（防 `synth_foo` / `synth_foo_bar` 型码互相包含）。
- 不新增可伪造字段：可豁免性由 `claim` / `close` 写下的 attempt 台账派生，父无需记新键；日期取**严格小于** ⇒ 判据生效当天及之后闭合者一律不豁免（`v7-probe/nodes/m4` 闭合于 2026-11-27 ⇒ 不适用）。
- 只改「可修复码的行动要求」，不改「记录须在场」与「失败码须照抄」：`blocking` 仍须原样照抄 check 输出。
- **与 v2 否决的「历史 topic 一次性豁免」的区别**：后者是让**示范 topic**（`v7-probe`）跳过重做 —— V10b 明令禁止，且其答案 `m4` 闭合于生效日 ⇒ 本规则对其不适用；本规则只覆盖判据生效前闭合、且不属本变更示范集的历史 topic。
- 残余：`finished_at` 可被手改 `graph.json` 伪造 —— 与 D2 已禁的「父手改图」同一残余，不新增面（已登记风险 5）。

**为什么不放在 `plan-synthesis-check`**：这两个码判「有没有按判据行动」（读 `TOPIC.md` + 收尾态），V4/V5 判「产物本身」（读 RESULT 正文）；分开承载 ⇒ 不重复实现、不引入第二套标准，也不破 `plan-synthesis-check` 的自包含约束（`scripts/plan-synthesis-check.ts:7`）。

### D5 目标审查：`TOPIC.md` 三节 + 可选审查节点；metis 结论必须落文件

**`TOPIC.md` 固定三节**（父在分解前写）：

- `## 前提与证伪条件`：目标依赖的每条前提 + 各自证伪条件。实例：build-worker-design 的目标嵌了「build 无 delegate 通道」这一前提，而 n1 的结论恰是「刻意排除 vs 能力缺口」⇒ 前提本身决定立项是否成立。
- `## 非目标`：明确不做什么。
- `## 目标审查结论`：谁、何时、结论、是否改目标。

**判据**（`plan-topic-check`，仅 `--phase dispatch`，新码 `topic_goal_unreviewed`）：**存在 ready 节点** ∧ 三节任一缺失或为空 ⇒ blocking。`TOPIC.md` 整体缺失 ⇒ 视同三节全缺。

> 三节是「写下来」判据，不是「目标对不对」判据（见 §已知不可机判）。

**metis 结论必须落 `TOPIC.md`**（父写）：本次根自发跑 metis 花 8,362 ctx，结论只留在根上下文，下游节点全看不到 —— 落文件解决**可见性**，不省咨询成本。

### D6 明确不做（边界）

1. 不新增 agent（不走合成篇 D3 的 B 档）。
2. 不改 `plan-worker` 权限模板（写域仍到 topic 树粒度）。
3. 不动 `scope-check` 并行假阳性（`plan-topics-topic-model.md:139`，独立缺陷）。
4. 不做「动态分解自动展开」（分解节点只给建议，加节点永远由父决定）。
5. 不给 `claim` 加 re-open 语义（撞 D9；追问用 add 分流）。
6. 不碰 delegate 通道与全局 3 槽；本批不加「`plan-topic-check` subprocess 复核自述 exit」（见 §已知不可机判）。

### D7 SU（2026-11-28，实施对账｜**不改决策**）

实现落地并验收后逐条对账，三处**判据字面**与实况不一致。**不动 §Verification 的谓词**，本节只声明**操作口径**（口径细节与证据见 `.rddf/reviews/plan-collaboration-hardening-verify.md` §4.3；改谓词须另立范围）：

- **V4（类数与成环）**：`add` 的**可达拒绝 5 类**（已存在 id / 非法 id / deps 不存在 / deps 指向 cancelled / **deps 重复**）+ **用法错误 exit 2**（缺 `--title` / `--owner` 非法）⇒ 「五类」**保留为下限**，不因新增 deps 重复而改写。**成环 `add` 制造不出来**（新节点的 deps 只能指已有节点，自依赖先被「deps 不存在」拒）⇒ `assertAcyclic` 是**防既有坏图**的防御性复检（原语有单测；`add` 路径无环集成用例）。
- **V10b（节点 id）**：**机判的两件是** `answer_node == 最大非 cancelled 合成节点` ∧ `synthesis_check_exit == 0`（`lib/plan-topics.ts` 结算门）⇒ `m2` 实测失败后写 `m4` 是**唯一能过门的写法**（仍写 `m2` 会报「记录过期」）。`action: supersede:<id>` **只是审计字段、取值不被校验**（`exit==0` 时门直接放行）—— 不得据它声称「supersede 语义已被机判」。
- **V13（registry 态）**：条目已由 `unmanifested` 转 **`active`**（清单在盘 + `last_drill` 新鲜），债指针按 M7 必删（`pending_backlog` 只属 `unmanifested`）⇒ 按 **`active`** 验收是**更严**的一侧；「`unmanifested`」是 **AC13 验收时点 → 2026-11-28 演练后转 `active` 的过渡态**。

以上三处均**不收窄**判据（V4 更严 / V10b 是门强制 / V13 更严）⇒ 不构成 fail-open。

### D7 SU-2（2026-11-28，第二批实施对账｜**不改决策**）

- **连带项「`allowed` 白名单不完备」已闭合**：§后果·负面 记的「`tests/plan-topics.test.ts` 的 `allowed` 集只列 15 码且是子集断言 …… **不会**因扩容变红 —— 该断言自 20 码时代起不完备，属既有缺陷，记 backlog」**已于 2026-11-28 闭合**：违规码闭集改为**运行期真源** `VIOLATION_CODES`（`lib/plan-topics.ts`；联合类型由其派生 ⇒ 类型与运行期不可能漂移；⚠ 本仓**无 `tsc` 门禁** ⇒ 纯类型层的一致性断言不产生运行期保护，这是必须导出运行期常量的原因）+ **完备性断言**（扫全部码发射点 ⇒ 发射了闭集外的码当场变红）⇒ 该断言不再不完备。⚠ **仍未闭合的连带项**：`docs/architecture/plan-topics-topic-model.md` 里的手抄闭集清单（第三份副本、无守卫读取）仍在 ⇒ 该文档的同步义务依旧。
- **D2 的操作口径（`add` 建错 `--deps` ⇒ `cancel` + 换 id 重建）**：CLI 的子命令闭集里**没有改 `deps` 的入口** ⇒ 建错只能 `cancel`（**留作审计痕迹**：cancelled 短路 ⇒ 不再要求交付物）+ 用新 id `add` 重建；⚠ **下游回不去** —— `--detach` **只删边、没有 CLI 能把边加回** ⇒ 摘边后下游**不再等**该节点而**图仍是绿的**（`cancelled_dep_active` 那道闸正是被它拆掉的）⇒ 下游要么 `--cascade` 后**一并用新 id 重建**（deps 指向新 id），要么确认「本就与本节点无依赖关系」才 `--detach`；已 `done` 的节点 `cancel` 硬拒 ⇒ 走「追问（已 done）」路径。**登记位置**：当前态快照 `docs/architecture/plan-topics-topic-model.md` §10「已知边界」+ 操作面 `prompts/plan.md`「按结论加节点（`add`）」⇒ **不是 prompt 单点真源**（§D2 的决策文本不动；本条只声明操作口径）。
- **D5 第三子句「metis 结论必须落 `TOPIC.md`」的执行载体已补**（此前**无 prompt 载体** ⇒ 已接受的决策无执行面）：落进**既有**的 `## 前提与证伪条件` 节（**不新增 TOPIC.md 节** ⇒ 与「固定三节」不冲突；**不加检查器码** ⇒ 判据面不变，⚠ 属**prompt 义务、无机判**）；落进去的每条须标注「**未裁决 ⇒ 仅作前提候选 + 各自证伪条件，不得当依据**」（隐藏意图仍只是假设 ⇒ 用户裁决入口保留在 plan 文档的「待用户澄清」），且**以列表条目追加、勿用 `###` 子标题**（任何级别标题都会截断该节正文 ⇒ 空节 ⇒ `topic_goal_unreviewed` **误报红**）。

## 回滚面

**本 ADR 落盘即刻触发 `rollback-registry` 的 M1**（`lib/rollback-registry.ts:328-332`：`docs/adr/` 全集必须被 registry 覆盖；实测当前 `✗ [M1] ADR-plan-collaboration-hardening.md：ADR 未被 registry 覆盖`）。按 **P0 前置**补两处（均在 `.rddf/rollback/**`，**不在 architect 写集** ⇒ 由 builder 在 P0 同批补）：

```json
{ "mechanism": "plan-collaboration-hardening",
  "adr_primary": "docs/adr/ADR-plan-collaboration-hardening.md",
  "state": "unmanifested",
  "watch": ["prompts/plan.md", "prompts/plan-worker.md", "scripts/plan-topic-check.ts",
            "scripts/plan-synthesis-check.ts", "lib/plan-topics.ts"],
  "pending_backlog": ".rddf/rollback/pending/plan-collaboration-hardening.md" }
```

+ 新建 `.rddf/rollback/pending/plan-collaboration-hardening.md`（债指针，内容 = 本 ADR §实施顺序 + 每批的回退动作）。`unmanifested` 是唯一不需要清单的态（`declared` 要求 `watch[]` 路径**尚不存在**，本机制 watch 全已存在 ⇒ 不可用；`proving`/`active` 需清单 + 演练证据 ⇒ 过早）。

**回滚步骤**（P0 起逐批可逆）：① 删 registry 条目 + 删 pending 债指针 → `bun scripts/rollback-registry.ts` 无 M1；② 按逆序撤各批：P5 撤 V6 三码与 prompt 两段 → P4 撤 `add` 子命令与追问段 → P3 撤 `topic_goal_unreviewed` 与三节 → P2 撤结算两码 + grandfather 与结算段 → P1 撤 `plan-models-check.sh` / 配置读取 / `plan-models.json` / 治理面清单条目；③ 删除本 ADR 文件；④ 每批撤除后必须 `bun test tests/plan-topics*.test.ts tests/plan-synthesis.test.ts tests/config-guards.test.ts` 全绿。

## 选项对比表

| # | 决策点 | 采纳 | 被否方案 | 理由 |
|---|---|---|---|---|
| 1 | 模型 ID 落点 | **全局 `plan-models.json` + `plan-models-check.sh`** | (a) 继续写 prompt 散文；(b) 新增 `plan-merger` agent（B 档） | (a) 已飘移且每次查找耗 7,739 ctx；(b) 成本（新 agent + prompt + 守卫 + 文档投影 + 回滚钉死）远大于收益 |
| 2 | 加节点方式 | **`add`（原子写 + 短锁 + fail-fast）** | 维持父手写 `graph.json` | 手写并非无校验（`loadGraph` 读取时逐字段校验、畸形 exit 3），真赢面是原子写（防 torn）、短锁（与 claim/close 串行）、进图前拒非法 deps/环 |
| 3 | 追问载体 | **未 done：改 BRIEF + 新 attempt；已 done：add 新节点** | (a) resume 复用会话；(b) 父改 RESULT；(c) 给 claim 加 re-open | (a) 不追加 attempt ⇒ 台账不可归因 + 上下文污染；(b) 双写者；(c) 撞 D9 且冲击 cache/fence |
| 4 | 可追溯判据 | **C/F token + 证据链/推断链 + V6** | (a) 维持 `nX §Y`；(b) 只要求引 `path:line` 不加 token | (a) 读者跳三层；(b) 无稳定锚点 ⇒ 退化为语义匹配 |
| 5 | 质量闭环 | **结算记录 + `plan-topic-check` 两码** | (a) 维持散文；(b) 放进 `plan-synthesis-check` | (a) 已实测失效；(b) 破自包含或重复实现收敛逻辑（第二真源） |
| 6 | 目标审查 | **TOPIC.md 三节 + dispatch 判据** | (a) 维持「解释权在父上下文」；(b) 新建目标清单文件 | (a) 不可见不可判；(b) 与单一写者表冲突 |
| 7 | 判据生效前已结算的 topic 如何收口 | **grandfather：由 attempt `finished_at` 派生 + 逐码 `gap_reason`** | (a) 重做合成节点；(b) 取消其合成节点；(c) 新增父自述的 `exempt_since` 字段；(d) 留红 + 仅文档豁免 | (a) 已归档探针重做 ~100k ctx 且结论不会变；(b) 实测 `cancel` 硬拒已 done 节点（`禁止「完成后取消」`）；(c) 把 D4 的强制面永久开一个自述口；(d) 仓库留恒红 topic，判据与文档不一致 |

## 后果 / 代价

**正面**

- 模型分辨率从「每次查」降到「读一行 + 一条 check」：实测可省 ≈7,700 ctx（该次根开销 12%），并消除已存在的 ID 漂移。
- 合成质量判据**第一次产生行动约束**：不重做/不复核就结算不了。
- 结论可追溯到原始 `path:line`（引用断了可机判）；目标前提落文件 ⇒ 下游节点能看见自己服务的是哪个前提。

**负面**

- 判据面扩宽：`ViolationCode` 闭集 **20 → 23**（`lib/plan-topics.ts:78-98`）⇒ `plan-topics-topic-model.md:75` 的「20 码」快照必须同步（该文档无守卫读取，同步义务由 V12 承担；`tests/plan-topics.test.ts` 的 `allowed` 集只列 15 码且是子集断言，**不会**因扩容变红 —— 该断言自 20 码时代起不完备，属既有缺陷，记 backlog）。
- `plan-topic-check` 复杂度 +80~120 行；`plan-synthesis-check` +60~90 行。
- 迁移成本（盘核实测）：三个存量 topic `ready` 均为空 ⇒ `--phase dispatch` 不会因缺三节变红；真实成本 = `v7-probe` / `build-worker-design`（均含合成节点）在 `--phase final` 下报 `settlement_missing`，各补一条结算记录。
- `plan-models.json` 进治理面 ⇒ 调模型要过治理流程（有意为之，但变慢）。

**风险**

1. **自述天花板**：`synthesis_check_exit` 由父写，可谎报 ⇒ 闭环只到「记录在场 + 形态自洽」。
2. **provider 接受度不可前置判定**：`opencode models` 只证明 ID 存在；失效仍表现为悬挂 attempt（D1 已要求同回合 close + fallback 重 claim）。
3. **V6 可能催生「凑格式」**：以「`path:line` 必须在上游字面出现」兜底，但不等于证据有意义。
4. **`accept-with-gap` 可能被滥用**：白名单 + 「未分类码一律不可修复」收紧了一侧，仍只保证「写了理由」，不保证理由成立。
5. **grandfather 是宽限期而非豁免面**：只作用于「答案节点闭合早于 2026-11-27」的历史 topic；日期由 attempt 台账派生，但父可手改 `graph.json` 伪造（同 D2 既有残余，不新增面）。⚠ 豁免面**随判据扩容自动扩大**（历史 topic 今天重跑 check 新增的可修复码也一并被宽限，V10c 已显式接受）；`note` 义务不参与机判。

## Verification（可勾选验收判据）

> **勾选口径**（同 `ADR-commit-verification-gate`：**只勾有证据的项**）：V1–V10c / V12 / V13 均有实测证据（`.rddf/reviews/plan-collaboration-hardening-verify.md` 逐条取证 + 归档 change 的 `tasks.md`）⇒ 已勾；**V11 是观察指标、不设判定线** ⇒ 保持不勾。三处**字面与实况的差异**（V4 类数 / V10b 节点 id / V13 registry 态）见 **D7 SU**。

- [x] V1 `plan-models.json` 存在且 `schema_version=1`；`prompts/plan.md` 合成段**不再含具体模型 ID**。
- [x] V2 `plan-models.json` 在 `governance-paths.json` 的 `paths[]`；`tests/config-guards.test.ts` 仍绿。
- [x] V3 `plan-models-check.sh`：schema 非法 / `synthesis.model` 不在 `opencode models` 输出中 / **配置文件缺失** 三类均 exit≠0（**fail-closed：文件缺失不得放行**）；合法配置 exit 0（3 负向 + 1 正向），且缺配置时 prompt 的处置是「停下补配置」而非回落。
- [x] V4 `add`：已存在 id / 非法 id / deps 不存在 / **deps 指向 cancelled** / 成环 **五类均拒**；合法调用（**fixture 前提：BRIEF 已写 + 三节在场**）后 `check --phase dispatch` exit 0，且无 `.tmp-*` 残留。
- [x] V5 追问分流：未 done 节点改 BRIEF 后 `check --phase final` 报 `stale_inputs`（指名 `brief`），写 `inputs_reviewed` 后消失；已 done 节点走 `add` 新节点（正向用例）；在飞节点 `claim` 被拒。
- [x] V6 V6 三码：零 C 定义 ⇒ `synth_conclusion_no_chain`；证据 `path:startline` 上游不存在 ⇒ `synth_evidence_unresolvable`；推断链无 `⇒` ⇒ `synth_reasoning_missing`；`C10a` **不**被识别为 C token。**负向用例须带 `--strict-token`**。
- [x] V7 `settlement_missing`：含非 cancelled 合成节点 ∧ `ADR-plan-multi-session-collaboration` D11 ②③ ∧ 排除自身后零阻断 ∧ 无记录 ⇒ blocking；补记录后消失；全 cancelled 合成节点 ⇒ 不报；**断言未使用 `reportTopic().converged`**。
- [x] V8 `settlement_failed_not_superseded`：(a) `answer_node` ≠ 当前答案节点 ⇒ blocking；(b) `exit≠0` 且失败集含**任一可修复码** ⇒ blocking（grandfather 适用时除外，见 (f)）；(c) 追加 m2 且 `exit==0` 后消失（**实况为 `m4`，见 D7 SU**）；(d) 全为不可修复码 + `accept-with-gap` + `gap_reason` ⇒ 不阻断；(e) 未分类码 ⇒ 按不可修复处理；**(f) grandfather**：答案节点 `max(finished_at)` 的 UTC 日期 **< `2026-11-27`** ∧ `exit≠0` ∧ 含可修复码 ∧ `action: accept-with-gap` ∧ `gap_reason` 的码集合 ⊇（可修复码 ∪ 未分类码）⇒ 不阻断；**负向四例**：漏列任一需列码 / 改用 `action: accept` / 闭合于 2026-11-27 及之后 / **答案节点无已闭合 attempt** ⇒ 均 blocking。
- [x] V9 `topic_goal_unreviewed`：存在 ready 节点 ∧ 三节任一缺失 ⇒ blocking；补齐后消失；三个存量 topic（ready 均为空）不因此变红；`TOPIC.md` 缺失 ⇒ 同码。
- [x] V10a 回归：`v7-probe` 在 `--phase final` 报 `settlement_missing`（含非 cancelled 合成节点 ∧ D11 ②③ ∧ 排除自身零阻断 ∧ 无记录）。
- [x] V10b 闭环：给 `v7-probe` **真追加** `m2`（强模型 + BRIEF 点名要求 6 个上游「最重」项全进 `§反哺清单`）并跑通 `plan-synthesis-check` exit 0 ⇒ 写结算记录（`action: supersede:m2`、`model_id` 实填）后 `--phase final` exit 0。⚠ **不得用 `accept-with-gap` 绕过**（失败集含可修复码）。
- [x] V10c 覆盖：`build-worker-design`（答案节点 `m2`，最后一次闭合 `2026-11-26` ⇒ 早于判据生效日）按 **grandfather 路径**补结算记录后 `--phase final` exit 0，**不重做合成**。记录须：`synthesis_check_exit` 照抄实际值（默认口径实测 `1`）、`blocking` 原样照抄 check 输出、`action: accept-with-gap`、`gap_reason` **逐码列出**被豁免的可修复码，并在 `note` 注明 `--strict-token` 口径下另报的码（V6 三码 / `synth_token_missing` 属判据生效后新增面）。失败集若含判据生效后**新增**的可修复码，同样按 grandfather 处理（同一条规则，不按码龄分叉）。
- [ ] V11（**观察指标，不作 gate**）成本：同口径重跑一次（新根会话 + 同 8 内容 + 1 合成 + 排除探针量测段 + `model_id` 一致），记录根增量并与 `62,720` 并列报告；**不设 ≥10% 判定线**（单样本不可判）。
- [x] V12 判据面同步：`ViolationCode` 闭集 = 23；`plan-topics-topic-model.md` §4/§5/§10 快照与本文一致（P3 后 §10 `:138` 重写、P4 后 §5 加 `add` 行）。
- [x] V13 回滚面：registry 存在 `plan-collaboration-hardening` 条目（`state=unmanifested`）+ `pending/plan-collaboration-hardening.md` 在盘；`bun scripts/rollback-registry.ts` 无 M1。

## 已知不可机判清单（如实登记）

- **`synthesis_check_exit` 是父自述**：只保证「记录在场 + 形态自洽」。**中间路（backlog，不在本批）**：`plan-topic-check` 以 subprocess 调 `plan-synthesis-check` 复核自述值（CLI 对 CLI，不破自包含）。
- **provider 是否接受配置的模型 + 变体**：`opencode models` 只能证明 ID 存在；spawn 才知成败。
- **分解是否覆盖目标 / 目标是否合理 / 前提真假**：只能判「前提有没有写下来」。
- **V6 只判引用完整性与格式**，不判证据是否支持结论。
- **`accept-with-gap` 的理由是否成立**：只保证写了理由。
- **「禁止复用 worker 会话」无机械判据**：`resume` 不追加 attempt 是既有行为，「复用」没有可观测信号 ⇒ 只能写成 prompt 纪律；违反后果（台账不可归因 + 上下文污染）登记为本 ADR 的残余。
- **grandfather 只判「合成发生在判据生效前」这一事实**：不判该历史结论是否已过时、是否仍该被引用。
- **结算记录无修订留痕**：`## 结算记录` 可被反复改写（`accept` ↔ `accept-with-gap`），无历史版本；判据只读当前态。
- **「该标的都标了」**：同合成篇 D4 既有边界，未改善。

## 实施顺序（供 planner 拆分；每批含同批面）

**批序约束：P3 必须先于 P4；P1/P2 可并批；P5 最后**（`add` 的验收 fixture 前提含三节 ⇒ P4 依赖 P3）。**所有行号以「该批动手前的快照」为准**（P1 一改就会移动 `:309` 等锚点）。

| 批 | 内容 | 同批必须一起改 |
|---|---|---|
| **P0 回滚登记** | registry 加 `unmanifested` 条目 + `pending/plan-collaboration-hardening.md` 债指针（`bun scripts/rollback-registry.ts` 回绿） | 无（`tests/rollback-registry.test.ts` 随之回绿） |
| **P1 配置面** | `plan-models.json` + `plan-models-check.sh` + `prompts/plan.md:305-308` 改读 + spawn 失败处置行 | `governance-paths.json` 自纳入；`config-guards.test.ts` |
| **P2 结算闭环** | `TOPIC.md ## 结算记录` 约定 + 两码 + **grandfather（`SETTLEMENT_CRITERIA_SINCE` + 日期派生）** + 负向 fixture | `lib/plan-topics.ts` 闭集 + `tests/plan-topics.test.ts` + `tests/plan-topics-settlement.test.ts` + `plan-topics-topic-model.md` §4/§5 + **`prompts/plan.md` 的结算记录段（记录义务 + grandfather 例外）** |
| **P3 目标审查** | `TOPIC.md` 三节 + `topic_goal_unreviewed` + 存量 topic 补写指引 | 闭集与测试 + `plan-topics-topic-model.md` **§10 `:138` 重写** + `prompts/plan.md` TOPIC 模板段 |
| **P4 动态分解** | `add` 子命令（**可达拒绝 5 类** + 用法错误 exit 2；deps 重复一类见 D7 SU）+ 追问分流写进 prompt（含禁止复用 worker 会话） | `tests/plan-topics-lifecycle.test.ts` + `plan-topics-topic-model.md` **§5 命令面加 `add` 行** + `prompts/plan.md` fork/join 段 |
| **P5 可追溯** | `plan-worker` token 纪律 + 合成 BRIEF 第 4 条 + V6 三码 | `prompts/plan-worker.md`、`prompts/plan.md` 合成 BRIEF 段、`tests/plan-synthesis.test.ts` |

> P1/P2 对应「已实测失效」两条，建议同批；P0 是 P1 起的**前置**（仓库回绿）。
