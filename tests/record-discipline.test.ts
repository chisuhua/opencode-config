/**
 * 记录纪律守卫（shell 版）—— 把 `tests/verify_record_discipline.sh` 纳入**规范命令**。
 *
 * ⚠ **为什么需要 wrapper**：`bun test tests/` 不收 `.sh` ⇒ 不包一层它就落在
 *   「入库、能跑、但规范命令跑不到」的**第四态**（本仓已吃过这类亏，见 `arch-docs-scope.test.ts` 的头注释）。
 *   而 `.rddf/commit-gate.json` 的 `verify_commands` 正是 `bun test tests/` ⇒
 *   只有进这条路，7 条记录纪律才会在**提交时**生效。
 *
 * 7 条判据的由来与判别力证据：`openspec/changes/record-discipline-guards/proposal.md`。
 * 同源实现（e2e 层）：`rdd-workflow-e2e` 的 `tests/integration/test_evidence_discipline.bats`。
 */
import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import path from "node:path"

const SCRIPT = path.join(import.meta.dir, "verify_record_discipline.sh")

function run(args: string[]): string {
  return execFileSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

describe("记录纪律守卫（7 条判据，经 bun test 纳入规范命令）", () => {
  // ⚠ 显式放宽超时：脚本要跑 git log + 扫全仓 markdown（~4.5s）⇒ bun 默认 5s 会红
  test("本仓记录纪律干净（C1–C7）", () => {
    const out = run([])
    expect(out).toContain("RESULT: OK")
  }, 60_000)

  // 判别力：7 条判据各须能报出反例、且不误报正例（否则等于没有判据）
  test("7 条判据的判别力自测通过（反例必红 / 正例不误报）", () => {
    const out = run(["--selftest"])
    expect(out).toContain("自测通过")
    expect(out).not.toContain("反例未被报出")
    expect(out).not.toContain("正例被误报")
  }, 60_000)
})
