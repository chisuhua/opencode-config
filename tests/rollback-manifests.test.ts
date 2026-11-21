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
