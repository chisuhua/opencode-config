# RESULT — n2：写隔离方案选型

> 本节点只回答一个问题：**若 `build` 要多 wave 并行实施，用哪种写隔离。**
> 不回答「要不要做」（n7/合稿）、不设计判据面（n4）、不设计合并语义（n3）、不写实现与命令序列。
> 陈述分三类并显式标注：`【事实】`（可引用）/`【推断】`/`【建议】`。

---

## 0. 结论先行

**推荐：候选 A —— linked worktree 隔离。**

- 隔离单元 = **一个 git linked worktree**（独立工作树 + 独立 git index）。
- 承重不变量 = **每个 worktree 同一时刻恰一个可写会话**。这条不是新造：它正是 delegate 现有槽位语义
  （槽位键 = `workRoot`，同 `workRoot` 一次一个）**原样沿用到「worktree 即 workRoot」的场景**
  【事实：`lib/delegate-core.ts:154-155`、`docs/adr/ADR-front-multi-backend.md:150-157`】。
- 四条现有不变式全部**不需要改写**：`scope`+`git status` 差集检测的基准本来就是 `workRoot`，
  而 worktree 下 `workRoot` 就是 worktree 自身（`lib/delegate-core.ts:476-477,487-489`）；
  D4 的原文是「同一**工作树**同时只允许一个后端」（`docs/adr/ADR-plan-delegate-engineering-session.md:76`），
  按 worktree 分槽**不违反它，而是它的字面粒度**。
- **明确否决**：候选 B（同工作树分支隔离）、候选 C（同工作树目录/子树隔离）、候选 E（独立 clone/独立进程）。
- 候选 D（不并行 + 上下文外置）不采纳，但**保留为回退基线**：它是唯一零新增不变式的选项。

**一句代价**：worktree 隔离把「单一写者」从**文件级**降级为「**每工作树每文件**」——跨树收敛要靠合并
（n3 的题），且 `build` 若走 subagent 通道，隔离只有**协议层**保证，不是权限层强制（见 §6）。

---

## 1. 约束输入（选型必须正面回应的四条不变式）

| # | 不变式 | 可引用落点 | 它实际要求什么 |
|---|---|---|---|
| I1 | `scope` + `git status` 差集检测 | `lib/delegate-core.ts:530-550`（取 `git status --porcelain`）、`:2503-2504`（派发前基线，基准 `workRoot`）、`:2593-2604`（派发后差集 + `scope` 越界判定）、`:552-572`（`scope` 是 **edit 前缀**）、`:2084-2105`（前缀→绝对路径） | 一次委托期间的变更必须**可归因到这次委托**；两个写者同时在同一棵工作树上写 ⇒ 变更集合分不开 |
| I2 | delegate `workRoot` 单槽 | `lib/delegate-core.ts:154-155`（槽位键 = `workRoot`）、`:160-178`（占槽条目）、`lib/delegate-async.ts:594-639`（锁内查占槽并拒绝）；裁决：`docs/adr/ADR-plan-delegate-engineering-session.md:74-78` | 同一 `workRoot` 同一时刻**只有一个后端占槽**；不同 `workRoot` 各自一槽 |
| I3 | `PLAN_REF_ROOTS` 计划先行门 | `lib/delegate-core.ts:1321-1326`（四个 accepted roots）、`:1353-1381`（相对 `project_dir` 解析 + 存在性校验）；裁决：`ADR-plan-delegate…:51-60` | plan 侧派 `agent=build` 必须引用一个**已存在**的计划文件；这是 `delegate` 路径上的**运行期校验**，不是隔离机制的属性 |
| I4 | 每文件恰一写者 | `docs/adr/ADR-plan-multi-session-collaboration.md:40-48`（单一写者表）、`:213`（「单写者在**权限层不可保证**」自述）、`:308`（残留 #1：每节点精确写域不可行） | 并行会话之间**不得同时写同一份文件**；权限层做不到逐节点，只能靠「前缀白名单 + 单一写者 + 独占锁 + 事后核对」四层 |

补充事实（影响所有候选的边界）：

- 【事实】`build` 主会话**没有** delegate 通道：顶层五个 delegate action 全 `deny`
  （`opencode.jsonc.opencode-go:30-34`），`build` 段无 agent 级 override（`:37-113`），
  而 `plan`/`front` 各有五项 `allow`（`:226-232`、`:395-399`）。
- 【事实】`build` 的 `subagent` 是字符串 `"allow"`（`opencode.jsonc.opencode-go:102`），
  `subagent_depth: 2`（`:7`）⇒ 宿主内建通道对 `build` 是开着的。
- 【事实】`subagent` 通道**没有** per-session 权限：本仓 ADR 记载子会话权限 = 该 agent 自身配置
  【`docs/adr/ADR-plan-multi-session-collaboration.md:14` 前置事实 ⑤】⇒ 子会话拿不到「本次派发的写集」。
- 【事实】`delegate` 通道**有** per-session 权限：`classPermissions(...)` 组装后随
  `ctx.session.create({ …, permissions })` 传入（`lib/delegate-core.ts:2463-2478`）。
- 【事实】`subagent` 派发**无登记、无台账、无 workRoot 槽位、无停机证据门控、无 scope 越界检测**
  【`docs/adr/ADR-plan-delegate-engineering-session.md:29`】。
- 【事实】`delegate` 建的后端**不进宿主会话树**（无 parentID / 无完成合成消息唤醒）
  【`docs/adr/ADR-plan-multi-session-collaboration.md:26`】；`subagent` 建的有（同篇前置事实 ②③）。
- 【事实】全局并发上限默认 **3**，可由 `RDDF_MAX_ACTIVE_BACKENDS` 覆盖
  （`lib/delegate-async.ts:95-100`），且该计数**owner 无关**（`:1608`）。
- 【事实】`git` **禁止两个 worktree checkout 同一分支**；两个 linked worktree 有独立 index 与独立工作树，
  写同一路径**互不覆盖**（`docs/adr/ADR-front-multi-backend.md:157`，原文标注「实测」）。
- 【事实】n1 的 `RESULT.md` 在本次写作时**尚未产出**（磁盘上 `nodes/n1/` 仅有 `BRIEF.md`）⇒ 本节点
  的现状输入只能取自 BRIEF 点名的仓内材料；n1 结论到位后若与 §1 冲突，以 n1 为准并回改本节。

---

## 2. 候选 A：linked worktree 隔离

### A.1 机制（隔离如何建立、由谁建立、生命周期）

- **建立**：父（`build` 主会话）在每一 wave 开始前用 `git worktree add <path> -b <branch>` 开一棵独立
  工作树。`build` 的 shell 是 `"*": "allow"`（`opencode.jsonc.opencode-go:59`）⇒ 该动作在权限上可达。
  【事实】git 侧语义：独立工作树 + 独立 index，写同一路径互不覆盖；同分支不可被两树同时 checkout
  【`docs/adr/ADR-front-multi-backend.md:157`】。
- **执行者**：每棵树一个可写会话，cwd/`project_dir` = 该 worktree。若走 `delegate`，`workRoot` 自动就是
  worktree（`canonicalRoot` 取 `--show-toplevel`，`lib/delegate-core.ts:487-489`），槽位键随之分开
  （`:154-155`），登记条目也带 `work_root`（`:2498`）。若走 `subagent`，没有登记，见 §6 的强制等级说明。
- **生命周期**：wave 开始 ⇒ 建树 + 派一个 worker；wave 结束 ⇒ worker 在**自己的分支**上提交；
  合并后由父 `git worktree remove` 收树（合并本身属 n3，本节点不设计）。**未收的树是运维泄漏**（见 A.5）。
- 【事实】`stateRoot` 在 linked worktree 下仍是**主仓**（`lib/delegate-core.ts:496`）⇒ `pair.json` / `ledger`
  仍是一份、全局可见；槽位表因此仍是「一张表、多把键」，不是第二本账。

### A.2 隔离粒度

**工作树级**（= 目录树 + git index + 分支三者绑定的复合单元）。不是进程级、不是文件级。

### A.3 对现有不变式的影响（逐条）

| 不变式 | 影响 | 依据 |
|---|---|---|
| I1 `scope`+`git status` 差集 | **不破坏，且更强**。差集基准是 `workRoot`（`:2503-2504`），worktree 下就是该树；一棵树里的变更不会被另一棵树的 `git status` 数到 | `lib/delegate-core.ts:476-477,487-489,2503-2504,2593-2604`；`tests/canonical-root.test.ts:101-113`（worktree 内变更在 workRoot 可见、主仓数不到） |
| I2 delegate 单槽 | **不冲突**。槽位键 = `workRoot`，两棵树 = 两把键；已有实测用例「同仓两个 worktree 各派一个 ⇒ 都成功」 | `lib/delegate-core.ts:154-155`；`lib/delegate-async.ts:594-639`；`tests/delegate-async.test.ts:803-816` |
| I3 `PLAN_REF_ROOTS` | **默认不冲突，但有真实失效面**：相对 `plan_ref` 以 `project_dir` 为解析根（`:1353-1355`），新树若从旧提交开出、而计划文件尚未提交 ⇒ 树里没有该文件 ⇒ `existsSync` 失败被拒（`:1380-1382`）。**绝对路径 `plan_ref` 可跨树通过**（`:1373-1376`，根判定用全路径） | 同上 |
| I4 单一写者 | **工作树内保持**；**仓库层从「文件」退化为「每树每文件」**：同一路径在 N 棵树里各有一份。跨树收敛 = 合并，属 n3 | `docs/adr/ADR-plan-multi-session-collaboration.md:40-48`；`docs/adr/ADR-front-multi-backend.md:157` |

### A.4 代价

- **工程量**：无代码改动（槽位/`workRoot`/`scope` 解析全是现成的）。新增的是**编排面**：建树、命名、
  收树、清理策略。
- **运维面**：N 棵树 = N 份依赖/构建缓存/磁盘；每棵树一条分支，分支命名与回收要有人管。
- **新增不变式**：只有一条「每 worktree 恰一个写者」——且它是对现有单槽语义的**沿用**，不是新机制。
- **失败面**：见 A.5。最贵的一条是「合并」，而它在 n3，不在本方案内。

### A.5 失效模式（该方案自身会怎么坏）

1. **基线错位**：主仓有未提交改动时开树 ⇒ 新树只含 HEAD，worker 看不到父刚改的东西（`git worktree add`
   从提交开盘）。后果 = worker 基于旧代码实施，产出与父的上下文不一致【推断，基于 git 语义】。
2. **树外写入不可见**：worker 若用绝对路径写到**另一棵树或主仓**，本树的 `git status` 差集数不到
   （差集只覆盖 `workRoot`，`lib/delegate-core.ts:2503-2504`；镜像事实见 `tests/canonical-root.test.ts:101-113`）
   ⇒ 「事后核对」出现**盲区**。subagent 通道**无权限层拦截**（ADR-plan-delegate…:29）⇒ 这条是真实风险。
3. **分支持有冲突**：git 禁止两树同分支（ADR-front-multi-backend.md:157）⇒ 树必须各开新分支；
   detached HEAD / 手动 `update-ref` 是「可检测的失败」（同句原文），但不检测就发现不了。
4. **合并成本吞掉并行收益**：N 条分支改同一批文件时冲突是真实工作量；墙钟收益可能被 merge 抵掉。
5. **状态面共享的碰撞**：`stateRoot` 仍是主仓（`delegate-core.ts:496`），后端会往同一处写
   `role.json` ⇒ 角色镜像互相打架，这是**既有已登记残留**，worktree 只会让它更频繁
   （`docs/adr/ADR-plan-delegate-engineering-session.md:147`）。
6. **配额封顶**：全局活跃后端默认 3（`lib/delegate-async.ts:95-100`）⇒ 第 4 棵树派不出去；
   并行度上限不是「树的个数」，而是 3（或环境覆盖值）。

---

## 3. 候选 B：分支隔离（同一工作树）

### B.1 机制

同一 worktree 内靠「换分支」表达隔离：worker 1 在 `feat/a`、worker 2 在 `feat/b`，靠切换分支交替工作。
建立者 = 父或 worker 自己（`git switch`）。

### B.2 隔离粒度

**分支级**。但分支是**一个工作树上的指针**，不是独立工作区。

### B.3 对现有不变式的影响

| 不变式 | 影响 | 依据 |
|---|---|---|
| I1 `scope`+`git status` 差集 | **破坏**。差集的基准是**工作树文件状态**，没有分支维度（`:530-550` 只跑 `git status --porcelain`，`:487-489` 只取 `--show-toplevel`）；A 分支的改动在 B 分支下仍是「工作树脏」，差集无法归因 | `lib/delegate-core.ts:487-489,530-550,2503-2504` |
| I2 delegate 单槽 | **冲突**。两 worker 的 `workRoot` 相同 ⇒ 第二个被拒（`:635-639`）；且换分支不改槽位键 | `lib/delegate-async.ts:635-639`；`tests/delegate-async.test.ts:818-832` |
| I3 `PLAN_REF_ROOTS` | **表面可用、实际脆弱**：计划文件是否在**当前 checkout 的分支**上决定校验成败（`existsSync`，`:1380`）；换分支会让「刚校验通过的计划」消失 | `lib/delegate-core.ts:1380-1382` |
| I4 单一写者 | **破坏**。两个会话写同一棵工作树、共用同一个 git index ⇒ 不是「每文件一写者」，而是同一份文件被两条意图覆盖 | `docs/adr/ADR-plan-multi-session-collaboration.md:40-48` |

### B.4 代价

工程量看似最低（只需 `git switch`），但**没有并发**：同一工作树一次只能 checkout 一个分支，两个 worker
只能交替跑 ⇒ 拿不到并行度；反而多出「切分支污染对方未提交改动」的风险。

### B.5 失效模式

- 切换分支时对方的未提交改动被带过去（或被拒绝切换）⇒ 两份工作的边界靠人记。
- 两 worker 并发 `git add/commit` 抢同一 index / `index.lock`【推断，基于 git index 单文件语义】。
- 差集检测把对方改动算进自己的 `out_of_scope_files`（`delegate-core.ts:2601-2604`）⇒ 假阳性告警，
  进而让告警失去判别力（与 ADR 里 `alert fatigue` 同型论证，`docs/adr/ADR-plan-multi-session-collaboration.md:151`）。

---

## 4. 候选 C：目录/子树隔离（同一工作树）

### C.1 机制

两个 worker 在同一 worktree 里各写一个子树（如 `src/a/**` 与 `src/b/**`），靠 **per-session `scope` 派生
的 edit 白名单**互相隔离。这是本仓**唯一真实存在的「按路径写隔离」**实现：
`scopeEditRules()` 先 `edit:* deny`、再按 `scope` 前缀放行（`lib/delegate-core.ts:552-572`），
该组规则随 `session.create({ permissions })` 进 session（`:2463-2478`）。

### C.2 隔离粒度

**目录级（前缀）**。不是文件级，也不是「逐 worker 的精确写集」——见 §6。

### C.3 对现有不变式的影响

| 不变式 | 影响 | 依据 |
|---|---|---|
| I1 `scope`+`git status` 差集 | **破坏**（若真并行）。两个写者同树 ⇒ 差集是**两者并集**（`:2593-2596`），越界判定无法区分「我写的」与「他写的」（`:2601-2604`）。这正是 D4 的原句论点 | `lib/delegate-core.ts:2593-2604`；`docs/adr/ADR-plan-delegate-engineering-session.md:77` |
| I2 delegate 单槽 | **直接冲突**。同 `workRoot` 第二个后端被 `claimSlot` 拒（`:635-639`）。要并行**必须改单槽规则**，而 D4 说单槽就是写隔离的来源 | `lib/delegate-async.ts:635-639`；`ADR-plan-delegate…:76-77` |
| I3 `PLAN_REF_ROOTS` | **不冲突**（每 worker 各自带 plan_ref）；但若 `build` 走 subagent，该门**根本不存在**（§1 第三行） | `lib/delegate-core.ts:1358-1384` |
| I4 单一写者 | **工作树内可以由权限层强制到子树**，但「同一文件两个写者」仍可能（前缀重叠，§6）；仓库层不变式从「每文件」退化为「每子树」 | `lib/delegate-core.ts:552-572`；`docs/adr/ADR-plan-multi-session-collaboration.md:40-48` |

### C.4 代价

- 若**不改**单槽：零并发，本方案等于没做（只是把单 worker 的写集收窄）。
- 若**改**单槽：要动 `claimSlot` 的占槽谓词与 `out_of_scope_files` 的归因口径，等于重写 D4 的论证前提；
  还要新增「两个 index 共享」的并发提交保护。
- 新增不变式：前缀不相交（但前缀语义**无法保证不相交**，§6）。

### C.5 失效模式

- **前缀重叠**：`scope` 用 `Wildcard`（`*`→`.*`，**跨斜杠**）⇒ 前缀是「文本前缀」而非「目录边界」
  【`docs/adr/ADR-plan-multi-session-collaboration.md:14` 前置事实 ⑦】⇒ `src/a` 与 `src/ab` 这类兄弟目录
  在规则层可能互相可写；要靠人保证命名无歧义。
- **同树 index 竞争**：两个 worker 的 `git add`/`commit` 抢同一 `index.lock`【推断】。
- **越界告警不可归因**：并集差集 ⇒ 只能报「有人越界」，判不出是谁（与残留 #10「并行下无法按节点归因」同型，
  `docs/adr/ADR-plan-multi-session-collaboration.md:317`）。

---

## 5. 候选 D（对照项）：不并行 + 上下文外置；候选 E：独立 clone/独立进程

### D. 不并行 + 上下文外置

- **机制**：不做多 wave 并行；`build` 仍是唯一写者，把「多 wave」换成**顺序执行 + 把上下文外置到磁盘**
  （计划/工单/TODO 落文件，主会话只留指针）。本仓已有同型范式：`TODO.md` 被定义为「跨会话恢复的承重件」
  （`docs/adr/ADR-plan-multi-session-collaboration.md:105-107`）。
- **粒度**：无隔离（单写者）。
- **不变式**：I1/I2/I3/I4 **全部不变**（零新增）。这是它唯一的强项。
- **代价**：墙钟仍随改动规模线性增长；只解决上下文压力，不解决并行。
- **失效模式**：外置文件与代码漂移（工单过期）；主会话仍要串行审阅每一批产出。
- **判定**：**不采纳，保留为回退基线**。它回答的是「上下文」，不是「并行」——而 TOPIC 的问题定义
  同时包含「上下文压力与墙钟时间」（`TOPIC.md:8`）。

### E. 独立 clone / 独立进程

- **机制**：`git clone` 到另一个目录，甚至另起一个 opencode 进程/端口，各自跑。
- **粒度**：**进程级 + 独立仓库**。
- **不变式影响**：I1 **表面成立**（各自 `git status`），但 I2/I3/I4 的**载体全部消失**：独立 clone 有独立
  `.git` ⇒ `stateRoot` 不同 ⇒ `pair.json` / 槽位表 / ledger 分裂，`countActiveBackends` 数不到对方
  （`lib/delegate-core.ts:496`；`lib/delegate-async.ts:1608`）；`plan_ref` 的相对解析根也不同（`:1353-1355`）。
  等于把「单槽 + 台账 + 归属」三件套整体放弃。
- **代价**：磁盘与安装成本最高；跨 clone 收敛要 patch/bundle，比 worktree 的 merge 贵一个量级。
- **失效模式**：两份状态账本必然分叉（与「第二本账」一贯否决同型，
  `docs/adr/ADR-plan-multi-session-collaboration.md:187`）；越界与归属不可追溯。
- **判定**：**否决**（见 §7）。

---

## 6. 隔离机制与写集粒度的关系（权限层强制 vs 协议层约定）

这一节是本节点的**判别性结论**，也是 n4 设计判据面时必须知道的上限。

### 6.1 权限层**能**强制到哪一级

- 【事实】唯一能表达「这次派发的写集」的地方是 **delegate 的 per-session `permissions`**：
  `scope` → `edit` allow 前缀（`lib/delegate-core.ts:552-572`）→ 随 `session.create` 下发（`:2463-2478`）。
- 因此**权限层强制的最细粒度 = 「工程根相对的目录前缀」**，解析基准是 `workRoot`（`:2460`），
  工程根之外的 `scope` 项**直接不放行**（`normalizeScopePath` 返回 `null`，`:1040-1046` 的 `..` 判定）。
- 【事实】前缀语义由 `Wildcard` 实现（`*`→`.*`，**跨斜杠**）⇒ **无法表达「只有这个文件」**，
  也无法表达「只有我这个 node 目录」（`docs/adr/ADR-plan-multi-session-collaboration.md:14` 前置事实 ⑦，
  原文标注「实测」）。残留 #1 正是这条的直接后果（`:308`）。
- 【事实】`delegate` 的后端还会被 `role_class × scope` 相容性硬拒在 `session.create` 之前
  （`lib/delegate-core.ts:2450-2452`）⇒ 权限层不只管路径，还管「这个角色能不能写这个区」。

### 6.2 协议层**只能**约定到哪一级

- 【事实】`subagent` 通道**不传 per-session permissions**（`docs/adr/ADR-plan-multi-session-collaboration.md:14`
  前置事实 ⑤）⇒ 子会话拿的是**该 agent 的静态配置**。`build` 的配置是 `edit: "*": "allow"`
  （`opencode.jsonc.opencode-go:50-54`）⇒ 一个 `build` 型子会话**在权限层没有任何路径限制**。
- 对照：`plan-worker` 的 `edit` 是 `*.rddf/plan-topics/*` 前缀（`opencode.jsonc.opencode-go:1491-1494`），
  粒度是**整个 topic 树**，到不了 node 目录（`docs/adr/ADR-plan-multi-session-collaboration.md:308`）。
- ⇒ 若 `build-worker` 走 `subagent`，**写隔离的最细可达级别 = 「agent 配置里的固定前缀」**，而它
  **不能随 wave 变化**（agent 配置是静态的）。想把 worker 限制在「自己那棵树」只能靠：
  cwd 约定 + prompt 纪律 + 事后 `git status` 核对 —— **全是协议层**。

### 6.3 做不到的那一级的后果

- **文件级隔离做不到**（两种通道都做不到）：→ 后果 = 「两个 worker 改同一文件」永远可能在**合并前**
  发生（同树场景）或**合并时**发生（跨树场景）；本仓的兜底只有事后差集（`delegate-core.ts:2601-2625`）
  与人工复核，**不可事前拦**（`docs/adr/ADR-plan-multi-session-collaboration.md:294`「节点内越界写」）。
- **逐 worker 精确写域做不到**：→ 后果 = 并行时只能做 **topic/树级 union 核对**，不能按 worker 归因
  （残留 #10，`:317`）。这条在 n4 的判据面里必须如实写成「不可机判」，不得伪装成有闸门。
- **`subagent` 通道下的写隔离是「零权限强制」**：→ 后果 = 一个 `build` 型 worker 可以写仓库任何地方，
  包括别的树和主仓；且写到本树之外时**连事后差集都看不见**（A.5 第 2 条）。这是本设计**已知最弱一环**，
  与 ADR 自述「单写者在权限层不可保证」同口径（`docs/adr/ADR-plan-multi-session-collaboration.md:213`）。

---

## 7. 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **A：linked worktree 隔离** | **采纳** | 唯一同时满足 I1–I4 的方案：差集基准本就是 `workRoot`（`delegate-core.ts:2503-2504`），槽位键本就是 `workRoot`（`:154-155`），且已有「两个 worktree 各派一个都成功」的实测用例（`tests/delegate-async.test.ts:803-816`）⇒ **零代码改动**即可获得并行，不新造通道、不改单槽、不改差集口径 |
| B：同工作树分支隔离 | 否决 | 分支没有独立工作树与 index（`ADR-front-multi-backend.md:157`），同 `workRoot` ⇒ 被单槽直接拒（`delegate-async.ts:635-639`）；差集无分支维度（`delegate-core.ts:487-489,530-550`）⇒ I1 与 I4 同时破 |
| C：同工作树目录/子树隔离 | 否决 | 与 D4 正面冲突：**「单槽是写隔离的来源；按 owner 分槽会让两个后端同时写同一工作树，破坏 `scope` + `git status` 差集检测的前提」**（`docs/adr/ADR-plan-delegate-engineering-session.md:77`）。目录隔离只是把「两个写者」的写域收窄，**没有消除两个写者同树**这一前提破坏；且前缀是跨斜杠文本前缀（`ADR-plan-multi-session-collaboration.md:14` ⑦），连「不相交」都无法保证 |
| D：不并行 + 上下文外置 | 不采纳（保留回退） | 零新增不变式，但只解上下文不解墙钟；且 `TOPIC.md:8` 的问题定义同时包含两者 |
| E：独立 clone / 独立进程 | 否决 | 独立 `.git` ⇒ `stateRoot` 分裂（`delegate-core.ts:496`）⇒ 槽位表/台账/配额全部各自为政（`delegate-async.ts:1608`）⇒ I2/I4 的载体消失，等于放弃「唯一登记型通道」纪律（`docs/MULTI-AGENT-DESIGN.md:121`） |

**「唯一门控边界」纪律**（`docs/MULTI-AGENT-DESIGN.md:121`；`docs/adr/ADR-front-multi-backend.md:71`）：
A 与 E 的分野正在这里 —— A 复用宿主 git 能力 + 现有 `delegate`/`subagent` 门，不新增派发通道；
E 事实上制造了「第二套状态面」，与「门控边界唯一」相悖。

---

## 8. 推荐与明确否决项

### 8.1 推荐（单一方案）

**linked worktree 隔离 + 每工作树恰一个可写会话。**

三条支撑：

1. 它**不改**任何现有不变式的判定口径：`workRoot` 的定义本来就是 worktree（`delegate-core.ts:476-477,487-489`），
   `git status` 差集、槽位键、`scope` 解析都自动跟随。
2. 它**已被实测**：同仓两个 worktree 各派一个后端都成功，`work_root` 各为两树
   （`tests/delegate-async.test.ts:803-816`；`docs/MULTI-AGENT-DESIGN.md:1208`）。
3. 它把冲突**推迟到合并**而不是**留在写入**：同树双写者是最危险形态（D4 的原句），跨树冲突至少是
   「可检测、可编排」的合并问题（n3）。

### 8.2 明确否决项

| 被否决 | 否决理由（引用它撞的那条不变式） |
|---|---|
| B 分支隔离 | 撞 I1 + I4：同 `workRoot` 无分支维度（`delegate-core.ts:487-489`），且第二个后端被单槽拒（`delegate-async.ts:635-639`） |
| C 目录/子树隔离 | 撞 **D4 的单槽论证**（原文：`ADR-plan-delegate-engineering-session.md:77`）——两个后端同写一棵工作树会让差集检测失去前提 |
| E 独立 clone/进程 | 撞 I2/I4 的**载体**：`stateRoot` 分裂（`delegate-core.ts:496`）使槽位与台账不再共享（`delegate-async.ts:1608`），等于第二本账 |
| D 不并行 | 不撞不变式，但**不满足问题定义**（`TOPIC.md:8` 的墙钟一半）⇒ 只列为回退 |

### 8.3 本方案**不**声称的东西（诚实口径）

- **不**声称「权限层保证每树一个写者」。`subagent` 通道下这是**协议层**（§6.2）；只有 `delegate` 通道能把
  `scope` 变成权限规则。这与 ADR 自述一致（`docs/adr/ADR-plan-multi-session-collaboration.md:213`）。
- **不**声称「跨树永远不冲突」。冲突被推迟到合并，n3 负责。
- **不**声称能防「树外写入」。差集只覆盖 `workRoot`（§6.3）。

---

## 9. 失效清单（跨方案，供 n7 复用）

| # | 失效 | 触发条件 | 可观测性 |
|---|---|---|---|
| F1 | 两 worker 同树双写 | 通道纪律失守 / 单槽被绕过 | 差集并集 ⇒ 只能看「有人越界」，不可归因（`:317`） |
| F2 | 树外写入 | worker 用绝对路径 / cwd 漂移 | **不可见**（差集只覆盖 `workRoot`） |
| F3 | 基线错位 | 主仓脏时开树 | 无机械信号；靠父自查 |
| F4 | 分支/树泄漏 | wave 结束未收树 | `git worktree list` 可枚举（只读，`opencode.jsonc.opencode-go:1420` 为 plan-worker 白名单项） |
| F5 | 配额封顶 | 同时活跃后端 ≥3 | 派发报「并发上限已达」（`delegate-async.ts:1345`） |
| F6 | 合并冲突 | 多树改同一文件 | 合并时可见（n3 面） |
| F7 | 计划文件不在树里 | 未提交计划 + 相对 `plan_ref` | 派发被拒（`delegate-core.ts:1380-1382`），**响亮** |

---

## 10. 交接（明确不属本节点）

- **n3（合并与冲突语义）**：A 的跨树收敛、分支命名、`git worktree remove` 时机。
- **n4（判据面）**：§6.3 的三条「不可机判」必须以「事后 union 核对」形态进入判据，不得伪装成闸门。
- **n5（与 delegate 全局单槽的关系）**：A 依赖「槽位键 = `workRoot`」的字面语义（`ADR-plan-delegate…:76`）；
  若 n5 决定把单槽改成仓库级，**A 立刻失效**（两棵树会互斥）⇒ n5 必须以本节为输入重新评估。
- **n6（rdd-builder P2 worktree 模式）**：A 与产品侧 worktree 模式的边界；本节点未读该产品面，不越界。
- **n7（失败模式与回滚）**：§9 的 F1–F7 直接可复用。

---

## 待父裁决

1. **通道前提**：A 的强制等级取决于最终通道（delegate ⇒ 权限层；subagent ⇒ 协议层）。本节点按 BRIEF 边界
   **不裁决通道**，但请父在合稿时把 §6.2/§6.3 原样带入，避免下游把「worktree 隔离」误读为「权限层隔离」。
2. **n1 未产出**：若 n1 的盘点给出与 §1 补充事实不同的结论（尤其「`build` 是否真的没有 delegate」），
   以 n1 为准，本节点 §1/§8 需回改。
3. **候选数**：BRIEF 要求 ≥3，本节点给 4 个主候选（A/B/C/D）+1 个极端项（E）；若父认为 E 应并入 A 的变体，
   可压缩，不影响结论。

## STATUS: COMPLETE
