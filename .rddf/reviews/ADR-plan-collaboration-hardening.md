# 审稿报告 — ADR-plan-collaboration-hardening

> 由 architect 在收口时从审查者输出誊写（审查者只读，不写盘）。
> 审查对象：`docs/adr/ADR-plan-collaboration-hardening.md`
> 最终状态：**Accepted**（2026-11-28；实现已落地 + 独立验收 + change 已归档 ⇒ `openspec/changes/archive/2026-11-28-plan-collaboration-hardening/`）

## 0. 判定汇总

| 轮次 | 审查者 | 判定 | 关键产出 |
|---|---|---|---|
| 1 | oracle | **BLOCK** | 8 条 finding（2 条属决策内容错误） |
| 2 | critic（第 1 轮） | **REJECT** / `mergeable: no` / `scope_exceeded: true` | 2 BLOCKER + 4 SHOULD_FIX + 4 NITS |
| 3 | critic（第 2 轮，复审） | **APPROVE** / `mergeable: yes` / `scope_exceeded: false` | BLOCKER 2/2 闭合，1 NIT（已修） |

预算：oracle 1 轮 + critic 2 轮（第 2 轮为 BLOCKER 复审，只验闭合）。无第 3 轮。
⚠ **本汇总只覆盖 v1 首轮**：v2 / v3 定向修订各自追加审级 —— v2 = oracle 只审 delta（**APPROVE**，未跑 critic）；v3 = oracle **PASS-WITH-NOTES**（6/6 闭合）+ **critic 第 3 轮**（经用户批准）`APPROVE_WITH_CONDITIONS`（2 条 SHOULD_FIX 已修，0 未闭合 BLOCKER）。逐条见 §5 / §6。

## 1. oracle（第 1 轮）判定：BLOCK

> 判定原文：`BLOCK（D2 追问行对 done 节点机械不可执行，且结算门存在与自身目标同族的恒绿通道 —— 作为后续所有 topic 的唯一决策依据，须先修建议 1–3 再进 critic）`

finding 与处置：

| # | finding | 处置 |
|---|---|---|
| 1 | D2「追问 = 改 BRIEF + 重新 claim」对**已 done** 节点机械不可执行（claim 硬拒 done、D9 无重开、改 BRIEF 不改派生 status） | **已修**：追问按 done/未 done 分流；已 done 走 `add` 新节点 |
| 2 | `settlement_missing` 的「图收敛」前提与自身 blocking 身份**循环**（首跑红 ⇒ 次跑恒绿） | **已修**：前提显式排除本码与下一码自身；V7 加断言 |
| 3 | `settlement_failed_not_superseded` 存在「加个同样失败的 m2 即绿」通道 | **已修**：改为 `answer_node` 必须 == 当前答案节点 ∧ 该节点 `exit==0` |
| 4 | 「有合成节点」未排除全 cancelled ⇒ 不可消解红 | **已修**：收窄为「非 cancelled 合成节点」 |
| 5 | V6 对零 C token 的稿「空集为真」 | **已修**：加非空前提 + token 词边界 + 3 行容差 + `path:startline` 抽取规格 |
| 6 | `add` 漏「deps 指向 cancelled」⇒ 进图即恒红、不 fail-fast | **已修**：列为第 4 类拒因 |
| 7 | 迁移成本描述失真（存量 topic 不会因缺三节变红） | **已修**：按盘核实测重写 |
| 8 | 实施顺序漏同批面（`ViolationCode` 闭集 / 测试 / 主题文档） | **已修**：每批列同批面 |

## 2. critic（第 1 轮）判定：REJECT

> `mergeable: no`；`scope_exceeded: true`（唯一越界项：`tests/plan-topics.test.ts` 闭集断言自 20 码时代起只有 15 码，属既有缺陷 ⇒ 记 backlog，不返工）

| 严重度 | finding | 处置 |
|---|---|---|
| **BLOCKER 1** | 可修复/不可修复白名单漏 `synth_conclusion_layer_missing`（与 `synth_heavy_item_not_in_conclusion` 属同一失效类的聚合形态）+ 混合失败集量化词未规定 ⇒ 可达恒绿通道 | **已修**：全 12 码逐一归类（可修复 4 + V6 三码 / 不可修复 7 / 不可达 1）；量化词钉死「任一可修复 ⇒ 必须 supersede」；未分类码 fail-closed |
| **BLOCKER 2** | 全文缺回滚面：新 ADR 落盘即触发 registry M1，五批顺序无一提及 | **已修**：新增 `## 回滚面` 章（条目 JSON + `pending` 债指针 + 5 步回滚）+ P0 前置 + V13；过渡态（当前 M1 红）如实登记 |
| SHOULD_FIX 1 | `settlement_missing` 的「图收敛」丢了 D11 的 ②全终态/③无在飞 ⇒ 可达假红窗口；且与已签批术语 `converged` 撞车 | **已修**：改为「D11 ②③ ∧ 排除自身后零阻断 = 0」，并明写不得实现为 `reportTopic().converged` |
| SHOULD_FIX 2 | C token 正则与示例矛盾（`C10a` 会被匹配成 `C10`） | **已修**：lookahead 改 `(?![0-9A-Za-z])` |
| SHOULD_FIX 3 | P2 同批面漏 `prompts/plan.md:309`（记录义务） | **已修**：P2 同批面补入 |
| SHOULD_FIX 4 | P3/P4 对主题文档的同步不完整（§10 `:138` 会成假话、§5 缺 `add` 行） | **已修**：P3 补 §10 重写、P4 补 §5 命令面 |
| NITS | 「闭集断言会因扩容变红」失真；审稿段口径不一；V4 fixture 前提未注明；追问行漏「须无未闭合 attempt」 | **已修**：全部按原文改 |

## 3. critic（第 2 轮，复审）判定：APPROVE
> `mergeable: yes`；`scope_exceeded: false`
> 复审只判两问：上一轮 BLOCKER 是否闭合 / 新 diff 是否引入新 BLOCKER。

闭合判据（critic 引用）：

- **B1 闭合**：12 码分类表与 `scripts/plan-synthesis-check.ts` 实际码集逐一对应（可修复 4 + V6 三码 / 不可修复 7 / 不可达 1）；混合集量化词与触发条件 (b)、V8(b)(d)(e) 三处一致；`synth_answer_missing` 归「不可达」经 `answerNodeId`（`:92-100`）验证严密。
- **B2 闭合**：`## 回滚面` 条目 JSON 与 registry state 机逐条合规（unmanifested 禁清单 + 必 watch + 必 `pending_backlog`；`declared` 要求 watch 路径尚不存在 ⇒ 不可用）；分工可行（`.rddf/rollback/**` 不在 architect 写集 `lib/role-policy.ts:153`，builder `allow:["**"]` `:176`）；P0 + V13 + 每批全绿条件齐备。
- **新 diff 无新 BLOCKER**：D11 ②③ 与父篇 `:162` 精确对应、反自毁论证自洽；正则修正与散文一致；负面段改写经测试断言形态核实属实。
- 唯一 NIT：`:108` / `:206` 的「D11」未带父篇名 ⇒ **已修**（两处均写全 `ADR-plan-multi-session-collaboration` D11）。

## 4. 遗留与后续

- **P0 未落地前 `bun scripts/rollback-registry.ts` 为红**（M1），属实且已登记（P0 + V13）；该两处文件在 `.rddf/rollback/**`，不属 architect 写集，只能由 builder 落。
- **backlog（不返工）**：`tests/plan-topics.test.ts` 的 `allowed` 集只列 15 码（20 码时代起即不完备，子集断言不拦截扩容）。
- **backlog（新）**：`plan-topic-check` 以 subprocess 调 `plan-synthesis-check` 复核自述 `synthesis_check_exit` —— 堵「父谎报 exit」的唯一机械路径，不在本批。
- **关联 change**：**已归档**（2026-11-28）：`openspec/changes/archive/2026-11-28-plan-collaboration-hardening/`（AC1–AC13 登记于其 `proposal.md`；沿革 = `backlog: plan-collaboration-hardening` 占位起步）。

## 5. v2 定向修订（2026-11-27，实施期触发）

**触发源**：实施到 P1 时，planner 侧固定审稿人 **metis** 复核立项产物，指出 5 条决策层缺陷 ⇒ 落凭据 `feedback-20261127-001`（kind `ac-fail`，`design_drift`）⇒ 由 architect 定向修订（非复审）。
**审级**：oracle **1 轮（只审 delta）** —— **APPROVE**。⚠ **未跑 critic 第 3 轮**（该 ADR 的 critic 预算已用尽 2/2，第 3 轮需用户批准）⇒ 本修订属**单审修订**，已在 ADR 元数据明写。

| # | 原缺陷 | v2 修订 | oracle 闭合判定 |
|---|---|---|---|
| a | V10 与 D4 量化规则自相矛盾（7 阻断全属可修复 ⇒ `accept-with-gap` 非法；supersede 又未真做） | V10 拆 **a/b/c**：V10b 走「真追加 m2」路径并明令不得用 `accept-with-gap` 绕过 | **闭合**（m2 成功的闭环与 m2 仍失败时触发 V8(b) 均推演为无恒绿通道） |
| b | D4 结算记录无形状 ⇒ 两码不可实现 | `yaml` 围栏块 + `^([a-z_]+):[ ]?(.*)$` + **7 键必填**（缺任一视同无记录） | **闭合**（不依赖 YAML 库；`gap_reason` 为条件第 8 键，只查在场不拒额外键） |
| c | 缺 `model_id` 字段（跨次不可比） | D4 加第 7 字段 `model_id`；V10b 要求实填、V11 要求跨次一致 | **闭合** |
| d | D1「配置缺失」两处口径互斥 | 改 **fail-closed**（缺配置 ⇒ 停手补配置，不派发）；边界 = 派发前静态检查（`plan-models-check.sh`）vs 运行期 spawn 失败（fallback 重 claim） | **闭合**（无灰色地带） |
| e | P4↔P3 依赖未声明 | 批序约束「P3 先于 P4；P1/P2 可并批；P5 最后」+ 行号以批前快照为准 | **闭合** |

**oracle 的 NIT 处置**：
- NIT1（审稿报告声称已同步 v2 但无 v2 段）⇒ **本条即修复**。
- NIT2（V10c 豁免未要求正面处理失败集分类）⇒ **已修**：V10c 现要求豁免理由含「该 topic 失败集的全不可修复分类」。
- NIT3（improvement 的 AC10/AC11 与批序描述已漂移）⇒ **交 planner 同步**（见下）。
- NIT4（批序措辞轻微张力）⇒ **已修**：改为「P3 必须先于 P4；P1/P2 可并批；P5 最后」。

**未采纳的替代方案**（oracle 已确认更差）：V10 走「历史 topic 一次性豁免」（会架空 D4 量化规则，正是 critic 第 1 轮 BLOCKER 1 刚堵的恒绿通道）；D4 用 bullet 形状（正则更脆）；D1 保留「回落查 models」作 warn-only（单一真源在最需要它的场景失效）；V11 保留 ≥10% gate 并改多样本（单样本 + 19% 自量测开销下属伪精度）。

**遗留（交后续角色）**：planner 同步 improvement/proposal 的 AC 映射（AC10→V10a/b/c、AC11→观察项）与批序；ADR 元数据的 AC 映射字段待 planner 回填后更新。

## 6. v3 定向修订（2026-11-27，V10c 实施触发）

**触发源**：实施到 V10c 时，`build-worker-design` 在 `--phase final` 下报 `settlement_missing`，但其实测失败集含**可修复码** `synth_brief_no_ruling_set`（判据生效前既有）⇒ v2 的豁免条款（要求「全不可修复」）不成立。同时实测 **`cancel` 硬拒已 done 节点**（`scripts/plan-topic-check.ts:661-664`，报错文案 `禁止「完成后取消」`）⇒ 「撤销合成」收口在机制上不可达。凭据：`.rddf/improvements/plan-collaboration-hardening.md` 的 `feedback-20261127-002/003`。

**审级**：
- **oracle 1 轮（治理面，只审 delta）** ⇒ **PASS-WITH-NOTES**（6 条 notes，全部闭合，见下表）。
- **critic 第 3 轮**（该 ADR 预算 2/2 用尽 ⇒ **经用户显式批准**后执行）⇒ **APPROVE_WITH_CONDITIONS**，`mergeable: yes`、`scope_exceeded: false`，**0 BLOCKER**；2 条 SHOULD_FIX 已修（见下）。
- （补记 v2 的审级）v2 修订只过 oracle 1 轮（APPROVE），**未跑 critic** —— 当时 critic 预算已用尽，属预算约束下的**单审修订**。

**oracle notes 闭合**：

| # | note | 闭合 |
|---|---|---|
| ① | `plan-topics-topic-model.md` §4 结算门段与 ADR v3 漂移（V12 自锁） | 已同步 grandfather 例外句 |
| ② | 「最后一次」取法含糊；「无已闭合 attempt」未规定 | 改 `max(finished_at)` + **无 attempt ⇒ 不适用**（fail-closed） |
| ③ | `gap_reason` 纯子串判对未来 `synth_foo`/`synth_foo_bar` 型码脆弱 | 钉为 `/synth_[a-z_]+/g` 抽码成集合，判「可修复码 ∪ 未分类码 ⊆ 集合」 |
| ④ | 混合失败集（可修复 + 未分类码并存）规则缺失 | V8(f) 写明两类码都要 ⊆，并补「无已闭合 attempt ⇒ blocking」负向 |
| ⑤ | 豁免面随判据扩容自动扩大、`note` 不参与机判 | 记入风险 5 |
| ⑥ | 结算记录可反复改写且无留痕 | 记入 §已知不可机判 |

**critic SHOULD_FIX 闭合**：

| # | finding | 闭合 |
|---|---|---|
| ① | D4 触发表 (b) 行是可被单独摘抄进代码的形态，未带 grandfather 指针 ⇒ 孤立转写会得到对 `build-worker-design` 仍阻断的门 | (b) 行加「（grandfather 适用时除外，见下段）」，V8(b) 同步指向 (f) |
| ② | 元数据行混入审稿轮次与预算叙述（过程日志进决策文档 + 元数据头膨胀），与父篇 `ADR-plan-multi-session-collaboration.md:7` 的既有约定不一致 | 元数据 `审稿` 行改为指针；v2/v3 行的轮次与预算句移出（即本节）；保留触发源与改动清单 |

**关于「v2 已否决『历史 topic 一次性豁免』」的区分**（本修订的自证）：v2 否决的是让**示范 topic**（`v7-probe`）跳过重做 —— 该路由 V10b 明令禁止，且 `v7-probe` 的答案 `m4` 闭合于生效日当天 ⇒ 按「严格早于」本规则对其**不适用**。v3 的 grandfather 只覆盖**判据生效前闭合、且不属本变更示范集**的历史 topic，且不豁免「记录在场 / 失败码照抄 / 逐码理由」三项。

**遗留（交 builder / verifier）**：实现面（`SETTLEMENT_CRITERIA_SINCE` 常量 + `assertSettlement` grandfather 分支 + V8(f) 四负向 + 边界日 `2026-11-26T23:59:59Z` vs `2026-11-27T00:00:00Z` 判别力用例）尚未落地；`build-worker-design` 的结算记录须在实现后补写（V10c）。
