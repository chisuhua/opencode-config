/**
 * commit-gate **插件接线层**的测试（`plugins/commit-gate.ts`）
 *
 * ## 为什么单测 `lib/commit-gate.ts` 不够
 *
 * `tests/commit-gate.test.ts`（578 行）只覆盖**纯逻辑**：命令识别 / 闭口 / 三判据组合。
 * **接线层此前零覆盖** —— 而 2026-11-20 的事故形态恰恰出在接线层：
 * 插件在宿主里加载失败 ⇒ 门禁静默消失，206 个单测全绿。
 *
 * 本文件**直接 import 插件文件**（宿主加载的是同一个文件、同一张模块图）⇒
 * 「插件能不能被加载」这件事本身变成可测的：模块图里任何一个导出对不上，
 * 这个文件就会在 import 阶段炸掉（而不是等门禁静默失效）。
 *
 * ## 覆盖的接线行为
 *
 *   ① hook 注册名（`execute.before`）+ 非 shell 工具不拦；
 *   ② force push 兜底（push-gate 同插件硬拒）；
 *   ③ 命令闭口（`git -C` 换仓 ⇒ 拒）；
 *   ④ fail-closed：无 sessionID ⇒ 拒；
 *   ⑤ 三判据在真实 git 暂存区上的落地：暂存区空 / 越写集 / 验证失败 / 全绿放行；
 *   ⑥ 无声明仓库 ⇒ 不设门禁 ⇒ 放行（ADR D9⑪）。
 */
import { afterAll, describe, expect, mock, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// ⚠ 宿主的 `@opencode/plugin` 是**宿主内建模块**（本地装不上）⇒ 测试里替身。
//   替身只提供插件用到的 `Plugin.define`（恒等函数）⇒ 被测文件本身**一字未改**。
mock.module("@opencode/plugin", () => ({ Plugin: { define: (x: any) => x } }))

const PLUGIN_PATH = path.resolve(import.meta.dir, "..", "plugins", "commit-gate.ts")
const REPOS: string[] = []

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" })
}

/** 建一个**真实** git 仓库（门禁要读真实暂存区 ⇒ 不能用假 git）。 */
function makeRepo(opts: { declaration?: string[] | null } = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cg-plugin-"))
  REPOS.push(dir)
  git(dir, ["init", "-q"])
  git(dir, ["config", "user.email", "t@example.com"])
  git(dir, ["config", "user.name", "t"])
  writeFileSync(path.join(dir, "seed.txt"), "seed\n")
  git(dir, ["add", "seed.txt"])
  git(dir, ["commit", "-qm", "seed"])

  const decl = opts.declaration === undefined ? [["true"]] : opts.declaration
  if (decl !== null) {
    mkdirSync(path.join(dir, ".rddf"), { recursive: true })
    writeFileSync(path.join(dir, ".rddf", "commit-gate.json"), JSON.stringify({ verify_commands: decl }))
  }
  return dir
}

/** 钉住本 session 的角色（角色身份链的第一环：session 分区）。 */
function setRole(dir: string, role: string, sid = "ses_test"): void {
  mkdirSync(path.join(dir, ".rddf", "state"), { recursive: true })
  writeFileSync(
    path.join(dir, ".rddf", "state", "role.json"),
    JSON.stringify({ current_role: role, session_id: sid, sessions: { [sid]: { current_role: role } } }),
  )
}

/** 加载插件、跑 setup、取出注册的 hook。 */
async function loadHook(dir: string): Promise<{ pluginId: string; hookName: string; hook: (e: any) => Promise<void> }> {
  const mod = await import(PLUGIN_PATH)
  const plugin = mod.default as any
  let hookName = ""
  let hook: ((e: any) => Promise<void>) | undefined
  const ctx = {
    tool: {
      hook: (name: string, fn: (e: any) => Promise<void>) => {
        hookName = name
        hook = fn
      },
    },
    session: {
      get: async () => ({ agent: "build", location: { directory: dir } }),
    },
  }
  await plugin.setup(ctx)
  if (!hook) throw new Error("插件没有注册 hook")
  return { pluginId: plugin.id, hookName, hook }
}

function event(dir: string, command: string, sid: string | undefined = "ses_test"): any {
  return { tool: "shell", input: { command, workdir: dir }, sessionID: sid }
}

afterAll(() => {
  for (const dir of REPOS) rmSync(dir, { recursive: true, force: true })
})

// ── 接线面 ─────────────────────────────────────────────────────────────────

describe("插件加载与 hook 注册", () => {
  test("默认导出带 id=commit-gate，setup 注册 execute.before", async () => {
    const dir = makeRepo()
    const { pluginId, hookName } = await loadHook(dir)
    expect(pluginId).toBe("commit-gate")
    expect(hookName).toBe("execute.before")
  })
})

describe("放行面（不该拦的）", () => {
  test("非 shell 工具 ⇒ 直接放行", async () => {
    const dir = makeRepo()
    const { hook } = await loadHook(dir)
    await expect(hook({ tool: "read", input: { command: "git commit -m x" }, sessionID: "ses_test" })).resolves.toBeUndefined()
  })

  test("非 commit 命令 ⇒ 放行", async () => {
    const dir = makeRepo()
    const { hook } = await loadHook(dir)
    await expect(hook(event(dir, "ls -la"))).resolves.toBeUndefined()
  })

  test("无声明仓库 ⇒ 不设门禁 ⇒ 放行（ADR D9⑪）", async () => {
    const dir = makeRepo({ declaration: null })
    setRole(dir, "builder")
    writeFileSync(path.join(dir, "f.txt"), "x\n")
    git(dir, ["add", "f.txt"])
    const { hook } = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).resolves.toBeUndefined()
  })
})

describe("闭口面（必须拦的）", () => {
  test("force push ⇒ 硬拒（push-gate 同插件兜底）", async () => {
    const dir = makeRepo()
    const { hook } = await loadHook(dir)
    await expect(hook(event(dir, "git push --force origin main"))).rejects.toThrow(/force push/i)
  })

  test("`git -C` 换仓 ⇒ 拒（判定对象必须可定位）", async () => {
    const dir = makeRepo()
    const { hook } = await loadHook(dir)
    await expect(hook(event(dir, "git -C /tmp commit -m x"))).rejects.toThrow(/换仓/)
  })

  test("无 sessionID ⇒ 拒（fail-closed）", async () => {
    const dir = makeRepo()
    const { hook } = await loadHook(dir)
    const ev = event(dir, "git commit -m x")
    delete ev.sessionID
    await expect(hook(ev)).rejects.toThrow(/sessionID/)
  })
})

describe("三判据在真实暂存区上的落地", () => {
  test("暂存区为空 ⇒ 拒", async () => {
    const dir = makeRepo()
    setRole(dir, "builder")
    const { hook } = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).rejects.toThrow(/暂存区为空/)
  })

  test("暂存内容越出角色写集 ⇒ 拒（no-role 一律拒写）", async () => {
    const dir = makeRepo()
    setRole(dir, "no-role")
    writeFileSync(path.join(dir, "f.txt"), "x\n")
    git(dir, ["add", "f.txt"])
    const { hook } = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).rejects.toThrow(/越出当前角色的写集/)
  })

  test("验证命令失败 ⇒ 拒", async () => {
    const dir = makeRepo({ declaration: [["false"]] })
    setRole(dir, "builder")
    writeFileSync(path.join(dir, "f.txt"), "x\n")
    git(dir, ["add", "f.txt"])
    const { hook } = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).rejects.toThrow(/验证命令失败/)
  })

  test("三判据全绿 ⇒ 放行", async () => {
    const dir = makeRepo({ declaration: [["true"]] })
    setRole(dir, "builder")
    writeFileSync(path.join(dir, "f.txt"), "x\n")
    git(dir, ["add", "f.txt"])
    const { hook } = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).resolves.toBeUndefined()
  })
})
