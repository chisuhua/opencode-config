# TODO — n1：现有派发通道盘点

> 执行者：plan-worker（子会话）｜起始：2026-11-26

## 读盘（BRIEF「必读材料」逐项）

- [x] 读 `BRIEF.md` / `TOPIC.md` / `graph.json`，确认边界（只测绘、不设计）
- [x] `opencode.jsonc`：顶层五动作 + agent 级 delegate / subagent 矩阵（build / front / plan / title / plan-worker）
- [x] `docs/adr/ADR-plan-delegate-engineering-session.md`：D1 / D4 / D7 / 前置事实 ②④⑤ / subagent 拉可写 agent 的裁决
- [x] `docs/adr/ADR-plan-multi-session-collaboration.md`：D3 / D4 / 不可机判清单 / D1 单一写者 / D6 续接 vs 重建
- [x] `lib/delegate-core.ts`：`ALLOWED_AGENTS` / `PLAN_REF_ROOTS` / `validatePlanRef` / 同步派发的槽位与 `session.create`
- [x] `lib/delegate-async.ts`：`planSlot` / `claimSlot` / 全局配额 / 归属门控
- [x] `plugins/subagent-contract.ts` + `subagent-contract.json` + `lib/subagent-contract-core.ts`：L1 钩子位置、mode、覆盖范围
- [x] `scripts/agent-guard-rules.ts`：`GUARDED_AGENTS` 语义与覆盖面
- [x] `docs/MULTI-AGENT-DESIGN.md` §3.1 委派矩阵 + §3.1 注脚（可达≠有消费者）
- [x] `prompts/build.md`：角色矩阵 builder/verifier 配对 + 写集 + 被派发后端条款
- [x] 补证：`lib/role-lease.ts` / `lib/role-policy.ts`（同 worktree 同角色独占、写门只门控 build 主会话）
- [x] 补证：`docs/front-delegate-usage.md` / `docs/adr/ADR-front-multi-backend.md` / `.rddf/state/adr-front-agent-redesign.md`（worktree 并行前置、单槽、delegate 仅 front 可得）

## 产出

- [x] 通道清单表（6 条通道 × 7 列，含权限依据与写隔离/并发语义）
- [x] 可派矩阵（含「权限可达 ≠ 流程有消费者」标注）
- [x] `build` 缺口的判定：能力缺口 vs 刻意串行化，逐条带 `path:line`
- [x] 结论段（可判定布尔陈述）
- [x] 自检：`path:line` 引用 ≥ 8 处、正文 ≥ 100 行、事实/推断/建议分类
