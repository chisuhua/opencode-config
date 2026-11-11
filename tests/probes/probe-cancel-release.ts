/**
 * 探针 P-cancel-release —— **`cancel` 不得在后端仍在跑时释放槽位**（`ADR-front-cancel-release`）。
 *
 * 这是本 ADR 的**前置事实**（探针实证）：旧实现只看 `interrupt` 的返回值就墓碑 + 放槽 ⇒
 * 同一工作树出现**两个写入者**。本脚本把该形态固化为**可复跑的回归**：
 *
 *   1. dispatch A ⇒ 后端 X 在跑；
 *   2. cancel(X) ⇒ 上游 `interrupt` 返回 `{interrupted:true}`（**只表示已接受**），
 *      但 X **仍在跑**（清理未 settle）⇒ 停机证据不足 ⇒ **必须整单拒绝**（不墓碑、不放槽）；
 *   3. 同一工作树再 dispatch Y ⇒ **必须被拒**（槽位仍被 X 占着）。
 *
 * 判据：X 不被墓碑（条目仍 `active`）+ Y 被拒 ⇒ 退出码 0；任一不成立 ⇒ 退出码 1。
 *
 * 运行：`bun tests/probes/probe-cancel-release.ts`
 */

import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { canonicalRoot, readPairs } from "../../lib/delegate-core.ts"
import { dispatchToolDefinition, cancelToolDefinition } from "../../lib/delegate-async.ts"

// 停机确认窗口：生产默认 8s ⇒ 探针会等满整个窗口；这里用短窗口（判据形态不变）
process.env.RDDF_STOP_TIMEOUT_MS = "300"

const TMP = mkdtempSync(path.join("/tmp/opencode", "probe-cancel-"))

function mkRepo(name: string): string {
  const dir = path.join(TMP, name)
  mkdirSync(dir, { recursive: true })
  const git = (args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" })
  git(["init", "-q"])
  git(["config", "user.email", "t@t"])
  git(["config", "user.name", "t"])
  writeFileSync(path.join(dir, "a.txt"), "a\n")
  git(["add", "-A"])
  git(["commit", "-qm", "init"])
  return dir
}

type S = any

/** 假 ctx：`interrupt` **已受理**（`interrupted:true`）但后端**仍在跑**（清理未 settle）。 */
function fakeCtx() {
  const sessions = new Map<string, S>()
  let n = 0
  const ctx: any = {
    session: {
      create: async (input: any) => {
        const id = `ses_c${++n}`
        sessions.set(id, {
          id,
          agent: input.agent,
          location: { directory: input.location.directory },
          metadata: input.metadata ?? {},
          messages: [],
          busy: false,
          idle: 0,
          updated: Date.now(),
        })
        return { id }
      },
      prompt: async (input: any) => {
        const s = sessions.get(input.sessionID)!
        s.messages.push({ id: input.id ?? `m${s.messages.length}`, type: "user", text: input.text, time: { created: Date.now() } })
        s.busy = true
        return { id: input.id }
      },
      wait: async () => ({}),
      get: async (input: any) => {
        const s = sessions.get(input.sessionID)
        if (!s) {
          const e: any = new Error("Session.NotFoundError")
          e._tag = "SessionNotFoundError"
          throw e
        }
        const busyFlag = s.busy
        const time = {
          idle: busyFlag ? 0 : s.idle || Date.now(),
          updated: s.updated,
          ...(busyFlag ? { busy: Date.now() } : {}),
        }
        return { id: s.id, agent: s.agent, location: s.location, metadata: s.metadata, outcome: s.outcome, time }
      },
      context: async (input: any) => sessions.get(input.sessionID)?.messages ?? [],
      update: async (input: any) => {
        const s = sessions.get(input.sessionID)
        if (s && input.metadata !== undefined) s.metadata = input.metadata
        return {}
      },
      interrupt: async (input: any) => {
        const s = sessions.get(input.sessionID)
        if (!s) return { interrupted: false }
        // ⚠️ 关键形态：**已接受中断**，但**清理未 settle** ⇒ 仍在跑
        return { interrupted: true }
      },
      remove: async (input: any) => {
        sessions.delete(input.sessionID)
        return {}
      },
      list: async (input: any) => {
        const all = [...sessions.values()]
        const off = Number(input?.cursor ?? 0)
        return { data: all.slice(off, off + 50), cursor: off + 50 < all.length ? { next: String(off + 50) } : undefined }
      },
    },
  }
  return { ctx, sessions }
}

const run = async (tool: any, input: any) => JSON.parse((await tool.execute(input, { sessionID: "ses_front" })).content)
const base = (dir: string, intent = "goal-a") => ({
  project_dir: dir,
  task: "改 a.txt",
  goal: intent,
  goal_key: { intent },
  scope: ["a.txt"],
  acceptance: "a.txt 变 b",
})

const dir = mkRepo("cancel")
const { ctx, sessions } = fakeCtx()
const a = await run(dispatchToolDefinition(ctx), base(dir))
const X = a.session_id
const { workRoot } = canonicalRoot(dir)

const sx = sessions.get(X)!
console.log(`X = ${X}；后端在跑 = ${sx.busy}`)

const c = await run(cancelToolDefinition(ctx), { session_id: X })
console.log(`cancel → state=${c.state} reason=${c.reason ?? "null"} interrupted=${c.interrupted}`)

const afterCancel = readPairs(dir)
console.log(`cancel 后 X 的 state = ${afterCancel[X]?.state}（不占槽 ⇒ 墓碑 ⇒ 应为 active）`)
console.log(`cancel 后 X 被钉住 = ${afterCancel[X]?.cancel_pending ? "是" : "否"}`)

let yOk = false
let yMsg = ""
try {
  const y = await run(dispatchToolDefinition(ctx), base(dir, "goal-b"))
  yOk = true
  console.log(`Y = ${y.session_id}（被准入）`)
} catch (e: any) {
  yMsg = String(e?.message ?? e)
  console.log(`Y 被拒: ${yMsg.slice(0, 140)}`)
}

const final = readPairs(dir)
const occupants = Object.entries(final).filter(([, e]: any) => e.work_root === workRoot && ["active", "dispatching"].includes(e.state))
console.log(`占槽条目 = ${occupants.length}: ${occupants.map(([id, e]: any) => `${id}@${e.state}`).join(", ") || "无"}`)
console.log(`X 仍在跑 = ${sx.busy}`)

const ok = !yOk && afterCancel[X]?.state === "active" && occupants.length === 1
console.log(`\n结论：${ok ? "✅ cancel 未在后端仍在跑时释放槽位" : "❌ cancel 在后端仍在跑时释放了槽位 ⇒ 同工作树两个写入者"}`)
rmSync(TMP, { recursive: true, force: true })
process.exit(ok ? 0 : 1)
