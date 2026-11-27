/**
 * 结算门（`ADR-plan-collaboration-hardening` D4 / **V7·V8**）
 *
 * 覆盖：`settlement_missing` / `settlement_failed_not_superseded` 的触发条件、
 * 「排除自身」防自毁、「可修复 / 不可修复 / 未分类」三类失败集的处置、记录解析。
 *
 * fixture：真文件 + 真 git（复用 `tests/helpers/plan-topic-fixture.ts`），不依赖模型。
 */
import { afterAll, describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import {
  answerSynthNodeId,
  checkTopic,
  isBlocking,
  isSettledBeforeCriteria,
  loadGraph,
  parseSettlementRecord,
  type Graph,
} from "../lib/plan-topics.ts"
import { cleanupTmp, cli, completeNode, gitTopic, node, writeGraph } from "./helpers/plan-topic-fixture.ts"

afterAll(cleanupTmp)

const deliv = (id: string) => [`nodes/${id}/RESULT.md`]

/** 内容节点 n1 + 合成节点 m1（deps=n1），两者都已干完。 */
function topicWithSynth(more: Parameters<typeof node>[0][] = []): string {
  const { topic } = gitTopic([
    node({ id: "n1", deps: [], deliverables: deliv("n1") }),
    node({ id: "m1", deps: ["n1"], deliverables: deliv("m1") }),
    ...more.map((o) => node(o)),
  ])
  for (const id of ["n1", "m1", ...more.map((o) => o.id as string)]) completeNode(topic, id)
  return topic
}

function record(over: Record<string, string> = {}): string {
  const f: Record<string, string> = {
    checked_at: "2026-11-27T12:20:00Z",
    synthesis_check_exit: "0",
    blocking: "[]",
    answer_node: "m1",
    action: "accept",
    model_resolution: "config",
    model_id: "opencode-go/kimi-k3.1-pro#high",
    ...over,
  }
  return `## 结算记录\n\n\`\`\`yaml\n${Object.entries(f)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n\`\`\`\n`
}

function withTopicMd(d: string, body: string): void {
  writeFileSync(path.join(d, "TOPIC.md"), `# 主题\n\n## 目标\n\nx\n\n${body}`)
}

function blockingCodes(d: string, phase: "dispatch" | "final" = "final"): string[] {
  return checkTopic(d, { phase }).filter(isBlocking).map((v) => v.code)
}

// ── 记录解析 ─────────────────────────────────────────────────────────────────

describe("parseSettlementRecord", () => {
  test("无 `## 结算记录` ⇒ null", () => {
    expect(parseSettlementRecord("# 主题\n\n## 目标\nx\n")).toBeNull()
  })

  test("有节但无 yaml 围栏块 ⇒ null", () => {
    expect(parseSettlementRecord("## 结算记录\n\n- checked_at: 1\n")).toBeNull()
  })

  test("值里的 `:` / `[]` / `×` 原样保留", () => {
    const rec = parseSettlementRecord(record({ blocking: "[synth_heavy_item_not_in_conclusion×6, synth_brief_no_ruling_set]" }))
    expect(rec?.blocking).toBe("[synth_heavy_item_not_in_conclusion×6, synth_brief_no_ruling_set]")
    expect(rec?.model_id).toBe("opencode-go/kimi-k3.1-pro#high")
  })

  test("不会跨到下一个二级标题去抓别人的围栏块", () => {
    expect(parseSettlementRecord("## 结算记录\n\n## 别的\n\n```yaml\na: 1\n```\n")).toBeNull()
  })
})

// ── V7 settlement_missing ────────────────────────────────────────────────────

describe("V7 settlement_missing", () => {
  test("有合成节点 + 全终态 + 无记录 ⇒ blocking", () => {
    const d = topicWithSynth()
    expect(blockingCodes(d)).toEqual(["settlement_missing"])
  })

  test("补一条合规记录 ⇒ 消失（排除自身后仍收尾，不会自毁）", () => {
    const d = topicWithSynth()
    expect(blockingCodes(d)).toEqual(["settlement_missing"])
    withTopicMd(d, record())
    expect(blockingCodes(d)).toEqual([])
  })

  test("记录缺必填字段 ⇒ 仍报 settlement_missing（指名缺键）", () => {
    const d = topicWithSynth()
    withTopicMd(d, record({ model_id: "" }))
    const vs = checkTopic(d).filter((v) => v.code === "settlement_missing")
    expect(vs.map((v) => v.detail).join()).toContain("model_id")
  })

  test("合成节点全 cancelled ⇒ 门不适用", () => {
    const { topic } = gitTopic([
      node({ id: "n1", deliverables: deliv("n1") }),
      node({ id: "m1", deps: ["n1"], deliverables: deliv("m1"), cancelled: { by: "parent", reason: "放弃", at: "2026-01-01T00:00:00Z" } }),
    ])
    completeNode(topic, "n1")
    expect(blockingCodes(topic)).not.toContain("settlement_missing")
  })

  test("未收尾（还有 pending 节点）⇒ 门不适用", () => {
    const { topic } = gitTopic([
      node({ id: "n1", deliverables: deliv("n1") }),
      node({ id: "n2", deps: ["n1"], deliverables: deliv("n2") }),
      node({ id: "m1", deps: ["n1", "n2"], deliverables: deliv("m1") }),
    ])
    completeNode(topic, "n1")
    completeNode(topic, "m1")
    expect(blockingCodes(topic)).not.toContain("settlement_missing")
  })

  test("dispatch 口径不跑结算门", () => {
    const d = topicWithSynth()
    expect(blockingCodes(d, "dispatch")).not.toContain("settlement_missing")
  })
})

// ── V8 settlement_failed_not_superseded ──────────────────────────────────────

describe("V8 settlement_failed_not_superseded", () => {
  test("记录过期（answer_node=m1，但存在更新的 m2）⇒ blocking", () => {
    const d = topicWithSynth([{ id: "m2", deps: ["n1"], deliverables: deliv("m2") }])
    withTopicMd(d, record({ answer_node: "m1" }))
    const vs = checkTopic(d).filter((v) => v.code === "settlement_failed_not_superseded")
    expect(vs.length).toBe(1)
    expect(vs[0].detail).toContain("记录过期")
  })

  test("exit≠0 且失败集含可修复码、未追加更大合成节点 ⇒ blocking", () => {
    const d = topicWithSynth()
    withTopicMd(d, record({ synthesis_check_exit: "1", blocking: "[synth_heavy_item_not_in_conclusion]", action: "accept-with-gap", gap_reason: "懒得改" }))
    const vs = checkTopic(d).filter((v) => v.code === "settlement_failed_not_superseded")
    expect(vs.length).toBe(1)
    expect(vs[0].detail).toContain("可修复码")
  })

  test("exit≠0 可修复码 + 追加 m2 且复核通过 ⇒ 不报", () => {
    const d = topicWithSynth([{ id: "m2", deps: ["n1"], deliverables: deliv("m2") }])
    withTopicMd(d, record({ answer_node: "m2", synthesis_check_exit: "0", blocking: "[]", action: "supersede:m2" }))
    expect(blockingCodes(d)).toEqual([])
  })

  test("exit≠0 全不可修复码 + accept-with-gap + gap_reason ⇒ 不报", () => {
    const d = topicWithSynth()
    withTopicMd(
      d,
      record({ synthesis_check_exit: "1", blocking: "[synth_token_missing]", action: "accept-with-gap", gap_reason: "上游未带 token，合成侧无法修" }),
    )
    expect(blockingCodes(d)).toEqual([])
  })

  test("exit≠0 不可修复码但 action=accept（无 gap_reason）⇒ blocking", () => {
    const d = topicWithSynth()
    withTopicMd(d, record({ synthesis_check_exit: "1", blocking: "[synth_token_missing]", action: "accept" }))
    expect(blockingCodes(d)).toContain("settlement_failed_not_superseded")
  })

  test("exit≠0 未分类码 ⇒ 按不可修复处理（fail-closed，须 gap_reason）", () => {
    const d = topicWithSynth()
    withTopicMd(d, record({ synthesis_check_exit: "1", blocking: "[synth_brand_new_code]", action: "accept" }))
    const vs = checkTopic(d).filter((v) => v.code === "settlement_failed_not_superseded")
    expect(vs.length).toBe(1)
    expect(vs[0].detail).toContain("未分类")
  })

  test("exit≠0 但 blocking 为空（例如 graph_error 未写出）⇒ 仍须 gap_reason", () => {
    const d = topicWithSynth()
    withTopicMd(d, record({ synthesis_check_exit: "1", blocking: "[]", action: "accept" }))
    expect(blockingCodes(d)).toContain("settlement_failed_not_superseded")
  })
})

// ── CLI 端到端（退出码） ──────────────────────────────────────────────────────

describe("CLI：结算门进入退出码", () => {
  test("缺记录 ⇒ `check --phase final` exit 1；补记录 ⇒ exit 0", () => {
    const d = topicWithSynth()
    expect(cli(["check", d, "--phase", "final"]).status).toBe(1)
    withTopicMd(d, record())
    expect(cli(["check", d, "--phase", "final"]).status).toBe(0)
  })

  test("answerSynthNodeId：只在非 cancelled 合成节点里取整数序最大", () => {
    const d = topicWithSynth([{ id: "m10", deps: ["n1"], deliverables: deliv("m10") }])
    const g = loadGraph(d)
    expect(answerSynthNodeId(g.nodes)).toBe("m10")
    const m10 = g.nodes.find((n) => n.id === "m10")!
    m10.cancelled = { by: "parent", reason: "撤回", at: "2026-01-01T00:00:00Z" }
    writeGraph(d, g.nodes)
    expect(answerSynthNodeId(g.nodes)).toBe("m1")
  })
})

// ── grandfather（V8(f)，ADR-plan-collaboration-hardening v3）────────────────────

describe("grandfather：判据生效前已结算", () => {
  /** m1 带指定 attempt 台账（`finished_at` = null ⇒ 无已闭合 attempt） */
  function topicAt(attempt: { started_at: string; finished_at?: string } | null): string {
    const { topic } = gitTopic([
      node({ id: "n1", deps: [], deliverables: deliv("n1") }),
      node({ id: "m1", deps: ["n1"], deliverables: deliv("m1") }),
    ])
    const g = loadGraph(topic)
    if (attempt !== null) g.nodes.find((n) => n.id === "m1")!.attempts = [{ agent: "plan-worker", ...attempt }]
    writeGraph(topic, g.nodes)
    for (const id of ["n1", "m1"]) completeNode(topic, id)
    return topic
  }

  const OLD = { started_at: "2026-11-26T00:00:00.000Z", finished_at: "2026-11-26T13:04:24.519Z" }
  const recGap = (over: Record<string, string> = {}) =>
    record({
      synthesis_check_exit: "1",
      blocking: "[synth_brief_no_ruling_set]",
      action: "accept-with-gap",
      gap_reason: "判据生效前已结算：synth_brief_no_ruling_set",
      ...over,
    })

  test("闭合早于生效日 + accept-with-gap + 覆盖该码 ⇒ 不阻断", () => {
    const d = topicAt(OLD)
    withTopicMd(d, recGap())
    expect(blockingCodes(d)).not.toContain("settlement_failed_not_superseded")
  })

  test("边界：2026-11-26T23:59:59Z 适用 / 2026-11-27T00:00:00Z 不适用（严格小于）", () => {
    const before = topicAt({ started_at: "2026-11-26T00:00:00.000Z", finished_at: "2026-11-26T23:59:59.000Z" })
    withTopicMd(before, recGap())
    expect(blockingCodes(before)).not.toContain("settlement_failed_not_superseded")

    const onDay = topicAt({ started_at: "2026-11-27T00:00:00.000Z", finished_at: "2026-11-27T00:00:00.000Z" })
    withTopicMd(onDay, recGap())
    expect(blockingCodes(onDay)).toContain("settlement_failed_not_superseded")
  })

  test("无已闭合 attempt ⇒ 不适用（fail-closed）", () => {
    const d = topicAt(null)
    withTopicMd(d, recGap())
    expect(blockingCodes(d)).toContain("settlement_failed_not_superseded")
  })

  test("有未闭合 attempt（无 finished_at）⇒ 视同无已闭合 attempt（单测 helper）", () => {
    // 等价场景在 checkTopic 下不可观测：未闭合 attempt ⇒ 有在飞 ⇒ 结算门整体不触发（收尾条件不成立）
    const g = {
      version: 1,
      topic: "t",
      nodes: [node({ id: "m1", attempts: [{ agent: "plan-worker", started_at: "2026-11-26T00:00:00.000Z" }] })],
    } as Graph
    expect(isSettledBeforeCriteria(g, "m1")).toBe(false)
  })

  test("畸形 / 空 finished_at ⇒ 不视为已闭合（fail-closed）", () => {
    for (const bad of ["", "2026-1", "yesterday"]) {
      const g = {
        version: 1,
        topic: "t",
        nodes: [node({ id: "m1", attempts: [{ agent: "plan-worker", started_at: "2026-11-26T00:00:00.000Z", finished_at: bad }] })],
      } as Graph
      expect(isSettledBeforeCriteria(g, "m1"), `finished_at=${JSON.stringify(bad)}`).toBe(false)
    }
  })

  test("取 max(finished_at)：早的一次不能用来豁免（末次闭合在生效日）", () => {
    const { topic } = gitTopic([
      node({ id: "n1", deps: [], deliverables: deliv("n1") }),
      node({ id: "m1", deps: ["n1"], deliverables: deliv("m1") }),
    ])
    const g = loadGraph(topic)
    g.nodes.find((n) => n.id === "m1")!.attempts = [
      { agent: "plan-worker", started_at: "2026-11-26T00:00:00.000Z", finished_at: "2026-11-27T09:00:00.000Z" },
      { agent: "plan-worker", started_at: "2026-11-25T00:00:00.000Z", finished_at: "2026-11-25T10:00:00.000Z" },
    ]
    writeGraph(topic, g.nodes)
    for (const id of ["n1", "m1"]) completeNode(topic, id)
    withTopicMd(topic, recGap())
    expect(blockingCodes(topic)).toContain("settlement_failed_not_superseded")
  })

  test("改用 `action: accept` ⇒ 仍阻断", () => {
    const d = topicAt(OLD)
    withTopicMd(d, recGap({ action: "accept" }))
    expect(blockingCodes(d)).toContain("settlement_failed_not_superseded")
  })

  test("gap_reason 未覆盖该可修复码 ⇒ 仍阻断", () => {
    const d = topicAt(OLD)
    withTopicMd(d, recGap({ gap_reason: "懒得改" }))
    expect(blockingCodes(d)).toContain("settlement_failed_not_superseded")
  })

  test("混合集：可修复 + 未分类码都要覆盖", () => {
    const both = "[synth_brief_no_ruling_set, synth_brand_new_code]"

    const partial = topicAt(OLD)
    withTopicMd(partial, recGap({ blocking: both, gap_reason: "只写了 synth_brief_no_ruling_set" }))
    expect(blockingCodes(partial)).toContain("settlement_failed_not_superseded")

    const full = topicAt(OLD)
    withTopicMd(full, recGap({ blocking: both, gap_reason: "synth_brief_no_ruling_set + synth_brand_new_code 均为历史遗留" }))
    expect(blockingCodes(full)).not.toContain("settlement_failed_not_superseded")
  })

  test("exit=0 的记录不受 grandfather 影响（正常 accept 路径）", () => {
    const d = topicAt(OLD)
    withTopicMd(d, record({ synthesis_check_exit: "0", blocking: "[]", action: "accept" }))
    expect(blockingCodes(d)).toEqual([])
  })
})
