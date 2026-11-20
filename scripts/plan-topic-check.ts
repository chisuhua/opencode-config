#!/usr/bin/env bun
/**
 * plan-topic-check —— plan 侧协作 topic 的机械判据 CLI
 *
 * 用法:
 *   plan-topic-check check <topic-dir> [--json] [--allow-empty]
 *   plan-topic-check scope-check <topic-dir> <node-id> --baseline <ref|sha> [--json]
 *   plan-topic-check lock <topic-dir> [--json]
 *
 * 退出码（四值互斥）:
 *   0 = 全绿
 *   1 = 有违规（逐条列出 / --json 的 violations[]）
 *   2 = 用法错误（stdout 不含违规列表）
 *   3 = graph.json 缺失或不可解析（stdout 不含违规列表）
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { PlanTopicError, checkTopic, loadGraph, type Violation } from "../lib/plan-topics.ts"

interface Options {
  json: boolean
  allowEmpty: boolean
  baseline?: string
  positional: string[]
}

function usage(msg: string): never {
  process.stderr.write(`用法错误：${msg}\n`)
  process.stderr.write(
    [
      "plan-topic-check check <topic-dir> [--json] [--allow-empty]",
      "plan-topic-check scope-check <topic-dir> <node-id> --baseline <ref|sha> [--json]",
      "plan-topic-check lock <topic-dir> [--json]",
    ].join("\n") + "\n",
  )
  process.exit(2)
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { json: false, allowEmpty: false, positional: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--json") opts.json = true
    else if (a === "--allow-empty") opts.allowEmpty = true
    else if (a === "--baseline") {
      const v = argv[++i]
      if (!v) usage("--baseline 缺少值")
      opts.baseline = v
    } else if (a.startsWith("--baseline=")) {
      opts.baseline = a.slice("--baseline=".length)
    } else if (a.startsWith("-")) usage(`未知选项 ${a}`)
    else opts.positional.push(a)
  }
  return opts
}

function emitJson(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + "\n")
}

function emitViolations(opts: Options, violations: Violation[]): number {
  if (opts.json) {
    emitJson({ ok: violations.length === 0, violations })
  } else if (violations.length > 0) {
    for (const v of violations) {
      process.stdout.write(`${v.code}${v.node ? ` [${v.node}]` : ""}: ${v.detail}\n`)
    }
  } else {
    process.stdout.write("OK：无违规\n")
  }
  return violations.length === 0 ? 0 : 1
}

// ── check ────────────────────────────────────────────────────────────────────

function cmdCheck(opts: Options): number {
  const [topicDir] = opts.positional
  if (!topicDir) usage("check 需要 <topic-dir>")

  let violations: Violation[]
  try {
    loadGraph(topicDir) // schema / 缺失 ⇒ exit 3
    violations = checkTopic(topicDir, { allowEmpty: opts.allowEmpty })
  } catch (e) {
    if (e instanceof PlanTopicError) {
      // graph.json 缺失 / 不可解析 / schema 违规 ⇒ 3（stdout 不含违规列表）
      process.stderr.write(`${e.code}: ${e.message}\n`)
      return 3
    }
    throw e
  }
  return emitViolations(opts, violations)
}

// ── scope-check ──────────────────────────────────────────────────────────────

function git(root: string, args: string[]): string {
  // 不吞错：失败即向上抛（调用方转 git_error）
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

function cmdScopeCheck(opts: Options): number {
  const [topicDir, nodeId] = opts.positional
  if (!topicDir || !nodeId) usage("scope-check 需要 <topic-dir> <node-id>")
  if (!opts.baseline) usage("scope-check 需要 --baseline <ref|sha>")

  const violations: Violation[] = []
  let root: string
  try {
    root = git(topicDir, ["rev-parse", "--show-toplevel"]).trim()
  } catch (e) {
    return emitViolations(opts, [
      { code: "git_error", detail: `git rev-parse 失败：${(e as Error).message.trim()}` },
    ])
  }

  let changed: string[]
  try {
    const baselinePaths = git(root, ["ls-tree", "-r", "--name-only", "--full-tree", opts.baseline!])
      .split("\n")
      .filter(Boolean)
    // 当前工作树相对基线改动（已跟踪，路径相对 root）
    const diffPaths = git(root, ["diff", "--name-only", opts.baseline!])
      .split("\n")
      .filter(Boolean)
    // 未跟踪文件（git diff 看不到）
    const untracked = git(root, ["ls-files", "--others", "--exclude-standard"])
      .split("\n")
      .filter(Boolean)
    const before = new Set(baselinePaths)
    // 「变更」= 相对基线有差异的已跟踪文件 + 全部未跟踪文件
    const after = new Set([...diffPaths, ...untracked])
    changed = [...after].filter((p) => !before.has(p) || diffPaths.includes(p))
  } catch (e) {
    return emitViolations(opts, [
      { code: "git_error", detail: `git diff/ls-files 失败（基线 ${opts.baseline}）：${(e as Error).message.trim()}` },
    ])
  }

  const topicAbs = path.resolve(topicDir)
  const topicRel = path.relative(root, topicAbs)
  const allowedPrefix = path.posix.join(topicRel.split(path.sep).join("/"), "nodes", nodeId)

  for (const p of changed) {
    const rel = p.split(path.sep).join("/")
    if (!rel.startsWith(allowedPrefix + "/")) {
      violations.push({ code: "out_of_scope", node: nodeId, detail: `越界写（不在 nodes/${nodeId}/ 下）：${rel}` })
    }
  }
  return emitViolations(opts, violations)
}

// ── lock ─────────────────────────────────────────────────────────────────────

function cmdLock(opts: Options): number {
  const [topicDir] = opts.positional
  if (!topicDir) usage("lock 需要 <topic-dir>")

  let root: string
  try {
    root = git(topicDir, ["rev-parse", "--show-toplevel"]).trim()
  } catch {
    root = path.resolve(topicDir, "..", "..", "..") // 退化：<root>/.rddf/plan-topics/<slug>
  }
  const slug = path.basename(path.resolve(topicDir))
  const lockDir = path.join(root, ".rddf", "state", "plan-topics", `${slug}.lock`)
  const ownerFile = path.join(lockDir, "owner")
  const sessionsFile = path.join(root, ".rddf", "state", "plan-sessions.json")

  const present = existsSync(lockDir)
  const owner = present && existsSync(ownerFile) ? readFileSync(ownerFile, "utf8").trim() : null
  let binding: unknown = null
  if (existsSync(sessionsFile)) {
    try {
      const sessions = JSON.parse(readFileSync(sessionsFile, "utf8")) as Record<string, unknown>
      binding = sessions[owner ?? ""] ?? null
    } catch {
      binding = { error: "plan-sessions.json 不可解析" }
    }
  }

  if (opts.json) emitJson({ present, owner, binding })
  else process.stdout.write(`present=${present} owner=${owner ?? "-"} binding=${JSON.stringify(binding)}\n`)
  return 0
}

// ── main ─────────────────────────────────────────────────────────────────────

function main(): number {
  const argv = process.argv.slice(2)
  const cmd = argv.shift()
  if (!cmd) usage("缺少子命令")
  const opts = parseArgs(argv)
  switch (cmd) {
    case "check":
      return cmdCheck(opts)
    case "scope-check":
      return cmdScopeCheck(opts)
    case "lock":
      return cmdLock(opts)
    default:
      return usage(`未知子命令 ${cmd}`)
  }
}

process.exit(main())
