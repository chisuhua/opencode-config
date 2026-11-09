# tasks: front-multi-backend

> 实施清单 + 状态（builder 维护）。判据来源：`proposal.md` 的 AC1–AC58（与 ADR Verification 1–49 映射）。
> 图例：✅ 已实现且有工具证据 ｜ ⚠️ 部分 ｜ ⛔ 未完成（附原因与路由）

## T0 前置

| # | 任务 | 状态 |
|---|---|---|
| T0.1 | **Phase 0 消费确认判据测量**（先于一切实现） | ✅ `.rddf/reviews/front-multi-backend-consume-probe.md`（16/16）。**结论：判据可靠 ⇒ 不降级** |
| T0.2 | 上游语义锚定：`delivery` 默认 steer | ✅ 探针 P5.1 + 源码 `prompt.ts:52` |
| T0.3 | 上游语义锚定：`get()` 在 run 中返回 `time.busy` | ✅ 实测（本轮补做）→ **解决 N7 的 Q2/R4 冲突：R4 正确** |
| T0.4 | 上游语义锚定：`session.list` 的 `search`/`directory` 过滤 | ✅ 探针 P2 |

## T1 核心库

| # | 任务 | AC | 状态 |
|---|---|---|---|
| T1.1 | `SlotState` / `GoalKey` 类型 + `isSlotState` / `isKebabSlug` | AC40 / AC15 | ✅ |
| T1.2 | 槽位纯函数：`slotOccupants` / `slotHolder` / `backfillPairEntry` | AC26 / AC40 / AC42 | ✅ |
| T1.3 | 活体判据 `isRunning`（三级取值源）+ `contextMessageIds` | AC21 / AC22 / AC44 | ✅ |
| T1.4 | `registerSession` 的 `extra`（`work_root`/`state`/`goal_key`） | AC9 / AC40 | ✅ |
| T1.5 | `readPairs` / `writePairs` / `writeRoleSession`（已持锁版本） | AC26③ | ✅ |
| T1.6 | `validateBrief` 接受 `goal_key`（可选但格式受检） | AC15 | ✅ |
| T1.7 | `slotBusyHolders`（两派发面共用） | AC50① | ✅ |

## T2 四工具

| # | 任务 | AC | 状态 |
|---|---|---|---|
| T2.1 | `dispatch`：create → 锁内 check+register → ledger → metadata → prompt → 消费确认 | AC5/AC6/AC7/AC9/AC26/AC30/AC44 | ✅ |
| T2.2 | `sessions`：只读名册 + 聚合 + 兜底扫全量（cursor 续扫） | AC4/AC10/AC11/AC29 | ✅ |
| T2.3 | `suspend`：按 state 六档分派 + 停机确认 | AC51/AC53 | ✅ |
| T2.4 | `cancel`：`interrupted:true` 才墓碑；false 纯 no-op | AC28 | ✅ |
| T2.5 | 消费确认 `waitBriefConsumed`（message id ∈ context id 集合） | AC44 | ✅ |
| T2.6 | 槽位生命周期 `planSlot`/`claimSlot`（锁外查询 → 锁内重验 → 锁内翻转） | AC26/AC46/AC47 | ✅ |
| T2.7 | 全局并发上限（`RDDF_MAX_ACTIVE_BACKENDS`，默认 3） | AC31 | ✅ |
| T2.8 | knowledge 不占工作树槽位、不计入上限 | AC32 | ✅ |
| T2.9 | **`stalled` 阈值**（默认 5min + `RDDF_STALLED_THRESHOLD_MS` 覆盖 + 单测；**推导态不落盘**） | AC25 | ✅ 本轮补齐 |
| T2.10 | **`slot.dangling` 用阈值判定**（占槽 + 不 running + 超阈值才为 true） | AC47③ | ✅ 本轮补齐 |
| T2.11 | **steer 残留检测**：`suspend` 记 `suspended_at_message_id`；resume 比对新增 `user`/`synthetic` ⇒ `none`/`suspected`/`undetectable` | AC54 | ✅ 本轮补齐 |
| T2.12 | **亡主接管**：归属另一个 front 时判其存活 —— 活 ⇒ 拒绝；亡 ⇒ 允许回收 + ledger `event:"taken_over"` | AC48 | ✅ 本轮补齐 |

## T3 既有路径

| # | 任务 | AC | 状态 |
|---|---|---|---|
| T3.1 | 既有 `delegate` 新增槽位检查（共用槽位表） | AC50① | ✅（⚠️ 见 design.md §4 的竞态窗口说明） |
| T3.2 | 既有 `delegate` 首登记 `active` / 终登记 `idle` | AC46① / AC50②③ | ✅ |
| T3.3 | 既有判据零回归 | AC33 | ✅ 205 pass |

## T4 配置与权限

| # | 任务 | AC | 状态 |
|---|---|---|---|
| T4.1 | 四个 action：全局 `deny` + `agent.front` `allow` | AC1/AC2/AC3/AC39 | ✅ `opencode debug agents` 实测 |
| T4.2 | 工具注册（同插件、同门控） | AC1/AC8 | ✅ |

## T5 测试

| # | 任务 | 状态 |
|---|---|---|
| T5.1 | `tests/delegate-async.test.ts`（**44** 条） | ✅ 本轮 +11（stalled/dangling/steer 残留/亡主接管/grant 救援） |
| T5.2 | 全量回归 | ✅ **216 pass / 0 fail** |

## T6 文档

| # | 任务 | AC | 状态 |
|---|---|---|---|
| T6.1 | `prompts/front.md`：四工具路由表 + dispatch≠完成 + 切换契约 + 同仓并行需备工作树 + 范围假设 + 旧措辞清除 | AC34/AC55/AC56 | ✅ |
| T6.2 | `docs/front-delegate-architecture.md`：§2.1 四工具 / §4.3 delivery=steer（「会排队」清除）/ §6.1 口径扩写 | AC35 | ✅ |
| T6.3 | `docs/dual-session-delegation.md`：`event` 字段 + `vanished` + `state` + 故障表 | AC36 | ✅ |
| T6.4 | `ADR-front-knowledge-capability` D5 行产生时机表 | AC36 | ⛔ **architect 归属**（ADR 内容，builder 不得单方面改） |
| T6.5 | **`docs/front-delegate-usage.md`（用户手册）**：§1 五工具 + 单槽性质 + 场景 G–J（并发 / 看进度 / 切换 / 放弃）+ 排障两行 + 范围假设 | — | ✅ 本轮补齐 |
| T6.6 | **`docs/front-delegate-testing.md`**：测试清单 157→216、补 `delegate-async.test.ts` / `canonical-root.test.ts` / `lib/delegate-async.ts` | — | ✅ 本轮补齐 |
| T6.7 | **`docs/front-delegate-architecture.md` §4.4 槽位模型（单槽）**：键/五态/常驻-活跃/切换/投递≠消费/翻转执行者/悬挂 + 锁形态；后续小节顺延至 4.8 | AC35④ | ✅ 本轮补齐 |

## T7 需外部条件 / 跨角色（⛔ 不得当通过）

| # | 任务 | AC | 原因 / 路由 |
|---|---|---|---|
| T7.1 | E2E bats 用例 L2-16..（真实 front 调用四工具、真实派发、连续 10 次时延） | AC1/AC5/AC8/AC44/AC11 | 外部仓库 `/workspace/main/rdd-workflow-e2e`，需另提交 commit + 记录 SHA |
| T7.2 | AC44 有界时延（连续 10 次，≥8 次 60s 内进 `active`） | AC44 | 需真实模型跑 10 次 |
| T7.3 | **AC13「已消失可见 + ledger 补记 vanished」** | AC13 | ⛔ **设计张力**：`list` 不返回已删 session ⇒ 兜底路径看不到它；而 ADR D2.1 否决了全局 registry。⇒ `design_drift` → **architect 决策**（见 design.md §5） |
| T7.4 | AC57 的「自然跑完 → B → 再回 A」完整序列 | AC57 | ⚠️ 部分（suspend→resume 已测；自然跑完→切回只覆盖了名册可见） |
| T7.6 | `docs/MULTI-AGENT-DESIGN.md` + `docs/CHANGELOG.md`（治理面）+ `ADR-front-knowledge-capability` D5 表 | AC35 / AC36 | ✅ **已完成**（architect，oracle + critic 双审：治理面判定 PASS-WITH-NOTES → critic APPROVE） |
| T7.7 | **D12 派发面处置矩阵的实现**：`dispatch(resume=已删)` ⇒ 旧条目墓碑 + 落 `outcome:"vanished"` + 同 goal_key 新建；`suspend`/`cancel` 对已删后端按矩阵返回（**不得**抛「无法定位」） | AC13 | ⛔ **未实现**（已正向验证：`suspend`/`cancel` 仍抛「无法定位后端…」，`dispatch(resume=已删)` 仍落 `dispatch_failed` 且保留槽位 ⇒ **死槽风险仍在**）。判定已定（ADR D12），实施排期由用户定 |
| T7.8 | AC36 余下两处同步：`docs/dual-session-delegation.md` 的 event 枚举补 **`taken_over`**；`prompts/front.md` 的 ledger 说明补 **`vanished`** 与 **`event` 字段** | AC36 | ⛔ **builder**（本轮由 oracle 审出，两份文档均是 builder 归属） |
| T7.9 | `proposal.md` 的 **AC4 脚注**旧表述「reconcile 会写行（AC13）」修正 —— 与 ADR V08 的修正及 D5 新增的「reconcile 不写 ledger」注**直接矛盾** | AC4 | ✅ **已完成**（planner；顺带修 AC4 里「允许写 ledger（补记终态行）」的说法——观测面按 D12 已**不补记** ledger） |
| T7.10 | **AC13 判据按 ADR D12 改写**（五段：观测面不列不补记 / 派发面处置 / 终止-暂停矩阵 / 痕迹 / 读侧语义）；映射表 V09 行同步；新增 N18（能力边界）+ N19（实现尚未落地 ⇒ ②③ 段判「不可判定」） | AC13 | ✅ **已完成**（planner；改写 8 行 / 320 行 = 0.03 ⇒ 未达 metis 的 1/3 门槛，不触发审查） |
| T7.5 | AC35 的 §2.1 ASCII 全景图箱体对齐 | AC35 | ⚠️ 纯格式，改文字后可能不齐 |
