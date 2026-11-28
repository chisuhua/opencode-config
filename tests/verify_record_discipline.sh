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

note_fail() { printf '%s\n' "$*" >&2; FAILS=$((FAILS + 1)); }
is_git_repo() { git -C "$1" rev-parse --git-dir >/dev/null 2>&1; }

# 一次 git log + 一次 git status 预计算「自 EPOCH 起被动过的文件」（不要逐文件跑 git）
#
# ⚠ **2026-11-28 优化（语义不变）**：原先把命中集写成临时文件、`touched()` 每次 `grep -qxF`
#   扫一遍该文件 ⇒ 每个被检文件一次进程 + 一次全表扫 ⇒ 仓库变大后线性变慢（C3 / C7 各要扫
#   全仓 md）。改成 **关联数组**（bash ≥ 4）：查表 O(1)、零进程、且不再泄漏临时文件。
#   谓词逐字不变：命中集 = `git log --since` 的文件 ∪ `git status` 的文件（都取绝对路径）。
declare -A TOUCHED_SET=()
# ⚠ **两种态必须分开**（2026-11-28 优化时踩到的语义坑，原实现的「空临时文件」把两者分开了）：
#   0 = 不是 git 仓库 ⇒ 「全部新」（自测假树 / 归档快照）
#   1 = 是 git 仓库 ⇒ 一律按命中集判**成员资格**（命中集为空 ⇒ 一个都不算）
TOUCHED_IS_GIT=0
precompute_touched() {
    local root="$1"
    TOUCHED_SET=()
    TOUCHED_IS_GIT=0
    if is_git_repo "$root"; then
        TOUCHED_IS_GIT=1
        local f
        while IFS= read -r f; do
            [[ -n "$f" ]] && TOUCHED_SET["$f"]=1
        done < <(
            {
                git -C "$root" log --since="$EPOCH 00:00:00" --name-only --format= 2>/dev/null \
                    | sed '/^$/d' | sed "s#^#$root/#"
                git -C "$root" status --porcelain 2>/dev/null \
                    | awk '{ $1=""; sub(/^ +/, ""); n=split($0, a, " -> "); print a[n] }' \
                    | sed "s#^#$root/#"
            } | sort -u
        )
    fi
}

# 非 git 目录（自测用的假树 / 归档快照）⇒ 视为"全部新"（**不能变成"全部跳过"**）
touched() {
    local f="$1"
    [[ "$TOUCHED_IS_GIT" -eq 0 ]] && return 0
    [[ -n "${TOUCHED_SET[$f]:-}" ]]
}

# C1 的临时目录（`mktemp -d`：尊重 TMPDIR，任何退出路径都由 trap 收走）
TMPDIR_C1=""
cleanup_c1_tmp() { [[ -n "${TMPDIR_C1:-}" ]] && rm -rf "$TMPDIR_C1"; }
trap cleanup_c1_tmp EXIT

# 判据空转保护：每个 check 都记一次被检查文件数；全程为 0 ⇒ 判据恒绿 ⇒ 直接红
SEEN=0
seen() { SEEN=$((SEEN + 1)); }

# ── C1 判据可机判 ────────────────────────────────────────────
check_c1() {
    local root="$1" d props row lit d_abs set_id
    # ① 收集（字面量 / include 集 / 所属 change 目录）
    local -a p_lit=() p_set=() p_dir=()
    while IFS= read -r d; do
        props="$d/proposal.md"
        [[ -f "$props" ]] || continue
        grep -qE '^## (验收标准|Acceptance)' "$props" || continue
        touched "$props" || continue
        seen
        d_abs="$d"
        while IFS= read -r row; do
            grep -q '逐字' <<<"$row" || continue
            set_id=3
            if grep -qE '测试源码|源码|代码文件|代码里' <<<"$row"; then
                set_id=2
            elif grep -qE '文档|报告|prompt' <<<"$row"; then
                set_id=1
            fi
            while IFS= read -r lit; do
                [[ -n "$lit" ]] || continue
                grep -qE '<[^>]*>|…|\.\.\.' <<<"$lit" && continue
                p_lit+=("$lit"); p_set+=("$set_id"); p_dir+=("$d_abs")
            done < <(grep -o '`[^`]*`' <<<"$row" | tr -d '`')
        done < <(grep -E '^\| \*{0,2}AC[0-9]+' "$props")
    done < <(find "$root/openspec/changes" -maxdepth 2 -mindepth 1 -type d 2>/dev/null | sort)

    # ② **每个 include 集只扫一次全仓**（2026-11-28 优化，谓词逐字不变）：
    #    原实现对「每个 AC 行 × 每个字面量」各跑一次 `grep -rlF <整个仓库>`（实测本仓 76 次整树
    #    扫描 ⇒ 冷缓存下 20~45s）；这里降到 **3 次**（按 include 集），再对候选文件逐个提取命中
    #    字面量。候选集合 = 「含该集任一字面量」的文件 = 原逐字面量扫描结果的并集 ⇒ 等价。
    #    ⚠ 排除项与原来逐字一致：.git / node_modules / 本守卫脚本自身 / `record-discipline.test.ts`
    #      （后两者含 --selftest 夹具里的同一批字面量 ⇒ 不排除会「自己满足自己」）。
    local -a inc1=(--include='*.md')
    local -a inc2=(--include='*.ts' --include='*.sh' --include='*.json' --include='*.jsonc')
    local -a inc3=(--include='*.md' --include='*.ts' --include='*.sh' --include='*.json' --include='*.jsonc')
    TMPDIR_C1="$(mktemp -d)"; local tmpc="$TMPDIR_C1"
    : > "$tmpc/map"
    local -A lit_of_set=()
    local i=0
    while (( i < ${#p_lit[@]} )); do
        lit_of_set["${p_set[i]}|${p_lit[i]}"]=1
        i=$((i+1))
    done
    local sid k
    for sid in 1 2 3; do
        local -a use=()
        case "$sid" in 1) use=("${inc1[@]}");; 2) use=("${inc2[@]}");; *) use=("${inc3[@]}");; esac
        local -a ls=()
        for k in "${!lit_of_set[@]}"; do
            [[ "${k%%|*}" == "$sid" ]] && ls+=("${k#*|}")
        done
        (( ${#ls[@]} > 0 )) || continue
        # ⚠ **重叠字面量回退**：同集内若存在「一个是另一个的子串」，`grep -o` 的多模式同起点只输出
        #   **最长**者 ⇒ 短字面量缺行 ⇒ 步③判「找不到」⇒ **假红**。该集改用逐字面量校验（与原实现
        #   逐字等价）；无重叠时走候选文件快路径。
        local overlap=0 a b
        for a in "${ls[@]}"; do
            for b in "${ls[@]}"; do
                [[ "$a" == "$b" ]] && continue
                if [[ "$b" == *"$a"* ]]; then overlap=1; break 2; fi
            done
        done
        if (( overlap )); then
            local ol oh
            for ol in "${ls[@]}"; do
                oh="$(grep -rlF "${use[@]}" --exclude-dir=.git --exclude-dir=node_modules \
                       --exclude=verify_record_discipline.sh --exclude=record-discipline.test.ts \
                       -e "$ol" "$root" 2>/dev/null || true)"
                while IFS= read -r cf; do
                    [[ -n "$cf" ]] && printf '%s\t%s\t%s\n' "$ol" "$sid" "$cf" >> "$tmpc/map"
                done <<< "$oh"
            done
            continue
        fi
        printf '%s\n' "${ls[@]}" > "$tmpc/lit$sid"
        grep -rlF "${use[@]}" --exclude-dir=.git --exclude-dir=node_modules \
            --exclude=verify_record_discipline.sh --exclude=record-discipline.test.ts \
            -f "$tmpc/lit$sid" "$root" 2>/dev/null > "$tmpc/cand$sid" || true
        local cf m
        while IFS= read -r cf; do
            [[ -n "$cf" ]] || continue
            while IFS= read -r m; do
                printf '%s\t%s\t%s\n' "$m" "$sid" "$cf" >> "$tmpc/map"
            done < <(grep -oF -f "$tmpc/lit$sid" "$cf" 2>/dev/null | sort -u)
        done < "$tmpc/cand$sid"
        rm -f "$tmpc/lit$sid" "$tmpc/cand$sid"
    done

    # ③ 判定：命中文件里**没有**一个在该 change 目录之外 ⇒ 判据找不到（原口径 `grep -v "^$d_abs/"`）
    #    ⚠ 已知边界（如实登记）：`$tmpc/map` 用 `\t` 分列 ⇒ 若**字面量或文件名含制表符**，awk 字段
    #      会错位 ⇒ 可能把「找到」判成「找不到」（**方向安全**：只会假红，不会假绿）。本仓实测 0 条。
    i=0
    while (( i < ${#p_lit[@]} )); do
        lit="${p_lit[i]}"; set_id="${p_set[i]}"; d_abs="${p_dir[i]}"
        local -a use=()
        case "$set_id" in 1) use=("${inc1[@]}");; 2) use=("${inc2[@]}");; *) use=("${inc3[@]}");; esac
        if ! awk -F'\t' -v l="$lit" -v s="$set_id" -v dd="$d_abs" \
             '$1==l && $2==s && index($3, dd "/")!=1 {found=1} END{exit !found}' "$tmpc/map"; then
            note_fail "${d_abs}/proposal.md: 「逐字」字面量在语料(${use[*]})里找不到 → $lit"
        fi
        i=$((i+1))
    done
    rm -rf "$tmpc"; TMPDIR_C1=""
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
    TOUCHED_SET=(); TOUCHED_IS_GIT=0
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

    # C1(c) **目录排除**：md 集字面量只出现在自身 `proposal.md` 里（自引用）⇒ 仍须报红
    #     （若把 `index($3, dd "/") != 1` 的目录排除删掉，本例会静默 —— 这正是原先的自测盲区）
    mkdir -p "$tmp/c1c/openspec/changes/x"
    cat > "$tmp/c1c/openspec/changes/x/proposal.md" <<'EOF'
# x

## 验收标准

| AC | 判据 |
|---|---|
| AC1 | 文档须写 `SELF_ONLY_LITERAL_XYZ`（逐字） |
EOF
    expect_reports check_c1 "C1 字面量只在自身 change 目录（目录排除生效）" "$tmp/c1c"

    # C1(d) **重叠字面量**：短字面量只以「被长字面量包含」的形式出现 ⇒ 原口径算「找到」⇒ 不误报
    #     （若用 `grep -o` 的最长匹配归属，短者会缺行 ⇒ 假红；本例钉住回退逻辑）
    mkdir -p "$tmp/c1d/openspec/changes/x" "$tmp/c1d/tests"
    cat > "$tmp/c1d/openspec/changes/x/proposal.md" <<'EOF'
# x

## 验收标准

| AC | 判据 |
|---|---|
| AC1 | 测试源码含 `OVERLAP_LONG_TOKEN` 与 `OVERLAP_LONG`（逐字） |
EOF
    cat > "$tmp/c1d/tests/a.ts" <<'EOF'
const s = "OVERLAP_LONG_TOKEN"
EOF
    expect_silent check_c1 "C1 重叠字面量（短者只被长者包含）" "$tmp/c1d"

    # C1(e) md 集字面量在他处存在 ⇒ 静默
    mkdir -p "$tmp/c1e/openspec/changes/x" "$tmp/c1e/docs"
    cat > "$tmp/c1e/openspec/changes/x/proposal.md" <<'EOF'
# x

## 验收标准

| AC | 判据 |
|---|---|
| AC1 | 文档须写 `ELSEWHERE_TOKEN_ABC`（逐字） |
EOF
    cat > "$tmp/c1e/docs/a.md" <<'EOF'
ELSEWHERE_TOKEN_ABC
EOF
    expect_silent check_c1 "C1 md 集字面量在他处存在" "$tmp/c1e"

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
