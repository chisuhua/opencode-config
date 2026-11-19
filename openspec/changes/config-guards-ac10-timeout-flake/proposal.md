# config-guards-ac10-timeout-flake — AC10④ 因 bun 默认 5s 超时而**假红**（并卡住提交门）

> 输入：`.rddf/improvements/config-guards-ac10-timeout-flake.md`（5 段草稿，**metis 1 轮审后修订**；机制细节以该文件为准，本 proposal 只保留**可验收的那一层**）。
> planner 审查：`.rddf/reviews/config-guards-ac10-timeout-flake-planner-review.md`（metis 的 11 条 finding 逐条处置 + 1 处自捕）。
> 触发：用户 2026-11-19 指令「对 AC10④ 的抖动问题进行立项」。
> 判据真源（**命令形态**）：`openspec/changes/archive/2026-11-14-class-write-scope-alignment/proposal.md` 的 **AC10④**（逐字规定了 `git log -1 --format=%H -- <file>` 与 `git merge-base --is-ancestor`）—— ⇒ 命令形态**不得漂移**（AC5）。
> 性质：**只改测试**（`tests/config-guards.test.ts`）⇒ 运行时**零影响**。
> 决策真源：**无新决策** —— 本 change **不改任何 ADR 决策、不改判据语义/强度**，只修**执行成本与失败形态**。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置（`.rddf/state/.{arch,planner}-handoff.json`）不存在 ⇒ 走**内置流程**。

## Why

AC10④ 是真判据（父篇 ADR 的 commit 必须是代码 commit 的祖先或同一 commit ⇒ 父篇滞后必红），但它对**真实仓库**跑 3 次 git 子进程，在负载下会越过 bun 的默认超时（**5000ms**）⇒ **假红**：

| 事实 | 证据 |
|---|---|
| bun 默认每用例超时 5000ms（本仓无 `bunfig.toml`） | 实测：6s 用例不带超时 ⇒ 恰好 `[5000.00ms] this test timed out after 5000ms` 红；带 `{ timeout: 20000 }` ⇒ 绿 |
| 该用例对真实仓库跑 3 次 git 子进程（2× pathspec `git log` + 1× `merge-base`） | `tests/config-guards.test.ts:3126-3148` |
| 常态耗时 **0.18–0.29s**（junit reporter，全量跑 3 次：0.288 / 0.190 / 0.182 s） | `bun test tests/ --reporter=junit --reporter-outfile=…` |
| 负载尾部实测 **5024 / 5097ms** ⇒ 越过默认超时 ⇒ 判红；单跑 ~1.09s 绿 | 多次全量跑的红输出（失败项即该用例） |
| 全仓**只有这一条**判据跑真实仓库（其余 git 调用都在临时 fixture 仓库） | grep `execFileSync("git"` 逐文件计数 |

**两条危害**：

1. **随机阻塞提交** —— `.rddf/commit-gate.json` 的 `verify_commands` 含 `bun test tests/` ⇒ 一次假红就让工具层验证门拒掉提交，与被改内容无关；
2. **诊断误导** —— 失败形态是**超时**而非断言失败，报错文案读起来像「父篇滞后」的真问题 ⇒ **误诊方向**会把排查引向 ADR 提交顺序，而不是机器负载。

**一条不能走的捷径**：`sha()` 的 `catch { return "" }` 会吞掉任何 git 失败 ⇒ 给 `execFileSync` 加 `timeout` 选项会让超时抛错被吞 ⇒ **静默跳过**（判据消失且无征兆），比假红更坏。

## What Changes

### D1 显式超时（主修）

```ts
test("AC10④：父篇 ADR 的 commit 必须是代码 commit 的祖先或同一 commit（父篇滞后必红）", () => { … }, { timeout: 20000 })
```

- **形态**：对象形态 `{ timeout: 20000 }`（bun 1.3.14 实测可用）。
- **值的推导**（写进代码注释）：常态 ~0.3s；负载尾部观测上界 ~5.1s ⇒ 取 ≈ **4× 尾部上界 = 20s** ⇒ 常态与尾部都远在界内，真挂死仍会红。
- **效果**：慢 ≠ 红；超时只在 ~20s 处触发 ⇒ 基本只在真挂死时出现。

### D2 抽出两个模块级纯函数（语义保持，单一真源）

```ts
/** 某文件在给定仓库里的最后提交 sha（出错 ⇒ 空串 ⇒ 调用方按「跳过」处理，语义与原实现一致）。 */
function lastCommitSha(cwd: string, file: string): string
/** a 是否为 b 的祖先或同一 commit。 */
function isAncestor(cwd: string, a: string, b: string): boolean
```

- **只抽这两个**，不抽通用 git 工具层（不引入 `ROOT`、不做 env 清理）。
- AC10④ 与新增的确定性用例**共用**这两个 helper ⇒ 事实只有一份实现。

### D3 新增确定性用例（不依赖真实提交历史形状）

在 `mkdtempSync` 造出的临时仓里造两个提交，验证祖先判定三态：

| 场景 | 期望 |
|---|---|
| c1 改「父篇」、c2 改「代码」 | 父篇 sha 是代码 sha 的祖先 ⇒ **绿** |
| c1 改「代码」、c2 改「父篇」 | 非祖先 ⇒ **红** |
| 同一个提交同时改两个文件 | 同一 commit ⇒ **绿** |

⇒ 判别力不再依赖「哪个文件的提交更晚」这种**会被后续提交翻转**的形状。

### D4 命令形态不得漂移

`git log -1 --format=%H -- <file>` 与 `git merge-base --is-ancestor` 必须与归档 spec（`class-write-scope-alignment` 的 AC10④）**逐字一致**。
（实测：`--no-renames` 121ms / `rev-list` 120ms / 原形态 125ms ⇒ 无收益；两文件合并 `--name-only` 875ms ⇒ 更差 ⇒ **保持原形态**。）

### D5 失败文案可归因

用例名或注释含可 grep 短句（如「慢执行不判红」「超时 ≠ 父篇滞后」）⇒ 报告里出现超时时不会误导排查方向。

### D6–D9 不做 / 不改

| # | 项 | 理由 |
|---|---|---|
| D6 | 并发化两个 `git log`（`execFile` + `Promise.all`） | 收益不落在任何判据上；`execFileSync` → `execFile` 的误实现会退化成**静默跳过**（与 D7 同级危害）；次数下限就是 3（两个 sha + 一次祖先判定），**没有第 4 条路** |
| D7 | 给 `execFileSync` 加 `timeout` 选项 | 会被现有 `catch` 吞掉 ⇒ **静默跳过**，比假红更坏 |
| D8 | 改 `sha()` 的错误处理（区分「无 git」/「git 出错」） | 属**改判据强度**（无 git 环境从「跳过」变「红」）⇒ 登记为已知边界 |
| D9 | 判据语义、被比较的两个文件、其余用例 | 本 change 只修执行成本与失败形态 |

## 验收标准

> 每条配工具证据；`skip` ≠ `pass`。

| AC | 判据 | 类型 | 来源 |
|---|---|---|---|
| AC1 | **显式超时生效**（正反两向 + byte-exact 复原）：① 源码含 `test(…AC10④…, { timeout: 20000 })`；② 临时插 `await Bun.sleep(6000)`（用例改 `async`）⇒ **绿**；③ 临时 `timeout: 2000` + `await Bun.sleep(3000)` ⇒ **红（超时）**；④ `git diff --exit-code tests/config-guards.test.ts` ⇒ 复原无差异 | 结构 | metis P2 / P9 |
| AC2 | **判据语义不变（确定性 fixture）**：临时仓三态（父篇先改 ⇒ 绿 / 代码先改 ⇒ 红 / 同提交 ⇒ 绿）；真实仓一次 ⇒ 绿（**证据项**：记录当时两个 sha + `git log -1 --format=%ci`） | 结构 | metis P3 |
| AC3 | **单一真源 + 子进程口径**：该文件内 `execFileSync("git"` 调用点 = **2**（两个 helper）；AC10④ 与 fixture 用例**共用**；真实仓路径每次执行 3 次 git 调用 | 结构 | metis P5 / P10 |
| AC4 | **判据真的执行**（**证据项**，不新增用例）：`git log -1 --format=%H -- <两个文件>` 均返回**非空** sha；`bun test tests/config-guards.test.ts -t "AC10④"` ⇒ 1 pass | 结构 | metis P1（推荐项 a） |
| AC5 | **命令形态与归档 spec 一致**：测试源码含 `git log -1 --format=%H --` 与 `git merge-base --is-ancestor`（逐字） | 结构 | metis「不改归档 spec 文本」 |
| AC6 | **失败文案可归因**：用例名或注释含可 grep 短句（「慢执行不判红」/「超时 ≠ 父篇滞后」） | 结构 | metis 隐藏意图 |
| AC7 | **回归**：`bun test tests/` **全绿**（连跑 3 次；用 junit reporter **记录该用例每次耗时**）；`bash scripts/check-upstream-anchors.sh` 全绿；`openspec validate --strict` valid | 结构 | metis P2 / P6 |
| AC8 | **不空转**：该文件 0 `skip` / 0 `todo`；新增 fixture 用例**非恒真**（把祖先判定写成恒真 ⇒ 反向用例必红） | 结构 | metis P5 |
| AC9 | **证据包**：**≥3** 条突变（去掉超时 / 祖先判定恒真 / 命令形态漂移）的「突变描述 + 红输出 + 复原 + 复跑绿」落 `.rddf/reviews/config-guards-ac10-timeout-flake-mutations.md` | 结构 | metis P2 |

**取红 / 钉住 分档**

| 分档 | AC | 说明 |
|---|---|---|
| 🔴 **取红** | AC1（M1/M2）、AC2（M3/M5）、AC5（M4）、AC8（M3） | 这四条提供本 change 的判别力 |
| 🟡 **钉住** | AC3、AC4、AC6、AC7、AC9 | 只防回归，不得写成「红」 |

**变红演练（5 条；一判据一行）**

| # | 突变点 | 必红的断言 |
|---|---|---|
| M1 | 去掉 `{ timeout: 20000 }`（保留 `sleep(6000)`） | AC1①（源码级）+ AC1②（慢执行变红） |
| M2 | `timeout` 改成 2000 + `await Bun.sleep(3000)` | AC1③（超时边界真会触发 ⇒ 红） |
| M3 | 把祖先判定写成恒真（`isAncestor` 恒 `true`） | AC2 反向用例（代码先改 ⇒ 必须红）+ AC8 |
| M4 | 命令形态漂移（`git log` ⇒ `git rev-list -1 HEAD`） | AC5（与归档 spec 逐字一致） |
| M5 | 把 `lastCommitSha` 改成恒返回 `""` | AC2 fixture 用例（判据空跑 ⇒ 必红） |

## Out of Scope

| # | 不做 | 理由 |
|---|---|---|
| ① | 给 `execFileSync` 加 `timeout` 选项 | 会被现有 `catch { return "" }` 吞掉 ⇒ **静默跳过**，比假红更坏 |
| ② | 改 `sha()` 的错误处理（区分「无 git」/「git 出错」） | 改判据强度（D8）⇒ 另案 |
| ③ | 给全仓加 `bunfig.toml` 或统一调大默认超时 | 全仓级测试策略变更；会掩盖其它用例的慢 |
| ④ | 把 AC10④ 改成「冻结后不再每次跑」 | 该判据**不是**一次性验证（代码再变而父篇不跟随时它必须仍红）⇒ 删掉 = 丢判据 |
| ⑤ | 并发化 / 换 `rev-list` / 加 `--no-renames` / 合并 `--name-only` | 实测无收益或更差 ⇒ 无据改动不做 |
| ⑥ | 把「触真实仓历史的守卫必须声明显式超时与子进程上限」立为**全仓约定** | 属新需求；**触发条件** = 出现**第二个**消费者时再立项 |
| ⑦ | **shallow clone / CI `depth=1`**（`git log` 空 ⇒ 静默跳过；`merge-base` ≥128 ⇒ 假红） | 与 ② 同族（强度问题）⇒ 登记为已知边界，**本 change 不修** |
| ⑧ | 区分 `merge-base` 退出码 1（非祖先，真红）与 ≥128（参数/仓库异常，假红） | 同 ② 同族 ⇒ 登记为已知边界 |
| ⑨ | **linked worktree**（`.git` 是文件）与外部 `GIT_DIR` / `GIT_WORK_TREE` 泄漏 | 本 change **不引入 `.git` 存在性判断、不清 env**（AC4 只作证据项）⇒ 现状语义不变；登记 |

## 实施顺序

1. D2：抽 `lastCommitSha` / `isAncestor` 两个模块级纯函数（语义保持）；
2. D1：给 AC10④ 加 `{ timeout: 20000 }` + 推导注释；D5：可归因短句；
3. D3：加确定性 fixture 用例（三态）；
4. D3/D4：核对命令形态与归档 spec 逐字一致（AC5）；
5. 突变演练 5 条（AC9；M1/M2 需临时改被测用例 ⇒ 复原后 `git diff --exit-code` 证明）；
6. 回归（AC7；junit reporter 记录该用例每次耗时）；
7. oracle（治理面）→ critic → 独立验收。
