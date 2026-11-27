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
/** 单行的**全部**标记位（每个标记各自尝试抽 token —— 修 F7「只试首个」与 §10.9 的双态描述） */
export const MARKER_SCAN = /【(?:最重|必须上报|薄弱点)】|（(?:最重|必须上报|薄弱点)）/g
const TOKEN_AFTER = /^[\s:：]*?(?:`([A-Za-z0-9._/-]+(?::[0-9]+)?)`|([A-Za-z0-9._/-]+(?::[0-9]+)?))/

export interface MarkerHit {
  marker: string
  token: string | null
}

/** 逐标记位抽 token（确定性：每个标记各自判，互不遮蔽） */
export function scanMarkers(line: string): MarkerHit[] {
  const hits: MarkerHit[] = []
  MARKER_SCAN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MARKER_SCAN.exec(line)) !== null) {
    const rest = line.slice(m.index + m[0].length)
    const t = TOKEN_AFTER.exec(rest)
    let token: string | null = null
    if (t) {
      if (t[1]) token = t[1]
      else if (t[2]) {
        const bare = t[2]
        // 裸 token 必须「像 slug/path」：含分隔符且含字母数字（排除 git/session/worker）
        if (/[/:._-]/.test(bare) && /[A-Za-z0-9]/.test(bare)) token = bare
      }
    }
    hits.push({ marker: m[0], token })
  }
  return hits
}

/** 兼容 helper：**首个**标记位的 token（单标记行等价于 scanMarkers()[0].token） */
export function extractStableId(line: string): string | null {
  const hits = scanMarkers(line)
  return hits.length > 0 ? hits[0].token : null
}

/** 剥离围栏代码块 —— 内容节点 RESULT 里的**示例代码**不得被当成真实标记（critic SF④） */
export function stripFenced(text: string): string {
  return text.replace(/^```[\s\S]*?^```$/gm, "")
}

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

/** `## 根裁决集` 是否显式声明「无裁决」—— 整段去列表前缀后，须恰为「无」/「暂无」
 *  （**容忍包裹括号与句末标点**：`无。` / `（无）` / `暂无，` 都算；但不容忍附加注记，如 `无（本次无裁决）`
 *   —— 附加文本会让「无」重新变成可绕过 F4b 的挡箭牌）
 *  ⚠ 不能用 `/无/.test(body)`（审查 F4 实测：`- 不要纳入多租户（无写通道）` 会被误判为「无裁决」⇒ V4c 整段跳过 ⇒ 假绿） */
export function declaresNoRuling(body: string | null): boolean {
  if (!body) return false
  const normalized = body
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
    .filter((l) => l.length > 0)
    .join("\n")
  return /^[（(【[]?(无|暂无)[）)】\]]?[。．.，,]?$/.test(normalized)
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


// ── V6：结论级证据链 / 推断链（ADR-plan-collaboration-hardening D3）────────────

/** C token：`C1` / `C12`；`AC1`、`C10a` 都不算（两侧词边界都收） */
export const C_TOKEN_RE = /(?<![A-Za-z0-9_])C[1-9][0-9]?(?![0-9A-Za-z])/g
/** 定义行：行首 `**C<n>【` */
const C_DEF_LINE_RE = /^\*\*C([1-9][0-9]?)【/
/** `path:line` / `path:start-end` —— 比对只看 `path:start` */
const PATH_LINE_RE = /([A-Za-z0-9_][A-Za-z0-9_.\/-]*\.[A-Za-z0-9]+):(\d+)(?:-\d+)?/g
/** 证据链里的节点回指：`n3 §3` / `n3§` */
const NODE_REF_RE = /n(\d+)\s*§/g
/** 「紧跟」容差：C 定义行之后 3 行内必须出现证据链与推断链 */
const CHAIN_WINDOW = 3

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * V6 三码：`synth_conclusion_no_chain` / `synth_evidence_unresolvable` / `synth_reasoning_missing`。
 * 与 `synth_token_missing` 同档：默认 `info`，`--strict-token` 下升 `blocking`。
 * ⚠ 只验**引用完整性与格式**，不验证据是否支持结论（ADR §已知不可机判）。
 */
export function checkConclusionChains(
  topicDir: string,
  answerId: string,
  ansResult: string,
  contentIds: string[],
  opts: CheckOptions,
): Violation[] {
  const severity = opts.strictToken ? "blocking" : "info"
  const out: Violation[] = []
  const section = sectionBody(ansResult, /结论/)
  if (section === null) {
    out.push({
      code: "synth_conclusion_no_chain",
      node: answerId,
      detail: "答案节点缺 `## 结论` 小节（V6 要求每条结论带 `C<n>` + 证据链 + 推断链）",
      severity,
    })
    return out
  }
  const lines = section.split(/\r?\n/)
  const defs: Array<{ token: string; at: number }> = []
  for (let i = 0; i < lines.length; i++) {
    const m = C_DEF_LINE_RE.exec(lines[i].trim())
    if (m) defs.push({ token: `C${m[1]}`, at: i })
  }
  if (defs.length === 0) {
    out.push({
      code: "synth_conclusion_no_chain",
      node: answerId,
      detail: "`## 结论` 内没有任何 `**C<n>【…】**` 定义（零 C token 不算通过）",
      severity,
    })
    return out
  }
  for (const d of defs) {
    const win = lines.slice(d.at + 1, d.at + 1 + CHAIN_WINDOW)
    const evLine = win.find((l) => l.includes("证据链"))
    const rsLine = win.find((l) => l.includes("推断链"))
    if (!evLine || !rsLine) {
      out.push({
        code: "synth_conclusion_no_chain",
        node: answerId,
        detail: `${d.token} 定义后 ${CHAIN_WINDOW} 行内缺${!evLine ? "「证据链」" : ""}${!evLine && !rsLine ? "与" : ""}${!rsLine ? "「推断链」" : ""}`,
        severity,
      })
      continue
    }
    if (!/[⇒→]/.test(rsLine)) {
      out.push({
        code: "synth_reasoning_missing",
        node: answerId,
        detail: `${d.token} 的推断链不含 \`⇒\` / \`→\`（无法区分「列出事实」与「作出推理」）`,
        severity,
      })
    }
    // ⚠ 带 /g 的 String.match 返回**字符串数组**（不是 match 对象）⇒ 必须用 matchAll 取捕获组
    const tokenRefs = [...evLine.matchAll(PATH_LINE_RE)].map((x) => ({ path: x[1], line: x[2] }))
    if (tokenRefs.length === 0) {
      out.push({
        code: "synth_evidence_unresolvable",
        node: answerId,
        detail: `${d.token} 的证据链没有任何 \`path:line\`（不可追溯）`,
        severity,
      })
      continue
    }
    const nodeRefs = [...evLine.matchAll(NODE_REF_RE)].map((m) => `n${m[1]}`).filter((id) => contentIds.includes(id))
    const scope = nodeRefs.length > 0 ? nodeRefs : contentIds
    const upstream = new Map<string, string>()
    for (const id of scope) {
      const t = readIfExists(path.join(topicDir, "nodes", id, "RESULT.md"))
      if (t !== null) upstream.set(id, t)
    }
    for (const t of tokenRefs) {
      const re = new RegExp(`${escapeRe(t.path)}:${t.line}(?:-\\d+)?`)
      const hit = [...upstream.values()].some((t) => re.test(t))
      if (!hit) {
        out.push({
          code: "synth_evidence_unresolvable",
          node: answerId,
          detail: `${d.token} 的证据 \`${t.path}:${t.line}\` 在${scope.length === 1 ? ` ${scope[0]}` : "上游"}的 RESULT.md 中不存在（字面比对）`,
          severity,
        })
      }
    }
  }
  return out
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
    const rawRes = readIfExists(path.join(topicDir, "nodes", cid, "RESULT.md"))
    if (rawRes === null) continue
    // 示例代码块里的标记不算（critic SF④）
    const res = stripFenced(rawRes)
    for (const line of res.split(/\r?\n/)) {
      for (const hit of scanMarkers(line)) {
        if (hit.token === null) {
          violations.push({
            code: "synth_token_missing",
            node: cid,
            detail: `标记 ${hit.marker} 后无稳定 token（应为「标记 + 单 token slug / path:line」）：${line.trim().slice(0, 120)}`,
            severity: opts.strictToken ? "blocking" : "info",
          })
        } else {
          heavy.push({ node: cid, token: hit.token })
        }
      }
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

  // V6：结论级证据链 / 推断链（ADR-plan-collaboration-hardening D3）
  if (ansResult !== null) {
    violations.push(...checkConclusionChains(topicDir, answer, ansResult, contents, opts))
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
