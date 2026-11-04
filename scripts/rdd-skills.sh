#!/usr/bin/env bash
# rdd-skills.sh — 探测 rdd-workflow 是否安装、哪些技能可用
#
# 用途：build agent 角色矩阵的「rdd-workflow 增强层」入口。
#   - 没装 → 增强层关闭，角色走内置流程（角色矩阵仍然独立可用）。
#   - 装了 → 逐 skill 判前置条件，满足才调用。
#
# 用法:
#   scripts/rdd-skills.sh                # 人类可读摘要
#   scripts/rdd-skills.sh --json         # 机读 JSON
#   scripts/rdd-skills.sh --json <root>  # 指定项目根（默认取 git 顶层）
#
# 退出码:
#   0  至少一个 rdd-workflow skill 可用 → 增强层可用
#   1  未安装 → 增强层关闭
#   2  参数错误

set -uo pipefail

# rdd-workflow 官方 skill 集（镜像自 rdd-workflow 的 skills/ 目录）。
# 上游新增 skill 时需在此补一行；漏一个只会导致该 skill 被判为不可用，
# 不会导致误判为已安装。
RDD_SKILLS=(
  add-improve
  contract-check
  cross-repo-protocol
  deps
  execute
  feature
  guide
  openspec-gate
  propose
  rdd-arch
  rdd-builder
  rdd-doctor
  rdd-env-bootstrap
  rdd-env-check
  rdd-hub-bootstrap
  rdd-planner
  rdd-quick
  rdd-session-bootstrap
  rdd-verifier
  rdd-workflow-brainstorm
  rdd-workflow-writing-plans
  rddf-session
  report-issue
  roadmap
  spoke-system-prompt-injection
  status
  sync-hub
  watch-hub
)

MODE="text"
PROJECT_ROOT_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) MODE="json"; shift ;;
    -h|--help)
      cat <<'EOF'
rdd-skills.sh — 探测 rdd-workflow 是否安装、哪些技能可用

用法:
  scripts/rdd-skills.sh                # 人类可读摘要
  scripts/rdd-skills.sh --json         # 机读 JSON
  scripts/rdd-skills.sh --json <root>  # 指定项目根（默认取 git 顶层）

退出码:
  0  至少一个 rdd-workflow skill 可用 → 增强层可用
  1  未安装 → 增强层关闭
  2  参数错误
EOF
      exit 0
      ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) PROJECT_ROOT_ARG="$1"; shift ;;
  esac
done

PROJECT_ROOT="${PROJECT_ROOT_ARG:-${PROJECT_ROOT:-}}"
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi

# skill_path <name> → 打印第一个命中的目录（含 SKILL.md），无则返回 1
# 探测顺序对齐 rdd-workflow 的 resolve_rdd_skill_dir。
skill_path() {
  local name="$1" c
  for c in \
    "$PROJECT_ROOT/.opencode/skills/$name" \
    "$PROJECT_ROOT/.opencode/skills/rdd-workflow/skills/$name" \
    "$HOME/.agents/skills/$name" \
    "$HOME/.agents/skills/rdd-workflow/skills/$name" \
    "${RDD_WORKFLOW_SRC:+$RDD_WORKFLOW_SRC/skills/$name}"
  do
    if [[ -n "$c" && -f "$c/SKILL.md" ]]; then
      printf '%s' "$c"
      return 0
    fi
  done
  return 1
}

classify_source() {
  case "$1" in
    "$PROJECT_ROOT"/*) printf 'project' ;;
    "$HOME"/.agents/*) printf 'global' ;;
    *) printf 'dev' ;;
  esac
}

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

AVAILABLE=()
MISSING=()
SOURCES=()
declare -A PATHS=()

for skill in "${RDD_SKILLS[@]}"; do
  if path="$(skill_path "$skill")"; then
    AVAILABLE+=("$skill")
    PATHS["$skill"]="$path"
    src="$(classify_source "$path")"
    case " ${SOURCES[*]} " in
      *" $src "*) : ;;
      *) SOURCES+=("$src") ;;
    esac
  else
    MISSING+=("$skill")
  fi
done

RDF_CLI="no"
RDF_CLI_PATH=""
if command -v rddf >/dev/null 2>&1; then
  RDF_CLI="yes"
  RDF_CLI_PATH="$(command -v rddf)"
fi

if [[ "$MODE" == "json" ]]; then
  printf '{\n'
  printf '  "installed": %s,\n' "$([[ ${#AVAILABLE[@]} -gt 0 ]] && echo true || echo false)"
  printf '  "project_root": "%s",\n' "$(json_escape "$PROJECT_ROOT")"
  printf '  "sources": ['
  for i in "${!SOURCES[@]}"; do
    [[ $i -gt 0 ]] && printf ', '
    printf '"%s"' "$(json_escape "${SOURCES[$i]}")"
  done
  printf '],\n'
  printf '  "rddf_cli": %s,\n' "$([[ "$RDF_CLI" == "yes" ]] && echo true || echo false)"
  printf '  "rddf_cli_path": "%s",\n' "$(json_escape "$RDF_CLI_PATH")"
  printf '  "available_count": %d,\n' "${#AVAILABLE[@]}"
  printf '  "total_count": %d,\n' "${#RDD_SKILLS[@]}"
  printf '  "available": ['
  for i in "${!AVAILABLE[@]}"; do
    [[ $i -gt 0 ]] && printf ', '
    printf '"%s"' "${AVAILABLE[$i]}"
  done
  printf '],\n'
  printf '  "missing": ['
  for i in "${!MISSING[@]}"; do
    [[ $i -gt 0 ]] && printf ', '
    printf '"%s"' "${MISSING[$i]}"
  done
  printf '],\n'
  printf '  "paths": {'
  for i in "${!AVAILABLE[@]}"; do
    skill="${AVAILABLE[$i]}"
    [[ $i -gt 0 ]] && printf ', '
    printf '"%s": "%s"' "$skill" "$(json_escape "${PATHS[$skill]}")"
  done
  printf '}\n'
  printf '}\n'
else
  if [[ ${#AVAILABLE[@]} -eq 0 ]]; then
    printf 'rdd-workflow 增强层: 不可用 (未安装)\n'
    printf 'project_root: %s\n' "$PROJECT_ROOT"
    printf 'rddf CLI: %s\n' "$RDF_CLI"
    printf '→ 角色走内置流程，不调用任何 rdd-* skill\n'
  else
    printf 'rdd-workflow 增强层: 可用 (来源: %s)\n' "${SOURCES[*]:-none}"
    printf 'project_root: %s\n' "$PROJECT_ROOT"
    printf 'rddf CLI: %s%s\n' "$RDF_CLI" "$([[ "$RDF_CLI" == "yes" ]] && printf ' (%s)' "$RDF_CLI_PATH")"
    printf '可用技能 (%d/%d): %s\n' "${#AVAILABLE[@]}" "${#RDD_SKILLS[@]}" "${AVAILABLE[*]}"
    [[ ${#MISSING[@]} -gt 0 ]] && printf '缺失技能 (%d): %s\n' "${#MISSING[@]}" "${MISSING[*]}"
    printf '→ 调用前仍须逐 skill 判前置条件（frontmatter "Invoke when ..."）\n'
  fi
fi

[[ ${#AVAILABLE[@]} -gt 0 ]] && exit 0 || exit 1
