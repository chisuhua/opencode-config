/**
 * plan 侧多会话协作 —— 判据库 + CLI 单测（AC10 / AC11 / AC12 / AC13）
 *
 * 运行：bun test tests/
 */
import { describe, expect, test } from "bun:test"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  PlanTopicError,
  assertAcyclic,
  assertDepsExist,
  assertUniqueNodeIds,
  assertValidNodeId,
  checkTopic,
  countCheckboxes,
  deriveProgress,
  deriveStatus,
  isNonEmptyResult,
  loadGraph,
  missingDeliverables,
  parseGraph,
  type Graph,
  type Node,
} from "../lib/plan-topics.ts"

const ROOT = path.resolve(import.meta.dir, "..")
const CLI = path.join(ROOT, "scripts", "plan-topic-check.ts")

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTopic(): string {
  const d = mkdtempSync(path.join(tmpdir(), "plan-topic-"))
  mkdirSync(path.join(d, "nodes"), { recursive: true })
  return d
}

function node(over: Partial<Node> = {}): Node {
  return {
    id: "a1",
    title: "任务",
    deps: [],
    owner: "child",
    status: "pending",
    progress: "todo",
    attempts: [],
    deliverables: [],
    ...over,
  }
}

function writeGraph(d: string, nodes: Node[], extra: Record<string, unknown> = {}): void {
  writeFileSync(
    path.join(d, "graph.json"),
    JSON.stringify({ version: 1, topic: path.basename(d), nodes, ...extra }),
  )
}

function writeNode(
  d: string,
  id: string,
  files: { brief?: string | null; todo?: string; result?: string } = {},
): void {
  const nd = path.join(d, "nodes", id)
  mkdirSync(nd, { recursive: true })
  if (files.brief !== null) writeFileSync(path.join(nd, "BRIEF.md"), files.brief ?? "# brief\n")
  if (files.todo !== undefined) writeFileSync(path.join(nd, "TODO.md"), files.todo)
  if (files.result !== undefined) writeFileSync(path.join(nd, "RESULT.md"), files.result)
}

function makeDeliverable(d: string, rel: string, content = "x"): void {
  const abs = path.join(d, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

function cli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", [CLI, ...args], { encoding: "utf8" })
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" }
}

function codes(d: string): string[] {
  return checkTopic(d).map((v) => v.code)
}

const tmpDirs: string[] = []
function tmpTopic(): string {
  const d = makeTopic()
  tmpDirs.push(d)
  return d
}

// ── A0 schema ───────────────────────────────────────────────────────────────

describe("graph.json schema（不可解析 ⇒ exit 3）", () => {
  test("JSON 截断", () => {
    const d = tmpTopic()
    writeFileSync(path.join(d, "graph.json"), '{"version":1,"nodes":[')
    expect(() => loadGraph(d)).toThrow(PlanTopicError)
    expect(cli(["check", d]).status).toBe(3)
  })

  test("缺 version / nodes 非数组 / status、progress 非枚举 / deliverables、deps、attempts 非数组", () => {
    const cases: Array<Record<string, unknown>> = [
      { topic: "t", nodes: [] },
      { version: 1, topic: "t", nodes: {} },
      { version: 1, topic: "t", nodes: [node({ status: "weird" as any })] },
      { version: 1, topic: "t", nodes: [node({ progress: "weird" as any })] },
      { version: 1, topic: "t", nodes: [node({ deliverables: "x" as any })] },
      { version: 1, topic: "t", nodes: [node({ deps: "x" as any })] },
      { version: 1, topic: "t", nodes: [node({ attempts: "x" as any })] },
    ]
    for (const g of cases) {
      expect(() => parseGraph(JSON.stringify(g))).toThrow(PlanTopicError)
    }
  })

  test("schema 违规时 CLI 退出 3 且 stdout 不含违规列表", () => {
    const d = tmpTopic()
    writeGraph(d, [node({ status: "weird" as any })])
    const r = cli(["check", d])
    expect(r.status).toBe(3)
    expect(r.stdout.trim()).toBe("")
  })

  test("graph.json 缺失 ⇒ exit 3", () => {
    const d = tmpTopic()
    expect(cli(["check", d]).status).toBe(3)
  })
})

// ── A1/A2 node id ───────────────────────────────────────────────────────────

describe("node id 合法性", () => {
  test("合法 id", () => {
    for (const id of ["a1", "node-1", "x.y", "a_b", "a".repeat(64)]) {
      writeNode(tmpTopic(), id) // 仅为占位，真正断言在 assertValidNodeId
      expect(() => assertValidNodeId(id)).not.toThrow()
    }
  })

  test("非法 id（含越长越界）", () => {
    for (const id of ["..", "/abs", "a/b", "", ".", "A1", "a".repeat(65), "a b"]) {
      expect(() => assertValidNodeId(id)).toThrow(PlanTopicError)
    }
  })

  test("黑名单（会被 .gitignore 误伤）", () => {
    for (const id of ["foo.lock", "x.env", "a.bak", "backup1"]) {
      expect(() => assertValidNodeId(id)).toThrow(PlanTopicError)
    }
  })

  test("checkTopic 报 invalid_node_id", () => {
    const d = tmpTopic()
    writeGraph(d, [node({ id: "bad id" })])
    writeNode(d, "bad id")
    expect(codes(d)).toContain("invalid_node_id")
    expect(cli(["check", d]).status).toBe(1)
  })
})

// ── A3–A6 图结构 ────────────────────────────────────────────────────────────

describe("图结构", () => {
  test("重复 node id", () => {
    const g: Graph = { version: 1, topic: "t", nodes: [node({ id: "a1" }), node({ id: "a1" })] }
    expect(() => assertUniqueNodeIds(g)).toThrow(PlanTopicError)
    const d = tmpTopic()
    writeGraph(d, g.nodes)
    writeNode(d, "a1")
    expect(codes(d)).toContain("duplicate_node_id")
  })

  test("自环 / 二元环 / 三元环", () => {
    const cyclic: Node[][] = [
      [node({ id: "a", deps: ["a"] })],
      [node({ id: "a", deps: ["b"] }), node({ id: "b", deps: ["a"] })],
      [node({ id: "a", deps: ["b"] }), node({ id: "b", deps: ["c"] }), node({ id: "c", deps: ["a"] })],
    ]
    for (const nodes of cyclic) {
      expect(() => assertAcyclic({ version: 1, topic: "t", nodes })).toThrow(PlanTopicError)
    }
  })

  test("悬空依赖 / deps 内重复", () => {
    const g: Graph = { version: 1, topic: "t", nodes: [node({ id: "a", deps: ["ghost"] })] }
    expect(() => assertDepsExist(g)).toThrow(PlanTopicError)
    const g2: Graph = { version: 1, topic: "t", nodes: [node({ id: "a", deps: ["b", "b"] }), node({ id: "b" })] }
    expect(() => assertDepsExist(g2)).toThrow(PlanTopicError)
  })

  test("checkTopic 报 cycle / dangling_dep", () => {
    const d = tmpTopic()
    writeGraph(d, [node({ id: "a", deps: ["b"] }), node({ id: "b", deps: ["a"] })])
    writeNode(d, "a")
    writeNode(d, "b")
    expect(codes(d)).toContain("cycle")
    const d2 = tmpTopic()
    writeGraph(d2, [node({ id: "a", deps: ["ghost"] })])
    writeNode(d2, "a")
    expect(codes(d2)).toContain("dangling_dep")
  })
})

// ── A7/A8 progress 派生 ─────────────────────────────────────────────────────

describe("progress 派生（纯磁盘）", () => {
  test("countCheckboxes：0 / 全勾 / 部分勾 / fenced code / 缩进 / 大写 X", () => {
    expect(countCheckboxes("")).toEqual([0, 0])
    expect(countCheckboxes("纯文字\n")).toEqual([0, 0])
    expect(countCheckboxes("- [x] a\n- [X] b\n")).toEqual([2, 2])
    expect(countCheckboxes("- [x] a\n- [ ] b\n")).toEqual([2, 1])
    expect(countCheckboxes("```\n- [x] fake\n```\n- [ ] real\n")).toEqual([1, 0])
    expect(countCheckboxes("  - [x] indented\n")).toEqual([1, 1])
  })

  test("isNonEmptyResult：空 / 空白 / HTML 注释 / 仅标题 / 哨兵 / 正常", () => {
    expect(isNonEmptyResult("")).toBe(false)
    expect(isNonEmptyResult("   \n\t\n")).toBe(false)
    expect(isNonEmptyResult("<!-- 模板占位 -->\n")).toBe(false)
    expect(isNonEmptyResult("# 结果\n")).toBe(false)
    expect(isNonEmptyResult("## STATUS: COMPLETE\n")).toBe(false)
    expect(isNonEmptyResult("# 结果\n\n正文一段。\n")).toBe(true)
    expect(isNonEmptyResult("```\ncode\n```\n")).toBe(false)
  })

  test("progress：todo / partial / complete", () => {
    const d = tmpTopic()
    const n = node({ id: "a1" })
    writeNode(d, "a1", { todo: "纯文字（无 checkbox）\n" })
    expect(deriveProgress(d, n)).toBe("todo")
    writeNode(d, "a1", { todo: "- [x] a\n- [ ] b\n", result: "正文\n" })
    expect(deriveProgress(d, n)).toBe("partial")
    writeNode(d, "a1", { todo: "- [x] a\n", result: "# 标题\n" }) // RESULT 仅标题 ⇒ partial
    expect(deriveProgress(d, n)).toBe("partial")
    writeNode(d, "a1", { todo: "- [x] a\n", result: "正文一段\n" })
    expect(deriveProgress(d, n)).toBe("complete")
  })
})

// ── A9/A10 status 门控 ─────────────────────────────────────────────────────

describe("status 门控（与 progress 正交）", () => {
  test("complete ∧ deps 全 done ∧ deliverables 存在 ⇒ done", () => {
    const d = tmpTopic()
    const n = node({ id: "a1", deliverables: ["nodes/a1/RESULT.md"] })
    writeNode(d, "a1", { todo: "- [x] a\n", result: "正文\n" })
    const s = deriveStatus({ version: 1, topic: "t", nodes: [n] }, d)
    expect(s.get("a1")).toBe("done")
  })

  test("子先干完而依赖未完成 ⇒ progress=complete / status=blocked_by_deps（合法，不误报）", () => {
    const d = tmpTopic()
    const dep = node({ id: "a0" })
    const child = node({ id: "a1", deps: ["a0"], deliverables: ["nodes/a1/RESULT.md"] })
    writeNode(d, "a0", { todo: "- [ ] pending\n" })
    writeNode(d, "a1", { todo: "- [x] a\n", result: "正文\n" })
    const g: Graph = { version: 1, topic: "t", nodes: [dep, child] }
    const s = deriveStatus(g, d)
    expect(deriveProgress(d, child)).toBe("complete")
    expect(s.get("a1")).toBe("blocked_by_deps")
    // 缓存写成与派生一致 ⇒ 无 cache_mismatch
    const cached: Graph = {
      version: 1,
      topic: "t",
      nodes: [
        node({ id: "a0", status: "pending", progress: "partial" }),
        node({ id: "a1", deps: ["a0"], status: "blocked_by_deps", progress: "complete", deliverables: ["nodes/a1/RESULT.md"] }),
      ],
    }
    writeGraph(d, cached.nodes)
    expect(codes(d)).not.toContain("cache_mismatch")
  })

  test("deliverables 为空 / 路径不存在 ⇒ 不是 done", () => {
    const d = tmpTopic()
    const n = node({ id: "a1", deliverables: [] })
    writeNode(d, "a1", { todo: "- [x] a\n", result: "正文\n" })
    expect(deriveStatus({ version: 1, topic: "t", nodes: [n] }, d).get("a1")).toBe("pending")

    const n2 = node({ id: "a1", deliverables: ["nodes/a1/nope.md"] })
    writeNode(d, "a1", { todo: "- [x] a\n", result: "正文\n" })
    const g2: Graph = { version: 1, topic: "t", nodes: [n2] }
    expect(deriveStatus(g2, d).get("a1")).toBe("pending")
    expect(missingDeliverables(g2, d).map((v) => v.code)).toContain("missing_deliverable")
  })
})

// ── A11/A12 缓存一致性 ─────────────────────────────────────────────────────

describe("缓存一致性", () => {
  test("status 缓存 done 但派生非 done ⇒ cache_mismatch", () => {
    const d = tmpTopic()
    writeNode(d, "a1", { todo: "- [ ] a\n" })
    writeGraph(d, [node({ id: "a1", status: "done" })])
    expect(codes(d)).toContain("cache_mismatch")
  })

  test("progress 缓存不符 ⇒ cache_mismatch", () => {
    const d = tmpTopic()
    writeNode(d, "a1", { todo: "- [x] a\n", result: "正文\n" })
    writeGraph(d, [node({ id: "a1", progress: "partial" })])
    expect(codes(d)).toContain("cache_mismatch")
  })
})

// ── A13/A14 brief 完整性 ───────────────────────────────────────────────────

describe("brief 完整性", () => {
  test("brief_sha256 不符 ⇒ brief_tampered", () => {
    const d = tmpTopic()
    writeNode(d, "a1", { brief: "# 原始 brief\n" })
    writeGraph(d, [node({ id: "a1", brief_sha256: "deadbeef" })])
    expect(codes(d)).toContain("brief_tampered")
  })

  test("声明了 brief_sha256 但 BRIEF.md 缺失 ⇒ brief_tampered", () => {
    const d = tmpTopic()
    mkdirSync(path.join(d, "nodes", "a1"), { recursive: true })
    writeGraph(d, [node({ id: "a1", brief_sha256: "deadbeef" })])
    const c = codes(d)
    expect(c).toContain("brief_tampered")
    expect(c).toContain("missing_brief")
  })
})

// ── A15/A16 孤儿 ───────────────────────────────────────────────────────────

describe("孤儿节点", () => {
  test("nodes/<id>/ 存在但图无该节点 ⇒ orphan_node_dir", () => {
    const d = tmpTopic()
    writeGraph(d, [node({ id: "a1" })])
    writeNode(d, "a1")
    writeNode(d, "ghost")
    expect(codes(d)).toContain("orphan_node_dir")
  })

  test("图有节点但 BRIEF.md 缺失 ⇒ missing_brief（不可派发）", () => {
    const d = tmpTopic()
    writeGraph(d, [node({ id: "a1" })])
    mkdirSync(path.join(d, "nodes", "a1"), { recursive: true })
    expect(codes(d)).toContain("missing_brief")
  })
})

// ── A17 空 topic ───────────────────────────────────────────────────────────

describe("空 topic", () => {
  test("nodes 为空 ⇒ empty_topic；--allow-empty 放行", () => {
    const d = tmpTopic()
    writeGraph(d, [])
    expect(codes(d)).toContain("empty_topic")
    expect(checkTopic(d, { allowEmpty: true }).map((v) => v.code)).not.toContain("empty_topic")
    expect(cli(["check", d, "--allow-empty"]).status).toBe(0)
  })
})

// ── B CLI 契约 ──────────────────────────────────────────────────────────────

describe("CLI 退出码与 --json", () => {
  test("全绿 ⇒ 0；违规 ⇒ 1；用法错 ⇒ 2（stdout 为空）", () => {
    const d = tmpTopic()
    writeNode(d, "a1")
    writeGraph(d, [node({ id: "a1" })])
    expect(cli(["check", d]).status).toBe(0)

    const bad = tmpTopic()
    writeNode(bad, "a1")
    writeGraph(bad, [node({ id: "a1", status: "done" })])
    expect(cli(["check", bad]).status).toBe(1)

    const r = cli(["check"])
    expect(r.status).toBe(2)
    expect(r.stdout.trim()).toBe("")
  })

  test("--json 可解析且 code 属闭集", () => {
    const d = tmpTopic()
    writeNode(d, "a1")
    writeGraph(d, [node({ id: "a1", status: "done" })])
    const r = cli(["check", d, "--json"])
    expect(r.status).toBe(1)
    const payload = JSON.parse(r.stdout) as { ok: boolean; violations: Array<{ code: string }> }
    expect(payload.ok).toBe(false)
    expect(Array.isArray(payload.violations)).toBe(true)
    const allowed = new Set([
      "schema_invalid", "invalid_node_id", "duplicate_node_id", "cycle", "dangling_dep",
      "duplicate_dep", "orphan_node_dir", "missing_brief", "cache_mismatch",
      "brief_tampered", "missing_deliverable", "out_of_scope", "empty_topic", "git_error",
    ])
    for (const v of payload.violations) expect(allowed.has(v.code)).toBe(true)
  })
})

// ── B scope-check（fixture 仓）──────────────────────────────────────────────

function makeGitRepo(): string {
  const d = mkdtempSync(path.join(tmpdir(), "plan-scope-"))
  tmpDirs.push(d)
  const run = (args: string[]) => execFileSync("git", args, { cwd: d, encoding: "utf8" })
  run(["init", "-q"])
  run(["config", "user.email", "t@example.com"])
  run(["config", "user.name", "t"])
  const topicDir = path.join(d, ".rddf", "plan-topics", "demo")
  mkdirSync(path.join(topicDir, "nodes", "a1"), { recursive: true })
  writeFileSync(path.join(topicDir, "nodes", "a1", "BRIEF.md"), "# brief\n")
  writeFileSync(path.join(topicDir, "nodes", "a1", "TODO.md"), "- [ ] x\n")
  writeFileSync(
    path.join(topicDir, "graph.json"),
    JSON.stringify({ version: 1, topic: "demo", nodes: [node({ id: "a1" })] }),
  )
  run(["add", "-A"])
  run(["commit", "-qm", "base"])
  return d
}

describe("scope-check（fixture 仓，不碰真实仓）", () => {
  test("检出越界写；node 目录内的写不报", () => {
    const repo = makeGitRepo()
    const topicDir = path.join(repo, ".rddf", "plan-topics", "demo")
    writeFileSync(path.join(topicDir, "nodes", "a1", "NOTES.md"), "ok\n")
    mkdirSync(path.join(repo, "lib"), { recursive: true })
    writeFileSync(path.join(repo, "lib", "x.ts"), "bad\n")

    const r = cli(["scope-check", topicDir, "a1", "--baseline", "HEAD", "--json"])
    const payload = JSON.parse(r.stdout) as { ok: boolean; violations: Array<{ code: string; detail: string }> }
    expect(r.status).toBe(1)
    expect(payload.violations.some((v) => v.code === "out_of_scope" && v.detail.includes("lib/x.ts"))).toBe(true)
    expect(payload.violations.some((v) => v.detail.includes("nodes/a1/NOTES.md"))).toBe(false)
  })

  test("git 失败 ⇒ 非零退出 + git_error（不吞错）", () => {
    const notRepo = mkdtempSync(path.join(tmpdir(), "plan-norepo-"))
    tmpDirs.push(notRepo)
    const r = cli(["scope-check", notRepo, "a1", "--baseline", "HEAD", "--json"])
    expect(r.status).toBe(1)
    const payload = JSON.parse(r.stdout) as { violations: Array<{ code: string }> }
    expect(payload.violations[0].code).toBe("git_error")
  })

  test("只读：跑前后 git status --porcelain 逐字相同", () => {
    const repo = makeGitRepo()
    const topicDir = path.join(repo, ".rddf", "plan-topics", "demo")
    const before = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" })
    cli(["scope-check", topicDir, "a1", "--baseline", "HEAD"])
    const after = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" })
    expect(after).toBe(before)
  })
})

// ── B lock ──────────────────────────────────────────────────────────────────

describe("lock 子命令（只读）", () => {
  test("报告 present / owner / binding，且不改文件", () => {
    const repo = makeGitRepo()
    const topicDir = path.join(repo, ".rddf", "plan-topics", "demo")
    const lockDir = path.join(repo, ".rddf", "state", "plan-topics", "demo.lock")
    const r0 = cli(["lock", topicDir, "--json"])
    expect(JSON.parse(r0.stdout).present).toBe(false)

    mkdirSync(lockDir, { recursive: true })
    writeFileSync(path.join(lockDir, "owner"), "ses_x\n")
    writeFileSync(
      path.join(repo, ".rddf", "state", "plan-sessions.json"),
      JSON.stringify({ ses_x: { topic: "demo", node: "a1" } }),
    )
    const before = readFileSync(path.join(repo, ".rddf", "state", "plan-sessions.json"), "utf8")
    const r = cli(["lock", topicDir, "--json"])
    const payload = JSON.parse(r.stdout)
    expect(payload.present).toBe(true)
    expect(payload.owner).toBe("ses_x")
    expect(payload.binding).toEqual({ topic: "demo", node: "a1" })
    expect(readFileSync(path.join(repo, ".rddf", "state", "plan-sessions.json"), "utf8")).toBe(before)
  })
})

// ── cleanup ─────────────────────────────────────────────────────────────────

import { afterAll } from "bun:test"
afterAll(() => {
  for (const d of tmpDirs) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
})
