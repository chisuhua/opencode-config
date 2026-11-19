---
revision_count: 1
last_feedback_id: null
last_feedback_at: null
feedback_status: none
---

# config-guards-ac10-timeout-flake — AC10④ 因 bun 默认 5s 超时而**假红**（并卡住提交门）

> **实施状态**：**已立项**（2026-11-19）⇒ `openspec/changes/config-guards-ac10-timeout-flake/`（逐条判据以该 proposal 的 **AC1–AC9** 为唯一真源；本文只保留动机与机制）
> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。**由 builder 代 planner 起草**（用户 2026-11-19 指定「对 AC10④ 的抖动问题进行立项」）⇒ **metis 1 轮审后已修订**（rev 1；逐条处置见 `.rddf/reviews/config-guards-ac10-timeout-flake-planner-review.md`）。
> 决策依据：**无新决策** —— 本项**不改任何 ADR 决策、不改判据语义**，只修**判据的执行成本与失败形态**。
> 判据真源（命令形态）：`openspec/changes/archive/2026-11-14-class-write-scope-alignment/proposal.md` 的 **AC10④**（逐字规定了 `git log -1 --format=%H -- <file>` 与 `git merge-base --is-ancestor`）—— ⇒ **命令形态不得漂移**。
> 关联 change：`openspec/changes/config-guards-ac10-timeout-flake/`（**已立项** 2026-11-19）。
> 执行路径预估：**常规 change**（只改 `tests/config-guards.test.ts` ⇒ 属治理面判据载体 ⇒ **oracle + critic 各 1 轮**）。

## Why

AC10④ 是一条**真判据**（父篇 ADR 的 commit 必须是代码 commit 的祖先或同一 commit ⇒ 父篇滞后必红），但它当前在**全量跑**下会随机**假红**：

| 事实 | 证据 |
|---|---|
| bun 无 `bunfig.toml`、`package.json` 无 test timeout 配置 ⇒ 每用例默认超时 **5000ms** | `ls bunfig.toml` ⇒ 不存在；bun 1.3.14 实测：不带超时参数的 6s 用例**恰好** `[5000.00ms] this test timed out after 5000ms` 红 |
| 该用例对**真实仓库**跑 **3 次 git 子进程**：2× `git log -1 --format=%H -- <file>`（pathspec ⇒ 走**全部提交**的树）+ 1× `git merge-base --is-ancestor` | `tests/config-guards.test.ts:3126-3148` |
| **常态耗时**：全量跑下该用例 **0.18–0.29s**（junit reporter 实测 3 次：0.288 / 0.190 / 0.182 s） | `bun test tests/ --reporter=junit --reporter-outfile=…` |
| **负载尾部**：同一用例在负载下实测 **5024 / 5097ms** ⇒ **越过 5000ms 默认超时 ⇒ 判红**；单跑 ~1.09s 绿 | 2026-11-18 / 11-19 多次全量跑的红输出（失败项即该用例） |
| **全仓只有这一条**判据跑真实仓库：其余 git 子进程都在**临时 fixture 仓库**（`git init` 出来的一两个提交的小仓库）⇒ 不受本问题影响 | grep `execFileSync("git"` 逐文件计数（`delegate-core` 9 / `delegate-tool` 10 / `verifier-baseline` 11 / 其余各 1，均在临时目录） |
| `sha()` 的 `catch { return "" }` + `if (!parentSha || !codeSha) return` ⇒ **任何** git 失败都**静默跳过**该判据 | `tests/config-guards.test.ts:3132-3138`（注释只说「环境无 git ⇒ 跳过」，git **出错**也走同一条路） |

**危害有两条，第二条更隐蔽**：

1. **随机阻塞提交**：`.rddf/commit-gate.json` 的 `verify_commands` 含 `bun test tests/` ⇒ 一次假红就让工具层验证门拒掉提交，而失败原因与被改内容**无关**；
2. **诊断误导**：失败形态是**超时**（不是断言失败）⇒ 报错文案里出现的是「父篇 ADR 的 commit 必须是代码 commit 的祖先」这条**判据描述**，读起来像「父篇滞后」的真问题，实际是机器慢 —— **误诊方向**会把人引向错误的排查（去查 ADR 提交顺序，而不是查 I/O 负载）。

**还有一处既有边界必须点明（本项不修，但要写清）**：正因为 `sha()` 吞错误，**给 `execFileSync` 加 `timeout` 选项这种看似省事的修法是错的** —— node 侧超时会抛错 → 被 `catch` 吞掉 → 变成**静默跳过**，比假红更坏（判据彻底消失且无任何征兆）。

## What Changes

| # | 变更 | 落点 |
|---|---|---|
| **D1** | **给该用例加显式超时**：形态钉死为 `test(name, fn, { timeout: 20000 })`（bun 1.3.14 实测对象形态可用，且与本仓既有记录里的建议写法一致）⇒ **慢 ≠ 红**；真挂死仍在 20s 处失败（不会掩盖真问题）。**值的推导**（写进代码注释）：常态 ~0.3s、负载尾部观测上界 ~5.1s ⇒ 取 ≈ 4× 尾部上界 = 20s | `tests/config-guards.test.ts` |
| **D2** | **抽出两个模块级纯函数**：`lastCommitSha(cwd, file)` 与 `isAncestor(cwd, a, b)`（语义保持；**只抽这两个**，不抽 git 工具层）⇒ AC10④ 与新增的确定性用例**共用同一实现**（单一真源） | 同上 |
| **D3** | **新增确定性用例**：在 `mkdtempSync` 造出的**临时仓**里造两个提交，正反两向验证祖先判定（父篇先改 ⇒ 绿；代码先改 ⇒ 红；同一提交同时改 ⇒ 绿）⇒ **不依赖真实提交历史的形状**（真实历史形状会被后续提交翻转） | 同上 |
| **D4** | **命令形态不得漂移**：`git log -1 --format=%H -- <file>` 与 `git merge-base --is-ancestor` 必须与归档 spec（`class-write-scope-alignment` 的 AC10④）**逐字一致**（实测：`--no-renames` / `rev-list` 变体**无收益**、合并 `--name-only` 反而更慢 ⇒ 保持原形态） | 同上 |
| **D5** | **失败文案可归因**：用例名/注释写明「慢执行不判红；超时 ≠ 父篇滞后」⇒ 报告里出现超时时不会误诊 | 同上 |
| **D6** | **不做**：并发化两个 `git log`（`execFile` + `Promise.all`）—— 收益不落在任何判据上，且把「同步抛」换成「reject」会引入一条新的错误映射路径，误实现的后果正是 D7 里论证的**静默跳过** | — |
| **D7** | **不做**：给 `execFileSync` 加 `timeout` 选项 —— 会被现有 `catch` 吞掉 ⇒ 静默跳过 | — |
| **D8** | **不做**：改 `sha()` 的错误处理（区分「无 git」与「git 出错」）⇒ 属**改判据强度**（无 git 环境会从「跳过」变「红」）⇒ 登记为**已知边界** | — |
| **D9** | **不改**：判据语义（父篇 commit 必须是代码 commit 的祖先或同一 commit）、被比较的两个文件、其余用例 | — |

## Acceptance

> 每条配工具证据；`skip` ≠ `pass`。判据真源 = 本 change 的 proposal（本文只摘要）。

- [ ] **AC1 显式超时生效**（含正反两向 + 复原证明）：① 源码级：AC10④ 的 `test(...)` 带 `{ timeout: 20000 }`；② **正向**：临时插 `await Bun.sleep(6000)`（用例改 async）⇒ **带**超时 ⇒ **绿**；③ **反向**：临时把 timeout 改成 2000 + `await Bun.sleep(3000)` ⇒ **红（超时）** ⇒ 证明边界真会触发；④ 复原证明 `git diff --exit-code tests/config-guards.test.ts`。
- [ ] **AC2 判据语义不变（确定性 fixture，不依赖真实历史形状）**：临时仓「父篇先改 ⇒ 祖先成立 ⇒ 绿」「代码先改 ⇒ 非祖先 ⇒ 红」「同一提交同时改 ⇒ 绿」三例；真实仓一次 ⇒ 绿（**证据项**：记录当时两个 sha 与 `git log -1 --format=%ci`）。
- [ ] **AC3 单一真源 + 子进程口径**：该文件内 `execFileSync("git"` 调用点 = **2**（sha helper + 祖先 helper）；AC10④ 与 fixture 用例**共用**这两个 helper；真实仓路径每次执行 3 次 git 调用。
- [ ] **AC4 判据真的执行**（**证据项**，不新增用例）：`git log -1 --format=%H -- <两个文件>` 均返回**非空** sha；`bun test tests/config-guards.test.ts -t "AC10④"` ⇒ 1 pass。
- [ ] **AC5 命令形态与归档 spec 一致**：测试源码含 `git log -1 --format=%H --` 与 `git merge-base --is-ancestor`（逐字）。
- [ ] **AC6 失败文案可归因**：用例名或注释含可 grep 的短句（如「慢执行不判红」/「超时 ≠ 父篇滞后」）。
- [ ] **AC7 回归**：`bun test tests/` **全绿**（连跑 3 次；用 junit reporter **记录该用例每次耗时**）；`bash scripts/check-upstream-anchors.sh` 全绿；`openspec validate --strict` valid。
- [ ] **AC8 不空转**：该文件 0 `skip` / 0 `todo`；新增 fixture 用例**非恒真**（把祖先判定写成恒真 ⇒ 反向用例必红）。
- [ ] **AC9 证据包**：**≥3** 条突变（去掉超时 / 祖先判定恒真 / 命令形态漂移）的「突变描述 + 红输出 + 复原 + 复跑绿」落 `.rddf/reviews/config-guards-ac10-timeout-flake-mutations.md`。

## Capabilities

- 提交门不再被**与被改内容无关**的机器慢随机阻塞（本仓每次 commit 都跑 `bun test tests/`，提交数只会增长 ⇒ 这条 pathspec 查询的成本只会上升）。
- 失败形态回到「断言失败 = 真问题」；超时变成**可归因**的例外（20s 才触发 ⇒ 基本只在真挂死时出现），且报告里的措辞不再误导排查方向。
- 「静默跳过」这一既有边界被**写清并钉住**（AC4 证据项），下一次若要动它（D8），有据可依。
- 后续方向（**不在本 change**）：任何**触真实仓历史**的守卫都应声明显式超时与子进程上限 —— 出现第二个消费者时再立项（见 Out of Scope ⑥）。

## Impact

| 面 | 影响 |
|---|---|
| 运行时 | **零影响**（只改测试） |
| 治理面 | **是**（`tests/config-guards.test.ts` 是治理面守卫载体 ⇒ **oracle + critic 各 1 轮**） |
| 体量 | 1 文件 + 约 40–60 行（显式超时 + 两个 helper + 确定性 fixture 用例） |
| 风险 | ① **显式超时可能掩盖真慢**：若某天 `git log` 真挂死，判据在 20s 处红而不是立刻红（仍红，可接受）；② helper 抽取必须**语义保持**（`sha()` 的「出错 ⇒ 空串」语义原样保留，AC3 钉住调用点数量） |

## 不做什么（Out of Scope）

| # | 不做 | 理由 |
|---|---|---|
| ① | 给 `execFileSync` 加 `timeout` 选项 | 会被现有 `catch { return "" }` 吞掉 ⇒ **静默跳过**，比假红更坏 |
| ② | 改 `sha()` 的错误处理（区分「无 git」/「git 出错」） | 改判据强度（D8）⇒ 另案 |
| ③ | 给全仓加 `bunfig.toml` 或统一调大默认超时 | 全仓级测试策略变更，影响面远超本条判据；且会掩盖其它用例的慢 |
| ④ | 把 AC10④ 改成「冻结后不再每次跑」 | 该判据**不是**一次性验证（代码再变而父篇不跟随时它必须仍红）⇒ 删掉 = 丢判据 |
| ⑤ | 并发化两个 `git log` / 换 `rev-list` / 加 `--no-renames` / 合并 `--name-only` | 实测：前两者无收益（121–125ms vs 125ms），合并版更慢（875ms）⇒ 无据改动不做（D6 / D4） |
| ⑥ | 把「触真实仓历史的守卫必须声明显式超时与子进程上限」立为**全仓约定** | 属新需求；**触发条件** = 出现**第二个**消费者时再立项 |
| ⑦ | **shallow clone / CI `depth=1`**：`git log -- <path>` 在浅历史里可能空 ⇒ 静默跳过；`merge-base` 可能以 ≥128 退出 ⇒ 假红 | 与 ② 同族（强度问题）⇒ 登记为已知边界，**本 change 不修** |
| ⑧ | **区分 `merge-base` 退出码 1（非祖先，真红）与 ≥128（参数/仓库异常，假红）** | 同 ② 同族 ⇒ 登记为已知边界 |
| ⑨ | **linked worktree**（`.git` 是文件不是目录）与外部 `GIT_DIR` / `GIT_WORK_TREE` 泄漏 | 现有实现不检查 `.git` 存在性、不清 env ⇒ 现状语义不变；本 change 不引入新的存在性判断（AC4 只作证据项）⇒ 登记 |
