# 方案稿：合成外置（merger 节点）与上下文成本治理

> **性质**：**方案稿（讨论稿级）**，不是 ADR、不是 change、不是实现。
> **写者**：build 主会话（父 / root-plan，session `ses_de8f57a3cffezCAvlmyBDCFShr`）
> **日期**：2026-11-26｜**依据**：`.rddf/plan-topics/build-worker-design/` 场景实测（提交 `097ce4b`）+ `.rddf/reviews/build-worker-design-scenario-verify.md`
> **落点说明**：本稿写在 `.rddf/reviews/`（builder 写集）。若被采纳，须由 **architect** 消费（进 ADR 或 openspec change）—— **本稿不自行修改任何治理面文件**。
> **输入数据**（全部来自真实跑，不是估计）：子产出 244,703 bytes / 2,241 行（7 节点）；根合成读入 **+64,941 tokens**；根全 topic 增量 **+114,842 tokens**；父手写合成稿 **23,649 bytes / 179 行**；**无 compaction**。

---

## 0. 结论速览（一屏）

| 项 | 结论 |
|---|---|
| **形态** | **merger 是 `graph.json` 里的一个普通 node**（`deps` = 全部内容节点），父照常 `claim` + `dispatch` |
| **合成产物落点** | **merger 节点自己的 `nodes/m1/RESULT.md`** ⇒ **不新增任何文件、不新增任何写者、不新增任何判据** |
| **模型** | **每次派发覆盖**（上游 `subagent` 支持，`override ?? agent.model ?? parent.model`）⇒ **零新 agent、零新 prompt、零配置改动、零守卫改动、零回滚字节钉死** |
| **治理面改动** | **零** —— 单一写者表不变；**ADR 残留 #19（父的合成产物无位置）由本方案闭合** |
| **代码改动** | **零** —— `lib/plan-topics.ts` 与 `scripts/plan-topic-check.ts` **都不动** |
| **根上下文成本** | **-51%**（114,842 → 56,174 tokens/topic）；若根不读合成稿则 -57% |
| **断裂点** | **不变**（merger 自身 N\* ≈ 16–32）⇒ 收益的准确表述是「**保住根会话的清醒**」，**不是**「让规模无上限」 |
| **落地成本** | 一个节点 + 一份 BRIEF + 一次派发。**零代码、零配置、零守卫、零回滚清单** |

---

## 1. 核心洞察：merger 需要的一切机制，`graph.json` 已经有了

这是本方案成立的**全部理由** —— 不需要新造任何东西：

| merger 的需求 | 既有机制（**全部现成**） | 依据 |
|---|---|---|
| 「等所有内容节点做完再合成」 | `deps` 门控 ⇒ `deriveStatus` 的 `depsDone` | `lib/plan-topics.ts:435-440` |
| 「合成节点本身也要被跟踪」 | `claim` / `close` / `attempts[]` / `in_flight` | `scripts/plan-topic-check.ts:418-522` |
| 「内容节点变了要能发现」 | fence = 节点级输入投影 ⇒ `stale_inputs` | `lib/plan-topics.ts:678-699` |
| 「合成节点完成后 topic 才算完」 | `converged` 把所有节点纳入 | `lib/plan-topics.ts:871-906` |
| 「merger 只能写自己的目录」 | `scope-check` 的 `allowedPrefix = nodes/m1/` | `scripts/plan-topic-check.ts:233-240` |
| 「merger 的交付物能被判据判」 | `deliverables: ["nodes/m1/RESULT.md"]`（**在 topic 树内** ⇒ 不撞 `deliverableOk` 的防逃逸） | `lib/plan-topics.ts:393-405` |
| 「合成稿算不算实质正文」 | `isNonEmptyResult` 剥标题/哨兵/fenced 后有正文即算 | `lib/plan-topics.ts:360-369` |

⇒ **新增的东西只有两个：一个 graph 节点 + 一份 BRIEF。**

---

## 2. 为什么**不需要**新 agent（连带不需要新 prompt / 配置 / 守卫 / 回滚清单）

> 这一节是对我前几轮建议的**修正**。此前我提过 `plan-merger`（新 agent）与「把 `plan-worker` 换成强模型」两个选项 —— **两者都不必要**。

| 常见顾虑 | 为什么不成立 |
|---|---|
| 「merger 要更强的模型 ⇒ 得有个新 agent」 | 上游 `subagent` 的**新建**路径是 `const model = override ?? agent.model ?? parent.model` ⇒ **每次派发可覆盖模型**，且**优先于 agent 配置** ⇒ `plan-worker` 直接用强模型跑即可，**不需要新 agent id**。⚠ **行号不是契约**：该语句在本仓 canonical 源码根（`/workspace/main/opencode`，`scripts/check-upstream-anchors.sh:26` 的默认 `SRC`）的 `packages/core/src/tool/plugin/subagent.ts:171`；同一语义在 `v2.2.5` tag 上是 `:190` ⇒ **漂移 19 行** ⇒ 引用必须带**语义 + 源码根 + 版本**，不得把行号当契约（见 §2.1） |
| 「新增 agent 要走新增文件闸门 / 守卫 / 文档投影 / 回滚字节钉死」 | **全部不触发** —— 没有新 agent ⇒ 没有新 prompt 文件 ⇒ `EXPECTED.prompts` 不变、`GUARDED_AGENTS` 不变、AC4 的 `{build, plan}` 闭集不变、`docs/MULTI-AGENT-DESIGN.md` 计数不变（12）、`.rddf/rollback/plan-topics.json` 的逐字节 `find` 串不变 |
| 「`owner` 字段既然要动，不如顺便修 R1」 | 本方案**给 R1 提供了第一个真实用途**，但**不自动闭合它** —— R1 的处置仍是「实现 or 删除」二选一（见 §9） |
| 「merger 的产物是 topic 级产物，不能放 node 里」 | **放得下**。`nodes/m1/RESULT.md` 与其它 RESULT.md 同形；topic 级语义由「node id 约定（`m*`）+ `TOPIC.md` 记一行」承载，**不需要新的写者面** ⇒ 单一写者表不变 ⇒ **ADR 残留 #19 反而被闭合** |

---

## 2.1 ⚠ 本方案对**上游语义**的依赖（必须按 P5 纪律处理）

本方案的 A 档（派发覆盖模型）**依赖一条上游语义**：

> **`subagent` 工具的 `model` 入参是一次性覆盖，优先于 agent 配置的模型。**

**上游证据**（语义稳定，行号不稳定）：

| 源码根 | 版本标识 | 语义所在行 | 语义所在行（`v2.2.5` 对照） |
|---|---|---|---|
| `/workspace/main/opencode`（本仓 canonical，`check-upstream-anchors.sh:26` 默认 `SRC`） | `process-daemon-v0.6.0-524-g9cd59d91e3` | `:171` | `:190`（**漂移 19 行**） |
| `/tmp/opencode/opencode-v2.2.5` | `v2.2.5` | `:190` | — |

三条语义在**两个 checkout 上都成立**（`override ?? agent.model ?? parent.model` 与其上方的注释「an explicit model wins over the agent's configured model, which wins over the inherited one」）⇒ **语义是版本稳定的，行号不是**。

⇒ **若本方案被采纳，必须做两件事**：

1. **补一条语义锚点**进 `scripts/check-upstream-anchors.sh`（照 P1–P6 / P5b 的体例：**只写语义 token，不写行号、不钉函数名**）：
   ```
   check "P7 subagent 每次派发可覆盖模型" "packages/core/src/tool/plugin/subagent.ts" \
     'const model = override \?\? agent\.model \?\? parent\.model'
   ```
   ⇒ 否则上游一改，本方案的 A 档**静默失效**（与 plan-topics 既有机制依赖上游语义的同款风险）。
2. **不把行号写进任何契约**（本稿 §2 的引用即示范：给语义 + 源码根 + 版本，并显式标注漂移）。

⚠ **版本漂移登记**：ADR `ADR-plan-multi-session-collaboration.md:14` 记录的上游语义验证基线是安装版 `v0.0.0-local-202611110721`；**本机当前安装的是 `v0.0.0-local-202611241340`** ⇒ 已过 13 天。锚点脚本本次实跑 **30/30 全绿** ⇒ **语义仍成立**，但 ADR 里记录的版本号已陈旧 ⇒ 建议 architect 顺带刷新该基线。

---


## 3. 模型策略：三档阶梯（先便宜后贵）

| 档 | 做法 | 成本 | 约束 / 风险 |
|---|---|---|---|
| **C**（**先试**） | 直接用现有 `plan-worker`（弱模型 `deepseek-v4.1-flash`）做合并 | **零** | 合并是**质量最敏感环节**（n4 结论）⇒ 质量存疑 |
| **A**（次） | `subagent(agent="plan-worker", model="<强模型>")` | **零 paperwork** | ⚠ 与 `subagent` 工具说明「**NEVER set this unless the user explicitly asks for a particular model**」相抵 ⇒ 需一次显式裁决：**机制性覆盖算不算「用户明确要求」**（可辩：本机制会写进 `prompts/plan.md`，父是**被指示**设置 ⇒ 算） |
| **B**（兜底） | 新增 `plan-merger` agent（强模型写在 agent 配置里） | 一条 ADR + 双审 + 新 prompt + 守卫 + 文档投影 + 回滚字节钉死 | 无工具纪律冲突 |

⇒ **推荐顺序：C → A → B**，理由：**我们已经有 golden standard** —— 父手写的合成稿（23,649 bytes / 179 行）就是「根自己做」的基线 ⇒ C 的质量可以被直接 A/B 判据化，**不必靠猜**。

⚠ C 的一个已知风险：merger 的输出是**收敛**产物（23 KB）而非拼接（245 KB）⇒ 弱模型在长上下文上做聚合时**可能丢细节**。⇒ 判据必须覆盖「缺陷清单覆盖率」而不只是「结论一致性」。

---

## 4. 机制接线（逐项）

### 4.1 `graph.json`：加一个节点（**唯一的结构改动**）

```jsonc
{
  "id": "m1",                          // ← 命名约定：m* = 合成节点
  "title": "合成稿",
  "deps": ["n1","n2","n3","n4","n5","n6","n7"],   // ← 全部内容节点
  "owner": "child",                    // ← 由子会话做
  "status": "pending", "progress": "todo",
  "attempts": [],
  "deliverables": ["nodes/m1/RESULT.md"]
}
```

⇒ 父的 `ready` **自动**在内容节点全 `done` 后才列出 `m1` ⇒ **零新增调度逻辑**。
⇒ 父照常 `claim m1` → `subagent(agent="plan-worker", prompt="做 topic X 的 node m1")` → `close m1` → `check`。

### 4.2 `nodes/m1/BRIEF.md`：唯一的新增内容（形状复用本次场景已验证的 BRIEF）

```markdown
# BRIEF — m1：合成稿

## 目标
把 topic `<topic>` 各内容节点（deps 所列）的 RESULT.md **收敛**成**一份** topic 级合成稿。

## 边界
- 只读 deps 所列节点的 `nodes/<id>/RESULT.md`；
- **不写** 其它 node 的目录（含 deps 节点的 RESULT.md —— 只读不写）；
- 不改 `graph.json` / `TOPIC.md` / 任何 `BRIEF.md`；
- **不写** `.rddf/plans/**`（合成稿是讨论稿，不是正式件 —— 见 ADR 残留 #19 的口径）。

## 期望交付
`nodes/m1/RESULT.md`，含且仅含以下五节：
1. **结论**（一句话可判定的布尔/单句结论）
2. **各节点结论的合并**（每条注明它来自哪个 node 的哪一节）
3. **父的裁决汇总**（逐条列出「待裁决项 → 裁决」）
4. **反哺清单**（现象 | 依据 path:line | 建议动作）
5. **本 topic 不声称的东西**（诚实口径）

## 验收口径
- 每条结论可回指到某个 RESULT.md 的**行号**（`nodes/<id>/RESULT.md:<line>`）；
- 裁决项**逐条**覆盖，不得遗漏（对照各 RESULT 的「待父裁决」节）；
- 反哺清单每条落到「现象 + 依据 path:line」，不得写成泛泛建议；
- 正文 ≥ 100 行；末行写 `## STATUS: COMPLETE`。
```

⇒ **这份 BRIEF 的形状不是新发明** —— 它就是本次场景 7 份 BRIEF 的同款四段结构（目标/边界/期望交付/验收口径）⇒ **顺带充当「BRIEF 形状门」（oracle 建议 2）的第一个夹具**。

### 4.3 父的收尾动作：**读（或不读）`nodes/m1/RESULT.md`**

| 父的选择 | 根上下文成本 | 质量保障 |
|---|---|---|
| **读合成稿**（推荐） | **+6,273 tokens**（23,649 B） | ✅ 父掌握结论与裁决，可直接转交 architect |
| 不读（只信子摘要） | ≈ 0 | ❌ 父无法对合成质量负责 ⇒ 违反「派生而非自述」的同款纪律 |
| **读全部 7 份 RESULT**（现状） | +64,941 tokens | ✅ 但代价 10 倍 |

⇒ **推荐第一种**。

### 4.4 checker 侧：**零改动**（逐项确认）

| 检查项 | 是否需改 | 说明 |
|---|---|---|
| `deriveProgress` / `deriveStatus` | ❌ 不改 | m1 走完全相同的派生路径 |
| `dispatchableNodes` / `ready` | ❌ 不改 | deps 门控自动生效 |
| `claim` / `close` | ❌ 不改 | m1 与其它节点同形 |
| `scope-check` | ❌ 不改 | `allowedPrefix = nodes/m1/` 天然正确 |
| `deliverableOk` | ❌ 不改 | `nodes/m1/RESULT.md` 在树内 |
| `isNonEmptyResult` | ❌ 不改 | 合成稿剥标题/哨兵后有正文 |
| `stale_inputs`（fence） | ❌ 不改 | **且应当触发** —— 父在 `claim m1` 之后新增内容节点 ⇒ m1 的 deps 投影变了 ⇒ 报 `stale_inputs` ⇒ 提醒父「合成范围变了」⇒ **这是正确行为，不是误报** |
| `converged` / 七桶 | ❌ 不改 | m1 自动纳入 |
| 违规码闭集（20 个） | ❌ 不改 | 无新码 |
| 退出码四值 | ❌ 不改 | 无新码 |

⇒ **`lib/plan-topics.ts` 与 `scripts/plan-topic-check.ts` 零改动。**

---

## 5. 上下文成本（量化，全部来自实测）

| 方案 | 根读入量 | 根 per-topic 增量 | 相对现状 |
|---|---|---|---|
| **现状**（根读全部 7 份 RESULT） | 244,703 B | **114,842** | — |
| **合成外置 + 根读合成稿**（推荐） | 23,649 B | **56,174**（114,842 − 64,941 + 6,273） | **-51%** |
| 合成外置 + 根不读 | 0 B | 49,901 | -57% |
| **merger 自身** | 读 244,703 B | — | **断裂点不变：N\* ≈ 16–32** |

**单位成本**：0.265 tokens/byte ⇒ **每节点 ≈ 9,277 tokens**；外推 N=15 → 139k｜**N=20 → 186k**｜N=30 → 278k。

⇒ **决策触发条件**（可机判）：`根的可用合成预算 ÷ 9,277 = N\*`。**N\* ≤ 当前预期节点数** ⇒ 上合成外置。

⚠ **诚实口径**：合成是**收敛**（输出 23 KB ≪ 输入 245 KB）⇒ 「合成外置」解决的是「根的上下文」，**不解决「单个 merger 装不下超大 topic」**。N\* ≈ 16–32 是硬上限。

---

## 6. 验收判据（可机判）

| # | 判据 | 怎么判 |
|---|---|---|
| **S1** | **A/B 质量对照** | 同 topic 下，merger 产出的 `nodes/m1/RESULT.md` vs 父手写的 `SYNTHESIS.md`（golden standard）⇒ 三项不劣：① 结论一致性 ② **缺陷清单覆盖率**（merger 至少覆盖父的 11 条中的 10 条）③ **裁决项覆盖率**（父的 17 条裁决，merger 至少覆盖 15 条） |
| **S2** | **根上下文降幅** | 根 per-topic `tokens_input` 增量 **≤ 60,000**（现状 114,842 ⇒ **-48%**） |
| **S3** | **根不读子 RESULT 全文** | 根会话的 tool 调用里**无** `nodes/<内容节点>/RESULT.md` 的 read（可从 `session_part` 的 `data` 查）⇒ 合成成本**只**来自合成稿 |
| **S4** | **机制未退化** | `converged === true`；`final check` exit 0；七桶全清；`scope-check m1` 只报 `nodes/m1/` 内 |
| **S5** | **fence 正确触发** | 父在 `claim m1` 后新增内容节点 ⇒ `check --phase final` 报 `stale_inputs` 且 detail 指名 `deps` |
| **S6** | **零治理面漂移** | `git diff --name-only` 不含 `docs/adr/**` / `docs/architecture/**` / `prompts/**` / `opencode.jsonc*` / `tests/config-guards.test.ts` / `.rddf/rollback/**` |
| **S7** | **零回滚工作量** | 回滚 = 删 `graph.json` 里的一个节点 + 删一份 BRIEF ⇒ **不需要新增 `.rddf/rollback/` 条目**（数据面非机制面） |
| **S8** | **模型纪律** | 若走 A 档（派发覆盖模型）⇒ `prompts/plan.md` 必须写明该覆盖是**机制的一部分**（否则与工具说明冲突，且下一个人会当成「随手用」） |

---

## 7. 风险与已知边界

| # | 风险 | 严重度 | 缓解 |
|---|---|---|---|
| **M1** | **merger 的断裂点与根相同**（N\* ≈ 16–32） | 高 | **不可缓解**（设计如此）⇒ 必须在机制文档里明写「本机制不解决超大 topic」 |
| **M2** | **弱模型合并丢细节**（C 档） | 中 | 有 golden standard ⇒ S1 可直接判 ⇒ 不合格则升 A 档 |
| **M3** | **父加了内容节点但忘了同步 m1 的 deps** | 中 | **fence 会自动报 `stale_inputs`**（S5）⇒ 机制自带兜底 |
| **M4** | **merger 写了别的 node 的目录** | 中 | 写域前缀语义 ⇒ 权限层只能到 topic 树粒度（既有约束）⇒ 靠 `scope-check` 事后（既有缺陷 R3 未修 ⇒ 假阳性 ⇒ **本方案不依赖 scope-check 做门控**） |
| **M5** | **合成稿被误当正式件派工程** | 低 | 合成稿在 `nodes/m1/` ⇒ **不在** `PLAN_REF_ROOTS` ⇒ 天然不可派 ⇒ 正是 ADR 残留 #19 要保的性质 |
| **M6** | **`m*` 命名约定靠自觉** | 低 | `TOPIC.md` 记一行「合成节点 = m1」；或约定「`deps` 覆盖全部内容节点的节点即合成节点」 |
| **M7** | **机制性模型覆盖与工具说明冲突**（A 档） | 中 | S8 要求显式写进 `prompts/plan.md`；若 architect 判不可 ⇒ 直接走 B 档（代价已知） |

---

## 8. 不做的事（明确排除）

- ❌ **不新增 agent**（`plan-merger` / `plan-manager`）—— 本方案证明不需要
- ❌ **不改** `lib/plan-topics.ts` / `scripts/plan-topic-check.ts` —— 零改动
- ❌ **不改**单一写者表 —— 合成稿落在 node 自己的 RESULT.md ⇒ 父的写面不变 ⇒ **ADR 残留 #19 闭合而非新增条目**
- ❌ **不改** `prompts/plan.md` 的纪律段 —— 只需（若走 A 档）加一句模型覆盖说明
- ❌ **不做跨 topic 合成**
- ❌ **不写** `.rddf/plans/**`
- ❌ **不声称**「本机制解决超大 topic」—— 只声称「保住根会话的清醒」
- ❌ **不修** R1–R9 / B1–B7 —— 本方案**顺带**给 R1 提供了实施对象，但修复是独立决定

---

## 9. 与既有登记项的关系

| 登记项 | 本方案的关系 |
|---|---|
| **ADR 残留 #19**（父的合成产物在 topic 树内无登记位置） | ✅ **闭合**：合成产物有位置了 —— 就是 merger 节点自己的 `nodes/m1/RESULT.md`。**不需要**在 D1 单一写者表里新增一行（父的写面不变） |
| **ADR 残留 #14**（`owner` 字段不消费） | ⚠ **给 R1 提供了第一个真实用途**（内容节点 `owner:"child"` / 合成节点 `owner:"child"` / 父自做节点 `owner:"parent"` ⇒ owner 的两值终于有区分）⇒ 但**处置仍是二选一**：本方案倾向「**实现**」（`ready` 输出 `executor` + `claim` 拒 parent 节点的非父 claim），因为实现后 owner 有了消费者 |
| **ADR 残留 #15**（topic 独占锁零强制 + 释放步骤不可执行） | ❌ 无关（本方案不新增 topic ⇒ 不新增锁） |
| **ADR 残留 #16/#17/#18** | ❌ 无关（`baseline`/`precheck`/`claim→spawn` 三条不受影响） |
| **架构文档 §10 的「合成产物无位置」条** | ✅ **需同步改写**：口径从「无位置」改为「位置 = 合成节点自己的 RESULT.md（见方案稿）」 |
| **`.rddf/reviews/build-worker-design-scenario-verify.md` §3 的 11 条缺陷** | ❌ 本方案**不修**任何一条；只**引用**它们作为「本方案依赖的既有约束」的说明（如 M4 依赖 R3 未修这一事实） |
| **R9（「钉住缺陷测试缺 owner 与退出条件」）** | ❌ 本方案**未登记**它 —— 全仓无落点，**建议 architect 补登**（它属「如何登记缺陷」的元缺陷，独立于本方案） |
| **上游语义锚点（新增 P7）** | ➕ **本方案新增一条上游依赖**（「`subagent` 每次派发可覆盖模型」）⇒ 若采纳，**必须**在 `scripts/check-upstream-anchors.sh` 补一条**语义 token 锚点**（不写行号，见 §2.1）⇒ 否则上游一改即静默失效 |
| **ADR `:14` 记录的上游验证基线** | ⚠ 已陈旧：ADR 记 `v0.0.0-local-202611110721`，**本机当前安装 `v0.0.0-local-202611241340`**（已过 13 天）⇒ 锚点本次实跑 **30/30 全绿** ⇒ **语义仍成立**，但基线版本号需刷新（建议 architect 顺带做） |

---

## 10. 落地步骤（零代码）

| 步 | 动作 | 产物 | 谁做 |
|---|---|---|---|
| 1 | 在 `graph.json` 加 `m1` 节点（`deps` = 全部内容节点）+ 写 `nodes/m1/BRIEF.md` | 2 处数据面改动 | 父（主题 owner） |
| 2 | `ready` → 确认 `m1` 在内容节点全 done 后才出现 | — | 父 |
| 3 | `claim m1` → `subagent(agent="plan-worker", [model=…])` → `close m1` | — | 父 |
| 4 | `check --phase final` → 确认 `converged=true`、无新违规 | — | 父 |
| 5 | 读 `nodes/m1/RESULT.md` 作为合成稿（成本 6,273 tokens） | — | 父 |
| 6 | **A/B 判据 S1**（merger 产出 vs 父手写 golden standard） | 验收结论 | 父 + verifier |
| 7 | 若 C 档不合格 ⇒ 按 §3 阶梯升 A 或 B 档 | — | architect 决策 A/B |
| 8 | 若采纳 ⇒ architect 出 ADR（把本稿作为输入）+ 同步架构文档 §10 | ADR | architect |

⇒ **第 1–6 步不需要 architect、不需要 builder、不需要任何守卫/回滚/配置改动。**

---

## 11. 本方案**不**声称的东西（诚实口径）

1. **不声称它解决了「根上下文不够」** —— 它把根的成本从 114,842 降到 ≈ 56,174，**仍随 N 线性增长**（每节点 ≈ 8k tokens，merger 的输入侧）。
2. **不声称它突破了 N\* ≈ 16–32** —— merger 装不下就是装不下。
3. **不声称 merger 的产出质量等于父手写** —— S1 是**待执行的**判据，不是已通过的结论；本稿用的是 C 档假设，**尚未 A/B**。
4. **不声称零成本** —— 「零代码改动」成立，但**有流程成本**：父多一次派发、多一次 claim/close、多一份 BRIEF 要写对。
5. **不声称 A 档（派发覆盖模型）无争议** —— 与工具说明的相抵见 M7/S8。
6. **不声称本方案已被采纳** —— 它是一份**方案稿**，ADR 尚未产出。
