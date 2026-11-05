#!/usr/bin/env bash
# verify_arch_docs_scope.sh — 验证「architect 可写范围判定三态」与 arch-docs 目录语义
#
# 覆盖对象：
#   1. scripts/arch-docs-init.sh 的真实行为（--check / init / --dry-run）
#   2. prompts/build.md §架构文档范围（判定三态 / 目录集口径 / 治理面豁免）
#   3. prompts/critic.md、prompts/context-builder.md 的档位路径映射是否同源
#
# 项目形状：**直接复用 rdd-workflow-e2e 测试床的真实 fixture**
# （tests/_lib/test_full_workflow_fixture.bash 的 setup_fake_project /
#  write_arch_fixture / write_proposal_fixture），确保验证对象与
# arch→planner→builder→archive 真实工作流里的项目布局一致
# （docs/adr/ADR-*.md + roadmap.md + openspec/changes/* + .rddf/state/）。
#
# 用法：
#   tests/verify_arch_docs_scope.sh
#   E2E_BED_DIR=/path/to/rdd-workflow-e2e tests/verify_arch_docs_scope.sh
#
# 退出码：0 = 全部通过；1 = 有断言失败
#
# 注意：临时项目建在 ${BATS_TEST_TMPDIR:-/tmp/opencode} 下（勿用裸 /tmp）。

set -uo pipefail

CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$CONFIG_DIR/scripts/arch-docs-init.sh"
BUILD_MD="$CONFIG_DIR/prompts/build.md"
CRITIC_MD="$CONFIG_DIR/prompts/critic.md"
CTX_MD="$CONFIG_DIR/prompts/context-builder.md"
E2E_BED_DIR="${E2E_BED_DIR:-/workspace/main/rdd-workflow-e2e}"
WORK_ROOT="${BATS_TEST_TMPDIR:-/tmp/opencode}/arch-docs-scope-verify.$$"

PASS=0; FAIL=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
group(){ printf '\n== %s ==\n' "$1"; }

# 断言：命令退出码
assert_rc() { # desc expected_rc cmd...
  local desc="$1" exp="$2"; shift 2
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [[ "$rc" == "$exp" ]]; then ok "$desc (exit=$rc)"; else bad "$desc (exit=$rc, 期望=$exp)"; printf '%s\n' "$out" | sed 's/^/       | /'; fi
  LAST_OUT="$out"
}
assert_contains() { # desc needle
  if [[ "$LAST_OUT" == *"$2"* ]]; then ok "$1"; else bad "$1（输出缺 '$2'）"; printf '%s\n' "$LAST_OUT" | sed 's/^/       | /'; fi
}
assert_not_contains() { # desc needle
  if [[ "$LAST_OUT" != *"$2"* ]]; then ok "$1"; else bad "$1（输出不应含 '$2'）"; printf '%s\n' "$LAST_OUT" | sed 's/^/       | /'; fi
}
assert_file_contains() { # file needle desc
  if grep -qF -- "$2" "$1"; then ok "$3"; else bad "$3（$1 缺 '$2'）"; fi
}

# ─── 造项目：优先用 e2e 测试床的真实 fixture ────────────────────────────
build_project() { # $1 = 目标根目录
  local root="$1"
  if [[ -f "$E2E_BED_DIR/tests/_lib/test_full_workflow_fixture.bash" ]]; then
    export RDD_WORKFLOW_REPO="${RDD_WORKFLOW_REPO:-$HOME/.agents/skills/rdd-workflow}"
    # shellcheck source=/dev/null
    source "$E2E_BED_DIR/tests/_lib/test_full_workflow_fixture.bash"
    local tmp proj
    tmp="$(mktemp -d "$WORK_ROOT/e2e-fixture.XXXXXX")"
    proj="$(BATS_TEST_TMPDIR="$tmp" setup_fake_project)"     # 真实 fixture：git init + package.json（stdout = 项目根）
    write_arch_fixture "$proj"                               # 真实 fixture：docs/adr/ADR-0001 + roadmap.md
    write_proposal_fixture "$proj" "feat-verify-scope"       # 真实 fixture：openspec/changes/*
    mkdir -p "$root"; cp -a "$proj/." "$root/"
    FIXTURE_MODE="e2e-bed ($E2E_BED_DIR)"
  else
    mkdir -p "$root/docs/adr" "$root/openspec/changes/feat-verify-scope" "$root/.rddf/state"
    printf '# ADR-0001: Test Architecture\n\n**Status**: 已采纳\n' > "$root/docs/adr/ADR-0001-test-arch.md"
    printf '# Roadmap\n\n**当前阶段**: phase-1\n' > "$root/roadmap.md"
    printf '# Proposal\n\n## Why\nverify\n' > "$root/openspec/changes/feat-verify-scope/proposal.md"
    printf '# Tasks\n\n- [ ] 1. impl\n' > "$root/openspec/changes/feat-verify-scope/tasks.md"
    printf '{"name":"fake-project","version":"0.0.1"}\n' > "$root/package.json"
    FIXTURE_MODE="local-fallback（e2e 测试床不可用：$E2E_BED_DIR）"
    printf '\033[33mWARN\033[0m %s\n' "e2e 测试床不可用 → 退回本地构造的项目形状（非 e2e 真实 fixture）：$E2E_BED_DIR"
  fi
}

cleanup() { rm -rf "$WORK_ROOT"; }
trap cleanup EXIT
mkdir -p "$WORK_ROOT"

[[ -x "$SCRIPT" ]] || { echo "FATAL: $SCRIPT 不可执行"; exit 1; }

P1="$WORK_ROOT/p1"   # 态 2：无配置 + 有 docs/adr
P2="$WORK_ROOT/p2"   # 态 1：init 之后
P3="$WORK_ROOT/p3"   # 单行手写配置
P4="$WORK_ROOT/p4"   # 态 1 但声明路径全部失效
P5="$WORK_ROOT/p5"   # 配置损坏
for p in "$P1" "$P2" "$P3" "$P4" "$P5"; do build_project "$p"; done

echo "验证对象：$SCRIPT"
echo "项目形状：$FIXTURE_MODE"

# ─── 1. 态 2：无配置 + 有架构文档目录 → NOTE 接管，不是漂移 ──────────────
group "态 2（配置缺失 / 未固定写范围）"
assert_rc "无配置 + 有 docs/adr → --check exit 0（不再误判为漂移）" 0 bash "$SCRIPT" "$P1" --check
assert_contains "输出提示未配置并交给 fallback 目录集" "未配置"
assert_contains "发现的架构目录由 fallback 接管" "由 fallback 目录集接管"
assert_not_contains "不误报 STALE" "STALE:"
assert_not_contains "不误报 UNCOVERED" "UNCOVERED:"
assert_not_contains "不输出 drift 汇总行" "drift:"

# ─── 2. init → 态 1 → 往返一致 ─────────────────────────────────────────
group "态 1（配置已声明 arch_paths）"
assert_rc "init 写入配置 exit 0" 0 bash "$SCRIPT" "$P2"
assert_file_contains "$P2/.rddf/config/arch-docs.json" '"docs/adr"' "init 把 docs/adr 写进 arch_paths"
assert_rc "init 后 --check exit 0（往返一致）" 0 bash "$SCRIPT" "$P2" --check
assert_not_contains "往返检查无 NOTE（配置有效）" "NOTE:"
assert_not_contains "往返检查无 drift" "drift:"

# ─── 3. 单行手写配置不得产生假 STALE ──────────────────────────────────
group "解析器健壮性（手写 / 单行配置）"
mkdir -p "$P3/.rddf/config"
printf '{"schema_version":"arch-docs-v1","arch_paths":["docs/adr"],"exclude_paths":[],"notes":"hand written"}\n' \
  > "$P3/.rddf/config/arch-docs.json"
assert_rc "单行 JSON 配置 → --check exit 0" 0 bash "$SCRIPT" "$P3" --check
assert_not_contains "单行配置不产生假 STALE（不把 exclude_paths 当路径）" "STALE:"

# ─── 4. 态 1 且声明路径全部失效 → 真漂移 ───────────────────────────────
group "态 1 的失效路径（真漂移）"
# 假设：survey 只发现 docs/adr（e2e 床 fixture 若新增架构目录，本组需同步扩展）
assert_rc "P4 的 survey 集合 = docs/adr（显式化假设）" 0 bash "$SCRIPT" "$P4" --dry-run
assert_contains "P4 确实存在 docs/adr 且被 survey 命中" '"docs/adr"'
bash "$SCRIPT" "$P4" >/dev/null 2>&1          # 先 init → 进入态 1（配置已声明 docs/adr）
rm -rf "$P4/docs/adr"                          # 再让声明的路径失效
assert_rc "声明路径全部失效 → --check exit 2（漂移）" 2 bash "$SCRIPT" "$P4" --check
assert_contains "报出 STALE" "STALE:"
assert_contains "输出 drift 汇总行" "drift:"

# ─── 5. 配置损坏 → NOTE 损坏 + 提示修复，不算漂移 ───────────────────────
group "配置损坏"
mkdir -p "$P5/.rddf/config"
printf '{ this is not json' > "$P5/.rddf/config/arch-docs.json"
assert_rc "坏 JSON → --check exit 0（不算漂移）" 0 bash "$SCRIPT" "$P5" --check
assert_contains "提示配置损坏" "损坏"
assert_contains "建议修复" "建议修复"
# 截断但含 arch_paths 字段：必须判「损坏」而非「为空」（否则不提示修复）
P6="$WORK_ROOT/p6"; build_project "$P6"
mkdir -p "$P6/.rddf/config"
printf '{"arch_paths": ["docs/adr",' > "$P6/.rddf/config/arch-docs.json"
assert_rc "截断 JSON（含字段）→ --check exit 0（不算漂移）" 0 bash "$SCRIPT" "$P6" --check
assert_contains "截断 JSON 判为损坏（不是「为空」）" "损坏"
assert_contains "截断 JSON 仍提示修复" "建议修复"

# ─── 6. 规则文档一致性（prompts/ 与脚本语义同源）──────────────────────
group "规则文档一致性"
assert_file_contains "$BUILD_MD" "目录集口径（唯一一套，不要另立）" "build.md 定义唯一一套目录集口径"
assert_file_contains "$BUILD_MD" "治理面文件（\`~/.config/opencode/**\`" "build.md 声明治理面豁免"
assert_file_contains "$BUILD_MD" "漂移只在配置已声明" "build.md 写明漂移仅态 1 成立"
assert_file_contains "$BUILD_MD" "路径全部失效" "build.md 写明「路径全部失效」的处理（本批语义锚点）"
assert_file_contains "$BUILD_MD" "配置漂移" "build.md 写明「配置漂移」语义（本批语义锚点）"
assert_file_contains "$BUILD_MD" "--dry-run" "build.md 要求 refresh 前先 dry-run 比对（防手写条目丢失）"
assert_file_contains "$BUILD_MD" "一次成稿流程" "build.md 提供一次成稿流程聚合块（上下文收敛点）"
assert_file_contains "$BUILD_MD" "ADR 完成的标志" "build.md 定义 ADR 完成判据（闭环）"
assert_file_contains "$BUILD_MD" "arch 档审稿判据摘要" "build.md 内联 arch 档判据（供 focus 与降级自检）"
assert_file_contains "$BUILD_MD" "backlog: <improvement 名>" "build.md 允许 backlog 态占位（AC 映射暂缺可行动）"
assert_file_contains "$BUILD_MD" "固定审查者不受" "build.md 固定审查者不受「允许」列限制（权限/义务分离）"
# 角色表完整性：表必须是**连续块**（无空行/blockquote 插入），6 个角色行齐全，
# 且「固定审查者不受『允许』列限制」在表**之后**（否则表格被劈开 → Markdown 渲染断裂）
ROLE_TABLE_BLOCK=$(awk '/^\| 角色 \| 允许 \| 禁止 \| 开场报告格式 \|/{f=1} f && /^\|/{print; next} f{exit}' "$BUILD_MD")
ROLE_ROWS=$(printf '%s\n' "$ROLE_TABLE_BLOCK" | grep -cE '^\| `(architect|planner|builder|verifier|no-role|general)` \|')
if [[ "$ROLE_ROWS" == "6" ]]; then ok "角色表 6 个角色行齐全"; else bad "角色表角色行数异常（$ROLE_ROWS ≠ 6）——可能被插入内容劈开"; fi
if printf '%s\n' "$ROLE_TABLE_BLOCK" | grep -qE '^(> |$)'; then bad "角色表连续块内出现空行或 blockquote（表格被劈开）"; else ok "角色表为连续块（未被劈开）"; fi
ROLE_LAST_LINE=$(printf '%s\n' "$ROLE_TABLE_BLOCK" | tail -1 | cut -c1-12)
CLAUSE_LINE=$(grep -n "固定审查者不受" "$BUILD_MD" | head -1 | cut -d: -f1)
TABLE_LAST_LINE=$(grep -n "^| \`general\`" "$BUILD_MD" | head -1 | cut -d: -f1)
if [[ -n "$CLAUSE_LINE" && -n "$TABLE_LAST_LINE" && "$CLAUSE_LINE" -gt "$TABLE_LAST_LINE" ]]; then ok "固定审查者条款位于角色表之后"; else bad "固定审查者条款位置异常（行 $CLAUSE_LINE vs 表尾 $TABLE_LAST_LINE）"; fi
assert_file_contains "$BUILD_MD" "调研委派协议" "build.md 提供调研型 subagent 的委派前判断协议"
assert_file_contains "$BUILD_MD" "实施阶段的新发现" "build.md 定义实施中新发现的停下与路由"
assert_file_contains "$BUILD_MD" "先落记录" "build.md 规定先落反馈记录再切角色"
assert_file_contains "$BUILD_MD" "每一次窗口内的角色间自动切换都计入" "build.md 统一窗口内角色间自动切换的轮次计数"

# 防漂移：build.md 用到的 feedback kind 必须 ⊆ 产品 feedback_appender.VALID_KINDS
FEEDBACK_APPENDER="${RDD_WORKFLOW_REPO:-$HOME/.agents/skills/rdd-workflow}/_lib/feedback_appender.py"
if [[ -f "$FEEDBACK_APPENDER" ]]; then
  PRODUCT_KINDS=$(grep -oP '(?<=^VALID_KINDS = \{)[^}]*' "$FEEDBACK_APPENDER" | tr -d '"' | tr ',' '\n' | tr -d ' ' | sort -u)
  USED_KINDS=$(grep -oE -- '--kind [a-z0-9-]+' "$BUILD_MD" | awk '{print $2}' | sort -u)
  BAD_KINDS=""
  while read -r k; do [[ -z "$k" ]] && continue; echo "$PRODUCT_KINDS" | grep -qx "$k" || BAD_KINDS="$BAD_KINDS $k"; done <<< "$USED_KINDS"
  if [[ -z "$BAD_KINDS" ]]; then ok "build.md 的 feedback kind ⊆ 产品 VALID_KINDS（无自造分类）"; else bad "build.md 出现产品没有的 kind：$BAD_KINDS"; fi
else
  printf '\033[33mSKIP\033[0m %s\n' "产品 feedback_appender.py 不可用（$FEEDBACK_APPENDER）→ 跳过 kind 防漂移断言"
fi

# 防漂移：内联摘要声明的条目数必须与 critic.md 的 arch 档原始判据条数一致
CRITIC_BLOCKER_N=$(awk '/^### arch — BLOCKER 只有四类/{f=1;next} /^### arch — SHOULD_FIX/{f=0} f && /^[0-9]+\. /{c++} END{print c+0}' "$CRITIC_MD")
CRITIC_SHOULDFIX_N=$(awk '/^### arch — SHOULD_FIX/{f=1;next} /^\*\*边界与去重/{f=0} f && /^- \*\*/{c++} END{print c+0}' "$CRITIC_MD")
if [[ "$CRITIC_BLOCKER_N" == "4" ]]; then ok "critic.md arch 档 BLOCKER 仍是 4 类"; else bad "critic.md arch 档 BLOCKER 条数变了（$CRITIC_BLOCKER_N ≠ 4）——内联摘要需同步"; fi
if [[ "$CRITIC_SHOULDFIX_N" == "6" ]]; then ok "critic.md arch 档 SHOULD_FIX 仍是 6 类"; else bad "critic.md arch 档 SHOULD_FIX 条数变了（$CRITIC_SHOULDFIX_N ≠ 6）——内联摘要需同步"; fi
assert_file_contains "$BUILD_MD" "BLOCKER 四类" "内联摘要声明 BLOCKER 四类（与 critic.md 对齐）"
assert_file_contains "$BUILD_MD" "SHOULD_FIX 六类" "内联摘要声明 SHOULD_FIX 六类（与 critic.md 对齐）"
assert_file_contains "$BUILD_MD" "判定三态" "build.md 含判定三态"
assert_file_contains "$CRITIC_MD" "§架构文档范围" "critic.md 的 arch 兜底引用 build 的目录集口径"
assert_file_contains "$CTX_MD" "§架构文档范围" "context-builder.md 的 arch 映射引用同一套口径"
assert_file_contains "$BUILD_MD" "\`~/.config/opencode/commands/**\`" "治理面作用域含 commands/**"
assert_file_contains "$BUILD_MD" "行为依赖" "治理面作用域的脚本触发条件为「行为依赖」"

# ─── 汇总 ──────────────────────────────────────────────────────────────
printf '\n结果：PASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[[ "$FAIL" == "0" ]] || exit 1
