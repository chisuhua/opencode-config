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
| `TOPIC.md` | 父 | 目标、边界、全局约束 |
| `graph.json` | 父（**唯一**） | 节点表（schema 见 §2） |
| `nodes/<id>/BRIEF.md` | 父 | 该节点的输入契约与期望交付 |
| `nodes/<id>/TODO.md` | 该子会话 | 勾选式 todo |
| `nodes/<id>/RESULT.md` | 该子会话 | 结论与交付物（末行哨兵 `## STATUS: COMPLETE`） |

`node id` 合法集：`^[a-z0-9][a-z0-9._-]{0,63}$`，且不得以 `.lock` / `.env` / `.bak` 结尾或以 `backup` 开头（避开既有 `.gitignore` 规则）。

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

**违规码闭集**（20 个）：结构 `schema_invalid` / `invalid_node_id` / `duplicate_node_id` / `cycle` / `dangling_dep` / `duplicate_dep` / `orphan_node_dir`；内容 `missing_brief` / `missing_deliverable` / `brief_tampered`；缓存 `cache_ahead` / `cache_behind`；取消 `cancelled_unattributed` / `cancelled_open_attempt` / `cancelled_dep_active`；在飞与 fence `duplicate_open_attempt` / `stale_inputs`；CLI `out_of_scope` / `empty_topic` / `git_error`。

**退出码**（四值）：`0` 无阻断项（violations 可能非空）／`1` 有阻断违规或操作被拒／`2` 用法错／`3` `graph.json` 缺失或不可解析。

**cancelled 豁免**（两种口径都生效）：cancelled 节点不要求 `BRIEF.md` / 交付物，也**不参与 `stale_inputs`**（取消事务已把其 `input` 快照冻结为当前投影）⇒ 「取消后给 BRIEF 补写取消理由」不会让 `final` 变红。

## 5. 命令面

| 子命令 | 职责 | 关键门 |
|---|---|---|
| `check <topic>` | 判据全量（两口径）+ `converged`/`summary` | — |
| `ready <topic>` | 可派节点 + `in_flight` + `input_drift` | 可派 = deps 全 done ∧ BRIEF 在 ∧ 非 done/cancelled ∧ **不在飞** |
| `scope-check <topic> <node> --baseline <sha>` | 越界写核对 | git 变更集（单飞节点级；并行只做 topic 级 union） |
| `lock <topic>` | 独占锁只读报告 + binding（按 owner **直接构造路径**） | — |
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
- **交付信号不可机判**（见 §6 定位）；不存在「本轮目标集合」载体 —— 「本轮要什么」的解释权留在父的上下文。
- **`scope-check` 并行下无法按节点归因**（git 不记录写入者）⇒ 节点级核对在并行下**必然假阳性**（把兄弟节点的产物算成自己的越界）。⚠ **当前实现只有单节点口径**（`allowedPrefix` 恒为 `nodes/<nodeId>`，`scripts/plan-topic-check.ts:233-240`）⇒ §5 表中「并行只做 topic 级 union」与 ADR V10 所述的 union 口径**在 CLI 中尚未实现** ⇒ 并行时应**暂不做** `scope-check`（或仅做人工 `git status` 核对），否则告警会被噪声淹没。
- **父可批量标 `cancelled` 使 `converged=true`** ⇒ 该判据定位为调度信号；缓解 = `cancelled` 桶逐条列 `{id,reason,at}` + D9 两条既有约束（`cancelled_unattributed` 强制编理由、`cancelled_dep_active` 强制连带消解）。
- **`owner` 字段不被消费**：`owner: "parent" | "child"` 只做枚举校验（`lib/plan-topics.ts:197-199`），判据库与 CLI **零消费** ⇒ `owner: "parent"` 的节点**仍会出现在 `ready` 且可被 `claim` 派发**（ADR D2 的承诺「父自己做」未生效）⇒ 处置见 ADR 残留 #14。
- **topic 独占锁无机械强制**：`lock` 子命令是**纯只读报告**（`scripts/plan-topic-check.ts:286-320`），写命令只取 graph 短锁 ⇒「同 topic 独占」是**协议约定**而非机械保证；且文档写的释放步骤（`rmdir` 该锁目录）对含 `owner` 文件的目录**必然失败** ⇒ 锁泄漏已在盘上发生（`e2e-probe.lock` 自 2026-11-20 未释放）。⇒ 处置见 ADR 残留 #15。
- **两个字段不被消费**：`attempts[].baseline`（死字段，全仓无写入点）与 `precheck`（`claim` 写、checker 从不读 ⇒「派发前 check 必须 exit 0 才派」无机械强制）⇒ 处置见 ADR 残留 #16 / #17。
- **topic 树内没有留给「父的合成产物」的位置**：单一写者表（§1）只给了父 `TOPIC.md` / `graph.json` / `BRIEF.md` ⇒ 父若把 N 个节点的合并产物放出来，唯一去处是 `.rddf/plans/<slug>.md` ⇒ **改变其语义**（从「离线讨论产物」变成「正式件」⇒ 进 `PLAN_REF_ROOTS` ⇒ 可被派工程），与本机制「讨论稿 ≠ 可执行计划」的定位冲突 ⇒ 建议在 topic 树内增设父写的 `SYNTHESIS.md`（`build-worker-design` 场景已按此落盘，为第一个实例）。

## 11. 代码地图

| 面 | 路径 |
|---|---|
| 判据库（真源） | `lib/plan-topics.ts` |
| CLI | `scripts/plan-topic-check.ts` |
| L1 语义测试 | `tests/plan-topics.test.ts`（判据库 + CLI 契约）· `tests/plan-topics-dag.test.ts`（拓扑/门控/动态改图/并发/收敛）· `tests/plan-topics-lifecycle.test.ts`（V16–V36） |
| 父/子会话纪律 | `prompts/plan.md` §多会话协作 · `prompts/plan-worker.md` |
| 回滚可达性 | `.rddf/rollback/plan-topics.json`（含 `retire[]` 结构化退役） |
| 上游语义锚点 | `scripts/check-upstream-anchors.sh` 的 P1–P6（含 P5b） |

## 12. 指针

- 决策：ADR D1–D11（D9 取消 / D10 在飞与 fence / D11 收敛 / D5 修订）
- 审稿：`.rddf/reviews/adr-plan-multi-session-collaboration-review-*.md`（含 D9/D10/D11/D5/锚点事故）
- 验收：`.rddf/reviews/plan-topics-d9-d10-d11-verify.md`（+ `…-f1-closure.md`）· `.rddf/reviews/plan-topics-pt1-runtime.md`（真宿主）
- 版本史：`docs/CHANGELOG.md` v2.71–v2.75
- 测试方法论：`docs/test-authoring.md` §10（真运行时 e2e 触发）/ §11（计数口径）· `docs/guard-authoring.md` §8/§9
