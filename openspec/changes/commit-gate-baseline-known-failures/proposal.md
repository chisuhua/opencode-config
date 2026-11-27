# commit-gate-baseline-known-failures —— 门禁声明支持 baseline / known_failures

> **登记来源**：`.rddf/improvements/commit-gate-baseline-known-failures.md`（5 段草稿 · metis 1 轮已修订）
> **判据真源**：`docs/adr/ADR-commit-verification-gate.md` 的 **D10 段**（Status Update 2026-11-27，
> Status **Accepted**）+ **Verification V20–V25**（唯一真源）。本文件 `## 验收标准` 只做
> **AC 编号 ↔ V 编号映射**与状态登记，**不复制判据正文**（避免第二份可漂移副本）。
> **决策依据**：同 ADR 的 **D10**（oracle 1 轮 ⇒ BLOCK，6 条全采纳；critic 2 轮 ⇒ REJECT 2 BLOCKER ⇒
> 复审 `APPROVE_WITH_CONDITIONS`，0 BLOCKER；审稿报告 `.rddf/reviews/commit-verification-gate-su-baseline-review.md`）。
> **执行路径**：机制面（`lib/commit-gate.ts` + `plugins/commit-gate.ts` + `scripts/**` + `tests/**`）⇒
> **builder**；治理面（ADR D9 表 + 主题文档 §2.8.8）⇒ **architect**（D9⑰ 登记段落）⇒
> **两段顺序**：先治理面文字（不改计数）→ 再计数与守卫（三处载体同批齐备）⇒ 中间态红**不接受**。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`：canonical 前置不存在 ⇒ 走**内置流程**
> （本 `proposal.md` 由 planner 起草；`design.md` / `tasks.md` 归 builder）。

## Why

D2① 是硬门：任一验证命令非 0 ⇒ **拒绝提交** ⇒ **有存量红的仓根本不能声明门禁** ⇒ 门禁在有历史债的
仓里只能**关着**，且「关着」对 agent **不可见**（commit 照样过，无痕迹说明三判据一条都没跑）。

实测（CppTLM，2026-11-26 → 2026-11-27）：`scripts/build/format.sh --check` 的存量红由 **5 个文件**增至
**12 个文件**（单点观察，非速率）⇒ 「先把存量红修完」是**持续**成本 ⇒ 门禁在真实仓里长期不可用。

用户裁决（2026-11-27）：上 baseline / known_failures 机制（OC-1c）。ADR 的 SU 已把判据定死（D10 + V20–V25），
本 change 把它**落地为可机械校验的实现**。

## What Changes

| # | 变更 | 落点 | 归属 |
|---|---|---|---|
| A0 | **识别机制**（SU 未定义 ⇒ 本 change 定义）：声明新增 `inspection: { command, carrier }` —— 巡检守卫须为 `verify_commands` 独立条目、`known_failures` 不得绑定它、载体须 git-tracked；缺席 ⇒ **字段整体无效 ⇒ 退回硬门**（fail-closed，判定在 commit 时）；机制 **repo-agnostic** | `lib/commit-gate.ts` + `plugins/commit-gate.ts` | builder |
| A1–A2 | 声明可带 `known_failures`；失败**且**合并输出（**全量**）含 `match` ⇒ 放行；未命中 ⇒ 照旧拒；`command` 不逐字相等 ⇒ 条目无效 | 同上 | builder |
| A3 | **特异性守卫**：去空白后 ≥ 8 字；通用词按**词边界整词匹配**、大小写不敏感 | `lib/commit-gate.ts` | builder |
| A4–A6 | **运行时留痕**（走 notice 字段，插件 `console.log` 会被宿主吞掉）/ **超时按未命中** / **总兜底**（声明解析或校验异常 ⇒ 视作未声明 ⇒ 硬门） | `lib/commit-gate.ts` + `plugins/commit-gate.ts` | builder |
| B1–B4 | **巡检层**（**新增** `scripts/commit-gate-baseline-doctor.ts`，不动 `commit-gate-doctor.ts`）：**标识集合**比对（逐工具提取器；**不复用子串语义**）⇒ `3 fail → 13 fail` 的膨胀必被发现；不再命中 ⇒ 「可清理」提示；无提取器 ⇒ 「无法提取标识」；独立退出码矩阵 0/1/2 | `scripts/commit-gate-baseline-doctor.ts` | builder |
| C1–C2 | **声明内容守卫（防增）**：逐项相等断言 `known_failures` 清单（期望集 = 独立 fixture 文件）⇒ 改清单 ⇒ 红；真仓守卫须**确实被接线** | `tests/config-guards.test.ts` + `tests/fixtures/commit-gate-known-failures.expected.json` | builder |
| D1–D2 | **D9⑰ 登记**（真源 + 三处载体同批）+ **计数 16 → 17 的迁移陷阱**（守卫现硬编码标题与计数 ⇒ 只 bump 计数会让**已归档 proposal 的 AC 面并集塌陷** ⇒ 须多标题兼容 / 去计数化） | ADR（治理面）/ `docs/MULTI-AGENT-DESIGN.md`（治理面）/ `tests/commit-gate-d9-registration.test.ts` | **architect** + builder |
| E1–E2 | **回滚面同批** + **四步顺序**（commit → drill → 回填 `last_drill` → 再 commit；drill 基于 HEAD ⇒ 工作区脏会得到假 PASS） | `.rddf/rollback/commit-gate.json` + `registry.json` | builder |

## 验收标准

> **AC ↔ V 映射**（V 编号 = ADR Verification 章，唯一真源；AC 正文见 improvement 草稿与 `tasks.md`）

- [ ] **AC1（↔ V20）** 命中 ⇒ 放行 + notice 留痕（通道被调用）；未命中 ⇒ 拒；同一 command 多条目任一命中即放行。
- [ ] **AC2（↔ V22）** 无 `known_failures` ⇒ 行为逐字不变。
- [ ] **AC3（↔ V23 + D10①）** 无效条目 / 特异性违规 / 超时 / 不豁免 D2②③ / 畸形声明总兜底。
- [ ] **AC4（↔ V25①）** 巡检缺席（缺 `inspection` / 非独立条目 / 未 tracked / symlink）⇒ 字段无效 ⇒ 硬门；绑定巡检命令 ⇒ 条目无效。
- [ ] **AC5（↔ V24① + V24②）** 巡检层集合比对（膨胀必被发现）+ 可清理提示 + 声明内容守卫防增 + 真仓守卫确实被读取。
- [ ] **AC6（↔ D9⑰ + V25②）** D9⑰ 四面登记齐备；本 proposal 含 AC 面小节且标题与守卫常量逐字相等；多标题兼容 ⇒ 归档并集不塌陷。
- [ ] **AC7（判别力 · 7 条变异）** 恒放行 / 不留痕 / 无条目当命中 / 去特异性 / 超时当命中 / 去 ⊆ 或复用子串 / 巡检缺席仍放行 ⇒ 各自判据红。
- [ ] **AC8（回滚面）** 四步顺序 + 回滚清单同批 + 演练通过 + `last_drill` 回填。
- [ ] **AC9（门）** `bun test tests/` 全绿（新增用例文件确实被 glob 到）+ `openspec validate <change> --strict` valid。

## D9 免宣称项登记（AC 面）

> ⚠ 本小节是 **D9⑰ 的 AC 面载体**（标题与守卫常量逐字相等）；**行首标题不可改写**，标题文本由
> `tests/commit-gate-d9-registration.test.ts` 的 `AC_HEADING` 常量派生 ⇒ 改标题必须同批改常量。
> 本 change 的 AC 面**只登记本 change 引入的 ⑰**；①–⑯ 由已归档 change 的「十六项」小节承担 ——
> 守卫**接受多标题** ⇒ 两面并集恰好覆盖 ①–⑰（每项恰好一次）。⚠ 若本小节也列 ①–⑯，
> 并集里每项会出现 **2 次** ⇒ 守卫红（AC6③ 的判别力）。

- **D9⑰** baseline 命中放行 ⇒ 见 ADR D9 表（判据真源）

## Capabilities

- MUST: 命中 ⇒ 放行 + 留痕；未命中 ⇒ 拒；无该字段 ⇒ 逐字不变。
- MUST: `match` 受特异性约束（去空白后 ≥ 8 字、非纯数字、通用词按词边界整词匹配）。
- MUST: 巡检缺席 ⇒ 字段无效 ⇒ 退回硬门（识别靠 `inspection` 字段 ⇒ 机制 repo-agnostic）。
- MUST: 「不能增」由声明内容守卫承担；⊆ 只防腐坏且必须按标识集合比对（不复用子串）。
- MUST: D9⑰ 按真源 + 三处载体登记；计数迁移不得让已归档载体掉出并集。
- MUST NOT: 未经登记的失败被放过；巡检缺席仍放行；超时被豁免；解析/校验异常默认放行。

## Impact

见 `.rddf/improvements/commit-gate-baseline-known-failures.md` 的 **Impact** 表（含「同批 commit 的归属与顺序」）。
