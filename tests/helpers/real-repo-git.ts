/**
 * 触**真实仓历史**的 git 访问：**唯一入口**（两层预算 + 按函数分层的错误语义）。
 *
 * 为什么必须有这个模块：真实仓历史查询的成本**只增不减**（提交数增长），且 pathspec 查询走全部提交的树。
 * bun 默认每用例超时 5000ms ⇒ 一旦负载尾部越过它就**假红**，而 `.rddf/commit-gate.json` 的
 * `verify_commands` 含 `bun test tests/` ⇒ 假红 = 随机拒提交（与改动内容无关）。
 *
 * 规则文本：`docs/test-authoring.md` 的「触真实仓历史的守卫：预算与唯一入口」；
 * 元守卫（谁可以直连真实仓）：`tests/real-repo-git-budget.test.ts`。
 */
import { execFileSync } from "node:child_process"
import path from "node:path"

/**
 * 用例级预算：守卫的 `{ timeout }` 取它。
 * ≈ 负载尾部观测上界（~5.1s）的 4 倍 ⇒ **慢执行不判红**，~20s 才红只可能是真挂死。
 */
export const REAL_REPO_GIT_TEST_TIMEOUT_MS = 20_000

/**
 * 每次 git 调用预算。
 * 算式：**3 次 × 6s = 18s < 20s**（留 2s 余量）。这是**单次上限、不是总预算** ⇒ **禁重试**
 * （重试会放大占用，且把「一次慢」放大成「必然超用例」）。
 */
export const REAL_REPO_GIT_CALL_TIMEOUT_MS = 6_000

/**
 * 仓根。按**测试文件位置**取 ⇒ **worktree 感知**（在 worktree 里跑测试就取 worktree 根）。
 * **不判断 `.git` 是否存在**：无 git 时的语义由 `lastCommitSha`（空串 ⇒ 调用方跳过）承担。
 */
const ROOT = path.join(import.meta.dir, "..", "..")

/**
 * `execFileSync` 的 per-call 超时形态（实测：`code: "ETIMEDOUT"`、`errno: -110`、`status: 0`，
 * 与 git 非零退出 `status: 128` 可区分）。
 *
 * **导出是为了可行为化验证**（`tests/real-repo-git-budget.test.ts` 的 AC3b 直接喂两种错误对象）；
 * 它**不是**给调用方的快捷入口 —— 访问真实仓仍然只能走 `lastCommitSha` / `isAncestor` 一族。
 */
export function isGitCallTimeout(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ETIMEDOUT"
}

/**
 * per-call 超时 ⇒ 抛**可归因**的错；其它错误原样抛给调用方按各自语义处理。
 *
 * ⚠ **不得**把超时吞成空串 / false：那会让判据**静默消失**（比假红更坏）。
 * 超时是「机器慢或历史变长」的信号，不是「查不到」⇒ 必须响，且带下一步指引。
 */
function rethrowIfCallTimeout(err: unknown, what: string): void {
  if (!isGitCallTimeout(err)) return
  throw new Error(
    `真实仓 git 调用超时（> ${REAL_REPO_GIT_CALL_TIMEOUT_MS}ms，\`${what}\`）：历史查询变慢（提交数增长或机器负载）。\n` +
      `不要改成「吞掉超时返回空值 / false」—— 判据会静默消失；先排除负载，再按 docs/test-authoring.md` +
      `「触真实仓历史的守卫」调整预算常量。`,
  )
}

/**
 * 某文件在给定仓库里的最后提交 sha。
 *
 * 任何**非超时**失败（无 git / 非零退出 / 浅克隆 ⇒ 空历史）⇒ 空串 ⇒ 调用方按「跳过」处理
 * （语义与抽函数前逐字一致）。`cwd` 参数化：真仓传仓根，fixture 用例传临时仓。
 */
export function lastCommitSha(cwd: string, file: string): string {
  try {
    return execFileSync("git", ["log", "-1", "--format=%H", "--", file], {
      cwd,
      encoding: "utf8",
      timeout: REAL_REPO_GIT_CALL_TIMEOUT_MS,
    }).trim()
  } catch (err) {
    rethrowIfCallTimeout(err, `git log -1 --format=%H -- ${file}`)
    return ""
  }
}

/** `a` 是否为 `b` 的祖先或同一 commit。任何**非超时**失败 ⇒ false ⇒ 调用方判红（语义与抽函数前逐字一致）。 */
export function isAncestor(cwd: string, a: string, b: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", a, b], {
      cwd,
      stdio: "ignore",
      timeout: REAL_REPO_GIT_CALL_TIMEOUT_MS,
    })
    return true
  } catch (err) {
    rethrowIfCallTimeout(err, `git merge-base --is-ancestor ${a} ${b}`)
    return false
  }
}

/** 真仓薄包装：该文件在**本仓**的最后提交 sha。 */
export function lastCommitShaInRepo(file: string): string {
  return lastCommitSha(ROOT, file)
}

/** 真仓薄包装：`a` 是否为 `b` 的祖先或同一 commit（两者都在**本仓**）。 */
export function isAncestorInRepo(a: string, b: string): boolean {
  return isAncestor(ROOT, a, b)
}
