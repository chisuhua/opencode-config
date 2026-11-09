# improvement: front-multi-backend

## Why

用户诉求：**front session 要有管理多个后端工程 session 的能力**——多个后端分别完成不同的工程目标，各自上下文保持干净。

现状是 `delegate` 的**同步单发**语义：一次调用 = 建/复用工程 session → 投递简报 → `ctx.session.wait`（30min 上限）→ 读 outcome/context → 返回 summary（`lib/delegate-core.ts` 的 18 步固定序列）。这带来四个缺口：

1. **时间耦合**：front 的整个回合被 `wait` 占住（最长 30 分钟）。N 个后端串行 ⇒ 总时长线性叠加，期间 front 无法响应用户、无法观测任何一个后端。
2. **归属不可枚举**：`pair.json` 与 `ledger.jsonl` 都**按工程仓各存一份**。「front 名下有哪些后端、各自在哪个仓、什么状态」在本地**没有任何入口**。
3. **写隔离缺失**：scope 强制是 session 级 edit 规则，越界检测是委托前后 `git status` 差集。同一工作树上两个后端并发写 = 互相踩，且检测互相误报。
4. **上下文污染**：resume 不校验目标一致性，把新目标灌进旧 session 的历史。

拆开时间耦合还带出三个**由异步化派生**的洞（同步时代由耦合免费提供）：**终态送达**（run 结束没有 push 通道，front 不查就永远缺终态行）、**存活性判断**（"还在跑"从 `wait` 的返回变成推导态）、**外部删除可见性**（后端不是"失败"而是"消失"，ledger 里与"从未派发"同构）。

两条必须写死的既有文档修正（探针实测）：

- **上游 prompt 默认 `delivery="steer"` 不是 queue**，steer = **注入当前轮并改写它**（实测：run 中投第二条，最终 assistant 回的是第二条的内容）。既有架构文档 §4.3「会排队」的措辞不准确。
- **`delegate` 的每次调用都投递简报**（resume 分支也一样，`lib/delegate-core.ts:767-768` 无条件执行）⇒ **不存在"复用 delegate 轮询"这个选项**，查询本身即污染源。

ADR `docs/adr/ADR-front-multi-backend.md` 已 Accepted（**2026-11-09 改写**：槽位键 `canonical_root`→**`workRoot`**、新增单槽 + 可切换模型；oracle 1 轮 + critic 2 轮，第 1 轮 REJECT（3 BLOCKER）→ 全部闭合 → 第 2 轮 APPROVE）。19 条前置探针见 `.rddf/reviews/front-multi-backend-probes.md`。

**Phase 0（消费确认判据）已完成**：`.rddf/reviews/front-multi-backend-consume-probe.md`（16/16 PASS，**判据可靠 ⇒ 不降级**）。
**实施状态**：`openspec/changes/front-multi-backend/tasks.md`（逐条 AC 状态）；实现设计见 `design.md`。

## What Changes

- **D1 工具面**：新增 `dispatch`（异步派发，立即返回）/ `sessions`（只读观测，**绝不投递 prompt**）/ `suspend`（暂停、**可续**）/ `cancel`（终止、墓碑），**四个工具**各自独立的权限 action（`delegate_dispatch` / `delegate_sessions` / `delegate_suspend` / `delegate_cancel`）。**拆工具而非给 `delegate` 加 `async` 参数**——参数是静默开关，忘写即静默退化为 30min 阻塞且无报错信号。`delegate` 保留（同步单发面），既有语义与判据全部不变。`dispatch` 的 execute 必须有**硬超时**。
- **D2 名册**：宿主 session metadata 作**可丢弃索引**（随 session 删除自动消失、无悬挂、无第三份真相源）。真相切分写死：`pair.json` = resume ACL 唯一判据 / `ledger.jsonl` = 事实唯一判据 / metadata = 索引。dispatch 时必须落 ledger `dispatched` 行（"从未派发"与"派发后消失"可区分的唯一支点）。检索：front 自身 session metadata 存 roster 数组（快路径，O(1)）+ **全库 list + cursor 续扫**（兜底，front 换代后重建）。
- **D3 一 session 一目标**：goal 判等用结构化 `goal_key = {repo, intent slug}`，**不比对自然语言**。resume 时 goal_key 不一致 ⇒ **硬拒续接**。判等是**单向强制**（换 slug 拒；同 slug 异目标无法机制识别，靠 prompt 纪律 + ledger 事后审计）。
- **D4 状态判定**：running 判据用 `time.busy`（`busy` 存在 ∧（`idle` 未定义 ∨ `busy > idle`）），**不用 `outcome`**（该字段 run 未结束时整个不存在）。保守规则：宁可报 running 不报完成。
- **D5 聚合**：整体 = 最差的那个；任一 `unverified`/`unknown`/`stalled` ⇒ 不得声称完成；任一 running ⇒ "进行中"且不进 worst-of；**headline 之外永远列明细**。
- **D6 同仓并发**：先做互斥（in-flight 时拒绝派发）+ scope 重叠检测（**按路径段前缀**，`src/auth` 与 `src/authorize` 不算重叠）。互斥检查与登记必须在**同一次锁临界区**内（否则 check-then-act 竞态）。worktree 隔离**后置**。
- **D7 cancel = 墓碑**：cancel 后的 session 永久不可 resume，再派必须新建（插件 ctx **无 `inbox` API**，队列残留无法直接观测，不依赖未探明的上游清理行为）。
- **D8 成本上限**：并发后端数设上限，超限 fail-fast 拒绝（不排队）。

## Acceptance

见 `openspec/changes/front-multi-backend/proposal.md` 的 `## 验收标准`（AC1–AC38）。**编号以 proposal 的 `## 验收标准` 为唯一源**，本段只列选型。

**最小可验收集合**（缺一即不通过）：AC1（工具可见性）、AC2（非 front 被拒）、AC4（观测面不污染）、AC5（dispatch 立即返回）、AC6（显式 delivery=queue）、AC9（dispatch 落三处）、AC16（goal_key 不一致拒续接）、AC21（running 判据）、AC23（worst-of 聚合）、AC26（同仓互斥拒绝）、AC28（cancel 墓碑）、AC33（既有 delegate 全绿回归）。

**否决条件**：① 最小集合里任一 AC 有工具证据表明失败；② 既有 `delegate` 的既有判据出现回归（AC33 失败即否决）；③ 观测面污染后端（调用 `sessions` 前后后端 `session.context` 消息条数或 `time.updated` 变化）。

## Capabilities

- front 的回合不再被后端钉死：派发即返回，**多个后端跨仓并发推进**（⚠️ **同仓仍是串行**——D6 的同仓互斥是有意限制，worktree 隔离后置；这是本批已知的交付边界，必须写进 front prompt），用户随时能问进度。
- 「front 名下有哪些后端」有了可枚举的答案，且不新增持久状态文件。
- 上下文污染有了强制点：goal_key 不一致即拒续接，而非依赖 front 自觉。
- 活体判据与 `outcome` 解耦，避免"未开始/进行中/僵尸"三义性误判。

## Impact

- 影响面：`lib/delegate-core.ts`（槽位原语 + 名册索引 + goal_key 校验 + **既有 delegate 的槽位检查**）、`lib/delegate-async.ts`（新增：dispatch/sessions/suspend/cancel 四工具 + 槽位生命周期 + 消费确认）、`opencode.jsonc.opencode-go`（**四个**新 permission action 的全局 deny + 仅 front allow；注意 `opencode.jsonc` 是符号链接）、`prompts/front.md`（**四工具**契约 + "dispatch 返回 ≠ 后端完成" + 切换契约 + 范围假设 + **删除旧措辞**）、`prompts/build.md`（若 change 1 未覆盖则一并在本批处理，见 Out of Scope）、`docs/front-delegate-architecture.md`（§6.1 不变式 1 的"出口"口径扩写 + §4.3 delivery 语义修正 + §2.1 全景图）、`docs/front-delegate-usage.md`、`docs/dual-session-delegation.md`、`docs/CHANGELOG.md`、`tests/*`、外部 E2E 仓库（新增 L2-16..）。
  - **文档清单与 AC 的对应关系（避免"说了要改却没人判"）**：`prompts/front.md` → AC34；`docs/front-delegate-architecture.md` → AC35；`docs/dual-session-delegation.md` + `prompts/front.md` 的 ledger 说明 + `ADR-front-knowledge-capability` D5 → AC36；`docs/front-delegate-usage.md` / `docs/CHANGELOG.md` → **本批无 AC**（属"顺手同步"，不单独判据；若实施时漏改，不构成 AC 失败但应在交付说明中如实列出）。
- 兼容性：`delegate` 的**既有语义与既有判据全部不变**（`outcome` 枚举含 `unverified`、`busy` 拒绝、scope 越界检测、pair 登记、ledger 行时机）⇒ 既有 E2E 不受影响，但 prompt/手册需**新增**四工具契约段并删除旧措辞。ledger schema 需新增**独立 `event` 字段**（`dispatched` / `dispatch_failed`）与 `outcome` 新值 `vanished`（**不塞进 6 值枚举之外的语义混淆**，见 AC36）。
- 风险：上游语义漂移（`delivery` 默认值、`time.busy` 存在性、`session.list` 过滤字段）会让语义**静默反转** ⇒ 必须代码级强制 + 升级回归清单加两条；**dispatch 返回 ≠ 后端完成**是新增的失败形态（模型极易误报），只能靠 prompt 防线；同 slug 异目标无法机制识别；front 换代后 roster 快路径不可用（本批已把 roster 移出 scope，只做兜底扫描）；`withLock` 现为同步签名而 `create` 是 await ⇒ 互斥的原子性需要顺序约定（AC26 ③）。
