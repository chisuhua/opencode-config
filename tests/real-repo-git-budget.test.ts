/**
 * 元守卫：**触真实仓历史的 git 访问必须经唯一入口**（`tests/helpers/real-repo-git.ts`）。
 *
 * 为什么需要：「真实仓」与「fixture 仓」在源码里长得几乎一样，但成本差三个数量级 —— 前者随提交数增长、
 * 且一旦越过 bun 默认 5000ms 用例超时就是**假红**（卡住工具层验证门）。规则的价值是**预防**：闸门在只有
 * 一个消费者时成本最低（清单只有一项），却能让第二个消费者一出现就被要求走**带预算**的路径。
 *
 * 检测口径 = **`cwd` 形态**（不是命令形态）：
 *   ① **R 形态**（`cwd` 指向仓根）⇒ **只允许出现在 helper 内**。三种等价写法都算：
 *      字面含 `import.meta.dir` / 同文件里由它**派生**的常量（含传递闭包：`const B = path.join(A, "..")`）/
 *      **`process.cwd()`**（与省略 `cwd` 逐字等价 —— 进程 cwd 就是仓根）；
 *   ② **缺 `cwd`**（省略 ⇒ 隐式继承 `bun test` 的进程 cwd = 仓根）⇒ **红**（最便宜的逃逸路径，fail-closed）；
 *   ③ 其余（`cwd` 是形参 / 局部 fixture 变量，如 `dir`/`repo`/`dest`/`project`）⇒ 静态**不可判定**
 *      ⇒ 登记为**已知漏检面**（见下方「已知漏检面」）。
 *
 * 规则文本：`docs/test-authoring.md` 的「触真实仓历史的守卫：预算与唯一入口」。
 */
import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  REAL_REPO_GIT_TEST_TIMEOUT_MS,
  isAncestor,
  isGitCallTimeout,
  lastCommitSha,
} from "./helpers/real-repo-git.ts"

const TESTS_DIR = import.meta.dir
const HELPER = "tests/helpers/real-repo-git.ts"
const SELF = "tests/real-repo-git-budget.test.ts"

/** 豁免「直连真实仓」的文件集合（**显式断言**，不静默 exclude）。 */
const REAL_REPO_ALLOWED_FILES = [HELPER, SELF]

/**
 * 清单：允许调真实仓 helper 的守卫。
 *
 * schema 只有 `{ file, testTitle, budget }` —— **超时值不抄进来**（唯一真源是源码里的 `{ timeout }`，
 * 本守卫**读取并校验**它 ≥ `REAL_REPO_GIT_TEST_TIMEOUT_MS`）⇒ 避免「一份事实两个真源」。
 * `budget` = 该 `test(...)` 块内 helper 调用点数（一次 helper 调用 = 一次 spawn，helper 内**不重试**）。
 */
const REAL_REPO_GUARDS = [
  {
    file: "tests/config-guards.test.ts",
    testTitle: "AC10④：父篇 ADR 的 commit 必须是代码 commit 的祖先或同一 commit（父篇滞后必红）",
    budget: 3, // 2× lastCommitShaInRepo + 1× isAncestorInRepo
  },
]

/**
 * **已知漏检面**（静态检测的固有代价，登记而非假装覆盖）：
 * - 形参式 git helper（`cwd` 是函数的形参）—— 调用方传什么都看不到；
 * - `cwd` 是局部 fixture 变量（`dir`/`repo`/`dest`/`project`）—— 与真实仓根**无法静态区分**；
 * - **其它**指向仓根的等价写法 —— 只检测了 `import.meta.dir` / 派生常量（传递闭包）/ `process.cwd()` 三种最常见的。
 *   未覆盖的例子（今日仓内**零**作为 `cwd` 使用）：`new URL("..", import.meta.url).pathname`、
 *   带类型标注的 `const ROOT: string = path.join(import.meta.dir, "..")`、多行种子声明、
 *   `path.resolve()`、从 env 读到的绝对路径。
 *   ⚠ `import.meta.dirname` 目前是凭**子串**命中（`import.meta.dir` ⊂ `import.meta.dirname`）—— 语义正好相同，
 *   但属**侥幸正确**，勿依赖。
 * - `tests/probes/**`（不是 `*.test.ts`，不在扫描集内）；
 * - `Bun.spawnSync(["git", …])` / `git -C` / `bash -c "git …"` / `process.chdir()` / `GIT_DIR` 泄漏
 *   ⇒ 唯一能精确区分真实仓与 fixture 的办法是 PATH shim / `bunfig.toml` preload 记录全量轨迹，
 *   那要改进程启动配置（Out of Scope ⑨）⇒ 不做。
 *   ⚠ `Bun.spawnSync` 是**实测**的逃逸（突变 M6 不红），不是推测。
 */

/** 递归列出 `tests/**\/*.test.ts`（返回仓相对路径，如 `tests/config-guards.test.ts`）。 */
function listTestFiles(rel = ""): string[] {
  const out: string[] = []
  for (const entry of readdirSync(path.join(TESTS_DIR, rel), { withFileTypes: true })) {
    const next = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...listTestFiles(next))
    else if (entry.name.endsWith(".test.ts")) out.push(`tests/${next}`)
  }
  return out.sort()
}

/** 从 `openAt`（某个 `(` 的下标）起做括号配对，返回整段调用文本。 */
function parenSlice(src: string, openAt: number): string {
  let depth = 0
  for (let i = openAt; i < src.length; i++) {
    if (src[i] === "(") depth++
    else if (src[i] === ")") {
      depth--
      if (depth === 0) return src.slice(openAt, i + 1)
    }
  }
  throw new Error(`括号不配对：${src.slice(openAt, openAt + 80)}`)
}

/**
 * 取调用文本里的 `cwd` 值（`null` = **没写 `cwd`**）。同时支持 `cwd: expr` 与简写 `{ cwd, … }`。
 *
 * ⚠ 已知边界（today 零触发，登记）：取的是**首个** `cwd:` 匹配 —— 若某次调用的参数字符串/数组里
 * 恰好含 `cwd:` 字面量子串，会取到那个而不是真实选项（本仓当前无此写法）。
 */
function cwdValueOf(call: string): string | null {
  const colon = call.search(/\bcwd\s*:/)
  if (colon >= 0) {
    let depth = 0
    const start = call.indexOf(":", colon) + 1
    let i = start
    for (; i < call.length; i++) {
      const c = call[i]!
      if ("([{".includes(c)) depth++
      else if (")]}".includes(c)) {
        if (depth === 0) break
        depth--
      } else if (c === "," && depth === 0) break
    }
    return call.slice(start, i).trim()
  }
  return /\bcwd\s*[,}]/.test(call) ? "cwd" : null // 简写 `{ cwd, … }`
}

/**
 * 本文件里「指向**仓根**」的常量名（含**传递闭包**：`const B = path.join(A, "..")` 也算）。
 *
 * 判定故意收窄（避免把「整段 `readFileSync(...)` 包装」误当仓根）：
 * - **种子**：声明右侧**以 `path.join/resolve/dirname/normalize(…import.meta.dir…)` 或 `import.meta.dir` 开头**。
 *   ⚠ 只排除「非 `path.*` 调用包装」（如 `const src = readFileSync(path.join(import.meta.dir, …))`）；
 *   **`path.join(import.meta.dir, "..", "某个文件名")` 仍会被标** —— 今日零误红（没有把文件路径当 `cwd` 的写法），
 *   登记为已知边界；
 * - **闭包**：右侧是**纯路径表达式**（`path.*(…)` 或裸标识符）且引用了已知仓根常量。
 *   ⇒ `const text = readFileSync(…)` 之类不会被误标。
 */
function realRootIdentifiers(src: string): Set<string> {
  const ids = new Set<string>()
  const lines = src.split("\n")
  const DECL = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/
  const ROOT_EXPR = /^(?:path\.(?:join|resolve|dirname|normalize)\([\s\S]*import\.meta\.dir|import\.meta\.dir)/
  const PATH_EXPR = /^(?:path\.(?:join|resolve|dirname|normalize)\(|[A-Za-z_$][\w$]*$)/
  const mentions = (expr: string, id: string) => new RegExp(`\\b${id}\\b`).test(expr)

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.includes("import.meta.dir")) continue
    for (let back = i; back >= Math.max(0, i - 6); back--) {
      const m = lines[back]!.match(DECL)
      if (m) {
        if (ROOT_EXPR.test(m[2]!.trim())) ids.add(m[1]!)
        break
      }
    }
  }
  for (let grew = true; grew; ) {
    grew = false
    for (const line of lines) {
      const m = line.match(DECL)
      if (!m || ids.has(m[1]!)) continue
      const rhs = m[2]!.trim()
      if (!PATH_EXPR.test(rhs)) continue
      if ([...ids].some((id) => mentions(rhs, id))) {
        ids.add(m[1]!)
        grew = true
      }
    }
  }
  return ids
}

/**
 * 判定 `cwd` 是否指向**仓根**（= 真实仓）。
 *
 * 三种形态都算：① 字面含 `import.meta.dir`；② 同文件里由它派生的常量（含传递闭包）；
 * ③ `process.cwd()` —— 与**省略 `cwd`** 行为逐字等价（`bun test` 的进程 cwd 就是仓根），
 * 是写测试时的**第一直觉**写法，不检测它等于把刚封死的逃逸口换个拼法重开。
 */
function isRealRootCwd(cwd: string, ids: Set<string>): boolean {
  return cwd.includes("import.meta.dir") || cwd.includes("process.cwd()") || ids.has(cwd)
}

type GitCallSite = { file: string; call: string; cwd: string | null; realRoot: boolean }

/** 扫描全部 `*.test.ts` + helper 里的 git 子进程调用点。 */
function scanGitCalls(): GitCallSite[] {
  const sites: GitCallSite[] = []
  for (const file of [...listTestFiles(), HELPER].sort()) {
    const src = readFileSync(path.join(TESTS_DIR, "..", file), "utf8")
    const ids = realRootIdentifiers(src)
    const re = /execFileSync\(\s*"git"/g
    for (let m = re.exec(src); m; m = re.exec(src)) {
      const call = parenSlice(src, src.indexOf("(", m.index))
      const cwd = cwdValueOf(call)
      sites.push({ file, call, cwd, realRoot: cwd !== null && isRealRootCwd(cwd, ids) })
    }
  }
  return sites
}

describe("真实仓 git 预算守卫（元守卫）", () => {
  test("AC1：R 形态（cwd 指向仓根）只允许在 helper 内；缺 cwd ⇒ 红", () => {
    const offenders = scanGitCalls()
      .filter((s) => !REAL_REPO_ALLOWED_FILES.includes(s.file))
      .filter((s) => s.cwd === null || s.realRoot)
      .map((s) => `${s.file}: ${s.cwd === null ? "缺 cwd（隐式真仓）" : `cwd = ${s.cwd}`}`)
    expect(
      offenders.join("\n"),
      `以下调用点直连真实仓：迁移到 tests/helpers/real-repo-git.ts 的 InRepo 包装 + 按 docs/test-authoring.md 登记清单；` +
        `若确实判不了（形参 / fixture 变量），登记为已知漏检面`,
    ).toBe("")
  })

  test("AC7：扫描集覆盖全部 `*.test.ts`（不写死数字）+ 豁免集合显式", () => {
    const listed = listTestFiles()
    expect(listed.length).toBeGreaterThan(0)
    expect(listed).toContain("tests/config-guards.test.ts")
    expect(listed.every((f) => f.endsWith(".test.ts"))).toBe(true)

    // 扫描器**真的在读源码**（否则「无违规」是空转）：helper 与守卫清单里的文件都必须出现
    const sites = scanGitCalls()
    expect(sites.some((s) => s.file === HELPER)).toBe(true)
    expect(sites.some((s) => s.file === "tests/config-guards.test.ts")).toBe(true)

    // 每个**含 git 调用**的 `*.test.ts` 都必须被扫到（漏扫 ⇒ 静默放行）
    for (const file of listed) {
      const src = readFileSync(path.join(TESTS_DIR, "..", file), "utf8")
      if (/execFileSync\(\s*"git"/.test(src)) expect(sites.some((s) => s.file === file)).toBe(true)
    }

    // 豁免集合逐项显式（改它就等于放宽规则 ⇒ 必须是一次改判据的动作）
    expect(REAL_REPO_ALLOWED_FILES.slice().sort()).toEqual([HELPER, SELF].slice().sort())
  })

  test("AC5/AC6：清单项的静态子进程计数 + 用例超时下限", () => {
    const problems: string[] = []
    for (const item of REAL_REPO_GUARDS) {
      if (item.budget < 1) problems.push(`${item.file}「${item.testTitle}」：budget 必须 ≥ 1（防死项）`)
      const src = readFileSync(path.join(TESTS_DIR, "..", item.file), "utf8")
      // ⚠ 已知边界（登记）：block 提取靠「标题之前最近的一个 `test(`」+ 括号配对 ⇒ 若**标题字符串里**
      //   出现 `test(` 子串会取错块（本仓当前无此写法；真出现时按缺 timeout / 计数不等红出来，不会静默）。
      const titleAt = src.indexOf(item.testTitle)
      if (titleAt < 0) {
        problems.push(`${item.file}：清单里的用例标题在源码中不存在 —— 「${item.testTitle}」`)
        continue
      }
      const block = parenSlice(src, src.indexOf("(", src.lastIndexOf("test(", titleAt)))
      const calls = (block.match(/\b(?:lastCommitShaInRepo|isAncestorInRepo)\(/g) ?? []).length
      if (calls !== item.budget) {
        problems.push(`${item.file}「${item.testTitle}」：清单 budget=${item.budget}，源码实测 ${calls} 个 helper 调用点`)
      }
      const timeout = block.match(/\btimeout\s*:\s*([A-Za-z_$][\w$]*|\d[\d_]*)/)
      if (!timeout) {
        problems.push(`${item.file}「${item.testTitle}」：缺 \`{ timeout }\` ⇒ 会落到 bun 默认的 5000ms（假红）`)
        continue
      }
      const raw = timeout[1]!
      const ms = /^\d/.test(raw)
        ? Number(raw.replaceAll("_", ""))
        : raw === "REAL_REPO_GIT_TEST_TIMEOUT_MS"
          ? REAL_REPO_GIT_TEST_TIMEOUT_MS
          : Number.NaN
      if (!Number.isFinite(ms) || ms < REAL_REPO_GIT_TEST_TIMEOUT_MS) {
        problems.push(
          `${item.file}「${item.testTitle}」：用例超时 ${raw} 低于用例级预算 ${REAL_REPO_GIT_TEST_TIMEOUT_MS}ms` +
            `（低于 ⇒ 负载尾部仍会假红；超时值只能取常量或更大的字面量）`,
        )
      }
    }
    expect(problems.join("\n")).toBe("")
  })

  test("AC3：非超时错误保持既有语义（行为证据）", () => {
    // 非 git 目录 ⇒ `git log` 非零退出 / `merge-base` 非零退出 ⇒ 既有语义逐字保留
    const plain = mkdtempSync(path.join(tmpdir(), "rrg-plain-"))
    try {
      expect(lastCommitSha(plain, "x")).toBe("")
      expect(isAncestor(plain, "a", "b")).toBe(false)
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })

  test("AC3b：per-call 超时不得被吞（行为 + 接线）", () => {
    // ⚠ 为什么没有「真的挂死 6s」的端到端：bun 的 `execFileSync` **不认运行期 `process.env.PATH` 变更**
    //   （实测：变更 PATH 后仍解析到系统 git；只有显式 `env.PATH` 才生效，而 helper 刻意不接受 env）
    //   ⇒ 造不出「永不返回的 git」。⇒ 判定逻辑本身**行为化**（喂真实错误对象），只把「接线」留给结构判据。
    // ① 判定逻辑（行为）：超时形态识别要认得出 ETIMEDOUT、且**不**把 git 非零退出误判成超时
    expect(isGitCallTimeout({ code: "ETIMEDOUT", errno: -110, status: 0 })).toBe(true)
    expect(isGitCallTimeout({ status: 128 })).toBe(false)

    // ② 接线（结构）：两个 catch 的**首句**都是 rethrowIfCallTimeout ⇒ 超时不会被 `return ""` / `return false` 吞掉
    // ⚠ 这是按「当前正好两个 git helper」写的计数断言 —— **新增第 3 个 helper 时，此处与 AC2 的
    //   per-call timeout 计数（同为 2）都要同步加**，否则新 helper 的 catch 可以是漏网的。
    const src = readFileSync(path.join(TESTS_DIR, "helpers", "real-repo-git.ts"), "utf8")
    const guarded = src.match(/catch \(err\) \{\s*\n\s*rethrowIfCallTimeout\(err,/g) ?? []
    expect(guarded.length, "两个 helper 的 catch 都必须先 rethrowIfCallTimeout（超时不得被吞）").toBe(2)
  })

  test("AC2：两层预算常量 + 每次调用都带 per-call 超时 + 禁重试（结构）", () => {
    const src = readFileSync(path.join(TESTS_DIR, "helpers", "real-repo-git.ts"), "utf8")
    expect(src).toContain("REAL_REPO_GIT_TEST_TIMEOUT_MS = 20_000")
    expect(src).toContain("REAL_REPO_GIT_CALL_TIMEOUT_MS = 6_000")
    // 算式必须写在注释里（预算的推导可复核，不是魔数）
    expect(src).toContain("3 次 × 6s = 18s < 20s")
    // 两次 git 调用都必须带 per-call 预算（漏一处 ⇒ 该调用无上限）
    expect((src.match(/timeout: REAL_REPO_GIT_CALL_TIMEOUT_MS/g) ?? []).length).toBe(2)
    // 禁重试：helper 里不得出现循环（重试会放大占用，把「一次慢」放大成「必然超用例」）
    expect(src).not.toMatch(/\b(?:for|while)\s*\(/)
  })
})
