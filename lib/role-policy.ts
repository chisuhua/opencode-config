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
 * **路径口径**：判定一律基于**归一绝对路径**（相对 cwd 先解析；`../` 收敛；symlink 走 realpath），
 *   再按「治理面表 / 仓库根 / arch_paths」三处相对定位（见 `decideWrite`）。
 */
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import type { Role } from "./role-identity.ts"

export type WriteAction = "edit" | "write"

/**
 * 治理面在治理根（默认 `~/.config/opencode`）下的相对路径。
 * 口径 = `prompts/build.md` §审查配对 的「治理面作用域」表 —— **必须带 `~/.config/opencode/` 前缀**理解。
 */
export const GOVERNANCE_PATHS = [
  "prompts",
  "commands",
  "scripts",
  "AGENTS.md",
  "opencode.json",
  "opencode.jsonc",
  "docs/MULTI-AGENT-DESIGN.md",
  "docs/CHANGELOG.md",
  "docs/SUBAGENT-ORCHESTRATION.md",
  "tests/config-guards.test.ts",
]

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
    allow: [".rddf/config/arch-docs.json", ".rddf/reviews"],
    governance: true,
    denyAll: false,
    why: "architect 的写集 = 架构文档（arch_paths 命中）+ 治理面 + .rddf/reviews/**",
  },
  planner: {
    allow: [".rddf/roadmap", ".rddf/improvements", "openspec/changes/*/proposal.md"],
    governance: false,
    denyAll: false,
    why: "planner 的写集 = .rddf/roadmap/**、.rddf/improvements/**、proposal.md",
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
    why: "verifier 只读实现面（验收不改实现）",
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
}

export interface WriteCheckResult {
  allowed: boolean
  /** 拒绝原因（message 含**角色 + 路径 + 动作**三要素） */
  message?: string
  /** 归一后的绝对路径 */
  absPath: string
  /** 相对 repoRoot 的路径（不在仓库内则为空串） */
  relPath: string
}

/**
 * 写入门控判定（纯逻辑，无 IO 副作用；路径归一 + 三处相对定位）。
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
  const archPaths = input.archPaths ?? resolveArchPaths(input.repoRoot)

  const display = inRepo ? rel : abs
  const ok = (): WriteCheckResult => ({ allowed: true, absPath: abs, relPath: inRepo ? rel : "" })
  const deny = (why: string): WriteCheckResult => ({
    allowed: false,
    absPath: abs,
    relPath: inRepo ? rel : "",
    message: `role-gate: 角色「${input.role}」禁止对「${display}」执行 ${input.action} —— ${why}`,
  })

  if (policy.denyAll) return deny(policy.why)

  // ② 治理面（表内路径）：产出归属 architect
  if (inGov && matchesAny(govRel, GOVERNANCE_PATHS)) {
    return policy.governance ? ok() : deny(`治理面（${govRel}）的产出归属 architect`)
  }

  // ③ 仓库内
  if (inRepo) {
    const allow = [...policy.allow, ...archPaths]
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
  /** 父会话 id；非空 ⇒ 这是**被派发后端** */
  parentID?: string | null
}

export function shouldGateSession(ctx: GateContext): boolean {
  if (ctx.parentID) return false // 后端 ⇒ 仍走 scopeEditRules（ADR D3）
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
