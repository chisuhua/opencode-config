---
description: 梳理项目架构文档存放结构，生成/更新 .rddf/config/arch-docs.json
agent: build
---

梳理项目架构文档结构，写入 `.rddf/config/arch-docs.json`，作为 `architect` 可写范围与 critic `arch` 档的判据来源。

**用法**：
- `/arch-docs-init` — 当前目录；配置缺失时梳理并写入，已存在则跳过
- `/arch-docs-init <project-root>` — 指定项目
- `/arch-docs-init --refresh` — 重新梳理并覆盖（文档目录移动/新增后）
- `/arch-docs-init --check` — 只检查：路径失效（`STALE`）、新目录未覆盖（`UNCOVERED`）；有漂移时退出码 2。**漂移只在配置已声明 `arch_paths` 时成立**；配置缺失 / `arch_paths` 为空 / 配置损坏时只输出 `NOTE`、退出码 0，**不算漂移**
- `/arch-docs-init --dry-run` — 只打印结果，不写文件

!`bash ~/.config/opencode/scripts/arch-docs-init.sh $ARGUMENTS`

**报告要求**：

1. 首次生成时，先展示识别到的目录分类（ADR / architecture / design / methodology 等），再写文件；如果识别结果明显不合理（例如把 `openspec/specs` 或 `external/**` 收进来），停下来问用户，不要直接写。
2. 列出 `arch_paths` 与 `exclude_paths`，并说明：
   - `arch_paths` = architect 可写的架构决策类文档目录；
   - `exclude_paths` = 即使位于 arch 目录下也不归 architect（归档/历史文档）。
3. `--check` 发现 `STALE` 或 `UNCOVERED` 时（**仅当配置已声明 `arch_paths`**）：
   - 先展示漂移项；
   - 结构确实变了 → 跑 `--refresh`；
   - 只是误报 → 手工编辑配置，不要盲目 refresh。
4. `--check` 输出 `NOTE`（配置缺失 / `arch_paths` 为空 / 配置损坏 / 目录未写入配置）时：**不要**据此反复跑 init 或 `--refresh` —— 按 `prompts/build.md` §架构文档范围 的判定三态，这几种情形由 fallback 目录集接管，不构成漂移；只在用户明确要建立 / 固定目录结构时才跑 init。配置损坏时提示用户修复或重跑 init。
5. 配置写好后提示：`architect` 的写范围以该文件为准（未配置时按 fallback 目录集判定，不阻塞）；后续目录结构变更时运行 `/arch-docs-init --refresh`。

**边界**：

- 该命令只写 `.rddf/config/arch-docs.json`，不改任何文档内容。
- 不扫描 `openspec/**`、`external/**`、`node_modules/**`、`build/**`、`docs/archive/**`。
- roadmap / improvements 属于 planner 域，不进 `arch_paths`。
