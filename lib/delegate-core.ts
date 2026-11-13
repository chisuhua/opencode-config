import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  realpathSync,
  utimesSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * delegate 工具的**纯逻辑内核**（无 opencode 宿主依赖，可独立单元测试）。
 *
 * 宿主接线（工具注册）只在 plugins/delegate.ts；本文件同时导出工具定义工厂，
 * 便于用假 ctx 做端到端单测。
 *
 * 原设计说明：
 * front → 工程 session 的唯一委托通道。
 *
 * 设计依据（ADR .rddf/state/adr-front-agent-redesign.md + Stage 0 探针报告
 * .rddf/reviews/front-agent-redesign-p0-probes.md）：
 *  - 工具声明 options.permission = "delegate" → 权限 action 名独立于工具名，
 *    全局 deny + agent.front allow ⇒ 只有 front 能拿到本工具。
 *  - 工程 session 的权限在 **建 session 时**由 [常量deny, scope edit 规则, grants] 定型；
 *    last-match-wins ⇒ 顺序即策略，grants 排最后，但 grants 有类目白名单，
 *    question/form/edit/write 永不可 grant（否则会压掉常量 deny 与 scope 规则）。
 *  - 救援用 session.update 原地补 grant（已实测可写），不新建 session、不全量重跑。
 *  - 插件 setup 只做注册；所有耗时工作都在工具 execute 内（location 销毁会中止 setup）。
 *  - setup 阶段禁止写盘（全局插件目录对每个 location 各加载一次）。
 */

const TOOL_NAME = "delegate"

/** build agent 的 ask 类目 → session 级 deny（无人值守下 ask 会永久挂死）。 */
export const CONSTANT_DENY: Array<{ action: string; resource: string }> = [
  { action: "shell", resource: "git push *" },
  { action: "shell", resource: "git push" },
  { action: "shell", resource: "git reset --hard *" },
  { action: "shell", resource: "git reset --hard" },
  { action: "shell", resource: "git clean -fd *" },
  { action: "shell", resource: "git clean -fd" },
  { action: "shell", resource: "git clean -fdx *" },
  { action: "shell", resource: "git clean -fdx" },
  { action: "shell", resource: "git checkout -- *" },
  { action: "shell", resource: "git checkout ." },
  { action: "shell", resource: "git restore *" },
  { action: "shell", resource: "git branch -D *" },
  { action: "shell", resource: "git stash drop *" },
  { action: "shell", resource: "git stash clear *" },
  { action: "shell", resource: "rm -rf *" },
  { action: "shell", resource: "rm -fr *" },
  { action: "shell", resource: "rm -r *" },
  { action: "shell", resource: "rm -f *" },
  { action: "shell", resource: "sudo *" },
  { action: "shell", resource: "cat *.env" },
  { action: "shell", resource: "cat *.env.*" },
  { action: "shell", resource: "head *.env" },
  { action: "shell", resource: "head *.env.*" },
  { action: "shell", resource: "tail *.env" },
  { action: "shell", resource: "tail *.env.*" },
  { action: "external_directory", resource: "*" },
  { action: "question", resource: "*" },
  { action: "form", resource: "*" },
  { action: "codebase-memory-mcp_index_repository", resource: "*" },
  { action: "codebase-memory-mcp_ingest_traces", resource: "*" },
  { action: "codebase-memory-mcp_manage_adr", resource: "*" },
  { action: "codebase-memory-mcp_delete_project", resource: "*" },
]

/** grants 允许的 action（用户可为本次任务预批的类目）。 */
export const GRANT_ALLOWED = new Set([
  "shell",
  "read",
  "grep",
  "glob",
  "list",
  "external_directory",
  "webfetch",
  "websearch",
  "lsp",
])

/** grants 永久禁止的类目：这些一旦被 grant 会破坏 D5 的三条规则。 */
export const GRANT_FORBIDDEN = new Set(["question", "form", "edit", "write"])

/**
 * front 可委托的 agent 白名单（ADR-front-knowledge-capability D2/D4）。
 * `build` = 工程 session（写）；其余 = 知识 session（只读）。
 */
export const READONLY_AGENTS = ["explore", "librarian", "oracle", "metis", "critic"] as const

export const ALLOWED_AGENTS = new Set<string>(["build", ...READONLY_AGENTS])

export type DelegateKind = "engineering" | "knowledge"

// ─────────────────── front-multi-backend：槽位与目标判等 ───────────────────

/**
 * 槽位登记态（ADR D6.3）。
 *
 * `dispatching` 也**占槽**——它的简报可能仍 pending 在上游 inbox（Phase 0 实测坐实），
 * 放行它等于让第二份简报与它并发写同一工作树。
 */
export type SlotState = "dispatching" | "active" | "idle" | "suspended" | "tombstone"

export const SLOT_STATES: readonly SlotState[] = [
  "dispatching",
  "active",
  "idle",
  "suspended",
  "tombstone",
]

/** 占据槽位的两种状态。 */
export const SLOT_OCCUPYING: readonly SlotState[] = ["dispatching", "active"]

/**
 * 目标判等键（ADR D3）。
 *
 * - `repo` = `canonical_root`（stateRoot）：判等回答"是不是**同一个项目**"，
 *   同一项目的不同工作树仍是同一项目 ⇒ 取 stateRoot（AC41）。
 * - `intent` = kebab slug：判等回答"是不是**同一个目标**"。
 */
export interface GoalKey {
  repo: string
  intent: string
}

export function isSlotState(value: unknown): value is SlotState {
  return typeof value === "string" && (SLOT_STATES as readonly string[]).includes(value)
}

/** kebab slug：ADR D3 约定 front 自行确定并在续接时复用同一 slug。 */
export function isKebabSlug(value: unknown): boolean {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

/**
 * 同 `workRoot` 下**占槽**的条目（纯函数）。
 *
 * 槽位键 = `workRoot`（ADR D6.1）：同一仓的多个 linked worktree 各自一槽；
 * 同一工作树内一次只能一个占槽（ADR D6.2）。
 *
 * `work_root` 缺失的**存量条目**不参与判定——它们的工作树未知，
 * 宁可漏判也不误判（存量条目由 `backfillPairEntry` 回填后才进入槽位表）。
 */
export function slotOccupants(
  pairs: Record<string, any> | undefined,
  workRoot: string,
): Array<{ session_id: string; state: SlotState; work_root: string; owner_agent: "front" | "plan"; owner_session_id: string | null }> {
  if (!pairs || typeof pairs !== "object") return []
  const out: Array<{ session_id: string; state: SlotState; work_root: string; owner_agent: "front" | "plan"; owner_session_id: string | null }> = []
  for (const [sessionID, entry] of Object.entries(pairs)) {
    if (!entry || typeof entry !== "object") continue
    const wr = entry.work_root
    if (typeof wr !== "string" || wr !== workRoot) continue
    const state = entry.state
    if (!isSlotState(state) || !SLOT_OCCUPYING.includes(state)) continue
    // owner_kind 缺失一律按 front（D5 默认值）；owner session id 用于判活
    const ownerAgent = entry.owner_agent === "plan" ? "plan" : "front"
    const ownerSessionID = typeof entry.front_session_id === "string" ? entry.front_session_id : null
    out.push({ session_id: sessionID, state, work_root: wr, owner_agent: ownerAgent, owner_session_id: ownerSessionID })
  }
  return out
}

/** 占槽者（第一个）；无占槽者返回 undefined。 */
export function slotHolder(
  pairs: Record<string, any> | undefined,
  workRoot: string,
): { session_id: string; state: SlotState; work_root: string } | undefined {
  return slotOccupants(pairs, workRoot)[0]
}

/**
 * 存量 pair 条目的**一次性回填**（AC40）。
 *
 * - 缺 `work_root` ⇒ 按 `canonical_root` 补（退化为原粒度，**不误判为同树**）。
 * - 缺 `state` ⇒ 按**活体判据**补（`busy` ⇒ `active`，否则 `idle`）。
 *   ⚠️ **不得一律默认 `idle`**——那等于给存量后端放行第二个写入者。
 * - **已有字段一律不改**（部分迁移条目：只缺哪个补哪个）。
 *
 * 返回**新对象**，不改原对象（纯函数，可单测）。
 */
export function backfillPairEntry(entry: any, fallbackWorkRoot: string, busy: boolean): any {
  const base = entry && typeof entry === "object" ? { ...entry } : {}
  if (typeof base.work_root !== "string" || base.work_root.length === 0) {
    base.work_root = fallbackWorkRoot
  }
  if (!isSlotState(base.state)) {
    base.state = busy ? "active" : "idle"
  }
  return base
}

/**
 * 活体判据（ADR D4 / AC21）：是否**正在跑**。
 *
 * 三级取值源（AC21）：
 * 1. `time.busy` 存在且（`idle` 未定义/为 0 或 `busy > idle`）⇒ running。
 * 2. 无 `busy` 但**有未终结活动**（最后消息时间晚于最后空闲时间）⇒ running
 *    （首次运行中的 session 从未 idle 过，AC22 的窗口期）。
 * 3. 否则 ⇒ 不在跑。
 *
 * ⚠️ **不可用作「消费」判据**：Phase 0 实测 pending 窗口的 `time` 只有
 * `created`/`updated`，**无 `busy`/`idle`**（消费只由 context 的 id 比对判定）。
 */
export function isRunning(info: any, messages?: any[]): boolean {
  const busy = toMillis(info?.time?.busy)
  const idle = toMillis(info?.time?.idle)
  if (busy > 0 && (idle === 0 || busy > idle)) return true
  if (busy === 0 && Array.isArray(messages) && messages.length > 0) {
    const last = lastMessageAt(messages)
    if (last > idle) return true
  }
  return false
}

/**
 * 「**这个后端还在跑吗**」——派发面的**准入判据**（AC19 / D8.1）。
 *
 * 与 `isRunning`（展示层）的关系：**更强**，是**析取**而非取反——
 *
 * ```
 * stillRunning := (busy > 0 ∧ (idle = 0 ∨ busy > idle))   // ① 有在跑的 execution
 *               ∨ (lastMsg > idle)                          // ② 有未终结活动（含无新消息的刚起）
 * ```
 *
 * 为什么不能只取其中一支（两支持有的假「空闲」形态）：
 * - 只用 ②「最后消息 > 最后 idle」⇒ 漏「**刚起、还没有消息**的新 execution」；
 * - 只用 `isRunning` 的第二级（`busy === 0` 前置）⇒ 漏 **stale-busy**（`busy` 陈旧
 *   `< idle` 且 `busy ≠ 0`，第二级因前置不成立而不生效）。
 *
 * ⚠️ **不是新决策**：`ADR-front-multi-backend` D4 只说了「第二级兜底的前提是
 * `busy` 未定义或为 0；stale-busy 不被它覆盖」——本函数是在其之上补的更强谓词，
 * 供两个派发面共用（D8.1 / AC19）；D4 的展示口径（`isRunning`）不变。
 */
export function stillRunning(info: any, messages?: any[]): boolean {
  const busy = toMillis(info?.time?.busy)
  const idle = toMillis(info?.time?.idle)
  if (busy > 0 && (idle === 0 || busy > idle)) return true
  if (Array.isArray(messages) && messages.length > 0 && lastMessageAt(messages) > idle) return true
  return false
}

/** `session.context()` 里的消息 id 集合（Phase 0：消费判据的精确形式）。 */
export function contextMessageIds(messages: any): Set<string> {
  const arr = Array.isArray(messages) ? messages : []
  const ids = new Set<string>()
  for (const m of arr) {
    const id = m?.id
    if (typeof id === "string" && id.length > 0) ids.add(id)
  }
  return ids
}

/** 槽位占用说明（拒绝时给 front 的可执行提示）。 */
export function describeHolder(holder: {
  session_id: string
  state: SlotState
  work_root: string
  owner_agent?: "front" | "plan"
}): string {
  return `后端 ${holder.session_id}（state=${holder.state}）已占用该工作树；先 suspend 它再派发`
}

/**
 * 跨 owner-kind 的占用文案（ADR D7.4）。
 *
 * - 被 **plan** 占：plan 优先，front 不得抢占或接管。
 * - 被 **front** 占：不自动抢占（plan 也不替 front 决定何时停）。
 * 同 owner-kind 的占用走既有的 `describeHolder`（先 suspend 它再派发）。
 */
export function describeHolderByOwner(
  holder: { session_id: string; state: SlotState; work_root: string; owner_agent?: "front" | "plan" },
  callerKind: "front" | "plan",
): string {
  const ownerKind = holder.owner_agent === "plan" ? "plan" : "front"
  if (ownerKind === callerKind) return describeHolder(holder)
  if (ownerKind === "plan") {
    return (
      `该工作树被 plan 的后端 ${holder.session_id} 占用（owner=plan, state=${holder.state}）。` +
      `按 ADR-plan-delegate-engineering-session D7，plan 优先：front 不得抢占或接管该后端。` +
      `可选动作：① 让 plan 侧 suspend/cancel 它；② front 改派其他工作树；③ 由用户协调`
    )
  }
  return (
    `该工作树被 front 的后端 ${holder.session_id} 占用（owner=front, state=${holder.state}）。` +
    `按 ADR-plan-delegate-engineering-session D7，plan 不自动抢占：请让 front 侧 suspend/cancel 它，或由用户协调`
  )
}

/**
 * `priority_blocked` ledger 事件的**字段清单（单点定义）**。
 *
 * 守卫（`tests/config-guards.test.ts`）与文档（ADR / 汇总）都从这里取 ——
 * 文档侧是投影、守卫不得再手抄一份（否则守卫自己就是第二份清单）。
 */
export const PRIORITY_BLOCKED_FIELDS = [
  "caller_kind",
  "holder_kind",
  "holder_state",
  "holder_session_id",
  "work_root",
  "path",
] as const

/** 落 D7 的可观测事件（拒绝点追加，不依赖收尾写）。 */
export function appendPriorityBlocked(
  stateRoot: string,
  record: {
    path: "delegate" | "dispatch" | "resume" | "cancel"
    callerKind: "front" | "plan"
    holderKind: "front" | "plan"
    holderState: string
    holderSessionID: string
    workRoot: string
    reason: string
  },
): void {
  appendLedger(stateRoot, {
    event: "priority_blocked",
    recorded_at: new Date().toISOString(),
    path: record.path,
    caller_kind: record.callerKind,
    holder_kind: record.holderKind,
    holder_state: record.holderState,
    holder_session_id: record.holderSessionID,
    work_root: record.workRoot,
    reason: record.reason,
  })
}

// ─────────────────── 停机窗口的**进程内**准入守卫（ADR-front-stop-confirmation D2）───────────────────
//
// 为什么**不落盘**：守卫的作用域是「**同一进程内**的新准入」（跨实例的准入本就不在本仓保证面）。
// 落盘的中间态一旦在 8s 停机窗口内遇到进程退出，就会留下**永久占槽的死条目**（该工作树
// 从此不可派发）—— 这是 `ADR-front-stop-confirmation` 明确否掉的方案（选项表 B6）。
// 进程内标记：崩溃即丢，`pair.json` 里条目仍是 `active` ⇒ 走既有 reconcile 回收。

export interface StopGuardEntry {
  /** 本次停机尝试的唯一 token（并发两次 `suspend` 时**不得互解**）。 */
  token: string
  /** 正在被停机的后端。 */
  backend_session_id: string
  /** 发起停机的会话（用于错误文案「正在停机（由会话 … 发起）」）。 */
  front_session_id?: string
}

const pendingStops = new Map<string, StopGuardEntry[]>()
let stopGuardSeq = 0

const stopGuardKey = (stateRoot: string, workRoot: string) => `${stateRoot}\u0000${workRoot}`

/** 置上守卫；返回本次的 token（`finally` 里用它精确移除，**只删自己**）。 */
export function enterStopGuard(
  stateRoot: string,
  workRoot: string,
  backendSessionID: string,
  frontSessionID?: string,
): string {
  const token = `g${++stopGuardSeq}`
  const key = stopGuardKey(stateRoot, workRoot)
  const list = pendingStops.get(key) ?? []
  list.push({ token, backend_session_id: backendSessionID, front_session_id: frontSessionID })
  pendingStops.set(key, list)
  return token
}

/** 移除本次守卫（引用计数语义：只删自己的 token，最后一个删完才移除键）。 */
export function leaveStopGuard(stateRoot: string, workRoot: string, token: string): void {
  const key = stopGuardKey(stateRoot, workRoot)
  const list = pendingStops.get(key)
  if (!list) return
  const next = list.filter((e) => e.token !== token)
  if (next.length === 0) pendingStops.delete(key)
  else pendingStops.set(key, next)
}

/** 该工作树当前是否有停机进行中（有 ⇒ 返回其一，供错误文案）。 */
export function stopGuardAt(stateRoot: string, workRoot: string): StopGuardEntry | undefined {
  const list = pendingStops.get(stopGuardKey(stateRoot, workRoot))
  return list && list.length > 0 ? list[0] : undefined
}

/** 测试钩子（只读）：当前所有停机守卫。生产代码不得依赖。 */
export function __pendingStops(): Array<{ work_root: string; owners: StopGuardEntry[] }> {
  return [...pendingStops.entries()].map(([k, v]) => ({ work_root: k.split("\u0000")[1] ?? k, owners: v }))
}

/**
 * 同 `workRoot` 下**仍在跑**的占槽条目（供**两个派发面共用**的槽位检查，AC50① / D7.4）。
 *
 * 「已空闲或已消失」的占槽条目不阻塞新派发（等同 reconcile-on-read 的读侧，
 * 真正的写回翻转由 `dispatch` 的 `claimSlot` 完成）。
 */
export async function slotBusyHolders(
  ctx: any,
  stateRoot: string,
  workRoot: string,
  excludeSessionID?: string,
): Promise<Array<{ session_id: string; state: SlotState; work_root: string; owner_agent: "front" | "plan"; owner_session_id: string | null }>> {
  const candidates = slotOccupants(readPairs(stateRoot), workRoot).filter(
    (c) => c.session_id !== excludeSessionID,
  )
  const busy: Array<{ session_id: string; state: SlotState; work_root: string; owner_agent: "front" | "plan"; owner_session_id: string | null }> = []
  for (const c of candidates) {
    try {
      const info = await ctx.session.get({ sessionID: c.session_id })
      // 补 messages：只用 `busy` 会漏「stale-busy」与「刚起无消息」两种仍在跑的形态
      let messages: any[] | undefined
      try {
        messages = await ctx.session.context({ sessionID: c.session_id })
      } catch {
        messages = undefined
      }
      if (stillRunning(info, messages)) busy.push(c)
    } catch {
      // 后端已消失 ⇒ 不再占槽
    }
  }
  return busy
}


/** kind 由 agent 推导，不由调用方声明（front 无法伪造类型）。 */
export function kindOfAgent(agent: string): DelegateKind {
  return agent === "build" ? "engineering" : "knowledge"
}

export const WAIT_TIMEOUT_MS = 30 * 60 * 1000

export function fail(message: string): Error {
  return new Error(message)
}

export function isAbsolute(p: string): boolean {
  return path.isAbsolute(p)
}

export function toMillis(value: unknown): number {
  if (value == null) return 0
  if (typeof value === "number") return value
  if (value instanceof Date) return value.getTime()
  const parsed = Date.parse(String(value))
  return Number.isNaN(parsed) ? 0 : parsed
}

/** git 调用注入点（默认 execFileSync）。AC18：单测可注入，不改 module。 */
export type GitRunner = (args: string[], cwd: string) => string

const defaultGitRunner: GitRunner = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })

/**
 * 归一两个根（ADR-canonical-root-normalization D1/D2）：
 *
 *   stateRoot = superproject 非空 ? superproject : dirname(abs(--git-common-dir))
 *   workRoot  = abs(--show-toplevel)
 *
 * - stateRoot：状态文件（pair/role/ledger）的落盘根。worktree 下是主仓——两份状态
 *   分裂会导致 resume 查无此条。
 * - workRoot：`git status` 差集与 scope 相对解析的基准。worktree 下就是 worktree——
 *   在主仓跑 git status 数不到 worktree 的变更（artifacts 恒 0 → unverified 误报）。
 * - 非 worktree 场景两者恒等 ⇒ 行为零变化。
 * - submodule：`--git-common-dir` 指向 `.git/modules/…`（非工作区路径），故必须先判
 *   `--show-superproject-working-tree`（非 submodule 时返回空串）。
 */
export function canonicalRoot(
  dir: string,
  gitRunner: GitRunner = defaultGitRunner,
): { stateRoot: string; workRoot: string; vcs: boolean } {
  try {
    const toplevel = gitRunner(["rev-parse", "--show-toplevel"], dir).trim()
    if (!toplevel) throw fail("empty toplevel")
    const workRoot = path.resolve(toplevel)
    const superproject = gitRunner(["rev-parse", "--show-superproject-working-tree"], dir).trim()
    if (superproject) {
      // submodule：状态归属 superproject 工作树，不是 .git/modules/…
      return { stateRoot: path.resolve(superproject), workRoot, vcs: true }
    }
    const common = absoluteCommonDir(gitRunner, dir)
    return { stateRoot: common ? path.dirname(common) : workRoot, workRoot, vcs: true }
  } catch {
    // 非 git 目录：回退到路径本身（两个根相同，零行为变化）
    const fallback = path.resolve(dir)
    return { stateRoot: fallback, workRoot: fallback, vcs: false }
  }
}

/**
 * `--git-common-dir` 的绝对路径。
 *
 * git ≥ 2.31 用 `--path-format=absolute`；旧版回退到「裸 `--git-common-dir` + 以
 * **调用 cwd** 为基准 resolve」——主仓下裸命令返回相对路径 `.git`，用进程 cwd 会错位。
 * 返回 undefined 表示拿不到（调用方退回 workRoot）。
 */
function absoluteCommonDir(gitRunner: GitRunner, dir: string): string | undefined {
  try {
    const withFormat = gitRunner(
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      dir,
    ).trim()
    if (withFormat) return path.resolve(withFormat)
  } catch {
    // git < 2.31：--path-format 未知选项
  }
  try {
    const bare = gitRunner(["rev-parse", "--git-common-dir"], dir).trim()
    if (bare) return path.resolve(dir, bare)
  } catch {
    /* 拿不到就不归一 */
  }
  return undefined
}

export function gitStatusPaths(root: string): string[] {
  try {
    const out = execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const trimmed = line.replace(/^[ MADRCU?!]{1,2}\s+/, "")
        const arrow = trimmed.indexOf(" -> ")
        return arrow >= 0 ? trimmed.slice(arrow + 4).trim() : trimmed.trim()
      })
      .filter((p) => p.length > 0)
  } catch {
    return []
  }
}

/** scope 前缀 → session 级 edit 资源（相对工程根，file-access 用相对路径做资源）。 */
export function scopeEditRules(projectRoot: string, scope: string[]): Array<{ action: string; resource: string; effect: string }> {
  const rules: Array<{ action: string; resource: string; effect: string }> = [
    { action: "edit", resource: "*", effect: "deny" },
  ]
  for (const raw of scope) {
    // 归一化**单一实现**（`normalizeScopePath`）：class 相容性校验共用同一套，
    // 禁止各写一份（否则 "src/../docs/adr" 之类写法两处判定会漂移）。
    const normalized = normalizeScopePath(projectRoot, raw)
    if (normalized === null) continue // 工程根之外：不放行
    // "" = 整个工程（"" / "." / "./" 三者等价）：先 deny 再 allow，净效果放行全部 edit。
    if (normalized.length === 0) {
      rules.push({ action: "edit", resource: "*", effect: "allow" })
      continue
    }
    // scope 可能是目录（"src"）也可能是文件（"answer.txt"）：
    // 文件型 scope 必须同时放行文件本身与其子路径，否则 "x/*" 匹配不到 "x"。
    rules.push({ action: "edit", resource: normalized, effect: "allow" })
    rules.push({ action: "edit", resource: `${normalized}/*`, effect: "allow" })
  }
  return rules
}

// ===== role_class（`ADR-backend-handoff-role-class` D1–D8）=====

/** 派发时声明的能力类：一次派发只做一个角色类的工作。 */
export const ROLE_CLASSES = ["builder", "architect", "verifier"] as const
export type RoleClass = (typeof ROLE_CLASSES)[number]

/** 缺省值：**只有 `undefined` 走缺省**（`null` / `""` 是非法值，不是「没填」）。 */
export const ROLE_CLASS_DEFAULT: RoleClass = "builder"

export function isRoleClass(value: unknown): value is RoleClass {
  return typeof value === "string" && (ROLE_CLASSES as readonly string[]).includes(value)
}

/** 解析 role_class：`undefined` ⇒ 缺省 builder；其它任何值（含 `null` / `""`）⇒ 抛。 */
export function parseRoleClass(raw: unknown): RoleClass {
  if (raw === undefined) return ROLE_CLASS_DEFAULT
  if (!isRoleClass(raw)) {
    throw fail(
      `role_class 不合法: ${JSON.stringify(raw ?? null)}（允许：${ROLE_CLASSES.join(", ")}；` +
        `缺省 ${ROLE_CLASS_DEFAULT}；缺省只认 undefined —— null / "" 是非法值，不是「没填」）`,
    )
  }
  return raw
}

/**
 * 架构文档目录（`archRoots`）—— 架构类派发的 edit 上限来源。
 *
 * 判定三态（与 `prompts/build.md` §架构文档范围 同口径，但**只回退 `docs/adr`**）：
 * - 态 1：`.rddf/config/arch-docs.json` 可读、`arch_paths` 非空、且其中至少一条实际存在
 *   ⇒ 用 `arch_paths`；
 * - 态 2/3：配置缺失 / 为空 / 损坏 / 全部路径失效 ⇒ 回退 `docs/adr`（存在才用）；
 * - 仍无 ⇒ 空集 ⇒ architect 类派发被拒（错误信息指向 `scripts/arch-docs-init.sh`）。
 *
 * ⚠ **不复刻 `scripts/arch-docs-init.sh` 的 survey 启发式**（目录名 + maxdepth）：
 * 那是「发现待建目录」的工具口径；此处是「读已配置范围」，两套定义会漂移。
 */
export function archRoots(projectRoot: string): string[] {
  const configPath = path.join(projectRoot, ".rddf", "config", "arch-docs.json")
  let configured: string[] = []
  try {
    const raw = readJson(configPath)
    const paths = raw && typeof raw === "object" ? (raw as any).arch_paths : undefined
    if (Array.isArray(paths)) {
      configured = paths
        .map((item) => String(item ?? "").trim().replace(/^\.\//, "").replace(/\/+$/, ""))
        .filter((item) => item.length > 0)
    }
  } catch {
    configured = [] // 配置损坏 ⇒ 落回态 2
  }
  const existing = configured.filter((item) => existsSync(path.resolve(projectRoot, item)))
  if (existing.length > 0) return existing
  const fallback = "docs/adr"
  return existsSync(path.resolve(projectRoot, fallback)) ? [fallback] : []
}

/** 某一类的 edit 上限（相对工程根的路径前缀）。`builder` 无额外上限（scope 自身即边界）。 */
export function classAllowRoots(roleClass: RoleClass, projectRoot: string): string[] {
  if (roleClass === "builder") return []
  if (roleClass === "verifier") return [".rddf/reviews"]
  return [...archRoots(projectRoot), ".rddf/reviews", ".rddf/config/arch-docs.json"]
}

/**
 * scope 项归一化（**单一实现**，`scopeEditRules` 与 class 相容性校验共用）。
 * 返回：相对工程根的路径；`""` = 整个工程；`null` = 工程根之外。
 */
export function normalizeScopePath(projectRoot: string, raw: string): string | null {
  const trimmed = String(raw ?? "").trim().replace(/^\.\//, "").replace(/\/+$/, "")
  if (trimmed.length === 0 || trimmed === ".") return ""
  const absolute = isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(projectRoot, trimmed)
  const relative = path.relative(projectRoot, absolute)
  if (relative.startsWith("..")) return null
  return relative.split(path.sep).join("/")
}

/**
 * class × scope 相容性校验（D8 ②层，硬拒发生在 `session.create` 之前）。
 *
 * - `builder`：scope 自身即边界，不额外校验；
 * - `architect` / `verifier`：**每一项**都必须落在该类允许集内（不是「有交集即放行」）；
 * - symlink：解析 realpath 后再判（`docs/adr` → `src` 的软链不得放行）。
 */
export function assertRoleClassCompatible(
  brief: { role_class: RoleClass; scope: string[] },
  workRoot: string,
): void {
  if (brief.role_class === "builder") return
  // architect：架构文档目录为空 ⇒ 直接拒（而不是让 scope 撞成"越界"）——
  // 两者的修复动作不同：前者是"先初始化架构目录"，后者是"scope 写错了"。
  if (brief.role_class === "architect" && archRoots(workRoot).length === 0) {
    throw fail(
      `role_class=architect 但本工程没有可写的架构文档目录` +
        `（.rddf/config/arch-docs.json 未配置或全部失效，且 docs/adr 不存在）：` +
        `请先运行 scripts/arch-docs-init.sh 初始化，或改派 builder 类`,
    )
  }
  const allow = classAllowRoots(brief.role_class, workRoot)
  if (allow.length === 0) {
    throw fail(
      `role_class=${brief.role_class} 没有可写的允许集：改派 builder 类或补齐 scope`,
    )
  }
  for (const raw of brief.scope) {
    const normalized = normalizeScopePath(workRoot, raw)
    if (normalized === null) {
      throw fail(`role_class=${brief.role_class} 的 scope 项越界: ${raw}（不在工程根 ${workRoot} 内）`)
    }
    if (normalized.length === 0) {
      throw fail(
        `role_class=${brief.role_class} 不允许 scope 覆盖整个工程（${raw}）：只能落在 ${allow.join(", ")} 内`,
      )
    }
    // symlink 语义：realpath 逃出允许集 ⇒ 拒（`docs/adr` 软链到 `src` 的情形）
    const absolute = path.resolve(workRoot, normalized)
    const real = existsSync(absolute) ? realpathSync(absolute) : absolute
    const realRel = path.relative(workRoot, real).split(path.sep).join("/")
    if (realRel.startsWith("..") || realRel.length === 0) {
      throw fail(
        `role_class=${brief.role_class} 的 scope 项越界（symlink 解析后）: ${raw} → ${realRel || real}`,
      )
    }
    const allowed = allow.some((root) => realRel === root || realRel.startsWith(root + "/"))
    if (!allowed) {
      throw fail(`role_class=${brief.role_class} 的 scope 项越界: ${raw}（允许：${allow.join(", ")}）`)
    }
  }
}

/**
 * resume 的 class 一致性（D6 / D10）：**登记值是权威**。
 * - 登记有值且与请求不同 ⇒ 硬拒（同一 session 内不允许换类）；
 * - 存量条目（无登记值）⇒ 按缺省 builder 解释（AC17）；
 * - 返回值 = 该 session 的**有效 class**（简报文本据此生成）。
 */
export function assertResumeRoleClass(
  existing: any,
  requested: RoleClass,
  sessionID: string,
  requestedProvided = true,
): RoleClass {
  const stored = existing?.role_class
  if (stored === undefined || stored === null) {
    // 存量条目（机制落地前登记）：按缺省 builder 解释（AC17）。
    // 显式声明了别的类 ⇒ 拒（不能凭声明把一个存量 builder 变成 architect）。
    if (requestedProvided && requested !== ROLE_CLASS_DEFAULT) {
      throw fail(
        `resume_session ${sessionID} 是存量条目（无 role_class 登记，按 ${ROLE_CLASS_DEFAULT} 解释）：` +
          `不能用 role_class=${requested} 续接（同一 session 内不允许换类）`,
      )
    }
    return ROLE_CLASS_DEFAULT
  }
  if (!isRoleClass(stored)) {
    throw fail(`resume_session ${sessionID} 的登记 role_class 非法: ${String(stored)}`)
  }
  // **登记值是权威**：显式声明了不同的类 ⇒ 硬拒；没声明 ⇒ 沿用登记值
  // （简报文本由它生成 ⇒ 权限与声明永远一致）。
  if (requestedProvided && stored !== requested) {
    throw fail(
      `resume_session ${sessionID} 的 role_class 不匹配：登记 ${stored} ≠ 请求 ${requested}` +
        `（同一 session 内不允许换类；换类请新建 session）`,
    )
  }
  return stored
}

/**
 * subagent 白名单（D4）：三类统一。
 *
 * - `deny *` 在前、逐条 `allow` 在后（`evaluate` 取 findLast ⇒ 后写覆盖先写）；
 * - 只放行**只读** agent：`general` / `context-builder` 的 `shell: {"*":"allow"}`
 *   可经 `> file` 绕过 edit 边界 ⇒ 排除；
 * - `build` 是 primary agent，内核直接拒它作为 subagent（拉不起可写后端）。
 */
export const ROLE_CLASS_SUBAGENTS = ["explore", "librarian", "oracle", "metis", "critic"] as const

export function classSubagentRules(): Array<{ action: string; resource: string; effect: string }> {
  return [
    { action: "subagent", resource: "*", effect: "deny" },
    ...ROLE_CLASS_SUBAGENTS.map((agent) => ({ action: "subagent", resource: agent, effect: "allow" })),
  ]
}

/**
 * 权限组装（**单一实现**，同步 `delegate` 与异步 `dispatch` 共用 —— D8）。
 *
 * 顺序即策略（`evaluate` 取 findLast）：
 * 1. `CONSTANT_DENY`（危险命令）→ 2. edit 规则（`edit:* deny` 在前、按 scope allow 在后）
 * 3. grants（用户预批）→ 4. subagent 白名单（`deny *` 在前、只读 agent allow 在后）。
 *
 * ⚠ **不得在此处按 class 分叉**：class 的 edit 上限由**派发时的相容性校验**把关
 * （`assertRoleClassCompatible`：scope 越出类上限 ⇒ 派发被拒），
 * 而非靠这里再叠一层 deny —— 否则"派发被拒"与"派发成功但写不了"两种失败不可区分。
 */
export function classPermissions(input: {
  roleClass: RoleClass
  workRoot: string
  scope: string[]
  kind: DelegateKind
  grants: Array<{ action: string; resource: string; effect: string }>
}): Array<{ action: string; resource: string; effect: string }> {
  const editRules =
    input.kind === "engineering"
      ? scopeEditRules(input.workRoot, input.scope)
      : [{ action: "edit", resource: "*", effect: "deny" }]
  return [
    ...CONSTANT_DENY.map((rule) => ({ ...rule, effect: "deny" as const })),
    ...editRules,
    ...input.grants,
    // subagent 白名单**只对可写工程 session**（D4）：知识 session 原本就没有 subagent 能力
    // （只读 agent 的 `subagent: deny`），不得在这里顺带放开。
    ...(input.kind === "engineering" ? classSubagentRules() : []),
  ]
}

export function validateGrants(grants: any): Array<{ action: string; resource: string; effect: string }> {
  if (grants === undefined || grants === null) return []
  if (!Array.isArray(grants)) throw fail("grants 必须是数组")
  const out: Array<{ action: string; resource: string; effect: string }> = []
  for (const item of grants) {
    if (!item || typeof item !== "object") throw fail("grants 元素必须是 {action, resource} 对象")
    const action = String((item as any).action ?? "")
    const resource = String((item as any).resource ?? "")
    if (action.length === 0 || resource.length === 0) throw fail("grants 元素必须同时有 action 与 resource")
    if (GRANT_FORBIDDEN.has(action)) {
      throw fail(`grants 不允许 action=${action}（question/form/edit/write 永不可 grant，否则会压掉安全边界）`)
    }
    if (!GRANT_ALLOWED.has(action)) {
      throw fail(`grants 不允许 action=${action}（可 grant：${[...GRANT_ALLOWED].join(", ")}）`)
    }
    if (action === "read" && resource.includes(".env")) {
      throw fail("grants 不允许 read .env")
    }
    out.push({ action, resource, effect: "allow" })
  }
  return out
}

/**
 * D2 accepted roots（`ADR-plan-delegate-engineering-session` D2）：
 * plan 派发**可写实施**（agent=build）时必须引用一个**已存在**的计划文件。
 *
 * 通则：**可写 ≠ 可引用** —— accepted roots 是唯一判据，与 plan 的 edit 白名单
 * 无包含关系（plan 可写但不在清单内的路径引用时一律被拒，是有意边界）。
 * 校验性质：存在性校验是"计划先行"的强制函数，**不是相关性证明**。
 */
export const PLAN_REF_ROOTS = [
  { label: ".rddf/plans/**", re: /(^|\/)\.rddf\/plans\/[^/]+\.md$/ },
  { label: ".rddf/improvements/**", re: /(^|\/)\.rddf\/improvements\/[^/]+\.md$/ },
  { label: ".rddf/roadmap/**", re: /(^|\/)\.rddf\/roadmap\/[^/]+\.md$/ },
  { label: "openspec/changes/*/proposal.md", re: /(^|\/)openspec\/changes\/[^/]+\/proposal\.md$/ },
] as const

export function planRefRootLabels(): string {
  return PLAN_REF_ROOTS.map((r) => r.label).join(" / ")
}

/**
 * 校验 plan_ref。
 *
 * - 解析根：绝对路径原样使用；相对路径**相对 project_dir** 解析（不用插件进程 cwd ——
 *   后者与派发方 session 的 cwd 无关）。
 * - 判定：先过 accepted roots（相对路径按 project_dir 相对路径判；绝对路径按全路径判），
 *   再判文件存在。
 */
export function validatePlanRef(input: {
  planRef: unknown
  projectDir: string
  required: boolean
}): { ok: true; resolved: string } | { ok: false; message: string } {
  const roots = planRefRootLabels()
  const raw = input.planRef === undefined || input.planRef === null ? "" : String(input.planRef).trim()
  if (raw.length === 0) {
    if (!input.required) return { ok: true, resolved: "" }
    return {
      ok: false,
      message:
        `plan_ref 必填：派发可写实施（agent=build）时必须引用已产出的计划文件（accepted roots: ${roots}）`,
    }
  }
  const absolute = isAbsolute(raw)
  const resolved = absolute ? raw : path.resolve(input.projectDir, raw)
  const target = absolute ? resolved : path.relative(input.projectDir, resolved)
  const hit = PLAN_REF_ROOTS.find((r) => r.re.test(target))
  if (!hit) {
    return { ok: false, message: `plan_ref 不在 accepted roots 内: ${raw}（accepted roots: ${roots}）` }
  }
  if (!existsSync(resolved)) {
    return { ok: false, message: `plan_ref 指向的文件不存在: ${resolved}（accepted roots: ${roots}）` }
  }
  return { ok: true, resolved }
}

/**
 * owner 会话是否仍存活（**全仓唯一实现**）。
 *
 * 归属门控（suspend）、跨 owner-kind 的 resume / cancel 硬拒（D7）共用它 ——
 * 不另写第二份「owner 是否消亡」的判断（ADR D7.2/D7.3 的「禁止第三套谓词」约束）。
 */
export async function frontAlive(ctx: any, frontSessionID: string): Promise<boolean> {
  try {
    const info = await ctx.session.get({ sessionID: frontSessionID })
    return !!info
  } catch {
    return false
  }
}

/** 派发方 agent（用于判定 plan 侧 D2 强制与 owner_agent 归属）。 */
export async function resolveCallerAgent(ctx: any, sessionID: string | undefined): Promise<string | undefined> {
  if (!sessionID) return undefined
  try {
    const session = await ctx.session.get({ sessionID })
    return (session as any)?.agent
  } catch {
    return undefined
  }
}

/** owner_agent：只有 plan 是新主体；缺失一律按 front 解释（旧数据默认 front）。 */
export function ownerAgentOf(agent: string | undefined): "front" | "plan" {
  return agent === "plan" ? "plan" : "front"
}

export function validateBrief(input: any): {
  project_dir: string
  agent: string
  agentProvided: boolean
  kind: DelegateKind
  task: string
  goal: string
  scope: string[]
  acceptance: string
  constraints: string
  grants: Array<{ action: string; resource: string; effect: string }>
  resume_session?: string
  remove: boolean
  goal_key?: GoalKey
  plan_ref?: string
  role_class: RoleClass
  /** 是否**显式**声明了 role_class（`undefined` = 没填 ⇒ 缺省 builder）。 */
  role_class_provided: boolean
} {
  const projectDir = String(input.project_dir ?? "")
  if (projectDir.length === 0) throw fail("project_dir 必填")
  if (!isAbsolute(projectDir)) throw fail("project_dir 必须是绝对路径")
  if (!existsSync(projectDir)) throw fail(`project_dir 不存在: ${projectDir}`)

  const task = String(input.task ?? "")
  const goal = String(input.goal ?? "")
  const acceptance = String(input.acceptance ?? "")
  for (const [name, value] of [
    ["task", task],
    ["goal", goal],
    ["acceptance", acceptance],
  ] as const) {
    if (value.trim().length === 0) throw fail(`${name} 必填且不能为空`)
  }

  const planRefRaw = input.plan_ref === undefined || input.plan_ref === null ? "" : String(input.plan_ref).trim()
  const plan_ref = planRefRaw.length > 0 ? planRefRaw : undefined

  const agentProvided = input.agent !== undefined && input.agent !== null
  const agent = String(input.agent ?? "build").trim() || "build"
  if (!ALLOWED_AGENTS.has(agent)) {
    throw fail(`agent 不在白名单内: ${agent}（允许：${[...ALLOWED_AGENTS].join(", ")}）`)
  }
  const kind = kindOfAgent(agent)

  // role_class（ADR D1）：**缺省只认 `undefined`**（`null` / `""` 是非法值）。
  // 知识 session 与之互斥：它不写 role.json，class 无处落（D1）。
  const roleClass = parseRoleClass(input.role_class)
  const roleClassProvided = input.role_class !== undefined
  if (kind === "knowledge" && roleClassProvided) {
    throw fail("知识 session 不接受 role_class（只读语义无能力类；见 ADR-backend-handoff-role-class D1）")
  }

  // scope：工程 session 必填非空；知识 session 可省略或为空（不参与权限组装）。
  const scope = input.scope
  const scopeList: string[] = []
  if (scope !== undefined && scope !== null) {
    if (!Array.isArray(scope)) throw fail("scope 必须是字符串数组")
    for (const item of scope) {
      if (typeof item !== "string" || item.trim().length === 0) throw fail("scope 元素必须是非空字符串")
      scopeList.push(item.trim())
    }
  }
  if (kind === "engineering" && scopeList.length === 0) {
    throw fail("scope 必填且必须是非空字符串数组（仅工程 session 需要）")
  }

  const constraints = String(input.constraints ?? "")
  const resume = input.resume_session === undefined ? undefined : String(input.resume_session)
  const remove = input.remove === true
  const grants = validateGrants(input.grants)
  if (kind === "knowledge" && grants.length > 0) {
    throw fail("知识 session 不接受 grants（只读语义不允许任何预批放宽）")
  }

  // goal_key（ADR D3）：**可选但格式受检**。必填由 dispatch 工具按 kind 检查
  // ——既有 delegate 路径不引入新必填字段（既有判据不得变化，AC50）。
  let goal_key: GoalKey | undefined
  const rawKey = input.goal_key
  if (rawKey !== undefined && rawKey !== null) {
    if (typeof rawKey !== "object") throw fail("goal_key 必须是对象 {repo?, intent}")
    const intent = String((rawKey as any).intent ?? "")
    if (!isKebabSlug(intent)) {
      throw fail(`goal_key.intent 必须是 kebab slug（^[a-z0-9]+(-[a-z0-9]+)*$）: ${intent || "(空)"}`)
    }
    const repo = (rawKey as any).repo === undefined ? undefined : String((rawKey as any).repo)
    goal_key = { repo: repo ?? "", intent }
  }

  return {
    project_dir: projectDir,
    agent,
    agentProvided,
    kind,
    task,
    goal,
    scope: scopeList,
    acceptance,
    constraints,
    grants,
    resume_session: resume,
    remove,
    goal_key,
    plan_ref,
    role_class: roleClass,
    role_class_provided: roleClassProvided,
  }
}

export function buildBrief(brief: ReturnType<typeof validateBrief>, projectRoot: string): string {
  const lines: string[] = []
  lines.push("## 委托简报（来自委托方会话）")
  lines.push("")
  lines.push(`- 目标（goal）: ${brief.goal}`)
  lines.push(`- 工程根: ${projectRoot}`)
  if (brief.plan_ref) lines.push(`- 计划引用（plan_ref）: ${brief.plan_ref}`)
  lines.push(`- 类型（kind）: ${brief.kind}`)
  if (brief.kind === "engineering") {
    lines.push(`- 允许变更范围（scope）: ${brief.scope.join(", ")}`)
  } else {
    lines.push(`- 允许变更范围（scope）: 无（知识 session 只读，不产生文件变更）`)
  }
  lines.push(`- 验收判据（acceptance）: ${brief.acceptance}`)
  if (brief.constraints.trim().length > 0) {
    lines.push(`- 额外约束（constraints）: ${brief.constraints}`)
  }
  if (brief.grants.length > 0) {
    lines.push(`- 用户已预批的操作（grants）: ${brief.grants.map((g) => `${g.action}:${g.resource}`).join(", ")}`)
  }
  lines.push("")
  if (brief.kind === "engineering") {
    // 运行身份（role_class）—— 简报是**唯一**按 session 注入的身份通道
    // （session metadata 不进模型上下文）。
    lines.push("## 运行身份")
    lines.push("")
    lines.push(`- 你是被派发的后端工程 session；本 session 的 role_class = ${brief.role_class}。`)
    lines.push("- 只做本类任务：判断标准是「要写的东西在不在本类允许集内」——读任何路径都不算越类。")
    lines.push("- 需要别的类的工作 ⇒ 停在动手前，按下方 HANDOFF 契约交回主会话（不得自行切换类）。")
    lines.push("- 若已被 suspend / resume，上下文保留，role_class 不变（来自登记值，不接受改写）。")
    lines.push("")
  }
  lines.push("## 任务原话（task）")
  lines.push("")
  lines.push(brief.task)
  lines.push("")
  lines.push("## 执行要求")
  lines.push("")
  if (brief.kind === "engineering") {
    lines.push("1. 只在 scope 内改动；scope 外的文件不得写入。")
    if (brief.role_class === "architect") {
      lines.push(
        "2. 按 ADR 完成标志自查（四要素 + oracle→critic 双审 + BLOCKER 闭合 + 复审验闭合），报告实际执行的命令与结果。",
      )
    } else if (brief.role_class === "verifier") {
      lines.push(
        "2. 只出证据与判决：按判据来源逐条取证（每条至少 1 条工具证据），报告实际执行的命令与结果；不改实现、不改 tasks.md。",
      )
    } else {
      lines.push("2. 按 acceptance 自行验证，报告实际执行的命令与结果。")
    }
    lines.push("3. 不要 git commit / git push —— 提交由用户确认后另行发起。")
    lines.push("4. 遇到权限被拒（Permission denied）不要换写法绕过，直接说明被拒的操作并停下。")
    lines.push("5. 交回（HANDOFF）：需要改 plan / AC / tasks、改已签批 ADR、换类、或缺外部信息 ⇒")
    lines.push(
      "   ① 先落凭据：`rddf feedback add <proposal> --from rdd-builder --kind <needs-revision|ac-fail|blocked> --body \"<5 项>\"`",
    )
    lines.push(
      "      （5 项 = ① kind ② 阻塞点(file:line 或 task 编号) ③ 需要什么决策 ④ 已完成/未完成 ⑤ 建议的下一步指令草案；缺一即无效）；",
    )
    lines.push("   ② 再把**本回合首行**写成 `HANDOFF: <kind>`（该回合省略角色开场报告，首行只能是它）；")
    lines.push("   ③ 然后结束回合。`rddf` 不可用或额度耗尽（写不进）时，仍输出首行 + 完整 5 项正文。")
  } else {
    lines.push("1. 这是只读的知识/调研任务：**不要修改任何文件**，不要 commit。")
    lines.push("2. 给出结论时标注证据（`file:line` / URL）；不确定的地方明确说不确定。")
    lines.push("3. 若任务实际需要文件变更，请在结论中说明并停下——变更必须转工程 session。")
    lines.push("4. 遇到权限被拒（Permission denied）不要换写法绕过，直接说明被拒的操作并停下。")
  }
  return lines.join("\n")
}

/** 目录锁（原子 mkdir），用于 role.json / pair.json 的跨写入方互斥。 */
export function withLock(lockDir: string, fn: () => void): void {
  const staleMs = 30_000
  const deadline = Date.now() + 10_000
  for (;;) {
    try {
      mkdirSync(lockDir, { recursive: false })
      break
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e
      try {
        const age = Date.now() - statSync(lockDir).mtimeMs
        if (age > staleMs) {
          rmSync(lockDir, { recursive: true, force: true })
          continue
        }
      } catch {
        continue
      }
      if (Date.now() > deadline) throw fail(`获取锁超时: ${lockDir}`)
      // 协作式让步：同步睡眠 20ms（Atomics.wait 阻塞当前线程，不依赖外部命令）
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
  try {
    fn()
  } finally {
    try {
      rmSync(lockDir, { recursive: true, force: true })
    } catch {
      /* 锁清理失败不阻塞主流程 */
    }
  }
}

export function readJson(file: string): any {
  try {
    if (!existsSync(file)) return undefined
    const raw = readFileSync(file, "utf8")
    if (raw.trim().length === 0) return undefined
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function writeJsonAtomic(file: string, value: any): void {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n")
  renameSync(tmp, file)
}

/**
 * role.json 的 `sessions` 分区写入（**调用方必须已持有 `.role.lock`**）。
 *
 * 与 `registerSession` 的关系：`registerSession` = 取锁 + 写 pair + 写 role；
 * 本函数 = 只写 role（供「槽位检查 + 登记 + role 分区」必须同处一个临界区的场景）。
 */
export function writeRoleSession(root: string, sessionID: string, agent: string, roleClass?: RoleClass): void {
  const stateDir = path.join(root, ".rddf", "state")
  const roleFile = path.join(stateDir, "role.json")
  const role = readJson(roleFile) ?? {}
  const sessions = role.sessions && typeof role.sessions === "object" ? role.sessions : {}
  sessions[sessionID] = {
    current_role: agent === "build" ? "builder" : agent,
    // role_class = **能力画像**（D2）：与治理身份 `current_role` 分开 ——
    // 后端恒为 builder，但本次派发允许它做哪一类工作由 role_class 声明。
    role_class: roleClass ?? ROLE_CLASS_DEFAULT,
    auto_switch_window: null,
    auto_answer: null,
    updated_at: new Date().toISOString(),
  }
  role.sessions = sessions
  role.current_role = role.current_role ?? sessions[sessionID].current_role
  role.updated_at = new Date().toISOString()
  writeJsonAtomic(roleFile, role)
}

/**
 * pair.json 的**条目集合**读写（front-multi-backend 槽位表用）。
 *
 * - `readPairs`：**无锁**读（调用方负责一致性判定；槽位判定走「锁外读 → 锁内重验」）。
 * - `writePairs`：**调用方必须已持有 `.role.lock`**（否则与 registerSession 竞态）。
 */
export function readPairs(root: string): Record<string, any> {
  const pair = readJson(path.join(root, ".rddf", "state", "pair.json"))
  if (!pair || typeof pair.pairs !== "object") return {}
  return pair.pairs as Record<string, any>
}

/** pair.json 写入（调用方必须已持有 `.role.lock`）。 */
export function writePairs(root: string, pairs: Record<string, any>): void {
  const pairFile = path.join(root, ".rddf", "state", "pair.json")
  writeJsonAtomic(pairFile, { version: "pair-v2", pairs })
}

/** ledger 行（JSONL）追加；调用方必须已持有 `.role.lock`。 */
export function appendLedgerLine(root: string, row: any): void {
  const stateDir = path.join(root, ".rddf", "state")
  mkdirSync(stateDir, { recursive: true })
  appendFileSync(path.join(stateDir, "ledger.jsonl"), JSON.stringify(row) + "\n")
}

/** 供 busy 等无登记写入的分支使用：自己取同一把锁后追加一行。 */
export function appendLedger(root: string, row: any): void {
  const stateDir = path.join(root, ".rddf", "state")
  const lockDir = path.join(stateDir, ".role.lock")
  mkdirSync(stateDir, { recursive: true })
  withLock(lockDir, () => appendLedgerLine(root, row))
}

/** 截断 + 脱敏：ledger 落盘时 last_assistant_text 可能含凭证。 */
export function redactAndTruncate(text: string, max = 800): string {
  let s = String(text ?? "")
  s = s.replace(/\b(?:oc_sk|sk|xox[baprs]|ghp|gho|ghu|ghs|ghr)[-_][A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
  s = s.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
  s = s.replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1[REDACTED]")
  if (s.length > max) s = s.slice(0, max) + "…"
  return s
}

/**
 * 登记 pair + role.json 的 session 分区（single writer = 本插件）。
 * `kind=knowledge` 只写 pair（含 kind 字段），**不触碰 role.json**——
 * 否则会在 sessions 分区产生非法 `current_role`（如 "explore"）。
 *
 * `extra`（front-multi-backend）：`work_root`（工作树根 = 槽位键）/ `state`（槽位登记态）/
 * `goal_key`（目标判等键）。**已存在的条目里这些字段不被覆盖**（除显式传入），
 * 存量条目缺字段时由 `backfillPairEntry` 一次性回填。
 */
export function registerSession(
  root: string,
  sessionID: string,
  frontSessionID: string | undefined,
  agent: string,
  kind: DelegateKind = kindOfAgent(agent),
  ledgerRow?: any,
  extra?: {
    work_root?: string
    state?: SlotState
    goal_key?: GoalKey
    owner_agent?: "front" | "plan"
    role_class?: RoleClass
  },
  /**
   * `bumpClaim=true` ⇒ 本次登记**认领**了槽位（归属变更 ⇒ `claim_gen` +1）；
   * 默认（收尾写 outcome 等字段）⇒ **良性写** ⇒ 不 bump，但**必须保留**既有的
   * `claim_gen`（整条重建会把计数器清零 ⇒ 旧快照重新匹配 ⇒ lost update 复活）。
   */
  opts?: { bumpClaim?: boolean },
): void {
  const stateDir = path.join(root, ".rddf", "state")
  const lockDir = path.join(stateDir, ".role.lock")
  mkdirSync(stateDir, { recursive: true })
  withLock(lockDir, () => {
    const pairFile = path.join(stateDir, "pair.json")
    const pair = readJson(pairFile) ?? {}
    const pairs = pair.pairs && typeof pair.pairs === "object" ? pair.pairs : {}
    const existing = pairs[sessionID]
    pairs[sessionID] = {
      front_session_id: frontSessionID ?? null,
      // 归属主体（`ADR-plan-delegate-engineering-session` D5）：front | plan；
      // **缺失一律按 front 解释**（旧数据默认 front）。
      owner_agent: extra?.owner_agent ?? existing?.owner_agent ?? "front",
      canonical_root: root,
      agent,
      kind,
      registered_at: existing?.registered_at ?? new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      // 归属版本：**保留**（不得因整条重建而归零）；认领时 +1。
      claim_gen: opts?.bumpClaim ? nextClaimGen(existing) : readClaimGen(existing),
    }
    // `cancel_pending`（`ADR-front-cancel-release` D3④）：**写者纪律**——与 `claim_gen`
    // 同等保留义务。整条重建会把字段丢掉 ⇒ reconcile 的「不得自动放行」保护**静默失效**
    // ⇒ 刚被拒绝释放的后端会被下一次 dispatch 的 reconcile 放掉（双写者从后门回来）。
    if (existing?.cancel_pending !== undefined) pairs[sessionID].cancel_pending = existing.cancel_pending
    // front-multi-backend：槽位与目标字段。**未传入的字段沿用已有值**（不覆盖），
    // 存量条目缺字段时保持缺失，由 `backfillPairEntry` 在观测路径回填（AC40）。
    if (extra?.work_root !== undefined) pairs[sessionID].work_root = extra.work_root
    if (extra?.state !== undefined) pairs[sessionID].state = extra.state
    if (extra?.goal_key !== undefined) pairs[sessionID].goal_key = extra.goal_key
    // role_class（D6）：**登记值是 resume 的权威**（brief 不一致 ⇒ 硬拒）。
    // 未传入时沿用已有值；存量条目保持缺失（resume 时按缺省 builder 解释，AC17）。
    if (extra?.role_class !== undefined) pairs[sessionID].role_class = extra.role_class
    writeJsonAtomic(pairFile, { version: "pair-v2", pairs })

    if (kind === "engineering") {
      writeRoleSession(root, sessionID, agent, extra?.role_class)
    }

    if (ledgerRow) appendLedgerLine(root, ledgerRow)
  })
}

/**
 * 查 pair 登记（ADR-canonical-root-normalization D3.1 ①：读回退）。
 *
 * 先查 stateRoot（归一后的正确位置）；找不到再查 workRoot —— **存量 pair.json 物理
 * 落在 workRoot**（旧代码用 `--show-toplevel` 算根）。只查 stateRoot 会在比较
 * `canonical_root` 之前就判"未登记"，双值接受永远执行不到。
 *
 * 覆盖面（D3.2 实测）：只覆盖"从同一个 worktree 回来"。从别的 worktree / 主仓回来
 * 仍查不到——与修复前一致，不引入回归。
 */
/**
 * 归属版本（`claim_gen`）——`ADR-front-stop-ownership` D1。
 *
 * **整数单调**：任何**改变槽位归属**的写都 +1；**良性写**（字段级合并）不动。
 * 缺省读作 `0`（旧 `pair.json` 无此字段）⇒ 第一次写时补齐。
 */
export function readClaimGen(entry: any): number {
  const v = entry?.claim_gen
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

/** 下一个归属版本（`+1`）。 */
export function nextClaimGen(entry: any): number {
  return readClaimGen(entry) + 1
}

/**
 * 查条目**并告诉调用方它住在哪个 `pair.json`**（`lookupPair` 会回退到
 * `fallbackRoot`；释放必须写回**同一个**文件，否则存量 worktree 条目会被
 * 静默 no-op ⇒ 变成「拒绝释放」）。
 */
export function lookupPairWithRoot(
  root: string,
  sessionID: string,
  fallbackRoot?: string,
): { entry: any; root: string } | undefined {
  const read = (r: string) => {
    const pair = readJson(path.join(r, ".rddf", "state", "pair.json"))
    if (!pair || typeof pair.pairs !== "object") return undefined
    return pair.pairs[sessionID]
  }
  const hit = read(root)
  if (hit !== undefined) return { entry: hit, root }
  if (fallbackRoot && path.resolve(fallbackRoot) !== path.resolve(root)) {
    const fb = read(fallbackRoot)
    if (fb !== undefined) return { entry: fb, root: fallbackRoot }
  }
  return undefined
}

// ─────────────────── 跨实例 tripwire：实例戳（`ADR-front-stop-ownership` D2）───────────────────
//
// 目的：把「多实例部署」从**约定**变成**机器可判**。戳文件：`<stateRoot>/.rddf/state/.instance-<pid>-<uuid>.json`。
//
// **存活判定 = 同 host 且 pid 存活**（**不以 mtime/TTL 判死** ⇒ 不会把「活着但空闲的实例」
// 误判成单实例 —— 那正是本篇要防的假停机方向）；跨 host 视为存活（保守 ⇒ 可能长期钉住
// 严格模式 ⇒ 人工删戳是出口）。mtime 只用于诊断，**不参与判定**。
//
// **按 `(host, pid)` 去重**：同一进程在多个 location 各加载一次插件 ⇒ 会写出多枚戳 ⇒
// 若按戳计数就会把**单实例**误判成多实例（这是默认加载形态，不是边角）。

const INSTANCE_STAMP_PREFIX = ".instance-"

/** pid 是否存活（EPERM ⇒ 存在但无权限 ⇒ 视为存活）。 */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e: any) {
    return e?.code === "EPERM"
  }
}

function instanceStampDir(stateRoot: string): string {
  return path.join(stateRoot, ".rddf", "state")
}

function instanceStampFiles(stateRoot: string): string[] {
  try {
    return readdirSync(instanceStampDir(stateRoot)).filter((f) => f.startsWith(INSTANCE_STAMP_PREFIX) && f.endsWith(".json"))
  } catch {
    return []
  }
}

/** 写/刷新**本进程**在 `stateRoot` 的实例戳（一个 pid 一枚；ENOENT ⇒ 重建）。 */
export function ensureInstanceStamp(stateRoot: string): void {
  const dir = instanceStampDir(stateRoot)
  try {
    mkdirSync(dir, { recursive: true })
    const prefix = `${INSTANCE_STAMP_PREFIX}${process.pid}-`
    const existing = instanceStampFiles(stateRoot).find((f) => f.startsWith(prefix))
    const file = path.join(dir, existing ?? `${prefix}${Date.now()}.json`)
    if (!existing) {
      writeFileSync(
        file,
        JSON.stringify({ pid: process.pid, host: os.hostname(), started_at: new Date().toISOString() }) + "\n",
      )
    }
    // mtime 只作诊断；刷新失败（文件被删）⇒ 重建，绝不抛错。
    const now = new Date()
    try {
      utimesSync(file, now, now)
    } catch {
      writeFileSync(
        file,
        JSON.stringify({ pid: process.pid, host: os.hostname(), started_at: new Date().toISOString() }) + "\n",
      )
    }
  } catch {
    /* 戳写不进去不得影响主流程（最坏：少一次多实例检测） */
  }
}

/** 删除**本进程**在 `stateRoot` 的实例戳（进程退出时调用）。 */
export function removeInstanceStamp(stateRoot: string): void {
  try {
    const prefix = `${INSTANCE_STAMP_PREFIX}${process.pid}-`
    for (const f of instanceStampFiles(stateRoot)) {
      if (f.startsWith(prefix)) rmSync(path.join(instanceStampDir(stateRoot), f), { force: true })
    }
  } catch {
    /* 清理失败不影响主流程（残留戳按 pid 存活判定 ⇒ 进程死了自然不算） */
  }
}

/**
 * 是否**多实例**部署（≥2 个**存活**的 `(host, pid)`）。
 *
 * ⚠️ 按 `(host, pid)` **去重**（同进程多枚戳只算一个）⇒ 单实例多插件副本不误判。
 */
export function detectForeignInstances(stateRoot: string): boolean {
  const alive = new Set<string>()
  for (const f of instanceStampFiles(stateRoot)) {
    try {
      const raw = readFileSync(path.join(instanceStampDir(stateRoot), f), "utf8")
      const meta = JSON.parse(raw) as { pid?: number; host?: string }
      const pid = typeof meta.pid === "number" ? meta.pid : Number(f.slice(INSTANCE_STAMP_PREFIX.length).split("-")[0])
      if (!Number.isFinite(pid)) continue
      const host = typeof meta.host === "string" && meta.host ? meta.host : os.hostname()
      const key = `${host}:${pid}`
      if (alive.has(key)) continue
      const isAlive = host === os.hostname() ? pidAlive(pid) : true
      if (isAlive) alive.add(key)
    } catch {
      /* 坏戳忽略（不据此判多实例） */
    }
  }
  return alive.size > 1
}

export function lookupPair(root: string, sessionID: string, fallbackRoot?: string): any {
  const read = (r: string) => {
    const pair = readJson(path.join(r, ".rddf", "state", "pair.json"))
    if (!pair || typeof pair.pairs !== "object") return undefined
    return pair.pairs[sessionID]
  }
  const hit = read(root)
  if (hit !== undefined) return hit
  if (fallbackRoot && path.resolve(fallbackRoot) !== path.resolve(root)) return read(fallbackRoot)
  return undefined
}

/** scope 前缀 → 绝对路径（相对工程根解析；工程外的前缀保留原样）。 */
export function scopeAbsolutePaths(root: string, scope: string[]): string[] {
  return scope.map((s) => {
    const t = s.replace(/^\.\//, "").replace(/\/+$/, "")
    return isAbsolute(t) ? path.resolve(t) : path.resolve(root, t)
  })
}

/** 本次委托期间新增/变更的文件（前后 git status 差集）。 */
export function changedSince(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before)
  return after.filter((file) => !beforeSet.has(file))
}

/** 越界文件：变更文件中不在 scope 前缀之下的那些。 */
export function outOfScopeFiles(root: string, scope: string[], changed: string[]): string[] {
  const scopeAbs = scopeAbsolutePaths(root, scope)
  return changed.filter((file) => {
    const absolute = path.resolve(root, file)
    return !scopeAbs.some((prefix) => absolute === prefix || absolute.startsWith(prefix + path.sep))
  })
}

/** 从消息 part 中提取权限阻断信息（两种形态，见 Stage 0 报告 0.2）。 */
export function extractBlocked(messages: any): {
  blocked_reason: string | null
  blocked_action: string | null
  blocked_all: Array<{ reason: string; action: string | null }>
} {
  const arr = Array.isArray(messages) ? messages : []
  const blocked_all: Array<{ reason: string; action: string | null }> = []
  for (const message of arr) {
    const content = message?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type !== "tool") continue
      const state = part?.state
      if (!state || state.status !== "error") continue
      const error = state.error
      if (!error) continue
      const messageText = String(error.message ?? "")
      if (error.type === "permission.rejected" || messageText.includes("Permission denied")) {
        const action = messageText.split(":")[1]?.trim() ?? null
        blocked_all.push({ reason: messageText, action })
      } else if (error.type === "aborted" && messageText.includes("declined")) {
        blocked_all.push({ reason: messageText, action: null })
      }
    }
  }
  const first = blocked_all[0]
  return {
    blocked_reason: first?.reason ?? null,
    blocked_action: first?.action ?? null,
    blocked_all,
  }
}

export function lastAssistantText(messages: any): string {
  const arr = Array.isArray(messages) ? messages : []
  for (let i = arr.length - 1; i >= 0; i--) {
    const message = arr[i]
    if (message?.type !== "assistant") continue
    const content = message?.content
    if (!Array.isArray(content)) continue
    const texts = content
      .filter((part: any) => part?.type === "text" && typeof part.text === "string")
      .map((part: any) => part.text)
    if (texts.length > 0) return texts.join("\n")
  }
  return ""
}

/** 写盘类工具名（edit / write / patch 系列）——用于判断工程 session 是否真的"动手"过。 */
export const WRITE_TOOLS = new Set(["edit", "write", "patch", "apply_patch", "apply-patch", "multiedit"])

/**
 * 交付面证据（静默失败检测）。
 *
 * 背景：工程 session 可能只输出角色开场白就 idle（例如模型在 run 中途被切换后重来），
 * 宿主仍把该 run 记为 succeeded → delegate 回传 succeeded，但**什么都没产出**。
 * front 只看 outcome 就会把"没做"转述成"做完了"。
 *
 * 判定（全部基于结构化事实，不猜模型意图）：
 *   - final_is_role_opening：最后一条 assistant 文本停在角色开场白（`【角色:` / `【角色：`）
 *     → agent 停在了自我介绍这一步；
 *   - model_switched：本轮窗口内出现过宿主消息 `type == "model-switched"`
 *     → run 中途换过模型（新模型可能从头再来）；这是**根因信号**，不依赖任何文本格式；
 *   - write_tool_calls：写盘类工具调用数；artifacts：本次委托产生的文件变更数；
 *   - no_work_evidence：命中上述任一"停住"信号 **且** 无写盘调用 **且** 无产物。
 *
 * ⚠ 消息窗口必须只含**本轮**：判定入参应是以 baselineMessageID 切片后的消息
 * （见 sliceRoundMessages）——否则 resume 时上一轮的写盘调用会掩盖本轮零交付。
 *
 * 知识 session（kind=knowledge）不适用：它的产物本就是"回答"，通常零工具调用。
 */
export function summarizeDelivery(messages: any, changedFiles: string[]): {
  tool_calls: number
  write_tool_calls: number
  artifacts: number
  model_switched: number
  final_is_role_opening: boolean
  no_work_evidence: boolean
} {
  const arr = Array.isArray(messages) ? messages : []
  let toolCalls = 0
  let writeCalls = 0
  let modelSwitched = 0
  for (const message of arr) {
    if (message?.type === "model-switched") modelSwitched++
    if (message?.type !== "assistant") continue
    const content = message?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type !== "tool") continue
      toolCalls++
      const name = String(part?.name ?? "").toLowerCase()
      if (WRITE_TOOLS.has(name)) writeCalls++
    }
  }
  const finalText = lastAssistantText(arr).trimStart()
  const finalIsRoleOpening = /^【角色\s*[:：]/.test(finalText)
  const artifacts = Array.isArray(changedFiles) ? changedFiles.length : 0
  // 析取 → 合取：写盘调用与产物**都**没有，才算"没有交付证据"。
  // （早先用析取会把"用 shell 写文件"（write_tool_calls=0 但 artifacts≥1）误判成无产出。）
  const stoppedEarly = finalIsRoleOpening || modelSwitched > 0
  const noWorkEvidence = stoppedEarly && writeCalls === 0 && artifacts === 0
  return {
    tool_calls: toolCalls,
    write_tool_calls: writeCalls,
    artifacts,
    model_switched: modelSwitched,
    final_is_role_opening: finalIsRoleOpening,
    no_work_evidence: noWorkEvidence,
  }
}

/**
 * 只保留本轮消息（baseline 之后的部分）。
 * 判定"本轮有没有交付"必须只看本轮——resume 时历史轮次的写盘调用会掩盖本轮零交付。
 * 找不到 baseline（消息被压缩/清理）时退回全量（保守：宁可漏报也不误报）。
 */
export function sliceRoundMessages(messages: any[], baselineMessageID: string): any[] {
  if (!Array.isArray(messages)) return []
  if (!baselineMessageID) return messages
  const idx = messages.findIndex((m: any) => m?.id === baselineMessageID)
  if (idx < 0) return messages
  return messages.slice(idx + 1)
}

export function lastMessageAt(messages: any): number {
  const arr = Array.isArray(messages) ? messages : []
  for (let i = arr.length - 1; i >= 0; i--) {
    const created = toMillis(arr[i]?.time?.created)
    if (created > 0) return created
  }
  return 0
}

export function lastMessageID(messages: any): string {
  const arr = Array.isArray(messages) ? messages : []
  return arr.length > 0 ? String(arr[arr.length - 1]?.id ?? "") : ""
}


/**
 * 生成 delegate 工具定义（宿主无关部分全在这里，便于用假 ctx 做端到端单测）。
 * 插件入口只负责把它注册进 opencode 的工具表。
 */
export function delegateToolDefinition(ctx: any): any {
  return {
        name: TOOL_NAME,
        description:
          "把一个工程任务交给另一个工程 session 执行（agent=build），并取回结果。这是**工程行动的唯一出口**（front 与 plan 共用同一通道）。" +
          "必填：project_dir（工程根绝对路径）、task（任务原话）、goal（一句话目标）、scope（允许变更的路径前缀数组）、acceptance（可判定的验收判据）。" +
          "选填：agent、constraints、grants（用户预批的操作 [{action,resource}]）、resume_session、remove、plan_ref（计划引用）。" +
          "返回：session_id / outcome / 最后回复 / blocked_reason / out_of_scope_files。",
        input: {
          type: "object",
          properties: {
            project_dir: { type: "string", description: "工程根目录的绝对路径" },
            agent: { type: "string", description: "会话的 agent，默认 build。白名单：build / explore / librarian / oracle / metis / critic" },
            task: { type: "string", description: "给工程 session 的任务原话" },
            goal: { type: "string", description: "一句话目标" },
            scope: {
              type: "array",
              items: { type: "string" },
              description: "允许变更的路径前缀（相对工程根或绝对路径）；知识 session 可传空数组",
            },
            acceptance: { type: "string", description: "可判定的验收判据" },
            constraints: { type: "string", description: "额外禁止动作" },
            grants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  resource: { type: "string" },
                },
                required: ["action", "resource"],
                additionalProperties: false,
              },
              description: "用户已预批的操作（question/form/edit/write 不可 grant）",
            },
            resume_session: { type: "string", description: "续接既有工程 session 的 id" },
            remove: { type: "boolean", description: "完成后删除工程 session，默认 false" },
            plan_ref: {
              type: "string",
              description:
                "计划文件引用（绝对路径，或相对 project_dir 的相对路径）。**plan 派发可写实施（agent=build）时必填**；" +
                `accepted roots: ${planRefRootLabels()}。可写 ≠ 可引用：不在清单内的路径会被拒`,
            },
            role_class: {
              type: "string",
              enum: ["builder", "architect", "verifier"],
              description:
                "本次派发允许后端做哪一类工作（缺省 builder；缺省只认缺省值，null/空串非法）。" +
                "builder=按 scope 实施；architect=写改 ADR/架构文档（edit 上限=架构文档目录 + .rddf/reviews + arch-docs.json）；" +
                "verifier=只取证与判决（edit 上限=.rddf/reviews）。**scope 越出该类上限 ⇒ 派发被拒**；" +
                "同一 session 内不允许换类（换类请新建 session）。",
            },
          },
          required: ["project_dir", "task", "goal", "scope", "acceptance"],
          additionalProperties: false,
        },
        options: { permission: "delegate", codemode: false },
        async execute(input: any, toolContext: any) {
          const brief = validateBrief(input)
          // AC6 逐点绑定（ADR D2）：状态落盘用 stateRoot，变更检测/scope 解析用 workRoot。
          const { stateRoot, workRoot, vcs } = canonicalRoot(brief.project_dir)
          // 本轮**有效** role_class（resume 时以登记值为准；新派发 = 请求值）。
          let effectiveRoleClass: RoleClass = brief.role_class
          const frontSessionID = toolContext?.sessionID
          // 派发方身份（`ADR-plan-delegate-engineering-session` D1/D2/D5）：
          // owner = 调用方会话；plan 派发**可写实施**时强制携带 plan_ref。
          const callerAgent = await resolveCallerAgent(ctx, toolContext?.sessionID)
          const ownerAgent = ownerAgentOf(callerAgent)
          const planRefCheck = validatePlanRef({
            planRef: brief.plan_ref,
            projectDir: brief.project_dir,
            required: callerAgent === "plan" && brief.kind === "engineering",
          })
          if (!planRefCheck.ok) throw fail(planRefCheck.message)

          // —— 槽位检查（AC50① / ADR D7.4）：与 `dispatch` **共用同一张槽位表** ——
          // 同工作树已有**仍在跑**的占槽后端 ⇒ 拒绝（不排队、不并发写同一工作树）。
          // 「已空闲/已消失」的占槽条目不阻塞（真正的写回翻转由 dispatch 的 claimSlot 完成）。
          // ── 停机守卫（`ADR-front-stop-confirmation` D2 / AC10）──
          // ⚠️ 必须**独立于** `excludeSessionID` 检查：否则 `delegate(resume=正在被 suspend 的后端)`
          // 会被那个排除项放过去。
          const stopGuard = stopGuardAt(stateRoot, workRoot)
          if (stopGuard) {
            throw fail(
              `后端 ${stopGuard.backend_session_id} 正在停机（由会话 ${stopGuard.front_session_id ?? "另一会话"} 发起），` +
                `请等它结束再派发`,
            )
          }
          const busyHolders = await slotBusyHolders(ctx, stateRoot, workRoot, brief.resume_session)
          if (busyHolders.length > 0) {
            const holder = busyHolders[0]
            // 跨 owner-kind ⇒ plan 优先、不抢占（ADR D7.2/D7.4）；同 kind 走既有文案。
            if (holder.owner_agent !== ownerAgent) {
              appendPriorityBlocked(stateRoot, {
                path: "delegate",
                callerKind: ownerAgent,
                holderKind: holder.owner_agent,
                holderState: holder.state,
                holderSessionID: holder.session_id,
                workRoot,
                reason: "cross-owner-kind slot conflict",
              })
              throw fail(
                `${describeHolderByOwner(holder, ownerAgent)}；既有 delegate 与 dispatch 共用槽位表（ADR D7.4）`,
              )
            }
            throw fail(
              `${describeHolder(holder)}；既有 delegate 与 dispatch 共用槽位表（ADR D7.4）`,
            )
          }

          // —— resume 校验：必须在该工程仓库的 pair 登记表内 ——
          // 登记表本身就是访问控制（只能续接本工程登记过的 session）。
          // 不硬校验 front_session_id：每次新对话都是新 front session，硬校验会让
          // "隔天回来继续"这种正常用法失效；改为返回软信号，由调用方告知用户。
          let existing: any = undefined
          let resumedByOtherFront = false
          let effectiveAgent = brief.agent
          let kind = brief.kind
          if (brief.resume_session) {
            // 读回退（D3.1 ①）：存量 pair.json 物理落在 workRoot。
            existing = lookupPair(stateRoot, brief.resume_session, workRoot)
            if (!existing) {
              throw fail(
                `resume_session 未登记: ${brief.resume_session}（只能续接本工程仓库 pair.json 中登记的 session；` +
                  `从当初派发它的那个 worktree 发起才能找到存量条目）`,
              )
            }
            // 双值接受（D3.1 ②）：存量 canonical_root 是 worktree 路径（旧口径）。
            // 只接受同一仓库的 stateRoot/workRoot —— 跨仓冒充仍拒（D3.3）。
            if (existing.canonical_root !== stateRoot && existing.canonical_root !== workRoot) {
              throw fail(
                `resume_session 的 canonical_root 不匹配: ${existing.canonical_root} ∉ {${stateRoot}, ${workRoot}}`,
              )
            }
            // 白名单对 resume 同样生效（否则 create 校验、resume 放行 = 结构性绕过）。
            const existingAgent = String(existing.agent ?? "build")
            if (!ALLOWED_AGENTS.has(existingAgent)) {
              throw fail(`resume_session 的 agent 不在白名单内: ${existingAgent}`)
            }
            if (brief.agentProvided && brief.agent !== existingAgent) {
              throw fail(`resume_session 的 agent 不匹配: ${brief.agent} != ${existingAgent}`)
            }
            // role_class 一致性（D6）：**登记值是权威**（存量条目无登记值 ⇒ 按缺省 builder 解释）。
            // 不一致 ⇒ 硬拒（同一 session 内不允许换类；换类请新建 session）。
            effectiveRoleClass = assertResumeRoleClass(
              existing,
              brief.role_class,
              brief.resume_session,
              brief.role_class_provided,
            )
            effectiveAgent = existingAgent
            kind = kindOfAgent(effectiveAgent)
            resumedByOtherFront = Boolean(
              existing.front_session_id && frontSessionID && existing.front_session_id !== frontSessionID,
            )
            // 跨 owner-kind 的 resume ⇒ 硬拒（ADR D7.3）；owner 会话已亡 ⇒ 放行（亡主例外）。
            // ⚠️ 必须发生在 registerSession / claimSlot **之前**（否则被拒的接管仍会先翻转归属字段）。
            const existingOwnerKind = existing.owner_agent === "plan" ? "plan" : "front"
            if (existingOwnerKind !== ownerAgent) {
              const ownerSessionID = typeof existing.front_session_id === "string" ? existing.front_session_id : ""
              const alive = ownerSessionID.length > 0 ? await frontAlive(ctx, ownerSessionID) : false
              if (alive) {
                appendPriorityBlocked(stateRoot, {
                  path: "resume",
                  callerKind: ownerAgent,
                  holderKind: existingOwnerKind,
                  holderState: String(existing.state ?? "unknown"),
                  holderSessionID: brief.resume_session ?? "",
                  workRoot,
                  reason: "cross-owner-kind resume refused (owner session alive)",
                })
                throw fail(
                  `后端 ${brief.resume_session} 归属于 ${existingOwnerKind}（owner 会话 ${ownerSessionID} 仍存活）：` +
                    `按 ADR-plan-delegate-engineering-session D7.3，不得跨 owner-kind 接管该后端。` +
                    `可选动作：① 让 ${existingOwnerKind} 侧自己处理；② 由用户协调；③ 等该 owner 会话结束后再接管`,
                )
              }
            }
          }

          // role_class × scope 相容性（D8 ②层）：硬拒发生在 create / registerSession **之前**。
          // 用**有效 class**（resume 时 = 登记值）判定，避免"权限是 architect、声明是 builder"的错配。
          assertRoleClassCompatible({ role_class: effectiveRoleClass, scope: brief.scope }, workRoot)
          // 权限组装（单一实现，D8）：scope 解析基准 = workRoot；
          // 只读 session 恒注入单条 edit deny，绝不注入 scope 派生 allow
          // （session 规则排在 agent 规则之后、last-match-wins，会覆盖只读 agent 自身的 edit: deny）。
          const permissions = classPermissions({
            roleClass: effectiveRoleClass,
            workRoot,
            scope: brief.scope,
            kind,
            grants: brief.grants,
          })

          let sessionID = brief.resume_session
          if (!sessionID) {
            const created = await ctx.session.create({
              location: { directory: brief.project_dir },
              agent: effectiveAgent,
              title: brief.goal.slice(0, 60),
              permissions,
            })
            sessionID = created.id
          }

          // 登记必须发生在 prompt 之前：工程 session 开局就要读自己的 role.json 分区，
          // 否则它会去找全局 fallback，而全局 fallback 属于 external_directory（默认 deny）。
          // 落盘根 = stateRoot（worktree 下是主仓——两份状态分裂会导致 resume 查无此条）。
          registerSession(
            stateRoot,
            sessionID,
            frontSessionID,
            effectiveAgent,
            kind,
            undefined,
            { owner_agent: ownerAgent, role_class: effectiveRoleClass },
            undefined,
            { work_root: workRoot, state: "active" },
            { bumpClaim: true }, // 认领 ⇒ 归属变更 ⇒ claim_gen +1
          )
          // 变更检测基准 = workRoot（在主仓跑 git status 数不到 worktree 的变更）。
          const statusBefore = vcs ? gitStatusPaths(workRoot) : []

          const before = await ctx.session.get({ sessionID })
          const beforeMessages = await ctx.session.context({ sessionID })
          const baselineMessageID = lastMessageID(beforeMessages)
          const baselineIdle = toMillis((before as any)?.time?.idle)
          const baselineLastMessageAt = lastMessageAt(beforeMessages)

          // in-flight 保护：用**两个派发面共用**的谓词 `stillRunning`（AC19 / D8.1）。
          // 只判「最后消息 > idle」会漏「刚起、还没有消息的新 execution」；
          // 只判 `isRunning` 会漏 stale-busy（`busy` 陈旧 < idle）。
          // （`time.updated > time.idle` 也不行：首次运行中的 session 从未 idle 过 ⇒ idle 为 0 会漏判。）
          const busy = stillRunning(before, beforeMessages)
          const ledgerBase = {
            recorded_at: new Date().toISOString(),
            kind,
            front_session_id: frontSessionID ?? null,
            owner_agent: ownerAgent,
            backend_session_id: sessionID,
            agent: effectiveAgent,
            goal: brief.goal,
            scope: brief.scope,
          }
          if (busy) {
            appendLedger(stateRoot, {
              ...ledgerBase,
              outcome: "busy",
              blocked_reason: null,
              out_of_scope_files: [],
              changed_files: [],
              last_assistant_text: "",
            })
            return {
              content: JSON.stringify(
                {
                  session_id: sessionID,
                  outcome: "busy",
                  still_running: true,
                  message: "目标工程 session 上一次运行仍在进行，已拒绝排队。请稍后重试或换新任务。",
                },
                null,
                2,
              ),
            }
          }

          const promptText = buildBrief({ ...brief, role_class: effectiveRoleClass }, workRoot)
          await ctx.session.prompt({ sessionID, text: promptText })

          // 超时上限：默认 30 分钟；测试可用 DELEGATE_WAIT_TIMEOUT_MS 缩短。
          const waitTimeoutMs = (() => {
            const v = Number(process.env.DELEGATE_WAIT_TIMEOUT_MS)
            return Number.isFinite(v) && v > 0 ? v : WAIT_TIMEOUT_MS
          })()
          let waitError: string | undefined
          let waitTimedOut = false
          try {
            await Promise.race([
              ctx.session.wait({ sessionID }),
              new Promise((resolve) =>
                setTimeout(() => {
                  waitTimedOut = true
                  resolve(undefined)
                }, waitTimeoutMs),
              ),
            ])
          } catch (e: any) {
            waitError = e?.message ?? String(e)
          }

          const after = await ctx.session.get({ sessionID })
          const messages = await ctx.session.context({ sessionID })
          const afterMessageID = lastMessageID(messages)
          const newActivity = afterMessageID !== baselineMessageID || messages.length !== beforeMessages.length

          // 宿主原值（契约：`unverified` 时它恒为 "succeeded"，排障/审计用）。
          const hostOutcome: string | null = ((after as any)?.outcome ?? null) as string | null
          let outcome = hostOutcome
          if (!newActivity) {
            outcome = "unknown"
          }

          const { blocked_reason, blocked_action, blocked_all } = extractBlocked(messages)
          const assistantText = lastAssistantText(messages)

          const statusAfter = vcs ? gitStatusPaths(workRoot) : []
          const beforeSet = new Set(statusBefore)
          // 只报告本次委托期间新增/变更的文件（委托前就存在的脏文件不算越界）
          const changed = statusAfter.filter((file) => !beforeSet.has(file))
          const scopeAbs = brief.scope.map((s) => {
            const t = s.replace(/^\.\//, "").replace(/\/+$/, "")
            return isAbsolute(t) ? path.resolve(t) : path.resolve(workRoot, t)
          })
          const outOfScope = changed.filter((file) => {
            const absolute = path.resolve(workRoot, file)
            return !scopeAbs.some((prefix) => absolute === prefix || absolute.startsWith(prefix + path.sep))
          })

          // 交付面证据：宿主说 succeeded ≠ 工程 session 真的交付了东西。
          // 判定只看向**本轮**的消息（resume 时历史轮次不得掩盖本轮零交付）。
          // 只对工程 session 判定（知识 session 的产物本就是"回答"，通常零工具调用）。
          // ⚠ 仍在跑（wait 超时 / 宿主未给 outcome）时**不判定**：此时读到的 outcome
          //   可能是上一轮的陈旧值（resume 场景），据此判"没有产出"会误报。
          const roundMessages = sliceRoundMessages(messages, baselineMessageID)
          const delivery = summarizeDelivery(roundMessages, changed)
          // ⚠️ 局部变量名不得与模块级谓词 `stillRunning` 相同（会遮蔽它）
          const runStillRunning = waitTimedOut || outcome == null
          const noWorkEvidence =
            kind === "engineering" && outcome === "succeeded" && !runStillRunning && delivery.no_work_evidence
          // 机读化：宿主报成功但无交付证据 → `unverified`（宿主原值保留在 host_outcome）。
          if (noWorkEvidence) outcome = "unverified"

          registerSession(stateRoot, sessionID, frontSessionID, effectiveAgent, kind, {
            ...ledgerBase,
            outcome,
            host_outcome: hostOutcome,
            blocked_reason,
            out_of_scope_files: outOfScope,
            changed_files: changed,
            last_assistant_text: redactAndTruncate(assistantText),
            no_work_evidence: noWorkEvidence,
            tool_calls: delivery.tool_calls,
            write_tool_calls: delivery.write_tool_calls,
            final_is_role_opening: delivery.final_is_role_opening,
            model_switched: delivery.model_switched,
          }, {
            // AC46①：同步 `delegate` 的 `wait` 返回即本轮结束 ⇒ **自翻转 idle**（不占槽）
            work_root: workRoot,
            state: "idle",
            owner_agent: ownerAgent,
            // role_class：**收尾登记不得重置**它（否则 role.json 分区会被写回缺省 builder）。
            role_class: effectiveRoleClass,
          })

          if (brief.remove) {
            try {
              await ctx.session.remove({ sessionID })
            } catch (e: any) {
              waitError = waitError ?? `remove 失败: ${e?.message}`
            }
          }

          const summary = {
            session_id: sessionID,
            project_root: workRoot,
            vcs,
            agent: effectiveAgent,
            kind,
            resumed: Boolean(brief.resume_session),
            resumed_by_other_front: resumedByOtherFront,
            outcome,
            new_activity: newActivity,
            host_outcome: hostOutcome,
            blocked_reason,
            blocked_action,
            blocked_all,
            out_of_scope_files: outOfScope,
            changed_files: changed,
            scope_check: vcs ? "ok" : "unavailable",
            last_assistant_text: assistantText,
            // 交付面证据（静默失败）：no_work_evidence=true 时 outcome 仍可能是 succeeded，
            // 调用方**不得**把它转述成"已完成"。
            tool_calls: delivery.tool_calls,
            write_tool_calls: delivery.write_tool_calls,
            artifacts: delivery.artifacts,
            final_is_role_opening: delivery.final_is_role_opening,
            model_switched: delivery.model_switched,
            no_work_evidence: noWorkEvidence,
            still_running: runStillRunning,
            wait_timed_out: waitTimedOut,
            status_age_ms: Math.max(0, Date.now() - toMillis((after as any)?.time?.updated)),
            wait_error: waitError,
          }

          return { content: JSON.stringify(summary, null, 2) }
        },
}
}
