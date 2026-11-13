# 后端 handoff 与 role_class —— 架构设计

> 状态：Design（配套 `docs/adr/ADR-backend-handoff-role-class.md`，ADR **Accepted** 2026-11-13）
> 范围：`lib/delegate-core.ts` / `lib/delegate-async.ts` / `prompts/{build,plan,front}.md`
> 决策依据：ADR-backend-handoff-role-class（D1–D9）；工作规格见 `.rddf/reviews/backend-handoff-protocol-spec.md`（v3）

## 1. 问题

主会话（`plan`，planner 角色）派工程后端去实施时，有两处失控：

1. **中途需要计划决策**：后端要么擅自改计划（越界），要么停下来但主会话不知道「这是交接不是失败」，也不知道该怎么续上同一上下文。
2. **身份不清**：同一个 `build` agent 被派去做实施、写 ADR、跑验收时，能力边界只由 `scope` 决定。写 ADR 的后端拿到的是代码 scope，跑验收的后端能改实现 —— 「我在以什么身份工作」只能靠简报里的自然语言嘱咐。

本设计不新增工具、不新增状态机，只把既有零件（简报 / session permissions / `pair.json` / `role.json` / `rddf feedback`）串成显式契约。

## 2. 既有零件（不改的部分）

| 零件 | 作用 | 关键事实 |
|---|---|---|
| 委托简报 `buildBrief()` | 唯一按 session 注入的说明通道 | session metadata 不进模型上下文；简报是后端唯一能读到的"我是谁" |
| session permissions | `edit` / `subagent` 的硬边界 | `merge(agent, session)` + `evaluate` 取 findLast ⇒ session 级 deny 覆盖 agent 级 allow |
| `pair.json` | resume 的访问控制本体 + 槽位表 | 插件自有状态文件（非 session metadata），可扩字段 |
| `role.json` role-v2 | 治理身份分区 | `current_role` 是**治理身份**，允许同 session 内自动切换 |
| `rddf feedback add` | 交接凭据的 single writer | 带 `revision_count` 上限（默认 3），超限写不进 = 天然断路器 |
| 同步 `delegate` 收尾 | 槽位释放 | 收尾自翻转 `idle`，不占槽；resume 只是复用同一 session |

## 3. 目标架构

```
plan 主会话（planner 角色）
  │  delegate | dispatch  { plan_ref, scope, acceptance, role_class }
  ▼
delegate-core
  ├─ validateBrief            role_class 值域；knowledge 互斥
  ├─ assertRoleClassCompatible class×scope 相容；resume 与 pair.json 比对
  ├─ classPermissions         edit 规则 + subagent 白名单（单一实现）
  ├─ session.create(permissions)   ← 能力在此定型，resume 不再改
  ├─ buildBrief()             运行身份 + 按 class 分支的执行要求
  └─ registerSession          pair.json 落 role_class；role.json 落 role_class 字段
  ▼
工程后端 session（agent=build，role_class = builder | architect | verifier）
  │  遇到需要 planner 决策 / 需要别的类
  │  ① rddf feedback add（凭据，权威）
  │  ② 回复首行 `HANDOFF: <kind>`（triage 提示）
  ▼
plan 主会话：读 evidence → 切角色 → 改 plan/proposal → resume（同 scope）或新建 session（扩 scope）
```

### 3.1 三类的能力边界

| class | edit | subagent | 产出物 | 收口归属 |
|---|---|---|---|---|
| `builder` | `scope` | 五个只读 agent | 代码 / 测试 | 主会话发起评审 |
| `architect` | `archRoots ∪ .rddf/reviews ∪ arch-docs.json` | 同上 | ADR / 架构文档 / 审稿报告 | 可有条件转 Status；已签批 ADR 的决策变更必须 handoff |
| `verifier` | 仅 `.rddf/reviews/**` | 同上 | 验收报告 | 判决由主会话消费，不改实现 |

`archRoots(projectDir)` 按 `.rddf/config/arch-docs.json` 的三态解析（配置可用 → `arch_paths`；缺失/为空/损坏 → fallback 目录集中实际存在的目录；全无 → 空集，architect 类派发被拒），**不硬编码目录名**。

### 3.2 subagent 白名单

三类统一：`{explore, librarian, oracle, metis, critic}`。

- 必须保留：`prompts/build.md` 把 builder→critic、verifier→explore/critic 定为流程义务，全 deny 会废掉固定审查链。
- 必须排除：`general` / `context-builder` 的 `shell: {"*": "allow"}` 可经 `> file` 绕开 edit 边界；其余五个是 `shell: {"*": "deny"}` + 只读命令白名单。
- 结构上限：`build` 是 primary agent，任何类都拉不起一个可写后端（内核直接拒），所以白名单只需管只读侧。

## 4. 不变量

1. **能力只在 create 时定型**：resume 不调 `session.update` ⇒ 新指令必须落在原 scope；扩 scope = 新 session（上下文不继承）。
2. **class 只来自 `pair.json`**：简报文本由持久化值生成；brief 与登记不一致 ⇒ 硬拒（防类漂移）。
3. **换类无入口**：没有 `set_class` 工具，resume 不接受不同 class，`auto_switch_window` 对被派发 session 不生效。
4. **凭据单写**：交接的唯一权威是 `rddf feedback` 记录；`HANDOFF:` 首行只是同步路径的 triage，grep 文本不作门禁。
5. **handoff = 自然结束**：不新增 `handoff_pending`，不占槽；槽位只门控并发写，不保存上下文。
6. **单槽不豁免**：三类都受 D4 约束，串行是设计选择，不是缺陷。

## 5. 失败模式与对策

| 失败模式 | 现状后果 | 对策 |
|---|---|---|
| 后端"顺手"改计划 | 计划与实施脱节，无人知情 | 写目标越类 ⇒ 停手 + feedback 记录；`revision_count` 断路器兜底 |
| 主会话忘了 resume | 槽已释放，通道不堵；只是后端悬挂 | `sessions` 列出 `idle` + feedback 待处理；`cancel` 收尾 |
| resume 时 class 漂移 | 权限是 architect、简报说 builder，行为不可预测 | class 取自 `pair.json`，brief 不一致硬拒 |
| 扩 scope 后用 resume | 新指令撞权限被拒，白跑一轮 | 校验层直接拒，提示「新建 session，上下文不继承」 |
| architect 类 subagent 不可用 | 可能静默降级为自审自批 | 必须 `HANDOFF: blocked`；禁止自审自批 |
| architect 类被 cancel | 半成品 ADR 留在工作树 | 主会话 `git status docs/adr/` 复核，补完或 `git restore` |
| 跨 worktree 同 `plan_ref` 并发 | 共享 `revision_count`、`discovery.md` 可能互相覆盖 | 已知缺口，本设计不修（见 ADR 后果章） |

## 6. 与既有机制的关系

- **D4 单槽 / D7 优先级**：不变。handoff 释放沿用 `claim_gen` 授权链，不新增释放路径。
- **`ADR-front-stop-ownership`**：不变。归属门控仍在 resume / cancel 上生效。
- **角色矩阵**：不变。后端 `current_role` 恒 `builder`；`role_class` 是派发参数，不是治理身份。
- **审查配对**：不变。architect 类后端跑 oracle→critic 属产出者收口，主会话 architect 做同一动作时判据相同。

## 7. 实施顺序

1. lib：`validateBrief` 值域 → `classPermissions` → `assertRoleClassCompatible` → `buildBrief` → `registerSession`/resume → 工具 input schema。
2. tests：class 校验正反例、权限数组断言、resume class 比对、回归（`bun test tests/` + anchors）。
3. prompts：`build.md` HANDOFF 契约与 `role_class` 读取规则 → `plan.md` / `front.md` resume 前置判据。
4. 文档：本文与 ADR；`docs/MULTI-AGENT-DESIGN.md` 一句汇总。

## 8. 验收

见 ADR「Verification」章（V1–V14 ↔ change 的 AC1–AC14；change 追加 AC15–AC23 为实施级判据）。结构性判据进单测/e2e；「模型是否真的不越类」属 prompt 判据，不进 CI。
