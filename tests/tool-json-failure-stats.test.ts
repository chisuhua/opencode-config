/**
 * tool-json-failure-stats —— 只读统计脚本的层 1 冒烟测试。
 *
 * 用一个**临时构造的会话库**（只建脚本用到的那张表）跑 CLI，断言：
 *   - `--json` 的计数口径（calls / input-json / byModel / byAgent）
 *   - 参数校验（`--days` 非正整数 ⇒ exit 2）
 *
 * ⚠ 不读真实会话库（`~/.local/share/opencode/opencode.db` 是用户数据）。
 */
import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const SCRIPT = path.join(import.meta.dir, "..", "scripts", "tool-json-failure-stats.ts")

type Row = { at: number; agent: string; provider: string; model: string; parts: unknown[] }

function makeDb(rows: Row[]): { dir: string; file: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "tjfs-"))
  const file = path.join(dir, "opencode.db")
  const db = new Database(file, { create: true })
  db.run(
    `CREATE TABLE session_message (
       id text PRIMARY KEY, session_id text NOT NULL, type text NOT NULL, seq integer NOT NULL,
       time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL)`,
  )
  rows.forEach((r, i) => {
    db.run(
      "INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES (?,?,?,?,?,?,?)",
      [
        `msg_${i}`,
        "ses_test",
        "assistant",
        i,
        r.at,
        r.at,
        JSON.stringify({
          agent: r.agent,
          model: { providerID: r.provider, id: r.model },
          content: r.parts,
        }),
      ],
    )
  })
  db.close()
  return { dir, file }
}

const okTool = (name: string) => ({ type: "tool", name, state: { status: "completed" } })
const badTool = (name: string) => ({
  type: "tool",
  name,
  state: { status: "error", error: { type: "tool.input-json", message: "The tool input could not be parsed as JSON" } },
})

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const p = Bun.spawnSync(["bun", SCRIPT, ...args], { stdout: "pipe", stderr: "pipe" })
  return { code: p.exitCode ?? -1, stdout: p.stdout.toString(), stderr: p.stderr.toString() }
}

describe("tool-json-failure-stats：计数口径与参数校验", () => {
  test("--json 输出按天/按模型/按 agent 的 calls 与 input-json 计数", () => {
    const now = Date.now() - 1_000
    const { dir, file } = makeDb([
      { at: now, agent: "build", provider: "minimax-cn", model: "MiniMax-M3.1-Flash", parts: [okTool("shell"), badTool("edit")] },
      { at: now, agent: "build", provider: "minimax-cn", model: "MiniMax-M3.1-Flash", parts: [okTool("read")] },
      { at: now, agent: "explore", provider: "opencode-go", model: "deepseek-v4.1-flash", parts: [okTool("grep")] },
    ])
    try {
      const r = run(["--db", file, "--json"])
      expect(r.code).toBe(0)
      const out = JSON.parse(r.stdout)
      expect(out.total.calls).toBe(4)
      expect(out.total.json).toBe(1)
      expect(out.rate).toBeCloseTo(0.25, 6)
      expect(out.byModel["minimax-cn/MiniMax-M3.1-Flash"].calls).toBe(3)
      expect(out.byModel["minimax-cn/MiniMax-M3.1-Flash"].json).toBe(1)
      expect(out.byModel["opencode-go/deepseek-v4.1-flash"].json).toBe(0)
      expect(out.byAgent.build.calls).toBe(3)
      expect(out.byAgent.build.json).toBe(1)
      expect(out.byAgent.explore.calls).toBe(1)
      // 失败明细带 tool 名与 error 类型
      expect(out.failures[0].tool).toBe("edit")
      expect(out.failures[0].error).toBe("tool.input-json")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("--days 非正整数 ⇒ exit 2 + 可读错误（不静默按默认值跑）", () => {
    const r = run(["--days", "abc"])
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("--days")
  })

  test("--since 非法日期 ⇒ exit 2", () => {
    const r = run(["--since", "not-a-date"])
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("--since")
  })

  test("库不存在 ⇒ exit 2（不抛栈）", () => {
    const r = run(["--db", "/nonexistent/opencode.db"])
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("会话库不存在")
  })
})

// ── --judge：A/B 判据（`docs/CHANGELOG.md` v2.60 / review §2）─────────────────
/** 本地时区「daysAgo 天前的正午」——避开日界与夏令时。 */
function atNoon(daysAgo: number): number {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d.getTime()
}
const N = 1_700
const OK_MODEL = "minimax-cn-openai/MiniMax-M3.1-Flash"
const manyOk = (n: number) => Array.from({ length: n }, () => okTool("shell"))
const manyBad = (n: number) => Array.from({ length: n }, () => badTool("edit"))
const day = (daysAgo: number, agent: string, calls: number, bad = 0): Row => ({
  at: atNoon(daysAgo),
  agent,
  provider: "minimax-cn-openai",
  model: "MiniMax-M3.1-Flash",
  parts: [...manyOk(Math.max(0, calls - bad)), ...manyBad(bad)],
})

describe("tool-json-failure-stats：--judge 判据", () => {
  test("缺 --model ⇒ exit 2（判据只对单一路径的桶成立）", () => {
    const r = run(["--judge"])
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("--model")
  })

  test("PASS：3 个活跃日 × 1,700 calls、总率 0.06% ⇒ exit 0，四条判据全 PASS", () => {
    const { dir, file } = makeDb([day(0, "build", N, 1), day(1, "build", N, 1), day(2, "build", N, 1)])
    try {
      const r = run(["--db", file, "--judge", "--model", OK_MODEL, "--agent", "build", "--days", "5", "--json"])
      expect(r.code).toBe(0)
      const out = JSON.parse(r.stdout)
      expect(out.verdict).toBe("pass")
      expect(out.early).toBe(false)
      expect(out.model).toBe(OK_MODEL)
      expect(out.agent).toBe("build")
      expect(out.total.calls).toBe(3 * N)
      expect(out.criteria.map((x: { id: string; ok: boolean }) => [x.id, x.ok])).toEqual([
        ["C1", true],
        ["C2", true],
        ["C3", true],
        ["C4", false],
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("C4 提前通过：单日 5,000 calls 0 失败 ⇒ PASS（C1 不足 3 活跃日）", () => {
    const { dir, file } = makeDb([day(0, "build", 5_000)])
    try {
      const r = run(["--db", file, "--judge", "--model", OK_MODEL, "--agent", "build", "--days", "5", "--json"])
      expect(r.code).toBe(0)
      const out = JSON.parse(r.stdout)
      expect(out.verdict).toBe("pass")
      expect(out.early).toBe(true)
      expect(out.criteria.find((x: { id: string }) => x.id === "C1").ok).toBe(false)
      expect(out.criteria.find((x: { id: string }) => x.id === "C4").ok).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("C2 单日熔断：总率达标但某活跃日 0.6% ⇒ exit 1（C2 FAIL、C3 PASS）", () => {
    const { dir, file } = makeDb([
      day(0, "build", 1_000, 6), // 0.6% > 0.5%
      day(1, "build", 1_000),
      day(2, "build", 1_000),
      day(3, "build", 2_000),
    ])
    try {
      const r = run(["--db", file, "--judge", "--model", OK_MODEL, "--agent", "build", "--days", "5", "--json"])
      expect(r.code).toBe(1)
      const out = JSON.parse(r.stdout)
      expect(out.verdict).toBe("fail")
      const c = (id: string) => out.criteria.find((x: { id: string }) => x.id === id)
      expect(c("C1").ok).toBe(true)
      expect(c("C2").ok).toBe(false)
      expect(c("C3").ok).toBe(true)
      expect(c("C2").detail).toContain("单日熔断")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("只判 --model 桶：别的 provider 的失败不计入", () => {
    const { dir, file } = makeDb([
      day(0, "build", N),
      day(1, "build", N),
      day(2, "build", N),
      { at: atNoon(0), agent: "build", provider: "minimax-cn", model: "MiniMax-M3.1-Flash", parts: [...manyOk(900), ...manyBad(100)] },
    ])
    try {
      const r = run(["--db", file, "--judge", "--model", OK_MODEL, "--agent", "build", "--days", "5", "--json"])
      expect(r.code).toBe(0)
      const out = JSON.parse(r.stdout)
      expect(out.total.calls).toBe(3 * N)
      expect(out.total.json).toBe(0)
      expect(out.byDay[Object.keys(out.byDay)[0]].calls).toBeLessThanOrEqual(N)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("--agent 收窄：同一模型下 other agent 的失败不计入", () => {
    const { dir, file } = makeDb([
      day(0, "build", N),
      day(1, "build", N),
      day(2, "build", N),
      { at: atNoon(0), agent: "plan", provider: "minimax-cn-openai", model: "MiniMax-M3.1-Flash", parts: [...manyOk(400), ...manyBad(20)] },
    ])
    try {
      const r = run(["--db", file, "--judge", "--model", OK_MODEL, "--agent", "build", "--days", "5", "--json"])
      expect(r.code).toBe(0)
      expect(JSON.parse(r.stdout).total.json).toBe(0)
      // 不加 --agent 时这些失败会进来 ⇒ 判据变红，证明收窄确实生效
      const all = run(["--db", file, "--judge", "--model", OK_MODEL, "--days", "5", "--json"])
      expect(all.code).toBe(1)
      expect(JSON.parse(all.stdout).total.json).toBe(20)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("样本不足：0 失败但 n < 5,000 ⇒ exit 1（低样本 0 失败不算通过证据）", () => {
    const { dir, file } = makeDb([day(0, "build", 100)])
    try {
      const r = run(["--db", file, "--judge", "--model", OK_MODEL, "--agent", "build", "--days", "5", "--json"])
      expect(r.code).toBe(1)
      expect(JSON.parse(r.stdout).criteria.find((x: { id: string }) => x.id === "C4").ok).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

