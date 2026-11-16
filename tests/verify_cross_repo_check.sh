#!/usr/bin/env bash
# verify_cross_repo_check.sh — 验证 scripts/cross-repo-check.sh 的五态判定与只读性
#
# 覆盖对象：
#   1. 清单校验档（CONFIG / exit 1）：非法 JSON / repos 空 / id 重复 / canonical_path 含 ~ / 清单不存在
#   2. 环境档（ENV / exit 3）：仓缺失 / 路径非仓根 / remote url 不符 / 一侧命令失败 / 输出不可比
#   3. 漂移档（DRIFT / exit 2）：两侧 owns 行不同
#   4. 一致档（OK / exit 0）与跳过档（SKIP / exit 0）
#   5. 只读性：跑前跑后 fixture 仓的 `git status --porcelain --ignored` 一致且无 __pycache__
#
# 项目形状：**全部用本地假 git 仓**（/tmp/opencode 下），不依赖真实产品仓 ⇒ 可离线跑、可重复跑。
#
# 用法：
#   tests/verify_cross_repo_check.sh
#
# 退出码：0 = 全部通过；1 = 有断言失败

set -uo pipefail

CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$CONFIG_DIR/scripts/cross-repo-check.sh"
WORK_ROOT="${BATS_TEST_TMPDIR:-/tmp/opencode}/cross-repo-check-verify.$$"

PASS=0; FAIL=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
group(){ printf '\n== %s ==\n' "$1"; }

cleanup() { rm -rf "$WORK_ROOT"; }
trap cleanup EXIT
mkdir -p "$WORK_ROOT"

LAST_OUT=""
LAST_RC=0

# 断言：退出码
assert_rc() { # desc expected_rc cmd...
  local desc="$1" exp="$2"; shift 2
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  LAST_OUT="$out"; LAST_RC="$rc"
  if [[ "$rc" == "$exp" ]]; then ok "$desc (exit=$rc)"; else bad "$desc (exit=$rc, 期望=$exp)"; printf '%s\n' "$out" | sed 's/^/       | /'; fi
}

# 断言：输出含某串
assert_out_has() { # desc needle
  if printf '%s' "$LAST_OUT" | grep -qF -- "$2"; then ok "$1"; else bad "$1（输出里没有「$2」）"; printf '%s\n' "$LAST_OUT" | sed 's/^/       | /'; fi
}
assert_out_lacks() { # desc needle
  if printf '%s' "$LAST_OUT" | grep -qF -- "$2"; then bad "$1（输出里不该出现「$2」）"; printf '%s\n' "$LAST_OUT" | sed 's/^/       | /'; else ok "$1"; fi
}

# ─── fixture 工具 ────────────────────────────────────────────────────────

# make_repo <path> <remote_url> <owns_line>
make_repo() {
  local path="$1" url="$2" owns="$3"
  rm -rf "$path"   # 幂等：允许反复重造 fixture 仓
  mkdir -p "$path"
  git init -q -b main "$path" >/dev/null 2>&1
  git -C "$path" remote add origin "$url"
  printf '%s\n' "$owns" > "$path/owns.txt"
  git -C "$path" add owns.txt
  git -C "$path" -c user.email=t@example.com -c user.name=t commit -qm init
}

# write_manifest <file> <json-body>
write_manifest() { printf '%s\n' "$2" > "$1"; }

CONSUMER_URL="git@example.com:acme/consumer.git"
PRODUCER_URL="git@example.com:acme/producer.git"
C="$WORK_ROOT/consumer"
P="$WORK_ROOT/producer"

make_repo "$C" "$CONSUMER_URL" "owns: alpha, beta"
make_repo "$P" "$PRODUCER_URL" "owns: alpha, beta"

# 标准清单：两仓齐备 + 一个 owns 核对项
manifest_ok() {
  write_manifest "$1" "{
  \"schema_version\": 1,
  \"repos\": [
    {\"id\": \"consumer\", \"url\": \"$CONSUMER_URL\", \"canonical_path\": \"$C\", \"required\": true},
    {\"id\": \"producer\", \"url\": \"$PRODUCER_URL\", \"canonical_path\": \"$P\", \"required\": true}
  ],
  \"checks\": [
    {
      \"id\": \"owns-parity\",
      \"consumer\": \"consumer\",
      \"producer\": \"producer\",
      \"consumer_cmd\": [\"cat\", \"owns.txt\"],
      \"consumer_filter\": \"^owns:\",
      \"producer_cmd\": [\"cat\", \"owns.txt\"],
      \"producer_filter\": \"^owns:\"
    }
  ]
}"
}

# ─── 1. 清单校验档（CONFIG / exit 1）──────────────────────────────────────
group "1. 清单校验（CONFIG / exit 1）"

M="$WORK_ROOT/m-badjson.json"; write_manifest "$M" "{ this is not json"
assert_rc "非法 JSON ⇒ exit 1" 1 "$SCRIPT" --workspace "$M"
assert_out_has "非法 JSON ⇒ RESULT: CONFIG" "RESULT: CONFIG"

M="$WORK_ROOT/m-empty.json"; write_manifest "$M" '{"schema_version":1,"repos":[],"checks":[]}'
assert_rc "repos 为空 ⇒ exit 1" 1 "$SCRIPT" --workspace "$M"
assert_out_has "repos 为空 ⇒ RESULT: CONFIG" "RESULT: CONFIG"

M="$WORK_ROOT/m-dupid.json"; write_manifest "$M" "{\"schema_version\":1,\"repos\":[
 {\"id\":\"x\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"$C\",\"required\":true},
 {\"id\":\"x\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"$P\",\"required\":true}],\"checks\":[]}"
assert_rc "id 重复 ⇒ exit 1" 1 "$SCRIPT" --workspace "$M"

M="$WORK_ROOT/m-tilde.json"; write_manifest "$M" "{\"schema_version\":1,\"repos\":[
 {\"id\":\"x\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"~/somewhere\",\"required\":true}],\"checks\":[]}"
assert_rc "canonical_path 含 ~ ⇒ exit 1" 1 "$SCRIPT" --workspace "$M"

M="$WORK_ROOT/m-relpath.json"; write_manifest "$M" "{\"schema_version\":1,\"repos\":[
 {\"id\":\"x\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"relative/path\",\"required\":true}],\"checks\":[]}"
assert_rc "canonical_path 相对路径 ⇒ exit 1（不接受，避免基准歧义）" 1 "$SCRIPT" --workspace "$M"

M="$WORK_ROOT/m-noschema.json"; write_manifest "$M" "{\"repos\":[{\"id\":\"x\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"$C\",\"required\":true}],\"checks\":[]}"
assert_rc "缺 schema_version ⇒ exit 1" 1 "$SCRIPT" --workspace "$M"

M="$WORK_ROOT/m-badschema.json"; write_manifest "$M" "{\"schema_version\":99,\"repos\":[{\"id\":\"x\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"$C\",\"required\":true}],\"checks\":[]}"
assert_rc "schema_version 主版本不认识 ⇒ exit 1" 1 "$SCRIPT" --workspace "$M"

assert_rc "清单文件不存在 ⇒ exit 1" 1 "$SCRIPT" --workspace "$WORK_ROOT/m-does-not-exist.json"

assert_rc "未知参数 ⇒ exit 1（USAGE）" 1 "$SCRIPT" --no-such-flag
assert_out_has "未知参数 ⇒ RESULT: USAGE" "RESULT: USAGE"

# 本仓自身条目用 "." 解析（清单里不写死机器家目录）
SELF_URL="$(git -C "$CONFIG_DIR" config --get remote.origin.url)"
M="$WORK_ROOT/m-self.json"; write_manifest "$M" "{\"schema_version\":1,\"repos\":[
 {\"id\":\"self\",\"url\":\"$SELF_URL\",\"canonical_path\":\".\",\"required\":true}],\"checks\":[]}"
assert_rc "canonical_path=\".\" ⇒ 解析为本仓自身 ⇒ exit 0" 0 "$SCRIPT" --workspace "$M"
assert_out_lacks "\".\" ⇒ 不得报 CONFIG" "RESULT: CONFIG"

# ─── 2. 环境档（ENV / exit 3）────────────────────────────────────────────
group "2. 环境不满足（ENV / exit 3）"

M="$WORK_ROOT/m-missing.json"; write_manifest "$M" "{\"schema_version\":1,\"repos\":[
 {\"id\":\"consumer\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"$C\",\"required\":true},
 {\"id\":\"producer\",\"url\":\"$PRODUCER_URL\",\"canonical_path\":\"$WORK_ROOT/nonexistent\",\"required\":true}],\"checks\":[]}"
assert_rc "required 仓缺失 ⇒ exit 3" 3 "$SCRIPT" --workspace "$M"
assert_out_has "required 仓缺失 ⇒ RESULT: ENV" "RESULT: ENV"
assert_out_has "required 仓缺失 ⇒ 输出含期望路径" "$WORK_ROOT/nonexistent"

M="$WORK_ROOT/m-subdir.json"; write_manifest "$M" "{\"schema_version\":1,\"repos\":[
 {\"id\":\"consumer\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"$C\",\"required\":true},
 {\"id\":\"producer\",\"url\":\"$PRODUCER_URL\",\"canonical_path\":\"$P/sub\",\"required\":true}],\"checks\":[]}"
mkdir -p "$P/sub"
assert_rc "canonical_path 指向仓内子目录 ⇒ exit 3" 3 "$SCRIPT" --workspace "$M"
assert_out_has "仓内子目录 ⇒ 输出点明不是仓根" "仓根"

M="$WORK_ROOT/m-remote.json"; write_manifest "$M" "{\"schema_version\":1,\"repos\":[
 {\"id\":\"consumer\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"$C\",\"required\":true},
 {\"id\":\"producer\",\"url\":\"git@example.com:acme/OTHER.git\",\"canonical_path\":\"$P\",\"required\":true}],\"checks\":[]}"
assert_rc "remote url 与清单不符 ⇒ exit 3" 3 "$SCRIPT" --workspace "$M"
assert_out_has "remote 不符 ⇒ 输出含两侧 URL" "$PRODUCER_URL"

M="$WORK_ROOT/m-cmdfail.json"; write_manifest "$M" "{\"schema_version\":1,\"repos\":[
 {\"id\":\"consumer\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"$C\",\"required\":true},
 {\"id\":\"producer\",\"url\":\"$PRODUCER_URL\",\"canonical_path\":\"$P\",\"required\":true}],\"checks\":[
 {\"id\":\"owns-parity\",\"consumer\":\"consumer\",\"producer\":\"producer\",
  \"consumer_cmd\":[\"cat\",\"owns.txt\"],\"consumer_filter\":\"^owns:\",
  \"producer_cmd\":[\"false\"],\"producer_filter\":\"^owns:\"}]}"
assert_rc "一侧命令失败 ⇒ exit 3（不是 2）" 3 "$SCRIPT" --workspace "$M"
assert_out_has "命令失败 ⇒ RESULT: ENV" "RESULT: ENV"
assert_out_lacks "命令失败 ⇒ 不得报 DRIFT" "RESULT: DRIFT"

M="$WORK_ROOT/m-emptyout.json"; write_manifest "$M" "{\"schema_version\":1,\"repos\":[
 {\"id\":\"consumer\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"$C\",\"required\":true},
 {\"id\":\"producer\",\"url\":\"$PRODUCER_URL\",\"canonical_path\":\"$P\",\"required\":true}],\"checks\":[
 {\"id\":\"owns-parity\",\"consumer\":\"consumer\",\"producer\":\"producer\",
  \"consumer_cmd\":[\"cat\",\"owns.txt\"],\"consumer_filter\":\"^owns:\",
  \"producer_cmd\":[\"cat\",\"owns.txt\"],\"producer_filter\":\"^NOPE-NEVER-MATCH\"}]}"
assert_rc "一侧过滤后为空（不可比）⇒ exit 3" 3 "$SCRIPT" --workspace "$M"

# ─── 3. 漂移档（DRIFT / exit 2）──────────────────────────────────────────
group "3. 清单漂移（DRIFT / exit 2）"

M="$WORK_ROOT/m-drift.json"; manifest_ok "$M"
make_repo "$P" "$PRODUCER_URL" "owns: alpha, GAMMA"
assert_rc "两侧 owns 不同 ⇒ exit 2" 2 "$SCRIPT" --workspace "$M"
assert_out_has "漂移 ⇒ RESULT: DRIFT" "RESULT: DRIFT"
assert_out_has "漂移 ⇒ 输出含两侧原文" "GAMMA"
assert_out_has "漂移 ⇒ 输出含 diff 头" "+++"

# 还原 producer
make_repo "$P" "$PRODUCER_URL" "owns: alpha, beta"

# ─── 4. 一致档（OK / exit 0）─────────────────────────────────────────────
group "4. 一致（OK / exit 0）"

M="$WORK_ROOT/m-ok.json"; manifest_ok "$M"
assert_rc "两侧一致 ⇒ exit 0" 0 "$SCRIPT" --workspace "$M"
assert_out_has "一致 ⇒ RESULT: OK" "RESULT: OK"
if [[ "$(printf '%s' "$LAST_OUT" | grep -c 'HEAD=')" -ge 2 ]]; then
  ok "一致 ⇒ 输出含两仓 HEAD sha"
else
  bad "一致 ⇒ 输出含两仓 HEAD sha（只出现 $(printf '%s' "$LAST_OUT" | grep -c 'HEAD=') 次）"
fi

# ─── 5. 跳过档（SKIP / exit 0）───────────────────────────────────────────
group "5. 跳过（SKIP / exit 0）"

M="$WORK_ROOT/m-skip.json"; write_manifest "$M" "{\"schema_version\":1,\"repos\":[
 {\"id\":\"consumer\",\"url\":\"$CONSUMER_URL\",\"canonical_path\":\"$C\",\"required\":true},
 {\"id\":\"optional\",\"url\":\"git@example.com:acme/optional.git\",\"canonical_path\":\"$WORK_ROOT/absent\",\"required\":false}],\"checks\":[
 {\"id\":\"owns-parity\",\"consumer\":\"consumer\",\"producer\":\"optional\",
  \"consumer_cmd\":[\"cat\",\"owns.txt\"],\"consumer_filter\":\"^owns:\",
  \"producer_cmd\":[\"cat\",\"owns.txt\"],\"producer_filter\":\"^owns:\"}]}"
assert_rc "required:false 仓缺失 ⇒ exit 0" 0 "$SCRIPT" --workspace "$M"
assert_out_has "required:false 仓缺失 ⇒ 输出含 SKIP" "SKIP"
assert_out_has "required:false 仓缺失 ⇒ RESULT: SKIP（未评估不计入一致）" "RESULT: SKIP"
assert_out_lacks "未评估 ⇒ 不得报 OK" "RESULT: OK"

# ─── 6. 只读性 ──────────────────────────────────────────────────────────
group "6. 只读性"

before_c="$(git -C "$C" status --porcelain --ignored)"
before_p="$(git -C "$P" status --porcelain --ignored)"
pycache_before="$(find "$C" "$P" -name '__pycache__' -o -name '*.pyc' | sort)"
M="$WORK_ROOT/m-readonly.json"; manifest_ok "$M"
"$SCRIPT" --workspace "$M" >/dev/null 2>&1
after_c="$(git -C "$C" status --porcelain --ignored)"
after_p="$(git -C "$P" status --porcelain --ignored)"
pycache_after="$(find "$C" "$P" -name '__pycache__' -o -name '*.pyc' | sort)"
if [[ "$before_c" == "$after_c" && "$before_p" == "$after_p" ]]; then
  ok "跑前跑后两仓 git status --porcelain --ignored 一致"
else
  bad "跑前跑后两仓 git status --porcelain --ignored 不一致"
fi
if [[ "$pycache_before" == "$pycache_after" ]]; then
  ok "跑前跑后两仓无新增 __pycache__ / *.pyc"
else
  bad "跑前跑后两仓新增了 __pycache__ / *.pyc"
fi

# ─── 汇总 ──────────────────────────────────────────────────────────────
printf '\n结果：PASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[[ "$FAIL" == "0" ]] || exit 1
