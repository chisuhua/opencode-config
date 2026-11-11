#!/usr/bin/env bash
# opencode-update.sh —— 从**本地源码**重建并替换 opencode 二进制，然后重启服务。
#
# 为什么不用 `opencode upgrade`：
#   `opencode upgrade` 走的是上游**发布版**（anomalyco/opencode 的 release）⇒ 会把源码构建
#   的二进制覆盖成发布版 ⇒ 「拉最新源码 → 构建 → 更新」这条链就断了。
#   本脚本构建的二进制 **channel=local** ⇒ opencode 自带的自动更新会**自动跳过**
#   （上游 `packages/cli/src/version.ts`：`OPENCODE_LOCAL = channel === "local"`；
#    `packages/cli/src/services/updater.ts`：local 安装时 `inspect()` 直接 return）
#   ⇒ 源码构建**不可能**被发布版顶掉。
#
# 用法：
#   scripts/opencode-update.sh            # 拉取 dev → 构建 → 安装 → 重启服务
#   scripts/opencode-update.sh --no-pull  # 只构建当前工作树（不拉取）
#   scripts/opencode-update.sh --check    # 只体检：打印将要发生的事，不改任何东西
#
# 环境变量：
#   OPENCODE_SRC     源码仓（默认 /workspace/main/opencode）
#   OPENCODE_BRANCH  分支（默认 dev）
#   OPENCODE_BUN_DIR bun 1.4.4 的安装目录（默认 ~/.local/share/bun-1.4.4）
set -euo pipefail

REPO="${OPENCODE_SRC:-/workspace/main/opencode}"
BRANCH="${OPENCODE_BRANCH:-dev}"
BIN_DIR="$HOME/.opencode/bin"
BIN="$BIN_DIR/opencode"
PULL=1
CHECK=0

for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --check) CHECK=1 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "未知参数: $arg" >&2; exit 1 ;;
  esac
done

say() { printf '%s\n' "$*"; }
fail() { printf '错误: %s\n' "$*" >&2; exit 1; }

[ -d "$REPO/.git" ] || fail "源码仓不存在: $REPO"
command -v git >/dev/null || fail "没有 git"

# ── 1. 解析并准备 bun（版本必须满足上游 packageManager）────────────────────
want_bun="$(python3 -c "
import json
d=json.load(open('$REPO/package.json'))
pm=d.get('packageManager') or ''
print(pm.split('@')[-1] if '@' in pm else '')
")"
[ -n "$want_bun" ] || fail "读不到 $REPO/package.json 的 packageManager"
bun_bin=""
if [ -x "${OPENCODE_BUN_DIR:-$HOME/.local/share/bun-$want_bun}/bin/bun" ]; then
  bun_bin="${OPENCODE_BUN_DIR:-$HOME/.local/share/bun-$want_bun}/bin/bun"
elif command -v bun >/dev/null && [ "$(bun --version)" = "$want_bun" ]; then
  bun_bin="$(command -v bun)"
fi
if [ -z "$bun_bin" ] && [ "$CHECK" -eq 0 ]; then
  say "⇒ 安装 bun $want_bun 到 ${OPENCODE_BUN_DIR:-$HOME/.local/share/bun-$want_bun}"
  bun_dir="${OPENCODE_BUN_DIR:-$HOME/.local/share/bun-$want_bun}"
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
[ -n "$bun_bin" ] || fail "找不到 bun $want_bun（可用 OPENCODE_BUN_DIR 指定；或先手动安装）"

# ── 2. 拉取（工作区脏 ⇒ 拒绝，避免把本地改动混进构建）────────────────────
# ⚠️ `bun.lock` 单独豁免：本机 registry 是 npmmirror 镜像，`bun install` 会把 lockfile 里的
#    npmjs URL 改写成镜像 URL（纯环境产物，不是源码改动）⇒ 用归一化比较精确识别并丢弃。
dirty="$( { git -C "$REPO" status --porcelain | grep -v ' bun\.lock$' | head -5; } || true )"
if [ -n "$dirty" ]; then
  say "⚠️ 源码仓有未提交改动（构建会包含它们）："
  printf '%s\n' "$dirty"
  [ "$CHECK" -eq 0 ] && fail "请先提交/暂存，或用 --check 只看计划"
fi
if [ "$PULL" -eq 1 ] && [ "$CHECK" -eq 0 ]; then
  say "⇒ 拉取 $BRANCH"
  git -C "$REPO" fetch --quiet origin "$BRANCH"
  git -C "$REPO" checkout --quiet "$BRANCH"
  git -C "$REPO" pull --ff-only --quiet origin "$BRANCH"
fi
head_sha="$(git -C "$REPO" rev-parse --short HEAD)"
say "源码: $REPO @ $BRANCH ($head_sha)"

if [ "$CHECK" -eq 1 ]; then
  say "⇒ 将要执行：bun install → build --single（channel=local）→ 安装到 $BIN → 重启服务"
  say "当前已安装版本: $("$BIN" --version 2>/dev/null || echo '未安装')"
  exit 0
fi

# ── 3. 依赖 + 构建（失败时不动现有二进制）────────────────────────────────
# ⚠️ 构建会 spawn 子进程跑 `bun run` ⇒ 必须让 **PATH 上的 bun** 也是目标版本，
#    否则子进程用的是全局 bun（版本不符时上游的 `packages/script/src/index.ts` 会直接抛错）。
export PATH="$(dirname "$bun_bin"):$PATH"
say "⇒ bun install（bun $("$bun_bin" --version)）"
( cd "$REPO" && "$bun_bin" install >/dev/null )
# lockfile 的镜像 URL 改写 ⇒ 归一化后与 HEAD 相同就丢弃（纯环境产物）
if ! git -C "$REPO" diff --quiet -- bun.lock; then
  if diff -q <(sed 's#registry\.npmmirror\.com#registry.npmjs.org#g' "$REPO/bun.lock") \
            <(git -C "$REPO" show HEAD:bun.lock) >/dev/null 2>&1; then
    git -C "$REPO" checkout -- bun.lock
    say "  （已丢弃 bun.lock 的 registry 镜像改写 —— 纯环境产物）"
  else
    say "  ⚠️ bun.lock 有**实质**改动（不止 registry 改写）⇒ 保留，请自行检查是否要提交"
  fi
fi
say "⇒ 构建（channel=local ⇒ opencode 自带自动更新会跳过它）"
( cd "$REPO" && OPENCODE_CHANNEL=local "$bun_bin" run --cwd packages/cli build --single >/dev/null )
built="$REPO/packages/cli/dist/cli-linux-x64/bin/opencode"
[ -x "$built" ] || fail "构建产物不存在: $built"

# ── 4. 安装（先备份 + 原子替换）──────────────────────────────────────────
mkdir -p "$BIN_DIR"
if [ -f "$BIN" ]; then
  cp -p "$BIN" "$BIN.bak"
  say "⇒ 已备份现二进制 → $BIN.bak"
fi
cp "$built" "$BIN.new" && chmod +x "$BIN.new" && mv "$BIN.new" "$BIN"
say "⇒ 已安装: $("$BIN" --version)"

# ── 5. 重启服务 + 自检 ───────────────────────────────────────────────────
say "⇒ 重启 opencode 服务"
command -v opencode >/dev/null && timeout 180 opencode service restart >/dev/null 2>&1 || say "（服务重启失败：手动跑 opencode service restart）"

say ""
say "完成。当前版本: $("$BIN" --version)"
say "⚠️ 不要用 \`opencode upgrade\`：它会下载上游**发布版**覆盖掉这个源码构建。"
say "⚠️ 源码仓的 \`dev\` 分支才是事实来源；上游发布版可能与它不同。"
