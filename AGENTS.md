# AGENTS.md — 所有会话生效

请用中文输出, 要求简洁且准确。

## 临时目录

临时文件、scratch 脚本、调试输出写到 `/tmp/opencode/<name>`。
**不要用 `/tmp`** —— OpenCode 默认拒绝通用系统临时目录,会导致读写失败。

---

## Build Agent 角色矩阵

**本矩阵只属于 build agent**，已移到 `prompts/build.md` 的「角色矩阵」段。

原因：AGENTS.md 会注入**所有** agent 的上下文。矩阵放在这里时，explore / librarian / oracle / metis / general / critic / context-builder 也会读到「每回合必须输出开场报告」的要求 —— 与它们各自 prompt 里「只输出固定小节、不要开场白」直接冲突，输出结构会不稳。

- **build agent** → 读 `prompts/build.md` 的「角色矩阵」段并遵守
- **其它 agent** → **完全忽略**一切角色相关内容（开场报告格式、角色切换、越权处理）

---

## 代码图谱工具：codebase-memory-mcp

> 本节只放**中性工具参考**（工具名 / 用法 / 权限 / 新鲜度）—— **只陈述工具事实，
> 不规定某 agent 该用哪个工具、也不规定搜索该派给谁**（各 agent 的职责与委派规则
> 以各自 prompt 为准：如 `librarian` 的「本地代码搜索 MUST 委派 explore」优先于本节）。

> ⚠️ **旧的 `code-review-graph` 工具名一律作废** —— MCP server 已换成 `codebase-memory-mcp`
> （配置见 `~/.config/opencode/opencode.jsonc` 的 `mcp` 段；版本以该段或 `--version` 为准）。
> 旧名 `semantic_search_nodes` / `get_impact_radius` / `get_review_context` /
> `get_affected_flows` / `get_architecture_overview` / `list_communities` / `refactor_tool`
> **全部不存在**；`query_graph` 虽同名，但它是 **Cypher**（不是 `pattern="tests_for"`）。
> ⚠️ **`code-review-graph` 这个 CLI 仍在用**（Python 包 `code_review_graph`）—— 某些仓的
> `.git/hooks/pre-commit` 靠它 ⇒ 与本 MCP 是**两个东西**，别一起删。

**何时用图谱**（**条件句**，不是「无条件优先」）：

- **适用**：任务对象是**本地代码**（定义在哪 / 谁调用 / 影响面 / 整体结构），且
  `list_projects` 能看到当前项目（= 已索引）⇒ ⇒ ⚠️ 若**自身 prompt 已规定搜索归属**
  （如 `librarian` 的「本地代码搜索 MUST 委派 explore」）⇒ **沿用 prompt**，本节不改它。
- **不适用 ⇒ 直接用 Grep/Glob/Read**：外部库 / 上游源码调研（图谱只索引本地 project）·
  治理面配置审查（图谱不索引 `~/.config/opencode/`）· 只做材料搬运（`context-builder` 的
  「只搬运、不推断」边界不因本节改变）· 项目从未索引。
- ⚠️ **图谱偏旧 ≠ 空结果**：索引跟随 git 提交更新；若 `index_status` 的 `head_sha` 落后于
  HEAD ⇒ 以 Grep/Glob/Read 为准 ⇒ **在产出里标注「图谱可能偏旧」**（有没有用户通道由各
  agent 自己的 prompt 决定 —— 只读 subagent 只回调用方，不要去找用户）。

| 想知道 | 用这个 |
|--------|--------|
| 「X 在哪定义 / 有哪些同名符号」 | `search_graph`（BM25 + camelCase 拆分 + 结构加权；`name_pattern` / `qn_pattern` / `file_pattern` / `label` / `include_connected` 过滤；`offset`+`limit` 翻页）|
| 「含某段文本的代码在哪」 | `search_code`（grep 后用图增强：命中归并到所在函数，按定义/被调用/测试排序；`regex` / `path_filter` / `file_pattern`）|
| 「谁调用了 X / X 调用了谁 / 影响面」 | `trace_path`（`direction=inbound\|outbound\|both`、`mode=calls\|data_flow\|cross_service`、`depth`、`risk_labels`、`include_tests`）|
| 「读 X 的源码」 | `get_code_snippet`（传 `search_graph` 返回的 `qualified_name`；**短名也可**（歧义时返回候选）；`include_neighbors` 带邻居上下文）|
| 「整体结构 / 热点 / 入口点 / 模块聚类」 | `get_architecture`（`aspects=[structure, dependencies, entry_points, hotspots, clusters, layers, boundaries, packages]`；`clusters` = Leiden 社区检测）|
| 「多跳 / 聚合 / 跨层查询」 | `query_graph`（**Cypher**；节点标签 `Function`/`Class`/`Method`/`Field`/`Section`/`File`/`Module`/`Variable`，边 `CALLS`/`USAGE`/`DEFINES`/`TESTS`/`IMPORTS`/`INHERITS`/`WRITES`）⚠️ **必须显式写节点 label 且显式写边类型** —— 不写 label 只采样约 30 个节点，写边类型才不返回空。可用 `get_graph_schema` 查标签/边清单 |
| 「这次改动的影响面」 | `detect_changes`（`project` 必填 + `since=<ref>` 或 `base_branch`、`scope`、`depth`）|
| 「图谱新不新鲜 / 有哪些项目」 | `index_status` / `list_projects` |

⚠️ **权限**：`codebase-memory-mcp_*` 全局默认 **deny**，仅 10 个只读工具 allow
（即上表用到的那些 + `get_graph_schema`）。写类工具（`index_repository` / `ingest_traces` /
`manage_adr` / `delete_project`）：**`build` / `plan` / `front` = `ask`（需用户批准）**；
**其它 agent = `deny`（调不到 ⇒ 请用户执行）**。
