#!/usr/bin/env bash
# check-upstream-anchors.sh — 上游（opencode）**语义锚点**漂移检查
#
# 为什么需要：`ADR-front-multi-backend` / `ADR-front-stop-confirmation` 的关键判据
# （停机确认、NotFound 判定、interrupt 语义、插件可见方法集合）都依赖上游行为。
# ADR 里曾用**行号**引用上游源码 —— opencode 升级后行号会静默漂移，而**语义**才是
# 真正的前提。本脚本只校验语义（grep 模式），故意**不校验行号**。
#
# 用法:
#   scripts/check-upstream-anchors.sh [--src DIR] [--quiet]
#
#   --src DIR   上游源码根（默认 $OPENCODE_SRC，再回退 /workspace/project/opencode）
#   --quiet     只输出 FAIL / SKIP
#
# 退出码:
#   0 = 全部锚点命中；或源码不存在（SKIP —— 非本仓可控）
#   2 = 发现漂移（至少一个锚点不成立）⇒ 需要重新核对 ADR 的技术前提
#
# 约定：锚点只写「语义断言 + 文件 + grep 模式」，不写行号。
set -uo pipefail

SRC="${OPENCODE_SRC:-/workspace/project/opencode}"
QUIET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC="${2:-}"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

say() { [ "$QUIET" -eq 1 ] || echo "$@"; }

if [ ! -d "$SRC/packages" ]; then
  say "SKIP: 未找到上游源码（$SRC）；设置 OPENCODE_SRC 或传 --src 后重跑"
  exit 0
fi

FAIL=0
N=0

# check <名称> <文件（相对 SRC）> <ERE 模式> [说明]
check() {
  local name="$1" file="$2" pattern="$3" why="${4:-}"
  N=$((N + 1))
  local path="$SRC/$file"
  if [ ! -f "$path" ]; then
    echo "FAIL [$name] 文件缺失: $file ${why:+($why)}"
    FAIL=$((FAIL + 1))
    return
  fi
  if grep -Eq "$pattern" "$path"; then
    say "PASS [$name] $file"
  else
    echo "FAIL [$name] 语义锚点未命中: $file :: $pattern ${why:+($why)}"
    FAIL=$((FAIL + 1))
  fi
}

say "上游源码: $SRC"

# ── A1：不存在 session 的上游错误是 tagged `Session.NotFoundError` ──
# 依据：isSessionMissingError 的 tag 分支（lib/delegate-async.ts）
check "A1 SessionNotFound 的 tag" "packages/core/src/session/error.ts" '"Session\.NotFoundError"' \
  "isSessionMissingError 依赖该 tag 判「已删除」"

# ── A2：interrupt 只保证「已接受」，cleanup 异步 settle；返回 boolean ──
check "A2 interrupt 异步 settle" "packages/core/src/session/execution.ts" 'cleanup settles asynchronously' \
  "停机判据不能用 interrupt 返回值当「已停」"
check "A2b interrupt 返回 boolean" "packages/core/src/session/execution.ts" 'interrupt: \(' \
  "插件侧 interrupt 的返回形状"

# ── A3：session.wait = get（不存在 ⇒ NotFound）+ execution.awaitIdle ──
check "A3 wait 先 get" "packages/core/src/session/session.ts" 'const wait = Effect\.fn\("Session\.wait"\)' \
  "wait 对已删 session 抛 NotFound（D3：视为已停机）"
check "A3b wait 等 awaitIdle" "packages/core/src/session/session.ts" 'execution\.awaitIdle\(sessionID\)' \
  "wait 必须等 execution 真正 idle，而不是只看 DB"

# ── A4：awaitIdle 在 settle 后**重判后继**（覆盖清理期间新起的 execution） ──
check "A4 awaitIdle 递归重判" "packages/core/src/session/run-coordinator.ts" 'awaitIdle\(key\)' \
  "wait 语义覆盖「后继 execution」是 AC3 的前提"

# ── A5：interrupt 在「无 execution / stopping 中 / settlement 窗口」返回 false ──
check "A5 interrupt 返回 false 的成因" "packages/core/src/session/run-coordinator.ts" \
  'execution === undefined \|\| execution\.stopping\) return false' \
  "interrupted:false 不等于「已停」，不得作为停机判据"

# ── A6：time.idle 是**严格单调**的终态水位线（max(time, prev+1)） ──
check "A6 time.idle 单调水位线" "packages/core/src/session/projector.ts" 'time_idle: sql`max\(' \
  "suspend 的「水位线前移」判据依赖它严格单调"

# ── A7：插件 ctx.session 暴露本仓用到的全部方法 ──
for m in get create remove prompt interrupt wait context list; do
  check "A7 ctx.session.$m" "packages/plugin/src/promise/adapter.ts" \
    "adaptApiMethod\(SessionEndpoints\[\"session\.$m\"\]" \
    "lib/ 直接调用的方法必须仍在插件可见面"
done

# ── A8：HTTP interrupt 返回 { interrupted }（与插件侧返回值形状一致） ──
check "A8 server interrupt 形状" "packages/server/src/handlers/session.ts" \
  'return \{ interrupted: yield\* session\.interrupt' \
  "lib 读取 r?.interrupted 的契约来源"

echo "----"
if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: DRIFT（$FAIL/$N 个锚点不成立）⇒ 重新核对 ADR 的技术前提，勿只改行号"
  exit 2
fi
echo "RESULT: OK（$N/$N 个语义锚点全部命中）"
