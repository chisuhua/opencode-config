/**
 * commit-gate —— **commit 审批点的宿主接线**（`docs/adr/ADR-commit-verification-gate.md`）
 *
 * 纯逻辑在 `../lib/commit-gate.ts`（命令识别 + 三判据组合）+ `../lib/role-policy.ts`（角色写集单源）
 * + `../lib/role-identity.ts`（身份链）。本文件**只做接线**：取会话 → 取根 → 取声明 → 判定 → 拒绝时抛错。
 *
 * ⚠ **门禁面**：只覆盖 **shell 工具**里的 `git commit` 调用。
 * ⚠ **D5⑥/② 免宣称**：插件缺席 / 未 `service restart` ⇒ 门禁不存在；间接提交（包装脚本 / `eval`）不在门禁内。
 */
import { execFile } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { Plugin } from "@opencode/plugin"

import { canonicalRoot } from "../lib/delegate-core.ts"
import { detectCommitInvocation, evaluateCommitGate, readDeclaration } from "../lib/commit-gate.ts"
import { readSessionPartition, resolveRole } from "../lib/role-identity.ts"
import { decideWrite } from "../lib/role-policy.ts"

const execFileAsync = promisify(execFile)

const DEFAULT_TIMEOUT_MS = 600_000
const OUTPUT_TAIL = 2000

interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

async function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 })
    return { code: 0, stdout, stderr }
  } catch (e: any) {
    return {
      code: typeof e?.code === "number" ? e.code : 1,
      stdout: typeof e?.stdout === "string" ? e.stdout : "",
      stderr: typeof e?.stderr === "string" ? e.stderr : String(e?.message ?? e),
    }
  }
}

export default Plugin.define({
  id: "commit-gate",
  async setup(ctx) {
    await ctx.tool.hook("execute.before", async (event: any) => {
      if (event?.tool !== "shell") return
      const input = event?.input ?? {}
      const command = typeof input.command === "string" ? input.command : ""
      if (!command) {
        // ⚠ fail-closed：取不到命令 ⇒ 判定不可判定（ADR D6）
        throw new Error("commit-gate: 取不到 shell 命令 ⇒ 拒绝（fail-closed）")
      }
      const invocation = detectCommitInvocation(command)
      if (!invocation.isCommit) {
        if (invocation.block) throw new Error(invocation.block)
        return
      }
      if (invocation.block) throw new Error(invocation.block)

      const sessionID = typeof event?.sessionID === "string" ? event.sessionID : ""
      if (!sessionID) {
        throw new Error("commit-gate: 无 sessionID ⇒ 无法判定角色 ⇒ 拒绝（fail-closed）")
      }
      const session = await ctx.session.get({ sessionID })
      const agent = typeof (session as any)?.agent === "string" ? (session as any).agent : ""
      // ⚠ **不用 `process.cwd()`**（同 role-gate 的既有教训：进程 cwd 会取到另一个仓的根 ⇒ 整条 fail-open）
      const loc = (session as any)?.location?.directory
      const cwd = typeof loc === "string" && loc.length > 0 ? loc : process.cwd()
      const { stateRoot, workRoot } = canonicalRoot(cwd)

      // ① 声明（未声明 ⇒ **不设门禁** ⇒ 放行）
      const { decl, error } = readDeclaration(workRoot)
      if (error) {
        throw new Error(`commit-gate: ${error}`)
      }
      if (!decl) return

      // ② 暂存区状态 + 文件清单
      const staged = await run("git", ["diff", "--cached", "--quiet"], workRoot, 30_000)
      const stagedState: "empty" | "has" | "failed" =
        staged.code === 0 ? "empty" : staged.code === 1 ? "has" : "failed"
      const names = stagedState === "has" ? await run("git", ["diff", "--cached", "--name-only"], workRoot, 30_000) : null
      const stagedFiles = (names?.stdout ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((f) => path.resolve(workRoot, f))

      // ③ 角色写集（主会话 = 身份链；后端 = 其 `role_class` —— ADR D6 同口径）
      const partition = readSessionPartition(stateRoot, sessionID)
      const role = partition?.roleClass
        ? (partition.roleClass as any)
        : resolveRole({ stateRoot, globalRoot: homedir(), sessionID, agent }).role
      const violations: Array<{ file: string; reason: string }> = []
      for (const file of stagedFiles) {
        const verdict = decideWrite({
          role,
          action: "edit",
          filePath: file,
          cwd: workRoot,
          repoRoot: workRoot,
          governanceRoot: homedir() + "/.config/opencode",
        })
        if (!verdict.allowed) {
          violations.push({ file: verdict.relPath || file, reason: verdict.message ?? "越出角色写集" })
        }
      }

      // ① 验证命令（昂贵 ⇒ 最后跑）
      const timeoutMs = decl.timeout_ms ?? DEFAULT_TIMEOUT_MS
      let verification = { ok: true as boolean, failedCommand: undefined as string[] | undefined, outputTail: undefined as string | undefined }
      for (const argv of decl.verify_commands) {
        const [cmd, ...args] = argv
        const res = await run(cmd!, args, workRoot, timeoutMs)
        if (res.code !== 0) {
          verification = {
            ok: false,
            failedCommand: argv,
            outputTail: `${res.stdout}${res.stderr}`.slice(-OUTPUT_TAIL),
          }
          break
        }
      }

      const outcome = evaluateCommitGate({
        declaration: decl,
        stagedFiles,
        stagedState,
        writeSetViolations: violations,
        verification,
      })
      if (!outcome.allowed) {
        throw new Error(outcome.reason ?? "commit-gate: 拒绝提交（门禁未通过）")
      }
    })
  },
})
