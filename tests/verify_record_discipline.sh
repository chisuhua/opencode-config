#!/usr/bin/env bash
# tests/verify_record_discipline.sh — **记录纪律**守卫（7 条判据）
#
# 由来：2026-11-19 的多 change 收口会话里，实现层没出错，**出错的全是记录与判据层**。
# 7 类错误各配一条机械判据（同源实现：rdd-workflow-e2e 的 tests/integration/test_evidence_discipline.bats，
# 那边已用**历史快照回归**证明判别力）。本文件把它们搬进 `bun test tests/` ⇒ 提交门能拦。
#
#   C1 判据可机判      ：标「逐字」的 AC 字面量必须在该 AC 声称的语料里命中（排除 change 自身目录）
#   C2 勾选要有证据    ：`- [x] AC…` 必须有 `> **验收证据**` 注记或 `.rddf/reviews/<name>*`
#   C3 勘误要自足      ：「勘误（…）」块必须含权威源 + 原文位置
#   C4 过期段要标注    ：观察报告里 pending 与已确认并存 ⇒ 必须有取代标注
#   C5 活文档指针不悬空：`docs/adr/**` / `.rddf/improvements/**` 的 change 指针必须存在
#   C6 commit 级归因要带命令：含提交语境的「未改/未碰/只碰/只改」必须给 `git show|git diff|按文件归属`
#   C7 门槛已到要带指针：「已到/已达标」+150 的断言必须同 bullet 给取数指针
#
# 保鲜期（`RECORD_EPOCH`，默认 2026-11-19）：只检查该日之后**被动过**的文件 ——
# 这些约定自该日建立；本仓惯例是历史记述不回改 ⇒ 对存量判红没有修复路径。
#
# 用法：
#   bash tests/verify_record_discipline.sh            # 检查本仓（exit 0 = 干净）
#   bash tests/verify_record_discipline.sh --selftest # 判别力自测（每条判据必须能报出反例）
#   RECORD_EPOCH=1970-01-01 bash tests/verify_record_discipline.sh   # 关掉保鲜期（历史快照回归用）
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EPOCH="${RECORD_EPOCH:-2026-11-19}"
MODE="${1:-check}"
FAILS=0
TOUCHED=""

note_fail() { printf '%s\n' "$*" >&2; FAILS=$((FAILS + 1)); }
is_git_repo() { git -C "$1" rev-parse --git-dir >/dev/null 2>&1; }

# 一次 git log + 一次 git status 预计算「自 EPOCH 起被动过的文件」（不要逐文件跑 git）
precompute_touched() {
    local root="$1"
    TOUCHED=""
    if is_git_repo "$root"; then
        TOUCHED="$(mktemp)"
        git -C "$root" log --since="$EPOCH 00:00:00" --name-only --format= 2>/dev/null \
            | sed '/^$/d' | sed "s#^#$root/#" | sort -u > "$TOUCHED"
        git -C "$root" status --porcelain 2>/dev/null \
            | awk '{ $1=""; sub(/^ +/, ""); n=split($0, a, " -> "); print a[n] }' \
            | sed "s#^#$root/#" | sort -u >> "$TOUCHED"
        sort -u -o "$TOUCHED" "$TOUCHED"
    fi
}

# 非 git 目录（自测用的假树 / 归档快照）⇒ 视为"全部新"（**不能变成"全部跳过"**）
touched() {
    local f="$1"
    [[ -z "$TOUCHED" ]] && return 0
    grep -qxF -- "$f" "$TOUCHED"
}

# 判据空转保护：每个 check 都记一次被检查文件数；全程为 0 ⇒ 判据恒绿 ⇒ 直接红
SEEN=0
seen() { SEEN=$((SEEN + 1)); }

# ── C1 判据可机判 ────────────────────────────────────────────
check_c1() {
    local root="$1" d props row lit hits d_abs
    while IFS= read -r d; do
        props="$d/proposal.md"
        [[ -f "$props" ]] || continue
        grep -qE '^## (验收标准|Acceptance)' "$props" || continue
        touched "$props" || continue
        seen
        d_abs="$d"
        while IFS= read -r row; do
            grep -q '逐字' <<<"$row" || continue
            local -a inc=(--include='*.md' --include='*.ts' --include='*.sh' --include='*.json' --include='*.jsonc')
            if grep -qE '测试源码|源码|代码文件|代码里' <<<"$row"; then
                inc=(--include='*.ts' --include='*.sh' --include='*.json' --include='*.jsonc')
            elif grep -qE '文档|报告|prompt' <<<"$row"; then
                inc=(--include='*.md')
            fi
            while IFS= read -r lit; do
                [[ -n "$lit" ]] || continue
                grep -qE '<[^>]*>|…|\.\.\.' <<<"$lit" && continue
                # ⚠ **排除守卫自身的文件**：本脚本的 --selftest 夹具里含有这些字面量，
                #   不排除就会**自己满足自己**（"判据匹配到自身" 是本会话第 4 条教训）。
                hits="$(grep -rlF "${inc[@]}" --exclude-dir=.git --exclude-dir=node_modules \
                          --exclude=verify_record_discipline.sh --exclude=record-discipline.test.ts \
                          -e "$lit" "$root" 2>/dev/null | grep -v "^$d_abs/" | head -1)"
                [[ -n "$hits" ]] || note_fail "${props}: 「逐字」字面量在语料(${inc[*]})里找不到 → $lit"
            done < <(grep -o '`[^`]*`' <<<"$row" | tr -d '`')
        done < <(grep -E '^\| \*{0,2}AC[0-9]+' "$props")
    done < <(find "$root/openspec/changes" -maxdepth 2 -mindepth 1 -type d 2>/dev/null | sort)
}

# ── C2 勾选要有证据 ─────────────────────────────────────────
check_c2() {
    local root="$1" d props name
    while IFS= read -r d; do
        props="$d/proposal.md"
        [[ -f "$props" ]] || continue
        grep -q '^## Acceptance（勾选镜像）' "$props" || continue
        grep -qE '^- \[x\] AC' "$props" || continue
        touched "$props" || continue
        seen
        name="$(basename "$d")"; name="${name#[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-}"
        grep -q '^> \*\*验收证据' "$props" && continue
        compgen -G "$root/.rddf/reviews/${name}*" >/dev/null 2>&1 && continue
        note_fail "${props}: 有勾选但无证据指针（既无「> **验收证据**」注记，也无 .rddf/reviews/${name}*）"
    done < <(find "$root/openspec/changes" -maxdepth 2 -mindepth 1 -type d 2>/dev/null | sort)
}

# ── C3 勘误要自足 ───────────────────────────────────────────
check_c3() {
    local root="$1" f start block
    while IFS= read -r f; do
        touched "$f" || continue
        seen
        while IFS= read -r start; do
            block="$(sed -n "${start},$((start + 10))p" "$f")"
            grep -qE '权威|真源' <<<"$block" || note_fail "${f}:${start}: 勘误缺少「权威源」"
            grep -qE '原文|上文|上条|本条|上表|原句|第 [0-9]+ 行' <<<"$block" || note_fail "${f}:${start}: 勘误缺少「原文位置」"
        done < <(grep -n '勘误（' "$f" | cut -d: -f1)
    done < <(find "$root" -type f -name '*.md' -not -path '*/.git/*' -not -path '*/node_modules/*' 2>/dev/null)
}

# ── C4 过期段要标注 ─────────────────────────────────────────
check_c4() {
    local root="$1" f
    while IFS= read -r f; do
        touched "$f" || continue
        seen
        grep -qE 'pending|未判定' "$f" || continue
        grep -qE '✅|已确认|载体判定: A|通过' "$f" || continue
        grep -qE '已被后续|已被取代|superseded|状态更新|过期' "$f" && continue
        note_fail "${f}: 同时存在「未判定/pending」与「已确认/通过」，但没有取代标注（会被误读为最新结论）"
    done < <(find "$root/.rddf/reviews" -maxdepth 1 -type f -name '*observation.md' 2>/dev/null | sort)
}

# ── C5 活文档指针不悬空 ─────────────────────────────────────
check_c5() {
    local root="$1" f p name arch
    while IFS= read -r f; do
        while IFS= read -r p; do
            name="$(sed -E 's#^openspec/changes/([^/]+)/.*#\1#' <<<"$p")"
            [[ -d "$root/openspec/changes/$name" ]] && continue
            arch="$(ls "$root/openspec/changes/archive" 2>/dev/null | grep -E -- "-${name}$" | head -1)"
            [[ -n "$arch" && -d "$root/openspec/changes/archive/$arch" ]] && continue
            grep -qE "openspec/changes/archive/[0-9-]+-${name}/" "$f" && continue
            if grep -qE '已归档|archive/' "$f" && grep -q -- "$name" "$f"; then continue; fi
            note_fail "${f}: 悬空指针 → $p（归档后未同步）"
        done < <(grep -ohE 'openspec/changes/[^/` )]+/' "$f" | sort -u)
    done < <(find "$root/docs/adr" -type f -name '*.md' 2>/dev/null; find "$root/.rddf/improvements" -type f -name '*.md' 2>/dev/null)
}

# ── C6 commit 级归因要带命令 ────────────────────────────────
check_c6() {
    local root="$1" f hit lineno line
    while IFS= read -r f; do
        seen
        while IFS= read -r hit; do
            lineno="${hit%%:*}"; line="${hit#*:}"
            grep -qE '(未改|未碰|只碰|只改)' <<<"$line" || continue
            # 文件名 `commit-gate.json` 含 `commit` 但不是提交语境 ⇒ 先剔除再判
            local ctx="${line//commit-gate/__cfg__}"
            grep -qE '(提交|commit|git log|sha)' <<<"$ctx" || continue
            sed -n "${lineno},$((lineno + 3))p" "$f" | grep -qE '`[^`]*(git (show|diff))[^`]*`|按文件归属' && continue
            grep -qE '按文件归属' <<<"$line" && continue
            note_fail "${f}:${lineno}: commit 级否定性归因缺少可复核命令（git log 列不出某提交的文件集）"
        done < <(grep -nE '(未改|未碰|只碰|只改).*(prompts/|tests/|lib/)' "$f")
    done < <(find "$root/openspec/changes" -name 'proposal.md' 2>/dev/null; find "$root/.rddf/reviews" -name '*-verify.md' 2>/dev/null)
}

# ── C7 门槛已到要带指针 ─────────────────────────────────────
check_c7() {
    local root="$1" f hit lineno line win n2 cur
    while IFS= read -r f; do
        touched "$f" || continue
        seen
        while IFS= read -r hit; do
            lineno="${hit%%:*}"; line="${hit#*:}"
            grep -qE '< ?150|样本不足|未涨' <<<"$line" && continue
            sed -n "$((lineno > 2 ? lineno - 2 : 1)),$((lineno + 2))p" "$f" \
                | grep -qE '勘误|有误|是错的|superseded|已被取代' && continue
            win="$line"; n2=$((lineno + 1))
            while (( n2 <= lineno + 2 )); do
                cur="$(sed -n "${n2}p" "$f")"
                [[ "$cur" == ">"* ]] || break           # 不在同一 blockquote ⇒ 停
                [[ "$cur" =~ ^\>[[:space:]]*[①-⑳] ]] && break   # 下一条 bullet ⇒ 停
                win+=$'\n'"$cur"; n2=$((n2 + 1))
            done
            grep -qE '`[^`]*(/|\.md|\.json|§)[^`]*`|（见 |观察报告|ndjson' <<<"$win" && continue
            note_fail "${f}:${lineno}: 「门槛已到」类断言缺少取数指针（无法复核）"
        done < <(grep -nE '((已到|已达标).*150|150.*(已到|已达标))' "$f")
    done < <(find "$root" -type f -name '*.md' -not -path '*/.git/*' -not -path '*/node_modules/*' 2>/dev/null)
}

run_all() {
    local root="$1"
    precompute_touched "$root"
    check_c1 "$root"; check_c2 "$root"; check_c3 "$root"; check_c4 "$root"
    check_c5 "$root"; check_c6 "$root"; check_c7 "$root"
    (( SEEN > 0 )) || note_fail "扫描根为空：7 条判据全部空转（判据恒绿）"
    [[ -n "$TOUCHED" ]] && rm -f "$TOUCHED"
    TOUCHED=""
}

# ── 判别力自测：每条判据都必须能报出反例 ────────────────────
selftest() {
    local tmp; tmp="$(mktemp -d)"
    local bad=0
    expect_reports() {  # $1=检查函数 $2=场景名 $3=目录
        local out; out="$("$1" "$3" 2>&1)"
        if [[ -z "$out" ]]; then
            printf '✗ %s：反例未被报出（判据恒绿）\n' "$2" >&2; bad=$((bad + 1))
        else
            printf '✓ %s：反例被报出\n' "$2"
        fi
    }
    expect_silent() {   # $1=检查函数 $2=场景名 $3=目录
        local out; out="$("$1" "$3" 2>&1)"
        if [[ -n "$out" ]]; then
            printf '✗ %s：正例被误报 → %s\n' "$2" "$out" >&2; bad=$((bad + 1))
        else
            printf '✓ %s：正例不误报\n' "$2"
        fi
    }

    # C1 反例 / 正例
    mkdir -p "$tmp/c1/openspec/changes/x"
    cat > "$tmp/c1/openspec/changes/x/proposal.md" <<'EOF'
# x

## 验收标准

| AC | 判据 |
|---|---|
| AC1 | 测试源码含 `git log -1 --format=%H --`（逐字） |
EOF
    expect_reports check_c1 "C1 逐字字面量不存在" "$tmp/c1"

    mkdir -p "$tmp/c1b/openspec/changes/x" "$tmp/c1b/tests"
    cat > "$tmp/c1b/openspec/changes/x/proposal.md" <<'EOF'
# x

## 验收标准

| AC | 判据 |
|---|---|
| AC1 | 测试源码含 `git rev-parse HEAD`（逐字） |
EOF
    cat > "$tmp/c1b/tests/a.ts" <<'EOF'
const s = "git rev-parse HEAD"
EOF
    expect_silent check_c1 "C1 字面量真实存在" "$tmp/c1b"

    # C2
    mkdir -p "$tmp/c2/openspec/changes/y" "$tmp/c2/.rddf/reviews"
    cat > "$tmp/c2/openspec/changes/y/proposal.md" <<'EOF'
# y

## Acceptance（勾选镜像）

- [x] AC1 某事
EOF
    expect_reports check_c2 "C2 勾选无证据" "$tmp/c2"
    printf '\n> **验收证据（x）**：见某报告\n' >> "$tmp/c2/openspec/changes/y/proposal.md" # %s 无格式符，安全
    expect_silent check_c2 "C2 有「验收证据」注记" "$tmp/c2"

    # C3
    mkdir -p "$tmp/c3/docs"
    cat > "$tmp/c3/docs/CHANGELOG.md" <<'EOF'
# log

> ⑥ N 112 → 326。

> ⚠ **勘误（2026-11-19）**：本条有误。
EOF
    expect_reports check_c3 "C3 勘误不可复核" "$tmp/c3"
    cat > "$tmp/c3/docs/CHANGELOG.md" <<'EOF'
# log

> ⑥ N 112 → 326。

> ⚠ **勘误（2026-11-19）**：上条「326」有误 —— 权威数据为 `N = 112`（观察报告 §2）。
EOF
    expect_silent check_c3 "C3 勘误自足" "$tmp/c3"

    # C4
    mkdir -p "$tmp/c4/.rddf/reviews"
    printf '%s\n' '# x 观察报告' '' '- 主证据载体：pending' '' '| AC1 | ✅ 通过 |' > "$tmp/c4/.rddf/reviews/x-observation.md"
    expect_reports check_c4 "C4 过期段未标注" "$tmp/c4"
    printf '%s\n' '# x 观察报告' '' '> ⚠ **本节已被后续实测取代**' '' '- 主证据载体：pending' '' '| AC1 | ✅ 通过 |' \
        > "$tmp/c4/.rddf/reviews/x-observation.md"
    expect_silent check_c4 "C4 过期段已标注" "$tmp/c4"

    # C5
    mkdir -p "$tmp/c5/docs/adr" "$tmp/c5/.rddf/improvements"
    printf '%s\n' '# ADR' '' '| 关联 change | `openspec/changes/ghost/proposal.md` |' > "$tmp/c5/docs/adr/ADR-x.md"
    expect_reports check_c5 "C5 悬空指针" "$tmp/c5"
    mkdir -p "$tmp/c5/openspec/changes/ghost"
    expect_silent check_c5 "C5 指针存在" "$tmp/c5"

    # C6
    mkdir -p "$tmp/c6/openspec/changes/x"
    printf '%s\n' '# x' '' '`git log` 可见本 change 的提交只碰 openspec/，未改 prompts/**。' > "$tmp/c6/openspec/changes/x/proposal.md"
    expect_reports check_c6 "C6 commit 级归因无命令" "$tmp/c6"
    cat > "$tmp/c6/openspec/changes/x/proposal.md" <<'EOF'
# x

`git log` 可见本 change 的提交未改 prompts/**（**按文件归属核对**：产出只有本目录）。
EOF
    expect_silent check_c6 "C6 归因带手段" "$tmp/c6"

    # 正例：文件名 `commit-gate.json` 里的 commit 不是提交语境（该误报曾命中守卫自己的报告）
    cat > "$tmp/c6/openspec/changes/x/proposal.md" <<'EOF'
# x

`.rddf/commit-gate.json` 的 `verify_commands` **未改**（仍是 `bun test tests/`）。
EOF
    expect_silent check_c6 "C6 配置文件名不算提交语境" "$tmp/c6"

    # C7
    mkdir -p "$tmp/c7/docs"
    printf '%s\n' '# log' '' '> ⑥ 门控 N 112 → 326（≥150 已到）。' > "$tmp/c7/docs/CHANGELOG.md"
    expect_reports check_c7 "C7 门槛断言无指针" "$tmp/c7"
    printf '%s\n' '# log' '' '> ⑥ 门控 N ≥ 150 已到（见 `.rddf/reviews/x-observation.md` §2）。' > "$tmp/c7/docs/CHANGELOG.md"
    expect_silent check_c7 "C7 断言带指针" "$tmp/c7"

    rm -rf "$tmp"
    if (( bad > 0 )); then
        printf '\n自测失败：%d 项\n' "$bad" >&2
        return 1
    fi
    printf '\n自测通过：7 条判据都能报出反例、且不误报正例。\n'
}

case "$MODE" in
    --selftest) selftest ;;
    *)
        run_all "$ROOT"
        if (( FAILS > 0 )); then
            printf '\n记录纪律：%d 处违规（详见上方）\n' "$FAILS" >&2
            exit 1
        fi
        printf 'RESULT: OK（记录纪律 7 条判据全部通过；保鲜期 %s）\n' "$EPOCH"
        ;;
esac
