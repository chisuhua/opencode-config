/**
 * plan 侧协作 —— 生命周期语义（L1 语义 e2e）
 * 覆盖 ADR D9（取消语义）/ D10（在飞与 fence）/ D11（收敛判据）的判据 V16–V36。
 * 真文件 + 真 git fixture；不依赖模型与真实 opencode 运行时。
 *
 * fixture（三节点、**无环**）：a1（无依赖）→ a2（依赖 a1）；a3 独立（用于「兄弟变更不触发」与 deps 漂移的目标）。
 */
import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import {
  checkTopic,
  deriveStatus,
  dispatchableNodes,
  graphStructureHash,
  isBlocking,
  loadGraph,
} from "../lib/plan-topics.ts"
import {
  cleanupTmp,
  cli,
  completeNode,
  gitTopic,
  node,
  writeBrief,
  writeGraph,
} from "./helpers/plan-topic-fixture.ts"

afterAll(cleanupTmp)

const deliv = (id: string) => [`nodes/${id}/RESULT.md`]

function fixtureTopic(): string {
  const { topic } = gitTopic([
    node({ id: "a1", deps: [], deliverables: deliv("a1") }),
    node({ id: "a2", deps: ["a1"], deliverables: deliv("a2") }),
    node({ id: "a3", deps: [], deliverables: deliv("a3") }),
  ])
  return topic
}

/** 完成一个节点：TODO 全勾 + RESULT 正文（同时充当交付物）+ 缓存回填为 done */
function complete(d: string, id: string): void {
  completeNode(d, id)
  const g = loadGraph(d)
  const n = g.nodes.find((x) => x.id === id)
  if (n) {
    n.status = "done"
    n.progress = "complete"
    writeGraph(d, g.nodes)
  }
}

/** 完整生命周期：claim（登记 + 快照）→ complete（产物 + 缓存）→ close（闭合 attempt） */
function doneNode(d: string, id: string): void {
  expect(cli(["claim", d, id]).status).toBe(0)
  complete(d, id)
  expect(cli(["close", d, id]).status).toBe(0)
}

function graphJson(d: string): string {
  return readFileSync(path.join(d, "graph.json"), "utf8")
}

function blockingCodes(d: string, phase: "dispatch" | "final" = "final"): string[] {
  return checkTopic(d, { phase }).filter(isBlocking).map((v) => v.code)
}

// ── D9 取消语义 ──────────────────────────────────────────────────────────────

describe("D9 取消语义（V16–V21）", () => {
  test("V16 取消派生：cancelled 标志 ⇒ status=cancelled（无论磁盘有无产物）；下游 blocked_by_deps", () => {
    const d = fixtureTopic()
    const g = loadGraph(d)
    const a1 = g.nodes.find((n) => n.id === "a1")!
    a1.cancelled = { by: "parent", reason: "不再需要", at: "2026-01-01T00:00:00Z" }
    a1.status = "cancelled"
    writeGraph(d, g.nodes)

    const status = deriveStatus(g, d)
    expect(status.get("a1")).toBe("cancelled")
    expect(status.get("a2")).toBe("blocked_by_deps")
    // 活跃下游依赖已取消节点 ⇒ 不变量报警（D9）
    expect(blockingCodes(d)).toContain("cancelled_dep_active")
  })

  test("V17 派发排除：cancelled 节点不出现在可派集合", () => {
    const d = fixtureTopic()
    const g = loadGraph(d)
    const a1 = g.nodes.find((n) => n.id === "a1")!
    a1.cancelled = { by: "parent", reason: "砍掉" }
    a1.status = "cancelled"
    writeGraph(d, g.nodes)
    expect(dispatchableNodes(loadGraph(d), d)).not.toContain("a1")
  })

  test("V18 强制消解：活跃下游未消解 ⇒ 恰好一条 cancelled_dep_active 并点名下游；消解后零阻断", () => {
    const d = fixtureTopic()
    const g = loadGraph(d)
    const a1 = g.nodes.find((n) => n.id === "a1")!
    a1.cancelled = { by: "parent", reason: "砍掉" }
    a1.status = "cancelled"
    writeGraph(d, g.nodes)

    const vs = checkTopic(d, { phase: "final" })
    const deps = vs.filter((v) => v.code === "cancelled_dep_active")
    expect(deps.length).toBe(1)
    expect(deps[0].node).toBe("a2")
    expect(deps[0].detail).toContain("a1")

    // 摘边后该违规消失
    const g2 = loadGraph(d)
    g2.nodes.find((n) => n.id === "a2")!.deps = []
    writeGraph(d, g2.nodes)
    expect(blockingCodes(d)).not.toContain("cancelled_dep_active")
  })

  test("V19 完整性：by≠parent / reason 空 ⇒ cancelled_unattributed；未闭合 attempt ⇒ cancelled_open_attempt", () => {
    const d = fixtureTopic()
    const g = loadGraph(d)
    const a1 = g.nodes.find((n) => n.id === "a1")!
    a1.cancelled = { by: "child", reason: "" }
    a1.status = "cancelled"
    a1.attempts.push({ agent: "plan-worker", started_at: "2026-01-01T00:00:00Z" })
    writeGraph(d, g.nodes)

    const codes = blockingCodes(d)
    expect(codes).toContain("cancelled_unattributed")
    expect(codes).toContain("cancelled_open_attempt")
  })

  test("V20 缓存兼容：cancelled 节点缓存写 done ⇒ cache_ahead；写 pending ⇒ 仅 cache_behind（info）", () => {
    const d = fixtureTopic()
    const g = loadGraph(d)
    const a1 = g.nodes.find((n) => n.id === "a1")!
    a1.cancelled = { by: "parent", reason: "砍掉" }
    a1.status = "done" // 缓存撒谎
    writeGraph(d, g.nodes)
    expect(blockingCodes(d)).toContain("cache_ahead")

    // 缓存改为 pending（与派生一致）⇒ 无 cache_ahead，只剩 cache_behind（info）
    const g2 = loadGraph(d)
    g2.nodes.find((n) => n.id === "a1")!.status = "pending"
    g2.nodes.find((n) => n.id === "a2")!.deps = [] // 摘边 ⇒ 无 cancelled_dep_active 干扰
    writeGraph(d, g2.nodes)
    const all = checkTopic(d, { phase: "final" })
    expect(all.filter(isBlocking).map((v) => v.code)).not.toContain("cache_ahead")
    expect(all.map((v) => v.code)).toContain("cache_behind")
  })

  test("V21 迁移：无 cancelled 字段的 v1 fixture 零改动通过；cancelled 节点豁免 missing_brief / missing_deliverable", () => {
    const d = fixtureTopic()
    expect(blockingCodes(d).filter((c) => c.startsWith("cancelled_"))).toEqual([])

    const g = loadGraph(d)
    const a1 = g.nodes.find((n) => n.id === "a1")!
    a1.cancelled = { by: "parent", reason: "砍掉" }
    a1.status = "cancelled"
    writeGraph(d, g.nodes)
    // cancelled 节点**自身**不再被要求 BRIEF / 交付物（其余节点的缺失仍是它们自己的问题）
    const mine = checkTopic(d, { phase: "final" }).filter((v) => v.node === "a1")
    expect(mine.map((v) => v.code)).not.toContain("missing_brief")
    expect(mine.map((v) => v.code)).not.toContain("missing_deliverable")
  })
})

// ── D10 在飞与 fence ─────────────────────────────────────────────────────────

describe("D10 在飞与 fence（V22–V29）", () => {
  test("V22 阶段口径：健康多级 DAG 在 dispatch 下 exit 0，final 才全量报", () => {
    const d = fixtureTopic()
    expect(cli(["check", d, "--phase", "dispatch"]).status).toBe(0)
    expect(cli(["check", d, "--phase", "final"]).status).toBe(1)
  })

  test("V23 严重度分向：cache_ahead 阻断 / cache_behind 为 info；--json 带 severity，ok 只看阻断项", () => {
    const d = fixtureTopic()
    const g = loadGraph(d)
    g.nodes.find((n) => n.id === "a1")!.status = "done"
    writeGraph(d, g.nodes)
    const payload = JSON.parse(cli(["check", d, "--json"]).stdout) as {
      ok: boolean
      violations: Array<{ code: string; severity: string }>
    }
    expect(payload.ok).toBe(false)
    expect(payload.violations.some((v) => v.code === "cache_ahead" && v.severity === "error")).toBe(true)
  })

  test("V24 在飞排除派发：未闭合 attempt ⇒ 不在 ready；ready --json 的 in_flight 含该节点", () => {
    const d = fixtureTopic()
    expect(JSON.parse(cli(["ready", d, "--json"]).stdout).ready).toEqual(["a1", "a3"])

    expect(cli(["claim", d, "a1"]).status).toBe(0)

    const after = JSON.parse(cli(["ready", d, "--json"]).stdout) as {
      ready: string[]
      in_flight: Array<{ node: string; started_at: string; liveness_stale: boolean }>
    }
    expect(after.ready).not.toContain("a1")
    expect(after.in_flight.map((x) => x.node)).toEqual(["a1"])
    expect(typeof after.in_flight[0].liveness_stale).toBe("boolean")
  })

  test("V25 claim 互斥：首次成功；二次被拒且 graph.json 逐字节不变", () => {
    const d = fixtureTopic()
    expect(cli(["claim", d, "a1"]).status).toBe(0)
    const after1 = graphJson(d)
    expect(cli(["claim", d, "a1"]).status).not.toBe(0)
    expect(graphJson(d)).toBe(after1)
    const att = loadGraph(d).nodes.find((n) => n.id === "a1")!.attempts[0]
    expect(att.input).toBeDefined()
    expect(Array.isArray(att.input?.deps)).toBe(true)
  })

  test("V25 并发子句：两子进程并发 claim 同一节点 ⇒ 恰好一个 exit 0（barrier 编排，非裸并发）", async () => {
    const d = fixtureTopic()
    const fixture = path.join(import.meta.dir, "fixtures", "plan-claim-child.ts")
    const repoRoot = path.dirname(d)
    const readyA = path.join(repoRoot, "readyA")
    const readyB = path.join(repoRoot, "readyB")
    const spawn = (myReady: string, peer: string) =>
      Bun.spawn(["bun", fixture, d, "a1", myReady, peer], { stdout: "pipe", stderr: "pipe" })
    const a = spawn(readyA, readyB)
    const b = spawn(readyB, readyA)
    const [ca, cb] = await Promise.all([a.exited, b.exited])
    const codes = [ca, cb].sort((x, y) => x - y)
    // 2 = 夹具的 barrier 超时 ⇒ 必须显式排除，否则夹具故障会冒充「被拒」
    expect(codes, `退出码不得含 2（barrier 故障）：[${ca}, ${cb}]`).not.toContain(2)
    expect(codes[0], "并发 claim 必须恰好一个成功").toBe(0)
    expect(codes[1], "另一方必须被拒（exit ≠ 0）").not.toBe(0)
    const attempts = loadGraph(d).nodes.find((n) => n.id === "a1")!.attempts
    expect(attempts.length, "只允许一条 attempt 落盘").toBe(1)
  })

  test("V26 close 与 reap：close 后重回可派；无 open attempt 时 close 无写；reap 需 --confirm", () => {
    const d = fixtureTopic()
    expect(cli(["claim", d, "a1"]).status).toBe(0)
    expect(cli(["close", d, "a1"]).status).toBe(0)
    expect(JSON.parse(cli(["ready", d, "--json"]).stdout).ready).toContain("a1")

    const snapshot = graphJson(d)
    expect(cli(["close", d, "a1"]).status).not.toBe(0)
    expect(graphJson(d)).toBe(snapshot)

    // reap 必须显式确认（无人值守 ⇒ 非交互）
    expect(cli(["reap", d, "a1"]).status).not.toBe(0)
    expect(cli(["reap", d, "a1", "--confirm"]).status).not.toBe(0) // 无 open attempt ⇒ 拒绝
  })

  test("V27 stale_inputs 指名：改 deps / BRIEF 各自被点名；兄弟节点变更不触发", () => {
    const d = fixtureTopic()
    doneNode(d, "a1")

    // 改 deps（目标 a3 ⇒ 无环）
    let g = loadGraph(d)
    g.nodes.find((n) => n.id === "a1")!.deps = ["a3"]
    writeGraph(d, g.nodes)
    let vs = checkTopic(d, { phase: "final" }).filter((v) => v.code === "stale_inputs")
    expect(vs.length).toBe(1)
    expect(vs[0].detail).toContain("deps")

    // 改 BRIEF（deps 复位 ⇒ 只剩 brief 漂移）
    g = loadGraph(d)
    g.nodes.find((n) => n.id === "a1")!.deps = []
    writeGraph(d, g.nodes)
    writeBrief(d, "a1", "# 被改过的 brief\n")
    vs = checkTopic(d, { phase: "final" }).filter((v) => v.code === "stale_inputs")
    expect(vs.length).toBe(1)
    expect(vs[0].detail).toContain("brief")

    // 兄弟节点（a3）的 BRIEF 变更 **不触发**（节点级投影 ⇒ 兄弟免疫）
    writeBrief(d, "a1", "# brief\n")
    writeBrief(d, "a3", "# 兄弟的 brief 改了\n")
    vs = checkTopic(d, { phase: "final" }).filter((v) => v.code === "stale_inputs")
    expect(vs.length).toBe(0)
  })

  test("V28 豁免与迁移：inputs_reviewed ⇒ final exit 0；缺 ⇒ 非 0；dispatch 不产生该码；畸形 input ⇒ schema_invalid", () => {
    const d = fixtureTopic()
    doneNode(d, "a1")
    doneNode(d, "a2")
    doneNode(d, "a3")
    writeBrief(d, "a1", "# 被改过的 brief\n") // 制造 brief 漂移（唯一的阻断项）

    expect(blockingCodes(d)).toContain("stale_inputs")
    expect(cli(["check", d, "--phase", "dispatch"]).status).toBe(0) // dispatch 不产生 stale_inputs
    expect(cli(["check", d, "--phase", "final"]).status).not.toBe(0)

    // 父复核豁免
    const g = loadGraph(d)
    g.nodes.find((n) => n.id === "a1")!.attempts[0].inputs_reviewed = { at: "2026-01-01T00:00:00Z", note: "已复核" }
    writeGraph(d, g.nodes)
    expect(cli(["check", d, "--phase", "final"]).status).toBe(0)

    // 畸形 input ⇒ schema_invalid（exit 3）
    const g2 = loadGraph(d)
    const att = g2.nodes.find((n) => n.id === "a1")!.attempts[0] as unknown as { input: unknown }
    att.input = { deps: "nope" }
    writeGraph(d, g2.nodes)
    expect(cli(["check", d]).status).toBe(3)
  })

  test("V28b cancel 后给 cancelled 节点 BRIEF 补写取消理由 ⇒ final exit 0（快照冻结生效）", () => {
    const d = fixtureTopic()
    doneNode(d, "a1")
    doneNode(d, "a2")
    expect(cli(["cancel", d, "a3", "--reason", "不需要了"]).status).toBe(0)
    // 取消后补写理由（父的自然动作）⇒ 不应触发 stale_inputs
    writeBrief(d, "a3", "# brief\n\n取消理由：不需要了\n")
    expect(blockingCodes(d)).not.toContain("stale_inputs")
    expect(cli(["check", d, "--phase", "final"]).status).toBe(0)
  })

  test("V29 溯源哈希：precheck.graph_rev == 图结构投影 sha256；仅回填缓存时不变，改结构则变", () => {
    const d = fixtureTopic()
    cli(["claim", d, "a1"])
    const rev = loadGraph(d).nodes.find((n) => n.id === "a1")!.attempts[0].precheck?.graph_rev
    expect(typeof rev).toBe("string")
    expect((rev as string).length).toBe(64)
    expect(rev).toBe(graphStructureHash(d, loadGraph(d)))

    // 仅回填缓存 ⇒ 哈希不变
    const g2 = loadGraph(d)
    g2.nodes.find((n) => n.id === "a1")!.status = "pending"
    writeGraph(d, g2.nodes)
    expect(loadGraph(d).nodes.find((n) => n.id === "a1")!.attempts[0].precheck?.graph_rev).toBe(rev)

    // 改结构 ⇒ 哈希变
    const g3 = loadGraph(d)
    g3.nodes.find((n) => n.id === "a1")!.deps = ["a3"]
    writeGraph(d, g3.nodes)
    expect(graphStructureHash(d, loadGraph(d))).not.toBe(rev)
  })
})

// ── D11 收敛判据 ─────────────────────────────────────────────────────────────

describe("D11 收敛判据（V30–V36）", () => {
  test("V30 收敛（纯链）：全 done ⇒ converged=true、done 计数 == 节点数、其余六桶全空", () => {
    const d = fixtureTopic()
    doneNode(d, "a1")
    doneNode(d, "a2")
    doneNode(d, "a3")
    const payload = JSON.parse(cli(["check", d, "--json"]).stdout) as {
      converged: boolean
      summary: Record<string, unknown[]>
    }
    expect(payload.converged).toBe(true)
    expect(payload.summary.done.length).toBe(3)
    for (const k of ["cancelled", "in_flight", "input_drift", "ready", "blocking", "needs_review"]) {
      expect(payload.summary[k].length).toBe(0)
    }
  })

  test("V31 未收敛的两种典型 + dispatch 口径下的刻意不一致", () => {
    const d = fixtureTopic()
    doneNode(d, "a1")
    doneNode(d, "a3")
    let payload = JSON.parse(cli(["check", d, "--json"]).stdout) as {
      converged: boolean
      summary: { ready: string[]; in_flight: unknown[] }
    }
    expect(payload.converged).toBe(false)
    expect(payload.summary.ready).toEqual(["a2"])
    expect(payload.summary.in_flight.length).toBe(0)

    // 未闭合 attempt ⇒ in_flight 含该节点 + converged=false
    cli(["claim", d, "a2"])
    payload = JSON.parse(cli(["check", d, "--json"]).stdout) as {
      converged: boolean
      summary: { in_flight: Array<{ node: string }> }
    }
    expect(payload.converged).toBe(false)
    expect(payload.summary.in_flight.map((x) => x.node)).toEqual(["a2"])

    // dispatch 口径：ok=true ∧ converged=false（**刻意的不一致**）
    const dp = JSON.parse(cli(["check", d, "--phase", "dispatch", "--json"]).stdout) as {
      ok: boolean
      converged: boolean
    }
    expect(dp.ok).toBe(true)
    expect(dp.converged).toBe(false)
  })

  test("V32 取消即收敛：取消叶子分支 + 其余 done ⇒ converged=true，cancelled 桶逐条列 {id, reason}", () => {
    const d = fixtureTopic()
    doneNode(d, "a1")
    doneNode(d, "a2")
    expect(cli(["cancel", d, "a3", "--reason", "范围变了"]).status).toBe(0)
    const payload = JSON.parse(cli(["check", d, "--json"]).stdout) as {
      converged: boolean
      summary: { cancelled: Array<{ id: string; reason: string }> }
    }
    expect(payload.converged).toBe(true)
    expect(payload.summary.cancelled.length).toBe(1)
    expect(payload.summary.cancelled[0].id).toBe("a3")
    expect(payload.summary.cancelled[0].reason).toBe("范围变了")
    expect(typeof payload.summary.cancelled[0].at).toBe("string")
    expect(cli(["check", d, "--phase", "final"]).status).toBe(0)
  })

  test("V33 阻断即未收敛：cache_ahead ⇒ converged=false 且 blocking 桶指名节点", () => {
    const d = fixtureTopic()
    const g = loadGraph(d)
    g.nodes.find((n) => n.id === "a1")!.status = "done" // 缓存撒谎（磁盘无产物）
    writeGraph(d, g.nodes)
    const payload = JSON.parse(cli(["check", d, "--json"]).stdout) as {
      converged: boolean
      summary: { blocking: Array<{ code: string; node?: string }> }
    }
    expect(payload.converged).toBe(false)
    expect(payload.summary.blocking.some((b) => b.code === "cache_ahead" && b.node === "a1")).toBe(true)
  })

  test("V34 锁无关：全 done + 锁未释放 ⇒ converged=true；check 前后 graph.json 逐字节不变", () => {
    const { repo, topic } = gitTopic([
      node({ id: "a1", deps: [], deliverables: deliv("a1") }),
      node({ id: "a3", deps: [], deliverables: deliv("a3") }),
    ])
    complete(topic, "a1")
    complete(topic, "a3")
    // 造一个未释放的锁（协议级，不进判据）
    mkdirSync(path.join(repo, ".rddf", "state", "plan-topics", "demo.lock"), { recursive: true })
    const before = graphJson(topic)
    const payload = JSON.parse(cli(["check", topic, "--json"]).stdout) as { converged: boolean }
    expect(payload.converged).toBe(true)
    expect(graphJson(topic)).toBe(before)
  })

  test("V35 待复核层：未复核 ⇒ converged=false 且 needs_review 桶指名；复核后 ⇒ true", () => {
    const d = fixtureTopic()
    doneNode(d, "a1")
    doneNode(d, "a2")
    doneNode(d, "a3")
    writeBrief(d, "a3", "# 改过的 brief\n") // 制造 brief 漂移

    let payload = JSON.parse(cli(["check", d, "--json"]).stdout) as {
      converged: boolean
      summary: { needs_review: Array<{ node: string }> }
    }
    expect(payload.converged).toBe(false)
    expect(payload.summary.needs_review.map((x) => x.node)).toContain("a3")

    const g = loadGraph(d)
    g.nodes.find((n) => n.id === "a3")!.attempts[0].inputs_reviewed = { at: "2026-01-01T00:00:00Z" }
    writeGraph(d, g.nodes)
    payload = JSON.parse(cli(["check", d, "--json"]).stdout) as { converged: boolean }
    expect(payload.converged).toBe(true)
  })

  test("V36 绿着但不收敛：done + 未闭合 attempt ⇒ converged=false、in_flight 含该节点、exit 0", () => {
    const d = fixtureTopic()
    doneNode(d, "a1")
    doneNode(d, "a2")
    // a3：已派发（有未闭合 attempt）+ 产物已落盘（派生 done）但父还没回填缓存
    expect(cli(["claim", d, "a3"]).status).toBe(0)
    completeNode(d, "a3")
    const payload = JSON.parse(cli(["check", d, "--json"]).stdout) as {
      converged: boolean
      summary: { in_flight: Array<{ node: string }> }
    }
    expect(payload.converged).toBe(false)
    expect(payload.summary.in_flight.map((x) => x.node)).toEqual(["a3"])
    expect(cli(["check", d]).status).toBe(0) // 在飞不是违规 ⇒ exit 0
  })
})
