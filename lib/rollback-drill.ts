/**
 * rollback-drill —— **回滚可达性**的机械验证（纯逻辑层）
 *
 * ## 它回答什么
 *
 * 「这个机制退役（回滚）之后，仓库还自洽吗？」
 *
 * 散文形态的回滚路径（如 `ADR-commit-verification-gate` 的「回滚路径」段）**不可机判**：
 * 2026-11-20 的隔离副本演练实测证明，按散文执行）会有三种静默失效 ——
 * ① **整文件还原**会把机制之后的无关变更一起回退（实测 11 红）；
 * ② **符号链接**（本仓 `opencode.jsonc → opencode.jsonc.opencode-go`）上「还原链接」静默无效；
 * ③ **守卫期望 / 测试**不随机制同批复原 ⇒ 删完仍红（实测 1–2 红）。
 *
 * ⇒ 把回滚路径写成**清单**（`delete` + `edits`），由本模块在**隔离副本**里执行并跑验证命令。
 *
 * ## 判据（fail-closed）
 *
 * - 清单 schema 非法 ⇒ 抛（不猜意图）；
 * - `delete` 的目标**必须存在**（不存在 ⇒ 清单已漂移，红）；
 * - `edits.find` 在目标文件里**必须出现恰好 1 次**（0 次 ⇒ 漂移；≥2 次 ⇒ 无法确定改哪一处 ⇒ 红）；
 * - 路径**必须**是仓库内相对路径（拒绝绝对路径与 `..`）—— 否则 drill 可能改写仓库外的文件。
 * - `retire[]`（**结构化退役**，ADR 第 7 轮 / V16）⇒ 六条 fail-closed 约束：registry 存在可解析、
 *   条目存在且组内不重名、来源态 ∈ {`active`,`proving`}、同清单归属、与「删登记面」互斥、
 *   与「edits 触碰登记面」互斥；校验材料 = **应用前**的 registry 原文（不按可变字段 ⇒ 无状态自指）。
 *
 * ⚠ **已知理论面（当前不可触发）**：读写会**跟随**仓库内**被追踪的符号链接** ⇒ 若清单的 `path` 落在一条
 *   指向 clone 外的被追踪链接上，理论上可改写 clone 外文件。本仓唯一的被追踪链接
 *   `opencode.jsonc → opencode.jsonc.opencode-go` 是**相对**链接 ⇒ clone 内仍指内部 ⇒ 当前不可触发。
 *
 * 「恰好 1 次」是这套机制的核心：清单与代码**同漂**。措辞一改，drill 立刻红 ⇒
 * 逼人更新清单，而不是静默变成 no-op。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

export class DrillError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface ManifestEdit {
  /** 仓库内相对路径 */
  path: string
  /** 必须**恰好出现 1 次**的原文 */
  find: string
  /** 替换成（空串 = 删除该片段） */
  replace: string
}

export interface Manifest {
  version: 1
  /** 机制名（用于报告 / 与 `.rddf/rollback/<mechanism>.json` 对齐） */
  mechanism: string
  /** 关联 ADR（可选，仅用于报告）—— **组清单**：组内核的引入 ADR */
  adr?: string
  /**
   * **组清单**声明的其余决策记录（`ADR-rollback-manifest-enforcement` 的 M2）：
   * 组内各机制的 ADR 逐条列在这里 ⇒ 机器判「清单声明集 == 指向它的条目的
   * `adr_primary` 集（双向）」⇒ 一份清单不能声明没人指的 ADR，也不能漏声明。
   */
  adr_related?: string[]
  /** 覆盖面说明（可选，人会读） */
  notes?: string
  /** 删除的文件（仓库内相对路径） */
  delete?: string[]
  /**
   * **结构化退役**（ADR-rollback-manifest-enforcement 第 7 轮 / V16）：机制名列表 ——
   * drill 在隔离副本里把 registry 里对应的条目转 `retired`
   * （`retired_at` = 执行日、`retired_evidence` = 该条目 `adr_primary`、
   * 撤 `watch` / `manifest_ref` / `pending_backlog`）。
   *
   * ⚠ **为什么不用 `edits` 表达**：literal `find` 必须逐字锚定条目**当前状态文本**
   *   （`proving` / `active` 随证据流转）⇒ 同一份清单无法同时适用于过渡态与稳态
   *   （**状态自指**）⇒ 结构化操作只依赖条目**身份**（mechanism），不依赖可变字段。
   * ⚠ 校验材料 = **应用前**的 registry 原文（fail-closed，六条约束见 ADR 的 V16）。
   */
  retire?: string[]
  /** 逐段改（禁止整文件还原 —— 实测会误伤无关变更） */
  edits?: ManifestEdit[]
  /** **演练环境准备**（不属于回滚步骤）：clone 缺 gitignored 运行态时必须先补，否则验证会假红 */
  drill_env?: { seed_files?: Array<{ path: string; content: string }> }
  /** 验证命令（argv 数组）；缺省 = `[[bun","test","tests/"]]` */
  verify?: { commands?: string[][] }
  /**
   * **演练证据**（`ADR-rollback-manifest-enforcement` V8）：最近一次隔离副本演练的结果。
   * - `sha`：被演练的那个 commit（**溯源**用）；
   * - `at`：演练日期（YYYY-MM-DD）；
   * - `result`：`pass` / `fail`；
   * - `content_hash`：**去掉本字段后**清单内容的 sha256 —— 清单在演练之后被**实质改动**
   *   ⇒ 哈希不再匹配 ⇒ 红（V8 的判据形态：**按内容比对**，不依赖 git 历史 ⇒ 零成本、零 git）。
   * ⚠ drill 基于 HEAD ⇒ 只对那一个 commit 的**内容**成立 ⇒ 清单实质改动后必须同批重跑并回填。
   */
  last_drill?: { sha: string; at: string; result: string; content_hash?: string }
}

export const DEFAULT_VERIFY: string[][] = [["bun", "test", "tests/"]]

/** 仓库内相对路径判据（拒绝绝对路径 / `..` / 空段）。 */
export function assertSafeRelPath(p: unknown, where: string): asserts p is string {
  if (typeof p !== "string" || p.length === 0) throw new DrillError("schema_invalid", `${where} 必须是非空字符串`)
  if (path.isAbsolute(p)) throw new DrillError("unsafe_path", `${where} 不得是绝对路径：${p}`)
  const norm = p.replace(/\\/g, "/")
  if (norm.split("/").some((seg) => seg === "..")) throw new DrillError("unsafe_path", `${where} 不得含 ".."：${p}`)
}

/** 解析并校验清单（schema 非法 ⇒ 抛）。 */
export function parseManifest(raw: string): Manifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e: any) {
    throw new DrillError("schema_invalid", `清单不是合法 JSON：${e?.message ?? e}`)
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DrillError("schema_invalid", "清单必须是 JSON 对象")
  }
  const m = parsed as Record<string, unknown>
  if (m.version !== 1) throw new DrillError("schema_invalid", `version 必须是 1（实际 ${JSON.stringify(m.version)}）`)
  if (typeof m.mechanism !== "string" || m.mechanism.length === 0) {
    throw new DrillError("schema_invalid", "mechanism 必须是非空字符串")
  }
  if (m.adr !== undefined && typeof m.adr !== "string") throw new DrillError("schema_invalid", "adr 必须是字符串")
  if (m.adr_related !== undefined) {
    if (!Array.isArray(m.adr_related)) throw new DrillError("schema_invalid", "adr_related 必须是数组")
    for (const [i, a] of m.adr_related.entries()) {
      if (typeof a !== "string" || a.length === 0) {
        throw new DrillError("schema_invalid", `adr_related[${i}] 必须是非空字符串`)
      }
    }
  }
  if (m.notes !== undefined && typeof m.notes !== "string") throw new DrillError("schema_invalid", "notes 必须是字符串")

  const retire = m.retire ?? []
  if (!Array.isArray(retire)) throw new DrillError("schema_invalid", "retire 必须是数组")
  for (const [i, n] of retire.entries()) {
    if (typeof n !== "string" || n.length === 0) {
      throw new DrillError("schema_invalid", `retire[${i}] 必须是非空字符串`)
    }
  }

  const del = m.delete ?? []
  if (!Array.isArray(del)) throw new DrillError("schema_invalid", "delete 必须是数组")
  for (const [i, p] of del.entries()) assertSafeRelPath(p, `delete[${i}]`)

  const edits = m.edits ?? []
  if (!Array.isArray(edits)) throw new DrillError("schema_invalid", "edits 必须是数组")
  for (const [i, e] of edits.entries()) {
    if (!e || typeof e !== "object" || Array.isArray(e)) throw new DrillError("schema_invalid", `edits[${i}] 必须是对象`)
    const ed = e as Record<string, unknown>
    assertSafeRelPath(ed.path, `edits[${i}].path`)
    if (typeof ed.find !== "string" || ed.find.length === 0) {
      throw new DrillError("schema_invalid", `edits[${i}].find 必须是非空字符串`)
    }
    if (typeof ed.replace !== "string") throw new DrillError("schema_invalid", `edits[${i}].replace 必须是字符串`)
  }
  if (del.length === 0 && edits.length === 0) {
    throw new DrillError("schema_invalid", "delete 与 edits 不能同时为空（空回滚没有意义）")
  }

  const verify = m.verify
  if (verify !== undefined) {
    if (!verify || typeof verify !== "object" || Array.isArray(verify)) {
      throw new DrillError("schema_invalid", "verify 必须是对象")
    }
    const cmds = (verify as Record<string, unknown>).commands
    if (cmds !== undefined) {
      if (!Array.isArray(cmds) || cmds.length === 0) throw new DrillError("schema_invalid", "verify.commands 必须是非空数组")
      for (const [i, c] of cmds.entries()) {
        if (!Array.isArray(c) || c.length === 0 || c.some((x) => typeof x !== "string")) {
          throw new DrillError("schema_invalid", `verify.commands[${i}] 必须是字符串 argv 数组`)
        }
      }
    }
  }

  const lastDrill = m.last_drill
  if (lastDrill !== undefined) {
    if (!lastDrill || typeof lastDrill !== "object" || Array.isArray(lastDrill)) {
      throw new DrillError("schema_invalid", "last_drill 必须是对象")
    }
    const ld = lastDrill as Record<string, unknown>
    if (typeof ld.sha !== "string" || typeof ld.at !== "string" || typeof ld.result !== "string") {
      throw new DrillError("schema_invalid", "last_drill 必须是 {sha, at, result} 三个字符串")
    }
    if (ld.content_hash !== undefined && typeof ld.content_hash !== "string") {
      throw new DrillError("schema_invalid", "last_drill.content_hash 必须是字符串")
    }
  }

  const drillEnv = m.drill_env
  if (drillEnv !== undefined) {
    if (!drillEnv || typeof drillEnv !== "object" || Array.isArray(drillEnv)) {
      throw new DrillError("schema_invalid", "drill_env 必须是对象")
    }
    const seeds = (drillEnv as Record<string, unknown>).seed_files
    if (seeds !== undefined) {
      if (!Array.isArray(seeds)) throw new DrillError("schema_invalid", "drill_env.seed_files 必须是数组")
      for (const [i, s] of seeds.entries()) {
        if (!s || typeof s !== "object" || Array.isArray(s)) throw new DrillError("schema_invalid", `drill_env.seed_files[${i}] 必须是对象`)
        const row = s as Record<string, unknown>
        assertSafeRelPath(row.path, `drill_env.seed_files[${i}].path`)
        if (typeof row.content !== "string") throw new DrillError("schema_invalid", `drill_env.seed_files[${i}].content 必须是字符串`)
      }
    }
  }

  return {
    version: 1,
    mechanism: m.mechanism,
    ...(m.adr !== undefined ? { adr: m.adr as string } : {}),
    ...(m.adr_related !== undefined ? { adr_related: m.adr_related as string[] } : {}),
    ...(m.notes !== undefined ? { notes: m.notes as string } : {}),
    delete: del as string[],
    ...(retire.length > 0 ? { retire: retire as string[] } : {}),
    edits: edits as ManifestEdit[],
    ...(verify !== undefined ? { verify: verify as { commands?: string[][] } } : {}),
    ...(lastDrill !== undefined ? { last_drill: lastDrill as { sha: string; at: string; result: string; content_hash?: string } } : {}),
    ...(drillEnv !== undefined ? { drill_env: drillEnv as { seed_files?: Array<{ path: string; content: string }> } } : {}),
  }
}

export type ProblemKind = "missing_file" | "find_count" | "path_overlap" | "retire_invalid"

export interface DrillProblem {
  kind: ProblemKind
  path: string
  detail: string
}

/** 统计 `needle` 在 `haystack` 里的出现次数（不重叠）。 */
export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0
  let n = 0
  let i = 0
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n++
    i += needle.length
  }
  return n
}

export interface PlannedWrite {
  path: string
  before: string
  after: string
}

export interface DrillPlan {
  deletions: string[]
  writes: PlannedWrite[]
  problems: DrillProblem[]
}

/**
 * 清单路径的**判同键**（与 `path.resolve` 语义对齐）。
 *
 * ⚠ 必须同时吃掉三种写法差异，否则「同一文件两种写法」会被当成两件事：
 *   ① 反斜杠 `a\\b`；② 前导 `./`（`./a.txt` vs `a.txt`）；③ 内部的 `a//b` / `a/./b`。
 *   （`..` 与绝对路径已在 `assertSafeRelPath` 拒绝 ⇒ 这里不会因归一化引入越界。）
 * 不做归一化时有两个真实后果：`delete`/`edits` 重叠漏检（部分应用），以及同一文件被分成两组
 * 各产出一条 `PlannedWrite` ⇒ 后者覆盖前者（静默丢失）。
 */
const normRel = (p: string) => path.posix.normalize(p.replace(/\\/g, "/"))

/** 登记面的仓库内相对路径（`retire[]` 的作用对象）。 */
export const REGISTRY_REL = ".rddf/rollback/registry.json"

/**
 * **全量规划（只在内存里模拟，一个字节都不写）**。
 *
 * 两次校验都在这里完成：
 *   ① `delete` 目标必须存在；
 *   ② `delete` 与 `edits` **不得指向同一路径**（否则「先删后改」= 部分应用）；
 *   ③ 同一文件的多条 `edits` 按**声明顺序**依次作用在**运行中的内容**上，
 *      每一步都要求 `find` 在**当前内容**里恰好出现 1 次
 *      （⇒ 任一步的 `replace` 破坏了后续 `find` 的上下文 ⇒ 当场红，而不是静默 no-op）。
 *
 * `applyDrill` 直接用这里的 `after` 落盘 ⇒ dry-run 与 apply **走同一条判据路径**。
 */
export function planDrill(m: Manifest, root: string): DrillPlan {
  const problems: DrillProblem[] = []
  const deletions: string[] = []
  const writes: PlannedWrite[] = []

  const deleteSet = new Set((m.delete ?? []).map(normRel))
  for (const p of m.delete ?? []) {
    if (!existsSync(path.resolve(root, p))) {
      problems.push({ kind: "missing_file", path: p, detail: "delete 目标不存在（清单已漂移？）" })
      continue
    }
    deletions.push(p)
  }

  // 同一路径既删又改 ⇒ 拒绝（防部分应用）
  for (const e of m.edits ?? []) {
    if (deleteSet.has(normRel(e.path))) {
      problems.push({ kind: "path_overlap", path: e.path, detail: "同一路径同时出现在 delete 与 edits ⇒ 会造成部分应用" })
    }
  }

  // ── `retire[]`：结构化退役（ADR 第 7 轮 / V16）─────────────────────────────
  // ⚠ **校验材料 = 应用前的 registry 原文**（必须在 edits 模拟之前读）——
  //    否则「edits 改 registry」会以另一种形态制造状态自指。
  // ⚠ 六条 fail-closed 约束（编号与 ADR 的 V16 逐条对齐）：① registry 存在可解析
  //    ② 条目存在且组内不重名 ③ 来源态 ∈ {active, proving} ④ 同清单归属
  //    ⑤ 与「删整个登记面」互斥 ⑥ 与「edits 触碰 registry」互斥。
  if ((m.retire ?? []).length > 0) {
    const names = m.retire!
    const regAbs = path.resolve(root, REGISTRY_REL)

    if (deleteSet.has(REGISTRY_REL)) {
      problems.push({
        kind: "retire_invalid",
        path: REGISTRY_REL,
        detail: "清单同时声明 retire[] 与 delete registry.json ⇒ 两种退役通道互斥",
      })
    }
    for (const e of m.edits ?? []) {
      if (normRel(e.path) === REGISTRY_REL) {
        problems.push({
          kind: "retire_invalid",
          path: e.path,
          detail: "清单同时声明 retire[] 与 edits 触碰 registry.json ⇒ 同一文件两条写入的胜负未定义",
        })
      }
    }

    if (!existsSync(regAbs)) {
      problems.push({ kind: "retire_invalid", path: REGISTRY_REL, detail: "registry 不存在（retire[] 需要登记面）" })
    } else {
      let reg: unknown = null
      try {
        reg = JSON.parse(readFileSync(regAbs, "utf8"))
      } catch (e: any) {
        problems.push({ kind: "retire_invalid", path: REGISTRY_REL, detail: `registry 不是合法 JSON：${e?.message ?? e}` })
      }
      const entries =
        reg && typeof reg === "object" && Array.isArray((reg as Record<string, unknown>).entries)
          ? ((reg as Record<string, unknown>).entries as Array<Record<string, unknown>>)
          : null
      if (reg && !entries) {
        problems.push({ kind: "retire_invalid", path: REGISTRY_REL, detail: "registry 缺 entries 数组" })
      }
      if (entries) {
        const dup = names.filter((n, i) => names.indexOf(n) !== i)
        if (dup.length > 0) {
          problems.push({
            kind: "retire_invalid",
            path: REGISTRY_REL,
            detail: `retire[] 内部重名：${[...new Set(dup)].join(", ")}`,
          })
        }
        const byName = new Map(entries.map((e) => [String(e.mechanism), e]))
        const today = new Date().toISOString().slice(0, 10)
        let bad = false
        for (const name of names) {
          const e = byName.get(name)
          if (!e) {
            problems.push({ kind: "retire_invalid", path: REGISTRY_REL, detail: `retire[] 指向的机制不存在：${name}` })
            bad = true
            continue
          }
          const st = String(e.state)
          if (st !== "active" && st !== "proving") {
            problems.push({
              kind: "retire_invalid",
              path: REGISTRY_REL,
              detail: `retire[] 的来源态非法：${name} 当前 ${st}（只允许 active / proving）`,
            })
            bad = true
            continue
          }
          if (e.manifest_ref !== m.mechanism) {
            problems.push({
              kind: "retire_invalid",
              path: REGISTRY_REL,
              detail: `retire[] 指向的条目不属于本清单：${name}（manifest_ref=${String(e.manifest_ref)}，本清单=${m.mechanism}）`,
            })
            bad = true
            continue
          }
          if (typeof e.adr_primary !== "string" || e.adr_primary.length === 0) {
            problems.push({
              kind: "retire_invalid",
              path: REGISTRY_REL,
              detail: `retire[] 的条目缺 adr_primary（retired_evidence 无从取值）：${name}`,
            })
            bad = true
            continue
          }
        }
        if (!bad) {
          // 结构化转态：**按身份**，不按可变字段 ⇒ 无状态自指
          for (const name of names) {
            const e = byName.get(name)!
            e.state = "retired"
            e.retired_at = today
            e.retired_evidence = e.adr_primary
            delete e.watch
            delete e.manifest_ref
            delete e.pending_backlog
          }
          writes.push({
            path: REGISTRY_REL,
            before: readFileSync(regAbs, "utf8"),
            after: JSON.stringify(reg, null, 2) + "\n",
          })
        }
      }
    }
  }

  // 按文件分组，保持声明顺序（⚠ 顺序有意义：后一条依赖前一条的落定内容）
  const byPath = new Map<string, ManifestEdit[]>()
  for (const e of m.edits ?? []) {
    const key = normRel(e.path) // ⚠ 判同键（`./a.txt` 与 `a.txt` 必须归到同一组，否则会两次写同一文件）
    if (deleteSet.has(key)) continue // 已在上面报过
    const list = byPath.get(key) ?? []
    list.push(e)
    byPath.set(key, list)
  }

  for (const [rel, edits] of byPath) {
    const abs = path.resolve(root, rel)
    if (!existsSync(abs)) {
      problems.push({ kind: "missing_file", path: rel, detail: "edits 目标不存在" })
      continue
    }
    const before = readFileSync(abs, "utf8")
    let buf = before
    let broken = false
    for (const [i, e] of edits.entries()) {
      const n = countOccurrences(buf, e.find)
      if (n !== 1) {
        problems.push({
          kind: "find_count",
          path: rel,
          detail: `第 ${i + 1} 条 edit 的 find 在当前内容里出现 ${n} 次（必须恰好 1 次）：${e.find.slice(0, 60).replace(/\n/g, "\\n")}…`,
        })
        broken = true
        break
      }
      buf = buf.replace(e.find, e.replace)
    }
    if (!broken) writes.push({ path: rel, before, after: buf })
  }

  return { deletions, writes, problems }
}

/**
 * 执行回滚：先 `planDrill`（全量模拟），有问题 ⇒ 抛；**不做部分应用**
 * （校验全部通过后才动磁盘：先写文件，再删文件）。
 */
export function applyDrill(m: Manifest, root: string): void {
  const plan = planDrill(m, root)
  if (plan.problems.length > 0) {
    throw new DrillError(
      "plan_failed",
      `[plan_failed]\n` + plan.problems.map((p) => `[${p.kind}] ${p.path}: ${p.detail}`).join("\n"),
    )
  }
  for (const w of plan.writes) writeFileSync(path.resolve(root, w.path), w.after)
  for (const p of plan.deletions) rmSync(path.resolve(root, p), { force: true })
}

/** 清单里声明的验证命令（缺省 `DEFAULT_VERIFY`）。 */
export function verifyCommands(m: Manifest): string[][] {
  return m.verify?.commands ?? DEFAULT_VERIFY
}

/**
 * **演练环境准备**（不属于回滚步骤）：补齐 clone 必然缺失的 gitignored 运行态。
 *
 * ⚠ 只在文件**不存在**时写入（绝不覆盖）；返回实际写入的路径（供报告）。
 */
export function seedDrillEnv(m: Manifest, root: string): string[] {
  const written: string[] = []
  for (const s of m.drill_env?.seed_files ?? []) {
    const abs = path.resolve(root, s.path)
    if (existsSync(abs)) continue
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, s.content)
    written.push(s.path)
  }
  return written
}
