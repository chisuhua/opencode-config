# 实施报告：front-multi-backend（AC1–AC58）

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 实施者 | builder |
| change | `openspec/changes/front-multi-backend/`（AC1–AC58） |
| ADR | `docs/adr/ADR-front-multi-backend.md`（Accepted，2026-11-09 改写） |
| Phase 0 | ✅ **已完成**：`.rddf/reviews/front-multi-backend-consume-probe.md`（16/16 PASS） |
| 测试 | `bun test tests/` → **205 pass / 0 fail**（改动前 172 → 新增 33） |
| 状态 | **实施完成（可验收部分），3 项需外部条件 / 跨角色** |

## 1. 改动清单

| 文件 | 改动 |
|---|---|
| `lib/delegate-core.ts` | 新增 `SlotState`/`GoalKey` 类型、`isSlotState`/`isKebabSlug`/`slotOccupants`/`slotHolder`/`backfillPairEntry`/`isRunning`/`contextMessageIds`/`describeHolder`/`slotBusyHolders`；`registerSession` 新增 `extra`（`work_root`/`state`/`goal_key`）；新增 `writeRoleSession`/`readPairs`/`writePairs`；`appendLedgerLine` 导出；`validateBrief` 接受 `goal_key`（可选，格式受检）；**既有 `delegate` 新增槽位检查（与 dispatch 共用槽位表）+ 首登记 `active` / 终登记 `idle`** |
| `lib/delegate-async.ts`（新） | 四工具 `dispatch`/`sessions`/`suspend`/`cancel` + 槽位生命周期（`planSlot`/`claimSlot`/`setSlotState`/`updateSlotState`）+ 消费确认 `waitBriefConsumed` + 名册聚合 `aggregateStates` + 兜底扫全量 `listDelegatedSessions` + 全局上限 |
| `plugins/delegate.ts` | 注册四个新工具（与既有 `delegate` 同插件、同门控） |
| `opencode.jsonc.opencode-go` | 新增 `delegate_dispatch`/`delegate_sessions`/`delegate_suspend`/`delegate_cancel`：全局 `deny` + `agent.front` `allow` |
| `tests/delegate-async.test.ts`（新） | **33 条**单测（槽位纯函数 / 活体判据 / 消费判据 / 聚合 / 上限 / dispatch / 槽位回收 / suspend / cancel / sessions / 既有 delegate 槽位检查） |
| `prompts/front.md` | §2.2 四工具路由表 + 「dispatch 返回 ≠ 任务完成」+ 切换契约 + 同仓并行需先备工作树 + **范围假设**；**旧措辞已清除**（「一切工程行动经 delegate」「唯一工程通道」「唯一出口原则」） |
| `docs/front-delegate-architecture.md` | §2.1 工具面四工具 + §4.3 `delivery` 语义修正（steer，**「会排队」已清除**）+ §6.1 不变式 1 的口径扩写（门控边界 ≠ 工具名） |
| `docs/dual-session-delegation.md` | ledger 枚举：新增独立 `event` 字段（`dispatched`/`dispatch_failed`/`cancelled`）+ `outcome:"vanished"` + `state`；故障表补 dispatching/单槽拒绝两行 |

## 2. 关键实现决策（与 ADR 逐条对应）

| ADR 决策 | 实现 |
|---|---|
| D6.1 槽位键 = `workRoot` | `slotOccupants(pairs, workRoot)`；`claimSlot` 按 `workRoot` 判定 |
| D6.2 常驻/活跃分离 + 单槽 | 同 `workRoot` 占槽态只有 `dispatching`/`active`；`idle`/`suspended` 不占槽 |
| D6.3 五态状态机 | `dispatching → active → idle`；`active → suspended`；`dispatching/active → tombstone` |
| D7.1 翻转执行者 + 锁形态 | 既有 `delegate` 终登记自翻转 `idle`；`dispatch` 每次派发先 reconcile（锁外查活体 → 锁内重验 → 锁内翻转）；**锁内无 await、无自取锁调用**（用 `appendLedgerLine` 已持锁版本 / `writeRoleSession`） |
| D7.2 投递 ≠ 消费 + 消费确认 | `dispatch` 自生成 `msg_` 前缀 id 传给 `prompt`；轮询 `session.context()` 直到该 id 出现在消息 id 集合（判据由 Phase 0 实测确认） |
| D7.3 回收 + 亡主接管 | `planSlot` 把「不 busy / 已消失」的 `active` 视为可回收；`suspend` 允许回收（不静默顶掉） |
| D7.4 两派发面共用槽位表 | 既有 `delegate` 调 `slotBusyHolders`（同表） |
| D8.2 删除 scope 重叠检测 | **未实现**（代码中不存在该逻辑） |
| D8.3 范围假设 | 写进 `prompts/front.md` §2.2 |
| D9 cancel 墓碑 / suspend 可续 | `cancel`：`interrupted:true` 才墓碑；`interrupted:false` 纯 no-op。`suspend`：六档按 `state` 分派 |
| D10 全局上限 | `RDDF_MAX_ACTIVE_BACKENDS`（默认 3），`countActiveBackends` 数 metadata 里的占槽态 |
| D11 切换两步 + 停机确认 | `suspend` interrupt 后复查活体，仍 running ⇒ **不释放槽位**并报错 |

## 3. 验证证据

| 证据 | 结果 |
|---|---|
| `bun test tests/` | **205 pass / 0 fail**（新增 33 + 既有 172，**零回归**） |
| 类型检查（新文件） | 零真类型错误（仅既有基线：缺 `@types/node`、`.ts` 扩展名） |
| Phase 0 消费判据 | 16/16 PASS（判据可靠 ⇒ 不降级） |
| 幽灵注入（Phase 0） | **运行时坐实**：两份 pending 时第一份先进 context |
| AC38② `time.busy`（钉到 `get`） | ✅ **是**（run 中 `get()` 返回 `busy`；`outcome` 在 run 未结束时不存在，34 次观测）→ **解决 N7 的 Q2/R4 冲突：R4 正确** |
| AC1/AC2/AC3/AC39 权限矩阵 | ✅ `opencode debug agents` 实测：front 四个 action `allow`，Build/General/Plan/Explore 全 `deny` |
| `session.list` 信封 | ✅ `{data, cursor:{previous,next}}`；**item 带 `metadata`（为空时省略字段）** ⇒ 兜底路径过滤成立 |
| 遗留清扫 | 无 TODO / console.log / skip 测试 / 注释代码 / 未用 import |

## 4. AC 覆盖状态

**已实现且有工具证据**（单测 / 静态 / 实测）：
AC1–AC3、AC5–AC10、AC13（`sessions` 不列已删项）、AC14、AC15–AC20、AC21–AC25、AC26–AC32、AC33（205 pass）、AC34–AC36（文档）、AC38②、AC39、AC40–AC51、AC52、AC53、AC54（报告侧）、AC55、AC57（部分）、AC58。

**未完成 / 需外部条件（如实记录，不得当通过）**：

| # | 项 | 原因 | 路由 |
|---|---|---|---|
| 1 | **AC36 的 `ADR-front-knowledge-capability` D5 行产生时机表** | 该文件是 **ADR**（`docs/adr/**` = architect 归属）。builder **不得单方面改已签批 ADR 的决策内容** | **architect**：把 `event: dispatched/dispatch_failed/cancelled` + `outcome:"vanished"` 补进 D5 表 |
| 2 | **E2E 用例 L2-16..**（AC1 真实调用、AC5 真实派发、AC8、AC44 连续 10 次时延等） | 外部仓库 `/workspace/main/rdd-workflow-e2e` 需另提交 commit 并记录 SHA | 需用户授权改外部仓库 |
| 3 | **AC44 有界时延（连续 10 次 ≥8 次 60s 内进 active）** | 需真实模型跑 10 次（时间/额度） | 待 E2E 一并做 |
| 4 | **AC13 的 ledger 补记 `vanished`** | `sessions` 目前对已删后端**直接不列出**（list 不返回）⇒ 无法补记；需在名册侧保留"曾派发"痕迹（pair.json 扫描） | **design 层待定**（见 §5） |
| 5 | **AC11 的跨 front 换代找回**（真实场景） | 静态/单测已覆盖 cursor 续扫；真实 front 换代未跑 | E2E |
| 6 | **AC35 的 §2.1 ASCII 全景图对齐** | 改文字后箱体宽度可能不齐（纯格式） | 可选 |

## 5. 实施中发现的问题（如实记录）

### 5.1 ⚠️ `sessions` 对「已被外部删除的后端」不可见（AC13 的实现张力）

`list` 不返回已删 session ⇒ **兜底路径看不到它** ⇒ `sessions` 无法报「已消失」，也无法补记 `outcome:"vanished"`。

- **ADR D2.1 的立场**：metadata 索引「随 session 删除自动消失」——这是**特性**（索引不悬挂）。
- **AC13 的要求**：报「已消失」+ ledger 补记终态行（区分于「从未派发」）。
- **张力**：只看 list 拿不到已删项 ⇒ AC13 无法仅靠 list 实现。

**可选解法**（需决策，不由 builder 单方面定）：
(a) `sessions` 额外扫描**已知 stateRoot 的 pair.json**（pair 里有"曾派发过"的条目），与 list 结果求差集 ⇒ 差集即「已消失」。这需要"已知仓库集合"——可从 metadata 的 `canonical_root` 收集（但已删的 metadata 也消失…）⇒ 需在别处记仓库集合。
(b) `sessions` 的调用方（front）传入可能的 repo 列表。
(c) 接受「已删 = 不可见」，把 AC13 降级为「后端被删后，ledger 里那条 `dispatched` 行就是唯一痕迹」——即**不补记**，但**文档写明**。
(d) 另存一份**全局**的"曾派发仓库"清单（如 `~/.rddf/state/front-repos.json`）——但这正是 ADR D2.1 否决的「第三份真相源」。

⇒ **本报告不动 AC13 的判据**，把它标为「实施中发现的设计张力」交 architect 决定（属 `design_drift`）。

### 5.2 ⚠️ 既有 `delegate` 的槽位检查存在小竞态窗口

既有 `delegate` 是「检查槽位（`slotBusyHolders`）→ create → registerSession」，**检查与登记不在同一临界区**（因为 create 是 await，而 `withLock` 不能 await）。⇒ 两个并发 `delegate` 理论上可同时通过检查。

- **对比**：`dispatch` 是「create → 锁内 check+register」，**同一临界区**（AC26③ 已满足）；拒绝时清理已建 session。
- **既有路径的影响面**：`delegate` 是 30 分钟阻塞的同步面，并发同一工作树的概率低；且既有判据要求"语义不变"，改成"先建后检"会引入"建了再删"的副作用。
- ⇒ **如实记录**，不擅自改既有路径的形态。若 verifier 认为不可接受，再讨论（那会变成对 AC50 的判据解释问题）。

### 5.3 ✅ 探针报告 Q1 的 `item_keys` 缺 `metadata` —— 已实证澄清

探针 Q1 记录 `item_keys` 无 `metadata`，但**实证**（创建带 metadata 的 session 后 list）显示 **item 确实带 `metadata`**，只是**为空时省略该字段** ⇒ ADR D2.4 的过滤假设成立。⇒ 本报告的 `listDelegatedSessions` 用 `item?.metadata?.delegated_by`（对缺失安全）。

## 6. 建议 verifier 优先复核

1. **AC26 的锁形态**：静态确认 `withLock` 回调内**无 `await`**、且**未调用** `appendLedger`/`registerSession`（二者自取同一把锁 ⇒ 死锁 10s）。
2. **AC44 的负例**：`dispatching` 状态下 `suspend` 必须被拒（测试已覆盖，但请独立构造）。
3. **AC51② 的语义**：`suspend` 一个 `active` 但不 busy 的后端 ⇒ **释放槽位**（ADR V42），不是单纯 no-op。
4. **AC13 的缺失**（§5.1）：请确认它应判「不可判定」还是「按 (c) 降级」——不要在实现侧补判据。
5. **AC57 的往返**：测试覆盖了 suspend→resume；**自然跑完→B→回到 A** 的完整序列只有部分覆盖（`dispatch` 后 `sessions` 列出 A 为 idle 有测试，但"再 dispatch 回 A"未单测）。
