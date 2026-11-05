#!/usr/bin/env bash
# role-show.sh — 读取并显示指定项目根的 .rddf/state/role.json
#
# 用法:
#   scripts/role-show.sh [<project-root> ...]
#   scripts/role-show.sh                   # 当前目录
#
# 行为:
#   - 找到文件 → 输出当前角色 + 更新时间 + 最近 5 条 history
#   - 文件不存在 → 报错并提示先跑 /role-init

set -euo pipefail

STATE_FILE_NAME=".rddf/state/role.json"

show_role() {
  local root="$1"
  local file="${root}/${STATE_FILE_NAME}"

  if [[ ! -d "$root" ]]; then
    echo "skip: ${root} (not a directory)" >&2
    return 1
  fi

  if [[ ! -f "$file" ]]; then
    echo "missing: ${file}" >&2
    echo "  hint:  run /role-init in ${root} to bootstrap" >&2
    return 1
  fi

  echo "project: ${root}"
  echo "file:    ${file}"
  echo "---"
  # 优先用 jq 输出（如果可用），否则回退到 cat
  if command -v jq >/dev/null 2>&1; then
    jq -r '
      "session_id:    \(env.OPENCODE_SESSION_ID // "(not set)")",
      "current_role:  \(
        if .schema_version == "role-v2" then
          (if env.OPENCODE_SESSION_ID != null and .sessions[env.OPENCODE_SESSION_ID] != null then
            .sessions[env.OPENCODE_SESSION_ID].current_role // .current_role // "(none)"
          else
            .current_role // "(none)"
          end)
        else
          .current_role // "(none)"
        end
      )",
      "schema:        \(.schema_version)",
      "window:        \(
        if .schema_version == "role-v2" then
          (if env.OPENCODE_SESSION_ID != null and .sessions[env.OPENCODE_SESSION_ID] != null and .sessions[env.OPENCODE_SESSION_ID].auto_switch_window != null then
            ((.sessions[env.OPENCODE_SESSION_ID].auto_switch_window.roles | join(" ↔ ")) + " used " + (.sessions[env.OPENCODE_SESSION_ID].auto_switch_window.used | tostring) + "/" + (.sessions[env.OPENCODE_SESSION_ID].auto_switch_window.max_rounds | tostring))
          else
            "(none)"
          end)
        else
          (if .auto_switch_window then ((.auto_switch_window.roles | join(" ↔ ")) + " used " + (.auto_switch_window.used | tostring) + "/" + (.auto_switch_window.max_rounds | tostring)) else "(none)" end)
        end
      )",
      "history (tail 5):",
      (.history | .[-5:] | .[] | "  - \(.role) at \(.at // "?") by \(.by // "?")")
    ' "$file"
  else
    echo "(jq not installed; raw output:)"
    cat "$file"
  fi
}

if [[ $# -eq 0 ]]; then
  show_role "$(pwd)"
else
  for arg in "$@"; do
    show_role "$arg"
  done
fi