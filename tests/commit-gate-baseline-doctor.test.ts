/**
 * ADR D10② —— **巡检层**（baseline 防腐坏 + 可清理提示 + 失败数膨胀必被发现）。
 *
 * 判据真源：`docs/adr/ADR-commit-verification-gate.md` 的 D10② + **V24①**。
 * ⚠ 本层**不复用子串语义**（那是它存在的唯一理由）：`match: "3 fail"` 在失败数
 * 涨到 13（输出 `"13 fail"` 仍含 `"3 fail"`）时若按子串判 ⇒ 永远命中 ⇒ baseline 实增。
 */
import { describe, expect, test } from "bun:test"

import {
  bunTestExtractor,
  evaluatePatrol,
  extractorFor,
  formatCheckExtractor,
  mapEntryToIdentifiers,
  type Declaration,
} from "../scripts/commit-gate-baseline-doctor.ts"

const TEST_CMD = ["bun", "test", "tests/"]

function decl(entries: Array<{ match: string; command?: string[] }>): Declaration {
  return {
    verify_commands: [TEST_CMD],
    known_failures: entries.map((e) => ({ command: e.command ?? TEST_CMD, match: e.match })),
    inspection: { command: ["bun", "scripts/commit-gate-baseline-doctor.ts"], carrier: "scripts/x.ts" },
  } as Declaration
}

describe("D10② · 标识提取器", () => {
  test("bun test：`(fail) <name>` 行 ⇒ 失败标识", () => {
    const out = "(pass) ok one\n(fail) 回滚清单：在场性 + 可执行性 > plan-topics.json\n"
    expect(bunTestExtractor(out)).toEqual(["回滚清单：在场性 + 可执行性 > plan-topics.json"])
  })

  test("bun test：无失败 ⇒ null（不参与比对）", () => {
    expect(bunTestExtractor("(pass) all good\n")).toBeNull()
  })

  test("format.sh --check：清单块里的路径 ⇒ 失败标识", () => {
    const out = "✓ a.cc\n❌ 2 个文件需要格式化\n   运行：./scripts/format.sh 自动格式化\n"
    // 「运行：」之后是提示 ⇒ 结束标记
    expect(formatCheckExtractor(out)).toBeNull()
    const out2 = "❌ 2 个文件需要格式化\n   src/a.cc\n   src/b.cc\n   运行：./scripts/format.sh\n"
    expect(formatCheckExtractor(out2)).toEqual(["src/a.cc", "src/b.cc"])
  })

  test("按命令形态选提取器；未知命令 ⇒ null", () => {
    expect(extractorFor(["bun", "test", "tests/"])).toBe(bunTestExtractor)
    expect(extractorFor(["bash", "scripts/format.sh", "--check"])).toBe(formatCheckExtractor)
    expect(extractorFor(["make", "build"])).toBeNull()
  })
})

describe("D10② · 集合比对（防腐坏 + 膨胀必被发现）", () => {
  test("条目映射到 ≥1 个当前标识 ⇒ 仍命中（alive）", () => {
    const d = decl([{ match: "plan-topics.json" }])
    const outputs = new Map([[TEST_CMD.join(" "), "(fail) 回滚清单 > plan-topics.json\n"]])
    const report = evaluatePatrol(d, outputs)
    expect(report.status).toBe("pass")
    expect(report.entries[0]!.alive).toBe(true)
  })

  test("**失败数膨胀被被发现**：`3 fail` 的条目在 `13 fail` 的输出里不再命中", () => {
    const d = decl([{ match: "3 fail" }])
    const outputs = new Map([[TEST_CMD.join(" "), "(fail) 13 fail\n"]])
    const report = evaluatePatrol(d, outputs)
    expect(report.status).toBe("red")
    expect(report.entries[0]!.alive).toBe(false)
    expect(report.reason).toContain("不再命中")
  })

  test("不再命中 ⇒ 可清理（报告里点名该条目）", () => {
    const d = decl([{ match: "pre-existing failures in test_gone" }])
    const outputs = new Map([[TEST_CMD.join(" "), "(fail) something else entirely\n"]])
    const report = evaluatePatrol(d, outputs)
    expect(report.status).toBe("red")
    const stale = report.entries.filter((e) => !e.alive)
    expect(stale).toHaveLength(1)
    expect(stale[0]!.match).toContain("test_gone")
  })

  test("无提取器的命令 ⇒ 不参与比对（不静默当通过，也不误报红）", () => {
    const d = decl([{ match: "abcdefgh ij", command: ["make", "build"] }])
    const outputs = new Map([["make build", "whatever\n"]])
    const report = evaluatePatrol(d, outputs)
    expect(report.status).toBe("pass")
    expect(report.noExtractor).toHaveLength(1)
  })

  test("命令无输出 ⇒ skip（判定不可得，不是红）", () => {
    const d = decl([{ match: "abcdefgh ij" }])
    const report = evaluatePatrol(d, new Map())
    expect(report.status).toBe("skip")
  })

  test("声明无 known_failures ⇒ pass（无需巡检）", () => {
    const report = evaluatePatrol({ verify_commands: [TEST_CMD] } as Declaration, new Map())
    expect(report.status).toBe("pass")
  })

  test("映射函数：只认含 match 的标识行", () => {
    expect(mapEntryToIdentifiers({ command: TEST_CMD, match: "alpha" }, ["alpha beta", "gamma"])).toEqual([
      "alpha beta",
    ])
    expect(mapEntryToIdentifiers({ command: TEST_CMD, match: "alpha" }, ["gamma"])).toEqual([])
  })

  test("**数字边界**：`3 fail` 不匹配标识 `13 fail`（但 `13 fail` 匹配 `13 fail`）", () => {
    expect(mapEntryToIdentifiers({ command: TEST_CMD, match: "3 fail" }, ["13 fail"])).toEqual([])
    expect(mapEntryToIdentifiers({ command: TEST_CMD, match: "13 fail" }, ["13 fail"])).toEqual(["13 fail"])
    expect(mapEntryToIdentifiers({ command: TEST_CMD, match: "3 fail" }, ["3 fail"])).toEqual(["3 fail"])
  })
})
