/**
 * role-lease —— 角色切换的**唯一写入口**与（后续）角色租约（ADR-role-session-identity D2 / ADR-role-aware-permissions D6）
 *
 * 当前实现范围：**Task 2**（切换写盘 + 单临界区 + 原子性）。
 * 租约（claims / claim_gen / 接管）在 Task 4 追加 —— 本文件即其落点（`design.md` D1）。
 *
 * 硬约束：
 *   - 身份文件**恒 `<stateRoot>/.rddf/state/role.json`**；
 *   - 锁**只有一把**：`.role.lock`（复用 `withLock`，30 s 陈旧 / 10 s 硬超时，可注入）；
 *   - **读-改-写**：保留其它 session 分区与 `legacy` 键（不得整文件重写）；
 *   - 原子写：`tmp + rename`，失败清理 tmp（AC5）。
 */
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { withLock, writeJsonAtomic } from "./delegate-core.ts"
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
  /** 注入时钟（测试用） */
  now?: () => Date
  /** 注入锁参数（AC22 的两条边界） */
  lock?: { staleMs?: number; deadlineMs?: number }
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
  let written: Record<string, any> = {}
  withLock(
    roleLockDir(input.stateRoot),
    () => {
      written = applyRoleSwitch(readRoleFile(file), input)
      writeJsonAtomic(file, written, { cleanupOnError: true })
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
