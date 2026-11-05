# ADR-double-session-delegation：双 session 工程架构（front + 工程 session，砍掉常驻 proxy）

## 元数据

| 字段 | 值 |
|------|-----|
| Status | Draft |
| Date | 2026-11-05 |
| Author | architect |
| Parent | 无（新建决策） |
| 关联 change | backlog: dual-session-architecture（立项后回填） |
| AC 映射 | AC1→前端不污染工程上下文；AC2→权限代答闭环；AC3→worktree 角色连续 |

## 背景与问题

用户希望用一个 OpenCode session（前端 session）专职与用户对话、明确用户意图，再通过该 session 发起对另一个 OpenCode session（工程 session）的请求，由工程 session 用多角色矩阵驱动工程项目。

### 现状痛点

1. 单 session 模式下，理解性对话（"这个模块怎么设计的""X 函数在哪文件"）与实施性对话（"改这个文件""加这个功能"）共用同一工程 session 上下文，导致上下文膨胀，理解性内容对实施没有额外好处，却挤占窗口，触发 compaction 后可能丢失关键实施细节。
2. 工程 session 作为 build agent 走完整角色矩阵（architect/planner/builder/verifier），其核心职责是代码编写、修改、调试、提交，不应承担代码导览职责。
3. 之前考虑的「常驻 proxy session 累积项目理解」存在三个结构性缺陷（Oracle 审查已确认）：compaction 摘要掉早期事实导致「用得越久越蠢」；工程 session 重构后 proxy 路径信息过时且无通知通道（staleness）；proxy 与工程 session 并发读写同一 worktree 出现竞态。

## 决策

**采用两 session 架构：front + 工程 session。砍掉常驻 proxy。**

### 决策 1（对应 BLOCKER 1）：凭证分层，契约 2 改义而非让步

- 契约 2 重写为：账号级凭证（provider API key、token、env、git 凭据）只驻留工程 session，永不进入 front transcript，也不落入 front 可写存储。
- front 只持 **session-scoped capability token**：绑定 `session_id`、TTL ≤ 15 min、可吊销、仅授权三个只读端点：`/permission`、`/form`、`/wait`。token 不构成账号凭证，其出现在 front transcript **不视为契约 2 违约**。
- wait 改为**有界 long-polling**：单次 ≤ 60 s，超时返回 `pending` 由 front 续轮询；连续超时 10 次停止，front 向用户报告「等待超时」并停下，不无限阻塞。

**取舍理由**：把「凭证」拆成两层——账号级凭证留在工程 session，capability token 留在 front。front 代答权限的核心能力得以成立，同时契约 2 的安全边界不被架空。front 直连方案被否，因为会把账号凭证暴露在用户面 transcript。

### 决策 4（对应 BLOCKER 4）：代答安全边界三要素闭环

- **代答默认关闭**，需用户显式开启 `auto_answer: true`（写入本 session 分区，见决策 3）。
- **白名单**：只代答读工具（`read` / `grep` / `glob` / `list` / `websearch` / `lsp` / MCP 读工具）。
- **绝对负面清单**（命中即转用户，前缀模式匹配）：19 条危险 shell 模式（与 build.md 危险命令清单一致：`git push`、`reset --hard`、`clean`、`checkout --`、`restore`、`branch -D`、`stash drop/clear`、`rm -rf|fr|r|f`、`sudo` 等）、`.env` 读取、MCP 写工具、`external_directory`、`doom_loop`、一切 `edit`/`write`、`question`/`form` 自由文本。
- **单回合代答上限 ≤ 5**，超限转用户。
- **审计落点**：代答审计由**工程 session** 以 single-writer 追加写 `<canonical>/.rddf/state/auto-answer.jsonl`（与 role.json 同口径：个人状态、不进版本库）。字段：`ts` / `front_session_id` / `engineering_session_id` / 类目 / 目标摘要 / 命中规则 / 当时角色与窗口状态。front transcript 只展示一行人读摘要；持久审计只在工程侧。
- **external_directory v1 决断**：一律不代答，全部转用户。与权限轴默认 `ask` 对齐；路径在工程外，误放行的代价无界。allowlist 代答列为 backlog 增强，须单独立项、单独 ADR。

### 决策 3（对应 BLOCKER 3）：role-v2 按 session 分区并发模型

> **部分被取代（2026-11-05）**：本节最后一条「写盘：atomic rename + last-write-wins，显式接受」已被 [`adr-front-agent-redesign.md`](./adr-front-agent-redesign.md) 的 **D6** 取代——`delegate` 插件把 role.json 的写盘频率从「用户驱动的低频角色切换」提升到「每次委托」，并发写入方增至两个（插件 + 工程 session 的角色切换），因此改为 `.rddf/state/.role.lock` 协作锁 + 锁内 RMW。本节其余条目（role-v2 schema、分区归属、顶层镜像降级、窗口不跨 session、pair 视图一致性）继续有效。

- `role.json` 升 schema **role-v2**。
- 顶层 `current_role` **降级为镜像**（附带 `updated_at` + `session_id`，仅供跨 session 展示，不作权限判据）。
- 新增 `sessions: { <session_id>: { current_role, auto_switch_window, auto_answer, updated_at } }` 分区。
- 每个 session 只读写**自己的分区**；本分区缺失 → 走既有「全局 fallback → general」链路（build.md:196 不变）。
- **`auto_switch_window` 不跨 session**——窗口授权绑定授予它的对话上下文。
- **写盘**：整文件 tmp + atomic rename；同项目两 session 并发切换为 last-write-wins，**显式接受**（角色切换是用户驱动、低频，竞争丢失无害）。不同 canonical 项目写不同文件，本来就无竞争。
- **front/engineering pair 的视图一致性**：front 读顶层镜像做展示与契约判定；权限类判定（代答开关、窗口内自动切换）一律以**本 session 分区**为准。

### 决策 2（对应 BLOCKER 2）：对既有签批立场的修订声明

保留方案 C（按 canonical 仓库解析 role.json），但必须以显式修订声明落地，范围收窄到双 session pair 已登记场景。

| 既有条款 | 原立场 | 修订后 |
|---|---|---|
| build.md:195「状态文件 `<cwd>/...` 项目级优先」 | cwd 相对解析 | pair 内按 canonical 仓库路径解析 |
| build.md:199「cwd 变更必须重解析」 | 进 worktree 必重解析 | 增例外：worktree → canonical 归一，不重解析 |
| build.md:203「只写项目级」 | 写 cwd 所在项目 | 写 canonical 仓库路径（仍是项目级文件，个人状态属性不变） |
| docs/MULTI-AGENT-DESIGN.md §2.8.2 投影 | 同上 | 同上，投影随源更新 |
| build.md:196-197「字段表」 | role-v1 六字段（current_role / updated_at / updated_by / session_id / history[] / auto_switch_window） | role-v2 字段表：新增 `sessions: {<session_id>: {current_role, auto_switch_window, auto_answer, updated_at}}` 分区，顶层 `current_role` 降级为展示镜像，不作权限判据 |
| docs/MULTI-AGENT-DESIGN.md:343-351「字段表」 | role-v1 六字段 | role-v2 字段表：同 build.md:196-197 |

- **范围**：仅当工程 session 与 front session 组成已登记 pair 时生效；单 session 场景维持 cwd 相对解析不变。
- **回滚路径**：删除本节即恢复既有条款全文效力。
- **实施跟踪**：build.md / MD 的正文同步修订不随本 ADR 直接落（按角色矩阵，治理面编辑归 architect 但实施排期归 backlog），登记 backlog 项，builder 执行；在落地前，本 ADR 为唯一权威源。
- **约束**：修订表只列**真被推翻**的条款；「fallback 链路」「history 上限 20」「异常值按 no-role」等未被触及的条款不写进表，避免虚增取代面。

### 立项理由纠偏

方案 C 立项理由：**消除 worktree 下权限静默放大**（role.json 缺失导致角色矩阵退化为 `general` 是 build.md:196 的明文语义，不是 bug）。立项理由从「修 bug」改写为以上表述，避免前提错误导致取舍不可信。

## 排除的替代方案（补全）

| 选项 | 结论 | 理由 |
|------|------|------|
| A：两 session（front + 工程），砍掉常驻 proxy | ✅ 被选中 | 工程上下文纯净；无 compaction/staleness/竞态；front 直接读代码回答理解问题，无额外层；实测验证了权限代答与 question 代答闭环 |
| B：三 session（front + 常驻 proxy + 工程 session） | ❌ 不选 | 凭证面反而扩大（front 需直连 `/permission` `/form`）；且「按需短命 proxy」与 B 换名复活，未做成本对比；compaction/staleness/竞态三个结构性缺陷未解决 |
| C：单 session，理解性问题与实施任务混在工程 session | ❌ 不选 | 排除方向对，但论证用错了刀：真正致命的是**角色轴切换摩擦**（每问一次就切角色/开窗口），而非单纯污染 |
| D：复用 plan agent 改造为 front | ❌ 不选 | 排除理由弱，接近无理由排除；plan agent 已有只读调研委派模式（metis/explore/librarian）与产出形态契约，与 front 高度重合；ADR 未给出实测否决证据，排除应补证或撤回 |

## 目标场景值守假设（降级路径）

双 session 拆分依赖「front 与工程 session 同时在线、权限事件能及时送达 front」的假设。**无值守/掉线时**：front 掉线后，工程 session 卡在 permission/question 时进入 suspended 状态；用户重新连接 front 后，经 delegate 恢复轮询 `/permission` 与 `/form`，继续代答。不设自动超时放行（避免不可逆操作被静默执行）。

## 一文档一决策

本 ADR 包含三个独立决策点（双 session 拆分、role.json 解析规则改写、front 代答边界），均在本决策段内作出，不拆篇；后续无新增独立决策。

## Verification（可勾选验收判据，前瞻）

- [ ] front session 建立后，`edit` / `subagent` / 裸 `opencode api` 均被拒绝，`read` 可访问工程目录（受 external_directory 白名单）
- [ ] delegate.start 在工程目录建工程 session（agent=build），并投递实施 prompt
- [ ] 工程 session 卡在 permission ask 时，front 通过 delegate 代答 `once`，工程 session 恢复并继续
- [ ] 工程 session 卡在 question 时，front 通过 delegate 回复 `answer`，工程 session 继续
- [ ] front 回答理解性问题时，工程 session 上下文不新增任何消息（GET /api/session/{eng}/message 前后对比）
- [ ] worktree 内的工程 session 通过 `git rev-parse --git-common-dir` 解析到主仓库 role.json，角色矩阵不退化为 `general`
- [ ] relay 循环中，front 对待 permission ask 分类处置：预期内自动 `once`，不可逆/凭据/范围变更升级用户，不替用户拍板
- [ ] v2 schema 下两并行 session 分区互不覆盖（role.json 写冲突不存在）
- [ ] 修订表所列条款已在 build.md / MD 同步（backlog 项关闭）

## 架构裁决补充（planner gap 分析后补全，2026-11-05）

以下三项裁决由 architect 做出，解决 metis gap 分析中的 B1/B2/B3 三个架构 blocker，属 ADR 决策段的有效补充。

### 裁决 A：pair 登记表（解决 B1）

**落点**：`<canonical>/.rddf/state/pair.json`

**字段**：
```json
{
  "schema_version": "pair-v1",
  "front_session_id": "<ses_xxx>",
  "engineering_session_id": "<ses_yyy>",
  "canonical_root": "/home/ubuntu/.config/opencode",
  "registered_at": "2026-11-05T15:45:00Z"
}
```

**写入者**：`delegate.start`（正式轮次）；delegate 轮次前，由 `role-init.sh` 手动模式代写（一次性，供开发期验证）。

**canonical 判定**：`git rev-parse --git-common-dir` 归一后相等，即属于同一 canonical 项目。

**范围限定**：无登记表文件时，全部条款回退到 cwd 相对解析（现行行为，不变更）。

**ADR 对应位置**：BL-1 范围前提；修订表第 66 行「范围」条款的落实入口。

### 裁决 B：session_id 来源（解决 B2）

**首选**：`OPENCODE_SESSION_ID` 环境变量，由 launch 脚本在建立工程 session 时注入（`opencode api post /api/session` 返回的 `data.id` 写入 env）。

**缺失时行为**：拒绝写 role.json 的 `sessions` 分区，走既有「全局 fallback → general」链路，并在响应中明确提示「session_id 未设置，降级为 general，权限矩阵不生效」。

**不选方案**：`GET /api/session` 自指——需要前置持有 API 凭证，与前端「无凭证」的设计目标冲突；启动参数——受 shell 转义约束，不如 env 清晰。

**ADR 对应位置**：BL-2 role-v2 分区键；决策 3 的「每 session 只读写自己的分区」的定位入口。

### 裁决 C：capability token 强制点（解决 B3）

**本轮**：以 wrapper 脚本 / 测试替身演示三端点（`/permission`、`/form`、`/wait`）拒收无效 token。OpenCode 原生端点本身不认识 token，hook 挂载列入 **delegate 插件轮次**（本轮不实施）。

**吊销策略**：仅做「进程重启即全量失效」（内存表自然清空），不设独立吊销 API。吊销接口留待 delegate 轮次。

**强制点**：在 wrapper 层校验 token 的 `session_id` 绑定与 TTL（≤15min），越界访问第四端点拒绝。OpenCode 原生端点不加 hook，因此本轮的 token 校验仅在 wrapper 路径生效，直接调原生 API 绕过——这是已知风险，与 ADR 决策 1（凭证分层）并行，由 delegate 轮次补齐原生端点 hook。

**ADR 对应位置**：BL-2 capability token 签发机制；决策 1 的契约 4 补充。

## 关联 change / backlog

- 关联 change：当前登记 `backlog: dual-session-architecture`（立项后回填）
- **backlog 项 1**：build.md / `docs/MULTI-AGENT-DESIGN.md` 按修订表同步（`:195`/`:199`/`:203`、MD `353-354`；`build.md:196-197`、MD `343-351` role-v2 字段表）
- **backlog 项 2**：`role-init.sh` / `role-show.sh` 及读者的 role-v2 适配 + capability token 签发机制

---

**审查状态**：本文档为 Draft，critic 第 3 轮复审 APPROVE_WITH_CONDITIONS，mergeable: yes。4 个 BLOCKER 均闭合；SHOULD_FIX 1（修订表覆盖面）已补入 role-v2 字段表行；SHOULD_FIX 2（状态行残留）已消除。
