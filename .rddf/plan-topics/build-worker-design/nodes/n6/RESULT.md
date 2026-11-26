# RESULT — n6：与 `rdd-builder` P2 worktree 模式的关系

> 节点：`build-worker-design / n6`｜执行者：plan-worker（子会话）｜日期：2026-11-26
> 边界：不改 `rdd-builder`；不重复 n2 的隔离选型（只把 linked worktree 当作「可能的被复用方」）；不设计合并语义（n3）。
> 分类标记：**【事实】**= 本仓可引 `path:line` 或磁盘可核；**【推断】**= 由事实推出、无单一出处；**【建议】**= 给父/下游的动作。
> **上游核实状态**：`rdd-builder` skill 及其脚本**不在本仓**；本次尝试读 `~/.agents/skills/rdd-workflow/skills/rdd-builder/SKILL.md`
> 被权限拒绝（`external_directory`）⇒ **「上游/外部工件，未在本仓核实」**。本文所有 P2 内部细节**只引本仓二手记录**，
> 并逐处标注「二手（本仓记录）」；**不编造 SKILL.md / 脚本的 `path:line`**。

---

## 0. 结论先行

**【事实/判定】** 三者关系是 **并存**，且是**分层并存**：`rdd-builder` P2 与「`build` 多 wave 并行实施通道」处在**两个不同的层**上 ——

- **P2 属于「实施层内部的一个阶段」**：它在**一个工程 session 内部**为**一个 change** 准备工作树（`.rddf/wt/<name>/`），
  再由 `execute` 在该树里按 plan 逐 task 执行。本仓对这条边界的原话是「工程 session 内部**可以**用 rdd-* skill
  （`rdd-builder` P0/P1.5/…），那是工程 session 的事」（`docs/front-delegate-architecture.md:301-304`）。
- **新通道属于「派发层」**：它要解决的是「N 个可写会话如何并行、如何 join、如何判据、如何合并」，**不是**「一个会话里怎么开一棵树」。

**【事实/判定】** 因此**不是替代**，也**不能整体复用 P2 当调度器**：本仓记录的 P2 语义是「一 change → 一树 → 一个 builder 会话，
且 P0 / P2.5 是 HARD pause」（`prompts/build.md:427`、`.rddf/reviews/role-matrix-rdd-workflow-alignment-audit.md:84`），
它**没有任何并行调度面**；把 N 个 wave 实现成「N 次 P2」会把人工 pause 乘以 N，把并行重新串行化。

**【建议/单一推荐】** **并存（分层），并在「隔离形态 + 交接契约」两处做机制级复用**：
派发层**不依赖** `rdd-workflow`（沿用 `docs/front-delegate-architecture.md:303` 的既有边界：派发方不依赖 rdd-workflow）；
实施层（每个 worker 内部）**可选**调用 `rdd-builder` / `execute`。路径所有权分家（见 §6）。

---

## 1. rdd-builder P2 现状（能核实到什么、核不到什么）

### 1.1 本仓能核实的 P2 事实

| # | 事实 | 依据 |
|---|---|---|
| P2-1 | P2 是 builder 角色的**可选增强**（装了 `rdd-builder` 才有）；角色矩阵本身自足，未装则走内置流程 | `prompts/build.md:412`（builder 行）；`docs/MULTI-AGENT-DESIGN.md:326-332` |
| P2-2 | P2 的**前置**是 `rdd-builder` 的两个输入面：`.rddf/improvements/<change>.md` + `.rddf/state/.planner-handoff.json` **均存在** | `prompts/build.md:412`（「前置条件（skill frontmatter 原文）」列） |
| P2-3 | P2 的**落点**是 `.rddf/wt/<name>/`（由产品侧 `phase2_execute.sh:126` 写入）；同族 owns 还有 `.rddf/plans/<name>.md`（`phase1_plan.sh:31`）、`.rddf/state/builder/<name>.json`（`phase0_approval.sh:289`）、`.rddf/state/.plan-handoff.json`（`phase1_5_deps.sh:29`） | **二手（本仓记录）**：`.rddf/reviews/role-matrix-rdd-workflow-alignment-audit.md:84` |
| P2-4 | P2 的**下游消费**是 `execute` skill：其前置为「`.rddf/plans/<name>.md` 已存在 **+** worktree context 已设（**或 lightweight 模式**）」 | `prompts/build.md:412` |
| P2-5 | P2 **没有 commit gate**（v5 起删除）；commit 语义由 `archive.sh::check_worktree_commits` **在归档前**强制；P2 **不会**因工作区脏而中止 | `prompts/build.md:428` |
| P2-6 | P0 / **P2.5** 是 **HARD pause**（用户必须显式选择，agent 不替用户拍板）——**P2 本体不在 HARD pause 名单内** | `prompts/build.md:427` |
| P2-7 | 本仓**已存在** `.rddf/plans/**` 的 3 个产物，且该根是 `delegate` 的 `plan_ref` accepted root 之一 | 磁盘：`.rddf/plans/{session-alignment-contract,plan-multi-session-collaboration,cross-repo-workspace-check}.md`；`lib/delegate-core.ts:1321-1322`；`docs/adr/ADR-plan-delegate-engineering-session.md:57`（「`.rddf/plans/**`（**builder P1 的 TDD 计划**所在）」） |

### 1.2 本仓的**反证**：P2 在本仓从未跑过

**【事实】** 四项磁盘事实同时为真 ⇒ 本仓从未走过 `rdd-builder` 的 skill 路径：

1. `.rddf/state/.planner-handoff.json` **不存在**（`glob .rddf/state/.planner*` 零命中）；
2. `.rddf/state/builder/` **不存在**（P0 的落点 `phase0_approval.sh:289` 无产物）；
3. `.rddf/wt/` **不存在**（P2 的落点无产物）；
4. `prompts/build.md:412` 要求的前置「两份文件均存在」由此**不成立**。

**【事实】** 而 `.rddf/plans/**` 有 3 个文件、`docs/guard-authoring.md:222` 仍写「`.rddf/plans/**`（rdd-builder P1 产物，**当前不存在**，
出现时按注释扩）」⇒ 该行是**过期快照**（本仓盘上现已存在）。**这不影响结论**，但它说明：本仓的 `.rddf/plans/**` 不能当
「P2 已实践过」的证据，只能当「P1 产物形态已出现」的证据。

**【推断】** 因此在本仓的现实里，P2 是**纸面可选层**（装了才走，未装走内置流程，`docs/MULTI-AGENT-DESIGN.md:326`）；
任何「复用 P2」的设计都必须先回答「**未装 / 前置不成立时怎么办**」，而不能假定它可用。

### 1.3 本仓**核不到**的部分（如实登记）

- **P2 的分支命名 / 配额 / 清理策略**：本仓无任何记录。BRIEF 提到的「配额」在本仓**零锚点**
  ⇒ 标「上游语义（未在本仓核实）」。本仓可见的配额只有 delegate 侧两条：全局并发上限默认 3（`lib/delegate-async.ts:96`）
  与「同 `workRoot` 单槽」（`docs/adr/ADR-front-multi-backend.md:155-157`）。
- **`skills/rdd-builder/` 目录下的脚本本体**：`.rddf/reviews/role-matrix-rdd-workflow-alignment-audit.md:84` 只是**引用了**脚本名
  （`phase0_approval.sh` / `phase1_plan.sh` / `phase2_execute.sh` / `phase1_5_deps.sh`），脚本内容本仓不可读。
- **本机是否装了 rdd-workflow**：`prompts/build.md:393-404` 规定用 `scripts/rdd-skills.sh` 探测，但本会话 shell 被拒（只读三段式白名单
  不含 `bash`）⇒ **未实测**。旁证：`tests/rdd-skills.test.ts:88-89` 记录两个候选安装位置（`~/.agents/skills/rdd-workflow/skills/rdd-builder`
  与 `~/.agents/skills/rdd-builder`），`scripts/rdd-skills.sh:56` 的内置权威清单含 `rdd-builder`。

---

## 2. 可复用点（≥2 条，含复用方式与代价）

### R1 复用「一单元一树」的**隔离形态**（不是复用实现）

- **形态**：P2 的物理单元是「一个 change 名 → 一个目录 `.rddf/wt/<name>/` → 一棵独立工作树 → 一个 builder 会话」
  （二手：`.rddf/reviews/role-matrix-rdd-workflow-alignment-audit.md:84`）。
- **复用方式**：新通道的 wave 单元**照抄这个形状**——一 wave 一棵 linked worktree、一分支、一活跃写会话。
  这与 n2 推荐的候选 A **同一基质**，且其不变量正是本仓既有语义：`workRoot` 单槽（`docs/adr/ADR-front-multi-backend.md:155-157`）、
  两棵树独立 index ⇒ 写同一路径互不覆盖（同篇 `:157`，原文标注「实测」）。
- **代价**：① **路径所有权冲突**（`.rddf/wt/**` 归 `rdd-builder`，见 §3-C1）⇒ 要么换根，要么显式改 owner；
  ② 树的生命周期本仓**不代管**：`docs/adr/ADR-front-multi-backend.md:175` 明写自动创建后置、「生命周期与**清理策略**全归插件
  （**不配即定时炸弹**）」⇒ 复用形态等于**接手这颗炸弹**，必须同时给出清理策略（n3/n7 的题）。

### R2 复用 `execute` 的「worktree context 已设」**交接契约**

- **形态**：`execute` 的前置写死为「plan 已存在 + worktree context 已设（或 lightweight 模式）」（`prompts/build.md:412`）。
  ⇒ 本仓**已经有一个「树 + 上下文」的交接格式**，且它把「小改动走 lightweight（不建树）」写进了契约。
- **复用方式**：wave 的派发 brief 直接沿用同一对字段语义：`worktree: <abs path>` + `branch: <name>`（或 `lightweight: true`）；
  n4（判据面）可把「brief 里 worktree 字段与 worker 实际 cwd 一致」当**一条可机判判据**（比「新增一个 wave 专用字段」便宜）。
- **代价**：① 这是**散文契约**，无机器闸门（`prompts/build.md:404` 自述「可用性的最终裁决在 skill 工具」）；
  ② 字段名若与既有 `execute` 契约不一致，会造成两套写法 —— 必须**逐字复用**，不得改名。

### R3 复用 P1 计划作为**每 wave 的任务切片来源**（含 `plan_ref` 通道）

- **形态**：`.rddf/plans/<name>.md` 既是 builder P1 的 TDD 计划（`docs/adr/ADR-plan-delegate-engineering-session.md:57`），
  又是 `plan_ref` 的 accepted root（`lib/delegate-core.ts:1321-1322`）。⇒ **「P1 计划 → plan_ref → 派发实施」这条链本仓已经存在**。
- **复用方式**：wave 切分**读同一份 plan**（task 编号即 wave 的最小单元），不新造「wave 计划」格式；
  若 worker 走 delegate 后端，`plan_ref` 直接指向该文件即可通过现有校验（存在性 + 根内，`:1358-1384`）。
- **代价**：① 本仓**未装 skill 时** `.rddf/plans/**` 由 builder 走内置流程写（`prompts/build.md:423` 第 3 条）；
  ② `plan_ref` 校验**只判存在性、不判相关性**（`docs/adr/ADR-plan-delegate-engineering-session.md:59`）⇒ 切片的正确性仍需人工/判据面兜。

### R4 复用「归档前提交闸门」而不重造

- **形态**：P2 无 commit gate，提交语义由 `archive.sh::check_worktree_commits` **在归档前**强制（`prompts/build.md:428`）。
- **复用方式**：新通道**不设计**「每 wave 提交门」，把最终提交/归档校验留给产品侧既有闸门（跨树合并后再过它）。
- **代价**：该闸门**只对 rdd-workflow 管理的 change 成立**（`archive.sh` 属产品侧，本仓不可改）；非 change 的大改造没有等价闸门
  ⇒ 那条路径必须由 n4 另立判据。

---

## 3. 冲突点（≥2 条，含依据）

### C1 路径所有权冲突：`.rddf/wt/**` 与 `.rddf/plans/**` 已声明归 `rdd-builder`

- **依据**：`.rddf/reviews/role-matrix-rdd-workflow-alignment-audit.md:84`（skill owns 7 项，含 `.rddf/wt/<name>/`、`.rddf/plans/<name>.md`）；
  `docs/adr/ADR-plan-multi-session-collaboration.md:39`（`.rddf/plans/` 「已被两方占用……`rdd-builder` owns `.rddf/plans/<name>.md`」）；
  本仓工件归属规则原文「**同一工件在同一路径上只允许一个写入者**」（`prompts/build.md:417`）。
- **冲突**：若 build-worker 的父会话也建 `.rddf/wt/<wave>/`，同一路径就有 skill 与 agent 两个写入者 ⇒ 直接违反第 417 条。
- **性质**：这是**规则冲突**，不是能力冲突 —— 不能靠「反正没装 skill」自我豁免（装/未装是可变的，`docs/MULTI-AGENT-DESIGN.md:326`）。

### C2 状态机双轨：P2 由 handoff 链驱动，新通道由父会话驱动

- **依据**：P2 的前置是 `.rddf/state/.planner-handoff.json`（`prompts/build.md:412`），P1.5 产出 `.rddf/state/.plan-handoff.json`
  （二手：`audit:84`）⇒ 一条**文件互锁的阶段链**；而新通道的 fork/join 由父按 per-wave brief + 验收推进。
- **冲突**：两套推进器并存时，「谁决定下一步」有两个答案；且 P0/P2.5 是 HARD pause（`prompts/build.md:427`）——
  N 个 wave 若各自触发 pause，就把并行重新变成 N 次人工确认（**并行度被人工闸门串行化**）。
- **不是理论风险**：本仓已有一例同形冲突的教训来源 —— `rdd-builder` P0/P2.5 的非交互 pause 曾被单独立项勘察
  （`tests/config-guards.test.ts:1445` 的未覆盖清单条目），结论是「默认模式不真 pause，但低置信度分支未实测」
  ⇒ 新通道**不得**依赖 P2 的 pause 行为作为安全网。

### C3 「复用 P2」给不了并行：P2 是单 change 单树，没有调度面

- **依据**：P2 落点路径按 **change 名**生成（`.rddf/wt/<name>/`，二手 `audit:84`）；`execute` 是「按 plan 逐 task 执行」的下游
  （`prompts/build.md:412`）⇒ 语义上是**串行实施**。本仓对 rdd-workflow 的全部分工描述里**没有任何**「多树同时开」的机制。
- **冲突**：把「并行」寄托在复用它上，等于要求一个**上游不可改**的 skill 改变语义（BRIEF 明令「不改 `rdd-builder`」）。

### C4 提交主体口径在本仓**自相矛盾**（需上游/父裁决，本文只登记）

- **依据**：`prompts/build.md:355` 断言「**本仓后端被禁止 commit**」；同一文件 `:455`（planner 行注）却写「被派发的**后端 session 可以 commit**，
  那不违反本行」；`:428` 又说 commit 由全局工具层验证门决定。三处口径不一致。
- **冲突**：新通道若要求「每 wave 在自己的分支上提交」，则**提交者是谁**（主会话 / worker / 归档闸门）必须一次定死；
  若按 `:355` 的字面（后端不可 commit），则 worker 只能写不提交 ⇒ 树内提交只能由父做，父就成了所有 wave 的串行瓶颈。
- **性质**：这是**文档内在漂移**（可核，`grep` 两处即得），不是本文推断；但它会把「并行提交」的设计前提抽掉。

### C5 同名角色租约：树内 builder 与主会话 builder 互斥

- **依据**：租约键 = `(workRoot, 角色)`，独占集含 `builder`（`lib/role-lease.ts:284`；`docs/adr/ADR-role-aware-permissions.md:84-98`）；
  主会话 ↔ 后端同角色 ⇒ 拒（同篇 `:93`）。
- **冲突**：它**不是 P2 与新通道之间的矛盾**，而是两者共用的约束：P2 在树内跑 builder，新通道的 worker 也在树内跑 builder
  ⇒ 若同一棵树里两者先后/同时出现，**第二个必被租约或单槽拒**。⇒ 「复用同一棵树」在时间上是**互斥**的，不能叠加。

---

## 4. 整合建议（单一推荐 + 理由 + 被否决项）

### 推荐：**并存（分层）** —— 派发层不依赖 P2；实施层可选复用 P2/`execute`；隔离形态与交接契约做机制级复用

- **判断依据（结构性）**：本仓**已有同构先例**并写成边界：「front/delegate **不依赖** rdd-workflow：它只是"把任务交给一个
  build agent 的工程 session"；工程 session 内部**可以**用 rdd-* skill……那是工程 session 的事」（`docs/front-delegate-architecture.md:301-304`）。
  新通道与 P2 的关系**照抄这条边界**即可，不需要新的架构发明。
- **理由 1（可复用性）**：两者共享唯一真正重要的不变量 —— **每树一可写会话**（`docs/adr/ADR-front-multi-backend.md:155-157`、
  `lib/role-lease.ts:284`）。这层可以复用（§2 R1/R2），复用它不需要改 P2。
- **理由 2（不可替代性）**：P2 是**上游产品工件**，本仓不可改（BRIEF 边界；`docs/adr/ADR-plan-multi-session-collaboration.md:119`
  亦把「rdd-workflow 产品侧 owns 面」列为不改范围）⇒ 「替代」在本仓**不可执行**，只能登记为上游建议。
- **理由 3（不可整体复用）**：C2/C3 —— P2 无调度面、且带 HARD pause；整体复用会把并行做成 N 次人工确认。

### 被否决项

| 选项 | 结论 | 理由 |
|---|---|---|
| **整体复用**（build-worker = 反复调用 `rdd-builder` P2） | ❌ 否决 | C3（无并行语义）+ C2（HARD pause 串行化）+ P2-2 前置在本仓不成立（`.planner-handoff.json` 缺失） |
| **替代**（新通道接管 P2 的 worktree 准备，P2 只留 lightweight） | ❌ 否决 | 上游工件本仓不可改；且 P0/P1/P3 与 `archive.sh` 仍被用（`prompts/build.md:428`、`:314`）⇒ 只砍 P2 会留下半条状态链 |
| **纯并存（各建各的树、各用各的根，互不引用）** | ❌ 否决（作为**唯一**形态） | 会造两套隔离约定与两套交接字段 ⇒ 与「同一工件单写者」（`prompts/build.md:417`）和「单一真源」范式冲突；本仓已有「第二套协议 = 双份不变式与漂移源」的先例（`docs/adr/ADR-plan-delegate-engineering-session.md:128` 对自建派发工具的否决） |
| **让派发层依赖 rdd-workflow**（新通道读 handoff 链决定 wave） | ❌ 否决 | 违反 `docs/front-delegate-architecture.md:303` 的既有边界；且未装场景会让通道整体失效（`docs/MULTI-AGENT-DESIGN.md:326`「没装不是降级」） |

> 说明：上表「纯并存」被否决**不等于**「并存」被否决 —— 推荐形态是**分层并存**（层间有单写者与字段复用），不是两套并行世界。

---

## 5. 复用边界与职责归属（若走推荐路线）

### 5.1 复用 / 新做 分界

| 面 | 复用（不新造） | 必须新做 | owner |
|---|---|---|---|
| 隔离基质 | 「一单元一树一分支一写者」的形态（R1） | 树的**创建 / 清理 / 泄漏检测**（本仓现无，`docs/adr/ADR-front-multi-backend.md:175`） | **`build` 主会话**（它 `shell: "*": "allow"`，`opencode.jsonc:58-59` ⇒ `git worktree add` 权限可达；`front` 侧同样由人/用户准备，见 `prompts/front.md:78`） |
| 交接契约 | `execute` 的「worktree context 已设 / lightweight」字段语义（R2） | wave 的**派发 brief 增补字段**（worktree/branch/wave-id）与 n4 的对应判据 | **父（`build` 主会话）** 写 brief；**worker** 只读并据此 cwd |
| 任务切片 | `.rddf/plans/<name>.md`（P1）+ `plan_ref` accepted root（R3） | wave ↔ task 映射（读 plan 的哪几个 task） | **`build` 主会话**（切片决策）；`.rddf/plans/**` 的**写**仍归 P1 的写入者（见 §6） |
| 提交/归档 | `archive.sh::check_worktree_commits`（R4） | 非 change 路径的等价闸门 | 产品侧闸门（本仓不可改）+ n4 另立 |
| 状态机 / 暂停 | —— | wave 的 fork/join 状态（父自己记账） | **父**；**不得**复用 P2 的 handoff 链 |
| 权限窄化 | `delegate` 的 per-session `scope` + `classPermissions`（`lib/delegate-core.ts:1266-1288`） | 若走 `subagent` 通道：无 per-session 权限 ⇒ 只能靠 `plan-worker` 式前缀白名单 | n2 的题；本节点只登记「P2 不提供权限层」 |

### 5.2 一句话归属

- **P2 的 owner = `rdd-builder`（上游 skill）**，范围 = 单 change 的树准备 + builder 状态文件。
- **新通道的 owner = `build` 主会话（父）**，范围 = wave 调度、brief、树生命周期、join。
- **worker 的 owner = 该次派发的 `role_class`**（`prompts/build.md:675-693`），范围 = brief 的 `scope` 减去 arch 目录（`:683`），
  权限**创建时定型、`resume` 不重设**（`:690`）⇒ **不能**指望「先建宽再收窄」。

---

## 6. 对本仓工件归属的影响（逐路径，不写「按惯例」）

> 判据口径：本仓「工件归属规则」= 同一工件在同一路径上只允许一个写入者；skill 在路径上 ⇒ skill 写；skill 是下游 ⇒ agent 写**输入工件**；
> skill 不可用/不在路径上 ⇒ agent 走内置流程写并注明（`prompts/build.md:417-423`）。**owner 是条件式的**，下表的「owner」一律指
> **本仓当前路径下的实际写入者**，并注明条件。

| 路径 | 现状写入者（条件式） | 依据 | 新通道（build-worker）的结论 |
|---|---|---|---|
| `.rddf/plans/**` | ① skill 在路径上（装了 `rdd-builder` 且前置成立）⇒ **`rdd-builder` P1**；② 否则 ⇒ **builder agent 内置流程**（`.rddf/plans/<name>.md` TDD 5 步） | `prompts/build.md:412,422`；`docs/adr/ADR-plan-delegate-engineering-session.md:57`；`docs/adr/ADR-plan-multi-session-collaboration.md:39`；`.rddf/reviews/role-matrix-rdd-workflow-alignment-audit.md:84` | **不写**。新通道**只读**该根取切片/`plan_ref`（`lib/delegate-core.ts:1321-1322`）。若需 wave 清单，写进**派发 brief**（不新增持久化工件），**不得**在 `.rddf/plans/**` 新增第三类文件（该根已两方占用，`ADR-plan-multi-session:39`） |
| `.rddf/wt/**` | **`rdd-builder` P2**（`phase2_execute.sh:126`，二手 `audit:84`）；本仓当前**不存在**该目录（磁盘事实） | `audit:84`；`prompts/build.md:427-428` | **不写**（保留给 skill）。若确需复用同形态，**换根**（如 `.rddf/worktrees/**`）并把 owner 写死为 `build` 主会话；**同一路径不得双 owner**（`prompts/build.md:417`） |
| `.rddf/plan-topics/**` | **plan 父会话**（`TOPIC.md`/`graph.json`/`BRIEF.md`）+ **各 node 子会话**（`TODO.md`/`RESULT.md`） | `docs/adr/ADR-plan-multi-session-collaboration.md:42-48`；`opencode.jsonc:1491-1494`（plan-worker `edit` 前缀）；`opencode.jsonc:218`（plan 可写） | **不写**。且该根**不在** `PLAN_REF_ROOTS`（`lib/delegate-core.ts:1321-1326`；`ADR-plan-multi-session:51`）⇒ **不能当 `plan_ref`**；新通道若要消费讨论稿，须先由 `.rddf/plans/**` 的合法写入者物化（§6 第 1 行） |
| `openspec/changes/<name>/proposal.md` | 增强层路径 ⇒ **`rdd-builder` P0**；内置流程 ⇒ **planner** 起草（增强层下不手写） | `prompts/build.md:435` | **不写**（worker 是实施者，不是计划者；发现 plan/design 漂移走 `rddf feedback`，`prompts/build.md:370`） |
| `openspec/changes/<name>/tasks.md` | 增强层 ⇒ **`rdd-builder`**；内置 ⇒ **builder** 起草 | `prompts/build.md:436` | **不写**。可**读**作 wave 切分来源；勾选（`[x]`）是否允许 worker 改 ⇒ **需父裁决**（tasks.md 勾选是 P2/`execute` 的进度面，跨 wave 并行勾选会产生同一文件多写者） |
| `openspec/changes/<name>/design.md` | **无 skill owns** ⇒ 执行该 change 的 agent 定稿（`plan` agent 的产出视为草稿） | `prompts/build.md:437` | **不写**（同上：结构决策归实施前阶段）；worker 只可读 |
| `.rddf/state/builder/<name>.json`、`.rddf/state/.plan-handoff.json` | **`rdd-builder`**（P0 / P1.5 脚本） | `audit:84`；`prompts/build.md:412` | **不写**。新通道**不得**伪造 P2 状态文件来「让 execute 认为前置已满足」—— 那是绕过 handoff 链（`docs/MULTI-AGENT-DESIGN.md:328`「不得为走流程而伪造前置条件」） |

**归属总结（一句话）**：新通道在**全部既有工件路径上都是只读方**；它唯一需要新增的可写面是**自己的 wave 记账**（位置由父定，
本节点不建议落在上述任一根下 —— 推荐 `.rddf/state/` 之外或父自有命名空间，且需一次显式归属声明）。

---

## 7. 验证判据（ADR 骨架的「验证」段；明确区分可机判 / 不可机判）

| # | 判据 | 可机判？ | 依据/做法 |
|---|---|---|---|
| V1 | `.rddf/wt/**` 下不出现非 `rdd-builder` 产物（无双 owner） | ✅ 可机判 | 目录存在性 + 产物形态断言；本仓当前**无** `.rddf/wt/`（磁盘事实）⇒ 一旦出现即需出示 P2 调用留痕 |
| V2 | 新旧两套树的根**互不嵌套** | ✅ 可机判 | 路径前缀断言（如 `.rddf/wt` 与 `.rddf/worktrees` 无包含关系） |
| V3 | 同 worktree 两个 builder 写会话**不可并存** | ✅ 可机判 | `(workRoot, builder)` 租约（`lib/role-lease.ts:284`）+ 单槽（`docs/adr/ADR-front-multi-backend.md:155`）——已有实现，不需新造 |
| V4 | worker 的 brief 带 worktree 字段且 cwd 一致 | ✅ 可机判（弱） | 读 brief + 读 session cwd；⚠ **不改判「worker 真的在写树内」**（shell 不受 scope 约束，`prompts/build.md:693`） |
| V5 | 「P2 前置成立时才走 skill」 | ✅ 可机判 | 两文件存在性（`prompts/build.md:412`）；本仓当前**不成立** ⇒ 必走内置流程 |
| V6 | P2 的分支命名 / 配额 / 清理策略符合上游 | ❌ **不可机判** | 上游工件本仓不可读；本仓零锚点 ⇒ **不得伪装成有闸门**，只能登记为「依赖上游版本」 |
| V7 | 「每 wave 的提交者是谁」 | ❌ 当前不可机判 | C4 的三处口径不一致未裁决 ⇒ 无单一判据；裁决后才能补 |

---

## 8. 待父裁决 / 不确定项

1. **【需裁决】提交主体（C4）**：`prompts/build.md:355`（后端禁止 commit）与 `:455`（后端可 commit）矛盾；新通道「每树提交」的归属
   取决于此。建议父把它作为**跨节点项**提交给 n3/n7（合并与回滚都依赖「提交发生在哪」）。
2. **【需裁决】`.rddf/wt/**` 的归属**：本节点结论是「保留给 skill、新通道换根」；若父更倾向**改 owner**（把 `.rddf/wt/**` 交给 build 主会话），
   则须同批改 `rdd-builder` 的 owns 声明 —— 而 `rdd-builder` 在本仓**不可改**（上游）⇒ 我不建议。
3. **【需裁决】`tasks.md` 的勾选权**：跨 wave 并行时 `tasks.md` 是天然的多写者文件；若不裁决，就会与「同一工件单写者」（`prompts/build.md:417`）冲突。
4. **【事实，待上游核实】P2 的配额与清理策略**：本仓零锚点（§1.3）。若父需要「P2 的并行配额」作为设计输入，必须先由用户侧读
   `~/.agents/skills/rdd-workflow/skills/rdd-builder/`（本会话**读不到**，`external_directory` 被拒）。
5. **【建议】给 n3**：合并语义必须回答「跨树合并在哪棵树做」——本节点显示树的生命周期本仓**不代管**（`ADR-front-multi-backend:175`），
   合并若无 owner，树的清理与合并会同时悬空。
6. **【建议】给 n4**：可直接把 §7 的 V1–V5 收进判据集；V6/V7 明确标「不可机判 / 未裁决」，不要写成闸门。

---

## 9. 事实清单（本仓可核，供下游复用）

| # | 断言 | 类别 | 依据 |
|---|---|---|---|
| F1 | P2 落点 = `.rddf/wt/<name>/`（产品侧 `phase2_execute.sh:126`） | 二手（本仓记录） | `.rddf/reviews/role-matrix-rdd-workflow-alignment-audit.md:84` |
| F2 | `rdd-builder` owns 7 项，含 `.rddf/plans/<name>.md` / `.rddf/state/builder/<name>.json` / `.rddf/state/.plan-handoff.json` | 二手（本仓记录） | 同上 `:84` |
| F3 | `execute` 前置 = plan 存在 + worktree context 已设（或 lightweight） | 事实 | `prompts/build.md:412` |
| F4 | P2 无 commit gate（v5 起删）；commit 由 `archive.sh::check_worktree_commits` 归档前强制 | 事实 | `prompts/build.md:428` |
| F5 | P0 / P2.5 是 HARD pause；**P2 不在名单内** | 事实 | `prompts/build.md:427` |
| F6 | 派发方**不依赖** rdd-workflow；工程 session 内部可用 rdd-* skill | 事实 | `docs/front-delegate-architecture.md:301-304` |
| F7 | `.rddf/plans/**` = builder P1 的 TDD 计划所在，且是 `plan_ref` accepted root | 事实 | `docs/adr/ADR-plan-delegate-engineering-session.md:57`；`lib/delegate-core.ts:1321-1322` |
| F8 | `.rddf/plan-topics/**` **不在** `PLAN_REF_ROOTS` | 事实 | `lib/delegate-core.ts:1321-1326`；`docs/adr/ADR-plan-multi-session-collaboration.md:51` |
| F9 | `.rddf/plans/` 已被两方占用（plan 单篇 + rdd-builder owns） | 事实 | `docs/adr/ADR-plan-multi-session-collaboration.md:39` |
| F10 | worktree 自动创建**后置**；生命周期与清理全归插件，「不配即定时炸弹」 | 事实 | `docs/adr/ADR-front-multi-backend.md:175,321` |
| F11 | 两 linked worktree 独立 index，写同一路径互不覆盖（原文「实测」） | 事实 | `docs/adr/ADR-front-multi-backend.md:157` |
| F12 | 槽位键 = `workRoot`；同树一次一个后端；全局上限默认 3 | 事实 | `docs/adr/ADR-front-multi-backend.md:155-157`；`lib/delegate-async.ts:96` |
| F13 | 租约独占 `(workRoot, builder)`；主会话↔后端同角色 ⇒ 拒 | 事实 | `lib/role-lease.ts:284`；`docs/adr/ADR-role-aware-permissions.md:84-98` |
| F14 | `build` 的 shell 首键 `*: allow` ⇒ `git worktree add` 权限可达 | 事实 | `opencode.jsonc:58-59` |
| F15 | 被派发 `builder` 类写集 = brief `scope` 减去 arch 目录；权限创建时定型、`resume` 不重设 | 事实 | `prompts/build.md:683,690` |
| F16 | `shell` 不受 class 约束（`> file` / `tee` 不被挡） | 事实 | `prompts/build.md:693` |
| F17 | 同文件两处对「后端能否 commit」口径不一致 | 事实（文档漂移） | `prompts/build.md:355` vs `:455` |
| F18 | `docs/MULTI-AGENT-DESIGN.md:330` 仍写「P2 的 COMMIT GATE」，与 `prompts/build.md:428`（P2 无 gate）不一致 | 事实（文档漂移） | `docs/MULTI-AGENT-DESIGN.md:330` |
| F19 | 本仓 `.rddf/wt/`、`.rddf/state/builder/`、`.rddf/state/.planner-handoff.json` 均不存在 ⇒ rdd-builder 前置不成立 | 事实（磁盘） | `glob` 零命中；对照 `prompts/build.md:412` |
| F20 | 本仓 `.rddf/plans/` 有 3 个产物；`docs/guard-authoring.md:222` 仍写「当前不存在」 | 事实（磁盘 + 文档漂移） | 磁盘；`docs/guard-authoring.md:222` |
| F21 | rdd-builder skill 本体本仓不可读（`external_directory` 拒）⇒ P2 分支命名/配额/清理策略未核实 | 事实（能力边界） | 本次读盘结果；`tests/rdd-skills.test.ts:88-89`；`scripts/rdd-skills.sh:56` |

---

## STATUS: COMPLETE
