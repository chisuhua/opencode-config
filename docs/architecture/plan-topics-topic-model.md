# plan-topics 主题文档 —— plan 侧协作 topic 模型（当前态）

> 状态：**当前态快照**（2026-11-26）｜Primary ADR：[`ADR-plan-multi-session-collaboration`](../adr/ADR-plan-multi-session-collaboration.md)（D1–D11）
>
> 本文只回答「**现在是什么样**」：对象、字段、状态机、判据面、命令面、结构缝（不变量）与已知边界。
> 「**为什么这么定 / 代价是什么**」在 ADR 的对应决策条与选项表，本文不复述、也不与之并列立规。
> 代码真源：`lib/plan-topics.ts`（判据库）· `scripts/plan-topic-check.ts`（CLI）· `prompts/plan.md` 的「多会话协作」节（父会话纪律）· `prompts/plan-worker.md`（子会话纪律）。

## 1. 对象与落点

协作区 `.rddf/plan-topics/<topic-slug>/`（**入 git**）。每文件恰一写者：

| 文件 | 写者 | 内容 |
|---|---|---|
| `TOPIC.md` | 目标、边界、全局约束 + **目标审查三节**（`## 前提与证伪条件` / `## 非目标` / `## 目标审查结论`）+ **`## 结算记录`**（有合成节点且收尾时） |
| `graph.json` | 父（**唯一**） | 节点表（schema 见 §2） |
| `nodes/<id>/BRIEF.md` | 父 | 该节点的输入契约与期望交付 |
| `nodes/<id>/TODO.md` | 该子会话 | 勾选式 todo |
| `nodes/<id>/RESULT.md` | 该子会话 | 结论与交付物（末行哨兵 `## STATUS: COMPLETE`） |

`node id` 合法集：`^[a-z0-9][a-z0-9._-]{0,63}$`，且不得以 `.lock` / `.env` / `.bak` 结尾或以 `backup` 开头（避开既有 `.gitignore` 规则）。

**两类节点（结构同形，判据层靠结构特征区分）**：
- **内容节点**：产出该 topic 的分项结论。
- **合成节点**（id 形状 `^m[1-9][0-9]*$`）：`deps` = 全部内容节点 ⇒ 由子会话产出**一份**跨节点的收敛稿到它自己的 `nodes/<id>/RESULT.md`（父的写面不变 ⇒ §1 表无需新增一行）⇒ 见 `ADR-plan-synthesis-offload` D1/D2。
  - 内容节点的集合 = **全部非 cancelled 且 id 不匹配 `^m[1-9][0-9]*$` 的节点**（**不依赖 `owner` 字段** —— 该字段当前被声明但从不消费，见 `ADR-plan-multi-session-collaboration` 残留 #14）。
  - **合成节点 id 的形状**：`^m[1-9][0-9]*$`（禁前导零；`m01`/`m0` 非法）。⚠ 形似而不合规（`m1-extra`/`m_1`/`m1a`）⇒ B1 载体报违规（防「m 开头的内容节点被静默归类」）；`metrics`/`migration` 不触发 ⇒ 正常作内容节点。
  - **「最新合成节点」的全序**：id 已限形 ⇒ **整数后缀最大**（非字典序 —— `m10` > `m2`）；**无平局**（同号即同 id，被 `duplicate_node_id` 挡；`m01` 已被形状排除）。这是「当前答案节点」的判定基础（V5b）。⚠ **不得**用 `nodes[]` 数组顺序或 attempt 的 `started_at` 作主键（前者无不变式，后者 `claim` 前不存在）。
  - **合成 BRIEF 必须承载根持有的裁决 / 用户澄清 / 约束**（`ADR-plan-synthesis-offload` D4 审查后补）：合成节点**只读** `nodes/*/RESULT.md`，根在协作期的取舍（`question` 澄清 / metis 裁决 / 波次仲裁）**不落在任何 RESULT 里** ⇒ BRIEF（由根写）是根上下文进入合成的**唯一**通道。**可机判形式**：BRIEF 必含 `## 根裁决集`（每条 slug `R1…`、无裁决写「无」）⇒ 判据 = slug 集合包含（BRIEF ⊆ 合成稿 §父的裁决汇总）。⚠ 只覆盖转写保真，**不覆盖**「根是否写全」（不可机判）。
  - **起用阈值**（`ADR-plan-synthesis-offload` D7，**粗口径、非机械闸门**）：**主判据 = 子产出合计 ≳ 50 KB**，辅助 = 内容节点 ≥ 4；总量优先（2 × 60 KB 也建议起）；更小 ⇒ 根单会话读完更便宜（机制固定成本 > 收益）。

运行态（**不入 git**）：`.rddf/state/plan-topics/<slug>.lock`（topic 长锁，D7）· `<slug>.graph.lock`（写互斥短锁，D10）· `.rddf/state/plan-sessions/<session_id>.json`（**每会话一文件**，D5 修订）。

## 2. `graph.json` 当前 schema

```jsonc
{ "version": 1, "topic": "<slug>", "nodes": [{
  "id": "a1", "title": "…", "deps": ["a0"], "owner": "parent|child",
  "status": "pending|blocked_by_deps|done|cancelled",   // 缓存（派生值的快照）
  "progress": "todo|partial|complete",                  // 缓存（纯磁盘派生）
  "attempts": [{
    "agent": "plan-worker", "started_at": "…", "finished_at": "…",   // 缺 finished_at ⇒ 在飞
    "precheck": { "at": "…", "exit": 0, "graph_rev": "<sha256>" },   // 派发前 check + 图结构哈希
    "baseline": "<sha>",
    "input": { "brief_sha256": "<sha256>", "deps": ["a0"], "deliverables": ["…"] },  // fence 快照
    "inputs_reviewed": { "at": "…", "note": "…" }                    // 复核豁免写点
  }],
  "deliverables": ["nodes/a1/RESULT.md"], "brief_sha256": "<可选>",
  "cancelled": { "by": "parent", "reason": "…", "at": "…" }          // 取消声明（D9）
}] }
```

**校验分层**：`cancelled` / `input` / `inputs_reviewed` 的**形状**（字段类型）由 schema 校验 ⇒ 畸形即 `schema_invalid`（exit 3）；`cancelled` 的**取值**（`by === "parent"`、`reason` 非空）由违规码 `cancelled_unattributed` 判 ⇒ 二者分工不可混。未知键**不**被拒绝（旧代码会静默忽略）。

## 3. 派生状态机

```
progress  = 磁盘事实：TODO.md 全勾 ∧ RESULT.md 有实质正文 ⇒ complete（零 checkbox ⇒ todo；缺任一 ⇒ partial）
status    = 门控有效值：progress=complete ∧ deps 全 done ∧ deliverables 非空且存在 ⇒ done
            │ 否则：deps 有未 done ⇒ blocked_by_deps ／ 否则 ⇒ pending
            └ 短路：节点有 cancelled 声明 ⇒ status = cancelled（优先于 done，不要求产物/BRIEF）
在飞      = 末条 attempt 缺 finished_at（**永不进入 status**，只门控派发与收敛）
```

- **缓存两向**：`cache_ahead`（缓存声称 `done`/`complete` 而磁盘不支持）⇒ **阻断**；`cache_behind`（缓存落后）⇒ **info**（并行期必然出现，不改变退出码）。
- `progress` / `status` **正交**：子先干完而依赖未完成 ⇒ `complete` + `blocked_by_deps` 是**合法状态**。

## 4. 判据面（两维：阶段 × 严重度）

| 维 | 取值 | 作用 |
|---|---|---|
| 阶段 `--phase` | `dispatch`（默认之外的另一截面）/ `final`（默认） | 只作用于 `violations` 与退出码：`dispatch` 只对**已到期**节点要 BRIEF、只对 `progress=complete` 节点要交付物、**不产生** `stale_inputs` |
| 严重度 | 阻断 / `info`（`cache_behind`） | `info` 不改变退出码；`--json` 每条违规带 `severity`，`ok` 只看阻断项 |

**违规码闭集**（23 个）：结构 `schema_invalid` / `invalid_node_id` / `duplicate_node_id` / `cycle` / `dangling_dep` / `duplicate_dep` / `orphan_node_dir`；内容 `missing_brief` / `missing_deliverable` / `brief_tampered`；缓存 `cache_ahead` / `cache_behind`；取消 `cancelled_unattributed` / `cancelled_open_attempt` / `cancelled_dep_active`；在飞与 fence `duplicate_open_attempt` / `stale_inputs`；**结算门** `settlement_missing` / `settlement_failed_not_superseded`；**目标审查** `topic_goal_unreviewed`（仅 `dispatch` 且有可派节点）；CLI `out_of_scope` / `empty_topic` / `git_error`。

**结算门**（`ADR-plan-collaboration-hardening` D4，**仅 `final` 口径**）：存在**非 cancelled** 合成节点（`^m[1-9][0-9]*$`）∧ 已收尾（全终态 ∧ 无在飞 ∧ **其余**阻断数 = 0，天然排除本门两码自身）⇒ 要求 `TOPIC.md` 的 `## 结算记录`（`yaml` 围栏块 + 7 必填键：`checked_at` / `synthesis_check_exit` / `blocking` / `answer_node` / `action` / `model_resolution` / `model_id`）。
- `settlement_missing`：记录缺失或字段不全。
- `settlement_failed_not_superseded`：记录 `answer_node` ≠ 当前答案节点（过期）；或 `exit≠0` 且失败集含**任一可修复码**（`synth_conclusion_layer_missing` / `synth_heavy_item_not_in_conclusion` / `synth_brief_no_ruling_set` / `synth_ruling_not_propagated` / V6 三码）⇒ 必须追加更大的合成节点；全不可修复（含**未分类码**，fail-closed）⇒ 须 `action: accept-with-gap` + `gap_reason`。
- **grandfather 例外（判据生效前已结算）**：答案节点 `max(finished_at)` 的 UTC 日期**严格早于** `2026-11-27`（`SETTLEMENT_CRITERIA_SINCE`）⇒ 含可修复码也可 `accept-with-gap`，但 `gap_reason` 抽出的码集合（`/synth_[a-z_]+/g`）必须覆盖 `blocking` 里的可修复码与未分类码；**无已闭合 attempt ⇒ 不适用**。

**退出码**（四值）：`0` 无阻断项（violations 可能非空）／`1` 有阻断违规或操作被拒／`2` 用法错／`3` `graph.json` 缺失或不可解析。

**cancelled 豁免**（两种口径都生效）：cancelled 节点不要求 `BRIEF.md` / 交付物，也**不参与 `stale_inputs`**（取消事务已把其 `input` 快照冻结为当前投影）⇒ 「取消后给 BRIEF 补写取消理由」不会让 `final` 变红。

## 5. 命令面

| 子命令 | 职责 | 关键门 |
|---|---|---|
| `check <topic>` | 判据全量（两口径）+ `converged`/`summary` | — |
| `ready <topic>` | 可派节点 + `in_flight` + `input_drift` | 可派 = deps 全 done ∧ BRIEF 在 ∧ 非 done/cancelled ∧ **不在飞** |
| `scope-check <topic> <node> --baseline <sha>` | 越界写核对 | git 变更集（单飞节点级；并行只做 topic 级 union） |
| `lock <topic>` | 独占锁只读报告 + binding（按 owner **直接构造路径**） | — |
| `add <topic> <node> --title <t> [--deps a,b] [--owner …]` | 按结论**增量加节点**（原子写 + graph 短锁） | 拒：已存在 id / 非法 id / deps 不存在 / **deps 指向 cancelled** / deps 重复 / 成环 |
| `claim <topic> <node>` | **先登记后 spawn**：追加 attempt（含 `input` 快照与 `precheck.graph_rev`） | 已有未闭合 attempt ⇒ 拒；非可派 ⇒ 拒 |
| `close <topic> <node>` | 闭合末条 attempt（`finished_at`） | 无未闭合 attempt ⇒ 拒且不写 |
| `reap <topic> <node> --confirm` | 接手：闭合 + 写 `inputs_reviewed`（接手即复核） | **必须** `--confirm`（非交互；不做 TTL 自动接管） |
| `cancel <topic> <node> --reason <…> [--cascade\|--detach <id>…]` | 一次原子写内：闭合 attempt → 冻结投影 → 置 `cancelled` → 回填缓存 → 消解下游 | 禁止取消已 `done`；活跃下游未显式处置 ⇒ 拒 |

写侧（`claim`/`close`/`reap`/`cancel`）共用 per-topic **短**写锁（原子 `mkdir`、硬超时回收、**不按 mtime 判死**）+ 临时文件 + rename 原子写。

## 6. 收敛（`converged`）

```
converged ⇔ 零阻断违规（恒 final 口径） ∧ 每节点派生 status ∈ {done, cancelled} ∧ 无在飞
summary   = { done[], cancelled[{id,reason,at}], in_flight[{node,started_at,liveness_stale}],
              input_drift[{node,changed}], ready[], blocking[{code,node,detail}], needs_review[{node,changed}] }
```

- **`needs_review` 与 `converged` 正交**：它是待复核桶（未复核的 `stale_inputs`），**不进** `converged` 布尔。
- **口径恒定**：`converged`/`summary` **恒按 final 派生** ⇒ `dispatch` 下可出现 `ok=true ∧ converged=false`（健康但未完），**这是刻意语义**。
- **锁不进判据**（父自己持锁是正常态）；**`input_drift` 不进布尔**（在飞已使 `converged=false`）。
- **定位**：它是**调度信号**（「还有没有未完成的活」），**不是**交付信号（「这件事做完了吗」—— 需对照 `TOPIC.md` 的目标段做语义理解 ⇒ 不可机判）。

## 7. fence 与溯源

- **fence（节点级）**：`claim` 时把 `{BRIEF 哈希, deps, deliverables}` 写进 `attempt.input`；`check --phase final` 重算并与快照**逐成分 diff** ⇒ 不等 ⇒ `stale_inputs`（detail 指名 `brief`/`deps`/`deliverables`）。父写 `inputs_reviewed` ⇒ 豁免。**兄弟节点变更不触发**（节点级投影 ⇒ 兄弟免疫）。在飞 attempt 的漂移只进 `ready --json` / `summary.input_drift`（info）。
- **溯源（图级）**：`precheck.graph_rev` = 图结构投影哈希（节点 id / deps / deliverables / BRIEF 哈希；**排除** `status` / `progress` / `attempts` ⇒ join 回填零污染）。

## 8. 并发与落点

| 机制 | 路径 | 语义 |
|---|---|---|
| topic 长锁 | `.rddf/state/plan-topics/<slug>.lock` | 同 topic 独占（协议级；释放 = 全节点 done/cancelled 后 `rmdir`；僵尸须人确认） |
| graph 短锁 | `.rddf/state/plan-topics/<slug>.graph.lock` | `claim`/`close`/`reap`/`cancel` 的写互斥（自动；硬超时回收） |
| 运行态绑定 | `.rddf/state/plan-sessions/<session_id>.json` | **每会话一文件** ⇒ 两个根会话不互相覆盖；`lock` 按 owner 直接构造路径读取 |

## 9. 不变量（结构缝）

1. **单一写者**（协议级）：`graph.json` 只父写；子只写自己 node 的 TODO/RESULT。权限只到 topic 树粒度 ⇒ 靠协议 + 事后核对，不声称权限强制。
2. **取消是声明意图**：`cancelled` 是派生公式的**输入**（与 `deps`/`owner` 同族），不是 status 自述。
3. **在飞永不进 `deriveStatus`**：status 保持纯磁盘/依赖派生。
4. **cancelled 不满足下游 deps**：活跃节点依赖已取消节点 ⇒ `cancelled_dep_active`（父必须级联取消或摘边）。
5. **锁与收敛正交**：`converged` 不看锁。
6. **`converged` 恒 final 口径**：`--phase` 只改 `violations`/退出码。
7. **依赖闭集边界**：`.rddf/plan-topics/**` **不在** `plan_ref` accepted roots ⇒ 协作产物须物化成 `.rddf/plans/<slug>.md` 才能派工程。
8. **派生优先于缓存（磁盘是权威）**：`graph.json` 的 `status` / `progress` 只是缓存快照 ⇒ 判据只按派生值；分叉按方向定级（**声称完成** = 阻断、**落后** = info）。

## 10. 已知边界（如实登记，不假装有闸门）

- **写域**只到 topic 树粒度（宿主 `subagent` 不传 per-session permissions）⇒ 同 topic 内跨 node 写权限上允许。
- **取消中断不了在飞 worker**：`cancel` 只改派生态（闭合 attempt + 置 `cancelled` + 消解下游），**没有** in-flight 中断面 ⇒ 已取消节点的在飞 worker 可能继续写产物（作为审计痕迹保留；派生态短路优先于 `done` ⇒ 不影响门控）。
- **无自动接管**：`liveness_stale`（`TODO.md` mtime 新鲜度）只是显示提示；worker 写没有围栏 ⇒ TTL 自动重派会造双活体写者。**僵尸 attempt**（`claim` 与 spawn 之间父崩溃）同理 —— 只能人工 `reap --confirm`。
- **交付信号不可机判**（见 §6 定位）；「本轮要什么」的解释权仍留在父的上下文，但**目标审查有三节结构载体**（`ADR-plan-collaboration-hardening` D5）：`TOPIC.md` 的 `## 前提与证伪条件` / `## 非目标` / `## 目标审查结论`，`--phase dispatch` 在**存在可派节点**时要求三节在场且非空（`topic_goal_unreviewed`）⇒ 判的是「写下来了」，**不判**前提真假或目标对错。
- **`scope-check` 并行下无法按节点归因**（git 不记录写入者）⇒ 节点级核对在并行下**必然假阳性**（把兄弟节点的产物算成自己的越界）。⚠ **当前实现只有单节点口径**（`allowedPrefix` 恒为 `nodes/<nodeId>`，`scripts/plan-topic-check.ts:233-240`）⇒ §5 表中「并行只做 topic 级 union」与 ADR V10 所述的 union 口径**在 CLI 中尚未实现** ⇒ 并行时应**暂不做** `scope-check`（或仅做人工 `git status` 核对），否则告警会被噪声淹没。
- **父可批量标 `cancelled` 使 `converged=true`** ⇒ 该判据定位为调度信号；缓解 = `cancelled` 桶逐条列 `{id,reason,at}` + D9 两条既有约束（`cancelled_unattributed` 强制编理由、`cancelled_dep_active` 强制连带消解）。
- **`owner` 字段不被消费**：`owner: "parent" | "child"` 只做枚举校验（`lib/plan-topics.ts:197-199`），判据库与 CLI **零消费** ⇒ `owner: "parent"` 的节点**仍会出现在 `ready` 且可被 `claim` 派发**（ADR D2 的承诺「父自己做」未生效）⇒ 处置见 ADR 残留 #14。
- **topic 独占锁无机械强制**：`lock` 子命令是**纯只读报告**（`scripts/plan-topic-check.ts:286-320`），写命令只取 graph 短锁 ⇒「同 topic 独占」是**协议约定**而非机械保证；且文档写的释放步骤（`rmdir` 该锁目录）对含 `owner` 文件的目录**必然失败** ⇒ 锁泄漏已在盘上发生（`e2e-probe.lock` 自 2026-11-20 未释放）。⇒ 处置见 ADR 残留 #15。
- **两个字段不被消费**：`attempts[].baseline`（死字段，全仓无写入点）与 `precheck`（`claim` 写、checker 从不读 ⇒「派发前 check 必须 exit 0 才派」无机械强制）⇒ 处置见 ADR 残留 #16 / #17。
- **合成产物的位置 = 合成节点自己的 `RESULT.md`**（`ADR-plan-synthesis-offload` D2）：当 topic 需要一份跨节点的合并产物时，**在 `graph.json` 里加一个「合成节点」**（id 形状 `^m[1-9][0-9]*$`，`deps` = 全部内容节点），由子会话产出 `nodes/<m-id>/RESULT.md` ⇒ 父的写面**不变**（§1 表无需新增一行）⇒ 合成稿**仍在 topic 树内** ⇒ **仍不进** `PLAN_REF_ROOTS` ⇒ 「讨论稿 ≠ 可执行计划」的性质保持。父可读该文件作为 topic 级答案（成本 = 合成稿体积，非全部子产出体积）。⚠ **作者 = 合成节点，背书 = 父的采纳判断**（后者不可机判，与 §6 的「调度信号非交付信号」一致）。⚠ **父不修订合成稿**（修订 ⇒ 双写者）；合成质量不达标时走**追加式**（新增 `m2`，`m1` 留作审计痕迹；惯例取最新非 cancelled 的合成节点为答案 —— **「最新」按 `^m[1-9][0-9]*$` 的整数后缀取最大**，见 §1）。⚠ **合成 BRIEF 必须承载根持有的裁决/澄清/约束**（合成只读 `nodes/*/RESULT.md`，根上下文不进 BRIEF 就进不了合成 ⇒ `§父的裁决汇总` 无从落实；可机判形式 = `## 根裁决集` 的 slug 集合包含，见 §1 与 ADR D4）。⚠ **起用阈值**：**总量 ≳ 50 KB 为主**、节点数 ≥ 4 为辅助（ADR D7，粗口径）。⇒ 处置见 `ADR-plan-multi-session-collaboration` 残留 #19（**已闭合**）。

- **`add` 的 `--deps` 建错没有修正通道**（CLI 子命令闭集里无改 `deps` 的入口；父手改 `graph.json` 破写锁协议 ⇒ 不做）⇒ **规范操作 = `cancel` + 用新 id 重建**：被 cancel 的节点**留作审计痕迹**（cancelled 短路 ⇒ 它不再要求交付物）；⚠ **下游回不去** —— `--detach` **只删边、没有 CLI 能把边加回** ⇒ 摘边后下游**不再等**该节点、而**图仍是绿的**（`cancelled_dep_active` 那道闸正是被它拆掉的）⇒ 下游要么 `--cascade` 后**一并用新 id 重建**（deps 指向新 id），要么确认「本就与本节点无依赖关系」才 `--detach`；已 `done` 的节点 `cancel` 硬拒 ⇒ 走「追问（已 done）」路径（`add` 新节点）。

## 11. 代码地图

| 面 | 路径 |
|---|---|
| 判据库（真源） | `lib/plan-topics.ts` |
| CLI | `scripts/plan-topic-check.ts` |
| L1 语义测试 | `tests/plan-topics.test.ts`（判据库 + CLI 契约）· `tests/plan-topics-dag.test.ts`（拓扑/门控/动态改图/并发/收敛）· `tests/plan-topics-lifecycle.test.ts`（V16–V36） |
| 父/子会话纪律 | `prompts/plan.md` §多会话协作 · `prompts/plan-worker.md` |
| 回滚可达性 | `.rddf/rollback/plan-topics.json`（含 `retire[]` 结构化退役）· `.rddf/rollback/registry.json` 的 `plan-topics` 条目 |
| 上游语义锚点 | `scripts/check-upstream-anchors.sh` 的 P1–P6（含 P5b） |
| **合成节点（外置）** | 决策：`docs/adr/ADR-plan-synthesis-offload.md`（合成节点 = 普通 node；产物落其自身 RESULT.md；D7 起用阈值）｜载体（B1 待落地）：`scripts/plan-synthesis-check.ts` + `tests/plan-synthesis.test.ts`｜**判据前置（B1 步骤② 同批）**：`prompts/plan-worker.md:28`（**唯一**落点；全仓无 BRIEF 模板）必须落「严重度标注带稳定 token」的产出纪律 —— 未落则 V4 退化为语义匹配、不可机判；且该文件是**全部内容节点**的 RESULT 契约、存量不追溯｜验收：`.rddf/reviews/plan-synthesis-offload-ab-verdict*.md`（C 档 / A 档） |

## 12. 指针

- 决策：ADR D1–D11（D9 取消 / D10 在飞与 fence / D11 收敛 / D5 修订）
- **合成外置**：ADR `ADR-plan-synthesis-offload`（D1 合成进 DAG / D2 产物位置 + 「最新合成节点」全序 / D3 模型阶梯 / D4 结论层硬判据 + 两类合成输入来源 / D6 落地顺序 / D7 起用阈值）—— 合成节点惯例见 §1
- 审稿：`.rddf/reviews/adr-plan-multi-session-collaboration-review-*.md`（含 D9/D10/D11/D5/锚点事故）
- 验收：`.rddf/reviews/plan-topics-d9-d10-d11-verify.md`（+ `…-f1-closure.md`）· `.rddf/reviews/plan-topics-pt1-runtime.md`（真宿主）
- 版本史：`docs/CHANGELOG.md` v2.71–v2.75
- 测试方法论：`docs/test-authoring.md` §10（真运行时 e2e 触发）/ §11（计数口径）· `docs/guard-authoring.md` §8/§9
