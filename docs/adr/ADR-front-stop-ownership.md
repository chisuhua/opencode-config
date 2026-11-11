# ADR-front-stop-ownership — 槽位释放的授权模型：代号条件化 + 跨实例前提与 tripwire

| 字段 | 值 |
|------|-----|
| Status | **Accepted**（2026-11-11 用户签批（指令：「请根据你的推荐进行实施」）；oracle 1 轮 + **critic 3 轮**：第 1 轮 REJECT（3 BLOCKER）→ 第 2 轮 REJECT（B2/B3 闭合、新 BLOCKER 1 个=文档内动作混写，机械核对后闭合）→ 第 3 轮 REJECT（三处口径修订**未同步到汇总位**：D3 表 / Verification / AC 绑定 ⇒ 已按意见订正；**未开第 4 轮**（预算：每 ADR ≤ 2 轮 + 1 次复审），订正后由 architect 自检 + 用户抽阅）。第 1 轮 7 SHOULD_FIX、第 2 轮 8 SHOULD_FIX/5 NITS、第 3 轮 4 SHOULD_FIX/3 NITS **全部落实**；审稿记录 `.rddf/reviews/adr-front-stop-ownership-review.md`） |
| Date | 2026-11-11 |
| Author | architect |
| Parent | **部分取代** `ADR-front-stop-confirmation` **D1 条件③ 的分支结构**（`running0=false ⇒ 无附加要求`）——**仅在「检测到多实例部署」时**取代（等价于父篇选项表 **B4**，本篇选项表 **C8** 登记其重新采纳与理由）；**单实例口径不变**。**不取代** `ADR-front-multi-backend`（D7/D11.2 的「锁内重验后再翻转」**继续有效**，本篇把它从「重验状态」补全为「重验**授权**」；**D12 矩阵不变**）；**不取代** `ADR-front-stop-confirmation` 的 D1 判据本体与 D2 进程内守卫；⚠️ 父篇 **Verification S7b**（「`wait` 可用 ⇒ `stop_judge:"wait"`」）**仅在严格模式的 `running0 = false` 分支**不成立（改判 `"degraded"` + `foreign_instance:true`）；`running0 = true` 分支仍为 `"wait"` |
| 关联 change | `openspec/changes/archive/2026-11-11-front-stop-ownership/`（2026-11-11 立项 → **实施完成并归档**；AC1–AC18）。improvement：[`front-stop-ownership.md`](../../.rddf/improvements/front-stop-ownership.md) |
| AC 映射 | **AC1–AC14 ↔ S1–S14（同号）** + **AC15–AC18**（metis gap 分析新增的**实施期判据**：授权判定顺序 / 写者与锁边界 / tripwire 身份与容错 / 返回契约一致性）——见 `openspec/changes/archive/2026-11-11-front-stop-ownership/proposal.md` 的「AC ↔ ADR Verification 映射」段 |
| 前置事实 | 上游 opencode **v2.2.5**（运行中的 `opencode --version`）；本篇的上游断言全部锚定 v2.2.5 源码，并由 `scripts/check-upstream-anchors.sh` 回归（**19/19 全绿**，对运行版本 v2.2.5）。⚠️ 本机 `/workspace/project/opencode` 的 checkout 是**开发 commit**（包版本 2.1.2）⇒ 锚点须用 `git archive v2.2.5` 导出后再跑 |

## 背景与问题

`ADR-front-stop-confirmation`（Accepted）把「停机」定义成 `wait` + 判活 + 水位线三条件合取，并加了**进程内**准入守卫；其 D5⑥ 明确登记：**「`claimSlot` 通过之后、`prompt` 之前」的窗口未关闭**，「根治需把『准入 + 投递』做成不可分割的写侧动作（另立 change）」。

本轮评估（oracle 1 轮 + 两个只读探针 + 上游 v2.2.5 源码核对）把该残余拆成**三件不同性质的事**：

### ① 实现偏离已签批 ADR

- `ADR-front-stop-confirmation` **D1 ⑧**：「全部通过 ⇒ **锁内重验条目仍是 active** ⇒ 释放槽位并置 suspended」。
- `ADR-front-multi-backend` **D11.2**：「异步动作在锁外，**锁内重验后再翻转**」。

实现却是**无条件写**：`lib/delegate-async.ts` 的 `updateSlotState` → `setSlotState`（读改写，**无前置条件**），`suspend` 的释放与 `cancel` 的墓碑都走它。

**探针实证**（`/tmp/opencode/probe/probe-cross-instance-claim.ts`，隔离实验：停机窗口内让「另一进程的 claim 已落盘」⇒ 条目 `dispatching`）：

```
①' 模拟另一进程的 claim 落盘 → X.state = dispatching
suspend → suspended=true judge=wait
② 释放后 X 的 state = suspended      ← 覆盖了更新的 claim（lost update）
③ Y 被准入 ⇒ 同工作树出现两个写入者
```

### ② 两个「可见性轴」：准入轴与 execution 证据轴

| 轴 | 同进程/同实例 | 跨进程 / 跨实例 |
|---|---|---|
| **轴① 准入可见性**（停机守卫） | 模块级 `Map` ⇒ **可见** | 另一进程有自己的 `Map` ⇒ **不可见**（但 `pair.json` 是共享的 ⇒ 槽位表仍跨进程原子） |
| **轴② execution 证据**（`ctx.session.wait`） | `awaitIdle` 查本进程 `executions` Map ⇒ **有效** | 查不到 ⇒ **必然立即返回**（本仓实测 3ms）；上游 `run-coordinator.ts:66` |

⇒ 跨实例下可出现**不需要任何并发 dispatch** 的假停机：`time.busy` 是 `Execution.Started` 的**投影**（上游 `projector.ts:793`，跨实例可见但**滞后**）⇒ 新起的 execution 尚未投影 ⇒ 判活为假 + `wait` 空转 ⇒ **释放槽位** ⇒ 后端随后起来写工作树 ⇒ 同工作树两个写入者。

### ③ `cancel` 与两篇 ADR 的张力（**本篇不解决**）

`ADR-front-multi-backend` D7.3 把「`cancel` 旧条目 → `dispatch` 新后端」写成**强制接管（推荐恢复路径）**；但 `cancel` 只看 `interrupt` 的返回值就释放槽位，而 `ADR-front-stop-confirmation` D1 明说**该返回值不是停机判据**。**这是契约级变更**，本篇**只登记为 backlog**（选项表 C7）。

## 决策

**「`suspend`/`cancel` 的释放」= 一次**授权**：在锁内证明「我要释放的那份槽位**仍然是我判读时的那一份**」，否则不释放。跨实例的残余不靠插件侧加锁解决，而是把「单实例」从**约定**变成**前提 + 机器化 tripwire + 严格判据**，根治所需的上游能力登记为 feature request。**

### D1 授权模型：代号条件化（`claim_gen`）+ 锁内重验

**适用范围（写死）**：
- **代号校验（`claim_gen`）适用于「会话仍存在」的释放路径**（`suspend`/`cancel` 打到活着的后端）—— 归属已变 ⇒ 不释放（此时槽位**有别的占者**，不死槽）。
- **已删路径（`NotFound` 正面证据）不做代号校验**：该路径的**风险方向相反** —— 会话已被删除 ⇒
  **不可能是活着的写者**；而真正的占槽者若存在，必是**另一个 session id**（自己的条目）⇒
  代号校验在那里**零保护**，却会引入「拒绝释放 ⇒ 死槽」的新风险。⇒ **已删路径一律按父篇 D12 处置**（死槽避免优先）。
- **判读之后才发现已删**（快照之后 `wait` 才抛 `NotFound`）⇒ 走**已删路径**（D12 处置）⇒ 同上，**不做**代号校验（理由见上一条）。
- **已删后端**（`NotFound` 正面证据）按**父篇 D12 矩阵 + `ADR-front-stop-confirmation` D3 处置**（矩阵逐动作措辞见 `ADR-front-multi-backend` Verification **V09**「终止 / 暂停面」段；**本篇不改一个字**）⇒ **D12 矩阵无需修订**，父篇 S5 / V09 继续有效。

`pair.json` 的条目新增**一个整数计数器** `claim_gen`（**不是**状态枚举 ⇒ 不参与 D12 矩阵、不引入新状态）：

- **谁会 bump（原则 + 落点）**：**原则**：**任何改变槽位归属的写都 bump；良性写不 bump** ⇒ **`claim_gen` = 该条目「归属版本」**。
  - **bump 落点（写死）**：bump 发生在**状态翻转的写路径**上（`claimSlot` 的认领登记与 reconcile 翻转、消费确认置 `active`、授权释放置 `suspended`/`tombstone`、同步 `delegate` 的认领与收尾）⇒ **不依赖「写者清单」枚举是否穷举**。
  - **已删路径的释放也 bump**（它同样是归属变更）⇒ 「任何归属变更都让旧快照失效」在这些路径上同样成立。
- **谁**不** bump（良性写）**：字段回填（`suspended_at_message_id` / `steer_residue`）、`sessions` 的 backfill、metadata 同步 ⇒ **不改变归属** ⇒ 不 bump（否则一次无害回填就会误伤正在进行的释放）。
- **写者纪律**：任何写者**必须保留并按需 bump** `claim_gen`，**不得整条替换条目对象而丢弃 `claim_gen`**（`registerSession` 当前是**固定字段重建** ⇒ 必须改为保留 `claim_gen`；计数器**不得回退/重置**）。
  ⚠️ **附带变化（登记）**：把 `registerSession` 改成保留式写后，`suspended_at_message_id` / `steer_residue` 也会**被保留**（D9 的 steer 基线语义**增强**，不丢基线）⇒ 属**预期**变化，不得被当成回归。
- **快照点（写死）**：`suspend`/`cancel` 在**判读条目时**（工具入口的 `locateBackend` 读，`state`/`claim_gen` 一并取）记下 `G`。⇒ 判读之后发生的任何**归属变更**（认领、reconcile 翻转、他人释放）都会让 `G` 失效 ⇒ 拒绝释放。**良性写不失效**。
- **授权释放（锁内，同一次 `.role.lock` 临界区）**：必须**同时**满足：
  1. 条目仍存在；
  2. `claim_gen == G`（**归属未被变更**）；
  3. 状态是**预期的那一个**：`suspend` 要求 `active`；`cancel` 要求 `active` 或 `dispatching`。
  ⇒ 任一不满足 ⇒ **不改写、不释放**，返回**分开的 reason**：
  - `slot_reclaimed`（`claim_gen` 不符 ⇒ 归属已被别人认领），
  - `slot_state_changed`（状态不符，且**不是** `idle`/`suspended` ⇒ 状态被并发改写），
  - `slot_entry_gone`（条目消失），
  - `slot_already_released`（状态已是 `idle`/`suspended` ⇒ **幂等 no-op**，非失败）。
  ⚠️ 文案**不得**声称「被他人占用」，除非确有占者（`slot_reclaimed` 才有占者语义）。
- **`reason` 字段的词汇与优先级（写死）**：同一个返回字段承载两类失败 ⇒ 必须可区分。
  - **授权类**（释放被拒）：`slot_reclaimed`（归属已被别人认领）/ `slot_state_changed`（状态被并发改写）/ `slot_entry_gone`（条目消失）/ `slot_already_released`（已是 `idle`/`suspended` ⇒ 幂等 no-op，非失败）。
  - **证据类**（停机判不出来）：`wait_no_op`（两个观测矛盾）/ `wait_timeout` / `degraded_no_evidence` / `still_running` / `unreadable` / `missing`（后端已删 ⇒ 走 D12）。
  - **优先级**：**授权类优先**（归属已变是更根本的原因）⇒ 两者同现时只报授权类。
    ⚠️ **例外**：**已删路径**（D12 处置）**不适用**本优先级规则 ⇒ 「已删 + 代号不符」按 D12
    正常处置（返回 `missing` / `vanished`），**不得**返回 `slot_reclaimed`（那会拒绝释放 ⇒ 死槽）。
  - ⚠️ **不得**新增未在本表列出的 `reason` 取值（父篇已有取值：`missing`/`wait_timeout`/`degraded_no_evidence`/`still_running`/`unreadable`）。
- **释放与字段回填必须同一临界区**：授权释放（状态翻转）与 `suspended_at_message_id`/`steer_residue` 的回填**在同一次锁内完成** ⇒ 杜绝「只写一半」的路径。

**为什么代号比「只看状态」强**：状态可以**回到原值**（`active → dispatching → active`：另一路 resume 认领后又确认消费）⇒ 只查状态会漏掉「更新的 active」；归属版本单调 ⇒ 任何归属变更都让旧快照失效。

**为什么代号比「跨进程锁」强**：代号是**既有条目上的一个整数**（不新增持久化中间态 ⇒ 父篇 B6 否掉的「崩溃即死槽」整类风险不适用）、**不新增锁**（无嵌套锁序、无 stale-break、无外部调用入临界区）、**跨进程**（`pair.json` 本来就在 `.role.lock` 下）。

**代号不是万能**：它只保证「**释放**不会误伤别人的认领」；它**不能**阻止「上游在 `interrupt` 之后自己起后继 execution」（复活）—— 那是父篇 D9 登记的**上游语义**，本篇不假装能关（D3 ⑤）。

### D2 跨实例：前提 + tripwire + 严格判据（不假装可解）

- **前提（写进决策）**：本篇的停机保证以「**单 `opencode serve` 实例**」为前提（与父篇 `ADR-front-stop-confirmation` D1 的成立假设一致）。多实例部署下，`wait` 空转 ⇒ 判据退化为 DB 级证据。
- **tripwire（机器可判）**：每个插件进程在 state dir 写一枚**实例戳** `.rddf/state/.instance-<pid>-<uuid>.json`（含 `pid` / `host` / `started_at`）。
  - **写**：**首次工具调用时**写（插件 `setup` 阶段不写盘）；每次工具调用**刷新**该戳的 mtime（`utimes`；文件被删 ⇒ 重建，绝不抛错）。
  - **删**：进程退出时删（best-effort）；进程被 `SIGKILL` ⇒ 残留 ⇒ 由「pid 已死」自然判死。
  - **判活（关键）**：**同 host 且 `pid` 存活**（`process.kill(pid, 0)`；`EPERM` ⇒ 视为存活）⇒ 存活；跨 host ⇒ 视为存活（保守）。
    ⚠️ **不以 mtime/TTL 判死**：TTL 会把「**活着但空闲**（60s 无工具调用）的实例」判成死 ⇒
    **多实例被当成单实例** ⇒ 正是本篇要防的假停机方向。⇒ TTL/mtime 只用于**诊断**，不参与判定。
  - **去重**：存活计数按 **`(host, pid)`** 去重 ⇒ 同一进程在多个 location 各加载一次插件（会写出多枚戳）**不得**被判成多实例。
  - **人工清理入口**：删掉 `.rddf/state/.instance-*` 即可（跨 host 的远端残戳是唯一需要人工清理的情形）。
  - **触发**（检测到 ≥2 存活戳）⇒ 判定多实例部署 ⇒ ① 落 `event:"foreign_instance"` 的 ledger 行（**每次 `suspend` 触发都落一行**，便于计数与定位）；② `suspend` 切**严格模式**；③ `suspend` 返回值带 `foreign_instance: true`。
- **严格模式**：多实例下 `wait` 不提供任何 execution 级证据 ⇒ `running0 = false` 时**也要求水位线前移**（等价于父篇选项表 **B4**，见选项表 C8 的重新采纳登记）。
  ⚠️ **作用域扩到 `cancel`**（`ADR-front-cancel-release` D1⑦/D6）：多实例下 `cancel` **同样**要求水位线前移 ⇒ 严格模式不再是 `suspend` 专属。
  ⚠️ **偏离登记（`ADR-front-cancel-release` D4）**：严格模式新增 **per-call `force:true`** 通道（`cancel` 侧）⇒ **本篇 S9 的「不可赎回」限定为 env 通道**（`RDDF_SUSPEND_ALLOW_DEGRADED=1` 在严格模式下**仍不生效**）；per-call 通道**逐次可见 + 落盘可审计**，且**必须**带 `foreign_instance:true` + `strict_mode:true`。
  - **`stop_judge` 词汇（不扩展父篇枚举）**：严格模式的取值**按分支**定：
    - `running0 = false`（无 execution 级证据可用 ⇒ 严格模式要求水位线前移）⇒ `stop_judge: "degraded"`（与父篇 D4 的退化族同义）+ 额外字段 `foreign_instance: true`；
    - `running0 = true`（基线在跑 ⇒ `wait` 的证据**有效**）⇒ **保留** `stop_judge: "wait"`（**不得**误报 degraded）。
  - **严格模式下 `RDDF_SUSPEND_ALLOW_DEGRADED=1` 不生效**（有意为之）：D4 的退化是「**端点缺失**」（可由环境变量显式承担风险），而严格模式是「**已知存在另一实例**」⇒ 风险不可用环境变量赎回。⇒ **这是与 D4 的显式差异**。
- **前端文案必须同步（本篇决策的下游义务）**：父篇的「`stop_judge:"degraded"` ⇒ 用 `cancel`」在**严格模式**下三条全不成立（`wait` 可用但空转；不可赎回；空闲后端的 `cancel` 是纯 no-op）⇒ `prompts/front.md` 与 `docs/front-delegate-usage.md` 必须改写该分支的文案：**不得**在严格模式（或 `wait_no_op`）下建议「用 `cancel` 释放空闲后端」。
- **矛盾检测（轴②的可判定子集）**：`wait` 有界返回 **∧** 判活为真 ⇒ 两个观测**互相矛盾** ⇒ `wait` **没有提供任何信息** ⇒ reason 记 `wait_no_op`（**不是** `still_running`）⇒ 文案同时给出「可能仍在跑」与「若为多实例部署请用 `cancel`」两个出口，**不得**只说「再试一次」（否则模型会循环重试）。⚠️ 「用 `cancel`」这条出口**只对「判活为真」（后端确实在跑）的子情形成立**；空闲后端的 `cancel` 是 no-op ⇒ 文案须限定子情形。
- **证据分级（跨实例可见 vs 仅本进程）**：

  | 证据 | 可见性 | 跨实例可用 |
  |---|---|---|
  | `ctx.session.wait` 返回 | **仅本进程/实例**（`executions` 是进程内 Map） | ❌ 空转 |
  | `interrupt` 是否跨实例生效 | **未核对** | ⚠️ 本篇**不依赖**（停机判据不采信其返回值） |
  | `time.idle` 前移（严格单调 `max(time, prev+1)`） | **DB 级**（跨实例可见） | ✅ **唯一正面终态证据** |
  | `time.busy`（`Execution.Started` 投影） | DB 级但**滞后** | ⚠️ 只能否定，不能肯定 |
  | `time_suspended`（write-ahead 停机声明） | DB 级 | ❌ **不在 `Session.Info` 里** ⇒ 插件不可见（见 feature request） |

### D3 关闭范围（写死，避免读者高估）

| # | 形态 | 状态 |
|---|---|---|
| ① | 实现偏离：「锁内重验」缺失 ⇒ 释放覆盖别人的新认领 | **关闭**（D1） |
| ② | 跨进程：另一进程在停机窗口内认领 ⇒ 释放被**拒绝**（旧行为是「被无条件释放覆盖」） | **关闭**（D1：归属版本跨进程有效） |
| ③ | 跨实例：投影滞后 + `wait` 空转 ⇒ 假停机 | **缩小**（D2 tripwire + 严格模式）；**未根治**（需上游） |
| ④ | 跨进程：`wait` 空转 ⇒ 判据退化 | **如实保留**（前提已写死） |
| ⑤ | 上游复活：`interrupt({resume:false})` 不删 pending 行 ⇒ settle 起后继 execution | **未关闭**（父篇 D9 的上游语义）；缓解仍是释放后复检（`stop_raced` 留痕） |
| ⑥ | 父篇 D5⑥ 的「准入已过、`prompt` 未投」窗口 | **未关闭**（根治需上游原子原语，见 feature request） |
| ⑦ | `cancel` 的释放不校验停机证据 | **已关闭**（`ADR-front-cancel-release`：**Accepted**，本篇**结案**该项；实现见 `openspec/changes/archive/2026-11-11-front-cancel-release/`） |
| ⑧ | 已删后端 × 各 `state` 的 D12 处置 | **动作不变**（父篇矩阵逐动作不动）；该路径**不叠加代号校验**（死槽避免优先，见 D1 适用范围） |
| ⑨ | 同步 `delegate` 的 `registerSession` 整条重建条目 ⇒ 归属版本被清零 | **关闭**（D1 的写者纪律：保留并按需 bump） |
| ⑩ | **多实例下空闲后端无直接释放动作**（严格模式要求水位线前移） | **部分关闭**（`ADR-front-cancel-release` D6：多实例下可用 `cancel(X, {force:true})` ⇒ **直接释放动作存在**；⚠️ **被 `cancel_pending` 钉住时，reconcile 顺带释放这条出口不可用**）——**其余部分未关闭**（**新增代价**，非既有形态）：实际出口是下一次 `dispatch` 的 reconcile 顺带释放；若该后端在另一实例确实在跑 ⇒ 工作树被**正确**占住 |

## 选项对比表

| # | 方案 | 结论 | 理由 |
|---|---|---|---|
| C0 | 维持现状（无条件写 `state`） | 否 | 与两篇已签批 ADR 的「锁内重验后再翻转」**直接冲突**；探针已复现覆盖别人的新认领 |
| **C1** | **归属版本条件化（`claim_gen`）+ 跨实例 tripwire** | **采用** | 关掉①②⑨；跨实例残余**如实显式化**而非假装可解；单字段 + 锁内比对 ⇒ 崩溃安全、无新锁、无新状态枚举 |
| C2 | 跨进程异步锁（持锁跨越 `claim`→`prompt`） | 否 | 临界区含**不可控外部调用**（`prompt` 可能长时间不返回）⇒ repo 级 `.role.lock` 排队、10s 超时会让**无关 worktree** 的写失败；30s stale-break 会让锁在最需要时**静默失效**；且 `withLock` 是同步的（锁内不能 await）⇒ 需另写异步锁并新增 worktree↔role 嵌套锁序。**收益为零**：槽位表本来就跨进程原子，而它关不掉「复活」与「跨实例假停机」 |
| C3 | TTL 租约标记（`stopping_until`） | 否 | 把「响亮的死槽」换成「**静默的双写者**」：front 进程崩了**后端不会跟着死**，TTL 过期后下一个派发占槽 ⇒ 后端还在写而槽已空；且它仍是「否定性断言」问题（TTL 过期本身就是假停机生成器） |
| C4 | 只做「状态重验」（`state === active`） | 否 | 状态可以**回到原值**（`active → dispatching → active`）⇒ 漏掉「更新的 active」；归属版本单调，覆盖该形态 |
| C5 | 持久化 `suspending` 态 | 否 | 父篇 B6 已否：需崩溃恢复规则 ⇒ 进程在停机窗口内死掉即死槽 |
| C6 | 直读上游 SQLite 用 `time_suspended` | 否 | schema 耦合 + 跨版本必碎，违背「只经插件 ctx」边界（父篇已排除）⇒ 转为**上游 feature request** |
| C7 | `cancel` 也复用停机判据（墓碑是否保留槽位） | **另立** | 契约级变更（front 的恢复路径与文案都要改）⇒ 单独 change + 单独决策，**不在本篇夹带** |
| **C8** | **父篇 B4（`running0=false` 也一律要求水位线前移）的重新采纳** —— **仅多实例** | **采用（条件性）** | 父篇否决 B4 的理由是「空闲后端水位线不动 ⇒ 必然超时 ⇒ 最常见的『挂起一个空闲后端』必然失败」。该理由**在本篇的条件下被接受为代价**：跨实例下 `wait` 不提供任何 execution 级证据，唯一正面证据只剩 DB 级 `time.idle` ⇒ 不要求水位线就等于**假停机** ⇒ **宁可失败**。⇒ 单实例口径**不变**（父篇分支结构继续有效） |

## 后果 / 代价

**正面**

- ①②⑨ 关闭：释放**不再**可能覆盖别人的新认领 ⇒ 「同工作树两个写入者」在这三条路径上不可达。
- **不新增持久化中间态**：`claim_gen` 是**既有条目上的整数**，不是新状态 ⇒ 父篇 D6.3 / D12 矩阵**无需修订**，崩溃不留需要恢复的中间态。
- 跨实例从「**不可见**」变成「**可见且降级**」：tripwire 触发 ⇒ 落 ledger + 严格模式 + front 可见。

**负面 / 代价**

- **多实例下 front 无法用 `suspend` 显式释放一个空闲后端**（严格模式要求水位线前移，而空闲后端的水位线不动 ⇒ 必然失败）。**准确的实际形态**（**不**是「只能 cancel 兜底」）：
  - `cancel` **不是**兜底：空闲后端 `interrupt` 返回 `interrupted:false` ⇒ 此时 `cancel` 是**纯 no-op**（不墓碑、不释放；实现 `lib/delegate-async.ts` 的 cancel 分支「`interrupted:false` ⇒ 纯 no-op」）；
  - 实际出口 ①：**下一次 `dispatch` 的 reconcile** 会把「`active` 且**判活确认为 `false`**」的条目翻成 `idle`（实现判据是 `busyOf[sid] === false`；`busyOf` 缺失（`undefined`）时**不**翻转）⇒ **顺带释放**（自动发生；reconcile 用 `{...条目, state:"idle"}` ⇒ **保留** `suspended_at_message_id`，D9 的 steer 基线不丢）；
  - 实际出口 ②：若该后端在另一实例**确实在跑**（`time.busy` 跨实例可见 ⇒ 判活为真）⇒ reconcile **不**翻 ⇒ 工作树**被正确占住**（保守但正确，不是 bug）。
- **`pair.json` 条目多一个字段** ⇒ 所有读条目的地方要容忍缺省（旧文件没有该字段 ⇒ 读作 `0`）。
- **归属版本的写者纪律是硬约束**：任何**整条替换条目**的写入（当前 `registerSession` 就是）都会让计数器回退 ⇒ 后果是「旧快照重新匹配」⇒ lost update 复活。⇒ 必须有**回归断言**（Verification S11）而不是只靠评审。
- **tripwire 是启发式的**：覆盖「同 state dir 有 ≥2 个存活 `(host, pid)`」——**同一进程**的多个 plugin 副本**不会**被检出（按 `(host, pid)` 去重）；只有**跨进程**副本才会。真问题是**跨 host 残戳 ⇒ 永久假阳性**（⇒ 严格模式长期钉住 ⇒ 空闲后端的 `suspend` 持续失败 ⇒ 人工删戳是唯一出口）；同 host 的崩溃残留**零窗口**（死 pid 即判死）。
- **`interrupt` 的跨实例语义未核对** ⇒ 严格模式下的「等水位线前移」实际是「等对方**自然跑完**」⇒ 多实例下 `suspend` 的语义更接近「等它结束」而非「打断它」⇒ 该差异必须如实告知 front（文案）。

**风险**

- **跨实例假停机（③）未被根治**：tripwire 只是把它**变成可见 + 降级**。**接受理由**：插件侧没有跨进程原语可用（C2/C3/C6 均被否），根治需上游（D2 的 feature request）。
- **上游复活（⑤）**：父篇 D9 的语义，本篇不假装能关。
- **锁的 stale-break（30s）**：极端情况下 `.role.lock` 会被另一进程删掉并进入 ⇒ 授权比较可能失真（同父篇已有的锁风险，本篇不新增）。

## Verification（可勾选验收判据，前瞻）

> 每条必须**客观可判**（命令 / 假 ctx / 落盘字段 / ledger 行）。编号供 change 的 AC 映射引用（**同号**）。

**授权模型（D1）**

- [ ] **S1 归属版本递增**：一次认领（`claimSlot`）后条目 `claim_gen` 严格大于认领前；**良性写**（字段回填 / `sessions` backfill）后 `claim_gen` **不变**。
- [ ] **S2 代号不符 ⇒ 不释放**：假 ctx 在「判读之后、释放之前」让另一路认领落盘（`claim_gen` 变化）⇒ `suspend` **不得**释放槽位；返回 `suspended:false` + reason `slot_reclaimed`；条目仍在**当前占者**名下（不得被改写）。
- [ ] **S3 状态不符 ⇒ 不释放**：条目已被置 `dispatching`（另一路 resume 在途）⇒ `suspend` **不得**释放槽位（reason `slot_state_changed`）。
- [ ] **S4 良性写不误伤**：判读与释放之间只发生**字段回填**（`setPairFields` / `sessions` backfill）⇒ `suspend` **仍可**正常释放（不得出现 `slot_reclaimed`）。
- [ ] **S5 `cancel` 同样条件化**：代号或状态不符 ⇒ `cancel` **不得**置墓碑、**不得**释放槽位，并返回明确 reason（不得静默）；`idle`/`suspended` ⇒ 幂等 no-op（`slot_already_released`）。
- [ ] **S6 无新状态枚举**：`pair.json` 的 `state` 取值仍在五值枚举内；`claim_gen` 是整数且**不**参与任何状态判定。
- [ ] **S7 已删路径与改动前逐字一致**：父篇 D12 矩阵各组（已删 × `dispatching`/`active`/`idle`/`suspended`/`tombstone`）的 `suspend`/`cancel` 处置**与改动前完全一致**（逐字比对父篇 V09「终止 / 暂停面」段）⇒ 父篇 S5 / V09 仍成立。⚠️ 已删路径**不做**代号校验（死槽避免优先；已删会话不可能是活写者 ⇒ 校验零保护）。

**跨实例（D2）**

- [ ] **S8 tripwire**：state dir 出现 **2 个存活 `(host, pid)`** ⇒ `suspend` 走**严格模式**（`running0=false` 也要求水位线前移 ⇒ 空闲后端**不被释放**）+ 落 `event:"foreign_instance"` ledger 行 + 返回值带 `foreign_instance:true`；`stop_judge` 按分支：`running0=false` ⇒ `"degraded"`，`running0=true` ⇒ 保留 `"wait"`。
- [ ] **S9 严格模式不可赎回**：`RDDF_SUSPEND_ALLOW_DEGRADED=1` 在严格模式下**不生效**（不得出现 `degraded-forced`）。
- [ ] **S10 矛盾检测**：`wait` 立即返回**但**判活为真 ⇒ reason 为 `wait_no_op`（**≠** `still_running`）、未释放槽位、文案同时给出「可能仍在跑」与「多实例部署请用 `cancel`」两个出口。
- [ ] **S11 戳的生命周期**：进程退出删戳；**存活判定 = 同 host 且 pid 存活**（**不依赖 TTL** ⇒ 同 host 的崩溃残留（死 pid）**立即**判死、**零**误判窗口）；跨 host 视为存活（⇒ 残戳需**人工**清理）；`utimes` ENOENT 时重建；mtime 在未来按存活。

**不变量与回归**

- [ ] **S12 归属版本不回退**：同步 `delegate` 走 `registerSession`（**整条重建条目**）之后，条目的 `claim_gen` **不得**下降（必须保留并按需 bump）。
- [ ] **S14 前端文案**：严格模式 / `wait_no_op` 下，`prompts/front.md` 与 `docs/front-delegate-usage.md` **不得**建议「用 `cancel` 释放空闲后端」（`cancel` 对空闲后端是 no-op）；且必须给出「可能仍在跑」与「多实例部署」两个可区分的出口。
- [ ] **S13 单槽不变式 + 回归**：任意路径下，同一 `work_root` 的 `state ∈ {active, dispatching}` 条目 **≤ 1**（可作 CI 断言）；单测全绿；E2E L2-19 / L2-20 / L2-22 / L2-23 全绿；`suspend` 的**空闲路径**不明显变慢（相对改动前实测 +1.5s 内）；`scripts/check-upstream-anchors.sh` 对 **v2.2.5** 全绿（**19/19**）。

## 实现约束（不属于决策，但会误导实现，先写死）

- **锁内不能 await**（父篇 D11.2）⇒ 授权释放必须写成「锁外读快照（含 `claim_gen`）→ 锁内**同步**读改写 + 比对」；比对失败**不得**在锁内做异步补救。
- **`claim_gen` 的缺省**：旧 `pair.json` 没有该字段 ⇒ 读作 `0`；**第一次写**时补齐（不得因为缺省而拒绝释放）。
- **归属版本是条目级、不是工作树级**：工作树级版本无法区分「同一后端被重新认领」与「另一个后端占槽」。
- **释放 + 字段回填同一临界区**：授权释放与 `suspended_at_message_id`/`steer_residue` 的回填在**同一次锁内**完成。
- **写者纪律**：所有写 `pair.json` 条目的路径都**必须**保留 `claim_gen`；**禁止**整条替换条目对象（`registerSession` 需改）。
  ⚠️ **扩展到 `cancel_pending`**（`ADR-front-cancel-release` D3④）：`cancel_pending`（被拒绝的 `cancel` 的钉住标记）与 `claim_gen` **同等保留义务** ⇒ `registerSession` 的整条重建**不得**丢掉它（丢掉 ⇒ reconcile 的「不得自动放行」保护静默失效 ⇒ 双写者从后门回来）。
- **`cancel` 的边界**：本篇只给 `cancel` 加**授权校验**（不符 ⇒ 拒绝）；**其停机证据要求已由 `ADR-front-cancel-release` 规定**（C7 已在该篇结案）⇒ 实现依据以该篇为准。

## 已排除的替代方案

- **跨进程异步锁（C2）**：见选项表 —— 临界区含不可控外部调用 ⇒ 锁超时/stale-break/嵌套锁序三重风险，而对「复活」与「跨实例假停机」**零收益**。
- **TTL 租约（C3）**：见选项表 —— 把死槽换成静默双写者。
- **只做状态重验（C4）**：状态可回到原值 ⇒ 漏形态。
- **直读上游 SQLite（C6）**：父篇已排除；转为**上游 feature request**。
- **`cancel` 契约变更（C7）**：**已由 `ADR-front-cancel-release` 落地**（本篇**结案**该项；backlog `cancel-stop-evidence` **关闭**）。
- **靠「`wait` 返回太快 ⇒ 不信任」的启发式**：魔法数字，且真空闲后端会被误判；本篇改用「**两个观测矛盾**」（无阈值）。
- **用 `pair.json` 整表版本号 / 文件 mtime 当代号**：整表版本会把**不同条目**的写互相牵连（多后端同仓 ⇒ 无关写误伤正常释放）；`writeJsonAtomic` 的 rename 会刷新 mtime ⇒ 不可靠。
- **用锁目录 mtime 当代号**：锁有 30s stale-break，锁目录会被删除重建 ⇒ 无单调序号可取。
- **把授权校验下沉到 `setSlotState` 单一入口**：已删路径与活会话路径语义不同（D12 vs D1）⇒ 单入口会掩盖适用范围问题；**按路径分别声明**。

## 上游 feature request（登记，不在本仓实现）

1. **暴露 write-ahead 停机声明**：把 `time_suspended`（上游 `packages/core/src/session/store.ts:208-219`）作为字段暴露进 `Session.Info` ⇒ 跨实例的「已停机声明」就有了 DB 级正面证据，D2 的严格模式可升级为「有声明即放行」。
2. **「准入 + 投递」的原子原语**：上游 `prompt` 路径的 inbox 行写入与 `execution.wake` 不在同一事务（`packages/core/src/session/session.ts:176-184`），且**不向插件暴露任何锁/租约** ⇒ 若上游提供「仅当该 session 未被停机声明时投递」的条件投递，父篇 D5⑥ 的窗口即可根治。
3. **跨进程执行可见性**：`awaitIdle` 只查进程内 `executions`（`run-coordinator.ts:66`）⇒ 若上游提供 DB 级的「该 session 有在跑的 execution」查询，`wait` 跨实例才可能可用。
4. **`interrupt` 的跨实例语义**：明确「`interrupt` 是否能打断另一实例的 execution」⇒ 决定多实例下 `suspend` 的真实语义（打断 vs 等它自然结束）。
