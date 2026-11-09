# proposal: front-multi-backend

## 背景

ADR `docs/adr/ADR-front-multi-backend.md`（Accepted）描述的是一批**未实施**的改动：front 的委托能力从**同步单发**升级为**异步派发 + 只读观测 + 名册索引**。

用户诉求：**front session 能管理多个后端工程 session**——多个后端分别完成不同的工程目标，各自上下文保持干净。

现状 `delegate` 是同步单发（一次调用 = 建/复用 session → 投递简报 → `wait` 30min 上限 → 读 outcome → 返回 summary），四个缺口：时间耦合（front 回合被占住）、归属不可枚举（pair/ledger 按工程仓各存一份）、写隔离缺失（同工作树并发互踩）、上下文污染（resume 不校验目标一致性）。

拆开时间耦合还带出三个**由异步化派生**的洞：终态送达（无 push 通道）、存活性判断（"还在跑"从 `wait` 返回变成推导态）、外部删除可见性（后端"消失"与"从未派发"在 ledger 里同构）。

本 change 的唯一目的是**把该 ADR 的行为固化为可被 verifier 逐条判定的 AC**。

前置事实：**19 条运行时探针**（HTTP 层 8 + 插件内直测 8 + oracle 后补 3），见 `.rddf/reviews/front-multi-backend-probes.md`。

## 目标

1. 把 ADR 的 Verification 1–22 收敛为 AC 编号，给出**可逆的映射表**（ADR 条目 ↔ AC），供 ADR 元数据回填。
2. 每条 AC 标明**最低可接受证据**与可直接复制的**证据命令**。
3. 明确 Out of Scope 与"Notes to verifier"（已披露残留），避免把有意取舍判成失败。

## 证据规则（先于 AC 生效）

1. **E2E 默认全 skip**（`E2E_REAL_RUNTIME` 未设置时 bats 退出码 0）。**skip ≠ pass**：E2E 未实际执行时，该 AC 判**不可判定**，禁止判通过；须改用该 AC 的"降级证据"。
2. **证据类型只有三种**：`单测`（`bun test tests/`）、`E2E`（真实运行时 + 真实模型）、`静态`（配置/`debug agents`/`git show`/`grep`）。**不设"人工"类型**——verifier 契约要求每条判据至少 1 条工具证据。
3. **E2E 在外部仓库**：`/workspace/main/rdd-workflow-e2e`，文件 `tests/integration/test_front_delegate_runtime.bats`。本仓库 verifier 以**该仓库的 commit SHA + 运行日志**为证据锚点，不要求跨仓重跑。
4. **观测面污染必须显式测**：AC4 的判据是"调用 `sessions` 前后后端 ledger 行数不变"——这是本 change 最容易被实现破坏的约束，**不得**以"读操作理应无害"代替实测。
5. **上游语义锚定**：本 change 依赖 `delivery` 默认值、`time.busy` 存在性、`session.list` 过滤字段三项上游行为。AC26 判据为在**装好的环境**实测这些语义；上游变更时该 AC 会先红。
6. **`opencode debug agents` 首跑可能非 JSON**（location 激活竞争）：重试 ≤3 次或截取首个 `[` 到末尾 `]`。

## 验收标准

### A. 工具面与门控

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC1** | front 的工具表可见 `dispatch` / `sessions` / `cancel` 三个工具，**且 `delegate` 仍可见** | 静态：`opencode debug agents`（front 的工具可见性） |
| **AC2** | 除 front 外任一 agent（build / plan / general / 五个 subagent）调用 `dispatch`/`sessions`/`cancel` → **权限层**拒绝（非模型拒绝） | E2E；降级：静态（三个 action 在 agent 规则中无 allow） |
| **AC3** | `cancel` 的 action 可被**单独 deny** 而 `dispatch`/`sessions` 仍 allow（验证 action 细分生效，非同挂一个 action） | 静态：`opencode.jsonc` 的 permission 块 + `debug agents` |
| **AC4** | **观测面不污染**：`sessions` 调用前后，被观测后端的 `ledger.jsonl` 行数**不变**（证明 `sessions` 绝不投递 prompt） | 单测（`sessions` 工具不调 `ctx.session.prompt`）；E2E（真实调用前后 diff 行数） |
| **AC5** | **`dispatch` 立即返回**：调用后**不等待后端跑完**即返回 `session_id` + `state:"running"`（真实后端仍在跑） | E2E（派一个长任务，断言返回时后端 `time.busy` 仍在）；降级：单测（`execute` 不调 `wait`） |
| **AC6** | **`dispatch` 显式 `delivery:"queue"`**：代码级强制（不依赖上游默认值） | 静态：`lib/delegate-core.ts` 中 `prompt` 调用点含 `delivery: "queue"` 字面量 |
| **AC7** | **`dispatch` 有硬超时**：构造一个永不 settle 的后端 → `dispatch` 在超时上限内返回（不无限等） | 单测（超时分支）；E2E（长任务 + 观察返回） |
| **AC8** | **不向 front session 发 prompt**：插件对 front session **只做 metadata 读/写**（探针 R6 实测自 prompt 会死锁） | 静态：`dispatch`/`sessions`/`cancel` 的实现中无对 front session 的 `prompt` 调用 |

### B. 名册与索引

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC9** | **dispatch 落三处**：后端 session 的 metadata 含 `delegated_by`/`goal_key`/`canonical_root`/`baseline_message_id`/`dispatched_at`/`state`；`pair.json` 有对应条目；`ledger.jsonl` 有 `dispatched` 行 | 单测（core + tool）；E2E（真实派发后读三个文件） |
| **AC10** | **`sessions` 列出本 front 名下全部后端**（≥2 个，分属不同工程目录），每项含状态与证据字段 | E2E（派两个后端到不同目录 → `sessions` 列出两个） |
| **AC11** | **兜底路径扫全量**：构造 >50 个 session（其中 ≥2 个是被派发的后端且 `time.updated` **最旧**）→ 换代后的 `sessions` 仍能列出这两个（验证 cursor 续扫，不因 limit 窗口漏扫） | E2E（真实造 >50 个 session + cursor 续扫） |
| **AC12** | **front 换代可找回**：新 front session id 下，兜底路径仍能列出旧后端 | E2E（换 front session id 后 `sessions`） |
| **AC13** | **外部删除可见**：后端 session 被删后，`sessions` 报该项"已消失"，并在 ledger 补记终态行（**区别于"从未派发"**——后者无 dispatched 行） | E2E（删后端 → `sessions` 报消失 + ledger 出现终态行） |
| **AC14** | **metadata 整体替换不丢字段**：update 后 metadata 的**完整字段仍在**（不因替换语义丢字段） | 单测（metadata 字段完整性用例） |

### C. 一 session 一目标

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC15** | **同 goal_key 可续接 / 异 goal_key 硬拒**：相同 goal_key resume → 允许；不同 goal_key resume → **拒绝**且提示新 session | 单测（两种用例）；E2E |
| **AC16** | **救援路径不误杀**：同一目标续接时，"原地补 grant"路径仍可用（goal_key 相同不被拒） | 单测（grant 救援用例） |
| **AC17** | **运行中不 steer 注入**：对正在运行的后端 resume → 拒绝并说明原因（**不**把新简报注入当前轮） | 单测（busy 判定）；E2E（真实运行中 resume 被拒） |
| **AC18** | **同 slug 异目标被文档化**：机制**不**拒绝（front 复用同一 slug 时校验通过），但 ledger 中两行的 goal 描述不同 ⇒ 可事后审计 | 静态（ADR D3 方向性段 + risk 章）+ 单测（行为断言：同 slug 通过） |

### D. 状态与聚合

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC19** | **running 判据用 `time.busy`**：后端 run 进行中 → `sessions` 报 `running`（依据 `time.busy`，**不依据** `outcome`——该字段 run 未结束时不存在） | 单测（判活函数用例）；E2E（真实运行中观测） |
| **AC20** | **窗口期保守**：刚派发、`busy` 尚未写入的窗口期 → 报 `running` 而非"已完成" | 单测（busy 未定义 + 有活动的分支） |
| **AC21** | **worst-of 聚合**：一个后端 `unverified` + 一个 `succeeded` → 整体**不得**报完成；明细列出两者；一个 running + 一个 succeeded → 整体"进行中" | 单测（聚合函数用例）；E2E |
| **AC22** | **全部 unverified 的措辞**：报"无可验证交付"（**措辞不含"没有产出"**——产物可能落在 git 视野外） | 静态（`prompts/front.md` 措辞）+ E2E |
| **AC23** | **明细永远输出**：任何聚合结果都带 per-backend 明细（不只有 headline） | 单测（输出结构断言） |

### E. 并发隔离与 cancel

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC24** | **同仓互斥**：同 canonical_root 已有 in-flight 后端时再派发 → **拒绝**并说明（不排队、不静默并发）；且**检查与登记在同一锁临界区**（并发触发两次派发只有一个成功） | 单测（并发用例）；E2E（真并发两次） |
| **AC25** | **scope 重叠按路径段**：`["src/auth"]` 与 `["src/authorize"]` → **不重叠**（不拒）；`["src/auth"]` 与 `["src/auth/login"]` → **重叠**并拒绝 | 单测（重叠判定函数用例） |
| **AC26** | **cancel 墓碑**：cancel 后该后端不再列为在跑；再次 dispatch 到同一后端 → **拒绝**（要求新建）；cancel 返回 `{interrupted:true}`（在跑）或 `{interrupted:false}`（不在跑，幂等） | 单测（墓碑用例）；E2E |

### F. 回归与文档

| AC | 判据 | 最低证据（命令） |
|---|---|---|
| **AC27** | **既有 delegate 无回归**：`bun test tests/` 全绿；既有判据全部仍通过（`outcome` 枚举含 `unverified`、`busy` 拒绝、scope 越界检测、pair 登记、ledger 行时机） | 单测（`bun test tests/`）+ E2E（既有 bats 全绿） |
| **AC28** | **prompt 契约同步**：`prompts/front.md` 明确「dispatch 返回 ≠ 后端完成」，且区分「需要等结果 → delegate / 并发多任务 → dispatch」 | 静态：`grep` 核对 prompt 文本 |
| **AC29** | **架构文档同步**：`docs/front-delegate-architecture.md` §6.1 不变式 1 的"出口"口径已扩写为"唯一门控插件出口"；§4.3 的 delivery 语义已修正为 steer（非 queue） | 静态：`grep` 核对两处措辞 |
| **AC30** | **上游语义锚定**：装好的环境实测 `delivery` 默认值、`time.busy` 存在性、`session.list` 的 `search`/`directory` 过滤**均符合本 change 的前提** | 静态：shell/HTTP 实测三项 |

## AC ↔ ADR Verification 映射

| ADR-front-multi-backend Verification | AC |
|---|---|
| 1（工具可见性） | **AC1** |
| 2（非 front 被拒） | **AC2** |
| 3（cancel action 可单独 deny） | **AC3** |
| 4（**观测面不投递 prompt**） | **AC4** |
| 5（**dispatch 立即返回**） | **AC5** |
| 6（**显式 delivery:queue**） | **AC6** |
| 7（**硬超时**） | **AC7** |
| 8（**不得对 front session 发 prompt**） | **AC8** |
| 9（dispatch 落三处：metadata/pair/ledger dispatched） | **AC9** |
| 10（sessions 列出名下后端） | **AC10** |
| 11（外部删除可见 + 补记终态） | **AC13** |
| 12（front 换代找回） | **AC12**（+ AC11 扫全量） |
| 13（metadata 完整字段） | **AC14** |
| 14（同 goal_key 可续接 / 异 goal_key 拒） | **AC15**（+ AC16 救援不误杀） |
| 15（运行中 resume 拒绝） | **AC17** |
| 16（同 slug 异目标文档化） | **AC18** |
| 17（running 判据） | **AC19**（+ AC20 窗口期） |
| 18（worst-of 聚合） | **AC21**（+ AC22 措辞 + AC23 明细） |
| 19（同仓互斥 + 原子性） | **AC24** |
| 20（scope 路径段重叠） | **AC25** |
| 21（cancel 墓碑） | **AC26** |
| 22（既有 delegate 回归） | **AC27**（+ AC28 prompt 同步 + AC29 文档同步） |
| 23（**dispatch 硬超时**——与 7 同源，Verifications 起草后新增） | **AC7** |
| 24（**兜底路径扫全量**——critic 要求实跑的推断场景） | **AC11** |
| 25（**同 slug 异目标被文档化**——Verifications 起草后新增） | **AC18** |
| 26（**明细永远输出**——Verifications 起草后新增） | **AC23** |
| 27（**上游语义锚定**——Verifications 起草后新增） | **AC30** |
| 28（**观测面不污染（独立条目）**——Verifications 起草后从第 10 条拆出） | **AC4** |

> **映射说明**：本 ADR 的 Verification 清单在起草过程中从 22 条增至 28 条（补入观测面污染、硬超时、cursor 续扫、上游锚定、方向性说明等），故上表按**最终编号 1–28** 逐条列出，其中 23–28 与 4/7/11/18/23 存在内容重叠（同一判据的两种表述），已在对应 AC 列标明「同源」。
>
> 扩展项（非 Verification 原文）：**AC11**（兜底路径扫全量，critic 要求实跑的推断场景）、**AC30**（上游语义锚定）。

## Notes to verifier（不参与通过/失败判定）

- **N1 已知残留 —— 同 slug 异目标无法机制识别**（ADR D3 方向性 + risk 章已披露）：front 复用同一 slug 时 goal_key 校验通过 ⇒ 该方向退化为 prompt 纪律，靠 ledger 事后审计。**不得**要求 AC15 覆盖该方向；AC18 只判"该行为已被文档化"。
- **N2 已知残留 —— 插件 ctx 无 `inbox` API**：队列内容不可直接观测（探针 R5 实测 `Object.keys(ctx.session)` 全集）。cancel 后的队列残留**未经证否**⇒ ADR D7 用墓碑语义规避。**不得**要求 AC26 证明"队列已清空"。
- **N3 已知残留 —— worktree 隔离未做**：ADR D6 第一步只做互斥 + scope 重叠检测；worktree 隔离**后置**。**不得**要求 AC24/AC25 覆盖"两个后端在同仓并行写"（那是 worktree 隔离的目标态）。
- **N4 环境依赖 —— E2E 需真实模型与可用 provider**：额度不足时用 AC 的降级证据（静态/单测），并把"E2E 不可执行"如实记录，**不判失败也不判通过**。
- **N5 已知残留 —— front 自身 session metadata 承载 roster 的写放大**：每次 dispatch 一次整体替换（探针 R6 证实可行），但 metadata update 是**整体替换**语义 ⇒ 需自行 read-modify-write。

## Out of Scope

1. **worktree 隔离**（每后端一个 git worktree）—— ADR D6 第二步，**后置**。落地时的互斥键需从 stateRoot 改为 workRoot（ADR D6 前瞻注记）。
2. **持久队列 / 自动重试 / 后台监控** —— ADR D8 明示超限 fail-fast 不排队。
3. **项目 wiki** —— 沿用 `ADR-front-knowledge-capability` D6（先 ledger 一段时间）。
4. **新增独立"编排"agent** —— ADR 选项表已否决（观测面递归 + 状态持久化双份）。
5. **治理面全局 roster 文件** —— ADR 选项表已否决（第三份真相源 + 会悬挂）。
6. **既有 `delegate` 的语义变更** —— 本 change **保留** `delegate` 同步单发面，既有判据不变。
7. **`canonical_root` 归一** —— 属独立 change `canonical-root-normalization`，**本 change 依赖它先落地**（goal_key 引用归一后的值）。

## 风险

- **证据类型不均**：AC2/AC4/AC5/AC10/AC12/AC13/AC15/AC17/AC21/AC24/AC26 的核心部分依赖 E2E；无 provider 时降级为静态/单测，验收强度下降（已由"证据规则 1/3"约束，不允许 skip 当 pass）。
- **AC4 / AC11 / AC24 是"容易被实现破坏"的判据**：观测面投递 prompt、cursor 不续扫、互斥检查与登记分两次锁——这三个都是实现时最容易漏的。**不得**因"逻辑上应该无害"而以代码审阅代替实测。
- **AC27 是回归判据**：本 change 大幅扩展插件面，既有 `delegate` 的任何回归都算否决条件②。
- **AC29 是文档判据**：只能证明文档含相应措辞，不能证明模型行为；但 §6.1 措辞若不改，后续实现者会拿旧文否决新工具（critic 已指出），故它不是"可选的文档同步"。
