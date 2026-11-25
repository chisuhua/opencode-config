#!/usr/bin/env bun
/**
 * plan-topic-check —— plan 侧协作 topic 的机械判据 CLI
 *
 * 用法:
 *   plan-topic-check check <topic-dir> [--json] [--allow-empty] [--phase dispatch|final]
 *   plan-topic-check ready <topic-dir> [--json]
 *   plan-topic-check scope-check <topic-dir> <node-id> --baseline <ref|sha> [--json]
 *   plan-topic-check lock <topic-dir> [--json]
 *   plan-topic-check claim <topic-dir> <node-id> [--agent <name>]
 *   plan-topic-check close <topic-dir> <node-id>
 *   plan-topic-check reap  <topic-dir> <node-id> --confirm
 *   plan-topic-check cancel <topic-dir> <node-id> --reason <text> [--cascade] [--detach <node-id>]
 *
 * 退出码（四值互斥）:
 *   0 = 无**阻断**项（info 不阻断 ⇒ violations[] 可能非空；见 isBlocking）
 *   1 = 有阻断违规 / 操作被拒（逐条列出 / --json 的 violations[] 带 severity）
 *   2 = 用法错误（stdout 不含违规列表）
 *   3 = graph.json 缺失或不可解析（stdout 不含违规列表）
 */
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import {
  PlanTopicError,
  checkTopic,
  collectInputDrift,
  currentInputProjection,
  deriveProgress,
  deriveStatus,
  dispatchableNodes,
  graphStructureHash,
  isBlocking,
  isInFlight,
  isLivenessStale,
  loadGraph,
  openAttempt,
  reportTopic,
  type CheckPhase,
  type Graph,
  type Node,
  type TopicReport,
  type Violation,
} from "../lib/plan-topics.ts"

interface Options {
  json: boolean
  allowEmpty: boolean
  phase: CheckPhase
  baseline?: string
  agent?: string
  reason?: string
  cascade: boolean
  detach: string[]
  confirm: boolean
  positional: string[]
}

function usage(msg: string): never {
  process.stderr.write(`用法错误：${msg}\n`)
  process.stderr.write(
    [
      "plan-topic-check check <topic-dir> [--json] [--allow-empty] [--phase dispatch|final]",
      "plan-topic-check ready <topic-dir> [--json]",
      "plan-topic-check scope-check <topic-dir> <node-id> --baseline <ref|sha> [--json]",
      "plan-topic-check lock <topic-dir> [--json]",
      "plan-topic-check claim <topic-dir> <node-id> [--agent <name>]",
      "plan-topic-check close <topic-dir> <node-id>",
      "plan-topic-check reap <topic-dir> <node-id> --confirm",
      "plan-topic-check cancel <topic-dir> <node-id> --reason <text> [--cascade] [--detach <node-id>]",
    ].join("\n") + "\n",
  )
  process.exit(2)
}

const PHASES: CheckPhase[] = ["dispatch", "final"]

function parsePhase(v: string | undefined): CheckPhase {
  if (!v) usage("--phase 缺少值")
  if (!PHASES.includes(v as CheckPhase)) usage(`--phase 只能是 ${PHASES.join("|")}（实际：${v}）`)
  return v as CheckPhase
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    json: false,
    allowEmpty: false,
    phase: "final",
    cascade: false,
    detach: [],
    confirm: false,
    positional: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--json") opts.json = true
    else if (a === "--allow-empty") opts.allowEmpty = true
    else if (a === "--phase") opts.phase = parsePhase(argv[++i])
    else if (a.startsWith("--phase=")) opts.phase = parsePhase(a.slice("--phase=".length))
    else if (a === "--cascade") opts.cascade = true
    else if (a === "--confirm") opts.confirm = true
    else if (a === "--detach") {
      const v = argv[++i]
      if (!v) usage("--detach 缺少值")
      opts.detach.push(v)
    } else if (a.startsWith("--detach=")) opts.detach.push(a.slice("--detach=".length))
    else if (a === "--agent") {
      const v = argv[++i]
      if (!v) usage("--agent 缺少值")
      opts.agent = v
    } else if (a.startsWith("--agent=")) opts.agent = a.slice("--agent=".length)
    else if (a === "--reason") {
      const v = argv[++i]
      if (!v) usage("--reason 缺少值")
      opts.reason = v
    } else if (a.startsWith("--reason=")) opts.reason = a.slice("--reason=".length)
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

/**
 * 退出码只看**阻断项**：`cache_behind` 是缓存滞后（info），并行执行期间必然出现，
 * 不该把健康系统判红 —— 否则「派发前 check 必须 exit 0」这条纪律无处可用。
 *
 * `extra` 携带 D11 的 `converged` + `summary`；⚠ **`converged`/`summary` 恒按 `final` 口径派生**，
 * 而 `violations` 与退出码按 `--phase` ⇒ dispatch 下可出现 `ok=true ∧ converged=false`（健康但未完）。
 */
function emitViolations(opts: Options, violations: Violation[], extra?: Record<string, unknown>): number {
  const blocking = violations.filter(isBlocking)
  if (opts.json) {
    emitJson({
      ok: blocking.length === 0,
      violations: violations.map((v) => ({ ...v, severity: isBlocking(v) ? "error" : "info" })),
      ...(extra ?? {}),
    })
  } else if (violations.length > 0) {
    for (const v of violations) {
      const tag = isBlocking(v) ? "" : "[info] "
      process.stdout.write(`${tag}${v.code}${v.node ? ` [${v.node}]` : ""}: ${v.detail}\n`)
    }
  } else {
    process.stdout.write("OK：无违规\n")
  }
  return blocking.length === 0 ? 0 : 1
}

// ── check ────────────────────────────────────────────────────────────────────

function cmdCheck(opts: Options): number {
  const [topicDir] = opts.positional
  if (!topicDir) usage("check 需要 <topic-dir>")

  let violations: Violation[]
  let report: TopicReport | undefined
  try {
    loadGraph(topicDir) // schema / 缺失 ⇒ exit 3
    violations = checkTopic(topicDir, { allowEmpty: opts.allowEmpty, phase: opts.phase })
    report = reportTopic(topicDir, { allowEmpty: opts.allowEmpty })
  } catch (e) {
    if (e instanceof PlanTopicError) {
      // graph.json 缺失 / 不可解析 / schema 违规 ⇒ 3（stdout 不含违规列表）
      process.stderr.write(`${e.code}: ${e.message}\n`)
      return 3
    }
    throw e
  }
  return emitViolations(
    opts,
    violations,
    report ? { converged: report.converged, summary: report.summary } : undefined,
  )
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
    // 「变更」= 相对基线有差异的已跟踪文件 + 全部未跟踪文件（`git diff` 不含未跟踪）
    const diffPaths = git(root, ["diff", "--name-only", opts.baseline!])
      .split("\n")
      .filter(Boolean)
    const untracked = git(root, ["ls-files", "--others", "--exclude-standard"])
      .split("\n")
      .filter(Boolean)
    changed = [...new Set([...diffPaths, ...untracked])]
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

// ── ready ────────────────────────────────────────────────────────────────────

/**
 * D2 判据 2 的机械载体：列出当前可派发的节点
 * （deps 全 done + BRIEF 存在 + 自身非 done/cancelled + **不在飞**，D10）。
 */
function cmdReady(opts: Options): number {
  const [topicDir] = opts.positional
  if (!topicDir) usage("ready 需要 <topic-dir>")

  let ready: string[]
  let in_flight: Array<{ node: string; started_at: string; liveness_stale: boolean }>
  let input_drift: Array<{ node: string; changed: string[] }>
  try {
    const g = loadGraph(topicDir)
    ready = dispatchableNodes(g, topicDir)
    in_flight = []
    for (const n of g.nodes) {
      const open = openAttempt(n)
      if (open) {
        in_flight.push({
          node: n.id,
          started_at: open.started_at,
          liveness_stale: isLivenessStale(topicDir, n, open),
        })
      }
    }
    input_drift = collectInputDrift(g, topicDir)
  } catch (e) {
    if (e instanceof PlanTopicError) {
      process.stderr.write(`${e.code}: ${e.message}\n`)
      return 3
    }
    throw e
  }
  if (opts.json) emitJson({ ready, in_flight, input_drift })
  else if (ready.length === 0) process.stdout.write("无可派发节点\n")
  else process.stdout.write(ready.join("\n") + "\n")
  return 0
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
  // D5：运行态绑定改为**每会话一文件** ⇒ binding 按 owner **直接构造路径**（扫目录仅用于枚举）
  const sessionsDir = path.join(root, ".rddf", "state", "plan-sessions")

  const present = existsSync(lockDir)
  const owner = present && existsSync(ownerFile) ? readFileSync(ownerFile, "utf8").trim() : null
  let binding: unknown = null
  if (owner) {
    const f = path.join(sessionsDir, `${owner}.json`)
    if (existsSync(f)) {
      try {
        binding = JSON.parse(readFileSync(f, "utf8"))
      } catch {
        binding = { error: "会话绑定文件不可解析" }
      }
    }
    // owner 存在但文件缺失（崩溃窗口 / 遗留态）⇒ binding = null（消费方读作「未知」而非「无绑定」）
  }

  if (opts.json) emitJson({ present, owner, binding })
  else process.stdout.write(`present=${present} owner=${owner ?? "-"} binding=${JSON.stringify(binding)}\n`)
  return 0
}

// ── 写侧：per-topic 短锁 + 原子写（D9 / D10）────────────────────────────────

/** graph.json 写互斥锁的**硬超时**（陈旧回收的上界）—— 不按 mtime 判死（持有者慢 ≠ 死） */
const GRAPH_LOCK_TIMEOUT_MS = Number(process.env.RDDF_PLAN_GRAPH_LOCK_TIMEOUT_MS ?? 60_000)

function repoRootOf(topicDir: string): string {
  try {
    return git(topicDir, ["rev-parse", "--show-toplevel"]).trim()
  } catch {
    return path.resolve(topicDir, "..", "..", "..") // 退化：<root>/.rddf/plan-topics/<slug>
  }
}

/** 原子获取写锁（`mkdir` 原子）；超时未拿到 ⇒ 抛错；陈旧（超硬超时）⇒ 回收后重试 */
function acquireGraphLock(root: string, slug: string): () => void {
  const dir = path.join(root, ".rddf", "state", "plan-topics", `${slug}.graph.lock`)
  mkdirSync(path.dirname(dir), { recursive: true })
  const deadline = Date.now() + GRAPH_LOCK_TIMEOUT_MS
  for (;;) {
    try {
      mkdirSync(dir) // 原子：已存在 ⇒ EEXIST
      writeFileSync(path.join(dir, "created_at"), new Date().toISOString())
      writeFileSync(path.join(dir, "owner"), process.env.OPENCODE_SESSION_ID ?? "cli")
      return () => {
        try {
          rmSync(dir, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") throw e
      let created = 0
      try {
        created = Date.parse(readFileSync(path.join(dir, "created_at"), "utf8"))
      } catch {
        created = 0
      }
      // 陈旧回收：**硬超时**为上界（不按 mtime 判死 ⇒ 持有者慢不会被误回收 ⇒ 两个 claim 不会同进临界区）
      const age = created > 0 ? Date.now() - created : Number.POSITIVE_INFINITY
      if (age > GRAPH_LOCK_TIMEOUT_MS) {
        rmSync(dir, { recursive: true, force: true })
        continue
      }
      if (Date.now() > deadline) {
        throw new Error(`graph.json 写锁获取超时（${GRAPH_LOCK_TIMEOUT_MS}ms）：${dir}`)
      }
      Bun.sleepSync(25)
    }
  }
}

/** 原子写 graph.json（临时文件 + rename）⇒ 读者不会看到半截 JSON */
function writeGraphAtomic(topicDir: string, g: Graph): void {
  const p = path.join(topicDir, "graph.json")
  const tmp = `${p}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(g, null, 2) + "\n")
  renameSync(tmp, p)
}

function findNode(g: Graph, id: string): Node | undefined {
  return g.nodes.find((n) => n.id === id)
}

/** 活跃下游（派生 status 非 done 且非 cancelled，且依赖给定的已取消节点） */
function activeDownstreamOf(g: Graph, status: Map<string, string>, fromId: string): Node[] {
  return g.nodes.filter(
    (n) => !n.cancelled && status.get(n.id) !== "done" && n.deps.includes(fromId),
  )
}

/** 传递闭包：从 fromId 出发的全部活跃下游 */
function transitiveActiveDownstream(
  g: Graph,
  status: Map<string, string>,
  fromId: string,
): Node[] {
  const seen = new Set<string>()
  const stack = [fromId]
  while (stack.length > 0) {
    const cur = stack.pop() as string
    for (const k of activeDownstreamOf(g, status, cur)) {
      if (seen.has(k.id)) continue
      seen.add(k.id)
      stack.push(k.id)
    }
  }
  return [...seen].map((id) => findNode(g, id)).filter((n): n is Node => n !== undefined)
}

// ── claim / close / reap / cancel ─────────────────────────────────────────────

/**
 * `claim` —— **先登记后 spawn**（D10）：spawn 前登记 attempt（含输入投影快照）。
 * 机械闸门：已有未闭合 attempt ⇒ **拒绝且文件不动**（双派发的闸门）。
 */
function cmdClaim(opts: Options): number {
  const [topicDir, nodeId] = opts.positional
  if (!topicDir) usage("claim 需要 <topic-dir>")
  if (!nodeId) usage("claim 需要 <node-id>")

  const root = repoRootOf(topicDir)
  const slug = path.basename(path.resolve(topicDir))
  const release = acquireGraphLock(root, slug)
  try {
    const g = loadGraph(topicDir)
    const node = findNode(g, nodeId)
    if (!node) {
      process.stderr.write(`节点不存在：${nodeId}\n`)
      return 1
    }
    if (node.cancelled) {
      process.stderr.write(`节点已取消，不得派发：${nodeId}\n`)
      return 1
    }
    if (isInFlight(node)) {
      process.stderr.write(`已有未闭合 attempt（拒绝重复派发）：${nodeId}\n`)
      return 1
    }
    const status = deriveStatus(g, topicDir)
    if (status.get(nodeId) === "done") {
      process.stderr.write(`节点已完成，不得派发：${nodeId}\n`)
      return 1
    }
    if (node.deps.some((d) => status.get(d) !== "done")) {
      process.stderr.write(`deps 未全 done（不得派发）：${nodeId}\n`)
      return 1
    }
    if (!existsSync(path.join(topicDir, "nodes", nodeId, "BRIEF.md"))) {
      process.stderr.write(`缺 BRIEF.md（不得派发）：${nodeId}\n`)
      return 1
    }
    const now = new Date().toISOString()
    // precheck：派发前的 dispatch 口径 check（结果留痕；不因此拒绝 —— 拒绝面只限本节点）
    const pre = checkTopic(topicDir, { phase: "dispatch" })
    const preExit = pre.filter(isBlocking).length === 0 ? 0 : 1
    const attempt = {
      agent: opts.agent ?? "plan-worker",
      started_at: now,
      precheck: { at: now, exit: preExit, graph_rev: graphStructureHash(topicDir, g) },
      input: currentInputProjection(topicDir, node),
    }
    node.attempts.push(attempt)
    writeGraphAtomic(topicDir, g)
    emitJson({ ok: true, node: nodeId, attempt })
    return 0
  } catch (e) {
    if (e instanceof PlanTopicError) {
      process.stderr.write(`${e.code}: ${e.message}\n`)
      return 3
    }
    throw e
  } finally {
    release()
  }
}

/** `close` —— 闭合节点的未闭合 attempt（离开在飞的唯一方式之一） */
function cmdClose(opts: Options, reap = false): number {
  const [topicDir, nodeId] = opts.positional
  if (!topicDir) usage(`${reap ? "reap" : "close"} 需要 <topic-dir>`)
  if (!nodeId) usage(`${reap ? "reap" : "close"} 需要 <node-id>`)
  if (reap && !opts.confirm) {
    process.stderr.write("reap 需要 --confirm（接管必须显式确认；D10：不做 TTL 自动接管）\n")
    return 1
  }

  const root = repoRootOf(topicDir)
  const slug = path.basename(path.resolve(topicDir))
  const release = acquireGraphLock(root, slug)
  try {
    const g = loadGraph(topicDir)
    const node = findNode(g, nodeId)
    if (!node) {
      process.stderr.write(`节点不存在：${nodeId}\n`)
      return 1
    }
    const open = openAttempt(node)
    if (!open) {
      process.stderr.write(`该节点没有未闭合 attempt（无对象可闭合）：${nodeId}\n`)
      return 1
    }
    const now = new Date().toISOString()
    open.finished_at = now
    if (reap) {
      // 接手即复核（D10）：reap 的显式确认同时写复核豁免 ⇒ 投影若已变也不再阻断
      open.inputs_reviewed = { at: now, note: "reap 接手复核" }
    }
    writeGraphAtomic(topicDir, g)
    emitJson({ ok: true, node: nodeId, attempt: open })
    return 0
  } catch (e) {
    if (e instanceof PlanTopicError) {
      process.stderr.write(`${e.code}: ${e.message}\n`)
      return 3
    }
    throw e
  } finally {
    release()
  }
}

/**
 * `cancel` —— 取消一个节点（D9）：**一次原子写**内完成
 * 「补/闭合 attempt 的 finished_at → 冻结该节点已闭合 attempt 的输入投影 → 置 `cancelled`
 *  → 回填缓存 `status: "cancelled"` → 消解活跃下游」。
 * 门控：① 禁止「完成后取消」；② 活跃下游必须**显式**处置（`--cascade` 或 `--detach`），默认拒绝。
 */
function cmdCancel(opts: Options): number {
  const [topicDir, nodeId] = opts.positional
  if (!topicDir) usage("cancel 需要 <topic-dir>")
  if (!nodeId) usage("cancel 需要 <node-id>")
  if (!opts.reason || opts.reason.trim().length === 0) {
    process.stderr.write("cancel 需要 --reason <text>（取消必须留理由）\n")
    return 1
  }

  const root = repoRootOf(topicDir)
  const slug = path.basename(path.resolve(topicDir))
  const release = acquireGraphLock(root, slug)
  try {
    const g = loadGraph(topicDir)
    const status = deriveStatus(g, topicDir)
    const node = findNode(g, nodeId)
    if (!node) {
      process.stderr.write(`节点不存在：${nodeId}\n`)
      return 1
    }
    if (node.cancelled) {
      process.stderr.write(`节点已取消：${nodeId}\n`)
      return 1
    }
    if (status.get(nodeId) === "done") {
      process.stderr.write(`禁止「完成后取消」（该节点已 done）：${nodeId}\n`)
      return 1
    }

    const downstream = transitiveActiveDownstream(g, status, nodeId)
    const detached = new Set(opts.detach)
    for (const id of detached) {
      if (!downstream.some((n) => n.id === id)) {
        process.stderr.write(`--detach 指定的节点不是活跃下游：${id}\n`)
        return 1
      }
    }
    const unresolved = downstream.filter((n) => !detached.has(n.id))
    if (unresolved.length > 0 && !opts.cascade) {
      process.stderr.write(
        `活跃下游未消解：${unresolved.map((n) => n.id).join(", ")}（须 --cascade 或逐个 --detach）\n`,
      )
      return 1
    }

    const now = new Date().toISOString()
    const cancelOne = (target: Node, reason: string): void => {
      const open = openAttempt(target)
      if (open) open.finished_at = now
      const proj = currentInputProjection(topicDir, target)
      for (const a of target.attempts) if (a.finished_at !== undefined) a.input = proj // 冻结投影
      target.cancelled = { by: "parent", reason, at: now }
      target.status = "cancelled"
      target.progress = deriveProgress(topicDir, target)
    }
    cancelOne(node, opts.reason.trim())

    // 消解活跃下游：--detach 摘边；--cascade 级联取消（递归）
    const resolve = (fromId: string): void => {
      for (const k of activeDownstreamOf(g, status, fromId)) {
        if (detached.has(k.id)) {
          k.deps = k.deps.filter((x) => x !== fromId)
          continue
        }
        if (opts.cascade) {
          cancelOne(k, `级联自 ${fromId}`)
          resolve(k.id)
        }
      }
    }
    resolve(nodeId)

    writeGraphAtomic(topicDir, g)
    emitJson({
      ok: true,
      node: nodeId,
      cancelled: g.nodes.filter((n) => n.cancelled).map((n) => ({ id: n.id, reason: n.cancelled?.reason })),
      detached: [...detached],
    })
    return 0
  } catch (e) {
    if (e instanceof PlanTopicError) {
      process.stderr.write(`${e.code}: ${e.message}\n`)
      return 3
    }
    throw e
  } finally {
    release()
  }
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
    case "ready":
      return cmdReady(opts)
    case "scope-check":
      return cmdScopeCheck(opts)
    case "lock":
      return cmdLock(opts)
    case "claim":
      return cmdClaim(opts)
    case "close":
      return cmdClose(opts, false)
    case "reap":
      return cmdClose(opts, true)
    case "cancel":
      return cmdCancel(opts)
    default:
      return usage(`未知子命令 ${cmd}`)
  }
}

process.exit(main())
