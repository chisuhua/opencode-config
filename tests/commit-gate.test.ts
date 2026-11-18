/**
 * commit-gate —— **层 1b 纯逻辑单测**（`docs/adr/ADR-commit-verification-gate.md` D2 / D5）
 *
 * 覆盖：① **命令识别矩阵**（ADR D5 的解析口径 + 提交形态闭口 + 必须单独成段 + 命令替换 + 判定对象可定位）；
 * ② **三判据组合**（D2）。
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
    "GIT_AUTHOR_NAME=x git commit -m 'x'",
    "git commit --no-verify -m 'x'",
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

describe("D5 命令词与兜底扫描（引号命令词 / 不把字面量当命令）", () => {
  test('`"git" commit -m x` ⇒ 识别为 commit（引号包住的命令词也是命令词）', () => {
    const r = detectCommitInvocation('"git" commit -m x')
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeUndefined()
  })
  test("`echo git commit` ⇒ 不命中（字面量不是命令词）", () => {
    expect(detectCommitInvocation("echo git commit").isCommit).toBe(false)
  })
  // ⚠ 第 6 轮的两条 fail-open 回归
  test("`git commit -F - <<'MSG' && git push --force origin main` ⇒ 拒（标记行**尾部**是命令）", () => {
    const cmd = "git commit -F - <<'MSG' && git push --force origin main\nfix: x\nMSG"
    const r = detectCommitInvocation(cmd)
    expect(r.isCommit).toBe(true)
    expect(r.block).toContain("单独成段")
  })
  test("`git commit -F - <<'MSG' ; git push --force origin main` ⇒ 拒（另一分隔符形态）", () => {
    const cmd = "git commit -F - <<'MSG' ; git push --force origin main\nfix: x\nMSG"
    expect(detectCommitInvocation(cmd).block).toBeTruthy()
  })
  test("`GIT_AUTHOR_NAME=\"x\" git commit -m \"y\"` ⇒ 识别为 commit（值带引号的赋值前缀）", () => {
    const r = detectCommitInvocation('GIT_AUTHOR_NAME="x" git commit -m "y"')
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeUndefined()
  })
  test('`"sudo" git commit -m x` ⇒ 拒（引号包住的包装命令仍是包装命令）', () => {
    const r = detectCommitInvocation('"sudo" git commit -m x')
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeTruthy()
  })
  test('`VAR="a b" timeout 10 git commit` ⇒ 拒（引号值 + 包装命令）', () => {
    const r = detectCommitInvocation('VAR="a b" timeout 10 git commit')
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeTruthy()
  })
  test("`git commit -m x &\n` / `git commit -m x &;` ⇒ 拒（末位 `&` 后可跟纯分隔符）", () => {
    expect(detectCommitInvocation("git commit -m x &\n").block).toContain("单独成段")
    expect(detectCommitInvocation("git commit -m x &;").block).toContain("单独成段")
  })
  test("`git commit -m x &> /dev/null` ⇒ 放行（`&>` 是重定向，不是后台执行）", () => {
    expect(detectCommitInvocation("git commit -m x &> /dev/null").block).toBeUndefined()
  })
  test("`git commit -F - <<'MSG' … MSG` ⇒ 放行（heredoc 正文是数据）", () => {
    const cmd = "git commit -F - <<'MSG'\nfix: x\n\nbody\nMSG"
    const r = detectCommitInvocation(cmd)
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeUndefined()
  })
  test("heredoc 正文里的 `git commit` ⇒ 不命中（数据不是命令）", () => {
    const cmd = "cat > /tmp/x.md <<EOF\nplease git commit -m oops\nEOF"
    expect(detectCommitInvocation(cmd).isCommit).toBe(false)
  })
})

describe("D5⑩ 判定对象可定位（换仓 / 包装命令 ⇒ 拒，不得跳过）", () => {
  const relocated = [
    "git -C /tmp/x commit -m 'x'",
    "git -C/tmp/x commit -m 'x'",
    "git --git-dir /tmp/x commit -m 'x'",
    "git --git-dir=/tmp/x commit -m 'x'",
    "git --work-tree /tmp/x commit -m 'x'",
    "GIT_DIR=/tmp/x/.git git commit -m 'x'",
    "GIT_WORK_TREE=/tmp/x git commit -m 'x'",
    "GIT_INDEX_FILE=/tmp/i git commit -m 'x'",
    "sudo git commit -m 'x'",
    "sudo -u u git commit -m 'x'",
    "env X=1 git commit -m 'x'",
    "nohup git commit -m 'x'",
    "timeout 10 git commit -m 'x'",
    "exec git commit -m 'x'",
  ]
  for (const cmd of relocated) {
    test(`拒（换仓 / 包装）：${cmd}`, () => {
      const r = detectCommitInvocation(cmd)
      expect(r.isCommit, `未识别为 commit ⇒ fail-open：${cmd}`).toBe(true)
      expect(r.block, `未拦下：${cmd}`).toBeTruthy()
    })
  }
  test("`git --namespace ns commit` ⇒ 不拦（namespace 不换仓）", () => {
    expect(detectCommitInvocation("git --namespace ns commit -m 'x'").block).toBeUndefined()
  })
})

describe("D5⑨ 命令替换（内容不可静态判定 ⇒ 拒）", () => {
  const subs = [
    'git commit -m "$(cat msg.txt)"',
    'git commit -m "$(git log -1 --format=%s)"',
    'git commit -m "`date`"',
    'git commit -m "$(cat <<EOF\nx\nEOF\n)"',
    "git commit -m x > >(tee /tmp/log)",
  ]
  for (const cmd of subs) {
    test(`拒（命令替换）：${cmd}`, () => {
      const r = detectCommitInvocation(cmd)
      expect(r.isCommit).toBe(true)
      expect(r.block).toBeTruthy()
    })
  }
  test("单引号内是字面量 ⇒ 不拦", () => {
    expect(detectCommitInvocation("git commit -m 'literal $(x)'").block).toBeUndefined()
  })
  test("`$HOME`（非 `$(`）⇒ 不拦", () => {
    expect(detectCommitInvocation('git commit -m "in $HOME"').block).toBeUndefined()
  })
  test("`\\$(x)`（转义）⇒ 不拦", () => {
    expect(detectCommitInvocation('git commit -m "esc \\$(x)"').block).toBeUndefined()
  })
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

describe("D5⑧ commit 必须单独成段（任一段是 commit ⇒ 拒）", () => {
  const compounds = [
    "git add -A && git commit -m 'x'",
    'git commit -m x; echo "exit=$?"',
    "git commit -m x && echo done",
    "git commit -m x; echo done; git commit --amend",
    "git commit -m x && git status",
    "git commit -m x; git push --force origin main",
    "git commit -m x && git push origin main",
    "git commit -m x; git branch -D feature",
    "git commit -m x; cat .env",
    "git commit -m x | tee /tmp/log",
    "cd /other/repo && git commit -m x",
    "git commit -m x\ngit push --force origin main",
    "git status | git commit -m x",
  ]
  for (const cmd of compounds) {
    test(`拒（复合）：${JSON.stringify(cmd)}`, () => {
      const r = detectCommitInvocation(cmd)
      expect(r.isCommit, `未识别为 commit：${cmd}`).toBe(true)
      expect(r.block, `未拦下：${cmd}`).toBeTruthy()
    })
  }
  // ⚠ 末位分隔符 = **空命令**（语义与裸提交等价）⇒ 放行；段分隔符 token 不得泄漏进单段判定
  test("`git commit -m x;` ⇒ 放行（末位 `;` 只是空命令）", () => {
    const r = detectCommitInvocation("git commit -m x;")
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeUndefined()
  })
  test("`git commit -m x\n` ⇒ 放行（末位换行只是空命令）", () => {
    expect(detectCommitInvocation("git commit -m x\n").block).toBeUndefined()
  })
  test("`\ngit commit -m x` ⇒ 放行（首行换行只是空命令）", () => {
    expect(detectCommitInvocation("\ngit commit -m x").block).toBeUndefined()
  })
  test("`git commit -m x &` ⇒ 拒（后台执行 ⇒ 退出码不反映提交结果），且文案含「单独成段」", () => {
    const r = detectCommitInvocation("git commit -m x &")
    expect(r.isCommit).toBe(true)
    expect(r.block).toContain("单独成段")
  })
  test("`git status && ls` ⇒ 不命中", () => {
    expect(detectCommitInvocation("git status && ls").isCommit).toBe(false)
  })
  // 重定向**不是**段分隔符（层 2 实测：`git commit … > /dev/null 2>&1` 是模型常用写法）
  test("`git commit -m x > /dev/null 2>&1` ⇒ 不拦（重定向被剥离）", () => {
    expect(detectCommitInvocation("git commit -m x > /dev/null 2>&1").block).toBeUndefined()
  })
  test("`git commit -m x 2>/dev/null` ⇒ 不拦（`2` 是 fd 前缀，不算 pathspec）", () => {
    expect(detectCommitInvocation("git commit -m x 2>/dev/null").block).toBeUndefined()
  })
  test("`(git commit -m x)` ⇒ 不拦（子 shell 前缀，无段分隔符）", () => {
    const r = detectCommitInvocation("(git commit -m x)")
    expect(r.isCommit).toBe(true)
    expect(r.block).toBeUndefined()
  })
  test("元字符紧贴时也要独立成 token（`x;` ⇒ [x][;]）", () => {
    const toks = tokenizeCommand("git commit -m x; echo hi").map((t) => t.value)
    expect(toks).toEqual(["git", "commit", "-m", "x", ";", "echo", "hi"])
  })
  test("换行也独立成 token", () => {
    expect(tokenizeCommand("git commit -m x\necho hi").map((t) => t.value)).toEqual([
      "git",
      "commit",
      "-m",
      "x",
      "\n",
      "echo",
      "hi",
    ])
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
