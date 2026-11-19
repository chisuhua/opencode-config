# 审稿记录 — verifier-baseline-worktree-diff（v2.33）

> **归档指针（2026-11-19）**：该 change 已归档为 `openspec/changes/archive/2026-11-19-verifier-baseline-worktree-diff/`。本文内出现的 `openspec/changes/<name>/…` 是**归档前的历史记述**（过程记录不回改）。
> 产物：`prompts/build.md` 的基线取法段 + `tests/verifier-baseline.test.ts`（新）+ `tests/config-guards.test.ts`（新守卫）
> 治理面判定：触及 `prompts/**` + 守卫断言 ⇒ **oracle → critic**
> 日期：2026-11-15

## 1. 问题（实测确认）

`prompts/build.md` 的基线对照命令含 `git diff --name-only <base>...HEAD`（**三点 diff，只比已提交**），
而本仓后端**被禁止 commit** ⇒ 未提交工作树下**恒为空** ⇒ 「取证对象是否被本 change 触及」永远「未触及」
⇒ **基线对照在真实用法下没有判别力**。

## 2. 实施

- **命令**：两点 `git diff --name-only <base>`（基线 ↔ **工作树**）+ 并列 `git ls-files --others --exclude-standard`
  （`git diff` 不含未跟踪文件）+ `git show <base>:<path>` 读基线内容。
- **两侧不对称**（有意）：基线侧 = 提交内容（可完整重演）；工作树侧 = 工作树（含未提交改动）。
- **`merge-base` 改用途**：只作祖先关系诊断；**对照一律用 `<base>` 本身**。
- **一律用简报里 `→` 后的 SHA**（oracle 第 1 轮发现 ⇒ 已修）。
- **判据**：AC1–AC4（真 git fixture，防漂移类）+ AC5/AC6（文档面守卫）+ AC7（回归）+ AC8（revert 留痕）。

## 3. 审查

- **oracle 第 1 轮** `PASS-WITH-NOTES`：**高影响真缺陷** —— 输入侧在派发时冻结了 sha，消费端却按 raw
  ref 解析 ⇒ 主会话期间 commit ⇒ 基线漂移 ⇒ 判错位 ⇒ 已修（文档 + 守卫⑤）。
  另 3 条中/低影响：守卫三点负向只挡一种变体（⇒ 放宽为闭集 `\.\.\.`）、「不对称」措辞是开集
  （⇒ 加负向断言：除「不对称」外不得出现裸「对称」）、AC8 留痕缺失（⇒ 已补）。
- **critic**：见下方结论。

## 4. 验证

| 项 | 结果 |
|---|---|
| `bun test tests/` | **586 pass / 0 fail**（exit 0） |
| revert 演练 | **5 条**（A–E）逐条精确命中、还原后全绿（含 E = 「把判据本身改坏」） |
| 留痕 | `.rddf/reviews/verifier-baseline-worktree-diff-revert-map.md` |

## 5. 残留

1. **AC2–AC4 未逐条独立注入**（与 AC1 共享同一条 git 行为路径）⇒ 已在留痕里如实标注。
2. 「不对称」仍是**措辞**判据（负向断言只能挡最高频的回改写法；换词仍需 review）。
3. 「判据被 weaken」**无机械防线**（守卫守卫测试 = 无限递归）⇒ 靠 R1 审查流程。
4. 消费端纪律仍**未工具化**（抽成脚本最彻底，但超本 change scope）⇒ 留作独立 improvement 的候选。
