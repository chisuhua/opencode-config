/**
 * delegate 工具的端到端单元测试（假 ctx 驱动，无需真实 opencode 运行时）。
 *
 * 用 `delegateToolDefinition(ctx)` 拿到工具定义，再用一个实现了
 * ctx.session.* 的假 ctx 驱动 execute，验证**双 session 的完整链路**：
 *   brief 校验 → 工程 session 建立（权限定型）→ 简报投递 → 结果回传 →
 *   pair / role 登记 → 续接 → 阻断识别 → 越界检测 → busy 保护。
 *
 * 被委托的示例工程 = rdd-workflow-e2e（复制到临时目录，避免污染其 git 状态）。
 *
 * 运行：bun test tests/
 */
import { afterAll, describe, expect, test } from "bun:test"
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"

import { delegateToolDefinition } from "../lib/delegate-core.ts"

const EXAMPLE_PROJECT = "/workspace/main/rdd-workflow-e2e"
const TMP = mkdtempSync(path.join("/tmp/opencode", "delegate-tool-test-"))

/**
 * 以 rdd-workflow-e2e 为例构造被委托工程。
 * 只复制工作树（排除 .git：git 对象文件只读，复制后不可写），再重新 git init —— 测试只需要
 * 一个可写、可提交、可算 diff 的工程副本。
 */
let fixtureCounter = 0

function fixtureProject(): string {
  if (!existsSync(EXAMPLE_PROJECT)) throw new Error(`示例工程不存在: ${EXAMPLE_PROJECT}`)
  // 每次调用独立目录：同一目录复用会导致第二次 git commit "nothing to commit"
  const dest = path.join(TMP, `rdd-workflow-e2e-${++fixtureCounter}`)
  cpSync(EXAMPLE_PROJECT, dest, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.git${path.sep}`) && !src.endsWith(`${path.sep}.git`),
  })
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
          content: [{ type: "text", text: `已完成：${session.title}` }],
        })
        session.outcome = "succeeded"
        session.idle = Date.now()
        session.updated = session.idle
        return {}
      },
      wait: async () => {},
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

afterAll(() => {
  try {
    rmSync(TMP, { recursive: true, force: true })
  } catch {
    /* 清理失败不影响测试结论 */
  }
})
