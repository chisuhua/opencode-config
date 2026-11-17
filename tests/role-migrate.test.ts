/**
 * 迁移脚本（`scripts/role-migrate-v2.sh`）—— 判据：design D6「先写分区再切读侧」
 *
 * 层级：**层 1b**（真跑 shell 脚本 + 真文件）。
 * 验收要点（Task 5 Step 1）：
 *   - **存量 `legacy` 键不被覆盖**（它的 `current_role` 不被顶层镜像改写）；
 *   - **其它存量分区不被丢**；
 *   - **无孤儿分区**（每个分区键都对应一个已知 session 或 `legacy` 桶）。
 */
import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")
const SCRIPT = path.join(ROOT, "scripts", "role-migrate-v2.sh")
const SID = "ses_migrate_aaaaaaaaaaaa"

function makeV1(extraSessions: Record<string, any> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "rmig-"))
  const dir = path.join(root, ".rddf", "state")
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, "role.json")
  writeFileSync(
    file,
    JSON.stringify(
      {
        current_role: "builder",
        updated_at: "2026-11-05T16:01:58Z",
        updated_by: "user",
        session_id: SID,
        history: [{ role: "builder", at: "2026-11-05T16:01:58Z", by: "user" }],
        ...extraSessions,
      },
      null,
      2,
    ) + "\n",
  )
  return { root, file }
}

function migrate(file: string) {
  execFileSync("bash", [SCRIPT, file], {
    env: { ...process.env, CAPTOKEN_STATE_DIR: path.join(path.dirname(file), "migrate-tmp") },
    stdio: "pipe",
  })
}

describe("迁移：存量分区与 legacy 键不被覆盖 + 无孤儿分区", () => {
  test("v1 → v2：写出本 session 的分区；history 保留", () => {
    const { file } = makeV1()
    migrate(file)
    const doc = JSON.parse(readFileSync(file, "utf8"))
    expect(doc.schema_version).toBe("role-v2")
    expect(doc.sessions[SID].current_role).toBe("builder")
    expect(doc.history).toHaveLength(1)
  })

  test("存量 `legacy` 键**不被覆盖**（current_role 保持原值，不被顶层镜像改写）", () => {
    const { file } = makeV1({
      sessions: { legacy: { current_role: "architect", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-05T16:01:58Z" } },
    })
    migrate(file)
    const doc = JSON.parse(readFileSync(file, "utf8"))
    expect(doc.sessions.legacy.current_role).toBe("architect")
    expect(doc.sessions.legacy.updated_at).toBe("2026-11-05T16:01:58Z")
  })

  test("其它存量分区不被丢；**无孤儿分区**（键 ⊆ 已知 session ∪ {legacy}）", () => {
    const known = ["ses_other_bbbbbbbbbbbbbbbb"]
    const { file } = makeV1({
      sessions: {
        legacy: { current_role: "architect", updated_at: "2026-11-05T16:01:58Z" },
        [known[0]!]: { current_role: "verifier", updated_at: "2026-11-06T00:00:00.000Z" },
      },
    })
    migrate(file)
    const doc = JSON.parse(readFileSync(file, "utf8"))
    // 存量分区都在
    expect(doc.sessions[known[0]!].current_role).toBe("verifier")
    expect(doc.sessions.legacy.current_role).toBe("architect")
    // 本 session 的分区被补上
    expect(doc.sessions[SID]).toBeDefined()
    // 无孤儿：分区键只能是已知 session 或 legacy 桶
    const allowed = new Set([...known, "legacy", SID])
    for (const key of Object.keys(doc.sessions)) {
      expect(allowed.has(key), `孤儿分区：${key}`).toBe(true)
    }
  })

  test("已是 v2 的文件 ⇒ 跳过（幂等，不重复改写）", () => {
    const { file } = makeV1()
    migrate(file)
    const first = readFileSync(file, "utf8")
    migrate(file)
    expect(readFileSync(file, "utf8")).toBe(first)
  })
})
