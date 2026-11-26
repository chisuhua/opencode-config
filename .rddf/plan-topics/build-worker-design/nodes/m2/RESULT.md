# RESULT — m2：合成稿（`build-worker-design`，A 档复测）

> 输入：`nodes/n1..n7/RESULT.md` 七份（合计 244,703 bytes / 2,241 行）。本稿由这七份**独立归纳**，未复制
> `SYNTHESIS.md` 的措辞，也未改写 `nodes/m1/RESULT.md`（m1 保留为审计痕迹，本稿是它的**追加式重作**）。
> 陈述分类：**【事实】**（本仓可引 `path:line`）/ **【推断】**/ **【建议】**/ **【判定】**（综合判断，可判真假）。
> 回指口径：`nX §Y` = `nodes/nX/RESULT.md` 的第 Y 节；行号一律为**当前盘面**（本稿直读核实过，见 §4 各行）。
> ⚠ 本稿是**离线讨论产物**：`.rddf/plan-topics/**` 不在 `PLAN_REF_ROOTS`（`lib/delegate-core.ts:1321-1326`）⇒ 不可直接派工程实施。

---

## 1. 结论

**K1【判定】** 「`build` 拿不到 `delegate` 通道」「`build` 没有任何受治理的并行实施形态」「同一工作树内并行写被拒」
这三件事必须**分开记账**：第一条有验收条目支撑（刻意）、第二条在本仓找不到任何决策文本（能力缺口）、第三条由单槽与角色租约两条不变式支撑（刻意排除）——混记会把「不该给 `build` 开 delegate」读成「`build` 不需要并行能力」，而后者正是本 topic 的立项理由。
—— 来自 **n1 §3.1 / §3.2 / §3.3**（`nodes/n1/RESULT.md:81-97`、`:110-123`、`:127`）。

**K2【判定】** 写隔离单元取「**一棵 linked worktree + 每树恰一个可写会话**」，且这条承重不变式是 delegate 既有槽位语义
（槽位键 = `workRoot`）的**字面沿用**而非新机制；同树分支隔离、同树目录隔离、独立 clone 三案否决，
「不并行 + 上下文外置」保留为回退基线。
—— 来自 **n2 §7 / §8.1 / §8.2**（`nodes/n2/RESULT.md:262-272`、`:278-289`）。

**K3【判定】** 通道形态取「**替代**」而非「并存 / 分槽」：`build` 成为 `delegate` 的**第三个派发主体**，不新建通道、不细分槽位；
机制依据是所谓「全局单槽」实为**四件共用 `workRoot` 键的机制**（槽位表 / 角色租约 / 停机守卫 / 差集基准），三种处置里只有替代不新增写者入口。
—— 来自 **n5 §3 / §5.4 / §6.1**（`nodes/n5/RESULT.md:78-90`、`:204-208`、`:216-222`）。

**K4【判定】** 合并语义固定为：只有父合、每 wave 合一次到独立集成分支、冲突解决权归**后写者**、merge commit 与 attempt 级指针入 git、
合入目标后只能用 `git revert -m 1`；六类冲突里**只有生成物冲突（C6）全可机判**，其余四类的「解决或归因」都要人判。
—— 来自 **n3 §0 / §3 / §8**（`nodes/n3/RESULT.md:11-22`、`:115-177`、`:282-287`）。

**K5【判定】** 判据面与失败面是同一枚硬币的两面：36 条判据能判的全是「**已经发生过**」的字节事实（提交存在、祖先关系、前缀差集、退出码），
而 10 条失败模式里最重的「双活体写者」与「树外写入」在本设计里**没有任何机械信号** ⇒ 本稿**不声称**这两件事能被检出。
—— 来自 **n4 §2 汇总段**（`nodes/n4/RESULT.md:128`）+ **n7 §2.11**（`nodes/n7/RESULT.md:149-161`）。

---

## 2. 各节点结论的合并

| 节点 | 结论（压成一行） | 父的取舍（采纳 / 修正 / 否决 + 一句理由） |
|---|---|---|
| **n1** 现有派发通道盘点 | 六条通道 + 20 条事实；`build` 无受治理的并行实施通道，唯一源码写旁路是 `subagent→general` 的 `shell:"*":allow`（无登记/无台账/无槽位/无差集） | **采纳**。三分记账作为全稿诊断基线：它把「无 delegate 是刻意」与「无并行形态是缺口」切开，后者才是本 topic 的前提。T6 旁路同时成为「不得用 `general` 代写」的实证依据（n1 §1 T6、n5 §6.2） |
| **n2** 写隔离方案选型 | 候选 A（linked worktree + 每树一写者）采纳；B/C/E 否决；D 留回退 | **采纳，修正一处口径**：n2 §8.1 说 A「无代码改动」，这**只在走 delegate 通道时成立**；走 `subagent` 时「每树一写者」只是协议层（n2 §6.2/§6.3）。且「零代码改动」与 n5 §5.2 的「8 处改动面」不矛盾——A 省的是**隔离机制**的代码，不是**接入**的代码 |
| **n3** 合并与冲突语义 | 父串行合、每 wave 一次、冲突解决权归后写者、幂等靠禁用 `--no-ff`/`--squash` + 祖先判定、台账与 merge commit 入 git、回滚走 `revert -m 1`；6 类冲突里仅 C6 全可机判 | **采纳，补一条 n3 未写死的边界**：合并把跨树收敛变成**串行的单写者步骤** ⇒ 合并吞吐是并行度的实际上限，再叠加 delegate 全局配额 3 ⇒ wave 宽度 > 3 时并行收益被打两次折（n3 §0 末段、n5 §4-C8、n7 §2.10 FM10） |
| **n4** 判据面设计 | 36 条判据 / 7 组；可机判 27 / 条件可机判 3 / 需人判 4 / 两段标注 2；`info` 仅 3 条；退出码沿用四值、**否决扩 `4=未收敛`**；收敛信号沿用 D11 口径，事实投影命名 `landed` | **采纳，修正两处**：① 3 条 `info` 的取舍必须写进本稿 §5，否则下游会把 `merge_unverified` / `worktree_leaked` 当闸门；② n4 §2 的 36 条**未覆盖** n6 §7 的 V1/V2（目录无双 owner、两套树根不嵌套）与 n5 §10.2-4 要求的台账可查 `owner_agent`/`plan_ref` ⇒ 登记为遗留缺口 G-2 / G-1（见 §3 末），**不在本稿补齐** |
| **n5** 与 delegate 全局单槽的关系 | 关系取「替代」：`build` 作 delegate 第三派发主体；「单槽」实为四件共用 `workRoot` 键的机制；否决并存 / 分槽 / 走 `subagent` 无槽；开权限当天即生效的三坑（归属塌陷 / `plan_ref` 失效 / 后端递归） | **采纳，并提升为全稿形态结论（K3）**。它同时关闭 n2 的强制等级问题（走 delegate ⇒ 权限层）。**修正一处措辞**：n5 §10.1 第 1 条（「build 只编排」不可机判）必须进本稿 §5，否则读者会以为替代方案自带强制 |
| **n6** 与 rdd-builder P2 的关系 | 与派发层**分层并存**（层间不复用状态机）：只复用「隔离形态」与 `execute` 交接契约；P2 不得整体复用（无调度面 + P0/P2.5 是 HARD pause）；P2 在本仓从未跑过 | **采纳，修正措辞**：n6 §0/§4 叫「并存」，与 n5 §5.1 否决的「并存」（新通道自建槽位）**同名不同义** ⇒ 本稿统一改称「**分层并存（层间不复用状态机）**」，并把 n5 的「并存」限定为「第二套派发通道 + 第二张槽位表」 |
| **n7** 失败模式与回滚可达性 | 10 条失败模式（可机判 5 / 仅提示 3 / **不可检出 2**），最重的是双活体写者；回滚三步（关闸 → 收树 → 倒序 `revert -m 1`）+ 6 处「逐字节钉死」要求；两条否决条件 | **采纳**，并**修正一处**：n7 §4.1 的回滚清单草案 JSON 里 `find` 串含 `<模型>`、`...整块逐字节...` 两个**占位**，且 `adr` 字段指向尚不存在的文件 ⇒ 该草案**不是可执行清单**，只能停在 `declared`（n7 §4.4）。其 B1–B7 与 n4 的 R1–R9 合并进本稿 §4 |

**跨节点一致性核对（本次合成时新做，不在任何单节点内）**

- **【事实】** n2 §1 的行号取自 `opencode.jsonc.opencode-go` 副本，n5 明确以活配置 `opencode.jsonc` 为准（n5 头部口径、n1 §5-F1/F2）⇒ 两处**事实相同、行号不同**，本稿引用时一律标出取自哪一份。
- **【事实】** n2 §10 预警「若 n5 把单槽改成仓库级，方案 A 立刻失效」；n5 §5.2 最终选「替代 + D4 不动」⇒ 该风险**未发生**（n5 §8 D4 行）。
- **【事实】** 「worker 能不能 commit」这一个漂移被 **n3 §9-4 / n4 R8 / n6 C4 / n7 §7-5** 四处独立记录 ⇒ 收敛成**同一条裁决**（§3 #11）+**同一条反哺条目**（§4 #18），不重复计。
- **【推断】** n4 的 36 条判据覆盖了 n6 §7 的 V3/V5，但**未覆盖** V1/V2 与 n5 的台账可查性 ⇒ 两条遗留缺口（G-1 / G-2），见 §3 末。

---

## 3. 父的裁决汇总

> 收集 n1–n7 全部「待父裁决 / 不确定项」共 **31 项**，逐条裁决（同类项在编号后注明「同项」并共用依据）。
> 「需人确认」= 属运维/产品口径，父会话不能单方面定，须由用户拍板，本稿不给终局。
> 末两条 #32/#33 是**本合成时新发现并新裁决**的（上游节点未把它们列入「待父裁决」）。

| # | 事项 | 裁决 |
|---|---|---|
| 1 | n1：用「能力缺口」还是「未设计（no decision on record）」 | 采「能力缺口」，首次出现时括注「无决策文本」；布尔结论不变。依据 n1 §3.2 G1–G3、§6-1 |
| 2 | n1：rdd-builder P2 细节属上游、未核实 | 维持「上游语义（未在本仓核实）」标注，不补引。n6 §1.3 独立复核同一结论（skill 本体读取被 `external_directory` 拒）。依据 n1 §6-2、n6 §1.3 F21 |
| 3 | n1：`general` 的 `shell:"*":allow` 与 ADR「subagent 只读」口径不一致 | 登记为既有缺陷，**不列入本 topic 决策**；但采纳它作为「不得用 `general` 代写」的实证依据。依据 n1 §6-3、n1 §1 T6、`scripts/agent-guard-rules.ts:84` |
| 4 | n1：给 n2/n6 的两条输入（先答租约、先答写域粒度） | 已被消费，不需新动作：租约 → n5 C7 + n6 C5；写域粒度 → n2 §6。依据 n1 §6-4、n2 §6、n6 §3-C5 |
| 5 | n1：worker 不能跑 `bun` ⇒ 判据只能由父跑 | 采纳，落在 n4 B2「wave 级全量验证由父执行」。依据 n1 §6-5、n4 §2-B2、`.rddf/commit-gate.json:6` |
| 6 | n2：通道前提（delegate=权限层 / subagent=协议层）要求原样带入 | 采纳为全稿口径。因 n5 选「替代」，**默认通道是 delegate** ⇒ 写隔离落在权限层。依据 n2 §6.2/§6.3、n2 §待父裁决 1、n5 §0 |
| 7 | n2：n1 未产出时的口径冲突处理 | 已核对：无冲突（两边都记「`build` 无 delegate、`subagent` 为字符串 allow」）。依据 n2 §待父裁决 2、n1 §5-F1/F2 |
| 8 | n2：候选 E 是否并入 A 的变体以压缩篇幅 | 不压缩。E 是「第二套状态面」的反例，正对应 n5 否决「并存」的论据。依据 n2 §5-E、§7；n5 §5.1 |
| 9 | n3：集成分支工作树由谁建、谁收、路径写在哪 | 父建父收；路径固定为 `.rddf/worktrees/<topic>-integration`，**不落 `.rddf/wt/**`**（该根归 rdd-builder，见 n6 §6 与 #21）。**需人确认**（新增目录前缀属运维约定）。依据 n3 §待父裁决 1、`prompts/build.md:417` |
| 10 | n3：C3 归因需 worker 声明「接口面」字段 | **不新增字段**（守住 n4「没有第四个性字段」）。C3 只保留「失败文件 ∩ scope 前缀」的尽力归因，多义交父裁决；G3 `abi_declared` 随之删除 ⇒ `info` 由 3 降为 2，接受该验收下限。依据 n3 §待父裁决 2、n4 §待父裁决 2、n4 §2-G3 |
| 11 | n3：`prompts/build.md:355` 陈旧口径（后端禁止 commit） | 必改，与机制**同批**；口径统一为「worker 可提交、由 commit 验证门决定」（对齐 `lib/delegate-core.ts:1645`）。**同项：n6 #20、n7 #30**。依据 n3 §9-4、`prompts/build.md:355` vs `:455`、n6 §3-C4 |
| 12 | n4：载体 `.rddf/build-waves/<topic>/` 是否与 plan-topics 分家纪律冲突 | 采纳分家（独立根 + 独立 CLI）。理由：两套载体两个 CLI，组边界须给调用点行号级证据（`.rddf/rollback/README.md:76`）；且该根同样**不进** `PLAN_REF_ROOTS`。依据 n4 §1.2、§待父裁决 1、`lib/delegate-core.ts:1321-1326` |
| 13 | n4：G3/C4 的接口面字段；不新增则 `info` 由 3 降为 2 | 裁决同 #10。依据 n4 §待父裁决 2、§2-G3 |
| 14 | n4：R8 口径修复归属（同 #11） | 裁决同 #11；责任人 = 父（`build` 主会话）在机制同批改，本 topic 不写。依据 n4 §待父裁决 3、§5.2-R8 |
| 15 | n4：`merge_unverified` 是否升为阻断 | 维持 `info`。当前无任何机制能产出合格合并证据 ⇒ 升阻断会**恒红**，闸门失去判别力。依据 n4 §待父裁决 4、§2-C6；n7 §2.8 FM8 |
| 16 | n5：推荐「替代」是否与合稿一致（二选一、不得并列） | 采纳「替代」，不并列。它与 n2 候选 A 相容；`subagent` 形态在 #6 被否。依据 n5 §0、§10.2-1 |
| 17 | n5：是否接受 `owner_agent` 扩第三值（P4） | 接受。**否决**「塌成 front」降级：那会让 front 可 resume/cancel build 的后端，且 build 主会话消亡后其 worker 变「亡主」可被接管。**需人确认**（枚举扩值触及既有兼容读语义）。依据 n5 §4-C2、§10.2-2、`lib/delegate-core.ts:1413-1415` |
| 18 | n5：`plan_ref` 必填是否顺带收紧 front（P3） | 采纳为「**有意统一**」，但必须在 ADR 影响面点名 —— 它是行为变更，不是范围蔓延。**需人确认**。依据 n5 §7-P3、§10.2-3、`lib/delegate-core.ts:2337-2342` |
| 19 | n5：给 n3/n4 的输入（合并在 git 层；台账须能查 `owner_agent` 与 `plan_ref`） | 部分消费：n3 已按 git 层合并（§2.2）；n4 未加「owner / plan_ref 可查」判据 ⇒ 登记**遗留缺口 G-1**，本稿不补。依据 n5 §10.2-4、n4 §2-A0/A7 |
| 20 | n6：提交主体（C4） | 裁决同 #11：提交主体 = worker（在自己分支），由 commit-gate 决定放行；父只合并。依据 n6 §8-1、§3-C4 |
| 21 | n6：`.rddf/wt/**` 的归属 | 保留给 rdd-builder；新通道**换根**（见 #9）。依据 n6 §8-2、§6 路径表、`prompts/build.md:417` |
| 22 | n6：`tasks.md` 的勾选权 | worker **不得**勾选 `tasks.md`（跨 wave 天然多写者文件）；进度只写自己的台账与 brief。依据 n6 §8-3、§6 路径表 |
| 23 | n6：P2 的配额与清理策略（上游未核实） | 维持「上游语义」，**不作设计输入**；本设计的配额只取 delegate 的 3。依据 n6 §8-4、§1.3、`lib/delegate-async.ts:96` |
| 24 | n6：合并应在哪棵树做 | 已消费：n3 §2.2 的独立集成分支工作树。依据 n6 §8-5、n3 §2.2 |
| 25 | n6：V1–V5 是否收进判据集 | **部分采纳**：V1/V2（目录无双 owner、两套树根不嵌套）未入 n4 36 条 ⇒ 登记**遗留缺口 G-2**；V3/V5 已被 n4 A4/A5/A7 覆盖。依据 n6 §8-6、§7、n4 §2-A4/A5/A7 |
| 26 | n7：回滚清单的落地时机 | 停在 `declared`；**不得**在 ADR 之前写清单文件（否则 `adr` 字段指向不存在的文件，M1 恒红）。依据 n7 §4.4、`.rddf/rollback/README.md:45,93` |
| 27 | n7：`retire[]` 走 A（删清单转 retired）还是 B（留清单撤 `watch[]`） | 走 **A**：`retire:["build-waves"]` + `retired_at` / `retired_evidence`。理由：build-waves 是后加机制、有真实回退基线，留一份对不存在文件 `find` 的清单只会制造永久红。依据 n7 §4.3、`.rddf/rollback/README.md:97` |
| 28 | n7：`worktree_leaked` 是否升为阻断 | 维持 `info`。升阻断需 `active_wave` 字段 ⇒ 违反 n4「无第四个性字段」，故不做。依据 n7 §7-3、n4 §2-F2、§5.2-R1 |
| 29 | n7：是否为双活体写者引入写围栏（generation） | **采纳为后续机制项**（唯一能把 FM4/FM5 从「不可检出」变「可检出」的手段），但本稿只登记代价（attempt schema 加 `generation` + 产物带 `gen`），不设计实现。若不做，须在 ADR 的「已知不可检判清单」里明写这条。依据 n7 §7-4、§5-B2 |
| 30 | n7：`prompts/build.md:355` 的 commit 口径 | 裁决同 #11。依据 n7 §7-5、`prompts/build.md:355` |
| 31 | n7：`build-worker` 是否显式写 `"subagent": "deny"` | **采纳显式 deny**：少一处回滚断言，且堵掉「孙会话」路径。依据 n7 §7-6、`opencode.jsonc:1500`、n7 §4.1 edits |
| 32 | **（本合成新增）** n5 §4-C6 后端递归：给 `build` 的 agent 块加 `delegate: allow` 后，`classPermissions` 无 delegate 规则 + session 规则 last-match-wins ⇒ 每个 build **后端**也拿到 delegate 工具，可再派后端 | **列为与「开权限」同批的硬约束**：必须同批提交 (a) `classPermissions` 注入 `{action:"delegate",resource:"*",effect:"deny"}`、(b) `plan_ref` 必填判据扩到 `kind==="engineering"`、(c) `owner_agent` 增第三值。**不得**先开权限后补 —— 中间态当天即产生三个静默反向效果。依据 n5 §4-C6、§6.1、`lib/delegate-core.ts:1266-1288`、`:2460-2462` |
| 33 | **（本合成新增）** n3 §9-1：`git merge` 绕开 commit-gate（`lib/commit-gate.ts:158` 只认 `commit`；`merge`/`rebase`/`cherry-pick` 在该文件零命中） | **不列入本 topic 决策范围**（与 build-worker 是否采纳无关，是既有闸门的独立缺口），但**必须登记**并进 §4 反哺清单；合并侧只以 wave 级 `verify` 兜底，且该兜底是**协议层**、不得写成闸门。依据 n3 §9-1、n4 §2-C6、`lib/commit-gate.ts:158` |

**两类未给的裁决（诚实登记，不算漏项）**

- **G-1** 「台账须能查 `owner_agent` 与 `plan_ref`」未落成 n4 的判据码 ⇒ 若将来落地，须按 n4 §5.2-R7 的「四件套」（写入点 / 判据 / 负向 fixture / 正例）补，不能只加码。
- **G-2** n6 的 V1/V2（目录无双 owner、两套树根不嵌套）未入判据集 ⇒ 属**可机判但当前无判据**，落地成本低，但需先在 `waves.json` 声明树根（触及 #28 同一约束）。

---

## 4. 反哺清单（对既有 `plan` / `plan-worker` 机制）

> 每条四字段：**现象 | 依据 `path:line` | 建议动作**（+ 分类标签）。
> 依据一律为**当前盘面**的可核锚点；本稿直读核实过第 1/2/3/18/22 条以及第 4 条的 `graph.json` 行号漂移。
> 来源：n4 §5.2 的 R1–R9 + n7 §5 的 B1–B7 + 本次合成新登记（#2/#3/#4/#8/#22/#23），合并去重后 **23 条**。

| # | 分类 | 现象 | 依据 `path:line` | 建议动作 |
|---|---|---|---|---|
| 1 | 【声明与实现脱节】 | `owner` 字段被声明但从不消费：全仓只在字段定义与 schema 校验处出现（3 处命中），判据库与 CLI 零消费；而 ADR D2 承诺「`owner:"parent"` 的节点 = 父自己做」。**本 topic 有活体实例**：`graph.json` 把 n5 声明为 `owner:"parent"`，attempt 却记 `agent:"plan-worker"`，`check` 从不报警 | `lib/plan-topics.ts:61`、`:197-198`；`docs/adr/ADR-plan-multi-session-collaboration.md:62`；`.rddf/plan-topics/build-worker-design/graph.json:142`、`:147` | 二选一：(a) `dispatchableNodes` 输出 `executor:"parent"` 且 `claim` 拒非父会话对 parent 节点的 claim（新码 `owner_mismatch`）；(b) 从 schema 与 ADR 同时删 `owner`。**不要**保持现状：字段在场而无人读 = 读者必然误信 |
| 2 | 【声明与实现脱节】 | **★ `git merge` 绕开 commit-gate**：提交验证门只认 `git commit`（`sub === "commit"` 返回 true）与 force-push；`merge` / `rebase` / `cherry-pick` 在 `lib/commit-gate.ts` 全文**零命中** ⇒ merge 产生的提交**不经过**「验证命令全绿 + 暂存区非空 + 暂存落在角色写集内」三判据。而本设计的核心动作正是「父在集成分支上 merge」⇒ 合并质量门只有**协议层**（wave 级 verify） | `lib/commit-gate.ts:158`；`plugins/commit-gate.ts:97-101`、`:130`；`docs/adr/ADR-commit-verification-gate.md:33-39`；`nodes/n3/RESULT.md:302-306` | 把 `merge`/`rebase`/`cherry-pick` 纳入提交闸门的子命令闭口（**与 build-worker 是否采纳无关**，是既有闸门的独立缺口）。采纳前：合并动作必须在 brief 与台账里显式记 `verify.commands[] + exit + at`，且 `merge_unverified` 只能是 `info`，不得当闸门 |
| 3 | 【声明与实现脱节】 | **★ 后端递归的机械成因**：`classPermissions` 只产出 `CONSTANT_DENY` + edit 规则 + grants + subagent 白名单 + arch deny，**没有任何 delegate 规则**；而 session 规则排在 agent 规则之后、last-match-wins ⇒ 未列出的动作**沿用 agent 级值**。⇒ 给 `build` 的 agent 块加五项 `delegate: allow` 后，**每一个 build 后端会话也拿到 delegate 工具** ⇒ 后端可再派后端，直接击穿「一次派发一个角色类、写集创建时定型」与全局配额语义 | `lib/delegate-core.ts:1266-1288`、`:2460-2462`；`lib/delegate-async.ts:1360-1376`；`docs/adr/ADR-plan-delegate-engineering-session.md:15`；`nodes/n5/RESULT.md:137-142` | 开权限**必须与** `classPermissions` 注入 `{action:"delegate",resource:"*",effect:"deny"}` 同批提交（置于 `grants` 之后以吃 last-match-wins）；单测断言该条在返回数组中且位于 grants 之后。**不得**先开权限后补 |
| 4 | 【声明与实现脱节】 | **★ `ownerAgentOf` 字面二值**：`agent === "plan" ? "plan" : "front"` ⇒ 任何非 plan 的派发方（含 `build`）在台账里**冒充 front**：sessions 归属过滤、`priority_blocked.caller_kind`、跨 owner-kind 的 resume/cancel 硬拒三处同时把 build 当 front ⇒ front 可 resume/cancel build 的后端；build 主会话一旦消亡，其 worker 又成「亡主」可被任何人接管 | `lib/delegate-core.ts:1413-1415`、`:173`、`:2427-2446`；`lib/delegate-async.ts:1274-1294`、`:1434-1447` | 采纳 n5 P4 —— `owner_agent` 增第三值 `build`（`pair.json` / metadata / holder 结构体 / 文案四处同步），旧数据缺失仍按 front（兼容读不变）；**否决**「塌成 front」降级 |
| 5 | 【声明与实现脱节】 | topic 独占锁零机械强制：`.lock` 在 CLI 里**只被读**，全仓无任何命令 `mkdir` 它（唯一写入方是 prompt 里的人工指令）；`claim`/`close`/`cancel` 只取 graph 短锁，派发面完全不看 `.lock`。测试把这条钉成缺陷，措辞本身即证据 | `scripts/plan-topic-check.ts:286-320`、`:297`、`:336-372`；`prompts/plan.md:280`；`tests/plan-topics-dag.test.ts:374`、`:385` | 把「拿锁 + 校验归属」合并成**一个原子命令**（`claim` 内校验 `.lock` 的 owner == 调用方，不等即拒 `owner_mismatch`）；`lock` 子命令改名 `lock-status`。若本期不动 ⇒ **必须**把「独占」降级为协议并删掉机械暗示 |
| 6 | 【声明与实现脱节】 | `attempts[].baseline` 是死字段：类型里有、schema 文档示例里有，`claim` 只写 `agent`/`started_at`/`precheck`/`input` ⇒ **全仓无写入点**；且相对 ref 当基线会漂（用例已证漏检） | `lib/plan-topics.ts:50`；`scripts/plan-topic-check.ts:458-463`；`docs/architecture/plan-topics-topic-model.md:35`；`tests/plan-topics-dag.test.ts:406-416` | `claim` 追加 `baseline: git rev-parse HEAD`（存**全 40 位 SHA** 不存 ref），并让 `stale_inputs`/`scope-check` 消费它；否则删字段与文档示例 |
| 7 | 【声明与实现脱节】 | `scope-check` 文档三处承诺「并行只做 topic 级 union」，实现只接受**单个** node 且 `allowedPrefix` 恒为 `nodes/<nodeId>` ⇒ 并行时兄弟节点的产物被算成自己的越界；钉住用例名即证据 | `scripts/plan-topic-check.ts:233`、`:237-238`；`docs/architecture/plan-topics-topic-model.md:78`、`:130`；`docs/adr/ADR-plan-multi-session-collaboration.md:255`、`:317`；`tests/plan-topics-dag.test.ts:395-404` | 加 `--union <node...>` / `--topic` 模式（一次差集 + 前缀求交做**尽力**归因），或**删掉**文档里的 union 承诺。承诺未实现比没承诺更坏（会训练出 alert fatigue） |
| 8 | 【本次场景活体复现】 | 本 topic 自身就是并行跑（n1–n7 同轮扇出）：单节点口径的 `scope-check` 会把兄弟节点的 `RESULT.md` 算成本节点越界（本次实测为**十余条假阳性**）⇒ **不能**把「scope-check 通过」当作跨节点无污染的证据 | `scripts/plan-topic-check.ts:233`、`:237-238`；`tests/plan-topics-dag.test.ts:395-404`；`docs/adr/ADR-plan-multi-session-collaboration.md:317` | 在 checker 报告与 `prompts/plan.md` 显式写「并行下 `scope-check` 仅作单节点自检，不是隔离证据」；真正的跨节点证据只能是父事后做 topic 级 union 核对 |
| 9 | 【自述/命名】 | `precheck` 是自述式凭据：`claim` 写它，checker **从不读**，且 `claim` 自己注明「不因此拒绝」；ADR 记过它曾「恒为 1 ⇒ 凭据判别力归零」的事故 | `scripts/plan-topic-check.ts:455`、`:461`；`docs/adr/ADR-plan-multi-session-collaboration.md:61` | 并入 `summary` 当历史快照并标注「不参与判定」，或删字段。「保留 + 不消费 + 名字像闸门」是三件坏事同时发生 |
| 10 | 【自述/命名】 | 名字与强制等级脱节：`lock` 子命令**只读**、`scope-check` 是事后核对、`liveness_stale` 只是 mtime 提示（代码注释自述「只作显示提示，不授权接管」） | `scripts/plan-topic-check.ts:286-320`；`lib/plan-topics.ts:838`、`:852-865`；`docs/architecture/plan-topics-topic-model.md:130`；`docs/adr/ADR-plan-multi-session-collaboration.md:144` | 给 `Violation` 增可选 `enforcement`（四值闭集：权限强制 / CLI 强制 / 协议 / 仅事后可见）；`lock` 子命令改名 `lock-status`。成本极低，收益是读者不被名字骗 |
| 11 | 【流程纪律】 | `claim` → `spawn` 是两步且**无补偿**：`claim` 成功后 `subagent` 调用若失败，attempt 仍开着 ⇒ 节点永久不可派，只能人工 `reap --confirm`；ADR 的「spawn 失败同回合 `close`」是纯散文、无 CLI 支持 | `scripts/plan-topic-check.ts:418-477`、`:480-487`；`docs/adr/ADR-plan-multi-session-collaboration.md:142`、`:225`、`:298` | 新增 `abandon-spawn <topic> <node>`（闭合 attempt + `reason:"spawn_failed"`），并用**独立字段**消掉「`finished_at` 读作正常完工」的歧义。**不要**只改 prompt：纪律型字段会静默失效 |
| 12 | 【流程纪律】 | `reap` 不吊销旧 worker：实现只写 `finished_at` + `inputs_reviewed`，无终止、无写围栏 ⇒「已闭合」与「仍在写」可同时成立，且无判据能看见（活体探针恒真：`ctx.session.get` 对已死会话仍返回记录） | `scripts/plan-topic-check.ts:499-511`；`docs/adr/ADR-plan-multi-session-collaboration.md:145`、`:319`、`:332`；`plugins/role-gate.ts:159-161` | 给 attempt 加**写围栏**（`generation` 递增，产物必须带 `gen`，判据比对代际）；过渡期至少让 `reap` 输出 `warning:"旧 worker 未被吊销；若其复活将产生双写者"`。**不要**用 TTL 自动接管 —— 那会制造双写者 |
| 13 | 【插桩位空转】 | 事前闸门的插桩位已在手但只用来校验 prompt：L1 硬门挂在 `tool.hook("execute.before")`，能读到 agent/prompt/sessionID/background，交给 `gate()` 的却只有 prompt，判定函数**不读** `graph.json`、不读台账 ⇒「deps 未 done 不得派发」「未 claim 不得 spawn」技术上可判、实现里一条没判 | `plugins/subagent-contract.ts:9`、`:87-94`；`lib/subagent-contract-core.ts:535-559`；`docs/adr/ADR-plan-multi-session-collaboration.md:14`（前置事实⑩）、`:309` | 把 `gate()` 输入扩为 `{agent, prompt, parentSessionID, topicDir?}`，新增可选判定器 `evaluateDispatchState()`（plan 侧拒 owner=parent / 未 claim / deps 未 done；build 侧拒非全 SHA `base_sha` / 未建树 / `scope` 空），默认 `warn`，配置可 `enforce` |
| 14 | 【模板复用风险】 | `plan-worker` 的权限模板**不能复制**：`edit` 默认 deny 只放行 `*.rddf/plan-topics/*`、`git commit` 显式 deny、`shell` 首键 deny 且重定向全 deny、prompt 还禁跑 `bun`/`node`。照抄则「worker 在自己分支提交」这一前提不成立 ⇒ `item_committed` 恒红，且失败会被误判成 worker 违纪（系统性失败当个体失败） | `opencode.jsonc.opencode-go:1435-1436`、`:1493`；`prompts/plan-worker.md:36`；`lib/delegate-core.ts:1645`；`nodes/n3/RESULT.md:317-321` | 把「must-allow 动作集」（`git commit` / 验证命令 / `edit` ⊇ 自己那棵树）写成 build-worker 的**前提清单** + 一条 `bw doctor` 环境自检；`doctor` 失败不是违规，是「判据面不适用」 |
| 15 | 【流程纪律】 | 判据与写入点的**落地顺序**没有约束：ADR 已写「`input` 快照的自动写入依赖 `claim` 写入点 ⇒ 判据不得早于写入点落地」，但这条只靠人记；plan 侧曾因「凭据先落地、写入点后补」出现恒为 1 的假凭据 | `docs/adr/ADR-plan-multi-session-collaboration.md:156`、`:168`、`:189`；`docs/architecture/plan-topics-topic-model.md:102-103` | 把「四件套」写成机检清单：每条新判据必须同时有①写入点②判据③负向 fixture④正例，四缺一不上线；做成 PR 模板/评审清单而非再写一段散文 |
| 16 | 【流程纪律】 | 「钉住缺陷」测试是好实践，但缺 owner 与退出条件：用例名直接写「（钉住缺陷）」，没有 id、触发条件、退出条件 ⇒ 无人会在修好后删掉措辞 | `tests/plan-topics-dag.test.ts:374`、`:385`、`:395`、`:406` | 补 `// DEFECT: <code> since=<date>` + 触发条件一行 + 退出条件一行（「当 X 码上线后本用例改正向断言」），并把已知边界登记进 `summary.known_gaps[]` |
| 17 | 【流程纪律】 | 并行度与通道强耦合：`delegate` 有全局上限 3、有 `pair.json`/`ledger.jsonl`、有 `scope` 差集；`subagent` 什么都没有。为绕开 3 而改走 `subagent`，等于同时失去归因、越界检测、在飞台账 —— 而父的上下文里只剩「我派了」 | `lib/delegate-async.ts:96-100`；`docs/adr/ADR-plan-delegate-engineering-session.md:29`；`nodes/n4/RESULT.md:67` | 在 `prompts/plan.md` 写死通道判据：「需要台账 ⇒ 必须 `delegate`；`subagent` 只用于**不可写**的只读调研」；并让 checker 在「声明扇出 > `RDDF_MAX_ACTIVE_BACKENDS`」时输出警告 + 建议分批（不是阻断） |
| 18 | 【顺带发现】 | `prompts/build.md` 内部口径自相矛盾：`:355` 写「本仓后端**被禁止 commit**」，`:455` 写「被派发的**后端 session 可以 commit**」，`:428` 又说 commit 由全局工具层验证门决定；`tests/verifier-baseline.test.ts:5` 还复述了旧那句 | `prompts/build.md:355`、`:428`、`:455`；`lib/delegate-core.ts:1645`；`tests/verifier-baseline.test.ts:5` | 同批修正为「由 commit 验证门决定」，并删掉测试里的复述；这是 §3 #11 的落地动作 |
| 19 | 【顺带发现】 | `general` 的 `shell: "*": "allow"` 且不在 `GUARDED_AGENTS` ⇒ 存在一条**不受治理的写旁路**（无登记 / 无台账 / 无槽位 / 无 scope 差集），与 ADR「subagent 只读」口径矛盾 | `opencode.jsonc:1006`、`:1082`、`:1088`；`scripts/agent-guard-rules.ts:84`；`docs/adr/ADR-plan-delegate-engineering-session.md:29` | 登记为独立缺陷（**不评价**）。同时把它当「不得用 `general` 代写」的实证依据（n1 T6 / n5 §6.2） |
| 20 | 【顺带发现】 | 文档过期快照两处：`MULTI-AGENT-DESIGN` 仍写 P2 有 COMMIT GATE（与 `build.md` 相悖）；`guard-authoring` 仍写 `.rddf/plans/**`「当前不存在」（盘上已有 3 个产物） | `docs/MULTI-AGENT-DESIGN.md:330` vs `prompts/build.md:428`；`docs/guard-authoring.md:222` | 各自改为派生表述（「提交由 `archive.sh` 归档前强制」/「以磁盘为准」），不再写死存在性 |
| 21 | 【顺带发现】 | `rdd-builder` P2 在本仓**从未跑过**：`.rddf/state/.planner-handoff.json`、`.rddf/state/builder/`、`.rddf/wt/` 三者**全不存在** ⇒ `prompts/build.md` 要求的前置「两份文件均存在」不成立 ⇒ P2 是「纸面可选层」 | `prompts/build.md:412`（前置条件）、`:427-428`；`.rddf/reviews/role-matrix-rdd-workflow-alignment-audit.md:84`（二手）；磁盘 `glob` 零命中 | 任何「复用 P2」的设计必须先回答「未装 / 前置不成立时怎么办」，不能假定它可用；本设计的路径归属一律另起根 |
| 22 | 【顺带发现】 | `role-gate` 对 `parentID != null` 的会话**整段跳过**租约校验（代码注释自述），且当前**全仓无任何生产调用点传活体探针** ⇒ 判活落 `heartbeat_at` TTL 兜底；这两条共同构成「被派发后端写隔离为零强制」的成因 | `plugins/role-gate.ts:150-155`、`:159-161`；`lib/role-policy.ts:520-526` | 任何走 `subagent` 的可写形态都必须显式承认这条；build 侧若采纳 delegate 通道则不适用，但**不得**把「subagent 也能写」当作等价选项 |
| 23 | 【顺带发现】 | **行号漂移**：`n4 §5.2-R1` 与 `n7 §5-B5` 引用的活体实例行号（`graph.json:141`/`:146`）在本节点写作时**已漂移 +1**（因本 topic 树新增了 m2 节点）⇒ 现盘面为 `graph.json:142`（`"owner": "parent"`）与 `graph.json:147`（`"agent": "plan-worker"`） | `.rddf/plan-topics/build-worker-design/graph.json:142`、`:147`；`nodes/n4/RESULT.md:275`；`nodes/n7/RESULT.md:362` | 引用 node 产物里的行号时**须复核现盘面**；建议 node RESULT 里的 `path:line` 一律标注「写作时盘面」，避免被下游当成永久锚点 |

---

## 5. 本 topic 不声称的东西（诚实口径）

1. **不声称「worktree 隔离」= 权限层隔离。** 只有走 `delegate` 时 `scope` 才变成 per-session `edit` 规则；走 `subagent` 时写隔离最细只到「agent 配置里的固定前缀」，且**不随 wave 变化**（n2 §6.2/§6.3）。
2. **不声称「合并干净」= 功能正确。** 判据只到字节与拓扑（祖先关系、merge commit 存在、无 `MERGE_HEAD`）；语义等价性、C2 冲突解决的**正确性**、两分支各自绿而组合后行为错 —— 这三件都不可机判（n3 §5、n4 §6-1）。
3. **不声称 `converged=true` 表示交付完成。** 它是**调度信号**（父可批量标 `abandoned` 使其为真）；`landed` 是**事实投影**（target 已含 integration）；交付判定只能靠人读 `TOPIC.md` 目标段 + diff（n4 §4.3/§4.4）。
4. **不声称能检出「双活体写者」（FM5）与「树外写入」。** 这两件事在本设计里**没有任何机械信号**：git 不记录写入者，差集只覆盖 `workRoot`，`role-gate` 只覆盖 `edit`/`write`（n7 §2.5、n4 §2-D3/D4、`plugins/role-gate.ts:7`）。⇒ 安全边际只能来自「让它们尽量不发生」，不能来自判据。
5. **不声称 rdd-builder P2 的分支命名 / 配额 / 清理策略已被核过。** skill 本体不在本仓且读取被 `external_directory` 拒，全部 P2 细节只引本仓二手记录（n6 §1.3、§9-F21）。
6. **不声称本稿的裁决是终局。** 三项属**需人确认**：新增集成工作树目录前缀（§3 #9）、`owner_agent` 枚举扩第三值（§3 #17）、`plan_ref` 收紧 front（§3 #18）；另有 G-1/G-2 两条判据缺口未补。正式 ADR 由 architect 在后续流程另行产出 —— 本稿是离线讨论产物，**不可直接派工程**（`TOPIC.md:12`、`lib/delegate-core.ts:1321-1326`）。

---

## STATUS: COMPLETE
