/**
 * AC22 的子进程夹具：一次「占租约」。
 * 用法: bun lease-child.ts <stateRoot> <workRoot> <role> <sid> <readyFile> <peerReady>
 *
 * ⚠ barrier：先宣告就绪再等对端 ⇒ 两个进程**真并发**进临界区
 *   （D9.4：「两进程同时起跑」不作判据 ⇒ 必须有 barrier）。
 * ⚠ 退出码：0 = 占用成功；1 = 被拒（冲突）；2 = barrier 超时（夹具故障）。
 */
import { existsSync, writeFileSync } from "node:fs"

import { acquireLease } from "../../lib/role-lease.ts"

const [stateRoot, workRoot, role, sid, readyFile, peerReady] = process.argv.slice(2)

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

writeFileSync(readyFile, "1")
const deadline = Date.now() + 5000
while (!existsSync(peerReady)) {
  if (Date.now() > deadline) {
    console.error("barrier 超时（对端未就绪）")
    process.exit(2)
  }
  sleepSync(5)
}

const res = acquireLease({
  stateRoot,
  workRoot,
  role: role as any,
  sessionID: sid,
  kind: "backend",
})
console.log(res.ok ? "OK" : `REJECT: ${(res as any).reason}`)
process.exit(res.ok ? 0 : 1)
