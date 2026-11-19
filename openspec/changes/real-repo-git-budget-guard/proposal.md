# real-repo-git-budget-guard — 「触真实仓历史的守卫」必须声明显式超时与子进程上限

> 输入：`.rddf/improvements/real-repo-git-budget-guard.md`（5 段草稿，**metis 1 轮审后修订**；机制细节以该文件为准，本 proposal 只保留**可验收的那一层**）。
> planner 审查：`.rddf/reviews/real-repo-git-budget-guard-planner-review.md`（metis 的 14 条 finding 逐条处置 + P0 spike 数据 + 2 条自捕）。
> 触发：用户 2026-11-19 指令「对这个立项有一个新登记的 follow-up：触真实仓历史的守卫必须声明显式超时与子进程上限」。
> 决策真源：**无新决策** —— 本 change **不改任何 ADR 决策、不改既有判据语义/强度**，只给「触真实仓历史」这一类守卫立**成本预算**与**单一入口**。
> 性质：只改测试（新增 1 个 helper + 1 个守卫）+ 迁移既有守卫 + 文档落点 ⇒ 运行时**零影响**。
> ⚠ **实施顺序**：**先落 `config-guards-ac10-timeout-flake`（止疼），本项随后** ⇒ 交接按「后落地者回写前者的 D2/AC3/AC5 + 留痕」。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在 ⇒ 走**内置流程**。

## Why

### 事实

- `tests/` 层**唯一**触真实仓历史的守卫 = **AC10④**（`tests/config-guards.test.ts:3124-3150`）：2× `git log -1 --format=%H -- <path>`（pathspec ⇒ 走全部提交的树）+ 1× `git merge-base --is-ancestor`。
- 它已因 **bun 默认 5s 超时**假红过（负载尾部 5024 / 5097ms）⇒ 随机阻塞提交门（`.rddf/commit-gate.json` 的 `verify_commands` 含 `bun test tests/`）。
- 提交数持续增长 ⇒ pathspec 历史查询的成本**只增不减**。
- `scripts/` 层也有真实仓 git，但 **shell 不受 bun 超时约束** ⇒ 不属同类风险（另案）。

### P0 spike（检测口径的依据，已实测）

扫描 `tests/**/*.ts` 的**全部 git 子进程调用点**（**37** 处），按 `cwd` 形态三态分类：

| 形态 | 数量 | 处置 |
|---|---|---|
| **R**：`cwd` 表达式含 `import.meta.dir`（⇒ 指向仓根） | **2**（正是 AC10④ 两处） | **必须经 helper** |
| **缺 `cwd`**（省略 ⇒ 隐式真仓；`bun test` 进程 cwd 即仓根） | **0** | **fail-closed：出现即红**（最便宜的逃逸路径） |
| **U**：形参 `git(args, cwd)` 泛型 helper（3 文件）/ `cwd: dest|project`（9 处）/ `tests/probes/**`（1 处） | **13** | **静态不可判定 ⇒ 登记为已知漏检面**（AC1 要求显式列出） |
| **F?**：fixture 仓 | 22 | 合法，不在规则范围 |

⇒ **「R 形态唯一入口 + 缺 cwd 即红」今天零误报**，且能覆盖最便宜的逃逸路径。

### 为什么提前立项（而不是等第二个消费者）

规则的价值是**预防**：等事故发生再写规则 = 规则只在事后生效一次；闸门在只有一个消费者时成本最低（清单只有一项），却能让第二个消费者一出现就被要求走带预算的路径。

## What Changes

### D1 单一入口 helper（接口冻结）

新文件 `tests/helpers/real-repo-git.ts`（**非** `.test.ts` ⇒ 可被 import；`tests/` 无「文件集合 == 清单」闸门）：

```ts
export const REAL_REPO_GIT_TEST_TIMEOUT_MS = 20_000   // 用例级预算
export const REAL_REPO_GIT_CALL_TIMEOUT_MS = 6_000    // 每次调用预算（3 × 6s = 18s < 20s，留 2s 余量）
export function lastCommitSha(cwd: string, file: string): string   // cwd 参数化（供 fixture 用例）
export function isAncestor(cwd: string, a: string, b: string): boolean
export function lastCommitShaInRepo(file: string): string   // 真仓薄包装（仓根按 canonical-root 口径取，worktree 感知）
export function isAncestorInRepo(a: string, b: string): boolean
```

- **cwd 参数化是必须的**：sibling change 的「祖先判定三态」fixture 用例要在临时仓里跑这两个函数。
- **禁重试、顺序执行**：per-call 超时不是总预算，重试会放大占用。

### D2 两层预算常量（禁止一个常量承担两种语义）

- 用例级 **20s**（= sibling change AC1 的 byte-exact 值）；
- 每次调用 **6s**；
- 算式「3 次 × 6s = 18s < 20s」写进代码注释；
- **禁止重试**。

### D3 错误语义按函数拆（不按 helper 整体拆）

| 函数 | 现状语义 | 本 change |
|---|---|---|
| `lastCommitSha` | `catch { return "" }`（ENOENT / 非零退出 / 浅克隆 ⇒ 空串 ⇒ **跳过**） | **逐字保留** |
| `isAncestor` | 任何失败 ⇒ **判红** | **逐字保留** |
| **per-call 超时** | 现状**无** per-call timeout ⇒ 挂死由 bun 的用例级超时判红 | **抛带指引的错**（不被吞成空串）⇒ 把「bun 级不可归因红」换成「helper 级可归因红」 |

> ⚠ **强度说明（必读）**：第三条**不是改判据强度** —— 现状不存在 per-call timeout，进程挂死时是 bun 用例级超时判红；helper 抛错只是让同一情形带上**可归因的文案**。判定依据：超时错误形态实测为 `err.code === "ETIMEDOUT"`（`errno = -110`、`status = 0`），与「git 非零退出」（`status = 128`）**可区分**。

### D4 迁移 AC10④ 到 helper

AC10④ 改为调用 `lastCommitShaInRepo` / `isAncestorInRepo` ⇒ 显式超时由 helper 的预算常量提供。

### D5 新增元守卫（检测口径 = **cwd 形态**，不是命令形态）

新文件 `tests/real-repo-git-budget.test.ts`：

1. **R 形态**（`cwd` 含 `import.meta.dir`）的 git 调用点**只允许**出现在 helper 内 ⇒ 清单外出现 ⇒ **红**；
2. **缺 `cwd`** 的 git 调用 ⇒ **红**（fail-closed）；
3. **扫描根空转** ⇒ 红：扫描到的文件集 == `readdirSync` 递归得到的 `*.test.ts` 集合（**不写死数字**）；
4. **豁免文件集合显式断言**（== {helper, 守卫自身}），**不静默 exclude**；
5. **报错文案**含三选一指引：**迁移到 helper / 加 `{timeout}` 并登记 / 登记为已知盲区**（样板：`tests/config-guards.test.ts:1473`）。

### D6 子进程上限 = 静态计数（不用运行期计数器）

清单项登记「该 `test(...)` 块内 helper 调用点数」；守卫在源码里数同一块的调用点 ⇒ 不等即红（**一次 helper 调用 = 一次 spawn**，helper 内不重试）。
⇒ 不用运行期计数器：bun 单进程跑全部测试文件 ⇒ 模块级计数跨文件累加，且与本仓「纯函数、无模块级缓存」立场冲突。

### D7 清单 schema 单一（不存超时值）

`{ file, testTitle, budget }`（`budget` = 该守卫允许的 helper 调用点数）；**超时值不抄进清单**（它在源码的 `{timeout}` 里，守卫**读取并校验** ≥ 用例级常量）⇒ 避免「一份事实两个真源」。

### D8 规则落到具体文档

- 主：`docs/test-authoring.md`（已在受管文档集内）—— 新增「触真实仓历史的守卫：预算与唯一入口」段；
- 次：`tests/README.md` —— 提及该规则与 helper 入口。

### D9 交接给 sibling change（方案 b：保持分离 + 后落地者回写）

本项**后**落地 ⇒ 在本项这次提交里**回写** `config-guards-ac10-timeout-flake` 的 **D2 / AC3 / AC5**（其「该文件内 `execFileSync("git"` 调用点 = 2」「命令形态在测试源码里」会因迁移到 helper 而变化），并留痕 `.rddf/reviews/real-repo-git-budget-guard-handoff.md`。

### D10 / D11 不做

- **D10**：把 `scripts/` 层的真实仓 git 纳入同一闸门（shell 不受 bun 超时约束；`opencode-update.sh:209` 的祖先判定语义同类 ⇒ 另案）。
- **D11**：把「真实仓 git 历史成本预算」写进 `prompts/build.md` 的规范段（属**改治理规则**，需另走治理面变更）⇒ 本项只落代码层闸门 + 文档事实性说明。

## 验收标准

> 每条配工具证据；`skip` ≠ `pass`。

| AC | 判据 | 类型 | 来源 |
|---|---|---|---|
| AC1 | **检测口径**：**R 形态**（`cwd` 含 `import.meta.dir`）的 git 调用点**只**出现在 helper 内；**缺 `cwd`** 的 git 调用 ⇒ **红**；**U 面 13 处**（形参 helper 3 文件 / `dest`/`project` 9 处 / `probes/**` 1 处）**显式登记**为已知漏检面 | 结构 | metis 建议 1 + spike |
| AC2 | **两层预算常量**：helper 导出 `REAL_REPO_GIT_TEST_TIMEOUT_MS = 20_000` 与 `REAL_REPO_GIT_CALL_TIMEOUT_MS = 6_000`；算式「3 × 6s = 18s < 20s」在代码注释里；**禁重试** | 结构 | metis 建议 3 |
| AC3 | **超时语义分层**：per-call 超时（`err.code === "ETIMEDOUT"`）⇒ **抛带指引的错**（不被吞成空串）；其它错误 ⇒ 既有语义不变（`lastCommitSha` ⇒ 空串跳过；`isAncestor` ⇒ 红） | 结构 | metis 建议 2 |
| AC4 | **接口冻结 + cwd 参数化**：导出 D1 的 4 个函数 + 2 个常量；真仓薄包装的仓根按 canonical-root 口径取（worktree 感知），**不引入 `.git` 存在性判断** | 结构 | metis 建议 6 |
| AC5 | **静态子进程计数**：清单项登记的 helper 调用点数 == 源码中该 `test(...)` 块内的实际调用点数（不等 ⇒ 红）；清单项 `budget ≥ 1`（防死项） | 结构 | metis 建议 4 |
| AC6 | **清单 schema 单一 + 不存超时值**：清单项 = `{ file, testTitle, budget }`；超时从源码读并校验 ≥ 用例级常量（低于 ⇒ 红） | 结构 | metis 建议 5 |
| AC7 | **扫描根空转 ⇒ 红 + 豁免显式**：扫描到的文件集 == `readdirSync` 递归得到的 `*.test.ts` 集合；豁免集合 == {helper, 守卫自身}（被显式断言） | 结构 | metis 建议 7 |
| AC8 | **规则有落点 + 回归 + 交接**：`docs/test-authoring.md` 含该规则段、`tests/README.md` 提及；`bun test tests/` 全绿；anchors 全绿；validate valid；**并**完成 D9 交接（回写 sibling 的 D2/AC3/AC5 + 留痕） | 结构 | metis 建议 8 / 10 |
| AC9 | **证据包**：**≥3** 条突变的三件套落 `.rddf/reviews/real-repo-git-budget-guard-mutations.md`；其中**逃逸突变**（`Bun.spawnSync(["git","log","-1","--","<path>"], { cwd: ROOT })`）若**不红**，必须**如实登记为已知漏检**（不得假装覆盖） | 结构 | metis 建议 7（S5） |

**取红 / 钉住 分档**

| 分档 | AC | 说明 |
|---|---|---|
| 🔴 **取红** | AC1（M1/M2）、AC3（M3）、AC5（M4）、AC6（M5） | 这四条提供本 change 的判别力 |
| 🟡 **钉住** | AC2、AC4、AC7、AC8、AC9 | 只防回归，不得写成「红」 |

**变红演练（6 条；一判据一行）**

| # | 突变点 | 必红的断言 |
|---|---|---|
| M1 | 在 `tests/` 新增一处**清单外 R 形态** git 调用 | AC1（R 形态必须经 helper） |
| M2 | 删掉某 git 调用点的 `cwd`（⇒ 隐式真仓） | AC1（缺 cwd ⇒ 红） |
| M3 | 把 helper 的 per-call 超时改成**吞成空串** | AC3（超时必须抛可归因的错） |
| M4 | 把清单项的 `budget` 从 2 改成 5 | AC5（静态计数不等 ⇒ 红） |
| M5 | 把清单项的用例 `{timeout}` 改成 6000（低于 20s 常量） | AC6（超时下限） |
| M6 | **逃逸**：注入 `Bun.spawnSync(["git","log","-1","--","<path>"], { cwd: ROOT })` | 若**不红** ⇒ 必须登记为已知漏检（AC9 要求如实记录） |

**演练纪律**：M1/M2/M5/M6 插入的代码**不得在会执行的用例里真的打真实仓**（插在不被执行的位置），复原证据用 `git diff --exit-code`。

## Out of Scope

| # | 不做 | 理由 |
|---|---|---|
| ① | 把 `scripts/` 层的真实仓 git 纳入同一闸门 | shell 不受 bun 超时约束；`opencode-update.sh:209` 的祖先判定语义同类 ⇒ 另案 |
| ② | 把「真实仓 git 历史成本预算」写进 `prompts/build.md` 治理规则 | 属**改治理规则**（需另走治理面变更）⇒ 本项只落代码层闸门 + 文档 |
| ③ | 规定 fixture 仓的 git 调用也须显式超时 | fixture 仓是 1–2 提交的小仓 ⇒ 成本可忽略；会把约定稀释成噪音 |
| ④ | 收编 `tests/` 下所有 git 写法（含 fixture） | scope 极大且无收益 |
| ⑤ | 用 `git worktree` / `git cat-file --batch` 替代 pathspec 查询 | 属**改判据命令形态**（与归档 spec `class-write-scope-alignment` 的 AC10④ 逐字规定冲突）⇒ 不做 |
| ⑥ | 超时预算按提交数**自适应** | 引入第二个变量 ⇒ 判据不可机判 |
| ⑦ | 用**运行期计数器**统计子进程次数 | 需跨文件模块级可变状态 ⇒ 与本仓「纯函数、无模块级缓存」立场冲突 |
| ⑧ | 在 `verify_commands` 里加 typecheck | 与本项无关 ⇒ 登记 |
| ⑨ | 用 PATH shim / `bunfig.toml` preload 记录**全量** git 子进程轨迹；以及 `git -C` / `bash -c "git …"` / `process.chdir()` / `GIT_DIR` 泄漏 / `tests/fixtures/**` 等逃逸形态 | 唯一能精确区分真实仓与 fixture 的办法，但要改进程启动配置 ⇒ 「静态检测必然有漏检面」的根因，登记 |
| ⑩ | 把「已有两次抖动」写进决策记录 | 属**新决策**（需 architect 立项）⇒ 本 change 不做；事实链已在两个 change 的 Why 段 |

## 实施顺序

1. D1/D2/D3：helper（接口 + 两层常量 + 错误语义分层）；
2. D4：迁移 AC10④；
3. D5/D6/D7：元守卫（cwd 形态检测 + 静态计数 + 清单）；
4. D8：文档落点（`docs/test-authoring.md` + `tests/README.md`）；
5. 突变演练 6 条（AC9；M6 的逃逸结果**如实登记**）；
6. D9：交接（回写 sibling 的 D2/AC3/AC5 + 留痕）；
7. 回归（AC8）→ oracle（治理面）→ critic → 独立验收。
