# ADR：commit 审批点搬到工具层验证门（push 维持人工）

## 元数据

| 字段 | 值 |
|---|---|
| Status | **Draft**（oracle 1 轮 BLOCK 已修；critic 1 轮 REJECT 已修 ⇒ 待复审） |
| Date | 2026-11-18 |
| Author | architect（主会话） |
| Parent | `ADR-role-aware-permissions`（其 D5② 免宣称由本文**部分**闭合；其 `:43` 的执行点表述由本文改写）＋ `ADR-class-write-scope-alignment`（能力面投影纪律，引用点 = `lib/delegate-core.ts:619-627` 的 ask/deny 计数派生） |
| 关联 change | **未立项** ⇒ 登记 `backlog: commit-verification-gate`（立项后回填本行 + AC 映射 + `design.md` 的变红演练条款） |
| 关联 backlog | ① `openspec/changes/required-question-commit-confirm/proposal.md` 的 AC5/AC6 以「权限层加 ask」为机制结论（已勾未归档）⇒ **本文反转该档位** ⇒ 该 change 待归档时须按本文改写；② `prompts/front.md` 的「提交由用户在确认后另行发起」措辞会陈旧（front 的 commit 本就 deny ⇒ 行为不变）|
| AC 映射 | 待立项后回填（本文 Verification 的 V1–V12 → change AC 编号） |
| 审稿报告 | `.rddf/reviews/commit-verification-gate-review.md`（oracle → critic 输出誊写；oracle 轮逐条应答在同文件，**不进正文**） |
| 修订 | 2026-11-18：oracle BLOCK（14 条）与 critic REJECT（3 BLOCKER + 8 SHOULD_FIX）的逐条处置见审稿报告；本文只保留**结论** |

## 背景与问题

1. **非交互路径的提交能力为零**：`ask` 在**非交互场景 = 硬拒**（`docs/CHAGELOG.md:39-40` 实测：模型被工具层拦住、HEAD 未变）；交互场景是否拦**机制未查明**（`:49-52`）
   ⇒ 被派发后端 / `opencode run` 这类**无人值守**路径当前**无法提交**（是能力为零，不是「麻烦」）。次要收益：交互场景每 change 多次提交 ⇒ 弹窗成本随流程线性增长。
2. **现状拦截是前缀匹配 ⇒ 有盲区**：`ADR-role-aware-permissions` D5② 已登记 —— `git -c user.name=x commit` / `GIT_AUTHOR_NAME=x git commit` **不匹配** `git commit *`
   ⇒ 软约束可被写法绕过；`docs/CHANGELOG.md:44` 另记 `git -C dir commit`。
3. **要拦的是「未验证 / 越角色」的提交**：commit 是归档闸门（`archive.sh::check_worktree_commits`）与评审的输入；把提交与「提交前可判定地通过」绑起来比人确认更可靠、更可审计。

## 决策

### D1 审批点搬家：`git commit` ⇒ `allow`，闸门移到工具层

`opencode.jsonc` 的 **build agent** shell 权限：`git commit` / `git commit *` 由 `ask` 改为 **`allow`**（catch-all 已是 allow，规则仅作显式声明，便于守卫断言）。
闸门由新插件 `plugins/commit-gate.ts`（纯逻辑 `lib/commit-gate.ts`）在 `tool.execute.before` 拦 **shell** 调用：
**通过 ⇒ 放行（不打扰用户）；不通过 ⇒ 抛错（受控 Tool.Error，模型看到缺项并自行修正）**。

### D2 门禁判据（三条**全绿**才放行）

| # | 判据 | 口径 |
|---|---|---|
| ① **验证命令全绿** | 仓库在 `<workRoot>/.rddf/commit-gate.json` 声明 `verify_commands`（argv 数组的数组）；逐条执行（cwd = `workRoot`），任一非 0 或超时 ⇒ **拒** | 声明文件（须 git-tracked） |
| ② **暂存区非空** | `git diff --cached --quiet`：退出码 **0 = 无差异 ⇒ 拒**；**1 = 有差异 ⇒ 继续**；**≥2 = 判定失败 ⇒ 拒**（非 git 目录 / 索引损坏 ⇒ fail-closed，不得静默放行） | git |
| ③ **暂存内容落在当前角色的写集内** | 逐个 staged 文件**调用 `lib/role-policy.ts::decideWrite`**（`action = "edit"`，含治理面分支 + `resolveArchPaths` 三态）；⚠ **禁止**在 commit-gate 内重写「角色→写根」公式（否则 = 第二份实现，违反 `ADR-role-aware-permissions` D3/V6 的单一真源判据） | `lib/role-policy.ts`（**单一真源**） |

**③ 的角色口径**：写入方的**工作角色**（主会话 = 身份链解析结果 `lib/role-identity.ts::resolveRole`；后端 = 其 `role_class`）—— 与 `ADR-role-aware-permissions` D6 的租约键口径**逐条一致**。
⇒ 具体可提交面**一律由 `decideWrite` 判定**（本文不复述任何角色清单 —— 复述必漂；`ROLE_WRITE_POLICY` 是真源）。
⚠ **身份链 fallback**（`lib/role-identity.ts`）：无角色文件的新会话 ⇒ 落 `general`（写集 `**`）；
但**角色文件损坏 / `current_role` 非法 ⇒ 保守落 `no-role`**（`denyAll` ⇒ 一律拒）⇒ 门禁在文件损坏时**不放行**。

**③ 的口径差异（有意为之）**：门禁判的是「**提交**」的写集，`ROLE_WRITE_POLICY` 的 `governance` 分支对 architect 类**允许治理面**；
而后端的 **edit 上限**（`classAllowRoots`）不含治理面 ⇒ **后端的提交面宽于其 edit 面**（有意：门禁管提交、scope 管写）⇒ 登记为免宣称第 ⑨ 项。

**⚠ 明确不做**：「change 已完成且已验收」**不作为 commit 的前置**。
理由（**时序互锁**）：commit 是**实施过程的一部分**（`prompts/build.md:423`「先向用户确认 → commit → 再继续」；一个 change 通常多次提交）
⇒ 正在实施的 change 永远不满足「已完成且已验收」⇒ 门禁会**恒拒**，本仓一次也提交不了。
「未验收不得归档」的职责**交还原位**：`archive.sh::check_worktree_commits` + `openspec archive` 的 verify 前置 + verifier 产物契约（`.rddf/state/verifier/.ac-verdict-<change>.json`，**产品侧写入者**，本仓不可改 ⇒ 不能作为本仓门禁的前置）。

### D3 适用范围与「无声明 ⇒ 不设门禁」

- 门禁对**所有能执行 `git commit` 的会话**生效（主会话 + 被派发后端：后端 shell 权限由 `classPermissions` 派生，而 `CONSTANT_DENY`（`lib/delegate-core.ts:48`）**不含** `git commit` ⇒ 后端也能 commit）。
  ⚠ 与 `role-gate` 不同：后者按 `ADR-role-aware-permissions` D3 跳过后端。
- **仓库根**：**`canonicalRoot(cwd)`**（`cwd` = 会话的 `location.directory`，**不用 `process.cwd()`**，同 `plugins/role-gate.ts:74-76` 的既有教训）⇒ `workRoot`（git toplevel，声明文件与写集判定都用它）与 `stateRoot`（主仓根）——**不用 `process.cwd()`**（同 `plugins/role-gate.ts` 的既有教训：进程 cwd 会取到**另一个仓**的根 ⇒ 整条 fail-open）。
  ⚠ **roots 不混用**：`workRoot` ≠ `stateRoot`（worktree 场景）⇒ 声明取 `workRoot`、写集判定基准根也是 `workRoot`。
- `<workRoot>/.rddf/commit-gate.json` **不存在 ⇒ 放行**（只对显式声明的仓库生效；其它仓库零影响）。
  ⚠ 声明文件**必须 git-tracked**（否则 worktree 内无声明 ⇒ 静默无门禁）⇒ 守卫钉住。

### D4 `push` 维持人工，且 force push 收紧

`git push *` / `git push` **保持 `ask`**（不变）。
**新增 deny**：`git push --force*` / `git push -f*` / `git push * --force*` / `git push * -f*`。
⚠ **理由更正**（`docs/CHANGELOG.md:44-45`「前缀通配够不着中缀」+ `docs/MULTI-AGENT-DESIGN.md:844`「shell 是整串前缀匹配」）：
`git push origin main --force`（flag 在末位）**会**命中已有的 `git push *` ⇒ 落点是 **ask**、不是 catch-all allow；
⇒ 四形态 deny 的真实价值是 **「ask ⇒ deny」的收紧**（交互会话里 `ask` 可被宿主「Allow always」放行，**`deny` 不会**）。
⇒ **本文不豁免任何 publish 动作的人工确认**（saved approval 能否越过 `deny` 见 D9⑧）。

### D5 命令识别（窄口径，避免误伤）+ 提交形态闭口

门禁识别 git 的 **`commit` 子命令本身**（不依赖配置的 glob 前缀）：

1. 按**引号感知**分词；
2. 跳过 `VAR=val` 前缀（如 `GIT_AUTHOR_NAME=x`）；
3. 定位 `git` token（允许带路径，**basename 必须是 `git`**）；
4. 取子命令 = **跳过所有 `-` 前缀 token**；对**已知带值选项额外跳过其值**（清单：`--git-dir[=]<dir>` / `--work-tree[=]<dir>` / `--namespace[=]<ns>` / `--exec-path[=]<p>` / `--config-env <n=env>` / `-c <k=v>` / `-C <dir>`）—— ⚠ **分离值形态与等号形态都要覆盖**（只列等号形态 ⇒ 解析出的「子命令」= `<dir>` ⇒ 门禁整条不触发）；其后的第一个 token 即子命令；
5. 判 `subcommand === "commit"`（**精确相等** ⇒ `commit-tree` / `commit-graph` / `git config commit.gpgsign` / `git log --grep commit` **不算**）；
6. 命中 ⇒ 进入 D2 判定；**解析不出 / 解析歧义 ⇒ 拒绝**（fail-closed 兜底，**不得**默认「不是 commit」而放行）；
   ⚠ **复合命令**（`&&` / `||` / `;` / `|` / `&` / 换行）⇒ 按第 8 步处理；**命令替换** ⇒ 第 9 步；**换仓 / 包装** ⇒ 第 10 步；
7. **提交形态闭口**：若 argv 含下列任一 ⇒ **拒**
   （这些形态的**实际提交内容集 ≠ 暂存区** ⇒ 门禁不可判定 ⇒ fail-closed；错误文案须说明原因）：
   `-a` / `--all`（并入全部已跟踪文件的改动）/ `--only` / `-o` / `--include` / `-i` / `--pathspec-from-file`
   / **位置 pathspec**（`git commit <path>` / `git commit -- <path>`：git 手册明文其「忽略 index，改记所列文件的**当前内容**」）。
8. **commit 必须单独成段**：命令串按 `;` / `&&` / `||` / `|` / `&` / **换行** 分段（引号外的元字符紧贴时也独立成 token；**重定向不是段分隔符** —— `> f` / `>> f` / `2>&1` / `< f` / fd 前缀 `2>` 一律剥离）。
   只要**任一段**是 commit 而**段数 > 1** ⇒ **拒**（错误文案要求分两次调用）。
   ⚠ **为什么不用「无害命令白名单」**：shell 权限是**整串前缀匹配** ⇒ 整串以 `git commit ` 开头即命中 `git commit *: allow` ⇒ **其余任意段**都能搭便车，而配置里真实的 `ask` / `deny` 集合（`.env` 读取、`git branch -D`、`git config` 写入、`rm -r`、`git reset --hard` …）会随配置演进 ⇒ 白名单**必然**与之漂移（实测：`cat` / `head` / `tail` / `branch` 都带着 `ask` 档位，却被当成「无害」）。⇒ fail-closed。
   代价：`git commit -m x; echo "exit=$?"` 这类**尾随报告段**也一并被拒（层 2 实测过模型确实这么写）—— 属**可见的假阳性**（模型重试不带 `;` 即可），换取的是不再需要任何白名单校准。
9. **命令替换 ⇒ 拒**：`$(…)` / 反引号 / 进程替换 `<(...)` `>(...)`，**单引号外**（双引号内仍会执行）一律拒；`\$(` 这类转义不算。理由：内容不在静态可见范围，而 `git commit *: allow` 会把它们一起放行（`git commit -m "$(git push --force …)"` 即打穿 D4 的 force-push `deny`）。提交消息请用 `-F <file>`。
10. **判定对象必须可定位 ⇒ 否则拒**：门禁只能判定**会话所在的仓**（`workRoot`），所以
    - 换仓选项：`git -C <dir>` / `--git-dir[=]<dir>` / `--work-tree[=]<dir>`；
    - 换仓环境变量：`GIT_DIR=` / `GIT_WORK_TREE=` / `GIT_INDEX_FILE=` / `GIT_COMMON_DIR=`；
    - `git` 之前的**包装命令**（`sudo` / `env` / `nohup` / `time` / `timeout` / `exec` / `builtin` / `setsid` / `chroot` / `nice` / `ionice` / `stdbuf` / `command`）；
    ⇒ **拒**（文案：请直接调用 `git commit`）。不这么做的后果：`cd /other && git commit` / `git -C /other commit` 会用在 **A 仓**算出的暂存区 / 写集 / 验证结果放行 **B 仓**的提交。

⚠ **间接提交不在门禁内**（`bash -c '…'` / `eval` / `xargs` / 别名 / 函数 / 包装脚本）⇒ 见 D9③⑥。

### D6 失败语义：fail-closed + 可诊断

- shell 工具的 `command` 字段**取不到** ⇒ **拒绝**（不得放行；同型事故见 `lib/role-policy.ts` 的「取不到就 `return` ⇒ 静默 fail-open」）。
- 门禁不通过 ⇒ **抛错**（不是静默放行，也不是静默拒绝）：错误文本必须含**失败命令 + 输出尾部** / **越界文件 + 角色** / **该 stage 什么** 三者之一。

### D7 治理面同批落地（配置 ⇄ 规则真源不两处分离）

| 面 | 落点 |
|---|---|
| 权限档位 | `opencode.jsonc`（build agent shell 段：`git commit*` ⇒ allow；force-push 四形态 ⇒ deny，置于 `git push *` 之后 ⇒ last-match-wins） |
| agent 行为规则 | `prompts/build.md` §输出（commit 改写为「由验证门决定」；**push 仍须用户确认** + **保留**「停机并交付裁决请求」兜底句） |
| 用户侧纪律（唯一真源） | `docs/MULTI-AGENT-DESIGN.md` §3.4（收窄为「**只针对 push**」+ 历史残留处置条）+ §4.4.1 |
| 漂移守卫 | `tests/config-guards.test.ts`（档位断言**替换**「commit=ask」那条；§3.4 措辞不得进 `prompts/**`） |
| 变更史 | `docs/CHANGELOG.md`「权限加固记录」 |

### D8 落点**逐点清单**（20 点；核对依据 = **内容锚点（标题 + 原文片段）**，行号为 2026-11-18 快照，实施期会漂）

| # | 落点（内容锚点） | 现状 | 改成 |
|---|---|---|---|
| 1 | MAD「本版（v2.3.1）变更」版本摘要 | 提「§4.4.1 补 `git commit` ask（v2.44）」 | 补记本文 |
| 2 | MAD **§2.6** / pause-commit 契约（「全局『不主动 commit，等用户确认』**优先**」） | 指向旧全局规则 | 改指本文 D1（commit 由门禁决定；publish 仍优先） |
| 3 | MAD §2.8.7 **D5②** 条 | 「shell 层 pattern 盲区……不在范围」 | 「**已由本文 D5 部分闭合**（限顶层命令串）；残余见 D9」 |
| 4 | MAD §3.4 **理由句** | 「`git commit` 之所以是 `ask`」 | 改写（纪律对象只剩 push） |
| 5 | MAD §3.4 **纪律句**（「不要对 `git commit` / `git push` 的权限弹窗点 **Allow always**」） | 含 commit | 收窄为 **push** + 新增「历史残留处置」条（曾对 commit 点过 Always 的持久化批准需清除） |
| 6 | MAD §3.4 其余残留句（`:711-714`、`:723` 一带） | 提及 commit 弹窗 | 同批改 |
| 7 | MAD §4.4.1 「另有一条**不属「不可逆」类**的 `ask`：`git commit` / `git commit *`（v2.44）」整段 | commit = ask | 退役 ⇒ 换成本文门禁说明 + force-push deny 一行 |
| 8 | MAD §4.4.3 尾（「shell 是整串前缀匹配」的已知残留） | 泛指 | 补「本文的 force-push deny 因此**必须列全四种形态**」 |
| 9 | `prompts/build.md` 角色表 builder 行（「commit（先确认）」） | 先确认 | 「commit（工具层验证门）」 |
| 10 | `prompts/build.md` 增强层「**commit 仍受全局规则约束**……先向用户确认 → commit → 再继续」 | 等用户确认 | 「commit 由验证门决定（红 ⇒ 工具层拒绝）；**push 仍须确认**」 |
| 11 | `prompts/build.md` **§角色列表**四行（architect / planner / builder / no-role；⚠ 不是「§角色矩阵」） | 旧措辞 | 与 9 同口径（architect/planner/verifier 的提交**受限** ⇒ 写进「禁止」列） |
| 12 | `prompts/build.md` 点名条款括注（「不要主动 `git commit` / `git push` —— **等用户确认**」） | 旧措辞 | 同步改写（守卫只查节名 ⇒ 矛盾查不出，只能显式改） |
| 13 | `prompts/build.md` 机读清单 `sec: ## 输出 \| kind: halt` | 登记 | **保留**（push 仍走停机兜底） |
| 14 | `prompts/build.md` §输出 三行 | 「不要主动 commit / push —— 等用户确认」 | 改写（commit 由门禁决定 / push 仍确认 / **保留停机兜底句**） |
| 15 | `opencode.jsonc` build shell 段（`git commit *` / `git commit`） | ask | ⇒ allow；新增 force-push 四形态 = deny |
| 16 | `tests/config-guards.test.ts`（「`git commit` 必须是 ask 档」那条） | 断言 ask | **替换**为「= allow」+「force-push 四形态 = deny」+「push 仍 ask」（旧断言与新决策**互斥** ⇒ 不是「同步」而是替换） |
| 17 | `tests/role-exemptions.test.ts` 文件头 **D5②** 条 | 「不在范围」 | 「已由本文 D5 部分闭合；残余见 D9」 |
| 18 | `docs/adr/ADR-role-aware-permissions.md` **父篇**：`:15` 修订行 + `:43` 表格行 | 「已由权限层 ask 覆盖（v2.44）」 | 修订行加指针；`:43` 改指本文（**父篇本体必须落改** —— 子篇宣告 ≠ 父篇已改，实施方会读父篇） |
| 19 | `lib/delegate-core.ts` **后端 brief 规则第 3 条**（「不要 git commit / git push —— 提交由用户确认后另行发起」） | 后端模型被禁止 commit ⇒ 与 D3「后端也能 commit」**直接冲突** | 改写为「commit 由工具层验证门决定；**push 仍由用户发起**」 |
| 20 | `docs/dual-session-delegation.md`（提交 / 推送 一栏） | 「❌（等用户确认后另行发起）」 | 同上改写（与点 19 同族残留） |

⚠ 另需（同批）：`docs/CHANGELOG.md`「权限加固记录」留史；`tests/config-guards.test.ts` 中叙述性注释（「已修（v2.44）」）会陈旧 ⇒ 同批改；
能力面投影：`capabilityBlock()`（`lib/delegate-core.ts:619-627`）按 ask/deny **计数**派生 ⇒ 新增 4 条 deny ⇒ build 的 shell 分类由 `allow-ask` 变 `allow-ask-and-deny`
⇒ **`prompts/build.md` 的 `<!-- capability:build -->` 块**必须同步（逐字比对守卫；plan/front 的 shell 分类不变 ⇒ 不受影响）。

### D9 宣称边界 / 免宣称（**防事故，不防绕过** —— 十项）

> 按 `ADR-role-aware-permissions` D5 的形态：每项写清「防什么 / 不防什么 / 缓解」，并在 **AC + 测试注释 + 主题文档三处**登记。

| # | 免宣称 | 防什么 / 不防什么 / 缓解 |
|---|---|---|
| ① | **声明文件可被改写 / 被弱化** | 防「未验证就提交」；**不防**把 `verify_commands` 改成 `[["true"]]` 之类空壳（且能在**同一次提交**里改，因为 builder 写集含 `**`）；缓解：守卫**逐条相等**断言本仓声明的期望命令清单（不是「非空」） |
| ② | **插件缺席 ⇒ 门禁不存在** | 防未验证提交；**不防**插件未加载 / `--standalone` / 未 `service restart`；缓解：层 2 真宿主验 + 文档登记（同 `role-gate` D5⑥） |
| ③ | **间接提交不在门禁内** | 防顶层 `git commit`；**不防** `bash x.sh` / `$(...)` / `make commit` / 包装脚本；缓解：无（登记为已知面） |
| ④ | **其它仓库不受门禁** | 防本仓未验证提交；**不防**后端在 `project_dir` 指向的任意目录提交（无声明 ⇒ 放行）；缓解：声明文件随仓走 |
| ⑤ | **非交互路径能力扩张** | ask ⇒ 硬拒 ⇒ 变成「门禁放行即可」；**不防**无人复核（无人可点 Always，也无人复核）；缓解：②（角色写集）+ ①（验证绿）两道门仍在 |
| ⑥ | **命令解析固有盲区** | 防顶层 `git commit` 的常见变体；**不防**别名 / 函数 / `eval` / 极端写法；缓解：解析口径按「精确相等 + 带值选项跳过 + `-` 前缀 token 全跳过」收窄，误伤面小 |
| ⑦ | **语义类缺陷验证命令覆盖不到** | 防「验证红」；**不防**措辞 / 治理面漂移 / 设计错误（测试不红）；缓解：**不豁免 push** 的人工确认 + 评审与验收 |
| ⑨ | **后端的提交面宽于其 edit 面** | 门禁按 `decideWrite`（architect 类含治理面）；后端 edit 上限（`classAllowRoots`）不含治理面 ⇒ 治理面可被后端**提交**（但写不了）；缓解：scope 派生仍限制其写盘面 |
| ⑩ | **字符串级判定的残余面** | 防顶层 `git commit` 的复合 / 替换 / 换仓 / 包装形态（D5⑧⑨⑩）；**不防**把 `git` 藏进**引号或字符串**再交给解释器的形态（`bash -c '…'` / `eval` / `xargs` / 别名 / 函数 / 包装脚本）；缓解：无（与 ③ 同源，登记为已知面） |
| ⑧ | **saved approval 可能越过 D4 的 `deny`** | `git push *` 的持久化 allow 与 config `deny` 的优先级**无源码锚点**（宿主合并算法未查明）⇒ 曾点过 Always 的用户可能连 force-push 也不再被问；缓解：层 2 实测优先级（见 V1） |

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **A 维持 `ask`（现状）** | ❌ 否决 | 非交互路径提交能力为零（`CHANGELOG.md:39-40`）；D5② 前缀盲区不解；弹窗成本随流程增长 |
| **B 工具层验证门（本文）** | ✅ 采纳 | 判定**确定性**（红 ⇒ 拒）；闭 D5② 的**顶层**盲区；补上「角色 ⇒ 提交写集」的工具层执行点；publish 仍人工 |
| **C 无条件 `allow` + 只靠 prompt** | ❌ 否决 | 重蹈 v2.44：prompt 说「等确认」被更具体的配置压过；未验证的提交被固化 |
| **D 只对「归档类 commit」放行** | ❌ 否决 | 「归档类」不可机判；复杂度换不到确定性 |

## 后果 / 代价

**正面**
- commit 审批**可判定**：同一状态 ⇒ 同一结论（红必红、绿必绿），可写变红演练。
- 非交互路径（后端 / `opencode run`）**恢复提交能力**（当前为零）。
- `git -c … commit` / `GIT_AUTHOR_NAME=x git commit` 的**顶层**盲区闭合（D5② 降级）。
- 「角色 ⇒ 提交写集」有了**工具层执行点**（此前是 prompt-only，登记于 `docs/CHANGELOG.md:47-48`）。

**负面 / 代价**
- **门禁本身可能有假红 / 漏判** ⇒ 必须配层 1b 用例 + 变红演练（改实现 ⇒ 用例必红）。
- 每次 commit 跑一遍声明的验证命令（本仓 ≈ 40s）⇒ 声明里可调 `timeout_ms`；超长验证应分文件。
- **声明文件需维护**（`verify_commands` + tracked + 守卫逐条相等）⇒ 漏改 ⇒ 门禁变弱 ⇒ 守卫先红。
- 语义类缺陷（措辞、治理面漂移、设计错误）验证命令覆盖不到 ⇒ 只能靠评审与验收 ⇒ **不豁免 push** 的人工确认。
- 取代了 `ADR-role-aware-permissions.md:43` 的执行点表述 ⇒ 父篇须记**修订指针**（避免两份真源）。

**回滚路径（三步，**不可只退一半**）**
1. `opencode.jsonc`：build shell 的 `git commit*` ⇒ 改回 `ask`；force-push 四形态 deny 移除（恢复原状）；
2. `prompts/build.md` §输出 + 点名条款 + 角色表/矩阵 ⇒ 改回「不要主动 commit —— 等用户确认」；`docs/MULTI-AGENT-DESIGN.md` §3.4 / §4.4.1 ⇒ 改回原措辞；
3. `plugins/commit-gate.ts` / `lib/commit-gate.ts` ⇒ 删除或停用（插件缺席 ⇒ 门禁不存在，与 D9② 一致）。
⚠ **只退一半 ⇒ 复现 v2.44**（`docs/CHANGELOG.md:41-42`）：若只把配置改回 `ask`、而 §输出仍写「commit 由验证门决定」⇒ prompt 与权限层**互相矛盾**，模型信更具体的配置 ⇒ 行为退化成「不 commit」（与原状语义相近，但文档不一致 ⇒ 守卫会红）。
⇒ 回滚必须**三步同批**完成，并跑 `bun test tests/` + `check-upstream-anchors.sh`。

**风险**
- 门禁依赖插件与声明 ⇒ 任一缺席 ⇒ 静默无门禁（D9①②④）⇒ 层 2 真宿主验 + 守卫。
- 角色写集判据（③）依赖 `ROLE_WRITE_POLICY` 语义 ⇒ 某角色写集被改宽 ⇒ 其可提交范围随之变宽（单一真源 ⇒ 一处改动两处生效；既是优点也是耦合点）。

## Verification（可勾选验收判据，前瞻）

> 形态：层 1a 静态契约（配置档位 + 治理面措辞）/ 层 1b 纯逻辑单测（门禁判定）/ 层 2（真宿主）。
> ⚠ **关键判据必须配变红演练**（立项后写入 change 的 `design.md`；本文直接内联各条的突变动作）。

- [ ] **V1 档位**：`build` 的 `git commit` / `git commit *` = `allow`；`git push *` = `ask`；force-push **四形态** = `deny`。**变红**：把 `git commit *` 改回 `ask` ⇒ V1 红。
- [ ] **V2 验证红 ⇒ 硬拒**：Tool.Error 含失败命令 + 输出尾部；不得静默放行。**变红**：门禁改成恒放行 ⇒ V2 红。
- [ ] **V3 暂存内容越角色写集 ⇒ 硬拒**：错误指名角色 + 越界文件。**变红**：去掉 ③ ⇒ V3 红。
- [ ] **V4 暂存区为空 ⇒ 硬拒**；`git diff --cached --quiet` 退出码 ≥2（判定失败）⇒ **亦拒**。**变红**：把退出码 ≥2 当放行 ⇒ V4 红。
- [ ] **V5 无声明仓库 ⇒ 放行**（其它仓库零影响）。**变红**：无声明时改为拒绝 ⇒ V5 红。
- [ ] **V6 命令识别**：`git commit` / `git -c k=v commit` / `GIT_AUTHOR_NAME=x git commit` / `git commit --no-verify` / `git --namespace ns commit` 被识别为 commit **且放行**；`git -C dir commit` / `git --git-dir=<dir> commit`（分离值与等号两形态）/ `GIT_DIR=… git commit` / `sudo git commit` / `timeout 10 git commit` 被识别为 commit **且拒**（D5⑩）；**且** `git commit-tree` / `git log --grep commit` / `git config commit.gpgsign` **不**被误伤；**解析不出子命令 ⇒ 拒**（不静默放行）。**变红**：只认 `git commit ` 前缀 ⇒ V6 红；去掉 fail-closed 兜底 ⇒ V6 红；把 `git -C dir commit` 当放行 ⇒ V6 红。
- [ ] **V7 提交形态闭口 + 单独成段 + 命令替换**：
  - 提交形态：`-a` / `--only` / `-o` / `--include` / `-i` / `--pathspec-from-file` / **位置 pathspec**（`git commit <path>` / `git commit -- <path>`）⇒ **拒**；
  - **任一段是 commit 且段数 > 1**（`&&` / `||` / `;` / `|` / `&` / **换行**）⇒ **拒** —— 含 `git add -A && git commit`、`git commit …; git push --force …`、`git commit …; cat .env`、`git commit … | tee x`、`cd /other && git commit`、`git commit -m x` 换行再接 `git push --force`；
  - **命令替换**（`$(…)` / 反引号 / `<(` `>(`，单引号外）⇒ **拒**；
  - **重定向**（`> /dev/null 2>&1` / `2>/dev/null`，含 fd 前缀）与**子 shell 前缀**（`(git commit …)`）⇒ **放行**。

  **变红**：放行 `-a` ⇒ V7 红；放行位置 pathspec ⇒ V7 红；放行 `git commit …; git push --force …` ⇒ V7 红；放行 `git commit -m "$(…)"` ⇒ V7 红；放行 `git commit …; cat .env` ⇒ V7 红。
- [ ] **V8 后端会话同样受门禁**（后端按其 `role_class` 的写集判）。
- [ ] **V9 治理面逐点清单 20 点全部命中**（内容锚点核对）+ 能力面投影块同步（否则投影守卫判红）。**变红**：把 `MAD §2.8.7 D5②` 措辞改回「不在范围」⇒ V9 红。
- [ ] **V10 免宣称十项三处登记**（AC + 测试注释 + 主题文档）+ D5② 旧措辞三处同批改 + 父篇 `:43` / 修订行已落改。**变红**：删掉任一处登记 ⇒ V10 红。
- [ ] **V11 层 2**：真宿主触发 `git commit`（验证红）⇒ 观察到受控 Tool.Error；绿侧在**一次性临时 worktree** 里验（不污染本仓）⇒ 观察到放行；**并**实测 force-push 四形态命中 `deny`、`git push origin main` 仍 `ask`、saved approval 与 config `deny` 的优先级。
- [ ] **V12 回滚路径可执行**：三步回滚后 `bun test tests/` 绿 + anchors 绿 + 文档与配置一致。
