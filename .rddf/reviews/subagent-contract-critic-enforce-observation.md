# 观察报告：subagent 输入契约的 critic 灰度（`subagent-contract-critic-enforce`）

- 日期：2026-11-14（**基线冻结日 `t0`**）
- 判据真源：**已归档** `openspec/changes/archive/2026-11-19-subagent-contract-critic-enforce/proposal.md` 的 AC1–AC15
  （原路径 `openspec/changes/subagent-contract-critic-enforce/proposal.md`；**本报告是活文档** —— 复评时在本文件**追加**新节）
- **状态更新（2026-11-19）**：该 change 已**范围切分后归档** —— 块 D（基线 + 初判 + 结论「继续 warn」+ 可机判触发条件）留在原 change；
  块 R（复评）/ 块 E（仅当判 enforce）**原样移交** `openspec/changes/subagent-contract-critic-reeval/`（判据真源仍是上面那份 AC 表）。
- 结论：**继续 warn**（违规侧样本不足：首轮违规 **N = 112 < 150**；观察窗 `t1 − t0 = 0 < 7 天`）
- 触发条件（复评门槛，**可被下一次取数直接重算**）：**累计首轮违规 `N ≥ 150`** 时复评

## §1 基线冻结（AC1）

| 项 | 值 |
|---|---|
| 取数命令 | `bun scripts/audit-subagent-prompts.ts --agent critic --json` |
| 取数时刻 | 2026-11-14（`t0`） |
| `sha256`（audit JSON） | `7f2e43ece1b11a15…`（全文 3.9 MB；需要完整值可重跑同命令比对） |
| `git rev-parse HEAD` | `74f6a9ebf24ebe24…` |
| `git hash-object lib/subagent-contract-core.ts` | `891aff973df196ec398e7ed0eafc275ad4bc4b82`（全文；已用 `git show 74f6a9eb:lib/subagent-contract-core.ts \| git hash-object --stdin` 复现；2026-11-19 复查 HEAD 的该文件 hash **仍等于基线** ⇒ 窗口口径可比） |
| `subagent-contract.json` 的 `mode` | `warn`（全局）+ `agents.critic.mode = warn` |
| 日志 `~/.local/share/opencode/subagent-contract.log` | **存在**；70 行；末次写入 2026-11-14 12:26 |

⚠ 基线**必须冻结**：审计 CLI 的 `--since` 只有下界、库在长大 ⇒ 今天不冻结，将来无法复现「是否达标」。

## §2 四元组与合规率（AC2）

| 量 | 值 | 口径 |
|---|---|---|
| 首轮数 | **349** | `messageIndex === 0` |
| 续接数 | **28** | `messageIndex > 0`（契约引擎对 `isResume` **结构性免检** ⇒ 不计入合规率分母） |
| 首轮违规数 | **112** | `messageIndex === 0 && !evaluation.ok` |
| 续接违规数 | **0** | 同上口径（⚠ `maxChars` 检查不带 `!isResume`，理论上续接轮可计违规 —— 本期为 0） |
| 豁免数 | **79** | `evaluation.exempted === true`（按构造仅首轮） |
| 合规率 | **158 / 349 = 45.3%** | `(首轮 − 首轮违规 − 豁免) / 首轮`（豁免不计入合规；与历史 baseline `143 = 331−110−78` 同口径） |

**两套数**：
- **全量**（上表）：时间跨度 2026-10-15 → 2026-11-14（含 L3 注入上线**前**的调用 ⇒ **不能**当观察期基线）
- **`--since 2026-11-11T00:00:00+00:00`**（注入后子集）：留给复评时计算；本期结论不依赖它（观察窗尚未开始）

## §3 违规侧复核（AC3）

**N = 112（观察窗内全部首轮违规条数，全量复核口径）< 150** ⇒ 结论按 AC3 三选一取 **③「样本不足」**：

- ① 达标（`k = 0` 且 `3/N ≤ 2%`，需 `N ≥ 150`）：**不适用**
- ② 不达标（`k > 0`）：**未复核**（112 条的人工逐条复核留到 N ≥ 150 时与新增样本一并做 —— 避免重复劳动，且当前样本量下 `3/112 = 2.7% > 2%` 的零事件上界本就**不达标**）
- ③ **样本不足（N = 112 < 150）**：**本期结论**
  - 附：`3/112 = 2.7%` 的零事件 95% 上界已 **> 2%** ⇒ 即使 `k = 0` 也**不能**判达标（Rule of Three 的分辨率不足）

## §4 豁免侧（AC4）

**新增豁免数 = 当前 79 − 基线 78 = 1** ⇒ 远低于「≥ 30 条」的抽样门槛 ⇒ **样本不足**（未做误命中复核）。

## §5 mode 快照（AC5）

| 快照点 | `agents.critic.mode` | log 佐证 |
|---|---|---|
| 基线 `t0`（2026-11-14） | `warn` | 日志 70 行，含 `"mode":"warn"`（L3 `injected` info 行） |

（翻档前只有这一个快照点；后续复评点逐次追加。）

## §6 时间跨度（AC6）

`t1`（结论取数时刻）= `t0` ⇒ `t1 − t0 = 0 < 7 天` ⇒ **不满足封闭窗**。
（明确：全量扫描的 `min/max(timeCreated)` = 2026-10-15 → 2026-11-14 **不是**时间跨度证据 —— 那是历史库的自然跨度。）

## §7 趋势（AC15，仅信息项、不作门槛）

暂无可比基线（观察窗未开始）。⚠ 趋势取数**不得**用两次 `--since` 相减（跨会话继承会系统性高估后段违规）—— 正确做法是**跑一次全量 `--json`，本地按 `rows[].timeCreated` 切 7 天 UTC 桶**（半开区间，无 buffer）。

## §8 7.4 契约推广（AC12）

**结论 = 不推广**（评估仅留档）：`oracle` / `metis` 当前没有 7 字段契约范式；审计里它们恒 `ok`（无违规数据可评）。重新开启条件：出现第二个「父模型常漏字段且漏了会出事」的主机。

## §9 结论（AC13 / AC14）

**决策：继续 warn。**

- 差在两项：① **`N = 112 < 150`**（违规侧样本不足，且 `3/112 = 2.7% > 2%`）② **`t1 − t0 = 0 < 7 天`**（封闭窗未开始）
- **触发条件**：**累计首轮违规 `N ≥ 150`** 时复评（`N` 可由「跑一次全量 `--json` 后数 `messageIndex === 0 && !evaluation.ok`」直接重算）
- AC8（投影面同步）/ AC9（回退演练）：决策 = warn ⇒ **N/A（通过）**

## §10 不可逆性声明（AC10，前瞻）

enforce 后：被拒调用**不产生子会话** ⇒ `audit` 的违规率**结构性归零** ⇒ 回退判据**不能**用 audit 报表，只能取 `subagent-contract.log` 中 **`gate=L1` && `level=violation` && `mode=enforce`** 的条数（**排除 `gate=L2`**：该路径 `enforceable:false` 从不拦截）。回退触发：该计数在 enforce 后 7 天内 > 0 且人工复核其中 ≥ 1 条为误拦。

## 复评触发点（2026-11-15 重算，**不提前取数**）

> ⚠ **为什么现在不跑块 R**：R1 会**重算四元组并取一个 `t1`（取数时刻）** ⇒ 提前跑就把
> **封闭窗的终点**提前钉在今天（`t1 − t0 = 1 天`）⇒ 之后永远等不到 7 天窗。
> ⇒ **等到 2026-11-21 之后**再一次性跑块 R（R1–R8，逐条命令见 `openspec/changes/subagent-contract-critic-enforce/tasks.md`）。

**2026-11-15 重算（只数不改窗，不作为 `t1`）**：

| 指标 | 基线（2026-11-14） | 2026-11-15 | 变化 |
|---|---|---|---|
| 首轮数 | 349 | **353** | +4 |
| 续接数 | 28 | 28 | — |
| **首轮违规 `N`** | 112 | **112** | **0** |
| 豁免数 | 79 | 79 | — |
| 合规率 | 45.3% | **45.9%** | ↑（分母涨了 4 个**合规**调用） |

⇒ 新增的 4 次首轮调用**全部合规**（含本轮 oracle/critic 双审：critic 那次带了完整 7 字段契约）
⇒ **契约机制本身有效**（合规路径不产生违规）。

**最早可复评日**：**2026-11-21**（`t0 = 2026-11-14` + 7 天）。到那天的动作：

```bash
cd ~/.config/opencode
# ① 复评（一次跑完 R1–R8；命令清单见 tasks.md 块 R）
#    先重算四元组 + N（数 messageIndex===0 && !evaluation.ok）
bun scripts/audit-subagent-prompts.ts --agent critic --json
# ② 取数当天的 mode 快照 + 封闭窗核对（t1 − t0 ≥ 7×86400×1000）
# ③ 不变量（三文件零改动 + core hash 未变）
git diff --stat <baseline_sha>..HEAD -- lib/subagent-contract-core.ts plugins/subagent-contract.ts scripts/audit-subagent-prompts.ts
# ④ 结论二选一（R8）⇒ 决定是否开 enforce
```

## 本 change 的剩余工作（**2026-11-19 起改为「移交」，不再挂在原 change 上**）

| AC | 状态（2026-11-19 校正） |
|---|---|
| AC1 / AC5 / AC10 / AC12 / AC13 / AC14 | ✅ 本期已满足 |
| **AC2** | ✅ 全量套（D2）｜➡ **`--since` 套移交** reeval（提前取会把封闭窗终点钉死） |
| **AC3** | ✅ **「样本不足」分支**（AC3 文本自带三选一）—— `N = 112 < 150` |
| **AC4** | ✅ **基线差计数**（`79 − 78 = 1` 条新增豁免）｜➡ **≥30 抽样移交** reeval（本期新增仅 1 条 ⇒ 抽不到 30；「新增豁免 < 30」作为合法差项由 AC13② 授权，**不是** AC4 自带分支） |
| **AC6** | ⏳ **封闭窗未开始**（需 `t1 − t0 ≥ 7 天`）➡ 移交 reeval |
| **AC7 / AC11 / AC15** | ⏳ 复评时一并做（不变量 / 回归 / 趋势）➡ 移交 reeval |
| **AC8 / AC9** | ✅ N/A（决策 = warn）｜➡ 移交 reeval（**仅当**后继判 enforce 才适用） |

⇒ ~~**本 change 保持 open**~~ ⇒ **2026-11-19 已切分归档**：复评由 `subagent-contract-critic-reeval` 承担（入场条件可机判三条）；届时按本期冻结的基线（§1）与口径（§2）续算，**不需要重新发明判据**。
