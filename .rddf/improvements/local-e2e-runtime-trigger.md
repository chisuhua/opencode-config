---
状态: 已实施（2026-11-26）
优先级: P2
---

# improvement: local-e2e-runtime-trigger — 本机「提交后按路径触发」真运行时 e2e

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：用户决策 —— **真运行时 e2e 留在本机**（不进任何 CI），但要一个**提交后自动触发**的方式。
> 关联：`runtime-e2e-coverage-new-mechanisms`（零模型 / 真运行时分工）、`model-fallback-runtime-e2e`（本条要调用但**尚未落地**的用例）。
> **实施归属 builder**（`scripts/**` + `.githooks/**` + `.gitignore` + 状态文件；planner 不写脚本）。
> **planner 审查（metis 1 轮）**：已处置 19 条 finding（见文末「§7 metis 处置记录」）—— 其中 6 条 P0 改了**判据口径本身**（bootstrap 两读法 / verdict 协议 / schema 字段 / dirty 归因 / 触发表逐文件 / 默认不触发）。

## Why

真运行时 e2e（e2e 仓 `E2E_REAL_RUNTIME=1` 门控，共 **70** 例）今天**没有触发机制** —— 只靠人记得手动跑 ⇒ 实际不跑 ⇒ **等价于没有这一层**。

「每提交都跑」不可行，三条硬数字：单例超时上限 **420s**（实测一条 20–40s）· 每条至少 **1 次真会话** · `post-commit` **无法阻断**（提交已发生）⇒ 25–70 分钟 + 几十次额度 + 高频失败训练人忽略。

⇒ 关键判断：**真运行时只在「机制 / 配置 / 宿主版本」变化时才需要重跑** ⇒ 用**路径过滤**把「每次提交」换成「命中才跑」。

⚠ **但「自动跑」≠「不会漏」。** 真正的痛点是**漏跑不可见**：把结果扔进后台文件、在提交瞬间打印一句路径 ⇒ 结果在无人等待的时刻到达、无人阅读 ⇒ 漏跑变成漏看。⇒ 本条把「**采集**」与「**呈现**」拆开：`post-commit` 只负责**便宜地采集**；**每次提交/每次手跑都先打印上一次的结果 + 未测提交数**（pull 式呈现），让人不需要看 hook 输出也知道有没有欠账。

## What Changes

### 1. `scripts/e2e-runtime.sh`（显式入口，任何人可跑）

**起点与 bootstrap（钉死，消除两读法）**

- 起点 = `.rddf/state/e2e-runtime.json` 的 `last_ok_sha`。
- **缺失 或 `git cat-file -e <sha>^{commit}` 失败**（被 rebase / GC）⇒ 用 **`HEAD~1`**（无父提交 ⇒ 用 `HEAD`），note 记「base sha 失效/首次」。
- 改动集 = `git diff --name-only -z <base>..<tested_head>` ∪ 工作区未提交改动（`git status --porcelain -z`），**两者都解析 NUL**（防空格 / 重命名 `R old -> new` 被误拆）。
- **命中 0 ⇒ verdict = `noop`，并把 `last_ok_sha` 推进到 `tested_head`**（≠ `ok`，但同样推进 —— 否则机制会永久空转：post-commit 时工作树通常干净，`HEAD..HEAD = ∅`）。
- **`undetermined` / `fail` / `dirty` / `not_run` 一律不推进** `last_ok_sha`。

**参数与优先级（写死）**

- `--all`（跑全部真运行时）**优先于** `--filter <glob>`；`--filter` 覆盖触发表；都给 ⇒ `--all` 赢。
- `--dry-run`：只打印将跑什么，**不启动任何 bats / 不设 `E2E_REAL_RUNTIME`**。
- `--soft`：前台调用时失败也返回 0（默认**前台失败 ⇒ 非零退出**；`post-commit` 永远不阻断）。
- `E2E_REPO`（默认 `/workspace/main/rdd-workflow-e2e`）；不存在 ⇒ 命中用例记 `undetermined` + note。
- `OPENCODE_BIN`（安装时记录绝对路径，默认 `command -v opencode`）⇒ 版本检测与子进程都用它，**不依赖 PATH**（GUI / IDE 提交时 PATH 可能不含 opencode）。

**verdict 判定协议（解析 TAP，不看退出码）**

⚠ `bats` 对 `skip` 也返回 0 ⇒ 只看 rc 会把「额度耗尽」记成 `ok` 并推进 `last_ok_sha`（**该改动永不重测**）。

- 用 `bats --formatter tap`，逐行判定：`ok N` ⇒ `ok`；`ok N # skip …` ⇒ `undetermined`；`not ok N` ⇒ `fail`；**无终态** ⇒ `undetermined`。
- 聚合：任一 `fail` ⇒ `fail`；否则任一 `undetermined` / `not_run` ⇒ `undetermined`；否则全 `ok` ⇒ `ok`；`cases` 为空 ⇒ `noop`。
- 逐例 verdict 写进 `cases[]`（一文件多例时不再压成一个 verdict）。

**dirty 归因（写死）**

- run 开始时 `git status --porcelain -z` 非空（排除 `.rddf/state/**`，该目录已 gitignore）⇒ `config_dirty = true` ⇒ **整批 verdict = `undetermined`**、`last_ok_sha` 不推进、note = 「工作树脏，结果归因到工作树」。
- 理由：e2e 测的是**活仓工作区**（`OC_ROOT=~/.config/opencode`），不是某个 sha；把脏树的结果记到 `HEAD` 就是假绿。

**额度冷却**

- 检测到额度耗尽 ⇒ 写 `quota_cooldown_until`（默认 +2h）；窗口内**不再 spawn**，只打印未测提交数 ⇒ 避免每次提交烧一次注定失败的 run。

**`--all` 的 resume cursor**

- `--all` 时把已完成且 `ok` 的用例文件记进本次 run；额度中断后再次 `--all` ⇒ 跳过这些文件（从 cursor 续跑），避免「70 例从头再来」。

### 2. `.githooks/post-commit`（opt-in，默认 advisory）

- **必须后台跑**（`nohup … &` + 锁文件 `.rddf/state/e2e-runtime.lock`）：git 会等 hook 结束，前台 20 分钟 = 每次提交卡终端。
- 立刻返回，并打印：**① 上一次 run 的 `{verdict, base_sha, 未测提交数}` ② 本次是否已启动**。
- 锁文件内容 = `{pid, started_at}`；**陈旧回收**：`kill -0 <pid>` 失败 或 `age > 6h` ⇒ 回收后启动（防 `kill -9` 后永久自锁）。
- 锁存在且未陈旧 ⇒ 本次不启动（打印「上一次尚未结束」），**并记 `pending`**（不静默饥饿）。
- run 结束若 `HEAD ≠ head_at_start` ⇒ 记 `pending_behind = N` 并打印（可选一次有界追赶，默认只打印）。
- **覆盖范围声明**：只保证 `git commit`；`--amend` / `cherry-pick` / `rebase` / `merge` 不保证触发 ⇒ 靠**下次 diff 自愈**兜底（明写，不假装全覆盖）。

### 3. `scripts/install-git-hooks.sh`（幂等）

- `git config core.hooksPath .githooks`；`--uninstall` ⇒ `git config --unset core.hooksPath`。
- 安装时记录 `OPENCODE_BIN` 绝对路径到 `.rddf/state/e2e-runtime.json` 的 `opencode_bin` 字段。
- **本机 opt-in**：不改变任何他人 clone 的行为。

### 4. 触发表（**逐文件映射**，不用 glob 假装全覆盖）

| 改动路径 | 映射到 e2e 用例文件 |
|---|---|
| `plugins/commit-gate.ts` | `test_commit_gate_runtime.bats` |
| `plugins/role-gate.ts` | `test_role_gate_runtime.bats` |
| `plugins/subagent-contract.ts` | `test_subagent_contract_runtime.bats` |
| `plugins/push-gate.ts`、`lib/push-gate.ts` | `test_push_gate_runtime.bats` |
| `plugins/model-fallback.ts`、`lib/model-fallback-core.ts` | `test_model_fallback_runtime.bats`（**尚未落地** ⇒ `not_run` + note，等 `model-fallback-runtime-e2e` 实施） |
| `lib/delegate-core.ts` | `test_class_scope_runtime.bats` + `test_front_delegate_runtime.bats` |
| `opencode.jsonc*` | `test_push_gate_runtime` + `test_subagent_contract_runtime` + `test_role_gate_runtime` |
| `prompts/plan.md`、`prompts/plan-worker.md` | `test_plan_topics_cli.bats`（**零模型**，仍由本脚本一并跑，便于跨仓契约同步）+ `test_plan_topics_runtime.bats`（尚未落地 ⇒ `not_run`） |
| **未列路径** | **不触发**（写死默认；`lib/delegate-core.ts` 已显式列入，不留漏网） |

⚠ **登记 gap（不许读者误以为全覆盖）**：`test_role_class_runtime.bats` / `test_independent_build_session.bats` / `test_evidence_discipline.bats` / `test_oracle_intent_gate.bats` 等**不在本表** ⇒ 它们的触发条件未定义 ⇒ 依赖人工 `--all`。以 token `E2E-TRIGGER-COVERAGE-GAP` 写进脚本 `--help` 与本文档。

### 5. 状态文件（`.gitignore` 追加两项）

```jsonc
// .rddf/state/e2e-runtime.json
{
  "last_ok_sha": "<sha>",              // 只有 ok / noop 推进
  "opencode_bin": "<abs path>",
  "opencode_version": "<ver>",         // 版本变化 ⇒ 下次 --all
  "quota_cooldown_until": "<iso|null>",
  "runs": [ {                          // 最近 20 条；**保留 last_ok_sha 引用的那条**
    "at": "<iso>", "base_sha": "<sha>", "tested_head": "<sha>",
    "e2e_repo_sha": "<sha>", "opencode_version": "<ver>", "config_dirty": false,
    "files": ["<changed>"],
    "cases": [ { "file": "<bats>", "verdict": "ok|undetermined|fail|not_run", "note": "<skip 原因>" } ],
    "verdict": "ok|noop|undetermined|fail", "note": "..."
  } ]
}
```

- **版本检测**：`"$OPENCODE_BIN" --version`；解析失败 / 多行 ⇒ 记「未知」，**不触发 `--all`**（避免误判成升级后跑 70 例）。
- 版本与 `opencode_version` 不同 ⇒ 本次按 `--all` 语义。

### 6. 不改产品代码、不改 e2e 用例（只调用）。

## Acceptance

**核心判据（防假绿）**

- [ ] **`skip` 不记 `ok`**：造一个「配额不足」或「用例文件不存在」的 run ⇒ `cases[].verdict = undetermined|not_run`，整批非 `ok`，`last_ok_sha` **不动**
- [ ] **dirty 归因**：run 开始时工作树脏 ⇒ `config_dirty = true` ∧ 整批 `undetermined` ∧ `last_ok_sha` 不动
- [ ] **命中 0 ⇒ `noop` 且推进**：改一个 `.rddf/**.md` ⇒ `verdict = noop`、`last_ok_sha` 推进到 `tested_head`（防永久空转）
- [ ] **bootstrap 失效**：令 `last_ok_sha` 指向不存在的 sha ⇒ 回落到 `HEAD~1`，note 记「base sha 失效」，脚本**不崩**
- [ ] **verdict 逐例**：一个文件内含 1 ok + 1 skip 的构造 ⇒ `cases[]` 两条各自 verdict 正确，整批 `undetermined`

**映射与命中**

- [ ] 改 `lib/push-gate.ts`（加注释即可）⇒ `--dry-run` 显示 `test_push_gate_runtime.bats`
- [ ] 改 `plugins/commit-gate.ts` ⇒ 显示 `test_commit_gate_runtime.bats`（**逐文件映射**，不是 glob）
- [ ] 改 `lib/delegate-core.ts` ⇒ 显示 `test_class_scope_runtime.bats` + `test_front_delegate_runtime.bats`
- [ ] 改 `plugins/model-fallback.ts` ⇒ 显示 `test_model_fallback_runtime.bats` 且 verdict = `not_run`（用例未落地）
- [ ] 改 `docs/**` 或 `.rddf/**` ⇒ 命中 0
- [ ] 未列路径（如 `lib/delegate-async.ts`）⇒ 命中 0（默认不触发）

**dry-run 真的不调模型（不用 pgrep，活会话会污染）**

- [ ] `--dry-run` 时把 `E2E_REPO` 指向一个含**假 bats**（写 sentinel 后 exit 0）的临时目录 ⇒ **sentinel 不存在**，且子进程环境无 `E2E_REAL_RUNTIME`

**锁与并发**

- [ ] `post-commit` 后台化：提交后终端 **< 2s 返回**，状态文件出现新 run
- [ ] 锁存在（未陈旧）⇒ 本次不启动，打印「上一次尚未结束」并记 `pending`
- [ ] **陈旧锁回收**：`kill -9` 后台进程后，下一次提交能启动新 run（`kill -0` 失败 ⇒ 回收）
- [ ] run 期间又提交 ⇒ 结束后打印 `pending_behind = N`

**呈现（解决「漏跑变漏看」）**

- [ ] 每次 `post-commit` 与每次手跑，**先打印上一次 run 摘要** + `git rev-list last_ok_sha..HEAD --count` 未测提交数
- [ ] run 结束若 `HEAD ≠ head_at_start` ⇒ 打印落后数（默认不自动追赶）

**其它**

- [ ] `.gitignore` 含 `.rddf/state/e2e-runtime.json` 与 `.rddf/state/e2e-runtime.lock`（旧提案里的 `-last.json` 已废弃，统一为一个文件）；run 后 `git status --porcelain` 不含它们
- [ ] `install-git-hooks.sh` 幂等（连跑两次不报错）；`--uninstall` 后 `git config --get core.hooksPath` 为空
- [ ] 额度冷却：检测到额度耗尽 ⇒ 写 `quota_cooldown_until`；窗口内手跑只打印未测数、不 spawn
- [ ] `--all` resume：额度中断后再 `--all` ⇒ 跳过已 `ok` 的文件
- [ ] `bun test tests/` 全绿 + `bash scripts/check-upstream-anchors.sh` 30/30
- [ ] **文档事实修正**：`.rddf/roadmap/test-debt-e2e-followup.md §1.2` 的「不承诺 CI 接线 —— 本仓无 CI、无生效 git hook」改为「默认无；`scripts/install-git-hooks.sh` 可本机 opt-in（**advisory，非闸门**）」；**不改 ADR**

## Capabilities

- **让「改了插件，宿主接线还活着吗」有一个自动的、可选择的答案**，并且**欠账可见**（未测提交数每次提交都打印）。
- **零成本保护**：默认路径过滤 + `--dry-run` + `noop` 语义 + 额度冷却 ⇒ 不会因为「跑不动」而制造假红或静默假绿。
- **与零模型层分工清晰**：commit-gate 的 `bun test tests/` 是**硬门**（零模型、快）；本机制是**软证据**（真运行时、慢、吃额度）⇒ 判据不同、不互相替代。

## Impact

- 改动面：本仓新增 **3 个文件**（`scripts/e2e-runtime.sh` / `scripts/install-git-hooks.sh` / `.githooks/post-commit`）+ `.gitignore` 追加 + 1 个状态文件（gitignore）；**不改**产品代码、不改 e2e 用例。
- ⚠ **提交面新增本机可选 hook**：`core.hooksPath` 是本地设置，不影响他人 clone；但本仓 ADR 有「无生效 git hook」的事实 ⇒ 本条**不改 ADR**，只改路线图那一句（见 Acceptance 末条）。
- ⚠ **跨仓依赖**：用例在 `E2E_REPO`（默认 `/workspace/main/rdd-workflow-e2e`）；不在 ⇒ `undetermined`；记录 `e2e_repo_sha` 以求可复现。
- ⚠ **额度**：命中一次 ≈ 2–6 次真会话；零命中 = 0；冷却窗口内 = 0。
- ⚠ **不覆盖**：不做 pre-commit 硬门；不做 CI；不做 nightly；`E2E-TRIGGER-COVERAGE-GAP` 登记的那几个 runtime 文件仍需人工 `--all`。

## §7 metis 处置记录（planner 固定审查配对，1 轮）

> metis 六节输出；verdict = **值得立项，但必须先改 P0 1–5**。逐条处置（metis 输出是材料，不是判据）：

| # | 级别 | finding | 处置 |
|---|---|---|---|
| 1 | P0 | **命中 0 是否推进 `last_ok_sha`** 两读法：推进 ⇒ 首个触碰插件的提交未测却标 ok；不推进 ⇒ 永久空转 | **已钉死**：命中 0 ⇒ `noop` **且推进**；`undetermined`/`fail`/`dirty`/`not_run` 不推进 |
| 2 | P0 | **`skip` 的判定来源**：只看 rc ⇒ 额度耗尽被记成 ok 并推进 ⇒ 永不重测 | **已改**：`bats --formatter tap` 解析 + 逐例 verdict + 聚合规则（详见 What Changes「verdict 判定协议」） |
| 3 | P0 | **schema 缺字段**：无 `opencode_version` / `e2e_repo_sha` / `config_dirty` / `tested_head` ⇒ `--all` 分支不可落地 | **已改**：schema 补齐四个字段 + `quota_cooldown_until` + 逐 case verdict |
| 4 | P0 | **dirty 归因未写死** ⇒ 脏树结果记到 HEAD = 假绿 | **已改**：`config_dirty` ⇒ 整批 `undetermined`、不推进 |
| 5 | P0 | **触发表用 `plugins/**` glob 假装全覆盖** ⇒ 漏 6 个已落地的 runtime 文件 | **已改**：逐文件映射（commit-gate / role-gate / subagent-contract / push-gate / model-fallback / delegate-core）+ 未列路径默认不触发 |
| 6 | P0 | 缺「未列路径」的默认规则 | **已改**：写死「未列 ⇒ 不触发」，并显式登记 `E2E-TRIGGER-COVERAGE-GAP` |
| 7 | P1 | 锁无陈旧回收 ⇒ `kill -9` 后永久自锁 | **已改**：锁内容 `{pid, started_at}` + `kill -0` 失败或 age>6h 回收 + AC 演练 |
| 8 | P1 | `.gitignore` 未覆盖状态文件 | **已改**：`.gitignore` 追加 `e2e-runtime.json` 与 `e2e-runtime.lock`（**废弃**旧提案的 `-last.json`，统一一个文件） |
| 9 | P1 | **结果无人看**（漏跑变漏看） | **已改**：新增「呈现」一等交付 —— 每次提交/手跑先打印上一次 run 摘要 + 未测提交数 |
| 10 | P1 | run 期间 HEAD 前进 ⇒ 漏测后续提交 | **已改**：`pending_behind` + 打印（默认不自动追赶） |
| 11 | P1 | `--dry-run` 判据用 `pgrep` 会被活会话污染（自证） | **已改**：改「假 bats + sentinel」判据 |
| 12 | P1 | 未落地用例的 verdict 与依赖登记 | **已改**：`not_run` + note + 前置指明 `model-fallback-runtime-e2e` / `runtime-e2e-coverage-new-mechanisms` |
| 13 | P1 | 额度耗尽后每次提交重复烧 | **已改**：`quota_cooldown_until` 冷却窗口 |
| 14 | P1 | ADR 事实修正没指名落点 | **已改**：指名 `.rddf/roadmap/test-debt-e2e-followup.md §1.2` |
| 15 | P2 | `E2E_RUNTIME_STRICT` 自证循环 | **已删**：改为「前台默认失败 ⇒ 非零退出 + `--soft` 反选」 |
| 16 | P2 | `--all` 无 resume cursor | **已改**：记录已完成 `ok` 文件，再次 `--all` 跳过 |
| 17 | P2 | `--all` / `--filter` / 触发表优先级未定 | **已改**：`--all` > `--filter` > 触发表 |
| 18 | P2 | `runs` 滚动会滚掉 `last_ok_sha` 引用的 run | **已改**：滚动时保留该条 |
| 19 | P2 | 路径解析未处理空格 / 重命名 | **已改**：`git diff/status -z` 解析 |
| 20 | P2 | 未声明 post-commit 覆盖的提交路径 | **已改**：明写只保证 `git commit`，其余靠下次 diff 自愈 |

## §8 实施记录（2026-11-26，builder）

已落地：`scripts/e2e-runtime.sh` · `scripts/install-git-hooks.sh` · `.githooks/post-commit` · `.gitignore`（两项状态文件）。

**已实测的判据**（真实运行，0 模型额度）：`--dry-run` 用假 bats + sentinel 证明确实不调模型（sentinel 不存在）· 改 `lib/push-gate.ts` ⇒ 命中 `test_push_gate_runtime.bats` · 改 `docs/**`/`.rddf/**` ⇒ 命中 0 · 命中 0 ⇒ `noop` 且推进 `last_ok_sha` · 陈旧锁（死 pid）回收 / 活锁 `held` · 并发 3 次 noop 串行无丢失更新 · 用例未落地 ⇒ `not_run` 且不推进 · 脏树 ⇒ `undetermined` 不推进 · `post-commit` 实测 **<0.1s** 返回并后台启动 · 提交后 hook 打印上次摘要与未测提交数（实例见提交 `e5f03f5` 的输出）。

**实施中发现并修掉的两个 bug**（规格没写到的）：
1. **noop / 脏树分支原本在取锁之前写状态** ⇒ 并发提交会丢更新 ⇒ 已把取锁前移到**任何状态写之前**（实测并发 3 次不再丢）。
2. **`--allow-dirty` 强制跑时聚合只看用例结果** ⇒ 脏树上全绿会被记成 `ok` 并推进（正是 metis 警告的假绿）⇒ 已在聚合后强制 `undetermined`。

**未按规格实现的一处（登记，不静默省略）**：
- **`--all` 的 resume cursor 未实现**：当前 `--all` 每次枚举全部含 `E2E_REAL_RUNTIME` 的文件并逐例跑；额度中断后重跑会从头再来。⇒ 已登记为后续项（token `E2E-ALL-NO-RESUME-CURSOR`）。理由：`--all` 是人工显式触发的少量场景，先交付主路径（提交后按路径触发）。

**未实测的路径**（需真模型额度，本次未跑）：真正的「命中并执行」主路径（如改 `lib/push-gate.ts` 后不 dry-run）· 额度冷却窗口 · `--filter` 优先级 · 检测到额度耗尽后写 `quota_cooldown_until`。
