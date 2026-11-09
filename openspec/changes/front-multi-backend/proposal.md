# proposal: front-multi-backend

## 背景

ADR `docs/adr/ADR-front-multi-backend.md`（**Accepted，2026-11-09 改写后**）描述的是一批**未实施**的改动：front 的委托能力从**同步单发**升级为**异步派发 + 只读观测 + 名册索引 + 单槽切换**。

用户诉求：**front session 能管理多个后端工程 session**——多个后端分别完成不同的工程目标，各自上下文保持干净。**2026-11-09 补充的需求形态**：同一工作树里常有多个待办目标，各自需要一个上下文干净的工程 session；这些 session **常驻**（不因切换而丢弃），但**同一时刻只允许一个在跑**，由 front 决定**何时切到哪个**（暂停当前、恢复另一个）。

现状 `delegate` 是同步单发（一次调用 = 建/复用 session → 投递简报 → `wait` 30min 上限 → 读 outcome → 返回 summary），四个缺口：时间耦合（front 回合被占住）、归属不可枚举（pair/ledger 按工程仓各存一份）、写隔离缺失（同工作树并发互踩）、上下文污染（resume 不校验目标一致性）。

拆开时间耦合还带出三个**由异步化派生**的洞：终态送达（无 push 通道）、存活性判断（"还在跑"从 `wait` 返回变成推导态）、外部删除可见性（后端"消失"与"从未派发"在 ledger 里同构）。

**本次改写（ADR 第 2 轮）新增的两个决策**：

1. **槽位键从 `canonical_root` 改到 `workRoot`**——原设计按仓互斥，同一仓的多个 linked worktree 被"同 repo 互斥"堵死，worktree 隔离能力等于没实现。已落地的 `ADR-canonical-root-normalization`（commit `23584cd`）把根拆成 `stateRoot`/`workRoot`，正是为此提供前置。
2. **单槽 + 可切换**——同一工作树内多个后端 session 常驻、一次一个活跃、front 可切换（`suspend` 暂停可续 vs `cancel` 终止墓碑）。

前置事实：**19 条运行时探针**（HTTP 层 8 + 插件内直测 8 + oracle 后补 3），见 `.rddf/reviews/front-multi-backend-probes.md`；**上游源码证据**（opencode v2.2.5）见 ADR 元数据「前置事实」行。

## 目标

1. 把 ADR 的 **Verification 1–49** 收敛为 AC 编号（**AC1–AC56**），给出**可逆的映射表**（ADR 条目 ↔ AC；同源条目已合并，见映射表下方说明），供 ADR 元数据回填。
2. 每条 AC 标明**最低可接受证据**与可直接复制的**证据命令**。
3. 明确 Out of Scope 与"Notes to verifier"（已披露残留），避免把有意取舍判成失败。
4. **给出实施必需的契约**：goal_key 的输入与落盘（AC15）、`sessions` 输出 schema（AC29）、dispatch 的写入顺序与失败语义（AC30）、**槽位状态枚举与存量回填（AC40）**、**消费确认的行为判据（AC44）**、**work_root 分组语义（AC43）**——这些是其余 AC 能成立的前提。

### Phase 0：前置测量任务（**不是 AC**）

**在写任何实现代码之前**，先实测「简报已被消费」的可观测判据，产出 `.rddf/reviews/front-multi-backend-consume-probe.md`（含原始返回存档 + 「可靠 / 不可靠」的明确结论）。

> ✅ **Phase 0 已完成（2026-11-09）**：探针 `/tmp/opencode/probe/phase0-consume.ts`，**16 PASS / 0 FAIL**。**结论：判据可靠 ⇒ 不触发降级 ⇒ 按完整形态实施**（含 `suspend` 与切换）。
> **判据（已具体化）**：该简报的 **`message.id` 出现在 `ctx.session.context()` 返回的消息 id 集合中** ⇒ 已消费。源码依据：message 行只在 `InboxDelivered` 的 projector 里创建（`projector.ts:731-758`），而该事件只在 promote 路径发布（`inbox.ts:548`）；入队路径不建 message 行（`projector.ts:761-778`）。
> **两条实测要点（易踩）**：① `prompt()` **在入队时就返回并分配了 `message.id`** ⇒ **「拿到 id」≠「已消费」**，必须以「该 id 出现在 context 的 id 集合里」为准；② pending 窗口的 `time` 只有 `created`/`updated`，**无 `busy`/`idle`** ⇒ 活体信号**不能**当消费信号用。
> **附带坐实**：两份 pending 简报时**第一份先进 context** ⇒ **幽灵注入由运行时坐实** ⇒ 「消费确认」与「`dispatching` 只可 cancel」是**必需**而非保守。

- **为何不是 AC**：AC 是「行为可被判定通过 / 失败」；而这一步的产出是**设计是否成立**的输入，结论会决定实现形态。把它写成 AC 会让「降级」变成一种合规的通过形态。
- **结论决定什么**：可靠 ⇒ 本 change 按**完整形态**实施；不可靠 ⇒ 本 change 进入**降级形态**（「单槽但不可切换」），**降级清单见下方「降级路径」表**。
- **AC44 只保留行为判据**（正例 / 负例 / 有界时延），不承载「判据是否可靠」这个判定。

## 证据规则（先于 AC 生效）

1. **E2E 默认全 skip**（`E2E_REAL_RUNTIME` 未设置时 bats 退出码 0）。**skip ≠ pass**：E2E 未实际执行时，该 AC 判**不可判定**，禁止判通过；须改用该 AC 的"降级证据"。
2. **E2E 用例当前不存在**：`/workspace/main/rdd-workflow-e2e/tests/integration/test_front_delegate_runtime.bats` 现有 **L2-1..L2-15，无任何 dispatch/sessions/suspend/cancel 用例**。⇒ 本 change 的 E2E 判据**依赖该文件新增 L2-16 起的用例**；实施方必须提交该仓库的 commit 并在 Notes 记录 SHA。**未提交则所有"仅 E2E 证据"的 AC 判不可判定**——因此下列 AC 全部给了单测/静态降级证据（**唯一例外是 AC1 的"四个工具实际可调用"**：它需要真实调用，静态只能证明 action 规则存在 ⇒ 无 E2E 时该分项判不可判定，其余分项照常评）。
3. **证据类型有四种**：`单测`（`bun test tests/`）、`E2E`（真实运行时 + 真实模型）、`静态`（配置/`debug agents`/`git show`/`grep`）、**`探测`**（可重放脚本 + **原始返回存档路径** + 明确结论，用于上游语义与前端锚定）。**不设"人工"类型**——verifier 契约要求每条判据至少 1 条工具证据。
4. **观测面污染必须显式测**：AC4 的判据是"调用 `sessions` 前后**被观测后端的会话上下文**不变"——**不是** ledger 行数（ledger 由父插件在结束时写，prompt 投递不会立即产生行，行数不变证明不了没投递）。
5. **权限配置文件写实际生效路径**：`opencode.jsonc` 是**符号链接** → `opencode.jsonc.opencode-go`（`readlink -f` 可验）。静态证据必须解析到后者。
6. **工具可见性的证据边界**：`opencode debug agents` 看到的是**权限矩阵**，不是工具注册表（见 `docs/front-delegate-testing.md:60`）。它只能证明 action 规则存在；"工具真的可见"必须另有真实调用证据（AC1 已据此拆分）。
7. **上游语义锚定**：本 change 依赖 `delivery` 默认值、`time.busy` 存在性、`session.list` 过滤字段三项上游行为。**AC38** 判据为在**装好的环境**实测这些语义；上游变更时该 AC 会先红。⚠️ 探针 Q2（get 在 run 中无 `time.busy`）与 R4（run 中 `busy` 有值）**存在观测冲突**，AC38 必须钉到具体 API（`get` 还是 `list`）。
8. **`opencode debug agents` 首跑可能非 JSON**（location 激活竞争）：重试 ≤3 次或截取首个 `[` 到末尾 `]`。
9. **消费确认判据必须最先锚定（Phase 0，优先于一切实现）**：ADR D7.2 已证明「投递 ≠ 消费」（上游 drain 是 `peek → awaitActivation(可无限阻塞) → prepareContext → promote`）。⇒ **实施的第一步不是写代码，而是执行 Phase 0 测量任务**（见「目标」段），产出 `.rddf/reviews/front-multi-backend-consume-probe.md`。⚠️ **结论为「不可靠」⇒ 本 change 进入降级形态**（「单槽但不可切换」），**完整处置清单见下方「降级路径」表**，并**如实记录降级事实**，**不得**用"看起来没问题"冒充通过。
10. **锁的形态（两条硬禁）**：槽位翻转**不得在锁内 await**，且**不得在锁内调用任何自取同一把 `.role.lock` 的函数**。`withLock` 是同步 `() => void`（`lib/delegate-core.ts:370`）、用 `mkdirSync(recursive:false)` 取锁 ⇒ **不可重入**、10s 硬 deadline（`:388`）⇒ 锁内调 `appendLedger`（`:431-433`）或 `registerSession`（`:460-462`）会**二次取锁 → 死锁 10s 后抛错**。⇒ 一律走「**锁外查询 → 锁内重验登记态 → 锁内翻转**」，锁内的写盘必须走**已持锁版本**（现有 `appendLedgerLine`（`:421`）已是该形态但为私有 ⇒ 实施期需导出，命名记入 design.md）。静态证据必须能看出实现**没有**在 `withLock` 回调里出现 `await`，也**没有**调用自取锁的函数。

### 降级路径（Phase 0 结论为「不可靠」时的**完整**处置清单）

降级形态 = **单槽但不可切换**（不实现 `suspend`，不做消费确认）。**逐条列全**，避免留下互相矛盾的残留：

| AC | 降级后处置 |
|---|---|
| AC1 / AC2 / AC3 | **改写**：三工具（`dispatch`/`sessions`/`cancel`），去掉 `suspend` |
| AC5 | **改写**：返回语义去掉"等消费确认"（dispatch 不等消费确认即返回） |
| AC8 | **改写**：四工具 → 三工具 |
| AC4 / AC6 / AC9 / AC10 / AC11 / AC12 / AC13 / AC14 / AC15–AC28 / AC31 / AC32 / AC33 / AC36 / AC37 / AC38 / AC41 / AC42 / AC43 / AC44 / AC46 / AC47 / AC48 / AC49 / AC50 | **保留**（不依赖 `suspend` 与消费确认） |
| AC7 | **改写**：三档失败处置的**第③档在降级形态下不成立**（无 `dispatching` 态可停）⇒ `prompt` 超时改为 **清理 session + 不占槽 + 留痕**（与 AC30 改写一致）；第①②档不变 |
| AC29 | **改写**：`state` 枚举去 `dispatching`/`suspended` ⇒ **三态** `active`/`idle`/`tombstone`；`slot` 字段仍在 |
| AC30 | **改写**：去掉「→ 消费确认」一步；`prompt` 超时 ⇒ **清理 + 不占槽 + 留痕**（无 `dispatching` 态可停） |
| AC34 | **改写**：② 去掉"消费确认 ≠ 任务完成"；路由表三工具；**移除切换契约段** |
| AC35 | **改写**：③ 四工具 → 三工具；④ 单槽口径保留，但**去掉"可切换"** |
| AC39 | **作废**（`suspend` action 不存在） |
| AC40 | **改写**：回填 `state` 只三态 |
| AC45 | **作废**（无 `dispatching` 态 ⇒ 该拒绝路径不存在） |
| AC51 / AC52 / AC53 / AC54 | **作废**（`suspend` 不存在） |
| AC55 | **改写**：「只经本插件**四**工具」→「只经本插件**三**工具」 |
| AC56 | **作废**（无切换契约） |
| AC57 | **改写**：只判「A 自然跑完后**仍常驻可枚举**、B 可接管」（去掉"切回 A"那一步） |
| AC58 | **作废**（无 `dispatching` 态） |

⚠️ **降级形态下槽位的强制释放路径**：`reconcile`（AC47）+ `cancel`（AC28）——二者**都不依赖 `suspend`**，故降级后 AC47 仍必须被评测；否则用户遇到"槽位卡死"将毫无手段。

## 验收标准

### A. 工具面与门控

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC1** | front 的权限矩阵含 `delegate_dispatch`/`delegate_sessions`/`delegate_suspend`/`delegate_cancel` **四条**规则（全局 deny + front allow）**且** front 会话里四个工具实际可调用、`delegate` 仍可调用 | 静态：`opencode debug agents`（解析 `readlink -f opencode.jsonc` 后的实际文件）**+** 单测（fake ctx 下工具注册表含四个工具）**+** E2E（front 会话内真实调用） |
| **AC2** | 除 front 外任一 agent（build / plan / general / 五个 subagent）调用 `dispatch`/`sessions`/`suspend`/`cancel` → **权限层**拒绝（非模型拒绝） | E2E；降级：静态 —— **全局 `permission` 块存在四条显式 `deny`** 且仅 `agent.front.permission` 为 `allow`（**不是**查"无 allow"——缺省策略下无 allow 仍是 allow）。⚠️ 静态证据若需**临时改生产配置**（`opencode.jsonc.opencode-go`），**必须记录改前内容并在验证后原样还原**（还原失败即判证据无效） |
| **AC3** | `cancel` 的 action 可被**单独 deny** 而 `dispatch`/`sessions`/`suspend` 仍 allow（验证 action 细分生效，非同挂一个 action） | 静态：实际配置文件的两个块 + `debug agents`；⚠️ 临时改配置须**原样还原**（同 AC2 的还原要求） |
| **AC39** | `suspend` 的 action 可被**单独 deny** 而 `dispatch`/`sessions`/`cancel` 仍 allow（验证**四工具**的 action 相互独立） | 静态：实际配置文件 + `debug agents`；⚠️ 临时改配置须**原样还原**（同 AC2 的还原要求） |
| **AC4** | **观测面不污染**（`sessions` 的「只读」= **只读后端会话**：不 prompt、不改后端 metadata；**允许**写本地 `pair.json`（存量回填）与 ledger（补记终态行），二者**不计入**污染判据）：`sessions` 调用前后，被观测后端的 **`session.context` 消息条数与最后一条消息 id 均不变**，且 `time.updated` 不变（**不投递 prompt 的直接证据**）。⚠️ **不测 ledger 行数**——reconcile 会写行（AC13），且 prompt 投递不会立即产生 ledger 行，行数不变证明不了没投递 | 单测（`sessions` 实现中无 `ctx.session.prompt` 调用 + fake ctx 断言 `prompt` 零调用）；E2E（调用前后取 context 快照 diff） |
| **AC5** | **`dispatch` 不等任务完成即返回**：调用后**不等待后端跑完**即返回 `session_id`（真实后端仍在跑）。⚠️ **但返回前须等「消费确认」**（AC44）——"消费确认"≠"任务完成"（前者只等简报已被 promote） | E2E（派一个长任务，断言返回时后端 `time.busy` 仍在）；降级：单测（`execute` 不调 `wait`，但含消费确认调用） |
| **AC6** | **`dispatch` 显式 `delivery:"queue"`**：代码级强制（不依赖上游默认值 steer） | 静态：`lib/delegate-core.ts` 中 `prompt` 调用点含 `delivery: "queue"` 字面量 |
| **AC7** | **`dispatch` 有硬超时，且按失败步骤分别处置**（fake ctx 的 `create`/`prompt`/`update` 返回**永不 settle 的 Promise** → 在超时上限内以**明确错误**返回）：① **`create` 超时/失败** ⇒ 什么都没建 ⇒ 清理（无残留 session）、**不占槽**、ledger 留痕 `event:"dispatch_failed"`；② **session 已建但 `pair`/`ledger`/`metadata` 写失败** ⇒ 清理已建 session、**不占槽**、ledger 留痕；③ **`prompt` 或消费确认超时** ⇒ 服务端可能已受理 ⇒ **保留 session + 保留槽位 + `state=dispatching`**，返回「投递结果未知，请 `sessions` 确认」，唯一恢复路径 = `cancel` 后重派（见 AC49）。⚠️ 不得出现「session 已删但槽位保留」的组合（那会让 `cancel` 无对象、工作树永久堵死）。⚠️ 不是"构造挂死的后端"——dispatch 不 wait 后端，后端挂死不会让 dispatch 挂住 | 单测（三个失败点各一例：断言各自的清理/留痕/占槽行为 + 断言无「session 已删而槽位保留」组合） |
| **AC8** | **不向 front session 发 prompt**：插件对 front session **只做 metadata 读/写**（探针 R6 实测自 prompt 会死锁） | 静态：`dispatch`/`sessions`/`suspend`/`cancel` 实现中无对 front session 的 `prompt` 调用；单测（fake ctx 记录调用） |

### B. 名册与索引

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC9** | **dispatch 落三处**：后端 session 的 metadata 含 `delegated_by`/`goal_key`/`canonical_root`/**`work_root`**/`baseline_message_id`/`dispatched_at`/`state`；`pair.json` 有对应条目**且含 `goal_key`** 与 **`work_root`**/**`state`**；`ledger.jsonl` 有 `dispatched` 行 | 单测（core + tool）；E2E（真实派发后读三个文件） |
| **AC40** | **`state` 五态与存量一次性回填**：pair 条目的 `state` 取值 ∈ `dispatching`/`active`/`idle`/`suspended`/`tombstone`（ADR D6.3）；**存量条目**首次观测时按 **`work_root = canonical_root`**（退化为原粒度，不误判为同树）+ **`state` 按活体判据**（busy ⇒ `active`，否则 `idle`）回填。⚠️ **不得一律默认 `idle`**——那等于给存量后端放行第二个写入者。**部分迁移条目**（只缺一个字段）：缺 `work_root` ⇒ 按 `canonical_root` 补；缺 `state` ⇒ 按活体判据补；**已有字段一律不改**。回填发生在 `sessions` 与 `dispatch` **两条读路径**，属**本地索引写**（写 `pair.json`），**不是**对后端会话的写 ⇒ 不计入 AC4 的污染判据（AC4 只测后端 context/`time.updated`） | 单测（构造整条存量 / 部分存量条目 → 首次观测 → 断言回填值与「已有字段不被改写」；断言存量 `active` 条目不被放行第二个派发） |
| **AC10** | **`sessions` 列出本 front 名下全部后端**（≥2 个，分属不同工程目录），每项含**已定义的 schema 字段**（见 AC29）**并按 `work_root` 分组** | E2E（派两个后端到不同目录 → `sessions` 列出两个）；降级：单测（fake `session.list` 夹具 + 断言分组字段） |
| **AC11** | **兜底路径扫全量**：构造 >50 个 session（其中 ≥2 个是被派发的后端且 `time.updated` **最旧**）→ 换代后的 `sessions` 仍能列出这两个（验证 cursor 续扫，不因 limit 窗口漏扫） | E2E；降级：单测（fake `session.list` 返回 2 页 + 1 条沉底，断言续扫） |
| **AC12** | **front 换代可找回**：新 front session id 下，兜底路径仍能列出旧后端 | E2E；降级：单测（roster 为空时走 list 路径） |
| **AC13** | **外部删除可见（幂等）**：后端 session 被删后，`sessions` 报该项"已消失"，并在 ledger 补记终态行（**区别于"从未派发"**——后者无 dispatched 行）；**同一次消失只补一行**（重复查询不重复补）；补记的 `outcome` 取值**明确规定为 `vanished`**（AC36 的枚举扩展） | E2E（删后端 → `sessions` 报消失 + ledger 出现终态行）；降级：单测（fake list 缺项 → 断言补记一次、二次查询不补） |
| **AC14** | **metadata 整体替换语义**：单次 update 后 metadata 的**完整字段仍在**（**含新增的 `work_root`/`state`**）。⚠️ **不保证条目级不丢**——roster 数组是 read-modify-write，并发 dispatch 时允许丢条目（兜底路径为准），AC 不得被读成"条目永不丢" | 单测（单次 update 字段完整性）；注明并发丢条目为可接受（Notes N3） |

### C. 一 session 一目标

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC15** | **goal_key 的输入与落盘**：① `validateBrief` 接受 `goal_key.intent`（kebab slug）字段，工程 dispatch 时**必填**；② `pair.json` 条目新增 `goal_key` 字段，resume 时**只从 pair 读**；③ 存量 pair 条目**无 goal_key** 时：允许续接一次并在成功登记时回填 goal_key（**回填值 = 本次续接简报的 `goal_key`**，并**落盘**，防止"每次都当存量"；**不拒绝**，避免存量全部失联） | 单测（字段校验 + pair 落盘 + 存量无 goal_key 的回填路径） |
| **AC16** | **goal_key 不一致硬拒**：不同 `goal_key` resume → **拒绝**且提示新 session | 单测（两种用例）；E2E |
| **AC17** | **同 goal_key 的续接与拦截（拆两层）**：① 同 goal_key **且**该后端不在 in-flight、且由**本 front** 持有 → **允许**（续接的定义，**必须放行**）；② 同 goal_key 但**已有 in-flight**（per-session busy 判据）或**该 workRoot 已被别的后端占槽**（单槽表）→ **拒绝**。⚠️ **双 front 并发 resume 同一后端由 busy 判据 + 单槽表拦截，*不*在 goal_key 校验里拦**（ADR 风险章已改写：goal_key 只回答"是不是同一个目标"） | 单测（四象限：本 front/他 front × 空闲/在跑 + 同 goal_key 必须放行用例） |
| **AC18** | **救援路径不误杀**：同一目标续接时，"原地补 grant"路径仍可用（goal_key 相同不被拒） | 单测（grant 救援用例） |
| **AC19** | **运行中不 steer 注入**：对正在运行的后端 resume → 拒绝并说明原因（**不**把新简报注入当前轮） | 单测（busy 判定）；E2E（真实运行中 resume 被拒） |
| **AC20** | **同 slug 异目标被文档化**：机制**不**拒绝（front 复用同一 slug 时校验通过），但 ledger 中两行的 goal 描述不同 ⇒ 可事后审计 | 静态（ADR D3 方向性段 + risk 章）+ 单测（行为断言：同 slug 通过） |
| **AC41** | **判等键与调度键分离**：`goal_key.repo` 仍是 `canonical_root`（同一目标换 worktree 续接**不被误判为不同目标**）；而**槽位判定与名册分组**按 `work_root`（同仓不同 worktree 的同 slug 后端在名册里**可区分**） | 单测（同仓两 worktree + 同 slug → goal_key 判等通过且名册可区分两条） |

### D. 状态与聚合

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC21** | **running 判据用活体信号（判活函数的**行为**，不是某个 API 是否暴露字段）**：判活函数按 `get` → `list` → 「最后消息时间 + 无 `outcome`」**三级取值源**依次取活体信号，判据为「存在 `busy` 且（`idle` 未定义或 `busy > idle`）」；**不依据** `outcome`（该字段 run 未结束时不存在）。**三级取值源的行为差异各覆盖一例单测**；上游 `get` 是否暴露 `time.busy` 由 **AC38 ②** 实测出结论，**该结论是本 AC 的输入而非其通过条件**（探针 Q2 与 R4 的冲突因此不会让本 AC 红） | 单测（判活函数 × 三级取值源 × 四态 `busy>idle`/`busy` 无 `idle`/`busy<idle`/无 `busy`）；E2E（真实运行中观测） |
| **AC22** | **窗口期保守**：刚派发、`busy` 尚未写入的窗口期 → 报 `running` 而非"已完成" | 单测（busy 未定义 + 有活动 → running） |
| **AC23** | **worst-of 聚合**：一个后端 `unverified` + 一个 `succeeded` → 整体**不得**报完成；一个 running + 一个 succeeded → 整体"进行中"；**明细永远列出** | 单测（聚合函数 + 输出结构）；E2E |
| **AC24** | **全部 unverified 的措辞**：报"无可验证交付"（**措辞不含"没有产出"**——产物可能落在 git 视野外） | 单测（聚合/headline 字符串 == 「无可验证交付」且**不含**「没有产出」）+ E2E（展示态） |
| **AC25** | **`stalled` 的阈值与判据**：`stalled = running 且 (now - lastActivityAt) > 阈值`；阈值为**默认常量 + 配置项可覆盖**（两者都有单测覆盖）；`stalled` 是**查询时推导态、不落盘** | 单测（阈值边界用例） |
| **AC29** | **`sessions` 输出 schema 已定义**：per-item 字段（`session_id`/`goal_key`/**`work_root`**/**`state`**/`project_root`/`outcome`/`evidence`/`last_activity_at`）与 aggregate 字段（`overall`/`items`/`headline`）在 proposal 或 design.md 中**有成文表**；实现与该表一致 | 静态（schema 表存在）+ 单测（输出字段集合断言） |

### E. 单槽与槽位生命周期（D6/D7 —— 本次改写的核心）

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC26** | **同工作树单槽（原子，且不残留）**：① **槽位键 = `workRoot`**（不是 `canonical_root`）；② 同 `workRoot` 已有 `active`/`dispatching` 后端时再派发 → **拒绝**并说明（不排队、不静默并发），**错误信息必须含占槽后端的 `session_id` 与「先 `suspend` 该后端」的提示**（否则 front 无从下手，"切不动"）；③ **槽位检查与登记在同一次锁临界区内**（`withLock` 是同步 `() => void` ⇒ **锁内不得 await**，且**锁内不得调用任何自取同一把 `.role.lock` 的函数**——`appendLedger`/`registerSession` 会二次取锁 ⇒ 死锁 10s 后抛错；实现须使用「已持锁」版本（如导出 `appendLedgerUnlocked`），见证据规则 10）；④ **互斥拒绝时不得留下已创建的 session**（清理） | 单测（注入"检查后暂停"钩子，断言调用序列 `lock→check→write→unlock`；断言锁内回调**不返回 Promise**；断言锁内**未调用** `appendLedger`/`registerSession`；断言拒绝后无残留 session + 拒绝文案含 `session_id`）；E2E（真并发两次） |
| **AC42** | **槽位键的直接判据**：同一仓的两个 linked worktree 各派一个后端 → **两者都成功**（不被"同 repo 互斥"挡住）；且各自 `pair`/metadata 的 `work_root` **分别为两个 worktree 路径** | 单测（真实构造两个 linked worktree → 两次派发 → 断言都成功 + work_root 各自正确）；E2E |
| **AC43** | **常驻与活跃分离**：同一 `workRoot` 可**常驻多个**后端 session（各自 `state=idle`），`sessions` 能把它们**列在一起并按 `work_root` 分组** | 单测（构造同 workRoot 两个 idle 条目 → 断言名册含两条且分组正确） |
| **AC27** | **scope 前缀重叠检测：不实现**：单槽把同工作树的并发写**构造性排除**、跨工作树的同名 scope 物理上不重叠 ⇒ 该检测**无可达的保护场景**，保留即死代码。⇒ **静态断言实现中不存在「scope vs scope」的重叠判定**。⚠️ **判据必须点名且带豁免**，否则会误伤既有的合法用法：`outOfScopeFiles`（`lib/delegate-core.ts:534`）是「scope 前缀 vs 变更文件」、`scopeAbsolutePaths`（`:520`）与 `scopeEditRules`（`:204`）是 scope 归一——**三者都合法，不得判失败**；⚠️ **`grep startsWith` 不能作为判据**（`:538` 有合法用例） | 静态（① `grep -nE '\b(scopesOverlap\|overlap[A-Za-z]*Scope\|scopeOverlap\|isScopeOverlap)' lib/ plugins/ lib/*.ts 2>/dev/null` 无命中；② 断言不存在**接收两个 `scope: string[]`** 并逐元素做前缀比较的函数；③ 断言 `outOfScopeFiles`/`scopeAbsolutePaths`/`scopeEditRules` 仍在且行为不变）+ 单测（断言派发流程不调用任何重叠判定） |
| **AC44** | **消费确认的行为判据**（**判据已由 Phase 0 具体化**：该简报的 **`message.id` 出现在 `ctx.session.context()` 的消息 id 集合中** ⇒ 已消费；⚠️ **`prompt()` 在入队时就分配了 `message.id` ⇒ 「拿到 id」≠「已消费」**）：① **正例**——简报已被 promote（其 id 出现在 context 的 id 集合里）⇒ 条目置 **`state=active`** 且 dispatch 返回成功；② **负例**——简报未进 context（其 id 不在集合里）⇒ 条目停在 **`state=dispatching`**（不置 `active`、不返回成功）。⚠️ **判据可靠性本身不是本 AC 的判据**——那是 **Phase 0 测量任务**（见「目标」段），其结论决定本 change 是否降级（见「降级路径」表）。⚠️ **有界时延**：真实环境连续 10 次 dispatch，**≥8 次在 60s 内进入 `active`**；否则该实现事实上不可切换 ⇒ **不判"可切换已实现"通过**，按降级流程如实记录（**不是**判 AC44 失败）。⚠️ **判据不得依赖 `time.busy`**（pending 窗口无 busy/idle，见 Phase 0 报告 §4.4） | 单测（正例 + 负例各一例，**负例必须断言 id 比对而非文本匹配**）+ E2E/探测（连续 10 次的时延统计；另需覆盖 Phase 0 报告 N-B 的自然 pending 路径：运行中投递 ⇒ 简报不在 context） |
| **AC45** | **`dispatching` 只可 cancel**：`dispatching`（未确认消费）的后端 → `suspend` **拒绝**、`cancel` 可用（未确认消费的简报仍可能 pending ⇒ 不可保留可续性） | 单测（`suspend` 拒绝 + `cancel` 成功 + 断言 `state` 变化） |
| **AC46** | **翻转执行者三条**：① 既有同步 `delegate` 返回后，其条目 `state=idle`（不占槽）；② `dispatch` 派发的后端**跑完但无人调用 `sessions`** → 下一次派发到同一 `workRoot` **成功**（reconcile-on-read 生效）；③ **第二次顺序 `delegate` 到同一工作树成功**（不被自己前一轮留下的 `active` 条目挡住——**这是对既有主路径的回归判据**）。⚠️ **「下一次派发」= `dispatch` 与 `delegate` 两条派发面**都执行 reconcile —— 否则一条残留 `active` 会**永久堵死同步主路径**而 AC47 仍绿 | 单测（三条各一例；③ 必须真实构造"前一轮已正常返回"的 delegate 再派第二次；另加一例：`delegate` 触发 reconcile 放行） |
| **AC47** | **槽位回收**：① 后端崩溃（`active` 但实际不 busy）→ 下一次派发触发 reconcile ⇒ **放行**（不必先手工 `suspend`）；② 后端**已被删除**（`session.get` 抛错/404）⇒ 下一次派发**同样放行**；③ `sessions` 对悬挂条目输出**悬挂标记**（承载字段见 AC29 的 `slot.dangling`，**仅在超 `stalled` 阈值时出现**）。⚠️ 回收只由 reconcile 承担；`suspend` 的幂等释放是另一条路径（AC51） | 单测（三条各一例：(a) `active`+不 busy → 下次派发成功；(b) session 已删 → 下次派发成功；(c) `sessions` 输出含悬挂标记且仅超阈值时出现） |
| **AC48** | **亡主接管（front 换代）**：旧 front 名下的 `active` 槽位**不被静默顶掉**，但可被新 front `suspend` 回收；接管**落 ledger 行**；该工作树**不因换 front 而永久不可派发** | 单测（构造 `front_session_id` 指向已不存在的 session → 新 front `suspend` 成功 + ledger 有接管行） |
| **AC49** | **投递失败保留槽位**：`dispatch` 的 execute 超时/异常 → **保留槽位**（不放行）+ 返回「投递结果未知，请 `sessions` 确认」；**不得静默放槽**。⚠️ **该路径不经 reconcile**（`dispatching` 的简报可能仍 pending，放行即幽灵注入）⇒ 唯一恢复路径是 **`cancel` 后重派** | 单测（fake ctx 超时 → 断言槽位仍被占 + 错误文案 + 再派发被拒） |
| **AC30** | **dispatch 的写入顺序与失败语义**：顺序为 `create → pair → ledger(dispatched) → metadata → prompt → 消费确认`；失败处置**按步骤分档**（与 AC7 同一张表）：`create`/写盘失败 ⇒ 清理 + 不占槽 + 留痕；**`prompt`/消费确认超时 ⇒ 保留 session + 保留槽位 + `state=dispatching`**（此处**不得**清理、**不得**放行）。此条覆盖"metadata 写失败但 session 已创建"的崩溃窗口 | 单测（各步注入失败，断言清理/留痕/占槽三态；断言超时路径 session 与槽位**同时**保留） |
| **AC31** | **并发上限（ADR D10）**：同时在跑的后端数达到**全局**上限（配置项 `RDDF_MAX_ACTIVE_BACKENDS`，**默认值 3**）时，第 N+1 个 dispatch **fail-fast 拒绝**且**不排队**，错误信息说明先 cancel/finish 哪个。实际并发度 = **min(活跃工作树数, 全局上限)**——单槽是**每工作树**的上限（ADR D6.2），全局上限是另一维 | 单测（注入配置测边界 + 断言与单槽的叠加关系 + 断言默认值 3） |
| **AC32** | **知识 session 与单槽/上限的关系（已定死）**：`kind=knowledge`（只读）**不占工作树槽位**（不被同 `workRoot` 的单槽拒绝——它不写工作树）**且不计入全局上限**（只读不占写名额；上限只数 `kind=engineering` 的活跃后端） | 单测（knowledge + engineering 同 workRoot 并发用例 + 上限计数只数 engineering） |
| **AC57** | **常驻与往返切换（用户诉求的稳态形态）**：`dispatch(A)` → A 自然跑完（**不调用 `sessions`**）→ `dispatch(B)` **成功** → `sessions` 按 `work_root` **同组列出** A（`idle`）与 B（`active`）→ **再次 `dispatch(A)`（同 goal_key）成功**且 A 的上下文**未被重建**（`session.id` 不变、`baseline_message_id` 不变、消息条数单调增长）。⚠️ 这条直接对应"同一工作树养着多个目标、不因切换而丢弃" | 单测（完整序列四步 + 断言 A 的 session.id / baseline_message_id 未变）；E2E |
| **AC58** | **`resume` 路径同样经过 `dispatching` → 消费确认 → `active`**：对**已存在的**后端（`suspended` 或 `idle`）再次 dispatch 时，**不得**直接置 `active` —— 必须同样走 `dispatching` 与消费确认；窗口期内 `suspend` 被拒、`cancel` 可用。⚠️ 若实现把 resume 直接置 `active`，则 D7.2 的幽灵注入窗口在**切换路径上重新打开**，而 AC51/AC52 仍会绿 | 单测（对 `suspended` 后端 dispatch → 断言先经 `dispatching`、消费确认后才 `active` + 窗口期 `suspend` 被拒） |
| **AC50** | **既有 `delegate` 的变更面**：① **新增一条拒绝路径**（同工作树已有 `active`/`dispatching` 后端时拒绝派发）——**成功路径语义与既有判据全部不变**，但**这确实是一条新增的拒绝路径**（不得宣称"语义完全不变"）；② `delegate` 返回时同写 `state:"idle"`；③ `delegate` 建的 pair 条目同样落 `work_root`/`state`（否则两个派发面无法共用一张槽位表） | 单测（三条各一例 + 既有 `tests/delegate-core.test.ts` 判据全绿 + 既有 `canonical_root` 不匹配被拒用例仍绿）；E2E |

### F. 终止、暂停与切换（D9/D11）

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC28** | **cancel 墓碑条件**：`interrupted:true`（在跑）**才**墓碑（`state=tombstone`）；`interrupted:false`（不在跑）为**纯 no-op，不墓碑**（保留可续接上下文——墓碑的理由是"队列残留"，对已结束的后端不成立）。墓碑后：`sessions` 不再列为在跑；再次 dispatch 到同一后端 → **拒绝**（要求新建） | 单测（两种返回值的行为差异）；E2E |
| **AC51** | **`suspend` 语义（按 `state` 分派）**：① `suspend` 后该后端标为 `suspended`（**不是**墓碑）→ **仍可 resume**（dispatch/resume 同一后端不因"曾被暂停"被拒）；② **`state=active` 且活体显示不 busy** ⇒ **释放它所占据的槽位**并置 `suspended`（ADR V42「幂等释放槽位」口径）——否则该工作树永远派不进去；③ **`state=idle`/`suspended`** ⇒ 幂等 no-op（它本就不占槽）；④ `tombstone` ⇒ **拒绝**；⑤ `dispatching` ⇒ **拒绝**（见 AC45）；⑥ **不删除** session（默认不 remove）⇒ 上下文保留。⚠️ 读法说明：ADR D11.4 的「不在跑 ⇒ 幂等 no-op」与 V42 的「释放槽位」在"active 但不 busy"这一形态上措辞不同；本 proposal 采**同时满足两者**的读法：**释放它所占据的槽位**（无槽可释放时才叫 no-op）。建议 architect 回填 D11.4 措辞 | 单测（六条各一例；② 断言槽位被释放后同工作树可再次派发） |
| **AC52** | **切换两步可用**：`suspend(A)` 后 A 让出槽位 → 随后 `dispatch/resume(B)`（同一 workRoot）**成功**；A 仍在名册中可枚举 | 单测（构造 A active + B idle → suspend(A) → resume(B) → 断言 B 占槽、A 仍可枚举）；E2E |
| **AC53** | **停机确认**：`interrupt` 未真正停机（`interrupted:false` 而 session 实际仍在跑）→ **不释放槽位**（保持 `active`）并报错；**不得出现"两个 `active` 同一 workRoot"** | 单测（fake ctx 返回 `interrupted:false` 但会话仍 busy → 断言 `state` 仍 `active` + 报错） |
| **AC54** | **steer 残留**：① **正例**——恢复后新增消息中含**暂停之前**的内容 ⇒ 报「上下文可能含陈旧指令，建议新建」（`unverified` 语义）；② **负例**——干净恢复（新增消息不含暂停前内容）⇒ **不报存疑**（防「永远报警」的实现蒙混过关）；③ **「首批消息」定义** = `baseline_message_id` **之后**新增的 user/assistant 消息（不含历史消息），判定输入即该消息集合。⚠️ 上游 `delivery` 列只在 inbox 表、**消息表没有** ⇒ 若实施期实测确认**插件无法从 `session.context` 区分 steer 消息** ⇒ 本条**降级为"判文档"**：`sessions` 输出带固定标记 `steer_residue:"undetectable"` + 使用手册写明，**且 ①② 两条改为"如实报不可检出"**，不得用"看起来没问题"冒充通过 | 单测（正例 + 负例各一例，负例必须断言**不**报存疑）+ 探测（能否从 context 区分 steer 的结论存档） |

### G. 回归、文档与消费者同步

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC33** | **既有 delegate 无回归**：`bun test tests/` 全绿；既有判据全部仍通过（`outcome` 枚举含 `unverified`、`busy` 拒绝、scope 越界检测、pair 登记、ledger 行时机） | 单测（`bun test tests/`）+ E2E（既有 L2-1..L2-15 全绿） |
| **AC34** | **prompt 契约同步（含旧措辞清理）**：`prompts/front.md` ① 新增**四工具**路由表；② 明确「dispatch 返回 ≠ 后端完成」（并区分「消费确认 ≠ 任务完成」）；③ **旧措辞已删除或改写**——`prompts/front.md:3,12,17,26,123` 与 `docs/front-delegate-architecture.md:35,310` 现写「一切工程行动经 delegate / 唯一工程通道 / 不给 front 第二出口」，与四个新工具**直接矛盾**，必须改 | 静态：`grep` 断言旧措辞**不再出现**于上述位置 + 新路由表存在 |
| **AC35** | **架构文档同步**：`docs/front-delegate-architecture.md` ① §6.1 不变式 1 的"出口"口径扩写为"唯一门控插件出口"；② §4.3 的 delivery 语义修正为 steer（**旧措辞"会排队"必须消失**）；③ §2.1 运行时全景图的工具面（`:35,41`）含**四个**新工具；④ 补写**单槽口径**（槽位键 = workRoot、常驻 vs 活跃、单槽+可切换） | 静态：`grep` 断言"会排队"不再出现 + §6.1 含新口径 + §2.1 含四工具 |
| **AC36** | **ledger 消费者同步**：`dispatched`/`dispatch_failed` **裁定为独立 `event` 字段**（不塞进 `outcome` 的 6 值枚举，避免所有 outcome 消费者遇到未知值）；`vanished` 作为 `outcome` 新值需同步全部消费者。同步更新：`ADR-front-knowledge-capability` D5 的行产生时机表、`docs/dual-session-delegation.md` 的枚举表、`prompts/front.md` 的 ledger 说明 | 静态：四个位置的字段表均含 `event` 字段与 `vanished` |
| **AC37** | **`sessions` 按 id 查单个** —— 若实现则需判据；**本批不做**（见 Out of Scope 9），由 AC34 的 prompt 契约保证 front 不会调用不存在的形态 | 静态：`sessions` 的 input schema 不含按 id 查单的参数 |
| **AC38** | **上游语义锚定**：装好的环境实测 ① `prompt` 不传 `delivery` 时返回 `delivery:"steer"`；② `ctx.session.get()` 在 run 中返回 `time.busy`（**复核探针 Q2 与 R4 的冲突**）；③ `session.list` 的 `search`/`directory` 过滤生效；④ **opencode 升级回归清单新增两条**（`delivery` 默认值、`time.busy` 存在性） | 静态：shell/HTTP 实测前三项，原始返回存档 + **升级回归清单文件含这两行**（路径由实施期确定并写进 Notes；断言用 `grep`） |
| **AC55** | **范围假设已写明**：构造性保证的成立前提「后端 session 只经本插件四工具被操作」在 `prompts/front.md` 或使用手册中**显式声明**（ADR D8.3）——用户直接操作后端 session 是**声明过的超出范围**，不是隐式漏洞 | 静态：`grep` 断言该前提出现在 prompt 或手册中 |
| **AC56** | **切换契约已写明**：`prompts/front.md` 写明「切换活跃后端 = 先 `suspend` 当前、再 `dispatch/resume` 目标」；并写明「同仓并行需先准备独立工作树」（ADR D6.4） | 静态：`grep` 断言两句契约文本存在 |

### 附：`sessions` 输出 schema（AC29 的成文表，实施须与此表一致）

**per-item 字段**

| 字段 | 类型 | 取值 | 来源 | 语义 |
|---|---|---|---|---|
| `session_id` | string | — | 权威（`pair.json`） | 后端 session id |
| `goal_key` | `{repo, intent}` | — | 权威（`pair.json`） | 目标判等键（`repo` = `canonical_root`） |
| `work_root` | string（绝对路径） | — | 权威（`pair.json`） | 工作树根 = **槽位键** |
| `canonical_root` | string（绝对路径） | — | 权威（`pair.json`） | 仓库根 = stateRoot |
| `state` | enum | `dispatching` / `active` / `idle` / `suspended` / `tombstone` | 权威（`pair.json`） | **登记态**：占槽 / 可续 / 终态 |
| `kind` | enum | `engineering` / `knowledge` | 权威（`pair.json`） | 是否占工作树槽位 |
| `front_session_id` | string \| null | — | 权威（`pair.json`） | 登记 front（**软信号**，见 N13） |
| `slot` | `{key, holder, dangling}` | `key`=work_root；`holder`=占槽 session_id；`dangling`=boolean | 推导 | 槽位归属与**悬挂标记**（AC47 ③ / AC53 的承载字段） |
| `outcome` | enum | `succeeded` / `failed` / `blocked` / `busy` / `unverified` / `vanished` | 观测（ledger / session） | 终态结果（`vanished` = 外部删除，见 AC13/AC36） |
| `evidence` | object | — | 推导 | 交付证据（产物 / 变更文件 / 校验结果） |
| `last_activity_at` | ISO8601 string | — | 观测 | 最后活动时间（`stalled` 判据的输入，AC25） |
| `running` | boolean | — | 推导（活体判据，AC21） | **观测态**：与 `state` **相互独立**，可同时出现，不得互相覆盖 |
| `steer_residue` | enum | `none` / `undetectable` | 推导 | steer 残留可观测性标记（AC54） |

**aggregate 字段**

| 字段 | 类型 | 取值 | 来源 | 语义 |
|---|---|---|---|---|
| `overall` | enum | `completed` / `in_progress` / `no_verifiable_delivery` | 推导 | 聚合态（worst-of，AC23/AC24） |
| `items` | array | — | 推导 | 逐项明细（**永远非空**，AC23） |
| `headline` | string | — | 推导 | 一句话摘要（**必须带明细提示**，如「进行中（含 1 项交付存疑）」） |

## AC ↔ ADR Verification 映射

| ADR-front-multi-backend Verification | AC |
|---|---|
| V01（工具可见性——四工具） | **AC1** |
| V02（非 front 被拒——四工具） | **AC2** |
| V03（`cancel` action 可单独 deny） | **AC3** |
| V04（`suspend` action 可单独 deny） | **AC39** |
| V05（dispatch 硬超时） | **AC7** |
| V06（dispatch 落三处——含 `work_root`） | **AC9** |
| V07（pair 条目含 `work_root`/`state` + 存量回填） | **AC40** |
| V08（观测面不污染 + `sessions` 列出名下后端） | **AC4** + **AC10** |
| V09（外部删除可见 + 补记终态） | **AC13** |
| V10（front 换代找回） | **AC12**（+ AC11 扫全量） |
| V11（兜底路径扫全量） | **AC11** |
| V12（metadata 完整字段——含 `work_root`/`state`） | **AC14** |
| V13（同 goal_key 可续接 / 异 goal_key 拒） | **AC16**（异拒）+ **AC17**（同放行）；**AC15** 为扩展项（无 V，见下） |
| V14（grant 救援不误杀——与 V13 同源） | **AC18** |
| V15（运行中 resume 拒绝） | **AC19** |
| V16（同 slug 异目标文档化） | **AC20** |
| V17（`goal_key.repo` vs `work_root` 分组） | **AC41** |
| V18（running 判据） | **AC21**（+ AC22 窗口期） |
| V19（窗口期保守） | **AC22** |
| V20（worst-of：unverified+succeeded 不得报完成） | **AC23**（+ AC24 措辞） |
| V21（worst-of：running+succeeded → 进行中——与 V20 同源） | **AC23**（同源，已合并） |
| V22（全部 unverified 的措辞） | **AC24** |
| V23（明细永远输出——与 V20 同源） | **AC23**（同源，已合并） |
| V24（槽位键 = `workRoot`） | **AC42**（+ AC26 的键绑定） |
| V25（同 `workRoot` 已有 `active` ⇒ 拒绝） | **AC26** |
| V26（同 `workRoot` 常驻多个 + 分组） | **AC43** |
| V27（scope 前缀重叠检测不实现） | **AC27** |
| V28（槽位检查与登记同锁临界区） | **AC26**（原子性部分） |
| V29（既有 `delegate` 受同一张槽位表约束） | **AC50** |
| V30（消费确认 ⇒ 停在 `dispatching`） | **AC44** |
| V31（`dispatching` ⇒ suspend 拒 / cancel 可用） | **AC45** |
| V32（翻转执行者三条） | **AC46** |
| V33（槽位回收） | **AC47** |
| V34（亡主接管） | **AC48** |
| V35（投递失败保留槽位） | **AC49**（+ AC30 的失败语义） |
| V36（cancel 墓碑） | **AC28** |
| V37（cancel 幂等 no-op——与 V36 同源） | **AC28**（同源，已合并） |
| V38（suspend 可续） | **AC51** |
| V39（suspend 幂等 / 墓碑拒绝——与 V38 同源） | **AC51**（同源，已合并） |
| V40（切换两步可用） | **AC52** |
| V41（停机确认） | **AC53** |
| V42（槽位悬挂可见 + suspend 幂等释放） | **AC47** + **AC51** |
| V43（suspend 不删除 session——与 V38 同源） | **AC51**（同源，已合并） |
| V44（steer 残留） | **AC54** |
| V45（既有 delegate 回归） | **AC33**（+ AC34 prompt + AC35 架构文档 + AC36 ledger 消费者） |
| V46（dispatch 返回 ≠ 后端完成） | **AC34**（+ AC5 返回语义） |
| V47（范围假设已写明） | **AC55** |
| V48（切换契约 + 同仓并行需先备工作树） | **AC56** |
| V49（升级回归清单新增两条） | **AC38** ④ |

> **映射说明**：ADR 的 Verification 清单在初稿时 28 条、**改写后 49 条**（新增单槽/生命周期/终止暂停/切换四组）。本表按改写后的清单**逐条以真实 V 编号**给出对应 AC；同源条目已合并（V14/V21/V36/V38/V42 → V13/V20/V35/V37/V37），不再单列。**映射可逆**：从任一 AC 可回查本表得到其 ADR Verification 编号。
>
> ⚠️ **本表修正了前一版映射表的错位（既有缺陷，非本次 ADR 改写引入）**：前一版表格按**主题**编号而非 ADR 的真实 V 编号，自 V05 起整体错位（旧 ADR 的 V05 是「dispatch 落三处」，旧表却写「6（显式 delivery:queue）」），导致「可逆映射」名不副实。⇒ 本表已按 ADR 文件实际条目重排，**编号可直接用 `grep -n '^- \[ \]'` 复核**。
>
> ⚠️ **ADR Verification 的覆盖缺口（共三处，均已由本 proposal 补判据）**：① ADR D1 表「必须显式 `delivery:"queue"`」；② ADR D1.2「不得对 front session 发 prompt」；③ ADR D6.2/D7.2 的「自然跑完后仍常驻、可切回」与「`resume` 路径同样走消费确认」两形态。⇒ 三者**在 ADR 的 Verification 里没有对应条目**，本表无对应 V 编号。**AC6 / AC8 / AC57 / AC58 即为这四条补的判据**（来源标注见扩展项说明）。建议 architect 回填进 ADR 的 Verification，以保持映射完整。
>
> ⚠️ **AC44 说明**（消费确认，见证据规则 9）：这是本 change 的**开关性判据**——ADR D7.2 已证明「投递 ≠ 消费」，而"已消费"的可观测判据**尚未实测**。若实测不可靠 ⇒ **触发降级**：退回「单槽但不可切换」，此时 **AC39（suspend action）/AC51/AC52/AC53/AC54 随之作废**，AC1/AC2/AC3 的工具面退回三工具。**降级必须如实记录**，不得以"看起来没问题"冒充通过。
>
> 扩展项（非 Verification 原文，metis 审查后新增）：**AC15**（goal_key 输入与落盘契约）、**AC17**（同 goal_key 续接的分层拦截）、**AC25**（stalled 阈值）、**AC29**（sessions 输出 schema）、**AC30**（dispatch 写入顺序与失败语义）、**AC31**（并发上限）、**AC32**（knowledge 与单槽/上限）、**AC36**（ledger 消费者同步）、**AC37**（按 id 查单个——本批不做）、**AC38**（上游语义锚定，钉到 `get`）。
>
> **AC38 ①–③ 的来源**（无 V 编号）：ADR 的 Verification 清单里**没有**"上游语义锚定"这一条（它只在 ADR 的风险章与证据规则语境里）。⇒ **AC38 ①–③ 是扩展项**；其 **④（升级回归清单新增两条）= V49**。
>
> **AC6 / AC8 的来源**（无 V 编号）：来自 ADR 的**决策正文**而非 Verification 清单——**AC6** ← ADR D1 表「必须显式 `delivery:"queue"`」+ 风险章「必须写成代码级强制」；**AC8** ← ADR D1.2「插件不得对 front session 发 prompt」（探针 R6 实测自 prompt 会死锁）。二者是 ADR 的硬决策，故保留判据；**但 ADR 的 Verification 未覆盖它们**（见上方覆盖缺口说明）。
>
> **本次 ADR 改写带来的扩展项**：**AC57**（常驻与往返切换——对应 ADR D6.2 的「常驻 vs 活跃分离」，但 **ADR 的 Verification 未覆盖**"自然跑完后仍常驻、可切回"这一形态）、**AC58**（`resume` 路径同样走 `dispatching` → 消费确认 → `active`——对应 ADR D7.2，但 **ADR 的 Verification 未覆盖 resume 路径**）。⇒ 二者**无 V 编号**；建议 architect 回填进 ADR 的 Verification。
>
> **本次 ADR 改写带来的扩展项**：**AC39**（suspend action 独立 deny）、**AC40**（state 五态 + 存量回填）、**AC41**（判等键 vs 调度键）、**AC42**（槽位键直接判据）、**AC43**（常驻与活跃分离）、**AC44**（消费确认）、**AC45**（dispatching 只可 cancel）、**AC46**（翻转执行者）、**AC47**（槽位回收）、**AC48**（亡主接管）、**AC49**（投递失败保留槽位）、**AC50**（既有 delegate 三处变更面）、**AC51**（suspend 语义）、**AC52**（切换两步）、**AC53**（停机确认）、**AC54**（steer 残留）、**AC55**（范围假设写明）、**AC56**（切换契约写明）。

## Notes to verifier（不参与通过/失败判定）

- **N1 已知残留 —— 同 slug 异目标无法机制识别**（ADR D3 方向性 + risk 章已披露）：front 复用同一 slug 时 goal_key 校验通过 ⇒ 该方向退化为 prompt 纪律，靠 ledger 事后审计。**不得**要求 AC16 覆盖该方向；AC20 只判"该行为已被文档化"。
- **N2 已知残留 —— 插件 ctx 无 `inbox` API**：队列内容不可直接观测（探针 R5 实测 `Object.keys(ctx.session)` 全集；上游 `packages/plugin/src/promise/adapter.ts:622-645` 复核）。⇒ ADR 用**消费确认 + 构造性保证**替代"运行时检查"，但**不能真正检查**。**不得**要求任何 AC 证明"队列已清空"。
- **N3 已知残留 —— roster 允许丢条目**：roster 数组是 read-modify-write，并发 dispatch 时允许丢条目，**兜底路径为准**。AC14 只判"单次 update 字段完整"，**不得**被读成"条目永不丢"。
- **N4 已知残留 —— worktree 隔离未做（但互斥键已改）**：ADR D6.4 明确 worktree 的**自动创建**后置（插件 ctx 拿不到 project id ⇒ 需自建 `git worktree add` + 生命周期与**清理策略**，不做清理策略即定时炸弹）。**槽位键已在本轮改为 `workRoot`**（ADR D6.1），⇒ 将来插件自建 worktree 时**无需再改键**。**不得**要求 AC 覆盖"插件自动建 worktree"；同仓并行的准备动作由 front/用户显式做（AC56 的 prompt 契约）。
- **N5 环境依赖 —— E2E 需真实模型与可用 provider**：额度不足时用 AC 的降级证据，并把"E2E 不可执行"如实记录，**不判失败也不判通过**。
- **N6 E2E 用例需新增**：见证据规则 2 —— 实施方必须在外部仓库提交含 L2-16.. 的 commit 并在本节记录 SHA。**未记录 SHA 时，仅靠 E2E 的判据不可判定**（本 proposal 已为相关 AC 提供单测降级证据）。
- **N7 已知残留 —— 探针 Q2/R4 冲突**：`get()` 是否在 run 中暴露 `time.busy` 有两次观测冲突。AC38 第 ② 条必须复核；若实际不暴露，AC21 改走 `list` 或"消息条数/最后消息时间"兜底，**这不是实现缺陷**。
- **N8 已知残留 —— 跨 location 的 cancel 未验**：架构文档 `:180` 说明插件 ctx 的权限服务按 location 绑定，探针只测了本 location 的 `interrupt`。跨目录后端 cancel/suspend 若不可用，记本 Notes，**不判 AC28/AC51 失败**。
- **N9 已知残留 —— steer 残留大概率不可检测**：上游 `delivery` 列只在 **inbox 表**（`packages/core/src/session/sql.ts:142`），**消息表没有该列**（`promotedFromMessage` 只是从 inbox 行回填，`inbox.ts:125-142`）⇒ `session.context()` **大概率拿不到** `delivery` ⇒ AC54 的检测**可能只能降级为"如实报不可检出"**。这是 ADR D9 已如实记录的风险，**不得**因"无法检出"判 AC54 失败。
- **N10 已知残留 —— 亡主判定是软信号**：`suspend` 的 ACL 以**登记 front 存活**为软信号（沿用既有 `resumedByOtherFront` 先例）。判定"front session 已不存在"依赖 `ctx.session.get` 对已删 session 的返回形态（404/异常）——若该形态与预期不符，AC48 记本 Notes，**不判失败**。
- **N13 已知残留 —— 跨 front 的顺序接管未拦也未披露**：`pair.front_session_id` 是**软信号**（ADR 风险章既有裁定）⇒ **另一个 front 在目标空闲且 goal_key 相同时可顺序接管并投递新简报**。本批**不拦**（与 ADR 风险章一致），**AC17 不覆盖该方向**；verifier **不得**拿 AC17 判该方向失败，**也不得**因此放过真正的归属越权（越权面在 pair ACL，不在 goal_key）。
- **N14 已知残留 —— 锁粒度粗于槽位粒度**：`pair.json` 与 `.role.lock` 都在 **stateRoot**（`registerSession`，`lib/delegate-core.ts:459-462`）⇒ **同仓不同 worktree 的派发会共享同一把锁、实际串行化**。AC42 的"两者都成功"仍成立（只是串行而非并行）⇒ **不得**把 AC42 读成"跨 worktree 真并行"。
- **N15 已知残留 —— `goal_key` 在多 worktree 下不唯一**：AC41 明确允许同仓不同 worktree 各有一个同 goal_key 的后端 ⇒ `goal_key` **不再是唯一键**，任何"按 goal_key 找后端"的实现（审计、ledger 关联）会歧义 ⇒ 实现须用 `(work_root, goal_key)` 或 `session_id` 定位，不得只用 `goal_key`。
- **N16 已验证 —— 符号链接不会造出第二槽位**：`workRoot` = `path.resolve(git rev-parse --show-toplevel)`，而 git 返回**物理路径** ⇒ 同一工作树经符号链接访问得到**同一个** `workRoot`（实测：真实路径与符号链接路径解析结果相同）。⇒ **无需**额外的 realpath 归一。
- **N17 已知残留 —— ADR D11.4 与 V42 的措辞张力**：D11.4 写「`suspend` 一个**不在跑**的后端 ⇒ 幂等 no-op」，V42 写「`suspend` 该后端**幂等释放**槽位」——在"`active` 但实际不 busy"这一形态上二者措辞不同。本 proposal 采**同时满足两者**的读法（**释放它所占据的槽位**；无槽可释放时才叫 no-op），见 AC51 ②。⇒ **建议 architect 回填 D11.4 的措辞**，避免实施期各自解读。
- **N12 映射表修正 —— 前一版的 V 编号整体错位（既有缺陷）**：前一版映射表按主题编号、自 V05 起与 ADR 实际条目错位 ⇒ 「可逆映射」名不副实。**本表已按 ADR 文件实际条目重排**。**verifier 复核映射时请以 ADR 原文为准**，若发现本表仍有错位，按 ADR 实际条目更正并记录（**不影响 AC 判据本身**，AC 集合与 ADR Verification 的对应关系不变）。
- **N11 已知残留 —— 消费确认的判据待实测**：见证据规则 9 与 AC44。**未完成锚定实测前，AC44 判不可判定**（不是失败）；触发降级时 AC51/AC52/AC53/AC54 作废并如实记录。

## Out of Scope

1. **worktree 隔离的自动创建**（每后端一个 git worktree）—— ADR D6.4，**后置**。落地时需插件自建 `git worktree add` + 生命周期与**清理策略**（TTL / 引用计数），不做清理策略即定时炸弹。**互斥键已在本轮改为 `workRoot`**，届时**无需再改键**。
2. **front 自身 session metadata 的 roster 快路径** —— **本批不实现**。它没有 AC 要求其存在（AC10–AC13 均由"全库 list + cursor 续扫"兜底覆盖），却带来每次 dispatch 的 read-modify-write 写放大与并发丢条目。ADR D2.4 已把它标为"快路径"而非必需。
3. **持久队列 / 自动重试 / 后台监控** —— ADR D9/D10 明示超限 fail-fast 不排队。
4. **项目 wiki** —— 沿用 `ADR-front-knowledge-capability` D6（先 ledger 一段时间）。
5. **新增独立"编排"agent** —— ADR 选项表已否决。
6. **治理面全局 roster 文件** —— ADR 选项表已否决。
7. **既有 `delegate` 的语义变更** —— 本 change **保留** `delegate` 同步单发面，既有**语义与既有判据全部不变**；但**新增三处变更面**（槽位检查 / 返回时写 `state:"idle"` / 条目落 `work_root`+`state`），见 **AC50**。
8. **`canonical_root` 归一** —— 属独立 change `canonical-root-normalization`，**本 change 依赖它先落地**（已落地，commit `23584cd`）。
9. **`sessions` 按 id 查单个** —— ADR D1 表里列了但 Verification 与 AC 均未覆盖，本批**不做**（AC37 判其不存在）。
10. **`cancel` 的 `remove` 选项** —— ADR D1 提到但无 AC，本批只做 `interrupt`；墓碑语义（AC28）已保证不依赖 remove。`suspend` 同理**不删除** session（AC51 ④）。
11. **scope 前缀重叠检测** —— ADR D8.2 明确**不实现**（单槽已构造性排除并发写 ⇒ 无可达的保护场景 ⇒ 保留即死代码）。**AC27 判其"不存在"**，不是判其行为正确。
12. **front session 对后端 session 的 prompt/steer 注入** —— 属超出范围假设（ADR D8.3）：用户在 TUI 里直接对后端打字会产生插件不可见的 pending steer。**本 change 不提供根治手段**，只报存疑（AC54）+ 声明假设（AC55）。
13. **持久化的槽位表** —— 槽位状态落在**既有 `pair.json`**（每工程仓，stateRoot），**不新增全局槽位文件**（理由同 ADR D2.1 的 roster 否决：第三份真相源 + 会悬挂）。

## 风险

- **证据类型不均**：本批多个 AC 的核心部分依赖 E2E；无 provider 时降级为静态/单测，验收强度下降（已由"证据规则 1/2/5"约束，不允许 skip 当 pass）。
- **AC4 / AC11 / AC26 是"容易被实现破坏"的判据**：观测面投递 prompt、cursor 不续扫、槽位检查与登记分两次锁——这三个都是实现时最容易漏的。**不得**因"逻辑上应该无害"而以代码审阅代替实测。
- **AC44 是本 change 的开关**：消费确认判据未实测 ⇒ 一旦不可靠，**整个切换能力作废**。⇒ 实施必须**先锚定再写码**（证据规则 9），且降级必须如实记录。**不得**为了"保住功能"而放宽判据。
- **AC46 ③ 是既有主路径的回归判据**：第二次顺序 `delegate` 到同一工作树必须成功——若失败，说明槽位翻转的实现破坏了既有同步派发，**属否决条件②**。
- **锁形态误用**：若实现时在 `withLock` 回调里 await（活体查询/`interrupt`）⇒ 撞 10s deadline 或持锁跨异步 ⇒ **AC26/AC46/AC52/AC53 全部受影响**。静态证据必须能看出锁内无 await（证据规则 10）。
- **AC33 是回归判据**：本 change 大幅扩展插件面，既有 `delegate` 的任何回归都算否决条件②。
- **AC34/AC35 是文档判据且要求"旧措辞消失"**：只能证明文本变更，不能证明模型行为；但 §6.1 与 `prompts/front.md` 的旧措辞若不删，后续实现者/模型会拿旧文否决新工具（critic 已指出），故它不是"可选的文档同步"。
- **AC27 是"判不存在"的判据**：反直觉（多数 AC 判"行为正确"），且**不得**被读成"实现了 scope 重叠检测"；若实施者保留了重叠判定，本 AC 判失败（死代码）。
- **AC15（goal_key）是实施必需契约**：`validateBrief` 当前无此字段（`lib/delegate-core.ts:201-274`），AC16/AC17/AC20 全依赖它。若实施时跳过 AC15，其余 goal_key 相关 AC 全部不可判。
- **存量 pair 无 goal_key 的回填是"只做一次"的例外**：AC15 ③ 允许存量条目续接一次并回填。该例外的实现要防止"每次都当作存量"（即回填后必须落盘）。
- **AC40 的存量 `state` 回填不得默认 `idle`**：那等于给存量后端放行第二个写入者（本仓当前已有存量 pair 条目）。
- **成本放大**：N 个后端 = N 倍 token。虽有上限（AC31），但上限值本身需要观察真实消耗后调整。
