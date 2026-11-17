#!/usr/bin/env bash
# role-switch.sh —— 角色切换入口的**薄壳**（ADR-role-session-identity D2）
#
# ⚠ 语义全部在 `lib/role-lease.ts`（单源）；本脚本只把参数转给 `scripts/role-switch.ts`。
#   用法：
#     role-switch.sh <role> [--by user|auto] [--state-root <dir>] [--session <sid>]
#     role-switch.sh --exit | --close-window | --grant-window <roles-csv> <max>
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bun "$ROOT/scripts/role-switch.ts" "$@"
