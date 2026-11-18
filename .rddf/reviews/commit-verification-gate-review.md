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
| 7 | critic（arch，复审；**用户已明确批准**，只验闭合） | **APPROVE_WITH_CONDITIONS**（**无 BLOCKER**；3 条 SHOULD_FIX） | ① `endsWithBackgroundAmp` 丢了 `!quoted` 守卫 ⇒ `git commit -m "&"` 被误拒（**本轮引入的假阳性**）⇒ 已修 + 用例；② critic 静态追踪称 `2>&1` 的 fd 前缀泄漏 ⇒ **实跑为绿**（`2>&1` 走 `>` 分支，token 干净、放行；层 2 P16 亦为放行）⇒ 静态追踪有误，**撤回**；③ 「名字带引号的赋值前缀」⇒ **bash 实测不接受**（`A=1: command not found` ⇒ 命令不执行 ⇒ 无绕过）⇒ 规则正确，边界写入 D9⑫ |
| 6 | critic（arch，复审；**用户已明确批准**，只验闭合） | **REJECT**（轮 5 的回归 + SHOULD_FIX 已闭；但本轮 diff 引入 **2 条 fail-open 回归**） | ① `stripHeredocs` 把**标记行尾部**的命令整段丢弃 ⇒ `git commit -F - <<'MSG' && git push --force …` 被判成单段 ⇒ **force-push 搭便车打穿 D4 的 deny**；② 兜底收窄后 `GIT_AUTHOR_NAME="x" git commit`（**值带引号**的赋值前缀）**完全不被识别** ⇒ 门禁整条不触发 ⇒ 未验证提交静默落地。修法见 §2.4 |
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

### 2.4 轮 6 的修法（两条 fail-open 回归 + 4 条 SHOULD_FIX/NIT）

| 面 | 修法 | 证据 |
|---|---|---|
| **BLOCKER ①**：`stripHeredocs` 丢弃标记行**尾部**的命令 ⇒ heredoc + 搭便车绕过 D5⑧ | 只删**标记本身**（`<<` / `<<-` / 结束标记词），**标记行尾部保留** | 层 1b 2 条（`… <<'MSG' && git push --force …` / `… <<'MSG' ; git push --force …` ⇒ 拒）；**层 2 P21（活会话）**：同一串 ⇒ `Permission denied: commit-gate: \`git commit\` 必须**单独成段**…` |
| **BLOCKER ②**：`GIT_AUTHOR_NAME="x" git commit`（**值带引号**）不被识别 ⇒ 门禁不触发 ⇒ 静默落地 | `Token` 加 `leadingQuote`（区分「名字被引号包住」与「值被引号包住」）；`isVarAssignment` 改为「名字不可带引号、**值可带**」；**包装命令按值判定**（`"sudo"` 仍是 sudo） | 层 1b 3 条（引号值 VAR ⇒ 识别为 commit / `"sudo" git commit` ⇒ 拒 / `VAR="a b" timeout 10 git commit` ⇒ 拒）；**层 2 P22（活会话）**：`GIT_AUTHOR_NAME="x" git commit -m "y"` ⇒ `commit-gate: 暂存区为空 ⇒ 请先 git add 再提交` ⇒ **门禁已触发**（修复前不会触发） |
| SHOULD_FIX ①：末位 `&` 可被一个换行 / 分号绕过 | `endsWithBackgroundAmp`：从尾部跳过 `\n` / `;` 再看是否 `&` | 层 1b 1 条（`… &\n` / `… &;` ⇒ 拒，文案含「单独成段」） |
| SHOULD_FIX ②：`&>` 被当成后台执行（合法提交被误拒 + 文案说错） | 分词器新增 `&>` / `&>>` 分支（stdout+stderr 重定向）⇒ 连同目标剥离 | 层 1b 1 条（`git commit -m x &> /dev/null` ⇒ 放行） |
| SHOULD_FIX ③：ADR D5 步骤表缺 heredoc 剥离规则 | D5 新增**第 0 步**（正文是数据；**标记行尾部仍是命令**） | — |
| SHOULD_FIX ④ / NIT：代价③ 与 D5③ 自相矛盾、D9 表行序、Status 行陈旧、heredoc 逐行解析边界 | 代价③ 改写；D9 表行序修正 + 新增 ⑫（逐行状态机边界）；Status 行在收口时改为**只留当前状态** | — |

## 3. 实施产物（builder）

| 落点 | 内容 |
|---|---|
| `lib/commit-gate.ts`（新增） | D5 命令识别（分词 / 全局选项 / 子命令精确匹配 / 闭口 / 复合命令 / fail-closed）+ D2 三判据组合 + 声明读取 |
| `plugins/commit-gate.ts`（新增） | 接线：shell 钩子 → 会话 → `canonicalRoot` → 声明 → 暂存状态 → 角色（主会话=身份链 / 后端=`role_class`）→ `decideWrite` → 验证命令 → 抛错 |
| `tests/commit-gate.test.ts`（新增） | 层 1b **102 条**：命中矩阵 8 / 换仓与包装（D5⑩）15 / 命令替换（D5⑨）9 / 误伤矩阵 / 提交形态闭口 12 / 必须单独成段（D5⑧）17 / fail-closed / 分词 / 三判据 / 声明 |
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
bun test tests/                            # 794 pass / 0 fail（改造前 690）
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
| P21 门禁（轮 6 · 活会话）：`git commit -F - <<'MSG' && git push --force origin main`（heredoc + 搭便车） | 拒 | ✅ `Permission denied: commit-gate: \`git commit\` 必须**单独成段**…`（**形态闭口在声明检查之前** ⇒ 与仓无关） |
| P22 门禁（轮 6 · 活会话）：`GIT_AUTHOR_NAME="x" git commit -m "y"` | 识别为 commit ⇒ 门禁触发 | ✅ `commit-gate: 暂存区为空 ⇒ 请先 git add 再提交` ⇒ 修复前该串**不触发门禁**（未验证提交静默落地） |
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

### 2.5 轮 7 的处置（末轮无 BLOCKER）

| 轮 7 SHOULD_FIX | 处置 |
|---|---|
| ① `git commit -m "&"` 被误拒（`endsWithBackgroundAmp` 丢了 `!quoted` 守卫） | ✅ **已修**（补回守卫）+ 层 1b 用例（层 1b → **101 条**） |
| ② `2>&1` 的 fd 前缀泄漏（critic 静态追踪） | ⛔ **撤回**：实跑 `tokenizeCommand("git commit -m x > /dev/null 2>&1")` ⇒ `["git","commit","-m","x"]`（干净）⇒ 放行；`2>&1` 走的是 `>` 分支（已剥 fd 前缀），`&>` 分支只处理 `&>` ⇒ 静态追踪有误 |
| ③ 「名字带引号的赋值前缀」（`"GIT_AUTHOR_NAME"="x" git commit`） | ✅ **无 fail-open**：bash 实测 `"A"=1 env` ⇒ `A=1: command not found` ⇒ 该命令**根本不会执行** ⇒ 无绕过；规则（名字不可带引号）**符合 shell 语义**；边界写入 D9⑫ |

### 2.6 轮 7 之后由**门禁自捕**的一条修正（非复审发现）

收口提交本身被门禁拦下（`必须**单独成段**`）⇒ 反查分词器：**双引号内的转义引号**（`\"`）没被处理
⇒ 引号提前闭合 ⇒ 提交消息里的 `&` 跑成**分隔符** ⇒ 合法提交被误判成复合命令。
⇒ 修：双引号内按 shell 语义处理 `\"` / `\\` / `\$` / `` \` `` 为字面量（单引号内无转义，POSIX）。
⇒ 层 1b +1（`git commit -m "say \"hi\" && b"` ⇒ 放行）；全量 794 pass / 0 fail。
⚠ 这条是**门禁在本会话里第一次抓到「我自己写的 bug」**（此前都是 critic 抓）⇒ 也说明形态闭口的误伤面仍在收敛中。

## 6. 收口后的遗留处理（**用户批准**：④+①+②，③ 留 backlog）

> ADR 已转 `Accepted` 之后，用户批准处理三个遗留 + 一个操作约束。**不是新 change**，是对 D9 条目的缓解/降级。

| 项 | 改动 | 证据 |
|---|---|---|
| ④ 判定对象改用 shell 的 `workdir`（回退会话目录） | `plugins/commit-gate.ts`：`workRoot` 取 `input.workdir`；**角色身份（`stateRoot`）仍按会话** ⇒ 两个根不混用 | 层 2 **P25**（红声明仓经 `workdir` 提交）⇒ `commit-gate: 验证命令失败 ⇒ 拒绝提交：$ false`（此前报「暂存区为空」= 判错仓）；**P26**（绿声明仓）⇒ 放行、HEAD 推进 `a5d968f` |
| ① force push **工具层兜底**（D9⑧ 降级） | 新增 `lib/push-gate.ts` + 插件 `execute.before` 硬拒；口径 = `git push` 后出现任一强推标志（**config 四形态的严格超集**，含短选项簇） | 层 1b `tests/push-gate.test.ts` 21 条；**层 2 P24**：`git push -uf origin main`（config **不覆盖**的簇形态）⇒ `push-gate: 检测到 **force push**（\`git push … -uf\`）⇒ 拒绝` |
| ② 解释器闭口（D9③⑩ 收窄） | `lib/commit-gate.ts`：段首是 `bash`/`sh`/`eval`/`xargs`/`ssh`/`docker exec`/`kubectl exec` … 且串内（含引号内）提到 `git commit` 或 force push ⇒ 拒；**用剥离 heredoc 后的串**判定 | 层 1b 12 条（含负向：`git commit -m docker` / 消息里提到 / `bash script.sh` / heredoc 正文）；**层 2 P23**：`bash -c 'git commit -m probe'` ⇒ 拒 |
| ③ heredoc 跨行引号（留 backlog） | 只在 ADR D9⑫ 登记，不实现 | — |
| 附带 | D9 新增 ⑬（`+refspec` 两层都不拦）；CHANGELOG §4.7.4；MAD §2.8.7 / §4.4.1 补「工具层兜底」 | — |

⚠ **自捕到的一条**：解释器判定最初用**未剥离 heredoc 的原串** ⇒ 命令里「heredoc 正文提到 `git commit` + 段首是 `bash x.sh`」被误拒 ⇒ 改为用剥离后的串（层 1b 补 1 条）。

### 6.1 本批的审查记录

| 轮 | 审查者 | 判定 | 处置 |
|---|---|---|---|
| 1 | oracle（**审查域: 治理面**） | **BLOCK** | ADR `:109` / `:123` 仍写「解释器形态不在门禁内」⇒ 与新增 D5⑪ 自相矛盾；编号序 `…9,11,10`；第 6 步映射缺第 11 步。**全部采纳**（两句改写 + 编号单调 + 映射补齐）；可选四项也做（push-gate 头注「严格超集」/ 测试注释 / CHANGELOG 清单指针 / MAD 投影说明） |
| 1' | oracle（复审，只验闭合） | **PASS** | BLOCK 点逐条闭合 |
| 1 | critic（build + arch 增量） | **REJECT**（1 BLOCKER + 2 SHOULD_FIX + 1 NIT） | BLOCKER：D5⑪ 的字符串侧用**正则**判强推 ⇒ 认不出 `-uf` 簇（`bash -c 'git push -uf …'` 三层全通）⇒ 已改为**去引号 + 分词**并复用 `isForceFlagToken`（**单一真源**，`push-gate` 也改用它）；SHOULD_FIX：解释器闭口按**本段**匹配（修跨段误伤：`bash lint.sh && echo "git commit done"`）、D9⑪ 补「`workdir` 指向无声明仓 ⇒ 放行」的行为反转；NIT：`scp`/`rsync` 在列的理由写进注释 |

| 2 | critic（复审，预算内） | **APPROVE_WITH_CONDITIONS**（无 BLOCKER；2 条 SHOULD_FIX） | ① `"bash" -c 'git push -uf …'`（**引号包住的解释器名**）三层全通 ⇒ 去掉 `segmentStartsWithInterpreter` 的 `!t.quoted`（与 `isGitCommandWord` 同一立场）+ 3 条用例；② ADR D5⑪ 补 `scp`/`rsync` 在列理由与引号说明 |

**验证**：`bun test tests/` **834 pass / 0 fail**（push-gate 21 + commit-gate 121）；anchors 23/23；openspec valid。

**层 2（本会话）**：P23 `bash -c 'git commit'` ⇒ 拒；**P27** `bash -c 'git push -uf origin main'` ⇒ 拒（修复前**三层全通**）；P24 `git push -uf` ⇒ 拒；P25/P26 workdir 红/绿仓判定。

## 7. Rev 2（D9⑫ / D9⑬）—— 审查与逐条处置

> 触发：ADR 收口后 D9 表里仍留两个「无缓解」项，用户裁决处理（**范围**：只收 `+refspec` + `--mirror`；heredoc 只改「单遍 + 跨行引号」；删除类登记 D9⑭）。本轮**只改 ADR 文本**，代码与 `opencode.jsonc` 属下一批（builder），治理面审查随那一批单独走。

### 7.1 实证（先摆证据，再改决策）

| # | 命令 | 结果 |
|---|---|---|
| E1 | `detectForcePush` 对 `git push origin +main` / `+refs/heads/x:refs/heads/y` / `--mirror` / `'+main'`（带引号）/ `"--force"` / `'--mirror'` | **全 `false`**（漏判）；`git push --force` ⇒ `true` |
| E2 | `bash -c "line1⏎<<'EOF'⏎" ; echo "SECOND-COMMAND-EXECUTED"` 交真实 bash | **第二段真的执行**（stdout 含 `SECOND-COMMAND-EXECUTED`） |
| E3 | 同一串交 `detectCommitInvocation` | `isCommit: false`（**fail-open 确认**） |
| E4 | 合法路径未回归 | `git commit -F - <<'MSG' ⏎ subject ⏎ MSG` ⇒ `isCommit: true` |
| E5 | 长选项缩写（scratch 仓） | `git push --mirro` ⇒ git **接受**（只报 "No configured push destination"）；`git push --forc` ⇒ git 自判 `ambiguous option` |

⇒ E3 与 E2 的对照是本轮 D9⑫ 的**判别力依据**（真实执行 vs 门禁判定不一致）。

### 7.2 逐轮处置

| 轮 | 审查者 | 判定 | 处置 |
|---|---|---|---|
| R1 | oracle（`审查域: 其他审查`） | **REJECT**（3 高优 + 1 中优） | ① 形态计数文内矛盾（D4 写 8 条、V1/D7/D8/后果/回滚仍写四形态 ⇒ 实施者照 V1 只写 4 条，**验收层面闭合、config 层面仍开着**）⇒ D4 立「计数唯一定义处」，他处全改引用，V1 变红条款加「少写 Rev 2 四条 ⇒ V1 红」；② `isForcePushToken` 未裁决 quoted token（`push-gate.ts:71` 的 `if (t.quoted) continue` 使 `git push "+main"` 放行）⇒ 裁决「quoted 不跳过」；③ 带值跳过是**调用侧**行为，`mentionsCommitOrForcePush` 未同步 ⇒ 两规则收进**同一 helper**；④ 匹配规则未钉死 ⇒ 长选项改**前缀**匹配（E5 依据），`--no-*` 天然不匹配 |
| R2 | oracle（复审，只验闭合） | **BLOCK**（仅剩 1 处） | D8 落点 #8 仍写「必须列全**四种形态**」⇒ 照此写进 MAD 会把 4-vs-8 矛盾外置。**已改引用 D4**（oracle 自己给出的验收口径），并顺手把 `:73` 改成引用（兑现「他处只引用」的字面纪律） |
| R3 | critic（`profile: arch`） | **APPROVE**（`mergeable: yes`，`scope_exceeded: false`） | 无 BLOCKER。1 SHOULD_FIX：修订行承载 Rev 2 摘要 + oracle REJECT 理由清单 ⇒ **过程日志混入决策文档**（与本文「只保留结论」自相抵）⇒ 已瘦身为结论 + `§7` 指针。3 NIT：① `push.default` 不产生 `+`（举例不精确）⇒ 已改写；② 带值选项未声明等号形态 ⇒ 已补（并写明「等号形态天然安全」的依据）；③ `--force-with-lease` **也**会被拒是「代价的另一面」⇒ 已登记（收紧，有意为之） |

**预算**：oracle 1 + 复审 1 + critic 1，**在 ADR 行额度内**（BLOCKER 允许 1 次复审；critic 仅 1 轮）。

⚠ **一处如实记录**：R2 的残留（D8 #8）是**我在 R1 修复时漏掉的同类项**（R1 已点名「D8 `:179-180`」，我改了两行却漏了同节的 `:181`）⇒ 说明「按 oracle 列表逐条改」比「按语义自己找全」可靠。

### 7.3 本轮**未做**代码/配置（一行说明，免得误读成已完成）

`lib/commit-gate.ts`（`stripHeredocs` 单遍重写 + 谓词升级）、`lib/push-gate.ts`（删 `if (t.quoted) continue` + 复用 helper）、`opencode.jsonc`（4 条 deny）、`tests/**`（V13–V16 对应用例、`tests/push-gate.test.ts:39` 的 `+main` 允许用例需**翻转**）**全部未动** ⇒ 由 builder 实施，并随实施批走 `审查域: 治理面`。

## 8. Rev 3 + 实施计划 —— 审查与逐条处置

> 触发：ADR Rev 2 收口后，用户要求「切 planner 做实施计划 → metis → critic → builder 实施」。
> 规划期**实测**发现第四个缺口（命令词引用 / 转义）⇒ 用户裁决**并入本批** ⇒ 需要先补决策文本（Rev 3）。

### 8.1 规划期实测（第四个缺口，与前三个同源）

| 输入 | 真实 bash | 门禁 | 归属 |
|---|---|---|---|
| `g\it commit -m x` | **执行 git** | `isCommit: false` | Rev 3 → D5③ |
| `$'git' commit -m x` | **执行 git** | `false` | Rev 3 → D5③ |
| `$"git" commit -m x` | **执行 git** | `false` | Rev 3 → D5③ |
| `git c\ommit -m x` | **执行 git commit** | `false` | Rev 3 → D5③ |
| `git\ commit -m x` | **不执行**（`\ ` 转义空格 ⇒ 一个词 `git commit`） | `false`（**碰巧**对） | Rev 3 → V18 负向判据 |
| `$'\x67it' commit -m x` | **执行 git**（ANSI-C 十六进制） | `false` | **D9⑮**（不实施） |
| heredoc 正文含强推字面量 | — | **误拒**（push-gate 不剥离 heredoc） | 实施对齐（AC9） |

⇒ 四条形态的根因一致：**门禁对 shell 语义的还原不完整** ⇒ 决策落在「tokenizer 源头还原词值」（Rev 3 D5③），不在比较处放宽。

### 8.2 Rev 3 审查

| 轮 | 审查者 | 判定 | 处置 |
|---|---|---|---|
| R1 | oracle（`审查域: 其他审查`） | **PASS**（3 处文字级修订，无 BLOCKER） | ① D9 表头 / V10 的「十四项」⇒「十五项」（事实错误）；② 行序倒挂（D9 ⑮ 在 ⑭ 前、V18 在 V17 前）⇒ 理顺；③ V18 补 `git\ commit` **负向判据** + 变红条款（防「先切词再剥转义」的潦草实现）；④（建议）AC 映射行补 V18 排期理由（tokenizer 还原是 V13–V15 所依赖的同一份规则 ⇒ 先行）；⑤（低）后果章把「波及全部判定」具体化为**五处**消费点 |

### 8.3 实施计划审查（planner 侧）

| 轮 | 审查者 | 判定 | 处置 |
|---|---|---|---|
| M1 | **metis**（planner 的固定审查者，硬前置） | 6 节缺口分析 | **P0 全部吸收**：① helper 签名钉死（`scanForcePush(tokens, from)`，替换 `isForceFlagToken`，不留别名）；② `stripHeredocs` **输出契约 6 条不变式**（H1–H6）+ 引号/转义口径写实；③ AC2 拆 **AC2a/AC2b**（AC2b 的期望是**拒**）；④ AC5 定为**非阻塞 + 强制记录 + 禁止宣称「config 已覆盖」**；⑤ AC4 补四类缺项（删除类放行 / 5 个带值选项 × 2 形态 / 引号命令词与子命令 / 短选项附着值）；⑥ AC6 拆「存在 + **顺序**（`indexOf` 断言）」；⑦ **符号链接约束**（`opencode.jsonc → opencode.jsonc.opencode-go`，不得替换链接、不得出现 mode 变化）。**P1 吸收**：证据包（AC8）/ 能力面投影不变 / ADR 元数据回填 / 「实施期新发现形态一律登记不扩口径」的元规则 / 形状计数守卫入 Out of Scope。**NITS**：注释类 delimiter 与 ANSI-C 表的边界登记入 Out of Scope |
| M1′ | 自查（metis 的一条建议我**未采纳**） | — | metis 称「提前终止 ⇒ fail-open」；我复核后判定应为 **fail-closed（误拒）** ⇒ 已在 proposal C 节把**两个方向相反**的边界分开标注，并写明「该 fail-closed 读法**以 H5 成立为前提**」（残余正文含不平衡引号时，tokenizer 可能吞掉后续真命令 ⇒ 该路径由 H5 收紧消除） |
| C1 | **critic**（`profile: arch + plan`） | **APPROVE_WITH_CONDITIONS**（无 BLOCKER；5 SHOULD_FIX + 4 NITS） | ① AC2a/AC2b/AC3 **改动前已绿**（实测证实）⇒ AC 表加「**取红 / 钉住**」分档（真取红点 = AC0/AC1/AC4/AC9），证据包不得把「钉住」写成「红」；② S4 横跨两层 ⇒ 补 `lib/push-gate.ts` 的**三处** quoted 检查（`:71` 参数层 / `:54` git 词定位层 / `:67` 子命令层）；③ 变红表补 **C-H5 / C-H6 / A-R4/R5** 行；④ 「四形态」落点表区分**字样落点**与**改动点**，并写明 ADR 自身两处属**史实引用不改**、AC7 的 grep 口径要排除本 change 自身 + `.rddf/reviews/**` + `docs/adr/**`；⑤ `parseGitSubcommandIndex` 的 `sub.quoted` ⇒ `git "commit"` 走 fail-closed 误拒 ⇒ **未登记残余** ⇒ 登记入 Out of Scope（并注明 ADR D9 应追加一条，归档前由 architect 补）。**NITS**：修订行版本史膨胀 / D9⑫「已闭合」与 V 未勾的读法歧义 ⇒ 记录不改（既有惯例） |

**预算**：Rev 3 = oracle 1 轮；计划 = metis 1 轮 + critic 1 轮 ⇒ 均在各自额度内（critic 尚未用满 2 轮）。

### 8.4 本批的审查面归属（重要）

- **arch**（ADR Rev 3 决策文本）：已由 oracle 审过 + critic 在 `arch` 档一并过。
- **治理面**（`opencode.jsonc` 权限段 / `tests/config-guards.test.ts` 守卫断言 / `docs/MULTI-AGENT-DESIGN.md` / `docs/CHANGELOG.md`）：
  **实施批**才产生这些改动 ⇒ 须在**实施批**走 `审查域: 治理面` 的 oracle → critic（本报告不覆盖那一轮）。

### 8.5 已登记不做的（Out of Scope，均有落点）

| 项 | 落点 |
|---|---|
| 删除类 push（`--delete` / `-d` / `:refspec` / `--prune`） | ADR **D9⑭** |
| 命令行之外的强推（`remote.<n>.push` 带 `+` / `remote.<n>.mirror`） | ADR **D9⑬** |
| 同行多个 heredoc | ADR **D9⑫** |
| 参数展开 / ANSI-C 转义表（`$CMD` / `$'\x67it'`） | ADR **D9⑮** |
| 引号包住的**子命令**（`git "commit"` ⇒ fail-closed 误拒） | proposal Out of Scope（⚠ **ADR D9 应追加一条**，architect 归档前补） |
| shell 注释 / 非常规 delimiter（`#` 里的 `<<` / `<<$X` / `<<\EOF`） | proposal Out of Scope（方向 = 误拒） |
| 形状计数三向一致守卫（6 形状 ↔ 8 条 config ↔ 用例 ↔ 文案） | proposal Out of Scope（另立 backlog） |
| ADR 拆分（正文 > 250 行，D5 的 11 步属设计规格） | proposal Out of Scope（另立 backlog） |

## 9. 实施批次（`commit-gate-force-push-heredoc`）—— 产物与证据

> 决策：ADR **Rev 2 / 2.1 / Rev 3**（§7 / §8）；计划：`openspec/changes/commit-gate-force-push-heredoc/proposal.md`（metis + critic 已审，见 §8.3）。
> 实施：builder（主会话）；治理面改动另走 `审查域: 治理面` 的 oracle → critic（见 §9.5）。

### 9.1 产物清单（逐条对 AC）

| 文件 | 改动 | 对应 AC |
|---|---|---|
| `lib/commit-gate.ts` | ① tokenizer **词值还原**（引号外 `\` 转义、`$'…'`/`$"…"` 前缀还原；不改 `quoted`/`leadingQuote`）② `stripHeredocs` 重写为**单遍 + 跨行引号**（H1–H6 输出契约）③ `isForceFlagToken` → **`scanForcePush`**（S1–S5：长选项**缩写**双向匹配 / 短选项逐字母 / `+refspec` / quoted 不跳过 / 跳带值）④ D5⑪ 字符串侧**共用**该 helper ⑤ 导出 `stripHeredocs` / `isGitCommandWord` / `parseGitSubcommandIndex(allowQuoted)` | AC0 / AC1 / AC2a / AC2b / AC3 / AC4 |
| `lib/push-gate.ts` | 复用 `scanForcePush` + `stripHeredocs`；删三处 quoted 检查（`:54` git 词 / `:67` 子命令 / `:71` 参数）；头注改口径 | AC4 / AC9 |
| `opencode.jsonc.opencode-go`（**符号链接目标**） | +4 条 `deny`（`git push +*` / `* +*` / `--mirror*` / `* --mirror*`），置于 `git push *` = `ask` **之后** | AC6 |
| `tests/config-guards.test.ts` | 断言 4 → **8 条** + **顺序断言**（新增 deny 的 `indexOf` > `git push *` 的 `indexOf`）+ 文案锚 | AC6 |
| `tests/commit-gate.test.ts` | +V18（词值还原 5 正例 + 2 负例）+ V13–V15（heredoc 5 例）+ D5⑪ 的 `-uf` 簇 | AC0 / AC1 / AC2a / AC2b / AC3 |
| `tests/push-gate.test.ts` | **翻转** `+main` 的允许用例；+六形态 + 反向判据（带值选项 / 删除类 / `--no-force-with-lease`）+ AC9 | AC4 / AC9 |
| `docs/MULTI-AGENT-DESIGN.md` | 页首 + §2.8.7 + §4.4.3（八条 / 单一真源 / 带值跳过） | AC6 |
| `docs/CHANGELOG.md` | §4.7.4 口径 + **新节 §4.7.5**（含 `--force-with-lease` 也被拒的**用户可感知变化**） | AC6 |
| `docs/adr/ADR-commit-verification-gate.md` | 元数据回填（关联 change / AC 映射 / V 勾选）+ D4 的「证据缺口」**改为实测结论** | AC6 / AC7 |
| `openspec/changes/commit-gate-force-push-heredoc/.openspec.yaml` | `skip_specs: true`（planner 写集不含该文件 ⇒ builder 建） | AC7 |
| `.rddf/reviews/commit-gate-force-push-heredoc-mutations.md` | **AC8 证据包**（12 条变红演练） | AC8 |

### 9.2 层 1b（`bun test tests/`）

**834 pass / 0 fail（改前）⇒ 877 pass / 0 fail（改后，+43）**；`bash scripts/check-upstream-anchors.sh` ⇒ **23/23**；`openspec validate commit-gate-force-push-heredoc --strict` ⇒ **valid**。

### 9.3 变红演练（AC8）—— **13/13 全部变红**

证据包：`.rddf/reviews/commit-gate-force-push-heredoc-mutations.md`（每条含「突变点 → 必红的用例名 → 复原后复跑全绿」）。

| 子规则 | 突变 | 变红的用例 |
|---|---|---|
| A-R1/R3 | 删掉引号外转义 + `$'…'` 前缀还原 | V18「`g\it commit -m x` ⇒ 识别为 commit」 |
| A-R2 | 转义字符当分隔符（先切词再剥转义） | 同上 |
| B-S1 | 长选项改回精确名集合 | 「`git push --mirro` ⇒ 拒」 |
| B-S2 | 短选项退回「含 f 即强推」 | 「`git push -oquickfix origin main` ⇒ 放行」 |
| B-S3 | 删 `+refspec` 分支 | 「`git push origin +main` ⇒ 拒」 |
| B-S4 | 恢复 quoted 跳过 | 「`git push origin "+main"` ⇒ 拒」 |
| B-S5 | 删「跳带值选项的值」 | 「`git push --push-option +ci origin main` ⇒ 放行」 |
| C-H1/H2 | 引号状态**不跨行** | 「AC1 跨行引号里的 `<<` 不是标记 ⇒ 真命令不得漏判」 |
| C-H3 | 删整个标记行（而非只删标记） | 「AC2b 标记行尾部保留」 |
| C-H4 | 不删正文 | 「AC2a 合法 heredoc 提交 ⇒ 放行」 |
| C-H5 | 终止行判定退回 `.trim()` | 「H5 `EOF ` 尾随空格 ⇒ 不终止」 |
| C-H2b | `scanLine` 的 `$'…'` 分支多跳一格（开引号不被跟踪） | 「标记行尾部挂**未闭合 `$'…'`** ⇒ 真命令不得漏判」 |
| D-AC6 | config 只写 4 条 deny | 档位守卫「force-push 八条 ⇒ deny」 |

⚠ **两处自捕**（与 §7.2 同类）：① 首个 C-H1/H2 突变点打偏（改的是 `scanLine` 的入参，而**分支条件**仍用跨行携带的 `quote` ⇒ 没红）⇒ 改为突变「不跨行携带引号」；② C-H5 的首个用例**不可判别**（正文里没有真命令 ⇒ 提前终止与否结果相同）⇒ 用例改为在 `EOF ` 之后放一条 `git commit -m sneaky`。
⚠ 演练期间**一次污染**：探针在 `/tmp/opencode` 留了 `.git` ⇒ 污染了 `tests/delegate-tool.test.ts` 的「非 git 工程」用例（vcs 闸门）⇒ 已删除该 `.git`（本会话探针产物）⇒ 复跑 874 pass / 0 fail。

### 9.4 层 2 实测（真宿主）

| 探针 | 期望 | 实跑 |
|---|---|---|
| **P28**（独立实例 `opencode run --standalone --auto`，**新插件代码**）`g\it commit -m x`（Red 声明仓） | 被识别为 commit ⇒ 门禁触发 | ✅ `commit-gate: 暂存区为空 ⇒ 请先 git add 再提交`（**插件文案**，非 git 报错）⇒ HEAD 未推进（`75c616e init`）。⇒ 修复前该串**完全不触发门禁**（未验证提交静默落地） |
| **P29**（同上）`git push "+main"`（带引号形态） | config 匹配不到 ⇒ 工具层兜住 | ✅ `push-gate: 检测到 **force push**（\`git push … +main\`）⇒ 拒绝` ⇒ **未执行 git** |
| **P30**（本交互会话 · config 层）`git push origin +main` | 归因 | ✅ 宿主 `permission.rejected`（⇒ **config 的 `git push * +*` 生效**）；对照 `git push origin main`（只匹配 `ask`）⇒ **过了权限层**、真执行了 git ⇒ 证明拒的确实是新增的 `deny` |
| **P31**（本交互会话 · config 层）`git push --mirror` | 归因 | ✅ 宿主 `permission.rejected`（⇒ `git push --mirror*` 生效） |
| **P32a**（**纯 bash** · 无门禁对照）`bash -c "line1\n<<'EOF'\n" ; git commit -m x`（暂存区有改动） | 该形态在真实 bash 下**真的执行** `git commit` ⇒ 门禁若不拦 = **未验证提交落地**（fail-open） | ✅ `bash: line 1: line1: command not found` + `warning: here-document … (wanted 'EOF')`（**bash -c 段失败**）⇒ 但 `;` 之后的 `git commit -m x` **照常执行** ⇒ HEAD `636c621` → **`e5b66da`** ⇒ 该形态危险 ⇒ 拦它是必要的 |
| **P32b**（独立实例 `opencode run --standalone --auto --agent build`，**新插件代码**）同一命令（探针仓 `/tmp/opencode/cg-ac1`，Red 声明 + 暂存区有改动） | 真宿主里被**拒**，且理由是「**单独成段**」⇒ **不是**「暂存区为空」 | ✅ 工具返回 `{"error":{"type":"unknown","message":"commit-gate: \`git commit\` 必须**单独成段**（不得与 \`;\` / \`&&\` / \`||\` / \`\|\` / \`&\` / 换行拼接）⇒ 拒绝（整串以 \`git commit \` 开头会让其余段的 permission 档位全部失效）"}}` ⇒ 探针仓 HEAD 仍 `9b89389 init`、`a.txt` 仍暂存（`M  a.txt`）⇒ **提交未落地** |

⇒ **证据缺口的结论变了**：ADR D4 原写「宿主 glob 能否跨空格匹配中缀**无源码锚点** ⇒ config 层 best-effort」
⇒ **实测：能匹配** ⇒ config 层**生效**；但**带引号形态**匹配不到 ⇒ 那类**只有工具层**能拦 ⇒ **工具层仍是权威兜底**（已回写 ADR D4 与 V17）。

⚠ **层 2 的前置条件**：插件在 **server 启动时**加载 ⇒ 本会话的插件仍是**改前**代码 ⇒ P28 / P29 / **P32b** 用**独立实例**跑（新代码）。
✅ **AC1 的层 2 复验已补**（P32a / P32b，见上）⇒ 三层闭环：**纯 bash 证明该形态会真提交**（P32a：HEAD 推进）⇒ **真宿主证明门禁拦住了它**（P32b：HEAD 未推进 + 理由 = 「单独成段」）。
⇒ **新旧代码的判别力不靠文案、靠行为**：改前（逐行 heredoc 状态机）会把 `<<'EOF'` 当真标记 ⇒ 剥到串尾 ⇒ `git commit -m x` 被吞 ⇒ **门禁看不见 ⇒ 命令照常执行**（P32a 展示的正是那个「照常执行」）；改后（单遍 + 跨行引号）⇒ 命令可见 ⇒ 复合形态被拒 ⇒ HEAD 未推进。⚠ P32b 的**独立实例**用的是**工作树当前代码**（`56dd267` 之后），故新代码在位。

### 9.5 实施批的审查记录

| 轮 | 审查者 | 判定 | 处置 |
|---|---|---|---|
| I1 | **oracle**（`审查域: 治理面`） | **PASS-WITH-NOTES**（3 条必修） | ① `CHANGELOG §4.7.4` 仍写「`+refspec` 两层都不拦」⇒ 与 §4.7.5 自相矛盾 ⇒ 标为**当时快照**并指向 §4.7.5；② 守卫的**顺序断言只钉了新增 4 条** ⇒ 扩到**全部 8 条**（顺序即策略）；③ **config 层表达不了「跳带值」** ⇒ `git push -o +ci origin main` 在**权限层**即被 deny（假阳性）⇒ 登记到 ADR D4 / MAD §4.4.3 / proposal AC4 三处 |
| I2 | **critic**（`profile: build + arch`） | **REJECT**（1 BLOCKER + 2 SHOULD_FIX + 5 NITS，`scope_exceeded: true`） | **BLOCKER**：`scanLine` 的 `$'…'` 分支**多跳一格**（与 `tokenizeCommand` 不一致 ⇒ 开引号不被跟踪）⇒ `cat <<EOF $'` 这类「标记行尾部挂未闭合 `$'…'`」被判成引号平衡 ⇒ `<<` 当真标记 ⇒ 剥掉后续行 ⇒ **漏判真命令**（已用真实 bash 复现：后续命令执行、门禁判 `isCommit: false`）⇒ 已修 + 补回归用例 + 补突变行 C-H2b。SHOULD_FIX：① 裸 `--`（选项终止符）命中 S1 前缀匹配 ⇒ `git push origin -- main` 被误判强推 ⇒ 已排除 + 补负向用例；② 带值长选项只认**全名** ⇒ `--push-o +ci`（缩写）的值被 S3 误拒 ⇒ 改**双向前缀** + 补负向用例。NITS：证据包的「目标测试」列错位（脚本变量泄漏）⇒ 已修；CHANGELOG §4.7.5 缺 config 层 caveat ⇒ 已补；`cli.json` 的 `verbosity` 改动**不在本批范围** ⇒ **不纳入提交**（运行时文件）；`.openspec.yaml` 注释引用了不存在的 `design.md` ⇒ 已改；报告 §5 重复片段 ⇒ 已删 |

| I3 | **critic**（**第 3 轮**，经用户明确批准，**只验 BLOCKER 闭合** + 本轮新增 diff） | **APPROVE**（`mergeable: yes` / `scope_exceeded: false`） | BLOCKER **已闭合**，判定依据：① `scanLine` 的 `$'…'` 分支 `continue` 前不再动 `i`，与 `tokenizeCommand` 的同分支逐字同构 ⇒ 标记行返回时 `endQuote !== null` ⇒ `<<` 不进候选；② 回归用例 `tests/commit-gate.test.ts:158` 钉住；③ 变红演练 C-H2b 钉证「去掉修复 ⇒ 该用例必红」。两条 SHOULD_FIX 与 NIT 落点逐条核实到位。新增 NIT（不阻断）：双向前缀会接受 `--push-option-extra` 这类比真选项更长的假缩写 —— 只会多吞一个非 `+` 词，方向仍 fail-closed。 |

⚠ **预算**：本 change 的 critic 共用 **3 轮**（计划审查 §8.3 + 实施审查 §9.5-I2 + 闭合验证 §9.5-I3），**第 3 轮经用户明确批准且只验闭合**；I3 无新 BLOCKER ⇒ 不再复审。闭合证据：新增用例 `标记行尾部挂**未闭合 $'…'** ⇒ 真命令不得漏判` 由变红 C-H2b 钉住（去掉修复 ⇒ 该用例必红）。

### 9.6 AC 逐条判定

| AC | 判定 | 证据 |
|---|---|---|
| AC0 | ✅ | 层 1b 9 例 + 变红 A-R1/R3 / A-R2 + 层 2 P28 |
| AC1 | ✅（层 1b **+ 层 2**） | 层 1b 用例 + 变红 C-H1/H2 + **层 2 P32a（纯 bash 证明会真提交）/ P32b（真宿主拦住 + 理由 =「单独成段」）** |
| AC2a | ✅（**钉住**：改动前已绿） | 层 1b + 变红 C-H4 |
| AC2b | ✅（**钉住**） | 层 1b + 变红 C-H3 |
| AC3 | ✅（**钉住**） | 层 1b |
| AC4 | ✅ | 层 1b 30+ 例（含 `--` 终止符 / 带值缩写反向判据）+ 变红 B-S1–S5 + 层 2 P29 |
| AC5 | ✅ | 层 2 P30 / P31（归因已记录，结论只写「config 层生效 / 工具层兜底」） |
| AC6 | ✅ | 守卫 8 条 + 顺序断言 + 变红 D-AC6；全部落点已同步（grep 口径见 proposal AC7） |
| AC7 | ✅ | 877 pass / 0 fail；anchors 23/23；`openspec validate --strict` valid；grep 口径剩余命中为空 |
| AC8 | ✅ | 证据包 13/13 变红 |
| AC9 | ✅ | 层 1b 2 例（正文含强推字面量 ⇒ 不拦；正文之外 ⇒ 仍拒） |

✅ **已闭环**（§10）：`git "commit"`（引号包住的**子命令**）走 fail-closed **误拒** ⇒ **已登记**为 ADR **D9⑯**（含 `git "status"` 实测）⇒ 处置见 §10（oracle APPROVE + 三处登记补齐 + 钉证用例 + 变红演练）。

## 11. 层 2 复验（AC1）+ V10「三处登记」逐项核对 —— 归档前的最后两件事

### 11.1 层 2 复验：AC1 的跨行引号形态（真宿主）

> 触发：§9.4 原记「**未实跑**：AC1 的跨行引号形态在真宿主的层 2 复验（需 `service restart`）」。
> 做法：**独立实例**（`opencode run --standalone --auto --agent build`）⇒ 插件在实例启动时从工作树加载 ⇒ **新代码在位**；探针仓 `/tmp/opencode/cg-ac1`（Red 声明 + 暂存区有改动）。

| 探针 | 层 | 期望 | 实跑 |
|---|---|---|---|
| **P32a** | **纯 bash**（无门禁对照） | 该形态**真的执行** `git commit` ⇒ 门禁不拦就是 fail-open | ✅ HEAD `636c621` → **`e5b66da`**（`bash -c` 段报 `line1: command not found` + `here-document … (wanted 'EOF')`，但 `;` 之后照常提交） |
| **P32b** | **真宿主**（独立实例 · 新插件代码） | 被拒，且理由 =「**单独成段**」（**不是**「暂存区为空」） | ✅ 工具报错 `commit-gate: \`git commit\` 必须**单独成段**（不得与 \`;\` / \`&&\` / \`||\` / \`\|\` / \`&\` / 换行拼接）⇒ 拒绝` ⇒ 探针仓 HEAD 仍 `9b89389 init`、`a.txt` 仍暂存 ⇒ **提交未落地** |

**判别力不靠文案、靠行为**：改前（逐行 heredoc 状态机）会把跨行引号里的 `<<'EOF'` 当真标记 ⇒ 剥到串尾 ⇒ `git commit -m x` 被吞 ⇒ 门禁看不见 ⇒ 命令照常执行（**P32a 展示的正是那个「照常执行」**）；改后（单遍 + 跨行引号）⇒ 命令可见 ⇒ 复合形态被拒 ⇒ HEAD 未推进（**P32b**）。
⇒ **AC1 的三层证据齐**：层 1b 用例 + 变红 `C-H1/H2` + 层 2 P32a/P32b。

### 11.2 V10「免宣称十六项三处登记」逐项核对（**事实核查**）

> V10 原文（ADR `:302`）：「**免宣称十六项三处登记**（AC + 测试注释 + 主题文档）+ D5② 旧措辞三处同批改 …… **变红**：删掉任一处登记 ⇒ V10 红。」
> ADR `:221` 的 D9 表前言同口径：「每项写清『防什么 / 不防什么 / 缓解』，并在 **AC + 测试注释 + 主题文档三处**登记」。

**核对方法**：按 D9 每项的**加粗标题**取特征词，对三处做机器扫描（`AC` = `openspec/changes/commit-gate-force-push-heredoc/` + `.rddf/improvements/commit-gate-force-push-heredoc.md`；`TEST` = `tests/`；`DOC` = `docs/MULTI-AGENT-DESIGN.md`），再对 0 命中项做**宽松复扫**（`非交互` / `盲区` / `语义` / `别名` / `workdir` / `残余`）人工判读。

| # | D9 项 | AC | TEST | DOC | 缺 |
|---|---|---|---|---|---|
| ① | 声明文件可被改写 / 被弱化 | — | ✅ | — | AC / DOC |
| ② | 插件缺席 ⇒ 门禁不存在 | — | ✅ | ✅ | AC |
| ③ | 间接提交不在门禁内 | — | ✅ | ✅ | AC |
| ④ | 其它仓库不受门禁 | — | ✅ | — | AC / DOC |
| ⑤ | 非交互路径能力扩张 | — | — | — | AC / TEST / DOC |
| ⑥ | 命令解析固有盲区 | — | ✅（与 ②③ 同一行汇总） | ✅（同上） | AC |
| ⑦ | 语义类缺陷验证命令覆盖不到 | — | — | — | AC / TEST / DOC |
| ⑧ | saved approval 可能越过 D4 的 deny | — | ✅ | ✅ | AC |
| ⑨ | 后端的提交面宽于其 edit 面 | — | — | — | AC / TEST / DOC |
| ⑩ | 字符串级判定的残余面 | — | — | — | AC / TEST / DOC |
| ⑪ | 判定对象以 shell 的 `workdir` 为准 | — | — | — | AC / TEST / DOC |
| ⑫ | 同一行多个 heredoc 只处理第一个 | ✅ | — | — | TEST / DOC |
| ⑬ | 命令行之外的强推不可见 | ✅ | — | — | TEST / DOC |
| ⑭ | 删除类 push 未纳入强推口径 | ✅ | ✅ | — | DOC |
| ⑮ | 命令词的运行时 / 转义表还原不可静态判定 | ✅ | — | — | TEST / DOC |
| ⑯ | 引号包住的 `git` 子命令走 fail-closed 误拒 | ✅ | ✅ | ✅ | **三处齐全**（本批 oracle 的后续义务已闭环） |

⚠ **口径说明（不夸大）**：本表是**关键词命中**的**下界** —— 同义表述可能被漏计；已对 0 命中项做宽松复扫并人工判读（⑤⑥⑦⑨⑩⑪ 在三处均无实质登记）。
⇒ **结论（事实）**：**十六项中只有 ⑯ 三处齐全**；①–⑮ 缺 1–3 处 ⇒ **V10 按字面严格核验会判不通过**。
⇒ **归因**：这是**本批之前就存在**的结构性缺口（D9 表 ①–⑮ 从未补齐三处登记）⇒ **不是本批引入**，本批只把新登记的 ⑯ 做齐（oracle 的后续义务）。

### 11.3 处置：登记为 backlog（**不在本批静默扩范围**）

| 项 | 内容 |
|---|---|
| **backlog 名（建议）** | `commit-gate-d9-three-place-registration` |
| **要解决什么** | ADR `:221` + `:302` 承诺「D9 每项在 AC + 测试注释 + 主题文档**三处**登记」，实际只有 ⑯ 齐全 ⇒ **宣称与登记不一致**（与本批 critic 在 §9.5 抓到的是同一类病，只是对象不同） |
| **两条候选路径（需裁决）** | **A 补登记**：给 D9 每项一个**稳定标识**（`D9①`…`D9⑯`），在三处各登记一次，并加**守卫测试**（照 `tests/role-exemptions.test.ts` 的 `AC23` 形态：机械查三处命中 + 「删任一处 ⇒ 必红」的判别力用例）⇒ V10 的「变红」条款才有机械载体。**B 改口径**：把 ADR `:221` / `:302` 的措辞从「三处登记」降为「**均登记于 ADR；部分项另有两处指针**」⇒ 承认现状，但**放弃**机械守卫（⇒ V10 只能人工核） |
| **用户裁决（2026-11-18）** | **路径 A**（补登记 + 加机械守卫）—— 理由与本仓既有纪律一致：V10 的价值在**机械可判**，降级成人工核 ⇒ 下一条 D9 项仍只写 ADR 一处 ⇒ 病复发 |
| **落地产物** | ✅ **improvement 草稿已写**：`.rddf/improvements/commit-gate-d9-three-place-registration.md`（5 段 + frontmatter；**由 builder 代 planner 起草**（用户指定）⇒ **待 planner 审查**（metis 1 轮）后方可立项）—— 先例：`delegate-base-resolved-return`（`docs/CHANGELOG.md:410-412`） |
| **⚠ `add-improve` 的 HARD-GATE 校验结果** | ❌ **不通过**（`pre_create_brainstorm_check.sh`）：缺 `## 架构依据` / `## 范围` / `**主题**:` ⇒ **本仓 20 个 improvement 文件（含本文件）全部同样不通过**（`通过=0 / 不通过=20`）⇒ **schema 不在本仓适用**，非本文件特有问题；根因已在本仓 CHANGELOG 有明文（本仓无 `improvement-suggestions.md`、无 roadmap Phase Skeleton ⇒ 无 `主题:` 可匹配）⇒ **不注册** `improvement-suggestions.md`（该文件在本仓不存在；新建一个只含一行的索引会让其余 19 项「看起来没登记」） |
| **为什么不在本批** | ① 触及 **ADR 决策文字**（V10 = Verification 判据）⇒ 须 **architect** 角色 + oracle/critic；② 补登记涉及 **15 项 × 最多 3 处**的文档与测试改动 ⇒ 体量与本批（强推口径 + heredoc + 词值还原）**不同病**，混在一起会让本批的边界失焦；③ 本批已用满 critic 预算（3 轮）⇒ 混批审不动 |
| **本批只登记什么** | 本报告（builder 的记账面）+ **improvement 草稿**（用户已批准 ⇒ 代 planner 起草，**未立项**）⇒ **不写** `openspec/changes/**`（立项是 planner 的动作）、**不改** ADR 措辞（architect 的动作）、**不动**任何守卫 / 文档登记（builder 的实施动作，在下个 change 里做） |
| **谁来做（下一步）** | **planner**：metis 1 轮审草稿 → 立项 `openspec/changes/<name>/`（AC-A–AC-F 编号）⇒ **architect**：D1 标识 + D6 ADR `:221`/`:302` 措辞（含守卫载体与标识口径）⇒ **builder**：D2/D3/D4 三处登记 + D5 守卫（含判别力突变演练） |
| **与本批的关系** | ⛔ **不并入** `commit-gate-force-push-heredoc`（不同病 + 该批 critic 预算已用满）⇒ **该批的归档不依赖本项完成**；本项独立立项、独立审查 |

## 10. ADR 补登（D9⑯ + ⑮ 行吞后果类）—— 审查与逐条处置

> 触发：上一轮 critic（实施审查）指出两处「宣称与登记不一致」——① `git "commit"` 这条**实际会发生**的行为（fail-closed 误拒）只在 plan 的 Out of Scope，ADR 里没登记（plan 原话「architect 动作，归档前补」）；② D9⑮ 只写「命令词不可识别」一类后果，而实施批的 BLOCKER 实证了另一类（**行吞**：漏掉的是**其后**命令）。
> 用户裁决：**现在补**。范围：**不改任何决策**，只动 D9 的两格 + 计数。

### 10.1 改动清单

| 落点 | 改动 |
|---|---|
| `docs/adr/ADR-commit-verification-gate.md` | D9 表头计数 十五 → **十六**；V10 同步；**新增 ⑯**（引号包住的 `git` 子命令 ⇒ fail-closed 误拒，含 `git "status"` 实测）；**⑮ 补第二后果类「行吞」**（并标注第二个机理为「同类机理推定」）；修订行加一句「Rev 3 收尾（归档前补登）」（**不新开 Rev 号**，避免元数据头膨胀） |
| `docs/MULTI-AGENT-DESIGN.md` §2.8.7 | 一句 pointer 指向 D9⑯（**叙述性**，不新增判据、不改任何表格行 / 不变式 / 触发条件 ⇒ 按 §审查配对 不需要新增 critic 轮） |
| `openspec/changes/commit-gate-force-push-heredoc/proposal.md` | Out of Scope 的「待补」改为「**已登记 D9⑯**」+ 钉证用例指针 |
| `tests/commit-gate.test.ts` | **D9⑯ 钉证 3 例**（`git "commit" -m x` / `git "status"` / `git -c k=v "commit"` ⇒ `block` 含「无法解析 `git` 的子命令」）—— 只钉当前行为，**不是需求** |

### 10.2 审查

| 轮 | 审查者 | 判定 | 处置 |
|---|---|---|---|
| A1 | **oracle**（`审查域: 其他审查`，arch 面） | **APPROVE**（1 条后续义务 + 1 条措辞 SHOULD_FIX + 1 条可选） | ① **后续义务**：⑯ 的「三处登记」为 0/3（AC 无 pointer / 测试无钉证 / MAD 无 pointer）⇒ V10 核验时会 resurface 成 BLOCKER ⇒ **三处全补**（proposal Out of Scope 指本行 + `tests/commit-gate.test.ts` 的 D9⑯ 用例 + MAD §2.8.7 一句）；② **措辞**：⑯ 原句「Rev 3 的词值还原只还原命令词、未放开子命令」机理不精确（词值还原对**所有** token 生效 —— V18 的 `git c\ommit` 就是子命令词值被还原；拒绝来自 `quoted` **形态标记**检查）⇒ 改为「Rev 3 还原的是词值，子命令槽位仍按 `quoted` 标记拒绝（`allowQuotedSub` 默认 `false`；与词值还原无关，别去改 tokenizer）」；③ **可选**：⑮ 的第二个机理（分词器未闭合引用吞行）无实证 ⇒ 标「（同类机理推定）」。**自疑两点获裁决**：过程史实（`$'` 分支多跳一格）**保留正确**（本文体例内嵌带日期实证，且它是「行吞」的唯一实证、直接决定判据设计）；⑯ **追加在末尾正确**（重编号会打断既有引用） |

### 10.3 新增用例的变红演练

| 突变 | 结果 |
|---|---|
| `lib/commit-gate.ts::parseGitSubcommandIndex` 的 `allowQuotedSub` 默认值 `false` → `true` | **3 例全红**（`git "commit" -m x` / `git "status"` / `git -c k=v "commit"`）⇒ 用例对「当前行为」有判别力 |

复原后：`bun test tests/` ⇒ **880 pass / 0 fail**（改前 877，+3）；`bash scripts/check-upstream-anchors.sh` ⇒ 23/23。

### 10.4 结论

- **未改决策**：D1–D8 / D4 / D5 / 选项对比表 / 后果章 / Verification 判据文本**逐字未动**（oracle 已核）。
- **宣称 = 实现**：⑯ 现在**三处可查**（ADR D9⑯ ↔ proposal Out of Scope ↔ 测试钉证 + MAD pointer），V10 核验时不会因 ⑯ 塌陷。
- ⚠ **登记（不在本批）**：V10 声称「十六项**三处登记**」，但 ①–⑮ 中多数只有 ADR 一处（与 ⑯ 之前的体例相同）⇒ 这是**本批之前就存在**的结构性缺口 ⇒ 归档前统一核对时若按 V10 严格判，需另立一项补齐（**不**在本次静默扩范围）。

## 5. 已用轮次

- oracle：**1 轮**（BLOCK，14 条全采纳）
- critic：**7 轮**（REJECT ×6 + `APPROVE_WITH_CONDITIONS` ×1；末轮**无 BLOCKER** ⇒ 满足「BLOCKER 全闭 + 复审确认闭合」）
- 复审额度：轮 3 – 轮 7 均经**用户明确批准**
- ⚠ **规律**（已登记）：每轮都能抓到**新引入**的绕过面 ⇒ 收紧口径的每一步都带来新的解析边界 ⇒ 收口前**必须**有一轮「只验闭合」确认；本 change 共 7 轮（远超 ADR 行的 1+1 额度，**全部经用户逐轮批准**）
- **Rev 2 批次**（D9⑫⑬，见 §7）：oracle **1 轮**（REJECT）+ 复审 **1 次**（BLOCK，1 处残留）+ critic **1 轮**（APPROVE）⇒ 在 ADR 行额度内
- **Rev 3 + 实施计划**（见 §8）：oracle **1 轮**（PASS）+ metis **1 轮** + critic **1 轮**（APPROVE_WITH_CONDITIONS，5 SHOULD_FIX 全处置） ⇒ 在额度内
- **实施批**（见 §9.5）：oracle **1 轮**（`审查域: 治理面`，PASS-WITH-NOTES，3 条必修已落）+ critic **2 轮**（计划审查 §8.3 + 实施审查 §9.5，后者 REJECT 1 BLOCKER ⇒ 已修）⇒ critic 第 **3** 轮（只验 BLOCKER 闭合，经用户批准）⇒ **APPROVE**（闭合已确认）
- **ADR 补登**（见 §10）：oracle **1 轮**（`审查域: 其他审查`，**APPROVE**；1 条后续义务 + 1 条措辞已落）；MAD 的一句 pointer 属**叙述性**改动（不新增判据）⇒ 不新增 critic 轮
- **层 2 复验 + V10 核对**（见 §11）：**无治理面 / ADR 文字改动** ⇒ 无新增审查轮（只读核对 + 报告记账）；本轮**未改任何决策、配置、代码** ⇒ 既有审查结论继续有效
