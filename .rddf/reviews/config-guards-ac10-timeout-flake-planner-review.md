# config-guards-ac10-timeout-flake —— planner 审查记录（metis 1 轮）

> 审查者：**metis**（`subagent`，只读）
> 轮次：**1 轮**（按 `prompts/build.md` §审查配对：新建 improvement / proposal ⇒ metis 1 轮）
> 输入：`.rddf/improvements/config-guards-ac10-timeout-flake.md`（rev 0）+ 指定必读（`tests/config-guards.test.ts:3124-3150`、该文件 `:1-40`、`.rddf/commit-gate.json`）
> 产出：improvement **rev 1** + `openspec/changes/config-guards-ac10-timeout-flake/proposal.md`（立项）

## 0. metis 声明的取证限制

metis 的 shell 只允许只读动词 ⇒ **无 `bun` 执行权限**、`git log --format=…` 亦被拒 ⇒ 它对基线数据的要求（P2）**由 builder 实测后填入**（数据见下）。

## 1. 逐条处置

| # | finding | 处置 | 落点 |
|---|---|---|---|
| **P1** | **AC4 ↔ D4 自相矛盾**：AC4（新增「sha 非空」断言）会让无 git 环境从「跳过」变「红」＝ 改判据强度，而 D4 明确说「不做」 | ✅ 采纳 metis 的**推荐项 (a)**：**AC4 降级为「证据项」**（不新增 `test()`，改用 `git log` 非空输出 + 单跑 AC10④ 的 `1 pass` 作证据）⇒ D4 与 Out of Scope ② 原样保留，**无强度变更** | improvement AC4 + D8 |
| **P2** | 20s 是**魔数**：需基线、p100 采样、推导式与落点注释；且**缺「20s 会红」的反向演练** | ✅ 采纳：实测基线已补（常态 **0.288 / 0.190 / 0.182 s**（junit reporter，3 次全量跑）；负载尾部观测上界 **5024 / 5097ms**）⇒ `timeout = 20000 ≈ 4× 尾部上界`，推导写进代码注释；**反向演练**采纳 metis 的更省方案（timeout 改 2000 + `sleep 3000` ⇒ 必红）；**形态钉死**为对象形态 `{ timeout: 20000 }`（bun 1.3.14 实测可用） | D1 + AC1 |
| **P3** | AC2 若用「更晚的文件」构造 ⇒ **依赖真实提交历史形状**（本仓每次提交都可能翻转它） | ✅ 采纳：**改为确定性 fixture**（临时仓造两个 commit，正反两向 + 同 commit 一例）⇒ 需要把 `sha()` 与祖先判定抽成接受 `(cwd, file)` 的**模块级纯函数**（语义保持）⇒ 显式登记为 D2/D3 | D2 + D3 + AC2 |
| **P4** | D2（并发化）**不值得**：收益不落在任何 AC 上；`execFileSync` → `execFile` 的误实现会退化成**静默跳过**（与 D7 同级危害） | ✅ 采纳 ⇒ **登记为不做**（D6 + Out of Scope ⑤），并记录 metis 的结论「次数下限就是 3（两个 sha + 一次祖先判定），没有第 4 条路」 | D6 + Out of Scope ⑤ |
| **P5** | AC3「AC10④ 内 ≤3」是 **Goodhart 形态**（新增用例不在计数内） | ✅ 采纳：改成**文件级总量口径** —— `execFileSync("git"` 调用点 = **2**（两个 helper），且 AC10④ 与 fixture 用例**共用**它们（单一真源）⇒ 真实仓路径每次 3 次调用 | AC3 |
| **P6** | 「245 个提交」「898 pass / 1 fail」是**会过期的数字**（本仓已有 899 / 914 并存的先例） | ✅ 采纳：全部改成「**以实跑为准**」表述，不再写死数字 | Why + AC7 |
| **P7** | **shallow clone / CI `depth=1`** 未覆盖（`git log` 空 ⇒ 静默跳过；`merge-base` ≥128 ⇒ 假红） | ✅ 采纳 ⇒ **登记为不做**（Out of Scope ⑦），并说明与 ② 同族 | Out of Scope ⑦ |
| **P8** | **`merge-base` 退出码 1 vs ≥128 未区分** | ✅ 采纳 ⇒ 登记为不做（Out of Scope ⑧） | Out of Scope ⑧ |
| **P9** | AC1 演练改被测用例本身 ⇒ 是否污染「复原后复跑绿」的可信度 | ✅ 采纳 metis 的判据：**保留真载体突变**（本仓既有惯例），但补**复原证据 = `git diff --exit-code`**（byte-exact，可机判），并**同时**保留 bun timeout 语义的旁证（临时文件演练只证明语义、不证明被测用例带了参数 ⇒ 两者互补） | AC1④ + AC7 |
| **P10** | 抽 helper 时**顺手抽 `ROOT` / git 工具层** ⇒ scope creep | ✅ 采纳：**只抽两个函数**（`lastCommitSha` / `isAncestor`），不引入通用 git util 层 | D2 |
| **P11** | 「判据成本预算」是隐藏意图的正解，但超出本 change | ✅ 采纳为 **Capabilities 的方向指针** + Out of Scope ⑥（触发条件 = 第二个消费者） | Capabilities + Out of Scope ⑥ |

## 2. metis 的「缺失的验收标准」逐条落点

| metis 建议 | 落点 |
|---|---|
| 超时值的推导依据（基线 + p100 + 算式 + 注释） | D1（推导写进代码注释）+ AC1① |
| 「20s 真的会触发」的反向演练 | AC1③（timeout 2000 + sleep 3000 ⇒ 红） |
| 修复前后同一度量（该用例在全量下的耗时） | AC7（junit reporter 记录每次耗时） |
| `bun test tests/` 的计数以实跑为准 | AC7（「**全绿**」+ 记录项，不写死 pass 数） |
| D6 新断言的判别力（`sha()` 改成 `return ""` ⇒ 必红） | AC8（祖先判定恒真 ⇒ 反向用例必红）+ 证据包 M5 |
| helper 提升后的**单一真源** | AC3（调用点 = 2 且两处共用） |
| 失败文案可归因 | D5 + AC6（用例名/注释含可 grep 短句） |
| 不改归档 spec 文本（命令形态与真源一致） | D4 + AC5 |

## 3. metis 的「边界情况」逐条落点

| finding | 处置 |
|---|---|
| shallow clone / CI depth=1 | Out of Scope ⑦（登记不做） |
| linked worktree（`.git` 是文件） | Out of Scope ⑨ —— 本 change **不引入 `.git` 存在性判断**（AC4 只作证据项）⇒ 现状语义不变 |
| `merge-base` 退出码混同 | Out of Scope ⑧ |
| 文件被删除/改名 ⇒ `git log` 空 ⇒ 静默跳过 | 与 ② 同族（既有边界）⇒ 不改；AC4 证据项可发现 |
| 环境变量 `GIT_DIR` / `GIT_WORK_TREE` 泄漏 | Out of Scope ⑨（现状语义不变，不引入新判断） |
| 「并发执行本来就是根因」 | **部分采纳**：本次**不**去改 bun 的并发模型（超出范围），但把「常态 0.2–0.3s / 负载尾部 5.1s」的实测写进推导 ⇒ 超时按尾部上界取，不按常态取 |
| 导出 tarball / 无 `.git` 环境 | 由 P1(a) 解决：AC4 不新增断言 ⇒ 跳过语义不变 |
| `await Bun.sleep()` 会把用例变 async | 采纳为**演练纪律**：演练必须写成 `async () => { await Bun.sleep(…); … }`（写进 AC1） |
| 同一 commit 也要有实测证据 | AC2 fixture 的第三例（同提交同时改 ⇒ 绿） |

## 4. 自捕（1 条）

| # | 问题 | 后果 | 修法 |
|---|---|---|---|
| B1 | rev 0 草稿把 **D2 写成「（可选）」** | 可选变更进 change ⇒ 范围未定，AC3 的条件式验收无法机判 | rev 1 改为**明确「登记为不做」**（D6 + Out of Scope ⑤），并附 metis 的判据（次数下限 = 3，无第 4 条路） |

## 5. 预算

| 项 | 轮次 |
|---|---|
| metis（本记录） | **1 轮**（该 improvement 总计 1 轮） |
| oracle / critic | 待实施后：治理面（治理守卫载体）⇒ 各 1 轮 |

## 6. 结论

- **improvement rev 1 已修订**（11 条 finding 全处置：9 条采纳 / 1 条部分采纳 / 1 条自捕）。
- **立项完成**：`openspec/changes/config-guards-ac10-timeout-flake/`（`proposal.md` + `.openspec.yaml`）。
- **判据真源**：proposal 的 **AC1–AC9**。
- ⚠ **本 change 不改判据强度**（AC4 取 metis 推荐的证据项形态）⇒ 「静默跳过」「shallow clone」「merge-base 退出码」三条既有边界**原样保留并登记**。
