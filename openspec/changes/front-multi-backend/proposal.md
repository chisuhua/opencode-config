# proposal: front-multi-backend

## 背景

ADR `docs/adr/ADR-front-multi-backend.md`（Accepted）描述的是一批**未实施**的改动：front 的委托能力从**同步单发**升级为**异步派发 + 只读观测 + 名册索引**。

用户诉求：**front session 能管理多个后端工程 session**——多个后端分别完成不同的工程目标，各自上下文保持干净。

现状 `delegate` 是同步单发（一次调用 = 建/复用 session → 投递简报 → `wait` 30min 上限 → 读 outcome → 返回 summary），四个缺口：时间耦合（front 回合被占住）、归属不可枚举（pair/ledger 按工程仓各存一份）、写隔离缺失（同工作树并发互踩）、上下文污染（resume 不校验目标一致性）。

拆开时间耦合还带出三个**由异步化派生**的洞：终态送达（无 push 通道）、存活性判断（"还在跑"从 `wait` 返回变成推导态）、外部删除可见性（后端"消失"与"从未派发"在 ledger 里同构）。

本 change 的唯一目的是**把该 ADR 的行为固化为可被 verifier 逐条判定的 AC**。

前置事实：**19 条运行时探针**（HTTP 层 8 + 插件内直测 8 + oracle 后补 3），见 `.rddf/reviews/front-multi-backend-probes.md`。

## 目标

1. 把 ADR 的 Verification 1–28 收敛为 AC 编号，给出**可逆的映射表**（ADR 条目 ↔ AC；同源条目已合并，见映射表下方说明），供 ADR 元数据回填。
2. 每条 AC 标明**最低可接受证据**与可直接复制的**证据命令**。
3. 明确 Out of Scope 与"Notes to verifier"（已披露残留），避免把有意取舍判成失败。
4. **给出实施必需的契约**：goal_key 的输入与落盘（AC15）、`sessions` 输出 schema（AC29）、dispatch 的写入顺序与失败语义（AC30）——这三项是 AC16/17/20/10/23 能成立的前提。

## 证据规则（先于 AC 生效）

1. **E2E 默认全 skip**（`E2E_REAL_RUNTIME` 未设置时 bats 退出码 0）。**skip ≠ pass**：E2E 未实际执行时，该 AC 判**不可判定**，禁止判通过；须改用该 AC 的"降级证据"。
2. **E2E 用例当前不存在**：`/workspace/main/rdd-workflow-e2e/tests/integration/test_front_delegate_runtime.bats` 现有 **L2-1..L2-15，无任何 dispatch/sessions/cancel 用例**。⇒ 本 change 的 E2E 判据**依赖该文件新增 L2-16 起的用例**；实施方必须提交该仓库的 commit 并在 Notes 记录 SHA。**未提交则所有"仅 E2E 证据"的 AC 判不可判定**——因此下列 AC 全部给了单测降级证据。
3. **证据类型只有三种**：`单测`（`bun test tests/`）、`E2E`（真实运行时 + 真实模型）、`静态`（配置/`debug agents`/`git show`/`grep`）。**不设"人工"类型**——verifier 契约要求每条判据至少 1 条工具证据。
4. **观测面污染必须显式测**：AC4 的判据是"调用 `sessions` 前后**被观测后端的会话上下文**不变"——**不是** ledger 行数（ledger 由父插件在结束时写，prompt 投递不会立即产生行，行数不变证明不了没投递）。
5. **权限配置文件写实际生效路径**：`opencode.jsonc` 是**符号链接** → `opencode.jsonc.opencode-go`（`readlink -f` 可验）。静态证据必须解析到后者。
6. **工具可见性的证据边界**：`opencode debug agents` 看到的是**权限矩阵**，不是工具注册表（见 `docs/front-delegate-testing.md:60`）。它只能证明 action 规则存在；"工具真的可见"必须另有真实调用证据（AC1 已据此拆分）。
7. **上游语义锚定**：本 change 依赖 `delivery` 默认值、`time.busy` 存在性、`session.list` 过滤字段三项上游行为。**AC38** 判据为在**装好的环境**实测这些语义；上游变更时该 AC 会先红。⚠️ 探针 Q2（get 在 run 中无 `time.busy`）与 R4（run 中 `busy` 有值）**存在观测冲突**，AC38 必须钉到具体 API（`get` 还是 `list`）。
8. **`opencode debug agents` 首跑可能非 JSON**（location 激活竞争）：重试 ≤3 次或截取首个 `[` 到末尾 `]`。

## 验收标准

### A. 工具面与门控

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC1** | front 的权限矩阵含 `delegate_dispatch`/`delegate_sessions`/`delegate_cancel` 三条规则（全局 deny + front allow）**且** front 会话里三个工具实际可调用、`delegate` 仍可调用 | 静态：`opencode debug agents`（解析 `readlink -f opencode.jsonc` 后的实际文件）**+** E2E（front 会话内真实调用） |
| **AC2** | 除 front 外任一 agent（build / plan / general / 五个 subagent）调用 `dispatch`/`sessions`/`cancel` → **权限层**拒绝（非模型拒绝） | E2E；降级：静态 —— **全局 `permission` 块存在三条显式 `deny`** 且仅 `agent.front.permission` 为 `allow`（**不是**查"无 allow"——缺省策略下无 allow 仍是 allow） |
| **AC3** | `cancel` 的 action 可被**单独 deny** 而 `dispatch`/`sessions` 仍 allow（验证 action 细分生效，非同挂一个 action） | 静态：实际配置文件的两个块 + `debug agents` |
| **AC4** | **观测面不污染**：`sessions` 调用前后，被观测后端的 **`session.context` 消息条数与最后一条消息 id 均不变**，且 `time.updated` 不变（**不投递 prompt 的直接证据**）。⚠️ **不测 ledger 行数**——reconcile 会写行（AC13），且 prompt 投递不会立即产生 ledger 行，行数不变证明不了没投递 | 单测（`sessions` 实现中无 `ctx.session.prompt` 调用 + fake ctx 断言 `prompt` 零调用）；E2E（调用前后取 context 快照 diff） |
| **AC5** | **`dispatch` 立即返回**：调用后**不等待后端跑完**即返回 `session_id` + `state:"running"`（真实后端仍在跑） | E2E（派一个长任务，断言返回时后端 `time.busy` 仍在）；降级：单测（`execute` 不调 `wait`） |
| **AC6** | **`dispatch` 显式 `delivery:"queue"`**：代码级强制（不依赖上游默认值 steer） | 静态：`lib/delegate-core.ts` 中 `prompt` 调用点含 `delivery: "queue"` 字面量 |
| **AC7** | **`dispatch` 有硬超时**：fake ctx 的 `create`/`prompt`/`update` 返回**永不 settle 的 Promise** → `dispatch` 在超时上限内以**明确错误**返回，且**不留下已创建的 session**（清理）。⚠️ 不是"构造挂死的后端"——dispatch 不 wait 后端，后端挂死不会让 dispatch 挂住 | 单测（fake ctx + 断言错误类型 + 断言无残留 session） |
| **AC8** | **不向 front session 发 prompt**：插件对 front session **只做 metadata 读/写**（探针 R6 实测自 prompt 会死锁） | 静态：`dispatch`/`sessions`/`cancel` 实现中无对 front session 的 `prompt` 调用；单测（fake ctx 记录调用） |

### B. 名册与索引

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC9** | **dispatch 落三处**：后端 session 的 metadata 含 `delegated_by`/`goal_key`/`canonical_root`/`baseline_message_id`/`dispatched_at`/`state`；`pair.json` 有对应条目**且含 `goal_key`**；`ledger.jsonl` 有 `dispatched` 行 | 单测（core + tool）；E2E（真实派发后读三个文件） |
| **AC10** | **`sessions` 列出本 front 名下全部后端**（≥2 个，分属不同工程目录），每项含**已定义的 schema 字段**（见 AC29） | E2E（派两个后端到不同目录 → `sessions` 列出两个）；降级：单测（fake `session.list` 夹具） |
| **AC11** | **兜底路径扫全量**：构造 >50 个 session（其中 ≥2 个是被派发的后端且 `time.updated` **最旧**）→ 换代后的 `sessions` 仍能列出这两个（验证 cursor 续扫，不因 limit 窗口漏扫） | E2E；降级：单测（fake `session.list` 返回 2 页 + 1 条沉底，断言续扫） |
| **AC12** | **front 换代可找回**：新 front session id 下，兜底路径仍能列出旧后端 | E2E；降级：单测（roster 为空时走 list 路径） |
| **AC13** | **外部删除可见（幂等）**：后端 session 被删后，`sessions` 报该项"已消失"，并在 ledger 补记终态行（**区别于"从未派发"**——后者无 dispatched 行）；**同一次消失只补一行**（重复查询不重复补）；补记的 `outcome` 取值**明确规定为 `vanished`**（独立字段，见 AC36） | E2E（删后端 → `sessions` 报消失 + ledger 出现终态行）；降级：单测（fake list 缺项 → 断言补记一次、二次查询不补） |
| **AC14** | **metadata 整体替换语义**：单次 update 后 metadata 的**完整字段仍在**。⚠️ **不保证条目级不丢**——roster 数组是 read-modify-write，并发 dispatch 时允许丢条目（兜底路径为准），AC 不得被读成"条目永不丢" | 单测（单次 update 字段完整性）；注明并发丢条目为可接受（Notes N3） |

### C. 一 session 一目标

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC15** | **goal_key 的输入与落盘**：① `validateBrief` 接受 `goal_key.intent`（kebab slug）字段，工程 dispatch 时**必填**；② `pair.json` 条目新增 `goal_key` 字段，resume 时**只从 pair 读**；③ 存量 pair 条目**无 goal_key** 时：允许续接一次并在成功登记时回填 goal_key（**不拒绝**，避免存量全部失联） | 单测（字段校验 + pair 落盘 + 存量无 goal_key 的回填路径） |
| **AC16** | **goal_key 不一致硬拒**：不同 `goal_key` resume → **拒绝**且提示新 session | 单测（两种用例）；E2E |
| **AC17** | **同 goal_key 的续接与拦截（拆两层）**：① 同 goal_key **且**该后端不在 in-flight、且由**本 front** 持有 → 允许；② 同 goal_key 但**已有 in-flight** 或**由另一 front 持有**（`pair.front_session_id` ≠ 当前）→ **拒绝**（落实 ADR 风险章要求的拦截） | 单测（四象限：本 front/他 front × 空闲/在跑） |
| **AC18** | **救援路径不误杀**：同一目标续接时，"原地补 grant"路径仍可用（goal_key 相同不被拒） | 单测（grant 救援用例） |
| **AC19** | **运行中不 steer 注入**：对正在运行的后端 resume → 拒绝并说明原因（**不**把新简报注入当前轮） | 单测（busy 判定）；E2E（真实运行中 resume 被拒） |
| **AC20** | **同 slug 异目标被文档化**：机制**不**拒绝（front 复用同一 slug 时校验通过），但 ledger 中两行的 goal 描述不同 ⇒ 可事后审计 | 静态（ADR D3 方向性段 + risk 章）+ 单测（行为断言：同 slug 通过） |

### D. 状态与聚合

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC21** | **running 判据用 `time.busy`**（**钉到 `get`**）：后端 run 进行中 → `ctx.session.get()` 的 `time.busy` 存在且（`idle` 未定义或 `busy > idle`）→ `sessions` 报 `running`；**不依据** `outcome`（该字段 run 未结束时不存在）。⚠️ 探针 Q2 与 R4 对 `get` 是否暴露 `time.busy` 有观测冲突，AC28 必须复核 | 单测（判活函数：busy>idle / busy 无 idle / busy<idle / 无 busy 四态）；E2E（真实运行中观测） |
| **AC22** | **窗口期保守**：刚派发、`busy` 尚未写入的窗口期 → 报 `running` 而非"已完成" | 单测（busy 未定义 + 有活动 → running） |
| **AC23** | **worst-of 聚合**：一个后端 `unverified` + 一个 `succeeded` → 整体**不得**报完成；一个 running + 一个 succeeded → 整体"进行中"；**明细永远列出** | 单测（聚合函数 + 输出结构）；E2E |
| **AC24** | **全部 unverified 的措辞**：报"无可验证交付"（**措辞不含"没有产出"**——产物可能落在 git 视野外） | 静态（`prompts/front.md` 措辞）+ E2E |
| **AC25** | **`stalled` 的阈值与判据**：`stalled = running 且 (now - lastActivityAt) > 阈值`；阈值常量**写死且可配置**；`stalled` 是**查询时推导态、不落盘** | 单测（阈值边界用例） |
| **AC29** | **`sessions` 输出 schema 已定义**：per-item 字段（`session_id`/`goal_key`/`project_root`/`state`/`outcome`/`evidence`/`last_activity_at`）与 aggregate 字段（`overall`/`items`/`headline`）在 proposal 或 design.md 中**有成文表**；实现与该表一致 | 静态（schema 表存在）+ 单测（输出字段集合断言） |

### E. 并发隔离、cancel 与写入顺序

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC26** | **同仓互斥（原子，且不残留）**：① 同 canonical_root 已有 in-flight 后端时再派发 → **拒绝**并说明（不排队、不静默并发）；② **检查与登记在同一 `withLock` 临界区内**（`withLock` 现签名是同步 `() => void`，而 `create` 是 await ⇒ **顺序必须定死**：create → 锁内 check+register，或改 withLock 支持 async）；③ **互斥拒绝时不得留下已创建的 session**（清理） | 单测（注入"检查后暂停"钩子，断言调用序列 `lock→check→write→unlock`；断言拒绝后无残留 session）；E2E（真并发两次） |
| **AC27** | **scope 重叠按路径段**：`["src/auth"]` 与 `["src/authorize"]` → **不重叠**（不拒）；`["src/auth"]` 与 `["src/auth/login"]` → **重叠**并拒绝。⚠️ **与互斥的优先级必须写明**：AC26 的互斥已按 canonical_root 拦住同根并发，scope 重叠检测因此**只在"互斥未触发"时可达**——实际可达场景是**互斥键放宽后**（未来 worktree 隔离）或**对已登记但空闲的后端做派发前预检**。若本批不实现 worktree 隔离，本条必须明确为"预检"语义，否则是死代码 | 单测（重叠判定纯函数 + 断言它与互斥的调用顺序/可达性） |
| **AC28** | **cancel 墓碑条件**：`interrupted:true`（在跑）**才**墓碑；`interrupted:false`（不在跑）为**纯 no-op，不墓碑**（保留可续接上下文——D7 的理由是"队列残留"，对已结束的后端不成立）。墓碑后：`sessions` 不再列为在跑；再次 dispatch 到同一后端 → **拒绝**（要求新建） | 单测（两种返回值的行为差异）；E2E |
| **AC30** | **dispatch 的写入顺序与失败语义**：顺序为 `create → pair → ledger(dispatched) → metadata → prompt`；任一步失败 → 返回失败、**清理已建 session**（best-effort）、ledger **留痕**（`event:"dispatch_failed"`）。此条覆盖"metadata 写失败但 session 已创建"的崩溃窗口 | 单测（各步注入失败，断言清理与留痕） |
| **AC31** | **并发上限（D8）**：同时在跑的后端数达到上限时，第 N+1 个 dispatch **fail-fast 拒绝**且**不排队**，错误信息说明先 cancel/finish 哪个 | 单测（上限边界用例） |
| **AC32** | **知识 session 与互斥/上限的关系**：`kind=knowledge`（只读）**不**被 AC26 的互斥拒绝；是否计入 AC31 的并发上限**二选一写死**（建议：不计入，只读不占写名额） | 单测（knowledge + engineering 并发用例） |

### F. 回归、文档与消费者同步

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC33** | **既有 delegate 无回归**：`bun test tests/` 全绿；既有判据全部仍通过（`outcome` 枚举含 `unverified`、`busy` 拒绝、scope 越界检测、pair 登记、ledger 行时机） | 单测（`bun test tests/`）+ E2E（既有 L2-1..L2-15 全绿） |
| **AC34** | **prompt 契约同步（含旧措辞清理）**：`prompts/front.md` ① 新增三工具路由表；② 明确「dispatch 返回 ≠ 后端完成」；③ **旧措辞已删除或改写**——`prompts/front.md:3,12,17,26,123` 与 `docs/front-delegate-architecture.md:35,310` 现写「一切工程行动经 delegate / 唯一工程通道 / 不给 front 第二出口」，与三个新工具**直接矛盾**，必须改 | 静态：`grep` 断言旧措辞**不再出现**于上述位置 + 新路由表存在 |
| **AC35** | **架构文档同步**：`docs/front-delegate-architecture.md` ① §6.1 不变式 1 的"出口"口径扩写为"唯一门控插件出口"；② §4.3 的 delivery 语义修正为 steer（**旧措辞"会排队"必须消失**）；③ §2.1 运行时全景图的工具面（`:35,41`）含三新工具 | 静态：`grep` 断言"会排队"不再出现 + §6.1 含新口径 |
| **AC36** | **ledger 消费者同步**：`dispatched`/`dispatch_failed` **裁定为独立 `event` 字段**（不塞进 `outcome` 的 6 值枚举，避免所有 outcome 消费者遇到未知值）；`vanished` 作为 `outcome` 新值需同步全部消费者。同步更新：`ADR-front-knowledge-capability` D5 的行产生时机表、`docs/dual-session-delegation.md` 的枚举表、`prompts/front.md` 的 ledger 说明 | 静态：四个位置的字段表均含 `event` 字段与 `vanished` |
| **AC37** | **`sessions` 按 id 查单个** —— 若实现则需判据；**本批不做**（见 Out of Scope 9），由 AC34 的 prompt 契约保证 front 不会调用不存在的形态 | 静态：`sessions` 的 input schema 不含按 id 查单的参数 |
| **AC38** | **上游语义锚定**：装好的环境实测 ① `prompt` 不传 `delivery` 时返回 `delivery:"steer"`；② `ctx.session.get()` 在 run 中返回 `time.busy`（**复核探针 Q2 与 R4 的冲突**）；③ `session.list` 的 `search`/`directory` 过滤生效 | 静态：shell/HTTP 实测三项，原始返回存档 |

## AC ↔ ADR Verification 映射

| ADR-front-multi-backend Verification | AC |
|---|---|
| 1（工具可见性） | **AC1** |
| 2（非 front 被拒） | **AC2** |
| 3（cancel action 可单独 deny） | **AC3** |
| 4（观测面不投递 prompt） | **AC4** |
| 5（dispatch 立即返回） | **AC5** |
| 6（显式 delivery:queue） | **AC6** |
| 7（硬超时） | **AC7** |
| 8（不得对 front session 发 prompt） | **AC8** |
| 9（dispatch 落三处） | **AC9**（+ AC15 goal_key 落 pair） |
| 10（sessions 列出名下后端） | **AC10**（+ AC29 输出 schema） |
| 11（外部删除可见 + 补记终态） | **AC13** |
| 12（front 换代找回） | **AC12**（+ AC11 扫全量） |
| 13（metadata 完整字段） | **AC14** |
| 14（同 goal_key 可续接 / 异 goal_key 拒） | **AC15**（输入与落盘）+ **AC16**（异拒）+ **AC17**（同可续接的分层）+ **AC18**（救援不误杀） |
| 15（运行中 resume 拒绝） | **AC19** |
| 16（同 slug 异目标文档化） | **AC20** |
| 17（running 判据） | **AC21**（+ AC22 窗口期） |
| 18（worst-of 聚合） | **AC23**（+ AC24 措辞） |
| 19（同仓互斥 + 原子性） | **AC26** |
| 20（scope 路径段重叠） | **AC27** |
| 21（cancel 墓碑） | **AC28**（+ AC32 knowledge 例外） |
| 22（既有 delegate 回归） | **AC33**（+ AC34 prompt + AC35 架构文档 + AC36 ledger 消费者） |
| 23（dispatch 硬超时——与 7 同源） | **AC7**（同源，已合并） |
| 24（兜底路径扫全量） | **AC11** |
| 25（同 slug 异目标被文档化——与 16 同源） | **AC20**（同源，已合并） |
| 26（明细永远输出——与 18 同源） | **AC23**（同源，已合并） |
| 27（上游语义锚定） | **AC38** |
| 28（观测面不污染（独立条目）——与 4 同源） | **AC4**（同源，已合并） |

> **映射说明**：ADR 的 Verification 清单在起草过程中从 22 条增至 28 条，其中 23–28 与 4/7/11/16/18 是同一判据的不同表述 —— 本表已在上方**合并到同源 AC**（不再单列 6 行），以消除"以哪条为准"的歧义。
>
> ⚠️ **AC38 说明**（上游语义锚定，见证据规则 7）：这是本 change 全部上游依赖的**一次性体检**——三项任一不符，对应的 AC（AC6 的 delivery、AC21 的 busy、AC10/AC11 的 list 过滤）全部前提失效。故它在最小集合之外单列，但**实施前必须先跑**。

> 扩展项（非 Verification 原文，metis 审查后新增）：**AC15**（goal_key 输入与落盘契约）、**AC17**（同 goal_key 续接的三层拦截）、**AC25**（stalled 阈值）、**AC29**（sessions 输出 schema）、**AC30**（dispatch 写入顺序与失败语义）、**AC31**（并发上限 D8）、**AC32**（knowledge 与互斥/上限）、**AC36**（ledger 消费者同步）、**AC37**（按 id 查单个——本批不做）、**AC38**（上游语义锚定，钉到 `get`）。

## Notes to verifier（不参与通过/失败判定）

- **N1 已知残留 —— 同 slug 异目标无法机制识别**（ADR D3 方向性 + risk 章已披露）：front 复用同一 slug 时 goal_key 校验通过 ⇒ 该方向退化为 prompt 纪律，靠 ledger 事后审计。**不得**要求 AC16 覆盖该方向；AC20 只判"该行为已被文档化"。
- **N2 已知残留 —— 插件 ctx 无 `inbox` API**：队列内容不可直接观测（探针 R5 实测 `Object.keys(ctx.session)` 全集）。cancel 后的队列残留**未经证否** ⇒ ADR D7 用墓碑语义规避。**不得**要求 AC28 证明"队列已清空"。
- **N3 已知残留 —— roster 允许丢条目**：roster 数组是 read-modify-write，并发 dispatch 时允许丢条目，**兜底路径为准**。AC14 只判"单次 update 字段完整"，**不得**被读成"条目永不丢"。
- **N4 已知残留 —— worktree 隔离未做**：ADR D6 第一步只做互斥；worktree 隔离**后置**。**不得**要求 AC26/AC27 覆盖"两个后端在同仓并行写"。
- **N5 环境依赖 —— E2E 需真实模型与可用 provider**：额度不足时用 AC 的降级证据，并把"E2E 不可执行"如实记录，**不判失败也不判通过**。
- **N6 E2E 用例需新增**：见证据规则 2 —— 实施方必须在外部仓库提交含 L2-16.. 的 commit 并在本节记录 SHA。**未记录 SHA 时，仅靠 E2E 的判据不可判定**（本 proposal 已为相关 AC 提供单测降级证据）。
- **N7 已知残留 —— 探针 Q2/R4 冲突**：`get()` 是否在 run 中暴露 `time.busy` 有两次观测冲突。AC38 第 ② 条必须复核；若实际不暴露，AC21 改走 `list` 或"消息条数/最后消息时间"兜底，**这不是实现缺陷**。
- **N8 已知残留 —— 跨 location 的 cancel 未验**：架构文档 `:180` 说明插件 ctx 的权限服务按 location 绑定，探针只测了本 location 的 `interrupt`。跨目录后端 cancel 若不可用，记本 Notes，**不判 AC28 失败**。

## Out of Scope

1. **worktree 隔离**（每后端一个 git worktree）—— ADR D6 第二步，**后置**。落地时的互斥键需从 stateRoot 改为 workRoot（ADR D6 前瞻注记）。
2. **front 自身 session metadata 的 roster 快路径** —— **本批不实现**。它没有 AC 要求其存在（AC10–AC13 均由"全库 list + cursor 续扫"兜底覆盖），却带来每次 dispatch 的 read-modify-write 写放大与并发丢条目。ADR D2.4 已把它标为"快路径"而非必需。
3. **持久队列 / 自动重试 / 后台监控** —— ADR D8 明示超限 fail-fast 不排队。
4. **项目 wiki** —— 沿用 `ADR-front-knowledge-capability` D6（先 ledger 一段时间）。
5. **新增独立"编排"agent** —— ADR 选项表已否决。
6. **治理面全局 roster 文件** —— ADR 选项表已否决。
7. **既有 `delegate` 的语义变更** —— 本 change **保留** `delegate` 同步单发面，既有判据不变。
8. **`canonical_root` 归一** —— 属独立 change `canonical-root-normalization`，**本 change 依赖它先落地**。
9. **`sessions` 按 id 查单个** —— ADR D1 表里列了但 Verification 与 AC 均未覆盖，本批**不做**（AC37 判其不存在）。
10. **`cancel` 的 `remove` 选项** —— ADR D1 提到但无 AC，本批只做 `interrupt`；墓碑语义（AC28）已保证不依赖 remove。

## 风险

- **证据类型不均**：本批多个 AC 的核心部分依赖 E2E；无 provider 时降级为静态/单测，验收强度下降（已由"证据规则 1/2/5"约束，不允许 skip 当 pass）。
- **AC4 / AC11 / AC26 是"容易被实现破坏"的判据**：观测面投递 prompt、cursor 不续扫、互斥检查与登记分两次锁——这三个都是实现时最容易漏的。**不得**因"逻辑上应该无害"而以代码审阅代替实测。
- **AC33 是回归判据**：本 change 大幅扩展插件面，既有 `delegate` 的任何回归都算否决条件②。
- **AC34/AC35 是文档判据且要求"旧措辞消失"**：只能证明文本变更，不能证明模型行为；但 §6.1 与 `prompts/front.md` 的旧措辞若不删，后续实现者/模型会拿旧文否决新工具（critic 已指出），故它不是"可选的文档同步"。
- **AC27（scope 重叠）的可达性依赖互斥的放宽**：本批互斥按 canonical_root 拦同根并发，scope 重叠检测因此只在"互斥未触发"时可达。若本批不实现 worktree 隔离，AC27 必须明确是"预检"语义（对已登记但空闲的后端做重叠警告），否则是死代码——**实施前必须二选一确认**。
- **AC15（goal_key）是本轮 metis 审查后新增的必要契约**：`validateBrief` 当前无此字段（`lib/delegate-core.ts:201-274`），AC16/AC17/AC20 全依赖它。若实施时跳过 AC15，其余 goal_key 相关 AC 全部不可判。
- **存量 pair 无 goal_key 的回填是"只做一次"的例外**：AC15 ③ 允许存量条目续接一次并回填。该例外的实现要防止"每次都当作存量"（即回填后必须落盘）。
