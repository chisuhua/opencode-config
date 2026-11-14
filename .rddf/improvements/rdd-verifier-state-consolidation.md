# rdd-verifier-state-consolidation — 产品侧：把 verifier 的状态文件收拢进 `verifier/` 子目录

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：`docs/adr/ADR-class-write-scope-alignment.md`（D1b 过渡期规则 + D3-1「残留显式承认」）
> 归属：**产品侧**（`~/.agents/skills/rdd-workflow` 的 `rdd-verifier` skill 与 `archive_gate_check`）—— 本仓**无权限面**，本文件是**待办登记**（stub），不是本仓的实施计划
> 关联 change：`class-write-scope-alignment`（AC18 要求本 stub 存在且其 Acceptance 含 owns 核对项）
> planner 审查：**待办登记**，未过 metis（实施前须补）

## Why

`rdd-verifier` skill 的 `role.boundaries.owns` 是 **6 个路径**，其中**四个**躺在 `.rddf/state/` **根**下：

| owns 项 | 位置 | 消费者 |
|---|---|---|
| `.rddf/state/verifier/<name>.json` | ✅ 已在 `verifier/` 子目录内 | skill 自身（loop state） |
| `.rddf/state/verifier/<name>.audit.jsonl` | ✅ 同上 | skill 自身（审计） |
| `.rddf/state/.ac-verdict-*.json` | ❌ 根下 | **`archive_gate_check`**（归档门输入） |
| `.rddf/state/.ac-verification.jsonl` | ❌ 根下 | skill / 归档门 |
| `.rddf/state/.ac-verifier-blocked.jsonl` | ❌ 根下 | `rdd-doctor` |
| `.rddf/state/rdd-verify-context-<change>.json` | ❌ 根下 | skill（staged 上下文） |

⇒ 后果：① 被派发的 `verifier` 类**只能**写 `verifier/` 子目录（`classAllowRoots` 的上限）⇒ skill 的 Step 5 写根下点文件时被 `Permission denied` ⇒ **过渡期必须由主会话代跑状态机**（`ADR-class-write-scope-alignment` D1b）；② 状态文件**散在两处** ⇒ 清理 / 归档 / 备份要分别处理。

另有一处**悬空指针**：`SKILL.md:49` 声明 `.rddf/state/.verifier-report.json`，但全 skills 目录**无任何组件写它**（`rddf_session_hooks.sh` 只把它登记进 `sessions.json`）⇒ 清理时一并处理。

## 可执行部分（本仓已做 / 产品侧待做）

> 本节把「产品侧才能改的部分」与「本仓现在就能做的部分」分开 —— 本仓**无 `~/.agents/skills/**` 的写权限**，
> 所以能做的只有：① 核对证据 ② **收拢就绪性证明** ③ 逐文件改动清单 ④ 本仓收尾清单。

### ① 状态路径核对（2026-11-14 实跑）

| 来源 | 路径 | 在 `VERIFIER_OWNS_PATHS` 内？ |
|---|---|---|
| `owns:`（`SKILL.md:29`） | `.rddf/state/verifier/<name>.json` | ✅ |
| `owns:`（`:30`） | `.rddf/state/verifier/<name>.audit.jsonl` | ✅ |
| `owns:`（`:31`） | `.rddf/state/.ac-verdict-*.json` | ✅ |
| `owns:`（`:32`） | `.rddf/state/.ac-verification.jsonl` | ✅ |
| **实际写入但未声明**（`:415` halted 审计） | `.rddf/state/.ac-verifier-blocked.jsonl` | ✅ |
| **实际写入但未声明**（`scripts/run_verification.sh:7` staged） | `.rddf/state/rdd-verify-context-<change>.json` | ✅ |
| **悬空指针**（`:49` 声明，**无写入方**） | `.rddf/state/.verifier-report.json` | ❌（未纳入，待清理） |

⇒ 常量与 skill 的**实际写入面**一致（6 项）；`owns:` 只声明了其中 4 项（那 2 项是 skill 自己没声明的）。
核对命令（本机可跑，CI 不可 —— skill 在仓外）：

```bash
sed -n '28,33p' ~/.agents/skills/rdd-verifier/SKILL.md   # owns: 块
grep -rn "\.ac-\|rdd-verify-context\|\.verifier-report" ~/.agents/skills/rdd-verifier/
grep -n "VERIFIER_OWNS_PATHS" -A 10 lib/delegate-core.ts  # 本仓常量
```

### ② 收拢就绪性证明（本仓已做，单测）

`tests/delegate-core.test.ts` 的「**收拢就绪（ready）**」用例证明：4 个根下点文件搬到
`.rddf/state/verifier/` 后**已在 verifier 类的允许集与 scope 授权内** ⇒ 产品侧迁移时**本仓无需 flag day**；
同时断言**收拢前**的根下路径**仍拒**（⇒ 不是「整目录放开」）。

### ③ 产品侧逐文件改动清单（待产品仓执行）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `SKILL.md:260`（**写入 verdict cache**） | 路径 `.rddf/state/.ac-verdict-<change>.json` ⇒ `.rddf/state/verifier/.ac-verdict-<change>.json` |
| 2 | `SKILL.md:280`（**追加 audit log**） | `.rddf/state/.ac-verification.jsonl` ⇒ `.rddf/state/verifier/.ac-verification.jsonl` |
| 3 | `SKILL.md:415`（halted 审计） | `.rddf/state/.ac-verifier-blocked.jsonl` ⇒ `.rddf/state/verifier/.ac-verifier-blocked.jsonl` |
| 4 | `SKILL.md:325` / `:118`（**读** SHA cache） | 同步迁移 |
| 5 | `scripts/classify_failure.sh:18`（读 cache） | 同步迁移 |
| 6 | `scripts/run_verification.sh:7`（staged context） | 同步迁移 |
| 7 | **`archive_gate_check`**（读 verdict cache 判定归档门） | **最容易漏**：只改写入不改读取 ⇒ 归档门永远读不到 cache ⇒ 判定失效（必须同批改） |
| 8 | `rdd-doctor`（读 `.ac-verifier-blocked.jsonl`） | 同步迁移 |
| 9 | `SKILL.md:29-32` 的 `owns:` | 收拢后 4 项实际变成 `.rddf/state/verifier/.ac-*` ⇒ 更新声明（并把 2 个未声明项补进去） |
| 10 | `SKILL.md:49` 的 `.verifier-report.json` | **悬空指针**：删除声明或补上写入方 |

### ④ 本仓收尾清单（产品侧收拢**之后**才做）

| # | 落点 | 改动 |
|---|---|---|
| a | `prompts/build.md` §verifier 产出契约 的**过渡期规则**（四要素） | 改为「历史说明」；`verifier` 类**后端直写**全部 skill 状态（不再由主会话代跑） |
| b | 同节的**症状桥接句**（`Permission denied` = 本契约生效） | 降级为历史注记（收拢后不再触发） |
| c | `prompts/front.md` §3.1 的**代跑处置提示** | 删除（不再需要） |
| d | `ADR-class-write-scope-alignment` 的 **D1b** | 标注「已退役（`rdd-verifier-state-consolidation` 完成）」+ 关联指针 |
| e | `lib/delegate-core.ts` 的 `VERIFIER_OWNS_PATHS` | 收拢后 4 项改 `.rddf/state/verifier/.ac-*` 形态；`VERIFIER_BACKLOG_ROOT_FILES` 自然变空 |
| f | `tests/config-guards.test.ts` 的 AC18 / AC6 断言 | `VERIFIER_BACKLOG_ROOT_FILES` 长度 4 ⇒ 0（自动，因为是派生） |
| g | `docs/CHANGELOG.md` | 一条「verifier 状态收拢 + 过渡期退役」 |
| h | **`rdd-workflow-e2e`** | 新增一条运行时用例：verifier 类跑 `rdd-verifier` 的 Step 5 **不再** `Permission denied`（收拢前应是「交回」，收拢后应是「落盘成功」）|

### ⑤ 为什么现在不需要动本仓代码

- `verifier` 的允许集已经是 `.rddf/state/verifier`（**目录级前缀**）⇒ 收拢后的 `.ac-*` 文件天然在内；
- `scope` 义务（`prompts/plan.md`）也已是「必须同时包含 `.rddf/reviews` 与 `.rddf/state/verifier`」；
- ⇒ 产品侧迁移时本仓**零改动**（②的 ready 单测即为证据），本仓只需在收拢完成后做 ④ 的收尾。

## What Changes

1. **把 4 个根下点文件收拢**进 `.rddf/state/verifier/`（一个目录覆盖全部 skill 写入）：
   `.ac-verdict-<change>.json` / `.ac-verification.jsonl` / `.ac-verifier-blocked.jsonl` / `rdd-verify-context-<change>.json`
   ⇒ 连带迁移**读路径**（`archive_gate_check` 读 verdict cache、`rdd-doctor` 读 blocked log）。
2. **删除悬空指针** `.rddf/state/.verifier-report.json` 的声明（或补上真正的写入方）。
3. **核对 owns 清单**：`VERIFIER_OWNS_PATHS`（`lib/delegate-core.ts`，6 项）与 `SKILL.md:28-32` 是否仍一致（**加第 7 个路径时仓内守卫不会红** —— 这一条是人工同步残留，本项负责收尾）。
4. **（演进项）文档投影 ↔ 代码常量的结构比对**：把 spec 3.1 表 / `prompts/build.md` 运行身份表 / `prompts/plan.md` 选类表的 verifier 行，从「散文正则守卫」升级为**解析表格行 ↔ `VERIFIER_ALLOW_ROOTS` 集合的结构比对**（散文正则降为兜底）。
   - 动机：`class-write-scope-alignment` 的 AC14 是**枚举式措辞**假设（仅 / 只允许 / 只能 / 只有 / 限于）⇒ 新措辞会静默绕过（2026-11-14 实测漏掉三处，其中一处措辞是「只有」）。
   - 先例：`docs/CHANGELOG.md` v2.20 ④（`priority_blocked` 提升为导出常量、守卫不再手抄）与 accepted roots ↔ `PLAN_REF_ROOTS` 的双向校验。
5. 收拢完成后，`ADR-class-write-scope-alignment` D1b 的**过渡期规则**可退役（`verifier` 类后端直写全部 skill 状态），并把 `prompts/build.md` 的过渡期段与 symptom-bridge 句改为「历史说明」。

## Acceptance

| 判据 | 类型 |
|---|---|
| 4 个根下点文件全部落在 `.rddf/state/verifier/` 下，且 `archive_gate_check` / `rdd-doctor` 的**读路径**同步迁移 | 结构（读代码核对） |
| `.rddf/state/.verifier-report.json` 的悬空声明已处理（删除或补上写入方） | 结构 |
| **状态路径清单核对**：`lib/delegate-core.ts` 的 `VERIFIER_OWNS_PATHS`（6 项）与 skill 的**实际写入路径**逐项一致 —— 其中 **4 项是 `owns:` 声明**（`SKILL.md:29-32`）、**2 项是实际写入但未声明**（`.ac-verifier-blocked.jsonl` @ `SKILL.md:415`、`rdd-verify-context-<change>.json` @ `scripts/run_verification.sh:7`）。有第 7 项则同步常量 + 守卫断言 | 结构 + 人工核对记录 |
| `ADR-class-write-scope-alignment` D1b 的过渡期规则退役（prompt 段改为历史说明 + 后端直写路径可用） | 结构 |
| `verifier` 类后端跑 `rdd-verifier` 的 Step 5 **不再**吃 `Permission denied`（端到端验证） | 手工（e2e） |

## Capabilities

- **新增**：verifier 状态文件的**单一目录**（`.rddf/state/verifier/`）—— skill 写入面与 `verifier` 类允许集**完全对齐**。
- **移除**：过渡期的「主会话代跑状态机」这一间接层（减少单写者被打破的风险）。
- **不改**：契约引擎的豁免语义、注入文案、审计 CLI 的口径；`verifier` 类的**产品落点**（`.rddf/reviews/`）不变。

## Impact

| 面 | 影响 |
|---|---|
| `~/.agents/skills/rdd-workflow`（产品仓） | skill 的写入路径 + `archive_gate_check` / `rdd-doctor` 的读路径 + `SKILL.md` owns 声明 |
| 本仓 `~/.config/opencode` | `VERIFIER_OWNS_PATHS` 常量同步（若 owns 有变）+ prompt 的过渡期段退役 |
| 行为 | `verifier` 类后端可直写全部 skill 状态（不再需要主会话代跑） |
| 代价 | **迁移期兼容**：旧路径的残留文件要读得到（一次性迁移脚本或读路径 fallback） |
| 风险 | 归档门读路径漏迁 ⇒ 归档判定失效（**必须连带核对 `archive_gate_check`**） |

## 依赖与顺序

1. 依赖 `ADR-class-write-scope-alignment`（**Accepted**）与 change `class-write-scope-alignment`（实施中）。
2. 顺序：产品侧收拢（写入路径 → 读路径）⇒ owns 核对 ⇒ 本仓常量同步 ⇒ 过渡期规则退役 ⇒ e2e 验证。
3. 涉及**产品仓**改动 ⇒ 走 rdd-workflow 自身的评审流程（不在本仓的 oracle → critic 口径内）。
