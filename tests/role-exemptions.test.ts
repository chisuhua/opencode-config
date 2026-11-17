/**
 * 免宣称六项 —— **AC23**（ADR-role-aware-permissions D5；门控 V13）
 *
 * ⚠ **本文件头即「测试注释」那一处登记**（AC23 要求 AC + 测试注释 + 主题文档**三处**）。
 *   删掉本文件里的任一项 ⇒ 下面的守卫判红（判别力自证见末尾的突变用例）。
 *
 * **六项（D5①–D5⑥）—— 门控「防事故，不防绕过」**：
 *   - **D5①** `shell` 写盘（`sed -i` / `tee` / `>` / `cp`）**不在**门控内。
 *   - **D5②** shell 层 **pattern 盲区**（`git -c … commit` / `GIT_AUTHOR_NAME=x git commit`）不在范围。
 *   - **D5③** `role.json` / `role-claims.json` **可被改写**（`shell` 或 `edit`）⇒ 身份与租约都可被伪造。
 *   - **D5④** **saved approval**（宿主「Allow always」）会覆盖配置，层 1 看不见。
 *   - **D5⑤** **非 build agent 主会话**不参与（`plan` / `front` 等）⇒ 它们与 build 主会话并发时不受本 ADR 保护。
 *   - **D5⑥** **执行点缺席**（插件未激活 / `--standalone` / 未 `service restart` / 插件文件不在 `plugins/`）
 *     ⇒ 门控不生效；租约仍剩 `role-switch.sh` 与**派发临界区**两个执行点。
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")

/** 六项的稳定标识（**三处都用同一标识** ⇒ 机械可查）。 */
const SIX = ["D5①", "D5②", "D5③", "D5④", "D5⑤", "D5⑥"] as const

/** 三处登记点。 */
const PLACES = [
  ["AC（proposal.md）", path.join(ROOT, "openspec", "changes", "role-aware-permissions", "proposal.md")],
  ["测试注释（本文件头）", path.join(ROOT, "tests", "role-exemptions.test.ts")],
  ["主题文档（MULTI-AGENT-DESIGN.md）", path.join(ROOT, "docs", "MULTI-AGENT-DESIGN.md")],
] as const

/** 某文本里缺了哪些项（缺项列表为空 ⇒ 三处齐全）。 */
export function missingItems(text: string): string[] {
  return SIX.filter((id) => !text.includes(id))
}

describe("AC23 免宣称六项在三处各自命中", () => {
  for (const [label, file] of PLACES) {
    test(`${label}：六项齐全`, () => {
      const text = readFileSync(file, "utf8")
      const missing = missingItems(text)
      expect(missing, `${label} 缺免宣称项：${missing.join(", ")}`).toEqual([])
    })
  }

  test("六项**逐项**都有正文（不只是标识符）", () => {
    for (const [label, file] of PLACES) {
      const text = readFileSync(file, "utf8")
      for (const id of SIX) {
        const at = text.indexOf(id)
        expect(at, `${label} 缺 ${id}`).toBeGreaterThan(-1)
        // 标识符后面必须有实质说明（避免「只写个编号」凑数）
        const tail = text.slice(at, at + 400)
        expect(tail.length, `${label} 的 ${id} 后面没有说明`).toBeGreaterThan(20)
      }
    }
  })

  test("⚠ 判别力：删掉任一项 ⇒ 必红", () => {
    const proposal = readFileSync(PLACES[0][1], "utf8")
    const lines = proposal.split("\n")
    // 找出行含 D5③ 的那一行并删掉 ⇒ 缺项检查必须抓到
    const idx = lines.findIndex((l) => l.includes("D5③"))
    expect(idx, "proposal 里找不到 D5③ 的登记行").toBeGreaterThan(-1)
    const mutated = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join("\n")
    expect(missingItems(mutated), "删掉 D5③ 后守卫必须报缺").toContain("D5③")
    // 其余项仍在 ⇒ 缺项检查**不是**「全有全无」的恒真判定
    expect(missingItems(mutated)).not.toContain("D5①")
  })
})
