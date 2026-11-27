# plan-synthesis-offload —— B1 治理面双审报告（oracle ×2 + critic ×1）

> 审稿对象：`ADR-plan-synthesis-offload` 的 **B1 实现批**（提交 `0c36ee0` → `3baa574`）。
> 审查者一律只读；finding 的返工由 builder 自己完成。结论均按**实际输出**誊写（不预填）。

## 0. 结论速览

| 轮次 | 审查者 | 判定 | 处置 |
|---|---|---|---|
| 第 1 轮 | oracle（`审查域: 治理面`） | **BLOCK** — F1/F2 为 BLOCK 项，F3–F11 为中/低 | 已修 F1/F2/F4/F5/F6/F10/F11 |
| 第 2 轮 | oracle（复审，只验闭合） | **PASS-WITH-NOTES** — 无新 BLOCKER | 已修 note（「无裁决」容忍标点/括号 + design 两条边界） |
| 第 3 轮 | critic（`review_profile: build, plan`） | **APPROVE_WITH_CONDITIONS / `mergeable: yes` / `scope_exceeded: false`** — 无 BLOCKER | 已修 SF①–④ + 2 NIT |

**预算**：oracle 2 轮 + critic 1 轮（ADR 的 critic 3 轮预算不适用于本批；本批是新的 change，独立计）。

## 1. oracle 第 1 轮（BLOCK）逐条处置

| # | 级别 | finding | 处置 |
|---|---|---|---|
| **F1** | **BLOCK** | 裸 token 分支把普通英文词抽成 token ⇒ `（最重）：git merge` 抽出 `git` ⇒ 结论层 `includes("git")` 恒真 ⇒ **V4a 静默假绿** | **已修**：裸 token 必须「像 slug/path」（含 `/ : . _ -` 且含字母数字）；实测 `git`/`session`/`worker` ⇒ null |
| **F2** | **BLOCK** | prompt 陈述了不存在的阻断后果（默认 info），且 ❌ 示例未给正确改写 ⇒ 诱导 worker「去掉反引号」，正好落入 F1 | **已修**：示例补「提炼成 slug」的正确写法 + 后果陈述改为准确版；`plan.md` 复核命令加 `--strict-token` |
| F3 | 中 | `plan.md` 的「机制的一部分」不能压过工具说明的 `NEVER set this`；`<providerID/modelID>` 无候选 | **未改 —— 已上报用户裁决**（ADR 面决策，不属本批） |
| F4a | 中 | `R(\d+)` 无词边界 ⇒ `AR2` 抽成 `R2` | **已修**：`\bR(\d+)\b` |
| F4b | 中 | `/无/.test()` 过松 ⇒ `- 不要纳入多租户（无写通道）` 被当「无裁决」⇒ 整段回指检查被跳过 | **已修**：整段匹配（后经复审放宽为容忍括号/句末标点） |
| F5 | 中 | 回滚未处置 `openspec/changes/plan-synthesis-offload/**` 残留 | **已处置**：清单 `notes` 声明保留作决策/实施痕迹 + `tasks.md` checkbox 修正 |
| F6 | 低 | P7 锚点注释未登记「保留行 + 别处覆盖」盲区 | **已补** |
| F7 | 低 | 一行多标记只抽首个 | **已修**（见 critic SF①） |
| F10 | 低 | 结论层缺失时 N 条标记各刷 blocking | **已修**：聚合为 `synth_conclusion_layer_missing` |
| F11 | nit | 测试注释与 `tmpdir()` 不符 | **已修** |

## 2. oracle 第 2 轮（复审）逐条处置

- F1/F2 **判闭合** ✓（主路径封死，测试守护）。
- F4a/F10 **无新误判** ✓；F4b **引入「无。」族假红**（中，fail-loud）⇒ **已修**：容忍包裹括号与句末标点（`无。`/`（无）`/`暂无，`），仍不容忍附加注记。
- 低：`x.md` 弱 token ⇒ design §10.8 登记；F7 已登记（后由 SF① 改为逐标记）⇒ 同步。
- 悬置：F3 等用户裁决。

**判词**：`治理面判定: PASS-WITH-NOTES`（无新 BLOCKER）。

## 3. critic 第 3 轮（APPROVE_WITH_CONDITIONS）逐条处置

critic 对 focus 三问的结论（摘）：
1. 双解析**未构成第二真源**（判据语义单点在 design §2；失败方向多为 fail-closed），但交叉断言只钉 id 一条轴 ⇒ SF③；
2. prompts 与既有契约**自洽**（合成节是 `####` 级、位置正确；`capability:plan` 块只钉能力面、本批未改；token 纪律是**写作**纪律，硬禁令段已把判据归父会话）；
3. 回滚语义**完整**（`retire[]` 六条 fail-closed 约束逐条满足；M1/M6 自洽；openspec change 留存可接受）。

| # | finding | 处置 |
|---|---|---|
| SF① | design §10.9 对「首标记无 token」的描述失真（实际行为双态：正则未锚定会跳到后一个标记） | **已修根因**：改为 `scanMarkers` **逐标记**各自判 ⇒ 行为确定，§10.9 改写 |
| SF② | `tasks.md` 漏登 **AC14 / V11b**（ADR 仍写「待 B1 实现」⇒ 指针随归档悬空） | **已补登**（转后续批；并注明需 architect 回填 ADR 表述） |
| SF③ | 交叉断言只钉 id 集合；`cancelled` 短路与 deps 口径未钉（双解析真正会漂移的轴） | **已补** fixture（含 cancelled 节点）+ 断言内容集口径一致 |
| SF④ | V4a 不区分围栏代码块 ⇒ 引用 token 纪律示例会被当真实标记 ⇒ 假红 | **已修**：扫描前 `stripFenced`（+ 用例） |
| NIT | `plan.md` 写「必开」vs design 写「建议开」模态不一致 | **已统一**为「新 topic 必开」 |
| NIT | registry notes 仍叙述「→ proving…转 active」 | **已改为**与 `state: active` 一致 |

## 4. 最终验证

| 判据 | 结果 |
|---|---|
| `bun test tests/` | **1268 pass / 1 skip / 0 fail**（`plan-synthesis` 32 例） |
| `bash scripts/check-upstream-anchors.sh` | **31/31 OK** |
| `tests/rollback-registry.test.ts` + `tests/rollback-manifests.test.ts` | **60 pass** |
| V8（manifest 内容哈希） | **GREEN**（清单未改 ⇒ 无需重跑 drill） |
| 回滚 drill | 最后一次 **PASS**（基线 `d2244e1a`） |
| 真宿主 e2e（PT-1） | head `68c76242` **verdict=ok**（cli + runtime 均 ok） |

> ⚠ 关于 `1eafb94a` 那次 `test_plan_topics_runtime.bats=fail`：已查证为**抖动**（该用例跑真 `plan` 会话让模型照抄命令，且当时有 429 回落）；`0c36ee02` 与 `68c76242` 均 ok ⇒ 非本批引入的回归。

## 5. F3 后续轮（第 4 轮，oracle 复审）：**PASS-WITH-NOTES** —— F3 闭合

用户裁决 **A**（接受「prompt 覆盖工具 NEVER」为先例）后，`prompts/plan.md` 改为授权链三层：

```
工具 NEVER（上游，不可控）
  → ADR-plan-synthesis-offload D3:79「纪律裁决（用户已裁）」（真源）
  → prompts/plan.md 的转译（履行 D3 条规定的代价）
```

- **oracle 更正我的一处误判**：我曾担心「ADR 无明文先例条目 ⇒ 悬空授权」；实际 `ADR:79` 逐字写有「机制性覆盖算『用户明确要求』…不是禁『按机制设定』」⇒ **授权链无悬空**。`Proposed` 在本仓状态机里 = 已决态，授权效力不依赖 `Accepted`。
- **新增候选 + 禁猜**：给出实测强模型 `minimax-cn/MiniMax-M3.1-Flash` +「不可用则同档更强」+「先查 `models` 工具」。
- **note 已闭合**：`:305` 加「**仅合成节点**」限定，封死强模型向普通派发的泛化（唯一有实质后果的一条）。
- 其余 note（ADR `:79` 补日期 / `:208` 登记 A/B 换档同批改 prompt）为 architect 面的可选追溯项，记入 backlog。

## 7. 登记批（2026-11-27，architect）：4 条登记项 + oracle 审查

B1 收口后的**登记债务**一次性做完（`e9771f8` + `fb845e9`）：

| # | 登记项 | 落点 |
|---|---|---|
| ① | Verification 表补 **V4a/V4b/V4c/V5d**；V4/V5a–V5c 状态回填「载体已落地」、**V9** 回填「实测 31/31」 | `ADR-plan-synthesis-offload` |
| ② | **V11b** 表述「待 B1 实现」→「**待后续批**」（已知不可机判清单同步） | 同上 |
| ③ | D3 `:79` 补「2026-11-27 用户复审确认选 A」+ 落地形态指针；「可变文件」条补「`prompts/plan.md` 亦承载强模型 ID ⇒ A/B 换档须同批改」+「历史行不回改」 | 同上 |
| ④ | 父篇前置事实 ① 补：subagent 会话侧是 **catalog 未暴露**（`Unknown tool 'subagent'`），与 `shell` 的 `permission.rejected` 是两条拒绝路径 ⇒ AC4 运行时证据形态 = 「能力未暴露」 | `ADR-plan-multi-session-collaboration` |

### oracle 审查结论：**APPROVE**（无 BLOCKER）

逐问判定（摘）：

| 问 | 判定 |
|---|---|
| 「✅ B1 已实现」是否失真 | **不构成失真** —— 四个违规码 + `--strict-token` + 聚合逻辑逐条对上源码；「验证方式 = 载体断言 + 单测」已披露强度。建议只在伞行加半句「未对真实 topic 跑」 |
| V4 是否空壳 | 不是；但 V4 与 V4a 重叠八成、且 **V4c 分类上不是 V4 子项** ⇒ 双处维护风险（低） |
| 模型 ID 四处 | **无一事多规**：只有一条规定（D3 裁决 + `prompts/plan.md` 落地条）；V11/V11b/实施记录是 **dated 证据**，换档不回改 |
| ④ vs AC4 | **不冲突**：AC4 是静态配置断言，④ 是运行时证据形态刻画；且正是 V12 文档自己建议的落点 |
| 251 行 | **不超线**：正文 ≈197 行（背景 → 不可机判清单）；实施记录本就是指针区 |
| 新 BLOCKER | **无** |

### oracle 抓到的 SHOULD_FIX（本批已修）

- **`:178` 引言仍写「V9–V11 未实测」** —— 本批把 V9 翻成 ✅ 后该句**成为假陈述**（我漏的）⇒ 改为**按行状态如实概括**。
- **元数据 `:11`/`:12` 过时** —— 写「尚未立项」「AC 映射 暂缺」，而 `openspec/changes/plan-synthesis-offload/` 已存在且我在 ② 里引用了它的 `tasks.md` ⇒ 同文件内部张力 ⇒ **已回填**（关联 change 指向该目录；AC 映射补 AC1–AC18）⇒ 顺带清掉「ADR 完成的标志」第 4 条的到期债务。
- 低/可选已一并处理：V4 改伞判据 + 指针（消双处维护）、V4c 标注「非 V4 原文子项」、历史行「不回改」注记、`tasks.md` 24 例 → 32 例。

### 一个角色边界的实证

`openspec/changes/*/tasks.md` 的订正被 **role-gate 拦下**（architect 写集 = arch_paths + 治理面 + `.rddf/reviews/**`）⇒ 切 builder 提交（`fb845e9`）后切回 architect。**边界按设计生效**，未绕过。

## 8. 未闭合（如实登记）

| 项 | 状态 | 归属 |
|---|---|---|
| ~~**F3**（prompt 的 `model` 覆盖 vs 工具 `NEVER`）~~ | ✅ **已闭合**（用户选 A；oracle 第 4 轮 PASS-WITH-NOTES） | — |
| **V7**（根上下文降幅 ≤ 60,000） | ⬜ 需新根会话 | 后续批 |
| **AC14 / V11b**（provider 实际服务模型，响应级） | ⬜ 判据未实现（语义已确认） | 后续批 |
| ADR 的 Verification 表补 **V4a/V4b/V4c/V5d** + V11b 表述回填 | ⬜ | architect |
| ADR `:79` 补「2026-11-27 用户复审确认选 A」+ `:208` 登记「A/B 换档同批改 plan.md」 | 📋 backlog（可选追溯） | architect |
| 父篇前置事实补「catalog 未暴露 vs `permission.rejected`」 | 📋 backlog | architect |
