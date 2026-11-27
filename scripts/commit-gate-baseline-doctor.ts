/**
 * commit-gate-baseline-doctor —— **巡检层**（ADR D10②）
 *
 * 回答唯一的问题：**声明里的 baseline 还是真的吗？**
 *
 * ⚠ **不复用子串语义**（这是本脚本存在的全部理由）：commit 路径的命中判定用的是
 * 「输出含 `match`」，若巡检也用它，则 `match: "3 fail"` 在失败数涨到 13 时
 * （输出 `"13 fail"` 仍含 `"3 fail"`）会**永远命中** ⇒ baseline 实增而无人察觉。
 * ⇒ 本脚本按 **标识集合**（逐工具提取器）比对：每条 `known_failures` 必须映射到
 * **≥1 个当前实际存在的失败标识**，否则该条**不再命中**。
 *
 * ## 用法
 *
 *   bun scripts/commit-gate-baseline-doctor.ts            # 人读
 *   bun scripts/commit-gate-baseline-doctor.ts --json     # 机读
 *
 * ## 退出码
 *
 *   0 = pass（每条 baseline 都仍对应真实失败）
 *   1 = red（某条不再命中 ⇒ baseline 腐坏；或声明形状非法）
 *   2 = skip（判定不可得：读不到声明 / 命令跑不了 / 无提取器）
 *
 * ⚠ 本脚本**只读**（不改声明、不改 baseline、不代写）。
 */
import { execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const DEFAULT_TIMEOUT_MS = 600_000
const DECLARATION_REL = path.join(".rddf", "commit-gate.json")

export interface KnownFailure {
  command: string[]
  match: string
}
export interface Declaration {
  verify_commands: string[][]
  known_failures?: KnownFailure[]
  inspection?: { command: string[]; carrier: string }
}

/** 失败标识提取器：按命令形态给出「失败标识行」。无提取器 ⇒ null（不参与比对）。 */
export type Extractor = (output: string) => string[] | null

/** `bun test` 的失败用例名（`(fail) <name>` 行）。 */
export const bunTestExtractor: Extractor = (output) => {
  const ids: string[] = []
  for (const line of output.split("\n")) {
    const m = /^\(fail\)\s*(.+?)\s*$/.exec(line.trim())
    if (m) ids.push(m[1]!)
  }
  return ids.length > 0 ? ids : null
}

/** `format.sh --check` 的待格式化文件（`❌ N 个文件需要格式化` 之后的路径行）。 */
export const formatCheckExtractor: Extractor = (output) => {
  const ids: string[] = []
  let inList = false
  for (const line of output.split("\n")) {
    if (/个文件需要格式化/.test(line)) {
      inList = true
      continue
    }
    if (!inList) continue
    const t = line.trim()
    if (!t) continue
    if (/^运行[:：]/.test(t)) break
    ids.push(t)
  }
  return ids.length > 0 ? ids : null
}

/** 按命令形态选提取器（无 ⇒ null）。 */
export function extractorFor(argv: string[]): Extractor | null {
  const joined = argv.join(" ")
  if (/\bbun\s+test\b/.test(joined)) return bunTestExtractor
  if (/format\.sh/.test(joined) && /--check/.test(joined)) return formatCheckExtractor
  return null
}

/**
 * 条目 → 当前实际标识的映射（≥1 ⇒ 仍对应真实失败）。
 *
 * ⚠ **数字边界规则**（失败数膨胀必被发现）：`match` 是标识的子串**且** `match` 里的每个
 * 数字段都必须在标识里以**相同的数值**出现（`(?<!\d)3(?!\d)`）。
 * ⇒ `match: "3 fail"` 对标识 `"13 fail"` **不**匹配（"3" 是 "13" 的一部分）
 * ⇒ 失败数 3 → 13 时该条**不再命中** ⇒ 巡检红（这正是本层不复用子串语义的全部理由）。
 */
export function identifierMatches(match: string, identifier: string): boolean {
  if (!identifier.includes(match)) return false
  for (const num of match.match(/\d+/g) ?? []) {
    const re = new RegExp(`(?<!\\d)${num}(?!\\d)`)
    if (!re.test(identifier)) return false
  }
  return true
}

export function mapEntryToIdentifiers(entry: KnownFailure, identifiers: string[]): string[] {
  return identifiers.filter((id) => identifierMatches(entry.match, id))
}

export interface PatrolReport {
  status: "pass" | "red" | "skip"
  reason?: string
  /** 每条 baseline 的映射结果 */
  entries: Array<{ match: string; command: string[]; alive: boolean; identifiers: string[] }>
  /** 无法提取标识的命令（不参与比对） */
  noExtractor: string[][]
}

export function evaluatePatrol(
  decl: Declaration,
  outputs: Map<string, string>,
): PatrolReport {
  const entries = decl.known_failures ?? []
  if (entries.length === 0) {
    return { status: "pass", reason: "声明无 known_failures ⇒ 无需巡检", entries: [], noExtractor: [] }
  }
  const report: PatrolReport = { status: "pass", entries: [], noExtractor: [] }
  for (const entry of entries) {
    const key = entry.command.join(" ")
    const output = outputs.get(key)
    if (output === undefined) {
      report.status = "skip"
      report.reason = `命令 ${key} 无输出 ⇒ 判定不可得`
      continue
    }
    const extractor = extractorFor(entry.command)
    if (!extractor) {
      report.noExtractor.push(entry.command)
      report.entries.push({ match: entry.match, command: entry.command, alive: true, identifiers: [] })
      continue
    }
    const identifiers = extractor(output) ?? []
    const mapped = mapEntryToIdentifiers(entry, identifiers)
    report.entries.push({
      match: entry.match,
      command: entry.command,
      alive: mapped.length > 0,
      identifiers: mapped,
    })
    if (mapped.length === 0) {
      report.status = "red"
      report.reason = `baseline 条目不再命中（登记 ${entry.match} ⇒ 当前实际失败标识里找不到）`
    }
  }
  return report
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const asJson = args.includes("--json")
  const workRoot = process.env.RDDF_PROJECT_ROOT || process.cwd()
  const declPath = path.join(workRoot, DECLARATION_REL)
  if (!existsSync(declPath)) {
    console.log("SKIP: 本仓无门禁声明 ⇒ 无 baseline 可巡检")
    return 2
  }
  let decl: Declaration
  try {
    decl = JSON.parse(readFileSync(declPath, "utf8")) as Declaration
  } catch (e: any) {
    console.log(`RED: 声明解析失败（${e?.message ?? e}）`)
    return 1
  }
  const timeoutMs = (decl as any).timeout_ms ?? DEFAULT_TIMEOUT_MS
  const outputs = new Map<string, string>()
  const patrolKey = decl.inspection ? decl.inspection.command.join(" ") : ""
  for (const argv of decl.verify_commands ?? []) {
    const key = argv.join(" ")
    if (key === patrolKey) continue // 不跑自己（避免递归）
    const [cmd, ...rest] = argv
    try {
      const { stdout, stderr } = await execFileAsync(cmd!, rest, {
        cwd: workRoot,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
      })
      outputs.set(key, `${stdout}${stderr}`)
    } catch (e: any) {
      outputs.set(key, `${e?.stdout ?? ""}${e?.stderr ?? ""}`)
    }
  }
  const report = evaluatePatrol(decl, outputs)
  if (asJson) {
    console.log(JSON.stringify(report, null, 2))
  } else if (report.status === "pass") {
    console.log(`PASS: ${report.entries.length} 条 baseline 仍对应真实失败`)
    for (const e of report.entries) {
      console.log(`  ✓ ${e.match} ⇒ ${e.identifiers.length} 个标识`)
    }
    if (report.noExtractor.length > 0) {
      console.log(`  ℹ 无法提取标识（不参与比对）：${report.noExtractor.map((c) => c.join(" ")).join(" / ")}`)
    }
  } else if (report.status === "red") {
    console.log(`RED: ${report.reason ?? "baseline 腐坏"}`)
    for (const e of report.entries) {
      if (!e.alive) console.log(`  ✗ ${e.match} ⇒ 不再命中`)
    }
  } else {
    console.log(`SKIP: ${report.reason ?? "判定不可得"}`)
  }
  return report.status === "pass" ? 0 : report.status === "red" ? 1 : 2
}

if (import.meta.main) {
  process.exit(await main())
}
