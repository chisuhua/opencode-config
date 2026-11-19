# Tasks — subagent-contract-critic-reeval（复评 + 翻档）

> **判据真源**：`openspec/changes/archive/2026-11-19-subagent-contract-critic-enforce/proposal.md` 的 AC 表（本文件不复制判据正文）。
> **操作细节**：同目录归档版的 `tasks.md` 块 R / 块 E（逐条命令与口径；**不要重新发明口径**）。
> **入场条件（可机判，缺一不开工）**：`N ≥ 150` 且 `t1 − t0 ≥ 7 天` 且 `core hash` == `891aff973df196ec398e7ed0eafc275ad4bc4b82`。

## 0. 入场核对（**先做这一步**）

- [ ] **T0** 跑 `bun scripts/audit-subagent-prompts.ts --agent critic --json` 并数首轮违规 `N`；核对 `t1 − t0 ≥ 7×86400×1000`；核对 core hash。
      **三条不满足 ⇒ 只写一条「未触发」记录（含三个实测值 + 取数时刻）并停**；⚠ **这次取数不设为 `t1`**。

## R. 复评（入场条件满足后一次做完）

- [ ] **R1** 重算四元组（AC2：**全量套 + `--since 2026-11-11T00:00:00+00:00` 套**）
- [ ] **R2** 违规侧全量复核 + 判门槛（AC3：三选一 + Rule of Three 出处）
- [ ] **R3** 豁免侧抽样（AC4：新增豁免 = 当前 − 78；≥30 条、误命中 0；注明「30 条只证明 ≤ 10%」）
- [ ] **R4** mode 快照 + 封闭窗（AC5 / AC6）
- [ ] **R5** 不变量（AC7：三文件零改动 + `subagent-contract.json` 仅 `agents.critic.mode` 可变 + 新增文件白名单）
- [ ] **R6** 趋势（AC15：7 天 UTC 桶 + 与基线同期桶对比；下降 > 50% 须解释）
- [ ] **R7** 回归（AC11：`bun test tests/` 全绿；anchors **无 `FAIL` 且无 `SKIP`**）
- [ ] **R8** 结论二选一（AC13）：`继续 warn`（指名差哪一项 + 可重算触发条件）或 `开 enforce`（列达标数 ⇒ 进块 E）

## E. 仅当 R8 判「开 enforce」

- [ ] **E1** `subagent-contract.json` 的 `agents.critic.mode = enforce`（全局 `mode` 保持 `warn`）→ AC8
- [ ] **E2** 投影面**追加式**同步（`docs/MULTI-AGENT-DESIGN.md` / `commands/critic-review.md`）→ AC8
- [ ] **E3** 回退演练（改回 `warn` → 一次 live 调用不再被拒 → 记录）→ AC9
- [ ] **E4** `docs/CHANGELOG.md` 一条收紧条目
- [ ] **E5** 重跑 R7

## 归档条件

- T0 已记录（未触发也记录），且
- 若触发：块 R 全勾 + R8 结论落档；若判 enforce 再加块 E 全勾。
