/**
 * push-gate —— **层 1b 纯逻辑单测**（`docs/adr/ADR-commit-verification-gate.md` D4 / D9⑧）
 *
 * 覆盖：force push 的**四形态**（config `deny` 的**严格超集** —— 还覆盖 `-uf` 这类短选项簇）+ 负向矩阵。
 */
import { describe, expect, test } from "bun:test"

import { detectForcePush } from "../lib/push-gate.ts"

describe("D4 force push 四形态（工具层兜底 ⇒ 拒）", () => {
  const forced = [
    "git push --force origin main",
    "git push --force",
    "git push -f",
    "git push -f origin main",
    "git push origin main --force",
    "git push origin main -f",
    "git push --force-with-lease",
    "git push --force-with-lease=main",
    "git push --force-if-includes",
    "git push -uf origin main", // 短选项簇里含 `f`
  ]
  for (const cmd of forced) {
    test(`拒：${cmd}`, () => {
      const r = detectForcePush(cmd)
      expect(r.isForcePush, `未识别为 force push：${cmd}`).toBe(true)
      expect(r.reason).toBeTruthy()
    })
  }
})

describe("负向矩阵（不得误伤）", () => {
  const allowed = [
    "git push origin main",
    "git push",
    "git push --set-upstream origin main",
    "git push -u origin main",
    "git push origin main --tags",
    "git push origin +main", // ⚠ 已知差异：config 的 deny 同样不覆盖 `+refspec`（D9⑬）
    'echo "git push --force"',
    "git commit -m x",
    "git log --grep force",
  ]
  for (const cmd of allowed) {
    test(`放行：${cmd}`, () => {
      const r = detectForcePush(cmd)
      expect(r.isForcePush, `误判为 force push：${cmd}`).toBe(false)
      expect(r.reason).toBeUndefined()
    })
  }
})

describe("复合命令（任一段是 force push ⇒ 拒）", () => {
  test("`git commit -m x; git push --force origin main` ⇒ 拒", () => {
    expect(detectForcePush("git commit -m x; git push --force origin main").isForcePush).toBe(true)
  })
  test("`git status && git push origin main` ⇒ 放行", () => {
    expect(detectForcePush("git status && git push origin main").isForcePush).toBe(false)
  })
})
