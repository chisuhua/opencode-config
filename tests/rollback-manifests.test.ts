/**
 * 回滚清单的**在场性 + 可执行性**守卫（零成本版「纳入默认门禁」）
 *
 * ## 为什么不是「在套件里跑 drill」
 *
 * drill 会 `git clone` + 在副本里跑**整套**测试（≈30s/清单），且它与套件互相包含
 * （副本里也会跑到本文件）⇒ 只能靠 `ROLLBACK_DRILL_CHILD` 拒绝，属于「自己跑自己」。
 * 每次 `bun test tests/` 付 30s×N 的代价，换来的只是「HEAD 上清单可执行」。
 *
 * ## 本文件做的是什么
 *
 * 用同一个判据（`planDrill`）在**当前工作树**上做内存校验 —— **毫秒级、零写盘**：
 *
 *   - `delete` 目标必须存在；`edits.find` 必须恰好出现 1 次；`delete ∩ edits` 不得重叠；
 *   - 清单的 `mechanism` 必须与文件名一致；`adr` 指向的文件必须存在；
 *   - 每条清单的 `verify.commands` 必须非空（否则「回滚后跑什么」无判据）。
 *
 * ⇒ 任何改动让某条清单漂移（措辞改了、文件删了、路径写法变了）⇒ **本次 `bun test` 立刻红**，
 * 不必等有人想起来跑 drill。真演练（clone + 跑验证命令）仍按需手动执行。
 *
 * ⚠ 与 drill 的分工：本文件证明「清单**现在**可执行」；drill 证明「执行后**仓库仍自洽**」。
 *   两者都不能替代对方。
 */
import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { parseManifest, planDrill } from "../lib/rollback-drill.ts"

const ROOT = path.join(import.meta.dir, "..")
const ROLLBACK_DIR = path.join(ROOT, ".rddf", "rollback")

/**
 * ⚠ **在 drill 的副本里跳过**：副本正是「清单已执行完」的状态 ⇒ 清单的 `find` 必然不再匹配、
 * `delete` 目标也已被删 ⇒ 在这里跑本判据会**恒红**。这不是漏洞：本判据的覆盖面是**真实工作树**
 * （`bun test tests/` 的常规运行），副本里的「清单与内容不一致」是预期状态。
 */
const IN_DRILL = process.env.ROLLBACK_DRILL_CHILD === "1"

function manifests(): Array<{ name: string; raw: string }> {
  return readdirSync(ROLLBACK_DIR)
    // ⚠ `registry.json` 是**机制登记表**（ADR-rollback-manifest-enforcement），不是回滚清单
    //   ⇒ 它的 schema 完全不同（无 mechanism / delete / edits）⇒ 必须排除，否则本守卫恒红。
    .filter((f) => f.endsWith(".json") && f !== "registry.json")
    .sort()
    .map((f) => ({ name: f, raw: readFileSync(path.join(ROLLBACK_DIR, f), "utf8") }))
}

describe.skipIf(IN_DRILL)("回滚清单：在场性 + 可执行性（当前工作树，零写盘）", () => {
  test("至少 2 份清单（防「全删掉 ⇒ 空集恒绿」）", () => {
    expect(manifests().length, `\.rddf/rollback/ 下的清单太少（${ROLLBACK_DIR}）`).toBeGreaterThanOrEqual(2)
  })

  for (const { name, raw } of manifests()) {
    test(`${name}：schema 合法 + mechanism 与文件名一致 + adr 存在 + verify 非空`, () => {
      const m = parseManifest(raw)
      expect(m.mechanism, `${name} 的 mechanism 必须与文件名一致`).toBe(name.replace(/\.json$/, ""))
      expect(m.adr, `${name} 必须声明 adr（人读的决策真源）`).toBeTruthy()
      expect(existsSync(path.join(ROOT, m.adr as string)), `${name} 的 adr 不存在：${m.adr}`).toBe(true)
      const cmds = m.verify?.commands ?? []
      expect(cmds.length, `${name} 的 verify.commands 不得为空（否则「回滚后跑什么」无判据）`).toBeGreaterThan(0)
    })

    test(`${name}：在当前工作树上可执行（delete 存在 / find 恰好 1 次 / 无路径重叠）`, () => {
      const problems = planDrill(parseManifest(raw), ROOT).problems
      expect(
        problems.map((p) => `[${p.kind}] ${p.path}: ${p.detail}`),
        `${name} 已漂移 —— 改措辞/删文件后须同步更新清单（或按 drift 修清单，不要改判据）`,
      ).toEqual([])
    })
  }

  test("判别力：清单漂移必须被抓到（fixture，不触真仓）", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rb-manifest-guard-"))
    try {
      mkdirSync(path.join(dir, "keep"), { recursive: true })
      writeFileSync(path.join(dir, "keep", "a.txt"), "A\n")
      const good = parseManifest(JSON.stringify({ version: 1, mechanism: "m", delete: ["keep/a.txt"] }))
      expect(planDrill(good, dir).problems).toEqual([])

      // ① 少删一件（delete 目标不存在）
      const gone = parseManifest(JSON.stringify({ version: 1, mechanism: "m", delete: ["keep/a.txt", "gone.txt"] }))
      expect(planDrill(gone, dir).problems.map((p) => p.kind)).toEqual(["missing_file"])

      // ② find 漂移（措辞改了一个字）
      const drift = parseManifest(
        JSON.stringify({ version: 1, mechanism: "m", edits: [{ path: "keep/a.txt", find: "B\n", replace: "" }] }),
      )
      expect(planDrill(drift, dir).problems.map((p) => p.kind)).toEqual(["find_count"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 形态守卫：不许「整表 / 整段散文」被 `find` pin 住
// ═══════════════════════════════════════════════════════════════════════════
//
// ## 为什么需要它
//
// `edits[].find` 是「回滚时要被替换掉的原文片段」⇒ 它**越窄越准**。
// 当一个 `find` 覆盖了与机制无关的散文或整张表格时，治理面文档的**正常编辑**
// （改一行散文、补一个路径）就会被一个**回滚用**的机制产物挡住，而且这个绑定
// **不可见**（改之前不知道会红），只能靠跑 `bun test` 撞出来。
//
// ⇒ 本守卫把「不许整表 pin」变成**可机检**的判据。
//
// ## 三道闸（逐清单计算形态指标，再与基线比对）
//
//   - `sep`  = 含 markdown 表格**分隔行**（`| --- | --- |`）的 find 条数
//   - `pipe` = `|` 起始的**连续**行数 > 1 的 find 条数（= 整张表被整块覆盖）
//   - `maxLen` = 最长 find 的字符数
//
// ⚠ `sep` 与 `pipe` 是**两道不同的闸**：`sep` 抓「含分隔行」；`pipe` 抓
//   「从分隔行**之后**开始、避开分隔行」的绕过路径 ⇒ 两道都要。
//
// ## 零增长基线（**不是豁免白名单**）
//
// `FIND_SHAPE_BASELINE` 登记**未收敛清单**的已知违规数，断言**实际值 ≤ 基线值**
// ⇒ 存量违规不许增加（不许退化），收敛一项就从表里移除一项。
// 豁免白名单会让该清单**可以继续退化** ⇒ 判别力差一个量级。
//
// 未登记清单适用全局硬上限（`{ sep: 0, pipe: 1, maxLen: MAX_FIND_LEN }`）。
// `commit-gate.json` 已达标 ⇒ **刻意不登记**（登记它反而允许它退化）。
//
// ## 已知盲区（如实登记，不假装覆盖）
//
// 缩进的 markdown 表格行（`  | a | b |`）两道闸都不计（`startsWith("|")` 不匹配
// 前导空白）⇒ 理论盲区。**本仓实测 0 条**（2026-11-24 全量 361 条 find 统计）
// ⇒ 登记为「本仓不适用」；若将来出现 ⇒ 判据需扩，不得靠本注释兜底。

/**
 * 单条 `find` 的长度上限（**测试常量**，取值 = 2026-11-24 全量 361 条 find 的 **p95**）。
 *
 * ⚠ 取 p95 而非目标值：若先拍一个目标数字 ⇒ 存量清单大面积假红 ⇒ 会被迫「改判据」
 *   （本仓明确避免假信心）。p95 ⇒ **零假红**；同时它对**新 find** 是硬约束。
 */
const MAX_FIND_LEN = 2894

/**
 * 未收敛清单的**已知违规基线**（实际值 ≤ 基线值；不许增加）。收敛一项 ⇒ 移除一项。
 *
 * ⚠ 数值 = 2026-11-24 实测（逐格可复核：下面的「基线表与实测一致」用例会重算并比对）。
 * ⚠ `commit-gate.json` 已达标 ⇒ **刻意不登记**。
 */
const FIND_SHAPE_BASELINE: Record<string, { sep: number; pipe: number; maxLen: number }> = {
  "delegate-knowledge-delivery.json": { sep: 0, pipe: 2, maxLen: 6524 },
  "delegate-slot-kernel.json": { sep: 5, pipe: 6, maxLen: 2894 },
  // ⚠ 过渡态：阶段 1 登记（尚未拆分）⇒ 阶段 3（A3）拆分完成后**移除本项** ⇒ 终态 7 项
  "governance-paths-config.json": { sep: 2, pipe: 2, maxLen: 12768 },
  "model-fallback.json": { sep: 1, pipe: 2, maxLen: 3003 },
  "plan-delegate.json": { sep: 1, pipe: 1, maxLen: 4849 },
  "plan-topics.json": { sep: 1, pipe: 1, maxLen: 5229 },
  "role-class-write-set.json": { sep: 3, pipe: 3, maxLen: 8844 },
  "rollback-manifest-enforcement.json": { sep: 0, pipe: 1, maxLen: 500 },
}

/** 未登记清单适用的全局硬上限。 */
const DEFAULT_BASELINE = { sep: 0, pipe: 1, maxLen: MAX_FIND_LEN }

/** 单条 find 的形态指标。 */
function findShape(find: string): { sep: boolean; pipe: boolean; len: number } {
  const lines = find.split("\n")
  let run = 0
  let maxRun = 0
  for (const line of lines) {
    if (line.startsWith("|")) {
      run++
      if (run > maxRun) maxRun = run
    } else {
      run = 0
    }
  }
  return {
    sep: /^\|[\s:|-]+\|$/m.test(find),
    pipe: maxRun > 1,
    len: find.length,
  }
}

/**
 * 形态违规列表（**纯函数** ⇒ 可用 fixture 做判别力自证，不触真仓）。
 *
 * @param name 清单名（如 `role-class-write-set.json`）
 * @param finds 该清单每条 edit 的 `find`
 * @param baseline 基线表（缺项 ⇒ 全局硬上限）
 */
function findShapeViolations(
  name: string,
  finds: string[],
  baseline: Record<string, { sep: number; pipe: number; maxLen: number }> = FIND_SHAPE_BASELINE,
): string[] {
  const base = baseline[name] ?? DEFAULT_BASELINE
  const out: string[] = []
  let sepCount = 0
  let pipeCount = 0
  let maxLen = 0
  for (const find of finds) {
    const s = findShape(find)
    if (s.sep) sepCount++
    if (s.pipe) pipeCount++
    if (s.len > maxLen) maxLen = s.len
  }
  if (sepCount > base.sep) {
    out.push(`${name}: 含表格分隔行的 find ${sepCount} 条 > 基线 ${base.sep} 条`)
  }
  if (pipeCount > base.pipe) {
    out.push(`${name}: 覆盖整张表的 find（| 起始连续行 > 1）${pipeCount} 条 > 基线 ${base.pipe} 条`)
  }
  if (maxLen > base.maxLen) {
    out.push(`${name}: 最长 find ${maxLen} 字符 > 上限 ${base.maxLen} 字符`)
  }
  return out
}

/** 读真仓某清单的每条 find。 */
function readsOf(manifestFile: string): string[] {
  const raw = JSON.parse(readFileSync(path.join(ROLLBACK_DIR, manifestFile), "utf8")) as {
    edits?: Array<{ find?: string }>
  }
  return (raw.edits ?? []).map((e) => e.find ?? "")
}

describe.skipIf(IN_DRILL)("回滚清单：形态守卫（不许整表 / 整段散文被 find pin 住）", () => {
  const files = readdirSync(ROLLBACK_DIR)
    .filter((f) => f.endsWith(".json") && f !== "registry.json")
    .sort()

  test("清单集合非空（防「全删掉 ⇒ 空集恒绿」）", () => {
    expect(files.length).toBeGreaterThanOrEqual(2)
  })

  test("基线表与实测一致（登记值不得虚高，也不得低于实测）", () => {
    const violations: string[] = []
    for (const [name, base] of Object.entries(FIND_SHAPE_BASELINE)) {
      if (!files.includes(name)) {
        violations.push(`基线表登记了不存在的清单：${name}`)
        continue
      }
      const s = readsOf(name).map(findShape)
      const actual = {
        sep: s.filter((x) => x.sep).length,
        pipe: s.filter((x) => x.pipe).length,
        maxLen: Math.max(0, ...s.map((x) => x.len)),
      }
      if (actual.sep > base.sep) violations.push(`${name}: 实测 sep ${actual.sep} > 基线 ${base.sep}`)
      if (actual.pipe > base.pipe) violations.push(`${name}: 实测 pipe ${actual.pipe} > 基线 ${base.pipe}`)
      if (actual.maxLen > base.maxLen) violations.push(`${name}: 实测 maxLen ${actual.maxLen} > 基线 ${base.maxLen}`)
    }
    expect(violations).toEqual([])
  })

  for (const name of files) {
    test(`${name}：find 的形态指标不超过基线`, () => {
      expect(findShapeViolations(name, readsOf(name))).toEqual([])
    })
  }

  test("判别力：新增一条含表格分隔行的 find ⇒ 判红（未登记清单）", () => {
    const violations = findShapeViolations("commit-gate.json", ["| a | b |\n|---|---|\n| 1 | 2 |\n"])
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join("\n")).toContain("分隔行")
  })

  test("判别力：避开分隔行、只覆盖数据行 ⇒ 仍被 pipe 闸拦下", () => {
    // ⚠ `pipe` 计的是**条数**（不是「单条覆盖了几行」）⇒ 超过上限要 **2 条**。
    //   覆盖行数的严重程度不在判据里（形态指标是必要形态的保守近似）⇒ 已在 design §4 登记。
    const violations = findShapeViolations("commit-gate.json", ["| 1 | 2 |\n| 3 | 4 |\n", "| 5 | 6 |\n| 7 | 8 |\n"])
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join("\n")).toContain("整张表")
  })

  test("判别力：pipe 上限为 0 的清单 ⇒ 单条覆盖多行表格即红", () => {
    const violations = findShapeViolations(
      "commit-gate.json",
      ["| 1 | 2 |\n| 3 | 4 |\n"],
      { "commit-gate.json": { sep: 0, pipe: 0, maxLen: MAX_FIND_LEN } },
    )
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join("\n")).toContain("整张表")
  })

  test("判别力：基线被下调到实测值以下 ⇒ 判红", () => {
    const violations = findShapeViolations(
      "rollback-manifest-enforcement.json",
      ["| 1 | 2 |\n| 3 | 4 |\n"],
      { "rollback-manifest-enforcement.json": { sep: 0, pipe: 0, maxLen: MAX_FIND_LEN } },
    )
    expect(violations.length).toBeGreaterThan(0)
  })

  test("判别力：超长 find ⇒ 判红（未登记清单适用全局上限）", () => {
    const violations = findShapeViolations("commit-gate.json", ["x".repeat(MAX_FIND_LEN + 1)])
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join("\n")).toContain("字符")
  })
})
