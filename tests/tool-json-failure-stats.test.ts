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
