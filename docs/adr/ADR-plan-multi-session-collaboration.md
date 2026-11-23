# ADR-plan-multi-session-collaboration — plan 侧多会话离线协作机制（topic / node / graph 三对象）

## 元数据

| 字段 | 值 |
|---|---|
| Status | **Accepted**（2026-11-20；oracle `治理面判定: PASS-WITH-NOTES` 5 条未覆盖面全部处置 → critic `APPROVE` / `mergeable: yes`，无 BLOCKER、无 SHOULD_FIX）。版本史与审稿轮次见 `docs/CHANGELOG.md` 与审稿报告，不在本文件维护 |
| Date | 2026-11-20 |
| Author | architect |
| Parent | `docs/adr/ADR-plan-delegate-engineering-session.md`（plan 主会话定位与派发纪律）、`docs/adr/ADR-role-session-identity.md`（session 身份口径）、`docs/adr/ADR-role-aware-permissions.md`（角色写门）。本篇**只管 plan 侧离线协作**；工程实施派发仍由父篇 D1/D2 管 |
| 关联 change | **`openspec/changes/archive/2026-11-20-plan-multi-session-collaboration/`**（2026-11-20 立项并归档；proposal / design / tasks 三件套 + `.rddf/plans/plan-multi-session-collaboration.md`；验收报告 `.rddf/reviews/plan-multi-session-collaboration-verify.md`） |
| AC 映射 | 本 change 的「验收标准」表 **AC1–AC18**（`openspec/changes/archive/2026-11-20-plan-multi-session-collaboration/proposal.md`；已归档）；与 V01–V15 的逐项对应见该表「来源」列 |
| 审稿报告 | `.rddf/reviews/adr-plan-multi-session-collaboration-review.md`（审完后落盘，审查者只读） |
| 前置事实 | ① `plan` agent 是 `mode: "primary"`（`opencode.jsonc.opencode-go:118`），宿主 `subagent` 工具对 primary agent 直接拒绝（upstream `core/src/tool/plugin/subagent.ts:143`）⇒ 子会话不能是 `plan` 本身；② 宿主 `subagent` 建子会话时**原生设 parentID**（upstream `subagent.ts:195`），**本机实测**：本篇审查所 spawn 的两个子会话在 `opencode.db:session_v2` 里的 `parent_id` 均等于父会话 id（安装版 opencode `v0.0.0-local-202611110721` 与 upstream v225 行为一致）；③ 子会话完成时宿主把 `<subagent sessionID=… state=completed>…</subagent>` **合成消息投回父会话**（upstream `core/src/session/subagent-completion.ts:37`）；④ `subagent` 支持 `sessionID` 入参续接同一子会话，且**校验 `existing.parentID === context.sessionID`**（upstream `subagent.ts:170`）⇒ 续接**仅限同一父会话**；⑤ 子会话权限 = **该 agent 自己配置**（upstream `core/src/permission.ts:165` 的 `merge(agent?.permissions, session?.permissions)`；`subagent.ts:195` 建会话时不传 permissions）⇒ 权限是 agent 级静态、不是每会话级；⑥ 本仓 `delegate` 通道按 `workRoot` **全局单槽**（父篇 D4）⇒ 并行子会话**不能**走 delegate；⑦ 权限路径匹配用 `Wildcard`（`*` → `.*`，**跨斜杠**，`upstream core/src/util/wildcard.ts`）⇒ 白名单是**前缀**语义、无法表达「只有我的 node 目录」（**实测**）；⑧ 本仓唯一真实闸门是 `bun test tests/` + `scripts/check-upstream-anchors.sh`（`tests/config-guards.test.ts:1455-1462` 自述「本仓无 CI、无生效的 git hook ⇒ 沉默 = 违规」）；⑨ plan 的写权限由 `opencode.jsonc` 的 `edit` 白名单决定，`role-policy` 的 planner 写集**不约束**它（`lib/role-policy.ts:292` 对非 build agent 直接放行）；⑩ **「`subagent` 调用点有插件插桩位」是本仓既有事实**：`plugins/subagent-contract.ts:87-131` 的 L1 硬门就挂在 `ctx.tool.hook("execute.before", …)` 上（可读 `event.input.{agent,prompt,sessionID,background}` 与 `event.sessionID`，抛错即在执行前被拒）⇒ 派发**事前闸门技术上可行**（可读 `graph.json` 判派生状态与锁归属后拒发）；本篇**不建**它是**范围决定**（见 D8 与残留 #2），**不是**能力上限；⑪ ①–⑦ 这七条上游语义是本篇 D3/D4 的安全前提 ⇒ 须以**语义锚点**钉进 `scripts/check-upstream-anchors.sh`（该脚本只写语义、不写行号），否则上游任一改动都会静默击穿本篇的降级表述（见 V15） |

---

## 背景与问题

### ① 目标与已定前提（用户拍板）

让**多个 plan 会话协同**完成比单会话更复杂的任务。已定：plan 是「正式件」的**上游**（正式工程计划 / 改进稿仍由 planner 侧产出）；离线产物**入 git**；根 plan 会话创建子会话、子会话**并行**、父会话判断依赖（fork/join）；子会话能**持续推进自己的 todo**；离线计划与「当前 plan agent + session id」绑定。

### ② 为什么不能靠既有通道

- **delegate 通道**：语义是「工程实施」（`scope` / `role_class` / 停机证据 / 差集检测），且槽位按 `workRoot` 全局单槽（事实 ⑥）⇒ **并行直接被拒**；且 delegate 建的后端**不进宿主会话树**（`lib/role-policy.ts:287` 实测记录）⇒ 拿不到原生父子关系。
- **单会话内多线程**：父会话同时持有 N 个子任务的上下文 ⇒ 父上下文被撑爆，且「谁在做什么」只能靠散文维持。

### ③ 本篇要解决的真问题

不是「怎么多开几个模型」——那由宿主 `subagent` 免费提供。本篇要解决的是三件事：**(a)** 多个会话并行时**互不覆盖**（写域 + 归属）；**(b)** 依赖关系**可被机械判定**（fork/join 的判据从散文变成脚本）；**(c)** 子会话的进度**跨会话存活**（压缩 / 父会话死亡后仍能接手）。

---

## 决策

### D1 协作区落点：`<project>/.rddf/plan-topics/<topic-slug>/`，与 `.rddf/plans/` **分家**

- 目录形态：`.rddf/plan-topics/<topic-slug>/`；**不**放进 `.rddf/plans/`——该目录已被两方占用（plan 的单篇计划产出，父篇 D1/V15；builder 的 TDD 计划 `rdd-builder` owns `.rddf/plans/<name>.md`）⇒ 第三方目录混入会同时撞名与撞归属。父篇收敛口径只管「plan 的**单篇计划产出**」，不排斥新命名空间。
- **单一写者**（每文件恰一写者 ⇒ 并行零写冲突）：

| 文件 | 写者 | 内容 |
|---|---|---|
| `TOPIC.md` | 父 | 目标、边界、全局约束、已决方向 |
| `graph.json` | 父（唯一） | 节点表：id / title / deps / owner / status / attempt / deliverables |
| `nodes/<id>/BRIEF.md` | 父 | 交给该节点的输入契约、约束、期望交付 |
| `nodes/<id>/TODO.md` | **该子会话** | 该节点自己的 todo（勾选式） |
| `nodes/<id>/RESULT.md` | **该子会话** | 结论与交付物 |

- 父子节点内**不得出现第三个写者**；`graph.json` 只父写（父是唯一调度者 ⇒ 无并发写分叉）。
- **plan_ref 闭集边界（登记，防误读为 bug）**：`PLAN_REF_ROOTS`（`lib/delegate-core.ts:1278`）= `.rddf/plans/**`、`.rddf/improvements/**`、`.rddf/roadmap/**`、`openspec/changes/*/proposal.md`，**不含** `.rddf/plan-topics/**` ⇒ 协作产物**不能**直接当 plan_ref 派工程；须先物化成 `.rddf/plans/<slug>.md`（或走 planner 侧）。这与「plan 是正式件上游」自洽，但运行时拒件无解释 ⇒ 在此登记。

### D2 fork/join 的唯一载体是 `graph.json`，节点状态**派生**而非自述

- 节点字段：`id` / `title` / `deps: [id]` / `owner: "parent" | "child"` / `status` / `attempt[]` / `deliverables[]`。
- **状态派生**：`status = done` ⟺ `TODO.md` 全勾 **且** `RESULT.md` 存在且非空。`graph.json` 里的 `status` 只能是**缓存**，判据以派生值为准（与本仓「派生而非手抄」范式一致：AC22/AC23 都是从源码/配置派生）。
- 三条**机械判据**（写进 checker，不靠散文）：
  1. **无环**：`deps` 构成 DAG；
  2. **fork 合法性**：节点 `deps` 未全 `done` ⇒ 不得派发；
  3. **join 合法性**：`deps` 未全 `done` 或 `deliverables` 缺失/为空 ⇒ `graph.json` 的**缓存 `status`** 不得写成 `done`（须与派生值一致，见 V09）。
- `owner: "parent"` 的节点 = 父自己做 ⇒ 「子会话与父会话之间的依赖」由此统一表达，不需要第二套机制。

### D3 父子会话机制 = 宿主 `subagent` 工具（不新造派发通道）

- 根 plan 会话用 `subagent` 派 `plan-worker`：
  - **并行** = 同一轮内多次 `background: true` 派发（事实 ②③：原生 parentID 树 + 完成合成消息唤醒父）；
  - **join** = 子完成 ⇒ 宿主合成消息进父会话 ⇒ 父被唤醒继续下一波；
  - **续接** = `subagent(sessionID=…)`（事实 ④）。
- **拒绝**新造派发通道（重复造唤醒 / 续接 / 会话树 / 深度限制，且与 delegate 争同一 `workRoot` 槽位 ⇒ 冲突无处安放）。**注意**：插桩位是**门**不是**通道**（事实 ⑩）——「建一个 execute.before 闸门」与「新造一条派发通道」是两件事，本篇否决的是后者。

### D4 子会话 agent = 新增 `plan-worker`（`mode: "subagent"`），**不**把 `plan` 改成 `mode: "all"`

- `mode: "all"` 的三个副作用（任一即否决）：
  1. `plan` 会出现在**所有** agent 的可派清单里；`build` 的 `subagent` 权限是字符串 `"allow"`（资源 `*`，`opencode.jsonc.opencode-go:102`）⇒ 按 upstream `subagent.ts:144-151` 的运行期 assert（查**调用方**对该 agent id 的资源规则）**build 可拉起一个带 `delegate` / `question` / `skill` 的 plan 子会话** ⇒ 绕过父篇 D2 的「计划先行」强制（`plan_ref` 校验）、绕过父会话的依赖仲裁、子可直接问用户；
  2. 深度允许 `root → child → grandchild`（`subagent_depth: 2`）⇒ 子可再生子 ⇒ 「父是唯一仲裁者」失守；
  3. 子会话拿到 plan 的**全部**工具（含 `delegate`）⇒ 子可自行派工程后端。
- `plan-worker` 权限（窄，且**无 `ask` 档**——无人值守子会话里 `ask` 行为不可判）：
  - `read` / `grep` / `glob` / `list` / `webfetch` / `websearch`：allow；
  - `edit`：allow **仅** `.rddf/plan-topics/*`（前缀语义，事实 ⑦ ⇒ 只能到 topic 树粒度，**不能**到 node 粒度 ⇒ 见「已知不可机判清单」）；
  - `shell`：只读白名单（三段式，含 `* > *` / `tee *` / `sort -o` 守卫）⇒ 无 shell 写洞；
  - `subagent` / `delegate*` / `question` / `skill` / `lsp` / `external_directory`：**deny**（`external_directory` 用 deny 而非 ask，避免无人值守时挂起）。
- `plan` 主会话权限新增 `edit` allow `.rddf/plan-topics/*`（现白名单无此前缀 ⇒ 落到 `*: ask`，逐次弹窗不可用）。
- **可派者集合**：全仓只有 `build`（字符串 allow）与 `plan`（字符串 allow）能拉起 `plan-worker`；`front` 的 `subagent` 是 map 形态（`"*": "deny"` 打头 + 5 个只读 agent）⇒ 自动排除；其余 7 个 agent 的 `subagent` 全为 `"deny"` ⇒ 无深度 2 嫁接路径。`plan-worker` 工具集 ⊆ `build` 自身（`edit *: allow`、`shell *: allow`）⇒ **无提权面**。**该前提目前无守卫** ⇒ 本篇新增断言钉死（V02）。

### D5 会话身份三落点（**路径不含 session id**）

| 落点 | 内容 | 理由 |
|---|---|---|
| `.rddf/state/plan-sessions.json`（**gitignored**） | 运行态绑定：`session_id ↔ topic / node / role / parent_session_id / heartbeat` | 活的 session id 不进版本库（本仓先例：`pair.json` / `role-claims.json` 均被 ignore，理由写在 `.gitignore`） |
| `graph.json` 的 `attempt[]` | 历史归属：agent / 起止时间 / 交付物清单 | 跨机器可解析；**不**存 session id（别处是死指针） |
| `nodes/<id>/TODO.md` 头 | 单个节点的执行者与起始时间 | 恢复锚点（见 D6） |

- 路径保留人类可读 slug：可浏览、git diff 可读、跨会话续用不断裂；session id 只作**运行态指针**，不作**内容地址**。

### D6 「续接」与「重建」是两件事，不可混称

- **续接（resume）**：同一父会话内 `subagent(sessionID=…)` ⇒ 子会话**自带上下文**继续（事实 ④）。
- **重建（rebuild）**：父会话死亡 / 换根会话 ⇒ 宿主按 `parentID` 校验**拒绝**续接 ⇒ 只能**按 node 重建**：新子会话读 `BRIEF.md` + `TODO.md` 接续该节点。
- ⇒ `TODO.md` 是**跨会话恢复的承重件**，不是装饰；D2 的「done 派生」判据使重建后的进度仍然可判。
- ADR **不承诺**「跨会话续接同一子会话」——那是宿主不允许的事。

### D7 并行边界：不同 topic 天然隔离；同 topic 独占

- **多根 plan 会话并行** = 各写各的 topic 目录 ⇒ 零冲突（D1）。
- **同 topic 并发** = 须**独占**：`.rddf/state/plan-topics/<slug>.lock`（原子 `mkdir` + `owner_session_id`）；仅 owner 可写 / 可派；接管需人显式确认（不自动抢占，理由同父篇 D7.5「活体 + 独占者已死」不能自动放行第二个写入者）。
- **fork** = 父按 D2 判据 2 挑出就绪节点批量 `background` 派发；**join** = 依赖全 `done` 的节点解锁。
- **单 topic 内**并发上限：父每轮至多派一批（扇出上限写在 prompt 里，**不是**机械闸门）。

### D8 关闭范围（本篇**不改**）

delegate 通道与其单槽 / 归属门控 / 停机证据 / `plan_ref` accepted roots（D1 已登记 plan-topics 不在其中）；`role.json` / `role-claims.json` 语义；`prompts/build.md` 角色矩阵既有行；rdd-workflow 产品侧（`rdd-planner` / `rdd-builder` 的 owns 面）。**不做**：子会话派工程实施（`plan-worker` 无 `delegate`）；CI / git hook 接线（本仓无 CI；唯一闸门是 `bun test tests/`）；**派发事前闸门**（技术上可行，事实 ⑩；本期是范围决定 ⇒ 残留 #2）。

---

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **宿主 `subagent` + 新 agent `plan-worker` + `graph.json` 派生状态（本篇）** | **采纳** | 会话树 / 并行 / 完成唤醒 / 续接四项全部宿主内建（事实 ②③④）；写域与归属靠「前缀白名单 + 单一写者 + 独占锁 + 事后核对」四层，明确不声称「权限保证单写者」；判据落在唯一真实闸门 `bun test tests/` |
| `plan` 改 `mode: "all"`，子会话即 `plan` | 否决 | `build` 的 `subagent: allow` ⇒ build 可拉起带 `delegate`/`question` 的 plan 会话 ⇒ 绕过 `plan_ref` 强制与父仲裁；深度允许孙会话；子继承 plan 全部工具 |
| 复用 `delegate` 通道派子会话 | 否决 | `workRoot` 全局单槽 ⇒ 并行被拒；语义是工程实施（scope / role_class / 证据门控）；delegate 后端不进宿主会话树 ⇒ 拿不到父子关系与完成唤醒 |
| 自建 plan 派发插件（仿 delegate） | 否决 | 重复造会话树 / 唤醒 / 续接 / 台账 / 深度限制五件套，且与 delegate 争同一槽位；与本仓「唯一门控边界」纪律相悖 |
| session id 编进路径（`<topic>/<session-id>/`） | 否决 | 路径不可读、git 噪音、跨机器是死指针；并行隔离应由**写域 + 独占**保证，不靠路径编码 |
| 节点状态写在 `graph.json` 自述字段 | 否决 | 自述状态与磁盘事实可分叉 ⇒ 「派生而非手抄」范式被破坏；join 判据变成散文 |
| 子会话自派生子会话（孙层） | 否决（本期） | 破坏「父是唯一仲裁者」；`subagent_depth: 2` 允许但不需要；本期 `plan-worker` 的 `subagent` 直接 deny |

---

## 后果 / 代价

**正面**
- 并行与「谁在做哪件事」有**单一真源**（`graph.json` + `plan-sessions.json`），不靠散文维持。
- 依赖判据变成**脚本可判**（D2 三判据），且落在 `bun test tests/`（本仓唯一真实闸门）。
- 子会话进度跨会话存活（D6 重建路径），父会话死亡不丢进度。
- 多根 plan 会话并行零冲突（同 topic 由独占锁挡）。

**负面 / 代价**
- 新增一个 agent（`plan-worker`）+ 一个 prompt 文件 ⇒ 触发本仓「新增文件闸门」的**真实**部分：`prompts/plan-worker.md` 会被 `tests/config-guards.test.ts:1463` 的平铺清单命中；**本文件（`docs/adr/**`）不在其机械覆盖面内**（该闸门用 `readdirSync` 平铺，`docs/` 子目录是**已知盲区**，`tests/config-guards.test.ts:1491-1494` 自述）⇒ 按闸门注释的三分法仍需为「`docs/adr/` 新文件」**显式做一次决定**（本篇把它登记进残留 #5）。
- `prompts/plan.md` 的 `<!-- capability:plan -->` 投影块必须与配置同步（AC23 派生守卫）⇒ 改 `edit` 白名单必红一次。
- 文档投影面增加：`docs/MULTI-AGENT-DESIGN.md` 的 agent 卡片 / 文件树 / 委派矩阵、`AGENTS.md` 的 agent 列举、`docs/SUBAGENT-ORCHESTRATION.md` 的通道描述。
- 「单写者」在**权限层不可保证**（事实 ⑦）⇒ 依赖协议 + 事后核对；这是本设计**已知的最弱一环**。
- **派发事前闸门本期不建**（事实 ⑩ 表明技术可行 ⇒ 这是范围取舍，不是能力限制）：「deps 未完成不得派发」本期只有**事后复核**（D2 判据 2 + V09/V10），父误派发的代价是一次子会话浪费（可经 D6 重建路径回收），不是状态损坏。

**风险**
- 子会话写越界（配置层只能到 topic 树粒度）⇒ 靠收尾 `git status` 路径核对发现，**不能**事前拦。
- 同 topic 两个根会话并发 ⇒ 靠独占锁（原子 `mkdir`）；锁的僵尸态（持有者已死）**只能靠人**判。
- 父上下文被多个子结果灌满 ⇒ 靠约定（子最终消息只回指针 + 摘要，全文在 `RESULT.md`）⇒ **prompt 层约定**，非机械闸门。
- 上游语义漂移：事实 ①–⑦ 全部押在宿主行为上 ⇒ 必须有语义锚点（V15），否则上游一改即静默击穿本篇的降级表述。

**回滚口径**（三步，回到现状）
① 从 `opencode.jsonc` 移除 `plan-worker` 条目，并把 `plan` 的 `edit` 白名单去掉 `.rddf/plan-topics/*`；② 删除 `prompts/plan-worker.md` 并从文件清单守卫里撤掉；③ 保留 `.rddf/plan-topics/**` 已落盘内容（版本化产物，无副作用），`.rddf/state/plan-sessions.json` 停止写入即可。

---

## Verification（可勾选验收判据，前瞻）

> 判据面向实现完成后的可观察事实；编号 V01–V15。**未标注**「人工」的项应可写成命令或断言。

| # | 判据 | 验证方式 |
|---|---|---|
| V01 | `bun test tests/` 全绿 + `scripts/check-upstream-anchors.sh` 全绿（唯一真实闸门） | CI 式回归 |
| V02 | `plan-worker` 配置形态：`mode == "subagent"`；`edit` 白名单**恰好** `.rddf/plan-topics/*` 一条；`subagent`/`delegate*`/`question`/`skill`/`lsp`/`external_directory` 全 `deny`；`shell` 首键 `"*": "deny"` 且含 `* > *` / `tee *` / `sort -o*` 守卫 | 配置断言 + `scripts/agent-guard-gen.ts --check` 无漂移 |
| V02b | **可派者集合钉死**（D4 安全前提）：顶层 `permission` 无 `subagent` 键（前提，见 `opencode.jsonc.opencode-go:18-35`；若未来顶层加键，本断言口径须同步复核）⇒ agent 级 `subagent` 为 `allow` 的集合 == {`build`, `plan`}；`front` 的 allow 清单不含 `plan-worker`；`plan-worker` 本身 `subagent` 为 `deny` | 守卫断言（新增；当前无守卫 ⇒ fail-open 风险） |
| V03 | `plan-worker` 的 `shell` 规则在 `scripts/agent-guard-rules.ts` 的 `GUARDED_AGENTS` 内登记 | 守卫断言（否则新 agent 静默逃过三段式守卫） |
| V04 | `prompts/plan-worker.md` 进入 `tests/config-guards.test.ts:1464` 的 `EXPECTED.prompts` 清单 | 单测（新增文件闸门的机械命中面） |
| V04b | **本文件（`docs/adr/**`）的归属决定**：要么在 `docs/adr/` 自建清单守卫，要么在残留 #5 登记为「平铺闸门已知盲区」 | 显式决定（闸门机械面不覆盖 `docs/` 子目录） |
| V05 | `prompts/plan.md` 的 `<!-- capability:plan -->` 块 == 配置派生值（含新增 `.rddf/plan-topics/*`） | AC23 派生守卫 |
| V06 | `plan` 的 `edit` 白名单含 `.rddf/plan-topics/*`；`plan-worker` 的不含 `.rddf/plans/`、不含 `.rddf/state/` | 配置断言 |
| V07 | `.gitignore` 双向断言：`git check-ignore -v .rddf/state/plan-sessions.json` 退出 0；`git check-ignore -v .rddf/plan-topics/<t>/graph.json` 退出 **非 0** | `git check-ignore` |
| V08 | checker 负向 fixture 进 `bun test tests/`：成环 / deps 未完成即判派发 / join 无交付物 / 同节点两个 owner / node id 越界（`..`、绝对路径、超长）/ `nodes/<id>/` 存在但 `graph.json` 无对应节点 | 单测 |
| V09 | 派生判据可机判：对同一 topic，`status=done` 的节点集合 == 「`TODO.md` 全勾 且 `RESULT.md` 非空」的节点集合 | checker 单测 |
| V10 | 写域核对命令可跑：给定 topic 与节点清单，输出越界路径列表（`git status --porcelain` 路径前缀 ∉ 该节点目录 ⇒ 列出） | 脚本 + 单测（fixture 造越界文件） |
| V11 | 独占锁：`mkdir .rddf/state/plan-topics/<slug>.lock` 原子成功者成为 owner；第二个根会话对同 topic 的写入被拒（**人工**：需两个真实 plan 会话） | 人工 e2e（登记为半自动） |
| V12 | e2e 探针（本仓无 e2e 框架 ⇒ **人工**）：① 根 plan 会话同一轮 `background` 派两个 `plan-worker`；② 两子会话 `parent_id` == 根会话 id（`opencode.db:session_v2` 可查）；③ 子会话 `$OPENCODE_SESSION_ID` == 子会话自己的 id（**本机已实测**：子内该变量为其自身 id）；④ 两条完成合成消息都到达父会话；⑤ 父用 `subagent(sessionID=…)` 续接其中一个成功，且该子能读到自己的 `TODO.md`；⑥ 父会话死亡后新根会话**不能**续接旧子（宿主 `parentID` 校验）⇒ 只能按 node 重建 | 人工 e2e |
| V13 | 配置生效：重启后 `opencode debug agents` 列出 `plan-worker` 且 `mode=subagent`；`plan` 的工具清单含 `subagent` | `opencode debug agents` |
| V14 | 既有 ADR 未被静默改写；`prompts/plan.md` 的既有口径（`.rddf/plans/<slug>.md`、`plan_ref` 规则）保持原样；`docs/MULTI-AGENT-DESIGN.md` 的 agent 计数与卡片同步 | diff 复核 + 文档计数断言 |
| V15 | **上游语义锚点**：前置事实 ①–⑦ 各有一条 `scripts/check-upstream-anchors.sh` 锚点（语义断言 + 文件 + grep 模式，**不写行号**）：primary 拒绝 subagent / 建会话设 parentID / 完成合成消息投回父会话 / resume 校验 parentID / 子会话权限取 agent 配置 / Wildcard `*` 跨斜杠 / delegate 单槽 | `bash scripts/check-upstream-anchors.sh`（锚点数 23 → 23+N） |

---

## 已知不可机判清单（如实登记，不假装有闸门）

| 项 | 为何不可判 | 现行兜底 |
|---|---|---|
| 子会话**上下文压缩后**的 todo 丢失 | 无任何机械信号 | 压缩后先读盘（D6 重建路径）；`TODO.md` 是唯一真源 |
| 子会话中途死亡 | 无 session 存储读取面可判活 | `git status` 无该节点增量 + `graph.json` 该节点仍非 `done` ⇒ 父重派该 node |
| 父上下文被子结果撑爆 | 上下文长度不可机械测 | 约定：子最终消息只回指针 + 摘要；父不重读全文 |
| 僵尸 topic 锁（持有者已死） | 存活判定在本篇不可靠 | 人确认；不自动抢占 |
| 派发前「deps 未完成」 | 本期**不建**事前闸门（技术上可行：事实 ⑩ 的 `tool.execute.before` 先例）⇒ 只有事后复核 | 事后由 checker 复核 + `attempt[]` 留痕 |
| 节点内越界写 | 权限只到 topic 树粒度（事实 ⑦）；`shell` 写已由三段式堵住，但 `edit` 白名单仍宽 | V10 路径核对（事后） |
| 子会话内 `ask` 档挂起 | 无人值守下 `ask` 行为取决于宿主 UI | 本设计规定窄权限**不得出现 `ask`**（V02） |

---

## 残留（登记，不在本篇处理）

1. **每节点精确写域**（子只能写自己的 `nodes/<id>/`）需 per-session 权限；宿主 `subagent` 不传 permissions（事实 ⑤）⇒ 只能自建派发通道（本期否决）⇒ 留 backlog。
2. **派发事前闸门**（deps 未完成即拒绝派发）：**技术上可行**（事实 ⑩ —— `plugins/subagent-contract.ts` 的 L1 门已挂在同一钩子上；只需给 plan 的 subagent prompt 加结构化序言 + 钩子内读 `graph.json` 判派生状态与锁归属）。本期为范围决定不做 ⇒ 落 backlog，触发条件 = 误派发/误 join 实际发生。
3. `plan` 与 `plan-worker` 的 **prompt 重复**（`prompts/plan.md` 与 `prompts/plan-worker.md` 的职责段）会随演进漂移 ⇒ 靠守卫断言两者「共同纪律段」一致（本期只登记，不实现）。
4. `plan-topics/**` 目录形态与 rdd-workflow 产品侧 `.rddf/` 约定（`improvements/` / `plans/` / `roadmap/`）的边界需产品侧确认（跨仓，见 `docs/rdd-workflow-product-issues.md` 体例）。
5. **`docs/adr/` 落在「新增文件闸门」的平铺盲区**（`tests/config-guards.test.ts:1491-1494` 自述 `readdirSync` 平铺、子目录整树被过滤）⇒ 本篇及后续 ADR 文件的归属**必须显式做一次决定**：要么在 `docs/adr/` 自建清单守卫，要么接受「靠 review 流程兜底」。本篇选择后者（登记），因为 ADR 文件由 architect 单写 + 双审流程覆盖。

---

## 实施记录

> change：`openspec/changes/archive/2026-11-20-plan-multi-session-collaboration/`（已归档） ｜ 实施日期：2026-11-20

| 验证项 | 状态 | 证据 |
|---|---|---|
| V01 唯一真实闸门 | ✅ | `bun test tests/` **969 pass / 0 fail**；`check-upstream-anchors.sh` → `RESULT: OK（29/29）` |
| V02 `plan-worker` 形态 | ✅ | `tests/config-guards.test.ts` AC3（`mode=subagent` / edit 恰好一条 / 六 action deny / shell 首键 deny + 三段式 / 白名单无 `bun`·`node`） |
| V02b 可派者集合 | ✅ | 同文件 AC4（显式 `subagent:allow` == {build, plan}；无键 agent 闭集 == `["title"]`；front 不含 plan-worker；plan-worker 自身 deny） |
| V03 `GUARDED_AGENTS` | ✅ | AC5 + `bun scripts/agent-guard-gen.ts --check` 无漂移 |
| V04 EXPECTED 清单 | ✅ | `EXPECTED.prompts` 含 `plan-worker.md`；`EXPECTED.lib` 含 `plan-topics.ts` |
| V05 capability 块 | ✅ | AC23（plan 块 == 配置派生值） |
| V06 `plan` edit 顺序 | ✅ | AC8（首键 `*`；两条新项 `indexOf > 0`） |
| V07 `.gitignore` 双向 | ✅ | AC9（fixture 仓：`plan-sessions.json` 被 ignore / 协作产物不被 / 黑名单 id 被 ignore） |
| V08 / V09 / V10 checker | ✅ | `tests/plan-topics.test.ts` 31 例（schema / node id 黑名单 / DAG / progress·status 正交 / 缓存分叉 / brief 完整性 / 孤儿 / 空 topic / 退出码四值 / scope-check fixture 仓 / lock 只读） |
| V14 既有口径 | ✅ | 全量 969 pass（delegate / 角色写门 / front 顺序守卫未回归）；`prompts/plan.md` 的 `.rddf/plans/` 与 `plan_ref` 口径未改 |
| V15 上游语义锚点 | ✅ | P1–P6 六条进脚本；**运行时基线 23 → 29**。⚠ `grep -c 'check "'` 只数静态行（16），A7 在 `for` 循环里多次调用 `check` ⇒ **基线以脚本自报 `N` 为准**，不写魔数。第 7 条「delegate 单槽」属本仓语义，由 `tests/delegate-core.test.ts` 覆盖 |
| V11 / V12 / V13 人工 e2e | ⏳ 待主会话执行 | 见 proposal AC15–AC17 与路线图 §3.3；记录落 `.rddf/reviews/plan-multi-session-collaboration-e2e.md` |

**本清单补充两条（metis gap 分析发现，实施时确认仍成立）**：

1. **父会话先死、子会话仍活 ⇒ 双写者**：子会话权限是 agent 级静态（事实 ⑤），孤儿子仍可继续写；父被重建后新子也写同一 node。唯一缓解是协议（`TODO.md` 头写 `owner_session_id`，进来先核对）。
2. **越权无法归因**：`attempts[]` 按 D5 **不存** session id ⇒ 只能判「被改过」（`brief_sha256` 台账），判不出「谁改」。

**实施中确认的补充裁决**（与决策无冲突；完整 14 条见 `.rddf/roadmap/plan-multi-session-collaboration.md` §5）：

- `edit` 白名单采用带前导 `*` 的形态（`*.rddf/plan-topics/*`、`*.rddf/state/plan-sessions.json`）—— 相对 / 绝对两种匹配口径下都成立。
- `plan-worker` 的 shell 白名单**无** `bun` / `node` ⇒ checker 只能由父 `plan` 会话执行（与 D2「父是唯一调度者」一致）。
- 锁补了**释放**协议（全节点 done ⇒ `rmdir`）—— 不写释放 = 默认死锁。
