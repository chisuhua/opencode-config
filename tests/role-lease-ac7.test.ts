/**
 * AC7 —— **无丢失更新 + no-op 锁必丢**（proposal AC7 / design D9.3「必红证据」）
 *
 * 两个子进程经 barrier 同时进入临界区，各做一次读-改-写（临界区内 sleep 15 ms）：
 *   · 用**真锁** ⇒ 串行化 ⇒ 两个分区都在（无丢失）
 *   · 换成 **no-op 锁** ⇒ 两者都读到旧值 ⇒ **必然丢一个分区**（证明判据不是恒真）
 */
import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const FIXTURE = path.join(import.meta.dir, "fixtures", "rmw-child.ts")
const A = "ses_aaaaaaaaaaaaaaaaaaaaaaaa"
const B = "ses_bbbbbbbbbbbbbbbbbbbbbbbb"

function runPair(mode: "lock" | "nolock") {
  const root = mkdtempSync(path.join(tmpdir(), `ac7-${mode}-`))
  const readyA = path.join(root, "readyA")
  const readyB = path.join(root, "readyB")
  const spawn = (sid: string, role: string, myReady: string, peer: string) =>
    Bun.spawn(["bun", FIXTURE, root, sid, role, mode, myReady, peer], { stdout: "pipe", stderr: "pipe" })
  const a = spawn(A, "architect", readyA, readyB)
  const b = spawn(B, "verifier", readyB, readyA)
  return Promise.all([a.exited, b.exited]).then(([ca, cb]) => ({ root, ca, cb }))
}

describe("AC7 无丢失更新（真锁）vs 必丢（no-op 锁）", () => {
  test("真锁：barrier 同时进入 ⇒ 两个分区都在、marker 各 1", async () => {
    const { root, ca, cb } = await runPair("lock")
    expect(ca).toBe(0)
    expect(cb).toBe(0)
    const doc = JSON.parse(readFileSync(path.join(root, ".rddf", "state", "role.json"), "utf8"))
    expect(Object.keys(doc.sessions)).toHaveLength(2)
    expect(doc.sessions[A].current_role).toBe("architect")
    expect(doc.sessions[B].current_role).toBe("verifier")
    expect(doc[`marker_${A}`]).toBe(1)
    expect(doc[`marker_${B}`]).toBe(1)
  })

  test("no-op 锁（变异）：同一场景**必然丢失**至少一个分区 ⇒ 判据有判别力", async () => {
    const { root, ca, cb } = await runPair("nolock")
    expect(ca).toBe(0)
    expect(cb).toBe(0)
    const file = path.join(root, ".rddf", "state", "role.json")
    expect(existsSync(file)).toBe(true)
    const doc = JSON.parse(readFileSync(file, "utf8"))
    // 两者读到同一旧值 ⇒ 后写者覆盖前者 ⇒ 只剩一个分区（或无）——这就是 AC7 要防的丢失
    expect(Object.keys(doc.sessions).length).toBeLessThan(2)
  })
})
