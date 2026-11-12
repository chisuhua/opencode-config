/**
 * subagent 输入契约的**审计器单测**（临时 sqlite 夹具，不依赖真实库）。
 *
 * 覆盖：
 *  - 只审计有父会话的子会话（主会话的 user 消息不受约束）
 *  - 规则按条目自己的 agent 解析（oracle 不被 critic 的规则误判）
 *  - 状态继承：同一父会话内复审链 → 引用上一轮的续轮被豁免；不引用上一轮的新评审不被放行
 *  - CLI 退出码：--strict 有违规 exit 1；否则 exit 0
 *
 * 运行：bun test tests/subagent-contract-audit.test.ts
 */
import { afterAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import path from "node:path"

import { audit, collectRows } from "../scripts/audit-subagent-prompts.ts"

const TMP = mkdtempSync(path.join("/tmp/opencode", "subagent-contract-audit-"))
const DB_PATH = path.join(TMP, "fixture.db")

/** 一份合规的 critic prompt（7 字段齐全 + 长度达标） */
const COMPLIANT = [
  "请审查以下改动：",
  "",
  "## changes_summary",
  "- src/foo.cpp: 修 bug",
  "",
  "## intent",
  "修掉崩溃",
  "",
  "## focus",
  "1. 契约兼容",
  "2. 失败模式",
  "",
  "## review_profile",
  "build",
  "",
  "## diff_or_paths",
  "```diff",
  "diff --git a/src/foo.cpp b/src/foo.cpp",
  "```",
  "",
  "## context",
  "- 相关测试: tests/foo.test.ts",
  "",
  "## expected_format",
  "4 段式 + mergeable / scope_exceeded",
  "",
  "补充说明。" + "x".repeat(200),
].join("\n")

/** 复审轮：命中关键词豁免，但长度仍要达标 */
const REVIEW_ROUND = "这是复审（第 2 轮），只判定上一轮 BLOCK 是否闭合。" + "x".repeat(220)

/** 续接复审：自身引用上一轮 ⇒ 可继承"复审模式" */
const FOLLOWUP_REVIEW = "已按上一轮意见修复，补充说明。" + "x".repeat(220)

/**
 * 不合规：缺小节，但长度达标（≥200）——
 * 长度不足是另一类违规；这里刻意只留"缺小节"，好观察豁免与状态继承的效果。
 */
const NON_COMPLIANT = "审查一下这个改动。" + "x".repeat(220)

function seed(): void {
  const db = new Database(DB_PATH, { create: true })
  db.exec(`
    create table session_v2 (
      id text primary key,
      parent_id text,
      agent text,
      title text,
      time_created integer
    );
    create table session_message (
      id text primary key,
      session_id text,
      seq integer,
      type text,
      data text
    );
  `)
  const insSession = db.query(
    `insert into session_v2 (id, parent_id, agent, title, time_created) values (?,?,?,?,?)`,
  )
  const insMessage = db.query(
    `insert into session_message (id, session_id, seq, type, data) values (?,?,?,?,?)`,
  )

  const t = (n: number) => 1700000000000 + n * 1000

  // 父会话 P1：只有一次 critic 调用 → 不合规 → 应判违规
  insSession.run("C1", "P1", "critic", "critic 不合规", t(1))
  insMessage.run(
    "m1",
    "C1",
    1,
    "user",
    JSON.stringify({ text: "You are a subagent spawned by another session.\n" + NON_COMPLIANT }),
  )

  // 父会话 P2：先"复审轮"（critic，关键词命中），后缺小节（critic）→ 后者继承复审模式被豁免
  insSession.run("C2", "P2", "critic", "critic 复审轮", t(2))
  insMessage.run(
    "m2",
    "C2",
    1,
    "user",
    JSON.stringify({ text: "You are a subagent spawned by another session.\n" + REVIEW_ROUND }),
  )
  insSession.run("C3", "P2", "critic", "critic 后续", t(3))
  insMessage.run(
    "m3",
    "C3",
    1,
    "user",
    JSON.stringify({ text: "You are a subagent spawned by another session.\n" + FOLLOWUP_REVIEW }),
  )

  // 父会话 P2：另一个**新评审**（不引用上一轮）→ 不得继承上一轮的"复审模式"
  insSession.run("C5", "P2", "critic", "critic 另一个新评审", t(5))
  insMessage.run(
    "m5",
    "C5",
    1,
    "user",
    JSON.stringify({ text: "You are a subagent spawned by another session.\n" + NON_COMPLIANT }),
  )

  // 父会话 P3：oracle 无契约 → 不判违规
  insSession.run("C4", "P3", "oracle", "oracle 随便问", t(4))
  insMessage.run(
    "m4",
    "C4",
    1,
    "user",
    JSON.stringify({ text: "You are a subagent spawned by another session.\n" + NON_COMPLIANT }),
  )

  // 主会话自己的 user 消息 → 不该被审计
  insSession.run("P1", null, "build", "父会话", t(0))
  insMessage.run(
    "m0",
    "P1",
    1,
    "user",
    JSON.stringify({ text: "主会话的普通输入" }),
  )

  db.close()
}

seed()

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe("审计器", () => {
  test("只收集有父会话的子会话（主会话不进来）", () => {
    const rows = collectRows(DB_PATH, { dbPath: DB_PATH, strict: false })
    expect(rows.length).toBe(5)
    expect(rows.map((r) => r.sessionID).sort()).toEqual(["C1", "C2", "C3", "C4", "C5"])
  })

  test("规则按条目自己的 agent 解析：oracle 不被 critic 的规则误判", () => {
    const report = audit(DB_PATH, { dbPath: DB_PATH, strict: false })
    expect(report.summary.oracle).toEqual({ total: 1, violations: 0, exempted: 0 })
  })

  test("不合规被报出，且列出缺失小节", () => {
    const report = audit(DB_PATH, { dbPath: DB_PATH, strict: false })
    expect(report.violations.map((v) => v.sessionID).sort()).toEqual(["C1", "C5"])
    expect(report.violations[0]!.evaluation.violations.map((v) => v.code)).toContain(
      "missing-sections",
    )
  })

  test("状态继承：同父会话内复审链 → 引用上一轮的续轮被豁免", () => {
    const report = audit(DB_PATH, { dbPath: DB_PATH, strict: false })
    expect(report.summary.critic).toEqual({ total: 4, violations: 2, exempted: 2 })
    const c3 = report.rows.find((r) => r.sessionID === "C3")!
    expect(c3.evaluation.ok).toBe(true)
    expect(c3.evaluation.exemption).toBe("prior-review-round")
  })

  test("状态继承不跨对象：不引用上一轮的新评审不被放行", () => {
    const report = audit(DB_PATH, { dbPath: DB_PATH, strict: false })
    const c5 = report.rows.find((r) => r.sessionID === "C5")!
    expect(c5.evaluation.ok).toBe(false)
    expect(c5.evaluation.exempted).toBe(false)
    expect(c5.evaluation.violations.map((v) => v.code)).toContain("missing-sections")
  })
})

describe("CLI 退出码", () => {
  const run = (args: string[]) =>
    execFileSync("bun", ["scripts/audit-subagent-prompts.ts", "--db", DB_PATH, ...args], {
      cwd: path.join(import.meta.dir, ".."),
      encoding: "utf8",
    })

  test("默认：报告后 exit 0", () => {
    const out = run([])
    expect(out).toContain("critic")
    expect(out).toContain("违规")
  })

  test("--strict：有违规 exit 1", () => {
    let code = 0
    try {
      run(["--strict"])
    } catch (e) {
      code = (e as { status: number }).status
    }
    expect(code).toBe(1)
  })

  test("--agent 过滤：只审指定 agent", () => {
    const out = run(["--agent", "oracle"])
    expect(out).toContain("oracle")
    expect(out).not.toContain("critic")
  })
})
