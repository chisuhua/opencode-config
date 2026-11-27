/**
 * plan 侧协作 topic 的 L1 fixture —— 真文件 / 真 git / 临时目录。
 * 供 `tests/plan-topics*.test.ts` 复用；不依赖模型与真实 opencode 运行时。
 */
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Node } from "../../lib/plan-topics.ts"

export const ROOT = path.resolve(import.meta.dir, "..", "..")
export const CLI = path.join(ROOT, "scripts", "plan-topic-check.ts")

const created: string[] = []

export function tmpTopic(): string {
  const d = mkdtempSync(path.join(tmpdir(), "plan-dag-"))
  mkdirSync(path.join(d, "nodes"), { recursive: true })
  writeFileSync(path.join(d, "TOPIC.md"), TOPIC_MD)
  created.push(d)
  return d
}

/**
 * 默认 `TOPIC.md` —— 必须含目标审查三节（`ADR-plan-collaboration-hardening` D5：`--phase dispatch`
 * 在有可派节点时要求三节在场且非空）。要测「缺三节」的负向用例请自行覆盖或删除该文件。
 */
export const TOPIC_MD = [
  "# 主题",
  "",
  "## 目标",
  "",
  "回答一个真实问题。",
  "",
  "## 前提与证伪条件",
  "",
  "- 前提：本仓存在该机制。证伪条件：`grep` 零命中。",
  "",
  "## 非目标",
  "",
  "- 不改实现代码。",
  "",
  "## 目标审查结论",
  "",
  "- 2026-11-27 / planner：前提已逐条列出，暂未证伪。",
  "",
].join("\n")

export function cleanupTmp(): void {
  for (const d of created) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

export function node(over: Partial<Node> = {}): Node {
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

export function writeGraph(d: string, nodes: Node[], extra: Record<string, unknown> = {}): void {
  writeFileSync(
    path.join(d, "graph.json"),
    JSON.stringify({ version: 1, topic: path.basename(d), nodes, ...extra }),
  )
}

export function writeBrief(d: string, id: string, text = "# brief\n"): void {
  const nd = path.join(d, "nodes", id)
  mkdirSync(nd, { recursive: true })
  writeFileSync(path.join(nd, "BRIEF.md"), text)
}

export function writeNode(
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

/** 模拟「worker 干完了一个节点」：TODO 全勾 + RESULT 有正文（同时充当 \`nodes/<id>/RESULT.md\` 交付物） */
export function completeNode(d: string, id: string): void {
  writeNode(d, id, { brief: null, todo: "- [x] done\n", result: "# 结论\n\n正文。\n" })
}

export function makeDeliverable(d: string, rel: string, content = "x"): void {
  const abs = path.join(d, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

export function cli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", [CLI, ...args], { encoding: "utf8" })
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" }
}

/** 最小 git fixture 仓：topic 落在 \`.rddf/plan-topics/<slug>/\`（= scope-check / lock 的路径口径） */
export function gitTopic(nodes: Node[] = [node({ id: "a1" })]): { repo: string; topic: string } {
  const repo = mkdtempSync(path.join(tmpdir(), "plan-dag-git-"))
  created.push(repo)
  const run = (args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" })
  run(["init", "-q"])
  run(["config", "user.email", "t@example.com"])
  run(["config", "user.name", "t"])
  const topic = path.join(repo, ".rddf", "plan-topics", "demo")
  mkdirSync(path.join(topic, "nodes"), { recursive: true })
  writeFileSync(path.join(topic, "TOPIC.md"), TOPIC_MD)
  for (const n of nodes) writeBrief(topic, n.id)
  writeGraph(topic, nodes)
  run(["add", "-A"])
  run(["commit", "-qm", "base"])
  return { repo, topic }
}

export function git(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" })
}
