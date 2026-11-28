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
export type Status = "pending" | "blocked_by_deps" | "done" | "cancelled"
export type Owner = "parent" | "child"

/**
 * 取消声明（D9）—— 父写进 `graph.json` 的**声明意图**（不是磁盘事实，也不是 status 自述）。
 * 形状（类型）由 schema 校验；取值（by / reason）由 `cancelled_unattributed` 判。
 */
export interface Cancelled {
  by: string
  reason: string
  at?: string
}

/**
 * 节点输入投影快照（D10 fence）—— claim 时刻的 `{BRIEF 哈希, deps, deliverables}`。
 * 比对时逐成分 diff ⇒ 能指名「变了什么」（brief / deps / deliverables）。
 */
export interface InputSnapshot {
  brief_sha256: string
  deps: string[]
  deliverables: string[]
}

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
  /** D10：claim 时刻的输入投影快照（fence 的比对基准） */
  input?: InputSnapshot
  /** D10：父的复核豁免写点（写它 ⇒ 该 attempt 的输入漂移不再阻断） */
  inputs_reviewed?: { at: string; note?: string }
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
  /** D9：取消声明（父写；派生时**短路优先于 done**） */
  cancelled?: Cancelled
}

export interface Graph {
  version: number
  topic: string
  nodes: Node[]
}

/**
 * 违规码闭集（contract；CLI 的 --json 与守卫断言都依赖它）。
 *
 * ⚠ **运行期唯一真源**：联合类型由本数组派生（`ViolationCode = (typeof VIOLATION_CODES)[number]`）
 * ⇒ 新增码只改这一处，**类型与运行期集合不可能漂移**。
 * ⚠ 为什么不用「类型 + 手抄数组」两份：本仓**没有 `tsc` 门禁**（`bun test` 只做类型擦除）⇒ 纯类型层的一致性
 *   断言**不产生任何运行期保护**；两份清单迟早漂移，而漂移后的闭集会让守卫断言**静默放行**新码。
 *   导出运行期常量后，`tests/plan-topics.test.ts` 的闭集断言直接引用本数组 ⇒ 白名单不可能再是陈旧快照。
 */
export const VIOLATION_CODES = [
  "schema_invalid",
  "invalid_node_id",
  "duplicate_node_id",
  "cycle",
  "dangling_dep",
  "duplicate_dep",
  "orphan_node_dir",
  "missing_brief",
  "cache_behind",
  "cache_ahead",
  "brief_tampered",
  "missing_deliverable",
  "cancelled_unattributed",
  "cancelled_open_attempt",
  "cancelled_dep_active",
  "duplicate_open_attempt",
  "stale_inputs",
  "out_of_scope",
  "empty_topic",
  "git_error",
  "settlement_missing",
  "settlement_failed_not_superseded",
  "topic_goal_unreviewed",
] as const

export type ViolationCode = (typeof VIOLATION_CODES)[number]

export interface Violation {
  code: ViolationCode
  node?: string
  detail: string
}

/**
 * 非阻断违规（info）。
 *
 * `cache_behind` = 缓存落后于磁盘。它**同时**覆盖两种情况，代码无法区分：
 *   ① 并行执行期间的正常滞后（父尚未回填缓存）；
 *   ② 磁盘进度倒退（TODO 被清空 / 格式化后计 0 / 工作被回滚）。
 * 接受 ② 的漏报，理由是：磁盘是权威（D2 派生优先）、重派幂等（D6 重建）、
 * 且 `final` 口径仍全量查交付物与 BRIEF —— **不是**因为「behind 必然良性」。
 * 反向的 `cache_ahead`（缓存声称完成而磁盘不支持）才是违规。
 */
export const INFO_CODES: ReadonlySet<ViolationCode> = new Set<ViolationCode>(["cache_behind"])

export function isBlocking(v: Violation): boolean {
  return !INFO_CODES.has(v.code)
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

const STATUSES: Status[] = ["pending", "blocked_by_deps", "done", "cancelled"]
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
      // D10：`input` 快照的形状校验（畸形 ⇒ schema_invalid，不落进「未知键静默忽略」通道）
      if (att.input !== undefined) {
        const inp = att.input
        if (typeof inp !== "object" || inp === null || Array.isArray(inp)) {
          throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}].input 必须是对象`)
        }
        const im = inp as Record<string, unknown>
        if (typeof im.brief_sha256 !== "string") {
          throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}].input.brief_sha256 必须是字符串`)
        }
        if (!Array.isArray(im.deps) || im.deps.some((d) => typeof d !== "string")) {
          throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}].input.deps 必须是字符串数组`)
        }
        if (!Array.isArray(im.deliverables) || im.deliverables.some((d) => typeof d !== "string")) {
          throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}].input.deliverables 必须是字符串数组`)
        }
      }
      if (att.inputs_reviewed !== undefined) {
        const rev = att.inputs_reviewed
        if (typeof rev !== "object" || rev === null || Array.isArray(rev)) {
          throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}].inputs_reviewed 必须是对象`)
        }
        const rm = rev as Record<string, unknown>
        if (typeof rm.at !== "string") {
          throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}].inputs_reviewed.at 必须是字符串`)
        }
        if (rm.note !== undefined && typeof rm.note !== "string") {
          throw new PlanTopicError("schema_invalid", `${where}.attempts[${j}].inputs_reviewed.note 必须是字符串（可选）`)
        }
      }
    }
    if (!Array.isArray(node.deliverables) || node.deliverables.some((d) => typeof d !== "string")) {
      throw new PlanTopicError("schema_invalid", `${where}.deliverables 必须是字符串数组`)
    }
    if (node.brief_sha256 !== undefined && typeof node.brief_sha256 !== "string") {
      throw new PlanTopicError("schema_invalid", `${where}.brief_sha256 必须是字符串（可选）`)
    }
    // D9：`cancelled` 的**形状**校验（by / reason / at 的类型）。
    //   取值不合规（by ≠ "parent"、reason 空）不是 schema 错 ⇒ 由 `cancelled_unattributed` 判。
    if (node.cancelled !== undefined) {
      const c = node.cancelled
      if (typeof c !== "object" || c === null || Array.isArray(c)) {
        throw new PlanTopicError("schema_invalid", `${where}.cancelled 必须是对象`)
      }
      const cm = c as Record<string, unknown>
      if (typeof cm.by !== "string") {
        throw new PlanTopicError("schema_invalid", `${where}.cancelled.by 必须是字符串`)
      }
      if (typeof cm.reason !== "string") {
        throw new PlanTopicError("schema_invalid", `${where}.cancelled.reason 必须是字符串`)
      }
      if (cm.at !== undefined && typeof cm.at !== "string") {
        throw new PlanTopicError("schema_invalid", `${where}.cancelled.at 必须是字符串（可选）`)
      }
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
 *
 * D9：`cancelled` **短路**（优先于 `done`）—— 取消是父的声明意图，磁盘事实不再改变它。
 * D10：在飞（attempt 未闭合）**不进入** status（status 保持纯磁盘/依赖派生）。
 */
export function deriveStatus(g: Graph, topicDir: string): Map<string, Status> {
  const progress = new Map<string, Progress>()
  for (const n of g.nodes) progress.set(n.id, deriveProgress(topicDir, n))

  const status = new Map<string, Status>()
  for (const n of g.nodes) {
    status.set(
      n.id,
      n.cancelled ? "cancelled" : n.deps.length === 0 ? "pending" : "blocked_by_deps",
    )
  }

  // 迭代到不动点
  let changed = true
  let guard = 0
  while (changed && guard++ < g.nodes.length + 2) {
    changed = false
    for (const n of g.nodes) {
      if (n.cancelled) continue // 终态：不参与迭代
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

// ── 在飞与输入投影（D10）────────────────────────────────────────────────────

/** 节点的**未闭合** attempt（末条缺 `finished_at`）—— D10 的「在飞」定义 */
export function openAttempt(node: Node): Attempt | undefined {
  const last = node.attempts[node.attempts.length - 1]
  if (!last) return undefined
  return last.finished_at === undefined ? last : undefined
}

export function isInFlight(node: Node): boolean {
  return openAttempt(node) !== undefined
}

/** 当前输入投影（与 claim 时刻的快照同形，供逐成分比对） */
export function currentInputProjection(topicDir: string, node: Node): InputSnapshot {
  const brief = readIfExists(path.join(topicDir, "nodes", node.id, "BRIEF.md"))
  return {
    brief_sha256: brief === undefined ? "" : sha256(brief),
    deps: [...node.deps],
    deliverables: [...node.deliverables],
  }
}

/** 逐成分 diff ⇒ 返回「变了哪些成分」（brief / deps / deliverables） */
export function diffInputProjection(snapshot: InputSnapshot, current: InputSnapshot): string[] {
  const changed: string[] = []
  if (snapshot.brief_sha256 !== current.brief_sha256) changed.push("brief")
  if (JSON.stringify(snapshot.deps) !== JSON.stringify(current.deps)) changed.push("deps")
  if (JSON.stringify(snapshot.deliverables) !== JSON.stringify(current.deliverables)) {
    changed.push("deliverables")
  }
  return changed
}

/** 活性陈旧阈值（ms）—— 只作**显示提示**，不授权接管（D10：worker 写无围栏 ⇒ 不做 TTL 自动接管） */
export function attemptStaleTtlMs(): number {
  const raw = Number(process.env.RDDF_PLAN_ATTEMPT_STALE_TTL_MS ?? 30 * 60 * 1000)
  return Number.isFinite(raw) && raw > 0 ? raw : 30 * 60 * 1000
}

/**
 * 图结构投影哈希（D10 溯源）—— `precheck.graph_rev` 的语义：
 * 只投影**结构**（节点 id / deps / deliverables / BRIEF 哈希），
 * **排除** `status` / `progress` / `attempts` ⇒ join 回填缓存**零污染**。
 */
export function graphStructureHash(topicDir: string, g: Graph): string {
  const nodes = g.nodes.map((n) => ({
    id: n.id,
    deps: [...n.deps],
    deliverables: [...n.deliverables],
    brief: currentInputProjection(topicDir, n).brief_sha256,
  }))
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return sha256(JSON.stringify(nodes))
}

// ── 违规收集 ──────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

/**
 * 缓存一致性 —— **两个方向分开判**：
 *   - `cache_ahead`（违规）：缓存声称 `done` / `complete`，而磁盘不支持 ⇒ 伪造完成。
 *   - `cache_behind`（info）：缓存落后于磁盘 ⇒ 并行执行期间的正常滞后。
 *
 * 只按「是否声称完成」分向，不按进度序比较：`status` 的 `pending` / `blocked_by_deps`
 * 不是单调序（依赖一完成 blocked → pending），按序比会把良性滞后误判成「超前」。
 */
export function assertCacheConsistent(
  g: Graph,
  topicDir: string,
  pre: { status?: Map<string, Status>; progress?: Map<string, Progress> } = {},
): Violation[] {
  const derivedStatus = pre.status ?? deriveStatus(g, topicDir)
  const out: Violation[] = []
  for (const n of g.nodes) {
    const p = pre.progress?.get(n.id) ?? deriveProgress(topicDir, n)
    const s = derivedStatus.get(n.id)
    if (n.progress !== p) {
      out.push({
        code: n.progress === "complete" ? "cache_ahead" : "cache_behind",
        node: n.id,
        detail: `progress 缓存=${n.progress} 派生=${p}`,
      })
    }
    if (n.status !== s) {
      out.push({
        code: n.status === "done" ? "cache_ahead" : "cache_behind",
        node: n.id,
        detail: `status 缓存=${n.status} 派生=${s}`,
      })
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

/**
 * 孤儿目录（磁盘有、图里无）恒为违规；
 * `briefRequired` 给定时只对该集合要求 `BRIEF.md` —— dispatch 阶段只要求「已到期」节点，
 * 否则整图预声明的多级 DAG 会在第一层就红（见 checkTopic 的阶段口径）。
 */
export function assertNoOrphanNodes(g: Graph, topicDir: string, briefRequired?: ReadonlySet<string>): Violation[] {
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
    if (briefRequired && !briefRequired.has(n.id)) continue
    if (!existsSync(path.join(topicDir, "nodes", n.id, "BRIEF.md"))) {
      out.push({ code: "missing_brief", node: n.id, detail: `nodes/${n.id}/BRIEF.md 不存在（该节点不可派发）` })
    }
  }
  return out
}

/**
 * 交付物缺失。`onlyFor` 给定时只检查该集合 —— dispatch 阶段只对「progress 已完成」的节点要求交付物
 * （交付物由 worker 产出，未完成的节点本来就没有）。
 */
export function missingDeliverables(g: Graph, topicDir: string, onlyFor?: ReadonlySet<string>): Violation[] {
  const out: Violation[] = []
  for (const n of g.nodes) {
    if (onlyFor && !onlyFor.has(n.id)) continue
    for (const d of n.deliverables) {
      if (!deliverableOk(topicDir, d)) {
        out.push({ code: "missing_deliverable", node: n.id, detail: `交付物不存在或为空：${d}` })
      }
    }
  }
  return out
}

/**
 * 取消完整性（D9）—— 三个阻断码：
 *   - `cancelled_unattributed`：`by ≠ "parent"` 或 `reason` 为空（声明无归属/无理由）
 *   - `cancelled_open_attempt`：cancelled 节点仍有未闭合 attempt（须先闭合）
 *   - `cancelled_dep_active`：**活跃**节点依赖 cancelled 节点 ⇒ 图停在坏状态
 *     （父必须在取消事务里级联取消或摘除该边）
 */
export function assertCancelledIntegrity(
  g: Graph,
  topicDir: string,
  derived?: Map<string, Status>,
): Violation[] {
  const out: Violation[] = []
  const status = derived ?? deriveStatus(g, topicDir)
  for (const n of g.nodes) {
    if (!n.cancelled) continue
    const c = n.cancelled
    if (c.by !== "parent" || c.reason.trim().length === 0) {
      out.push({
        code: "cancelled_unattributed",
        node: n.id,
        detail: `cancelled 缺少归属或理由（by=${JSON.stringify(c.by)}, reason=${JSON.stringify(c.reason)}）`,
      })
    }
    if (openAttempt(n)) {
      out.push({
        code: "cancelled_open_attempt",
        node: n.id,
        detail: `cancelled 节点仍有未闭合 attempt（取消事务必须闭合它）`,
      })
    }
  }
  const cancelledIds = new Set(g.nodes.filter((n) => n.cancelled).map((n) => n.id))
  for (const n of g.nodes) {
    if (n.cancelled) continue
    if (status.get(n.id) === "done") continue // 已完成（历史事实）
    const active = n.deps.filter((d) => cancelledIds.has(d))
    if (active.length > 0) {
      out.push({
        code: "cancelled_dep_active",
        node: n.id,
        detail: `活跃节点依赖已取消节点：${active.join(", ")}（须级联取消或摘除该边）`,
      })
    }
  }
  return out
}

/** 同一节点出现两条以上未闭合 attempt ⇒ 重复派发（D10，阻断级） */
export function assertNoDuplicateOpenAttempt(g: Graph): Violation[] {
  const out: Violation[] = []
  for (const n of g.nodes) {
    let open = 0
    for (const a of n.attempts) if (a.finished_at === undefined) open++
    if (open > 1) {
      out.push({
        code: "duplicate_open_attempt",
        node: n.id,
        detail: `同一节点有 ${open} 条未闭合 attempt（重复派发）`,
      })
    }
  }
  return out
}

/**
 * 输入漂移（D10 fence）—— **仅对已闭合 attempt**、**仅在 `final` 口径**产生（阻断级）。
 * 每个节点**恰好一条**（跨 attempt 聚合成分）⇒ V27 的「恰好一条」可断言。
 * 父写了 `inputs_reviewed` ⇒ 复核豁免（不再阻断）。
 */
export function assertNoStaleInputs(g: Graph, topicDir: string): Violation[] {
  const out: Violation[] = []
  for (const n of g.nodes) {
    if (n.cancelled) continue // cancelled 节点豁免（取消事务已冻结其投影）
    const changed = new Set<string>()
    for (const a of n.attempts) {
      if (a.finished_at === undefined) continue // 在飞不判（由 input_drift 暴露）
      if (!a.input) continue
      if (a.inputs_reviewed) continue // 父已复核豁免
      for (const c of diffInputProjection(a.input, currentInputProjection(topicDir, n))) changed.add(c)
    }
    if (changed.size > 0) {
      out.push({
        code: "stale_inputs",
        node: n.id,
        detail: `输入已变：${[...changed].join(", ")}（父可写 attempts[].inputs_reviewed 复核豁免）`,
      })
    }
  }
  return out
}

/** 在飞 attempt 的输入漂移（D10）—— 只作**显示提示**（info），进 `summary.input_drift` */
export function collectInputDrift(g: Graph, topicDir: string): Array<{ node: string; changed: string[] }> {
  const out: Array<{ node: string; changed: string[] }> = []
  for (const n of g.nodes) {
    if (n.cancelled) continue
    for (const a of n.attempts) {
      if (a.finished_at !== undefined) continue // 只看在飞
      if (!a.input) continue
      const changed = diffInputProjection(a.input, currentInputProjection(topicDir, n))
      if (changed.length > 0) out.push({ node: n.id, changed })
    }
  }
  return out
}

/** 节点是否可派发：deps 全 done ∧ BRIEF.md 存在 ∧ 自身非 done/cancelled ∧ **不在飞**（D10） */
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
    .filter((n) => status.get(n.id) !== "cancelled")
    .filter((n) => !isInFlight(n))
    .map((n) => n.id)
}

// ── 结算门（ADR-plan-collaboration-hardening D4 / V7·V8）──────────────────────

/** 合成节点 id 形状（与 `plan-synthesis-check` 的 `isSynthId` 同口径） */
export const SYNTH_ID_RE = /^m[1-9][0-9]*$/

/** 结算门两码 —— 收尾条件里的「阻断数 = 0」必须**排除它们自身**（否则首跑变红 ⇒ 次跑恒绿） */
export const SETTLEMENT_CODES: ReadonlySet<ViolationCode> = new Set<ViolationCode>([
  "settlement_missing",
  "settlement_failed_not_superseded",
])

/** 合成侧**可修复**：重做合成（追加更大的 `m<n>`）能修 ⇒ 必须 supersede，不得 accept-with-gap */
export const REPAIRABLE_SYNTH_CODES: ReadonlySet<string> = new Set([
  "synth_conclusion_layer_missing",
  "synth_heavy_item_not_in_conclusion",
  "synth_brief_no_ruling_set",
  "synth_ruling_not_propagated",
  "synth_conclusion_no_chain",
  "synth_evidence_unresolvable",
  "synth_reasoning_missing",
])

/** 结构性**不可修复**（上游属性 / 图形态）⇒ 允许 `accept-with-gap` + `gap_reason` */
export const UNREPAIRABLE_SYNTH_CODES: ReadonlySet<string> = new Set([
  "synth_token_missing",
  "synth_id_ambiguous",
  "synth_dep_on_synth",
  "synth_dep_union_incomplete",
  "synth_dep_union_extra",
  "synth_answer_dep_incomplete",
  "synth_graph_error",
])

/** 结算门**不可达**（门的前提已排除：不存在可用的非 cancelled 合成节点） */
export const UNREACHABLE_SYNTH_CODES: ReadonlySet<string> = new Set(["synth_answer_missing"])

/** D4 判据生效日（ADR-plan-collaboration-hardening v3 的 grandfather 分界线，UTC 日期） */
export const SETTLEMENT_CRITERIA_SINCE = "2026-11-27"

/** `## 结算记录` 的必填键（缺任一 ⇒ 视同无记录） */
export const SETTLEMENT_REQUIRED_KEYS = [
  "checked_at",
  "synthesis_check_exit",
  "blocking",
  "answer_node",
  "action",
  "model_resolution",
  "model_id",
] as const

/**
 * 解析 `TOPIC.md` 的 `## 结算记录`：取该节之后**第一个** `yaml` 围栏块，逐行 `key: value`。
 * 不吃 YAML 库（本库无依赖）；值里含 `:` / `[]` / `×` 一律原样保留。
 */
export function parseSettlementRecord(topicMd: string): Record<string, string> | null {
  const lines = topicMd.split(/\r?\n/)
  let i = lines.findIndex((l) => l.trim() === "## 结算记录")
  if (i < 0) return null
  let j = i + 1
  while (j < lines.length) {
    const t = lines[j].trim()
    if (/^##\s/.test(t)) return null // 到下一个二级标题仍未见到围栏块 ⇒ 无记录
    if (/^```ya?ml$/i.test(t)) break
    j++
  }
  if (j >= lines.length) return null
  const body: string[] = []
  for (let k = j + 1; k < lines.length; k++) {
    if (/^```$/.test(lines[k].trim())) break
    body.push(lines[k])
  }
  const rec: Record<string, string> = {}
  for (const raw of body) {
    const m = /^([a-z_]+):[ ]?(.*)$/.exec(raw.trim())
    if (m) rec[m[1]] = m[2].trim()
  }
  return Object.keys(rec).length > 0 ? rec : null
}

/** 当前答案节点 = 非 cancelled 合成节点里整数后缀最大者（与 synthesis-check 的 `answerNodeId` 同口径） */
export function answerSynthNodeId(nodes: Node[]): string | null {
  const synth = nodes.filter((n) => !n.cancelled && SYNTH_ID_RE.test(n.id))
  if (synth.length === 0) return null
  return synth.reduce((best, n) => (parseInt(n.id.slice(1), 10) > parseInt(best.id.slice(1), 10) ? n : best)).id
}

/**
 * 答案节点是否「在判据生效前已结算」—— grandfather 的唯一判据（ADR D4 / V8(f)）。
 *
 * 取**最后一次已闭合 attempt** 的 `finished_at`（`max` 时间序，不取数组末条），比 UTC 日期
 * **严格早于** `SETTLEMENT_CRITERIA_SINCE`。无已闭合 attempt ⇒ `false`（fail-closed：
 * `deriveStatus` 不看 attempts，父可手写 RESULT 而不 `claim` ⇒ 不存在「已结算」这一事实）。
 */
export function isSettledBeforeCriteria(g: Graph, answerId: string): boolean {
  const node = g.nodes.find((n) => n.id === answerId)
  if (!node) return false
  // 只认 ISO 日期前缀：空串 / 畸形值若被当「很早」，会静默放开豁免（fail-closed）
  const closed = node.attempts
    .map((a) => a.finished_at)
    .filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x))
  if (closed.length === 0) return false
  const last = closed.reduce((best, cur) => (cur > best ? cur : best))
  return last.slice(0, 10) < SETTLEMENT_CRITERIA_SINCE
}

/**
 * 结算门：有**非 cancelled** 合成节点 ∧ 已收尾（全终态 ∧ 无在飞 ∧ 其余阻断数 = 0）∧ 记录不合规 ⇒ 违规。
 *
 * ⚠ `blockingBefore` 由调用方在**推入本门两码之前**计算 ⇒ 天然排除自身（ADR D4 的反自毁要求）。
 * ⚠ 未分类的 `synth_*` 码按**不可修复**处理（fail-closed：必须写 `gap_reason`）。
 */
export function assertSettlement(
  g: Graph,
  topicDir: string,
  derived: Map<string, Status>,
  blockingBefore: number,
): Violation[] {
  const answer = answerSynthNodeId(g.nodes)
  if (answer === null) return []

  const allTerminal = g.nodes.every((n) => {
    const s = derived.get(n.id)
    return s === "done" || s === "cancelled"
  })
  const anyInFlight = g.nodes.some((n) => !n.cancelled && isInFlight(n))
  if (!allTerminal || anyInFlight || blockingBefore > 0) return []

  const rec = parseSettlementRecord(readIfExists(path.join(topicDir, "TOPIC.md")) ?? "")
  if (rec === null) {
    return [{ code: "settlement_missing", detail: "缺 `## 结算记录`（含一个 yaml 围栏块）—— 有合成节点且已收尾时必填" }]
  }
  const missing = SETTLEMENT_REQUIRED_KEYS.filter((k) => !rec[k])
  if (missing.length > 0) {
    return [{ code: "settlement_missing", detail: `结算记录缺必填字段：${missing.join(", ")}` }]
  }
  const exit = Number.parseInt(rec.synthesis_check_exit, 10)
  if (!Number.isFinite(exit)) {
    return [{ code: "settlement_missing", detail: `synthesis_check_exit 不是整数：${rec.synthesis_check_exit}` }]
  }
  if (rec.answer_node !== answer) {
    return [
      {
        code: "settlement_failed_not_superseded",
        detail: `记录过期：answer_node=${rec.answer_node} ≠ 当前答案节点 ${answer}（追加合成节点后须重写记录）`,
      },
    ]
  }
  if (exit !== 0) {
    const codes = (rec.blocking ?? "").match(/synth_[a-z_]+/g) ?? []
    const repairable = codes.filter((c) => REPAIRABLE_SYNTH_CODES.has(c))
    // grandfather：判据生效前已结算 ⇒ 可修复码不再强制 supersede，但 gap_reason 须覆盖它们
    const grandfather = isSettledBeforeCriteria(g, answer)
    const reasonCodes = new Set((rec.gap_reason ?? "").match(/synth_[a-z_]+/g) ?? [])
    const repairableCovered = repairable.every((c) => reasonCodes.has(c))
    const unknown = codes.filter(
      (c) => !REPAIRABLE_SYNTH_CODES.has(c) && !UNREPAIRABLE_SYNTH_CODES.has(c) && !UNREACHABLE_SYNTH_CODES.has(c),
    )
    if (repairable.length > 0 && !(grandfather && repairableCovered)) {
      return [
        {
          code: "settlement_failed_not_superseded",
          detail: `失败集含可修复码 ${repairable.join(",")} ⇒ 必须追加更大的合成节点并跑通（不得 accept-with-gap${
            grandfather ? "；grandfather 适用但 gap_reason 未覆盖这些码" : ""
          }）`,
        },
      ]
    }
    if (unknown.length > 0) {
      // fail-closed：未分类码一律按不可修复处理，但必须显式写进 gap_reason
      // grandfather 下同样要求逐码覆盖（V8(f)：可修复码 ∪ 未分类码 ⊆ gap_reason 的码集合）
      if (rec.action !== "accept-with-gap" || !rec.gap_reason || (grandfather && !unknown.every((c) => reasonCodes.has(c)))) {
        return [
          {
            code: "settlement_failed_not_superseded",
            detail: `未分类失败码 ${unknown.join(",")} ⇒ 按不可修复处理：须 action=accept-with-gap + gap_reason`,
          },
        ]
      }
    } else if (rec.action !== "accept-with-gap" || !rec.gap_reason) {
      return [
        {
          code: "settlement_failed_not_superseded",
          detail: `exit≠0 但 action=${rec.action}${rec.gap_reason ? "" : " 且未给 gap_reason"}（不可修复失败集须 accept-with-gap + 理由）`,
        },
      ]
    }
  }
  return []
}

/** `TOPIC.md` 的目标审查三节（ADR-plan-collaboration-hardening D5） */
export const TOPIC_GOAL_SECTIONS = ["前提与证伪条件", "非目标", "目标审查结论"] as const

/** 取 `## <title>` 小节正文（到下一个**任何级别**标题为止），剥围栏代码块；空 ⇒ false */
export function topicSectionHasBody(topicMd: string, title: string): boolean {
  const lines = topicMd.split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === `## ${title}`)
  if (start < 0) return false
  let inFence = false
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^```/.test(t)) {
      inFence = !inFence
      continue
    }
    if (!inFence && /^#{1,6}\s/.test(t)) break // 下一个标题
    if (!inFence && t.length > 0) return true
  }
  return false
}

/**
 * 目标审查门（ADR-plan-collaboration-hardening D5 / V9）—— **仅 `--phase dispatch` 且存在可派节点**。
 * 三节任一缺失或为空 ⇒ 阻断；`TOPIC.md` 整体缺失 ⇒ 视同三节全缺。
 */
export function assertTopicGoalReviewed(topicDir: string, ready: string[]): Violation[] {
  if (ready.length === 0) return []
  const md = readIfExists(path.join(topicDir, "TOPIC.md"))
  const missing = TOPIC_GOAL_SECTIONS.filter((s) => md === undefined || !topicSectionHasBody(md, s))
  if (missing.length === 0) return []
  return [
    {
      code: "topic_goal_unreviewed",
      detail: `TOPIC.md 缺或空：${missing.map((s) => `## ${s}`).join(" / ")}（有可派节点 ⇒ 目标审查必须先落文件）`,
    },
  ]
}

// ── 汇总 ──────────────────────────────────────────────────────────────────────

export function loadGraph(topicDir: string): Graph {
  const p = path.join(topicDir, "graph.json")
  if (!existsSync(p)) {
    throw new PlanTopicError("schema_invalid", `graph.json 不存在：${p}`)
  }
  return parseGraph(readFileSync(p, "utf8"))
}

export type CheckPhase = "dispatch" | "final"

export interface CheckOptions {
  allowEmpty?: boolean
  /**
   * 判据口径。默认 `final`：违规**枚举**与旧版一致（final 全量查交付物与 BRIEF）。
   * ⚠ 退出码口径已变：`cache_behind` 属 info，不再使 exit 非零（见 `INFO_CODES` / `isBlocking`）。
   * `dispatch` = 派发前的截面：只报「会阻断下一步派发」的问题。
   */
  phase?: CheckPhase
}

export function checkTopic(topicDir: string, opts: CheckOptions = {}): Violation[] {
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

  // 派生值只算一次，缓存判据与阶段门共用同一份（避免两次派生之间磁盘变化导致自相矛盾）
  const derived = deriveStatus(safeGraph, topicDir)
  const progress = new Map<string, Progress>(safeGraph.nodes.map((n) => [n.id, deriveProgress(topicDir, n)]))
  const phase = opts.phase ?? "final"
  // D9：**cancelled 节点豁免** BRIEF / 交付物 / due / finished / stale_inputs 四类判定
  //   （否则 `final` 口径自带永红：取消一个没有产物的节点 ⇒ 永远 missing_*）
  const cancelledIds = new Set(safeGraph.nodes.filter((n) => n.cancelled).map((n) => n.id))
  const alive = safeGraph.nodes.filter((n) => !cancelledIds.has(n.id))
  // 已到期 = deps 全 done（只有这些节点的 BRIEF 必须在盘上）
  const due = new Set(alive.filter((n) => n.deps.every((d) => derived.get(d) === "done")).map((n) => n.id))
  // 已完成 = progress complete（只有这些节点的交付物必须在盘上）
  const finished = new Set(alive.filter((n) => progress.get(n.id) === "complete").map((n) => n.id))
  const briefRequired = phase === "dispatch" ? due : new Set(alive.map((n) => n.id))
  const deliverableScope = phase === "dispatch" ? finished : new Set(alive.map((n) => n.id))

  out.push(...assertCacheConsistent(safeGraph, topicDir, { status: derived, progress }))
  out.push(...assertBriefIntegrity(safeGraph, topicDir))
  out.push(...assertNoOrphanNodes(safeGraph, topicDir, briefRequired))
  out.push(...missingDeliverables(safeGraph, topicDir, deliverableScope))
  // D9 / D10 判据：cancel 完整性、重复派发、输入漂移（stale_inputs 仅 `final` 口径产生）
  out.push(...assertCancelledIntegrity(safeGraph, topicDir, derived))
  out.push(...assertNoDuplicateOpenAttempt(safeGraph))
  if (phase === "final") {
    out.push(...assertNoStaleInputs(safeGraph, topicDir))
    // 结算门（ADR-plan-collaboration-hardening D4）：必须**最后**算 —— `blockingBefore` 取
    // 「其余阻断项」的数量，天然排除本门两码自身（防「首跑变红 ⇒ 次跑前提自毁 ⇒ 恒绿」）。
    out.push(...assertSettlement(safeGraph, topicDir, derived, out.filter(isBlocking).length))
  } else {
    // 目标审查门（D5）：只在**派发前**截面要求（已收尾的 topic 不会被这条打红）
    out.push(...assertTopicGoalReviewed(topicDir, dispatchableNodes(safeGraph, topicDir)))
  }

  return out
}

// ── 收敛判据（D11）────────────────────────────────────────────────────────────

export interface TopicSummary {
  done: string[]
  cancelled: Array<{ id: string; reason: string; at?: string }>
  in_flight: Array<{ node: string; started_at: string; liveness_stale: boolean }>
  input_drift: Array<{ node: string; changed: string[] }>
  ready: string[]
  blocking: Array<{ code: ViolationCode; node?: string; detail: string }>
  needs_review: Array<{ node: string; changed: string[] }>
}

export interface TopicReport {
  /** 恒按 `final` 口径派生（D11：口径恒定，`--phase` 只作用于 violations 列表与退出码） */
  converged: boolean
  violations: Violation[]
  summary: TopicSummary
}

/** 节点活性是否陈旧（mtime 新鲜度）—— **只作显示提示，不授权接管**（D10） */
export function isLivenessStale(topicDir: string, node: Node, attempt: Attempt, now = Date.now()): boolean {
  const todo = path.join(topicDir, "nodes", node.id, "TODO.md")
  let freshest = Number.isFinite(Date.parse(attempt.started_at)) ? Date.parse(attempt.started_at) : 0
  try {
    if (existsSync(todo)) {
      const m = statSync(todo).mtimeMs
      if (m > freshest) freshest = m
    }
  } catch {
    /* ignore */
  }
  return now - freshest > attemptStaleTtlMs()
}

/**
 * 收敛报告（D11）—— 「还有没有未完成的活」（**调度信号**，不是交付信号）。
 * 判据：零阻断违规（`final` 口径）∧ 每节点派生 status ∈ {done, cancelled} ∧ 无在飞。
 */
export function reportTopic(topicDir: string, opts: CheckOptions = {}): TopicReport {
  const violations = checkTopic(topicDir, { ...opts, phase: "final" })
  const g = loadGraph(topicDir)
  const derived = deriveStatus(g, topicDir)
  const now = Date.now()

  const done: string[] = []
  const cancelled: TopicSummary["cancelled"] = []
  const in_flight: TopicSummary["in_flight"] = []
  for (const n of g.nodes) {
    if (n.cancelled) {
      cancelled.push({ id: n.id, reason: n.cancelled.reason, at: n.cancelled.at })
      continue
    }
    if (derived.get(n.id) === "done") done.push(n.id)
    const open = openAttempt(n)
    if (open) {
      in_flight.push({ node: n.id, started_at: open.started_at, liveness_stale: isLivenessStale(topicDir, n, open, now) })
    }
  }

  const input_drift = collectInputDrift(g, topicDir)
  const ready = dispatchableNodes(g, topicDir)
  const blocking = violations.filter(isBlocking).map((v) => ({ code: v.code, node: v.node, detail: v.detail }))
  const needs_review = violations
    .filter((v) => v.code === "stale_inputs" && v.node !== undefined)
    .map((v) => ({ node: v.node as string, changed: v.detail }))

  const allTerminal = g.nodes.every((n) => {
    const s = derived.get(n.id)
    return s === "done" || s === "cancelled"
  })
  const converged = blocking.length === 0 && in_flight.length === 0 && allTerminal

  return { converged, violations, summary: { done, cancelled, in_flight, input_drift, ready, blocking, needs_review } }
}
