/**
 * 从 `scripts/agent-guard-rules.ts` 重建 `opencode.jsonc` 里受管 agent 的 shell 块
 * （front + 五个只读 subagent）。
 *
 *   bun scripts/agent-guard-gen.ts                # --check（默认）：检漂移，有漂移则退出码 1
 *   bun scripts/agent-guard-gen.ts --write        # 写回配置（只改这些 agent 的 shell 块）
 *   bun scripts/agent-guard-gen.ts --config <path> # 指定配置文件（测试用）
 *
 * 为什么需要它：这些规则此前只以手写 JSON 存在于配置里，没有真源、没有漂移检测，
 * 本轮已因此出过两次事故（工具被整体隐藏 / curl 首参绕过）。
 *
 * 文本级改写：只替换目标 agent 的 `"shell": { … }` **内容**，其余字节原样保留。
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { GUARDED_AGENTS, buildShellRules, type GuardedAgent } from "./agent-guard-rules.ts"

export const DEFAULT_CONFIG_PATH = path.join(import.meta.dir, "..", "opencode.jsonc")

/** 从 start 起找到 `"key"` 后的第一个 `{`，返回其内部区间 [start, end)。 */
export function findBlock(text: string, start: number, key: string): { start: number; end: number } | null {
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

export function renderShellBody(agent: GuardedAgent, indent: string): string {
  const lines = buildShellRules(agent).map(([k, v]) => `${indent}"${k}": "${v}",`)
  const body = lines.join("\n")
  return body.endsWith(",") ? body.slice(0, -1) : body
}

/**
 * 把受管 agent 的 shell 块替换成真源里的规则。
 * 返回 { text, changed }：changed 是内容发生变化的 agent 列表（空数组 = 无漂移）。
 */
export function applyRules(text: string): { text: string; changed: string[] } {
  let next = text
  const changed: string[] = []
  for (const agent of GUARDED_AGENTS) {
    const agentSpan = agentBlock(next, agent)
    if (!agentSpan) throw new Error(`找不到 agent: ${agent}`)
    const perm = findBlock(next, agentSpan.start, "permission")
    if (!perm || perm.start > agentSpan.end) throw new Error(`${agent} 没有 permission 块`)
    const shell = findBlock(next, perm.start, "shell")
    if (!shell || shell.start > perm.end) throw new Error(`${agent} 没有 shell 块`)
    // 缩进：取现有首行的缩进
    const firstLine = next.slice(shell.start, shell.end).replace(/^\n/, "")
    const indent = " ".repeat(firstLine.length - firstLine.trimStart().length)
    const body = renderShellBody(agent as GuardedAgent, indent)
    const replacement = `\n${body}\n${indent.slice(0, -4)}`
    const updated = next.slice(0, shell.start) + replacement + next.slice(shell.end)
    if (updated !== next) {
      changed.push(agent)
      next = updated
    }
  }
  return { text: next, changed }
}

function main(argv: string[]): number {
  const write = argv.includes("--write")
  const cfgIdx = argv.indexOf("--config")
  const configPath = cfgIdx >= 0 && argv[cfgIdx + 1] ? argv[cfgIdx + 1] : DEFAULT_CONFIG_PATH
  const text = readFileSync(configPath, "utf8")
  const { text: next, changed } = applyRules(text)

  if (changed.length === 0) {
    console.log(`OK：${GUARDED_AGENTS.length} 个 agent 的 shell 块与规则真源一致（无漂移）`)
    return 0
  }
  if (!write) {
    console.error(`DRIFT：${changed.join(", ")} 的 shell 块与 scripts/agent-guard-rules.ts 不一致`)
    console.error("修复：bun scripts/agent-guard-gen.ts --write")
    return 1
  }
  writeFileSync(configPath, next)
  console.log(`已写回：${changed.join(", ")}`)
  return 0
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)))
}
