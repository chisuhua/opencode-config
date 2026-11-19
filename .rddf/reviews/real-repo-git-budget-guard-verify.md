# 验收报告 — real-repo-git-budget-guard

> 判据来源：`openspec/changes/real-repo-git-budget-guard/proposal.md` 的「## 验收标准」（AC1–AC9）与「## Acceptance（勾选镜像）」。
> 角色：verifier（只验不改；本轮无实现改动）。
> 已用轮次：**1**（首轮）。

## 1. 验证顺序与结果

| 步 | 项 | 命令 | 结果 |
|---|---|---|---|
| 1 | 静态（本仓无 tsconfig，TS 由 `bun test` 编译） | `bun test tests/real-repo-git-budget.test.ts` | **6 pass / 0 fail**（编译通过） |
| 2 | 单元 | 同上（元守卫 4 例 + 语义 2 例） | 6 pass |
| 3 | 集成/全量 | `bun test tests/` | **922 pass / 0 fail**（迁移前 916，+6） |
| 4 | 边界与错误路径 | 见 §2（M1/M1b/M1c/M2/M3/M4/M5/M6/M7/M7b） | 逐条命中（M6/M7b 如预期不红 ⇒ 已登记） |
| 5 | 遗留清扫 | `grep -nE "TODO\|FIXME\|XXX\|console\.(log\|debug)\|\.only\(\|test\.skip"`（新增/改动文件） | **0 命中** |

## 2. 逐条判定 + 证据

| AC | 判定 | 证据（命令 + 输出摘要） |
|---|---|---|
| AC1 | ✅ | 扫描集内**无** R 形态 git 调用点（`grep 'cwd:.*import.meta.dir\|process.cwd()\|path.resolve'` 与 git 调用无交集）；helper 内 2 处（`:67`/`:81`）。U 面实测登记：形参式 helper **5**（4 处单行 `{ cwd` + 1 处多行 `gitFixture`）、`cwd` 局部 fixture 变量 **32**、`probes/**` **1** = **38**。突变 M1/M1b/M1c/M7（四种 R 写法）与 M2（删 `cwd`）逐条红 |
| AC2 | ✅ | `:18` `REAL_REPO_GIT_TEST_TIMEOUT_MS = 20_000`、`:25` `REAL_REPO_GIT_CALL_TIMEOUT_MS = 6_000`；`:22` 注释含 `3 次 × 6s = 18s < 20s`；helper 内 `for`/`while` 计数 **0**（禁重试）；守卫内 `timeout: REAL_REPO_GIT_CALL_TIMEOUT_MS` 计数 == 2（两次调用都带上限） |
| AC3 | ✅ | **行为**：`lastCommitSha` / `isAncestor` 在非 git 目录 ⇒ `""` / `false`（既有语义）；`isGitCallTimeout({code:"ETIMEDOUT"})` ⇒ true、`{status:128}` ⇒ false。**承重前提一次性质证**：`execFileSync("sleep",["2"],{timeout:1})` ⇒ 真实错误形态 `code="ETIMEDOUT" errno=-110 status=0`（与判据喂的形态一致）。**接线**（结构）：两个 catch 首句都是 `rethrowIfCallTimeout`（突变 M3 ⇒ 红） |
| AC4 | ✅ | 导出表 = 4 访问函数 + 2 常量 + **1 分类器**（`isGitCallTimeout`，AC3 授权；proposal D1 代码块与 AC4 已同步）。`cwd` 参数化：两个底层函数首参是 `cwd`；真仓薄包装用 `path.join(import.meta.dir, "..", "..")`（worktree 感知），**无 `.git` 存在性判断** |
| AC5 | ✅ | 清单 `budget: 3` vs AC10④ 块内实测 InRepo 调用点 **3**（脚本计数）；`budget ≥ 1` 校验在守卫内。突变 M4（3→5）⇒ 红 |
| AC6 | ✅ | 清单项只有 `{file, testTitle, budget}`（无 timeout 值）；守卫从源码读 `{ timeout }` 并校验 ≥ 20000。突变 M5（`{timeout: 6_000}`）⇒ 红 |
| AC7 | ✅ | 扫描集 = 递归 `*.test.ts` + helper（不写死数字）；**不空转**：helper 与 `config-guards.test.ts` 都必须出现在扫描结果里，且「每个含 git 调用的 `*.test.ts` 都被扫到」逐文件断言；豁免集合 == `{helper, 自身}`（显式断言） |
| AC8 | ✅ | `docs/test-authoring.md:202` 有 §9；`tests/README.md:31/36` 有清单行 + 规则指针；`bun test tests/` **922/0**；anchors **23/23**；`openspec validate --strict` **valid**；**D9 交接**：`.rddf/reviews/real-repo-git-budget-guard-handoff.md` + 归档 sibling 的 proposal 末尾「迁移注记」 |
| AC9 | ✅ | `.rddf/reviews/real-repo-git-budget-guard-mutations.md`：M1/M1b/M1c/M2/M3/M4/M5/M7 逐条命中三件套；**M6（`Bun.spawnSync`）与 M7b（`path.resolve`）不红 ⇒ 如实登记**；四文件复原 `sha256` 全等 |

## 3. 失败项

无。

## 4. 遗留清扫结果

| 项 | 结果 |
|---|---|
| TODO / FIXME / XXX | 无 |
| 半截实现 | 无（AC1–AC9 全部落地） |
| 注释掉的旧代码 | 无（`config-guards.test.ts` 的本地 helper 已删除，diff 无残留） |
| 临时调试日志 | 无 |
| 被 skip 的测试 | 无 |
| 未替换的 mock | 不适用 |
| 临时 fallback | 无 |

**范围外历史遗留（只记录、不清理）**：`cli.json` 的 verbosity 运行时改动留在工作树（刻意不提交）。

## 5. 如实登记的边界（不是失败项）

1. **已知漏检面**：`Bun.spawnSync`（M6 实测不红）、`path.resolve()` / `new URL(...).pathname` / 带类型标注的 const / 多行种子声明（M7b 实测不红）、形参 helper、fixture 变量 `cwd`、`tests/probes/**` —— 三处同步登记（守卫文件头、`docs/test-authoring.md` §9、proposal 注记）。
2. **超时分支没有端到端**（无法造出挂死的 git：bun 的 `execFileSync` 不认运行期 `process.env.PATH`）；补偿 = 分类器行为断言 + 真实错误形态一次性质证 + 接线结构判据。
3. **种子收窄只排除「非 `path.*` 包装」**：`path.join(import.meta.dir, "..", "某文件名")` 仍会被标为仓根常量（今日零误红，登记）。
4. **AC3b/AC2 的计数断言写死为 2**：新增第 3 个 git helper 时须同步加（已在注释里登记为可扩展缝）。
5. **交接方式**：归档 change 只追加注记、不回改历史记述（critic 已确认机读链 `isClosedImprovement` 不受影响）。

## 6. 结论

**通过（9/9 AC）**。可归档。
