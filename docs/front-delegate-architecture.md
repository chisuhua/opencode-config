# front + delegate 开发者架构文档

> 面向**改这套代码的人**。要"怎么用"看 [使用手册](./front-delegate-usage.md)；要"怎么测"看 [测试文档](./front-delegate-testing.md)；
> 要"为什么这么定"看 [ADR](../.rddf/state/adr-front-agent-redesign.md)。

---

## 1. 这份文档解决什么

你接手这套代码时需要的四件事：

1. **全图** —— 一张图看清 front、delegate 工具、工程 session、权限层、状态文件之间的关系（§2）。
2. **机制** —— 每条"为什么能这样工作"的根因与上游判定点（§4）。
3. **扩展指南** —— 怎么在不破坏边界的前提下加能力（§6）。
4. **陷阱** —— 哪些坑是实测踩出来的，别再踩（§7）。

---

## 2. 全图

### 2.1 运行时全景

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 用户（TUI / CLI）                                                              │
│   "补个测试" / "X 在哪" / "下一步做什么"                                          │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ 对话
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ front session（opencode primary agent，model=minimax-cn/MiniMax-M3.1-Flash）     │
│                                                                              │
│  职责边界（权限层强制，非 prompt 承诺）                                          │
│   ✅ read / grep / glob / list（跨目录受 external_directory 约束）                │
│   ✅ shell 只读白名单（*: deny 打头 + 47 allow + 尾部守卫 deny + "* /*" 禁绝对路径）│
│   ✅ question（问用户）    ✅ delegate 插件（唯一门控出口：delegate/dispatch/      │
│      sessions/suspend/cancel —— 门控边界唯一，不是工具名唯一）                     │
│   ❌ edit / write   ❌ skill   ❌ subagent   ❌ bash -c / curl / python -c         │
│                                                                              │
│  四分类路由（判据=产物形态）                                                      │
│   理解性→自己答   实施性→delegate   流程性→读状态出摘要   需裁决→question           │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ delegate 插件（唯一门控出口；五个工具同一门控）
                │   ctx.session.create / prompt / wait / get / context / remove
                │   （全部在插件进程内，front 不持凭证、不发 HTTP）
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ 工程 session（opencode session，agent=build，位于目标工程目录）                    │
│                                                                              │
│  权限在【建立时】定型（顺序即策略，last-match-wins）                              │
│   [ 常量 deny(build 的 ask 类目 + question + form + MCP 写) ,                     │
│     scope→edit 规则（scope 内 allow / 其余 deny）,                                │
│     用户预批的 grants ]                                                           │
│                                                                              │
│  角色：走 build 角色矩阵（architect/planner/builder/verifier）                     │
│  登记：pair.json（pair-v2）+ role.json 的 sessions 分区 ← 必须在 prompt 之前写       │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ 读写文件 / 跑测试
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ 工程仓库（git repo）                                                             │
│   源码 · .rddf/state/{role.json,pair.json} · openspec/changes/*                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 分层与职责

| 层 | 位置 | 职责 | 谁写 |
|---|---|---|---|
| **L0 宿主** | opencode v2.2.5（`/workspace/project/opencode` 上游） | 插件加载、工具注册、权限判定、session 运行时 | 上游（只读参考） |
| **L1 治理面** | `~/.config/opencode`（本仓库） | agent 定义、权限块、prompt、插件、状态文件、文档 | 本仓库 |
| **L2 插件** | `plugins/delegate.ts`（11 行）+ `lib/delegate-core.ts`（638 行） | 委托逻辑实现 | 本仓库 |
| **L3 工程仓** | 被委托的 git 仓库 | 代码、测试、工程自己的 `.rddf/state/` | 工程 session |
| **L4 技能层** | `~/.agents/skills/rdd-workflow`（或 `rdd-workflow` 仓库） | rdd-arch/planner/builder/verifier 工作流 | 独立仓库 |

### 2.3 仓库边界（4 个独立 git 仓库）

| 仓库 | 本次改动涉及？ | 说明 |
|---|---|---|
| `~/.config/opencode` | ✅ | 治理面：配置 + 插件 + 文档 + 状态 |
| `~/rdd-workflow` | ❌ | rdd-workflow 产品本体；**不要**在这里改 front/delegate |
| `/workspace/main/rdd-workflow-e2e` | ❌（只读作 fixture） | 外部 e2e 测试床；单测复制其工作树作示例工程 |
| `/workspace/project/opencode` | ❌（只读参考） | 上游源码，**不改**（所有所需原语 v2.2.5 已具备） |

> **为什么不改上游**：所需原语（`ctx.tool.transform` / `options.permission` / `ctx.session.*` /
> `session.permissions`）在已安装版本全部存在；改上游会把维护成本转移到 fork 同步。

---

## 3. 组件清单

| 文件 | 行数 | 职责 | 扩展性 |
|---|---|---|---|
| `plugins/delegate.ts` | 11 | 插件壳：把工具注册进 opencode 工具表 | 几乎不改 |
| `lib/delegate-core.ts` | 638 | **纯逻辑内核**：29 个导出符号 + 工具定义工厂 | **主战场** |
| `prompts/front.md` | 119 | front 的行为契约（四分类 / brief / 扫描清单 / 降级） | 改 prompt 需重启服务 |
| `opencode.jsonc.opencode-go` | 1199 | agent 定义 + 权限块 + 门控 | 改权限需重启服务 |
| `tests/delegate-core.test.ts` | 446 | 纯逻辑单测（51 项） | 随逻辑增补 |
| `tests/delegate-tool.test.ts` | 372 | 假 ctx 端到端单测（12 项） | 随契约增补 |
| `lib/delegate-core.ts` 导出面 | — | 见 §6.2 的扩展点表 | — |

---

## 4. 关键机制

### 4.1 插件宿主与工具注册

opencode v2 的插件是 **V2 形态**（V1 的 `export const X = async (ctx) => ({tool:{}})` **不生效**）：

```ts
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "front-delegate",
  async setup(ctx: any) {
    await ctx.tool.transform((editor: any) => {
      editor.add(delegateToolDefinition(ctx))   // 工具定义来自 lib/delegate-core.ts
    })
  },
})
```

要点：

- **注册用 `transform` + `editor.add`**，不是直接赋值；
- **插件目录的每个 `.ts` 都会被当插件入口加载** → 核心逻辑不能放 `plugins/`（会被当插件加载失败）。
  这就是拆出 `lib/` 的唯一原因；
- **相对导入用 `.ts` 扩展名**（`import { x } from "../lib/delegate-core.ts"`）——实测可用；
- **`setup()` 只做注册**：location 销毁会中止未 settle 的 setup（见 §7.3），耗时工作必须放工具 `execute`；
- **`setup()` 里禁止写盘**：全局插件目录对每个 location 各加载一次（同进程多实例）。

插件 ctx 能力面（实测枚举）：`agent aisdk app command credential event experimental generate integration
location mcp model options permission plugin provider reference rpc session shell skill storage tool vcs
websearch worktree`。本项目的插件**只用** `tool`（注册工具）与 `session`（建/驱动/读取工程 session）；
`permission` / `location` 只在探针阶段用过（跨会话代答实验、location 绑定实验），生产路径不依赖。

### 4.2 权限模型（三层求值 + last-match-wins）

#### 求值顺序

```
全局规则集（所有 agent 共有）
   ↑ 先 push
agent 专属规则
   ↑ 后 push → 同名同资源时 agent 规则胜出
session 级规则（建 session 时由插件给定）
   ↑ 最后 → 压过 agent 规则（这是 delegate 能做"scope 强制"的原因）
```

上游判定点（`/workspace/project/opencode`）：

- `packages/core/src/config/plugin/agent.ts:91` —— 全局规则 push 给所有 agent；
- `packages/core/src/config/plugin/agent.ts:122` —— agent 专属规则 push 在其后；
- `packages/core/src/session/context.ts:136` —— `Permission.merge(agent.info.permissions, session.permissions ?? [])`；
- `packages/core/src/tool.ts:293-296` —— `whollyDisabled` 用 `findLast`（**最后一条匹配的规则胜出**）。

#### 规则书写形式

| 形式 | 形态 | 顺序语义 |
|---|---|---|
| V1 对象式（现用） | `"shell": { "*": "deny", "rg *": "allow" }` | 对象键序保留（实测 78 条 shell 与 4 条 read 均按作者原序），但**嵌套对象的键序不保证** |
| 原生数组式 | `"permissions": [{action, resource, effect}, ...]` | 数组序**显式**保留，更可靠 |

> 本项目用 V1 对象式（与现有配置体例一致），实测顺序保持；但**新增大量规则时优先考虑原生数组式**。

#### 门控为什么用独立 action 名

工具的 `options.permission = "delegate"` 让该工具受一条名为 `delegate` 的**独立权限 action** 控制
（而不是用工具名 `delegate` —— 恰好同名，但语义不同：action 名与工具名解耦后，一个 action 可以管多个工具）。

```
全局：   permission.delegate = "deny"     → 所有 agent 默认无此能力
agent：  agent.front.permission.delegate = "allow" → 唯一例外
判定：   whollyDisabled(tool.options.permission ?? name, rules)
```

实测矩阵（`opencode debug agents`）：front = `[{*,deny},{*,allow}]`，其余 12 个 agent = `[{*,deny}]`，
`--agent plan` 调用时模型答 `NO_TOOL`。

### 4.3 session 模型

| 原语 | 语义 | 坑 |
|---|---|---|
| `ctx.session.create({location:{directory}, agent, title, permissions})` | 在**指定目录**建 session（可跨 location）；`permissions` 可预置 | 跨 location 创建可行；但插件 ctx 的**权限服务是 location 绑定的** |
| `ctx.session.prompt({sessionID, text, delivery})` | 投递指令 | `delivery` 默认 **`steer`**（注入当前轮并改写它，**不是**排队）；显式传 `delivery:"queue"` 才是"下一轮"。⇒ 插件层的 busy 拒绝是**主动选择**（避免 steer 改写正在执行的目标），不是上游自动排队 |
| `ctx.session.wait({sessionID})` | 等到运行结束 | 工具里用 `Promise.race` 加 30min 上限 |
| `ctx.session.get({sessionID})` | 读 `outcome` / `time.idle` / `time.updated` / `permissions` | **`outcome` 是"上一次已结束 run"的结果**，可能是陈旧值 |
| `ctx.session.context({sessionID})` | 读消息数组（`content[]` 里含 tool part） | 跨 location 可读（与权限服务不同） |
| `ctx.session.remove({sessionID})` | 删除 | 与 `resume_session` 互斥（删了就没法续接） |
| `ctx.session.update({sessionID, permissions})` | **原地改权限** | 实测可用 → 救援不必新建 session（§4.4 第 11 步） |

#### 两个时间线判据（最容易写错的地方）

- **in-flight（busy）判定**：用「**最后一条消息的创建时间 > 最后空闲时间**」。
  **不能**用 `time.updated > time.idle`：首次运行中的 session 从未 idle 过（`idle=0`），会漏判。
- **新活动判定**：用「**最后消息 id 变了 或 消息条数变了**」，之后才采信 `outcome`。
  `outcome` 单独用会把"运行中的 run2"报成"run1 成功"。

### 4.4 异步派发面的槽位模型（单槽）

`dispatch` / `sessions` / `suspend` / `cancel` 与既有 `delegate` **共用同一张槽位表**
（落 `pair.json`，键 = **`workRoot`**）。要点：

| 概念 | 规则 |
|---|---|
| **槽位键** | `workRoot`（`abs(git rev-parse --show-toplevel)`）⇒ 同一仓的不同 linked worktree **各自一槽**；同一工作树内一次一个 |
| **占槽态** | `dispatching`（简报已投递但**未确认消费**）/ `active`（已确认消费）。两种都占槽 |
| **非占槽态** | `idle`（已登记未占槽）/ `suspended`（被暂停、可续）/ `tombstone`（终态） |
| **常驻 vs 活跃** | 同一工作树可**常驻多个**后端（`idle`/`suspended`），同一时刻只有一个占槽 |
| **切换** | `suspend(当前)` → `dispatch/resume(目标)`，**两步由 front 编排**（跨 session 的 interrupt+prompt 无法与上游投递原子化） |
| **投递 ≠ 消费** | `prompt()` 返回 = **已入队**；消费 = 该简报的 `message.id` 出现在 `session.context()` 的消息 id 集合里。`dispatching` 只可 `cancel`（旧简报会抢先跑） |
| **翻转执行者** | 同步 `delegate` 在 `wait` 返回时自翻转 `idle`；`dispatch` 派发的后端靠**每次派发时的 reconcile**（锁外查活体 → 锁内重验 → 锁内翻转） |
| **悬挂标记** | 登记占槽 + 实际不 busy + 超 `stalled` 阈值 ⇒ 展示层报「槽位疑似悬挂」；**回收仍由 reconcile 完成** |

**锁的形态（不可违反）**：`withLock` 是**同步** `() => void`、不可重入、10s deadline ⇒

1. **锁内不得 `await`**（活体查询 / `interrupt` / `prompt` 全在锁外）；
2. **锁内不得调用自取锁的函数**（`appendLedger` / `registerSession` 会二次取锁 ⇒ 死锁）；
   锁内只用已持锁版本：`appendLedgerLine` / `writePairs` / `writeRoleSession`。

### 4.5 delegate 工具的内部算法

`delegateToolDefinition(ctx).execute(input, toolContext)` 的 18 步（对应 `lib/delegate-core.ts`）：

| # | 步骤 | 关键点 | 出错时的表现 |
|---|---|---|---|
| 1 | `validateBrief(input)` | 只校验存在/类型/结构；**不猜语义** | 抛错，**不建 session**（无副作用） |
| 2 | `canonicalRoot(project_dir)` → `{stateRoot, workRoot, vcs}` | **两个根**：`stateRoot = superproject 非空 ? superproject : dirname(abs(--git-common-dir))`；`workRoot = abs(--show-toplevel)`；非 git 目录两者都回退 `realpath` 且 `vcs=false`。**必须先判 superproject**（submodule 下 common-dir 指向 `.git/modules/…`） | — |
| 3 | resume 校验 | **读回退**：`lookupPair(stateRoot)` 未命中再查 `workRoot`（存量 pair.json 物理在 worktree）；**双值接受**：`canonical_root` 等于 stateRoot 或 workRoot 任一即通过；`front_session_id` 只作**软信号** | 抛错（未登记 / root 不匹配） |
| 4 | 组装 permissions | `[常量deny, scope edit 规则, grants]` | — |
| 5 | create 或复用 session | 复用时不传 permissions（沿用建时定型） | — |
| 6 | **`registerSession`** | 写 pair.json + role.json —— **必须在 prompt 之前** | 晚写 → 工程 session 角色退化为 `general` |
| 7 | `statusBefore = gitStatusPaths(root)` | 委托前的脏文件基线 | — |
| 8 | 取 baseline | `get` + `context` → lastMessageID / lastIdle / lastMessageAt | — |
| 9 | **busy 判定** | `lastMessageAt > lastIdle` → 返回 `{outcome:"busy"}`，**不排队** | — |
| 10 | `buildBrief` + `prompt` | 简报 = goal/scope/acceptance/constraints/grants + task + 执行要求 | — |
| 11 | `wait`（30min 上限 race） | — | 超时 → `wait_error` |
| 12 | 新活动判定 | 见 §4.3 | 无活动 → `outcome:"unknown"`（**不能当成功**） |
| 13 | `extractBlocked(messages)` | 扫 tool part 的 `state.status==="error"`，两种形态（见下） | — |
| 14 | `lastAssistantText(messages)` | 最后一条含 text part 的 assistant 消息 | — |
| 15 | 越界检测 | `changedSince(before, after)` → `outOfScopeFiles(root, scope, changed)` | — |
| 16 | `registerSession`（upsert） | 刷新 `last_used_at` | — |
| 17 | `remove`（若 `brief.remove`） | 默认 false（与 resume 互斥） | — |
| 18 | 返回结构化 summary | 见使用手册 §6 | — |

#### 阻断标记的两种形态

| 形态 | 出现位置 | 结构 |
|---|---|---|
| A 规则级拒绝 | 工具结果 | `{"error":{"type":"permission.rejected","message":"Permission denied: <action>"}}` |
| B 用户显式拒绝 | 消息 part 内 | `{"type":"tool","state":{"status":"error","error":{"type":"aborted","message":"The user declined this tool call"}}}` |

两者 `state.status` 都是 `error`；提取规则见 `extractBlocked`（core 内）。

#### 救援：原地补 grant（不是全量重跑）

`session.update` 可原地改权限（实测：建时 `[{shell, git status *, allow}]` → update 后 `[{*, *, allow}]`）。
所以被拒后的救援是：

```
blocked_reason → 问用户 → 用户同意 → session.update(补一条 grant) → 续接同一 session 继续
```

**不**新建 session、**不**全量重跑（早期设计假设 permissions 只能建时写，实测被推翻 → ADR D5.1）。

### 4.6 `external_directory` 的边界（最容易误判的一条）

上游确认（`packages/core/src/file-access.ts`）：

| 工具 | 是否受 `external_directory` 约束 |
|---|---|
| `read` | ✅（`authorizeRead` → `authorizeExternal`） |
| `grep` / `glob` | ✅（两者都调 `authorizeExternal`） |
| `edit` / `write` | ✅ |
| **`shell`** | ❌（只 assert `action:"shell"` + 命令文本资源） |

→ **shell 能绕过 external_directory 到达任意路径**。实测：仅把 `external_directory` 改成路径对象后，
front 用 `cat /etc/passwd` **成功执行**（泄漏内容）。

处置：front 的 shell 规则追加 **`"* /*": deny`**（命令文本含 `" /"` 即拒 → 禁绝对路径），
跨目录访问一律走 `read`/`grep`/`glob`。这同时意味着：**front 读工程代码要用 grep/read 工具，不是 shell**。

### 4.7 状态文件与并发

| 文件 | 位置 | schema | 写入方 |
|---|---|---|---|
| `role.json` | `<stateRoot>/.rddf/state/role.json` | 既有 role-v2：顶层镜像 + `sessions` 分区 + `history` | 工程 session（角色切换）+ delegate（分区 upsert） |
| `pair.json` | `<stateRoot>/.rddf/state/pair.json` | `pair-v2`：`pairs: { <engineering_session_id>: { front_session_id, canonical_root, agent, registered_at, last_used_at } }` | delegate（single writer） |

并发规则：

- **原子写**：`writeJsonAtomic` = 写 tmp + `rename`（防撕裂读）；
- **协作锁**：`.rddf/state/.role.lock` 用**原子 mkdir** 实现（30s 陈旧锁清理 + 10s 获取超时）；
  `withLock` 内做全部 RMW。**两侧写入方都必须取同一把锁**——只有一侧加锁等于无锁
  （ADR D6 明确要求工程 session 侧的角色切换写盘也改用这把锁，**该改动尚未落地**）。

### 4.8 与 rdd-workflow 的边界

- front/delegate **不依赖** rdd-workflow：它只是"把任务交给一个 build agent 的工程 session"。
- 工程 session 内部**可以**用 rdd-* skill（rdd-builder P0/P1.5/…），那是工程 session 的事。
- front 的"流程性回答"只读状态文件（`.rddf/state/`、`openspec/changes/*/tasks.md`），
  **不执行**任何 rdd skill（front `skill: deny`）——这是刻意的：状态摘要是快照，执行是工程 session 的职责。

---

## 5. 一次委托的完整时序

| 时刻 | 发生什么 | 可观测证据 |
|---|---|---|
| t0 | 用户说话 → front 判类为"实施性" | front 文本 |
| t1 | front 组 brief（六必填） | front 文本里的字段 |
| t2 | front 调 `delegate` 工具 | 工具调用记录（`delegate {...}`） |
| t3 | 插件校验 brief + canonical_root + resume | 工具返回 / 抛错 |
| t4 | 组 permissions、create 工程 session | 服务端 `session` 记录（agent=build、目录=工程根） |
| t5 | **registerSession**：写 pair.json + role.json 分区 | `.rddf/state/` 两个文件 |
| t6 | baseline + busy 判定 | `outcome:"busy"` 时直接返回 |
| t7 | prompt 投递简报 | 工程 session 的 user 消息 |
| t8 | 工程 session 读自己的 role.json → 角色=builder（**不是 general**） | 工程 session 的首条消息（角色开场报告） |
| t9 | 工程 session 在 scope 内改文件 | 文件系统 + `git status` |
| t10 | 工具 wait → 读 outcome/消息 | `outcome:succeeded` |
| t11 | 抽取阻断 + 最后回复 + 越界比对 | summary 字段 |
| t12 | 返回 summary 给 front → front 转述 | front 文本 |

**排障时按这张表定位**：哪一步没发生，就去对应证据里查。

---

## 6. 开放指南

### 6.1 五条不可破坏的不变量

> 扩展前先读 §6.9「opencode 升级维护清单」——宿主升级会改变插件 API 与配置 schema 的语义。

破坏任何一条都会让"权限层强制"退化成"prompt 承诺"：

1. **单一工程出口**：一切工程行动只能经 `delegate` 插件。不要给 front 加第二个出口。

  > **口径（2026-11-09 明确，ADR-front-multi-backend D1）**：这条不变式的「出口」指**门控边界**——
  > 「同一个插件 + 每个工具声明独立的 `options.permission` action + 全局 deny + 仅 front allow」这套形态——
  > **而不是工具名**。`dispatch`/`sessions`/`suspend`/`cancel` 全部落在同一个 `delegate` 插件内、
  > 全部走同一套门控形态、全部只对 front 可见；没有任何一条工程行动路径**绕过**该门控。
  > ⇒ 新增工具不等于"加第二个出口"；**绕过插件的 shell 脚本/裸 API 调用**才是。。
2. **门控在权限层**：新工具必须声明独立的 `options.permission` action，并全局 deny + 仅 front allow。
3. **工程 session 的权限在建立时定型**：不依赖运行时代答（无 UI → ask 会永久挂死）。
4. **规则顺序即策略**：`[常量deny, scope, grants]`；grants 有类目白名单，且白名单**先于** grants 生效。
5. **状态文件 single-writer + 同一把锁**：任何新增写盘方都要走 `withLock`。

### 6.2 扩展点地图（core 的 29 个导出）

| 导出 | 用途 | 扩展建议 |
|---|---|---|
| `CONSTANT_DENY` / `GRANT_ALLOWED` / `GRANT_FORBIDDEN` | 权限常量与白名单 | **改动必须同步 `opencode.jsonc` 的 build ask 清单**（漂移检测见 §6.5） |
| `validateBrief` / `validateGrants` / `buildBrief` | brief 契约三件套 | 改契约要**四处联动**（§6.4） |
| `scopeEditRules` / `scopeAbsolutePaths` / `changedSince` / `outOfScopeFiles` | scope 强制与检测 | 加新的 scope 语义从这里进 |
| `extractBlocked` / `lastAssistantText` / `lastMessageID` / `lastMessageAt` / `toMillis` | 消息与时间线解析 | 加新的结果判据从这里进 |
| `canonicalRoot` / `gitStatusPaths` | 项目识别与变更检测 | 支持 worktree / 多仓时扩展 |
| `registerSession` / `lookupPair` / `readJson` / `writeJsonAtomic` / `withLock` | 状态与并发 | 新增状态文件复用 `withLock` |
| `delegateToolDefinition` | 工具定义工厂 | 加工具/改参数从这里进 |
| `fail` / `isAbsolute` | 小工具 | — |

### 6.3 加一个新工具（以"委托跑测试"为例）

**Step 1 — 逻辑放 core，不放 plugins**

```ts
// lib/delegate-core.ts
export const RUN_TESTS_DESCRIPTION = "在工程 session 里跑指定测试命令"

export function validateTestRequest(input: any): { command: string } {
  const command = String(input.command ?? "").trim()
  if (command.length === 0) throw fail("command 必填")
  return { command }
}
```

**Step 2 — 注册 + 门控**

```ts
// plugins/delegate.ts
await ctx.tool.transform((editor: any) => {
  editor.add(delegateToolDefinition(ctx))
  editor.add({
    name: "run_tests",
    description: RUN_TESTS_DESCRIPTION,
    input: { type: "object", properties: { command: { type: "string" } }, required: ["command"], additionalProperties: false },
    options: { permission: "delegate_tests", codemode: false },   // ← 独立 action
    async execute(input: any) { /* 用 ctx.session.* 实现 */ },
  })
})
```

**Step 3 — 门控配置**

```jsonc
"permission": { "delegate": "deny", "delegate_tests": "deny" },        // 全局 deny
"agent": { "front": { "permission": { "delegate": "allow", "delegate_tests": "allow" } } }
```

> 用**独立 action 名**（`delegate_tests`）而不是工具名，便于一条 action 管多个工具。

**Step 4 — 权限块也要改**：新工具若要操作文件，同样受 `edit`/`external_directory` 约束，
需要在 session permissions 里补相应规则（或复用 delegate 的 scope 机制）。

**Step 5 — 测试**：`tests/` 里加纯逻辑断言 + 假 ctx 断言（工具契约、参数校验、失败路径）。

**Step 6 — 运行时回归**：按 [测试文档 §8](./front-delegate-testing.md#8-运行时验证清单) 跑一遍。

**Step 7 — 文档**：使用手册加用法、测试文档加覆盖矩阵、ADR 记录取舍（若改变了边界）。

### 6.4 扩展 brief 契约（改字段必须四处联动）

| # | 位置 | 改什么 |
|---|---|---|
| 1 | `lib/delegate-core.ts::validateBrief` | 校验规则（必填/类型/结构） |
| 2 | `lib/delegate-core.ts::buildBrief` | 简报文本（工程 session 看得到的部分） |
| 3 | `delegateToolDefinition` 的 `input` schema | JSON Schema（`required` / `properties`） |
| 4 | `prompts/front.md` §3 委托契约 | front 怎么填这个字段（模型侧指导） |

漏任一处 → 模型填了但插件拒、或插件收了但模型不填。**第 3 项有单测兜底**（schema 断言），
第 4 项没有 → 改完必须实跑一次真实委托。

### 6.5 扩展权限模型

- **常量 deny 集**（`CONSTANT_DENY`）：与 `opencode.jsonc` 里 build agent 的 `ask` 清单是**双写**关系。
  漂移后果：漏拦 → 工程 session 挂死；误拦 → 任务必然失败。
  → **必须做漂移检测**（比对插件常量集与配置 ask 清单，不一致即失败）。**该检测目前尚未实现**（见 §9）。
- **scope 强制**：scope → `edit` 规则，scope 内 allow / 其余 deny。
  文件型 scope 必须同时产出 `x` 与 `x/*`（否则 `x/*` 匹配不到 `x` —— 这是实测踩过的坑）。
- **grants 白名单**：`question`/`form`/`edit`/`write` 永不可 grant（否则压掉常量 deny 与 scope 规则）。

### 6.6 新增状态文件

```
1. 定义 schema + 版本号（pair-v2 这种）
2. 写盘走 withLock + writeJsonAtomic（不自己造原子写）
3. 明确 single-writer（谁是唯一写入方；其他方只读）
4. 如果工程 session 也要写 → 同步改 prompts/build.md 的写盘契约取同一把锁
5. 加 .gitignore（运行时状态不进版本库）
```

### 6.7 支持新的委托目标（多 agent / 多工程）

- **多 agent**：brief 的 `agent` 字段已**白名单化**（v2.5，ADR-front-knowledge-capability D4）：`build` + `explore` / `librarian` / `oracle` / `metis` / `critic`。
  - `build` → `kind=engineering`：`scope` 必填，注入 scope 派生 `edit` 规则，可带 grants。
  - 只读 agent → `kind=knowledge`：`scope` 可省略/为空，**恒注入单条 `edit:* deny`**（绝不注入 scope allow），**grants 必须为空**，只登记 `pair.json`（`kind: "knowledge"`）、不写 `role.json` 的 `sessions` 分区。
  - 白名单对 `resume_session` 同样生效：resume 时校验 pair 条目的 `agent`，不在白名单则拒。
  - 换 agent 时仍要注意：**不同 agent 的 ask 清单不同**，`CONSTANT_DENY` 需要按目标 agent 调整。
- **多工程**：`stateRoot` 由 `project_dir` 推导（worktree 归一为主仓），pair.json 按工程仓各存一份。
  跨仓协作（如 hub-spoke）需要 `external_directory` grant —— 走 §6.5 的 grants 通道。
- **审计账本**：每次 `delegate` 追加一行 `.rddf/state/ledger.jsonl`（`kind` / `front_session_id` / `backend_session_id` / `outcome` / `host_outcome` / `blocked_reason` / `out_of_scope_files` / `changed_files` / `no_work_evidence` / `tool_calls` / `write_tool_calls` / `final_is_role_opening` / `model_switched` / 截断脱敏后的 `last_assistant_text`）。
  - 写入者只有本插件；与 pair/role 共用 `.rddf/state/.role.lock`。
  - **职责切分**：`pair.json` 是 resume 的访问控制判据，`ledger.jsonl` 只记录历史事实，**不参与 resume 校验**。
  - 行产生时机：校验失败/resume 失败不落行；busy 落一行（`outcome: "busy"`）；正常结束/超时各落一行。
- **交付面证据（静默失败检测）**：宿主把 run 记为 `succeeded` ≠ 工程 session 真的交付了东西——实测遇到过"模型在 run 中途被切换后重来，工程 session 只输出角色开场白就 idle"的形态，此时 `outcome=succeeded` 但 `changed_files=[]`。
  - delegate 因此回传一组**结构化证据**：`tool_calls` / `write_tool_calls` / `artifacts` / `final_is_role_opening` / `model_switched`，以及判定结果 `no_work_evidence`。
  - 判定规则（`lib/delegate-core.ts::summarizeDelivery`，纯函数可单测）：
    `no_work_evidence = (final_is_role_opening || model_switched > 0) && write_tool_calls === 0 && artifacts === 0`。
    判定为真时 **`outcome` 降级为 `unverified`**，宿主原值保留在 `host_outcome`（契约见 `ADR-delegate-delivery-evidence`）。
    - `model-switched` 是**根因信号**（宿主消息 `type == "model-switched"`，run 中途换过模型），不依赖任何文本格式；开场白匹配是辅助信号。
    - 写盘类工具口径：`edit` / `write` / `patch` / `apply_patch` / `multiedit`；**shell 不算**（无法从命令文本判定是否落盘），shell 写出的产物由 `artifacts` 兜底。
    - ⚠ **判定只看本轮消息**（`sliceRoundMessages(messages, baselineMessageID)`）：resume 时历史轮次的写盘调用会掩盖本轮零交付。找不到 baseline 时退回全量（宁可漏报不误报）。
    - ⚠ `artifacts` 是 **git 可见口径**：`.gitignore` 内、工程根外、worktree 内的改动都数不到 → `artifacts=0` 不是"什么都没改"的证明。

### 6.8 完成判据（DoD）

- [ ] 逻辑在 `lib/delegate-core.ts`，`plugins/` 只做接线
- [ ] `bun test tests/` 全绿，且新逻辑有单测（纯逻辑 + 契约）
- [ ] 真实运行时回归通过（门控矩阵 + 一次真实委托 + 越权被拒）
- [ ] 权限块改过 → `opencode service restart` 后再验
- [ ] prompt 改过 → 换 prompt **路径**或重启服务再验（改内容不生效）
- [ ] 使用手册 / 测试文档同步；ADR 记录新的边界取舍
- [ ] 没有把范围外的改动夹带进来（例：顺手刷新的 lockfile）

### 6.9 opencode 升级维护清单

宿主（opencode CLI）会升级，本仓库不会 —— 但**插件 API 与配置 schema 都由宿主定义**，所以升级会打到我们。
本节是升级的完整操作手册。

#### 6.9.1 先认清「什么会被升级、什么不会」

| 对象 | 路径 | 升级影响 |
|---|---|---|
| CLI 二进制 | `~/.opencode/bin/opencode`（curl-install 路径） | **被替换** ← 唯一被升级的东西 |
| 宿主注入的插件 SDK | `~/.opencode/node_modules/@opencode-ai/plugin`（随二进制分发） | **随宿主变化**（本机实测 1.19.0） |
| 治理面 | `~/.config/opencode`（配置 / prompt / 插件 / 文档 / 状态） | **不受影响** |
| 源码 checkout | `/workspace/project/opencode` | **不受影响**（updater 只处理已安装二进制；检测到 source checkout 会跳过） |

三条要记住的事实：

1. `opencode upgrade` **只替换二进制**，不动 config / state / data；
2. 自动更新策略默认 `notify`（只通知不自动换）——本仓库 `opencode.jsonc` 未设 `autoupdate` → 升级不会悄悄发生；
3. **源码 checkout 不是「已部署版本」**，它只是只读参考快照；治理仓 `package.json` 里钉的
   `@opencode-ai/plugin` 版本对本地 `.ts` 插件**不生效**（插件的 `@opencode/plugin` 由宿主注入）
   → 以宿主 bundle 的版本为准。

#### 6.9.2 升级前

```bash
opencode --version                      # 记下当前版本（回滚要用）
cd ~/.config/opencode && git status     # 必须干净；有未提交改动先提交
cp ~/.opencode/bin/opencode ~/.opencode/bin/opencode.bak-$(opencode --version)   # 备份二进制
```

- **备份二进制是唯一的回滚手段**（升级是就地替换）；
- 治理面的改动都在 git 里 → 配置侧回滚 = `git checkout`；
- 确认没有关键任务在跑（升级后必须重启服务才能生效）。

#### 6.9.3 升级动作

```bash
opencode upgrade                 # 最新版
opencode upgrade v2.2.5          # 指定版本（回滚也用它）
opencode service restart         # 让新二进制生效（服务是常驻进程）
```

#### 6.9.4 升级后回归清单（按顺序，约 1 分钟）

| # | 命令 | 期望 | 不满足时 |
|---|---|---|---|
| 1 | `opencode --version` | 新版本 | — |
| 2 | `opencode debug config` | **无** `configuration normalization diagnostic` | 症状 A |
| 3 | `opencode debug agents` | agent 数量不变；front 的 `shell` 首条仍是 `deny`、全文无 `*→allow`；`delegate` 矩阵 front=`[{*,deny},{*,allow}]`、其余 agent 仅 `[{*,deny}]` | 症状 B / C |
| 4 | `opencode plugin list` | `front-delegate` 在列；日志无 `failed to load plugin` | 症状 A |
| 5 | `cd ~/.config/opencode && bun test tests/` | 63 pass | 症状 D |
| 6 | `opencode run --agent front "在 /tmp/opencode/engproj 里新建 smoke.txt，内容 ok"` | 文件被真实写出 | 症状 E |
| 7 | `opencode debug agents` 的 agent 数量 | 与升级前一致（防止 agent 被静默丢弃） | 症状 A |

> 第 3 / 7 项要**对比升级前基线**：升级前先存一份 `opencode debug agents > /tmp/agents-before.json`，升级后 diff。

#### 6.9.5 症状 → 定位

| 症状 | 最可能的原因 | 定位动作 |
|---|---|---|
| **A.** `ServiceUnavailableError: Location plugins did not finish activating`；或**某个 agent 整个消失** | ① 插件 API 漂移（宿主换版本）② 配置 schema 漂移（V1 → V2 迁移） | 先 `opencode --print-logs ...` 看 `failed to load plugin` / `errors building`；再 `opencode debug config` 看 `skipped malformed recognized value`（配置被丢弃） |
| **B.** front 的 shell 规则变化（冒出 `*→allow`） | 权限归一化语义变化（last-match-wins 实现或 V1 对象式解码顺序变化） | 对比升级前后的 `debug agents` JSON；必要时把 front 的 shell 块改成**原生数组式**（顺序显式，见 §4.2） |
| **C.** `delegate` 工具不见了 | 门控 action 解析变化，或 `options.permission` 语义变化 | `opencode plugin list` + `debug agents` 看 `delegate` 规则是否还在 |
| **D.** `bun test` 挂 | 宿主 SDK 类型 / 行为变化 | 看失败断言是**类型层面**（宿主 API 变了）还是**逻辑层面**（我们的代码错了） |
| **E.** 真实委托不工作但单测全绿 | 宿主接线变了（`ctx.session.*` 语义） | 假 ctx 与真实宿主的差异（见 [测试文档 §6](./front-delegate-testing.md)）→ 补一条真实运行时的断言 |

#### 6.9.6 回滚

```bash
# 最快：用备份二进制覆盖回去
cp ~/.opencode/bin/opencode.bak-<版本> ~/.opencode/bin/opencode && opencode service restart
# 或指定旧版本重装
opencode upgrade v<旧版本> && opencode service restart
# 配置侧（独立于二进制）
cd ~/.config/opencode && git checkout <上一个 commit>
```

#### 6.9.7 升级后要同步的文档

- 本文的**上游行号引用**（§4.2、§10.2）会漂移 → 升级后重新核对
  （源码在 `/workspace/project/opencode`，但那是**旧快照**，需 `git fetch && git checkout <新 tag>` 再核对）；
- [测试文档](./front-delegate-testing.md) §8 的运行时验证清单保持有效（它就是升级后回归的最小集）；
- 若宿主 API 变了 → 改 `lib/delegate-core.ts` 的适配层，并重跑 §6.8 的 DoD。

#### 6.9.8 不要做的事

- 不要把 `/workspace/project/opencode` 当成「当前运行的版本」——它是只读参考快照，
  版本字段（2.1.2）与已装二进制（2.2.5）本就不一致；
- 不要用本地构建覆盖 `~/.opencode/bin/opencode`（会被 `opencode upgrade` 覆盖）。
  真要改上游：fork + 独立二进制 + `bun run dev` 跑开发版，把补丁维护成本显式记进 backlog；
- 不要依赖治理仓 `package.json` 里钉的 `@opencode-ai/plugin` 版本（宿主注入，本地 pin 不生效）
  ——以 `~/.opencode/node_modules/@opencode-ai/plugin/package.json` 为准。

---

## 7. 已知陷阱手册（全部实测踩过）

> **升级相关的症状**（插件加载失败、agent 消失、权限矩阵漂移）见 §6.9.5 的症状表。

| # | 陷阱 | 现象 | 正解 |
|---|---|---|---|
| 1 | **插件 TS 构建错误** | 报 `ServiceUnavailableError: Location plugins did not finish activating`，看不出是语法错 | 先看 `--print-logs` 的 `failed to load plugin` / `errors building` |
| 2 | **MCP 阻塞激活** | 同上 503，但插件没问题 | 隔离配置时去掉 `mcp` 块 |
| 3 | **setup 被中止** | setup 里的写盘文件没出现 | setup 只做注册；耗时工作放工具 `execute` |
| 4 | **`opencode plugin list` 不跑 setup** | 列出来了但 setup 没执行 | 用一次真实会话触发 location 激活 |
| 5 | **配置/插件/prompt 需重启服务** | 改了没反应 | `opencode service restart` |
| 6 | **prompt 文件改内容不生效** | 模型读到旧内容 | `{file:...}` 被服务缓存 → 换路径或重启 |
| 7 | **`opencode run --agent X` 延续旧会话** | 模型复用上一轮的 id | `--session <new-id>` 隔离 |
| 8 | **插件 ctx 按 location 绑定** | `ctx.permission.list` 看不到别的 location 的请求 | 跨 location 代答不可行 |
| 9 | **项目级 agent 配置被全局覆盖** | 项目 `opencode.json` 里的 `agent.front` 无效 | 全局 agent 块在后；要改就改全局 |
| 10 | **`external_directory` 不约束 shell** | `cat /etc/passwd` 成功 | shell 禁绝对路径（`* /*` deny） |
| 11 | **`outcome` 是陈旧值** | 运行中的 run 被报成成功 | baseline + 新活动判定 |
| 12 | **首次运行中的 session 无 idle** | busy 判不出来 | 用「最后消息时间 > 最后 idle」 |
| 13 | **文件型 scope 的 `x/*` 匹配不到 `x`** | 写入被拒 | 同时产出 `x` 与 `x/*` |
| 14 | **登记晚于 prompt** | 工程 session 角色退化为 `general` | registerSession 必须在 prompt 之前 |
| 15 | **单次 `git status` 误报越界** | 委托前就存在的脏文件被算成越界 | 前后差集 |
| 16 | **git 对象文件只读** | 复制 fixture 报 EACCES | 只复制工作树，重新 `git init` |

---

## 8. 运维 runbook

```bash
# 服务
opencode service status
opencode service restart

# 升级（详见 §6.9：升级前备份二进制，升级后跑 §6.9.4 的 7 条回归）
opencode --version
opencode upgrade                 # 指定版本：opencode upgrade v2.2.5

# 插件与权限
opencode plugin list
opencode debug agents | python3 -c "import json,sys;[print(a['name'],[x for x in a['permissions'] if x['action']=='delegate']) for a in json.load(sys.stdin)]"

# 日志（插件加载错误在这里）
tail -200 ~/.local/share/opencode/log/opencode.log | grep -iE "failed to load|errors building"

# 单测
cd ~/.config/opencode && bun test tests/

# 配置合法性（JSONC）
python3 -c "import json,re;json.loads(re.sub(r'^\s*//.*$','',open('opencode.jsonc.opencode-go').read(),flags=re.M));print('ok')"
```

---

## 9. 扩展点与未做的空间（backlog）

| # | 缺口 | 影响 | 建议做法 |
|---|---|---|---|
| 1 | **常量 deny 集与 build ask 清单的漂移检测未实现** | 漏拦 → 挂死；误拦 → 任务必失败 | 加一个测试：读 `opencode.jsonc` 的 ask 清单，与 `CONSTANT_DENY` 比对 |
| 2 | **scope 不约束 shell 写操作** | 工程 session 可在工程外写文件（实测发生过），且检测不到 | 给 session 补 shell 路径约束（`../` 也要防），或接受并写进报告 |
| 3 | **pair 过期清理策略未实现** | `remove` 默认 false → session 与 pair 无限累积 | 按 `last_used_at` + 条目上限淘汰（ADR D2 已把责任挂在这里） |
| 4 | **并发写盘未实测** | 锁只有插件一侧用（工程 session 侧未改） | 改 `prompts/build.md` 的角色切换写盘契约取同一把锁；补并发测试 |
| 5 | **跨会话代答仅同 location 可用** | 不能作为通用救援 | 已降级为"原地补 grant"；若要支持跨 location，需上游支持 |
| 6 | **`failed`/`interrupted` 返回结构未实测** | 结果判据不全 | 补两个构造用例（跑失败任务 / 中断任务） |
| 7 | **开场报状态、grants 预批未专项实测** | 属模型侧对话行为 | 补真实会话验证或接受现状（已在意向口径中标注） |
| 8 | **`unknown`（无新活动）路径未实测** | 结果可信度判据 | 构造"prompt 入队失败"场景 |
| 9 | **上游 matcher 绕过族** | shell 白名单非完备边界 | 升级 opencode 时回归 5 个守卫用例 |

---

## 10. 附录

### 10.1 术语

| 术语 | 含义 |
|---|---|
| **front** | 用户交互内核 agent；只对话 + 委托 |
| **工程 session** | agent=build 的工程 session，跨目录存在于目标工程 |
| **delegate** | 唯一的委托插件工具 |
| **brief** | front → 工程 session 的结构化交接单（九字段） |
| **grants** | 用户预批的特殊操作，随 session permissions 一次性定型 |
| **pair** | front session ↔ 工程 session 的登记（pair.json） |
| **scope 强制点** | scope → edit 规则，使 scope 外改不动（权限层） |
| **scope 检测点** | 前后 `git status` 差集 + scope 过滤（事后可见） |
| **门控** | `options.permission` 独立 action + 全局 deny + 仅 front allow |

### 10.2 上游源码索引（`/workspace/project/opencode`，只读参考）

| 主题 | 位置 |
|---|---|
| 工具注册与权限快照 | `packages/core/src/tool.ts`（`whollyDisabled` / `findLast` 在 293-296） |
| agent 权限合并顺序 | `packages/core/src/config/plugin/agent.ts`（91 / 104 / 122） |
| session 上下文与权限合并 | `packages/core/src/session/context.ts`（136） |
| 外部目录授权 | `packages/core/src/file-access.ts`（`authorizeExternal` 125 / `authorizeRead` 144） |
| shell 工具的权限断言 | `packages/core/src/tool/plugin/shell.ts`（138-140） |
| 插件 ctx 实现 | `packages/core/src/plugin/host.ts`（permission 414-447 / session 547+） |
| 插件 SDK 形态 | `packages/plugin/src/promise/plugin.ts`（`Plugin.define`） |
| 内置工具样板 | `packages/core/src/tool/plugin/opencode.ts`（namespace 用法） |
| 插件迁移指南 | https://opencode.ai/v2/docs/build/plugins/migrate-v1/ |

### 10.3 相关文档

| 文档 | 读者 |
|---|---|
| [front-delegate-usage.md](./front-delegate-usage.md) | 使用者 |
| [front-delegate-testing.md](./front-delegate-testing.md) | 改代码的人 |
| [dual-session-delegation.md](./dual-session-delegation.md) | 架构与排障 |
| [MULTI-AGENT-DESIGN.md](./MULTI-AGENT-DESIGN.md) | 全部 agent 的角色与权限总表 |
| ADR `.rddf/state/adr-front-agent-redesign.md` | 决策与取舍 |
| 验收报告 `.rddf/reviews/front-agent-redesign-acceptance.md` | 逐条判定与复现命令 |
| 探针报告 `.rddf/reviews/front-agent-redesign-p0-probes.md` | 实测结论（含推翻的设计假设） |
