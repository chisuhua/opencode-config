---
状态: 未立项
优先级: P2
---
# improvement: rddf-status-improvement-status-mismatch — `rddf status` 的 improvement 状态列失真

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。
> 来源：`rollback-manifest-find-narrowing` 收尾时的 `rddf status` 核查（2026-11-24）。
> 关联 change：**尚未立项**（`backlog: rddf-status-improvement-status-mismatch`）。
> ⚠ **跨仓**：判定逻辑在产品侧 `rdd-workflow` 仓（`_lib/dashboard/improvement_status.py`）⇒ 修它**不属于本仓**；
>   本仓侧只能做「止血」（加 frontmatter）或登记（本条）。
> 执行路径：**跨仓 change**（rdd-workflow 仓）⇒ 需 oracle → critic。

## Why

`rddf status` 的 **improvement 区**与本仓的事实**不一致**：

| 输出 | 实测（2026-11-24） | 判定 |
|---|---|---|
| `Total pending: 9` | 其中 **2 项已终结**仍在池中 | ❌ 失真 |
| `STATUS` 列全「待讨论」 | 连**今天刚标「已实施」**的 `rollback-drill-replace-pattern`、以及**已归档**的 8 项也显示「待讨论」 | ❌ 失真 |
| `PRI` 列全 `-` | 本仓的优先级散在正文（`⚠ 优先级：**P1**`），无统一字段 | ❌ 失真 |
| `front-agent-redesign` 标「待讨论」 | 它有 **3 条未实测判据**（AC14/AC15/AC17）+ 1 条判据需改（AC9）⇒ 应是「部分闭合」而非「待讨论」 | ❌ 标签不准 |
| **Active changes** 区 | 1 个活跃（`subagent-contract-critic-reeval` 0/14），归档后已正确排除 | ✅ **正确** |

**根因 = 两套口径**：

| 侧 | 读什么 | 判定位置 |
|---|---|---|
| **本仓** | **正文**的 `> **(实施状态\|状态)**` 行（头部 15 行窗口） | `tests/config-guards.test.ts::isClosedImprovement`（`:69-78`；消费点 `:3142` / `:3302`） |
| **rddf CLI** | **frontmatter** 的 `状态:` 字段（缺失 ⇒ 「待讨论」） | `rdd-workflow` 仓 `_lib/dashboard/improvement_status.py`（`_TERMINAL_MARKERS` / `_OPEN_MARKERS`） |

⇒ 本仓的 improvement **没有** `状态:` frontmatter（本仓惯例 = 5 段无 frontmatter）⇒ CLI 一律判「待讨论」
⇒ **已归档 / 已实施的事项继续留在待办池里** ⇒ 待办池失真 ⇒ 「下一步做什么」被误导。

⚠ 与 `add-improve` skill 的 **HARD-GATE** 有关：它要求 **YAML frontmatter + 7 段**（本仓既有 improvement 全是 5 段无 frontmatter ⇒ 本仓走**内置流程**）⇒ 「加 frontmatter」这条修法与既有 skill 约定**存在形态冲突**，需要先裁决。

## What Changes

**优先（口径统一在工具侧 ⇒ 本仓零改动）**：

1. **rddf CLI 支持两处来源**（推荐）：`状态` 取 **frontmatter `状态:` 优先**，**回落到正文**的 `> **(实施状态|状态)**` 行（取头部 15 行窗口，与本仓 `isClosedImprovement` 同口径）⇒ 两个仓都认。
2. **`rddf status` 的 PRI 列**：若 CLI 要显示优先级 ⇒ 需要**统一字段**（frontmatter `优先级:`）⇒ 本仓须补该字段（31 个文件）⇒ **与 1 一起裁决**，否则维持 `-` 但**在表头标注「未登记」**（不假装有值）。

**次选（本仓侧止血，不改 CLI）**：

3. 给**已终结**的 improvement 补 frontmatter `状态: 已归档` / `已实施` ⇒ CLI 能把它们移出待办池。
   ⚠ **可行性已核**：本仓 `isClosedImprovement` 的两个消费点都用 `slice(0, 15)` ⇒ 加 3 行 frontmatter 后状态行仍在窗口内（今天是第 5 行 ⇒ 挪到第 8 行）⇒ **不破坏本仓既有守卫**。
   ⚠ **代价**：形态不一致（部分有 frontmatter、部分无）⇒ 需同时裁决 `add-improve` HARD-GATE 与本仓惯例的关系。

## Acceptance

- [ ] `rddf status` 的 `Total pending` **不含**已归档 / 已实施的 improvement（本仓当前有 **2 项**已终结项在池中 ⇒ 修后应消失）；
- [ ] `STATUS` 列对已终结项显示 **「已归档」/「已实施」**（不是「待讨论」）；
- [ ] `front-agent-redesign` 显示**「部分闭合」**（它有 3 条未实测判据 + 1 条判据需改 ⇒ 不是「待讨论」，也不是「已闭合」）；
- [ ] 若 PRI 列仍为 `-` ⇒ 表头**显式标注「未登记」**（不许让空值看起来像「无优先级」）；
- [ ] **本仓既有守卫不退化**：`bun test tests/` 全绿（`isClosedImprovement` 的两个消费点行为不变）⇒ **负向验证**：把某 improvement 的状态行挪到第 16 行以外 ⇒ 本仓守卫**不应**因此翻转（头部窗口口径）⇒ 两个口径的窗口一致；
- [ ] 修法若选「加 frontmatter」⇒ 同步裁决 `add-improve` HARD-GATE 与本仓 5 段惯例的关系（**形态冲突不能留成隐雷**）。

## Capabilities

- **MUST**：待办池**不混入**已终结事项（否则「下一步做什么」被误导）。
- **MUST**：两个口径（本仓守卫 / CLI）对同一文件的**关闭判定一致**。
- **MUST NOT**：为了让 CLI 认而**改动本仓的守卫判据**（`isClosedImprovement` 是「什么算漂移」的判据本身）。
- **MUST NOT**：把 `front-agent-redesign` 标成「已闭合」（它有未实测判据）。

## Impact

| 面 | 影响 |
|---|---|
| **rdd-workflow 仓**（`_lib/dashboard/improvement_status.py` + `renderer.py`） | 判定来源改为「frontmatter 优先 + 正文回落」⇒ 需该仓的 oracle → critic（跨仓治理面） |
| 本仓 `.rddf/improvements/**` | 仅在选「加 frontmatter」时受影响（已终结项 ~10 个 + PRI 字段）⇒ 形态变更需裁决 |
| 本仓 `tests/config-guards.test.ts` | **零改动**（`isClosedImprovement` 不动）⇒ 负向验证只需证明窗口口径一致 |
| `rddf status` 的用户 | 待办池变准 ⇒ 「下一步做什么」的依据变准 |

---

## §9 裁决记录（2026-11-26）：**不按现规格立项**，re-scope 为「模板侧默认字段」，**登记但承诺时点**

> 来源：路线图 `.rddf/roadmap/test-debt-e2e-followup.md` 任务 **C4**；用户决定 = **B（登记不承诺时点）**。

**为什么不按现规格立项**：原规格「improvement 正文里的 change 指针已归档 ⇒ 视为 terminal」会把审计**亲手抓到的 3 个反例自动化**（`adr-front-knowledge-librarian-whitelist-annotation` / `cross-repo-check-trigger-in-agent-checklist` / `delegate-base-resolved-return` —— 表面已完成、实际未完成）⇒ 真待办在**无人核 Acceptance** 的情况下被移出视野 ⇒ **比不做更差**。front-matter 约定恰恰把「人核一遍」留在环路里 ⇒ 这是**特性不是成本**。

**re-scope 后的目标（产品侧 `rdd-workflow` 仓）**：只做「**模板侧默认字段**」—— `add-improve` / proposal 模板产出即带 `状态` + `优先级`（增量侧的持久解）。**不做**「按正文指针自动判 terminal」。

**本仓侧已自闭环（不等产品侧）**：
- 存量止血 = `improvement-pool-status-frontmatter`（2026-11-25 已完成，pending 10 → 7）；
- 增量守卫 = `tests/config-guards.test.ts` 的 A6（22 份祖父名单冻结 + 名单外缺字段即红）。

**登记状态**：**已决、未承诺时点**（用户 2026-11-26 决定）。触发重估 = **产品侧下一次模板修订批**。本条因此保持 `状态: 未立项`，但**不再是「待讨论」**——它是一个已定方向的跨仓 backlog，不是等裁的提案。
