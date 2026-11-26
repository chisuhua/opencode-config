# plan-synthesis-offload — 设计（V4 / V5 判据规格）

> **决策真源**：`docs/adr/ADR-plan-synthesis-offload.md`（D1–D7，Proposed）。本文件**不新增决策**，只回答「怎么实现」。
> **判据真源**：ADR 的 `## Verification`（V1–V11b）。本文件把其中**未实现的** V4 / V5 与 AC16 的两条新增检查落成**可编码的规格**。
> **载体**：`scripts/plan-synthesis-check.ts`（自包含 CLI）+ `tests/plan-synthesis.test.ts`。**不 import `lib/plan-topics.ts`**（V2 硬约束）。
> ⚠ 本文件是 **B1 步骤 0（先设计）** 的产出；判据**不得早于**它落地（ADR D6）。

---

## 1. 范围与边界

| 面 | 本设计的处置 |
|---|---|
| `lib/plan-topics.ts` / `scripts/plan-topic-check.ts` / 20 码闭集 / 四值退出码 | **零改动**（V2） |
| 新载体 `scripts/plan-synthesis-check.ts` | 本文件定义其判据、违规码、退出码、输出形状 |
| 判据编号 | 沿用 ADR 的 V 编号；**新增子编号 V4a/V4b/V4c、V5d**（AC16 要求「补 V 编号 + 载体」，编号在此钉死） |

**自包含的代价（如实登记）**：不 import `lib/plan-topics.ts` ⇒ 新载体必须**自行解析 `graph.json`**。两处解析口径若漂移会静默分叉 ⇒ `tests/plan-synthesis.test.ts` 须有一条「同 fixture 与 `lib/plan-topics.ts` 的节点集合一致」的交叉断言（B1 步骤③ 落实）。

---

## 2. 术语与解析规则（**可机判定义**，实现照此写）

### 2.1 合成节点（synthesis node）

```
SYNTH_ID = /^m[1-9][0-9]*$/          // m + 正整数，禁前导零（m01 / m0 非法）
```

判定：`SYNTH_ID.test(node.id)`。

### 2.2 内容节点集合（content nodes）

```
contentNodes = graph.nodes
  .filter(n => !n.cancelled)                 // 取消声明短路
  .filter(n => !SYNTH_ID.test(n.id))         // 不依赖 owner 字段
```

### 2.3 当前答案节点（answer node）

```
synthNodes = graph.nodes.filter(n => !n.cancelled && SYNTH_ID.test(n.id))
answerNode = synthNodes 中 id 的整数后缀最大者
```

- 整数后缀 = `parseInt(id.slice(1), 10)`。
- **无平局**：同号即同 id，被 `duplicate_node_id` 挡；`m01` 已被 `SYNTH_ID` 排除。
- `synthNodes` 为空 ⇒ `answerNode = null`（见 §7「无合成节点」）。

### 2.4 歧义 id（**V5d**）

```
AMBIGUOUS_ID = id => /^m[0-9._-]/.test(id) && !SYNTH_ID.test(id)
```

| id | SYNTH_ID | AMBIGUOUS_ID | 归类 |
|---|---|---|---|
| `m1` / `m10` | ✅ | ❌ | 合成节点 |
| `m01` / `m1-extra` / `m_1` / `m.1` / `m1a` | ❌ | ✅ | **V5d 违规**（强制改名） |
| `metrics` / `migration` / `m` | ❌ | ❌ | 内容节点（正常） |

⇒ 目的：防「m 开头的内容节点被静默归类」（ADR D1 歧义防护条），同时**不误伤** `metrics` 一类。

---

## 3. **V4a**：结论层硬判据（blocking）

### 3.1 触发标记与稳定 token

在**每个内容节点**的 `nodes/<id>/RESULT.md` 中扫描「需上报标记」行。标记集 = `{最重, 必须上报, 薄弱点}`
（⚠ ADR D4 的 BRIEF 引文写「最重/必须上报/薄弱点/**缺陷**」，但 V4 的判据正文只列前三个；**`缺陷` 不作触发标记** —— 它是描述性小标题，几乎每个节点都有，纳入会立即产生大批噪声。此收窄与 ADR「V4 不能验证『该标的都标了』」的诚实边界一致。）

**稳定 token 抽取**（同一行）：

```
TRIGGER   = /最重|必须上报|薄弱点/
STABLE_ID = /(?:【(?:最重|必须上报|薄弱点)】|（(?:最重|必须上报|薄弱点)）)\s*[:：]?\s*
             (?:`([A-Za-z0-9._\/-]+(?::[0-9]+)?)`        // 整体被反引号包裹的**单 token**
               |([A-Za-z0-9._\/-]+(?::[0-9]+)?))         // 或裸 token
```

⚠ **必须整 token 匹配，禁止部分匹配**（本条经实测修正）：早期版本把反引号做成可选，导致
`` **薄弱点 1（最重）：`git merge` 绕开 commit-gate** `` 被**错误**抽出 `git`（多词反引号的首词）⇒ V4a 会误判「已进结论层」而假通过。现版本要求「反引号必须包裹整个单 token」或「裸 token」，多词反引号**不匹配**。

| 行 | 抽取结果 | 判定 |
|---|---|---|
| ``**薄弱点 1（最重）：`git merge` 绕开 commit-gate**`` | 无 | **info**（V4b）—— 这正是 ADR 实测里 C 档的原样，说明它当时**没遵守 token 纪律** |
| `- （最重）\`commit-gate\`` | `commit-gate` | blocking 检查 |
| `- 【必须上报】docs/adr/x.md:42` | `docs/adr/x.md:42` | blocking 检查 |
| `- （最重）：git merge 绕开…` | 无（裸词不含分隔符） | **info** |
| `- （最重）：commit-gate 绕过` | `commit-gate` | blocking 检查 |
| `**薄弱点 1（最重）**：见 nodes/n3/RESULT.md:302` | 无（标记后是 `**`） | **info**（不做行尾兜底 —— 见下） |

⚠ **裸 token 必须「像 slug/path」**（审查 F1 实测修正）：裸写分支要求 token **含分隔符**（`/` `:` `.` `_` `-`）且含字母数字 ⇒ 排除 `git` / `session` / `worker` 这类普通英文词。否则 `（最重）：git merge 绕开…` 会抽出 `git`，而结论层 `includes("git")` 几乎恒真 ⇒ **V4a 静默假绿**（连 info 都不报）。

⚠ **不设「行尾兜底」**：若允许「标记之后任意位置的 `path:line`」会被无关引用误导。严格 = 纪律可教；不严格 = 判据可被噪声填满。

⇒ **产出方纪律（AC17，落 `prompts/plan-worker.md:28`）**：标 `最重` / `必须上报` / `薄弱点` 时，**必须在标记后紧跟稳定标识**（`path:line` 或**单 token** 反引号 slug）。

### 3.2 结论层定位

结论层 = **当前答案节点** `nodes/<answer-id>/RESULT.md` 中标题匹配 `^#{1,6}\s*.*反哺清单` 的小节正文（到下一个同级或更高级标题为止）。

⚠ 只检索**当前答案节点**（不是全部合成节点）：历史合成节点是审计痕迹，其结论层不构成当前答案（与 V5b 的作用域一致）。

### 3.3 判定

```
for each contentNode:
  for each 标记行 with stableId:
      if stableId not in 结论层正文:    → 违规 synth_heavy_item_not_in_conclusion (blocking)
  for each 标记行 without stableId:      → 违规 synth_token_missing (info)   // V4b
```

匹配方式 = **子串包含**（`结论层.includes(stableId)`），不做语义匹配（ADR 明令）。

### 3.4 **V4b**：token 缺失（默认 info，`--strict-token` 可升级为 blocking）

见上：标记行无 stable id ⇒ `synth_token_missing`，默认 `severity=info`，**不进退出码**（避免历史节点成批变红）。

⚠ **可绕过性（诚实登记）**：默认 info 意味着上游只要**不写 token** 就能避开 V4a 的阻断 ⇒ 纪律变成可选项。缓解 = `--strict-token` 把该码升为 blocking（**新 topic 必开**；存量 topic 留在 info 以免成批变红）。该开关**不改判据语义**，只改严重度。

---

## 4. **V5a / V5b / V5c**：结构判据（blocking）

| 编号 | 判据 | 违规码 |
|---|---|---|
| **V5a** | `⋃(每个合成节点的 deps) == contentNodes`（集合相等，取并集口径） | `synth_dep_union_incomplete`（缺哪些）/ `synth_dep_union_extra`（多了非内容节点） |
| **V5b** | `answerNode.deps ⊇ contentNodes` | `synth_answer_dep_incomplete` |
| **V5c** | 任一合成节点的 `deps` **不含**其它合成节点 id | `synth_dep_on_synth` |
| **V5d** | §2.4 歧义 id | `synth_id_ambiguous` |

- **V5b 只作用于当前答案节点**；更早、已 done 的历史合成节点**豁免**（其 deps 反映当时的内容集；父篇 D9 禁止「完成后取消」⇒ 无消解手段）。历史合成节点的登记完整性由 **V5a 的并集口径**兜。
- **V5a 的「extra」半边**同时抓「deps 指向了不存在的节点 / 指向上游合成节点」——后者与 V5c 重叠但更早报出，保留两条（都阻断）。

---

## 5. **V4c**：根裁决集的 slug 集合包含（blocking）

### 5.1 BRIEF 侧（源）

合成 BRIEF（`nodes/<answer-id>/BRIEF.md`）必须含标题 `^#{1,6}\s*根裁决集` 的小节，小节内：

- 每条裁决带 slug：`R\d+`（**大写 R + 数字**；词边界：`AR2` 不算 `R2`）；
- **无裁决须显式写「无」/「暂无」** —— **整段**（可带包裹括号与句末标点：`无。` / `（无）` / `暂无，` 都算；**不得附加注记**，如 `无（本次无裁决）` 不算）。

```
briefRulings = 该小节中所有 R\d+ 的出现集合
if (小节不存在)                     → synth_brief_no_ruling_set (blocking)
else if (briefRulings 为空 && 无「无」) → synth_brief_no_ruling_set (blocking)
```

### 5.2 合成稿侧（回声）

当前答案节点的 `RESULT.md` 中标题匹配 `^#{1,6}\s*.*父的裁决汇总` 的小节 ⇒ 抽取 `R\d+` 集合 `synthRulings`。

### 5.3 判定

```
if (!(briefRulings ⊆ synthRulings)) → synth_ruling_not_propagated (blocking)
   detail: 列出缺失的 slug
```

⚠ **边界（不可夸大）**：本判据只验证 **BRIEF → 合成稿的转写保真**；**不能**验证「根是否把全部持有裁决写进了 BRIEF」（真值只在根上下文，且循环：BRIEF 由根写、稿按 BRIEF 写、check 比对两者 ⇒ 根漏写的两侧一致缺席）。已登记 ADR「已知不可机判清单」。

---

## 6. 违规码闭集（**新载体专用，不进 `plan-topic-check` 的 20 码**）

| 码 | 严重度 | 含义 |
|---|---|---|
| `synth_id_ambiguous` | blocking | 形似合成节点却不合 `^m[1-9][0-9]*$` |
| `synth_answer_missing` | blocking | 有合成节点但解析不出答案节点（不应发生，防御性） |
| `synth_dep_union_incomplete` | blocking | V5a：deps 并集缺内容节点 |
| `synth_dep_union_extra` | blocking | V5a：deps 并集含非内容节点 |
| `synth_answer_dep_incomplete` | blocking | V5b：答案节点 deps 未覆盖全部内容节点 |
| `synth_dep_on_synth` | blocking | V5c：合成节点互依 |
| `synth_heavy_item_not_in_conclusion` | blocking | V4a：标记项未进结论层 |
| `synth_conclusion_layer_missing` | blocking | V4a：答案节点缺 `## 反哺清单` 小节（**聚合为一条**，不逐项刷 —— 审查 F10） |
| `synth_brief_no_ruling_set` | blocking | V4c：BRIEF 缺 `## 根裁决集` 或内容非法 |
| `synth_ruling_not_propagated` | blocking | V4c：BRIEF 的 slug 未全部回指 |
| `synth_token_missing` | **info** | V4b：标记行无稳定 id |
| `synth_graph_error` | blocking | `graph.json` 缺失/不可解析/结构非法 |

输出每条带 `severity`；`ok = 无 blocking 项`。

---

## 7. 退出码与 `--json` 形状

**CLI 参数**：

| 参数 | 作用 |
|---|---|
| `<topic-dir>` | 位置参数，topic 目录 |
| `--json` | 机器可读输出 |
| `--require-synthesis` | 无合成节点时报 `synth_answer_missing`（exit 1）；默认「无合成节点 = 正常」 |
| `--strict-token` | `synth_token_missing` 由 info 升为 blocking（**新 topic 必开**） |

**四值，与既有 CLI 同构**（但**不共享实现**）：

| 退出码 | 含义 |
|---|---|
| `0` | 无 blocking 违规（info 可非空） |
| `1` | 有 blocking 违规 |
| `2` | 用法错 |
| `3` | `graph.json` 缺失或不可解析（`synth_graph_error`） |

**「无合成节点」不作为错误**（对应 ADR D7 起用阈值：小 topic 不起合成节点是正常态）：

```
synthNodes.length === 0 && !--require-synthesis  ⇒ exit 0，输出 {ok:true, violations:[], note:"no synthesis node"}
synthNodes.length === 0 &&  --require-synthesis  ⇒ exit 1，synth_answer_missing
```

`--json` 形状：

```jsonc
{ "ok": true, "violations": [ { "code": "…", "node": "m1", "detail": "…", "severity": "blocking|info" } ],
  "summary": { "contentNodes": ["a1","a2"], "synthNodes": ["m1"], "answerNode": "m1" } }
```

人类可读输出：每行 `[severity] code node: detail`。

---

## 8. 与 B1 其它步骤的接口

| 步骤 | 本设计对它的约束 |
|---|---|
| ① P7 锚点 | 与 V4/V5 无耦合；**须先于** ② 执行（假红即停） |
| ② `prompts/plan.md` 合成节 | 须写入：五节结构（§结论 / §各节点结论的合并 / §父的裁决汇总 / §反哺清单 / §不声称的东西）、`## 根裁决集`、答案惯例（整数后缀最大）、id 形状、起用阈值、模型覆盖说明 |
| ② `prompts/plan-worker.md:28` | 须写入：标 `最重/必须上报/薄弱点` 时紧跟稳定标识（**唯一落点**；存量不追溯） |
| ③ 载体 | 本文件 §2–§7 即其规格；**须过一次新增文件闸门显式决定** |
| ④ 回滚迁移 | 与判据无关；`declared` → `proving` → `active` |

---

## 9. 测试计划（`tests/plan-synthesis.test.ts` fixtures）

| Fixture | 断言 |
|---|---|
| 单合成节点 + 全 deps + 标记项进结论层 | `ok=true`，exit 0 |
| 标记项**未**进结论层（复刻 C 档实测形态） | `synth_heavy_item_not_in_conclusion`，exit 1 |
| 标记行无 stable id | 仅 `synth_token_missing`（info），**exit 0** |
| 同上 + `--strict-token` | `synth_token_missing` 升 blocking ⇒ **exit 1** |
| `（最重）：\`git merge\``（部分匹配陷阱） | **不抽 token**（不得抽成 `git`）⇒ 仅 info |
| deps 漏一个内容节点 | `synth_dep_union_incomplete` + `synth_answer_dep_incomplete` |
| deps 含上游合成节点 | `synth_dep_on_synth` |
| `m01` / `m1-extra` | `synth_id_ambiguous` |
| `metrics` 作内容节点 | **不报**（正常内容节点） |
| BRIEF 无 `## 根裁决集` | `synth_brief_no_ruling_set` |
| BRIEF 有 R1/R2，稿只回指 R1 | `synth_ruling_not_propagated`（detail 含 `R2`） |
| 无合成节点（小 topic） | exit 0 + `note:"no synthesis node"`；加 `--require-synthesis` ⇒ exit 1 |
| 追加式 m1 + m2 共存 | V5b 只判 m2；V5a 并集通过 |
| 同 fixture 与 `lib/plan-topics.ts` 的节点集合一致 | 交叉断言（§1 的漂移防护） |

---

## 10. 已知边界（如实登记）

1. **`synth_token_missing` 默认是 info** ⇒ 不阻断，历史节点不会成批变红，但也意味着「纪律未被遵守」不会被强制（`--strict-token` 可升级为 blocking；默认仍 info 以免存量成批变红）。
2. **V4a 只覆盖「被标了且带 token」的项** ⇒ 「该标的都标了」不可机判（ADR 已登记）。
3. **`缺陷` 不作触发标记**（§3.1 的收窄）—— 若未来证明需要，须回到 ADR 改 D4，不在实现里偷加。
4. **新载体自行解析 graph.json** ⇒ 与 `lib/plan-topics.ts` 存在双解析漂移风险（§1 的交叉断言是唯一防线）。
5. **答案节点靠 id 整数序** ⇒ 父若把 `m3` 的 BRIEF 写错（指摘 `m1` 而非 `m2`），V4a/V5b 仍按 `m3` 判 ⇒ 语义正确性不在本判据射程内。
6. **围栏代码块内的标记不计**（扫描前 `stripFenced`，critic SF④）—— 但**结论层**里的 token 匹配仍按原文 `includes`（示例块中的 token 也会算命中）；该不对称已知，`path:line` 形态可弱化其影响。
7. **slug 真实性不校验** ⇒ 「为凑 token 编造 slug」可过判据（审查 F2 的残留盲区）⇒ 追溯性靠 `path:line` 形态与人工抽检，不靠判据。
8. **单段文件名是弱 token**（复审 note）：`x.md` 含 `.` ⇒ 过「像 slug」约束，但结论层 `includes("x.md")` 易恒真。**不进一步收紧**（收紧会误伤 `commit_gate` / `a-b` 等合法 slug，且假绿恒真度远低于原 F1）⇒ 登记为已知弱面。
9. **一行多标记 = 逐标记各自判**（`scanMarkers`，critic SF①/原 F7 已闭合）⇒ 首标记无 token **不再遮蔽**后续标记的合法 slug。单标记行等价于 `extractStableId()`（兼容 helper，只看首个）。
