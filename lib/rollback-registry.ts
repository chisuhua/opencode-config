/**
 * rollback-registry —— **机制登记表**的一致性判据（L2 强制化的纯逻辑层）
 *
 * ## 它回答什么
 *
 * 「回滚可达性」从**约定**（有人记得写清单）变成**机制**（忘了就红）时，必须能回答：
 * ① **该有的清单在不在**（M1：ADR 全集 == registry 覆盖集）；
 * ② **指针指得对不对**（M2 / M8：存在 + ∈ 决策记录闭集 + `active` 还要 == 清单的 `adr`）；
 * ③ **豁免 / 欠账是不是合法的**（M3 / M7：闭集 + 证据 / 逐机制债指针 + 在跑锚点）；
 * ④ **清单本身是不是空壳**（M5：`find ≠ replace`、验证命令不得是 `true` 之类、证据不得自证）；
 * ⑤ **证据还新鲜吗**（V8：`last_drill` 的形状 + 内容比对）。
 *
 * ## 判据来源
 *
 * `docs/adr/ADR-rollback-manifest-enforcement.md`（L2 强制化 ADR）的 **M1–M9 / V1–V14**。
 * 本文件是**判据的可执行形态**；ADR 是**决策真源**（两处不得各说一半 ⇒ 口径冲突回 ADR）。
 *
 * ## 设计要点
 *
 * - **fail-closed**：registry 缺失 / schema 非法 ⇒ 抛（不静默当空集 ⇒「删掉 registry = 全部豁免」不成立）。
 * - **零成本**：只读文件 + 内存比较；**不 spawn 进程**、不跑 drill、不 clone。
 * - **git 依赖可插拔**：V8 的「内容比对」需要 `git show <sha>:<path>` ⇒ 由调用方注入
 *   `readAt(sha, rel)`；**未注入时只判形状**（形状红、内容比对判不了 ⇒ 如实登记，不假装）。
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { parseManifest, type Manifest } from "./rollback-drill.ts"

/**
 * registry 里的状态（ADR D1）。
 *
 * ⚠ `proving` 是**过渡态**：「机制已落地、清单已写、**演练证据待回填**」。
 * 它解决**自举死锁**：机制落地的那个 commit 里，条目无法同时满足
 * 「`declared` 的 watch 路径尚不存在」与「`active` 的演练证据已回填」
 * （证据只能由**已提交**的清单跑出来 ⇒ 必然晚一个 commit）⇒ 没有过渡态就永远转不了 `active`。
 */
export type RegistryState = "declared" | "unmanifested" | "proving" | "active" | "retired" | "exempt"

export const REGISTRY_STATES: readonly RegistryState[] = [
  "declared",
  "unmanifested",
  "proving",
  "active",
  "retired",
  "exempt",
]

/** 豁免类闭集（ADR D2 / M3）—— 闭集之外的值一律红（不发明新理由）。 */
export const EXEMPT_CLASSES = [
  "no-mechanism",
  "one-way",
  "not-implemented",
  "superseded",
  "no-single-baseline",
] as const

/** 决策记录闭集（ADR D2 / M8）—— ADR 或验收报告。 */
export const DECISION_RECORD_ROOTS = ["docs/adr", ".rddf/reviews"] as const

/** registry 文件位置（相对仓库根）。 */
export const REGISTRY_PATH = ".rddf/rollback/registry.json"
/** 清单目录（相对仓库根）。 */
export const ROLLBACK_DIR = ".rddf/rollback/"
/** 债指针目录（相对仓库根）—— 每个 `unmanifested` 机制一个文件。 */
export const PENDING_DIR = ".rddf/rollback/pending/"

export interface RegistryEntry {
  mechanism: string
  adr_primary: string
  adr_related?: string[]
  state: RegistryState
  /**
   * `declared` ⇒ 未来路径（机制**未**落地）；
   * `unmanifested` / `proving` ⇒ 当前已存在的路径（机制在跑的锚点）。
   */
  watch?: string[]
  /** 仅 `unmanifested` 必填：逐机制债指针（必须 = `pending/<mechanism>.md`）。 */
  pending_backlog?: string
  exempt_class?: string
  exempt_evidence?: string
  retired_at?: string
  retired_evidence?: string
  notes?: string
}

export interface RegistryFile {
  version: 1
  entries: RegistryEntry[]
}

export class RegistryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface RegistryProblem {
  /** 判据编号（M1…M8 / V8 / V10 …）—— 报错必须指向**判据**，不是「顺带红了别的」。 */
  code: string
  mechanism: string
  detail: string
}

export interface RegistryCheckResult {
  problems: RegistryProblem[]
  /** 五态计数（V11：退化可见性）。 */
  census: Record<RegistryState, number>
}

/** 解析并校验 registry（schema 非法 ⇒ 抛；fail-closed）。 */
export function parseRegistry(raw: string): RegistryFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e: any) {
    throw new RegistryError("schema_invalid", `registry 不是合法 JSON：${e?.message ?? e}`)
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RegistryError("schema_invalid", "registry 必须是 JSON 对象")
  }
  const r = parsed as Record<string, unknown>
  if (r.version !== 1) throw new RegistryError("schema_invalid", `registry.version 必须是 1（实际 ${JSON.stringify(r.version)}）`)
  if (!Array.isArray(r.entries)) throw new RegistryError("schema_invalid", "registry.entries 必须是数组")
  const entries: RegistryEntry[] = []
  const seen = new Set<string>()
  for (const [i, raw2] of r.entries.entries()) {
    if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) {
      throw new RegistryError("schema_invalid", `entries[${i}] 必须是对象`)
    }
    const e = raw2 as Record<string, unknown>
    if (typeof e.mechanism !== "string" || e.mechanism.length === 0) {
      throw new RegistryError("schema_invalid", `entries[${i}].mechanism 必须是非空字符串`)
    }
    if (seen.has(e.mechanism)) throw new RegistryError("schema_invalid", `mechanism 重复：${e.mechanism}`)
    seen.add(e.mechanism)
    if (typeof e.adr_primary !== "string" || e.adr_primary.length === 0) {
      throw new RegistryError("schema_invalid", `entries[${i}].adr_primary 必须是非空字符串`)
    }
    if (!REGISTRY_STATES.includes(e.state as RegistryState)) {
      throw new RegistryError("schema_invalid", `entries[${i}].state 非法：${JSON.stringify(e.state)}（闭集：${REGISTRY_STATES.join(" | ")}）`)
    }
    if (e.adr_related !== undefined && !Array.isArray(e.adr_related)) {
      throw new RegistryError("schema_invalid", `entries[${i}].adr_related 必须是数组`)
    }
    if (e.watch !== undefined && !Array.isArray(e.watch)) {
      throw new RegistryError("schema_invalid", `entries[${i}].watch 必须是数组`)
    }
    entries.push(e as unknown as RegistryEntry)
  }
  return { version: 1, entries }
}

const isSha = (s: unknown): boolean => typeof s === "string" && /^[0-9a-f]{40}$/.test(s)
const isDate = (s: unknown): boolean => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** 去掉 `last_drill` 后的清单内容（V8 的内容比对要排除它，否则自指回归）。 */
export function stripLastDrill(m: unknown): unknown {
  if (!m || typeof m !== "object" || Array.isArray(m)) return m
  const c = { ...(m as Record<string, unknown>) }
  delete c.last_drill
  return c
}

/**
 * **规范化**：递归排序对象的 key（数组**保持原序** —— `edits[]` 的顺序是语义的一部分）。
 *
 * ⚠ 键序**不是**实质改动 ⇒ 规范化后哈希与键序无关 ⇒ 重排 key 不会误判「清单变过」。
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src).sort()) out[k] = canonicalize(src[k])
    return out
  }
  return value
}

/**
 * 清单（**去掉 `last_drill`**）的规范内容哈希 —— V8 的判据形态。
 *
 * 为什么用哈希而不是 `git show <sha>:<file>`：后者的谓词是「该 commit 处的清单内容 == 当前内容」，
 * 哈希给的是**同一谓词**（内容是否变过）却**不依赖 git 历史** ⇒ 零 git、零成本、不占真实仓预算。
 * ⚠ 哈希**排除 `last_drill` 字段** ⇒ 回填证据本身不会改变哈希（无自指回归）。
 * ⚠ 哈希**规范化后**（递归排序 key）计算 ⇒ 键序无关（ADR D7 / V8）。
 */
export function contentHash(manifest: unknown): string {
  const canonical = JSON.stringify(canonicalize(stripLastDrill(manifest)))
  return createHash("sha256").update(canonical).digest("hex")
}

function listDir(root: string, rel: string): string[] {
  const abs = path.join(root, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs).filter((f) => !f.startsWith("."))
}

export interface CheckOptions {
  /**
   * 读取**某个 commit 处**的文件内容（V8 的**可选** git 侧交叉核对）。
   *
   * ⚠ **不注入也不影响 V8 的判定** —— 主判据是**内容哈希**（不依赖 git）⇒
   *   未注入时**照判**（不再 fail-open）；注入时额外核对「`sha` 处的内容 == 当前内容」
   *   （补上「`sha` 与哈希各说各话」的那个窗口，见 ADR U10②）。
   */
  readAt?: (sha: string, rel: string) => string | null
}

export function checkRegistry(root: string, reg: RegistryFile, opts: CheckOptions = {}): RegistryCheckResult {
  const problems: RegistryProblem[] = []
  const census: Record<RegistryState, number> = {
    declared: 0,
    unmanifested: 0,
    proving: 0,
    active: 0,
    retired: 0,
    exempt: 0,
  }
  const abs = (rel: string) => path.join(root, rel)
  const exists = (rel: string) => existsSync(abs(rel))
  const read = (rel: string) => readFileSync(abs(rel), "utf8")

  /**
   * V8 的证据检查（`active` ⇒ 证据必填；`proving` ⇒ 证据可缺失，但**一旦存在就必须新鲜**）。
   *
   * 判据形态 = **内容比对**（去掉 `last_drill` 后算哈希）⇒ 零 git、零成本、不占真实仓预算。
   * ⚠ 「sha 之后是否实质改过」用**提交号**比对会**自指回归**（回填 sha 本身要再提交 ⇒ 永远「晚于」）。
   */
  const checkDrillEvidence = (
    mechanism: string,
    rel: string,
    ldObj: Record<string, unknown>,
    o: CheckOptions,
    out: RegistryProblem[],
  ): void => {
    if (!isSha(ldObj.sha)) out.push({ code: "V8", mechanism, detail: `last_drill.sha 形状非法：${String(ldObj.sha)}` })
    if (!isDate(ldObj.at)) out.push({ code: "V8", mechanism, detail: `last_drill.at 形状非法：${String(ldObj.at)}` })
    if (ldObj.result !== "pass") {
      out.push({ code: "V8", mechanism, detail: `last_drill.result 非 pass：${String(ldObj.result)}` })
    }
    const nowHash = contentHash(JSON.parse(read(rel)))
    const recorded = ldObj.content_hash
    if (typeof recorded !== "string" || recorded.length !== 64) {
      out.push({ code: "V8", mechanism, detail: "last_drill 缺 content_hash（V8 的判据字段）" })
    } else if (recorded !== nowHash) {
      out.push({
        code: "V8",
        mechanism,
        detail: `清单在 last_drill（sha ${String(ldObj.sha).slice(0, 8)}）之后被实质改动过 ⇒ 须同批重跑 drill 并回填 last_drill`,
      })
    }
    // 可选：git 侧的历史比对（调用方注入时才有；未注入 ⇒ 不假装判过）
    if (o.readAt && isSha(ldObj.sha)) {
      const at = o.readAt(ldObj.sha as string, rel)
      if (at === null) {
        out.push({ code: "V8", mechanism, detail: `无法读取 ${ldObj.sha} 处的清单（该提交可能不含此文件）` })
      } else {
        const before = stripLastDrill(JSON.parse(at))
        const now = stripLastDrill(JSON.parse(read(rel)))
        if (JSON.stringify(before) !== JSON.stringify(now)) {
          out.push({
            code: "V8",
            mechanism,
            detail: `清单在 last_drill.sha（${String(ldObj.sha).slice(0, 8)}）之后被实质改动过 ⇒ 须同批重跑 drill 并回填 sha`,
          })
        }
      }
    }
  }

  const manifestFiles = listDir(root, ROLLBACK_DIR).filter((f) => f.endsWith(".json") && f !== "registry.json")
  const manifests = new Map<string, { rel: string; m: Manifest }>()
  for (const f of manifestFiles) {
    const rel = `${ROLLBACK_DIR}${f}`
    try {
      manifests.set(f.replace(/\.json$/, ""), { rel, m: parseManifest(read(rel)) })
    } catch (e: any) {
      problems.push({ code: "manifest_invalid", mechanism: f, detail: `清单解析失败：${e?.message ?? e}` })
    }
  }

  // ── M8：指针闭集（全部状态）───────────────────────────────────────────────
  const inDecisionClosure = (rel: string): boolean => {
    if (!rel.endsWith(".md")) return false
    if (rel.startsWith("docs/adr/")) return true
    if (rel.startsWith(".rddf/reviews/") && rel.endsWith("-verify.md")) return true
    return false
  }
  for (const e of reg.entries) {
    census[e.state] = (census[e.state] ?? 0) + 1
    if (!exists(e.adr_primary)) {
      problems.push({ code: "M8", mechanism: e.mechanism, detail: `adr_primary 不存在：${e.adr_primary}` })
    } else if (!inDecisionClosure(e.adr_primary)) {
      problems.push({
        code: "M8",
        mechanism: e.mechanism,
        detail: `adr_primary 不在决策记录闭集内（${DECISION_RECORD_ROOTS.join(" / ")}）：${e.adr_primary}`,
      })
    }
    // M5：豁免证据不得自证
    if (e.exempt_evidence && (e.exempt_evidence === e.adr_primary || e.exempt_evidence === REGISTRY_PATH)) {
      problems.push({ code: "M5", mechanism: e.mechanism, detail: "exempt_evidence 指向自身（自证不算证据）" })
    }
    // M7：债指针只属 `unmanifested`（全状态卫生 —— 其它状态挂着它 ⇒ 表态与状态不一致）
    if (e.pending_backlog && e.state !== "unmanifested") {
      problems.push({
        code: "M7",
        mechanism: e.mechanism,
        detail: `pending_backlog 只属 unmanifested（当前 state=${e.state}）`,
      })
    }
  }

  // ── M1：ADR 全集 == registry 覆盖集（只统计 docs/adr/ 的 adr_primary）────────
  const adrFiles = listDir(root, "docs/adr").filter((f) => f.endsWith(".md")).map((f) => `docs/adr/${f}`)
  const covered = new Set(reg.entries.filter((e) => e.adr_primary.startsWith("docs/adr/")).map((e) => e.adr_primary))
  for (const a of adrFiles) {
    if (!covered.has(a)) problems.push({ code: "M1", mechanism: a, detail: "ADR 未被 registry 覆盖（沉默 = 违规）" })
  }
  for (const c of covered) {
    if (!adrFiles.includes(c)) problems.push({ code: "M1", mechanism: c, detail: "registry 指向的 ADR 不存在" })
  }

  // ── M1（第二子句）：清单文件集合 == (active ∪ proving) 的 mechanism 集合（双向）────
  const manifestMechanisms = new Set(manifests.keys())
  const withManifest = new Set(
    reg.entries.filter((e) => e.state === "active" || e.state === "proving").map((e) => e.mechanism),
  )
  for (const name of manifestMechanisms) {
    if (!withManifest.has(name)) {
      problems.push({
        code: "M1",
        mechanism: name,
        detail: "清单文件存在但 registry 无对应条目（须登记为 active / proving）",
      })
    }
  }
  for (const m of withManifest) {
    if (!manifestMechanisms.has(m)) {
      problems.push({ code: "M1", mechanism: m, detail: "registry 条目缺对应的清单文件" })
    }
  }

  // ── 逐状态判据 ──────────────────────────────────────────────────────────
  for (const e of reg.entries) {
    const manifest = manifests.get(e.mechanism)
    switch (e.state) {
      case "proving": {
        // 过渡态：清单已写、机制已落地、**演练证据待回填**
        if (!manifest) {
          problems.push({ code: "M2", mechanism: e.mechanism, detail: "proving 条目缺清单（应为 .rddf/rollback/<mechanism>.json）" })
          break
        }
        if (manifest.m.adr !== e.adr_primary) {
          problems.push({
            code: "M2",
            mechanism: e.mechanism,
            detail: `清单的 adr（${manifest.m.adr ?? "(无)"}）!= registry 的 adr_primary（${e.adr_primary}）`,
          })
        }
        if (e.pending_backlog) {
          problems.push({ code: "M7", mechanism: e.mechanism, detail: "proving 已有清单 ⇒ 不得再挂债指针（债指针只属 unmanifested）" })
        }
        // 已落地 ⇒ watch 每条当前都存在
        if (!e.watch || e.watch.length === 0) {
          problems.push({ code: "M7", mechanism: e.mechanism, detail: "proving 缺 watch[]（机制在跑的锚点）" })
        } else {
          for (const w of e.watch) {
            if (!exists(w)) problems.push({ code: "M7", mechanism: e.mechanism, detail: `watch 路径不存在（机制已不在跑 ⇒ 重新定性）：${w}` })
          }
        }
        // 证据**可缺失**（这正是过渡态的含义）⇒ 但**一旦存在就必须新鲜**（V8 照判）
        const ld = (manifest.m as unknown as Record<string, unknown>).last_drill
        if (ld !== undefined) {
          checkDrillEvidence(e.mechanism, manifest.rel, ld as Record<string, unknown>, opts, problems)
        }
        break
      }
      case "active": {
        if (!manifest) {
          problems.push({ code: "M2", mechanism: e.mechanism, detail: "active 条目缺清单（应为 .rddf/rollback/<mechanism>.json）" })
          break
        }
        if (manifest.m.adr !== e.adr_primary) {
          problems.push({
            code: "M2",
            mechanism: e.mechanism,
            detail: `清单的 adr（${manifest.m.adr ?? "(无)"}）!= registry 的 adr_primary（${e.adr_primary}）`,
          })
        }
        // V8：证据形状 + 内容比对（active ⇒ 证据**必填**）
        const ld = (manifest.m as unknown as Record<string, unknown>).last_drill
        if (!ld || typeof ld !== "object") {
          problems.push({ code: "V8", mechanism: e.mechanism, detail: "清单缺 last_drill{sha,at,result}" })
          break
        }
        checkDrillEvidence(e.mechanism, manifest.rel, ld as Record<string, unknown>, opts, problems)
        break
      }
      case "unmanifested": {
        if (manifest) {
          problems.push({ code: "M7", mechanism: e.mechanism, detail: "unmanifested 条目不得有清单（写了就转 active）" })
        }
        const want = `${PENDING_DIR}${e.mechanism}.md`
        if (e.pending_backlog !== want) {
          problems.push({ code: "M7", mechanism: e.mechanism, detail: `pending_backlog 必须是 ${want}（按机制命名），实际 ${String(e.pending_backlog)}` })
        } else if (!exists(want)) {
          problems.push({ code: "M7", mechanism: e.mechanism, detail: `债指针文件不存在：${want}` })
        }
        if (!e.watch || e.watch.length === 0) {
          problems.push({ code: "M7", mechanism: e.mechanism, detail: "unmanifested 缺 watch[]（机制在跑的锚点）" })
        } else {
          for (const w of e.watch) {
            if (!exists(w)) problems.push({ code: "M7", mechanism: e.mechanism, detail: `watch 路径不存在（机制已不在跑 ⇒ 重新定性）：${w}` })
          }
        }
        break
      }
      case "declared": {
        if (!e.watch || e.watch.length === 0) {
          problems.push({ code: "M4", mechanism: e.mechanism, detail: "declared 缺 watch[]（未来路径）" })
        } else {
          for (const w of e.watch) {
            if (exists(w)) {
              problems.push({ code: "M4", mechanism: e.mechanism, detail: `watch 路径已存在（实现已落地 ⇒ 必须转 active 或合法 exempt）：${w}` })
            }
          }
        }
        break
      }
      case "exempt": {
        if (manifest) {
          problems.push({ code: "M3", mechanism: e.mechanism, detail: "exempt 条目不得有清单" })
        }
        if (!e.exempt_class || !EXEMPT_CLASSES.includes(e.exempt_class as (typeof EXEMPT_CLASSES)[number])) {
          problems.push({
            code: "M3",
            mechanism: e.mechanism,
            detail: `exempt_class 非法：${String(e.exempt_class)}（闭集：${EXEMPT_CLASSES.join(" | ")}）`,
          })
        }
        if (!e.exempt_evidence) {
          problems.push({ code: "M3", mechanism: e.mechanism, detail: "exempt 缺 exempt_evidence（必须指向存在的文件）" })
        } else if (!exists(e.exempt_evidence)) {
          problems.push({ code: "M3", mechanism: e.mechanism, detail: `exempt_evidence 不存在：${e.exempt_evidence}` })
        }
        if (e.exempt_class === "not-implemented") {
          if (!e.watch || e.watch.length === 0) {
            problems.push({ code: "M3", mechanism: e.mechanism, detail: "not-implemented 缺 watch[]（未来路径）" })
          } else {
            for (const w of e.watch) {
              if (exists(w)) {
                problems.push({ code: "M3", mechanism: e.mechanism, detail: `not-implemented 的 watch 路径已存在（实现已落地）：${w}` })
              }
            }
          }
        }
        break
      }
      case "retired": {
        if (manifest) {
          problems.push({ code: "M6", mechanism: e.mechanism, detail: "retired 条目不得留清单（清单的 find 必然不匹配 ⇒ 恒红）" })
        }
        if (!isDate(e.retired_at)) {
          problems.push({ code: "M6", mechanism: e.mechanism, detail: `retired_at 形状非法：${String(e.retired_at)}` })
        }
        if (!e.retired_evidence) {
          problems.push({ code: "M6", mechanism: e.mechanism, detail: "retired 缺 retired_evidence" })
        } else if (!exists(e.retired_evidence)) {
          problems.push({ code: "M6", mechanism: e.mechanism, detail: `retired_evidence 不存在：${e.retired_evidence}` })
        }
        break
      }
    }
  }

  // ── M7 债文件集合 == unmanifested 集合（双向）──────────────────────────────
  const pendingFiles = listDir(root, PENDING_DIR).filter((f) => f.endsWith(".md"))
  const unmanifested = new Set(reg.entries.filter((e) => e.state === "unmanifested").map((e) => e.mechanism))
  for (const f of pendingFiles) {
    const m = f.replace(/\.md$/, "")
    if (!unmanifested.has(m)) {
      problems.push({ code: "M7", mechanism: m, detail: `债文件存在但无对应 unmanifested 条目：${PENDING_DIR}${f}` })
    }
  }
  for (const m of unmanifested) {
    if (!pendingFiles.includes(`${m}.md`)) {
      problems.push({ code: "M7", mechanism: m, detail: `unmanifested 条目缺债文件：${PENDING_DIR}${m}.md` })
    }
  }

  // ── M5：清单形态（防空壳）────────────────────────────────────────────────
  for (const [name, { m }] of manifests) {
    for (const [i, e] of (m.edits ?? []).entries()) {
      if (e.find === e.replace) {
        problems.push({ code: "M5", mechanism: name, detail: `edits[${i}] 的 find == replace（no-op 不算回滚）` })
      }
    }
    const cmds = m.verify?.commands ?? []
    const meaningful = cmds.some((c) => ["bun", "bash", "node", "python3"].includes(c[0] ?? ""))
    if (!meaningful) {
      problems.push({ code: "M5", mechanism: name, detail: "verify.commands 里没有可判据的验证命令（如 bun/bash/node）" })
    }
  }

  // ── V10：文档登记 ────────────────────────────────────────────────────────
  const testsReadme = "tests/README.md"
  if (exists(testsReadme) && !read(testsReadme).includes("rollback-registry.test.ts")) {
    problems.push({ code: "V10", mechanism: "tests/README.md", detail: "覆盖表未登记新守卫（第四态）" })
  }
  const rbReadme = `${ROLLBACK_DIR}README.md`
  if (exists(rbReadme)) {
    const t = read(rbReadme)
    if (!t.includes("registry.json")) {
      problems.push({ code: "V10", mechanism: rbReadme, detail: "未指向 registry.json（清单表应改为派生/指向 registry，避免第三份手工清单）" })
    }
  }

  return { problems, census }
}
