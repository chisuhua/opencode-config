# Design — verifier-baseline-worktree-diff

> 判据真源：`proposal.md` 的「## 验收标准」（AC1–AC8）。本文只记**决策取舍**。
> 事实依据：`delegate-base-channel` 的审稿（metis 的**元层盲区**；已实测确认三点 diff 在未提交工作树恒空）。

## D1. 为什么对照对象从「提交范围」换成「工作树」

`git diff --name-only <base>...HEAD`（三点）的语义 = **两个提交之间**的差异。
本仓后端**被禁止 commit** ⇒ 被取证的 change 通常**未提交** ⇒ 该 diff 恒空 ⇒
「取证对象是否被本 change 触及」永远「未触及」。

`git diff --name-only <base>`（两点）的语义 = **基线提交 ↔ 当前工作树** ⇒ 未提交改动**可见**。

⇒ 取证的问题本身是「**这个 change**（工作树里的未提交改动）触及了什么」⇒ **两点才是对的对照**。
三点回答的是另一个问题（「从基线到 HEAD 这段提交历史触及了什么」）—— 而本仓的交付形态里，
**那段提交历史根本不存在**（没人 commit）。

## D2. 基线侧与工作树侧**不对称** —— 必须写进文档，否则会被「对称直觉」改回去

| 侧 | 命令 | 取到的是 |
|---|---|---|
| **基线侧** | `git show <base>:<path>` | **提交内容**（`<base>` 指向的提交里的版本） |
| **工作树侧** | `git diff --name-only <base>` | **工作树内容**（含未提交改动） |

⇒ 两侧**不来自同一时点**（基线 = 某次提交；工作树 = 现在）⇒ 这是**有意的**：
内容类取证要回答「基线上这个文件是什么样」⇒ 基线侧必须是**提交内容**（可完整重演）；
而「哪些文件被这次 change 触及」⇒ 必须是**工作树**（交付物就在那儿）。

⚠ 若有人按「对称」直觉把 `git show` 也改成工作树版本（如 `cat <path>`）⇒ 分类能力当场失效
（基线侧永远等于工作树侧 ⇒ 「基线上同样失败」恒成立 ⇒ 一切都被判成 `blocked`）。

⇒ 这一条要写进 `build.md`（AC6），且要有守卫钉住。

## D3. 未跟踪文件为什么**不能**塞进 `git diff`

`git diff` **不列未跟踪文件**（它只比较已跟踪路径的两个版本）。强行纳入需要
`git diff --no-index /dev/null <path>` 逐个拼 ⇒ 命令形态脆弱、跨平台差异多。

⇒ 取「**并列两路**」：

```bash
git diff --name-only <base>                              # 已跟踪文件的改动
git ls-files --others --exclude-standard                 # 新增的未跟踪文件（被 .gitignore 的不算）
```

⚠ `ls-files --others --exclude-standard` **排除**被 `.gitignore` 的文件 ⇒ 与 `artifacts` 的口径
（`artifacts` 也数不到被忽略的产物）**一致** ⇒ 两个口径不打架。

## D4. `git merge-base HEAD <base>` 还留不留

两点 diff 用的是 **`<base>` 本身**（不是 merge-base）⇒ `merge-base` 在新口径下**不再需要**。

但它仍有价值：`<base>` 是**相对 ref**（`HEAD~1`）时，`<base>` 本身是「某个祖先」⇒ 直接 `git diff <base>`
是以那个祖先为基线（正确）；而 `merge-base HEAD <base>` 给的是「HEAD 与该祖先的共同祖先」——
在 `<base>` 真是祖先时**两者相同**，在 `<base>` 是别的分支的提交时**不同**。

⇒ 决策：**保留 `merge-base` 但改用途** —— 它用于**确认 `<base>` 与 HEAD 的祖先关系**（诊断用），
而**对照**一律用 `<base>` 本身。这条要写清，否则后人会以为 diff 的基线是 merge-base 的结果。

## D5. 为什么判据用**真 git fixture**，不用 mock

判据要证明的是「**这两条命令在真实形态下行为不同**」⇒ 必须真跑 git（mock 证明不了 git 的语义）。

⇒ fixture 用 `tests/` 里既有的 `gitRepo()` 形态（真 `git init` + 真 commit + 真改工作树）。

## D6. 为什么**不改** `base` 的入参语义 / 返回契约

- 入参 `base` 的语义（派发时解析成 sha、冻结）是 `delegate-base-channel` 的 D2/D4，**已正确**；
- 返回契约加 `base_resolved`（让派发方拿得到实际用的 sha）是 `delegate-base-resolved-return` improvement。

⇒ 本 change **只改消费端的比较对象**，不碰通道 ⇒ 两个 change 可独立实施、独立回滚。

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| 改回三点（有人按「对称」或按旧文案改回） | AC5 的守卫 + AC8 的 revert 演练留痕 |
| 有人把 `git show <base>:<path>` 改成工作树版本 | AC6 的「不对称」措辞 + 文档明写 |
| 未跟踪文件被漏掉 | AC3（并列两路）+ 文档明写 |
| `<base>` 是别的分支的提交时，对照对象含糊 | D4：对照用 `<base>` 本身；`merge-base` 只作祖先关系诊断 |
| **回滚** | 改回 `build.md` 的三点命令 + 删 AC1–AC4 的判据（AC5/AC6 的守卫随之失效）—— 但**回滚会恢复「基线对照无判别力」的状态**，故应在 CHANGELOG 明写 |
