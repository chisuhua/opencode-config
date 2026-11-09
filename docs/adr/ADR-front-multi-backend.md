# ADR-front-multi-backend：front 管理多后端工程 session（异步派发 + 只读观测 + 名册索引）

## 元数据

| 字段 | 值 |
|------|-----|
| Status | **Accepted**（2026-11-09，architect 起草；oracle 已评审 + critic arch 档审稿完成，**0 BLOCKER**，5 SHOULD_FIX + 2 NITS 全部闭合）。**未实施**——关联 change 尚未立项 |
| Date | 2026-11-09 |
| Author | architect |
| Parent | 部分取代 `docs/adr/ADR-front-agent-redesign.md` 的 D2（`delegate` 的同步单发序列）与 D3（brief 契约的 scope 部分），**并把该篇 D2 的「唯一工程通道」口径扩写为「唯一门控插件出口」**（见 D1 的不变式说明）；**不改**该篇 D1（四分类）、D4（front 工具面白名单）、D5（preflight grants）、D6（登记与并发协议）、D7（guide 归宿）、D8（调试纪律）；与 `ADR-front-knowledge-capability` 的 D2（只读 subagent 门控）、D4（agent 白名单与 kind）、D5（ledger 记忆层）**决策面正交**，但 ledger schema 面有单点耦合（见 D2.2）。与 `ADR-canonical-root-normalization` **决策面正交**（本篇只在 goal_key 里引用归一后的 `canonical_root`），但**实施顺序有依赖**：归一篇应先落地 |
| 关联 change | `backlog: front-multi-backend`（**尚未立项**——本篇由 architect 起草，change 由 planner 立项；立项后回填 AC 映射与指针） |
| AC 映射 | **暂缺**（change 未立项）。本文件 Verification 1–22 为前瞻判据，立项后由 planner 映射到 AC 编号 |
| 审稿报告 | `.rddf/reviews/adr-front-multi-backend-review.md` |
| 前置事实 | 19 条运行时探针（HTTP 层 8 + 插件内直测 8 + oracle 后补 3），全部带真实返回摘录，落在 `.rddf/reviews/front-multi-backend-probes.md`。**本篇的每个技术断言都有探针背书，无推测项** |

## 背景与问题

front 今天的委托能力是**同步单发**：`delegate` 一次调用 = 建/复用工程 session → 投递简报 → `ctx.session.wait`（30min 上限）→ 读 outcome/context → 返回结构化 summary（`lib/delegate-core.ts` 的 18 步固定序列）。

用户要的是：**front session 能管理多个后端工程 session，多个后端分别完成不同的工程目标，各自上下文保持干净。**

拆开看，这不是「能不能建多个 session」——`pair-v2` 的设计本就是「一 front 对 N 工程 session」（ADR-front-agent-redesign D6）。真正的缺口是四类：

1. **时间耦合**：front 的整个回合被 `wait` 占住（最长 30 分钟）。N 个后端串行执行 ⇒ 总时长线性叠加，且期间 front 无法响应用户、无法观测任何一个后端。
2. **归属不可枚举**：`pair.json` 与 `ledger.jsonl` 都**按工程仓各存一份**。「front 名下有哪些后端、各自在哪个仓、什么状态」在本地**没有任何入口**。
3. **写隔离缺失**：scope 强制是 session 级 edit 规则，越界检测是委托前后 `git status` 差集。同一工作树上两个后端并发写 = 互相踩，且检测会互相误报。
4. **上下文污染**：resume 不校验目标一致性，把新目标灌进旧 session 的历史。

### 三个由「异步化」派生的洞（同步时代由时间耦合免费提供）

拆掉时间耦合不是把 `wait` 挪走就完事——**原本由耦合免费提供的三件事必须有人补位**：

5. **终态送达**：同步 `wait` 返回即"跑完了"。异步后没有 push 通道，「后端跑完」只能靠 pull。front 会话关闭后无人 pull 是**默认结局而非边角**，ledger 会永远缺终态行，聚合从此建立在不完整事实上。
6. **存活性判断**：同步时代「还在跑」由 `wait` 的返回证明。异步后它是**推导态**，且 `outcome` 字段在 run 未结束时**整个不存在**（探针 Q2）——「未开始 / 进行中 / 僵尸」三义性无法靠 `outcome` 区分。
7. **外部删除可见性**：用户可在 TUI 里直接删后端 session。对索引而言这是特性（索引随之消失），对**事实**而言是黑洞——后端不是「失败」而是「消失」。若 dispatch 时不落 ledger 行，「从未派发」与「派发后消失」在 ledger 里同构。

### 两条必须在 ADR 里写死的既有文档修正

- **上游 prompt 默认 `delivery="steer"`，不是 queue。** steer = **注入当前轮并改写它**（探针 P6 实测：run 中投第二条，最终 assistant 回的是第二条的内容）。既有架构文档 §4.3 写「同一 session 已有 in-flight run 时会排队」，**不准确**；插件层"busy 拒绝"是主动选择，正确，但理由要改写为"避免 steer 改写正在执行的目标"。
- **`delegate` 的每一次调用都会投递简报**（resume 分支也一样，`lib/delegate-core.ts:767-768` 无条件执行）⇒ **不存在"复用 delegate 轮询"这个选项**：查询本身就是污染源。观测必须是独立工具。

## 决策

**主决策**：front 的委托能力从**同步单发**升级为**异步派发 + 只读观测 + 名册索引**。派发与观测彻底分离为两个工具面：派发面**只管投递不管等**，观测面**只读不投递**。名册以宿主 session metadata 作**可丢弃索引**，真相仍在 `pair.json`（ACL）与 `ledger.jsonl`（事实）。

### D1 工具面：三工具，权限 action 细分

| 工具 | 语义 | 权限 action | 关键约束 |
|---|---|---|---|
| `dispatch` | 建/复用工程 session + 投递简报 → **立即返回**（不 wait） | `delegate_dispatch` | 必须显式 `delivery:"queue"`；execute 有**硬超时** |
| `sessions` | **只读**：列出本 front 名下后端 + 各自状态与证据；按 id 查单个 | `delegate_sessions` | **绝不投递 prompt**（唯一不污染后端的观测面） |
| `cancel` | `interrupt({resume:false})` 停一个后端；可选 remove（默认不删） | `delegate_cancel` | 墓碑语义（见 D7） |

**为什么拆工具而不是给 `delegate` 加 `async` 参数**：参数是**静默开关**——模型忘写 `async:true` 时静默退化为 30 分钟阻塞，多后端场景下等于其余后端全部饿死，**且无任何报错信号**。拆工具后误用形态变成「dispatch 完立刻汇报结果」，是**可见的体验问题**而非正确性问题，两者可检测性完全不同。

**为什么 action 细分而不是三工具同挂 `delegate`**：插件出口仍唯一（不变式 1 不丢），但治理面可按 action 粒度放行——例如允许派发与观测、禁止取消。功能等价、权限面更细，代价仅多两行权限配置。

**与「单一工程出口」不变式的关系（必须写明，否则后续读者会拿 §6.1 原文否决实现）**：`docs/front-delegate-architecture.md` §6.1 不变式 1 原文是「一切工程行动只能经 `delegate`。不要给 front 加第二个出口」。本篇**不修改这条不变式的实质**，只扩写它的**口径**：

> 不变式 1 的「出口」指的是**门控边界**——「同一个插件 + 每个工具声明独立的 `options.permission` action + 全局 deny + 仅 front allow」这套形态——而不是**工具名**。`dispatch`/`sessions`/`cancel` 全部落在同一个 `delegate` 插件内、全部走同一套门控形态、全部只对 front 可见；没有任何一条工程行动路径**绕过**该门控。

这一扩写**有既有依据**：`docs/front-delegate-architecture.md` §6.3「加一个新工具」已明确认可「一条 action 管多个工具」的形态（`run_tests` 示例即独立 `options.permission`）。→ **实施期必须同步修订 §6.1 的措辞**，把「出口」的定义写清（否则文档与实现长期不一致）。

**既有 `delegate` 保留**：它是同步单发面，服务「派一个任务、当场等结果」这一主路径。`delegate` 的**既有语义与既有判据全部不变**（`outcome` 枚举、`busy` 拒绝、scope 强制、pair 登记、ledger 行时机），既有 E2E 不受影响。但 `prompts/front.md` / 使用手册 / 架构文档**需要新增** dispatch 三工具的契约段（prompt 契约必须同步改，见 D1 与 Verification）。

**D1.1 `dispatch` 的硬超时**：execute 必须有超时上限（既有 `delegate` 是 30min）。理由是实测的：插件 setup 若未 settle 会**阻塞该 location 的激活**（探针报告 R6 节记录的 round 4 现象）——一个挂死的后端会拖住 front 的整个工具调用。

**D1.2 插件不得对 front session 发 prompt**：探针 R6 实测，在插件里对"正在运行的 session"发 prompt 会**死锁**。front session 的 prompt 只能由 front 自己发起；插件对 front session **只做 metadata 的读/写**。

### D2 名册：宿主 session metadata 作可丢弃索引

**D2.1 真相源切分（写死，三方不得混淆）**

| 数据 | 位置 | 角色 | 权威性 |
|---|---|---|---|
| 后端身份 + 目标 | `pair.json`（每工程仓） | **resume ACL 唯一判据** + 目标一致性校验 | 权威 |
| 历史事实 | `ledger.jsonl`（每工程仓） | 做过什么 | 权威、append-only |
| 名册索引 | **宿主 session metadata** | 枚举 + 展示态 | **可丢弃索引，丢了可重建，不是真相源** |

**为什么不用治理面全局 roster 文件**：它会成为第三份真相源（ADR-front-knowledge-capability D5 已写死「ledger 不参与 resume 校验，避免两个真相源漂移」）；且并发写需锁、跨项目可见性违背权限面、**会悬挂**（后端删了文件条目还在）。metadata 索引的三个优势：随 session 删除自动消失（探针 P8：remove 后 404，**不会悬挂**）、无新增文件、无新增锁。

**D2.2 dispatch 时必须落 ledger `dispatched` 行**：这是「从未派发」与「派发后消失」可区分的**唯一支点**。没有它，D5 的 unknown 兜底是盲的。append-only 账本把「派发」本身也变成事实。ledger schema 需新增 `dispatched` 态（与 `ADR-front-knowledge-capability` D5 的行产生时机表有单点耦合，须同步）。

**D2.3 索引内容**：后端 session 的 metadata 写 `{delegated_by:"front-delegate", front_session_id, goal_key, canonical_root, project_dir, baseline_message_id, dispatched_at, state}`。**metadata update 是整体替换语义**（探针 Q5），插件每次写必须回传完整对象。

**D2.4 检索入口**：`sessions` 工具 list 后按 metadata 过滤。两条路径并存：
- **快路径**：front 自身 session 的 metadata 维护 roster 数组（`{roster:[backend_id,...]}`）。探针 R6 实测**可行**且**经 host 活动后不覆盖** → 查询 O(1)、不占 title、不用扫全库。
- **兜底路径**：**全库 list + cursor 续扫**，按 `metadata.delegated_by === "front-delegate"` 过滤。用于 front 换代后重建名册（roster 随 front session 一起消失）。

**兜底路径的两条硬约束（探针 P2c / P7 背书，不可省略）**：
1. **必须 cursor 续扫到全量**，不能只扫一页。list 按 **`time_updated` 降序**、默认 limit=50 ⇒ **长期 idle 的后端会沉出窗口**。兜底路径必须循环 `cursor.next` 直到扫完或找齐。
2. **不能用 `directory` 过滤做重建**——重建时要发现的恰恰是"有哪些目录"，用 `directory` 过滤等于要求事先知道答案。
3. **`search` 只能作为可选优化，不能作为兜底主路径**：它按 title LIKE 收窄，需要一个**固定的 title 前缀标记**（如 `[fd]`），代价是 title 可见噪声 + 与 metadata 两套标记需保持一致。若采用，必须由插件单一写点保证一致性，并在 D2.3 的 metadata schema 里定义该前缀。

**front session 身份漂移**：roster 挂在 front session 上，front session 被重建后 id 变化 → 旧后端失联。故 roster **只能是快路径不是唯一路径**，兜底路径必须常在（front 换代后仍能通过 metadata 找回后端）。

### D3 一 session 一目标（守护「上下文干净」）

**goal 判等只看结构化 key，不看自然语言**：

```
goal_key = { repo: canonical_root, intent: <kebab-slug> }
```

自由文本的 goal 描述另存（供人读），**不参与判等**。理由：front 每次复述措辞会变，对自然语言做规范化或相似度比对都是魔法数字重灾区；slug 由 front 在**首次派发时确定**并随 brief 传入，续接时 front 复用同一 slug ⇒ 判等面收敛到「同一目标换了 slug」，而那本来就该视为新目标。

**resume 时校验 goal_key 一致**：不一致 ⇒ **拒绝续接、要求新 session**（不是警告，是硬拒）。这不只是设计洁癖——**宿主机制层面**：steer 会注入当前轮并改写它，把新简报灌进正在执行的 run 就是上下文污染（探针 P6 实测）。

**与救援路径不冲突**：「原地补 grant 续跑」（ADR-front-agent-redesign D5.1）本就是同一目标的延续，goal_key 相同。

**判等的方向性（必须写明，否则防线范围会被高估）**：goal_key 校验是**单向硬强制**——
- ✅ **换 slug 续接 ⇒ 机制拒绝**（这是硬强制点）。
- ❌ **同 slug 异目标 ⇒ 机制无法识别**。slug 由 front 自行确定，front 对两个不同目标复用同一 slug 时，校验通过 ⇒ **该方向的防线退化为 prompt 纪律**（见风险章）。

这是有意的取舍：对自然语言做规范化或相似度比对是魔法数字重灾区，而"front 复用 slug"是一个**可审计**的错误（ledger 里能看到同一 slug 出现在不同 goal 描述上），比"判定算法把两个目标误判为不同"（会导致该续接的被拒，用户被迫重跑）危害小。

### D4 状态判定：running 判据用 `time.busy`

**判据**（探针 R4 实测，v2.2.5 的 `Session.Info.time` 有 `busy` 字段）：

```
running  ⟺  time.busy 存在  ∧  (time.idle 未定义 ∨ time.busy > time.idle)
```

- **`outcome` 不可用于判活**：run 未结束时该字段**整个不存在**（探针 Q2），「未开始 / 进行中 / 僵尸」三义。
- **保守规则**：`busy` 在 run 刚起的一小段时间内**仍为 null**（探针 R4 的 t0 时刻）⇒ 判据必须容忍"busy 未定义但有未终结活动"，**宁可报 running 不报完成、宁可报 unknown 不报 verified**。
- `stalled` 是**查询时推导态、不落盘**；判据为「running 且距上次活动超过阈值」。

### D5 聚合语义：整体 = 最差的那个，且永远列明细

- 任一后端 `unverified` / `unknown` / `stalled` ⇒ **不得声称整体完成**（与 `ADR-delegate-delivery-evidence` 的 `unverified` 语义同构，推广）。
- 任一后端 running ⇒ 整体"进行中"，且**不进入 worst-of 计算**（worst-of 只对已终结后端）。
- 全部 `unverified` ⇒ "无可验证交付"（**不是**"没有产出"——产物可能落在 git 视野外）。
- **headline 之外永远列明细**：`1 running + 1 unverified` 若只显示"进行中"会让用户误以为一切正常；headline 应为「进行中（含 1 项交付存疑）」或放弃单一 headline。

### D6 同仓并发：先互斥，worktree 后置

同一 canonical_root 上两个后端 session 并发写 = 共享工作树互踩（文件覆盖、git index 锁、`git status` 互相误读）。**事后检测兜不住工作树层的破坏**（它兜的是 git 层冲突）。

**第一步（本篇实施）**：同 canonical_root 的工程 session **互斥**（已有 in-flight 则拒绝派发）+ scope 前缀重叠检测拒绝。重叠检测按**路径段前缀**匹配，不用字符串前缀——`"src/auth"` 与 `"src/authorize"` 字符串前缀重叠但语义无关，`"src/auth"` 与 `"src/auth/login"` 才是真重叠。

**互斥检查必须原子**：check-then-act 跨两次锁会双双通过 ⇒ 检查与登记在**同一次 `withLock` 临界区**内完成。

**第二步（后置）**：每后端一个 git worktree。`ctx.worktree.create` 需 `projectID`（`packages/schema/src/worktree.ts:12`）而插件 ctx 拿不到目标仓的 project id（`ctx.worktree.create` 的 `source()` 还要求源目录已登记，`packages/core/src/worktree.ts:188-191`）⇒ 需插件自建 `git worktree add`，生命周期（命名/目录基/**清理策略**）全归插件。**落地时必须同时配清理策略（TTL / 引用计数），否则是定时炸弹。**

**第二步的前瞻注记（供后续 ADR 引用）**：worktree 隔离落地时，**互斥键必须从 `canonical_root`（stateRoot）改为 `workRoot`**——否则同一仓库的多个 worktree 会被"同 repo 互斥"堵死，隔离能力等于没实现。同时 `ADR-canonical-root-normalization` 的 stateRoot/workRoot 拆分正是这一步的前置。

### D7 cancel = 墓碑语义

`cancel` 后的后端 session **永久不可 resume**，再派必须新建。

理由：探针 R5 观测到 cancel 后队列里那条**未送达**、再次 resume 后 wait 未在 25s 内 settle，但**这不是证明不存在**——插件 ctx **没有 `inbox` 方法**（探针 R5 实测 `Object.keys(ctx.session)` 全集），无法确认队列是否仍挂着旧简报。**不依赖未探明的上游清理行为**，从生命周期上封杀复用。复用价值本就趋近于零（一 session 一目标，D3），而幽灵注入的危害是不对称的。

### D8 成本与并发上限

同时在跑的后端数设上限；**超限时 fail-fast 拒绝，不排队**（排队需要持久队列，超出本篇范围）。`Session.Info` 带 `cost`/`tokens` ⇒ 每后端成本可观测（探针 Q7 确认 list item 含 cost/tokens）。

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **三工具（dispatch/sessions/cancel）+ metadata 索引（选中）** | 采用 | 派发与观测分离是**唯一**能避免"查询即污染"的形态（`delegate` 每次调用都投递简报，resume 分支也一样）；metadata 索引随 session 删除自动消失，无悬挂、无新增锁、无第三份真相源；action 细分让治理面可单独禁取消 |
| 给 `delegate` 加 `async` 参数 | 否决 | 静默开关：忘写即静默退化为 30min 阻塞，多后端场景其余后端全部饿死且**无报错信号**。拆工具的误用形态是"汇报过早"（可见的体验问题），两者的**失败可检测性**完全不同 |
| 治理面全局 roster 文件（front-roster.json） | 否决 | 第三份真相源（ADR-front-knowledge-capability D5 已红线）；并发写需锁、跨项目可见性违背权限面、**会悬挂**（后端删了条目还在）。metadata 索引三个优势全占 |
| 新增独立「编排」agent | 否决 | 需求主体是「查询回答」（用户问"后端怎么样了"），答案应在 front 直接可得；多一层委托 = 观测面递归 + 编排器自身状态持久化 + 调试链路 ×2。适合的是未来「自动重试/监控/日报」类自主行为（另一个 ADR 的候选） |
| 纯 prompt 层让 front 记住自己派过谁 | 否决 | 会话中断即失忆、上下文窗口有限、无审计证据；与 ADR-front-knowledge-capability 刚建立的 ledger 记忆层方向直接矛盾 |
| 用上游 `session.list` + metadata，但**不**写 pair.json 的 goal | 否决 | metadata 随 session 删除即消失（探针 P8），resume ACL 失去判据；且把可丢弃索引升级成真相源，违背 D2.1 的切分 |
| 每后端一个 worktree + 现状 delegate 不改 | 否决 | 同步阻塞不解决，worktree 只是给串行排队准备了更多座位；核心矛盾（front 被 wait 钉死、无法并发观测）原封不动 |
| 直接允许同仓并发，靠 scope 强制 + 事后检测兜底 | 否决 | 事后检测兜的是 git 层冲突，拦不住工作树层的文件覆盖与 index 锁争用 |

## 后果 / 代价

**正面**

- front 的回合不再被后端钉死：派发即返回，N 个后端并发推进，用户随时能问进度。
- 「front 名下有哪些后端」有了**可枚举**的答案，且不新增持久状态文件。
- 上下文污染有了**强制点**：goal_key 不一致即拒续接，而不是靠 front 自觉。
- `time.busy` 提供了与 `outcome` 无关的活体判据，避免三义性误判。
- cancel 墓碑把"幽灵注入"这类未探明的上游行为从风险面里移除。

**负面 / 代价**

- **工具面从 1 个变 4 个**：front 的工具表变大，四分类路由（四选一）变成要区分「派发 / 观测 / 取消」三种出口 ⇒ prompt 契约必须同步改，否则模型会拿错工具。
- **dispatch 返回 ≠ 后端完成**：这是新增的失败形态——模型极易把"dispatch 成功"误报为"任务完成"。**必须在 `prompts/front.md` 写死**，属 prompt 层防线（不可靠，但比什么都不写强）。
- **终态可能永远不到**：front 不查询 ⇒ ledger 缺终态行。缓解是"开场即 reconcile"（见 D2.4）——front 新会话第一轮就要读状态（ADR-front-agent-redesign D7 已要求开场报状态），故 reconcile 与开场扫描天然合一；但用户不再问时，终态行仍可能缺失 ⇒ **ledger 的"未终结"记录必须被读侧理解为"未观测到终态"而非"没有终态"**。
- **metadata 整体替换语义**：每次写都要回传完整对象，漏字段即丢数据（探针 Q5）。
- **front session 换代即失联**：roster 是快路径不是唯一路径，兜底路径必须常在。
- **同仓并发先做互斥**：并发能力被压制（同仓一次只能一个后端在跑），这是**有意的保守**——worktree 隔离落地前的工作树层破坏不可事后兜底。

**风险**

- **上游语义漂移**：`delivery` 默认值、`time.busy` 存在性、`session.list` 的过滤字段都是上游行为；上游改默认值（steer↔queue）会让 D1/D4 的语义**静默反转**。⇒ 必须把「dispatch 必须显式传 delivery」写成**代码级强制**（不依赖默认值），并在 opencode 升级回归清单里加这两条。
- **插件 ctx 无 `inbox` API**：队列内容不可直接观测（探针 R5）⇒ 一切依赖"队列里有什么"的推断都不成立；D7 的墓碑语义正是为此。
- **双 front 并发管同一后端**：`pair.json` 的 front_session_id 只作**软信号**（ADR-front-agent-redesign D2 既有裁定），故两个 front 可同时 resume 同一后端 ⇒ 会排两份简报。危害低（后端跑两遍），但**要在 D3 的 goal_key 校验里一并拦**（同一 goal_key 重复 resume 即拒）。
- **同 slug 异目标无法机制识别**（D3 已写明方向性）：front 复用 slug 时防线退化为 prompt 纪律。缓解是**可审计**——ledger 里能看到同一 slug 出现在不同 goal 描述上，可事后发现。
- **成本放大**：N 个后端 = N 倍 token。虽有上限（D8），但上限值本身需要观察真实消耗后调整。
- **既有 `delegate` 与新 `dispatch` 并存**：两个派发面。缓解：prompt 明确「需要等结果 → delegate；并发多任务 → dispatch」，且**不**同时用两者管同一工程（互斥表覆盖两者）。

## Verification（可勾选验收判据，前瞻）

**工具面与门控（D1）**

- [ ] `opencode debug agents` 中 front 可见 `dispatch`/`sessions`/`cancel` 三个工具；`delegate` 仍可见。
- [ ] 除 front 外任一 agent 调用 `dispatch`/`sessions`/`cancel` → **权限层**拒绝（非模型拒绝），且 `delegate` 仍不可见。
- [ ] `cancel` 的 action 可被单独 deny 而 `dispatch`/`sessions` 仍 allow（验证 action 细分生效）。
- [ ] `dispatch` 的 execute 在后端挂死时**在超时上限内返回**（不无限等）；构造一个永不 settle 的后端验证。

**名册与索引（D2）**

- [ ] `dispatch` 后：后端 session 的 metadata 含 `delegated_by/goal_key/canonical_root/baseline_message_id/dispatched_at/state`；`pair.json` 有对应条目；`ledger.jsonl` 有 `dispatched` 行。
- [ ] `sessions` 列出本 front 名下全部后端（≥2 个，分属不同工程目录），每项含状态与证据字段；**调用 `sessions` 前后，被观测后端的 `ledger.jsonl` 行数不变**（证明观测面不投递 prompt、不污染）。
- [ ] 后端 session 被外部删除后，`sessions` 报该项"已消失"，并在 ledger 补记终态行（区分于"从未派发"）。
- [ ] front session 换代（新 front session id）后，仍能通过兜底路径找回旧后端。
- [ ] **兜底路径扫全量**：构造 >50 个 session（其中 ≥2 个是被派发的后端且 `time.updated` 最旧）→ 换代后的 `sessions` 仍能列出这两个后端（验证 cursor 续扫，不因 limit 窗口漏扫）。
- [ ] metadata update 后**完整字段仍在**（不因整体替换丢字段）。

**一 session 一目标（D3）**

- [ ] 同一后端用**相同 goal_key** resume → 允许；用**不同 goal_key** resume → **拒绝**且提示新 session。
- [ ] 同一目标续接时，`grant` 救援路径（原地补 grant）仍可用（goal_key 相同不误杀）。
- [ ] 对正在运行的后端 resume → 拒绝并说明原因（不 steer 注入当前轮）。
- [ ] **同 slug 异目标的行为被文档化**：机制**不**拒绝（front 复用同一 slug 时校验通过），但 ledger 中两行的 goal 描述不同 ⇒ 可事后审计发现。

**状态与聚合（D4/D5）**

- [ ] 后端 run 进行中 → `sessions` 报 `running`（依据 `time.busy`，不依据 `outcome`）。
- [ ] 后端刚派发、`busy` 尚未写入的窗口期 → 报 `running` 而非"已完成"。
- [ ] 一个后端 `unverified` + 一个 `succeeded` → 整体**不得**报完成；明细列出两者。
- [ ] 一个 running + 一个 succeeded → 整体"进行中"，且明细列出。
- [ ] 全部 `unverified` → 报"无可验证交付"（措辞不含"没有产出"）。
- [ ] 明细**永远**输出（不只有 headline）。

**并发隔离（D6）**

- [ ] 同 canonical_root 已有 in-flight 后端时再派发 → **拒绝**并说明（不排队、不静默并发）。
- [ ] scope `["src/auth"]` 与 `["src/authorize"]` 视为**不重叠**（路径段前缀，非字符串前缀）；`["src/auth"]` 与 `["src/auth/login"]` 视为**重叠**并拒绝。
- [ ] 互斥检查与登记在**同一次锁临界区**内（并发触发两次派发，只有一个成功）。

**cancel（D7）**

- [ ] `cancel` 后该后端被标为墓碑，`sessions` 不再列为在跑；再次 `dispatch` 到同一后端 → **拒绝**（要求新建）。
- [ ] `cancel` 返回 `{interrupted:true}`（在跑时）或 `{interrupted:false}`（不在跑时，幂等 no-op）。

**回归（D1 保留既有 delegate）**

- [ ] 既有 `delegate` 的全部既有判据（`outcome` 枚举含 `unverified`、`busy` 拒绝、scope 越界检测、pair 登记、ledger 行时机）**全部仍通过**（`bun test tests/` 全绿 + E2E 回归）。
- [ ] `prompts/front.md` 明确「dispatch 返回 ≠ 后端完成」，且区分「需要等结果 → delegate / 并发多任务 → dispatch」。
- [ ] opencode 升级回归清单新增两条：`delivery` 默认值、`time.busy` 存在性。
