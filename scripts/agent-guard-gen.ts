/**
 * 从 `scripts/agent-guard-rules.ts` 重建 `opencode.jsonc` 里五个只读 subagent 的 shell 块。
 *
 *   bun scripts/agent-guard-gen.ts            # --check（默认）：检漂移，有漂移则退出码 1
 *   bun scripts/agent-guard-gen.ts --write    # 写回配置（只改这五个 shell 块）
 *
 * 为什么需要它：这些规则此前只以手写 JSON 存在于配置里，没有真源、没有漂移检测，
 * 本轮已因此出过两次事故（工具被整体隐藏 / curl 首参绕过）。
 *
 * 文本级改写：只替换目标 agent 的 `"shell": { … }` **内容**，其余字节原样保留
 * （配置里没有注释，但也不假设没有）。
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { GUARDED_AGENTS, buildShellRules, type GuardedAgent } from "./agent-guard-rules.ts"

const CONFIG_PATH = path.join(import.meta.dir, "..", "opencode.jsonc")

/** 从 start 起找到 `"key"` 后的第一个 `{`，返回其内部区间 [innerStart, innerEnd)。 */
function findBlock(text: string, start: number, key: string): { start: number; end: number } | null {
  const idx = text.indexOf(`"${key}"`, start)
  if (idx < 0) return null
  const open = text.indexOf("{", idx)
  if (open < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let j = open; j < text.length; j++) {
    const ch = text[j]
    if (inStr) {
      if (esc) esc = false
      else if (ch === "\\") esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return { start: open + 1, end: j }
    }
  }
  return null
}

function agentBlock(text: string, agent: string): { start: number; end: number } | null {
  const m = new RegExp(`\\n    "${agent}": \\{`).exec(text)
  if (!m) return null
  return findBlock(text, m.index, agent)
}

function renderShellBody(agent: GuardedAgent, indent: string): string {
  const lines = buildShellRules(agent).map(([k, v]) => `${indent}"${k}": "${v}",`)
  const body = lines.join("\n")
  return body.endsWith(",") ? body.slice(0, -1) : body
}

function main(): number {
  const write = process.argv.includes("--write")
  const text = readFileSync(CONFIG_PATH, "utf8")
  let next = text
  let changed: string[] = []

  for (const agent of GUARDED_AGENTS) {
    const agentSpan = agentBlock(next, agent)
    if (!agentSpan) {
      console.error(`!! 找不到 agent: ${agent}`)
      return 1
    }
    const perm = findBlock(next, agentSpan.start, "permission")
    if (!perm || perm.start > agentSpan.end) {
      console.error(`!! ${agent} 没有 permission 块`)
      return 1
    }
    const shell = findBlock(next, perm.start, "shell")
    if (!shell || shell.start > perm.end) {
      console.error(`!! ${agent} 没有 shell 块`)
      return 1
    }
    // 缩进：取现有首行的缩进
    const firstLine = next.slice(shell.start, shell.end).replace(/^\n/, "")
    const indent = " ".repeat(firstLine.length - firstLine.trimStart().length)
    const body = renderShellBody(agent, indent)
    const replacement = `\n${body}\n${indent.slice(0, -4)}`
    const updated = next.slice(0, shell.start) + replacement + next.slice(shell.end)
    if (updated !== next) {
      changed.push(agent)
      next = updated
    }
  }

  if (next === text) {
    console.log(`OK：${GUARDED_AGENTS.length} 个 agent 的 shell 块与规则真源一致（无漂移）`)
    return 0
  }
  if (!write) {
    console.error(`DRIFT：${changed.join(", ")} 的 shell 块与 scripts/agent-guard-rules.ts 不一致`)
    console.error("修复：bun scripts/agent-guard-gen.ts --write")
    return 1
  }
  writeFileSync(CONFIG_PATH, next)
  console.log(`已写回：${changed.join(", ")}`)
  return 0
}

process.exit(main())
