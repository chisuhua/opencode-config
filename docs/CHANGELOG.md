# Multi-Agent 设计变更日志

> 本文件记录 `docs/MULTI-AGENT-DESIGN.md` 的**历史增量**：按版本切分的权限加固史、各版本验证记录、已完成改动台账、演进日志。
>
> **当前态只看 [MULTI-AGENT-DESIGN.md](MULTI-AGENT-DESIGN.md)**——本文档不描述现状，只记录「什么时候改了什么、为什么」。

---

## 版本变更摘要

> 本节内的 § 引用为**当时的**章节编号；原 §4.4–§4.6 / §7.1–§7.3.1 / §8.1–§8.1.3 现位于本文件后续小节，原 §9 演进日志位于文末。

> **v1.9 变更摘要**：角色矩阵与 rdd-workflow **解耦**——角色矩阵改为**自足内核**（权限/产出契约/切换机制不依赖 rdd-workflow 是否安装），rdd-workflow 降为**可选增强层**；新增 `scripts/rdd-skills.sh`（懒探测：installed / available[] / sources[] / rddf_cli）；角色 ↔ 可选增强映射 + 工件归属规则（同一路径上单一写入者）写入 `prompts/build.md`（§2.6）。
>
> **v1.7 变更摘要**：新增项目级架构文档配置 `.rddf/config/arch-docs.json`（`arch_paths` / `exclude_paths`），**architect 可写范围**与 critic `arch` 档判据改为读配置；新增 `/arch-docs-init`（首次梳理写入、`--refresh` 更新、`--check` 查漂移）；`build_critic_prompt.sh` 按配置推断档位。
>
> **v1.6 变更摘要**：critic 引入**审稿档位** `review_profile`（`arch` / `plan` / `build` / `archive`），BLOCKER 判据按产物而不是按角色；上下文契约从 6 字段扩为 7 字段（§2.3、§2.4）；`build_critic_prompt.sh` 按改动路径自动推断档位；build 角色矩阵补齐 cwd 变更重解析、非法角色值、verifier 评审预算、builder 改 ADR 决策的边界（§2.2）。
>
> **v1.5 变更摘要**：critic 收窄为**架构与决策审稿**（不再报文档计数/格式/测试边角/护栏绕过面）；BLOCKER 限定三类；结论必须与 `mergeable` 一致，禁止用 NITS 凑 REJECT；`build.md` 新增**评审预算**（每 change ≤2 轮，第 3 轮需用户批准）、增量复审、禁止"攻击新判据"式委派、`scope_exceeded` 不入返工队列（§2.3、§2.4）。执行层校验的自动化迁移清单见 `docs/review-automation-backlog.md`。
>
> **v1.4 变更摘要**：模型元数据补全（`capabilities` + `limit.context` 按实测/上游值分级修正，§5.1、§5.2）；`librarian` 换成本最低档的 `kimi-k2.6`（`deepseek-v4-flash` / `glm-5.1` 实测不在套餐，§5.2、§7.3.1）；新增 `title` agent 用实测不思考的 `glm-5.3-flash`（§2.1）；`context-builder` 转为 `hidden`（§2.3）；`plan`/`oracle` 去掉 `temperature`（模型不支持该参数）；角色矩阵从 `AGENTS.md` 移入 `prompts/build.md`（§1.2、§6）；6 个 subagent prompt 补"被权限拒绝即终止"纪律（§3.3）。
>
> **v1.2 变更摘要**：新增 `critic` subagent（§2.3、§2.4、§3.1、§3.2、§4.3）；`build.md` 加入"何时调 critic"委派触发规则（§3.2）；critic prompt 4 段式输出格式（BLOCKERS / SHOULD_FIX / NITS / 验证建议）首次文档化（§2.4）；同步更新 §6 文件结构、§7 验证清单。
>
> **v1.1 变更摘要**：4 轮权限加固（详见 §4.3 后的小节 "v1.1 权限加固"）；plan agent 写入路径从 `.opencode/plan/` 改为 `.plans/`（§6 联动）；新增 `/plans-init` slash command（§6.1、§8.1）。

---

## 权限加固记录

> 原 `MULTI-AGENT-DESIGN.md` §4.4 / §4.5 / §4.6。当前生效的加固项见该文档 §4.4。

### 4.4 v1.1 权限加固（2026-10-13）

v1.0 部署后由 oracle 后审发现 3 类真问题，本节记录修复与理由。

#### 4.4.1 build bash 无界（修复 R-01）

**问题**：`bash: "allow"` 让 build agent 可执行任意 shell 命令，包括 `git push --force`、`rm -rf`、`sudo` 等不可逆操作。`snapshot: false` 意味着没有 undo 检查点。

**修复**：bash 改为 `* + 危险命令 ask` 模式，拦截 19 条高频危险模式：

| 类别 | 拦截模式 |
|---|---|
| git 推送 | `git push` / `git push *` |
| git 丢工作区 | `git reset --hard` / `git clean -fd*` / `git clean -fdx*` / `git checkout --` / `git checkout .` / `git restore *` |
| git 丢分支/栈 | `git branch -D *` / `git stash drop *` / `git stash clear *` |
| 删文件 | `rm -rf *` / `rm -fr *` / `rm -r *` / `rm -f *` |
| 提权 | `sudo *` |

**机制**：opencode V1 bash 对象采用 **last-match-wins**，catch-all `"*": "allow"` 放第一条，具体 ask 规则后续追加——匹配到 ask 规则时取 ask 生效。

#### 4.4.2 MCP 写工具无界（修复 R-02）

**问题**：v1.0 仅限制 `edit` 权限，但 `codebase-memory-mcp` 提供 5 个写工具（`delete_project` / `index_repository` / `ingest_traces` / `manage_adr` / `query_graph`）——explore / oracle / librarian / metis / general 这些"只读" agent 都能调，一条 `delete_project` 就能毁掉整个知识图谱索引。`query_graph` 特别隐蔽：Cypher 支持 `CREATE/SET/DELETE`，除非服务端强制只读，否则等于通用改图通道。

**修复**：

| MCP 工具 | build | plan / explore / librarian / oracle / metis / general |
|---|---|---|
| `delete_project` / `index_repository` / `ingest_traces` / `manage_adr` | ask | deny |
| `query_graph` | ask | deny |

**机制**：V1 permission action 命名 `<server>_<tool>`（连字符保留，`.` 替换为 `_`），opencode 源码 `lifecycle.test.ts` 验证。`codebase-memory-mcp_query_graph` 与实际工具名精确对齐。

#### 4.4.3 描述/权限自相矛盾（修复 R-03 / R-04）

**问题**：

- `general` 描述"Read-only"但 bash 白名单含 `npx *` / `node *` / `npm test *`——`npx` 能下载执行任意 npm 包，比 build 的 `bash: allow` 还隐蔽
- `explore` 描述"Read-only"但保留 `doom_loop: deny`、websearch `ask`——prompt 与权限不一致

**修复**：

- general：砍 `npx *` / `node *` / `npm test *`，bash 白名单回归纯只读子集
- explore：`websearch` 改 `deny`（本职是本地搜索，外网搜索走 librarian）
- oracle / metis：`bash` 改 `deny + 白名单`（原本是 `*` 全 ask，每次想 `ls` 都弹窗，非交互上下文有挂起风险）
- 所有 subagent：`question: deny`（subagent 弹问题给用户的交互路径别扭，应返回"不确定"给 parent）

#### 4.4.4 plan 写入路径修正（修复 R-05）

**问题**：v1.0 权限白名单 `.opencode/plans/*.md`（复数 `plans`）与 prompt 要求的 `.opencode/plan/*.md`（单数）不一致——plan agent 的主写入路径被自己的权限 deny 掉，工作流直接断。

**修复**：统一为 `<project-root>/.plans/<slug>.md`（与 opencode 引擎自身的 `.opencode/` 命名空间隔离）。`scripts/plans-init.sh` + `commands/plans-init.md` 提供 `/plans-init [path]` 自动化 `.gitignore` 初始化（详见 MULTI-AGENT-DESIGN.md §6.1）。

### 4.5 v1.2 权限加固（2026-10-15）

v1.1 部署后由外部代码审查（oh-my-openagent 项目调研，详见 §10）发现 critic 类角色缺失；本次新增 critic agent 时同步加固 3 项。

#### 4.5.1 新增 critic agent（建立审稿门禁）

**问题**：v1.0/1.1 的 7 个 agent 全部是"先于 build"或"build 并行"，**没有任何"build 之后做对抗式审稿"的角色**。大改动（≥3 文件 / 跨 API / 跨模块）经常带着隐藏缺陷过线；build agent 自我审查又会陷入"作者 = 评审人"的偏差。

**修复**：新增第 8 个 subagent `critic`，专责对抗式审稿：

- **模型**：`kimi-code/k3-256k`（256k 长上下文 + 已用于 oracle 审稿类）
- **temperature**：0.1（冷静对抗，不情绪化）
- **prompt 强制 4 段式输出**（§2.3）：BLOCKERS / SHOULD_FIX / NITS / 验证建议 + `mergeable` / `scope_exceeded`（v1.5 去掉 10 项旁路清单）
- **默认怀疑、结论与证据匹配**：禁止"整体看起来不错"等零信息话术；v1.5 起只有 BLOCKER 才能给 REJECT

#### 4.5.2 critic 权限最严化（修复 R-06）

**问题**：critic 必须严格只读——它不是写代码的人，是挑刺的人。如果允许它写、改、调子 agent，会破坏审稿的客观性。

**修复**：critic 是**唯一** `webfetch: deny` + `websearch: deny` + `task: deny` + `question: deny` 全 deny 的 agent（其它 subagent 至少 task 或 webfetch 有一个 allow）：

| 工具 | critic | 其它 subagent（对比） |
|---|---|---|
| edit | deny | deny |
| webfetch | **deny** | allow（librarian/oracle/metis 都要联网） |
| websearch | **deny** | allow（librarian/oracle） |
| task | **deny** | librarian: allow（调 explore）|
| question | **deny** | 同其它 subagent |

v1.2 设计：critic 的 `codebase-memory-mcp` 10 个工具（5 写 + 5 读）**全部 deny**——critic 不查代码图谱，只看 git diff + 文件内容（避免 graph 查询把"模型视角"和"代码现状"混淆）。

**bash 白名单收窄**（比 librarian 严）：不包含 `curl / wget / git clone`——critic 不下载、不 clone，只读已有文件。

> **v1.3 修正（§4.6.4）**：迁移到 v2 扁平权限时 critic 的只读图谱工具被误降级成 deny，与 `prompts/critic.md` 要求的 `list_projects` 冲突。v1.3 已恢复 10 个只读工具 allow，4 个写工具保持 deny。

#### 4.5.3 build.md 加入 critic 触发规则（修复 R-07）

**问题**：v1.1 的 build agent 完全不知道 critic 存在——8 个 agent 注册到 opencode.jsonc，但 build agent 的 prompt 没说"什么时候该调 critic"。结果 critic 配置 100% 闲置。

**修复**：`prompts/build.md` "委派原则"段加 1 条 + "何时调 critic"段加 5 个条件 + 4 段式输出协议。详见 §3.2.1。

#### 4.5.4 未来权限审查 TODO（继承自 v1.1 §8.2 P1 清单）

- ❌ 未在真实 session 实测 critic 是否真的按 4 段式输出
- ❌ 未实测 critic 6 个 git 只读子命令是否能涵盖 PR review 全部需求
- ❌ v1.1 的 MCP `query_graph: ask/deny` 在 v1.2 改成 critic 全 deny 后是否影响 build agent 查询图谱（不变：build 仍是 ask）

### 4.6 v1.3 权限加固与 v2 schema 迁移（2026-10-21）

OpenCode 升级到 **v2.1.2** 后做了 4 项修复。前两项是**迁移期静默失效**（配置能加载、但权限不生效），后两项是**迁移过程中引入的越权**。

#### 4.6.1 v2 schema 迁移：MCP 权限键形态（修复 R-08）

**问题**：v1 的嵌套写法

```jsonc
"permission": { "codebase-memory-mcp": { "search_graph": "allow", "*": "deny" } }
```

在 v2 下会被归一化成 `{ action: "codebase-memory-mcp", resource: "search_graph" }`——但 v2 的 MCP 工具 action 名是 `<server>_<tool>`（`codebase-memory-mcp_search_graph`），**永远匹配不上**。后果不是"被拒"而是"落到默认 ask"：所有图谱调用每次都弹审批框。

**修复**：全部改成扁平键（§6.2）。

| 位置 | v1 写法 | v2 写法 |
|---|---|---|
| 全局 | `"codebase-memory-mcp": { "*": "deny", "search_graph": "allow" }` | `"codebase-memory-mcp_*": "deny"` + `"codebase-memory-mcp_search_graph": "allow"` |
| agent 级 | 同上 | `"codebase-memory-mcp_index_repository": "ask"`（扁平单键）|

其它同批迁移项：`provider` → `providers`、`npm` → `package`、`options` → `settings`、顶层 `subagent_depth` → `experimental.subagent_depth`（顶层写法在 v2 下被**静默丢弃并只留一条 WARN**，限深形同失效）。

> `bash` 键在 v2 会被自动归一化成 `shell`（`normalizeAction()`），所以配置里继续写 `bash` 也能用；但文档与新配置统一按 v2 语义描述。

#### 4.6.2 `.env` 保护被 agent 权限覆盖（修复 R-09）

**问题**：opencode 内置 `read *.env → ask` 保护排在规则链**前面**，而每个 agent 又写了 `"read": "allow"`——按 last-match-wins，agent 的规则**更靠后** → 内置保护被覆盖。实测：所有 agent（含 critic）都能 `read` 读取 `.env`，且 `cat *.env` 走 shell 权限（`cat *` allow）完全绕过 read 规则。

**修复**：

1. 每个 agent 的 read 改成对象形式，把 `.env` 规则写在 `*` 之后（顺序即策略）：
   ```jsonc
   "read": { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" }
   ```
2. shell 层补 `.env` 拦截（只读 agent `deny`，build `ask`）：`cat/head/tail *.env` 与 `*.env.*`。

**残留**：shell 是**整串前缀匹配**，重定向不在匹配范围内——`git show HEAD:.env > /tmp/x` 这类仍会绕过。权限模型的固有限制，不是配置问题。

#### 4.6.3 只读白名单越权（修复 R-10）

**问题**：v1.3 迁移时为"减少 ask 弹窗"把只读 agent 的 bash 白名单大幅放宽，其中 4 条是越权原语：

| 允许项 | 风险 |
|---|---|
| `awk *` | awk 可 `system()` 任意命令、可 `> file` 写文件——`edit: deny` 被绕过 |
| `env *` / `printenv *` | 直接把 `OPENSTARRY_API_KEY` 等密钥打进 transcript → 第三方模型 |
| `jq *` | 辅助写文件（配合重定向）|

**修复**：只读 agent 移除这 4 条 → 落回 catch-all `"*": "ask"`，人工放行。build 是信任边界内的主 agent，保留其能力。

> **保留的既有 deny**：`find * -exec *` / `find * -execdir *` / `find * -delete`（只读 agent）。

#### 4.6.4 critic 图谱工具与 plan 写操作的迁移误降级（修复 R-11）

**问题**：v1.2 设计里 critic 是"不查代码图谱、10 个 MCP 工具全 deny"（§4.5.2）。但 v1.3 迁移后的 critic 块只剩 `codebase-memory-mcp_*: deny` + `trace_path: allow`——**连 `list_projects` 都被 deny**，而 `prompts/critic.md` 明确要求 critic 先调 `list_projects` 查 project 名。提示词与权限直接打架。

同理，plan 的 4 个 MCP 写操作在 v1.1 是 `ask`，迁移时被静默降级成继承全局 `deny`。

**修复**：

- critic 恢复 10 个**只读**图谱工具 allow（`search_graph` / `get_code_snippet` / `trace_path` / `get_architecture` / `get_graph_schema` / `query_graph` / `search_code` / `detect_changes` / `list_projects` / `index_status`），4 个写工具（`index_repository` / `ingest_traces` / `manage_adr` / `delete_project`）保持 deny；
- plan 的 4 个写操作恢复 `ask`。

> **`query_graph` 的决定（v1.4，用户拍板）**：它被放进了**全局** allow 列表 → 8 个只读 agent 都能调。按 本文件「v1.1 权限加固 §4.4.2」的判定它应属"写工具"（Cypher 可写），但**保持 allow** —— 理由是该 MCP server 的 `query_graph` 只用于读查询，实际风险远低于 `delete_project` / `index_repository`；逐个 agent 加 deny 会让每次查询都弹 ask，破坏只读 agent 的可用性。此决定已记录在 MULTI-AGENT-DESIGN.md §8.1 P0。


---

## 各版本验证记录

> 原 `MULTI-AGENT-DESIGN.md` §7.1 / §7.2 / §7.3 / §7.3.1。当前态汇总见该文档 §7.1。

### 7.1 已完成验证（2026-10-13）

| 测试 | 状态 |
|---|---|
| JSON 合法性（7 个 JSON 文件）| ✅ 通过 |
| 7 个 agent 全部注册 | ✅ 通过 |
| 7 个 `{file:...}` 引用全部解析 | ✅ 通过 |
| permission schema 字段全部合法 | ✅ 通过 |
| model/provider 路由全部存在 | ✅ 通过 |
| `default_agent: "build"` 指向合法 primary | ✅ 通过 |
| `subagent_depth: 2` 合理 | ✅ 通过 |
| explore subagent 核心能力（grep）| ✅ 通过（静态+实跑）|
| librarian subagent 元规则 | ✅ 通过（prompt 内容含 8 处 explore 引用、6 处付费墙 fallback）|
| 解析器兼容性（模拟 OpenCode 启动）| ✅ 通过（0 错误 0 警告）|
| v1.1 后权限 schema 合规 | ✅ 通过（`json5` 解析 + 字段结构核查）|
| v1.1 plans-init.sh 幂等性 | ✅ 通过（重复跑 + 已存在条目场景 dry-test）|
| v1.1 bash last-match-wins 行为 | ✅ 通过（oracle 文档核查 + pattern 顺序验证）|
| v1.1 MCP action 命名格式 | ✅ 通过（opencode 源码 `lifecycle.test.ts` 验证）|

### 7.2 v1.2 新增验证（2026-10-15）

| 测试 | 状态 |
|---|---|
| JSONC 严格解析（node 解析，模拟 opencode 行为）| ✅ 通过 |
| 8 个 agent 全部注册（含 critic）| ✅ 通过 |
| 8 个 `{file:...}` 引用全部解析（含 critic）| ✅ 通过 |
| critic 必填字段完整（model/temperature/mode/description/permission/prompt）| ✅ 通过 |
| critic 关键 deny：edit/webfetch/websearch/task/question | ✅ 通过 |
| critic model `kimi-code/k3-256k` 在 provider 池中 | ✅ 通过 |
| build.md 改后 schema 合规 | ✅ 通过 |
| build.md 反向引用 critic 的位置（§"委派原则" + §"何时调 critic"）| ✅ 通过 |

### 7.3 v1.3 新增验证（2026-10-21）

用 opencode v2.1.2 自带命令实测（`opencode debug config` / `opencode debug agents`），按 v2 的 last-match-wins + Wildcard 规则复算生效权限：

| 测试 | 状态 |
|---|---|
| `opencode debug config` 归一化诊断 | ✅ 通过（0 错误 0 警告）|
| `experimental.subagent_depth: 2` 生效 | ✅ 通过（出现在解析结果里）|
| 顶层 `subagent_depth` 已移除 | ✅ 通过（v2 会以 `unsupported` 告警丢弃）|
| 9 个 agent 全部注册 + 9 个 `{file:...}` 全部解析 | ✅ 通过 |
| MCP 权限扁平键生效（`codebase-memory-mcp_search_graph` 等）| ✅ 通过（10 个只读工具 allow、4 个写工具 deny）|
| critic 的 `list_projects`（prompt 要求调用的工具）不再被 deny | ✅ 通过 |
| `.env` 读取：read → ask（全部 agent）| ✅ 通过 |
| `.env` 读取：shell cat/head/tail → deny（只读 agent）/ ask（build）| ✅ 通过 |
| `awk`/`env`/`printenv`/`jq` → ask（只读 agent）| ✅ 通过 |
| `find * -exec *` → deny（只读 agent）| ✅ 通过 |
| provider 模型 id 与上游一致（`opencode models` 核对）| ✅ 通过（`mimo-v2.5-pro` / `deepseek-v4.1-flash` / `kimi-k2.6` 均存在）|
| `.gitignore` 覆盖所有备份文件（`git check-ignore` 复核）| ✅ 通过 |
| 备份文件里的明文 API key 已隔离出索引 | ✅ 通过（**key 本身仍需轮换**）|

### 7.3.1 v1.4 新增验证（2026-10-21）

**配置层**（`opencode debug config` / `debug agents`）：

| 测试 | 状态 |
|---|---|
| `capabilities` 字段被接受、无归一化诊断 | ✅ 通过（0 错误 0 警告）|
| 10 个 agent 全部注册（含新增 `title`）| ✅ 通过 |
| `title` 接上 `openstarry/glm-5.3-flash`、`hidden=true` | ✅ 通过 |
| `context-builder.hidden` 生效 | ✅ 通过 |
| `librarian` 切到 `openstarry/deepseek-v4.1-flash` | ✅ 通过 |
| `plan` / `oracle` 不含 `temperature` | ✅ 通过 |
| 角色矩阵移出 AGENTS.md 后 build prompt 仍完整（7361 字符）| ✅ 通过 |

**模型层**（直接打 openstarry / models.dev 元数据）：

| 测试 | 结果 |
|---|---|
| `deepseek-v4.1-flash` 基本对话 | ✅ 正常返回（含 `reasoning_content`）|
| `deepseek-v4.1-flash` 工具调用 | ✅ `finish_reason: tool_calls`，参数正确 |
| `deepseek-v4.1-flash` 210,074 token 输入 | ✅ 被接受 → 现声明 262,144 有实测支撑 |
| `deepseek-v4.1-flash` 关思考（`thinking.type=disabled` / `enable_thinking=false` / `reasoning_effort=none`）| ❌ **三种参数全被网关忽略**，思考关不掉 |
| `glm-5.3-flash` 是否思考 | ✅ **不思考**（`reasoning_tokens=0`，无 `reasoning_content`）—— 成为 title/context-builder 的选型依据 |
| `MiniMax-M2.7-highspeed` 是否思考 | ⚠️ 无 `reasoning_content` 但正文内联 `<think>`，且 `reasoning_tokens>0` |
| 其余池内模型（qwen3.7-plus / kimi-k2.6）| ⚠️ 均返回 `reasoning_content` |
| openstarry `/v1/models` 是否返回 limit 元数据 | ❌ 不返回（只有 id + `supported_endpoint_types`）|
| `deepseek-v4-flash` 是否可用 | ❌ `model_price_error`（不在该套餐可用列表），且不在 `/v1/models` |
| `glm-5.1` 是否可用 | ❌ `model_price_error`；`/v1/models` 只有 `glm-5.3` / `glm-5.2` / `glm-5.3-flash` |
| `glm-5.3` / `glm-5.2` 是否可用 | ✅ 对话 + 工具调用均通过（未入池）|


---

## 已完成改动台账

> 原 `MULTI-AGENT-DESIGN.md` §8.1 / §8.1.1 / §8.1.2 / §8.1.3。剩余待办见该文档 §8.1 起。

### 8.1 v1.1 已完成

| 改动 | 章节 | 备注 |
|---|---|---|
| build 19 条危险命令 ask | §4.4.1 | bash last-match-wins |
| MCP 5 个写工具 deny/ask | §4.4.2 | 含 query_graph |
| subagent question 统一 deny | §4.4.3 | 与 prompt 自洽 |
| general 砍 npx/node/npm test | §4.4.3 | 严格 read-only |
| oracle/metis bash 改 deny+白名单 | §4.4.3 | 消除 ask 挂起风险 |
| explore websearch 改 deny | §4.4.3 | 本职是本地搜索 |
| plan 写入路径改 `.plans/` | §4.4.4 / §6.1 | 命名空间隔离 |
| `scripts/plans-init.sh` | §6.1 | 幂等 .gitignore 配置 |
| `commands/plans-init.md` | §6.1 | `/plans-init [path]` 命令 |

### 8.1.1 v1.2 已完成（2026-10-15）

| 改动 | 章节 | 备注 |
|---|---|---|
| 新增 `critic` subagent | §2.3 / §2.4 | 对抗式审稿，第 8 个 agent |
| `prompts/critic.md` 4 段式 prompt | §2.3 | 强制 BLOCKERS/SHOULD_FIX/NITS/验证建议 |
| critic 权限最严化（webfetch/websearch/task/question 全 deny）| §4.5.2 | R-06 |
| critic MCP 10 工具全 deny | §4.5.2 | 不查代码图谱 |
| `build.md` 加入 "何时调 critic" 5 条件 | §3.2 / §3.2.1 | R-07 |
| `build.md` 加入 critic 委派原则 | §2.2 | build agent 知道 critic 存在 |
| 移除 `zhipuai` 空 provider | §5.1 | 2026-10-15 清理 |
| 同步更新 §2.1 总览表 / §3.1 矩阵 / §4.3 权限表 | — | 反映 8 agent 现状 |
| 同步更新 §6 文件结构 / §6.2 JSONC 结构 | — | 反映 8 agent + 3 provider |

### 8.1.2 v1.3 已完成（2026-10-21）

| 改动 | 章节 | 备注 |
|---|---|---|
| OpenCode v2.1.2 schema 迁移（permission 扁平化 / `providers` / `experimental.subagent_depth`）| §4.6.1 | 旧写法在 v2 下静默失效 |
| `.env` 保护修复（agent 级 `read` 改对象形式 + shell 级 deny）| §4.6.2 | 内置 `*.env` ask 曾被 `read: allow` 覆盖 |
| 只读白名单收敛（砍 `awk` / `env` / `printenv` / `jq`）| §4.6.3 | `awk` 可 `system()` 任意命令 |
| critic 只读图谱工具恢复 + plan 的 MCP 写操作恢复 `ask` | §4.6.4 | 迁移时误降级 |
| 5 个只读 subagent 输出 XML → Markdown | §2.3 | 省 token、可读性更好 |
| 新增 `context-builder` subagent + `/critic-review` command | §2.3 / §3.1 / §3.2 | critic 上下文组装器 |
| 备份文件与明文密钥隔离（`.gitignore` + 移出索引）| §6 | `backup_v1/opencode.jsonc` 含明文 key |

### 8.1.3 v1.4 已完成（2026-10-21）

| 改动 | 章节 | 备注 |
|---|---|---|
| 模型元数据补全（`capabilities` × 12、`limit.context` 修正 × 4）| §5.1 | 按"厂商直连 / 实测 / 上游一致"分级取证据 |
| `librarian` → `openstarry/kimi-k2.6` | §5.2 | 成本优先；`deepseek-v4-flash` / `glm-5.1` 实测不在套餐，未采用 |
| 新增 `title` agent（glm-5.3-flash，不思考）| §2.1 / §2.3 | 替代 deprecated 的 `small_model` |
| `context-builder` 改 `hidden: true` | §2.3 | 避免污染用户手选列表 |
| `plan` / `oracle` 去掉 `temperature` | §2.1 | 模型 `temperature=false`，设了被忽略 |
| 角色矩阵从 `AGENTS.md` 移入 `prompts/build.md` | §1.2 / §6 | 消除与 subagent「固定小节」输出的冲突 |
| 6 个 subagent prompt 补「被权限拒绝即终止」+ 禁区清单 | §3.3 | 阻止 agent 换写法绕过权限 |
| `critic.md` 补「无法验证必须说明」 | §2.3 | 避免未验证结论被当成 PASS |
| `build.md` 补 subagent 返回结构表 + context-builder 触发条件 + 委派带 project 名 | §3.2 / §3.3 | 减少空转工具调用 |

### 8.1.4 v1.9 已完成（2026-11-03）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 新增「rdd-workflow 增强层（可选）」节 | §2.6 | 角色矩阵自足；skill 只在前置条件满足时调用 |
| 角色 ↔ 可选增强映射表（architect/planner/builder/verifier/general）| §2.6 | 前置条件取自各 skill frontmatter 原文 |
| 工件归属规则（同一路径上单一写入者 + 下游阶段写输入工件）| §2.6 | 解 `proposal.md` 双写风险 |
| 内置流程降级细节（openspec CLI / rddf CLI 缺失 / skill 调用失败）| §2.6 | 增强层故障不阻塞交付 |
| 新增 `scripts/rdd-skills.sh`（探测 + `--json`）| §6 | 探测顺序对齐 rdd-workflow `resolve_rdd_skill_dir` |
| verifier 产出契约的 `rdd-verifier` 分流条件 3 增补脚本判定路径 | §2.6 | 与增强层判定口径一致 |
| 角色矩阵自查清单增 2 项（探测 / 单一写入者）| §2.6 | 防止"装了 workflow 就乱调 skill" |
| 协作审计：统一 verifier 判定口径（以 skill frontmatter 为权威）| §2.6 | 消除「分流三条件」与增强层前置条件两套标准 |
| 协作审计：planner/builder 角色列表标注 `proposal.md` 归属 | §2.6 | 角色权限与工件归属规则不再自相矛盾 |
| 协作审计：补 `deps` / `execute` 的完整前置条件 | §2.6 | 映射表此前缺 2 个 skill 的可判定条件 |
| 协作审计：新增 pause / commit 契约（HARD pause 优先、commit 全局确认优先、`rdd-quick` 不自行进入）| §2.6 | `rdd-builder` P2 COMMIT GATE 与全局"不主动 commit"直接冲突 |
| 协作审计：可用性以 `skill` 工具为准，脚本仅作预筛 | §2.6 | 脚本 skill 名单是上游镜像，会漏判新增 skill |
| 协作审计：`design.md` 实际归属（`rdd-builder` P1 只生成 `tasks.md`）| §2.6 | owns 声明与 `phase1_plan.sh` 实现不一致 |
| `role-init.sh` 增 `.gitignore` 提示 | §6 | `role.json` 是个人状态，rdd-workflow 的 gitignore 守卫只覆盖 `openspec/` |
| 明确 `design.md` 定稿责任：`plan` agent 产出为草稿，`builder` 角色定稿 | §2.6 | 权限保持不动（方案 a），只消除"谁定稿"的模糊 |


---

## 演进日志

| 日期 | 版本 | 变更 | 原因 |
|---|---|---|---|
| 2026-11-03 | v1.9 | 角色矩阵与 rdd-workflow 解耦（自足内核 + 可选增强层）+ `scripts/rdd-skills.sh` | 调研发现两套角色模型零耦合：agent 角色不读 workflow 状态、workflow 不读 agent 角色；`proposal.md` 存在双写风险（agent planner 可写 / rdd-planner not_owns / rdd-builder owns）；且 `rddf guide` 的阶段检测仍认 v3 handoff 文件名，不能作为阶段真值 |
| 2026-10-13 | v1.0 | 初始设计 | 从 0 个 agent 演进到 7 个 agent |
| 2026-10-13 | v1.1 | 权限加固 4 项 + 路径修正 1 项 + slash command 1 项 | oracle 后审发现 3 类真问题（bash 无界 / MCP 写工具无界 / 描述-权限矛盾）+ plan 写入路径不一致 |
| 2026-10-15 | v1.2 | 新增 critic subagent + 权限最严化 + build.md 触发规则 | oh-my-openagent 调研发现"build 之后无审稿环节"是质量门禁缺失；critic 用 k3-256k 长上下文扫 PR diff；4 段式输出强制对抗立场 |
| 2026-10-21 | v1.4 | 模型元数据补全 + librarian 换低成本模型 + title agent + 提示词交叉修复 | 配置层三处硬伤（温度参数对不支持的模型、context limit 低报 4-8 倍、`capabilities` 缺失）；提示词层角色矩阵放错位置（AGENTS.md 注入所有 agent，与 subagent 固定小节输出冲突）；subagent 缺「被拒即终止」纪律；`small_model` 已 deprecated |
| 2026-10-21 | v1.3 | OpenCode v2.1.2 schema 迁移 + context-builder + XML→Markdown 输出 + 权限加固 | v2 的 MCP 权限 action 名改为 `<server>_<tool>`，v1 嵌套写法整体失效；顶层 `subagent_depth` 被静默丢弃；`.env` 保护被 agent 的 `read: allow` 覆盖；只读白名单里的 `awk`/`env`/`printenv`/`jq` 构成越权 |
