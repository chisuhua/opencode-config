/**
 * role-identity —— 会话身份解析（身份 ADR D1 / D4）
 *
 * 判据来源：`openspec/changes/role-aware-permissions/proposal.md` 的 AC1 / AC2
 *          （↔ `docs/adr/ADR-role-session-identity.md` V1 / V2）。
 * 层级：**层 1b 纯逻辑单测**（无门控、进 CI）—— 定义见 `design.md` D9.1。
 *
 * fixture 纪律（`tasks.md`「fixture 规则」）：
 *   ① 每个用例 `mkdtempSync` **独立父目录**（模型 `ls ..` 会把同族 fixture 当先例）；
 *   ② `role.json` 用**真实 7 分区形状**（`legacy` + 6 个 `ses_*`），`legacy.updated_at` 保持**无毫秒**；
 *   ③ **禁读真实 HOME** —— 全局根一律由 `globalRoot` 注入。
 */
import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import fs, { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// ⚠ 本文件在实现之前**必然红**（TDD Step 1）：`lib/role-identity.ts` 尚不存在。
import { canonicalRoot } from "../lib/delegate-core.ts"
import { resolveRole } from "../lib/role-identity.ts"

const SID_A = "ses_aaaaaaaaaaaaaaaaaaaaaaaa"
const SID_B = "ses_bbbbbbbbbbbbbbbbbbbbbbbb"

/** 真实 7 分区形状 + 顶层镜像（镜像的 session_id 由调用方指定）。 */
function makeState(opts: { mirrorRole: string; mirrorSid: string }): string {
  const root = mkdtempSync(path.join(tmpdir(), "ri-"))
  const stateDir = path.join(root, ".rddf", "state")
  mkdirSync(stateDir, { recursive: true })
  const role = {
    current_role: opts.mirrorRole,
    updated_at: "2026-11-17T00:00:00.000Z",
    updated_by: "user",
    session_id: opts.mirrorSid,
    auto_switch_window: null,
    history: [],
    schema_version: "role-v2",
    sessions: {
      // ⚠ 无毫秒格式（任何规范化重写都会改它 —— AC4 的字节级比较依赖这点）
      legacy: { current_role: "builder", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-05T16:01:58Z" },
      [SID_A]: { current_role: "architect", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:01.000Z" },
      [SID_B]: { current_role: "verifier", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:02.000Z" },
      ses_cccccccccccccccccccccccc: { current_role: "planner", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:03.000Z" },
      ses_dddddddddddddddddddddddd: { current_role: "builder", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:04.000Z" },
      ses_eeeeeeeeeeeeeeeeeeeeeeee: { current_role: "no-role", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:05.000Z" },
    },
  }
  writeFileSync(path.join(stateDir, "role.json"), JSON.stringify(role, null, 2) + "\n")
  return root
}

function makeGlobal(role: string | null): string {
  const root = mkdtempSync(path.join(tmpdir(), "ri-global-"))
  if (role !== null) {
    const dir = path.join(root, ".rddf", "state")
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, "role.json"),
      JSON.stringify({ current_role: role, schema_version: "role-v2", sessions: {} }, null, 2) + "\n",
    )
  }
  return root
}

describe("AC1 同一 role.json 上两个 sid 各读各的分区", () => {
  test("SID_A → architect，SID_B → verifier（同文件、不同结果）", () => {
    const stateRoot = makeState({ mirrorRole: "builder", mirrorSid: SID_A })
    const globalRoot = makeGlobal(null)

    const a = resolveRole({ stateRoot, globalRoot, sessionID: SID_A, agent: "build" })
    const b = resolveRole({ stateRoot, globalRoot, sessionID: SID_B, agent: "build" })

    expect(a.role).toBe("architect")
    expect(b.role).toBe("verifier")
    expect(a.role).not.toBe(b.role) // 只断「返回了某个角色」会塌成同支
    expect(a.source).toBe("partition")
    expect(b.source).toBe("partition")
  })
})

describe("AC2 三分支：镜像 / 全局 / default（断言 source，不只断 role）", () => {
  test("mirror：分区缺失且 role.json.session_id == 本会话 ⇒ 用顶层镜像", () => {
    const unknown = "ses_ffffffffffffffffffffffff"
    const stateRoot = makeState({ mirrorRole: "builder", mirrorSid: unknown })
    const r = resolveRole({ stateRoot, globalRoot: makeGlobal(null), sessionID: unknown, agent: "build" })
    expect(r).toEqual({ role: "builder", source: "mirror" })
  })

  test("global：分区缺失且 session_id 不匹配 ⇒ 全局", () => {
    const unknown = "ses_ffffffffffffffffffffffff"
    const stateRoot = makeState({ mirrorRole: "architect", mirrorSid: SID_A })
    const r = resolveRole({ stateRoot, globalRoot: makeGlobal("planner"), sessionID: unknown, agent: "build" })
    expect(r).toEqual({ role: "planner", source: "global" })
  })

  test("default：分区/镜像/全局都无 ⇒ general", () => {
    const unknown = "ses_ffffffffffffffffffffffff"
    const stateRoot = makeState({ mirrorRole: "architect", mirrorSid: SID_A })
    const r = resolveRole({ stateRoot, globalRoot: makeGlobal(null), sessionID: unknown, agent: "build" })
    expect(r).toEqual({ role: "general", source: "default" })
  })

  test("sid 缺失 ⇒ 跳过镜像步（不得用镜像）+ warning=no-session-id", () => {
    const stateRoot = makeState({ mirrorRole: "architect", mirrorSid: SID_A })
    const r = resolveRole({ stateRoot, globalRoot: makeGlobal("planner"), sessionID: undefined, agent: "build" })
    // ⚠ 若实现「用镜像」，这里会得到 architect/mirror ⇒ 必须红
    expect(r.role).toBe("planner")
    expect(r.source).toBe("global")
    expect(r.warning).toBe("no-session-id")
  })
})

describe("AC10 文件根唯一（linked worktree + symlink）—— ⚠ 禁把 stateRoot 注入成常量", () => {
  const git = (cwd: string, args: string[]) =>
    execFileSync("git", args, { cwd, stdio: "pipe" }).toString()

  /** 真主仓（含 role.json + 一次提交） */
  function makeRepo(): string {
    const repo = mkdtempSync(path.join(tmpdir(), "ri-repo-"))
    git(repo, ["init", "-q"])
    git(repo, ["config", "user.email", "t@t.local"])
    git(repo, ["config", "user.name", "T"])
    writeFileSync(path.join(repo, "a.txt"), "a\n")
    git(repo, ["add", "-A"])
    git(repo, ["commit", "-q", "-m", "init"])
    const dir = path.join(repo, ".rddf", "state")
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, "role.json"),
      JSON.stringify(
        {
          current_role: "builder",
          session_id: SID_A,
          schema_version: "role-v2",
          sessions: { [SID_A]: { current_role: "architect" } },
        },
        null,
        2,
      ) + "\n",
    )
    return repo
  }

  test("linked worktree：真实 canonicalRoot ⇒ stateRoot 仍是主仓；三次读同一文件同一分区", () => {
    const repo = makeRepo()
    const wt = path.join(mkdtempSync(path.join(tmpdir(), "ri-wt-")), "linked")
    git(repo, ["worktree", "add", "-q", wt, "-b", "wt-branch"])

    // 诱饵：worktree 自带一份**不同**的 role.json —— 若实现按 cwd 读会读到它（必红）
    const decoyDir = path.join(wt, ".rddf", "state")
    mkdirSync(decoyDir, { recursive: true })
    // ⚠ 诱饵必须能被**镜像步**命中（带本会话 sid）—— 否则它只落到 default，判别力自证就失效
    writeFileSync(
      path.join(decoyDir, "role.json"),
      JSON.stringify({ current_role: "no-role", session_id: SID_A }) + "\n",
    )

    const { stateRoot, workRoot } = canonicalRoot(wt)
    expect(fs.realpathSync(stateRoot)).toBe(fs.realpathSync(repo))
    expect(fs.realpathSync(workRoot)).toBe(fs.realpathSync(wt))

    for (let i = 0; i < 3; i++) {
      const r = resolveRole({ stateRoot, globalRoot: makeGlobal(null), sessionID: SID_A, agent: "build" })
      expect(r).toEqual({ role: "architect", source: "partition" }) // 诱饵未被读到
    }

    // 判别力自证：若把 worktree 当根（= 旧口径「否则 cwd」的实现）⇒ 读到诱饵 no-role
    // ⇒ 上面三条断言不是恒真（proof: 同一函数、同一 sid、仅换根即得不同结论）
    expect(
      resolveRole({ stateRoot: wt, globalRoot: makeGlobal(null), sessionID: SID_A, agent: "build" }).role,
    ).toBe("no-role")
  })

  test("symlink 变体：链接路径与真实路径解析到同一 stateRoot（同键）", () => {
    const repo = makeRepo()
    const linkParent = mkdtempSync(path.join(tmpdir(), "ri-link-"))
    const link = path.join(linkParent, "via-link")
    symlinkSync(repo, link)

    const a = canonicalRoot(link).stateRoot
    const b = canonicalRoot(repo).stateRoot
    expect(fs.realpathSync(a)).toBe(fs.realpathSync(b))
    expect(resolveRole({ stateRoot: a, globalRoot: makeGlobal(null), sessionID: SID_A, agent: "build" })).toEqual({
      role: "architect",
      source: "partition",
    })
  })
})

describe("Task 1 Step 4：sid 缺失的告警出口（AC2 补充）", () => {
  test("warnSink 恰好被调用 1 次且含 no-session-id；解析结果不得来自镜像", () => {
    const stateRoot = makeState({ mirrorRole: "architect", mirrorSid: SID_A })
    const calls: string[] = []
    const r = resolveRole({
      stateRoot,
      globalRoot: makeGlobal("planner"),
      sessionID: undefined,
      agent: "build",
      warnSink: (m) => calls.push(m),
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain("no-session-id")
    expect(r).toEqual({ role: "planner", source: "global", warning: "no-session-id" })
  })
})
