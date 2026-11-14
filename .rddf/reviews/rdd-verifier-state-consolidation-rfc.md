# 迁移 RFC / 交接单：verifier 状态文件收拢进 `.rddf/state/verifier/`

> **给谁**：`chisuhua/rdd-workflow`（`~/.agents/skills/rdd-workflow` 的源仓）
> **为什么在你那边**：本仓（`~/.config/opencode`，opencode 配置 + 治理面）**无 `~/.agents/skills/**` 的写权限**
> **来源**：`docs/adr/ADR-class-write-scope-alignment.md`（**Accepted** 2026-11-14）的 **D1b 过渡期规则** + backlog `.rddf/improvements/rdd-verifier-state-consolidation.md`
> **状态**：本仓侧已**就绪**（见 §5 的就绪性证明）—— 你那边改完，本仓只需做 §7 的收尾

---

## 1. 问题（一句话）

`rdd-verifier` skill 有 **6 个状态路径**，其中 **4 个躺在 `.rddf/state/` 根下**（不在 `verifier/` 子目录）。
而「被派发的 verifier 类后端」的写集上限是 `.rddf/state/verifier`（**目录级**）⇒ **这 4 个文件写不进去**
⇒ 当前**过渡期**只能「后端只跑取证与判决、状态机落盘由主会话代跑」（不得已的绕路）。

## 2. 现状核对（2026-11-14 实跑，本仓）

| 路径 | 声明 | 实际写入 | 消费者 |
|---|---|---|---|
| `.rddf/state/verifier/<name>.json` | `owns:`（`SKILL.md:29`） | skill（loop state） | skill（重试计数） |
| `.rddf/state/verifier/<name>.audit.jsonl` | `owns:`（`:30`） | skill | skill |
| `.rddf/state/.ac-verdict-*.json` | `owns:`（`:31`） | skill（`:260`） | skill（`:118`/`:325`）、**`archive_gate_check`** |
| `.rddf/state/.ac-verification.jsonl` | `owns:`（`:32`） | skill（`:280`） | skill、`rdd-doctor` |
| `.rddf/state/.ac-verifier-blocked.jsonl` | **未声明** | skill（`:415` halted） | **`rdd-doctor`** |
| `.rddf/state/rdd-verify-context-<change>.json` | **未声明** | `scripts/run_verification.sh:7` | skill |
| `.rddf/state/.verifier-report.json` | `SKILL.md:49` 声明 | **无写入方（悬空）** | 无 |

## 3. 目标形态

```
.rddf/state/verifier/
├── <name>.json                      # loop state（已在，不动）
├── <name>.audit.jsonl               # 审计（已在，不动）
├── .ac-verdict-<change>.json        # ← 从 .rddf/state/ 根迁移
├── .ac-verification.jsonl           # ← 同上
├── .ac-verifier-blocked.jsonl       # ← 同上
└── rdd-verify-context-<change>.json # ← 同上
```

> 保留原来的 basename（含前导点）⇒ 迁移 diff 最小。**可选**：在 `verifier/` 内点前缀已冗余，可一并去掉
> （`ac-verdict-*.json`）—— 但那会让「新旧交替期」的路径判定更乱，**本 RFC 建议保留 basename 不变**。

## 4. 逐文件改动清单（实测于 2026-11-14，`~/.agents/skills/rdd-workflow`）

> 我原以为这只是「10 处改路径」。实测后：**~9 个文件 + 20 余处引用**，且产品侧**自己就有一处「同一路径两处定义」**
> —— 那是最容易迁移翻车的地方（见 §4.0）。

### 4.0 先做：把两处 `_cache_path` 合成一处（**结构性前置**）

```python
_lib/verifier/cache.py:23        def _cache_path(project_root, change_name) -> Path:
_lib/verifier/archive_gate.py:42 def _cache_path(main_root, change_name) -> Path:
```

**两个独立函数各自拼同一路径表达式**（`.rddf/state/.ac-verdict-<change>.json`）。迁移时只改一个 ⇒
**归档门读的路径与写入方不同 ⇒ 归档门永远「没有 verdict」⇒ 静默失效**（不报错，只是判定永远不通过）。

### ⚠ 合并时的关键约束（读码后发现，别踩）

| | `cache.py:23` | `archive_gate.py:42` |
|---|---|---|
| 参数名 | `project_root` | `main_root` |
| **root 来源** | 调用方传入的**工程根** | 该文件自己用 `git rev-parse --git-common-dir` 求出的**主仓根**（`archive_gate.py:20-39`） |
| 路径表达式 | 相同 | 相同 |

⇒ **只合并「路径表达式」，不要合并「root 来源」**。worktree 场景下 `main_root ≠ project_root`：归档门必须去**主仓**找 cache
（因为 worktree 里没有），若把两者并成一个 `(root, change)` 且让 archive_gate 传 `project_root`，**worktree 下归档门会去 worktree 找 ⇒ 永远 miss**。

**推荐改法**（只动路径表达式，root 来源各留各的）：

```python
# _lib/verifier/cache.py —— 新增公开函数（唯一路径定义点）
def verdict_cache_path(root: Path, change_name: str) -> Path:
    return Path(root) / ".rddf" / "state" / f".ac-verdict-{change_name}.json"

def _cache_path(project_root: Path, change_name: str) -> Path:   # 保留旧名，内部转调
    return verdict_cache_path(project_root, change_name)
```

```python
# _lib/verifier/archive_gate.py —— 删掉本文件的 _cache_path，改为转调（root 仍是它自己求的 main_root）
from .cache import verdict_cache_path

def _cache_path(main_root: Path, change_name: str) -> Path:
    return verdict_cache_path(main_root, change_name)   # ← main_root 不变
```

> 迁移时**只改 `verdict_cache_path` 里的那一段路径**（`"state" / f".ac-verdict-…"` ⇒ `"state" / "verifier" / f".ac-verdict-…"`）
> ⇒ 两处同时生效，且 worktree 语义不被破坏。**这就是为什么 §4.0 必须排在目录迁移之前。**

### 4.1 `verdict cache`：`.ac-verdict-<change>.json`（6 处定义 / 1 处 CI）

| # | 位置 | 说明 |
|---|---|---|
| 1 | `_lib/verifier/cache.py:23` | `_cache_path()` —— **唯一应保留的定义点**（迁移后改这里 + 让 archive_gate 引用它） |
| 2 | `_lib/verifier/archive_gate.py:42` | 独立 `_cache_path()` —— **应改为引用 #1**（见 §4.0） |
| 3 | `_lib/verifier/protocol.py:179` | protocol payload 的 `cache_path`（给 agent 的指令文本） |
| 4 | `_lib/archive.sh:456` | `verdict_cache_file=…`（归档脚本自己的判定） |
| 5 | `_lib/archive.sh:554` | 提示文案里的路径 |
| 6 | `skills/rdd-verifier/scripts/classify_failure.sh:18` | `CACHE=` |
| 7 | `.github/workflows/e2e-nightly.yml:46` | **CI artifact 上传路径**（漏了 ⇒ nightly 不归档 cache，排障时看不到） |

### 4.2 `audit log`：`.ac-verification.jsonl`（1 处定义 + SKILL.md）

| # | 位置 | 说明 |
|---|---|---|
| 8 | `_lib/verifier/protocol.py:180` | payload 的 `audit_log_path` |
| 9 | `SKILL.md:280` | 写入指令（prose）—— 与 #8 必须同源，否则 agent 按 prose 写、代码按 payload 读 |

### 4.3 `staged context`：`rdd-verify-context-<change>.json`（4 处）

| # | 位置 | 说明 |
|---|---|---|
| 10 | `_lib/verifier/protocol.py:207` / `:220` | 写入点（`write_context_doc()`） |
| 11 | `_lib/cli/rdd_verify_cmd.py:137` / `:490` | 给用户的提示文案（两处） |
| 12 | `skills/rdd-verifier/scripts/run_verification.sh:7` | 注释里的路径 |

### 4.4 `halted audit`：`.ac-verifier-blocked.jsonl`（1 处）

| # | 位置 | 说明 |
|---|---|---|
| 13 | `SKILL.md:415` | 只有 prose 写入指令，**无代码定义点** |

### 4.5 悬空指针：`.verifier-report.json`（1 处 + 1 处测试）

| # | 位置 | 说明 |
|---|---|---|
| 14 | `_lib/builder_handoff.py:31` | **默认参数** `verifier_report_path=".rddf/state/.verifier-report.json"` —— 这就是「声明了但没人写」的源头；删掉该默认值或补上写入方 |
| 15 | `tests/unit/test_builder_handoff.py:33` | 对应测试（断言该默认值） |

### 4.6 `owns:` 声明（1 处）

| # | 位置 | 说明 |
|---|---|---|
| 16 | `SKILL.md:29-32` | 收拢后 4 项改新形态；**并把 2 个「实际写入但未声明」的路径补进去**（`.ac-verifier-blocked.jsonl` / `rdd-verify-context-*`） |

### 4.7 产品仓自己的测试（会**大面积变红**，须同批改）

| 文件 | 引用处 |
|---|---|
| `tests/unit/test_ac_verdict_cache.py` | `:81` / `:92`（构造 cache 路径） |
| `tests/unit/test_ac_verdict_cache_schema.py` | 标题与断言 |
| `tests/unit/test_archive_gate_verifier.py` | `:174` / `:188` |
| `tests/unit/test_archive_preserves_verification.py` | `:6` / `:62` —— **语义要复核**：它断言「归档**不动** `state/verifier/`、`.ac-verdict`、audit log」；收拢后 `.ac-verdict` 就在 `verifier/` 里 ⇒ 该测试的两条断言会合并/需重写 |
| `tests/unit/test_rdd_verifier_protocol.py` | `:321` / `:328` |

### 4.8 迁移顺序（更正版）

1. **§4.0 合并 `_cache_path`**（先把定义点收敛成 1 个）→ 跑产品仓测试确认仍绿；
2. 改**读取**路径 + 一次性 `mv` 旧文件（`for f in .rddf/state/.ac-* .rddf/state/rdd-verify-context-*; do [ -e "$f" ] && mv "$f" .rddf/state/verifier/; done`，这些文件 gitignored）；
3. 改**写入**路径（§4.1–4.4 的 prose + payload 必须同源）；
4. **`archive_gate_check` 与写入同批验证**（写一个 change 的 verdict ⇒ 立刻断言归档门能读到）；
5. 更新 `owns:`（§4.6）+ 处理悬空指针（§4.5）；
6. 改产品仓测试（§4.7，含 `test_archive_preserves_verification.py` 的语义复核）；
7. 改 CI artifact 路径（§4.1 #7）；
8. 产品仓自己的 e2e：**在被派发的 verifier 类 session 里**跑完整 `rdd-verify`，确认 Step 5 落盘不再 `Permission denied`。

## 5. 本仓侧已就绪（你不需要等我们）

| 已具备 | 证据 |
|---|---|
| `verifier` 类允许集 = `.rddf/reviews` + **`.rddf/state/verifier`**（目录级前缀） | `lib/delegate-core.ts::VERIFIER_ALLOW_ROOTS` |
| 迁移后 6 个路径**已在允许集与 scope 授权内**（`allow`） | 单测「**收拢就绪（ready）**」（`tests/delegate-core.test.ts`）逐一断言 |
| 迁移**前**的根下路径**仍拒**（不是整目录放开） | 同一单测的负向断言 |
| 派发侧已要求 `scope` 必须同时含两目录 | `prompts/plan.md` 选类表 + `prompts/front.md` §3.1 |

⇒ **产品侧迁移不需要与本仓同步发版、不需要 flag day**。

## 6. 收拢完成后，本仓要做的事（触发条件 = §4.8 的 8 步完成）

| # | 本仓落点 | 改动 |
|---|---|---|
| a | `prompts/build.md` §verifier 产出契约 的**过渡期规则**（四要素） | 改为「历史说明」；**后端直写**全部 skill 状态（不再主会话代跑） |
| b | 同节**症状桥接句**（`Permission denied` = 本契约生效） | 降级为历史注记 |
| c | `prompts/front.md` §3.1 的**代跑处置提示** | 删除 |
| d | `ADR-class-write-scope-alignment` 的 **D1b** | 标注「已退役」+ 关联指针 |
| e | `lib/delegate-core.ts` 的 `VERIFIER_OWNS_PATHS` | 4 项改新形态；`VERIFIER_BACKLOG_ROOT_FILES` **自动归零**（派生，不用手改） |
| f | `tests/config-guards.test.ts` | 派生视图长度 4 ⇒ 0（自动）；如常量形态变了，AC6 的派生等式仍成立 |
| g | `docs/CHANGELOG.md` | 一条「verifier 状态收拢 + 过渡期退役」 |
| h | `rdd-workflow-e2e` | 新增运行时用例：verifier 类跑 `rdd-verifier` 的 Step 5 **落盘成功**（现在是「交回」） |

## 7. 风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| **归档门漏改**（§4.0 的两处 `_cache_path` 只改一处） | 只改写入不改读取 ⇒ 归档门永远「没有 verdict」⇒ **静默失效**（不报错） | 写入与 `archive_gate_check` **同批改**；在迁移 checklist 上把它单独高亮 |
| 旧 cache 丢失 | verdict cache 是 SHA 指纹缓存 ⇒ 丢了就重跑（烧 token，但**不会误判**） | 一次性 `mv`（§4.8 第 2 步）；或读路径 fallback |
| audit log 是 append-only 历史 | 迁移后历史条目的路径语义变了 | 直接 `mv` 整文件（内容不含路径）；若将来要按路径过滤需注意 |
| 多仓并发（同一台机器多个项目） | 每个项目各自有 `.rddf/state/verifier/` ⇒ 互不影响 | 无 |
| 与 `rdd-workflow-e2e` 的既有用例冲突 | 既有 L2/SC 用例可能断言旧路径 | 迁移时同步 grep `e2e` 仓的 `.ac-verdict` / `.ac-verification` 引用（本仓已核：`test_class_scope_runtime.bats` 未断言旧路径） |

## 8. 附：核对命令（迁移前/后各跑一次）

```bash
# ① 产品侧：确认没有残留的旧路径引用
grep -rn "\.rddf/state/\.ac-\|\.rddf/state/rdd-verify-context\|\.verifier-report" \
  ~/.agents/skills/rdd-workflow/ | grep -v "\.md:.*历史"
# ② 本仓：确认常量与派生视图仍自洽
cd ~/.config/opencode && grep -n "VERIFIER_OWNS_PATHS" -A 12 lib/delegate-core.ts
# ③ 本仓：确认就绪性未被破坏
cd ~/.config/opencode && bun test tests/delegate-core.test.ts -t "收拢就绪"
# ④ 迁移后：被派发的 verifier 类 session 里跑 Step 5，确认不再 Permission denied
#    （在 rdd-workflow-e2e 仓，`E2E_REAL_RUNTIME=1` 的新用例）
```
