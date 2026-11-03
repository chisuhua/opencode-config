---
description: 在项目根初始化 build agent 角色矩阵的状态文件 (POC)
agent: build
---

为指定项目初始化 build agent 的 `.rddf/state/role.json` 状态文件。

**用法**：
- `/role-init` — 当前目录
- `/role-init <project-root> [<project-root> ...]` — 一个或多个项目路径

执行幂等的角色状态文件初始化脚本：

!`bash ~/.config/opencode/scripts/role-init.sh $ARGUMENTS`

**报告要求**：
1. 列出每个被处理的路径和结果（`add:` / `ok:` / `skip:`）
2. 如果任一路径报错（如不是目录），显示错误并列出跳过的路径
3. 简要说明下一步：
   - `现在 <project-root> 已经准备好；当前角色是 no-role。"
   - `用「切换到 architect / planner / builder / verifier」开始。"
   - `如要用 architect 角色，先运行 /arch-docs-init 梳理架构文档范围。`
   - `用 /role-show 查看当前状态。`