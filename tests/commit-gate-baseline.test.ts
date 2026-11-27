/**
 * ADR D10 —— 门禁声明的 baseline（`known_failures`）机制。
 *
 * 判据真源：`docs/adr/ADR-commit-verification-gate.md` 的 **D10 段**（Status Update 2026-11-27，
 * Status Accepted）+ **Verification V20–V25**。本文件只测**机制行为**，不复制判据正文。
 *
 * 覆盖：
 * - V20（AC1）：命中 ⇒ 放行 + 运行时留痕（notice）；未命中 ⇒ 拒；同 command 多条目任一命中。
 * - V22（AC2）：无 `known_failures` ⇒ 行为与 D10 之前逐字相同。
 * - V23（AC3）：无效条目 / 特异性违规 / 超时按未命中 / 不豁免 D2②③ / 畸形声明总兜底。
 * - V25①（AC4）：巡检缺席（缺 inspection / 非独立条目 / 未 tracked / symlink）⇒ 字段整体无效 ⇒ 硬门；
 *   `known_failures` 绑定巡检守卫命令 ⇒ 条目无效。
 */
import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  evaluateCommitGate,
  evaluateInspection,
  isBoundToInspection,
  isSpecificMatch,
  matchKnownFailure,
  shouldMatchBaseline,
  sameArgv,
  validateDeclaration,
  type CommitGateDeclaration,
} from "../lib/commit-gate.ts"

const FAIL_CMD = ["bun", "test", "tests/"]
const PATROL_CMD = ["bun", "scripts/commit-gate-baseline-doctor.ts"]

function declWith(extra: Partial<CommitGateDeclaration>): CommitGateDeclaration {
  return {
    verify_commands: [FAIL_CMD, PATROL_CMD],
    ...extra,
  } as CommitGateDeclaration
}

describe("D10 · 特异性约束", () => {
  test("去空白后 ≥ 8 字、末尾 token 非通用词 ⇒ 合法", () => {
    expect(isSpecificMatch("pre-existing failures in test_llm_cache")).toBe(true)
    expect(isSpecificMatch("timeout in test_llm_cache")).toBe(true)
  })

  test("过短 / 纯数字 / 末尾是通用词 ⇒ 不合法", () => {
    expect(isSpecificMatch("fail")).toBe(false)
    expect(isSpecificMatch("        ")).toBe(false) // 纯空白（去空白后 0 字）
    expect(isSpecificMatch("12345678")).toBe(false) // 纯数字
    expect(isSpecificMatch("xx 3 fail")).toBe(false) // 末尾 token = 通用词
    expect(isSpecificMatch("xx 3 FAIL")).toBe(false) // 大小写不敏感
  })
})

describe("D10 · 命中判定", () => {
  const decl = declWith({
    known_failures: [{ command: FAIL_CMD, match: "pre-existing failures in test_llm_cache" }],
    inspection: { command: PATROL_CMD, carrier: "scripts/commit-gate-baseline-doctor.ts" },
  })

  test("输出含 match ⇒ 命中（并给出模式供留痕）", () => {
    const r = matchKnownFailure(decl, FAIL_CMD, "....\npre-existing failures in test_llm_cache\n")
    expect(r.matched).toBe(true)
    expect(r.pattern).toBe("pre-existing failures in test_llm_cache")
  })

  test("输出不含 match ⇒ 未命中（带原因）", () => {
    const r = matchKnownFailure(decl, FAIL_CMD, "3 tests failed")
    expect(r.matched).toBe(false)
    expect(r.reason).toBeTruthy()
  })

  test("同一 command 多条目 ⇒ 任一命中即放行", () => {
    const multi = declWith({
      known_failures: [
        { command: FAIL_CMD, match: "pre-existing failures in test_alpha" },
        { command: FAIL_CMD, match: "pre-existing failures in test_beta" },
      ],
      inspection: { command: PATROL_CMD, carrier: "scripts/commit-gate-baseline-doctor.ts" },
    })
    expect(matchKnownFailure(multi, FAIL_CMD, "pre-existing failures in test_beta").matched).toBe(true)
    expect(matchKnownFailure(multi, FAIL_CMD, "pre-existing failures in test_gamma").matched).toBe(false)
  })

  test("条目只对其 command 生效（别的命令不借用）", () => {
    expect(matchKnownFailure(decl, PATROL_CMD, "pre-existing failures in test_llm_cache").matched).toBe(false)
  })

  test("CRLF 归一化后仍可命中", () => {
    const r = matchKnownFailure(decl, FAIL_CMD, "x\r\npre-existing failures in test_llm_cache\r\n")
    expect(r.matched).toBe(true)
  })

  test("绑定巡检守卫命令的条目 ⇒ 无效（不放行）", () => {
    const bound = declWith({
      known_failures: [{ command: PATROL_CMD, match: "pre-existing failures in test_llm_cache" }],
      inspection: { command: PATROL_CMD, carrier: "scripts/commit-gate-baseline-doctor.ts" },
    })
    expect(isBoundToInspection(bound, bound.known_failures![0]!)).toBe(true)
    const r = matchKnownFailure(bound, PATROL_CMD, "pre-existing failures in test_llm_cache")
    expect(r.matched).toBe(false)
    expect(r.reason).toContain("绑定了巡检守卫命令")
  })

  test("不具描述性的 match ⇒ 条目无效（不放行）", () => {
    const weak = declWith({
      known_failures: [{ command: FAIL_CMD, match: "fail" }],
      inspection: { command: PATROL_CMD, carrier: "scripts/commit-gate-baseline-doctor.ts" },
    })
    const r = matchKnownFailure(weak, FAIL_CMD, "fail")
    expect(r.matched).toBe(false)
    expect(r.reason).toContain("特异性")
  })
})

describe("D10 · 超时按未命中（V23 ③）", () => {
  test("命令超时 ⇒ 不进入匹配（挂死的套件不得借 baseline 永久过关）", () => {
    expect(shouldMatchBaseline({ code: "ETIMEDOUT" }, true).ok).toBe(false)
    expect(shouldMatchBaseline({ code: "TIMEOUT" }, true).ok).toBe(false)
    expect(shouldMatchBaseline({ code: 1 }, true).ok).toBe(true)
  })

  test("baseline 不可用（巡检缺席 / 声明非法）⇒ 不匹配", () => {
    const r = shouldMatchBaseline({ code: 1 }, false)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain("不可用")
  })
})

describe("D10 · 无 known_failures ⇒ 逐字不变", () => {
  test("无 known_failures ⇒ 任何输出都不命中（「无条目」不是「命中」）", () => {
    expect(matchKnownFailure(declWith({}), FAIL_CMD, "任意输出 pre-existing failures in x").matched).toBe(false)
  })

  test("声明无该字段 ⇒ 判定逻辑与 D10 之前一致（失败即拒）", () => {
    const decl = declWith({})
    const outcome = evaluateCommitGate({
      declaration: decl,
      stagedFiles: ["a.txt"],
      stagedState: "has",
      writeSetViolations: [],
      verification: { ok: false, failedCommand: FAIL_CMD, outputTail: "boom" },
    })
    expect(outcome.allowed).toBe(false)
    expect(outcome.reason).toContain("验证命令失败")
  })
})

describe("D10 · 声明形状校验（总兜底）", () => {
  test("known_failures 非数组 / match 非字符串 / command 非数组 ⇒ 视作未声明", () => {
    expect(validateDeclaration({ verify_commands: [FAIL_CMD], known_failures: "x" }).ok).toBe(false)
    expect(validateDeclaration({ verify_commands: [FAIL_CMD], known_failures: [{ command: FAIL_CMD, match: 3 }] }).ok).toBe(false)
    expect(validateDeclaration({ verify_commands: [FAIL_CMD], known_failures: [{ command: "x", match: "abcdefgh" }] }).ok).toBe(false)
  })

  test("inspection 形状非法 ⇒ 视作未声明", () => {
    expect(validateDeclaration({ verify_commands: [FAIL_CMD], inspection: { command: "x", carrier: "y" } }).ok).toBe(false)
    expect(validateDeclaration({ verify_commands: [FAIL_CMD], inspection: { command: PATROL_CMD } }).ok).toBe(false)
  })

  test("合法声明 ⇒ ok", () => {
    expect(
      validateDeclaration({
        verify_commands: [FAIL_CMD],
        known_failures: [{ command: FAIL_CMD, match: "pre-existing failures in test_llm_cache" }],
        inspection: { command: PATROL_CMD, carrier: "scripts/x.ts" },
      }).ok,
    ).toBe(true)
  })
})

describe("D10 · 巡检存在性（静态判定）", () => {
  const facts = { carrierTracked: true, carrierIsSymlink: false }

  test("无 known_failures ⇒ 不要求巡检", () => {
    expect(evaluateInspection(declWith({}), facts).usable).toBe(true)
  })

  test("缺 inspection ⇒ 字段整体无效（退回硬门）", () => {
    const r = evaluateInspection(declWith({ known_failures: [{ command: FAIL_CMD, match: "abcdefgh ij" }] }), facts)
    expect(r.usable).toBe(false)
    expect(r.reason).toContain("缺少 inspection")
  })

  test("inspection.command 不是 verify_commands 的独立条目 ⇒ 无效", () => {
    const decl = declWith({
      known_failures: [{ command: FAIL_CMD, match: "abcdefgh ij" }],
      inspection: { command: ["bun", "scripts/not-declared.ts"], carrier: "scripts/x.ts" },
    })
    expect(evaluateInspection(decl, facts).usable).toBe(false)
  })

  test("载体未 tracked / 是 symlink ⇒ 视作缺席 ⇒ 无效", () => {
    const decl = declWith({
      known_failures: [{ command: FAIL_CMD, match: "abcdefgh ij" }],
      inspection: { command: PATROL_CMD, carrier: "scripts/x.ts" },
    })
    expect(evaluateInspection(decl, { carrierTracked: false, carrierIsSymlink: false }).usable).toBe(false)
    expect(evaluateInspection(decl, { carrierTracked: true, carrierIsSymlink: true }).usable).toBe(false)
  })
})

describe("D10 · 门禁组合：命中放行 + 留痕", () => {
  test("命中 ⇒ 放行且带 notice（留痕文本可区分「真绿」）", () => {
    const outcome = evaluateCommitGate({
      declaration: declWith({}),
      stagedFiles: ["a.txt"],
      stagedState: "has",
      writeSetViolations: [],
      verification: { ok: true },
      notices: ["baseline 命中: bun test tests/ / match=pre-existing failures in test_llm_cache"],
    })
    expect(outcome.allowed).toBe(true)
    expect(outcome.notices?.[0]).toContain("baseline 命中")
  })

  test("baseline 不豁免 D2②（暂存区为空）与 D2③（越写集）", () => {
    const base = {
      declaration: declWith({}),
      verification: { ok: true },
      notices: ["baseline 命中: x"],
    }
    expect(evaluateCommitGate({ ...base, stagedFiles: [], stagedState: "empty", writeSetViolations: [] }).allowed).toBe(false)
    expect(
      evaluateCommitGate({
        ...base,
        stagedFiles: ["a"],
        stagedState: "has",
        writeSetViolations: [{ file: "a", reason: "越界" }],
      }).allowed,
    ).toBe(false)
  })

  test("sameArgv：逐字相等才算同一条命令", () => {
    expect(sameArgv(["a", "b"], ["a", "b"])).toBe(true)
    expect(sameArgv(["a", "b"], ["b", "a"])).toBe(false)
    expect(sameArgv(["a"], ["a", "b"])).toBe(false)
  })
})

describe("D10 · 载体判定（真实 git 仓库）", () => {
  function makeRepo(): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cg-baseline-"))
    execFileSync("git", ["init", "-q"], { cwd: dir })
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir })
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir })
    mkdirSync(path.join(dir, "scripts"), { recursive: true })
    writeFileSync(path.join(dir, "scripts", "real.ts"), "export const x = 1\n")
    writeFileSync(path.join(dir, "scripts", "untracked.ts"), "export const y = 2\n")
    return dir
  }

  test("git ls-files：未 tracked 的文件 ⇒ 载体缺席", () => {
    const dir = makeRepo()
    execFileSync("git", ["add", "scripts/real.ts"], { cwd: dir })
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir })
    const tracked = execFileSync("git", ["ls-files", "--error-unmatch", "--", "scripts/real.ts"], {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim()
    expect(tracked.length).toBeGreaterThan(0)
    let failed = false
    try {
      execFileSync("git", ["ls-files", "--error-unmatch", "--", "scripts/untracked.ts"], {
        cwd: dir,
        stdio: ["ignore", "pipe", "ignore"],
      })
    } catch {
      failed = true
    }
    expect(failed).toBe(true)
  })

  test("symlink ⇒ 视作缺席", () => {
    const dir = makeRepo()
    symlinkSync(path.join(dir, "scripts", "real.ts"), path.join(dir, "scripts", "link.ts"))
    const { lstatSync } = require("node:fs")
    expect(lstatSync(path.join(dir, "scripts", "link.ts")).isSymbolicLink()).toBe(true)
  })
})
