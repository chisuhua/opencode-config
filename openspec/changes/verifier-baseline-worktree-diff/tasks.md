# Tasks — verifier-baseline-worktree-diff

> 判据真源：`proposal.md` 的「## 验收标准」（AC1–AC8）。
> 决策取舍：`design.md`（D1 为什么换对照对象 / D2 两侧不对称 / D3 未跟踪文件并列两路 /
> D4 `merge-base` 的新用途 / D5 真 git fixture / D6 边界）。
> **TDD 5 步**：先写会失败的断言（红灯留痕），再改实现，再转绿。

## 前置确认

- [ ] **0.1** 确认 `prompts/build.md` 基线取法段的当前原文（AC5/AC6 要改它）
- [ ] **0.2** 确认 `tests/` 里既有的 git fixture 助手（`gitRepo()`）可复用（真 git ⇒ D5）
- [ ] **0.3** 确认 `prompts/plan.md` / `prompts/front.md` 是否提到基线对照命令
      （**若没提则不新增** ⇒ 不制造第二处描述面）

---

## Task 1：判别力判据（AC1 / AC2）—— 本 change 的核心

> 判据形态：**真 git fixture**（D5）—— 证明「工作树两点 diff 有判别力、旧三点命令失效」。

- [ ] **Step 1:** 写失败断言 ——
      ① fixture：基线提交含 `a.txt`；**工作树改写** `a.txt`（**不 commit**）
      ② `git diff --name-only <base>` **必须列出** `a.txt`
      ③ `git diff --name-only <base>...HEAD` **必须为空**（旧命令失效的**证据**）
      ④ 工作树**未**改 `b.txt` ⇒ 两点 diff **不含** `b.txt`
- [ ] **Step 2:** 确认红 —— ⚠ **注意**：①②④ 现在就成立（git 行为本来如此）⇒ 判据是
      **防漂移**类，**当场即绿**是预期的；③ 也是绿的 ⇒ **本 Task 可能「预期即绿」**。
      ⇒ 如实记录（不假装红过），并在 Task 5 用 revert 演练证明它**有判别力**
- [ ] **Step 3:** 最小实现：**无需改实现**（git 行为即如此）⇒ 只加判据
- [ ] **Step 4:** 确认绿

## Task 2：未跟踪文件 + 基线侧可重演（AC3 / AC4）

- [ ] **Step 1:** 写失败断言 ——
      ① 工作树新增**未跟踪**文件 ⇒ `git diff --name-only <base>` **不含**它，
         但 `git ls-files --others --exclude-standard` **含**它
      ② 工作树改写 `a.txt` 后，`git show <base>:a.txt` 仍返回**基线版本**（内容 ≠ 工作树版本）
- [ ] **Step 2:** 确认红/绿（防漂移类，可能即绿 ⇒ 如实记录）
- [ ] **Step 3:** 最小实现：只加判据
- [ ] **Step 4:** 确认绿

## Task 3：改 `prompts/build.md` 的基线取法（AC5 / AC6）

- [ ] **Step 1:** 写失败断言（守卫）——
      ① 基线取法段含 `git diff --name-only <base>`（**两点**）且**不含**三点写法
      ② 段内明写**未跟踪文件**走 `git ls-files --others --exclude-standard` 那一路
      ③ 段内明写**基线侧（提交内容）vs 工作树侧（两点 diff）的不对称**
      ④ 段内写明 `merge-base` 的**新用途**（祖先关系诊断；对照用 `<base>` 本身）
- [ ] **Step 2:** 确认红
- [ ] **Step 3:** 改 `prompts/build.md`（**只改这一段**，不动其它取证纪律）
- [ ] **Step 4:** 确认绿

## Task 4：口径核对 + 全量回归（AC7）

- [ ] **Step 1:** 核对 `prompts/plan.md` / `prompts/front.md`（前置 0.3 的结论）——
      **若它们提到了三点命令 ⇒ 一并改；若没提 ⇒ 不新增任何描述面**
- [ ] **Step 2:** `bun test tests/` 全绿（**单独校验退出码**，不用管道串）
- [ ] **Step 3:** `bash scripts/check-upstream-anchors.sh` 无 `FAIL` / 无 `SKIP`

## Task 5：revert 演练 + CHANGELOG（AC8）

- [ ] **Step 1:** 把 `build.md` 的命令改回**三点** ⇒ AC5 必须红
- [ ] **Step 2:** 把「不对称」那段删掉 ⇒ AC6 必须红
- [ ] **Step 3:** 还原 ⇒ 全绿
- [ ] **Step 4:** 留痕写入 `.rddf/reviews/verifier-baseline-worktree-diff-revert-map.md`
- [ ] **Step 5:** 落 CHANGELOG 条目（**必须写明「回滚会恢复『基线对照无判别力』的状态」** —— design 的回滚行）

## 审查（收口前）

- [ ] **R1:** 治理面（`prompts/**` + 守卫断言）⇒ oracle 1 轮 → critic 1 轮
- [ ] **R2:** critic 的 BLOCKER 全闭（如有）⇒ 复审 1 次只验闭合
- [ ] **R3:** 审稿记录落 `.rddf/reviews/verifier-baseline-worktree-diff-review.md`

## 已知边界（写进测试注释，不假装覆盖）

- 「agent 是否真的照新纪律做」**证不了**（静态层只证命令行为与文档措辞）⇒ 属 e2e 层（CS 系列）
- **回滚的代价**：改回三点 = 恢复「基线对照在未提交工作树无判别力」的状态 ⇒ CHANGELOG 必须写明
- `git ls-files --others --exclude-standard` **排除**被 `.gitignore` 的文件 ⇒ 与 `artifacts` 口径一致，
  但**被忽略的产物仍数不到**（既有边界，非本 change 造）
- `<base>` 若是**别的分支**的提交 ⇒ 对照用 `<base>` 本身（不取 merge-base）—— 与「基线」的直觉含义
  不同，已在 D4 记录
