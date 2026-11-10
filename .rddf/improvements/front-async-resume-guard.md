# improvement: front-async-resume-guard

## Why

**异步派发面缺一条既有的安全判据**（实现缺口 + 验收缺口，**不是新决策**）。

`ADR-front-multi-backend` **D8.1** 已裁定「**只向空闲 session 投递**：目标在跑 ⇒ 拒绝」，**AC19** 已写明「对正在运行的后端 resume → 拒绝（不 steer 注入当前轮）」。但该判据**只落在同步 `delegate` 面**：

- 同步面：`lib/delegate-core.ts:1046` 用「最后一条消息时间 > 最后 idle」判 in-flight 并落 `outcome:"busy"`。
- 异步面：`dispatch` 路径（`lib/delegate-async.ts:800-940`）对 **resume 目标自身**没有任何活体判定；`claimSlot`（`:443-458`）在 reconcile 与占槽判定里都 `if (c.session_id === sessionID) continue` ⇒ 目标被排除在活体判定之外。

**后果**：① 违反 AC19（把新简报排进正在跑的会话）；② 在 `suspend(X)` 的停机窗口内并发 `dispatch(resume=X)` 会 ring 上游 doorbell ⇒ `settle` 时起后继 execution（`front-stop-confirmation` 的 D5 ③/⑥ 正是围绕这条）。

**为什么现在做**：`front-stop-confirmation` 只关闭「同 `workRoot` 正在停机」那一个窗口；**「目标正在跑、但没在停机」** 仍无守卫，而 AC19 早已定下。

**验收缺口**：AC19 在 `front-multi-backend` 验收里标 ✅，但证据只覆盖同步面 ⇒ 异步面从未被验。

## What Changes

### A1 判据：一个**具名析取谓词**，而不是「复用某一条现成判据」

现有代码里**有四个互不相等的活体判据**（这是本项最容易做错的地方）：

| # | 位置 | 现谓词 | 本项处置 |
|---|---|---|---|
| ① | `lib/delegate-core.ts:199-208` `isRunning(info, messages?)` | `(busy>0 ∧ (idle=0 ∨ busy>idle)) ∨ (busy===0 ∧ lastMsg>idle)` | **不改**（展示层口径，D4 定过） |
| ② | `lib/delegate-core.ts:245` `slotBusyHolders` / `lib/delegate-async.ts:421` `planSlot` | 调 `isRunning(info)` **不传 messages** ⇒ 第二级兜底永不生效 | **补 messages**（否则「陈 busy/无消息」形态漏判） |
| ③ | `lib/delegate-core.ts:1046` 同步 `delegate` | `lastMsg > idle`（无 busy 分支） | **改成 ④**（保留其「无 `busy===0` 前置」的优点） |
| ④ | 本项新增 `stillRunning(info, messages)` | **合取式**：`(busy>0 ∧ (idle=0 ∨ busy>idle)) ∨ (lastMsg > idle)` | 新增，供 ②③ 与异步面共用 |

**为什么必须是析取**：单用 `lastMsg > idle` 会漏「**无新消息的 wake 起的新 execution**」（`Started` 已投影、`busy` 已写，但还没有 assistant 消息）；单用 `isRunning` 会漏 **stale-busy**（`busy` 陈旧 `< idle`、且 `busy ≠ 0` ⇒ 第二级兜底不生效）。两者都不完备，合取才覆盖已知形态。

⚠️ **`ADR-front-multi-backend` D4 并没有授权「不加 `busy===0` 前置」**——D4 原文说的是「第二级兜底的前提是 `busy` 未定义或为 0；stale-busy **不被它覆盖**」。本项是**在其之上补一条更强的谓词**，需要在 change 的 design 里记录这个演进，不得引 D4 当作既有授权。

### A2 落点与副作用：一次 `get` 复用，零副作用

- 检查点钉在 `lib/delegate-async.ts:847` 的 `readSessionInfo(ctx, brief.resume_session)` **之后、`:854` 的 vanished 处置之前**（此处**尚未**写墓碑、尚未 create、尚未判全局上限）⇒ 拒绝时**零副作用**。
- **判定顺序写死**（避免误导性错误）：存在性（读失败 ⇒ 拒绝）→ 墓碑（拒绝，终态）→ `goal_key`（不一致 ⇒ 拒绝）→ **活体（在跑 ⇒ 拒绝）** → **停机守卫（`front-stop-confirmation` D2）** → 槽位/上限 → 投递。
- **拒绝文案固定前缀**（供 E2E 断言）：`无法向运行中的后端 <id> 追加简报`，后接可执行建议。

### A3 与停机守卫的关系：两段、一个函数、锁外取数

- 新增 `preAdmission(ctx, { stateRoot, workRoot, sessionID? })`：**锁外**取活体（`await ctx.session.context`）+ 读进程内停机标记；`claimSlot` **锁内**只重验标记。**活体判定不可放进 `withLock`**（`withLock` 是同步 `() => void`，见 `lib/delegate-async.ts` 文件头注释）。
- **两个判据并列、互不替代**；**同时命中时以停机守卫为准**，文案为「`X` 正在停机（由 front `<发起者>` 发起），请等它结束」——**不得**返回「请先 suspend 它」（否则模型会在超时上循环重试）。

### A4 读失败 / 已删

- 目标状态读不出来（原因不明）⇒ **拒绝**（不投递），文案说明「无法确认目标是否在跑」。
- **确认已删除**（上游 `NotFound`）⇒ 走既有 D12 矩阵（墓碑 + `outcome:"vanished"` + 同 `goal_key` 新建），**不**因本项改动而回退。
- **`NotFound` 优先于「读失败」**：两者可能先后出现（先 404 后网络错误）⇒ 判定顺序固定，避免死槽。

### A5 `dispatching` 态算不算「在跑」

**钉死**：`dispatching`（简报已投递、尚未确认消费）**算在跑**（其 `lastMsg > idle` 成立）⇒ 对其 `dispatch(resume=X)` **拒绝**（文案指向「它刚被派发、简报可能仍在排队，请用 `cancel` 或等它进入 `active`」）。⚠️ 这会改变现状（现状会接受并再排一份）—— 属**收紧**，需在 change 的 design 里显式记录。

### A6 并发两个 front / 连发两次

X 空闲时，两条 `dispatch(resume=X)` 都能通过 `claimSlot` 的自排除 ⇒ 两份简报到同一会话。本项**不**试图用新机制解决（那是单槽表的既有语义），但必须：
- 有用例**如实记录**该形态（两条都成功 or 第二条被拒，取决于是否同批引入的守卫）；
- 在 change 的 Notes 里写明「同会话并发 resume 不做串行化」的取舍。

## Acceptance

> AC 编号在 change 立项时回填；下列每条都要**能由命令/假 ctx 客观判定**。

**判据统一（A1）**

- [ ] 表驱动用例：同一输入集（busy>idle / busy 陈旧<idle 且 lastMsg>idle / busy 陈旧且无新消息 / 全空闲）⇒ **四个读者**（`isRunning`、`slotBusyHolders`、同步 `delegate`、异步 `dispatch`）结论**逐条一致**，且与 `stillRunning` 的期望表一致。
- [ ] **负向**：`busy` 陈旧 `< idle`、`lastMsg > idle` ⇒ 判**在跑**（防有人「简化」成单用 `isRunning`）。
- [ ] **负向**：`busy > idle`、无新消息 ⇒ 判**在跑**（防有人「简化」成单用 `lastMsg > idle`）。
- [ ] 同步 `delegate` 的**行为**不变：busy 拒 / 空闲放行 / `outcome:"busy"` 行 / 不 prompt（4 条回归）。

**落点与副作用（A2）**

- [ ] `dispatch(resume=X)` 且 X 在跑 ⇒ 拒绝，错误文案以固定前缀开头。
- [ ] 拒绝时**零副作用**：`ctx.session.prompt` 调用次数不变（fake ctx 计数）、`ctx.session.create` 次数不变、`pair.json` 该条目 `state`/`last_used_at`/`registered_at` 全部不变（**尤其不得**被 `claimSlot` 覆写成 `dispatching`）、`ledger.jsonl` **不新增**任何行（含 `dispatched` / `dispatch_failed`）、`countActiveBackends` 前后相等。
- [ ] `dispatch(resume=X)` 且 X 空闲 ⇒ 放行，行为与改动前逐字段一致。
- [ ] X 状态读失败（原因不明）⇒ 拒绝，文案说明「无法确认」；槽位与条目均不变。
- [ ] X 确认已删除 ⇒ 按 D12（墓碑 + `vanished` 行 + 同 `goal_key` 新建），不回退。

**交叉与边界（A3/A4/A5）**

- [ ] 停机守卫与活体判定**同时命中** ⇒ 错误文案为「正在停机 + 发起者」，**不含**「请先 suspend」字样。
- [ ] `delegate(resume=X)` 且 X 正在被 `suspend` ⇒ **被拒**（验证 `excludeSessionID` 不会把守卫排除）。
- [ ] `dispatching` 态 ⇒ 拒绝（A5），文案指向 `cancel` / 等待。
- [ ] `tombstone` 态 ⇒ 拒绝且文案为「已终止」（**不得**被活体判定抢先报「正在跑」）。

## Capabilities

修完后这些既有能力才名副其实：**AC19 在两个派发面都成立**、**D8.1「只向空闲投递」覆盖全部投递路径**、**`front-stop-confirmation` D2 的守卫与本项共同覆盖「运行窗口 / 停机窗口」两个准入面**。

## Impact

- **行为变化**：`dispatch(resume=X)` 在 X 正在跑 / `dispatching` 时**从「静默排队」变为「明确拒绝」**（收紧；原先会得到可能被 `suspend`/`cancel` 掉或在恢复时幽灵注入的 parked 简报）。
- **判据口径变化（逐条列出，不笼统说「不变」）**：`slotBusyHolders` / `planSlot` 补 messages 后，**「陈 busy 或刚起无消息」的占槽者可能从「空闲」变为「在跑」** ⇒ 同 `workRoot` 的既同步派发可能**更多被拒**（保守侧，可接受）；`sessions` 的 `running` 展示不变（①不改）。
- **不改**：`pair.json` schema、`state` 枚举、`delegate` 的**行为契约**（判据实现可共用，语义不变）。
- **规模**：实现 ≈ 1 个谓词 + `preAdmission` + 3 处调用点（`dispatch` / `claimSlot` 重验 / `slotBusyHolders`）；单测 ≈ +8（表驱动 4 + 副作用 4）；E2E +1。
- **未知/待钉**：`dispatching` 态的新语义（A5）会影响既有 E2E 的 `dispatch` 场景顺序 —— 需在 change 里确认不影响 L2-17/L2-18。
