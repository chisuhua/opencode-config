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

## What Changes

1. **把 4 个根下点文件收拢**进 `.rddf/state/verifier/`（一个目录覆盖全部 skill 写入）：
   `.ac-verdict-<change>.json` / `.ac-verification.jsonl` / `.ac-verifier-blocked.jsonl` / `rdd-verify-context-<change>.json`
   ⇒ 连带迁移**读路径**（`archive_gate_check` 读 verdict cache、`rdd-doctor` 读 blocked log）。
2. **删除悬空指针** `.rddf/state/.verifier-report.json` 的声明（或补上真正的写入方）。
3. **核对 owns 清单**：`VERIFIER_OWNS_PATHS`（`lib/delegate-core.ts`，6 项）与 `SKILL.md:28-32` 是否仍一致（**加第 7 个路径时仓内守卫不会红** —— 这一条是人工同步残留，本项负责收尾）。
4. 收拢完成后，`ADR-class-write-scope-alignment` D1b 的**过渡期规则**可退役（`verifier` 类后端直写全部 skill 状态），并把 `prompts/build.md` 的过渡期段与 symptom-bridge 句改为「历史说明」。

## Acceptance

| 判据 | 类型 |
|---|---|
| 4 个根下点文件全部落在 `.rddf/state/verifier/` 下，且 `archive_gate_check` / `rdd-doctor` 的**读路径**同步迁移 | 结构（读代码核对） |
| `.rddf/state/.verifier-report.json` 的悬空声明已处理（删除或补上写入方） | 结构 |
| **owns 清单核对**：`lib/delegate-core.ts` 的 `VERIFIER_OWNS_PATHS`（6 项）与 `SKILL.md:28-32` 的 owns **逐项一致**（有第 7 项则同步常量 + 守卫断言） | 结构 + 人工核对记录 |
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
