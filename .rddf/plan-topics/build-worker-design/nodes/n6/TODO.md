# TODO — n6（与 rdd-builder P2 worktree 模式的关系）

- [x] 读 `BRIEF.md` / `TOPIC.md` / `nodes/n1/RESULT.md`（现状测绘输入）
- [x] 尝试加载 `~/.agents/skills/rdd-workflow/skills/rdd-builder/SKILL.md` 与其脚本目录
      ⇒ 读盘被 `external_directory` 拒绝 ⇒ 按验收口径标注「上游/外部工件，未在本仓核实」
- [x] 收集本仓二手锚点：P2 的落点（`.rddf/wt/<name>/`）、`execute` 前置（worktree context / lightweight）、
      P0·P2.5 HARD pause、P2 无 commit gate、`archive.sh::check_worktree_commits`
- [x] 核对磁盘事实：`.rddf/plans/`（3 件）、`.rddf/wt/`（无）、`.rddf/state/builder/`（无）、
      `.rddf/state/.planner-handoff.json`（无）⇒ rdd-builder 前置在本仓不成立
- [x] 列可复用点（≥2，含复用方式与代价）
- [x] 列冲突点（≥2，含依据）
- [x] 给出单一整合建议（复用 / 并存 / 替代）+ 理由 + 被否决项
- [x] 画复用边界与职责归属（owner 逐项）
- [x] 逐路径给工件归属结论（`.rddf/plans/**`、`.rddf/wt/**`、`.rddf/plan-topics/**`、`openspec/changes/**`）
- [x] 写 `RESULT.md`（≥100 行、≥6 处 `path:line`、末行哨兵）
