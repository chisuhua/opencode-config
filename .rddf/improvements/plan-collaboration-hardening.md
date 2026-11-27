---
状态: 已立项
优先级: P1
revision_count: 2
last_feedback_id: feedback-20261127-003
last_feedback_at: '2026-11-27T08:08:19+00:00'
feedback_status: resolved
---

# plan-collaboration-hardening — plan 侧协作机制的五项补强

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 决策依据：`docs/adr/ADR-plan-collaboration-hardening.md`（**Proposed，v2 定向修订**，D1–D6；oracle 第 1 轮 BLOCK → 修 → critic 2 轮 **APPROVE**；v2 由实施期 metis `design_drift` 触发，oracle 只审 delta **APPROVE**，**未跑 critic 第 3 轮**（预算用尽，需用户批准）；报告 `.rddf/reviews/ADR-plan-collaboration-hardening.md`）
> 关联 change：`openspec/changes/plan-collaboration-hardening/`（本次立项）
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在（`.rddf/state/.arch-handoff.json` 与 `.rddf/state/.planner-handoff.json` 均缺失）⇒ 走**内置流程**（本目录的 `proposal.md` 由 planner 起草；`design.md` / `tasks.md` 归 builder）。先例：`openspec/changes/plan-synthesis-offload/`。

## metis 结论（2026-11-27，planner 侧固定审稿人；6 节全文摘要）

> 载体说明：planner 写集不含 `.rddf/reviews/` ⇒ 审稿结论按规矩落在本文件。
> **触发后果**：其中 a–e 五项属决策层 ⇒ 已落 `feedback-20261127-001`（kind `ac-fail`）并由 architect 做 ADR **v2 修订**（见下「处置」）。

**1. 隐藏意图**（4 条）
- 「模型配置化」的真正诉求是**跨次确定性**（同一探针的节点跑在同一模型上），不只是省 7,739 ctx ⇒ 已采纳：结算记录加 `model_id`（ADR v2 D4）。
- 「深度分解」被窄化为「目标留痕」，用户可能要的是「分解可被质疑」⇒ 本文件与 ADR 都只接住「前提留痕」（诚实边界），**已在 ADR §已知不可机判登记**。
- 「证据链」的用户视角是「我能抽查」，V6 三码全是机判 ⇒ 属实现层的可读性，留 builder 在 P5 交付时保证链接可点。
- 「目标合理性」被收成「前提写下来」，价值判断维度丢失 ⇒ 已登记为不可机判，不在本 change 声称解决。

**2. 歧义**（挑可判定者）
- P4 与 P3 的依赖矛盾 ⇒ **已修**（批序 + AC4 前提注明依赖 P3）。
- `content.model: null` 是 schema 强制还是约定 ⇒ **本文件明确**：`plan-models-check.sh` 允许 `null`（= 走 agent 默认档），`synthesis.model` 不允许 `null`。
- 「配置缺失」时回落 vs 拦截互斥 ⇒ **已修**（ADR v2 改 fail-closed）。
- V10 的「或」不可执行 ⇒ **已修**（V10a/b/c）。
- 追问已 done 节点时新节点 BRIEF 从哪来 ⇒ **本文件明确**：父**重写**完整 BRIEF（不得只写一句追问），并显式引用旧节点 `RESULT.md` 供新 worker 读取。

**3. AI slop 风险**（已按建议降低）
- 「带负向 fixture」无规格 ⇒ 每批的 fixture 形状写进 `tasks.md`（builder）。
- 结算记录 6 字段无 schema ⇒ **已修**（yaml 围栏块 + 行正则 + 7 键）。
- 「禁止复用 worker 会话」不可验收 ⇒ 登记为 prompt 纪律 + ADR §已知不可机判。
- 风险处置错位（负向 fixture 防不了误报）⇒ **本文件明确**：每批须**正向 + 负向成对**。
- V11 不可复现 ⇒ **已修**（降观察项）。

**4. 缺失的验收标准**（已补）
- `.openspec.yaml` / `design.md` / `tasks.md` 无归属 ⇒ `.openspec.yaml` 已补（`skip_specs: true`，`openspec validate` exit 0）；`design.md`/`tasks.md` 归 builder 且纳入实施期门禁。
- P0 完成态定义不清 ⇒ `bun scripts/rollback-registry.ts` exit 0 + `tests/rollback-registry.test.ts` 绿（已达成）。
- P3 对 `tests/plan-topics-lifecycle.test.ts` 的 fixture 改造面 ⇒ 已写进 What Changes 的 P3 行。
- `build-worker-design` 无人验 ⇒ AC10c。
- 部分交付的完成定义 ⇒ 实施期门禁（每批 4 个测试文件全绿 + `openspec validate` exit 0）。

**5. 边界情况**（8 条，留 `tasks.md` 逐条落）
半批回滚撞共享文件（`lib/plan-topics.ts`/`prompts/plan.md`/测试文件 ⇒ 按码/hunk 手工撤，不整批 revert）；P3 门控与父学习窗口为零；`plan-models.json` 三种异常态；`add` 的两阶段中间态（`missing_brief`）；fallback 全失败 + 悬挂 attempt 的 reap 恢复序列；行号锚点跨批漂移；**结算记录与追加节点的时序（必须先追加后记录，否则 `answer_node` 立即过期）**；`add` 之后 deps 节点被 cancel。

**6. 建议修改**（12 条）处置
a–e 决策层 ⇒ ADR v2；AC 单一登记处 / 批序 / P3 fixture 面 / 实施期门禁 / 行号快照 / 边界登记 ⇒ **本文件已更新**；`tasks.md` 化 ⇒ 交 builder。

## Why

`plan` 侧协作机制（topic / node / graph + 合成外置）**功能齐了，约束没落地**。五条可引事实：

1. **分解无判据**：`graph.json` / `BRIEF.md` 全由父手写（`prompts/plan.md:217-219`），判据只查结构（`lib/plan-topics.ts:716`），不查「分解是否覆盖目标」；`plan-topic-check` 无 `add` 子命令。
2. **模型 ID 以散文落盘且已漂移**：`prompts/plan.md:307` 记 `minimax-cn/MiniMax-M3.1-Flash`；2026-11-27 实测派发用 `opencode-go/kimi-k3.1-pro#high`。
3. **目标审查无载体**：`docs/architecture/plan-topics-topic-model.md:138` 自述「不存在『本轮目标集合』载体」。
4. **合成质量判据无闭环**：`plan-synthesis-check` 在 `v7-probe` 上 `exit 1`（7 阻断：6 × `synth_heavy_item_not_in_conclusion` + 1 × `synth_brief_no_ruling_set`，那 6 项**都带 `path:line` token**），而 `prompts/plan.md:309` 只写「不达标 ⇒ 追加 m2」，无强制 ⇒ 父只记录、未行动。
5. **结论不可追溯**：合成稿结论只回指节点小节（`nX §Y`），证据埋在上游 `RESULT.md`。

V7 Probe B 实测（`ses_de4e553c7ffe0VKqZLpLFbvM6o`）—— 根上下文增量 **+62,720**：

| 段 | 增量 | 占比 |
|---|---|---|
| 准备期（metis 8,362 + 找模型 7,739 + 建 topic ≈5,000 + 规格/DB ≈4,800） | 35,105 | **56%** |
| 8 次派发循环 | 15,872 | 25% |
| 读合成稿 | ≈5,000 | 8% |
| 量测 + 报告（探针自身） | 11,743 | 19% |

⇒ **12% 的根开销是「找模型」**（配置化即可消除）；metis 的 8,362 是咨询成本（落文件只解决下游可见性，不省这笔）。**offload 路径本体只有 ~21k** ⇒ 降本第一杠杆是纪律与配置，不是机制本身。

真问题一句话：**「有约定、无强制、无单一真源」**。

## What Changes

六批（P0 为前置；**批序约束：P3 先于 P4、P1/P2 可并批、P5 最后**；每批列同批面，避免判据与文档分叉）：

| 批 | 改什么 | 落点 | 同批面 |
|---|---|---|---|
| **P0 回滚登记** | registry 加 `unmanifested` 条目 + `pending` 债指针（当前 `bun scripts/rollback-registry.ts` 因新 ADR 报 M1，必须先回绿） | `.rddf/rollback/registry.json`、`.rddf/rollback/pending/plan-collaboration-hardening.md` | `tests/rollback-registry.test.ts` |
| **P1 配置面** | 新增全局 `plan-models.json`（`synthesis.model` + `fallback[]`，`content.model: null`）+ `plan-models-check.sh`（schema + 与 `opencode models` 比对）+ `prompts/plan.md:305-308` 改为读配置、并补「spawn 失败 ⇒ 同回合 close + 按 fallback 重 claim」 | `~/.config/opencode/plan-models.json`、`scripts/plan-models-check.sh`、`prompts/plan.md` | `governance-paths.json` 自纳入（`plan-models.json`）；`config-guards.test.ts` |
| **P2 结算闭环** | `TOPIC.md` 新增 `## 结算记录`（必填 6 字段；`accept-with-gap` 必填 `gap_reason`）+ 两码 `settlement_missing` / `settlement_failed_not_superseded`（收尾条件 = 父篇 D11 ②③ ∧ 排除自身后零阻断；失败集「任一可修复 ⇒ 必须 supersede」；未分类码 fail-closed 按不可修复） | `prompts/plan.md`（`:309` 记录义务）、`lib/plan-topics.ts`、`scripts/plan-topic-check.ts` | `ViolationCode` 闭集 20→23；`tests/plan-topics.test.ts`；`plan-topics-topic-model.md` §4/§5 |
| **P3 目标审查** | `TOPIC.md` 三节 `## 前提与证伪条件` / `## 非目标` / `## 目标审查结论` + 码 `topic_goal_unreviewed`（仅 `--phase dispatch` 且 ready 非空）+ 存量 topic 补写指引 | `prompts/plan.md`（TOPIC 模板段）、`lib/plan-topics.ts`、`scripts/plan-topic-check.ts` | 闭集与测试；**存量 fixture 改造：`tests/plan-topics-lifecycle.test.ts` 的 `fixtureTopic()` 必须写三节 TOPIC.md —— 否则 `:172`/`:286`/`:377` 的 `--phase dispatch` exit 0 断言会因 `topic_goal_unreviewed` 变红**；`plan-topics-topic-model.md` §10 `:138` 重写 |
| **P4 动态分解** | `plan-topic-check add <topic> <id> --title --deps`（原子写 + 短锁 + 5 类拒绝：已存在 / 非法 id / deps 不存在 / deps 指向 cancelled / 成环）+ 追问分流写进 prompt（未 done ⇒ 改 BRIEF 新 attempt；**已 done ⇒ add 新节点**；**禁止复用 worker 会话**） | `scripts/plan-topic-check.ts`、`prompts/plan.md` | `tests/plan-topics-lifecycle.test.ts`；`plan-topics-topic-model.md` §5 加 `add` 行 |
| **P5 可追溯** | 合成稿每条结论 `C<n>` + 「证据链」+「推断链」两行；V6 三码（`synth_conclusion_no_chain` / `synth_evidence_unresolvable` / `synth_reasoning_missing`，默认 info、`--strict-token` 升 blocking） | `prompts/plan-worker.md`（token 纪律）、`prompts/plan.md`（合成 BRIEF 第 4 条）、`scripts/plan-synthesis-check.ts` | `tests/plan-synthesis.test.ts` |

**明确不做**：不新增 agent、不改 `plan-worker` 权限模板、不动 `scope-check` 并行假阳性、不做「自动加节点」、不给 `claim` 加 re-open、不碰 delegate 通道与全局 3 槽、本批不加「subprocess 复核自述 exit」。

## Acceptance

**判据真源 = `docs/adr/ADR-plan-collaboration-hardening.md` 的 `## Verification` 章（V1–V13 为唯一真源）**。**AC 的唯一登记处 = `openspec/changes/plan-collaboration-hardening/proposal.md` 的 `## 验收标准`**；下表只是索引（避免两处各写一套）。

| AC | V | 一句话 |
|---|---|---|
| AC1 | V1 | 配置存在 + 合成段无硬编码模型 ID |
| AC2 | V2 | 配置进治理面清单 + 守卫绿 |
| AC3 | V3 | `plan-models-check.sh` 三负一正（含**配置缺失也须 exit≠0**，fail-closed） |
| AC4 | V4 | `add` **六类拒绝**（已存在 id / 非法 id / deps 不存在 / deps 指向 cancelled / deps 重复 / 空 `--title`）+ 合法调用后 dispatch exit 0；**成环在 `add` 路径不可达**（`assertAcyclic` 防御性复检） |
| AC5 | V5 | 追问分流（未 done 改 BRIEF / 已 done 走 add / 在飞 claim 被拒） |
| AC6 | V6 | V6 三码 + `C10a` 不误识别（负向需 `--strict-token`） |
| AC7 | V7 | `settlement_missing`（含自排除断言、全 cancelled 不报） |
| AC8 | V8 | `settlement_failed_not_superseded`（过期记录 / 可修复未追加 / accept-with-gap / 未分类码） |
| AC9 | V9 | `topic_goal_unreviewed`（ready 非空才触发；存量三 topic 不红） |
| AC10a | V10a | `v7-probe` 在 `--phase final` 报 `settlement_missing` |
| AC10b | V10b | `v7-probe` **真追加合成节点**跑通 exit 0 + 记录体现 supersede 语义（不得用 accept-with-gap 绕过）；实际追加 `m4`（`m2` 失败被 supersede、`m3` 参数错误作废） |
| AC10c | V10c | `build-worker-design` 补记录后 exit 0；走 ADR v3 的 **grandfather**（`accept-with-gap` + 逐码 `gap_reason`，不重做合成） |
| AC11 | V11 | **观察项**（同口径重跑 + `model_id` 一致；不设判定线） |
| AC12 | V12 | 判据面同步：闭集 23 + 主题文档 §4/§5/§10 |
| AC13 | V13 | 回滚面：registry 条目 + pending 债指针 + 无 M1 |

**实施期门禁**（每批交付时必须成立）：`bun test tests/plan-topics*.test.ts tests/plan-synthesis.test.ts tests/config-guards.test.ts tests/rollback-registry.test.ts` 全绿 + `openspec validate plan-collaboration-hardening` exit 0。

## Capabilities

新增/改变的能力面：

1. **模型解析可配**：`synthesis.model` 从全局配置读，派发前有机械可用性检查（`opencode models` 比对）⇒ 不再「每次查、每次可能漂移」。
2. **图可增量演化**：`add` 子命令让「按结论加节点」从「手改 JSON」变成带锁、原子、fail-fast 的操作；追问有 done/未 done 两条明确路径（已 done 只能 add 新节点）。
3. **质量闭环**：合成失败不再能「记录一下就算完」——要么追加更大合成节点并通过，要么 `accept-with-gap` 写明理由。
4. **目标可审查**：前提/非目标/审查结论必须在 `TOPIC.md` 里可见，下游节点能看见自己服务哪个前提。
5. **结论可追溯**：每条结论带 `C<n>` + 证据链（`path:startline` 且必须在上游字面出现）+ 推断链。
6. **判据面**：`ViolationCode` 20→23；`plan-synthesis-check` 新增 3 码。

## Impact

**文件面**

| 面 | 文件 | 性质 |
|---|---|---|
| 治理面（oracle→critic 必审） | `prompts/plan.md`、`prompts/plan-worker.md`、`.rddf/config/governance-paths.json`（自纳入新增条目） | 改 |
| 机制面 | `lib/plan-topics.ts`（闭集 + 3 码）、`scripts/plan-topic-check.ts`（+80~120 行）、`scripts/plan-synthesis-check.ts`（+60~90 行） | 改 |
| 新增 | `~/.config/opencode/plan-models.json`、`scripts/plan-models-check.sh` | 新 |
| 回滚面 | `.rddf/rollback/registry.json`、`.rddf/rollback/pending/plan-collaboration-hardening.md` | 新/改 |
| 测试 | `tests/plan-topics.test.ts`、`tests/plan-topics-lifecycle.test.ts`、`tests/plan-synthesis.test.ts`、`tests/config-guards.test.ts` | 改 |
| 文档 | `docs/architecture/plan-topics-topic-model.md` §4/§5/§10 | 改 |

**迁移成本**：三个存量 topic 的 `ready` 均为空 ⇒ 缺三节**不会**变红；真实成本 = `v7-probe` / `build-worker-design`（均含合成节点）在 `--phase final` 下报 `settlement_missing`，各补一条结算记录。

**风险**：① 父自述 `synthesis_check_exit` 可谎报（闭环只到「记录在场 + 形态自洽」）；② provider 是否接受配置的模型/变体只能在 spawn 时暴露（D1 已要求同回合 close + fallback 重 claim）；③ V6 可能催生「凑格式」（以「`path:startline` 必须在上游字面出现」兜底）；④ `accept-with-gap` 的理由是否成立不可判。

**回滚**：P0 起逐批可逆（见 ADR `## 回滚面` 五步）；每批撤除后必须 `bun test tests/plan-topics*.test.ts tests/plan-synthesis.test.ts tests/config-guards.test.ts` 全绿。

**backlog（不返工）**：① `tests/plan-topics.test.ts` 的 `allowed` 集只列 15 码（20 码时代起即不完备）；② `plan-topic-check` 以 subprocess 复核自述 `exit`（堵谎报的唯一机械路径，不在本批）。

## Feedback

### feedback-20261127-001

- **source**: rdd-builder
- **kind**: ac-fail
- **created_at**: 2026-11-27T07:17:14+00:00
- **ref_change**: plan-collaboration-hardening
- **resolution**: resolved

#### Body

① kind: ac-fail（design_drift —— 需要改 ADR 的 Verification/决策才能继续）
② 阻塞点：docs/adr/ADR-plan-collaboration-hardening.md 的 V10（验收第 10 条）与同文 D4 的量化规则自相矛盾；另 D4 缺「结算记录」字段形状、D1 缺「配置缺失」语义、P4↔P3 依赖未声明。
③ 需要什么决策：
  a) V10 可执行性：v7-probe 的 7 阻断（6×synth_heavy_item_not_in_conclusion + 1×synth_brief_no_ruling_set）全部属 D4 的「可修复类」⇒ 按「任一可修复 ⇒ 必须 supersede」，`accept-with-gap` 分支非法；而 supercede 需要真追加 m2（未做）。二选一：(a1) 给 v7-probe 真追加 m2 并跑通（exit 0 ⇒ 记录 supersede:m2）；(a2) ADR 增加「历史 topic 一次性豁免」条款。
  b) D4 结算记录：补精确 markdown 形状 +「字段在场」的机械判据（如 `^- \*\*checked_at\*\*:` 行正则），否则两码不可实现、verifier 不可验。
  c) D4 字段集是否加第 7 字段 `model_id`（跨次探针的模型可比性；metis 隐藏意图 #1）。
  d) D1「配置缺失」语义：脚本 exit≠0 ⇒ 禁止派发，还是 prompt「缺失才回落查 models 工具」（放行）——二选一写死。
  e) P4 与 P3 的依赖方向：AC4 fixture 前提写「三节在场」而三节是 P3 产物 ⇒ P4 依赖 P3，与 improvement「其余可独立成批」冲突。
④ 已完成 / 未完成：
  已完成 —— P0（registry `unmanifested` 条目 + pending 债指针；`bun scripts/rollback-registry.ts` PASS、`tests/rollback-registry.test.ts` 21 pass）；`openspec validate` exit 0（补 .openspec.yaml）；P1 主体（plan-models.json、scripts/plan-models-check.sh、prompts/plan.md 合成段改读 + spawn 失败处置行、governance-paths.json 自纳入；config-guards 154 pass；脚本正向 + 4 负例手测通过）。
  未完成 —— P1 的 V3 测试文件；P2–P5 全批；openspec 的 design.md / tasks.md。
⑤ 建议下一步：切 architect 做一次定向 ADR 修订（a–e 五项），再切 planner 更新 improvement/proposal（P4↔P3 依赖、AC 单一登记表、实施期测试门禁、P3 对 tests/plan-topics-lifecycle.test.ts 的 fixture 改造面），然后回 builder 续 P1 收尾 + P2–P5。
- **resolved_at**: 2026-11-27T09:56:59+00:00
- **resolved_by**: human
### feedback-20261127-002

- **source**: rdd-builder
- **kind**: noted
- **created_at**: 2026-11-27T07:55:49+00:00
- **resolution**: resolved

#### Body

实测缺陷（v7-probe 真跑 AC10b 时撞到）：add 子命令建错 --deps 后没有修正通道 —— deps 不在任何子命令里可改，已存在 id 又拒绝重建 ⇒ 只能 cancel 旧节点 + 换 id 新建（本轮 m3→cancel、m4 重建，答案序号被推到 m4）。建议 planner 在 V4 的 AC 里明确：add 的 deps 不可变（要么补一条修正子命令，要么把『建错即 cancel 重建』写成规范操作）。
- **resolved_at**: 2026-11-27T09:56:59+00:00
- **resolved_by**: human
### feedback-20261127-003

- **source**: rdd-builder
- **kind**: needs-revision
- **created_at**: 2026-11-27T08:08:19+00:00
- **resolution**: resolved

#### Body

AC10b 的节点 id 与事实不符（proposal.md:46）。字面要求「真追加 m2 跑通 exit 0 + 记录 supersede:m2」，但实际 m2 自己就失败了：m2 漏载 n6 的 execute-skill-retired（synth_heavy_item_not_in_conclusion，可修复码）⇒ 按 D4 不得修订 m2，只能再追加 m4；m3 因 add 漏 --deps 未派发即 cancel。最终跑通的是 m4（plan-synthesis-check --strict-token exit 0、check --phase final exit 0），结算记录 action=supersede:m4、answer_node=m4、model_id=opencode-go/kimi-k3.1-pro#high。建议 AC10b 改为「真追加合成节点（实际 m4：m2 因漏载 execute-skill-retired 被 supersede；m3 因 add 参数错误作废）跑通 exit 0 + 结算记录体现 supersede 语义（未用 accept-with-gap）」。实质判据（真追加 + exit 0 + supersede + 未用 gap）已满足，仅 id 与路径需据实更新。
- **resolved_at**: 2026-11-27T09:56:59+00:00
- **resolved_by**: human