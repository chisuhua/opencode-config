# verifier-baseline-worktree-diff — 基线对照改看**工作树**（三点 diff 在未提交状态下恒空）

> 来源：`delegate-base-channel` 的审稿残留 ③（`.rddf/reviews/session-handoff-20261114.md`）
> 事实依据：`.rddf/reviews/delegate-base-channel-review.md` §2（metis 的**元层盲区**，已实测确认）
> 判据真源：本文件「## 验收标准」表（AC1–AC8）；实现步骤见 `tasks.md`；决策取舍见 `design.md`
> 性质：**消费端纪律修正**（`prompts/build.md` 的取证纪律）+ 一组「判别力」判据
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在 ⇒ 走**内置流程**（用户直接指定起草）。

## Why

`prompts/build.md:343` 规定的基线对照取法是三条命令：

```bash
git merge-base HEAD <base>          # 定基线
git diff --name-only <base>...HEAD  # 判「取证对象是否被本 change 触及」
git show <base>:<path>              # 读基线内容
```

**第二条在本仓的真实用法下恒为空。** 实测（2026-11-15）：

```
$ git diff --name-only HEAD        # 两点：基线 ↔ 工作树
f.txt
$ git diff --name-only HEAD...HEAD # 三点：只比**已提交**
（空）
```

原因：**三点 diff 只比较提交**，而本仓**后端被禁止 commit**（`buildBrief()` 的执行要求第 3 条：
「不要 git commit / git push」）⇒ 被取证的 change 通常处于**未提交**状态 ⇒
「取证对象是否被本 change 触及」**永远得到「未触及」**。

⇒ **基线对照在真实用法下没有判别力**。这不是措辞瑕疵：它让「内容类取证」的第一道分类
（基线上同样「失败」⇒ `blocked`；仅本 change 失败 ⇒ `ac-fail`）**永远走「基线上同样失败」那一支**
⇒ 环境故障被系统性误判成「判据信号」或反向误判。

### 为什么这个缺陷**先于** `delegate-base-channel` 存在

存量靠 `constraints` 塞基线的简报同样中招 ⇒ 它不是新通道引入的缺陷。
但 `delegate-base-channel`（v2.31）把基线变成了**结构化参数 + 派发前校验**，让「基线对照」这条路径
**真的会被走到** ⇒ 缺陷的暴露面变大 ⇒ 此刻修。

### 修它需要什么（不是改一句话）

「committed-range → 工作树」是**语义迁移**，不是措辞替换：

- 两点 diff 的对照对象是**工作树**（含未提交改动），三点是**提交范围** ⇒ 「本 change 触及了什么」的
  判定边界变了；
- 工作树**可能脏**（未提交改动 + 未跟踪文件）⇒ `git diff <base>` **不含未跟踪文件** ⇒ 需决定是否补 `--no-index` 或另设一路；
- 基线本身也可能脏（`<base>` 指向的提交，其内容与工作树无关）⇒ 两条命令的语义**不再对称**。

⇒ 这些都要在**判据里写死**，否则后人会按自己的理解改回去。

## What Changes

### A. 取证纪律的命令改为「工作树两点 diff」

`prompts/build.md` 的基线取法段：

- `git diff --name-only <base>...HEAD` ⇒ **`git diff --name-only <base>`**（基线 ↔ **工作树**）
- 并补一句**未跟踪文件**的处理（`git diff` 不含未跟踪文件 ⇒ 未跟踪的新文件用 `git status --porcelain` 或
  `git ls-files --others --exclude-standard` 另列）
- `git merge-base HEAD <base>` 保留（它给的是「共同祖先」，两点 diff 需要的是 `<base>` 本身 ⇒ **要写清用哪个**）
- `git show <base>:<path>` 保留（读基线内容，仍是提交内容 —— 与工作树对照时这正是想要的「基线侧」）

### B. 判别力判据（**本 change 的核心价值**）

新增一组**可机械核**的判据，证明「工作树两点 diff」在真实形态下**有判别力**：

- **有判别力**：基线提交只有 `a.txt`，工作树改了 `a.txt` ⇒ 两点 diff **必须列出** `a.txt`；
  三点 diff **必须为空**（⇒ 证明旧命令在未提交形态下失效）
- **不误报**：工作树**未**改任何被取证文件 ⇒ 两点 diff **不含**该文件
- **未跟踪文件**：工作树新增未跟踪文件 ⇒ 必须被「未跟踪那一路」列出（`git diff` 本身不含）
- **基线侧可重演**：`git show <base>:<path>` 在**文件已被工作树改写**时仍返回**基线版本**（内容类取证的根）

### C. 口径同步（防「又一处手抄」）

- `prompts/build.md` 的取证纪律段（**主改点**）
- `prompts/plan.md` / `prompts/front.md` 若提到基线对照命令 ⇒ 一并核对（**若没提则不新增** ——
  不制造第二处描述面）

## 不做什么（scope 边界）

| 项 | 理由 |
|---|---|
| 改 `base` 的入参语义 / 返回契约 | 属 `delegate-base-resolved-return` improvement（另一个 change） |
| 改 `assertVerifierBaseline` 的校验逻辑 | 本仓的 sha 冻结已正确；本 change 只修**消费端**的比较对象 |
| 把「未跟踪文件」纳入 `git diff` 本身 | git 做不到；用**另一条命令**（`git status --porcelain` / `ls-files --others`）并列，不强塞进 diff |
| 修 `buildBrief:1422` / `delegate-async:1104·1507` 的手抄 | 交接清单 ⑧⑨，另立 |
| 真模型 e2e | 静态层可证「命令有判别力」；「agent 是否照做」属 e2e 层（CS 系列），不在本 change |

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | **有判别力**：fixture 仓（基线提交含 `a.txt`）+ 工作树**改写** `a.txt`（**不 commit**）⇒ `git diff --name-only <base>` **列出** `a.txt`，而 `git diff --name-only <base>...HEAD` **为空**（后者是旧命令失效的证据） | 行为（真 git） | `tests/delegate-core.test.ts`（新建 describe） |
| AC2 | **不误报**：工作树**未**改被取证文件 ⇒ 两点 diff **不含**该文件 | 行为 | 同上 |
| AC3 | **未跟踪文件**：工作树新增**未跟踪**文件 ⇒ `git diff` **不含**它，但 `git ls-files --others --exclude-standard` **含**它（⇒ 纪律必须并列两路） | 行为 | 同上 |
| AC4 | **基线侧可重演**：工作树改写 `a.txt` 后，`git show <base>:a.txt` 仍返回**基线版本**（内容类取证的根） | 行为 | 同上 |
| AC5 | `prompts/build.md` 的基线取法段：命令改为**两点** `git diff --name-only <base>`，且**显式写明**未跟踪文件走另一路；**不再出现**三点写法 | 结构（守卫） | `tests/config-guards.test.ts` |
| AC6 | `prompts/build.md` 写明「基线侧 = 提交内容」与「工作树侧 = 两点 diff（含未提交改动）」的**不对称**（⇒ 后人不会按「对称」直觉改回去）；**并**写明 `git merge-base HEAD <base>` 的**新用途**（祖先关系**诊断**；**对照一律用 `<base>` 本身**） | 结构（守卫） | 同上 |
| AC7 | 回归：`bun test tests/` 全绿（**单独校验退出码**）；anchors 无 `FAIL` / 无 `SKIP` | 结构 | 全量 |
| AC8 | **revert 演练留痕**：把 `build.md` 的命令改回三点 ⇒ AC5 必须红；记录写入 `.rddf/reviews/verifier-baseline-worktree-diff-revert-map.md` | 结构 | 该文件 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [ ] AC1 两点 diff 列出未提交改动、三点 diff 为空（旧命令失效的证据）
- [ ] AC2 未改动的文件不被误报
- [ ] AC3 未跟踪文件走 `ls-files --others` 那一路
- [ ] AC4 `git show <base>:<path>` 在工作树改写后仍返回基线版本
- [ ] AC5 `build.md` 用两点 diff + 明写未跟踪文件那一路 + 不再出现三点写法
- [ ] AC6 `build.md` 写明基线侧/工作树侧的**不对称** + `merge-base` 的新用途（诊断用，对照用 `<base>` 本身）
- [ ] AC7 回归绿 + anchors 无 SKIP
- [ ] AC8 revert 演练留痕
