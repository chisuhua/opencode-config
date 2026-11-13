# ADR：被派发工程后端以 role_class 声明能力边界，跨类必交回主会话

## 元数据

| 字段 | 值 |
|---|---|
| Status | Accepted（2026-11-13 用户签批） |
| Date | 2026-11-13 |
| Author | architect（主会话） |
| Parent | `ADR-plan-delegate-engineering-session`（D1–D7）、`ADR-front-stop-ownership`（归属门控） |
| 关联 change | `openspec/changes/backend-handoff-role-class/`（已立项，2026-11-13） |
| 配套设计 | `docs/backend-handoff-role-class.md` |
| AC 映射 | 本文 V1–V14 ↔ change 的 AC1–AC14；change 追加 AC15–AC23（实施级判据）。**逐条口径以 change 的 proposal 为准** |
| 工作规格 | `.rddf/reviews/backend-handoff-protocol-spec.md`（v3） |

## 背景与问题

`plan` 主会话可以派发工程后端（`ADR-plan-delegate-engineering-session` D1/D2）。但派发契约里只有 `plan_ref` / `scope` / `acceptance`，**没有「本次派发允许做哪一类工作」**：

- 同一 `build` agent 被派去写实施、写 ADR、跑验收时，能力差异只体现在 `scope`。写 ADR 的后端拿到代码 scope，跑验收的后端能改实现 —— 边界靠简报里的自然语言嘱咐。
- 后端发现自己需要计划决策时，现有治理（`prompts/build.md`「实施阶段的新发现」的停下义务）只在 prompt 里，没有任何可观察的结构性证据；主会话也无法区分「这是交接」与「这是失败」。
- 用户提出的诉求是：「简报里让被派发 session 只允许做某一类角色任务；需要切换其他角色就结束、把控制权交回主会话；主会话可派 builder，也可派 architect / verifier 类」。

关键事实（决定了方案形状）：

1. **session metadata 不进模型上下文**；后端只能读系统提示 + 委托简报 + 历史 ⇒ 简报是唯一按 session 注入的身份通道。
2. **`edit` / `subagent` 可在 session 级结构性约束**（session rules 在 agent rules 之后、`evaluate` 取 findLast、`denied()` 只认 deny）；**`shell` 不能**（`CONSTANT_DENY` 不挡 `> file` / `tee`）。
3. **resume 不重设 permissions**（`edit` 在 `session.create` 时定型）⇒ 新指令必须落在原 scope，扩 scope 只能新建 session。
4. **`build` 是 primary agent** ⇒ 任何后端都拉不起可写后端；subagent 面天然只有只读 agent。
5. **同步 `delegate` 收尾自翻转 `idle`、不占槽** ⇒ 「保住上下文」不需要「保住槽」。

## 决策

**本次派发在简报里显式声明 `role_class`（`builder` / `architect` / `verifier`），它定义本次允许写什么、允许拉哪些 subagent；需要别的类 ⇒ 停在动手前，落凭据后交回主会话。** 以下为实现层面的唯一口径。

### D1 `role_class` 是派发参数，缺省 `builder`

`delegate` / `dispatch` 接受 `role_class ∈ {builder, architect, verifier}`，缺省 `builder`，非法值抛错。`kind=knowledge` 与 `role_class` 互斥（硬拒，与「knowledge 不接受 grants」同模式）。

### D2 落点是独立字段，`current_role` 不动

`role.json` 的 `sessions[sid].role_class` 是新增字段；`current_role` 仍写 `builder`。理由：`current_role` 是**治理身份**（值域含 architect/verifier 的签批语义），且允许同 session 内自动切换；复用会同时造成「同名不同权」误配与「换类 = 必须 handoff」被打穿。

### D3 三类的 edit 边界

| class | 边界 |
|---|---|
| `builder` | `scope` |
| `architect` | `archRoots(projectDir)` ∪ `.rddf/reviews/**` ∪ `.rddf/config/arch-docs.json` |
| `verifier` | 仅 `.rddf/reviews/**` |

`archRoots` 按 `.rddf/config/arch-docs.json` 三态解析（配置可用 → `arch_paths`；缺失/为空/损坏 → fallback 目录集中实际存在者；全无 → 空集），不硬编码目录名。`.rddf/reviews/**` 必须在内：ADR 完成的标志第 5 条要求审稿报告由 architect 收口时誊写到该目录。

### D4 `subagent` 三类统一白名单

`{explore, librarian, oracle, metis, critic}`；写法 `deny *` 在前、逐条 `allow` 在后。

- 必须保留：`prompts/build.md` 把 builder→critic、verifier→explore/critic 定为流程义务，全 deny 会废掉固定审查链。
- 必须排除：`general` / `context-builder` 的 `shell: {"*": "allow"}` 可经重定向写盘、绕开 edit 边界；其余五个为 `shell: {"*": "deny"}` + 只读命令白名单。
- 结构上限：`build` 是 primary agent，拉不起可写后端（内核直拒），白名单只需管只读侧。

### D5 handoff = 自然结束，凭据唯一权威

后端交回时：① 先用 `rddf feedback add` 落凭据（single writer，`revision_count` 上限即断路器）；② 回复首行 `HANDOFF: <kind>`；③ 结束回合（槽自动释放）。

- **不新增** `handoff_pending` / `SlotState` / delivery 判态 / session metadata 字段。`no_work_evidence` 只认「角色开场白 / model_switched」，HANDOFF 文本不触发，`outcome` 保持 `succeeded`。
- 识别：同步路径看 `summary.last_assistant_text` 首行（**triage 提示，不作门禁**）；异步路径在完成通知后 `rddf feedback list`（权威）+ `sessions` 确认 `idle`。
- kind 复用既有三类，禁止第三套标签；验收阶段映射 `implementation_gap → ac-fail`、`proposal_drift → needs-revision`；纯换类不需改计划 ⇒ `blocked`（不复用 `revision_count`：它衡量的「同一 change 被修订几轮」，纯换类不改变计划内容，计入会把额度耗在与修订无关的交接上）。

### D6 resume 的 scope 与 class 都不可漂移

- scope ⊆ 原 scope ⇒ `resume_session` + 新 `task`；需扩 scope ⇒ 新建 session（并声明上下文不继承）。
- `role_class` 从 `pair.json` 读回，简报文本由持久化值生成；brief 与登记不一致 ⇒ 硬拒。存量条目（本决策落地前派发、无 `role_class` 字段）按缺省 `builder` 解释，与 D1 缺省口径一致。
- 同一 session 无换类入口（无 `set_class` 工具；`auto_switch_window` 对被派发 session 不生效）。

### D7 architect 类可有条件转 ADR Status

仅限它**本次产出**的 Draft ADR 向前转（→ Proposed / Accepted / Rejected），且须同时满足：oracle→critic 双审完成、BLOCKER 全闭并经 1 次复审验闭合、ADR 完成标志 5 条齐备（本 ADR 的关联 change 已立项 ⇒ 指向 `openspec/changes/backend-handoff-role-class/`；尚未立项的 ADR 用 `backlog:` 占位）。对**已签批 ADR** 的决策修改或取代必须 handoff。`subagent` 不可用 ⇒ `HANDOFF: blocked`，**禁止自审自批**。

### D8 校验分两层，硬拒早于建 session

① 值域 / knowledge 互斥 → `validateBrief`（纯函数，`lib/delegate-core.ts`）；② class×scope 路径相容性 + resume 与 `pair.json` 一致性 → `assertRoleClassCompatible(brief, workRoot)`，在 `session.create` 与 `registerSession` 之前，同步与异步两条链路各调用一次（权限组装同样抽 `classPermissions` 单一实现，防两链路漂移）。

### D9 单槽不豁免，不做并行

三类都受**父篇** D4（单槽）与**父篇** D7（优先级、跨 owner-kind 硬拒）约束。architect 与 verifier 的写集在 `.rddf/reviews/**` 相交，豁免也换不来真并行；豁免 = 第二套门控。父篇 D4/D7 不动。

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **A. `role_class` 派发参数 + session 权限（本决策）** | **采纳** | 零新工具、零新状态机；身份声明随简报旅行，能力边界由权限结构性保证；与既有 `scope` / `pair.json` / `feedback` 同构 |
| B. 新建 `architect` / `verifier` 独立 agent | 否 | 需扩 `ALLOWED_AGENTS`（白名单即攻击面），且要各写一套 prompt ⇒ 与 `prompts/build.md` 的角色矩阵形成第二真理源 |
| C. 只派 builder，architect/verifier 全留主会话 | 否 | 放弃「plan 不阻塞地并行做架构草稿/验收」；且主会话 architect 同样是自我誊写判定，独立性没有实质提升 |
| D. 在 session metadata 里记 class | 否 | metadata 不进模型上下文，后端读不到；`pair.json` 才是 resume 可读的权威落点 |
| E. 新增 `handoff_pending` 状态 + 新工具 | 否 | 伪造「占槽等 resume」骗不过活体判定（`stillRunning`）；新增状态/工具 = 第二套生命周期 |
| F. 三类 subagent 全 deny | 否 | 结构性废掉 `prompts/build.md` 的固定审查链（builder→critic、verifier→explore/critic） |
| G. per-class `shell` allowlist | 否（本次） | 要硬隔离需另一套沙箱与绕过面评估，成本远超收益；接受「edit 硬、shell 软」，用收回后 `git status` 复核兜底 |

## 后果 / 代价

**正面**

- 后端的「我是谁」有结构性答案：越类写盘在权限层被拒，不依赖模型是否读了嘱咐。
- 主会话保留唯一的「换类」与「改计划」决策权；交接有可审计凭据（feedback 记录 + `pair.json`）。
- 不新增工具/状态 ⇒ 学习成本与调试面不扩大；`sessions` / `suspend` / `cancel` / D4 / D7 全部原样可用。

**负面**

- `shell` 不在结构约束内：后端仍可用 `> file` 写到 scope 外。这是与现状等价的既有弱点，只是现在写进了契约（不再假装不存在）。
- 三类共用 `revision_count`（默认 3）：频繁换类会消耗额度；纯换类走 `blocked` 以避开计数，但语义略松。
- 串行：三类都受单槽约束，plan 想「同时派三类」在同一工作树必然排队。

**风险**

- **跨 worktree 同 `plan_ref` 并发**（不同 `workRoot` = 不同槽）：会共享 `revision_count`，且 `.rddf/reviews/<change>-discovery.md` 可能互相覆盖。本决策不修，登记为已知缺口，另立 ADR 处理。
- **architect 类被 `cancel`**：半成品 ADR 留在工作树。约定由主会话 `git status docs/adr/` 复核后补完或 `git restore`。
- **`role_class` 成为新的「配置漂移点」**：派发方声明与实际任务不符时，权限会诚实地按声明执行 —— 错的是声明，不是机制。缓解：简报运行身份段要求后端在发现不符时 `HANDOFF: blocked`。

**回滚口径**

- 停传 `role_class` 即回到缺省 `builder`；`role.json` / `pair.json` 里多出的 `role_class` 字段对旧读者是未知键（读取方一律 `?? "builder"`），不需要数据迁移。
- 回滚不触碰 `current_role`、`pair.json` 既有必填字段、D4/D7 判据 —— 本决策的全部增量都在「新字段 + 新校验」，删掉校验即可恢复旧行为。

## Verification（可勾选验收判据）

**结构性（单测 / e2e 必过）**

- [ ] V1 `role_class` 缺省 `builder`；非法值 ⇒ 派发抛错
- [ ] V2 `kind=knowledge` + `role_class` ⇒ 抛错
- [ ] V3 `role_class=architect` 且 scope 含 `src/**` ⇒ 拒；含 `docs/adr/**` / `.rddf/reviews/**` / `.rddf/config/arch-docs.json` ⇒ 放行
- [ ] V4 `role_class=verifier` 的 session 权限**净效果**：`edit .rddf/reviews/x.md` ⇒ allow、`edit src/a.ts` ⇒ deny（`edit:* deny` 在**前**、按类 allow 在后；`evaluate` 取 findLast ⇒ 顺序反了会让 verifier 连 `.rddf/reviews/**` 都写不了）
- [ ] V5 三类 session 权限均含 `subagent: * deny` + `{explore, librarian, oracle, metis, critic} allow`，且不含 `general` / `context-builder`
- [ ] V6 `role.json` 分区出现独立 `role_class` 字段，`current_role` 仍为 `builder`
- [ ] V7 `pair.json` 持久化 `role_class`；resume 带不同 class ⇒ 硬拒；brief 文本取自持久化值
- [ ] V8 `handoff` 后该后端 `state == idle`，同 owner 可即刻再派
- [ ] V9 feedback 记录存在、kind ∈ {needs-revision, ac-fail, blocked}、落点正确
- [ ] V10 `scope=["."]` / `["src/../docs/adr"]` / 绝对路径三种写法判定一致（复用 `scopeEditRules` 归一化）
- [ ] V11 同一 session 无换类入口（无 `set_class`；resume 不接受不同 class）
- [ ] V12 回归：`bun test tests/` 全绿 + `scripts/check-upstream-anchors.sh` 23/23 + 父篇 D4/D7 判据不变

**只能靠 prompt 判据（不进 CI，避免 flaky）**

- [ ] V13 给 `builder` 类后端一个「先改 ADR 再实现」的任务 ⇒ `docs/adr/**` 零变更 + feedback 记录 + `idle`
- [ ] V14 `subagent` 不可用时 `architect` 类必须 `HANDOFF: blocked`，不得自审自批
