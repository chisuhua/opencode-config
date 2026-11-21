/**
 * rollback-drill（回滚可达性）的测试
 *
 * ## 覆盖三层
 *
 *   ① **纯逻辑**（`lib/rollback-drill.ts`）：schema 校验 / 路径安全 / `find` 唯一性 / 部分应用禁止 / 环境准备；
 *   ② **CLI 行为**（`scripts/rollback-drill.ts`）：退出码 0 / 1 / 2 与「嵌套拒绝」；
 *   ③ **判别力（负向）**：**少删一件**、**`find` 漂移**、**验证命令红**都必须让 drill 失败 ——
 *      否则「回滚完就绿」是自证，证明不了可达性。
 *
 * ⚠ 本文件**不**跑真实套件（那需要 clone + `bun test tests/` ≈ 30s，且会在 clone 里递归包含本文件）。
 *   真实演练用 `bun scripts/rollback-drill.ts .rddf/rollback/commit-gate.json`（⚠ `package.json` 是 gitignored ⇒ 无 npm script）；递归防护见脚本里的 `ROLLBACK_DRILL_CHILD`。
 */
import { afterAll, describe, expect, test } from "bun:test"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  DrillError,
  applyDrill,
  countOccurrences,
  parseManifest,
  planDrill,
  seedDrillEnv,
  verifyCommands,
  type Manifest,
} from "../lib/rollback-drill.ts"

const SCRIPT = path.join(import.meta.dir, "..", "scripts", "rollback-drill.ts")
const TMP: string[] = []

function tmpDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), "rb-drill-"))
  TMP.push(d)
  return d
}

function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

function repo(): string {
  const d = tmpDir()
  execFileSync("git", ["init", "-q"], { cwd: d })
  execFileSync("git", ["config", "user.email", "t@e.com"], { cwd: d })
  execFileSync("git", ["config", "user.name", "t"], { cwd: d })
  write(d, "a.txt", "A\n")
  write(d, "b.txt", "B\n")
  execFileSync("git", ["add", "-A"], { cwd: d })
  execFileSync("git", ["commit", "-qm", "seed"], { cwd: d })
  return d
}

const base = (over: Partial<Record<string, unknown>> = {}): string =>
  JSON.stringify({ version: 1, mechanism: "m", delete: ["a.txt"], ...over })

afterAll(() => {
  for (const d of TMP) rmSync(d, { recursive: true, force: true })
})

// ── ① schema 校验（fail-closed）─────────────────────────────────────────────

describe("清单 schema", () => {
  test("最小合法清单", () => {
    const m = parseManifest(base())
    expect(m.mechanism).toBe("m")
    expect(verifyCommands(m)).toEqual([["bun", "test", "tests/"]])
  })

  test("version 必须是 1", () => {
    expect(() => parseManifest(JSON.stringify({ version: 2, mechanism: "m", delete: ["a"] }))).toThrow(DrillError)
  })

  test("mechanism 必填", () => {
    expect(() => parseManifest(JSON.stringify({ version: 1, delete: ["a"] }))).toThrow(/mechanism/)
  })

  test("delete 禁止绝对路径 / `..`", () => {
    expect(() => parseManifest(base({ delete: ["/etc/passwd"] }))).toThrow(/绝对路径/)
    expect(() => parseManifest(base({ delete: ["../x"] }))).toThrow(/".."/)
  })

  test("edit 的 find 必须非空", () => {
    expect(() => parseManifest(base({ delete: undefined, edits: [{ path: "a.txt", find: "", replace: "" }] }))).toThrow(/find/)
  })

  test("delete 与 edits 不能同时为空", () => {
    expect(() => parseManifest(JSON.stringify({ version: 1, mechanism: "m" }))).toThrow(/不能同时为空/)
  })

  test("verify.commands 形状非法 ⇒ 抛", () => {
    expect(() => parseManifest(base({ verify: { commands: "bun test" } }))).toThrow(/verify.commands/)
    expect(() => parseManifest(base({ verify: { commands: [[1]] } }))).toThrow(/verify.commands/)
  })

  test("drill_env.seed_files 形状非法 ⇒ 抛", () => {
    expect(() => parseManifest(base({ drill_env: { seed_files: [{ path: "/abs", content: "x" }] } }))).toThrow(/绝对路径/)
    expect(() => parseManifest(base({ drill_env: { seed_files: [{ path: "x", content: 1 }] } }))).toThrow(/content/)
  })
})

// ── ② 判定：find 唯一性 / 文件存在性 ────────────────────────────────────────

describe("planDrill", () => {
  test("countOccurrences 不重叠计数", () => {
    expect(countOccurrences("aaa", "aa")).toBe(1)
    expect(countOccurrences("aXaXa", "a")).toBe(3)
    expect(countOccurrences("abc", "z")).toBe(0)
  })

  test("delete 目标缺失 ⇒ missing_file", () => {
    const d = repo()
    const p = planDrill(parseManifest(base({ delete: ["nope.txt"] })), d)
    expect(p.problems.map((x) => x.kind)).toEqual(["missing_file"])
  })

  test("find 出现 0 次 / 2 次 ⇒ find_count（防静默 no-op）", () => {
    const d = repo()
    const m0 = parseManifest(base({ delete: undefined, edits: [{ path: "a.txt", find: "ZZZ", replace: "" }] }))
    expect(planDrill(m0, d).problems.map((x) => x.kind)).toEqual(["find_count"])

    write(d, "dup.txt", "X\nX\n")
    const m2 = parseManifest(base({ delete: undefined, edits: [{ path: "dup.txt", find: "X\n", replace: "" }] }))
    const problems = planDrill(m2, d).problems
    expect(problems.map((x) => x.kind)).toEqual(["find_count"])
    expect(problems[0]!.detail).toContain("2 次")
  })

  test("同一路径既 delete 又 edits ⇒ path_overlap（防部分应用）", () => {
    const d = repo()
    const m = parseManifest(base({ delete: ["a.txt"], edits: [{ path: "a.txt", find: "A\n", replace: "A2\n" }] }))
    expect(planDrill(m, d).problems.map((x) => x.kind)).toEqual(["path_overlap"])
    expect(() => applyDrill(m, d)).toThrow(/path_overlap/)
    expect(readFileSync(path.join(d, "a.txt"), "utf8")).toBe("A\n") // 一个字节都没写
  })

  test("路径写法差异（`./a.txt` vs `a.txt`）⇒ 仍判为同路径（防重叠漏检 + 同文件两次写）", () => {
    const d = repo()
    const m1 = parseManifest(base({ delete: ["./a.txt"], edits: [{ path: "a.txt", find: "A\n", replace: "A2\n" }] }))
    expect(planDrill(m1, d).problems.map((x) => x.kind)).toEqual(["path_overlap"])

    const m2 = parseManifest(
      base({
        delete: undefined,
        edits: [
          { path: "./b.txt", find: "B\n", replace: "MID\n" },
          { path: "b.txt", find: "MID\n", replace: "END\n" },
        ],
      }),
    )
    const plan = planDrill(m2, d)
    expect(plan.problems).toEqual([])
    expect(plan.writes).toHaveLength(1) // 两种写法必须归并成一次写
    applyDrill(m2, d)
    expect(readFileSync(path.join(d, "b.txt"), "utf8")).toBe("END\n")
  })

  test("同一文件多条 edits 顺序生效（后者看到前者的结果）", () => {
    const d = repo()
    const m = parseManifest(
      base({
        delete: undefined,
        edits: [
          { path: "b.txt", find: "B\n", replace: "MID\n" },
          { path: "b.txt", find: "MID\n", replace: "END\n" },
        ],
      }),
    )
    const plan = planDrill(m, d)
    expect(plan.problems).toEqual([])
    applyDrill(m, d)
    expect(readFileSync(path.join(d, "b.txt"), "utf8")).toBe("END\n")
  })

  test("前一条 edit 破坏后一条的 find 上下文 ⇒ 当场红（不静默 no-op）", () => {
    const d = repo()
    const m = parseManifest(
      base({
        delete: undefined,
        edits: [
          { path: "b.txt", find: "B\n", replace: "GONE\n" },
          { path: "b.txt", find: "B\n", replace: "END\n" }, // 第一条已把 B 改掉 ⇒ 这里 0 次
        ],
      }),
    )
    const problems = planDrill(m, d).problems
    expect(problems.map((x) => x.kind)).toEqual(["find_count"])
    expect(problems[0]!.detail).toContain("第 2 条")
  })

  test("全部满足 ⇒ 空数组", () => {
    const d = repo()
    const m = parseManifest(base({ delete: ["a.txt"], edits: [{ path: "b.txt", find: "B\n", replace: "B2\n" }] }))
    const plan = planDrill(m, d)
    expect(plan.problems).toEqual([])
    expect(plan.deletions).toEqual(["a.txt"])
    expect(plan.writes.map((w) => w.path)).toEqual(["b.txt"])
  })
})

// ── ③ applyDrill：生效 + 禁止部分应用 ──────────────────────────────────────

describe("applyDrill", () => {
  test("删文件 + 逐段替换都生效", () => {
    const d = repo()
    write(d, "c.txt", "hello WORLD end\n")
    const m = parseManifest(
      base({ delete: ["a.txt"], edits: [{ path: "c.txt", find: "WORLD", replace: "world" }] }),
    )
    applyDrill(m, d)
    expect(existsSync(path.join(d, "a.txt"))).toBe(false)
    expect(readFileSync(path.join(d, "c.txt"), "utf8")).toBe("hello world end\n")
    expect(existsSync(path.join(d, "b.txt"))).toBe(true)
  })

  test("`replace` 里的 `$&` / `` $` `` / `$'` / `$1` 按**字面**落盘（不得被 String.replace 的替换模式解释）", () => {
    const d = repo()
    write(d, "c.txt", "PRE<TOKEN>POST\n")
    // ⚠ 这些序列在 `String.prototype.replace(pattern, replacement)` 的 replacement 为**字符串**时
    //   会被解释（`$&` ⇒ 匹配子串、`` $` `` ⇒ 匹配前文、`$'` ⇒ 匹配后文、`$1` ⇒ 捕获组）。
    //   清单的 `replace` 是**数据**（要落盘的文本）⇒ 必须逐字生效，否则回滚结果被静默扭曲。
    const literal = "A$&B$`C$'D$1E"
    const m = parseManifest(
      base({ edits: [{ path: "c.txt", find: "<TOKEN>", replace: literal }] }),
    )
    applyDrill(m, d)
    expect(readFileSync(path.join(d, "c.txt"), "utf8")).toBe(`PRE${literal}POST\n`)
  })

  test("有问题 ⇒ 抛，且**一个字节都不写**（禁止部分应用）", () => {
    const d = repo()
    write(d, "c.txt", "hello WORLD end\n")
    const m = parseManifest(
      base({ delete: ["a.txt", "missing.txt"], edits: [{ path: "c.txt", find: "WORLD", replace: "world" }] }),
    )
    expect(() => applyDrill(m, d)).toThrow(/plan_failed/)
    expect(existsSync(path.join(d, "a.txt"))).toBe(true)
    expect(readFileSync(path.join(d, "c.txt"), "utf8")).toBe("hello WORLD end\n")
  })
})

// ── ⑥ `retire[]`：结构化退役（ADR-rollback-manifest-enforcement 第 7 轮 / V16）──

/** 带登记面的 fixture 仓（`m1`/`m2` 属于组清单 `grp`；`other` 属于别的清单）。 */
function registryRepo(): string {
  const d = repo()
  write(
    d,
    ".rddf/rollback/registry.json",
    JSON.stringify(
      {
        version: 1,
        entries: [
          { mechanism: "m1", adr_primary: "docs/adr/ADR-m1.md", state: "active", watch: ["lib/m1.ts"], manifest_ref: "grp" },
          { mechanism: "m2", adr_primary: "docs/adr/ADR-m2.md", state: "proving", watch: ["lib/m2.ts"], manifest_ref: "grp" },
          { mechanism: "other", adr_primary: "docs/adr/ADR-other.md", state: "active", watch: ["lib/o.ts"], manifest_ref: "other-manifest" },
        ],
      },
      null,
      2,
    ) + "\n",
  )
  return d
}

const regOf = (d: string): Array<Record<string, unknown>> =>
  JSON.parse(readFileSync(path.join(d, ".rddf/rollback/registry.json"), "utf8")).entries

describe("retire[]（结构化退役）", () => {
  test("schema：retire 不是数组 / 元素非字符串 ⇒ 抛", () => {
    expect(() => parseManifest(base({ retire: "m1" }))).toThrow(/retire 必须是数组/)
    expect(() => parseManifest(base({ retire: [1] }))).toThrow(/retire\[0\] 必须是非空字符串/)
    expect(() => parseManifest(base({ retire: [""] }))).toThrow(/retire\[0\] 必须是非空字符串/)
  })

  test("**状态自指回归**：同一份清单对 `active` 与 `proving` 两个来源态都成立（转态按身份，不按可变字段）", () => {
    const d = registryRepo()
    const m = parseManifest(base({ mechanism: "grp", retire: ["m1", "m2"] }))
    const plan = planDrill(m, d)
    expect(plan.problems).toEqual([])
    applyDrill(m, d)
    const entries = regOf(d)
    const m1 = entries.find((e) => e.mechanism === "m1")!
    const m2 = entries.find((e) => e.mechanism === "m2")!
    expect(m1.state).toBe("retired")
    expect(m2.state).toBe("retired")
    for (const e of [m1, m2]) {
      expect(e.retired_evidence).toBe(e.adr_primary)
      expect(String(e.retired_at)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.watch).toBeUndefined()
      expect(e.manifest_ref).toBeUndefined()
    }
    // 别的清单的条目**不受影响**
    expect(entries.find((e) => e.mechanism === "other")!.state).toBe("active")
  })

  test("retire 不存在的机制 ⇒ retire_invalid", () => {
    const d = registryRepo()
    const plan = planDrill(parseManifest(base({ mechanism: "grp", retire: ["nope"] })), d)
    expect(plan.problems.map((p) => p.kind)).toContain("retire_invalid")
    expect(plan.problems[0]!.detail).toContain("机制不存在")
  })

  test("retire 已 `retired` / `exempt` 的条目 ⇒ retire_invalid（来源态只允许 active / proving）", () => {
    const d = registryRepo()
    const reg = JSON.parse(readFileSync(path.join(d, ".rddf/rollback/registry.json"), "utf8"))
    reg.entries[0].state = "retired"
    write(d, ".rddf/rollback/registry.json", JSON.stringify(reg, null, 2) + "\n")
    const plan = planDrill(parseManifest(base({ mechanism: "grp", retire: ["m1"] })), d)
    expect(plan.problems.map((p) => p.kind)).toContain("retire_invalid")
    expect(plan.problems[0]!.detail).toContain("来源态非法")
  })

  test("retire 别的清单的条目 ⇒ retire_invalid（不得跨清单改别人的条目）", () => {
    const d = registryRepo()
    const plan = planDrill(parseManifest(base({ mechanism: "grp", retire: ["other"] })), d)
    expect(plan.problems.map((p) => p.kind)).toContain("retire_invalid")
    expect(plan.problems[0]!.detail).toContain("不属于本清单")
  })

  test("retire[] 组内重名 ⇒ retire_invalid", () => {
    const d = registryRepo()
    const plan = planDrill(parseManifest(base({ mechanism: "grp", retire: ["m1", "m1"] })), d)
    expect(plan.problems.map((p) => p.kind)).toContain("retire_invalid")
    expect(plan.problems.some((p) => p.detail.includes("重名"))).toBe(true)
  })

  test("retire[] 与 delete registry.json 同列 ⇒ retire_invalid（两种退役通道互斥）", () => {
    const d = registryRepo()
    const m = parseManifest(
      base({ mechanism: "grp", retire: ["m1"], delete: ["a.txt", ".rddf/rollback/registry.json"] }),
    )
    const plan = planDrill(m, d)
    expect(plan.problems.map((p) => p.kind)).toContain("retire_invalid")
    expect(plan.problems.some((p) => p.detail.includes("互斥"))).toBe(true)
  })

  test("retire[] 与 edits 触碰 registry.json 同列 ⇒ retire_invalid（同一文件两条写入）", () => {
    const d = registryRepo()
    const m = parseManifest(
      base({
        mechanism: "grp",
        retire: ["m1"],
        edits: [{ path: ".rddf/rollback/registry.json", find: '"version": 1', replace: '"version": 2' }],
      }),
    )
    const plan = planDrill(m, d)
    expect(plan.problems.map((p) => p.kind)).toContain("retire_invalid")
    expect(plan.problems.some((p) => p.detail.includes("胜负未定义"))).toBe(true)
  })

  test("registry 缺失 ⇒ retire_invalid（不猜意图）", () => {
    const d = repo()
    const plan = planDrill(parseManifest(base({ mechanism: "grp", retire: ["m1"] })), d)
    expect(plan.problems.map((p) => p.kind)).toContain("retire_invalid")
    expect(plan.problems[0]!.detail).toContain("registry 不存在")
  })

  test("有问题 ⇒ applyDrill 抛，且 registry **一个字节都不写**（禁止部分应用）", () => {
    const d = registryRepo()
    const before = readFileSync(path.join(d, ".rddf/rollback/registry.json"), "utf8")
    const m = parseManifest(base({ mechanism: "grp", retire: ["m1", "nope"] }))
    expect(() => applyDrill(m, d)).toThrow(/plan_failed/)
    expect(readFileSync(path.join(d, ".rddf/rollback/registry.json"), "utf8")).toBe(before)
  })
})

// ── ④ 演练环境准备 ─────────────────────────────────────────────────────────

describe("seedDrillEnv", () => {
  test("只补缺失文件、不覆盖已有文件", () => {
    const d = tmpDir()
    write(d, "keep.txt", "original\n")
    const m: Manifest = {
      version: 1,
      mechanism: "m",
      delete: ["keep.txt"],
      drill_env: {
        seed_files: [
          { path: "keep.txt", content: "overwritten\n" },
          { path: "new/deep/x.txt", content: "seeded\n" },
        ],
      },
    }
    expect(seedDrillEnv(m, d)).toEqual(["new/deep/x.txt"])
    expect(readFileSync(path.join(d, "keep.txt"), "utf8")).toBe("original\n")
    expect(readFileSync(path.join(d, "new/deep/x.txt"), "utf8")).toBe("seeded\n")
  })
})

// ── ⑤ CLI 退出码（fixture 仓 + 假验证命令，不跑真套件）────────────────────

function runCli(args: string[], env: Record<string, string> = {}): { code: number; out: string } {
  // ⚠ 默认**清掉**嵌套哨兵：本文件可能被 drill 的 clone 包含（其 verify 环境带 ROLLBACK_DRILL_CHILD=1），
  //   不清掉的话下面所有 CLI 用例都会命中「嵌套拒绝」⇒ exit 2。要测嵌套的用例显式传 env。
  const r = spawnSync("bun", [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ROLLBACK_DRILL_CHILD: "", ...env } })
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` }
}

const MANIFEST_DIR = mkdtempSync(path.join(tmpdir(), "rb-manifest-"))
TMP.push(MANIFEST_DIR)

/** 清单一律写在**仓库外**的独立目录（写进 fixture 仓会让 `git status` 多出 untracked）。 */
function manifestFile(_dir: string, obj: unknown): string {
  const p = path.join(MANIFEST_DIR, `manifest-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj))
  return p
}

describe("CLI 退出码", () => {
  test("清单可执行 + 验证绿 ⇒ exit 0", () => {
    const d = repo()
    const mf = manifestFile(d, { version: 1, mechanism: "m", delete: ["a.txt"], verify: { commands: [["true"]] } })
    const r = runCli([mf, "--repo", d])
    expect(r.code).toBe(0)
    expect(r.out).toContain("PASS")
  })

  test("验证命令红 ⇒ exit 1（判别力：不是「删完就绿」）", () => {
    const d = repo()
    const mf = manifestFile(d, { version: 1, mechanism: "m", delete: ["a.txt"], verify: { commands: [["false"]] } })
    const r = runCli([mf, "--repo", d])
    expect(r.code).toBe(1)
    expect(r.out).toContain("FAIL")
  })

  test("少删一件（清单漂移）⇒ exit 1，且 dry-run 也报", () => {
    const d = repo()
    const mf = manifestFile(d, { version: 1, mechanism: "m", delete: ["a.txt", "gone.txt"], verify: { commands: [["true"]] } })
    expect(runCli([mf, "--repo", d, "--dry-run"]).code).toBe(1)
    const r = runCli([mf, "--repo", d])
    expect(r.code).toBe(1)
    expect(r.out).toContain("missing_file")
  })

  test("非 git 目录 ⇒ exit 2（skip）", () => {
    const d = tmpDir()
    const mf = manifestFile(d, { version: 1, mechanism: "m", delete: ["a.txt"] })
    expect(runCli([mf, "--repo", d]).code).toBe(2)
  })

  test("嵌套调用被拒 ⇒ exit 2（防 drill 里跑 drill 的递归）", () => {
    const d = repo()
    const mf = manifestFile(d, { version: 1, mechanism: "m", delete: ["a.txt"] })
    const r = runCli([mf, "--repo", d], { ROLLBACK_DRILL_CHILD: "1" })
    expect(r.code).toBe(2)
    expect(r.out).toContain("嵌套")
  })

  test("清单非法 ⇒ exit 1", () => {
    const d = repo()
    const mf = manifestFile(d, "{ not json")
    expect(runCli([mf, "--repo", d]).code).toBe(1)
  })

  test("真仓不被改动（drill 只在副本里动手）", () => {
    const d = repo()
    const before = execFileSync("git", ["status", "--porcelain"], { cwd: d, encoding: "utf8" })
    const mf = manifestFile(d, { version: 1, mechanism: "m", delete: ["a.txt"], verify: { commands: [["true"]] } })
    expect(runCli([mf, "--repo", d]).code).toBe(0)
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: d, encoding: "utf8" })).toBe(before)
    expect(existsSync(path.join(d, "a.txt"))).toBe(true)
  })
})
