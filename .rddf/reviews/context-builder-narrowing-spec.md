# 补丁规格 v2：context-builder 收窄为「机械搬运工」

> 角色：architect（治理面）｜日期：2026-11-13｜决策：用户选定**收窄**
> 状态：v1 经 oracle `PASS-WITH-NOTES`（8 条 finding）；v2 已并入，**待 critic 审稿后实施**

---

## 1. 依据（实测）

| 事实 | 证据 | 含义 |
|---|---|---|
| 采纳率极低 | 310 个 critic prompt 中仅 **22 个（12%）**真正嵌入它的输出 | 「推荐方式 A」几乎没落地 |
| 用则有效 | 嵌入的 22 个里 **15 个（68%）** 7 字段齐全 vs 总体 35% | 它产出的形状是对的，问题在**用得少** |
| 不可见 | `hidden: true` ⇒ 被 `!agent.hidden` 过滤（`packages/core/src/tool/plugin/subagent.ts:289-303`） | 父模型工具清单里**看不到它** |
| 职责矛盾 | prompt 内 **4 处**互斥指令（`:27` / `:89-90` / `:110` / `:141`）+ **2 处**漏网（`:50` 模板内注释、`:197`） | 触发时行为不可预测 |
| 陈旧示例 | 「你返回」示例（`:157-188`）只有 **6 字段**（缺 `review_profile`，2026-11-03 才引入） | 第二份契约拷贝 |
| 投递环断裂 | `MULTI-AGENT-DESIGN.md:551`「plan agent 不需要审稿」、矩阵 `:558` plan→critic = ❌ | **plan 组装的 prompt 没有合法下游** |

---

## 2. 补丁内容（v2）

### S1 去 `hidden` + **改写 description**（两处同一落点，合并执行）

`opencode.jsonc.opencode-go`（`opencode.jsonc` 是其 symlink，改一份生效 —— 已 `readlink` 确认）：

- 删除 `context-builder` 的 `"hidden": true`（缺省 false）⇒ 回到父模型的「Available subagents」清单。
- **description 改写**（v1 规格遗漏，导致 S6.3 护栏会立刻红灯）：现文「把 **build agent** 给的原始材料组装成 critic 的 7 字段上下文 prompt（含 review_profile）。不评审、不写代码、不联网、不委派。」→ 新文要点：
  - 调用方中性（「调用方给的原始材料」，不再写死 build agent）；
  - 声明**只搬运不推断**：`intent` 必须由调用方给，缺失时返回 `ERROR: missing intent`；
  - 声明适用面：**大 diff 搬运**（不是"推荐路径"），但**保留功能锚点**「critic 的 7 字段上下文 prompt」—— description 是父模型唯一选择面依据，只讲"搬运"会让召回进一步下降。
- 只改 `context-builder`；`title` 仍 hidden（它不是 subagent）。
- **可见性语义（须文档化）**：去 hidden 后它出现在**所有持有 `subagent` 工具**的父模型清单里（build / plan / front），而 front 的白名单不含它 ⇒ **清单可见、执行期 deny**（权限拒绝是已定义的正常失败模式）。写进 description 与 `MULTI-AGENT-DESIGN` 卡片：**可见 ≠ 可调；只有 build 有推荐路径**。

### S2 职责收窄：**只搬运，不推断 intent**

| 字段 | context-builder 的权限 |
|---|---|
| `changes_summary` | ✅ 从 `git diff --stat` + `git log` 提取 |
| `review_profile` | ✅ 按路径映射（build.md 为权威） |
| `diff_or_paths` | ✅ 完整 diff，或路径 + `qualified_name` + `trace_path` 输出 |
| `context` | ✅ 测试路径 / 复现命令 / 关联 ADR（从仓库里找） |
| `expected_format` | ✅ 固定文本 |
| `focus` | ⚠️ **可推断，但每条以「推断：」开头** |
| `intent` | ❌ **不可推断**：必须由调用方给 |

**缺 `intent` 时的唯一行为**（v2 细化）：

1. 首行 `ERROR: missing intent`；
2. 之后**可以**附已机械产出的字段（`changes_summary` / `review_profile` / `diff_or_paths` / `context` / `expected_format`）+ 一行「补 intent 后重发，可直接合并」—— 把重试从"重启"降为"合并"；
3. **不产出** 7 字段 prompt、**不推断** intent、不带免责声明继续。

**「缺失」与「模糊」的边界**：缺失（没有 intent 字段）⇒ ERROR 停下；模糊（有 intent 但含混，如"优化一下"）⇒ 允许在 prompt 内追问式补全（原 `:112` 的语义保留，但不得编造因果）。

### S3 消除 **6 处**漂移源 + 调用方中性化

| 落点 | 改法 |
|---|---|
| `:27` | 「没给 intent ⇒ **首行** `ERROR: missing intent`，**不产出 7 字段 prompt**，可附已机械产出的字段」 |
| `:50`（**模板内注释**，v1 漏网） | 删掉「如 build agent 未给，这里写你的推断 + 显式声明是推断」——这是第五处 intent 可推断的授权，长在模板段，权重更高 |
| `:89`（intent 填法） | 与 S2 一致（不可推断，缺失即 ERROR） |
| `:90`（focus 填法） | 保留推断，注明前缀「推断：」 |
| `:110`（推断边界） | 明确：**可推断 focus，不可推断 intent**；并区分缺失 vs 模糊 |
| `:112`（模糊补全） | 保留并界定：仅限"有但含混"，不得编造因果 |
| `:141`（反模式） | 「猜一个 intent / 留空 ⇒ 反模式；正确做法是输出 ERROR 行停下」 |
| `:197`（**v1 漏网**） | 「focus 字段是 build agent 的责任，不是你的」与 S2 冲突 ⇒ 改为「focus 可推断，但每条必须标「推断：」；intent 永远由调用方给」 |

**调用方中性化**：`:3`（"把 build agent 提供的原始材料"）、`:15-25`（输入示例只写 build agent）、`:89`（"必须问 build agent"）→ 一律改为「调用方」。

### S4 示例补齐 7 字段

`:157-188` 的「你返回」示例补 `## review_profile`（与模板 `:42-82` 同形）。

### S5 文档口径对齐（含 v2 新增的**投递环闭合**）

| 落点 | 改法 |
|---|---|
| `prompts/build.md:114-116` | 「什么时候用 context-builder 而不是手填」→ **只在「diff 很大（>200 行 / 跨多文件）且调用方已想清楚 intent」时用**；其余手填（含脚本骨架） |
| `prompts/build.md:151` | 方式 A 改为「**context-builder（大 diff 搬运）**」，前置：**调用方必须先给 intent**，否则返回 `ERROR: missing intent` |
| `prompts/plan.md:38` | **撤回该条目**（v2 决策，见下） |
| `prompts/plan.md:41` | 撤回 `:38` 后该行「critic 是**条件式**」失去指代对象 ⇒ 改写为「critic 审查归 build / architect，与本 agent 无关」（否则 plan.md 里留下与本规格直接矛盾的句子） |
| `docs/MULTI-AGENT-DESIGN.md:225` 卡片 | 职责改为「**只搬运**（diff / 路径 / review_profile / context）；**不推断 intent**」；补「不再 hidden」；行数更新 |
| `docs/MULTI-AGENT-DESIGN.md:546` / `:569` | 拓扑图注与矩阵注：流程上**只由 build 调用**；权限拓扑上 build/plan 均可调（`ADR-front-knowledge-capability` D2/D4）—— **可达 ≠ 有消费者**，两者不冲突 |
| `docs/MULTI-AGENT-DESIGN.md:558`（plan→critic） | 维持 ❌（不动） |
| `docs/MULTI-AGENT-DESIGN.md:585` / `:600` | 场景表改为「大 diff 搬运 + 先给 intent」 |

**v2 新增决策 —— plan 的投递环**：plan **没有** critic 下游（`MULTI-AGENT-DESIGN.md:551`「plan agent 不需要审稿」、矩阵 plan→critic = ❌、角色矩阵 planner 行的固定审查者是 `metis`）。因此：

- **撤回** `prompts/plan.md:38`（plan 组装的 prompt 没有合法消费者）；
- 矩阵 plan → context-builder 维持 **❌**；
- 「plan → critic 条件 ✅」是**另一个决策**（扩大审查配对），不在本规格范围 —— 登记为 backlog；
- 与刚签批的 `ADR-plan-delegate-engineering-session` **不冲突**：delegate 管 plan 的**可写工程 session**，context-builder 是只读知识 subagent，两条通道正交。

### S6 护栏（`tests/config-guards.test.ts`）

1. `context-builder` **未被 hidden**；
2. description 声明「只搬运 / 不推断 intent / 调用方中性」（`不推断` 关键词 + 不含"build agent"字样）；
3. prompt 含 `ERROR: missing intent` 规则；`:50` 那句推断授权**已消失**；`:197` 不再否定 focus 可推断；
4. 示例段小节数 == 7（含 `review_profile`）；模板段 == 7。

---

## 3. 明确不做

- **不删** agent；不新建第二套组装通道。
- **不放开 plan → critic**（扩大审查配对，属另一个决策）；**不撤** plan 的 `subagent` broad allow（有意设计）。
- **不给** context-builder 加输入契约（tasks 7.4 前置未到）。
- **不改** critic 的 7 字段契约；不动 delegate / plan 派发面。

## 4. 验收判据

| # | 判据 | 证据 |
|---|---|---|
| AC1 | context-builder 出现在「Available subagents」清单 | 配置解析 + `opencode debug agents` |
| AC2 | 缺 intent ⇒ 首行 `ERROR: missing intent`，不产出 7 字段 prompt（可附机械字段） | 文本断言 |
| AC3 | 推断的 focus 带「推断：」前缀 | 文本断言 |
| AC4 | 示例与模板同为 7 字段；`:50` 推断授权已删 | 文本断言（两段小节数 == 7；`:50` 文本不存在） |
| AC5 | build.md / plan.md / MULTI-AGENT-DESIGN.md 口径一致（build 专用 + 先给 intent + 可达≠有消费者） | 文本断言 |
| AC6 | 回归：`bun test tests/` 全绿 + anchors 23/23 | CI 式回归 |

## 5. 残留

- 采纳率是否回升**只能上线后观察**（S1 只去掉一个障碍）；「`ERROR` 行出现频率」是"调用方不给 intent"的先行指标，一并纳入部署后审计。
- plan 侧因此**没有**上下文组装路径（撤回 `:38` 后）—— 若未来 plan 需要审稿，须先决策 plan→critic 配对。

---

## 实施记录（2026-11-13）

| AC | 状态 | 证据 |
|---|---|---|
| AC1 出现在「Available subagents」清单 | ✅ | `opencode debug agents`：`context-builder hidden= False`，描述已是「只搬运，不推断」 |
| AC2 缺 intent ⇒ 首行 `ERROR: missing intent`，不产出 7 字段 prompt | ✅ | prompt 文本 + 护栏断言 |
| AC3 推断的 focus 带「推断：」前缀 | ✅ | prompt 文本（`:90` 填法表 + 头部职责段） |
| AC4 示例与模板同为 7 字段；`:50` 推断授权已删 | ✅ | 护栏断言（两段小节数 == 7；模板内不再含"这里写你的推断"） |
| AC5 三处文档口径一致 | ✅ | 护栏断言（build.md 大 diff + ERROR；plan.md 无 context-builder；MULTI-AGENT-DESIGN「可达 ≠ 有消费者」+「不再 hidden」） |
| AC6 回归 | ✅ | `bun test tests/` = **385 pass / 0 fail**；anchors 23/23 |

**落地文件**：`opencode.jsonc.opencode-go`（去 hidden + description 改写）、`prompts/context-builder.md`（职责收窄 / 6 处漂移源 / 示例补 `review_profile` / 调用方中性化）、`prompts/build.md`（窄条件 + 方式 A 前置）、`prompts/plan.md`（撤回 context-builder + 修 `:41` 悬空引用）、`docs/MULTI-AGENT-DESIGN.md`（卡片 / 拓扑图 / 矩阵注 / 场景表）、`tests/config-guards.test.ts`（2 条新护栏）。

**审查链**：oracle v1 `PASS-WITH-NOTES`（8 条 finding → v2 全部并入）→ critic v2 `APPROVE_WITH_CONDITIONS / mergeable: yes`（3 条措辞级 SHOULD_FIX → 已并入规格 v2.1）。
