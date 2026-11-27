# TODO — n1：现有派发通道盘点

- [x] 读 `BRIEF.md` / `TOPIC.md` / `graph.json`，确认边界（只测绘、不设计、不改实现）
- [x] 读 `opencode.jsonc`：顶层五个 delegate 动作 + build / front / plan / plan-worker 的 agent 级 `delegate` / `subagent` 矩阵
- [x] 读 `docs/adr/ADR-plan-delegate-engineering-session.md`：D1 / D4 / D7 / 前置事实 ②④⑤ / 「用 subagent 拉可写 agent」裁决 / 残留 #4 #5 #6
- [x] 读 `docs/adr/ADR-plan-multi-session-collaboration.md`：D3 / D4 / D8 / 事实 ⑤⑥⑦ / 已知不可机判清单 / 残留 #1 #2
- [x] 读 `lib/delegate-core.ts`：`ALLOWED_AGENTS` / `PLAN_REF_ROOTS` / `classPermissions` / `ownerAgentOf` / `plan_ref` 必填条件 / 槽位键
- [x] 读 `lib/delegate-async.ts`：`planSlot` / `claimSlot` / `releaseSlotAuthorized` / `sessions` owner 过滤 / 全局并发上限
- [x] 读 `plugins/subagent-contract.ts`：L1 钩子挂点与当前 mode
- [x] 读 `scripts/agent-guard-rules.ts`：`GUARDED_AGENTS` 覆盖面（含谁不在里面）
- [x] 读 `docs/MULTI-AGENT-DESIGN.md` 与 `prompts/build.md` 角色矩阵 / rdd-builder 行
- [x] 产出 `RESULT.md`：通道清单表（≥5 条）+ 可派矩阵 + build 缺口判定（≥3 证据）+ 布尔结论
