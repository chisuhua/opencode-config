/**
 * arch 文档范围的 **shell 版守卫** —— 把 `tests/verify_arch_docs_scope.sh` 纳入**规范命令**。
 *
 * ⚠ **为什么需要这个 wrapper**：那份 `.sh` 此前处于**第四态** ——
 *   入库了、能跑、`exit 0`，但 **`bun test tests/` 不收 `.sh`** ⇒ 规范命令跑不到它
 *   ⇒ 它的 64 条断言实际上**无人执行**（本仓已因同类问题吃过亏：`tests/README.md` 也没列它）。
 * ⇒ 本 wrapper 让它进入 `bun test tests/`，**不许留在「入库但无人执行」的第四态**。
 *
 * ⚠ **床不在时**：脚本自带本地兜底（`verify_arch_docs_scope.sh:71-80` 构造等价项目形状 + WARN）
 *   ⇒ wrapper **总是执行**，不再 `skipIf`（旧写法把兜底路径杀死 ⇒ 无床环境下 64 条断言静默 skip）。
 *   降级**可见**：断言输出含 `项目形状：` 行（`e2e-bed` / `local-fallback`）。
 */
import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

const BED = process.env.E2E_BED_DIR ?? "/workspace/main/rdd-workflow-e2e"
const SCRIPT = path.join(import.meta.dir, "verify_arch_docs_scope.sh")

const runScript = (bedDir: string): string =>
  execFileSync("bash", [SCRIPT], {
    env: { ...process.env, E2E_BED_DIR: bedDir },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })

const failCount = (out: string): number => {
  const m = /FAIL=(\d+)/.exec(out)
  expect(m, "脚本输出里找不到 FAIL=N 计数（格式变了 ⇒ 更新本判据）").toBeTruthy()
  return Number(m![1])
}

describe("arch 文档范围守卫（shell 版，经 bun test 纳入规范命令）", () => {
  test("verify_arch_docs_scope.sh 全部断言通过（床在 ⇒ e2e 真实 fixture；床不在 ⇒ 本地兜底仍全跑）", () => {
    // ① 当前环境的床（可能是 /nonexistent —— 由调用方 E2E_BED_DIR 决定）
    const out = runScript(BED)
    const shape = /项目形状：(e2e-bed|local-fallback)/.exec(out)
    expect(shape, "输出缺「项目形状：」行 ⇒ 降级/取材不可见").toBeTruthy()
    expect(
      shape![1],
      `项目形状与床的存在性不一致（BED=${BED}）⇒ 取材路径被静默改变`,
    ).toBe(existsSync(BED) ? "e2e-bed" : "local-fallback")
    expect(failCount(out), `verify_arch_docs_scope.sh 有断言失败：\n${out}`).toBe(0)

    // ② 强制无床 ⇒ 必须走本地兜底，且仍是**全量**断言（不是 skip、不是 0 条）
    const fallbackOut = runScript("/nonexistent")
    expect(fallbackOut, "床指定为 /nonexistent 时未走本地兜底 ⇒ 兜底路径已死").toContain("local-fallback")
    expect(failCount(fallbackOut), `本地兜底路径有断言失败：\n${fallbackOut}`).toBe(0)
    expect(fallbackOut, "兜底路径必须跑满 64 条断言").toContain("PASS=64")
  },
  // ⚠ **必须显式放宽超时**：单次脚本 ~5.3s，本用例跑两次 ⇒ ~11s；
  //   bun test 默认超时 5s ⇒ 不放宽必超时红（2026-11-16 实测踩到）。
  60_000)
})
