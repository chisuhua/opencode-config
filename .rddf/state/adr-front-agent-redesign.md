# ADR-front-agent-redesign：front agent 重设计（交互内核 + delegate 插件工具化 + 权限门控）

## 元数据

| 字段 | 值 |
|------|-----|
| Status | Accepted——2026-11-06 **核心链路**验收通过（13 PASS / 3 PARTIAL / 1 条判据需改 / 3 条未实测，均已登记为已知缺口，见 `.rddf/reviews/front-agent-redesign-acceptance.md` 与 improvement 的「已知缺口」；**非终验全绿**）；**2026-11-09 部分条款被取代** |
| Date | 2026-11-05 |
| Author | architect |
| Parent | 部分取代 `adr-double-session-delegation.md`：决策 1 / 决策 4 作废；决策 3 的「无锁 last-write-wins」被本文 D6 取代；决策 2 继续有效 |
| 关联 change | `openspec/changes/front-knowledge-capability/`（本篇工作已由该 change 一并收口与验收；本篇 AC1–AC17 见 `.rddf/improvements/front-agent-redesign.md`） |
| AC 映射 | 见 improvement `.rddf/improvements/front-agent-redesign.md` 的 AC1–AC17（2026-11-06 由 builder 按已批准的实施路径回填，architect 可复核） |
| 审稿报告 | `.rddf/reviews/adr-front-agent-redesign-review.md` |
| **被取代条款（2026-11-09）** | ① **D4 的「`subagent` 保持 `deny`」作废** → 由 `docs/adr/ADR-front-knowledge-capability.md` 取代（front 放行五个只读 agent；D2.1 追加**规则顺序是硬约束**：`"*": "deny"` 必须是**第一条**，放末尾会被 opencode 的工具可见性判定把整个工具隐藏）。② **D2 的 outcome 枚举被扩展** → 由 `docs/adr/ADR-delegate-delivery-evidence.md` 取代（新增 `unverified`＝宿主成功但无交付证据；另 `busy` 早已在实现中漂移进来，本文枚举未回写）。③ **D3 的 scope 语义已收窄**：`scope` 必填与 scope 派生 `edit` 强制注入**仅对 `kind=engineering` 继续有效**；知识 session 的 `scope` 可选且忽略、只读 agent 恒注入单条 `edit:* deny`、永不注入 scope 派生 allow；`grants` 对知识 session 一律禁收；登记扩展 `kind` 字段且 knowledge 只写 `pair.json` 不写 `role.json` 的 `sessions` 分区（见 `ADR-front-knowledge-capability` D4 **H2**/H2'/H2''/H3）。④ 本文的**其余条款继续有效**（baseline 校验、grants preflight、pair/role 登记与 flock、不回传 transcript、`external_directory` 不约束 shell 的 D4.1）。**当前态请以三篇 `docs/adr/` 下的 ADR + `docs/MULTI-AGENT-DESIGN.md` 为准。** |

## 背景与问题

`front` agent 已存在于 `opencode.jsonc.opencode-go`（`mode: primary`，职责"只对话、不改代码"），但**纸面职责与权限实现不一致**，且委托实现落后于 OpenCode v2 的插件能力。

1. **shell 权限形同虚设**。`agent.front.permission.shell` 共 78 条规则，首条 `"*": "allow"`，其后仅 30 条 deny。按 last-match-wins，未被 deny 命中者一律放行——`bash -c` / `python3 -c` / `curl` / `mv` / `cp` / `tee` / `dd` / `chmod` / `make` / `cmake` 全部可执行。
2. **委托链路是外部脚本 + 自研 HTTP 协议且有缺陷**。`scripts/delegate.sh` 每次 `start` 新建 session（无续接）、`wait` 用 `.data.outcome` 判空闲、`pair.json` 只读不写；`scripts/captoken.sh` 的 capability token 是为"front 直连 HTTP 端点"设计，插件化后 front 不需要任何 token。
3. **front 缺工程目录放行**：`external_directory: "ask"`，用户已要求对工程目录 `allow`。
4. **交互范式散在 `guide` skill**：状态扫描、菜单式意图路由本应是 front 能力，front 目前只有极简"歧义就问"。

OpenCode v2（已装 v2.2.5）的插件能力足以承载委托，以下机制**均已实测**：插件注册新工具 `ctx.tool.transform(editor.add)`；工具独立权限 action `options: { permission: "delegate" }`；跨目录建并驱动 session `ctx.session.create/prompt/wait/get/context/remove`；建 session 时预置 `permissions`。

核心问题：**把"front 说、工程 session 做"从「prompt 君子协定 + 自研 HTTP 代理」改成「权限层约束 + 插件工具承载」。**

## 决策

一条主决策：**front 收敛为只读交互内核；一切工程行动经唯一的 `delegate` 插件工具转交工程 session；front 的能力边界以权限层为主要强制点（已知残余绕过面见 D4），不再依赖 prompt 里的君子协定。**

### D1 四分类路由

| 类别 | 判据（产物是什么） | 出口 |
|---|---|---|
| 理解性 | **回答** | front 自己答：`read`/`grep`/`glob`/`list` |
| 实施性 | **文件变更** | `delegate`（D2），agent=`build` |
| 流程性 | **状态摘要** | front 读磁盘快照出摘要，**必带新鲜度标注**（D7） |
| 需裁决 | 缺**决策输入**（不可逆动作 / 缺凭据 / 二义性） | `question` 直接问用户 |

禁止混类：不得"先读一下再决定要不要改"。路由判据必须落到上表右列之一的产物形态。

### D2 `delegate` 插件工具（唯一工程通道）

载体 `~/.config/opencode/plugins/delegate.ts`：`Plugin.define({ id, setup })` + `ctx.tool.transform(editor.add)` 注册**一个**工具 `delegate`。

执行序列（全为插件 ctx 原语，**禁止 HTTP 回环**）：

```
0. 若 resume_session：校验其在 pair 登记表内且 canonical_root 匹配 project_dir，否则拒绝
1. create（带 D3 grants 的 permissions）或 resume
2. baseline = 当前最后一条消息 id + time.idle
3. prompt → wait
4. 校验有新活动（最后消息 id > baseline 或 idle 前进）；无新活动 → {outcome:"unknown", still_running:true}，不得采信旧 outcome
5. get(outcome) + context(扫 permission-denied 标记，见 D5)
6. remove 仅在 brief.remove === true 时执行，并同步清登记表
```

返回结构化摘要：`session_id` / ~~`outcome`（`succeeded|failed|interrupted|unknown`）~~ **（本枚举已被取代：现为 `succeeded`/`unverified`/`failed`/`interrupted`/`unknown`/`busy`，见元数据「被取代条款」②）**/ `blocked_reason` / `last_assistant_text` / `out_of_scope_files` / `status_age`。**不回传整段 transcript。**

三处硬约束：

- **baseline 校验**：`wait` 返回不等于新 run 结束，`get(outcome)` 是"最后一次已结束 run"的陈旧值；无 baseline 校验必把运行中的 run2 报成 run1 的成功。
- **默认不 remove**：与 `resume_session` 互斥（remove 后无从续接）。清理依赖 pair 登记表的 `last_used_at` 过期策略，不靠工具默认删。
- **resume 必须查登记表**：front（LLM）可幻觉 session_id；只做存在性检查会把 prompt 注入同项目其他 session。登记表即访问控制（只能续接本工程 `pair.json` 登记过的 session）+ `canonical_root` 必须一致。**不硬校验 `front_session_id`**（实施期修订）：每次新对话都是新 front session，硬校验会让"隔天回来继续"这种正常用法失效；改为在返回值里给软信号 `resumed_by_other_front`，由 front 告知用户。

### D3 委托简报契约（brief）

| 字段 | 必填 | 语义 |
|---|---|---|
| `project_dir` | 是 | 工程根绝对路径 |
| `task` | 是 | 用户原话或等价转述 |
| `goal` | 是 | 一句话目标（产物是什么） |
| `scope` | 是 | 允许变更的路径前缀列表；**有强制点**（见下） |
| `acceptance` | 是 | 可判定完成判据（仍建议可重入，但已不是救援成立的前提，见 D5） |
| `constraints` | 否 | 明确禁止的动作 |
| `grants` | 否 | 本任务预计需要的 ask 类目 `[{action, resource}]`，**一次性**进入 session permissions（D5） |
| `resume_session` | 否 | 续接既有工程 session（受 D2 第 0 步校验） |
| `remove` | 否 | 默认 `false` |

`scope` 需**两个落点**（只写进 brief 文本等于建议）：

- **强制**：插件把 `scope` 翻译成工程 session 的 session 级 `edit` 规则（scope 内 allow、其余 `edit` deny），依赖 last-match-wins 覆盖 build 的 `edit: allow`。
- **检测**：委托**前后**各跑一次 `git status --porcelain`，取**差集**作为本次变更文件，再按 `scope` 过滤出 `out_of_scope_files`。（只跑一次会把委托前就存在的脏文件误报为越界——实施期实测发现并修正。）

缺项由 front 用 `question` 补齐，禁止插件猜。

### D4 front 工具面白名单化（并声明其不完整性）

`permission.shell` 从 `"*": "allow"` + 30 deny 改为三段式：

1. `"*": "deny"` 打头；
2. 逐条 allow 只读命令（`rg`/`grep`/`ls`/`cat`/`head`/`tail`/`wc`/`sort`/`uniq`/`diff`/`file`/`stat`/`tree`/`du`/`df`/`which`/`basename`/`dirname`/`readlink`/`realpath`/`tr`/`cut`/`printf`/`date`/`test`/`expr`/`seq`/`nl`/`column`/`find` 与 git 只读族 `log|show|diff|status|blame|ls-files|rev-parse|ls-tree|cat-file|show-ref|shortlog|count-objects|verify-commit|config --get|remote -v|stash list|worktree list`）；
3. **尾部守卫 deny**（靠 last-match-wins 压过第 2 段）：`"* > *"`、`"* >> *"`、`"find * -exec*"`、`"find * -execdir*"`、`"find * -delete"`、`"find * -fprint*"`、`"find * -fprintf*"`、`"sort * -o*"`、`"tee *"`、`"git * --output*"`、`"git * --format*"`、`"git * --pretty*"`、`.env` 读取族。

`bash -c`/`sh -c`/`python3 -c`/`node -e`/`curl`/`wget`/`mv`/`cp`/`rm`/`dd`/`chmod`/`make`/`cmake` **不在白名单**，由第 1 段兜住。

**必须明说的限制**：v2 的 shell 权限是对 tree-sitter 解析出的命令节点文本做 glob 匹配，存在一族上游已确认绕过——重定向写文件（`sort a > b`）、`--opt=value` 之后参数不可见（`git log --output=f`）、`find -fprint`、以及**命令串解析出 0 节点时整个权限检查被跳过**（裸 `> file`，上游 issue #49948；参数截断见 #54393）。因此：

- 第 3 段守卫是**尽力而为**，不是完备边界；
- `> file` 这类零节点路径**规则层无法拦截**，只能靠"front 的 shell 不接触用户可控的原始命令串"这层使用约束；
- 「不改代码」由**权限层为主 + 上述残余风险已知**共同成立，不再宣称"权限层完全强制"。

其余工具面：`edit`/`write` 保持 `deny`；`skill`/`subagent` 保持 `deny` **（`subagent` 一项已被取代，见元数据「被取代条款」①）**；`question` 保持 `allow`；`read`/`grep`/`glob`/`list`/`webfetch`/`websearch`/`lsp` 保持 `allow`；**新增** `delegate: allow`（D6）。

**D4.1（实施期补入，必需闭环）—— `external_directory` 不约束 shell。**

上游确认：`read`/`grep`/`glob` 都调用 `FileAccess.authorizeExternal`（受 `external_directory` 约束）；`shell` 只 assert `action:"shell"` + 命令文本资源，**完全不查 external_directory**。实测：仅把 `external_directory` 改成路径对象后，front 用 `cat /etc/passwd` **成功执行**（泄漏内容）。

因此 front 的 shell 规则追加 **`"* /*": "deny"`** —— shell 内禁止任何绝对路径参数（命令文本含 `" /"` 即拒），跨目录访问一律走 `read`/`grep`/`glob`（这三个受 external_directory 约束）。复验：shell `cat /etc/passwd` 被拒；`grep` path=/workspace/... 放行；`grep` path=/etc 被 `external_directory` 拒。

`external_directory` 由 `"ask"` 改为**路径对象**形式（已实测可用；判定资源为 `<目录>/*` 与 `<projectRoot>/*`），只放行 `/workspace/**` 与 `/home/ubuntu/.config/opencode/**`，**不写 `"*": "allow"`**。

**守卫拦截率实测（本环境 v2.2.5）**：5 个守卫用例（重定向 / `--output` / `--format` / `-fprint` / 裸重定向）**拦截率 100%**、无副作用文件产生，正例放行。这是当前版本的事实，**不保证未来版本不变**。

### D5 无人值守语义：preflight grant 而非事后救援

工程 session 无 UI，任何 `ask` **永久挂死**。三条规则：

1. **常量 deny 集**（插件内常量，非用户输入、非 front 拼装）：把 build agent 的 `ask` 类目显式落成 `deny`（快速失败），顺序固定为 `[常量deny..., ...scope edit 规则, ...grants]`。
2. **`question` 必须在常量 deny 集内**——工程 session 的 `question` 目前是 `allow`，被 deny 后模型转去 `question` 会同样挂死。只转 `ask` 类目等于只堵一半挂死源。
3. **grant 是 preflight 不是 rescue**：brief 的 `grants` 在委托前由 front 向用户一次预批（"这个任务需要 push + 读 .env，允许吗"），随 create 进入 session permissions。把救援前移，消灭绝大多数重启。

救援路径（run 中途仍被 deny 时）：插件从 `context` 的消息 part 中扫描权限阻断标记得到 `blocked_reason`（**不看 `outcome`**——deny 抛给工程 session 的模型后，模型通常放弃并输出文本，`outcome` 仍可能是 `succeeded`），front 用 `question` 请用户裁决，同意则**原地补 grant**。

**D5.1（实施期修订，救援形态改变）**：原设计假设"permissions 只能在 `session.create` 时写 → 救援只能建新 session → 全量重跑"。**实测该假设不成立**：`ctx.session.update({ sessionID, permissions })` **可以原地改已建 session 的权限**（建时 `[{shell, git status *, allow}]` → update 后 `[{*, *, allow}]`）。因此救援降级为**原地补 grant 后继续**，不新建 session、不全量重跑；`acceptance` 的"命令必须可重入"从"救援成立的前提"放宽为"建议"（仍建议保留）。这消掉了"长任务尾部被阻断 → 整段重跑 → 再撞下一个 ask 类目 → 多轮后诱发过宽授权"的连锁。

**D5.2 阻断标记的两种形态**（实施期实测，供 `blocked_reason` 提取）：

| 形态 | 出现位置 | 结构 |
|---|---|---|
| A 规则级拒绝 | 工具结果 | `{"error":{"type":"permission.rejected","message":"Permission denied: <action>"}}` |
| B 用户显式拒绝 | 消息 part 内 | `{"type":"tool","state":{"status":"error","error":{"type":"aborted","message":"The user declined this tool call"}}}` |

两种形态的 `state.status` 均为 `error`，提取规则：扫 `content[]` 中 `type==="tool" && state.status==="error"`，取 `state.error.type` ∈ {`permission.rejected`, `aborted`} 且 message 含 `Permission denied` / `declined` 的项。

**明确不做**跨会话代答权限请求。理由见选项对比表。

**D5.3（实施期实测）代答路径的可用边界**：插件 ctx **按 location 绑定**。实测：工程 session 与插件**同 location** 时，`ctx.permission.list` 能看到 pending 请求、`ctx.permission.reply(decision:"reject")` 返回 `ok`；**跨 location 时 list 返回 `[]`（完全不可见）**。而 front 与工程 session 通常分属不同 location，因此代答**不能作为通用救援路径**，只能作同 location 兜底。选项对比表中该项由"否决"改为"条件性保留"。

### D6 门控与登记（`delegate` 仅 front 可得）

注册时声明 `options: { permission: "delegate" }`，使权限 action 名独立于工具名；全局 `permission.delegate = "deny"` + `agent.front.permission.delegate = "allow"`。判定点 `Tool.snapshot` → `whollyDisabled(tool.options?.permission ?? name, rules)` → `findLast`。实测 front 得 `[{*,deny},{*,allow}]`，其余 agent 只有 `[{*,deny}]`，`--agent plan` 调用时答 `NO_TOOL`。

**登记与并发协议**：

- `role.json` 的 `sessions` 分区 + `pair.json` 由 `delegate` 在建 session 时 upsert（`current_role` / `auto_switch_window: null` / `auto_answer: null`）。否则新 session 无分区 → 落 `general`，角色矩阵失效（现状 `sessions` 只有 `legacy`）。
- **锁**：`.rddf/state/.role.lock`（flock）包住 role.json 与 pair.json 的**全部 RMW**。写入方不止插件一个——工程 session 自己按角色矩阵写 role.json 顶层与 history，`scripts/role-migrate-v2.sh` 整文件改写。atomic rename 只防撕裂读、**不防丢失更新**。本决策**取代**旧 ADR 决策 3 的"无锁 last-write-wins"；工程 session 侧的角色切换写盘契约必须改用同一把锁（跨两份 ADR 的义务，落地时同步）。
- **`pair.json` 升 `pair-v2`**：`pairs: { <engineering_session_id>: { front_session_id, canonical_root, registered_at, last_used_at } }`。旧单槽 schema 与"一 front 对 N 工程 session（含 resume）"模型不匹配——第二个 session 会覆盖第一个，把 D6 要解决的问题原样造回来。
- **`setup()` 禁止任何写盘**：全局插件目录对每个 location 各加载一次（实测 6 目录 6 次、同进程）；写盘只允许出现在工具 execute 路径。

### D7 `guide` 的归宿：只并入交互，不并入执行

front 吸收 `guide` 的交互部分：状态扫描摘要、菜单式意图路由（"下一步做什么"给 A/B/C）、新 session 开场报状态。**不吸收**执行部分：rdd-* skill 调用、状态文件写入、roadmap 变更留在工程 session（front `skill: deny` 已强制）。`guide` skill 不删。

**新鲜度标注（强制）**：流程性摘要必须带"状态读取于 `<mtime|ISO>`，工程 session 现场可能更新"。理由：front 读的是磁盘快照，滞后于工程 session 内存现场（未提交改动、跑了一半的测试）；状态文件写入非原子，可能读到半成品；多 session 时文件不标注谁做了什么。不加标注会把快照当事实报给用户。

### D8 调试与降级纪律

**D8.1 实施期新增的运维事实**（实测，均已回写 `docs/dual-session-delegation.md` §6）：

| 事实 | 处置 |
|---|---|
| 改配置或插件后需 `opencode service restart`（后台 service 缓存配置与插件模块） | 改配置/插件后必须重启服务再验证 |
| 改 prompt 文件的**内容**不生效、换**路径**才生效（`{file:...}` 引用被 service 缓存） | 验证期改 prompt 用新文件名 |
| `opencode run --agent X` 会延续同 agent 的最近会话 | 探针需 `--session <new-id>` 隔离，否则模型会复用上一轮上下文里的 id |
| 插件 `setup()` 在 location 销毁前会被中止 | setup 只做注册；耗时工作放工具 `execute` |
| 插件 ctx 按 location 绑定 | `ctx.permission.list/reply` 只能看到同 location 的 session |
| MCP 启动会阻塞 location 激活 | `ServiceUnavailableError: Location plugins did not finish activating` 的常见真因 |

原纪律保留：

- `--standalone` 下 location 插件**不会正常激活**（实测 setup 未进入，`debug agents` 报 `Location plugins did not finish activating`）→ 开发与验收必须走后台服务；`delegate` 不可见时 front 必须显式报错并引导，不得静默退化。
- 插件 TS **构建错误**的表现是"插件加载失败 → 激活不完成 → `ServiceUnavailableError`"（`--print-logs` 可见 `failed to load plugin` / `errors building`），不是明确语法提示。排查顺序固定为：先看构建错误，再怀疑 API。
- 插件内 `process.env.OPENCODE_SERVER_URL`（`http://localhost:4096`）与实际服务端口不一致，任何 fetch 兜底都会 `ECONNREFUSED` → 插件内禁 HTTP。

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **插件自定义工具 + `options.permission` 门控**（选中） | 采用 | 唯一同时满足三条：进程内驱动 session（无需凭证/token）、权限面可被 `opencode.json` 强制、原语齐备（create/prompt/wait/get/context/remove + session permissions）。已端到端实测。 |
| MCP server 承载 delegate | 否决 | 需外部署进程并解决回连认证；v2 只有 MCP 工具级 `allow/deny`，做不出"仅 front 可见一个工具"；跨进程取结果仍要回环 HTTP。成本高于收益。 |
| 沿用 `delegate.sh` + capability token | 否决 | token 唯一理由是"front 直连 HTTP 只有限端点"；插件化后 front 不持凭证、不发 HTTP，token 失去对象。脚本侧 `wait` 判据、无续接、`pair.json` 缺陷也需重写，等于旧壳装新实现。 |
| 改上游 opencode 源码 | 否决 | 所需原语在 v2.2.5 全部存在，无缺口；维护成本转移到 fork 同步。但上游 scanner 绕过 bug（#49948 / #54393）影响 D4 安全等级，须在升级流程回归守卫 deny 清单。 |
| 保持 `shell "*": allow` + prompt 约束 | 否决 | 权限层实际放行 `bash -c` / `python3 -c` / `curl`；"不改代码"不可验证，不能作安全边界。 |
| 跨会话代答权限请求（`permission.list`+`reply`） | **条件性保留**（D5 不用） | 设计上优于"新 session 全量重跑"：不丢上下文、不重跑、可审计；对"用户逐次明示"也不构成绕道。**当前不采用的真实原因是实现未验证成功**（且插件 ctx 无 `session.form`，`ask` 无法完整代答），属实现状态而非设计优劣。若未来 SDK 把跨 session reply 做成受支持路径，应作为 D5 救援路径的优先替代重新复审。 |
| 事后 grants 救援（仅靠重委托） | 否决（改为 preflight） | 长任务尾部被阻断 → 整段重跑，且可能撞上下一个 ask 类目，多轮后诱发"一次过宽授权"。故 grants 前移为委托前预批（D5.3）。 |

## 后果 / 代价

**正面**

- front 边界从 prompt 承诺变为权限层强制（shell 三段式 + `delegate` 单通道 + `edit/skill/subagent` deny）；越权动作在工具层被拒，且残余绕过面已在 D4 明示而非假定不存在。
- 委托只剩一个工具一条序列；front 不接触 HTTP、不持凭证，`captoken.sh` 与 `delegate.sh` 可整体退役。
- 失败可归因：brief 九字段 + `blocked_reason` + `outcome` + `out_of_scope_files`，能定位到具体字段/权限/越界文件。
- 工程 session 角色矩阵可用：`sessions` 分区 + `pair-v2` + 统一 flock，不再一律落 `general`。

**负面 / 代价**

- 白名单化 shell 是**破坏性收紧**：front 不能用 `bash -c` 拼命令，任何新只读需求都要改配置。有意取舍。
- 无人值守下 `ask` 类操作失败而非等待：用户批准要额外一轮（front 问 → 重新委托 → 全量重跑）。比挂死好，但轮次变多，且要求 `acceptance` 命令可重入。
- `blocked_reason` 依赖对消息 part 中 permission-denied 标记的扫描——标记的确切结构尚未实测，属实施期首要验证项。
- 插件与会话生命周期耦合：baseline 校验、resume 校验、`outcome=unknown` 分支、`remove` 与登记表同步，都是必须写对的异常路径。
- 引入跨写入方的 flock：role.json 的写入契约要在「delegate 插件」与「工程 session 角色切换」两侧同时改，漏一侧就有丢失更新。

**风险**

- `session.permissions` 最后匹配胜出 → **规则顺序敏感**：`[常量deny, scope规则, grants]` 的顺序必须被测试固定，否则一条新增 allow 会压掉既有 deny。
- 常量 deny 集与 build agent 的 `ask` 清单是**双写**：漂移即漏拦（挂死）或误拦（任务必失败）→ 需漂移检测。
- D4 的残余绕过（重定向、`--opt=` 截断、零节点跳过）在**上游修复前持续存在**；升级 opencode 时须回归守卫 deny 清单，不能假设已修。
- **scope 只约束 `edit` 类目**（实施期实测）：工程 session 的 `shell` 权限来自 build 自身规则，**shell 写操作不受 scope 约束** —— 实测工程 session 在工程目录外写了临时文件（`/tmp/opencode/engproj_baseline.txt`）而 `out_of_scope_files` 为空。且越界检测只比对工程仓的 `git status`，**工程外的写入检测不到**。这是已知缺口，不是完备边界；缓解只能靠 brief 约束 + 工程 session 自报 + 必要时对 shell 也做路径收敛（本次未做，见 improvement 的范围外）。
- pair 登记若只靠 `last_used_at` 过期清理而无上限，长时间使用会累积空 session。

## Verification（可勾选验收判据，前瞻）

- [ ] `opencode debug agents` 中 front 的 `shell` 首条为 `deny` 且无 `"*": allow`；`delegate` 规则为 `[{*,deny},{*,allow}]`。
- [ ] 以 front 身份执行 `bash -c 'touch /tmp/x'`、`python3 -c 'open("/tmp/y","w")'`、`curl https://example.com` 均被**权限层**拒绝（非模型拒绝）。
- [ ] 四个守卫用例在 front 下被拦：`sort a > b`、`git log --output=/tmp/f`、`find . -fprint /tmp/f`、裸 `> existing_file`（裸重定向若无法拦截，记录为已知残留并在 ADR 显式标注，不得静默通过）。
- [ ] 除 front 外任一 agent（build/plan/general/各 subagent）调用 `delegate` 时工具不可见（答 `NO_TOOL` 或列表无该项）。
- [ ] front 对工程目录 `read` 不触发 `external_directory` 询问；对白名单外绝对路径（如 `/etc/passwd`）仍被拒。
- [ ] `delegate` 在指定 `project_dir` 建 session 并让其真实完成一次文件写入，返回 `outcome=succeeded` + 最后 assistant 文本。
- [ ] `resume_session` 续接同一工程 session 时不新建 session（session 数不增）；传入未登记或 `canonical_root` 不匹配的 id 时被拒绝。
- [ ] 续接后 `wait` 返回但无新活动（模拟 prompt 入队失败）时返回 `{outcome:"unknown", still_running:true}`，不返回旧 run 的 `succeeded`。
- [ ] 工程 session 遇 `ask` 类操作**不挂死**：限时内以 `blocked_reason` 返回，front 能据此提问；工程 session 尝试 `question` 时同样不挂死（常量 deny 集含 `question` 的判据）。
- [ ] 常量 deny 集与 `opencode.jsonc` 的 build `ask` 清单漂移检测通过（清单一致）。
- [ ] `scope` 越界检测有效：让工程 session 改 scope 外文件，返回的 `out_of_scope_files` 非空。
- [ ] `pair-v2` 在一 front 对两个工程 session 时两条记录并存（不互相覆盖）；`role.json` 的 `sessions` 有对应条目（不再是 `general`）。
- [ ] **锁的两侧都生效**：并发触发插件 upsert 与工程 session 角色切换（两侧均取 `.rddf/state/.role.lock`），`role.json` / `pair.json` 无丢失更新（`history` 条目与 `sessions` 分区不互相覆盖）。只有一侧加锁时本判据必须判失败——协作锁缺一侧等于无锁。
- [ ] 插件 `setup()` 不产生任何写盘（6 个 location 各加载一次后，pair/role 文件 mtime 不变）。
- [ ] front 收到"下一步做什么"返回状态摘要 + 选项 + 新鲜度标注，且未调用 `skill`（`skill: deny` 生效）。
- [ ] front transcript 中不出现账号级凭证（provider key / token / git 凭据）。
- [ ] `delegate` 的救援路径为**原地补 grant**（`session.update`）而非新建 session 全量重跑；补 grant 后原 session 继续产出结果。
- [ ] `delegate` 拒绝非法 grants（`question`/`form`/`edit`/`write` 与非白名单 action），且**允许**白名单内的具体 grant 生效。
