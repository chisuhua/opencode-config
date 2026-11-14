# ADR：被派发工程后端以 role_class 声明能力边界，跨类必交回主会话

## 元数据

| 字段 | 值 |
|---|---|
| Status | Accepted（2026-11-13 用户签批）；**同日 D3 修订**（用户选 **J**：builder 上限改为 `scope − archRoots` 的两级规则，依据 `feedback-20261113-001`）；**2026-11-14：`ADR-class-write-scope-alignment` 修订 D3 的 verifier 写集行（方向已签批，实施时与代码同批落改 —— 本行当前描述的是现行实现）** |
| Date | 2026-11-13 |
| Author | architect（主会话） |
| Parent | `ADR-plan-delegate-engineering-session`（D1–D7）、`ADR-front-stop-ownership`（归属门控） |
| 关联 change | `openspec/changes/backend-handoff-role-class/`（已立项，2026-11-13） |
| 配套设计 | `docs/backend-handoff-role-class.md` |
| AC 映射 | 本文 V1–V14 ↔ change 的 AC1–AC14；**D3 修订**的 V15–V21 ↔ change 的 AC24–AC31（V16 拆两条：AC25 / AC26）；change 追加 AC15–AC23 为实施级判据。**逐条口径以 change 的 proposal 为准** |
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
| `builder` | `scope` **减去** `archRoots(workRoot)`（两级规则见下） |
| `architect` | `archRoots(workRoot)` ∪ `.rddf/reviews/**` ∪ `.rddf/config/arch-docs.json` |
| `verifier` | 仅 `.rddf/reviews/**` |

`archRoots` 按 `.rddf/config/arch-docs.json` 三态解析，**与 `prompts/build.md` §架构文档范围 的目录集口径同一套**（不另立第二答案）：

- 态 1（配置可读、`arch_paths` 非空、其中至少一条存在）→ `arch_paths`；
- 态 2/3（缺失 / 为空 / 损坏 / 全部失效）→ **fallback 目录集**中实际存在者 —— 代码侧用**闭合清单**：`docs/adr`、`docs/architecture`、`docs/architecture/adr`、`docs/designs`、`docs/design`、`adr`、`rfc`、`specs`（顺序固定；不实现 `scripts/arch-docs-init.sh` 的 maxdepth/名字启发式 —— 那是"发现待建目录"的工具口径，跑一次 `--refresh` 后它们就进 `arch_paths` 了）；
- 仍无 → 空集 ⇒ architect 派发被拒（V18：类边界不存在，减法退化为空集）。

**解析根 = `workRoot`**（与 scope 解析、权限资源同根 —— 否则就是「A 树校验、B 树写盘」）。闭合清单与 `prompts/build.md` 的目录集必须一致，由 `tests/config-guards.test.ts` 钉住（防两份定义漂移）。`.rddf/reviews/**` 必须在内：ADR 完成的标志第 5 条要求审稿报告由 architect 收口时誊写到该目录。

**builder 的两级规则（D3 修订，2026-11-13）**：`builder` 的上限不能只写 `scope` —— 那是恒真式（scope 含 `docs/adr` 时写 ADR 完全合法），「只做 builder 类任务」这一诉求会落空（实测见 `feedback-20261113-001`：后端照改了 ADR，`changed_files=["docs/adr/ADR-demo.md","src/app.ts"]`）。

1. **窄目标 ⇒ 派发被拒**：任一 scope 项**落在**某个 arch root 之内（等于该 root，或以 `root/` 开头）⇒ 拒绝派发，错误信息明说「架构文档属 `architect` 类」。判据：调用方把 arch 目录显式写进 scope = 明确要做架构写作 ⇒ **类选错了**，fail fast 比让后端跑一轮更省。
2. **宽目标 ⇒ 减掉 arch 路径**：scope 是 arch root 的**祖先**（`.` / `docs` / 绝对路径前缀）⇒ 允许派发，但在 session 权限**数组末尾**（`classSubagentRules()` 之后）追加 arch root 的 `edit deny` —— 位置必须在所有 allow 之后（`evaluate` 取 findLast），且末尾是唯一对未来组装变更免疫的位置。资源形态钉 **`<root>` + `<root>/*`**（本仓 `Wildcard.match` 的 `*` 跨 `/` ⇒ 一条覆盖深路径），**不用 `<root>*`**（会误伤 `docs/adr2` 这类兄弟目录）；`write` / `patch` 与 `edit` 同一权限 action ⇒ 一条 deny 覆盖全部写工具；`grants` 的 `GRANT_FORBIDDEN` 含 `edit`/`write` ⇒ 调用方无法抵消。后端写 arch 路径时被权限拒绝 ⇒ 按 HANDOFF 契约交回主会话。

**realpath 三作用点**（软链不得绕过）：① **派发判定**（窄/宽分级的输入）；② `archRoots` 计算（arch root 自身是软链时用解析后的真实路径）；③ 目标不存在时解析**最近存在的祖先**。方向 1（arch root 是软链）与方向 2（scope 项软链进 arch 树）都要按解析后的路径判。

**archRoots 为空时**（无配置、无 `docs/adr`）：类边界不存在 ⇒ 减法退化为空集、不追加 deny、行为回到「builder 按 scope 写」；此时窄目标拒绝也不触发（没有可指名的 `architect` 目标 ⇒ 错误文案回退为「本工程没有架构文档目录」）。

**为什么不是单条规则**：纯拒绝会让 `scope: ["."]` 这种宽派发在**任何有 `docs/adr` 的仓库**上直接失败（可用性悬崖，且调用方往往只是没意识到 refactor 会碰到 arch 目录）；纯减法则让「明确派去做架构写作」的调用静默跑一轮才在写盘时失败。两级规则各自覆盖一种意图，代价是多一条判定分支 + 一条权限追加。

### D4 `subagent` 三类统一白名单

`{explore, librarian, oracle, metis, critic}`；写法 `deny *` 在前、逐条 `allow` 在后。

- 必须保留：`prompts/build.md` 把 builder→critic、verifier→explore/critic 定为流程义务，全 deny 会废掉固定审查链。
- 必须排除：`general` / `context-builder` 的 `shell: {"*": "allow"}` 可经重定向写盘、绕开 edit 边界；其余五个为 `shell: {"*": "deny"}` + 只读命令白名单。
- 结构上限：`build` 是 primary agent，拉不起可写后端（内核直拒），白名单只需管只读侧。

### D5 handoff = 自然结束，凭据唯一权威

后端交回时：① 先用 `rddf feedback add` 落凭据（single writer，`revision_count` 上限即断路器）；② 回复首行 `HANDOFF: <kind>`；③ 结束回合（槽自动释放 —— **状态投影惰性**，识别判据见下行的「识别」条）。

- **不新增** `handoff_pending` / `SlotState` / delivery 判态 / session metadata 字段。`no_work_evidence` 只认「角色开场白 / model_switched」，HANDOFF 文本不触发，`outcome` 保持 `succeeded`。
- 识别：同步路径看 `summary.last_assistant_text` 首行（**triage 提示，不作门禁**）；异步路径**没有完成通知** —— 由用户回来、或主会话下次读 `sessions` 观测到 `running=false` 后，再读 `rddf feedback list`（记录为唯一权威）。⚠ **不必等 `state=idle`**：槽位释放是 **reconcile-on-read**（惰性），自然完成后 `state` 可能仍为 `active`；此时 `running=false` + `outcome=succeeded` 即足以继续，**不得因 `state` 未翻转而等待**。（D5 措辞修订 2026-11-14：澄清「完成」= 轮询观测，无决策变更）
- kind 复用既有三类，禁止第三套标签；验收阶段映射 `implementation_gap → ac-fail`、`proposal_drift → needs-revision`；纯换类不需改计划 ⇒ `blocked`（不复用 `revision_count`：它衡量的「同一 change 被修订几轮」，纯换类不改变计划内容，计入会把额度耗在与修订无关的交接上）。

### D6 resume 的 scope 与 class 都不可漂移

- scope ⊆ 原 scope ⇒ `resume_session` + 新 `task`；需扩 scope ⇒ 新建 session（并声明上下文不继承）。
- `role_class` 从 `pair.json` 读回，简报文本由持久化值生成；brief 与登记不一致 ⇒ 硬拒。存量条目（本决策落地前派发、无 `role_class` 字段）按缺省 `builder` 解释，与 D1 缺省口径一致。
- 同一 session 无换类入口（无 `set_class` 工具；`auto_switch_window` 对被派发 session 不生效）。

### D7 architect 类可有条件转 ADR Status

仅限它**本次产出**的 Draft ADR 向前转（→ Proposed / Accepted / Rejected），且须同时满足：oracle→critic 双审完成、BLOCKER 全闭并经 1 次复审验闭合、ADR 完成标志 5 条齐备（本 ADR 的关联 change 已立项 ⇒ 指向 `openspec/changes/backend-handoff-role-class/`；尚未立项的 ADR 用 `backlog:` 占位）。对**已签批 ADR** 的决策修改或取代必须 handoff。`subagent` 不可用 ⇒ `HANDOFF: blocked`，**禁止自审自批**。

### D8 校验分两层，硬拒早于建 session

① 值域 / knowledge 互斥 → `validateBrief`（纯函数，`lib/delegate-core.ts`）；② class×scope 路径相容性 + resume 与 `pair.json` 一致性 → `assertRoleClassCompatible(brief, workRoot)`，在 `session.create` 与 `registerSession` 之前，同步与异步两条链路各调用一次（权限组装同样抽 `classPermissions` 单一实现，防两链路漂移）。**不变量：class 规则（含 builder 的 arch deny）恒为 `permissions` 数组末尾** —— 否则未来任何在其后追加的 `allow` 会经 `findLast` 翻盘。

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
| H. builder 上限 = `scope`（原 D3） | 否（2026-11-13 修订） | **恒真式**：scope 含 `docs/adr` 时写 ADR 合法 ⇒ 类约束对 builder 真空，用户「只做 builder 类任务」的诉求落空（`feedback-20261113-001` 实测） |
| I. builder 上限 = 纯拒绝（scope 撞 arch 即拒） | 否 | 对 `scope: ["."]` 的宽派发是可用性悬崖（任何有 `docs/adr` 的仓库都派不出 builder），而调用方往往只是没料到 refactor 会碰 arch 目录 |
| J. builder 上限 = `scope − archRoots`（**采纳**，两级） | **采纳** | 窄目标 fail fast（类选错当场暴露）；宽目标减权限（写盘被拒 ⇒ 交回），两种意图各得其所；两条判定都在既有层（派发校验 + 权限组装），无新状态 |

## 后果 / 代价

**正面**

- 后端的「我是谁」有结构性答案：越类写盘在权限层被拒，不依赖模型是否读了嘱咐。
- 主会话保留唯一的「换类」与「改计划」决策权；交接有可审计凭据（feedback 记录 + `pair.json`）。
- 不新增工具/状态 ⇒ 学习成本与调试面不扩大；`sessions` / `suspend` / `cancel` / D4 / D7 全部原样可用。

**负面**

- `shell` 不在结构约束内：后端仍可用 `> file` 写到 scope 外。这是与现状等价的既有弱点，只是现在写进了契约（不再假装不存在）。
- 三类共用 `revision_count`（默认 3）：频繁换类会消耗额度；纯换类走 `blocked` 以避开计数，但语义略松。
- 串行：三类都受单槽约束，plan 想「同时派三类」在同一工作树必然排队。
- **被派发的 builder 写不了架构文档**（D3 修订；主会话 builder 的编辑面不受影响 —— 见 `prompts/build.md` 角色矩阵的主体限定）：想在实施中顺手补一条 ADR 笔记，必须显式改用 `architect` 类（或由主会话做）；宽 scope 的派发不会因此失败，但写 arch 路径会拿到 permission denied ⇒ 触发一次 HANDOFF（多一轮往返，换来的是"越类不可能静默发生"）。为让它可解释，简报的「运行身份」段在 builder 类且存在 arch 目录时**回显不可写目录**（`架构文档目录（不可写，属 architect 类）: docs/adr`）。

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
- [ ] V15 `role_class=builder` 且 scope **落在** arch root 内（`docs/adr` / `docs/adr/x.md` / `docs/adr/../adr` / `./docs/adr/` / 绝对路径形式）⇒ **派发被拒**，错误信息指名 `architect` 类；**混合 scope**（`["src","docs/adr"]`）同样拒（「任一」语义）；归一化与 V10 同源
- [ ] V16 `role_class=builder` 且 scope 是 arch root 的**祖先**（`.` / `docs`）⇒ 派发放行，但权限净效果：`edit docs/adr/x.md` ⇒ **deny**、`edit src/a.ts` ⇒ **allow**、`edit docs/adr2/x.md` ⇒ **allow**（负向判据，锁 deny 形态）；绝对路径写形式同样 deny；`write` / `patch` 工具同样 deny（同一 action）；注入 `grants:[{edit,...}]` 仍 deny
- [ ] V17a arch root 自身是软链（`docs/adr` → `src` 或仓库外）⇒ 派发按窄目标拒；若解析后落在工程根外，视为无 arch 边界（按 V18 处理）
- [ ] V17b scope 项是软链、解析后落在 arch 树内（`docs/x` → `docs/adr`）⇒ 派发被拒；目标不存在时按最近存在的祖先解析
- [ ] V18 archRoots 为空（无配置且 fallback 目录集**一项都不存在**）⇒ 减法退化为空集、不追加 deny、builder 按 scope 写；错误文案回退为「本工程没有架构文档目录」
- [ ] V19 worktree 下 `archRoots` 与权限资源**同根**（`workRoot`）解析：`git worktree` 中的派发，deny 规则命中的是 worktree 内路径
- [ ] V20 `archRoots` 的 fallback **闭合清单**与 `prompts/build.md` §架构文档范围 的目录集**逐项一致**（守卫测试；防两份定义漂移）
- [ ] V21 `builder` 类且存在 arch 目录 ⇒ 简报「运行身份」段回显不可写目录（让 `Permission denied` 可解释）
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
