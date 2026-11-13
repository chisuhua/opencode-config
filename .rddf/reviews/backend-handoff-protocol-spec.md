# 后端 handoff + role_class 协议（plan ↔ 工程 session）—— 规格 v3

> 输入：用户想法（2026-11-13 两轮）→ metis 差距分析 ×2 → oracle 裁定 ×2
> 状态：**已落 docs + ADR（Accepted 2026-11-13）+ 立项**（`openspec/changes/backend-handoff-role-class/`）；逐条验收以该 change 的 proposal 为准。
> v3 = v2 + oracle（8 条唯一裁定）与 metis（6 条 P0）的合并结果。**下一节「裁定表」是唯一口径**，正文与旧表格冲突时以裁定表为准。
> v4 = v3 + 本文第 4 条行尾的 v4 修订注（异步面无推送通道；口径见 R-11）。**历史条目保留原文**，仅行尾标注修订。

---

## 0. v3 裁定表（唯一口径，不再留开放项）

| # | 问题 | 裁定 | 理由 |
|---|---|---|---|
| R-1 | v2 的 R5「只派 builder」 | **废除**。三类均可派发，由主会话按任务选类 | R5 是 v1 残留，与用户本轮要求及 v2 的 2b.1 表直接矛盾 |
| R-2 | `role_class` 落在哪个字段 | **新增独立字段** `sessions[sid].role_class`；`current_role` 保持恒 `builder` | `current_role` 是治理身份（值域含 architect/verifier 的**签批权**语义），与本次能力画像同名不同权；且 build.md 允许同 session 内自动切 `current_role`，复用会打穿「换类 = 必须 handoff」 |
| R-3 | architect 类 edit 边界 | `archRoots(projectDir)` ∪ `.rddf/reviews/**` ∪ `.rddf/config/arch-docs.json` | ADR 完成标志第 5 条要求审稿报告落 `.rddf/reviews/`；`arch-docs.json` 是架构目录配置本体；`archRoots` 按 arch-docs.json 三态解析（不硬编码目录名） |
| R-4 | `subagent` 策略 | **三类统一白名单** = `{explore, librarian, oracle, metis, critic}`（`deny *` 在前，逐条 `allow` 在后） | build.md 把 builder→critic、verifier→explore/critic 定为**流程义务**，全 deny 会废掉固定审查链；但 `general` / `context-builder` 的 `shell: * allow` 可经重定向写盘、绕过 edit 边界 ⇒ **排除** |
| R-5 | architect 类能否转 ADR Status | **有条件允许**：仅限它本次产出的 Draft ADR 向前转（→ Proposed/Accepted/Rejected）；条件 = 双审完成 + BLOCKER 闭合 + 完成标志 5 条；对已签批 ADR 的决策修改或取代 **必须 handoff**；`subagent` 不可用 ⇒ `HANDOFF: blocked`，**禁止自审自批** | Status 转换是产出者的收口步（build.md 一次成稿流程第 4 步），不是主会话特权；主会话 architect 做同一动作同样是自我誊写判定 |
| R-6 | verifier 类可派发吗 | **可派发**，不构成「自己验自己」（换类 = 新派发 = 异 session） | 比现状「builder 完成时角色内建自审」更独立；只验不改由 edit 边界结构性保证 |
| R-7 | 单槽是否给只读型类豁免 | **不豁免**，维持一刀切 | architect 与 verifier 的写集在 `.rddf/reviews/**` 相交，豁免也换不来真并行；豁免 = 第二套门控 |
| R-8 | `kind=knowledge` + `role_class` | **硬拒**（与「knowledge 不接受 grants」同模式） | knowledge session 不进 role.json，class 无处落；静默忽略会让人误以为生效 |
| R-9 | 校验落点 | **两层**：① 值域 / knowledge 互斥 → `validateBrief`（纯函数）；② class×scope 路径相容性 + resume 一致性 → `assertRoleClassCompatible(brief, workRoot)`，在 `session.create` 与 `registerSession` 之前，同步 + 异步两链路各调一次 | ② 依赖 workRoot 绝对路径，`validateBrief` 阶段没有；硬拒必须早于写登记，否则留半成品副作用 |
| R-10 | resume 的 class 来源 | **`pair.json`**，不是 brief；brief 不一致 ⇒ 硬拒；简报文本由持久化值生成 | 权限在 create 时定型、resume 不重设 ⇒ brief 覆盖 = 权限与声明不一致（类漂移） |
| R-11 | handoff 是否需要新 delivery 判态 | **不需要**。不新增 outcome 值、不新增 `SlotState` | `no_work_evidence` 只认「角色开场白 / model_switched」，HANDOFF 文本不触发 ⇒ outcome 保持 `succeeded`；识别靠 feedback 记录（权威）+ `summary.last_assistant_text`（同步 triage） |
| R-12 | 已有缺口（登记不做） | ① 跨 worktree 同 `plan_ref` 并发（共享 `revision_count`、`discovery.md` 可能被覆盖）；② `shell` 类约束仅为提示性；③ architect 类被 cancel 后的半成品 ADR 由主会话复核清理 | 均属既有机制边界，修它们要动 D4/D7 或做 per-class shell 沙箱，另立项 |

---

## 1. 用户原话与三处偏差（v1 已定，保留）

| # | 偏差 | 事实 |
|---|---|---|
| 1 | 「resume 回到主会话」方向反了 | resume 恒由主会话发起（后端无 delegate/suspend 工具） |
| 2 | 「保留上下文」≠「保住槽」 | 上下文由 session 本体 / `pair.json` / role 分区 / feedback 文件保全；同步 `delegate` 收尾即自翻转 `idle`、不占槽 |
| 3 | 「architect / verifier 不能派发」 | **v3 推翻**：可派发，但只能产出**草稿 / 证据**；签批与判决仍由主会话角色收敛（见 R-5 / R-6） |

---

## 2. 协议（五步）

```
0. 主会话（plan / planner 角色）派发：brief = plan_ref + scope + acceptance + role_class
1. 后端执行；遇到「需要 planner 决策」或「需要别的类」⇒ 停在动手前
2. 后端先落凭据：rddf feedback add <proposal> --from rdd-builder --kind <kind> --body "<5 项模板>"
3. 后端回复首行 `HANDOFF: <kind>`，然后结束 ⇒ 同步收尾自翻转 idle，槽释放
4. 主会话：同步看 summary.last_assistant_text 首行；异步在完成通知后 `rddf feedback list` + `sessions` 确认 idle（v4 修订 2026-11-14：异步面无推送通道，删「完成通知」表述；口径见 R-11）
   → 切角色写 role.json + 开场报告 → 改 plan / proposal
5. 主会话 resume：scope ⊆ 原 scope ⇒ delegate(resume_session=…, task=建议下一步)
   scope 需扩大 ⇒ 新建 session（resume 不改 permissions，上下文不继承）
```

**5 项交接模板**（缺一即无效 handoff）：① kind；② 阻塞点（`file:line` / task 编号）；③ 需要什么决策；④ 已完成 / 未完成；⑤ 建议的下一步指令草案。

**kind 映射（禁止第三套标签）**：验收阶段 `implementation_gap → ac-fail`、`proposal_drift → needs-revision`；换类但不需要改计划/AC ⇒ `blocked`（不计 `revision_count`）。

---

## 3. role_class 三类

### 3.1 能力画像

| role_class | 允许做什么 | edit 边界（结构性） | subagent 白名单 | 治理边界 |
|---|---|---|---|---|
| `builder` | 按 scope 实施代码/测试 | `scope` | 统一白名单（R-4） | 只实施；评审由主会话发起 |
| `architect` | 读代码、写 ADR / 架构文档、自己跑 oracle→critic | R-3 三元并集 | 统一白名单 | 可有条件转 Status（R-5）；已签批 ADR 的决策变更必须 handoff |
| `verifier` | 读、跑测试、写验收报告 | 仅 `.rddf/reviews/**` | 统一白名单 | 只出证据与判决，不改实现、不改 tasks.md |

**约束强度（写进简报，避免高估）**：`edit` / `subagent` 结构性生效（session permissions，deny 覆盖 agent allow）；**`shell` 不结构性**（`CONSTANT_DENY` 不挡 `> file` / `tee`）⇒ 主会话收回后以 `git status` 复核。

**subagent 白名单为什么排除 `general` / `context-builder`**：二者 `shell: {"*": "allow"}`，可经 `> file` 绕过 edit 边界；其余五个 `shell: {"*": "deny"}` + 只读命令白名单。

### 3.2 校验（R-9 两层）

1. `validateBrief`：`role_class` 缺省 `builder`；∉ 三类 ⇒ 抛；`kind=knowledge` 且带 `role_class` ⇒ 抛。
2. `assertRoleClassCompatible(brief, workRoot)`：按 R-3 / scope 判 class 相容性；`resume` 时读取 `pair.json` 的 `role_class`，与 brief 不一致 ⇒ 抛。两条链路（同步 / 异步）都在 `session.create` 之前调用。

### 3.3 简报结构变化

```
## 运行身份
- 你是被派发的后端工程 session（owner=front|plan）；本 session 的 role_class = <builder|architect|verifier>。
- 只做本类任务：判断标准是「要写的东西在不在本类 allowlist 内」——读任何路径都不算越类。
- 需要别的类的工作 ⇒ 停在动手前，按 HANDOFF 协议交回主会话（不得自行切换类）。
- 若已被 suspend / resume，上下文保留，role_class 不变（来自 pair.json，不接受改写）。

## 执行要求（按 class 分支）
- builder：只在 scope 内改动；按 acceptance 自验；不 commit / push。
- architect：产出 ADR/架构文档；跑 oracle→critic 并按完成标志自查；不按 acceptance 验实现；不 commit / push。
- verifier：只写 .rddf/reviews/**；按判据来源逐条取证；不改实现、不改 tasks.md；不 commit / push。
```

---

## 4. 明确不做（非目标）

- 不新增 `handoff` / `request_planner` 工具；不新增 `SlotState`；不新增 session metadata 字段。
- 不新增 `verifier` / `architect` agent；不扩 `ALLOWED_AGENTS`；不写三套 prompt。
- 不让后端自动切角色；`auto_switch_window` 对被派发 session 不生效。
- 不做自动闭环（不自动改计划、不自动 resume）。
- 不为只读（knowledge）session 定义 handoff 语义。
- 不扩展 `extractBlocked()`；不新增 delivery 判态（R-11）。
- 不做 per-class `shell` 沙箱（shell 永不参与 class 判定）。
- 不做 role_class 专属验收体系（复用 `kind` + 两个既有标签的映射）。
- 不做「三类并行」的槽位改造（D4 / D7 不动）。

---

## 5. 改动面

| 文件 | 改动 | 归属 |
|---|---|---|
| `lib/delegate-core.ts` `validateBrief` | `role_class` 值域 + knowledge 互斥 | builder |
| `lib/delegate-core.ts` 新增 `assertRoleClassCompatible` / `archRoots` / `classPermissions` | 校验 + 权限组装单一实现 | builder |
| `lib/delegate-core.ts` `buildBrief()` | 运行身份段 + 执行要求按 class 分支 | builder |
| `lib/delegate-core.ts` `writeRoleSession` / `registerSession` / resume 分支 | 写 `role_class` 字段（`current_role` 不动）、pair 持久化、resume 比对 | builder |
| `lib/delegate-core.ts` + `lib/delegate-async.ts` 工具 input schema | delegate / dispatch 接受 `role_class` | builder |
| `prompts/build.md`「实施阶段的新发现」+「状态来源」 | HANDOFF 契约 + `role_class` 读取规则 | architect |
| `prompts/plan.md` / `prompts/front.md` | resume 前置判据（同步首行 / 异步 feedback + sessions；扩 scope = 新 session） | architect |
| `docs/MULTI-AGENT-DESIGN.md` | 一句汇总 + 指向设计文档 | architect |

---

## 6. 验收判据

**结构性（进单测 / e2e）**

| # | 判据 |
|---|---|
| AC1 | handoff 后该后端 `state == idle`，同 owner 可即刻再派 |
| AC2 | feedback 记录存在、kind ∈ {needs-revision, ac-fail, blocked}、落点正确 |
| AC3 | 同步返回的 `summary.last_assistant_text` 首行可分类（**观测项，不作门禁**） |
| AC4 | `role_class` 缺省 builder；非法值 ⇒ 派发抛错 |
| AC5 | `kind=knowledge` + `role_class` ⇒ 抛错 |
| AC6 | `role_class=architect` 且 scope 含 `src/**` ⇒ 拒；scope 含 `docs/adr/x.md` / `.rddf/reviews/x.md` / `.rddf/config/arch-docs.json` ⇒ 放行 |
| AC7 | `role_class=verifier` 的 session 权限**净效果**：`edit .rddf/reviews/x.md` ⇒ allow、`edit src/a.ts` ⇒ deny（`edit:* deny` 在**前**、按类 allow 在后 —— `evaluate` 取 findLast，顺序反了 verifier 连 reviews 都写不了） |
| AC8 | 三类 session 权限均含 `subagent: * deny` + 五个只读 agent allow；不含 `general` / `context-builder` |
| AC9 | `role.json` 分区出现独立 `role_class` 字段，且 `current_role` 仍为 `builder` |
| AC10 | `pair.json` 持久化 `role_class`；resume 带不同 class ⇒ 硬拒；brief 文本取自持久化值 |
| AC11 | `scope=["."]` / `["src/../docs/adr"]` / 绝对路径三种写法判定一致（复用 `scopeEditRules` 的归一化） |
| AC12 | 同一 session 无换类入口（无 `set_class` 工具；resume 不接受不同 class） |
| AC13 | 回归：`bun test tests/` 全绿 + anchors 23/23 + D4/D7 判据不变 |

**只能靠 prompt 判据（不进 CI，避免 flaky）**

- 给 builder 类后端一个「先改 ADR 再实现」的任务 ⇒ 断言 `docs/adr/**` 零变更 + feedback 记录 + `idle`。
- `subagent` 不可用时 architect 类必须 `blocked` handoff，不得自审自批。

---

## 7. 与既有 ADR 的关系

不改 D4（单槽）/ D7（plan 优先、不抢占、跨 owner-kind 硬拒）/ `ADR-front-stop-ownership`（归属门控）。handoff 的槽释放沿用既有 `claim_gen` 授权链。`role_class` 是**派发参数**，不参与 `role.json` 的角色切换语义。
