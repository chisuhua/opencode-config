/**
 * AC7 的子进程夹具：一次「读-改-写」（可切换是否用真锁）。
 * 用法: bun rmw-child.ts <stateRoot> <sid> <role> <lock|nolock> <readyFile> <peerReadyFile>
 *
 * ⚠ 关键：临界区内 **sleep 15 ms** 以拉开窗口 —— 无锁时两个进程必然都读到旧值（确定性丢失），
 *   有锁时后者必须等前者释放（确定性不丢）。这把「丢不丢」从概率问题变成必然问题。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { withLock, writeJsonAtomic } from "../../lib/delegate-core.ts"
import { roleFilePath, roleLockDir } from "../../lib/role-lease.ts"

const [root, sid, role, mode, readyFile, peerReady] = process.argv.slice(2)

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// 状态目录必须先存在（`switchRole` 会 mkdir，本夹具直接用 `withLock` ⇒ 自己建）
mkdirSync(path.join(root, ".rddf", "state"), { recursive: true })

// barrier：先宣告就绪，再等对端就绪 ⇒ 两个进程几乎同时进入临界区
writeFileSync(readyFile, "1")
const deadline = Date.now() + 5_000
while (!existsSync(peerReady)) {
  if (Date.now() > deadline) throw new Error("barrier 超时（对端未就绪）")
  sleepSync(5)
}

const rmw = () => {
  const file = roleFilePath(root)
  let doc: any = {}
  try {
    doc = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    doc = {}
  }
  sleepSync(15) // ⚠ 窗口：无锁时两进程都在此读到旧值
  const sessions = doc.sessions && typeof doc.sessions === "object" ? doc.sessions : {}
  sessions[sid] = { current_role: role }
  doc.sessions = sessions
  doc[`marker_${sid}`] = (doc[`marker_${sid}`] ?? 0) + 1
  writeJsonAtomic(file, doc, { cleanupOnError: true })
}

if (mode === "lock") withLock(roleLockDir(root), rmw)
else rmw() // no-op 锁：直接做，模拟「锁被去掉」
