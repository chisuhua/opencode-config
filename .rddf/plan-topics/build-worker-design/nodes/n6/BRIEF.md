# BRIEF — n6：与 `rdd-builder` P2 worktree 模式的关系

## 目标

判定本仓**既有**的 `rdd-builder` P2「worktree / branch 准备」阶段，与新提出的「`build` 多 wave 并行实施通道」是**复用**、**并存**还是**替代**关系。

## 边界（明确不做）

- 不改 `rdd-builder`。
- 不重复 n2 的隔离方案选型（只把它当作「可能的被复用方」评估）。
- 不设计合并语义。

## 必读材料

| 路径 | 要取什么 |
|------|----------|
| `nodes/n1/RESULT.md` | **若已产出则必读**（现状测绘，含 rdd-builder 通道那一条）；缺失时按「前置未定」处理并标注 |
| `~/.agents/skills/rdd-workflow/skills/rdd-builder/SKILL.md`（或 `~/.config/opencode/skills/` 下同名 skill） | P2 阶段实际做什么：worktree / branch 准备、配额与落地形态 |
| `~/.agents/skills/rdd-workflow/skills/rdd-builder/` 下的脚本 | P2 的真实实现落点（prepare / worktree / branch 相关脚本） |
| `docs/adr/ADR-role-aware-permissions.md` | 写门与角色写集的边界（若相关） |
| `docs/adr/ADR-plan-delegate-engineering-session.md` | `delegate` 与 `rdd-builder` 是否已有关联（若有关联则一并列出） |
| `opencode.jsonc` | `delegate` 后端 agent 白名单里是否含 `build`（与 rdd-builder 的角色是否重叠） |
| `lib/delegate-core.ts` | 后端 agent 白名单的定义处 |

## 期望交付（`RESULT.md`）

1. **rdd-builder P2 现状**：它到底做了什么准备、落在哪个路径、产物是什么、谁负责执行。带 `path:line`。
2. **可复用点**：哪些机制可以直接被新通道复用（至少 2 条），每条给复用方式与代价。
3. **冲突点**：哪些地方会重复造轮子或互相矛盾（至少 2 条），每条给依据。
4. **整合建议**：复用 / 并存 / 替代，明确单一推荐 + 理由 + 被否决项。
5. **若推荐复用**：给出「复用边界」——哪些部分复用、哪些必须新做，以及由此产生的**职责归属**（哪个角色/哪个组件是 owner）。
6. **对本仓工件归属的影响**：若涉及 `.rddf/plans/**`、`.rddf/plan-topics/**`、`openspec/changes/**` 的写入归属，须逐个说明（可引用本仓「工件归属规则」：同一工件在同一路径上只允许一个写入者）。
7. 至少 **6 处 `path:line` 引用**；正文 **≥ 100 行**；结论先行。

## 验收口径

- 若 `rdd-builder` skill 在本机不可加载，**如实标注「上游/外部工件，未在本仓核实」**并写清依据来源路径；**不得编造 `path:line`**。
- 「工件归属影响」一节必须逐路径给出 owner 结论，不得写「按惯例」。
- 整合建议必须是单一推荐。
