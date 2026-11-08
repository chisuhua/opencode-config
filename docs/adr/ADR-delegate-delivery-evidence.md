# ADR-delegate-delivery-evidence：delegate 引入交付面证据与 `unverified` 结果

## 元数据

| 字段 | 值 |
|------|-----|
| Status | Accepted（2026-11-09，用户拍板；oracle+critic 双审完成，0 未闭 BLOCKER）。**实现待落地**：D3.1 的 8 项迁移清单须同 patch 完成 |
| Date | 2026-11-09 |
| Author | architect |
| Parent | **部分取代** `.rddf/state/adr-front-agent-redesign.md` D2 的 outcome 枚举（`succeeded\|failed\|interrupted\|unknown` 一处作废）：**目标枚举**为 `succeeded\|unverified\|failed\|interrupted\|unknown\|busy`（`busy` 是此前实现先行漂移进来的，旧 D2 的枚举早已 stale，本次一并校正）；该篇 D2 的 baseline 校验、不回传 transcript 等其余条款继续有效。与 `ADR-front-knowledge-capability`：**决策面正交**，但 ledger schema 面有单点耦合（该篇 D5 的 outcome 枚举需同步补 `unverified`/`host_outcome`） |
| 关联 change | `backlog: delegate-delivery-evidence`（planner 立项后回填） |
| AC 映射 | 待立项后回填（本文件 Verification 1–6 为候选判据） |
| 审稿报告 | 待收口时写入 `.rddf/reviews/adr-delegate-delivery-evidence-review.md` |

## 背景与问题

`delegate` 的 `outcome` 直接取宿主返回的 run 结果。但**宿主说 succeeded ≠ 工程 session 真的交付了东西**。

实测（E2E 真实会话，2026-11-09）：工程 session 在模型于 run 中途被切换后重来，只读了一次 `role.json` 就输出角色开场白并 idle；宿主仍把该 run 记为 `succeeded`，`changed_files=[]`。delegate 于是回传 `succeeded`，front 向用户转述"已完成"——**静默失败**。

第一版修复只加了标志位 `no_work_evidence`，防御依赖 front 遵守 prompt（"标记为 true 时不得说完成"）。这与本项目"**权限层为主要强制点、prompt 是第二道防线**"的既有原则有张力：任何不遵守 prompt 的消费者（或未来的第二个 front）读 `outcome=succeeded` 仍会误报。

同时，交付面证据的统计口径本身有三处必须写死的约束（本轮实现已被 oracle/critic 压测过）：**只看本轮**（resume 时历史调用会掩盖本轮零交付）、**仍在跑不判定**（超时/无 outcome 时可能读到陈旧值）、**artifacts 是 git 可见口径**（被忽略/工程根外/worktree 内的改动数不到）。

## 决策

**主决策**：`delegate` 在"宿主报成功但无交付证据"时，把 `outcome` **机读化**降级为 `unverified`，同时在摘要里保留宿主的原始值 `host_outcome`；交付证据以结构化字段随行，front 不得把 `unverified` 转述为完成。

### D1 新增结果值 `unverified`

| `outcome` | 语义 | 谁产生 |
|---|---|---|
| `succeeded` | 宿主报成功，且**不满足 D2 的全部判定条件**（有交付证据，或无法判定为无交付） | 宿主 + delegate 复核 |
| **`unverified`** | **宿主报成功，但本轮没有任何可验证的交付证据**（见 D2） | delegate |
| `failed` / `interrupted` | 宿主报失败 / 被中断 | 宿主 |
| `unknown` | 无新活动（不得采信旧 outcome）。**无新活动时 `unknown` 优先于 `unverified`** | delegate |
| `busy` | 目标 session 上一次运行未结束，拒绝排队 | delegate |

- `unverified` **只用于"宿主 succeeded + 无交付证据"**；不覆盖 `failed`/`interrupted`/`unknown`/`busy`。无新活动时先判 `unknown`（`unverified` 的前提是有活动）。
- 摘要新增 `host_outcome` 保存宿主原值，便于排障与审计（`unverified` 时它恒为 `succeeded`）。
- 消费方契约：`unverified` **不得**当作完成；front 必须转述"**没有可验证的交付证据**"（不是"没有产出"——后者对"产物在 git 视野外"是过度断言），并报出证据字段（`write_tool_calls` / `artifacts` / `model_switched`），问用户重试或换做法。

### D2 交付面证据（判定 `unverified` 的唯一依据）

```
host_outcome == "succeeded"
&& kind == "engineering"                     // 知识 session 的产物本就是"回答"
&& !still_running                            // 仍在跑不判定（见 D2.2）
&& (final_is_role_opening || model_switched > 0)   // "停住"信号
&& write_tool_calls == 0                     // 没有写盘类工具调用
&& artifacts == 0                            // 没有 git 可见的本轮变更
```

字段与口径：

| 字段 | 口径 |
|---|---|
| `final_is_role_opening` | 最后一条 assistant 文本停在角色开场白（`【角色:` / `【角色：`）。**辅助信号** |
| `model_switched` | 本轮窗口内出现宿主消息 `type == "model-switched"`。**根因信号**，不依赖文本格式 |
| `write_tool_calls` | 写盘类工具调用数：`edit`/`write`/`patch`/`apply_patch`/`multiedit`。**shell 不算**（无法从命令文本判定落盘） |
| `artifacts` | 本轮 `git status` 差集的文件数。**git 可见口径**：`.gitignore` 内、工程根外、worktree 子工作区的改动都数不到 |
| `still_running` | wait 超时 或 宿主未给 outcome |

**D2.1 只看本轮**：判定入参必须是按 baseline 切片后的消息（`sliceRoundMessages`）。否则 resume 时上一轮的写盘调用会掩盖本轮零交付——而 resume 正是 front 推荐用户使用的路径。找不到 baseline（消息被压缩/清理）时退回全量（宁可漏报不误报）。

**D2.2 仍在跑不判定**：`session.wait` 超时分支会正常 resolve（不是抛错），此时 `outcome` 可能是**上一轮的陈旧值**；据此判"没有产出"会对一个仍在跑的 session 误报。因此 `still_running` 为真时不降级、不判定。

### D3 标志位保留

`no_work_evidence` 继续存在（= D2 判定为真），作为**证据字段**与 `unverified` 并存：`outcome` 回答"这次委托的结果可不可信"，`no_work_evidence` 回答"为什么不可信"。两者恒同真同假，但语义不同，不要用一个替代另一个。

### D3.1 迁移清单（同一 patch 内原子完成，不允许中间态）

枚举新增值属**契约变更**：实现改了而消费方没改，就会把 `unverified` 当未知值处理——正是本篇要消除的那类静默失败。以下 7 项**必须同 patch 落地**（与 `ADR-front-knowledge-capability` D3 的"顺序铁律"同级）：

| # | 消费方 | 位置 | 需要的改动 |
|---|---|---|---|
| 1 | 实现（**两个写入点**） | `lib/delegate-core.ts`：`execute` 的 summary 构造 **+** ledger append | summary：`no_work_evidence=true` 时 `outcome="unverified"` 并输出 `host_outcome`；**ledger append 同样增记 `host_outcome`**（与 summary 是两个写入点，必须都改） |
| 2 | front prompt | `prompts/front.md`：outcome 枚举段、`no_work_evidence` 段（现有"outcome 仍可能是 succeeded"措辞失效）、§五 禁止事项、§六 排障表 | 加 `unverified` 行；转述措辞改"没有可验证的交付证据" |
| 3 | 使用手册 | `docs/front-delegate-usage.md` 的 outcome 表与"无 outcome 字段"行（并核对"6 种 `outcome`"的计数） | 同上 |
| 4 | 架构文档 | `docs/front-delegate-architecture.md` §6.7（交付面证据段） | 说明 outcome 改写 + `host_outcome` |
| 5 | **双 session 手册** | `docs/dual-session-delegation.md` 的 outcome 枚举表与排障行 | 补 `unverified`（front 是读文档的 LLM，漏改即中间态） |
| 6 | CHANGELOG | `docs/CHANGELOG.md` 现有 v2.6 段的"**outcome 枚举不变**"一句 | **不改历史**：加增补记录说明枚举已扩展（保持审计链） |
| 7 | ledger schema | `ADR-front-knowledge-capability.md` D5 的 outcome 枚举与行产生时机表 | 补 `unverified`；行增记 `host_outcome` |
| 8 | 测试 | `tests/delegate-tool.test.ts`（现有 `outcome==="succeeded"` 断言）、`tests/README.md` | 正常交付仍断言 `succeeded`；新增 `unverified` 与 `host_outcome` 断言；E2E L2-3 断言正常交付不得为 `unverified` |

### D4 不做的事

- **不改宿主语义**：不在宿主侧改 run 结果；`unverified` 是 delegate 层的**契约结论**。
- **不猜模型意图**：不分析"我无法完成"这类文本，不静态分析 shell 命令判断是否落盘。
- **不自动重试**：`unverified` 交给用户决定重试还是换做法（delegate 不替用户拍板）。

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **`outcome="unverified"` + `host_outcome`（选中）** | 采用 | 机读化，不遵守 prompt 的消费者也无法误报；`host_outcome` 保留宿主原值，排障不丢信息；不改变宿主语义 |
| 只加标志位 `no_work_evidence`（第一版） | 否决 | 防御落在 prompt 层；`outcome=succeeded` 仍可被误读为完成——与"权限层为主"的原则相悖 |
| 复用 `outcome="unknown"` | 否决 | `unknown` 已被"无新活动"占用，front 的排障语义是"可重试一次"；复用会让两种完全不同的失败混为一谈 |
| 直接把 `succeeded` 改写成 `failed` | 否决 | agent 可能确实做了工作而产物在 git 视野外（被忽略/工程根外）；判"失败"过度断言，`unverified` 才是准确语义 |
| delegate 自动重试 | 否决 | 越权替用户拍板；且失败原因可能持续（额度），重试只烧预算 |

## 后果 / 代价

**正面**

- "宿主说成功但没交付"从**静默**变成**机读可见**，不再依赖任何 prompt 的自觉。
- `host_outcome` + 证据字段让排障有据（是"没干活"还是"干了但产物不可见"）。
- 判定规则是纯函数、可单测，且有真实失败会话的回归夹具。

**负面 / 代价**

- `outcome` 枚举多一个值：**所有消费方都要更新**（front prompt、使用手册、未来任何读 summary 的代码）。漏改一处就会把 `unverified` 当未知值处理。
- `artifacts` 的 git 可见口径会**漏报**"产物在工程根外/被忽略"的交付 → `unverified` 可能误标（已由 D2.2 与"仍在跑不判定"部分缓解，但口径失真不可根除）。
- 判定依赖宿主消息 `type == "model-switched"`：上游若改该消息类型，根因信号失效，只剩开场白辅助信号（回归测试会暴露）。

**风险**

- **已知误报形态（有意保留，不修）**：shell 写 `git` 可见之外的文件（`.gitignore` 内、工程根外、worktree 内）**且**以角色开场白收尾 → 会被判 `unverified`（`artifacts=0`、`write_tool_calls=0`、`opening=true`）。不加"有 shell 写迹象就不判"的原因见选项表：正面计数 shell 会让检测器几乎永不触发，静态分析 shell 文本不可完备。
- 若有别的 agent 复用 `delegate` 且其"正常结束"也以角色开场白收尾，会被误标 `unverified` → 需在接入时校验；当前只有 front 使用。
- `write_tool_calls` 把 shell 排除在外，靠 `artifacts` 兜底；两者同时失真时（shell 写到 gitignore 内）会误标（同上）。

## Verification（可勾选验收判据，前瞻）

- [ ] 宿主 `succeeded` + 本轮零交付（真实失败会话夹具回放）→ `outcome="unverified"`、`host_outcome="succeeded"`、`no_work_evidence=true`。
- [ ] 正常交付（有写盘调用或产物）→ `outcome="succeeded"`、`host_outcome="succeeded"`、`no_work_evidence=false`。
- [ ] 知识 session（`kind=knowledge`）即使零工具调用也不得判 `unverified`。
- [ ] resume 一个历史含写盘调用的 session、本轮仅开场白 → 仍判 `unverified`（时间窗生效）。
- [ ] wait 超时 / 宿主未给 outcome（`still_running=true`）→ **不**判 `unverified`。
- [ ] ledger 行同时记录 `outcome` 与 `host_outcome`；front 的 outcome 枚举表包含 `unverified` 且明确"不得当完成"。
- [ ] **迁移清单 7 项同 patch 完成**：`docs/CHANGELOG.md` 的"枚举不变"旧句以**增补记录**方式校正（不改历史），且 `prompts/front.md` 的枚举表与排障表均含 `unverified`、`no_work_evidence` 段的"outcome 仍可能是 succeeded"措辞已更新。
- [ ] **已知误报形态（文档化判例，不修）**：shell 写 git 可见之外的文件（`.gitignore` 内 / 工程根外）+ 开场白收尾 → 判 `unverified`。这是 D2 口径失真的**有意边界**，不是漏网；改判定链时不得因此加"有 shell 就不判"（见选项表）。

