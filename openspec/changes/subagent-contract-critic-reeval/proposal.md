# subagent-contract-critic-reeval — critic 契约的**复评与翻档**（数据闸门：`N ≥ 150` 且封闭窗 ≥ 7 天）

> 来源：`subagent-contract-critic-enforce`（**已归档**：`openspec/changes/archive/2026-11-19-subagent-contract-critic-enforce/`）的
> **块 R（复评）+ 块 E（仅当判 enforce）** —— 该 change 的块 D（基线冻结 + 初判 + 触发条件）已完成并归档，
> 剩下的部分**没有一条**可以靠写代码满足（只等真实调用量）。
> 判据真源：**归档 change 的 `proposal.md` 的 AC 表**（本文件**不复制**判据正文，避免一份事实两个真源；下表只给编号 + 一句话）。
> 数据与口径：`.rddf/reviews/subagent-contract-critic-enforce-observation.md`（基线 `t0 = 2026-11-14`）。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在 ⇒ 走**内置流程**。

## Why

`subagent-contract-critic-enforce` 的结论是「**继续 warn**」+ 一条**可被 `audit` 直接重算的触发条件**（AC13 的要求）：

> **累计首轮违规 `N ≥ 150`** 且 **`t1 − t0 ≥ 7×86400×1000`**（`t0 = 2026-11-14`）⇒ 复评；否则记「样本不足」。

基线（2026-11-14）：首轮 **349** / 续接 28 / **首轮违规 N = 112** / 豁免 79 / 合规率 45.3%。
2026-11-15 重算：首轮 353（+4）/**N = 112（未涨）**/ 豁免 79 ⇒ 新增 4 次首轮调用全部合规。

⇒ **`N` 距 150 还差 38 条，且这个数字不随时间自动到**（新调用绝大多数合规 ⇒ 违规数增长远慢于调用数）。
⇒ 原 change 若继续挂着，会长期占用活跃列表；而它剩下的 AC 全部是「到点取数才可判」的类型。

**本 change 的唯一目的**：把「等数据 → 取数 → 判门槛 → （若达标）翻档」这段**独立**出来，让它有明确的**入场条件**与**判据指针**。

## 入场条件（**可机判，不满足就不开工**）

同时满足三条才开跑 R1（**提前跑 R1 会把封闭窗终点提前钉死** —— 见归档 change 的 `tasks.md` 块 R 的警告）：

1. `N ≥ 150`：`bun scripts/audit-subagent-prompts.ts --agent critic --json` 的 `rows.filter(r => r.messageIndex === 0 && !r.evaluation.ok).length`；
2. `t1 − t0 ≥ 7×86400×1000`（`t0 = 2026-11-14`，`t1` = 本次取数时刻）；
3. `git hash-object lib/subagent-contract-core.ts` **与基线相同**（基线全文 = `891aff973df196ec398e7ed0eafc275ad4bc4b82`；判据写成 `git hash-object lib/subagent-contract-core.ts | grep -q '^891aff973df196ec398e7ed0eafc275ad4bc4b82$'`，**失败**即窗口内契约规则变过 ⇒ **口径不可比 ⇒ 该段窗口作废**，只能从变化点重新起算）。

> 三条任一不满足 ⇒ **不开工**（写一条「未触发」记录即可，不动其它文件）。
> ⚠ **未触发时的那次取数不得设为 `t1`**：它只是条件核对；`t1` 以**首次三条全满足**的那次取数为准
> （否则会把封闭窗终点提前钉死 —— 原 change 的 `tasks.md` 块 R 对此有专门警告）。

## 需要满足的判据（真源在归档 change）

| 来源 AC | 一句话 | 何时可判 |
|---|---|---|
| **AC2（`--since` 套）** | 四元组的「注入后子集」那套（`--since 2026-11-11T00:00:00+00:00`），与全量套并列 | 取数时 |
| **AC3** | 违规侧**全量复核**表：`N`、`k`（误判条数）+ 三选一（达标 / 不达标 / 样本不足）+ Rule of Three 出处 | 取数时 |
| **AC4** | 豁免侧：新增豁免 = 当前 − **78**；抽样 ≥ 30 条、误命中 0；注明「30 条只证明 ≤ 10%」 | 取数时 |
| **AC6** | 封闭窗：`t0`/`t1` 都存在且跨度 ≥ 7 天；**不得**用全量 `min/max(timeCreated)` 当跨度证据 | 取数时 |
| **AC7** | 不变量：`git diff --stat <baseline_sha>..HEAD -- lib/subagent-contract-core.ts plugins/subagent-contract.ts scripts/audit-subagent-prompts.ts` 为空；`subagent-contract.json` 仅 `agents.critic.mode` 可变；新增文件仅观察报告 + 快照 | 取数时 |
| **AC11** | 回归：`bun test tests/` 全绿；anchors **无 `FAIL` 且无 `SKIP`**（出现 SKIP ⇒ 不勾选，报告写明「锚点未验证」） | 收口时 |
| **AC13（复评段）** | 结论二选一：① 开 enforce（列 AC3/AC4 达标数）；② 继续 warn（指名差哪一项 + **可重算的触发条件**，禁日期 / 「形态稳定」） | 收口时 |
| **AC15** | 每桶首轮调用量（7 天 UTC 桶）+ 与基线同期桶对比；下降 > 50% 须解释 | 取数时 |
| **AC8 / AC9** | **仅当**判 enforce：两处投影**追加式**同步（保留「默认 warn」）+ **回退演练**（改回 warn → 一次 live 调用不再被拒） | 仅 enforce |
| **AC10** | 已在本 change 的前身落地（前瞻声明）；翻档后按它准备回退判据：log 的 `gate=L1 && level=violation && mode=enforce` 条数 > 0 且人工复核 ≥ 1 条误拦 | 翻档后 7 天 |

## 非目标

- **不改任何判据**（判据一律取归档 change 的 AC 表原文）；**不放宽门槛**（150 / 7 天 / 2% / Rule of Three 都不动）。
- **不提前取数**（入场条件三条缺一不开工）。
- 不改契约引擎、审计 CLI、豁免语义。
- **不做自动闭环**：是否翻档由人拍板（AC13 的结论必须二选一）。

## 交付物

1. **一次取数的快照**（`audit --json` 输出文件 + `sha256`）与四元组（两套）；
2. 观察报告新增「复评」一节（AC2/AC3/AC4/AC6/AC15 的表格 + 指针）—— **追加在既有报告** `.rddf/reviews/subagent-contract-critic-enforce-observation.md`（该报告是这一族数据的单点）；
3. 结论：**继续 warn**（附可重算触发条件）或 **开 enforce**（含投影同步 + 回退演练 + CHANGELOG）。

## 风险

| 风险 | 处置 |
|---|---|
| 取数时 `core hash` 已变 ⇒ 窗口不可比 | 入场条件第 3 条直接拦住；落「窗口作废、从变化点重新起算」的记录 |
| 翻档后硬拒打断审查流 | 回退是配置单点（`agents.critic.mode` 改回 `warn`）；回退判据按 AC10 只看 **L1** 违规计数，**不看 audit 报表**（enforce 后结构性归零） |
| 翻档后父模型**不再委派 critic** | AC15 的每桶调用量（下降 > 50% 须解释）就是为这条设的观察项 |
| 「等数据」被无限期拖延 | 入场条件是**可机判**的；本 change 不做「日期到就复评」这类触发（原 change 的 AC13 明确禁日期措辞） |
