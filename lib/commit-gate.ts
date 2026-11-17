/**
 * commit-gate —— **commit 审批点的纯逻辑**（`docs/adr/ADR-commit-verification-gate.md` D2 / D5 / D6）
 *
 * 门禁三条判据（全绿才放行）：
 *   ① 仓库声明的**验证命令全绿**（`<workRoot>/.rddf/commit-gate.json` 的 `verify_commands`）；
 *   ② **暂存区非空**（`git diff --cached --quiet`：0 = 空 ⇒ 拒；1 = 有 ⇒ 继续；**≥2 = 判定失败 ⇒ 拒**）；
 *   ③ **暂存内容落在当前角色的写集内** ⇒ 逐个 staged 文件**调用 `lib/role-policy.ts::decideWrite`**
 *      （**不得**在本文件重写「角色→写根」公式 —— 那是单一真源，见 `ADR-role-aware-permissions` D3/V6）。
 *
 * ⚠ **D5 的命令识别口径**（窄口径，避免误伤）：
 *   ① 引号感知分词；② 跳过 `VAR=val` 前缀；③ 定位 `git` **命令词**（basename 必须是 `git`）；
 *   ④ 跳过全局选项（`-` 前缀 token）与**已知带值选项**的值（分离值与等号形态都要覆盖）；
 *   ⑤ 子命令**精确等于** `commit`；⑥ 解析不出 / 歧义 ⇒ **拒绝**（fail-closed，不静默放行）；
 *   ⑦ **提交形态闭口**：`-a` / `--all` / `--only` / `-o` / `--include` / `-i` / `--pathspec-from-file`
 *      / **位置 pathspec**（`git commit <path>` / `git commit -- <path>`）⇒ **拒**
 *      （这些形态的**实际提交内容集 ≠ 暂存区** ⇒ 门禁不可判定）；
 *   ⑧ **复合命令**（`&&` / `;` / `||` / `|`）中含 commit ⇒ **拒**（要求分两次调用：先 add，再 commit）。
 *
 * 已知盲区（登记于 ADR D9⑥）：别名 / 函数 / `eval` / `xargs` 等把 `git` 包起来的形态。
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export interface CommitInvocation {
  /** 是否是一次 commit 调用 */
  isCommit: boolean
  /** 需要**拒绝**时的原因（不可判定 / 闭口命中）；未命中则 undefined */
  block?: string
  /** 判定依据（调试 / 错误文案） */
  detail?: string
}

/** git 全局选项里**带值**的那些（分离值与等号形态都要覆盖）。 */
const GIT_VALUE_OPTIONS = new Set([
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
  "-c",
  "-C",
])

/** `git commit` 自己**带值**的选项（跳过它们的值 ⇒ 免得把消息文本当成位置 pathspec）。 */
const COMMIT_VALUE_OPTIONS = new Set([
  "-m",
  "--message",
  "-F",
  "--file",
  "-C",
  "--reuse-message",
  "--author",
  "--date",
  "--cleanup",
  "--template",
  "--fixup",
  "--squash",
  "--trailer",
])

/** `git commit` 的**短选项簇**里必须闭口的字母（`-am` / `-ao` 这类组合写法也要抓到）。 */
const COMMIT_CLOSED_SHORT = new Set(["a", "o", "i"])

/** 可以出现在 `git` 之前的包装命令（`sudo git commit` / `env X=1 git commit`）。 */
const WRAPPERS = new Set(["sudo", "env", "nohup", "time", "command", "nice", "ionice", "stdbuf"])

/** 复合命令的分隔符（出现在 token 层面）。 */
const COMPOUND_TOKENS = new Set(["&&", "||", ";", "|", "&"])

/** 会改 index / 工作区的 git 子命令（出现在 commit **之前** ⇒ 提交内容集不可判定）。 */
export const INDEX_MUTATING_SUBCOMMANDS = new Set([
  "add",
  "rm",
  "mv",
  "restore",
  "checkout",
  "stash",
  "apply",
  "reset",
  "update-index",
])

/** 取一段里的 git 子命令（非 git 段 ⇒ null）。 */
export function gitSubcommandOf(tokens: Token[]): string | null {
  let i = 0
  while (i < tokens.length && isVarAssignment(tokens[i]!)) i++
  while (i < tokens.length && WRAPPERS.has(tokens[i]!.value) && !tokens[i]!.quoted) {
    i++
    while (i < tokens.length && isVarAssignment(tokens[i]!)) i++
  }
  if (i >= tokens.length || !isGitCommandWord(tokens[i]!)) return null
  const sub = parseGitSubcommand(tokens, i + 1)
  return sub
}

export interface Token {
  value: string
  quoted: boolean
}

/** 引号感知分词（`echo "git commit"` ⇒ **一个** token ⇒ 不会被误判成 commit 调用）。 */
export function tokenizeCommand(command: string): Token[] {
  const out: Token[] = []
  let cur = ""
  let quoted = false
  let has = false
  let quoteChar = ""
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!
    if (quoteChar) {
      if (ch === quoteChar) {
        quoteChar = ""
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quoteChar = ch
      quoted = true
      has = true
      continue
    }
    // ⚠ shell 元字符**独立成 token**（即使紧贴其它字符：`x;` ⇒ [x][;]）
    //   —— 否则 `git commit -m x; echo "..."` 会被当成**一个**命令段 ⇒ 尾随的 `echo` 被误判成
    //   「位置 pathspec」⇒ 合法提交被假阳性拦下（层 2 实测抓到的坑）。
    if (ch === ";" || ch === "&" || ch === "|") {
      if (has) {
        out.push({ value: cur, quoted })
        cur = ""
        quoted = false
        has = false
      }
      let meta = ch
      if ((ch === "&" || ch === "|") && command[i + 1] === ch) {
        meta = ch + ch
        i++
      }
      out.push({ value: meta, quoted: false })
      has = false // 元字符**自带**一个 token ⇒ 不要再让随后的空白 flush 出一个空 token
      cur = ""
      continue
    }
    if (/\s/.test(ch)) {
      if (has) {
        out.push({ value: cur, quoted })
        cur = ""
        quoted = false
        has = false
      }
      continue
    }
    cur += ch
    has = true
  }
  if (has) out.push({ value: cur, quoted })
  return out
}

function isVarAssignment(token: Token): boolean {
  return !token.quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token.value)
}

function isGitCommandWord(token: Token): boolean {
  if (token.quoted) return false
  if (!token.value.includes("/") && token.value !== "git") return false
  return path.basename(token.value) === "git"
}

/**
 * 从 `git` 之后解析**子命令**。
 * @returns 子命令名；解析不出 ⇒ `null`（⇒ 调用方 fail-closed）
 */
export function parseGitSubcommand(tokens: Token[], start: number): string | null {
  let i = start
  while (i < tokens.length) {
    const t = tokens[i]!
    if (!t.value.startsWith("-")) break
    // 带值选项：`--opt=value`（等号形态自带值）/ `--opt value`（分离值形态要额外跳一个 token）
    const eq = t.value.indexOf("=")
    const name = eq >= 0 ? t.value.slice(0, eq) : t.value
    if (GIT_VALUE_OPTIONS.has(name) && eq < 0) i += 1 // 跳过分离值
    i += 1
  }
  const sub = tokens[i]
  if (!sub || sub.quoted) return null
  return sub.value
}

/**
 * `git commit` 的**提交形态**闭口检查（ADR D5⑦）。
 * @returns 命中闭口时的原因；未命中 ⇒ undefined
 */
export function checkCommitForm(tokens: Token[], subIndex: number): string | undefined {
  let sawSeparator = false
  for (let i = subIndex + 1; i < tokens.length; i++) {
    const t = tokens[i]!
    const v = t.value
    if (v === "--") {
      sawSeparator = true
      // `--` 之后的 token 全是 pathspec ⇒ 位置 pathspec 形态
      if (i + 1 < tokens.length) return "位置 pathspec（`-- <path>`）⇒ 实际提交内容集 ≠ 暂存区"
      continue
    }
    if (v.startsWith("--")) {
      const name = v.split("=")[0]!
      if (name === "--all" || name === "--only" || name === "--include" || name === "--pathspec-from-file") {
        return `提交形态 \`${name}\` ⇒ 实际提交内容集 ≠ 暂存区`
      }
      if (COMMIT_VALUE_OPTIONS.has(name) && !v.includes("=")) i += 1 // 跳过选项值
      continue
    }
    if (v.startsWith("-") && v.length > 1) {
      // 短选项簇：`-a` / `-o` / `-i` / `-am` / `-ao` 都必须抓到
      for (const ch of v.slice(1)) {
        if (COMMIT_CLOSED_SHORT.has(ch)) {
          return `提交形态 \`-${ch}\`（含簇写法 \`${v}\`）⇒ 实际提交内容集 ≠ 暂存区`
        }
      }
      if (COMMIT_VALUE_OPTIONS.has(v)) i += 1 // 跳过选项值（如 `-m`）
      continue
    }
    // 非选项 token ⇒ 位置 pathspec
    if (!sawSeparator) return `位置 pathspec（\`git commit ${v}\`）⇒ 实际提交内容集 ≠ 暂存区`
  }
  return undefined
}

/**
 * 判定一条 shell 命令是不是一次 **commit 调用**（ADR D5）。
 *
 * ⚠ **fail-closed**：解析不出子命令（但确实出现了 `git` 命令词）⇒ `block`（拒绝），不静默放行。
 */
export function detectCommitInvocation(command: string): CommitInvocation {
  if (typeof command !== "string" || command.trim() === "") {
    return { isCommit: false, block: "commit-gate: 取不到 shell 命令 ⇒ 拒绝写类调用（fail-closed）" }
  }
  const tokens = tokenizeCommand(command)
  if (tokens.length === 0) {
    return { isCommit: false, block: "commit-gate: shell 命令为空 ⇒ 拒绝（fail-closed）" }
  }

  // ⑧ 复合命令：**只有「commit 之前的段改过 index」才拒**
  //   （`git add -A && git commit` ⇒ 判定对象不可判定 ⇒ 拒；
  //     而 `git commit -m x; echo "exit=$?"` 的**尾随**段无害 ⇒ 放行 —— 层 2 实测的假阳性坑）。
  const segments: Token[][] = [[]]
  for (const t of tokens) {
    if (!t.quoted && COMPOUND_TOKENS.has(t.value)) {
      segments.push([])
      continue
    }
    segments[segments.length - 1]!.push(t)
  }
  if (segments.length > 1) {
    let commitSeen = false
    for (const seg of segments) {
      const hit = commitInSegment(seg)
      if (hit.isCommit) {
        if (hit.block) return { isCommit: true, block: hit.block, detail: hit.detail }
        if (!commitSeen) {
          commitSeen = true
          // 前置段里若有人改过 index ⇒ 判定对象不可判定 ⇒ 拒
          for (const prev of segments.slice(0, segments.indexOf(seg))) {
            const prevSub = gitSubcommandOf(prev)
            if (prevSub && INDEX_MUTATING_SUBCOMMANDS.has(prevSub)) {
              return {
                isCommit: true,
                block:
                  `commit-gate: 复合命令中 \`git ${prevSub}\` 出现在 commit **之前** ⇒ 提交内容集不可判定 ⇒ 拒绝` +
                  `（要求**分两次调用**：先 add，再 commit）`,
                detail: "compound-index-mutation",
              }
            }
          }
        }
      }
    }
    if (commitSeen) return { isCommit: true, detail: "compound-tail" }
    return { isCommit: false }
  }

  const hit = commitInSegment(tokens)
  if (hit.block) return { isCommit: true, block: hit.block, detail: hit.detail }
  return { isCommit: hit.isCommit, detail: hit.detail }
}

/** 单段（无复合分隔符）里是否有 commit 调用。 */
function commitInSegment(tokens: Token[]): CommitInvocation {
  // ③ 定位 `git` **命令词**：允许 `VAR=val` 前缀与已知包装命令
  let i = 0
  while (i < tokens.length && isVarAssignment(tokens[i]!)) i++
  while (i < tokens.length && WRAPPERS.has(tokens[i]!.value) && !tokens[i]!.quoted) {
    i++
    while (i < tokens.length && isVarAssignment(tokens[i]!)) i++
  }
  if (i >= tokens.length || !isGitCommandWord(tokens[i]!)) {
    return { isCommit: false }
  }
  const sub = parseGitSubcommand(tokens, i + 1)
  if (sub === null) {
    // ⑥ 解析不出子命令 ⇒ fail-closed（不得默认「不是 commit」而放行）
    return {
      isCommit: true,
      block: "commit-gate: 无法解析 `git` 的子命令 ⇒ 拒绝（fail-closed，判定不可判定）",
      detail: "unparsable",
    }
  }
  if (sub !== "commit") {
    return { isCommit: false, detail: `subcommand=${sub}` }
  }
  const subIndex = tokens.findIndex((t, idx) => idx > i && t.value === "commit")
  const form = checkCommitForm(tokens, subIndex)
  if (form) {
    return { isCommit: true, block: `commit-gate: ${form} ⇒ 拒绝（门禁不可判定）`, detail: "closed-form" }
  }
  return { isCommit: true, detail: "subcommand=commit" }
}

// ════════════════════════════════════════════════════════════════════════
// 门禁声明（仓库自声明 ⇒ 未声明的仓库不设门禁）
// ════════════════════════════════════════════════════════════════════════

export interface CommitGateDeclaration {
  /** 验证命令（argv 数组的数组）—— 逐条执行，任一非 0 ⇒ 拒 */
  verify_commands: string[][]
  /** 单条命令超时（毫秒），默认 600000 */
  timeout_ms?: number
}

export const DECLARATION_REL = path.join(".rddf", "commit-gate.json")

/** 读声明；不存在 / 损坏 ⇒ `null`（⇒ 不设门禁；损坏时由调用方告警）。 */
export function readDeclaration(workRoot: string): { decl: CommitGateDeclaration | null; error?: string } {
  const file = path.join(workRoot, DECLARATION_REL)
  if (!existsSync(file)) return { decl: null }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CommitGateDeclaration
    if (!parsed || !Array.isArray(parsed.verify_commands) || parsed.verify_commands.length === 0) {
      return { decl: null, error: `${file} 的 verify_commands 为空或缺失 ⇒ 门禁视作未声明` }
    }
    const bad = parsed.verify_commands.find((c) => !Array.isArray(c) || c.length === 0 || c.some((x) => typeof x !== "string"))
    if (bad) {
      return { decl: null, error: `${file} 的 verify_commands 形状非法（必须是 argv 数组的数组）⇒ 门禁视作未声明` }
    }
    return { decl: parsed }
  } catch (e: any) {
    return { decl: null, error: `${file} 解析失败（${e?.message ?? e}）⇒ 门禁视作未声明` }
  }
}

// ════════════════════════════════════════════════════════════════════════
// 三判据的组合判定（可注入 ⇒ 层 1b 可测）
// ════════════════════════════════════════════════════════════════════════

export interface GateInput {
  /** 声明（`null` ⇒ 不设门禁 ⇒ 放行） */
  declaration: CommitGateDeclaration | null
  /** 暂存文件（绝对路径） */
  stagedFiles: string[]
  /** 暂存区判定结果：`empty` | `has` | `failed` */
  stagedState: "empty" | "has" | "failed"
  /** 逐文件写集判定（注入 `decideWrite` 的结果映射）：`null` = 允许 */
  writeSetViolations: Array<{ file: string; reason: string }>
  /** 验证结果（注入执行器） */
  verification: { ok: boolean; failedCommand?: string[]; outputTail?: string }
}

export interface GateOutcome {
  allowed: boolean
  /** 拒绝原因（可诊断） */
  reason?: string
}

/** 三判据的组合（顺序 = **先便宜后昂贵**：暂存 → 写集 → 验证；语义与 ADR D2 一致）。 */
export function evaluateCommitGate(input: GateInput): GateOutcome {
  if (!input.declaration) return { allowed: true }
  if (input.stagedState === "failed") {
    return { allowed: false, reason: "commit-gate: 无法判定暂存区状态（`git diff --cached` 失败 / 非 git 目录）⇒ 拒绝（fail-closed）" }
  }
  if (input.stagedState === "empty") {
    return { allowed: false, reason: "commit-gate: 暂存区为空 ⇒ 请先 `git add` 再提交" }
  }
  if (input.writeSetViolations.length > 0) {
    const v = input.writeSetViolations[0]!
    return {
      allowed: false,
      reason: `commit-gate: 暂存内容越出当前角色的写集 ⇒ 拒绝：${v.file}（${v.reason}）`,
    }
  }
  if (!input.verification.ok) {
    const cmd = input.verification.failedCommand?.join(" ") ?? "(未知命令)"
    const tail = input.verification.outputTail ? `\n--- 输出尾部 ---\n${input.verification.outputTail}` : ""
    return { allowed: false, reason: `commit-gate: 验证命令失败 ⇒ 拒绝提交：\n$ ${cmd}${tail}` }
  }
  return { allowed: true }
}
