# RESULT — n1：现有派发通道盘点

> 类别标注：**〔事实〕** = 本仓文件可直接引用（带 `path:line`）；**〔推断〕** = 由事实推出、本仓无直接断言；**〔建议〕** = 仅供父会话/n2–n7 参考，非本节点结论。

## 0. 结论先行（布尔陈述）

**〔事实/判定〕`build` 主会话不存在“受门控的并行实施通道”。**

拆成两个可分别核对的布尔量：

| 命题 | 值 | 依据 |
|---|---|---|
| `build` 能否调用 `delegate` / `dispatch` / `sessions` / `suspend` / `cancel` | **否** | 顶层五项全 `deny`，`build` 的 agent 块未覆写任何一项 ⇒ 继承 deny（`opencode.jsonc:30-34`、`opencode.jsonc:43-113`） |
| `build` 是否存在“能写代码且被登记/有槽位/有差集证据”的子会话通道 | **否** | 唯一子会话出口是宿主 `subagent`（`opencode.jsonc:102`），而全部 8 个 `mode:"subagent"` agent 的 `edit` 均为 `deny` 或仅限 `.rddf/plan-topics/*`（`opencode.jsonc:1491-1494`、`opencode.jsonc:1082`） |

因此“并行实施”对 `build` 不是“被单槽挡住了”，而是**这条通道根本不在它手上** —— 与 `front` / `plan` 的处境不同（它们有 delegate，只是被单槽限流）。

〔必须上报〕`build-gap-no-gated-channel` —— 这是本节点要回答的缺口本体：不是“没有并行”，是“没有任何受门控的实施派发权”。

## 1. 通道清单表

> 7 列逐条给实质内容，无「同上」。第 6 行是**旁路**（不是派发通道，但确实给 build 侧提供了一条写盘路径），列出来是为了让“缺口”的边界诚实。

| # | 通道 | 机制 | 能做什么 | 不能做什么 | 权限依据 | 写隔离语义 | 并发语义 |
|---|---|---|---|---|---|---|---|
| 1 | 宿主 `subagent` | opencode 内建工具；建子会话并原生设 `parentID`，完成后合成消息回父（`docs/adr/ADR-plan-multi-session-collaboration.md:14` 事实②③） | `build` 可拉起 `explore` / `librarian` / `oracle` / `metis` / `critic` / `general` / `context-builder` / `plan-worker`（`opencode.jsonc:102` 字符串 `allow` ⇒ 资源 `*`） | 目标不能是 `mode:"primary"` 的 agent（宿主拒绝，`…multi-session….md:14` 事实①）；子会话**不做工程写**（无 `edit` 权限/仅 topic 树）；无台账、无 workRoot 槽位、无 `git status` 差集、无停机证据（`docs/adr/ADR-plan-delegate-engineering-session.md:29`） | 调用方 `subagent: "allow"`（`opencode.jsonc:102`）；被调方权限取**自身 agent 配置**（`…multi-session….md:14` 事实⑤，上游语义，本仓 `scripts/check-upstream-anchors.sh` 有锚点） | 静态 agent 级；无 per-session 覆盖（事实⑤）；`plan-worker` 的 `edit` 是**前缀**白名单 `.rddf/plan-topics/*` ⇒ 只能到 topic 树，不能到 node（事实⑦） | 无槽位、无配额；只受 `subagent_depth: 2`（`opencode.jsonc:6-8`）约束；同轮可多开（`…multi-session….md:67-71`） |
| 2 | `delegate`（同步） | `plugins/delegate.ts:15` 注册的工具；建后端 session 后同步等结果（`lib/delegate-core.ts:45`） | `front` / `plan` 派 `build`（可写实施）或 5 个只读知识后端（`lib/delegate-core.ts:105`）；同步面一次一个工作树 | `build` 自身不可用（顶层 deny）；同一 `workRoot` 上不允许第二个活跃后端（`lib/delegate-core.ts:154`）；`plan` 派 `build` 必须带**存在**的 `plan_ref`（`lib/delegate-core.ts:2340`、`:1358-1384`） | agent 级五项 `allow`：`front`（`opencode.jsonc:395-399`）、`plan`（`opencode.jsonc:228-232`） | 按 `scope` 生成 `edit` 规则 + `CONSTANT_DENY`（`lib/delegate-core.ts:1266-1288`、`:48-81`）；委托前后 `git status` 差集取证 | 槽位键 = `workRoot` ⇒ **同一仓的不同 linked worktree 各自一槽**（`lib/delegate-core.ts:154`）；另受全局并发上限 3（`lib/delegate-async.ts:96`、`:1337-1347`） |
| 3 | `delegate` 异步 `dispatch` + `sessions` / `suspend` / `cancel` | 同一插件的异步面（`plugins/delegate.ts:16-20`）：`dispatch` 落简报后返回；`sessions` 只读列表 | 可投递后不等结果；`sessions` 看**本会话名下**后端；可暂停/终止自己的后端 | 同样只对 `front` / `plan` 可用；`sessions` 的 owner 过滤**只在展示层**（`lib/delegate-async.ts:1605-1613`）；跨 owner-kind 的 suspend/resume/cancel 被硬拒（`…delegate….md:98-118`） | 同上（五项 `allow` 才是工具可见的前提；`options.permission` 绑各自 action，`lib/delegate-async.ts:1604`） | 与同步面**共用** `classPermissions` 单一实现（`lib/delegate-async.ts:1360-1364`）⇒ 两链路写隔离零漂移 | `claimSlot` 锁内一次性完成 reconcile + 占槽判定 + 登记（`lib/delegate-async.ts:594-640`）；占槽即拒（`:635-640`）；释放须 `claim_gen` 对得上（`:760-816`） |
| 4 | `.rddf/plan-topics/**` 协作区 | 父写 `TOPIC.md` / `graph.json` / `BRIEF.md`，子写自己的 `TODO.md` / `RESULT.md`（`docs/adr/ADR-plan-multi-session-collaboration.md:42-48`）；fork/join 靠 `graph.json` 派生状态（`:53-63`） | `plan` 可并行开多个 `plan-worker`，各自推进一个 node；产物入 git、可跨会话重建（`:103-108`） | 产物**不能**当 `plan_ref` 派工程（`lib/delegate-core.ts:1321-1326` 不含该根）；不产生代码改动；`owner` 字段全仓零消费（`…multi-session….md:348-350` 残留 #14） | `plan` 的 `edit` 放行 `.rddf/plan-topics/*`（`opencode.jsonc:218`）；`plan-worker` 同名放行 + `subagent`/`delegate*`/`question` 全 deny（`opencode.jsonc:1491-1494`、`:1500-1506`） | **单一写者 + 前缀白名单 + 独占锁 + 事后核对** 四层，明确**不声称**权限强制（`…multi-session….md:134`、`:213`）；节点级写域不可机判（`:285-302`、残留 #1 `:308`） | 每轮至多一批，扇出上限写在 prompt 里、**不是机械闸门**（`…multi-session….md:115`）；同 topic 靠协议锁（`:113`），且该锁**无代码路径执行**（残留 #15 `:351-353`） |
| 5 | rdd-builder 的 worktree / branch 准备 | `builder` 角色的既定流程：“worktree 或轻量执行”（`prompts/build.md:413`）；worktree 场景下 `stateRoot` 归一到主仓、`workRoot` 指 worktree（`prompts/build.md:204-208`） | 在独立 worktree 里实施一个 change，与主工作区文件隔离；其槽位/租约按 worktree 各自一份（`lib/delegate-core.ts:154`、`lib/role-lease.ts:313-315`） | **本仓只有语义落点，没有 worktree 创建/回收/合并的可执行判据**：`rdd-builder` skill 未安装（本仓 `skills/` 下无该目录，`find` 无命中；`scripts/rdd-skills.sh` 只是**预筛**，`prompts/build.md:405`）⇒ 具体 P2 步骤属**上游语义（未在本仓核实）**；`build` 主会话没有“批量准备 N 个 worktree 并分派”的工具面 | `build` 的 `shell: "*": "allow"`（`opencode.jsonc:58-101`）⇒ 创建 worktree 只需 shell，无插件门控；`git branch -D` 等回收动作是 `ask`（`:81`） | 文件级靠 git worktree 天然隔离；**但**角色租约键 = `(workRoot, role)`（`lib/role-lease.ts:313-315`）⇒ 同 worktree 同角色至多一个活跃 session（`prompts/build.md:197`）；跨 worktree 无此限制 | 跨 worktree 天然可并行；仓内无并发上限、无台账、无差集归因 ⇒ 并行度完全靠人 |
| 6 | （旁路）`general` 的 shell 写盘 | `general` 是 `mode:"subagent"`，`build` 可拉起；其 shell 首键 `"*": "allow"`（`opencode.jsonc:1006`），而它**不在** `GUARDED_AGENTS`（`scripts/agent-guard-rules.ts:84`）且 `edit: deny`（`opencode.jsonc:1082`） | 通过 shell 重定向 / `tee` / `git commit` 之外的写盘命令**实际写出文件**（`>`、`>>`、`tee` 等无通用守卫） | 无台账、无槽位、无 `scope`、无 `git status` 差集、无停机证据；`edit` 工具不可用但 shell 写盘可绕过；无人值守下 `ask` 不可判 | `subagent: "allow"`（调用方 `opencode.jsonc:102`）+ 被调方 shell（`opencode.jsonc:1006`） | **无任何写隔离** —— 这是 ADR 自己登记的残留（`docs/adr/ADR-plan-delegate-engineering-session.md:216` 残留 #6） | 无并发控制；多开即多个无账写者 |

**〔事实〕** 拆开看：1–5 是本仓**有语义**的通道；6 是**旁路**。把 6 计入“并行实施能力”会让结论变成“有”，但那等于承认“用无保护写盘当实施通道”，正是两份 ADR 都否决过的形态（`docs/adr/ADR-plan-delegate-engineering-session.md:129`、`docs/adr/ADR-plan-multi-session-collaboration.md:178`）。

## 2. 可派矩阵（谁可以派谁）

> 区分两件事：**权限可达**（配置层允许该 tool call）与**流程有消费者**（有 prompt / 流程真的会这么用）。二者不等价 —— 本仓已有先例：`context-builder` 对 `front` 可见但执行期被拒、流程上只有 `build` 有推荐路径（`docs/MULTI-AGENT-DESIGN.md:273`）。

| 调用方 ＼ 被调方 | `build`（可写） | 5 个只读 subagent | `plan-worker` | `general` | 依据 |
|---|---|---|---|---|---|
| `build`（primary） | —（不能被子会话拉起，宿主拒 primary 目标） | **权限可达**：`subagent: "allow"`（`opencode.jsonc:102`）；**流程有消费者**：`prompts/build.md:37-42` | **权限可达**；**流程无消费者**（build 侧没有任何 topic 协作流程教它派 plan-worker） | **权限可达**；**流程无消费者**（build.md 无 general 委派路径） | `opencode.jsonc:102` + `prompts/build.md:37-42` |
| `front`（primary） | **可达且是主用**：`delegate*` 五项 `allow`（`opencode.jsonc:395-399`） | **可达且主用**：map 白名单 5 个只读（`opencode.jsonc:386-393`） | **不可达**（白名单不含 `plan-worker`） | **不可达**（同左） | `opencode.jsonc:386-399` |
| `plan`（primary） | **可达**：五项 `allow`（`opencode.jsonc:228-232`）；派可写实施**必须**带 `plan_ref`（`lib/delegate-core.ts:2340`） | **可达**：`subagent: "allow"`（`opencode.jsonc:226`） | **可达且是主用**：`…multi-session….md:67-71`；可派者集合 = `{build, plan}`（`docs/MULTI-AGENT-DESIGN.md:281`） | **可达**（`subagent` 字符串 allow）；**流程无消费者** | `opencode.jsonc:226-232` |
| `plan-worker` / 其余 7 个 subagent | 不可达 | `plan-worker` 全 deny（`opencode.jsonc:1500`）；`librarian` 仅可派 `explore`（`opencode.jsonc:694-697`）；其余 `deny` | `plan-worker` 自身 `subagent: deny`（`opencode.jsonc:1500`） | 不可达 | `opencode.jsonc:1500`、`:694-697` |
| `title`（hidden primary） | — | 无（未配置） | 无 | 无 | `opencode.jsonc:1247-1252` |

**〔事实〕** 三个 primary 的可派面不对称：`front` 有 delegate 无 `build` 子会话；`build` 有 `subagent` 全开但无 delegate；`plan` 两者都有。**〔推断〕** 这不是偶然的配置散落，而是 ADR 的分工表述：`front` = 唯一门控出口的原始持有者、`plan` 是新加的并列主体、`build` 被刻意留在“实施侧”而非“派发侧”（`docs/adr/ADR-plan-delegate-engineering-session.md:43-45`）。但本仓**没有任何文本**说“`build` 不应当拥有并行实施能力” —— 缺口的性质由此开始分叉（见 §3）。

**〔事实〕** 可派关系的机械守卫只钉死了一半：`plan-worker` 的“可派者集合 = {build, plan}”有断言（`…multi-session….md:246` V02b），但 `build` 能不能有 delegate **没有任何守卫**（`tests/config-guards.test.ts` 只断言顶层 deny + `front`/`plan` allow，`…delegate….md:176` V01）。

## 3. `build` 缺口的判定：哪些是刻意、哪些是缺口

### 3.1 证据（每条带 `path:line`）

1. **〔事实·刻意串行化〕`build` 不是 delegate 派发主体，且这是 D1 的字面范围。**
   `docs/adr/ADR-plan-delegate-engineering-session.md:43-45`：顶层五项保持 `deny`，只给 `front` 与 `plan` 各 allow 五项，“delegate 仍是唯一的工程行动出口”。选项表把“给 plan 新建独立派发工具”与“用 subagent 拉可写 agent”都否决（`:126-130`）。⇒ `build` 无 delegate 是**该决策的直接后果**，不是漏配。

2. **〔事实·刻意串行化〕同一 `workRoot` 全局单槽是写隔离的前提。**
   `docs/adr/ADR-plan-delegate-engineering-session.md:74-78`（D4）+ `lib/delegate-core.ts:154`（槽位键 = `workRoot`，linked worktree 各自一槽）。⇒ “同一工作树上两个实施者”被**有意**禁止；`build` 若拿到 delegate，也不会因此在同一树上并行。

3. **〔事实·刻意串行化〕同 worktree 同角色的租约独占，是更底下的一层。**
   `prompts/build.md:197`：`edit`/`write` 走插件门控，`lib/role-lease.ts` 校验租约 ⇒ 同一 worktree 同角色至多一个活跃 session；“无租约 ⇒ 只能读 + 报告”。租约键 `(workRoot, role)` 见 `lib/role-lease.ts:313-315`。⇒ 即使绕过 delegate 直接开第二个 `build` 主会话，写权也会被租约挡在门外。

4. **〔事实·能力缺口〕并行协作抽象只建在 plan 侧，且 ADR 明说“不做”工程侧。**
   `docs/adr/ADR-plan-multi-session-collaboration.md:119`（D8 关闭范围）：“**不做**：子会话派工程实施（`plan-worker` 无 `delegate`）”。同篇 `:26`、`:178-180` 明确“复用 delegate 派子会话”被否决的理由是单槽 + 语义不符 + 不进会话树。⇒ **plan 侧的并行能力是专门为“离线讨论”造的**，工程侧没有对应物；这是范围决定**留下的空位**，而不是“工程必须串行”的论证。

5. **〔事实·能力缺口/代码级〕第三主体会被台账坍缩成 `front`。**
   `lib/delegate-core.ts:1413-1415`：`ownerAgentOf(agent) = agent === "plan" ? "plan" : "front"`。ADR 自己登记为残留 #4（`docs/adr/ADR-plan-delegate-engineering-session.md:214`）：任何新派发主体（如 `build`）在台账 / `sessions` / 跨 owner-kind 的 resume·cancel 三处**一律塌成 front**⇒ `front` 可 resume/cancel 它的后端。⇒ 想给 `build` 开 delegate，先得改归属枚举 —— 这是**实打实的实现缺口**，不是配置一行。

6. **〔事实·能力缺口/安全面〕agent 级 `delegate: allow` 会泄漏到被派发后端。**
   `lib/delegate-core.ts:1266-1288` 的 `classPermissions` **不含任何 delegate 规则**；ADR 残留 #5（`docs/adr/ADR-plan-delegate-engineering-session.md:215`）指出 session 规则在 agent 规则之后 last-match-wins ⇒ 给 `build` 开 `delegate: allow` 后，**以 build 为后端的后端会话也会拿到 delegate 工具** ⇒ 击穿“一次派发一个角色类、权限在创建时定型”这条不变式（`prompts/build.md:692`：没有 session 内换类入口、`resume` 不重设权限）。⇒ 开权限不是“加一行 JSON”，是**必须先补 deny 同批**。

7. **〔事实·旁路〕`general` 的 shell 写盘给 build 侧留了一条无保护写路径。**
   `opencode.jsonc:1006`（`general` shell 首键 `"*": "allow"`）+ `scripts/agent-guard-rules.ts:84`（`GUARDED_AGENTS` 不含 `general`）+ `opencode.jsonc:1082`（`edit: deny`）。ADR 残留 #6 已逐字登记（`docs/adr/ADR-plan-delegate-engineering-session.md:216`），并把它当作“`subagent` 拉可写 agent 比没有更危险”这条裁决的**配置自证**。⇒ 严格说：`build` **有一条**“能写出文件”的子会话路径，但它**没有**任何工程通道应有的登记/槽位/差集/停机证据。
   〔必须上报〕`general-shell-write-bypass` —— 若父会话要回答“build 现在能不能并行改代码”，必须把这条旁路显式排除或显式纳入，不能用“没有 delegate”一句带过。

8. **〔事实·判据面〕“build 侧并行”没有任何判据位。**
   plan 侧有 `claim` / `close` / `reap` / `cancel` / `converged` 一整套（`docs/adr/ADR-plan-multi-session-collaboration.md:136-169`、`:367-371`）；工程侧只有 `delegate` 的 `pair.json` + `ledger.jsonl`，且它们是**单槽**语义（`lib/delegate-async.ts:594-640`）。⇒ 缺的不是“模型多开”，是**多批次派发的台账与收敛判据**（这正是 n4 的输入）。

### 3.2 分栏判定

| 现象 | 判定 | 依据 | 说明 |
|---|---|---|---|
| `build` 无 delegate 五项 | **刻意**（决策的射程） | `…delegate….md:43-45`、`opencode.jsonc:30-34` | D1 只扩展 plan，未把 build 列为派发主体；顶层 deny 是“门控边界唯一”的实现手法 |
| 同一 `workRoot` 只能一个活跃后端 | **刻意**（写隔离前提） | `…delegate….md:74-78`、`lib/delegate-core.ts:154` | 与 owner 无关；跨 worktree 每树一槽 ⇒ 并行**在 delegate 语义内是允许的**（只是要换树） |
| 同 worktree 同角色只一个活跃 session | **刻意**（租约不变式） | `prompts/build.md:197`、`lib/role-lease.ts:436-485` | 连“两个 build 主会话”都被挡；这是 `build` 并行实施的最小阻碍层 |
| `build` 无“多节点 / 多 wave”实施抽象（plan-topics 的工程版） | **能力缺口** | `…multi-session….md:119`（D8 明说不做）、`:308`（残留 #1 per-node 写域做不了） | 没有任何文本说“工程侧不需要并行”；只有“本期不做”和“做不到”的登记 |
| 第三个派发主体会被 `ownerAgentOf` 坍成 front | **能力缺口**（实现） | `lib/delegate-core.ts:1413-1415`、`…delegate….md:214` | 开权限前必须改判据，属真实工作量与真实风险 |
| 给 build 开 `delegate: allow` 会泄漏到后端 | **能力缺口/风险**（实现） | `lib/delegate-core.ts:1266-1288`、`…delegate….md:215` | 不补 `CONSTANT_DENY` 式的 delegate deny，就会造出“后端可再派后端” |
| `general` 的 shell 写盘 | **能力缺口/安全面**（已登记未修） | `opencode.jsonc:1006`、`scripts/agent-guard-rules.ts:84` | 不是“并行实施通道”，但确实是“无保护写路径”；不能计入能力账 |
| rdd-builder P2 worktree 准备 | **上游语义（未在本仓核实）** 的流程 + 本仓只有语义落点 | `prompts/build.md:413`、`:204-208` | 本仓无 skill 安装记录、无 worktree 创建/合并判据 ⇒ 不编造 `path:line` |

## 4. 与 TOPIC 假设的对照（供 n5 / n6 接）

〔事实〕TOPIC.md 的现状陈述（`opencode.jsonc` 顶层五项 deny；agent 级只有 `front` 与 `plan` 有 `delegate: allow`；`build` 没有）**与本仓配置逐字一致**（`opencode.jsonc:30-34`、`:228-232`、`:395-399`、`:43-113`）。

〔推断〕TOPIC 里“大型改造只能由单一 `build` 会话串行完成”这句要成立，还依赖两个前提，本节点实测后确认**都成立但成因不同**：
- 前提 A：`build` 不能把实施外包给另一个**可写**会话 —— 成立，但成因是“无 delegate + 子 agent 全只读”（§3.1-1/4），**不是**“单槽”。
- 前提 B：同一 worktree 上的两个实施者不能并存 —— 成立，成因是**单槽 + 角色租约**（§3.1-2/3），与 `build` 有没有 delegate 无关。

〔建议〕n5 应当把这两条**拆开**讨论：给 `build` 开 delegate **不会**解决前提 B（同树仍单槽），只会解决前提 A；而前提 B 的解法只有在 n2（写隔离选型）里才可能出现。若把两者混在一起，容易得出“开了 delegate 就能并行”的错误结论。

〔建议〕n6 应当正视“跨 worktree 本来就每树一槽”（`lib/delegate-core.ts:154`）—— 也就是说 delegate 的并发语义**已经**允许“不同 worktree 各跑一个”，缺的是（a）谁来准备这些 worktree、（b）谁来做合并与判据。这与 §3.2 最后一行（P2 worktree 准备属上游语义）直接相接。

## 5. 本节点的边界声明

- 未评价任何通道“好不好”；未提出 `build-worker` 形态；未改任何实现、配置、ADR。
- 表 6 行（`general` 旁路）与 §3.1-7 是**如实测绘**，不是建议开它或关它 —— 关闭动作属 n2 / n4。
- `rdd-builder` P2 的具体步骤**未在本仓核实**（skill 未安装），已按 BRIEF 要求标注为上游语义，未编造引用。

## 6. 待父裁决

1. “`build` 无并行实施通道”是否按本节点的两段式表述（**无受门控通道 = 真**；**存在无保护 shell 旁路 = 真**）进入合成稿？合成为一个布尔词会丢掉 `general` 旁路这个事实。
2. §3.2 把“工程侧无 plan-topics 对应物”判为**能力缺口**、把“单槽/租约”判为**刻意**。若父会话认为“缺口”一词预设了“应当补”，可改为“范围空位（scope gap）”——本节点不坚持措辞。
3. 表 5（rdd-builder worktree）是否需要 n6 去外部核实上游 skill？本节点按 BRIEF 只标注未核实，未展开。

## STATUS: COMPLETE
