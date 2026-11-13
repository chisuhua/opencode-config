# backend-handoff-role-class — 派发契约显式化：`role_class` + 凭据化 handoff

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 决策：`docs/adr/ADR-backend-handoff-role-class.md`（**Accepted**，2026-11-13 用户签批；oracle 1 + metis 1 + critic 1 轮，critic `APPROVE_WITH_CONDITIONS` 无 BLOCKER）
> 规格：`.rddf/reviews/backend-handoff-protocol-spec.md`（v3）
> 逐条验收：**以 `openspec/changes/backend-handoff-role-class/proposal.md` 的 AC 表为准**（本文件不复述规则）
> planner 审查：metis 1 轮（`.rddf/reviews/backend-handoff-role-class-planner-review.md`）

## Why

派发契约缺「本次允许做哪一类工作」这一维。后果三条：

1. 写 ADR 的后端拿到代码 `scope`、跑验收的后端能改实现 —— 身份边界靠简报里的自然语言嘱咐。
2. 后端遇计划决策时的停下义务只写在 `prompts/build.md`；主会话没有可观察凭据区分「交接」与「失败」，也不知道如何续上同一上下文。
3. `resume` 不重设 permissions ⇒ 扩 scope 的 resume 必然白跑；brief 覆盖 `role_class` 则产生类漂移（权限 architect / 简报 builder）。

且派发方目前没有选类判据（`prompts/plan.md` 的派发表只讲"用哪个工具"，`prompts/front.md` 仍写"实施性 ⇒ `delegate`"）——缺它的话新参数在真实使用中不会被填，architect / verifier 两类等于死配置。

支撑事实：session metadata 不进模型上下文；`edit` / `subagent` 可被 session 权限结构性约束（deny 覆盖 agent allow）；`shell` 不能（`CONSTANT_DENY` 不挡 `> file`）；`build` 是 primary agent，任何后端都拉不起可写后端。

## What Changes

1. **能力边界由派发参数声明**：`role_class ∈ {builder, architect, verifier}` 进 `delegate` / `dispatch` 入参，三类各有一套 edit 与 subagent 边界（规则见 ADR D1–D4）。
2. **交回是凭据化流程**：`rddf feedback add` 落凭据（唯一权威）+ 回复首行 `HANDOFF: <kind>` + 结束回合（槽自动释放）；不新增工具 / 状态 / delivery 判态（ADR D5）。
3. **class 与 scope 不可漂移**：两层校验 + 从 `pair.json` 读回 class（ADR D6、D8）。
4. **派发方选类判据**：`prompts/plan.md` 派发表加「任务 → 类」列，`prompts/front.md` 同步；选错类 ⇒ 停手 `HANDOFF: blocked`，不得硬做（治理面文本，由 architect 落笔）。

## Acceptance

AC1–AC23 ↔ `openspec/changes/backend-handoff-role-class/proposal.md`（同号，该表为唯一逐条口径）。结构性判据进 `tests/delegate-core.test.ts` / `tests/delegate-async.test.ts` / `tests/delegate-tool.test.ts`；AC13 / AC14 属 prompt 判据，不进 CI。

## Capabilities

- 零新工具、零新状态枚举、零新依赖、零新 agent；不扩 `ALLOWED_AGENTS`。
- 增量字段三处：`role.json` 的 `sessions[sid].role_class`、`pair.json` 条目的 `role_class`、`sessions` 工具 items 的回显字段（只读）。
- 入参新增 `role_class`（有缺省值 ⇒ 向后兼容）；行为侧对「越类写盘」是收紧（原本可写，现在结构性拒）。
- 需同步 `prompts/build.md`：HANDOFF 的**首行优先级**（该回合省略角色开场报告）、被派发 session 禁用窗口内切角色、architect 转 Status 的硬边界（draft 范围 + 双审闭合 + 完成标志 5 条，否则 `HANDOFF: blocked`）。

## Impact

- **行为**：architect / verifier 类后端写面被结构性收窄；换类必须 handoff 回主会话。
- **用户可感知**：**换类与扩 scope 都是新 session —— 模型上下文不继承**，延续的只有工件（文件）、凭据（feedback）与登记（pair.json）。plan 需要把计划要点重贴。
- **代价**：三类共享 `revision_count`（纯换类走 `blocked`、不计数）；单槽不豁免 ⇒ 同一工作树上三类串行。
- **风险**：`shell` 仍可经重定向越界（与现状等价）；跨 worktree 同 `plan_ref` 并发共享额度、`discovery.md` 可能互相覆盖（已知缺口，另立 ADR）；architect 类被 `cancel` 会留半成品 ADR（主会话复核后补完或 `git restore`）。
- **外部依赖**：HANDOFF 凭据押在 `rddf feedback` 通道上，而该通道在产品侧有已知读/写不一致（`docs/rdd-workflow-product-issues.md` Issue A/B）⇒ 本 change 必须带文本 fallback（AC22），不得让交回流程依赖 CLI 可用性。
