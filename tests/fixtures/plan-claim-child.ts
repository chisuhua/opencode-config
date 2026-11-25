/**
 * V25 并发子句的子进程夹具：一次 `claim`。
 * 用法: bun plan-claim-child.ts <topicDir> <nodeId> <readyFile> <peerReady>
 *
 * ⚠ barrier：先宣告就绪再等对端 ⇒ 两个进程**真并发**进临界区
 *   （V25 明写「须用确定性编排而非裸并发」）。
 * ⚠ 退出码：= 底层 `claim` 的退出码；**2 = barrier 超时（夹具故障）**
 *   ⇒ 用例必须显式排除 2，否则夹具故障会被当成「被拒」混过去。
 */
import { existsSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"

const [topicDir, nodeId, readyFile, peerReady] = process.argv.slice(2)
const CLI = path.join(import.meta.dir, "..", "..", "scripts", "plan-topic-check.ts")

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

writeFileSync(readyFile!, "1")
const deadline = Date.now() + 5000
while (!existsSync(peerReady!)) {
  if (Date.now() > deadline) {
    console.error("barrier 超时（对端未就绪）")
    process.exit(2)
  }
  sleepSync(5)
}

const r = spawnSync("bun", [CLI, "claim", topicDir!, nodeId!], { encoding: "utf8" })
process.stdout.write(r.stdout ?? "")
process.stderr.write(r.stderr ?? "")
process.exit(r.status ?? 1)
