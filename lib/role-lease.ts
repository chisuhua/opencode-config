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
