#!/usr/bin/env bash
# role-migrate-v2.sh — role.json v1 → v2 一次性离线迁移脚本（BL-2 2.4 条目）
#
# 用法:
#   role-migrate-v2.sh [<role.json 路径> ...]   # 迁移一个或多个 role.json
#   role-migrate-v2.sh                          # 交互式：当前目录的 .rddf/state/role.json
#
# 行为:
#   - v1 文件 → v2 文件，history 全量保留
#   - 按文件中的 session_id 归位：若 session_id 为 null，标记为 "legacy" 分区
#   - 顶层 current_role 写入 legacy 分区的 current_role（作为展示镜像）
#   - 顶层 schema_version 升为 role-v2
#   - 顶层 current_role / session_id / auto_switch_window 保留原值（兼容旧 reader）
#   - 整文件 tmp + atomic rename 写盘
#
# 退出条件（规划承诺）：
#   迁移完成后，v1 读取路径在下个版本删除。本脚本为一次性离线脚本，不持久化为服务。
#
# 退出码：0 = 成功，1 = 失败

set -euo pipefail

MIGRATE_DIR="${CAPTOKEN_STATE_DIR:-/tmp/opencode/migrate}"
mkdir -p "$MIGRATE_DIR"

migrate_file() {
  local file="$1"

  if [[ ! -f "$file" ]]; then
    echo "skip: ${file} (not a file)" >&2
    return 1
  fi

  # 检查是否已经是 v2
  local schema
  schema=$(jq -r '.schema_version // "role-v1"' "$file")
  if [[ "$schema" == "role-v2" ]]; then
    echo "ok:   ${file} (already role-v2, skip)"
    return 0
  fi

  local session_id current_role updated_at updated_by history
  session_id=$(jq -r '.session_id // null' "$file")
  current_role=$(jq -r '.current_role // "general"' "$file")
  updated_at=$(jq -r '.updated_at // null' "$file")
  updated_by=$(jq -r '.updated_by // null' "$file")
  history=$(jq -r '.history // []' "$file")

  # session_id 为 null 时标记为 legacy 分区
  local legacy_key="legacy"
  if [[ "$session_id" != "null" && -n "$session_id" ]]; then
    legacy_key="$session_id"
  fi

  # 构建 v2 结构（使用 --argjson 传递 session_id，保持 JSON null 类型）
  jq \
    --argjson session_id "$session_id" \
    --arg current_role "$current_role" \
    --arg updated_at "$updated_at" \
    --arg updated_by "$updated_by" \
    --arg legacy_key "$legacy_key" \
    --argjson history "$history" \
    '
    {
      schema_version: "role-v2",
      current_role: $current_role,
      updated_at: ($updated_at // null),
      updated_by: ($updated_by // null),
      session_id: $session_id,
      auto_switch_window: null,
      history: $history,
      sessions: {
        ($legacy_key): {
          current_role: $current_role,
          auto_switch_window: null,
          auto_answer: null,
          updated_at: ($updated_at // null)
        }
      }
    }
    ' "$file" > "${MIGRATE_DIR}/.migrate.tmp" && mv "${MIGRATE_DIR}/.migrate.tmp" "$file"

  echo "migrated: ${file} (v1 → role-v2, session_key=$legacy_key, history_count=$(jq -r '.history | length' "$file"))"
}

if [[ $# -eq 0 ]]; then
  migrate_file "$(pwd)/.rddf/state/role.json"
else
  for arg in "$@"; do
    migrate_file "$arg"
  done
fi
