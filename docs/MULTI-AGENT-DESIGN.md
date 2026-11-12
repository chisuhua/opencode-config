# Multi-Agent 系统设计参考

> **状态**: v2.3.0 (2026-11-11)
> **范围**: `~/.config/opencode/` 用户配置级 multi-agent orchestration
> **下游**: `opencode.jsonc`（符号链接 → `opencode.jsonc.opencode-go`）+ `prompts/*.md` + `commands/*.md` + `scripts/*.sh`

本文档是 OpenCode V2 multi-agent 系统的**当前态**设计参考：设计原则、agent 详细定义、委派拓扑、权限模型、provider 路由、未来改进 TODO。后续重构时请先读本文件。

> **本版（v2.3.0）变更**：新增 §2.9「subagent 输入契约」—— 把 `prompts/build.md` 里「7 字段上下文契约」从**散文**变成**可判定的门**：规则真源 `lib/subagent-contract-core.ts`、宿主接线 `plugins/subagent-contract.ts`（L3 `session.hook("context")` 生成前告知 / **L1 `tool.hook("execute.before")` 硬门** / L2 `session.hook("prompt")` 检测）、审计 CLI `scripts/audit-subagent-prompts.ts`。默认 **warn**（灰度），逐 agent 可切 `enforce`；豁免 = 关键词（限任务陈述区 400 字符）+ 结构前置（缺失 ≥4/7）+ 状态继承（继承"复审模式"且本轮自证引用上一轮，续接轮不清零）。
>
> **本版（v2.2.3）变更**：运行环境修复（非规则变更）—— `kimi-code` provider 迁到 V2 包名 `@opencode/ai/providers/openai-compatible`，并为 `kimi-for-coding` / `k3-256k` 补 `variants`（`reasoning_effort` 映射），修复 oracle 的 `Variant unavailable`。
>
> **本版（v2.2.2）变更**：新增 §2.8「角色切换与授权窗口」—— 补上**角色轴（persona）**在本文档的结构性缺口（此前只存在于 `prompts/build.md`）：角色一览 / `role.json` 状态文件 / 切换策略 / 授权窗口三条件与触发条件 / 实施阶段新发现回环；同时显式区分**三个轴**（agent 轴 / 角色轴 / tool 权限轴），避免跨轴误读。
>
> **本版（v2.2.0）变更**：新增「实施阶段的新发现」处置 —— builder 实施中发现的计划层 / 决策层问题**停下并路由**（`plan_drift` → planner / `design_drift` → architect / `blocked` → 交用户），**先落 feedback 记录再切角色**；分类复用 rdd-workflow 既有 kind（`needs-revision` / `ac-fail` / `blocked` / `noted`），不新造；授权窗口新增 `builder → planner` / `builder → architect` 两条触发条件（须用户显式把角色写进 `roles`），并统一「每次窗口内自动切换都计入 `used`」。
>
> **本版（v2.1.1）变更**：`prompts/build.md` 的**角色列表表**「允许」列只列**自由裁量**工具，**固定审查者（流程义务）不受其限制**（`no-role` 除外；§3.1 的 agent 矩阵 ❌ 不在豁免范围）—— 此前 architect 的允许列未列 `critic`，与 §2.7 要求的 oracle → critic 双审冲突；`prompts/build.md` 新增「调研委派协议」（`explore`/`librarian` 的必须委托 / 不必委托 / 一次一问 / 权限不扩权 / 材料不触发审查），场景对照仍以 §3.2 为准、执行口径以 build.md 为准。
>
> **本版（v2.1.0）变更**：architect 产出形态契约新增**一次成稿流程**（4 步聚合块）+「ADR 完成的标志」+ **arch 档审稿判据摘要内联** + 无样板时的默认骨架 + Verification 章节名统一与 AC 映射；审查配对的 architect 行「产出去向」补齐 Decision 段 / 选项对比表；自查清单与降级自检改为引用聚合块。
>
> **本版（v2.0.3）变更**：`arch-docs-init` 的 `arch_paths` 解析器重写（按数组边界识别 + 转义反转义）+ 配置状态机（`ok`/`empty`/`corrupt`/`missing`）；判定三态措辞收敛（部分失效 / 全部失效）；`--refresh` 前须先 `--dry-run` 比对会丢弃的手写条目；新增 `tests/verify_arch_docs_scope.sh` 验证夹具（项目形状取自 rdd-workflow-e2e 真实 fixture）。
>
> **本版（v2.0.2）变更**：治理面作用域补 `commands/**` 与**被治理面规则行为依赖**的脚本（§2.7）；`/arch-docs-init --check` 的漂移判定收紧为「仅当配置已声明 `arch_paths`」（配置缺失 / `arch_paths` 为空 / 配置损坏时只输出 `NOTE`、exit 0）；`critic` 的 arch 档兜底目录集改引用 build 侧权威映射（v2.0.1：`architect` 可写范围判定三态 + 治理面管辖豁免；v2.0：§2.7 审查配对）。
>
> **本版（v1.9）变更**：角色矩阵与 rdd-workflow 解耦——角色矩阵改为**自足内核**，rdd-workflow 降为**可选增强层**（§2.6）。新增 `scripts/rdd-skills.sh`（增强层探测）。角色权限边界不变。
>
> **本版（v1.8）变更**：本文档改为「当前态单写」——按版本切分的增量内容（权限加固史、各版本验证记录、已完成改动台账、演进日志）全部外移到 [`docs/CHANGELOG.md`](CHANGELOG.md)；新增 §2.5「architect 产出形态契约」与 critic `arch` 档的聚焦判据（§2.3）。历史内容见 CHANGELOG。

---

## 1. 设计原则

### 1.1 核心思想

**"Specialist > Generalist"** —— 每个 agent 在自己的领域内最大化深度，跨领域任务通过委派完成。

- **少而精**：10 个 agent（3 primary：build / plan / title + 7 subagent），每个有明确边界
- **单职责**：每个 agent 的 prompt 中明确"什么是我做的、什么不是"
- **可验证**：所有 agent 配置 schema 合规（v2 归一化 0 错误 0 警告，`opencode debug config` 可复核）
- **可演进**：所有 prompt 走 file 引用，修改 prompt 不动 JSON

### 1.2 决策依据

- **上游 oh-my-openagent v5.0.0-beta** 的 11-agent 设计是参考蓝本
- **OpenCode V2 schema**（https://opencode.ai/config.json）是字段约束
- **本地 provider 池**（3 个 provider、12 个 model）是模型选择硬约束
- **AGENTS.md 仍叠加**：所有 agent 的 system prompt = `[agent prompt] + [AGENTS.md] + [环境信息]`。因 AGENTS.md 会注入**所有** agent，**build 专属的角色矩阵放在 `prompts/build.md` 而非 AGENTS.md**（v1.4 迁移）——放 AGENTS.md 时其余 agent 也会读到「每回合输出开场报告」，与它们各自 prompt 的「只输出固定小节」直接冲突。

### 1.3 非目标

- ❌ 不是"AI 智能体框架"——只做用户配置级别的 agent orchestration
- ❌ 不修改 OpenCode 内部代码
- ❌ 不引入外部依赖（plugin、MCP 等已被精简）
- ❌ 不追求完全自动化——保留 build agent 的人工触发能力

---

## 2. Agent 体系（11 个）

### 2.1 总览

| Agent | Mode | 角色 | Model | Temperature | Context |
|---|---|---|---|---|---|
| **build** | primary | 严谨代码工程师 | `minimax-cn/MiniMax-M3.1-Flash` | 0.1 | 1,000,000 |
| **plan** | primary | 设计者+只读规划 | `minimax-cn/MiniMax-M3.1-Flash` | —（未设） | 1,000,000 |
| **explore** | subagent | 本地代码搜索 | `opencode/deepseek-v4.1-flash-free`（`variant: low`） | 0.1 | 200,000† |
| **librarian** | subagent | 外部文档/依赖调研 | `opencode/deepseek-v4.1-flash-free`（`variant: low`） | 0.1 | 200,000† |
| **oracle** | subagent | 架构咨询 | `kimi-code/kimi-for-coding`（`variant: max`） | —（未设） | 1,048,576 |
| **metis** | subagent | 计划前差距分析 | `commandcode/deepseek/deepseek-v4.1-flash` | 0.3 | 1,000,000† |
| **general** | subagent | 多面手 fallback | `commandcode/deepseek/deepseek-v4.1-flash` | 0.2 | 1,000,000† |
| **critic** | subagent | 对抗式审稿 | `kimi-code/kimi-for-coding` | 0.1 | 1,048,576 |
| **context-builder** | subagent | critic prompt 组装器 | `opencode/deepseek-v4.1-flash-free` | 0.1 | 200,000† |
| **front** | primary | 用户交互内核 / 委托出口 | `minimax-cn/MiniMax-M3.1-Flash` | 0.1 | 1,000,000 |
| **title** | primary（hidden） | 会话标题/摘要生成 | `opencode/deepseek-v4.1-flash-free`（`variant: low`） | —（未设） | 200,000† |

> **本表以 `opencode.jsonc.opencode-go`（`opencode.jsonc` 符号链接当前指向）为真源**，改动配置后必须同步本表（§11「修改后必做」）。
>
> **`temperature` 一栏为 `—` 的含义**：配置里**未设**该字段——`oracle`（k3-256k）因模型 `capabilities.temperature=false` 不能设，设了也被上游忽略；`plan` / `title` 是主动不设。
>
> **`Context` 一栏优先取配置里的 `providers.<id>.models.<model>.limit.context`**，不是上游标称值 —— 修正依据与证据强度见 §5.1。带 `†` 的模型未在配置声明 `limit`，取 models.dev 值（opencode 运行时即以其为默认）。
>
> **v2.4 订正（2026-11-08）**：本表按**运行时真值**重算 —— 数据取自 `opencode debug agents`（生效配置解析结果），不是对配置文件的肉眼抄读；`Context` 带 `†` 的模型未在配置声明 `limit`，取 models.dev 值。
>
> **踩过的坑**：v2.4 初稿曾按配置文件的一次中间态抄读，把 build / explore / oracle 记成 `commandcode/deepseek/deepseek-v4.1-flash`，与运行时真值不符（实际分别是 `minimax-cn/MiniMax-M3.1-Flash` / `opencode/deepseek-v4.1-flash-free` / `kimi-code/kimi-for-coding`）。**选型表以 `opencode debug agents` 为准，不要以配置文件某一时点的内容为准。**

### 2.2 Primary Agents（3 个，用户直接交互）

#### `build` —— 主对话 agent
- **职责**：代码编写、修改、调试、提交
- **核心 prompt**：`prompts/build.md`（含 critic 委派规则 + subagent 返回结构表 + 工具调用纪律 + v1.4 迁入、v1.6 加固的角色矩阵 + v1.8 新增的「architect 产出形态契约」，见 §2.5）
- **权限**：几乎全 allow（read/edit/grep/glob/list/bash/task/webfetch/websearch/lsp/skill/question）；bash 的 19 条危险命令 ask；`.env` 读取 ask；MCP 4 个写工具 ask；`external_directory: ask`
- **典型 workflow**：
  1. 接收用户任务
  2. 委派 subagent 收集信息（explore / librarian / oracle / metis / critic）
  3. 整合 subagent 输出
  4. 执行代码改动
  5. 验证（测试/lint）
  6. **大改动前置审稿**：满足 §3.2 "何时调 critic" 条件时，先调 critic 拿到 4 段式结论再 commit

#### `front` —— 用户交互内核 / 委托出口
- **职责**：与用户对话、明确意图、给选项；**一切工程行动经 `delegate` 插件工具转交工程 session**
- **核心 prompt**：`prompts/front.md`（四分类路由 + 委托 brief 契约 + 状态扫描清单 + 降级纪律）
- **权限**：`read`/`grep`/`glob`/`list` allow；`shell` **只读白名单**（`*: deny` 打头 + 47 条只读 allow + 尾部守卫 deny，含 `"* /*": deny` 禁绝对路径）；`external_directory` 按路径 allow（`/workspace/**` + 治理面目录）；`edit`/`write`/`skill` deny；`subagent` **仅 `explore` / `librarian` / `oracle` / `metis` / `critic` allow**（`"*": deny` **必须是第一条**，v2.5 + ADR D2.1：opencode 的工具可见性判定取该 action **最后一条**匹配规则，`"*": deny` 放末尾会把整个 `subagent` 工具隐藏）；`delegate` / `delegate_dispatch` / `delegate_sessions` / `delegate_suspend` / `delegate_cancel` allow（**唯一登记型通道**——五个 action 同挂 `delegate` 插件、各自独立放行；「唯一」指**门控边界**唯一，**不是工具名**唯一，ADR `docs/adr/ADR-front-multi-backend.md` D1）
- **门控**：五个工具各声明**独立** `options.permission`（`delegate` / `delegate_dispatch` / `delegate_sessions` / `delegate_suspend` / `delegate_cancel`）→ 全局 deny + 仅 front allow ⇒ 其余 agent 调用时答 `NO_TOOL`
- **典型 workflow**：
  1. 判类（理解性 / 实施性 / 流程性 / 需裁决）
  2. 理解性 → 自己 `read`/`grep`/`glob` 答；流程性 → 读 `.rddf/state/` 出摘要（带新鲜度标注）
  3. 实施性 → 组六必填 brief（+ 必要时向用户预批 `grants`）→ 调 `delegate`（要等结果）或 `dispatch`（并发多任务；**同一工作树一次一个活跃**，换后端先 `suspend`）
  4. 读返回值（`outcome` / `host_outcome` / `blocked_reason` / `out_of_scope_files` / `no_work_evidence`）→ 转述给用户；**`outcome=unverified`（宿主成功但无交付证据）不得说成完成**。⚠️ `dispatch` **不回 `outcome`**（只回 `state` / `delivery_known`）⇒ 其结论须用 `sessions` 查
- **详见**：`docs/dual-session-delegation.md`

#### `plan` —— 设计者 agent
- **职责**：只读探索、评估取舍、产出可验证的计划
- **核心 prompt**：`prompts/plan.md`（3932 字节，103 行）
- **权限**：严格只读 + `edit` 仅 `.plans/*.md` / `docs/adr/draft-*.md` / `openspec/changes/*/design.md` 允许 + bash 仅允许安全只读子集（`.env` 读取 deny）
- **典型 workflow**：
  1. 用户切到 plan（Tab 键）
  2. 阅读需求
  3. 优先委派 `metis` 做 gap 分析
  4. 委派 `explore` 摸清现状
  5. 写 `<project-root>/.plans/YYYYMMDD-<slug>.md` 计划文件
  6. 给用户选择题（不替用户拍板）

### 2.3 Subagents（7 个，subagent 工具调用）

#### `explore` —— 本地代码 grep
- **核心 prompt**：`prompts/explore.md`
- **权限**：read-only allowlist（read/grep/glob/list/bash 安全子集/webfetch/websearch）；**v2.5 起 shell 为三段式**：`*: deny` 打头 + 只读白名单 + 尾部守卫 deny（重定向 / `tee` / `find -exec/-fprint/-fls` / `sort|uniq -o` / `git --output|--format|--pretty` / `.env` 族）
- **不能**写、不能委派
- **输出**：Markdown 四节（匹配文件 / 直接答案 / 下一步），路径必须绝对

#### `librarian` —— 外部文档/依赖源码 ⭐有特殊委派规则
- **核心 prompt**：`prompts/librarian.md`（3601 字节，82 行）
- **权限**：read-only + **三段式 shell**（`*: deny` + 只读白名单 + 尾部守卫）；额外保留 `curl` / `wget` / `git clone` / `git ls-remote`，clone 仅 `/tmp/opencode/*`（`git clone * /*` deny）；**不套** `* /*` 绝对路径守卫（v2.5）
- **特殊规则**：
  - 本地代码搜索 → **委派给 `explore`**
  - 外部 API/库文档 → 自己 `webfetch`
  - 付费墙 → 走 fallback 链（websearch → GitHub raw → Wayback → 放弃）
- **不能**写项目文件
- **只能**委派 `explore`
- **输出**：Markdown 五节（文档 / 上游实现 / 获取失败 / 直接回答 / 下一步）

#### `oracle` —— 架构咨询
- **核心 prompt**：`prompts/oracle.md`
- **权限**：read-only + **三段式 shell**（`*: deny` + 只读白名单 + 尾部守卫；v2.5 起不再依赖 `*: allow`）；`.env` 读取被拒
- **输出**：Markdown 四节（根因 / 建议 / 已排除的替代方案 / 下一步）

#### `metis` —— 计划前 gap 分析
- **核心 prompt**：`prompts/metis.md`
- **温度 0.3**（最高）—— 创造性发散
- **权限**：read-only + **三段式 shell**（`*: deny` + 只读白名单 + 尾部守卫；v2.5 起不再依赖 `*: allow`）；`.env` 读取被拒
- **输入**：计划草稿 OR 准备规划的 prompt
- **输出**：Markdown 六节（隐藏意图 / 歧义 / AI slop 风险 / 缺失的验收标准 / 边界情况 / 建议修改）

#### `general` —— 多面手 fallback
- **核心 prompt**：`prompts/general.md`
- **职责**：处理跨领域、没专门 agent 覆盖的杂活
- **权限**：**严格 read-only**（v1.1 起砍掉 `npx *` / `node *` / `npm test *`——与 prompt 第 36/48 行 "Read-only" 自洽）
- **关键约束**：**不能委派子 agent**（它是兜底）
- **典型场景**：
  - 复现 bug（看日志、提报告，不跑测试——测试交给 build）
  - 一次性多步研究
- **输出**：Markdown 四节（任务概述 / 发现 / 结论 / 下一步）

#### `critic` —— 架构与决策审稿 ⭐v1.2 新增 / v1.5 收窄
- **核心 prompt**：`prompts/critic.md`（强制 4 段式输出 + `mergeable` / `scope_exceeded` 信号）
- **职责**：审**架构方向与关键决策**——与 ADR 是否一致、决策是否有据、有没有会让 change 目标场景失败的设计缺陷。不审执行细节（文档计数、格式、测试边角、护栏绕过面）
- **模型选择动机**：`kimi-code/kimi-for-coding`（长 diff 扫描 + 全仓文件读取，1M 上下文优先于单价；历史选型轨迹见 CHANGELOG）
- **权限**：**最严格 read-only**
  - `edit / webfetch / websearch / task / question` 全部 deny
  - MCP：**10 个只读图谱工具 allow**（`search_graph` / `get_code_snippet` / `trace_path` / `get_architecture` / `get_graph_schema` / `query_graph` / `search_code` / `detect_changes` / `list_projects` / `index_status`），4 个写工具 deny（§4.4.2）
  - bash 白名单：与其它只读 agent 同级的只读子集（rg/grep/find/ls/cat/head/tail + git 只读子命令 + 文本工具），**不含** `curl / wget / git clone`——critic 不联网、不下源码
  - `.env` 读取 deny（read → ask）
- **关键约束**：
  - **不写代码**——只 review；改了就不是 review
  - **不跑构建 / 测试 / 变异测试**，不写 scratch fixture（v1.5；实跑验证交给 build/verifier）
  - **不联网**——webfetch/websearch 严格 deny
  - **不委派**——task deny
  - **不问用户**——question deny；遇到不确定返回"我不确定 + 看了什么"给 parent
- **BLOCKER 通用兜底（v1.5，profile 专用清单未覆盖时）**：① 会让 change 的验收场景直接失败；② 会把错误契约冻进主 spec / 公开 API / 持久化格式；③ 与已签批 ADR 或架构立场直接冲突
- **审稿档位（v1.6，`review_profile`）**：按**产物路径**判，不按 `role.json` 判（角色是权限边界，会中途切换且可能不存在）。跨档时分别出结论：

  | profile | 审什么 | 该档位内的 BLOCKER |
  |---|---|---|
  | `arch` | ADR / 架构文档 / roadmap 决策 | 冲突已签批 ADR 未走取代流程；决策缺备选/回滚；文档内同一决策二义；未决写成已决 |
  | `plan` | proposal / design / tasks / spec delta | AC 不可验收；tasks 的 verify 与 delta 矛盾或不可能通过；范围/顺序与 roadmap 冲突；delta 与实现矛盾会冻错主 spec |
  | `build` | 源码 / 测试 / 脚本 | 与 spec/公开契约不一致；目标场景失败；未经 ADR 改架构决策 |
  | `archive` | 归档前 | 只判上轮 BLOCKER 闭合 + delta 与实现一致 |

  路径映射：`.rddf/config/arch-docs.json` 的 `arch_paths[]` ∪ **fallback 目录集**（`docs/adr|docs/architecture|docs/architecture/adr|docs/designs|docs/design` ∪ `scripts/arch-docs-init.sh` survey 口径的顶层 `adr/|rfc/|specs/` 等目录）→ `arch`；`openspec/changes/*/{proposal,design,tasks,specs}`、`.rddf/roadmap`、`.rddf/improvements` → `plan`；`src|include|tests|scripts|tools` → `build`。**本表是权威映射** —— build 按它显式给 `review_profile`，`prompts/critic.md` 的路径推断只在 build 未给时兜底。
- **`arch` 档的聚焦判据（v1.8 新增）**：BLOCKER 仍是上表四类；另设一组 **SHOULD_FIX** 判据专治「决策文档写成了设计规格 / 流程台账」——决策陈述被稀释（正文超长且决策+后果+备选不足一半）、过程日志混入（审稿轮次与 BLOCKER 清单、台账 Entry / KPI 计数、逐版修订史）、缺独立「后果 / 代价」章、Verification 只写实测日志而无前瞻判据、Status 单行承载整条版本史、一篇 ADR 承载多个独立决策点。**边界**：计数漂移 / 悬空引用 / 索引缺项属 L1 一致性脚本（`docs/review-automation-backlog.md` §1），不进 critic。完整判据见 `prompts/critic.md` 的「arch — SHOULD_FIX 的聚焦判据」。
- **结论判定（v1.5）**：有 BLOCKER → REJECT（`mergeable: no`）；只有 SHOULD_FIX → `APPROVE_WITH_CONDITIONS`；都没有 → `APPROVE`。**禁止用 NITS 凑 REJECT**
- **输出格式（强制）**：
  ```
  profile: <arch | plan | build | archive | mixed>
  # 审查结论：<REJECT | APPROVE_WITH_CONDITIONS | APPROVE>
  mergeable: <yes | no>
  scope_exceeded: <true | false>

  ## 1. 必须修复 (BLOCKERS)
  - <file:line 或 ADR 编号> <一句话描述> — 属于 BLOCKER 的哪一类

  ## 2. 应该修复 (SHOULD_FIX)
  - <file:line> <描述> — <为什么值得改，但不阻断>

  ## 3. 建议 (NITS)
  - <file:line> <小问题>

  ## 4. 验证建议
  - <具体命令或场景，交给 build/verifier 执行>
  ```
- **build agent 收到 critic 输出后的协议（v1.5）**：
  - 有 BLOCKERS → 修；**同一 change 最多 2 轮评审**，第 3 轮起需用户明确批准
  - 无 BLOCKERS + 有 SHOULD_FIX → 记录到 notes/backlog，放行
  - `scope_exceeded: true` 的条目 → 记 backlog，不返工
  - APPROVE → 进入下一步（commit / PR）
  - 复审只提交「上一轮 BLOCKER 闭合证据 + 本轮新增 diff」，禁止全量重审

#### `context-builder` —— critic prompt 组装器 ⭐v1.3 新增
- **核心 prompt**：`prompts/context-builder.md`（8825 字节，180 行）
- **职责**：把 build agent 给的原始材料（diff / intent / focus / 路径 / ADR）组装成 critic 能直接用的 **7 字段 prompt**
- **模型**：`opencode/deepseek-v4.1-flash-free`（纯机械组装，不需深度推理；免费档足够）
- **权限**：严格只读——`edit / webfetch / websearch / task / question` 全 deny；MCP 只读工具 allow、4 个写工具 deny；bash 只读子集；`.env` deny
- **关键约束**：
  - **不评审**——只组装，不给结论（评审是 critic 的活）
  - **不写代码、不联网、不委派**
  - 输出的 prompt 必须**字段齐全**：`intent` 与 `focus` 不允许含混
- **输出**：可直接喂给 critic 的 7 字段 prompt 文本（`changes_summary` / `intent` / `focus` / `review_profile` / `diff_or_paths` / `context` / `expected_format`）
- **调用方式**：`/critic-review` slash command（`commands/critic-review.md`）默认走它；脚本 `scripts/build_critic_prompt.sh` 只做骨架预填
- **`hidden: true`（v1.4）**：它只该被 build 用 `/critic-review` 或显式 `subagent` 调用，不该出现在用户手选的 agent 列表里混淆选择

#### `title` —— 会话标题/摘要生成 ⭐v1.4 新增
- **职责**：opencode 内部为会话生成标题/摘要，调用频率高、单次很短
- **模型**：`opencode/deepseek-v4.1-flash-free` —— 高频短任务，轻量档足够
- **配置**：`agent.title`（`mode: primary` + `hidden: true`，与 opencode 内建的 Title agent 同形）
- **为什么不设 `small_model`**：v2 已 deprecated；等价的原生写法是定义 `title` agent
- **思考变体的取舍**：`capabilities.reasoning.supported` 只影响 opencode 是否生成 reasoning 变体与是否展示思考内容（客户端降噪），**不是**省 token 的手段
### 2.4 critic 启动机制

critic **不会自动启动**——`subagent` 模式只在被 `subagent()` 显式调用时运行。3 条触发路径：

| 路径 | 触发机制 | 触发频率 |
|---|---|---|
| **A. build agent 主动调** | `prompts/build.md` §"何时调 critic" + §"评审预算与循环规则" | 公开 API / 跨模块契约 / ADR 冲突 / 用户明示 / 归档前（增量）；每 change ≤2 轮 |
| **B. 用户在 build 里说** | "过 critic" / "审一下" / "找问题" | 你说的时候 |
| **C. slash command** | `/critic-review`（`commands/critic-review.md`）| 你打 `/critic-review` 的时候 |

**不触发场景**（避免噪音）：单文件 typo、注释/import 调整、格式化、重命名局部变量、测试/脚本/文档计数类改动——这些走 verifier 或 CI 校验。

详细委派触发规则见 §3.2。

### 2.5 architect 产出形态契约（v1.8 新增）

架构文档范围（`arch_paths`）只管「写哪里」；产出形态契约管「写成什么形状」。完整定义在 `prompts/build.md` 的「architect 产出形态契约」，要点：

- **决策文档只回答三件事**：定什么、为什么这么定、代价是什么。
- **对齐已有样板**：向项目内形态达标的既有 ADR 收敛（如六段骨架 + 选项对比表 + checkbox 验证的 ADR），不凭空发明规范。
- **一文档一决策**：出现第二个独立决策点 → 拆篇，或降级为架构文档的「已知残留」条目。
- **正文三层分离**：正文 = 决策本身（目标 ≤ 250 行）；推导与证据（时序推导、trace、覆盖率、逐文件裁决表、可枚举改动清单）→ 移出正文到 design.md / tasks.md / 主题文档；过程日志（立项/归档/队列号/台账 Entry/KPI 计数、审稿轮次与 BLOCKER 清单、oracle 复核记录）→ 落治理台账或审稿报告，**不进决策文档**。
- **必备四要素**：元数据（Status / Date / Author / Parent / 关联 change）+ 选项对比表（≥ 3 行，每行含「结论 + 理由」）+ 独立「后果 / 代价」章 + Verification 章（**前瞻方法**，不是已跑完的实测日志）。
- **落点路由**：决策与取舍 → ADR；当前态快照与模块关系 → 架构主题文档；实现步骤与验收 → `openspec/changes/*/design.md`；可枚举改动 → `tasks.md`。
- **可写范围三态 + 治理面例外**（v2.0.1）：配置存在且路径实际存在 → `arch_paths`；配置缺失 / 为空 / 损坏 → fallback 目录集；都不存在 → 只讨论、不落文档。`/arch-docs-init` 是**可选工具**而非前置闸门 —— 旧规则要求「`arch_paths` 为空就先跑 init 再继续」，而脚本在无架构文档目录的项目里写出空 `arch_paths` 并 WARN、重跑不收敛 → architect 第一步即死循环。**治理面文件 `~/.config/opencode/**` 不受该范围管辖**：由 §2.7 治理面归属行直接授权给 `architect`，与项目级 `arch-docs.json` 无关。（v2.0.3：配置解析按数组边界识别，损坏 / 空 / 截断分别诊断；`--refresh` 会覆盖整个配置，手写条目须先用 `--dry-run` 比对。）
- **一次成稿流程 + 完成定义**（v2.1.0）：4 步（定位 / 成形 / 送审 / 收口），每步的判据在 `prompts/build.md` 内都有落点；送审步的豁免情形（主题文档同步 → 只 oracle；纯错字 → 不审）以 §2.7 审查配对 为准，收口步可跨角色完成。**「ADR 完成的标志」5 条**：四要素齐 / oracle+critic 双审（报过 BLOCKER 则须 1 次复审确认闭合）/ `Status` 转为已决 / 关联 change 已落库**或已登记为 `backlog: <improvement 名>`**（architect 不创建 openspec change，立项后回填；此时元数据的 **AC 映射允许暂缺**，以 `backlog: <improvement 名>` 占位）/ 审稿报告由 architect 誊写落 `.rddf/reviews/<adr>.md` 且被元数据引用。
- **arch 档审稿判据摘要内联**（v2.1.0）：BLOCKER 四类 + SHOULD_FIX 六类写进 `prompts/build.md` —— 调 critic 时据此**选 2–3 条最相关重点**填 `focus`（不罗列全量），oracle 不可用时据此逐条自检；**以 `prompts/critic.md` 为准**，摘要是随取随用的索引（夹具断言两处条目数一致，防漂移）。
- **无样板时的默认骨架**（v2.1.0）：元数据 → 背景与问题 → 决策 → 选项对比表 → 后果 / 代价 → Verification（可勾选验收判据）；**Verification 章节名统一**，元数据加 AC 映射（每条判据标注对应 change AC 编号）→ 已接入 §2.6 verifier 判据来源第 4 项。
- **不追溯存量**：约束只管本次新写/改写的文档；既有 ADR 越界 → 记 backlog 单独立项。

> 背景：近期多个项目的 ADR 出现形态漂移（决策陈述占比低至 22%、ADR 内混入过程日志与实测台账、缺独立后果章），而当时的约束只界定了「写哪里」，没有任何「写什么形状」的判据。详见 §2.3 的 `arch` 档聚焦判据与 CHANGELOG。

### 2.6 rdd-workflow 增强层（可选，v1.9 新增）

角色矩阵与 rdd-workflow **解耦**：角色矩阵是**自足内核**，rdd-workflow 是**可选增强层**。完整定义在 `prompts/build.md` 的「rdd-workflow 增强层」，要点：

- **角色矩阵自足**：四个角色的权限、产出契约、切换机制与 rdd-workflow 是否安装无关。没装 → 角色按内置流程完整工作；装了 → 额外可用对应 skill。**没装不是降级**。
- **skill 只在前置条件满足时被调用**：每个 rdd-* skill 的 frontmatter 自带 `Invoke when canonical preconditions hold`；不满足就不调，走内置流程。不得为走流程而伪造前置条件。
- **agent 不代替 workflow 推进阶段**：调用 skill 时遵守其 handoff 契约（不手写 handoff 文件、不跳阶段、不改 skill 的状态文件）。
- **懒探测**：仅在准备调用某个 rdd-* skill 时跑 `~/.config/opencode/scripts/rdd-skills.sh`（`--json` 输出 `installed` / `available[]` / `sources[]` / `rddf_cli`）。探测顺序对齐 rdd-workflow 的 `resolve_rdd_skill_dir`（项目 `.opencode/skills/` → 全局 `~/.agents/skills/` → `$RDD_WORKFLOW_SRC`）。**脚本只是预筛**——它的 skill 名单是上游镜像，实际可加载性以 `skill` 工具为准。
- **pause / commit 契约**：`rdd-builder` 的 P0 / P2.5 是 HARD pause（agent 不替用户拍板）；P2 的 COMMIT GATE 与全局「不主动 commit，等用户确认」冲突时**全局规则优先**；`rdd-quick` 只在 builder P0 已 dispatch 后调用，agent 不自行判定进入。
- **权限不收窄**：增强层启用**不改变**角色列表的权限边界；冲突只在**工件层**解决——见下条。
- **工件归属规则**：同一工件在同一路径上只允许一个写入者。skill 在本路径上 → 由 skill 写；skill 是下游阶段 → agent 写它的**输入工件**而非产物（planner 写 `.rddf/improvements/<name>.md`，由 `rdd-builder` P0 生成 `proposal.md`）；skill 不可用/不在路径上 → 走内置流程并注明「本路径未启用 `<skill>`」。

角色 ↔ 可选增强映射（前置条件为 skill frontmatter 原文）：

| 角色 | 可选增强 |
|---|---|
| `architect` | `rdd-arch` |
| `planner` | `rdd-planner`、`add-improve`、`rdd-workflow-brainstorm` |
| `builder` | `rdd-builder`、`execute`、`rdd-quick`、`rdd-workflow-writing-plans`、`openspec-gate`、`deps` |
| `verifier` | `rdd-verifier`、`contract-check` |
| `general` | `guide` |

> 该增强层**不**做阶段自动跟随：workflow 阶段由 handoff 链推进，agent 角色由用户口令切换，两者是正交的两套状态（详见 CHANGELOG 的调研结论）。

### 2.7 审查配对（v2.0 新增）

每个角色有**固定的审查者**。这是角色矩阵的**内核**（不依赖 rdd-workflow 是否安装）——审查者是只读 subagent，或角色本身（verifier）。完整定义在 `prompts/build.md` 的「审查配对」。

| 产出角色 | 审查者 | 审什么 | 触发条件 | 预算 |
|---|---|---|---|---|
| `architect` | **oracle** → **critic** | oracle：目标场景**会怎么坏**（失败模式 / 边界 / 被否掉的替代方案是否真的更差）；critic：**与既有 ADR / 契约是否冲突**（`arch` 档） | 新建 ADR 或反转既有决策 → 双审（oracle 先行）；只同步主题文档 → 只 oracle；**ADR** 纯错字 → 不审（`prompts/**` 的错字走治理面行，那行不豁免） | 每 ADR：oracle 1 + critic 1 |
| `planner` | **metis** | 隐藏意图 / 需求歧义 / AI slop 风险 / 缺失的验收标准 / 边界情况 | 新建或**重写 ≥ 1/3** 的 improvement / proposal；纯状态推进 → 不审 | 该 improvement **总计** 1 轮（设计前 gap 分析不另计） |
| `builder` | **verifier**（角色内建，非 subagent） | AC 逐条满足（要工具证据）/ 边界与错误路径 / 资源释放 / **遗留清扫** | **每个 change 完成时必审**，不可跳过；`rdd-quick` 不产生 openspec change（无空集豁免）→ 每个 quick 任务完成时审 | 3 轮（对齐 `RDDF_VERIFIER_MAX_LOOPS`），超限 → halted |
| `builder`（架构面） | **critic** | 见 §2.4 的 5 个触发条件 | 公开 API / 跨模块契约 / ADR 冲突 / 用户要求 / 合并前 | 每 change 2 轮 |
| `architect`（**治理面**） | **oracle** → **critic**（何时必审见下） | oracle：这条规则在哪些场景会让 agent 产生**错误行为**；critic：与既有不变式 / 角色权限 / 既有规则是否**自相矛盾** | 作用域见下；critic 必审判据 = 本 patch 是否**增删/修改了表格行、不变式条目、自查清单项、触发条件** | 一次改动（一个 patch series 内触及治理面文件的**集合**）：oracle 1 + critic 1；高影响 finding = BLOCKER → 允许 1 次复审 | 规则正文 + 降级自检清单 + 响应正文逐条处置 |

**治理面作用域**（按字面执行，必须带前缀 —— 裸 `docs/MULTI-AGENT-DESIGN.md` 在项目 cwd 里解析不到 → 永不触发）：

- **算**：`~/.config/opencode/prompts/**`、`~/.config/opencode/AGENTS.md`（注入所有 agent，影响力最大）、`~/.config/opencode/docs/{MULTI-AGENT-DESIGN,CHANGELOG}.md`、`~/.config/opencode/opencode.json(c)` 的 agent / permission / provider 段、`~/.config/opencode/commands/**`（slash command = agent 行为指令，与 prompt 同级）、`~/.config/opencode/scripts/**` 中**被治理面规则行为依赖**的脚本（如 `arch-docs-init.sh` —— 规则指示 agent 运行它、或规则语义依赖其输出 / 退出码；改其退出码 / 报错文案 / 落盘行为时）。
- **不算**：错字 / 链接 / 日期 / 表格对齐 / 纯格式；项目仓库里的 `openspec/**`、`.rddf/**`、`docs/adr/**`（后者属 ADR 行）；`scripts/**` 中不改变退出码 / 报错文案 / 落盘行为的改动，仅被历史记述性提及的脚本，以及未被规则行为依赖的脚本。

**治理面 verdict（oracle 无 pass/fail 信号 → 「调用过」≠「通过」）**：oracle 的「建议」段首行须给 `治理面判定: PASS | BLOCK | PASS-WITH-NOTES`；**每条 finding 必须逐条应答**（修掉写明改了什么 / 写明不修理由），不得只列不改；`BLOCK` 或存在未应答 finding → 不得声称完成。

**自指审查**：改 `prompts/oracle.md` / `prompts/critic.md` / §2.7 本身时，审查实例跑的是**旧版契约**，只能记为「自指审查，不构成独立证据」。

**builder 撞到治理面缺陷**：`~/.config/opencode/**` 不在 builder 产出归属内 → **不直接编辑**；产出 findings + `halted` 报告交用户切 `architect`（不静默越权、不静默忽略、不死等）。

**审查调用失败不重试**：一次失败即降级，不换模型重试（额度类失败是持续态）。

**降级自检清单**（oracle 不可用时逐条自问，结论写进响应正文，缺一条判未通过）：① 与 3 条不变式冲突？② 与角色权限边界矛盾？③ 引入第二套判定标准？④ 触发条件可点数判定？⑤ 有不可用降级路径且**有落盘载体**？⑥ 预算与既有上限冲突？

三条设计约束：

- **顺序不可颠倒**：`architect` 必须 oracle 先于 critic。oracle 找「会怎么坏」，critic 判「是否越界 / 冲突」；反过来会让 critic 在方案本身还站不住时先审一致性，白烧一轮预算。
- **预算按粒度分层，不是按 change 数量相乘**：ADR 级（architect）与 improvement 级（planner）的轮次发生在**文档**粒度，一个 ADR / 一条 improvement 常覆盖多个 change；只有 builder 的 critic 2 轮 + verifier 3 轮是逐 change 的。所以**单条 change 的审查上限 = critic 2 + verifier 3**。
- **审查者不可用必须降级，不得静默跳过**：subagent 可能因额度 / 网络 / 权限失败。此时执行该角色的内置自检清单，并在**当回合响应正文首行**注明 `⚠️ 未启用 <reviewer> 审查（原因）—— 已用内置自检清单代替`（`edit` 类改动没有「结论」文件）；**不得**把「不可用」当成「通过」。
  > 2026-11-04 实测：本机 subagent 因 Token Plan 用量上限全部调用失败。降级是常态需求。

**与 rdd-workflow 的关系**：`verifier` 是角色，`rdd-verifier` 是可选 skill —— 「builder 依赖 verifier 审查」在**没装 rdd-workflow 时也成立**（走「verifier 产出契约」的本地验收 1–5 步）；装了且前置满足时才走 `rdd-verifier` skill 的 AC 验证协议。同理 `metis` / `oracle` / `critic` 是 opencode subagent，与 rdd-workflow 无关。

---

### 2.8 角色切换与授权窗口（v2.2.2 新增）

**本节讲的是「角色轴」**——build agent **内部**的权限视角。三个轴互不相干，读文档时先分清：

| 轴 | 是什么 | 本文位置 |
|---|---|---|
| agent 轴 | 10 个独立 agent（build / plan / explore / librarian / oracle / metis / critic / context-builder / general / title） | §2.1–§2.3、§3 委派拓扑 |
| **角色轴（persona）** | build agent 内部的权限视角：`architect` / `planner` / `builder` / `verifier` / `no-role` / `general` | **本节** |
| tool 权限轴 | OpenCode 三层 permission（read / edit / bash / MCP…） | §4 权限模型 |

> **同名消歧**：`general` 在 agent 轴（§3 的独立 subagent，不可被任何 agent 调）与角色轴（§2.8.1 的 build 内部角色）**同名但不同物**；同理 `plan`（agent）与 `planner`（角色）不是一回事。

> 角色轴此前只存在于 `prompts/build.md`，本文档缺席 —— 本节补上**人类可读投影**。
> **完整规则以 `prompts/build.md` 为准**（执行权威）；本节与它冲突时以 build.md 为准。

#### 2.8.1 角色一览

| 角色 | 职责 | 固定审查者 | 调研类 subagent | 权限边界要点 |
|---|---|---|---|---|
| `architect` | 写 `arch_paths` 命中的架构文档（ADR / 主题文档）；产出形态契约见 §2.5；**编辑治理面文件 `~/.config/opencode/**`**（与项目级 `arch_paths` 无关）| `oracle` → `critic` | `explore` / `oracle` / `librarian` / `metis` | 不改 `src/**`、不创建 openspec change、不写 `.rddf/plans/**` |
| `planner` | 写 roadmap / improvement 草稿、起草 proposal；`metis` 做 gap 分析 | `metis` | `explore` / `librarian`（只读调研；架构取舍归 architect） | 不改 `src/**`、不写 `design.md` / `tasks.md` |
| `builder` | 全部实施（openspec change、代码、测试、commit） | `verifier`（角色内建）+ `critic`（仅架构面） | 全部 subagent | 单方面改**已签批 ADR 的决策内容**被禁（变更决策需切 `architect`） |
| `verifier` | 验收（只验不改）：判据逐条有工具证据、边界与遗留清扫 | —（自审） | `explore`（定位 AC 指向的实现 / 测试） | 不改实现、不重构、不做实施类 commit |
| `no-role` | 仅读 + 轻量讨论 + 询问用户角色 | — | `explore` / `librarian`（只读调研） | 一切 edit、改仓库状态的 shell、创建 openspec change、调写类 subagent 全禁 |
| `general` | 通用读写（不限角色） | — | 全部 | 无额外禁止 |

> 逐角色的「允许 / 禁止 / 开场报告模板」六列表在 `prompts/build.md` 的「角色列表」；本表只给读文档时的定位视角。

#### 2.8.2 状态文件

`<cwd>/.rddf/state/role.json`（schema `role-v2`，兼容 `role-v1`）：

| 字段 | 含义 |
|---|---|
| `current_role` | 当前角色（合法值见上表） |
| `updated_at` / `updated_by` | 更新时间 / 来源（`user` / `auto`） |
| `session_id` | 会话标识 |
| `auto_switch_window` | 授权窗口（见 2.8.4），无窗口时为 `null` |
| `history[]` | 切换历史（**上限 20 条**，超出丢最旧） |
| `sessions` | **role-v2**：`{ <session_id>: { current_role, auto_switch_window, auto_answer, updated_at } }` 分区，顶层 `current_role` 降级为展示镜像，不作权限判据 |

- **项目级优先**：`<cwd>/.rddf/state/role.json`；不存在时读全局 `~/.rddf/state/role.json`（**只作 fallback**）；两者都没有 → `general`。**双 session pair 已登记时**，按 canonical 仓库路径解析（`git rev-parse --git-common-dir` 归一）；单 session 场景维持 cwd 相对解析。
- **cwd 变更必须重解析**（进 worktree / `session_move` / 换仓 → 项目级文件可能不同，不得沿用上一轮缓存）。**双 session pair 已登记时**，worktree → canonical 归一，不重解析。
- **异常值处理**：`current_role` 不在合法集合内或 JSON 解析失败 → 按 `no-role` 处理并提示修复（**不静默降级为 `general`**，那会放大权限）。
- `role.json` 是**个人状态**，不应进版本库（本仓用 `.git/info/exclude` 排除）。

#### 2.8.3 切换策略（默认用户驱动）

- **触发口令**：「切换到 X」「进入 X 阶段」「以 X 角色工作」「set role to X」；合法值仅上表 6 个，其它值拒绝并列出合法值。
- **收到口令后**：校验合法性 → 更新项目级 `role.json`（`updated_by: "user"`，追加 `history`）→ **先输出新角色的开场报告**，再处理用户请求。
- **窗口内自动切换的回合**：开场报告标 `【角色: X | source: auto | window: <used>/<max_rounds>】`，让人一眼看出是窗口内自动切的。
- **默认不自动切换**：无窗口时**不得根据上下文推测切换**（即使上下文强烈暗示是 builder 阶段）；可以**提议**（"验收发现 3 项失败，需回 builder 修复，是否切换？"），但不能直接切。
- **切换不追溯**：已完成的动作不回滚；跨角色任务在响应里说明「接下来以 X 角色继续」。
- **退出**：「退出角色」「reset role」「no role」→ 切回 `no-role` 并清空 `auto_switch_window`。

#### 2.8.4 授权窗口（用户显式授权后才有的窗口内自治）

用户在切换口令里附带授权即可开启：

```
切换到 builder，允许在 builder ↔ verifier 之间自动切换，最多 3 轮
```

写入 `role.json` 的 `auto_switch_window`：

```json
{
  "roles": ["builder", "verifier"],
  "max_rounds": 3,
  "used": 0,
  "granted_by": "user",
  "granted_at": "<ISO 8601 UTC>"
}
```

**窗口内自动切换必须同时满足（权威源列 4 条，此处完整投影）**：① 目标角色在 `window.roles` 内（**窗口外一律停下问用户**）；② `window.used < window.max_rounds`；③ 有明确触发条件，不是「感觉该切了」；④ 每次自动切换写 `updated_by: "auto"`，`history` 追加 `{role, at, by: "auto", reason}`。

| 触发 | 条件 |
|---|---|
| `builder → verifier` | 改动完成且自查通过（满足「质量下限」的完成判据） |
| `builder → planner` | 实施中发现 `plan_drift`（需改 plan / AC / tasks）—— planner 须在窗口内 |
| `builder → architect` | 实施中发现 `design_drift`（需改已签批 ADR 的决策）—— architect 须在窗口内 |
| `verifier → builder` | 验收失败且分类为 `implementation_gap` |
| `verifier → planner` | 验收失败且分类为 `proposal_drift`（planner 须在窗口内） |
| 任意 → `no-role` | 任务结束，同时清空窗口（**不计入 `used`**） |

- **每一次窗口内的角色间自动切换都计入 `used += 1`** —— 否则窗口上限形同虚设。
- **窗口耗尽**（`used >= max_rounds`）→ 不再自动切回，输出 halted 报告（失败项 + 证据 + 已用轮次）交用户裁决。
- **关闭窗口**：「关闭窗口」「取消自动切换」→ `auto_switch_window: null`，回到**完全用户驱动**（不必等用完）。
- **要让 builder 实施中自动回环到 planner / architect，必须由用户把这两个角色写进 `roles`**（上面的示例只含 builder ↔ verifier）—— 窗口内自动切换**仅限** `plan_drift` / `design_drift` 两类触发，不得挪作其他理由。
- **双重保险**：窗口 `max_rounds`（治理面）与产品侧 loop guard（`max_revisions`，默认 3）任一先触发即**升级人工**。

#### 2.8.5 实施阶段的新发现与回环（v2.2.0 新增）

builder 实施中发现**计划层 / 决策层**问题时必须**停下并路由**（不得默默改计划，也不得按错计划继续实现）：

| 情形 | 停下义务 | 路由 | 落点（增强层） |
|---|---|---|---|
| 计划对、实现漏 | 不停，自己补 | 不切角色 | 不外传 |
| `plan_drift`（需改 plan / AC / tasks） | 停该 change 的**剩余 task** | planner | `rddf feedback add <proposal> --from rdd-builder --kind needs-revision` |
| `design_drift`（需改已签批 ADR 决策） | 停**整个** change | architect | `… --kind ac-fail --ref-change <change>`（落 improvement 文件 `## Feedback` 段） |
| `blocked`（缺输入 / 凭据 / 用户决策） | 停 | 交用户（不切角色） | `… --kind blocked` |
| `noted`（观察项） | 不停 | 不切角色 | `… --kind noted` |

**先落记录 → 再切角色 / 交用户**（切换会丢原上下文，而 feedback 通道正是上游的读入口）。分类**复用 rdd-workflow 既有 kind**，不新造；细则与判据见 `prompts/build.md` 的「实施阶段的新发现」。


#### 2.8.6 front 与工程 session 的 pair 登记（2026-11-06 新增）

`delegate` 插件在**建立工程 session 后、prompt 之前**写两份文件（single writer = 插件，目录锁保护）：

| 文件 | 位置 | 内容 |
|---|---|---|
| `pair.json`（pair-v2）| `<stateRoot>/.rddf/state/pair.json` | `pairs: { <engineering_session_id>: { front_session_id, canonical_root, work_root, state, goal_key, kind, agent, registered_at, last_used_at, suspended_at_message_id?, steer_residue? } }`（`work_root`/`state`/`goal_key` 为 2026-11-09 增补，见 `ADR-front-multi-backend` D2.3/D6/D3）|
| `role.json` | `<工程根>/.rddf/state/role.json` | `sessions: { <engineering_session_id>: { current_role, auto_switch_window: null, auto_answer: null, updated_at } }` |

为什么**必须在 prompt 之前写**：工程 session 开局就要读自己的 `role.json` 分区；若登记晚于 prompt，
它会去找全局 fallback，而全局 fallback 属于 `external_directory`（工程 session 默认 deny）→ 角色退化为 `general`。

`resume_session` 的访问控制 = **pair 登记表 + `canonical_root` 一致**。不硬校验 `front_session_id`
（每次新对话都是新 front session，硬校验会让"隔天回来继续"失效），改为返回软信号 `resumed_by_other_front`。

### 2.9 subagent 输入契约（v2.3.0 新增）

**要解决的问题**：`subagent` 工具的 `prompt` 声明为 `string` —— 无 schema、无模板、无校验。
父模型写什么，子 agent 就收到什么。「7 字段上下文契约」原本只写在 `prompts/build.md` 的散文里，
对模型只是建议；缺字段时 critic 自己的规范是「只看显式契约冲突，不评估设计取舍」⇒ **评审质量静默下降**。

实测（`scripts/audit-subagent-prompts.ts` 扫真实库 330 次 critic 调用）：同一个 critic 子会话的输入
出现三种形态（编号版 `## 1. changes_summary` / 加粗版 `**changes_summary**` / 复审版只有闭合证据），
合规率约 71%。

#### 三个执行点（宿主契约决定分层）

| 级 | 钩子 | 时点 | 能否失败 | 作用 |
|---|---|---|---|---|
| **L3** | `session.hook("context")` | 请求前 | ❌ | 把契约注入 `subagent` 工具描述（父模型采样前可见；与 opencode 注入 `Available subagents:` 同一手法，幂等） |
| **L1** | `tool.hook("execute.before")` | 执行前 | ✅ | **唯一的硬门**：不合规 ⇒ 抛错 ⇒ 宿主包成受控 `Tool.Error` ⇒ 父模型看到缺失项与修正指引，同回合重发 |
| **L2** | `session.hook("prompt")` | 落库前 | ❌ | 兜底**检测**（覆盖 `command(subagent:true)` 等不经 tool 的路径）；session 域钩子不可失败 ⇒ 只能检出、不能拦 |

> **分层依据**：宿主 `packages/core/src/plugin/hooks.ts` 的 `Failures` 类型把 session / aisdk / permission / shell 域标为 `NoFailures`，只有 `tool` 域是 `ToolFailures`。这是本设计的承重墙，已登记为上游锚点 **A13 / A13b**（`scripts/check-upstream-anchors.sh`）。

#### 豁免语义（五重收窄）

```
① 关键词命中     复审 / 第 N 轮 / 闭合证据 / closure
② 结构前置       仅当缺失小节 ≥ ceil(必需/2)（critic = 4/7）才可能豁免
③ 任务陈述区     关键词只认 prompt 开头 400 字符（输出模板/约束里的"复审"不算）
④ 状态继承       继承"上一轮被判为复审轮"这个模式（不是"上一轮合规"）
⑤ 继承需自证     本轮 prompt 自己也要引用上一轮（同一父会话审不同对象时不许继承）
⑥ 续接轮不清零   isResume 既不是新评审，也不该重置复审模式
```

②③ 的来源：初版"关键词命中即豁免"会把真实 diff 里偶现的「第 2 轮」当成复审，一次误豁免 + 状态继承
会让整个父会话后续 30 分钟都进复审模式（critic 第 1 轮 SHOULD_FIX）。

③⑤ 的来源：**豁免误命中抽样**（真实库 90 条豁免全量复核，误命中 12 条 = 13.3% > 10% 阈值）。
误命中两类：关键词落在后半段输出模板（"不需要复审代码" / "会被 critic 复审时升级为 BLOCKER"，
位置 1194–5377）；以及**跨对象继承**（同一父会话连着审 ADR-090/091/092、连着审"治理面 MD §2.8 批"与
"kimi-code 批"，上一轮的复审模式把新评审一并放行，9 条）。
收紧后：真豁免的命中位置全部落在 **47–231** 字符，误命中全部落在 **1194–5377**，中间是空档。
逐条证据见 `.rddf/reviews/subagent-contract-exemption-sampling.md`。

#### 灰度与观测

- 默认 **warn**：只记录 + 审计，不拦任何调用。配置 `subagent-contract.json`：
  `{ "mode": "warn|enforce|off", "agents": { "critic": { "mode": "enforce" } } }`（**每次调用重读** ⇒ 即时生效）。
- 观测：`~/.local/share/opencode/subagent-contract.log`（JSON 行，`gate`/`mode`/`violations`/`exempted`）。
- 审计：`bun scripts/audit-subagent-prompts.ts [--agent critic] [--strict] [--json]` —— 与运行时同一份规则逻辑，
  `--strict` 有违规 exit 1（可作 CI 断言）。

#### 文件与测试索引

| 文件 | 作用 |
|---|---|
| `lib/subagent-contract-core.ts` | 规则真源（`CONTRACTS`）+ 小节识别（5 种写法）+ 豁免（关键词窗口 / 结构前置 / 继承自证）+ 三钩子处理函数（零宿主依赖） |
| `plugins/subagent-contract.ts` | 宿主接线壳（只注册钩子） |
| `scripts/audit-subagent-prompts.ts` | 审计 CLI |
| `tests/subagent-contract-core.test.ts` | 规则引擎 40 例 |
| `tests/subagent-contract-audit.test.ts` | 审计器 + CLI 退出码 8 例 |
| `tests/config-guards.test.ts`（L4 段） | 规则真源 ↔ `prompts/critic.md` ↔ `prompts/build.md` 防漂移 |

#### 已知边界（不掩盖）

1. **语义不可判定** —— 只判结构；"intent 写得对不对"没有自动手段。
2. **L2 不可拦** —— `command(subagent:true)` 的输入只能被检出与审计。
3. **关键词是启发式** —— ② 的阈值把误命中限制在"缺 ≥4 个字段且命中关键词"的窄交集。
4. **任务陈述区窗口是启发式** —— 真复审轮若把"上一轮"写在开头 400 字符之后，会被误判为新评审（代价：多报一次违规 + 模型重发；反向误放行代价更大）。
5. **继承无对象级校验** —— 只要求"引用上一轮"，不校验"上一轮的对象 = 本轮的对象"；连续审两个对象且第二个明写"上一轮"仍会被继承放行（当前语料 0 例）。
6. **状态是进程内的** —— 服务重启后复审链继承失效（退回关键词豁免）。
7. **只约束 critic** —— 其余 agent 没有 7 字段契约，收益形态不同，暂不设契约。

## 3. 委派拓扑

```
                              build (primary)
                             /  |   |   |   \   \
                            ↓   ↓   ↓   ↓    ↓   ↓
                      explore librarian oracle metis critic
                        ↑        ↑                    (自己写 <project>/.plans/*.md)
                        |        |
                        |        └─ librarian 可调 explore（本地代码搜索）
                        |
                      general (subagent, 独立分支，不能被任何 agent 调，也不能调别人)

                    context-builder (subagent，只被 build 调；不委派任何人)
                            ↑
                            └── 只在 build 需要组装 critic 7 字段上下文时调用
```

> **v1.2 变更**：critic 是 build 的直接下游，与 explore/librarian/oracle/metis 平级；不接 plan（plan agent 不需要审稿——它本来就在规划阶段）；不接 librarian/oracle/metis（这些是"先于 build 调"的 agent，自身不应被 critic 审）。

### 3.1 委派矩阵

| 调用方 ↓ \ 被调方 → | front | build | plan | explore | librarian | oracle | metis | general | critic | context-builder |
|---|---|---|---|---|---|---|---|---|---|---|
| **build** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅（条件）| ✅ |
| **plan** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅✅（优先）| ❌ | ❌ | ❌ |
| **explore** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **librarian** | ❌ | ❌ | ❌ | ✅✅（本地搜索）| ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **oracle** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **metis** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **general** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **critic** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **context-builder** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **front** | ❌ | ❌（经 `delegate` 插件工具，非 agent 委派） | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |

> build → critic 是"条件 ✅"：仅在 §3.2 "何时调 critic" 5 个条件命中时调用；其它情况不调。critic 自己不调任何 agent（task deny）。
> **context-builder** 只能被 build 调，且不委派任何 agent——它只做上下文组装。
> **front 的 "→ build" 不是 agent 委派**：front 不调 subagent 工具，而是调 `delegate` 插件工具，由插件在进程内建立并驱动一个 agent=build 的工程 session（跨目录）。详见 `docs/dual-session-delegation.md`。
> **front → 五个只读 agent（v2.5）**：front 可直接调用 `explore` / `librarian` / `oracle` / `metis` / `critic`，产物仅"回答"，不产生文件变更；发现需要变更必须改判实施性走 `delegate`。依据：`docs/adr/ADR-front-knowledge-capability.md`（前置条件是这五个 agent 的 shell 已按三段式加固）。
> **本矩阵只回答「允许调谁」；「哪个角色产出必须过谁」见 §2.7 审查配对**（architect → oracle + critic / planner → metis / builder → verifier）。允许 ≠ 必须：矩阵是权限上限，配对是流程下限。 `prompts/build.md` 的**角色列表表**同理只列**自由裁量**可用的工具，**固定审查者是流程义务、不受该列限制**（`no-role` 除外）—— 角色表与配对表是流程下限的两个刻度，不是互相限制的两道闸。（此处指角色列表表；**本节 agent 矩阵的 ❌ 不在豁免范围**。）

### 3.2 委派触发规则

| 场景 | build 委派给 | rationale |
|---|---|---|
| "在项目里找 X" | `explore` | 纯本地搜索 |
| "查 React 19 API" | `librarian` | 外部文档 |
| "这个架构选型对吗" | `oracle` | 架构咨询 |
| "在动手前我有什么遗漏" | `metis` | 计划前 gap |
| "这个项目怎么 build 起来" | `general` | 跨领域多步 |
| 改动 ≥3 文件 / 跨 API / 跨模块 / 开 PR 前 | `critic` | 对抗式审稿（4 段式） |
| 用户说"过 critic"/"审一下"/"找问题" | `critic` | 显式触发 |
| 复杂改动的 critic 上下文（7 字段）| `context-builder`（优先，改动 ≥3 文件 / 跨 ≥2 模块时必用）| 手填容易漏 intent/focus |

| 场景 | plan 委派给 | rationale |
|---|---|---|
| 设计前差距分析 | `metis`（**优先**）| 质量门 |
| 查代码现状 | `explore` | 本地搜索 |
| 查 API 文档 | `librarian` | 外部文档 |
| 评估架构方案 | `oracle` | 架构咨询 |

| 场景 | librarian 委派给 | rationale |
|---|---|---|
| "找项目里用了 X API 的地方" | `explore` | 本地代码搜索 |

| 场景 | build 委派给 | rationale |
|---|---|---|
| 复杂改动要过 critic，但上下文不好手填 | `context-builder` | 组装 7 字段 critic prompt |

> **调研型（`explore` / `librarian`）的委派前判断要素**（何时必须委托 / 何时不必委托 / 一次一问 + 给清范围与期望输出 / 权限不扩权 / 材料不触发审查）见 `prompts/build.md` 的「调研委派协议」—— 上表是**场景对照**（人类可读），执行口径以 build.md 为准。

#### 3.2.0 角色固定审查配对（v2.0，与场景无关）

上表是**场景驱动**（用户问什么就派谁）；本节是**角色驱动**——产出物属于哪个角色，就必须过哪个审查者，不管用户有没有开口。完整规则见 §2.7。

> **实施阶段的新发现**（v2.2.0）：builder 实施中发现计划层 / 决策层问题时**停下并路由** —— `plan_drift`（需改 plan / AC / tasks）→ `rddf feedback add --kind needs-revision` → planner；`design_drift`（需改已签批 ADR 的决策）→ `rddf feedback add <proposal> --from rdd-builder --kind ac-fail --ref-change <change> --body "..."` → architect（经 `rddf feedback list <proposal>` 读 improvement 文件的 `## Feedback` 段；`.planner-feedback.json` 提升链**未接线**，勿依赖）；`blocked`（缺输入）→ 交用户。**先落记录再切角色**；仅这两类可在用户授权的窗口内自动切换（须把 `planner` / `architect` 写进窗口 `roles`）。完整规则见 `prompts/build.md` 的「实施阶段的新发现」。

| 产出角色 | 必须过 | 何时触发 | 预算 |
|---|---|---|---|
| `architect`（新 ADR / 反转决策）| `oracle` → `critic` | 每次新建 ADR 或反转既有决策 | 各 1 轮 |
| `architect`（只同步主题文档）| `oracle` | 每次 | 1 轮 |
| `planner`（新建 / 重写 ≥1/3）| `metis` | 每次 | 1 轮 |
| `builder`（每个 change 完成）| `verifier`（角色内建）| **必审，不可跳过** | 3 轮 |
| `builder`（架构面改动）| `critic` | §3.2.1 的 5 个条件 | 2 轮 |

> **不可用降级**：审查者调用失败（额度 / 网络 / 权限）时，执行该角色的内置自检清单，并在结论首行注明 `⚠️ 未启用 <reviewer> 审查（原因）`。**不得**把「不可用」当成「通过」。

#### 3.2.1 build 调 critic 的 5 个条件

`prompts/build.md` "何时调 critic" 段落的对应规则：

| # | 条件 | 举例 | 不调的反例 |
|---|---|---|---|
| 1 | 改动 **≥3 个文件** | 改 `foo.cpp` + `foo.h` + `foo_test.cpp` | 单文件 typo / 改一行 |
| 2 | 改动触及**公开 API / 函数签名 / 序列化格式 / 持久化 schema** | 加 `virtual` 方法、改 protobuf | 改 private 实现细节 |
| 3 | **跨模块**改动（2+ 目录 / 2+ 子系统）| 改 `core/` + `app/` | 单目录内改 |
| 4 | 用户明确说"审一下"/"过 review"/"找问题"/"过 critic" | 用户说 "过 critic" | — |
| 5 | 准备**开 PR / 合并 / 归档**之前 | "提 PR" / "merge" | 中间态 |

**不调 critic 的 5 类场景**（避免噪音）：

- 单文件 typo
- 注释 / import 调整
- 格式化
- 重命名局部变量
- 1-2 文件的局部改动

**协议**：

1. build agent 调 `subagent(agent="critic", prompt=<diff + 预期行为 + 已知风险>)`
2. critic 读 git diff + 文件，**独立判断**（不确认 build agent 预期——预期本身就是错的也说）
3. 返回 4 段式
4. build agent 按 §2.3 critic 输出格式协议处理（BLOCKERS → 必修 / SHOULD_FIX → 建议 / APPROVE → 继续）

### 3.3 被权限拒绝后的纪律

权限模型（§4）只在**被请求的那一刻**生效。如果 agent 被拒绝后换一种写法再来一次，边界等于不存在——典型绕法：

| 想做的事 | 会被拒的写法 | agent 可能改用的绕法 |
|---|---|---|
| 读密钥 | `cat .env`（deny）| `awk '{print}' .env`、`env`、`printenv`、`jq -r .KEY file.env` |
| 枚举并执行 | `find . -exec grep -r key {} \;`（deny）| 换成 `xargs` / 管道组合 |
| 联网 | `webfetch`（只读 agent deny）| `curl` / `wget` / `git clone` |

因此 6 个只读 subagent + plan 的 prompt 统一加入（`prompts/*.md` 的「工具使用纪律」段）：

> **被权限拒绝时**：如实报告「权限拒绝 + 你想做什么」，不要重试、不要换写法绕过、不要改用别的工具达成同一目的。一次拒绝就是最终答案，写进输出里。

配合两类配置收敛（§4.4.3 / §4.4.4）：

- `awk` / `env` / `printenv` / `jq` 从只读白名单**移除** → 落到 catch-all `ask`（需要人放行）；
- `find * -exec *` / `find * -delete *` 显式 `deny`。

**build agent 的对应义务**：subagent 报告「被权限拒绝」时，**不要用同一请求重复委派**——先读它的说明，要么自己（有权限）去做，要么向用户申请放宽。

---

## 4. 权限模型

### 4.1 权限体系（v2 真实语义）

```
┌────────────────────────────────────────────┐
│  Layer 1: OpenCode 内置默认                │  (read/grep/glob/list = allow; *.env = ask)
│  Layer 2: 全局 config.permission           │  (本文件的 "permission" 块)
│  Layer 3: agent.<id>.permission            │  (每个 agent 自己的块)
└────────────────────────────────────────────┘
        ↓ 三层合并成一条 ruleset，按顺序 last-match-wins
```

**顺序即策略**：Layer 3 在后 → **agent 规则覆盖全局规则**，全局规则覆盖内置默认。

**两个必须记住的坑**：

1. agent 里的 `"read": "allow"` 会**覆盖**内置的 `*.env → ask`（它在链子更后面）。要保 `.env` 保护，必须写成对象形式并把 `.env` 规则放在 `*` 之后（§4.4.3）。
2. v2 的 MCP 权限只认扁平 `<server>_<tool>` 键；嵌套对象**不报错、不生效**，只是永远匹配不上（§4.4.5）。

### 4.2 permission schema 字段（v2）

OpenCode v2 的 `permission` 可以是单个 action，也可以是「工具 → action」的对象；对象形式下再按**输入参数**（路径 / 命令串 / 正则 / URL）细分。

| 字段 | 控制的工具 | shorthand | object 模式 |
|---|---|---|---|
| `read` | read | `allow/ask/deny` | 文件路径 → action |
| `edit` | write/edit/patch | `allow/ask/deny` | 文件路径 → action |
| `glob` | glob | `allow/ask/deny` | glob → action |
| `grep` | grep | `allow/ask/deny` | 正则 → action |
| `list` | list | `allow/ask/deny` | - |
| `bash`（v2 内部叫 `shell`）| shell 命令 | `allow/ask/deny` | **命令串 → action** |
| `task`（v2 内部叫 `subagent`）| subagent 委派 | `allow/ask/deny` | subagent 名 → action |
| `external_directory` | 项目外目录访问 | `allow/ask/deny` | 路径 → action |
| `webfetch` | webfetch | `allow/ask/deny` | URL → action |
| `websearch` | websearch | `allow/ask/deny` | - |
| `lsp` | LSP 调用 | `allow/ask/deny` | - |
| `skill` | skill 加载 | `allow/ask/deny` | skill 名 → action |
| `question` | question 工具 | `allow/ask/deny` | - |
| `todowrite` | todowrite | `allow/ask/deny` | - |
| `doom_loop` | 循环卡死恢复 | `allow/ask/deny` | - |
| `<server>_<tool>` | 任意 MCP 工具 | `allow/ask/deny` | - |

**匹配规则（v2）**：

- **last-match-wins**：规则按"内置默认 → 全局 config → agent 专属"合并成一条链，**最后命中的规则生效**。所以 catch-all `"*"` 必须放最前，具体规则放后面。
- 通配：`*` 匹配任意长度、`?` 匹配单字符，其余按字面量。
- shell 匹配的是**整条命令串**：`cd /tmp && ls` 不匹配 `ls *` → 落回 catch-all。所以 prompt 里要求用 `workdir` 参数切目录，不要写 `cd X && ...`（§2.3 各 prompt 的"工具使用纪律"段）。
- MCP 工具的 action 名 = `<server>_<tool>`（`.` 与非法字符替换为 `_`），如 `codebase-memory-mcp_search_graph`。

### 4.3 各 agent 权限对比

下表是 **v2 运行时实测值**（`opencode debug agents` + 按 last-match-wins 复算），不是配置字面值。

| 工具 | front | build | plan | explore | librarian | oracle | metis | general | critic | context-builder |
|---|---|---|---|---|---|---|---|---|---|---|
| read | allow | allow | allow | allow | allow | allow | allow | allow | allow | allow |
| edit | deny | allow | ask（限 `.plans/` 等） | deny | deny | deny | deny | deny | deny | deny |
| grep/glob/list | allow | allow | allow | allow | allow | allow | allow | allow | allow | allow |
| bash | 只读白名单‡ | allow\* | 只读子集\*\* | 三段式‡‡ | 三段式+网络‡‡ | 三段式‡‡ | 三段式‡‡ | 只读子集\*\* | 三段式‡‡ | 只读子集\*\* |
| task（subagent 委派） | 仅五个只读 agent† | allow | allow | deny | allow | deny | deny | deny | deny | deny |
| webfetch | allow | allow | allow | allow | allow | allow | allow | allow | deny | deny |
| websearch | allow | allow | allow | deny | allow | allow | allow | allow | deny | deny |
| question | allow | allow | allow | deny | deny | deny | deny | deny | deny | deny |
| external_directory | 按路径 allow§ | ask | ask | (默认 ask) | (默认 ask) | ask | ask | ask | (默认 ask) | (默认 ask) |
| MCP 写工具（4 个） | ask | ask | ask | deny | deny | deny | deny | deny | deny | deny |
| MCP 读工具（10 个） | allow | allow | allow | allow | allow | allow | allow | allow | allow | allow |
| `.env` 读取（read） | ask | ask | ask | ask | ask | ask | ask | ask | ask | ask |
| `.env` 读取（shell） | deny | ask | deny | deny | deny | deny | deny | deny | deny | deny |
| doom_loop | (默认) | (默认) | (默认) | deny | deny | (默认) | (默认) | (默认) | (默认) | (默认) |

‡ front 的 shell 是**只读白名单**：`*: deny` 打头 + 47 条只读 allow + 尾部守卫 deny（重定向 / `--output` / `-fprint` / `sort -o` / `.env` 族 + **首参形态** `curl -o*` / `sort -o*` / `git --output*` 等，ADR D3.1 通则）；另加 `"* /*": deny` 禁止绝对路径（`external_directory` 不约束 shell，见 ADR D4.1）。规则真源与漂移闸门：`scripts/agent-guard-rules.ts` + `tests/config-guards.test.ts`
† front 的 `subagent` 仅 allow `explore` / `librarian` / `oracle` / `metis` / `critic`，且 `"*": deny` **排在第一条**（顺序是硬约束，见 `ADR-front-knowledge-capability` D2.1；顺序错 → 工具被整体隐藏）；这五个 agent 的 shell 已按三段式加固，产物为"回答"、不产生文件变更。依据 `docs/adr/ADR-front-knowledge-capability.md`
‡‡ 三段式 shell：`*: deny` 打头 + 只读白名单 + 尾部守卫 deny（v2.5 加固，见 ADR-front-knowledge-capability D3）；`librarian` 额外保留 `curl`/`wget`/`git clone`/`git ls-remote`，clone 仅 `/tmp/opencode/*`，且不套 `* /*` 绝对路径守卫
§ front 的 `external_directory` 按路径 allow：`/workspace/**` 与 `/home/ubuntu/.config/opencode/**`；其余路径 deny（不写 `"*": allow`）
\* build 唯一可改代码的 agent；bash 默认 allow，但 19 条危险命令 ask（git push/reset --hard/clean/checkout --/restore/branch -D/stash drop/stash clear/rm -rf|fr|r|f/sudo）

\*\* bash 只读子集：`rg / grep / find / ls / cat / head / tail` + `git log / show / diff / status / blame / ls-files / rev-parse / ls-tree / cat-file / show-ref / config --get / remote -v / stash list / worktree list / shortlog / count-objects / verify-commit` + 文本工具 `wc / sort / uniq / diff / file / stat / du / df / which / tree / basename / dirname / readlink / realpath / tr / cut / printf / date / test / expr / seq / nl / column`。plan 额外 `mkdir`；librarian 额外 `curl / wget / git clone`。**不含** `awk / env / printenv / jq`（§4.4.4）。

\*\*\* critic 的白名单与其它只读 agent 同级，额外 deny `webfetch / websearch / task / question`（§4.4.2）

MCP 写工具：`codebase-memory-mcp_index_repository` / `_ingest_traces` / `_manage_adr` / `_delete_project`

MCP 读工具：`codebase-memory-mcp_search_graph` / `_get_code_snippet` / `_trace_path` / `_get_architecture` / `_get_graph_schema` / `_query_graph` / `_search_code` / `_detect_changes` / `_list_projects` / `_index_status`

### 4.4 当前权限加固要点

本节只陈述**当前生效**的加固项。每一项的发现过程、修复理由与修复轮次见 [`CHANGELOG.md`](CHANGELOG.md) 的「权限加固记录」。

#### 4.4.1 build 的 shell 边界

bash 采 `* + 危险命令 ask` 模式（catch-all 在前、具体规则在后，last-match-wins），拦截 19 条不可逆模式：

| 类别 | 拦截模式 |
|---|---|
| git 推送 | `git push` / `git push *` |
| git 丢工作区 | `git reset --hard` / `git clean -fd*` / `git clean -fdx*` / `git checkout --` / `git checkout .` / `git restore *` |
| git 丢分支/栈 | `git branch -D *` / `git stash drop *` / `git stash clear *` |
| 删文件 | `rm -rf *` / `rm -fr *` / `rm -r *` / `rm -f *` |
| 提权 | `sudo *` |

#### 4.4.2 MCP 工具权限

- **写工具**（`index_repository` / `ingest_traces` / `manage_adr` / `delete_project` / `query_graph`）：build = `ask`，只读 agent = `deny`。`query_graph` 依 2026-10-21 的用户决定保持**全局 allow**（该 server 的 `query_graph` 实际只用于读查询；残余风险由 §8.2「服务端 Cypher 写检查」兜底）。
- **只读图谱工具**（10 个）：全部 agent `allow`——**含 critic**（`prompts/critic.md` 要求它先调 `list_projects`，与权限必须自洽）。
- critic 额外 deny `webfetch / websearch / task / question`（唯一四项全 deny 的 subagent，见 §4.3）。

#### 4.4.3 `.env` 保护

agent 级 `read` **必须**写成对象形式并把 `.env` 规则放在 `*` 之后，否则会覆盖 opencode 内置的 `*.env → ask` 保护：

```jsonc
"read": { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" }
```

shell 层另加 `cat/head/tail *.env` 拦截（只读 agent `deny`，build `ask`）。**已知残留**：shell 是整串前缀匹配，`git show HEAD:.env > /tmp/x` 这类重定向仍会绕过——权限模型的固有限制，不是配置问题。

#### 4.4.4 只读白名单的排除项

只读 agent 的 bash 白名单**不含** `awk`（可 `system()` 任意命令 / 写文件）、`env` / `printenv`（把密钥打进 transcript → 第三方模型）、`jq`（配合重定向写文件）；并 deny `find * -exec *` / `find * -execdir *` / `find * -delete`。这些命令落回 catch-all `"*": "ask"`，人工放行。

#### 4.4.5 v2 schema 的两条硬约束

1. MCP 权限只认扁平 `<server>_<tool>` 键；嵌套对象**不报错、不生效**（永远匹配不上，落回默认 ask）。
2. 字段改名：`provider` → `providers`、`npm` → `package`、`options` → `settings`、顶层 `subagent_depth` → `experimental.subagent_depth`（顶层写法在 v2 下被**静默丢弃**、只留一条 WARN，限深形同失效）。
---

## 5. Provider 路由

### 5.1 可用 provider 池

| Provider | Models 数 | 当前 agent 用途 |
|---|---|---|
| `commandcode`（models.dev 内建）| — | metis / general（`deepseek/deepseek-v4.1-flash`）|
| `minimax-cn`（厂商直连）| 2 | build / plan / front（`MiniMax-M3.1-Flash`）；`MiniMax-M3` 在池内但无 agent 使用 |
| `opencode-go` | 1 | 无 agent 声明；`deepseek-v4.1-flash` 是降级链候选（§5.4）|
| `opencode`（内建免费）| — | explore / librarian / context-builder / title（`deepseek-v4.1-flash-free`）|
| `kimi-code`（厂商直连）| 2 | oracle / critic（`kimi-for-coding`）；`k3-256k` 在池内但无 agent 使用 |
| `openstarry`（中转网关）| 7 | 无 agent 声明；`deepseek-v4.1-flash` 是降级链候选（§5.4）。池内另有 `glm-5.3-flash` / `deepseek-v4.1-flash-1017` / `kimi-k2.7-code` / `kimi-k2.6` / `qwen3.7-plus` / `MiniMax-M2.7-highspeed` |

> **v1.3 变更**：provider 段迁到 v2 的 `providers` 形态（`package` / `settings` / `models[].limit`）；模型 id 已用 `opencode models` 与上游核对一致。
>
> **v1.4 变更**：每个模型补 `capabilities`（`tools` / `temperature` / `reasoning`）；`limit.context` 按证据强度分级修正（见下表）；`mimo-v2.5-pro` 无 agent 使用已从池中移除。
>
> **v2.2.3 变更**：`kimi-code` provider 的 `package` 从 V1 老名 `@ai-sdk/openai-compatible` 迁到 **V2 官方名 `@opencode/ai/providers/openai-compatible`**；`models.kimi-for-coding` 补 **`variants`**（`none/low/high/max`，`none` → `reasoning_effort: "off"`）、`models.k3-256k` 补 `low/high/max`（无 `none`），修复「agent 声明 `variant: high` 但模型 variant 集为空 → `Variant unavailable`」。实测：推理 / 4 个档位 / 工具调用均通过（见 §7.1）。
>
> **v1.8 订正**：本表与 §2.1 / §5.2 已按当前 `opencode.jsonc.openstarry` 重算——`opencode-go` provider 与 `deepseek-v4.1-flash` 的 agent 归属、`openstarry/deepseek-v4.1-flash` 的 context（262,144 → 524,288）此前与配置不符。
>
> | 模型 | 原 `context` | 现 `context` | 依据 |
> |---|---|---|---|
> | `minimax-cn/MiniMax-M3.1-Flash` | 524,288 | **1,000,000** | 厂商直连 + models.dev 权威（build 主模型，收益最大）|
> | `openstarry/deepseek-v4.1-flash` | 131,072 | **524,288** | 上游众数 524,288；实测 210,074 token 输入被接受 |
| `opencode-go/deepseek-v4.1-flash` | — | **524,288** | 与 `openstarry` 同型号同上限；当时 librarian / context-builder / title 使用（v2.4 起改为 `opencode/deepseek-v4.1-flash-free`）|
> | `openstarry/qwen3.7-plus` | 262,144 | **1,000,000** | 上游 1M（models.dev 各 provider 一致）|
> | `openstarry/glm-5.3-flash` | 524,288 | 524,288 | 上游众数 1M，但有 provider 报 327,680；中转未验证 → 保留现值 |
> | `minimax-cn/MiniMax-M3` | 524,288 | 524,288 | 无 agent 使用，且 models.dev 各 provider 差异极大（262k~1M）→ 不动 |
> | `openstarry/kimi-k2.6` 等 | 262,144 | 不变 | 已与上游一致 |
> | `kimi-code/*` | 1,048,576 / 262,144 | 不变 | 已与上游一致 |
>
> **为什么不把 openstarry 的全都填上游值**：openstarry 是**中转网关**，`/v1/models` 不返回 limit 元数据，1.5M token 的探测请求被网关路由层直接拒（不是上下文错误）。虚报过大的后果是超长会话直接 400（会话崩），虚报过小的后果只是提前压缩 —— 风险不对称，所以只按实测证据升。
>
> **不填 `limit.output` 的理由**：`limit.output` 未声明时 opencode 用 `OUTPUT_TOKEN_FALLBACK = 32,000` 作为 `max_tokens` 上限（`session/model-request.ts:92`），既安全又够用；声明错误的上限反而会制造 400。

### 5.2 模型选择策略

| Agent | 选用 model | rationale |
|---|---|---|
| build | `minimax-cn/MiniMax-M3.1-Flash` | 主对话模型；1M 上下文吃得下长会话；也是降级链的链头（§5.4）|
| plan | `minimax-cn/MiniMax-M3.1-Flash` | 与 build 同款：规划要读大量代码与文档，1M 上下文优先于成本 |
| explore | `opencode/deepseek-v4.1-flash-free` | 速度优先、本地搜索 token 少；免费档 + `variant: low` |
| librarian | `opencode/deepseek-v4.1-flash-free` | 纯外部检索，免费档够用；`variant: low` |
| oracle | `kimi-code/kimi-for-coding` | 架构分析要吃下大量文件，1M 上下文；`variant: max` |
| metis | `commandcode/deepseek/deepseek-v4.1-flash` | 创造性发散任务，温度 0.3 配合 |
| general | `commandcode/deepseek/deepseek-v4.1-flash` | 多面手 fallback |
| critic | `kimi-code/kimi-for-coding` | 长 PR diff + 文件全扫；1M 上下文吃得下全仓扫描 |
| context-builder | `opencode/deepseek-v4.1-flash-free` | 纯机械的 prompt 组装，成本优先 |
| title | `opencode/deepseek-v4.1-flash-free` | 高频短任务，轻量档足够 |

> **v1.8 订正**：上表曾与配置不符（8/10 个 agent 的 model 记错），当时按 `opencode.jsonc.openstarry` 重写；rationale 反映的是**当时**选型理由，历史选型理由见 CHANGELOG。
>
> **v2.4 订正**：配置切到 `opencode.jsonc.opencode-go` 后，build / explore / oracle / metis / general / critic / librarian / context-builder / title 的 model 再次漂移，已按当前配置逐行重算（同 §2.1）。

### 5.3 关键决策

- **不引入 Anthropic / OpenAI provider**——本地网络限制 + 成本考虑
- **主对话链路（build / plan / front）用 `minimax-cn/MiniMax-M3.1-Flash`**——1M 上下文；这些 agent 的共同特征是「要读很多」，上下文比单价更决定可用性
- **重活链路（oracle / critic）用 `kimi-code/kimi-for-coding`**——架构分析 / 全仓扫描要吃下大量文件，1M 上下文
- **杂活链路（metis / general）用 `commandcode/deepseek/deepseek-v4.1-flash`**——发散与杂活，1M 上下文
- **轻量链路（explore / librarian / context-builder / title）用 `opencode/deepseek-v4.1-flash-free`**——检索与机械组装不需要长上下文，用免费档
- **套餐可用性先于型号新旧（v1.4 实测教训）**——`deepseek-v4-flash` 与 `glm-5.1` 虽在 models.dev 存在，但**不在本套餐**（`model_price_error`）。选型前必须先打 `/v1/models` + 实测一次调用
- **模型上下文 limit 写在配置里**（`providers.<id>.models.<model>.limit.context`），需与上游实际值核对（§8.2）

### 5.4 模型降级链（`model-fallback` 插件）

OpenCode v2.2.5 **没有**原生的模型链配置：`agent.model` 是单值，schema 无 `fallback` 字段。降级由本地插件实现：

| 项 | 内容 |
|---|---|
| 入口 | `plugins/model-fallback.ts`（接线）+ `lib/model-fallback-core.ts`（纯逻辑）+ `tests/model-fallback-core.test.ts` |
| 接线点 | `ctx.session.hook("retry", …)`：拿到 `{ agent, model, error, attempt, decision }`，必要时 `ctx.session.switchModel(...)` 后置 `decision = { retry: true }` |
| 内置默认链 | `commandcode/deepseek/deepseek-v4.1-flash` → `minimax-cn/MiniMax-M3.1-Flash` → `openstarry/deepseek-v4.1-flash` → `opencode-go/deepseek-v4.1-flash`（**仅在没有配置文件时生效**；内置默认只覆盖 build 一个 agent）|
| 当前生效链 | **链头 = agent 自己的默认模型**，其后接 `model-fallback.json` 的候选（去重）。当前 build 的链是 `minimax-cn/MiniMax-M3.1-Flash`（链头）→ `commandcode/deepseek/deepseek-v4.1-flash` → `opencode-go/deepseek-v4.1-flash`；explore / librarian / oracle / metis / critic 各 3 候选。**`openstarry` 被有意剔除** —— 实测该 provider 返回 403「订阅额度不足」，放进链里只是白等一次降级 |
| 链推进 | 链尾失败且链首已恢复（冷却到期）时可**绕回链首**；换链预算 `chain.length * 2`，超限即放弃 |
| 降级条件 | 401/403/404（模型级）立刻换；订阅额度不足（硬失败）立刻换；5xx / 网络类先原地退避 2 次再换；429 优先按 `retryAfterMs` 原地等待；**内容策略 / 上下文超限（`context length` / `token limit`）/ 400 / 413 / 422 一律不降级**（应走 compaction 或直接报错）——判定顺序上「内容策略 / 上下文超限」**先于**状态码短路，避免 400 + `forbidden` 被误判成模型不可用而拿弱模型去重试被拒的内容 |
| 冷却 | 失败模型进入冷却（默认 5 分钟），链推进时跳过。**进程级**：provider 挂了就是挂了，冷却表跨 session 共享（内核保持纯函数，冷却条目由 plan 带出、宿主落盘） |
| 可见性 | 切换会触发 `session.model.selected`，TUI 模型指示器立即变化；同时写 `~/.local/share/opencode/model-fallback.log`。默认**不**发 synthetic 消息（实测会被当作新输入，额外触发一轮模型调用并重置降级状态）；需要会话内通知时把配置文件里的 `notify` 设为 `"synthetic"` |
| 链耗尽 | `decision = { retry: false }`，原始错误交回用户；不循环重试 |
| 配置链 | 独立配置文件 `~/.config/opencode/model-fallback.json`（`chains` / `policy` / `notify`）；环境变量 `MODEL_FALLBACK_CONFIG` 可指向别的文件；都没有则用内置默认链 |
| 链头 | **不单独配**：失败时正在用的那个模型就是链首（即 agent 的默认模型，或用户临时 `/model` 切过去的模型）；文件里的 `chains` 是它后面的后备候选 |
| 生效时机 | 插件在 **server 启动时**加载。改配置或插件代码后需 `opencode service restart` 才生效（常驻 server 不会热加载插件） |
| 生命周期 | 插件按 location 重复 setup，故会话状态、链、冷却表都放**模块级**共享，并对同一 retry 事件做**事件级去重**（避免多份 hook 各切一次模型）；session 状态 30 分钟不活跃即淘汰，避免长驻 server 下 Map 单调增长 |

> **为什么配置走独立文件而不是 `opencode.jsonc`**：实测本地插件**拿不到**配置里的 options —— `plugins: [["model-fallback", {...}]]`、`plugins: [{"package": ..., "options": {...}}]`、以及已废弃的 `plugin: [[name, {...}]]` 三种写法下 `ctx.options` 恒为 `{}`。因此改用插件自己读的 JSON 文件。
>
> **中途换模型会重新构链**：用户在会话中 `/model` 切到链外模型后再次失败，会以新模型为链首重新组链（旧的推进下标一并重置，冷却表保留），而不是按旧链继续往后跳。
>
> **端到端记录的时间口径**：`minimax-cn 401 → openstarry 403 → opencode-go` 跑在**配置文件覆盖之前**（用的内置默认链）；当前生效链不含 openstarry，失败路径是 `openstarry（起点）403 → commandcode`。
>
> **面向使用者的操作与排障**见 [model-fallback-usage.md](./model-fallback-usage.md)（默认模型 / 后备链分别改哪、什么错误会换模型、日志怎么读、怎么停用降级）。本节是设计口径，用手册是操作口径。

---

## 6. 文件结构

```
~/.config/opencode/
├── opencode.jsonc -> opencode.jsonc.opencode-go  # 符号链接：指向当前生效配置
├── opencode.jsonc.opencode-go   # 配置真源（agent/provider/mcp/permission）
├── opencode.jsonc.minimax      # 另一份 provider 变体（注意与真源漂移）
├── docs/
│   ├── MULTI-AGENT-DESIGN.md   # 本文件（当前态）
│   ├── CHANGELOG.md            # 历史增量（权限加固史 / 各版本验证记录 / 已完成台账 / 演进日志）
│   ├── review-automation-backlog.md  # 评审自动化迁移清单（L0/L1/L2/L3 分层）
│   └── rdd-workflow-product-issues.md  # 待提交上游 rdd-workflow 的产品缺陷清单（4 条）
├── prompts/                     # agent prompt 文件（9 个）
│   ├── build.md                 # 委派规则 + subagent 返回结构表 + critic SOP（7 字段 + 评审预算）+ 角色矩阵 + rdd-workflow 增强层
│   ├── plan.md                  # 106 行
│   ├── explore.md               # 54 行（Markdown 四节输出）
│   ├── librarian.md             # 95 行（Markdown 五节输出）
│   ├── oracle.md                # 59 行（Markdown 四节输出）
│   ├── metis.md                 # 70 行（Markdown 六节输出）
│   ├── general.md               # 84 行（Markdown 四节输出）
│   ├── critic.md                # 154 行（4 段式审稿输出）
│   └── context-builder.md       # 180 行（critic prompt 组装器）
├── commands/                    # opencode 自定义 slash command
│   ├── plans-init.md            # /plans-init [path]：初始化项目 .gitignore
│   ├── role-init.md             # /role-init：写 .rddf/state/role.json
│   ├── role-show.md             # /role-show：查看当前角色
│   ├── arch-docs-init.md        # /arch-docs-init：梳理架构文档结构 → .rddf/config/arch-docs.json
│   └── critic-review.md         # /critic-review：7 字段上下文契约调 critic
├── plugins/                     # 本地 opencode 插件（server 启动时加载；改代码需 restart）
│   ├── delegate.ts              # front → 工程 session 的委托工具（五个：delegate/dispatch/sessions/suspend/cancel）
│   └── model-fallback.ts        # 模型降级链接线（retry 钩子 + switchModel）
├── lib/                         # 插件的纯逻辑内核（无宿主依赖，可单测）
│   ├── delegate-core.ts          # 同步委托 18 步 + 槽位原语（两派发面共用）
│   ├── delegate-async.ts        # 异步派发面：dispatch/sessions/suspend/cancel + 槽位生命周期 + 消费确认
│   └── model-fallback-core.ts   # 错误分类 / 链推进 / 冷却 / 组链
├── model-fallback.json          # 降级链配置（chains / policy / notify）；环境变量 MODEL_FALLBACK_CONFIG 可改路径
├── scripts/                     # opencode 命令调用的 shell 脚本
│   ├── plans-init.sh            # 幂等 .gitignore 配置（首次/重复均安全）
│   ├── role-init.sh
│   ├── role-show.sh
│   ├── arch-docs-init.sh        # 架构文档结构梳理（读写项目配置）
│   ├── build_critic_prompt.sh   # 生成 critic prompt 骨架（自动填 3/7 字段，读 arch-docs.json）
│   └── rdd-skills.sh            # rdd-workflow 增强层探测（installed / available[] / sources[] / rddf_cli）
├── tests/                       # 本地验证夹具（不参与发布）
│   └── verify_arch_docs_scope.sh  # 判定三态 + arch-docs 语义验证夹具（项目形状取自 rdd-workflow-e2e 真实 fixture）
├── skills/                      # 启用的 skills
│   └── cpp-pro/
├── skills.disable/              # 禁用的 skills（superpowers）
├── superpowers/                 # 完整目录（保留但未启用）
├── cli.json                     # CLI 行为（diffs wrap, session, theme）
├── tui.json                     # TUI 插件（空 plugin 数组）
├── lsp.json                     # LSP（仅 clangd）
├── lsp-install-decisions.json   # LSP 安装决策
├── service.json                 # 服务密码
├── package.json                 # 仅声明 @opencode-ai/plugin 依赖
├── AGENTS.md                    # 全局 AGENTS 规则（叠加到所有 agent；**不含角色矩阵**，v1.4 移入 build.md）
├── .gitignore                   # 忽略 .plans/node_modules/package.*/.env/*.bak*/backup*/
├── .env                         # KIMI/OPENSTARRY/MINIMAX_API_KEY（已被 .gitignore 保护）
├── node_modules/
└── .git/                        # git 仓库（尚无 commit）
```

> **备份文件策略**：`*.backup-*` / `*.bak` / `*.bak-*` / `backup*/` 全部进 `.gitignore`——历史备份里出现过**明文 API key**（`backup_v1/opencode.jsonc`），这类文件永远不进仓库。密钥轮换见 §8.1 P0。

### 6.1 plan agent 产物路径

| 旧（v1.0） | 新（v1.1） |
|---|---|
| `<project>/.opencode/plan/*.md` | `<project>/.plans/*.md` |

**命名空间动机**：opencode 引擎自身用 `.opencode/` 存会话/快照，plan agent 的草稿与引擎内部状态**不应共用命名空间**，否则后续 opencode 升级易冲突。

**首次使用流程**：
1. 在项目根跑 `scripts/plans-init.sh <project-root>`（或 `~/.config/opencode/scripts/plans-init.sh <project-root>`）
2. 幂等：`.plans/` 条目已存在则跳过
3. 之后 plan agent 产出的设计草稿会写到 `<project>/.plans/<slug>.md`，不入库

**自动入口**：在 opencode TUI 中输入 `/plans-init` 或 `/plans-init /path/to/project`，触发 `commands/plans-init.md` 调 shell 脚本。

### 6.2 配置顶层结构（v2 schema）

真源是 `opencode.jsonc.opencode-go`；`opencode.jsonc` 是指向它的符号链接（git 以 mode 120000 记录）。`opencode.jsonc.minimax` 是另一份变体。

```jsonc
{
  "$schema": "https://opencode.ai/config.json",   // 强制 schema
  "snapshot": false,                              // 关闭文件系统快照
  "model": "minimax-cn/MiniMax-M3.1-Flash",       // 全局默认 model
  "default_agent": "build",                       // 默认主 agent
  "experimental": {                                // v2：实验特性统一入口
    "subagent_depth": 2                           // 允许 subagent 嵌套 2 层（默认 1）
  },
  "mcp": {                                        // MCP servers
    "codebase-memory-mcp": {
      "type": "local",
      "command": ["/home/ubuntu/.local/bin/codebase-memory-mcp"],
      "timeout": 30000
    }
  },
  "permission": {                                 // 全局权限（v2 扁平键）
    "codebase-memory-mcp_*": "deny",              // MCP 工具默认全禁
    "codebase-memory-mcp_search_graph": "allow", // 逐个放行只读图谱工具
    "codebase-memory-mcp_get_code_snippet": "allow",
    "codebase-memory-mcp_trace_path": "allow",
    "codebase-memory-mcp_get_architecture": "allow",
    "codebase-memory-mcp_get_graph_schema": "allow",
    "codebase-memory-mcp_query_graph": "allow",
    "codebase-memory-mcp_search_code": "allow",
    "codebase-memory-mcp_detect_changes": "allow",
    "codebase-memory-mcp_list_projects": "allow",
    "codebase-memory-mcp_index_status": "allow"
  },
  "agent": {                                      // 10 个 agent 定义（含 title）
    "build": { "permission": { "bash": { "*": "allow", "git push *": "ask", ... } } },
    "plan": { ... },
    "explore": { ... },
    "librarian": { ... },
    "oracle": { ... },
    "metis": { ... },
    "general": { ... },
    "critic": { ... },
    "context-builder": { ... }
  },
  "providers": {                                  // v2：provider 段（package/settings/models）
    "openstarry": {
      "package": "@ai-sdk/openai-compatible",
      "settings": { "baseURL": "https://api.openstarry.com/v1", "apiKey": "{env:OPENSTARRY_API_KEY}" },
      "models": { "kimi-k2.6": { "name": "Kimi-K2.6", "limit": { "context": 262144 } } }
    },
    "minimax-cn": { ... },
    "kimi-code": { ... }
  }
}
```

**v1 → v2 字段对照**：

| v1 写法 | v2 写法 |
|---|---|
| `provider.<id>` | `providers.<id>` |
| `provider.<id>.npm` | `providers.<id>.package` |
| `provider.<id>.options` | `providers.<id>.settings` |
| `permission: { "codebase-memory-mcp": { "search_graph": "allow" } }` | `permission: { "codebase-memory-mcp_search_graph": "allow" }` |
| 顶层 `subagent_depth` | `experimental.subagent_depth` |
| `agent.<id>.permission`（对象） | 仍可用；v2 原生字段名是 `permissions`（规则数组）|
| `agent.<id>.prompt` | `agent.<id>.system`（`prompt` 走 v1 迁移）|

---

## 7. 验证状态

### 7.1 已完成验证（当前态汇总）

下表只保留**当前配置仍然成立**的验证结论；按版本切分的完整验证记录见 [`CHANGELOG.md`](CHANGELOG.md) 的「各版本验证记录」。

| 测试 | 状态 |
|---|---|
| JSON / JSONC 合法性 + `opencode debug config` 归一化诊断 | ✅ 0 错误 0 警告 |
| front shell 白名单：`*: deny` 打头 + 47 allow + 尾部守卫 deny；实测 `bash -c` / `python3 -c` / `curl` 被**权限层**拒绝（`permission.rejected`）| ✅ |
| front 守卫用例：重定向 / `--output` / `--format` / `-fprint` / 裸重定向 | ✅ 拦截率 100%（v2.2.5 实测），无副作用文件产生 |
| front shell 禁绝对路径（`* /*` deny）；`grep` 读 `/etc` 被 `external_directory` 拒、读 `/workspace/**` 放行 | ✅ |
| `delegate` 门控：仅 front 可见（front `[{*,deny},{*,allow}]`，其余 agent 仅 `[{*,deny}]`）| ✅ `opencode debug agents` 实测 |
| `delegate` 端到端：建工程 session → 真实写入文件 → `outcome=succeeded` + 越界检测 | ✅ 实跑（`/tmp/opencode/engproj` 写出 `answer2.txt`=42 / `answer3.txt`=43 / `answer4.txt`=44）|
| `delegate` 续接：复用同一 session（session 数不增）+ 非法 grant 被拒 | ✅ 实跑 |
| `delegate` 单元测试：`bun test tests/delegate-core.test.ts tests/delegate-tool.test.ts`（brief 契约 / grants 白名单 / scope→edit 规则 / 规则顺序即策略 / 阻断提取 / 越界判定 / pair+role 登记 / 目录锁并发 / 假 ctx 端到端 / 交付面证据与 `unverified`）| ✅ 全绿 |
| **四工具门控**：`delegate_dispatch`/`delegate_sessions`/`delegate_suspend`/`delegate_cancel` 各自独立 action ⇒ 全局 deny + 仅 front allow，其余 agent 全 deny | ✅ `opencode debug agents` 实测（2026-11-09）|
| **单槽与切换**：同一 `workRoot` 第二个活跃后端被拒（错误含占槽 id）；两 linked worktree 各派一个**都成功**；`suspend` 释放槽位后可派发；既有 `delegate` 与新工具**共用同一张槽位表** | ✅ `bun test tests/delegate-async.test.ts`（56 项，含 D12 矩阵 10 条 + AC57 往返 2 条）|
| **消费确认**：「简报已被消费」= 其 `message.id` 出现在 `session.context()` 的消息 id 集合里；pending 的简报**不在** context；`interrupt({resume:false})` **不删** pending 行 ⇒ 幽灵注入真实存在 | ✅ Phase 0 探针 16/16（`.rddf/reviews/front-multi-backend-consume-probe.md`）|
| `stateRoot`/`workRoot` 归一：linked worktree 下 pair 落主仓、变更检测在 worktree；submodule 归 superproject | ✅ `bun test tests/canonical-root.test.ts`（15 项）+ 验收报告 PASS 18/18 |
| 全量单测 | ✅ `bun test tests/` **228 pass / 0 fail**（2026-11-09）|
| **已删后端的处置矩阵·派发面**（ADR D12 ②③）：`dispatch(resume=已删)` ⇒ 旧条目墓碑 + 落 `outcome:"vanished"` + 同 goal_key 新建 ⇒ **同工作树可再派发**；`suspend`/`cancel` 对已删后端按矩阵**关键格**返回**明确结果**（**不抛「无法定位」**）。⚠️ 仅**派发面**有单测覆盖；**观测面**（`sessions` 不列已删）属能力边界，见 ADR D12 | ✅ `bun test tests/delegate-async.test.ts`（56 项，含矩阵 10 条 + AC57 往返 2 条）|
| `model-fallback` 单元测试：`bun test tests/model-fallback-core.test.ts`（33 项：错误分类含内容策略/上下文超限短路与裸 403 仍降级 / 链推进 / 冷却跳过 / 429 退避 / 不降级场景 / 链耗尽 / 绕回链首 / 冷却表跨 session 共享 / 状态不可变）| ✅ 全绿（全量 `bun test tests/` 157 pass）|
| `model-fallback` 端到端（当前生效链）：`opencode run --standalone --agent build -m openstarry/deepseek-v4.1-flash`，openstarry 403「订阅额度不足」→ **一次**切到 `commandcode` → 成功作答；日志每次失败只落一行切换记录（无重复撞墙）| ✅ 实跑（2026-11-08）|
| `model-fallback` 端到端（内置默认链，配置文件覆盖前）：坏 `MINIMAX_API_KEY` 驱动 `opencode run --agent build`，实测 `minimax-cn` 401 → `openstarry` 403 → `opencode-go` 成功作答| ✅ 实跑（2026-11-06）|
| 11 个 agent 全部注册 + 全部 `{file:...}` 引用解析 | ✅ |
| permission schema 字段合法；v2 扁平键生效 | ✅ 10 只读 allow、4 写 deny |
| `experimental.subagent_depth: 2` 生效；顶层 `subagent_depth` 已移除 | ✅ |
| `.env`：read → ask（全部 agent）；shell `cat/head/tail` → deny（只读）/ ask（build） | ✅ |
| `awk` / `env` / `printenv` / `jq` → ask（只读 agent）；`find * -exec *` → deny | ✅ |
| critic `list_projects` 不再被 deny；critic 额外 4 项全 deny | ✅ |
| `capabilities` 字段被接受；`title` / `context-builder.hidden` 生效 | ✅ 0 错误 0 警告 |
| `plan` / `oracle` 不含 `temperature`（模型不支持该参数） | ✅ |
| 角色矩阵移出 `AGENTS.md` 后 build prompt 仍完整 | ✅ |
| 角色切换 / 授权窗口机制（§2.8）| ⚠️ 规则已实现（prompt 级，权威在 `prompts/build.md`），**未在真实 session 做运行时验证** |
| `kimi-code` provider 用 V2 包名 `@opencode/ai/providers/openai-compatible` | ✅ 实跑通过：`kimi-for-coding` 四个档位（none/low/high/max）、`k3-256k#high` 均返回正常；工具调用（read）正常 |
| 模型 `variants[].body` 真的合并进请求体 | ✅ 负向探针：临时声明 `reasoning_effort: 123`（类型非法）→ Kimi 回 400 `invalid_request_error`；合法档位 200 —— 证明 body 到达 API 而非被忽略 |
| provider 模型 id 与上游一致（`opencode models` 核对） | ✅ `mimo-v2.5-pro` / `deepseek-v4.1-flash` / `kimi-k2.6` 均存在 |
| 备份文件全部进 `.gitignore`，明文 API key 已隔离出索引 | ✅（key 本身仍需轮换） |
| `deepseek-v4.1-flash` 工具调用 + 210,074 token 输入 | ✅ 接受 → 声明的 262,144 有实测支撑 |
| `glm-5.3-flash` 不思考 | ✅ 成为 `title` / `context-builder` 选型依据 |
| `deepseek-v4.1-flash` 关思考 | ❌ 三种参数全被网关忽略，思考关不掉 |
| openstarry `/v1/models` 返回 limit 元数据 | ❌ 不返回（只有 id + supported_endpoint_types） |
| `deepseek-v4-flash` / `glm-5.1` 可用性 | ❌ 不在套餐（`model_price_error`） |
### 7.2 未做真实运行时验证

- ❌ 未在真实运行的 OpenCode session 中实测委派（各 subagent 是否真按 Markdown 小节输出）
- ❌ 未实测 LLM 是否真的按 prompt 行为（如 librarian 是否真的会先调 explore）
- ❌ v1.1 的 19 条 build ask 规则未在真实场景中触发观察（需真实任务驱动）
- ❌ v1.1 的 MCP `query_graph: ask/deny` 未在真实场景验证（Cypher 写操作是否真被服务端阻断需实跑确认）
- ❌ **v1.2 新增**：critic 是否真的按 4 段式输出（BLOCKERS / SHOULD_FIX / NITS / 验证建议）
- ❌ **v1.2 新增**：build agent 看到 ≥3 文件改动是否真的主动调 critic
- ❌ **v1.3 新增**：`experimental.subagent_depth` 是否真的限制嵌套委派深度
- ❌ **v1.3 新增**：critic 恢复只读图谱工具后是否仍保持 REJECT 立场
- ❌ **v1.3 新增**：shell 层 `.env` deny 是否会被 `git show * > f` 这类重定向绕过（**已知会绕**——shell 是整串前缀匹配，权限模型固有限制）

### 7.3 实测建议

下次启动 OpenCode session 时：
1. 在 build agent 中输入：`@librarian 查一下 React 19 useEffect 清理函数新行为` —— 观察 librarian 是否先 task 调 explore 看本地代码
2. 在 build agent 中输入：`@explore 找 opencode.jsonc 中所有包含 librarian 的行` —— 验证 explore 返回 Markdown 四节（匹配文件 / 直接答案 / 下一步）
3. 切到 plan agent：输入设计任务，验证 plan 是否优先委派 metis
4. **v1.1 验证**：在 build agent 中输入 `git status`，确认 allow；输入 `git push`，确认弹 ask 对话框
5. **v1.1 验证**：在 build agent 中委派 explore，观察 explore 是否会尝试 `websearch`——按当前配置应被 deny
6. **v1.2 验证（critic）**：在 build agent 中做一个故意带 bug 的小重构，事后说"过 critic"——验证 critic 是否输出 4 段式 + 找到 bug
7. **v1.2 验证（自动触发）**：在 build agent 中做一个 ≥3 文件改动，验证 build agent 是否**主动**调 critic（不需用户说"过 critic"）
8. **v1.2 验证（权限）**：在 build agent 中委派 critic，让 critic 尝试 `webfetch`——按当前配置应被 deny
9. **v1.3 验证（.env）**：让任一只读 subagent 尝试 `cat ~/.config/opencode/.env`——应被 deny；让 build 试同一命令——应弹 ask
10. **v1.3 验证（图谱工具）**：委派 critic，让它调 `list_projects`——应成功（v1.3 修复项）
---

## 8. 改进 TODO

按优先级排序（**P0 紧急 → P3 长期**）。

### 8.1 P0: 必做

1. **`codebase-memory-mcp_query_graph` 权限归属 —— 已决定保持 `allow`**（v1.4，2026-10-21，用户拍板）
   - CHANGELOG「v1.1 权限加固 §4.4.2」判定 `query_graph` 是**写工具**（Cypher 支持 `CREATE/SET/DELETE`），对只读 agent 一律 deny
   - v1.3 迁移后它进了**全局** allow → 8 个只读 agent 都能调
   - **结论**：保持 allow。逐个 agent 加 deny 会让每次图谱查询都弹 ask，破坏只读 agent 的可用性；且该 server 的 `query_graph` 实际用于读查询。残余风险由 §8.2「服务端 Cypher 写检查」兜底

2. **实测 critic 恢复只读图谱工具后的行为**
   - critic 现在能查 `search_graph` / `get_code_snippet` / `trace_path` / `list_projects` 等 10 个只读工具（§4.4.2）
   - 需实测是否仍保持 REJECT 立场、是否被图谱信息带偏

3. **build agent 的 `.env` 读取策略确认**
   - 当前 build 的 `cat/head/tail *.env` 是 `ask`（人工放行），其余只读 agent 是 `deny`
   - 需确认 build 是否应该完全 deny（避免密钥进入 transcript → 第三方模型）

**已实施但需运行时验证**：

- ❌ critic 是否真的按 4 段式输出（build agent 委派后实测）
- ❌ build agent 看到 ≥3 文件改动是否主动调 critic（自驱触发）

### 8.2 P1: 短期（1-2 周）

1. **真实运行时验证**
   - 启动 session 实测 **10 个 agent**（v1.4 含 title + context-builder）
   - 观察 LLM 实际行为是否符合 prompt 预期（尤其 XML→Markdown 后各 subagent 的输出结构是否稳定）
   - 必要时微调 prompt 措辞
   - **v1.1 专项**：实测 build 的 19 条 ask 规则是否真的在目标命令上触发
   - **v1.2 专项**：实测 critic 4 段式输出（§7.3 实测建议）
   - **v1.3 专项**：实测 `experimental.subagent_depth: 2` 是否真的限制嵌套委派深度

2. **librarian `subagent` 权限验证**
   - 当前 `librarian.permission.subagent = "allow"`
   - 需实测 librarian 真的会调 `agent: "explore"`
   - 必要时考虑改回 `"ask"`（方案 A）作为兜底

3. **codebase-memory-mcp 服务端 Cypher 写检查**
   - v1.3 全局放行了 `codebase-memory-mcp_query_graph`（见 §8.1 P0-2）
   - 实测确认服务端是否强制只读 Cypher（`CREATE` / `SET` / `DELETE` 应被拒）
   - 若服务端未强制，需在 MCP server 端补强（不在本仓库范围内）

4. **critic 实际行为调优**
   - 跑过 3-5 个真实 PR 后，统计 critic 是否漏掉明显 bug
   - 如漏掉，§3.2.1 5 条件可能过严（建一个简单 diff 就不调）；如噪音过多，条件收窄
   - 可能需要给 critic 加 few-shot 示例（放 `prompts/critic-examples.md`，prompt 引用）
### 8.3 P2: 中期（1-2 月）

1. **添加 `category` 系统**
   - 上游 omo 的 `quick` / `deep` / `visual-engineering` / `unspecified-high` 等 category
   - 允许 build agent 在 task 委派时不指定 agent，只指定 category

2. **添加更多 slash command**
   - v1.1 已加 `/plans-init`
   - 候选：
     - `/review` 一键调 critic 审当前 git diff（v1.2 已在 §2.4 列出但未实现）
     - `/plan` 切到 plan agent
     - `/commit` 提交 workflow（先过 critic）

3. **添加 `references`（命名引用）**
   - 集中管理外部文档源（React 官方、TypeScript handbook 等）
   - librarian 可直接引用

4. **plan agent 输出格式增强**
   - 当前用 markdown 模板，可考虑加 JSON Schema 校验

5. **critic 评估矩阵**
   - 建立 critic 输出质量的回归测试集（10+ 个 known-bug 样本）
   - 跑新 critic 看是否能找出 80%+ 的 known-bug
   - 低于阈值则需要扩展 prompt（§2.3 4 段式）或加 examples

6. **`model-fallback` 缺显式开关与原地重试日志**
   - 停用降级目前只能「移走 `plugins/model-fallback.ts`」或「把链配成长度 1」，没有配置级开关（`chains.<agent>: []` 会被忽略并回落到内置默认，实测仍会切换）
   - 建议加 `"chains": { "<agent>": { "enabled": false, "candidates": [...] } }` 或独立的 `"disabled": ["build"]`
   - 原地重试 / 原地等待不写日志，排障时看不出「等过几轮才换」；建议加一条 debug 级记录（`docs/model-fallback-usage.md` §5 已把这一限制写明）

### 8.4 P3: 长期（3+ 月）

1. **multi-model 测试**
   - 验证不同模型组合下的委派行为
   - 测 fallback chain

2. **LSP 配置扩展**
   - 当前只有 clangd（来自旧 lsp.json）
   - 考虑加 gopls / pyright / tsserver

3. **AGENTS.md 重构**
   - 当前与本文件有些重叠
   - 考虑把"代码规范"移到 .editorconfig 等
   - AGENTS.md 只保留"项目指令 + 跨 agent 通用规则"

4. **commit/push workflow 自动化**
   - 当前 build agent 不主动 commit/push（v1.1 加了 19 条 ask 兜底）
   - 考虑加一个 `commit` agent 专门做这个
   - 或加 `git_master` skill

5. **MCP 扩展**
   - 当前只用了 codebase-memory-mcp
   - 考虑加 context7（库文档）/ websearch（Tavily）等

---

## 9. 演进日志

版本演进记录已移至 [`CHANGELOG.md`](CHANGELOG.md)；本文档只维护当前态。

---

## 10. 参考资料

### 上游参考

- **oh-my-openagent** (https://github.com/code-yeongyu/oh-my-openagent)
  - v5.0.0-beta（11 agent 设计）
  - 我们的设计是该项目的"用户配置级"实现

- **OpenCode 官方文档** (https://opencode.ai/docs/agents/)
  - Agent 模式、permission 字段、file 引用语法

- **OpenCode V2 schema** (https://opencode.ai/config.json)
  - 配置字段约束

### 内部参考

- `opencode.jsonc` —— 主配置
- `prompts/*.md` —— 9 个 agent prompt（v1.3 +context-builder.md）
- `AGENTS.md` —— 跨 agent 通用规则
- `~/.config/opencode/backup/` —— 历史快照

### 外部参考（critic 设计来源）

- `/workspace/main/oh-my-openagent` —— 本次 critic agent 设计的灵感来源
  - OmO 的 `momus` 是审稿类角色（需 team mode）
  - 我们的 critic 是 subagent 模式实现，零 team-mode 依赖
  - 调研结论：OmO 的 67 KB AGENTS.md 是"plugin 工程师手册"模式，**不适合多项目用户**——我们保留"全局极简 + 项目丰富"模式

---
## 11. 维护者备忘

### 修改 prompt 的正确姿势

1. **不要修改 `opencode.jsonc` 中的 prompt 字段**——已经是 file 引用
2. 直接编辑 `prompts/<name>.md`
3. 如果是新增 prompt 字段或修改权限，需要动配置真源：`opencode.jsonc.opencode-go`（`opencode.jsonc` 是指向它的符号链接；另有 `opencode.jsonc.minimax` 变体，注意三份副本会漂移）

### 修改后必做

```bash
# 1. JSON 合法性（纯 JSON 风格，python 即可）
python3 -c "import json;json.load(open('opencode.jsonc.opencode-go'));print('OK')"

# 2. v2 schema 归一化 + 诊断（0 错误 0 警告）
opencode debug config | jq '.[]?.info | {permissions, agents: (.agents|keys)}'

# 3. 运行时生效的 agent 权限（用 v2 的 last-match-wins 规则复算）
opencode debug agents > /tmp/agents.json
```

- 重启 OpenCode session 重新加载配置
- 在 session 中输入 `@<agent> ...` 实测行为
- **v1.3 新增**：改了 `permission` 后必须跑 `opencode debug agents` 复算——嵌套权限对象在 v2 下**不生效**（action 名对不上，见 §4.4.5）
- **v1.3 新增**：如改了 critic 触发规则，跑一次 ≥3 文件改动观察 build agent 是否主动调 critic
- **v1.8 新增**：改了 `agent.*.model` 或 `providers.*.models.*.limit.context` 后，**必须同步本文件的 §2.1 / §5.1 / §5.2 / §5.3**（本文件以 `opencode.jsonc.opencode-go` 为真源；配置漂移过一次，8/10 个 agent 的 model 记错）

### 不要做

- ❌ 不要在配置里写 JSON 注释（`.jsonc` 允许但我们用纯 JSON 风格避免 parser 混淆）
- ❌ 不要把 prompt 改回内联字符串（破坏 file 引用解耦）
- ❌ 不要修改 provider 段的 `apiKey` 引用方式（保持 `{env:...}` 环境变量）
- ❌ 不要把 MCP 权限写成嵌套对象（v2 只认扁平 `<server>_<tool>` 键）
- ❌ 不要在 agent 块里写 `"read": "allow"`——它会覆盖 opencode 内置的 `.env` → ask 保护（见 §4.4.3）

---

**文档结束**
