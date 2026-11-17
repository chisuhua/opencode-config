/**
 * role-identity —— **唯一身份解析器**（`docs/adr/ADR-role-session-identity.md` D1 / D4）
 *
 * 读链（自上而下，命中即止）：
 *   1. `sessions[<sessionID>].current_role`                      → source="partition"
 *   2. 顶层 `current_role`，**仅当** `role.json.session_id === sessionID`  → source="mirror"
 *   3. 全局 `<globalRoot>/.rddf/state/role.json` 的 `current_role` → source="global"
 *   4. `general`                                                  → source="default"
 *
 * ⚠ 硬约束（见 ADR / `design.md` D9.2）：
 *   - 身份文件**恒 `<stateRoot>/.rddf/state/role.json`**（不随 pair 登记翻转）；
 *   - **全部注入**（`stateRoot` / `globalRoot` / `sessionID`），**不读 `process.env`、不读真实 HOME**；
 *   - `sessionID` 缺失 ⇒ **跳过镜像步**（sid 守卫不可能成立）并给 `warning: "no-session-id"`。
 *
 * 能力类（`role_class`）不在此文件处理 —— 那是派发后端的概念（`ADR-backend-handoff-role-class` D2）。
 */
import { readFileSync } from "node:fs"
import path from "node:path"

export const ROLES = ["architect", "planner", "builder", "verifier", "no-role", "general"] as const
export type Role = (typeof ROLES)[number]
export type RoleSource = "partition" | "mirror" | "global" | "default"

export interface ResolveRoleInput {
  /** 状态文件根（`<stateRoot>/.rddf/state/role.json`） */
  stateRoot: string
  /** 全局兜底根（`<globalRoot>/.rddf/state/role.json`）；测试注入，不读 HOME */
  globalRoot: string
  /** 本会话 id（`$OPENCODE_SESSION_ID`）；缺失时跳过镜像步 */
  sessionID?: string
  /** 会话的 agent 名；身份域只对 `build` 生效（判定在门控侧，这里只做解析） */
  agent: string
  /**
   * 告警出口（注入）：身份 ADR D4 要求 `sid` 缺失时 **stderr + ledger 各一条** ——
   * 由调用方把同一个 sink 接到两处（本模块不直接写 stderr / ledger，否则不可测）。
   */
  warnSink?: (message: string) => void
}

export interface ResolvedRole {
  role: Role
  source: RoleSource
  warning?: "no-session-id"
}

const ROLE_REL = path.join(".rddf", "state", "role.json")

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return null // 缺失 / 损坏 ⇒ 按「不存在」处理（ADR: 损坏按 no-role 的判定在门控侧）
  }
}

function asRole(value: unknown): Role | null {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value) ? (value as Role) : null
}

export function resolveRole(input: ResolveRoleInput): ResolvedRole {
  const warning: "no-session-id" | undefined = input.sessionID ? undefined : "no-session-id"
  if (warning && input.warnSink) {
    input.warnSink(
      `[role-identity] warning=no-session-id：$OPENCODE_SESSION_ID 缺失 ⇒ 跳过镜像步（落全局/缺省），身份可能不准`,
    )
  }
  const wrap = (role: Role, source: RoleSource): ResolvedRole =>
    warning ? { role, source, warning } : { role, source }

  const state = readJsonFile(path.join(input.stateRoot, ROLE_REL)) as
    | { current_role?: unknown; session_id?: unknown; sessions?: Record<string, { current_role?: unknown }> }
    | null

  // ① 本 session 分区
  if (input.sessionID && state && state.sessions && typeof state.sessions === "object") {
    const partition = asRole(state.sessions[input.sessionID]?.current_role)
    if (partition) return wrap(partition, "partition")
  }

  // ② 顶层镜像 —— **仅当**它属于本会话（sid 守卫）
  if (input.sessionID && state && state.session_id === input.sessionID) {
    const mirror = asRole(state.current_role)
    if (mirror) return wrap(mirror, "mirror")
  }

  // ③ 全局兜底
  const global = readJsonFile(path.join(input.globalRoot, ROLE_REL)) as { current_role?: unknown } | null
  const globalRole = asRole(global?.current_role)
  if (globalRole) return wrap(globalRole, "global")

  // ④ 缺省
  return wrap("general", "default")
}
