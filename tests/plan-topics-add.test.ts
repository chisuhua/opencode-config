/**
 * `add` 子命令（`ADR-plan-collaboration-hardening` D2 / **V4**）
 *
 * 按结论增量加节点：原子写 + 短锁 + fail-fast 五类拒绝
 * （已存在 id / 非法 id / deps 不存在 / **deps 指向 cancelled** / deps 重复）。
 */
import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { Node } from "../lib/plan-topics.ts"
import { cleanupTmp, cli, gitTopic, node, writeBrief } from "./helpers/plan-topic-fixture.ts"

afterAll(cleanupTmp)

const deliv = (id: string) => [`nodes/${id}/RESULT.md`]

function topic(nodes: Node[] = [node({ id: "n1", deps: [], deliverables: deliv("n1") })]): string {
  return gitTopic(nodes).topic
}

function graph(d: string): { nodes: Node[] } {
  return JSON.parse(readFileSync(path.join(d, "graph.json"), "utf8")) as { nodes: Node[] }
}

describe("add：正向", () => {
  test("合法 add ⇒ exit 0，节点入图（pending/todo/child + 默认交付物）", () => {
    const d = topic()
    const r = cli(["add", d, "n2", "--title", "追问节点", "--deps", "n1"])
    expect(r.status).toBe(0)
    const n = graph(d).nodes.find((x) => x.id === "n2")
    expect(n).toBeDefined()
    expect(n?.deps).toEqual(["n1"])
    expect(n?.owner).toBe("child")
    expect(n?.status).toBe("pending")
    expect(n?.progress).toBe("todo")
    expect(n?.deliverables).toEqual(["nodes/n2/RESULT.md"])
    expect(n?.attempts).toEqual([])
  })

  test("add 只写图；BRIEF 未写时不可派（两阶段窗口），写后即可派", () => {
    const d = topic()
    expect(cli(["add", d, "a9", "--title", "独立节点"]).status).toBe(0)
    expect(cli(["ready", d]).stdout).not.toContain("a9")
    writeBrief(d, "a9")
    expect(cli(["ready", d]).stdout).toContain("a9")
  })

  test("add 后写 BRIEF 且三节在场 ⇒ `check --phase dispatch` exit 0", () => {
    const d = topic()
    expect(cli(["add", d, "n2", "--title", "追问", "--deps", "n1"]).status).toBe(0)
    writeBrief(d, "n2")
    expect(cli(["check", d, "--phase", "dispatch"]).status).toBe(0)
  })

  test("--json 可解析；原子写不留 .tmp-*", () => {
    const d = topic()
    const r = cli(["add", d, "n2", "--title", "x", "--json"])
    expect(r.status).toBe(0)
    const payload = JSON.parse(r.stdout) as { ok: boolean; node: string }
    expect(payload.ok).toBe(true)
    expect(payload.node).toBe("n2")
    expect(readdirSync(d).filter((f) => f.includes(".tmp-"))).toEqual([])
  })
})

describe("add：五类拒绝", () => {
  test("已存在 id ⇒ exit 1", () => {
    const d = topic()
    const r = cli(["add", d, "n1", "--title", "重复"])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain("已存在")
  })

  test("非法 id ⇒ exit 1", () => {
    const d = topic()
    expect(cli(["add", d, "M1", "--title", "大写"]).status).toBe(1)
    expect(cli(["add", d, "../escape", "--title", "逃逸"]).status).toBe(1)
  })

  test("deps 指向不存在的节点 ⇒ exit 1", () => {
    const d = topic()
    const r = cli(["add", d, "n2", "--title", "x", "--deps", "ghost"])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain("不存在")
  })

  test("deps 指向 cancelled 节点 ⇒ exit 1（防 cancelled_dep_active 恒红）", () => {
    const d = topic([
      node({ id: "n1", deps: [], deliverables: deliv("n1") }),
      node({ id: "dead", deps: [], deliverables: deliv("dead"), cancelled: { by: "parent", reason: "放弃", at: "2026-01-01T00:00:00Z" } }),
    ])
    const r = cli(["add", d, "n2", "--title", "x", "--deps", "dead"])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain("已取消")
  })

  test("deps 重复 ⇒ exit 1", () => {
    const d = topic([
      node({ id: "n1", deps: [], deliverables: deliv("n1") }),
      node({ id: "n2", deps: [], deliverables: deliv("n2") }),
    ])
    const r = cli(["add", d, "n3", "--title", "x", "--deps", "n1,n1"])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain("重复")
  })

  test("缺 --title ⇒ exit 2（用法错误）", () => {
    const d = topic()
    expect(cli(["add", d, "n2"]).status).toBe(2)
  })

  test("--owner 非法值 ⇒ exit 2", () => {
    const d = topic()
    expect(cli(["add", d, "n2", "--title", "x", "--owner", "robot"]).status).toBe(2)
  })
})
