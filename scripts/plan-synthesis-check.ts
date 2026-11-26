#!/usr/bin/env bun
/**
 * plan-synthesis-check.ts —— 合成节点的**质量判据**载体（ADR-plan-synthesis-offload D4/D5）
 *
 * 规格真源：`openspec/changes/plan-synthesis-offload/design.md`（§2 解析规则 / §3 V4 / §4 V5 / §5 V4c / §6 码表 / §7 退出码）
 *
 * ⚠ **自包含**：不 import `lib/plan-topics.ts`（ADR V2 的硬约束）⇒ 本文件自行解析 `graph.json`。
 *    同一 fixture 的节点集合一致性由 `tests/plan-synthesis.test.ts` 交叉断言守护。
 *
 * 用法:
 *   bun scripts/plan-synthesis-check.ts <topic-dir> [--json] [--require-synthesis] [--strict-token]
 *
 * 退出码: 0 无阻断 / 1 有阻断 / 2 用法错 / 3 graph.json 缺失或不可解析
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// ── 类型（最小面） ────────────────────────────────────────────────────────────
interface Node {
  id: string
  deps: string[]
  cancelled?: unknown
}
interface Graph {
  nodes: Node[]
}
type Severity = "blocking" | "info"
interface Violation {
  code: string
  node?: string
  detail: string
  severity: Severity
}

// ── 常量（design §2 / §3 / §5） ───────────────────────────────────────────────
export const SYNTH_ID = /^m[1-9][0-9]*$/
export const AMBIGUOUS_ID_RE = /^m[0-9._-]/
export const TRIGGER_RE = /最重|必须上报|薄弱点/
export const STABLE_ID_RE =
  /(?:【(?:最重|必须上报|薄弱点)】|（(?:最重|必须上报|薄弱点)）)\s*[:：]?\s*(?:`([A-Za-z0-9._/-]+(?::[0-9]+)?)`|([A-Za-z0-9._/-]+(?::[0-9]+)?))/

export function isSynthId(id: string): boolean {
  return SYNTH_ID.test(id)
}
export function isAmbiguousId(id: string): boolean {
  return AMBIGUOUS_ID_RE.test(id) && !SYNTH_ID.test(id)
}

/** design §2.2：内容节点 = 非 cancelled ∧ 非合成 id */
export function contentNodeIds(nodes: Node[]): string[] {
  return nodes.filter((n) => !n.cancelled && !isSynthId(n.id)).map((n) => n.id)
}
/** design §2.3：答案节点 = 非 cancelled 合成节点里整数后缀最大者 */
export function answerNodeId(nodes: Node[]): string | null {
  const synth = nodes.filter((n) => !n.cancelled && isSynthId(n.id))
  if (synth.length === 0) return null
  let best = synth[0]
  for (const n of synth) {
    if (parseInt(n.id.slice(1), 10) > parseInt(best.id.slice(1), 10)) best = n
  }
  return best.id
}

/** design §3.1：抽取一行的稳定 token（整 token 匹配，禁部分匹配） */
export function extractStableId(line: string): string | null {
  const m = STABLE_ID_RE.exec(line)
  if (!m) return null
  // ① 反引号整体包裹的单 token（正则已保证内部无空格）
  if (m[1]) return m[1]
  // ② 裸 token —— **必须像 slug/path**：含分隔符（/ : . _ -）且含字母数字
  //    ⇒ 排除 `git` / `session` / `worker` 这类普通英文词（它们会让 V4a 的 includes 恒真 ⇒ 假绿）
  const bare = m[2]
  if (!bare) return null
  if (!/[/:._-]/.test(bare) || !/[A-Za-z0-9]/.test(bare)) return null
  return bare
}

/** 取 `## <headingRe>` 小节的正文（到下一个同级或更高级标题为止） */
export function sectionBody(text: string, headingRe: RegExp): string | null {
  const lines = text.split(/\r?\n/)
  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i])
    if (m && headingRe.test(m[2])) {
      start = i
      level = m[1].length
      break
    }
  }
  if (start < 0) return null
  const body: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i])
    if (m && m[1].length <= level) break
    body.push(lines[i])
  }
  return body.join("\n")
}

/** 抽取小节内所有 `R<n>` slug（返回 `R1` 形式的集合）
 *  ⚠ **词边界必须**：`AR2` / `R2A` 不得被抽成 `R2`（审查 F4 实测：无边界会误抽 ⇒ V4c 假红） */
export function extractRulings(text: string | null): Set<string> {
  const out = new Set<string>()
  if (!text) return out
  for (const m of text.matchAll(/\bR(\d+)\b/g)) out.add(`R${m[1]}`)
  return out
}

/** `## 根裁决集` 是否显式声明「无裁决」—— 必须**整段去列表前缀后恰为「无」/「暂无」**
 *  ⚠ 不能用 `/无/.test(body)`（审查 F4 实测：`- 不要纳入多租户（无写通道）` 会被误判为「无裁决」⇒ V4c 整段跳过 ⇒ 假绿） */
export function declaresNoRuling(body: string | null): boolean {
  if (!body) return false
  const normalized = body
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
    .filter((l) => l.length > 0)
    .join("\n")
  return /^(无|暂无)$/.test(normalized)
}

function readIfExists(p: string): string | null {
  try {
    if (!existsSync(p)) return null
    return readFileSync(p, "utf8")
  } catch {
    return null
  }
}

// ── 判据 ──────────────────────────────────────────────────────────────────────
export interface CheckOptions {
  requireSynthesis?: boolean
  strictToken?: boolean
}

export function checkSynthesis(topicDir: string, opts: CheckOptions = {}): {
  violations: Violation[]
  summary: { contentNodes: string[]; synthNodes: string[]; answerNode: string | null }
} {
  const violations: Violation[] = []

  const graphPath = path.join(topicDir, "graph.json")
  const raw = readIfExists(graphPath)
  if (raw === null) {
    return {
      violations: [{ code: "synth_graph_error", detail: `graph.json 不存在：${graphPath}`, severity: "blocking" }],
      summary: { contentNodes: [], synthNodes: [], answerNode: null },
    }
  }
  let g: Graph
  try {
    const parsed = JSON.parse(raw) as { nodes?: unknown }
    if (!parsed || !Array.isArray(parsed.nodes)) throw new Error("nodes 不是数组")
    for (const n of parsed.nodes as Node[]) {
      if (!n || typeof n.id !== "string" || !Array.isArray(n.deps)) throw new Error("节点缺 id/deps")
    }
    g = { nodes: parsed.nodes as Node[] }
  } catch (e) {
    return {
      violations: [{ code: "synth_graph_error", detail: `graph.json 不可解析：${(e as Error).message}`, severity: "blocking" }],
      summary: { contentNodes: [], synthNodes: [], answerNode: null },
    }
  }

  const contents = contentNodeIds(g.nodes)
  const synthNodes = g.nodes.filter((n) => !n.cancelled && isSynthId(n.id)).map((n) => n.id)
  const answer = answerNodeId(g.nodes)
  const summary = { contentNodes: contents, synthNodes, answerNode: answer }

  // V5d：歧义 id
  for (const n of g.nodes) {
    if (isAmbiguousId(n.id)) {
      violations.push({
        code: "synth_id_ambiguous",
        node: n.id,
        detail: `形似合成节点却不匹配 ^m[1-9][0-9]*$ ⇒ 请改名为 m<n> 或换成不与 m 冲突的内容节点 id`,
        severity: "blocking",
      })
    }
  }

  // 无合成节点：正常态（design §7）
  if (synthNodes.length === 0) {
    if (opts.requireSynthesis) {
      violations.push({ code: "synth_answer_missing", detail: "无合成节点（--require-synthesis）", severity: "blocking" })
    }
    return { violations, summary }
  }
  if (answer === null) {
    violations.push({ code: "synth_answer_missing", detail: "有合成节点但解析不出答案节点", severity: "blocking" })
    return { violations, summary }
  }

  const contentSet = new Set(contents)
  const synthSet = new Set(synthNodes)

  // V5c：合成节点不互依
  for (const id of synthNodes) {
    const n = g.nodes.find((x) => x.id === id)!
    const bad = n.deps.filter((d) => synthSet.has(d))
    if (bad.length > 0) {
      violations.push({
        code: "synth_dep_on_synth",
        node: id,
        detail: `dep 含其它合成节点：${bad.join(", ")}`,
        severity: "blocking",
      })
    }
  }

  // V5a：全部合成节点 deps 之并集 == 内容节点集
  const union = new Set<string>()
  for (const id of synthNodes) for (const d of g.nodes.find((x) => x.id === id)!.deps) union.add(d)
  const missing = contents.filter((c) => !union.has(c))
  const extra = [...union].filter((d) => !contentSet.has(d))
  if (missing.length > 0) {
    violations.push({
      code: "synth_dep_union_incomplete",
      detail: `合成节点 deps 并集缺内容节点：${missing.join(", ")}`,
      severity: "blocking",
    })
  }
  if (extra.length > 0) {
    violations.push({
      code: "synth_dep_union_extra",
      detail: `合成节点 deps 并集含非内容节点：${extra.join(", ")}`,
      severity: "blocking",
    })
  }

  // V5b：当前答案节点 deps ⊇ 内容节点
  const ansDeps = new Set(g.nodes.find((x) => x.id === answer)!.deps)
  const ansMissing = contents.filter((c) => !ansDeps.has(c))
  if (ansMissing.length > 0) {
    violations.push({
      code: "synth_answer_dep_incomplete",
      node: answer,
      detail: `答案节点 deps 未覆盖内容节点：${ansMissing.join(", ")}`,
      severity: "blocking",
    })
  }

  // V4a / V4b：结论层硬判据
  const ansResult = readIfExists(path.join(topicDir, "nodes", answer, "RESULT.md"))
  const conclusion = ansResult === null ? null : sectionBody(ansResult, /反哺清单/)
  const heavy: Array<{ node: string; token: string }> = []
  for (const cid of contents) {
    const res = readIfExists(path.join(topicDir, "nodes", cid, "RESULT.md"))
    if (res === null) continue
    for (const line of res.split(/\r?\n/)) {
      if (!TRIGGER_RE.test(line)) continue
      const token = extractStableId(line)
      if (token === null) {
        violations.push({
          code: "synth_token_missing",
          node: cid,
          detail: `标记行无稳定 token（应为「标记 + 单 token slug / path:line」）：${line.trim().slice(0, 120)}`,
          severity: opts.strictToken ? "blocking" : "info",
        })
        continue
      }
      heavy.push({ node: cid, token })
    }
  }
  // 结论层缺失 ⇒ **聚合为一条**（审查 F10：逐项报会让 N 个标记各刷一条 blocking）
  if (conclusion === null) {
    if (heavy.length > 0) {
      violations.push({
        code: "synth_conclusion_layer_missing",
        node: answer,
        detail: `答案节点缺「## 反哺清单」小节（${heavy.length} 个标记项待核对：${heavy
          .map((h) => `${h.node}:${h.token}`)
          .join(", ")}）`,
        severity: "blocking",
      })
    }
  } else {
    for (const h of heavy) {
      if (!conclusion.includes(h.token)) {
        violations.push({
          code: "synth_heavy_item_not_in_conclusion",
          node: h.node,
          detail: `标记项 \`${h.token}\` 未进答案节点 ${answer} 的 §反哺清单`,
          severity: "blocking",
        })
      }
    }
  }

  // V4c：根裁决集 slug 集合包含
  const brief = readIfExists(path.join(topicDir, "nodes", answer, "BRIEF.md"))
  const briefSection = brief === null ? null : sectionBody(brief, /根裁决集/)
  const briefRulings = extractRulings(briefSection)
  if (briefSection === null) {
    violations.push({
      code: "synth_brief_no_ruling_set",
      node: answer,
      detail: "合成 BRIEF 缺 `## 根裁决集` 小节",
      severity: "blocking",
    })
  } else if (briefRulings.size === 0 && !declaresNoRuling(briefSection)) {
    violations.push({
      code: "synth_brief_no_ruling_set",
      node: answer,
      detail: "`## 根裁决集` 内既无 R<n> slug 也未显式写「无」（整段须恰为「无」/「暂无」）",
      severity: "blocking",
    })
  } else {
    const synthRulings = extractRulings(ansResult === null ? null : sectionBody(ansResult, /父的裁决汇总/))
    const lost = [...briefRulings].filter((r) => !synthRulings.has(r))
    if (lost.length > 0) {
      violations.push({
        code: "synth_ruling_not_propagated",
        node: answer,
        detail: `合成稿 §父的裁决汇总 未回指：${lost.join(", ")}`,
        severity: "blocking",
      })
    }
  }

  return { violations, summary }
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function usage(msg?: string): never {
  if (msg) process.stderr.write(`${msg}\n`)
  process.stderr.write(
    "用法: bun scripts/plan-synthesis-check.ts <topic-dir> [--json] [--require-synthesis] [--strict-token]\n",
  )
  process.exit(2)
}

if (import.meta.main) {
  const argv = process.argv.slice(2)
  const positional: string[] = []
  let json = false
  let requireSynthesis = false
  let strictToken = false
  for (const a of argv) {
    if (a === "--json") json = true
    else if (a === "--require-synthesis") requireSynthesis = true
    else if (a === "--strict-token") strictToken = true
    else if (a.startsWith("-")) usage(`未知参数：${a}`)
    else positional.push(a)
  }
  const topicDir = positional[0]
  if (!topicDir) usage("缺少 <topic-dir>")

  const { violations, summary } = checkSynthesis(topicDir, { requireSynthesis, strictToken })
  const graphError = violations.some((v) => v.code === "synth_graph_error")
  const blocking = violations.filter((v) => v.severity === "blocking")
  const ok = blocking.length === 0

  if (json) {
    const note = !graphError && summary.synthNodes.length === 0 ? "no synthesis node" : undefined
    process.stdout.write(JSON.stringify({ ok, violations, summary, ...(note ? { note } : {}) }, null, 2) + "\n")
  } else {
    for (const v of violations) {
      process.stdout.write(`[${v.severity}] ${v.code}${v.node ? ` ${v.node}` : ""}: ${v.detail}\n`)
    }
    if (graphError) process.stdout.write("graph.json 缺失或不可解析 ⇒ exit 3\n")
    else if (summary.synthNodes.length === 0) process.stdout.write("note: no synthesis node（按设计这是正常态）\n")
    else process.stdout.write(ok ? "OK（无阻断项）\n" : `FAIL（${blocking.length} 个阻断项）\n`)
  }
  process.exit(graphError ? 3 : ok ? 0 : 1)
}
