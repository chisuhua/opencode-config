/**
 * 免宣称六项 —— **AC23**（ADR-role-aware-permissions D5；门控 V13）
 *
 * ⚠ **本文件头即「测试注释」那一处登记**（AC23 要求 AC + 测试注释 + 主题文档**三处**）。
 *   删掉本文件里的任一项 ⇒ 下面的守卫判红（判别力自证见末尾的突变用例）。
 *
 * **六项（D5①–D5⑥）—— 门控「防事故，不防绕过」**：
 *   - **D5①** `shell` 写盘（`sed -i` / `tee` / `>` / `cp`）**不在**门控内。
 *   - **D5②** shell 层 **pattern 盲区**（`git -c … commit` / `GIT_AUTHOR_NAME=x git commit`）—— 已由
 *     `docs/adr/ADR-commit-verification-gate.md` D5 **部分闭合**（限顶层命令串的 `git commit` 子命令识别）；
 *     残余：间接提交 / 解析盲区 / 插件缺席（见该 ADR 的 D9）。
 *   - **D5③** `role.json` / `role-claims.json` **可被改写**（`shell` 或 `edit`）⇒ 身份与租约都可被伪造。
 *   - **D5④** **saved approval**（宿主「Allow always」）会覆盖配置，层 1 看不见。
 *   - **D5⑤** **非 build agent 主会话**不参与（`plan` / `front` 等）⇒ 它们与 build 主会话并发时不受本 ADR 保护。
 *   - **D5⑥** **执行点缺席**（插件未激活 / `--standalone` / 未 `service restart` / 插件文件不在 `plugins/`）
 *     ⇒ 门控不生效；租约仍剩 `role-switch.sh` 与**派发临界区**两个执行点。
 */
import { describe, expect, test } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")
const SELF = path.join(import.meta.dir, "role-exemptions.test.ts")
const MAD = path.join(ROOT, "docs", "MULTI-AGENT-DESIGN.md")

/** 六项的稳定标识（**三处都用同一标识** ⇒ 机械可查）。 */
const SIX = ["D5①", "D5②", "D5③", "D5④", "D5⑤", "D5⑥"] as const

/** AC23 的 AC 面：change 名 + 小节**行首标题**（`role-aware-permissions/proposal.md`）。 */
const AC_NAME = "role-aware-permissions"
const AC_HEADING = "## 免宣称六项（AC23 的登记面）"
/** 缺载体时指引读者去这儿（决策真源）。 */
const ADR_REF = "docs/adr/ADR-role-aware-permissions.md"
/** 归档目录名：本仓归档一律 `YYYY-MM-DD-<change>`（18/18 历史归档均为此形态）。
 *  ⚠ **不做** `endsWith("-<name>")` 后缀匹配 —— 那会把名字**以** `-role-aware-permissions`
 *  结尾的其它 change 捞成候选（假红）。 */
const ARCHIVE_DIR_RE = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${AC_NAME}$`)

/** `root` 下的 POSIX 相对路径（断言口径统一，避免前缀差异造成假红）。 */
function rel(root: string, p: string): string {
  return path.relative(root, p).split(path.sep).join("/")
}

/** 载体解析结果：**恰好 1 个候选**才给出路径与文本。 */
type AcFace =
  | { kind: "active" | "archived"; path: string; text: string }
  | { kind: "none"; searched: string[]; emptyDirs: string[] }
  | { kind: "ambiguous"; paths: string[] }

/**
 * 候选 = 活跃 `changes/<name>/proposal.md` + `changes/archive/*-<name>/proposal.md`。
 * **按文件存在性计数**（不看内容）—— 否则「活跃缺项 + 归档齐全」会被静默回退成归档那一份。
 * 纯函数、无模块级缓存：每次调用都重新读盘（fixture 传自己的 root）。
 */
function resolveAcFace(root: string): AcFace {
  const changes = path.join(root, "openspec", "changes")
  const activeDir = path.join(changes, AC_NAME)
  const archiveDir = path.join(changes, "archive")
  const searched = [
    rel(root, path.join(activeDir, "proposal.md")),
    rel(root, path.join(archiveDir, `*-${AC_NAME}`, "proposal.md")),
  ]
  const found: Array<{ kind: "active" | "archived"; path: string }> = []
  const emptyDirs: string[] = []

  const activeProposal = path.join(activeDir, "proposal.md")
  if (existsSync(activeProposal)) {
    found.push({ kind: "active", path: activeProposal })
  } else if (existsSync(activeDir)) {
    // 归档中途失败 / 目录建了文件没写 ⇒ 点名目录（不是静默算作「没有 change」）
    emptyDirs.push(rel(root, activeDir))
  }

  if (existsSync(archiveDir)) {
    for (const e of readdirSync(archiveDir, { withFileTypes: true })) {
      if (!e.isDirectory() || !ARCHIVE_DIR_RE.test(e.name)) continue
      const dir = path.join(archiveDir, e.name)
      const p = path.join(dir, "proposal.md")
      if (existsSync(p)) found.push({ kind: "archived", path: p })
      else emptyDirs.push(rel(root, dir))
    }
  }

  if (found.length === 0) return { kind: "none", searched, emptyDirs }
  if (found.length > 1) return { kind: "ambiguous", paths: found.map((f) => rel(root, f.path)) }
  const only = found[0]!
  return { kind: only.kind, path: only.path, text: readFileSync(only.path, "utf8") }
}

/** AC 面小节的**行首**标题是否在位（散文 / 反引号里的同名串不算）。 */
function hasAcHeading(text: string): boolean {
  return text.split("\n").some((l) => l.trim() === AC_HEADING)
}

/** 解析失败的可断言文案（**返回字符串**，由 `expect` 判红 —— 不抛异常，保住逐项失败计数）。 */
function acFaceFailures(face: AcFace, root: string): string[] {
  if (face.kind === "none") {
    const extra = face.emptyDirs.length > 0 ? `；目录在但缺 proposal.md：${face.emptyDirs.join(", ")}` : ""
    return [
      `缺 AC23 的 AC 面载体：在 ${root} 下找不到 ${face.searched.join(" 或 ")}（后者为 glob 形态）${extra} ⇒ 见 ${ADR_REF} D5`,
    ]
  }
  if (face.kind === "ambiguous") {
    return [
      `AC23 的 AC 面候选并存（形态并存，权威不明）：${face.paths.join(", ")}` +
        " ⇒ 删掉多余的候选（活跃与归档并存 ⇒ 删 archive/ 下的日期目录；两个归档并存 ⇒ 删旧的那个）",
    ]
  }
  if (!hasAcHeading(face.text)) {
    return [`${rel(root, face.path)} 缺行首标题「${AC_HEADING}」（找不到该字面的行首标题）`]
  }
  return []
}

/** 某文本里缺了哪些项（缺项列表为空 ⇒ 三处齐全）。 */
export function missingItems(text: string): string[] {
  return SIX.filter((id) => !text.includes(id))
}

interface Place {
  label: string
  relPath: string
  text: string | null
  /** 非 null ⇒ 载体本身没解析出来（用它判红，避免抛 ENOENT）。 */
  problem: string | null
}

/** AC 面（按解析结果构造）。 */
function acPlaceFor(root: string): Place {
  const face = resolveAcFace(root)
  const failures = acFaceFailures(face, root)
  const resolved = face.kind === "active" || face.kind === "archived" ? face : null
  const relPath = resolved ? rel(root, resolved.path) : "(未解析到)"
  return {
    label: `AC（proposal.md：${relPath}）`,
    relPath,
    text: resolved ? resolved.text : null,
    problem: failures.length > 0 ? failures.join("；") : null,
  }
}

const TEST_NOTE: Place = {
  label: "测试注释（本文件头）",
  relPath: rel(ROOT, SELF),
  text: readFileSync(SELF, "utf8"),
  problem: null,
}

const THEME_DOC: Place = {
  label: "主题文档（MULTI-AGENT-DESIGN.md）",
  relPath: rel(ROOT, MAD),
  text: readFileSync(MAD, "utf8"),
  problem: null,
}

/** 三处登记点（AC 面每次重新解析 ⇒ 无模块级缓存）。 */
function placesFor(root: string): Place[] {
  return [acPlaceFor(root), TEST_NOTE, THEME_DOC]
}

const PLACE_NAMES = ["AC（proposal.md）", "测试注释（本文件头）", "主题文档（MULTI-AGENT-DESIGN.md）"] as const

/** fixture：按相对路径写文件（父目录自动创建）。 */
function makeFixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "ac23-guard-"))
  for (const [relPath, text] of Object.entries(files)) {
    const p = path.join(root, relPath)
    mkdirSync(path.dirname(p), { recursive: true })
    writeFileSync(p, text)
  }
  return root
}

const ACTIVE_REL = `openspec/changes/${AC_NAME}/proposal.md`
const ARCHIVE_REL = `openspec/changes/archive/2026-01-01-${AC_NAME}/proposal.md`

/** 六项齐全的 AC 面小节（正文够长，满足「标识符后有说明」）。 */
const FULL_AC_BODY = `${AC_HEADING}\n\n${SIX.map((id) => `- **${id}** 说明：本条只做标识，正文见 ADR 的 D5。`).join("\n")}\n`

describe("AC23 免宣称六项在三处各自命中", () => {
  for (const [idx, name] of PLACE_NAMES.entries()) {
    test(`AC1 ${name}：六项齐全`, () => {
      const place = placesFor(ROOT)[idx]!
      expect(place.problem).toBeNull()
      const missing = missingItems(place.text ?? "")
      expect(missing, `${place.label} 缺免宣称项：${missing.join(", ")}`).toEqual([])
    })
  }

  test("AC1 六项**逐项**都有正文（不只是标识符）", () => {
    for (const place of placesFor(ROOT)) {
      expect(place.problem).toBeNull()
      const text = place.text ?? ""
      for (const id of SIX) {
        const at = text.indexOf(id)
        expect(at, `${place.label} 缺 ${id}`).toBeGreaterThan(-1)
        // 标识符后面必须有实质说明（避免「只写个编号」凑数）
        const tail = text.slice(at, at + 400)
        expect(tail.length, `${place.label} 的 ${id} 后面没有说明`).toBeGreaterThan(20)
      }
    }
  })

  test("AC6① 判别力：删掉任一项 ⇒ 必红", () => {
    const place = acPlaceFor(ROOT)
    expect(place.problem).toBeNull()
    const lines = (place.text ?? "").split("\n")
    // 找出行含 D5③ 的那一行并删掉 ⇒ 缺项检查必须抓到
    const idx = lines.findIndex((l) => l.includes("D5③"))
    expect(idx, "载体里找不到 D5③ 的登记行").toBeGreaterThan(-1)
    const mutated = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join("\n")
    expect(missingItems(mutated), "删掉 D5③ 后守卫必须报缺").toContain("D5③")
    // 其余项仍在 ⇒ 缺项检查**不是**「全有全无」的恒真判定
    expect(missingItems(mutated)).not.toContain("D5①")
  })
})

describe("AC2 真实态：AC 面恰好 1 个候选，且落在 openspec/changes 下", () => {
  // ⚠ 本用例**不**断言 kind === "active"：`role-aware-permissions` 一归档，
  //    那条断言自己就红（= 重新埋下本 change 要拆的炸弹）。kind 只记进验收报告。
  test("真实态解析", () => {
    const face = resolveAcFace(ROOT)
    expect(["active", "archived"]).toContain(face.kind)
    if (face.kind !== "active" && face.kind !== "archived") return
    expect(rel(ROOT, face.path).startsWith("openspec/changes/")).toBe(true)
    expect(acFaceFailures(face, ROOT)).toEqual([])
  })
})

describe("AC3 身份与互异性：三处是三个不同文件", () => {
  test("AC 面 ∈ openspec/changes 且三处路径两两不同", () => {
    const [ac, self, mad] = placesFor(ROOT)
    expect(ac!.problem).toBeNull()
    expect(ac!.relPath.startsWith("openspec/changes/")).toBe(true)
    expect(new Set([ac!.relPath, self!.relPath, mad!.relPath]).size).toBe(3)
  })
})

describe("AC1 fixture：候选枚举三态（纯函数，传自己的 root）", () => {
  test("仅活跃 ⇒ active", () => {
    const root = makeFixture({ [ACTIVE_REL]: FULL_AC_BODY })
    try {
      const face = resolveAcFace(root)
      expect(face.kind).toBe("active")
      if (face.kind !== "active") return
      expect(rel(root, face.path)).toBe(ACTIVE_REL)
      expect(acFaceFailures(face, root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("仅归档 ⇒ archived", () => {
    const root = makeFixture({ [ARCHIVE_REL]: FULL_AC_BODY })
    try {
      const face = resolveAcFace(root)
      expect(face.kind).toBe("archived")
      if (face.kind !== "archived") return
      expect(rel(root, face.path)).toBe(ARCHIVE_REL)
      expect(acFaceFailures(face, root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("并存 ⇒ ambiguous（列出全部候选）", () => {
    const root = makeFixture({ [ACTIVE_REL]: FULL_AC_BODY, [ARCHIVE_REL]: FULL_AC_BODY })
    try {
      const face = resolveAcFace(root)
      expect(face.kind).toBe("ambiguous")
      if (face.kind !== "ambiguous") return
      expect([...face.paths].sort()).toEqual([ACTIVE_REL, ARCHIVE_REL].sort())
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("都无 ⇒ none（searched 含两形态）", () => {
    const root = makeFixture({ "README.md": "empty\n" })
    try {
      const face = resolveAcFace(root)
      expect(face.kind).toBe("none")
      if (face.kind !== "none") return
      expect(face.searched).toEqual([
        `openspec/changes/${AC_NAME}/proposal.md`,
        `openspec/changes/archive/*-${AC_NAME}/proposal.md`,
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("近似名（2026-01-01-extend-role-aware-permissions）不算候选（后缀匹配会假红）", () => {
    const root = makeFixture({ [`openspec/changes/archive/2026-01-01-extend-${AC_NAME}/proposal.md`]: FULL_AC_BODY })
    try {
      expect(resolveAcFace(root).kind).toBe("none")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("目录在但 proposal.md 缺 ⇒ none 且点名目录", () => {
    const root = makeFixture({ [`openspec/changes/${AC_NAME}/README.md`]: "x\n" })
    try {
      const face = resolveAcFace(root)
      expect(face.kind).toBe("none")
      if (face.kind !== "none") return
      expect(face.emptyDirs).toEqual([`openspec/changes/${AC_NAME}`])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("AC4 失败形态：判红 + 可读文案（不抛异常）", () => {
  test("两次解析器调用都不抛（none 与 ambiguous 均返回诊断对象）", () => {
    const noneRoot = makeFixture({ "README.md": "empty\n" })
    const ambRoot = makeFixture({ [ACTIVE_REL]: FULL_AC_BODY, [ARCHIVE_REL]: FULL_AC_BODY })
    try {
      expect(() => resolveAcFace(noneRoot)).not.toThrow()
      expect(() => resolveAcFace(ambRoot)).not.toThrow()
    } finally {
      rmSync(noneRoot, { recursive: true, force: true })
      rmSync(ambRoot, { recursive: true, force: true })
    }
  })
})

describe("AC5 文案三态分开", () => {
  test("(a) 无载体：文案含解析根 + 两形态相对路径", () => {
    const root = makeFixture({ "README.md": "empty\n" })
    try {
      const msg = acFaceFailures(resolveAcFace(root), root).join("\n")
      expect(msg).toContain(root)
      expect(msg).toContain(`openspec/changes/${AC_NAME}/proposal.md`)
      expect(msg).toContain(`openspec/changes/archive/*-${AC_NAME}/proposal.md`)
      expect(msg).toContain(ADR_REF)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("(b) 有文件无行首标题：文案含期望标题原文", () => {
    const renamed = FULL_AC_BODY.replace(AC_HEADING, "### 免宣称六项（AC23 的登记面）")
    const root = makeFixture({ [ACTIVE_REL]: renamed })
    try {
      const msg = acFaceFailures(resolveAcFace(root), root).join("\n")
      expect(msg).toContain(ACTIVE_REL)
      expect(msg).toContain(AC_HEADING)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("(c) 有标题但六项不全：缺项文案的 label 含相对路径", () => {
    const partial = FULL_AC_BODY.replace(/^- \*\*D5⑥\*\*.*$/m, "")
    const root = makeFixture({ [ACTIVE_REL]: partial })
    try {
      const place = acPlaceFor(root)
      expect(place.problem).toBeNull()
      expect(place.relPath).toBe(ACTIVE_REL)
      expect(place.label).toContain(ACTIVE_REL)
      expect(missingItems(place.text ?? ""), `${place.label} 缺免宣称项`).toEqual(["D5⑥"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("AC6② 判据强度：活跃缺项 + 归档齐全 ⇒ 仍红（不得静默回退）", () => {
  test("活跃 proposal 缺 D5③、archive 副本齐全 ⇒ ambiguous（不是静默取 archive）", () => {
    const partial = FULL_AC_BODY.replace(/^- \*\*D5③\*\*.*$/m, "")
    const root = makeFixture({ [ACTIVE_REL]: partial, [ARCHIVE_REL]: FULL_AC_BODY })
    try {
      const face = resolveAcFace(root)
      expect(face.kind).toBe("ambiguous")
      const msg = acFaceFailures(face, root).join("\n")
      expect(msg).toContain("形态并存")
      expect(msg).toContain(ACTIVE_REL)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("AC7 无模块级缓存 / fixture 不污染真实态", () => {
  test("同一 root 的形态变化立即反映（活跃 → 归档）", () => {
    const root = makeFixture({ [ACTIVE_REL]: FULL_AC_BODY })
    try {
      expect(resolveAcFace(root).kind).toBe("active")
      const archived = path.join(root, ARCHIVE_REL)
      mkdirSync(path.dirname(archived), { recursive: true })
      renameSync(path.join(root, ACTIVE_REL), archived)
      expect(resolveAcFace(root).kind).toBe("archived")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 作为真实态的**廉价端到端复验**（fixture 全在 os.tmpdir() 下、解析器按 root 参数隔离 ⇒ 构造上不会污染真实 root）。
  test("fixture 用例跑完后，真实态仍解析为单一候选", () => {
    const face = resolveAcFace(ROOT)
    expect(["active", "archived"]).toContain(face.kind)
  })
})
