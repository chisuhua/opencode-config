#!/usr/bin/env bash
# plan-models-check — 校验 plan 侧模型配置（ADR-plan-collaboration-hardening D1 / V3）
#
# 用法:
#   plan-models-check.sh [--config PATH] [--skip-models] [--json]
#
# 退出码（三值互斥）:
#   0 = 通过（fallback 失配只告警，不阻断）
#   1 = 校验失败（JSON 不可解析 / schema 不符 / 模型不在 `opencode models` 输出中 /
#       找不到 `opencode` CLI / `opencode models` 非零退出 / 超时 / 输出为空 —— 一律 fail-closed）
#   2 = 用法错误 / 配置文件缺失或不可读
#
# 为什么要有这条：`plan-models.json` 是全局配置（默认 ~/.config/opencode/plan-models.json），
# 派发合成节点前必须确认「配置里的强模型仍可用」——否则失效表现为 `claim` 后 spawn 失败，
# 留下悬挂 attempt（ADR-plan-multi-session-collaboration 残留 #18）。
set -uo pipefail

exec python3 - "$@" <<'PY'
import json
import os
import re
import shutil
import subprocess
import sys

DEFAULT_CONFIG = os.path.expanduser("~/.config/opencode/plan-models.json")
MODEL_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(#[A-Za-z0-9_.-]+)?$")


def usage(msg: str) -> "NoReturn":  # type: ignore[name-defined]
    sys.stderr.write(f"用法错误：{msg}\n")
    sys.stderr.write("plan-models-check.sh [--config PATH] [--skip-models] [--json]\n")
    sys.exit(2)


def die(code: int, msg: str, as_json: bool, problems=None) -> "NoReturn":  # type: ignore[name-defined]
    problems = problems or []
    if as_json:
        print(json.dumps({"ok": False, "config": cfg_path, "problems": problems or [msg]}, ensure_ascii=False))
    else:
        for p in problems or [msg]:
            sys.stderr.write(f"✗ {p}\n")
    sys.exit(code)


cfg_path = DEFAULT_CONFIG
as_json = False
skip_models = False

args = sys.argv[1:]
i = 0
while i < len(args):
    a = args[i]
    if a == "--config":
        if i + 1 >= len(args):
            usage("--config 需要路径")
        cfg_path = os.path.expanduser(args[i + 1])
        i += 2
        continue
    if a.startswith("--config="):
        cfg_path = os.path.expanduser(a.split("=", 1)[1])
        i += 1
        continue
    if a == "--skip-models":
        skip_models = True
        i += 1
        continue
    if a == "--json":
        as_json = True
        i += 1
        continue
    if a in ("-h", "--help"):
        sys.stdout.write("plan-models-check.sh [--config PATH] [--skip-models] [--json]\n")
        sys.exit(0)
    usage(f"未知参数 {a}")

if not os.path.isfile(cfg_path):
    die(2, f"配置不存在或不是文件：{cfg_path}", as_json)

try:
    with open(cfg_path, encoding="utf-8") as f:
        raw = f.read()
except OSError as e:
    die(2, f"配置不可读：{cfg_path}（{e}）", as_json)

try:
    cfg = json.loads(raw)
except json.JSONDecodeError as e:
    die(1, f"JSON 不可解析（{e}）", as_json)

problems = []
warnings = []

if not isinstance(cfg, dict):
    die(1, "顶层必须是对象", as_json)
if cfg.get("schema_version") != 1:
    problems.append(f"schema_version 必须是 1（实际：{cfg.get('schema_version')!r}）")

synth = cfg.get("synthesis")
if not isinstance(synth, dict):
    problems.append("缺 synthesis 对象")
    synth = {}
model = synth.get("model")
fallback = synth.get("fallback", [])
if not isinstance(model, str) or not model.strip():
    problems.append("synthesis.model 必须是非空字符串（用 null 表示「走 agent 默认档」只适用于 content）")
elif not MODEL_RE.match(model):
    problems.append(f"synthesis.model 形状非法（应为 <provider>/<model>[#variant]）：{model!r}")
if fallback is None:
    fallback = []
if not isinstance(fallback, list) or any(not isinstance(x, str) for x in fallback):
    problems.append("synthesis.fallback 必须是字符串数组")
else:
    for fb in fallback:
        if not MODEL_RE.match(fb):
            problems.append(f"synthesis.fallback 条目形状非法（应为 <provider>/<model>[#variant]）：{fb!r}")

content = cfg.get("content", {"model": None})
if not isinstance(content, dict):
    problems.append("content 必须是对象")
else:
    cm = content.get("model", None)
    if cm is not None and (not isinstance(cm, str) or not cm.strip() or not MODEL_RE.match(cm)):
        problems.append(f"content.model 必须是 null 或 <provider>/<model>[#variant]（实际：{cm!r}）")

if problems:
    die(1, "schema 校验失败", as_json, problems)

checked = "skipped"
available = None
if not skip_models:
    exe = shutil.which("opencode")
    if not exe:
        problems.append("未找到 `opencode` CLI ⇒ 无法做模型可用性比对（离线排障才可显式带 --skip-models）")
        checked = "no-cli"
    else:
        try:
            out = subprocess.run([exe, "models"], capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            problems.append("`opencode models` 超时（120s）")
            out = None
        if out is not None:
            if out.returncode != 0:
                problems.append(f"`opencode models` 退出码 {out.returncode}：{(out.stderr or '').strip()[:200]}")
            else:
                available = {ln.strip() for ln in out.stdout.splitlines() if ln.strip()}
                checked = "ok"
                if available:
                    want = model.split("#", 1)[0]
                    if want not in available:
                        problems.append(f"synthesis.model 不在 `opencode models` 输出中：{want}")
                    for fb in fallback:
                        base = fb.split("#", 1)[0]
                        if base not in available:
                            warnings.append(f"fallback 模型当前不可用（不阻断）：{base}")
                else:
                    problems.append("`opencode models` 输出为空 ⇒ 无法确认模型可用（离线排障才可显式带 --skip-models）")

if problems:
    die(1, "校验失败", as_json, problems + [f"告警：{w}" for w in warnings])

if as_json:
    print(json.dumps({"ok": True, "config": cfg_path, "models_checked": checked,
                      "synthesis_model": model, "warnings": warnings}, ensure_ascii=False))
else:
    print(f"✔ plan-models OK：{cfg_path}")
    print(f"  synthesis.model = {model}（可用性比对：{checked}）")
    for w in warnings:
        print(f"  ⚠ {w}")
sys.exit(0)
PY
