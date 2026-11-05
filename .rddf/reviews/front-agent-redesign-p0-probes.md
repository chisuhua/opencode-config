# Stage 0 前置探针报告：front-agent-redesign

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-06 |
| 执行 | builder（Stage 0） |
| 环境 | OpenCode v2.2.5；生产拓扑（后台 service 127.0.0.1:49374）；模型 minimax-cn/MiniMax-M3.1-Flash |
| 结论 | 4 项探针全部有答案；**其中 1 项推翻原设计（0.1），1 项暴露计划外缺口（A1）** |

## 0.1 —— `session.update` 能否改已建 session 的 permissions

**结论：能。** 原 ADR D5 的救援路径假设"permissions 只能在 `session.create` 时写 → 救援只能建新 session → 全量重跑"，**该假设不成立**。

原始返回（`/tmp/opencode/sp/probe-012.json`）：

```json
"01_permissions_before": [ { "action": "shell", "resource": "git status *", "effect": "allow" } ],
"01_update_result": "ok:undefined",            // update 返回 undefined（成功，无返回值）
"01_permissions_after": [ { "action": "*", "resource": "*", "effect": "allow" } ],
"01_removed": true
```

调用形态（上游 `SessionUpdateInput` 亦证实 `permissions` 为其字段）：

```ts
await ctx.session.update({ sessionID, permissions: [{ action, resource, effect }] })
```

**对设计的影响**：D5 的"新建 session + 全量重跑"降级为**原地补 grant**（update 现有 session 的 permissions 后继续）。这消掉了长任务尾部阻断 → 整段重跑 → 再撞下一个 ask 类目 → 多轮后诱发"一次过宽授权"的连锁。相应地，`acceptance` 的"命令必须可重入"约束可以放宽（仍建议保留，但不是救援成立的前提）。

## 0.2 —— 跨会话权限代答与 deny 标记结构

### deny 标记结构（`blocked_reason` 的提取依据）

两种形态，`state.status` 均为 `"error"`：

**形态 A —— 规则级拒绝**（front 侧 CLI 实测输出，即模型看到的结果）：

```json
{"error":{"type":"permission.rejected","message":"Permission denied: shell"}}
```

**形态 B —— 用户显式拒绝**（`ctx.permission.reply(decision:"reject")` 后，消息 part 内）：

```json
{"type":"tool","id":"call_…","name":"shell","executed":false,
 "state":{"status":"error","input":{"command":"ls","workdir":"…"},
          "error":{"type":"aborted","message":"The user declined this tool call"}},
 "time":{…}}
```

同一条 assistant 消息还会带 `"finish":"error"` 与 `"error":{"type":"aborted","message":"Step interrupted"}`。

→ 提取规则：扫 `content[]` 中 `type==="tool" && state.status==="error"`，取 `state.error.type` ∈ {`permission.rejected`, `aborted`} 且 `state.error.message` 含 `Permission denied` / `declined` 的项。

### 代答（relay）的可用边界 —— 关键发现

| 场景 | `ctx.permission.list` | `ctx.permission.reply` | 结论 |
|---|---|---|---|
| 工程 session 与插件 **同 location** | 可见（poll_2 命中 `per_…`） | `"ok"` | **可用** |
| 工程 session **跨 location** | 返回 `[]`（不可见） | 未验证（前置不可见） | **不可用** |

原因：插件 ctx **按 location 绑定**（`ctx.location.directory` = 插件被加载的位置），权限服务是 per-location 的。

→ **对 ADR 的影响**：ADR 选项表里"跨会话代答"被列为**条件性保留**，理由是"实现未验证成功"。现在有了更精确的原因：**它只在同 location 可用**，而 front 与工程 session 通常分属不同 location（front 在治理面仓库 / 工程 session 在目标仓库）。因此它**不能**作为通用救援路径，但**可以**在 front 与工程 session 同 location 时作为兜底。ADR 的结论（不用它做主路径）不变，但理由要改。

### 挂死风险实证

工程 session 设 `shell: ask`（session 级）后，工具调用停在 `state.status="running"`，`session.get().outcome=None`、`time.idle` 缺失 —— **无 UI 时永久等待**。ADR D5「ask → 快速失败」的必要性得到实证支持。

## 0.3 —— 守卫用例真实拦截率

环境 v2.2.5，front 白名单 + 尾部守卫，命令均在 cwd 内用**相对路径**（隔离出守卫本身）：

| 用例 | 判定 | 副作用 |
|---|---|---|
| `sort README.md > out1.txt` | `Permission denied: shell` | 无文件生成 |
| `git log --output=out2.txt` | `Permission denied: shell` | 无文件生成 |
| `git log --format=%h > out3.txt` | `Permission denied: shell` | 无文件生成 |
| `find . -maxdepth 1 -fprint out4.txt` | `Permission denied: shell` | 无文件生成 |
| ` > out5.txt`（裸重定向） | `Permission denied: shell` | 无文件生成 |
| `ls`（正例） | ALLOWED | — |

**拦截率 5/5 = 100%**，且无任何副作用文件产生。

> 注意：上游 issue #49948 记录"命令串解析出 0 个 command 节点时整个权限检查被跳过"，本环境实测**裸重定向被 `* > *` 拦下**（说明 scanner 仍产出了可匹配节点）。这是 v2.2.5 的实测事实，但**不保证未来版本不变** —— ADR D4 的"尽力而为、非完备边界"立场保留。

## 0.4 —— `external_directory` 路径对象语法

**结论：可用。** front 存活，规则按路径生效：

```
external_directory: { action: 'external_directory', resource: '*', effect: 'deny' },
                    { action: 'external_directory', resource: '/workspace/**', effect: 'allow' },
                    { action: 'external_directory', resource: '/home/ubuntu/.config/opencode/**', effect: 'allow' }
```

判定资源形态（上游 `file-access.ts`）：`resources` = `<目录>/*`，`save` = `<projectRoot>/*`；`/workspace/**` 同时命中两者。

> 探针初期曾误判"对象语法使 agent 块被丢弃"，真因是隔离配置里把 `prompt` 写成了对象（V1 形式要求**字符串**指令 `"{file:./prompts/front.md}"`），与 `external_directory` 无关。

## 计划外发现

### A1（高危）—— `external_directory` **不约束 shell**

上游确认：`read` / `grep` / `glob` 都调用 `access.authorizeExternal(...)`（受 `external_directory` 约束）；而 `shell` 只 assert `action:"shell"` + 命令文本资源 —— **不查 external_directory**。

实测后果：Stage 1b 刚改完 `external_directory` 后，front 用 `cat /etc/passwd` **成功执行**（泄漏 /etc/passwd 内容）。

**处置（已实施）**：front 的 shell 规则追加 `"* /*": "deny"` —— shell 内禁止任何绝对路径参数（命令文本含 `" /"` 即拒），跨目录访问一律走 `read`/`grep`/`glob`（这三个受 external_directory 约束）。复测：

- shell `cat /etc/passwd` → `Permission denied: shell` ✅
- grep 工具 path=/workspace/main/rdd-workflow → 放行（3 matches）✅
- grep 工具 path=/etc → `Permission denied: external_directory` ✅

**对 ADR 的影响**：ADR D4 需补一条 —— external_directory 只覆盖 read/grep/glob，shell 的路径边界必须由 shell 规则自己兜（`"* /*": "deny"`）。这不是可选加固，是**必须的闭环**，否则 front 的"只读"承诺在 shell 上不成立。

### A2 —— 全局 agent 定义覆盖项目级 agent 定义

在项目目录放 `opencode.json` 定义 `agent.front` **无效**：生效的是全局配置里的 front（78 条 shell 规则原样出现）。即 agent 定义的文档顺序是**全局在后**，last-match-wins 让全局胜出。

生产影响：无（我们直接改全局配置）。但意味着**无法为单个项目微调 front 权限**，只能改全局。若将来需要按项目区分，需另立决策。

### A3 —— 插件 `setup()` 会在 location 销毁前被中止

`opencode plugin list` 与 `opencode debug agents` 都会触发插件模块加载（日志有 `loading plugin`），但**不保证 setup 跑完**：location 在 CLI 请求结束后即销毁，未 settle 的 setup 被取消（探针因此连续 3 次无输出）。

→ 工程约束：**插件 setup 只做注册（同步、快），长耗时工作必须放在工具 `execute` 里**。这已写进 ADR D8。

### A4 —— 插件 ctx 按 location 绑定

见 0.2 的 relay 边界表。

### A5 —— "Location plugins did not finish activating" 的真因不是插件

该 503 出现在两种情形：(a) 配置里带着 `mcp.codebase-memory-mcp`，其启动阻塞 location 激活；(b) 插件 setup 迟迟不 settle（见 A3）。`--standalone` 下 location 插件更容易触发。

→ 排障顺序固定为：① 看 `--print-logs` 的 `failed to load plugin` / `errors building`；② 看是否有 MCP 阻塞；③ 最后才怀疑插件 API。ADR D8 需据此扩写。

## 对 Stage 2 实施参数的结论（直接可用）

| 项 | 结论 |
|---|---|
| session 级 permissions | `session.create({permissions})` 可传、可回显；`session.update({permissions})` 可原地改 → 救援用 update |
| 权限顺序 | `[常量deny, scope edit 规则, grants]`，last-match-wins（`tool.ts` `whollyDisabled` 用 `findLast`） |
| grants 白名单 | 必须存在：`question`/`form`/`edit`/`write` 永不可 grant（否则压掉常量 deny 与 scope 规则） |
| blocked_reason | 扫消息 part 的 tool error（形态 A/B 两型） |
| 代答兜底 | 仅同 location 可用 → **不作为主路径**；跨 location 只能靠"失败可见 → 用户裁决 → update 补 grant" |
| 插件长任务 | 只能在工具 execute 内做；setup 只注册 |
| 插件写盘 | setup 阶段禁止；每 location 一实例 |
