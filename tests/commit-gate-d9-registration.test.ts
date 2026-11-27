/**
 * D9 十七项「三处登记」守卫（⑰ 由 D10 批次补入；①–⑯ 仍由已归档 change 的「十六项」小节承担） —— `ADR-commit-verification-gate` 的 **V10 机械载体**
 *
 * 判据真源：`docs/adr/ADR-commit-verification-gate.md` 的 **D9 表前言**（标识口径 + 三处载体）
 *          与 **V10**（「删掉任一处登记 ⇒ 红」）。
 *
 * ⚠ **本文件头即「测试注释」那一处登记**（三处 = AC 面 + 测试注释 + 主题文档）。
 *   形态：一行一项，只写「标识 + ADR 标题原文 + 指回 ADR」；**不复述**「防什么 / 不防什么 / 缓解」
 *   （那是 ADR 的决策列 = 唯一真源）。
 *
 * - **D9①** 声明文件可被改写 / 被弱化 ⇒ 见 ADR D9 表（判据真源）
 * - **D9②** 插件缺席 ⇒ 门禁不存在 ⇒ 见 ADR D9 表（判据真源）
 * - **D9③** 间接提交不在门禁内 ⇒ 见 ADR D9 表（判据真源）
 * - **D9④** 其它仓库不受门禁 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑤** 非交互路径能力扩张 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑥** 命令解析固有盲区 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑦** 语义类缺陷验证命令覆盖不到 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑧** saved approval 可能越过 D4 的 `deny` ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑨** 后端的提交面宽于其 edit 面 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑩** 字符串级判定的残余面 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑪** 判定对象以 shell 的 `workdir` 为准 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑫** 同一行多个 heredoc 只处理第一个 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑬** 命令行之外的强推不可见 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑭** 删除类 push 未纳入强推口径 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑮** 命令词的运行时 / 转义表还原不可静态判定 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑯** 引号包住的 `git` 子命令走 fail-closed 误拒 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑰** baseline 命中放行 ⇒ 见 ADR D9 表（判据真源）
 * - **D9⑱** 未声明仓的留痕是尽力而为 ⇒ 见 ADR D9 表（判据真源）
 */
import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")
const SELF = path.join(import.meta.dir, "commit-gate-d9-registration.test.ts")
const ADR_REL = "docs/adr/ADR-commit-verification-gate.md"
const MAD_REL = "docs/MULTI-AGENT-DESIGN.md"
/**
 * AC 面小节的**行首标题**（散文与反引号里的同名串不算 —— 见 AC5）。
 *
 * ⚠ **多标题兼容**（D10③′ 的计数从 16 涨到 17 时发现的陷阱）：若只把标题 bump 成
 * 「十七项」，`collectAcFaceFiles` 按**单一标题**收集 ⇒ **已归档 proposal 的「十六项」
 * 小节会全部掉出 AC 面并集** ⇒ D9①–⑯ 的 AC 面登记**静默消失** ⇒ 守卫红，而归档
 * proposal **不可回改**。⇒ 新标题 + **旧标题保留**，两面并集继续覆盖全部 id。
 */
const AC_HEADINGS = ["## D9 免宣称项登记（AC 面）", "## D9 十六项登记（AC 面）"] as const
/** 主题文档索引段的**行首标题前缀**（MAD 的 §2.8.x 是四级标题）。 */
const MAD_HEADING_RE = /^####\s+2\.8\.8\b/
/** 登记行：`- **D9①** <标题…>`（JSDoc 里先剥掉前导 `*`）。 */
const ENTRY_RE = /^\s*[-*]\s+\*\*(D9[①-⑳㉑-㉟]+)\*\*\s*(.*)$/
/** ADR 表行：`| ① | **标题** | 描述 |` —— ⚠ **不要求**加粗段紧邻 `|`（⑪ / ⑭ 的加粗段后面还有括注）。 */
const ADR_ROW_RE = /^\|\s*([①-⑳㉑-㉟])\s*\|\s*\*\*(.+?)\*\*/
/** 登记行与索引段的负向词（防「写个编号凑数」）。 */
const NEGATIVE = ["TODO", "待补", "待定", "不登记", "不适用", "不做"]

/** 去围栏代码块与 HTML 注释（区段作用域的前提：被注释掉 / 围起来的内容不算登记）。
 *  ⚠ **已知边界**：只剥**配对良好**的围栏 / 注释 ⇒ 未闭合的 `<!--` 或 `~~~` 之后的内容仍算登记
 *  （方向是**假绿**，且必须**故意手改**才能触发 ⇒ 与本仓「伪造关闭」同类，超出漂移威胁模型，登记不修）。 */
export function stripNoise(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
}

/** 比较口径：去反引号 + 空白归一（标题保真用）。 */
export function norm(s: string): string {
  return s.replace(/`/g, "").replace(/\s+/g, " ").trim()
}

/** 从 ADR 派生期望集：id = `D9` + `#` 列原文；title = 加粗段（⑪ / ⑭ 的括注留在 ADR 里）。 */
export function parseAdrItems(text: string): Array<{ id: string; title: string }> {
  const out: Array<{ id: string; title: string }> = []
  for (const line of stripNoise(text).split("\n")) {
    const m = ADR_ROW_RE.exec(line)
    if (m) out.push({ id: `D9${m[1]}`, title: m[2] as string })
  }
  return out
}

/** 取「行首标题」匹配处到 `stop` 之前的区段；匹配不到返回 null。 */
export function sectionOf(
  lines: string[],
  match: (line: string) => boolean,
  stop: (line: string) => boolean,
): string[] | null {
  const start = lines.findIndex((l) => match(l))
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => stop(l))
  return end === -1 ? rest : rest.slice(0, end)
}

/** 区段里的登记行。 */
export function registrationLines(lines: string[]): Array<{ id: string; rest: string }> {
  const out: Array<{ id: string; rest: string }> = []
  for (const line of lines) {
    const m = ENTRY_RE.exec(line)
    if (m) out.push({ id: m[1] as string, rest: m[2] as string })
  }
  return out
}

/** 文件头的 JSDoc → 去掉 `/**`、`*`、`*\/` 之后的行（首个代码行之前）。 */
export function headerOf(text: string): string[] {
  const lines = text.split("\n")
  const firstCode = lines.findIndex((l) => /^\s*(import|const|export|let|function|describe)\b/.test(l))
  const head = firstCode === -1 ? lines : lines.slice(0, firstCode)
  return head.map((l) => {
    const t = l.trim()
    if (t === "/**" || t === "*/") return ""
    const m = /^\s*\*\s?(.*)$/.exec(l)
    return m ? (m[1] as string) : l
  })
}

/** 递归收集 `changes/` 下所有含 AC 面小节的 proposal（活跃 + `archive/<date>-<n>` 两形态）。 */
export function collectAcFaceFiles(dir: string): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = []
  const walk = (d: string): void => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        walk(p)
        continue
      }
      if (e.name !== "proposal.md") continue
      const text = readFileSync(p, "utf8")
      const hasHeading = stripNoise(text)
        .split("\n")
        .some((l) => (AC_HEADINGS as readonly string[]).includes(l.trim()))
      if (hasHeading) out.push({ path: p, text })
    }
  }
  walk(dir)
  return out
}

export interface Texts {
  adr: string
  acFaces: Array<{ path: string; text: string }>
  testHeader: string[]
  mad: string
}

interface FaceBullets {
  face: string
  bullets: Array<{ id: string; rest: string }>
  sectionText: string
}

function faces(t: Texts): FaceBullets[] {
  const out: FaceBullets[] = []
  const acBullets: Array<{ id: string; rest: string }> = []
  const acText: string[] = []
  for (const f of t.acFaces) {
    const lines = stripNoise(f.text).split("\n")
    const sec = sectionOf(
      lines,
      (l) => (AC_HEADINGS as readonly string[]).includes(l.trim()),
      (l) => /^##\s/.test(l),
    )
    if (sec) {
      acText.push(...sec)
      acBullets.push(...registrationLines(sec))
    }
  }
  out.push({ face: "AC 面", bullets: acBullets, sectionText: acText.join("\n") })
  out.push({ face: "测试注释", bullets: registrationLines(t.testHeader), sectionText: t.testHeader.join("\n") })
  const madLines = stripNoise(t.mad).split("\n")
  const madSec = sectionOf(madLines, (l) => MAD_HEADING_RE.test(l), (l) => /^#{1,4}\s/.test(l))
  out.push({
    face: "主题文档",
    bullets: madSec ? registrationLines(madSec) : [],
    sectionText: (madSec ?? []).join("\n"),
  })
  return out
}

/** 三处 + ADR 文本 → 违规清单（空 = 绿）。判据依赖顺序即 AC 编号顺序。 */
export function violations(t: Texts): string[] {
  const v: string[] = []
  const expected = parseAdrItems(t.adr)

  // AC3：源侧一致性（恰好 17、id 唯一、标题非空）
  if (expected.length !== 18) v.push(`ADR D9 表应恰 18 项，实际 ${expected.length} 项`)
  const ids = expected.map((e) => e.id)
  if (new Set(ids).size !== ids.length) v.push("ADR D9 表的标识不唯一")
  for (const e of expected) if (norm(e.title) === "") v.push(`ADR 的 ${e.id} 标题为空`)

  const expectedById = new Map(expected.map((e) => [e.id, norm(e.title)]))
  const f = faces(t)

  // C.8：载体缺失给专用文案（不抛裸异常）
  if (t.acFaces.length === 0) {
    v.push(`缺 AC 面载体：找不到行首标题「${AC_HEADINGS[0]}」或「${AC_HEADINGS[1]}」的 proposal`)
  }
  if (f[1]!.bullets.length === 0) v.push("缺测试注释载体：本文件 JSDoc 头没有任何 D9 登记行")
  if (f[2]!.sectionText === "") v.push("缺主题文档载体：找不到行首标题「#### 2.8.8」的索引段")

  for (const face of f) {
    const seen = new Set<string>()
    // ⚠ **按面**计数：三处各自必须每项**恰好 1 次**（跨面出现的总次数恒为 3 ⇒ 全局并集计数无意义）
    const counts = new Map<string, number>()
    for (const b of face.bullets) {
      // AC2：行形态 + 标题保真
      if (!expectedById.has(b.id)) v.push(`${face.face} 出现未知标识 ${b.id}（ADR D9 表里没有）`)
      const want = expectedById.get(b.id)
      if (want !== undefined && !norm(b.rest).includes(want)) {
        v.push(`${face.face} 的 ${b.id} 标题不保真（ADR 标题：${want}）`)
      }
      // AC7：负向词
      for (const w of NEGATIVE) {
        if (b.rest.includes(w)) v.push(`${face.face} 的 ${b.id} 含负向词「${w}」`)
      }
      seen.add(b.id)
      counts.set(b.id, (counts.get(b.id) ?? 0) + 1)
    }
    // AC1：本面覆盖全部期望 id
    for (const id of ids) if (!seen.has(id)) v.push(`${face.face} 缺 ${id}`)
    // AC8：本面**唯一性**（同一 id 恰好 1 次 —— 重复登记 ⇒ 谁是权威不明）
    for (const [id, n] of counts) if (n !== 1) v.push(`${face.face} 的 ${id} 出现 ${n} 次（应恰好 1 次）`)
  }

  // AC7：索引段禁复述 ADR 决策列
  if (f[2]!.sectionText.includes("缓解：")) v.push("主题文档索引段出现「缓解：」（禁复述 ADR 的决策列）")

  return v
}

function realTexts(): Texts {
  return {
    adr: readFileSync(path.join(ROOT, ADR_REL), "utf8"),
    acFaces: collectAcFaceFiles(path.join(ROOT, "openspec", "changes")),
    testHeader: headerOf(readFileSync(SELF, "utf8")),
    mad: readFileSync(path.join(ROOT, MAD_REL), "utf8"),
  }
}

const withOverride = (over: Partial<Texts>): Texts => ({ ...realTexts(), ...over })

describe("AC1 三处齐全（缺项数 = 0）", () => {
  test("整体绿", () => {
    expect(violations(realTexts())).toEqual([])
  })

  for (const face of ["AC 面", "测试注释", "主题文档"]) {
    test(`${face}：覆盖 ADR 派生的全部标识`, () => {
      const missing = violations(realTexts()).filter((x) => x.startsWith(`${face} 缺 `))
      expect(missing).toEqual([])
    })
  }
})

describe("AC2 行形态 + 标题保真（只写编号 / 标题走样 ⇒ 红）", () => {
  const base = realTexts()
  const firstIdLine = (): string =>
    base.testHeader.find((l) => ENTRY_RE.test(l) && (ENTRY_RE.exec(l)![1] as string) === "D9①") as string

  test("只写编号（去标题）⇒ 红", () => {
    const id = (ENTRY_RE.exec(firstIdLine())![1] as string)
    const header = base.testHeader.map((l) => (ENTRY_RE.test(l) ? `- **${id}**` : l))
    const v = violations(withOverride({ testHeader: header }))
    expect(v.some((x) => x.includes(`${id} 标题不保真`))).toBe(true)
  })

  test("只写 `……` ⇒ 红", () => {
    const id = (ENTRY_RE.exec(firstIdLine())![1] as string)
    const header = base.testHeader.map((l) => (ENTRY_RE.test(l) ? `- **${id}** ……` : l))
    expect(violations(withOverride({ testHeader: header })).some((x) => x.includes(`${id} 标题不保真`))).toBe(true)
  })

  test("标题被截断 ⇒ 红", () => {
    const id = (ENTRY_RE.exec(firstIdLine())![1] as string)
    const header = base.testHeader.map((l) => (ENTRY_RE.test(l) ? `- **${id}** 声明文件可被` : l))
    expect(violations(withOverride({ testHeader: header })).some((x) => x.includes(`${id} 标题不保真`))).toBe(true)
  })
})

describe("AC3 期望集从 ADR 派生（不写死）", () => {
  test("ADR 恰 18 项、标识唯一、标题非空", () => {
    const items = parseAdrItems(readFileSync(path.join(ROOT, ADR_REL), "utf8"))
    expect(items.length).toBe(18)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    for (const i of items) expect(norm(i.title).length).toBeGreaterThan(0)
  })

  test("派生对 ADR 文本的变化敏感（加一行 ⇒ 期望集变大）", () => {
    const adr = readFileSync(path.join(ROOT, ADR_REL), "utf8")
    // ⚠ 探针用一个**未登记的新 id**（⑰ 已被 D10③′ 登记 ⇒ 用 ⑱）
    const grown = parseAdrItems(`${adr}\n| ⑲ | **新增项标题** | 描述 |\n`)
    expect(grown.map((i) => i.id)).toContain("D9⑲")
  })
})

describe("AC4 加新一行 ⇒ 必红（判别力）", () => {
  test("ADR 多一行而未登记 ⇒ 报对应 id 缺", () => {
    const base = realTexts()
    // ⚠ 探针 id 必须**未登记**（⑰/⑱ 已登记 ⇒ 用 ⑲）
    const v = violations(withOverride({ adr: `${base.adr}\n| ⑲ | **新增项标题** | 描述 |\n` }))
    expect(v.length).toBeGreaterThan(0)
    for (const face of ["AC 面", "测试注释", "主题文档"]) {
      expect(v).toContain(`${face} 缺 D9⑲`)
    }
  })
})

describe("AC5 区段作用域（散文里的散落命中不算）", () => {
  test("删掉主题文档索引段的 D9⑯ 行 ⇒ 即使全文别处仍提到 D9⑯ ⇒ 仍红", () => {
    const base = realTexts()
    // 前提：MAD 全文在索引段之外确实提到 D9⑯（否则本用例没有判别力）
    const outside = stripNoise(base.mad)
      .split("\n")
      .filter((l) => MAD_HEADING_RE.test(l) === false)
      .some((l) => l.includes("D9⑯"))
    expect(outside, "MAD 索引段之外应有 D9⑯ 的散文提及（本用例的前提）").toBe(true)
    const mad = base.mad
      .split("\n")
      .filter((l) => !(ENTRY_RE.test(l) && (ENTRY_RE.exec(l)![1] as string) === "D9⑯"))
      .join("\n")
    expect(violations(withOverride({ mad }))).toContain("主题文档 缺 D9⑯")
  })

  test("AC 面标题只写在反引号散文里 ⇒ 不被当作载体（只认行首标题）", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "d9-prose-"))
    try {
      const f = path.join(tmp, "changes", "x", "proposal.md")
      mkdirSync(path.dirname(f), { recursive: true })
      writeFileSync(f, `# x\n\n本仓约定见 \`${AC_HEADINGS[0]}\` 那节。\n`)
      expect(collectAcFaceFiles(path.join(tmp, "changes")).length, "反引号散文不得被当作 AC 面载体").toBe(0)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe("AC6 归档韧性（活跃 + archive/<date>-<n> 两形态都认）", () => {
  test("fixture 两形态都被收集", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "d9-guard-"))
    try {
      const active = path.join(tmp, "changes", "x", "proposal.md")
      const archived = path.join(tmp, "changes", "archive", "2026-01-01-y", "proposal.md")
      mkdirSync(path.dirname(active), { recursive: true })
      mkdirSync(path.dirname(archived), { recursive: true })
      writeFileSync(active, `# x\n\n${AC_HEADINGS[0]}\n\n- **D9①** t\n\n## 其它\n`)
      writeFileSync(archived, `# y\n\n${AC_HEADINGS[0]}\n\n- **D9②** t\n`)
      const found = collectAcFaceFiles(path.join(tmp, "changes")).map((f) => path.relative(tmp, f.path)).sort()
      expect(found).toEqual([path.join("changes", "archive", "2026-01-01-y", "proposal.md"), path.join("changes", "x", "proposal.md")])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  test("本仓当前的 AC 面载体确实被找到（≥1）", () => {
    const found = collectAcFaceFiles(path.join(ROOT, "openspec", "changes"))
    expect(found.length).toBeGreaterThan(0)
  })
})

describe("AC7 负向词（防凑数 / 防第二真源）", () => {
  test("登记行含 TODO ⇒ 红", () => {
    const base = realTexts()
    const id = (ENTRY_RE.exec(base.testHeader.find((l) => ENTRY_RE.test(l)) as string)![1] as string)
    const header = base.testHeader.map((l) => (ENTRY_RE.test(l) && l.includes(id) ? `${l} TODO` : l))
    expect(violations(withOverride({ testHeader: header })).some((x) => x.includes("含负向词"))).toBe(true)
  })

  test("主题文档索引段出现「缓解：」⇒ 红", () => {
    const base = realTexts()
    const mad = base.mad.replace(/^####\s+2\.8\.8.*$/m, (m) => `${m}\n不写缓解：无`)
    expect(violations(withOverride({ mad }))).toContain("主题文档索引段出现「缓解：」（禁复述 ADR 的决策列）")
  })
})

describe("AC8 唯一性（重复登记 ⇒ 红）", () => {
  test("同一标识在并集里出现 2 次 ⇒ 红", () => {
    const base = realTexts()
    const dup = base.testHeader.find((l) => ENTRY_RE.test(l)) as string
    expect(violations(withOverride({ testHeader: [...base.testHeader, dup] }))).toContain(
      `测试注释 的 ${(ENTRY_RE.exec(dup)![1] as string)} 出现 2 次（应恰好 1 次）`,
    )
  })
})

describe("AC9 不空转", () => {
  test("本文件无 skip / todo", () => {
    // ⚠ 判据串拼出来，避免「守卫自己的字面量」自匹配
    const SKIP = "." + "skip("
    const TODO = "." + "todo("
    const src = readFileSync(SELF, "utf8")
    expect(src.includes(SKIP), "本守卫文件不得 skip").toBe(false)
    expect(src.includes(TODO), "本守卫文件不得 todo").toBe(false)
  })
})
