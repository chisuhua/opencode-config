# subagent-contract-critic-enforce — subagent 输入契约的灰度观察与推广决策

> 输入：`.rddf/improvements/subagent-contract-critic-enforce.md`（5 段草稿，metis 1 轮审后修订；**机制细节以该文件为准，本 proposal 只保留决策与判据，不复制**）
> 决策依据：`openspec/changes/archive/2026-11-13-subagent-input-contract/`（原 change，已实施）+ `.rddf/reviews/subagent-contract-exemption-sampling.md`（违规侧误判的判定口径见其 §2 与 §5；对应残留记录在 §8 的后续任务表）
> 来源：原 change 的遗留项 **7.1 灰度观察** + **7.4 契约推广**（两者前置未到 ⇒ 转本 change）
> 性质：**观察 + 配置决策 + 文档同步**，无契约引擎代码改动
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在 ⇒ 走**内置流程**。

## Why

`subagent-input-contract` 的实现早已完成，但其 tasks.md 留了两条**决策尾巴**（7.1 灰度观察、7.4 契约推广）—— 前置未到 ⇒ 一直挂着。本 change 的价值有三层：

1. **账本清洁**：给两条尾巴一个可追的落点（从已归档 change 的 tasks 迁出）。
2. **冻结证据**：判据的数据一旦不在当天冻结就**不可复现**（审计 CLI 的 `--since` 只有下界、库在长大）⇒ 现在不冻结，将来无法判「是否达标」。
3. **门槛需要重新定义**：原 7.2 的阈值是 **10%**（`.rddf/reviews/subagent-contract-exemption-sampling.md`），7.1 **从未定义数值门槛**；且原措辞「误命中率 ≤ 2%」量的是**豁免侧漏放**，而 enforce 的真实伤害来自**违规侧误判**（合法复审被硬拒）⇒ 门槛的主指标选错了，本 change **首次定义**门槛。

已知事实（收紧后基线 2026-11-12）：critic **331** 次调用 / 违规 **110** / 豁免 **78** / 合规 **143**。⚠ **口径修正**：331 是**首轮 + 续接**的计数，而续接轮在契约引擎里**结构性免检**（`lib/subagent-contract-core.ts` 对 `isResume` 直接令 `missing = []`）⇒ 合规率分母应为**首轮数**。

## What Changes

### A. 冻结基线与口径（今天就能做）

把 `bun scripts/audit-subagent-prompts.ts --agent critic --json` 的**完整输出**（或输出文件路径 + `sha256`）连同取数时刻、`git rev-parse HEAD`、`git hash-object lib/subagent-contract-core.ts`、`subagent-contract.json` 当时的 `agents.critic.mode` 写进观察报告 §1；另记录 `test -f <subagent-contract.log>` 的结果、`wc -l` 与首/末行 `at`（**日志不存在 ⇒ AC10 的回退判据标为「不可用」并说明原因**）。

### B. 四元组与合规率（分母 = 首轮数）

报告从 `--json` 的 `rows` 派生：**首轮数** = `messageIndex===0` 的行数；**续接数** = `messageIndex>0` 的行数；**首轮违规数** = `messageIndex===0 && !evaluation.ok`；**豁免数** = `evaluation.exempted===true`（按构造仅首轮）。
**合规率 = (首轮数 − 首轮违规数 − 豁免数) / 首轮数**（豁免不计入合规；与 baseline 143 = 331−110−78 同口径）。
⚠ 续接轮的 `maxChars` 仍生效 ⇒ 一条超长续接轮会被计为违规 ⇒ **首轮违规数与续接违规数分开报**。
同时给出**全量**与 `--since 2026-11-11T00:00:00+00:00`（显式 UTC 偏移）两套数 —— 观察期只与后者比（331 的全量含注入前调用，当基线会让趋势天然向好）。

### C. 违规侧抽样（enforce 的真实风险面）

**N = 观察窗内的全部首轮违规条数（全量复核，非抽样）**；k = 其中「确为合法复审轮被误拦」的条数。
**判定式（口径见 `subagent-contract-exemption-sampling.md` §2 与 §5；残留记录见其 §8 表）**：该首轮 prompt 的任务陈述确为「核对上一轮 finding 是否闭合」，仅因引用落在 400 字符窗口之后、或措辞未命中 `inheritIf` 而被判 `missing-sections`。
**结论三选一**：① `k=0` 且 `3/N ≤ 2%`（`N ≥ 150`）⇒ 达标；② `k>0` ⇒ **不达标**（`3/N` 是**零事件**二项比例的 95% 上界（Rule of Three），`k>0` 时不适用）；③ `N < 150` ⇒ **样本不足**。

### D. 豁免侧抽样

**新增豁免数 = 当前豁免数 − 基线豁免数（78）**；新增豁免抽样 ≥ 30 条且误命中 0 条。
⚠ `3/30 = 10%` 的 95% 上界 ⇒ **30 条只证明「≤ 10%」，是冒烟下限，不是 2% 精度检验**；若要与违规侧同精度需 ≥ 150（否则该门槛与违规侧门槛的严谨度不可比，须在报告注明）。

### E. 决策落档（结论必须二选一，不留「还在观察」）

- **开 enforce**（`agents.critic.mode = enforce`，**全局 `mode` 仍为 `warn`**）：同步**投影面** ——
  `docs/MULTI-AGENT-DESIGN.md:511` 保留「默认 **warn**」**并追加**「critic 已通过 `agents.critic.mode` 覆盖为 enforce」；
  `commands/critic-review.md:55` 把「默认 `warn` 只记日志」改为「critic 当前为 `enforce`（全局默认仍 `warn`）」。
  **回退演练**：改回 `warn` → 跑一次 live 调用确认不再被拒 → 记录。
- **继续 warn**：报告 §结论 写明「差在哪一项」（`k>0` / `N<150` / 新增豁免 < 30），并给出**可被下一次取数直接重算的触发条件**（形如「累计首轮违规 `N ≥ 150` 时复评」）—— **禁止**日期或「形态稳定 / 观察充分」这类不可算措辞。

### F. 趋势（**仅信息项，不作门槛、不设「连续 3 桶」判据**）

取数口径：审计 CLI 的 `--since` 只过滤**子会话**，且同父会话的状态继承依赖更早的子会话被同时纳入 ⇒ **两次 `--since` 相减不是分区**（违规/豁免数不可相减，会系统性高估后段违规）⇒ **跑一次不传 `--since` 的 `--json` 全量**，在本地按 `rows[].timeCreated` 切桶（`rows` 已在 JSON 中，不需要 `--until`）；桶宽 7 天、边界统一 `+00:00`（UTC）、半开区间 `[t, t+7d)`；桶内首轮数 = `messageIndex===0` 的行数。
⚠ 审计的继承无 TTL，而运行时 gate 的继承有 30 分钟 TTL ⇒ 审计的豁免数可能高于线上实际豁免量 ⇒ 用审计违规数当 enforce 误拦面分母，与真实拦截行为**不完全同构**，须在报告注明。

### G. 7.4 收口（结论预定为**不推广**，评估仅用于留档）

`oracle` / `metis` 当前**没有** 7 字段契约范式 ⇒ 审计里它们恒 ok（无违规数据可评）⇒ **本 change 的 7.4 结论 = 不推广**；评估只留档：以窗口内 `--agent oracle` / `--agent metis` 的调用次数与 prompt 形态为依据（调用次数 < 10 ⇒ 「无足够样本」；≥ 10 且形态稳定 ⇒ 「已有等效范式（metis 的 5 段输入 + 6 节输出），缺的是 enforcement 的必要性」），**两条分支都关闭**。重新开启条件写死：出现第二个「父模型常漏字段且漏了会出事」的主机。

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | 报告 §1 含基线 `--json` 原文（或文件路径 + `sha256`）+ 取数时刻 + `git rev-parse HEAD` + `git hash-object lib/subagent-contract-core.ts` + 当时的 `agents.critic.mode` + **日志存在性/行数/首末 `at`** | 结构 | `.rddf/reviews/subagent-contract-critic-enforce-observation.md` |
| AC2 | 报告给出**四元组**（首轮数 / 续接数 / 首轮违规数 / 豁免数）+ 合规率分子公式 `(首轮 − 首轮违规 − 豁免) / 首轮`；**每个 AC5 快照点各给两套**（「全量」与「`--since 2026-11-11T00:00:00+00:00`」） | 结构 | 同上 |
| AC3 | 报告含违规侧复核表：**N = 观察窗内全部首轮违规条数（全量复核，非抽样）**、k = 误判条数（判定式见 C 段）；结论三选一：「达标（k=0 且 3/N ≤ 2%，N ≥ 150）」/「不达标（k>0）」/「样本不足（N<150）」；并注明 `3/N` 是零事件的 95% 上界 | 结构 | 同上 |
| AC4 | 报告含豁免侧抽样：**新增豁免 = 当前 − 基线（78）**，抽样 ≥ 30 条、误命中 0 条；并注明「30 条只证明 ≤ 10%，非 2% 精度」 | 结构 | 同上 |
| AC5 | 每个**取数快照**（基线 `t0` + 各复评点）的 `agents.critic.mode` 均为 `warn`；快照点清单固定为「基线 + 每次复评取数」；逐点以 log 中同期 `"mode":"warn"` 行佐证 —— **零违规窗口该段无 L1 行**（`gate()` 只在违规/豁免时写 L1），此时可引用 L3 `injected` 行。**翻档后的快照不适用本条** | 结构 | 同上 |
| AC6 | 观察窗是**相对基线的封闭窗**：存在 `t0`（基线冻结时刻）与 `t1`（结论取数时刻），`t1 − t0 ≥ 7×86400×1000`，且窗 `[t0, t1)` 内首轮样本 ≥ 1。**全量扫描的 `min/max(timeCreated)` 不得作为时间跨度证据**。若 `t1 − t0 < 7 天` 且 `N < 150` ⇒ 只能写「样本不足」 | 结构 | 同上 |
| AC7 | 不变量：`git diff --stat <baseline_sha>..HEAD -- lib/subagent-contract-core.ts plugins/subagent-contract.ts scripts/audit-subagent-prompts.ts` 为空；`git diff <baseline_sha>..HEAD -- subagent-contract.json` 仅 `agents.critic.mode` 变化；新增文件**仅**观察报告与其引用的快照文件（`<baseline_sha>` 取自 AC1） | 结构 | git |
| AC8 | 若 enforce（**且**改的是 `agents.critic.mode`，全局 `mode` 仍 `warn`）：`docs/MULTI-AGENT-DESIGN.md:511` **保留**「默认 warn」**并追加**「critic 已覆盖为 enforce」；`commands/critic-review.md:55` 改为「critic 当前为 `enforce`（全局默认仍 `warn`）」 | 结构 | 两处文本 |
| AC9 | 若 enforce：**回退演练已执行并记录**（改回 warn → 一次 live 调用不再被拒） | 结构 | 观察报告 |
| AC10 | 不可逆性声明：enforce 后被拒调用不产生子会话 ⇒ `audit` 违规率**结构性归零** ⇒ 回退判据只能取 `subagent-contract.log` 中 **`gate=L1` && `level=violation` && `mode=enforce`** 的条数（**排除 `gate=L2`**：该路径 `enforceable:false` 从不拦截）；回退触发 = 该计数在 enforce 后 7 天内 > 0 且人工复核其中 ≥ 1 条为误拦 | 结构 | 观察报告 |
| AC11 | 回归：`bun test tests/` 全绿；`bash scripts/check-upstream-anchors.sh` 输出**无 `FAIL` 且无 `SKIP`**（出现 `SKIP` ⇒ 报告写明「锚点未验证」并**不勾选**本条） | 结构 | 全量 |
| AC12 | 7.4 结论落档（调用次数 < 10 或形态已稳定 ⇒ 关闭 + 重新开启条件写死） | 结构 | 观察报告 §7.4 |
| AC13 | 报告 §结论**二选一**：①「开 enforce」并列出 AC3/AC4 的达标数；②「继续 warn」并指名差的是哪一项（`k>0` / `N<150` / 新增豁免 < 30），并给出**可被 `audit` 直接重算的触发条件**（形如「累计首轮违规 N ≥ 150 时复评」）—— **禁止**日期或「形态稳定」等不可算措辞 | 结构 | 观察报告 §结论 |
| AC14 | 决策 = warn ⇒ AC8 / AC9 记 **N/A（通过）** 并在报告注明；决策 = enforce 时才适用 | 结构 | 验收报告 |
| AC15 | 报告含每桶首轮调用量，并与**基线全量按同口径（7 天 UTC 桶）切出的同期桶**对比；下降 > 50% 须给出解释（否则记为异常待查） | 结构 | 观察报告 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [ ] AC1 基线冻结（JSON + sha256 + HEAD + 规则哈希 + mode + 日志存在性）
- [ ] AC2 四元组 + 合规率分子 + 两套基线
- [ ] AC3 违规侧全量复核表（k=0 / k>0 / N<150 三选一 + Rule of Three 出处）
- [ ] AC4 豁免侧基线差 + ≥30 抽样 + 「只证明 ≤10%」注明
- [ ] AC5 快照点清单 + mode=warn + log 佐证
- [ ] AC6 封闭窗（t0/t1）+ 不用全量 min/max 作跨度证据
- [ ] AC7 三文件零改动 + 仅 mode 可变 + 新增文件白名单
- [ ] AC8（若 enforce）两处投影「追加」而非「替换」
- [ ] AC9（若 enforce）回退演练已执行
- [ ] AC10 不可逆性声明（gate=L1 过滤 + 回退阈值）
- [ ] AC11 回归绿 + anchors 无 SKIP
- [ ] AC12 7.4 收口结论
- [ ] AC13 决策结论二选一 + 可重算触发条件
- [ ] AC14 warn 决策 ⇒ AC8/AC9 = N/A
- [ ] AC15 每桶调用量 + 下降 >50% 解释

## 非目标

- 不改契约引擎的豁免语义、注入文案、审计 CLI 的实现与口径（趋势用 `--json` **本地切桶**，不改 CLI）。
- 不新增工具、状态字段、outcome 值、新 agent 类型、新的取数脚本。
- **不新增守卫断言**：改配置就是决策变更，不是漂移 ⇒ 投影一致性由 AC8 人工核对。
- **治理面范围**：本 change 对 `docs/MULTI-AGENT-DESIGN.md` / `commands/critic-review.md` 的改动是**叙述性措辞**追加（配置 schema 表述原样保留、触发语义未动）⇒ 按 §审查配对 的可点数判据（未增删/修改表格行、不变式条目、自查清单项、触发条件本身）**不触发 critic 必审**，走 oracle-only 豁免路径；治理面覆盖由 AC8 承担。
- 不做自动闭环（不自动改配置、不自动收口）：enforce 是**决策**，由人拍板。
- 不修 `rddf feedback` 通道的产品侧缺陷。

## 影响面与风险

| 面 | 影响 |
|---|---|
| `subagent-contract.json` | 可能把 critic 从 warn 覆盖为 enforce（**配置项变更，非代码**；全局 `mode` 不变） |
| `docs/MULTI-AGENT-DESIGN.md:511` / `commands/critic-review.md:55` | 投影面，翻档后**必须同步**（追加式措辞，不改「默认 warn」） |
| `docs/CHANGELOG.md` | 记一条收紧条目 |
| 行为 | critic 的不合规调用开始被拒（带可执行修正文案）⇒ 调用方需按 7 字段写 prompt；重发**不计评审轮** |
| 代价 | 收紧后不合规调用**硬拒**；若豁免误判残留 ⇒ 打断审查流 ⇒ 回退是配置单点（改回 warn 即生效） |
| 风险 | ① 违规侧误判率若反弹 ⇒ 回退；但**回退判据不能用 audit 报表**（enforce 后归零），只能用 log 的 `gate=L1 && level=violation && mode=enforce` 条数 ② 硬拒后父模型可能**直接放弃委派 critic** ⇒ 由 AC15 观察每桶调用量 ③ 窗口内契约规则被改 ⇒ 旧会话跑旧规则、新会话跑新规则 ⇒ 该段窗口**作废**（口径不可比） |

## 依赖与顺序

- **立即可做（不依赖时间）**：① 冻结基线 JSON 与规则/配置哈希 + 日志存在性 ② 违规侧全量复核 ③ 定死分母、公式、样本量下限 ④ 补投影面改写清单。
- **必须等的只有一项**：新增样本。**快路径当前不可用**（**首轮违规数 ≤ 110**（AC2 四元组重算后的值；110 是含续接轮 `too-long` 的混合上界）**< 150**）⇒ 最早在累计首轮违规达 150 条时复评。
- 顺序：取数 ⇒ 违规侧复核 ⇒ 门槛判定 ⇒ （若 enforce）投影追加 + 回退演练 ⇒ 7.4 留档 ⇒ CHANGELOG。
