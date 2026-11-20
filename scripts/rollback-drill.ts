/**
 * rollback-drill —— **回滚可达性**的机械验证（CLI）
 *
 * 把「机制退役后仓库仍自洽吗？」变成可重复的一条命令：
 * 在**隔离副本**里执行清单（删文件 + 逐段改）→ 跑验证命令 → 报退出码。
 *
 * ## 用法
 *
 *   bun scripts/rollback-drill.ts .rddf/rollback/commit-gate.json            # 执行
 *   bun scripts/rollback-drill.ts <清单> --dry-run                           # 只检查清单可执行性
 *   bun scripts/rollback-drill.ts <清单> --json                              # 机读
 *   bun scripts/rollback-drill.ts <清单> --keep                              # 保留副本（取证）
 *   bun scripts/rollback-drill.ts <清单> --repo <dir>                        # 指定仓库根（默认 = git toplevel）
 *
 * ## 退出码
 *
 *   0 = 通过（清单可执行 **且** 验证命令全绿）
 *   1 = 失败（清单漂移 / 应用失败 / 验证命令非 0）
 *   2 = 跳过（不是 git 仓库 / clone 失败 / 嵌套调用被拒）
 *
 * ## 安全（硬约束）
 *
 * - **只在临时副本里动手**：`mirrorRoot`（真仓）永远只读；断言副本路径在 `tmpdir` 下且 ≠ 真仓；
 * - **不做部分应用**：先 `planDrill` 全量校验，任一条不满足 ⇒ 一个字节都不写；
 * - **嵌套拒绝**：验证命令带 `ROLLBACK_DRILL_CHILD=1`；若本进程已在该环境里 ⇒ 默认拒绝（防 drill 里跑 drill 的无限递归）。
 *
 * ⚠ **纪律**（2026-11-20 事故固化）：**不要在活宿主正在加载的 `lib/` / `plugins/` 路径上做回滚/变异**——
 *   宿主会监视这些文件并重载插件，可能缓存坏实例 ⇒ 门禁消失。用本脚本（隔离副本）就没有这个问题。
 */
import { execFile } from "node:child_process"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import {
  DrillError,
  applyDrill,
  parseManifest,
  planDrill,
  seedDrillEnv,
  verifyCommands,
  type DrillProblem,
  type Manifest,
} from "../lib/rollback-drill.ts"
import { readFileSync } from "node:fs"

const execFileAsync = promisify(execFile)
const OUTPUT_TAIL = 3000

interface Args {
  manifest: string
  dryRun: boolean
  json: boolean
  keep: boolean
  repo?: string
}

function parseArgs(argv: string[]): Args {
  const out: Args = { manifest: "", dryRun: false, json: false, keep: false }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === "--dry-run") out.dryRun = true
    else if (a === "--json") out.json = true
    else if (a === "--keep") out.keep = true
    else if (a === "--repo") out.repo = argv[++i]
    else if (a === "-h" || a === "--help") {
      process.stdout.write("用法: rollback-drill <manifest.json> [--dry-run] [--json] [--keep] [--repo <dir>]\n")
      process.exit(0)
    } else rest.push(a)
  }
  if (rest.length !== 1) {
    process.stderr.write("rollback-drill: 需要恰好一个清单路径（见 --help）\n")
    process.exit(1)
  }
  out.manifest = rest[0]!
  return out
}

async function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs = 600_000) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env })
    return { code: 0, out: `${stdout}${stderr}` }
  } catch (e: any) {
    return {
      code: typeof e?.code === "number" ? e.code : 1,
      out: `${typeof e?.stdout === "string" ? e.stdout : ""}${typeof e?.stderr === "string" ? e.stderr : String(e?.message ?? e)}`,
    }
  }
}

function fail(msg: string, code = 1): never {
  process.stderr.write(`${msg}\n`)
  process.exit(code)
}

const args = parseArgs(process.argv.slice(2))

// ① 嵌套拒绝（防 drill 里跑 drill 的无限递归）
if (process.env.ROLLBACK_DRILL_CHILD === "1") {
  fail("rollback-drill: 检测到嵌套调用（ROLLBACK_DRILL_CHILD=1）⇒ 拒绝（防无限递归）", 2)
}

// ② 真仓根
const repoProbe = await run("git", ["rev-parse", "--show-toplevel"], args.repo ?? process.cwd(), process.env, 30_000)
if (repoProbe.code !== 0) fail(`rollback-drill: 取不到仓库根（不是 git 仓库？）\n${repoProbe.out.slice(-500)}`, 2)
const mirrorRoot = path.resolve(repoProbe.out.trim())

// ③ 清单
const manifestPath = path.isAbsolute(args.manifest) ? args.manifest : path.resolve(process.cwd(), args.manifest)
if (!existsSync(manifestPath)) fail(`rollback-drill: 清单不存在：${manifestPath}`)
let manifest: Manifest
try {
  manifest = parseManifest(readFileSync(manifestPath, "utf8"))
} catch (e) {
  if (e instanceof DrillError) fail(`rollback-drill: 清单非法（${e.code}）：${e.message}`)
  throw e
}

// ④ 隔离副本（真仓只读）
const sandboxParent = mkdtempSync(path.join(tmpdir(), "rollback-drill-"))
const cloneDir = path.join(sandboxParent, "repo")
const cleanup = () => {
  if (!args.keep) rmSync(sandboxParent, { recursive: true, force: true })
}
const clone = await run("git", ["clone", "-q", "--no-hardlinks", mirrorRoot, cloneDir], sandboxParent, process.env, 120_000)
if (clone.code !== 0) {
  cleanup()
  fail(`rollback-drill: clone 失败\n${clone.out.slice(-800)}`, 2)
}
// 安全断言：副本必须在 tmpdir 下、且 ≠ 真仓
const relToTmp = path.relative(tmpdir(), cloneDir)
if (relToTmp.startsWith("..") || path.isAbsolute(relToTmp) || path.resolve(cloneDir) === mirrorRoot) {
  cleanup()
  fail(`rollback-drill: 副本路径异常（拒绝在非临时目录里动手）：${cloneDir}`, 2)
}

// ⑤ 演练环境准备（补 clone 必然缺的 gitignored 运行态；不属于回滚步骤）+ 全量校验（不做部分应用）
const seeded = seedDrillEnv(manifest, cloneDir)
const plan = planDrill(manifest, cloneDir)
const problems: DrillProblem[] = plan.problems

if (args.dryRun || problems.length > 0) {
  const payload = { mechanism: manifest.mechanism, ok: problems.length === 0, problems, seeded, clone: args.keep ? cloneDir : undefined }
  if (args.json) process.stdout.write(JSON.stringify(payload, null, 2) + "\n")
  else if (problems.length === 0) process.stdout.write(`DRY-RUN OK: ${manifest.mechanism}（清单可执行）\n`)
  else {
    process.stdout.write(`DRY-RUN FAIL: ${manifest.mechanism}\n`)
    for (const p of problems) process.stdout.write(`  [${p.kind}] ${p.path}: ${p.detail}\n`)
  }
  if (args.keep) process.stdout.write(`副本保留在：${cloneDir}\n`)
  cleanup()
  process.exit(problems.length === 0 ? 0 : 1)
}

// ⑥ 应用 + 验证
try {
  applyDrill(manifest, cloneDir)
} catch (e) {
  cleanup()
  fail(`rollback-drill: 应用失败\n${(e as Error).message}`)
}

const env = { ...process.env, ROLLBACK_DRILL_CHILD: "1" }
const results: Array<{ argv: string[]; code: number; tail?: string }> = []
for (const argv of verifyCommands(manifest)) {
  const r = await run(argv[0]!, argv.slice(1), cloneDir, env)
  results.push(r.code === 0 ? { argv, code: 0 } : { argv, code: r.code, tail: r.out.slice(-OUTPUT_TAIL) })
  if (r.code !== 0) break
}

const ok = results.every((r) => r.code === 0)
if (args.json) {
  process.stdout.write(
    JSON.stringify({ mechanism: manifest.mechanism, ok, verify: results, clone: args.keep ? cloneDir : undefined }, null, 2) + "\n",
  )
} else if (ok) {
  process.stdout.write(`PASS: ${manifest.mechanism} 回滚后验证全绿（${results.map((r) => r.argv.join(" ")).join(" / ")}）\n`)
} else {
  const bad = results.find((r) => r.code !== 0)!
  process.stdout.write(`FAIL: ${manifest.mechanism} 回滚后验证失败\n$ ${bad.argv.join(" ")}\n--- 输出尾部 ---\n${bad.tail}\n`)
}
if (args.keep) process.stdout.write(`副本保留在：${cloneDir}\n`)
cleanup()
process.exit(ok ? 0 : 1)
