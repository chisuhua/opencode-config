# ADR-plan-delegate-engineering-session — 派发主体扩展：plan 主会话（planner 角色）与 front 并列

## 元数据

| 字段 | 值 |
|---|---|
| Status | **Accepted**（2026-11-13：oracle `BLOCK` → 修订 → critic `REJECT` → 修订 → critic 复审 `APPROVE_WITH_CONDITIONS / mergeable: yes`；两条措辞级 SHOULD_FIX 已并入本篇） |
| Date | 2026-11-13 |
| Author | architect |
| Parent | `docs/adr/ADR-front-multi-backend.md`（D1 唯一门控插件出口）、`docs/adr/ADR-front-stop-ownership.md`（归属与槽位释放）、`.rddf/state/adr-front-agent-redesign.md`（Status Accepted；D4 front 工具面白名单化 —— 该篇 2026-11-09 已有部分条款被取代，当前态以 `docs/adr/` 三篇 + `docs/MULTI-AGENT-DESIGN.md` 为准）—— 本篇**只扩展"谁可以派发"**，不改上述各篇的既有不变式 |
| 并行 ADR（不作为依据） | `.rddf/state/adr-double-session-delegation.md`（Status **Draft**，双 session 工程架构）—— 若其结论落地且与本篇冲突，须回头对齐；本篇不依赖它 |
| 关联 change | 尚未立项（architect 不创建 openspec change）→ 暂记 `backlog: plan-delegate-engineering-session`，立项后回填本行与 AC 映射 |
| AC 映射 | 待立项后回填（当前以本篇 Verification 条目 V01–V14 为准） |
| 审稿报告 | `.rddf/reviews/adr-plan-delegate-engineering-session-review.md`（审完后落盘，审查者只读） |
| 前置事实 | ① plan 主会话**固定以 `planner` 角色运行**（用户决定）；② 顶层 `permission` 对五个 delegate action 全部 `deny`，仅 `front` 在 agent 级 `allow`；③ owner = 调用方 session id（现字段名 `front_session_id`）；④ 槽位按 `workRoot` **全局单槽**；⑤ 跨 owner 回收有归属门控（owner 仍存活 ⇒ 拒绝静默顶掉，`lib/delegate-async.ts:1633-1650`）；⑥ `sessions` 实现按 `metadata.delegated_by` **全量**列举，不按 owner 过滤，而描述写的是「本 front 名下」（描述与实现不一致）；⑦ 后端 agent 白名单 = `build`（可写）+ 5 个只读（`lib/delegate-core.ts:96-98`） |

---

## 背景与问题

### ① 能力缺口：plan 侧缺"工程"这一半

现状分工是：**front = `delegate` 做工程 + `subagent` 做知识**；plan 只有 `subagent`（全量 allow），没有任何工程行动出口。planner 的产物是计划与 proposal，而实施落到 `build` 角色 —— 这条链路目前**没有可编程的交接面**：plan 想让工程 session 开工，只能靠人把计划搬过去。

用户诉求：让 plan 也能调用 delegate 派发工程 session。

### ② 为什么不能靠"给 plan 也开 subagent(build)"绕过

`subagent` 的定位是**临时、只读、单次问答的子会话**：无登记、无台账、无 workRoot 槽位、无停机证据门控、无 scope 越界检测。而工程实施需要这些（写隔离、单槽、归属、停机确认）。用 subagent 拉一个可写 agent 会得到"能写但没有上述任何保护"的通道 —— 比没有更危险。

### ③ 直接改配置会踩到的三个结构性问题

1. **描述与实现不一致**：`sessions` 的描述说「本 front 名下」，实现却是全量列举（前置事实 ⑥）。plan 加入后 front 会看到 plan 的后端，而 `cancel`/`suspend` 的归属检查只在"回收他人槽位"路径上生效（前置事实 ⑤）—— 边界需要先定死。
2. **字段语义过时**：owner 存在 `front_session_id` 里，plan 派发后该字段装的是 plan 的 session id。
3. **plan 派发的授权来源**：plan 主会话固定 planner 角色，而角色矩阵的 planner 行当前**禁止**实施类动作（`prompts/build.md` planner 行）。要开放"委托实施"，必须说清 planner 行的边界：planner 不自己写代码，但可以**发起**实施。

---

## 决策

### D1 派发主体：plan 主会话（planner 角色）与 front 并列，共用同一 delegate 通道

- 顶层 `permission` 的五个 delegate action **保持 `deny` 不变**；`front` 与 `plan` 在 agent 级各 `allow` 五项。门控边界仍是"delegate 插件"，不新增第二套派发通道。
- plan 的授权来源是**角色**：plan 主会话固定以 `planner` 角色运行，planner 行的允许清单相应增加"委托工程 session 实施"。**planner 仍不拥有 `edit src/**`** —— 写权限只存在于被派发的后端 session 内。
- 不变式：**delegate 仍是唯一的工程行动出口**（front 侧不变；plan 侧新增同一出口，不产生"第二条路"）。
- **配套配置项（BLOCKER 闭合，缺此项 D2 的正例会自我击穿）**：plan agent 的 `edit` 白名单当前只放行 `.plans/*.md`（`opencode.jsonc.opencode-go:192-196`，其余 `*` = `ask`），而 plan 的计划产出约定是 `.rddf/plans/<slug>.md`（`prompts/plan.md:45-47`）。本篇**把 plan 的计划产出口径收敛到 `.rddf/plans/<slug>.md`**，配套：
  - 配置：plan 的 `edit` 放行 `.rddf/plans/*.md`（`.plans/*.md` 放行**保留**以免破坏既有流程，但不再作为计划产出口径，也**不列为 D2 的 accepted root**）；
  - prompt：`prompts/plan.md` 的对比表口径（`:10` 写「`.plans/*.md`」）与「计划文件输出」段（`:45-47`）**收敛为单一口径** `.rddf/plans/<slug>.md`。
  - 理由：D2 的 accepted roots 必须**覆盖 plan 需要引用的计划类产物**，且 plan 的产出口径 `.rddf/plans/<slug>.md` ⊆ accepted roots —— 否则「带计划派实施」这个中心场景会被 D2 自己的校验拒掉。

### D2 plan 可派发的后端 agent：`build`（可写实施）+ 知识类只读；且**必须带已产出的计划**

- 后端 agent 白名单沿用 `ALLOWED_AGENTS`（`build` + `explore/librarian/oracle/metis/critic`）。
- **派发实施必须携带可判定的计划引用**：brief 新增专用字段 **`plan_ref`**（`delegate` / `dispatch` 两侧 schema 同步演进 —— 两侧都是 `additionalProperties:false`，必须显式加字段）。
  - 取值与解析根：绝对路径；或相对 `project_dir` 的相对路径（**解析根写死为 `project_dir`**，不用插件进程 cwd —— 后者与派发方 session 的 cwd 无关）。
  - 校验：**只校验 `plan_ref` 指向的文件存在**；不做自由文本解析（`task` 正文里写了路径不算 —— 那不可判定）。
  - **accepted roots**（含流程阶段标注）：`.rddf/plans/**`（**builder P1 的 TDD 计划**所在；plan 阶段的 `plan_ref` 通常不落这里）、`.rddf/improvements/**`（**planner 阶段的改进稿**）、`.rddf/roadmap/**`（路线图）、`openspec/changes/*/proposal.md`（**提案**）。
  - **通则：可写 ≠ 可引用。** accepted roots 以本节清单为**唯一**判据，与 plan 的 `edit` 白名单**无包含关系**（plan 可写但不在清单内的路径，如 `.plans/*.md`、`docs/adr/draft-*.md`、`openspec/changes/*/design.md`，引用时一律被拒 —— 这是有意边界，不是 bug）。
  - 校验性质的明示：**存在性校验是"计划先行"的强制函数，不是相关性证明** —— 引用一个"存在但与本任务无关"的计划文件在校验语义内**被接受**（内容相关性由人 / verifier 判断，不在本篇判据内）。
  - 理由：planner 的产物是计划；没有计划就派实施，等于绕过"计划先行"，把 planner 变成"随手点单"。
  - 知识类后端（只读）**不要求** `plan_ref` —— 它们是调研，不产生写。
  - plan 的计划产出统一收敛到 `.rddf/plans/<slug>.md`（`prompts/plan.md:45-47` 的既有约定）；配置里放行的 `.plans/*.md`（`opencode.jsonc:194`）视为**遗留**，本篇不再列为 accepted root。
  - 拒绝时的错误信息必须**列出 accepted roots**（否则 plan 只能反复试错）。
- `acceptance` 仍是必填判据（沿用既有 brief 校验），本篇不放松。

### D3 `sessions` 按 owner 过滤；跨 owner 只经"占槽者 id"暴露

- 实现改为：只列出 `front_session_id === 调用方 session id` 的后端（owner 过滤）。
- 跨 owner 的**唯一**可见性通道 = 占槽冲突时错误信息里的**占槽者 session id**（既有行为，保留）。
- 理由：owner 过滤让 front 与 plan 各自只看到自己的后端，避免误 `suspend`/`cancel` 对方的后端；跨 owner 协调交由人（用户）通过占槽者 id 决定。
- 跨 owner 的**被动可见性已有两条既有通道**（实施方不应把缺口高估为"完全不可见"）：占槽冲突错误里的**占槽者 session id**（V05 所验）、`dispatch` 超限诊断里的**全局占额列表**（`id@workRoot`，既有行为）。可见的只有 id，不是对方任务内容。
- **实现落点（硬约束）**：过滤**只发生在 `sessions` 工具的 execute 内**。`listDelegatedSessions` 及其余消费方（`countActiveBackends` 的**全局并发配额**、`dispatch` 的超限诊断）**必须保持 owner 无关** —— 否则全局配额统计与"占额者"诊断会按 owner 割裂，plan 只数到自己派的后端。

### D4 槽位保持 `workRoot` 全局单槽（plan 与 front 互斥）

- 不变式：同一工作树同时只允许一个后端在跑，**与 owner 无关**。plan 与 front 派同一工作树时，后者被拒（错误信息含占槽者 id）。
- 理由：单槽是写隔离的来源；按 owner 分槽会让两个后端同时写同一工作树，破坏 `scope` + `git status` 差集检测的前提。

### D5 owner 字段语义化：`owner_agent` 显式化，`front_session_id` 保留兼容读

- `pair.json` 条目与 `ledger.jsonl` 行新增 `owner_agent`（`front` | `plan`）。
- 旧字段 `front_session_id` **保留并继续写入**（值即 owner session id，语义已泛化）；读取时 `owner_agent` 缺失**一律按 `front` 解释**（旧数据默认 front —— 写死这个默认值，否则后续代码一旦出现 `owner_agent !== "front"` 的分支，缺失值会被误判为 plan）。
- 理由：字段名与语义脱节会让后续检索/审计误判归属；直接改名会破坏既有台账与归档 change 的可读性。

### D6 关闭范围（本篇**不改**的既有不变式）

写隔离（scope 规则 + 委托前后 `git status` 差集）、`grants` 类目白名单与"question/form/edit/write 永不可 grant"、停机证据门控与亡主接管、消费确认语义（`dispatch` 返回 ≠ 任务完成）、`canonical_root` 归一口径、后端 session 的 `role.json` 写入语义（镜像翻转属**展示面**，权限判定以本 session 分区为准）—— **全部不动**。本篇只改"谁可以派发"及其归属可见性。

---

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **复用 delegate 通道 + D1–D5（本篇）** | **采纳** | 复用既有门控、单槽、归属门控、停机证据与台账；plan 只是新增一个 owner。改动面 = 配置 + 描述 + prompt + 归属过滤 + ADR |
| 保持 front 独占，plan 不派发 | 否决 | plan→build 的交接缺可编程面；要么人肉搬运计划，要么 plan 退化成"只写文档" |
| 给 plan 新建独立派发工具（如 `plan_dispatch`） | 否决 | 第二套协议 = 双份不变式与漂移源；两套通道还会争同一 `workRoot` 槽位，冲突处理无处安放 |
| 用 `subagent` 拉可写 agent 代替 delegate | 否决 | 无登记/台账/单槽/scope 检测/停机证据 —— 得到"能写但无保护"的通道 |
| plan 只能派只读后端，实施一律回用户 | 否决 | 派发实施是本诉求的核心；D2 的"必须带已产出计划"已把绕过风险关掉 |

---

## 后果 / 代价

**正面**
- plan → build 的交接变成可编程链路（派发即开工，带 plan 引用与 acceptance）。
- 复用而非新建：单槽、归属门控、停机证据、台账全部沿用既有实现，风险面可控。
- owner 过滤让 front 与 plan 的后端互不可见，误操作面收窄。

**负面 / 代价**
- 派发主体从 1 个变 2 个 ⇒ **冲突面扩大**：同一工作树上 front 与 plan 会互斥，需要人或流程决定谁先。
- `sessions` 语义变更（owner 过滤）是**行为变更**：既有依赖"全量列举"的用法会受影响（需核对现有用法）。
- owner 字段新增 `owner_agent` ⇒ 台账 schema 演进（虽保持兼容读）。
- plan 派发会**更频繁**触发后端 session 在其 workRoot 写 `.rddf/state/role.json`（`current_role=builder`）—— 与主会话 role 镜像可能打架（本篇不改其语义，仅登记为残留）。
- D2 的"task 必须引用存在的计划文件"是**运行时新增校验**：plan 手上没有计划文件时，派发会被拒（这是有意的强制，但会让 plan 的首次派发多一步）。

**回滚口径**（本篇整体可逆，按此三步回退即可回到现状）：① 撤掉 plan agent 级的五项 delegate `allow`（plan 立刻失去 delegate 工具，回到"无工程出口"）；② 把 `sessions` 的过滤撤回（全量列举恢复）；③ `owner_agent` 保持写入但读取侧按缺失兼容读（旧数据语义不变，无需回滚数据）。已落盘的 pair/ledger 行保留即可 —— 字段是**增量**的，不影响既有读者。

**风险**
- plan 的 prompt 若未同步更新规则（单槽、dispatch≠完成、失败回退），模型会按"front 的直觉"误用工具。
- 两个 owner 同时活跃于同一仓库时，**归属门控的"owner 仍存活"判定依赖 owner session 的可判活**；plan session 消失但后端仍在的情形，复用既有亡主逻辑（本篇不新增语义）。

---

## Verification（可勾选验收判据，前瞻）

> 判据面向"实现完成后的可观察事实"，不是实现日志。编号 V01–V14。

| # | 判据 | 验证方式 |
|---|---|---|
| V01 | 顶层 `permission` 五个 delegate action 仍全为 `deny`；`front` 与 `plan` 的 agent 级各 `allow` 五项 | 配置解析 + `opencode debug agents` |
| V02 | `plan` 主会话的工具清单含 `delegate/dispatch/sessions/suspend/cancel`；`build`/`explore` 等不含 | `opencode debug agents` 或运行时工具清单快照 |
| V03 | 五个工具的描述**不再出现**「front 唯一」「本 front 名下」「由 front 发起」等 front 专属措辞 | `grep` 断言（`lib/delegate-core.ts`、`lib/delegate-async.ts`） |
| V04 | `sessions` 只返回 owner = 调用方 session 的后端；另一 owner 的后端不出现在返回里；**且全局并发配额计数仍包含两个 owner 的后端**（D3 硬约束：`countActiveBackends` 保持 owner 无关） | 集成测试：front 派一个、plan 派一个，各自 `sessions` 只见自己的，且配额计数 = 2 |
| V05 | 占槽冲突时错误信息给出**占槽者 session id**，且拒绝发生在写之前 | 集成测试：plan 往 front 已占用的 workRoot 派发 ⇒ 被拒 + 含占槽 id |
| V06 | plan 派发 `agent=build` 且 `plan_ref` **缺失**或指向不存在的文件 ⇒ **被拒**，错误信息**列出 accepted roots** | 集成测试（负例：缺失 / 不存在 / 根外路径 三例） |
| V07 | plan 派发 `agent=build` 且 `plan_ref` 指向 accepted root 内**存在**的文件 ⇒ **成功**，且后端 session 的 agent = `build`、scope 规则生效 | 集成测试（正例） |
| V07b | plan 派发**知识类**（只读）后端且**不带** `plan_ref` ⇒ **成功**（只读后端不受 D2 约束） | 集成测试 |
| V08 | 同一 workRoot 上 plan 与 front 的后端**互斥**（后派者被拒），且两者并存时各自 `sessions` 互不可见 | V04 + V05 合并验证 |
| V09 | `pair.json` 条目与 `ledger.jsonl` 行含 `owner_agent`（`front`/`plan`）；**旧数据（无该字段）按 `front` 解释**且仍可读 | schema 检查 + 兼容读测试 + 旧样本断言 |
| V10 | `prompts/plan.md`：① 对比表新增 delegate 行；② 含 delegate 操作规则（何时派 / 同步 vs 异步 / 单槽与切换 / dispatch≠完成 / 失败回退到写计划）；③ 含边界句「**委托实施 ≠ 自己实施**；planner 仍不 `edit src/**`、不进 builder 角色；写动作只发生在被派发的后端 session 内」；④ 计划产出收敛到 `.rddf/plans/<slug>.md` | 文本断言 |
| V11 | `prompts/build.md` 角色矩阵 planner 行写明同一句边界（防「禁止 `git commit`（实施类）」被误读成"被派发的后端也不能 commit"） | 文本断言 |
| V12 | `tests/config-guards.test.ts` 断言 plan/front 的 delegate 权限矩阵与顶层 deny | 单测 |
| V13 | 全量回归：`bun test tests/` 全绿 + `scripts/check-upstream-anchors.sh` 23/23 | CI 式回归 |
| V15 | plan agent 的 `edit` 放行 `.rddf/plans/*.md`；`prompts/plan.md` 不再出现 `.plans/*.md` 口径（对比表与「计划文件输出」段**单一口径** = `.rddf/plans/<slug>.md`） | 配置断言 + `grep` 文本断言 |
| V14 | 既有 ADR 未被静默改写：`ADR-front-multi-backend` / `ADR-front-agent-redesign` / `ADR-front-stop-ownership` 的不变式条目保持原样，本篇作为扩展被引用 | diff 复核 |

---

## 已排除的替代方案

见「选项对比表」中三条否决项及其理由（独立派发工具 / subagent 派可写 agent / plan 只派只读后端）。另排除：**放宽 `grants` 类目白名单**（与 `ADR-front-agent-redesign` D5 冲突）、**按 owner 分槽**（破坏写隔离前提）、**让 plan 直接继承 front 的 owner 身份**（归属不可追溯）。

## 残留（登记，不在本篇处理）

1. 后端 session 写 `.rddf/state/role.json` 与主会话 role 镜像的冲突面（plan 派发会更频繁触发）。
2. `sessions` 改为 owner 过滤后，跨 owner 的运维视图（"这台机器上还有哪些后端在跑"）失去单一入口 —— 候选增强：给 `sessions` 加 `scope: owner|all` 参数（默认 `owner`）。v1 不加；`sessions` 只读且归属门控已挡住误 `suspend`/`cancel`（owner 存活 ⇒ 拒绝），两 owner 阶段风险可控。
3. plan session 位于非项目仓时的 `stateRoot` 解析（沿用 `ADR-canonical-root-normalization`，本篇不新增语义）。

---

## 实施记录（2026-11-13）

| AC | 状态 | 证据 |
|---|---|---|
| V01 权限矩阵 | ✅ | `tests/config-guards.test.ts`：顶层五项 deny + front/plan 各 allow + 其它 agent 未放行 |
| V02 plan 工具清单含五个 delegate 工具 | ✅ | 同上（配置层）；运行时可见性由 opencode 的权限判定给出 |
| V03 描述去 front 化 | ✅ | `grep "本 front\|由 front \|front 唯一" lib/*.ts` 仅剩两处**注释**（非描述文本） |
| V04 owner 过滤 + 全局配额 owner 无关 | ✅ | `tests/delegate-async.test.ts`：两个 owner 互不可见 + `countActiveBackends` = 2 |
| V05 跨 owner 占槽互斥 + 报错含占槽者 id | ✅ | 新增用例「跨 owner 同一工作树 ⇒ 槽位互斥，报错含占槽者 id」 |
| V06 plan_ref 缺失 / 不存在 / 根外 ⇒ 拒绝且列 accepted roots | ✅ | `tests/delegate-async.test.ts` 3 例 + `tests/delegate-core.test.ts` 5 例 |
| V07 plan_ref 合法 ⇒ 成功 | ✅ | 用例「plan 派发可写实施，plan_ref 合法 ⇒ 成功」 |
| V07b 知识后端不带 plan_ref ⇒ 成功 | ✅ | 用例「plan 派发知识后端（只读）不带 plan_ref ⇒ 成功」 |
| V08 轮间 / 跨 owner 互斥 | ✅ | 同 V04 + V05 |
| V09 owner_agent 落盘 + 旧数据按 front 解释 | ✅ | 用例断言 `readPairs(dir)[id].owner_agent === "plan"`；缺失默认 front 由 `ownerAgentOf` 单测覆盖 |
| V10 plan.md 四项断言 | ✅ | `tests/config-guards.test.ts`：对比表 delegate 行 / 操作规则 / 边界句 / 口径收敛（`.plans/` 零命中） |
| V11 build.md planner 行边界句 | ✅ | 同上（角色矩阵那张 planner 行） |
| V12 权限矩阵断言 | ✅ | 同 V01 |
| V13 回归 | ✅ | `bun test tests/` = **383 pass / 0 fail**；`scripts/check-upstream-anchors.sh` = 23/23 |
| V14 既有 ADR 未被改写 | ✅ | 本篇只新增文件；`ADR-front-multi-backend` / `ADR-front-stop-ownership` / `adr-front-agent-redesign` 未改动（diff 复核） |
| V15 plan edit 放行 `.rddf/plans/*.md` + 口径收敛 | ✅ | 配置断言 + 文本断言（V10） |

**变更面**：配置（`opencode.jsonc.opencode-go`）、代码（`lib/delegate-core.ts`、`lib/delegate-async.ts`）、prompt（`prompts/plan.md`、`prompts/build.md`）、测试（3 个文件）、文档（`docs/MULTI-AGENT-DESIGN.md`、`docs/CHANGELOG.md`）。
