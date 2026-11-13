/**
 * delegate 工具的端到端单元测试（假 ctx 驱动，无需真实 opencode 运行时）。
 *
 * 用 `delegateToolDefinition(ctx)` 拿到工具定义，再用一个实现了
 * ctx.session.* 的假 ctx 驱动 execute，验证**双 session 的完整链路**：
 *   brief 校验 → 工程 session 建立（权限定型）→ 简报投递 → 结果回传 →
 *   pair / role 登记 → 续接 → 阻断识别 → 越界检测 → busy 保护。
 *
 * 被委托的工程 = **自建最小 git 仓库**（临时目录；不依赖任何外部仓库）。
 *
 * 运行：bun test tests/
 */
import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"

import { canonicalRoot, delegateToolDefinition, enterStopGuard, leaveStopGuard } from "../lib/delegate-core.ts"

const TMP = mkdtempSync(path.join("/tmp/opencode", "delegate-tool-test-"))

/**
 * 自建最小工程（**不依赖任何外部仓库**，与 README「完全离线」一致）：
 * 只需要一个可写、可提交、可算 diff 的 git 仓库 + `tests/` 目录。
 */
let fixtureCounter = 0

function fixtureProject(): string {
  const dest = path.join(TMP, `fixture-${++fixtureCounter}`)
  mkdirSync(path.join(dest, "tests"), { recursive: true })
  writeFileSync(path.join(dest, "README.md"), "# fixture project\n")
  writeFileSync(path.join(dest, "tests", "existing.py"), "# existing case\n")
  execFileSync("git", ["init", "-q"], { cwd: dest })
  execFileSync("git", ["add", "-A"], { cwd: dest })
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture"], { cwd: dest })
  return dest
}

type Session = {
  id: string
  agent: string
  directory: string
  permissions: any[]
  title: string
  prompts: string[]
  messages: any[]
  outcome: string | null
  idle: number
  updated: number
  removed: boolean
}

type FakeOptions = {
  /** 工程 session 收到简报后的行为：可写文件、产出消息、模拟阻断。 */
  onPrompt?: (session: Session, brief: string) => void
  /** 预置一个"正在运行"的 session（用于 busy 判定）。 */
  busy?: boolean
  /**
   * 模拟"prompt 入队失败"：prompt 不产生任何消息 → 委托结束后 newActivity=false，
   * 必须返回 outcome="unknown"（不得采信旧的 outcome）。
   */
  noActivity?: boolean
  /** 模拟 session.wait 抛错：必须落到 wait_error，而不是静默成功。 */
  waitThrows?: boolean
  /** 模拟 session.wait 永不返回（触发 wait 超时 → still_running）。 */
  waitNeverResolves?: boolean
  /** 覆盖工程 session 的最终 assistant 文本（默认 `已完成：<title>`）；可按轮次给不同文本。 */
  assistantText?: string | ((round: number) => string)
}

function createFakeCtx(options: FakeOptions = {}) {
  const sessions = new Map<string, Session>()
  const calls = { create: 0, prompt: 0, remove: 0 }
  let counter = 0

  const ctx: any = {
    session: {
      create: async (input: any) => {
        calls.create++
        counter++
        const id = `ses_fake_${counter}`
        const session: Session = {
          id,
          agent: input.agent,
          directory: input.location.directory,
          permissions: input.permissions ?? [],
          title: input.title,
          prompts: [],
          messages: [],
          outcome: null,
          idle: 0,
          updated: Date.now(),
          removed: false,
        }
        sessions.set(id, session)
        return { id, agent: session.agent, location: { directory: session.directory } }
      },
      prompt: async (input: any) => {
        calls.prompt++
        const session = sessions.get(input.sessionID)
        if (!session) throw new Error(`未知 session: ${input.sessionID}`)
        session.prompts.push(input.text)
        if (options.noActivity) {
          // 模拟 prompt 入队失败：不产生任何新消息（baseline 与 after 完全一致）
          return {}
        }
        session.messages.push({
          id: `msg_user_${session.prompts.length}`,
          type: "user",
          time: { created: Date.now() },
          text: input.text,
        })
        if (options.onPrompt) options.onPrompt(session, input.text)
        if (options.busy) {
          // 运行中：消息时间晚于最后 idle → 触发 busy 判定
          session.messages.push({
            id: `msg_running_${session.prompts.length}`,
            type: "assistant",
            time: { created: Date.now() + 1000 },
            content: [{ type: "text", text: "还在跑" }],
          })
          session.idle = Date.now() - 5000
          session.updated = Date.now()
          session.outcome = null
          return {}
        }
        session.messages.push({
          id: `msg_assistant_${session.prompts.length}`,
          type: "assistant",
          time: { created: Date.now() },
          content: [
            {
              type: "text",
              text:
                typeof options.assistantText === "function"
                  ? options.assistantText(session.prompts.length)
                  : (options.assistantText ?? `已完成：${session.title}`),
            },
          ],
        })
        session.outcome = "succeeded"
        session.idle = Date.now()
        session.updated = session.idle
        return {}
      },
      wait: async () => {
        if (options.waitThrows) throw new Error("wait failed")
        if (options.waitNeverResolves) await new Promise(() => {})
      },
      get: async (input: any) => {
        const session = sessions.get(input.sessionID)
        if (!session) throw new Error(`未知 session: ${input.sessionID}`)
        return {
          id: session.id,
          agent: session.agent,
          permissions: session.permissions,
          outcome: session.outcome,
          time: { idle: session.idle, updated: session.updated },
        }
      },
      context: async (input: any) => {
        const session = sessions.get(input.sessionID)
        if (!session) throw new Error(`未知 session: ${input.sessionID}`)
        return session.messages
      },
      remove: async (input: any) => {
        calls.remove++
        const session = sessions.get(input.sessionID)
        if (session) session.removed = true
        return {}
      },
    },
  }

  return { ctx, sessions, calls }
}

async function runDelegate(ctx: any, input: any) {
  const tool = delegateToolDefinition(ctx)
  const result = await tool.execute(input, { sessionID: "ses_front_test" })
  return JSON.parse(result.content)
}

const BASE = {
  agent: "build",
  task: "在 tests/ 下新增一个用例文件",
  goal: "新增用例",
  scope: ["tests/"],
  acceptance: "新文件存在",
}

// ─────────────────────────── 工具契约 ───────────────────────────

describe("工具契约：门控与输入 schema", () => {
  test("工具声明独立权限 action（门控的基础）", () => {
    const tool = delegateToolDefinition({} as any)
    expect(tool.name).toBe("delegate")
    expect(tool.options.permission).toBe("delegate")
    expect(tool.options.codemode).toBe(false)
  })

  test("输入 schema 的必填字段 = brief 六必填", () => {
    const tool = delegateToolDefinition({} as any)
    expect(tool.input.required.sort()).toEqual(
      ["acceptance", "goal", "project_dir", "scope", "task"].sort(),
    )
    for (const field of ["project_dir", "task", "goal", "scope", "acceptance", "constraints", "grants", "resume_session", "remove"]) {
      expect(Object.keys(tool.input.properties)).toContain(field)
    }
  })
})

// ─────────────────────────── 端到端主链路 ───────────────────────────

describe("端到端：front 委托 → 工程 session 执行 → 结果回传", () => {
  test("工程 session 被建立、权限定型、简报投递、结果回传、pair/role 登记", async () => {
    const project = fixtureProject()
    const { ctx, calls, sessions } = createFakeCtx({
      onPrompt: (session) => {
        // 模拟工程 session 在 scope 内写文件
        writeFileSync(path.join(project, "tests/unit_delegate_case.py"), "# new case\n")
      },
    })

    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })

    expect(calls.create).toBe(1)
    expect(calls.prompt).toBe(1)
    expect(summary.outcome).toBe("succeeded")
    expect(summary.new_activity).toBe(true)
    expect(summary.blocked_reason).toBeNull()
    expect(summary.out_of_scope_files).toEqual([])
    expect(summary.changed_files).toContain("tests/unit_delegate_case.py")
    expect(summary.last_assistant_text).toContain("已完成")

    // 工程 session 拿到的权限 = [常量 deny, scope edit 规则, grants]
    const session = [...sessions.values()][0]
    expect(session.permissions.length).toBeGreaterThan(30)
    expect(session.permissions[0]).toEqual({ action: "shell", resource: "git push *", effect: "deny" })
    const editRules = session.permissions.filter((p) => p.action === "edit")
    expect(editRules[0]).toEqual({ action: "edit", resource: "*", effect: "deny" })
    expect(editRules.some((r) => r.resource === "tests" && r.effect === "allow")).toBe(true)
    // question / form 在常量 deny 集内（无人值守下会挂死）
    expect(session.permissions.some((p) => p.action === "question" && p.effect === "deny")).toBe(true)
    expect(session.permissions.some((p) => p.action === "form" && p.effect === "deny")).toBe(true)

    // 简报确实投递给工程 session
    const brief = session.prompts[0]
    expect(brief).toContain("新增用例")
    expect(brief).toContain("tests/")
    expect(brief).toContain("新文件存在")

    // pair + role 登记（工程 session 开局就能读到自己的角色）
    const pair = JSON.parse(readFileSync(path.join(project, ".rddf/state/pair.json"), "utf8"))
    expect(pair.version).toBe("pair-v2")
    expect(Object.keys(pair.pairs)).toContain(session.id)
    const role = JSON.parse(readFileSync(path.join(project, ".rddf/state/role.json"), "utf8"))
    expect(role.sessions[session.id].current_role).toBe("builder")
  })

  test("grants 随 create 一次性进入 session permissions（preflight，不是事后）", async () => {
    const project = fixtureProject()
    const { ctx, sessions } = createFakeCtx()
    await runDelegate(ctx, {
      ...BASE,
      project_dir: project,
      grants: [{ action: "shell", resource: "git push *" }],
    })
    const session = [...sessions.values()][0]
    const grant = session.permissions.find((p) => p.action === "shell" && p.resource === "git push *" && p.effect === "allow")
    expect(grant).toBeDefined()
  })

  test("非法 grants 在建立工程 session 之前就被拒绝（不产生副作用）", async () => {
    const project = fixtureProject()
    const { ctx, calls } = createFakeCtx()
    await expect(
      runDelegate(ctx, { ...BASE, project_dir: project, grants: [{ action: "edit", resource: "*" }] }),
    ).rejects.toThrow(/永不可 grant/)
    expect(calls.create).toBe(0)
  })

  test("brief 缺必填字段 → 拒绝委托", async () => {
    const project = fixtureProject()
    const { ctx, calls } = createFakeCtx()
    await expect(runDelegate(ctx, { ...BASE, project_dir: project, goal: "" })).rejects.toThrow(/goal/)
    expect(calls.create).toBe(0)
  })
})

// ─────────────────────────── 续接 / busy / 阻断 / 越界 ───────────────────────────

describe("续接、busy、阻断与越界", () => {
  test("resume_session 续接同一工程 session（不新建）", async () => {
    const project = fixtureProject()
    const { ctx, calls, sessions } = createFakeCtx()
    const first = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(calls.create).toBe(1)

    const second = await runDelegate(ctx, {
      ...BASE,
      project_dir: project,
      resume_session: first.session_id,
    })
    expect(calls.create).toBe(1) // 未新建
    expect(second.resumed).toBe(true)
    expect(second.session_id).toBe(first.session_id)
    expect(sessions.size).toBe(1)
  })

  test("resume_session 未登记 → 拒绝", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx()
    await expect(
      runDelegate(ctx, { ...BASE, project_dir: project, resume_session: "ses_not_registered" }),
    ).rejects.toThrow(/未登记/)
  })

  test("目标 session 正在运行 → busy，不排队（续接一个 in-flight 的 session）", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({ busy: true })
    // 第一次委托：建立工程 session，并让假 ctx 把它留在「运行中」状态
    const first = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(first.session_id).toBeTruthy()

    // 第二次委托：续接这个仍在运行的 session → 必须拒绝排队
    const second = await runDelegate(ctx, {
      ...BASE,
      project_dir: project,
      resume_session: first.session_id,
    })
    expect(second.outcome).toBe("busy")
    expect(second.still_running).toBe(true)
  })

  test("工程 session 被权限拦下 → blocked_reason 回传（不看 outcome）", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({
      onPrompt: (session) => {
        session.messages.push({
          id: "msg_denied",
          type: "assistant",
          time: { created: Date.now() },
          content: [
            {
              type: "tool",
              name: "shell",
              state: {
                status: "error",
                input: { command: "git push" },
                error: { type: "permission.rejected", message: "Permission denied: shell" },
              },
            },
          ],
        })
      },
    })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(summary.blocked_reason).toBe("Permission denied: shell")
    expect(summary.blocked_action).toBe("shell")
    expect(summary.blocked_all.length).toBeGreaterThanOrEqual(1)
  })

  test("工程 session 改了 scope 外的文件 → out_of_scope_files 可见", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({
      onPrompt: () => {
        writeFileSync(path.join(project, "tests/inside.py"), "# ok\n")
        writeFileSync(path.join(project, "outside.py"), "# 越界\n")
      },
    })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(summary.changed_files).toContain("outside.py")
    expect(summary.out_of_scope_files).toContain("outside.py")
    expect(summary.out_of_scope_files).not.toContain("tests/inside.py")
  })

  test("remove=true 时工程 session 被删除", async () => {
    const project = fixtureProject()
    const { ctx, calls, sessions } = createFakeCtx()
    await runDelegate(ctx, { ...BASE, project_dir: project, remove: true })
    expect(calls.remove).toBe(1)
    expect([...sessions.values()][0].removed).toBe(true)
  })
})

// ───────────── front 知识获取能力（ADR-front-knowledge-capability） ─────────────

describe("agent 白名单（H1）与知识 session 语义", () => {
  test("非白名单 agent 在建 session 之前被拒", async () => {
    const project = fixtureProject()
    const { ctx, calls } = createFakeCtx()
    for (const agent of ["general", "plan"]) {
      await expect(runDelegate(ctx, { ...BASE, project_dir: project, agent })).rejects.toThrow(/白名单/)
    }
    expect(calls.create).toBe(0)
  })

  test("知识 session：edit 恒为单条 deny，不注入 scope allow", async () => {
    const project = fixtureProject()
    const { ctx, sessions } = createFakeCtx()
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project, agent: "explore", scope: [] })
    expect(summary.kind).toBe("knowledge")
    expect(summary.agent).toBe("explore")
    const session = [...sessions.values()][0]
    expect(session.agent).toBe("explore")
    const editRules = session.permissions.filter((p: any) => p.action === "edit")
    expect(editRules).toEqual([{ action: "edit", resource: "*", effect: "deny" }])
    expect(session.permissions.every((p: any) => p.action !== "edit" || p.effect === "deny")).toBe(true)
  })

  test("知识 session 即使传了非空 scope，也不获得 edit allow（ADR Verification #5）", async () => {
    const project = fixtureProject()
    const { ctx, sessions } = createFakeCtx()
    await runDelegate(ctx, { ...BASE, project_dir: project, agent: "explore", scope: ["tests/"] })
    const session = [...sessions.values()][0]
    const editRules = session.permissions.filter((p: any) => p.action === "edit")
    expect(editRules).toEqual([{ action: "edit", resource: "*", effect: "deny" }])
  })

  test("知识 session 不写 role.json 的 sessions 分区，只登记 pair（kind=knowledge）", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx()
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project, agent: "oracle", scope: [] })
    const pair = JSON.parse(readFileSync(path.join(project, ".rddf/state/pair.json"), "utf8"))
    expect(pair.pairs[summary.session_id].kind).toBe("knowledge")
    const roleFile = path.join(project, ".rddf/state/role.json")
    const role = existsSync(roleFile) ? JSON.parse(readFileSync(roleFile, "utf8")) : {}
    expect(role.sessions?.[summary.session_id]).toBeUndefined()
  })

  test("知识 session 的 grants 被拒（不产生副作用）", async () => {
    const project = fixtureProject()
    const { ctx, calls } = createFakeCtx()
    await expect(
      runDelegate(ctx, {
        ...BASE,
        project_dir: project,
        agent: "librarian",
        scope: [],
        grants: [{ action: "shell", resource: "curl *" }],
      }),
    ).rejects.toThrow(/不接受 grants/)
    expect(calls.create).toBe(0)
  })

  test("resume 一个已登记但 agent 不在白名单的 session 被拒（H1b）", async () => {
    const project = fixtureProject()
    const stateDir = path.join(project, ".rddf/state")
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(
      path.join(stateDir, "pair.json"),
      JSON.stringify({
        version: "pair-v2",
        pairs: {
          ses_bad: {
            front_session_id: null,
            canonical_root: path.resolve(project),
            agent: "general",
            kind: "engineering",
            registered_at: new Date().toISOString(),
            last_used_at: new Date().toISOString(),
          },
        },
      }),
    )
    const { ctx, calls } = createFakeCtx()
    await expect(
      runDelegate(ctx, { ...BASE, project_dir: project, resume_session: "ses_bad" }),
    ).rejects.toThrow(/白名单/)
    expect(calls.create).toBe(0)
  })
})

describe("ledger 行产生时机（D5）", () => {
  const ledgerPath = (project: string) => path.join(project, ".rddf/state/ledger.jsonl")

  test("正常结束恰好一行，字段齐全且已脱敏", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({
      onPrompt: (session) => {
        session.messages.push({
          id: "msg_secret",
          type: "assistant",
          time: { created: Date.now() },
          content: [{ type: "text", text: "done, key=oc_sk_abcdefgh12345678" }],
        })
      },
    })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    const rows = readFileSync(ledgerPath(project), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    expect(rows.length).toBe(1)
    expect(rows[0].backend_session_id).toBe(summary.session_id)
    expect(rows[0].kind).toBe("engineering")
    expect(rows[0].outcome).toBe("succeeded")
    expect(rows[0].recorded_at).toBeTruthy()
    expect(rows[0].last_assistant_text).not.toContain("oc_sk_abcdefgh12345678")
  })

  test("busy 也落一行（outcome=busy）", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({ busy: true })
    const first = await runDelegate(ctx, { ...BASE, project_dir: project })
    await runDelegate(ctx, { ...BASE, project_dir: project, resume_session: first.session_id })
    const rows = readFileSync(ledgerPath(project), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    expect(rows.length).toBe(2)
    expect(rows[1].outcome).toBe("busy")
  })

  test("校验失败不落行", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx()
    await expect(runDelegate(ctx, { ...BASE, project_dir: project, agent: "general" })).rejects.toThrow(/白名单/)
    expect(existsSync(ledgerPath(project))).toBe(false)
  })
})

describe("失败与并发路径（补审计缺口）", () => {
  test("prompt 无新活动 → outcome=unknown，不采信旧 outcome", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({ noActivity: true })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(summary.outcome).toBe("unknown")
    expect(summary.new_activity).toBe(false)
    const rows = readFileSync(path.join(project, ".rddf/state/ledger.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
    expect(rows.length).toBe(1)
    expect(rows[0].outcome).toBe("unknown")
  })

  test("resume 的 canonical_root 不匹配 → 拒", async () => {
    const project = fixtureProject()
    const stateDir = path.join(project, ".rddf/state")
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(
      path.join(stateDir, "pair.json"),
      JSON.stringify({
        version: "pair-v2",
        pairs: {
          ses_elsewhere: {
            front_session_id: null,
            canonical_root: "/tmp/other-project",
            agent: "build",
            kind: "engineering",
            registered_at: new Date().toISOString(),
            last_used_at: new Date().toISOString(),
          },
        },
      }),
    )
    const { ctx, calls } = createFakeCtx()
    await expect(
      runDelegate(ctx, { ...BASE, project_dir: project, resume_session: "ses_elsewhere" }),
    ).rejects.toThrow(/canonical_root/)
    expect(calls.create).toBe(0)
  })

  test("resume 时显式 agent 与登记 agent 不一致 → 拒", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx()
    const first = await runDelegate(ctx, { ...BASE, project_dir: project, agent: "build" })
    await expect(
      runDelegate(ctx, {
        ...BASE,
        project_dir: project,
        agent: "explore",
        scope: [],
        resume_session: first.session_id,
      }),
    ).rejects.toThrow(/不匹配/)
  })

  test("session.wait 抛错 → wait_error 回传，仍写出结果与 ledger", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({ waitThrows: true })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(summary.wait_error).toContain("wait failed")
    expect(summary.session_id).toBeTruthy()
    const rows = readFileSync(path.join(project, ".rddf/state/ledger.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
    expect(rows.length).toBe(1)
  })

  test("并发两次委托：pair/role/ledger 均无丢失", async () => {
    const project = fixtureProject()
    const { ctx, sessions } = createFakeCtx()
    const [a, b] = await Promise.all([
      runDelegate(ctx, { ...BASE, project_dir: project, goal: "并发 A" }),
      runDelegate(ctx, { ...BASE, project_dir: project, goal: "并发 B" }),
    ])
    expect(a.session_id).not.toBe(b.session_id)
    expect(sessions.size).toBe(2)

    const pair = JSON.parse(readFileSync(path.join(project, ".rddf/state/pair.json"), "utf8"))
    expect(Object.keys(pair.pairs).sort()).toEqual([a.session_id, b.session_id].sort())

    const role = JSON.parse(readFileSync(path.join(project, ".rddf/state/role.json"), "utf8"))
    expect(Object.keys(role.sessions).sort()).toEqual([a.session_id, b.session_id].sort())

    const rows = readFileSync(path.join(project, ".rddf/state/ledger.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
    expect(rows.length).toBe(2)
    expect(rows.map((r) => r.backend_session_id).sort()).toEqual([a.session_id, b.session_id].sort())
  })
})

describe("交付面证据：静默失败检测（P0）", () => {
  const ROLE_OPENING = "【角色: builder | source: state-file】我可实施代码修改。\n\n目标明确、scope 单文件，直接实施。"

  test("工程 session 只输出角色开场白就结束 → outcome=unverified（host_outcome 保留宿主的 succeeded）", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({ assistantText: ROLE_OPENING })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(summary.outcome).toBe("unverified")
    expect(summary.host_outcome).toBe("succeeded")
    expect(summary.final_is_role_opening).toBe(true)
    expect(summary.no_work_evidence).toBe(true)
    expect(summary.tool_calls).toBe(0)
    expect(summary.write_tool_calls).toBe(0)
    expect(summary.artifacts).toBe(0)
  })

  test("正常交付（正常结论文本）→ no_work_evidence=false", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({
      onPrompt: (session) => {
        writeFileSync(path.join(project, "tests/ok.txt"), "# ok\n")
      },
    })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(summary.outcome).toBe("succeeded")
    expect(summary.host_outcome).toBe("succeeded")
    expect(summary.no_work_evidence).toBe(false)
    expect(summary.final_is_role_opening).toBe(false)
    expect(summary.artifacts).toBeGreaterThan(0)
  })

  test("知识 session（零工具调用、产物就是回答）→ 不得被判成 no_work_evidence", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({ assistantText: "【角色: explore | source: state-file】只读结论……" })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project, agent: "explore", scope: [] })
    expect(summary.kind).toBe("knowledge")
    expect(summary.tool_calls).toBe(0)
    expect(summary.no_work_evidence).toBe(false)
    expect(summary.outcome).toBe("succeeded") // 知识 session 不得被判 unverified
  })

  test("工程 session 用 edit 工具写盘 → 有写盘调用与产物，即使结尾是开场白也不判 no_work_evidence", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({
      onPrompt: (session) => {
        writeFileSync(path.join(project, "tests/edited.txt"), "# edited\n")
        session.messages.push({
          id: "msg_tool_edit",
          type: "assistant",
          time: { created: Date.now() },
          content: [{ type: "tool", name: "edit", state: { status: "completed" } }],
        })
      },
      assistantText: ROLE_OPENING,
    })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(summary.write_tool_calls).toBe(1)
    expect(summary.artifacts).toBeGreaterThan(0)
    expect(summary.no_work_evidence).toBe(false)
  })

  test("ledger 记录 no_work_evidence（审计可追溯）", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({ assistantText: ROLE_OPENING })
    await runDelegate(ctx, { ...BASE, project_dir: project })
    const rows = readFileSync(path.join(project, ".rddf/state/ledger.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
    expect(rows.length).toBe(1)
    expect(rows[0].no_work_evidence).toBe(true)
    expect(rows[0].outcome).toBe("unverified")
    expect(rows[0].host_outcome).toBe("succeeded")
  })

  test("resume：历史轮次的写盘调用不得掩盖本轮零交付（只看本轮窗口）", async () => {
    const project = fixtureProject()
    let round = 0
    const { ctx } = createFakeCtx({
      assistantText: (n) =>
        n === 1 ? "## 执行结果\n已创建 first.txt" : "【角色: builder | source: state-file】我可实施代码修改。",
      onPrompt: (session) => {
        round++
        if (round !== 1) return
        writeFileSync(path.join(project, "tests/first.txt"), "# first\n")
        session.messages.push({
          id: "msg_tool_edit",
          type: "assistant",
          time: { created: Date.now() },
          content: [{ type: "tool", name: "edit", state: { status: "completed" } }],
        })
      },
    })
    const first = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(first.write_tool_calls).toBe(1)
    expect(first.no_work_evidence).toBe(false)

    // 第二轮 resume 同一 session：本轮只输出角色开场白，什么都没做
    const second = await runDelegate(ctx, { ...BASE, project_dir: project, resume_session: first.session_id })
    expect(second.write_tool_calls).toBe(0) // 本轮没有写盘调用（上一轮的不算）
    expect(second.artifacts).toBe(0) // 本轮没有新产物
    expect(second.no_work_evidence).toBe(true) // 本轮零交付必须报出来
    expect(second.outcome).toBe("unverified")
    expect(second.host_outcome).toBe("succeeded")
  })

  test("run 中途换过模型（model-switched）+ 本轮零交付 → 报出来（不依赖文本格式）", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({
      // 最终文本**不是**角色开场白（换模型后的新模型可能说别的）
      assistantText: "好的，我继续处理。",
      onPrompt: (session) => {
        session.messages.push({ id: "msg_switch", type: "model-switched", time: { created: Date.now() } })
      },
    })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(summary.model_switched).toBe(1)
    expect(summary.final_is_role_opening).toBe(false)
    expect(summary.no_work_evidence).toBe(true)
    expect(summary.outcome).toBe("unverified")
  })

  test("用 shell 写盘（有产物）+ 最终文本是开场白 → 不得误报成没有产出", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx({
      assistantText: ROLE_OPENING,
      onPrompt: (session) => {
        writeFileSync(path.join(project, "tests/shell_wrote.txt"), "# via shell\n")
      },
    })
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    expect(summary.write_tool_calls).toBe(0) // shell 不算写盘工具
    expect(summary.artifacts).toBeGreaterThan(0) // 但产物在
    expect(summary.no_work_evidence).toBe(false) // 有产物 → 不是"没有产出"
    expect(summary.outcome).toBe("succeeded") // 不得降级
  })

  test("仍在跑（wait 超时）时不得判 no_work_evidence（resume 的陈旧 outcome 会误报）", async () => {
    const project = fixtureProject()
    const prev = process.env.DELEGATE_WAIT_TIMEOUT_MS
    process.env.DELEGATE_WAIT_TIMEOUT_MS = "30"
    try {
      const { ctx } = createFakeCtx({ waitNeverResolves: true, assistantText: ROLE_OPENING })
      const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
      expect(summary.wait_timed_out).toBe(true)
      expect(summary.still_running).toBe(true)
      expect(summary.no_work_evidence).toBe(false) // 仍在跑 → 不判定"没有产出"
      expect(summary.outcome).not.toBe("unverified") // 陈旧 outcome 不得触发降级
    } finally {
      if (prev === undefined) delete process.env.DELEGATE_WAIT_TIMEOUT_MS
      else process.env.DELEGATE_WAIT_TIMEOUT_MS = prev
    }
  })
})


// ───────────────── role_class（ADR-backend-handoff-role-class） ─────────────────

describe("role_class：同步派发面（AC4 / AC5 / AC8 / AC11 / resume 一致性）", () => {
  const glob = (pattern: string, value: string): boolean => {
    if (pattern === "*") return true
    if (!pattern.includes("*")) return pattern === value
    const escaped = pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")
    return new RegExp(`^${escaped}$`).test(value)
  }
  /** 与内核 `evaluate` 同语义：findLast。 */
  const effect = (
    rules: Array<{ action: string; resource: string; effect: string }>,
    action: string,
    resource: string,
  ): string => {
    const matched = rules.filter((r) => glob(r.action, action) && glob(r.resource, resource))
    return matched[matched.length - 1]?.effect ?? "ask"
  }

  test("工程 session 权限含 subagent 白名单（净效果：只读 agent allow，其余 deny）", async () => {
    const project = fixtureProject()
    const { ctx, sessions } = createFakeCtx()
    await runDelegate(ctx, { ...BASE, project_dir: project })
    const session = [...sessions.values()][0]
    for (const agent of ["explore", "librarian", "oracle", "metis", "critic"]) {
      expect(effect(session.permissions, "subagent", agent)).toBe("allow")
    }
    for (const agent of ["general", "context-builder", "build"]) {
      expect(effect(session.permissions, "subagent", agent)).toBe("deny")
    }
  })

  test("verifier 类：.rddf/reviews 可写、tests/ 不可写（edit 净效果）", async () => {
    const project = fixtureProject()
    const { ctx, sessions } = createFakeCtx()
    await runDelegate(ctx, {
      ...BASE,
      project_dir: project,
      scope: [".rddf/reviews"],
      role_class: "verifier",
    })
    const session = [...sessions.values()][0]
    expect(effect(session.permissions, "edit", ".rddf/reviews/case.md")).toBe("allow")
    expect(effect(session.permissions, "edit", "tests/case.py")).toBe("deny")
  })

  test("role_class 落 pair + role.json 分区；简报含运行身份段", async () => {
    const project = fixtureProject()
    const { ctx, sessions } = createFakeCtx()
    await runDelegate(ctx, { ...BASE, project_dir: project, role_class: "builder" })
    const session = [...sessions.values()][0]
    const pair = JSON.parse(readFileSync(path.join(project, ".rddf/state/pair.json"), "utf8"))
    expect(pair.pairs[session.id].role_class).toBe("builder")
    const role = JSON.parse(readFileSync(path.join(project, ".rddf/state/role.json"), "utf8"))
    expect(role.sessions[session.id].role_class).toBe("builder")
    expect(role.sessions[session.id].current_role).toBe("builder")
    const brief = session.prompts[0]
    expect(brief).toContain("## 运行身份")
    expect(brief).toContain("role_class = builder")
  })

  test("同步轮次结束后 pair.state === idle（AC8，槽已释放可再派）", async () => {
    const project = fixtureProject()
    const { ctx, sessions } = createFakeCtx()
    const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
    const pair = JSON.parse(readFileSync(path.join(project, ".rddf/state/pair.json"), "utf8"))
    expect(pair.pairs[summary.session_id].state).toBe("idle")
  })

  test("resume：class 不一致 ⇒ 硬拒（同一 session 内不允许换类）", async () => {
    const project = fixtureProject()
    const { ctx, sessions } = createFakeCtx()
    const first = await runDelegate(ctx, { ...BASE, project_dir: project })
    await expect(
      runDelegate(ctx, {
        ...BASE,
        project_dir: project,
        resume_session: first.session_id,
        role_class: "verifier",
        scope: [".rddf/reviews"],
      }),
    ).rejects.toThrow(/不匹配|越界/)
  })

  test("AC11：无换类工具入口（注册面只有五个委托工具，无 set_class 一类）", async () => {
    const source = readFileSync(path.join(import.meta.dir, "..", "plugins", "delegate.ts"), "utf8")
    const registered = [...source.matchAll(/editor\.add\((\w+)\(/g)].map((m) => m[1])
    expect(registered.sort()).toEqual([
      "cancelToolDefinition",
      "delegateToolDefinition",
      "dispatchToolDefinition",
      "sessionsToolDefinition",
      "suspendToolDefinition",
    ])
    expect(registered.some((name) => /class/i.test(name))).toBe(false)
  })
})

afterAll(() => {
  try {
    rmSync(TMP, { recursive: true, force: true })
  } catch {
    /* 清理失败不影响测试结论 */
  }
})

// ─────────────────── 停机守卫：同步 delegate 入口不得被 excludeSessionID 绕过 ───────────────────

describe("停机守卫（front-stop-confirmation D2 / front-async-resume-guard AC10）", () => {
  test("AC10 同步 delegate：该工作树正在停机 ⇒ 拒绝（即便 resume 目标正是被停机者）", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx()
    // 先建一个已登记的后端（后续 resume 它）
    const first = await runDelegate(ctx, { ...BASE, project_dir: project })
    const backendID = first.session_id as string
    expect(backendID).toBeTruthy()

    const { stateRoot, workRoot } = canonicalRoot(project)
    // 🎯 守卫指向的**正是**这个 resume 目标 —— 若检查被 `excludeSessionID` 排除，就会漏挡
    const token = enterStopGuard(stateRoot, workRoot, backendID, "ses_other_front")
    let msg = ""
    try {
      await runDelegate(ctx, { ...BASE, project_dir: project, resume_session: backendID })
    } catch (e: any) {
      msg = String(e?.message ?? e)
    } finally {
      leaveStopGuard(stateRoot, workRoot, token)
    }
    expect(msg).toContain("正在停机")
    expect(msg).toContain("ses_other_front")
    expect(msg).not.toContain("请先 suspend")
  })

  test("AC10 反向：守卫清掉后，同一 resume 恢复正常（证明拒绝确由守卫触发）", async () => {
    const project = fixtureProject()
    const { ctx } = createFakeCtx()
    const first = await runDelegate(ctx, { ...BASE, project_dir: project })
    const backendID = first.session_id as string
    const { stateRoot, workRoot } = canonicalRoot(project)
    const token = enterStopGuard(stateRoot, workRoot, backendID, "ses_other_front")
    leaveStopGuard(stateRoot, workRoot, token)
    const again = await runDelegate(ctx, { ...BASE, project_dir: project, resume_session: backendID })
    expect(again.session_id).toBe(backendID)
  })
})
