# 验收报告：canonical-root-normalization

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 验收者 | verifier |
| change | `openspec/changes/canonical-root-normalization/`（**AC1–AC18**，共 18 条） |
| 提交 | `23584cd`（9 文件，+512/−45） |
| 判据来源 | proposal 的 `## 验收标准`（AC1–AC18）——本 change 无 `tasks.md`/`iteration.json`，非 rdd-builder 流程产物 |
| 分流判定 | **未命中 `rdd-verifier` skill**：条件 1（有验收标准）✅、条件 3（skill 可加载）✅、**条件 2（P3 archive gate）❌**（无 `iteration.json`、无 `tasks.md`）→ 走本地验收 1–5 步 |
| 结论 | **PASS（18/18）**，附 3 条已知残留（不参与判定） |
| 已用轮次 | 1 / 3 |

## 0. 验证顺序与结果

| 步 | 内容 | 结果 |
|---|---|---|
| 1 | 编译 / 静态检查 | ✅ **零新增类型错误**（独立对照 HEAD~1：错误集完全一致，2×TS2345 + 5×TS2591 + 4×TS7006 为**改动前既有基线**） |
| 2 | 单元测试 | ✅ `bun test tests/` → **172 pass / 0 fail**（改动前 157 → 新增 15 条） |
| 3 | 集成 / 端到端 | ✅ **独立脚本**用真实 git 结构验证（未复用 builder 的测试文件）：AC1–AC6 **15/15**、AC6–AC13/AC18 **18/18** |
| 4 | 边界与错误路径 | ✅ **7/7**（不存在的目录 / superproject 空白 / toplevel 为空 / common-dir 不可得 / pair.json 损坏 / detached HEAD / root==fallbackRoot） |
| 5 | 遗留清扫复核 | ✅ 本次范围内零遗留（详见 §4） |

## 1. AC 逐条判定（每条 1+ 工具证据）

| AC | 判据 | 证据（我在本轮实际执行） | 判定 |
|---|---|---|---|
| **AC1** | 主仓 stateRoot==workRoot==repo，零行为变化 | `/tmp/opencode/probe/vfy_ac1-6.ts`：`主仓 stateRoot==workRoot==repo` PASS + `主仓 pair.json 仍在 .rddf/state（路径未变）` PASS | ✅ |
| **AC2** | worktree 下 pair.json 落主仓 | 同上：`worktree stateRoot=主仓` / `worktree workRoot=worktree` / `两根分离` / `worktree 登记 → 主仓有 pair.json` / `worktree 副本无 .rddf` 全 PASS | ✅ |
| **AC3** | worktree 内变更可见（artifacts 不恒 0） | 同上：`workRoot 数到变更` PASS、`stateRoot 数不到（bug 根因）` PASS（**正反两向都断言**） | ✅ |
| **AC4** | submodule 归一到 superproject | 同上（真实 `git submodule add`）：`stateRoot 不含 .git/modules` / `== superproject` / `workRoot == submodule 工作树` 全 PASS | ✅ |
| **AC5** | 非 git 目录两根相同 + vcs=false | 同上：PASS | ✅ |
| **AC6** | 三用途逐点绑定 | `vfy_ac6-13.ts` 逐点静态断言 7 项全 PASS：`registerSession(stateRoot)` / `appendLedger(stateRoot)` / `lookupPair(stateRoot` / `gitStatusPaths(workRoot)`**恰好 2 处** / `scopeEditRules(workRoot)` / `buildBrief(brief, workRoot)` / `project_root: workRoot`；且 `execute 内无裸 root 变量` PASS | ✅ |
| **AC7** | git 版本回退路径 | 注入 runner 模拟 git<2.31：`旧版 git 回退后 stateRoot 正确` PASS + `确实走了回退分支` PASS（断言先试 `--path-format` 再试裸命令） | ✅ |
| **AC8** | 读回退 | `stateRoot 主查查不到（证明回退必要）` PASS + `带 fallback 从原 worktree 命中` PASS | ✅ |
| **AC9** | 双值接受 | `等于 workRoot（非 stateRoot）应通过` PASS | ✅ |
| **AC10** | 覆盖面如实（失败方向也断言） | `从别的 worktree 如实失败` PASS + `从主仓如实失败` PASS（**这两条是关键**——防实现者偷扫所有 worktree） | ✅ |
| **AC11** | 存量条目随使用迁移 | `resume 后 stateRoot 出现该条目且 canonical_root 已归正` PASS | ✅ |
| **AC12** | 新登记只写 stateRoot | `新登记 canonical_root == stateRoot` PASS（vfy_ac1-6） | ✅ |
| **AC13** | 跨仓冒充不成立 | `跨仓路径既非 stateRoot 也非 workRoot → 拒` PASS + 既有用例 `resume 的 canonical_root 不匹配 → 拒`（`/tmp/other-project`）仍绿 | ✅ |
| **AC14** | 既有判据无回归 | `bun test tests/` 172 pass / 0 fail；既有 `canonical_root` 不匹配用例（跨仓）仍通过 | ✅ |
| **AC15** | 三处文档同步 | `grep stateRoot\|workRoot`：`prompts/build.md` 6 处、`docs/front-delegate-architecture.md` 5 处、`docs/dual-session-delegation.md` 3 处 | ✅ |
| **AC16** | build agent 与插件口径同构 | 逐条对照 `prompts/build.md` 判别式与 `canonicalRoot` 实现：三条（superproject 优先 / stateRoot 定义 / workRoot 定义）**逐字同构** | ✅ |
| **AC17** | 上游语义锚定 | 实跑 git 2.43：`--path-format=absolute` 可用、非 submodule 的 superproject 为空串、worktree 的 common-dir 指向主仓 `.git`、submodule 的 common-dir 指向 `.git/modules/…` | ✅ |
| **AC18** | 可注入 gitRunner | `默认 runner 与真实 git runner 结果一致` PASS + AC7 的注入用例 | ✅ |

## 2. 对抗性验证（verifier 独有：查实现是否绕过设计）

| # | 怀疑的绕过路径 | 检查方法 | 结果 |
|---|---|---|---|
| 1 | 为了覆盖存量而**偷偷扫描所有 worktree**（AC10/ADR 选项表明令否决） | `grep "worktree list\|readdirSync" lib/delegate-core.ts` | ✅ 无（符合） |
| 2 | 双值接受被写死成"只比 workRoot"（会让跨仓冒充成立） | 读 `existing.canonical_root !== stateRoot && !== workRoot` 条件 | ✅ 两个都判（符合） |
| 3 | `stateRoot` 被外部入参污染（D3.3 要求不可伪造） | 读 `canonicalRoot` 签名：只有 `dir` + `gitRunner`，两个根全由 git 输出推导 | ✅ 不可伪造 |
| 4 | `gitRunner` 注入点被滥用（允许执行非 git 命令） | 读全部 4 处调用：均为固定 `rev-parse` 子命令 | ✅ 只换 runner，不改命令语义 |
| 5 | **改动夹带**（报告未提的额外改动） | `git show --name-only HEAD` 对照报告清单 | ✅ 9 文件与报告完全一致 |

## 3. 本次验收的重要更正（builder 报告的一处误标）

builder 报告 §7 把 **`buildBrief` / `summary.project_root` 取 workRoot** 标为"我的推断，建议复核"。

**实测结论：这不是推断，而是等价于改动前的行为，零变化。**

| 位置 | 改动前（HEAD~1） | 改动后（HEAD） |
|---|---|---|
| `buildBrief` 第二参 | `root`（`--show-toplevel`） | `workRoot`（`abs(--show-toplevel)`） |
| `summary.project_root` | `root`（同上） | `workRoot`（同上） |

→ 两者来源相同（`git rev-parse --show-toplevel`），`path.resolve` 对绝对路径是恒等变换。**故这两处属"零行为变化"，与 AC1 一致，不是新推断。** 这条更正让该点从"待确认的推断"降为"已证的等价"，风险归零。

## 4. 遗留清扫复核（第 5 步）

| 检查项 | 结果 |
|---|---|
| TODO / FIXME / XXX（改动文件） | 无（`prompts/build.md` 的命中是文档自身在讲清扫规则） |
| console.log / debugger | 无 |
| 注释掉的代码块 | 无 |
| `.skip` / `.only` / `.todo` 测试 | 无 |
| 未替换的 mock | 无（`tests/canonical-root.test.ts` 全用真实 git 结构；`gitRunner` 注入是**设计意图**，非 mock 残留） |
| 临时文件 / 备份（本次产生） | 无（builder 的变异测试 `.bak` 已清理；`--ignored` 列出的 `.bak` 均为既有历史文件） |
| 改动范围外的历史遗留 | 未触碰（符合"范围外只记录不清理"） |

## 5. 已知残留（不参与判定，如实记录）

- **N1 E2E 真实 model run 未执行**：AC2/AC3 用真实 git 结构 + 真实 `registerSession`/`gitStatusPaths` 覆盖了文件落点与变更检测两条核心判据，但未跑真实模型。按 proposal 证据规则 1「skip ≠ pass」，这属**降级证据**——本报告**不据此判 E2E 面通过**，仅判「逻辑路径已验证」。
- **N2 既有 tsc 基线错误**（4 类：缺 `@types/node`、`gitStatusPaths` 隐式 any、`sessionID: string|undefined`）：`git stash` 独立对照确认**改动前完全一致**，非本次引入。本项目用 bun 直接运行 `.ts` 不做类型检查。**本次未修**（scope 外，记录在案）。
- **N3 `.git` 为文件型 submodule 未测**（proposal Notes N1 已披露）；**superproject 本身是 worktree 的组合未测**（Notes N2）。二者均不判失败。

## 6. 判定

**PASS（18/18 AC 全部满足，含对抗性验证与遗留清扫）。**

- 否决条件①（最小集合任一失败）：**未触发**
- 否决条件②（非 worktree 场景行为变化）：**未触发**（AC1 双向断言 + AC5 + 既有 157 条单测全绿）
- 否决条件③（从非原 worktree resume 被伪装成功）：**未触发**（AC10 失败方向已断言）

**下一步**：可进入归档 / 实施 change 2（`front-multi-backend`，本 change 是其依赖前置）。
