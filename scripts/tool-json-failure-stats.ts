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
 *   bun scripts/tool-json-failure-stats.ts --model minimax-cn-openai/MiniMax-M3.1-Flash
 *   bun scripts/tool-json-failure-stats.ts --agent build
 *   bun scripts/tool-json-failure-stats.ts --judge --model <providerID/modelID> [--agent build] --days 5
 *
 * `--judge`：按 A/B 判据（`docs/CHANGELOG.md` v2.60 / `.rddf/reviews/build-model-route-switch-ab.md` §2）
 * 逐项 PASS/FAIL，**exit 0 = 通过**、**exit 1 = 未达判据**（参数/环境错误仍为 2）。判据只对该
 * `--model` 桶（可再按 `--agent` 收窄）计算 —— 别的 provider 的失败不得计入 A/B。
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

// 范围收窄（`--judge` 必须给 `--model`：判据只对单一路径的桶成立）
const modelFilter = flag("model")
const agentFilter = flag("agent")
if (has("judge") && !modelFilter) {
  console.error("tool-json-failure-stats: --judge 需要 --model <providerID/modelID>（按单一路径的桶判定）")
  process.exit(2)
}

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
  if (modelFilter !== undefined && model !== modelFilter) continue
  if (agentFilter !== undefined && agent !== agentFilter) continue
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

/**
 * `--judge` 的判据（`.rddf/reviews/build-model-route-switch-ab.md` §2）：
 *   C1 活跃日（calls ≥ 500）≥ 3 天    —— 防「单日凑量」；
 *   C2 单日熔断：任一日（calls ≥ 500）失败率 > 0.5% ⇒ FAIL；
 *   C3 窗口总量 ≥ 5,000 calls 且总率 < 0.2%（基线 1.07% 的 1/5）；
 *   C4 0 失败且 n ≥ 5,000 ⇒ **提前通过**（rule-of-three 95% 上界 3/n ≈ 0.06%）。
 * 结论 = C4 ∨ (C1 ∧ C2 ∧ C3)。C4 的 n 门槛取 5,000：判据原文把「0 失败」与
 * 「n≈5,000 时上界 0.06%」绑在一起，低样本的 0 失败不构成通过证据。
 */
const judged = has("judge")
let verdictPass = false
if (judged) {
  const minActiveDays = 3
  const dailyCallFloor = 500
  const dailyRateCeil = 0.005
  const totalCallFloor = 5_000
  const totalRateCeil = 0.002

  const dayRows = [...byDay].sort(([a], [b]) => a.localeCompare(b))
  const activeDays = dayRows.filter(([, b]) => b.calls >= dailyCallFloor)
  const breaches = dayRows.filter(([, b]) => b.calls >= dailyCallFloor && b.json / b.calls > dailyRateCeil)
  const totalRate = total.calls === 0 ? 0 : total.json / total.calls
  const early = total.json === 0 && total.calls >= totalCallFloor

  const criteria = [
    {
      id: "C1",
      ok: activeDays.length >= minActiveDays,
      detail: `活跃日（calls ≥ ${dailyCallFloor}）${activeDays.length} 天，需 ≥ ${minActiveDays}（${activeDays.map(([d, b]) => `${d}=${b.calls}`).join(" ") || "无"}）`,
    },
    {
      id: "C2",
      ok: breaches.length === 0,
      detail:
        breaches.length === 0
          ? `无单日 > ${(dailyRateCeil * 100).toFixed(1)}%（检查了 ${activeDays.length} 个活跃日）`
          : `单日熔断：${breaches.map(([d, b]) => `${d}=${rate(b)}(${b.json}/${b.calls})`).join(" ")}`,
    },
    {
      id: "C3",
      ok: total.calls >= totalCallFloor && totalRate < totalRateCeil,
      detail: `总量 ${total.calls} calls（需 ≥ ${totalCallFloor}）/ 总率 ${total.calls === 0 ? "-" : (totalRate * 100).toFixed(2) + "%"}（需 < ${(totalRateCeil * 100).toFixed(1)}%）`,
    },
    {
      id: "C4",
      ok: early,
      detail: early
        ? `0 失败且 n=${total.calls}（rule-of-three 95% 上界 ${((300 / total.calls) || 0).toFixed(2)}%）`
        : `0 失败提前通过需 n ≥ ${totalCallFloor}（当前 n=${total.calls}，input-json=${total.json}）`,
    },
  ]
  const c = (id: string) => criteria.find((x) => x.id === id)!
  verdictPass = c("C4").ok || (c("C1").ok && c("C2").ok && c("C3").ok)

  if (has("json")) {
    console.log(
      JSON.stringify(
        {
          db: dbPath,
          window: windowLabel,
          model: modelFilter,
          agent: agentFilter ?? null,
          total,
          rate: total.calls === 0 ? null : totalRate,
          byDay: Object.fromEntries(dayRows),
          criteria,
          verdict: verdictPass ? "pass" : "fail",
          early: early,
        },
        null,
        2,
      ),
    )
  } else {
    console.log(`判定范围: ${modelFilter}${agentFilter ? ` / agent=${agentFilter}` : ""}`)
    console.log(`窗口: ${windowLabel}`)
    console.log(`样本: ${total.calls} calls / input-json ${total.json} / incomplete ${total.incomplete}\n`)
    for (const x of criteria) console.log(`[${x.ok ? "PASS" : "FAIL"}] ${x.id} ${x.detail}`)
    console.log(`\n结论: ${verdictPass ? "PASS" : "FAIL"}${c("C4").ok ? "（C4 提前通过）" : ""}`)
  }
  process.exitCode = verdictPass ? 0 : 1
}

if (!judged && has("json")) {
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
} else if (!judged) {
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
