# Multi-Agent 设计变更日志

> 本文件记录 `docs/MULTI-AGENT-DESIGN.md` 的**历史增量**：按版本切分的权限加固史、各版本验证记录、已完成改动台账、演进日志。
>
> **当前态只看 [MULTI-AGENT-DESIGN.md](MULTI-AGENT-DESIGN.md)**——本文档不描述现状，只记录「什么时候改了什么、为什么」。

---

## 版本变更摘要

> 本节内的 § 引用为**当时的**章节编号；原 §4.4–§4.6 / §7.1–§7.3.1 / §8.1–§8.1.3 现位于本文件后续小节，原 §9 演进日志位于文末。

> **v2.0 变更摘要**：新增**审查配对**（角色 → 审查者）—— `architect` → oracle + critic（oracle 先行）、`planner` → metis、`builder` → verifier（角色内建）+ critic（架构面）。审查是角色矩阵**内核**，不依赖 rdd-workflow；预算按**文档粒度**分层（单条 change 上限 = critic 2 + verifier 3）；补充**审查者不可用降级**（内置自检清单 + 结论首行注明，禁止把「不可用」当「通过」）。
>
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

### 8.1.5 v2.0 已完成（2026-11-04）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 新增「审查配对（每个角色由谁审）」节 | §2.7 | 4 行配对表 + 顺序约束 + 预算分层 + 不可用降级 |
| `architect` 审查改为 **oracle 先行 + critic 后审** | §2.7 | oracle 审「会怎么坏」，critic 审「是否越界 / 冲突」；顺序颠倒会白烧一轮预算 |
| `planner` 审查固化为 **metis**（新建或重写 ≥1/3 才触发）| §2.7 | 纯状态推进不审，避免噪音 |
| `builder` 审查固化为 **verifier（角色内建）+ critic（仅架构面）** | §2.7 | verifier 是角色不是 subagent → 不依赖 rdd-workflow |
| 审查预算按**文档粒度**分层（ADR 级 / improvement 级 / change 级）| §2.7 | 单条 change 审查上限 = critic 2 + verifier 3，不叠乘 |
| 审查者不可用**降级路径**（内置自检清单 + 结论首行注明）| §2.7 | 2026-11-04 实测 subagent 因 Token Plan 上限全部失败 |
| `build.md` 委派原则增加交叉引用（本节管「何时委派」，审查配对管「必须委派给谁」）| §2.7 | 两处规则此前互不知情 |
| `build.md` 自查清单增 2 项（固定审查者执行 / 不可用降级注明）| §2.7 | 防止「忘了审」与「静默跳过」 |
| 治理面改动（`prompts/**`、矩阵文档）归入 `architect` 产出，**必须过 oracle**（增删规则再加 critic `arch` 档）| §2.7 | 此前改矩阵本身不属于任何角色 → 零审查；上一轮 A1「verifier 两套判定标准」就是改错后返工的实例 |
| 治理面**降级自检清单** 6 条（不变式 / 权限 / 双判据 / 可判定 / 降级路径 / 预算冲突）| §2.7 | oracle 不可用时逐条自问，缺一条判未通过 |
| 治理面规则**首轮 oracle 审查**：8 条 finding（A1–A8）全部闭合 | §2.7 | 复审 `PASS-WITH-NOTES`；3 处一词级残留（§2.7 镜像摘要漂移）已按最小修法补齐 |
| 关键修正：治理面作用域补 `~/.config/opencode/` 前缀 + `AGENTS.md` / `docs/CHANGELOG.md` | §2.7 | 裸相对路径在项目 cwd 解析不到 → 规则永不触发；`AGENTS.md` 注入所有 agent 却此前不在作用域 |
| 关键修正：oracle 治理面审查须给 `PASS \| BLOCK \| PASS-WITH-NOTES` verdict + finding 逐条应答 | §2.7 | oracle 原生只有 4 节建议、无 pass/fail → 「调用过」会被误读成「通过」 |
| 关键修正：builder 撞到治理面缺陷 → findings + halted，不静默越权 / 不静默忽略 / 不死等 | §2.7 | 治理面归属 architect 但 builder 有仓库 edit 权限，原规则下 agent 只能二选一地犯错 |
| 关键修正：审查调用**一次失败即降级、不换模型重试**；「一次改动」= 一个 patch series 的文件集合 | §2.7 | 额度类失败是持续态，重试只烧预算；未定义计数单位会导致逐文件重复审查 |

### 8.1.6 v2.0.1 已完成（2026-11-04）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 架构文档范围节改为**判定三态**（配置存在且路径存在 → `arch_paths` / 配置缺失·空·损坏 → fallback 目录集 / 都不存在 → 只讨论不落文档）| §2.5 / §2.3 | 原规则「缺失或 `arch_paths` 为空 → 先跑 `/arch-docs-init` 再继续」在**没有架构文档目录的项目里死循环**：脚本扫不到目录就写空 `arch_paths` 并 WARN，重跑不收敛 → `architect` 第一步即卡死 |
| `/arch-docs-init` 从**前置闸门**降为**可选工具**（第 2 态判定时最多跑一次 `--dry-run`）| §2.5 | 只有用户想建立/更新目录结构时才跑（首次梳理 / 结构变更后 `--refresh`），不再因配置缺失而反复调用 |
| 消除 `build.md` 内部两套判定标准 | §2.5 / §2.3 | §2.3 档位映射已有 fallback 目录口径，§架构文档范围 此前没有 → 同一文件对「配置缺失」给出两种处置；本轮统一到同一套目录口径（§档位选择 的 `arch` 档路径集 = **权威映射**，critic 侧路径推断仅兜底）|
| 治理面**首轮 oracle 审查**：4 条 finding（F1–F4）全部闭合 | §2.5 | verdict `PASS-WITH-NOTES`，无 BLOCKER；F1 顶层架构目录漏判 → 目录集扩为 fallback ∪ `survey()` 目录；F2 配置路径全失效 → 态 1 加存在性校验；F3 `--check` 的 `MISSING`/`EMPTY` 误示为漂移 → 规则侧注明；F4 措辞 → 出口条件放宽 |
| 治理面**首轮 critic 审查 REJECT**：1 条 BLOCKER 闭合 | §2.5 / §2.7 | 态 3「只讨论不落文档」与治理面归属冲突 → 本仓（`~/.config/opencode`，无 ADR 目录）出现「**无角色可写 `prompts/**`**」：architect 按态 3 拒写，builder 按 §2.7 halted → 修法：§架构文档范围 加「管辖边界」（**治理面文件 `~/.config/opencode/**` 不受项目级 `arch_paths` 管辖**）+ 角色列表 architect 行补治理面编辑权 |
| critic SHOULD_FIX / NITS 闭合（口径统一 + 措辞补齐）| §2.5 / §2.3 | 可写范围拓宽到 `survey()` 目录后「什么算 arch 产物」仍是第二套判据 → §档位选择 的 `arch` 行扩为同一套目录集 + 明写「本表是权威映射」；`MULTI-AGENT-DESIGN.md` 路径映射同步；出口条件与触发时机补「JSON 损坏 / 路径全部失效」 |

### 8.1.7 v2.0.2 已完成（2026-11-04）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 治理面作用域表新增 `commands/**`（slash command = agent 行为指令，与 prompt 同级）与**被治理面规则行为依赖**的 `scripts/**`（改其退出码 / 报错文案 / 落盘行为时）| §2.7 | 此前两者都不在作用域表 → 改 agent 行为指令、改被引用脚本的退出码**都不触发审查**；触发条件收紧为「行为依赖」以排除历史记述性提及 |
| `scripts/arch-docs-init.sh` `--check`：**漂移只在配置已声明 `arch_paths`（判定三态 第 1 态）时成立**；配置缺失 / `arch_paths` 为空 / 配置损坏时只输出 `NOTE`、exit 0 | §2.5 | 旧语义把「未配置 / 空」判为漂移（exit 2）并输出「运行 /arch-docs-init 生成」→ agent 见它就回头跑 init → **半死循环残留**。10 场景夹具实跑全 PASS（`/tmp/opencode/p0/test-check3.sh`，含 init 产物往返自检）|
| `commands/arch-docs-init.md` 用法与报告要求同步（`NOTE` 的 4 种情形；报告要求 3 限定「仅当配置已声明 `arch_paths`」；要求 4「不要据此反复跑 init 或 `--refresh`」）| §2.5 | 消除「#3 跑 --refresh」与「#4 不要跑 init」互相冲突的下一步指令 → 无用户意图写盘 |
| `commands/role-init.md` 提示改为「按判定三态确定可写范围（不阻塞），需要固定时再跑 init（可选）」| §2.5 | 原提示「先运行 /arch-docs-init」与「可选工具、非闸门」冲突 |
| `prompts/critic.md` arch 档兜底目录集改引用 build 侧权威映射 + build 档补 `tools/**` + 锚点改指 §架构文档范围 | §2.3 | 消除「build 权威 / critic 兜底」两套目录口径 |
| `prompts/context-builder.md` 路径映射 arch 行同步为同一套目录集口径 | §2.3 | 第三套旧 5 目录口径收尾 |
| `docs/MULTI-AGENT-DESIGN.md` 头部状态 v1.9 → v2.0.2 + 本版变更行；§2.7 治理面作用域同步（谓词改「行为依赖」）| 头部 / §2.7 | MD 头部停在 v1.9、§2.7 作用域列表落后于 build.md |
| 治理面审查（v2.0.2 批）：oracle `PASS-WITH-NOTES`（7 finding 全闭）→ critic 首轮 `REJECT`（BLOCKER：文档承诺「exit 0」在**盘上有架构目录**时为假）→ 脚本侧收敛为「漂移仅态 1 成立」→ 复审 `APPROVE` | §2.7 | **自指审查**（本批含 `prompts/critic.md`、`prompts/context-builder.md`、§2.7 本身）→ 结论**不构成独立证据**；复审记 1 条 NIT 入 backlog（态 1 / 态 2 在「声明路径全部失效」场景下的名义差异，两者动作一致均为 `--refresh`）|

### 8.1.8 v2.0.3 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `scripts/arch-docs-init.sh` `load_arch_paths()` 重写：逐字符扫描、引号外的 `]` 即数组结束符、字符串转义反转义 | §2.5 | 旧实现按正则抓所有引号串、不知道数组在哪结束 → 手写**单行** JSON 会把 `]` 之后的键名/值当路径 → **假 STALE** → exit 2 → agent 被误导去 `--refresh`（而 `--refresh` 会覆盖配置、丢掉该条目）|
| `scripts/arch-docs-init.sh` 新增 `arch_paths_state()` 状态机（`ok` / `empty` / `corrupt` / `missing`），`--check` 三态各有专属 NOTE | §2.5 | 「多行空数组」原被误判「损坏」；「含 `arch_paths` 字段但数组截断」原被并入「为空」（不提示修复）→ 现按数组是否闭合区分 |
| `prompts/build.md` 态 1 补「部分路径失效仍属本态」；字段说明补键顺序约束；`--refresh` 补「先 `--dry-run` 比对会丢弃的条目」护栏 | §2.5 | 收掉上一批 critic 的 NIT（态 1 / 态 2 名义差异）与「`--refresh` 静默覆盖手写配置」隐患 |
| 新增 `tests/verify_arch_docs_scope.sh`（验证夹具，35 条断言）| §2.5 | 项目形状**直接复用 rdd-workflow-e2e 测试床的真实 fixture**（`setup_fake_project` / `write_arch_fixture` / `write_proposal_fixture`）→ 验证对象与 arch→planner→builder 工作流里的真实布局一致；断言脚本行为（exit code + 输出）+ 规则文本一致性 |
| 治理面审查（v2.0.3 批）：oracle `PASS-WITH-NOTES`（7 finding）→ critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 2 SHOULD_FIX）| §2.7 | **非自指批次**（不改 `prompts/critic.md`、§2.7 治理面作用域表）→ 结论**可作独立证据**；oracle 的 7 条 finding 全部处置；critic 的 2 条 SHOULD_FIX（截断 JSON 误标「为空」、「`--refresh` 无护栏」）**在审查后按建议修复**（按预算规则未再开复审轮，以夹具 35/35 + e2e 48/48 为证据）|

### 8.1.9 v2.1.0 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` architect 产出形态契约新增**「一次成稿流程」聚合块**（4 步：定位 / 成形 / 送审 / 收口，每步给判据落点）| §2.5 | architect 写一份 ADR 所需的判据此前散在 build.md 的 11 处、跨约 380 行 → 聚合块作**单点入口**，自查清单与降级自检改为只引用它（消除复述漂移点）|
| `build.md` 新增**「ADR 完成的标志」**（5 条：四要素齐 / oracle+critic 双审且报过 BLOCKER 须 1 次复审确认闭合 / `Status` 转已决 / 关联 change 已落库**或已登记**为 `backlog: <improvement 名>` / 审稿报告由 architect 誊写落 `.rddf/reviews/<adr>.md` 且被元数据引用）| §2.5 | 此前只有「形态清单」没有「什么算写完、审完谁改 Status、change 何时填」；**关联 change 允许暂态** → architect 不越权建 change、不永远停在 Draft |
| `build.md` 新增**「arch 档审稿判据摘要」**（BLOCKER 四类 + SHOULD_FIX 六类），并注明「以 `prompts/critic.md` 为准，本摘要是随取随用的索引」| §2.5 / §2.3 | 调 critic 时据此**选 2–3 条最相关重点**填 `focus`（不罗列全量）；oracle 不可用时据此逐条自检（不必再翻 critic.md）|
| `build.md`「对齐已有样板」补**无样板时的默认骨架**（元数据 → 背景与问题 → 决策 → 选项对比表 → 后果 / 代价 → Verification（可勾选验收判据））| §2.5 | 原先只让人向「ADR-091 / ADR-089 这类六段骨架」收敛，但既没给六段是哪六段、项目里也常无样板 |
| `build.md` 四要素：元数据加 **AC 映射**（change 未立项时允许暂缺、以 `backlog: <名>` 占位）、章节名统一为 **Verification（可勾选验收判据）**；verifier 产出契约的判据来源补第 4 项 | §2.5 / §2.6 | 消除「Verification 一词双义」与「ADR↔change 的 AC 断链」——verifier 现在能直接消费 ADR 的判据 |
| `build.md` §审查配对 architect 行：「产出去向」补齐 Decision 段 / 选项对比表；预算补「**BLOCKER → 允许 1 次复审**（只验闭合）」；§自查清单与 §降级自检改为引用聚合块 | §2.7 | finding 落点不再只限两章；复审轮次与治理面行同构（此前 architect 行漏写，完成标志因此永不可满足）|
| `docs/MULTI-AGENT-DESIGN.md` §2.5 同步 3 条要点 + 头部 v2.1.0；`tests/verify_arch_docs_scope.sh` 补 7 条断言（含 4 条**防漂移断言**：内联摘要条目数 == `critic.md` arch 档原始条数）| §2.5 | 摘要与 `critic.md` 是两份文本 → 用夹具锁住条数，防漂移 |
| 治理面审查（v2.1.0 批）：oracle `BLOCK`（1 BLOCKER + 2 SHOULD_FIX + 3 NITS）→ 全部处置 → critic 复审 `APPROVE`（BLOCKER 已闭合、无新 BLOCKER、1 SHOULD_FIX）| §2.7 | **自指审查**（本批改动的正是 §审查配对 表格行 / §自查清单 / §降级路径）→ 结论**不构成独立证据**；critic 复审的 1 条 SHOULD_FIX（AC 映射强制性与 backlog 暂态的字面顶牛）**在审查后按建议补一句消除**（未再开复审轮，证据：夹具 43/43 + e2e 48/48）|

### 8.1.10 v2.1.1 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 角色列表表后新增「**固定审查者不受『允许』列限制**」：逐角色枚举（architect: oracle → critic / planner: metis / builder: verifier 为角色内建 / 另有治理面行与架构面行 —— 以 §审查配对 为准，枚举非全集），`no-role` 按本表禁止列**不得调写类 subagent**（只读调研类仍可用）| §2.7 | **修 G1 硬矛盾**：architect 的允许列未列 `critic`，而 §2.7 要求 oracle → critic 双审 → 角色表（权限上限）与配对表（流程下限）互相限制。取**通用不变量**而非逐行补词（逐行补词只治一个角色，且诱导「没列 = 不能调」）|
| `build.md` §委派原则新增「**调研委派协议（explore / librarian）**」：材料不触发审查 / 必须委托 / 不必委托 / 一次一问（给清范围 + 期望输出）/ 权限不扩权（planner 走自读或 metis，verifier 走自读）/ 场景表指向 MD §3.2 且执行口径以本节为准 | §2.3 | **修 G2 协议缺口**：调研型此前只有任务类型映射 + 两条软约束，没有「何时必须/不必委托 / 一次一问 / 权限不扩权」，而审查型（oracle/critic/metis）有完整协议 —— 完备度差一个量级 |
| `build.md` `:37` 的 explore 映射加「**简单定位除外**」指针 | §2.3 | 消除 build.md 内部新旧口径冲突（旧 bullet 是无条件映射，新协议是有条件豁免，同节无优先级声明）|
| `docs/MULTI-AGENT-DESIGN.md` §3.1 注 + §3.2 指针 + 头部 v2.1.1 | §3 | §3.1 是 **agent 级**委派矩阵，与 build.md 的**角色列表表**不是同一张表 → 头部注与正文注统一主语并限定「本节 agent 矩阵的 ❌ 不在豁免范围」 |
| `tests/verify_arch_docs_scope.sh` 补 2 条 needle + 3 条**角色表结构完整性**断言 | §2.5 | 「表被插入内容劈开」这条断言在编写过程中**真的抓到一次**我造成的表格断裂（clause 插在 `no-role` 与 `general` 行之间）→ 修复后复跑通过；结构断言已固化，可防同类事故 |
| 治理面审查（v2.1.1 批）：oracle `PASS-WITH-NOTES`（2 SHOULD_FIX + 4 NITS）→ 全部处置 → critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 2 SHOULD_FIX）| §2.7 | **部分自指**（新增条款涉及角色权限表与 §审查配对 的关系）→ 结论**不构成独立证据**；oracle S1（内部口径冲突）/S2（no-role 与禁止列矛盾）/S3（「等 subagent」可被读成类型）/S6（协议对 planner/verifier 空转）已修；critic 的 2 条 SHOULD_FIX（verifier 无 metis 权限却由 :54 旁授 / MD 头部注主语错位）已修 |

### 8.1.11 v2.2.0 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` §角色切换新增「**实施阶段的新发现**」子节：5 行分类表（计划对实现漏 / `plan_drift` / `design_drift` / `blocked` / `noted`）× 判据 · 停下义务 · 增强层落点 · 无 rdd-workflow 落点 · 路由 | §2.2 | 补**真空 A**：实施阶段没有「新发现」分类法 —— `implementation_gap`/`proposal_drift` 只服务**验收**阶段，builder 实施中发现设计错误 / 计划漏项 / 新需求时归哪类、回给谁、要不要停，原先无规定 |
| 分类**复用 rdd-workflow 既有 kind**（`needs-revision` / `ac-fail` / `blocked` / `noted`），不新造 | §2.2 | 产品侧已有完整 backward 通道：`rddf feedback add`（single writer ADR-0037）+ loop guard + 双读通道；治理面只补「用哪个 kind / 落到哪 / 停下义务 / 路由 / 顺序 / 窗口触发条件」|
| 配套规则：先落记录→再切角色 / 停下粒度（量化阈值 + **无 task 清单时停整个 change**）/ 不得手写反馈文件 / 双重保险 / **预算共享**（revision_count 上限 3 → 同类 findings 合并提交）/ 跨层优先级（覆盖 skill advisory 续跑）/ 两类漂移并发 design_drift 优先 | §2.2 | 「先落记录」的理由是：切换会丢原上下文，而 feedback 通道正是 planner/architect 的读入口，先写才有交接凭据 |
| `build.md` §授权窗口新增 `builder → planner`（plan_drift）、`builder → architect`（design_drift）两条触发条件；统一「每一次窗口内的**角色间**自动切换都计入 `used += 1`」（→ no-role 不计入，窗口随即清空）；示例处加注「须用户把 `planner`/`architect` 写进 `roles`」 | §2.2 | 补**真空 B**：实施中最该自动化的两条**不在**窗口触发清单里 → 即使用户开了含这两个角色的窗口，也因「无明确触发条件」只能停下问用户 |
| `build.md` 角色列表 `builder` 行：「变更决策需切 `architect`」补成处置（findings + 停下 + 交用户 / 窗口内切 architect） | §2.2 | 与 §治理面缺陷条（findings + halted）同型，消除「只写禁令、不写停下义务」的名义不一致 |
| **读入口对齐产品源码**：`design_drift` 落 improvement 文件的 `## Feedback` 段，architect 经 `rddf feedback list <proposal>` 读 —— 明示**勿依赖 `.planner-feedback.json` 提升链** | §2.2 | oracle 查证：`route_feedback` **无生产调用方**；`rddf arch feedback` 读 `severity`/`status`/`proposal` 而 appender 不产出 → 真进了该文件会 KeyError → 原括注会让 architect 看不到 drift 内容、交接断裂 |
| `docs/MULTI-AGENT-DESIGN.md` §3.2.0 回环指针 + 头部 v2.2.0；`tests/verify_arch_docs_scope.sh` 补 3 条 needle + **kind 防漂移断言**（真读产品 `VALID_KINDS` 做**全集差集**，新 kind 会立刻报错）| §3 | 产品改 kind 集合时治理面同步告警，杜绝「自造分类」 |
| 治理面审查（v2.2.0 批）：oracle `PASS-WITH-NOTES`（3 SHOULD_FIX + 3 NITS）→ 全部处置 → critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 2 SHOULD_FIX + 3 NITS）| §2.7 | **自指审查**（本批改动的正是角色切换 / 授权窗口契约）→ 结论**不构成独立证据**；oracle F1（`.planner-feedback.json` 提升链未接线，括注错误）/F2（命令缺 `--from` 与位置参数）/F3（无 task 清单时停下不可判定）已修；critic 的 2 条 SHOULD_FIX（跨层优先级未覆盖「落点/读通道」冲突 / discovery 与验收重试共享 revision 预算无节流指引）与 3 条 NITS **在审查后按建议修补**（未再开复审轮，证据：夹具 52/52 + e2e 48/48）|
| `docs/rdd-workflow-product-issues.md`（**新增**）：把 v2.2.0 实施期核查中发现的 4 处产品缺陷整理成可直接提交上游的 issue 文本 | §3 | A：`route_feedback` 无生产调用方（提升链未接线）/ B：`rddf arch feedback` 对 appender 条目 KeyError / C：planner-feedback 重算静默丢 open 条目 / D：`skills/rdd-builder/SKILL.md` 落点描述与实现不符 —— 均附源码行号、复现步骤与建议修法 |
| `build.md` §角色列表权限修订（**v2.2.1**）：`planner` 补 `explore` / `librarian`（+「先自读」默认序 +「架构取舍停下请用户切 architect」的护栏）、`verifier` **只补** `explore`、`no-role` 允许列显式列出只读调研；§调研委派协议「权限不扩权」条目改为中性表述 | §2.2 | 补角色**只读调研**能力缺口（此前 planner/verifier 只能自读）；边界不变式保持（禁止列逐字未动，扩权只在「读」侧）。**同时取代 8.1.11 台账里「权限不扩权（planner 走自读或 metis，verifier 走自读）」的表述** —— 该 carve-out 已随本批删除 |
| `tests/verify_arch_docs_scope.sh`：内联摘要 ↔ `critic.md` 判据的**语义级**防漂移守卫（10/10 对应表）+ 「已废止 carve-out 措辞零命中」防回流断言 | §2.5 | 前者把防漂移从**条数**升级到**语义对应**（critic.md 改判据措辞 → 断言失败，要求同步对应表；负向测试确认会咬：改摘要一个词即 FAIL + exit 1）；后者防「planner/verifier 走自读」旧措辞回流成第二套判据 |
| `docs/MULTI-AGENT-DESIGN.md` 新增 **§2.8 角色切换与授权窗口**（角色轴投影）：三轴区分 / 角色一览 / `role.json` 状态文件 / 切换策略 / 授权窗口（四条件 + 6 条触发条件 + 关闭窗口 + 审计写入）/ 实施阶段新发现回环 | §2.8 | 补**结构性缺口**：MD 自称「当前态单写」，但**角色轴（persona）整条机制此前只存在于 `prompts/build.md`**（MD 有 agent 轴 §2/§3、有 tool 权限轴 §4，唯独缺角色轴）。投影**不改任何规则语义**，并声明执行权威在 build.md |
| `docs/MULTI-AGENT-DESIGN.md` §7.1 验证状态加 1 行 | §7.1 | 如实标注：机制为 prompt 级软约束，**未在真实 session 做运行时验证**（与 §7.2 口径一致）|
| `tests/verify_arch_docs_scope.sh` 加 9 条 MD 投影护栏 | §2.8 | 5 条锚点存在性 + 触发条件表**行数**（防漏行类漂移）+ 关闭窗口 / 审计写入 / auto 标记 / architect 治理面编辑权 —— critic 指出「needle 只锁存在性、锁不住漏行」后补强 |
| 治理面审查（MD §2.8 批）：**oracle 不可用**（原因：`opencode.jsonc.opencode-go` 中 oracle/metis 切到 `kimi-code/kimi-for-coding`，该模型无 `high` 变体 → subagent 调用失败）→ 降级为 critic 审查 + 治理面降级自检清单 6 条自检 | §2.7 | critic 判 `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 3 SHOULD_FIX + 2 NIT）：3 条 SHOULD_FIX 均为**投影漏项**（漏「关闭窗口」、把权威源的 4 条条件写成「三条件」、architect 行漏治理面编辑权）→ 已修；NIT（`general` 同名消歧 / CHANGELOG 版本断链）→ 已修。**本次为单审查者 + 自检，非双审**，结论不构成独立证据 |

**本批遗留（记入 backlog / 待上报）**

- **待上报 rdd-workflow 产品仓**（不在本仓范围）：`route_feedback` 无生产调用方 → `.planner-feedback.json` 提升链实际不通；`rddf arch feedback` 对 appender 产出的条目会 KeyError（字段不匹配）；planner-feedback 重算会丢弃未 resolved 的 open 条目；`skills/rdd-builder/SKILL.md` 的落点描述（「add 写入 .planner-feedback.json」/「Architect reads via `rddf arch feedback`」）与实现不符。治理面的警示注释依赖这些事实，产品侧修掉后注释需同步更新。
- discovery 记录与验收重试共用 `revision_count`（默认 3）—— 两类消费同一预算，本仓无法分离；已在规则里写明「同类 findings 合并成一条提交」。
- 无 `tasks.md` 的路径（rdd-quick / 本地）一律按停整个 change 处理，粒度偏粗（保守方向）。

**本批遗留（记入 backlog）**

- `planner`（角色）与 `plan`（agent）同名近形：协议锚在「见 §角色列表」且有「执行口径以本节为准」兜底，暂不冲突；若 plan agent 的角色表将来扩行，需在协议里写明「planner 角色（非 plan agent）」消歧。
- `no-role` 的「只读调研类 subagent 仍可用」依赖「禁止列反推允许」的读法（no-role 允许列未列任何 subagent）——行为合理，但若将来给 no-role 行补「调 `explore` / `librarian`（只读）」可从根上消歧。

**本批遗留（记入 backlog）**

- 内联判据摘要与 `prompts/critic.md` 仍是两份文本 —— 夹具只锁住「条数」，不锁「每条语义」；critic.md 改判据时需同步摘要。
- 「一次成稿流程」的 4 步是**入口收敛**，不消除 build.md 内部其余章节（角色列表 / 增强层 / 权限模型）的跨段引用成本。
- 「ADR 完成的标志」第 4 条的 `backlog: <improvement 名>` 登记位目前**无落盘位置约定**（未指定写在哪），暂由 architect 在响应正文声明。

**本批遗留（记入 backlog，不在 v2.0.3 处理）**

- 夹具的规则断言是**文本存在性**校验（非语义校验）——若规则被改写但保留锚点短语，needle 仍会过；语义正确性主要由行为断言组承载。
- `prompts/build.md` 字段说明里的键顺序约束构成「合法 JSON ∧ 生成器形状」的第二重 conformance（手写配置违约面变大）。
- 夹具组④与 e2e 床 fixture 内容耦合（床新增架构目录时需同步扩展，已加显式假设断言 + fallback 降级告警）。
- awk 对 `\n` / `\t` 等控制字符转义保留双字符（路径含字面 `
` 时仍是假路径，已注释声明为降级行为）。

---

## 演进日志

| 日期 | 版本 | 变更 | 原因 |
|---|---|---|---|
| 2026-11-05 | v2.2.2 | MD 新增 §2.8「角色切换与授权窗口」：补**角色轴（persona）在设计文档里的结构性缺口** —— 此前该机制只存在于 `prompts/build.md`，MD 有 agent 轴、有 tool 权限轴，唯独缺「角色是谁 / 怎么切 / 窗口怎么授权」这一轴；新增三轴区分表以免跨轴误读 | MD 自称「当前态单写」设计参考，却缺了角色切换/授权窗口整节 → 读者按 MD 理解会以为「授权只能等用完」、也会以为 architect 可写范围仅限 `arch_paths` 命中目录（漏了治理面文件编辑权） |
| 2026-11-05 | v2.2.0 | 新增「实施阶段的新发现」：builder 实施中发现的计划层 / 决策层问题**停下并路由**（`plan_drift` → planner / `design_drift` → architect / `blocked` → 交用户 / `noted` → 仅记录），kind 复用 rdd-workflow 既有词表；授权窗口新增 `builder → planner` / `builder → architect` 触发条件 | 两处规则真空：**A** 实施阶段没有「新发现」分类法 —— `implementation_gap`/`proposal_drift` 只服务验收阶段，实施中撞上设计错误/计划漏项时归哪类、回给谁、要不要停，原先无规定；**B** 窗口内自动切换清单只有 `builder→verifier` 等四条，实施中最该自动化的 `builder→architect`/`builder→planner` 不在其中 → 即使用户开了窗口也只能停下问用户。调研发现产品侧已有完整 backward feedback 通道（`rddf feedback add` + 5 种 kind + loop guard + 双读通道），故本批**不新造分类**，只补治理面的映射、停下义务、顺序（先落记录再切角色）与窗口触发条件 |
| 2026-11-05 | v2.1.1 | 角色列表「固定审查者不受允许列限制」（修 architect 调不了自己 critic 的硬矛盾）+ 新增「调研委派协议」（explore/librarian 的必须/不必委托、一次一问、权限不扩权、材料不触发审查）+ 角色表结构完整性断言 | 分析发现两个缺口：**G1** architect 允许列未列 `critic` 而 §2.7 要求 oracle → critic 双审 → 权限表（上限）与配对表（下限）互相限制；**G2** 调研型 subagent 只有任务类型映射、无「何时必须/不必委托 / 一次一问 / 权限不扩权」，与审查型（oracle/critic/metis）的协议完备度差一个量级 → 现实里表现为「什么都先 explore 一遍」与「本该 explore 却自己 grep 十几轮」|
| 2026-11-05 | v2.1.0 | architect 产出形态契约重构：新增**一次成稿流程**聚合块（4 步单点入口）+「ADR 完成的标志」（完成闭环）+ **arch 档审稿判据摘要内联** + 无样板默认骨架 + Verification 统一命名与 AC 映射接入 verifier | 此前 architect 的判据散在 11 处、跨约 380 行，每回合跨段拼接；只有「形态清单」没有「什么算写完」（Status 谁改、change 何时填、审稿报告谁写都没规定）；调 critic 时 build 不知道 arch 档查什么（critic 是被动审稿人），oracle 不可用时「四要素逐条」是形态不是判据；样板引用（ADR-091/089）在项目无样板时不可得；「Verification」一词双义且 ADR↔change 的 AC 断链 → verifier 消费不到 |
| 2026-11-05 | v2.0.3 | `arch-docs-init` 的 `arch_paths` 解析器重写（数组边界识别 + 反转义）+ 状态机（ok/empty/corrupt/missing）+ 判定三态措辞收敛 + 新增基于 rdd-workflow-e2e 真实 fixture 的验证夹具 | v2.0.1/v2.0.2 把 `arch-docs-init` 降为可选工具后，解析器仍按正则抓引号串、不知道数组在哪结束 → 手写单行 JSON 产生**假 STALE** → agent 被误导跑 `--refresh`（会覆盖配置、丢掉手写条目）；「多行空数组」与「截断 JSON」被误判为「损坏/为空」，与规则的「损坏时提示修复」不同源。验证载体此前只有临时夹具，现固化为 `tests/verify_arch_docs_scope.sh`（35 条断言，项目形状取自 rdd-workflow-e2e 真实 fixture）|
| 2026-11-04 | v2.0.2 | 治理面作用域补 `commands/**` 与被规则**行为依赖**的 `scripts/**`；`arch-docs-init --check` 的漂移判定收紧为「仅态 1」；目录集口径在 build / critic / context-builder 三处统一 | v2.0.1 把 `/arch-docs-init` 降为可选工具后配套面没跟上：`--check` 仍把「未配置 / 空」判为漂移并指示跑 init（半死循环残留）；`role-init` 仍把 init 当前置；`critic` / `context-builder` 仍是旧 5 目录口径；`commands/**` 与 `scripts/**` 不在治理面作用域表 → 这些改动都不触发审查 |
| 2026-11-04 | v2.0.1 | 修复 `architect`「配置缺失 → 反复 `/arch-docs-init`」死循环 + 统一 fallback 判定 + 补治理面管辖豁免 | `arch-docs-init.sh` 在项目没有架构文档目录时写出空 `arch_paths` 并 WARN、重跑不收敛；而 `build.md` §架构文档范围 要求「缺失/为空就先跑 `/arch-docs-init` 再继续」→ 无 ADR 目录的项目里 `architect` 第一步即死循环。另：`build.md` 内部对「配置缺失」存在两套处置（§档位选择 有 fallback 目录口径，§架构文档范围 没有）。审查：oracle `PASS-WITH-NOTES`（4 finding 全闭）→ critic 首轮 `REJECT`（BLOCKER：态 3 挡住治理面文件 → 本仓「无角色可写 `prompts/**`」）→ 修复后复审 `APPROVE_WITH_CONDITIONS`（BLOCKER 已闭合，无新 BLOCKER）|
| 2026-11-04 | v2.0 | 新增「审查配对」（角色 → 审查者）+ 审查预算分层 + 审查者不可用降级 | 角色矩阵此前只有「什么时候委派 subagent」的触发规则，没有「哪个角色必须委派给谁」的固定配对 → 产出物可以不经任何审查就落地。实测：手上 3 个 openspec change 在 planner 阶段未过 metis 深度审查，到 critic 第 1 轮才暴露 3 处**事实性错误**（ADR 引用引反 / 目录深度写错 / 连字符模块路径 SyntaxError）。另：`architect` 原先只写「用 critic `arch` 档审稿」，漏了 oracle 的「会怎么坏」这一层，等于只审一致性不审方案本身 |
| 2026-11-03 | v1.9 | 角色矩阵与 rdd-workflow 解耦（自足内核 + 可选增强层）+ `scripts/rdd-skills.sh` | 调研发现两套角色模型零耦合：agent 角色不读 workflow 状态、workflow 不读 agent 角色；`proposal.md` 存在双写风险（agent planner 可写 / rdd-planner not_owns / rdd-builder owns）；且 `rddf guide` 的阶段检测仍认 v3 handoff 文件名，不能作为阶段真值 |
| 2026-10-13 | v1.0 | 初始设计 | 从 0 个 agent 演进到 7 个 agent |
| 2026-10-13 | v1.1 | 权限加固 4 项 + 路径修正 1 项 + slash command 1 项 | oracle 后审发现 3 类真问题（bash 无界 / MCP 写工具无界 / 描述-权限矛盾）+ plan 写入路径不一致 |
| 2026-10-15 | v1.2 | 新增 critic subagent + 权限最严化 + build.md 触发规则 | oh-my-openagent 调研发现"build 之后无审稿环节"是质量门禁缺失；critic 用 k3-256k 长上下文扫 PR diff；4 段式输出强制对抗立场 |
| 2026-10-21 | v1.4 | 模型元数据补全 + librarian 换低成本模型 + title agent + 提示词交叉修复 | 配置层三处硬伤（温度参数对不支持的模型、context limit 低报 4-8 倍、`capabilities` 缺失）；提示词层角色矩阵放错位置（AGENTS.md 注入所有 agent，与 subagent 固定小节输出冲突）；subagent 缺「被拒即终止」纪律；`small_model` 已 deprecated |
| 2026-10-21 | v1.3 | OpenCode v2.1.2 schema 迁移 + context-builder + XML→Markdown 输出 + 权限加固 | v2 的 MCP 权限 action 名改为 `<server>_<tool>`，v1 嵌套写法整体失效；顶层 `subagent_depth` 被静默丢弃；`.env` 保护被 agent 的 `read: allow` 覆盖；只读白名单里的 `awk`/`env`/`printenv`/`jq` 构成越权 |
