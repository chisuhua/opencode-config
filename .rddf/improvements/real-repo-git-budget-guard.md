---
revision_count: 1
last_feedback_id: null
last_feedback_at: null
feedback_status: none
---

# real-repo-git-budget-guard — 「触真实仓历史的守卫」必须声明显式超时与子进程上限（**提前立项**）

> **实施状态**：**已立项**（2026-11-19）⇒ `openspec/changes/real-repo-git-budget-guard/`（逐条判据以该 proposal 的 **AC1–AC9** 为唯一真源；本文只保留动机与机制）
> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。**由 builder 代 planner 起草**（用户 2026-11-19 指定对本 follow-up 立项）⇒ **metis 1 轮审后已修订**（rev 1；逐条处置见 `.rddf/reviews/real-repo-git-budget-guard-planner-review.md`）。
> 来源：`config-guards-ac10-timeout-flake` 的 **Out of Scope ⑥**（「触真实仓历史的守卫必须声明显式超时与子进程上限」—— 原写「触发条件 = 出现**第二个**消费者时立项」）。
> **提前立项的理由**：这条规则的价值恰恰是**预防性** —— 等第二个消费者出现才立项，等于「第二次事故已发生才写规则」。提前立项 ⇒ 变成**从现在起就生效的机判闸门**。
> ⚠ **实施顺序（metis 建议 12 采纳）**：**先落 `config-guards-ac10-timeout-flake`（止疼），本项随后** —— 本项是结构重构，不该排在止疼前面。
> 决策依据：**无新决策** —— 本项**不改任何 ADR 决策、不改既有判据语义/强度**，只给「触真实仓历史」这一类守卫立**成本预算**与**单一入口**。
> 关联 change：`openspec/changes/real-repo-git-budget-guard/`（**已立项** 2026-11-19）。
> 执行路径预估：**常规 change**（新增 1 个 helper 模块 + 1 个守卫文件 + 迁移唯一消费者 ⇒ 新增治理面守卫 ⇒ **oracle + critic 各 1 轮**）。

## Why

### 事实：目前只有**一个**消费者，但它已经咬过一次

| 事实 | 证据 |
|---|---|
| `tests/` 层**唯一**触真实仓历史的守卫 = **AC10④**（`tests/config-guards.test.ts:3124-3150`）：2× `git log -1 --format=%H -- <path>`（pathspec ⇒ 走**全部提交**的树）+ 1× `git merge-base --is-ancestor` | grep 统计：其余 git 调用**全部在 `mkdtempSync` 造的临时仓**里 |
| 它已因 **bun 默认 5s 超时**假红过（负载尾部 5024 / 5097ms）⇒ 随机阻塞提交门（`.rddf/commit-gate.json` 的 `verify_commands` 含 `bun test tests/`） | `config-guards-ac10-timeout-flake` 的 Why 段 |
| `scripts/` 层也有真实仓 git（`build_critic_prompt.sh` / `opencode-update.sh:209`） | grep `git ` scripts/*.sh |
| **但 shell 脚本不受 bun 的 5s 超时约束** ⇒ 不属同类风险（`opencode-update.sh:209` 的祖先判定**语义同类**，另案） | 同上 |
| 提交数会**持续增长** ⇒ pathspec 历史查询的成本**只增不减** | 当前提交数（以实跑为准） |

### P0 spike 的硬数据（rev 0 缺的步骤，已补）

扫描 `tests/**/*.ts` 的**全部 git 子进程调用点**（共 **37** 处），按 `cwd` 形态三态分类：

| 形态 | 数量 | 含义 |
|---|---|---|
| **R**（`cwd` 表达式含 `import.meta.dir` ⇒ 指向仓根） | **2** | 正是 AC10④ 的两处 ⇒ **今天零误报** |
| **缺 `cwd`**（省略 ⇒ 隐式真仓，`bun test` 的进程 cwd 就是仓根） | **0** | 今天零误报；但这是**绕过一切 cwd 判定最便宜的路径** ⇒ 必须 fail-closed |
| **U**（形参 `git(args, cwd)` 泛型 helper 3 个文件 / `cwd: dest|project` 9 处 / `tests/probes/**` 1 处） | 13 | **静态不可判定** ⇒ 登记为**已知漏检面** |
| **F?**（fixture 仓，形如 `mkdtempSync` 派生标识符） | 22 | 合法、不在规则范围 |

⇒ **「R 形态唯一入口 + 缺 cwd 即红」今天零误报**，且能覆盖最便宜的逃逸路径（省略 `cwd`）。

### 真实意图：不是「再修一条用例」，而是「让这类守卫的成本**可预算**」

现在的形态是：**成本随仓库历史线性增长，却没有任何机制告诉作者「这条守卫在真实仓上跑、要花多少时间」**。第一次踩坑之所以要花一整轮独立验收才定位到，是因为失败形态是**超时**（读起来像断言失败 ⇒ 误诊方向），而**下一个**同类守卫仍可在没有显式超时的情况下被写出来。

### 为什么要提前立项（而不是等第二个消费者）

- 规则的价值是**预防**：等事故发生再写规则 = 规则只在事后生效一次；
- 闸门在只有一个消费者时成本最低（清单只有一项），却能让**第二个**消费者一出现就被要求走带预算的路径；
- 本仓已在同类问题上吃过两次亏（AC10④ 假红；多个 change 的验收报告里反复登记同一抖动）⇒ 值得一次把口径定死。

## What Changes

> rev 0 的三个候选形态（O1 命令形态匹配 / O2 单一入口禁直接调用 / O3 纯文档）经 metis 与 spike 后**全部推翻**，改为下述形态。

| # | 变更 | 落点 |
|---|---|---|
| **D1** | **新增「真实仓 git 访问」的单一入口 helper** `tests/helpers/real-repo-git.ts`（**非** `.test.ts` ⇒ 可被 import；`tests/` 无「文件集合 == 清单」闸门 ⇒ 可新增）。**接口冻结**（供 sibling change 改写用）：`lastCommitSha(cwd, file)` / `isAncestor(cwd, a, b)`（**cwd 参数化** —— sibling change 的 fixture 三态用例需要它们跑在临时仓里）+ 真仓薄包装 `lastCommitShaInRepo(file)` / `isAncestorInRepo(a, b)`（仓根按 canonical-root 口径取，worktree 感知） | 新文件 |
| **D2** | **两层预算常量**（禁止一个常量承担两种语义）：`REAL_REPO_GIT_TEST_TIMEOUT_MS = 20_000`（**用例级**，= sibling change 的 byte-exact 值）+ `REAL_REPO_GIT_CALL_TIMEOUT_MS = 6_000`（**每次调用**；3 次 × 6s = 18s < 20s，留 2s 余量）；**禁止重试** ⇒ per-call 超时不会被放大 | 同上 |
| **D3** | **错误语义按函数拆**（不按 helper 整体拆）：`lastCommitSha` 保留**逐字** `catch { return "" }`（ENOENT / 非零退出 / 浅克隆 ⇒ 空串 ⇒ 既有「跳过」语义不变）；`isAncestor` 保留「任何失败 ⇒ 判红」；**只有 per-call 超时**（实测 `err.code === "ETIMEDOUT"`，与「非零退出 `status=128`」可区分）⇒ **抛带指引的错**，**不**被吞成空串 | 同上 |
| **D4** | **迁移 AC10④ 到 helper**（本 change 顺手做）⇒ 显式超时由 helper 的预算常量提供 | `tests/config-guards.test.ts` |
| **D5** | **新增元守卫**（检测口径 = **cwd 形态**，不是命令形态）：① **R 形态**（`cwd` 含 `import.meta.dir`）的 git 调用点**只允许**出现在 helper 内 ⇒ 清单外出现 ⇒ **红**；② **缺 `cwd`** 的 git 调用 ⇒ **红**（fail-closed）；③ **扫描根空转** ⇒ 红（扫描到的文件集 == `readdirSync` 递归得到的 `*.test.ts` 集合，不写死数字）；④ **豁免文件集合显式断言**（== {helper, 守卫自身}），不静默 exclude | 新文件 `tests/real-repo-git-budget.test.ts` |
| **D6** | **子进程上限 = 静态计数**（不用运行期计数器）：清单项登记「该 `test(...)` 块内 helper 调用点数」，守卫在源码里数同一块的调用点 ⇒ 不等即红（**一次 helper 调用 = 一次 spawn**，helper 内不重试） | 同上 |
| **D7** | **清单 schema 单一**：`{ file, testTitle, budget }`（`budget` = 该守卫允许的 helper 调用点数）；**不存超时值**（超时在源码的 `{timeout}` 里，守卫**读取并校验** ≥ 用例级常量）⇒ 避免「一份事实两个真源」 | 同上 |
| **D8** | **规则落到具体文档**：主 `docs/test-authoring.md`（已在受管文档集内）+ 次 `tests/README.md`（已有「登记无判别力面」的写法先例）⇒ 规则不只活在报错文案里 | 两个文档 |
| **D9** | **交接给 sibling change**（方案 b）：本项**后**落地 ⇒ 在本项这次提交里**回写** `config-guards-ac10-timeout-flake` 的 **D2 / AC3 / AC5**（其「调用点 = 2」「命令形态在测试源码里」会因迁移到 helper 而变化），并留痕 `.rddf/reviews/real-repo-git-budget-guard-handoff.md` | 两个 change 的文档 |
| **D10** | **登记为不做**：把 `scripts/` 层的真实仓 git 纳入同一闸门（shell 不受 bun 超时约束；`opencode-update.sh:209` 的祖先判定语义同类 ⇒ 另案） | — |
| **D11** | **登记为不做**：把「真实仓 git 历史成本预算」写进 `prompts/build.md` 的规范段（属**改治理规则**，需另走治理面变更）⇒ 本项只落**代码层闸门 + 文档事实性说明** | — |

## Acceptance

> 每条配工具证据；`skip` ≠ `pass`。判据真源 = 本 change 的 proposal（本文只摘要）。

- [ ] **AC1 检测口径（R 形态唯一入口 + 缺 cwd 即红）**：`tests/` 下 **R 形态**（`cwd` 含 `import.meta.dir`）的 git 调用点**只**出现在 helper 内；**缺 `cwd`** 的 git 调用 ⇒ **红**；U 面（形参 helper / `dest` / `project` / `probes`）**显式登记**为已知漏检面（清单列出 13 处）。
- [ ] **AC2 两层预算常量**：helper 导出 `REAL_REPO_GIT_TEST_TIMEOUT_MS = 20_000` 与 `REAL_REPO_GIT_CALL_TIMEOUT_MS = 6_000`；算式「3 × 6s = 18s < 20s」写进代码注释；**禁重试**。
- [ ] **AC3 超时语义分层**：per-call 超时（`err.code === "ETIMEDOUT"`）⇒ **抛带指引的错**（不被吞成空串）；其它错误 ⇒ 维持既有语义（`lastCommitSha` ⇒ 空串跳过；`isAncestor` ⇒ 红）。
- [ ] **AC4 helper 接口冻结 + cwd 参数化**：导出 4 个函数；真仓薄包装的仓根按 canonical-root 口径取。
- [ ] **AC5 静态子进程计数**：清单项登记的 helper 调用点数 == 源码中该 `test(...)` 块内的实际调用点数（不等 ⇒ 红）。
- [ ] **AC6 清单 schema 单一 + 不存超时值**：清单项 = `{ file, testTitle, budget }`；超时从源码读并校验 ≥ 用例级常量（低于 ⇒ 红）。
- [ ] **AC7 扫描根空转 ⇒ 红 + 豁免显式**：扫描到的文件集 == `readdirSync` 递归得到的 `*.test.ts` 集合；豁免集合 == {helper, 守卫自身}（被显式断言）。
- [ ] **AC8 规则有落点 + 回归**：`docs/test-authoring.md` 含该规则段、`tests/README.md` 提及；`bun test tests/` 全绿；anchors 全绿；validate valid；**并**完成 D9 的交接（回写 sibling 的 D2/AC3/AC5 + 留痕）。
- [ ] **AC9 证据包**：**≥3** 条突变的三件套落 `.rddf/reviews/real-repo-git-budget-guard-mutations.md`；其中**逃逸突变**（`Bun.spawnSync([git, log, -1, --, <path>], { cwd: ROOT })`）若**不红**，必须**如实登记为已知漏检**（不得假装覆盖）。

## Capabilities

- 「触真实仓历史的守卫」从**隐性成本**变成**显式预算**：作者写这类守卫时，仓库里已有一份清单 + 一个会拦人的闸门 + 一份写着规则的文档。
- 第二个消费者**一出现就被拦在门口**（而不是等它假红一次、定位一轮、验收一轮才修好）。
- 与 `config-guards-ac10-timeout-flake` 合并后，AC10④ 的显式超时、单一真源、祖先判定三态 fixture **全部落在同一处** ⇒ 两个 change 不留两套实现。

## Impact

| 面 | 影响 |
|---|---|
| 运行时 | **零影响**（只改测试与新增测试 helper） |
| 治理面 | **是**（新增治理面守卫 ⇒ **oracle + critic 各 1 轮**；D11 的「不写 `prompts/build.md`」只是不改**规则文本**，不是「不改治理面」） |
| 体量 | 1 个新 helper（约 60–80 行）+ 1 个新守卫文件（约 100–140 行）+ AC10④ 迁移（净减少） |
| 顺序 | ⚠ **先落 `config-guards-ac10-timeout-flake`（止疼），本项随后** ⇒ 交接面从 3 条 AC 缩到 1 条（AC3） |
| 风险 | ① 检测是**静态启发式**（cwd 形态）⇒ 漏检面必须登记（13 处 U 面 + 逃逸形态）；② 清单需人工维护 ⇒ 清单与源码脱节时须红（AC5/AC6） |

## 不做什么（Out of Scope）

| # | 不做 | 理由 |
|---|---|---|
| ① | 把 `scripts/` 层的真实仓 git 纳入同一闸门 | shell 不受 bun 超时约束；`opencode-update.sh:209` 的祖先判定语义同类 ⇒ 另案 |
| ② | 把「真实仓 git 历史成本预算」写进 `prompts/build.md` 治理规则 | 属**改治理规则**（需另走治理面变更）⇒ 本项只落代码层闸门 + 文档 |
| ③ | 规定 fixture 仓的 git 调用也须显式超时 | fixture 仓是 1–2 提交的小仓 ⇒ 成本可忽略；会把约定稀释成噪音 |
| ④ | 收编 `tests/` 下所有 git 写法（含 fixture） | scope 极大且无收益（fixture 仓本来就快） |
| ⑤ | 用 `git worktree` / `git cat-file --batch` 等更快底层 API 替代 pathspec 查询 | 属**改判据命令形态**（与归档 spec `class-write-scope-alignment` 的 AC10④ 逐字规定冲突）⇒ 不做 |
| ⑥ | 超时预算按提交数**自适应**（`timeout = k × 提交数`） | 引入第二个变量 ⇒ 判据不可机判；固定 20s 已覆盖当前量级 |
| ⑦ | 用**运行期计数器**统计子进程次数 | 需要跨文件模块级可变状态（bun 单进程跑全部文件）⇒ 与本仓「纯函数、无模块级缓存」立场冲突；静态计数零状态且强度相当 |
| ⑧ | 在 `verify_commands` 里加 typecheck | 与本项无关 ⇒ 登记 |
| ⑨ | 用 PATH shim / `bunfig.toml` preload 记录**全量** git 子进程轨迹 | 唯一能精确区分真实仓与 fixture 的办法，但要改进程启动配置（且 sibling change 已拒 `bunfig`）⇒ 「静态检测必然有漏检面」的根因，登记 |
