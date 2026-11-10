# ADR-front-multi-backend：front 管理多后端工程 session（异步派发 + 只读观测 + 名册索引）

## 元数据

| 字段 | 值 |
|------|-----|
| Status | **Accepted**（2026-11-09；**实施完成并归档**（2026-11-10）：47 条任务全绿、验收第 6 轮 PASS（`.rddf/reviews/front-multi-backend-verify.md`）、ADR 审稿 critic 第 4 轮 **APPROVE**（`.rddf/reviews/adr-front-multi-backend-review.md`）；**后续 backlog 见 CHANGELOG v2.7 的「已知缺口 / 后续 backlog」段**） |
| Date | 2026-11-09（初稿与本次改写同日） |
| Author | architect |
| 本次改写（摘要） | ① 槽位键改 `workRoot`（原 `canonical_root`）+ 单槽切换模型；② **D12 已删后端的可见性（能力边界）+ 后续触碰处置矩阵**（V09 随之改写；V08 修正「reconcile 会写行」的误述）；③ **D11.3 停机判据订正**——`interrupt` 的返回值（`true`/`false`）都不是停机判据，判据是「判活为假 + 终态落定（水位线前移）」；AC13 判据按 D12 改写为五段；④ **停机判据的两处如实化 + 备选取舍**——「陈旧 busy」形态**不被兜住**（登记为残留风险，不被兜住就不再声称被兜住）、并写明**为什么不用上游 `ctx.session.wait`**（能覆盖后继 execution，但跨 server 实例不可靠、interrupt 中的返回语义未实测 ⇒ 登记为待实测备选）。详见审稿报告。 |
| 首轮改写（摘要） | ① D6 槽位键 `canonical_root`→**`workRoot`**，并把「互斥」细化为**单槽**（常驻 vs 活跃分离）；② 新增 **D7 槽位生命周期**（翻转执行者 / 消费确认 / 回收与亡主接管）、**D8 构造性保证与范围假设**、**D11 切换两步编排**；③ 原 D7 改为 **D9 终止（墓碑）vs 暂停（可续）** 的边界；④ D1 工具面三→四（加 `suspend`）；⑤ D2.3/D3 索引与检索键加 `work_root`。改写理由、证据与评审记录见审稿报告 |
| Parent | 部分取代 `docs/adr/ADR-front-agent-redesign.md` 的 D2（`delegate` 的同步单发序列）与 D3（brief 契约的 scope 部分），**并把该篇 D2 的「唯一工程通道」口径扩写为「唯一门控插件出口」**（见 D1 的不变式说明）；**不改**该篇 D1（四分类）、D4（front 工具面白名单）、D5（preflight grants）、D7（guide 归宿）、D8（调试纪律）；**D6（登记与并发协议）的锁协议沿用不改**（槽位翻转仍走其同步 RMW，见 D7.1），但其 **pair-v2 schema 追加 `work_root` / `state` 两字段**（本次改写，见 D2.1/D2.3）；与 `ADR-front-knowledge-capability` 的 D2（只读 subagent 门控）、D4（agent 白名单与 kind）、D5（ledger 记忆层）**决策面正交**，但 ledger schema 面有单点耦合（见 D2.2）。与 `ADR-canonical-root-normalization` **原为决策面正交，本次改写后变为强依赖**：D6 的槽位键直接取其 D1 定义的 `workRoot`（该篇已落地，commit `23584cd`），其 `stateRoot/workRoot` 拆分正是本篇「同工作树单槽」的前置 |
| 关联 change | `openspec/changes/archive/2026-11-10-front-multi-backend/`（2026-11-09 立项，planner 起草；**2026-11-10 归档**） |
| AC 映射 | 本文件 Verification **V01–V49**（判据条目**已编号**，与 proposal 的「AC ↔ ADR Verification 映射」表**逐条同号**；下同（本次改写把判据集从 28 条扩到 49 条：新增 `suspend` 门控、`work_root`/`state` 索引、单槽与实现约束、消费确认与翻转执行者、回收与亡主接管、终止/暂停、切换与回收）。**映射表在 proposal 的「AC ↔ ADR Verification 映射」段**——本次新增/改写判据对应的 AC 编号由 planner 在同步 proposal 时补齐并回填；**回填前以本文件的 Verification 文本为准** |
| 审稿报告 | `.rddf/reviews/adr-front-multi-backend-review.md`（初稿 + **本次改写**的 oracle/critic 记录追加在同一文件） |
| 前置事实 | 19 条运行时探针（HTTP 层 8 + 插件内直测 8 + oracle 后补 3），全部带真实返回摘录，落在 `.rddf/reviews/front-multi-backend-probes.md`。**本篇的技术断言都有探针或上游源码背书**；**未探针的假设在正文中显式标注**（如 D12 选项表第④条的「跨 server 实例删除是否送达」）。<br>**本次改写新增上游源码证据**（opencode v2.2.5）：`packages/core/src/session/execution.ts:151-170`（interrupt 的 resume 语义）、`packages/core/src/session/execution.ts:27-31`（**interrupt 只保证「已接受」、清理异步 settle**）、`packages/core/src/session/run-coordinator.ts:142-162`（**interrupt 返回 false 的三种成因**：无执行 / `stopping` 中（仍在跑）/ settle 窗口（fiber 已退、终态未发布））、`packages/core/src/session/projector.ts:527,798-800`（**`time.idle` = 唯一写入点的严格单调终态水位线**）⇒ 停机判据见 D11.3、`packages/core/src/session/inbox.ts:470-487`（inbox 提升顺序）、`packages/plugin/src/promise/adapter.ts:622-645`（插件可见的 session 方法全集）——见 D6/D7/D9/D11.3 |

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

**本次改写补充的需求形态（2026-11-09）**：用户要的**不是「多仓并行」，而是「同一工作树内的多目标编排」**——同一工作树里常有多个待办目标，各自需要一个上下文干净的工程 session；这些 session **常驻**（不因切换而丢弃），但**同一时刻只允许一个在跑**，由 front 决定**何时切到哪个**（暂停当前、恢复另一个）。

这条需求把 D6 的问题从「同仓能不能**并发**」翻转成「同仓能不能**串行地轮转**」：

- 纯**拒绝式互斥**（撞上占用就报错）不满足——被撞的后端要么根本没建，要么建了也不能常驻、不能切换；
- 纯**全并发**也不满足——工作树层的破坏事后兜不住（见上）；
- ⇒ 需要**单槽**（同一工作树一次一个活跃）+ **可切换**（暂停 ≠ 终止）。这是 D6 / D9 / D11 的组合，缺一不可。

### 两条必须在 ADR 里写死的既有文档修正

- **上游 prompt 默认 `delivery="steer"`，不是 queue。** steer = **注入当前轮并改写它**（探针 P6 实测：run 中投第二条，最终 assistant 回的是第二条的内容）。既有架构文档 §4.3 写「同一 session 已有 in-flight run 时会排队」，**不准确**；插件层"busy 拒绝"是主动选择，正确，但理由要改写为"避免 steer 改写正在执行的目标"。
- **`delegate` 的每一次调用都会投递简报**（resume 分支也一样，`lib/delegate-core.ts:767-768` 无条件执行）⇒ **不存在"复用 delegate 轮询"这个选项**：查询本身就是污染源。观测必须是独立工具。

## 决策

**主决策**：front 的委托能力从**同步单发**升级为**异步派发 + 只读观测 + 名册索引**。派发与观测彻底分离为两个工具面：派发面**只管投递不管等**，观测面**只读不投递**。名册以宿主 session metadata 作**可丢弃索引**，真相仍在 `pair.json`（ACL）与 `ledger.jsonl`（事实）。

### D1 工具面：四工具，权限 action 细分

| 工具 | 语义 | 权限 action | 关键约束 |
|---|---|---|---|
| `dispatch` | 建/复用工程 session + 投递简报 → **不等任务完成**即返回 | `delegate_dispatch` | 必须显式 `delivery:"queue"`；execute 有**硬超时**；**返回前须等消费确认**（D7.2，超时 ⇒ 报"投递结果未知"）；目标槽位被占时**拒绝**（D6） |
| `sessions` | **只读**：列出本 front 名下后端 + 各自状态与证据；按 id 查单个 | `delegate_sessions` | **绝不投递 prompt**（唯一不污染后端的观测面） |
| `suspend` | **暂停**一个后端：interrupt + 释放槽位 + 标记可续 | `delegate_suspend` | **不是终止**——不墓碑，目标仍可 resume（D7/D9） |
| `cancel` | **终止**一个后端：`interrupt({resume:false})` + 墓碑；可选 remove（默认不删） | `delegate_cancel` | 墓碑语义（D9） |

**为什么拆工具而不是给 `delegate` 加 `async` 参数**：参数是**静默开关**——忘写 `async:true` 就静默退化为 30 分钟阻塞，多后端场景下其余后端全部饿死且**无报错信号**；拆工具后误用形态变成「dispatch 完立刻汇报结果」，是**可见的体验问题**而非正确性问题。

**为什么 `suspend` 是独立工具而不是 `cancel` 的参数开关**：同一判据——**默认值不可逆**。若 `cancel({mode:"suspend"})` 而模型漏写 `mode`，默认落到 `terminate` 会**永久杀死一个本该续接的后端**；而 `suspend` 漏写时落到 `cancel` 则是**可恢复的**（重建 session 即可，代价是丢上下文）。⇒ 不可逆的默认值必须由**独立的工具名**承载，让误用形态从「静默丢失」变成「用错工具」（可见）。 **为什么 action 细分而不是四工具同挂 `delegate`**：插件出口仍唯一（不变式 1 不丢），但治理面可按 action 粒度放行（如允许派发与观测、禁止取消）——功能等价、权限面更细，代价仅几行配置。

**与「单一工程出口」不变式的关系（必须写明，否则后续读者会拿 §6.1 原文否决实现）**：`docs/front-delegate-architecture.md` §6.1 不变式 1 原文是「一切工程行动只能经 `delegate`。不要给 front 加第二个出口」。本篇**不修改这条不变式的实质**，只扩写它的**口径**：

> 不变式 1 的「出口」指的是**门控边界**——「同一个插件 + 每个工具声明独立的 `options.permission` action + 全局 deny + 仅 front allow」这套形态——而不是**工具名**。`dispatch`/`sessions`/`suspend`/`cancel` 全部落在同一个 `delegate` 插件内、走同一套门控形态、只对 front 可见；没有任何一条工程行动路径**绕过**该门控。既有依据：§6.3「加一个新工具」已认可「一条 action 管多个工具」（`run_tests` 示例即独立 `options.permission`）。→ **实施期须同步修订 §6.1 措辞**。

**既有 `delegate` 保留**：同步单发面，服务「派一个任务、当场等结果」这一主路径；**既有语义与判据全部不变**（`outcome` 枚举、`busy` 拒绝、scope 强制、pair 登记、ledger 行时机），既有 E2E 不受影响——新增的只是共享槽位表带来的检查（D7.4）。`prompts/front.md` / 手册 / 架构文档需新增四工具契约段。

**D1.1 硬超时 + D1.2 不得对 front 发 prompt**：execute 必须有超时上限——插件 setup 若未 settle 会**阻塞该 location 的激活**（探针 R6 的 round 4 现象），一个挂死的后端会拖住 front 的整个工具调用；且探针 R6 实测在插件里对"正在运行的 session"发 prompt 会**死锁** ⇒ front 的 prompt 只能由 front 自己发起，插件对 front 只做 metadata 读/写。

### D2 名册：宿主 session metadata 作可丢弃索引

**D2.1 真相源切分（写死，三方不得混淆）**

| 数据 | 位置 | 角色 | 权威性 |
|---|---|---|---|
| 后端身份 + 目标 + **槽位状态** | `pair.json`（每工程仓） | **resume ACL 唯一判据** + 目标一致性校验 + **单槽占用判定**（D6） | 权威 |
| 历史事实 | `ledger.jsonl`（每工程仓） | 做过什么 | 权威、append-only |
| 名册索引 | **宿主 session metadata** | 枚举 + 展示态 | **可丢弃索引，丢了可重建，不是真相源** |

**为什么不用治理面全局 roster 文件**：会成为第三份真相源（ADR-front-knowledge-capability D5 已红线），并发写需锁、跨项目可见性违背权限面、**会悬挂**。metadata 索引三个优势：随 session 删除自动消失（探针 P8：remove 后 404，**不悬挂**）、无新增文件、无新增锁。

**D2.2 dispatch 时必须落 ledger `dispatched` 行**：这是「从未派发」与「派发后消失」可区分的**唯一支点**。没有它，D5 的 unknown 兜底是盲的。append-only 账本把「派发」本身也变成事实。ledger schema 需新增 `dispatched` 态（与 `ADR-front-knowledge-capability` D5 的行产生时机表有单点耦合，须同步）。

**D2.3 索引内容**：后端 session 的 metadata 写 `{delegated_by:"front-delegate", front_session_id, goal_key, canonical_root, work_root, project_dir, baseline_message_id, dispatched_at, state}`。**metadata update 是整体替换语义**（探针 Q5），插件每次写必须回传完整对象。

**`work_root` 为什么必须在索引里**：`canonical_root`（= stateRoot）在 linked worktree 场景下是**主仓**，同一主仓的多个 worktree 共享同一值 ⇒ 无法区分「A 在 wt1、B 在 wt2」；而槽位键、名册分组、切换选择都按**工作树**分。⇒ `work_root`（取自 `ADR-canonical-root-normalization` D1）必须显式落在索引与 pair 条目里。

**`state` 的取值域**：以 **D6.3 的状态枚举表**为准（`dispatching` / `active` / `idle` / `suspended` / `tombstone`）。**`state` 是登记态**（持久化在 pair.json），与 D4 的**观测态**（`time.busy` 推导的 running/stalled）是两回事——前者回答「谁占着槽」，后者回答「谁在跑」。 **存量条目的一次性回填（数据迁移）**：无 `work_root`/`state` 的存量条目在首次观测时按 **`work_root = canonical_root`**（退化为原粒度，不误判为同树）+ **`state` 按活体判据**（busy ⇒ `active`，否则 `idle`）回填。⚠️ **不得一律默认 `idle`**——那等于给存量后端放行第二个写入者。

**D2.4 检索入口**：`sessions` 工具 list 后按 metadata 过滤。两条路径并存：
- **快路径**：front 自身 session 的 metadata 维护 roster 数组（`{roster:[backend_id,...]}`）。探针 R6 实测**可行**且**经 host 活动后不覆盖** → 查询 O(1)、不占 title、不用扫全库。
- **兜底路径**：**全库 list + cursor 续扫**，按 `metadata.delegated_by === "front-delegate"` 过滤。用于 front 换代后重建名册（roster 随 front session 一起消失）。

**兜底路径的三条硬约束（探针 P2c / P7 背书，不可省略）**：
1. **必须 cursor 续扫到全量**，不能只扫一页。list 按 **`time_updated` 降序**、默认 limit=50 ⇒ **长期 idle 的后端会沉出窗口**。兜底路径必须循环 `cursor.next` 直到扫完或找齐。
2. **不能用 `directory` 过滤做重建**——重建要发现的恰恰是"有哪些目录"，用 `directory` 过滤等于要求事先知道答案。
3. **`search` 只能作可选优化**：它按 title LIKE 收窄，需**固定 title 前缀标记**（如 `[fd]`），代价是 title 噪声 + 与 metadata 两套标记要一致 ⇒ 若采用必须由插件单一写点保证，并在 D2.3 的 schema 里定义该前缀。

**front session 身份漂移**：roster 挂在 front session 上，front session 被重建后 id 变化 → 旧后端失联。故 roster **只能是快路径不是唯一路径**，兜底路径必须常在（front 换代后仍能通过 metadata 找回后端）。

### D3 一 session 一目标（守护「上下文干净」）

**goal 判等只看结构化 key，不看自然语言**：

```
goal_key = { repo: canonical_root, intent: <kebab-slug> }
```

自由文本的 goal 描述另存（供人读），**不参与判等**。理由：front 每次复述措辞会变，对自然语言做规范化或相似度比对都是魔法数字重灾区；slug 由 front 在**首次派发时确定**并随 brief 传入，续接时 front 复用同一 slug ⇒ 判等面收敛到「同一目标换了 slug」，而那本来就该视为新目标。

**resume 时校验 goal_key 一致**：不一致 ⇒ **拒绝续接、要求新 session**（不是警告，是硬拒）。这不只是设计洁癖——**宿主机制层面**：steer 会注入当前轮并改写它，把新简报灌进正在执行的 run 就是上下文污染（探针 P6 实测）。

**`goal_key.repo` 保持 `canonical_root`，但检索/调度键用 `work_root`**：判等回答「是不是同一个目标」——同一项目的不同工作树仍是同一项目，故 `repo` 取 stateRoot；而「后端住在哪个工作树、该槽被谁占着」是**调度问题** ⇒ 用 `work_root`。两者不可混（把 `work_root` 塞进 `goal_key.repo` 会让「同一目标换 worktree 续接」被误判为不同目标）。**与救援路径不冲突**：「原地补 grant 续跑」（ADR-front-agent-redesign D5.1）本就是同一目标的延续。 **判等的方向性（必须写明，否则防线范围会被高估）**：goal_key 校验是**单向硬强制**——
- ✅ **换 slug 续接 ⇒ 机制拒绝**（这是硬强制点）。
- ❌ **同 slug 异目标 ⇒ 机制无法识别**（front 复用 slug 时校验通过，该方向退化为 prompt 纪律，见风险章）。**取舍理由**：自然语言判等是魔法数字重灾区，而「front 复用 slug」是**可审计**的错误（ledger 里能看到同一 slug 出现在不同 goal 描述上），比「误判为不同目标」（该续接的被拒、用户被迫重跑）危害小。

### D4 状态判定：running 判据用 `time.busy`

**判据**（探针 R4 实测，v2.2.5 的 `Session.Info.time` 有 `busy` 字段）：

```
running  ⟺  time.busy 存在  ∧  (time.idle 未定义 ∨ time.busy > time.idle)
```

- **`outcome` 不可用于判活**：run 未结束时该字段**整个不存在**（探针 Q2），「未开始 / 进行中 / 僵尸」三义。
- `stalled` 是**查询时推导态、不落盘**；判据为「running 且距上次活动超过阈值」。

**方向性（不可互换）**：上面这条判据用于**展示**时**宁可报 running**；**停机方向**（D11.3）用它做**必要**条件、但**不充分**——停机的判据是「**判活为假**」，**且仅当基线在跑时**再要求终态落定的正面证据（基线本就没在跑 ⇒ 无附加要求，见 D11.3 的分支）。**第二级兜底**（**无 `busy` 但有未终结活动**：最后消息时间 > 最后 idle ⇒ **仍判 running**）是「判活为假」成立的前提之一（漏判 ⇒ 误放槽 ⇒ 并发写）。⚠️ 该兜底的前提是「`busy` 未定义或为 0」⇒ **`busy` 从不清空**造成的 stale-busy 形态（新一轮 execution 刚起、`Started` 尚未投影）**不被它覆盖**；而在 D11.3 的 **`running0 = false` 分支下也不要求水位线前移** ⇒ 该形态**不被兜住**（已登记为残留风险，见「后果 / 代价」的风险条目）。

**保守规则**：`busy` 在 run 刚起的一小段时间内**仍为 null**（探针 R4 的 t0 时刻）⇒ 判据必须容忍"busy 未定义但有未终结活动"，**宁可报 running 不报完成、宁可报 unknown 不报 verified**。

### D5 聚合语义：整体 = 最差的那个，且永远列明细

- 任一后端 `unverified` / `unknown` / `stalled` ⇒ **不得声称整体完成**（与 `ADR-delegate-delivery-evidence` 的 `unverified` 同构）。
- 任一后端 running ⇒ 整体"进行中"，且**不进入 worst-of 计算**（worst-of 只对已终结后端）。
- 全部 `unverified` ⇒ "无可验证交付"（**不是**"没有产出"——产物可能落在 git 视野外）。
- **headline 之外永远列明细**：`1 running + 1 unverified` 若只显示"进行中"会让用户误以为一切正常；headline 应为「进行中（含 1 项交付存疑）」或放弃单一 headline。

### D6 槽位：键 = `workRoot` 与「常驻 / 活跃」分离

同一工作树上两个后端 session 并发写 = 共享工作树互踩（文件覆盖、git index 锁、`git status` 互相误读）。**事后检测兜不住工作树层的破坏**（它兜的是 git 层冲突）。

**D6.1 槽位键 = `workRoot`（本次改写的核心修正）**

| 键 | 粒度 | 后果 |
|---|---|---|
| `canonical_root`（stateRoot，原设计） | **每仓一个槽** | 同一仓的多个 worktree 被"同 repo 互斥"堵死 ⇒ **worktree 隔离能力等于没实现** |
| **`workRoot`（本次改写采用）** | **每工作树一个槽** | 同仓不同 worktree 可各占一槽；同工作树内一次一个 |

依据：`workRoot` = `abs(--show-toplevel)`，linked worktree 下**就是 worktree 自身路径**（`ADR-canonical-root-normalization` D1，已落地 `23584cd`）；两个 linked worktree 有**独立 git index 与独立工作树** ⇒ 写同一文件**互不覆盖**（实测），git **禁止两个 worktree checkout 同一分支** ⇒ ref 锁争用被上游兜住大半（残留：detached HEAD / 手动 `update-ref`，是**可检测的失败**）。

**D6.2 单槽：常驻与活跃分离**

同一工作树内可**常驻多个**后端 session（各自独立上下文），但**同一时刻只有一个占据槽位**。派发/恢复 = **申请槽位**；槽位被占 ⇒ **拒绝并说明**（不排队、不静默并发）。⚠️ 拒绝只针对「reconcile 之后仍然活跃」的槽位（D7.1），否则**正常跑完但无人观测**的后端会永久占死该工作树。

**D6.3 状态枚举与状态机**

| `state` | 含义 | 占槽 | 可 resume | 主要转移 |
|---|---|---|---|---|
| `dispatching` | 简报已投递、**尚未确认消费** | ✅ | ❌（只可 cancel） | → `active`（确认消费，D7.2）/ → `tombstone`（cancel） |
| `active` | 简报已确认消费；本轮在跑或已完成待观测 | ✅ | ✅ | → `idle`（本轮结束，D7.1）/ → `suspended`（suspend）/ → `tombstone`（cancel） |
| `idle` | 已登记，未占槽 | ❌ | ✅ | → `active`（dispatch/resume 申请槽位） |
| `suspended` | 被暂停，保留上下文 | ❌ | ✅ | → `active`（dispatch/resume 申请槽位） |
| `tombstone` | 被终止 | ❌ | ❌ | **终态，无出边** |

**D6.4 worktree 隔离仍后置（但前置已就位）**

每后端一个 git worktree 的**自动创建**仍不在本篇：`ctx.worktree.create` 需 `projectID` 而插件拿不到 ⇒ 需插件自建 `git worktree add`，生命周期与**清理策略**全归插件（**不配即定时炸弹**）。本次改写后「worktree 隔离」的**前置条件已满足**（键已是工作树粒度，将来无需再改键）；**代价**：目录仍需 front/用户**显式准备**——本篇不代管 worktree 生命周期 ⇒ **prompt 契约必须写明**「同仓并行需先准备独立工作树」。

### D7 槽位生命周期：翻转执行者、消费确认与回收

**D7.1 `active → idle` 的翻转执行者（不可省略）**

| 场景 | 执行者 | 判据 |
|---|---|---|
| 既有同步 `delegate` | delegate 自身 | `wait` 返回即本轮结束 ⇒ 落盘时同写 `state:"idle"`（无歧义） |
| `dispatch` 派发的后端 | **下一次派发/恢复时 reconcile**（reconcile-on-read） | **仅适用于 `state=active`** 的条目：活体判据（D4）显示已空闲 ⇒ 翻转为 `idle` 并放行。**`dispatching` 条目一律不翻转**（其简报可能仍 pending，放行即幽灵注入） |
| `suspend` | suspend 自身 | 确认停机后翻转为 `suspended` |

⇒ **槽位不会被"跑完但无人观测"永久占死**：每次派发先 reconcile 一次。 **锁的形态（不可省略）**：`withLock` 是**同步** `() => void`（`lib/delegate-core.ts:370`，10s 硬 deadline）⇒ **锁内不能 await**。故所有翻转一律走「**锁外查询 → 锁内重验登记态 → 锁内翻转**」：活体查询（`session.get`）与 `interrupt` 等**异步动作在锁外**完成，进入锁后**重验条目仍是预期的那一个**再改状态。锁内只做**同步读改写**（沿用 `ADR-front-agent-redesign` D6 的锁协议，不修订它）。

**D7.2 「投递 ≠ 消费」——必须确认消费（本次改写的第二处修正）**

上游 drain 的顺序是 `nextPromotable`（**peek，不消费**）→ `plugins.awaitActivation`（**可无限阻塞**）→ `prepareContext` → `promote`（**真正消费**，`packages/core/src/session/runner/llm.ts:70,75,186-192`）；而 `interrupt({resume:false})` **不删除任何 pending 行**（`packages/core/src/session/execution.ts:151-154`）。

⇒ **投递（prompt 返回）≠ 消费（promote）**，两者之间有可被阻塞的窗口。若在窗口内 suspend，被杀的是 drain，**简报行仍 pending** ⇒ 之后 resume 时 `nextPromotable` 按 `enqueued_seq` 取**最旧 queued**（`packages/core/src/session/inbox.ts:478-486`）⇒ **旧简报抢先整轮执行** = 幽灵注入。

⇒ **修正**：`dispatch` 返回前必须**确认简报已被消费**（判据见 Phase 0 报告与 Verification），确认后才置 `active`；未确认 ⇒ 停在 `dispatching`，该后端**只可 cancel**（墓碑），**不可 suspend 保留**。⚠️ **消费确认 ≠ 任务完成**：前者只等"简报已被 promote"（D1 表的"不等任务完成"指后者），两者是不同的等待对象。 ⚠️ **降级路径（必须写死）**：若实施期实测证明**无法可靠观测"已消费"** ⇒ `suspend` 的安全锚消失 ⇒ **本篇退回「单槽但不可切换」方案**（见选项对比表）。

**投递失败 / 结果未知的槽位处置**：`dispatch` 的 execute 超时/异常 ⇒ 服务端可能已受理 ⇒ **保留槽位**（保守侧：防止未确认死亡的后端与新派发并发写），返回「投递结果未知，请 `sessions` 确认」。**不得静默放槽**。⚠️ **该路径不经 reconcile**：`dispatching` 条目的简报**可能仍 pending**（正是上面的窗口），reconcile 放行它 = 旧简报抢先跑 ⇒ 投递失败的唯一恢复路径是 **`cancel`（墓碑）后重派**；`dispatching` 条目在 `cancel` 之前**永久占槽**（有意的保守，见 D6.2）。

**D7.3 槽位回收与「亡主」接管**

后端崩溃、被外部删除、或 `interrupt` 未真正停机 ⇒ 登记态 `active` 但实际不 busy ⇒ 槽被占死。

- **回收**：每次派发的 reconcile（D7.1）把「已空闲的 `active`」翻回 `idle` ⇒ **不需要单独的回收动作**；`dispatching` 条目**不在回收范围**（见上）；`stalled` 是**展示层信号**（报「槽位疑似悬挂」），不承担回收职责。
- **强制接管**：若 `interrupt` 无法停机（D11 的停机确认失败），槽保持 `active` 且**不得静默放掉**；只能由 front **`cancel` 旧条目（墓碑）→ `dispatch` 新后端接管**两步完成，旧条目置 `tombstone`——**必须被报告，不能静默等待**。
- **亡主接管（front 换代）**：`suspend` 的 ACL 以**登记 front 存活**为软信号（沿用既有 `resumedByOtherFront` 先例）。条目的 `front_session_id` 对应 session 已不存在 ⇒ 视为无主 ⇒ 允许本 front `suspend` 回收；**不允许**静默 dispatch 顶掉。接管须落 ledger 行。

**D7.4 互斥检查必须原子 + 两个派发面共用一张槽位表**

- **原子**：check-then-act 跨两次锁会双双通过 ⇒ 检查与登记在**同一次 `withLock` 临界区**内完成（**锁内只做同步读改写**；锁外取到的活体数据必须在锁内**重验登记态**后才可采信 —— 见 D7.1 的「锁的形态」）。
- **覆盖面**：`delegate`（既有同步）与 `dispatch`（新异步）**共用**同一张槽位表 ⇒ 否则 front 用 `delegate` 派活会与 `dispatch` 的活跃后端并发写同一工作树。⚠️ **本次改写对既有路径的全部变更面**（既有 `delegate` 的**语义与既有判据全部不变**，但下列三处必须显式实现与显式测试）：① **新增一条槽位检查**（同工作树已有活跃后端时拒绝派发）；② `delegate` 返回时同写 `state:"idle"`（D7.1 第 1 行）；③ `delegate` 建的 pair 条目同样落 `work_root` / `state`。

### D8 「无 parked 简报」的保证与范围假设

**D8.1 构造性保证（在 D7.2 的消费确认之外仍然成立的部分）**

`suspend` 可续还依赖两条：

1. **只向空闲 session 投递**：目标 session 在跑 ⇒ 拒绝（既有 busy 判据，`outcome:"busy"`）；
2. **同一工作树一次只投递一次**：单槽保证不会对同一工作树二次投递 ⇒ 不会把第二份简报排在第一份后面。

**D8.2 scope 前缀重叠检测：本篇不做**——单槽把同工作树的并发写构造性排除（D6.2），跨工作树的同名 scope 物理上不重叠 ⇒ 该检测**无可达的保护场景**，保留即死代码。**决定：删除该要求**。

**D8.3 范围假设（构造性保证的成立前提）**

保证仅在「**后端 session 只经本插件四工具被操作**」时成立。⚠️ **该假设只排除「用户/外部不经插件的操作」这一类**；**插件自身四工具之间的并发不在它的覆盖范围内**（可达路径与后果见 D11.3 的原子性缺口段与「后果 / 代价」的风险条目）。用户在 TUI 里直接对后端 session 打字/追加指令 ⇒ 产生**插件不可见的 pending steer**（`interrupt` 不删 steer 行；`nextPromotable` 先提 steer，`inbox.ts:475-476`）⇒ 恢复时可能被注入陈旧指令。⇒ **显式声明为超出范围**；唯一防线是 D9 的「事后报存疑」（**不能保证检出**）。

### D9 终止 vs 暂停：`cancel` 墓碑 / `suspend` 可续

两个动作的语义边界：

| 动作 | 语义 | 上游调用 | 可否 resume | 何时用 |
|---|---|---|---|---|
| `suspend` | **暂停**：让出槽位，保留上下文 | `interrupt({resume:false})` | ✅ 可（前提：简报已确认消费） | 切换到别的后端，稍后回来继续 |
| `cancel` | **终止**：让出槽位，放弃该目标 | `interrupt({resume:false})` | ❌ 墓碑 | 目标作废（不再需要它） |

两者上游调用相同，差别**只在插件侧的登记态**（`suspended` vs `tombstone`）——插件不依赖上游清理行为，自己决定后端还能不能续。

**为什么 `cancel` 要墓碑、`suspend` 不要**：墓碑防的是"parked 旧简报在未来某次 resume 时幽灵注入"。D7.2 的消费确认让 dispatch 路径不产生 parked 项 ⇒ `suspend` 恢复时不会有旧简报抢先跑，故无需墓碑；而 `cancel` 的语义是"目标作废"，**主动杀死**比留着一个可能带陈旧上下文的 session 更安全 ⇒ 保留墓碑。 **残留风险（如实记录）：steer 残留**。上游 `interrupt({resume:false})` **不删除** pending steer 行（`packages/core/src/session/execution.ts:151-170`：仅 `resume:true` 才走 `nextPromotable` 提升路径），而 `nextPromotable` **优先提升 steer**。⇒ 被 `suspend` 的 session 若在运行期间被注入过 steer，恢复后的第一轮**优先被提升并注入当前轮**。

- **可观测性待锚定**：`delivery` 只存在于 **inbox 表**（`packages/core/src/session/sql.ts:142`），**消息表没有该列**（`promotedFromMessage` 只是从 inbox 行回填 delivery，`packages/core/src/session/inbox.ts:125-142`）⇒ `session.context()` **大概率拿不到** `delivery` ⇒ **steer 残留很可能不可检测**。本篇**不假定**，列为**实施期必须锚定的上游语义**。
- **缓解（保守侧）**：`suspend` 记录暂停时刻的 `baseline_message_id`；恢复后若首批消息中出现**暂停之前**的内容 ⇒ 报「该后端上下文可能含陈旧指令，建议新建」——与 `ADR-delegate-delivery-evidence` 的 `unverified` 语义同构（宁可报存疑，不报成功）。**若锚定结果证明不可观测 ⇒ 该缓解降级为"如实报不可检出"，不得用"看起来没问题"冒充通过。**

**插件 ctx 无 inbox API 仍然成立**（`packages/plugin/src/promise/adapter.ts:622-645` 的方法全集里没有 inbox）⇒ 「无 parked 项」只能靠 D7.2 + D8.1 的**构造**，**不能靠运行时检查**。

### D10 成本与并发上限

同时在跑的后端数设**全局**上限（`RDDF_MAX_ACTIVE_BACKENDS`，默认 3）；**超限 fail-fast 拒绝、不排队**（排队需持久队列，超出本篇范围）。`Session.Info` 带 `cost`/`tokens` ⇒ 每后端成本可观测（探针 Q7）。**单槽是每工作树的上限，与全局上限叠加** ⇒ 实际并发度 = min(活跃工作树数, 全局上限)；`kind=knowledge` 不占工作树槽位。

### D11 槽位切换的两步编排

**D11.1 切换 = 两步，由 front 编排**

「切换活跃后端」= `suspend(当前活跃)` → `dispatch/resume(目标后端)`。

**不做成一个原子工具**：跨两个 session 的两步（interrupt A + prompt B）**无法与上游投递原子化**（投递异步、不可回滚）；合成一个工具会产生「A 已停、B 未起」的半成功态，而该态在单槽模型下**本就合法**（A=suspended、B=idle）⇒ 两步各自原子 + front 编排，与状态机一致。

**D11.2 原子性要求**：每一步内部的状态翻转（占槽 / 释放槽）都在**同一次 `withLock` 临界区**内完成（同 D7.4），且遵循 D7.1 的「锁的形态」：**异步动作在锁外，锁内重验后再翻转**。两步之间允许存在中间态。

**D11.3 只有确认停机才释放槽位**

`suspend` 必须在**确认目标 session 已停机**后才释放槽位并标记 `suspended`。**「已停机」的判据 = 终态落定，不是 `interrupt` 的返回值，也不是「看起来不忙」。**

**为什么 `interrupt` 的返回值不能用**（上游 `run-coordinator.ts:142-162`）：`true` 只表示**已接受**中断——清理**异步 settle**（`execution.ts:27-31`：「Resolves once the interruption is accepted; **cleanup settles asynchronously**」）⇒ 它**可能还在跑**；`false` 有**三种**成因：① 本来就没有活跃执行；② **已在停机过程中**（前一次 interrupt 已接受、清理在途 ⇒ **仍在跑**）；③ **settle 窗口**（fiber 已退出、终态尚未落定 ⇒ **未停机**）。**两者都不能当停机判据。**

**判据 = 终态落定**：`time.idle` 是**运行期唯一写入点**的**严格单调**水位线（`projector.ts:527`：`max(time, coalesce(time_idle+1, time))`；另一处写入是 `transfer.ts:164` 的 session 导入/转移，**不在 suspend 路径上**），且**只在** `Execution.Succeeded/Failed/Interrupted` 投影时前移（`:798-800`）⇒ **水位线前移 ⇔ 该 execution 的 fiber 已跑完 finalizer、终态已发布 ⇒ 它不会还在写**。

⇒ 停机确认 = 先在 `interrupt` **前**取一次快照（`v0 = time.idle`、判活结论 `running0`，判活口径见 D4），再**有界等待**到「**判活为假**」且满足下列**分支**要求：**`running0 = true`（本次要中断一个在跑的 execution）⇒ 水位线必须前移**（`time.idle > v0`）——只有终态投影能前移它，这就是「已收尾」的**正面证据**（仅「不忙」不够：fiber 已退、finalizer 仍在跑时同样「不忙」）；**`running0 = false`（本来就没有活跃执行）⇒ 无附加要求**——没有 execution 可等，`v0` 不会前移，**不得**因水位线不动而判超时（否则最常见的「挂起一个空闲后端」必然失败）。**超时仍未满足 ⇒ 不得释放槽位**，保持 `active` 并报错。

⚠️ **「看起来不忙」（D4 判据的取反）不能单独当停机判据**：它有两个**假停机窗口**——① `time.busy` 未投影窗口（`Execution.Started` 尚未投影）；② `time.busy` 从不清空（只在下次 `Started` 时被覆盖）⇒ 「新一轮 execution 刚起」同样读作「不忙」。⚠️ 窗口①的两种子形态要分开看：**从未空闲过**的 session 读到 `busy = null`（实测 t0 时刻）；**曾空闲过**的 session 读到的是**陈旧 busy**（`< idle`）⇒ 两级判活**都不成立**。⇒ D4 的**第二级兜底**只覆盖「busy 未定义/为 0」的形态（它的前提就是 `busy = 0`）⇒ **陈旧 busy 形态不被兜住**，且在 `running0 = false` 分支下水位线要求也不生效 ⇒ 该形态是**残留风险**（见「后果 / 代价」的风险条目）。

⚠️ **判不出来（读失败 / 原因不明）⇒ 保守当作「未停机」**：不释放槽位、保持 `active` 并报错（与 D7.2、D2.3 的保守侧同源）。**session 已不存在 ⇒ 视为已停机**（没有东西可写，见 D12）。⚠️ **有界**是硬要求：停机确认是 `suspend` 的 execute（**在 front 回合内被 await 的工具调用**）里的**等待**，无界等待会把 front 的回合钉死（与 D1.1 的硬超时同源）；**窗口下限必须 > 0**（「查一次」已被 E2E 证伪），取值应由上游 settle 延迟的实测分布决定（本篇不写死）。

⚠️ **原子性缺口（显式声明）**：「确认停机」→「释放槽位」之间可能有**新一轮 execution 启动**（上游 interrupt 会认领已记录的 wake，但**清理期间到达的新 wake 会在 settle 时启动后继 execution**，`run-coordinator.ts:154-156`）⇒ 轮询**关不掉**此缺口。⚠️ **D8.3 的范围假设兜不住它**：那条假设只排除「用户/外部不经插件的操作」，而**插件自己的四工具就能制造这个 wake**——`dispatch(resume=X)` 会给 X 投递简报并 rung 上游 doorbell（上游 `session.ts:187`：`input.resume !== false` ⇒ `wake`；插件调用点**不传** `resume:false`），而 `claimSlot` 把 resume 目标**排除**在活体判定之外 ⇒ 同一回合 `dispatch(resume=X)` 与 `suspend(X)` 并发时，清理期间到达的 wake 会在 settle 时起一个**后继 execution**（上游 `run-coordinator.ts:109-114`）⇒ 可能**假停机**（水位线已前移、判活为假）⇒ 释放槽位后后端随即开始写同一工作树 ⇒ **两个写入者**。⇒ 该可达路径**不在本篇的保证内**，作为**显式残留风险**登记在「后果 / 代价」的风险章（根治需给异步 `dispatch` 的 resume 目标补活体守卫，**属另立 change**）。**单 front 顺序路径**（先 `suspend(X)` 确认停机、再 `dispatch(resume=X)`）不受影响。

**为什么不用上游的 `ctx.session.wait`（备选与取舍）**：上游提供了权威的 settle 原语 `session.wait` = `get` + `execution.awaitIdle`（`session.ts:278-281`），而 `awaitIdle` 在 settle **之后会重查一次**（上游注释原文：「re-check after it settles to cover a successor execution started by a late doorbell」，`run-coordinator.ts:164-170`）⇒ 它**天然覆盖**上面那条「清理期间到达的新 wake ⇒ 后继 execution」的缺口，且它同时满足本篇的两个分支（空闲 ⇒ 立即返回；在跑 ⇒ 等到终态落定）。它**插件可见**（`adapter.ts:641`），本仓的既有同步 `delegate` 就在用它（`lib/delegate-core.ts:1091`，配超时竞速）。**本篇仍不用它**，理由两条：① **跨 server 实例不可靠**——`awaitIdle` 只看**本进程内**的 execution 表（`run-coordinator` 的 `executions` 是进程内 Map），后端若跑在**另一个实例**上，该表查不到 ⇒ 立即返回 ⇒ 不能作为停机判据；而水位线 `time.idle` 是 DB 级、跨实例可见。② **run 中途被 interrupt 时的返回语义未实测**（探针缺口：`.rddf/reviews/front-multi-backend-probes.md`「`ctx.session.wait()` 在 run 中途被 interrupt 时的返回语义未测」）⇒ 实测前不能把它写进判据。⇒ 「改用 `session.wait`」登记为**待实测的备选**（需先补上述实测）；本篇保留水位线判据。

⚠️ **该选择已被部分取代**：后续探针已补齐上述两项实测（单实例 `wait` 覆盖后继实测 2921ms；跨实例 `wait` 3ms 返回 = 不可靠）⇒ 判据改为「`wait` + 判活 + 水位线」合取，见 **`ADR-front-stop-confirmation`**（本篇 **D11.3 的分支结构与有界要求继续有效**）。

**「停机确认」是释放槽位的前置**：单槽的价值建立在"同一工作树同时只有一个写入者"上；放掉一个仍在写的槽 = 立刻并发写。停机确认在**锁外**完成，锁内**重验该条目仍是 `active`** 才翻转为 `suspended`。

**D11.4 语义约束**

- `suspend` 的目标必须是**已登记在本 front 名下**的后端（pair ACL，无主例外见 D7.3）⇒ 不引入新的越权面；
- `suspend` **不删除** session（默认不 remove，与 `cancel` 一致）⇒ 上下文保留，可 resume；
- `suspend` 一个**已墓碑**的后端 ⇒ **拒绝**（墓碑是终态）；
- `suspend` 一个**`dispatching`（未确认消费）的后端** ⇒ **拒绝**（只可 cancel，见 D7.2）；
- `suspend` 一个**当前无活跃执行**的后端 ⇒ 幂等 no-op（⚠️ 仍须按 D11.3 做停机确认，不以 `interrupt` 返回值为准）。

### D12 已删后端的可见性（能力边界）与后续触碰处置

**结论**：`sessions` **不列**已删后端，观测面**不补记**终态行；但**派发面**一旦拿到「该 session 不存在」的**正面证据**，**必须**处置——否则会留下死条目把整个工作树占死。 **为什么可见性做不到**（2026-11-09 实证）：`ctx.session.list()` 不返回已删 session，**插件 ctx 只能枚举「仍有存活 session」的 repo**（item 带 `location`/`projectID`，但已删项根本不出现）⇒ 目标场景（被删后端是该 repo **唯一** session）**恰在盲区正中**。四条替代做法的取舍见选项对比表。 **后续触碰处置（必须做，否则死槽）**：派发面从上游拿到 404 / not-found（**正面证据**，不是「看不到」）时，按**唯一矩阵**处置（消除二义）：

| 条目 `state` × session 已删 | `dispatch(resume=X)` | `suspend` | `cancel` |
|---|---|---|---|
| `dispatching` / `active` | 旧条目置 `tombstone` + 落 `outcome:"vanished"` 终态行 + 按同一 `goal_key` **新建**续接 | **释放槽位** + 置 `suspended` | 置 `tombstone` + 落 `outcome:"vanished"` 终态行 |
| `idle` / `suspended` | 同上（置墓碑后新建） | 幂等 no-op（本就不占槽） | 置 `tombstone` + 落 `outcome:"vanished"` 终态行 |
| `tombstone` | 拒绝（终态不可续接） | 拒绝（终态） | 幂等 no-op |

⚠️ **本矩阵取代 D9 / V36–V39 中「`interrupted:false` ⇒ 纯 no-op、不墓碑」的一半适用范围**：那条规则针对 **session 仍存在但不在跑**（可续接）；**已不存在时没有「可续接的上下文」**，故按终态处置——界线是**「不在跑」vs「已不存在」**，不是"是否回 `interrupted:true`"。⚠️ 新建 session 失败（`create` 抛错）⇒ 视同 dispatch 新建失败：**不占槽**（旧条目已 `tombstone`），`outcome:"vanished"` 行已落。

⇒ 与「观测面不补记」不矛盾：观测面是**被动不可见**，派发面是**主动拿到否定证据**。 **痕迹与读侧语义**：该 repo 的 `ledger.jsonl` 里 `event:"dispatched"` 行仍在；`pair.json` 条目仍在，但 **reconcile 会把「已消失的 `active`」静默翻成 `idle`** ⇒ 翻转后 pair 不再携带「消失」证据，**区分点只剩 ledger 那条 `dispatched`**。**读侧语义**：`sessions` 未在册 = **未观测到存活后端**，≠「从未派发」、≠「没有终态」、≠「一定被删」（**索引写丢是第三种可能**——metadata 写失败被静默吞，见 D2.1「可丢弃索引」）。

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **四工具（dispatch/sessions/suspend/cancel）+ metadata 索引 + 每工作树单槽（本次改写采用）** | 采用 | 派发与观测分离是**唯一**能避免"查询即污染"的形态（`delegate` 每次调用都投递简报，resume 分支也一样）；metadata 索引随 session 删除自动消失，无悬挂、无新增锁、无第三份真相源；action 细分让治理面可单独禁取消；**单槽 + 可切换**同时满足"同工作树不并发写"与"多目标常驻可轮转" |
| **扫各 repo 的 `pair.json` 以发现已删后端** | 否决 | 枚举 repo 本身依赖「该 repo 仍有存活 session」⇒ 对目标场景（被删后端是该 repo 唯一 session）**恒盲**，正是不解决要解决的问题 |
| 由调用方（front）传入 repo 列表 | 否决 | front 是对话代理不是台账，未必知道；且把契约复杂度推给调用方 |
| **订阅 `session.deleted` 在删除时刻写侧补记** | 否决（部分可行） | 插件 `ctx.event` 确实可达全局 bus，但：事件**不带 `location`**（需自建 sessionID→repo 映射，冷启动即丢）；依赖插件存活与 location 激活，而「front 不在跑时用户在 TUI 删后端」恰是**主流场景**；跨 server 实例删**是否送达未探针**（按不送达假设处理）；且**解决不了 `sessions` 的可见性**（metadata 已随删消失） |
| **槽位键 = `canonical_root`（stateRoot，原设计）** | 否决 | 每仓一个槽 ⇒ 同一仓的多个 worktree 被"同 repo 互斥"堵死 ⇒ worktree 隔离能力等于没实现；且 `ADR-canonical-root-normalization` 已交付的 `workRoot` 沦为闲置 |
| **单槽但**不可**切换（cancel 一律墓碑）** | 否决 | 切走即丢上下文 ⇒ 与「一 session 一目标、上下文各自干净」的前提直接冲突；常驻的后端变成一次性资源。⚠️ **但这是 D7.2 的降级落点**：若实施期实测证明**无法可靠观测"简报已消费"**，`suspend` 的安全锚消失 ⇒ **退回本方案**（此时只保留单槽，不提供切换） |
| **`cancel` 加 `mode` 参数（suspend/terminate 二选一）** | 否决 | **默认值不可逆**：漏写 `mode` 落到 `terminate` 会永久杀死本该续接的后端；而独立工具名 `suspend` 漏用时的默认后果是"用错工具"（可恢复）。同 D1 反对 `async` 参数的同类理由 |
| **单槽 + 切换，但由插件自建 worktree（一步到位）** | 否决（后置） | 插件 ctx 拿不到目标仓 project id ⇒ 需自建 `git worktree add`，**生命周期与清理策略全归插件**；不做清理策略即定时炸弹。⇒ 本篇只把槽位键放到工作树粒度，**目录由 front/用户显式准备** |
| 给 `delegate` 加 `async` 参数 | 否决 | 静默开关：忘写即静默退化为 30min 阻塞，多后端场景其余后端全部饿死且**无报错信号**。拆工具的误用形态是"汇报过早"（可见的体验问题），两者的**失败可检测性**完全不同 |
| 治理面全局 roster 文件（front-roster.json） | 否决 | 第三份真相源（ADR-front-knowledge-capability D5 已红线）；并发写需锁、跨项目可见性违背权限面、**会悬挂**（后端删了条目还在）。metadata 索引三个优势全占 |
| 新增独立「编排」agent | 否决 | 需求主体是「查询回答」（用户问"后端怎么样了"），答案应在 front 直接可得；多一层委托 = 观测面递归 + 编排器自身状态持久化 + 调试链路 ×2。适合的是未来「自动重试/监控/日报」类自主行为（另一个 ADR 的候选） |
| 纯 prompt 层让 front 记住自己派过谁 | 否决 | 会话中断即失忆、上下文窗口有限、无审计证据；与 ADR-front-knowledge-capability 刚建立的 ledger 记忆层方向直接矛盾 |
| 用上游 `session.list` + metadata，但**不**写 pair.json 的 goal | 否决 | metadata 随 session 删除即消失（探针 P8），resume ACL 失去判据；且把可丢弃索引升级成真相源，违背 D2.1 的切分 |
| 每后端一个 worktree + 现状 delegate 不改 | 否决 | 同步阻塞不解决，worktree 只是给串行排队准备了更多座位；核心矛盾（front 被 wait 钉死、无法并发观测）原封不动 |
| 直接允许同仓并发，靠 scope 强制 + 事后检测兜底 | 否决 | 事后检测兜的是 git 层冲突，拦不住工作树层的文件覆盖与 index 锁争用 |
| **保留 scope 前缀重叠检测作为并发保护** | 否决（本次改写） | 单槽把同工作树的并发写**构造性排除** ⇒ 该检测无任何可达的保护场景，保留即死代码（proposal 的 AC27 已自陈此风险） |

## 后果 / 代价

**正面**

- front 的回合不再被后端钉死：派发即返回，N 个后端并发推进，用户随时能问进度。
- 「front 名下有哪些后端」有了**可枚举**的答案，且不新增持久状态文件。
- 上下文污染有了**强制点**：goal_key 不一致即拒续接，而不是靠 front 自觉。
- `time.busy` 提供了与 `outcome` 无关的活体判据，避免三义性误判。
- cancel 墓碑把"幽灵注入"这类未探明的上游行为从风险面里移除。
- **同一工作树内可以同时"养着"多个目标**：常驻后端各自保留上下文，切走再回来不丢进度（D7/D9）。
- **切换有了机制而非纪律**：暂停与终止语义分离，前端不必在「杀掉一个后端」与「让它继续跑」之间二选一。
- **workRoot 键让 worktree 隔离成为可能**：同一仓的多个工作树可各占一槽，`ADR-canonical-root-normalization` 交付的 `workRoot` 从闲置变为承重。
- **槽位不会悬挂**：reconcile-on-read（D7.1）把「跑完但无人观测」的槽自动翻回空闲 ⇒ 不需要额外的回收动作，也不会出现"改完任务却再也派不进去"。
- **亡主不砖死工作树**：front 换代后旧槽位可被接管（D7.3）⇒ 工作树不会因为换了个 front 就永久不可派发。

**负面 / 代价**

- **工具面从 1 个变 5 个**（`delegate` + `dispatch` + `sessions` + `suspend` + `cancel`）：front 的工具表变大，四分类路由变成要区分「派发 / 观测 / 暂停 / 终止」四种出口 ⇒ prompt 契约必须同步改，否则模型会拿错工具。
- **既有 `delegate` 出现一处行为变更**：新增槽位检查（D7.4）⇒ 同工作树已有活跃后端时，既有同步派发也会被拒。**既有判据全部保留**，但这是本次改写对既有路径的唯一行为影响，必须显式实现与显式测试。
- **dispatch 返回 ≠ 后端完成**：这是新增的失败形态——模型极易把"dispatch 成功"误报为"任务完成"。**必须在 `prompts/front.md` 写死**，属 prompt 层防线（不可靠，但比什么都不写强）。
- **终态可能永远不到**：front 不查询 ⇒ ledger 缺终态行。缓解是"开场即 reconcile"（见 D2.4）——front 新会话第一轮就要读状态（ADR-front-agent-redesign D7 已要求开场报状态），故 reconcile 与开场扫描天然合一；但用户不再问时，终态行仍可能缺失 ⇒ **ledger 的"未终结"记录必须被读侧理解为"未观测到终态"而非"没有终态"**。
- **metadata 整体替换语义**：每次写都要回传完整对象，漏字段即丢数据（探针 Q5）。新增 `work_root` / `state` 后字段更多 ⇒ 漏字段的后果更重。
- **front session 换代即失联**：roster 是快路径不是唯一路径，兜底路径必须常在。
- **已删后端不可枚举**（D12）：插件 ctx 无 `project` 域 ⇒ 无法枚举 repo ⇒ 后端被删后 `sessions` 看不到、也不补记终态行。这是**能力边界**，与 D2.1 的「索引随删除消失」一致；代价是读侧必须理解「`sessions` 里没有」≠「从未派发」。
- **同工作树并发被压制**：同一工作树一次只能一个后端在跑（D6.2）。这是**有意的保守**——工作树层的破坏不可事后兜底；想要并行就准备独立工作树（D6.4）。
- **切换是两步、由 front 编排**：两步之间存在中间态（A 已停、B 未起）。这在状态机里是合法态，但**模型可能只做一半** ⇒ prompt 契约必须写明「切换 = 先 suspend 再 dispatch/resume」。
- **槽位可能悬挂**：后端崩溃/被删 ⇒ 槽被占死，该工作树后续派发全被拒。缓解是 D7.3 的 `stalled` 判定 + `suspend` 幂等回收，但**发现与回收依赖 front 主动查询**。
- **dispatch 变慢**：必须等"简报已消费"才返回（D7.2）⇒ 派发不再是"入队即返回"，而是"入队 + 确认"。窗口内若上游 `awaitActivation` 阻塞，则 dispatch 要么等超时、要么报"投递结果未知"。**这是把正确性代价转成延迟**，用户可感知。
- **`dispatching` 是一个新的中间态**：未确认消费的后端**只可 cancel、不可 suspend 保留** ⇒ 派发后立刻想切换的用户会撞到拒绝（D7.2）。
- **范围假设被显式收窄**：构造性保证只在"后端只经本插件四工具被操作"时成立（D8.3）⇒ 用户在 TUI 里直接对后端打字/追加指令，插件无法察觉，也无法阻止。

**风险**

- **上游语义漂移**：`delivery` 默认值、`time.busy` 存在性、`session.list` 的过滤字段都是上游行为；上游改默认值（steer↔queue）会让 D1/D4 的语义**静默反转**。⇒ 必须把「dispatch 必须显式传 delivery」写成**代码级强制**（不依赖默认值），并在 opencode 升级回归清单里加这两条。
- **steer 残留（如实记录，且已可判定为「大概率不可检测」）**：`interrupt({resume:false})` 不删除 pending steer 行，而 `nextPromotable` **优先提升 steer** ⇒ 被暂停的后端恢复后可能被注入陈旧指令（D9）。上游 `delivery` 列只在 **inbox 表**上、**消息表没有**（`packages/core/src/session/sql.ts:142`；`promotedFromMessage` 只是从 inbox 行回填）⇒ `session.context()` **大概率拿不到** `delivery` ⇒ **缓解只能走「报存疑」侧**（`baseline_message_id` 比对），**不能保证检出**。
- **插件 ctx 无 `inbox` API**：队列内容不可直接观测（探针 R5 + 上游 `adapter.ts:622-645` 复核）⇒ 一切依赖"队列里有什么"的推断都不成立；D7.2 + D8.1 正是为此，**"无 parked 项"只能靠构造、不能靠检查**。
- **「已消费」可能不可观测 ⇒ 范围降级**：D7.2 的消费确认依赖"简报文本出现在 `session.context`"这类判据；若实测证明不可靠，**本篇退回「单槽但不可切换」**（只保留单槽，不提供 `suspend`）⇒ 用户要的"切换"能力消失。⇒ 该判据**必须在实施期最先锚定**（先实测，再决定 D7.2 是保留还是触发降级）。
- **工作树目录需显式准备**：本篇不代管 worktree 生命周期 ⇒ 同仓并行必须由 front/用户先 `git worktree add`；漏了这步的用户会得到"同仓只能串行"的结果。⇒ **prompt 契约必须写明**（D6.4）。
- **插件自身四工具并发可制造「清理期间的新 wake」（残留风险，不在本篇保证内）**：同一回合 `dispatch(resume=X)` 与 `suspend(X)` 并发 ⇒ `dispatch` 给 X 投递简报并 rung 上游 doorbell（上游 `session.ts:187`，插件不传 `resume:false`）⇒ 清理期间到达的 wake 在 settle 时起后继 execution（`run-coordinator.ts:109-114`）⇒ 可能**假停机**（水位线已前移、判活为假）⇒ 释放槽位后后端随即开始写同一工作树 ⇒ **两个写入者**（本篇存在的唯一理由被打破）。缓解：**单 front 顺序路径**（先 `suspend` 确认停机、再 `dispatch(resume)`）不受影响；根治候选有二：① 给异步 `dispatch` 的 resume 目标补**活体守卫**（**另立 change**）；② 改用上游 `ctx.session.wait`（能覆盖后继 execution，但跨 server 实例不可靠、且 interrupt 中的返回语义未实测 ⇒ 见 D11.3 的备选与取舍）。
- **「陈旧 busy」形态可假停机（残留风险，不在本篇保证内）**：session **曾空闲过**（`idle > 0`）而新一轮 execution 刚起、`Execution.Started` 尚未投影 ⇒ 读到的是**陈旧 busy**（`< idle`）⇒ D4 两级判活**都不成立**（第二级兜底的前提是 `busy = 0`）⇒ 又因 `running0 = false` 分支**不要求水位线前移** ⇒ 判停机并释放槽位，而后端可能随即开始写同一工作树 ⇒ **两个写入者**。缓解：窗口窄（需 `Started` 投影延迟 + 该 session 曾空闲过）；根治：同上一条的 ①/②（活体守卫 / `session.wait`），或在 `running0 = false` 分支补「曾空闲过 ⇒ 仍要求水位线前移」——⚠️ 但后者会让「挂起一个跑完过的空闲后端」**必然超时**（水位线不动）⇒ 不可单独采用。
- **双 front 并发管同一后端**：`pair.json` 的 front_session_id 只作**软信号**（ADR-front-agent-redesign D2 既有裁定），故两个 front 可同时 resume 同一后端 ⇒ 会排两份简报。⇒ **由既有的 per-session busy 判据 + 单槽表拦截**（同工作树已有活跃后端 ⇒ 拒绝），**不在 D3 的 goal_key 校验里拦**——goal_key 校验只回答"是不是同一个目标"，**同 goal_key 续接必须放行**（那是续接的定义，见 D3）。
- **同 slug 异目标无法机制识别**（D3 已写明方向性）：front 复用 slug 时防线退化为 prompt 纪律。缓解是**可审计**——ledger 里能看到同一 slug 出现在不同 goal 描述上，可事后发现。
- **成本放大**：N 个后端 = N 倍 token。虽有上限（D10），但上限值本身需要观察真实消耗后调整。
- **既有 `delegate` 与新 `dispatch` 并存**：两个派发面。缓解：prompt 明确「需要等结果 → delegate；并发多任务 → dispatch」，且**不**同时用两者管同一工程（**槽位表覆盖两者**，D7.4）。

## Verification（可勾选验收判据，前瞻）

**工具面与门控（D1）**

- [ ] **V01** `opencode debug agents` 中 front 可见 `dispatch`/`sessions`/`suspend`/`cancel` 四个工具；`delegate` 仍可见。
- [ ] **V02** 除 front 外任一 agent 调用 `dispatch`/`sessions`/`suspend`/`cancel` → **权限层**拒绝（非模型拒绝），且 `delegate` 仍不可见。
- [ ] **V03** `cancel` 的 action 可被单独 deny 而 `dispatch`/`sessions`/`suspend` 仍 allow（验证 action 细分生效）。
- [ ] **V04** `suspend` 的 action 可被单独 deny 而 `dispatch`/`sessions`/`cancel` 仍 allow（验证四工具的 action 相互独立）。
- [ ] **V05** `dispatch` 的 execute 在**宿主调用挂死**时**在超时上限内返回**（不无限等）；构造 `create`/`prompt`/`update` 永不 settle 的情形验证（**不是**"构造挂死的后端"——dispatch 不 wait 后端，后端挂死不会让 dispatch 挂住）。

**名册与索引（D2）**

- [ ] **V06** `dispatch` 后：后端 session 的 metadata 含 `delegated_by/goal_key/canonical_root/**work_root**/baseline_message_id/dispatched_at/state`；`pair.json` 有对应条目；`ledger.jsonl` 有 `dispatched` 行。
- [ ] **V07** `pair.json` 条目含 **`work_root`** 与 **`state`**（枚举见 D6.3：`dispatching/active/idle/suspended/tombstone`）；**存量条目**（无 `work_root`）按 `work_root = canonical_root` 保守回填（退化为原粒度，不误判为同树），且其 `state` 按**活体判据**首次观测时确定（busy ⇒ `active`，否则 `idle`）——**不得一律默认 `idle`**（那等于放行第二个写入者）。
- [ ] **V08** `sessions` 列出本 front 名下全部后端（≥2 个，分属不同工程目录），每项含状态与证据字段；**调用 `sessions` 前后，被观测后端的 `session.context` 消息条数与最后一条消息 id、以及 `time.updated` 均不变**（证明观测面不投递 prompt、不污染）。⚠️ **不以 ledger 行数不变为判据**——prompt 投递不会立即产生 ledger 行，行数不变证明不了没投递（**注意：reconcile 只写 `pair.json`、不写 ledger**，别拿 pair 的变化当 ledger 证据）。
- [ ] **V09** **已删后端的观测面与派发面分别判**（D12）：
  - **观测面**：后端被外部删除后，`sessions` 输出**不含**该项，且**调用 `sessions` 前后该 repo 的 `ledger.jsonl` 行数与末行内容均不变**（观测面不写 ledger）。⚠️ **不得**把「`sessions` 里没有」判成「从未派发」/「没有终态」/「一定被删」。
  - **派发面**：`dispatch(resume_session=X)` 命中已删 X ⇒ **不得**留下 `state=dispatching` 的悬挂条目；旧条目置 `tombstone`、ledger 出现 **`outcome:"vanished"` 终态行**、同一 `goal_key` 的新 session 建成 ⇒ **同一 `workRoot` 可再次派发**。
  - **终止 / 暂停面**（按 D12 矩阵）：已删 X 且条目 `dispatching`/`active` ⇒ `suspend` **释放槽位并置 `suspended`**、`cancel` **置 `tombstone` 并落 `outcome:"vanished"`**；条目 `idle`/`suspended` ⇒ `suspend` 幂等 no-op、`cancel` 置墓碑落行；条目 `tombstone` ⇒ `suspend` 拒绝、`cancel` 幂等 no-op。**四组都不得因「无法定位工作目录」而抛错**。
  - **痕迹**：该 repo 的 `ledger.jsonl` 里原有 `event:"dispatched"` 行仍在（`reconcile` 只改 `pair.json` 的 `state`，不写 ledger）。
- [ ] **V10** front session 换代（新 front session id）后，仍能通过兜底路径找回旧后端。
- [ ] **V11** **兜底路径扫全量**：构造 >50 个 session（其中 ≥2 个是被派发的后端且 `time.updated` 最旧）→ 换代后的 `sessions` 仍能列出这两个后端（验证 cursor 续扫，不因 limit 窗口漏扫）。
- [ ] **V12** metadata update 后**完整字段仍在**（不因整体替换丢字段）——含新增的 `work_root` / `state`。

**一 session 一目标（D3）**

- [ ] **V13** 同一后端用**相同 goal_key** resume → 允许；用**不同 goal_key** resume → **拒绝**且提示新 session。
- [ ] **V14** 同一目标续接时，`grant` 救援路径（原地补 grant）仍可用（goal_key 相同不误杀）。
- [ ] **V15** 对正在运行的后端 resume → 拒绝并说明原因（不 steer 注入当前轮）。
- [ ] **V16** **同 slug 异目标的行为被文档化**：机制**不**拒绝（front 复用同一 slug 时校验通过），但 ledger 中两行的 goal 描述不同 ⇒ 可事后审计发现。
- [ ] **V17** `goal_key.repo` 仍是 `canonical_root`（同一目标换 worktree 续接**不被误判为不同目标**）；而**槽位与检索分组**按 `work_root`（同仓不同 worktree 的同 slug 后端在名册里**可区分**）。

**状态与聚合（D4/D5）**

- [ ] **V18** 后端 run 进行中 → `sessions` 报 `running`（依据 `time.busy`，不依据 `outcome`）。
- [ ] **V19** 后端刚派发、`busy` 尚未写入的窗口期 → 报 `running` 而非"已完成"。
- [ ] **V20** 一个后端 `unverified` + 一个 `succeeded` → 整体**不得**报完成；明细列出两者。
- [ ] **V21** 一个 running + 一个 succeeded → 整体"进行中"，且明细列出。
- [ ] **V22** 全部 `unverified` → 报"无可验证交付"（措辞不含"没有产出"）。
- [ ] **V23** 明细**永远**输出（不只有 headline）。

**单槽与实现约束（D6/D7）**

- [ ] **V24** **槽位键 = `workRoot`**：同一仓的两个 linked worktree 各派一个后端 → **两者都成功**（不被"同 repo 互斥"挡住）；且各自 `pair`/metadata 的 `work_root` 分别为两个 worktree 路径。
- [ ] **V25** 同一 `workRoot` 已有 `active` 后端时再派发 → **拒绝**并说明（不排队、不静默并发）。
- [ ] **V26** 同一 `workRoot` 可**常驻多个**后端 session（各自 `state=idle`），`sessions` 能把它们**列在一起并按 `work_root` 分组**。
- [ ] **V27** **scope 前缀重叠检测不实现**：静态断言实现中**不存在**该逻辑（死代码不得保留；D8.2）。
- [ ] **V28** 槽位检查与登记在**同一次锁临界区**内（并发触发两次派发，只有一个成功）。
- [ ] **V29** **既有 `delegate` 受同一张槽位表约束**：同工作树已有 `active` 后端时，既有同步 `delegate` 也被拒；且 `delegate` 返回后其条目 `state=idle`、条目落 `work_root`/`state`（**三处变更面见 D7.4**，须显式测试）。
- [ ] **V30** **消费确认（D7.2，实施期最先锚定）**：`dispatch` 返回前必须确认简报**已被消费**；未确认 ⇒ 条目停在 `state=dispatching`。⚠️ **先实测**："简报文本出现在 `session.context`" 是否等价于 promote 已发生（上游 drain 是 `peek → awaitActivation → prepareContext → promote`，`runner/llm.ts:70,75,186-192`）⇒ 若**不可靠**，本条**触发降级**（退回「单槽但不可切换」），并**如实记录**，不得用"看起来对"冒充。
- [ ] **V31** `dispatching`（未确认消费）的后端 → `suspend` **拒绝**、`cancel` 可用（未确认消费的简报仍可能 pending ⇒ 不可保留可续性）。
- [ ] **V32** **翻转执行者（D7.1）**：① 既有同步 `delegate` 返回后，其条目 `state=idle`（不占槽）；② `dispatch` 派发的后端**跑完但无人调用 `sessions`** → 下一次派发到同一 `workRoot` **成功**（reconcile-on-read 生效）；③ **第二次顺序 `delegate` 到同一工作树成功**（不被自己前一轮留下的 `active` 条目挡住——这是对既有主路径的回归判据）。
- [ ] **V33** **槽位回收（D7.3）**：后端崩溃/被删导致 `active` 但实际不 busy → 下一次派发触发 reconcile ⇒ **放行**（不必先手工 `suspend`）。
- [ ] **V34** **亡主接管（D7.3）**：front session 换代后，旧 front 名下的 `active` 槽位**不被静默顶掉**，但可被新 front `suspend` 回收；接管**落 ledger 行**；该工作树**不因换 front 而永久不可派发**。
- [ ] **V35** **投递失败（D7.2）**：`dispatch` 的 execute 超时/异常 → **保留槽位**（不放行）+ 返回「投递结果未知，请 `sessions` 确认」；**不得静默放槽**。

**终止与暂停（D9）**

- [ ] **V36** `cancel` 后该后端被标为墓碑（`state=tombstone`），`sessions` 不再列为在跑；再次 `dispatch` 到同一后端 → **拒绝**（要求新建）。
- [ ] **V37** `cancel` 返回 `{interrupted:true|false}`（**取值语义见 D11.3**：true = 已接受中断；false = **不区分**「本来没在跑」/「已在停机过程中」/「settle 窗口」——**不得**用它推断停机）。
- [ ] **V38** `suspend` 后该后端标为 `suspended`（**不是**墓碑）→ **仍可 resume**（dispatch/resume 同一后端不因"曾被暂停"被拒）。
- [ ] **V39** `suspend` 一个**当前无活跃执行**的后端 → 幂等 no-op（`{interrupted:false}`；⚠️ 该取值**不蕴含**「已停机」，停机仍以 D11.3 的水位线为准）；`suspend` 一个已墓碑的后端 → **拒绝**。

**切换与回收（D11）**

- [ ] **V40** **切换两步可用**：`suspend(A)` 后 A 让出槽位 → 随后 `dispatch/resume(B)`（同一 workRoot）**成功**；A 仍在名册中可枚举。
- [ ] **V41** **停机确认**（判据 = 「判活为假」+ 终态正面证据，见 D11.3；**不是** `interrupt` 的返回值、**也不是**「看起来不忙」）。**可执行序列**：**步骤 1** 先 `session.get` 记 `v0 = time.idle` 与判活结论 `running0`；**步骤 2** 调 `suspend`；**步骤 3** 再 `session.get` 读 `v1`。断言：**a)** 对**在跑**的后端（`running0 = true`）⇒ `v1 > v0`（水位线前移）且 `suspend` 返回 `suspended:true`；**b)** 对**空闲**的后端（`running0 = false`）⇒ `suspend` **立即**返回 `suspended:true`（**不**等水位线前移、**不**超时）；⚠️ 本条**不**覆盖 D11.3 的「陈旧 busy」形态（残留风险，见「后果 / 代价」的风险条目）；**c)** 构造不停机——假 ctx 令判活恒为真（或令 `time.idle` 停在 `v0`）⇒ 断言 `suspended:false`、`pair.json` 条目仍 `active`、**不释放槽位**、报错文案含「未释放槽位」；**d)** 读失败 / 原因不明 ⇒ 同样**不释放**（保守当未停机）。四种情形都不得出现「两个 active 同一 workRoot」。**实现约束**：释放槽位的写必须发生在 `waitStopped` 返回之后（代码结构保证，评审看这一点而非靠落盘时间戳推断先后）。
- [ ] **V42** **槽位悬挂可见**：后端崩溃/被删导致 `active` 但不 busy 且超 `stalled` 阈值 → `sessions` 报「槽位疑似悬挂」（**展示层信号**；实际回收由 reconcile-on-read 承担，D7.3）；`suspend` 该后端**幂等释放**槽位，随后同工作树可再次派发。
- [ ] **V43** `suspend` **不删除** session（默认不 remove）⇒ 上下文保留，可 resume。
- [ ] **V44** **steer 残留**：恢复后首批消息若含暂停之前的内容 → 报「上下文可能含陈旧指令，建议新建」（`unverified` 语义）。⚠️ 若实施期实测确认**插件无法从 `session.context` 区分 steer 消息** ⇒ 该判据**降级为"如实报不可检出"**，**不得**用"看起来没问题"冒充通过。

**回归（D1 保留既有 delegate）**

- [ ] **V45** 既有 `delegate` 的全部既有判据（`outcome` 枚举含 `unverified`、`busy` 拒绝、scope 越界检测、pair 登记、ledger 行时机）**全部仍通过**（`bun test tests/` 全绿 + E2E 回归）。
- [ ] **V46** `prompts/front.md` 明确「dispatch 返回 ≠ 后端完成」，且区分「需要等结果 → delegate / 并发多任务 → dispatch」。
- [ ] **V47** **范围假设已写明**：构造性保证的成立前提「后端 session 只经本插件四工具被操作」在 `prompts/front.md` 或使用手册中**显式声明**（D8.3）——用户直接操作后端 session 是**声明过的超出范围**，不是隐式漏洞。
- [ ] **V48** `prompts/front.md` 写明**切换契约**：「切换活跃后端 = 先 `suspend` 当前、再 `dispatch/resume` 目标」；并写明「同仓并行需先准备独立工作树」（D6.4）。
- [ ] **V49** opencode 升级回归清单新增两条：`delivery` 默认值、`time.busy` 存在性。
