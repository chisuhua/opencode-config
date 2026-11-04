#!/usr/bin/env bash
# build_critic_prompt.sh
# Pre-generate a critic-prompt skeleton with 7 fields.
# Auto-fills changes_summary + review_profile (path-based) + diff_or_paths from git.
# User fills intent / focus / context / expected_format manually.
#
# Usage:
#   scripts/build_critic_prompt.sh                 # print to stdout (tracked changes only)
#   scripts/build_critic_prompt.sh --staged        # staged-only (index vs HEAD)
#   scripts/build_critic_prompt.sh --include-untracked   # also list untracked files
#   scripts/build_critic_prompt.sh --copy          # copy to clipboard (xclip / pbcopy / wl-copy)
#   scripts/build_critic_prompt.sh <ref>           # diff against <ref> (e.g. main, HEAD~1)
#
# Exit codes:
#   0 = ok
#   1 = not a git repo
#   2 = no diff (nothing to review)
#   3 = clipboard tool missing (--copy mode only)

set -euo pipefail

# --- arg parsing ---
COPY_TO_CLIPBOARD=0
STAGED_ONLY=0
INCLUDE_UNTRACKED=0
BASE_REF=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --copy)              COPY_TO_CLIPBOARD=1; shift ;;
    --staged)            STAGED_ONLY=1; shift ;;
    --include-untracked) INCLUDE_UNTRACKED=1; shift ;;
    -h|--help)
      sed -n '2,15p' "$0" | sed 's/^# //;s/^#//'
      exit 0 ;;
    *)
      BASE_REF="$1"; shift ;;
  esac
done

# --- preflight ---
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: not inside a git work tree" >&2
  exit 1
fi

# 统一在仓库根执行：从子目录调用时 git ls-files / diff 的路径与范围才完整
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# --- pick diff range ---
# default = unstaged only (working tree vs index), mirrors `git diff`
# --staged = staged only (index vs HEAD), mirrors `git diff --cached`
# <ref>   = ref..HEAD (cumulative diff between two commits)
if [[ -n "$BASE_REF" ]]; then
  DIFF_RANGE="$BASE_REF..HEAD"
  DIFF_STAT_RANGE="$BASE_REF..HEAD"
elif [[ "$STAGED_ONLY" == "1" ]]; then
  DIFF_RANGE="--cached"
  DIFF_STAT_RANGE="--cached"
else
  # default: working tree vs index (unstaged changes only)
  DIFF_RANGE=""
  DIFF_STAT_RANGE=""
fi

# --- guard: empty diff ---
# Use [[ -z $BASE_REF ]] to expand into nothing (not a literal "")
if ! diff_output=$(git diff ${BASE_REF:+${BASE_REF}..HEAD} 2>/dev/null); then
  echo "ERROR: git diff failed for range '${BASE_REF:-unstaged}'" >&2
  exit 1
fi
if [[ -z "$diff_output" ]]; then
  echo "ERROR: no diff for range '${BASE_REF:-unstaged}' (nothing to review)" >&2
  exit 2
fi

# --- for --stat, mirror the same range ---
stat_args=()
if [[ "$STAGED_ONLY" == "1" ]]; then
  stat_args+=(--cached)
elif [[ -n "$BASE_REF" ]]; then
  stat_args+=("$BASE_REF..HEAD")
fi

# --- build skeleton ---
# Filter out noise: backups, run-continuation snapshots, opencode bak files
# Each pattern must anchor on path segment boundaries ((^|/)...(/|$) or suffix $)
NOISE_RE='((^|/)backup(/|$)|(^|/)backup_v[0-9]*(/|$)|(^|/)\.omo(/|$)|(^|/)run-continuation(/|$)|\.bak[-0-9A-Za-z_]*$)'

# Extract per-file stat lines, drop summary line, drop noise
# --stat output:
#   AGENTS.md        | 84 +++++...++++-
#   2 files changed, 84 insertions(+), 1 deletion(-)
# Field layout: $1=path, $2='|', $3=N, $4=bar (multi-token but ends with +/- chars), NF=last
# Robust: strip trailing bar+digits, take first whitespace-delimited token as path
CHANGES_SUMMARY=$(git diff --stat "${stat_args[@]+${stat_args[@]}}" 2>/dev/null \
  | grep -Ev "$NOISE_RE" \
  | grep -Ev '^\s*[0-9]+ files? changed' \
  | awk 'NF>=3 {
      # first field = path (no leading whitespace in our format)
      path=$1
      printf "- %s: %s\n", path, "TODO(intent per file)"
    }' )

# untracked files (off by default; opt-in via --include-untracked)
if [[ "$INCLUDE_UNTRACKED" == "1" ]]; then
  UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null \
    | grep -Ev "$NOISE_RE" \
    | awk '{printf "- %s: TODO(new untracked file)\n", $0}' || true)
  if [[ -n "$UNTRACKED" ]]; then
    CHANGES_SUMMARY+=$'\n'"$UNTRACKED"
  fi
fi

# If filter wiped everything, surface a hint
if [[ -z "$CHANGES_SUMMARY" ]]; then
  CHANGES_SUMMARY="- (no changes after noise filter; raw git status:)"
  CHANGES_SUMMARY+=$'\n'"$(git status --short 2>/dev/null | grep -Ev "$NOISE_RE" | head -10 | sed 's/^/    /')"
fi

# --- infer review_profile from changed paths (v1.6) ---
# 档位按产物路径判，不按 role.json 判（角色会中途切换，也可能不存在）。
# 架构文档目录优先读项目配置：<repo>/.rddf/config/arch-docs.json
# 缺失时退回常见约定。
ARCH_CONFIG="$REPO_ROOT/.rddf/config/arch-docs.json"

load_json_array() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  awk -v key="\"$key\"" '
    {
      line=$0
      if (!inarr) {
        if (index(line, key) > 0 && line ~ /:[[:space:]]*\[/) {
          sub(/^.*:[[:space:]]*\[/, "", line)
          inarr=1
        } else next
      }
      while (match(line, /"[^"]+"/)) {
        print substr(line, RSTART+1, RLENGTH-2)
        line=substr(line, RSTART+RLENGTH)
      }
      if (index($0, "]") > 0) inarr=0
    }
  ' "$file"
}

mapfile -t ARCH_PATHS < <(load_json_array "$ARCH_CONFIG" arch_paths)
if [[ ${#ARCH_PATHS[@]} -eq 0 ]]; then
  ARCH_PATHS=(docs/adr docs/architecture docs/architecture/adr docs/designs docs/design)
fi
mapfile -t EXCLUDE_PATHS < <(load_json_array "$ARCH_CONFIG" exclude_paths)

under() { [[ "$1" == "$2" || "$1" == "$2"/* ]]; }

profile_for_path() {
  local p="$1" a
  for a in "${EXCLUDE_PATHS[@]:-}"; do
    [[ -z "$a" ]] && continue
    under "$p" "$a" && return 1
  done
  for a in "${ARCH_PATHS[@]}"; do
    [[ -z "$a" ]] && continue
    under "$p" "$a" && { echo arch; return 0; }
  done
  case "$p" in
    openspec/changes/*/proposal.md|openspec/changes/*/design.md|openspec/changes/*/tasks.md|openspec/changes/*/specs/*|.rddf/roadmap/*|.rddf/improvements/*)
      echo plan ;;
    src/*|include/*|tests/*|scripts/*|tools/*|cmake/*|CMakeLists.txt)
      echo build ;;
  esac
}

PROFILES=()
while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  prof=$(profile_for_path "$p" || true)
  [[ -z "$prof" ]] && continue
  for existing in "${PROFILES[@]:-}"; do
    [[ "$existing" == "$prof" ]] && prof=""
  done
  [[ -n "$prof" ]] && PROFILES+=("$prof")
done < <(printf '%s\n' "$CHANGES_SUMMARY" | sed -n 's/^- \([^:]*\):.*/\1/p')

# 固定顺序：arch → plan → build
ORDERED=()
for k in arch plan build; do
  for p in "${PROFILES[@]:-}"; do
    [[ "$p" == "$k" ]] && ORDERED+=("$p")
  done
done
if [[ ${#ORDERED[@]} -eq 0 ]]; then
  REVIEW_PROFILE="mixed  <!-- 路径无法归类，请手工指定 arch / plan / build / archive -->"
else
  REVIEW_PROFILE=$(printf '%s, ' "${ORDERED[@]}")
  REVIEW_PROFILE=${REVIEW_PROFILE%, }
fi

# escape diff for heredoc (it can contain backticks, dollars, etc. — use quoted heredoc)
DIFF_TEXT="$diff_output"

cat <<EOF
请审查以下改动：

## changes_summary
$CHANGES_SUMMARY

## review_profile
$REVIEW_PROFILE

## intent
<!-- TODO: 这次改动要解决什么问题、为什么这么做（最重要的一栏） -->

## focus（评审重点，请优先看）
<!-- TODO: 列 2-3 条架构级重点，如：
1. 是否符合 ADR-0xx 的架构立场
2. 公开契约 / 序列化格式是否会被冻错
3. 目标场景下的失败模式 / 回滚路径 -->

## diff_or_paths
\`\`\`\`diff
$DIFF_TEXT
\`\`\`\`

## context
- 相关测试: <!-- TODO -->
- 复现命令: <!-- TODO -->
- 关联 ADR / issue: <!-- TODO -->

## expected_format
请按 4 段式返回：BLOCKERS / SHOULD_FIX / NITS / 验证建议，并给出 mergeable: yes|no 与 scope_exceeded: true|false。只审架构与决策：执行细节（文档计数/格式/测试边角/护栏绕过）不要报。
EOF

# --- optional clipboard ---
if [[ "$COPY_TO_CLIPBOARD" == "1" ]]; then
  # re-emit to clipboard (cat the just-printed skeleton, excluding stderr)
  # we pipe stdin (the rendered output) back through pbcopy/xclip/wl-copy
  if command -v pbcopy >/dev/null 2>&1; then
    { cat <<EOF
请审查以下改动：

## changes_summary
$CHANGES_SUMMARY

## review_profile
$REVIEW_PROFILE

## intent
<!-- TODO -->

## focus
<!-- TODO -->

## diff_or_paths
\`\`\`\`diff
$DIFF_TEXT
\`\`\`\`

## context
- 相关测试: <!-- TODO -->
- 复现命令: <!-- TODO -->
- 关联 ADR / issue: <!-- TODO -->

## expected_format
请按 4 段式返回：BLOCKERS / SHOULD_FIX / NITS / 验证建议，并给出 mergeable: yes|no 与 scope_exceeded: true|false。只审架构与决策：执行细节（文档计数/格式/测试边角/护栏绕过）不要报。
EOF
    } | pbcopy
    echo "[copied to clipboard via pbcopy]" >&2
  elif command -v xclip >/dev/null 2>&1; then
    { cat <<EOF
请审查以下改动：

## changes_summary
$CHANGES_SUMMARY

## review_profile
$REVIEW_PROFILE

## intent
<!-- TODO -->

## focus
<!-- TODO -->

## diff_or_paths
\`\`\`\`diff
$DIFF_TEXT
\`\`\`\`

## context
- 相关测试: <!-- TODO -->
- 复现命令: <!-- TODO -->
- 关联 ADR / issue: <!-- TODO -->

## expected_format
请按 4 段式返回：BLOCKERS / SHOULD_FIX / NITS / 验证建议，并给出 mergeable: yes|no 与 scope_exceeded: true|false。只审架构与决策：执行细节（文档计数/格式/测试边角/护栏绕过）不要报。
EOF
    } | xclip -selection clipboard
    echo "[copied to clipboard via xclip]" >&2
  elif command -v wl-copy >/dev/null 2>&1; then
    { cat <<EOF
请审查以下改动：

## changes_summary
$CHANGES_SUMMARY

## review_profile
$REVIEW_PROFILE

## intent
<!-- TODO -->

## focus
<!-- TODO -->

## diff_or_paths
\`\`\`\`diff
$DIFF_TEXT
\`\`\`\`

## context
- 相关测试: <!-- TODO -->
- 复现命令: <!-- TODO -->
- 关联 ADR / issue: <!-- TODO -->

## expected_format
请按 4 段式返回：BLOCKERS / SHOULD_FIX / NITS / 验证建议，并给出 mergeable: yes|no 与 scope_exceeded: true|false。只审架构与决策：执行细节（文档计数/格式/测试边角/护栏绕过）不要报。
EOF
    } | wl-copy
    echo "[copied to clipboard via wl-copy]" >&2
  else
    echo "ERROR: --copy requested but no pbcopy/xclip/wl-copy found" >&2
    exit 3
  fi
fi
