# Revert 演练留痕 — verifier-baseline-worktree-diff（AC8）

> **归档指针（2026-11-19）**：该 change 已归档为 `openspec/changes/archive/2026-11-19-verifier-baseline-worktree-diff/`。本文内出现的 `openspec/changes/<name>/…` 是**归档前的历史记述**（过程记录不回改）。
> 日期：2026-11-15 ｜ 判据真源：`openspec/changes/verifier-baseline-worktree-diff/proposal.md` 的 AC1–AC8
> 方法：每条**注入一个真实破坏** ⇒ 必须变红 ⇒ 还原 ⇒ 必须绿。**判红只认退出码**。

## 基线

```
bun test tests/ ⇒ exit 0 ｜ 586 pass / 0 fail
```

## 逐条结果

| # | 注入的破坏 | 变红的判据 | 还原后 |
|---|---|---|---|
| A | `build.md` 的 diff 命令改回**三点**（旧命令） | AC5（文档面守卫） | exit 0 |
| B | 删掉「未跟踪文件走 `ls-files --others --exclude-standard`」那一路 | AC5 | exit 0 |
| C | 删掉「基线侧/工作树侧**不对称**」的说明 | AC6 | exit 0 |
| D | 删掉「基线侧取的是**提交内容**」 | AC6 | exit 0 |
| E | **把判据本身改坏**（AC1 的两点 diff 断言改成三点） | AC1 | exit 0 |

## 结论

**逐条可逆，无空转绿。** E 特别重要：本 change 的判据（AC1–AC4）**当场即绿**（git 行为本来如此 ⇒
属**防漂移类**）⇒ 若无 E 这条注入，无法证明它们有判别力。

## 覆盖情况（如实登记）

| AC | 有 revert 演练？ | 备注 |
|---|---|---|
| AC1 | ✔ E | 判据自身被改坏 ⇒ 变红 |
| AC2 | — | 与 AC1 **同一条命令**（两点 diff）⇒ 同一破坏路径 |
| AC3 | — | ⚠ **不同命令**（`ls-files --others`）⇒ 共享路径的说法**不成立**；其**文档面**已由注入 B（AC5 ②）覆盖，行为面靠 E 防「判据被改坏」 |
| AC4 | — | ⚠ **不同命令**（`git show`）⇒ 同上；其**文档面**已由守卫新增的 `git show <base>:` 断言覆盖（critic 第 2 轮补） |
| AC5 | ✔ A + B | 两条子判据各自一条注入 |
| AC6 | ✔ C + D | 同上 |
| AC7 | — | 回归项（本就应绿） |
| AC8 | — | 本文件即留痕 |

⚠ **诚实口径（critic 第 2 轮修正了本表的措辞）**：AC2 与 AC1 **共享同一条命令**（两点 diff）；
但 **AC3（`ls-files`）与 AC4（`git show`）是另外两条命令** ⇒ 「三者共享一条路径」的说法**不成立**。
它们的**文档面**分别由注入 B（AC5 ②）与守卫新增的 `git show <base>:` 断言覆盖；**行为面**靠 E
（把判据改坏 ⇒ 红）防篡改 —— 但**没有逐条独立注入** ⇒ 记为「已覆盖（非逐条验证）」而非「已逐条验证」。
（critic 判定：**不必**补逐条注入 —— 逐条注入对 AC2–AC4 是仪式性的。）

## 审查追加的一条（oracle 第 1 轮发现 ⇒ 已修）

> **输入侧冻结了 sha，消费端却用 raw ref** ⇒ 「派发时冻结」的价值被绕过：
> 主会话在取证期间 commit ⇒ 相对 ref 解析成**另一个** commit ⇒ 基线漂移 ⇒ 「本 change 触及了什么」判错位。
> ⇒ 已在 `build.md` 补「**一律用简报基线行 `→` 后的 SHA**」，并在守卫里加了对应断言（⑤）。
