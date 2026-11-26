# 交接简报：合成外置 ADR（交 architect）

> **写者**：build 主会话（builder）｜**日期**：2026-11-26｜**分支** `scenario/build-worker-design`
> **收件**：**architect**（本简报是输入，不是决策；ADR 与 `docs/adr/**`、`docs/architecture/**` 的改动属 architect 写集）
> **输入材料**：
> - 方案稿 `.rddf/reviews/plan-synthesis-offload-proposal.md`（含 §2.1 上游语义依赖、§3 模型阶梯、§6 S1–S8 判据）
> - A/B 裁决记录 `.rddf/reviews/plan-synthesis-offload-ab-verdict.md`（C 档实测 + S1–S7 结果 + S2/S3 探针规格）
> - 场景验收 `.rddf/reviews/build-worker-design-scenario-verify.md`（11 条既有机制缺陷 + 上下文成本实测）
> - 场景产物 `.rddf/plan-topics/build-worker-design/`（7 内容节点 + 合成节点 `m1` + 父的 golden `SYNTHESIS.md`）

---

## 0. 一页速览（决策面）

**要决的事**：`plan` 侧多节点协作的**合成（合并）步骤**是否从「根会话自己做」改为「由一个合成节点（子会话）做」。

**已实测的结论**（不必再论证，直接写进 ADR）：

| 主张 | 实测结果 |
|---|---|
| **合成节点不需要新 agent** | ✅ 上游 `subagent` 支持每次派发覆盖模型（语义 `override ?? agent.model ?? parent.model`）⇒ 零新 agent / 零新 prompt / 零配置 / 零守卫 / 零回滚字节钉死 |
| **checker 零改动** | ✅ `lib/plan-topics.ts` 与 `scripts/plan-topic-check.ts` 一行未改；deps 门控、`claim`/`close`、fence、`converged`、`scope-check`、`deliverableOk` 全部现成 |
| **治理面零改动** | ✅ 父的写面不变 ⇒ 父的合成产物落在合成节点自己的 `nodes/m1/RESULT.md` ⇒ **ADR 残留 #19 反而被闭合**（不需要在 D1 单一写者表新增一行） |
| **根的上下文收益** | ✅ 根的材料吸收 244,703 B → **27,112 B（-89%）**；合并工作整体移入一个 **132,909 tokens** 的隔离会话 |
| **C 档（弱模型）质量** | ⚠️ **部分达标**：结论一致性 5/5 ✅、裁决覆盖 **31/31** ✅（优于 golden 的 17 合并口径）、缺陷覆盖 **17/18**，但**丢了 n3 明确标为「最重」的一条**（`git merge` 绕开 commit-gate）⇒ **S1 判 FAIL ⇒ 升 A 档** |

---

## 1. ADR 需要落的决策（建议 D 编号）

| D | 决策点 | 建议口径 | 依据 |
|---|---|---|---|
| **D1** | **合成进入 DAG**：合成是 `graph.json` 里的一个**普通 node**（`deps` = 全部内容节点），父照常 `claim`/`dispatch`；**不新增 agent、不新增通道、不新增 checker 判据** | 采纳 | 方案稿 §1（7 项机制逐条现成）+ §4（逐项「不改」表）；实测 `ready` 自动列出 `m1`、`converged` 自动纳入 |
| **D2** | **合成产物落点** = 合成节点自己的 `nodes/m1/RESULT.md`（**不另设 `SYNTHESIS.md`、不写 `.rddf/plans/**`**） | 采纳 | 保持「讨论稿 ≠ 可执行计划」（`.rddf/plan-topics/**` 不在 `PLAN_REF_ROOTS`）⇒ **ADR 残留 #19 闭合** |
| **D3** | **模型策略** = 三档阶梯 C→A→B，**默认 A 档**（派发覆盖强模型） | 待决 | C 档实测 FAIL（丢 1 条最重）；A 档零 paperwork。⚠ **A 档需一次工具纪律裁决**（见 §3.3） |
| **D4** | **BRIEF 的「结论层」硬判据**：合成 BRIEF 必须显式要求「**被上游节点标为『最重 / 必须上报 / 薄弱点』的发现必须进结论层（反哺清单），不得只作依据引用**」 | 采纳 | C 档实测的**唯一实质失效**：`nodes/n3/RESULT.md:302` 的「薄弱点 1（最重）：`git merge` 绕开 commit-gate」在 merger §4 中匹配数 = 0 |
| **D5** | **合成节点的判据层**：沿用既有两维（阶段 × 严重度）+ `converged`（D11 口径，**调度信号非交付信号**）；**不扩退出码、不加违规码** | 采纳 | 方案稿 §4.4 逐项确认；实测 `final check` exit 0、七桶全清 |

---

## 2. 三件积压（用户要求「一并写准」）

### 2.1 R9 补登 —— 「钉住缺陷」测试缺 owner 与退出条件

**现状**：全仓零命中（唯一落点是 `tests/plan-topics-dag.test.ts` 的 4 个用例名）。`tests/plan-topics-dag.test.ts:374`、`:385`、`:395`、`:406`。

**为什么现在必须补**：**merger 独立发现了它**（A/B 裁决记录 §2.2 第 14 项）⇒ 它是可发现的，只是没人发现 ⇒ 证明「无落点」本身就是缺陷。

**建议措辞**（进 ADR 残留章）：

> N. **「钉住缺陷」测试缺 owner 与退出条件**：`tests/plan-topics-dag.test.ts` 有 4 个用例名直接写「（钉住缺陷）」（`:374`/`:385`/`:395`/`:406`）。这是**好实践**（把已知边界变成回归锚点），但缺陷无 id、无触发条件、无退出条件 ⇒ 读者只能从用例名猜严重度，且**修好后无人会删「钉住」措辞**。⇒ 每个「已知边界」用例须带三件：`// DEFECT: <code> since=<date>` / 触发条件一行 / 退出条件一行（「当 X 码上线后本用例改为正向断言」）；并把该缺陷登记进判据输出的 `summary.known_gaps[]`（使判据输出能自报「我现在有哪些判据是缺的」）。

### 2.2 上游语义验证基线刷新

**现状**：ADR `ADR-plan-multi-session-collaboration.md:14` 记录的上游验证基线是安装版 `v0.0.0-local-202611110721`；**本机当前安装 `v0.0.0-local-202611241340`**（已过 13 天）。

**判定**：锚点脚本本次实跑 **30/30 全绿** ⇒ **语义仍成立**，但**基线版本号已陈旧** ⇒ 建议在 ADR 的「前置事实」处加一行刷新说明（不必改既有 ①–⑪ 的语义表述）。

### 2.3 架构文档 §10「合成产物无位置」条改写

**现状**（`docs/architecture/plan-topics-topic-model.md` §10 末条）：「**topic 树内没有留给「父的合成产物」的位置**……父若把 N 个节点的合并产物放出来，唯一去处是 `.rddf/plans/<slug>.md` ⇒ **改变其语义**（从「离线讨论产物」变成「正式件」⇒ 进 `PLAN_REF_ROOTS` ⇒ 可被派工程），与本机制「讨论稿 ≠ 可执行计划」的定位冲突（`build-worker-design` 场景已在 topic 树内用父写的 `SYNTHESIS.md` 实例化，但该位置**未入** §1 表）⇒ 处置见 ADR 残留 #19」。

**建议改写为**：

> - **合成产物的位置 = 合成节点自己的 `RESULT.md`**：当 topic 需要一个跨节点的合并产物时，**在 `graph.json` 里加一个 `deps` = 全部内容节点的合成节点**（惯例 id `m*`），由子会话产出 `nodes/<m-id>/RESULT.md` ⇒ 父的写面**不变**（单一写者表无需新增一行），合成稿**仍在 topic 树内** ⇒ 仍不进 `PLAN_REF_ROOTS` ⇒ 「讨论稿 ≠ 可执行计划」的性质保持。父可读该文件作为 topic 级合成稿（成本 ≈ 合成稿体积，非全部子产出体积）。
>   处置见 ADR 残留 #19（闭合）。

⚠ **同时**：`build-worker-design` 场景里父手写的 `SYNTHESIS.md` 是**该建议的第一个实例**，但按新口径**它不是必需的**（`nodes/m1/RESULT.md` 即合成产物）⇒ 场景里那份可保留为「父手写基线（golden standard）」，但**不应**写进 §1 单一写者表。

---

## 3. 本轮实测产生的新增项（需 architect 一并处置）

### 3.1 新增上游语义锚点 P7（**若采纳 A 档则必做**）

本方案引入一条上游依赖：**`subagent` 的 `model` 入参是一次性覆盖，优先于 agent 配置的模型**。

⇒ 须在 `scripts/check-upstream-anchors.sh` 补一条**语义 token 锚点**（照 P1–P6 / P5b 体例：**只写语义，不写行号、不钉函数名**）：

```
check "P7 subagent 每次派发可覆盖模型" "packages/core/src/tool/plugin/subagent.ts" \
  'const model = override \?\? agent\.model \?\? parent\.model'
```

⚠ **行号不是契约**：同一语义在本仓 canonical 源码根（`/workspace/main/opencode`，`check-upstream-anchors.sh:26` 的默认 `SRC`）是 `:171`，在 `v2.2.5` tag 上是 `:190` ⇒ **漂移 19 行** ⇒ 锚点必须钉语义。
⚠ 任何文档引用也必须给「语义 + 源码根 + 版本」，不得把行号写进契约（**P5 锚点假红事故的同型**）。

### 3.2 A 档的工具纪律裁决（**需要用户拍板**）

`subagent` 工具的参数说明写着：**「NEVER set this unless the user explicitly asks for a particular model or variant」**。

⇒ 用 `model` 覆盖作为**机制的一部分**，与该说明存在字面张力。三条出路：

| 方案 | 内容 | 代价 |
|---|---|---|
| **A1**（**推荐**） | 裁决「机制性覆盖**算**『用户明确要求』」—— 理由：机制会写进 `prompts/plan.md`，父是**被指示**设置 ⇒ 不违反该说明的立法意图（它防的是「随手乱设模型」） | 零；需在 `prompts/plan.md` 写明该覆盖是机制的一部分（否则下一个人当成随手用） |
| A2 | 把覆盖**收窄到合成节点**（仅 BRIEF 显式要求时） | 略增 prompt 复杂度 |
| A3 | 走 B 档（新增 `plan-merger` agent，模型写在 agent 配置里） | 一条 ADR + 双审 + 新 prompt + 守卫 + 文档投影 + 回滚字节钉死 |

⇒ **建议 A1**；若 architect 判 A1 不可 ⇒ 直接 A3（成本已知，不必再论证）。

### 3.3 合成 BRIEF 必须携带的「结论层」硬判据

C 档实测的唯一实质失效（详见 §1 的 D4）。建议在 BRIEF 模板里固化为一条：

> **凡被上游节点显式标为「最重 / 必须上报 / 薄弱点 / 缺陷」的发现，必须进你的 §结论层（反哺清单），不得只作依据引用。**

⇒ 这条同时是**对所有合成类 BRIEF 的通用纪律**，不限于本方案。

---

## 4. ADR 的 Verification 章建议携带的判据（已实测）

| # | 判据 | 结果 |
|---|---|---|
| V1 | 合成节点在 `graph.json` 中以 `deps` = 全部内容节点存在；`ready` 自动列出；`converged` 自动纳入 | ✅ 实测 |
| V2 | `lib/plan-topics.ts` 与 `scripts/plan-topic-check.ts` **零改动** | ✅ 实测 |
| V3 | 合成产物落在 `nodes/<m-id>/RESULT.md`；父的写面不变；不进 `PLAN_REF_ROOTS` | ✅ 实测 |
| V4 | 合成质量 A/B（vs 父手写 golden）：① 结论一致性 ② 缺陷清单覆盖 ③ 裁决项覆盖；**且「上游标为最重的发现必须进结论层」** | ⚠️ C 档 **FAIL**（丢 1 条）；A 档**待测** |
| V5 | 根的**材料吸收量** = 合成稿体积（非全部子产出体积） | ✅ 实测（244,703 B → 27,112 B，**-89%**） |
| V6 | 隔离会话的最终上下文 ≤ 某阈值 | ✅ 实测（**132,909 tokens**） |
| V7 | 零治理面漂移（`docs/adr/**`、`docs/architecture/**`、`prompts/**`、`opencode.jsonc*`、`tests/`、`.rddf/rollback/**` 均不动） | ✅ 实测（**按提交限定范围**，见下） |
| V8 | 零回滚工作量（机制面 0 改动 ⇒ 无需新增 `.rddf/rollback/` 条目） | ✅ 实测 |

⚠ **V7 的判据口径**：「本次改动」必须**按提交限定**（如 `git diff --name-only <base>..HEAD` 且 base 取**本次的起始提交**），**不能**用含他人提交的分支区间 —— 否则会把 architect 的登记提交误判为漂移。

⚠ **V4 的 A/B 基线**：「父手写 golden」只对**「7 份 RESULT 所含内容」公平** —— golden 写于父发现「锁释放 `rmdir` 不可执行」**之前** ⇒ 该条不在 merger 的输入里 ⇒ 不算 merger 的漏项。⇒ **任何后续 A/B 必须先冻结基线的产出时刻**。

---

## 5. 尚未实测的（诚实登记，**不得写成已通过**）

| 项 | 为什么本轮不可测 | 探针规格在哪 |
|---|---|---|
| **S2** 根 per-topic 上下文降幅 | 本会话的根**已吸收过全部 7 份 RESULT**（244 KB）⇒ 增量不可归因 | A/B 裁决记录 §5.3（**须在新根会话跑**） |
| **S3** 根不读子 RESULT 全文 | 同上 | 同上 |
| **A 档**（派发覆盖模型）的质量 | A 档未跑 | D3 裁决后，用同一 BRIEF + 同一 golden 重跑 A/B |
| **跨 topic 合成** | 本方案明确不做 | — |
| **超大 topic（N\* 之上）** | 机制不解决 | 方案稿 §7 M1（**不可缓解**，须在 ADR 明写） |

---

## 6. 给用户的三项裁决（architect 无法单方面定）

| # | 事项 | 选项 |
|---|---|---|
| **U1** | **A 档的工具纪律**（模型覆盖是否算「用户明确要求」） | A1（裁决为算，推荐）/ A2（收窄到合成节点）/ A3（放弃 A 档，走新 agent） |
| **U2** | **合成节点的默认档位** | 直接默认 A 档 / 先跑 A 档 A/B 再定 / 一律 A 档 + B 档兜底 |
| **U3** | **本方案是否升为正式机制**（进 ADR 并改 `prompts/plan.md`） | 采纳 / 先只落「BRIEF 结论层硬判据」（D4，最小、零风险）/ 暂缓 |

⇒ **architect 的 ADR 应把 U1–U3 的裁决结果写进「决策」章**，而不是留成开放问题。

---

## 7. architect 侧的具体改动清单（照此执行即可）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `docs/adr/ADR-plan-synthesis-offload.md`（**新建**） | 本简报 §1 的 D1–D5 + §4 的 V1–V8 + §5 的未实测项 + §6 的 U1–U3 裁决结果 |
| 2 | `docs/adr/ADR-plan-multi-session-collaboration.md` | 残留章：**新增 #19 的闭合标注**（合成产物位置已由新 ADR 给出 ⇒ #19 闭合）+ **补登 R9**（见 §2.1 措辞）+ 刷新 §「前置事实」的上游基线版本（§2.2） |
| 3 | `docs/architecture/plan-topics-topic-model.md` | §10 末条改写（§2.3 措辞）+ §11 代码地图补「合成节点」说明 |
| 4 | `scripts/check-upstream-anchors.sh` | **仅当采纳 A 档**：新增 P7 语义锚点（§3.1 措辞） |
| 5 | `prompts/plan.md` | **仅当采纳本机制**：加「合成节点」一节（父怎么加节点、怎么派、怎么读合成稿）+ 落 D4 的「结论层硬判据」+ **仅当 A 档**：写明模型覆盖是机制的一部分（§3.2 A1） |

⚠ 第 4、5 项会改 `prompts/**` 与 `scripts/**` ⇒ 属**治理面** ⇒ 按 `prompts/build.md` 的治理面纪律走 **oracle → critic** 双审。

---

## 8. 复现

```bash
git checkout scenario/build-worker-design
T=.rddf/plan-topics/build-worker-design
# 合成节点与产物
python3 -c "import json;g=json.load(open('$T/graph.json'));print([n['id'] for n in g['nodes']])"
head -40 $T/nodes/m1/RESULT.md
# A/B 判据
python3 /tmp/opencode/bwd-scenario/ab-judge.py $T/SYNTHESIS.md $T/nodes/m1/RESULT.md
# 机制状态（done=8 / converged=true）
bun scripts/plan-topic-check.ts check $T --json
```

**基线**：`bun test tests/` = **1232 pass / 0 fail / 70s**；`scripts/check-upstream-anchors.sh` = **30/30 OK**。
