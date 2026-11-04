#!/usr/bin/env bash
# plans-init.sh — 在指定项目根的 .gitignore 里加 .plans/ 条目
#
# 用法:
#   scripts/plans-init.sh <project-root> [<project-root> ...]
#   scripts/plans-init.sh           # 交互式：当前目录
#
# 幂等：.plans/ 条目已存在则跳过。
# 安全：只在传入路径下创建/修改 .gitignore，不递归。

set -euo pipefail

add_to_gitignore() {
  local root="$1"
  local gi="${root}/.gitignore"

  if [[ ! -d "$root" ]]; then
    echo "skip: ${root} (not a directory)" >&2
    return 1
  fi

  if [[ -f "$gi" ]] && grep -qxF '.plans/' "$gi"; then
    echo "ok:   ${root} (.plans/ already in .gitignore)"
    return 0
  fi

  if [[ -f "$gi" ]]; then
    # 追加，并加注释
    {
      echo ""
      echo "# plan agent 产物（不入库）"
      echo ".plans/"
    } >> "$gi"
    echo "add:  ${root} (appended .plans/ to existing .gitignore)"
  else
    {
      echo "# plan agent 产物（不入库）"
      echo ".plans/"
      echo ""
    } > "$gi"
    echo "add:  ${root} (created .gitignore with .plans/)"
  fi
}

if [[ $# -eq 0 ]]; then
  add_to_gitignore "$(pwd)"
else
  for arg in "$@"; do
    add_to_gitignore "$arg"
  done
fi
