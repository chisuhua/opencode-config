# subagent-contract-critic-enforce — subagent 输入契约的灰度观察与推广决策

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 决策依据：`openspec/changes/archive/2026-11-11-subagent-input-contract/`（原 change，已实施）+ `.rddf/reviews/subagent-contract-exemption-sampling.md` §1 的复核口径
> 来源：`subagent-input-contract` 的 tasks.md 遗留项 **7.1（灰度观察）** 与 **7.4（契约推广）**（两者前置均未到，故未随该 change 归档）
> 关联 change：**尚未立项**（本文件即立项草稿）
> planner 审查：metis 1 轮（`.rddf/reviews/subagent-contract-critic-enforce-planner-review.md`）

## Why

`subagent-input-contract` 的实现早已完成，但其 tasks.md 留了两条**决策尾巴**（7.1 灰度观察、7.4 契约推广）—— 前置未到 ⇒ 一直挂着。立项的真实价值有三层：

1. **账本清洁**：给两条尾巴一个可追的落点（从已归档 change 的 tasks 迁出）。
2. **冻结证据**：判据的数据一旦不在当天冻结就**不可复现**（`--since` 无上界 + 库在长大）⇒ 现在不冻结，将来无法判「是否达标」。
3. **门槛本身需要重写**：现行门槛「误命中率 ≤ 2% 且违规率连续下降」量的是**豁免侧漏放**，而 enforce 的真实伤害来自**违规侧误判**（合法复审被硬拒）⇒ 门槛的主指标**选错了**。

已知事实（收紧豁免语义后，基线 2026-11-12）：critic **331** 次调用 / 违规 **110** / 豁免 **78** / 合规 **143**（合规率 43.2%）。⚠ 口径修正：该 331 是**首轮 + 续接**的计数，而续接轮在契约引擎里**结构性免检**（`lib/subagent-contract-core.ts` 对 `isResume` 直接令 `missing = []`）⇒ 合规率分母应为**首轮数**，不是 331。

## What Changes

1. **冻结基线（今天就能做）**：把 `bun scripts/audit-subagent-prompts.ts --agent critic --json` 的**完整输出**（或输出文件路径 + `sha256`）连同取数时刻、`git rev-parse HEAD`、`git hash-object lib/subagent-contract-core.ts`、`subagent-contract.json` 当时的 `mode` 一起写进观察报告 §1。
2. **重算分母与基线**：报告列出四元组 —— 首轮数 / 违规数 / 豁免数 / **续接数**（续接轮结构性免检，不计入合规率分母）；并**同时**给出「全量」与「`--since 2026-11-11`（L3 注入上线日）」两套数 —— 观察期只能与**后者**比（331 的全量里含注入前的调用，当基线会让趋势天然向好）。
3. **抽样判罚侧（enforce 的真实风险面，不必等一周）**：从 110 条违规里按 §1 同口径逐条判定「真违规 / 真复审被误判」，给出比率与 **95% 上界**（`0/N` 的上界 ≈ `3/N`）。
4. **按两面门槛决策**（缺一不可）：
   - **豁免侧不漏判**（enforce 的合法复审必须放行）：违规侧误判 `k/N`，要求 `3/N ≤ 2%`（`N ≥ 150` 时等价于 `k = 0`；`N < 150` ⇒ 只能记「样本不足」，**不得**判定达标）；
   - **豁免侧不误放**（enforce 不会更糟，但要求不退化）：收紧后豁免集保持 0 误命中，且窗口内新增豁免抽样 ≥ 30 条、误命中 0 条；
   - **违规率趋势仅作参考信息，不作门槛**（理由：enforce 开启后该指标**结构性归零**，无法用于回退判据）。
5. **若判「开 enforce」**：`subagent-contract.json` 的 `agents.critic.mode` 翻成 `enforce`；**同步投影面**（否则文档会说假话）：`docs/MULTI-AGENT-DESIGN.md:511`（「默认 **warn**：只记录 + 审计，不拦任何调用」）与 `commands/critic-review.md:55`（「默认 `warn` 只记日志」）；并做一次**回退演练**（改回 warn → 跑一次 live 调用确认不再被拒 → 记录）。
6. **若判「继续 warn」**：报告 §结论 写明「差在哪一项判据（误判率 / 样本量 N）」，并给**触发条件**而非日期（例：「违规样本累积至 150 条时复评」）—— 条件可被下一次取数直接判定，日期不能。
7. **7.4 收口（不单列为工作项，随观察报告附 §7.4）**：以 `--agent oracle` / `--agent metis` 在窗口内的调用次数与 prompt 形态为依据 —— 调用次数 < 10 ⇒ 记「无足够样本，不推广」并关闭；≥ 10 且抽样 5 条显示输入形态已稳定 ⇒ 同样记「已有等效范式（metis 的 5 段输入 + 6 节输出，见 `tests/config-guards.test.ts` 的既有断言），缺的是 enforcement 的必要性而非范式」并关闭。**重新开启条件写死**：出现第二个「父模型常漏字段且漏了会出事」的主机。
   > 注：`oracle` / `metis` 当前**没有** 7 字段契约范式 ⇒ 审计里它们恒 ok（无违规数据可评）⇒ 「评估」的输入只有调用量与形态，不设「除非给出字段映射表」这类**伪门槛**（没有机制去检查它 ⇒ 不可推翻的结论）。

## Acceptance

| 判据 | 类型 |
|---|---|
| 报告 §1 含基线 `--json` 原文（或文件路径 + `sha256`）+ 取数时刻 + `git rev-parse HEAD` + `git hash-object lib/subagent-contract-core.ts` + 当时的 `mode` | 结构 |
| 报告列出四元组：首轮数 / 违规数 / 豁免数 / 续接数；合规率分母 = **首轮数**；并同时给出「全量」与「`--since 2026-11-11`」两套数 | 结构 |
| 报告含**违规侧抽样表**：N 条、误判 k 条、`3/N` 上界；结论二选一：「≤ 2%（达标）」或「样本不足（N < 150）」 | 结构 |
| 报告含**豁免侧抽样**：新增豁免抽样 ≥ 30 条、误命中 0 条 | 结构 |
| 每个快照点的 `mode` 均为 `warn`（从数据反推不出当时档位 ⇒ 必须记录） | 结构 |
| 时间跨度：`max(timeCreated) − min(timeCreated) ≥ 7×86400×1000` 且覆盖 ≥ 7 个日历日（不足则只能写「样本不足」） | 结构 |
| 不变量：`git diff --stat` 中 `lib/subagent-contract-core.ts` / `plugins/subagent-contract.ts` / `scripts/audit-subagent-prompts.ts` **零改动**；`subagent-contract.json` 仅 `agents.critic.mode` 可能变化；除观察报告外无新增文件 | 结构 |
| 若 enforce：`docs/MULTI-AGENT-DESIGN.md:511` 与 `commands/critic-review.md:55` 已同步为 enforce 陈述 | 结构 |
| 若 enforce：**回退演练已执行并记录**（改回 warn → 一次 live 调用不再被拒） | 结构 |
| 报告含**不可逆性声明**：enforce 后被拒调用不产生子会话 ⇒ `audit` 的违规率结构性归零 ⇒ 回退判据只能取 `subagent-contract.log` 中 `level=violation && mode=enforce` 的条数，**不能**再用 audit 报表 | 结构 |
| 回归：`bun test tests/` 全绿；`bash scripts/check-upstream-anchors.sh` **无 FAIL**（**不写死 23/23** —— 锚点数随维护变化，写死即制造假验收） | 结构 |

## Capabilities

- **新增**：一份冻结基线的观察报告（`.rddf/reviews/subagent-contract-critic-enforce-observation.md`），含可复现的取数快照与两面门槛结论。
- **可能收紧**：critic 的输入契约由 `warn` 翻成 `enforce`（**仅在门槛达成时**）。
- **不新增**：工具、状态字段、outcome 值、新 agent 类型、新的取数脚本（趋势用 `--json` 自行分桶，**不改审计 CLI**）。
- **不改**：契约引擎的豁免语义、注入文案、审计 CLI 的口径与实现。
- **不新增守卫断言**：不为「配置值」加断言（改配置就是决策变更，不是漂移）；投影一致性由上面两条结构判据**人工核对**。

## Impact

| 面 | 影响 |
|---|---|
| `subagent-contract.json` | 可能把 critic 从 warn 翻成 enforce（**配置项变更，非代码**） |
| `docs/MULTI-AGENT-DESIGN.md:511` / `commands/critic-review.md:55` | 投影面，翻档后**必须同步**（否则文档与运行时相反） |
| `docs/CHANGELOG.md` | 记一条收紧条目 |
| 行为 | critic 的不合规调用开始被拒（带可执行修正文案）⇒ 调用方需按 7 字段写 prompt；重发**不计评审轮** |
| 代价 | 收紧后不合规调用**硬拒**（不是记日志）；若豁免误判残留 ⇒ 打断审查流 ⇒ 回退是配置单点（改回 warn 即生效） |
| 风险 | ① 违规侧误判率若反弹 ⇒ 回退；但**回退判据不能用 audit 报表**（enforce 后归零），只能用 `subagent-contract.log` ② 硬拒后父模型可能**直接放弃委派 critic** ⇒ 需同时观察「每桶调用量」，调用量比基线下降 > 50% 视为异常需解释 ③ 窗口内契约规则被改 ⇒ 旧会话跑旧规则、新会话跑新规则 ⇒ 该段窗口**作废**（口径不可比） |

## 依赖与顺序

- **立即可做（不依赖时间）**：① 冻结基线 JSON 与规则/配置哈希 ② 违规侧 110 条抽样判定 ③ 定死分母、桶宽、样本量下限与 95% 上界公式 ④ 补投影面改写清单。
- **必须等的只有一项**：新增样本。若步骤 ② 在现有 110 条上已满足门槛且样本量达 N ≥ 150 ⇒ **不必满 7 天**即可决策。
- 顺序：取数 ⇒ 违规侧抽样 ⇒ 门槛判定 ⇒ （若 enforce）投影改写 + 回退演练 ⇒ 7.4 收口 ⇒ CHANGELOG。
- 趋势取数的执行口径（CLI **无 `--until`**，只能用累计快照相减）：按 7 天桶（UTC，`--since` 用带偏移 ISO 如 `2026-11-19T00:00:00+08:00`），桶内违规率 = 桶内违规 / 桶内首轮数；**连续 3 桶单调不增** ⇒ 记为「下降」；桶边界前后各留 1 天 buffer。
