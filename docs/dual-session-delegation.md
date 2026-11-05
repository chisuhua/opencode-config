# 双 session 工程架构 — 用法说明

本文档说明如何使用 `front`（前端用户代理）+ `build`（工程 session）双 session 架构进行工程项目开发。

## 1. 架构概览

```
┌─────────────────────┐      delegate(start/ask/wait)      ┌─────────────────────┐
│   前端 session       │  ─────────────────────────────→   │   工程 session       │
│   (front agent)      │                                   │   (build agent)      │
│   • 与用户对话       │                                   │   • 走 role.json 矩阵 │
│   • 明确用户意图     │                                   │   • architect/planner  │
│   • 读代码回答理解   │                                   │   • builder/verifier   │
│   • edit/subagent deny│                                  │   • 只改代码           │
└─────────────────────┘                                   └─────────────────────┘
        ▲                                                               ▲
        │                                                               │
   用户在此对话                                                       代码在此产出
```

- **front session**：专职与用户对话，明确用户意图，**不改代码、不进 role.json 矩阵**。
- **工程 session**：走完整多角色矩阵（architect / planner / builder / verifier），负责所有代码修改。
- **delegate 插件**：front 与工程 session 之间的唯一通道，提供 `start` / `ask` / `wait` 三个固定工具面。

## 2. 角色边界速查

| 动作 | front session | 工程 session |
|------|--------------|-------------|
| 与用户对话、澄清意图 | ✅ | ❌ |
| 读代码（回答理解性问题） | ✅ | ✅ |
| 改代码 / 编辑项目文件 | ❌（edit deny） | ✅ |
| git commit / push | ❌ | ✅（verifier 审查后） |
| 权限 / 表单代答 | ✅（通过 delegate） | ❌（被代答方） |
| 走 role.json 角色矩阵 | ❌（固定语义 agent） | ✅（architect/planner/builder/verifier） |

## 3. 启动方式

### 方法 A：TUI 界面（推荐）

```bash
# 终端 A —— 前端 session（你和用户对话）
cd ~/.config/opencode   # 或任何独立目录
opencode
# 在 TUI 里输入：/agent front
# 然后和 front 对话，明确意图

# 终端 B —— 工程 session（代码实施）
cd /home/ubuntu/你的项目
opencode
# 在 TUI 里输入：/agent build
# 工程 session 走角色矩阵，接收 front 委托的任务
```

TUI 里可以随时用 `/agent front` / `/agent build` / `/agent list` 切换或查看 agent。

### 方法 B：CLI 单次运行

```bash
# 前端 session
opencode run --agent front --model minimax-cn/MiniMax-M3.1-Flash "你好，我要实现一个功能"

# 工程 session（单次）
opencode run --agent build --model minimax-cn/MiniMax-M3.1-Flash -s <sessionID> "执行某项任务"
```

> `opencode run` 必须提供 `<message>` 参数，否则会报错 `You must provide a message`。

## 4. front 驱动工程的完整流程

### 步骤 1：front 明确用户意图

在前端 session 里和 front 对话。如果需求有歧义，front 会用 `question` 工具向你提问并给出选项。

### 步骤 2：front 委托实施任务

意图明确后，front 通过 `delegate.sh start` 把任务发给工程 session：

```bash
# 在 front 所在目录（或任意有权限的目录）执行
cd ~/.config/opencode

./scripts/delegate.sh start /home/ubuntu/你的项目 "给 user 模块的 add 函数加溢出检查，不改签名"

# 输出示例：
# {
#   "sessionID": "ses_xxx",
#   "token": "xxx",        # front 持有，后续 ask/wait 都用这个 token
#   "project_dir": "/home/ubuntu/你的项目",
#   "agent": "build",
#   "pair_registered": false
# }
```

front 把返回的 `token` 保存，后续通过 `ask` / `wait` 与工程 session 交互。

### 步骤 3：工程卡在权限时，front 代答

工程 session 在执行中如果遇到需要 `ask` 权限的操作（如 `cat .env`、`git push`），会阻塞。front 通过 `delegate.sh ask` 代答：

```bash
# 代答一次性允许
./scripts/delegate.sh ask <token> permission once

# 代答拒绝
./scripts/delegate.sh ask <token> permission reject

# 代答表单（question 工具）
./scripts/delegate.sh ask <token> form '{"q0":"项目 Alpha"}'
```

**代答安全边界**（front 不得越界）：
- **默认关闭**：用户需显式开启 `auto_answer: true`，否则所有权限/表单请求一律转用户。
- **白名单**：仅代答读工具（`read` / `grep` / `glob` / `list` / `websearch` / `lsp` / MCP 读工具）。
- **绝对负面清单**（命中即转用户）：19 条危险 shell 模式（`git push`、`reset --hard`、`clean`、`checkout --`、`restore`、`branch -D`、`stash drop/clear`、`rm -rf|fr|r|f`、`sudo` 等）、`.env` 读取、MCP 写工具、`external_directory`、`doom_loop`、一切 `edit`/`write`、`question`/`form` 自由文本。
- **单回合上限 ≤ 5 次**，防止批量诱导代答。
- **不可逆操作不得自动代答**：`git push` / 分支删除 / `rm -rf` / 发布类命令，一律升级用户。

### 步骤 4：等待工程完成并取回结果

```bash
# 有界等待（≤60s per poll，超时返回 pending 续轮）
./scripts/delegate.sh wait <token> 120

# 工程完成后，front 把结果原样转述给用户
```

## 5. delegate.sh 命令速查

```bash
# 启动工程 session，获得 token
./scripts/delegate.sh start <project_dir> <task_text>

# 代答权限请求（once | reject）
./scripts/delegate.sh ask <token> permission <once|reject>

# 代答表单（answer JSON）
./scripts/delegate.sh ask <token> form '{"q0":"value"}'

# 等待工程 session 空闲（最多等待 timeout 秒）
./scripts/delegate.sh wait <token> [timeout_seconds]

# 列出活跃工程 session
./scripts/delegate.sh list

# 签发 / 校验 capability token（调试用）
./scripts/delegate.sh token issue <session_id> [ttl_minutes]
./scripts/delegate.sh token verify <token> <endpoint>
```

安全边界：
- 只接受固定命令，不接受任意 method/path/body（堵住裸 opencode API 逃逸通道）。
- 凭证仅在脚本进程内使用，不进入 front transcript。
- capability token TTL≤15min，进程重启即全量失效。
- external_directory 一律不代答（全部转用户）。

## 6. 完整示例对话

```
用户（在 front session TUI）：
  「把 user 模块的 add 函数加溢出检查，但不要改签名。」

front agent（理解意图，确认无歧义后）：
  「我来把这个任务委托给工程 session。」

front 执行（在 shell 里）：
  ./scripts/delegate.sh start /home/ubuntu/项目 "给 user 模块的 add 函数加溢出检查，不改签名"
  → 得到 token

  ./scripts/delegate.sh wait <token> 120
  → 工程 session 执行，若遇 .env 读取权限 ask，front 代答 once
  → 工程完成，front 取回结果

front 回复用户：
  「已在 user/add.c 行 12 加入 __builtin_add_overflow 检查，签名未变。工程 session 已提交，你可以 review。」
```

## 7. 关键文件位置

| 文件 | 用途 |
|------|------|
| `prompts/front.md` | front agent 核心 prompt |
| `opencode.jsonc.opencode-go` | front agent 权限配置（edit/subagent/skill deny，read/question allow） |
| `scripts/delegate.sh` | 三个固定工具面：start/ask/wait/list/token |
| `scripts/captoken.sh` | capability token 签发/校验（TTL≤15min，端点限制 permission/form/wait） |
| `scripts/role-init.sh` / `role-show.sh` | role-v2 状态文件管理 |
| `scripts/role-migrate-v2.sh` | role.json v1→v2 离线迁移（history 全量保留） |
| `.rddf/state/adr-double-session-delegation.md` | 架构决策记录（critic 已 APPROVE，mergeable: yes） |
| `.rddf/state/role.json` | 角色状态（role-v2，sessions 分区，顶层镜像不作权限判据） |

## 8. 常见问题

**Q：front 能直接改代码吗？**
A：不能。front 的 `edit` 被设为 `deny`，所有代码修改必须经 delegate 发给工程 session。

**Q：front 和工程 session 能共享 role.json 吗？**
A：不能直接共享。front 不进 role.json 矩阵，是固定语义 agent；工程 session 走 role.json 角色矩阵。两者通过 delegate 通信，不共享角色状态。

**Q：工程 session 掉线了怎么办？**
A：工程 session 进入 suspended 状态。front 重新连接后，经 delegate 恢复轮询 `/permission` 与 `/form`，继续代答。不设自动超时放行，避免不可逆操作被静默执行。

**Q：能在同一个 TUI 窗口里切 front 和 build 吗？**
A：可以。`opencode` 启动 TUI 后，用 `/agent front` / `/agent build` 切换。但建议用两个独立终端，分别对应前端和工程 session，避免上下文混淆。