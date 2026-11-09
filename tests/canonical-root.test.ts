/**
 * canonical-root-normalization 的验收测试（ADR Verification 1–12 / AC1–AC18）。
 *
 * 重点：用**真实构造**的 git 结构（主仓 / linked worktree / submodule）验证归一，
 * 不用 mock 代替（AC 证据规则 3）。
 */
import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import path from "node:path"

import { canonicalRoot, gitStatusPaths, lookupPair, registerSession, scopeEditRules } from "../lib/delegate-core.ts"

const TMP = mkdtempSync(path.join(tmpdir(), "canonical-root-test-"))

const git = (args: string[], cwd: string) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

function initRepo(name: string): string {
  const dir = path.join(TMP, name)
  mkdirSync(dir, { recursive: true })
  git(["init", "-q"], dir)
  writeFileSync(path.join(dir, "a.txt"), "a\n")
  git(["add", "-A"], dir)
  git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], dir)
  return dir
}

afterAll(() => rmSync(TMP, { recursive: true, force: true }))

// ─────────────────── AC1 / AC5：非 worktree 场景零行为变化 ───────────────────

describe("AC1 主仓：stateRoot == workRoot，零行为变化", () => {
  test("主仓两根都在仓库根", () => {
    const repo = initRepo("main-a")
    const r = canonicalRoot(repo)
    expect(r.vcs).toBe(true)
    expect(r.stateRoot).toBe(path.resolve(repo))
    expect(r.workRoot).toBe(path.resolve(repo))
    expect(r.stateRoot).toBe(r.workRoot)
  })

  test("从子目录调用仍归到仓库根（两根相同）", () => {
    const repo = initRepo("main-sub")
    const sub = path.join(repo, "deep", "nested")
    mkdirSync(sub, { recursive: true })
    const r = canonicalRoot(sub)
    expect(r.stateRoot).toBe(path.resolve(repo))
    expect(r.workRoot).toBe(path.resolve(repo))
  })
})

describe("AC5 非 git 目录：两根都回退到目录本身，vcs=false", () => {
  test("plain dir", () => {
    const plain = path.join(TMP, "plain-x")
    mkdirSync(plain, { recursive: true })
    const r = canonicalRoot(plain)
    expect(r.vcs).toBe(false)
    expect(r.stateRoot).toBe(path.resolve(plain))
    expect(r.workRoot).toBe(path.resolve(plain))
  })
})

// ─────────────────── AC2 / AC3：linked worktree ───────────────────

describe("AC2/AC3 linked worktree：stateRoot=主仓、workRoot=worktree", () => {
  test("两根分离，且各自用途正确", () => {
    const main = initRepo("wt-main")
    const wt = path.join(TMP, "wt-linked")
    git(["worktree", "add", "-q", wt, "-b", "feat"], main)

    const r = canonicalRoot(wt)
    expect(r.vcs).toBe(true)
    // AC2：状态根归到主仓
    expect(r.stateRoot).toBe(path.resolve(main))
    // AC3：工作根是 worktree 本身
    expect(r.workRoot).toBe(path.resolve(wt))
    expect(r.stateRoot).not.toBe(r.workRoot)
  })

  test("AC2 worktree 里登记 → pair.json 落在主仓（不在 worktree 副本）", () => {
    const main = initRepo("wt-main2")
    const wt = path.join(TMP, "wt-reg")
    git(["worktree", "add", "-q", wt, "-b", "feat2"], main)

    const r = canonicalRoot(wt)
    registerSession(r.stateRoot, "ses_wt", "ses_front", "build")

    const mainPair = path.join(main, ".rddf", "state", "pair.json")
    const wtPair = path.join(wt, ".rddf", "state", "pair.json")
    expect(existsSync(mainPair)).toBe(true)
    // 归一前的 bug 会把状态写进 worktree 副本
    expect(existsSync(wtPair)).toBe(false)
    const pair = JSON.parse(readFileSync(mainPair, "utf8"))
    expect(pair.pairs["ses_wt"]).toBeDefined()
    // AC12：新登记只写 stateRoot
    expect(pair.pairs["ses_wt"].canonical_root).toBe(path.resolve(main))
  })

  test("AC3 worktree 内变更在 workRoot 跑 git status 可见（artifacts 不恒 0）", () => {
    const main = initRepo("wt-main3")
    const wt = path.join(TMP, "wt-status")
    git(["worktree", "add", "-q", wt, "-b", "feat3"], main)

    const r = canonicalRoot(wt)
    // 在 worktree 里改一个文件
    writeFileSync(path.join(wt, "a.txt"), "changed\n")

    const inWork = gitStatusPaths(r.workRoot)
    const inState = gitStatusPaths(r.stateRoot)
    expect(inWork).toContain("a.txt")
    // 在主仓跑数不到 worktree 的变更 —— 这就是 artifacts 恒 0 的根因
    expect(inState).not.toContain("a.txt")
  })
})

// ─────────────────── AC4：submodule ───────────────────

describe("AC4 submodule：stateRoot 归到 superproject 工作树", () => {
  test("submodule 工作树内不归到 .git/modules", () => {
    const subSrc = initRepo("sm-src")
    const superDir = initRepo("sm-super")
    git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", subSrc, "vendor/sub"], superDir)
    git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "addsub"], superDir)

    const subWt = path.join(superDir, "vendor", "sub")
    const r = canonicalRoot(subWt)
    expect(r.vcs).toBe(true)
    // 关键在于不能是 .git/modules/...
    expect(r.stateRoot).not.toContain(".git/modules")
    expect(r.stateRoot).toBe(path.resolve(superDir))
    // 工作根仍是 submodule 自己的工作树
    expect(r.workRoot).toBe(path.resolve(subWt))
  })
})

// ─────────────────── AC6：三用途的逐点绑定 ───────────────────

describe("AC6 scope 解析基准 = workRoot", () => {
  test("worktree 下 scope 相对路径以 worktree 为基", () => {
    const main = initRepo("sc-main")
    const wt = path.join(TMP, "sc-wt")
    git(["worktree", "add", "-q", wt, "-b", "scfeat"], main)
    const r = canonicalRoot(wt)

    const rules = scopeEditRules(r.workRoot, ["src"])
    const allow = rules.filter((x) => x.effect === "allow").map((x) => x.resource)
    expect(allow).toContain("src")
    expect(allow).toContain("src/*")
  })
})

// ─────────────────── AC7 / AC18：gitRunner 注入（版本回退路径） ───────────────────

describe("AC7/AC18 git 版本回退：可注入 gitRunner", () => {
  test("--path-format 不支持时回退到裸 common-dir（以调用 cwd 为基准）", () => {
    const repo = initRepo("fallback-a")
    const calls: string[][] = []
    const runner = (args: string[], cwd: string) => {
      calls.push(args)
      // 模拟 git < 2.31：--path-format 报未知选项
      if (args.includes("--path-format=absolute")) throw new Error("unknown option")
      if (args.includes("--show-superproject-working-tree")) return ""
      if (args.includes("--show-toplevel")) return git(["rev-parse", "--show-toplevel"], cwd)
      // 裸 --git-common-dir 在主仓返回相对路径 ".git"
      if (args.includes("--git-common-dir")) return ".git"
      return ""
    }
    const r = canonicalRoot(repo, runner)
    expect(r.stateRoot).toBe(path.resolve(repo))
    expect(r.workRoot).toBe(path.resolve(repo))
    // 确认确实走了回退分支（先试 --path-format，再试裸命令）
    expect(calls.some((c) => c.includes("--path-format=absolute"))).toBe(true)
    expect(calls.some((c) => c.includes("--git-common-dir") && !c.includes("--path-format=absolute"))).toBe(true)
  })

  test("AC18 默认 runner 与自定义 runner 结果一致（主仓场景）", () => {
    const repo = initRepo("runner-same")
    const def = canonicalRoot(repo)
    const custom = canonicalRoot(repo, (args, cwd) => git(args, cwd))
    expect(custom.stateRoot).toBe(def.stateRoot)
    expect(custom.workRoot).toBe(def.workRoot)
  })
})

// ─────────────────── AC8 / AC9 / AC10 / AC13：读回退与双值接受 ───────────────────

describe("AC8 读回退：存量 pair.json 在 workRoot 时仍可命中", () => {
  test("stateRoot 查不到 → 回退到 workRoot 命中", () => {
    const main = initRepo("fb-main")
    const wt = path.join(TMP, "fb-wt")
    git(["worktree", "add", "-q", wt, "-b", "fbfeat"], main)

    const r = canonicalRoot(wt)
    // 模拟归一前的存量：pair.json 物理写在 worktree 副本，canonical_root 是 worktree 路径
    mkdirSync(path.join(wt, ".rddf", "state"), { recursive: true })
    writeFileSync(
      path.join(wt, ".rddf", "state", "pair.json"),
      JSON.stringify({
        version: "pair-v2",
        pairs: { ses_old: { canonical_root: path.resolve(wt), agent: "build", kind: "engineering" } },
      }),
    )

    // 只查 stateRoot → 查不到（旧行为会判"未登记"）
    expect(lookupPair(r.stateRoot, "ses_old")).toBeUndefined()
    // 带 fallback → 命中（AC8）
    const hit = lookupPair(r.stateRoot, "ses_old", r.workRoot)
    expect(hit).toBeDefined()
    expect(hit.canonical_root).toBe(path.resolve(wt))
  })
})

describe("AC9 双值接受 / AC13 跨仓冒充不成立", () => {
  test("canonical_root 等于 workRoot（而非 stateRoot）时通过", () => {
    const main = initRepo("dv-main")
    const wt = path.join(TMP, "dv-wt")
    git(["worktree", "add", "-q", wt, "-b", "dvfeat"], main)
    const r = canonicalRoot(wt)

    const entry = { canonical_root: path.resolve(wt) } // 存量口径
    const accept = entry.canonical_root === r.stateRoot || entry.canonical_root === r.workRoot
    expect(accept).toBe(true)
  })

  test("AC13 跨仓路径两者都不等于 → 拒", () => {
    const main = initRepo("dv-main2")
    const other = initRepo("dv-other")
    const wt = path.join(TMP, "dv-wt2")
    git(["worktree", "add", "-q", wt, "-b", "dvfeat2"], main)
    const r = canonicalRoot(wt)

    const entry = { canonical_root: path.resolve(other) } // 另一个仓库
    const accept = entry.canonical_root === r.stateRoot || entry.canonical_root === r.workRoot
    expect(accept).toBe(false)
  })
})

describe("AC10 读回退的覆盖面如实（只覆盖同一 worktree）", () => {
  test("从另一个 worktree 回来 → 仍未登记（如实失败，不伪装成功）", () => {
    const main = initRepo("cv-main")
    const wtA = path.join(TMP, "cv-wtA")
    const wtB = path.join(TMP, "cv-wtB")
    git(["worktree", "add", "-q", wtA, "-b", "cvA"], main)
    git(["worktree", "add", "-q", wtB, "-b", "cvB"], main)

    // 存量条目只在 wtA
    mkdirSync(path.join(wtA, ".rddf", "state"), { recursive: true })
    writeFileSync(
      path.join(wtA, ".rddf", "state", "pair.json"),
      JSON.stringify({ version: "pair-v2", pairs: { ses_a: { canonical_root: path.resolve(wtA) } } }),
    )

    const fromA = canonicalRoot(wtA)
    const fromB = canonicalRoot(wtB)

    // 从 wtA 回来 → 成功（stateRoot 未命中 → 回退 workRoot=wtA 命中）
    expect(lookupPair(fromA.stateRoot, "ses_a", fromA.workRoot)).toBeDefined()
    // 从 wtB 回来 → stateRoot 未命中，回退 workRoot=wtB 也未命中 → 如实失败
    expect(lookupPair(fromB.stateRoot, "ses_a", fromB.workRoot)).toBeUndefined()
    // 从主仓回来 → 同样失败
    const fromMain = canonicalRoot(main)
    expect(lookupPair(fromMain.stateRoot, "ses_a", fromMain.workRoot)).toBeUndefined()
  })
})

describe("AC11 存量条目随使用迁移到 stateRoot", () => {
  test("从原 worktree resume 成功并 upsert 后，stateRoot 出现该条目", () => {
    const main = initRepo("mg-main")
    const wt = path.join(TMP, "mg-wt")
    git(["worktree", "add", "-q", wt, "-b", "mgfeat"], main)
    const r = canonicalRoot(wt)

    // 存量在 worktree
    mkdirSync(path.join(wt, ".rddf", "state"), { recursive: true })
    writeFileSync(
      path.join(wt, ".rddf", "state", "pair.json"),
      JSON.stringify({ version: "pair-v2", pairs: { ses_mig: { canonical_root: path.resolve(wt) } } }),
    )
    expect(existsSync(path.join(main, ".rddf", "state", "pair.json"))).toBe(false)

    // 回退命中后 upsert 到 stateRoot
    expect(lookupPair(r.stateRoot, "ses_mig", r.workRoot)).toBeDefined()
    registerSession(r.stateRoot, "ses_mig", "ses_front", "build")

    const mainPair = JSON.parse(readFileSync(path.join(main, ".rddf", "state", "pair.json"), "utf8"))
    expect(mainPair.pairs["ses_mig"]).toBeDefined()
    expect(mainPair.pairs["ses_mig"].canonical_root).toBe(path.resolve(main))
  })
})
