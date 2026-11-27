# RESULT — n3：合并与冲突语义

> 类别标注：**〔事实〕** = 本仓可引（带 `path:line`）；**〔推断〕** = 由事实推出、本仓无直接断言；**〔git 语义〕** = 外部工具行为，**未在本仓核实**（按 TOPIC 约束不编造行号）；**〔建议〕** = 供 n4 / n7 / 合稿消费。
> 输入依据：n2 已产出并选定 **C1 worktree 隔离**（`nodes/n2/RESULT.md:8`、`:175`）⇒ 本文按 **C1 单支**给合并语义（BRIEF 的两分支要求仅在 n2 缺失时生效；退化口径见 §1.2）。

## 0. 结论先行

**合并模型 = 「每 wave 一次入临时集成分支，全部 wave 结束后一次入主分支」（共 N+1 次），执行者是 `build` 会话（优先为派发到集成分支 worktree 的后端），派发方只派发不碰文件，且每一次合并都必须「`--no-ff --no-commit` + 另起一次受门禁的 `git commit`」。**

六条不可含糊的决定：

| # | 决定 | 一句话理由 |
|---|---|---|
| M1 | 合到**临时集成分支** `rddf/integ/<topic>`（不直接合主分支），最后一次性进主分支 | 每 wave 直接合主分支会把半成品 commit 落在用户可见分支上，且每个 commit 都要过 commit-gate 三判据（`prompts/build.md:858`）—— 半成品几乎必然红 |
| M2 | **每 wave join 后立即合一次**（不是全部结束后合一次） | 冲突面从 1-vs-(N-1) 降为 1-vs-1，且早暴露；延迟合并会让 N 个 wave 同时撞在同一个 merge-base 上，人判成本乘 N（§2.3） |
| M3 | 执行者 = **`build`**，不是 `plan` / `front` | 只有 `build` 同时具备「能 merge」与「能过门禁 commit」；`plan` 能 merge 但 `git commit` 被显式 `deny`（`opencode.jsonc:204-205`）⇒ 让它合并等于逼它走 `merge` 自动提交的旁路（§2.2 与发现 ①） |
| M4 | **禁止 `git merge` 自动提交**：一律 `--no-ff --no-commit`，然后单独一次 `git commit` | commit-gate 只识别 `commit` 子命令（`lib/commit-gate.ts:831`、`plugins/commit-gate.ts:7`）⇒ 自动提交的 merge 绕过验证门与写集判定 |
| M5 | 幂等键 = `(wave_branch, wave_tip_sha)`；判据 `git merge-base --is-ancestor <tip> <integ>` | 重跑同一 tip 必须是无操作（no-op），而不是"再合一遍"；本仓已有该原语用法（`tests/helpers/real-repo-git.ts:97`） |
| M6 | 冲突分 **6 类**，其中 4 类含可机判成分、2 类纯人判；**基线漂移单列** | 「无冲突标记」≠「语义安全」—— 跨文件依赖与基线漂移都能干净合入然后炸（§3 C-3/C-4） |

〔必须上报〕（最重）`merge-commit-bypass` —— `git merge` 会自建 commit，而 commit-gate 只拦 `git commit`（`lib/commit-gate.ts:831`、`plugins/commit-gate.ts:7`）。这条旁路同时绕开三样东西：验证命令、角色写集判定、以及 `plan` 自己的 `git commit: deny`（`opencode.jsonc:204-205`）。**合并语义若不把「禁止自动提交」写成硬约束，整套写隔离就有一个一键旁路**（§4、§8）。

---

## 1. 依据与边界

### 1.1 从 n2 继承的前提（只消费，不重选）

| 前提 | 内容 | 依据 |
|---|---|---|
| P1 | 一个 wave = 一个 linked worktree = 一个活跃后端 | `nodes/n2/RESULT.md:175` |
| P2 | 槽位键 = `workRoot` ⇒ 每个 worktree 天然一槽，跨 worktree 并行在 delegate 语义内**合法** | `lib/delegate-core.ts:154` |
| P3 | 差集与 `scope` 解析基准 = `workRoot` ⇒ 每棵树的 `git status` 只含自己的变更 | `lib/delegate-core.ts:2503`、`:2593-2604` |
| P4 | 状态文件（pair/role/ledger）落 `stateRoot`（worktree 下 = 主仓） | `lib/delegate-core.ts:474-478`、`docs/adr/ADR-canonical-root-normalization.md:61-62` |
| P5 | 全局并发上限 3（`RDDF_MAX_ACTIVE_BACKENDS`） | `lib/delegate-async.ts:96-101` |

⇒ 合并的对象必然是 **N 个 branch**（不是 N 个目录、也不是 N 个 clone）。这一句是本文全篇的地基。

### 1.2 退化口径（不展开，只登记）

- 若 n2 的结论被推翻为 **C2/C3（同树分支 / 子树）**：合并对象退化为「同一 worktree 的不同分支」或「同一 index 的交叉污染」⇒ 本文 §3 的 C-1/C-2 仍适用，但**无 merge-base 可依**（每方都在改写同一工作树），合并语义整体不成立 ⇒ 应否决并行。
- 若退化为 **C4（不并行 + 上下文外置）**：**没有合并动作**，本文全部失效（这正是 C4 的代价，`nodes/n2/RESULT.md:163`）。
- 若退化为 **C5（独立 clone）**：合并退回跨仓 patch，失去三方合并与 `merge-base`，§3 的 C-4 退化为「人工比对」，本文不为其背书。

---

## 2. 合并模型

### 2.1 三个分支角色与一个工作树

| 角色 | 命名 | 生命周期 | 谁建 |
|---|---|---|---|
| wave 分支 | `rddf/wave/<topic>/<wave-id>` | wave 开始 → 合入 integ 后保留（见 §9.1 `wave-branch-retention`） | 派发方（`git worktree add -b`） |
| 集成分支 | `rddf/integ/<topic>` | topic 开始 → 全部 wave 合入 → 进主分支后保留为审计点 | 派发方（从 wave 0 的基线 sha 切出） |
| 主分支 | 派发前记录的**名字 + tip sha** | 不动，直到最后一步 | 不新建 |
| 集成 worktree | `<repo-parent>/rddf-wt/<topic>-integ` | topic 全程 | 派发方 |

两条硬约束（承接 n2）：

1. **集成 worktree 必须建在仓根之外**：仓内建会让主 worktree 的 `git status` 多出未跟踪目录，从而污染**其它会话**的 `outOfScope` 计算（`lib/delegate-core.ts:2601-2604`）。
2. **集成分支在同一时刻只有一个写者**：它是一棵 worktree ⇒ 天然一槽（`lib/delegate-core.ts:154`）⇒ 合并期与 wave 期不会共享 index。

### 2.2 谁合：执行面事实决定，不是偏好

〔事实〕三个 agent 的 shell 面**不对称**：

| 动作 | `plan` | `front` | `build` |
|---|---|---|---|
| `git merge` | **可**（`"*": "allow"` 且未列 deny，`opencode.jsonc:132`、`:190-211`） | **不可**（`"*": "deny"` 白名单只放只读 git，`opencode.jsonc:257`、`:296-304`） | **可**（`"*": "allow"`，`opencode.jsonc:58-59`） |
| `git worktree add/remove` | **可**（同上，仅 `list` 单独列出为 allow，`:177`） | **不可** | **可** |
| `git commit` | **不可**（显式 deny，`opencode.jsonc:204-205`） | **不可** | **可**（`:70-71`，但受工具层 commit-gate 拦截） |

⇒ 〔推断〕**唯一能「合并并留下受门禁的 commit」的会话类型是 `build`**。`plan` 若执行合并，它唯一能落地结果的方式就是 `git merge` 的自动提交 —— 那正好绕开它自己的 `git commit: deny` 与 commit-gate。**所以本文把「合并执行者 = build」写成硬决定，而不是分工建议。**

〔建议〕执行者优先取 **派发到集成分支 worktree 的 `build` 后端**（而非 build 主会话），因为：

- 合并的中间态（`MERGE_HEAD`、冲突标记、（可能的）未提交解决）+ 主工作树混在一起时，主工作树会被弄脏，而主工作树是用户与其它会话的可观察面；
- 租约键 = `(workRoot, role)`（`lib/role-lease.ts:313-317`）⇒ 主会话在主 worktree 里切 builder 角色，会与「用户正在主树里干别的活」竞争同一把租约（`prompts/build.md:197`）；
- 合并后端在 integ worktree 里是唯一写者，合并结束即释放槽位，`git status` 差集（`lib/delegate-core.ts:2593-2604`）恰好就是「这次合并引入了什么」，是天然的留痕。

〔事实〕这条路线有一个**现存摩擦**：`plan` 派 `build` 必须带**存在**的 `plan_ref`（`lib/delegate-core.ts:1337-1342`、`:2340`），而 plan-topics 目录不在 `PLAN_REF_ROOTS` 内（`docs/adr/ADR-plan-multi-session-collaboration.md:51`）⇒ 合并任务若由 `plan` 派发，必须先把它物化成 `.rddf/plans/<slug>.md`。若由 `front` 派发则无此门（`lib/delegate-core.ts:2340` 的条件含 `callerAgent === "plan"`）。这是 n5 的裁决面，本文只登记其**对合并语义的必要性**：不需要 plan_ref 也**不能**取消「合并必须有书面合并计划」这一条，否则合并顺序无依据（§3 C-3）。

### 2.3 何时合：每 wave join 后立即合一次（明确选择）

选择：**wave 的全部后端转入非占用态（`idle` / `suspended` / `tombstone`）之后，立即把该 wave 合入 integ；不等其它 wave。**

三条理由，按重要性排序：

1. **冲突面对比**：立即合 = 每次只解「这 N 个 wave 与已有 integ」的 1-vs-1 冲突；延迟合 = 所有 wave 共享同一个 merge-base ⇒ 每个 wave 都要与"其它所有 wave 的并集"比 ⇒ 冲突定位从「两组改动」变成「一锅」。
2. **依赖顺序可控**（§3 C-3）：跨文件接口冲突在 git 层零冲突，只能靠验证发现；立即合 ⇒ 第二波合入时就跑验证，能定位到「是这一波破坏了前一波的接口」；延迟合 ⇒ 验证红时无法归因。
3. **基线漂移窗口短**：integr 与 wave 的基线差在每个 wave 结束时都很小（一次 wave 的墙钟）；延迟合会让窗口等于整个 topic 的墙钟，C-4 的处理成本随窗口线性增长。

不允许的时机（明确排除）：

- **不能早于 join**：后端仍 `active`（`lib/delegate-core.ts:117-128`）时合，wave 分支 tip 仍在变 ⇒ 合并对象不稳定，且会与在飞写者抢同一份语义（虽然不同 worktree，但「合的是哪个 sha」不可判）。
- **不能晚到「全部结束一次合」**：见上三条。
- **不能逐 wave 直接合主分支**：主分支上每个 commit 都要过 commit-gate 三判据（`prompts/build.md:858`：暂存非空 / 验证全绿 / 写集合规）⇒ 中途态几乎必然不满足全量验证 ⇒ 要么被拒（流程卡死），要么被 `merge` 自动提交绕过（发现 ①）。

### 2.4 合几次

`N + 1`：N 次 `wave → integ`，1 次 `integ → main`。最后一次**仍用 `--no-ff --no-commit` + gated commit**（即使可 fast-forward），因为：

- 需要一个可判定的「这一批已入主分支」的引用点 ⇒ `git merge-base --is-ancestor <integ_tip> <main_tip>`（同 M5 原语）；
- 合并 commit 的 message 是唯一能同时装下「哪些 wave / 各自 tip / 验证 exit」的载体（§6 留痕）；
- fast-forward 会让 N 个 wave commit 直接出现在主分支上而不留合并记录，破坏「一次合并 = 一个审计单元」。

### 2.5 幂等性

| 场景 | 判定 | 行为 |
|---|---|---|
| 同一 wave 被重复合（父压缩后重跑） | `git merge-base --is-ancestor <wave_tip> <integ_tip>` 为真 | **no-op**，不产生新 commit，只补一条「已合」记录 |
| 同一 wave 分支 tip 已变（后端被 resume 后又提交） | 幂等键变了 | **新合并**，且必须在 merge message 里同时写旧 tip 与新 tip（否则看不出是「补交」还是「重放」） |
| 上次合并停在冲突态（`MERGE_HEAD` 残留） | `git rev-parse --verify MERGE_HEAD` 成功 | **必须先 `git merge --abort`** 再重试；不带 abort 的重试是禁止项（〔git 语义〕残留的 merge 状态会让第二次 merge 语义错乱） |
| 冲突已解但未提交 | index 有冲突解决结果、无 `MERGE_HEAD`？ | 属于「半完成」⇒ 禁止继续合下一个 wave，必须先 `commit` 或 `abort` |

禁止项（不是「不推荐」，是禁止）：`-X ours` / `-X theirs` 作为**默认策略**。理由是它们是「静默丢一侧」，把 C-2 的冲突变成不可见 —— 与本仓「派生而非自造」「不伪装成有闸门」（`docs/adr/ADR-plan-multi-session-collaboration.md:285-302`）的纪律相反。

### 2.6 每次合并的固定形态（可机械复述的步骤）

〔git 语义〕以下命令序列的语义未在本仓核实，但**形态**是可固定的：

1. `git -C <integ-wt> merge --no-ff --no-commit --no-edit <wave_branch>`
2. 冲突判：`git -C <integ-wt> status --porcelain` 中 `UU|AA|DU|UD` 条目是否为空（§3 判据）
3. 无冲突 ⇒ `git -C <integ-wt> add -A`；有冲突 ⇒ 按 §3 处置后 add
4. **单独一次** `git commit`（一条命令只放一条，见 `prompts/build.md:861-863`）⇒ 受 commit-gate 三判据
5. 落合并记录（与 commit **同一次**写，见 §5.3）
6. 跑全量验证，exit code 写进记录（不是写进 commit message —— commit 已生成，不能事后改）

---

## 3. 冲突分类表

> 每类都标注**可机判 / 需人判**。「判定方法」列里，机判项写判据、人判项写「为何机判不了」。

| # | 冲突形态（具体例子） | 判定方法 | 处置策略 | 留痕要求 |
|---|---|---|---|---|
| **C-1** | **同文件不同 hunk**：wave A 改 `lib/delegate-core.ts` 的 `CONSTANT_DENY`（`:48-81`），wave B 改同文件 `canonicalRoot`（`:482-489`） | **可机判**：`merge --no-commit` 后 `status --porcelain` 无 `UU` 条目；或预先用 `git merge-tree --write-tree`（〔git 语义〕） | **自动合并**，不派人。合并后**必须跑全量验证**——「无冲突标记」只是文件级成功，不等于语义成功（见 C-3） | merge commit message 带 `wave=<id>` / `tip=<sha>` / `base=<sha>` / `verify_exit=<n>` |
| **C-2** | **同文件同一 hunk**：两波改同一函数的同一行（例如都把 `if (!a) return` 改成不同实现） | **可机判（冲突存在性）**：`UU` 条目非空；**需人判（怎么解）**：两实现的语义取舍不可机判 | **不自动解**：① 先判「这是不是派发侧错误」—— 若两 wave 的 BRIEF 写域重叠且存在同 hunk ⇒ 说明**派发时的写域划分**错了，应拒绝合并并回退到重划 wave（不是合并侧能修的问题）；② 确实是合理重叠 ⇒ 人裁决，裁决结果落成 integ 上的一次独立 commit（不夹在 merge commit 里） | 冲突文件清单 + 两侧 diff 片段 + 裁决人与裁决结论（写在 resolution commit message）+ `merge block=conflict` 记录 |
| **C-3** | **跨文件依赖顺序冲突**：wave A 改 `classPermissions` 签名（`lib/delegate-core.ts:1266-1288`），wave B 新增调用点；**git 层零冲突** | **可机判（是否冲突）**：合并后全量验证（`bun test tests/` / 类型检查）exit ≠ 0 ⇒ 是；**需人判（谁该退让）**：验证只能说"红"，说不出"该改哪边" | **依赖顺序决定合并顺序**：被依赖方（改接口）先行；依赖方后行，并在其合并后立即跑验证。若依赖方先合 ⇒ integ 上必然红 ⇒ **禁止「先合再修」**（把红状态留在集成分支会污染后续 wave 的 merge-base 与验证基线） | wave 的依赖声明 + 合并顺序表（书面合并计划，§2.2 的 `plan_ref` 或等价物）+ 每次合并后的验证 exit |
| **C-4** | **基线漂移**：wave 从 `base0` 切出；wave 期间主分支前进到 `base1`（用户 / 其它会话提交）；合入时 integ 已含 `base1` | **可机判（是否漂移）**：`git merge-base <wave_branch> <integ_tip>` ≠ 该 wave 的创建基线；漂移幅度 = `git rev-list --count <merge_base>..<integ_tip>`。⚠ 该基线**目前没有可信落点**：`attempts[].baseline` 是死字段（`docs/adr/ADR-plan-multi-session-collaboration.md:354`），delegate 侧无对应字段 | **不 rebase wave 分支**（rebase 重写 wave 的每个 commit ⇒ 破坏「wave = 一个审计单元」与 merge-base 证据）；在 integ 上正常 merge，但**合并后必须重跑整套验证**；验证红时判定为「wave 需重新验证」而非「合并侧可修」 | 记录 `integ_tip_before` / `merge_base` / `wave_tip` / 漂移 commit 数 / 验证 exit；漂移 >0 时该条记录必须显式标注（否则与「无漂移的干净合并」无法区分） |
| **C-5** | **写集 / 角色冲突**：某 wave 改了治理面文件（`docs/adr/**`、`lib/**`），合并后的暂存集包含这些文件，而执行合并的会话当前角色写集不覆盖它们 | **可机判**：commit-gate 三判据（`prompts/build.md:858`、`plugins/commit-gate.ts:107-123`）；合并前可**预判**：`git diff --name-only <integ_tip> <wave_tip>` 对当前角色逐文件跑写集判定 | **不换角色合**（角色切换会改 `role.json` 镜像并触发租约竞争，`lib/role-lease.ts:129`、`:313-317`）；改为：把该 wave 的合并交给写集覆盖并集的那个角色会话，或**按写集切 wave**（同一 wave 不得跨写集类） | commit-gate 的 Tool.Error 文本即留痕（工具层拒绝）；合并记录写 `blocked_by=commit_gate` + 文件清单 |
| **C-6** | **生成物 / lockfile / 追加型文档**：两 wave 各自改了 `bun.lock`、`dist/*`、或都往 `docs/CHANGELOG.md` 末尾追加 | **可机判（属于此类）**：路径命中生成物清单 / 该文件由构建或依赖解析生成；**不可机判（内容对不对）**：只能重生成后用验证兜 | **no-merge、regen**：这类文件取任一侧 + 用原命令重新生成（`bun install` / 构建），生成动作放在 commit **之前**、验证**之前**；禁止手改冲突标记 | 重生成命令 + 重生成前后 hash；若重生成有 diff ⇒ 该 diff 必须进同一次 commit（不得留工作区脏） |

**分类表的自检**：C-1/C-2 是「文件级冲突」，C-3/C-4 是「文件级无冲突但语义有冲突」，C-5 是「机制层冲突」，C-6 是「可再生物」。四组不重叠；**基线漂移（C-4）单独立类，不并入 C-1**，理由：它**没有** `UU` 条目、git 会「干净地」合并 —— 若并入同文件类，会被「无冲突 = 安全」的直觉吞掉，这是本文最想防的错误。

---

## 4. 「不可机判」清单（对齐本仓 ADR 体例）

| 项 | 为何不可判 | 现行兜底 |
|---|---|---|
| C-2 的「该保留哪一侧」 | 语义取舍，无机械信号 | 冲突清单 + 人裁决 + 独立 resolution commit（可审计、可 revert） |
| C-3 的「谁该退让」 | 验证只给红/绿，不给归因 | 依赖顺序 + 验证红即阻断；**不自动修**（自动修会掩盖真实的接口变更意图） |
| 「合并后行为仍正确」 | 验证集不完备：绿 ≠ 正确（本仓唯一真闸门就是 `bun test tests/`，`docs/adr/ADR-plan-multi-session-collaboration.md:14` 事实⑧） | 验证是**必要条件**不是充分条件；变更面清单 + 人审；不声称「绿 = 已验证语义」 |
| C-4 的「上游漂移是否与本 wave 的假设冲突」 | 需要理解上游改动意图 | 漂移幅度披露 + 全量验证重跑；漂移 > 0 时记录必须显式标注 |
| 「这些 commit 是不是该 wave 的后端写的」（归因） | git 不记录写入者（`docs/adr/ADR-plan-multi-session-collaboration.md:330-338`） | worktree 隔离把归因边界抬到「工作树」（`nodes/n2/RESULT.md:227`），但**仍是协议级**，非权限强制 |
| 「这次合并没有绕过验证门」 | 只有当流程真的走了 `--no-commit` 才成立；`git merge` 本身不报「我绕过了门」 | **无判据**（发现 ①）：只能靠流程纪律 + n4 补判据；本文如实标注为**当前无闸门** |
| 「合并顺序表是否被遵守」 | 顺序表是书面件，无机械消费方（工程侧没有 `graph.json` 式的 deps 载体，见发现 ④） | 事后核对：验证红 + 冲突清单反推顺序；**事前无闸门** |

---

## 5. 与既有事务范式的关系

### 5.1 合并**不需要**「一次原子写内完成多件事」

D9 的范式是「一次 `graph.json` 原子写内完成多件事」（`docs/adr/ADR-plan-multi-session-collaboration.md:133`），因为它的写点是**同一个 JSON 文件的多个字段**，分两次写会留下可观察的分叉窗口（`cache_behind` / `cancelled_dep_active`）。

合并不是这种形态：

- 写点是**多个 git 对象**（refs + index + worktree 文件），且跨进程（git 子进程）；
- 中间态是**有意义的**：integ 上每个 merge commit 都是一个可审计的检查点 —— 把它们塞进"一次原子操作"反而会**消灭**审计点；
- 合并的"多件事"在语义上**必须**逐件发生（顺序即依赖，§3 C-3）。

⇒ 〔推断〕**把 D9 的原子写范式套到合并上是错误的类比**。正确的类比对象是 **D10 的短写锁**（`:146`）：只对「必须一起可见的那一小段」加锁，不对整体加事务。

### 5.2 真正需要原子性的只有一处：「merge commit 落盘」与「合并记录落盘」

若 merge commit 已生成而记录未写（或反之），会出现两种不可判状态：

- 有 commit 无记录 ⇒ 后续 wave 无法知道「这一波合过没有」（幂等键只能靠 `--is-ancestor` 猜）；
- 有记录无 commit ⇒ 记录在撒谎（违反「派生而非自述」）。

⇒ 处置：**合并记录的写入与 merge commit 的生成放在同一个临界区内**（先 commit 成功、再在同一次临界区内写记录；记录写失败 ⇒ 合并动作整体判失败并回滚到 `integ_tip_before`，因为此时 integ 只前进了一个 commit，回滚代价 = 一次 `git reset --hard <integ_tip_before>`；⚠ 该动作在 delegate 后端被 `CONSTANT_DENY` 封死，`lib/delegate-core.ts:51-52` ⇒ **回滚必须由能跑 reset 的会话执行**，这是发现的另一面）。

### 5.3 锁的粒度与超时

| 临界区 | 载体 | 粒度 | 超时 |
|---|---|---|---|
| 合并写面（index / 工作树 / refs） | **复用 delegate 单槽**（槽位键 = `workRoot`，`lib/delegate-core.ts:154`）⇒ integ worktree 一槽 | 工作树 | 槽位自带（`lib/delegate-core.ts:2560` 的 wait timeout，`lib/delegate-async.ts:96` 的并发上限） |
| 合并记录（topic 树内文件） | **per-topic 短锁** `<slug>.merge.lock`（原子 `mkdir`），形态与 D10 的 `<slug>.graph.lock` 同构（`docs/adr/ADR-plan-multi-session-collaboration.md:146`） | 文件 | **硬超时**（不按 mtime 判死 —— 持有者慢 ≠ 死；D10 已给出这条理由，`：146`） |

不新增第三种锁：合并期已由「integ worktree 一槽」排他，短锁只保护记录文件（它的写入者可能有父会话与合并后端两个 ⇒ 必须显式互斥）。

---

## 6. 合并产物必须入 git（理由 + 反例）

**结论：全部入 git，包括合并记录本身。唯一不入 git 的是冲突中间态。**

| # | 理由 | 依据 |
|---|---|---|
| R1 | **回滚口径是 HEAD-based**：drill 只 `git clone` **已提交**内容 ⇒ 未提交的合并产物不在回滚可达范围内，「合了但没 commit」= 回滚清单看不见它 | `.rddf/rollback/README.md:51` |
| R2 | **漂移守卫的判据对象是当前工作树**：清单的 `find` 必须**恰好出现 1 次** ⇒ 合并结果若不进 HEAD，守卫比的是旧代码 ⇒ 「清单与代码同漂」的结论无意义 | `.rddf/rollback/README.md:43`、`:55-59` |
| R3 | **合并记录是跨会话唯一真源**：它回答「哪一波、哪个 tip、谁裁决了什么」—— 与本仓「不引入运行态第二本账」的纪律一致（D10，`docs/adr/ADR-plan-multi-session-collaboration.md:140`） | 同上 |
| R4 | **commit 是审计单元**：一次合并 = 一次可 revert 的原子变更；未 commit 的合并无法被 revert，只能被 `reset --hard`（而 reset 在 delegate 后端被封，`lib/delegate-core.ts:51-52`） | `lib/delegate-core.ts:51-52` |
| R5 | **commit-gate 的写集判定只看暂存集**：不 commit ⇒ 三判据里两条（暂存非空 / 写集合规）根本不运行 ⇒ 合并成为唯一未经写集检查的写路径 | `prompts/build.md:858`、`plugins/commit-gate.ts:107-123` |

**反例（不允许入 git 的东西）**：冲突中间态 —— `MERGE_HEAD` 残留、带冲突标记的文件、`-X ours` 掩盖后的"看起来干净"的结果。理由是它们会**伪造**一个「合并已完成」的 HEAD，而实际上语义未裁决（C-2）。「把冲突态提交」应写成禁止项，不是"尽量不"。

〔推断〕R5 是五条里最锋利的一条：**合并是全仓唯一一条「写文件但不经过 `edit` 权限、也不一定经过 commit-gate」的路径**。`scope` 白名单只约束 `edit` 工具（`lib/delegate-core.ts:553-569` 的规则集），`git merge` 走 shell（`CONSTANT_DENY` 不含 merge，`:48-81`）⇒ 写隔离在合并这一步**暂时失效**，唯一的兜底就是 gated commit。

---

## 7. 与回滚口径的对接

| 问题 | 答案 |
|---|---|
| 合并引入了新机制吗（需要新的回滚清单吗） | **不需要**：本文只约束「怎么用既有 git + 既有 commit-gate」，不新增代码、不新增配置文件格式。合并记录是**版本化产物**，退役时「停止写入」即可（同 `.rddf/plan-topics/**` 的处置，`.rddf/rollback/registry.json:17-27`） |
| 合并记录需要进 registry 的 `watch[]` 吗 | 若将来把合并记录做成机制（有 CLI / 有判据）⇒ 是；现在是**纯流程产物** ⇒ 登记为债，见 §9 |
| 回滚动作本身怎么执行 | 合并的逆操作 = `git revert <merge_commit> -m 1`（〔git 语义〕），**不是** `reset --hard`（后者在 delegate 后端被封，`lib/delegate-core.ts:51-52`）。这条必须写进合并记录，否则失败时只有一个不可执行的回滚方案 |
| wave 分支什么时候能删 | `git branch -D` 对 `build` 是 `ask`（`opencode.jsonc:81`）⇒ 无人值守下**删不掉** ⇒ 分支会累积。处置：**保留到 topic 收尾**，由人在收尾时批量删（或收尾会话以交互模式删）；本文不为"自动清理"背书（需要一条 `ask` 放行的通道，属 n7） |

---

## 8. 交付给相邻节点（接口，不越界）

| 交给谁 | 内容 | 依据 |
|---|---|---|
| **n4（判据面）** | 可机判的四条：① `UU` 条目存在性；② `--is-ancestor` 幂等判定；③ 合并后验证 exit；④ commit-gate 拒绝。**必须补的判据**：`merge` 调用是否带 `--no-commit`（发现 ① 当前无闸门）；合并记录是否存在且 tip 对得上 | `lib/commit-gate.ts:831`、`plugins/commit-gate.ts:7` |
| **n4（写集判定）** | C-5 的**预判**可做成「合并前 dry-run」：`git diff --name-only` + `decideWrite`（`plugins/commit-gate.ts:114-123` 已有该原语） | 同左 |
| **n7（失败模式 / 回滚）** | 合并的失败面：冲突未解（可 abort）、验证红（可 revert）、记录写失败（需 `reset`，而后端被封 ⇒ 必须由能 reset 的会话执行）、分支删不掉（`ask`） | §5.2、§7 |
| **n7（回滚可达性）** | 合并记录必须自带「逆操作」字段（`revert -m 1 <sha>`），否则记录只是审计件、不是回滚件 | §7 |
| **合稿** | 若采用 build-worker，**合并步必须作为独立一步**存在（不能并入 wave 收尾），且这一步的执行者是 build 而非派发方 | §2.2 |

---

## 9. 薄弱点与待父裁决

### 9.1 薄弱点（带稳定 token）

- （最重）`merge-commit-bypass`〔必须上报〕 —— 见 §0 与 §6 R5：`git merge` 自动提交绕过 commit-gate 与 `plan` 的 `git commit: deny`。**这是本文唯一一个「一旦不写硬约束就立刻失守」的点**，也是 n4 必须补判据的第一优先级。
- 〔必须上报〕`cross-file-semantic-invisible` —— C-3 在 git 层**零冲突**，唯一的机械信号是「合并后验证红」；而验证红不给归因 ⇒ 「谁该退让」永远是人判。任何声称"合并可自动化"的方案都必须先回答这一类。
- 〔必须上报〕`merge-order-no-carrier` —— 合并顺序（依赖顺序）在工程侧**没有载体**：`graph.json` 的 `deps` 只在 plan-topics 里（`docs/adr/ADR-plan-multi-session-collaboration.md:53-63`），工程侧只有 delegate 的 pair/ledger（单槽语义，不表达波间依赖）。⇒ 眼下只能靠书面合并计划；这是**结构性缺口**，不是实现细节。
- 〔必须上报〕`baseline-dead-field-blocks-merge` —— C-4 的判据需要「wave 从哪个 sha 切出」，而 `attempts[].baseline` 是死字段（`docs/adr/ADR-plan-multi-session-collaboration.md:354`）⇒ 基线漂移**当前只能靠 `merge-base` 反推**，无法与"创建时基线"对比。合并设计直接踩在这条已登记债上。
- `merge-write-scope-hole` —— 合并是全仓唯一「写文件但不经 `edit` 权限」的路径（`CONSTANT_DENY` 不含 merge，`lib/delegate-core.ts:48-81`）⇒ 写隔离在合并步暂时失效。
- `wave-branch-retention` —— `git branch -D` 对 build 是 `ask`（`opencode.jsonc:81`）⇒ 无人值守下 wave 分支只能累积。

### 9.2 待父裁决

1. **合并执行者是否接受「必须是 `build`」这一硬绑定**？本文从权限面推出来（`opencode.jsonc:132` vs `:204-205` vs `:58-59`），但它意味着「`plan` 能建 worktree 却永远不能收口合并」—— 若父认为这不可接受，需要 n5 先裁决「plan 的 `git commit: deny` 是否该为合并开一个收窄例外」；本文不预设该例外。
2. **集成分支的存在是否算「新增运行态」**？本文认为不算（它是 git 分支，不是第二本账），但需要一个显式裁决，否则 n7 会把它当成新的回滚对象。
3. **「合并记录」的落点**：本文按「版本化产物、不入 registry」处理。若父要求它进 `.rddf/rollback/registry.json` 的 `watch[]`，则必须先有 CLI / 判据（现在是纯文件）。请裁决是「登记为债」还是「同批做成机制」。
4. **C-2 的默认处置是否够严**：本文选了「发现同 hunk 就回溯判派发侧错误」，这会让相当一部分合并**退回重划 wave**（成本高）。若父希望"先人裁决、只在裁决后才回溯"，本文的处置顺序需要放宽一档。

---

## 10. 自检（对照 BRIEF 验收口径）

| 验收项 | 状态 |
|---|---|
| 合并模型五问（谁 / 何时 / 合到哪 / 合几次 / 幂等） | §2.2 / §2.3 / §2.1 / §2.4 / §2.5，每题给单一答案 |
| 冲突分类 ≥4 类，每类四栏（形态 / 判定 / 处置 / 留痕） | §3：**6 类**，四栏无空 |
| 每类标注可机判 / 需人判 | §3 判定列逐类标注（C-2 / C-3 显式二分） |
| 覆盖同文件不同 hunk / 同 hunk / 跨文件依赖顺序 / 基线漂移 | C-1 / C-2 / C-3 / C-4 |
| 基线漂移单独成类 | C-4，并在 §3 末尾给出"为何不并入 C-1" |
| 不可机判清单（对齐 ADR 体例） | §4，三列同构（项 / 为何不可判 / 兜底） |
| 与事务范式的关系（是否原子写 / 锁粒度 / 超时） | §5.1 / §5.3 |
| 合并产物入 git 的理由（或反例） | §6：5 条理由 + 1 条反例（冲突中间态禁止入 git） |
| `path:line` 引用数 | 30+ 处 |
| 正文行数 | ≥100（见文件长度） |
| 结论先行 | §0 |

## STATUS: COMPLETE
