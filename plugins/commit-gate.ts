/**
 * commit-gate —— **commit 审批点的宿主接线**（`docs/adr/ADR-commit-verification-gate.md`）
 *
 * 纯逻辑在 `../lib/commit-gate.ts`（命令识别 + 三判据组合）+ `../lib/role-policy.ts`（角色写集单源）
 * + `../lib/role-identity.ts`（身份链）。本文件**只做接线**：取会话 → 取根 → 取声明 → 判定 → 拒绝时抛错。
 *
 * ⚠ **门禁面**：只覆盖 **shell 工具**里的 `git commit` 调用。
 * ⚠ **D5⑥/② 免宣称**：插件缺席 / 未 `service restart` ⇒ 门禁不存在；间接提交（包装脚本 / `eval`）不在门禁内。
 */
import { execFile, execFileSync } from "node:child_process"
import { appendFileSync, lstatSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { Plugin } from "@opencode/plugin"

import { canonicalRoot } from "../lib/delegate-core.ts"
import {
  detectCommitInvocation,
  evaluateCommitGate,
  evaluateInspection,
  matchKnownFailure,
  shouldMatchBaseline,
  readDeclaration,
  type CommitGateDeclaration,
} from "../lib/commit-gate.ts"
import { detectForcePush } from "../lib/push-gate.ts"
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

/** 留痕账本（ADR D10①：运行时可区分「真绿」与「baseline 命中」） */
const NOTICE_LEDGER = path.join(".rddf", "state", "commit-gate-notices.jsonl")

/** 追加一行留痕（失败不改变判定 —— 留痕不是门禁判据）。 */
function appendNotice(workRoot: string, line: string): void {
  try {
    const file = path.join(workRoot, NOTICE_LEDGER)
    mkdirSync(path.dirname(file), { recursive: true })
    appendFileSync(file, line + "\n", "utf8")
  } catch {
    // 留痕失败不改变判定
  }
}

/** 巡检载体是否 git-tracked（`git ls-files --error-unmatch`）。 */
function isTracked(workRoot: string, relPath: string): boolean {
  try {
    const out = execFileSync("git", ["ls-files", "--error-unmatch", "--", relPath], {
      cwd: workRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
    return out.toString().trim().length > 0
  } catch {
    return false
  }
}

/** 巡检载体是否为 symlink（symlink ⇒ 视作缺席）。 */
function isSymlink(workRoot: string, relPath: string): boolean {
  try {
    return lstatSync(path.join(workRoot, relPath)).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * 巡检存在性的静态判定（ADR D10② 的三条硬约束）。
 * ⚠ 缺席 ⇒ known_failures **字段整体无效** ⇒ 退回 D2① 硬门（fail-closed）。
 */
function inspectionUsable(decl: CommitGateDeclaration, workRoot: string): { usable: boolean; reason?: string } {
  const insp = decl.inspection
  if (!insp) return evaluateInspection(decl, { carrierTracked: false, carrierIsSymlink: false })
  return evaluateInspection(decl, {
    carrierTracked: isTracked(workRoot, insp.carrier),
    carrierIsSymlink: isSymlink(workRoot, insp.carrier),
  })
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
      // ① **force push 的工具层兜底**（ADR D4 / D9⑧）：config 的 `deny` 与宿主「Allow always」持久化授权
      //   的优先级未知 ⇒ 曾点过 Always 的用户可能连 force push 也不再被问 ⇒ 工具层直接硬拒。
      const force = detectForcePush(command)
      if (force.isForcePush) {
        throw new Error(force.reason ?? "push-gate: 检测到 force push ⇒ 拒绝")
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
      const sessionCwd = typeof loc === "string" && loc.length > 0 ? loc : process.cwd()
      // ⚠ **判定对象以 shell 的 `workdir` 为准**（ADR D9⑪ 的缓解）：命令就在那儿执行 ⇒ 暂存区 / 写集 / 验证命令
      //   必须按同一个目录算；`workdir` 缺失时回退**会话目录**。
      const wd = input.workdir
      const workCwd = typeof wd === "string" && wd.length > 0 ? wd : sessionCwd
      // ⚠ **两个根不混用**：角色身份（`stateRoot`）按**会话**算；判定对象（`workRoot`）按 **workdir** 算。
      const { stateRoot } = canonicalRoot(sessionCwd)
      const { workRoot } = canonicalRoot(workCwd)

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
      const notices: string[] = []

      // ⚠ **巡检缺席 ⇒ known_failures 字段整体无效 ⇒ 退回 D2① 硬门**（ADR D10②）。
      //   缺席的三条硬约束：inspection 必须存在 / 必须是 verify_commands 的独立条目 /
      //   载体必须 git-tracked 且非 symlink。
      const inspection = inspectionUsable(decl, workRoot)
      const baselineUsable = inspection.usable
      if (!baselineUsable) {
        notices.push(`commit-gate: ${inspection.reason}`)
      }

      for (const argv of decl.verify_commands) {
        const [cmd, ...args] = argv
        const res = await run(cmd!, args, workRoot, timeoutMs)
        if (res.code !== 0) {
          const merged = `${res.stdout}${res.stderr}`
          // ⚠ **超时按未命中处理**（ADR D10① / 后果段风险①）：挂死的命令不因部分输出命中而放行。
          const gate = shouldMatchBaseline(res, baselineUsable)
          const match = gate.ok
            ? matchKnownFailure(decl, argv, merged)
            : { matched: false, reason: gate.reason }
          if (match.matched) {
            notices.push(`baseline 命中: ${argv.join(" ")} / match=${match.pattern}`)
            continue // 已知失败 ⇒ 不阻断（继续跑下一条命令）
          }
          verification = {
            ok: false,
            failedCommand: argv,
            outputTail: merged.slice(-OUTPUT_TAIL),
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
        notices,
      })
      for (const notice of outcome.notices ?? []) {
        appendNotice(workRoot, `${new Date().toISOString()} ${notice}`)
      }
      if (!outcome.allowed) {
        throw new Error(outcome.reason ?? "commit-gate: 拒绝提交（门禁未通过）")
      }
    })
  },
})
