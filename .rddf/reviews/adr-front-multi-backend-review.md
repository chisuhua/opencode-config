# 审稿报告：ADR-front-multi-backend + ADR-canonical-root-normalization

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 审稿者 | oracle（架构评审）→ critic（arch 档审稿） |
| 被审对象 | `docs/adr/ADR-front-multi-backend.md`（新起草）<br>`docs/adr/ADR-canonical-root-normalization.md`（新起草） |
| review_profile | arch |
| critic 结论 | **APPROVE_WITH_CONDITIONS**，`mergeable: yes`，`scope_exceeded: false`，**0 BLOCKER** |
| oracle 结论 | 3 条补充探针要求（其中 1 条判断被探针推翻），全部已在起草前补跑 |
| 收口状态 | **0 BLOCKER + 5 SHOULD_FIX + 2 NITS 全部闭合**（见 §4）→ Status 转 **Accepted**（未实施） |

## 1. oracle 评审（起草前）

oracle 的评审给出 3 个"必须先补的探针"与若干设计建议。**其中 1 条判断被探针推翻**：

| oracle 的说法 | 探针结论 |
|---|---|
| "run 进行中的可靠信号缺失，D5 聚合建在沙地上" | ❌ **推翻**。v2.2.5 的 `Session.Info.time` 有 `busy` 字段（`packages/schema/src/session.ts:49-50`）；2.1.2 快照里没有，v2.2.5 才有。判据 = `busy` 存在 ∧（`idle` 未定义 ∨ `busy > idle`），已写入 D4 |
| "插件能否 update 自己 session 的 metadata 未探针" | ✅ 可行且经 host 活动后不覆盖 → 支撑 D2.4 的 roster 快路径 |
| "interrupt 后 queued prompt 残留行为未探明" | ⚠️ 观测不足（插件 ctx **无 `inbox` API**，实测 `Object.keys(ctx.session)` 全集）→ 支撑 D7 的墓碑语义 |

oracle 另提出 3 条设计建议，均已采纳进 ADR：三工具优于 `async` 参数（静默开关的失败可检测性更差）、cancel 墓碑语义、goal 判等降维为 structured key。

## 2. critic 审稿（arch 档）

### 2.1 BLOCKER

**0 条。** critic 逐条核对了四类 BLOCKER：取代流程（两篇 Parent 条款均显式声明）、备选方案与取舍（两篇均有选项对比表）、同一决策自相矛盾（见 §4 SHOULD_FIX 1，措辞矛盾已改写）、未决问题伪装成已决（worktree 隔离、持久队列、编排 agent 均明确标注为后置/否决）。

### 2.2 critic 回答的 8 个定向问题

| # | 问题 | critic 结论 |
|---|---|---|
| 1 | 两篇 ADR 拆分是否正确 | ✅ 正确。归一是独立 bug 修复（非 worktree 零行为变化），multi-backend 是编排能力；依赖方向已在两篇 Parent 互相声明。不合并、不再拆 |
| 2 | 新增 dispatch 是否破坏 §6.1「单一工程出口」 | ⚠️ 字面冲突但化解方向正确 → 见 §4 SHOULD_FIX 2（已补口径扩写 + 承诺同步修订 §6.1） |
| 3 | D2 名册切分是否自洽、兜底路径是否有漂移面 | ⚠️ 兜底路径与探针脱节 → 见 §4 SHOULD_FIX 3（已补 cursor 续扫硬约束） |
| 4 | goal_key 判等是否名不副实 | ⚠️ 方向与提问相反：机制拦的是"换 slug 拒续接"（硬强制成立）；未覆盖的是"同 slug 异目标" → 见 §4 SHOULD_FIX 4（已补方向性说明） |
| 5 | D5 聚合与 `ADR-delegate-delivery-evidence` 是否一致 | ✅ 逐字同构，无措辞分叉 |
| 6 | Verification 是否都是前瞻判据 | ✅ 两篇全部是可勾选、可执行的场景构造，无实测日志复述 |
| 7 | D6「先互斥、worktree 后置」是否留返工缺口 | ⚠️ staging 成立，但缺前瞻注记 → 见 §4 NITS 2（已补互斥键改 workRoot 的注记） |
| 8 | D3 双值接受是否引入安全缺口 | ❌ 不构成缺口，但论证缺失 → 见 §4 SHOULD_FIX 5（已补安全边界论证） |

### 2.3 critic 要求的实跑核对

critic 标注了一条未验证的推断场景：「front 换代重建名册按探针 P2c 构造（造 2 个 idle 超 limit 窗口的后端，验证兜底路径是否漏扫）」。

→ **已转为 Verification 判据**（第一篇 Verification「兜底路径扫全量」条），由实施期/验收期实跑，非本轮结论。

## 3. 两篇 ADR 的关系

```
ADR-canonical-root-normalization（bug 修复，先落地）
        │ 提供归一后的 canonical_root（stateRoot/workRoot）
        ▼
ADR-front-multi-backend（编排能力，后落地）
        │ goal_key 引用归一后的 canonical_root
        │ D6 第二步（worktree 隔离）依赖 stateRoot/workRoot 拆分
        ▼
（后置）worktree 隔离 ADR —— 互斥键须改为 workRoot
```

依赖方向在两篇的 Parent 条款互相声明，无单向隐含。

## 4. SHOULD_FIX / NITS 闭合记录

| # | 级别 | 位置（critic 给） | 问题 | 处置 |
|---|---|---|---|---|
| 1 | SHOULD_FIX | `ADR-front-multi-backend.md:58` | 「既有 prompt/手册/E2E **全部不受影响**」与同文「prompt 契约必须同步改」**字面矛盾** | ✅ 改写为「`delegate` 既有语义与判据全部不变；prompt/手册需**新增** dispatch 三工具契约」 |
| 2 | SHOULD_FIX | `ADR-front-multi-backend.md:10,56` | 与 §6.1 不变式 1「唯一工程出口」字面冲突；化解论证未引用 §6.3 依据 | ✅ Parent 条款加「唯一工程通道 → 唯一门控插件出口」口径扩写；D1 补不变式说明 + §6.3 既有依据 + 承诺同步修订 §6.1 措辞 |
| 3 | SHOULD_FIX | `ADR-front-multi-backend.md:80-84` | D2.4 兜底路径与探针 P2c 脱节：未写 cursor 续扫要求；`directory` 过滤无法用于跨目录重建；`search` 依赖未定义的 title 前缀 | ✅ D2.4 重写为「全库 list + cursor 续扫」，列 3 条硬约束（必须续扫到全量 / 不能用 directory 过滤 / search 只能作可选优化且需定义 title 前缀）；Verification 补「兜底路径扫全量」判据 |
| 4 | SHOULD_FIX | `ADR-front-multi-backend.md:94` | 同 slug 异目标的**假接受方向**未披露 | ✅ D3 补「判等的方向性」小节（换 slug = 硬强制；同 slug 异目标 = prompt 纪律 + 可审计）；风险章补一行；Verification 补行为文档化判据 |
| 5 | SHOULD_FIX | `ADR-canonical-root-normalization.md:70` | D3 双值接受的安全边界论证缺失 | ✅ D3 补论证（workRoot 恒为真实 git toplevel ⇒ 跨仓冒充不成立，放宽的只是同仓内路径变体）；风险章补「workRoot 不得接受入参」的实施约束 |
| 6 | NITS | `ADR-front-multi-backend.md:60` | 探针编号错位（「R4 附注」实际记在 R6 节） | ✅ 改为「探针报告 R6 节记录的 round 4 现象」 |
| 7 | NITS | `ADR-front-multi-backend.md:123` | D6 第二步未注记互斥键需从 stateRoot 改为 workRoot | ✅ D6 补前瞻注记（供后续 ADR 引用） |

**复审判定**：critic 判 0 BLOCKER，评审预算（同一 change ≤ 2 轮）已用 1 轮；SHOULD_FIX 依评审规则直接修、不触发复审。5 SHOULD_FIX + 2 NITS 全部闭合，无新增 BLOCKER。

## 5. 已知残留（ADR 内已披露，非本轮可闭）

- **上游语义漂移**：`delivery` 默认值、`time.busy` 存在性、`session.list` 过滤字段都是上游行为 ⇒ 已写进两篇的风险章 + opencode 升级回归清单要求。
- **同 slug 异目标**无法机制识别 ⇒ 依赖 prompt 纪律 + ledger 事后审计。
- **插件 ctx 无 `inbox` API** ⇒ 队列内容不可直接观测 ⇒ D7 用墓碑语义规避。
- **front 换代后名册重建**为推断场景 ⇒ 已转为 Verification 判据，实施期实跑。
- **worktree 隔离、持久队列、编排 agent** 均明确后置/否决，未伪装成已决。

## 6. 审稿结论

**APPROVE。** 两篇 ADR 满足 arch 档四要素（元数据 / 背景与问题 / 决策 / 选项对比表 ≥3 行 / 独立后果代价章 / 前瞻 Verification），无 BLOCKER，SHOULD_FIX 已闭合，决策面与既有三篇 ADR 无未声明冲突。

**Status 转换**：`Proposed` → `Accepted`（**未实施**）。关联 change 尚未立项（`backlog: front-multi-backend` / `backlog: canonical-root-normalization`），AC 映射暂缺，待 planner 立项后回填。

---

# 第二轮：2026-11-09 改写评审（槽位键改 workRoot + 单槽切换模型）

## 改写起因

用户诉求：「改键到 workRoot，同时检查在同一个 worktree 下，是否允许多个后端 session 同时进行工作，但只有一个后端 session 处于活跃状态……允许 front session 控制下进行切换活跃的 session」。

改写前的并发隔离是「同 `canonical_root`（stateRoot）互斥」⇒ 同一仓的多个 linked worktree 被"同 repo 互斥"堵死，worktree 隔离能力等于没实现。已落地的 `ADR-canonical-root-normalization`（commit `23584cd`）把根拆成 `stateRoot` / `workRoot`，正是为此提供前置。

## 改写要点

| # | 改动 | 位置 |
|---|---|---|
| 1 | 槽位键 `canonical_root` → **`workRoot`**；原「互斥」细化为**单槽**（常驻 vs 活跃分离） | D6.1 / D6.2 |
| 2 | 状态机 5 态 `dispatching/active/idle/suspended/tombstone`，含转移边 | D6.3 |
| 3 | **「投递 ≠ 消费」** ⇒ dispatch 返回前必须确认简报已被消费，未确认停在 `dispatching`（只可 cancel） | D7.2 |
| 4 | `active → idle` 的**翻转执行者**（delegate 自翻转 / reconcile-on-read / suspend 确认停机）+ **锁的形态**（锁外查询 → 锁内重验 → 锁内翻转） | D7.1 |
| 5 | 槽位回收 + **亡主接管**（front 换代）+ 投递失败保留槽位 | D7.2 / D7.3 |
| 6 | 工具面三→四：新增 `suspend`（暂停可续）vs `cancel`（终止墓碑） | D1 / D9 |
| 7 | **删除 scope 前缀重叠检测**（单槽已构造性排除并发写 ⇒ 死代码） | D8.2 |
| 8 | 范围假设显式收窄：构造性保证仅在「后端只经本插件四工具被操作」时成立 | D8.3 |
| 9 | `work_root` 进 metadata 索引与 pair 条目；`goal_key.repo` 仍为 `canonical_root` | D2.3 / D3 |
| 10 | 存量条目一次性回填（数据迁移，属决策） | D2.3 |

Verification 判据 28 → **49 条**；决策段 246 行（≤250）；最长 D 段 39 行（≤40）。

## oracle 第 1 轮（3 处闭合性缺口 + 3 处次要缺口，全部吸收）

| 缺口 | 结论 | 处置 |
|---|---|---|
| 「投递即消费」为假（admission ≠ consumption） | **成立**，已用上游源码复核 | D7.2 消费确认 + 降级路径 |
| `active → idle` 翻转无执行者 | **成立** | D7.1 翻转执行者表 + reconcile-on-read |
| front 换代后槽位无接管路径（工作树被砖死） | **成立** | D7.3 亡主接管 |
| dispatch 超时后的槽位处置未定义 | 成立 | 并入 D7.2（保留槽位，不得静默放槽） |
| 存量回填未写 `state` | 成立 | D2.3（按活体判据，不得默认 idle） |
| 用户 TUI 直接操作绕过保证 | 成立 | D8.3 显式范围假设 |

**上游源码证据**（opencode v2.2.5，`/tmp/opencode/upstream-v225`）：
- `packages/core/src/session/runner/llm.ts:70,75,186-192` —— drain = `nextPromotable`（peek，**不消费**）→ `plugins.awaitActivation`（**可无限阻塞**）→ `prepareContext` → `promote`（**真正消费**）⇒ 投递 ≠ 消费
- `packages/core/src/session/execution.ts:151-170` —— `interrupt({resume:false})` **不删除** pending 行；仅 `resume:true` 才走提升路径
- `packages/core/src/session/inbox.ts:470-487` —— `nextPromotable` 先提 steer、再按 `enqueued_seq` 取最旧 queued ⇒ parked 旧简报会抢先跑
- `packages/core/src/session/sql.ts:142` —— `delivery` 列只在 inbox 表，**消息表没有** ⇒ `session.context()` 大概率拿不到 `delivery` ⇒ steer 残留**大概率不可检测**
- `packages/plugin/src/promise/adapter.ts:622-645` —— 插件可调的 session 方法全集里**无 inbox**

## critic 第 1 轮（REJECT，3 BLOCKER + 4 SHOULD_FIX + 3 NITS）

| 级别 | 问题 | 处置 |
|---|---|---|
| **BLOCKER 1** | 「投递失败 ⇒ reconcile 兜底回收」与「`dispatching` 只可 cancel」自相矛盾；按字面实现即制造幽灵注入 | reconcile **仅适用于 `state=active`**；`dispatching` 条目一律不翻转；投递失败唯一恢复路径 = `cancel` 后重派 |
| **BLOCKER 2** | 「同 `withLock` 临界区内完成翻转/停机确认」与同步锁签名不可兼得（`withLock` 是 `() => void`、10s deadline，锁内不能 await） | 新增「锁的形态」：**锁外查询 → 锁内重验登记态 → 锁内翻转**；锁内只做同步读改写，**不修订** redesign D6 的锁协议 |
| **BLOCKER 3** | 风险章「同一 goal_key 重复 resume 即拒」与 D3「相同 goal_key resume → 允许」直接矛盾 | 改为**由 per-session busy 判据 + 单槽表拦截**；明写 goal_key 校验只回答"是不是同一个目标" |
| SHOULD_FIX 1 | Parent 行「不改 redesign D6」与 pair-v2 schema 扩展不符 | 精确化为「锁协议沿用不改；schema 追加 `work_root`/`state`」 |
| SHOULD_FIX 2 | 「对既有 delegate 的唯一行为变更 = 一条槽位检查」不准确 | 列全三处：新增槽位检查 + 返回时写 `state:"idle"` + 条目落 `work_root`/`state` |
| SHOULD_FIX 3 | D1 表「立即返回」与「返回前确认消费」字面冲突 | 改为「不等任务完成即返回 …… 返回前须等消费确认」 |
| SHOULD_FIX 4 | 存量回填只在 Verification | 提升为 D2.3 决策段（数据迁移） |
| NITS ×3 | Status 行内嵌流程状态 / `D7.2`→`D7.4` 引用 / 强制接管补工具序列 | 全部修 |

## critic 第 2 轮（复审，仅验闭合）

**APPROVE。mergeable: yes。0 BLOCKER、0 SHOULD_FIX、1 NIT。**

- BLOCKER 1 闭合：`:196` / `:213` / `:219` 三处文本 + D6.3 状态表 `dispatching` 行**无 → `idle` 边** ⇒ 状态机与文字判据三方一致
- BLOCKER 2 闭合：`:201`「锁的形态」段 + D7.4 / D11.2 / D11.3 三处一致引用，**无残留「锁内 await」表述**；Parent 行与「不修订锁协议」声明无冲突
- BLOCKER 3 闭合：`:352` 已改；D3 段与 Verification 未动，两处同向
- NIT（已采纳）：D7.2 补「**消费确认 ≠ 任务完成**」消歧

## 未决项（ADR 已自述，未伪装成已决）

1. **「已消费」的可观测判据未实测** —— 已写降级落点：若实测不可靠 ⇒ **退回「单槽但不可切换」**（只保留单槽，不提供 `suspend`）。
2. **steer 残留大概率不可检测** —— 缓解只到「报存疑」（`baseline_message_id` 比对），且明写**不能保证检出**。
3. **存量 pair 条目回填**已定为决策（D2.3），但迁移的执行细则由实施期定。
4. `proposal.md` 的 AC 编号与映射表**仍待 planner 同步**（architect 不写 proposal）；在此之前以 ADR 的 Verification 文本为准。

---

# 第三轮：2026-11-09 第二轮改写（D12 已删后端可见性）

## 触发

change 2 实施 + verifier 第 1 轮验收发现 **AC13 无法实现**：判据要求「后端被删后 `sessions` 报已消失 + ledger 补记终态行」，但 `ctx.session.list()` 不返回已删 session，而 ADR D2.1 又否决全局 registry。

## 改动

| # | 改动 | 位置 |
|---|---|---|
| 1 | 新增 **D12「已删后端的可见性（能力边界）与后续触碰处置」** | 决策段（D11 之后） |
| 2 | **V09 改写**：观测面 / 派发面 / 终止面 / 痕迹 四段分别判 | Verification |
| 3 | **V08 修正**：删「reconcile 会写行」（实现中 reconcile 只写 `pair.json`） | Verification |
| 4 | 选项对比表 +3 行（扫 pair.json / 调用方传 repo / 订阅 `session.deleted`） | 选项对比表 |
| 5 | 后果/代价 +1 条（已删后端不可枚举） | 后果 / 代价 |
| 6 | 元数据收敛：Status 只留当前态；两轮改写摘要 + 审稿报告指针；「前置事实」的绝对化表述改为「探针或上游源码背书 + 未探针假设显式标注」 | 元数据 |

## oracle（1 轮，7 处全部采纳）

| # | 级别 | 问题 | 处置 |
|---|---|---|---|
| F1 | 高 | **resume 命中已删后端 ⇒ 级联死槽**：dispatch 只写 `dispatch_failed` 并提示 cancel，而 `cancel`/`suspend` 因 `locateBackend` 抛「无法定位」⇒ `dispatching` 死条目永久占死工作树 | ✅ D12 增「后续触碰处置矩阵」：派发面拿到 404 **正面证据**时必须处置（置 `tombstone` + 落终态行 + 同 goal_key 新建）；`cancel`/`suspend` 不得因「无法定位」抛错 |
| F2 | 高 | **断链引用「D2.5」**（该小节不存在） | ✅ 全改 D12 |
| F3 | 高 | 「三种做法都不可行」**过强**：漏了第四条——`ctx.event` 可达全局 bus，订阅 `session.deleted` 做写侧墓碑**部分可行** | ✅ 补进选项表，并列四条否决理由（事件不带 location / 依赖插件存活与 location 激活 / 跨 server 送达未探针 / 解决不了可见性） |
| F4 | 中 | V09「不新增终态行」**不可判定**（与 `dispatched`/`dispatch_failed`/`taken_over` 写点混淆）；且 V08 称「reconcile 会写行」与实现不符 | ✅ V09 改为可判定措辞（观测面：ledger 行数与末行不变）；V08 修正 |
| F5 | 中 | 「插件无法枚举 repo」**过强**：`list` item 带 `location`/`projectID` | ✅ 精确化为「只能枚举**仍有存活 session** 的 repo；目标场景恰在盲区正中」 |
| F6 | 低 | 三种「没有」未区分（从未派发 / 已删除 / **索引写丢**） | ✅ D12 读侧语义写死三种都 `≠`，并指回 D2.1「可丢弃索引」 |
| F7 | 低 | reconcile 翻转后 pair 不再携带「消失」证据 | ✅ D12 写明「区分点只剩 ledger 那条 `dispatched`」 |

## critic（1 轮 REJECT → 2 BLOCKER 全部闭合）

| # | 级别 | 问题 | 处置 |
|---|---|---|---|
| B1 | **BLOCKER** | D12 写 `event:"vanished"`，与 AC36 已裁定的 **`vanished` 是 `outcome` 值**冲突（`dual-session-delegation.md:112` + 实现 `delegate-async.ts:784` 三处一致） | ✅ 全改 `outcome:"vanished"` 终态行 |
| B2 | **BLOCKER** | `suspend` 对已删后端的处置**三处互斥**（D12 说 no-op / D11 段说释放槽位 / V 说墓碑拒绝） | ✅ D12 改为**唯一处置矩阵**（`state` × 已删 × 动作 共 9 格），并声明它**取代** D9「`interrupted:false ⇒ no-op」的一半适用范围——界线是「不在跑」vs「已不存在」 |
| S1 | SHOULD_FIX | 选项表把「跨 server 不送达」写成既成事实（未探针） | ✅ 改「**未探针**，按不送达假设处理」；元数据「前置事实」同步 |
| S2 | SHOULD_FIX | Status 行承载版本史 / 过程日志进决策文档 | ✅ Status 收敛为当前态；两轮改写压成摘要行；过程记录移本节 |
| N1 | NIT | 新建 session 失败时的状态未写 | ✅ D12 补「视同 dispatch 新建失败：不占槽，终态行已落」 |

## 闭合后结构自检

决策段 **250 行**（上限 250）、最长 D 段 **39 行**（上限 40）、Verification **49 条**、D 段数 **12**。

## 下游待办

- **planner**：按 D12 改写 proposal 的 **AC13**（原判据要求「报已消失 + 补记」）；同步 AC36 的 `vanished` 表述（已确认是 `outcome`）。
- **builder**：按 D12 矩阵实现「已删后端的后续触碰处置」（`dispatch(resume)` / `cancel` / `suspend` 三入口）。
- **architect**：`ADR-front-knowledge-capability` D5 行产生时机表（`event` + `outcome:"vanished"`）。


---

# 第四轮：2026-11-09 治理面 + ADR D5 同步（AC36 收尾）

## 改动（三份）

| 文件 | 档 | 改了什么 |
|---|---|---|
| `docs/adr/ADR-front-knowledge-capability.md` | arch | **D5**：① 字段段新增 `event` 独立字段 + `outcome` 枚举新增 `vanished`；② 行产生时机表 +5 行（异步派发面）；③ 加「reconcile 不写 ledger」注；④ 加「`vanished` 是 outcome 不是 event」消歧句；⑤ 补 event 行的实际字段清单；⑥ 元数据补「增补记录 3」 |
| `docs/MULTI-AGENT-DESIGN.md` | 治理面 | front 权限行改五个 action + 澄清「唯一 = 门控边界唯一」；门控行；workflow 第 3/4 步；pair 登记表补 `work_root`/`state`/`goal_key`/`kind`/`suspended_at_message_id?`/`steer_residue?`；权限矩阵措辞；验证记录 +5 行；文件树补 `lib/delegate-async.ts`；修 code span 内 `**` 渲染 |
| `docs/CHANGELOG.md` | 治理面 | 新增 **v2.7 变更摘要**（8 条）+ 未完成清单 |

## oracle（1 轮，治理面判定 **PASS-WITH-NOTES**）

| # | 级别 | 问题 | 处置 |
|---|---|---|---|
| 1 | **必须修** | **CHANGELOG ⑥ 把未实现行为写成已落地**：全库唯一 `vanished` 是 `sessions` 的**展示字段**（`delegate-async.ts:784`），ledger 从未写过 `outcome:"vanished"`；`suspend`/`cancel` 对已删后端仍抛「无法定位」⇒ 死槽风险**仍在** | ✅ ⑥ 改为「派发面处置矩阵**已按 D12 定稿**，但**实现尚未落地**」并列出当前实际行为；⚠️ 行扩为「AC13 判据改写 + **D12 矩阵的实现**」 |
| 2 | 建议（中） | D5 的 `vanished` ∈ event 的读法歧义 | ✅ D5 加消歧句：`event` 四行 `outcome` 恒 `null`（是**动作**），`vanished` 行**无 `event` 字段**（是**终态结果**）；消费者按「有 event ⇒ 动作行；无 event ⇒ 终态行」分派 |
| 3 | 建议（低） | `MULTI-AGENT-DESIGN.md:443` code span 内的 `**` 渲染成字面星号 | ✅ 去掉 span 内的 `**` |
| 4 | 建议（低） | workflow 第 4 步未区分 `dispatch` 不回 `outcome` | ✅ 补半句「`dispatch` 不回 `outcome`（只回 `state`/`delivery_known`）⇒ 结论须用 `sessions` 查」 |
| 5 | 建议（低） | CHANGELOG ① 括注「唯一新增」不够严 | ✅ 改为「唯一**行为**影响 + 另有两处登记字段写盘」 |
| 6 | **新发现（builder 侧）** | AC36 同步清单余下两处未做：`docs/dual-session-delegation.md` event 枚举缺 `taken_over`；`prompts/front.md` 缺 `vanished` 与 `event` 说明 | ✅ 登记为 **tasks.md T7.8**（builder） |
| 7 | **新发现（planner 侧）** | `proposal.md` AC4 脚注「reconcile 会写行（AC13）」与 ADR V08 修正、D5 新注**直接矛盾** | ✅ 登记为 **tasks.md T7.9**（planner） |

## critic（1 轮 **APPROVE**，0 BLOCKER / 0 SHOULD_FIX / 4 NIT）

| # | 级别 | 问题 | 处置 |
|---|---|---|---|
| N1 | NIT | D5 字段清单未含 event 行的实际字段（`goal_key`/`work_root`/`canonical_root`/`agent`） | ✅ D5 补「event 行动带的字段」清单 |
| N2 | NIT | D5 元数据缺第三条增补记录（既有两条先例） | ✅ 补「增补记录 3」 |
| N3 | NIT | `MULTI-AGENT-DESIGN.md` pair 表缺 `kind` / `suspended_at_message_id?` / `steer_residue?` | ✅ 补齐（后两者标 `?` 表示可选） |
| N4 | NIT | `cli.json`（用户 UI 偏好）混在 diff | ✅ 本仓库**始终不提交** `cli.json`（前几轮提交已排除），本轮同样排除 |

## 收尾验证（critic 的验证建议）

| 建议 | 结果 |
|---|---|
| `bun test tests/` 确认 216 pass | ✅ **216 pass / 0 fail**（实跑） |
| `bun test tests/delegate-async.test.ts` 确认 44 项且含 stalled/steer_residue/亡主接管 | ✅ **44 pass / 0 fail**（实跑） |
| 正向验证 CHANGELOG ⑥ 的**负向陈述**（suspend/cancel 对已删后端确实抛「无法定位」而非静默成功） | ✅ 实跑确认：`suspend` 与 `cancel` 均抛「无法定位后端 …（session 已不存在？）」⇒ **「实现尚未落地」陈述成立** |
| `opencode debug agents` 复核 front 五个 action | ✅ 本轮实测：front 五 action 全 allow，Build/General/Plan/Explore 全 deny |

## 本轮之后的未完成（已登记 tasks.md）

- **T7.7 D12 派发面处置矩阵的实现**（builder；死槽风险仍在）
- **T7.8 AC36 余下两处同步**（builder：`dual-session-delegation.md` / `prompts/front.md`）
- **T7.9 proposal AC4 脚注修正**（planner）
- **T7.2 / T7.3**（E2E bats / AC44 时延，需用户授权外部仓库 + 真实模型）

---

# 第三轮改写（2026-11-10）：D11.3 停机判据订正 —— 审稿记录

> **范围**：只订正「停机确认」的判据（`interrupt` 的返回值 ≠ 停机判据）。决策本体未变。
> **评审预算**：本 ADR 的 critic 轮次 1/2/3（第 2、3 轮均由用户明确批准）；**oracle** 1 轮 + 1 次复审额度。

## 轮次 1：oracle（先于 critic，顺序不可颠倒）

**结论**：方向成立，但「新措辞仍写反 + 判据不足」。

| # | 发现 | 处置 |
|---|---|---|
| O1 | `interrupted:false` 的归因**写反**：上游 `run-coordinator.ts:145/151` 的 `false` 有**三种**成因（无执行 / 已在停机过程中（**仍在跑**）/ settle 窗口（fiber 已退、终态未发布））⇒ 「只表示本来就没有活跃执行」不成立 | ✅ 改为如实列举三种成因 |
| O2 | 「活体复查」判据**不足**：两个假停机窗口（`time.busy` 未投影；`busy` 从不清空）⇒ 改用**终态水位线**（`time.idle` = 运行期唯一写入点的严格单调水位线，`projector.ts:527`） | ✅ D11.3 改写为水位线判据 |

## 轮次 2：critic（arch 档）—— REJECT（`mergeable: no`）

| # | 级别 | 发现 | 处置 |
|---|---|---|---|
| B1 | BLOCKER | D11.3 的「水位线前移」对「**本来就没在跑**」的后端无定义 ⇒ 必然超时 ⇒ 与 D11.4/Verification 的「幂等 no-op」矛盾（这是 `suspend` 最常见的入口） | ✅ 判据改为**分支式**：`running0=true` ⇒ 要求水位线前移；`running0=false` ⇒ 无附加要求 |
| B2 | BLOCKER | 文档内两套互斥判据（D4 取反 vs D11.3 合取）；且实现是「`isRunning` 取反」⇒ Verification ① 对实现不可能通过；附带 `waitStopped` 忽略 `unknown` ⇒ 读失败被当停机 ⇒ 误放槽 | ✅ D4 与 D11.3 收敛为同一条；实现按新判据重写（`snapshotStopBaseline` + `waitStopped(ctx,id,baseline)`）；读失败 ⇒ 不释放 |
| B3 | BLOCKER | 「`time.busy ≤ time.idle`（无新一轮 execution 在跑）」的括注被文档自己否证 ⇒ 把未关闭的假停机窗写成已关闭 | ✅ 删掉该括注；「排除新一轮」的残留窗口留在**显式声明**的原子性缺口段 |
| S1–S5 | SHOULD_FIX | 前置事实失准（「false 的三种成因里两种仍在跑」→ ③ 是 fiber 已退、终态未发布）；「唯一写入点」→「运行期唯一写入点」（`transfer.ts:164`）；Verification ① 改成**可执行序列**（去掉事后不可观测的先后断言）；Status 承载版本史（元数据头膨胀）；D8.3 未显式覆盖 D11.3 的蕴含 | ✅ 全部已改 |

## 轮次 3：critic（arch 档）—— REJECT（`mergeable: no`）

| # | 级别 | 发现 | 处置 |
|---|---|---|---|
| BLOCKER-1 | BLOCKER | 我写进 D8.3 的「该假设同时覆盖 D11.3 的原子性缺口：本插件四工具不会有清理期间到达的新 wake」**前提为假**：上游 `session.ts:187`（`input.resume !== false` ⇒ `wake`）+ `run-coordinator.ts:109-114`（settle 时 `pendingWake` 起后继 execution），而插件 `prompt` 不传 `resume:false`、`claimSlot` 把 resume 目标排除在活体判定外 ⇒ **插件自己的四工具并发**即可制造该 wake | ✅ D8.3 改为如实（「只排除用户/外部不经插件的操作」）；D11.3 的原子性缺口段改写为「**D8.3 兜不住**」+ 写明可达路径与后果；风险章新增**显式残留风险**条目；根治归属改为「异步 `dispatch` 的 resume 活体守卫（另立 change）」 |
| BLOCKER-2 | BLOCKER | D4 的**无条件式**（「判活为假 **加上** 终态落定」）与 D11.3 的**分支式**互斥 —— 正是 B1 的旧坑 | ✅ D4 改为条件式（「仅当基线在跑时再要求终态落定的正面证据」） |

## 轮次 4：critic（用户批准后开的闭合复核）—— REJECT（`mergeable: no`）

| # | 级别 | 发现 | 处置 |
|---|---|---|---|
| F1 | BLOCKER | 我为修 BLOCKER-2 而加的那句「stale-busy 形态由 D11.3 的水位线要求兜住」**是假的**：该形态下两级判活都不成立，而 `running0=false` 分支**不要求水位线前移** ⇒ 不被兜住 | ✅ 如实化（「不被兜住」⇒ 登记为残留风险）；D11.3 的窗口①描述补全（「busy 为 null」只是「从未空闲过」的子情形，曾空闲过 ⇒ 读到**陈旧 busy**）；风险章新增「陈旧 busy 可假停机」条目 |
| F2 | BLOCKER | 「根治需给异步 `dispatch` 的 resume 目标补活体守卫（另立 change）」是**未经比较的已决结论**：上游有权威原语 `ctx.session.wait`（= `get` + `awaitIdle`，settle 后**重查**，注释原文即「to cover a successor execution started by a late doorbell」），插件可见、既有 `delegate` 已在用 ⇒ 属「决策缺备选与取舍理由」 | ✅ D11.3 新增「**为什么不用上游的 `ctx.session.wait`**」段：写明它能覆盖后继 execution 且满足两个分支，**不用它的两条理由**（① 跨 server 实例：`awaitIdle` 只看进程内 execution 表，水位线是 DB 级跨实例可见；② run 中途被 interrupt 的返回语义**未实测**，探针缺口 `probes.md:357`）⇒ 登记为**待实测的备选**；风险章的根治归属改为「① 活体守卫 / ② `session.wait`（需先补实测）」 |
| S6 | SHOULD_FIX | 「读失败 ⇒ 保守」只覆盖了一半：实现把 `ctx.session.context` 抛错 catch 成空消息 ⇒ 第二级兜底失效 ⇒ 可能误判停机 | ✅ 实现改保守：新增 `readSessionMessages`（返回 `ok`），失败时基线取不到 / 轮询中不判停机；新增回归用例 |
| N1 | NIT | `DEFAULT_STOP_TIMEOUT_MS` 的取值依据把**夹具**延迟说成上游实测 | ✅ 收紧措辞（「不是上游 settle 延迟分布的实测」） |

## 收尾验证（实跑）

| 项 | 结果 |
|---|---|
| `bun test tests/` | ✅ **239 pass / 0 fail** |
| 独立边界脚本（`/tmp/opencode/probe/verify-stop-criteria.ts`） | ✅ **12 PASS / 0 FAIL** |
| `bunx tsc --noEmit --skipLibCheck lib/delegate-async.ts` | ✅ 零真错误 |
| E2E（外部仓库，默认模型，干净环境） | ✅ **全量 23/23 全绿**；本轮末改后又跑 L2-19/L2-20/L2-22 ✅ |
| ADR 结构自检 | ✅ 决策段 249/250、最长 D 段 38/40、判据 49 条 |

## 登记在 backlog（本 ADR 不返工）

- 异步 `dispatch` 对 resume 目标**无活体守卫**（AC19/D8.1「对正在运行的后端 resume ⇒ 拒绝」目前只在同步 `delegate` 面）。
- `isSessionMissingError` 用 `/404/` 文案宽判 ⇒ 含 "404" 的传输错误会被判成「已删除」。
- 探针缺口：`ctx.session.wait()` 在 run 中途被 interrupt 时的返回语义未测（⇒ F2 的备选需先补）。

## 轮次 5：critic（第 4 轮，闭合复核，用户批准）—— **APPROVE**（`mergeable: yes`）

| finding | 判定 | 证据 |
|---|---|---|
| **F1**（stale-busy 声明自相矛盾） | ✅ **已闭合** | D4 `:135` 改如实（「不被兜住」+ 指向风险条目）；D11.3 `:269` 补全窗口①两子形态；风险章 `:361` 新增「陈旧 busy 可假停机」条目（含取舍：补水位线要求 ⇒ 空闲后端必然超时 ⇒ 不可单独采用）。critic 复核上游 `projector.ts:790-796/798-800` 与本仓 `isRunning` 第二级前提 `busy === 0` ⇒ 「不被兜住」为真；全文 22 处相关表述逐条核对，**无残留旧声明** |
| **F2**（判据选型缺备选与取舍） | ✅ **已闭合** | D11.3 `:275` 新增「为什么不用上游 `ctx.session.wait`」段；critic 逐条复核上游引用（`session.ts:278-281`、`run-coordinator.ts:164-171` 注释原文逐字一致、`run-coordinator.ts:66` 的进程内 `new Map`、`adapter.ts:641`、本仓 `delegate-core.ts:1091`、探针缺口 `probes.md:357`）⇒ **取舍理由有源码背书**；风险章根治归属同步 |
| **S6**（读失败保守只覆盖一半） | ✅ **已闭合**（实现侧） | `readSessionMessages` 返回 `{messages, ok}`；基线取不到 ⇒ 拒绝；轮询中 `ok=false` ⇒ 不判停机 ⇒ 窗口耗尽 ⇒ 仍 `suspended:false` + 不释放；回归用例打在 `context` 抛错这条真实路径上 |

**本轮 diff 扫描**：未发现新 BLOCKER。critic 另确认两个**不是**问题的点：`session.context` 上游仅在 not-found / DB 故障时抛错 ⇒ 新的保守侧不会打断「挂起空闲后端」主路径；AC54 基线读失败 ⇒ `lastMessageID([])` 为 `""` ⇒ 下游走 `undetectable` 保守侧 ⇒ 安全。

**本轮后补的三处小修**（SHOULD_FIX/NIT，非返工条件）：Verification AC(b) 补「**不**覆盖陈旧 busy 形态」；元数据「本次改写摘要」补第 ④ 条（如实化 + `session.wait` 取舍）；AC54 的 context 读移到「未停机」早退之后（省一次无用读）。

**backlog 更新**：`session.wait` 备选仍挂在「需先补实测」下（**未因本轮关闭而移除**）；另记 critic 提示的行号级引用漂移风险（`session.ts:278-281` / `run-coordinator.ts:164-171` / `adapter.ts:641` 三处是行号引用，opencode 升级后会静默漂移 ⇒ 建议纳入「上游语义漂移」回归清单）。
