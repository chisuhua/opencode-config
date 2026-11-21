/**
 * 机制登记表（`ADR-rollback-manifest-enforcement`）的一致性守卫
 *
 * ## 覆盖
 *
 * ① **真源在位**：`.rddf/rollback/registry.json` 存在 + schema 合法 + 本仓的判据全绿；
 * ② **判别力（负向）**：每条判据都有一个**能被抓到**的反例（否则守卫是恒真的装饰）。
 * ③ **零成本**：只读文件 + 内存比较 —— **不 spawn 进程 / 不跑 drill / 不 clone**。
 *
 * ## 判据来源
 *
 * `docs/adr/ADR-rollback-manifest-enforcement.md` 的 **M1–M9 / V1–V14**；
 * 实现见 `lib/rollback-registry.ts`（纯逻辑层，判据本体在这里）。
 */
import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { checkRegistry, contentHash, parseRegistry, REGISTRY_PATH } from "../lib/rollback-registry.ts"

const ROOT = path.join(import.meta.dir, "..")

function loadRegistry(): ReturnType<typeof parseRegistry> {
  return parseRegistry(readFileSync(path.join(ROOT, REGISTRY_PATH), "utf8"))
}

describe("机制登记表：真源在位", () => {
  test("registry 存在 + schema 合法（fail-closed：缺失/非法 ⇒ 红，不当空集）", () => {
    expect(() => loadRegistry()).not.toThrow()
  })

  test("本仓的判据全绿（M1–M9 / V1–V14）", () => {
    const { problems } = checkRegistry(ROOT, loadRegistry())
    expect(
      problems.map((p) => `[${p.code}] ${p.mechanism}：${p.detail}`),
      "机制登记表有判据不通过（改清单/改机制后须同步 registry）",
    ).toEqual([])
  })

  test("census 六态齐（active / proving / unmanifested / exempt / declared / retired）", () => {
    const { census } = checkRegistry(ROOT, loadRegistry())
    expect(Object.keys(census).sort()).toEqual([
      "active",
      "declared",
      "exempt",
      "proving",
      "retired",
      "unmanifested",
    ])
    const total = Object.values(census).reduce((a, b) => a + b, 0)
    expect(total).toBe(loadRegistry().entries.length)
  })
})

/**
 * **判别力（负向）**：在**临时 fixture 仓**上构造反例 ⇒ 每条判据都必须被抓到。
 *
 * ⚠ fixture 只放**判据用到的文件**（ADR 集合 / 清单 / 债指针）⇒ 不触真实仓历史、不 spawn。
 */
describe("机制登记表：判别力（每条判据都有反例）", () => {
  function fixture(entries: Array<Record<string, unknown>>, opts?: { adrs?: string[]; manifests?: Record<string, unknown> }) {
    const dir = mkdtempSync(path.join(tmpdir(), "rb-registry-"))
    try {
      mkdirSync(path.join(dir, "docs", "adr"), { recursive: true })
      for (const a of opts?.adrs ?? ["docs/adr/ADR-x.md"]) {
        writeFileSync(path.join(dir, a), "# x\n")
      }
      mkdirSync(path.join(dir, ".rddf", "rollback", "pending"), { recursive: true })
      for (const [name, m] of Object.entries(opts?.manifests ?? {})) {
        writeFileSync(path.join(dir, ".rddf", "rollback", `${name}.json`), JSON.stringify(m, null, 2))
      }
      const reg = parseRegistry(JSON.stringify({ version: 1, entries }))
      return { dir, problems: checkRegistry(dir, reg).problems }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const okEntry = {
    mechanism: "x",
    adr_primary: "docs/adr/ADR-x.md",
    state: "active",
  }
  const okManifest = {
    version: 1,
    mechanism: "x",
    adr: "docs/adr/ADR-x.md",
    delete: ["a.txt"],
  }

  test("基线：合规的 registry ⇒ 零问题（证明反例不是「本来就红」）", () => {
    const { problems } = fixture([okEntry], { manifests: { x: okManifest } })
    // 该 fixture 缺 last_drill / 债指针等 ⇒ 只断言「M1/M2/M3 类问题不出现」
    const codes = problems.map((p) => p.code)
    expect(codes.includes("M1")).toBe(false)
    expect(codes.includes("M8")).toBe(false)
  })

  test("M1：ADR 未被覆盖 ⇒ 红", () => {
    const { problems } = fixture([{ ...okEntry, state: "exempt", exempt_class: "no-mechanism", exempt_evidence: "docs/adr/ADR-x.md" }], {
      adrs: ["docs/adr/ADR-x.md", "docs/adr/ADR-y.md"],
    })
    expect(problems.some((p) => p.code === "M1" && p.detail.includes("未被 registry 覆盖"))).toBe(true)
  })

  test("M8：adr_primary 悬空 ⇒ 红", () => {
    const { problems } = fixture([{ ...okEntry, adr_primary: "docs/adr/ADR-missing.md" }])
    expect(problems.some((p) => p.code === "M8")).toBe(true)
  })

  test("M8：adr_primary 不在决策记录闭集内 ⇒ 红（存在但落在闭集外）", () => {
    // ⚠ 反例必须**存在**（否则命中的是「悬空」分支而非「闭集外」分支 ⇒ 判别力错位）
    const { problems } = fixture([{ ...okEntry, adr_primary: "docs/adr-notes.md" }], {
      adrs: ["docs/adr/ADR-x.md", "docs/adr-notes.md"],
    })
    expect(problems.some((p) => p.code === "M8" && p.detail.includes("决策记录闭集"))).toBe(true)
  })

  test("M2：active 条目缺清单 ⇒ 红；清单的 adr 不一致 ⇒ 红", () => {
    const missing = fixture([okEntry])
    expect(missing.problems.some((p) => p.code === "M2")).toBe(true)

    const mismatch = fixture([okEntry], {
      manifests: { x: { ...okManifest, adr: "docs/adr/ADR-other.md" } },
    })
    expect(mismatch.problems.some((p) => p.code === "M2" && p.detail.includes("清单的 adr"))).toBe(true)
  })

  test("M3：豁免类不在闭集内 ⇒ 红；证据不存在 ⇒ 红", () => {
    const badClass = fixture([{ ...okEntry, state: "exempt", exempt_class: "later", exempt_evidence: "docs/adr/ADR-x.md" }])
    expect(badClass.problems.some((p) => p.code === "M3" && p.detail.includes("exempt_class 非法"))).toBe(true)

    const badEvidence = fixture([{ ...okEntry, state: "exempt", exempt_class: "no-mechanism", exempt_evidence: "docs/adr/ADR-none.md" }])
    expect(badEvidence.problems.some((p) => p.code === "M3" && p.detail.includes("exempt_evidence 不存在"))).toBe(true)
  })

  test("M7：unmanifested 缺债指针 / 债文件与条目不一一对应 ⇒ 红", () => {
    const noDebt = fixture([{ ...okEntry, state: "unmanifested", watch: ["docs/adr/ADR-x.md"] }])
    expect(noDebt.problems.some((p) => p.code === "M7" && p.detail.includes("pending_backlog"))).toBe(true)

    const orphan = fixture([{ ...okEntry, state: "unmanifested", watch: ["docs/adr/ADR-x.md"], pending_backlog: ".rddf/rollback/pending/x.md" }])
    expect(orphan.problems.some((p) => p.code === "M7")).toBe(true)
  })

  test("M4：declared 的 watch 路径已存在 ⇒ 红（实现已落地却仍 declared）", () => {
    const { problems } = fixture([{ ...okEntry, state: "declared", watch: ["docs/adr/ADR-x.md"] }])
    expect(problems.some((p) => p.code === "M4" && p.detail.includes("已存在"))).toBe(true)
  })

  test("M5：no-op 替换（find == replace）与空壳验证命令 ⇒ 红", () => {
    const noop = fixture([okEntry], {
      manifests: {
        x: { ...okManifest, delete: [], edits: [{ path: "docs/adr/ADR-x.md", find: "x", replace: "x" }] },
      },
    })
    expect(noop.problems.some((p) => p.code === "M5" && p.detail.includes("no-op"))).toBe(true)

    const trivial = fixture([okEntry], {
      manifests: { x: { ...okManifest, verify: { commands: [["true"]] } } },
    })
    expect(trivial.problems.some((p) => p.code === "M5" && p.detail.includes("验证命令"))).toBe(true)
  })

  test("V8：last_drill 缺失 / 内容哈希过期 ⇒ 红", () => {
    const noEvidence = fixture([okEntry], { manifests: { x: okManifest } })
    expect(noEvidence.problems.some((p) => p.code === "V8" && p.detail.includes("last_drill"))).toBe(true)

    const stale = fixture([okEntry], {
      manifests: {
        x: {
          ...okManifest,
          last_drill: { sha: "a".repeat(40), at: "2026-01-01", result: "pass", content_hash: "b".repeat(64) },
        },
      },
    })
    expect(stale.problems.some((p) => p.code === "V8" && p.detail.includes("实质改动过"))).toBe(true)
  })

  test("M5：豁免证据自证（指向 adr_primary）⇒ 红", () => {
    const { problems } = fixture([
      { ...okEntry, state: "exempt", exempt_class: "no-mechanism", exempt_evidence: "docs/adr/ADR-x.md" },
    ])
    expect(problems.some((p) => p.code === "M5" && p.detail.includes("自证"))).toBe(true)
  })

  test("proving（过渡态）：缺清单 / 指针不一致 / watch 不存在 ⇒ 红；证据可缺失但存在即须新鲜", () => {
    const noManifest = fixture([{ ...okEntry, state: "proving", watch: ["docs/adr/ADR-x.md"] }])
    expect(noManifest.problems.some((p) => p.code === "M2")).toBe(true)

    const badWatch = fixture([{ ...okEntry, state: "proving", watch: ["docs/adr/ADR-none.md"] }], {
      manifests: { x: okManifest },
    })
    expect(badWatch.problems.some((p) => p.code === "M7" && p.detail.includes("watch 路径不存在"))).toBe(true)

    // 证据**可缺失**（过渡态的定义）⇒ 不得因此判红
    const noEvidence = fixture([{ ...okEntry, state: "proving", watch: ["docs/adr/ADR-x.md"] }], {
      manifests: { x: okManifest },
    })
    expect(noEvidence.problems.some((p) => p.code === "V8")).toBe(false)

    // 但**一旦存在就必须新鲜**（陈旧证据 ⇒ 红）
    const stale = fixture([{ ...okEntry, state: "proving", watch: ["docs/adr/ADR-x.md"] }], {
      manifests: {
        x: {
          ...okManifest,
          last_drill: { sha: "a".repeat(40), at: "2026-01-01", result: "pass", content_hash: "b".repeat(64) },
        },
      },
    })
    expect(stale.problems.some((p) => p.code === "V8" && p.detail.includes("实质改动过"))).toBe(true)
  })

  test("M1（第二子句）：清单文件存在但无 active/proving 条目 ⇒ 红（清单必须被登记）", () => {
    const { problems } = fixture([{ ...okEntry, state: "exempt", exempt_class: "no-mechanism", exempt_evidence: "docs/adr/ADR-x.md" }], {
      manifests: { x: okManifest },
    })
    expect(problems.some((p) => p.code === "M1" && p.detail.includes("清单文件存在但 registry 无对应条目"))).toBe(true)
  })

  test("contentHash 排除 last_drill 字段（回填证据不改变哈希 ⇒ 无自指回归）", () => {
    const base = { version: 1, mechanism: "x", adr: "docs/adr/ADR-x.md", delete: ["a.txt"] }
    const h1 = contentHash(base)
    const h2 = contentHash({ ...base, last_drill: { sha: "c".repeat(40), at: "2026-01-01", result: "pass", content_hash: "d".repeat(64) } })
    expect(h2).toBe(h1)
    // 实质改动 ⇒ 哈希变
    expect(contentHash({ ...base, delete: ["b.txt"] })).not.toBe(h1)
  })

  test("contentHash 规范化（递归排序 key）⇒ 键序无关（重排 key 不算实质改动）", () => {
    const a = { version: 1, mechanism: "x", adr: "docs/adr/ADR-x.md", delete: ["a.txt"] }
    const b = { delete: ["a.txt"], adr: "docs/adr/ADR-x.md", mechanism: "x", version: 1 }
    expect(contentHash(b)).toBe(contentHash(a))
    // ⚠ 数组**保持原序**（`edits[]` 的顺序是语义的一部分）⇒ 数组重排 ⇒ 哈希变
    const arr = { version: 1, mechanism: "x", edits: [{ path: "p", find: "a", replace: "b" }, { path: "q", find: "c", replace: "d" }] }
    const arrRev = { version: 1, mechanism: "x", edits: [{ path: "q", find: "c", replace: "d" }, { path: "p", find: "a", replace: "b" }] }
    expect(contentHash(arrRev)).not.toBe(contentHash(arr))
  })

  test("M7：pending_backlog 只属 unmanifested（其它状态挂着它 ⇒ 红）", () => {
    const { problems } = fixture([{ ...okEntry, pending_backlog: ".rddf/rollback/pending/x.md" }], {
      manifests: { x: okManifest },
    })
    expect(problems.some((p) => p.code === "M7" && p.detail.includes("只属 unmanifested"))).toBe(true)
  })
})
