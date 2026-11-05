#!/usr/bin/env bash
# arch-docs-init.sh — 梳理项目架构文档存放结构，生成/更新
#   <project>/.rddf/config/arch-docs.json
#
# 用法:
#   scripts/arch-docs-init.sh [root]              # 配置缺失时梳理并写入；已存在则 ok
#   scripts/arch-docs-init.sh [root] --refresh    # 重新梳理并覆盖
#   scripts/arch-docs-init.sh [root] --check      # 只检查：路径失效 / 新目录未覆盖
#   scripts/arch-docs-init.sh [root] --dry-run    # 只打印结果，不写文件
#
# 退出码:
#   0 = ok / 已写入；--check 未发现漂移
#   1 = 参数或路径错误
#   2 = --check 发现漂移（STALE / UNCOVERED）
#      注意：漂移只在**配置已声明 arch_paths**（判定三态 第 1 态）时才成立；
#      配置缺失 / arch_paths 为空 / 配置损坏时由 fallback 目录集接管（只输出 NOTE，exit 0）
#      —— 按 prompts/build.md §架构文档范围 的判定三态。
#
# 产物 schema（arch-docs-v1）:
#   {
#     "schema_version": "arch-docs-v1",
#     "updated_at": "...",
#     "updated_by": "survey|user",
#     "arch_paths": ["docs/adr", ...],
#     "exclude_paths": ["docs/archive", ...],
#     "notes": "..."
#   }
#
# arch_paths = architect 可写的架构决策类文档目录（前缀匹配）。
# 不包含 roadmap（planner 域）；不包含代码。

set -euo pipefail

CONFIG_REL=".rddf/config/arch-docs.json"
EXCLUDE_SEGMENTS='archive|archived|legacy|deprecated|old|backup|backups|node_modules|build|dist|\.git|superpowers|templates|external|vendor|3rdparty|third_party'

ROOT=""
MODE="init"   # init | refresh | check | dry-run

for arg in "$@"; do
  case "$arg" in
    --refresh) MODE="refresh" ;;
    --check)   MODE="check" ;;
    --dry-run) MODE="dry-run" ;;
    -h|--help)
      sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    --*)
      echo "ERROR: unknown option $arg" >&2
      exit 1 ;;
    *)
      if [[ -z "$ROOT" ]]; then ROOT="$arg"; else
        echo "ERROR: multiple roots given" >&2; exit 1
      fi ;;
  esac
done

[[ -z "$ROOT" ]] && ROOT="$(pwd)"
if [[ ! -d "$ROOT" ]]; then
  echo "ERROR: not a directory: $ROOT" >&2
  exit 1
fi
ROOT="$(cd "$ROOT" && pwd -P)"
CONFIG="$ROOT/$CONFIG_REL"

# --- survey ---------------------------------------------------------------
# 规则（保守，只收明确是架构决策/设计文档的目录）：
#   1. 目录名命中 adr|adrs|decisions
#   2. 目录内存在 ADR-* 文件
#   3. 目录名命中 architecture|arch|design|designs|spec|specs|requirements|methodology|blueprints|rfc|rfcs
# 排除：路径段命中 archive|legacy|deprecated|node_modules|build|dist|.git|superpowers|templates
survey() {
  local scan_roots=()
  [[ -d "$ROOT/docs" ]] && scan_roots+=("$ROOT/docs")
  local top
  for top in adr adrs decisions architecture arch rfcs rfc designs design spec specs; do
    [[ -d "$ROOT/$top" ]] && scan_roots+=("$ROOT/$top")
  done
  [[ ${#scan_roots[@]} -eq 0 ]] && return 0

  {
    for base in "${scan_roots[@]}"; do
      find "$base" -maxdepth 4 -type d \
        \( -name node_modules -o -name build -o -name dist -o -name .git -o -name superpowers \) -prune -o \
        -type d -print 2>/dev/null
    done \
      | while IFS= read -r d; do
          rel="${d#"$ROOT"/}"
          [[ "$rel" == "$d" ]] && continue   # skip root itself
          if [[ "$rel" =~ (^|/)($EXCLUDE_SEGMENTS)(/|$) ]]; then continue; fi
          [[ "$rel" == openspec/* ]] && continue
          base="$(basename "$d")"
          keep=0
          case "$base" in
            adr|adrs|decisions|architecture|arch|design|designs|spec|specs|requirements|methodology|blueprints|rfc|rfcs)
              keep=1 ;;
          esac
          if [[ "$keep" -eq 0 ]]; then
            if find "$d" -maxdepth 1 -type f -name 'ADR-*' -print -quit 2>/dev/null | grep -q .; then
              keep=1
            fi
          fi
          if [[ "$keep" -eq 1 ]]; then echo "$rel"; fi
        done
  } | sort -u
}

# 仅保留有实际 .md 的目录（空目录不算）
filter_nonempty() {
  while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue
    if find "$ROOT/$rel" -maxdepth 2 -type f -name '*.md' -print -quit 2>/dev/null | grep -q .; then
      echo "$rel"
    fi
  done
}

# 读取已有配置中的 arch_paths（awk，容忍多行数组）
# 解析 arch-docs.json 的 arch_paths。
#   mode=paths → 每行输出一个路径
#   mode=state → 输出 ok | empty | corrupt | missing
#     ok      = 字段存在、数组闭合、至少一个元素
#     empty   = 字段存在、数组闭合、无元素（单行/多行空数组同判）
#     corrupt = 字段存在但数组未闭合（截断/损坏）
#     missing = 文件里没有 "arch_paths" 字段
arch_paths_awk() {
  [[ -f "$1" ]] || { [[ "$2" == "state" ]] && echo "missing"; return 0; }
  awk -v mode="$2" '
    # collect：扫描字符串值，遇到引号外的 "]" 即数组结束符。
    # ended / cnt 是全局标志（collect 设置，主块与 END 读取）——不要加进 collect 的形参表。
    function collect(s,   i, c, n, inq, buf, out, nxt) {
      n = length(s); inq = 0; buf = ""; out = ""; ended = 0
      for (i = 1; i <= n; i++) {
        c = substr(s, i, 1)
        if (inq) {
          if (c == "\\") {
            nxt = substr(s, ++i, 1)
            if (nxt == "n" || nxt == "t" || nxt == "r" || nxt == "b" || nxt == "f") {
              buf = buf c nxt      # 控制字符转义：保留原样（路径里不应出现）
            } else {
              buf = buf nxt        # 一般转义：反转义，得到真实路径字符
            }
            continue
          }
          if (c == "\"") { inq = 0; cnt++; out = out buf "\n"; buf = ""; continue }
          buf = buf c
        } else {
          if (c == "\"") { inq = 1; buf = ""; continue }
          if (c == "]") { ended = 1; return out }
          if (c == "{") { return out }
        }
      }
      return out
    }
    {
      line=$0
      if (!inarr) {
        if (match(line, /"arch_paths"[[:space:]]*:[[:space:]]*\[/)) {
          line = substr(line, RSTART + RLENGTH)
          inarr=1; found=1
        } else next
      }
      ended = 0
      out = collect(line)
      if (mode == "paths") printf "%s", out
      if (ended) { inarr=0; closed=1 }
    }
    END {
      if (mode == "state") {
        if (!found) print "missing"
        else if (!closed) print "corrupt"
        else if (cnt == 0) print "empty"
        else print "ok"
      }
    }
  ' "$1"
}

load_arch_paths() { arch_paths_awk "$1" paths; }
arch_paths_state() { arch_paths_awk "$1" state; }

json_array() {
  local first=1
  printf '['
  while IFS= read -r v; do
    [[ -z "$v" ]] && continue
    if [[ "$first" -eq 0 ]]; then printf ', '; fi
    printf '"%s"' "$v"
    first=0
  done
  printf ']'
}

# --- build lists ----------------------------------------------------------
ARCH_LIST="$(survey | filter_nonempty)"
if [[ -z "$ARCH_LIST" && "$MODE" != "check" ]]; then
  echo "WARN: 未发现架构文档目录；arch_paths 将为空。" >&2
  echo "WARN: 可手工编辑 $CONFIG_REL 或用 --refresh 后手改。" >&2
fi

EXCLUDE_LIST="$(printf '%s\n' docs/archive docs/legacy docs/deprecated | while IFS= read -r p; do
  if [[ -d "$ROOT/$p" ]]; then echo "$p"; fi
done)"

if [[ "$MODE" == "check" ]]; then
  rc=0
  NOTE_STATE=""
  CONFIGURED=0
  if [[ ! -f "$CONFIG" ]]; then
    echo "NOTE: $CONFIG_REL 未配置 —— architect 按 fallback 目录集判定（build.md 判定三态），不构成漂移。" >&2
    echo "      如需固定可写范围，运行 /arch-docs-init 生成。" >&2
    NOTE_STATE="未配置"
  else
    case "$(arch_paths_state "$CONFIG")" in
      ok)
        CONFIGURED=1
        ;;
      empty)
        echo "NOTE: arch_paths 为空（未配置）—— 走 fallback 目录集，不构成漂移。" >&2
        NOTE_STATE="arch_paths 为空"
        ;;
      corrupt)
        echo "NOTE: $CONFIG_REL 损坏（arch_paths 字段缺失或数组未闭合）—— 走 fallback 目录集，建议修复或重新 init。" >&2
        NOTE_STATE="损坏"
        ;;
      *)
        echo "NOTE: $CONFIG_REL 损坏（无法解析 arch_paths）—— 走 fallback 目录集，建议修复或重新 init。" >&2
        NOTE_STATE="损坏"
        ;;
    esac
  fi
  if [[ "$CONFIGURED" == "1" ]]; then
    while IFS= read -r p; do
      [[ -z "$p" ]] && continue
      if [[ ! -d "$ROOT/$p" ]]; then
        echo "STALE: $p (目录不存在)" >&2
        rc=2
      fi
    done < <(load_arch_paths "$CONFIG")
    while IFS= read -r p; do
      [[ -z "$p" ]] && continue
      if ! load_arch_paths "$CONFIG" | grep -Fxq "$p"; then
        echo "UNCOVERED: $p (新发现的架构文档目录，未写入配置)" >&2
        rc=2
      fi
    done <<< "$ARCH_LIST"
  else
    # 态 2：fallback 目录集已接管 —— survey 发现的目录都在可写范围内，不是漂移
    while IFS= read -r p; do
      [[ -z "$p" ]] && continue
      echo "NOTE: $p 未写入配置（$NOTE_STATE → 由 fallback 目录集接管，不构成漂移）" >&2
    done <<< "$ARCH_LIST"
  fi
  if [[ "$rc" -eq 0 ]]; then
    if [[ -n "$NOTE_STATE" ]]; then
      echo "ok: $CONFIG_REL (无漂移；配置$NOTE_STATE，architect 按 fallback 目录集判定)"
    else
      echo "ok: $CONFIG_REL (无漂移)"
    fi
  else
    echo "drift: $CONFIG_REL (存在 STALE / UNCOVERED)" >&2
  fi
  exit "$rc"
fi

if [[ -f "$CONFIG" && "$MODE" == "init" ]]; then
  if [[ -n "$(load_arch_paths "$CONFIG")" ]]; then
    echo "ok:   $CONFIG_REL (already exists; use --refresh to re-survey)"
    exit 0
  fi
  echo "info: $CONFIG_REL 的 arch_paths 为空，重新梳理" >&2
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
CONTENT="$(
  printf '{\n'
  printf '  "schema_version": "arch-docs-v1",\n'
  printf '  "updated_at": "%s",\n' "$NOW"
  printf '  "updated_by": "survey",\n'
  printf '  "arch_paths": %s,\n' "$(printf '%s\n' "$ARCH_LIST" | json_array)"
  printf '  "exclude_paths": %s,\n' "$(printf '%s\n' "$EXCLUDE_LIST" | json_array)"
  printf '  "notes": "architect 可写的架构决策类文档目录（前缀匹配）。结构变更后运行 /arch-docs-init --refresh。"\n'
  printf '}\n'
)"

if [[ "$MODE" == "dry-run" ]]; then
  echo "$CONTENT"
  exit 0
fi

mkdir -p "$(dirname "$CONFIG")"
printf '%s\n' "$CONTENT" > "$CONFIG"

echo "write: $CONFIG_REL"
if [[ -z "$ARCH_LIST" ]]; then
  echo "  arch_paths: []  (未发现，需手工编辑)"
else
  echo "  arch_paths:"
  printf '%s\n' "$ARCH_LIST" | sed 's/^/    - /'
fi
if [[ -n "$EXCLUDE_LIST" ]]; then
  echo "  exclude_paths:"
  printf '%s\n' "$EXCLUDE_LIST" | sed 's/^/    - /'
fi
