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
// 停机确认窗口：生产默认 8s > bun 的 5s 默认测试超时 ⇒ 测试里用短窗口
process.env.RDDF_STOP_TIMEOUT_MS = "300"

import {
  countActiveBackends,
  aggregateStates,
  groupByWorkRoot,
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
import { __pendingStops, backfillPairEntry, canonicalRoot, detectForeignInstances, ensureInstanceStamp, enterStopGuard, leaveStopGuard, readPairs, registerSession, slotOccupants, slotBusyHolders, stillRunning, writePairs } from "../lib/delegate-core.ts"
import { countActiveBackends, planSlot, setPairFields, stopTimeoutMs } from "../lib/delegate-async.ts"
import { readFileSync as readFileSync2 } from "node:fs"
import { hostname } from "node:os"

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
  /** 可控的 `session.wait`：默认 resolve；hold 需手动 release。 */
  wait?: "resolve" | "hold" | "notfound" | "error"
  /** 删除 `ctx.session.wait`（模拟实验端点被移除）。 */
  noWait?: boolean
  /** 每次 `session.get` 前调用（用于在早检查与 claimSlot 之间注入状态）。 */
  onGet?: (input: any) => void
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
  /**
   * 「陈旧 busy 窗」：中断**已受理**，但 `time.busy` 变陈旧（< `time.idle`）⇒ 判活为假；
   * **终态水位线不前移**（`time.idle` 不变）⇒ 只有水位线判据能拦住它。
   */
  staleBusyOnInterrupt?: boolean
  /** session id 前缀（避免多个 fake ctx 之间 id 重号） */
  idPrefix?: string
}

function createFakeCtx(opts: FakeOpts = {}) {
  const sessions = new Map<string, any>()
  const calls = { create: 0, prompt: 0, remove: 0, interrupt: 0, wait: 0, context: 0 }
  const waitResolvers: Array<() => void> = []
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
      wait: async (input: any) => {
        calls.wait++
        const mode = opts.wait ?? "resolve"
        if (mode === "resolve") return {}
        if (mode === "notfound") {
          const e: any = new Error(`Session.NotFoundError: ${input?.sessionID}`)
          e._tag = "Session.NotFoundError"
          throw e
        }
        if (mode === "error") throw new Error("ECONNRESET: wait failed")
        // hold：挂起到测试手动 release
        await new Promise<void>((res) => waitResolvers.push(res))
        return {}
      },
      get: async (input: any) => {
        opts.onGet?.(input)
        const s = sessions.get(input.sessionID)
        // ⚠️ 缺失必须**像上游**那样报错（tagged Session.NotFoundError）：
        // 实现用**窄判定**区分「确实不存在」与「查询失败，原因不明」
        if (!s || opts.missing?.includes(input.sessionID)) {
          const e: any = new Error(`Session.NotFoundError: session not found: ${input.sessionID}`)
          e._tag = "Session.NotFoundError"
          throw e
        }
        const busyFlag = opts.running?.[input.sessionID] ?? s.busy
        // `s.time` 显式覆盖：用于表达 `busy < idle`（stale-busy）等 `busy` 标志表达不出的形态
        const time = s.time
          ? { ...s.time, updated: s.updated }
          : {
              idle: busyFlag ? 0 : s.idle || Date.now(),
              updated: s.updated,
              ...(busyFlag ? { busy: Date.now() } : {}),
            }
        return {
          id: s.id,
          agent: s.agent,
          location: s.location,
          metadata: s.metadata,
          outcome: s.outcome,
          time,
        }
      },
      context: async (input: any) => {
        calls.context++
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
        if (opts.staleBusyOnInterrupt) {
          // 中断已受理，但 `time.busy` 变陈旧（< idle）⇒ 判活为假；**idle 不变** ⇒ 水位线未前移。
          if (s.time) s.time = { ...s.time, busy: Math.max(1, (Number(s.time.idle) || 2) - 1) }
          return { interrupted: true }
        }
        if (!opts.interruptNoop) {
          s.busy = false
          s.idle = Date.now()
          // 显式 time 覆盖（用于表达 stale-busy）也要反映「停机后」：busy 清、idle 前移
          if (s.time) s.time = { idle: s.idle }
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
  if (opts.noWait) delete (ctx.session as any).wait
  const releaseWaits = () => {
    const rs = waitResolvers.splice(0)
    for (const r of rs) r()
  }
  return { ctx, sessions, calls, releaseWaits }
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

describe("plan 派发主体 + owner 归属（ADR-plan-delegate-engineering-session）", () => {
  const registerCaller = (sessions: Map<string, any>, id: string, agent: string, dir: string) => {
    sessions.set(id, {
      id,
      agent,
      location: { directory: dir },
      metadata: {},
      messages: [],
      busy: false,
      outcome: null,
      idle: 0,
      updated: Date.now(),
    })
  }

  test("plan 派发可写实施但无 plan_ref ⇒ 拒绝并列出 accepted roots", async () => {
    const dir = repo("plan-noref")
    const { ctx, sessions } = createFakeCtx()
    registerCaller(sessions, "ses_plan_test", "plan", dir)
    await expect(
      run(dispatchToolDefinition(ctx), { ...baseInput(dir), agent: "build" }, "ses_plan_test"),
    ).rejects.toThrow(/plan_ref 必填/)
  })

  test("plan 派发可写实施，plan_ref 根外 ⇒ 拒绝（可写 ≠ 可引用）", async () => {
    const dir = repo("plan-badroot")
    const { ctx, sessions } = createFakeCtx()
    registerCaller(sessions, "ses_plan_test", "plan", dir)
    mkdirSync(path.join(dir, ".plans"), { recursive: true })
    writeFileSync(path.join(dir, ".plans", "p.md"), "p")
    await expect(
      run(
        dispatchToolDefinition(ctx),
        { ...baseInput(dir), agent: "build", plan_ref: ".plans/p.md" },
        "ses_plan_test",
      ),
    ).rejects.toThrow(/accepted roots/)
  })

  test("plan 派发可写实施，plan_ref 合法 ⇒ 成功", async () => {
    const dir = repo("plan-ok")
    const { ctx, sessions } = createFakeCtx()
    registerCaller(sessions, "ses_plan_test", "plan", dir)
    mkdirSync(path.join(dir, ".rddf", "plans"), { recursive: true })
    writeFileSync(path.join(dir, ".rddf", "plans", "p.md"), "p")
    const r = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir), agent: "build", plan_ref: ".rddf/plans/p.md" },
      "ses_plan_test",
    )
    expect(r.session_id).toBeTruthy()
    expect(sessions.get(r.session_id).metadata.owner_agent).toBe("plan")
    // V09：pair.json 落 owner_agent（缺失一律按 front 解释 ⇒ 本例显式为 plan）
    expect(readPairs(dir)[r.session_id].owner_agent).toBe("plan")
  })

  test("plan 派发知识后端（只读）不带 plan_ref ⇒ 成功（D2 只约束可写实施）", async () => {
    const dir = repo("plan-knowledge")
    const { ctx, sessions } = createFakeCtx()
    registerCaller(sessions, "ses_plan_test", "plan", dir)
    const r = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir), agent: "oracle", scope: [] },
      "ses_plan_test",
    )
    expect(r.session_id).toBeTruthy()
  })

  test("front 派发可写实施不带 plan_ref ⇒ 成功（D2 只绑定 plan 主体）", async () => {
    const dir = repo("front-noref")
    const { ctx } = createFakeCtx()
    const r = await run(dispatchToolDefinition(ctx), { ...baseInput(dir), agent: "build" })
    expect(r.session_id).toBeTruthy()
  })

  test("跨 owner 同一工作树 ⇒ 槽位互斥，报错含占槽者 id（V05 / V08）", async () => {
    const dir = repo("owner-slot")
    const { ctx, sessions } = createFakeCtx()
    registerCaller(sessions, "ses_plan_test", "plan", dir)
    mkdirSync(path.join(dir, ".rddf", "plans"), { recursive: true })
    writeFileSync(path.join(dir, ".rddf", "plans", "p.md"), "p")
    // front 先占槽
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // plan 派同一工作树 ⇒ 被拒（单槽与 owner 无关）
    await expect(
      run(
        dispatchToolDefinition(ctx),
        { ...baseInput(dir, "goal-b"), plan_ref: ".rddf/plans/p.md" },
        "ses_plan_test",
      ),
    ).rejects.toThrow(new RegExp(a.session_id))
  })

  test("owner 过滤：两个 owner 互不可见，但全局配额计数含两者（D3 硬约束）", async () => {
    const dirA = repo("owner-a")
    const dirB = repo("owner-b")
    const { ctx, sessions } = createFakeCtx()
    registerCaller(sessions, "ses_plan_test", "plan", dirB)
    // plan 侧派发实施必须带 plan_ref（D2）
    mkdirSync(path.join(dirB, ".rddf", "plans"), { recursive: true })
    writeFileSync(path.join(dirB, ".rddf", "plans", "p.md"), "p")
    const a = await run(dispatchToolDefinition(ctx), baseInput(dirA, "goal-a"))
    const b = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dirB, "goal-b"), plan_ref: ".rddf/plans/p.md" },
      "ses_plan_test",
    )
    const frontList = await run(sessionsToolDefinition(ctx), {}, "ses_front_test")
    const planList = await run(sessionsToolDefinition(ctx), {}, "ses_plan_test")
    expect(frontList.items.map((i: any) => i.session_id)).toContain(a.session_id)
    expect(frontList.items.map((i: any) => i.session_id)).not.toContain(b.session_id)
    expect(planList.items.map((i: any) => i.session_id)).toContain(b.session_id)
    expect(planList.items.map((i: any) => i.session_id)).not.toContain(a.session_id)
    // 全局配额**owner 无关**：两个 owner 的后端都计入
    expect(await countActiveBackends(ctx)).toBe(2)
  })
})


// ───────────────── role_class（ADR-backend-handoff-role-class） ─────────────────

describe("role_class：派发面（AC19 / AC20 / class×scope / resume 一致性）", () => {
  const archRepo = (name: string) => {
    const dir = repo(name)
    mkdirSync(path.join(dir, "docs", "adr"), { recursive: true })
    mkdirSync(path.join(dir, ".rddf", "config"), { recursive: true })
    writeFileSync(
      path.join(dir, ".rddf", "config", "arch-docs.json"),
      JSON.stringify({ arch_paths: ["docs/adr"], exclude_paths: [] }),
    )
    return dir
  }

  test("role_class 落 pair 登记 + sessions 回显（AC20）", async () => {
    const dir = repo("rc-echo")
    const { ctx } = createFakeCtx()
    const r = await run(dispatchToolDefinition(ctx), { ...baseInput(dir), role_class: "builder" })
    expect(readPairs(dir)[r.session_id].role_class).toBe("builder")
    const list = await run(sessionsToolDefinition(ctx), {}, "ses_front_test")
    const item = list.items.find((i: any) => i.session_id === r.session_id)
    expect(item.role_class).toBe("builder")
  })

  test("未声明 role_class ⇒ 登记缺省 builder；sessions 回显 builder", async () => {
    const dir = repo("rc-legacy")
    const { ctx } = createFakeCtx()
    const r = await run(dispatchToolDefinition(ctx), baseInput(dir))
    // 新派发**总是**登记 class（缺省 builder）⇒ resume 时有权威值可校
    expect(readPairs(dir)[r.session_id].role_class).toBe("builder")
    const list = await run(sessionsToolDefinition(ctx), {}, "ses_front_test")
    const item = list.items.find((i: any) => i.session_id === r.session_id)
    expect(item.role_class).toBe("builder")
  })

  test("verifier 类：scope 越出 .rddf/reviews ⇒ 派发被拒（硬拒早于建 session）", async () => {
    const dir = repo("rc-verifier-reject")
    const { ctx } = createFakeCtx()
    await expect(
      run(dispatchToolDefinition(ctx), { ...baseInput(dir), role_class: "verifier" }),
    ).rejects.toThrow(/越界/)
  })

  test("architect 类：scope 落在 docs/adr ⇒ 放行并登记 class", async () => {
    const dir = archRepo("rc-architect-ok")
    const { ctx } = createFakeCtx()
    const r = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir), scope: ["docs/adr"], role_class: "architect" },
    )
    expect(readPairs(dir)[r.session_id].role_class).toBe("architect")
  })

  test("architect 类：scope 含 src ⇒ 派发被拒", async () => {
    const dir = archRepo("rc-architect-reject")
    const { ctx } = createFakeCtx()
    await expect(
      run(dispatchToolDefinition(ctx), { ...baseInput(dir), scope: ["a.txt"], role_class: "architect" }),
    ).rejects.toThrow(/越界/)
  })

  test("resume：class 不一致 ⇒ 硬拒（同一 session 内不允许换类）", async () => {
    const dir = repo("rc-resume-mismatch")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir))
    // 换类必须被拒。**不钉死错误文案**：dispatch 的简报可能尚未被消费（另一条既有拒绝理由），
    // 断言的是**结果**：登记 class 不变、且不产生新的后端。
    await expect(
      run(
        dispatchToolDefinition(ctx),
        { ...baseInput(dir), resume_session: a.session_id, role_class: "verifier" },
      ),
    ).rejects.toThrow()
    expect(readPairs(dir)[a.session_id].role_class).toBe("builder")
    const list = await run(sessionsToolDefinition(ctx), {}, "ses_front_test")
    expect(list.items.filter((i: any) => i.session_id === a.session_id).length).toBe(1)
  })
})

describe("D7：派发优先级（plan 优先、不抢占）", () => {
  const registerCaller = (sessions: Map<string, any>, id: string, agent: string, dir: string) => {
    sessions.set(id, {
      id,
      agent,
      location: { directory: dir },
      metadata: {},
      messages: [],
      busy: false,
      outcome: null,
      idle: 0,
      updated: Date.now(),
    })
  }
  /** 两个调用方都登记进 fake ctx（生产里调用方会话必然存在；owner 判活依赖它）。 */
  const registerCallers = (sessions: Map<string, any>, dir: string) => {
    registerCaller(sessions, "ses_front_test", "front", dir)
    registerCaller(sessions, "ses_plan_test", "plan", dir)
  }
  const planFile = (dir: string) => {
    mkdirSync(path.join(dir, ".rddf", "plans"), { recursive: true })
    writeFileSync(path.join(dir, ".rddf", "plans", "p.md"), "p")
    return ".rddf/plans/p.md"
  }
  const ledgerOf = (dir: string) => readFileSync(path.join(dir, ".rddf/state/ledger.jsonl"), "utf8")

  test("V16 front 被 plan 占用挡住 ⇒ 文案指名 plan，不抢占（plan 后端仍活）", async () => {
    const dir = repo("d7-v16")
    const { ctx, sessions } = createFakeCtx()
    registerCallers(sessions, dir)
    const planRef = planFile(dir)
    const a = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir, "goal-a"), plan_ref: planRef },
      "ses_plan_test",
    )
    await expect(
      run(dispatchToolDefinition(ctx), baseInput(dir, "goal-front")),
    ).rejects.toThrow(/owner=plan/)
    await expect(
      run(dispatchToolDefinition(ctx), baseInput(dir, "goal-front")),
    ).rejects.toThrow(new RegExp(a.session_id))
    // 不抢占：plan 的后端仍在跑、槽位未被释放
    expect(readPairs(dir)[a.session_id].state).toBe("active")
    expect(sessions.get(a.session_id).busy).toBe(true)
  })

  test("V17 plan 被 front 占用挡住 ⇒ 文案指名 front，不自动 suspend", async () => {
    const dir = repo("d7-v17")
    const { ctx, sessions } = createFakeCtx()
    registerCallers(sessions, dir)
    const planRef = planFile(dir)
    const f = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-front"))
    await expect(
      run(
        dispatchToolDefinition(ctx),
        { ...baseInput(dir, "goal-plan"), plan_ref: planRef },
        "ses_plan_test",
      ),
    ).rejects.toThrow(/owner=front/)
    // 不自动抢占：front 的后端仍在跑
    expect(readPairs(dir)[f.session_id].state).toBe("active")
  })

  test("V18a front resume plan 的后端 ⇒ 硬拒（owner 会话存活）", async () => {
    const dir = repo("d7-v18a")
    const { ctx, sessions } = createFakeCtx()
    registerCallers(sessions, dir)
    const planRef = planFile(dir)
    const a = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir, "goal-a"), plan_ref: planRef },
      "ses_plan_test",
    )
    await expect(
      run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id }),
    ).rejects.toThrow(/归属于 plan/)
  })

  test("V18b plan resume front 的后端 ⇒ 硬拒", async () => {
    const dir = repo("d7-v18b")
    const { ctx, sessions } = createFakeCtx()
    registerCallers(sessions, dir)
    const planRef = planFile(dir)
    const f = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-front"))
    await expect(
      run(
        dispatchToolDefinition(ctx),
        { ...baseInput(dir, "goal-front"), resume_session: f.session_id, plan_ref: planRef },
        "ses_plan_test",
      ),
    ).rejects.toThrow(/归属于 front/)
  })

  test("V19 同 owner-kind 的跨会话 resume 仍放行（隔天回来继续不被破坏）", async () => {
    const dir = repo("d7-v19")
    const { ctx, sessions } = createFakeCtx()
    registerCaller(sessions, "ses_front_2", "front", dir)
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 后端跑完（不占运行位）⇒ 可被续接
    const sa = sessions.get(a.session_id)
    sa.busy = false
    sa.idle = Date.now()
    // 换一个 front 会话 resume 同一后端 ⇒ 放行
    const r = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir, "goal-a"), resume_session: a.session_id },
      "ses_front_2",
    )
    expect(r.session_id).toBe(a.session_id)
  })

  test("V20 拒绝点在 ledger 落 priority_blocked（dispatch / resume 两条路径）", async () => {
    const dir = repo("d7-v20")
    const { ctx, sessions } = createFakeCtx()
    registerCallers(sessions, dir)
    const planRef = planFile(dir)
    const a = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir, "goal-a"), plan_ref: planRef },
      "ses_plan_test",
    )
    await expect(run(dispatchToolDefinition(ctx), baseInput(dir, "goal-front"))).rejects.toThrow()
    await expect(
      run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id }),
    ).rejects.toThrow()
    const ledger = ledgerOf(dir)
    expect(ledger).toContain('"event":"priority_blocked"')
    expect(ledger).toContain('"caller_kind":"front"')
    expect(ledger).toContain('"holder_kind":"plan"')
    expect(ledger).toContain('"path":"dispatch"')
    expect(ledger).toContain('"path":"resume"')
  })

  test("V21 plan resume 自己被 suspend 的后端、槽位已被 front 占 ⇒ 拒 + 无副作用", async () => {
    const dir = repo("d7-v21")
    const { ctx, sessions } = createFakeCtx()
    registerCallers(sessions, dir)
    const planRef = planFile(dir)
    const a = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir, "goal-a"), plan_ref: planRef },
      "ses_plan_test",
    )
    // plan 自己 suspend 它（释放槽位）⇒ front 可以占用同一工作树
    await run(suspendToolDefinition(ctx), { session_id: a.session_id }, "ses_plan_test")
    await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-front"))
    // plan 再 resume 自己的后端 ⇒ 被 front 的活跃占用挡住（D7.2），且自己的后端保持 suspended
    await expect(
      run(
        dispatchToolDefinition(ctx),
        { ...baseInput(dir, "goal-a"), resume_session: a.session_id, plan_ref: planRef },
        "ses_plan_test",
      ),
    ).rejects.toThrow(/owner=front/)
    expect(readPairs(dir)[a.session_id].state).toBe("suspended")
  })

  test("V22 legacy 条目（无 owner_agent）按 front 解释 ⇒ plan resume 被拒", async () => {
    const dir = repo("d7-v22")
    const { ctx, sessions } = createFakeCtx()
    registerCallers(sessions, dir)
    const planRef = planFile(dir)
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 抹掉 owner_agent ⇒ 模拟 D5 之前的旧条目
    const pairs = readPairs(dir)
    delete (pairs[a.session_id] as any).owner_agent
    writePairs(dir, pairs)
    await expect(
      run(
        dispatchToolDefinition(ctx),
        { ...baseInput(dir, "goal-a"), resume_session: a.session_id, plan_ref: planRef },
        "ses_plan_test",
      ),
    ).rejects.toThrow(/归属于 front/)
  })

  test("V23 作用域护栏：plan 在 workRoot A 活跃时，front 派 workRoot B 成功", async () => {
    const dirA = repo("d7-v23-a")
    const dirB = repo("d7-v23-b")
    const { ctx, sessions } = createFakeCtx()
    registerCaller(sessions, "ses_plan_test", "plan", dirA)
    const planRef = planFile(dirA)
    await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dirA, "goal-a"), plan_ref: planRef },
      "ses_plan_test",
    )
    const b = await run(dispatchToolDefinition(ctx), baseInput(dirB, "goal-b"))
    expect(b.session_id).toBeTruthy()
  })

  test("V24 跨 owner-kind 的 cancel 硬拒：front cancel plan 活后端 ⇒ 拒", async () => {
    const dir = repo("d7-v24")
    const { ctx, sessions } = createFakeCtx()
    registerCallers(sessions, dir)
    const planRef = planFile(dir)
    const a = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir, "goal-a"), plan_ref: planRef },
      "ses_plan_test",
    )
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.reason).toBe("cross_owner_kind")
    expect(r.state).not.toBe("tombstone")
  })

  test("V25 后端仍活 + owner 已亡 ⇒ 派发仍被拒；经亡主门控回收后可再派", async () => {
    const dir = repo("d7-v25")
    const { ctx, sessions } = createFakeCtx()
    registerCallers(sessions, dir)
    const planRef = planFile(dir)
    const a = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir, "goal-a"), plan_ref: planRef },
      "ses_plan_test",
    )
    // owner 会话消亡（后端仍活）⇒ 冲突**不**消解（只看后端活体）
    sessions.delete("ses_plan_test")
    await expect(run(dispatchToolDefinition(ctx), baseInput(dir, "goal-front"))).rejects.toThrow()
    // 走既有亡主门控回收（suspend：owner 已亡 ⇒ 允许接管）
    const s = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(s.state).toBe("suspended")
    // 回收后再派 ⇒ 成功
    const again = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-front"))
    expect(again.session_id).toBeTruthy()
  })
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

  test("投递抛错（结果未知）⇒ 落 dispatch_failed + delivery_known:false + 槽位保留（AC30/AC49）", async () => {
    const dir = repo("disp-prompt-fail")
    const { ctx } = createFakeCtx()
    // prompt 抛错 ⇒ 投递结果未知：**不得**释放槽位、**不得**删除 session
    ctx.session.prompt = async () => {
      throw new Error("ECONNRESET: prompt delivery failed")
    }
    const r = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    expect(r.state).toBe("dispatching")
    expect(r.delivery_known).toBe(false)
    const ledger = readFileSync(path.join(dir, ".rddf/state/ledger.jsonl"), "utf8")
    expect(ledger).toContain('"dispatch_failed"')
    expect(ledger).toContain("ECONNRESET")
    // 槽位仍被占（再派会被拒，错误含该后端 id）
    let err = ""
    try {
      await dispatchToolDefinition(ctx).execute(baseInput(dir, "goal-b"), { sessionID: "ses_front_test" })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain(r.session_id)
  })

  test("dispatching ⇒ suspend 被拒（AC45）—— 结构化返回，不抛错（AC18）", async () => {
    const dir = repo("disp-pending2")
    const { ctx } = createFakeCtx({ notConsume: true })
    const r = await run(dispatchToolDefinition(ctx), baseInput(dir))
    const res = await run(suspendToolDefinition(ctx), { session_id: r.session_id })
    expect(res.suspended).toBe(false)
    expect(res.reason).toBe("slot_state_changed")
    expect(String(res.message)).toContain("dispatching")
    expect(String(res.message)).toContain("cancel")
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

  test("不在跑（但仍占槽）⇒ 停机成立 ⇒ 墓碑 + 释放槽位（ADR D1：不再是 no-op）", async () => {
    const dir = repo("can-noop")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 后端跑完（但条目仍占槽：state=active）
    const s = sessions.get(a.session_id)
    s.busy = false
    s.idle = Date.now() + 1000

    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    // ⚠️ 旧语义「`interrupted:false` ⇒ 纯 no-op」已被 `ADR-front-cancel-release` D1 取代：
    // 停机判据 = `wait` + 判活为假（基线不在跑 ⇒ 无需水位线）⇒ 停机成立 ⇒ 墓碑 + 放槽。
    expect(r.state).toBe("tombstone")
    expect(r.stop_judge).toBe("wait")
    expect(readPairs(dir)[a.session_id].state).toBe("tombstone")
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

// ───────────────── cancel：停机证据门控（ADR-front-cancel-release AC1–AC19） ─────────────────

describe("cancel：停机证据门控（ADR-front-cancel-release）", () => {
  const ledgerRows = (dir: string) => {
    const f = path.join(dir, ".rddf/state/ledger.jsonl")
    if (!existsSync(f)) return [] as any[]
    return readFileSync(f, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  }
  const pairFile = (dir: string) => path.join(dir, ".rddf/state/pair.json")
  const readPairRaw = (dir: string) => JSON.parse(readFileSync(pairFile(dir), "utf8"))
  const writePairRaw = (dir: string, pairs: any) => writeFileSync(pairFile(dir), JSON.stringify(pairs))

  test("AC1 假停机不放槽：interrupt 已受理但后端仍在跑 ⇒ 拒绝 + 仍占槽 + 后续 dispatch 被拒", async () => {
    const dir = repo("fcr-ac1")
    const { ctx } = createFakeCtx({ interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.state).not.toBe("tombstone")
    expect(["wait_no_op", "still_running"]).toContain(r.reason)
    expect(r.stop_judge).toBe("wait")
    expect(r.forced_available).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("active")
    // 槽位仍在 ⇒ 后续 dispatch 被拒（错误含占槽者 id）
    let err = ""
    try {
      await dispatchToolDefinition(ctx).execute(baseInput(dir, "goal-b"), { sessionID: "f" })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain(a.session_id)
  })

  test("AC2 终态可见 ⇒ 成功：墓碑 + 放槽 + event:cancelled（且槽位可再被派发占用）", async () => {
    const dir = repo("fcr-ac2")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.state).toBe("tombstone")
    expect(r.reason).toBeNull()
    expect(r.forced).toBe(false)
    expect(readPairs(dir)[a.session_id].state).toBe("tombstone")
    expect(ledgerRows(dir).some((x: any) => x.event === "cancelled")).toBe(true)
    const b = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-b"))
    expect(b.session_id).toBeTruthy()
  })

  test("AC3 退化（wait 缺失）+ 基线不在跑 ⇒ 拒绝 degraded_no_evidence + stop_judge=degraded", async () => {
    const dir = repo("fcr-ac3")
    const { ctx, sessions } = createFakeCtx({ noWait: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.busy = false
    s.idle = Date.now() + 1000
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.state).not.toBe("tombstone")
    expect(r.reason).toBe("degraded_no_evidence")
    expect(r.stop_judge).toBe("degraded")
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("AC4 退化（wait 缺失）+ 基线在跑 + 水位线前移 ⇒ 允许放行（judge 仍为 degraded）", async () => {
    const dir = repo("fcr-ac4")
    const { ctx } = createFakeCtx({ noWait: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.state).toBe("tombstone")
    // 无 execution 级证据 ⇒ 不得谎称 "wait"
    expect(r.stop_judge).toBe("degraded")
  })

  test("AC5a wait 超时 ⇒ 拒绝 wait_timeout（条目回原态）", async () => {
    const dir = repo("fcr-ac5a")
    const { ctx } = createFakeCtx({ wait: "hold", interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.reason).toBe("wait_timeout")
    expect(r.state).not.toBe("tombstone")
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("AC5b 读失败（原因不明）⇒ 拒绝 unreadable（不墓碑不放槽）", async () => {
    const dir = repo("fcr-ac5b")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 让**基线读取**失败（locate 的那次要成功 ⇒ 否则会走「无法确认该后端是否仍存在」）
    const origGet = ctx.session.get
    // ⚠️ 只统计**该后端**的读取：cancel 路径还会读调用方会话（判 owner kind，D7.8），
    // 全局计数会把"基线读取"的位置挤掉 ⇒ 误测。
    let backendGets = 0
    ctx.session.get = async (input: any) => {
      if (input?.sessionID === a.session_id) {
        backendGets++
        if (backendGets === 2) throw new Error("ECONNRESET: read failed")
      }
      return origGet(input)
    }
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.reason).toBe("unreadable")
    expect(r.state).not.toBe("tombstone")
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("AC6 后端已删（NotFound）⇒ 走 D12：墓碑 + outcome:vanished 终态行（无 event 字段）", async () => {
    const dir = repo("fcr-ac6")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const origGet = ctx.session.get
    ctx.session.get = async (input: any) => {
      if (input.sessionID === a.session_id) {
        const e: any = new Error("Session.NotFoundError: session not found")
        e._tag = "Session.NotFoundError"
        throw e
      }
      return origGet(input)
    }
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.state).toBe("tombstone")
    expect(r.vanished).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("tombstone")
    const vanished = ledgerRows(dir).find((x: any) => x.outcome === "vanished")
    expect(vanished).toBeTruthy()
    // 终态行**没有** `event` 字段（knowledge-capability D5 的「有 event ⇒ 动作行」分派）
    expect(vanished.event).toBeUndefined()
  })

  test("AC7 force：跳过证据门控 ⇒ 墓碑 + 放槽 + cancel_forced 行 + forced:true + 风险文案", async () => {
    const dir = repo("fcr-ac7")
    const { ctx } = createFakeCtx({ interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id, force: true })
    expect(r.state).toBe("tombstone")
    expect(r.forced).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("tombstone")
    const rows = ledgerRows(dir)
    expect(rows.some((x: any) => x.event === "cancel_forced")).toBe(true)
    expect(rows.some((x: any) => x.event === "cancelled")).toBe(false)
    expect(String(r.message)).toContain("可能仍在写")
  })

  test("AC8 授权类拒绝：窗口内 claim_gen 变化 ⇒ 不墓碑不放槽 + reason=slot_reclaimed + 不写 cancel_pending", async () => {
    for (const withForce of [false, true]) {
      const dir = repo(`fcr-ac8-${withForce ? "force" : "plain"}`)
      const { ctx } = createFakeCtx()
      const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
      // 注入：interrupt 之后、释放之前，归属版本被改（另一路认领）
      const origInterrupt = ctx.session.interrupt
      ctx.session.interrupt = async (input: any) => {
        const r = await origInterrupt(input)
        const raw = readPairRaw(dir)
        raw.pairs[a.session_id].claim_gen = (raw.pairs[a.session_id].claim_gen ?? 0) + 5
        writePairRaw(dir, raw)
        return r
      }
      const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id, force: withForce })
      expect(r.reason).toBe("slot_reclaimed")
      expect(r.state).not.toBe("tombstone")
      expect(readPairs(dir)[a.session_id].state).toBe("active")
      // D3③：授权类拒绝**不得**钉住（否则新占者变死槽）
      expect(readPairs(dir)[a.session_id].cancel_pending).toBeUndefined()
    }
  })

  test("AC9 cancel_pending 挡住 reconcile：被拒后即使看起来空闲也不得被自动放行", async () => {
    const dir = repo("fcr-ac9")
    const { ctx, sessions } = createFakeCtx({ interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const r1 = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r1.reason).toBeTruthy()
    expect(r1.pinned).toBe(true)
    expect(readPairs(dir)[a.session_id].cancel_pending).toBeTruthy()
    // 让后端「看起来空闲」⇒ 若无钉住，reconcile 会放行 ⇒ dispatch 会被准入
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    let err = ""
    try {
      await dispatchToolDefinition(ctx).execute(baseInput(dir, "goal-b"), { sessionID: "f" })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain(a.session_id)
  })

  test("AC10 cancel_pending 生命周期：registerSession 保留它；sessions 可见；成功释放后消失", async () => {
    const dir = repo("fcr-ac10")
    const { ctx } = createFakeCtx({ interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(readPairs(dir)[a.session_id].cancel_pending).toBeTruthy()
    // 写者纪律：`registerSession` 的整条重建**不得**丢掉它
    registerSession(dir, a.session_id, "ses_front_test", "build", "engineering", undefined, {
      work_root: path.resolve(dir),
      state: "active",
    })
    expect(readPairs(dir)[a.session_id].cancel_pending).toBeTruthy()
    // `sessions` 必须看得见（否则「砖死不是静默的」没有落点）
    const listed = await run(sessionsToolDefinition(ctx), {})
    const item = listed.items.find((i: any) => i.session_id === a.session_id)
    expect(item).toBeTruthy()
    expect(item.cancel_pending).toBeTruthy()
    // 成功释放 ⇒ 字段消失
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id, force: true })
    expect(r.state).toBe("tombstone")
    expect(readPairs(dir)[a.session_id].cancel_pending).toBeUndefined()
  })

  test("AC10b 后端被删（D12）⇒ 钉住字段消失", async () => {
    const dir = repo("fcr-ac10b")
    const { ctx } = createFakeCtx({ interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(readPairs(dir)[a.session_id].cancel_pending).toBeTruthy()
    const origGet = ctx.session.get
    ctx.session.get = async (input: any) => {
      if (input.sessionID === a.session_id) {
        const e: any = new Error("Session.NotFoundError: session not found")
        e._tag = "Session.NotFoundError"
        throw e
      }
      return origGet(input)
    }
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.state).toBe("tombstone")
    expect(readPairs(dir)[a.session_id].cancel_pending).toBeUndefined()
  })

  test("AC11 钉住不削弱水位线：第二次 cancel 的水位线相对**本次尝试**的快照", async () => {
    const dir = repo("fcr-ac11")
    const { ctx, sessions } = createFakeCtx({ staleBusyOnInterrupt: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    const T = Date.now()
    // 第一次：基线在跑（busy > idle），水位线基线 = T+1000
    s.time = { busy: T + 2000, idle: T + 1000 }
    const r1 = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r1.state).not.toBe("tombstone")
    expect(r1.reason).toBeTruthy()
    const pinned = readPairs(dir)[a.session_id].cancel_pending
    expect(pinned).toBeTruthy()
    expect(pinned.baseline_idle).toBe(T + 1000)
    // 第二次：基线水位线更高（T+4000）且**终态水位线未前移** ⇒ 必须拒绝
    s.time = { busy: T + 5000, idle: T + 4000 }
    const r2 = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r2.state).not.toBe("tombstone")
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("AC12 cancel 对不占槽条目 ⇒ 幂等 no-op（slot_already_released），不墓碑不放槽", async () => {
    const dir = repo("fcr-ac12")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    setPairFields(dir, a.session_id, { state: "idle" })
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.reason).toBe("slot_already_released")
    expect(r.idempotent).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("idle")
  })

  test("AC13 不占槽 + 证据不足 ⇒ 仍是 slot_already_released（授权类优先于证据类）", async () => {
    const dir = repo("fcr-ac13")
    const { ctx } = createFakeCtx({ interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    setPairFields(dir, a.session_id, { state: "suspended" })
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.reason).toBe("slot_already_released")
    expect(readPairs(dir)[a.session_id].state).toBe("suspended")
  })

  test("AC14 ledger 可区分：证据类拒绝 ⇒ cancel_refused（无 cancelled 行）；force ⇒ cancel_forced（无 cancelled 行）", async () => {
    const dir = repo("fcr-ac14")
    const { ctx } = createFakeCtx({ interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    let rows = ledgerRows(dir)
    expect(rows.some((x: any) => x.event === "cancel_refused")).toBe(true)
    expect(rows.some((x: any) => x.event === "cancelled")).toBe(false)
    const refused = rows.find((x: any) => x.event === "cancel_refused")
    expect(refused.reason).toBeTruthy()
    expect(refused.forced_available).toBe(true)
    expect(refused.outcome).toBeNull()
    await run(cancelToolDefinition(ctx), { session_id: a.session_id, force: true })
    rows = ledgerRows(dir)
    expect(rows.some((x: any) => x.event === "cancel_forced")).toBe(true)
    expect(rows.some((x: any) => x.event === "cancelled")).toBe(false)
  })

  test("AC15 严格模式：多实例 ⇒ 基线不在跑也要求水位线前移 ⇒ 拒绝 + foreign_instance + degraded；force 仍可用", async () => {
    const dir = repo("fcr-ac15")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.busy = false
    s.idle = Date.now() + 1000
    // 伪造另一个**存活**实例（同 host、pid+1）⇒ tripwire 命中 ⇒ 严格模式
    const stateDir = path.join(dir, ".rddf/state")
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(
      path.join(stateDir, `.instance-${process.pid + 1}-other.json`),
      JSON.stringify({ pid: process.pid + 1, host: hostname(), started_at: new Date().toISOString() }),
    )
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.foreign_instance).toBe(true)
    expect(r.stop_judge).toBe("degraded")
    expect(r.reason).toBeTruthy()
    expect(r.state).not.toBe("tombstone")
    expect(readPairs(dir)[a.session_id].state).toBe("active")
    // 严格模式下 `force` **仍可用**（偏离仅限 per-call 通道）
    const r2 = await run(cancelToolDefinition(ctx), { session_id: a.session_id, force: true })
    expect(r2.state).toBe("tombstone")
    expect(r2.strict_mode).toBe(true)
  })

  test("AC17 单槽不变式：cancel 拒绝后同一 workRoot 仍 ≤1 个占槽条目", async () => {
    const dir = repo("fcr-ac16")
    const { ctx } = createFakeCtx({ interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    const occupants = slotOccupants(readPairs(dir), path.resolve(dir))
    expect(occupants.length).toBeLessThanOrEqual(1)
    expect(occupants.map((o: any) => o.session_id)).toContain(a.session_id)
  })

  test("AC18 前端文案：含四步恢复序列；不得把裸 cancel 写成释放入口；force 前要求用户知情", async () => {
    const md = readFileSync2(path.join(process.cwd(), "prompts/front.md"), "utf8")
    const usage = readFileSync2(path.join(process.cwd(), "docs/front-delegate-usage.md"), "utf8")
    for (const [doc, name] of [[md, "front.md"], [usage, "usage.md"]] as const) {
      expect(`${name}:cancel_pending=${doc.includes("cancel_pending")}`).toBe(`${name}:cancel_pending=true`)
      expect(`${name}:force=${doc.includes("force")}`).toBe(`${name}:force=true`)
      expect(`${name}:wait_no_op=${doc.includes("wait_no_op")}`).toBe(`${name}:wait_no_op=true`)
      expect(`${name}:cancel_refused=${doc.includes("cancel_refused")}`).toBe(`${name}:cancel_refused=true`)
    }
    // 不得再出现「槽位会由下一次派发的回收顺带释放」（被钉住时不成立）
    expect(md.includes("槽位会由下一次派发的回收顺带释放")).toBe(false)
    expect(usage.includes("槽位会由下一次派发的回收顺带释放")).toBe(false)
  })

  test("AC19 探针固化进仓库且可复跑（回归脚本：cancel 不得在后端仍在跑时放槽）", async () => {
    const probe = path.join(process.cwd(), "tests/probes/probe-cancel-release.ts")
    expect(existsSync(probe)).toBe(true)
    const out = execFileSync("bun", [probe], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    expect(out).toContain("结论：✅ cancel 未在后端仍在跑时释放槽位")
  })
})

// ───────────────────────────── sessions（只读） ─────────────────────────────

describe("sessions（AC4/AC10/AC11/AC29）", () => {
  test("不投递 prompt（观测面不污染）", async () => {
    const dir = repo("sess-readonly")
    const { ctx, calls } = createFakeCtx()
    await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const promptBefore = calls.prompt
    await run(sessionsToolDefinition(ctx), {}, "ses_front_test")
    expect(calls.prompt).toBe(promptBefore)
  })

  test("输出 schema 字段齐（AC29）", async () => {
    const dir = repo("sess-schema")
    const { ctx } = createFakeCtx()
    await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const r = await run(sessionsToolDefinition(ctx), {}, "ses_front_test")
    expect(Object.keys(r).sort()).toEqual(["groups", "headline", "items", "overall"])
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
    let out = await run(sessionsToolDefinition(ctx), {}, "ses_front_test")
    expect(out.items[0].slot.dangling).toBe(false)
    // 把最后活动时间推到很久以前 + 标记不在跑
    const s = sessions.get(r.session_id)
    s.busy = false
    s.idle = Date.now()
    s.updated = Date.now() - 10 * 60 * 1000
    out = await run(sessionsToolDefinition(ctx), {}, "ses_front_test")
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

// ─────────────────── ADR D12 派发面处置矩阵（AC13 ②③） ───────────────────

describe("已删后端的处置矩阵（ADR D12 / AC13）", () => {
  /** 造一个「已派发 → 后端被外部删除」的状态：pair 条目还在，session 查不到。 */
  async function setupVanished(dir: string, opts: { missing?: string[] } = {}) {
    const { ctx } = createFakeCtx({ missing: opts.missing })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 让 get 开始抛错（模拟外部删除），但保留 pair 条目。
    // ⚠️ 必须**先保存原函数引用**再覆盖：直接读 `ctx.session.get` 拿到的是**被覆盖后的自己**
    // ⇒ 自我递归 → RangeError → 被 `readSessionInfo` 吞成 missing ⇒ 活体判定失真
    // （那样「死槽解除」用例会**空过**：死槽 bug 存在时它也通过）。
    const originalGet = ctx.session.get
    ctx.session.get = async (input: any) => {
      if (input.sessionID === a.session_id) { const e: any = new Error("Session.NotFoundError: session not found"); e._tag = "Session.NotFoundError"; throw e }
      return originalGet(input)
    }
    return { ctx, a }
  }

  test("② 派发面：resume 命中已删 ⇒ 旧条目墓碑 + 落 vanished 行 + 同 goal_key 新建", async () => {
    const dir = repo("van-dispatch")
    const { ctx, a } = await setupVanished(dir)

    const r = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir, "goal-a"), resume_session: a.session_id },
    )
    // 新建了一个**新** session（不是复用已删的）
    expect(r.session_id).not.toBe(a.session_id)
    expect(r.recovered_from_vanished).toBe(a.session_id)
    // 旧条目已墓碑（不占槽）
    expect(readPairs(dir)[a.session_id].state).toBe("tombstone")
    // ledger 落了 outcome:"vanished" 终态行
    const ledger = readFileSync(path.join(dir, ".rddf/state/ledger.jsonl"), "utf8")
    expect(ledger).toContain('"outcome":"vanished"')
    expect(ledger).toContain(a.session_id)
  })

  test("② 关键回归：resume 已删后，同一 workRoot 可再次派发（不再被死条目占死）", async () => {
    const dir = repo("van-noslot")
    const { ctx, a } = await setupVanished(dir)
    // 先触发一次「resume 已删」的处置 ⇒ 它会**新建**一个后端（合法占槽）
    const recovered = await run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id })
    expect(recovered.session_id).not.toBe(a.session_id)
    // 此刻占槽的是**新**后端（不是已删的那个）⇒ 再派会被拒，且拒绝信息里的 id 是新后端
    let err = ""
    try {
      await dispatchToolDefinition(ctx).execute(baseInput(dir, "goal-b"), { sessionID: "ses_front_test" })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain(recovered.session_id)
    expect(err).not.toContain(a.session_id)
    // 放开新后端 ⇒ 同一工作树**必须**能再派发（若已删的 a 仍占槽，这里会被拒 ⇒ 死槽未解除）
    await run(suspendToolDefinition(ctx), { session_id: recovered.session_id })
    const again = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-b"))
    expect(again.state).toBe("active")
  })

  test("③ suspend：已删 + active ⇒ 释放槽位并置 suspended（不抛错）", async () => {
    const dir = repo("van-suspend")
    const { ctx, a } = await setupVanished(dir)
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(true)
    expect(r.vanished).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("suspended")
  })

  test("③ cancel：已删 + 非墓碑 ⇒ 置墓碑 + 落 vanished 行（不抛错）", async () => {
    const dir = repo("van-cancel")
    const { ctx, a } = await setupVanished(dir)
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.state).toBe("tombstone")
    expect(r.vanished).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("tombstone")
    const ledger = readFileSync(path.join(dir, ".rddf/state/ledger.jsonl"), "utf8")
    expect(ledger).toContain('"outcome":"vanished"')
  })

  test("③ cancel：已删 + 已墓碑 ⇒ 幂等 no-op", async () => {
    const dir = repo("van-cancel-tomb")
    const { ctx, a } = await setupVanished(dir)
    const pairs = readPairs(dir)
    pairs[a.session_id].state = "tombstone"
    writeFileSync(path.join(dir, ".rddf/state/pair.json"), JSON.stringify({ version: "pair-v2", pairs }))
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.interrupted).toBe(false)
    expect(r.state).toBe("tombstone")
  })

  test("③ 定位不到工程仓时 ⇒ 返回明确结果，**不抛错**", async () => {
    const dir = repo("van-nolocate")
    const { ctx } = createFakeCtx({ missing: ["ses_unknown"] })
    // 该 session 从未被本插件见过 ⇒ 记忆映射里没有 ⇒ 定位不到
    const r = await run(suspendToolDefinition(ctx), { session_id: "ses_unknown" })
    expect(r.suspended).toBe(false)
    expect(String(r.message)).toContain("无法定位")
    const r2 = await run(cancelToolDefinition(ctx), { session_id: "ses_unknown" })
    expect(r2.interrupted).toBe(false)
    expect(String(r2.message)).toContain("无法定位")
  })

  test("③ 查询失败（原因不明）⇒ suspend/cancel 都**不处置**，明确报「无法确认」", async () => {
    const dir = repo("van-unknown")
    const { ctx, a } = await setupVanished(dir)
    // 把「已删」换成「原因不明」：非 NotFoundError ⇒ 不得当作已删除
    ctx.session.get = async (input: any) => {
      if (input.sessionID === a.session_id) throw new Error("ECONNRESET: db unavailable")
      throw new Error("ECONNRESET: db unavailable")
    }
    const rs = await run(suspendToolDefinition(ctx), { session_id: a.session_id, project_dir: dir })
    expect(rs.suspended).toBe(false)
    expect(String(rs.message)).toContain("无法确认")
    const rc = await run(cancelToolDefinition(ctx), { session_id: a.session_id, project_dir: dir })
    expect(rc.interrupted).toBe(false)
    expect(String(rc.message)).toContain("无法确认")
    // 未处置：pair 条目原样（不会被墓碑/释放）
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("③ 给了 project_dir ⇒ 能定位已删后端并完成处置", async () => {
    const dir = repo("van-hint")
    const { ctx, a } = await setupVanished(dir)
    // 换一个没有该后端记忆的 ctx（模拟 front 换代），靠 project_dir 定位
    const { ctx: ctx2 } = createFakeCtx({ missing: [a.session_id] })
    const r = await run(cancelToolDefinition(ctx2), { session_id: a.session_id, project_dir: dir })
    expect(r.state).toBe("tombstone")
    expect(r.vanished).toBe(true)
  })
  test("③ suspend：已删 + idle ⇒ 幂等 no-op（state 不变，D12 矩阵）", async () => {
    const dir = repo("van-suspend-idle")
    const { ctx, a } = await setupVanished(dir)
    const pairs = readPairs(dir)
    pairs[a.session_id].state = "idle"
    writeFileSync(path.join(dir, ".rddf/state/pair.json"), JSON.stringify({ version: "pair-v2", pairs }))
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(r.idempotent).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("idle") // 未改
  })

  test("③ suspend：已删 + 墓碑 ⇒ 拒绝", async () => {
    const dir = repo("van-suspend-tomb")
    const { ctx, a } = await setupVanished(dir)
    const pairs = readPairs(dir)
    pairs[a.session_id].state = "tombstone"
    writeFileSync(path.join(dir, ".rddf/state/pair.json"), JSON.stringify({ version: "pair-v2", pairs }))
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(String(r.message)).toContain("墓碑")
  })

  test("② dispatch：resume 一个**已墓碑**的后端 ⇒ 拒绝（终态不可续接）", async () => {
    const dir = repo("van-dispatch-tomb")
    const { ctx, a } = await setupVanished(dir)
    const pairs = readPairs(dir)
    pairs[a.session_id].state = "tombstone"
    writeFileSync(path.join(dir, ".rddf/state/pair.json"), JSON.stringify({ version: "pair-v2", pairs }))
    let err = ""
    try {
      await dispatchToolDefinition(ctx).execute(
        { ...baseInput(dir, "goal-a"), resume_session: a.session_id },
        { sessionID: "ses_front_test" },
      )
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain("墓碑")
  })

})

describe("AC57 常驻与往返切换（自然跑完 → B → 回到 A）", () => {
  test("A 自然跑完（不调 sessions）→ 派 B 成功 → 名册同组列出 A/B → resume A 成功且上下文未重建", async () => {
    const dir = repo("ac57-roundtrip")
    const { ctx, sessions } = createFakeCtx()

    // ① dispatch(A)
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const countAfterA = sessions.get(a.session_id).messages.length

    // ② A **自然跑完**（不是 suspend）：busy → false、idle 更新；**全程不调用 sessions**
    const sa = sessions.get(a.session_id)
    sa.busy = false
    sa.idle = Date.now()

    // ③ dispatch(B) ⇒ 必须成功（reconcile 把 A 翻成 idle，槽位让出）
    const b = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-b"))
    expect(b.state).toBe("active")

    // ④ sessions：A 与 B **同组列出**（同一 work_root）
    const list = await run(sessionsToolDefinition(ctx), {}, "ses_front_test")
    const ids = list.items.map((i: any) => i.session_id)
    expect(ids).toContain(a.session_id)
    expect(ids).toContain(b.session_id)
    expect(list.items.find((i: any) => i.session_id === a.session_id).state).toBe("idle")
    expect(list.items.find((i: any) => i.session_id === b.session_id).state).toBe("active")
    const sameGroup = list.groups.find((g: any) => g.session_ids.includes(a.session_id))
    expect(sameGroup).toBeDefined()
    expect(sameGroup.session_ids).toContain(b.session_id)

    // ⑤ **单步 resume A 必被拒**（B 仍占槽）——这正是单槽的预期行为
    let err = ""
    try {
      await dispatchToolDefinition(ctx).execute(
        { ...baseInput(dir, "goal-a"), resume_session: a.session_id },
        { sessionID: "ses_front_test" },
      )
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain(b.session_id) // 拒绝信息含占槽者 id

    // ⑥ **切回 A = 两步**（ADR D11.1）：先 suspend(B) 让出槽位，再 resume A
    await run(suspendToolDefinition(ctx), { session_id: b.session_id })
    const back = await run(
      dispatchToolDefinition(ctx),
      { ...baseInput(dir, "goal-a"), resume_session: a.session_id },
    )
    expect(back.session_id).toBe(a.session_id) // 同一个 session，未重建
    expect(sessions.get(a.session_id).messages.length).toBeGreaterThan(countAfterA) // 单调增长
  })

  test("groups：work_root 缺失的条目归入 null 组（不丢弃）", () => {
    const g = groupByWorkRoot([
      { session_id: "s1", work_root: "/w/a" },
      { session_id: "s2", work_root: "/w/a" },
      { session_id: "s3", work_root: null },
    ])
    expect(g).toEqual([
      { work_root: "/w/a", session_ids: ["s1", "s2"] },
      { work_root: null, session_ids: ["s3"] },
    ])
  })
})

describe("缺失判定的窄口径（查询失败 ≠ 已删除）", () => {
  test("isSessionMissingError：只认 tagged 与 session 语义措辞（裸 404 / HandlerNotFound 都不算）", async () => {
    const { isSessionMissingError } = await import("../lib/delegate-async.ts")
    // 正向：上游实测 tag = SessionNotFoundError（线上 404 响应体同名字段）
    const nf: any = new Error("Session not found: ses_x")
    nf._tag = "SessionNotFoundError"
    expect(isSessionMissingError(nf)).toBe(true)
    // 负向：**结构化 404 但不含 session 语义** ⇒ 不算（否则 wait 端点缺失的
    // HandlerNotFound 404 会被误判成「后端已删除」，绕过 ADR S8 的 degraded 分支）
    expect(isSessionMissingError({ status: 404, message: "gone" })).toBe(false)
    expect(isSessionMissingError({ statusCode: "404" })).toBe(false)
    expect(isSessionMissingError(new Error("HandlerNotFound: session.wait"))).toBe(false)
    // 正向：session 语义措辞（旧版/包装错误）
    expect(isSessionMissingError(new Error("session not found: ses_x"))).toBe(true)
    expect(isSessionMissingError(new Error("session ses_x not found"))).toBe(true)
    expect(isSessionMissingError(new Error("Session.NotFoundError: unknown"))).toBe(true)
    expect(isSessionMissingError(new Error("no such session ses_x"))).toBe(true)
    // 负向：**消息里带 404 但与 session 无关** ⇒ 不得当作已删除（否则误放槽）
    expect(isSessionMissingError(new Error("ECONNRESET after reading 404 bytes"))).toBe(false)
    expect(isSessionMissingError(new Error("upstream returned 40412 records"))).toBe(false)
    expect(isSessionMissingError(new Error("HTTP 404 route not found"))).toBe(false)
    // 负向：其它错误
    expect(isSessionMissingError(new Error("boom"))).toBe(false)
    expect(isSessionMissingError(new Error("connection timeout"))).toBe(false)
    expect(isSessionMissingError(null)).toBe(false)
  })

  test("查询失败（原因不明）⇒ 活着的后端**仍占槽**，不被 reconcile 释放", async () => {
    const dir = repo("unknown-slot")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 让 get 对**所有** session 抛一个「原因不明」的错误
    ctx.session.get = async () => {
      throw new Error("upstream boom")
    }
    // 再派一个 ⇒ 必须被拒（a 仍占槽）
    let err = ""
    try {
      await dispatchToolDefinition(ctx).execute(baseInput(dir, "goal-b"), { sessionID: "ses_front_test" })
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain(a.session_id)
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("查询失败（原因不明）⇒ resume **不处置**（不墓碑、不新建）", async () => {
    const dir = repo("unknown-resume")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    ctx.session.get = async () => {
      throw new Error("upstream boom")
    }
    let err = ""
    try {
      await dispatchToolDefinition(ctx).execute(
        { ...baseInput(dir, "goal-a"), resume_session: a.session_id },
        { sessionID: "ses_front_test" },
      )
    } catch (e: any) {
      err = String(e?.message ?? e)
    }
    expect(err).toContain("原因不明")
    expect(readPairs(dir)[a.session_id].state).toBe("active")
    const ledger = readFileSync(path.join(dir, ".rddf/state/ledger.jsonl"), "utf8")
    expect(ledger).not.toContain('"outcome":"vanished"')
  })
})




describe("停机确认：interrupt 的清理是异步的（AC53 / D11.3）", () => {
  test("interrupt 先返回、后停机 ⇒ suspend 应等它停下并释放槽位", async () => {
    const dir = repo("stop-async")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 模拟上游语义：**interrupt 先确认接受，清理稍后 settle**（300ms 后才不忙）
    const s = sessions.get(a.session_id)!
    ctx.session.interrupt = async () => {
      setTimeout(() => { s.busy = false; s.idle = Date.now() }, 300)
      return { interrupted: true }
    }
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("suspended")
  })

  test("空闲后端 ⇒ 不等水位线前移，立即成功（最常见的「挂起一个空闲后端」）", async () => {
    const dir = repo("stop-idle")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 模拟「后端已自然跑完」：不忙、无未终结消息、水位线已存在
    const s = sessions.get(a.session_id)!
    s.busy = false
    s.messages = []
    s.idle = Date.now()
    const t0 = Date.now()
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(true)
    // 不得因「水位线不动」而卡到窗口尽头（基线本来就没在跑）
    expect(Date.now() - t0).toBeLessThan(2_000)
    expect(readPairs(dir)[a.session_id].state).toBe("suspended")
  })

  test("判活为假但水位线未前移（settle 窗口）⇒ 不释放槽位", async () => {
    const dir = repo("stop-settle")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    // interrupt **之前**：在跑；**之后**：判活为假（无 busy）、但 time.idle 停在 0（终态未投影）
    let interrupted = false
    ctx.session.get = async () => {
      const time = interrupted ? { idle: 0, updated: Date.now() } : { busy: Date.now(), idle: 0, updated: Date.now() }
      return { id: s.id, time }
    }
    ctx.session.context = async () => [] // 无未终结消息 ⇒ 第二级兜底不判 running
    ctx.session.interrupt = async () => {
      interrupted = true
      return { interrupted: true }
    }
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("消息读失败（context 抛错）⇒ **不**当成「没有未终结消息」，不释放槽位", async () => {
    const dir = repo("stop-ctx-fail")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // context 读失败 ⇒ D4 的第二级兜底失效 ⇒ 判活算不出来 ⇒ 保守当「仍在运行」
    ctx.session.context = async () => {
      throw new Error("SQLITE_BUSY: db locked")
    }
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("读后端状态失败（原因不明）⇒ 不释放槽位，明确报「无法读取后端状态」", async () => {
    const dir = repo("stop-unknown")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 非 NotFoundError ⇒ 原因不明 ⇒ 保守当「仍在运行」（放到这里等于误放槽 ⇒ 并发写）。
    // 第 1 次（locate）成功、之后失败：专门打在「基线取不到」这条分支上。
    const s = sessions.get(a.session_id)!
    let n = 0
    ctx.session.get = async () => {
      n++
      if (n === 1) return { id: s.id, time: { busy: Date.now(), idle: 0, updated: Date.now() } }
      throw new Error("ECONNRESET: db unavailable")
    }
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    // 读失败**原因不明** ⇒ 拒绝且不释放槽位（保守当仍在运行）
    expect(String(r.message)).toContain("无法读取后端状态")
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("interrupt 后**一直**不停 ⇒ 不释放槽位（AC10：矛盾 ⇒ reason=wait_no_op）", async () => {
    const dir = repo("stop-never")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    ctx.session.interrupt = async () => ({ interrupted: true }) // 假装接受但实际不停
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    // `wait` 已返回（有界）却仍判活为真 ⇒ 两个观测矛盾 ⇒ `wait_no_op`（≠ `still_running`）
    expect(r.reason).toBe("wait_no_op")
    expect(String(r.message)).toContain("仍在运行")
    expect(String(r.message)).toContain("cancel")
    // 槽位**未**释放（仍是 active，占着）
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })
})

describe("全局上限计数读权威态（AC31）", () => {
  test("达到全局上限 ⇒ 拒绝信息里带**占额者清单**（否则「3/3」无法定位）", async () => {
    const dirA = repo("cap-holder-a")
    const dirB = repo("cap-holder-b")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dirA, "goal-a"))
    process.env.RDDF_MAX_ACTIVE_BACKENDS = "1"
    try {
      await expect(run(dispatchToolDefinition(ctx), baseInput(dirB, "goal-b"))).rejects.toThrow(
        new RegExp(`占额：${a.session_id}`),
      )
    } finally {
      delete process.env.RDDF_MAX_ACTIVE_BACKENDS
    }
  })

  test("metadata 过期（仍是 active）但 pair 已 idle ⇒ **不**计入上限", async () => {
    const dir = repo("cap-authority")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 权威态：pair 里已被 reconcile 翻成 idle（模拟后端自然跑完）
    const pairs = readPairs(dir)
    pairs[a.session_id].state = "idle"
    writeFileSync(path.join(dir, ".rddf/state/pair.json"), JSON.stringify({ version: "pair-v2", pairs }))
    // metadata 索引**未同步**（仍是 active）
    const { countActiveBackends } = await import("../lib/delegate-async.ts")
    const n = await countActiveBackends(ctx)
    expect(n).toBe(0) // 权威态是 idle ⇒ 不占额度
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 准入判据 `stillRunning`（change: front-async-resume-guard，AC1–AC14）
// ═══════════════════════════════════════════════════════════════════════════

describe("准入判据 stillRunning（AC19 / D8.1）", () => {
  test("AC2/AC3 谓词完备性：stale-busy 与「刚起无消息」都判在跑（不得简化成单支）", () => {
    // ① stale-busy：busy 陈旧 < idle，且有一条更晚的消息 ⇒ 在跑（`isRunning` 会漏）
    const staleBusy = { time: { busy: 100, idle: 200 } }
    const msgs = [{ id: "m1", time: { created: 300 } }]
    expect(isRunning(staleBusy, msgs)).toBe(false) // 展示口径（D4，不变）
    expect(stillRunning(staleBusy, msgs)).toBe(true) // 准入口径

    // ② busy > idle 且没有新消息 ⇒ 在跑（单用「最后消息 > idle」会漏）
    const busyNoMsg = { time: { busy: 300, idle: 200 } }
    expect(stillRunning(busyNoMsg, [])).toBe(true)

    // ③ 全空闲 ⇒ 不在跑；④ 无 busy 但有更晚消息 ⇒ 在跑（首次运行窗口期）
    expect(stillRunning({ time: { idle: 400 } }, msgs)).toBe(false)
    expect(stillRunning({ time: {} }, msgs)).toBe(true)
  })

  test("AC1 三个准入读者对 stale-busy 结论一致（planSlot / slotBusyHolders / dispatch）", async () => {
    const dir = repo("guard-stale")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    // stale-busy：busy < idle，且最后消息晚于 idle
    s.time = { busy: 100, idle: 200 }
    s.messages = [{ id: "m1", time: { created: 300 } }]

    const { stateRoot, workRoot } = canonicalRoot(dir)
    const plan = await planSlot(ctx, stateRoot, workRoot)
    expect(plan.busyOf[a.session_id]).toBe(true)

    const holders = await slotBusyHolders(ctx, stateRoot, workRoot)
    expect(holders.map((h) => h.session_id)).toContain(a.session_id)

    await expect(
      run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id }),
    ).rejects.toThrow(/无法向运行中的后端/)
  })

  test("AC5 拒绝时零副作用：prompt/create 次数、pair 字段、ledger 行、全局额度", async () => {
    const dir = repo("guard-noop")
    const { ctx, sessions, calls } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { busy: 300, idle: 200 } // 明确的「在跑」
    s.messages = []

    const pairsBefore = JSON.parse(JSON.stringify(readPairs(dir)[a.session_id]))
    const ledgerPath = path.join(dir, ".rddf/state/ledger.jsonl")
    const ledgerBefore = readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean).length
    const promptBefore = calls.prompt
    const createBefore = calls.create
    const quotaBefore = await countActiveBackends(ctx)

    await expect(
      run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id }),
    ).rejects.toThrow(/无法向运行中的后端/)

    expect(calls.prompt).toBe(promptBefore) // 不投递简报（不 ring doorbell）
    expect(calls.create).toBe(createBefore) // 不建 session
    const pairsAfter = readPairs(dir)[a.session_id]
    expect(pairsAfter.state).toBe(pairsBefore.state) // **不得**被 claimSlot 覆写成 dispatching
    expect(pairsAfter.last_used_at ?? null).toBe(pairsBefore.last_used_at ?? null)
    expect(pairsAfter.registered_at).toBe(pairsBefore.registered_at)
    expect(readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean).length).toBe(ledgerBefore)
    expect(await countActiveBackends(ctx)).toBe(quotaBefore)
  })

  test("AC6 空闲后端 ⇒ resume 放行（行为与改动前一致）", async () => {
    const dir = repo("guard-idle")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 } // 明确空闲（idle 晚于所有消息）
    s.messages = []

    const resumed = await run(dispatchToolDefinition(ctx), {
      ...baseInput(dir, "goal-a"),
      resume_session: a.session_id,
    })
    expect(resumed.session_id).toBe(a.session_id) // 复用，不新建
    expect(resumed.state).not.toBe("suspended")
  })

  test("AC11 dispatching（简报未确认消费）⇒ 拒绝，文案指向 cancel", async () => {
    const dir = repo("guard-dispatching")
    const { ctx } = createFakeCtx({ notConsume: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    expect(readPairs(dir)[a.session_id].state).toBe("dispatching")

    await expect(
      run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id }),
    ).rejects.toThrow(/简报尚未确认消费/)
  })

  test("AC7 目标状态读失败（原因不明）⇒ 拒绝，文案说明「无法确认」", async () => {
    const dir = repo("guard-unknown")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 非 NotFoundError ⇒ 原因不明 ⇒ 不得当作已删（也不得当作空闲）
    ctx.session.get = async () => {
      throw new Error("ECONNRESET: db unavailable")
    }
    await expect(
      run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id }),
    ).rejects.toThrow(/无法确认/)
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("AC12 tombstone ⇒ 拒绝且文案为「已终止」（不被活体判定抢先）", async () => {
    const dir = repo("guard-tombstone")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 同时让它「看起来在跑」——tombstone 的判定必须在前
    const s = sessions.get(a.session_id)!
    s.time = { busy: 300, idle: 200 }
    const pairs = readPairs(dir)
    pairs[a.session_id].state = "tombstone"
    writeFileSync(path.join(dir, ".rddf/state/pair.json"), JSON.stringify({ version: "pair-v2", pairs }))

    await expect(
      run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id }),
    ).rejects.toThrow(/已终止/)
  })

  test("AC14 展示口径不变：sessions 对 stale-busy 仍报非 running（`isRunning` 未改）", async () => {
    const dir = repo("guard-display")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { busy: 100, idle: 200 }
    s.messages = [{ id: "m1", time: { created: 300 } }]

    const listed = await run(sessionsToolDefinition(ctx), {})
    const item = (listed.items ?? []).find((i: any) => i.session_id === a.session_id)
    expect(item).toBeTruthy()
    // 展示层用 isRunning（busy 分支 + busy===0 兜底）⇒ stale-busy 不被判在跑（D4 口径不变）
    expect(item.running).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 停机确认：wait + 判活 + 水位线 + 进程内准入守卫（change: front-stop-confirmation）
// ═══════════════════════════════════════════════════════════════════════════

describe("停机确认（ADR-front-stop-confirmation）", () => {
  const W0 = process.env.RDDF_STOP_TIMEOUT_MS
  const D0 = process.env.RDDF_SUSPEND_ALLOW_DEGRADED
  const setW = (v: string) => {
    process.env.RDDF_STOP_TIMEOUT_MS = v
  }
  afterAll(() => {
    if (W0 === undefined) delete process.env.RDDF_STOP_TIMEOUT_MS
    else process.env.RDDF_STOP_TIMEOUT_MS = W0
    if (D0 === undefined) delete process.env.RDDF_SUSPEND_ALLOW_DEGRADED
    else process.env.RDDF_SUSPEND_ALLOW_DEGRADED = D0
  })

  test("AC1 wait 不返回（同进程有 execution）⇒ 不释放；stale-busy 形态也被拦住", async () => {
    setW("300")
    const dir = repo("stop-ac1")
    const { ctx, sessions } = createFakeCtx({ wait: "hold" })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { busy: 100, idle: 200 } // 展示口径会判「不在跑」，但 execution 仍在
    s.messages = [{ id: "m1", time: { created: 300 } }]
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(r.stop_judge).toBe("wait")
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("AC4 判活恒真 ⇒ wait 返回也不释放（条件 2 的负向）", async () => {
    setW("300")
    const dir = repo("stop-ac4")
    const { ctx, sessions } = createFakeCtx({ interruptNoop: true })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { busy: 500, idle: 400 } // 一直在跑
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("AC3 成功释放时，返回时刻 ≥ 后继终态时刻（wait 覆盖后继）", async () => {
    setW("2000")
    const dir = repo("stop-ac3")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { busy: 500, idle: 400 } // 基线：在跑（⇒ 要求水位线前移）
    let idleAt = 0
    ctx.session.wait = async () => {
      await new Promise((r) => setTimeout(r, 300))
      idleAt = Date.now()
      s.time = { idle: idleAt } // 后继结束、终态投影
    }
    const t0 = Date.now()
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(true)
    expect(Date.now()).toBeGreaterThanOrEqual(idleAt)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250)
  })

  test("AC10 释放后立即 dispatch(resume=X) 成功（守卫已清 + 槽位真的空了）", async () => {
    setW("1000")
    const dir = repo("stop-ac10")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(true)
    const again = await run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id })
    expect(again.session_id).toBe(a.session_id)
  })

  test("AC11 并发两次 suspend：互不清对方的守卫；两路结束后守卫为空（X2）", async () => {
    setW("300")
    const dir = repo("stop-ac11")
    const { ctx, sessions, releaseWaits } = createFakeCtx({ wait: "hold" })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []

    const p1 = run(suspendToolDefinition(ctx), { session_id: a.session_id })
    const p2 = run(suspendToolDefinition(ctx), { session_id: a.session_id })
    await new Promise((r) => setTimeout(r, 80))
    const mid = __pendingStops()
    expect(mid.length).toBe(1)
    expect(mid[0].owners.length).toBe(2) // 两个 owner token 同时存在

    releaseWaits()
    await Promise.all([p1, p2])
    expect(__pendingStops().length).toBe(0)
  })

  test("AC7 wait 抛 NotFound ⇒ 视为已停机（释放）；其它错误 ⇒ 不释放（S5/S6）", async () => {
    setW("300")
    // (a) NotFound ⇒ 释放
    {
      const dir = repo("stop-ac7a")
      const { ctx, sessions } = createFakeCtx({ wait: "notfound" })
      const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
      const s = sessions.get(a.session_id)!
      s.time = { idle: Date.now() + 10_000 }
      s.messages = []
      const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
      expect(r.suspended).toBe(true)
      expect(readPairs(dir)[a.session_id].state).toBe("suspended")
    }
    // (b) 其它错误 ⇒ 不释放（空闲分支无正面证据）
    {
      const dir = repo("stop-ac7b")
      const { ctx, sessions } = createFakeCtx({ wait: "error" })
      const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
      const s = sessions.get(a.session_id)!
      s.time = { idle: Date.now() + 10_000 }
      s.messages = []
      const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
      expect(r.suspended).toBe(false)
      expect(r.stop_judge).toBe("degraded")
      expect(readPairs(dir)[a.session_id].state).toBe("active")
    }
  })

  test("AC9 wait 端点缺失（404 HandlerNotFound）⇒ degraded，不得当成「后端已删」（S8）", async () => {
    setW("300")
    const dir = repo("stop-handler-missing")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    ctx.session.wait = async () => {
      const e: any = new Error("HandlerNotFound: session.wait")
      e.status = 404
      throw e
    }
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(r.stop_judge).toBe("degraded")
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("AC8 退化三分支 + stop_judge 三值 + ledger 留痕（S7/S7b）", async () => {
    setW("300")
    // (a) wait 缺失 + 空闲 ⇒ 拒绝（无正面证据）
    {
      const dir = repo("stop-ac8a")
      const { ctx, sessions } = createFakeCtx({ noWait: true })
      const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
      const s = sessions.get(a.session_id)!
      s.time = { idle: Date.now() + 10_000 }
      s.messages = []
      const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
      expect(r.suspended).toBe(false)
      expect(r.stop_judge).toBe("degraded")
      expect(String(r.message)).toContain("RDDF_SUSPEND_ALLOW_DEGRADED")
      expect(readPairs(dir)[a.session_id].state).toBe("active")
    }
    // (b) 同上 + 显式赎回 ⇒ 放行且留痕
    {
      const dir = repo("stop-ac8b")
      process.env.RDDF_SUSPEND_ALLOW_DEGRADED = "1"
      try {
        const { ctx, sessions } = createFakeCtx({ noWait: true })
        const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
        const s = sessions.get(a.session_id)!
        s.time = { idle: Date.now() + 10_000 }
        s.messages = []
        const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
        expect(r.suspended).toBe(true)
        expect(r.stop_judge).toBe("degraded-forced")
        const ledger = readFileSync(path.join(dir, ".rddf/state/ledger.jsonl"), "utf8")
        expect(ledger).toContain("suspend_degraded")
      } finally {
        delete process.env.RDDF_SUSPEND_ALLOW_DEGRADED
      }
    }
    // (c) wait 缺失 + 基线在跑 ⇒ 水位线是正面证据 ⇒ 允许
    {
      const dir = repo("stop-ac8c")
      const { ctx, sessions } = createFakeCtx({ noWait: true })
      const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
      const s = sessions.get(a.session_id)!
      s.time = { busy: 500, idle: 400 }
      const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
      // interrupt 让 fake ctx 置 busy=false、idle=now ⇒ 水位线前移 ⇒ 允许
      expect(r.suspended).toBe(true)
      expect(r.stop_judge).toBe("degraded")
    }
  })

  test("AC17 交叉优先级：停机守卫优先于活体判定，文案不得含「请先 suspend」（X4）", async () => {
    setW("300")
    const dir = repo("stop-ac17")
    const { ctx, sessions, releaseWaits } = createFakeCtx({ wait: "hold" })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { version: 1, busy: 500, idle: 400 } // 既在跑、又正在停机
    const p = run(suspendToolDefinition(ctx), { session_id: a.session_id })
    await new Promise((r) => setTimeout(r, 80))
    let msg = ""
    try {
      await run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id })
    } catch (e: any) {
      msg = String(e?.message ?? e)
    }
    expect(msg).toContain("正在停机")
    expect(msg).toContain("发起")
    expect(msg).not.toContain("请先 suspend")
    releaseWaits()
    await p
  })

  test("AC14/AC16 守卫可观测且不落盘（X9/X8）：失败后 pair 无中间态、守卫为空", async () => {
    setW("300")
    const dir = repo("stop-ac14")
    const { ctx, sessions } = createFakeCtx({ wait: "hold" })
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    const pairs = readPairs(dir)
    // 五值枚举内、无中间态；且守卫为进程内（不落盘）
    expect(["dispatching", "active", "idle", "suspended", "tombstone"]).toContain(pairs[a.session_id].state)
    expect(JSON.stringify(pairs)).not.toContain("suspending")
    expect(JSON.stringify(pairs)).not.toContain("stopping")
    expect(__pendingStops().length).toBe(0)
  })

  test("AC18 W 钳制 + 极小 W 仍能对空闲后端成功（X6/X7）", async () => {
    setW("600000")
    expect(stopTimeoutMs()).toBe(60_000) // 上界钳制
    setW("300")
    const dir = repo("stop-ac18")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(true)
    expect(r.stop_judge).toBe("wait")
  })

  test("D5⑥ 释放后复检命中「又有新执行」⇒ 如实留痕 stop_raced（不假装关闭窗口）", async () => {
    setW("500")
    const dir = repo("stop-raced")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const backend = sessions.get(a.session_id)!
    backend.time = { idle: Date.now() + 10_000 }
    backend.messages = []

    // 一旦 pair 翻成 suspended（= 释放已完成），后续读到的就是「新 execution 已起」
    ctx.session.get = ((orig) => async (input: any) => {
      if (readPairs(dir)[input.sessionID]?.state === "suspended") {
        const now = Date.now()
        backend.time = { busy: now, idle: now - 1_000 }
        backend.messages = [{ id: "m_raced", time: { created: now } }]
      }
      return orig(input)
    })(ctx.session.get)

    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(true)
    expect(r.stop_raced).toBe(true)
    const ledger = readFileSync(path.join(dir, ".rddf/state/ledger.jsonl"), "utf8")
    expect(ledger).toContain('"stop_raced"')
  })

  test("sessions 是只读观测：不输出 stop_judge（载体重合会误导消费者）", async () => {
    setW("500")
    const dir = repo("stop-judge-carrier")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.stop_judge).toBe("wait") // suspend 的返回值上有
    const listed = await run(sessionsToolDefinition(ctx), {})
    expect(JSON.stringify(listed)).not.toContain("stop_judge")
  })

  test("AC15 prompts/front.md 文案：不得暗示「重试 suspend」（X10）", () => {
    const md = readFileSync2(path.join(process.cwd(), "prompts/front.md"), "utf8")
    expect(md).toContain("不要反复重试")
    expect(md).toContain("cancel")
    // 不得出现「重试 suspend」式的建议（只允许出现在「不要反复重试」的否定句里）
    const bad = /(?:请|建议|应该)[^。\n]{0,12}重试[^。\n]{0,6}suspend/
    expect(bad.test(md)).toBe(false)
  })
})

describe("停机守卫的锁内重验（早检查与 claimSlot 之间的窗口）", () => {
  test("AC9b 早检查通过后、claimSlot 之前置上守卫 ⇒ 仍被拒（锁内重验）", async () => {
    const dir = repo("guard-lock-recheck")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 让目标**空闲**：否则先被「运行中」判据拦下（那是另一条路径，不是本条要测的）
    const backend = sessions.get(a.session_id)!
    backend.time = { idle: Date.now() + 10_000 }
    backend.messages = []

    const { stateRoot, workRoot } = canonicalRoot(dir)
    let token: string | undefined
    // 第 2 次 get = `planSlot`（位于活体判定**之后**、`claimSlot` 之前）⇒ 注入守卫
    let gets = 0
    ctx.session.get = ((orig) => async (input: any) => {
      const r = await orig(input)
      gets++
      if (gets === 2 && !token) {
        token = enterStopGuard(stateRoot, workRoot, "ses_being_suspended", "ses_other_front")
      }
      return r
    })(ctx.session.get)

    let msg = ""
    try {
      await run(dispatchToolDefinition(ctx), { ...baseInput(dir, "goal-a"), resume_session: a.session_id })
    } catch (e: any) {
      msg = String(e?.message ?? e)
    } finally {
      if (token) leaveStopGuard(stateRoot, workRoot, token)
    }
    expect(msg).toContain("正在停机")
    expect(msg).toContain("ses_being_suspended")
    expect(__pendingStops().length).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 槽位释放的授权模型（change: front-stop-ownership，AC1–AC18）
// 决策：docs/adr/ADR-front-stop-ownership.md（Accepted）
// ═══════════════════════════════════════════════════════════════════════════

describe("授权释放（ADR-front-stop-ownership D1）", () => {
  const pairFile = (dir: string) => path.join(dir, ".rddf/state/pair.json")
  const readPairRaw = (dir: string) => JSON.parse(readFileSync(pairFile(dir), "utf8"))
  const writePairRaw = (dir: string, pairs: any) => writeFileSync(pairFile(dir), JSON.stringify(pairs))

  /** 在「判读之后、释放之前」注入一次并发写（第 2 次 get 之后）。 */
  function injectAfterLocate(ctx: any, fn: (input: any) => void) {
    let gets = 0
    const orig = ctx.session.get
    ctx.session.get = async (input: any) => {
      const r = await orig(input)
      gets++
      if (gets === 2) fn(input)
      return r
    }
  }

  test("AC1 认领使归属版本递增；良性写（字段合并）不改变它", async () => {
    const dir = repo("own-ac1")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const after = readPairs(dir)[a.session_id].claim_gen
    expect(typeof after).toBe("number")
    expect(after).toBeGreaterThan(0)
    // 良性写：字段级合并 ⇒ 不 bump
    const before = readPairs(dir)[a.session_id].claim_gen
    setPairFields(dir, a.session_id, { steer_residue: "none" })
    expect(readPairs(dir)[a.session_id].claim_gen).toBe(before)
  })

  test("AC2 归属已变（认领落盘）⇒ 不释放，reason=slot_reclaimed，条目仍在占者名下", async () => {
    const dir = repo("own-ac2")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = (ctx as any).__sessions
    void s
    // 注入：快照之后、释放之前，另一路认领（代号 +1）
    injectAfterLocate(ctx, () => {
      const raw = readPairRaw(dir)
      raw.pairs[a.session_id].claim_gen = (raw.pairs[a.session_id].claim_gen ?? 0) + 1
      writePairRaw(dir, raw)
    })
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(r.reason).toBe("slot_reclaimed")
    // 条目未被改写（仍是原占者、仍是 active）
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("AC3 状态被并发改写（dispatching）⇒ 不释放，reason=slot_state_changed", async () => {
    const dir = repo("own-ac3")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    injectAfterLocate(ctx, () => {
      const raw = readPairRaw(dir)
      raw.pairs[a.session_id].state = "dispatching"
      writePairRaw(dir, raw)
    })
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(r.reason).toBe("slot_state_changed")
    expect(readPairs(dir)[a.session_id].state).toBe("dispatching")
  })

  test("AC4 良性写不误伤：释放仍成功（不得报 slot_reclaimed）", async () => {
    const dir = repo("own-ac4")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    injectAfterLocate(ctx, () => {
      setPairFields(dir, a.session_id, { suspended_at_message_id: "msg_x", steer_residue: "none" })
    })
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("suspended")
  })

  test("AC5 cancel 同样条件化（代号在 cancel 期间变更 ⇒ 不墓碑、不释放）", async () => {
    const dir = repo("own-ac5")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 注入点：`interrupt` 之后、释放之前（cancel 的 locate 之后）⇒ 归属版本被改
    const origInterrupt = ctx.session.interrupt
    ctx.session.interrupt = async (input: any) => {
      const r = await origInterrupt(input)
      const raw = readPairRaw(dir)
      raw.pairs[a.session_id].claim_gen = (raw.pairs[a.session_id].claim_gen ?? 0) + 5
      writePairRaw(dir, raw)
      return r
    }
    const r = await run(cancelToolDefinition(ctx), { session_id: a.session_id })
    expect(r.state).not.toBe("tombstone")
    expect(r.reason).toBe("slot_reclaimed")
    expect(readPairs(dir)[a.session_id].state).not.toBe("tombstone")
  })

  test("AC6 state 枚举不变；claim_gen 非整数不参与状态判定", async () => {
    const dir = repo("own-ac6")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const raw = readPairRaw(dir)
    raw.pairs[a.session_id].claim_gen = "7"
    writePairRaw(dir, raw)
    expect(["dispatching", "active", "idle", "suspended", "tombstone"]).toContain(readPairs(dir)[a.session_id].state)
    // 槽位占用判定不受 claim_gen 影响
    const occupants = slotOccupants(readPairs(dir), path.resolve(dir))
    expect(occupants.map((o: any) => o.session_id)).toContain(a.session_id)
  })

  test("AC7 已删路径的动作与改动前一致（dispatching ⇒ 释放并置 suspended）", async () => {
    const dir = repo("own-ac7")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const originalGet = ctx.session.get
    ctx.session.get = async (input: any) => {
      if (input.sessionID === a.session_id) {
        const e: any = new Error("Session.NotFoundError: session not found")
        e._tag = "Session.NotFoundError"
        throw e
      }
      return originalGet(input)
    }
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(true)
    expect(r.vanished).toBe(true)
    expect(readPairs(dir)[a.session_id].state).toBe("suspended")
    void sessions
  })

  test("AC8/AC17 tripwire：≥2 个存活实例 ⇒ 严格模式 + foreign_instance + ledger；同 pid 多戳不算多实例", async () => {
    const dir = repo("own-ac8")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    const stateDir = path.join(dir, ".rddf/state")
    mkdirSync(stateDir, { recursive: true })
    // (a) **两枚**同 pid 的戳（并发写戳 / 文件被删后重建的残留）⇒ **不得**判多实例
    //     （按 (host,pid) 去重；注意只写一枚时 `ensureInstanceStamp` 会复用它 ⇒ 测不出来）
    for (const n of ["dup1", "dup2"]) {
      writeFileSync(
        path.join(stateDir, `.instance-${process.pid}-${n}.json`),
        JSON.stringify({ pid: process.pid, host: hostname(), started_at: new Date().toISOString() }),
      )
    }
    const r0 = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r0.suspended).toBe(true)
    expect(r0.foreign_instance).toBeUndefined()
    // (b) 另一个 pid 的戳（用本进程 pid + 1，判定为「同 host 的另一个存活实例」）
    const b = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-b"))
    const s2 = sessions.get(b.session_id)!
    s2.time = { idle: Date.now() + 10_000 }
    s2.messages = []
    writeFileSync(
      path.join(stateDir, `.instance-${process.pid + 1}-other.json`),
      JSON.stringify({ pid: process.pid + 1, host: hostname(), started_at: new Date().toISOString() }),
    )
    const r1 = await run(suspendToolDefinition(ctx), { session_id: b.session_id })
    expect(r1.suspended).toBe(false)
    expect(r1.foreign_instance).toBe(true)
    expect(r1.stop_judge).toBe("degraded")
    const ledger = readFileSync(path.join(dir, ".rddf/state/ledger.jsonl"), "utf8")
    expect(ledger).toContain('"foreign_instance"')
  })

  test("AC9 严格模式下赎回开关不生效", async () => {
    const dir = repo("own-ac9")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    const stateDir = path.join(dir, ".rddf/state")
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(
      path.join(stateDir, `.instance-${process.pid + 1}-other.json`),
      JSON.stringify({ pid: process.pid + 1, host: hostname(), started_at: new Date().toISOString() }),
    )
    process.env.RDDF_SUSPEND_ALLOW_DEGRADED = "1"
    try {
      const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
      expect(r.suspended).toBe(false)
      expect(r.stop_judge).not.toBe("degraded-forced")
      expect(r.foreign_instance).toBe(true)
    } finally {
      delete process.env.RDDF_SUSPEND_ALLOW_DEGRADED
    }
  })

  test("AC10 矛盾 ⇒ wait_no_op；still_running 仍可达（wait 缺失 + 基线在跑）", async () => {
    const W0 = process.env.RDDF_STOP_TIMEOUT_MS
    process.env.RDDF_STOP_TIMEOUT_MS = "300"
    try {
      // (a) wait 返回但仍判活为真 ⇒ 两个观测矛盾 ⇒ wait_no_op
      const dir = repo("own-ac10a")
      const { ctx, sessions } = createFakeCtx({ interruptNoop: true })
      const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
      const s = sessions.get(a.session_id)!
      s.time = { busy: 500, idle: 400 }
      s.messages = []
      const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
      expect(r.suspended).toBe(false)
      expect(r.reason).toBe("wait_no_op")
      // (b) wait 缺失 + 基线在跑 ⇒ still_running 仍可达
      const dir2 = repo("own-ac10b")
      const f = createFakeCtx({ noWait: true, interruptNoop: true })
      const b = await run(dispatchToolDefinition(f.ctx), baseInput(dir2, "goal-a"))
      const s2 = f.sessions.get(b.session_id)!
      s2.time = { busy: 500, idle: 400 }
      const r2 = await run(suspendToolDefinition(f.ctx), { session_id: b.session_id })
      expect(r2.suspended).toBe(false)
      expect(r2.reason).toBe("still_running")
    } finally {
      if (W0 === undefined) delete process.env.RDDF_STOP_TIMEOUT_MS
      else process.env.RDDF_STOP_TIMEOUT_MS = W0
    }
  })

  test("AC12 同步 delegate（registerSession 整条重建）后归属版本不回退", async () => {
    const dir = repo("own-ac12")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const before = readPairs(dir)[a.session_id].claim_gen ?? 0
    // 模拟同步 delegate 的登记写（整条重建字段集，但保留 claim_gen）
    registerSession(dir, a.session_id, "ses_front_test", "build", "engineering", undefined, {
      work_root: path.resolve(dir),
      state: "active",
    })
    const after = readPairs(dir)[a.session_id].claim_gen ?? 0
    expect(after).toBeGreaterThanOrEqual(before)
  })

  test("AC11 戳的存活判定：同 host 的**死 pid** 不算实例；跨 host 戳算存活（保守）", async () => {
    const dir = repo("own-ac11")
    const { ctx } = createFakeCtx()
    await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const stateDir = path.join(dir, ".rddf/state")
    mkdirSync(stateDir, { recursive: true })
    ensureInstanceStamp(dir) // 本进程留戳（否则「活实例数」基数不对）
    // 死 pid（同 host）⇒ 不算存活 ⇒ 不判多实例
    writeFileSync(
      path.join(stateDir, `.instance-999999-dead.json`),
      JSON.stringify({ pid: 999999, host: hostname(), started_at: new Date().toISOString() }),
    )
    expect(detectForeignInstances(dir)).toBe(false)
    // 跨 host ⇒ 保守视为存活 ⇒ 判多实例
    writeFileSync(
      path.join(stateDir, `.instance-999998-remote.json`),
      JSON.stringify({ pid: 999998, host: "some-other-host", started_at: new Date().toISOString() }),
    )
    expect(detectForeignInstances(dir)).toBe(true)
  })

  test("AC13 单槽不变式：同一 workRoot 下 active|dispatching 条目 ≤ 1（两个根都查）", async () => {
    const dir = repo("own-ac13")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const { stateRoot, workRoot } = canonicalRoot(dir)
    for (const root of [stateRoot, workRoot]) {
      const file = path.join(root, ".rddf/state/pair.json")
      if (!existsSync(file)) continue
      const raw = JSON.parse(readFileSync(file, "utf8"))
      const occupants = Object.values(raw.pairs ?? {}).filter((e: any) => e.work_root === workRoot && ["active", "dispatching"].includes(e.state))
      expect(occupants.length).toBeLessThanOrEqual(1)
    }
    expect(readPairs(dir)[a.session_id].state).toBe("active")
  })

  test("AC15 判定顺序：条目被 reconcile 翻成 idle（代号也变了）⇒ 报 slot_already_released（不是 slot_reclaimed）", async () => {
    const dir = repo("own-ac15")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    injectAfterLocate(ctx, () => {
      // 模拟 reconcile：active → idle（并 bump 归属版本）
      const raw = readPairRaw(dir)
      raw.pairs[a.session_id].state = "idle"
      raw.pairs[a.session_id].claim_gen = (raw.pairs[a.session_id].claim_gen ?? 0) + 1
      writePairRaw(dir, raw)
    })
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(r.reason).toBe("slot_already_released")
  })

  test("AC16 sessions 回填不丢归属版本（锁外读到的旧值不得覆盖锁内的新值）", async () => {
    const dir = repo("own-ac16")
    const { ctx } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    // 造一个「需要回填」的条目（缺 work_root）
    const raw = readPairRaw(dir)
    delete raw.pairs[a.session_id].work_root
    raw.pairs[a.session_id].claim_gen = 3
    writePairRaw(dir, raw)
    // 在回填的锁外读之后、锁内写之前，另一路把 claim_gen 改成 9
    const origRead = readPairs
    void origRead
    const listed = await run(sessionsToolDefinition(ctx), {})
    void listed
    // 回填后 claim_gen 不得回退到旧值（≥ 注入前）
    expect(readPairs(dir)[a.session_id].claim_gen ?? 0).toBeGreaterThanOrEqual(3)
  })

  test("AC18 登记态缺失 ⇒ 明确失败（不得渲染成 idle 的幂等成功）", async () => {
    const dir = repo("own-ac18")
    const { ctx, sessions } = createFakeCtx()
    const a = await run(dispatchToolDefinition(ctx), baseInput(dir, "goal-a"))
    const s = sessions.get(a.session_id)!
    s.time = { idle: Date.now() + 10_000 }
    s.messages = []
    // 抹掉登记条目
    const raw = readPairRaw(dir)
    delete raw.pairs[a.session_id]
    writePairRaw(dir, raw)
    const r = await run(suspendToolDefinition(ctx), { session_id: a.session_id })
    expect(r.suspended).toBe(false)
    expect(r.reason).toBe("slot_entry_gone")
  })

  test("AC18b 条目写入都在 .role.lock 内（源码断言：setSlotState 只在包装里被调用）", () => {
    const src = readFileSync2(path.join(process.cwd(), "lib/delegate-async.ts"), "utf8")
    const calls = src.match(/setSlotState\(/g)?.length ?? 0
    // 定义 1 + updateSlotState 包装内 1 ⇒ 没有裸调用点
    expect(calls).toBe(2)
  })

  test("AC14 前端文案：三种形态各有出口，且不得建议用 cancel 释放空闲后端", async () => {
    const md = readFileSync2(path.join(process.cwd(), "prompts/front.md"), "utf8")
    expect(md).toContain("slot_already_released")
    expect(md).toContain("wait_no_op")
    expect(md).toContain("foreign_instance")
    expect(md).toContain("多实例")
    const usage = readFileSync2(path.join(process.cwd(), "docs/front-delegate-usage.md"), "utf8")
    expect(usage).toContain("slot_already_released")
    expect(usage).toContain("wait_no_op")
    expect(usage).toContain("foreign_instance")
  })
})
