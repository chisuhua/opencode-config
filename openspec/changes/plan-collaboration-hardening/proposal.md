# plan-collaboration-hardening — plan 侧协作机制的五项补强

> **登记来源**：`.rddf/improvements/plan-collaboration-hardening.md`（5 段草稿）
> **判据真源**：`docs/adr/ADR-plan-collaboration-hardening.md` 的 `## Verification` 章（**V1–V13 为唯一真源**）。本文件 `## 验收标准` 只做 **AC 编号 ↔ V 编号映射**与状态登记，**不复制判据正文**（避免第二份可漂移副本）。
> **决策依据**：`ADR-plan-collaboration-hardening`（**Proposed，v3**，D1–D6；oracle 1 轮 BLOCK → 修 8 条；critic 2 轮 **APPROVE**；v2 / v3 定向修订各 1 轮 oracle（v3 另有 critic 第 3 轮 **APPROVE_WITH_CONDITIONS**，经用户批准）。报告 `.rddf/reviews/ADR-plan-collaboration-hardening.md`）
> **执行路径**：六批跨 `prompts/**`（治理面 ⇒ 审查按 **patch series** 计：P1 一次、P2–P5 的 prompt 改动合并为一次，各 oracle→critic）、`lib/**`（机制面）、`scripts/**`、`tests/**`、`.rddf/rollback/**`（P0）⇒ **P0 必须先落**（当前 `bun scripts/rollback-registry.ts` 因新 ADR 报 M1 红）。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在（`.rddf/state/.arch-handoff.json` / `.rddf/state/.planner-handoff.json` 均缺失）⇒ 走**内置流程**（本目录 `proposal.md` 由 planner 起草；`design.md` / `tasks.md` 归 builder）。先例：`openspec/changes/plan-synthesis-offload/`。

## Why

plan 侧协作机制（topic / node / graph + 合成外置）**功能齐了，约束没落地**：模型 ID 写在散文里且已漂移、分解与目标审查靠父的记忆、合成质量判据算得出却不产生行动、结论只回指节点小节无证据链。

V7 Probe B 实测（`ses_de4e553c7ffe0VKqZLpLFbvM6o`）：根上下文增量 **+62,720**，其中准备期占 **56%**（找模型 7,739 ≈ 总增量 12%、metis 8,362、建 topic ≈5,000、规格/DB ≈4,800），而 offload 路径本体只有 **~21k**。⇒ 降本第一杠杆是**纪律与配置**，不是机制本身。

同一轮实测还给出一个失效证据：`plan-synthesis-check` 在 `v7-probe` 上 `exit 1`（7 阻断，其中 6 个上游「最重」项**都带 `path:line` token** 仍未进 §反哺清单），而 `prompts/plan.md:309` 只写「不达标 ⇒ 追加 m2」——**判据红了，没人行动**。

## What Changes

六批（P0 为前置；**批序约束：P3 先于 P4、P1/P2 可并批、P5 最后**；每批自带同批面，避免判据与文档分叉）：

| 批 | 改什么 | 关键落点 |
|---|---|---|
| **P0 回滚登记** | registry 加 `unmanifested` 条目 + `pending` 债指针（回绿 M1） | `.rddf/rollback/registry.json`、`.rddf/rollback/pending/plan-collaboration-hardening.md` |
| **P1 配置面** | 全局 `plan-models.json`（`synthesis.model` + `fallback[]`）+ `plan-models-check.sh`（schema + `opencode models` 比对）+ prompt 改读配置 + spawn 失败处置行 | `~/.config/opencode/plan-models.json`、`scripts/plan-models-check.sh`、`prompts/plan.md:305-308`、`governance-paths.json` |
| **P2 结算闭环** | `TOPIC.md ## 结算记录`（**7 必填键**）+ `settlement_missing` / `settlement_failed_not_superseded`（收尾条件 = D11 ②③ ∧ 排除自身）；失败集「任一可修复 ⇒ 必须 supersede」，未分类码 fail-closed；**grandfather**（判据生效前已结算 ⇒ `accept-with-gap` + 逐码 `gap_reason`） | `prompts/plan.md`（结算段）、`lib/plan-topics.ts`、`scripts/plan-topic-check.ts`、`ViolationCode` 20→23 |
| **P3 目标审查** | `TOPIC.md` 三节（前提与证伪条件 / 非目标 / 目标审查结论）+ `topic_goal_unreviewed`（仅 `--phase dispatch` 且 ready 非空） | `prompts/plan.md`、`lib/plan-topics.ts`、`scripts/plan-topic-check.ts`、`plan-topics-topic-model.md §10:138` |
| **P4 动态分解** | `plan-topic-check add`（原子写 + 短锁 + **6 类拒绝**：已存在 id / 非法 id / deps 不存在 / deps 指向 cancelled / deps 重复 / 非空 title；**成环在 `add` 路径不可达**，由 `assertAcyclic` 防御性复检）+ 追问分流（未 done 改 BRIEF；已 done 走 add；**禁止复用 worker 会话**） | `scripts/plan-topic-check.ts`、`prompts/plan.md`、`plan-topics-topic-model.md §5` |
| **P5 可追溯** | 结论 `C<n>` + 证据链 + 推断链；V6 三码（默认 info，`--strict-token` 升 blocking） | `prompts/plan-worker.md`、`prompts/plan.md`、`scripts/plan-synthesis-check.ts` |

## 验收标准

判据真源 = ADR 的 `## Verification`（V1–V13）；**本表是 AC 的唯一登记处**（improvement 的 Acceptance 只作索引），**不复制判据正文**。

| AC | V | 内容 | 状态 |
|---|---|---|---|
| AC1 | V1 | `plan-models.json` 存在 + 合成段无硬编码模型 ID | **已验证**（2026-11-27，见 verify 报告） |
| AC2 | V2 | 配置进治理面清单 + `config-guards` 绿 | **已验证**（2026-11-27，见 verify 报告） |
| AC3 | V3 | `plan-models-check.sh` 三负一正（含**配置缺失也 exit≠0**，fail-closed） | **已验证**（2026-11-27，见 verify 报告） |
| AC4 | V4 | `add` **六类拒绝**（已存在 id / 非法 id / deps 不存在 / deps 指向 cancelled / deps 重复 / 空 `--title`）+ 合法调用 dispatch exit 0（fixture 前提：BRIEF 已写 + 三节在场 ⇒ **依赖 P3**）。⚠ V4 字面的「成环」在 `add` 路径**不可达**（自依赖先被「deps 不存在」拒）⇒ 实际由 `assertAcyclic` 作防御性复检、无独立用例 | **已验证**（2026-11-27，见 `.rddf/reviews/plan-collaboration-hardening-verify.md`） |
| AC5 | V5 | 追问分流（未 done / 已 done / 在飞） | **已验证**（2026-11-27，见 verify 报告） |
| AC6 | V6 | V6 三码 + `C10a` 不误识别（负向需 `--strict-token`） | **已验证**（2026-11-27，见 verify 报告） |
| AC7 | V7 | `settlement_missing`（自排除断言 + 全 cancelled 不报） | **已验证**（2026-11-27，见 verify 报告） |
| AC8 | V8 | `settlement_failed_not_superseded`（过期 / 可修复未追加 / `accept-with-gap` / 未分类码） | **已验证**（2026-11-27，见 verify 报告） |
| AC9 | V9 | `topic_goal_unreviewed`（ready 非空才触发；存量三 topic 不红） | **已验证**（2026-11-27，见 verify 报告） |
| AC10a | V10a | `v7-probe` 在 `--phase final` 报 `settlement_missing` | **已验证**（2026-11-27，见 verify 报告） |
| AC10b | V10b | `v7-probe` **真追加合成节点**跑通 `--strict-token` exit 0 + 结算记录体现 supersede 语义（**不得用 `accept-with-gap` 绕过**）。⚠ 实际链路：`m2` 实测失败（漏载 n6 的 `execute-skill-retired`，可修复码）⇒ 按 D4 不修订、追加 **`m4`**（`m3` 因 `add` 漏 `--deps` 未派发即 cancel）⇒ 记录 `answer_node: m4` / `action: supersede:m4` | **已验证**（实质；节点 id 与原计划的 `m2` 不同，见 verify 报告 §2） |
| AC10c | V10c | `build-worker-design` 补结算记录后 `--phase final` exit 0。⚠ v2 的「全不可修复才可豁免」在本 topic 不成立（失败集含可修复码 `synth_brief_no_ruling_set`）、且 `cancel` 硬拒已 done 节点 ⇒ 走 **ADR v3 的 grandfather**：`action: accept-with-gap` + `gap_reason` 逐码覆盖，不重做合成 | **已验证**（2026-11-27，含两条反例取证） |
| AC11 | V11 | **观察项**（同口径重跑 + `model_id` 一致；**不设判定线**） | **不适用**（观察项，无判定对象） |
| AC12 | V12 | 判据面同步（闭集 23 + 主题文档 §4/§5/§10） | **已验证**（2026-11-27，见 verify 报告） |
| AC13 | V13 | 回滚面（registry 条目 + pending 债指针 + 无 M1） | **已验证**（2026-11-27：registry PASS + 21 测试通过） |

**实施期门禁**（每批交付时必须成立）：`bun test tests/plan-topics*.test.ts tests/plan-synthesis.test.ts tests/config-guards.test.ts tests/rollback-registry.test.ts` 全绿 + `openspec validate plan-collaboration-hardening` exit 0。

## 非目标

- 不新增 agent（不走合成篇 D3 的 B 档）。
- 不改 `plan-worker` 权限模板（写域仍到 topic 树粒度）。
- 不动 `scope-check` 并行假阳性（独立缺陷，另案）。
- 不做「动态分解自动展开」（`add` 永远由父决定）。
- 不给 `claim` 加 re-open 语义（追问走 add 分流）。
- **不提供 `add` 的 deps 修正通道**：`deps` 写入后不可改，建错只能 `cancel` 该节点 + 换 id 新建（实测路径：`m3` 漏 `--deps` ⇒ cancel、`m4` 重建）。属已知限制，记 `.rddf/improvements/plan-collaboration-hardening.md` 的 `feedback-20261127-002`。
- 不碰 delegate 通道与全局 3 槽。
- 本批不加「`plan-topic-check` subprocess 复核自述 exit」（backlog）。

## 交付物

1. `docs/adr/ADR-plan-collaboration-hardening.md`（Proposed，**v3**；oracle 1 轮 + critic 2 轮 + v2/v3 各一轮 oracle + v3 critic 第 3 轮）
2. `.rddf/improvements/plan-collaboration-hardening.md`（5 段草稿 + metis 结论段）
3. `openspec/changes/plan-collaboration-hardening/`：`proposal.md`（planner）+ `.openspec.yaml`（已补，`skip_specs: true`）+ `design.md` / `tasks.md`（**待 builder**）
4. `.rddf/rollback/registry.json` 条目 + `pending/plan-collaboration-hardening.md`（P0，**已落**）
5. `~/.config/opencode/plan-models.json` + `scripts/plan-models-check.sh`（P1，已落）
6. 三份判据变更：`lib/plan-topics.ts` 闭集 23、`scripts/plan-topic-check.ts` 三码 + `add`、`scripts/plan-synthesis-check.ts` V6 三码
7. 文档同步：`plan-topics-topic-model.md` §4/§5/§10、`prompts/plan.md`、`prompts/plan-worker.md`
8. 测试：4 个测试文件的负向 fixture（每批**正向 + 负向成对**，见 `tasks.md`）

## 风险

| 风险 | 处置 |
|---|---|
| **P0 未落时仓库红**（M1：新 ADR 未被 registry 覆盖） | P0 是前置；maker 是 builder（`.rddf/rollback/**` 不在 architect 写集） |
| 父自述 `synthesis_check_exit` 可谎报 | 只保证「记录在场 + 形态自洽」；机械复核登记 backlog |
| 配置模型被 provider 拒 | 同回合 `close` + 按 `fallback[]` 重 `claim`（写进 prompt） |
| 判据面扩宽导致误报 | 每批带负向 fixture；未分类码 fail-closed 但明确要求写理由 |
| 存量 topic 迁移 | 三 topic `ready` 均空 ⇒ 只有两个含合成节点的需补结算记录 |
