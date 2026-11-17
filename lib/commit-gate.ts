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
 *   ⑧ **复合命令**：只要出现 commit，**其余每一段**都必须是「纯报告命令」或「只读 git」（`git push` / `rm` / `git add`
 *      等一律拒）。两个理由：① shell 权限是**整串前缀匹配** ⇒ 整串以 `git commit ` 开头会让 push 的 `ask` /
 *      force-push 的 `deny` 同时失效（**搭便车**）；② `git add && git commit` 的改动序使「判定对象 = 执行前 index」不成立。
 *      而**尾随的报告段**（`git commit -m x; echo "exit=$?"`）与**重定向**（`> /dev/null 2>&1`）**放行**（层 2 实测的假阳性坑）。
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

/** 包装命令（`sudo` / `env`）自己带值选项 ⇒ 跳过它们（`sudo -u u git commit`）。 */
const WRAPPER_VALUE_OPTIONS = new Set(["-u", "--user", "-g", "--group", "-p", "--prompt", "-C", "-D", "-r", "-t"])

/** 复合命令的分隔符（出现在 token 层面）。 */
const COMPOUND_TOKENS = new Set(["&&", "||", ";", "|", "&"])

/** **纯报告**命令（复合命令里的非 commit 段只允许这些 ⇒ 防「`git commit …; <危险命令>`」搭便车）。 */
export const REPORTING_COMMANDS = new Set([
  "echo",
  "printf",
  "true",
  ":",
  "exit",
  "cat",
  "ls",
  "pwd",
  "head",
  "tail",
  "wc",
  "date",
  "sleep",
  "test",
  "[",
  "false",
  "cd",
  "export",
  "set",
  "unset",
  "umask",
])

/** **只读** git 子命令（同上：复合命令里的非 commit git 段只允许这些）。 */
export const HARMLESS_GIT_SUBCOMMANDS = new Set([
  "status",
  "log",
  "diff",
  "show",
  "rev-parse",
  "describe",
  "remote",
  "config",
  "branch",
  "ls-files",
  "blame",
  "cat-file",
  "shortlog",
])

/**
 * `git` **命令词**在一段 token 里的下标（`VAR=val` 前缀 / 包装命令及其带值选项 / 子 shell 前缀都跳过）。
 * 单一真源：`gitSubcommandOf` 与 `commitInSegment` 都走它（避免两套前缀扫描漂移）。
 */
function gitWordIndex(tokens: Token[]): number {
  let i = 0
  while (i < tokens.length && isVarAssignment(tokens[i]!)) i++
  while (i < tokens.length && WRAPPERS.has(tokens[i]!.value) && !tokens[i]!.quoted) {
    i++
    while (i < tokens.length && isVarAssignment(tokens[i]!)) i++
    // 包装命令自己的带值选项（`sudo -u u` / `env -i`）
    while (i < tokens.length && !tokens[i]!.quoted && tokens[i]!.value.startsWith("-") && tokens[i]!.value !== "--") {
      const opt = tokens[i]!.value
      i++
      if (WRAPPER_VALUE_OPTIONS.has(opt)) i++
    }
  }
  // 前缀 `(` / `{` 已被 stripShellPrefix 处理；这里只剥独立成 token 的 `(` / `{` / `!`
  while (i < tokens.length && ["(", "{", "!"].includes(tokens[i]!.value)) i++
  return i
}

/** 取一段里的 git 子命令（非 git 段 ⇒ null）。 */
export function gitSubcommandOf(tokens: Token[]): string | null {
  const i = gitWordIndex(tokens)
  if (i >= tokens.length || !isGitCommandWord(tokens[i]!)) return null
  return parseGitSubcommand(tokens, i + 1)
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
    // ⚠ 重定向**剥离**（`git commit -m x > /dev/null` / `2>&1`）：否则 `>` 及其目标会变成
    //   普通 token ⇒ 被 `checkCommitForm` 判成「位置 pathspec」⇒ 合法提交被假阳性拦下。
    if (ch === ">" || ch === "<") {
      // `2>`/`2>>` 的 `2` 是 **fd 前缀**（紧贴操作符）⇒ 丢弃，否则会被判成位置 pathspec（假阳性）
      if (has && !quoted && /^[0-9]+$/.test(cur)) {
        cur = ""
        has = false
      } else if (has) {
        out.push({ value: cur, quoted })
        cur = ""
        quoted = false
        has = false
      }
      // 跳过操作符本体与其目标（`>f` / `> f` / `2>&1` / `>>f` / `&>f`）
      i++
      while (i < command.length && /[0-9&>]/.test(command[i]!) && command[i] !== "&") i++
      if (command[i] === "&") {
        i++
        while (i < command.length && /[0-9]/.test(command[i]!)) i++
      }
      while (i < command.length && /\s/.test(command[i]!)) i++
      const start = i
      while (i < command.length && !/\s/.test(command[i]!) && command[i] !== ";" && command[i] !== "|" && command[i] !== "&") i++
      if (i === start) i-- // 无目标（如 `>&2` 已在上一步吃掉）⇒ 回退一格，避免跳过下一个字符
      continue
    }
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

/** 剥掉 shell 前缀（`(git` / `{` / `!`）⇒ 首 token 仍可判成 git 命令词。 */
function stripShellPrefix(value: string): string {
  return value.replace(/^[({!]+/, "")
}

function isGitCommandWord(token: Token): boolean {
  if (token.quoted) return false
  const v = stripShellPrefix(token.value)
  if (!v.includes("/") && v !== "git") return false
  return path.basename(v) === "git"
}

/**
 * 从 `git` 之后解析**子命令**。
 * @returns 子命令名；解析不出 ⇒ `null`（⇒ 调用方 fail-closed）
 */
function parseGitSubcommandIndex(tokens: Token[], start: number): number | null {
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
  return i
}

export function parseGitSubcommand(tokens: Token[], start: number): string | null {
  const idx = parseGitSubcommandIndex(tokens, start)
  return idx === null ? null : tokens[idx]!.value
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

  // ⑧ 复合命令：出现 commit 时，**其余每一段**必须是「纯报告命令」或「只读 git」
  //   （`git add -A && git commit` / `git commit; git push --force` ⇒ 拒：前者判定对象不可判定，
  //     后者靠整串前缀搭便车；而 `git commit -m x; echo "exit=$?"` 的尾随段无害 ⇒ 放行）。
  const segments: Token[][] = [[]]
  for (const t of tokens) {
    if (!t.quoted && COMPOUND_TOKENS.has(t.value)) {
      segments.push([])
      continue
    }
    segments[segments.length - 1]!.push(t)
  }
  if (segments.length > 1) {
    const hits = segments.map((seg) => commitInSegment(seg))
    if (!hits.some((h) => h.isCommit)) return { isCommit: false }
    const blocked = hits.find((h) => h.block)
    if (blocked) return { isCommit: true, block: blocked.block, detail: blocked.detail }

    // ⚠ **复合命令的搭便车防护**：shell 权限是**整串前缀匹配** ⇒ `git commit -m x; git push --force`
    //   整串以 `git commit ` 开头 ⇒ 命中 `"git commit *": "allow"` ⇒ **push 的 ask / force-push 的 deny 同时失效**。
    //   ⇒ 只要 commit 存在，**其余每一段**都必须是「纯报告命令」或「只读 git」，否则拒。
    for (let k = 0; k < segments.length; k++) {
      if (hits[k]!.isCommit) continue
      const seg = segments[k]!
      if (seg.length === 0) continue
      const sub = gitSubcommandOf(seg)
      if (sub) {
        if (!HARMLESS_GIT_SUBCOMMANDS.has(sub)) {
          return {
            isCommit: true,
            block:
              `commit-gate: 复合命令中的 \`git ${sub}\` 段不在「只读 git」清单 ⇒ 拒绝` +
              `（整串以 \`git commit \` 开头会让 permission 的 ask / deny 全部失效 ⇒ 必须分两次调用）`,
            detail: "compound-segment",
          }
        }
        continue
      }
      const first = stripShellPrefix(seg[0]!.value)
      if (!REPORTING_COMMANDS.has(first)) {
        return {
          isCommit: true,
          block:
            `commit-gate: 复合命令中的 \`${first}\` 段不在「纯报告」清单 ⇒ 拒绝` +
            `（同上：整串前缀会让 permission 的 ask / deny 失效）`,
          detail: "compound-segment",
        }
      }
    }
    return { isCommit: true, detail: "compound" }
  }

  const hit = commitInSegment(tokens)
  if (hit.block) return { isCommit: true, block: hit.block, detail: hit.detail }
  return { isCommit: hit.isCommit, detail: hit.detail }
}

/** 单段（无复合分隔符）里是否有 commit 调用。 */
function commitInSegment(tokens: Token[]): CommitInvocation {
  // ③ 定位 `git` **命令词**（`VAR=val` / 包装命令及其选项 / 子 shell 前缀都跳过）
  const i = gitWordIndex(tokens)
  if (i >= tokens.length || !isGitCommandWord(tokens[i]!)) {
    return { isCommit: false }
  }
  const subIndex = parseGitSubcommandIndex(tokens, i + 1)
  if (subIndex === null) {
    // ⑥ 解析不出子命令 ⇒ fail-closed（不得默认「不是 commit」而放行）
    return {
      isCommit: true,
      block: "commit-gate: 无法解析 `git` 的子命令 ⇒ 拒绝（fail-closed，判定不可判定）",
      detail: "unparsable",
    }
  }
  const sub = tokens[subIndex]!.value
  if (sub !== "commit") {
    return { isCommit: false, detail: `subcommand=${sub}` }
  }
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
