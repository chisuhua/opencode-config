# RESULT — n4：判据面设计

> 问题：**在 n2 的 worktree 隔离 + n3 的合并语义之上，「一波做完了 / 合并干净 / 这次实施算成功 / 哪里失败了」怎么机判？**
> 边界：不写实现代码；不重复 n3 的 6 类冲突分类（只消费「哪些可机判」这一层）；不改 `lib/plan-topics.ts` / `scripts/plan-topic-check.ts` 的任何判据。
> 陈述分三类并显式标注：`【事实】`（可引 `path:line`）/`【推断】`/`【建议】`。凡涉上游行为且本仓无锚点者，标「上游语义（未在本仓核实）」。

---

## 0. 结论先行

| # | 判定 | 一句话理由 |
|---|---|---|
| 1 | **判据面沿用既有两维（阶段 × 严重度），不新增第三维**；wave 维度做成**范围参数** `--wave <id>` | 阶段化是为了保住「派发前 check 必须 exit 0」的纪律（`docs/adr/ADR-plan-multi-session-collaboration.md:61`）；把 wave 做成第三维会让 severity 变成 wave 的函数，破坏两维正交 —— 这正是 ADR 反对「产生后再降级」的同型错误（`:148`） |
| 2 | **判据载体 = 声明文件 `waves.json`（入 git）+ 台账 `ledger.json`（入 git，原子写）+ 运行态两把锁（gitignored）**；**在飞 = 台账无终态条目** | 与 D10「未闭合 attempt = 在飞」同构（`lib/plan-topics.ts:453-461`），不引入第二本账（ADR `:187` 一贯否决） |
| 3 | **判据 36 条，7 组**：派发前置 8 / 一波完成 5 / 合并干净 7 / 越界写 4 / 失败判定 5 / 中断恢复 4 / 产物完整性 3 | 覆盖 BRIEF 点名的七类；每条都标死了「可机判 / 条件可机判 / 需人判」 |
| 4 | **其中只有 3 条是 `info`**（`merge_unverified` / `worktree_leaked` / `abi_undeclared`），且都属「必然存在的中间态或确定性缺失」 | 与 `cache_behind` 同一判据：**必然出现的东西不能阻断**，否则闸门失去判别力（`lib/plan-topics.ts:106-116`） |
| 5 | **退出码沿用四值**（0/1/2/3），**明确否决扩 `4=未收敛`** | 唯一消费者是 LLM 父会话，看 JSON 即可；且 exit 0 若收窄会破坏中场健康检查（ADR `:167`、`:193`） |
| 6 | **收敛信号 = `check --json` 的 `converged`（调度信号）；另设 `landed`（事实投影，不叫 delivered）** | 对齐 D11「converged 是调度信号而非交付信号」（`:158`、`:302`）；叫 `delivered` 会被读成「做完了」（见 §4.4） |
| 7 | **明确不做的 4 件事**：不做交付信号、不做 per-worker 越界归因、不做自动接管、不做「合并即验收」 | 前三件既有 ADR 已判不可机判（`:317`、`:319`、`:302`）；第四件是 n3 的已知薄弱点（`nodes/n3/RESULT.md:302-306`） |
| 8 | **对既有 plan 机制的 9 条缺陷登记见 §5.2**；R1 在本 topic 自身就有活体实例，R2/R4 是本仓代码层的活体实例 | R1 的实例：`graph.json:141` 声明 `owner: "parent"`、`:146` 记的却是 `agent: "plan-worker"`，判据全绿；R2/R4 的实例：`.lock` 无写入点、`baseline` 无写入点（§5.2）。这 9 条不是「顺手提建议」，而是**新判据面直接踩得到的坑** |

**一句代价**：判据面能判的全是**字节层事实**（提交存在、祖先关系、前缀差集、退出码）。「这一波是否真的达成了目标」在本面里没有位置 —— 它和 D11 一样，只能靠人读 `TOPIC.md` 与 diff。

---

## 1. 判据面的形状（先钉口径，再列判据）

### 1.1 三个截面与一个范围参数

| 维/参 | 取值 | 作用 | 依据（对齐既有） |
|---|---|---|---|
| **阶段**（`--phase`） | `dispatch` = wave 派发前截面；`final` = 收尾全量截面（默认） | **只**作用于 `violations` 列表与退出码 | `lib/plan-topics.ts:745-755`、`:809`；`docs/architecture/plan-topics-topic-model.md:63` |
| **严重度** | 阻断 / `info`（info 不改退出码，不进 `converged`） | `--json` 每条带 `severity`；`ok` 只看阻断项 | `lib/plan-topics.ts:116-120`；`scripts/plan-topic-check.ts:147-164` |
| **范围**（`--wave <id>`） | 省略 = 全 topic；给定 = 单 wave | **过滤待判对象**，不是新维度 | 既有 plan 面无此参（一个 topic 即一个范围）；build 面必须分 wave，否则 `final` 会跨 wave 混判 |

【建议】`final` 在 build 面有**两个消费时点**：wave 收尾（`--wave wN`）、topic 收尾（无 `--wave`）。二者用**同一套判据**，只有范围不同 —— 这就是把 wave 当参数而非阶段的全部理由：阶段变化会改判据集合（phase-gating），范围变化只改被判对象。

【事实】既有实现已经把「阶段」压到最小：`stale_inputs` 只在 `final` 产生（`lib/plan-topics.ts:828`），`dispatch` 只对**已到期**节点要 BRIEF、只对 `progress=complete` 节点要交付物（`:818-819`）。⇒ 新面照抄这个「phase-gating 而不是 produce-then-downgrade」的手法（ADR `:148` 明文要求）。

### 1.2 载体（三类文件，各自的写者唯一）

| 文件 | 入 git? | 写者 | 内容 | 依据 |
|---|---|---|---|---|
| `.rddf/build-waves/<topic>/waves.json` | **是** | 父（唯一） | `{version, topic, target_ref, waves:[{id, base_sha, integration_ref, items:[{node, branch, scope[]}]}]}` —— **声明输入** | 与 `graph.json` 同族（D2「声明意图 vs 磁盘事实」，ADR `:63`） |
| `.rddf/build-waves/<topic>/ledger.json` | **是** | 父（唯一） | append-only 台账：`{attempts:[{wave,node,branch,base_sha,tip_sha,merged_sha?,drift_level,verify:{commands,exit,at},result,rework_of?}]}`，原子写（tmp+rename） | n3 §7.1-7.2 的三样入 git（`nodes/n3/RESULT.md:274-276`）；原子写范式见 `scripts/plan-topic-check.ts:375-380` |
| `.rddf/state/build-waves/<slug>.wave.lock` / `…merge.lock` / `…target.lock` | **否**（gitignored） | 持有者 | 归属 / 合并序列 / 最终合入序列 | 锁形态沿用 n3 §6.2（`nodes/n3/RESULT.md:225-232`）与 graph 锁实现（`scripts/plan-topic-check.ts:335-372`） |

**在飞的定义（唯一定义）**：某 item 在台账里有条目但**无终态**（既无 `merged_sha` 也无 `abandoned{reason,at}`）⇒ 在飞。**不设违规码**（照抄 D10：在飞是数据不是判决，ADR `:144`），只进 `summary.in_flight`。
**补充在飞标记**：集成分支工作树出现 `.git/MERGE_HEAD` ⇒ 「合并动作正在飞」——这是 **git 自己的**在飞标记，用它代替第二本账（n3 `:98-100`）。

---

## 2. 判据清单（36 条）

> 读法：`阶段` 用既有两维口径；`可机判?` 三值 —— **可机判** / **条件可机判**（要额外约定或只在单一命中时成立）/ **需人判**（无机械信号）。`严重度` 为 `—` 者 = 不设码，只进 summary 桶。

### A 派发前置（`dispatch` 截面）

| 判据 | 判什么 | 怎么判 | 阶段 | 严重度 | 可机判? | 依据 |
|---|---|---|---|---|---|---|
| A0 `owner_lock` | wave 的写者归属唯一 | `.wave.lock` 存在 ∧ `owner` 文件内容 == 调用方 `session_id` | dispatch | 阻断 | 可机判 | 锁形态 `nodes/n3/RESULT.md:225-232`；`scripts/plan-topic-check.ts:336-372` |
| A1 `deps_merged` | item 的上游**已合入 integration**（不是「已 done」） | `git merge-base --is-ancestor <dep.tip_sha> integration` | dispatch | 阻断 | 可机判 | fork 合法性 ADR `:59`；n3 `:96` |
| A2 `base_pinned` | `base_sha` 是**全 40 位 SHA** 且是 integration tip 的祖先 | 正则 `^[0-9a-f]{40}$` + 祖先判定 | dispatch | 阻断 | 可机判 | n2 的 F3 基线错位（`nodes/n2/RESULT.md:101-102`）；相对 ref 会漂（`tests/plan-topics-dag.test.ts:406-416`） |
| A3 `baseline_clean` | 开树时主工作树无未提交改动 | 开树前 `git status --porcelain` 为空 | dispatch | 阻断 | 可机判 | `nodes/n2/RESULT.md:101-102` |
| A4 `tree_ready` | item 的 worktree 存在且路径/分支匹配声明 | `git worktree list --porcelain` 含该 path 且 branch 相符 | dispatch | 阻断 | 可机判 | `nodes/n2/RESULT.md:66-76`；`opencode.jsonc.opencode-go:1420`（worktree list 是只读项） |
| A5 `branch_free` | 该分支未被另一棵树 checkout | `git worktree list` 的 branch 列唯一 | dispatch | 阻断 | 可机判 | `docs/adr/ADR-front-multi-backend.md:157`（git 禁两树同分支） |
| A6 `quota` | 活跃后端数 < 上限 | 复用 `countActiveBackends` 语义（owner 无关） | dispatch | 阻断 | 可机判（**仅 delegate 通道**） | `lib/delegate-async.ts:95-100`（默认 3）；n2 `:112-113`。⚠ 走 `subagent` 时无台账 ⇒ 该条**不适用**，退化为 wave 级并发声明（A0 的附属字段） |
| A7 `scope_declared` | item 声明了写前缀（空数组 = 全树，须显式写） | 字段存在且类型正确 | dispatch | 阻断 | 可机判 | `scope` 是权限层唯一写集表达（`lib/delegate-core.ts:552-572`） |

### B 一波完成（`final` 截面）

| 判据 | 判什么 | 怎么判 | 阶段 | 严重度 | 可机判? | 依据 |
|---|---|---|---|---|---|---|
| B1 `item_committed` | item 分支有 ≥1 个新提交 | `git rev-list --count base_sha..tip > 0` | final | 阻断 | 可机判 | n3 第一步（`nodes/n3/RESULT.md:107`）；口径漂移见 §5.2-R8 |
| B2 `wave_verify` | wave 级**全量**验证 exit 0 | 跑 `.rddf/commit-gate.json` 的 `verify_commands`，看 exit | final | 阻断 | 可机判（以 exit 为准） | `.rddf/commit-gate.json:2-6`；n3 `:84-86` |
| B3 `ledger_closed` | 每个 item 有终态行 | 台账条目有 `merged_sha` 或 `abandoned` | final | 阻断 | 可机判 | D10 同构（`lib/plan-topics.ts:453-461`） |
| B4 `no_inflight` | 无 item 停在「已开始未终态」 | 同上反向 | final | **—**（不设码，只使 `converged=false`） | 可机判 | ADR `:144`（在飞是数据不是判决） |
| B5 `wave_deliverable` | wave 声明的产物存在且非空 | 存在 ∧ `isFile()` ∧ `size>0` | final | 阻断 | 可机判 | `lib/plan-topics.ts:393-405`（`deliverableOk` 同型） |

### C 合并干净（`final` 截面）

| 判据 | 判什么 | 怎么判 | 阶段 | 严重度 | 可机判? | 依据 |
|---|---|---|---|---|---|---|
| C1 `merged_ancestor` | item tip 是 integration 祖先（重放闸门） | `git merge-base --is-ancestor <tip> integration` | final | 阻断 | 可机判 | n3 `:96`（幂等闸门） |
| C2 `no_merge_head` | 集成分支树无半截合并 | `.git/MERGE_HEAD` 不存在 | final | 阻断 | 可机判 | n3 `:98-100` |
| C3 `merge_commit` | 合并产生了 merge commit（非 ff / 非 squash） | `git rev-list --merges integration ^<integration_pre_sha>` 非空 | final | 阻断 | 可机判 | n3 `:17`、`:94-95`（禁用 `--no-ff`/`--squash`） |
| C4 `drift_recorded` | `drift_level` 已记且与实测一致 | 重算 L1/L2/L3 与台账比对 | final | 阻断 | **条件可机判**（L3 的「历史分叉」可判；「语义被改」不可判） | n3 `:144-157`、`:151` |
| C5 `integration_in_target` | 收尾时 integration 已入 `target_ref` | `git merge-base --is-ancestor integration target` | final | 阻断 | 可机判 | n3 `:247-249` |
| C6 `merge_unverified` | merge 未经 commit-gate | 台账 `verify` 段缺失，或其 `at` 早于 `merged_sha` 对应 commit 时间 | final | **info** | 可机判（存在性）/ 需人判（充分性） | `lib/commit-gate.ts:158`（只在 `sub==="commit"` 触发）；n3 `:302-306` |
| C7 `ledger_duplicate` | 同 `(wave,item,tip_sha)` 出现两条终态 | 键去重 | final | 阻断 | 可机判 | n3 `:96-97`（同键重复 ⇒ 审计告警，不重放） |

### D 越界写（`final` 截面）

| 判据 | 判什么 | 怎么判 | 阶段 | 严重度 | 可机判? | 依据 |
|---|---|---|---|---|---|---|
| D1 `out_of_scope_union` | wave 内全部变更 ⊆ 声明前缀的**并** | 一次 union 差集（`git diff --name-only base..integration` 等） | final | 阻断 | 可机判（**union 口径**） | `scripts/plan-topic-check.ts:233-240`（现有单节点实现的反面）；n3 `:200` |
| D2 `attribution` | 越界路径落在哪个 item 的 scope 内 | 前缀求交：命中唯一 ⇒ 可归因；命中多个/零个 ⇒ `unattributed` | final | 阻断 | **条件可机判** | ADR `:317`（残留 #10）；n3 `:139-141`（C3 同型反推） |
| D3 `outside_tree_write` | 是否有写落到**别的树或主仓** | **无信号**（差集只覆盖 `workRoot`） | final | — | **需人判** | `lib/delegate-core.ts:2503-2504`；n2 `:103-105` |
| D4 `shell_write` | 写是否经 `shell` 绕过 `edit` 门 | **无信号**（role-gate 只覆盖 `edit`/`write`） | final | — | **需人判** | `plugins/role-gate.ts:7`；n3 `:308-310` |

### E 失败判定（`final` 截面）

| 判据 | 判什么 | 怎么判 | 阶段 | 严重度 | 可机判? | 依据 |
|---|---|---|---|---|---|---|
| E1 `item_no_evidence` | 报「完成」但零提交零产物 | `tip == base_sha` ∧ 产物空 | final | 阻断 | 可机判 | `lib/delegate-core.ts:2206-2209`（析取→合取的教训）、`:2615-2618`（`unverified`） |
| E2 `verify_red` | wave 验证红 | exit ≠ 0 + 失败命令原文 + 失败文件清单 | final | 阻断 | 可机判 | n3 `:136-142` |
| E3 `verify_attribution` | 验证红但失败文件 ∩ 多 item scope | 求交，唯一 ⇒ 定位；多个 ⇒ 父裁决 | final | 阻断 | **条件可机判** | n3 `:139-141` |
| E4 `rework_open` | 冲突被 abort 而 item 仍无新 tip | 台账 `result=rework` ∧ `tip_sha` 未变 | final | 阻断 | 可机判 | n3 `:123-130` |
| E5 `abandon_unattributed` | 放弃无 `by`/`reason` | 字段校验（`by !== "parent"` 或 `reason` 空） | final | 阻断 | 可机判 | D9 同型（`lib/plan-topics.ts:625-631`） |

### F 中断恢复（`final` 截面）

| 判据 | 判什么 | 怎么判 | 阶段 | 严重度 | 可机判? | 依据 |
|---|---|---|---|---|---|---|
| F1 `liveness` | worker 是否还活着 | **不判**：只把「未终态 + mtime 陈旧」放进 `in_flight[].liveness_stale` 提示 | final | — | **需人判**（不设码） | `lib/plan-topics.ts:852-865`；ADR `:145`（TTL 自动接管会造双活体写者） |
| F2 `worktree_leaked` | wave 已终态而树未收 | `git worktree list` 仍含该路径 | final | **info** | 可机判 | n2 `:316`（F4）；`docs/adr/ADR-front-multi-backend.md:175` |
| F3 `ledger_ref_divergence` | 台账说已合 / ref 不含（或反之） | 双向祖先判定 | final | 阻断 | 可机判 | n3 `:98-100`（第二本账禁令） |
| F4 `rebuild_consistent` | 重建的 worker 与 `TODO.md` 事实一致 | **无信号**（只能读恢复锚点） | final | — | **需人判** | ADR `:103-108` |

### G 产物完整性（`final` 截面）

| 判据 | 判什么 | 怎么判 | 阶段 | 严重度 | 可机判? | 依据 |
|---|---|---|---|---|---|---|
| G1 `items_complete` | `waves.json` 的 item 集合 == 台账终态集合 | 集合相等（差集双向为空） | final | 阻断 | 可机判 | D11「相对集 = 全部节点」同口径（ADR `:163`） |
| G2 `branches_exist` | 声明的分支都还在 | `git show-ref --verify refs/heads/<b>` | final | 阻断 | 可机判 | n3 `:106-107`（分支不删 = 回滚锚点） |
| G3 `abi_declared` | worker 是否声明了「接口面」（C3 归因前提） | 字段存在（内容质量不可判） | final | **info** | 可机判（存在性） | n3 待父裁决 2（`nodes/n3/RESULT.md:339-340`） |

**汇总**：36 条中 —— **可机判 27**、**条件可机判 3**（C4/D2/E3）、**需人判 4**（D3/D4/F1/F4）、**两段标注 2**（C6/G3：存在性可机判、充分性不可判）；**info 3 条**（C6/F2/G3）；**不设码 4 条**（B4/D3/D4/F1，D3/D4 也同时是「需人判」）。

---

## 3. 违规码候选表

> 命名策略：**另立 `BuildViolationCode` 闭集**，不并入 `lib/plan-topics.ts:78-99` 的 20 码 union。理由：两个 CLI 两个载体，合并 union 会让「`out_of_scope` 的写域是谁给的」变成隐式参数（见下表说明）。**共享语义码**（同名同义）在表末单列。

| 码名 | 触发条件 | 严重度 | 与既有 20 码的关系 |
|---|---|---|---|
| `shared: schema_invalid` | `waves.json` / `ledger.json` 不可解析 / 字段类型错 | 阻断 | **重名**：与既有 `schema_invalid` 同名同义 ⇒ **直接复用**，不新造 `wave_schema_invalid`（否则两套 exit 3 口径） |
| `unknown_wave` | `--wave` 指向 `waves.json` 不存在的 id | 阻断 | 新码（既有无对应项） |
| `unknown_item` | 台账出现 `waves.json` 未声明的 item | 阻断 | 新码；与 `orphan_node_dir`（磁盘有、图里无）同型，但方向相反 |
| `empty_wave` | wave 的 `items` 为空 | 阻断 | 与 `empty_topic` **同族不同名**（命名对齐，非重名） |
| `owner_mismatch` | A0 失败 | 阻断 | 新码；**对应 R2 的机械补强** |
| `deps_not_merged` | A1 失败 | 阻断 | 新码。既有面用 **status=blocked_by_deps** 表达同一语义而非违规码（`lib/plan-topics.ts:435-440`）⇒ 有意分家：状态是派生值，码是派发闸门 |
| `base_unpinned` | A2 失败（非全 SHA / 非祖先） | 阻断 | 新码；`baseline` 死字段的直接后果（R4） |
| `baseline_dirty` | A3 失败 | 阻断 | 新码 |
| `worktree_missing` | A4 失败 | 阻断 | 新码 |
| `branch_conflict` | A5 失败（两树同分支） | 阻断 | 新码；git 层的拒绝是「可检测的失败」（`docs/adr/ADR-front-multi-backend.md:157`） |
| `quota_exceeded` | A6 失败 | 阻断 | 新码；既有 delegate 面是**操作被拒**（exit 1）而非判据码（`lib/delegate-async.ts:1337-1347`）⇒ 这里升格为判据，因为 wave 声明可静态检查 |
| `scope_undeclared` | A7 失败 | 阻断 | 新码 |
| `item_not_committed` | B1 失败 | 阻断 | 新码 |
| `wave_verify_failed` | B2 / E2 失败 | 阻断 | 新码；**不要**缩成 `verify_failed` 这类泛名 —— 会与 commit-gate 的「提交被拒」混为一谈 |
| `ledger_unclosed` | B3 失败 | 阻断 | 新码 |
| `inflight_item`（**不设码**） | B4 失败 | —（只落 `summary.in_flight`，使 `converged=false`） | 照抄 D10：在飞不是违规（ADR `:144`），故此处只登记语义、不产生 violation |
| `shared: missing_deliverable` | B5 失败 | 阻断 | **重名同义** ⇒ 复用（`lib/plan-topics.ts:601`） |
| `not_merged` | C1 失败 | 阻断 | 新码 |
| `merge_in_flight` | C2 失败（`MERGE_HEAD` 存在） | 阻断 | 新码；语义 = 「在上次合并点上崩了」，与 `duplicate_open_attempt` 同族（都表达「在飞残留」） |
| `not_merge_commit` | C3 失败 | 阻断 | 新码 |
| `drift_unrecorded` | C4 失败 | 阻断 | 新码 |
| `target_behind` | C5 失败 | 阻断 | 新码 |
| `merge_unverified` | C6 触发 | **info** | 新码（info）。**命名警戒**：不要叫 `verify_missing` —— 会被读成「验证命令没配」，而真实语义是「merge 绕过了 gate」 |
| `ledger_duplicate` | C7 失败 | 阻断 | 新码；与既有 `duplicate_dep` / `duplicate_open_attempt` 同族（`lib/plan-topics.ts:657-671`） |
| `shared: out_of_scope` | D1 / D2 失败 | 阻断 | **重名**（既有 `scripts/plan-topic-check.ts:238` / `lib/plan-topics.ts:96`）。**语义差异必须写死**：既有 = 「不在 `nodes/<nodeId>/` 下」；新面 = 「不在**声明写前缀的并**内」。两者只在 `scope` 参数上不同 ⇒ 若合并 union，须把写域变成显式输入字段；**本轮选择不合并**，重名保留但在 `detail` 里必须写出「写域来源」 |
| `attribution_ambiguous` | D2 命中多个/零个 | 阻断 | 新码 |
| `item_no_evidence` | E1 失败 | 阻断 | **命名冲突（跨域）**：`no_work_evidence` 是 `lib/delegate-core.ts:717,735,757` 的 **outcome 标记名**，不是违规码。⇒ 加 `item_` 前缀避免读者把两者当同一个东西 |
| `attribution_ambiguous`（E3 复用） | E3 命中多个 | 阻断 | 复用上一条（同一语义：归因不可判） |
| `rework_open` | E4 失败 | 阻断 | 新码 |
| `abandon_unattributed` | E5 失败 | 阻断 | 新码；**后缀对齐**既有 `cancelled_unattributed`（`lib/plan-topics.ts:625`），便于读者迁移直觉 |
| `worktree_leaked` | F2 触发 | **info** | 新码（info） |
| `ledger_ref_divergence` | F3 失败 | 阻断 | 新码 |
| `items_incomplete` | G1 失败 | 阻断 | 新码 |
| `branch_missing` | G2 失败 | 阻断 | 新码 |
| `abi_undeclared` | G3 触发 | **info** | 新码（info） |
| `shared: git_error` | git 调用失败（不吞错） | 阻断 | **重名同义** ⇒ 复用（`lib/plan-topics.ts:98`；`scripts/plan-topic-check.ts:195-198`） |

**共享语义码清单（4 个，必须与既有实现**同一份**语义，不得各写一份）**：`schema_invalid` / `missing_deliverable` / `out_of_scope` / `git_error`。
**同族不同名（命名对齐而非重名）**：`empty_wave` / `abandon_unattributed` / `unknown_item`。
**跨域同名警戒（1 个）**：`no_work_evidence`（outcome 标记，不是码）⇒ 新码加前缀。

---

## 4. 退出码与收敛信号

### 4.1 退出码：沿用四值，不扩

| 码 | 含义 | 与既有的关系 |
|---|---|---|
| 0 | 无**阻断**项（`violations` 可能非空，含 info） | 一致（`scripts/plan-topic-check.ts:15-16`） |
| 1 | 有阻断违规 **或操作被拒**（merge 被拒 / claim 被拒） | 一致 |
| 2 | 用法错误（stdout 不含违规列表） | 一致 |
| 3 | `waves.json` / `ledger.json` 缺失或不可解析（**含 schema 违规**） | 一致（`scripts/plan-topic-check.ts:178-185`） |

**理由（四条）**：
1. **唯一消费者是 LLM 父会话**，它读 `--json`；扩码换不来信息（ADR `:167` 原句：「唯一消费方是 LLM 父会话，看 JSON 即可」）。
2. **exit 0 若收窄为「收敛」会破坏中场健康检查**：wave 进行中父必须能区分「健康但未完」与「红了」（ADR `:193` 已按此否决）。
3. **扩码要同批改多处逐字节钉死串**（`prompts/plan.md` 与回滚清单），换零收益（ADR `:167`；`nodes/n3/RESULT.md:331`）。
4. **「合并被拒」已由 1 覆盖**（"操作被拒"这一档本来就是给写侧命令留的）。

**明确否决**：`4 = 未收敛`。理由同上，且它会把「调度信号」升格成退出码语义 ⇒ 父误以为 `exit 0` 就等于交付完成（正是 D11 反复警告的误读）。

【建议】需要「停在哪一步」的信息（例如 merge 因冲突停在 C2）用 `--json` 的 `stopped_at: {kind, item?, detail}` 表达，**不占退出码**。

### 4.2 收敛信号：一条命令给出「还有没有未完成的活」

```bash
bun scripts/build-wave-check.ts check .rddf/build-waves/<topic> [--wave wN] --json
```

> 下文 `bw` 是 `bun scripts/build-wave-check.ts` 的简写。

```jsonc
{
  "ok": true,                       // 只看阻断项（与既有 ok 同义）
  "violations": [{ "code": "...", "item": "n3", "detail": "...",
                   "severity": "error|info", "enforcement": "cli|protocol|post-hoc" }],
  "converged": false,               // 调度信号（恒按 final 口径派生）
  "landed": false,                  // 事实投影：target 已含 integration（不是交付信号）
  "summary": {
    "ready":   [],                  // 可派 item（明细导航，逻辑上冗余）
    "in_flight": [{ "item": "n3", "wave": "w2", "started_at": "...", "liveness_stale": false }],
    "merged":  ["n1"],
    "unmerged":["n3"],
    "abandoned": [{ "item": "n4", "reason": "...", "at": "..." }],
    "blocked": [{ "code": "...", "item": "n3", "detail": "..." }],
    "worktrees":["/path/to/wt-w2-n3"],
    "verify_last": { "at": "...", "exit": 1 }
  }
}
```

**`converged` 的定义**（照抄 D11 的三子句形态，`docs/adr/ADR-plan-multi-session-collaboration.md:162`；原文的「四个条件」指父今天需自行组合的四类事实，收敛布尔只有三个子句）：

```
converged ⇔ ① 零阻断违规（final 口径）
          ∧ ② 每个 item 的台账终态 ∈ {merged, abandoned}
          ∧ ③ 无在飞（无未终态条目 ∧ 无 MERGE_HEAD）
```
- **口径恒定**：`converged` / `summary` 恒按 `final` 派生；`--phase` 只作用于 `violations` 与退出码 ⇒ 允许出现 `ok=true ∧ converged=false`（健康但未完，**刻意的不一致**，ADR `:162`）。
- **锁不进 `converged`**（父自己持锁是正常态；锁释放是收尾动作不是收敛条件 —— 否则「父持锁 ⇒ 永不收敛」，ADR `:162`）。
- **`worktrees` 不进布尔**（`worktree_leaked` 是 info；wave 进行中必然有树）。

### 4.3 为什么这条判据是**调度信号**而不是**交付信号**

1. **既有 ADR 已把这条口径写死，本节点对齐而非重造**：`converged` 回答「还有没有未完成的活」，不回答「这件事做完了吗」—— 后者需对照 `TOPIC.md` 目标段做语义理解（`docs/adr/ADR-plan-multi-session-collaboration.md:158`、`:166-167`、`:302`；`docs/architecture/plan-topics-topic-model.md:98`）。
2. **可操纵性同构**：父能批量把 item 标 `abandoned` 使 `converged=true`（同 D11 的 `cancelled` 通道，ADR `:166`）。缓解也照抄：`abandoned` 桶逐条列 `{item, reason, at}` + 强制 `reason` 非空（`abandon_unattributed`）+ 爆炸半径进 diff。
3. **build 面比 plan 面**更**不可能做交付信号**：plan 面的产物是文字（人能读）；build 面的产物是代码，「做对了吗」只有测试覆盖得到 —— 而测试覆盖 ≠ 正确（n3 §5-1、§5-5：`nodes/n3/RESULT.md:197`、`:201`）。本仓唯一闸门就是 `bun test tests/`（`docs/adr/ADR-plan-multi-session-collaboration.md:14` 前置事实 ⑧）⇒ 用「测试绿」冒充「交付完成」是同一类错误。

### 4.4 命名：`landed`，不是 `delivered`

【建议】把「target 已含 integration」的事实投影命名为 **`landed`**（字节落地），不叫 `delivered`。
理由：`delivered` 在中文语境里与「交付」同形，父会话读到 `delivered: true` 极易当成「这件事做完了」—— 这正好是 D11 警告的误读（ADR `:302`）。而 §5.2-R6 的教训是：**名字本身就是一种承诺**，`lock` 只读、`liveness_stale` 只提示，都是命名先于语义的例子。`landed` 只承诺「字节进了目标分支」，与判据能力等长。

---

## 5. 对既有 `plan` / `plan-worker` 机制的反哺清单

### 5.1 可复用的既有判据/设计（6 条，直接沿用到 build 面）

| # | 可复用什么 | 落点 | 在 build 面怎么用 |
|---|---|---|---|
| U1 | **派生而非自述** | `lib/plan-topics.ts:381-448`（progress/status 全派生）；ADR `:53-63` | 台账只存事实（SHA / exit / 路径），`converged` 由重算得出；**不落 `converged_at`**（ADR `:167` 明确否决落盘） |
| U2 | **两维正交 + phase-gating** | `lib/plan-topics.ts:745-755`、`:828`；ADR `:61`、`:148` | §1.1 照抄；`stale`/`drift` 类码只在 `final` 产生，不在 `dispatch` 产生后降级 |
| U3 | **在飞不设码** | `lib/plan-topics.ts:453-461`、`:700-713`；ADR `:144` | 在飞只进 `in_flight` 桶；`liveness_stale` 只作提示，**不授权接管** |
| U4 | **info 只放「必然中间态」** | `lib/plan-topics.ts:106-120`（`cache_behind` 的取舍理由） | `worktree_leaked` / `merge_unverified` 定为 info 的同一判据；其余一律阻断 |
| U5 | **幂等 + 祖先判定** | `claim` 拒重复（`scripts/plan-topic-check.ts:437-440`）；n3 `:96` | merge 重放用 `merge-base --is-ancestor`；台账同键重复只记审计，不重放 |
| U6 | **台账原子写 + 短锁硬超时不按 mtime 判死** | `scripts/plan-topic-check.ts:325-380` | 台账 tmp+rename；锁硬超时 60s 量级，验证在锁外跑（n3 `:234-240`） |

补充一条**判据形态**层面的可复用项：`lib/delegate-core.ts:2179-2218` 的 `summarizeDelivery` 与 `:2615-2618` 的 `unverified` —— **「宿主/模型说成功 ≠ 有交付」**，判定只看结构化事实（写盘调用数 + 产物数），不看模型文本。build 面的 E1 直接沿用这个析取→合取的口径（该注释 `:2206-2209` 明确记录过一次误判：早先用析取把「shell 写文件」判成无产出）。

### 5.2 既有缺陷（9 条）—— 每条：现象 | 依据 | 新判据面如何避免重演 | 建议动作

#### R1 `owner` 字段被声明但从不消费（ADR D2 承诺 vs 实现）

- **现象**：`owner: "parent" | "child"` 只在 schema 校验处出现，判据库与 CLI **零消费**（`lib/plan-topics.ts` 全文件 3 处命中：`:61` 字段、`:197-199` 校验，无第三处）；而 ADR D2 承诺「`owner: "parent"` 的节点 = 父自己做 ⇒ 父子依赖由此统一表达」（`docs/adr/ADR-plan-multi-session-collaboration.md:62`）。
  **本 topic 自身就有活体实例**：`graph.json:141` 把 n5 声明为 `"owner": "parent"`，`graph.json:146` 却记了一条 `"agent": "plan-worker"` 的 attempt —— 声明说「父自己做」，事实是「子做的」，`check` 从不报警（n5 现已 `finished_at` 且无任何违规）。
- **依据**：`lib/plan-topics.ts:61`、`:197-199`；`docs/adr/ADR-plan-multi-session-collaboration.md:62`；本 topic `.rddf/plan-topics/build-worker-design/graph.json:141`、`:146`。
- **新判据面如何避免重演**：建立**字段 → 判据**的双向映射，写进设计稿的硬约束：任何声明字段必须在 §2 的「依据」列里作为某条判据的**输入**出现，否则不进 schema。落到 build 面即 `waves.json` 的三个字段各自有主：`base_sha` → A2/C1/C4；`target_ref` → C5；`items[].scope` → D1/D2。**没有第四个性字段**。
- **建议动作**：plan 侧二选一 ——（a）`dispatchableNodes` 对 `owner=parent` 的节点输出 `executor: "parent"`（并让 `claim` 拒绝非父会话对 parent 节点的 claim）；（b）从 schema 与 ADR 同时删除 `owner`。**不要**保持现状：声明即承诺，字段在场而无人读 = 读者必然误信。

#### R2 topic 独占锁无机械强制（D7 是纯散文）

- **现象**：`.rddf/state/plan-topics/<slug>.lock` 在 CLI 里**只被读**（`scripts/plan-topic-check.ts:297`），全仓**没有任何命令 `mkdir` 它**；唯一写入方是 prompt 里的人工指令（`prompts/plan.md:280`「获取：`mkdir …`（原子），成功后把 session id 写进该目录的 `owner` 文件」）。而 `claim` / `close` / `cancel` 只取 graph 短锁（`:337`），**派发面完全不看 `.lock`**。
  测试把这条钉成缺陷，措辞本身就是证据：`"D3 锁被他人持有仍可派（钉住缺陷：无锁判据）"`（`tests/plan-topics-dag.test.ts:374`）、`"D4 全节点 done 但锁未释放 ⇒ 无判据（钉住缺陷）"`（`:385`）。
- **依据**：`scripts/plan-topic-check.ts:286-320`、`:297`、`:337`；`prompts/plan.md:280`；`tests/plan-topics-dag.test.ts:374-393`；`docs/adr/ADR-plan-multi-session-collaboration.md:113`（D7 语义）。
- **新判据面如何避免重演**：不设「只读的锁命令 + 散文纪律」，而是**一个命令原子完成「拿锁 + 校验归属」**：`bw wave begin --owner <session>`（`mkdir` + 写 owner + 若已存在则读 owner 比对）；此后所有写侧命令在锁内校验 `owner == 调用方`，不等即拒（`owner_mismatch`，A0）。**归属校验必须在写之前**（同 D7.3 的顺序硬约束，`docs/adr/ADR-plan-delegate-engineering-session.md:105`）。
- **建议动作**：plan 侧把锁获取并入 `claim`（或新增 `lock acquire`/`release`），并补一个归属冲突的阻断码（build 面已命名为 `owner_mismatch`，见 §3）；把 D3/D4 两个用例的「钉住缺陷」措辞改写为「已实现」。若父认为本期不动，则必须在文档里把「独占」降级为**协议**并删掉 D7 的机械暗示 —— 二选一，不允许两者并存。

#### R3 `scope-check` 文档承诺的 union 口径未实现

- **现象**：文档三处承诺「并行只做 topic 级 union」（`docs/architecture/plan-topics-topic-model.md:78`、`:130`；ADR V10 `:255`），但实现只接受**单个** node 且 `allowedPrefix` 恒为 `nodes/<nodeId>`（`scripts/plan-topic-check.ts:233`），循环里对任何非该前缀的路径判越界（`:235-240`）。⇒ 并行时兄弟节点的产物被算成自己的越界。
  同样有钉住用例：`"D5 scope-check 在并行下把别人的产物算成越界（钉住缺陷）"`（`tests/plan-topics-dag.test.ts:395-404`，断言 `detail` 里出现 `nodes/b1/`）。
- **依据**：`scripts/plan-topic-check.ts:200-241`；`docs/architecture/plan-topics-topic-model.md:78`、`:130`；`docs/adr/ADR-plan-multi-session-collaboration.md:255`、`:317`；`tests/plan-topics-dag.test.ts:395-404`。
- **新判据面如何避免重演**：build 面**只实现 union 形态** —— 判据参数是 `--wave`（一组 item），不是 `--node`；每条 violation 的 `detail` 前置 `[union]` 标记并写明其所属声明写域（不新增字段，靠约定）。**绝不提供 per-worker 归因的假象**（D2 明确标为「条件可机判」且命中多个就输出 `unattributed`）。
- **建议动作**：plan 侧给 `scope-check` 加 `--union <node...>` / `--topic` 模式（一次差集、按 item 前缀求交做**尽力**归因），把 V10 的「单飞口径」升级为双模式；**或者**删掉文档里的 union 承诺。**承诺未实现比没有承诺更坏**：读者会按 union 去跑并行，然后看到假阳性告警，进而学会忽略告警（alert fatigue，ADR `:151` 同型论证）。

#### R4 `attempts[].baseline` 是死字段，且相对 ref 基线会漂

- **现象**：`Attempt.baseline?: string` 在类型里（`lib/plan-topics.ts:50`）、在 schema 文档的示例里（`docs/architecture/plan-topics-topic-model.md:35` 写作 `"baseline": "<sha>"`），但 `claim` 只写 `agent` / `started_at` / `precheck` / `input`（`scripts/plan-topic-check.ts:458-463`）⇒ **全仓没有写入点**；`--baseline` 这个 flag 只服务 `scope-check`（`:124-129`、`:203`）。
  同时 D6 用例证明「相对 ref 当基线会漏检」：`"D6 baseline 用相对 ref 时漂移 ⇒ 漏检（钉住缺陷）"`（`tests/plan-topics-dag.test.ts:406-416`）。
- **依据**：`lib/plan-topics.ts:50`；`docs/architecture/plan-topics-topic-model.md:35`；`scripts/plan-topic-check.ts:458-463`；`tests/plan-topics-dag.test.ts:406-416`；ADR `:153`（「要么实装要么删除，不留死字段」—— 该句原本针对 `graph_rev`，同一纪律适用）。
- **新判据面如何避免重演**：`base_sha` 由 CLI 在建树时**自动写入**（`git rev-parse HEAD`），存**全 SHA 不存 ref**，且被 A2 / C1 / C4 三条判据消费；缺失即阻断（`base_unpinned`），**不允许人工手填**（手填 = 纪律型字段，忘填即静默失效，ADR `:189` 有同型论证）。
- **建议动作**：plan 侧 `claim` 追加 `baseline: git rev-parse HEAD`（一行代码 + 一个字段消费点），并让 `stale_inputs`/`scope-check` 使用它；若不愿实装，删字段与文档示例。

#### R5 `precheck` 是自述式凭据（判据侧从不读）

- **现象**：`claim` 写 `precheck: {at, exit, graph_rev}`（`scripts/plan-topic-check.ts:456-461`），但 checker **从不读 `precheck`**；且 `claim` 自己注明「precheck：派发前的 dispatch 口径 check（结果留痕；**不因此拒绝**）」(`:455`)。ADR 还记过它曾经「恒为 1 ⇒ 凭据判别力归零」的事故（`:61`）。
- **依据**：`scripts/plan-topic-check.ts:455-461`；`docs/adr/ADR-plan-multi-session-collaboration.md:61`；n3 反例 A「把验收结论写进 commit message = 自述」（`nodes/n3/RESULT.md:267-269`）。
- **新判据面如何避免重演**：台账里**只写可被外部复核的事实**：`verify: {commands[], exit, at}`（命令原文 + 退出码 + 时间），**不写** `result: "pass"` 这类结论字段；`converged` 永远由判据侧重算，不读台账的自述布尔。
- **建议动作**：plan 侧要么把 `precheck` 并入 `summary`（当历史快照展示，明确「不参与判定」），要么删字段。**保留 + 不消费 + 名字像闸门**是三件坏事同时发生。

#### R6 名字与强制等级脱节（`lock` 像闸门、`scope-check` 像闸门、`liveness_stale` 像判活）

- **现象**：`lock` 子命令**只读**（`scripts/plan-topic-check.ts:286-320`，函数体只有读 + 输出）；`scope-check` 是事后核对（`docs/architecture/plan-topics-topic-model.md:130` 自述）；`liveness_stale` 只是 mtime 提示（`lib/plan-topics.ts:852-865`），ADR 专门为「`stale` 同名不同义」做过命名消歧（`:144`）。
- **依据**：`scripts/plan-topic-check.ts:286-320`；`docs/architecture/plan-topics-topic-model.md:130`；`lib/plan-topics.ts:852-865`；ADR `:144`。
- **新判据面如何避免重演**：每条判据的**同一行**里必须写「强制等级」，四值闭集：`权限强制` / `CLI 强制` / `协议` / `仅事后可见`；`--json` 每条 violation 带 `enforcement`。诚实口径：build 面**几乎没有**权限强制（n2 §6.3：`subagent` 通道零权限强制；`delegate` 通道的 `scope` 只能到目录前缀，`lib/delegate-core.ts:552-572`）⇒ 绝大多数条目会是 `协议` / `仅事后可见`，**这一列本身就是结论**。
- **建议动作**：plan 侧给 `Violation` 增可选 `enforcement`（纯增量、不改码集），并在 topic-model §4 的表里补一列。成本极低，收益是「读者不会被名字骗」。

#### R7 判据与写入点的落地顺序（判据不得早于写入点）

- **现象**：ADR 已把这条写成硬约束 ——「`input` 快照的**自动写入**依赖 `claim` 写入点 ⇒ **判据不得早于写入点落地**（否则退化为纪律型字段）」（`:156`）；D11 同样要求「既有钉死点同批反转」（`:168`）。plan 侧已因此闭合过一条（残留 #11 已标 ✅，`:318`）。
- **依据**：`docs/adr/ADR-plan-multi-session-collaboration.md:156`、`:168`、`:318`；`docs/architecture/plan-topics-topic-model.md:102-103`。
- **新判据面如何避免重演**：§2 每一条码在落地时必须有**四件套**：① 写入点（谁在生产这个事实）② 判据（谁读它）③ 负向 fixture ④ 一条正例。四缺一不上线；§2 的「依据」列就是四件套的索引。**特别警告**：`abi_declared`(G3) 现在只有③②没有① —— 所以它只配当 info，且必须在 worker 简报模板里先加字段（n3 待父裁决 2）。
- **建议动作**：把这条抄进 build 面 ADR 的「落地顺序」段（plan 侧无需再改）。

#### R8 `plan-worker` 的权限模板不能直接复制（build-worker 的必要条件是「能提交」）

- **现象**：plan-worker 的权限面把「写」压到了极限 —— `edit` 默认 `deny` 只放行 `*.rddf/plan-topics/*`（`opencode.jsonc.opencode-go:1491-1494`），`git commit` / `git commit *` **显式 deny**（`:1435-1436`），`shell` 首键 `"*": "deny"` 且 `* > *` / `tee *` / `sort * -o*` 全 deny（`:1373`、`:1443`、`:1451`），prompt 还写着「不跑 `bun` / `node` / 任何写盘 shell」（`prompts/plan-worker.md:36`）。
  若 build-worker 照抄，则 **n3 的第一步（worker 在自己分支提交，`nodes/n3/RESULT.md:107`）不可能完成** ⇒ B1 `item_committed` 恒红，且失败会被判成 worker 违纪（把 systemic 失败当个体失败）。
  更糟的是仓库里「worker 能不能 commit」的口径本身就是漂移的：`prompts/build.md:355` 写「本仓后端**被禁止 commit**」，而 `lib/delegate-core.ts:1645` 写「`git commit` 由工具层验证门决定（验证绿即可提交）」。
- **依据**：`opencode.jsonc.opencode-go:1373`、`:1435-1436`、`:1443-1451`、`:1491-1494`；`prompts/plan-worker.md:36`；`prompts/build.md:355`；`lib/delegate-core.ts:1645`；`nodes/n3/RESULT.md:317-321`。
- **新判据面如何避免重演**：把「前置断言」与「判据」分开写死。build-worker 的**前提清单**（不属判据，属不可满足性检查）至少三条：① `git commit` 必须 allow（否则 B1 不可满足）；② shell 必须允许跑 `.rddf/commit-gate.json` 的验证命令（否则 B2 不可满足）；③ `edit` 允许范围 ⊇ 其 cwd 树（否则 D1 会在第一步就红）。判据 CLI 可以提供一条 `bw doctor --json` 把这三条当**环境自检**输出 —— 但**它的失败不是违规**，是「判据面不适用」。
- **建议动作**：父裁决 `prompts/build.md:355` 由谁修（n3 待父裁决 3 已登记同一项，`nodes/n3/RESULT.md:341-342`）；build-worker 配置里显式列「必须 allow 的动作集」，并加一条守卫断言（仿 V02 / V02b 的形态，`docs/adr/ADR-plan-multi-session-collaboration.md:245-246`）。

#### R9 已有「钉住缺陷」的测试是好实践，但缺 owner 与退出条件

- **现象**：`tests/plan-topics-dag.test.ts` 里 4 个用例名直接写「（钉住缺陷）」（`:374`、`:385`、`:395`、`:406`）。这是**好**的：它把「已知边界」变成回归锚点，比沉默强（与「已知不可机判清单」同一诚实口径，ADR `:285-302`）。**不好**的是：缺陷没有 id、没有触发条件、没有退出条件 ⇒ 读者只能从用例名猜严重度，且无人会在修好后删掉「钉住」措辞（现状 D3/D4/D5/D6 里至少 D3/D4 的措辞已经与 ADR 的 D7 承诺相反）。
- **依据**：`tests/plan-topics-dag.test.ts:374`、`:385`、`:395`、`:406`；`docs/adr/ADR-plan-multi-session-collaboration.md:285-302`（不可机判清单体例）。
- **新判据面如何避免重演**：build 面每个「已知边界」测试必须带三件：`// DEFECT: <code> since=<date>` / 触发条件一行 / 退出条件一行（「当 X 码上线后本用例改为正向断言」）。同时把该缺陷登记进 `summary` 的一个桶（如 `known_gaps[]`），使**判据输出**能自报「我现在有哪些判据是缺的」。
- **建议动作**：plan 侧在 4 个用例上方补 `DEFECT:` 注释（纯注释，零行为变更），并把「修好后删措辞」写成 checklist 项；本节点的 §2 已按同一形态给出 4 条「需人判」、2 条「两段标注」、3 条 info，可直接当模板。

### 5.3 反哺清单的收敛判断

【建议】9 条里 **R1/R2/R3/R4** 是「**声明与实际能力脱节**」的四个变体（字段、锁、命令、基线），**R5/R6** 是「**自述/命名**」的两个变体，**R7/R9** 是「**流程纪律**」，**R8** 是「**模板复用风险**」。这五类正好覆盖 build 面判据有可能重犯的全部形态 —— 因此 §2 的 36 条判据在设计时对每一类都留了对应的防御位（字段映射表 / 原子命令 / enforcement 列 / 四件套 / 前提清单）。

---

## 6. 本设计**不**声称的东西（诚实口径）

1. **不声称「合并干净」等价于「功能正确」**：C1–C7 只判字节与拓扑（祖先关系、merge commit 存在、无 `MERGE_HEAD`）。语义等价性属 n3 §5-1 不可机判项（`nodes/n3/RESULT.md:197`）。
2. **不声称能拦住越界写**：D1 是事后差集，D3/D4 直接标「需人判」（`nodes/n2/RESULT.md:300-305`；`plugins/role-gate.ts:7`）。
3. **不声称 `converged=true` 表示交付完成**：§4.3 已论证；真正的唯一出口是人读 `TOPIC.md` 目标段 + diff。
4. **不声称判据面能在 `subagent` 通道上获得权限强制**：n2 §6.2/§6.3 已定上限（`nodes/n2/RESULT.md:236-256`）；本面里 `enforcement` 列会把这条如实标成 `协议` / `仅事后可见`。
5. **不声称 `abi_declared`(G3) 有闸门**：它只判字段存在，不判接口面是否正确（n3 待父裁决 2）。

---

## 7. 待父裁决

1. **载体归属**：`waves.json` / `ledger.json` 放 `.rddf/build-waves/<topic>/` 是否与 `.rddf/plan-topics/**` 的分家纪律冲突？两者都是「协作区」但一个产讨论稿、一个产实施记录；若父认为应复用 `.rddf/plan-topics/<topic>/` 下的子目录，则 §1.2 的表要改，判据本身不变（判据只依赖「声明文件 + 台账」两种角色，不依赖路径）。
2. **G3 / C4 需要 worker 声明「接口面」**：本仓目前没有这个字段（n3 待父裁决 2）。若不新增，C4 的 L2 只能靠「漂移文件 ∩ 变更文件」判定，G3 整条删除 ⇒ §2 的 info 数从 3 降到 2（仍满足验收）。
3. **R8 的口径修复归属**：`prompts/build.md:355` 与 `lib/delegate-core.ts:1645` 冲突未修之前，B1 判据**不可上线**（否则第一波就红且归因错）。请父决定该项由谁在同批修。
4. **是否把 `merge_unverified` 升为阻断**：本节点定 info，理由是「当前没有任何机制能产出合格证据 ⇒ 阻断会恒红」。若父决定同时引入「合并前后双跑验证」的硬机制，则该码可升阻断 —— 但两件事必须同批（R7）。

---

## STATUS: COMPLETE
