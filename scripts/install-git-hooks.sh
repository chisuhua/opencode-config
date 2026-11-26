#!/usr/bin/env bash
# scripts/install-git-hooks.sh — 启用/停用本仓的 git hook（**本机 opt-in**，幂等）
#
#   scripts/install-git-hooks.sh            # core.hooksPath=.githooks
#   scripts/install-git-hooks.sh --uninstall # git config --unset core.hooksPath
#   scripts/install-git-hooks.sh --status    # 打印当前状态
#
# ⚠ 这是**本地设置**（写进本仓的 .git/config）⇒ 不改变任何他人 clone 的行为。
# ⚠ 当前唯一 hook 是 `post-commit`（advisory，永不阻断提交）。**不做 pre-commit 硬门** ——
#   硬门留在 `plugins/commit-gate.ts`（零模型层）。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

case "${1:-}" in
  --uninstall)
    git config --unset core.hooksPath 2>/dev/null || true
    echo "已停用（core.hooksPath 已清除）"
    exit 0 ;;
  --status)
    cur="$(git config --get core.hooksPath 2>/dev/null || true)"
    if [[ -n "$cur" ]]; then echo "已启用：core.hooksPath=$cur"; else echo "未启用（default .git/hooks）"; fi
    exit 0 ;;
  "" ) : ;;
  * ) echo "未知参数: $1（--uninstall | --status）" >&2; exit 2 ;;
esac

chmod +x "$ROOT/.githooks/post-commit" "$ROOT/scripts/e2e-runtime.sh" 2>/dev/null || true
git config core.hooksPath .githooks

# 记录 opencode 绝对路径（GUI / IDE 提交时 PATH 可能不含 opencode）
BIN="$(command -v opencode || true)"
if [[ -n "$BIN" ]]; then
  mkdir -p "$ROOT/.rddf/state"
  python3 - "$ROOT/.rddf/state/e2e-runtime.json" "$BIN" <<'PY'
import json, os, sys
p, b = sys.argv[1], sys.argv[2]
s = json.load(open(p)) if os.path.exists(p) else {}
s["opencode_bin"] = b
json.dump(s, open(p, "w"), ensure_ascii=False, indent=2)
PY
fi

echo "已启用：core.hooksPath=$(git config --get core.hooksPath)"
echo "  hook: .githooks/post-commit（advisory，后台跑，永不阻断）"
[[ -n "$BIN" ]] && echo "  opencode: $BIN"
