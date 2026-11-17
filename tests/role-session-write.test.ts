/**
 * writeRoleSession —— 派发后端的分区写入（AC6 / AC4 的分区保留）
 *
 * 层级：**层 1b**。判据来源：`proposal.md` AC6。
 */
import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { writeRoleSession } from "../lib/delegate-core.ts"

const MAIN = "ses_aaaaaaaaaaaaaaaaaaaaaaaa"
const BACKEND = "ses_bbbbbbbbbbbbbbbbbbbbbbbb"

function makeState() {
  const root = mkdtempSync(path.join(tmpdir(), "rsw-"))
  const dir = path.join(root, ".rddf", "state")
  mkdirSync(dir, { recursive: true })
  const role = {
    current_role: "architect",
    updated_at: "2026-11-17T00:00:00.000Z", // ⚠ 派发后必须**不变**
    updated_by: "user",
    session_id: MAIN,
    history: [],
    schema_version: "role-v2",
    sessions: {
      legacy: { current_role: "builder", updated_at: "2026-11-05T16:01:58Z" },
      [MAIN]: { current_role: "architect", updated_at: "2026-11-17T00:00:00.000Z" },
    },
  }
  writeFileSync(path.join(dir, "role.json"), JSON.stringify(role, null, 2) + "\n")
  return { root, before: role, file: path.join(dir, "role.json") }
}

describe("AC6 正向：后端分区写入 current_role=builder + role_class", () => {
  test("sessions[backend] = {current_role:'builder', role_class:'verifier'}", () => {
    const { root } = makeState()
    writeRoleSession(root, BACKEND, "build", "verifier")
    const after = JSON.parse(readFileSync(path.join(root, ".rddf", "state", "role.json"), "utf8"))
    expect(after.sessions[BACKEND].current_role).toBe("builder")
    expect(after.sessions[BACKEND].role_class).toBe("verifier")
  })
})

describe("AC6 负向：**顶层不得被回填 / 不得改 updated_at**", () => {
  test("顶层 current_role 仍 architect、updated_at 仍原值（旧 `??` 回填会把它抹成 builder）", () => {
    const { root, file, before } = makeState()
    writeRoleSession(root, BACKEND, "build", "builder")
    const after = JSON.parse(readFileSync(file, "utf8"))
    expect(after.current_role).toBe("architect")
    expect(after.updated_at).toBe(before.updated_at)
    expect(after.session_id).toBe(MAIN)
    // 其它分区保留
    expect(after.sessions[MAIN]).toEqual(before.sessions[MAIN])
    expect(after.sessions.legacy).toEqual(before.sessions.legacy)
  })
})

describe("AC6 fail-closed：非 build agent 必须抛错", () => {
  for (const agent of ["plan", "front", "explore"]) {
    test(`agent=${agent} ⇒ throw（不写非法角色值）`, () => {
      const { root, file, before } = makeState()
      expect(() => writeRoleSession(root, BACKEND, agent, "builder")).toThrow()
      // 抛错后文件不得被改
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(before)
    })
  }
})
