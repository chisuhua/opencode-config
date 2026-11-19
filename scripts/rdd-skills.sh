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

# ⚠ 依赖 bash ≥ 4（用到关联数组 `declare -A`）。bash 3.2（macOS /bin/bash）会报错并回落内置清单。
#
# 已知启发式（不打算上 YAML 解析，避免新依赖）：`deprecated:` 只按**行首**匹配，且只作用于
# 磁盘侧的名字（manifest 里列出的名字不读 SKILL.md）。若将来出现 `deprecated: false` 之类写法，
# 需要改成按 metadata 段落解析。
#
# 已知取舍（critic SHOULD_FIX 1）：判「装了」的证据 = manifest 或内置清单里的名字命中。
# 若某个安装**既没有/读不到 manifest，且磁盘上的技能名全被上游改名**（与内置集也不交），
# 会被判成未安装 —— 这种布局会打 WARN（见下），但结论仍以权威集为准。

# rdd-workflow 官方 skill 集（**内置兜底**）。
#
# 正常路径下这份清单**不参与判定**：技能清单自动取自已安装 rdd-workflow 的
# `package.json::skills[]`（上游发布的权威清单），并用磁盘 `skills/*/SKILL.md` 兜底。
# 只有「一个 rdd-workflow 安装都没找到」或「清单与磁盘都读不到」时才回落到这里。
#
# ⚠ 历史：早期这里是**写死的镜像**，上游新增 skill 必须手工补一行，漏了就会把新技能
# 静默判成"不可用"（2026-11-19 新增 `session-lesson-mining` 时就是这样漏掉的）。
RDD_SKILLS_BUILTIN=(
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
  session-lesson-mining
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

# ── 技能清单自动发现 ───────────────────────────────────────────
# ① 已安装 rdd-workflow 的 `package.json::skills[]`（上游发布的权威清单）
# ② 磁盘上的 `<root>/skills/*/SKILL.md` / `<root>/*/SKILL.md`（清单缺失或落后时兜底，
#    跳过 `deprecated:`）
# ③ 内置 `RDD_SKILLS_BUILTIN`（一个安装都没找到时）
#
# 为什么要自动：清单是**上游的**，本脚本不在上游仓里 —— 写死镜像时，
# 上游新增 skill 会被静默判成"不可用"（2026-11-19 的 session-lesson-mining 就是这样漏掉的）。
RDD_ROOTS=()
RDD_SKILLS=()
SKILLS_SOURCE=""
MANIFEST_ROOT=""
DISK_ROOT=""
INSTALLED_COUNT=0
declare -A SEEN=()
# 上游权威集 = manifest ∪ 内置清单。**只有**属于它的技能才计入「增强层可用」——
# 否则项目自己的 `.opencode/skills/<任意>/SKILL.md` 会让 `installed` 变真，
# 把「没装 rdd-workflow」误判成「装了」（2026-11-19 oracle 审查 N1）。
declare -A AUTHORITATIVE=()

add_root() {
  local r="$1" x
  [[ -n "$r" && -d "$r" ]] || return 0
  for x in "${RDD_ROOTS[@]:-}"; do
    [[ -n "$x" && "$x" == "$r" ]] && return 0
  done
  RDD_ROOTS+=("$r")
}

add_skill() {
  local name="$1"
  [[ -n "$name" ]] || return 1
  [[ -n "${SEEN[$name]:-}" ]] && return 1
  SEEN["$name"]=1
  RDD_SKILLS+=("$name")
}

# manifest_skills <root> → 每行一个 skill 名；无 package.json 或读不到 ⇒ 返回 1
manifest_skills() {
  local pj="$1/package.json"
  [[ -f "$pj" ]] || return 1
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$pj" <<'PY' 2>/dev/null
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    raise SystemExit(1)
skills = data.get("skills")
if not isinstance(skills, list):
    raise SystemExit(1)
for item in skills:
    if isinstance(item, str) and item.strip():
        print(item.strip())
PY
  elif command -v jq >/dev/null 2>&1; then
    jq -r '.skills[]? | select(type=="string")' "$pj" 2>/dev/null
  else
    return 1
  fi
}

discover_skills() {
  local root name names f
  add_root "$PROJECT_ROOT/.opencode/skills/rdd-workflow"
  add_root "$PROJECT_ROOT/.opencode/skills"
  add_root "$HOME/.agents/skills/rdd-workflow"
  add_root "${RDD_WORKFLOW_SRC:-}"

  for root in "${RDD_ROOTS[@]:-}"; do
    [[ -n "$root" ]] || continue
    [[ -f "$root/package.json" ]] || continue
    if names="$(manifest_skills "$root")"; then
      # 多根都有 manifest 时，`skills_source` 只标第一个（并集语义不受影响）
      MANIFEST_ROOT="${MANIFEST_ROOT:-$root}"
      while IFS= read -r name; do
        add_skill "$name" || true
        AUTHORITATIVE["$name"]=1
      done <<< "$names"
    else
      printf 'WARN: %s/package.json 的 skills[] 读不到（python3/jq 缺失或 JSON 损坏）⇒ 该根只用磁盘清单\n' "$root" >&2
    fi
  done

  for root in "${RDD_ROOTS[@]:-}"; do
    [[ -n "$root" ]] || continue
    for f in "$root"/skills/*/SKILL.md "$root"/*/SKILL.md; do
      [[ -f "$f" ]] || continue
      grep -qE '^[[:space:]]*deprecated:' "$f" && continue
      name="$(basename "$(dirname "$f")")"
      if add_skill "$name"; then
        DISK_ROOT="${DISK_ROOT:-$root}"
      fi
    done
  done

  local n
  for n in "${RDD_SKILLS_BUILTIN[@]}"; do
    AUTHORITATIVE["$n"]=1
  done

  if [[ ${#RDD_SKILLS[@]} -eq 0 ]]; then
    RDD_SKILLS=("${RDD_SKILLS_BUILTIN[@]}")
    SKILLS_SOURCE="builtin"
  elif [[ -n "$MANIFEST_ROOT" ]]; then
    SKILLS_SOURCE="manifest:$MANIFEST_ROOT"
  else
    SKILLS_SOURCE="disk:$DISK_ROOT"
  fi
}

discover_skills

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

# 「增强层可用」只看**上游权威集**里的技能：项目自带的无关技能不该让 installed 变真。
for skill in "${AVAILABLE[@]:-}"; do
  [[ -n "$skill" && -n "${AUTHORITATIVE[$skill]:-}" ]] && INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
done

# 布局像 rdd-workflow（有 skills/ 子目录）却一个权威名都没命中 ⇒ 很可能是清单损坏或全被改名，
# 不能只在 $SKILLS_SOURCE 里静默体现（critic SHOULD_FIX 1）。
if [[ $INSTALLED_COUNT -eq 0 && -n "${DISK_ROOT:-}" && -d "$DISK_ROOT/skills" ]]; then
  printf 'WARN: %s 有 rdd-workflow 布局，但已装技能名都不在权威集（manifest/内置）⇒ 判为未安装；请检查清单是否损坏\n' "$DISK_ROOT" >&2
fi

RDF_CLI="no"
RDF_CLI_PATH=""
if command -v rddf >/dev/null 2>&1; then
  RDF_CLI="yes"
  RDF_CLI_PATH="$(command -v rddf)"
fi

if [[ "$MODE" == "json" ]]; then
  printf '{\n'
  printf '  "installed": %s,\n' "$([[ $INSTALLED_COUNT -gt 0 ]] && echo true || echo false)"
  printf '  "project_root": "%s",\n' "$(json_escape "$PROJECT_ROOT")"
  printf '  "sources": ['
  for i in "${!SOURCES[@]}"; do
    [[ $i -gt 0 ]] && printf ', '
    printf '"%s"' "$(json_escape "${SOURCES[$i]}")"
  done
  printf '],\n'
  printf '  "rddf_cli": %s,\n' "$([[ "$RDF_CLI" == "yes" ]] && echo true || echo false)"
  printf '  "rddf_cli_path": "%s",\n' "$(json_escape "$RDF_CLI_PATH")"
  printf '  "skills_source": "%s",\n' "$(json_escape "$SKILLS_SOURCE")"
  printf '  "available_count": %d,\n' "${#AVAILABLE[@]}"
  printf '  "installed_count": %d,\n' "$INSTALLED_COUNT"
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
  if [[ $INSTALLED_COUNT -eq 0 ]]; then
    printf 'rdd-workflow 增强层: 不可用 (未安装)\n'
    printf 'project_root: %s\n' "$PROJECT_ROOT"
    printf '技能清单来源: %s\n' "$SKILLS_SOURCE"
    printf 'rddf CLI: %s\n' "$RDF_CLI"
    printf '→ 角色走内置流程，不调用任何 rdd-* skill\n'
  else
    printf 'rdd-workflow 增强层: 可用 (来源: %s)\n' "${SOURCES[*]:-none}"
    printf 'project_root: %s\n' "$PROJECT_ROOT"
    printf '技能清单来源: %s\n' "$SKILLS_SOURCE"
    printf 'rddf CLI: %s%s\n' "$RDF_CLI" "$([[ "$RDF_CLI" == "yes" ]] && printf ' (%s)' "$RDF_CLI_PATH")"
    printf '可用技能 (%d/%d；available=%d): %s\n' "$INSTALLED_COUNT" "${#RDD_SKILLS[@]}" "${#AVAILABLE[@]}" "${AVAILABLE[*]}"
    [[ ${#MISSING[@]} -gt 0 ]] && printf '缺失技能 (%d): %s\n' "${#MISSING[@]}" "${MISSING[*]}"
    printf '→ 调用前仍须逐 skill 判前置条件（frontmatter "Invoke when ..."）\n'
  fi
fi

[[ $INSTALLED_COUNT -gt 0 ]] && exit 0 || exit 1
