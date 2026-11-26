# RESULT — n3：合并与冲突语义

> 回答一个问题：**在 n2 选定的写隔离之上，各路产物由谁、在何时、合到哪里、冲突怎么判与怎么处置、必须留什么痕。**
> 不回答「要不要做 build-worker」（n7/合稿）、不设计判据面完整清单（n4）、不执行任何真实 git 操作。
> 陈述分三类并显式标注：`【事实】`（可引用）/`【推断】`/`【建议】`。

---

## 0. 结论先行

| 问题 | 结论 |
|---|---|
| **谁合** | **只有父（`build` 主会话）合**；worker 永不合别人的分支，父也永不在被多个 worker 碰过的文件上手改 |
| **何时合** | **每 wave 结束合一次到集成分支；全部 wave 收敛后合一次到目标分支**（明确选「每 wave」，否决「最后一次性」与「每节点一次」） |
| **合到哪** | `bw/<topic>/w<N>/<node>` → `bw/<topic>/integration`（**独立集成分支工作树**）→ 目标分支（wave 开始时刻记录的 `target_ref`，不假设叫 `main`） |
| **合几次** | N 个 wave = **N 次集成合入 + 1 次目标合入**；顺序按 `(wave, node id)` 字典序**固定** |
| **幂等性** | **天然幂等**（已合入 ⇒ `Already up to date`），前提是**禁用 `--no-ff` / `--squash`**，且以祖先判定作重放闸门 |
| **冲突解决权** | 归**后合入方（后写者）**，在**它自己的树**里 rebase + 解 + 重验；父只裁决、不落笔 |
| **机判比例** | 6 类冲突：1 类全可机判（C6）、1 类仅文本层可机判（C1）、4 类「存在可机判 / 解决或归因需人判」 |
| **事务** | 合并**做不到「一条 git 命令原子」**；改为「**一次台账原子写 + `MERGE_HEAD` 作在飞标记**」 |
| **入 git** | **必须**：merge commit + attempt 级合并指针入 git；运行态锁与在飞标记不入 |
| **回滚** | 合入前 = 集成分支 reset 到 `pre_sha`；合入目标后 = `git revert -m 1 <merge_sha>`（**不重写已发布历史**） |

**一句代价**：合并把 n2 的「跨树收敛」变成**串行化的单写者步骤**（父一次只合一棵），**并行收益因此被合并吞吐封顶**；
且 `git merge` **不在 commit-gate 射程内**（§9-1），合并的质量门只有协议层 —— 这是本设计已知最弱的一环。

---

## 1. 依据分支（先钉死消费的是哪一支）

- 【事实】n2 已产出，明确推荐**候选 A：linked worktree 隔离 + 每工作树恰一个可写会话**
  （`nodes/n2/RESULT.md:11`、`:280-290`），并明确把「跨树收敛」移交本节点（`nodes/n2/RESULT.md:73-74`、`:325`）。
- 【事实】因此本节点**只按候选 A 出单一结论**；BRIEF 要求的「两分支」只在 §1.1 做**降级映射**，不构成本节点主结论。
- 【事实】n2 已声明 A 的三条边界，本节点直接继承，不再论证：隔离是**工作树级**（不是文件级）、跨树冲突被推迟到合并、
  权限层做不到「每树一写者」（`nodes/n2/RESULT.md:300-305`）。

### 1.1 若父裁决改选它支，合并语义如何降级（映射表，非主结论）

| 若选 | 合并形态 | 后果 |
|---|---|---|
| **A（已选）** | 集成分支 + merge commit + wave 级验证 | 本文全部结论 |
| B 同工作树分支隔离 | 无法并行 ⇒ 合并退化为「串行提交」，且两个 worker 共用同一 index ⇒ 冲突变成 `index.lock` 竞争 | 合并语义不成立（n2 已否决，`:132-135`） |
| C 同工作树目录隔离 | 无分支可分 ⇒ 「合并」= 事后人工判读并集差集 | 无机械合并面；冲突判定退化为散文 |
| D 不并行 | 无合并；只需 wave 边界 `commit` + 验证 | 零新增机制，但拿不到并行（n2 保留为回退基线，`:193-203`） |
| E 独立 clone | 只能 bundle/patch 交换；无共同祖先时三方合并失效 | **可机判比例骤降**，冲突几乎全转人判 |

---

## 2. 合并模型

### 2.1 谁合（责任主体唯一）

- 【事实】宿主层没有任何「跨 worktree 合并」的既有机制：后端的工作根是它自己那棵树
  （`lib/delegate-core.ts:488-496`），变更差集只覆盖该树（`:2503-2504`；镜像实测 `tests/canonical-root.test.ts:101-114`：
  worktree 内改动在主仓 `git status` 里数不到）；`PLAN_REF_ROOTS` 也不含任何合并面（`lib/delegate-core.ts:1321-1326`）。
- 【事实】worker 的权限面不覆盖别人的树：delegate 的 `scope` → edit 规则以 `workRoot` 为基准，工程根之外直接不放行
  （`lib/delegate-core.ts:552-572`、`:1040-1046`）；`subagent` 通道连 per-session 权限都没有
  （`docs/adr/ADR-plan-delegate-engineering-session.md:29`）。
- 【建议】**只有父能合**，三条理由：
  1. 跨树操作需要一个「不属于任何 worker 工作根」的会话；
  2. 合并是「一次只写一个目标树」的动作，写者必须与被合并者分离，否则是自审自批；
  3. 与既有「每文件恰一写者、父是唯一调度者」同构（`docs/adr/ADR-plan-multi-session-collaboration.md:40-50`）。

### 2.2 拓扑（合到哪）

- worker 分支：`bw/<topic-slug>/w<N>/<node-id>`，**从 `wave_base_sha` 开出**，而不是从「主仓当前 HEAD」开出 ——
  后者正是 n2 登记的 F3 基线错位来源（`nodes/n2/RESULT.md:101-102`）。
- 集成分支：`bw/<topic-slug>/integration`，**在独立工作树里 checkout**，不占主工作树。理由：主工作树可能脏、
  可能是用户正在操作的树；把冲突暴露在集成分支树上，主树保持可读。
- 目标分支：wave 开始时**主工作树实际 checkout 的那个 ref**，记录为 `target_ref` + `target_pre_sha`（不假设叫 `main`）。
- 【事实】为什么不让 worker 直接往目标分支合：git 禁止两个 worktree 同时 checkout 同一分支
  （`docs/adr/ADR-front-multi-backend.md:157`）⇒ N 个 worker 都指向目标分支会立刻撞这条。

### 2.3 何时合（明确选择，不写「视情况」）

**选：每 wave 一次（→ 集成分支）+ 收尾一次（集成分支 → 目标分支）。**

五条理由：

1. **后一个 wave 必须从已合入的基底开出**。否则 wave 2 的 worker 看不到 wave 1 的接口变更 ⇒
   C3（跨文件依赖顺序冲突）从「合并时暴露」退化为「永远不暴露、只在运行时炸」。
2. **冲突爆炸半径**：每 wave 的冲突集 = 本 wave 与「已合入基线」的差；压到最后一次性合，冲突集是 N 个 wave 的交叉积。
3. **回滚锚点**：每 wave 一个 merge commit ⇒ 可单独 revert 一个 wave 而不动其它（§8）。
4. **验证成本可摊**：本仓声明的验证命令是全量套件（`.rddf/commit-gate.json:2-5`：`bun test tests/` + 锚点脚本，
   超时 600 s，`:6`）⇒ 每 wave 跑一次可接受，每节点跑一次不可接受。
5. 「最后一次性合」只在「wave 之间完全无依赖且合并成本极低」时更优；而并行的收益来自 wave **内**，不来自合并 ⇒ 不构成理由。

【建议】**明确否决「每节点合一次」**：单节点合入会让「半成品 wave」进入集成分支，后续 wave 从半成品开出 ⇒
依赖判定失真（与 D10「在飞 = 未闭合 attempt」同类错误：把未完成当已完成，
`docs/adr/ADR-plan-multi-session-collaboration.md:140-143`）。

### 2.4 幂等性（合几次、重放怎么办）

- 【事实】`git merge <已合入分支>` 是 **no-op**（`Already up to date`）；`--no-ff` 会造**空 merge commit** ⇒ 重放产生一串空提交；
  `--squash` 丢掉分支身份 ⇒ 祖先判定失效。【推断，基于 git 语义】⇒ 两种开关都**禁用**。
- 【建议】重放闸门 = `git merge-base --is-ancestor <worker_tip> <integration_tip>`：真 ⇒ 跳过合并，只**补写台账**（幂等补写）。
- 【建议】台账条目以 `(topic, wave, node, worker_tip_sha)` 为键；同键重复出现 ⇒ 记审计告警，不执行第二次合并。
- 【建议】中途崩溃：集成分支工作树出现 `.git/MERGE_HEAD` ⇒ 下次合并前必须 `git merge --abort`，
  或按台账 `merged_sha` 判定已完成。**用 git 自己的在飞标记代替第二本账**（第二本账一贯被否决，
  `docs/adr/ADR-plan-multi-session-collaboration.md:187`）。

### 2.5 与「收树」的次序

- 【事实】n2 要求合并后由父 `git worktree remove` 收树（`nodes/n2/RESULT.md:73-74`）；worktree 生命周期**没有任何自动管理**
  （`docs/adr/ADR-front-multi-backend.md:175`：「生命周期与清理策略全归插件（不配即定时炸弹）」）。
- 【建议】次序固定为：**worker commit → 合并 → wave 验证绿 → 记台账 → `worktree remove`（保留分支）**。
  分支不删：分支只是一个 ref（几十字节），删了就无法回答「这条 wave 合的是什么」，也丢掉回滚锚点（§8）。

---

## 3. 冲突分类表（6 类）

> 每类的「判定」列**必须**明确标注 `可机判` / `需人判`；含糊即不合格。

### C1 同一文件、不同 hunk（文本层可自动合并）

- **形态**：worker A 改 `lib/x.ts` 的函数 `f`，worker B 改同文件的函数 `g`；两边改动不重叠。
- **判定**：**可机判（仅文本层）** —— `git merge` 退出码 0，或 `git merge-tree` 干跑无冲突标记。
  ⚠ 它只判「字节可合」，**不判语义正确**（语义兜底在 C3 与 §5）。
- **处置**：自动合入集成分支 → 跑 wave 验证 → 绿则接受。
- **留痕**：台账 `result=auto`、`conflicts: []`、`verify.exit`、`merged_sha`。

### C2 同一文件、同一 hunk（文本冲突）

- **形态**：两边改同一行 / 同一函数同一段；`git merge` 退出码 1，工作树出现 `<<<<<<<` 标记。
- **判定**：**存在可机判 / 解决需人判**。冲突的**存在**由 git 判定；**解决的正确性**没有任何机械判据
  （测试只覆盖被测到的部分，而「被冲突的两段意图谁对」是语义判断）。
- **处置**：**不在集成分支上手改** —— `git merge --abort`，把后合入节点重开为一次新 attempt（`needs-rework`），
  由该 worker 在**自己树**里 `rebase` 到 integration tip → 解冲突 → 重跑验证 → 重新提交 → 重新走合并。
- **留痕**：`result=rework`、`conflict_kind=same_hunk`、`conflict_files[]`、新 attempt id、解决者 session/agent。

### C3 跨文件依赖顺序（一方改了对方依赖的接口/类型）

- **形态**：A 把 `f(x)` 改成 `f(x, opts)`（自身自洽），B 的新文件仍调用 `f(x)`；文本**无冲突**，`git merge` 干净，
  但类型检查 / 测试红。
- **判定**：**条件可机判 / 归因需人判**。判得出与否**取决于验证命令是否覆盖该调用**
  （`.rddf/commit-gate.json:2-5` 是本仓唯一声明的验证面）；「哪个失败 ⇒ 哪个节点负责」靠 `scope` 声明与 diff 交集反推，
  可能多义（§5-6）。
- **处置**：wave 验证红 ⇒ 用失败用例的文件路径 ∩ 各 worker 的 `scope` 前缀求交，定位候选节点：
  命中唯一 ⇒ 按 C2 重开该节点；命中多个 ⇒ **父裁决**（不可机判）。
  **禁止**父直接改代码绕过 —— 否则父成为第三个写者，破坏单一写者。
- **留痕**：`verify.exit != 0` + 失败命令原文 + 失败文件清单 + `attributed_to: [node]` 或 `unattributed`。

### C4 基线漂移（合入时上游已变）——**单独成类，不并入 C1/C2**

- **形态**：worker 从 `base_sha` 开出；合并时 integration tip 已前进（别的 wave / 父自己的提交 / 目标分支前进）。
  文本可能**完全无冲突**（两边改不同文件），但 worker 的前提已过期。
- **判定**：**检测可机判 / 重建判定需人判**。
  - 漂了没有：`git merge-base --is-ancestor <base_sha> <integration_tip>`（可机判）；
  - 漂移是否落在同一批文件：`git diff --name-only <base_sha> <integration_tip>` ∩ worker 变更集（可机判）；
  - **漂移是否改变了 worker 依赖的语义但没碰同一文件** ⇒ 机械信号为零 ⇒ 需人判。
- **处置分三级（固定规则）**：
  - **L1** 交集为空 ⇒ 直接合，wave 验证兜底；
  - **L2** 交集非空但 `git merge` 干净 ⇒ 合并 + **强制全量验证**（不得因「无冲突」跳过）；
  - **L3** `base_sha` 不是 integration tip 的祖先（历史分叉/被 force 过）或 L2 验证红 ⇒ **重建 worker 树**：
    从新 base 新开树，worker 按 `TODO.md` 与交回文档重建（D6 的重建路径，`docs/adr/ADR-plan-multi-session-collaboration.md:103-108`）。
- **留痕**：`base_sha`、`integration_pre_sha`、`drift_files[]`、`drift_level: L1|L2|L3`。

### C5 删除/修改、重命名冲突

- **形态**：A 删 `old.ts`，B 在同文件加函数；或 A `git mv` 后 B 改旧路径。
- **判定**：**存在可机判 / 处置需人判**（git 报 `CONFLICT (modify/delete)` 或 `rename/rename`；
  「删是意图还是误删」「重命名的目标名哪个对」无机械判据）。
- **处置**：一律不自动解；交父裁决，必要时问用户；裁决后由**后写者**执行（不是父）。
- **留痕**：`conflict_kind=modify_delete|rename`、`decision_by`（parent|user）、`decision` 原文。

### C6 生成物 / 锁文件（`bun.lock`、自动生成代码）

- **形态**：两边都跑了依赖变更或代码生成器，同一文件内容不同。
- **判定**：**可机判**。检测 = 路径模式（`*.lock` / 文件头 `generated` 标注）；处置 = 固定规则
  （取一侧 + 用仓库声明的生成命令重跑 + 验证）。
- **处置**：**不接受手工合并生成物**；`rm` + regenerate + 验证；生成命令必须可在集成分支上无条件重跑
  （不可重跑 ⇒ 降级为 C2，需人判）。
- **留痕**：`conflict_kind=generated`、`regenerated_by`（命令原文）、`generator_version`（有则记）。

**汇总**：C6 全可机判；C1 仅文本层可机判；C2/C3/C4/C5 都是「**存在/检测可机判，解决或归因需人判**」。
不得把 C2/C3/C5 的处置写成「自动解决」——本仓没有任何语义判据支撑它。

---

## 4. 冲突解决权为什么归「后写者」

- 【建议】规则：**谁后合入，谁负责解**；父只裁决「谁对」，不落笔改文件。
- 三条理由：
  1. **单一写者不被破坏**：父若手改冲突文件，父就成了该文件的第三个写者，而父的写没有 `scope`、没有租约校验、
     也没有归属台账（`docs/adr/ADR-plan-multi-session-collaboration.md:40-50` 的单一写者表会被实质击穿）。
  2. **归因可留痕**：解决者 = 该节点的 attempt ⇒「这段冲突代码是谁写的」有唯一答案；父代笔则归因断链。
  3. **解决动作发生在被隔离的树里**：解决者在自己树里 rebase，冲突的中间态不污染集成分支，也不污染主树。
- 例外**只有一个**：C6 生成物的重生成 —— 那是确定性操作（同命令、同版本 ⇒ 同结果），不是创作，父可以执行。

---

## 5. 「不可机判」清单（对齐 ADR「已知不可机判」体例）

| # | 不可机判的事 | 为什么 | 兜底 |
|---|---|---|---|
| 1 | 干净合并后的**语义等价性** | `git merge` 只判字节；测试只覆盖被测到的部分 | wave 级全量验证 + 每 wave 一个可 revert 的 merge commit + 人工抽检 diff |
| 2 | C2 冲突解决的**正确性** | 无判据可表达「两段意图谁对」 | 解决者 = 后写者 + 全量验证 + 父读 `git show` diff + 台账记解决者 |
| 3 | 「这个 wave 真的完成了目标」 | D11 已自述：`converged` 是**调度信号**、非交付信号，交付信号需读 `TOPIC.md` 目标段（`docs/adr/ADR-plan-multi-session-collaboration.md:158`、`:166-167`） | 父按目标段人工判定；台账只写事实不写结论 |
| 4 | **树外写入是否发生** | 差集只覆盖 `workRoot`（`lib/delegate-core.ts:2503-2504`）；n2 已登记为 F2（`nodes/n2/RESULT.md:103-105`） | 合并前比对 worker 分支触及路径与 `scope`（可机判的部分）+ 事后审计；「有没有发生」本身不可判 |
| 5 | 两分支各自绿、**组合后行为错**（测试未覆盖的交互竞态） | 无判据能穷举组合语义 | wave 级验证 + 小 wave 扇出（写进 prompt，非闸门） |
| 6 | 同一意图被**重复合入**（等价改动不同 SHA） | 内容等价不可判（无规范形） | 分支命名 + commit message 约定 + 台账键（`node+wave`）人工核对 |

⚠ 这六条**都不得**在 n4 的判据面里被写成「有闸门」；能做的只有「事后可见 + 可回滚」。

---

## 6. 与既有事务范式（D9/D10/D11）的关系

### 6.1 需不需要「一次原子写内完成多件事」

- 【事实】D9 的范式是「一次 `graph.json` 原子写内完成：补 `finished_at` → 置 `cancelled` → 回填缓存 → 消解下游」
  （`docs/adr/ADR-plan-multi-session-collaboration.md:133`、`:215`）。它能这么做的前提是**四个写点都在同一个 JSON 文件里**。
- 【事实】合并的写点跨了 git 内部状态：① 集成分支 ref ② 集成分支工作树 + index ③ 合并台账 ④（收尾）目标分支 ref。
  git 只能保证 **ref 更新的原子性**，不能保证「工作树/index 与 ref 的联合原子性」——`.git/MERGE_HEAD` 的存在就是这个窗口的物证。
- 【建议】**不追求伪原子**，改为：
  - 台账的「追加已完成条目 + 刷新指针」做成**一次原子写**（tmp + rename；范式同 `scripts/plan-topic-check.ts:374`
    的「原子写 graph.json」）；
  - 其余用**可检测的在飞标记**（`MERGE_HEAD`）+ `--abort` 重放；
  - 与 D9 的关系是**同型而非同实现**：多写点必须被一个「可判定的收敛点」收束，本节点选的收敛点是**台账**，
    不是「一条命令」。

### 6.2 锁的粒度

- 【建议】两把短锁，作用域不同：
  - `merge` 锁：`<root>/.rddf/state/plan-topics/<topic>.merge.lock` —— 串行化「集成分支上的合并序列」；
  - `target` 锁：`<root>/.rddf/state/merge/<target-ref 摘要>.lock` —— 串行化「最终合入目标分支」，
    两个 topic 同时合同一目标分支时靠它排序（git 的 ref 锁只保证完整性，不保证逻辑顺序）。
- 【事实】实现范式沿用 graph 锁：`mkdir` 原子 + `created_at` + **硬超时**回收（不按 mtime 判死：持有者慢 ≠ 死）
  + 超时抛错（`scripts/plan-topic-check.ts:335-371`；默认值定义在 `:325`，env 可覆盖）。
- 对比参照：角色锁是「陈旧回收 30 s / 硬超时 10 s」（`docs/adr/ADR-role-aware-permissions.md:104`），
  本设计选 graph 锁口径，因为它是 D10 之后的新范式且明确写了「硬超时、不按 mtime」。

### 6.3 超时策略（含「为什么不在锁内跑验证」）

- 锁只覆盖「读台账 → 判祖先 → 更新 ref → 原子写台账」四步，正常 < 1 s；硬超时取 **60 s**（与
  `RDDF_PLAN_GRAPH_LOCK_TIMEOUT_MS` 默认同量级，`scripts/plan-topic-check.ts:325`），env 可覆盖。
- **验证必须在锁外**：本仓验证是全量套件，声明超时 600 s（`.rddf/commit-gate.json:6`）。锁若覆盖验证，
  硬超时不是被拉长到 10 分钟（误杀窗口过大），就是按 60 s 回收（把正在验证的持有者当死锁回收 ⇒ **双合并**）。
  D10 已把这条写死：短锁负责互斥、台账负责在飞（`docs/adr/ADR-plan-multi-session-collaboration.md:146`）。
- 【建议】锁 holder 记 `session_id` 但**不参与判活**（与「冲突只看后端活体」同理，
  `docs/adr/ADR-plan-delegate-engineering-session.md:109`），只作审计。
- 【事实】诚实口径：与 D10 一样，锁是**协议级**，手写命令仍可绕过（同篇 `:146` 末句、`:226`）。

### 6.4 与 D11「收敛」的衔接

- 合并侧的「收敛」= D11 `converged`（`docs/adr/ADR-plan-multi-session-collaboration.md:162`）**加上一条**：
  `target_ref` 已包含 `integration`（`git merge-base --is-ancestor integration target`）。
- 本节点**不定义判据码**（那是 n4），只给出输入：`merged_sha` 缺失 = 在飞；`converged ∧ 已入目标` = 可收树。

---

## 7. 合并产物必须入 git 的理由（含反例）

### 7.1 四条正面理由

1. **载体即语义**：merge commit 不在历史里，「合过什么」就不可重建；分支可删，但 merge commit 无法凭空造。
2. **回滚可达性**：合入目标后唯一的无损回滚是 `git revert -m 1 <merge_sha>`（§8），SHA 只能从 git 历史取；
   而本仓明确写着「回滚是**单向**操作」「清单只对写就时的树有效」（`.rddf/rollback/README.md:166`）。
3. **跨会话/跨机器重建**：D6 要求换根后按磁盘事实重建（`docs/adr/ADR-plan-multi-session-collaboration.md:103-108`）；
   运行态台账是 gitignored、跨机器不可移植（同篇 `:91`、`:96`）⇒「哪些分支已合」必须落在版本化文件/ref 上。
4. **与「离线产物入 git」同口径**：`.rddf/plan-topics/**` 是版本化产物（同篇 `:22`；
   `.rddf/rollback/README.md:141` 亦把已落盘协作文档列为保留项）。

### 7.2 反例（诚实的反面，防止把「入 git」当成万能凭据）

- **反例 A：把验收结论写进 commit message = 自述**。merge commit 只证明「这些字节被合进来了」，不证明「验过」。
  ⇒ 台账必须存 `verify.commands[] + exit`，或干脆只写事实不写结论（本仓对「自述 vs 派生」的立场：
  `docs/adr/ADR-plan-multi-session-collaboration.md:56`、`:182`）。
- **反例 B：把 worktree 目录 / patch 副本入 git = 噪音**，且含机器路径；本仓已否决把 session id 编进版本化路径
  （同篇 `:181`）⇒ 只入 refs 与台账，不入工作树副本。
- **反例 C：只把合并痕迹放运行态 `ledger.jsonl`**（形态见 `lib/delegate-core.ts:2517` 的 `ledgerBase`）⇒
  换机器后无法判重，重放会重复合入。
- 【建议】所以入 git 的只有**三样**：① merge commit；② attempt 级合并指针
  （`branch` / `base_sha` / `tip_sha` / `merged_sha` / `drift_level` / `verify.exit`）；③ 分支命名约定（体现在
  commit message 的 `Merge bw/...` 里）。不入 git：锁文件、`.git/MERGE_HEAD`、验证日志原文摘要之外的大文件。

---

## 8. 回滚可达性映射（对齐 `.rddf/rollback/` 口径）

| 时点 | 回滚动作 | 可达性 |
|---|---|---|
| wave 已入集成分支、未入目标 | `git reset --hard <integration_pre_sha>`（集成分支未发布 ⇒ 允许重写） | **完全可达**；台账补 `rollback` 行 |
| 已入目标分支 | `git revert -m 1 <merge_sha>`（前向提交，**不重写历史**） | 可达；但必须**逐 wave 倒序** revert，否则与后续 wave 的合并再冲突 |
| worker 分支未合 | 直接 `worktree remove` + 删分支 | 无痕（从未进入历史） |
| 机制整体退役 | 按 `.rddf/rollback/README.md:39-47` 写 `build-worker.json`（delete prompt / edits config / verify） | **本设计当前不产生代码 ⇒ 本次不新增清单**；一旦落地为 CLI（如 `merge` 子命令）就必须登记 registry 条目（判据见 `.../README.md:89-107`，先例见 `registry.json:12-32`） |

- 【事实】registry 的状态机是六态（`active` / `proving` / `unmanifested` / …），「该有的清单在不在」是独立判据
  （`.rddf/rollback/README.md:89-107`）。合并协议本身**没有配置面与代码面**，故不构成 registry 机制。
- 【建议】它是 `front-multi-backend`（G1 worktree 槽位内核，`registry.json:58-68`）的**用法**：
  若将来引入 `merge` CLI，宁可归入 G1，也不要塞进 `plan-topics` —— 组的边界必须给「调用点行号级依赖证据」
  （`.rddf/rollback/README.md:76`），合并 CLI 与 plan topic checker 没有这种耦合。

---

## 9. 明确不做 + 已知薄弱点

**不做**：不自动解 C2/C5；不用 `--no-ff` / `--squash`；不在合并后自动 push（`git push` 仍 ask/deny，
`opencode.jsonc.opencode-go:60-69`）；不做跨 topic 的批量合并；不做「合并即验收」。

**薄弱点 1（最重）：`git merge` 绕开 commit-gate。**
- 【事实】门禁只覆盖 shell 里的 `git commit`（`plugins/commit-gate.ts:7`、`:51`、`:66`；`lib/commit-gate.ts:158`
  只在 `sub === "commit"` 时返回 true）⇒ merge 产生的提交**不经过**「验证命令全绿 + 暂存区非空 + 暂存落在角色写集内」
  三判据（`docs/adr/ADR-commit-verification-gate.md:33-39`）。
- 【建议】用 wave 级 verify 补 —— 但这是**协议层**，不是权限层；登记给 n4 / n7，**不得**伪装成有闸门。

**薄弱点 2：shell 写盘不在 role-gate 门控内。**
- 【事实】`plugins/role-gate.ts:7` 自述门控面只覆盖 `edit` / `write` 两个工具，`shell` 写盘不在门控内；
  `prompts/build.md:196` 把「shell 写盘」列为六项免宣称之一。⇒ 合并写盘**没有角色写集强制**。

**薄弱点 3：通道决定可观测性。**
- 若走 `subagent`：「谁合的、合了几次」没有台账（`docs/adr/ADR-plan-delegate-engineering-session.md:29`）；
- 若走 `delegate`：槽位键 = `workRoot`（`lib/delegate-core.ts:154-155`），合并动作在目标树上执行、**不占槽**，
  与单槽语义不冲突；但父在合并期间若还开着自己的后端，仍需遵守 D4（`docs/adr/ADR-plan-delegate-engineering-session.md:76-77`）。

**薄弱点 4：worker 能不能 commit 存在口径漂移。**
- 【事实】后端可以 commit：简报第 3 条已改成「由工具层验证门决定」（`lib/delegate-core.ts:1645`），
  与 ADR 一致（`docs/adr/ADR-commit-verification-gate.md:56`）。
- 【事实】但 `prompts/build.md:355` 仍写着「本仓后端**被禁止 commit**」，`tests/verifier-baseline.test.ts:5` 也复述同一句。
- 【推断】若 worker 按这句教学「不提交就交回」，则合并时**无分支可分**，本设计的第一步即失效 ⇒ 必须先修口径（§待父裁决 3）。

---

## 10. 交给下游

- **n4（判据面）**：把 §3 的「条件可机判」原样带入；§9-1（merge 绕过 commit-gate）与 §5 的六条必须写成
  「事后可见 + 可回滚」，不得写成闸门；§6.2/§6.3 的锁与超时参数可复用。
- **n7（失败模式与回滚）**：§8 的四行回滚 + §9 的四条薄弱点直接复用；n2 的 F2（树外写入）与 F6（合并冲突）
  在本节点有处置、但**无机械拦截**。
- **合稿**：本节点结论 = 「在 A 之上：父串行合、每 wave 一次、冲突解决权归后写者、台账入 git、回滚走 revert」。

---

## 待父裁决

1. **集成分支工作树的归属**：本设计新增一个目录约定（独立集成分支工作树）。n2 已把 worktree 生命周期判给父
   （`nodes/n2/RESULT.md:93-95`、`docs/adr/ADR-front-multi-backend.md:175`），请父确认该目录由谁建、谁收、路径写在哪。
2. **C3 的归因前提**：C3 需要 worker 在简报里声明「接口面」，本仓目前没有这个字段（`scope` 只是 edit 前缀，
   `lib/delegate-core.ts:552-572`）。是否新增字段属 n4 判据面范围；本节点只登记「没有它，只能靠失败文件反推」。
3. **`prompts/build.md:355` 的陈旧口径**不在本节点写域：它是「worker 能提交」的前提，请父决定由谁修
   （不修则 §2.5 的次序第一步不成立）。

## STATUS: COMPLETE
