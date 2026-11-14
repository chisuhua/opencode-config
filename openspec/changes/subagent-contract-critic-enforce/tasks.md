# Tasks — subagent-contract-critic-enforce（critic 灰度观察与推广决策）

> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC15）。
> 数据与结论：`.rddf/reviews/subagent-contract-critic-enforce-observation.md`（基线冻结于 2026-11-14 = `t0`）。
> **本 change 是时间门控 change**：块 D 本期已完成；块 R 待触发条件满足后一次做完；块 E 仅在判 enforce 时执行。

## D. 本期已完成（基线冻结 + 初判）

- [x] D1 冻结基线（AC1）：`audit --json` 的 `sha256`（`7f2e43ec…`）+ 取数时刻 + `git rev-parse HEAD`（`74f6a9eb…`）+ `git hash-object lib/subagent-contract-core.ts`（`891aff97…`）+ 当时的 `mode`（`warn`）+ 日志存在性（70 行、末次写入 2026-11-14 12:26）→ **AC1 ✅**
- [x] D2 四元组 + 合规率分子（AC2，**全量套**）：首轮 **349** / 续接 **28** / 首轮违规 **112** / 豁免 **79**；合规率 `158/349 = 45.3%`，公式 `(首轮 − 首轮违规 − 豁免) / 首轮` → **AC2 部分**（`--since` 套待块 R）
- [x] D3 违规侧初判（AC3）：`N = 112 < 150` ⇒ **样本不足**；附 `3/112 = 2.7% > 2%`（即使 `k = 0` 也不能判达标）→ **AC3 ✅（取「样本不足」分支）**
- [x] D4 豁免侧（AC4）：新增豁免 = `79 − 78 = 1` 条 ⇒ 远低于 30 条门槛 ⇒ **样本不足** → **AC4 ✅（取「样本不足」分支）**
- [x] D5 mode 快照（AC5）：基线 `t0` 的 `agents.critic.mode = warn` + log 佐证（L3 `injected` 行）→ **AC5 ✅（本期只有 1 个快照点）**
- [x] D6 封闭窗判定（AC6）：`t1 = t0` ⇒ `t1 − t0 = 0 < 7 天` ⇒ **不满足**；报告明确「全量 min/max **不是**跨度证据」→ **AC6 未满足（按设计）**
- [x] D7 7.4 收口（AC12）：结论 = **不推广**（评估仅留档）；重新开启条件写死（出现第二个「父模型常漏字段且漏了会出事」的主机）→ **AC12 ✅**
- [x] D8 决策落档（AC13 / AC14）：**继续 warn** + 差在两项（`N < 150`；`t1 − t0 < 7 天`）+ **可重算的触发条件**「累计首轮违规 `N ≥ 150` 时复评」；AC8 / AC9 记 **N/A** → **AC13 ✅ / AC14 ✅**
- [x] D9 不可逆性声明（AC10）：enforce 后 `audit` 违规率结构性归零 ⇒ 回退判据只能取 log 的 **`gate=L1` && `level=violation` && `mode=enforce`**（排除 `gate=L2`）；回退触发 = 该计数 enforce 后 7 天内 > 0 且人工复核 ≥ 1 条为误拦 → **AC10 ✅（前瞻声明）**

## R. 复评（**触发条件：累计首轮违规 `N ≥ 150`** 且 `t1 − t0 ≥ 7 天`）

> **复评命令清单**（逐条跑、逐条填进观察报告；**不要**重新发明口径 —— 口径见 `design.md` §1/§2）

- [ ] R1 **重算四元组**（AC2，**每个快照点各两套**）：
      `bun scripts/audit-subagent-prompts.ts --agent critic --json > .rddf/reviews/<snapshot>.json`
      然后数：`rows.filter(r => r.messageIndex === 0)` = 首轮数；`messageIndex > 0` = 续接数；
      `messageIndex === 0 && !evaluation.ok` = 首轮违规数；`evaluation.exempted === true` = 豁免数。
      另跑 `--since 2026-11-11T00:00:00+00:00` 得**注入后子集**的同一四元组（观察期只与它比）。
- [ ] R2 **重算 `N` 并判门槛**（AC3）：`N` = **观察窗内全部首轮违规条数**；若 `N < 150` ⇒ 记「样本不足」并**回到 R1**（等下一次）；若 `N ≥ 150` ⇒ 逐条人工复核 `k`（判定式见 `proposal.md` C 段），按三选一落结论。
- [ ] R3 **豁免侧抽样**（AC4）：新增豁免 = 当前豁免 − 78；抽样 ≥ 30 条 → 误命中数；注明「30 条只证明 ≤ 10%」。
- [ ] R4 **mode 快照 + 封闭窗**（AC5 / AC6）：记录本次 `agents.critic.mode` 与 log 同期 `"mode"` 行；核对 `t1 − t0 ≥ 7×86400×1000`。
- [ ] R5 **不变量**（AC7）：`git diff --stat <baseline_sha>..HEAD -- lib/subagent-contract-core.ts plugins/subagent-contract.ts scripts/audit-subagent-prompts.ts` **为空**；`git diff <baseline_sha>..HEAD -- subagent-contract.json` **仅** `agents.critic.mode` 变化；新增文件仅观察报告与其快照文件。若 `core hash` 变了 ⇒ **该段窗口作废**（口径不可比）。
- [ ] R6 **趋势（信息项，不作门槛）**（AC15）：一次全量 `--json` 后**本地**按 `rows[].timeCreated` 切 7 天 UTC 桶（半开区间、无 buffer）；每桶首轮调用量 + 违规率；与「基线全量按同口径切出的同期桶」比，下降 > 50% 须解释。
- [ ] R7 **回归**（AC11）：`bun test tests/` 全绿；`bash scripts/check-upstream-anchors.sh` 输出**无 `FAIL` 且无 `SKIP`**（出现 SKIP ⇒ 报告记「锚点未验证」并**不勾选**）。
- [ ] R8 **结论二选一**（AC13）：
      ① **开 enforce** ⇒ 列出 AC3 / AC4 的达标数（`k = 0`、`3/N ≤ 2%`、`N ≥ 150`；新增豁免 ≥ 30、误命中 0）⇒ 进块 E；
      ② **继续 warn** ⇒ 指名差哪一项（`k > 0` / `N < 150` / 新增豁免 < 30），并给**可被 `audit` 直接重算的触发条件**（禁日期 / 「形态稳定」这类不可算措辞）。

## E. 仅当 R8 判「开 enforce」

- [ ] E1 改 `subagent-contract.json` 的 `agents.critic.mode = enforce`（**全局 `mode` 保持 `warn`**）→ AC8
- [ ] E2 投影面**追加式**同步（AC8）：
      `docs/MULTI-AGENT-DESIGN.md` —— **保留**「默认 **warn**」并追加「critic 已通过 `agents.critic.mode` 覆盖为 enforce」；
      `commands/critic-review.md` —— 「默认 `warn` 只记日志」改为「critic 当前为 `enforce`（全局默认仍 `warn`）」。
- [ ] E3 **回退演练**（AC9）：改回 `warn` → 跑一次 live 调用确认不再被拒 → 记录（再按决策恢复）。
- [ ] E4 `docs/CHANGELOG.md` 一条收紧条目。
- [ ] E5 重跑 R7 回归。

## 归档条件（本 change 何时可归档）

- 块 R 全部勾选（含 R7 回归），且
- 结论已落档（R8 二选一），且
- 若判 enforce：块 E 全部勾选。

> 本期**不归档**：`N = 112 < 150` 且 `t1 − t0 = 0 < 7 天` —— 这两条不靠写代码满足，也不为「能归档」而放宽。
