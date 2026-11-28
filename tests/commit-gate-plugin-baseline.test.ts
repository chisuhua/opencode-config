/**
 * commit-gate **baseline（known_failures）接线层**的测试（`plugins/commit-gate.ts`）
 *
 * ## 为什么单测 `lib/commit-gate.ts` 不够
 *
 * `tests/commit-gate-baseline.test.ts` 只覆盖**纯逻辑**（`matchKnownFailure` / `evaluateInspection` 等），
 * 其中巡检事实是**手工注入**的（`carrierTracked` / `carrierIsSymlink`）。
 * 而**接线层**（真正取事实、真正决定放行/拒、真正落留痕）此前**零覆盖** ——
 * 这正是 ADR D9② 登记过的坑（「纯逻辑测试覆盖不到接线层 ⇒ 接线层覆盖见 `tests/commit-gate-plugin.test.ts`」），
 * 且本仓真实发生过「门禁静默消失两天而 206 个单测全绿」。
 *
 * 本文件**直接 import 插件文件**（宿主加载的是同一个文件、同一张模块图）⇒
 * 「插件能不能被加载」「接线行为对不对」本身变成可测的。
 *
 * ## 覆盖的接线行为（D10①/D10② 在插件侧的真实落地）
 *
 *   ① 命中 ⇒ 放行 + 留痕（notice 串格式 + 账本落盘 `.rddf/state/commit-gate-notices.jsonl`）；
 *   ② 未命中（输出不含 `match`）⇒ 仍拒；
 *   ③ 巡检缺席三态 ⇒ `known_failures` **字段整体无效** ⇒ 退回硬门（拒）：
 *      缺 `inspection` / `carrier` 未 git-tracked / `carrier` 是 symlink；
 *   ④ `known_failures` 条目**绑定**巡检命令 ⇒ 该条目无效 ⇒ 拒。
 */
import { afterAll, describe, expect, mock, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// ⚠ 宿主的 `@opencode/plugin` 是**宿主内建模块**（本地装不上）⇒ 测试里替身。
//   替身只提供插件用到的 `Plugin.define`（恒等函数）⇒ 被测文件本身**一字未改**。
mock.module("@opencode/plugin", () => ({ Plugin: { define: (x: any) => x } }))

const PLUGIN_PATH = path.resolve(import.meta.dir, "..", "plugins", "commit-gate.ts")
const REPOS: string[] = []

const FAIL_CMD = ["bash", "-c", "echo KNOWNFAIL_MARKER; exit 1"]
const OK_CMD = ["bash", "-c", "exit 0"]
const CARRIER = ".rddf/commit-gate-known-failures.json"

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" })
}

/**
 * 建一个**真实** git 仓库 + 一份带 baseline 的声明。
 *
 * @param opts.carrierMode `tracked`（默认，载体已入库）/ `untracked`（载体只在盘上）/ `symlink`（载体是指向别处的链接）
 * @param opts.omitInspection 声明里**不写** `inspection` ⇒ 巡检缺席
 * @param opts.bindToInspection 把 `known_failures` 绑到巡检命令上 ⇒ 该条目无效
 * @param opts.match 命中模式（默认 `KNOWNFAIL_MARKER`）
 */
function makeRepo(
  opts: {
    carrierMode?: "tracked" | "untracked" | "symlink"
    omitInspection?: boolean
    bindToInspection?: boolean
    match?: string
  } = {},
): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cg-plugin-baseline-"))
  REPOS.push(dir)
  git(dir, ["init", "-q"])
  git(dir, ["config", "user.email", "t@example.com"])
  git(dir, ["config", "user.name", "t"])
  writeFileSync(path.join(dir, "seed.txt"), "seed\n")
  git(dir, ["add", "seed.txt"])
  git(dir, ["commit", "-qm", "seed"])

  // 巡检载体
  mkdirSync(path.join(dir, ".rddf"), { recursive: true })
  if (opts.carrierMode === "symlink") {
    symlinkSync(path.join(dir, "seed.txt"), path.join(dir, CARRIER))
  } else {
    writeFileSync(path.join(dir, CARRIER), "{}\n")
    if (opts.carrierMode !== "untracked") git(dir, ["add", CARRIER])
  }

  const known = [
    {
      command: opts.bindToInspection ? OK_CMD : FAIL_CMD,
      match: opts.match ?? "KNOWNFAIL_MARKER",
    },
  ]
  const decl: Record<string, unknown> = {
    verify_commands: [FAIL_CMD, OK_CMD],
    known_failures: known,
  }
  if (!opts.omitInspection) decl.inspection = { command: OK_CMD, carrier: CARRIER }
  writeFileSync(path.join(dir, ".rddf", "commit-gate.json"), JSON.stringify(decl))

  // 暂存区非空（门禁的硬门之一）+ 角色钉住
  writeFileSync(path.join(dir, "f.txt"), "x\n")
  git(dir, ["add", "f.txt"])
  mkdirSync(path.join(dir, ".rddf", "state"), { recursive: true })
  writeFileSync(
    path.join(dir, ".rddf", "state", "role.json"),
    JSON.stringify({ current_role: "builder", session_id: "ses_test", sessions: { ses_test: { current_role: "builder" } } }),
  )
  return dir
}

async function loadHook(dir: string): Promise<(e: any) => Promise<void>> {
  const mod = await import(PLUGIN_PATH)
  const plugin = mod.default as any
  let hook: ((e: any) => Promise<void>) | undefined
  const ctx = {
    tool: {
      hook: (_name: string, fn: (e: any) => Promise<void>) => {
        hook = fn
      },
    },
    session: {
      get: async () => ({ agent: "build", location: { directory: dir } }),
    },
  }
  await plugin.setup(ctx)
  if (!hook) throw new Error("插件没有注册 hook")
  return hook
}

function event(dir: string, command: string): any {
  return { tool: "shell", input: { command, workdir: dir }, sessionID: "ses_test" }
}

/** 账本（留痕）内容 —— 不存在 ⇒ 空串。 */
function ledger(dir: string): string {
  const p = path.join(dir, ".rddf", "state", "commit-gate-notices.jsonl")
  return existsSync(p) ? readFileSync(p, "utf8") : ""
}

afterAll(() => {
  for (const dir of REPOS) rmSync(dir, { recursive: true, force: true })
})

describe("baseline 命中面（放行 + 留痕）", () => {
  test("命中 ⇒ 放行，且账本留下 `baseline 命中: <argv> / match=<pattern>`", async () => {
    const dir = makeRepo()
    const hook = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).resolves.toBeUndefined()
    const text = ledger(dir)
    expect(text).toContain("baseline 命中: bash -c echo KNOWNFAIL_MARKER; exit 1 / match=KNOWNFAIL_MARKER")
    // ⚠ 留痕是**接线层**的责任 ⇒ 「不留痕 ⇒ 红」这条判别力就落在这条断言上
    expect(text.trim().split("\n").length).toBeGreaterThanOrEqual(1)
  })

  test("未命中（输出不含 match）⇒ 仍拒", async () => {
    const dir = makeRepo({ match: "SOMETHING_ELSE_NOT_PRESENT" })
    const hook = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).rejects.toThrow()
    expect(ledger(dir)).not.toContain("baseline 命中")
  })
})

describe("巡检缺席面（字段整体无效 ⇒ 退回硬门）", () => {
  // ⚠ 这三条同时是**「拒绝路径也要留痕」**的判据：`evaluateCommitGate` 的拒绝分支
  //   **必须**回传 `notices`（`lib/commit-gate.ts`）⇒ 插件在拒绝路径上把 notice 落进账本。
  //   历史：2026-11-28 接线层用例首次跑出来时这里是**红的**（拒绝分支不回传 notices ⇒
  //   「声明不可用」只有抛错、没有留痕 ⇒ D9② 的「检测 ≠ 拦截」在拒绝路径上失效）⇒ 同批修复。
  test("缺 inspection ⇒ 拒，且留痕指名「缺少 inspection」", async () => {
    const dir = makeRepo({ omitInspection: true })
    const hook = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).rejects.toThrow()
    expect(ledger(dir)).toContain("缺少 inspection")
    expect(ledger(dir)).not.toContain("baseline 命中")
  })

  test("carrier 未 git-tracked ⇒ 拒，且留痕指名「未 git-tracked」", async () => {
    const dir = makeRepo({ carrierMode: "untracked" })
    const hook = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).rejects.toThrow()
    expect(ledger(dir)).toContain("未 git-tracked")
    expect(ledger(dir)).not.toContain("baseline 命中")
  })

  test("carrier 是 symlink ⇒ 拒，且留痕指名「symlink」", async () => {
    const dir = makeRepo({ carrierMode: "symlink" })
    const hook = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).rejects.toThrow()
    expect(ledger(dir)).toContain("symlink")
    expect(ledger(dir)).not.toContain("baseline 命中")
  })
})

describe("绑定面", () => {
  test("known_failures 条目绑定巡检命令 ⇒ 该条目无效 ⇒ 拒", async () => {
    const dir = makeRepo({ bindToInspection: true })
    const hook = await loadHook(dir)
    await expect(hook(event(dir, "git commit -m x"))).rejects.toThrow()
    expect(ledger(dir)).not.toContain("baseline 命中")
  })
})
