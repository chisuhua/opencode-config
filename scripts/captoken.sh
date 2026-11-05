#!/usr/bin/env bash
# captoken.sh — capability token 签发与校验 wrapper（BL-2 capability token 签发机制，裁决 C）
#
# 用途：
#   captoken.sh issue <session_id> [ttl_minutes]   # 签发 token（内存表，进程内 map）
#   captoken.sh verify <token> <endpoint>          # 校验 token 能否访问指定端点
#   captoken.sh list                                # 列出当前内存表中所有 token（调试用）
#
# 设计约束（与 ADR 决策 1 / 裁决 C 对齐）：
#   - token 结构仅含 endpoints: ["permission","form","wait"] 数组，不设通配符匹配器
#   - 绑定 session_id、TTL ≤ 15 min（默认 15），可吊销（进程重启即全量失效，内存表清空）
#   - 强制点在 wrapper 层：校验 token 的 session_id 绑定与 TTL，越界访问第四端点拒绝
#   - OpenCode 原生端点本身不认识 token，hook 挂载列入 delegate 插件轮次；本轮以 wrapper 演示
#   - 进程重启即全量失效（不持久化到磁盘，内存表自然清空）
#
# 存储：内存文件 ${CAPTOKEN_STATE_DIR:-/tmp/opencode/captoken}/tokens.json
#   注意：此文件仅用于本轮 wrapper 演示，进程重启后目录可能清空，等价于"全量失效"。
#
# 退出码：0 = 允许，1 = 拒绝，2 = 用法错误

set -euo pipefail

STATE_DIR="${CAPTOKEN_STATE_DIR:-/tmp/opencode/captoken}"
STATE_FILE="${STATE_DIR}/tokens.json"
ALLOWED_ENDPOINTS='["permission","form","wait"]'
DEFAULT_TTL_MINUTES=15

mkdir -p "$STATE_DIR"

# 初始化状态文件（如果不存在）
init_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo '{}' > "$STATE_FILE"
  fi
}

# 生成一个简易 token（base64 of session_id:timestamp:random）
gen_token() {
  local session_id="$1"
  local ts
  ts=$(date +%s)
  local rand
  rand=$(head -c 16 /dev/urandom | base64 | tr -d '/+=\n' | head -c 22)
  printf '%s:%s:%s' "$session_id" "$ts" "$rand" | base64 | tr -d '/+=\n'
}

# 解析 token 的 session_id 和签发时间
parse_token() {
  local token="$1"
  # base64 输出已去掉填充字符，解码前补齐 padding
  local padded
  local remainder=$(( ${#token} % 4 ))
  if [[ "$remainder" -eq 2 ]]; then
    padded="${token}=="
  elif [[ "$remainder" -eq 3 ]]; then
    padded="${token}="
  else
    padded="$token"
  fi
  local decoded
  decoded=$(printf '%s' "$padded" | base64 -d 2>/dev/null) || return 1
  printf '%s' "$decoded"
}

cmd_issue() {
  local session_id="${1:?usage: captoken.sh issue <session_id> [ttl_minutes]}"
  local ttl_minutes="${2:-$DEFAULT_TTL_MINUTES}"
  init_state

  local token
  token=$(gen_token "$session_id")
  local issued_at
  issued_at=$(date +%s)
  local expires_at=$((issued_at + ttl_minutes * 60))

  local existing
  existing=$(cat "$STATE_FILE")
  local new_entry
  new_entry=$(jq -n \
    --arg token "$token" \
    --arg session_id "$session_id" \
    --argjson issued_at "$issued_at" \
    --argjson expires_at "$expires_at" \
    --argjson endpoints "$ALLOWED_ENDPOINTS" \
    '{
      ($token): {
        session_id: $session_id,
        issued_at: $issued_at,
        expires_at: $expires_at,
        endpoints: $endpoints,
        revoked: false
      }
    }')

  jq -s '.[0] * .[1]' "$STATE_FILE" <(printf '%s' "$new_entry") > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

  printf '%s\n' "$token"
}

cmd_verify() {
  local token="${1:?usage: captoken.sh verify <token> <endpoint>}"
  local endpoint="${2:?usage: captoken.sh verify <token> <endpoint>}"
  init_state

  local decoded
  decoded=$(parse_token "$token") || { echo "DENY: invalid token format" >&2; exit 1; }

  local session_id issued_at expires_at revoked
  session_id=$(printf '%s' "$decoded" | cut -d: -f1)
  issued_at=$(printf '%s' "$decoded" | cut -d: -f2)

  local now
  now=$(date +%s)

  # 检查 token 是否存在于内存表且未撤销
  local entry
  entry=$(jq -r --arg token "$token" '.[$token] // empty' "$STATE_FILE")
  if [[ -z "$entry" ]]; then
    echo "DENY: token not found" >&2
    exit 1
  fi

  local token_session_id token_expires_at token_revoked
  token_session_id=$(printf '%s' "$entry" | jq -r '.session_id')
  token_expires_at=$(printf '%s' "$entry" | jq -r '.expires_at')
  token_revoked=$(printf '%s' "$entry" | jq -r '.revoked')

  # session_id 绑定校验
  if [[ "$token_session_id" != "$session_id" ]]; then
    echo "DENY: session_id mismatch (token=$token_session_id, request=$session_id)" >&2
    exit 1
  fi

  # TTL 校验
  if [[ "$now" -gt "$token_expires_at" ]]; then
    echo "DENY: token expired (expires_at=$token_expires_at, now=$now)" >&2
    exit 1
  fi

  # 撤销校验
  if [[ "$token_revoked" == "true" ]]; then
    echo "DENY: token revoked" >&2
    exit 1
  fi

  # 端点限制校验
  local allowed
  allowed=$(printf '%s' "$entry" | jq -r --arg ep "$endpoint" '.endpoints | index($ep)')
  if [[ "$allowed" == "null" ]]; then
    echo "DENY: endpoint '$endpoint' not allowed (allowed: permission/form/wait)" >&2
    exit 1
  fi

  echo "ALLOW: session_id=$session_id endpoint=$endpoint"
}

cmd_list() {
  init_state
  jq 'to_entries | map({token: .key, session_id: .value.session_id, expires_at: .value.expires_at, revoked: .value.revoked})' "$STATE_FILE"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  issue)  cmd_issue "$@" ;;
  verify) cmd_verify "$@" ;;
  list)   cmd_list ;;
  *)      echo "usage: captoken.sh {issue|verify|list} ..." >&2; exit 2 ;;
esac
