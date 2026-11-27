/**
 * 目标审查门（`ADR-plan-collaboration-hardening` D5 / **V9**）
 *
 * 规则：**仅 `--phase dispatch` 且存在可派节点**时，`TOPIC.md` 必须含「前提与证伪条件 / 非目标 /
 * 目标审查结论」三节且各节非空；`TOPIC.md` 整体缺失 ⇒ 视同三节全缺。
 * 收尾后的 topic（ready 为空）与 `final` 口径都不受这条影响。
 */
import { afterAll, describe, expect, test } from "bun:test"
import { rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { checkTopic, isBlocking } from "../lib/plan-topics.ts"
import { cleanupTmp, cli, completeNode, gitTopic, node, TOPIC_MD } from "./helpers/plan-topic-fixture.ts"

afterAll(cleanupTmp)

const deliv = (id: string) => [`nodes/${id}/RESULT.md`]

function topic(): string {
  const { topic } = gitTopic([
    node({ id: "n1", deps: [], deliverables: deliv("n1") }),
    node({ id: "n2", deps: ["n1"], deliverables: deliv("n2") }),
  ])
  return topic
}

const codes = (d: string, phase: "dispatch" | "final") =>
  checkTopic(d, { phase }).filter(isBlocking).map((v) => v.code)

describe("V9 topic_goal_unreviewed", () => {
  test("三节齐（默认 fixture）⇒ dispatch 不报", () => {
    const d = topic()
    expect(codes(d, "dispatch")).not.toContain("topic_goal_unreviewed")
    expect(cli(["check", d, "--phase", "dispatch"]).status).toBe(0)
  })

  test("TOPIC.md 整体缺失 ⇒ 视同三节全缺（blocking）", () => {
    const d = topic()
    rmSync(path.join(d, "TOPIC.md"))
    expect(codes(d, "dispatch")).toContain("topic_goal_unreviewed")
    expect(cli(["check", d, "--phase", "dispatch"]).status).toBe(1)
  })

  test("缺其中一节 ⇒ 报该节名", () => {
    const d = topic()
    writeFileSync(path.join(d, "TOPIC.md"), TOPIC_MD.replace(/## 非目标[\s\S]*$/, ""))
    const v = checkTopic(d, { phase: "dispatch" }).find((x) => x.code === "topic_goal_unreviewed")
    expect(v?.detail).toContain("非目标")
  })

  test("某一节只有标题没有正文 ⇒ 视为空", () => {
    const d = topic()
    writeFileSync(
      path.join(d, "TOPIC.md"),
      "# 主题\n\n## 前提与证伪条件\n\n- 前提：x\n\n## 非目标\n\n## 目标审查结论\n\n- 审过\n",
    )
    const v = checkTopic(d, { phase: "dispatch" }).find((x) => x.code === "topic_goal_unreviewed")
    expect(v?.detail).toContain("非目标")
  })

  test("ready 为空（全部完成）⇒ 不报", () => {
    const d = topic()
    rmSync(path.join(d, "TOPIC.md"))
    completeNode(d, "n1")
    completeNode(d, "n2")
    expect(codes(d, "dispatch")).not.toContain("topic_goal_unreviewed")
  })

  test("final 口径不跑目标审查门", () => {
    const d = topic()
    rmSync(path.join(d, "TOPIC.md"))
    expect(codes(d, "final")).not.toContain("topic_goal_unreviewed")
  })

  test("三节齐全时 `ready` 仍只按依赖/BRIEF 判（互补关系）", () => {
    const d = topic()
    expect(cli(["ready", d]).stdout.trim()).toBe("n1")
  })
})
