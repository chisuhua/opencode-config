/**
 * role-gate **插件接线层**测试（`plugins/role-gate.ts`）—— 重点：治理面写门留痕
 *（`.rddf/reviews/build-model-route-switch-ab.md` §6.5）。
 *
 * ## 为什么需要一个接线层测试
 *
 * `tests/role-policy.test.ts` 覆盖的是**纯逻辑**（注入 `governanceRoot` 的临时目录）。
 * 留痕是**接线层**行为：门控判定之后、抛错之前往 `ledger.jsonl` 追加一行。
 * 纯逻辑测试看不见它 —— 而「接线漏了 ⇒ 审计面静默为空」正是这类行为最常见的坏法。
 *
 * ## ⚠ 为什么这里用真实 `homedir()` 的**路径**而不是注入治理根
 *
 * `defaultGovernanceRoot()` 在插件里是写死的（插件没有注入缝）。本文件只把
 * `homedir()/.config/opencode/<这个名字>` 当**字符串**去判定（`GOVERNANCE_PATHS`
 * 是纯 glob 匹配）—— **不读也不写**那个目录里的任何文件；所有落盘
 * （`ledger.jsonl` / `role-claims.json`）都在 fixture 的 `repo/.rddf/state` 下。
 * ⇒ 不违反「测试禁读真实 HOME」的原意（该规则防的是**依赖用户真实配置内容**）。
 */
import { afterAll, describe, expect, mock, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// 宿主的 `@opencode/plugin` 是内建模块（本地装不上）⇒ 恒等替身；被测文件一字未改。
mock.module("@opencode/plugin", () => ({ Plugin: { define: (x: any) => x } }))

import { leaseKey } from "../lib/role-lease.ts"

const PLUGIN_PATH = path.resolve(import.meta.dir, "..", "plugins", "role-gate.ts")
const DIRS: string[] = []
const SID = "ses_rogate0000000000000000"

/** 真实治理根（只用于拼路径做字符串判定，不触碰文件）。 */
const GOV = path.join(process.env.HOME ?? "/home/ubuntu", ".config", "opencode")
const GOV_FILE = path.join(GOV, "prompts", "build.md")

interface Fx {
  repo: string
  state: string
  ledger: string
}

function makeFixture(opts: { role?: string; agent?: string } = {}): Fx {
  const root = mkdtempSync(path.join(tmpdir(), "rg-plugin-"))
  DIRS.push(root)
  const repo = path.join(root, "repo")
  const state = path.join(repo, ".rddf", "state")
  mkdirSync(state, { recursive: true })
  mkdirSync(path.join(repo, "src"), { recursive: true })
  writeFileSync(path.join(repo, "src", "foo.ts"), "export const x = 1\n")
  const role = opts.role ?? "builder"
  writeFileSync(
    path.join(state, "role.json"),
    JSON.stringify({
      current_role: role,
      updated_at: "2026-11-23T00:00:00.000Z",
      updated_by: "user",
      session_id: SID,
      sessions: { [SID]: { current_role: role } },
    }),
  )
  return { repo, state, ledger: path.join(state, "ledger.jsonl") }
}

interface HookEnv {
  hook: (e: any) => Promise<void>
}

/** 加载插件、跑 setup、取出注册的 hook（会话目录 = fixture 仓）。 */
async function loadHook(fx: Fx, agent = "build", extra: Record<string, unknown> = {}): Promise<HookEnv> {
  const mod = await import(PLUGIN_PATH)
  const plugin = mod.default as any
  let hook: ((e: any) => Promise<void>) | undefined
  await plugin.setup({
    tool: {
      hook: (_name: string, fn: (e: any) => Promise<void>) => {
        hook = fn
      },
    },
    session: { get: async () => ({ agent, location: { directory: fx.repo }, ...extra }) },
  })
  if (!hook) throw new Error("插件没有注册 hook")
  return { hook }
}

const writeEvent = (filePath: string, tool = "write"): any => ({ tool, input: { path: filePath }, sessionID: SID })

/** `ledger.jsonl` 的行（不存在 ⇒ 空数组）。 */
function ledgerRows(fx: Fx): any[] {
  if (!existsSync(fx.ledger)) return []
  return readFileSync(fx.ledger, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l))
}

afterAll(() => {
  for (const dir of DIRS) {
    // chmod 用例可能把状态目录降到只读 ⇒ 先恢复再删（rm 需要目录写权限）
    try {
      chmodSync(path.join(dir, "repo", ".rddf", "state"), 0o700)
    } catch {}
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("治理面写门留痕：拒绝与放行都落一行 ledger", () => {
  test("拒绝：planner 写治理面 ⇒ 抛错 + ledger 一行 deny（含 role/agent/action/path/reason）", async () => {
    const fx = makeFixture({ role: "planner" })
    const { hook } = await loadHook(fx)
    await expect(hook(writeEvent(GOV_FILE))).rejects.toThrow(/治理面/)

    const rows = ledgerRows(fx)
    expect(rows.length).toBe(1)
    expect(rows[0].event).toBe("role_gate_write")
    expect(rows[0].decision).toBe("deny")
    expect(rows[0].role).toBe("planner")
    expect(rows[0].agent).toBe("build")
    expect(rows[0].action).toBe("write")
    expect(rows[0].session_id).toBe(SID)
    expect(rows[0].path).toBe("prompts/build.md")
    expect(rows[0].reason).toContain("治理面")
    expect(typeof rows[0].at).toBe("string")
  })

  test("放行：architect 写治理面 ⇒ 不抛 + ledger 一行 allow（无 reason），且租约已占", async () => {
    const fx = makeFixture({ role: "architect" })
    const { hook } = await loadHook(fx)
    await expect(hook(writeEvent(GOV_FILE, "edit"))).resolves.toBeUndefined()

    const rows = ledgerRows(fx)
    expect(rows.length).toBe(1)
    expect(rows[0].decision).toBe("allow")
    expect(rows[0].role).toBe("architect")
    expect(rows[0].action).toBe("edit")
    expect(rows[0].reason).toBeUndefined()
    // 放行路径确实走完了租约围栏（同一事务里写了 claims）
    expect(existsSync(path.join(fx.state, "role-claims.json"))).toBe(true)
  })

  test("放行面不止 architect：builder 写治理面同样留痕（`governance: true` 的角色都要可审计）", async () => {
    const fx = makeFixture({ role: "builder" })
    const { hook } = await loadHook(fx)
    await expect(hook(writeEvent(GOV_FILE))).resolves.toBeUndefined()
    const rows = ledgerRows(fx)
    expect(rows.length).toBe(1)
    expect(rows[0].role).toBe("builder")
    expect(rows[0].decision).toBe("allow")
  })

  test("非治理面：仓库内放行 / 拒绝都**不**留痕（只记治理面）", async () => {
    const ok = makeFixture({ role: "builder" })
    const h1 = await loadHook(ok)
    await expect(h1.hook(writeEvent(path.join(ok.repo, "src", "foo.ts")))).resolves.toBeUndefined()
    expect(existsSync(ok.ledger)).toBe(false)

    const denied = makeFixture({ role: "architect" })
    const h2 = await loadHook(denied)
    await expect(h2.hook(writeEvent(path.join(denied.repo, "src", "foo.ts")))).rejects.toThrow(/architect/)
    expect(existsSync(denied.ledger)).toBe(false)
  })

  test("append 语义：两次治理面写入 ⇒ 两行（JSONL 不覆盖）", async () => {
    const fx = makeFixture({ role: "planner" })
    const { hook } = await loadHook(fx)
    await expect(hook(writeEvent(GOV_FILE))).rejects.toThrow(/治理面/)
    await expect(hook(writeEvent(GOV_FILE))).rejects.toThrow(/治理面/)
    const rows = ledgerRows(fx)
    expect(rows.length).toBe(2)
    expect(rows.every((r) => r.event === "role_gate_write" && r.decision === "deny")).toBe(true)
  })

  test("留痕失败不影响判定：状态目录只读 ⇒ 仍按治理面规则抛错（不因留痕崩）", async () => {
    if ((process.getuid?.() ?? 0) === 0) return // root 绕过文件权限 ⇒ 该用例在 root 下无意义
    const fx = makeFixture({ role: "planner" })
    const { hook } = await loadHook(fx)
    chmodSync(fx.state, 0o500) // 写不进 .role.lock / ledger.jsonl
    try {
      await expect(hook(writeEvent(GOV_FILE))).rejects.toThrow(/治理面/)
    } finally {
      chmodSync(fx.state, 0o700)
    }
  })

  test("门控跳过的会话（被派发后端）不留痕：gate 不生效 ⇒ 放行且**没有** ledger 行", async () => {
    const fx = makeFixture({ role: "planner" })
    // parentID 非空 ⇒ 被派发后端 ⇒ 门控不生效（ADR D3；后端另走 scope 规则）
    const { hook } = await loadHook(fx, "build", { parentID: "ses_parent" })
    await expect(hook(writeEvent(GOV_FILE))).resolves.toBeUndefined()
    expect(existsSync(fx.ledger)).toBe(false)
  })

  test("治理面清单本体（ADR-governance-paths-ownership V4）：architect 放行 + 留痕；planner 被拒", async () => {
    // ⚠ 清单本体是**自纳入**的治理面（ADR D2.2）⇒ 其变更既进写门留痕，也进治理面必审通道。
    const cfgFile = path.join(GOV, ".rddf", "config", "governance-paths.json")

    const ok = makeFixture({ role: "architect" })
    const h1 = await loadHook(ok)
    await expect(h1.hook(writeEvent(cfgFile, "edit"))).resolves.toBeUndefined()
    const okRows = ledgerRows(ok)
    expect(okRows.length, "architect 写清单本体应留一行痕").toBe(1)
    expect(okRows[0].event).toBe("role_gate_write")
    expect(okRows[0].decision).toBe("allow")
    expect(okRows[0].path, "留痕的路径相对治理根").toBe(".rddf/config/governance-paths.json")

    const no = makeFixture({ role: "planner" })
    const h2 = await loadHook(no)
    await expect(h2.hook(writeEvent(cfgFile, "edit"))).rejects.toThrow(/治理面/)
    const noRows = ledgerRows(no)
    expect(noRows.length).toBe(1)
    expect(noRows[0].decision).toBe("deny")
    expect(noRows[0].path).toBe(".rddf/config/governance-paths.json")
  })

  test("租约拒绝分支也留痕：角色判定放行、但租约被他人持有 ⇒ ledger 记 deny（reason 含租约）", async () => {
    const fx = makeFixture({ role: "architect" })
    const now = new Date().toISOString()
    writeFileSync(
      path.join(fx.state, "role-claims.json"),
      JSON.stringify({
        schema_version: "role-claims-v1",
        claims: {
          [leaseKey(fx.repo, "architect")]: {
            work_root: fx.repo,
            role: "architect",
            session_id: "ses_other",
            kind: "main",
            claim_gen: 7,
            state: "active",
            acquired_at: now,
            heartbeat_at: now, // 新鲜心跳 ⇒ 持有者存活 ⇒ 不接管（ADR D6 判活）
          },
        },
        holders: { ses_other: { work_root: fx.repo, role: "architect", claim_gen: 7 } },
      }),
    )
    const { hook } = await loadHook(fx)
    await expect(hook(writeEvent(GOV_FILE))).rejects.toThrow(/租约/)

    const rows = ledgerRows(fx)
    expect(rows.length).toBe(1)
    expect(rows[0].decision).toBe("deny")
    expect(rows[0].role).toBe("architect")
    expect(rows[0].reason).toContain("租约")
  })
})
