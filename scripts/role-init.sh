#!/usr/bin/env bash
# role-init.sh — 在指定项目根创建 .rddf/state/role.json (POC)
#
# 用法:
#   scripts/role-init.sh [<project-root> ...]   # 一个或多个项目路径
#   scripts/role-init.sh                        # 交互式：当前目录
#
# 幂等：role.json 已存在则 skip。
# 不动 .gitignore —— role.json 是个人状态，但 rdd-workflow 生态里 .rddf/
# 通常项目级 gitignore 由 plans-init / 用户自行决定。

set -euo pipefail

STATE_DIR_NAME=".rddf"
STATE_FILE_NAME="role.json"

init_role_file() {
  local root="$1"
  local dir="${root}/${STATE_DIR_NAME}/state"
  local file="${dir}/${STATE_FILE_NAME}"

  if [[ ! -d "$root" ]]; then
    echo "skip: ${root} (not a directory)" >&2
    return 1
  fi

  if [[ -f "$file" ]]; then
    echo "ok:   ${root} (role.json already exists; use /role-show to view)"
    return 0
  fi

  mkdir -p "$dir"

  cat > "$file" <<'JSON'
{
  "schema_version": "role-v1",
  "current_role": "general",
  "updated_at": null,
  "updated_by": null,
  "session_id": null,
  "auto_switch_window": null,
  "history": []
}
JSON

  echo "add:  ${root} (created .rddf/state/role.json with current_role=general; use 'switch to <role>' to change)"

  # role.json 是个人状态（history / 授权窗口），不应进版本库。
  # rdd-workflow 的 gitignore 守卫只覆盖 openspec/，不覆盖 .rddf/（见
  # rdd-workflow _lib/env_checks.sh::_check_gitignore），所以这里只提示、不擅自改文件。
  local gi="${root}/.gitignore"
  if ! grep -qxF '.rddf/state/role.json' "$gi" 2>/dev/null; then
    echo "hint: .rddf/state/role.json 是个人状态（history / 授权窗口），建议加入 .gitignore："
    echo "      echo '.rddf/state/role.json' >> .gitignore"
  fi
}

if [[ $# -eq 0 ]]; then
  init_role_file "$(pwd)"
else
  for arg in "$@"; do
    init_role_file "$arg"
  done
fi