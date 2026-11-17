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
/** 告警种类（`no-session-id` 之外，新增两种**保守**信号：损坏 / 非法角色值） */
export type RoleWarningKind = "no-session-id" | "corrupt-role-file" | "invalid-role"

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

interface RoleFileRead {
  value: any | null
  corrupt: boolean
}

/**
 * 读角色文件：**区分「缺失」与「损坏」**。
 * ⚠ 缺口（critic BLOCKER B5）：损坏**不得**按「不存在」处理 —— 那会静默落到 `general`
 *   （`allow: ["**"]`）⇒ **放权**。治理面 `prompts/build.md:212` 明确要求「JSON 解析失败
 *   或 `current_role` 不在合法集合内 ⇒ 按 **`no-role`** 处理并提示修复，**不要**静默 fallback」。
 */
function readRoleFile(file: string): RoleFileRead {
  let raw: string
  try {
    raw = readFileSync(file, "utf8")
  } catch {
    return { value: null, corrupt: false } // 缺失 ⇒ 继续走 fallback 链
  }
  try {
    return { value: JSON.parse(raw), corrupt: false }
  } catch {
    return { value: null, corrupt: true } // 损坏 ⇒ 保守（no-role）
  }
}

function asRole(value: unknown): Role | null {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value) ? (value as Role) : null
}

export function resolveRole(input: ResolveRoleInput): ResolvedRole {
  const sidWarning: "no-session-id" | undefined = input.sessionID ? undefined : "no-session-id"
  if (sidWarning && input.warnSink) {
    input.warnSink(
      `[role-identity] warning=no-session-id：$OPENCODE_SESSION_ID 缺失 ⇒ 跳过镜像步（落全局/缺省），身份可能不准`,
    )
  }
  const wrap = (role: Role, source: RoleSource, warn = sidWarning): ResolvedRole =>
    warn ? { role, source, warning: warn } : { role, source }
  /** 损坏 / 非法 ⇒ **no-role**（保守：no-role 一切 edit 拒）—— 绝不静默降级到 general（会放大权限） */
  const conservative = (warning: RoleWarningKind, detail: string): ResolvedRole => {
    input.warnSink?.(`[role-identity] warning=${warning}：${detail} ⇒ 按 no-role 处理（请修复，或经 scripts/role-switch.sh 重写）`)
    return wrap("no-role", "default", warning)
  }

  const stateRead = readRoleFile(path.join(input.stateRoot, ROLE_REL))
  if (stateRead.corrupt) {
    return conservative("corrupt-role-file", `角色文件 JSON 解析失败（${path.join(input.stateRoot, ROLE_REL)}）`)
  }
  const state = stateRead.value as
    | { current_role?: unknown; session_id?: unknown; sessions?: Record<string, { current_role?: unknown }> }
    | null

  // ① 本 session 分区
  if (input.sessionID && state && state.sessions && typeof state.sessions === "object") {
    const raw = state.sessions[input.sessionID]?.current_role
    const partition = asRole(raw)
    if (partition) return wrap(partition, "partition")
    if (raw !== undefined) {
      return conservative("invalid-role", `本 session 分区的 current_role=${JSON.stringify(raw)} 不在合法集合内`)
    }
  }

  // ② 顶层镜像 —— **仅当**它属于本会话（sid 守卫）
  if (input.sessionID && state && state.session_id === input.sessionID) {
    const raw = state.current_role
    const mirror = asRole(raw)
    if (mirror) return wrap(mirror, "mirror")
    if (raw !== undefined) {
      return conservative("invalid-role", `顶层镜像 current_role=${JSON.stringify(raw)} 不在合法集合内`)
    }
  }

  // ③ 全局兜底
  const globalRead = readRoleFile(path.join(input.globalRoot, ROLE_REL))
  if (globalRead.corrupt) {
    return conservative("corrupt-role-file", `全局角色文件 JSON 解析失败（${path.join(input.globalRoot, ROLE_REL)}）`)
  }
  const globalRaw = (globalRead.value as { current_role?: unknown } | null)?.current_role
  const globalRole = asRole(globalRaw)
  if (globalRole) return wrap(globalRole, "global")
  if (globalRaw !== undefined) {
    return conservative("invalid-role", `全局 current_role=${JSON.stringify(globalRaw)} 不在合法集合内`)
  }

  // ④ 缺省
  return wrap("general", "default")
}
