# ADR-plan-multi-session-collaboration — plan 侧多会话离线协作机制（topic / node / graph 三对象）

## 元数据

| 字段 | 值 |
|---|---|
| Status | **Accepted**（2026-11-20 初版）｜**Accepted**（2026-11-24 增补 D9「取消语义」）｜**Accepted**（2026-11-25 增补 D10「在飞与派发台账」+ 判据阶段化/严重度追认）｜**Accepted**（2026-11-25 增补 D11「收敛判据」）｜**Accepted**（2026-11-25 修订 D5 落点表：`plan-sessions` 每会话一文件）。五段均经 oracle→critic 双审（无 BLOCKER）+ 复审闭合；版本史与审稿轮次见 `docs/CHANGELOG.md` 与审稿报告，不在本文件维护 |
| Date | 2026-11-20（初版）｜2026-11-24（增补 D9） |
| Author | architect |
| Parent | `docs/adr/ADR-plan-delegate-engineering-session.md`（plan 主会话定位与派发纪律）、`docs/adr/ADR-role-session-identity.md`（session 身份口径）、`docs/adr/ADR-role-aware-permissions.md`（角色写门）。本篇**只管 plan 侧离线协作**；工程实施派发仍由父篇 D1/D2 管 |
| 关联 change | **`openspec/changes/archive/2026-11-20-plan-multi-session-collaboration/`**（2026-11-20 立项并归档；proposal / design / tasks 三件套 + `.rddf/plans/plan-multi-session-collaboration.md`；验收报告 `.rddf/reviews/plan-multi-session-collaboration-verify.md`）｜**D9 增补的 change 尚未立项** ⇒ 登记为 `backlog: plan-topics-cancelled-semantics`（立项后回填 AC 映射） |
| AC 映射 | 本 change 的「验收标准」表 **AC1–AC18**（`openspec/changes/archive/2026-11-20-plan-multi-session-collaboration/proposal.md`；已归档）；与 V01–V15 的逐项对应见该表「来源」列｜D9 增补的判据为 **V16–V21**、D10 增补的判据为 **V22–V29**、D11 增补的判据为 **V30–V36**（三者对应的 change 均未立项 ⇒ AC 编号暂缺，立项后回填） |
| 审稿报告 | `.rddf/reviews/adr-plan-multi-session-collaboration-review.md`（初版）；增补 D9 的：`…-review-d9-cancel.md`；D10 的：`…-review-d10-inflight.md`；D11 的：`…-review-d11-converged.md`；D5 修订的：`…-review-d5-persession.md`；锚点事故的：`…-review-anchor-drift.md` |
| 前置事实 | ① `plan` agent 是 `mode: "primary"`（`opencode.jsonc.opencode-go`），宿主 `subagent` 工具对 primary agent 直接拒绝（upstream `core/src/tool/plugin/subagent.ts`）⇒ 子会话不能是 `plan` 本身；② 宿主 `subagent` 建子会话时**原生设 parentID**（upstream `subagent.ts`），**本机实测**：本篇审查所 spawn 的两个子会话在 `opencode.db:session_v2` 里的 `parent_id` 均等于父会话 id（安装版 opencode `v0.0.0-local-202611110721` 与 upstream v225 行为一致）；③ 子会话完成时宿主把 `<subagent sessionID=… state=completed>…</subagent>` **合成消息投回父会话**（upstream `core/src/session/subagent-completion.ts`）；④ `subagent` 支持 `sessionID` 入参续接同一子会话，且**校验 `existing.parentID === context.sessionID`**（upstream `subagent.ts`）⇒ 续接**仅限同一父会话**；⑤ 子会话权限 = **该 agent 自己配置**（upstream `core/src/permission.ts` 的 `PermissionPolicy.fromRules(agent?.permissions ?? …, session.permissions ?? [])`；`subagent.ts` 的 `sessions.create({ …, agent: agent.id, … })` **不传 permissions** ⇒ 子会话实际拿 agent 配置 —— **2026-11-25 核实的当前形状；函数名会变、语义不变** ⇒ 锚点改钉 token，见 V15）⇒ 权限是 agent 级静态、不是每会话级；⑥ 本仓 `delegate` 通道按 `workRoot` **全局单槽**（父篇 D4）⇒ 并行子会话**不能**走 delegate；⑦ 权限路径匹配用 `Wildcard`（`*` → `.*`，**跨斜杠**，`upstream core/src/util/wildcard.ts`）⇒ 白名单是**前缀**语义、无法表达「只有我的 node 目录」（**实测**）；⑧ 本仓唯一真实闸门是 `bun test tests/` + `scripts/check-upstream-anchors.sh`（`tests/config-guards.test.ts` 自述「本仓无 CI、无生效的 git hook ⇒ 沉默 = 违规」）；⑨ plan 的写权限由 `opencode.jsonc` 的 `edit` 白名单决定，`role-policy` 的 planner 写集**不约束**它（`lib/role-policy.ts` 对非 build agent 直接放行）；⑩ **「`subagent` 调用点有插件插桩位」是本仓既有事实**：`plugins/subagent-contract.ts` 的 L1 硬门就挂在 `ctx.tool.hook("execute.before", …)` 上（可读 `event.input.{agent,prompt,sessionID,background}` 与 `event.sessionID`，抛错即在执行前被拒）⇒ 派发**事前闸门技术上可行**（可读 `graph.json` 判派生状态与锁归属后拒发）；本篇**不建**它是**范围决定**（见 D8 与残留 #2），**不是**能力上限；⑪ ①②③④⑤⑦ 这**六条上游语义**是本篇 D3/D4 的安全前提 ⇒ 须以**语义锚点**钉进 `scripts/check-upstream-anchors.sh`（该脚本只写语义、**不写行号** —— 上游重构后行号会静默漂移；2026-11-25 的锚点漂移事故即此因，见 §实施记录）；**⑥ 是本仓语义**（delegate 单槽）⇒ 无上游锚点，由 `tests/delegate-core.test.ts` 覆盖。否则上游任一改动都会静默击穿本篇的降级表述（见 V15） |

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

- 节点字段：`id` / `title` / `deps: [id]` / `owner: "parent" | "child"` / `status` / `attempt[]` / `deliverables[]` / `cancelled?`（取消意图，见 D9）。
- **状态派生**：`status = done` ⟺ `TODO.md` 全勾 **且** `RESULT.md` 存在且非空（`¬cancelled` 前置见 D9 短路）。`graph.json` 里的 `status` 只能是**缓存**，判据以派生值为准（与本仓「派生而非手抄」范式一致：AC22/AC23 都是从源码/配置派生）。
- 三条**机械判据**（写进 checker，不靠散文）：
  1. **无环**：`deps` 构成 DAG；
  2. **fork 合法性**：节点 `deps` 未全 `done` ⇒ 不得派发；
  3. **join 合法性**：`deps` 未全 `done` 或 `deliverables` 缺失/为空 ⇒ `graph.json` 的**缓存 `status`** 不得写成 `done`（须与派生值一致，见 V09）。
- **判据有两维口径**（checker 面，2026-11-25 追认）：**阶段**（`dispatch` = 派发前的截面，只报「会阻断下一步派发」的问题；`final` = 全量收尾口径，默认）与**严重度**（`阻断` / `info`，info 不改变退出码）。动机：未到期节点的 `BRIEF.md`、未完成节点的交付物、缓存滞后都是**正常状态** —— 与「伪造完成」同码同严重度会让「派发前 check 必须 exit 0 才派」这条纪律**不可执行**（且 `attempts[].precheck.exit` 恒为 1 ⇒ 凭据判别力归零）。见 V22 / V23。
- `owner: "parent"` 的节点 = 父自己做 ⇒ 「子会话与父会话之间的依赖」由此统一表达，不需要第二套机制。
- **派生的输入分两类**：**磁盘事实**（`TODO.md` / `RESULT.md` / 交付物是否存在）与**声明意图**（`deps` / `owner` / `cancelled`）—— 后者由**父**写进 `graph.json`（D1 单一写者），是派生公式的**输入**，不是派生的**结果**；派生值一律优先于缓存（D9 用这条把「取消」纳入派生而不破坏「派生而非自述」）。

### D3 父子会话机制 = 宿主 `subagent` 工具（不新造派发通道）

- 根 plan 会话用 `subagent` 派 `plan-worker`：
  - **并行** = 同一轮内多次 `background: true` 派发（事实 ②③：原生 parentID 树 + 完成合成消息唤醒父）；
  - **join** = 子完成 ⇒ 宿主合成消息进父会话 ⇒ 父被唤醒继续下一波；
  - **续接** = `subagent(sessionID=…)`（事实 ④）。
- **拒绝**新造派发通道（重复造唤醒 / 续接 / 会话树 / 深度限制，且与 delegate 争同一 `workRoot` 槽位 ⇒ 冲突无处安放）。**注意**：插桩位是**门**不是**通道**（事实 ⑩）——「建一个 execute.before 闸门」与「新造一条派发通道」是两件事，本篇否决的是后者。

### D4 子会话 agent = 新增 `plan-worker`（`mode: "subagent"`），**不**把 `plan` 改成 `mode: "all"`

- `mode: "all"` 的三个副作用（任一即否决）：
  1. `plan` 会出现在**所有** agent 的可派清单里；`build` 的 `subagent` 权限是字符串 `"allow"`（资源 `*`，`opencode.jsonc.opencode-go`）⇒ 按 upstream `subagent.ts` 的运行期 assert（查**调用方**对该 agent id 的资源规则；断言点在 upstream 的 `Permission.evaluate(name, agent.id, selected.permissions)` 处）**build 可拉起一个带 `delegate` / `question` / `skill` 的 plan 子会话** ⇒ 绕过父篇 D2 的「计划先行」强制（`plan_ref` 校验）、绕过父会话的依赖仲裁、子可直接问用户；
  2. 深度允许 `root → child → grandchild`（`subagent_depth: 2`）⇒ 子可再生子 ⇒ 「父是唯一仲裁者」失守；
  3. 子会话拿到 plan 的**全部**工具（含 `delegate`）⇒ 子可自行派工程后端。
- `plan-worker` 权限（窄，且**无 `ask` 档**——无人值守子会话里 `ask` 行为不可判）：
  - `read` / `grep` / `glob` / `list` / `webfetch` / `websearch`：allow；
  - `edit`：allow **仅** `.rddf/plan-topics/*`（前缀语义，事实 ⑦ ⇒ 只能到 topic 树粒度，**不能**到 node 粒度 ⇒ 见「已知不可机判清单」）；
  - `shell`：只读白名单（三段式，含 `* > *` / `tee *` / `sort -o` 守卫）⇒ 无 shell 写洞；
  - `subagent` / `delegate*` / `question` / `skill` / `lsp` / `external_directory`：**deny**（`external_directory` 用 deny 而非 ask，避免无人值守时挂起）。
- `plan` 主会话权限新增 `edit` allow `.rddf/plan-topics/*`（现白名单无此前缀 ⇒ 落到 `*: ask`，逐次弹窗不可用）。
- **可派者集合**：全仓只有 `build`（字符串 allow）与 `plan`（字符串 allow）能拉起 `plan-worker`；`front` 的 `subagent` 是 map 形态（`"*": "deny"` 打头 + 5 个只读 agent）⇒ 自动排除；其余 7 个 agent 的 `subagent` 全为 `"deny"` ⇒ 无深度 2 嫁接路径。`plan-worker` 工具集 ⊆ `build` 自身（`edit *: allow`、`shell *: allow`）⇒ **无提权面**。**该前提目前无守卫** ⇒ 本篇新增断言钉死（V02）。

### D5 会话身份三落点（**版本化产物路径不含 session id**）

| 落点 | 内容 | 理由 |
|---|---|---|
| `.rddf/state/plan-sessions/<session_id>.json`（**gitignored**，**每会话一文件**） | 运行态绑定：`session_id ↔ topic / node / role / parent_session_id / heartbeat` | 活的 session id 不进版本库（本仓先例：`pair.json` / `role-claims.json` 均被 ignore，理由写在 `.gitignore`）；**每会话一文件 ⇒ 天然免并发覆盖** —— 旧形态（单文件）下两个根会话（哪怕不同 topic）会互相覆盖，与 D7「不同 topic 天然隔离 ⇒ 零冲突」矛盾（且 D1 的单一写者表未登记这个例外）；代价：`lock` 的 binding 查询改为「按 owner **直接构造路径**」（扫目录仅用于枚举全体绑定时） |
| `graph.json` 的 `attempt[]` | 历史归属：agent / 起止时间 / 交付物清单 | 跨机器可解析；**不**存 session id（别处是死指针） |
| `nodes/<id>/TODO.md` 头 | 单个节点的执行者与起始时间 | 恢复锚点（见 D6） |

- 路径保留人类可读 slug：可浏览、git diff 可读、跨会话续用不断裂；session id 只作**运行态指针**，不作**内容地址**。
- **运行态落点（gitignored）的文件名含 session id 不违反本原则**：本原则约束的是**入版本库的落点**；运行态文件本机专用，跨机器不可移植是**一切**运行态的固有属性（`pair.json` / `role-claims.json` / `opencode.db` 里的 session id 同理）⇒ 不需为它道歉，但须点明，否则读者会拿选项表那一行来质疑。
- **迁移口径**：旧形态是 gitignored 的**运行态**文件 ⇒ 无需数据迁移（父重启后重写即可）；实现批直接忽略旧文件。
- **本修订只消除运行态绑定文件的覆盖**：`graph.json` 的写互斥**不变** —— 不同 topic 本就各写各的 `graph.json`；**同 topic** 仍由 D7 独占锁 + D10 短锁负责（**协议级**，非权限强制）。
- **`lock` 的两个失败模式（须如实登记）**：① `mkdir` 锁与写会话文件之间的崩溃窗口 ⇒ owner 存在而对应会话 json 缺失 ⇒ `binding = null`（与旧形态 `sessions[owner] ?? null` 等价）⇒ 消费方须把 `null` 读作「**未知**」而非「无绑定」；② 死会话的 json 残留随时间累积（与旧形态的「死键累积」同级）⇒ **清理策略 defer 至实现批**。
- **与 D10 恢复路径的关系**：父压缩后仍需知道「哪个 session 在做哪个 node」⇒ 扫目录逐会话文件即可（`session_id ↔ node` 映射**逐会话独立**）⇒ D10 的「压缩后按 `parent_id` 找回」**仍可用**，且比读单文件更不易丢条目。
- **落地顺序（硬约束）**（对齐 D9 / D10 / D11 范式，缺这条实现批会撞一串「无关」的红）：本形态要求**同批**改写 —— ① `opencode.jsonc` 的 plan `edit` 白名单（须含 `*.rddf/state/plan-sessions/*`，否则父**写不了**自己的会话文件）；② `.gitignore`（旧单文件条目 → 目录形态）；③ `prompts/plan.md` 两处（`capability:plan` 的 `edit:` 行 + 「多会话协作」整节的 JSON 形状与 lock 描述）⇒ **连同** `.rddf/rollback/plan-topics.json` 与 `plan-delegate.json` 的**逐字节 `find` 串 *与 `replace` 串***（⚠ **replace 也钉死旧路径**：`plan-delegate.json` 的 replace 内嵌 capability 块 ⇒ 只改 find 会让未来回滚把旧 `edit` 行写回 `prompts/plan.md` ⇒ AC23 派生守卫回滚后撞红）；④ `scripts/plan-topic-check.ts` 的 `cmdLock`；⑤ `tests/plan-topics.test.ts`（lock 报告用例）与 `tests/config-guards.test.ts`（AC8 / AC9 / **AC23** / capability 派生守卫）；⑥ `.rddf/rollback/README.md`（含旧路径）与 `.rddf/rollback/plan-topics.json` 的 **`notes` 字段散文**（提到旧单文件路径 ⇒ 顺手刷新）；⑦ **V07 的断言同批反转**（旧路径不再被 ignore ⇒ 原断言必红）；⑧ **`.rddf/roadmap/plan-multi-session-collaboration.md`**：其 D5 行 / §5 第 1 条（「精确单文件，不扩 `.rddf/state/` 整目录」—— **已被本修订直接反转**）/ 任务 C9·E1·E2·B7 / 风险行 / 回滚三步 均仍写旧形态 ⇒ 须标注「**2026-11-25 D5 修订已取代**」。⚠ 该文件在 **planner 写集**（`.rddf/roadmap/**`），**不在 architect 写集** ⇒ 本次只登记，由对应角色在同批补。

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

### D9 取消（cancelled）是**声明意图字段**，`status` 仍纯派生

> 增补（2026-11-24）。要解决的真问题：动态调整 DAG 时父要「砍掉一个分支」，而 `status` / `progress` 都只描述**有没有产物** ⇒ 取消无处安放（只能伪造 done ⇒ `cache_ahead`；或假装没做完 ⇒ 永久 `blocked_by_deps`；或删节点 ⇒ 丢失「被放弃」的留痕）。

- **载体**：`graph.json` 节点新增可选字段 `cancelled?: { by: "parent"; reason: string; at?: string }`；`Status` 派生值新增第四态 `"cancelled"`。`graph.json` **维持 `version: 1`**（附加可选字段 ⇒ 新旧双向安全：旧数据无字段 ⇒ 永不派生 cancelled）。`cancelled` 自身的**形状必须纳入逐字段校验**（`by` / `reason` / `at` 的类型）⇒ 畸形输入（字符串 / 数组 / `by` 非字符串）⇒ `schema_invalid`，**不得**落进「未知键静默忽略」通道（否则 V19 的 `cancelled_unattributed` 在畸形输入下无从读起）。⚠ **未知键不被拒绝**（schema 只逐字段校验已知字段的类型、不枚举键集合）⇒ 旧代码会**静默忽略** `cancelled` 字段并照常派发该节点；唯一的 tripwire 是**缓存 `status` 写成 `"cancelled"`** 时撞 `STATUSES` 枚举 ⇒ `schema_invalid` 响亮报错 —— 故缓存写必须与取消同事务完成（见事务条）。
- **派生**：`deriveStatus` 中 cancelled 标志**短路**（优先级高于 `done`）：有 `cancelled` ⇒ `status = "cancelled"`，**不要求** `TODO.md` / `RESULT.md` / 交付物 / `BRIEF.md`。
- **门控 = block + 强制消解**：`cancelled` **不满足**下游 deps（下游 ⇒ `blocked_by_deps`）；新增不变量 **`cancelled_dep_active`**：任何**活跃**节点（派生 `status` 非 `done` 且非 `cancelled`）不得依赖 cancelled 节点 ⇒ 图不可能停在坏状态。⚠ **不需要「done 下游豁免」条款**：cancelled 节点自身永不派生 `done`（短路优先），其下游因此**永远不可能**派生 `done`（`depsDone` 要求全部 dep 为 done）⇒ 该豁免集恒为空。判定中的「done」一律指**派生值**，不指缓存值（缓存口径由 `cache_ahead` 单独兜住）。
- **消解**：父在取消时对每个活跃下游二选一 —— **级联取消**（只级联活跃节点，永不碰 done）或**摘除该边**（改 `deps`，git diff 留痕）。**默认拒绝**：未指定处置 ⇒ 报错并列出活跃下游清单。
- **完整性**（三个新阻断违规码）：`cancelled_unattributed`（`by !== "parent"` 或 `reason` 为空）、`cancelled_open_attempt`（存在未闭合 attempt：缺 `finished_at`）、`cancelled_dep_active`。
- **禁止「完成后取消」**：仅允许取消**派生 `status` 非 `done`** 的节点（口径是**派生值**，不指缓存值）；撤销已完成节点属「重开」，本篇不支持（⇒ 残留 #6）。执行上**只能走 `cancel` CLI**（由 CLI 硬拒该情形）⇒ 不依赖散文纪律。
- **阶段口径**：cancelled 节点**豁免** `missing_brief` / `missing_deliverable` / `due` / `finished` 四类判定 —— **不按「集合减法」实现**（`final` 口径下 BRIEF 与交付物检查走**全量**路径，减法不成立）⇒ 直接对 cancelled 节点跳过这四类判定。**并豁免 `stale_inputs`**（D10 的 fence）：cancel 事务在强制闭合 attempt 时把该 attempt 的 `input` 快照**刷新为当前投影**（冻结）⇒ 其后给 cancelled 节点补写取消理由（极自然的文档动作）不再造成投影漂移 ⇒ 惰性节点不参与 fence 比对。
- **缓存**：缓存写 `"cancelled"` 与派生一致 ⇒ 无违规；写 `"done"` ⇒ `cache_ahead`（阻断）；写 `"pending"` ⇒ `cache_behind`（info）。缓存判据**零改动**。
- **事务**：一次 `graph.json` 原子写内完成「补 attempt 的 `finished_at` → **把该 attempt 的 `input` 快照刷新为当前投影（冻结，见阶段口径条）** → 置 `cancelled` 字段 → **回填缓存 `status: "cancelled"`** → 消解下游」；缓存写必须同事务（否则稳态是缓存 `pending` vs 派生 `cancelled` ⇒ 永久 `cache_behind`，且旧代码的枚举 tripwire 在该窗口内不成立）。分两次写会在中间窗口**留下分叉**：无活跃下游时仅 `cache_behind`（info，exit 0）；**有未消解活跃下游时**才撞阻断码 `cancelled_dep_active`（特性，非缺陷）。⚠ **TOCTOU**：取消判定与原子写之间 worker 可能落盘 ⇒ 「完成后取消」实际可能发生 ⇒ 该情形按审计痕迹处理（见「已知不可机判清单」）。
- **防伪造的诚实口径**：cancelled 与既有产物（`TODO.md` / `RESULT.md`）**同威胁级** —— 本系统对子会话的磁盘写从来是信任的（progress 即派生自子自留地）；cancelled 的真实锚是 D4 的四层「前缀白名单 + 单一写者 + 独占锁 + 事后核对」，**不声称权限强制**。

### D10 「在飞」= 未闭合 attempt；派发台账是唯一真源，fence = 节点级输入投影

> 增补（2026-11-25）。要解决的真问题：① `attempts[]` 字段早已存在却**从不参与判据** ⇒ `dispatchableNodes` 只看 deps/BRIEF/status ⇒ **同一节点可被重复派发**（`ready` 幂等），父压缩后也答不出「谁在做什么」；② 父在 worker 在飞期间改图（加节点 / 改 deps / 改 BRIEF）⇒ 产物新旧**不可判**（`brief_sha256` 只覆盖该节点自己的 BRIEF）。

- **在飞的定义**：节点「在飞」⟺ 其 `attempts[]` 末条**缺 `finished_at`**。派生自 `graph.json`（父写、入 git）⇒ 父死后新根可读（D6）⇒ **不引入运行态第二本账**。
- **统一口径**：**attempt 未闭合 = 在飞；闭合是离开在飞的唯一方式**；D9 的 `cancel` = 闭合 + 节点墓碑；`reap` = 闭合 + 节点回到可派 ⇒ `claim` / `close` / `cancel` 共用同一套台账语义与同一把写互斥锁。
- **先登记后 spawn**：`claim`（spawn 前追加 attempt：`agent` / `started_at` / `precheck` / `input` 快照）→ spawn；join 时 `close`；spawn 失败**同回合** `close`；父崩 ⇒ 僵尸 attempt ⇒ `reap`（跨父接手）。**先 spawn 后登记被否**：其失败模式是**静默**的（孤儿 worker + 可派窗口敞开），严格差于先登记的可知失败。
- **重复派发的机械闸门**：`claim` 时若已有未闭合 attempt ⇒ **拒绝且文件不动** ⇒ 同一节点不会被两个 worker 同时推进；checker 侧新增阻断违规码 **`duplicate_open_attempt`**（两口径都报：正常操作下不可能出现，出现即说明互斥被绕过或手写事故）。
- **在飞不是违规**：`attempt_open` **不设违规码**（worker 正常在跑 ⇒ 父跑 check 必须不红）⇒ 在飞只在 `ready --json` 的 `in_flight[{node, started_at, liveness_stale}]` 暴露；`liveness_stale`（mtime 活性）与 fence 的 `input_drift`（投影漂移）**同名不同义 ⇒ 命名消歧**（见 fence 条）；`stale_attempt` **不设码**（staleness 是数据不是判决）。
- **判活与接管**：唯一可算的活性信号 = `TODO.md` mtime 新鲜度（worker 写域内、父死后仍在盘上）；`liveness_stale` **只是显示提示，不授权接管** —— worker 对 `nodes/<id>/` 的写**没有** `claim_gen` 式围栏 ⇒ TTL 自动接管会制造**双活体写者**（比现状更糟）⇒ **接管须显式确认**（与 D7 僵尸 topic 锁同一 posture）；确认责任含「旧 worker 已死**且不再被 resume**」（`reap` **不吊销**旧 subagent session 的 `parentID` 校验 ⇒ 同父仍可复活它）；同父会话内优先 `subagent(sessionID=…)` 续接（attempt 保持 open，续接**不是** claim、不追加 attempt ⇒ 不与「claim 拒已有未闭合 attempt」打架）；**压缩后**的恢复路径：台账不含 session id（D5）⇒ 「同父续接」退化为「查 `opencode.db` 按 `parent_id` 找回」或 reap-then-claim。reap 的「显式确认」形态 = **显式 flag**（如 `--confirm`），**非交互**（无人值守语境下交互不可判）。
- **graph.json 写互斥**：per-topic **短**锁 `.rddf/state/plan-topics/<slug>.graph.lock`（原子 `mkdir` + 陈旧回收 + 硬超时；命中 `.gitignore` 的 `*.lock`）⇒ `claim` / `close` / `cancel` 全部经这把锁串行化；**不复用** D7 的长寿命归属锁（语义打架）。陈旧回收必须以**硬超时**为上界（**不按 mtime 判死** —— 持有者慢 ≠ 死，按 mtime 回收会让两个 claim 同进临界区 ⇒ 双 open attempt）。硬超时的**具体值属实现细节**（CLI 常量 / 可覆盖 flag，覆盖模式对齐 `lib/role-lease.ts` 的 TTL 环境变量模式）。诚实口径：仍**非权限强制**（手写 graph.json 可绕）⇒ 与 D7 同威胁级。
- **fence（输入变更）= 节点级输入投影**：`attempt.input?: { brief_sha256: string; deps: string[]; deliverables: string[] }`（claim 时刻的**快照**）。判定**不在 close 做**、收敛到 checker：对已闭合 attempt 重算当前投影 vs 快照 ⇒ 不等 ⇒ **`stale_inputs`**（逐成分 diff，detail 指名 `brief` / `deps` / `deliverables` 哪一项变了）。
  - **产生矩阵（唯一定义）**：`stale_inputs` **仅对已闭合 attempt、且仅在 `final` 口径产生**（阻断级；产物声称完成而输入已变 ⇒ 与 `cache_ahead` 同族）。`dispatch` 口径**不产生该码**（**phase-gating**，与 `missing_brief` 同款 —— **不是**「产生但降级为 info」，否则 severity 会变成 phase 的函数、破坏 D2 的两维正交）。
  - **在飞 attempt 的漂移只走 `ready --json`**：父在 worker 在飞时改图是**合法操作** ⇒ 进 violations 会让 dispatch 复现「恒红」⇒ 在飞漂移**不进 violations 列表**，只在顶层 `input_drift[]` 暴露（与 `in_flight[].liveness_stale` **分开两个字段**：前者是投影漂移，后者是 mtime 活性）。快照就在 attempt 里 ⇒ checker 同法重算即可。
  - 豁免写点：`attempt.inputs_reviewed?: { at: string; note?: string }`（父写复核结论）⇒ `final` exit 0。**只在响应正文里说 ⇒ 不可机判，不接受**。
  - **兄弟免疫**：改兄弟节点 / 加无关节点 **不触发** —— 这正是必须用**节点级**投影而非图级的原因（图级 fence ⇒ 兄弟一改就全体误报 ⇒ alert fatigue，与 `cache_behind` info 化同款教训）。
  - 与 D9 的耦合：cancel **摘边** ⇒ 下游 deps 变 ⇒ 下游 attempt 的投影漂移**自动进入 fence**（该 attempt **已闭合** ⇒ 触发 `stale_inputs`；**仍在飞** ⇒ 出现在 `input_drift[]`）⇒ D9 的「消解下游」通过投影**天然传播**，无需额外接线；cancel **级联** ⇒ 下游 attempt 被强制闭合 ⇒ 该节点无 fence 对象（行为不同，两条路径均已规定）。
- **溯源（目的 A）= 图级结构投影哈希**：`precheck.graph_rev` 语义钉死为「check 运行时**图结构投影**的 sha256」（投影 = 节点 id / deps / deliverables / brief 哈希；**排除** `status` / `progress` / `attempts` ⇒ join 回填零污染）。**要么实装要么删除，不留死字段**（当前为死字段 ⇒ 本篇要求实装）。
- **与 D2 的关系**：在飞**永不进入** `deriveStatus`（status 保持纯磁盘派生）；`attempts[]` 是父写的**事件台账**（与 `deps` / `owner` / `cancelled` 同族的声明输入），且「派发事件」**没有磁盘真值可分叉** ⇒ 不重蹈「status 自述」的覆辙。
- **schema 与迁移**：`Attempt` 增 `input?` / `inputs_reviewed?`（可选字段）；`graph.json` 维持 `version: 1`（与 D9 `cancelled` 同一迁移口径：旧数据无字段 ⇒ 行为不变；畸形 ⇒ `schema_invalid`）。
- **落地顺序（硬约束）**：`input` 快照的**自动写入**依赖 `claim` 写入点 ⇒ **判据不得早于写入点落地**（否则退化为纪律型字段）；`cancel` 与 `claim` / `close` 共享事务骨架 ⇒ 建议同批。

### D11 收敛判据：`converged` = 「还有没有未完成的活」（**调度信号**，非交付信号）

> 增补（2026-11-25）。要解决的真问题：父要回答「这个 topic 干完了吗」，今天必须自己组合四个条件（终态 / 在飞 / 违规 / 可派）⇒ **没有任何命令输出这个信号**（`check --json` 只吐 `{ok, violations}`）⇒ 「父根能否正确收敛所有 plan-worker」不可机判，只能靠散文维持。

- **定义**（纯派生，与 D2 同范式）：`converged` ⇔ ① **零阻断违规**（`final` 口径）∧ ② 每个节点的派生 `status` ∈ {`done`, `cancelled`} ∧ ③ **无在飞**节点（`attempts[]` 末条均已闭合）。**口径恒定**：`converged` 与 `summary` **恒按 `final` 口径派生**；`--phase` 只作用于 `violations` 列表与退出码 ⇒ dispatch 下可出现 **`ok=true ∧ converged=false`**（健康但未完）—— 两者语义不同、不矛盾，父读 `converged`（不是 `ok`）。**空 topic**：`--allow-empty` 是显式 opt-in ⇒ 此时无 `empty_topic` 阻断、②③ vacuously true ⇒ `converged === true`（「没有活要干」）；**未拆节点的新 topic 应用默认口径**（不加 `--allow-empty`）⇒ `empty_topic` 阻断 ⇒ `converged === false`。**锁不在判据内**（父自己持锁是正常态；锁释放是**收尾动作**不是收敛条件 —— 否则出现「父持锁 ⇒ 永不收敛」的顺序悖论）；**`input_drift` 不进布尔**（在飞已使 `converged=false`，漂移只进明细，辅助父决定「继续等还是 reap」）。
- **相对集 = 图中全部节点**（**不引入「目标子集」载体**）：父新增节点 ⇒ 立刻不收敛 —— 在调度信号定位下这是**正确行为**；「本轮要不要干它」的解释权留在父的上下文，不结构化进判据库。
- **形状**：**单一布尔 + 明细桶 + 派生的顶层 `needs_review` 布尔**（= 待复核桶非空）。**不选多状态枚举**：converged 与 needs_review **正交**（全 done 但有未复核的 `stale_inputs` ⇒ `converged=false` 且 `needs_review=true`）⇒ 枚举会把正交维度压扁成无语义的优先级序。
- **逐类归属**（闭集）：**收敛侧** = `cancelled` 节点 + 已复核（`inputs_reviewed`）的 stale；**未收敛侧** = `ready` 非空 / `in_flight` 非空 / 未复核的 `stale_inputs` / 任一阻断违规码（含 `cancelled_dep_active`）；**无关** = 锁、`input_drift`。⚠ 其中「`ready` 非空」**只是明细导航**（逻辑上冗余：ready 非空 ⇒ ②必假），**不是第四个子句**。
- **可操纵性的诚实口径与缓解**：父**能**把剩余节点批量标 `cancelled` 使 `converged=true` ⇒ 承认这一点，并据此把本判据**定位为调度信号**（「还有没有未完成的活」）而非**交付信号**（「这件事做完了吗」—— 后者需对照 `TOPIC.md` 的目标段，属语义理解，天然不可机判）。缓解：`cancelled` 桶**逐条列出 `{id, reason, at}`** ⇒ 父的声明与派生答案**同屏、不藏**；全标 cancelled = 全图墓碑入 git（可审计）。**真正的取消成本来自两条既有约束**（不新增机制）：`cancelled_unattributed`（`reason` 必填 ⇒ 每个取消须编理由）与 `cancelled_dep_active`（批量取消强制连带消解 ⇒ **爆炸半径在 diff 里强制展开**）。对照：**没有** cancelled 通道时父只能伪造 done（`cache_ahead` 判红）或删节点（`orphan` / `dangling` 判红）⇒ 本判据是把操纵**导入有留痕的通道**，不是新增漏洞。
- **载体与契约**：`check --json` 增 `converged`（布尔）+ `summary`（嵌套明细桶：`done` / `cancelled[{id,reason,at}]` / `in_flight` / **`input_drift`** / `ready` / `blocking` / `needs_review`）⇒ **零新增命令**、**一条命令给出全部明细**（父不必再跑 `ready --json` 才能看到漂移信息）；**退出码不扩**（唯一消费方是 LLM 父会话，看 JSON 即可；扩码要同批改 `prompts/plan.md` 与回滚清单的字节钉死串，且 exit 0 若收窄为「收敛」会破坏**中场健康检查**）；**不并入 `ready`**（调度截面 vs 收尾截面，两个语义）；**不落盘**（`converged_at` 等完成标记属**自述** ⇒ 自述 vs 派生分叉；换根场景由「新根重跑 check 得 true」天然覆盖）。
- **落地顺序（硬约束）**：cancelled 的**终态豁免**是本判据的**前置依赖** ⇒ **D9 与本判据必须同批**；`needs_review` 桶依赖 D10 的 `stale_inputs` / `inputs_reviewed` ⇒ 桶随 D10 落地填实（否则先出一个空桶）；**既有钉死点同批反转**：`tests/plan-topics-dag.test.ts` 的 E1 **逐键钉死** payload 里没有 `converged` ⇒ D11 落地必红 E1 ⇒ 该断言须**同批**按新语义改写（否则实现批会撞一个"无关"的红）。
- **迁移口径**：旧 fixture 无 `cancelled` / `input` 字段 ⇒ 行为不变（与 D9 / D10 的「可选字段、`version` 维持 1」一致）。

---

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **宿主 `subagent` + 新 agent `plan-worker` + `graph.json` 派生状态（本篇）** | **采纳** | 会话树 / 并行 / 完成唤醒 / 续接四项全部宿主内建（事实 ②③④）；写域与归属靠「前缀白名单 + 单一写者 + 独占锁 + 事后核对」四层，明确不声称「权限保证单写者」；判据落在唯一真实闸门 `bun test tests/` |
| `plan` 改 `mode: "all"`，子会话即 `plan` | 否决 | `build` 的 `subagent: allow` ⇒ build 可拉起带 `delegate`/`question` 的 plan 会话 ⇒ 绕过 `plan_ref` 强制与父仲裁；深度允许孙会话；子继承 plan 全部工具 |
| 复用 `delegate` 通道派子会话 | 否决 | `workRoot` 全局单槽 ⇒ 并行被拒；语义是工程实施（scope / role_class / 证据门控）；delegate 后端不进宿主会话树 ⇒ 拿不到父子关系与完成唤醒 |
| 自建 plan 派发插件（仿 delegate） | 否决 | 重复造会话树 / 唤醒 / 续接 / 台账 / 深度限制五件套，且与 delegate 争同一槽位；与本仓「唯一门控边界」纪律相悖 |
| session id 编进路径（`<topic>/<session-id>/`） | 否决 | 路径不可读、git 噪音、跨机器是死指针；并行隔离应由**写域 + 独占**保证，不靠路径编码（**指版本化路径**；运行态落点含 session id 不在此射程内，见 D5） |
| 节点状态写在 `graph.json` 自述字段 | 否决 | 自述状态与磁盘事实可分叉 ⇒ 「派生而非手抄」范式被破坏；join 判据变成散文（D9 的 `cancelled` 是**声明意图字段**、不是 `status` 自述，不在此行射程内） |
| 子会话自派生子会话（孙层） | 否决（本期） | 破坏「父是唯一仲裁者」；`subagent_depth: 2` 允许但不需要；本期 `plan-worker` 的 `subagent` 直接 deny |
| **取消用声明式意图字段 `cancelled`（`graph.json`）+ `status` 派生第四态（D9）** | **采纳** | 与 `deps` / `owner` 同族：声明输入而非自述结果（D2 派生公式本就消费声明输入）；取消留痕在唯一载体内，入 git、可跨会话重建（D6）；门控 = block + 强制消解 ⇒ 图不会停在坏状态 |
| 取消用 `status` 自述 / 磁盘哨兵 `CANCELLED.md` / 删节点改 deps / 软边 `deps_soft` | 否决 | 分别是「已否决的自述状态」「门控语义外移 + 伪造最隐蔽（混入 worker 写域）」「丢失放弃记录 + 孤儿/悬空双雷，且 D6 重建分不清『从未存在』与『被放弃』」「混淆『本就可选』与『被放弃』，且不解决节点仍被派发」 |
| **在飞 = 未闭合 attempt 派生（台账唯一真源）+ 判活读时（mtime）+ 接管显式确认（D10）** | **采纳** | 零 schema 变更即可表达在飞；与 D9 的 cancel 事务（强制闭合 attempt）同源；落盘 ⇒ D6 重建可读；判活读时、接管需确认 ⇒ 不引入双活体写者 |
| 在飞用 `claimed_by{session}` 入 graph.json / 运行态 claims.json / 节点目录 `DISPATCH.json` / `status` 扩枚举 / 从 `TODO.md` 派生 | 否决 | 分别破 D5（活 session id 入版本库）/ 第二本账必然分叉（且 D6 下新根只信 graph.json）/ 落在**子的写域**且无哈希钉（违反 D1 单一写者）/ 自述状态（D2 选项表已否决）/ 测的是产物进度不是归属（破 E4 重建路径，且 spawn→首写窗口失明） |
| **fence = 节点级输入投影快照（`attempt.input`）+ checker 逐成分 diff（`stale_inputs`）（D10）** | **采纳** | 只有自己的输入变才触发（兄弟免疫）；存**成分**而非合并哈希 ⇒ 能指名「变了什么」；判定收敛到 checker ⇒ 无 TOCTOU；与 D9 的「消解下游」天然传播 |
| fence = 图级结构哈希单用 / monotonic revision / cancel 当唯一 fence / 产物自动作废 / 复核无写点 | 否决 | 分别：兄弟变更 ⇒ 全体误报（alert fatigue）/ bump 无机械强制 ⇒ 纪律型字段（忘 bump 即静默失效，比死字段更糟）/ **不覆盖非 cancel 改图**（那正是本项的问题定义）/ 与 D2 派生范式冲突且粒度过粗 / 不可机判（本仓唯一闸门是 `bun test tests/`） |
| **converged = 零阻断 ∧ 全终态（`done` / `cancelled`）∧ 无在飞；纯派生、单一布尔 + 明细桶、锁无关（D11）** | **采纳** | 把已在的四类事实（终态 / 在飞 / 违规 / 可派）聚合成一个可读答案 ⇒ 父一条命令知道「还差什么」；纯派生 ⇒ 与 D2 同范式、无自述分叉；锁无关 ⇒ 避免「父持锁 ⇒ 永不收敛」的顺序悖论 |
| converged 相对「父声明的目标子集」（scope 载体） | 否决 | 父可**零留痕**改写 scope 使 converged=true（操纵性高于 cancelled 通道）⇒ 与 D9 形成**免审计双退路**；载体要么第二本账（违反对运行态第二本账的一贯否决）要么散文解析（机判脆） |
| converged 用多状态枚举（converged/pending/blocked/needs_review） | 否决 | converged 与 needs_review **正交** ⇒ 枚举把正交维度压扁成无语义优先级序；扩维度要改闭集；D2 两维正交的追认先例直接反对 |
| 退出码扩 `4` = 未收敛 / 新子命令 / 并入 `ready --json` / 落盘 `converged_at` | 否决 | 扩码要同批改三处文本（其一不在 architect 写集）换**零收益**（唯一消费者是 LLM，看 JSON 即可），且 exit 0 收窄为「收敛」会破坏**中场健康检查**；新命令增父的记忆负担；并入 `ready` 让调度截面变全量判据；落盘 = 自述 vs 派生分叉 + schema 迁移，而换根场景由派生重算天然覆盖 |

---

## 后果 / 代价

**正面**
- 并行与「谁在做哪件事」有**单一真源**（`graph.json` + `.rddf/state/plan-sessions/<session_id>.json`，每会话一文件），不靠散文维持。
- 依赖判据变成**脚本可判**（D2 三判据），且落在 `bun test tests/`（本仓唯一真实闸门）。
- 子会话进度跨会话存活（D6 重建路径），父会话死亡不丢进度。
- 多根 plan 会话并行零冲突（同 topic 由独占锁挡）。
- 「主动放弃」成为**一等状态**（D9）：取消可表达、可跨会话重建、图不会停在坏状态（`cancelled_dep_active` 不变量）。
- 重复派发有**机械闸门**（D10）：`claim` 拒已有未闭合 attempt 的节点 + `duplicate_open_attempt` 阻断码 ⇒ 「同一节点两个 worker 同时写」从协议纪律变成机械事实。
- 改图对在飞产物**可判且能指名**（D10）：`stale_inputs` 逐成分 diff（`brief` / `deps` / `deliverables`）+ 复核豁免写点 ⇒ 父不必猜「这批产物还作数吗」。
- 父可**机械判**「还有没有未完成的活」（D11）：`converged` 一条命令给出答案 + 七桶明细（谁 done / 谁被取消 / 谁在飞 / 谁有输入漂移 / 还有谁可派 / 哪些阻断 / 哪些待复核）⇒ 换根会话能立刻判断「这活是不是完了」。

**负面 / 代价**
- 新增一个 agent（`plan-worker`）+ 一个 prompt 文件 ⇒ 触发本仓「新增文件闸门」的**真实**部分：`prompts/plan-worker.md` 会被 `tests/config-guards.test.ts:1463` 的平铺清单命中；**本文件（`docs/adr/**`）不在其机械覆盖面内**（该闸门用 `readdirSync` 平铺，`docs/` 子目录是**已知盲区**，`tests/config-guards.test.ts:1491-1494` 自述）⇒ 按闸门注释的三分法仍需为「`docs/adr/` 新文件」**显式做一次决定**（本篇把它登记进残留 #5）。
- `prompts/plan.md` 的 `<!-- capability:plan -->` 投影块必须与配置同步（AC23 派生守卫）⇒ 改 `edit` 白名单必红一次。
- 文档投影面增加：`docs/MULTI-AGENT-DESIGN.md` 的 agent 卡片 / 文件树 / 委派矩阵、`AGENTS.md` 的 agent 列举、`docs/SUBAGENT-ORCHESTRATION.md` 的通道描述。
- 「单写者」在**权限层不可保证**（事实 ⑦）⇒ 依赖协议 + 事后核对；这是本设计**已知的最弱一环**。
- **派发事前闸门本期不建**（事实 ⑩ 表明技术可行 ⇒ 这是范围取舍，不是能力限制）：「deps 未完成不得派发」本期只有**事后复核**（D2 判据 2 + V09/V10），父误派发的代价是一次子会话浪费（可经 D6 重建路径回收），不是状态损坏。
- D9 的取消需**一次原子写**完成三件事（补 attempt 的 `finished_at` / 置标志 / 消解下游）⇒ 父手写 JSON 易漏改（实现须给 `cancel` CLI：原子写 + 消解报告）；代价 = schema 一个可选字段 + 派生第四态 + 三个阻断违规码。
- D10 新增三个 CLI（`claim` / `close` / `cancel`）+ 一把 per-topic 写互斥锁 + 两套投影（节点级输入投影 / 图级结构哈希）⇒ 实现面显著变大；且 attempt 台账语义变复杂（**未闭合 = 在飞**，闭合 = 离开在飞的唯一出口）。
- D11 的 `check --json` payload 变复杂（`converged` + `summary` 七桶 ⇒ **字段集成为契约**）；且 `converged` 依赖 D9 的 cancelled 终态 ⇒ **二者必须同批**；`needs_review` 桶依赖 D10 ⇒ 桶先空后实（若分批）。

**风险**
- 子会话写越界（配置层只能到 topic 树粒度）⇒ 靠收尾 `git status` 路径核对发现，**不能**事前拦。
- 同 topic 两个根会话并发 ⇒ 靠独占锁（原子 `mkdir`）；锁的僵尸态（持有者已死）**只能靠人**判。
- 父上下文被多个子结果灌满 ⇒ 靠约定（子最终消息只回指针 + 摘要，全文在 `RESULT.md`）⇒ **prompt 层约定**，非机械闸门。
- 上游语义漂移：事实 ①②③④⑤⑦ 全部押在宿主行为上 ⇒ 必须有语义锚点（V15），否则上游一改即静默击穿本篇的降级表述。
- 取消**无法中断**在飞 worker（无 in-flight 机制，事实 ⑤）⇒ 取消后 worker 仍可能继续写产物；派生态短路（cancelled 优先于 done）⇒ 不影响门控，产物作为审计痕迹保留。
- **僵尸 attempt**：父在 `claim` 与 spawn 之间崩溃 ⇒ 节点永久显示在飞 ⇒ 只能 reap（**人工确认**，与 D7 僵尸锁同一 posture）。
- **写互斥仍是协议级**（D10）：per-topic 短锁只约束经 CLI 的写者 ⇒ 手写 `graph.json` 依然能绕过互斥（与 D7 同威胁级，不声称权限强制）。
- **fence 只覆盖该节点的三个输入成分**（BRIEF / deps / deliverables）⇒ 兄弟节点与图结构其他部分的变化**不** fence（设计如此，非缺陷）。
- **`converged` 可被父操纵**（批量标 `cancelled`）⇒ 已按「调度信号」定位并以「`cancelled` 桶逐条列出 `{id, reason, at}`」缓解（声明与答案同屏、可审计）；**若将来需要「交付信号」**（这件事做完了吗）⇒ 须引入 `TOPIC.md` 目标段的语义理解 ⇒ 不可机判 ⇒ 不得假装可判（残留 #13）。

**回滚口径**（三步，回到现状）
① 从 `opencode.jsonc` 移除 `plan-worker` 条目，并把 `plan` 的 `edit` 白名单去掉 `.rddf/plan-topics/*`；② 删除 `prompts/plan-worker.md` 并从文件清单守卫里撤掉；③ 保留 `.rddf/plan-topics/**` 已落盘内容（版本化产物，无副作用），`.rddf/state/plan-sessions/`（每会话一文件形态）停止写入即可。
**D9 增补的回退**：还原本增补 + 实现批回退 schema 扩展即可 —— `cancelled` 是**可选**字段、旧数据永不派生 cancelled ⇒ **回退无损**（无运行态产物需回滚）。
**D10 增补的回退**：同 D9 口径 —— `input?` / `inputs_reviewed?` 均为**可选**字段、维持 `version: 1`、旧代码对未知键静默忽略、短锁路径被 `.gitignore` 覆盖（无残留产物）⇒ **回退无损**。
**D11 增补的回退**：**纯派生、零 schema、零落盘**（`converged` / `summary` 只活在 `check` 输出里）⇒ **回退无损**（无运行态产物、无需数据迁移）。

---

## Verification（可勾选验收判据，前瞻）

> 判据面向实现完成后的可观察事实；编号 V01–V15（初版）+ V16–V21（D9 增补）+ V22–V29（D10 增补）+ V30–V36（D11 增补）。**未标注**「人工」的项应可写成命令或断言。

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
| V07 | `.gitignore` 双向断言：`git check-ignore -v .rddf/state/plan-sessions/<sample>.json` 退出 0（**目录形态**）；**旧单文件路径 `.rddf/state/plan-sessions.json` 不再被 ignore**（反向断言，防形态回退）；`git check-ignore -v .rddf/plan-topics/<t>/graph.json` 退出 **非 0** | `git check-ignore` |
| V08 | checker 负向 fixture 进 `bun test tests/`：成环 / deps 未完成即判派发 / join 无交付物 / 同节点两个 owner / node id 越界（`..`、绝对路径、超长）/ `nodes/<id>/` 存在但 `graph.json` 无对应节点 | 单测 |
| V09 | **派生判据可机判（`progress` / `status` 正交）**：`progress=complete` 的节点集合 == 「`TODO.md` 全勾 且 `RESULT.md` 有实质正文」的节点集合；`status=done` 的节点集合 == 「`progress=complete` ∧ deps 全 `done` ∧ deliverables 非空且存在」的节点集合。⇒ 子**先干完而依赖未完成** ⇒ `progress=complete` / `status=blocked_by_deps`，**是合法状态**，checker 不得报错 | checker 单测 |
| V10 | 写域核对命令可跑：给定 topic 与节点清单，输出越界路径列表（`git status --porcelain` 路径前缀 ∉ 该节点目录 ⇒ 列出）。⚠ **单飞口径**：git 不记录写入者 ⇒ 并行多 worker 时**无法按节点归因** ⇒ 并行下只做 **topic 级 union 核对**；节点级核对仅在单飞时可信（归因缺口见残留 #10） | 脚本 + 单测（fixture 造越界文件） |
| V11 | 独占锁：`mkdir .rddf/state/plan-topics/<slug>.lock` 原子成功者成为 owner；第二个根会话对同 topic 的写入被拒（**人工**：需两个真实 plan 会话） | 人工 e2e（登记为半自动） |
| V12 | e2e 探针（本仓无 e2e 框架 ⇒ **人工**）：① 根 plan 会话同一轮 `background` 派两个 `plan-worker`；② 两子会话 `parent_id` == 根会话 id（`opencode.db:session_v2` 可查）；③ 子会话 `$OPENCODE_SESSION_ID` == 子会话自己的 id（**本机已实测**：子内该变量为其自身 id）；④ 两条完成合成消息都到达父会话；⑤ 父用 `subagent(sessionID=…)` 续接其中一个成功，且该子能读到自己的 `TODO.md`；⑥ 父会话死亡后新根会话**不能**续接旧子（宿主 `parentID` 校验）⇒ 只能按 node 重建 | 人工 e2e |
| V13 | 配置生效：重启后 `opencode debug agents` 列出 `plan-worker` 且 `mode=subagent`；`plan` 的工具清单含 `subagent` | `opencode debug agents` |
| V14 | 既有 ADR 未被静默改写；`prompts/plan.md` 的既有口径（`.rddf/plans/<slug>.md`、`plan_ref` 规则）保持原样；`docs/MULTI-AGENT-DESIGN.md` 的 agent 计数与卡片同步 | diff 复核 + 文档计数断言 |
| V15 | **上游语义锚点**：前置事实 ①②③④⑤⑦ 各有 `scripts/check-upstream-anchors.sh` 锚点（**⑤ 两条**：权限解析处咨询 agent 配置 + 建会话绑定 `agent: agent.id`；**⑥ 是本仓语义**（delegate 单槽）无上游锚点，由 `tests/delegate-core.test.ts` 覆盖）。锚点只写**语义断言 + 文件 + grep 模式**，**不写行号、不钉函数名**（2026-11-25 P5 假红事故的教训：函数名是易变指针，假红会阻断全仓提交）。⚠ **两处已知不可锚**：①「建会话不传 per-session permissions」无法正向断言 ⇒ 上游若新增该通道，锚点**不报警** ⇒ 残留 #1 的前提须人工重估；② P5 的判别力依赖 `agent?.permissions` 在上游单点出现（已核实）⇒ 上游引入第二处即无声失效 | `bash scripts/check-upstream-anchors.sh`（锚点基线 29 → 30） |
| V16 | **取消派生**：`cancelled` 标志 ⇒ `deriveStatus` 返回 `"cancelled"`（无论磁盘有无 TODO/RESULT/交付物）；其下游派生为 `blocked_by_deps` 而非 `done` | checker 单测 |
| V17 | **派发排除**：cancelled 节点即使 deps 全 done 且 `BRIEF.md` 存在，也不出现在可派集合 | checker 单测 |
| V18 | **强制消解**：取消有活跃下游的节点而不消解 ⇒ `check` 对**该取消节点报恰好一条** `cancelled_dep_active`，并在同一条里点名**全部**活跃下游（**不是每条边一条**）（exit ≠ 0）；级联或摘边后 `final` 口径零阻断（exit 0），兄弟分支不受影响 | checker 单测 |
| V19 | **完整性**：`reason` 缺失或 `by ≠ "parent"` ⇒ `cancelled_unattributed`；存在未闭合 attempt（缺 `finished_at`）⇒ `cancelled_open_attempt` | checker 单测 |
| V20 | **缓存兼容**：cancelled 节点缓存写 `"done"` ⇒ `cache_ahead`（阻断）；写 `"pending"` ⇒ 仅 `cache_behind`（info，exit 0）⇒ 缓存判据零改动 | checker 单测 |
| V21 | **迁移**：无 `cancelled` 字段的 v1 fixture 全量过既有 `plan-topics*.test.ts`；`final` 口径下 cancelled 节点缺 `BRIEF.md`/交付物**不报** `missing_brief` / `missing_deliverable` | 回归 + checker 单测 |
| V22 | **判据口径分阶段**：`check --phase dispatch` 在健康的多级 DAG 上 exit 0 —— 未到期节点缺 `BRIEF.md`、未完成节点缺交付物、缓存滞后（`cache_behind`）**均不阻断**；`--phase final` 才全量报（`missing_brief` / `missing_deliverable`）；默认 `final`（违规枚举口径不变） | checker 单测 + CLI 退出码断言 |
| V23 | **严重度分向**：缓存声称完成而磁盘不支持 ⇒ `cache_ahead`（**阻断**）；缓存落后于磁盘 ⇒ `cache_behind`（**info**，不改变退出码）；`--json` 每条违规带 `severity`，`ok` 只看阻断项 | checker 单测 + CLI `--json` 形状断言 |
| V24 | **在飞排除派发**：节点带未闭合 attempt ⇒ 不出现在可派集合；`ready --json` 的 `in_flight` 含 `{node, started_at, liveness_stale}`，顶层另有独立的 `input_drift[]`（投影漂移，含**在飞** attempt 的漂移，**info 不阻断**） | checker 单测 + CLI 形状断言 |
| V25 | **claim 互斥**：首次 `claim` exit 0 且 `graph.json` 追加 attempt（含 `input` 快照）；二次 `claim` exit ≠ 0 且 `graph.json` **逐字节不变**；并发 `claim` 恰好一个 exit 0（⚠ 实现批注意：该并发用例**易 flaky**，须用确定性编排而非裸并发） | CLI 单测（并发用例） |
| V26 | **close 与 reap**：`close` 后节点重回可派集合；对无未闭合 attempt 的节点 `close` ⇒ exit ≠ 0 且**无写**；reap 须显式确认（无确认即接管 ⇒ 被拒） | CLI 单测 |
| V27 | **stale_inputs 指名**（**已闭合 attempt**）：改 deps ⇒ `final` 口径恰好一条 `stale_inputs` 且 detail 含 `deps`；改 BRIEF ⇒ 含 `brief`；改 deliverables ⇒ 含 `deliverables`；**兄弟节点变更不触发**（兄弟免疫） | checker 单测 |
| V28 | **豁免与迁移**：stale + `inputs_reviewed` ⇒ `final` exit 0；缺 ⇒ exit ≠ 0；`dispatch` 口径**不产生该码**、两种情形都不阻断；无 `input` 字段的旧 fixture 全量过既有例；畸形 `input`（deps 非数组等）⇒ `schema_invalid`（exit 3）；**cancel 后给 cancelled 节点 BRIEF 补写取消理由 ⇒ `final` exit 0**（快照冻结生效） | 回归 + checker 单测 |
| V29 | **溯源哈希**：`precheck.graph_rev` 被写入，且 == 对**图结构投影**（节点 id / deps / deliverables / brief 哈希，**排除** `status` / `progress` / `attempts`）重算的 sha256；仅回填缓存（join）时该哈希**不变** | CLI 单测（`check` 输出 + 重算比对） |
| V30 | **收敛（纯链）**：多级链全 done ⇒ `converged === true`、`done` 计数 == 节点数、exit 0，且 `summary` 其余**六**桶（`cancelled` / `in_flight` / `input_drift` / `ready` / `blocking` / `needs_review`）**全空** | checker 单测 + CLI `--json` 形状断言 |
| V31 | **未收敛的两种典型**：链首完成 ⇒ `converged === false` ∧ `ready == [a2]` ∧ 其余桶空；节点带未闭合 attempt ⇒ `in_flight` 含该节点 ∧ `converged === false`；**同一场景在 `--phase dispatch` 下 ⇒ `payload.ok === true ∧ payload.converged === false`**（**刻意的不一致**，见定义条 —— 断言它以防实现批把它当 bug「统一」掉） | checker 单测 |
| V32 | **取消即收敛**：取消叶子分支（带 reason）+ 其余全 done ⇒ `converged === true` ∧ `cancelled` 桶**逐条列 `{id, reason}`** ∧ cancelled 节点豁免 `missing_brief`（`final` exit 0） | checker 单测 |
| V33 | **阻断即未收敛**：成环 / `cache_ahead` / `cancelled_dep_active` 任一 ⇒ `converged === false` ∧ `blocking` 桶**指名节点** | checker 单测 |
| V34 | **锁无关**：全 done + 锁未释放 ⇒ `converged === true`（锁不进判据，D4 语义保持）；`check` 前后 `graph.json` 逐字节不变 | checker 单测 + 只读断言 |
| V35 | **待复核层**（依赖 D10）：全 done + 已闭合 attempt 的 BRIEF 被改且无 `inputs_reviewed` ⇒ `converged === false` 且 `needs_review` 桶指名节点与成分；补 `inputs_reviewed` ⇒ `converged === true` | checker 单测（V28 姊妹判据） |
| V36 | **「绿着但不收敛」**：节点**已 done** 但其末条 attempt **未闭合**（父死于 join 前）⇒ `converged === false` ∧ `in_flight` 含该节点 ∧ **exit 0**（在飞不是违规）⇒ 父的出口是 `close` / `reap`（闭合后 ②③ 恢复 ⇒ `converged === true`） | checker 单测 |

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
| 取消后 worker 仍继续写产物 | 无 in-flight / 中断机制（事实 ⑤：权限与生命周期都是 agent 级静态） | 派生态短路（cancelled 优先于 done）⇒ 不影响门控；产物作为审计痕迹保留 |
| 「完成后取消」是否合理 | 属策略判断，非机械可判 | 本篇**禁止**（只允许取消**派生**非 done 的节点；执行由 `cancel` CLI 硬拒）⇒ 重开需求落残留 #6 |
| 取消节点上的 attempt `finished_at` 读作什么 | 无独立字段可区分「废弃闭环」与「正常完工」 | 台账读法：**废弃闭环时间**（非正常完工）—— 属已知审计缺口，与「越权无法归因」同级 |
| 在飞 worker 是否还活着 | 宿主 session 探针**生产不可用**（`ctx.session.get` 对已死会话仍返回记录 ⇒ 探针恒真，`plugins/role-gate.ts:159-161`） | `TODO.md` mtime 新鲜度（读时 `stale`，仅显示）；接管须显式确认（D10） |
| fence 覆盖不到的变更（兄弟节点 / 图结构其他部分） | 「该节点的输入」按定义只含 BRIEF / deps / deliverables | 设计如此（非该节点输入的变更不 fence，兄弟免疫）；真被影响时由父在复核里判断 |
| attempt **闭合**（`finished_at`）的真实性 | 父写台账**无磁盘交叉验证**（session 探针生产不可用；无围栏可判旧持有者是否仍活） | git diff 留痕（每次闭合是一行 diff）+ 与「越权无法归因」同级的审计缺口；台账防的是**健忘/崩溃的父**（压缩后重复派发），不防恶意父（单写者信任模型内，能补 `finished_at` 的父也能删整个 topic） |
| 「这件事**做完了吗**」（交付信号） | 需对照 `TOPIC.md` 目标段的**语义理解**（「本轮要什么」）⇒ 不可机判 | D11 只回答「**还有没有未完成的活**」（调度信号）；`cancelled` 桶逐条列出 `{id, reason, at}` ⇒ 父的取消声明与派生答案同屏、可审计（残留 #13） |

---

## 残留（登记，不在本篇处理）

1. **每节点精确写域**（子只能写自己的 `nodes/<id>/`）需 per-session 权限；宿主 `subagent` 不传 permissions（事实 ⑤）⇒ 只能自建派发通道（本期否决）⇒ 留 backlog。
2. **派发事前闸门**（deps 未完成即拒绝派发）：**技术上可行**（事实 ⑩ —— `plugins/subagent-contract.ts` 的 L1 门已挂在同一钩子上；只需给 plan 的 subagent prompt 加结构化序言 + 钩子内读 `graph.json` 判派生状态与锁归属）。本期为范围决定不做 ⇒ 落 backlog，触发条件 = 误派发/误 join 实际发生。
3. `plan` 与 `plan-worker` 的 **prompt 重复**（`prompts/plan.md` 与 `prompts/plan-worker.md` 的职责段）会随演进漂移 ⇒ 靠守卫断言两者「共同纪律段」一致（本期只登记，不实现）。
4. `plan-topics/**` 目录形态与 rdd-workflow 产品侧 `.rddf/` 约定（`improvements/` / `plans/` / `roadmap/`）的边界需产品侧确认（跨仓，见 `docs/rdd-workflow-product-issues.md` 体例）。
5. **`docs/adr/` 落在「新增文件闸门」的平铺盲区**（`tests/config-guards.test.ts:1491-1494` 自述 `readdirSync` 平铺、子目录整树被过滤）⇒ 本篇及后续 ADR 文件的归属**必须显式做一次决定**：要么在 `docs/adr/` 自建清单守卫，要么接受「靠 review 流程兜底」。本篇选择后者（登记），因为 ADR 文件由 architect 单写 + 双审流程覆盖。
6. **重开 / un-cancel**：撤销已取消节点、撤销**已完成**节点（D9 禁止「完成后取消」），本篇不支持 ⇒ backlog（触发条件 = 实际出现返工需求）。
7. **in-flight 与取消的中断**：无 in-flight 状态 ⇒ 取消**中断不了**在飞 worker；`cancelled_open_attempt` 只保证「事后可判」（attempt 未闭合）⇒ 与「派发事前闸门」（残留 #2）同批考虑。
8. **逐边策略**（`on_dep_cancel`）：本篇用「取消时逐下游显式消解」零 schema 替代 ⇒ 真需要边级策略时再叠加 `deps_meta`（**defer**，非永久否决）。
9. ✅ **已闭合（D9/D10/D11 批；2026-11-26 复核）** —— 回滚清单 `.rddf/rollback/plan-topics.json` 的 `edits[]` 已逐字节钉死 `prompts/plan.md`（9 处）与 `docs/SUBAGENT-ORCHESTRATION.md`（2 处）⇒ drill 复跑全绿（1127 例 / 0 fail），且 `last_drill.content_hash` 已按回滚登记表（`ADR-rollback-manifest-enforcement`）的 V8 判据回填；证据见 `.rddf/reviews/adr-plan-multi-session-collaboration-residue-closure.md`。**原登记**：`prompt 与回滚清单的同步`：`prompts/plan.md` 的「多会话协作」整节与 `docs/SUBAGENT-ORCHESTRATION.md` §2.3 被 `.rddf/rollback/plan-topics.json` **逐字节钉死**（`find` 字符串）⇒ 同步它们**必须**同时改该清单，而该清单不在 architect 写集 ⇒ 归实现批（builder 面，同批一并处理）；D9 的 schema 在代码落地前**不得**先写进 prompt（否则 prompt 先于代码承诺）。
10. **`scope-check` 的按节点归因**：git 不记录写入者 ⇒ 并行多 worker 时无法判定「哪个文件是哪个 worker 写的」⇒ 节点级核对在并行下必然假阳性 ⇒ 现行口径 = **单飞时节点级、并行时 topic 级 union**（见 V10）；真正的归因需要写入者自证（不可行）或 per-node 写域（不可行，见残留 #1）⇒ 留 backlog。
11. ✅ **已闭合（D9/D10/D11 批；2026-11-26 复核）** —— `input` 快照由 `claim` 亲自产出（`scripts/plan-topic-check.ts:462` 的 `currentInputProjection`），`stale_inputs` 只在 check 侧产出（`lib/plan-topics.ts:691`）⇒ 结构上不可能早于 claim 写入点；判据 V25 / V27 / V28 已通过（V25 的并发子句已由本仓 A4 补进测试套件 `bun test tests/`）；证据见 `.rddf/reviews/adr-plan-multi-session-collaboration-residue-closure.md`。**原登记**：`D10 的落地顺序约束`：`input` 快照与 `stale_inputs` 判据**不得早于** `claim` 写入点落地 ⇒ 否则 `input` 退化为「父手写的纪律型字段」（无机械强制 ⇒ 忘写即静默失效）⇒ 与 `claim` / `close` / `cancel` CLI 同批实现。
12. **自动接管（TTL 到期即重派）不做**：worker 对 `nodes/<id>/` 的写**没有** `claim_gen` 式围栏 ⇒ 误接管制造双活体写者（比现状更糟）⇒ 与 D7 僵尸 topic 锁同一 posture（人确认）。要改这条需要先有「写围栏」机制（残留 #1 的 per-node 写域）。
13. **交付信号（「这件事做完了吗」）暂不提供**：D11 的 `converged` 只回答「还有没有未完成的活」（调度信号）⇒ 「本轮目标是什么」仍靠 `TOPIC.md` 目标段的语义理解（不可机判）⇒ 若将来要机判，需要一个**目标集合载体**，但那会给父一条免审计的收敛退路（与 D9 的取消通道构成双退路）⇒ 触发条件 = 真实出现「需要机判交付完成」的需求。

---

## 实施记录

> 初版（2026-11-20）的 V01–V15 逐项验收证据见 `.rddf/reviews/plan-multi-session-collaboration-verify.md`（verifier，第 2 轮 `pass`）与 `.rddf/reviews/plan-multi-session-collaboration-e2e.md`（人工 e2e，含未执行项与被证伪项的如实登记）；**逐条实测数据不在本文件维护**（过程日志不进 ADR 正文）。D9 增补的审稿记录见 `.rddf/reviews/adr-plan-multi-session-collaboration-review-d9-cancel.md`，D10 增补见 `.rddf/reviews/adr-plan-multi-session-collaboration-review-d10-inflight.md`，D11 增补见 `…-review-d11-converged.md`，D5 修订见 `…-review-d5-persession.md`。
>
> **D9 / D10 / D11 / D5 的实现批（2026-11-25）**：判据实现 = `lib/plan-topics.ts` + `scripts/plan-topic-check.ts`（新增 `claim` / `close` / `reap` / `cancel` + 两口径 + `converged` / `summary`）；**验收**见 `.rddf/reviews/plan-topics-d9-d10-d11-verify.md`（原判 `needs-revision`，唯一未闭合 = F-1）与 `…-f1-closure.md`（追加复核即闭合；原报告按「历史不回改」保持原样）⇒ 本批可判 `pass`；真宿主**单会话**用例见 `.rddf/reviews/plan-topics-pt1-runtime.md`；版本史 `docs/CHANGELOG.md` v2.75；**当前态快照**见 `docs/architecture/plan-topics-topic-model.md`。⚠ **V11 / V12 标注「人工」的双会话场景（同一轮并行派发 / 续接 / 父死重建）仍未执行**。
>
> **初版实施期确认的补充裁决**（完整 14 条见 `.rddf/roadmap/plan-multi-session-collaboration.md` §5 —— ⚠ **该节是初版实施期的历史记录**，其中**第 1 条**（「`plan-sessions.json` 精确单文件，不扩 `.rddf/state/` 整目录」）**已被 2026-11-25 的 D5 修订取代**（改为每会话一文件，见 D5 落地硬约束 ⑧）；引用该节时以此为准）：`edit` 白名单用带前导 `*` 的形态（相对 / 绝对两种匹配口径下都成立）；`plan-worker` 的 shell 白名单**无** `bun` / `node` ⇒ checker 只能由父 `plan` 会话跑；锁补了**释放**协议（全节点 done ⇒ `rmdir`，不写释放 = 默认死锁）。
>
> **两条审计缺口**（实施期确认仍成立）：① **父会话先死、子会话仍活 ⇒ 双写者**（子权限是 agent 级静态，孤儿子仍可写；唯一缓解是协议 —— `TODO.md` 头写 `owner_session_id`）；② **越权无法归因**（`attempts[]` 按 D5 不存 session id ⇒ 只能判「被改过」，判不出「谁改」）。
>
> **上游语义漂移事故（2026-11-25）**：`scripts/check-upstream-anchors.sh` 的 **P5 锚点假红** —— 上游把 `permission.ts` 的 `merge(agent?.permissions, …)` 重构为 `PermissionPolicy.fromRules(agent?.permissions ?? …, session.permissions ?? [])`，**语义未变**（子会话权限仍 = agent 配置 + session 级覆盖；`subagent.ts` 的 `sessions.create({ …, agent: agent.id, … })` 仍不传 permissions），但锚点钉的是**函数名** ⇒ 假红 ⇒ **提交门（`bun test tests/` + 本脚本）全仓不可提交**（与 2026-11-23 的 AC10④ 事故同型）。处置：P5 改钉**语义 token**（`agent?.permissions`）并新增 **P5b**（子会话按 `agent: agent.id` 建会话 ⇒ 权限随之取 agent 配置）⇒ 30/30 全绿；同时把本篇前置事实里的 upstream **行号**引用全部去掉（改为文件 + 语义形状），与「锚点只写语义、不写行号」的口径对齐。
