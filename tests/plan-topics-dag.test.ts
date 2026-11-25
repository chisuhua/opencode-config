/**
 * plan 侧协作 —— L1 语义 e2e（真文件 / 真 git fixture，无模型、无真实 opencode 运行时）
 *
 * 覆盖：多级 DAG 拓扑 / 依赖门控 / 动态改图 / 调度与并发 / 收敛 / CLI 契约。
 * ⚠ 带「钉住」字样的用例断言的是**当前已登记缺陷**的行为（见 .rddf/reviews 的缺陷清单）：
 *   修好对应缺陷时这些用例**应当变红**，届时按新语义改写，而不是删掉。
 */
import { afterAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  checkTopic,
  countCheckboxes,
  deriveProgress,
  deriveStatus,
  dispatchableNodes,
  isBlocking,
  loadGraph,
  type CheckPhase,
} from "../lib/plan-topics.ts"
import {
  cleanupTmp,
  cli,
  completeNode,
  git,
  gitTopic,
  makeDeliverable,
  node,
  tmpTopic,
  writeBrief,
  writeGraph,
  writeNode,
} from "./helpers/plan-topic-fixture.ts"

const readyOf = (d: string): string[] => dispatchableNodes(loadGraph(d), d)
const all = (d: string, phase: CheckPhase = "dispatch") => checkTopic(d, { phase })
const blocking = (d: string, phase: CheckPhase = "dispatch") => all(d, phase).filter(isBlocking)
const codes = (d: string, phase: CheckPhase = "dispatch") => all(d, phase).map((v) => v.code)
const deliv = (id: string) => [`nodes/${id}/RESULT.md`]
const chain = (ids: string[]) => ids.map((id, i) => node({ id, deps: i ? [ids[i - 1]] : [], deliverables: deliv(id) }))

afterAll(cleanupTmp)

// ── A 图拓扑与多级依赖 ──────────────────────────────────────────────────────

describe("A 图拓扑与多级依赖", () => {
  test("A1 5 级线性链：只有第一层可派发，逐层解锁", () => {
    const d = tmpTopic()
    const ids = ["a1", "a2", "a3", "a4", "a5"]
    for (const id of ids) writeBrief(d, id)
    writeGraph(d, chain(ids))
    expect(readyOf(d)).toEqual(["a1"])
    completeNode(d, "a1")
    expect(readyOf(d)).toEqual(["a2"])
    completeNode(d, "a2")
    expect(readyOf(d)).toEqual(["a3"])
  })

  test("A2 反拓扑序声明：派生结果与声明顺序无关", () => {
    const d = tmpTopic()
    const ids = ["a1", "a2", "a3", "a4", "a5"]
    for (const id of ids) writeBrief(d, id)
    writeGraph(d, chain(ids).reverse())
    expect(readyOf(d)).toEqual(["a1"])
    completeNode(d, "a1")
    expect(readyOf(d)).toEqual(["a2"])
  })

  test("A3 1→8 fan-out：根完成后 8 个同时可派", () => {
    const d = tmpTopic()
    const kids = Array.from({ length: 8 }, (_, i) => `c${i + 1}`)
    writeBrief(d, "root")
    for (const id of kids) writeBrief(d, id)
    writeGraph(d, [
      node({ id: "root", deliverables: deliv("root") }),
      ...kids.map((id) => node({ id, deps: ["root"], deliverables: deliv(id) })),
    ])
    expect(readyOf(d)).toEqual(["root"])
    completeNode(d, "root")
    expect(readyOf(d).length).toBe(8)
    expect(new Set(readyOf(d))).toEqual(new Set(kids))
  })

  test("A4 8→1 fan-in：任一依赖未完成则 join 节点不可派", () => {
    const d = tmpTopic()
    const leaves = Array.from({ length: 8 }, (_, i) => `l${i + 1}`)
    for (const id of [...leaves, "join"]) writeBrief(d, id)
    writeGraph(d, [
      ...leaves.map((id) => node({ id, deliverables: deliv(id) })),
      node({ id: "join", deps: leaves, deliverables: deliv("join") }),
    ])
    for (const id of leaves.slice(0, 7)) completeNode(d, id)
    expect(readyOf(d)).toEqual(["l8"])
    completeNode(d, "l8")
    expect(readyOf(d)).toEqual(["join"])
  })

  test("A5 菱形：中段并行，汇聚点等两侧", () => {
    const d = tmpTopic()
    for (const id of ["a", "b", "c", "dd"]) writeBrief(d, id)
    writeGraph(d, [
      node({ id: "a", deliverables: deliv("a") }),
      node({ id: "b", deps: ["a"], deliverables: deliv("b") }),
      node({ id: "c", deps: ["a"], deliverables: deliv("c") }),
      node({ id: "dd", deps: ["b", "c"], deliverables: deliv("dd") }),
    ])
    completeNode(d, "a")
    expect(new Set(readyOf(d))).toEqual(new Set(["b", "c"]))
    completeNode(d, "b")
    expect(readyOf(d)).toEqual(["c"])
    completeNode(d, "c")
    expect(readyOf(d)).toEqual(["dd"])
  })

  test("A6 4 层多级 DAG（含跨层依赖）：每层可派集合精确", () => {
    const d = tmpTopic()
    for (const id of ["a1", "a2", "a3", "a4", "a5"]) writeBrief(d, id)
    writeGraph(d, [
      node({ id: "a1", deliverables: deliv("a1") }),
      node({ id: "a2", deps: ["a1"], deliverables: deliv("a2") }),
      node({ id: "a3", deps: ["a1"], deliverables: deliv("a3") }),
      node({ id: "a4", deps: ["a2", "a3"], deliverables: deliv("a4") }),
      node({ id: "a5", deps: ["a2"], deliverables: deliv("a5") }),
    ])
    completeNode(d, "a1")
    expect(new Set(readyOf(d))).toEqual(new Set(["a2", "a3"]))
    completeNode(d, "a2")
    expect(new Set(readyOf(d))).toEqual(new Set(["a3", "a5"]))
    completeNode(d, "a3")
    expect(new Set(readyOf(d))).toEqual(new Set(["a4", "a5"]))
    completeNode(d, "a4")
    expect(readyOf(d)).toEqual(["a5"])
  })

  test("A7 森林：两棵互不相连的树各自推进", () => {
    const d = tmpTopic()
    for (const id of ["r1", "r2", "r1c"]) writeBrief(d, id)
    writeGraph(d, [
      node({ id: "r1", deliverables: deliv("r1") }),
      node({ id: "r1c", deps: ["r1"], deliverables: deliv("r1c") }),
      node({ id: "r2", deliverables: deliv("r2") }),
    ])
    expect(new Set(readyOf(d))).toEqual(new Set(["r1", "r2"]))
    completeNode(d, "r1")
    expect(new Set(readyOf(d))).toEqual(new Set(["r1c", "r2"]))
  })

  test("A8 120 节点长链：收敛到全 done，且 final 口径无阻断", () => {
    const d = tmpTopic()
    const n = 120
    const ids = Array.from({ length: n }, (_, i) => `n${i + 1}`)
    for (const id of ids) writeBrief(d, id)
    writeGraph(d, chain(ids))
    for (const id of ids) completeNode(d, id)
    const derived = deriveStatus(loadGraph(d), d)
    expect([...derived.values()].every((s) => s === "done")).toBe(true)
    expect(readyOf(d)).toEqual([])
    expect(blocking(d, "final")).toEqual([])
  })

  test("A9 dispatch 口径仍报环", () => {
    const d = tmpTopic()
    writeBrief(d, "a")
    writeBrief(d, "b")
    writeGraph(d, [node({ id: "a", deps: ["b"] }), node({ id: "b", deps: ["a"] })])
    const r = cli(["check", d, "--phase", "dispatch"])
    expect(r.status).toBe(1)
    expect(r.stdout).toContain("cycle")
  })

  test("A10 dispatch 口径仍报悬空依赖", () => {
    const d = tmpTopic()
    writeBrief(d, "a")
    writeGraph(d, [node({ id: "a", deps: ["ghost"] })])
    const r = cli(["check", d, "--phase", "dispatch"])
    expect(r.status).toBe(1)
    expect(r.stdout).toContain("dangling_dep")
  })
})

// ── B 完成与门控语义 ────────────────────────────────────────────────────────

describe("B 完成与门控语义", () => {
  test("B1 TODO 全勾但 RESULT 缺失 ⇒ partial", () => {
    const d = tmpTopic()
    writeNode(d, "a1", { todo: "- [x] a\n" })
    expect(deriveProgress(d, node({ id: "a1" }))).toBe("partial")
  })

  test("B2 交付物未生成不阻断派发（final 才报）", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeGraph(d, [node({ id: "a1", deliverables: deliv("a1") })])
    expect(codes(d, "dispatch")).not.toContain("missing_deliverable")
    expect(blocking(d, "dispatch")).toEqual([])
    expect(codes(d, "final")).toContain("missing_deliverable")
  })

  test("B3 交付物是目录 ⇒ 不算交付", () => {
    const d = tmpTopic()
    mkdirSync(path.join(d, "nodes", "a1", "OUT"), { recursive: true })
    writeNode(d, "a1", { todo: "- [x] a\n", result: "正文\n" })
    writeGraph(d, [node({ id: "a1", deliverables: ["nodes/a1/OUT"] })])
    expect(deriveStatus(loadGraph(d), d).get("a1")).toBe("pending")
    expect(codes(d, "final")).toContain("missing_deliverable")
  })

  test("B4 交付物是空文件 ⇒ 不算交付", () => {
    const d = tmpTopic()
    makeDeliverable(d, "nodes/a1/OUT.md", "")
    writeNode(d, "a1", { todo: "- [x] a\n", result: "正文\n" })
    writeGraph(d, [node({ id: "a1", deliverables: ["nodes/a1/OUT.md"] })])
    expect(deriveStatus(loadGraph(d), d).get("a1")).toBe("pending")
  })

  test("B5 TODO 记法脆性（钉住缺陷：深缩进 / 星号 / 无尾随空格都计 0）", () => {
    expect(countCheckboxes("   - [x] 深缩进\n")).toEqual([0, 0])
    expect(countCheckboxes("* [x] 星号\n")).toEqual([0, 0])
    expect(countCheckboxes("- [x]\n")).toEqual([0, 0])
    expect(countCheckboxes("- [x] ok\n")).toEqual([1, 1])

    const d = tmpTopic()
    writeNode(d, "a1", { todo: "   - [x] 深缩进\n", result: "正文\n" })
    // 磁盘上「看起来做完了」，派生却是 todo ⇒ 节点永不 done
    expect(deriveProgress(d, node({ id: "a1" }))).toBe("todo")
  })

  test("B6 半写 RESULT（无哨兵）也判 complete（钉住缺陷：哨兵未校验）", () => {
    const d = tmpTopic()
    writeNode(d, "a1", { todo: "- [x] a\n", result: "正文但没有哨兵\n" })
    expect(deriveProgress(d, node({ id: "a1" }))).toBe("complete")
  })

  test("B7 owner=parent 的节点也出现在 ready（钉住缺陷）", () => {
    const d = tmpTopic()
    writeBrief(d, "p1")
    writeGraph(d, [node({ id: "p1", owner: "parent" })])
    expect(readyOf(d)).toContain("p1")
  })
})

// ── C 动态改图 ──────────────────────────────────────────────────────────────

describe("C 动态改图", () => {
  test("C1 新增叶子（依赖已 done）⇒ 立即可派", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeGraph(d, [node({ id: "a1", deliverables: deliv("a1") })])
    completeNode(d, "a1")
    writeBrief(d, "a2")
    writeGraph(d, [
      node({ id: "a1", deliverables: deliv("a1") }),
      node({ id: "a2", deps: ["a1"], deliverables: deliv("a2") }),
    ])
    expect(readyOf(d)).toEqual(["a2"])
  })

  test("C2 给已 done 节点追加新依赖 ⇒ 回落 blocked_by_deps，下游失效", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeBrief(d, "a2")
    writeGraph(d, [node({ id: "a1", deliverables: deliv("a1") }), node({ id: "a2" })])
    completeNode(d, "a1")
    expect(deriveStatus(loadGraph(d), d).get("a1")).toBe("done")

    writeGraph(d, [
      node({ id: "a1", deps: ["a2"], deliverables: deliv("a1") }),
      node({ id: "a2" }),
    ])
    expect(deriveStatus(loadGraph(d), d).get("a1")).toBe("blocked_by_deps")
    expect(readyOf(d)).toEqual(["a2"])
  })

  test("C3 从图里删节点但留目录 ⇒ orphan_node_dir（两个口径都报）", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeBrief(d, "ghost")
    writeGraph(d, [node({ id: "a1" })])
    for (const phase of ["dispatch", "final"] as CheckPhase[]) {
      expect(codes(d, phase)).toContain("orphan_node_dir")
    }
  })

  test("C4 删节点且同步改下游 deps + 删目录 ⇒ 无阻断", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeBrief(d, "a2")
    writeGraph(d, [node({ id: "a1" }), node({ id: "a2", deps: ["a1"] })])
    rmSync(path.join(d, "nodes", "a1"), { recursive: true, force: true })
    writeGraph(d, [node({ id: "a2" })])
    expect(blocking(d, "dispatch")).toEqual([])
  })

  test("C5 改写 deps（串行改并行）⇒ 可派集合随之变化", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeBrief(d, "a2")
    writeGraph(d, [node({ id: "a1" }), node({ id: "a2", deps: ["a1"] })])
    expect(readyOf(d)).toEqual(["a1"])
    writeGraph(d, [node({ id: "a1" }), node({ id: "a2" })])
    expect(readyOf(d)).toEqual(["a1", "a2"])
  })

  test("C6 派发后改 BRIEF：声明哈希才可判，未声明则静默", () => {
    const d = tmpTopic()
    const brief = "# 原始\n"
    writeBrief(d, "a1", brief)
    const hash = createHash("sha256").update(brief).digest("hex")
    writeGraph(d, [node({ id: "a1", brief_sha256: hash })])
    expect(codes(d, "final")).not.toContain("brief_tampered")
    writeBrief(d, "a1", "# 改过\n")
    expect(codes(d, "final")).toContain("brief_tampered")

    const d2 = tmpTopic()
    writeBrief(d2, "a1", "# 原始\n")
    writeGraph(d2, [node({ id: "a1" })])
    writeBrief(d2, "a1", "# 改过\n")
    expect(codes(d2, "final")).not.toContain("brief_tampered")
  })

  test("C7 取消现在是一等状态：派生 cancelled、下游 blocked、cancelled 节点豁免交付物要求", () => {
    // 取消声明 ⇒ 派生 cancelled（不再需要「伪造 done / 永久 blocked / 删节点」三种替代）
    const a = tmpTopic()
    writeBrief(a, "a1")
    writeBrief(a, "a2")
    writeGraph(a, [
      node({ id: "a1", status: "cancelled", cancelled: { by: "parent", reason: "不需要了" } }),
      node({ id: "a2", deps: ["a1"] }),
    ])
    const st = deriveStatus(loadGraph(a), a)
    expect(st.get("a1")).toBe("cancelled")
    expect(st.get("a2")).toBe("blocked_by_deps")
    // 活跃下游依赖已取消节点 ⇒ 不变量报警（父须级联取消或摘边）
    expect(codes(a, "final")).toContain("cancelled_dep_active")
    // cancelled 节点自身不再被要求 BRIEF / 交付物
    const mine = checkTopic(a, { phase: "final" }).filter((v) => v.node === "a1")
    expect(mine.map((v) => v.code)).not.toContain("missing_brief")
    expect(mine.map((v) => v.code)).not.toContain("missing_deliverable")
  })
})

// ── D 调度与并发 ────────────────────────────────────────────────────────────

describe("D 调度与并发", () => {
  test("D1 ready 仍幂等，但重复派发被 claim 拒绝（机械闸门已补）", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeGraph(d, [node({ id: "a1" })])
    const first = readyOf(d)
    expect(first).toEqual(["a1"])
    expect(readyOf(d)).toEqual(first)
    // 同一节点第二次 claim ⇒ 拒绝且文件不动（双派发的机械闸门）
    const { repo, topic } = gitTopic([node({ id: "a1" })])
    expect(cli(["claim", topic, "a1"]).status).toBe(0)
    const snapshot = readFileSync(path.join(topic, "graph.json"), "utf8")
    expect(cli(["claim", topic, "a1"]).status).not.toBe(0)
    expect(readFileSync(path.join(topic, "graph.json"), "utf8")).toBe(snapshot)
  })

  test("D2 未闭合 attempt ⇒ 该节点不再可派（在飞已可判）", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeGraph(d, [
      node({
        id: "a1",
        attempts: [{ agent: "plan-worker", started_at: "2026-01-01T00:00:00Z" }],
      }),
    ])
    expect(readyOf(d)).not.toContain("a1")
    expect(blocking(d, "dispatch")).toEqual([])
  })

  test("D3 锁被他人持有仍可派（钉住缺陷：无锁判据）；lock 只报告", () => {
    const { repo, topic } = gitTopic([node({ id: "a1" })])
    const lockDir = path.join(repo, ".rddf", "state", "plan-topics", "demo.lock")
    mkdirSync(lockDir, { recursive: true })
    writeFileSync(path.join(lockDir, "owner"), "ses_other\n")
    expect(readyOf(topic)).toContain("a1")
    const payload = JSON.parse(cli(["lock", topic, "--json"]).stdout) as { present: boolean; owner: string }
    expect(payload.present).toBe(true)
    expect(payload.owner).toBe("ses_other")
  })

  test("D4 全节点 done 但锁未释放 ⇒ 无判据（钉住缺陷）", () => {
    const { repo, topic } = gitTopic([
      node({ id: "a1", status: "done", progress: "complete", deliverables: deliv("a1") }),
    ])
    completeNode(topic, "a1")
    expect(blocking(topic, "final")).toEqual([])
    mkdirSync(path.join(repo, ".rddf", "state", "plan-topics", "demo.lock"), { recursive: true })
    expect(blocking(topic, "final")).toEqual([])
  })

  test("D5 scope-check 在并行下把别人的产物算成越界（钉住缺陷）", () => {
    const { topic } = gitTopic([node({ id: "a1" }), node({ id: "b1" })])
    writeFileSync(path.join(topic, "nodes", "a1", "RESULT.md"), "A\n")
    writeFileSync(path.join(topic, "nodes", "b1", "RESULT.md"), "B\n")
    const r = cli(["scope-check", topic, "a1", "--baseline", "HEAD", "--json"])
    expect(r.status).toBe(1)
    const payload = JSON.parse(r.stdout) as { ok: boolean; violations: Array<{ code: string; detail: string }> }
    expect(payload.ok).toBe(false)
    expect(payload.violations.some((v) => v.detail.includes("nodes/b1/"))).toBe(true)
  })

  test("D6 baseline 用相对 ref 时漂移 ⇒ 漏检（钉住缺陷）", () => {
    const { repo, topic } = gitTopic([node({ id: "a1" })])
    mkdirSync(path.join(repo, "lib"), { recursive: true })
    writeFileSync(path.join(repo, "lib", "x.ts"), "bad\n")
    git(repo, ["add", "-A"])
    git(repo, ["commit", "-qm", "leak"])
    const payload = JSON.parse(cli(["scope-check", topic, "a1", "--baseline", "HEAD", "--json"]).stdout) as {
      ok: boolean
    }
    expect(payload.ok).toBe(true)
  })
})

// ── E 收敛 ──────────────────────────────────────────────────────────────────

describe("E 收敛", () => {
  test("E1 全 done 时 converged=true（收敛信号已补）", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    completeNode(d, "a1")
    writeGraph(d, [
      node({ id: "a1", status: "done", progress: "complete", deliverables: deliv("a1") }),
    ])
    const r = cli(["check", d, "--json"])
    const payload = JSON.parse(r.stdout) as Record<string, unknown>
    expect(r.status).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.converged).toBe(true)
    expect(payload.summary).toBeDefined()
  })

  test("E2 progress 完成但交付物缺失 ⇒ dispatch 口径也阻断", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeNode(d, "a1", { brief: null, todo: "- [x] a\n", result: "正文\n" })
    writeGraph(d, [node({ id: "a1", deliverables: ["nodes/a1/EXTRA.md"] })])
    expect(blocking(d, "dispatch").map((v) => v.code)).toContain("missing_deliverable")
  })

  test("E3 漏 join：磁盘完成而缓存未回填 ⇒ 只报 info，不判红", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    completeNode(d, "a1")
    writeGraph(d, [node({ id: "a1", deliverables: deliv("a1") })])
    expect(blocking(d, "dispatch")).toEqual([])
    expect(codes(d, "dispatch")).toContain("cache_behind")
  })

  test("E4 半完成节点仍可派（重建路径可用）", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeNode(d, "a1", { brief: null, todo: "- [x] a\n- [ ] b\n", result: "正文\n" })
    writeGraph(d, [node({ id: "a1" })])
    expect(readyOf(d)).toContain("a1")
  })
})

// ── F CLI 契约与规模 ────────────────────────────────────────────────────────

describe("F CLI 契约与规模", () => {
  test("F1 非法 --phase ⇒ 用法错（exit 2，stdout 为空）", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeGraph(d, [node({ id: "a1" })])
    const r = cli(["check", d, "--phase", "bogus"])
    expect(r.status).toBe(2)
    expect(r.stdout.trim()).toBe("")
  })

  test("F2 --json 带 severity：缓存滞后标 info", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    completeNode(d, "a1")
    writeGraph(d, [node({ id: "a1", deliverables: deliv("a1") })])
    const payload = JSON.parse(cli(["check", d, "--json"]).stdout) as {
      violations: Array<{ code: string; severity: string }>
    }
    expect(payload.violations.length).toBeGreaterThan(0)
    expect(payload.violations.every((v) => v.severity === "info")).toBe(true)
  })

  test("F3 800 级深链不爆栈", () => {
    const d = tmpTopic()
    const n = 800
    const ids = Array.from({ length: n }, (_, i) => `n${i + 1}`)
    for (const id of ids) writeBrief(d, id)
    writeGraph(d, chain(ids))
    const r = cli(["check", d, "--phase", "dispatch"])
    expect(r.status).toBe(0)
  })

  test("F4 绝对路径 + 尾斜杠", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeGraph(d, [node({ id: "a1" })])
    expect(cli(["check", `${d}/`, "--phase", "dispatch"]).status).toBe(0)
  })

  test("F5 check / ready 只读", () => {
    const d = tmpTopic()
    writeBrief(d, "a1")
    writeGraph(d, [node({ id: "a1" })])
    const before = readFileSync(path.join(d, "graph.json"), "utf8")
    cli(["check", d, "--phase", "dispatch"])
    cli(["ready", d, "--json"])
    expect(readFileSync(path.join(d, "graph.json"), "utf8")).toBe(before)
  })
})
