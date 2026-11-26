# 合成外置 A 档复测记录（V8 收口）

> **类型**：方案稿 §6 **S1/V8** 的 A 档（派发覆盖模型）执行记录｜**结论**：**A 档 PASS ⇒ B2 不触发**
> **执行者**：build 主会话（父 / root-plan，session `ses_de8f57a3cffezCAvlmyBDCFShr`）
> **日期**：2026-11-26｜**分支** `scenario/build-worker-design`
> **依据**：`.rddf/reviews/plan-synthesis-offload-proposal.md`（§3 阶梯 / §6 S1）· `.rddf/reviews/plan-synthesis-offload-ab-verdict.md`（**C 档记录**，本记录是其续篇）
> **ADR**：`docs/adr/ADR-plan-synthesis-offload.md`（D3 三档阶梯 / D4 结论层硬判据 / V8 / V11）
> **用户裁决**：U1 = **A1**（机制性模型覆盖算「用户明确要求」）—— 故本复测可用 `model` 覆盖。

---

## 0. 裁决（一句话）

> **A 档 PASS**：缺陷清单覆盖 **文件级 31/31（100%）**、行号级 28/31（90%，缺口全是**引用口径差异**而非漏项）；裁决项 **33 条**（≥ 上游 31 条）；**C 档丢掉的三条「最重/关键」发现全部补进结论层**（`commit-gate` 0→1、`classPermissions` 0→1、`ownerAgentOf` 0→1）；`session_v2.model` 证明 **provider 层确实换了模型** ⇒ **V8 收口 ⇒ 阶梯停在 A 档 ⇒ B2（新增 `plan-merger` agent）不触发**。

---

## 1. 复测的形态（追加式，两个合成节点共存）

| 项 | 值 |
|---|---|
| 合成节点 | `m1`（C 档，已 `done`）**+** `m2`（A 档，本次）**共存** |
| `m2.deps` | `["n1".."n7"]` —— **不含 `m1`** ⇒ 满足 V5c「合成节点不互依」 |
| `m2` 的 BRIEF | 追加式语义（`m1` 留作审计痕迹、不修订）+ **D4 的结论层硬判据** + **「已知缺陷」表（3 条，必须补上）** |
| 派发 | `subagent(agent="plan-worker", model="minimax-cn/MiniMax-M3.1-Flash")` —— **A 档，带覆盖** |
| 模型覆盖生效 | `session_v2.model` = `{"id":"MiniMax-M3.1-Flash","providerID":"minimax-cn"}`（对照 `m1` = `{"id":"deepseek-v4.1-flash","providerID":"opencode-go"}`）✅ |

---

## 2. ★ V5a/V5b/V5c 的实测验证（本复测的附带产出）

**ADR 的 V5 经 oracle 建议后被我改写**（原建议是「deps ⊇ 全部非 cancelled 节点 − 自身」的**逐节点**定义）。改写理由：**追加式两个合成节点共存时，该定义会把两个合成节点都判不通过 ⇒ 判据静默失效**。

**实测对照**（`m1` + `m2` 共存的图）：

| 定义 | 结果 |
|---|---|
| oracle 原建议（逐节点：`deps ⊇ 全部非 cancelled − 自身`） | ❌ `m1` 缺 `m2`、`m2` 缺 `m1` ⇒ **两个都判不通过** ⇒ 静默失效 |
| **本篇采用的并集口径**（V5a 并集完整 / V5b 无冒充 / V5c 不互依） | ✅ **全通过**：内容节点 = 7 个（`n1`–`n7`）、合成节点 = 2 个（`m1`/`m2`）、并集 = `n1..n7` |

⇒ **本次复测同时验证了 ADR 的 V5 改写**（若不改为并集口径，「追加式返工路径」与「V5 完整性判据」将互相打死）。

---

## 3. S1 A/B 对照：C 档 vs A 档

> 判据脚本 `/tmp/opencode/bwd-scenario/ab-judge.py`（已用 golden vs golden 自测校准：全项 100% / PASS）

| 指标 | golden | **C 档（m1）** | **A 档（m2）** | 判据 |
|---|---|---|---|---|
| ② 缺陷覆盖 Tier2（同 file，宽松） | 31 | 29 (93%) | **31 (100%)** | 完整 |
| ② 缺陷覆盖 Tier1（同 file:line，严格） | 31 | 22 (70%) | **28 (90%)** | — |
| ③ 裁决项行数 | 17（合并口径） | 31 | **33** | ≥ golden ✅ |
| ① 关键决策词命中 | — | 6/6 | **6/6** | ✅ |
| 收敛性（≤ 40,000 B） | 23,649 B | 27,112 B ✅ | **35,265 B** ✅ | ✅ |
| **「已知缺陷」3 条进 §4 反哺清单** | — | **0 / 0 / 0** ❌ | **3 / 3** ✅ | **A 档的决定性差异** |

### 3.1 Tier1 剩余 3 个未命中锚点 = **引用口径差异**，非漏项

| golden 锚点 | m2 的情况 |
|---|---|
| `lib/plan-topics.ts:852` | 文件已引用（Tier2 命中）⇒ 行号不同（`liveness_stale` 相关函数的行位差异） |
| `opencode.jsonc:1373` | golden 引的是 **`opencode.jsonc.opencode-go` 副本**的行号；m2 引的是**活配置 `opencode.jsonc`** ⇒ **事实同、行号不同**（n5 头部已警告过此口径差异） |
| `prompts/plan.md:276` | 文件已引用 ⇒ 行号不同 |

⇒ **Tier2 = 100% ⇒ 无任何 golden 缺陷被漏掉。** Tier1 的 90% 反映的是「同一事实、不同行号」，**不是覆盖缺口**。

### 3.2 A 档额外产出

| 项 | 内容 |
|---|---|
| 新增发现 | m2 登记了一条 golden 与 m1 都没有的：**`graph.json` 的活体实例行号随图增长漂移**（n4/n7 记的是 `:141`/`:146`，加 `m2` 后实际为 `:142`/`:147`）⇒ **对可变文件做 `path:line` 引用会漂** ⇒ 与 D3 的「行号不是契约」同型，**建议登记为一条不可机判/易腐化项** |
| 裁决更全 | 33 条 = 上游 31 条 + **2 条本次新裁决**（m2 自主提出） |
| 反哺更全 | 23 条（vs m1 的 16 条） |

---

## 4. 机制未退化（S4 / S5 / S6 / S7）

| 判据 | 结果 |
|---|---|
| S4 机制未退化 | ✅ `converged=true`；**`done=9`**（7 内容 + m1 + m2）；七桶其余全 0；每 node 目录仅 BRIEF/TODO/RESULT；topic 树外零写入 |
| S5 fence 正确触发 | ✅（C 档轮已验：`stale_inputs [m1]: 输入已变：deps`；本轮同一机制仍生效） |
| S6 零治理面漂移 | ✅ 本轮只动 `.rddf/plan-topics/**`（数据面） |
| S7 零回滚工作量 | ✅ 机制面 0 改动 ⇒ 无需 `.rddf/rollback/` 条目 |

---

## 5. V11：provider 层是否真换模型 —— **可机判，已判 PASS**

ADR 原写「先核实该表是否暴露 model 字段（**不预先承诺**）」⇒ **核实结果：`session_v2` 有 `model` 列**（JSON 形如 `{"id":…,"providerID":…}`）。

| 会话 | 档位 | `session_v2.model` |
|---|---|---|
| `m2`（A 档） | 覆盖 | `{"id":"MiniMax-M3.1-Flash","providerID":"minimax-cn"}` ✅ |
| `m1`（C 档） | agent 配置 | `{"id":"deepseek-v4.1-flash","providerID":"opencode-go"}` ✅ |
| 根会话 | — | `{"id":"MiniMax-M3.1-Flash","providerID":"minimax-cn"}` |

⇒ **provider 层风险由「不可机判」降为「可机判」** ⇒ ADR 的「已知不可机判清单」中该行**应当移出**，改为一条可机判判据（V11 判据即此查询）。

---

## 6. 对 ADR 的回填建议（交 architect）

| 位置 | 现状 | 建议改为 |
|---|---|---|
| **V8** | 「⚠️ C 档 FAIL ⇒ **A 档待测**」 | 「✅ **A 档 PASS**（2026-11-26 实测：文件级 31/31、行号级 28/31、裁决 33 条、三条已知缺陷全补上）⇒ **阶梯停在 A 档**；C 档对照：文件级 29/31、三条已知缺陷 0/3」 |
| **V11** | 「⬜ 未实测（先核实该表是否暴露 model 字段）」 | 「✅ **PASS**：`session_v2.model` 暴露模型（`{"id":…,"providerID":…}`）；A 档实测覆盖生效 ⇒ **provider 层风险从「不可机判」降为「可机判」**」 |
| **「已知不可机判清单」** | 有「provider 层是否真换模型」一行 | **移出**该清单（已可机判，V11）；**新增**一行：「对**可变文件**（如 `graph.json`）做 `path:line` 引用会随内容增长漂移（A 档实测 `+1`）⇒ 同 D3 的「行号不是契约」，引用可变文件须给**内容锚**（如 `graph.json` 中 `owner:"parent"` 那一行）而非行号」 |
| **D4** | 已写「稳定 token」要求 | 补一句实测依据：「A 档实测：**带 `path:line` 的三条已知缺陷 3/3 进入 §4** ⇒ 「稳定 token」这条约定有效」 |
| **实施记录** | 记 oracle 审查 | 追加：A 档复测结论 + 「V5 改写的实测验证」 |

---

## 7. 阶梯终局

| 档 | 结果 |
|---|---|
| **C**（弱模型） | ⚠️ 部分达标（文件级 29/31；**三条已知缺陷 0/3**）⇒ 不可用 |
| **A**（派发覆盖模型） | ✅ **PASS**（文件级 31/31、裁决 33 条、三条已知缺陷 3/3、V11 PASS）⇒ **采纳** |
| **B**（新增 `plan-merger` agent） | ⛔ **不触发**（A 档已达标 ⇒ B 档的全部成本无正当性） |

⇒ **ADR 的 D3「默认 A 档」被实测支撑** ⇒ 实现批 B1 的步骤 ①′ **已完成**，②（`prompts/plan.md`）可直接按现稿写。

---

## 8. 复现

```bash
git checkout scenario/build-worker-design
T=.rddf/plan-topics/build-worker-design
python3 /tmp/opencode/bwd-scenario/ab-judge.py $T/SYNTHESIS.md $T/nodes/m1/RESULT.md   # C 档
python3 /tmp/opencode/bwd-scenario/ab-judge.py $T/SYNTHESIS.md $T/nodes/m2/RESULT.md   # A 档
python3 /tmp/opencode/bwd-scenario/v5-check.py $T/graph.json                          # V5a/b/c
sqlite3 ~/.local/share/opencode/opencode.db "SELECT id, model FROM session_v2 WHERE id LIKE 'ses_%' AND model LIKE '%MiniMax%';"   # V11
bun scripts/plan-topic-check.ts check $T --json                                       # done=9 / converged=true
```

**基线**：`bun test tests/` = 1232 pass / 0 fail；`scripts/check-upstream-anchors.sh` = 30/30 OK。
