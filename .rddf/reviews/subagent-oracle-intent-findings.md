# Findings：oracle 的调用意图与 architect 角色的匹配缺口

> 状态：**halted** —— 等 architect 复审 → oracle/critic 审稿 → 用户批准后实施
> 提出者：builder（2026-11-12）
> 触发：用户提问「① 父会话 system prompt、② 工具描述里的 subagent 清单，对 oracle 的架构审查意图 / 对 architect 角色是否匹配」
> 结论：**不匹配（2 条 HIGH、1 条 MED、1 条 LOW）**，见下。

---

## 0. 判据来源与方法

| 项 | 内容 |
|---|---|
| 判据来源 | 用户本次提问（"是否匹配"）；`prompts/build.md` 的「审查配对」与「architect 产出形态契约」；`prompts/oracle.md` 的 Mission / Output |
| 证据 | `prompts/build.md:39/63/241/418/437-441/458`；`prompts/oracle.md:1-60`；`opencode.jsonc.opencode-go:676`（oracle description）、`:1067`（critic description）；上游 `packages/core/src/tool/plugin/subagent.ts:205-214`（prompt 落库）、`:296-310`（subagent 清单拼装）；端到端实测 SC-10（oracle 36 字符 prompt 放行、无任何契约记录） |
| 不在范围 | 是否给 oracle 设输入契约属于 tasks 7.4（前置未到）；本报告只登记缺口 + 最小修法 |

---

## F1（HIGH）② 里 oracle 的 description 与 architect 的"先审"流程**方向相反**

**证据**

```
# opencode.jsonc.opencode-go:676
"description": "Read-only architecture consultant. Advises on architecture decisions and complex debugging without modifying files."

# opencode.jsonc.opencode-go:1067（对比）
"description": "架构与决策审稿 subagent。只审 ADR 一致性 / 关键取舍 / 目标场景失败模式；BLOCKER 严格三选一…"
```

父模型的 `subagent` 工具描述里会拼进这份清单（`subagent.ts:296-310`）。清单传达的角色分工是：
**"审稿 = critic" / "问建议 = oracle"**。

而 `build.md:418`（architect 行）要求的分工是：
**oracle 先审"这个决策在目标场景会怎么坏（失败模式 / 边界 / 被否掉的替代方案是否真的更差）" → critic 再审"与既有 ADR / 契约是否冲突"**。

⇒ 同一件事（失败模式审查）在 oracle 的职责里、在 critic 的 description 里**同时出现**；而 oracle 的 description 一个字没提"审"。模型只读清单时的合理选择是跳过 oracle 那一轮。

**影响**：architect 的固定环节（ADR 双审、oracle 先行）在最容易被读到的位置被系统性弱化。

**建议**（最小改法）：把 oracle 的 description 改为"顾问 + 审查双模式"，并点明审查模式的输入/输出形态（产物 + 4 节 + 可选 verdict），同时把"失败模式"从 critic 的描述里让位（critic 保留"一致性 / 冲突"）。

**验收判据**：`opencode debug agents` 里 oracle 的 description 含"审"语义；critic 的 description 不再独揽"失败模式"；两条描述互不重叠。

---

## F2（HIGH）治理面 verdict 要求写在**调用方**文档里，oracle 自己不知道

**证据**

- `build.md:437-441`：要求 oracle 的「建议」段**首行**给 `治理面判定: PASS | BLOCK | PASS-WITH-NOTES`；判定为 BLOCK 或有未应答 finding ⇒ 不得声称完成。
- `grep -n "治理面判定\|PASS\|BLOCK" prompts/oracle.md` → **无命中**；`oracle.md` 的 Output 固定 4 节，没有任何判定行。

⇒ 该要求只能靠调用方在 prompt 里**转述**。而 oracle **没有输入契约、没有 L3 提示、没有校验**（`CONTRACTS` 只有 critic）。调用方漏转述 ⇒ 审完了但拿不到机读结论，且**无任何机制发现**。

**影响**：治理面审查（`~/.config/opencode/**` 变更）的"通过/不通过"判据可被静默跳过。

**建议**：把 verdict 要求**下沉到 `prompts/oracle.md`**：输入里声明"审查/复审"时，`建议` 段首行必须给判定行（无判定 = 该轮审查不成立）。注意与现有规则"不要写开场白或总结段"不冲突 —— 判定行在 `建议` 段首行，不属于开场白。

**验收判据**：`oracle.md` 的 Output 段含判定行要求；对治理面改动跑一轮 oracle，输出首行有 `治理面判定: …`。

---

## F3（MED）① 的"入口行"是咨询措辞，审查要求埋在表格深处

**证据**

- 入口：`build.md:39`「需要架构咨询/复杂调试 → `subagent`，`agent: "oracle"`」——**咨询**框架（给问题，要建议）。
- 审查要求：`:418`（审查配对）、`:241`（一次成稿流程 step 3）、`:458`（顺序不可颠倒）、`:437`（verdict）——全在表格/深层章节。

**影响**：模型按入口行理解时，给 oracle 的 prompt 是"帮我看下这个设计合不合理"，而不是"这是 ADR 草稿 + 4 个落点 + 期望输出"。这与 F2 叠加后，审查环节既没输入判据也没输出判据。

**建议**：`:39` 拆成两行或补一句状语 —— 咨询（问题）/ 审查（产物 + 判据），并把审查形态指向 `§审查配对`；不新增章节（避免文档继续变长）。

**验收判据**：`:39` 所在列表里能区分"咨询"与"审查"两种调用；两处都给出指向审查配对节的指针。

---

## F4（LOW）oracle 的固定输出没有 finding 编号与严重度，无法与 critic 的 BLOCKER 闭合口径对齐

**证据**：`oracle.md:40-58` 的 4 节（根因 / 建议 / 已排除的替代方案 / 下一步）无编号、无严重度；而 `build.md:241/262` 要求"oracle + critic 双审完成；若 critic 报过 BLOCKER，则 BLOCKER 全部闭合"。oracle 的产出无法参与"闭合"计数。

**影响**：architect 只能人工判读 oracle 的"是否通过"，无法像 critic 那样做逐条闭合（当前实际做法：靠 verdict 行 + 逐条应答，属半自动化）。

**建议**：**暂不改**。真实痛点在 F2（判定行）；给 oracle 加 finding 编号会拉长输出、且与"顾问"用途冲突。登记为已知限制，等 F2 落地后再看是否需要。

**验收判据**：（不实施）仅记录为已知限制。

---

## 5. 汇总与路由

| # | 严重度 | 改动面 | 归属 | 前置 |
|---|---|---|---|---|
| F1 | HIGH | `opencode.jsonc.opencode-go` 的 agent 段两处 description | **architect**（治理面） | 需 oracle → critic 审稿 |
| F2 | HIGH | `prompts/oracle.md` Output 段 | **architect**（治理面） | 同上 |
| F3 | MED | `prompts/build.md:39` 委派原则 | **architect**（治理面） | 同上 |
| F4 | LOW | —（不实施） | 记录 | — |

**不属于本报告范围**：给 oracle 设输入契约（tasks 7.4，critic 仍在 warn 灰度，前置未到）。

## 6. 为什么 halted（而不是直接改）

1. 三条改动全部落在**治理面**（`prompts/**` + `opencode.json(c)` 的 agent 段）—— 按角色矩阵只有 `architect` 能写；builder 只能提 findings。
2. 治理面改动的**必须审查路径**是 `oracle → critic`，且 critic 必审（本次改的是表格/条目/触发条件语义）。
3. F1 会改变父模型对两个 subagent 的**选择倾向**，属于"会让 agent 产生错误行为"的反向面（收益面），需要 oracle 用同一判据反打一遍。

## 7. 需要 architect 回答的三个问题

1. F1 的改法：允许"oracle 也审失败模式"与 critic 的职责是否重叠到不可接受？如果重叠，**谁让位**（oracle 描述改宽 vs critic 描述改窄）？
2. F2 的判定行是**无条件要求**还是"仅当输入声明审查时"？后者更安全（不影响咨询用途），但依赖调用方声明 —— 是否接受这个依赖？
3. F3 是否值得改：入口行的措辞问题是否足以让模型写错 prompt？有没有实测样本支持（否则属于推测性改动）？
