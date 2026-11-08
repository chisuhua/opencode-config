# 双 session 工程架构 — 用法说明

> 实现形态（2026-11-06 起）：`front` 通过 **opencode 插件工具 `delegate`** 委托工程 session。
> 旧的 `scripts/delegate.sh` + `scripts/captoken.sh`（外部脚本 + 自研 HTTP + capability token）**已退役**。

## 1. 架构概览

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ front session（primary）     │        │ 工程 session（agent=build）    │
│  · 与用户对话                │ 委托   │  · 在目标工程目录里干活        │
│  · 理解性问题自己答          │───────▶│  · 走 build 角色矩阵          │
│  · 实施性 → delegate 工具    │        │  · 权限在建立时已定型          │
│  · 流程性问题读状态出摘要     │◀───────│  · 结果结构化回传              │
└─────────────────────────────┘        └──────────────────────────────┘
```

- **唯一工程通道**：`delegate` 工具（`~/.config/opencode/plugins/delegate.ts`）。
- **门控**：工具声明 `options.permission = "delegate"` → 全局 `permission.delegate = "deny"` +
  `agent.front.permission.delegate = "allow"` ⇒ **只有 front 能拿到这个工具**，其余 agent（build / plan / 各 subagent）调用时答 `NO_TOOL`。
- **front 不持任何凭证、不发任何 HTTP**：委托在插件进程内完成（`ctx.session.create/prompt/wait/get/context`）。

## 2. 角色边界速查

| 能力 | front | 工程 session |
|---|---|---|
| 与用户对话、给选项 | ✅ | — |
| 读工程代码（`read`/`grep`/`glob`） | ✅（受 `external_directory` 约束） | ✅ |
| 只读 shell（`ls`/`rg`/`git log`…） | ✅（仅 cwd 相对路径） | ✅（build 自身规则） |
| 改工程文件 | ❌（`edit: deny`） | ✅（scope 内） |
| 提交 / 推送 | ❌ | ❌（等用户确认后另行发起） |
| 调 subagent / skill | ❌ | ✅ |
| 发起工程任务 | 经 `delegate` | — |

## 3. 启动方式

### 方法 A：TUI（推荐）

```bash
# 终端 A —— front session（与用户对话）
opencode /path/to/工程根
#   在 TUI 里：/agent front
#   然后直接和 front 对话

# 终端 B —— 工程 session（可选，通常不需要手工开）
opencode /path/to/工程根
#   在 TUI 里：/agent build
```

> front 会在委托时**自动**建立/续接工程 session；手工开终端 B 只在需要旁观时才有必要。

### 方法 B：CLI 单次运行

```bash
opencode run --agent front "帮我看看 X 模块是怎么设计的"
```

## 4. 委托流程

### 步骤 1：front 判类（四分类）

| 类别 | 产物 | 出口 |
|---|---|---|
| 理解性 | 回答 | front 自己 `read`/`grep`/`glob`，**不建工程 session** |
| 实施性 | 文件变更 | `delegate` |
| 流程性 | 状态摘要 | front 读 `.rddf/state/` 等出摘要（带新鲜度标注） |
| 需裁决 | 决策输入 | `question` 问用户 |

### 步骤 2：front 组 brief（六个必填）

```jsonc
{
  "project_dir": "/abs/path/to/project",   // 工程根绝对路径
  "task":      "用户原话或等价转述",
  "goal":      "一句话目标（产物是什么）",
  "scope":     ["src/", "tests/"],          // 允许变更的路径前缀
  "acceptance":"pytest tests/unit -q 通过", // 可判定的完成判据
  "constraints": "不要 commit",             // 可选
  "grants": [                               // 可选：用户预批的操作
    { "action": "shell", "resource": "git push *" }
  ]
}
```

- 插件只校验**存在性/类型/结构**；语义质量是 front 的责任。
- `grants` 只能给 `shell`（具体单条）/`read`（不含 `.env`）/`grep`/`glob`/`list`/`external_directory`（具体路径）/`webfetch`/`websearch`/`lsp`；
  **`question`/`form`/`edit`/`write` 永不可 grant**（会破坏工程 session 的安全边界）。

### 步骤 3：工程 session 干活

`delegate` 建 session 时把权限**定型**为：

```
[常量 deny(build 的 ask 类目 + question + form + MCP 写), scope 的 edit 规则, 用户 grants]
```

- 工程 session **没有 UI**：任何 `ask` 会永久挂死 → ask 类目一律落成 `deny`（快速失败）。
- `scope` → `edit` 规则：scope 内 allow、其余 `edit` deny（**scope 的强制点**）。
- 登记：建立后立刻写 `<工程>/.rddf/state/pair.json`（pair-v2）与 `role.json` 的 `sessions` 分区
  ⇒ 工程 session 开局就拿到自己的角色（`builder`），不会退化成 `general`。

### 步骤 4：结果解读

工具返回 JSON，重点字段：

| 字段 | 含义 |
|---|---|
| `outcome` | `succeeded` / **`unverified`（宿主报成功但无交付证据，不得当完成）** / `failed` / `interrupted` / `unknown`（没有新活动，结论不可信）/ `busy`（上次运行仍在进行，别排队） |
| `blocked_reason` | 被权限拦住了 —— **不要换写法绕过**，把被拒操作报给用户，问是否追加 grant |
| `out_of_scope_files` | 本次改了 scope 外的文件 —— 必须点名告知用户 |
| `changed_files` | 本次委托期间新增/变更的文件（前后 `git status` 差集） |
| `last_assistant_text` | 工程 session 的最终说明，原样转述 |
| `resumed_by_other_front` | 续接的 session 属于另一个 front 会话（正常：隔天回来继续） |

### 步骤 5：被拒后的救援

`blocked_reason` 非空 → 用户同意追加权限 → **原地补 grant**（`session.update` 改该 session 的 permissions）→ 继续同一 session。
**不新建 session、不全量重跑。**

## 5. front 的工具边界（权限层强制，非 prompt 承诺）

| 工具 | front | 说明 |
|---|---|---|
| `read` / `grep` / `glob` / `list` | allow | 跨目录受 `external_directory` 约束（只放行 `/workspace/**` 与治理面目录） |
| `shell` | **白名单** | `*: deny` 打头 + 47 条只读 allow + 尾部守卫 deny；**禁止绝对路径**（`"* /*": deny`） |
| `webfetch` / `websearch` / `lsp` | allow | 只读性质 |
| `question` | allow | 向用户提问 |
| `delegate` | allow | 唯一工程通道 |
| `edit` / `write` | deny | front 不能改工程文件 |
| `skill` / `subagent` | deny | front 不能调子 agent / 技能 |

> **已知边界**：shell 权限是"命令节点文本做 glob 匹配"，上游存在绕过族（重定向、`--opt=value` 截断、零节点跳过）。
> 守卫已覆盖当前版本实测的 5 个用例（拦截率 100%），但**不是完备边界**——详见 ADR D4。

## 6. 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| front 工具列表里没有 `delegate` | 门控异常 | 明确报错，**不要**用 shell 脚本绕过 |
| `Permission denied: external_directory` | 目标路径不在允许目录 | 问用户是否放开该路径 |
| `outcome: busy` | 目标 session 还在跑 | 等待，不要新建顶替 |
| `outcome: unknown` | 没有新活动 | 明确说"未拿到可信结果"，可重试一次 |
| `outcome: unverified` | 宿主报成功但没有可验证的交付证据 | 转述证据字段，问用户重试还是换做法；不得说完成 |
| 改了 `opencode.jsonc` 但不生效 | 后台 service 缓存了配置 | `opencode service restart` |
| 新增/修改插件后不生效 | 同上（插件在 location 激活时加载） | `opencode service restart` |
| `ServiceUnavailableError: Location plugins did not finish activating` | ① 插件构建失败 ② MCP 启动阻塞 ③ 插件 setup 迟迟不 settle | 先看 `--print-logs` 的 `failed to load plugin`；再查 MCP；最后怀疑插件 API |

## 7. 代码布局与测试

```
plugins/delegate.ts      插件入口（只负责把工具注册进 opencode 的工具表，11 行）
lib/delegate-core.ts     工具的纯逻辑内核 + 工具定义工厂（无宿主依赖，可独立单测）
tests/delegate-core.test.ts   纯逻辑单元测试
tests/delegate-tool.test.ts   假 ctx 端到端单元测试
```

```bash
cd ~/.config/opencode && bun test tests/     # 63 项单元测试，不依赖 opencode 运行时
```

被委托的**示例工程 = `rdd-workflow-e2e`**：单元测试复制其工作树到临时目录作 fixture
（只复制工作树、不复制 `.git`），不污染该仓库。

## 8. 相关文档

- **开发者架构文档**：[front-delegate-architecture.md](./front-delegate-architecture.md)（全图 / 机制根因 / 开放指南 / 陷阱手册）
- **使用手册**：[front-delegate-usage.md](./front-delegate-usage.md)（面向使用者：怎么用、结果怎么读、排障）
- **测试文档**：[front-delegate-testing.md](./front-delegate-testing.md)（面向改代码的人：怎么跑、覆盖矩阵、新增测试的写法）
- 架构决策：`.rddf/state/adr-front-agent-redesign.md`
- 实施路径与验收：`.rddf/improvements/front-agent-redesign.md`
- 探针报告：`.rddf/reviews/front-agent-redesign-p0-probes.md`
- 审稿记录：`.rddf/reviews/adr-front-agent-redesign-review.md`
- 角色与权限总表：`docs/MULTI-AGENT-DESIGN.md`
