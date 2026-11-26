#!/usr/bin/env bash
# scripts/e2e-runtime.sh — 本机真运行时 e2e（`E2E_REAL_RUNTIME=1`）的**按路径触发**入口
#
# 设计依据：`.rddf/improvements/local-e2e-runtime-trigger.md`（verdict 协议 / 触发表 / metis 处置）
#
# 为什么按路径而不是按提交：真运行时每例至少 1 次真会话、单例上限 420s ⇒ 每次提交都跑不可行。
# 为什么解析 TAP 而不是看退出码：`bats` 对 `skip` 也返回 0 ⇒ 只看 rc 会把「额度耗尽」记成 ok
# 并推进 `last_ok_sha` ⇒ 该改动**永不重测**。
#
# 用法:
#   scripts/e2e-runtime.sh --summary         # 只打印上次结果 + 未测提交数（快，不跑用例）
#   scripts/e2e-runtime.sh --dry-run         # 只打印「将跑哪些用例」，不启动任何 bats
#   scripts/e2e-runtime.sh                   # 前台跑命中的用例（失败 ⇒ 非零退出）
#   scripts/e2e-runtime.sh --soft            # 同上，但失败也返回 0
#   scripts/e2e-runtime.sh --all             # 无视触发表，跑全部含 E2E_REAL_RUNTIME 的用例
#   scripts/e2e-runtime.sh --filter <glob>   # 只跑文件名匹配的用例
#   scripts/e2e-runtime.sh --allow-dirty     # 工作树脏时也跑（结果仍记 undetermined）
#   scripts/e2e-runtime.sh --lock-status     # 0=空闲 1=占用（供 post-commit 判并发）
#
# 环境变量：
#   E2E_REPO        e2e 仓路径（默认 /workspace/main/rdd-workflow-e2e）
#   OPENCODE_BIN    opencode 绝对路径（默认 `command -v opencode`）
#
# ⚠ E2E-TRIGGER-COVERAGE-GAP：触发表只覆盖下列文件的映射；`test_role_class_runtime` /
#   `test_independent_build_session` / `test_evidence_discipline` / `test_oracle_intent_gate`
#   等**未定义触发条件** ⇒ 需人工 `--all`。不要以为改了 `plugins/**` 就全覆盖。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT/.rddf/state"
STATE="$STATE_DIR/e2e-runtime.json"
LOCK="$STATE_DIR/e2e-runtime.lock"
LOG="$STATE_DIR/e2e-runtime.log"
E2E_REPO="${E2E_REPO:-/workspace/main/rdd-workflow-e2e}"
OPENCODE_BIN="${OPENCODE_BIN:-$(command -v opencode || true)}"
LOCK_STALE_SECONDS="${LOCK_STALE_SECONDS:-21600}"   # 6h
CASE_TIMEOUT="${CASE_TIMEOUT:-900}"
MAX_RUNS=20

MODE="run"
DRY=0
SOFT=0
ALL=0
ALLOW_DIRTY=0
FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --summary) MODE="summary"; shift ;;
    --lock-status) MODE="lock-status"; shift ;;
    --dry-run) DRY=1; shift ;;
    --soft) SOFT=1; shift ;;
    --all) ALL=1; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    --filter) FILTER="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知参数: $1（--help）" >&2; exit 2 ;;
  esac
done

mkdir -p "$STATE_DIR"

# ── 状态读写 ────────────────────────────────────────────────────────────────
state_get() { # state_get <key> ⇒ 值或空
  [[ -f "$STATE" ]] || return 0
  python3 - "$STATE" "$1" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
v = s.get(sys.argv[2])
print("" if v is None else v)
PY
}

git_head() { git -C "$ROOT" rev-parse HEAD 2>/dev/null; }

git_has_commit() { git -C "$ROOT" cat-file -e "$1^{commit}" 2>/dev/null; }

# 未测提交数（base 失效 / 缺失 ⇒ 空）
behind_count() {
  local base; base="$(state_get last_ok_sha)"
  [[ -n "$base" ]] && git_has_commit "$base" || { return 0; }
  git -C "$ROOT" rev-list --count "$base..HEAD" 2>/dev/null
}

print_summary() {
  if [[ ! -f "$STATE" ]]; then
    echo "e2e-runtime: 尚无运行记录（首次运行会以 HEAD~1 为起点）"
    return 0
  fi
  python3 - "$STATE" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
runs = s.get("runs") or []
if runs:
    r = runs[-1]
    cases = ", ".join(f"{c.get('file')}={c.get('verdict')}" for c in (r.get("cases") or [])) or "-"
    print(f"e2e-runtime: 上次 verdict={r.get('verdict')} @ {str(r.get('tested_head'))[:8]} ({r.get('at')}) cases=[{cases}]")
else:
    print("e2e-runtime: 尚无运行记录")
b = s.get("last_ok_sha")
print(f"e2e-runtime: last_ok_sha={b[:8] if b else '<none>'}")
cd = s.get("quota_cooldown_until")
if cd:
    print(f"e2e-runtime: 额度冷却至 {cd}（窗口内不启动）")
PY
  local n; n="$(behind_count)"
  [[ -n "$n" ]] && echo "e2e-runtime: 未测提交数 = $n"
}

# ── 锁（目录原子 mkdir；陈旧回收）───────────────────────────────────────────
lock_pid() { cat "$LOCK/pid" 2>/dev/null || echo ""; }

lock_age_seconds() {
  local t; t="$(cat "$LOCK/started_epoch" 2>/dev/null || echo 0)"
  [[ "$t" =~ ^[0-9]+$ ]] || { echo 999999; return; }
  echo $(( $(date +%s) - t ))
}

lock_is_held() {
  [[ -d "$LOCK" ]] || return 1
  local pid age; pid="$(lock_pid)"; age="$(lock_age_seconds)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && (( age < LOCK_STALE_SECONDS )); then
    return 0
  fi
  # 陈旧（进程不在 / 超龄）⇒ 回收
  rm -rf "$LOCK" 2>/dev/null
  return 1
}

acquire_lock() {
  mkdir -p "$STATE_DIR"
  if ! mkdir "$LOCK" 2>/dev/null; then
    lock_is_held && return 1
    mkdir "$LOCK" 2>/dev/null || return 1
  fi
  echo "$$" >"$LOCK/pid"
  date +%s >"$LOCK/started_epoch"
  return 0
}

release_lock() { [[ -d "$LOCK" ]] && rm -rf "$LOCK"; }

[[ "$MODE" == "lock-status" ]] && { lock_is_held && { echo "held"; exit 1; } || { echo "free"; exit 0; }; }
[[ "$MODE" == "summary" ]] && { print_summary; exit 0; }

# ── 触发映射（**逐文件**，不用 glob 假装全覆盖）──────────────────────────────
map_cases() { # $1 = 改动路径 ⇒ 打印用例文件名（每行一个）
  case "$1" in
    plugins/commit-gate.ts) echo "test_commit_gate_runtime.bats" ;;
    plugins/role-gate.ts) echo "test_role_gate_runtime.bats" ;;
    plugins/subagent-contract.ts) echo "test_subagent_contract_runtime.bats" ;;
    plugins/push-gate.ts|lib/push-gate.ts) echo "test_push_gate_runtime.bats" ;;
    plugins/model-fallback.ts|lib/model-fallback-core.ts) echo "test_model_fallback_runtime.bats" ;;
    lib/delegate-core.ts) echo "test_class_scope_runtime.bats"; echo "test_front_delegate_runtime.bats" ;;
    opencode.jsonc*)
      echo "test_push_gate_runtime.bats"
      echo "test_subagent_contract_runtime.bats"
      echo "test_role_gate_runtime.bats" ;;
    prompts/plan.md|prompts/plan-worker.md)
      echo "test_plan_topics_cli.bats"
      echo "test_plan_topics_runtime.bats" ;;
    *) : ;;
  esac
}

# ── 起点 / 改动集 ──────────────────────────────────────────────────────────
BASE="$(state_get last_ok_sha)"
if [[ -z "$BASE" ]] || ! git_has_commit "$BASE"; then
  BASE="$(git -C "$ROOT" rev-parse HEAD~1 2>/dev/null || git_head)"
  BASE_NOTE="首次运行 / base sha 失效 ⇒ 用 ${BASE:0:8}"
else
  BASE_NOTE=""
fi
TESTED_HEAD="$(git_head)"

# 工作树脏度（`-z` 解析，防空格 / 重命名；状态文件本身已被 gitignore）
DIRTY=0
[[ -n "$(git -C "$ROOT" status --porcelain -z 2>/dev/null | tr -d '\0' | head -c1)" ]] && DIRTY=1

CHANGED=()
while IFS= read -r -d '' p; do CHANGED+=("$p"); done < <(git -C "$ROOT" diff --name-only -z "$BASE..$TESTED_HEAD" 2>/dev/null)
if (( DIRTY )); then
  while IFS= read -r -d '' line; do
    # porcelain: "XY path" / "R  old -> new"（-z 下用 NUL 分段）
    CHANGED+=("${line:3}")
  done < <(git -C "$ROOT" status --porcelain -z 2>/dev/null)
fi

CASES=()
if (( ALL )); then
  if [[ -d "$E2E_REPO/tests/integration" ]]; then
    while IFS= read -r f; do CASES+=("$(basename "$f")"); done < <(grep -l 'E2E_REAL_RUNTIME' "$E2E_REPO"/tests/integration/*.bats 2>/dev/null)
  fi
else
  for p in "${CHANGED[@]:-}"; do
    [[ -n "$p" ]] || continue
    while IFS= read -r c; do CASES+=("$c"); done < <(map_cases "$p")
  done
  # dedupe + 排序
  if (( ${#CASES[@]} > 0 )); then
    mapfile -t CASES < <(printf '%s\n' "${CASES[@]}" | sort -u)
  fi
fi

if [[ -n "$FILTER" ]] && (( ! ALL )); then
  mapfile -t CASES < <(printf '%s\n' "${CASES[@]:-}" | grep -E "$FILTER" || true)
fi

# 宿主版本检测（解析失败 ⇒ 记未知，**不**触发 --all）
HOST_VER="未知"
if [[ -n "$OPENCODE_BIN" ]] && [[ -x "$OPENCODE_BIN" ]]; then
  v="$("$OPENCODE_BIN" --version 2>/dev/null | head -1 | tr -d '\r')"
  [[ -n "$v" ]] && HOST_VER="$v"
fi
PREV_VER="$(state_get opencode_version)"
if [[ -z "$BASE_NOTE" && -n "$PREV_VER" && "$HOST_VER" != "未知" && "$HOST_VER" != "$PREV_VER" && ${#CASES[@]} -eq 0 ]]; then
  echo "e2e-runtime: 宿主版本变化（$PREV_VER → $HOST_VER）⇒ 建议 --all（本次未自动展开）"
fi

E2E_SHA=""
[[ -d "$E2E_REPO/.git" ]] && E2E_SHA="$(git -C "$E2E_REPO" rev-parse HEAD 2>/dev/null)"

# ── 取锁（**任何状态写之前**：noop / 脏树 / 实跑三条路径都要串行）────────────
if ! acquire_lock; then
  echo "e2e-runtime: 上一次尚未结束（pid=$(lock_pid)）⇒ 本次跳过"
  exit 0
fi
trap release_lock EXIT

# ── 命中 0 ⇒ noop（推进 last_ok_sha，防永久空转）────────────────────────────
if (( ${#CASES[@]} == 0 )); then
  echo "e2e-runtime: 本次改动不触及运行时面（命中 0）"
  echo "  changed: ${CHANGED[*]:-<none>}"
  if (( DRY )); then exit 0; fi
  [[ -n "$BASE_NOTE" ]] && echo "  note: $BASE_NOTE"
  python3 - "$STATE" "$TESTED_HEAD" "$BASE" "$DIRTY" "$HOST_VER" "$E2E_SHA" "$MAX_RUNS" <<'PY'
import json, sys, datetime
path, head, base, dirty, ver, e2e, max_runs = sys.argv[1:8]
s = json.load(open(path)) if __import__("os").path.exists(path) else {}
s["last_ok_sha"] = head
s["opencode_version"] = ver
s["e2e_repo_sha"] = e2e
runs = s.get("runs") or []
runs.append({"at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "base_sha": base, "tested_head": head, "e2e_repo_sha": e2e,
             "opencode_version": ver, "config_dirty": bool(int(dirty)),
             "files": [], "cases": [], "verdict": "noop", "note": "命中 0（无运行时面改动 ⇒ 脏树不影响归因）"})
keep = s.get("last_ok_sha")
s["runs"] = runs[-int(max_runs):]
json.dump(s, open(path, "w"), ensure_ascii=False, indent=2)
PY
  exit 0
fi

# ── dry-run：只打印，不启动任何 bats ───────────────────────────────────────
if (( DRY )); then
  echo "e2e-runtime: 将跑 ${#CASES[@]} 个用例文件（dry-run，未启动）："
  printf '  - %s\n' "${CASES[@]}"
  echo "  base=${BASE:0:8} head=${TESTED_HEAD:0:8} dirty=$DIRTY host=$HOST_VER"
  exit 0
fi

# ── 额度冷却 / 脏树 ────────────────────────────────────────────────────────
COOLDOWN="$(state_get quota_cooldown_until)"
if [[ -n "$COOLDOWN" ]]; then
  if python3 - "$COOLDOWN" <<'PY'
import sys, datetime
try:
    until = datetime.datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
except Exception:
    sys.exit(0)  # 解析失败 ⇒ 不冷却
now = datetime.datetime.now(datetime.timezone.utc)
sys.exit(0 if now < until else 1)
PY
  then
    echo "e2e-runtime: 额度冷却中（至 $COOLDOWN）⇒ 不启动"; print_summary; exit 0
  fi
fi

if (( DIRTY )) && (( ! ALLOW_DIRTY )); then
  echo "e2e-runtime: 工作树脏 ⇒ 结果无法归因到某个 sha，本次不运行（用 --allow-dirty 强制）"
  python3 - "$STATE" "$TESTED_HEAD" "$BASE" "$HOST_VER" "$E2E_SHA" "$MAX_RUNS" <<'PY'
import json, sys, datetime, os
path, head, base, ver, e2e, max_runs = sys.argv[1:7]
s = json.load(open(path)) if os.path.exists(path) else {}
runs = s.get("runs") or []
runs.append({"at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "base_sha": base, "tested_head": head, "e2e_repo_sha": e2e,
             "opencode_version": ver, "config_dirty": True,
             "files": [], "cases": [], "verdict": "undetermined", "note": "工作树脏，未运行"})
s["runs"] = runs[-int(max_runs):]
json.dump(s, open(path, "w"), ensure_ascii=False, indent=2)
PY
  exit 0
fi

[[ -n "$BASE_NOTE" ]] && echo "e2e-runtime: $BASE_NOTE"

# ── 逐文件跑（解析 TAP）────────────────────────────────────────────────────
mkdir -p "$E2E_REPO/.tmp-rt" 2>/dev/null
AGG="ok"
CASES_JSON="[]"
declare -a CASES_REC=()

for c in "${CASES[@]}"; do
  f="$E2E_REPO/tests/integration/$c"
  if [[ ! -f "$f" ]]; then
    echo "  - $c: not_run（用例尚未落地）"
    CASES_REC+=("{\"file\":\"$c\",\"verdict\":\"not_run\",\"note\":\"用例文件不存在\"}")
    [[ "$AGG" == "ok" ]] && AGG="undetermined"
    continue
  fi
  echo "  - $c: running…"
  out="$(cd "$E2E_REPO" && E2E_REAL_RUNTIME=1 TMPDIR="$E2E_REPO/.tmp-rt" \
        timeout "$CASE_TIMEOUT" bats --formatter tap "tests/integration/$c" 2>&1)"
  rc=$?
  fail=0; und=0; okn=0
  while IFS= read -r line; do
    case "$line" in
      "not ok "*) fail=1 ;;
      "ok "*" # skip"*) und=1 ;;
      "ok "*) okn=1 ;;
    esac
  done <<<"$out"
  if (( fail )); then v="fail"
  elif (( und )); then v="undetermined"
  elif (( okn )); then v="ok"
  else v="undetermined"; fi
  [[ $rc -eq 124 ]] && v="undetermined"   # timeout
  if grep -qiE "rate.?limit|insufficient.quota|额度" <<<"$out"; then
    v="undetermined"
    python3 - "$STATE" <<'PY'
import json, sys, os, datetime
p = sys.argv[1]
s = json.load(open(p)) if os.path.exists(p) else {}
s["quota_cooldown_until"] = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)).isoformat(timespec="seconds")
json.dump(s, open(p, "w"), ensure_ascii=False, indent=2)
PY
  fi
  echo "    → $v"
  CASES_REC+=("{\"file\":\"$c\",\"verdict\":\"$v\"}")
  case "$v" in
    fail) AGG="fail" ;;
    undetermined|not_run) [[ "$AGG" != "fail" ]] && AGG="undetermined" ;;
  esac
done

# ⚠ 脏树 + --allow-dirty：即使用例全绿，结果也**不能**记 ok / 不能推进 last_ok_sha
#   （e2e 测的是活仓工作区，不是某个 sha ⇒ 脏树上的绿不归因于 tested_head）
if (( DIRTY )); then
  AGG="undetermined"
  echo "  ⚠ 工作树脏（--allow-dirty）⇒ 整批 verdict 强制 undetermined，不推进 last_ok_sha"
fi

CASES_JSON="[$(IFS=,; echo "${CASES_REC[*]}")]"
FILES_JSON="$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1:]))' "${CHANGED[@]:-}")"

python3 - "$STATE" "$TESTED_HEAD" "$BASE" "$DIRTY" "$HOST_VER" "$E2E_SHA" "$AGG" "$CASES_JSON" "$FILES_JSON" "$MAX_RUNS" <<'PY'
import json, sys, datetime, os
path, head, base, dirty, ver, e2e, agg, cases_json, files_json, max_runs = sys.argv[1:11]
s = json.load(open(path)) if os.path.exists(path) else {}
prev_ok = s.get("last_ok_sha")
runs = s.get("runs") or []
runs.append({"at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "base_sha": base, "tested_head": head, "e2e_repo_sha": e2e,
             "opencode_version": ver, "config_dirty": bool(int(dirty)),
             "files": json.loads(files_json), "cases": json.loads(cases_json),
             "verdict": agg, "note": ""})
if agg in ("ok", "noop"):
    s["last_ok_sha"] = head
s["opencode_version"] = ver
s["e2e_repo_sha"] = e2e
# 滚动：保留最近 N 条，但**保住 last_ok_sha 指向的那条**
trimmed = runs[-int(max_runs):]
keep_sha = s.get("last_ok_sha")
if keep_sha and not any(r.get("tested_head") == keep_sha for r in trimmed):
    ref = [r for r in runs if r.get("tested_head") == keep_sha]
    if ref:
        trimmed = [ref[-1]] + trimmed[1:]
s["runs"] = trimmed
json.dump(s, open(path, "w"), ensure_ascii=False, indent=2)
PY

echo "e2e-runtime: verdict=$AGG（base=${BASE:0:8} head=${TESTED_HEAD:0:8}）"
print_summary

if [[ "$AGG" == "fail" ]] && (( ! SOFT )); then exit 1; fi
exit 0
