#!/usr/bin/env bun
/**
 * tool-json-failure-stats —— 只读统计「工具调用参数 JSON 解析失败」的按天失败率。
 *
 * 背景：MiniMax 的 anthropic 兼容路由（`https://api.minimaxi.com/anthropic/v1`）偶发把
 * 流式 tool-call 参数截断，opencode 在解析阶段报 `tool.input-json`（工具未执行）。
 * 本脚本量化该失败率，供路由切换（anthropic → OpenAI 兼容）的 A/B 对比与回滚判据使用。
 *
 * 只读：以 `readonly` 打开会话库，不写任何文件。
 *
 * 用法：
 *   bun scripts/tool-json-failure-stats.ts                  # 最近 7 个自然日
 *   bun scripts/tool-json-failure-stats.ts --days 14
 *   bun scripts/tool-json-failure-stats.ts --since 2026-11-19
 *   bun scripts/tool-json-failure-stats.ts --json
 *   bun scripts/tool-json-failure-stats.ts --db /path/to/opencode.db
 *
 * 指标：
 *   calls       工具调用总数（assistant 消息里的 tool part）
 *   input-json  `state.error.type === "tool.input-json"`（provider 返回的参数不是合法 JSON）
 *   rate        input-json / calls
 *   incomplete  `state.error.type === "tool.input-incomplete"`（被输出 token 上限截断）
 */
import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const has = (name: string): boolean => argv.includes(`--${name}`)

const dbPath = flag("db") ?? process.env.OPENCODE_DB ?? path.join(homedir(), ".local/share/opencode/opencode.db")
if (!existsSync(dbPath)) {
  console.error(`tool-json-failure-stats: 会话库不存在: ${dbPath}（用 --db 指定）`)
  process.exit(2)
}

const DAY_MS = 86_400_000
/** 本地时区的某天零点。 */
const startOfLocalDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const localDay = (ms: number): string => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const days = Number(flag("days") ?? 7)
const since = flag("since")
let cutoff: number
let windowLabel: string
if (since) {
  const t = Date.parse(`${since}T00:00:00`)
  if (!Number.isFinite(t)) {
    console.error(`tool-json-failure-stats: --since 需要 YYYY-MM-DD（收到 ${since}）`)
    process.exit(2)
  }
  cutoff = t
  windowLabel = `since ${since}`
} else {
  if (!Number.isFinite(days) || days <= 0) {
    console.error(`tool-json-failure-stats: --days 需要正整数（收到 ${flag("days")}）`)
    process.exit(2)
  }
  cutoff = startOfLocalDay(new Date()).getTime() - (days - 1) * DAY_MS
  windowLabel = `最近 ${days} 个自然日`
}

type Bucket = { calls: number; json: number; incomplete: number }
const empty = (): Bucket => ({ calls: 0, json: 0, incomplete: 0 })

const byDay = new Map<string, Bucket>()
const byModel = new Map<string, Bucket>()
const byAgent = new Map<string, Bucket>()
const failures: Array<{ at: string; model: string; tool: string; error: string; len: number }> = []

const db = new Database(dbPath, { readonly: true })
let rows: Array<{ time_created: number; data: string }>
try {
  rows = db
    .query("SELECT time_created, data FROM session_message WHERE type = 'assistant' AND time_created >= ?")
    .all(cutoff) as Array<{ time_created: number; data: string }>
} catch (e) {
  console.error(`tool-json-failure-stats: 读取失败（库结构不匹配？）: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(2)
}

for (const row of rows) {
  let msg: any
  try {
    msg = JSON.parse(row.data)
  } catch {
    continue
  }
  const model = msg?.model ? `${msg.model.providerID}/${msg.model.id}` : "(unknown)"
  const agent = String(msg?.agent ?? "(unknown)")
  for (const part of msg?.content ?? []) {
    if (part?.type !== "tool") continue
    const day = localDay(row.time_created)
    const dayBucket = byDay.get(day) ?? empty()
    const modelBucket = byModel.get(model) ?? empty()
    const agentBucket = byAgent.get(agent) ?? empty()
    byDay.set(day, dayBucket)
    byModel.set(model, modelBucket)
    byAgent.set(agent, agentBucket)
    dayBucket.calls++
    modelBucket.calls++
    agentBucket.calls++
    const errorType = part?.state?.error?.type
    if (errorType === "tool.input-json" || errorType === "tool.input-incomplete") {
      if (errorType === "tool.input-json") {
        dayBucket.json++
        modelBucket.json++
        agentBucket.json++
      } else {
        dayBucket.incomplete++
        modelBucket.incomplete++
        agentBucket.incomplete++
      }
      failures.push({
        at: new Date(row.time_created).toLocaleString("sv-SE"),
        model,
        tool: String(part.name ?? "?"),
        error: String(errorType),
        len: String(part?.state?.error?.message ?? "").length,
      })
    }
  }
}
db.close()

const total = empty()
for (const b of byDay.values()) {
  total.calls += b.calls
  total.json += b.json
  total.incomplete += b.incomplete
}
const rate = (b: Bucket): string => (b.calls === 0 ? "-" : `${((b.json / b.calls) * 100).toFixed(2)}%`)

if (has("json")) {
  console.log(
    JSON.stringify(
      {
        db: dbPath,
        window: windowLabel,
        total,
        rate: total.calls === 0 ? null : total.json / total.calls,
        byDay: Object.fromEntries([...byDay].sort(([a], [b]) => a.localeCompare(b))),
        byModel: Object.fromEntries([...byModel].sort(([, a], [, b]) => b.calls - a.calls)),
        byAgent: Object.fromEntries([...byAgent].sort(([, a], [, b]) => b.calls - a.calls)),
        failures: failures.slice(-20).reverse(),
      },
      null,
      2,
    ),
  )
} else {
  console.log(`库: ${dbPath}`)
  console.log(`窗口: ${windowLabel}\n`)
  const head = ["日期", "calls", "input-json", "rate", "incomplete"]
  const lines: string[][] = [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, b]) => [day, String(b.calls), String(b.json), rate(b), String(b.incomplete)])
  lines.push(["合计", String(total.calls), String(total.json), rate(total), String(total.incomplete)])
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)))
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ")
  console.log(fmt(head))
  console.log(widths.map((w) => "-".repeat(w)).join("  "))
  for (const l of lines) console.log(fmt(l))

  console.log("\n按模型：")
  for (const [model, b] of [...byModel].sort(([, a], [, b]) => b.calls - a.calls)) {
    console.log(`  ${model.padEnd(40)} calls=${String(b.calls).padEnd(7)} input-json=${String(b.json).padEnd(4)} rate=${rate(b)}`)
  }

  console.log("\n按 agent：")
  for (const [agent, b] of [...byAgent].sort(([, a], [, b]) => b.calls - a.calls)) {
    console.log(`  ${agent.padEnd(20)} calls=${String(b.calls).padEnd(7)} input-json=${String(b.json).padEnd(4)} rate=${rate(b)}`)
  }

  if (failures.length > 0) {
    console.log(`\n最近 ${Math.min(failures.length, 8)} 次失败：`)
    for (const f of failures.slice(-8).reverse()) console.log(`  ${f.at}  ${f.model}  ${f.tool}  (${f.error})`)
  }
}
