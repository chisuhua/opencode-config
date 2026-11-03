---
description: 在项目根的 .gitignore 加 .plans/ 忽略条目（plan agent 草稿不入库）
agent: build
---

为指定项目初始化 plan agent 的 `.plans/` git 忽略条目。

**用法**：
- `/plans-init` — 当前目录
- `/plans-init <project-root> [<project-root> ...]` — 一个或多个项目路径

执行幂等的 gitignore 配置脚本：

!`bash ~/.config/opencode/scripts/plans-init.sh $ARGUMENTS`

**报告要求**：
1. 列出每个被处理的路径和结果（`add:` / `ok:` / `skip:`）
2. 如果任一路径报错（如不是目录），显示错误并列出跳过的路径
3. 简要说明下一步：`现在 <project-root> 已经准备好，plan agent 产出的设计计划会写到该项目的 .plans/，不会入库。`
