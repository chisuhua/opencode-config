# 架构主题文档（Theme Docs）

> 本目录是**当前架构快照**的落点：一份主题文档 = 一个主题（意图 + 当前取舍 + 关键结构缝），**不承担决策本身**（决策过程与代价在 ADR）。
> 决策记录（定什么 / 为什么 / 代价）在 [`../adr/`](../adr/)。

## Doc Map

| Doc | 主题 | Primary ADRs |
|-----|------|--------------|
| [`plan-topics-topic-model.md`](plan-topics-topic-model.md) | plan 侧协作 topic 模型（对象/字段/状态机/判据面/命令面/不变量） | ADR-plan-multi-session-collaboration |

## Update Convention

新增或更新主题文档时，同一批必须：

1. 在上表加一行（Doc ｜ 主题 ｜ Primary ADRs）；
2. 主题文档引用的 ADR 编号必须能在 `../adr/` 找到对应文件；
3. 若该主题引入了新决策，先写 ADR（`../adr/ADR-*.md`），再回填本表与主题文档的 Primary ADRs 列。

## 自检（改本目录前）

- 上表必须列出本目录下**每一个主题文档**（`*.md`，**除本 README**）—— `ls docs/architecture/*.md | wc -l` 的计数应等于「表行数 + 1」；
- 表里的 ADR 编号必须逐个在 `../adr/` 命中（不写「预计会有」式条目）。

## 归属

- **写权**：`architect` 角色（`.rddf/config/arch-docs.json` 的 `arch_paths` 命中 ⇒ 写门放行）；`planner` / `verifier` 不写架构文档（`decideWrite` 只对 `architect` 追加 `arch_paths`）；
- **产出**：`rdd-arch` 的 theme-doc-sync 阶段（ADR ↔ theme doc 双向可追溯）；
- **边界**：主题文档写「当前态快照 + 模块关系」，不重复 ADR 的决策叙述。
