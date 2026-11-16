# cross-repo-workspace-check 实施计划（TDD 5 步）

> **纪律：先红后绿** —— 每个 Task 的 Step 1 先写出**会失败**的断言并实跑确认红，再写实现。
> 验收判据唯一真源：`.rddf/improvements/cross-repo-workspace-check.md` 的 `## Acceptance`（10 条）。

**Goal:** 把「本仓 ↔ 产品仓的清单一致性只能人工 `diff`」变成**一条可判别的命令**：清单腐坏、缺仓、身份不符、执行失败、两侧漂移五态各有独立出口码与独立 `RESULT:` 标记。

**Architecture:** 声明式清单（`.rddf/config/workspace.json`）+ 通用核对器（`scripts/cross-repo-check.sh`）。清单声明两件东西：**仓**（`id` / `url` / `canonical_path` / `required`）与**核对项**（两侧的 argv 命令 + 输出过滤式）。核对器只做三件事：校验清单 → 校验仓身份 → 跑两侧命令比输出。**命令用 argv 数组不用 shell 串**（无注入面）。

**Tech Stack:** Bash（`set -uo pipefail`）+ `python3`（读 JSON、跑 producer 侧）+ `bun`（跑 consumer 侧）。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `.rddf/config/workspace.json` | 仓清单 + 核对项声明（唯一真源） |
| `scripts/cross-repo-check.sh` | 通用核对器：清单校验 → 仓身份校验 → 两侧命令比对 → `RESULT:` + 出口码 |
| `tests/verify_cross_repo_check.sh` | fixture 五态 + 只读性验证（`/tmp/opencode` 造假仓） |
| `docs/guard-authoring.md` | §6 表 / §6.1 / §7 三处指向脚本 |

---

## Task 1: 核对器骨架 + 清单校验（CONFIG 档）

- Step 1（红）：`tests/verify_cross_repo_check.sh` 先写「清单非法 ⇒ exit 1」三例（非法 JSON / `repos: []` / `id` 重复 / 相对路径含 `~`），实跑确认红（脚本不存在 ⇒ 非 1 退出码）。
- Step 2（绿）：写 `scripts/cross-repo-check.sh` 的清单校验段（`python3` 读 JSON 并逐条判）+ `.rddf/config/workspace.json` 骨架。
- Step 3（验）：fixture 3 例转绿；真实清单校验通过。

## Task 2: 仓身份校验（ENV / SKIP 档）

- Step 1（红）：写「路径不存在 ⇒ 3」「`required:false` 缺失 ⇒ 0 + `SKIP` 行」「指向仓内子目录 ⇒ 3」「remote url 不符 ⇒ 3」四例，实跑确认红。
- Step 2（绿）：实现身份校验（`realpath` == `git rev-parse --show-toplevel`；`remote.origin.url` == 清单 `url`；缺仓按 `required` 分流）。
- Step 3（验）：四例转绿。

## Task 3: 核对项比对（DRIFT / ENV 档）

- Step 1（红）：写「两侧一致 ⇒ 0 + `RESULT: OK`」「两侧不同 ⇒ 2 + diff」「一侧命令失败 ⇒ 3（**不是 2**）」「过滤后为空 ⇒ 3」四例，实跑确认红。
- Step 2（绿）：实现两侧命令执行（argv，无 shell）+ 过滤 + 比对 + 双仓 `HEAD` sha 打印。
- Step 3（验）：四例转绿。

## Task 4: 真实清单接上产品仓 + 端到端

- Step 1（红）：用真实清单跑 `scripts/cross-repo-check.sh` ⇒ 期望 `RESULT: OK` + 两仓 sha（此时清单里的核对项尚未声明 ⇒ 红）。
- Step 2（绿）：在 `.rddf/config/workspace.json` 声明 `verifier-owns-parity` 核对项（consumer = 本仓 `verifierWriteSetBlock()` 的 `owns:` 行；producer = 产品仓 `SKILL_OWNS_PATHS`）。
- Step 3（验）：真实跑 ⇒ `RESULT: OK`；再临时篡改一侧 ⇒ 必红（exit 2）⇒ 还原。

## Task 5: 只读性 + 文档指向

- Step 1（红）：写「跑前跑后两仓 `git status --porcelain --ignored` 一致 + `__pycache__` 不新增」断言（当前实现用 `python3 -c` ⇒ 会写 `__pycache__` ⇒ 红）。
- Step 2（绿）：producer 侧改 `python3 -B` / `PYTHONDONTWRITEBYTECODE=1`；改 `docs/guard-authoring.md` 三处。
- Step 3（验）：只读断言转绿；`bash -n` 通过；`bun test tests/` 无回归。

---

## 出口码约定（脚本头部写死）

| 码 | `RESULT:` | 含义 |
|---|---|---|
| 0 | `OK` / `SKIP` | 可评估的核对项全部一致 / 无核对项可评估 |
| 1 | `CONFIG` / `USAGE` | 清单不合法或参数错误 |
| 2 | `DRIFT` | 两侧清单不一致（**与 `scripts/check-upstream-anchors.sh` 的 2 对齐**） |
| 3 | `ENV` | 缺仓 / 身份不符 / 命令失败 / 输出不可比 |
