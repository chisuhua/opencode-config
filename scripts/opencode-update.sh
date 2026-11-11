#!/usr/bin/env bash
# opencode-update.sh —— 从**本地源码**重建并替换 opencode 二进制，然后重启服务。
#
# 为什么不用 `opencode upgrade`：
#   `opencode upgrade` 走的是上游**发布版**（anomalyco/opencode 的 release）⇒ 会把源码构建
#   的二进制覆盖成发布版 ⇒ 「拉最新源码 → 构建 → 更新」这条链就断了。
#   本脚本构建的二进制 **channel=local** ⇒ opencode 自带的自动更新会**自动跳过**
#   （上游 `packages/cli/src/version.ts`：`OPENCODE_LOCAL = channel === "local"`；
#    `packages/cli/src/services/updater.ts`：local 安装时 `inspect()` 直接 return）
#   ⇒ 源码构建**不可能**被发布版顶掉。⚠️ 手动 `opencode upgrade` 仍会覆盖。
#
# 分支模型（两条分支，职责分离）：
#   dev          纯上游镜像，只做 fast-forward（默认跟踪 upstream/dev）
#   local/build  本地构建分支 = dev + 尚未被上游合并的本地改动
#                本地改动通过 `git merge feat/xxx` 合进来；脚本每次构建前
#                先把 dev 快进到上游最新，再 merge 进 local/build。
#
# 锁定版本模式：官方 release tag 不在 `dev` 上，而是 `release: vX` 提交（其父提交
#   = 打该版本时 `dev` 的提交）。锁定 = 把构建固定到那个父提交，并在本地打一个
#   `local/v<版本>` tag（指向同一个提交）。锁定期间只构建**纯官方版本**，
#   不包含 local/build 的本地改动（`--unlock` 恢复）。
set -euo pipefail

usage() {
  cat <<'EOF'
opencode-update.sh —— 从本地源码重建并替换 opencode 二进制，然后重启服务。

用法:
  scripts/opencode-update.sh                # 更新 dev → 合并到 local/build → 构建
  scripts/opencode-update.sh --no-pull      # 不拉取上游，只合并当前 dev 后构建
  scripts/opencode-update.sh --check        # 只体检：打印将要发生的事，不改任何东西

分支模型:
  dev          纯上游镜像（fast-forward）
  local/build  构建分支 = dev + 本地未合并改动（脚本只做 merge dev，不动本地提交）

锁定版本（把构建固定到某个官方发布版本对应的 dev 提交）:
  scripts/opencode-update.sh --lock 2.2.5   # 锁定并构建（创建本地 dev tag local/v2.2.5）
  scripts/opencode-update.sh --unlock       # 解除锁定，回到 dev + local/build（并构建）
  scripts/opencode-update.sh --list         # 列出最新 20 个官方版本 / 对应 dev 提交 / 本地 tag / 当前锁
  scripts/opencode-update.sh --list --all   # 列出全部官方版本

  锁定期间只构建纯官方版本，不含 local/build 的本地改动（--unlock 恢复）

环境变量:
  OPENCODE_SRC           源码仓（默认 /workspace/main/opencode）
  OPENCODE_BRANCH        上游跟踪分支（默认 dev）
  OPENCODE_BUILD_BRANCH  本地构建分支（默认 local/build）
  OPENCODE_REMOTE        上游远程（默认 upstream，没有则 origin）
  OPENCODE_UPDATE_STATE  锁文件目录（默认 ~/.local/state/opencode-update）
  OPENCODE_BUN_DIR       bun 安装目录（默认 ~/.local/share/bun-<packageManager 版本>）
EOF
}

REPO="${OPENCODE_SRC:-/workspace/main/opencode}"
BRANCH="${OPENCODE_BRANCH:-dev}"
BUILD_BRANCH="${OPENCODE_BUILD_BRANCH:-local/build}"
REMOTE="${OPENCODE_REMOTE:-}"
BIN_DIR="$HOME/.opencode/bin"
BIN="$BIN_DIR/opencode"
STATE_DIR="${OPENCODE_UPDATE_STATE:-$HOME/.local/state/opencode-update}"
LOCK_FILE="$STATE_DIR/lock.json"
PULL=1
CHECK=0
LIST=0
LIST_ALL=0
UNLOCK=0
LOCK_VERSION=""

say() { printf '%s\n' "$*"; }
fail() { printf '错误: %s\n' "$*" >&2; exit 1; }
short() { printf '%.10s' "$1"; }

# 本机到 github 的 TLS 偶发中断（实测 GnuTLS recv error）⇒ fetch 重试三次
fetch_retry() {
  local i
  for i in 1 2 3; do
    if git -C "$REPO" fetch "$@"; then
      return 0
    fi
    if [ "$i" -lt 3 ]; then
      sleep 2
    fi
  done
  return 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-pull) PULL=0; shift ;;
    --check) CHECK=1; shift ;;
    --list) LIST=1; shift ;;
    --all) LIST_ALL=1; shift ;;
    --unlock) UNLOCK=1; shift ;;
    --lock)
      [ "$#" -ge 2 ] || fail "--lock 需要一个版本号（如 --lock 2.2.5）"
      LOCK_VERSION="${2#v}"
      shift 2
      ;;
    --lock=*)
      LOCK_VERSION="${1#--lock=}"
      LOCK_VERSION="${LOCK_VERSION#v}"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) fail "未知参数: $1" ;;
  esac
done

[ -d "$REPO/.git" ] || fail "源码仓不存在: $REPO"
command -v git >/dev/null || fail "没有 git"
command -v python3 >/dev/null || fail "没有 python3（解析 packageManager / 锁文件需要）"
[ "$LIST_ALL" -eq 1 ] && [ "$LIST" -eq 0 ] && fail "--all 只能和 --list 一起用"
[ "$UNLOCK" -eq 1 ] && [ -n "$LOCK_VERSION" ] && fail "--unlock 与 --lock 不能同时使用"
[ "$BUILD_BRANCH" != "$BRANCH" ] || fail "OPENCODE_BUILD_BRANCH 不能等于跟踪分支 $BRANCH（本地改动会污染上游镜像）"

if [ -z "$REMOTE" ]; then
  if git -C "$REPO" remote get-url upstream >/dev/null 2>&1; then
    REMOTE=upstream
  else
    REMOTE=origin
  fi
fi

release_tags() {
  git -C "$REPO" tag -l 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V
}

# 判断「对应 dev 提交」用的 ref：优先上游跟踪 ref（本地 dev 落后也不影响祖先判断）
dev_ref() {
  local r
  for r in "refs/remotes/$REMOTE/$BRANCH" "refs/remotes/upstream/$BRANCH" "refs/heads/$BRANCH"; do
    if git -C "$REPO" rev-parse --verify --quiet "$r" >/dev/null; then
      printf '%s' "$r"
      return 0
    fi
  done
  return 1
}

read_pm_version() {
  python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
pm = d.get("packageManager") or ""
print(pm.split("@")[-1] if "@" in pm else "")
'
}

read_lock_state() {
  LOCK_VER=""
  LOCK_TAG=""
  LOCK_SHA=""
  [ -f "$LOCK_FILE" ] || return 0
  local out
  out="$(python3 -c '
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(1)
print(d.get("version") or "")
print(d.get("tag") or "")
print(d.get("commit") or "")
' "$LOCK_FILE")" || fail "锁文件损坏: $LOCK_FILE（用 --unlock 丢弃）"
  LOCK_VER="$(printf '%s\n' "$out" | sed -n '1p')"
  LOCK_TAG="$(printf '%s\n' "$out" | sed -n '2p')"
  LOCK_SHA="$(printf '%s\n' "$out" | sed -n '3p')"
  if [ -z "$LOCK_VER" ] || [ -z "$LOCK_TAG" ] || [ -z "$LOCK_SHA" ]; then
    fail "锁文件字段不全: $LOCK_FILE（用 --unlock 丢弃）"
  fi
}

write_lock() {
  local ver="$1" tag="$2" sha="$3"
  mkdir -p "$STATE_DIR"
  python3 - "$LOCK_FILE" "$ver" "$tag" "$sha" <<'PY'
import datetime, json, sys
path, ver, tag, sha = sys.argv[1:5]
data = {
    "version": ver,
    "upstream_tag": "v" + ver,
    "tag": tag,
    "commit": sha,
    "locked_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY
}

# 官方 release tag 的提交是 `release: vX`，它的**父提交**就是打该版本时 dev 的提交。
# 校验父提交确实在 dev 历史里 —— 老版本（v0.x / v1.x）的 release 不在 dev 上，直接拒绝。
resolve_release_commit() {
  local ver="$1" up="v$1" base ref
  if ! git -C "$REPO" rev-parse --verify --quiet "refs/tags/$up" >/dev/null; then
    [ "$CHECK" -eq 0 ] || fail "本地没有 tag $up（--check 不改仓库）⇒ 去掉 --check 让它自动拉取"
    [ "$PULL" -eq 1 ] || fail "本地没有 tag $up（--no-pull 不拉取）⇒ 去掉 --no-pull"
    say "⇒ 拉取 tag $up（远程 $REMOTE）"
    fetch_retry --quiet "$REMOTE" "refs/tags/$up:refs/tags/$up" \
      || fail "拉取 $up 失败（网络问题，或 $REMOTE 上没有这个版本？用 --list 看可用版本）"
  fi
  base="$(git -C "$REPO" rev-parse --verify --quiet "$up^")" || fail "无法解析 $up 的父提交"
  ref="$(dev_ref)" || fail "找不到 $BRANCH 的跟踪 ref"
  git -C "$REPO" merge-base --is-ancestor "$base" "$ref" \
    || fail "官方 $up 对应的提交 $(short "$base") 不在 $BRANCH 历史中（老版本或历史被改写）⇒ 换一个版本（--list 看可锁的）"
  printf '%s' "$base"
}

list_releases() {
  local devref tags total limit t ver base ltag lsha mark
  devref="$(dev_ref)" || fail "找不到 $BRANCH 的跟踪 ref（先 git fetch $REMOTE $BRANCH）"
  if [ "$PULL" -eq 1 ] && [ "$CHECK" -eq 0 ]; then
    say "⇒ 拉取 $REMOTE 的 tags（--no-pull 可跳过）"
    fetch_retry --quiet --tags "$REMOTE" 2>/dev/null || say "⚠️ 拉取 tags 失败 ⇒ 用本地已有 tags"
  fi
  tags="$(release_tags)"
  total="$(printf '%s\n' "$tags" | grep -c . || true)"
  [ "$total" -gt 0 ] || fail "本地没有 opencode release tag（去掉 --no-pull 重试）"
  limit=20
  [ "$LIST_ALL" -eq 1 ] && limit="$total"

  printf '%-12s %-16s %s\n' "官方版本" "对应 dev commit" "本地 tag"
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    ver="${t#v}"
    base="$(git -C "$REPO" rev-parse --verify --quiet "$t^" 2>/dev/null || true)"
    if [ -n "$base" ] && git -C "$REPO" merge-base --is-ancestor "$base" "$devref" 2>/dev/null; then
      ltag="local/v$ver"
      lsha="$(git -C "$REPO" rev-parse --verify --quiet "refs/tags/$ltag" 2>/dev/null || true)"
      mark=""
      [ "$ver" = "$LOCK_VER" ] && mark="  *当前锁"
      if [ -n "$lsha" ]; then
        printf '%-12s %-16s %s (%s)%s\n' "$t" "$(short "$base")" "$ltag" "$(short "$lsha")" "$mark"
      else
        printf '%-12s %-16s %s\n' "$t" "$(short "$base")" "—"
      fi
    else
      printf '%-12s %-16s %s\n' "$t" "—" "（不在 $BRANCH 历史中，不可锁定）"
    fi
  done < <(printf '%s\n' "$tags" | tail -n "$limit")

  if [ "$LIST_ALL" -eq 0 ] && [ "$total" -gt 20 ]; then
    say "（只显示最新 20 个；共 $total 个，--list --all 显示全部）"
  fi
  if [ -n "$LOCK_TAG" ]; then
    say "当前锁: 官方 v$LOCK_VER → $LOCK_TAG @ $(short "$LOCK_SHA")"
  else
    say "当前锁: 无（构建 $BUILD_BRANCH = $BRANCH + 本地改动）"
  fi
}

# 构建会切换分支 ⇒ 退出时（含失败）切回原来的分支/提交；合并冲突则先 abort
restore_source_ref() {
  local merge_head
  merge_head="$(git -C "$REPO" rev-parse --git-path MERGE_HEAD 2>/dev/null || true)"
  if [ -n "$merge_head" ] && [ -f "$merge_head" ]; then
    git -C "$REPO" merge --abort >/dev/null 2>&1 || true
  fi
  if [ -n "${ORIG_REF:-}" ]; then
    # 上游 build.ts 会跑 `bun install`（拉 @opentui/core / @opencode/pty）⇒ 会改写 bun.lock；
    # 切换 ref 前必须还原，否则 checkout 会被它挡住（纯构建环境产物，不是源码改动）。
    git -C "$REPO" checkout -- bun.lock >/dev/null 2>&1 || true
    git -C "$REPO" checkout --quiet "$ORIG_REF" 2>/dev/null \
      || say "⚠️ 未能切回原分支 $ORIG_REF（请手动: git -C $REPO checkout $ORIG_REF）"
  fi
}

# 切换 ref 前必须没有跟踪文件的实质改动；registry 镜像改写直接丢弃。
# 参数 $1=允许失败（fail）的描述前缀
discard_registry_only_lockfile() {
  git -C "$REPO" diff --quiet -- bun.lock && return 0
  if diff -q <(sed 's#registry\.npmmirror\.com#registry.npmjs.org#g' "$REPO/bun.lock") \
            <(git -C "$REPO" show HEAD:bun.lock) >/dev/null 2>&1; then
    git -C "$REPO" checkout -- bun.lock
    return 0
  fi
  fail "bun.lock 有实质改动，无法切换分支/版本（先 git -C $REPO checkout -- bun.lock）"
}

read_lock_state

if [ "$LIST" -eq 1 ]; then
  list_releases
  exit 0
fi

if [ "$UNLOCK" -eq 1 ]; then
  if [ -n "$LOCK_TAG" ]; then
    say "⇒ 解除锁定: 官方 v$LOCK_VER → $LOCK_TAG @ $(short "$LOCK_SHA")"
  else
    say "⇒ 当前没有锁定"
  fi
  if [ "$CHECK" -eq 1 ]; then
    say "  （--check：不会删除锁文件 $LOCK_FILE）"
  else
    rm -f "$LOCK_FILE"
    say "⇒ 已解锁：之后构建 $BUILD_BRANCH（= $BRANCH + 本地改动）"
  fi
  LOCK_VER=""
  LOCK_TAG=""
  LOCK_SHA=""
fi

if [ -n "$LOCK_VERSION" ]; then
  case "$LOCK_VERSION" in
    ""|*[!0-9.]*|.*|*.|*..*) fail "版本号格式不对: $LOCK_VERSION（期望如 2.2.5）" ;;
  esac
  base="$(resolve_release_commit "$LOCK_VERSION")"
  ltag="local/v$LOCK_VERSION"
  if [ "$CHECK" -eq 1 ]; then
    say "⇒ 将要锁定: 官方 v$LOCK_VERSION → dev 提交 $(short "$base")"
    say "  将创建本地 tag $ltag 并写锁文件 $LOCK_FILE（--check 不落盘）"
    LOCK_VER="$LOCK_VERSION"
    LOCK_TAG="$ltag"
    LOCK_SHA="$base"
  else
    existing="$(git -C "$REPO" rev-parse --verify --quiet "refs/tags/$ltag" 2>/dev/null || true)"
    if [ -n "$existing" ]; then
      [ "$existing" = "$base" ] \
        || fail "本地 tag $ltag 已存在但指向 $(short "$existing")（期望 $(short "$base")）⇒ 人工确认后 git tag -d $ltag 再重锁"
    else
      git -C "$REPO" tag "$ltag" "$base"
      say "⇒ 已创建本地 dev tag: $ltag → $(short "$base")"
    fi
    write_lock "$LOCK_VERSION" "$ltag" "$base"
    LOCK_VER="$LOCK_VERSION"
    LOCK_TAG="$ltag"
    LOCK_SHA="$base"
    say "⇒ 已锁定: 官方 v$LOCK_VERSION → $ltag @ $(short "$base")"
  fi
fi

# ── 工作区脏 ⇒ 拒绝（避免把本地改动混进构建）────────────────────────────
# ⚠️ `bun.lock` 单独豁免：本机 registry 是 npmmirror 镜像，`bun install` 会把 lockfile 里的
#    npmjs URL 改写成镜像 URL（纯环境产物，不是源码改动）⇒ 用归一化比较精确识别并丢弃。
dirty="$( { git -C "$REPO" status --porcelain | grep -v ' bun\.lock$' | head -5; } || true )"
if [ -n "$dirty" ]; then
  say "⚠️ 源码仓有未提交改动（构建会包含它们）："
  printf '%s\n' "$dirty"
  [ "$CHECK" -eq 0 ] && fail "请先提交/暂存，或用 --check 只看计划"
fi

# ── 切到构建目标：锁定的 tag（detached）或本地构建分支 ──────────────────
if [ -n "$LOCK_TAG" ]; then
  if [ "$CHECK" -eq 0 ]; then
    if ! git -C "$REPO" rev-parse --verify --quiet "refs/tags/$LOCK_TAG" >/dev/null; then
      fail "锁定的本地 tag 不存在: $LOCK_TAG（被删了？重新 --lock v$LOCK_VER 或 --unlock）"
    fi
    actual="$(git -C "$REPO" rev-parse --verify "refs/tags/$LOCK_TAG^{commit}")"
    [ "$actual" = "$LOCK_SHA" ] \
      || fail "锁文件与本地 tag 不一致（$(short "$LOCK_SHA") vs $(short "$actual")）⇒ 重新 --lock v$LOCK_VER"
    discard_registry_only_lockfile
    ORIG_REF="$(git -C "$REPO" symbolic-ref --quiet --short HEAD || git -C "$REPO" rev-parse HEAD)"
    trap restore_source_ref EXIT
    say "⇒ 切换到锁定版本: $LOCK_TAG（detached）"
    git -C "$REPO" checkout --quiet --detach "refs/tags/$LOCK_TAG"
  fi
else
  if [ "$CHECK" -eq 0 ]; then
    discard_registry_only_lockfile
    ORIG_REF="$(git -C "$REPO" symbolic-ref --quiet --short HEAD || git -C "$REPO" rev-parse HEAD)"
    trap restore_source_ref EXIT
    if git -C "$REPO" rev-parse --verify --quiet "refs/heads/$BUILD_BRANCH" >/dev/null; then
      git -C "$REPO" checkout --quiet "$BUILD_BRANCH"
    else
      say "⇒ 创建本地构建分支 $BUILD_BRANCH（基于 $BRANCH）"
      git -C "$REPO" checkout --quiet -b "$BUILD_BRANCH" "$BRANCH"
    fi
    if [ "$PULL" -eq 1 ]; then
      say "⇒ 更新 $BRANCH（$REMOTE/$BRANCH）"
      fetch_retry --quiet "$REMOTE" "$BRANCH:$BRANCH" \
        || fail "拉取/快进 $BRANCH 失败（网络问题，或本地 $BRANCH 有分叉？它必须保持纯上游镜像）"
    fi
    say "⇒ 合并 $BRANCH → $BUILD_BRANCH"
    if ! git -C "$REPO" merge --no-edit "$BRANCH"; then
      fail "合并冲突：$BRANCH → $BUILD_BRANCH 未自动完成（已中止合并）⇒ 手动解决后重跑"
    fi
  fi
fi

# ── 构建目标描述 + 读取该提交要求的 bun 版本 ─────────────────────────────
if [ "$CHECK" -eq 1 ]; then
  if [ -n "$LOCK_TAG" ]; then
    PKG_REF="$LOCK_SHA"
    target_desc="$REPO @ $LOCK_TAG（锁定自官方 v$LOCK_VER，$(short "$LOCK_SHA")）"
    lock_note="⚠️ 锁定模式只构建纯官方版本，不含 $BUILD_BRANCH 的本地改动"
  else
    if git -C "$REPO" rev-parse --verify --quiet "refs/heads/$BUILD_BRANCH" >/dev/null; then
      PKG_REF="refs/heads/$BUILD_BRANCH"
      target_desc="$REPO @ $BUILD_BRANCH（当前 $(short "$(git -C "$REPO" rev-parse "$PKG_REF")")）"
    else
      PKG_REF="refs/heads/$BRANCH"
      target_desc="$REPO @ $BUILD_BRANCH（尚未创建，将基于 $BRANCH）"
    fi
    lock_note="⇒ 将要：fetch $REMOTE/$BRANCH → 快进 $BRANCH → 合并到 $BUILD_BRANCH → 构建"
  fi
  say "源码: $target_desc"
  say "$lock_note"
  want_bun="$(git -C "$REPO" show "$PKG_REF:package.json" 2>/dev/null | read_pm_version)" || true
else
  head_sha="$(git -C "$REPO" rev-parse --short HEAD)"
  if [ -n "$LOCK_TAG" ]; then
    target_desc="$REPO @ $LOCK_TAG（锁定自官方 v$LOCK_VER，$head_sha）"
  else
    target_desc="$REPO @ $BUILD_BRANCH（= $BRANCH + 本地改动，$head_sha）"
  fi
  say "源码: $target_desc"
  want_bun="$(read_pm_version < "$REPO/package.json")" || true
fi
[ -n "$want_bun" ] || fail "读不到目标提交 package.json 的 packageManager"

bun_dir="${OPENCODE_BUN_DIR:-$HOME/.local/share/bun-$want_bun}"
bun_bin=""
if [ -x "$bun_dir/bin/bun" ]; then
  bun_bin="$bun_dir/bin/bun"
elif command -v bun >/dev/null && [ "$(bun --version)" = "$want_bun" ]; then
  bun_bin="$(command -v bun)"
fi
if [ -z "$bun_bin" ] && [ "$CHECK" -eq 0 ]; then
  say "⇒ 安装 bun $want_bun 到 $bun_dir"
  mkdir -p "$bun_dir/bin"
  zip="$bun_dir/bin/bun.zip"
  url="https://github.com/oven-sh/bun/releases/download/bun-v$want_bun/bun-linux-x64.zip"
  total="$( { curl -fsSLI "$url" 2>/dev/null | awk 'tolower($1)=="content-length:"{v=$2}END{print v}' | tail -1; } || true )"
  for i in 1 2 3 4 5 6 7 8; do
    curl -fsSL -C - -o "$zip" "$url" 2>/dev/null || true
    sz="$(stat -c%s "$zip" 2>/dev/null || echo 0)"
    [ -n "$total" ] && [ "$sz" -ge "$total" ] && break
    sleep 2
  done
  ( cd "$bun_dir/bin" && unzip -o -q bun.zip && chmod +x bun-linux-x64/bun && mv bun-linux-x64/bun ./bun && rm -rf bun-linux-x64 bun.zip )
  bun_bin="$bun_dir/bin/bun"
fi
if [ "$CHECK" -eq 0 ]; then
  [ -n "$bun_bin" ] || fail "找不到 bun $want_bun（可用 OPENCODE_BUN_DIR 指定；或先手动安装）"
fi

if [ "$CHECK" -eq 1 ]; then
  if [ -n "$bun_bin" ]; then
    bun_desc="bun $("$bun_bin" --version)（已安装）"
  else
    bun_desc="bun $want_bun（尚未安装，执行时会自动下载到 $bun_dir）"
  fi
  say "构建工具: $bun_desc"
  say "⇒ 将要执行：bun install → build --single（channel=local）→ 安装到 $BIN → 重启服务"
  say "当前已安装版本: $("$BIN" --version 2>/dev/null || echo '未安装')"
  exit 0
fi

# ── 依赖 + 构建（失败时不动现有二进制）──────────────────────────────────
# ⚠️ 构建会 spawn 子进程跑 `bun run` ⇒ 必须让 **PATH 上的 bun** 也是目标版本，
#    否则子进程用的是全局 bun（版本不符时上游的 `packages/script/src/index.ts` 会直接抛错）。
export PATH="$(dirname "$bun_bin"):$PATH"
say "⇒ bun install（bun $("$bun_bin" --version)）"
( cd "$REPO" && "$bun_bin" install >/dev/null )
# lockfile 的镜像 URL 改写 ⇒ 丢弃（纯环境产物）；实质改动同样还原，避免脏了构建分支
if ! git -C "$REPO" diff --quiet -- bun.lock; then
  if diff -q <(sed 's#registry\.npmmirror\.com#registry.npmjs.org#g' "$REPO/bun.lock") \
            <(git -C "$REPO" show HEAD:bun.lock) >/dev/null 2>&1; then
    git -C "$REPO" checkout -- bun.lock
    say "  （已丢弃 bun.lock 的 registry 镜像改写 —— 纯环境产物）"
  else
    git -C "$REPO" checkout -- bun.lock
    say "  ⚠️ bun.lock 被 bun 改写（非 registry）⇒ 已还原（构建分支不提交任何东西）"
  fi
fi
say "⇒ 构建（channel=local ⇒ opencode 自带自动更新会跳过它）"
( cd "$REPO" && OPENCODE_CHANNEL=local "$bun_bin" run --cwd packages/cli build --single >/dev/null )
built="$REPO/packages/cli/dist/cli-linux-x64/bin/opencode"
[ -x "$built" ] || fail "构建产物不存在: $built"

# ── 安装（先备份 + 原子替换）────────────────────────────────────────────
mkdir -p "$BIN_DIR"
if [ -f "$BIN" ]; then
  cp -p "$BIN" "$BIN.bak"
  say "⇒ 已备份现二进制 → $BIN.bak"
fi
cp "$built" "$BIN.new" && chmod +x "$BIN.new" && mv "$BIN.new" "$BIN"
say "⇒ 已安装: $("$BIN" --version)"

# 先在重启前恢复源码仓：重启会杀掉本会话的服务进程，不能依赖 EXIT trap 兜底
BUILT_SHA="$(git -C "$REPO" rev-parse HEAD)"
say "⇒ 恢复源码仓到原分支"
restore_source_ref
ORIG_REF=""

# ── 重启服务 + 自检 ─────────────────────────────────────────────────────
say "⇒ 重启 opencode 服务"
command -v opencode >/dev/null && timeout 180 opencode service restart >/dev/null 2>&1 || say "（服务重启失败：手动跑 opencode service restart）"

say ""
say "完成。当前版本: $("$BIN" --version)"
if [ -n "$LOCK_TAG" ]; then
  say "源码锁定: 官方 v$LOCK_VER → $LOCK_TAG @ $(short "$LOCK_SHA")（纯官方，不含本地改动）"
else
  say "源码: $BUILD_BRANCH（= $BRANCH + 本地改动 @ $(short "$BUILT_SHA")）"
fi
say "⚠️ 不要用 \`opencode upgrade\`：它会下载上游**发布版**覆盖掉这个源码构建。"
say "⚠️ 锁文件: $LOCK_FILE（--list 查看 / --unlock 解除）"
