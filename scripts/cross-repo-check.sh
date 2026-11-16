#!/usr/bin/env bash
# cross-repo-check.sh — 跨仓清单一致性核对（单条命令）
#
# 为什么需要：本仓有一族事实**横跨两个仓**（例：verifier 的 owns 清单 —— 本仓常量 ↔
# 产品仓 SKILL.md）。`docs/guard-authoring.md` §6 判过三种做法：读另一仓的文件 ⇒ CI 必然
# SKIP（等于没有守卫）；各自钉自己那半 ⇒ 覆盖不到「两仓之间」；于是只剩**人工 diff**。
# 本脚本把那条人工 diff 固化成一条命令，并把「缺仓 / 执行失败」从「两侧不一致」里**拆出来**
# —— 混同会让环境故障被读成业务结论（进而人去改清单）。
#
# 用法:
#   scripts/cross-repo-check.sh [--workspace FILE] [--quiet]
#
#   --workspace FILE   清单路径（默认 .rddf/config/workspace.json；也可用环境变量 CROSS_REPO_WORKSPACE）
#   --quiet            只输出 RESULT 行与失败原因
#   -h|--help          本帮助
#
# 退出码（与 scripts/check-upstream-anchors.sh 对齐：2 = 漂移）:
#   0 = OK（可评估的核对项全部一致）/ SKIP（无核对项可评估）
#   1 = CONFIG（清单不合法）/ USAGE（参数错误）
#   2 = DRIFT（两侧清单不一致）
#   3 = ENV（缺仓 / 身份不符 / 命令失败 / 输出不可比）
#
# 依赖: bash / python3 / git（consumer 侧核对项另需 bun —— 缺时按 ENV 计入，不算漂移）
#
# 约定:
#   - 清单是**声明式**的：仓（id/url/canonical_path/required）+ 核对项（两侧 argv 命令 + 过滤式）。
#     命令用 argv 数组（不是 shell 串）⇒ 无注入面。
#   - canonical_path 一律**绝对路径**（唯一例外 "." = 本仓自身）；其余相对路径拒绝（避免基准歧义）。
#   - 本脚本**只读**：不写两仓任何文件、不 fetch、不 checkout、不 commit。
#
# 范围: 只判「**当下**两侧是否一致」。不联网 ⇒ 判不了「pin 是否陈旧」；
#       一致**不蕴含**上游没漂（陈旧 pin 也可能两侧一致）。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

WORKSPACE="${CROSS_REPO_WORKSPACE:-$REPO_ROOT/.rddf/config/workspace.json}"
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --workspace) WORKSPACE="${2:-}"; shift 2 ;;
    --quiet)     QUIET=1; shift ;;
    -h|--help)   sed -n '2,33p' "$0"; exit 0 ;;
    *) printf '未知参数: %s\n' "$1" >&2; printf 'RESULT: USAGE\n' >&2; exit 1 ;;
  esac
done

if [ -z "$WORKSPACE" ]; then
  printf '清单路径为空\n' >&2
  printf 'RESULT: USAGE\n' >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  printf '缺 python3（清单解析与命令执行都需要）\n' >&2
  printf 'RESULT: ENV\n' >&2
  exit 3
fi

export CROSS_REPO_WORKSPACE="$WORKSPACE"
export CROSS_REPO_ROOT="$REPO_ROOT"
export CROSS_REPO_QUIET="$QUIET"
export PYTHONDONTWRITEBYTECODE=1

python3 -B - <<'PY'
import difflib
import json
import os
import re
import subprocess
import sys

WORKSPACE = os.environ["CROSS_REPO_WORKSPACE"]
ROOT = os.environ["CROSS_REPO_ROOT"]
QUIET = os.environ.get("CROSS_REPO_QUIET") == "1"

REPO_ROOT_REAL = os.path.realpath(ROOT)


def emit(msg):
    if not QUIET:
        print(msg)


def err(msg):
    print(msg, file=sys.stderr)


def finish(result, code):
    print(f"RESULT: {result}")
    sys.exit(code)


def config_fail(msg):
    err(f"[config] {msg}")
    finish("CONFIG", 1)


# ── 1. 清单校验 ──────────────────────────────────────────────────────────
try:
    with open(WORKSPACE, encoding="utf-8") as fh:
        manifest = json.load(fh)
except FileNotFoundError:
    config_fail(f"清单不存在: {WORKSPACE}")
except json.JSONDecodeError as exc:
    config_fail(f"清单 JSON 非法: {exc}")
except OSError as exc:
    config_fail(f"清单读不到: {exc}")

if not isinstance(manifest, dict):
    config_fail("清单顶层必须是对象")

schema_version = manifest.get("schema_version")
if not isinstance(schema_version, int) or isinstance(schema_version, bool) or schema_version != 1:
    config_fail(f"schema_version 不认识: {schema_version!r}（本脚本支持 1）")

raw_repos = manifest.get("repos")
if not isinstance(raw_repos, list) or not raw_repos:
    config_fail("repos 必须是非空数组")

repos = {}
for raw in raw_repos:
    if not isinstance(raw, dict):
        config_fail("repos 条目必须是对象")
    rid = raw.get("id")
    if not isinstance(rid, str) or not rid.strip():
        config_fail("repos 条目缺 id")
    if rid in repos:
        config_fail(f"id 重复: {rid}")
    url = raw.get("url")
    if not isinstance(url, str) or not url.strip():
        config_fail(f"{rid}: 缺 url")
    path = raw.get("canonical_path")
    if not isinstance(path, str) or not path.strip():
        config_fail(f"{rid}: 缺 canonical_path")
    if "~" in path:
        config_fail(f"{rid}: canonical_path 不得含 ~（本脚本不展开家目录）")
    if path in (".", "${SELF}"):
        path = REPO_ROOT_REAL  # 本仓自身：用脚本所在仓的根（不写死机器绝对路径）
    elif not os.path.isabs(path):
        config_fail(f"{rid}: canonical_path 必须是绝对路径（收到 {path!r}；本仓自身用 \".\"）")
    required = raw.get("required")
    if not isinstance(required, bool):
        config_fail(f"{rid}: required 必须是布尔")
    repos[rid] = {"id": rid, "url": url, "path": path, "required": required}

raw_checks = manifest.get("checks", [])
if not isinstance(raw_checks, list):
    config_fail("checks 必须是数组")

checks = []
for raw in raw_checks:
    if not isinstance(raw, dict):
        config_fail("checks 条目必须是对象")
    cid = raw.get("id")
    if not isinstance(cid, str) or not cid.strip():
        config_fail("checks 条目缺 id")
    entry = {"id": cid}
    for side in ("consumer", "producer"):
        repo_id = raw.get(side)
        if not isinstance(repo_id, str) or not repo_id.strip():
            config_fail(f"check {cid}: 缺 {side}")
        if repo_id not in repos:
            config_fail(f"check {cid}: {side} 引用未知仓 {repo_id!r}")
        cmd = raw.get(f"{side}_cmd")
        if (
            not isinstance(cmd, list)
            or not cmd
            or not all(isinstance(x, str) for x in cmd)
        ):
            config_fail(f"check {cid}: {side}_cmd 必须是非空字符串数组")
        filt = raw.get(f"{side}_filter")
        if filt is not None and not isinstance(filt, str):
            config_fail(f"check {cid}: {side}_filter 必须是字符串")
        try:
            re.compile(filt) if filt else None
        except re.error as exc:
            config_fail(f"check {cid}: {side}_filter 不是合法正则: {exc}")
        entry[side] = repo_id
        entry[f"{side}_cmd"] = cmd
        entry[f"{side}_filter"] = filt
    checks.append(entry)


# ── 2. 仓身份校验 ────────────────────────────────────────────────────────
def git(args, cwd):
    proc = subprocess.run(
        ["git"] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
    )
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def normalize_remote(url):
    """归一 remote URL ⇒ 「host/path」小写化形式。

    ssh://git@github.com/org/repo.git
    git@github.com:org/repo.git
    https://github.com/org/repo.git
    ⇒ 同一形态 ⇒ github.com/org/repo
    """
    text = (url or "").strip()
    text = re.sub(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", "", text)
    text = re.sub(r"^[^/@]+@", "", text)
    text = text.replace(":", "/", 1) if "/" not in text.split(":", 1)[0] else text
    text = re.sub(r"^/+", "", text)
    text = re.sub(r"\.git$", "", text)
    return text.rstrip("/").lower()


state = {}
env_problems = []

for repo in repos.values():
    rid = repo["id"]
    path = repo["path"]
    if not os.path.isdir(path):
        if repo["required"]:
            env_problems.append(f"{rid}: 仓不存在: {path}")
            state[rid] = {"status": "MISSING"}
        else:
            emit(f"SKIP [repo] {rid}: 路径不存在: {path}")
            state[rid] = {"status": "SKIP"}
        continue

    rc, top, _ = git(["rev-parse", "--show-toplevel"], path)
    if rc != 0 or not top:
        env_problems.append(f"{rid}: 不是 git 工作树: {path}")
        state[rid] = {"status": "BAD"}
        continue

    real = os.path.realpath(path)
    real_top = os.path.realpath(top)
    if real != real_top:
        env_problems.append(
            f"{rid}: 路径不是仓根（realpath={real} ≠ toplevel={real_top}）"
        )
        state[rid] = {"status": "BAD"}
        continue

    rc, origin, _ = git(["config", "--get", "remote.origin.url"], path)
    origin = origin if rc == 0 else ""
    if normalize_remote(origin) != normalize_remote(repo["url"]):
        env_problems.append(
            f"{rid}: remote.origin.url 与清单不符（仓={origin or '<无>'} 清单={repo['url']}）"
        )
        state[rid] = {"status": "BAD"}
        continue

    rc, sha, _ = git(["rev-parse", "HEAD"], path)
    state[rid] = {
        "status": "OK",
        "path": path,
        "sha": sha if rc == 0 else "<no-commit>",
    }
    emit(f"[repo] {rid}  {path}  HEAD={state[rid]['sha']}")

if env_problems:
    for problem in env_problems:
        err(f"[env] {problem}")
    finish("ENV", 3)


# ── 3. 核对项比对 ────────────────────────────────────────────────────────
def run_side(cmd, cwd, filt):
    """跑一侧命令 ⇒ (rc, 过滤后的文本 或 None)。

    None = 不可比（命令失败 / 过滤后为空）⇒ 归 ENV，不归漂移。
    """
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
    )
    if proc.returncode != 0:
        return proc.returncode, None
    text = proc.stdout
    if filt:
        lines = [ln for ln in text.splitlines() if re.search(filt, ln)]
        if not lines:
            return 0, None
        text = "\n".join(lines)
    return 0, text.rstrip("\n")


evaluated = 0
skipped = 0
drifted = []

for check in checks:
    cid = check["id"]
    c_status = state.get(check["consumer"], {}).get("status")
    p_status = state.get(check["producer"], {}).get("status")
    if c_status != "OK" or p_status != "OK":
        skipped += 1
        emit(
            f"SKIP [check] {cid}: 依赖仓未就绪"
            f"（consumer={check['consumer']}:{c_status} producer={check['producer']}:{p_status}）"
        )
        continue

    c_rc, c_text = run_side(
        check["consumer_cmd"], state[check["consumer"]]["path"], check["consumer_filter"]
    )
    p_rc, p_text = run_side(
        check["producer_cmd"], state[check["producer"]]["path"], check["producer_filter"]
    )

    if c_rc != 0 or c_text is None:
        env_problems.append(
            f"check {cid}: consumer 侧命令失败或输出不可比"
            f"（consumer={check['consumer']} rc={c_rc}）"
        )
        continue
    if p_rc != 0 or p_text is None:
        env_problems.append(
            f"check {cid}: producer 侧命令失败或输出不可比"
            f"（producer={check['producer']} rc={p_rc}）"
        )
        continue

    evaluated += 1
    if c_text == p_text:
        emit(f"[check] {cid}: 一致")
        continue

    drifted.append(cid)
    err(f"[drift] {cid}: 两侧不一致")
    for line in difflib.unified_diff(
        c_text.splitlines(),
        p_text.splitlines(),
        fromfile=f"{check['consumer']}",
        tofile=f"{check['producer']}",
        lineterm="",
    ):
        err(f"  {line}")

emit(f"[summary] checks={len(checks)} evaluated={evaluated} skipped={skipped} drifted={len(drifted)}")

if env_problems:
    for problem in env_problems:
        err(f"[env] {problem}")
    finish("ENV", 3)
if drifted:
    finish("DRIFT", 2)
if skipped:
    finish("SKIP", 0)
if evaluated == 0:
    finish("SKIP", 0)
finish("OK", 0)
PY
exit $?
