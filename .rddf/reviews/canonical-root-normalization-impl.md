# 实施完成报告：canonical-root-normalization

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 实施者 | builder |
| change | `openspec/changes/canonical-root-normalization/`（AC1–AC18） |
| ADR | `docs/adr/ADR-canonical-root-normalization.md`（Accepted） |
| 测试 | `bun test tests/` → **172 pass / 0 fail**（改动前 157 → 新增 15 条） |
| 状态 | **实施完成，待 verifier 验收** |

## 1. 改动清单

| 文件 | 改动 |
|---|---|
| `lib/delegate-core.ts` | `canonicalRoot` 改返回 `{stateRoot, workRoot, vcs}` + 可注入 `gitRunner`；新增 `absoluteCommonDir`（`--path-format=absolute` + 旧版回退）；`lookupPair` 加读回退；execute 的 6 处根分派 |
| `tests/delegate-core.test.ts` | 2 条既有用例适配新返回形状（`r.root` → `r.stateRoot`/`r.workRoot`） |
| `tests/canonical-root.test.ts` | **新增 291 行 / 15 条用例**，覆盖 AC1–AC13 |
| `prompts/build.md` | §状态来源：补「canonical 归一判别式」（stateRoot/workRoot 双根 + superproject 优先） |
| `docs/front-delegate-architecture.md` | §4.4 第 2/3 步、§4.6 状态文件表、§6.7 多工程段改用 stateRoot |
| `docs/dual-session-delegation.md` | 登记段补双根说明 |

## 2. AC 逐条自查（AC1–AC18）

| AC | 判据 | 证据 | 状态 |
|---|---|---|---|
| AC1 | 主仓 stateRoot == workRoot | 单测「主仓两根都在仓库根」+「从子目录调用仍归到仓库根」 | ✅ |
| AC2 | worktree 下 pair.json 落主仓 | 单测「worktree 里登记 → pair.json 落在主仓」+ **真文件系统验证**（`主仓有 pair.json ✅` / `worktree 副本无 .rddf ✅`） | ✅ |
| AC3 | worktree 内 artifacts > 0 | 单测「workRoot 数到 / stateRoot 数不到」+ 真文件系统 3 项断言 | ✅ |
| AC4 | submodule 归 superproject | 单测「submodule 工作树内不归到 .git/modules」（真实 `git submodule add`） | ✅ |
| AC5 | 非 git 目录两根相同 | 单测「plain dir」 | ✅ |
| AC6 | 三用途逐点绑定 | 静态核对 6 处：`registerSession(stateRoot)`×2 / `appendLedger(stateRoot)` / `lookupPair(stateRoot)` / `gitStatusPaths(workRoot)`×2 / `scopeEditRules(workRoot)` / `buildBrief(workRoot)` / `project_root: workRoot` | ✅ |
| AC7 | git 版本回退 | 单测「--path-format 不支持时回退到裸 common-dir」+ 断言走了回退分支 | ✅ |
| AC8 | 读回退 | 单测「stateRoot 查不到 → 回退 workRoot 命中」+ 真文件系统验证 | ✅ |
| AC9 | 双值接受 | 单测「canonical_root 等于 workRoot 时通过」 | ✅ |
| AC10 | 覆盖面如实 | 单测三位置（原 worktree 成功 / 别的 worktree 失败 / 主仓失败）+ 真文件系统 | ✅ |
| AC11 | 存量随使用迁移 | 单测「resume 后 stateRoot 出现该条目且 canonical_root==stateRoot」 | ✅ |
| AC12 | 新登记只写 stateRoot | 单测「pair 条目的 canonical_root == stateRoot」+ 真文件系统 | ✅ |
| AC13 | 跨仓冒充不成立 | 单测「另一个仓库的路径两者都不等于 → 拒」 | ✅ |
| AC14 | 既有判据无回归 | `bun test tests/` 172 pass 0 fail | ✅ |
| AC15 | 三处文档同步 | `grep stateRoot`：architecture 5 处 / dual-session 2 处 / build.md 5 处 | ✅ |
| AC16 | build agent 与插件口径同构 | `prompts/build.md` 的判别式与 `canonicalRoot` 逐条对照（superproject 优先 / 两个根分工） | ✅ |
| AC17 | 上游语义锚定 | 实测 git 2.43：`--path-format=absolute` 可用、非 submodule 的 superproject 为空串、worktree 的 common-dir 指向主仓 `.git` | ✅ |
| AC18 | 可注入 gitRunner | 单测「默认 runner 与自定义 runner 结果一致」+ AC7 的注入用例 | ✅ |

## 3. 变异测试（确认测试不是假绿）

按「测试必须能抓 bug」的要求，做了 3 个变异并确认被捕获：

| 变异 | 模拟的缺陷 | 被捕获的用例 |
|---|---|---|
| `stateRoot = workRoot`（去掉归一） | 修复前的 bug | **5 条红**（AC2/AC3/AC8/AC11） |
| 删掉 superproject 判别 | submodule 归到 `.git/modules` | **1 条红**（AC4） |
| 删掉 `lookupPair` 的 fallback | 只查 stateRoot | **3 条红**（AC8/AC10/AC11） |

还原后 172 pass。

## 4. 遗留清扫结果

| 检查项 | 结果 |
|---|---|
| TODO / FIXME / XXX | 无 |
| console.log / debugger | 无 |
| 注释掉的代码 | 无 |
| `test.skip` / `test.only` | 无 |
| 未替换的 mock | 无（单测全部用真实 git 结构，仅 AC7 用注入的 gitRunner——那是设计意图） |
| 临时文件 / 备份 | 已清理（变异测试用的 `.bak` 已删） |
| 裸 `root` 变量残留 | 仅 `lookupPair(root, ...)` 的形参（主根，语义正确） |

## 5. 已知事项（如实记录）

- **`tsc --noEmit` 有 4 类既有基线错误**：`TS2591`（缺 `@types/node`）、`TS7006`（既有 `gitStatusPaths` 的隐式 any）、`TS2345`（`sessionID: string | undefined`）。**这些在改动前就存在**（已用 `git stash` 对照基线确认：原 723/832 行 → 现 802/912 行，同一错误）。本项目用 bun 直接运行 `.ts`，不做类型检查，故一直如此。**本次未顺手修（scope 外）**，记录在此。
- **E2E（真实模型）未跑**：AC2/AC3 的 E2E 面用「真文件系统 + 真实 registerSession/gitStatusPaths」替代，覆盖了文件落点与变更检测两条核心判据；但没有跑真实 model run。按 proposal 证据规则 1，**不判为通过**，如实记录为「降级证据」。
- **`.git` 为文件型 submodule 未测**（proposal Notes N1 已披露）。
- **superproject 本身是 worktree 的组合未测**（Notes N2）。

## 6. 交付边界

本 change **只做 canonical-root 归一**。`front-multi-backend` 的异步派发/名册/互斥等**未开始**，按 ADR 的依赖声明它是本 change 的下游。

## 7. 建议 verifier 优先复核

1. **AC10 的失败方向**：从别的 worktree / 主仓 resume 必须**如实失败**——这是防止实现者偷偷"扫描所有 worktree"的关键判据。
2. **AC6 的逐点绑定**：`buildBrief` 与 `summary.project_root` 取 workRoot（不是 stateRoot）是我的判断，ADR D2 只写了"三个用途"，这两处属我依据「对被派发方可见的是它实际工作的目录」推出，**建议复核该推断是否成立**。
3. **变异测试的可复现性**：3 个变异的具体改法与预期红项见 §3，可独立复跑。
