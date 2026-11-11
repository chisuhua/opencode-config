/**
 * subagent 输入契约的**审计 CLI**（L5）。
 *
 * 扫历史子会话的首条 user 消息，用与运行时**同一份**判定逻辑
 * （../lib/subagent-contract-core.ts）评估是否满足契约，输出报告。
 *
 * 用途：
 *  - 灰度期观察违规分布（默认 mode=warn 时跑这个，看清误伤面再开 enforce）
 *  - CI 断言（--strict：有违规 exit 1）
 *
 * 运行：
 *   bun scripts/audit-subagent-prompts.ts                     # 全量扫描
 *   bun scripts/audit-subagent-prompts.ts --strict            # 有违规 exit 1
 *   bun scripts/audit-subagent-prompts.ts --agent critic      # 只看某个 agent
 *   bun scripts/audit-subagent-prompts.ts --session <id>      # 只看某个子会话
 *   bun scripts/audit-subagent-prompts.ts --since 2026-11-01   # 只看某天之后
 *   bun scripts/audit-subagent-prompts.ts --json              # 机读输出
 */
import { Database } from "bun:sqlite"
import { homedir } from "node:os"
import path from "node:path"

import {
  type ChainEntry,
  type Evaluation,
  evaluateChain,
  resolveRule,
} from "../lib/subagent-contract-core.ts"

export interface AuditOptions {
  dbPath: string
  since?: number
  sessionID?: string
  agent?: string
  strict: boolean
}

export interface AuditRow {
  sessionID: string
  parentID: string
  agent: string
  title: string
  timeCreated: number
  messageIndex: number
  prompt: string
  evaluation: Evaluation
}

export interface AuditReport {
  rows: AuditRow[]
  violations: AuditRow[]
  summary: Record<string, { total: number; violations: number; exempted: number }>
}

/** 读取子会话及其 user 消息（第一条=首轮，其后=续接轮） */
export function collectRows(dbPath: string, opts: AuditOptions): AuditRow[] {
  const db = new Database(dbPath, { readonly: true })
  try {
    const sessions = db
      .query(
        `select id, parent_id as parentID, agent, title, time_created as timeCreated
           from session_v2
          where parent_id is not null
            and agent is not null`,
      )
      .all() as {
      id: string
      parentID: string
      agent: string
      title: string
      timeCreated: number
    }[]

    const rows: AuditRow[] = []
    for (const s of sessions) {
      if (opts.sessionID && s.id !== opts.sessionID && s.parentID !== opts.sessionID) continue
      if (opts.agent && s.agent !== opts.agent) continue
      if (opts.since && s.timeCreated < opts.since) continue

      const msgs = db
        .query(
          `select seq, data from session_message
            where session_id = ? and type = 'user'
            order by seq`,
        )
        .all(s.id) as { seq: number; data: string }[]

      let index = 0
      for (const m of msgs) {
        let text = ""
        try {
          text = (JSON.parse(m.data) as { text?: string }).text ?? ""
        } catch {
          text = ""
        }
        if (text.length === 0) continue
        rows.push({
          sessionID: s.id,
          parentID: s.parentID,
          agent: s.agent,
          title: s.title,
          timeCreated: s.timeCreated,
          messageIndex: index,
          prompt: text,
          evaluation: {
            agent: s.agent,
            ok: true,
            exempted: false,
            violations: [],
          },
        })
        index++
      }
    }
    return rows
  } finally {
    db.close()
  }
}

/** 跑判定：按父会话分组，组内按 (子会话创建时间, 消息序号) 排序，套用状态继承 */
export function audit(dbPath: string, opts: AuditOptions): AuditReport {
  const raw = collectRows(dbPath, opts)
  const byParent = new Map<string, typeof raw>()
  for (const r of raw) {
    const list = byParent.get(r.parentID) ?? []
    list.push(r)
    byParent.set(r.parentID, list)
  }

  const rows: AuditRow[] = []
  for (const [, list] of byParent) {
    list.sort((a, b) => a.timeCreated - b.timeCreated || a.messageIndex - b.messageIndex)
    const entries: ChainEntry[] = list.map((r) => ({
      sessionID: r.sessionID,
      agent: r.agent,
      prompt: r.prompt,
      isResume: r.messageIndex > 0,
    }))
    // 规则按每个条目自己的 agent 解析（同一父会话可能既调 critic 又调 oracle）
    const evaluated = evaluateChain(entries, (agent) => resolveRule(agent))
    evaluated.forEach((e, i) => {
      const r = list[i]!
      rows.push({ ...r, evaluation: e.evaluation })
    })
  }

  const violations = rows.filter((r) => !r.evaluation.ok)
  const summary: AuditReport["summary"] = {}
  for (const r of rows) {
    const s = (summary[r.agent] ??= { total: 0, violations: 0, exempted: 0 })
    s.total++
    if (!r.evaluation.ok) s.violations++
    else if (r.evaluation.exempted) s.exempted++
  }

  return { rows, violations, summary }
}

function defaultDbPath(): string {
  return path.join(homedir(), ".local", "share", "opencode", "opencode.db")
}

function parseArgs(argv: string[]): AuditOptions {
  const opts: AuditOptions = { dbPath: defaultDbPath(), strict: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--strict") opts.strict = true
    else if (a === "--db") opts.dbPath = argv[++i] ?? opts.dbPath
    else if (a === "--session") opts.sessionID = argv[++i]
    else if (a === "--agent") opts.agent = argv[++i]
    else if (a === "--since") {
      const v = argv[++i]
      if (!v) throw new Error("--since 缺少值")
      const parsed = Date.parse(v)
      if (Number.isNaN(parsed)) throw new Error(`--since 不是合法日期: ${v}`)
      opts.since = parsed
    }
  }
  return opts
}

function formatReport(report: AuditReport): string {
  const lines: string[] = []
  lines.push("=== subagent 输入契约审计 ===")
  for (const [agent, s] of Object.entries(report.summary).sort()) {
    lines.push(
      `${agent}: 共 ${s.total} 次调用，违规 ${s.violations} 次，豁免 ${s.exempted} 次`,
    )
  }
  if (report.violations.length > 0) {
    lines.push("")
    lines.push("--- 违规明细 ---")
    for (const r of report.violations) {
      lines.push(
        `${r.sessionID} [${r.agent}] ${r.title}  (msg#${r.messageIndex + 1}, parent=${r.parentID})`,
      )
      for (const v of r.evaluation.violations) lines.push(`    - ${v.code}: ${v.detail}`)
      if (r.evaluation.exemption) lines.push(`    (豁免: ${r.evaluation.exemption})`)
    }
  }
  return lines.join("\n")
}

if (import.meta.main) {
  const opts = parseArgs(process.argv.slice(2))
  try {
    const report = audit(opts.dbPath, opts)
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      console.log(formatReport(report))
    }
    if (opts.strict && report.violations.length > 0) process.exit(1)
  } catch (e) {
    console.error(`审计失败: ${String(e)}`)
    process.exit(2)
  }
}
