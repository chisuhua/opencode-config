/**
 * role-policy —— **角色 → 写根**的单一真源（ADR-role-aware-permissions D3 / V6；proposal AC16）
 *
 * **单一真源的含义（AC16）**：
 *   - 角色→写根的映射**只在本文件存在**（`ROLE_WRITE_POLICY`）⇒ 守卫断言「定义点恰好 1 处」；
 *   - 插件（`plugins/role-gate.ts`）与 spawn 规则构建器**都从这里取**，不得各复制一份表；
 *   - 身份解析**只走 `lib/role-identity.ts::resolveRole`**（门控与租约同函数、同时刻取值）。
 *
 * **门控面（ADR D2）**：只覆盖 `edit` / `write` 两个工具；
 *   ⚠ `shell` 写盘（`>` / `tee` / `sed -i`）**不在**门控内（D5① 免宣称：防事故，不防绕过）。
 *
 * **治理面清单的真源** = `.rddf/config/governance-paths.json`（**政策数据**，归 architect）；
 *   本文件的 `DEFAULT_GOVERNANCE_PATHS` 只是**兜底默认**（配置缺失 / 损坏 / 缺核心集时生效），
 *   真源解析走 `resolveGovernancePaths()`（读根 = **治理根**，不缓存）。
 *
 * **路径口径**：判定一律基于**归一绝对路径**（相对 cwd 先解析；`../` 收敛；symlink 走 realpath），
 *   再按「治理面表 / 仓库根 / arch_paths」三处相对定位（见 `decideWrite`）。
 *   ⚠ **治理面检测是双命中**：调用路径 ∪ realpath **任一**命中即算治理面（挡符号链接绕过）；
 *   **写集判定**仍按 realpath 归一后的相对路径，且 `arch_paths` **只对 architect 追加**。
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import type { Role } from "./role-identity.ts"

export type WriteAction = "edit" | "write"

/**
 * 治理面路径清单的**内置默认**（**兜底默认，只收紧不放宽**）。
 *
 * ⚠ **兜底，不是真源**：B1 起真源 = `.rddf/config/governance-paths.json`（**政策数据**，归 architect）；
 *   本清单只在**配置缺失 / 损坏 / 字段类型错 / 缺核心集**时生效
 *   （`ADR-governance-paths-ownership` D2.4）⇒ 行为与**迁移前一致**
 *   （治理面不因配置坏了而**静默消失** ⇒ 修复通道保持开放）。
 * ⚠ **只收紧不放宽** = **核心集是下限**：有效配置可增可减，但**核心集条目不可移除**
 *   （缺一 ⇒ 视为损坏 ⇒ 回退本清单）。
 */
export const DEFAULT_GOVERNANCE_PATHS = [
  "prompts",
  "commands",
  "scripts",
  "AGENTS.md",
  "opencode.json",
  "opencode.jsonc",
  // 配置**变体**文件同样是治理面：本仓用 `opencode.jsonc -> opencode.jsonc.<变体>` 的链接切换配置，
  // 而 `normalizeTarget()` 会把目标 realpath 归一 ⇒ 变体名若不入表，链接路径就会落出治理面
  // （实测：architect 改不了自己的配置，builder 的 `**` 反而能改 ⇒ 归属反转）。
  "opencode.json.*",
  "opencode.jsonc.*",
  "docs/MULTI-AGENT-DESIGN.md",
  "docs/CHANGELOG.md",
  "docs/SUBAGENT-ORCHESTRATION.md",
  "tests/config-guards.test.ts",
  // **清单自身**（自纳入 ⇒ 它的变更也进写门留痕与治理面必审通道；ADR D2.2）
  ".rddf/config/governance-paths.json",
]

/**
 * 治理面路径清单的**核心集**（**不可移除的下限**；ADR-governance-paths-ownership D2.4 表）。
 *
 * ⚠ **与 `DEFAULT_GOVERNANCE_PATHS` 故意是两份独立清单**（不是别名、不是复制粘贴的同一份）：
 *   - **核心集** = 下限（配置删掉其中任一条 ⇒ 配置损坏 ⇒ 运行期回退默认）；
 *   - **默认清单** = 兜底（配置坏了时的生效清单 = 迁移前行为 + 自纳入）。
 *   今日二者内容相同，但**关系由守卫钉住**（`tests/config-guards.test.ts` 断言 `默认 ⊇ 核心`）
 *   ⇒ 二者可以各自演化而不会静默漂移；若写成别名，那条守卫就没有判别力（删核心项 ⇒ 两边一起少 ⇒ 恒绿）。
 * ⚠ **机制面文件**（`lib/**` / `plugins/**`）**不进核心集**（ADR D2.4 明文否决）：
 *   把它们列进来 = architect 借治理面身份拿到机制代码写权 = 被否决的方案 A。
 */
export const GOVERNANCE_CORE_PATHS = [
  "prompts",
  "commands",
  "scripts",
  "AGENTS.md",
  "opencode.json",
  "opencode.jsonc",
  "opencode.json.*",
  "opencode.jsonc.*",
  "docs/MULTI-AGENT-DESIGN.md",
  "docs/CHANGELOG.md",
  "docs/SUBAGENT-ORCHESTRATION.md",
  "tests/config-guards.test.ts",
  ".rddf/config/governance-paths.json",
]

/**
 * **机制面根**：治理面的**结构性禁区** —— 这些根下的路径**永远不是治理面**，无论清单怎么写。
 *
 * ⚠ **为什么必须有这条**：清单迁到配置面后，**配置是数据** ⇒ architect 能往里加条目 ⇒
 *   若不加禁区，architect 加一条 `"lib"` 就能让 `lib/role-policy.ts` 命中治理面 ⇒
 *   治理面分支按 `policy.governance` 放行 ⇒ **architect 借治理面身份拿到机制代码写权**
 *   = `ADR-governance-paths-ownership` D2 明文否决的「方案 A」⇒ 与 ADR 背景 2 / D1 的
 *   第一不变量（「architect 拿不到机制代码写权」）直接冲突。
 * ⚠ **安全不靠清单**（ADR D2.4 原话）：本禁区在**判定侧**生效 ⇒ 即使清单（配置或代码默认）被写入
 *   `lib` / `plugins`，机制代码也拿不到治理面身份 ⇒ 结构性保障，而非纪律。
 * ⚠ 口径 = `prompts/build.md` §审查配对 治理面作用域表的**机制面两行**（`lib/**` + `plugins/**`）：
 *   它们**属审查面**（改它们必须走 oracle→critic），但**不属写权面**（写权归 builder）。
 */
export const GOVERNANCE_FORBIDDEN_ROOTS = ["lib", "plugins"]

/**
 * 该清单条目是否**覆盖**机制面根（`lib` / `plugins`）下的路径。
 *
 * 判据（**保守**：宁可多判为覆盖 ⇒ 该条目被剔除；**不可漏判**）：
 *   ① 条目的**字面前缀**（到第一个通配符为止）落在 `lib` / `plugins` 根下；
 *   ② 条目**首段含通配符**且**含路径分隔符**（如 `*` + `/x` 形态）⇒ 可能匹配 `lib/...`；
 *   ③ 条目含 `**` ⇒ 跨任意目录 ⇒ 可能匹配 `lib/...`。
 * ⚠ **不**判为覆盖的形态（可安全进清单）：`prompts` / `docs/adr` / `*.md`（只在顶层）/ `libfoo`。
 */
export function coversMechanismRoot(entry: string): boolean {
  const literal = entry.split(/[*?]/)[0] ?? ""
  for (const root of GOVERNANCE_FORBIDDEN_ROOTS) {
    if (literal === root || literal.startsWith(`${root}/`)) return true
  }
  const firstSeg = entry.split("/")[0] ?? ""
  if (/[*?]/.test(firstSeg) && entry.includes("/")) return true
  if (entry.includes("**")) return true
  return false
}

/** 架构文档目录的 **fallback 目录集**（= §架构文档范围 的「目录集口径」；⚠ 闭合清单，不得随意扩张） */
export const ARCH_FALLBACK_DIRS = [
  "docs/adr",
  "docs/architecture",
  "docs/architecture/adr",
  "docs/designs",
  "docs/design",
  "adr",
  "rfc",
  "specs",
]

export interface RoleWritePolicy {
  /** 仓库内**允许**写的相对路径模式（`[]` = 不允许写仓库内任何文件） */
  allow: string[]
  /** 是否允许写治理面 */
  governance: boolean
  /** 一律拒绝（`no-role`：一切 edit —— 角色矩阵「禁止：一切 edit」） */
  denyAll: boolean
  /** 拒绝时给出的理由（进 message） */
  why: string
}

/**
 * ⚠ **这是「角色 → 写根」的唯一一份表**（AC16）—— 新增映射只改这里。
 *   守卫：`tests/config-guards.test.ts` 断言本表的**定义点恰好 1 处**（注入第二份 ⇒ 必红）。
 */
export const ROLE_WRITE_POLICY: Record<Role, RoleWritePolicy> = {
  architect: {
    // 架构文档目录（arch_paths）在判定时**动态并入**（见 decideWrite）；这里是固定的那部分
    // ⚠ **精确路径，不通配**：`.rddf/config/**` 会把跨仓校验配置面（`workspace.json`）一并交给 architect
    //   （ADR-governance-paths-ownership D2.1 明文否决）⇒ 只列本清单本体。
    allow: [".rddf/config/arch-docs.json", ".rddf/config/governance-paths.json", ".rddf/reviews"],
    governance: true,
    denyAll: false,
    why: "architect 的写集 = 架构文档（arch_paths 命中）+ 治理面 + .rddf/reviews/**",
  },
  planner: {
    allow: [
      ".rddf/roadmap",
      ".rddf/roadmap.md",
      ".rddf/improvements",
      // 改进索引（rdd-planner 阶段产出）。本仓落点取 `.rddf/` 变体（同审计 §4.2 对
      // `.rddf/roadmap.md` 的裁决）；上游 skill 的 owns 声明在**项目根**、待上游同步。
      // 与 `.rddf/improvements` 是**同级文件**，目录前缀语义不覆盖 ⇒ 必须逐条列。
      ".rddf/improvement-suggestions.md",
      ".rddf/improvement-approved.md",
      ".rddf/state/.planner-*",
      "openspec/changes/*/proposal.md",
    ],
    governance: false,
    denyAll: false,
    why: "planner 的写集 = .rddf/roadmap/**、.rddf/roadmap.md、.rddf/improvements/**、改进索引（.rddf/improvement-suggestions.md / .rddf/improvement-approved.md）、.rddf/state/.planner-*（内置流程交接面）、proposal.md",
  },
  builder: {
    allow: ["**"],
    governance: true,
    denyAll: false,
    why: "builder 可写全部项目文件（含 arch_paths 命名的架构文档）",
  },
  verifier: {
    allow: [".rddf/reviews", ".rddf/state/verifier"],
    governance: false,
    denyAll: false,
    why: "verifier 只读实现面与决策记录（验收不改实现、不改 ADR / theme doc）",
  },
  "no-role": {
    allow: [],
    governance: false,
    denyAll: true,
    why: "当前未设定角色（须先切换角色）",
  },
  general: {
    allow: ["**"],
    governance: true,
    denyAll: false,
    why: "general 不受角色写集限制",
  },
}

/** 治理根（默认 `~/.config/opencode`）；测试必须注入 ⇒ **禁读真实 HOME**。 */
export function defaultGovernanceRoot(): string {
  return path.join(homedir(), ".config", "opencode")
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function globToRegExp(pattern: string): RegExp {
  let out = ""
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*"
        i++
      } else {
        out += "[^/]*"
      }
    } else if (c === "?") out += "[^/]"
    else out += escapeRe(c)
  }
  return new RegExp(`^${out}$`)
}

/** 相对路径是否命中模式；无 `*` 的模式按「目录前缀」处理（`docs/adr` 命中 `docs/adr/x.md`）。 */
export function matchesPattern(rel: string, pattern: string): boolean {
  if (pattern === "**") return true
  if (!pattern.includes("*")) {
    const p = pattern.replace(/\/+$/, "")
    return rel === p || rel.startsWith(`${p}/`)
  }
  return globToRegExp(pattern).test(rel)
}

/** 归一绝对路径（相对 cwd 先解析；symlink 走 realpath；文件不存在时按最近的**存在**祖先解析）。 */
export function normalizeTarget(filePath: string, cwd: string): string {
  const abs = path.resolve(cwd, filePath)
  const tail: string[] = []
  let cur = abs
  for (;;) {
    try {
      const real = realpathSync(cur)
      return tail.length ? path.join(real, ...tail.slice().reverse()) : real
    } catch {
      const parent = path.dirname(cur)
      if (parent === cur) return abs
      tail.push(path.basename(cur))
      cur = parent
    }
  }
}

/**
 * 架构文档目录（§架构文档范围 的判定三态）：
 *   ① 配置存在、`arch_paths` 非空、且至少一条路径**实际存在** ⇒ 用配置；
 *   ② 配置缺失 / 为空 / 损坏 ⇒ 落 **fallback 目录集**（取实际存在的那些）；
 *   ③ fallback 一个都不存在 ⇒ `[]`（architect 无受管架构文档）。
 */
export function resolveArchPaths(repoRoot: string): string[] {
  const cfg = path.join(repoRoot, ".rddf", "config", "arch-docs.json")
  try {
    const parsed = JSON.parse(readFileSync(cfg, "utf8")) as { arch_paths?: unknown }
    const paths = Array.isArray(parsed?.arch_paths)
      ? parsed.arch_paths.filter((p: unknown): p is string => typeof p === "string" && p.length > 0)
      : []
    if (paths.length > 0 && paths.some((p) => existsSync(path.join(repoRoot, p)))) return paths
  } catch {
    /* ② 配置缺失 / 损坏 ⇒ 落 fallback */
  }
  return ARCH_FALLBACK_DIRS.filter((d) => existsSync(path.join(repoRoot, d)))
}


/** 治理面清单配置在**治理根**下的相对路径（ADR-governance-paths-ownership D2.2 自纳入）。 */
export const GOVERNANCE_PATHS_CONFIG_REL = ".rddf/config/governance-paths.json"

export interface GovernancePathsResolution {
  /** 生效的治理面路径清单（相对治理根） */
  paths: string[]
  /** 生效来源：`config` = 用配置；`default` = 回退内置默认清单 */
  source: "config" | "default"
  /** 告警（非空 ⇒ 已回退默认 / 配置有异常）；空串 = 配置有效 */
  warning: string
}

/**
 * 解析**生效**的治理面路径清单（三态；ADR-governance-paths-ownership D2.4）。
 *
 * - **读根 = 治理根**（`governanceRoot`），**不是**项目根 ⇒ 任何项目仓放同名文件都劫持不了判定（V5）；
 * - **有效** ⇒ 用配置（`source: "config"`）；
 * - **缺失 / 损坏 / `paths` 为空 / 字段类型错 / 缺核心集条目** ⇒ 回退**内置默认清单** + 告警
 *   （`source: "default"`）——⚠ **绝不**退化成空清单或「全拒」：全拒会让「修配置」本身也依赖
 *   治理面判定 ⇒ 修复通道死锁；
 * - **核心集判定 = 元素包含**（配置是**完整清单**，非增量）⇒ 核心集条目被删即视为损坏。
 */
export function resolveGovernancePaths(governanceRoot: string): GovernancePathsResolution {
  const cfgPath = path.join(governanceRoot, GOVERNANCE_PATHS_CONFIG_REL)
  const fallback = (why: string): GovernancePathsResolution => ({
    paths: [...DEFAULT_GOVERNANCE_PATHS],
    source: "default",
    warning: `${why}（${cfgPath}）⇒ 回退内置默认清单`,
  })
  let raw: string
  try {
    raw = readFileSync(cfgPath, "utf8")
  } catch {
    return fallback("治理面清单配置缺失或不可读")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e: any) {
    return fallback(`治理面清单配置损坏（${e?.message ?? e}）`)
  }
  const paths = (parsed as { paths?: unknown } | null)?.paths
  if (!Array.isArray(paths)) return fallback("治理面清单配置的 paths 字段类型错（须为数组）")
  if (paths.length === 0) return fallback("治理面清单配置的 paths 为空")
  const invalid = paths.filter((p) => typeof p !== "string" || (p as string).trim().length === 0)
  if (invalid.length > 0) return fallback(`治理面清单配置含 ${invalid.length} 条非法条目（须为非空字符串）`)
  const missing = GOVERNANCE_CORE_PATHS.filter((c) => !(paths as string[]).includes(c))
  if (missing.length > 0) return fallback(`治理面清单配置缺核心集条目（${missing.join(", ")}）`)
  // ⚠ **机制面禁区**（结构性保障）：配置里写了覆盖 `lib` / `plugins` 的条目 ⇒ **剔除 + 点名告警**。
  //   剔除而非整份拒收：机制面条目**本就不可能生效**（判定侧恒排除）⇒ 剔除它 + 说清为什么即可；
  //   整份拒收会让配置里的其它合法条目一起失效（collateral），而那个洞已由判定侧闭合。
  const forbidden = (paths as string[]).filter(coversMechanismRoot)
  if (forbidden.length > 0) {
    return {
      paths: (paths as string[]).filter((p) => !coversMechanismRoot(p)),
      source: "config",
      warning: `治理面清单配置含机制面条目（机制面永不治理，已剔除）：${forbidden.join(", ")}（${cfgPath}）`,
    }
  }
  return { paths: [...(paths as string[])], source: "config", warning: "" }
}

export interface GovernancePathsConfig {
  schema_version: number
  updated_at: string
  updated_by: string
  paths: string[]
}

/**
 * **原子**写清单配置（tmp + rename）。
 *
 * ⚠ **为什么必须原子**：门控每次判定都读这份清单 ⇒ 读到**半文件** ⇒ 解析失败 ⇒ 回退默认清单
 *   （治理面暂时收缩）。tmp + rename ⇒ 读者只会看到「改前」或「改后」两种完整状态。
 */
export function writeGovernancePathsConfig(governanceRoot: string, config: GovernancePathsConfig): void {
  const dir = path.join(governanceRoot, path.dirname(GOVERNANCE_PATHS_CONFIG_REL))
  mkdirSync(dir, { recursive: true })
  const target = path.join(governanceRoot, GOVERNANCE_PATHS_CONFIG_REL)
  const tmp = path.join(dir, `.governance-paths.json.${process.pid}.tmp`)
  writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n")
  renameSync(tmp, target)
}

/**
 * 从写类工具的 **input** 里取目标路径。
 *
 * ⚠ **宿主字段名是 `path`**（2026-11-17 层 2 e2e 实测：`write` 与 `edit` 的 input 均为
 *   `{ path, content }` / `{ path, oldString, newString }`）。旧实现只读 `filePath` ⇒
 *   取不到就提前 `return` ⇒ 门控**静默 fail-open**（真写盘成功、无任何错误）。
 * ⇒ 这里**同时接受** `path` / `filePath` / `file_path`（宿主改名前后的两种形状），
 *   取不到返回 `null` ⇒ 调用方必须 **fail-closed**（拒绝），不得放行。
 */
export function extractWriteTarget(input: unknown): string | null {
  if (!input || typeof input !== "object") return null
  const rec = input as Record<string, unknown>
  for (const key of ["path", "filePath", "file_path"]) {
    const v = rec[key]
    if (typeof v === "string" && v.length > 0) return v
  }
  return null
}

export interface WriteCheckInput {
  role: Role
  action: WriteAction
  filePath: string
  cwd: string
  repoRoot: string
  /** 治理根（测试必须注入 ⇒ 禁读真实 HOME） */
  governanceRoot?: string
  /** 架构文档目录（默认按三态解析） */
  archPaths?: string[]
  /**
   * 治理面路径清单（默认按三态解析 `resolveGovernancePaths()`）。
   *
   * ⚠ **注入缝，不绕过机制面禁区**：即便注入一份含 `lib` / `plugins` 的清单，
   *   判定侧的机制面排除（见 `decideWrite`）**恒生效** ⇒ 注入不能用来拿机制代码写权。
   */
  governancePaths?: string[]
}

export interface WriteCheckResult {
  allowed: boolean
  /** 拒绝原因（message 含**角色 + 路径 + 动作**三要素） */
  message?: string
  /** 归一后的绝对路径 */
  absPath: string
  /** 相对 repoRoot 的路径（不在仓库内则为空串） */
  relPath: string
  /** 治理面命中信息（写门留痕 / 诊断用）；`relPath` 相对治理根，未命中为空串 */
  governance: { hit: boolean; relPath: string }
  /**
   * 治理面清单**告警**（两种形态，**都不改变判定结果**，只保证可见）：
   *   ① 配置缺失 / 损坏 / `paths` 为空 / 字段类型错 / 缺核心集 ⇒ **已回退默认清单**；
   *   ② 配置含机制面条目 ⇒ **已剔除该条目**、配置的其余条目**仍生效**（未回退默认）。
   * 正常时缺席。
   */
  governanceWarning?: string
}

/**
 * 写入门控判定（路径归一 + 三处相对定位）。
 *
 * ⚠ **不是纯函数**：读治理面清单（`resolveGovernancePaths`）与架构文档配置（`resolveArchPaths`）
 *   都是**磁盘读**（清单**每次重读** ⇒ 不缓存 ⇒ 改完下一次写调用即生效）。
 *   ⇒ 需要确定性的用例**注入** `governanceRoot` / `archPaths` / `governancePaths`。
 *
 * 判定顺序：
 *   1. `denyAll`（no-role）⇒ 拒；
 *   2. **治理面表**命中 ⇒ 按 `policy.governance` 放行 / 拒（治理面产出归属 architect）；
 *   3. **仓库内** ⇒ 命中 `allow ∪ archPaths` 放行，否则拒；
 *   4. 仓库外且不在治理面表内 ⇒ 不限制。
 */
export function decideWrite(input: WriteCheckInput): WriteCheckResult {
  const govRoot = input.governanceRoot ?? defaultGovernanceRoot()
  const policy = ROLE_WRITE_POLICY[input.role]
  const abs = normalizeTarget(input.filePath, input.cwd)
  const rel = path.relative(input.repoRoot, abs)
  const inRepo = rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
  const govRel = path.relative(govRoot, abs)
  const inGov = govRel !== "" && !govRel.startsWith("..") && !path.isAbsolute(govRel)
  // ⚠ 治理面判定还要看**未解析符号链接**的调用路径：本仓配置用链接切变体
  //   （`opencode.jsonc -> opencode.jsonc.<变体>`），realpath 归一后不再命中表里的字面名
  //   ⇒ 治理面归属 architect 被静默反转（实测：architect 改不了自己的配置）。
  //   双命中（调用路径 ∪ realpath 任一命中即算治理面）同时挡住反向绕过：
  //   非治理面的链接指向治理文件时，realpath 这一支仍然命中 ⇒ 仍需 governance 权利。
  const invokedAbs = path.resolve(input.cwd, input.filePath)
  const govRelInvoked = path.relative(govRoot, invokedAbs)
  const inGovInvoked = govRelInvoked !== "" && !govRelInvoked.startsWith("..") && !path.isAbsolute(govRelInvoked)
  const archPaths = input.archPaths ?? resolveArchPaths(input.repoRoot)
  // ⚠ **每次判定都重读**（不缓存）⇒ 配置改完**下一次**写调用即生效，无需重启（ADR V2）。
  //   读失败 / 配置损坏 ⇒ 由 resolveGovernancePaths 回退内置默认清单（**不是全拒**）。
  const govResolution = input.governancePaths
    ? { paths: [...input.governancePaths], source: "config" as const, warning: "" }
    : resolveGovernancePaths(govRoot)
  const govPaths = govResolution.paths
  // ⚠ **机制面禁区（判定侧，结构性保障）**：`lib/**` / `plugins/**` **永远不是治理面**
  //   （即便清单里写了它们）⇒ 治理面分支不会因「architect 往清单里加了一条 `lib`」而放行机制代码
  //   = ADR D2 明文否决的方案 A。安全**不靠清单**（ADR D2.4 原话）。
  const isMechanismPath = (rel: string): boolean =>
    GOVERNANCE_FORBIDDEN_ROOTS.some((r) => rel === r || rel.startsWith(`${r}/`))

  const display = inRepo ? rel : abs
  // 治理面命中（双命中：调用路径 ∪ realpath）。提到 `ok`/`deny` 之前算 ⇒ `denyAll` 分支也带得上
  // （写门留痕按「是否治理面」过滤，no-role 的治理面拒绝同样要留痕）。
  const govHitInvoked = inGovInvoked && !isMechanismPath(govRelInvoked) && matchesAny(govRelInvoked, govPaths)
  const govHitReal = inGov && !isMechanismPath(govRel) && matchesAny(govRel, govPaths)
  const gov = { hit: govHitInvoked || govHitReal, relPath: govHitInvoked ? govRelInvoked : govHitReal ? govRel : "" }
  const govWarn = govResolution.warning ? { governanceWarning: govResolution.warning } : {}
  const ok = (): WriteCheckResult => ({ allowed: true, absPath: abs, relPath: inRepo ? rel : "", governance: gov, ...govWarn })
  const deny = (why: string): WriteCheckResult => ({
    allowed: false,
    absPath: abs,
    relPath: inRepo ? rel : "",
    message: `role-gate: 角色「${input.role}」禁止对「${display}」执行 ${input.action} —— ${why}`,
    governance: gov,
    ...govWarn,
  })

  if (policy.denyAll) return deny(policy.why)

  // ② 治理面（表内路径）：产出归属 architect
  if (gov.hit) {
    // 拒绝时报告**调用者写下的名字**（他实际想改的那个），链接场景下更有诊断价值
    return policy.governance ? ok() : deny(`治理面（${gov.relPath}）的产出归属 architect`)
  }

  // ③ 仓库内
  if (inRepo) {
    // arch_paths 命中的架构文档**只对 architect 追加**：builder 靠 `**` 已覆盖（AC12 明文验收），
    // planner / verifier 不得写架构文档（与 rdd-verifier 的 `not_owns: docs/adr/ADR-*.md` 及 planner 散文口径一致）。
    const allow = input.role === "architect" ? [...policy.allow, ...archPaths] : policy.allow
    if (matchesAny(rel, allow)) return ok()
    return deny(policy.why)
  }

  // ④ 仓库外（非治理面表内）⇒ 不限制
  return ok()
}

function matchesAny(rel: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesPattern(rel, p))
}

/** 会话类型判定（AC17）：**只门控 build agent 的主会话**。 */
export interface GateContext {
  /** 会话的 agent 名 */
  agent: string
  /** 父会话 id；非空 ⇒ 这是**被派发后端**（宿主会给 `subagent` 会话设，**但 `ctx.session.create` 不设**） */
  parentID?: string | null
  /** 该会话在 `pair.json` 里有登记（派发面登记的权威标记） */
  registeredBackend?: boolean
  /** 该会话的角色分区带 `role_class`（`writeRoleSession` 只给后端写这一字段） */
  partitionRoleClass?: string | null
}

/**
 * 只门控 **build agent 的主会话**。
 *
 * ⚠ **后端识别有三条判据**（层 2 e2e 实测：`ctx.session.create` **不设** `parentID`，
 *   只靠它会把握手后端当主会话 ⇒ 后端被门控 + 用错角色键占租约）：
 *   ① `parentID != null`（`subagent` 会话）；② `pair.json` 有登记；③ 分区带 `role_class`。
 */
export function shouldGateSession(ctx: GateContext): boolean {
  if (ctx.parentID) return false // 后端 ⇒ 仍走 scopeEditRules（ADR D3）
  if (ctx.registeredBackend) return false // 派发面登记过的后端
  if (ctx.partitionRoleClass) return false // 后端分区（`role_class` 只由 writeRoleSession 写）
  if (ctx.agent !== "build") return false // 非 build 主会话 ⇒ 不参与（身份 ADR D3）
  return true
}

export interface EvaluateInput extends WriteCheckInput, GateContext {}

export interface EvaluateResult extends WriteCheckResult {
  /** 门控是否**生效**（后端 / 非 build 主会话 ⇒ false ⇒ 一律放行） */
  gated: boolean
  /** 是否因会话类型被跳过 */
  skipped: boolean
}

/** 门控入口（插件只调它）：会话类型 → 角色写集 ⇒ 放行 / 拒绝。 */
export function evaluateWrite(input: EvaluateInput): EvaluateResult {
  const abs = normalizeTarget(input.filePath, input.cwd)
  if (!shouldGateSession(input)) {
    return { allowed: true, gated: false, skipped: true, absPath: abs, relPath: "" }
  }
  const result = decideWrite(input)
  return { ...result, gated: true, skipped: false }
}
