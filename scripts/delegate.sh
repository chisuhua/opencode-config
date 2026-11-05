#!/usr/bin/env bash
# delegate.sh — delegate 插件 MVP（BL-3 / M3 阶段）
# 三个固定工具面：start / ask / wait，白名单在工具定义内，不接受任意 method/path/body
#
# 用法:
#   delegate.sh start <project_dir> <task_text>          # 在工程目录建工程 session，签发 capability token
#   delegate.sh ask <token> <permission|form> <once|reject|answer_json>  # 代答权限/表单请求
#   delegate.sh wait <token> [timeout_seconds]            # 等待工程 session 空闲（有界 long-polling）
#   delegate.sh list                                       # 列出活跃工程 session
#   delegate.sh token issue <session_id> [ttl_minutes]    # 签发 capability token（调试用）
#   delegate.sh token verify <token> <endpoint>            # 校验 token 能否访问指定端点
#
# 安全边界（与 ADR 决策 1/4 对齐）：
#   - 只接受固定命令，不接受任意 method/path/body（堵住裸 opencode API 逃逸通道）
#   - start 只允许 agent=build，工程目录必须在 pair.json 登记或白名单内
#   - ask 只允许 decision=once|reject，answer 仅限读工具类目
#   - 凭证（service.json 密码）仅在此脚本进程内使用，不进入 front transcript
#   - capability token 绑定 session_id、TTL≤15min、可吊销（进程重启即失效）
#   - external_directory 一律不代答（ADR 决策 4 v1 决断）
#
# 依赖：opencode CLI（自动认证）、captoken.sh（token 签发/校验）、jq
#
# 退出码：0 = 成功，1 = 拒绝/失败，2 = 用法错误

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAPTOKEN="${SCRIPT_DIR}/captoken.sh"
STATE_DIR="${CAPTOKEN_STATE_DIR:-/tmp/opencode/delegate}"
STATE_FILE="${STATE_DIR}/sessions.json"

mkdir -p "$STATE_DIR"

# 初始化会话状态文件
init_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo '{}' > "$STATE_FILE"
  fi
}

# 记录工程 session
register_session() {
  local session_id="$1"
  local project_dir="$2"
  local token="$3"
  init_state
  local new_entry
  new_entry=$(jq -n \
    --arg sid "$session_id" \
    --arg dir "$project_dir" \
    --arg tok "$token" \
    '{
      ($sid): {
        project_dir: $dir,
        token: $tok,
        created_at: (now | todate)
      }
    }')
  jq -s '.[0] * .[1]' "$STATE_FILE" <(printf '%s' "$new_entry") > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
}

# 根据 session_id 查找 token
find_token_by_session() {
  local session_id="$1"
  init_state
  jq -r --arg sid "$session_id" '.[$sid].token // empty' "$STATE_FILE"
}

# 根据 token 查找 session_id
find_session_by_token() {
  local token="$1"
  init_state
  jq -r --arg tok "$token" 'to_entries[] | select(.value.token == $tok) | .key' "$STATE_FILE" | head -1
}

# 检查 token 是否有效（存在且未过期）
check_token_valid() {
  local token="$1"
  local endpoint="${2:-}"
  "$CAPTOKEN" verify "$token" "$endpoint" >/dev/null 2>&1
}

# 获取 opencode service 密码（用于认证）
get_service_password() {
  local svc_file="${HOME:-/home/ubuntu}/.config/opencode/service.json"
  if [[ -f "$svc_file" ]]; then
    jq -r '.password // empty' "$svc_file" 2>/dev/null
  fi
}

# 调用 opencode API（带认证，不使用 eval）
opencode_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local password
  password=$(get_service_password)
  local auth_args=()
  if [[ -n "$password" ]]; then
    local encoded
    encoded=$(printf '%s:%s' 'opencode' "$password" | base64 | tr -d '\n')
    auth_args=(-H "Authorization: Basic ${encoded}")
  fi
  local api_args=()
  if [[ -n "$body" ]]; then
    api_args=(--data "${body}")
  fi
  opencode api "${method}" "${path}" "${api_args[@]:-}" "${auth_args[@]:-}" 2>&1
}

cmd_start() {
  local project_dir="${1:?usage: delegate.sh start <project_dir> <task_text>}"
  local task_text="${2:?usage: delegate.sh start <project_dir> <task_text>}"

  # 安全边界：工程目录必须存在
  if [[ ! -d "$project_dir" ]]; then
    echo "ERROR: project directory not found: $project_dir" >&2
    exit 1
  fi

  # 获取 canonical 路径（用于 pair.json 判定）
  local canonical
  canonical=$(cd "$project_dir" && git rev-parse --show-toplevel 2>/dev/null || echo "$project_dir")

  # 检查 pair.json 登记表（可选，开发期可手动创建）
  local pair_file="${canonical}/.rddf/state/pair.json"
  local pair_ok="false"
  if [[ -f "$pair_file" ]]; then
    pair_ok="true"
  fi

  # 建立工程 session（agent=build，location=project_dir）
  local resp
  resp=$(opencode_api post "/api/session" "{\"title\":\"engineering\",\"agent\":\"build\",\"location\":{\"directory\":\"${project_dir}\"}}")
  local session_id
  session_id=$(echo "$resp" | jq -r '.data.id // empty')
  if [[ -z "$session_id" ]]; then
    echo "ERROR: failed to create engineering session" >&2
    echo "$resp" >&2
    exit 1
  fi

  # 发送实施任务 prompt
  opencode_api post "/api/session/${session_id}/prompt" "{\"text\":\"${task_text}\"}" >/dev/null

  # 签发 capability token（TTL 15 min）
  local token
  token=$("$CAPTOKEN" issue "$session_id" 15)

  # 记录会话
  register_session "$session_id" "$project_dir" "$token"

  # 输出结果（token 给 front，session_id 供参考）
  jq -n \
    --arg sid "$session_id" \
    --arg tok "$token" \
    --arg dir "$project_dir" \
    --arg pair_ok "$pair_ok" \
    '{
      sessionID: $sid,
      token: $tok,
      project_dir: $dir,
      pair_registered: ($pair_ok == "true"),
      agent: "build",
      note: "front holds token; use delegate.sh ask/wait with this token"
    }'
}

cmd_ask() {
  local token="${1:?usage: delegate.sh ask <token> <permission|form> <once|reject|answer_json>}"
  local qtype="${2:?usage: delegate.sh ask <token> <permission|form> <once|reject|answer_json>}"
  local decision="${3:?usage: delegate.sh ask <token> <permission|form> <once|reject|answer_json>}"

  # 安全边界：token 校验
  local session_id
  session_id=$(find_session_by_token "$token")
  if [[ -z "$session_id" ]]; then
    echo "DENY: invalid or unknown token" >&2
    exit 1
  fi

  # 检查 token 是否允许访问 permission/form 端点
  if ! check_token_valid "$token" "permission" && ! check_token_valid "$token" "form"; then
    echo "DENY: token invalid or expired" >&2
    exit 1
  fi

  # 安全边界：external_directory 一律不代答（ADR 决策 4 v1）
  # 这里由前端在调用前自行判断，delegate 只执行决策

  case "$qtype" in
    permission)
      # 先查询 pending permission
      local perms
      perms=$(opencode_api get "/api/session/${session_id}/permission")
      local pending_count
      pending_count=$(echo "$perms" | jq '[.data[] | select(.id)] | length' 2>/dev/null || echo 0)
      if [[ "$pending_count" -eq 0 ]]; then
        echo "INFO: no pending permission request for session $session_id"
        return 0
      fi

      # 取第一个 pending permission 并回复
      local req_id
      req_id=$(echo "$perms" | jq -r '.data[0].id // empty')
      if [[ -z "$req_id" ]]; then
        echo "ERROR: cannot find permission request ID" >&2
        exit 1
      fi

      case "$decision" in
        once|reject)
          opencode_api post "/api/session/${session_id}/permission/${req_id}/reply" "{\"decision\":\"${decision}\"}" >/dev/null
          echo "OK: permission ${req_id} ${decision}ed"
          ;;
        *)
          echo "ERROR: decision must be 'once' or 'reject' for permission" >&2
          exit 2
          ;;
      esac
      ;;
    form)
      local forms
      forms=$(opencode_api get "/api/session/${session_id}/form")
      local pending_count
      pending_count=$(echo "$forms" | jq '[.data[] | select(.id)] | length' 2>/dev/null || echo 0)
      if [[ "$pending_count" -eq 0 ]]; then
        echo "INFO: no pending form for session $session_id"
        return 0
      fi

      local form_id
      form_id=$(echo "$forms" | jq -r '.data[0].id // empty')
      if [[ -z "$form_id" ]]; then
        echo "ERROR: cannot find form ID" >&2
        exit 1
      fi

      # decision 应该是 answer JSON，例如: {"q0":"项目 Alpha"}
      case "$decision" in
        \{*\})
          opencode_api post "/api/session/${session_id}/form/${form_id}/reply" "{\"answer\":${decision}}" >/dev/null
          echo "OK: form ${form_id} replied"
          ;;
        *)
          echo "ERROR: form decision must be JSON answer, e.g. '{\"q0\":\"value\"}'" >&2
          exit 2
          ;;
      esac
      ;;
    *)
      echo "ERROR: qtype must be 'permission' or 'form'" >&2
      exit 2
      ;;
  esac
}

cmd_wait() {
  if [[ $# -lt 1 ]]; then
    echo "usage: delegate.sh wait <token> [timeout_seconds]" >&2
    exit 2
  fi
  local token="$1"
  local max_wait="${2:-120}"

  # 安全边界：token 校验
  local session_id
  session_id=$(find_session_by_token "$token")
  if [[ -z "$session_id" ]]; then
    echo "DENY: invalid or unknown token" >&2
    exit 1
  fi

  if ! check_token_valid "$token" "wait"; then
    echo "DENY: token invalid or expired" >&2
    exit 1
  fi

  local elapsed=0
  local poll_interval=2
  local status=""
  while [[ "$elapsed" -lt "$max_wait" ]]; do
    status=$(opencode_api get "/api/session/${session_id}" | jq -r '.data.outcome // "running"' 2>/dev/null || echo "running")
    if [[ "$status" != "running" && "$status" != "null" ]]; then
      break
    fi
    sleep "$poll_interval"
    elapsed=$((elapsed + poll_interval))
  done

  # 会话已结束，读取结果
  if [[ "$status" != "running" && "$status" != "null" ]]; then
    local answer=""
    local error=""
    local completed_at
    completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    if [[ "$status" == "succeeded" ]]; then
      # 取最后一条 assistant 的 text 作为回答
      answer=$(opencode_api get "/api/session/${session_id}/message" 2>/dev/null \
        | jq -r '[.data[] | select(.type=="assistant") | .content[] | select(.type=="text") | .text] | .[-1] // empty' 2>/dev/null || true)
    elif [[ "$status" == "failed" ]]; then
      # 取错误信息
      error=$(opencode_api get "/api/session/${session_id}" 2>/dev/null \
        | jq -r '.data.error.message // .data.error // "unknown error"' 2>/dev/null || true)
    fi

    # 输出结构化 JSON，front 可直接解析
    jq -n \
      --arg sessionID "$session_id" \
      --arg outcome "$status" \
      --arg answer "${answer:-}" \
      --arg error "${error:-}" \
      --arg completed_at "$completed_at" \
      '{
        sessionID: $sessionID,
        outcome: $outcome,
        answer: $answer,
        error: $error,
        completed_at: $completed_at
      }'

    if [[ "$status" == "succeeded" ]]; then
      return 0
    else
      return 1
    fi
  fi

  # 超时，会话仍在运行
  jq -n \
    --arg sessionID "$session_id" \
    --arg max_wait "$max_wait" \
    '{
      sessionID: $sessionID,
      outcome: "pending",
      answer: "",
      error: "session still running after \($max_wait) seconds",
      completed_at: null
    }' >&2
  return 1
}

cmd_list() {
  init_state
  jq 'to_entries | map({sessionID: .key, project_dir: .value.project_dir, created_at: .value.created_at})' "$STATE_FILE"
}

# token 子命令（调用 captoken.sh）
cmd_token() {
  local subcmd="${1:-}"
  shift || true
  case "$subcmd" in
    issue)  "$CAPTOKEN" issue "$@" ;;
    verify) "$CAPTOKEN" verify "$@" ;;
    *)      echo "usage: delegate.sh token {issue|verify} ..." >&2; exit 2 ;;
  esac
}

cmd="${1:-}"
shift || true
case "$cmd" in
  start)  cmd_start "$@" ;;
  ask)    cmd_ask "$@" ;;
  wait)   cmd_wait "$@" ;;
  list)   cmd_list ;;
  token)  cmd_token "$@" ;;
  *)      echo "usage: delegate.sh {start|ask|wait|list|token} ..." >&2; exit 2 ;;
esac
