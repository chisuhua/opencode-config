/**
 * commit-gate —— **层 1b 纯逻辑单测**（`docs/adr/ADR-commit-verification-gate.md` D2 / D5）
 *
 * 覆盖两块：① **命令识别矩阵**（ADR D5 的解析口径 + 闭口）；② **三判据组合**（D2）。
 * ⚠ fixture 硬规则：独立父目录（`mkdtempSync`）、**禁读真实 HOME**、真实文件形状。
 */
import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  DECLARATION_REL,
  checkCommitForm,
  detectCommitInvocation,
  evaluateCommitGate,
  readDeclaration,
  tokenizeCommand,
} from "../lib/commit-gate.ts"

function makeRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "cg-"))
  mkdirSync(path.join(root, ".rddf"), { recursive: true })
  return root
}

// ════════════════════════════════════════════════════════
// D5 命令识别矩阵
// ════════════════════════════════════════════════════════
describe("D5 命令识别：命中 commit 的形态", () => {
  const hits = [
    "git commit",
    "git commit -m 'fix: x'",
    "git -c user.name=x commit -m 'x'",
    "git -C /tmp/x commit -m 'x'",
    "GIT_AUTHOR_NAME=x git commit -m 'x'",
    "git commit --no-verify -m 'x'",
    "git --git-dir /tmp/x commit -m 'x'",
    "git --git-dir=/tmp/x commit -m 'x'",
    "git --work-tree /tmp/x commit -m 'x'",
    "git --namespace ns commit -m 'x'",
    "git commit -m 'x' --author 'A <a@b>'",
  ]
  for (const cmd of hits) {
    test(`命中：${cmd}`, () => {
      const r = detectCommitInvocation(cmd)
      expect(r.isCommit, `未识别为 commit：${cmd}`).toBe(true)
      expect(r.block, `不应被闭口拦下：${cmd}`).toBeUndefined()
    })
  }
})

describe("D5 命令识别：不应命中的形态（防误伤）", () => {
  const misses = [
    "git status",
    "git log --grep commit",
    "git config commit.gpgsign true",
    "git commit-tree abc123",
    "git diff --cached",
    'echo "git commit"',
    "ls -la",
    "bun test tests/",
  ]
  for (const cmd of misses) {
    test(`不命中：${cmd}`, () => {
      const r = detectCommitInvocation(cmd)
      expect(r.isCommit, `误判为 commit：${cmd}`).toBe(false)
      expect(r.block, `不应拦下：${cmd}`).toBeUndefined()
    })
  }
})

describe("D5⑦ 提交形态闭口（实际内容集 ≠ 暂存区 ⇒ 拒）", () => {
  const closed = [
    "git commit -a",
    "git commit --all",
    "git commit --only src/a.ts",
    "git commit -o src/a.ts",
    "git commit --include src/a.ts",
    "git commit -i src/a.ts",
    "git commit --pathspec-from-file=list.txt",
    "git commit src/a.ts",
    "git commit -- src/a.ts",
    "git commit -am 'x'",
    "git commit -a -m 'x'",
    "git commit -m 'x' --all",
  ]
  for (const cmd of closed) {
    test(`闭口：${cmd}`, () => {
      const r = detectCommitInvocation(cmd)
      expect(r.isCommit, `应识别为 commit：${cmd}`).toBe(true)
      expect(r.block, `未被闭口拦下：${cmd}`).toBeTruthy()
    })
  }
})

describe("D5⑧ 复合命令闭口（**只有 commit 之前改过 index 的段**才拒）", () => {
  test("`git add -A && git commit -m x` ⇒ 拒（前置段改了 index ⇒ 内容集不可判定）", () => {
    const r = detectCommitInvocation("git add -A && git commit -m 'x'")
    expect(r.isCommit).toBe(true)
    expect(r.block).toContain("之前")
  })
  test("`git status && ls` ⇒ 不命中", () => {
    expect(detectCommitInvocation("git status && ls").isCommit).toBe(false)
  })

  // ⚠ 层 2 实测的**假阳性**坑：模型最常见的写法是 `git commit -m x; echo "exit=$?"`
  //   ⇒ 尾随段**无害**（不改 index）⇒ 不得拦（否则合法提交被拦，模型会去找绕路写法）。
  test("`git commit -m x; echo \"exit=$?\"` ⇒ 命中 commit 但**不拦**（尾随段无害）", () => {
    const r = detectCommitInvocation('git commit -m x; echo "exit=$?"')
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeUndefined()
  })
  test("`git commit -m x && echo done` ⇒ 命中 commit 但**不拦**", () => {
    const r = detectCommitInvocation("git commit -m x && echo done")
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeUndefined()
  })
  test("`git add . && git commit` ⇒ 拒（前置 add 改了 index）", () => {
    expect(detectCommitInvocation("git add . && git commit").block).toBeTruthy()
  })
  test("`git commit -m x; git add -A; git commit -m y` ⇒ 拒（**第二个** commit 段之前改过 index）", () => {
    const r = detectCommitInvocation("git commit -m x; git add -A; git commit -m y")
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeTruthy()
  })
  test("`git commit -m x; echo done; git commit --amend` ⇒ 不拦（两段都没改 index）", () => {
    const r = detectCommitInvocation("git commit -m x; echo done; git commit --amend")
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeUndefined()
  })
  test("元字符紧贴时也要独立成 token（`x;` ⇒ [x][;]）", () => {
    const toks = tokenizeCommand("git commit -m x; echo hi").map((t) => t.value)
    expect(toks).toEqual(["git", "commit", "-m", "x", ";", "echo", "hi"])
  })
})

describe("D5⑥ fail-closed 兜底（解析不出子命令 ⇒ 拒，不静默放行）", () => {
  test("只有 `git` 没有子命令 ⇒ 拒", () => {
    const r = detectCommitInvocation("git")
    expect(r.isCommit).toBe(true)
    expect(r.block).toContain("无法解析")
  })
  test("空命令 ⇒ 拒", () => {
    const r = detectCommitInvocation("")
    expect(r.isCommit).toBe(false)
    expect(r.block).toBeTruthy()
  })
})

describe("分词（引号感知 ⇒ `echo \"git commit\"` 不是一个 git 调用）", () => {
  test("引号内空格不拆词", () => {
    const t = tokenizeCommand('echo "git commit"')
    expect(t.map((x) => x.value)).toEqual(["echo", "git commit"])
  })
  test("单引号同理", () => {
    expect(tokenizeCommand("echo 'git commit'").map((x) => x.value)).toEqual(["echo", "git commit"])
  })
  test("闭口检查只看 commit 之后的 token（消息文本不算 pathspec）", () => {
    // `git commit -m 'src/a.ts'` ⇒ `-m` 的值是消息，**不是**位置 pathspec
    const tokens = tokenizeCommand("git commit -m 'src/a.ts'")
    const idx = tokens.findIndex((t) => t.value === "commit")
    expect(checkCommitForm(tokens, idx)).toBeUndefined()
  })
})

// ════════════════════════════════════════════════════════
// D2 三判据组合
// ════════════════════════════════════════════════════════
const DECL = { verify_commands: [["true"]] }

describe("D2 三判据组合", () => {
  test("全绿 ⇒ 放行", () => {
    const r = evaluateCommitGate({
      declaration: DECL,
      stagedFiles: ["/w/a.ts"],
      stagedState: "has",
      writeSetViolations: [],
      verification: { ok: true },
    })
    expect(r.allowed).toBe(true)
  })

  test("① 验证红 ⇒ 拒（reason 含失败命令 + 输出尾部）", () => {
    const r = evaluateCommitGate({
      declaration: DECL,
      stagedFiles: ["/w/a.ts"],
      stagedState: "has",
      writeSetViolations: [],
      verification: { ok: false, failedCommand: ["bun", "test"], outputTail: "3 fail" },
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain("bun test")
    expect(r.reason).toContain("3 fail")
  })

  test("② 暂存区为空 ⇒ 拒", () => {
    const r = evaluateCommitGate({
      declaration: DECL,
      stagedFiles: [],
      stagedState: "empty",
      writeSetViolations: [],
      verification: { ok: true },
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain("暂存区为空")
  })

  test("② 暂存区**判定失败**（退出码 ≥2）⇒ 拒（fail-closed，不得放行）", () => {
    const r = evaluateCommitGate({
      declaration: DECL,
      stagedFiles: [],
      stagedState: "failed",
      writeSetViolations: [],
      verification: { ok: true },
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain("fail-closed")
  })

  test("③ 暂存内容越角色写集 ⇒ 拒（reason 指名文件）", () => {
    const r = evaluateCommitGate({
      declaration: DECL,
      stagedFiles: ["/w/src/a.ts"],
      stagedState: "has",
      writeSetViolations: [{ file: "src/a.ts", reason: "角色「architect」禁止写 src/**" }],
      verification: { ok: true },
    })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain("src/a.ts")
  })

  test("**无声明 ⇒ 放行**（其它仓库零影响）", () => {
    const r = evaluateCommitGate({
      declaration: null,
      stagedFiles: [],
      stagedState: "empty",
      writeSetViolations: [{ file: "x", reason: "越界" }],
      verification: { ok: false },
    })
    expect(r.allowed).toBe(true)
  })
})

describe("声明读取（未声明 ⇒ 不设门禁）", () => {
  test("缺失 ⇒ null", () => {
    const repo = makeRepo()
    expect(readDeclaration(repo).decl).toBeNull()
  })

  test("损坏 JSON ⇒ null + error", () => {
    const repo = makeRepo()
    writeFileSync(path.join(repo, DECLARATION_REL), "{ broken")
    const r = readDeclaration(repo)
    expect(r.decl).toBeNull()
    expect(r.error).toContain("解析失败")
  })

  test("verify_commands 为空 ⇒ null + error（不得视作「门禁通过」）", () => {
    const repo = makeRepo()
    writeFileSync(path.join(repo, DECLARATION_REL), JSON.stringify({ verify_commands: [] }))
    const r = readDeclaration(repo)
    expect(r.decl).toBeNull()
    expect(r.error).toBeTruthy()
  })

  test("形状非法（非 argv 数组）⇒ null + error", () => {
    const repo = makeRepo()
    writeFileSync(path.join(repo, DECLARATION_REL), JSON.stringify({ verify_commands: ["bun test"] }))
    const r = readDeclaration(repo)
    expect(r.decl).toBeNull()
    expect(r.error).toContain("形状非法")
  })

  test("合法声明 ⇒ 读出", () => {
    const repo = makeRepo()
    writeFileSync(
      path.join(repo, DECLARATION_REL),
      JSON.stringify({ verify_commands: [["bun", "test", "tests/"]], timeout_ms: 1000 }),
    )
    const r = readDeclaration(repo)
    expect(r.decl?.verify_commands).toEqual([["bun", "test", "tests/"]])
    expect(r.error).toBeUndefined()
  })
})
