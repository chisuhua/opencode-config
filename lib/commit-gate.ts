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
 *   ⑧ **commit 必须单独成段**：命令串出现引号外的 `;` / `&&` / `||` / `|` / `&` / **换行**且**去空段后段数 > 1** ⇒ **拒**
 *      （末位 `&` ⇒ 后台执行 ⇒ 拒；末位 `;` / 换行 ⇒ 只是**空命令** ⇒ 放行）。
 *      理由：shell 权限是**整串前缀匹配** ⇒ 整串以 `git commit ` 开头会命中 `git commit *: allow`，其余**任意**段
 *      都会搭便车（`git push --force` / `git branch -D` / `cat .env` / `rm -rf` / `cd 别的仓` …）⇒ 不可能用「无害命令
 *      白名单」枚举干净（白名单与配置里真实的 ask/deny 档位必然对不齐）⇒ **fail-closed**。重定向（`> f` / `2>&1` /
 *      fd 前缀 `2>`）不是段分隔符 ⇒ `git commit -m x > /dev/null 2>&1` 照常放行。
 *   ⑨ **命令替换**（`$(…)` / 反引号 / 进程替换 `<(...)` `>(...)`，**单引号外**）⇒ **拒**：内容不在静态可见范围，
 *      而 `git commit *: allow` 会把它们一起放行。
 *   ⑪ **解释器闭口**：段首是 `bash -c` / `sh -c` / `eval` / `xargs` / `ssh` / `docker exec` / `kubectl exec` …
 *      且整串（**含引号内**）提到 `git commit` 或 force push ⇒ **拒**（被解释的字符串对门禁不可见）。
 *   ⑩ **判定对象可定位**：`git -C` / `--git-dir` / `--work-tree` / `GIT_DIR=` / `GIT_WORK_TREE=` / `GIT_INDEX_FILE=` /
 *      `GIT_COMMON_DIR=` ⇒ **拒**；`git` 之前有**包装命令**（`sudo` / `env` / `nohup` / `time` / `timeout` / `exec` …）⇒ **拒**
 *      （门禁只能判**会话所在仓**；换仓后暂存区 / 写集 / 验证命令全部错位）。
 *
 * 已知盲区（登记于 ADR D9③⑥）：`bash -c '…'` / `eval` / `xargs` / 别名 / 函数 等把 `git` 藏进**引号或字符串**的形态。
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

/**
 * **解释器 / 远程执行包装**（`bash -c` / `sh -c` / `eval` / `xargs` / `ssh` / `docker exec` / `kubectl exec` …）。
 * ⚠ 用于 ADR D5⑪：这类命令把**另一个字符串**交给另一个解释器 ⇒ 门禁看不到里面的 `git`。
 * ⚠ `scp` / `rsync` 在列按「它们能指定**远端 shell / 传输程序**」算（`scp -S` / `rsync -e/--rsh`）：
 *   该参数值同样是**交给另一个程序执行的字符串**。
 */
const INTERPRETER_WRAPPERS = new Set([
  "bash",
  "sh",
  "zsh",
  "dash",
  "ksh",
  "fish",
  "eval",
  "xargs",
  "ssh",
  "scp",
  "rsync",
  "docker",
  "podman",
  "kubectl",
  "nsenter",
  "expect",
])

/** 可以出现在 `git` 之前的包装命令（`sudo git commit` / `env X=1 git commit`）。 */
const WRAPPERS = new Set([
  "sudo",
  "env",
  "nohup",
  "time",
  "command",
  "nice",
  "ionice",
  "stdbuf",
  "exec",
  "builtin",
  "setsid",
  "timeout",
  "chroot",
])

/** 包装命令（`sudo` / `env`）自己带值选项 ⇒ 跳过它们（`sudo -u u git commit`）。 */
const WRAPPER_VALUE_OPTIONS = new Set(["-u", "--user", "-g", "--group", "-p", "--prompt", "-C", "-D", "-r", "-t"])

/**
 * 段分隔符（token 层面）：引号外的 `;` / `&&` / `||` / `|` / `&` / **换行**。
 * ⚠ 出现任何一个且任一段是 commit ⇒ **拒**（整串前缀匹配 ⇒ 其余段搭便车）。
 */
const COMPOUND_TOKENS = new Set(["&&", "||", ";", "|", "&", "\n"])

/** 这一段是否**以解释器 / 远程执行包装开头**（`bash -c` / `sudo bash -c` / `ssh host` …）。 */
function segmentStartsWithInterpreter(seg: Token[]): boolean {
  let i = 0
  while (i < seg.length && isVarAssignment(seg[i]!)) i++
  while (i < seg.length && WRAPPERS.has(seg[i]!.value)) {
    i++
    while (i < seg.length && isVarAssignment(seg[i]!)) i++
    while (i < seg.length && !seg[i]!.quoted && seg[i]!.value.startsWith("-") && seg[i]!.value !== "--") {
      const opt = seg[i]!.value
      i++
      if (WRAPPER_VALUE_OPTIONS.has(opt)) i++
    }
  }
  const t = seg[i]
  // ⚠ **引号包住也算**（`"bash" -c 'git push --force …'` 照样执行 bash）—— 与 `isGitCommandWord` 同一立场
  return !!t && INTERPRETER_WRAPPERS.has(t.value)
}

/**
 * 整串（**含引号内**）是否提到 `git commit` 或 force push。
 * ⚠ 归一化空白后再匹配 ⇒ 换行 / 多空格 / 引号包裹都算。
 */
export function mentionsCommitOrForcePush(raw: string): boolean {
  // 去掉引号 ⇒ 被解释的字符串内容对分词可见（`bash -c "git push -uf origin main"`）
  const flat = raw.replace(/["'`]/g, " ")
  const tokens = tokenizeCommand(flat)
  for (let i = 0; i < tokens.length; i++) {
    if (!isGitCommandWord(tokens[i]!)) continue
    const subIndex = parseGitSubcommandIndex(tokens, i + 1)
    if (subIndex === null) continue
    const sub = tokens[subIndex]!.value
    if (sub === "commit") return true
    if (sub === "push") {
      // ⚠ **与顶层判定共用同一 helper** ⇒ 两层口径自动一致（S1–S5：前缀 / 短簇 / `+refspec` / 跳带值）
      if (scanForcePush(tokens, subIndex + 1).hit) return true
    }
  }
  return false
}

/** 整串是否以**后台执行**（`&`）收尾（尾部可跟纯分隔符 `\n` / `;`）。 */
function endsWithBackgroundAmp(tokens: Token[]): boolean {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!
    // ⚠ **带引号的 `&` 是数据**（`git commit -m "&"`）⇒ 不是分隔符 ⇒ 不算后台执行
    if (t.quoted) return false
    const v = t.value
    if (v === "\n" || v === ";") continue
    return v === "&"
  }
  return false
}

/** 这一段是否以**包装命令**开头（`sudo` / `env` / `timeout` / `exec` …；`VAR=val` 前缀不算）。 */
function startsWithWrapper(tokens: Token[]): boolean {
  let i = 0
  while (i < tokens.length && isVarAssignment(tokens[i]!)) i++
  const t = tokens[i]
  return !!t && WRAPPERS.has(t.value)
}

/**
 * `git` **命令词**在一段 token 里的下标（`VAR=val` 前缀 / 包装命令及其带值选项 / 子 shell 前缀都跳过）。
 * ⚠ 跳过的包装命令**不是放行**：`commitInSegment` 一旦发现 `git` 前有包装命令 ⇒ 拒（ADR D5⑩）。
 */
function gitWordIndex(tokens: Token[]): number {
  let i = 0
  while (i < tokens.length && isVarAssignment(tokens[i]!)) i++
  while (i < tokens.length && WRAPPERS.has(tokens[i]!.value)) {
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

export interface Token {
  value: string
  quoted: boolean
  /** 该 token 的**首字符**来自引号（`"sudo"` / `"FOO=bar"` ⇒ shell 里是**命令名**，不是赋值） */
  leadingQuote?: boolean
}

/**
 * **heredoc 剥离**（仅用于**识别**，不改实际执行的命令）。
 *
 * `git commit -F - <<'MSG' … MSG` 这类写法里，heredoc 正文是**数据**（不是命令）⇒ 不得被当成
 * 「位置 pathspec」误拒，也不得让正文里的 `git commit` 字面量被误判成命令。
 *
 * **ADR Rev 2 / 2.1（D5 第 0 步）：单遍扫描 + 引号状态跨行** —— 与 `tokenizeCommand` **同一套**
 * 引号 / 转义规则（双引号内 `\"` `\\` 转义、单引号内 `\` 全字面、引号外 `\` 转义下一个字符、
 * `$'…'` / `$"…"` 按对应引用处理）。理由：`bash -c "a` / `<<'EOF'` / `" ; git commit -m x` 里那个
 * `<<'EOF'` 在**跨行引号内**（是数据），逐行状态机会把它当真标记 ⇒ 剥到串尾 ⇒ 吞掉真正的第二段命令
 * （**实测 fail-open**：真实 shell 执行了第二段，门禁判 `isCommit: false`）。
 *
 * **输出契约（H1–H6）**
 * - **H1** 只有**引号外**的 `<<`（且不是 `<<<` herestring）才是候选标记；
 * - **H2** 候选标记**所在行必须引号平衡**（行末引号状态为空）⇒ 否则不是标记
 *   （bash 语义：命令行未完成 ⇒ heredoc 尚未开始 ⇒ 后续行都是字符串的一部分）；
 * - **H3** **标记本身**删除，**标记行其余部分逐字保留**（含 `&&` 尾部与重定向）；
 * - **H4** **正文行与终止行整行删除**（不留空行 ⇒ 段数计数不受影响）；
 * - **H5** 终止行判定与 bash 一致：普通 `<<` **整行相等**；`<<-` 去掉**前导 tab** 后相等；
 *   未找到终止行 ⇒ 按 bash 吞到串尾；
 * - **H6** 输出仍是「可再次 tokenize 的命令串」。
 */
export function stripHeredocs(command: string): string {
  const lines = command.split("\n")
  const out: string[] = []
  let quote: string | null = null // **跨行**的引号状态
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const scan = scanLine(line, quote)
    // H2：本行引号未闭合（行首或行末）⇒ 行内**没有** heredoc 标记（原样保留，状态继续）
    if (quote !== null || scan.endQuote !== null) {
      out.push(line)
      quote = scan.endQuote
      i++
      continue
    }
    const start = scan.candidates[0]
    const marker = start === undefined ? null : parseHeredocMarker(line, start)
    if (!marker) {
      out.push(line)
      i++
      continue
    }
    // H3：标记本身删除，**标记行其余部分逐字保留**
    out.push(line.slice(0, start) + line.slice(marker.end))
    i++
    // H4 / H5：正文行与终止行整行删除（未找到终止行 ⇒ 吞到串尾）
    while (i < lines.length) {
      const l = lines[i]!
      i++
      if (isHeredocTerminator(l, marker.delim, marker.stripTabs)) break
    }
  }
  return out.join("\n")
}

/**
 * 扫一行：返回**引号外**的 `<<` 候选位置与**行末**的引号状态。
 * @param line   该行文本
 * @param quote0 行首的引号状态（跨行携带；`null` = 不在引号内）
 */
function scanLine(line: string, quote0: string | null): { endQuote: string | null; candidates: number[] } {
  let quote = quote0
  const candidates: number[] = []
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quote) {
      // 双引号内 `\` 转义下一个字符（bash 语义）；单引号内 `\` 是**字面量**
      if (quote === '"' && ch === "\\") {
        i++
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === "\\") {
      i++ // 引号外转义 ⇒ 下一个字符是字面量
      continue
    }
    if (ch === "$" && (line[i + 1] === "'" || line[i + 1] === '"')) {
      // ⚠ **不动 i**（for 循环末尾的 `i++` 会正好落到引号上）—— 与 `tokenizeCommand` 同一套规则；
      //   多跳一格会让开引号**不被跟踪** ⇒ `cat <<EOF $'` 这类「标记行尾部挂未闭合 `$'…'`」被判成
      //   引号平衡 ⇒ `<<` 被当真标记 ⇒ 剥掉后续行 ⇒ **漏判真命令**（critic 抓到的 BLOCKER）。
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      continue
    }
    // `<<` 候选（`<<<` 是 herestring ⇒ 不算）
    if (ch === "<" && line[i + 1] === "<" && line[i + 2] !== "<") candidates.push(i)
  }
  return { endQuote: quote, candidates }
}

/** 解析一个 heredoc 标记（分隔词 + 结束位置）。不是合法标记 ⇒ null。 */
function parseHeredocMarker(
  line: string,
  start: number,
): { end: number; delim: string; stripTabs: boolean } | null {
  let j = start + 2
  let stripTabs = false
  if (line[j] === "-") {
    stripTabs = true
    j++
  }
  while (j < line.length && (line[j] === " " || line[j] === "\t")) j++
  if (j >= line.length) return null
  const q = line[j]
  if (q === "'" || q === '"') {
    const close = line.indexOf(q, j + 1)
    if (close < 0) return null
    let delim = line.slice(j + 1, close)
    let end = close + 1
    // 引号后仍可接词字符（bash：`<<'E'OF` ⇒ 分隔词 `EOF`）
    const more = /^[A-Za-z0-9_]*/.exec(line.slice(end))
    if (more && more[0]) {
      delim += more[0]
      end += more[0].length
    }
    return { end, delim, stripTabs }
  }
  const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(j))
  if (!m) return null
  return { end: j + m[0].length, delim: m[0], stripTabs }
}

/** 该行是不是 heredoc 的**终止行**（bash 语义：普通 `<<` 整行相等；`<<-` 去前导 tab）。 */
function isHeredocTerminator(line: string, delim: string, stripTabs: boolean): boolean {
  let l = line.replace(/\r$/, "") // CRLF 容忍
  if (stripTabs) l = l.replace(/^\t+/, "")
  return l === delim
}

/** 引号感知分词（`echo "git commit"` ⇒ **一个** token ⇒ 不会被误判成 commit 调用）。 */
export function tokenizeCommand(command: string): Token[] {
  const out: Token[] = []
  let cur = ""
  let quoted = false
  let has = false
  let leadQuote = false
  let quoteChar = ""
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!
    if (quoteChar) {
      if (ch === quoteChar) {
        quoteChar = ""
      } else if (quoteChar === '"' && ch === "\\" && i + 1 < command.length) {
        // ⚠ **双引号内的转义**（`\"` / `\\` / `\$` / `` \` ``）⇒ 字面量（shell 语义）
        //   —— 否则 `git commit -m "say \"hi\" && b"` 里的引号会提前闭合 ⇒ 其中的 `&` 跑成**分隔符**
        //   ⇒ 合法提交被误判成「复合命令」。
        cur += command[i + 1]!
        i++
      } else {
        cur += ch
      }
      continue
    }
    // ⚠ **引号外的反斜杠 = 转义**（bash 语义，ADR Rev 3 D5③）：
    //   `g\it` ⇒ 词值 `git`（转义的是**非空格**字符 ⇒ 词还是 git ⇒ bash 真的执行 git）；
    //   `\ `（转义**空格**）⇒ **不产生分隔** ⇒ `git\ commit` 仍**一个**词（词值 `git commit`，不是 git）。
    if (ch === "\\") {
      const next = command[i + 1]
      if (next === undefined) {
        cur += ch // 末尾的孤立反斜杠（bash 会等续行）⇒ 当字面量
        has = true
        i++
        continue
      }
      cur += next
      has = true
      i += 1 // ⚠ for 循环末尾还会 `i++` ⇒ 这里只能 +1（否则会多吃一个字符：`g\it` ⇒ `gi`）
      continue
    }
    // ⚠ **`$'…'` / `$"…"`**（ANSI-C / locale 引用）：`$` **不进**词值 ⇒ `$'git'` ⇒ 词值 `git`
    //   （bash 会把它还原成 `git` ⇒ 真执行 git ⇒ 必须识别）。
    if (ch === "$" && (command[i + 1] === "'" || command[i + 1] === '"')) {
      // ⚠ **不动 i**（for 循环末尾的 `i++` 会正好落到引号上）⇒ `$` 不进词值，下一轮按引号处理
      continue
    }
    if (ch === '"' || ch === "'") {
      quoteChar = ch
      quoted = true
      if (!has) leadQuote = true // ⚠ 首字符来自引号 ⇒ shell 里是命令名，不是赋值前缀
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
        out.push({ value: cur, quoted, leadingQuote: leadQuote })
        cur = ""
        quoted = false
        has = false
        leadQuote = false
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
    if (ch === "&" && command[i + 1] === ">") {
      // `&>` / `&>>` = **stdout+stderr 重定向**（不是后台执行）⇒ 连同目标一起剥离
      // ⚠ fd 前缀（`2>&1` 那种）走的是上面的 `>` 分支（那里已剥）⇒ 本分支不重复处理
      if (has) {
        out.push({ value: cur, quoted, leadingQuote: leadQuote })
        cur = ""
        quoted = false
        has = false
        leadQuote = false
      }
      i += 2 // 跳过 `&>`
      while (i < command.length && /[0-9&>]/.test(command[i]!) && command[i] !== "&") i++
      if (command[i] === "&") {
        i++
        while (i < command.length && /[0-9]/.test(command[i]!)) i++
      }
      while (i < command.length && /\s/.test(command[i]!)) i++
      const start = i
      while (i < command.length && !/\s/.test(command[i]!) && command[i] !== ";" && command[i] !== "|" && command[i] !== "&") i++
      if (i === start) i--
      continue
    }
    if (ch === "\n") {
      if (has) {
        out.push({ value: cur, quoted, leadingQuote: leadQuote })
        cur = ""
        quoted = false
        has = false
        leadQuote = false
      }
      out.push({ value: "\n", quoted: false })
      continue
    }
    if (ch === ";" || ch === "&" || ch === "|") {
      if (has) {
        out.push({ value: cur, quoted, leadingQuote: leadQuote })
        cur = ""
        quoted = false
        has = false
        leadQuote = false
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
        out.push({ value: cur, quoted, leadingQuote: leadQuote })
        cur = ""
        quoted = false
        has = false
        leadQuote = false
      }
      continue
    }
    cur += ch
    has = true
  }
  if (has) out.push({ value: cur, quoted, leadingQuote: leadQuote })
  return out
}

/**
 * 该 token 是不是 `VAR=val` **赋值前缀**。
 * ⚠ **值可带引号**（`GIT_AUTHOR_NAME="x" git commit` 是赋值）但**名字不可**（`"FOO=bar" git commit`
 * 在 shell 里是**命令名**）⇒ 用 `leadingQuote` 判「名字是否被引号包住」。
 */
function isVarAssignment(token: Token): boolean {
  if (token.leadingQuote) return false
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token.value)
}

/**
 * **命令替换**扫描（ADR D5⑨）：`$(` / 反引号 / 进程替换 `<(` `>(`，**单引号外**都算
 * （双引号内仍会做替换；`\$(` 这类转义不算）。
 */
export function containsCommandSubstitution(command: string): boolean {
  let i = 0
  let quote: string | null = null
  while (i < command.length) {
    const ch = command[i]!
    if (quote === "'") {
      if (ch === "'") quote = null
      i++
      continue
    }
    if (ch === "\\") {
      i += 2 // 转义 ⇒ 下一个字符是字面量
      continue
    }
    if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === "$" && command[i + 1] === "(") return true
      else if (ch === "`") return true
      i++
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      i++
      continue
    }
    if (ch === "$" && command[i + 1] === "(") return true
    if (ch === "`") return true
    if ((ch === "<" || ch === ">") && command[i + 1] === "(") return true // 进程替换
    i++
  }
  return false
}

/**
 * **强推指示符的扫描**（ADR Rev 2 / 2.1 的 D4 判定表 S1–S5）—— **单一真源**：
 * `lib/push-gate.ts` 的顶层判定与 D5⑪ 的字符串侧判定都调它
 * （避免「顶层拒 `-uf`、包进 bash 就放行」这类两层分裂）。
 *
 * 判定表：
 * - **S1 长选项按前缀**：`--force*` / `--mirror*`（git 允许长选项缩写 ⇒ `git push --mirro` 也命中）
 *   ⇒ `--no-force-with-lease` **不**命中（`--no-` 天然不匹配前缀）。
 * - **S2 短选项逐字母**：`-f` / `-uf` 命中；**遇带值短选项（`-o`）即停** ⇒ `-oquickfix` 不命中。
 * - **S3 前导 `+` 的 refspec**：`+main` / `+a:b` 命中；`:old`（删除类）**不**命中（D9⑭）。
 * - **S4 quoted 不跳过**：shell 去引号后即真身 ⇒ `"+main"` / `"--force"` 命中。
 * - **S5 跳带值选项的值**（`-o` / `--push-option` / `--receive-pack` / `--exec` / `--repo`）
 *   ⇒ `git push -o +ci origin main` **不**命中（合法、非强推）。
 */
export interface ForcePushScan {
  /** 是否命中强推指示符 */
  hit: boolean
  /** 命中的类别（`S1` / `S2` / `S3`） */
  kind?: "long" | "short-cluster" | "plus-refspec"
  /** 命中的 token 原文（用于错误文案） */
  token?: string
}

/**
 * 强推长选项（ADR D4：六形态里的 `--force*` 与 `--mirror*`）。
 * ⚠ git 允许**长选项缩写**（实测 `git push --mirro` 被接受为 `--mirror`）⇒ 判定要**双向**匹配：
 *   选项名以已知强推项**开头**（`--force-with-lease`）**或**已知强推项以选项名**开头**（`--forc` / `--mirro`）。
 * ⚠ `--no-*` 天然不匹配（`--no-force-with-lease` ⇒ 不拒）。
 */
const FORCE_LONG_OPTIONS = ["--force", "--force-with-lease", "--force-if-includes", "--mirror"]

/** `git push` 的**带值选项**（其值可能是 `+…` ⇒ 必须跳过，否则误判成强推）。 */
const PUSH_VALUE_OPTIONS = new Set(["-o", "--push-option", "--receive-pack", "--exec", "--repo"])

/**
 * 从 `tokens[from]` 起（`from` = `push` 子命令 token 的**下一个**下标）扫描强推指示符。
 * @param tokens 分词结果
 * @param from   扫描起点
 */
export function scanForcePush(tokens: Token[], from: number): ForcePushScan {
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i]!
    const v = t.value
    // ── S1：长选项（按前缀）──
    if (v.startsWith("--") && v !== "--") {
      const eq = v.indexOf("=")
      const name = eq >= 0 ? v.slice(0, eq) : v
      if (FORCE_LONG_OPTIONS.some((opt) => opt.startsWith(name) || name.startsWith(opt))) {
        return { hit: true, kind: "long", token: v }
      }
      // S5：带值长选项的**分离值形态** ⇒ 跳过它的值（等号形态自带值，无需跳）
      // ⚠ git 允许**长选项缩写** ⇒ 双向前缀匹配（`--push-o` ⇒ `--push-option`）
      const isValueOpt = [...PUSH_VALUE_OPTIONS].some((opt) => opt.startsWith(name) || name.startsWith(opt))
      if (eq < 0 && isValueOpt) i += 1
      continue
    }
    // ── S2：短选项（逐字母解析；遇带值短选项即停）──
    if (v.startsWith("-") && v.length > 1) {
      const letters = v.slice(1)
      for (let k = 0; k < letters.length; k++) {
        const c = letters[k]!
        if (c === "o") {
          // `-o` 带值：其后若是**附着值**（`-o+ci`）⇒ 值已在本 token 内；否则值是**下一个 token**
          if (k === letters.length - 1) i += 1
          break // 附着值结束 ⇒ 后续字符不是选项字母
        }
        if (c === "f") return { hit: true, kind: "short-cluster", token: v }
      }
      continue
    }
    // ── S3：前导 `+` 的 refspec ──
    if (v.startsWith("+") && v.length > 1) {
      return { hit: true, kind: "plus-refspec", token: v }
    }
  }
  return { hit: false }
}

/** 会让「判定对象」换仓的 git 全局选项（ADR D5⑩）。 */
const RELOCATING_GIT_OPTIONS = ["-C", "--git-dir", "--work-tree"]

/** 会让「判定对象」换仓的环境变量（ADR D5⑩）。 */
const RELOCATING_ENV_VARS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]

/** 该 token 是否是换仓选项（`-C <dir>` / `-C<dir>` / `--git-dir[=]<dir>` / `--work-tree[=]<dir>`）。 */
function relocatingOptionOf(value: string): string | null {
  for (const opt of RELOCATING_GIT_OPTIONS) {
    if (value === opt) return opt
    if (value.startsWith(`${opt}=`)) return opt
    if (opt === "-C" && value.startsWith("-C") && value.length > 2) return opt
  }
  return null
}

/** 剥掉 shell 前缀（`(git` / `{` / `!`）⇒ 首 token 仍可判成 git 命令词。 */
function stripShellPrefix(value: string): string {
  return value.replace(/^[({!]+/, "")
}

/**
 * 该 token 是不是 `git` **命令词**。
 * ⚠ **引号包住也算**（`"git" commit -m x` 照样会执行 git）—— 否则它既不触发门禁、也不匹配
 *   `git commit *: allow`（build 的 shell 默认档是 `"*": "allow"`）⇒ **未验证的提交直接落地**。
 *   引号形态**不剥** shell 前缀（`"(git"` 不是命令词）。
 */
export function isGitCommandWord(token: Token): boolean {
  const v = token.quoted ? token.value : stripShellPrefix(token.value)
  if (!v.includes("/") && v !== "git") return false
  return path.basename(v) === "git"
}

/**
 * 从 `git` 之后解析**子命令**。
 * @returns 子命令名；解析不出 ⇒ `null`（⇒ 调用方 fail-closed）
 */
export function parseGitSubcommandIndex(
  tokens: Token[],
  start: number,
  allowQuotedSub = false,
): number | null {
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
  if (!sub) return null
  // ⚠ 默认**拒绝**引号包住的子命令（`git "commit"` ⇒ fail-closed 误拒，登记于 ADR D9 的残余面）；
  //   `allowQuotedSub = true` 时**接受**（push 侧要用：`git "push" --force` 照样执行 git）。
  if (sub.quoted && !allowQuotedSub) return null
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
  // ⚠ heredoc 正文是**数据** ⇒ 识别前先剥离（否则正文会被当成位置 pathspec / 命令字面量）
  const cmd = stripHeredocs(command)
  const tokens = tokenizeCommand(cmd)
  if (tokens.length === 0) {
    return { isCommit: false, block: "commit-gate: shell 命令为空 ⇒ 拒绝（fail-closed）" }
  }

  // ⑧ **commit 必须单独成段**：引号外出现 `;` / `&&` / `||` / `|` / `&` / 换行 ⇒ 只要任一段是 commit 就拒。
  //   理由：整串以 `git commit ` 开头 ⇒ 命中 `git commit *: allow` ⇒ 其余**任意**段都搭便车
  //   （`git push --force` / `git branch -D` / `cat .env` / `rm -rf` / `cd 别的仓`）⇒ 白名单枚举不干净 ⇒ fail-closed。
  const segments: Token[][] = [[]]
  for (const t of tokens) {
    if (!t.quoted && COMPOUND_TOKENS.has(t.value)) {
      segments.push([])
      continue
    }
    segments[segments.length - 1]!.push(t)
  }
  const nonEmpty = segments.filter((seg) => seg.length > 0)

  // ⑪ **解释器闭口**：段首是 `bash -c` / `eval` / `ssh` / `xargs` / `docker exec` … 且整串（**含引号内**）
  //   提到 `git commit` 或 force push ⇒ 拒：这类命令把**另一个字符串**交给另一个解释器 ⇒ 门禁看不到里面的 git。
  for (const seg of nonEmpty) {
    // ⚠ 只喂**本段**的 token 文本：跨段的字面量（`bash lint.sh && echo "git commit done"`）不算
    const segText = seg.map((t) => t.value).join(" ")
    if (segmentStartsWithInterpreter(seg) && mentionsCommitOrForcePush(segText)) {
      return {
        isCommit: true,
        block:
          "commit-gate: 命令把 `git` 交给**另一个解释器**（`bash -c` / `eval` / `xargs` / `ssh` / `docker exec` …）⇒ 拒绝" +
          "（门禁看不到被解释的字符串；请直接调用 `git commit` / `git push`）",
        detail: "interpreter",
      }
    }
  }

  if (nonEmpty.length > 1) {
    const hits = nonEmpty.map((seg) => commitInSegment(seg))
    if (!hits.some((h) => h.isCommit)) return { isCommit: false }
    const blocked = hits.find((h) => h.block)
    if (blocked) return { isCommit: true, block: blocked.block, detail: blocked.detail }
    return {
      isCommit: true,
      block:
        "commit-gate: `git commit` 必须**单独成段**（不得与 `;` / `&&` / `||` / `|` / `&` / 换行拼接）⇒ 拒绝" +
        "（整串以 `git commit ` 开头会让其余段的 permission 档位全部失效）",
      detail: "compound",
    }
  }
  if (nonEmpty.length === 0) return { isCommit: false }

  // ⚠ 末位 `&` ⇒ **后台执行**（退出码不再反映提交结果 ⇒ 可诊断性受损）⇒ 拒
  //   （`&` 之后可跟纯分隔符：`git commit -m x &` / `… &\n` / `… &;` 都要拒 ⇒ 跳过尾部的 `\n` / `;` 再看）
  if (endsWithBackgroundAmp(tokens)) {
    return {
      isCommit: true,
      block:
        "commit-gate: `git commit` 必须**单独成段**（末位 `&` 会把提交放到后台 ⇒ 退出码不反映提交结果）⇒ 拒绝",
      detail: "compound",
    }
  }

  // ⚠ 单段判定**只喂 nonEmpty[0]**（否则尾随的 `;` / 换行 / `&` 分隔符 token 会被当成「位置 pathspec」）
  const hit = commitInSegment(nonEmpty[0]!)
  if (!hit.isCommit) return hit
  // ⑨ **命令替换**：内容不在静态可见范围，而 `git commit *: allow` 会把它们一起放行
  if (containsCommandSubstitution(cmd)) {
    return {
      isCommit: true,
      block:
        "commit-gate: 命令里含**命令替换**（`$(…)` / 反引号 / 进程替换）⇒ 拒绝" +
        "（内容不可静态判定；提交消息请用 `-F <file>`）",
      detail: "command-substitution",
    }
  }
  return hit
}

/** 单段（无复合分隔符）里是否有 commit 调用。 */
function commitInSegment(tokens: Token[]): CommitInvocation {
  // ③ 定位 `git` **命令词**（`VAR=val` / 包装命令及其选项 / 子 shell 前缀都跳过）
  const i = gitWordIndex(tokens)
  if (i >= tokens.length || !isGitCommandWord(tokens[i]!)) {
    // 兜底：**只有「包装命令前缀」**才回溯扫描（`timeout 10 git commit` / `sudo -u u git commit`）
    //   ⇒ 否则会把 **heredoc 正文** / `echo git commit` 里的字面量误判成命令（假阳性）。
    if (!startsWithWrapper(tokens)) return { isCommit: false }
    const any = tokens.findIndex((t, idx) => idx > 0 && isGitCommandWord(t))
    if (any < 0) return { isCommit: false }
    const subAny = parseGitSubcommand(tokens, any + 1)
    if (subAny !== "commit") return { isCommit: false, detail: `subcommand=${subAny}` }
    return {
      isCommit: true,
      block:
        "commit-gate: `git` 前有**包装命令**或无法定位的写法 ⇒ 拒绝（门禁只能判会话所在的仓；请直接调用 `git commit`）",
      detail: "wrapper",
    }
  }
  // ⑩ 包装命令（`sudo` / `env` / `timeout` …）⇒ 拒（不是「跳过」，见 ADR D5⑩）
  const wrapped = tokens.slice(0, i).find((t) => WRAPPERS.has(t.value))
  if (wrapped) {
    return {
      isCommit: true,
      block: `commit-gate: \`git\` 前的包装命令 \`${wrapped.value}\` ⇒ 拒绝（请直接调用 \`git commit\`；包装命令会改变判定对象）`,
      detail: "wrapper",
    }
  }
  // ⑩ 换仓环境变量（`GIT_DIR=… git commit`）⇒ 拒
  const envVar = tokens
    .slice(0, i)
    .map((t) => t.value.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
    .find((name) => name && RELOCATING_ENV_VARS.includes(name))
  if (envVar) {
    return {
      isCommit: true,
      block: `commit-gate: 环境变量 \`${envVar}\` 会换仓 ⇒ 拒绝（门禁只能判会话所在的仓）`,
      detail: "relocated",
    }
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
  const reloc = tokens.slice(i + 1, subIndex).map((t) => relocatingOptionOf(t.value)).find((x) => x !== null)
  if (reloc) {
    return {
      isCommit: true,
      block: `commit-gate: \`git ${reloc}\` 会换仓 ⇒ 拒绝（门禁只能判会话所在的仓）`,
      detail: "relocated",
    }
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

export interface KnownFailure {
  /** 目标命令（argv）—— 必须与某条 verify_commands 逐字相等 */
  command: string[]
  /** 输出中必须出现的子串（stdout+stderr 合并） */
  match: string
}

export interface InspectionSpec {
  /** 巡检守卫的 argv —— 必须作为 verify_commands 的独立条目 */
  command: string[]
  /** 巡检载体文件（仓库相对路径）—— 必须 git-tracked 且非 symlink */
  carrier: string
}

export interface CommitGateDeclaration {
  /** 验证命令（argv 数组的数组）—— 逐条执行，任一非 0 ⇒ 拒 */
  verify_commands: string[][]
  /** 单条命令超时（毫秒），默认 600000 */
  timeout_ms?: number
  /**
   * 已登记的已知失败（ADR D10①）—— 命中 ⇒ 该命令的失败视为「已知」⇒ 放行。
   * ⚠ 无该字段 ⇒ 行为与 D10 之前**逐字相同**（任一非 0 ⇒ 拒）。
   */
  known_failures?: KnownFailure[]
  /**
   * 巡检载体（ADR D10②）—— 声明含 known_failures ⇒ **必须存在**且满足三条硬约束，
   * 否则 known_failures **字段整体无效** ⇒ 退回 D2① 硬门（fail-closed）。
   */
  inspection?: InspectionSpec
}

// ── ADR D10：baseline（known_failures）────────────────────────────────────

/**
 * 通用词（单独出现，或出现在**末尾 token** ⇒ 模式不具描述性 ⇒ 声明不合法）。
 * ⚠ 用「末尾 token」而非「子串」：`pre-existing failures in test_llm_cache`
 * 含 `failures` 但**不是**末尾 ⇒ 合法（子串规则会把它误杀）。
 */
const GENERIC_MATCH_WORDS = new Set([
  "fail",
  "failed",
  "failing",
  "failure",
  "failures",
  "error",
  "errors",
  "timeout",
])

/** `match` 是否满足特异性约束（去空白后 ≥ 8、非纯数字/标点、末尾 token 非通用词）。 */
export function isSpecificMatch(pattern: string): boolean {
  const trimmed = (pattern ?? "").trim()
  if (trimmed.length < 8) return false
  if (/^[0-9\s.,;:_-]+$/.test(trimmed)) return false
  const tokens = trimmed.split(/\s+/)
  const last = (tokens[tokens.length - 1] ?? "").toLowerCase()
  if (GENERIC_MATCH_WORDS.has(last)) return false
  return true
}

export interface KnownFailureMatch {
  matched: boolean
  /** 命中的模式（供留痕） */
  pattern?: string
  /** 未命中的原因（可诊断） */
  reason?: string
}

/** 归一化换行（CRLF → LF）⇒ 匹配不受平台换行差异影响。 */
function normalizeNewlines(text: string): string {
  return (text ?? "").replace(/\r\n/g, "\n")
}

/**
 * 命中判定（ADR D10①）：命令失败且**合并输出**含 `match` ⇒ 视为已知失败。
 *
 * ⚠ 粒度 = **命令 + 输出**：条目只对其 `command` 生效。
 */
export function matchKnownFailure(
  decl: CommitGateDeclaration,
  argv: string[],
  output: string,
): KnownFailureMatch {
  const entries = decl.known_failures ?? []
  const normalized = normalizeNewlines(output)
  for (const entry of entries) {
    if (!sameArgv(entry.command, argv)) continue
    // ⚠ 绑定巡检守卫命令的条目**无效**（ADR D10② 硬约束②）：
    //   否则「巡检缺席」会被它自己的登记条目掩盖 ⇒ 单调性失效。
    if (isBoundToInspection(decl, entry)) {
      return {
        matched: false,
        reason: "known_failures 条目绑定了巡检守卫命令 ⇒ 条目无效 ⇒ 不放行",
      }
    }
    if (!isSpecificMatch(entry.match)) {
      return {
        matched: false,
        reason: `known_failures 的 match 不满足特异性约束（${entry.match}）`,
      }
    }
    if (normalized.includes(entry.match)) {
      return { matched: true, pattern: entry.match }
    }
  }
  return { matched: false, reason: "输出未命中任何已登记的 known_failures" }
}

/** argv 逐字相等（顺序与内容都一致）。 */
export function sameArgv(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  return a.every((x, i) => x === b[i])
}

/**
 * 是否**允许**进入 baseline 匹配（ADR D10① / 后果段风险①）。
 *
 * 两条禁止：① 命令**超时** ⇒ 按未命中处理（挂死的套件不得借 baseline 永久过关）；
 * ② baseline 不可用（巡检缺席 / 声明非法）⇒ 不匹配 ⇒ 退回硬门。
 */
export function shouldMatchBaseline(
  res: { code: number | string },
  baselineUsable: boolean,
): { ok: boolean; reason?: string } {
  if (!baselineUsable) return { ok: false, reason: "baseline 不可用 ⇒ 按未命中处理" }
  if (res.code === "ETIMEDOUT" || res.code === "TIMEOUT") {
    return { ok: false, reason: "命令超时 ⇒ 按未命中处理" }
  }
  return { ok: true }
}

export interface DeclarationValidation {
  ok: boolean
  error?: string
}

/**
 * 声明形状校验（**总兜底**）：任何异常 ⇒ 视作未声明 ⇒ 退回 D2① 硬门。
 * ⚠ 绝不默认放行（ADR D6 fail-closed）。
 */
export function validateDeclaration(parsed: unknown): DeclarationValidation {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "声明不是对象 ⇒ 视作未声明" }
  }
  const decl = parsed as Partial<CommitGateDeclaration>
  if (!Array.isArray(decl.verify_commands) || decl.verify_commands.length === 0) {
    return { ok: false, error: "verify_commands 为空或缺失 ⇒ 视作未声明" }
  }
  const bad = decl.verify_commands.find(
    (c) => !Array.isArray(c) || c.length === 0 || c.some((x) => typeof x !== "string"),
  )
  if (bad) return { ok: false, error: "verify_commands 形状非法 ⇒ 视作未声明" }
  if (decl.known_failures !== undefined) {
    if (!Array.isArray(decl.known_failures)) {
      return { ok: false, error: "known_failures 不是数组 ⇒ 视作未声明" }
    }
    for (const entry of decl.known_failures) {
      if (!entry || typeof entry !== "object") {
        return { ok: false, error: "known_failures 条目形状非法 ⇒ 视作未声明" }
      }
      if (
        !Array.isArray(entry.command) ||
        entry.command.length === 0 ||
        entry.command.some((x) => typeof x !== "string")
      ) {
        return { ok: false, error: "known_failures.command 形状非法 ⇒ 视作未声明" }
      }
      if (typeof entry.match !== "string" || entry.match.trim() === "") {
        return { ok: false, error: "known_failures.match 形状非法 ⇒ 视作未声明" }
      }
    }
  }
  if (decl.inspection !== undefined) {
    const insp = decl.inspection
    if (!insp || typeof insp !== "object") {
      return { ok: false, error: "inspection 形状非法 ⇒ 视作未声明" }
    }
    if (
      !Array.isArray(insp.command) ||
      insp.command.length === 0 ||
      insp.command.some((x) => typeof x !== "string")
    ) {
      return { ok: false, error: "inspection.command 形状非法 ⇒ 视作未声明" }
    }
    if (typeof insp.carrier !== "string" || insp.carrier.trim() === "") {
      return { ok: false, error: "inspection.carrier 形状非法 ⇒ 视作未声明" }
    }
  }
  return { ok: true }
}

/**
 * 巡检存在性的**静态**判定（ADR D10② 的三条硬约束）。
 *
 * ⚠ `carrierTracked` / `carrierIsSymlink` 由调用方（插件，用 git + fs 查）注入 ⇒
 * 本模块保持纯逻辑、可单测、**不硬编码治理仓路径**。
 */
export function evaluateInspection(
  decl: CommitGateDeclaration,
  facts: { carrierTracked: boolean; carrierIsSymlink: boolean },
): { usable: boolean; reason?: string } {
  if ((decl.known_failures ?? []).length === 0) return { usable: true }
  const insp = decl.inspection
  if (!insp) {
    return {
      usable: false,
      reason: "声明含 known_failures 但缺少 inspection ⇒ 字段整体无效 ⇒ 退回硬门",
    }
  }
  const independent = decl.verify_commands.some((c) => sameArgv(c, insp.command))
  if (!independent) {
    return {
      usable: false,
      reason:
        "inspection.command 必须是 verify_commands 的独立条目 ⇒ 字段整体无效 ⇒ 退回硬门",
    }
  }
  if (facts.carrierIsSymlink) {
    return {
      usable: false,
      reason: "inspection.carrier 是 symlink ⇒ 视作缺席 ⇒ 字段整体无效 ⇒ 退回硬门",
    }
  }
  if (!facts.carrierTracked) {
    return {
      usable: false,
      reason: "inspection.carrier 未 git-tracked ⇒ 视作缺席 ⇒ 字段整体无效 ⇒ 退回硬门",
    }
  }
  return { usable: true }
}

/** known_failures 条目是否绑定了巡检守卫命令（绑定 ⇒ 该条目无效）。 */
export function isBoundToInspection(decl: CommitGateDeclaration, entry: KnownFailure): boolean {
  if (!decl.inspection) return false
  return sameArgv(entry.command, decl.inspection.command)
}

export const DECLARATION_REL = path.join(".rddf", "commit-gate.json")

/** 读声明；不存在 / 损坏 ⇒ `null`（⇒ 不设门禁；损坏时由调用方告警）。 */
export function readDeclaration(workRoot: string): { decl: CommitGateDeclaration | null; error?: string } {
  const file = path.join(workRoot, DECLARATION_REL)
  if (!existsSync(file)) return { decl: null }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CommitGateDeclaration
    const validation = validateDeclaration(parsed)
    if (!validation.ok) {
      return { decl: null, error: `${file} ${validation.error}` }
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
  /** 非抛错留痕（ADR D10①：baseline 命中时给出一行可审计提示） */
  notices?: string[]
}

export interface GateOutcome {
  allowed: boolean
  /** 拒绝原因（可诊断） */
  reason?: string
  /** 非抛错留痕（放行时也可能有：baseline 命中） */
  notices?: string[]
}

/** 三判据的组合（顺序 = **先便宜后昂贵**：暂存 → 写集 → 验证；语义与 ADR D2 一致）。 */
/**
 * 门禁判定 + **留痕回传**。
 *
 * ⚠ `notices` 在**两条路径上都要回传**（放行 / 拒绝）：插件侧靠 `outcome.notices` 落账本
 * （`.rddf/state/commit-gate-notices.jsonl`）⇒ 拒绝路径若不回传，「声明不可用」这类情形
 * 就只有抛错、没有留痕 ⇒ D9② 的「检测 ≠ 拦截」在拒绝路径上失效（2026-11-28 接线层用例实查发现）。
 */
export function evaluateCommitGate(input: GateInput): GateOutcome {
  if (!input.declaration) return { allowed: true }
  if (input.stagedState === "failed") {
    return {
      allowed: false,
      reason: "commit-gate: 无法判定暂存区状态（`git diff --cached` 失败 / 非 git 目录）⇒ 拒绝（fail-closed）",
      notices: input.notices,
    }
  }
  if (input.stagedState === "empty") {
    return { allowed: false, reason: "commit-gate: 暂存区为空 ⇒ 请先 `git add` 再提交", notices: input.notices }
  }
  if (input.writeSetViolations.length > 0) {
    const v = input.writeSetViolations[0]!
    return {
      allowed: false,
      reason: `commit-gate: 暂存内容越出当前角色的写集 ⇒ 拒绝：${v.file}（${v.reason}）`,
      notices: input.notices,
    }
  }
  if (!input.verification.ok) {
    const cmd = input.verification.failedCommand?.join(" ") ?? "(未知命令)"
    const tail = input.verification.outputTail ? `\n--- 输出尾部 ---\n${input.verification.outputTail}` : ""
    return { allowed: false, reason: `commit-gate: 验证命令失败 ⇒ 拒绝提交：\n$ ${cmd}${tail}`, notices: input.notices }
  }
  return { allowed: true, notices: input.notices }
}
