# RESULT — n4：判据面设计

> 类别标注：**〔事实〕** = 本仓文件可直接引用（带 `path:line`）；**〔推断〕** = 由事实推出、本仓无直接断言；**〔git 语义〕** = 外部工具行为，未在本仓核实（不编造行号）；**〔建议〕** = 供 n7 / 合稿消费。
> 输入：n2 已选 **C1 worktree 隔离**（`nodes/n2/RESULT.md:8`、`:175`）；n3 已给合并模型与「可机判四条 + 缺两条」（`nodes/n3/RESULT.md:229`）。本文**只设计判据**，不重选隔离、不重定义冲突分类。

## 0. 结论先行

**判据面 = 「1 个载体 + 2 个维度 + 3 类闸门 + 1 条派生信号」，锚点是 git 对象（ref / merge-base / commit trailer / worktree 目录），不是第二本 `graph.json`。**

六条硬结论：

| # | 结论 | 一句话理由 |
|---|---|---|
| J1 | **复用 plan-topics 的「范式」，不复用它的「载体」**：派生而非自述、违规码闭集、阶段 × 严重度两维、退出码四值 | 载体若复制成 `<topic>/waves.json`，wave 的真相（tip / merge-base / 是否合过）已经在 git 里 ⇒ 必然出现「账本 vs git」分叉（ADR D10 对第二本账的一贯否决，`docs/adr/ADR-plan-multi-session-collaboration.md:187`） |
| J2 | **wave 的身份 = 分支名 `rddf/wave/<topic>/<wave-id>`；wave 的状态 = 三条 git 判据的派生值**（tip 是否存在 / 是否 `is-ancestor` integ / 合并 commit 是否带齐全 trailer） | 与 D2「派生而非自述」同构，且不需要任何运行态新文件（`docs/adr/ADR-plan-multi-session-collaboration.md:53-63`） |
| J3 | **违规码一律加 `wave_` 前缀，零重名；只有 `out_of_scope` 是刻意复用**（同语义：worktree 内单写者的越界写） | 20 码闭集是契约（`lib/plan-topics.ts:78-99`、`docs/architecture/plan-topics-topic-model.md:75`）；新增码不加前缀会与既有码产生「同名异义」 |
| J4 | **退出码沿用 0/1/2/3，不扩第五值** | 阻断/info 的二分已由严重度维表达（`lib/plan-topics.ts:116-120`）；加 4 只会让 `emitViolations` 的 `blocking.length === 0 ? 0 : 1` 出现第三个分支（`scripts/plan-topic-check.ts:147-164`） |
| J5 | **收敛信号 = 一条命令的 `converged` 布尔 + 五个子句**；它是**调度信号**，不是交付信号 | 对齐既有 D11 口径（`docs/adr/ADR-plan-multi-session-collaboration.md:158-162`），不重造 |
| J6 | **判据面的可信上限由「归因边界」决定，不由判据条数决定**：worktree 内可判、跨 worktree 不可判 | 差集只记录「哪些路径变了」，不记录写入者（`lib/delegate-core.ts:2593-2604`） |

〔必须上报〕（最重）`merge-ungated-no-gate` —— 判据面**可以**机判「合并 commit 在不在」，但**不能**机判「这次合并没有绕开验证门」：commit-gate 的门禁面只覆盖 shell 里的 `git commit`（`plugins/commit-gate.ts:7`），`git merge` 自建 commit 不经过它（`lib/commit-gate.ts:13`、`:158`）。所以「无旁路」这条必须被写成**可观察形态**（trailer + 双亲 + `--no-commit` 痕迹），而不是写成「验证门会拦住」——后者是伪闸门。

〔必须上报〕`cross-wave-unattributable` —— 跨 wave 的「谁写了哪个文件」在 git 层**不可判**（`docs/adr/ADR-plan-multi-session-collaboration.md:330-338`），因此在判据面里只能是 **info**，不能作为阻断项；把它写成阻断项等于给出一台必然误报的报警器。

---

## 1. 输入前提（只消费，不重选）

| # | 前提 | 依据 |
|---|---|---|
| P1 | 一个 wave = 一个 linked worktree = 一个活跃后端 | `nodes/n2/RESULT.md:175` |
| P2 | 槽位键 = `workRoot`；同一 worktree 只能一个占槽 | `lib/delegate-core.ts:154-155`、`:160-178` |
| P3 | 差集基准 = `workRoot` ⇒ 每棵 worktree 的 `git status` 只含自己的变更 | `lib/delegate-core.ts:2593-2604` |
| P4 | 合并 = N 次 `wave → integ` + 1 次 `integ → main`，一律 `--no-ff --no-commit` + 独立 gated commit | `nodes/n3/RESULT.md:8`、`:101-105` |
| P5 | 全局并发上限 3 | `lib/delegate-async.ts:96-101` |

n3 交给本节点的**可机判四条 + 必须补的两条**（`nodes/n3/RESULT.md:229`）：

- 可机判：① `UU` 条目存在性；② `--is-ancestor` 幂等判定；③ 合并后验证 exit；④ commit-gate 拒绝。
- 必须补：⑤ `merge` 调用是否带 `--no-commit`；⑥ 合并记录是否存在且 tip 对得上。

本文把 ⑤ 处理成「形态判据」（见 §3 D8），把 ⑥ 处理成「merge commit trailer 契约」（见 §3 D13）——**两者都落在 git 对象上，不落新文件**。

---

## 2. 载体选择：为什么不建 wave 侧 `graph.json`

| 候选 | 机制 | 结论 | 理由 |
|---|---|---|---|
| **A** 新建 `.rddf/build-topics/<slug>/waves.json`（照抄 plan-topics） | 父写声明 + 派生 status | **否决** | wave 的真相已在 git（tip / merge-base / 父提交数）；再写一份 = 第二本账，且「谁先写、写谁」又要一套单一写者表。既有裁决对第二本账的措辞是「必然分叉」（`docs/adr/ADR-plan-multi-session-collaboration.md:187`） |
| **B** git 原生：分支命名 + merge commit trailer + worktree 目录 + delegate pair 台账 | 零新文件，纯派生 | **采纳** | 每一条判据都能被 `git` / `pair.json` 独立重算；换根会话重建时无需信任任何自述（与 D6 重建路径同向，`docs/adr/ADR-plan-multi-session-collaboration.md:107`） |
| **C** 纯文档表格（`WAVES.md`） | 人写人读 | **否决** | 自述式，无机械判定力；且「文档 vs 代码同漂」是本仓已登记的失败模式（`.rddf/rollback/README.md:43`） |

**载体 B 的字段映射**（全部是既有对象，无新增 schema）：

| 判据需要的事实 | 落在哪 | 依据 |
|---|---|---|
| wave 存在性 | 分支 `rddf/wave/<topic>/<wave-id>` | 〔git 语义〕ref 即存在性 |
| wave tip | `git rev-parse <branch>` | 〔git 语义〕 |
| 是否已合入 integ | `git merge-base --is-ancestor <tip> <integ>` | 本仓已有该原语用法（`tests/helpers/real-repo-git.ts:97`） |
| 合并时用的是哪个 tip / 验没验 | merge commit trailer `Wave-Id` / `Wave-Tip` / `Verify-Exit` | 〔建议〕新约定，见 §3 D13 |
| 合并是否走 `--no-commit` | 合并 commit 的双亲 + 无 `MERGE_HEAD` + trailer 齐全（形态） | 〔推断〕形态可判、动机不可判 |
| wave 的后端是否还在写 | `pair.json` 的槽位态 + worktree 目录 | `lib/delegate-core.ts:117-128` |

⚠ **这条选择有一个直接代价**：`graph.json` 式 `deps` 在工程侧不存在（n3 已把它登记为结构性缺口 `merge-order-no-carrier`，`nodes/n3/RESULT.md:243`）。载体 B 只能从 **merge 顺序**反推依赖（先合的 = 被依赖），所以「派发前置：依赖就绪」这条判据**只能判已合入的部分**，判不了「BRIEF 里声明的依赖」——见 §3 D1 的可判性栏与 §9 待父裁决 1。

---

## 3. 判据清单

口径说明：**阶段**只用既有两值（`docs/architecture/plan-topics-topic-model.md:72`）；「一波完成」归入**下一波的派发前截面**（它是下一波能否派发的前置，而不是整个 topic 的收尾），这样不需要给 `--phase` 加第三个值。**严重度**：阻断 / info（info 不改退出码，`lib/plan-topics.ts:116-120`）。

| # | 判据 | 判什么 | 怎么判 | 阶段 | 严重度 | 可机判? | 依据 |
|---|---|---|---|---|---|---|---|
| **D1** | 派发前置：依赖就绪 | 本 wave 依赖的 wave，其 tip 已是 integ 的祖先 | `git merge-base --is-ancestor <dep_tip> <integ_tip>` 对每条已声明依赖为真 | 派发前截面 | 阻断 | **可机判**（只对「已登记依赖」；依赖本身无载体 ⇒ 见 §9-1） | `tests/helpers/real-repo-git.ts:97`、`docs/adr/ADR-plan-multi-session-collaboration.md:53-63` |
| **D2** | 派发前置：槽位可用 | 目标 worktree 无占槽者、且 worktree 目录不存在（未被复用） | `slotOccupants(pairs, workRoot)` 为空 ∧ `git worktree list` 不含该路径 | 派发前截面 | 阻断 | **可机判** | `lib/delegate-core.ts:160-178`、`:154-155` |
| **D3** | 派发前置：输入契约钉死 | wave BRIEF 的哈希与派发时记录一致（防派发后偷偷改契约） | 派发时把 BRIEF sha256 写进 delegate brief 或 merge trailer 之外的台账；判时重算比对 | 派发前截面 | 阻断 | **可机判** | 范式同 `brief_tampered`（`lib/plan-topics.ts:548-563`） |
| **D4** | 一波完成：后端已离场 | 该 worktree 的槽位态 ∈ {idle, suspended, tombstone}，且末条 attempt 已闭合 | `pair.json` 槽位态 + attempt `finished_at` | 派发前截面 | 阻断 | **可机判** | `lib/delegate-core.ts:117-128`、`scripts/plan-topic-check.ts:452-457` |
| **D5** | 一波完成：有交付面 | 该 worktree 的 `git status` 差集非空，或 wave 分支相对 base 有 commit | `git rev-list --count <base>..<tip> > 0` ∨ 差集非空 | 派发前截面 | 阻断 | **可机判** | `lib/delegate-core.ts:2593-2604` |
| **D6** | 合并干净：无冲突残留 | integ 上无 `UU/AA/DU/UD`、无 `MERGE_HEAD` | `git status --porcelain` 过滤冲突状态码；`git rev-parse --verify MERGE_HEAD` 失败 | 派发前截面 | 阻断 | **可机判** | `nodes/n3/RESULT.md:137`、`:113` |
| **D7** | 合并干净：未重复合并 | 同一 `(wave, tip)` 只合一次 | tip 已是 integ 祖先 ⇒ 该波必须**无新 merge commit**；否则「重复合并」 | 收尾全量 | 阻断 | **可机判** | `nodes/n3/RESULT.md:111` |
| **D8** | 合并干净：合并过门禁（形态） | merge commit 必须是「双亲 + trailer 齐全 + 无冲突态」，且不含 `-X ours/theirs` 痕迹 | 判 merge commit：`parent_count == 2` ∧ message 含 `Wave-Id:` / `Wave-Tip:` / `Verify-Exit:` | 收尾全量 | 阻断 | **可机判（形态）**；「动机是否真的跑过验证」**需人判** | `plugins/commit-gate.ts:7`、`lib/commit-gate.ts:13`、`nodes/n3/RESULT.md:21` |
| **D9** | 越界写：worktree 内 | 该 wave 的 changed 集全部落在声明的 wave 写域内 | `git status --porcelain` 差集（委托前/后）逐路径前缀判定 | 收尾全量 | 阻断 | **可机判**（worktree 单写者前提成立时） | `lib/delegate-core.ts:2593-2604`、`docs/adr/ADR-plan-delegate-engineering-session.md:77` |
| **D10** | 越界写：跨 wave 归因 | 「这个文件是哪个 wave 写的」 | 无判据：git 不记录写入者；worktree 只能给出边界，给不出作者 | 收尾全量 | **info** | **不可机判**（只可披露「union 变更面」） | `docs/adr/ADR-plan-multi-session-collaboration.md:330-338` |
| **D11** | 失败判定：验证红 | 每次 `wave → integ` 后全量验证 exit 必须为 0；红则该 wave 不得推进 | 跑声明的验证命令，exit code 写进 merge trailer `Verify-Exit:` | 收尾全量 | 阻断 | **可机判（红/绿）**；「谁该退让」**需人判** | `prompts/build.md:858`、`nodes/n3/RESULT.md:139` |
| **D12** | 中断恢复：僵尸 wave | 槽位占着但无活动、attempt 未闭合 / worktree 残留 | 槽位态 + `TODO.md`/BRIEF mtime 新鲜度（仅显示）+ 人工确认 | 派发前截面 | **info**（显示）；**阻断**仅当要复用该槽 | **可机判（陈旧）/需人判（是否接管）** | `docs/adr/ADR-plan-multi-session-collaboration.md:299`、`lib/plan-topics.ts:852-865` |
| **D13** | 产物完整性：合并记录可对账 | 每个 integ 上的 merge commit 都有对应 `Wave-Id` + `Wave-Tip`，且 tip 与当时分支 tip 一致 | 遍历 `integ` 上 `--merges` 的 commit，抽 trailer，与 wave 分支现 tip 比对（允许 tip 前进 ⇒ 标 `tip-advanced`） | 收尾全量 | 阻断 | **可机判** | `nodes/n3/RESULT.md:229`（必须补的⑥） |
| **D14** | 产物完整性：worktree 回收 | `<repo-parent>/rddf-wt/*` 无残留、`git worktree list` 无孤儿 | 目录枚举 + `git worktree list` 差 | 收尾全量 | **info** | **可机判** | `nodes/n2/RESULT.md:68`、`.rddf/rollback/README.md:43` |
| **D15** | 交付完整性：目标是否达成 | 「这批 wave 真的做完了 TOPIC 要求的事吗」 | 需读 TOPIC 目标段做语义比对 | 收尾全量 | **info**（不设阻断，**不伪装成闸门**） | **不可机判** | `docs/adr/ADR-plan-multi-session-collaboration.md:302` |

**表的自检**：15 条覆盖 BRIEF 要求的七类（派发前置 D1-D3、一波完成 D4-D5、合并干净 D6-D8、越界写 D9-D10、失败判定 D11、中断恢复 D12、产物完整性 D13-D14），另加 D15 作「不假装有闸门」的显式登记。info 级 3 条（D10 / D12 / D14）+ D15 的「不可机判」标注，满足 BRIEF「不得全填阻断」。

**为什么 D9 是阻断而 D10 是 info**：D9 的判据对象是**一棵 worktree**，而该 worktree 在同一时刻只有一个写者（P1 + P2）⇒ 差集就是「这个写者写了什么」，判定成立。D10 的判据对象是**跨 worktree 的一个路径**，缺写入者字段 ⇒ 永远无法把文件归给某 wave。把同一份 git 数据在两种归因边界下判成同一严重度，是误报的根源。

---

## 4. 违规码候选表

既有 20 码见 `lib/plan-topics.ts:78-99`（`docs/architecture/plan-topics-topic-model.md:75` 同步）。新增码全部带 `wave_` / `integ_` 前缀以避免「同名异义」；「与既有码的关系」列必须逐条写。

| 码名 | 触发条件 | 严重度 | 与既有 20 码的关系 |
|---|---|---|---|
| `wave_dep_unmerged` | D1 判定依赖 wave 的 tip 不是 integ 祖先 | 阻断 | **新增**；语义近 `blocked_by_deps` 但后者是 status 不是 violation，不能复用 |
| `wave_slot_busy` | D2 判定目标 worktree 仍有占槽者 | 阻断 | **新增**；delegate 侧的占槽拒绝是**操作被拒**不是 violation 码，二者需并存 |
| `wave_brief_drift` | D3 BRIEF 哈希与派发时记录不符 | 阻断 | **新增**；与 `brief_tampered` **同族不同物**（后者只覆盖 plan-topics 的 `graph.json` 声明哈希，不覆盖工程侧） |
| `wave_in_flight` | D4 判定槽位仍 `dispatching`/`active` 而调用方要求「这一波已完成」 | 阻断 | **新增**；与 `duplicate_open_attempt` 不同：后者判「同节点两条未闭合 attempt」，本码判「单条 attempt 仍开着就要收口」 |
| `wave_empty_delivery` | D5 判定 wave 分支零 commit 且差集为空 | 阻断 | **新增**；是 `missing_deliverable` 的工程侧对偶（那里判文件不存在，这里判「根本没有可交付物」） |
| `wave_conflict_residue` | D6 判定整合面存在冲突态或 `MERGE_HEAD` | 阻断 | **新增**；直接承接 n3 §2.5 的禁止项 |
| `wave_merge_replay` | D7 判定同一 `(wave, tip)` 产生了第二个 merge commit | 阻断 | **新增**；与 `cache_ahead`（伪造完成）同族精神，但对象是 git 事实 |
| `wave_merge_ungated` | D8 判定 merge commit 非双亲 / 缺 trailer / 形态不满足 | 阻断 | **新增**；这是 n3 的 `merge-commit-bypass` 在判据面的**唯一可落点** |
| `out_of_scope` | D9 判定 changed 路径不在 wave 写域内 | 阻断 | **刻意复用**（同语义；CLI 已有该码，`scripts/plan-topic-check.ts:238`）；扩的是**调用口径**（per-worktree），不是码 |
| `cross_wave_unattributable` | D10 判定出现「跨 wave 变更且无法归属」 | **info** | **新增**；与 `out_of_scope` **不可混**：混了就等于把不可归因事实当成越界证据 |
| `wave_verify_red` | D11 验证 exit ≠ 0 且该 wave 仍在 integ 上 | 阻断 | **新增**；`git_error` 只表示 git 命令失败，不表示「验证红」 |
| `wave_stale_slot` | D12 槽位陈旧超过阈值 | **info** | **新增**；与既有 `liveness_stale` 的**位置**一致（只显示、不接管，`lib/plan-topics.ts:852-865`） |
| `wave_record_missing` | D13 merge commit 缺 trailer，或 trailer 的 tip 与分支现 tip 不一致 | 阻断 | **新增**；与 `stale_inputs` 同族（契约漂移），但对象是合并记录而非 node 输入 |
| `wave_worktree_leak` | D14 存在未回收 worktree / 目录 | **info** | **新增**；与 `orphan_node_dir` 同族（磁盘有、台账无），但对象是 worktree |

**查重结论**：14 个候选中 13 个新增、1 个复用（`out_of_scope`）。新增名均不与既有 20 码字面相同；语义最近的 5 组（`brief_tampered` / `duplicate_open_attempt` / `missing_deliverable` / `stale_inputs` / `orphan_node_dir`）已在表中逐条写明差异，**不留「同名不同义」**。

---

## 5. 退出码口径：沿用，不扩展

**结论：沿用 0 / 1 / 2 / 3（`scripts/plan-topic-check.ts:15-19`）。**

三条理由：

1. **严重度维已经承担了「要不要红」的区分**。`emitViolations` 的实现是 `blocking.length === 0 ? 0 : 1`（`scripts/plan-topic-check.ts:147-164`）；给 info 单独一个退出码会把这个二值函数变成三值，而消费方（父会话纪律、守卫断言）只学过「0 = 可以派发」。
2. **第五值没有可命名的语义**。候选 `4 = converged 但未验证` 与 `0` 的差别只在「which clause failed」，那已经是 `--json` 的 `converged` 字段能表达的（D11 的既有形态，`docs/adr/ADR-plan-multi-session-collaboration.md:162`）；退出码再编码一遍 = 冗余。
3. **本仓有过「凭据判别力归零」的事故先例**：`precheck.exit` 曾经恒为 1，于是「派发前 exit 0」这条纪律失去意义（`docs/adr/ADR-plan-multi-session-collaboration.md:61`、`:356-358`）。退出码越多、越容易出现「永远是某个值」的退化 —— 少一个值比多一个值安全。

**代价（如实写）**：`1` 同时表示「有阻断违规」与「操作被拒」（CLI 既有口径），调用方无法只凭退出码区分「图坏了」和「这次操作不合法」。这一歧义在 plan-topics 已存在，**本节点不为它新增第二套编码**；需要区分时读 `--json` 的 `violations[].code`。

---

## 6. 收敛信号设计

### 6.1 一条命令

```
build-wave-check check <topic> [--json]     # 与 plan-topic-check 同族形态
```

输出：`{ ok, converged, violations[], summary{ waves_done[], waves_in_flight[], integ_tip, main_tip, blocking[], unverified[] } }`。

### 6.2 `converged` 的五个子句（纯派生，全部来自 git / pair 台账）

| # | 子句 | 判据 | 失败时读什么 |
|---|---|---|---|
| C1 | 零阻断违规 | 同 D1-D9、D11、D13 全绿 | `violations[]` |
| C2 | 每条 wave 分支的 tip 都是 integ 的祖先 | 逐分支 `--is-ancestor` | 未合入的 wave id |
| C3 | integ 的 tip 是 main 的祖先（即已收口） | 一次 `--is-ancestor` | 「还差一次 integ → main」 |
| C4 | 无在飞后端（全部槽位非 `dispatching`/`active`） | `slotOccupants` 逐 worktree | 在飞 worktree 清单 |
| C5 | 最新一次合并的 `Verify-Exit: 0` | 读 integ 上末条 merge trailer | 红在哪一波 + exit |

⇒ `converged ⇔ C1 ∧ C2 ∧ C3 ∧ C4 ∧ C5`。**它是「还有没有未完成的活」的答案**：C2 回答「还有 wave 没合」，C3 回答「还没收口」，C4 回答「还有人可能在写」，C5 回答「最后一次合入没验过」。

### 6.3 为什么是调度信号而非交付信号（对齐 D11，不重造）

- 既有 D11 已把口径钉死：`converged` 是「还有没有未完成的活」，**不是**「这件事做完了吗」；后者要对 `TOPIC.md` 目标段做语义理解 ⇒ 不可机判（`docs/adr/ADR-plan-multi-session-collaboration.md:158-162`、`:302`、`docs/architecture/plan-topics-topic-model.md:107`）。工程侧完全同构：C2/C3 能说「所有 wave 都合了」，**说不了**「合进来的东西实现了需求」。
- 因此本节点的收敛信号**只做四件事**：告诉父「还能不能派下一波」、「还差几个 wave」、「谁还在写」、「最后一次合并验没验」。任何「done」的话术都不放进 `converged`。
- **反操纵面**：父可以删 wave 分支 / 把 wave 从「计划中」清单里去掉来伪造收敛 —— 这与 D11 里「父批量标 `cancelled`」同型（`docs/adr/ADR-plan-multi-session-collaboration.md:228`）。缓解也一样：`summary.waves_done[]` 逐条列 `{wave, tip, merge_commit, verify_exit}`，**声明与答案同屏**；且 wave 分支按 n3 的 `wave-branch-retention` **不删**（`nodes/n3/RESULT.md:246`），删分支会立刻表现为 `wave_record_missing`。

〔推断〕这一条是本判据面**唯一会被误读为「做完了」的输出**，所以字段名必须叫 `converged` 而不是 `done` / `complete` —— 命名即承诺（与既有 `lock` 子命令改名的同一条纪律，`docs/adr/ADR-plan-multi-session-collaboration.md:353`）。

---

## 7. 对既有 `plan` / `plan-worker` 机制的反哺清单

> 要求：每条 = 现象 + `path:line` + 在新判据面里如何避免重演 + 建议动作。前 3 条是 BRIEF 点名的候选，后 5 条是本节点在复用判据库时**再次踩到**的。

| # | 现象 | 依据 | 在新判据面里如何避免重演 | 建议动作 |
|---|---|---|---|---|
| **F1** | `owner` 字段被声明但从不消费：D2 承诺「`owner: "parent"` = 父自己做」，实现里只做枚举校验，`ready` 照样列出、`claim` 照样放行 | `docs/adr/ADR-plan-multi-session-collaboration.md:348-350`、`lib/plan-topics.ts:197-199`、`tests/plan-topics-dag.test.ts:235` | 新判据面**不新增「声明型字段」**：wave 的每个身份位（分支名、trailer）都有唯一的派生消费方；没有消费方的字段不进 schema | 二选一落地：`dispatchableNodes` 输出 `executor` + `claim` 拒非父会话（新增 `owner_mismatch`），或从 schema 与 D2 同时删除 `owner`。**不可维持现状**（声明即承诺） |
| **F2** | topic 独占锁零机械强制：写命令只取 graph **短**锁，`lock` 子命令是纯只读报告；释放步骤 `rmdir` 对含 `owner` 文件的目录必然失败（真实锁泄漏已发生） | `docs/adr/ADR-plan-multi-session-collaboration.md:351-353`、`scripts/plan-topic-check.ts:286-320`、`:336-372`、`prompts/plan.md:281` | wave 侧**不新增长锁**：互斥直接用 delegate 槽位（`lib/delegate-core.ts:160-178`），它是**操作层硬拒**而非协议约定；`converged` 也刻意不看锁（与 D11 同） | 「拿锁 + 校验归属」合成一个原子命令；释放改「先删 `owner` 再 `rmdir`」；`lock` 更名 `lock-status`。若不动 ⇒ D7 与 `prompts/plan.md:276-283` 必须降级为「协议约定（无机械强制）」 |
| **F3** | `scope-check` 文档承诺的「并行时 topic 级 union」**在 CLI 中不存在**：`cmdScopeCheck` 强制要求 `<node-id>`，`allowedPrefix` 恒为 `nodes/<nodeId>` | `docs/architecture/plan-topics-topic-model.md:139`、`docs/adr/ADR-plan-multi-session-collaboration.md:331-338`、`scripts/plan-topic-check.ts:233-240`、`tests/plan-topics-dag.test.ts:395` | 新判据面对「归因」**只做二分**：worktree 内可判（D9，复用 `out_of_scope`）、跨 wave 不可判（D10，info，码名自证 `cross_wave_unattributable`）。**不写「并行 union」这种没有实现的承诺** | CLI 二选一：加 `--union`（实现承诺）或删掉文档里的 union 表述与 V10 半句（`docs/adr/ADR-plan-multi-session-collaboration.md:330` 的长句）。在修好之前，工程侧按「暂不做 scope-check」执行 |
| **F4** | `attempts[].baseline` 是死字段（类型与文档都有，`claim` 不写）；`precheck` 是自述式凭据（`claim` 写、checker 从不读，且 `claim` 自注「不因此拒绝」） | `docs/adr/ADR-plan-multi-session-collaboration.md:354-358`、`lib/plan-topics.ts:50`、`scripts/plan-topic-check.ts:455-463`、`tests/plan-topics-dag.test.ts:406` | wave 的「基线」**必须由创建动作亲自产出**：`git worktree add -b` 后立刻 `git rev-parse HEAD` 写进 merge trailer 的 `Base:`；「派发前 check 必须绿」改成**闸门**（不绿不写 attempt），而不是留痕 | 按 D10 的「要么实装要么删除」处置：`claim` 写 `baseline: git rev-parse HEAD`（全 SHA）；`precheck` 改成拒绝条件或删除字段。**两者都必须同批改文档示例**（`docs/architecture/plan-topics-topic-model.md:35`、`:44`） |
| **F5** | 「钉住缺陷」测试无 id / 无触发条件 / 无退出条件；修好后无人会删「钉住」措辞，于是用例措辞与 D7 承诺相反 | `docs/adr/ADR-plan-multi-session-collaboration.md:361`、`tests/plan-topics-dag.test.ts:374-416` | 新判据面的每个 info 码都必须带**退出条件**：例如 `cross_wave_unattributable` 的退出条件 = 「出现 per-node 写围栏」；并进 `summary.known_gaps[]` | 每个已知边界用例加三行：`// DEFECT: <code> since=<date>` / 触发条件 / 退出条件；判据输出加 `summary.known_gaps[]`（**判据能自报「我现在缺哪些判据」**） |
| **F6** | 「交付信号」被反复尝试塞进机判；D11 已明确拒绝，但每次讨论新并行方案都会重新出现 | `docs/adr/ADR-plan-multi-session-collaboration.md:302`、`docs/architecture/plan-topics-topic-model.md:138` | 新判据面把 D15 写成**显式 info + 不可机判**，并在 `converged` 定义里留一句「`converged ≠ 做完了」的引用 | 不做动作（这是正确的拒绝）；若要机判交付，必须先有「目标集合载体」，而那会开一条免审计退路（`docs/adr/ADR-plan-multi-session-collaboration.md:347`） |
| **F7** | 缓存两向判据（`cache_ahead` 阻断 / `cache_behind` info）证明「按方向定级」有效；但它依赖「缓存字段存在」，而工程侧没有 status 缓存 | `lib/plan-topics.ts:512-546`、`docs/architecture/plan-topics-topic-model.md:65` | **复用其判据形态**：wave 的「声称已合」= trailer 存在；「实际未合」= `--is-ancestor` 假 ⇒ 这正是 `cache_ahead` 的同构（声称 vs 事实），码名 `wave_record_missing` | 无（形态可复用）；但**不要**给 build 侧造 status 缓存字段，否则又要一套「派生 vs 缓存」两向判据 |
| **F8** | `plan-worker` 的 RESULT 判据只看「有实质正文」，不看结构；严重度标注的稳定 token 靠 prompt 纪律（`prompts/plan-worker.md:29`）而非判据 | `lib/plan-topics.ts:359-369`、`prompts/plan-worker.md:29` | 新判据面**不把「结论质量」写成码**：只判可枚举事实（trailer / ref / exit）；质量交人判（与 D15 同处） | 若要机判产出结构，先补「稳定 token 抽取」判据；在那之前不要在文档里写「合成判据已覆盖质量」 |

**反哺的收敛判断**：F1-F5 是**同一类病**（声明在场、消费缺席 ⇒ 读者误信）；F6-F8 是**另一类**（把不可机判的东西伪装成判据）。新判据面的设计纪律因此有两条硬规：① 每个字段必须有唯一派生消费方；② 每个码必须在可判性栏写「机判/人判」，不写就是不合格。

---

## 8. 与相邻节点的接口（不越界）

| 交给谁 | 内容 | 依据 |
|---|---|---|
| n7（失败模式 / 回滚） | 新增的失败判据：D8 `wave_merge_ungated`（形态可判、动机不可判）、D11 红后「该 wave 不得推进」、D13 trailer 缺 → 无法 `revert -m 1` 定位 | §3 D8/D11/D13 |
| n7（回滚可达性） | merge commit 的 trailer 同时是回滚件：`Wave-Tip:` 给出 revert 目标，`Base:` 给出 reset 目标；缺 trailer ⇒ 回滚只能人肉比对 | `nodes/n3/RESULT.md:232` |
| n5（单槽关系） | 判据面**不要求**改单槽语义；D2 的「槽位可用」直接复用 `slotOccupants`，因此「单槽」与「多 wave」在判据层无冲突 | `lib/delegate-core.ts:160-178` |
| 合稿 | 若采纳本面：`build-wave-check` 与 `plan-topic-check` 共享**退出码四值 + 两维严重度**，但不共享载体；不得合成一个命令（两者的「真相源」不同：磁盘 vs git） | §2、§5 |

---

## 9. 待父裁决

1. **「派发前置：依赖就绪」（D1）的依赖载体**：本文只能判「已登记的 wave 依赖」，因为工程侧没有 `deps` 载体（`nodes/n3/RESULT.md:243`）。若父要求「依赖必须事前声明」，需要先裁决是否在 wave 命名或 trailer 里加 `Depends-On:` —— 那是一条新的声明型字段，**按 F1 的纪律它必须同时有消费方**（D1 就是消费方），否则不许加。
2. **`--phase` 是否要加第三个值**：BRIEF 要求阶段列用既有两值，本文把「一波完成」归入「下一波的派发前截面」。若父认为「wave 级收口」需要独立截面，则 `CheckPhase`（`lib/plan-topics.ts:745-755`）扩成三值，但那会动既有闭集与 V22 的断言（`docs/adr/ADR-plan-multi-session-collaboration.md:267`）。
3. **`wave_` 前缀是否接受**：本文为避免与 20 码同名异义，一律加前缀；若父希望沿用既有码（例如把 D13 直接叫 `stale_inputs`），需先确认语义扩张不会让既有断言失效（`tests/plan-topics.test.ts` 按码断言）。
4. **`out_of_scope` 复用 vs 新建 `wave_scope_breach`**：本文选了复用（同语义）。若父要求「工程侧码与 plan 侧码完全隔离」，则应新建，并在 `docs/architecture/plan-topics-topic-model.md:75` 的闭集表里登记**两套闭集**，而不是一套。
5. **F1 / F2 / F4 的动作是否并入本次讨论稿**：本文只登记（按 BRIEF「不改既有判据」）。若父希望把「`owner` 消费化 / 锁原子化 / baseline 实装」写成可派实施的条目，需要单开节点 —— 它们都改 `lib/plan-topics.ts` 与 `scripts/plan-topic-check.ts`，超出本节点边界。

---

## 10. 自检（对照 BRIEF 验收口径）

| 验收项 | 状态 |
|---|---|
| 判据清单七列齐全（判据/判什么/怎么判/阶段/严重度/可机判/依据） | §3，15 行，列列无空 |
| 覆盖派发前置 / 一波完成 / 合并干净 / 越界写 / 失败判定 / 中断恢复 / 产物完整性 | D1-D3 / D4-D5 / D6-D8 / D9-D10 / D11 / D12 / D13-D14 |
| 阶段用既有口径 | 只用「派发前截面」「收尾全量」；第三值进 §9-2 待裁决 |
| 严重度区分，≥2 条 info | D10 / D12 / D14（3 条），另 D15 标不可机判 |
| 每条判据标可机判 / 需人判 | 第 7 列逐条标注，D8 / D11 / D12 显式二分 |
| 违规码候选不重名（或说明） | §4：13 新增 + 1 刻意复用，逐条写与既有码关系 |
| 退出码口径 + 理由 | §5：沿用四值，三条理由 + 代价 |
| 收敛信号「一条命令」+ 调度/交付之分 | §6.1 / §6.2 / §6.3，引 D11 原文 |
| 反哺 ≥4 条，具体现象 + path:line | §7：8 条，每条四栏 |
| `path:line` ≥8 处 | 全篇 40+ 处 |
| 正文 ≥100 行 | 见文件长度 |
| 结论先行 | §0 |

## STATUS: COMPLETE
