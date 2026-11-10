/**
 * front-multi-backend 的**异步派发面**（ADR `ADR-front-multi-backend`，Accepted）。
 *
 * 四个工具：`dispatch` / `sessions` / `suspend` / `cancel`（D1）。
 *
 * 与既有 `delegate`（`lib/delegate-core.ts`）的关系：
 * - `delegate` 是**同步单发**面，既有语义与既有判据**全部不变**（AC50 只新增一条槽位检查）。
 * - 本文件是**异步派发 + 只读观测 + 单槽切换**面；两者**共用同一张槽位表**（D7.4）。
 *
 * 核心不变量（实现必须守）：
 * 1. **槽位键 = `workRoot`**（ADR D6.1）：同一仓的不同 worktree 各自一槽。
 * 2. **同一 workRoot 同一时刻只有一个占槽**（D6.2）；`dispatching` 也占槽（简报可能仍 pending）。
 * 3. **「投递 ≠ 消费」**（D7.2）：`prompt()` 返回即已入队，**不是**已消费；
 *    消费 = 该简报的 `message.id` 出现在 `session.context()` 的消息 id 集合里（Phase 0 实测）。
 * 4. **锁形态**（D7.1）：`withLock` 是同步 `() => void`、不可重入 ⇒
 *    一律「锁外查询 → 锁内重验 → 锁内翻转」，**锁内不得 await、不得调用自取锁的函数**。
 */

import { mkdirSync } from "node:fs"
import path from "node:path"

import {
  appendLedger,
  backfillPairEntry,
  buildBrief,
  canonicalRoot,
  CONSTANT_DENY,
  contextMessageIds,
  describeHolder,
  fail,
  isRunning,
  isSlotState,
  lastMessageID,
  lookupPair,
  readPairs,
  scopeEditRules,
  slotOccupants,
  toMillis,
  validateBrief,
  withLock,
  writePairs,
  writeRoleSession,
} from "./delegate-core.ts"
import type { GoalKey, SlotState } from "./delegate-core.ts"

// 槽位原语定义在 core（两个派发面共用，AC50①）；此处再导出便于调用方从一处取。
export { contextMessageIds, describeHolder, isRunning } from "./delegate-core.ts"

export const TOOL_DISPATCH = "dispatch"
export const TOOL_SESSIONS = "sessions"
export const TOOL_SUSPEND = "suspend"
export const TOOL_CANCEL = "cancel"

export const ACTION_DISPATCH = "delegate_dispatch"
export const ACTION_SESSIONS = "delegate_sessions"
export const ACTION_SUSPEND = "delegate_suspend"
export const ACTION_CANCEL = "delegate_cancel"

/** 名册索引标记（ADR D2.3）：宿主 session metadata 上的 `delegated_by`。 */
export const DELEGATED_BY = "front-delegate"

/** 消费确认超时上限（Phase 0：判据 = message id ∈ context 消息 id 集合）。 */
export const CONSUME_TIMEOUT_MS = 30_000

/** 运行时取值（测试可用 `RDDF_CONSUME_TIMEOUT_MS` 缩短）。 */
export function consumeTimeoutMs(): number {
  const v = Number(process.env.RDDF_CONSUME_TIMEOUT_MS)
  return Number.isFinite(v) && v > 0 ? v : CONSUME_TIMEOUT_MS
}
/** 消费确认轮询间隔。 */
export const CONSUME_POLL_MS = 200

/** 全局并发上限（ADR D10 / AC31）；可用 `RDDF_MAX_ACTIVE_BACKENDS` 覆盖。 */
export const DEFAULT_MAX_ACTIVE_BACKENDS = 3

export function maxActiveBackends(): number {
  const v = Number(process.env.RDDF_MAX_ACTIVE_BACKENDS)
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_MAX_ACTIVE_BACKENDS
}

// ───────────────────────────── 纯逻辑（可单测） ─────────────────────────────

/** 生成一个调用方自定的 message id（上游要求 `msg_` 前缀，`SessionMessage.ID`）。 */
export function newBriefMessageID(): string {
  return `msg_fd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 名册条目聚合（ADR D5 / AC23）：整体 = 最差的那个，且**明细永远列出**。
 *
 * - 任一 running ⇒ 整体「进行中」，且**不进入 worst-of**（只对已终结后端算）。
 * - 全部已终结后端 `unverified` ⇒ 「无可验证交付」（措辞**不含**「没有产出」）。
 */
/**
 * AC54：steer 残留检测。
 *
 * 输入：恢复后的 `context`、**暂停时**的基线 message id、本次投递的简报 message id。
 * 判据：基线之后的**新增消息**里，除本次简报外是否还有 `user`/`synthetic` 消息
 * —— 陈旧的 steer 被提升后就是一条 `user` 消息。
 *
 * - 基线不在 context 里（历史被截断/删除）⇒ `undetectable`
 * - 有额外 `user`/`synthetic` ⇒ `suspected`
 * - 否则 ⇒ `none`
 *
 * ⚠️ 这是**事后检测**，拦不住执行本身（ADR D9 的残余风险）；`undetectable` 必须如实报，不得当成 `none`。
 */
export function detectSteerResidue(
  messages: any,
  baselineID: string,
  briefMessageID: string,
): "none" | "suspected" | "undetectable" {
  const arr = Array.isArray(messages) ? messages : []
  const idx = arr.findIndex((m) => m?.id === baselineID)
  if (idx < 0) return "undetectable"
  const extra = arr
    .slice(idx + 1)
    .filter((m) => m?.id !== briefMessageID && (m?.type === "user" || m?.type === "synthetic"))
  return extra.length > 0 ? "suspected" : "none"
}

/** AC48：登记 front 是否仍存活（`get` 抛错 ⇒ 视为亡主）。 */
export async function frontAlive(ctx: any, frontSessionID: string): Promise<boolean> {
  try {
    const info = await ctx.session.get({ sessionID: frontSessionID })
    return !!info
  } catch {
    return false
  }
}

export function aggregateStates(
  items: Array<{ state: string; running: boolean; outcome?: string | null }>,
): { overall: "completed" | "partial_unverified" | "in_progress" | "no_verifiable_delivery"; headline: string } {
  const total = items.length
  if (total === 0) return { overall: "completed", headline: "本 front 名下没有后端" }
  const running = items.filter((i) => i.running).length
  const finished = items.filter((i) => !i.running)
  const unverified = finished.filter((i) => i.outcome === "unverified").length
  const allUnverified = finished.length > 0 && finished.every((i) => i.outcome === "unverified")
  if (running > 0) {
    const suspect = unverified > 0 ? `（含 ${unverified} 项交付存疑）` : ""
    return { overall: "in_progress", headline: `进行中${suspect}：${running} 个后端在跑，共 ${total} 个` }
  }
  if (allUnverified) {
    return { overall: "no_verifiable_delivery", headline: `无可验证交付：${total} 个后端均无可验证产物` }
  }
  // ADR D5：任一后端 `unverified` ⇒ **不得声称整体完成**（混有 succeeded 也不行）
  if (unverified > 0) {
    return {
      overall: "partial_unverified",
      headline: `已终结但交付存疑：${total} 个后端中 ${unverified} 项 unverified`,
    }
  }
  return { overall: "completed", headline: `已终结：共 ${total} 个后端` }
}

/**
 * 按 `work_root` 分组（AC43「按 work_root 分组」/ AC57「同组列出」）。
 *
 * 分组键缺失的条目归入 `null` 组（不丢弃）；输出按 `work_root` 字典序 ⇒ 确定性。
 */
export function groupByWorkRoot(items: Array<{ session_id: string; work_root: string | null }>): Array<{
  work_root: string | null
  session_ids: string[]
}> {
  const map = new Map<string | null, string[]>()
  for (const it of items) {
    const key = typeof it.work_root === "string" && it.work_root.length > 0 ? it.work_root : null
    const arr = map.get(key)
    if (arr) arr.push(it.session_id)
    else map.set(key, [it.session_id])
  }
  return [...map.entries()]
    .sort((a, b) => {
      // `null` 组（work_root 缺失）排最后
      if (a[0] === null) return 1
      if (b[0] === null) return -1
      return a[0].localeCompare(b[0])
    })
    .map(([work_root, session_ids]) => ({ work_root, session_ids }))
}

/** 全局上限判定（AC31）。 */
export function exceedsLimit(active: number, limit: number): boolean {
  return active >= limit
}

// ─────────────────── 存活推导：stalled 与悬挂标记（AC25 / AC47③） ───────────────────

/**
 * `stalled` 阈值默认值：5 分钟（AC25）。
 *
 * 可用 `RDDF_STALLED_THRESHOLD_MS` 覆盖（**默认常量 + 配置项**，两者都有单测）。
 */
export const DEFAULT_STALLED_THRESHOLD_MS = 5 * 60 * 1000

export function stalledThresholdMs(): number {
  const v = Number(process.env.RDDF_STALLED_THRESHOLD_MS)
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_STALLED_THRESHOLD_MS
}

/**
 * `stalled` = **仍在跑** 且 距上次活动超过阈值（ADR D4 / AC25）。
 *
 * **查询时推导态、不落盘**（写进 `pair.json` 会变成第二份真相）。
 * 边界：`elapsed === threshold` **不算** stalled（严格大于）。
 */
export function isStalled(input: {
  running: boolean
  lastActivityAt: number
  now?: number
  thresholdMs?: number
}): boolean {
  if (!input.running) return false
  const last = toMillis(input.lastActivityAt)
  if (last <= 0) return false
  const now = input.now ?? Date.now()
  const threshold = input.thresholdMs ?? stalledThresholdMs()
  return now - last > threshold
}

/**
 * 槽位悬挂标记（AC47③）：`state` 仍在占槽，但**实际已不在跑**且已超 `stalled` 阈值。
 *
 * 与 `isStalled` 的区别：`stalled` 描述「在跑但没进展」，`dangling` 描述
 * 「登记说占槽、实际没在跑」——后者是**登记态与观测态不一致**的信号。
 * 展示层信号，**不承担回收职责**（回收由 reconcile-on-read 完成，D7.3）。
 */
export function isDangling(input: {
  state: string
  running: boolean
  lastActivityAt: number
  now?: number
  thresholdMs?: number
}): boolean {
  if (input.state !== "active" && input.state !== "dispatching") return false
  if (input.running) return false
  const last = toMillis(input.lastActivityAt)
  if (last <= 0) return false
  const now = input.now ?? Date.now()
  const threshold = input.thresholdMs ?? stalledThresholdMs()
  return now - last > threshold
}


// ───────────────────────────── 内部工具 ─────────────────────────────

/**
 * 停机确认窗口（`suspend` 等后端真正停下）：默认 8s。
 *
 * **取值依据**：上游 `interrupt` 的清理是**异步 settle**（`execution.ts:27-31`）⇒ 必须给它时间。
 * ⚠️ 观测到的 settle 延迟来自**假夹具**（300ms 内 settle）与**一次 E2E**（L2-22 的 `suspend` 在窗口内
 * 成功、未触发超时）——**不是上游 settle 延迟分布的实测** ⇒ 取 **8s** 是「按夹具量级留两个数量级余量」
 * 的保守取值，而非实测推导。上游若改变 settle 时序需重新观测。可配 `RDDF_STOP_TIMEOUT_MS` 覆盖。
 */
export const DEFAULT_STOP_TIMEOUT_MS = 8_000

export function stopTimeoutMs(): number {
  const v = Number(process.env.RDDF_STOP_TIMEOUT_MS)
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_STOP_TIMEOUT_MS
}

/**
 * 读一个 session 的消息。
 *
 * ⚠️ **读失败 ≠ 「没有未终结消息」**：D4 的第二级兜底靠消息时间判断「busy 未投影但仍有活动」，
 * 若把失败当成空消息，该兜底会**失效** ⇒ 可能把仍在跑的后端判成停机 ⇒ 误放槽 ⇒ 并发写。
 * ⇒ 失败必须**显式**返回 `ok:false`，由调用方走保守侧（ADR D11.3「读失败 ⇒ 保守当未停机」）。
 */
async function readSessionMessages(ctx: any, sessionID: string): Promise<{ messages: any[]; ok: boolean }> {
  try {
    const messages = await ctx.session.context({ sessionID })
    return { messages: Array.isArray(messages) ? messages : [], ok: true }
  } catch {
    return { messages: [], ok: false }
  }
}

/**
 * 停机判据的**基线**（ADR `D11.3`）：必须在 `interrupt` **之前**取。
 */
export type StopBaseline = {
  /** `interrupt` 前的 `time.idle` 水位线（0 = 未定义）。 */
  idle: number
  /** `interrupt` 前是否在跑（D4 的判活口径）。 */
  running: boolean
}

/**
 * 取停机判据的基线（**必须在 `interrupt` 之前**调用，见 ADR D11.3）。
 *
 * 返回 `null` = 读失败且**原因不明** ⇒ 调用方**不得**释放槽位（保守侧：宁可判不出停机，
 * 也不能把仍在写的后端放出去 ⇒ 两个后端并发写同一工作树）。
 */
export async function snapshotStopBaseline(ctx: any, sessionID: string): Promise<StopBaseline | null> {
  const { info, missing, unknown } = await readSessionInfo(ctx, sessionID)
  if (missing) return { idle: 0, running: false } // 已不存在 ⇒ 没有东西可等
  if (unknown) return null
  const { messages, ok } = await readSessionMessages(ctx, sessionID)
  if (!ok) return null // 判活算不出来 ⇒ 基线取不到 ⇒ 调用方不释放槽位（保守侧）
  return { idle: toMillis(info?.time?.idle), running: isRunning(info, messages) }
}

/**
 * 等一个后端**确认停机**（ADR `D11.3` 的判据）。
 *
 * ⚠️ **`interrupt` 的返回值不是停机判据**（上游 `run-coordinator.ts:142-162`）：
 * `true` 只表示**已接受**中断——清理**异步 settle**（`execution.ts:27-31`）⇒ 它**可能还在跑**；
 * `false` 有**三种**成因：无执行 / 已在停机过程中（**仍在跑**）/ settle 窗口（fiber 已退、
 * 终态未发布）。两者都不能用来推断「停了」。
 *
 * ⇒ 判据 = 「**判活为假**」+ 基线在跑时再要求「**终态水位线前移**」：
 * - `baseline.running === false`（本来就没在跑）⇒ 判活为假即可（没有 execution 可等，
 *   水位线**不会**前移，不得因此判超时——否则最常见的「挂起一个空闲后端」必然失败）；
 * - `baseline.running === true`（本次中断一个在跑的 execution）⇒ 还要求 `time.idle > baseline.idle`。
 *   `time.idle` 是运行期**唯一写入点**的**严格单调**水位线（`projector.ts:527`），只在
 *   `Execution.Succeeded/Failed/Interrupted` 投影时前移 ⇒ 前移 ⇔ fiber 已跑完 finalizer。
 *   「看起来不忙」**不够**：fiber 已退、finalizer 仍在跑时同样「不忙」。
 *
 * 返回 true = 已确认停机；false = 窗口内仍未确认（读失败 / 判不出来 / 超时）
 * ⇒ 调用方**不得**释放槽位。
 */
export async function waitStopped(
  ctx: any,
  sessionID: string,
  baseline: StopBaseline,
  timeoutMs = stopTimeoutMs(),
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const { info, missing, unknown } = await readSessionInfo(ctx, sessionID)
    if (missing) return true // 已不存在 ⇒ 视为停机（没有东西可写，见 ADR D12）
    if (!unknown) {
      const { messages, ok } = await readSessionMessages(ctx, sessionID)
      if (ok && !isRunning(info, messages)) {
        // 判活为假：基线本来就没在跑 ⇒ 停机；基线在跑 ⇒ 还要求终态水位线前移
        if (!baseline.running) return true
        if (toMillis(info?.time?.idle) > baseline.idle) return true
      }
    }
    // 读失败（unknown）⇒ 不判停机，继续等到窗口尽头（保守侧）
    if (Date.now() >= deadline) return false
    await sleep(200)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stateDirOf(stateRoot: string): string {
  return path.join(stateRoot, ".rddf", "state")
}

function lockDirOf(stateRoot: string): string {
  return path.join(stateRoot, ".rddf", "state", ".role.lock")
}

/**
 * 判断一次 `session.get` 失败是否意味着「**该 session 确实不存在**」。
 *
 * ⚠️ **必须窄判**：上游对不存在的 session 抛 tagged `Session.NotFoundError`
 * （`packages/core/src/session/error.ts:10`），而**其它错误**（DB 抖动、权限、传输失败）
 * **不代表它已被删除**。
 *
 * 把所有错误都当成「已删除」的后果（都发生在同一条槽位路径上）：
 * - `planSlot` 会把一个**活着的**后端判成空闲 ⇒ reconcile 释放它的槽位 ⇒
 *   **两个后端并发写同一工作树**（破坏单写者不变式）；
 * - `dispatch(resume=…)` 会**误墓碑**一个活着的后端并新建重复后端。
 *
 * ⇒ 判不出来时一律走**保守侧**：当作「它还在」（占槽、不处置）。
 */
export function isSessionMissingError(err: any): boolean {
  const tag = err?._tag ?? err?.tag ?? err?.constructor?._tag ?? err?.name
  if (typeof tag === "string" && /notfound/i.test(tag.replace(/[._\s]/g, ""))) return true
  const msg = String(err?.message ?? err ?? "")
  return /not\s*found|404|no such session|notfound/i.test(msg)
}

/**
 * 读一个 session 的信息，三态：
 * - `present`  —— 读到了；
 * - `missing`  —— **确认**不存在（上游 NotFoundError）；
 * - `unknown`  —— 读失败但**原因不明** ⇒ 保守当作「它还在」。
 */
export async function readSessionInfo(
  ctx: any,
  sessionID: string,
): Promise<{ info: any; missing: boolean; unknown: boolean }> {
  try {
    const info = await ctx.session.get({ sessionID })
    return { info, missing: false, unknown: false }
  } catch (e: any) {
    if (isSessionMissingError(e)) return { info: undefined, missing: true, unknown: false }
    return { info: undefined, missing: false, unknown: true }
  }
}

/**
 * 锁外：同 `workRoot` 的占槽候选 + 它们的活体判定。
 *
 * ⚠️ 活体查询是 async ⇒ **必须在锁外**（`withLock` 不可 await）。
 */
export async function planSlot(
  ctx: any,
  stateRoot: string,
  workRoot: string,
): Promise<{ candidates: Array<{ session_id: string; state: SlotState; work_root: string }>; busyOf: Record<string, boolean> }> {
  const pairs = readPairs(stateRoot)
  const candidates = slotOccupants(pairs, workRoot)
  const busyOf: Record<string, boolean> = {}
  for (const c of candidates) {
    const { info, missing, unknown } = await readSessionInfo(ctx, c.session_id)
    if (unknown) {
      // 读失败但原因不明 ⇒ **保守**：当作它还在（占槽，不释放）——否则一次抖动就会
      // 让两个后端并发写同一工作树。
      busyOf[c.session_id] = true
      continue
    }
    // 后端**确认**已消失 ⇒ 不再占槽（视为空闲，可回收）
    busyOf[c.session_id] = missing ? false : isRunning(info)
  }
  return { candidates, busyOf }
}

export interface SlotClaim {
  ok: boolean
  holder?: { session_id: string; state: SlotState; work_root: string }
  /** 被 reconcile 释放（翻转为 idle）的条目。 */
  released?: string[]
}

/**
 * 锁内：reconcile（已空闲的 `active` → `idle`）+ 占槽判定 + 登记新条目。
 *
 * **同一次临界区**完成（AC26③）：检查与登记不可分两次锁（check-then-act 会双双通过）。
 * 锁内**只做同步读改写**（无 await、无自取锁的调用）。
 */
export function claimSlot(input: {
  stateRoot: string
  workRoot: string
  busyOf: Record<string, boolean>
  sessionID: string
  frontSessionID: string | undefined
  agent: string
  kind: string
  goalKey?: GoalKey
  register?: boolean
}): SlotClaim {
  const { stateRoot, workRoot, busyOf, sessionID } = input
  mkdirSync(stateDirOf(stateRoot), { recursive: true })
  let result: SlotClaim = { ok: true }
  withLock(lockDirOf(stateRoot), () => {
    const pairs = readPairs(stateRoot)
    const released: string[] = []
    // ① reconcile：已空闲的占槽条目翻转为 idle（释放槽位）
    for (const c of slotOccupants(pairs, workRoot)) {
      if (c.session_id === sessionID) continue
      if (busyOf[c.session_id] === false && c.state === "active") {
        pairs[c.session_id] = { ...pairs[c.session_id], state: "idle" }
        released.push(c.session_id)
      }
    }
    // ② 占槽判定（重验：此刻仍占槽者 ⇒ 拒绝）
    const holder = slotOccupants(pairs, workRoot).find((c) => c.session_id !== sessionID)
    if (holder) {
      if (released.length > 0) writePairs(stateRoot, pairs)
      result = { ok: false, holder, released }
      return
    }
    // ③ 登记（state=dispatching：简报尚未确认消费）
    if (input.register !== false) {
      pairs[sessionID] = {
        ...(pairs[sessionID] ?? {}),
        front_session_id: input.frontSessionID ?? null,
        canonical_root: stateRoot,
        agent: input.agent,
        kind: input.kind,
        registered_at: pairs[sessionID]?.registered_at ?? new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        work_root: workRoot,
        state: "dispatching" as SlotState,
        ...(input.goalKey ? { goal_key: input.goalKey } : {}),
      }
      writePairs(stateRoot, pairs)
      // role.json 的 session 分区：**同一临界区**写入（工程 session 开局要读自己的角色）
      if (input.kind === "engineering") writeRoleSession(stateRoot, sessionID, input.agent)
    } else if (released.length > 0) {
      writePairs(stateRoot, pairs)
    }
    result = { ok: true, released }
  })
  return result
}

/** 锁内：翻转某条目的 `state`（调用方必须已持有锁）。 */
export function setSlotState(stateRoot: string, sessionID: string, state: SlotState): void {
  const pairs = readPairs(stateRoot)
  if (!pairs[sessionID]) return
  pairs[sessionID] = { ...pairs[sessionID], state }
  writePairs(stateRoot, pairs)
}

/**
 * 消费确认（ADR D7.2 / AC44 / Phase 0）：
 *
 * 判据 = **该简报的 `message.id` 出现在 `session.context()` 的消息 id 集合里**。
 *
 * ⚠️ `prompt()` 在**入队时**就返回并分配了 id ⇒ **「拿到 id」≠「已消费」**。
 */
export async function waitBriefConsumed(
  ctx: any,
  sessionID: string,
  messageID: string,
  timeoutMs = consumeTimeoutMs(),
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let messages: any = []
    try {
      messages = await ctx.session.context({ sessionID })
    } catch {
      messages = []
    }
    if (contextMessageIds(messages).has(messageID)) return true
    if (Date.now() >= deadline) return false
    await sleep(CONSUME_POLL_MS)
  }
}

/** 名册索引 metadata（ADR D2.3；**整体替换语义** ⇒ 每次写必须回传完整对象）。 */
export function buildMetadata(input: {
  frontSessionID: string | undefined
  goalKey: GoalKey
  canonicalRoot: string
  workRoot: string
  projectDir: string
  baselineMessageID: string | undefined
  dispatchedAt: string
  state: SlotState
}): Record<string, unknown> {
  return {
    delegated_by: DELEGATED_BY,
    front_session_id: input.frontSessionID ?? null,
    goal_key: input.goalKey,
    canonical_root: input.canonicalRoot,
    work_root: input.workRoot,
    project_dir: input.projectDir,
    baseline_message_id: input.baselineMessageID ?? null,
    dispatched_at: input.dispatchedAt,
    state: input.state,
  }
}

/**
 * 列出宿主侧被本插件派发的后端（**兜底路径**：全库 list + cursor 续扫）。
 *
 * ⚠️ 必须**扫到全量**（ADR D2.4）：list 按 `time.updated` 降序、默认 limit=50 ⇒
 * 长期 idle 的后端会沉出窗口。⚠️ **不得用 `directory` 过滤**（重建时恰恰不知道有哪些目录）。
 */
export async function listDelegatedSessions(ctx: any): Promise<any[]> {
  const out: any[] = []
  let cursor: any = undefined
  for (let guard = 0; guard < 200; guard++) {
    const page = await ctx.session.list(cursor ? { cursor } : {})
    const data = Array.isArray(page?.data) ? page.data : []
    for (const item of data) {
      if (item?.metadata?.delegated_by === DELEGATED_BY) out.push(item)
    }
    const next = page?.cursor?.next
    if (!next) break
    cursor = next
  }
  return out
}

// ───────────────────────────── 状态与索引同步 ─────────────────────────────

/** 锁内合并写 pair 条目的若干字段（调用方无需持锁；内部自取）。 */
export function setPairFields(stateRoot: string, sessionID: string, fields: Record<string, unknown>): void {
  mkdirSync(stateDirOf(stateRoot), { recursive: true })
  withLock(lockDirOf(stateRoot), () => {
    const pairs = readPairs(stateRoot)
    if (!pairs[sessionID]) return
    pairs[sessionID] = { ...pairs[sessionID], ...fields }
    writePairs(stateRoot, pairs)
  })
}

/** 锁内翻转 + 自取锁的包装（独立步骤用；不可在已持锁时调用）。 */
export function updateSlotState(stateRoot: string, sessionID: string, state: SlotState): void {
  mkdirSync(stateDirOf(stateRoot), { recursive: true })
  withLock(lockDirOf(stateRoot), () => {
    setSlotState(stateRoot, sessionID, state)
  })
}

/**
 * 同步宿主 metadata 的 `state`（整体替换语义 ⇒ 必须先读回完整对象再写）。
 *
 * metadata 是**可丢弃索引**（ADR D2.1），权威态在 pair.json；本函数只保证展示态不漂移。
 */
export async function syncMetadataState(ctx: any, sessionID: string, state: SlotState): Promise<void> {
  try {
    const cur = await ctx.session.get({ sessionID })
    const md = { ...((cur as any)?.metadata ?? {}), state }
    await ctx.session.update({ sessionID, metadata: md })
  } catch {
    /* 后端已消失：索引随之消失即可（ADR D2.1「随 session 删除自动消失」） */
  }
}

/**
 * 全局活跃后端计数（AC31）：跨工作树的占槽后端数。
 *
 * ⚠️ **必须以 `pair.json` 的权威态为准**，不能只读 metadata 索引：
 * metadata 是**可丢弃索引**，可能过期（例如 reconcile 已把后端翻成 `idle`，
 * 或已被 suspend，但 metadata 仍是 `active`）⇒ 用过期值计数会**多算**，
 * 造成「并发上限已达」的**误拒**（E2E L2-22 实测踩到：已 `idle` 的后端仍占着额度）。
 *
 * 权威态的读法：metadata 里的 `canonical_root` = stateRoot ⇒ 读该仓的 `pair.json`
 * 取该 session 的 `state`；读不到（仓已删/条目缺失）时**退回** metadata 的值。
 */
function authoritativeSlotState(b: any): SlotState | undefined {
  const md = (b as any)?.metadata ?? {}
  let state = md.state
  const stateRoot = typeof md.canonical_root === "string" ? md.canonical_root : undefined
  const sid = (b as any)?.id
  if (stateRoot && typeof sid === "string") {
    try {
      const entry = lookupPair(stateRoot, sid)
      if (entry && isSlotState(entry.state)) state = entry.state
    } catch {
      /* 读不到就退回 metadata 的值 */
    }
  }
  return isSlotState(state) ? state : undefined
}

function holdsQuota(b: any): boolean {
  const state = authoritativeSlotState(b)
  return state === "active" || state === "dispatching"
}

/** 后端占槽的**工作树**（权威值在 `pair.json`；metadata 索引可能过期 ⇒ 只作兜底）。 */
function authoritativeWorkRoot(b: any): string {
  const md = (b as any)?.metadata ?? {}
  const stateRoot = typeof md.canonical_root === "string" ? md.canonical_root : undefined
  const sid = (b as any)?.id
  if (stateRoot && typeof sid === "string") {
    try {
      const entry = lookupPair(stateRoot, sid)
      const wr = entry?.work_root
      if (typeof wr === "string" && wr.length > 0) return wr
    } catch {
      /* 读不到就退回 metadata 的值 */
    }
  }
  return typeof md.work_root === "string" ? md.work_root : "?"
}

/**
 * 一个后端**当前**的槽位态（读权威态 `pair.json`，读不到才退回 metadata 索引）。
 *
 * metadata 是**可丢弃索引**、可能过期 ⇒ 判「谁占着额度」必须以 pair 为准。
 */
export async function countActiveBackends(ctx: any): Promise<number> {
  const backends = await listDelegatedSessions(ctx)
  let n = 0
  for (const b of backends) if (holdsQuota(b)) n++
  return n
}

/**
 * 插件侧记住的「后端 session_id → stateRoot」映射。
 *
 * **用途**：后端被外部删除后，`ctx.session.get` 拿不到 `location` ⇒ 无法反推它属于哪个
 * 工程仓 ⇒ 读不到它的 pair 条目 ⇒ 无法按 ADR D12 的矩阵处置（墓碑 / 落 vanished 行）。
 * 这个映射在**插件进程存活期间**补上这条缺口；跨进程重启会丢（此时靠调用方传
 * `project_dir` 兜底）。
 */
const backendRootCaches = new WeakMap<object, Map<string, string>>()

function rootCache(ctx: any): Map<string, string> {
  let m = backendRootCaches.get(ctx)
  if (!m) {
    m = new Map()
    backendRootCaches.set(ctx, m)
  }
  return m
}

/** 记住「后端 session_id → stateRoot」（按 ctx 隔离，避免跨实例/跨测试串味）。 */
export function rememberBackendRoot(ctx: any, sessionID: string, stateRoot: string): void {
  if (typeof sessionID === "string" && sessionID.length > 0) rootCache(ctx).set(sessionID, stateRoot)
}

/** 回查「后端 session_id → stateRoot」；未记住则 undefined。 */
export function recallBackendRoot(ctx: any, sessionID: string): string | undefined {
  return backendRootCaches.get(ctx)?.get(sessionID)
}

/** 定位一个后端所属的仓库根（stateRoot/workRoot）+ 其 pair 条目。 */
/**
 * 定位一个后端所属的仓库根（stateRoot/workRoot）+ 其 pair 条目。
 *
 * ⚠️ **不再抛错**（ADR D12）：已删后端拿不到 `location` ⇒ 可能定位不到 ⇒
 * 返回 `located:false` + `missing:true`，由调用方按 D12 矩阵返回**明确结果**，
 * **不得**抛「无法定位工作目录」把调用方逼死路。
 *
 * 定位来源（按优先级）：① 调用方给的 `project_dir` 提示；② session 自己的 `location`
 * （存活时）；③ 插件侧记忆映射（`rememberBackendRoot`）。
 */
export async function locateBackend(
  ctx: any,
  sessionID: string,
  hintDir?: string,
): Promise<{
  stateRoot?: string
  workRoot?: string
  entry?: any
  info?: any
  missing: boolean
  unknown: boolean
  located: boolean
}> {
  const { info, missing, unknown } = await readSessionInfo(ctx, sessionID)
  let dir: string | undefined
  if (typeof hintDir === "string" && hintDir.length > 0) dir = hintDir
  if (!dir) {
    const loc = (info as any)?.location?.directory
    if (typeof loc === "string" && loc.length > 0) dir = loc
  }
  if (!dir) {
    const remembered = recallBackendRoot(ctx, sessionID)
    if (remembered) {
      const roots = canonicalRoot(remembered)
      const entry = lookupPair(roots.stateRoot, sessionID, roots.workRoot)
      return { ...roots, entry, info, missing, unknown, located: true }
    }
    return { info, missing, unknown, located: false }
  }
  const { stateRoot, workRoot } = canonicalRoot(dir)
  const entry = lookupPair(stateRoot, sessionID, workRoot)
  rememberBackendRoot(ctx, sessionID, stateRoot)
  return { stateRoot, workRoot, entry, info, missing, unknown, located: true }
}

/** 落一条「终态行」（**无 `event` 字段**；`outcome:"vanished"` = 后端被外部删除）。 */
export function appendVanishedRow(
  stateRoot: string,
  sessionID: string,
  entry: any,
  workRoot: string | undefined,
): void {
  appendLedger(stateRoot, {
    recorded_at: new Date().toISOString(),
    kind: entry?.kind ?? "engineering",
    front_session_id: entry?.front_session_id ?? null,
    backend_session_id: sessionID,
    agent: entry?.agent ?? null,
    goal: entry?.goal ?? null,
    scope: entry?.scope ?? [],
    goal_key: entry?.goal_key ?? null,
    work_root: workRoot ?? entry?.work_root ?? null,
    canonical_root: stateRoot,
    outcome: "vanished",
  })
}

// ───────────────────────────── 工具：dispatch ─────────────────────────────

export function dispatchToolDefinition(ctx: any): any {
  return {
    name: TOOL_DISPATCH,
    description:
      "把一个工程任务异步派发到一个工程 session（建/复用），投递简报后**立即返回，不等待任务完成**。" +
      "同一工作树同时只允许一个后端在跑（单槽）；要换后端先用 suspend 暂停当前那个。" +
      "必填：project_dir（绝对路径）、task、goal、goal_key.intent（kebab slug）、scope、acceptance。" +
      "返回：session_id / state / goal_key / work_root；**dispatch 返回 ≠ 任务完成**。",
    input: {
      type: "object",
      properties: {
        project_dir: { type: "string", description: "工程根目录的绝对路径" },
        agent: { type: "string", description: "会话的 agent，默认 build" },
        task: { type: "string", description: "给工程 session 的任务原话" },
        goal: { type: "string", description: "一句话目标" },
        goal_key: {
          type: "object",
          properties: {
            intent: { type: "string", description: "目标的 kebab slug（同一目标续接时复用同一 slug）" },
            repo: { type: "string", description: "目标所属仓库（缺省按 canonical_root 填）" },
          },
          required: ["intent"],
          additionalProperties: false,
          description: "目标判等键（工程任务必填）",
        },
        scope: {
          type: "array",
          items: { type: "string" },
          description: "允许变更的路径前缀数组（相对工作树根）",
        },
        acceptance: { type: "string", description: "可判定的验收判据" },
        constraints: { type: "string", description: "额外约束（可选）" },
        resume_session: { type: "string", description: "续接既有工程 session 的 id（须同 goal_key）" },
      },
      required: ["project_dir", "task", "goal", "goal_key", "scope", "acceptance"],
      additionalProperties: false,
    },
    options: { permission: ACTION_DISPATCH, codemode: false },
    async execute(input: any, toolContext: any) {
      const brief = validateBrief(input)
      if (brief.kind === "engineering" && !brief.goal_key) {
        throw fail("goal_key 必填（工程 dispatch）：{intent: <kebab-slug>}")
      }
      const { stateRoot, workRoot } = canonicalRoot(brief.project_dir)
      const frontSessionID = toolContext?.sessionID
      const goalKey: GoalKey = {
        repo: brief.goal_key?.repo || stateRoot,
        intent: brief.goal_key?.intent ?? "",
      }

      // —— resume 校验：pair 登记表既是 ACL 也是目标一致性的判据 ——
      let existing: any = undefined
      // resume 命中已删后端时：旧条目墓碑 + 落 vanished 行 + 按同一 goal_key **新建**（ADR D12）
      let resumedVanished = false
      if (brief.resume_session) {
        existing = lookupPair(stateRoot, brief.resume_session, workRoot)
        if (!existing) {
          throw fail(`resume_session 未登记: ${brief.resume_session}（只能续接本工程仓库 pair.json 中登记的 session）`)
        }
        if (existing.canonical_root !== stateRoot && existing.canonical_root !== workRoot) {
          throw fail(`resume_session 的 canonical_root 不匹配: ${existing.canonical_root} ∉ {${stateRoot}, ${workRoot}}`)
        }
        // 墓碑是终态（ADR D6.3）：不可 resume，再派必须新建
        if (existing.state === "tombstone") {
          throw fail(`后端 ${brief.resume_session} 已终止（墓碑），不可续接；请新建 session`)
        }
        // 同 goal_key 必须放行；异 goal_key 硬拒（AC16 / ADR D3）
        const prevIntent = existing.goal_key?.intent
        if (typeof prevIntent === "string" && prevIntent.length > 0 && prevIntent !== goalKey.intent) {
          throw fail(`resume_session 的 goal_key 不一致（${prevIntent} ≠ ${goalKey.intent}）：不同目标须新建 session`)
        }
        // ── ADR D12 派发面处置：resume 命中**已删**后端 ──
        // 上游 404 = **正面证据**（不是"看不到"）⇒ 必须处置，否则旧条目的
        // `state=dispatching` 会**永久占死该 workRoot**（cancel/suspend 也定位不到它）。
        const { missing: vanished, unknown: unknownState } = await readSessionInfo(ctx, brief.resume_session)
        if (unknownState) {
          // 读失败但原因不明 ⇒ **不处置**（不墓碑、不新建）：无法区分"已删"与"暂时查不到"
          throw fail(
            `无法确认后端 ${brief.resume_session} 是否仍存在（查询失败，原因不明）：为避免误墓碑，本次不续接；请稍后重试`,
          )
        }
        if (vanished) {
          setSlotState(stateRoot, brief.resume_session, "tombstone")
          appendVanishedRow(stateRoot, brief.resume_session, existing, workRoot)
          resumedVanished = true
        }
      }

      // —— 全局上限：fail-fast，不排队（AC31）——
      const active = await countActiveBackends(ctx)
      const limit = maxActiveBackends()
      if (exceedsLimit(active, limit)) {
        // 诊断：把占额者报出来（否则「3/3」无法定位是谁占的）
        const holders = (await listDelegatedSessions(ctx))
          .filter((b: any) => holdsQuota(b))
          .map((b: any) => `${b.id}@${authoritativeWorkRoot(b)}`)
        throw fail(
          `并发上限已达（${active}/${limit}）：先 cancel 或 finish 某个后端再派发` +
            (holders.length ? `（占额：${holders.join(", ")}）` : ""),
        )
      }

      // —— create / 复用 ——
      const editRules =
        brief.kind === "engineering"
          ? scopeEditRules(workRoot, brief.scope)
          : [{ action: "edit", resource: "*", effect: "deny" }]
      const permissions = [
        ...CONSTANT_DENY.map((rule) => ({ ...rule, effect: "deny" as const })),
        ...editRules,
        ...brief.grants,
      ]
      let sessionID = brief.resume_session as string | undefined
      let created = false
      if (!sessionID || resumedVanished) {
        const c = await ctx.session.create({
          location: { directory: brief.project_dir },
          agent: brief.agent,
          title: brief.goal.slice(0, 60),
          permissions,
        })
        sessionID = c.id
        created = true
        rememberBackendRoot(ctx, sessionID as string, stateRoot)
      }

      // —— 槽位：锁外活体查询 → 锁内重验 + 登记（AC26）——
      // TS 无法跨 await 收窄 `let sessionID`；此处已确定非空（create 成功或 resume 命中）。
      if (!sessionID) throw fail("内部错误：sessionID 未就绪")
      const sid: string = sessionID
      const plan = await planSlot(ctx, stateRoot, workRoot)
      const claim = claimSlot({
        stateRoot,
        workRoot,
        busyOf: plan.busyOf,
        sessionID: sid,
        frontSessionID,
        agent: brief.agent,
        kind: brief.kind,
        goalKey,
      })
      if (!claim.ok) {
        // 互斥拒绝 ⇒ 不得留下已创建的 session（AC26③）
        if (created) {
          try {
            await ctx.session.remove({ sessionID })
          } catch {
            /* 清理失败不掩盖主错误 */
          }
        }
        throw fail(describeHolder(claim.holder!))
      }

      const dispatchedAt = new Date().toISOString()
      const messageID = newBriefMessageID()

      // —— ledger dispatched 行（独立 event 字段，AC36）——
      appendLedger(stateRoot, {
        event: "dispatched",
        recorded_at: dispatchedAt,
        kind: brief.kind,
        front_session_id: frontSessionID ?? null,
        backend_session_id: sessionID,
        agent: brief.agent,
        goal: brief.goal,
        scope: brief.scope,
        goal_key: goalKey,
        work_root: workRoot,
        canonical_root: stateRoot,
        outcome: null,
      })

      // —— 名册索引 metadata（整体替换语义）——
      try {
        await ctx.session.update({
          sessionID,
          metadata: buildMetadata({
            frontSessionID,
            goalKey,
            canonicalRoot: stateRoot,
            workRoot,
            projectDir: brief.project_dir,
            baselineMessageID: undefined,
            dispatchedAt,
            state: "dispatching",
          }),
        })
      } catch {
        /* 索引写失败不影响派发（可丢弃索引） */
      }

      // —— 投递简报（显式 delivery:"queue"，AC6）——
      const briefText = buildBrief(brief, workRoot)
      try {
        await ctx.session.prompt({ sessionID, text: briefText, delivery: "queue", id: messageID })
      } catch (e: any) {
        // prompt 失败 ⇒ 投递结果未知：保留 session 与槽位（AC30/AC49），只可 cancel 后重派
        appendLedger(stateRoot, {
          event: "dispatch_failed",
          recorded_at: new Date().toISOString(),
          kind: brief.kind,
          front_session_id: frontSessionID ?? null,
          backend_session_id: sessionID,
          agent: brief.agent,
          goal: brief.goal,
          scope: brief.scope,
          goal_key: goalKey,
          work_root: workRoot,
          canonical_root: stateRoot,
          outcome: null,
          error: String(e?.message ?? e),
        })
        return {
          content: JSON.stringify(
            {
              session_id: sessionID,
              state: "dispatching",
              delivery_known: false,
              message: "投递失败或结果未知：槽位已保留，请用 sessions 确认，或 cancel 后重派",
            },
            null,
            2,
          ),
        }
      }

      // —— 消费确认（AC44 / Phase 0：message id ∈ context 消息 id 集合）——
      const consumed = await waitBriefConsumed(ctx, sid, messageID)
      const finalState: SlotState = consumed ? "active" : "dispatching"
      if (consumed) {
        updateSlotState(stateRoot, sid, "active")
        await syncMetadataState(ctx, sid, "active")
      }

      // ── AC54：steer 残留检测（只在「续接曾被暂停的后端」时有基线可比）──
      let residue: "none" | "suspected" | "undetectable" = "none"
      const resumedEntry = lookupPair(stateRoot, sid, workRoot)
      const baselineID = resumedEntry?.suspended_at_message_id
      if (brief.resume_session && baselineID) {
        let msgs: any = []
        try {
          msgs = await ctx.session.context({ sessionID: sid })
        } catch {
          msgs = []
        }
        residue = detectSteerResidue(msgs, baselineID, messageID)
      } else if (brief.resume_session && !baselineID) {
        // 续接一个「没有暂停基线」的后端（例如上一次是 cancel 后重建）⇒ 无从比对
        residue = "undetectable"
      }
      if (residue !== "none") {
        setPairFields(stateRoot, sid, { steer_residue: residue })
      }

      return {
        content: JSON.stringify(
          {
            session_id: sessionID,
            state: finalState,
            goal_key: goalKey,
            work_root: workRoot,
            canonical_root: stateRoot,
            delivery_known: consumed,
            ...(resumedVanished
              ? {
                  recovered_from_vanished: brief.resume_session,
                  message: `原后端已被外部删除：已按 ADR D12 记墓碑 + 落 outcome:"vanished"，并按同一 goal_key 新建后端续接`,
                }
              : {}),
            ...(consumed ? {} : { message: "简报尚未被确认消费（仍在队列中）；该后端暂不可 suspend，请稍后重查或 cancel 后重派" }),
          },
          null,
          2,
        ),
      }
    },
  }
}

// ───────────────────────────── 工具：sessions（只读） ─────────────────────────────

export function sessionsToolDefinition(ctx: any): any {
  return {
    name: TOOL_SESSIONS,
    description:
      "**只读**列出本 front 名下的后端工程 session 及其状态与证据（不投递任何 prompt，不污染后端）。" +
      "返回：overall（聚合态）/ headline（一句话）/ items（逐项明细，永远列出）。",
    input: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    options: { permission: ACTION_SESSIONS, codemode: false },
    async execute(_input: any, _toolContext: any) {
      // ⚠️ **绝不投递 prompt**（AC4）：本工具只读后端会话 + 读/写本地索引。
      const backends = await listDelegatedSessions(ctx)
      const items: any[] = []
      for (const b of backends) {
        const md = (b as any)?.metadata ?? {}
        const sessionID = (b as any)?.id
        const stateRoot = typeof md.canonical_root === "string" ? md.canonical_root : undefined
        const workRoot = typeof md.work_root === "string" ? md.work_root : undefined

        // 活体判定（只读）
        const { info, missing } = await readSessionInfo(ctx, sessionID)
        let messages: any = []
        try {
          messages = await ctx.session.context({ sessionID })
        } catch {
          messages = []
        }
        const running = !missing && isRunning(info, messages)

        // 权威条目（pair.json）+ 存量回填（AC40：本地索引写，不算观测面污染）
        let entry: any = undefined
        if (stateRoot) {
          entry = lookupPair(stateRoot, sessionID)
          if (entry && (!entry.work_root || !isSlotState(entry.state))) {
            const filled = backfillPairEntry(entry, workRoot ?? stateRoot, running)
            try {
              mkdirSync(stateDirOf(stateRoot), { recursive: true })
              withLock(lockDirOf(stateRoot), () => {
                const pairs = readPairs(stateRoot)
                if (pairs[sessionID]) {
                  pairs[sessionID] = filled
                  writePairs(stateRoot, pairs)
                }
              })
            } catch {
              /* 回填失败不阻塞观测 */
            }
            entry = filled
          }
        }

        const state = isSlotState(entry?.state) ? entry.state : "idle"
        const outcome = missing ? "vanished" : ((info as any)?.outcome ?? null)
        const lastActivity = toMillis((info as any)?.time?.updated ?? (info as any)?.time?.created)
        items.push({
          session_id: sessionID,
          goal_key: entry?.goal_key ?? md.goal_key ?? null,
          work_root: entry?.work_root ?? workRoot ?? null,
          canonical_root: entry?.canonical_root ?? stateRoot ?? null,
          state,
          running,
          outcome,
          last_activity_at: lastActivity,
          kind: entry?.kind ?? md.kind ?? null,
          front_session_id: entry?.front_session_id ?? md.front_session_id ?? null,
          evidence: { message_count: Array.isArray(messages) ? messages.length : 0, missing },
          slot: {
            key: entry?.work_root ?? workRoot ?? null,
            holder: state === "active" || state === "dispatching" ? sessionID : null,
            // AC47③：仅当「登记占槽 + 实际不 busy + 超 stalled 阈值」才报悬挂
            dangling: isDangling({ state, running, lastActivityAt: lastActivity }),
            stalled: isStalled({ running, lastActivityAt: lastActivity }),
          },
          // AC54：steer 残留可观测性（suspend 时记录基线，resume 时比对；无法判定时如实报 undetectable）
          steer_residue: entry?.steer_residue ?? "none",
        })
      }
      const agg = aggregateStates(
        items.map((i) => ({ state: i.state, running: i.running, outcome: i.outcome })),
      )
      // AC43/AC57：按 work_root 分组（同工作树的常驻后端「列在一起」）
      const groups = groupByWorkRoot(
        items.map((i) => ({ session_id: i.session_id, work_root: i.work_root })),
      )
      return {
        content: JSON.stringify(
          { overall: agg.overall, headline: agg.headline, items, groups },
          null,
          2,
        ),
      }
    },
  }
}

// ───────────────────────────── 工具：suspend（暂停，可续） ─────────────────────────────

export function suspendToolDefinition(ctx: any): any {
  return {
    name: TOOL_SUSPEND,
    description:
      "**暂停**一个后端工程 session：中断它、让出工作树槽位，但**保留上下文**（之后仍可 dispatch/resume 续接）。" +
      "与 cancel 的区别：cancel 是终止（墓碑，永久不可续）。" +
      "用于「切到别的后端、稍后回来继续」。",
    input: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "要暂停的后端 session id" },
        project_dir: {
          type: "string",
          description: "该后端所在工程仓的绝对路径（**仅当后端已被外部删除、需要定位其台账时需要**）",
        },
      },
      required: ["session_id"],
      additionalProperties: false,
    },
    options: { permission: ACTION_SUSPEND, codemode: false },
    async execute(input: any, _toolContext: any) {
      const sessionID = String(input?.session_id ?? "")
      if (!sessionID) throw fail("session_id 必填")
      const hintDir = typeof input?.project_dir === "string" && input.project_dir.length > 0 ? input.project_dir : undefined
      const located = await locateBackend(ctx, sessionID, hintDir)
      const { stateRoot, entry } = located
      const state = isSlotState(entry?.state) ? entry.state : "idle"

      // 定位不到工程仓（session 无 location 信息）属异常形态 ⇒ 明确返回，**不抛错**
      if (!stateRoot) {
        return {
          content: JSON.stringify(
            { session_id: sessionID, suspended: false, state, message: "无法定位该后端所属的工程仓（session 无 location 信息）" },
            null,
            2,
          ),
        }
      }

      // ── ADR D12：已删后端（上游 404 = 正面证据）——
      if (located.unknown) {
        // 查询失败但原因不明 ⇒ 不处置（不释放槽、不墓碑），返回明确结果
        return {
          content: JSON.stringify(
            {
              session_id: sessionID,
              suspended: false,
              state,
              message: "无法确认该后端是否仍存在（查询失败，原因不明）：未做任何处置，请稍后重试",
            },
            null,
            2,
          ),
        }
      }
      if (located.missing) {
        if (!located.located || !stateRoot) {
          // 定位不到它的工程仓 ⇒ 无法写 pair/ledger ⇒ **返回明确结果，不抛错**
          return {
            content: JSON.stringify(
              {
                session_id: sessionID,
                suspended: false,
                state,
                message:
                  "该后端已被外部删除，但无法定位该后端所属的工程仓（未提供 project_dir）⇒ 未做台账标记；" +
                  "如需标记请补 project_dir 后重试",
              },
              null,
              2,
            ),
          }
        }
        // D12 矩阵（已删）：
        //   dispatching/active ⇒ 释放槽位并置 suspended
        //   idle/suspended     ⇒ **幂等 no-op**（本就不占槽，state 不变）
        //   tombstone          ⇒ 拒绝（终态）
        if (state === "tombstone") {
          return {
            content: JSON.stringify(
              { session_id: sessionID, suspended: false, state, message: "该后端已是墓碑，无可暂停" },
              null,
              2,
            ),
          }
        }
        if (state === "idle" || state === "suspended") {
          return {
            content: JSON.stringify(
              {
                session_id: sessionID,
                suspended: false,
                idempotent: true,
                state,
                vanished: true,
                message: "该后端已被外部删除：它本就不占槽，幂等 no-op（state 不变）",
              },
              null,
              2,
            ),
          }
        }
        updateSlotState(stateRoot, sessionID, "suspended")
        await syncMetadataState(ctx, sessionID, "suspended")
        return {
          content: JSON.stringify(
            {
              session_id: sessionID,
              suspended: true,
              state: "suspended",
              vanished: true,
              message: "该后端已被外部删除：已按 ADR D12 释放其工作树槽位并置为 suspended",
            },
            null,
            2,
          ),
        }
      }

      // ── AC48：归属检查（旧 front 的 active 槽位**不被静默顶掉**）──
      // `front_session_id` 本来是软信号；但「回收别人的槽位」必须有据：
      // 登记 front 仍存活 ⇒ 拒绝；已消失（亡主）⇒ 允许回收并落 ledger 行。
      const ownerFront = entry?.front_session_id
      const me = _toolContext?.sessionID
      if (typeof ownerFront === "string" && ownerFront.length > 0 && ownerFront !== me) {
        const alive = await frontAlive(ctx, ownerFront)
        if (alive) {
          throw fail(
            `后端 ${sessionID} 归属于另一个 front（${ownerFront}）且该 front 仍存活：不可静默顶掉它的槽位；` +
              `如需接管，请先确认对方会话已结束`,
          )
        }
        // 亡主：允许回收，并落接管台账（之后仍按 state 分派继续）
        appendLedger(stateRoot, {
          event: "taken_over",
          recorded_at: new Date().toISOString(),
          backend_session_id: sessionID,
          previous_front_session_id: ownerFront,
          taken_by_front_session_id: me ?? null,
          canonical_root: stateRoot,
          work_root: entry?.work_root ?? null,
          outcome: null,
        })
      }

      // 按 state 分派（AC51）
      if (state === "tombstone") throw fail(`后端 ${sessionID} 已终止（墓碑），不可暂停`)
      if (state === "dispatching") {
        throw fail(
          `后端 ${sessionID} 的简报尚未确认消费（state=dispatching），不可暂停保留（那份简报可能仍排队，恢复后会抢先执行）；请改用 cancel`,
        )
      }

      // 停机判据的基线必须在 interrupt **之前**取（ADR D11.3）
      const stopBaseline = await snapshotStopBaseline(ctx, sessionID)
      if (!stopBaseline) {
        return {
          content: JSON.stringify(
            {
              session_id: sessionID,
              suspended: false,
              state,
              message:
                "无法读取后端状态（原因不明），未释放槽位（停机判不出来 ⇒ 保守当作仍在运行）；" +
                "请稍后重试或用 cancel",
            },
            null,
            2,
          ),
        }
      }

      // interrupt（不 resume：丢弃待提升的 steer）
      let interrupted = false
      try {
        const r = await ctx.session.interrupt({ sessionID, resume: false })
        interrupted = r?.interrupted === true
      } catch {
        interrupted = false
      }

      // ── 停机确认（AC53 / ADR D11.3）：有界等待「判活为假 + 终态落定」──
      // ⚠️ 上游 `interrupt` 是「先确认接受、清理异步 settle」（execution.ts）
      // ⇒ 返回后会话**还会跑一小会儿** ⇒ 只查一次会误判「未停机」，
      // 导致 suspend 对在跑的后端几乎必然失败（E2E L2-22 实测暴露）。
      // ⇒ 等到「确认停机」或超时；**未确认停机 ⇒ 一律不释放槽位**（含读失败）。
      const stopped = await waitStopped(ctx, sessionID, stopBaseline)
      if (!stopped) {
        return {
          content: JSON.stringify(
            {
              session_id: sessionID,
              suspended: false,
              state,
              message:
                "后端在停机确认窗口内仍在运行，未释放槽位（释放前必须确认停机）；" +
                "请稍后重试或用 cancel",
            },
            null,
            2,
          ),
        }
      }

      // AC54 的基线：暂停时刻的最后一条消息 id（resume 时判断新增消息里是否混入陈旧 steer）
      // （放在「未停机」早退之后：读到的路径上一定用得上）
      const { messages: stopMessages } = await readSessionMessages(ctx, sessionID)
      let suspendedAtMessageID: string | undefined
      try {
        suspendedAtMessageID = lastMessageID(stopMessages)
      } catch {
        suspendedAtMessageID = undefined
      }
      // 释放槽位 + 标记 suspended（幂等：不在跑且不占槽时同样落到 suspended）
      updateSlotState(stateRoot, sessionID, "suspended")
      setPairFields(stateRoot, sessionID, {
        suspended_at_message_id: suspendedAtMessageID ?? null,
        steer_residue: "none",
      })
      await syncMetadataState(ctx, sessionID, "suspended")
      return {
        content: JSON.stringify(
          {
            session_id: sessionID,
            suspended: true,
            interrupted,
            state: "suspended",
            message: "已暂停：上下文保留，之后可用 dispatch（同一 goal_key）恢复",
          },
          null,
          2,
        ),
      }
    },
  }
}

// ───────────────────────────── 工具：cancel（终止，墓碑） ─────────────────────────────

export function cancelToolDefinition(ctx: any): any {
  return {
    name: TOOL_CANCEL,
    description:
      "**终止**一个后端工程 session：中断它、让出工作树槽位，并标为墓碑（**永久不可 resume**，再派必须新建）。" +
      "只想切走、稍后继续 ⇒ 用 suspend。",
    input: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "要终止的后端 session id" },
        remove: { type: "boolean", description: "是否同时删除该 session，默认 false（保留以便审计）" },
        project_dir: {
          type: "string",
          description: "该后端所在工程仓的绝对路径（**仅当后端已被外部删除、需要定位其台账时需要**）",
        },
      },
      required: ["session_id"],
      additionalProperties: false,
    },
    options: { permission: ACTION_CANCEL, codemode: false },
    async execute(input: any, _toolContext: any) {
      const sessionID = String(input?.session_id ?? "")
      if (!sessionID) throw fail("session_id 必填")
      const remove = input?.remove === true
      const hintDir = typeof input?.project_dir === "string" && input.project_dir.length > 0 ? input.project_dir : undefined
      const located = await locateBackend(ctx, sessionID, hintDir)
      const { stateRoot, entry } = located
      const state = isSlotState(entry?.state) ? entry.state : "idle"

      // ── ADR D12：已删后端（上游 404 = 正面证据）——
      if (located.unknown) {
        return {
          content: JSON.stringify(
            {
              session_id: sessionID,
              interrupted: false,
              state,
              message: "无法确认该后端是否仍存在（查询失败，原因不明）：未做任何处置，请稍后重试",
            },
            null,
            2,
          ),
        }
      }
      if (located.missing) {
        if (!located.located || !stateRoot) {
          return {
            content: JSON.stringify(
              {
                session_id: sessionID,
                interrupted: false,
                state,
                message:
                  "该后端已被外部删除，但无法定位该后端所属的工程仓（未提供 project_dir）⇒ 未做台账标记；" +
                  "如需标记请补 project_dir 后重试",
              },
              null,
              2,
            ),
          }
        }
        if (state === "tombstone") {
          return {
            content: JSON.stringify(
              { session_id: sessionID, interrupted: false, state: "tombstone", message: "该后端已是墓碑，无需重复终止" },
              null,
              2,
            ),
          }
        }
        // D12 矩阵：已删 + 非墓碑 ⇒ 置墓碑 + 落 outcome:"vanished" 终态行
        updateSlotState(stateRoot, sessionID, "tombstone")
        appendVanishedRow(stateRoot, sessionID, entry, located.workRoot)
        await syncMetadataState(ctx, sessionID, "tombstone")
        return {
          content: JSON.stringify(
            {
              session_id: sessionID,
              interrupted: false,
              state: "tombstone",
              vanished: true,
              message: "该后端已被外部删除：已按 ADR D12 置为墓碑并落 outcome:\"vanished\" 终态行",
            },
            null,
            2,
          ),
        }
      }

      // 已墓碑 ⇒ 幂等 no-op
      if (state === "tombstone") {
        return {
          content: JSON.stringify(
            { session_id: sessionID, interrupted: false, state: "tombstone", message: "该后端已是墓碑，无需重复终止" },
            null,
            2,
          ),
        }
      }

      if (!stateRoot) {
        return {
          content: JSON.stringify(
            { session_id: sessionID, interrupted: false, state, message: "无法定位该后端所属的工程仓（session 无 location 信息）" },
            null,
            2,
          ),
        }
      }

      let interrupted = false
      try {
        const r = await ctx.session.interrupt({ sessionID, resume: false })
        interrupted = r?.interrupted === true
      } catch {
        interrupted = false
      }

      // interrupted:false（不在跑）⇒ **纯 no-op，不墓碑**（AC28）
      if (!interrupted) {
        return {
          content: JSON.stringify(
            {
              session_id: sessionID,
              interrupted: false,
              state,
              message: "该后端不在运行：未终止、未墓碑（上下文仍可续接）",
            },
            null,
            2,
          ),
        }
      }

      // 终止 ⇒ 墓碑 + 释放槽位
      updateSlotState(stateRoot, sessionID, "tombstone")
      await syncMetadataState(ctx, sessionID, "tombstone")
      appendLedger(stateRoot, {
        event: "cancelled",
        recorded_at: new Date().toISOString(),
        backend_session_id: sessionID,
        front_session_id: entry?.front_session_id ?? null,
        canonical_root: stateRoot,
        work_root: entry?.work_root ?? null,
        outcome: null,
      })
      if (remove) {
        try {
          await ctx.session.remove({ sessionID })
        } catch {
          /* 删除失败不掩盖终止事实 */
        }
      }
      return {
        content: JSON.stringify(
          {
            session_id: sessionID,
            interrupted: true,
            state: "tombstone",
            removed: remove,
            message: "已终止（墓碑）：不可再 resume，再派须新建",
          },
          null,
          2,
        ),
      }
    },
  }
}
