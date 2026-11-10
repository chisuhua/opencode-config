# front + delegate 使用手册

> 面向**使用者**（不是实现者）。要改配置/插件看 [dual-session-delegation.md](./dual-session-delegation.md)；要看设计决策看 [ADR-front-agent-redesign](../.rddf/state/adr-front-agent-redesign.md)。

## 1. 这套东西是什么

一个**双 session** 工程架构：

- **front session**：跟你对话的前台。它不碰代码，只做三件事——判意图、读状态、组委托。
- **工程 session**：真正干活的 session（agent=`build`，跑完整角色矩阵），在目标工程目录里改文件、跑测试。
- **delegate 插件的五个工具**：front → 工程 session 的**唯一门控出口**（`~/.config/opencode/plugins/delegate.ts`）：
  `delegate`（同步等结果）/ `dispatch`（异步派发）/ `sessions`（只读看进度）/ `suspend`（暂停可续）/ `cancel`（终止）。

```
你 ──对话──▶ front ──delegate 工具──▶ 工程 session（build）──▶ 改文件 / 跑测试
             ▲                              │
             └──────── 结构化结果 ──────────┘
```

三条关键性质：

| 性质 | 含义 |
|---|---|
| **唯一门控出口** | front 的一切**工程行动**（文件变更）都经 `delegate` 插件；没有第二条写通道。注意「唯一」指**门控边界**（同一插件 + 每工具独立权限 action + 全局 deny + 仅 front allow），**不是工具名**——五个工具共用一套门控。理解性的只读调研可另召五个只读 subagent |
| **权限层强制** | front 的能力边界由 `opencode.jsonc` 的权限块决定，不是 prompt 里的承诺 |
| **front 专属** | 五个工具都只对 front 可见；其他 agent（含 build）调用时工具根本不存在 |
| **同一工作树单槽** | 同一个 git 工作树里，**同一时刻只允许一个后端在跑**（避免两个后端并发写同一批文件）。要并行 ⇒ 用不同的仓或不同的 git worktree |
| **知识 session** | `delegate` 也可用只读 agent（`explore`/`librarian`/`oracle`/`metis`/`critic`）建"知识 session"：无写权限、不登记角色、产物是回答 |

## 2. 快速上手

### TUI（推荐）

```bash
opencode /path/to/工程根        # 在目标工程目录启动
#   输入 /agent front            # 切到 front
#   然后直接说话
```

front 会自己判类：**问问题它自己答；要改代码它自动委托**。通常你不需要手工开第二个终端。

### CLI 单次

```bash
opencode run --agent front "帮我看看 X 模块是怎么设计的"
opencode run --agent front "把 tests/ 下缺的那几个用例补上"
```

### front 第一轮会主动报状态

新会话的第一轮，front 会先扫工程状态再回话：当前工程、进行到哪一步、接下来有哪些可选动作。
（状态来自磁盘快照，所以它会标注"状态读取于 \<时间\>"——工程 session 可能已经更进一步。）

> **口径说明**：本手册描述的行为分两类——
> **已实测**（有验收证据）：委托链路、权限边界、结果字段与 6 种 `outcome`（`succeeded` / `unverified` / `failed` / `interrupted` / `unknown` / `busy`）、scope 强制、
> grants 白名单拒绝、续接、busy、越界可见（见 `.rddf/reviews/front-agent-redesign-acceptance.md`）。
> **已实现但未专项实测**（模型侧对话行为，可能随模型/提示词变化）：
> ① 首轮主动报状态（ADR AC14）；② 需要额外权限时先向用户预批再委托（ADR AC15）。
> 这两条若表现不符，属于提示词/模型层问题，不影响权限层与工具层的强制效果。

## 3. front 的四类任务

| 你说的话 | 产物 | front 怎么做 | 你会看到 |
|---|---|---|---|
| "X 在哪 / 这模块怎么设计的 / 为什么这么写" | **回答** | 自己 `read`/`grep`/`glob` 读代码 | 直接给答案，**不建工程 session** |
| "改 / 加 / 修 / 跑测试" | **文件变更** | 组 brief → `delegate` | 工程 session 的结果 + 变更清单 |
| "现在什么进度 / 下一步做什么" | **状态摘要** | 读 `.rddf/state/`、`openspec/changes/*/tasks.md` 等 | 摘要 + A/B/C 选项 + 时间戳标注 |
| 不可逆动作 / 缺凭据 / 二义性 | **决策输入** | `question` 问你 | 选项，等你拍板 |

> front 不会"先读一下再决定要不要改"——它按你的意图直接归类。

## 4. 委托 brief：你不用写，但要知道它长什么样

front 组 brief 时用下面这张表（**你只提供素材，front 负责填**）：

| 字段 | 含义 | 缺了会怎样 |
|---|---|---|
| `project_dir` | 工程根绝对路径 | front 问你 |
| `agent` | 会话类型：`build`（默认，工程）或只读 agent（知识） | 默认 `build`；知识类任务 front 会显式指定 |
| `task` | 你的原话 | — |
| `goal` | 一句话目标（产物是什么） | front 问你 |
| `scope` | **允许改动的路径**（相对工程根或绝对） | 工程 session 必填（宁可窄不可宽）；知识 session 可为空 |
| `acceptance` | **怎么算完成**（能跑的命令 / 能勾的条目） | front 问你 |
| `constraints` | 额外禁止（"不要 commit""别动 X"） | 可选 |
| `grants` | 你已批准的特殊操作 | 可选（见 §5）；知识 session 一律不接受 |

### `scope` 是硬边界（会被权限层强制）

`scope` 不是建议：工程 session 的 `edit` 权限在建立时就被定成「scope 内 allow、scope 外 deny」。
**scope 外的文件它改不动**——实测中它试图改 scope 外的 `README.md` 时被权限层拒绝，并主动停下上报
（没有改用 `shell >>` 之类写法绕过）。

所以 `scope` 写窄一点是安全的。典型：

- 改单个文件 → `scope: ["src/foo.ts"]`
- 改一个目录 → `scope: ["src/", "tests/"]`
- 整仓重构 → `scope: ["."]`（放行全部 edit，但仍受 grants 约束）

### `acceptance` 要可判定

"代码写好了"不可判定；"`pytest tests/unit -q` 通过"可判定。front 会尽量把你的话翻译成可判定形式，
但**语义质量是 front 的责任**——插件只校验字段存在与类型，不替你补全。

## 5. `grants`：需要额外权限时，front 会先问你

工程 session **没有 UI**——任何需要你点"允许"的操作都会**永久卡死**。所以规则是：

> 需要特殊权限 → front **在委托前**一次性问你 → 你同意 → 该操作进 `grants` → 随 session 权限一起定型。

**可批准**（front 会说清具体是哪一条）：

| 类目 | 例子 |
|---|---|
| `shell`（具体单条）| `git push *`、`rm -rf *` |
| `read`（不含 `.env`）| 读某个具体文件 |
| `external_directory`（具体路径）| 读另一个仓库的某个目录 |
| `grep`/`glob`/`list`/`webfetch`/`websearch`/`lsp` | 只读类目 |

**永不批准**（工具会直接拒绝）：`question`、`form`、`edit`、`write`。
原因：这些一旦被批准就会破坏工程 session 的安全边界（例如 grant `question` 会让"向人提问"变成新的卡死源，
grant `edit` 会让 `scope` 的强制点失效）。

**不可逆动作**（push / 删分支 / 删数据 / 发布）不要一次放开一大片——单独说明、单独批准、单独一条 grant。

## 6. 结果怎么读

`delegate` 返回一段 JSON，front 会转述给你。看这几个字段：

| 字段 | 你该关心什么 |
|---|---|
| `outcome` | 见下表 |
| `blocked_reason` / `blocked_action` | **被权限拦了**。front 会原样告诉你被拒的是什么，并问你要不要追加一条 grant |
| `out_of_scope_files` | **改了 scope 外的文件**。front 必须点名告知 |
| `changed_files` | 本次实际新增/变更的文件 |
| `last_assistant_text` | 工程 session 的最终说明 |
| `no_work_evidence` | **没有交付证据**（`true`）——工程 session 可能只输出了角色开场白就结束，而宿主仍记为 succeeded。此时 front **不会**说"已完成" |
| `tool_calls` / `write_tool_calls` / `artifacts` | 交付证据的三个数：工具调用总数 / 写盘类调用数 / 本次产生的文件变更数（**git 可见口径**：被忽略、工程根外、worktree 内的改动数不到） |
| `final_is_role_opening` / `model_switched` | 最后一条文本是不是角色开场白 / 本轮是否中途换过模型（"停住"的两个信号） |
| `resumed_by_other_front` | 续接的是上次那个 session（正常：隔天回来继续） |

| `outcome` | 含义 | 你该怎么理解 |
|---|---|---|
| `succeeded` | 跑完了，且有交付证据 | 仍要看 `out_of_scope_files`、`blocked_reason` 是否为空 |
| **`unverified`** | **宿主报成功，但本轮没有可验证的交付证据** | **不能当成完成**——看 `host_outcome`（恒为 `succeeded`）与证据字段，问用户重试还是换做法 |
| `failed` | 任务本身失败 | 看 `last_assistant_text` |
| `interrupted` | 被中断 | 通常是你或环境中断了它，可以重来 |
| `unknown` | **没有新活动** | **不能当成成功**——没拿到可信结果，可重试一次 |
| `busy` | 上一次运行还在进行 | 等一会儿再委托；不要新建 session 顶替 |
| （无 `outcome` 字段）| 仍在跑 | 同上 |

### 典型后续动作

| 情况 | 做什么 |
|---|---|
| `blocked_reason` 非空 | 看清被拒的具体操作 → 决定是否追加一条 grant → 让 front 重新委托（**续接同一个 session**，不会全量重跑） |
| `out_of_scope_files` 非空 | 追问：是有意为之还是越界了；要保留就扩 `scope`，要撤销就让工程 session 回滚 |
| `outcome: unknown` | 让 front 重试一次；两次都 unknown 就是环境问题，看排障表 |
| 工程 session 说"任务没做完" | 追问它卡在哪一步；不要直接换个 session 重来（会丢上下文） |

### `suspend` 失败时的三种形态（看 `reason`，不要一律重试）

`suspend` 返回 `suspended:false` 时，**`reason` 决定下一步**：

| `reason` | 含义 | 该做什么 |
|---|---|---|
| `slot_already_released`（常带 `idempotent:true`） | 该后端**已不在占槽**（此前已释放过） | **不用再 `suspend`、也不必 `cancel`** |
| `wait_no_op` | 停机确认已返回、但仍判定**可能仍在跑**（可能被再次唤起） | **不要反复重试 `suspend`**；先停下其它派发，确认它确实在跑再用 `cancel` |
| `degraded_no_evidence` | 该运行时的 `session.wait` 不可用 ⇒ 无正面证据 | 用 `cancel`（有意的保守侧，不是故障） |

另有 `slot_reclaimed` / `slot_state_changed`：槽位归属在停机窗口内已被别的派发改动 ⇒
本次**未释放**槽位 ⇒ 用 `sessions` 确认当前占槽者再决定。

### 多实例部署（`foreign_instance:true`）

若 `suspend` 的返回里带 `foreign_instance:true`，说明本 state dir 里**有 ≥2 个存活实例**
（另一个 opencode 进程也在用这个仓）。此时本实例**看不到**别的实例上的 execution ⇒
无法确认该后端已停 ⇒ 保守地**不释放槽位**。

- 想终止它：用 `cancel`。
- 它**本来就空闲**时：`cancel` 是空操作（不会终止）；槽位会由**下一次派发**的回收顺带释放。
- 这是有意的保守侧（宁可占着槽，也不误放）。

## 7. front 的权限边界（权限层强制，非 prompt 承诺）

| 能力 | front | 说明 |
|---|---|---|
| 读工程代码、读状态文件 | ✅ | 跨目录受 `external_directory` 约束：只放行 `/workspace/**` 与治理面目录 |
| 只读 shell（`ls`/`rg`/`git log`…）| ✅ | **只读白名单**；且**禁止绝对路径**（跨目录读请用 `grep`/`read` 工具） |
| `question` 问你 | ✅ | |
| `delegate` 委托 | ✅ | 唯一工程通道 |
| 改工程文件 | ❌ | `edit`/`write` deny |
| 调 subagent / skill | ❌ | deny |
| 跑 shell 脚本绕过 delegate | ❌ | `bash -c`/`python3 -c`/`curl` 等都不在白名单 |

> 你会注意到 front 有时"读不到"某个目录——那是 `external_directory` 的路径白名单在起作用，
> 不是 bug。要放开某个路径，让 front 走 `grants` 流程（会先问你）。

## 8. 工程 session 侧发生了什么（想了解实现细节时看）

1. **权限定型**：建立 session 时把权限一次性定成
   `[常量 deny（build 的 ask 类目 + question + form + MCP 写）, scope 的 edit 规则, 你的 grants]`。
   ask 类目一律落成 deny → 快速失败，而不是卡死。
2. **角色登记**：建立后**立刻**写 `<工程>/.rddf/state/pair.json`（pair-v2）与 `role.json` 的
   `sessions` 分区——所以工程 session 开局就拿到自己的角色（`builder`），不会退化成 `general`。
3. **scope 强制**：scope 外的 `edit` 被拒（权限层）。
4. **续接**：再次委托时，front 用 `resume_session` 续接**同一个**工程 session（不新建、不丢上下文）。
   访问控制 = 该工程 `pair.json` 里的登记表 + `canonical_root` 一致。

## 9. 常见场景

### 场景 A：补测试

> "tests/unit 下缺 XXX 的用例，补上。"

front 会问/推断 `scope`（一般是 `tests/`）与 `acceptance`（一般是 `pytest tests/unit -q` 通过），
然后委托。工程 session 改完后你会看到 `changed_files` 列出新增的用例文件。

### 场景 B：查代码

> "XXX 函数在哪实现的？"

front 自己读，不建工程 session。回答里会带时间戳标注。

### 场景 C：看进度

> "现在到哪一步了？"

front 读状态文件给摘要 + 下一步选项。注意这是**磁盘快照**，工程 session 可能已经更进一步。

### 场景 D：被权限拦了

> "把这个发布到预发环境。"

需要 `git push` 类权限 → front **先问你**"需要 push，允许吗" → 你同意 → 委托时带上那条 grant。
如果委托途中仍被拦（`blocked_reason`），front 会报出被拒操作，你批准后**续接同一 session** 继续。

### 场景 E：隔天回来继续

> "继续昨天那个改 README 的活。"

front 从该工程的 `pair.json` 找到登记的工程 session，续接它（`resumed_by_other_front: true` 是正常的）。
上下文不丢。

### 场景 F：跨仓库

> "把 Hub 仓库的契约同步到本地。"

需要读另一个仓库 → `external_directory` 默认 deny → front 会问你是否放开该路径（走 grants）。

### 场景 G：同时推进多个任务（并发派发）

> "这三个模块的改造并行做，别一个一个等。"

front 会用 **`dispatch`**（异步派发）分别派出去，每个后端**立即返回**、互不等待。

⚠️ **`dispatch` 返回 ≠ 任务完成**——它只证明"简报已投递并被确认取走"，**不证明活儿干完了**。
要结论必须问进度（场景 H）或用 `delegate` 同步等。

⚠️ **同一个工作树仍是一次一个**（单槽）。三个模块在同一仓的同一工作树里 ⇒ 只能串行；
要真并行，先给每个后端准备独立工作树（`git worktree add`），再分别 `dispatch` 到各自目录。

### 场景 H：问后端进度

> "刚才那三个后端现在什么状态？"

front 用 **`sessions`** 查看。它是**只读**的——只看不动，**不会**给后端投递任何消息（所以查多少次都不会污染后端上下文）。

返回里会给出整体结论（进行中 / 已终结 / 无可验证交付）以及**每个后端的明细**。
`无可验证交付` 的意思是"跑完了但没找到可验证的产物"，**不等于**"没有产出"（产物可能落在 git 视野外）。

### 场景 I：临时切走，稍后再回来

> "先停下 A，让 B 跑；A 那个别丢，晚点接着做。"

front 会用 **`suspend`** 暂停 A（**保留上下文**，不是杀掉），再 `dispatch`/`delegate` 让 B 上。
之后想回到 A，用**同一个目标**续接即可，A 的历史还在。

⚠️ 如果 A 刚派发、简报还没被确认取走（状态 `dispatching`），front **不能** suspend 它——
这时只能用 `cancel`（因为那份没被取走的简报会在恢复时抢先执行）。

### 场景 J：这个任务不要了

> "算了，A 那个不做了。"

front 用 **`cancel`**。这是**终止**：后端被标为墓碑，**永久不能再续接**，再派必须新建。
若后端其实已经跑完了，`cancel` 是空操作（不会误伤）。想保留上下文就改用 `suspend`。

## 10. 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| front 工具列表里没有 `delegate` / `dispatch` / `sessions` / `suspend` / `cancel` | 插件没加载 / 服务没重启 | `opencode service restart`，再 `opencode plugin list` 看 `front-delegate` 在不在 |
| 派发被拒，错误里有个后端 id | 同一工作树已有活跃后端（单槽） | 让 front 先 `suspend` 那个后端再派；或换到另一个 git worktree |
| `dispatch` 返回 `state: "dispatching"` | 简报已入队但**未被确认消费** | 该后端暂不可 `suspend`；让 front 稍后用 `sessions` 复查，或 `cancel` 后重派 |
| `sessions` 报「槽位疑似悬挂」 | 登记说占槽、实际已不在跑且超出阈值 | 让 front `suspend` 回收（幂等），之后可重新派发 |
| front 改了配置没生效 | 后台服务缓存了配置 | `opencode service restart` |
| front 读某个目录被拒 | `external_directory` 路径白名单 | 正常行为；需要就授权 |
| `outcome: busy` | 目标工程 session 还在跑 | 等一会儿重试 |
| `outcome: unknown` | 没有新活动，结论不可信 | 重试一次 |
| `ServiceUnavailableError: Location plugins did not finish activating` | ① 插件构建失败 ② MCP 启动阻塞 ③ 插件 setup 迟迟不 settle | 先 `opencode --print-logs ...` 看 `failed to load plugin`；再查 MCP；最后怀疑插件 API |
| 改了 prompt 文件内容但没变化 | `{file:...}` 引用被服务缓存 | 换文件名，或重启服务 |

## 11. 已知限制

1. **shell 白名单不是完备边界**：上游的命令匹配器有绕过族（重定向、`--opt=value` 截断、零节点跳过）。
   本环境实测 5/5 拦截，但升级 opencode 时需要回归验证。
2. **scope 只约束 `edit`**：工程 session 的 shell 写操作不受 scope 约束（工程外的写入检测不到，
   只能靠工程 session 自报）。详见 ADR 风险段。
3. **工程 session 的 `shell` 权限来自 build 自身规则**，比 front 宽得多——这是有意的（工程 session 要真干活）。
4. **front 的状态摘要是磁盘快照**，不是工程 session 的内存现场。
5. **单槽保证有个前提**：后端 session **只经由这五个工具操作**。你若在 TUI 里直接对后端 session 打字或追加指令，
   会产生插件看不见的排队指令，可能在后端恢复时被注入——这属于**明确声明的超出范围**。

## 12. 相关文档

| 文档 | 内容 |
|---|---|
| [front-delegate-architecture.md](./front-delegate-architecture.md) | **开发者架构文档**：全图、机制根因、开放指南、陷阱手册 |
| [dual-session-delegation.md](./dual-session-delegation.md) | 架构、brief 模板、权限边界、排障 |
| [front-delegate-testing.md](./front-delegate-testing.md) | **测试文档**：怎么跑测试、覆盖矩阵、新增测试的写法 |
| [MULTI-AGENT-DESIGN.md](./MULTI-AGENT-DESIGN.md) | 全部 agent 的角色、权限对比、委派拓扑 |
| [CHANGELOG.md](./CHANGELOG.md) | 变更历史 |
| ADR `.rddf/state/adr-front-agent-redesign.md` | 架构决策与取舍 |
| 验收报告 `.rddf/reviews/front-agent-redesign-acceptance.md` | 逐条验收判定与复现命令 |
