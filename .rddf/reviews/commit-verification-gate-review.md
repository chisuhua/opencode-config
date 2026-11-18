# 审稿报告 — ADR-commit-verification-gate

> 判据真源：`docs/adr/ADR-commit-verification-gate.md`（Status: **Draft**）+
> `prompts/build.md` §审查配对（architect ⇒ **oracle → critic**；治理面 ⇒ 声明「审查域: 治理面」）。
> **预算**：oracle 1 轮 + critic 2 轮（critic 复审额度**已用满** ⇒ 第 3 轮须用户明确批准）。

## 0. 轮次轨迹

| 轮 | 审查者 | 判定 | 处置 |
|---|---|---|---|
| 1 | oracle（治理面） | **BLOCK**（14 条 S1–S14） | 全部采纳：删「change 已完成且已验收」判据（**时序互锁**：正在实施的 change 永远不满足 ⇒ 本仓一次也提交不了）；D2③ 改用**角色写集**（复用 `decideWrite` 单源）；新增 D9 宣称边界；D8 改逐点清单；背景按 `CHANGELOG.md:39-52` 更正失效模型 |
| 1 | critic（arch） | **REJECT**（3 BLOCKER + 8 SHOULD_FIX + NITS） | 全部采纳：B1 公式与单源冲突（改调 `decideWrite`）；B2 `-a`/`--only`/`--include` 绕过（加提交形态闭口）；B3 落点清单缺项（14 → 18 点）；SHOULD_FIX 逐条（回滚路径 / D4 理由更正 / D9⑧ saved approval / 退出码语义 / 解析口径可执行化 / D9① 守卫逐条相等 / 内容锚点 / Verification 内联 / 层 1a 突变 / 两根统一 / 身份链 fallback） |
| 2 | critic（arch，复审） | **REJECT**（B1 已闭合；B2/B3 未闭合 + 1 条新 BLOCKER） | 全部采纳：B2 枚举补齐（位置 pathspec / `-o` / `-i`）+ 解析兜底 + 复合命令闭口；B3 补 3 个落点（父篇修订行与 `:43` 行 / `tests/role-exemptions.test.ts` D5② / MAD §3.4 纪律句与残留句）⇒ 18 → **20 点**；新 BLOCKER-3 = 后端 brief 规则与 `docs/dual-session-delegation.md` 的残留（D8 点 19/20） |
| 3 | critic（arch，复审；**用户已明确批准**） | **REJECT**（上轮 3 条 BLOCKER **全闭合**；本轮新 diff 引入 **1 条新 BLOCKER**） | 新 BLOCKER = 复合命令「尾随段放行」与 D5 的口径冲突：`git commit -m x; git push --force origin main` **整串以 `git commit ` 开头** ⇒ 命中 `allow` ⇒ push 的 `ask` / force-push 的 `deny` **同时失效**（**搭便车**）。修：见 §2.1 |
| 5 | critic（arch，复审；**用户已明确批准**，只验闭合） | **REJECT**（轮 4 三条 **全闭合**；但新 diff 引入 **1 条回归 BLOCKER** + 3 条 SHOULD_FIX） | 回归 BLOCKER = 段分隔符 token **泄漏**进单段判定 ⇒ `git commit -m x;` 这种等价写法被误拒（且文案错）。SHOULD_FIX = 兜底扫描把 heredoc 正文 / `echo git commit` 当命令（假阳性）+ **`"git" commit` 完全绕过门禁**（fail-open）+ 代价段未对齐。修法见 §2.3 |
| 4 | critic（arch，复审；**用户已明确批准**，只验闭合） | **REJECT**（轮 3 的**字面三形态**已闭合；但**同类面**未闭 —— 3 条新 BLOCKER） | B1 白名单把带 `ask` 档位的命令当「无害」（`cat/head/tail *.env`、`git branch -D`、`git config` 写形态）；B2 **引号内命令替换**（`git commit -m "$(git push --force …)"`）打穿 force-push `deny`；B3 **`cd` 在纯报告清单里** ⇒ 换仓后判定对象错位。修法 = **删掉白名单**（见 §2.2） |

## 1. oracle 轮（治理面）逐条应答

| # | finding | 处置 |
|---|---|---|
| S1 | D2② 时序互锁（commit 是实施过程的一部分 ⇒ 门禁恒拒 ⇒ 本仓无法提交） | ✅ 采纳（口径 C）：删除该判据，交还归档门（`archive.sh::check_worktree_commits` + `openspec archive` + 产品侧 `.ac-verdict-*.json`） |
| S2 | 机读判决源（`verdict: PASS`）全仓不存在 ⇒ 恒假 | ✅ 采纳：删除该判据，改用既有权威 `ROLE_WRITE_POLICY` / `decideWrite` |
| S3 | 角色维度缺失 ⇒ architect/planner/no-role 的实施类提交被放行 | ✅ 采纳：D2③ 角色写集判据（`decideWrite` 单源） |
| S4 | 缺宣称边界段 + 两处旧措辞 | ✅ 采纳：新增 D9（后扩到九项）；D8 含 MAD §2.8.7 与 `tests/role-exemptions.test.ts` |
| S5 | 落点清单不可执行（14 点 → 逐点清单） | ✅ 采纳：最终 **20 点**（含父篇与后端 brief） |
| S6 | 「唯一真源」落法与措辞（§3.4 收窄 / §输出 保留兜底句 / 点名条款 / `Allow always` 不得进 prompts） | ✅ 采纳 |
| S7 | 解析口径不足 + fail-closed | ✅ 采纳：D5 六步 + 兜底拒绝；D6 取不到 ⇒ 拒 |
| S8 | 根解析 + 声明须 tracked | ✅ 采纳：`canonicalRoot` + tracked 硬约束 |
| S9 | force-push 形态不完整 | ✅ 采纳：四形态 |
| S10 | 层 2 取证边界 + 绿侧不可达 | ✅ 采纳：绿侧在一次性临时 worktree 验；红侧用可回滚临时改动 |
| S11 | 非交互能力扩张 | ✅ 采纳：登记为 D9⑤ |
| S12 | commit 规则冗余 | ✅ 采纳（保留显式声明，便于守卫断言） |
| S13 | 取代关系双向登记 | ✅ 采纳：父篇修订行 + `:43` 行 |
| S14 | 变红演练覆盖不足 | ✅ 采纳：V1–V12 逐条带突变 |

## 2. critic 轮（arch）BLOCKER 闭合证据

| BLOCKER | 闭合证据 |
|---|---|
| **B1**（轮 1）公式 = 第二份实现 | D2③ = **调用 `decideWrite`**，并**明文禁止**在 commit-gate 内重写公式；全文 grep `ROLE_WRITE_POLICY` 只剩引用而无公式 |
| **B2**（轮 1）flag 绕过 | D5 第 7 步：**提交形态闭口**（`-a`/`--all`/`--only`/`-o`/`--include`/`-i`/`--pathspec-from-file`/位置 pathspec）+ 第 8 步**复合命令闭口** |
| **B3**（轮 1）落点清单不一致 | D8 → **20 点**（含父篇修订行与 `:43` 行、`tests/role-exemptions.test.ts:9`、MAD §3.4 纪律句与残留句、后端 brief、`docs/dual-session-delegation.md`）；V9 判据同步 |
| **B1**（轮 2 复审）枚举不全（位置 pathspec / `-o` / `-i`） | 已并入 D5 第 7 步；`tests/commit-gate.test.ts` 有 11 条闭口用例逐条覆盖 |
| **B2**（轮 2 复审）解析口径缺分离值选项 + 无 else 兜底 + 复合命令二义 | D5 第 4 步补 `--git-dir/--work-tree/--namespace/--exec-path/--config-env/-c/-C` 的**分离值与等号两形态**；第 6 步**解析不出 ⇒ 拒绝**；第 8 步复合命令 ⇒ 拒（要求分两次调用） |
| **B3**（轮 2 复审）落点清单仍缺后端 brief 规则 | D8 点 19（`lib/delegate-core.ts` 后端 brief 第 3 条）+ 点 20（`docs/dual-session-delegation.md`）已改；配置守卫断言二者含「由工具层验证门决定」 |
| **B2-复合**（轮 3 复审）尾随段放行 ⇒ 搭便车（`git commit …; git push --force …` 命中 `allow`） | 见 §2.1；层 1b 3 条用例（force-push / push / `rm` 三形态）+ 层 2 **P13** 实测 deny（HEAD 未推进） |

### 2.1 轮 3 新 BLOCKER 的修法（搭便车防护）

| 面 | 改动 |
|---|---|
| 判据口径 | **只要出现 commit，其余每一段必须是「纯报告命令」或「只读 git」**（`REPORTING_COMMANDS` / `HARMLESS_GIT_SUBCOMMANDS`），否则拒 —— 不再只判「commit 之前改过 index」 |
| 理由 ①（搭便车） | shell 权限是**整串前缀匹配** ⇒ `git commit -m x; git push --force` 整串命中 `git commit *: allow` ⇒ push 的 `ask` / force-push 的 `deny` 同时失效 |
| 理由 ②（判定对象） | `git add -A && git commit` 的实际内容集 ≠ 判定时的 index ⇒ D2③（角色写集）失效 |
| 层 2 实测的假阳性边界 | 仍**放行**尾随报告段（`git commit -m x; echo "exit=$?"`）与**重定向**（`> /dev/null 2>&1`，含 fd 前缀 `2>`） |
| 顺带修的解析缺陷 | ① 包装命令带值选项（`sudo -u u`）在 `commitInSegment` 里没跳过 ⇒ 抽出 `gitWordIndex` 做**单一真源**；② 子命令下标改用 `parseGitSubcommandIndex`（原 `findIndex` 会把 `-C commit` 的值误当子命令）；③ 前缀子 shell（`(git commit …)`）；④ 删死代码 `INDEX_MUTATING_SUBCOMMANDS` |
| 用例 | 层 1b 55 → **63**（搭便车 3 / 重定向 2 / 子 shell 1 / 包装命令 1 / 只读 git 段 1） |

### 2.2 轮 4 三条 BLOCKER 的修法（删白名单 ⇒ fail-closed）

**根因**：用「命令白名单」判「其余段是否无害」不可行 —— 白名单与 `opencode.jsonc` 里真实的 `ask`/`deny`
档位**必然漂移**（实测：`cat`/`head`/`tail` 有 `*.env` 的 `ask`、`git branch -D *` 是 `ask`、`git config`
写 `.git/config`），而 build 的 shell 默认档是 **`"*": "allow"`** ⇒ 任何漏网形态都是**无限制执行**。

| 轮 4 BLOCKER | 修法 | 证据 |
|---|---|---|
| **B1** 白名单放行带 `ask` 档位的命令 | **删除 `REPORTING_COMMANDS` / `HARMLESS_GIT_SUBCOMMANDS`** ⇒ 改为「**commit 必须单独成段**」：引号外出现 `;` / `&&` / `\|\|` / `\|` / `&` / **换行**且任一段是 commit ⇒ 拒 | 层 1b 14 条复合用例（含 `…; cat .env` / `…; git branch -D feature` / `… \| tee /tmp/log` / `cd … && git commit`） |
| **B2** 引号内命令替换 | 新增 `containsCommandSubstitution`（`$(…)` / 反引号 / `<(` `>(`，单引号外；转义不算）⇒ 拒；提交消息用 `-F` | 层 1b 5 条替换用例 + 3 条负向（单引号 / `$HOME` / `\$(`）；层 2 **P14** 实跑 deny |
| **B3** `cd` 换仓 | 白名单删除后 `cd … && git commit` 属复合 ⇒ 拒；并补 **D5⑩**：`git -C` / `--git-dir` / `--work-tree` / `GIT_DIR=` / `GIT_WORK_TREE=` / `GIT_INDEX_FILE=` / `GIT_COMMON_DIR=` / **包装命令**（`sudo`/`env`/`timeout`/`exec`…）⇒ 拒 | 层 1b 14 条（换仓 8 + 包装 6）+ 2 条负向（`--namespace` 不换仓 / `GIT_AUTHOR_NAME` 允许）；层 2 **P15** 实跑 deny |

**代价（显式承认）**：`git commit -m x; echo "exit=$?"` 这类尾随报告段也一并被拒（层 2 P10 实测过模型确实这么写）
⇒ **可见的假阳性**（模型重试不带 `;` 即可），换取「不需要任何白名单校准」。
`git commit -m x > /dev/null 2>&1`（**纯重定向**，无段分隔符）仍放行 —— 层 2 **P16** 实跑通过。

### 2.3 轮 5 的修法（回归 + 两个既有洞）

| 面 | 修法 | 证据 |
|---|---|---|
| **回归**：段分隔符 token 泄漏 ⇒ `git commit -m x;` / `git commit -m x\n` 被误拒（文案还是「位置 pathspec」） | 单段判定改喂 `nonEmpty[0]`（去空段后的唯一一段），**不再**把整串 token（含分隔符）交给 `checkCommitForm` | 层 1b 3 条（`git commit -m x;` / `…\n` / `\ngit commit -m x` ⇒ 放行）；层 2 **P17**：`git commit -m "semi probe";` ⇒ 放行、HEAD 推进（`bff5e6d`） |
| 末位 `&`（后台执行 ⇒ 退出码不反映提交结果） | 单段 + 末位 token 是未加引号的 `&` ⇒ 拒（文案含「单独成段」） | 层 1b 1 条（**钉文案**，不只是钉真值） |
| SHOULD_FIX ①：兜底扫描把 heredoc 正文 / `echo git commit` 当命令 | 兜底**只在「包装命令前缀」时**回溯（`timeout 10 git commit`）；其余一律不扫 | 层 1b 2 条（`echo git commit` / heredoc 正文 ⇒ 不命中） |
| SHOULD_FIX ②：**`"git" commit -m x` 完全绕过门禁**（既不触发门禁、也不匹配 `git commit *: allow` ⇒ 未验证提交直接落地） | `isGitCommandWord` **接受引号包住**的命令词（引号形态不剥 shell 前缀） | 层 1b 1 条（识别为 commit）；层 2 **P18**：探针仓声明 `[["false"]]` ⇒ `"git" commit -m "quoted probe"` ⇒ `commit-gate: 验证命令失败 ⇒ 拒绝提交：$ false`，HEAD 未推进 ⇒ **fail-open 已闭** |
| SHOULD_FIX ③ / NIT：代价段与实现对齐 | D5⑧ 代价段补三条（尾随报告段被拒 / 消息含 `$(` 被拒 / 只判顶层字符串）；D9 表行序修正为单调 | — |
| 附带发现（登记为 D9⑪） | 门禁的 `workRoot` 取**会话 location 目录**，**不是** shell 的 `workdir` ⇒ 在别的仓提交 ⇒ 暂存区判定落在会话目录 ⇒ 一律拒（fail-closed） | 层 2：探针仓提交在本会话里被拒为「暂存区为空」 |

## 3. 实施产物（builder）

| 落点 | 内容 |
|---|---|
| `lib/commit-gate.ts`（新增） | D5 命令识别（分词 / 全局选项 / 子命令精确匹配 / 闭口 / 复合命令 / fail-closed）+ D2 三判据组合 + 声明读取 |
| `plugins/commit-gate.ts`（新增） | 接线：shell 钩子 → 会话 → `canonicalRoot` → 声明 → 暂存状态 → 角色（主会话=身份链 / 后端=`role_class`）→ `decideWrite` → 验证命令 → 抛错 |
| `tests/commit-gate.test.ts`（新增） | 层 1b **92 条**：命中矩阵 8 / 换仓与包装（D5⑩）15 / 命令替换（D5⑨）9 / 误伤矩阵 / 提交形态闭口 12 / 必须单独成段（D5⑧）17 / fail-closed / 分词 / 三判据 / 声明 |
| `opencode.jsonc` | build shell：`git commit*` ⇒ **allow**；force-push 四形态 ⇒ **deny**；`git push` 仍 **ask** |
| `prompts/build.md` | §输出 / 点名条款 / 角色表 / 角色列表 / 增强层 commit 契约 / `capability:build` 块（`allow-ask` ⇒ `allow-ask-and-deny`，行数不变） |
| `docs/MULTI-AGENT-DESIGN.md` | 版本摘要 / §2.6 / §2.8.7 D5② / §3.4（标题·理由句·纪律句·残留句）/ §4.4.1 / §4.4.3 |
| `lib/delegate-core.ts` | 后端 brief 第 3 条改写（后端不再被禁止 commit） |
| `docs/adr/ADR-role-aware-permissions.md` | 父篇修订行 + `:43` 行改指本文 |
| `tests/role-exemptions.test.ts` | D5② 措辞（「部分闭合」） |
| `tests/config-guards.test.ts` | **替换**旧断言（`commit=ask` ⇒ `allow` + force-push deny + push ask）；新增**落点完整性守卫**（14 个内容锚点 + 2 条负向）与**门禁声明守卫**（`verify_commands` 逐条相等） |
| `.rddf/commit-gate.json`（新增） | 本仓门禁声明：`["bun","test","tests/"]` + `["bash","scripts/check-upstream-anchors.sh"]` |
| `docs/CHANGELOG.md` | §4.7 v2.47 权限加固记录 |

## 4. 验证

```bash
bun test tests/                            # 784 pass / 0 fail（改造前 690）
bash scripts/check-upstream-anchors.sh     # OK（23/23）
openspec validate role-aware-permissions --strict  # valid
```

⚠ **未实跑的部分（如实登记）**：
① **saved approval 与 config `deny` 的优先级** —— 需人工在宿主弹窗点「Allow always」⇒ 无自动化路径（D9⑧）。
② **交互会话里 `git commit` 是否仍弹窗** —— 需 `service restart` 后复验（本会话未加载新插件）。
③ **P11（搭便车 deny）** —— 模型拒绝执行该探针命令（见 §4.2）⇒ 该条无层 2 证据；同分支由 P13 / P14 覆盖。
④ **层 2 的 e2e 仓侧回归**（`/workspace/main/rdd-workflow-e2e` 的 `test_role_gate_runtime.bats`）—— 本 change 未新增 e2e 用例，未重跑。

## 4.1 变红演练记录（层 1a / 层 1b 各判据的判别力证据）

> 形态：**临时改动 → 复跑 → 还原**（每次都还原 ⇒ 工作树无残留；还原后全量 741 pass / 0 fail）。

| # | 突变 | 实跑结果 |
|---|---|---|
| ① | `evaluateCommitGate` 改成**恒放行** | **4 fail**（①验证红 ②暂存空 ③越写集 ④无声明）⇒ 判据有判别力 |
| ② | 命令识别改成只认 `git commit ` 前缀 | **7 fail**（含「`git status` 被误判」等）⇒ 判据有判别力 |
| ③ | `.rddf/commit-gate.json` 的 `verify_commands` 改成 `[["true"]]`（拆闸门） | **1 fail**（门禁声明守卫：必须逐条相等）⇒ D9① 的缓解有效 |
| ④ | `opencode.jsonc` 的 `git commit *` 改回 `ask` | **1 fail**（档位守卫）⇒ V1 有判别力 |
| ⑤ | MAD §2.8.7 的 D5② 措辞改回「不在范围」 | **1 fail**（落点完整性守卫）⇒ V9 有判别力 |

## 4.2 层 2 实测（真宿主 `opencode run --standalone`，插件在实例内加载）

| 探针 | 期望 | 实跑 |
|---|---|---|
| P1 `git push --force` | deny | ✅ `Permission denied: shell` |
| P2 `git push origin main --force`（flag 末位） | deny | ✅ `Permission denied: shell` |
| P3 `git push -f` | deny | ✅ `Permission denied: shell` |
| P4 `git push origin main -f`（flag 末位） | deny | ✅ `Permission denied: shell` |
| P5 `git push origin main` | **非 deny**（ask + `--auto` ⇒ 放行） | ✅ completed（git 自己报无 remote） |
| P6 门禁：验证红（声明 `[["false"]]`）+ 已暂存 | 拒 | ✅ `commit-gate: 验证命令失败 ⇒ 拒绝提交：$ false`；HEAD **未推进** |
| P7 门禁：暂存区为空 | 拒 | ✅ `commit-gate: 暂存区为空 ⇒ 请先 git add 再提交` |
| P8 门禁：验证绿（声明 `[["true"]]`） | 放行 | ✅ commit completed；HEAD **推进**（`green probe`） |
| P9 门禁：`git add -A && git commit` | 拒 | ✅ 拒 |
| P10 门禁：`git commit -m x; echo "exit=$?"` | **轮 3 口径：放行** / **轮 4 口径：拒** | ⚠ 首跑被误判成「位置 pathspec」（假阳性）⇒ 轮 3 修分词后放行；**轮 4 起按「必须单独成段」改判为拒**（见 §2.2 代价）⇒ 该行**不再**作为放行证据 |
| P11 门禁：`git commit -m hitch; git push --force origin main` | 拒 | ⚠ **无证据**：模型在 `--agent build` 会话里**拒绝原样执行**该命令（自身判断「`;` 串联 push 属绕过 deny 形态」）⇒ 不产生判定证据，不记为通过；同分支由 **P13** 覆盖 |
| P12 门禁：`git commit -m "redir probe" > /dev/null 2>&1; echo "exit=$?"` | 轮 3 口径：放行 | ✅ 当时放行（`084d9fe`）；**轮 4 起该命令含 `;` ⇒ 拒** ⇒ 重定向证据改由 **P16** 承担 |
| P13 门禁（复合 deny 分支）：`git commit -m "tag probe"; git tag probe-tag` | 拒 | ✅ `Permission denied`；HEAD **未推进**（`6328c54 init`）、无 tag |
| P14 门禁（轮 4 · 命令替换）：`git commit -m "$(echo sub)"` | 拒 | ✅ 宿主 `Exit code: 1`、HEAD **未推进**（`733cf32 init`）；文案（纯逻辑）：`commit-gate: 命令里含**命令替换**（\`$(…)\` / 反引号 / 进程替换）⇒ 拒绝…` |
| P15 门禁（轮 4 · 换仓）：`git -C /tmp/opencode/cg-sub commit -m x` | 拒 | ✅ 宿主 `Exit code: 1`、HEAD **未推进**；文案：`commit-gate: \`git -C\` 会换仓 ⇒ 拒绝（门禁只能判会话所在的仓）` |
| P16 门禁（轮 4 · 纯重定向，无段分隔符）：`git commit -m "redir plain" > /dev/null 2>&1` | 放行 | ✅ 放行；HEAD 推进（`1f42171 redir plain`） |
| P17 门禁（轮 5 · 回归修复）：`git commit -m "semi probe";`（末位 `;`） | 放行（末位 `;` 只是空命令） | ✅ 放行；HEAD 推进（`bff5e6d semi probe`） |
| P18 门禁（轮 5 · 引号命令词）：`"git" commit -m "quoted probe"`（探针仓声明 `[["false"]]`） | 拒（红 ⇒ 拒） | ✅ `commit-gate: 验证命令失败 ⇒ 拒绝提交：$ false`；HEAD 未推进（`703c399 init`）⇒ 修复前该串会**静默落地**（未验证提交） |
| P19 门禁（**本交互会话 · 插件已加载**）：① `cd <dir> && git commit -m x` | 拒（复合） | ✅ `Permission denied: commit-gate: \`git commit\` 必须**单独成段**…`（**这条是我自己的调用被拦** —— `cd … &&` 前缀让整串成了复合命令） |
| P20 门禁（**本交互会话**）：② `git commit -F - <<'MSG' … MSG`（**单段**） | 放行 | ✅ 放行；门禁**先跑了仓库声明的验证命令**（`bun test tests/` 785 pass + anchors 23/23）才放行 ⇒ HEAD 推进（`5c152ee`）⇒ 真宿主上的「验证 ⇒ 放行」闭环已在本会话跑到 |

⚠ P10 的假阳性是**层 2 才能发现的坑**（层 1b 用例当时按「复合命令一律拒」写 ⇒ 与实现同源 ⇒ 无判别力）。
⇒ 口径修正后补了 4 条层 1b 用例（尾随段放行 / 前置 add 拒 / 元字符独立成 token / `&&` 形态）。

### 4.3 门禁在本会话的生效状态（事实登记）

- 插件**已在本会话加载**（此前记为「需 `service restart`」的待办**已自然解决**）：门禁实际拦下了本会话的多次提交尝试（P19 ①）。
- 由此暴露的**使用约束**（已写进 ADR D9⑪ 与本报告）：门禁按**会话所在目录**判定，且 `git commit` 必须**单独成段** ⇒
  - 提交命令**不要带 `cd … &&` 前缀**（用 shell 工具的 `workdir`）；
  - 多行提交消息用 `git commit -F - <<'MSG' … MSG`（heredoc 正文已按数据处理）或多个 `-m`。
- ⚠ **本会话的门禁是「只认复合形态」的新规则**：早期探针（P1–P18）跑在 `opencode run --standalone` 的独立实例里，规则版本不同 ⇒ 各自独立取证，不互相覆盖。

### 4.4 D5 与 D2 的职责切分（实测发现的事实登记）

D5 的**形态闭口**（单独成段 / 命令替换 / 判定对象可定位 / 提交形态闭口）**对所有仓库生效**，
D2 的**三判据**（验证命令 / 暂存区 / 角色写集）**只对声明了 `.rddf/commit-gate.json` 的仓库生效**。
⇒ 这是**必需**的切分（不是副作用）：形态闭口封的是**宿主整串前缀匹配**的漏洞，未声明的仓同样会被
`git commit -m x; git push --force …` 搭便车打穿 force-push 的 `deny`。
⚠ 实测代价：**未声明的仓**也会被形态闭口拒（如 `git commit -m x; echo ok`）⇒ 已在 ADR D3 写明。

## 5. 已用轮次

- oracle：**1 轮**（BLOCK，14 条全采纳）
- critic：**5 轮**（REJECT ×5：轮 1 三 BLOCKER / 轮 2 两 BLOCKER + 一新增 / 轮 3 上轮全闭 + 一新增 / 轮 4 字面三形态全闭 + 同类面 3 条 / 轮 5 三条全闭 + 一回归）
- 复审额度：轮 3 / 轮 4 / 轮 5 均经**用户明确批准**；若轮 5 的修法需再次复审（轮 6），**须再次取得用户批准**
