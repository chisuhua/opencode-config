import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  answerNodeId,
  checkSynthesis,
  contentNodeIds,
  extractStableId,
  isAmbiguousId,
  isSynthId,
} from "../scripts/plan-synthesis-check.ts"
import { parseGraph } from "../lib/plan-topics.ts"

// ── fixture 工具 ──────────────────────────────────────────────────────────────
interface NodeSpec {
  id: string
  deps?: string[]
  cancelled?: boolean
}
interface TopicSpec {
  nodes: NodeSpec[]
  brief?: Record<string, string> // node id → BRIEF 正文
  result?: Record<string, string> // node id → RESULT 正文
}

function makeTopic(spec: TopicSpec): string {
  // ⚠ 用系统临时目录（本机 `tmpdir()` = /tmp，实测可写；`/tmp/opencode` 是 scratch 约定，不强制）
  const base = path.join(tmpdir(), "plan-synth-")
  const dir = mkdtempSync(base)
  const graph = {
    version: 1,
    topic: "t",
    nodes: spec.nodes.map((n) => ({
      id: n.id,
      title: n.id,
      deps: n.deps ?? [],
      owner: "child",
      status: "pending",
      progress: "todo",
      attempts: [],
      deliverables: [`nodes/${n.id}/RESULT.md`],
      ...(n.cancelled ? { cancelled: { by: "parent", reason: "x" } } : {}),
    })),
  }
  writeFileSync(path.join(dir, "graph.json"), JSON.stringify(graph, null, 2))
  for (const [id, text] of Object.entries(spec.brief ?? {})) {
    mkdirSync(path.join(dir, "nodes", id), { recursive: true })
    writeFileSync(path.join(dir, "nodes", id, "BRIEF.md"), text)
  }
  for (const [id, text] of Object.entries(spec.result ?? {})) {
    mkdirSync(path.join(dir, "nodes", id), { recursive: true })
    writeFileSync(path.join(dir, "nodes", id, "RESULT.md"), text)
  }
  return dir
}

const CODES = (dir: string, opts = {}) => checkSynthesis(dir, opts).violations.map((v) => v.code)
const BLOCKING = (dir: string, opts = {}) =>
  checkSynthesis(dir, opts).violations.filter((v) => v.severity === "blocking").map((v) => v.code)

const BRIEF_OK = `# BRIEF

## 根裁决集

- R1：不要把「多租户」纳入方案
- R2：只读优先，不加写通道
`

/** 合成稿模板：五节结构 + §反哺清单 */
function synthResult(opts: { fanbu?: string[]; rulings?: string[] }): string {
  const fanbu = (opts.fanbu ?? []).map((x) => `- ${x}`).join("\n")
  const rulings = (opts.rulings ?? []).map((x) => `- ${x}`).join("\n")
  return `# RESULT

## 结论

合成完成。

## 各节点结论的合并

略。

## 父的裁决汇总

${rulings}

## 反哺清单

${fanbu}

## 不声称的东西

无。
`
}

// 内容节点 a1：带合规 token 的最重项
const A1_OK = `# RESULT

## 结论

结论 a1。

## 薄弱点

- （最重）\`commit-gate-bypass\`
`

// ── §2 解析规则 ──────────────────────────────────────────────────────────────
describe("§2 解析规则", () => {
  test("SynthId：m1/m10 是合成；m01/m1-extra/m_1/m.1/m1a 是歧义；metrics/migration 是内容", () => {
    for (const id of ["m1", "m10", "m2"]) expect(isSynthId(id), id).toBe(true)
    for (const id of ["m01", "m0", "m1-extra", "m_1", "m.1", "m1a"]) {
      expect(isSynthId(id), id).toBe(false)
      expect(isAmbiguousId(id), id).toBe(true)
    }
    for (const id of ["metrics", "migration", "m", "a1"]) {
      expect(isSynthId(id), id).toBe(false)
      expect(isAmbiguousId(id), id).toBe(false)
    }
  })

  test("内容节点集合 & 答案节点（整数后缀最大，cancelled 短路）", () => {
    const nodes = [
      { id: "a1", deps: [] },
      { id: "a2", deps: [] },
      { id: "metrics", deps: [] },
      { id: "m1", deps: [] },
      { id: "m10", deps: [] },
      { id: "m2", deps: [] },
      { id: "m3", deps: [], cancelled: true },
    ]
    expect(contentNodeIds(nodes as any).sort()).toEqual(["a1", "a2", "metrics"])
    expect(answerNodeId(nodes as any)).toBe("m10") // 整数序，非字典序
  })
})

// ── §3 V4a / V4b ─────────────────────────────────────────────────────────────
describe("§3 V4a/V4b：结论层硬判据", () => {
  test("标记项进结论层 ⇒ 无违规", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: BRIEF_OK },
      result: {
        a1: A1_OK,
        m1: synthResult({ fanbu: ["`commit-gate-bypass`（须修）"], rulings: ["R1", "R2"] }),
      },
    })
    expect(BLOCKING(d)).toEqual([])
  })

  test("标记项未进结论层 ⇒ synth_heavy_item_not_in_conclusion", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: BRIEF_OK },
      result: { a1: A1_OK, m1: synthResult({ fanbu: ["别的"], rulings: ["R1", "R2"] }) },
    })
    expect(BLOCKING(d)).toContain("synth_heavy_item_not_in_conclusion")
  })

  test("标记行无 stable id ⇒ 仅 synth_token_missing（info），不阻断", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: BRIEF_OK },
      result: {
        a1: "## 薄弱点\n\n**薄弱点 1（最重）：`git merge` 绕开 commit-gate**\n",
        m1: synthResult({ rulings: ["R1", "R2"] }),
      },
    })
    const r = checkSynthesis(d)
    expect(r.violations.map((v) => v.code)).toContain("synth_token_missing")
    expect(r.violations.find((v) => v.code === "synth_token_missing")!.severity).toBe("info")
    expect(r.violations.filter((v) => v.severity === "blocking")).toEqual([])
  })

  test("--strict-token ⇒ synth_token_missing 升 blocking", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: BRIEF_OK },
      result: {
        a1: "## 薄弱点\n\n**薄弱点 1（最重）：`git merge` 绕开 commit-gate**\n",
        m1: synthResult({ rulings: ["R1", "R2"] }),
      },
    })
    expect(BLOCKING(d, { strictToken: true })).toContain("synth_token_missing")
  })

  test("部分匹配陷阱：多词反引号不得抽出首词", () => {
    expect(extractStableId("**薄弱点 1（最重）：`git merge` 绕开 commit-gate**")).toBeNull()
    expect(extractStableId("- （最重）`commit-gate`")).toBe("commit-gate")
    expect(extractStableId("- 【必须上报】docs/adr/x.md:42")).toBe("docs/adr/x.md:42")
    expect(extractStableId("- （最重）：`docs/adr/x.md:42`")).toBe("docs/adr/x.md:42")
    expect(extractStableId("**薄弱点 1（最重）**：见 nodes/n3/RESULT.md:302")).toBeNull()
  })

  // 审查 F1 实测：裸 token 必须「像 slug/path」，否则普通英文词会让 V4a 的 includes 恒真 ⇒ 假绿
  test("F1：裸英文词不得被抽成 token；裸 slug / path 仍可", () => {
    expect(extractStableId("（最重）：git merge 绕开 commit-gate")).toBeNull()
    expect(extractStableId("（最重）：session 模型静默降级")).toBeNull()
    expect(extractStableId("（最重）：worker 不读盘")).toBeNull()
    expect(extractStableId("（最重）：commit-gate 绕过")).toBe("commit-gate")
    expect(extractStableId("（最重）：docs/adr/x.md:42")).toBe("docs/adr/x.md:42")
  })

  // 审查 F10：结论层缺失时聚合为一条，不逐项刷 blocking
  test("F10：缺 ## 反哺清单 ⇒ 一条 synth_conclusion_layer_missing", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: BRIEF_OK },
      result: { a1: A1_OK, m1: "# RESULT\n\n## 结论\n\n没有反哺清单节\n" },
    })
    const codes = checkSynthesis(d).violations.map((v) => v.code)
    expect(codes).toContain("synth_conclusion_layer_missing")
    expect(codes).not.toContain("synth_heavy_item_not_in_conclusion")
    expect(codes.filter((c) => c === "synth_conclusion_layer_missing").length).toBe(1)
  })
})

// ── §4 V5a/V5b/V5c + V5d ─────────────────────────────────────────────────────
describe("§4 V5：结构判据", () => {
  test("deps 漏一个内容节点 ⇒ union_incomplete + answer_dep_incomplete", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "a2" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: BRIEF_OK },
      result: { a1: A1_OK, a2: "无标记\n", m1: synthResult({ rulings: ["R1", "R2"] }) },
    })
    const b = BLOCKING(d)
    expect(b).toContain("synth_dep_union_incomplete")
    expect(b).toContain("synth_answer_dep_incomplete")
  })

  test("deps 含上游合成节点 ⇒ synth_dep_on_synth", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }, { id: "m2", deps: ["a1", "m1"] }],
      brief: { m1: BRIEF_OK, m2: BRIEF_OK },
      result: {
        a1: A1_OK,
        m1: synthResult({ fanbu: ["`commit-gate-bypass`"], rulings: ["R1", "R2"] }),
        m2: synthResult({ fanbu: ["`commit-gate-bypass`"], rulings: ["R1", "R2"] }),
      },
    })
    expect(BLOCKING(d)).toContain("synth_dep_on_synth")
  })

  test("追加式 m1 + m2 共存：V5b 只判 m2，V5a 并集通过", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "a2" }, { id: "m1", deps: ["a1"] }, { id: "m2", deps: ["a1", "a2"] }],
      brief: { m1: BRIEF_OK, m2: BRIEF_OK },
      result: { a1: A1_OK, a2: "无标记\n", m1: "旧稿\n", m2: synthResult({ fanbu: ["`commit-gate-bypass`"], rulings: ["R1", "R2"] }) },
    })
    const b = BLOCKING(d)
    expect(b).not.toContain("synth_dep_union_incomplete")
    expect(b).not.toContain("synth_answer_dep_incomplete")
  })

  test("歧义 id ⇒ synth_id_ambiguous", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m01", deps: ["a1"] }],
      brief: { m01: BRIEF_OK },
      result: { a1: A1_OK, m01: synthResult({ rulings: ["R1", "R2"] }) },
    })
    expect(BLOCKING(d)).toContain("synth_id_ambiguous")
  })

  test("metrics 作内容节点 ⇒ 不报", () => {
    const d = makeTopic({
      nodes: [{ id: "metrics" }, { id: "m1", deps: ["metrics"] }],
      brief: { m1: BRIEF_OK },
      result: { metrics: "无标记\n", m1: synthResult({ rulings: ["R1", "R2"] }) },
    })
    expect(BLOCKING(d)).toEqual([])
  })
})

// ── §5 V4c：根裁决集 ─────────────────────────────────────────────────────────
describe("§5 V4c：根裁决集 slug 包含", () => {
  test("BRIEF 无 ## 根裁决集 ⇒ synth_brief_no_ruling_set", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: "# BRIEF\n\n没有这一节\n" },
      result: { a1: "无标记\n", m1: synthResult({ rulings: ["R1"] }) },
    })
    expect(BLOCKING(d)).toContain("synth_brief_no_ruling_set")
  })

  test("R1/R2 只回指 R1 ⇒ synth_ruling_not_propagated（detail 含 R2）", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: BRIEF_OK },
      result: { a1: "无标记\n", m1: synthResult({ rulings: ["R1"] }) },
    })
    const v = checkSynthesis(d).violations.find((x) => x.code === "synth_ruling_not_propagated")
    expect(v).toBeTruthy()
    expect(v!.detail).toContain("R2")
  })

  test("显式写「无」⇒ 通过", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: "# BRIEF\n\n## 根裁决集\n\n无\n" },
      result: { a1: "无标记\n", m1: synthResult({ rulings: [] }) },
    })
    expect(BLOCKING(d)).toEqual([])
  })

  // 审查 F4a：R slug 必须带词边界（AR2 不得抽成 R2）
  test("F4a：`AR2` 不得被抽成 `R2`", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: "# BRIEF\n\n## 根裁决集\n\n- R1：参照 AR2 的处置\n" },
      result: { a1: "无标记\n", m1: synthResult({ rulings: ["R1"] }) },
    })
    expect(BLOCKING(d)).toEqual([])
  })

  // 审查 F4b：「无」不得用子串匹配（自然裁决句里的「无」会跳过整段回指检查 ⇒ 假绿）
  test("F4b：含「无」的自然裁决句不得被当「无裁决」", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: "# BRIEF\n\n## 根裁决集\n\n- 不要纳入多租户（无写通道）\n" },
      result: { a1: "无标记\n", m1: synthResult({ rulings: [] }) },
    })
    expect(BLOCKING(d)).toContain("synth_brief_no_ruling_set")
  })
})

// ── §7 无合成节点 ────────────────────────────────────────────────────────────
describe("§7 无合成节点", () => {
  test("默认 exit 0（正常态）；--require-synthesis ⇒ synth_answer_missing", () => {
    const d = makeTopic({ nodes: [{ id: "a1" }], result: { a1: "x\n" } })
    expect(BLOCKING(d)).toEqual([])
    expect(BLOCKING(d, { requireSynthesis: true })).toContain("synth_answer_missing")
  })
})

// ── graph.json 异常 ──────────────────────────────────────────────────────────
describe("graph.json 异常", () => {
  test("缺失 ⇒ synth_graph_error（blocking）", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-synth-empty-"))
    const r = checkSynthesis(dir)
    expect(r.violations.map((v) => v.code)).toEqual(["synth_graph_error"])
    expect(r.violations[0].severity).toBe("blocking")
  })
})

// ── §7 退出码（CLI 端到端） ─────────────────────────────────────────────────
describe("§7 CLI 退出码", () => {
  const SCRIPT = path.join(import.meta.dir, "..", "scripts", "plan-synthesis-check.ts")
  const run = (args: string[]) => {
    const p = Bun.spawnSync(["bun", SCRIPT, ...args], { stdout: "pipe", stderr: "pipe" })
    return p.exitCode
  }

  test("无合成节点 ⇒ 0", () => {
    const d = makeTopic({ nodes: [{ id: "a1" }] })
    expect(run([d])).toBe(0)
  })

  test("有阻断违规 ⇒ 1", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: [] }],
      brief: { m1: BRIEF_OK },
      result: { a1: A1_OK, m1: synthResult({ rulings: ["R1", "R2"] }) },
    })
    expect(run([d])).toBe(1)
  })

  test("无参数 ⇒ 2", () => {
    expect(run([])).toBe(2)
  })

  test("graph.json 缺失 ⇒ 3", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "plan-synth-nog-"))
    expect(run([dir])).toBe(3)
  })

  test("--strict-token 把 info 升 blocking ⇒ 1", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "m1", deps: ["a1"] }],
      brief: { m1: BRIEF_OK },
      result: {
        a1: "**薄弱点 1（最重）：`git merge` 绕开 commit-gate**\n",
        m1: synthResult({ rulings: ["R1", "R2"] }),
      },
    })
    expect(run([d])).toBe(0)
    expect(run([d, "--strict-token"])).toBe(1)
  })

  test("--require-synthesis 在无合成节点时 ⇒ 1", () => {
    const d = makeTopic({ nodes: [{ id: "a1" }] })
    expect(run([d, "--require-synthesis"])).toBe(1)
  })
})

// ── §1 漂移防护：与 lib/plan-topics.ts 的节点解析一致 ────────────────────────
describe("§1 漂移防护", () => {
  test("同一 fixture：本载体的节点 id 集合 == lib/plan-topics.parseGraph", () => {
    const d = makeTopic({
      nodes: [{ id: "a1" }, { id: "a2", deps: ["a1"] }, { id: "m1", deps: ["a1", "a2"] }],
      brief: { m1: BRIEF_OK },
      result: { m1: synthResult({ rulings: [] }) },
    })
    const raw = require("node:fs").readFileSync(path.join(d, "graph.json"), "utf8") as string
    const libIds = parseGraph(raw).nodes.map((n: { id: string }) => n.id).sort()
    const mine = JSON.parse(raw).nodes.map((n: { id: string }) => n.id).sort()
    expect(mine).toEqual(libIds)
  })
})
