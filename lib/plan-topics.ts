/**
 * plan 侧多会话离线协作 —— 判据库（ADR-plan-multi-session-collaboration D2 / D5）
 *
 * 核心语义（**progress 与 status 正交**）：
 *   - `progress` = 纯磁盘派生（不看依赖）：TODO 全勾 ∧ RESULT 有实质内容 ⇒ complete
 *   - `status`   = 门控有效值：complete ∧ deps 全 done ∧ deliverables 存在非空 ⇒ done
 *   ⇒「子先干完而依赖未完成」是**合法状态**（progress=complete / status=blocked_by_deps），不得报错。
 *
 * 所有违规用 `Violation.code`（闭集）表达，供 CLI 与守卫断言消费。
 */
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

export type Progress = "todo" | "partial" | "complete"
export type Status = "pending" | "blocked_by_deps" | "done"
export type Owner = "parent" | "child"

export interface Precheck {
  at: string
  exit: number
  graph_rev?: string
}

export interface Attempt {
  agent: string
  started_at: string
  finished_at?: string
  precheck?: Precheck
  baseline?: string
}

export interface Node {
  id: string
  title: string
  deps: string[]
  owner: Owner
  status: Status
  progress: Progress
  attempts: Attempt[]
  deliverables: string[]
  brief_sha256?: string
}

export interface Graph {
  version: number
  topic: string
  nodes: Node[]
}

/** 违规码闭集（contract；CLI 的 --json 与守卫断言都依赖它） */
export type ViolationCode =
  | "schema_invalid"
  | "invalid_node_id"
  | "duplicate_node_id"
  | "cycle"
  | "dangling_dep"
  | "duplicate_dep"
  | "orphan_node_dir"
  | "missing_brief"
  | "cache_mismatch"
  | "brief_tampered"
  | "missing_deliverable"
  | "out_of_scope"
  | "empty_topic"
  | "git_error"

export interface Violation {
  code: ViolationCode
  node?: string
  detail: string
}

export class PlanTopicError extends Error {
  constructor(
    public code: ViolationCode,
    message: string,
  ) {
    super(message)
    this.name = "PlanTopicError"
  }
}

/** node id 字符集：小写字母/数字开头，后续允许 . _ -，最长 64 */
export const NODE_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/

/**
 * node id 黑名单 —— 防 `.gitignore` 把整个 node 目录误伤
 * （`.rddf/**\/*.lock`、`*.bak`、`.env`、`backup*` 都已存在）。
 */
export const NODE_ID_BLACKLIST_SUFFIX = [".lock", ".env", ".bak"]
export const NODE_ID_BLACKLIST_PREFIX = ["backup"]

export function assertValidNodeId(id: unknown): asserts id is string {
  if (typeof id !== "string" || id.length === 0) {
    throw new PlanTopicError("invalid_node_id", `node id 必须是非空字符串：${JSON.stringify(id)}`)
  }
  if (!NODE_ID_RE.test(id)) {
    throw new PlanTopicError("invalid_node_id", `node id 不合法（须匹配 ${NODE_ID_RE}）：${id}`)
  }
  if (NODE_ID_BLACKLIST_SUFFIX.some((s) => id.endsWith(s))) {
    throw new PlanTopicError("invalid_node_id", `node id 命中黑名单后缀（会被 .gitignore 误伤）：${id}`)
  }
  if (NODE_ID_BLACKLIST_PREFIX.some((p) => id.startsWith(p))) {
    throw new PlanTopicError("invalid_node_id", `node id 命中黑名单前缀（会被 .gitignore 误伤）：${id}`)
  }
}

const STATUSES: Status[] = ["pending", "blocked_by_deps", "done"]
const PROGRESSES: Progress[] = ["todo", "partial", "complete"]
const OWNERS: Owner[] = ["parent", "child"]

export function parseGraph(raw: string): Graph {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new PlanTopicError("schema_invalid", `graph.json 不是合法 JSON：${(e as Error).message}`)
  }
  assertSchema(parsed)
  return parsed
}

export function assertSchema(g: unknown): asserts g is Graph {
  if (typeof g !== "object" || g === null || Array.isArray(g)) {
    throw new PlanTopicError("schema_invalid", "graph.json 顶层必须是对象")
  }
  const obj = g as Record<string, unknown>
  if (obj.version !== 1) {
    throw new PlanTopicError("schema_invalid", `version 必须是 1（实际：${JSON.stringify(obj.version)}）`)
  }
  if (typeof obj.topic !== "string" || obj.topic.length === 0) {
    throw new PlanTopicError("schema_invalid", "topic 必须是非空字符串")
  }
  if (!Array.isArray(obj.nodes)) {
    throw new PlanTopicError("schema_invalid", "nodes 必须是数组")
  }
  for (const [i, n] of (obj.nodes as unknown[]).entries()) {
    if (typeof n !== "object" || n === null || Array.isArray(n)) {
      throw new PlanTopicError("schema_invalid", `nodes[${i}] 必须是对象`)
    }
    const node = n as Record<string, unknown>
    const where = `nodes[${i}]`
    if (typeof node.id !== "string") throw new PlanTopicError("schema_invalid", `${where}.id 必须是字符串`)
    if (typeof node.title !== "string") throw new PlanTopicError("schema_invalid", `${where}.title 必须是字符串`)
    if (!Array.isArray(node.deps) || node.deps.some((d) => typeof d !== "string")) {
      throw new PlanTopicError("schema_invalid", `${where}.deps 必须是字符串数组`)
    }
    if (!OWNERS.includes(node.owner as Owner)) {
      throw new PlanTopicError("schema_invalid", `${where}.owner 必须是 ${OWNERS.join("|")}（实际：${JSON.stringify(node.owner)}）`)
    }
    if (!STATUSES.includes(node.status as Status)) {
      throw new PlanTopicError("schema_invalid", `${where}.status 必须是 ${STATUSES.join("|")}（实际：${JSON.stringify(node.status)}）`)
    }
    if (!PROGRESSES.includes(node.progress as Progress)) {
      throw new PlanTopicError("schema_invalid", `${where}.progress 必须是 ${PROGRESSES.join("|")}（实际：${JSON.stringify(node.progress)}）`)
    }
    if (!Array.isArray(node.attempts)) {
      throw new PlanTopicError("schema_invalid", `${where}.attempts 必须是数组`)
    }
    for (const [j, a] of (node.attempts as unknown[]).entries()) {
      if (typeof a !== "object" || a === null || Array.isArray(a)) {
        throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}] 必须是对象`)
      }
      const att = a as Record<string, unknown>
      if (typeof att.agent !== "string") throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}].agent 必须是字符串`)
      if (typeof att.started_at !== "string") throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}].started_at 必须是字符串`)
      if (att.finished_at !== undefined && typeof att.finished_at !== "string") {
        throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}].finished_at 必须是字符串（可选）`)
      }
    }
    if (!Array.isArray(node.deliverables) || node.deliverables.some((d) => typeof d !== "string")) {
      throw new PlanTopicError("schema_invalid", `${where}.deliverables 必须是字符串数组`)
    }
    if (node.brief_sha256 !== undefined && typeof node.brief_sha256 !== "string") {
      throw new PlanTopicError("schema_invalid", `${where}.brief_sha256 必须是字符串（可选）`)
    }
  }
}

// ── 图结构判据 ────────────────────────────────────────────────────────────────

export function assertUniqueNodeIds(g: Graph): void {
  const seen = new Set<string>()
  for (const n of g.nodes) {
    if (seen.has(n.id)) {
      throw new PlanTopicError("duplicate_node_id", `重复的 node id：${n.id}`)
    }
    seen.add(n.id)
  }
}

export function assertDepsExist(g: Graph): void {
  const ids = new Set(g.nodes.map((n) => n.id))
  for (const n of g.nodes) {
    const seenDep = new Set<string>()
    for (const d of n.deps) {
      if (!ids.has(d)) {
        throw new PlanTopicError("dangling_dep", `节点 ${n.id} 的依赖不存在：${d}`)
      }
      if (seenDep.has(d)) {
        throw new PlanTopicError("duplicate_dep", `节点 ${n.id} 的 deps 内重复：${d}`)
      }
      seenDep.add(d)
    }
  }
}

export function assertAcyclic(g: Graph): void {
  const adj = new Map<string, string[]>()
  for (const n of g.nodes) adj.set(n.id, n.deps)
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  for (const n of g.nodes) color.set(n.id, WHITE)

  const visit = (id: string, stack: string[]): void => {
    color.set(id, GRAY)
    for (const dep of adj.get(id) ?? []) {
      const c = color.get(dep)
      if (c === GRAY) {
        throw new PlanTopicError("cycle", `依赖成环：${[...stack, id, dep].join(" → ")}`)
      }
      if (c === WHITE) visit(dep, [...stack, id])
    }
    color.set(id, BLACK)
  }

  for (const n of g.nodes) {
    if (color.get(n.id) === WHITE) visit(n.id, [])
  }
}

// ── 磁盘派生 ──────────────────────────────────────────────────────────────────

export const STATUS_SENTINEL = "## STATUS: COMPLETE"

/** 剥离 fenced code block（``` … ```），防止代码示例里的 checkbox 被计入 */
function stripFenced(text: string): string {
  return text.replace(/^```[\s\S]*?^```$/gm, "")
}

function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "")
}

/** 解析 TODO.md 的 checkbox 计数：[总数, 已勾数]；零 checkbox ⇒ [0,0] */
export function countCheckboxes(todoText: string): [number, number] {
  const cleaned = stripFenced(stripHtmlComments(todoText))
  let total = 0
  let done = 0
  for (const line of cleaned.split(/\r?\n/)) {
    // 允许一个二级缩进；只认 `- [ ]` / `- [x]` / `- [X]`
    const m = /^\s{0,2}- \[( |x|X)\] /.exec(line)
    if (!m) continue
    total++
    if (m[1].toLowerCase() === "x") done++
  }
  return [total, done]
}

/** RESULT.md 是否「有实质内容」：剥离 fenced code / HTML 注释 / 空白 / 单一标题 / 哨兵行后仍有正文 */
export function isNonEmptyResult(resultText: string): boolean {
  const cleaned = stripFenced(stripHtmlComments(resultText))
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^#{1,6}\s/.test(l)) // 标题行不计
    .filter((l) => l !== STATUS_SENTINEL)
  return lines.length > 0
}

function readIfExists(p: string): string | undefined {
  try {
    if (!existsSync(p)) return undefined
    if (!statSync(p).isFile()) return undefined
    return readFileSync(p, "utf8")
  } catch {
    return undefined
  }
}

export function deriveProgress(topicDir: string, node: Node): Progress {
  const todo = readIfExists(path.join(topicDir, "nodes", node.id, "TODO.md"))
  if (todo === undefined) return "todo"
  const [total, done] = countCheckboxes(todo)
  if (total === 0) return "todo"
  if (done < total) return "partial"
  const result = readIfExists(path.join(topicDir, "nodes", node.id, "RESULT.md"))
  if (result === undefined) return "partial"
  return isNonEmptyResult(result) ? "complete" : "partial"
}

/** 交付物是否真实存在且非空（相对 topic 根） */
function deliverableOk(topicDir: string, rel: string): boolean {
  const abs = path.resolve(topicDir, rel)
  // 防 `..` 逃逸出 topic 根
  const relToTopic = path.relative(path.resolve(topicDir), abs)
  if (relToTopic.startsWith("..") || path.isAbsolute(relToTopic)) return false
  try {
    if (!existsSync(abs)) return false
    const st = statSync(abs)
    return st.isFile() && st.size > 0
  } catch {
    return false
  }
}

/**
 * 门控状态：迭代到不动点（deps 的 status 可能也是 blocked_by_deps）。
 * 返回 id → Status。
 */
export function deriveStatus(g: Graph, topicDir: string): Map<string, Status> {
  const progress = new Map<string, Progress>()
  for (const n of g.nodes) progress.set(n.id, deriveProgress(topicDir, n))

  const status = new Map<string, Status>()
  for (const n of g.nodes) status.set(n.id, n.deps.length === 0 ? "pending" : "blocked_by_deps")

  // 迭代到不动点
  let changed = true
  let guard = 0
  while (changed && guard++ < g.nodes.length + 2) {
    changed = false
    for (const n of g.nodes) {
      const depsDone = n.deps.every((d) => status.get(d) === "done")
      const deliverablesOk = n.deliverables.length > 0 && n.deliverables.every((d) => deliverableOk(topicDir, d))
      const next: Status =
        progress.get(n.id) === "complete" && depsDone && deliverablesOk
          ? "done"
          : n.deps.length > 0 && !depsDone
            ? "blocked_by_deps"
            : "pending"
      if (status.get(n.id) !== next) {
        status.set(n.id, next)
        changed = true
      }
    }
  }
  return status
}

// ── 违规收集 ──────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

export function assertCacheConsistent(g: Graph, topicDir: string): Violation[] {
  const derivedStatus = deriveStatus(g, topicDir)
  const out: Violation[] = []
  for (const n of g.nodes) {
    const p = deriveProgress(topicDir, n)
    const s = derivedStatus.get(n.id)
    if (n.progress !== p) {
      out.push({ code: "cache_mismatch", node: n.id, detail: `progress 缓存=${n.progress} 派生=${p}` })
    }
    if (n.status !== s) {
      out.push({ code: "cache_mismatch", node: n.id, detail: `status 缓存=${n.status} 派生=${s}` })
    }
  }
  return out
}

export function assertBriefIntegrity(g: Graph, topicDir: string): Violation[] {
  const out: Violation[] = []
  for (const n of g.nodes) {
    if (n.brief_sha256 === undefined) continue
    const p = path.join(topicDir, "nodes", n.id, "BRIEF.md")
    const text = readIfExists(p)
    if (text === undefined) {
      out.push({ code: "brief_tampered", node: n.id, detail: `声明了 brief_sha256 但 BRIEF.md 不存在` })
      continue
    }
    if (sha256(text) !== n.brief_sha256) {
      out.push({ code: "brief_tampered", node: n.id, detail: `BRIEF.md 哈希与台账不符（被改过）` })
    }
  }
  return out
}

export function assertNoOrphanNodes(g: Graph, topicDir: string): Violation[] {
  const out: Violation[] = []
  const ids = new Set(g.nodes.map((n) => n.id))
  const nodesDir = path.join(topicDir, "nodes")
  if (existsSync(nodesDir)) {
    for (const ent of readdirSync(nodesDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue
      if (!ids.has(ent.name)) {
        out.push({ code: "orphan_node_dir", detail: `nodes/${ent.name}/ 存在但 graph.json 无该节点` })
      }
    }
  }
  for (const n of g.nodes) {
    if (!existsSync(path.join(topicDir, "nodes", n.id, "BRIEF.md"))) {
      out.push({ code: "missing_brief", node: n.id, detail: `nodes/${n.id}/BRIEF.md 不存在（该节点不可派发）` })
    }
  }
  return out
}

export function missingDeliverables(g: Graph, topicDir: string): Violation[] {
  const out: Violation[] = []
  for (const n of g.nodes) {
    for (const d of n.deliverables) {
      if (!deliverableOk(topicDir, d)) {
        out.push({ code: "missing_deliverable", node: n.id, detail: `交付物不存在或为空：${d}` })
      }
    }
  }
  return out
}

/** 节点是否可派发：deps 全 done ∧ BRIEF.md 存在 ∧ 自身非 done（非法 id 一律排除） */
export function dispatchableNodes(g: Graph, topicDir: string): string[] {
  const nodes = g.nodes.filter((n) => {
    try {
      assertValidNodeId(n.id)
      return true
    } catch {
      return false
    }
  })
  const status = deriveStatus({ ...g, nodes }, topicDir)
  return nodes
    .filter((n) => n.deps.every((d) => status.get(d) === "done"))
    .filter((n) => existsSync(path.join(topicDir, "nodes", n.id, "BRIEF.md")))
    .filter((n) => status.get(n.id) !== "done")
    .map((n) => n.id)
}

// ── 汇总 ──────────────────────────────────────────────────────────────────────

export function loadGraph(topicDir: string): Graph {
  const p = path.join(topicDir, "graph.json")
  if (!existsSync(p)) {
    throw new PlanTopicError("schema_invalid", `graph.json 不存在：${p}`)
  }
  return parseGraph(readFileSync(p, "utf8"))
}

export function checkTopic(topicDir: string, opts: { allowEmpty?: boolean } = {}): Violation[] {
  const g = loadGraph(topicDir)
  const out: Violation[] = []

  if (g.nodes.length === 0 && !opts.allowEmpty) {
    out.push({ code: "empty_topic", detail: "nodes 为空（造空 topic 不算完成；确需空 topic 用 --allow-empty）" })
  }

  // 结构判据（逐条收集，不因单条失败而中断；schema 已在 loadGraph 抛）
  for (const n of g.nodes) {
    try {
      assertValidNodeId(n.id)
    } catch (e) {
      if (e instanceof PlanTopicError) out.push({ code: "invalid_node_id", node: String(n.id), detail: e.message })
      else throw e
    }
  }
  try {
    assertUniqueNodeIds(g)
  } catch (e) {
    if (e instanceof PlanTopicError) out.push({ code: e.code, detail: e.message })
    else throw e
  }
  try {
    assertDepsExist(g)
  } catch (e) {
    if (e instanceof PlanTopicError) out.push({ code: e.code, detail: e.message })
    else throw e
  }
  try {
    assertAcyclic(g)
  } catch (e) {
    if (e instanceof PlanTopicError) out.push({ code: e.code, detail: e.message })
    else throw e
  }

  // ⚠ **只对合法 id 的节点做磁盘派生**：非法 id（`..` / 含 `/` / 黑名单）拼出的路径可能逃出 topic 根
  //   ⇒ 若用它拼 `nodes/<id>/TODO.md`，会把 topic 外的文件读进判定。
  const safeNodes: Node[] = []
  for (const n of g.nodes) {
    try {
      assertValidNodeId(n.id)
      safeNodes.push(n)
    } catch {
      /* 已在上面收集为 invalid_node_id */
    }
  }
  const safeGraph: Graph = { version: g.version, topic: g.topic, nodes: safeNodes }

  out.push(...assertCacheConsistent(safeGraph, topicDir))
  out.push(...assertBriefIntegrity(safeGraph, topicDir))
  out.push(...assertNoOrphanNodes(safeGraph, topicDir))
  out.push(...missingDeliverables(safeGraph, topicDir))

  return out
}
