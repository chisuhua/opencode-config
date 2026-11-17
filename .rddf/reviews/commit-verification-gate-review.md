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
| 3 | critic（arch，复审；**用户已明确批准**超出 2 轮预算） | **REJECT**（上轮 3 条 BLOCKER **全闭合**；本轮新 diff 引入 **1 条新 BLOCKER**） | 新 BLOCKER = 复合命令「尾随段放行」与 D5 的口径冲突：`git commit -m x; git push --force origin main` **整串以 `git commit ` 开头** ⇒ 命中 `allow` ⇒ push 的 `ask` / force-push 的 `deny` **同时失效**（**搭便车**）。修：见 §2.1 |

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

## 3. 实施产物（builder）

| 落点 | 内容 |
|---|---|
| `lib/commit-gate.ts`（新增） | D5 命令识别（分词 / 全局选项 / 子命令精确匹配 / 闭口 / 复合命令 / fail-closed）+ D2 三判据组合 + 声明读取 |
| `plugins/commit-gate.ts`（新增） | 接线：shell 钩子 → 会话 → `canonicalRoot` → 声明 → 暂存状态 → 角色（主会话=身份链 / 后端=`role_class`）→ `decideWrite` → 验证命令 → 抛错 |
| `tests/commit-gate.test.ts`（新增） | 层 1b **49 条**：命中矩阵 12 / 误伤矩阵 8 / 闭口 11 / 复合命令 2 / fail-closed 2 / 分词 3 / 三判据 5 / 声明 5 |
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
bun test tests/                            # 755 pass / 0 fail（改造前 690）
bash scripts/check-upstream-anchors.sh     # OK（23/23）
openspec validate role-aware-permissions --strict  # valid
```

⚠ **未实跑的部分（如实登记）**：
① **saved approval 与 config `deny` 的优先级** —— 需人工在宿主弹窗点「Allow always」⇒ 无自动化路径（D9⑧）。
② **交互会话里 `git commit` 是否仍弹窗** —— 需 `service restart` 后复验（本会话未加载新插件）。
③ **P11（搭便车 deny）** —— 模型拒绝执行该探针命令（见 §4.2）⇒ 该条无层 2 证据；同分支由 P13 覆盖。
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
| P9 门禁：`git add -A && git commit` | 拒（前置段改 index） | ✅ 拒 |
| P10 门禁：`git commit -m x; echo "exit=$?"` | **不拦**（尾随段无害） | ⚠ **首跑被误判成「位置 pathspec」⇒ 假阳性** ⇒ 已修（分词：元字符独立成 token）⇒ 复跑通过 |
| P11 门禁（轮 3 新口径）：`git commit -m hitch; git push --force origin main` | 拒 | ⚠ **无证据**：模型在 `--agent build` 会话里**拒绝原样执行**该命令（自身判断「`;` 串联 push 属绕过 deny 形态」）⇒ 该探针**不产生判定证据**，不得记为通过。同一 `invocation.block ⇒ throw` 分支的 deny 效果由 **P13** 覆盖 |
| P12 门禁（轮 3 新口径）：`git commit -m "redir probe" > /dev/null 2>&1; echo "exit=$?"` | **不拦**（重定向 + fd 前缀剥离后无残留 token） | ✅ 放行；HEAD 推进（`084d9fe redir probe`）、工作树干净 ⇒ 假阳性修复在真宿主上有效 |
| P13 门禁（轮 3 新口径·deny 分支）：`git commit -m "tag probe"; git tag probe-tag` | 拒（`git tag` 不在只读清单） | ✅ `commit-gate: 复合命令中的 \`git tag\` 段不在「只读 git」清单 ⇒ 拒绝…`；HEAD **未推进**（`6328c54 init`）、无 tag |

⚠ P10 的假阳性是**层 2 才能发现的坑**（层 1b 用例当时按「复合命令一律拒」写 ⇒ 与实现同源 ⇒ 无判别力）。
⇒ 口径修正后补了 4 条层 1b 用例（尾随段放行 / 前置 add 拒 / 元字符独立成 token / `&&` 形态）。

## 5. 已用轮次

- oracle：**1 轮**（BLOCK，14 条全采纳）
- critic：**3 轮**（REJECT ×3：轮 1 三 BLOCKER / 轮 2 两 BLOCKER + 一新增 / 轮 3 上轮全闭 + 一新增；逐条采纳并修）
- 复审额度：轮 3 经**用户明确批准**；若轮 3 的新 BLOCKER 需再次复审（轮 4），**须再次取得用户批准**
