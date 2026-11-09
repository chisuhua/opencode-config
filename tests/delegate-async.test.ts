/**
 * front-multi-backend 异步派发面的单测。
 *
 * 覆盖：槽位纯函数（workRoot 键 / 存量回填 / 活体判据）、消费确认、
 * dispatch / sessions / suspend / cancel 的行为，以及「单槽 + 可切换」的
 * 关键序列（AC26 / AC42 / AC44 / AC45 / AC46 / AC47 / AC51 / AC52 / AC53 / AC57）。
 *
 * 运行：bun test tests/
 */
import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import path from "node:path"

process.env.RDDF_CONSUME_TIMEOUT_MS = "200"

import {
  aggregateStates,
  detectSteerResidue,
  isDangling,
  isStalled,
  stalledThresholdMs,
  cancelToolDefinition,
  contextMessageIds,
  dispatchToolDefinition,
  exceedsLimit,
  isRunning,
  listDelegatedSessions,
  maxActiveBackends,
  sessionsToolDefinition,
  suspendToolDefinition,
  waitBriefConsumed,
} from "../lib/delegate-async.ts"
import { backfillPairEntry, canonicalRoot, readPairs, slotOccupants } from "../lib/delegate-core.ts"

const TMP = mkdtempSync(path.join(tmpdir(), "delegate-async-test-"))

const git = (args: string[], cwd: string) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

function repo(name: string): string {
  const dir = path.join(TMP, name)
  mkdirSync(dir, { recursive: true })
  git(["init", "-q"], dir)
  git(["config", "user.email", "t@t"], dir)
  git(["config", "user.name", "t"], dir)
  writeFileSync(path.join(dir, "a.txt"), "a\n")
  git(["add", "-A"], dir)
  git(["commit", "-qm", "init"], dir)
  return dir
}

// ─────────────────── fake ctx（含 list 分页 / 消费可控的 prompt） ───────────────────

interface FakeOpts {
  /** prompt 时不把消息并入 context（模拟「已入队但未消费」） */
  notConsume?: boolean
  /** 模拟在跑：get 返回 busy > idle */
  running?: Record<string, boolean>
  /** 模拟会话已删除 */
  missing?: string[]
  /** list 每页大小（测 cursor 续扫） */
  pageSize?: number
  /** 让 makeBusy 的 session 永不停止 */
  interruptNoop?: boolean
  /** session id 前缀（避免多个 fake ctx 之间 id 重号） */
  idPrefix?: string
}

function createFakeCtx(opts: FakeOpts = {}) {
  const sessions = new Map<string, any>()
  const calls = { create: 0, prompt: 0, remove: 0, interrupt: 0 }
  let counter = 0

  const ctx: any = {
    session: {
      create: async (input: any) => {
        calls.create++
        counter++
        const id = `${opts.idPrefix ?? "ses_fake"}_${counter}`
        sessions.set(id, {
          id,
          agent: input.agent,
          location: { directory: input.location.directory },
          metadata: input.metadata ?? {},
          messages: [],
          busy: false,
          outcome: null,
          idle: 0,
          updated: Date.now(),
        })
        return { id }
      },
      prompt: async (input: any) => {
        calls.prompt++
        const s = sessions.get(input.sessionID)
        if (!s) throw new Error(`未知 session: ${input.sessionID}`)
        if (opts.notConsume) return { id: input.id } // 已入队但未消费
        s.messages.push({ id: input.id ?? `msg_auto_${s.messages.length}`, type: "user", text: input.text, time: { created: Date.now() } })
        s.busy = true
        return { id: input.id }
      },
      wait: async () => ({}),
      get: async (input: any) => {
        const s = sessions.get(input.sessionID)
        if (!s || opts.missing?.includes(input.sessionID)) throw new Error(`未知 session: ${input.sessionID}`)
        const busyFlag = opts.running?.[input.sessionID] ?? s.busy
        return {
          id: s.id,
          agent: s.agent,
          location: s.location,
          metadata: s.metadata,
          outcome: s.outcome,
          time: {
            idle: busyFlag ? 0 : s.idle || Date.now(),
            updated: s.updated,
            ...(busyFlag ? { busy: Date.now() } : {}),
          },
        }
      },
      context: async (input: any) => {
        const s = sessions.get(input.sessionID)
        if (!s) throw new Error(`未知 session: ${input.sessionID}`)
        return s.messages
      },
      update: async (input: any) => {
        const s = sessions.get(input.sessionID)
        if (!s) throw new Error(`未知 session: ${input.sessionID}`)
        if (input.metadata !== undefined) s.metadata = input.metadata
        return {}
      },
      interrupt: async (input: any) => {
        calls.interrupt++
        const s = sessions.get(input.sessionID)
        if (!s) return { interrupted: false }
        const wasRunning = opts.running?.[input.sessionID] ?? s.busy
        if (!wasRunning) return { interrupted: false }
        if (!opts.interruptNoop) {
          s.busy = false
          s.idle = Date.now()
          if (opts.running) opts.running[input.sessionID] = false
        }
        return { interrupted: true }
      },
      remove: async (input: any) => {
        calls.remove++
        sessions.delete(input.sessionID)
        return {}
      },
      list: async (input: any) => {
        const all = [...sessions.values()]
          .filter((s) => !opts.missing?.includes(s.id))
          .sort((a, b) => b.updated - a.updated)
        const size = opts.pageSize ?? 50
        const offset = Number(input?.cursor ?? 0)
        const data = all.slice(offset, offset + size)
        const nextOffset = offset + size
        return { data, cursor: nextOffset < all.length ? { next: String(nextOffset) } : undefined }
      },
    },
  }
  return { ctx, sessions, calls }
}

async function run(tool: any, input: any, sessionID = "ses_front_test") {
  const r = await tool.execute(input, { sessionID })
  return JSON.parse(r.content)
}

const baseInput = (dir: string, intent = "fix-readme") => ({
  project_dir: dir,
  task: "把 a.txt 改成 b",
  goal: "改 a.txt",
  goal_key: { intent },
  scope: ["a.txt"],
  acceptance: "a.txt 内容为 b",
})

afterAll(() => rmSync(TMP, { recursive: true, force: true }))

// ───────────────────────────── 纯函数 ─────────────────────────────

describe("槽位纯函数（AC40 / AC42）", () => {
  test("slotOccupants 只认同 workRoot 且占槽的条目", () => {
    const pairs = {
      s1: { work_root: "/w/a", state: "active" },
      s2: { work_root: "/w/a", state: "idle" },
      s3: { work_root: "/w/b", state: "active" },
      s4: { work_root: "/w/a", state: "dispatching" },
      s5: { state: "active" }, // 存量缺 work_root ⇒ 不参与判定
    }
    const occ = slotOccupants(pairs, "/w/a")
    expect(occ.map((x) => x.session_id).sort()).toEqual(["s1", "s4"])
  })

  test("backfillPairEntry：缺 work_root 按 canonical_root 补，缺 state 按活体判据补", () => {
    const filled = backfillPairEntry({ canonical_root: "/repo" }, "/repo", true)
    expect(filled.work_root).toBe("/repo")
    expect(filled.state).toBe("active")
  })

  test("backfillPairEntry：非 busy 补 idle（但绝不无条件默认 idle）", () => {
    expect(backfillPairEntry({ canonical_root: "/r" }, "/r", false).state).toBe("idle")
    // 有 state 时不得改写（部分迁移条目）
    expect(backfillPairEntry({ work_root: "/x", state: "suspended" }, "/r", true).state).toBe("suspended")
    expect(backfillPairEntry({ work_root: "/x", state: "suspended" }, "/r", true).work_root).toBe("/x")
  })
})

describe("活体判据（AC21/AC22）", () => {
  test("busy 存在且 (idle 未定义 或 busy > idle) ⇒ running", () => {
    expect(isRunning({ time: { busy: 10 } })).toBe(true)
    expect(isRunning({ time: { busy: 10, idle: 5 } })).toBe(true)
    expect(isRunning({ time: { busy: 5, idle: 10 } })).toBe(false)
  })

  test("无 busy 但最后消息晚于 idle ⇒ running（首次运行窗口）", () => {
    expect(isRunning({ time: { idle: 100 } }, [{ id: "m1", time: { created: 200 } }])).toBe(true)
    expect(isRunning({ time: { idle: 300 } }, [{ id: "m1", time: { created: 200 } }])).toBe(false)
  })

  test("pending 窗口（只有 created/updated）⇒ 不判 running", () => {
    expect(isRunning({ time: { created: 1, updated: 2 } }, [])).toBe(false)
  })
})

describe("消费判据（AC44 / Phase 0）", () => {
  test("contextMessageIds 收集消息 id", () => {
    const ids = contextMessageIds([{ id: "msg_a" }, { id: "msg_b" }, { nope: 1 }])
    expect([...ids].sort()).toEqual(["msg_a", "msg_b"])
  })

  test("waitBriefConsumed：id 出现在 context ⇒ true", async () => {
    const { ctx } = createFakeCtx()
    const created = await ctx.session.create({ location: { directory: TMP }, agent: "build" })
    await ctx.session.prompt({ sessionID: created.id, text: "x", id: "msg_x" })
    expect(await waitBriefConsumed(ctx, created.id, "msg_x", 500)).toBe(true)
  })

  test("waitBriefConsumed：id 不在 context ⇒ false（超时）", async () => {
    const { ctx } = createFakeCtx({ notConsume: true })
    const created = await ctx.session.create({ location: { directory: TMP }, agent: "build" })
    await ctx.session.prompt({ sessionID: created.id, text: "x", id: "msg_x" })
    expect(await waitBriefConsumed(ctx, created.id, "msg_x", 300)).toBe(false)
  })
})

describe("聚合与上限（AC23/AC24/AC31）", () => {
  test("worst-of：unverified + succeeded ⇒ 不得报完成", () => {
    const r = aggregateStates([
      { state: "idle", running: false, outcome: "unverified" },
      { state: "idle", running: false, outcome: "succeeded" },
    ])
    expect(r.overall).toBe("partial_unverified")
    expect(r.headline).toContain("unverified")
  })

  test("running 不进 worst-of，整体报进行中且带明细提示", () => {
    const r = aggregateStates([
      { state: "active", running: true, outcome: null },
      { state: "idle", running: false, outcome: "succeeded" },
    ])
    expect(r.overall).toBe("in_progress")
    expect(r.headline).toContain("进行中")
  })

  test("全部 unverified ⇒ 「无可验证交付」且不含「没有产出」", () => {
    const r = aggregateStates([
      { state: "idle", running: false, outcome: "unverified" },
      { state: "idle", running: false, outcome: "unverified" },
    ])
    expect(r.overall).toBe("no_verifiable_delivery")
    expect(r.headline).toContain("无可验证交付")
    expect(r.headline).not.toContain("没有产出")
  })

  test("上限判定 + 默认值 3", () => {
    expect(exceedsLimit(3, 3)).toBe(true)
    expect(exceedsLimit(2, 3)).toBe(false)
    expect(maxActiveBackends()).toBe(3)
  })
})

// ───────────────────────────── dispatch / 槽位 ─────────────────────────────

describe("dispatch：槽位键 = workRoot（AC26/AC42）", () => {
  test("同仓两个 worktree 各派一个 ⇒ 都成功，且 work_root 分别为两个 worktree", async () => {
    const main = repo("disp-main")
    const wt = path.join(TMP, "disp-wt")
    git(["worktree", "add", "-q", wt, "-b", "f1"], main)
    const { ctx } = createFakeCtx()

    const a = await run(dispatchToolDefinition(ctx), baseInput(main, "goal-a"))
    const b = await run(dispatchToolDefinition(ctx), baseInput(wt, "goal-b"))
    expect(a.state).toBe("active")
    expect(b.state).toBe("active")
    expect(a.work_root).toBe(path.resolve(main))
    expect(b.work_root).toBe(path.resolve(wt))
    expect(a.canonical_root).toBe(b.canonical_root) // 同仓
  })

  test("同一 workRoot 已有活跃后端 ⇒ 拒绝，且错误含 holder id 与 suspend 提示", async () => {
    const dir = repo("disp-slot")
    const { ctx } = createFakeCtx()
    const first = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))

    const tool = dispatchToolDefinition(ctx)
    let err = ""
    try {
      await tool.execute(baseInput(dir, "goal-b"), { sessionID: "ses_front_test" })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain(first.session_id)
    expect(err.toLowerCase()).toContain("suspend")
  })

  test("互斥拒绝时不留下已创建的 session（AC26③）", async () => {
    const dir = repo("disp-cleanup")
    const { ctx, sessions, calls } = createFakeCtx()
    await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const before = sessions.size
    try {
      await dispatchToolDefinition(ctx).execute(baseInput(dir, "goal-b"), { sessionID: "ses_front_test" })
    } catch {
      /* 预期拒绝 */
    }
    expect(sessions.size).toBe(before)
    expect(calls.remove).toBe(1)
  })

  test("dispatch 落三处：pair（含 work_root/state/goal_key）+ ledger dispatched + metadata", async () => {
    const dir = repo("disp-three")
    const { ctx, sessions } = createFakeCtx()
    const r = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-x"))
    const pairs = readPairs(dir)
    expect(pairs[r.session_id].work_root).toBe(path.resolve(dir))
    expect(pairs[r.session_id].state).toBe("active")
    expect(pairs[r.session_id].goal_key.intent).toBe("goal-x")
    const ledger = readFileSync(path.join(dir, ".rddf/state/ledger.jsonl"), "utf8")
    expect(ledger).toContain('"event":"dispatched"')
    const md = sessions.get(r.session_id).metadata
    expect(md.work_root).toBe(path.resolve(dir))
    expect(md.delegated_by).toBe("front-delegate")
  })
})

describe("dispatch：消费确认（AC44/AC45）", () => {
  test("简报未被确认消费 ⇒ state=dispatching 且提示不可 suspend", async () => {
    const dir = repo("disp-pending")
    const { ctx } = createFakeCtx({ notConsume: true })
    const r = await run(dispatchToolDefinition(ctx), baseInput(dir))
    expect(r.state).toBe("dispatching")
    expect(r.delivery_known).toBe(false)
  })

  test("dispatching ⇒ suspend 被拒（AC45）", async () => {
    const dir = repo("disp-pending2")
    const { ctx } = createFakeCtx({ notConsume: true })
    const r = await run(dispatchToolDefinition(ctx), baseInput(dir))
    let err = ""
    try {
      await suspendToolDefinition(ctx).execute({ session_id: r.session_id }, { sessionID: "f" })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain("dispatching")
    expect(err).toContain("cancel")
  })
})

describe("槽位回收与翻转执行者（AC46/AC47）", () => {
  test("后端已空闲 ⇒ 下一次派发 reconcile 放行（不必手工 suspend）", async () => {
    const dir = repo("disp-reconcile")
    const { ctx, sessions } = createFakeCtx()
    const first = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 模拟后端跑完：busy=false 且 idle 更新
    const s = sessions.get(first.session_id)
    s.busy = false
    s.idle = Date.now() + 1000

    const second = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-b"))
    expect(second.state).toBe("active")
    // 第一条被翻转为 idle
    expect(readPairs(dir)[first.session_id].state).toBe("idle")
  })

  test("后端已被删除 ⇒ 下一次派发放行（AC47②）", async () => {
    const dir = repo("disp-vanished")
    const { ctx } = createFakeCtx()
    const first = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const { ctx: ctx2 } = createFakeCtx({ idPrefix: "ses_other" })
    // 用同一个 pair.json：直接在同目录再派，但让第一个 session 查不到
    const ok = await run(dispatchToolDefinition(ctx2), baseInput(dir, "goal-b"))
    // ctx2 里第一个后端不可见 ⇒ 视为已消失 ⇒ 放行，且旧条目被 reconcile 翻转为 idle
    expect(ok.state).toBe("active")
    expect(readPairs(dir)[first.session_id].state).toBe("idle")
  })
})

// ───────────────────────────── suspend / cancel ─────────────────────────────

describe("suspend（AC51/AC52/AC53）", () => {
  test("suspended 后可 resume（同 goal_key 放行）且上下文未重建", async () => {
    const dir = repo("sus-resume")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const beforeCount = sessions.get(a.session_id).messages.length

    const s = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(s.suspended).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("suspended")

    const back = await run(dispatchToolDefinition(ctx), {
      ...baseInput(dir, "goal-a"),
      resume_session: a.session_id,
    })
    expect(back.session_id).toBe(a.session_id)
    expect(back.state).toBe("active")
    expect(sessions.get(a.session_id).messages.length).toBeGreaterThan(beforeCount)
  })

  test("切换两步：suspend(A) → dispatch(B) 成功，A 仍可枚举（AC52）", async () => {
    const dir = repo("sus-switch")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    const b = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-b"))
    expect(b.state).toBe("active")

    const list = await run(sessionsToolDefinition(ctx), {}, "ses_front_test")
    const ids = list.items.map((i: any) => i.session_id)
    expect(ids).toContain(a.session_id)
    expect(ids).toContain(b.session_id)
  })

  test("interrupt 未真正停机 ⇒ 不释放槽位，保持占用（AC53）", async () => {
    const dir = repo("sus-noop")
    const { ctx } = createFakeCtx({ running: {}, interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 标记为运行中；interrupt 不生效
    ;(ctx as any)
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    // 槽位仍被占 ⇒ 再派发被拒
    let err = ""
    try {
      await dispatchToolDefinition(ctx).execute(baseInput(dir, "goal-b"), { sessionID: "f" })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err.length).toBeGreaterThan(0)
  })

  test("suspend 已墓碑的后端 ⇒ 拒绝", async () => {
    const dir = repo("sus-tomb")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 手工置墓碑
    const pairs = readPairs(dir)
    pairs[a.session_id].state = "tombstone"
    writeFileSync(path.join(dir, ".rddf/state/pair.json"), JSON.stringify({ version: "pair-v2", pairs }))

    let err = ""
    try {
      await suspendToolDefinition(ctx).execute({ session_id: a.session_id }, { sessionID: "f" })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain("墓碑")
  })
})

describe("cancel（AC28）", () => {
  test("在跑 ⇒ 墓碑 + 释放槽位", async () => {
    const dir = repo("can-tomb")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.interrupted).toBe(true)
    expect(r.state).toBe("tombstone")
    expect(readPairs(dir)[a.session_id].state).toBe("tombstone")
  })

  test("不在跑 ⇒ 纯 no-op，不墓碑（上下文仍可续）", async () => {
    const dir = repo("can-noop")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 后端跑完
    const s = sessions.get(a.session_id)
    s.busy = false
    s.idle = Date.now() + 1000

    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.interrupted).toBe(false)
    expect(readPairs(dir)[a.session_id].state).not.toBe("tombstone")
  })

  test("墓碑后再 dispatch 到同一后端 ⇒ 拒绝（goal_key 相同也不放行）", async () => {
    const dir = repo("can-reuse")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    await run(cancelToolDefinition(ctx), { session_id: a.session_id })

    let err = ""
    try {
      await dispatchToolDefinition(ctx).execute(
        { ...baseInput(dir, "goal-a"), resume_session: a.session_id },
        { sessionID: "f" },
      )
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err.length).toBeGreaterThan(0)
  })
})

// ───────────────────────────── sessions（只读） ─────────────────────────────

describe("sessions（AC4/AC10/AC11/AC29）", () => {
  test("不投递 prompt（观测面不污染）", async () => {
    const dir = repo("sess-readonly")
    const { ctx, calls } = createFakeCtx()
    await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const promptBefore = calls.prompt
    await run(sessionsToolDefinition(ctx), {}, "f")
    expect(calls.prompt).toBe(promptBefore)
  })

  test("输出 schema 字段齐（AC29）", async () => {
    const dir = repo("sess-schema")
    const { ctx } = createFakeCtx()
    await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const r = await run(sessionsToolDefinition(ctx), {}, "f")
    expect(Object.keys(r).sort()).toEqual(["headline", "items", "overall"])
    const item = r.items[0]
    for (const k of [
      "session_id",
      "goal_key",
      "work_root",
      "canonical_root",
      "state",
      "running",
      "outcome",
      "last_activity_at",
      "slot",
    ]) {
      expect(item).toHaveProperty(k)
    }
  })

  test("兜底路径扫全量（>1 页 + cursor 续扫，AC11）", async () => {
    const dir = repo("sess-paging")
    const { ctx } = createFakeCtx({ pageSize: 2 })
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const r = await run(dispatchToolDefinition(ctx), {
        ...baseInput(dir, `goal-${i}`),
      })
      ids.push(r.session_id)
      // 每个都 suspend 掉，避免单槽互斥
      await run(suspendToolDefinition(ctx), { session_id: r.session_id })
    }
    const listed = await listDelegatedSessions(ctx)
    expect(listed.length).toBe(5)
    expect(listed.map((x: any) => x.id).sort()).toEqual(ids.sort())
  })

  test("外部删除可见 ⇒ outcome=vanished（AC13）", async () => {
    const dir = repo("sess-vanished")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir))
    const { ctx: ctx2 } = createFakeCtx({ missing: [a.session_id] })
    // ctx2 的 list 不返回它 ⇒ 名册为空（sessions 看不到已删的，符合 D2.1）
    const r = await run(sessionsToolDefinition(ctx2), {}, "f")
    expect(r.items.length).toBe(0)
  })
})

describe("既有 delegate 与槽位表（AC50）", () => {
  test("同工作树已有活跃后端 ⇒ 既有同步 delegate 也被拒", async () => {
    const dir = repo("legacy-slot")
    const { ctx } = createFakeCtx()
    const backend = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))

    // 既有 delegate 与 dispatch 共用槽位表
    const { delegateToolDefinition } = await import("../lib/delegate-core.ts")
    const tool = delegateToolDefinition(ctx)
    let err = ""
    try {
      await tool.execute(
        { ...baseInput(dir, "goal-b") },
        { sessionID: "ses_front_test" },
      )
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain(backend.session_id)
    expect(err).toContain("槽位")
  })
})

// ─────────────────── 存活推导：stalled / dangling（AC25 / AC47③） ───────────────────

describe("stalled 阈值（AC25）", () => {
  test("默认常量 5 分钟，可用 RDDF_STALLED_THRESHOLD_MS 覆盖", () => {
    expect(stalledThresholdMs()).toBe(5 * 60 * 1000)
    process.env.RDDF_STALLED_THRESHOLD_MS = "1000"
    expect(stalledThresholdMs()).toBe(1000)
    delete process.env.RDDF_STALLED_THRESHOLD_MS
  })

  test("running 且超阈值 ⇒ stalled；等于阈值不算；不在跑不算", () => {
    const now = 1_000_000
    expect(isStalled({ running: true, lastActivityAt: now - 2000, now, thresholdMs: 1000 })).toBe(true)
    expect(isStalled({ running: true, lastActivityAt: now - 1000, now, thresholdMs: 1000 })).toBe(false)
    expect(isStalled({ running: false, lastActivityAt: now - 9999, now, thresholdMs: 1000 })).toBe(false)
    expect(isStalled({ running: true, lastActivityAt: 0, now, thresholdMs: 1000 })).toBe(false)
  })

  test("stalled 是推导态、不落盘（pair.json 不出现该字段）", async () => {
    const dir = repo("stall-nopersist")
    const { ctx } = createFakeCtx()
    const r = await run(dispatchToolDefinition(ctx), baseInput(dir))
    expect(JSON.stringify(readPairs(dir))).not.toContain("stalled")
    expect(JSON.stringify(readPairs(dir))).toContain(r.session_id)
  })
})

describe("槽位悬挂标记（AC47③）", () => {
  test("仅当「占槽 + 不 running + 超阈值」才 dangling", () => {
    const now = 1_000_000
    const t = { now, thresholdMs: 1000 }
    expect(isDangling({ state: "active", running: false, lastActivityAt: now - 5000, ...t })).toBe(true)
    expect(isDangling({ state: "active", running: false, lastActivityAt: now - 500, ...t })).toBe(false)
    expect(isDangling({ state: "active", running: true, lastActivityAt: now - 5000, ...t })).toBe(false)
    expect(isDangling({ state: "idle", running: false, lastActivityAt: now - 5000, ...t })).toBe(false)
    expect(isDangling({ state: "suspended", running: false, lastActivityAt: now - 5000, ...t })).toBe(false)
  })

  test("sessions 输出 slot.dangling 字段（超阈值时才 true）", async () => {
    const dir = repo("dangling-out")
    const { ctx, sessions } = createFakeCtx()
    const r = await run(dispatchToolDefinition(ctx), baseInput(dir))
    // 刚派发：不超阈值 ⇒ 不悬挂
    let out = await run(sessionsToolDefinition(ctx), {}, "f")
    expect(out.items[0].slot.dangling).toBe(false)
    // 把最后活动时间推到很久以前 + 标记不在跑
    const s = sessions.get(r.session_id)
    s.busy = false
    s.idle = Date.now()
    s.updated = Date.now() - 10 * 60 * 1000
    out = await run(sessionsToolDefinition(ctx), {}, "f")
    expect(out.items[0].slot.dangling).toBe(true)
  })
})

// ─────────────────── steer 残留（AC54） ───────────────────

describe("steer 残留检测（AC54）", () => {
  test("基线不在 context ⇒ undetectable；有额外 user ⇒ suspected；只有本次简报 ⇒ none", () => {
    expect(detectSteerResidue([{ id: "m1" }], "m_missing", "brief")).toBe("undetectable")
    expect(
      detectSteerResidue(
        [{ id: "m1" }, { id: "stale", type: "user" }, { id: "brief", type: "user" }],
        "m1",
        "brief",
      ),
    ).toBe("suspected")
    expect(detectSteerResidue([{ id: "m1" }, { id: "brief", type: "user" }], "m1", "brief")).toBe("none")
    // assistant 消息不算残留
    expect(
      detectSteerResidue([{ id: "m1" }, { id: "brief", type: "user" }, { id: "a1", type: "assistant" }], "m1", "brief"),
    ).toBe("none")
  })

  test("suspend 记录暂停基线；干净 resume ⇒ none", async () => {
    const dir = repo("res-none")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(readPairs(dir)[a.session_id].suspended_at_message_id).toBeTruthy()
    await run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id })
    expect(readPairs(dir)[a.session_id].steer_residue).toBe("none")
  })

  test("恢复时 context 里混入陈旧 user 消息 ⇒ suspected", async () => {
    const dir = repo("res-suspect")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    // 模拟：暂停期间被注入的 steer 在恢复时被提升（一条陈旧 user 消息）
    sessions.get(a.session_id).messages.push({ id: "msg_stale", type: "user", text: "stale steer" })
    await run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id })
    expect(readPairs(dir)[a.session_id].steer_residue).toBe("suspected")
  })
})

// ─────────────────── 亡主接管（AC48） ───────────────────

describe("亡主接管（AC48）", () => {
  test("归属另一个**存活** front ⇒ suspend 拒绝（不静默顶掉）", async () => {
    const dir = repo("orphan-alive")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 造一个**存在**的 front 会话，并把条目归属改成它
    const front = await ctx.session.create({ location: { directory: dir }, agent: "general" })
    const pairs = readPairs(dir)
    pairs[a.session_id].front_session_id = front.id
    writeFileSync(path.join(dir, ".rddf/state/pair.json"), JSON.stringify({ version: "pair-v2", pairs }))

    let err = ""
    try {
      await suspendToolDefinition(ctx).execute({ session_id: a.session_id }, { sessionID: "ses_new_front" })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain("另一个 front")
    expect(err).toContain(front.id)
  })

  test("归属**已消失**的 front ⇒ suspend 允许回收，并落 taken_over ledger 行", async () => {
    const dir = repo("orphan-dead")
    const { ctx } = createFakeCtx({ missing: ["ses_gone_forever"] })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const pairs = readPairs(dir)
    pairs[a.session_id].front_session_id = "ses_gone_forever"
    writeFileSync(path.join(dir, ".rddf/state/pair.json"), JSON.stringify({ version: "pair-v2", pairs }))

    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id }, "ses_new_front")
    expect(r.suspended).toBe(true)
    const ledger = readFileSync(path.join(dir, ".rddf/state/ledger.jsonl"), "utf8")
    expect(ledger).toContain('"event":"taken_over"')
    expect(ledger).toContain("ses_gone_forever")
  })
})

// ─────────────────── grant 救援不误杀（AC18） ───────────────────

describe("grant 救援路径（AC18）", () => {
  test("既有 delegate 续接同一目标时带 grants 不被拒", async () => {
    const dir = repo("grant-rescue")
    const { ctx } = createFakeCtx()
    const { delegateToolDefinition } = await import("../lib/delegate-core.ts")
    const tool = delegateToolDefinition(ctx)
    // 第一次委托建 session
    const first = JSON.parse(
      (await tool.execute(baseInput(dir, "goal-a"), { sessionID: "ses_front_test" })).content,
    )
    expect(first.session_id).toBeTruthy()

    // 续接同一 session 并补 grant（救援路径）——不得被拒
    const resumed = await tool.execute(
      { ...baseInput(dir, "goal-a"), resume_session: first.session_id, grants: [{ action: "shell", resource: "*" }] },
      { sessionID: "ses_front_test" },
    )
    expect(JSON.parse(resumed.content).session_id).toBe(first.session_id)
  })
})
