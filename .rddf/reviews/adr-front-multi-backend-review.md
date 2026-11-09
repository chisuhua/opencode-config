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
