# ac10-four-decision-anchor — AC10④ 的判据对象从「父篇文件」收窄到「父篇的决策锚点」

> **登记来源**：`librarian-delegate-contradiction` 实施期的**提交门阻塞**（用户 2026-11-23 裁决：先修判据，再提交该 change）。
> **判据真源**：归档 change `openspec/changes/archive/2026-11-14-class-write-scope-alignment/proposal.md` 的 **AC10④**（顺序判据）与 **AC10①–③**（内容判据，已由既有守卫覆盖，本条**不动**）。
> **执行路径**：常规 change —— 改守卫判据（`tests/config-guards.test.ts` + `tests/helpers/real-repo-git.ts`）⇒ **治理面** ⇒ oracle（`审查域: 治理面`）→ critic。
> **核对零改动**：`tests/real-repo-git-budget.test.ts`（元守卫）**本条不改**（helper 计数仍 2、预算仍 3、用例标题逐字保留 ⇒ 其被 pin 的片段零漂移）—— 刻意如此，见 What Changes §1。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在（`.rddf/state/.planner-handoff.json` 缺失）⇒ 走**内置流程**。

## Why

守卫 `tests/config-guards.test.ts` 的 **AC10④**（父篇 ADR 的 commit 必须是代码 commit 的祖先或同一 commit）按**文件级**判定：

```ts
const parentSha = lastCommitShaInRepo("docs/adr/ADR-backend-handoff-role-class.md")
const codeSha = lastCommitShaInRepo("lib/delegate-core.ts")
expect(isAncestorInRepo(parentSha, codeSha)).toBe(true)
```

⇒ **只要有人后来碰过父篇 ADR 这个文件**（哪怕只改「关联 change」指针），父篇的「最后提交」就比代码新 ⇒ 判红 ⇒ **`.rddf/commit-gate.json` 的 `bun test tests/` 退出非 0 ⇒ 工具层验证门 fail-closed ⇒ 本仓此后任何提交都被拒**。

**已发生的事实**（2026-11-23）：提交 `0f09b9c`（**纯文档**，改父篇 ADR 的「关联 change」元数据行 + D7 正文里的归档指针；**该提交的文件集**见 `git show --stat 0f09b9c` ⇒ 其中不含 `lib/delegate-core.ts`）⇒ 该提交**自己**跑出来的套件是绿的（提交前测），提交**之后** AC10④ 变红 ⇒ 仓库进入「不可提交」状态 ⇒ `librarian-delegate-contradiction` 的提交被门禁实测拒绝：

```
commit-gate: 验证命令失败 ⇒ 拒绝提交：
$ bun test tests/
(fail) … AC10④：父篇 ADR 的 commit 必须是代码 commit 的祖先或同一 commit（父篇滞后必红）
```

⇒ 该红项是**真判据打在真事实上**（「父篇文件被改过」这件事确实发生过），但它**测的不是判据想测的东西**：AC10④ 的意图（归档 change 的 C.5「**与代码同批**」）是「**父篇的 D3 决策行**必须与实现它的代码同批落地」，而文件级判定把「父篇的**元数据指针**被更新」也算成了「父篇决策滞后」。

**为什么不能靠「改代码提交顺序」绕过**：唯一能让文件级判定转绿的办法是「有一个晚于父篇 ADR 的 `lib/delegate-core.ts` 提交」⇒ 要么给机制文件塞无意义改动（**刷守卫**），要么改判据本身（**本条**）。

## What Changes

**判据对象收窄**：父篇一侧从「父篇 ADR **文件**的最后提交」改为「父篇 ADR 的**决策锚点**（D3 的 verifier **写集 roots 声明段**：`` `.rddf/reviews/**` + `.rddf/state/verifier/**` ``）的最后一次**内容**变更提交」。

> ⚠ **锚点取「roots 声明段」而非单个根**（oracle 审查第 1 条的修正，已采纳）：`-S` 的触发条件是「该字面量**出现次数**变化」⇒ 若只钉其中一个根，则**另一个根**被改时计数不变 ⇒ 不触发 ⇒ 决策已滞后而顺序判据假绿。⇒ 锚点取两段 roots 声明的**连续子串**：任一根增删/改名 ⇒ 该段计数变化 ⇒ 必触发；而单元格里的**括注/交叉引用**（如「见 `ADR-class-write-scope-alignment` D1b」）**不在**锚点内 ⇒ 改指针这类**元数据**编辑仍不触发 ⇒ 误报面保持消除。

1. **`tests/helpers/real-repo-git.ts`**：`lastCommitSha(cwd, file, literal?)` / `lastCommitShaInRepo(file, literal?)` 增加**可选第三参**：给出 `literal` 时语义收窄为「该字面量在文件里的**出现次数**发生过变化」的最后提交（`git log -1 -S<literal> --format=%H -- <file>`）；不给出 ⇒ 文件级语义**逐字不变**。
   - **为什么用 `-S`（内容变更）而不是文件级**：`-S` 只在「该字面量的**出现次数**变化」时报该提交 ⇒ 元数据指针改动（不碰锚点）**不触发** ⇒ 误报面消除；而**决策行被改**（锚点增删）**必触发** ⇒ 判据的**原有判别力完整保留**。
   - **为什么是「可选参数」而不是新增两个函数**：新增函数 ⇒ 必须改 `tests/config-guards.test.ts` 的 import 片段 ⇒ 该片段被 `governance-paths-config.json` 的 `edits[10]` **逐字节 pin** 住 ⇒ 必然引入手势面清单漂移；可选参数 ⇒ import 片段**零改动** ⇒ 漂移面从 4 处降到 3 处（且那 3 处是**判据本体**，不可避免）。
2. **`tests/config-guards.test.ts`**：
   - **AC10④** 改为：`parentSha = lastCommitShaInRepo(父篇, ANCHOR)`（**锚点**语义），`codeSha = lastCommitShaInRepo("lib/delegate-core.ts")`（文件级语义）⇒ `isAncestorInRepo(parentSha, codeSha)` 为真。用例**标题逐字保留**（⇒ 元守卫清单 `REAL_REPO_GUARDS` 无需改、其 pin 不漂）。
   - 新增一条**零 git 成本**的精度守卫：`ANCHOR` 在父篇 ADR 中**恰好出现 1 次**且该次位于 D3 写集行（`| \`verifier\` |` 开头）⇒ `-S` 的精度被钉死；ADR 一旦重构 ⇒ **响亮地红**（fail-closed），而不是静默失去精度。
   - **fixture 用例扩到四态**：① 锚点行先改、代码后改 ⇒ 绿；② 代码先改、锚点行后改 ⇒ 红（**判据的判别力仍在**）；③ 同提交 ⇒ 绿；④ **锚点改动之后又有一次纯元数据提交** ⇒ **仍绿**（= `0f09b9c` 的形态 ⇒ 误报类被 fixture 钉死）。
   - 「命令形态不得漂移」用例**增钉**新命令形态（原有两条形态逐字保留）。
3. **`.rddf/rollback/role-class-write-set.json`**（**机制面**，本次不可避免的连带面）：该组清单的 `edits[113]/[114]/[115]` 的 `find` **逐字节 pin** 着 AC10④ 用例 / fixture 用例 / 命令形态用例 ⇒ 判据一改 ⇒ `find_count` 漂移 ⇒ `tests/rollback-manifests.test.ts` 红 ⇒ 必须**同批更新清单的 `find`**（回滚清单的既定处置：「改措辞后须同步更新清单」）。
   - ⇒ 按 ADR D5 的**两段式**：同批**撤 `last_drill`** + registry 两个条目（`backend-handoff-role-class` / `class-write-scope-alignment`，组清单）退 `proving` ⇒ 提交 ⇒ 演练（隔离副本）PASS ⇒ 回填 `last_drill` ⇒ 转回 `active`（下一提交）。
4. **`docs/test-authoring.md` §9**：唯一入口清单补「可选字面量参数」这一形态（规则文本同步）。

## 验收标准

| AC | 判据 | 证据载体 |
|---|---|---|
| AC1 | 父篇一侧用**内容锚点**（`-S`）定位「决策行最后一次变更提交」，代码一侧仍用文件级 `git log -1 --format=%H`；二者经 `git merge-base --is-ancestor` 判祖先 | `tests/config-guards.test.ts` AC10④ |
| AC2 | 锚点（roots 声明段）在父篇 ADR 中**恰好 1 次**且位于 `\| \`verifier\` \|` 行 ⇒ `-S` 精度被钉死；不满足 ⇒ 守卫红 | 同上（一条零 git 断言） |
| AC3 | **判别力不丢**：代码先改、锚点后改 ⇒ 仍**红**（fixture 态②） | fixture 用例 |
| AC4 | **误报消除**：锚点改动之后再有纯元数据提交 ⇒ **绿**（fixture 态④） | fixture 用例 |
| AC5 | helper 的新形态经 `tests/helpers/real-repo-git.ts` 唯一入口（元守卫 AC1 红 / AC7 红）；预算登记**零改动**（`REAL_REPO_GUARDS` 的 `budget` == 源码实测调用点数；per-call 超时不得被吞） | `tests/real-repo-git-budget.test.ts` |
| AC6 | `bun test tests/` **全绿**（含本条自身；AC10④ 转绿 ⇒ 提交门恢复可用） | 全量套件 + `bash scripts/commit-gate-doctor.ts` |
| AC7 | 归档 spec 的**两条原命令形态逐字保留**（`git log -1 --format=%H -- <file>` / `git merge-base --is-ancestor`）；新形态另钉 | 「命令形态不得漂移」用例 |
| AC8 | **机制面连带面**：组清单 `role-class-write-set` 的 `edits[113]/[114]/[115]` 的 `find` 与实现一致（`find_count` == 1）；撤 `last_drill` 后 registry 两条目退 `proving`；演练 PASS 后回填 `last_drill` 并转回 `active` | `tests/rollback-manifests.test.ts` + `scripts/rollback-drill.ts` |

## 后果 / 代价

| 面 | 后果 |
|---|---|
| **提交门** | ✅ **恢复可用** —— 纯文档提交不再把仓库打成「不可提交」（此前 `librarian-delegate-contradiction` 的提交被实测拒绝） |
| **判据强度** | 「父篇**写集 roots**决策滞后于代码」**必红**（roots 声明的任何编辑 ⇒ 锚点计数变化 ⇒ `-S` 触发）；「父篇 D3 行内**锚点之外**的注记面」不触发 ⇒ 由内容守卫 `AC10①–③` 兜底（内容不符 ⇒ 必红）⇒ **不是静默放行**，但顺序信号在该面失效（残余面已登记） |
| **机制面成本** | 组清单 `role-class-write-set` 的三处 `find` 必须**同批更新**（判据合法变更的必然连带）⇒ 清单内容实质改动 ⇒ 撤 `last_drill` + registry 退 `proving` ⇒ **多一次提交**（演练 PASS 后回填转 `active`） |
| **pin 面** | 通过「可选参数」+「用例标题逐字保留」把漂移面从 **4 处降到 3 处**（import 片段与元守卫**零改动**）⇒ 其余清单的宽 `find` 问题**仍在**（backlog `rollback-manifest-find-narrowing`） |
| **归档契约** | 归档 AC10④ 的**父篇侧**命令形态（文件级 `git log -1 --format=%H`）**不再被执行**（改走 `-S`）⇒ 归档件不可变 ⇒ 差异在本 proposal 与审稿记录里显式登记；helper 侧的**两条原形态逐字保留**（pin 作用改为「防 helper 形态漂移」） |

## Out of Scope

1. **不改 AC10①–③**（父篇 D3 行内容 + Status 修订记录）—— 由既有守卫 `AC10：父篇 D3 verifier 行已落改 + Status 有修订记录` 覆盖，本条**只动顺序判据**。
2. **不改归档 spec**（`class-write-scope-alignment` 的 AC10④ 逐字形态）—— 归档件不可变；本条改的是**现行守卫**的实现口径，差异在本 change 的 proposal 与审稿记录里显式登记。
3. **不修其它历史遗留**（如 `docs/` 内 23 处悬空路径引用）—— 只记录，不顺手清理。
4. **不动 `prompts/**` 与 `docs/adr/**`** —— 本条是测试侧判据精化，不涉及行为面。
5. **不窄化其余清单的宽 `find`** —— 那是 backlog `rollback-manifest-find-narrowing` 的范围；本条只同批更新**被本次改动必然撞到**的三处 `find`。
6. ⚠ **已登记的残余面**（oracle 审查第 1/2 条 + critic SF-1 的修正结论）：`-S` 的键是**精确子串** ⇒ **roots 声明本身**的任何编辑（增删根 / 改名 / 两段顺序对调 ⇒ 锚点计数 1→0）**必触发** ⇒ 写集决策滞后**无漏检面**；残余面是「D3 行内**锚点之外**的注记面」（如改写「过渡期规则已退役」这类注记）—— 该面属**元数据 / status 性质**，由**内容守卫**（AC10①–③）兜底（内容不符 ⇒ 必红 ⇒ 引人工作业）⇒ **不是静默放行**，但顺序信号在该面失效。彻底闭合需要按「行级差异」而非「子串计数」定位（成本显著更高）⇒ 本条不做。
