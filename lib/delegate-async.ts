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
  lookupPair,
  readPairs,
  scopeEditRules,
  slotOccupants,
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

/** 全局上限判定（AC31）。 */
export function exceedsLimit(active: number, limit: number): boolean {
  return active >= limit
}

// ───────────────────────────── 内部工具 ─────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stateDirOf(stateRoot: string): string {
  return path.join(stateRoot, ".rddf", "state")
}

function lockDirOf(stateRoot: string): string {
  return path.join(stateRoot, ".rddf", "state", ".role.lock")
}

async function readSessionInfo(ctx: any, sessionID: string): Promise<{ info: any; missing: boolean }> {
  try {
    const info = await ctx.session.get({ sessionID })
    return { info, missing: false }
  } catch {
    return { info: undefined, missing: true }
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
    const { info, missing } = await readSessionInfo(ctx, c.session_id)
    // 后端已消失 ⇒ 不再占槽（视为空闲，可回收）
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

/** 全局活跃后端计数（AC31）：跨工作树的占槽后端数。 */
export async function countActiveBackends(ctx: any): Promise<number> {
  const backends = await listDelegatedSessions(ctx)
  let n = 0
  for (const b of backends) {
    const state = b?.metadata?.state
    if (isSlotState(state) && (state === "active" || state === "dispatching")) n++
  }
  return n
}

/** 定位一个后端所属的仓库根（stateRoot/workRoot）+ 其 pair 条目。 */
export async function locateBackend(
  ctx: any,
  sessionID: string,
): Promise<{ stateRoot: string; workRoot: string; entry: any; info: any; missing: boolean }> {
  const { info, missing } = await readSessionInfo(ctx, sessionID)
  const dir = (info as any)?.location?.directory
  if (typeof dir !== "string" || dir.length === 0) {
    throw fail(`无法定位后端 ${sessionID} 的工作目录（session 已不存在？）`)
  }
  const { stateRoot, workRoot } = canonicalRoot(dir)
  const entry = lookupPair(stateRoot, sessionID, workRoot)
  return { stateRoot, workRoot, entry, info, missing }
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
      }

      // —— 全局上限：fail-fast，不排队（AC31）——
      const active = await countActiveBackends(ctx)
      const limit = maxActiveBackends()
      if (exceedsLimit(active, limit)) {
        throw fail(`并发上限已达（${active}/${limit}）：先 cancel 或 finish 某个后端再派发`)
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
      if (!sessionID) {
        const c = await ctx.session.create({
          location: { directory: brief.project_dir },
          agent: brief.agent,
          title: brief.goal.slice(0, 60),
          permissions,
        })
        sessionID = c.id
        created = true
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

      return {
        content: JSON.stringify(
          {
            session_id: sessionID,
            state: finalState,
            goal_key: goalKey,
            work_root: workRoot,
            canonical_root: stateRoot,
            delivery_known: consumed,
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
        const lastActivity = (info as any)?.time?.updated ?? (info as any)?.time?.created ?? null
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
            dangling: state === "active" && !running,
          },
        })
      }
      const agg = aggregateStates(
        items.map((i) => ({ state: i.state, running: i.running, outcome: i.outcome })),
      )
      return {
        content: JSON.stringify(
          { overall: agg.overall, headline: agg.headline, items },
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
      },
      required: ["session_id"],
      additionalProperties: false,
    },
    options: { permission: ACTION_SUSPEND, codemode: false },
    async execute(input: any, _toolContext: any) {
      const sessionID = String(input?.session_id ?? "")
      if (!sessionID) throw fail("session_id 必填")
      const located = await locateBackend(ctx, sessionID)
      const { stateRoot, entry } = located
      const state = isSlotState(entry?.state) ? entry.state : "idle"

      // 按 state 分派（AC51）
      if (state === "tombstone") throw fail(`后端 ${sessionID} 已终止（墓碑），不可暂停`)
      if (state === "dispatching") {
        throw fail(
          `后端 ${sessionID} 的简报尚未确认消费（state=dispatching），不可暂停保留（那份简报可能仍排队，恢复后会抢先执行）；请改用 cancel`,
        )
      }

      // interrupt（不 resume：丢弃待提升的 steer）
      let interrupted = false
      try {
        const r = await ctx.session.interrupt({ sessionID, resume: false })
        interrupted = r?.interrupted === true
      } catch {
        interrupted = false
      }

      // 停机确认（AC53）：仍在跑 ⇒ **不释放槽位**
      const { info } = await readSessionInfo(ctx, sessionID)
      let messages: any = []
      try {
        messages = await ctx.session.context({ sessionID })
      } catch {
        messages = []
      }
      if (isRunning(info, messages)) {
        return {
          content: JSON.stringify(
            {
              session_id: sessionID,
              suspended: false,
              state,
              message: "后端仍在运行，未释放槽位（释放前必须确认停机）；请稍后重试或用 cancel",
            },
            null,
            2,
          ),
        }
      }

      // 释放槽位 + 标记 suspended（幂等：不在跑且不占槽时同样落到 suspended）
      updateSlotState(stateRoot, sessionID, "suspended")
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
      },
      required: ["session_id"],
      additionalProperties: false,
    },
    options: { permission: ACTION_CANCEL, codemode: false },
    async execute(input: any, _toolContext: any) {
      const sessionID = String(input?.session_id ?? "")
      if (!sessionID) throw fail("session_id 必填")
      const remove = input?.remove === true
      const located = await locateBackend(ctx, sessionID)
      const { stateRoot, entry } = located
      const state = isSlotState(entry?.state) ? entry.state : "idle"

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
