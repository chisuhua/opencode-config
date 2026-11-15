/**
 * verifier-baseline-worktree-diff（AC1–AC4）：基线对照的**判别力**判据。
 *
 * ⚠ **为什么这组判据是本 change 的核心**：旧命令 `git diff --name-only <base>...HEAD` 是
 * **三点 diff（只比已提交）**，而本仓后端**被禁止 commit** ⇒ 被取证的 change 通常处于
 * **未提交**状态 ⇒ 该 diff **恒为空** ⇒ 「取证对象是否被本 change 触及」永远得到「未触及」
 * ⇒ **基线对照在真实用法下没有判别力**。
 *
 * ⇒ 这里用**真 git fixture**（不 mock）证明：新命令（两点 diff）**有判别力**、旧命令**失效**。
 */
import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const TMP = mkdtempSync(path.join(tmpdir(), "verifier-baseline-test-"))

/** 真 git fixture：基线提交含 `a.txt` + `b.txt`。 */
function gitRepo(name: string): string {
  const dir = path.join(TMP, name)
  mkdirSync(dir, { recursive: true })
  execFileSync("git", ["init", "-q"], { cwd: dir })
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir })
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir })
  writeFileSync(path.join(dir, "a.txt"), "a\n")
  writeFileSync(path.join(dir, "b.txt"), "b\n")
  execFileSync("git", ["add", "-A"], { cwd: dir })
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir })
  return dir
}

const gitOut = (repo: string, args: string[]): string[] =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

describe("verifier-baseline-worktree-diff：基线对照的判别力（真 git）", () => {
  test("AC1：有判别力 —— 工作树改了 a.txt（**未 commit**）⇒ 两点 diff 列出它；三点 diff 为空（旧命令失效的证据）", () => {
    const repo = gitRepo("ac1")
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim()

    // 工作树改写 a.txt，**不 commit**（= 本仓后端的真实交付形态）
    writeFileSync(path.join(repo, "a.txt"), "a-changed\n")

    // ① 新命令（两点：基线 ↔ 工作树）**必须**列出 a.txt
    expect(gitOut(repo, ["diff", "--name-only", base]), "两点 diff 必须列出未提交改动的 a.txt").toEqual(["a.txt"])
    // ② 旧命令（三点：只比已提交）**必须为空** —— 这就是「基线对照无判别力」的证据
    expect(gitOut(repo, ["diff", "--name-only", `${base}...HEAD`]), "三点 diff 在未提交工作树下恒为空（旧命令失效）").toEqual([])
  })

  test("AC2：不误报 —— 工作树未改的文件不得出现在两点 diff 里", () => {
    const repo = gitRepo("ac2")
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim()
    writeFileSync(path.join(repo, "a.txt"), "a-changed\n")
    const changed = gitOut(repo, ["diff", "--name-only", base])
    expect(changed).toContain("a.txt")
    expect(changed, "未改动的 b.txt 不得被误报").not.toContain("b.txt")
  })

  test("AC3：未跟踪文件不在 `git diff` 里，但 `ls-files --others` 能列出（⇒ 纪律必须并列两路）", () => {
    const repo = gitRepo("ac3")
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim()
    writeFileSync(path.join(repo, "new-file.txt"), "new\n")
    expect(gitOut(repo, ["diff", "--name-only", base]), "git diff 不含未跟踪文件").not.toContain("new-file.txt")
    expect(gitOut(repo, ["ls-files", "--others", "--exclude-standard"]), "未跟踪文件走 ls-files --others 那一路").toContain("new-file.txt")
  })

  test("AC4：基线侧可重演 —— 工作树改写 a.txt 后，`git show <base>:a.txt` 仍返回**基线版本**", () => {
    const repo = gitRepo("ac4")
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim()
    writeFileSync(path.join(repo, "a.txt"), "a-changed\n")
    const baseline = execFileSync("git", ["show", `${base}:a.txt`], { cwd: repo, encoding: "utf8" })
    expect(baseline, "基线侧必须返回提交内容（内容类取证的根）").toBe("a\n")
    expect(baseline).not.toBe("a-changed\n")
  })
})
