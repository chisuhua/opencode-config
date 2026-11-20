# plan-multi-session-collaboration — 实施路线图（planner 产出）

> 决策：`docs/adr/ADR-plan-multi-session-collaboration.md`（**Accepted** 2026-11-20；oracle `治理面判定: PASS-WITH-NOTES` → critic `APPROVE` / `mergeable: yes`，无 BLOCKER / 无 SHOULD_FIX）
> 审稿报告：`.rddf/reviews/adr-plan-multi-session-collaboration-review.md`
> 关联 change：待立项（`backlog: plan-multi-session-collaboration`）⇒ 立项后回填本行与 ADR 的「关联 change」/「AC 映射」两行
> 本文件是 **builder 的输入**：canonical 的 `.rddf/plans/plan-multi-session-collaboration.md`（TDD 5 步）与 `openspec/changes/plan-multi-session-collaboration/{proposal.md,design.md,tasks.md}` 由 **builder** 生成（工件归属：`rdd-workflow-writing-plans` / `rdd-builder` owns）。本文件**不替代**它们。
> ⚠ **本路径未启用 `add-improve` / `rdd-planner`**：`rdd-planner` 前置（`.rddf/state/.arch-handoff.json`）不存在；`add-improve` 的 HARD-GATE（YAML frontmatter + 7 段 + `**主题**` 精确匹配 `.rddf/roadmap.md` 的 Phase Skeleton Theme 列）与本仓形态（24 个 improvement 全 5 段无 frontmatter、且**无** `.rddf/roadmap.md`）**不可兼容** ⇒ 走**内置流程**。
> 修订记录：**第 2 版** —— 按 metis gap 分析（1 轮，planner 固定审查配对）修订：① `done` 语义拆成 `progress` / `status` 两字段（原 A5/A9/A10 互相矛盾，会建出误报 checker）；② 补 `graph.json` schema；③ 锚点数以脚本自报为准（运行时基线 23：静态 16 行 + A7 循环展开）；④ V02b 改派生有效值 + 无键 agent 闭集；⑤ scope-check 改 fixture 仓 + 基线；⑥ 锁补释放、`plan-sessions.json` 补消费者；⑦ e2e 补负向探针与证据结构判据；⑧ 归档前置补机械件。

---

## 1. 范围与依据

### 1.1 做什么（Phase 1 = ADR 全量落地，**无过渡期**）

用户已拍板「直接做 Phase 1（跳过只读扇出过渡期）」⇒ 本 change 一次落地 ADR 的 D1–D8 全部决策，不做分阶段裁剪。

| 决策 | 落地形态 | 本 change 是否实施 |
|---|---|---|
| **D1** 协作区 `.rddf/plan-topics/<topic-slug>/` | 目录约定 + 单一写者表 + **node id 字符集** | ✅ 目录约定进 prompt + checker 判据；**目录本身不预建**（运行时由 plan 父会话创建） |
| **D2** `graph.json` 派生状态 + 三条机械判据 | `lib/plan-topics.ts` + `scripts/plan-topic-check.ts` + `tests/plan-topics.test.ts` | ✅ |
| **D3** 父子会话 = 宿主 `subagent` | **不写代码**（宿主内建）⇒ 只写进 prompt 的使用纪律 | ✅（prompt 侧） |
| **D4** 新增 `plan-worker`（`mode: subagent`） | `opencode.jsonc.opencode-go` + `prompts/plan-worker.md` + 守卫登记 | ✅ |
| **D5** 会话身份三落点 | `.rddf/state/plan-sessions.json`（gitignored）+ `graph.json` 的 `attempt[]` + `TODO.md` 头 | ✅（路径约定 + gitignore + checker 消费 + prompt 纪律） |
| **D6** 续接 vs 重建 | prompt 纪律（父会话用 `sessionID` 续接；父死后按 node 重建） | ✅（prompt 侧） |
| **D7** topic 独占锁 | `.rddf/state/plan-topics/<slug>.lock`（原子 `mkdir`）+ 接管需人确认 + **释放** | ✅（prompt 纪律 + checker 报告 + gitignore） |
| **D8** 关闭范围 | — | ✅（本 change **不改** delegate / role.json / 角色矩阵 / rdd-workflow 产品侧 / CI） |

### 1.2 不做什么（显式排除，防范围蔓延）

- ❌ 派发**事前闸门**（ADR 残留 #2：技术上可行 —— `plugins/subagent-contract.ts:87-131` 的 L1 硬门已挂在同一钩子上 —— 本期**范围决定**不做）⇒ 触发条件 = 误派发 / 误 join 实际发生。**代价缓解见 §5 裁决 10（`attempt[].precheck` 让「是否跳过检查」事后可判）**。
- ❌ 每节点精确写域（ADR 残留 #1：需 per-session 权限，宿主 `subagent` 不传 permissions ⇒ 本期不可能）。
- ❌ 子会话派工程实施（`plan-worker` 无 `delegate`）。
- ❌ `.rddf/plan-topics/**` 进 `PLAN_REF_ROOTS`（ADR D1 已登记闭集边界）。
- ❌ `docs/adr/` 自建清单守卫（ADR 残留 #5 的决定 = **靠 review 流程兜底**，**不得**反向漂移）。
- ❌ CI / git hook 接线（本仓无 CI、无生效 git hook ⇒ 唯一真实闸门 = `bun test tests/` + `scripts/check-upstream-anchors.sh`）。
- ❌ `scripts/`、`tests/` 新文件的清单闸门（`EXPECTED` 只覆盖 `prompts/` `docs/` `lib/`，现状**不扩**；本 change 显式登记此事实）。

---

## 2. 实施分解（TDD 5 步，每任务 2–5 分钟粒度）

> 纪律：**每块先写测试（红）→ 再实现（绿）→ 跑该块测试**。
> **实施顺序**：A → B → C → E → F → G → H → I。**A 与 B 可并行**（不同文件、不同 describe）；C 是 D 的前置；E 独立可并行。
> **既有闸门提示（builder 必读，否则红了不知原因）**：① `prompts/plan-worker.md` 首行必须含 `plan-worker`（`tests/config-guards.test.ts:2012-2025`）；② 新增 `prompts/plan-worker.md` 必须进 `EXPECTED.prompts`（`:1464`）；③ 新增 `lib/plan-topics.ts` 必须进 `EXPECTED.lib`（`:1476-1488`）；④ `prompts/plan.md` 的 `capability:plan` 块改配置后必红一次（AC23 派生守卫）。

### 块 A0 — 数据契约前置（`graph.json` schema，写在 `lib/plan-topics.ts` 的类型 + checker 校验）

> metis P0-2：schema 不定义，块 A 的每条 fixture 都在猜输入。

```
graph.json = {
  version: 1,
  topic: string,                  // == 目录名（slug）
  nodes: [{
    id: string,                   // ^[a-z0-9][a-z0-9._-]{0,63}$ 且不含黑名单（见 A1）
    title: string,
    deps: string[],               // 引用其他 node.id；允许空
    owner: "parent" | "child",
    status: "pending" | "blocked_by_deps" | "done",      // 门控有效值（见 A9）
    progress: "todo" | "partial" | "complete",          // 纯磁盘派生缓存（以派生为准）
    attempts: [{ agent, started_at, finished_at?, precheck?, baseline? }],
    deliverables: string[],       // 相对 topic 根的路径数组
    brief_sha256?: string         // 父写 BRIEF.md 时记录（见 A15）
  }]
}
```

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| A0.1 | 红 | schema 负向：缺 `version` / `nodes` 非数组 / `status` 非枚举 / `progress` 非枚举 / `deliverables` 非数组 / `deps` 非数组 / `attempts` 非数组 ⇒ `exit 3` 且 stderr 含字段名 | `tests/plan-topics.test.ts` | 路线图 AC（schema） | — |
| A0.2 | 绿 | 实现 `parseGraph()` + `assertSchema()` | `lib/plan-topics.ts` | A0.1 绿 | A0.1 |

### 块 A — checker 库：派生状态 + 门控状态 + fork/join 判据

> **核心语义（metis P0-1，原设计会误报）**：`progress` = **纯磁盘派生**（不看依赖）；`status` = **门控有效值**（`progress==complete ∧ deps 全 done ∧ deliverables 非空且路径存在` ⇒ `done`，否则 `blocked_by_deps` 或 `pending`）。**两者正交，不互相判定**。子可先干完（`progress=complete`）而依赖未完成（`status=blocked_by_deps`）—— 这是**合法状态**。

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| A1 | 红 | `node id` 校验：**字符集** `^[a-z0-9][a-z0-9._-]{0,63}$` + **黑名单**（以 `.lock` 结尾、`.env`、`.bak`、`backup` 前缀 —— 防 `.gitignore` 误伤，见 E3）+ 拒 `..` / 绝对路径 / 含 `/` / 空串 / `.` | `tests/plan-topics.test.ts` | V08（node id 越界） | A0.2 |
| A2 | 绿 | 实现 `assertValidNodeId()` | `lib/plan-topics.ts` | A1 绿 | A1 |
| A3 | 红 | **重复 node id** 检测（同 `id` 出现 ≥2 次）。⚠ 原「同节点两个 owner」在单值字段上**不可能触发** ⇒ 降级为重复 id 检测（metis P2-14） | 同 A1 文件 | V08 | A2 |
| A4 | 绿 | 实现；`owner` 只断言取值域 `{parent,child}` | `lib/plan-topics.ts` | A3 绿 | A3 |
| A5 | 红 | DAG：自环 / 二元环 / 三元环 / **dangling dep**（引用不存在的 id）/ `deps` 内重复项 | 同 A1 文件 | V08（成环 / 悬空依赖） | A4 |
| A6 | 绿 | 实现 `assertAcyclic()` + `assertDepsExist()` | `lib/plan-topics.ts` | A5 绿 | A5 |
| A7 | 红 | `progress` 派生：`TODO.md` 全勾 **且** `RESULT.md` 非空 ⇒ `complete`；否则 `partial`；**零 checkbox ⇒ `partial`（禁止 vacuous done）** | 同 A1 文件 | V09 | A6 |
| A8 | 绿 | 实现 `deriveProgress()`（闭集解析：`^- \[( |x|X)\] ` + 允许二级缩进 + **先剥离 fenced code block**；**至少 1 项**） | `lib/plan-topics.ts` | A7 绿 | A7 |
| A9 | 红 | **`RESULT.md` 非空判据**：空文件 / 仅空白 / 仅 HTML 注释 / 仅一级标题 ⇒ `partial`；正常段落 ⇒ `complete`。**可选强化：末行哨兵 `## STATUS: COMPLETE`**（防半写文件被当完成） | 同 A1 文件 | V09 | A8 |
| A10 | 绿 | 实现 `isNonEmptyResult()` | `lib/plan-topics.ts` | A9 绿 | A9 |
| A11 | 红 | `status` 门控：`progress==complete ∧ deps 全 done ∧ deliverables 非空**且每条路径存在且非空**` ⇒ `done`；`progress==complete` 但 deps 未全 done ⇒ `blocked_by_deps`；否则 `pending` | 同 A1 文件 | V08（join 无交付物）+ V09 | A10 |
| A12 | 绿 | 实现 `deriveStatus()` | `lib/plan-topics.ts` | A11 绿 | A11 |
| A13 | 红 | 缓存一致性：`graph.json` 的 `status` / `progress` 与派生值分叉 ⇒ 报错并列出分叉节点（**缓存只能缓存，判据以派生为准**） | 同 A1 文件 | V09 | A12 |
| A14 | 绿 | 实现 `assertCacheConsistent()` | `lib/plan-topics.ts` | A13 绿 | A13 |
| A15 | 红 | `brief_sha256` 台账：父写 `BRIEF.md` 时记哈希；磁盘 `BRIEF.md` 哈希 ≠ 记录值 ⇒ 违规（抓「子篡改自己的验收标准」/「父改 brief 未更新哈希」） | 同 A1 文件 | V08（自授权） | A14 |
| A16 | 绿 | 实现 `assertBriefIntegrity()` | `lib/plan-topics.ts` | A15 绿 | A15 |
| A17 | 红 | 孤儿节点双向：① `nodes/<id>/` 存在但图无节点；② 图有节点但 `nodes/<id>/BRIEF.md` 不存在 ⇒ 该节点**不可派发** | 同 A1 文件 | V08（孤儿） | A16 |
| A18 | 绿 | 实现 `assertNoOrphanNodes()` + `assertDispatchable()` 纳入 BRIEF 存在性 | `lib/plan-topics.ts` | A17 绿 | A17 |

### 块 B — CLI + 写域核对（`scripts/plan-topic-check.ts`）

> metis P0-4：**不复用** `lib/delegate-core.ts::gitStatusPaths`（它在 git 失败时 `catch → return []` ⇒ 假绿；且不用 `-z` 解析，路径含空格会被引号转义破坏）。B5 的只读保证在 `mkdtemp` + `git init` 的 **fixture 仓**里做（对真实仓跑会踩 `tests/real-repo-git-budget.test.ts:9-14`）。

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| B1 | 红 | **退出码契约**（四值互斥）：`0` 全绿 / `1` 有违规（逐条列出）/ `2` 用法错误 / `3` `graph.json` 缺失或不可解析。断言 `2`/`3` 时 stdout **不含**违规列表 | `tests/plan-topics.test.ts` | V08 | A18 |
| B2 | 红 | `--json` 输出：stdout 只一个 JSON 对象 `{ok, violations:[{code,node,detail}]}`；`code` 为**闭集枚举**；`JSON.parse` 成功 | 同 B1 文件 | V08 | B1 |
| B3 | 绿 | 实现 CLI `check <topic-dir>`（汇总块 A 全部判据） | `scripts/plan-topic-check.ts` | B1/B2 绿 | B1 |
| B4 | 红 | `scope-check <topic-dir> <node-id> --baseline <ref\|sha>`：输出越界路径列表；**`git` 失败 ⇒ 非零退出（不吞错）**；用 `-z` 解析 | 同 B1 文件 | V10 | B3 |
| B5 | 绿 | 实现 `scope-check`（`mkdtemp` + `git init` fixture 仓；基线差分用 `changedSince(before, after)` 语义**自实现**，不 import 吞错版本） | `scripts/plan-topic-check.ts` | B4 绿 | B4 |
| B6 | 红 | **只读保证**：fixture 仓跑前后 `git status --porcelain` 逐字相同 | 同 B1 文件 | V10（副作用零） | B5 |
| B7 | 红 | `lock` 子命令：只读报告锁状态（有/无 / owner / 与 `plan-sessions.json` 绑定是否一致） | 同 B1 文件 | V11 辅助 | B5 |
| B8 | 绿 | 实现 `lock`（读 `.rddf/state/plan-topics/<slug>.lock/owner`） | `scripts/plan-topic-check.ts` | B7 绿 | B7 |
| B9 | 红 | 空 topic：`nodes.length === 0` ⇒ 违规（除非 `--allow-empty`）；防「造空 topic 交差」 | 同 B1 文件 | V08 | B3 |

### 块 C — 配置：新增 `plan-worker` agent（`opencode.jsonc.opencode-go`）

> ⚠ `opencode.jsonc` 是指向 `opencode.jsonc.opencode-go` 的**符号链接** ⇒ 改**真源**文件。
> ⚠ metis P2-17：原 C9/C10（edit 白名单红绿）与 D1/D2（capability 投影块红绿）是同一处配置的两个视角 ⇒ **合并为一次红绿**（C9 改配置 → C10 同时跑 V06 + AC23）。

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| C1 | 红 | 守卫断言 `plan-worker` 形态：`mode == "subagent"`；`edit` 白名单**恰好** `.rddf/plan-topics/*` 一条（用 `capabilityBlock()` 渲染比对，**不手抄期望值**）；`subagent`/`delegate*`/`question`/`skill`/`lsp`/`external_directory` 全 `deny`；`shell` 首键 `"*": "deny"` 且含 `* > *` / `tee *` / `sort -o*` 守卫；**`shell` 白名单不含 `bun*` / `node*`**（防 checker 被子会话执行） | `tests/config-guards.test.ts` | V02 | — |
| C2 | 绿 | `opencode.jsonc.opencode-go` 加 `plan-worker` 条目（`mode: "subagent"`、`prompt: {file:./prompts/plan-worker.md}`、窄权限） | 同 C1 文件 | C1 绿 | C1 |
| C3 | 红 | `scripts/agent-guard-rules.ts` 的 `GUARDED_AGENTS` 含 `plan-worker`；`scripts/agent-guard-gen.ts --check` 无漂移 | 同 C1 文件 | V03 | C2 |
| C4 | 绿 | `GUARDED_AGENTS` 加 `plan-worker` → `agent-guard-gen.ts --write` → `--check` 绿 | `scripts/agent-guard-rules.ts` + 配置 | C3 绿 | C3 |
| C5 | 红 | **可派者集合（fail-closed 版）**：① 显式 `subagent` 为 `allow` 的 agent 集合 == {`build`, `plan`}；② **无 `subagent` 键的 agent 清单**恰好 == `["title"]`（闭集 —— 新增无键 agent 必须做一次决定）；③ `front` 的 allow 清单不含 `plan-worker`（**改为引用** `tests/config-guards.test.ts:267-276` 既有断言，不重复建设）；④ `plan-worker` 自身 `subagent` 为 `deny` | 同 C1 文件 | V02b | C4 |
| C6 | 绿 | 实现该断言（含无键 agent 闭集清单） | 同 C1 文件 | C5 绿 | C5 |
| C7 | 红 | `EXPECTED.prompts` 含 `plan-worker.md`；`EXPECTED.lib` 含 `plan-topics.ts` | 同 C1 文件 | V04 | C2 |
| C8 | 绿 | 两处清单加条目 | 同 C1 文件 | C7 绿 | C7 |
| C9 | 红 | `plan` 的 `edit` 白名单含 `.rddf/plan-topics/*` 与 `.rddf/state/plan-sessions.json`（**精确单文件**）；断言 `Object.keys(edit)[0] === "*"` 且新两条的 `indexOf > 0`（**last-match-wins 顺序**，同 `:247-253` 先例）；`plan-worker` 的**不含** `.rddf/plans/`、**不含** `.rddf/state/` | 同 C1 文件 | V06 | C8 |
| C10 | 绿 | 改 `plan` 的 `edit` 白名单 + **同步** `prompts/plan.md` 的 `capability:plan` 投影块（一次性跑 V06 + AC23） | 配置 + `prompts/plan.md` | C9 绿 + V05 | C9 |

### 块 D — prompt（`prompts/plan-worker.md` + `prompts/plan.md`）

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| D1 | 写 | 新增 `prompts/plan-worker.md`（**首行含 `plan-worker`**，否则既有闸门 `:2012-2025` 红）：角色定位（**只做自己 node 的 todo**）、写集（只写 `nodes/<id>/TODO.md` + `RESULT.md`）、读集、`TODO.md` / `RESULT.md` 格式（含可选末行哨兵 `## STATUS: COMPLETE`）、**不得**派生 / 问用户 / 派工程 / 跑 `bun`、最终消息**只回指针 + 摘要**、压缩后**先读盘** | `prompts/plan-worker.md` | V04 | C2 |
| D2 | 写 | `prompts/plan.md` 增「多会话协作」段：topic 形态 + 单一写者表（**含 `plan-sessions.json` 为跨 topic 多写者例外的登记**）+ `graph.json` schema + **`progress` / `status` 正交语义** + 派发前跑 `bun scripts/plan-topic-check.ts check <topic-dir>` 并把 `{at, exit, graph_rev}` 写进 `attempt[].precheck` + **锁的获取与释放**（全节点 done ⇒ `rmdir`）+ **D6 续接 vs 重建** + 子结果只回指针 | `prompts/plan.md` | V05 / V14 | D1 |
| D3 | 写 | `prompts/plan.md` 的**既有口径保持原样**：`.rddf/plans/<slug>.md` 产出、`plan_ref` 规则、`delegate` 五项权限 —— **一字不改** | `prompts/plan.md` | V14 | D2 |

### 块 E — 运行时文件口径（`.gitignore` + node id 反向守卫）

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| E1 | 红 | `.gitignore` 双向断言：`git check-ignore -v .rddf/state/plan-sessions.json` 退出 **0**；`git check-ignore -v .rddf/plan-topics/<t>/graph.json` 退出**非 0** | `tests/config-guards.test.ts` | V07 | — |
| E2 | 绿 | `.gitignore` 加 `.rddf/state/plan-sessions.json`（`.rddf/**/*.lock` 已覆盖锁） | `.gitignore` | E1 绿 | E1 |
| E3 | 红 | **反向守卫**（metis §5-10）：对**每个**合法 node id 形态断言 `git check-ignore -q .rddf/plan-topics/<t>/nodes/<id>/RESULT.md` **非 0**；对黑名单 id（`foo.lock` / `.env` / `x.bak` / `backup1`）断言 **被** ignore ⇒ 逼 node id 字符集排除这些前缀 | 同 E1 文件 | V07 | E2 |

### 块 F — 上游语义锚点（`scripts/check-upstream-anchors.sh`）

> metis P0-5：锚点判据**不得写魔数**。⚠ 修正：`grep -c 'check "'` 只数静态行（16），**运行时基线是 23**（A7 在 for 循环里多次调用 `check`）⇒ 以脚本自报 `N` 为准。
> metis P0-5：**「无 SKIP」不能靠退出码判** —— 脚本在源码缺失时打印 `SKIP` 并 `exit 0`（`:39-42`）⇒ fail-open。正确判据 = `grep -q "RESULT: OK"`（SKIP 分支永不打印该行）。

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| F1 | 写 | 7 条锚点（**只写语义 + 文件 + grep 模式，不写行号**）：① primary 拒绝作 subagent ② 建子会话设 `parentID` ③ 完成合成消息投回父会话 ④ resume 校验 `parentID` ⑤ 子会话权限取 agent 自身配置 ⑥ `Wildcard` 的 `*` 跨斜杠 ⑦ delegate 按 `workRoot` 单槽 | `scripts/check-upstream-anchors.sh` | V15 | — |
| F2 | 验 | `bash scripts/check-upstream-anchors.sh \| grep -q "RESULT: OK"`；且脚本自报 `N` ≥ **既有基线（运行时 23）** | — | V15 | F1 |

### 块 G — 文档投影

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| G1 | 写 | `docs/MULTI-AGENT-DESIGN.md`：`plan-worker` agent 卡片 + 协作区文件树 + 通道描述（与 delegate 分开） | `docs/MULTI-AGENT-DESIGN.md` | V14（人工 diff） | D2 |
| G2 | 写 | `AGENTS.md`：agent 列举同步（若该处列举） | `AGENTS.md` | V14（人工 diff） | G1 |
| G3 | 写 | `docs/SUBAGENT-ORCHESTRATION.md`：新增「plan 侧离线协作」通道（明确与 delegate 分开） | `docs/SUBAGENT-ORCHESTRATION.md` | V14（人工 diff） | G1 |
| G4 | 写 | `docs/CHANGELOG.md`：一条（ADR 指针 + 实施范围 + 「V15 锚点运行时基线 23、本次 +6 ⇒ 29」注记） | `docs/CHANGELOG.md` | — | G1 |

### 块 H — 全量回归 + ADR 回填 + 归档前置

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| H1 | 验 | `bun test tests/` **0 fail** + `bash scripts/check-upstream-anchors.sh \| grep -q "RESULT: OK"` | — | V01 | A–G |
| H2 | 验 | 既有口径零回归：`prompts/plan.md` 的 `plan_ref` / `.rddf/plans/` 口径 diff 复核；`delegate` 五项权限断言仍绿；`front` 的 subagent 顺序守卫仍绿 | `git diff` 复核 | V14 | H1 |
| H3 | 写 | ADR 回填：「关联 change」→ change 路径；「AC 映射」→ change 的 AC 编号；「实施记录」→ AC→状态→证据；**注明 V15 锚点运行时基线 23、本次 +6 ⇒ 29（与 ADR 正文一致）** | `docs/adr/…md` | — | H1 |
| H4 | 写 | 审稿报告补「实施后核验」段 | `.rddf/reviews/adr-plan-multi-session-collaboration-review.md` | — | H3 |
| H5 | 验 | **归档前置机械件**（metis P2-16）：`test -f .rddf/state/verifier/plan-multi-session-collaboration.json` 且其 verdict == pass；`test -f .rddf/reviews/plan-multi-session-collaboration-e2e.md` | — | 用户口径「verifier 通过才归档」 | I1–I3 |

### 块 I — 人工 e2e（**主会话执行，用户终裁**；不进 CI）

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| I1 | 验 | 配置生效：`opencode debug agents` 列出 `plan-worker` 且 `mode=subagent`；`plan` 工具清单含 `subagent` | 记录 | V13 | H1 |
| I2 | 验 | **六正向 + 三负向**探针（步骤见 §3.3）：① 同轮 `background` 派两个；② `parent_id` == 根 id；③ 子内 `$OPENCODE_SESSION_ID` == 子 id；④ 两条完成合成消息到父；⑤ 父 `subagent(sessionID=…)` 续接成功且子读得到 `TODO.md`；⑥ 父死后新根**不能**续接；**⑦ 子写 `lib/x.ts` ⇒ 被拒**；**⑧ 子写 `.rddf/plan-topics/<other>/…` ⇒ 被拒**；**⑨ 子写 `.rddf/plan-topics/../state/role.json` ⇒ 被拒** | `.rddf/reviews/plan-multi-session-collaboration-e2e.md` | V12 | I1 |
| I3 | 验 | 独占锁：两真实 plan 会话抢同 topic ⇒ 第二个被拒；**全节点 done 后锁可释放** | 同 I2 文件 | V11 | I2 |

---

## 3. 验证面设计（用户强调项）

### 3.1 判据来源（按 `prompts/build.md` §verifier 产出契约 的优先级）

1. 用户本次明确给出的验收条件 —— 「充分考虑验证面，最终通过 verifier 才进入归档」；
2. `openspec/changes/plan-multi-session-collaboration/proposal.md` 的「验收标准」表（**主判据**，编号以 proposal 为唯一源）；
3. 本次变更自己声明的行为（ADR D1–D8 + 本路线图 §2）；
4. ADR「Verification」V01–V15（上位判据）。

### 3.2 验证方式分组

| 组 | 判据 | 载体 / 命令 | 自动？ |
|---|---|---|---|
| **自动化**（唯一真实闸门） | V01 / V02 / V02b / V03 / V04 / V05 / V06 / V07 / V08 / V09 / V10 / V14（人工 diff）/ V15 | `bun test tests/`、`bash scripts/check-upstream-anchors.sh \| grep -q "RESULT: OK"`、`git check-ignore` | ✅ |
| **证据结构**（可机械，内容真伪仍靠人） | e2e 记录文件存在 + 含 9 个探针 id（`I2①`…`I2⑨`）+ `V11` + `V13`，每条含「取证命令」「原始输出」两列非空 | `grep -c` + `test -f` | ✅（结构）/ ❌（内容） |
| **归档前置**（机械） | `.rddf/state/verifier/plan-multi-session-collaboration.json` 存在且 verdict == pass | `test -f` + `grep` | ✅ |
| **人工 e2e**（本仓无 e2e 框架） | V11 / V12 / V13 | 手工 + 探针记录 | ❌ |
| **不可机判**（ADR「已知不可机判清单」+ metis 补 2 条） | 上下文压缩后 todo 丢失 / 子中途死 / **父死子仍活（双写者）** / **attempt 无 session id ⇒ 越权无法归因** / 父上下文被撑爆 / 僵尸锁 / 派发前 deps 未完成 / 节点内越界写 / 子内 `ask` 挂起 | 兜底见下表 | — |

**不可机判的兜底（逐条，不假装有闸门）**：

| 项 | 兜底 |
|---|---|
| 压缩后 todo 丢失 | D6 重建路径（先读盘）；`TODO.md` 唯一真源 |
| 子中途死 | `attempts[]` 有 `started_at` 无 `finished_at` + `nodes/<id>/*` mtime 超阈值 ⇒ `stale` 告警（半机械代理）；父重派 |
| **父死子仍活（双写者）** | **纯协议**：`TODO.md` 头写 `owner_session_id`，进来先核对；**必须登记进 ADR 清单（H3 回填）** |
| **越权无法归因** | `attempts[]` 按 D5 **不存** session id ⇒ 只能判「被改过」（`brief_sha256`），判不出「谁改」 |
| 父上下文被撑爆 | prompt 约定「子只回指针 + 摘要」 |
| 僵尸锁 | 人确认，不自动抢占；checker `lock` 只报告 |
| 派发前 deps 未完成 | 事后 checker + `attempt[].precheck` 留痕（**可判是否跳过检查**） |
| 节点内越界写 | V10 路径核对（**需基线**；无基线不可判） |
| 子内 `ask` 挂起 | 窄权限**禁止** `ask` 档（V02） |

### 3.3 人工 e2e 的可复现步骤（不许写成「手动验证一下」）

| 判据 | 复现步骤 | 期望观察 | 取证命令 |
|---|---|---|---|
| I2① | 根 plan 会话同轮两次 `subagent(agent="plan-worker", background=true)` | 两条 background 返回 | — |
| I2② | 查库 | 两子 `parent_id` == 根 id | `sqlite3 ~/.local/share/opencode/opencode.db "SELECT id,parent_id,agent FROM session_v2 WHERE parent_id='<root>'"` |
| I2③ | 子内 `printenv OPENCODE_SESSION_ID` | == 子 id | 同上 |
| I2④ | 父消息流 | 两条 `<subagent … state=completed>` | 父会话消息 |
| I2⑤ | 父 `subagent(sessionID=<child>)` | 子读得到自己的 `TODO.md` | 子消息 |
| I2⑥ | 父死 ⇒ 新根 `subagent(sessionID=<old child>)` | **被拒** | 错误信息 |
| **I2⑦** | 子会话 edit `lib/x.ts` | **权限拒** | 子消息 |
| **I2⑧** | 子会话 edit 别的 topic 路径 | **权限拒**（注：同 topic 内跨 node **不会**被拒 —— ADR 残留 #1） | 子消息 |
| **I2⑨** | 子会话 edit `.rddf/plan-topics/../state/role.json` | **权限拒**（Wildcard 前缀不匹配） | 子消息 |
| V11 | 两真实 plan 会话抢同 topic；全节点 done 后释放 | 第二个 `mkdir` 失败；释放后 `rmdir` 成功 | 两会话消息 |
| V13 | `opencode debug agents` | 列出 `plan-worker` / `mode=subagent` | 命令输出 |

### 3.4 验收顺序（早失败早停）

1. `agent-guard-gen.ts --check`（配置漂移）→ `bun test tests/`
2. 块 A0/A/B 的 checker 单测（schema / 派生 / 门控 / CLI 退出码 / scope-check fixture 仓）
3. `tests/config-guards.test.ts`（形态 / 守卫 / 投影块 / ignore 正反向）
4. 边界与错误路径：node id 越界与黑名单 / 重复 id / 成环与悬空 dep / 零 checkbox / 模板占位 RESULT / 缓存分叉 / brief 篡改 / 孤儿节点 / 空 topic / 退出码四值 / `git check-ignore` 双向
5. `check-upstream-anchors.sh | grep -q "RESULT: OK"`
6. 人工 e2e（I1–I3）—— 主会话执行，用户终裁
7. 遗留清扫复核（§6）

### 3.5 验收角色与失败处置

- 验收人：**verifier**（角色内建，不改实现）。轮次上限 3（`RDDF_VERIFIER_MAX_LOOPS=3`）；第 3 轮仍失败 ⇒ `halted` 交用户。
- 失败分类：`implementation_gap` ⇒ 回 **builder**；`proposal_drift` ⇒ 回 **planner**。
- 报告落点：`.rddf/reviews/plan-multi-session-collaboration-verify.md`。
- ⚠ **人工 e2e 无证据时按「判据不通过」处理，不得按「取证不可用」处理**（metis P0-6：verifier 契约把「取证不可用」限定为四类环境信号 —— runner/依赖缺失 / 超时 / 0 用例 / 收集失败；「没人跑 e2e」不属于任何一类）。⇒ 主会话**必须**在验收前跑完 I1–I3 并留证；否则该 AC 判 fail。
- 归档门：H5 的机械件满足 ⇒ 才允许 `openspec archive`。

---

## 4. 派发方案（planner → 工程 session）

| 字段 | 值 |
|---|---|
| `plan_ref` | `openspec/changes/plan-multi-session-collaboration/proposal.md`（accepted roots 内；本路线图 `.rddf/roadmap/**` 也在 accepted roots 内） |
| `role_class` | `builder`（本 change 改治理面文件 ⇒ **不得**用 `architect`；其 scope 不能含 `scripts/`、`tests/`、`prompts/`） |
| `scope` | `lib/plan-topics.ts`、`scripts/plan-topic-check.ts`、`scripts/agent-guard-rules.ts`、`scripts/check-upstream-anchors.sh`、`tests/plan-topics.test.ts`、`tests/config-guards.test.ts`、`prompts/plan-worker.md`、`prompts/plan.md`、`opencode.jsonc.opencode-go`、`.gitignore`、`docs/MULTI-AGENT-DESIGN.md`、`AGENTS.md`、`docs/SUBAGENT-ORCHESTRATION.md`、`docs/CHANGELOG.md`、`openspec/changes/plan-multi-session-collaboration/**` |
| `acceptance` | §3.2「自动化」全绿 + `bun test tests/` 0 fail + anchors `RESULT: OK` + e2e 记录结构满足 §3.2 |
| `constraints` | 不 commit / 不 push；不改 `PLAN_REF_ROOTS`；不改 delegate / `role.json` / 角色矩阵；不建 `docs/adr/` 清单守卫；`plan-worker` 不得有 `ask` 档；不碰 `cli.json` 与 `opencode.jsonc.opencode-go` 的**既有未暂存改动**（前轮残留） |
| `base` | 派发前 `git rev-parse HEAD^{commit}` 解析 sha 填入 |

⚠ **scope 相容性**：`role_class=builder` 的 scope **不得**含 `docs/adr/**` ⇒ **ADR 回填（H3）不走派发**，由主会话在 builder 阶段直接改（回填指针 / 状态 / 实施记录不是**决策变更**；「单方面改已签批 ADR 的决策内容」才禁止）。

---

## 5. ADR 未明说、本路线图补的**实施细节裁决**

| # | 缺口 | 裁决 | 理由 |
|---|---|---|---|
| 1 | D5 的 `plan-sessions.json` 在 `.rddf/state/`，但 D4 只说 plan 的 `edit` 加 `.rddf/plan-topics/*` ⇒ 父写不了 | plan 的 `edit` **再加一条** `.rddf/state/plan-sessions.json`（**精确单文件**，不扩 `.rddf/state/` 整目录） | 只放行单个运行时文件 |
| 2 | D7 的锁落 `.rddf/state/plan-topics/<slug>.lock` | 锁用**目录**（原子 `mkdir`）+ 目录内 `owner` 文件；**补释放**：全节点 done ⇒ 父 `rmdir`；checker `lock` 只读报告 | `mkdir` 原子性最优；**不写释放 ⇒ 默认死锁**（metis §2-7 的新发现） |
| 3 | D2 的 checker 落点未指定 | `lib/plan-topics.ts`（纯逻辑）+ `scripts/plan-topic-check.ts`（CLI）+ `tests/plan-topics.test.ts` | 与本仓三段结构一致；新增 `lib/` 文件触发 `EXPECTED.lib` 闸门 ⇒ 同步 |
| 4 | plan 能否执行 checker | **能** —— plan 的 `shell` 首条 `"*": "allow"`（不在 `GUARDED_AGENTS`）⇒ `bun scripts/plan-topic-check.ts` 可跑；**`plan-worker` 进 `GUARDED_AGENTS` 后 shell 首键 deny 且白名单无 `bun`** ⇒ checker **只能父会话跑** | 已实测；与 ADR「父是唯一调度者」一致 |
| 5 | `.rddf/plan-topics/*` 是否覆盖 `nodes/<id>/TODO.md` | **覆盖**（`Wildcard` 的 `*` → `.*` 跨斜杠，已实测）；但**不能**到 node 粒度 ⇒ ADR 残留 #1 成立 | — |
| 6 | 新增文件闸门对 `lib/` / `prompts/` 的覆盖 | 同步 `EXPECTED.lib`（加 `plan-topics.ts`）与 `EXPECTED.prompts`（加 `plan-worker.md`）；**`scripts/`、`tests/` 新文件不在任何清单内（现状，本 change 不扩）** | 闸门设计意图 = 逼一次决定；同时如实登记覆盖面边界 |
| 7 | `docs/adr/` 新文件是否进闸门 | **不进**（平铺盲区）⇒ 保持 ADR 残留 #5 的决定 | 不得反向漂移 |
| 8 | `edit` 白名单路径形态（相对 vs 前导 `*`） | 新两条用**前导 `*` 形态**（`*.rddf/plan-topics/*`？）—— ⚠ **待 builder 用真实写入探针确认匹配口径**（I2⑦⑧⑨ 即该探针）；若相对形态被拒则改带前导 `*` | metis §2-11：两种写法在本仓并存（`:214` 相对 / `:52-53` 带 `*`），宿主匹配口径未验证 ⇒ 用负向探针钉死 |
| 9 | `plan-worker` 是否要 `capability:` 投影块 | **不要**（AC23 只覆盖 build/plan/front，扩面成本 > 收益）；但 V02 的断言用 `capabilityBlock()` **渲染**比对，不手抄期望值 | 避免手抄成第二份真源 |
| 10 | 「派发事前闸门不做」的代价 | 父派发前跑 checker 并把 `{at, exit, graph_rev}` 写进 `attempt[].precheck` ⇒ 「是否跳过检查」**事后可判**（零代码量补一半缺口） | 把 ADR 残留 #2 从「完全不可判」降一级 |
| 11 | `plan-sessions.json` 无消费者 | checker 的 `lock` 子命令做**三方交叉核对**（lock owner / attempt / binding）；定义**原子写**（临时文件 + rename） | 否则它是死产物（metis §2-4） |
| 12 | `graph.json` 并发读（checker 跑时父在写） | 写方约定**原子替换**；checker 遇不可解析 ⇒ `exit 3`（不是 `exit 1`） | 半截 JSON 不得被误判为「无违规」 |
| 13 | `title` agent 无 `subagent` 键 ⇒ V02b fail-open | V02b 增加**无键 agent 闭集**断言（当前恰好 `["title"]`） | 新增无键 agent 会红 ⇒ 逼决定 |
| 14 | 锚点数魔数 23 | **以脚本自报为准**（运行时基线 23）⇒ 判据 = `grep -q "RESULT: OK"` + N ≥ 23 | 魔数必再漂 |

---

## 6. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| **上游语义漂移**（事实 ①–⑦ 押宿主行为） | F1 的 7 条锚点 + `grep -q "RESULT: OK"`（SKIP 不算绿） | 上游变更 ⇒ 重核 ADR 降级表述 |
| `plan-worker` 提权 | 三条 deny + V02b（含无键闭集）+ `GUARDED_AGENTS` 三段式 + 白名单无 `bun` | 从配置移除 `plan-worker` |
| 子写越界到同 topic 其它 node | V10 事后核对（**需基线**）+ ADR 残留 #1 登记 | 收窄白名单（代价：跨 node 协作失效） |
| 单写者被破坏 | D3 单一写者进 prompt + A15 `brief_sha256` + A3 重复 id + A17 孤儿 | checker 报错 + 重派 |
| 锁僵尸 / 永不释放 | 补释放（全 done ⇒ `rmdir`）+ 不自动抢占 + `lock` 只读报告 | 人删锁目录 |
| `plan` 新增 `.rddf/state/plan-sessions.json` 白名单被误用 | 精确单文件（非目录） | 从白名单移除 |
| **工作区既有未暂存改动被误提交** | `cli.json`、`opencode.jsonc.opencode-go` = 前轮残留 ⇒ 提交时**逐文件 stage**，不 `git add -A` | 单独 revert 该两处 |
| 「派发事前闸门」不做 ⇒ 父误派发 | `attempt[].precheck` 留痕 + 事后 checker | 触发条件达成 ⇒ 另立 change |
| **人工 e2e 无法自动化** | I2 步骤逐条可复现 + 证据结构判据 + 主会话执行 | 记为不可自动，如实写进验收报告 |
| **归档门无机械件** | H5 补 `test -f` + verdict 检查（本仓无 archive 钩子） | — |

**回滚三步**：① 移除 `plan-worker` 条目 + plan 的 `edit` 去掉 `.rddf/plan-topics/*` 与 `.rddf/state/plan-sessions.json`；② 删 `prompts/plan-worker.md` + 撤出 `EXPECTED.prompts`；③ 保留 `.rddf/plan-topics/**` 已落盘内容。

---

## 7. 待用户裁决（**不猜**）

1. ~~`plan-topics/` 的 git 归属~~ ⇒ **已定**：按用户「离线产物入 git」全部入库；node id 字符集/黑名单（A1 + E3）保证不被 `.gitignore` 误伤。**剩一个偏好项**：中间态 `TODO.md` 的 diff 噪音是否接受 —— 默认**接受**（不 ignore 中间态，否则跨机器重建失效 —— metis 隐藏意图分析指出 `TODO.md` 必须入库）。
2. **是否接受「派发前无闸门」**：ADR 已列为范围外（技术上可行）。本路线图按「不做 + `precheck` 留痕」实施；若实施中观察到误派发 ⇒ 另立 change。
3. **人工 e2e（I1–I3）由谁执行** ⇒ **已定**（metis P0-6）：**主会话执行、用户终裁**；不得写「按取证不可用处理」。
