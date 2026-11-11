#!/usr/bin/env bash
# 变异验证（`openspec/changes/archive/2026-11-11-front-cancel-release/tasks.md` 2.3）：
# 每组变异**故意破坏**一条判据 ⇒ 对应用例**必须变红**（否则该用例没有守住这条判据）。
#
# 用法：scripts/mutate-cancel-release.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BACKUP=/tmp/opencode/mut-backup
rm -rf "$BACKUP"; mkdir -p "$BACKUP/lib"
cp lib/delegate-async.ts "$BACKUP/lib/"
cp lib/delegate-core.ts "$BACKUP/lib/"

restore() { cp "$BACKUP/lib/delegate-async.ts" lib/; cp "$BACKUP/lib/delegate-core.ts" lib/; }
trap restore EXIT

# 跑 delegate-async 测试；打印失败用例名
run_tests() {
  timeout 400 bun test tests/delegate-async.test.ts 2>&1 | grep -E "^\(fail\)" | sed 's/^/    /'
}

check() { # check <名称> <期望变红的用例关键字>
  local name="$1" kw="$2"
  local out
  out="$(run_tests)"
  if echo "$out" | grep -q "$kw"; then
    echo "  ✅ $name ⇒ 用例变红（判据被守住）"
    return 0
  fi
  echo "  ❌ $name ⇒ 用例**未**变红（该用例没守住这条判据）"
  echo "$out"
  return 1
}

FAIL=0

echo "=== 变异 1：去掉停机证据门控（cancel 直接放槽） ==="
python3 - <<'PY'
import pathlib
p = pathlib.Path('lib/delegate-async.ts'); t = p.read_text()
a = "        if (!outcome.stopped && !force) {"
assert a in t, "M1 anchor missing"
p.write_text(t.replace(a, "        if (false && !outcome.stopped && !force) {", 1))
PY
check "M1 去掉判据门控" "AC1 假停机不放槽" || FAIL=1
restore

echo "=== 变异 2：去掉授权门控（代号校验） ==="
python3 - <<'PY'
import pathlib
p = pathlib.Path('lib/delegate-async.ts'); t = p.read_text()
a = "    if (readClaimGen(entry) !== expectedGen) {"
assert a in t, "M2 anchor missing"
p.write_text(t.replace(a, "    if (false && readClaimGen(entry) !== expectedGen) {", 1))
PY
check "M2 去掉授权门控" "AC8 授权类拒绝" || FAIL=1
restore

echo "=== 变异 3：去掉 reconcile 例外（被钉住的条目被自动放行） ==="
python3 - <<'PY'
import pathlib
p = pathlib.Path('lib/delegate-async.ts'); t = p.read_text()
a = "      if (pairs[c.session_id]?.cancel_pending) continue\n"
assert a in t, "M3 anchor missing"
p.write_text(t.replace(a, "", 1))
PY
check "M3 去掉 reconcile 例外" "AC9 cancel_pending 挡住 reconcile" || FAIL=1
restore

echo "=== 变异 4：去掉 cancel_pending 的写者保留纪律 ==="
python3 - <<'PY'
import pathlib
p = pathlib.Path('lib/delegate-core.ts'); t = p.read_text()
a = "    if (existing?.cancel_pending !== undefined) pairs[sessionID].cancel_pending = existing.cancel_pending\n"
assert a in t, "M4 anchor missing"
p.write_text(t.replace(a, "", 1))
PY
check "M4 去掉 cancel_pending 保留" "AC10 cancel_pending 生命周期" || FAIL=1
restore

echo "=== 变异 5：用钉住的基线代替本次尝试的快照（削弱水位线） ==="
python3 - <<'PY'
import pathlib
p = pathlib.Path('lib/delegate-async.ts'); t = p.read_text()
# ⚠️ 锚点必须**唯一**：只命中 `cancel` 里的那一处（`suspend` 里有同名的同缩进语句）
a = ("      // ── 快照：归属版本 + 停机基线（**必须在 interrupt 之前**取）──\n"
     "      const snapGen = readClaimGen(entry)\n"
     "      const stopBaseline = await snapshotStopBaseline(ctx, sessionID)")
assert t.count(a) == 1, f"M5 anchor count={t.count(a)}"
b = ("      // ── 快照：归属版本 + 停机基线（**必须在 interrupt 之前**取）──\n"
     "      const snapGen = readClaimGen(entry)\n"
     "      const pinnedBase = (entry as any)?.cancel_pending\n"
     "      const stopBaseline = pinnedBase\n"
     "        ? { idle: pinnedBase.baseline_idle, running: pinnedBase.baseline_running }\n"
     "        : await snapshotStopBaseline(ctx, sessionID)")
p.write_text(t.replace(a, b, 1))
PY
check "M5 用钉住的基线" "AC11 钉住不削弱水位线" || FAIL=1
restore

echo "===="
if [ "$FAIL" -eq 0 ]; then
  echo "RESULT: OK（5/5 组变异均被对应用例捕获）"
  exit 0
fi
echo "RESULT: FAIL（存在未被捕获的变异）"
exit 2
