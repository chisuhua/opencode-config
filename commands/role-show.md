---
description: 查看当前项目 build agent 角色矩阵的状态
agent: build
---

读取并显示指定项目的 `.rddf/state/role.json` 内容。

**用法**：
- `/role-show` — 当前目录
- `/role-show <project-root> [<project-root> ...]` — 一个或多个项目路径

执行只读的状态查看脚本：

!`bash ~/.config/opencode/scripts/role-show.sh $ARGUMENTS`

**报告要求**：
1. 对每个路径输出：当前角色、最近更新时间、操作者、最近 5 条切换历史
2. 如果状态文件不存在，告知用户先跑 `/role-init`