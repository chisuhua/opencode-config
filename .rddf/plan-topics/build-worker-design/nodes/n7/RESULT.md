# RESULT — n7：失败模式与回滚可达性

> 问题：**「`build` 多 wave 并行实施通道」（n2 候选 A：linked worktree 隔离 + 每树一写者；n3：父串行合并 + 台账；n4：36 条判据）会怎么坏，坏了怎么退回来。**
> 边界：不重复 n3 的 6 类冲突分类（只消费「冲突会怎么失败、能不能判」这一层）；不重复 n4 的判据清单（只在它之上写失败面）；**不执行任何真实回滚**（下文命令均为可执行形态，未运行）。
> 陈述分三类并显式标注：`【事实】`（可引 `path:line`）/`【推断】`/`【建议】`。

---

## 0. 结论先行

| # | 判定 | 一句话理由 |
|---|---|---|
| 1 | **失败模式共 10 条**，BRIEF 点名的七类全覆盖；按主判据分 **可机判 5 / 仅显示提示 3 / 不可检出 2**（其中 4 条为「存在性可判 + 充分性不可判」的双值标注） | 判据面（n4）能判的全是字节层事实；最重的「双活体写者」与「树外写入」**没有任何机械信号** |
| 2 | **最重的失败模式不是并行写冲突，而是「双活体写者」**：在 build 面它新增了一种只在**合并期**才可见的形态（两棵树改同一文件），比 plan 面更难发现 | plan 面至少共享一个 `nodes/<id>/` 目录会互相踩；build 面各写各树 ⇒ 平票两份都「绿」 |
| 3 | **回滚可拆卸，但可拆卸性的来源是「分支与 merge commit 都保留」**，不是「有一条回滚命令」 | 合入目标后唯一无损回滚是 `git revert -m 1`，SHA 只能从历史取；分支删了就没有锚点（`nodes/n3/RESULT.md:284-287`） |
| 4 | **回滚走三步（关闸 → 收树 → 反向 revert）**，每步有命令级判据；**版本化产物（`waves.json` / `ledger.json` / merge commit / 已合入分支 / ADR）必须保留**，**运行态（锁 / `MERGE_HEAD` / 未合入树）必须清理** | 与本仓 ADR「回滚口径（X 步，回到现状）」体例一致（`docs/adr/ADR-plan-multi-session-collaboration.md:230-234`） |
| 5 | **回滚条目草案可写，但「逐字节钉死」有 6 处硬要求**，其中 `replace` 串**必须同时钉死**、`docs` 的 agent 计数**必须重算而非还原** | 两条都是本仓已付过学费的同型经验（`.rddf/rollback/plan-topics.json:5`、`docs/adr/ADR-plan-multi-session-collaboration.md:101`） |
| 6 | **反哺清单第二部分 = 7 条**（claim→spawn 无补偿 / reap 不吊销 / 长锁纯散文 / 跨 node 污染不可检 / `owner` 死字段 / L1 门空转 / 父死子活） | 前 5 条是本节点失败模式表里直接踩到的坑；后 2 条是「能力已在手却没用」 |
| 7 | **否决条件（明确写出）**：若 wave 扇出 > 3 且全部走 `subagent` 通道（无台账），或父无法承诺「只合不合写」，**应否决并行、回退 n2 候选 D** | 这两条一破，失败模式 4/5/10 三条同时失去全部兜底 |

**一句代价**：失败面里**能判的都只是「已经发生了」**（树还在、`MERGE_HEAD` 还在、祖先关系不对）；
真正贵的两件事 —— **有没有第二个写者**、**树外有没有被写** —— 在本设计里**永远只能事后猜**。

---

## 1. 前置口径（先钉死消费的是哪一层）

- 【事实】n3 已产出：合并语义 = 父串行合、每 wave 一次、冲突解决权归后写者、台账入 git、回滚走 `revert -m 1`
  （`nodes/n3/RESULT.md:11-22`）；其 §8 给出四行回滚可达性（`:284-287`），§9 给出四条薄弱点（`:302-321`）。
- 【事实】n4 已产出：36 条判据、`enforcement` 四值、4 条「需人判」（D3/D4/F1/F4）与 2 条「两段标注」（C6/G3）
  （`nodes/n4/RESULT.md:96-99`、`:113-118`、`:126`、`:128`）。
- 【建议】本节点**只做两件事**：
  1. 把 n3/n4 的「不可机判」**翻译成失败场景**（谁在什么操作序列下踩到、踩到时看见什么）；
  2. 把 n3 §8 的「可达性表」**落成可执行的三步 + 清单草案**（因为「可达」是形容词，「跑得通」才是判据）。
- 【建议】本节点**不做**：不重排冲突分类（C1–C6 原样引用）、不新增判据码（n4 的 36 条已闭集）、不执行 drill。
  ⚠ 因此下文的回滚条目草案**不得**被当作「已落地」—— 它连 ADR 都还不存在（见 §4.4 的 `adr` 字段说明）。

---

## 2. 失败模式表（10 条）

> 读法：**可检出性**三值严格互斥 —— `可机判`（有命令/断言能判，且判据在 n4 的 36 条里能找到对应码）/ `仅显示提示`（有信号但**不设码、不阻断**，只进 summary）/ `不可检出`（无任何机械信号）。
> 一条模式同时含「存在可判 + 充分性不可判」时，用 `可机判（存在）/ 不可检出（充分性）` 双标注，并在统计里按**主判据**计入（不可判的那一半单列为「双值」行，不重复计数）。

**速览矩阵**（细节见 2.1–2.10；「兜底落点」一列的 `n3`/`n4` 指前序节点的结论）：

| # | 失败模式 | 触发条件（一句话） | 可检出性 | 现行兜底（落点） | 残余风险等级 |
|---|---|---|---|---|---|
| FM1 | 并行写冲突 | 两条分支改同一 hunk，后合者 `git merge` 退出 1 | 可机判（存在）/ 不可检出（正确性） | `merge --abort` + 后写者 rebase（n3 §3-C2） | 中 |
| FM2 | 合并残留 | 合并与「写台账+验证」之间崩 | 可机判 | `--abort` + 祖先判定（n4 C2/F3） | 中 |
| FM3 | 中途中断 | 父 claim 后崩，worker 在飞 | 可机判（在飞）/ 仅提示（活性） | `close` / `reap --confirm` + 重建 | 中 |
| FM4 | 僵尸 worker | reap 后旧会话被 resume/复活 | **不可检出** | 仅「显式确认」的责任声明（ADR `:145`） | 高 |
| FM5 | 双活体写者 | 父死子活 / reap 后复活 / TTL 接管 | **不可检出** | 仅协议「每树一写者」 | **最高** |
| FM6 | 孤儿 worktree | 漏收 / 脏树被拒 / 崩在合完与收树之间 | 仅显示提示（info） | 人工 `worktree remove` | 中 |
| FM7 | 上游语义漂移 | 升级宿主，锚点未覆盖 build 面 | 仅显示提示 | 锚点脚本（覆盖不全）+ `bun test tests/` | 高 |
| FM8 | 台账自述 | 手写 `verify.exit=0` / 用 merge 前的结果 | 可机判（存在）/ 不可检出（充分性） | 台账只存命令+exit+at（n4 C6 info） | 中 |
| FM9 | 生成物手解 | 两边改 `bun.lock`，人工合并 | 可机判 | 固定规则：regenerate + 验证（n3 C6） | 低 |
| FM10 | 扇出封顶 | 5 个 item 撞上限 3，改走 `subagent` | 可机判（delegate）/ **不可检出**（subagent） | `quota_exceeded`（仅静态声明） | 高 |

### 2.1 FM1 并行写冲突（跨树同文件文本冲突）

- **触发条件（操作序列）**：wave w1 派 n3（树 `wt-w1-n3`，分支 `bw/t/w1/n3`）；wave w2 派 n5（树 `wt-w2-n5`）；两者都改 `lib/x.ts` 的同一个 hunk → 父按 `(wave,node)` 序先合 w1（成功）→ 再合 w2 时 `git merge` 退出码 1。
- **可见症状**：集成分支工作树出现未合并路径 + `.git/MERGE_HEAD`；台账该 item 无 `merged_sha`；`bw check` 报 `merge_in_flight`（n4 `:156`）。
- **可检出性**：`可机判（存在）/ 不可检出（解决正确性）` —— 存在性由 git 退出码与 `MERGE_HEAD` 判（n4 C2，`:85`）；「谁对」无判据（n3 §5-2，`:198`）。
- **现行兜底**：`git merge --abort` → 后合入节点重开 attempt（`result=rework`）→ 该 worker 在自己树里 rebase + 解 + 重验 + 重提（`nodes/n3/RESULT.md:126-130`）。
- **残余风险**：父若手工编辑冲突标记后 commit（shell 写盘无角色门控，`nodes/n3/RESULT.md:308-310`），错误合并进历史且只被 wave 验证兜底 —— 而验证只覆盖被测到的部分。

### 2.2 FM2 合并残留（半截合并 / 台账与 ref 分叉）

- **触发条件**：父在 `git merge` 与「写台账 + 跑 verify」之间崩溃或被终止 → `MERGE_HEAD` 留在集成分支树；下次收尾时 `MERGE_HEAD` 仍在，或台账有 `merged_sha` 而 integration tip 不含该提交（反之亦然）。
- **可见症状**：`C2 no_merge_head` 红 / `F3 ledger_ref_divergence` 红（n4 `:85`、`:117`）。
- **可检出性**：`可机判`（双向祖先判定 + `MERGE_HEAD` 存在性）。
- **现行兜底**：`git merge --abort` 后按台账重放；`--abort` 前先按 `merged_sha` 判「是否已完成」（`nodes/n3/RESULT.md:98-100`）。
- **残余风险**：`abort` 会**丢弃已解冲突的人工成果**且无留痕 ⇒ 重做成本；更糟的窗口是「ref 已更新、台账未写」（毫秒级），此时 `abort` 无效，只能靠 F3 人工对账 —— 这类窗口没有第二次机会。

### 2.3 FM3 中途中断（wave 内父崩 / worker 消失）

- **触发条件**：父 `claim(n3)` → spawn → 父会话被压缩或退出；worker 可能仍在跑、可能已死。
- **可见症状**：末条 attempt 缺 `finished_at` ⇒ `in_flight` 非空 ⇒ `converged=false`（`lib/plan-topics.ts:453-461`；`docs/adr/ADR-plan-multi-session-collaboration.md:162`）；树里可能有半成品。
- **可检出性**：`可机判（在飞是数据）/ 仅显示提示（活性）` —— 在飞不设码（n4 B4），`liveness_stale` 只是 mtime 提示（n4 `:115`）。
- **现行兜底**：`close` 或 `reap --confirm` 闭合（`scripts/plan-topic-check.ts:480-511`）；换根后按 `BRIEF.md` + `TODO.md` 重建（`docs/adr/ADR-plan-multi-session-collaboration.md:103-108`）。
- **残余风险**：「已死」与「很慢」不可判 —— 生产环境 session 探针对已死会话仍返回记录（`plugins/role-gate.ts:159-161`）⇒ `reap` 有一次机会**切断仍在写的 worker**，直接升级成 FM5。

### 2.4 FM4 僵尸 worker（已闭合/已放弃的会话仍在写，或被复活）

- **触发条件**：父崩溃 → 新根 `reap --confirm` 闭合旧 attempt → 旧 worker 被同一个父用 `subagent(sessionID=…)` 续接，或被仍在内存里的旧父复活 → 同时存在「已闭合的 attempt」与「仍在写的会话」。
- **可见症状**：`TODO.md` / `RESULT.md` 在节点已显示可派/已闭合之后继续变化；`RESULT.md` 的 `## STATUS: COMPLETE` 哨兵出现后又消失。
- **可检出性**：`不可检出`。
  - 【事实】`reap` 的实现只是「写 `finished_at` + 写 `inputs_reviewed`」，**没有任何吊销动作**（`scripts/plan-topic-check.ts:499-511`）；
  - 【事实】ADR 自己写明：「`reap` **不吊销**旧 subagent session 的 `parentID` 校验 ⇒ 同父仍可复活它」（`docs/adr/ADR-plan-multi-session-collaboration.md:145`）；
  - 【事实】活体探针不可用（`plugins/role-gate.ts:159-161`）。
- **现行兜底**：`reap` 的**显式 flag** 即「人已确认旧 worker 已死且不再被 resume」的责任声明（同句 `:145`）。
- **残余风险**：这是**责任转移**不是**检测**。对 build 面尤其贵：僵尸 worker 手里有 `git commit` 权限（`opencode.jsonc.opencode-go:71` 给 `build` 的 `git commit` 是 allow），它可以在自己的树里继续提交。

### 2.5 FM5 双活体写者（最重）

- **触发条件（三条独立路径）**：
  1. **父死子活**：父会话被终止，子会话是 agent 级静态权限 ⇒ 子仍在写（`docs/adr/ADR-plan-multi-session-collaboration.md:332` 审计缺口 ①）；
  2. **reap 后复活**：见 FM4；
  3. **TTL 自动接管**：若实现者把 `liveness_stale` 当判活依据并自动重派（本仓明确否决，`:145`、残留 12 `:319`）。
- **可见症状**：build 面**没有共享目录**可对撞 ⇒ 症状只在合并期出现：两条分支改同一文件、内容各自自洽、两边验证都绿 ⇒ 合并时 FM1，或被「后写者覆盖前写者」静默吞掉。
- **可检出性**：`不可检出`。理由三条：
  - 【事实】差集基准是 `workRoot`（`lib/delegate-core.ts:2503-2504`），两个写者各在自己的树 ⇒ 谁的差集都看不出第二个人；
  - 【事实】plan 侧的「跨 node 污染」至少还有同一棵 topic 树的路径差集可看（`nodes/n4/RESULT.md:98`）；build 面**没有这个共享点**；
  - 【事实】`role-gate` 只覆盖 `edit` / `write` 两个工具（`nodes/n3/RESULT.md:308-310` 转引），shell 写盘不在门控内。
- **现行兜底**：只有协议 —— 「每树恰一写者」+ 派发前 `git worktree list` 人工核对（n4 A4/A5，`:65-66`）。
- **残余风险**：**最高**。它同时破坏 n2 的隔离前提与 n3 的合并前提（合并假设「每条分支 = 一个人的意图」）。

### 2.6 FM6 孤儿 worktree（树泄漏 / 分支占位）

- **触发条件**：wave 结束父漏收某棵树；或 `git worktree remove` 因树脏被拒（有未提交改动）；或父崩溃在「合完」与「收树」之间。
- **可见症状**：`git worktree list --porcelain` 长期含旧路径；该分支无法被下一 wave 建树复用（【事实】git 禁止两树同 checkout 同一分支，`docs/adr/ADR-front-multi-backend.md:157`）；磁盘与依赖缓存线性增长。
- **可检出性**：`仅显示提示` —— n4 F2 `worktree_leaked` 定为 **info**（`nodes/n4/RESULT.md:116`），不阻断、不改退出码。
- **现行兜底**：`summary.worktrees[]` 列出后人工 `git worktree remove`；`git worktree prune` 只清「目录已不存在」的元数据，清不掉存活树。
- **残余风险**：info 级 ⇒ **泄漏常态化**。且「脏树被拒」这个保护会被 `--force` 绕过；更隐蔽的是：worker 忘了 commit 的改动**只存在于那棵树里**，`remove` 之后不可恢复。

### 2.7 FM7 上游语义漂移

- **触发条件**：升级 opencode ⇒ `subagent` 的 parentID 校验 / 完成合成消息 / 权限解析（子会话权限 = agent 配置）任一变化；或建会话的行为变化。
- **可见症状**：派发不被拒但子会话拿不到预期权限；完成消息不到父 ⇒ 父永不 join；或「续接」悄悄变成「新会话」。
- **可检出性**：`仅显示提示`（且**覆盖不全**）。【事实】锚点脚本明确「只写语义断言，不写行号」（`scripts/check-upstream-anchors.sh:19`），覆盖的是 plan 侧的 P1–P6（`docs/architecture/plan-topics-topic-model.md:142`）；**build 面新增的依赖（`git worktree add/remove` 的 shell 权限、commit 权限面）根本没有锚点**。
- **现行兜底**：锚点脚本（未覆盖部分）+ `bun test tests/`（本仓唯一真实闸门，`docs/adr/ADR-plan-multi-session-collaboration.md:14` 前置事实 ⑧）。
- **残余风险**：本仓已发生过一次锚点假红事故 —— 上游重构函数名导致**全仓不可提交**（`docs/adr/ADR-plan-multi-session-collaboration.md:334`）⇒ 漂移的代价不是「判错」，而是「闸门本身坏掉」。

### 2.8 FM8 台账自述（「验过」不可判）

- **触发条件**：父在 merge 后手写 `verify: {commands, exit: 0}` 而未真跑；或 verify 跑在 merge **之前**（旧结果冒充新结果）。
- **可见症状**：台账全绿、`converged=true`，但目标分支的验证其实是红的。
- **可检出性**：`可机判（存在性）/ 不可检出（充分性）` —— n4 C6 `merge_unverified` 定为 **info**（`nodes/n4/RESULT.md:89`）。
- **现行兜底**：台账只存**命令原文 + 退出码 + 时间**，不存结论布尔（n4 R5 的纪律，`:307`）。
- **残余风险**：【事实】`git merge` 产生的提交**不经过** commit-gate（`lib/commit-gate.ts:158` 只在 `sub === "commit"` 时返回 true，见 `nodes/n3/RESULT.md:302-306`）⇒ 合并的质量门**只有协议层**，这是本设计已知最弱的一环。

### 2.9 FM9 生成物冲突被手工解

- **触发条件**：两边都跑依赖变更 / 代码生成，`bun.lock` 内容不同（C6）；父或 worker 手工合并锁文件。
- **可见症状**：合并干净、测试绿，但锁文件里出现「两侧版本混搭」的不一致依赖图。
- **可检出性**：`可机判（检测与处置规则）` —— 路径模式 + 固定规则（取一侧 + 用仓库声明的生成命令重跑 + 验证，`nodes/n3/RESULT.md:167-174`）。
- **现行兜底**：`rm` + regenerate + 验证；生成命令不可无条件重跑时**降级为 C2（人判）**。
- **残余风险**：降级那一刻就没有判据了；且「生成命令」本身可能不在 `.rddf/commit-gate.json` 的验证面里。

### 2.10 FM10 扇出封顶（并行度静默降级）

- **触发条件**：wave 声明 5 个 item；若走 `delegate`，全局并发上限默认 3（`lib/delegate-async.ts:96`）⇒ 第 4 个 dispatch 被拒；父改用 `subagent` 通道补派。
- **可见症状**：部分 item 没有 attempt / 没有台账；父以为「整波已派」，收尾时 `items_incomplete` 红但没人知道是**封顶**而不是**失败**。
- **可检出性**：`可机判（delegate 通道）/ 不可检出（subagent 通道）` —— n4 A6 明写「**仅 delegate 通道**」（`nodes/n4/RESULT.md:67`）。
- **现行兜底**：`quota_exceeded` 阻断码（仅静态声明可判的情形）。
- **残余风险**：一旦为了绕开 3 的上限改用 `subagent`，**整个台账面（在飞 / 归因 / 越界）同时失效** —— 这是「用一个不可判通道修一个可判错误」的典型陷阱。

### 2.11 汇总与三分统计（这一列本身就是结论）

| 可检出性（主判据） | 条数 | 模式 |
|---|---|---|
| `可机判` | 5 | FM1（存在性）、FM2、FM8（存在性）、FM9、FM10（delegate 侧） |
| `仅显示提示` | 3 | FM3（活性）、FM6（info）、FM7（锚点覆盖不全） |
| `不可检出` | 2 | FM4、FM5 |
| **合计** | **10** | — |
| 双值标注（不计入上表，仅提示「充分性」那一半不可判） | 4 | FM1 / FM3 / FM8 / FM10 |

【建议】读法：**能机判的 5 条全部是「事后可见」的字节事实**（ref、`MERGE_HEAD`、路径模式、计数、exit）；
**完全不可检出的 2 条全部与「谁在写」有关**。这不是判据没写好，而是 git 不记录写入者（同 `docs/adr/ADR-plan-multi-session-collaboration.md:317` 残留 #10）。
⇒ **本设计的安全边际只能来自「让不可检出的那 2 条尽量不发生」**（协议 + 单写者纪律），不能来自判据。

---

## 3. 回滚路径（三步，回到现状）

> 体例对齐 `docs/adr/ADR-plan-multi-session-collaboration.md:230-234` 的「回滚口径（三步，回到现状）」：每步 = **动作 + 落点 + 可验证判据**。
> 判据一律给**命令形态**；本节点**未执行**（边界）。

### 3.1 第 ① 步：关闸（停止新的写入与派发）

- **动作**：从 `opencode.jsonc.opencode-go` 移除 `build-worker` agent 块（位置在 `plan-worker` 块之后，`:1356-1508` 是同一区域的先例）；瞬时抑制可先用「重命名 agent」而不改代码 —— 宿主对被派发的不存在 agent 的行为**属上游语义（未在本仓核实）**，故不作为判据。
- **落点**：`opencode.jsonc.opencode-go` 的 `agent` 段（`:36` 起）。
- **可验证判据**：
  - `opencode debug agents | grep -c build-worker` ⇒ `0`（同 V13 形态，`docs/adr/ADR-plan-multi-session-collaboration.md:258`）；
  - 配置解析断言：`bun -e 'const c=(await import("./opencode.jsonc.opencode-go")); ...'` 形态不成立（jsonc），改用 `tests/config-guards.test.ts` 的既有读法 —— 断言 `agent["build-worker"] === undefined`（该文件的 `EXPECTED` / `agent` 读取方式见 `tests/config-guards.test.ts:1547-1550`）；
  - **反例守卫**：`grep -c "build-worker" prompts/build.md` ⇒ 必须同时为 0（否则留下「教模型派一个不存在的 agent」的死教学 —— 这正是 `plan-delegate` 实测的「半退役」形态，`.rddf/rollback/README.md:133`）。

### 3.2 第 ② 步：收树（清运行态，保留分支）

- **动作**：
  1. 枚举：`git worktree list --porcelain` 取所有 `bw/` 路径；
  2. 对**干净**树执行 `git worktree remove <path>`；对**脏**树先由该树 owner 提交或由父导出补丁留档，**禁止** `--force`；
  3. 删除**从未合入**的 `bw/<topic>/w*/<node>` 分支；
  4. **保留**已合入 integration 的分支与 `bw/<topic>/integration`（回滚锚点，`nodes/n3/RESULT.md:106-107`）；
  5. 删除运行态锁目录（`.rddf/state/build-waves/*.lock`，已被 `.gitignore:47` 的 `.rddf/**/*.lock` 覆盖）。
- **落点**：工作树目录 + `refs/heads/bw/**` + `.rddf/state/build-waves/`。
- **可验证判据**：
  - `git worktree list --porcelain | grep -c "bw/"` ⇒ `0`；
  - `git for-each-ref refs/heads/bw --format="%(refname:short)" | wc -l` ⇒ 等于「台账里 `merged_sha` 非空的 item 数 + 1（integration）」；
  - `for b in $(git for-each-ref --format="%(refname:short)" refs/heads/bw); do git merge-base --is-ancestor $b bw/*/integration || echo "UNMERGED $b"; done` ⇒ 只剩已知被放弃的分支；
  - `.rddf/state/build-waves` 下无 `*.lock` 残留 ⇒ `ls .rddf/state/build-waves/*.lock 2>/dev/null | wc -l` = `0`。

### 3.3 第 ③ 步：反向合并（已入目标分支的 wave）

- **动作**：按 wave **倒序**逐条 `git revert -m 1 <merge_sha>`（前向提交，**不重写已发布历史**）；每步后跑全量验证。仅在「目标分支从未发布且团队约定允许重写」时，才可改用 `git reset --hard <target_pre_sha>`（默认**不选**）。
- **落点**：目标分支历史 + 台账追加 `rollback` 行（事实，不是结论）。
- **可验证判据**：
  - `git merge-base --is-ancestor bw/<topic>/integration <target_ref>` ⇒ **非 0**（integration 已不在目标里）；
  - `bun test tests/` ⇒ exit 0（`.rddf/commit-gate.json:2-6` 是全仓唯一验证面）；
  - `git log --merges --oneline <target_ref> ^<target_pre_sha> | wc -l` ⇒ 增加 N 条 revert 提交（可数、可审计）；
  - **顺序判据**：`git log --format=%s <target_ref> -N` 中 revert 主题必须**后 wave 先出现**（倒序），否则后续 revert 会与前面 wave 的合并再冲突（`nodes/n3/RESULT.md:285`）。

### 3.4 三级（单 wave 粒度）回滚 —— 与三步的关系

| 时点 | 动作 | 判据 |
|---|---|---|
| 已入集成分支、未入目标 | `git reset --hard <integration_pre_sha>`（integration 未发布 ⇒ 允许重写） | `git rev-parse bw/*/integration` == `integration_pre_sha`；台账补 `rollback` 行 |
| 已入目标 | `git revert -m 1 <merge_sha>` | §3.3 四条判据 |
| worker 分支未合 | `worktree remove` + 删分支 | §3.2 前两条判据 |

### 3.5 必须保留 / 必须清理

| 类别 | 项 | 理由 |
|---|---|---|
| **保留** | `.rddf/build-waves/<topic>/waves.json` + `ledger.json` | 版本化事实记录；退役后「停止写入即可」，与 `.rddf/plan-topics/**` 同口径（`.rddf/rollback/README.md:141`） |
| **保留** | 已合入的 `bw/*` 分支 + merge commit + revert commit | 唯一的回滚锚点与「合过什么」的证据（`nodes/n3/RESULT.md:258-259`） |
| **保留** | ADR / 评审报告 / 回滚清单文件本身（除非整个机制退役） | 「退役的是机制，不是决策记录」（`.rddf/rollback/README.md:137`） |
| **清理** | 所有 `bw/*` 工作树（未合入的） | 否则 FM6 泄漏常驻，且分支被占位无法复用 |
| **清理** | `.rddf/state/build-waves/*.lock` | 运行态、gitignored、跨机器不可移植 |
| **清理** | 集成分支树上的 `.git/MERGE_HEAD`（必须先 `--abort`） | 否则下一次合并会叠在半截状态上（FM2） |
| **清理** | 未合入的 worker 分支 | 默认删；若父要留证，须在台账写 `abandoned{reason,at}` 后保留（否则 `items_incomplete` 永远红） |

---

## 4. 回滚条目草案（`.rddf/rollback/build-waves.json`）

> 结构照 `.rddf/rollback/plan-topics.json`：`version` / `mechanism` / `adr` / `notes` / `delete` / `edits[{path,find,replace}]` / `drill_env` / `verify` / `retire`。
> ⚠ **本草案此刻不可进 registry**：`adr` 指向的 ADR 尚未由 architect 产出 ⇒ M1（`adr_primary` 必须落在决策记录闭集内）必红（`.rddf/rollback/README.md:45`、`:147`）。落地顺序应为 `declared` → 实现批 → `proving` → drill PASS → `active`。

### 4.1 草案 JSON

```jsonc
{
  "version": 1,
  "mechanism": "build-waves",
  "adr": "docs/adr/ADR-build-worker-waves.md",   // ⚠ 待 architect 产出；清单写就当刻必须存在
  "notes": "覆盖面 = 三步：① 移除 `build-worker` agent 块（opencode.jsonc.opencode-go）+ `GUARDED_AGENTS` 撤登记 + 守卫用例整块撤除；② 删实现与判决面（lib/build-waves.ts / scripts/build-wave-check.ts / tests）+ 删 prompt；③ 文档投影（MULTI-AGENT-DESIGN 的计数行·表行·卡片、SUBAGENT-ORCHESTRATION 的表行·§2.4）。保留项：`.rddf/build-waves/**` 已落盘声明与台账（版本化产物，退役后停止写入即可）、已合入的 `bw/**` 分支（回滚锚点）、ADR/评审报告。⚠ 与 plan-topics 的边界：本机制**复用** `subagent` 通道与 `claim` 语汇，但**不复用** `graph.json` / `plan-topic-check.ts`（两套载体、两个 CLI）⇒ 与 plan-topics **不构成组**（组边界须给调用点行号级证据，`.rddf/rollback/README.md:76`），故本清单 `adr_related` 不含 ADR-plan-multi-session-collaboration。⚠ `docs/MULTI-AGENT-DESIGN.md` 的 agent 计数是**手写**的 ⇒ 回滚时必须按当时实际 agent 数**重算**（引入前 12 → 引入后 13 → 回滚回 12 的前提取决于期间是否有其它 agent 加入），**不是**无条件写回 12。",
  "delete": [
    "lib/build-waves.ts",
    "scripts/build-wave-check.ts",
    "tests/build-waves.test.ts",
    "prompts/build-worker.md",
    ".rddf/rollback/build-waves.json"
  ],
  "edits": [
    {
      "path": "opencode.jsonc.opencode-go",
      "find": ",\n    \"build-worker\": {\n      \"model\": \"opencode-go/<模型>\",\n      \"temperature\": 0.2,\n      \"mode\": \"subagent\",\n      \"hidden\": false,\n      \"description\": \"build 侧多 wave 实施的子会话：只推进自己 item 的代码与验证（不派生、不问用户、不合并）。\",\n      \"permission\": {\n        ...整块逐字节...\n      },\n      \"prompt\": \"{file:./prompts/build-worker.md}\"\n    }",
      "replace": ""
    },
    {
      "path": "scripts/agent-guard-rules.ts",
      "find": "export const GUARDED_AGENTS = [\"front\", \"explore\", \"oracle\", \"metis\", \"critic\", \"librarian\", \"plan-worker\", \"build-worker\"] as const",
      "replace": "export const GUARDED_AGENTS = [\"front\", \"explore\", \"oracle\", \"metis\", \"critic\", \"librarian\", \"plan-worker\"] as const"
    },
    {
      "path": "tests/config-guards.test.ts",
      "find": "        \"general.md\", \"critic.md\", \"context-builder.md\", \"plan-worker.md\", \"build-worker.md\",\n",
      "replace": "        \"general.md\", \"critic.md\", \"context-builder.md\", \"plan-worker.md\",\n"
    },
    {
      "path": "tests/config-guards.test.ts",
      "find": "\n  test(\"AC-B1：build-worker 形态（mode / 提交放行 / 验证命令放行 / 四 action deny）\", () => {\n",
      "replace": ""
    },
    {
      "path": "docs/MULTI-AGENT-DESIGN.md",
      "find": "- **少而精**：13 个 agent（4 primary：build / front / plan / title + 9 subagent：explore / librarian / oracle / metis / general / critic / context-builder / plan-worker / build-worker），每个有明确边界",
      "replace": "- **少而精**：12 个 agent（4 primary：build / front / plan / title + 8 subagent：explore / librarian / oracle / metis / general / critic / context-builder / plan-worker），每个有明确边界"
    },
    {
      "path": "docs/SUBAGENT-ORCHESTRATION.md",
      "find": "| `build-worker` | subagent | `opencode-go/<模型>` | build 侧多 wave 实施（只推进自己 item，不合并） | `prompts/build-worker.md` |\n",
      "replace": ""
    }
  ],
  "drill_env": {
    "seed_files": [
      { "path": ".rddf/state/role.json", "content": "{\n  \"current_role\": \"general\",\n  \"updated_at\": \"2026-01-01T00:00:00Z\"\n}\n" }
    ]
  },
  "verify": { "commands": [["bun", "test", "tests/"]] },
  "retire": ["build-waves"]
}
```

### 4.2 哪些 `find` 串必须逐字节钉死（以及为什么）

| # | 串 | 必须钉死的原因（引用本仓同型经验） |
|---|---|---|
| 1 | **整个 `build-worker` agent 块**（含前导 `,\n` 与 6 空格缩进） | 配置是 JSONC，**没有段落注释可作锚点** ⇒ 只能整块钉。只钉首行会让 `replace: ""` 留下孤立 `}` ⇒ JSON 非法 ⇒ drill 在「应用后跑验证」阶段红，而不是在 `find` 阶段红（更难定位）。先例：plan-topics 整块 `find`→`""`（`.rddf/rollback/plan-topics.json:19-20`） |
| 2 | `GUARDED_AGENTS` 的**单行数组全串** | 一行一数组，逗号/空格是字面量（`.rddf/rollback/README.md:47`：`find` 是**字符串**不是正则）。若实现时改成多行 prettier 格式 ⇒ `find` 0 次 ⇒ 「清单已漂移」红 —— 这是**设计上的 tripwire**，不是缺陷 |
| 3 | `EXPECTED.prompts` 的平铺清单行（8 空格缩进 + 尾逗号） | 该清单是「新增文件闸门」的机械命中面（`tests/config-guards.test.ts:1547-1550`；ADR `:210`、`:248`）。缩进错一格即 0 次命中 |
| 4 | `docs/MULTI-AGENT-DESIGN.md` 的**计数行** | 计数是手写的（`.rddf/rollback/plan-topics.json:5` 的 notes 明写：回退时须**重算**，**不是**还原成引入前的旧值，因为旧值在引入时就已陈旧）⇒ 这一串**必须钉死当前值**，但 `replace` 的数值**必须在回滚当刻重算** |
| 5 | **`replace` 串同样逐字节钉死** | ADR D5 落地硬约束 ⑦ 明写「`replace` 也钉死旧路径」，否则未来回滚会把旧行写回（`docs/adr/ADR-plan-multi-session-collaboration.md:101`）。本草案的 6 条 `replace` 全部是**具体值**，不含「沿用/见上」这类散文 |
| 6 | `registry.json` 条目的 `watch[]` | 六态判据里 `proving` 会触发存在性检查（`.rddf/rollback/README.md:45` M7）。清单 `delete` 掉 `scripts/build-wave-check.ts` 后，若 `watch[]` 仍指向它 ⇒ 应用清单后 registry 校验红 |

### 4.3 `retire[]` 的两条路线（互斥，需父裁决）

- **路线 A（推荐）**：`retire: ["build-waves"]` + `delete` 掉清单本身 ⇒ 条目转 `retired`，须带 `retired_at` + `retired_evidence`（`.rddf/rollback/README.md:97`）。
- **路线 B（plan-topics 的选择）**：机制退役但清单与 ADR 仍在 ⇒ 条目保持 `active` 并**撤掉 `watch[]`**（`.rddf/rollback/plan-topics.json:5` 的末段散文）。它成立的隐含理由是「清单留着供反复演练」。
- 【建议】选 A：build-waves 是**后加机制**（有真实回退基线），退役即「能力消失」，留一份对不存在文件 `find` 的清单只会制造永久红。

### 4.4 一个必须先解决的前置（否则草案不可用）

- 【事实】`adr` 字段必须落在**决策记录闭集**（`docs/adr/` ∪ `.rddf/reviews/*-verify.md`，`.rddf/rollback/README.md:147`）。
  本 topic 是**离线讨论稿**，正式 ADR 尚未产出 ⇒ 草案现在写任何路径都是**指向不存在的文件**。
- 【建议】因此草案的正确状态是**`declared`**（已签、未落地、无清单，`.rddf/rollback/README.md:93`），
  且**不得**先写清单文件 —— 否则 `tests/rollback-manifests.test.ts` 的漂移守卫会在「机制还不存在」时就开始钉一串虚构的 `find`。

---

## 5. ⭐ 对既有 `plan` / `plan-worker` 机制的反哺清单（第二部分）

> 与 n4 §5.2 的 R1–R9 不重复：R1–R9 是**判据面**在落地时踩到的缺陷；本节是**失败面**（本节点 §2）反推出的缺陷 ——
> 差别在于每条都能对应到 §2 的一个失败模式，并回答「引入 build-worker 会把这条放大成什么」。
> 每条三字段：**现象 | 依据 path:line | 建议动作**。

### B1 `claim` → `spawn` 是两步、无补偿动作（僵尸 attempt 只能人工 reap）

- **现象**：`claim` 成功（写 attempt、节点变「在飞」）后，`subagent` 调用可能因权限/深度/agent 名错而失败；此时 attempt 仍开着 ⇒ 节点**永久不可派**，只能 `reap --confirm`。ADR 的处方是「spawn 失败**同回合** `close`」—— 纯散文，无 CLI 支持，也无钩子校验。
  **放大到 build 面**：一个 wave 有 5 个 item ⇒ 5 次两步窗口；任一失败就卡住整波（`converged=false`），而父容易把它读成「worker 还没干完」。
- **依据**：`scripts/plan-topic-check.ts:418-477`（`claim` 只写 attempt，无「待确认」态）、`:480-487`（`close` / `reap` 是唯一出口）；`docs/adr/ADR-plan-multi-session-collaboration.md:142`（「spawn 失败**同回合** `close`」为协议）、`:225`（僵尸 attempt「只能 reap（人工确认）」）。
- **建议动作**：二选一 ——
  （a）`claim` 增加 `--spawn-timeout` 语义：attempt 记 `spawn_pending: true`，父在同一命令里 `claim --spawn <cmd>`；
  （b）最小改法：新增 `abandon-spawn <topic> <node>`（= 闭合 attempt 并写 `reason: "spawn_failed"`），
  并把「attempt 的 `finished_at` 读作正常完工」这条歧义（ADR `:298` 已登记）用**独立字段**消掉。
  **不要**只改 prompt：本仓已证明「纪律型字段」会静默失效（ADR `:156`）。

### B2 `reap` 不吊销旧 worker ⇒ 可复活 ⇒ 双活体写者（FM4 → FM5）

- **现象**：`reap` 的实现是「写 `finished_at` + 写 `inputs_reviewed`」，**没有任何吊销**（既没有 session 终止，也没有写围栏）。于是「已闭合」与「仍在写」可以同时成立，且**没有任何判据能看见**。ADR 自己把这条写成责任：确认责任含「旧 worker 已死且不再被 resume」（`:145`）。
  **放大到 build 面**：僵尸 worker 手里有 commit 权限（`opencode.jsonc.opencode-go:71` 对 `build` 的 `git commit` 是 allow），它能在自己的树里持续产出**看起来合法**的提交 ⇒ 合并时被当成正常 wave 产物。
- **依据**：`scripts/plan-topic-check.ts:499-511`（`reap` 只写两个字段）；`docs/adr/ADR-plan-multi-session-collaboration.md:145`、`:319`（残留 12）、`:332`（审计缺口 ①）；`plugins/role-gate.ts:159-161`（探针恒真 ⇒ 无法判活）。
- **建议动作**：给 attempt 加**写围栏**（`claim_gen` / 每次 claim 递增的 `generation`，worker 的产物必须带 `gen`，判据比对 `gen` —— 这是唯一能在「旧 worker 复活」时判出「这是上一代的产物」的机械手段）。
  在此之前，**至少**把 `reap` 的输出从 `ok: true` 改成 `ok: true, warning: "旧 worker 未被吊销；若其复活将产生双写者"`（让危险**出现在父的上下文里**，而不是只在 ADR 里）。
  ⚠ 不要用「TTL 自动接管」来缓解 —— 本仓已明确它会**制造**双写者（`:145`）。

### B3 topic 长锁是纯散文（`lock` 子命令只读，`claim` 不看它）

- **现象**：`.rddf/state/plan-topics/<slug>.lock` 唯一写入方是 prompt 里的人工 `mkdir`；CLI 的 `lock` 子命令**只读**；`claim` / `close` / `cancel` 只取 `graph.lock` 短锁 ⇒ 「同 topic 独占」在**派发面完全不生效**。测试把这条钉成缺陷（措辞即证据）。
  **放大到 build 面**：两个父会话同时往同一 topic 合 wave，会各自看到「我的 integration 领先」⇒ FM2（台账/ref 分叉）与 FM1（重复合并）同时出现，且**两个父都不会被拒**。
- **依据**：`scripts/plan-topic-check.ts:286-320`（`cmdLock` 函数体只有读 + 输出）、`:297-303`（直接构造路径读 owner）、`:336-372`（短锁只管 `graph.json`）；`prompts/plan.md:280`（`mkdir` 是人工动作）、`:283`（短锁说明）；`tests/plan-topics-dag.test.ts:374`、`:385`（「钉住缺陷：无锁判据」）。
- **建议动作**：把「拿锁 + 校验归属」合并成**一个原子命令**（`claim` 内先校验 `.lock` 的 owner == 调用方，不等即拒 `owner_mismatch`）；`lock` 子命令保留只读报告，但名字改为 `lock-status`（命名即承诺 —— n4 R6 的同一纪律）。
  若父决定本期不动，则**必须**在 `prompts/plan.md:276-283` 把「独占」降级为「协议约定（无机械强制）」，删掉「必须是」这类暗示。

### B4 并发下跨 node 污染的不可检出面（写域只到 topic 树粒度）

- **现象**：`plan-worker` 的 `edit` 白名单是 `*.rddf/plan-topics/*`（前缀语义、**跨斜杠**）⇒ 一个 worker 能写**同 topic 下别人的 node 目录**；`scope-check` 又只能单节点核对（并行下必须退化为 topic 级 union）⇒ 「A 改了 B 的 RESULT」这件事**没有判据**。
  **放大到 build 面**：这条从「文档污染」升级为「代码污染」——一个 worker 若 `cd` 到主仓或另一棵树（shell 是 allow 段之外的写盘面，`prompts/build.md:196` 把 shell 写盘列为免宣称之一），污染的是**可发布产物**。
- **依据**：`docs/architecture/plan-topics-topic-model.md:126`（写域只到 topic 树粒度）、`:130`（并行只做 topic 级 union）；`scripts/plan-topic-check.ts:233-240`（单节点 `allowedPrefix`）；`lib/delegate-core.ts:2503-2504`（差集基准 = `workRoot`）；`nodes/n4/RESULT.md:98`（D3 需人判）。
- **建议动作**：给 build 面**只做 union 判据**（n4 D1），并在设计稿里写死「**不提供 per-worker 归因**」；
  plan 侧的最小改法是：在 `scope-check` 加 `--union <node...>`（一次差集 + 前缀求交做**尽力**归因），
  同时**删掉** `docs/architecture/plan-topics-topic-model.md:78` 与 `:130` 之间口径不一致的部分（承诺未实现比没有承诺更坏 —— n4 R3 的同一论证）。
  ⚠ 无论怎么改，**「谁写的」仍不可判**（git 不记录写入者）；建议动作的目标只是**让不可判这件事被写成不可判**，而不是假装解决了。

### B5 `owner` 字段被声明但不消费（声明即承诺，字段在场而无人读）

- **现象**：`owner: "parent" | "child"` 只在 schema 校验处出现（3 处命中：字段、校验、无第三处）；ADR D2 却承诺「`owner: "parent"` 的节点 = 父自己做」。本 topic 自身有活体实例：`graph.json` 把 n5 声明为 `owner: "parent"`，同一节点的 attempt 却记 `agent: "plan-worker"`，`check` 从不报警。
  **放大到 build 面**：`waves.json` 也会有一批「语义性字段」（`target_ref` / `items[].scope` / `base_sha`）。若沿用同一习惯，`target_ref` 会被声明、被读进 summary、但**没有任何判据消费** ⇒ C5 `integration_in_target` 实际判的是「某个默认 ref」。
- **依据**：`lib/plan-topics.ts:61`（字段）、`:197-198`（唯一校验）；`.rddf/plan-topics/build-worker-design/graph.json:141`（`owner: "parent"`）、`:146`（`agent: "plan-worker"`）；`docs/adr/ADR-plan-multi-session-collaboration.md:62`（D2 承诺）。
- **建议动作**：plan 侧二选一（同 n4 R1 的形态，但补一条**机械判据**）：（a）`dispatchableNodes` 输出 `executor: "parent"`，`claim` 拒非父会话对 parent 节点的 claim（新码 `owner_mismatch`）；（b）删字段 + 删 ADR 那一句。
  build 面同步执行**字段 → 判据双向映射表**：`waves.json` 每个字段必须在 n4 §2 的「依据」列出现，否则不进 schema。

### B6 事前闸门的插桩位已在手，但只用来校验 prompt 段（L1 空转）

- **现象**：`subagent-contract` 的 L1 硬门挂在 `tool.hook("execute.before")` 上，能读到 `event.input.{agent,prompt,sessionID,background}`；但它交给 `gate()` 的只有 `{agent, prompt, isResume}`，判定函数是 `evaluatePrompt(...)` —— **完全不读台账 / `graph.json`**。于是「deps 未 done 不得派发」「未 claim 不得 spawn」这两条**技术上可判**的事，在实现里一条都没判（ADR 自己把「派发事前闸门」登记为**范围决定**，不是能力上限）。
  **放大到 build 面**：build-worker 的派发更需要事前闸门（`base_sha` 必须是 integration 祖先、树必须已建、`scope` 必须已声明）—— 而这三条都可以在 `execute.before` 里读盘判。
- **依据**：`plugins/subagent-contract.ts:9`、`:87-94`（L1 钩子）；`lib/subagent-contract-core.ts:535-559`（`gate` → `evaluatePrompt`，输入只有 prompt）；`docs/adr/ADR-plan-multi-session-collaboration.md:14`（前置事实 ⑩「插桩位可行，本期范围决定不做」）、`:309`（残留 2）。
- **建议动作**：把 `gate()` 的输入扩成 `{agent, prompt, parentSessionID, topicDir?}`，新增一个**可选**判定器 `evaluateDispatchState()`：
  - plan 侧：`owner=parent` / 未 `claim` / deps 未 done ⇒ 拒（默认 `warn`，`enforce` 由配置开）；
  - build 侧：`base_sha` 非全 SHA / 未建树 / `scope` 空 ⇒ 拒。
  成本极低（钩子已存在、配置已支持 `mode: warn|enforce`），收益是把 B1/B3/B5 三条从「事后」搬到「事前」。

### B7 并行度与通道强耦合：换通道 = 丢掉台账（FM10）

- **现象**：`delegate` 有全局并发上限 3、有 `pair.json` / `ledger.jsonl`、有 `scope` 差集；`subagent` 什么都没有。为了绕开 3 的上限而改走 `subagent`，等于**同时**失去归因、越界检测、在飞台账 —— 而父的上下文里只剩「我派了」。
  **放大到 build 面**：wave 扇出天然 > 3（一个 wave 5 个 item 很常见）⇒ 这个诱惑会被**结构性触发**，不是偶发。
- **依据**：`lib/delegate-async.ts:95-100`（默认 3，可环境覆盖）；`nodes/n4/RESULT.md:67`（A6 仅 delegate 通道）；`docs/adr/ADR-plan-delegate-engineering-session.md:29`（`subagent` 无登记/台账/槽位/证据门控）。
- **建议动作**：在 build 面的设计稿里写死**通道选择的判据**：「需要台账 ⇒ 必须 `delegate`；`subagent` 只用于**不可写**的只读调研」。并给 `bw` 加一条 `bw doctor`：若 `waves.json` 声明的扇出 > `RDDF_MAX_ACTIVE_BACKENDS` ⇒ 输出**警告 + 建议分批**（不是阻断：分批是合法策略）。
  ⚠ 不要通过「调大 `RDDF_MAX_ACTIVE_BACKENDS`」来解决：默认 3 是既有约束，调大属于另一个决策（且改的是全局行为）。

---

## 6. 本节点**不**声称的东西（诚实口径）

1. **不声称回滚是「一条命令」**：三步里第 ③ 步是 N 次 `revert`（N = wave 数），且**必须倒序**；顺序错了会与后续 wave 再冲突（`nodes/n3/RESULT.md:285`）。
2. **不声称 `bun test tests/` 绿 = 回滚成功**：验证面只覆盖被测到的部分（`nodes/n3/RESULT.md:197`）。`plan-delegate` 的实测结论更狠 —— 「套件绿不绿」**不是**判据，「prompt / 文档 / 守卫是否还在宣称那个能力」才是（`.rddf/rollback/README.md:133`）。
3. **不声称 FM5（双活体写者）有兜底**：它只有「别让它发生」的协议，没有「发生了能判出来」的判据（§2.5）。
4. **不声称本草案能直接跑 drill**：`adr` 指向的文件不存在（§4.4）；`find` 串里的 `<模型>` 与 `...整块逐字节...` 是**占位**，实现批必须替换成真实字节。
5. **不声称 `retire[]` 路线已定**：A/B 两条互斥路线见 §4.3，需父裁决。

---

## 7. 待父裁决

1. **回滚清单的落地时机**：草案现在只能停在 `declared`（ADR 不存在 ⇒ M1 红，§4.4）。是让 architect 先出 ADR 再写清单，还是允许「清单与 ADR 同批」？后者需要一个例外的落地顺序说明（否则 `tests/rollback-manifests.test.ts` 会先红）。
2. **`retire[]` 走 A 还是 B**（§4.3）：A 删清单转 `retired`（推荐）；B 留清单转 `active` 并撤 `watch[]`（plan-topics 的现状）。
3. **`worktree_leaked` 是否从 info 升为阻断**：n4 定 info 的理由是「wave 进行中必然有树」；但 build 面的泄漏代价（磁盘 + 分支占位 + 静默丢未提交改动）远高于 plan 面。若要升阻断，必须在 final 口径下排除「当前 wave 的树」—— 需要 `waves.json` 里有 `active_wave` 字段（新增字段 ⇒ 触及 n4 的「没有第四个性字段」约束）。
4. **双活体写者是否值得引入写围栏**（B2）：这是本设计**唯一**能把 FM4/FM5 从「不可检出」变成「可检出」的手段，代价是 attempt schema 加 `generation` + worker 产物必须带 `gen` + 判据比对。若不做，请在 ADR 的「已知不可检判清单」里**明确写着这条**（而不是只写在风险段）。
5. **`prompts/build.md:355` 的 commit 口径**（n3 待父裁决 3 同一项）：n3 的合并第一步依赖「worker 能提交」；若口径不修，B1 `item_committed` 恒红，且会被误判为 worker 违纪 —— 这是**把系统性失败当个体失败**，必须同批修。
6. **`build-worker` 是否显式写 `"subagent": "deny"`**：这决定回滚清单是否需要改 `tests/config-guards.test.ts` 的「无 subagent 键闭集」断言（`toEqual(["title"])`，见 `tests/config-guards.test.ts:1547-1550` 邻域）。建议**显式 deny**：少一处回滚断言，且堵掉「孙会话」路径。

---

## STATUS: COMPLETE
