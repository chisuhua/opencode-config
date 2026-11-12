# subagent 输入契约 —— 豁免误命中抽样与收紧报告

> 对应 task：`openspec/changes/subagent-input-contract/tasks.md` 7.2
> 日期：2026-11-12
> 结论：**误命中率 13.3%（12/90）> 阈值 10% ⇒ 已收紧豁免判据**，收紧后误命中清零（已复核 78 条真豁免全部保留）。
> 判据来源：`openspec/changes/subagent-input-contract/proposal.md` AC6 + tasks 7.2。

---

## 1. 方法

| 项 | 值 |
|---|---|
| 数据源 | `~/.local/share/opencode/opencode.db`（`session_v2` + `session_message`，真实运行时库） |
| 判定逻辑 | 与运行时同一份 `lib/subagent-contract-core.ts`（`evaluateChain`） |
| 样本 | **全部 90 条豁免**（不是抽 20 条 —— 全量分类成本更低、结论更强） |
| 复核方式 | 逐条读 prompt 开头 400 字符 + 关键词/上一轮引用的**命中位置**，人工判定"是真复审轮还是新评审" |
| 工具 | `bun scripts/audit-subagent-prompts.ts --agent critic` |

判定口径：**真豁免** = 本次任务就是"核对上一轮的 finding 是否闭合"；**误命中** = 本次任务是**新评审**（新对象 / 首次审 / 另一批改动），只是 prompt 文本里碰到了关键词或继承了上一轮的"复审模式"。

## 2. 误命中清单（12 条）

分两类。

### 2.1 关键词命中在后半段模板（3 条）

关键词出现在**输出格式 / 约束说明**里，描述的是"规则本身"而非本次任务：

| session | 命中位置 | 原文片段 | 判定 |
|---|---|---|---|
| `ses_ebafcbfc5ffeg9fARksmp5o7hE`（Review gem5 ruby research docs） | 1634 | 「不需要复审代码（这是 research 文档，不入 openspec 契约）」 | 新评审（首轮审 4 份调研文档） |
| `ses_eb5ec9b11ffekFWDDzWXTIAdrY`（审稿 ADR-090/091/092） | 1958 | 「会被 critic 复审时升级为 BLOCKER」（SHOULD_FIX 定义段） | 新评审（3 份刚起草的 ADR） |
| `ses_e5622962affe0hyehHqBXY1scA`（CEP 架构决策审稿） | 5377 | 「不要要求复审上一轮没提的部分；只判本轮增量」 | 新评审（Entry #218~#223 增量） |

### 2.2 跨对象继承"复审模式"（9 条）

同一父会话里连着审**不同对象**，上一轮的"复审模式"被无差别继承：

| session | 继承自 | 开头（判定依据） |
|---|---|---|
| `ses_eb5ea0da2ffeSpIBPPAJHUPqN8` | ADR-090/091/092 批次 | 「任务：对抗式审稿 ChipForge 项目**新起草的** 3 份 TileCore 架构决策文档」 |
| `ses_eb5e50a5dffe7re39Cq60XxqaM` | 同上 | 「任务：审稿 **1 份** ChipForge TileCore ADR 草案」 |
| `ses_eb5e50a47ffem2d0CCAkdzyPFg` | 同上 | 同上（ADR-091） |
| `ses_eb5e50a04ffesM2kb0XKEvuAgz` | 同上 | 同上（ADR-092） |
| `ses_e8f56d390ffe4kiCmCQk75XFLG` | S2 Task 1/4 | 「请审 commit `d202f71`（change `chmem-bp-btb-gshare-poc` 的 Task 1 + Task 4）」 |
| `ses_e8c44f032ffe70Vtcl1750MAEk` | 前置 change | 「这是 change `rv32i-pipeline-commit-path-2026-10` 的**首次对抗审稿**」 |
| `ses_e899fb4f4ffe7FcrzwlZ2X7z7Q` | C3 | 「change `rv32i-soc-dual-parity-2026-10` 的收官审稿」 |
| `ses_e56337e08ffeQKfmqCWMRu3L3u` | 治理面上一批 | 「本批只改 `docs/MULTI-AGENT-DESIGN.md`（新增 §2.8 …）」 |
| `ses_e5606b8c5ffeoSBIxsUkGAXmTt` | 治理面上一批 | 「本批 3 个文件：`opencode.jsonc.opencode-go`（治理面 provider 段）…」 |

## 3. 误命中率

- 误命中 **12 / 90 = 13.3%** > 任务设定阈值 **10%** ⇒ 按 tasks 7.2「再收紧关键词或调整 `exemptMinMissing`」处理。
- 对照：若只看关键词路径（3 条）误命中率仅 3.3%，**跨对象继承才是主要漏面**（9 条）—— 只调 `exemptMinMissing` 无法解决，必须给继承加前置。

## 4. 收紧方案（已实施）

**依据的实测数据**：90 条豁免里，关键词/上一轮引用的命中位置分布为 —— 真豁免全部落在 **47–231** 字符；误命中全部落在 **1194–5377** 字符（中间 231→1194 是空档，区分度极大）。

| # | 收紧项 | 实现 | 拦住的误命中 |
|---|---|---|---|
| ① | **豁免只看任务陈述区**（prompt 开头 400 字符） | `lib/subagent-contract-core.ts`：`exemptWindow`（缺省 `EXEMPT_KEYWORD_WINDOW_CHARS = 400`）；关键词与继承前置**共用**该窗口 | 2.1 全部 3 条 + 2.2 中 `ses_e5622962` |
| ② | **继承前置：本轮自己必须引用上一轮** | 新增 `ContractRule.inheritIf`（critic 规则：`上一轮 / 上轮 / 前 N 轮 / 第 N 轮 / 二三四轮 / rev.N / 闭合 / closure / 本轮修复 / 本轮增量`），命中失败即视为**新评审** | 2.2 其余 9 条 |

被拦下的 12 条现在**全部判为违规**（`missing-sections`）—— 它们确实缺 7 字段，只是之前被误放行。

## 5. 效果

| 指标 | 收紧前 | 收紧后 |
|---|---|---|
| critic 调用总数 | 331 | 331 |
| 违规 | 98 | **110**（+12 = 上面被纠正的误豁免） |
| 豁免 | 90 | **78**（−12） |
| 合规（7 字段齐备） | 143（43.2%） | 143（43.2%，不变） |

> 合规率**不变**是预期的：那 12 条不是"变合规了"，而是从"被误放行"变成"如实报违规" —— 统计口径上它们本来就没满足契约。收紧改变的是**豁免区**的纯度，不是合规面。

真豁免**零误伤**复核（逐条比对收紧前后差集）：12 条被翻转的全是误命中；保留下来的 78 条全部是"核对上一轮 finding 是否闭合"的真复审轮，含
`ses_e45b00cfaffe9dIP8pZg7BNCt1`（critic 复审 BLOCKER 闭合，关键词在 47 字符处）、
`ses_ebe0fa0fbffewoLtSh9UVb8MXw`（最终验收，"前 3 轮" 在 127 字符处，继承豁免）、
`ses_e8ea316a3ffezekHDeA2bFWBuM`（审 S2 本轮修复，"上一轮" 在 171 字符处，继承豁免）。

## 6. 验证

- `bun test tests/` → **356 pass / 0 fail**（core 40 / audit 8 / config-guards 17；新增用例：关键词窗口外不豁免、继承无上一轮引用不放行、继承有引用放行、describeContract 暴露窗口与前置）
- `bash scripts/check-upstream-anchors.sh --quiet` → **23/23**（本次改动不触碰宿主契约，A13/A13b 不受影响）
- `bun scripts/audit-subagent-prompts.ts --agent critic` → 110 违规 / 78 豁免（与本报告一致）

## 7. 残留与边界（不掩盖）

1. **窗口是启发式**：真复审轮若把"上一轮"写在 400 字符之后（例如前面塞了大段背景），会被误判为新评审 → 报缺小节。代价是"误拦一次 + 让模型重发"，可接受；反向误放行（本报告要消灭的那类）代价更大。
2. **继承仍无对象级校验**：只要求"引用上一轮"，不校验"上一轮的对象 = 本轮的对象"。若同一父会话里连续审两个对象、且第二个 prompt 明写"上一轮"，仍会被继承放行（当前语料 0 例）。
3. **模板化措辞仍可能泄漏**：像"不要要求复审上一轮没提的部分"这种**固定尾注**出现在任务陈述区之外才被窗口挡住；若它出现在开头，仍会命中。
4. **live 未复验**：本次改的是纯逻辑内核，插件在会话启动时静态 import `lib/subagent-contract-core.ts` ⇒ **本会话内的运行时仍是旧规则**，新规则从下一个会话生效。审计 CLI（每次运行重新加载模块）已按新规则给出上表数据。

## 8. 未做 / 后续

| task | 状态 | 说明 |
|---|---|---|
| 7.1 灰度观察 | **待时间** | 需默认 warn 跑满一周。观察命令已就绪：`bun scripts/audit-subagent-prompts.ts --agent critic --since <日期>`；判据 = 违规率与豁免误命中率（用本报告的口径复核）。当前基线：违规 110 / 豁免 78 / 合规 143（43.2%）。 |
| 7.3 L0 备选 | **不做**（用户已拍板） | 结构化子工具本期明确不做；仅当 enforce 后的"拒绝→重发"token 成本不可接受才重开。 |
| 7.4 契约推广 | **条件未到** | critic 尚未开 enforce（默认 warn）；oracle / metis 没有 7 字段契约，收益形态不同。等 7.1 数据出来再单独评估。 |
