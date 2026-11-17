/**
 * role-lease —— 角色切换的**唯一写入口**与（后续）角色租约（ADR-role-session-identity D2 / ADR-role-aware-permissions D6）
 *
 * 内容：**切换写盘**（单临界区 + 读-改-写 + 原子写）与**角色租约**（claims / `claim_gen` 围栏 / 判活接管）。
 * 本文件即 `design.md` D1 的落点：租约算法收敛于此，`scripts/role-switch.sh` 只是薄壳。
 *
 * 硬约束：
 *   - 身份文件**恒 `<stateRoot>/.rddf/state/role.json`**；
 *   - 锁**只有一把**：`.role.lock`（复用 `withLock`，30 s 陈旧 / 10 s 硬超时，可注入）；
 *   - **读-改-写**：保留其它 session 分区与 `legacy` 键（不得整文件重写）；
 *   - 原子写：`tmp + rename`，失败清理 tmp（AC5）。
 */
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { appendLedgerLine, withLock, writeJsonAtomic } from "./delegate-core.ts"
import { ROLES, type Role } from "./role-identity.ts"

export interface Window {
  roles: Role[]
  max_rounds: number
  used: number
  granted_by: "user"
  granted_at: string
}

export interface SwitchRoleInput {
  stateRoot: string
  sessionID: string
  role: Role
  by: "user" | "auto"
  /** 工作树根（租约键的一半）；缺省 ⇒ 用 `stateRoot`（非 worktree 场景两者恒等） */
  workRoot?: string
  /** 注入时钟（测试用） */
  now?: () => Date
  /** 注入锁参数（AC22 的两条边界） */
  lock?: { staleMs?: number; deadlineMs?: number }
  /** 告警出口（接管 / 损坏） */
  warnSink?: (message: string) => void
}

const STATE_REL = path.join(".rddf", "state")
const ROLE_FILE = "role.json"
const LOCK_DIR = ".role.lock"
const HISTORY_LIMIT = 20

export function roleFilePath(stateRoot: string): string {
  return path.join(stateRoot, STATE_REL, ROLE_FILE)
}

export function roleLockDir(stateRoot: string): string {
  return path.join(stateRoot, STATE_REL, LOCK_DIR)
}

function readRoleFile(file: string): Record<string, any> {
  try {
    const raw = readFileSync(file, "utf8")
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * 角色切换（**必须在锁内调用**；`switchRole` 是取锁的便捷包装）。
 * 字段所有权：本函数写「本 session 分区 + 顶层镜像 + history」；
 * `writeRoleSession`（派发后端）只写自己的分区且**不碰顶层** —— 两者字段集不重叠。
 */
export function applyRoleSwitch(
  role: Record<string, any>,
  input: Omit<SwitchRoleInput, "stateRoot" | "lock">,
): Record<string, any> {
  if (!(ROLES as readonly string[]).includes(input.role)) throw new Error(`非法角色: ${input.role}`)
  const iso = (input.now?.() ?? new Date()).toISOString()
  const sessions = role.sessions && typeof role.sessions === "object" ? role.sessions : {}
  const prev = sessions[input.sessionID] ?? {}

  // 分区：保留既有其它字段（如 role_class / auto_answer），只改角色与时间
  sessions[input.sessionID] = { ...prev, current_role: input.role, updated_at: iso }

  const history = Array.isArray(role.history) ? role.history : []
  history.push({ role: input.role, at: iso, by: input.by, reason: "" })

  // `--exit`：切到 `no-role` 时窗口必须清空（退出角色即放弃授权窗口）
  if (input.role === "no-role") {
    sessions[input.sessionID] = { ...sessions[input.sessionID], auto_switch_window: null }
  }

  // ⚠ 授权窗口（AC8）：`by:"auto"` 的切换必须**在窗口内且未超额**，并原子 `used += 1`。
  //   `by:"user"` 的切换不动窗口（用户手动切角色不受窗口约束）。
  const window = prev.auto_switch_window ?? null
  if (input.by === "auto") {
    if (!window) throw new Error("auto 切换被拒：没有授权窗口")
    if (!Array.isArray(window.roles) || !window.roles.includes(input.role)) {
      throw new Error(`auto 切换被拒：目标角色 ${input.role} 不在窗口 roles 内`)
    }
    if (typeof window.used !== "number" || window.used >= window.max_rounds) {
      throw new Error(`auto 切换被拒：窗口已用完（used=${window.used} / max=${window.max_rounds}）`)
    }
    sessions[input.sessionID] = {
      ...sessions[input.sessionID],
      auto_switch_window: { ...window, used: window.used + 1 },
    }
  }

  return {
    ...role, // ⚠ 保留 role.json 里的其它未知键（未来字段）
    current_role: input.role,
    updated_at: iso,
    updated_by: input.by,
    session_id: input.sessionID,
    history: history.slice(-HISTORY_LIMIT),
    sessions,
  }
}

/** 取锁 + 读-改-写 + 原子写。返回写入后的 role 对象（供测试/调用方读取）。 */
export function switchRole(input: SwitchRoleInput): Record<string, any> {
  mkdirSync(path.join(input.stateRoot, STATE_REL), { recursive: true })
  const file = roleFilePath(input.stateRoot)
  const workRoot = input.workRoot ?? input.stateRoot
  let written: Record<string, any> = {}
  withLock(
    roleLockDir(input.stateRoot),
    () => {
      const before = readRoleFile(file)
      // ⚠ **D6 的第二执行点**（critic BLOCKER B2）：切角色也要占职责角色的租约
      //   —— 否则「主会话切到已被同 worktree 后端持有的角色」会**静默成功**，
      //   直到第一次写类调用才被拒（D6「三处执行点，缺一就有漏」）。
      const prevRaw =
        before?.sessions?.[input.sessionID]?.current_role ??
        (before?.session_id === input.sessionID ? before?.current_role : undefined)
      const prevRole =
        typeof prevRaw === "string" && (ROLES as readonly string[]).includes(prevRaw) ? (prevRaw as Role) : null

      // 顺序：**先占新**、再放旧（避免「旧已放、新被拒」的中间态）
      let acquired = false
      if (!isExemptRole(input.role)) {
        const lease = acquireLeaseLocked({
          stateRoot: input.stateRoot,
          workRoot,
          role: input.role,
          sessionID: input.sessionID,
          kind: "main",
          now: input.now,
          warnSink: input.warnSink,
        })
        if (!lease.ok) {
          // 冲突 ⇒ 抛错（脚本非零退出）+ **不写 role.json**（回滚天然成立：旧角色与旧租约都未动）
          throw new Error(`切换被拒：${lease.reason}`)
        }
        acquired = true
      }
      try {
        written = applyRoleSwitch(before, input)
        writeJsonAtomic(file, written, { cleanupOnError: true })
      } catch (e) {
        // role.json 写失败 ⇒ **回滚 claims**（design D9.2「先写 claims、后写 role.json」）
        if (acquired) releaseLeaseLocked({ stateRoot: input.stateRoot, workRoot, role: input.role, sessionID: input.sessionID })
        throw e
      }
      // 切走旧角色 ⇒ 释放它的租约
      if (prevRole && prevRole !== input.role && !isExemptRole(prevRole)) {
        releaseLeaseLocked({ stateRoot: input.stateRoot, workRoot, role: prevRole, sessionID: input.sessionID })
      }
    },
    input.lock,
  )
  return written
}

/** `--grant-window <roles,csv> <max>`：授予授权窗口（`granted_by:"user"`）。 */
export function grantWindow(input: {
  stateRoot: string
  sessionID: string
  roles: Role[]
  maxRounds: number
  now?: () => Date
  lock?: { staleMs?: number; deadlineMs?: number }
}): Record<string, any> {
  if (input.roles.length === 0) throw new Error("roles 不能为空")
  if (!Number.isInteger(input.maxRounds) || input.maxRounds <= 0) throw new Error("max_rounds 必须是正整数")
  const iso = (input.now?.() ?? new Date()).toISOString()
  return mutatePartition(input, (prev, sessions) => {
    sessions[input.sessionID] = {
      ...prev,
      auto_switch_window: {
        roles: input.roles,
        max_rounds: input.maxRounds,
        used: 0,
        granted_by: "user",
        granted_at: iso,
      },
    }
  })
}

/** `--close-window` / `--exit`：清空窗口（`--exit` 同时把角色切到 `no-role`）。 */
export function clearWindow(input: {
  stateRoot: string
  sessionID: string
  toNoRole?: boolean
  now?: () => Date
  lock?: { staleMs?: number; deadlineMs?: number }
}): Record<string, any> {
  if (input.toNoRole) {
    return switchRole({ stateRoot: input.stateRoot, sessionID: input.sessionID, role: "no-role", by: "user", now: input.now, lock: input.lock })
  }
  return mutatePartition(input, (prev, sessions) => {
    sessions[input.sessionID] = { ...prev, auto_switch_window: null }
  })
}

/** 公共的「锁内读-改-写分区」包装（不碰顶层镜像 / history —— 窗口操作不是角色切换）。 */
function mutatePartition(
  input: { stateRoot: string; sessionID: string; now?: () => Date; lock?: { staleMs?: number; deadlineMs?: number } },
  fn: (prev: Record<string, any>, sessions: Record<string, any>) => void,
): Record<string, any> {
  mkdirSync(path.join(input.stateRoot, STATE_REL), { recursive: true })
  const file = roleFilePath(input.stateRoot)
  let written: Record<string, any> = {}
  withLock(
    roleLockDir(input.stateRoot),
    () => {
      const role = readRoleFile(file)
      const sessions = role.sessions && typeof role.sessions === "object" ? role.sessions : {}
      fn(sessions[input.sessionID] ?? {}, sessions)
      role.sessions = sessions
      written = role
      writeJsonAtomic(file, role, { cleanupOnError: true })
    },
    input.lock,
  )
  return written
}

// ════════════════════════════════════════════════════════════════════════
// 角色租约（ADR-role-aware-permissions D6；proposal AC18–AC22）
//
// 键 = `(workRoot, 工作角色)`；工作角色：主会话 = 身份链解析结果；后端 = `role_class`。
// 独占集 = {architect, planner, builder, verifier, general}；豁免 = {no-role}。
// 围栏：`claim_gen` **单调递增**；**旧 gen 的持有者**此后任何租约写与写类工具调用一律拒绝。
// 判活：宿主探活优先（`hostProbe`）⇒ `heartbeat_at` TTL 只作兜底；**接管前必须先探活**。
// ⚠ **不按 pid 判活**（pid 会复用）⇒ 存活判定只看 sessionID 探活 + TTL。
// ⚠ **锁内不得再取锁** ⇒ 提供 `*Locked` 变体（调用方已持 `.role.lock` 时使用）。
// ════════════════════════════════════════════════════════════════════════


export const LEASE_TTL_MS = 30 * 60 * 1000
/** 独占集（同角色至多一个代表） */
export const EXCLUSIVE_ROLES = ["architect", "planner", "builder", "verifier", "general"] as const
/** 豁免集（只读，不冲突） */
export const EXEMPT_ROLES = ["no-role"] as const

export interface LeaseClaim {
  work_root: string
  role: string
  session_id: string
  kind: "main" | "backend"
  role_class?: string
  claim_gen: number
  state: "active" | "released"
  acquired_at: string
  heartbeat_at: string
  released_at?: string
}

export interface LeaseFile {
  schema_version: string
  /** 键 = `${workRoot}|${role}` */
  claims: Record<string, LeaseClaim>
  /** 每个持有者自己拿到的 gen（围栏比对的一方；接管后旧持有者的记录**不变** ⇒ gen 不匹配） */
  holders: Record<string, { work_root: string; role: string; claim_gen: number }>
}

export function isExemptRole(role: string): boolean {
  return (EXEMPT_ROLES as readonly string[]).includes(role)
}

export function leaseKey(workRoot: string, role: string): string {
  // ⚠ 归一（`path.resolve`）：同 worktree 的不同写法（尾斜杠 / `..` / 相对路径）⇒ **同一键**
  //   （否则「同 worktree 两写法」会各占一格 ⇒ 独占静默失效）。
  return `${path.resolve(workRoot)}|${role}`
}

export function claimsPath(stateRoot: string): string {
  return path.join(stateRoot, ".rddf", "state", "role-claims.json")
}

function emptyLeaseFile(): LeaseFile {
  return { schema_version: "role-claims-v1", claims: {}, holders: {} }
}

export interface ClaimsRead {
  file: LeaseFile
  /** 损坏 ⇒ **保守拒绝**（AC21 四种形态） */
  corrupt: boolean
  reason?: string
}

/**
 * 读 claims；**四种损坏形态**（截断 / 空 / 数组 / 缺字段）⇒ `corrupt: true` ⇒ 保守拒绝。
 * ⚠ 文件**不存在**不是损坏（首次使用 ⇒ 空）。
 */
export function readClaims(stateRoot: string): ClaimsRead {
  const file = claimsPath(stateRoot)
  let raw: string
  try {
    raw = readFileSync(file, "utf8")
  } catch {
    return { file: emptyLeaseFile(), corrupt: false }
  }
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { file: emptyLeaseFile(), corrupt: true, reason: "JSON 解析失败（截断 / 非法 JSON / 空文件）" }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { file: emptyLeaseFile(), corrupt: true, reason: "顶层不是对象（数组 / 标量）" }
  }
  for (const key of ["claims", "holders"]) {
    const v = parsed[key]
    if (v !== undefined && (typeof v !== "object" || v === null || Array.isArray(v))) {
      return { file: emptyLeaseFile(), corrupt: true, reason: `${key} 字段不是对象` }
    }
  }
  for (const [key, c] of Object.entries(parsed.claims ?? {})) {
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      return { file: emptyLeaseFile(), corrupt: true, reason: `claim「${key}」不是对象` }
    }
    for (const f of ["work_root", "role", "session_id", "claim_gen", "state"]) {
      if (!(f in c)) {
        return { file: emptyLeaseFile(), corrupt: true, reason: `claim「${key}」缺字段 ${f}` }
      }
    }
    if (typeof c.claim_gen !== "number" || !Number.isFinite(c.claim_gen)) {
      return { file: emptyLeaseFile(), corrupt: true, reason: `claim「${key}」的 claim_gen 非数字` }
    }
  }
  return {
    file: {
      schema_version: typeof parsed.schema_version === "string" ? parsed.schema_version : "role-claims-v1",
      claims: parsed.claims ?? {},
      holders: parsed.holders ?? {},
    },
    corrupt: false,
  }
}

function writeClaims(stateRoot: string, file: LeaseFile): void {
  mkdirSync(path.join(stateRoot, ".rddf", "state"), { recursive: true })
  writeJsonAtomic(claimsPath(stateRoot), file, { cleanupOnError: true })
}

export interface LeaseInput {
  stateRoot: string
  workRoot: string
  role: Role
  sessionID: string
  kind: "main" | "backend"
  roleClass?: string
  /** 注入时钟（测试用） */
  now?: () => Date
  /** TTL 兜底（默认 30 min） */
  ttlMs?: number
  /** 宿主探活（注入）：返回 true = 存活 */
  hostProbe?: (sessionID: string) => boolean
  /** 告警出口（注入） */
  warnSink?: (message: string) => void
  /** 锁参数（AC22 的两条边界） */
  lock?: { staleMs?: number; deadlineMs?: number }
}

export type LeaseResult =
  | { ok: true; claim: LeaseClaim; exempt: boolean }
  | { ok: false; reason: string; holder?: LeaseClaim }

/**
 * 存活判定：**宿主探活优先 ⇒ TTL 兜底**。
 * ⚠ **不按 pid 判活**（pid 会复用）—— 判据只有 sessionID 探活 + `heartbeat_at`。
 */
export function isHolderAlive(
  claim: LeaseClaim,
  opts: { now: Date; ttlMs: number; hostProbe?: (sessionID: string) => boolean },
): boolean {
  if (opts.hostProbe) {
    try {
      if (opts.hostProbe(claim.session_id) === true) return true
    } catch {
      /* 探活异常 ⇒ 不可判 ⇒ 落 TTL */
    }
  }
  const hb = Date.parse(claim.heartbeat_at ?? "")
  if (Number.isFinite(hb) && opts.now.getTime() - hb <= opts.ttlMs) return true
  return false
}

/**
 * 占租约（**调用方必须已持有 `.role.lock`** ⇒ 锁内不得再取锁）。
 * 返回 `ok:false` 时**不写任何文件**（保守拒绝 ⇒ gen 不回退）。
 */
export function acquireLeaseLocked(input: LeaseInput): LeaseResult {
  const now = input.now?.() ?? new Date()
  const iso = now.toISOString()
  const ttlMs = input.ttlMs ?? LEASE_TTL_MS

  if (isExemptRole(input.role)) {
    // 豁免：不占租约（两个 no-role 可并存）
    return {
      ok: true,
      exempt: true,
      claim: {
        work_root: path.resolve(input.workRoot),
        role: input.role,
        session_id: input.sessionID,
        kind: input.kind,
        claim_gen: 0,
        state: "released",
        acquired_at: iso,
        heartbeat_at: iso,
      },
    }
  }

  const read = readClaims(input.stateRoot)
  if (read.corrupt) {
    const reason = `role-lease: role-claims.json 损坏（${read.reason}）⇒ 保守拒绝；请先跑 scripts/role-switch.sh --reset-claims`
    input.warnSink?.(reason)
    return { ok: false, reason }
  }

  const file = read.file
  const key = leaseKey(input.workRoot, input.role)
  const existing = file.claims[key]
  const active = existing !== undefined && existing.state === "active"

  // ① 同一持有者 ⇒ 续租（gen 不变，只刷新心跳）
  if (active && existing!.session_id === input.sessionID) {
    const renewed: LeaseClaim = { ...existing!, heartbeat_at: iso }
    file.claims[key] = renewed
    file.holders[input.sessionID] = { work_root: input.workRoot, role: input.role, claim_gen: renewed.claim_gen }
    writeClaims(input.stateRoot, file)
    return { ok: true, claim: renewed, exempt: false }
  }

  // ② 他人持有 ⇒ 判活（探活优先 ⇒ TTL 兜底）
  if (active) {
    if (isHolderAlive(existing!, { now, ttlMs, hostProbe: input.hostProbe })) {
      return {
        ok: false,
        reason: `role-lease: 角色「${input.role}」的租约已被会话 ${existing!.session_id} 持有（workRoot=${existing!.work_root}）`,
        holder: existing,
      }
    }
    // ③ 接管：gen 单调 +1
    const gen = (existing!.claim_gen ?? 0) + 1
    const claim: LeaseClaim = {
      work_root: path.resolve(input.workRoot),
      role: input.role,
      session_id: input.sessionID,
      kind: input.kind,
      ...(input.roleClass ? { role_class: input.roleClass } : {}),
      claim_gen: gen,
      state: "active",
      acquired_at: iso,
      heartbeat_at: iso,
    }
    file.claims[key] = claim
    file.holders[input.sessionID] = { work_root: input.workRoot, role: input.role, claim_gen: gen }
    writeClaims(input.stateRoot, file)
    const warn = `role-lease: 接管角色「${input.role}」的租约（原持有者 ${existing!.session_id} 已不存活）⇒ claim_gen=${gen}`
    input.warnSink?.(warn)
    try {
      appendLedgerLine(input.stateRoot, {
        event: "role_lease_takeover",
        role: input.role,
        work_root: path.resolve(input.workRoot),
        previous_session_id: existing!.session_id,
        session_id: input.sessionID,
        claim_gen: gen,
        at: iso,
      })
    } catch {
      /* ledger 追加失败不阻塞接管 */
    }
    return { ok: true, claim, exempt: false }
  }

  // ④ 新占：gen = 既有 gen + 1（**释放后也不归零** ⇒ 单调不减）
  const gen = (existing?.claim_gen ?? 0) + 1
  const claim: LeaseClaim = {
    work_root: path.resolve(input.workRoot),
    role: input.role,
    session_id: input.sessionID,
    kind: input.kind,
    ...(input.roleClass ? { role_class: input.roleClass } : {}),
    claim_gen: gen,
    state: "active",
    acquired_at: iso,
    heartbeat_at: iso,
  }
  file.claims[key] = claim
  file.holders[input.sessionID] = { work_root: input.workRoot, role: input.role, claim_gen: gen }
  writeClaims(input.stateRoot, file)
  return { ok: true, claim, exempt: false }
}

/** 占租约（自取 `.role.lock`）。 */
export function acquireLease(input: LeaseInput): LeaseResult {
  mkdirSync(path.join(input.stateRoot, ".rddf", "state"), { recursive: true })
  let result!: LeaseResult
  withLock(
    roleLockDir(input.stateRoot),
    () => {
      result = acquireLeaseLocked(input)
    },
    input.lock,
  )
  return result
}

/** 释放（**调用方必须已持锁**）：标记 released + **保留 gen**（⇒ 下次占用的 gen 继续递增）。 */
export function releaseLeaseLocked(input: {
  stateRoot: string
  workRoot: string
  role: Role
  sessionID: string
  now?: () => Date
}): { ok: boolean; reason?: string } {
  const now = input.now?.() ?? new Date()
  const iso = now.toISOString()
  const read = readClaims(input.stateRoot)
  if (read.corrupt) return { ok: false, reason: `role-lease: role-claims.json 损坏（${read.reason}）` }
  const file = read.file
  const key = leaseKey(input.workRoot, input.role)
  const claim = file.claims[key]
  if (!claim || claim.state !== "active") return { ok: false, reason: "role-lease: 无可释放的活动租约" }
  if (claim.session_id !== input.sessionID) {
    return { ok: false, reason: `role-lease: 租约持有者是 ${claim.session_id}，不是 ${input.sessionID}` }
  }
  file.claims[key] = { ...claim, state: "released", released_at: iso }
  writeClaims(input.stateRoot, file)
  return { ok: true }
}

/** 释放（自取锁）。 */
export function releaseLease(input: {
  stateRoot: string
  workRoot: string
  role: Role
  sessionID: string
  now?: () => Date
  lock?: { staleMs?: number; deadlineMs?: number }
}): { ok: boolean; reason?: string } {
  let result!: { ok: boolean; reason?: string }
  withLock(
    roleLockDir(input.stateRoot),
    () => {
      result = releaseLeaseLocked(input)
    },
    input.lock,
  )
  return result
}

/**
 * 续租（**调用方必须已持锁**）：持有者 + `claim_gen` **都要匹配** ⇒ 否则拒（围栏）。
 * ⚠ 与 `acquireLeaseLocked` 的区别：续租**不**做「接管」判定 —— 已被接管者续租必须**失败**
 *   （而不是把租约抢回来）。
 */
export function renewLeaseLocked(input: {
  stateRoot: string
  workRoot: string
  role: Role
  sessionID: string
  now?: () => Date
}): { ok: boolean; reason?: string } {
  const iso = (input.now?.() ?? new Date()).toISOString()
  const read = readClaims(input.stateRoot)
  if (read.corrupt) return { ok: false, reason: `role-lease: role-claims.json 损坏（${read.reason}）` }
  const file = read.file
  const key = leaseKey(input.workRoot, input.role)
  const claim = file.claims[key]
  if (!claim || claim.state !== "active") return { ok: false, reason: "role-lease: 无可续租的活动租约" }
  // ⚠ **围栏优先于持有者比对**（与 `checkLeaseForWrite` 同口径）：gen 不匹配 = 「已被接管」。
  const mine = file.holders[input.sessionID]
  if (mine && mine.claim_gen !== claim.claim_gen) {
    return {
      ok: false,
      reason: `role-lease: claim_gen 不匹配（我持有 ${mine.claim_gen} ≠ 当前 ${claim.claim_gen}）⇒ 已被接管`,
    }
  }
  if (claim.session_id !== input.sessionID) {
    return { ok: false, reason: `role-lease: 租约持有者是 ${claim.session_id}，不是 ${input.sessionID}` }
  }
  if (!mine) {
    return { ok: false, reason: `role-lease: 找不到我（${input.sessionID}）的持有记录 ⇒ 围栏不通过` }
  }
  file.claims[key] = { ...claim, heartbeat_at: iso }
  writeClaims(input.stateRoot, file)
  return { ok: true }
}

/** 续租（自取锁）。 */
export function renewLease(input: {
  stateRoot: string
  workRoot: string
  role: Role
  sessionID: string
  now?: () => Date
  lock?: { staleMs?: number; deadlineMs?: number }
}): { ok: boolean; reason?: string } {
  let result!: { ok: boolean; reason?: string }
  withLock(
    roleLockDir(input.stateRoot),
    () => {
      result = renewLeaseLocked(input)
    },
    input.lock,
  )
  return result
}

/**
 * 写类工具调用的**围栏校验**（ADR D6 执行点③）：
 *   ① 无租约 ⇒ **尝试占租约**（开局；冲突则拒）—— 无租约且占不到 ⇒ 拒绝写类工具；
 *   ② 持有者不是我 ⇒ 拒绝（指名持有者）；
 *   ③ `claim_gen` **!= 即拒**（已被接管）⇒ 拒绝。
 */
export function checkLeaseForWrite(input: {
  stateRoot: string
  workRoot: string
  role: Role
  sessionID: string
  now?: () => Date
  ttlMs?: number
  hostProbe?: (sessionID: string) => boolean
  lock?: { staleMs?: number; deadlineMs?: number }
}): { ok: boolean; message?: string; holder?: LeaseClaim } {
  if (isExemptRole(input.role)) return { ok: true }

  const read = readClaims(input.stateRoot)
  if (read.corrupt) {
    return {
      ok: false,
      message: `role-lease: role-claims.json 损坏（${read.reason}）⇒ 保守拒绝写类工具；请先跑 scripts/role-switch.sh --reset-claims`,
    }
  }
  const key = leaseKey(input.workRoot, input.role)
  const claim = read.file.claims[key]
  if (!claim || claim.state !== "active") {
    // 开局：无租约 ⇒ 尝试占（冲突 ⇒ 拒）
    const res = acquireLease(input)
    if (res.ok) return { ok: true }
    return {
      ok: false,
      message: `${res.reason} ⇒ 无租约，拒绝写类工具（模型只能读 + 报告）`,
      holder: res.holder,
    }
  }
  // ⚠ **围栏优先于持有者比对**：`claim_gen` 不匹配 = 「我这条租约已被接管」
  //   （更强的信号）⇒ 先报它，避免把「已被接管」误报成「别人持有」。
  const mine = read.file.holders[input.sessionID]
  if (mine && mine.claim_gen !== claim.claim_gen) {
    return {
      ok: false,
      message: `role-lease: claim_gen 不匹配（我持有 ${mine.claim_gen} ≠ 当前 ${claim.claim_gen}）⇒ 租约已被接管，拒绝写类工具`,
      holder: claim,
    }
  }
  if (claim.session_id !== input.sessionID) {
    return {
      ok: false,
      message: `role-lease: 角色「${input.role}」的租约由 ${claim.session_id} 持有（workRoot=${claim.work_root}）⇒ 拒绝写类工具`,
      holder: claim,
    }
  }
  return { ok: true }
}

/** `--reset-claims`：损坏恢复入口（**显式用户动作** ⇒ gen 重置；留 ledger 痕迹）。 */
export function resetClaims(input: {
  stateRoot: string
  sessionID: string
  now?: () => Date
}): { ok: boolean; reason?: string } {
  const iso = (input.now?.() ?? new Date()).toISOString()
  const before = readClaims(input.stateRoot)
  writeClaims(input.stateRoot, emptyLeaseFile())
  try {
    appendLedgerLine(input.stateRoot, {
      event: "role_claims_reset",
      session_id: input.sessionID,
      corrupted: before.corrupt,
      reason: before.reason,
      at: iso,
    })
  } catch {
    /* ledger 追加失败不阻塞恢复 */
  }
  return { ok: true }
}
