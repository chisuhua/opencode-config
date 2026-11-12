# Architect 复审：oracle 调用意图与 architect 角色的匹配缺口

> 输入：`.rddf/reviews/subagent-oracle-intent-findings.md`（builder 提出，4 条）
> 角色：architect（治理面）
> 日期：2026-11-12
> 结论：**F1 采纳（调整口径）/ F2 采纳 / F3 降级后采纳 / F4 仅记录**。补丁规格见 §3，待 oracle → critic 审稿后实施。

---

## 1. 复核方法（不采信 builder 的结论，重新取证）

| 手段 | 结果 |
|---|---|
| 读 `prompts/build.md` / `prompts/oracle.md` / 配置 agent 段 | 确认 F1/F2/F3 的文本事实成立 |
| 真实库 oracle 子会话（`session_v2` + `session_message`，只读） | 210 个 oracle 子会话；前 400 字符含"审查/复核/裁决/失败模式"等 = **158（75%）**；显式要求 4 节/根因格式 = **148（70%）**；要求判定词（PASS/BLOCK/REJECT/结论）= **98（46%）** |
| 同时调 oracle+critic 的父会话（38 个） | **oracle 先 = 31（81%）**，critic 先 = 7 |
| 治理面 oracle 审查样本（标题或前 300 字含"治理面"，23 个） | 显式要求判定行的 = **17（74%）** ⇒ **6 个治理面审查没有判定要求** |

## 2. 逐条裁定

### F1（builder 判 HIGH）→ **采纳，但把"方向相反"降为"选择歧义"**

- 文本事实成立：oracle 的 description 只说 consultant；critic 的 description 把"目标场景失败模式"揽在自己名下，而 `build.md:418` 把"失败模式 / 边界 / 被否掉的替代方案"划给 oracle。
- **但"清单会把流程带反"不成立**：81% 的父会话仍然 oracle 先行 —— 因为调用方在 prompt 里**自己重述了审查框架**（75% 的 prompt 开头就写"你是只读架构顾问，审查对象=…"）。
- 真正的问题是**冗余与漂移**：审查框架被逐次重述 158 次，措辞各不相同（顾问 / 审稿轮 / 裁决 / 顶刺），输出要求也各写各的。谁先说、谁审什么，全靠调用方记忆。
- **裁定**：改两条 description，把"审什么"写进各自的描述里，消除重叠；不在 build.md 新增章节。

### F2（builder 判 HIGH）→ **采纳（维持 HIGH）**

- 硬证据：23 个治理面审查里 **6 个（26%）没有要求判定行** ⇒ "审过了但拿不到机读结论"，且无任何机制发现。
- 根因是要求写在调用方文档、执行体（oracle）不知道。修订必须落在 `prompts/oracle.md`。
- **裁定**：oracle 的输出契约里加"审查模式的判定行"；咨询模式不写判定行（避免破坏现有用途）。

### F3（builder 判 MED）→ **降级为 LOW，只做半行改动**

- 反证：75% 的 prompt 已经自带审查框架 ⇒ 入口行的"咨询"措辞**没有**导致错误 prompt。
- 实际成本是"每次调用都要重述"，属可维护性问题，不是行为缺陷。
- **裁定**：`:39` 只补一个括号状语（咨询 vs 审查 + 指向「审查配对」），不重写条目。

### F4（builder 判 LOW）→ **仅记录，不改**

- oracle 的 4 节没有 finding 编号/严重度，无法参与 critic 的 BLOCKER 闭合计数。
- 但 46% 的调用已经在要求判定词；加编号会把"顾问"用途的输出拉长。**维持不改**，登记为已知限制。

## 3. 补丁规格（待 oracle → critic 审稿）

### P1 —— 两条 description（`opencode.jsonc.opencode-go`）

```diff
 # oracle
-"description": "Read-only architecture consultant. Advises on architecture decisions and complex debugging without modifying files."
+"description": "Read-only architecture consultant + reviewer. Consult: advises on architecture decisions and complex debugging. Review: adversarial failure-mode review of an ADR/design ship-it decision（会怎么坏 / 边界 / 被否掉的替代方案是否真的更差），输出 4 节 + 判定行。不写代码、不跑测试、不委派。"

 # critic
-"description": "架构与决策审稿 subagent。只审 ADR 一致性 / 关键取舍 / 目标场景失败模式；BLOCKER 严格三选一，结论带 mergeable / scope_exceeded。不写代码、不跑测试、不联网、不委派。"
+"description": "架构与决策审稿 subagent（architect 流程的第二审，在 oracle 之后）。只审**与既有 ADR / 契约 / 已签批决策的冲突**和关键取舍一致性；BLOCKER 严格三选一，结论带 mergeable / scope_exceeded。不写代码、不跑测试、不联网、不委派。"
```

理由：把"失败模式"归 oracle、"冲突/一致性"归 critic，与 `build.md:418` 保持一致；顺序写进 critic 的描述（"在 oracle 之后"）。

### P2 —— `prompts/oracle.md` 增加审查模式的输出契约

在 `## Output` 前加一段模式说明，并在 4 节之后加判定行规则：

```
## 模式
- **咨询模式**（默认）：给建议。
- **审查模式**：输入里出现「审查 / 审阅 / 复核 / 裁定 / 评审」，或对象是治理面改动 ⇒ 必须给判定行。

## Output
（4 节不变）
审查模式下，`建议` 段的**首行**必须是判定行：
- 治理面改动：`治理面判定: PASS | BLOCK | PASS-WITH-NOTES`
- 其他审查：`判定: APPROVE | REJECT`
咨询模式不写判定行。
```

### P3 —— `prompts/build.md:39`（半行）

```diff
-- 需要架构咨询/复杂调试 → `subagent` 工具，`agent: "oracle"`
+- 需要架构咨询/复杂调试 → `subagent` 工具，`agent: "oracle"`（**咨询** = 给问题要建议；**审查** = 给产物 + 判据，输出 4 节 + 判定行 —— 审查形态见「审查配对」）
```

## 4. 验收判据

| # | 判据 | 证据 |
|---|---|---|
| AC1 | 两条 description 不再重叠"失败模式" | `opencode debug agents` + `grep` 配置 |
| AC2 | oracle 的审查模式输出首行有判定行 | 对一处治理面改动实跑一轮 oracle（oracle 自审不适用 → 用独立对象，如本报告 §3 的补丁规格） |
| AC3 | 咨询模式不受影响（不强制判定行） | oracle.md 的措辞显式区分两种模式 |
| AC4 | `:39` 能区分咨询/审查并指向「审查配对」 | 文本检查 |
| AC5 | 不引入第二套判定标准 | 判定行只定义一次（oracle.md），build.md 只引用 |

## 5. 不做

- 不给 oracle 设输入契约（tasks 7.4，critic 仍在 warn 灰度）。
- 不改 oracle 的 4 节结构（F4）。
- 不动 `prompts/critic.md` 的 arch 档判据（本次不涉及）。

---

## 3b. oracle 复审结果与规格修订（v2）

oracle 判定：`治理面判定: PASS-WITH-NOTES`（8 条 finding，逐条处置见 §3c）。**采纳其中 5 条改变形态的建议**，规格修订如下。

### P1（rev）—— 组合 + 排序，不按内容划界

```diff
 # oracle
-"description": "Read-only architecture consultant. Advises on architecture decisions and complex debugging without modifying files."
+"description": "Read-only architecture consultant + reviewer. 对抗式审查时先行（会怎么坏 / 边界 / 被否掉的替代方案是否真的更差），之后由 critic 审与既有 ADR/契约的冲突（见 build.md §审查配对）。咨询：给架构决策与复杂调试建议。不写代码、不跑测试、不委派。"

 # critic
-"description": "架构与决策审稿 subagent。只审 ADR 一致性 / 关键取舍 / 目标场景失败模式；BLOCKER 严格三选一，结论带 mergeable / scope_exceeded。不写代码、不跑测试、不联网、不委派。"
+"description": "架构与决策审稿 subagent。architect 流程里是第二审（oracle 先行）；其他角色直调时独立生效（不要求 oracle 前置）。**主审**与既有 ADR/契约/已签批决策的冲突与关键取舍一致性；oracle 未前置时兼审目标场景失败模式（`prompts/critic.md` 正文的三问题无条件生效，description 只决定主次，不缩小覆盖面）。BLOCKER 严格三选一，结论带 mergeable / scope_exceeded。不写代码、不跑测试、不联网、不委派。"
```

理由（对应 oracle finding #3/#4/#8）：`prompts/critic.md:9-11` 正文本身就把"失败模式"写进三个问题里；description 若删掉会与正文分叉，且让 builder→critic 路径低估覆盖面。改为"组合 + 排序"（oracle 先行、critic 审冲突）+ 兜底（oracle 未前置时兼审）+ 作用域限定（architect 流程 / 其他角色直调独立生效）。

### P2（rev）—— 默认审查档 + 结构判据 + 拿不准按审查

```diff
+## 模式
+- **审查模式（默认）**：输入带产物/判据（文件路径、ADR 号、diff、判据列表）⇒ 按审查输出，必须给判定行。
+- **咨询模式**：仅在输入**只有问题、没有产物也没有判据**时成立 ⇒ 给建议，不写判定行。
+- **拿不准 ⇒ 按审查模式**给判定行（漏判代价远高于多一行）。
+判定行规则：
+- 输入明示"治理面"，或判定对象属治理面 ⇒ `治理面判定: PASS | BLOCK | PASS-WITH-NOTES`
+  （治理面判定见 `prompts/build.md` 作用域表；**含调用方以裸路径引用的情况**：`prompts/**` / `commands/**` /
+  `opencode.jsonc*` / `AGENTS.md` / `docs/MULTI-AGENT-DESIGN.md`，均相对配置目录 —— 裸文件名解析不到是已记录的坑）
+- 其他审查 ⇒ `判定: APPROVE | REJECT`（暂无硬消费方：仅作机读信号，不构成"已通过"的证据）
+- `BLOCK` 必须带引用证据；证据不足 ⇒ `PASS-WITH-NOTES` 并列出未覆盖的判据面（防判定通胀）
```

对应 finding #1/#2/#5/#6：把"关键词命中才审查"翻转成"默认审查、只有纯问答才降级"，并用结构判据（有无产物/判据）而不是措辞；加"拿不准按审查"兜底；治理面词表触发条件写明；加反通胀规则。

### P3（rev）—— 判定规则降格为指针（单一真源）

```diff
 # prompts/build.md:39
-- 需要架构咨询/复杂调试 → `subagent` 工具，`agent: "oracle"`
+- 需要架构咨询/复杂调试 → `subagent` 工具，`agent: "oracle"`（咨询 = 给问题；审查 = 给产物 + 判据 —— 两种模式的输出形态见 `prompts/oracle.md` §模式）

 # prompts/build.md:437-441（治理面判定段）
-（保留词表定义）
+判定词表与触发条件以 `prompts/oracle.md` §模式 为单一真源；本节只保留"判定为 BLOCK 或有未应答 finding ⇒ 不得声称完成"这条流程约束。

 # docs/MULTI-AGENT-DESIGN.md:315（投影文档，与 build.md 同源）
-**治理面 verdict（oracle 无 pass/fail 信号 → 「调用过」≠「通过」）**：oracle 的「建议」段首行须给 `治理面判定: PASS | BLOCK | PASS-WITH-NOTES`；**每条 finding 必须逐条应答**…
+**治理面 verdict（oracle 无 pass/fail 信号 → 「调用过」≠ 「通过」）**：判定行词表与触发条件见 `prompts/oracle.md` §模式（单一真源）；**每条 finding 必须逐条应答**…`BLOCK` 或存在未应答 finding → 不得声称完成。
```

对应 finding #7：避免两处词表漂移。

## 3c. oracle finding 逐条处置

| # | finding | 处置 |
|---|---|---|
| 1 | P1 会让调用方停止重述、而 P2 关键词撑不起 | **采纳**：P2 改默认审查档 + 结构判据 + 兜底；部署后用审计复测 6 个漏判定会话 |
| 2 | 关键词切换是已证伪模式（13.3% 误命中） | **采纳**：翻转默认档 + 结构判据，不用措辞识别 |
| 3 | 删 critic 的"失败模式"与 critic.md 正文矛盾 | **采纳**：保留并加"oracle 未前置时兼审"兜底 |
| 4 | 按内容划界把分类负担推给父模型 | **采纳**：改"组合 + 排序" |
| 5 | 两套判定词要求二次分类 | **采纳**：触发条件写明（明示治理面或路径前缀），通用判定行标注"暂无硬消费方" |
| 6 | 强制判定诱发判定通胀 | **采纳**：BLOCK 必须带证据，否则 PASS-WITH-NOTES + 列未覆盖面 |
| 7 | 判定规则会成两份拷贝 | **采纳**：build.md 降格为指针，oracle.md 为单一真源 |
| 8 | "第二审"作用域可能被误读成全局前置 | **采纳**：限定"architect 流程"，并写"其他角色直调独立生效" |
| — | 自指审查不经独立证据 | **接受**：本审查跑的是旧契约；P2 是否对症由部署后审计裁决（列入 AC6） |

## 3d. 修订后的验收判据

| # | 判据 |
|---|---|
| AC1 | 两条 description 里"失败模式"归属不冲突：oracle 主审、critic 兜底兼审 |
| AC2 | critic description 显式限定"architect 流程第二审"+"其他角色直调独立生效" |
| AC3 | oracle.md 有"模式"段：默认审查 / 纯问答降级 / 拿不准按审查 / 判定行两种词表 / BLOCK 需证据 |
| AC4 | 判定词表只在 `prompts/oracle.md` 定义；build.md 指向它 |
| AC5 | `tests/` 全绿（含 config-guards 的 description 非空断言） |
| AC6 | 部署后审计：对 6 个漏判定会话的父 prompt 复测，确认新默认档能给出判定行 |
| AC7 | `tests/config-guards.test.ts` 增一条护栏：agent description 的能力关键词与其 prompt 文件有交集（防"description 声称的能力 prompt 里不存在"） |

## 3e. critic 复审处置（BLOCKER 1 + SHOULD_FIX 2 + NIT 1）

| 条目 | 处置 |
|---|---|
| **BLOCKER** `docs/MULTI-AGENT-DESIGN.md:315` 持有第三份词表规范性定义 | **已修**：P3 rev2 增加该处的降格（保留"调用过 ≠ 通过"原理与逐条应答规则，词表移除）；AC4 才成立 |
| SF1 触发条件按字面会欠触发（裸路径） | **已修**：P2 触发条件补裸路径清单（含已记录的"裸文件名解析不到"坑） |
| SF2 critic description 作用域窄于 `critic.md` 正文 | **已修**：「只审」→「主审」+ 显式声明"description 只决定主次，不缩小覆盖面" |
| NIT description↔prompt orphan 护栏 | **采纳为 AC7**（实施时加 config-guards 断言） |

---

## 6. 实施记录（2026-11-12）

审查结论：oracle `PASS-WITH-NOTES`（8 条，逐条处置见 §3c）→ critic `REJECT`（1 BLOCKER：`docs/MULTI-AGENT-DESIGN.md:315` 第三份词表）→ 修（§3e）→ 复审 `APPROVE / mergeable: yes`。

已落地的文件：

| 文件 | 改动 |
|---|---|
| `opencode.jsonc.opencode-go` | oracle / critic 两条 description（P1 rev） |
| `prompts/oracle.md` | 新增「模式」段 + 判定行规则 + BLOCK 需证据（P2 rev） |
| `prompts/build.md` | `:39` 半行；判定段降格为指针（P3 rev2） |
| `docs/MULTI-AGENT-DESIGN.md` | `:315` 降格为指针（critic BLOCKER 闭合） |
| `tests/config-guards.test.ts` | 新增 2 条守卫：description 分工非 orphan、判定词表单一真源（AC7 + AC4 回归） |

AC 状态：

| AC | 状态 | 证据 |
|---|---|---|
| AC1 分工不冲突 | ✅ | `opencode debug agents`：oracle 含"review/审查先行"，critic 含"主审冲突 + oracle 未前置兼审" |
| AC2 审查模式首行判定 | ✅（首次真实调用已验证） | `metis.md:31` 措辞复审（2026-11-12，session `ses_e30e030d8ffedRG5SYJfZD0Cdl`）：对象属治理面 + 带产物路径/判据 ⇒ 输出首行即 `治理面判定: PASS-WITH-NOTES`，并引用 `prompts/oracle.md:42-52` 的新模式段 —— 证明新模式段已生效。**AC6 的全量审计（6 个原漏判定会话）仍待做** |
| AC3 咨询模式不受影响 | ✅（文本） | `oracle.md` §模式 显式区分；咨询不写判定行 |
| AC4 词表单一真源 | ✅ | `grep "治理面判定: PASS\|PASS-WITH-NOTES"` 只剩 `prompts/oracle.md`；守卫测试钉住 |
| AC5 tests 全绿 | ✅ | 359 pass / 0 fail |
| AC6 部署后审计 | ⏳ **待做** | 复测原 6 个漏判定会话的父 prompt（`audit-subagent-prompts.ts` 思路） |
| AC7 orphan 护栏 | ✅ | `tests/config-guards.test.ts` 两条新断言 |

**已知限制**：`prompts/critic.md` 正文的三问题无条件含"失败模式"，与新 description 的"oracle 未前置时兼审"存在**文字上的宽窄差**。处置：description 写"主审"并显式声明"description 只决定主次，不缩小覆盖面" —— 不改正文（本轮范围外，且正文的覆盖面是 critic 契约的一部分）。
