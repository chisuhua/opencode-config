/**
 * arch 文档范围的 **shell 版守卫** —— 把 `tests/verify_arch_docs_scope.sh` 纳入**规范命令**。
 *
 * ⚠ **为什么需要这个 wrapper**：那份 `.sh` 此前处于**第四态** ——
 *   入库了、能跑、`exit 0`，但 **`bun test tests/` 不收 `.sh`** ⇒ 规范命令跑不到它
 *   ⇒ 它的 64 条断言实际上**无人执行**（本仓已因同类问题吃过亏：`tests/README.md` 也没列它）。
 * ⇒ 本 wrapper 让它进入 `bun test tests/`，**不许留在「入库但无人执行」的第四态**。
 *
 * ⚠ **取证不可用 ⇒ 明确 skip，不假装通过**：该脚本复用 `rdd-workflow-e2e` 的 fixture 床
 *   （`E2E_BED_DIR`）⇒ 床不在时**不能**判 pass ⇒ `skipIf` 明确跳过（skip 原因会显示在输出里）。
 */
import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

const BED = process.env.E2E_BED_DIR ?? "/workspace/main/rdd-workflow-e2e"
const SCRIPT = path.join(import.meta.dir, "verify_arch_docs_scope.sh")

describe("arch 文档范围守卫（shell 版，经 bun test 纳入规范命令）", () => {
  test.skipIf(!existsSync(BED))("verify_arch_docs_scope.sh 全部断言通过", () => {
    const out = execFileSync("bash", [SCRIPT], {
      env: { ...process.env, E2E_BED_DIR: BED },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    // 脚本自己报 PASS/FAIL 计数 ⇒ 断「无 FAIL」而不是断输出文本（措辞不是判据）
    const m = /FAIL=(\d+)/.exec(out)
    expect(m, "脚本输出里找不到 FAIL=N 计数（格式变了 ⇒ 更新本判据）").toBeTruthy()
    expect(Number(m![1]), `verify_arch_docs_scope.sh 有断言失败：\n${out}`).toBe(0)
  })
})
