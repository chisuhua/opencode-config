/**
 * 未声明仓的 **commit 留痕**（change `unmanifested-commit-gate-trace`）。
 *
 * 判据真源：`openspec/changes/unmanifested-commit-gate-trace/proposal.md` 的 AC1–AC4。
 * ADR 真源：`ADR-commit-verification-gate` 的 **D3**（未声明 ⇒ 不设门禁，**不改**）+ **D6**（坏声明 ⇒ fail-closed）
 *          + **D9②** 的「事实性补登」先例（检测 ≠ 拦截）。
 *
 * 三条不变式（本文件即它们的回归）：
 * 1. **未声明**（`decl === null` 且无 `error`）⇒ 账本一行 `未声明 …` + **放行**（D3）；
 * 2. **声明不可用**（`error` 非空）⇒ 账本一行 `声明不可用 …` + **照旧拒**（D6 —— 坏的声明 ≠ 未声明）；
 * 3. **尽力而为**：写不进账本 ⇒ 静默，**绝不影响判定**。
 *
 * ⚠ 这些用例**直接驱动插件源码的三条分支**（导出注入点）：宿主里跑真实 `git commit` 需要真宿主，
 * 而判据是「留痕写没写 / 判没判」，故以**纯函数 + 真实临时仓**覆盖（不伪造宿主）。
 */
import { describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

// ⚠ 宿主的 `@opencode/plugin` 是**宿主内建模块**（本地装不上）⇒ 与既有插件测试同样的恒等替身，
//   且必须**先 mock、再动态 import**（静态 import 会被提升到 mock 之前）。
mock.module("@opencode/plugin", () => ({ Plugin: { define: (x: any) => x } }))

const PLUGIN_PATH = path.resolve(import.meta.dir, "..", "plugins", "commit-gate.ts")
const mod: any = await import(PLUGIN_PATH)
const { appendNotice, noticeLineForUndeclared, NOTICE_LEDGER, readDeclarationOrError } = mod

function repo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "cg-undeclared-"))
}

describe("D3 · 未声明 ⇒ 留痕且放行", () => {
  test("未声明仓：判定为「未声明」且账本可写一行", () => {
    const root = repo()
    const decl = readDeclarationOrError(root)
    expect(decl.decl).toBeNull()
    expect(decl.error).toBeUndefined()

    const line = noticeLineForUndeclared(decl)
    expect(line).toContain("未声明")
    expect(line).toContain("D3")

    appendNotice(root, line)
    const ledger = readFileSync(path.join(root, NOTICE_LEDGER), "utf8")
    expect(ledger).toContain("未声明")
  })
})

describe("D6 · 声明不可用 ⇒ 留痕但照旧拒", () => {
  test("解析失败的声明：error 非空 ⇒ 文案是「声明不可用」（不是「未声明」）", () => {
    const root = repo()
    mkdirSync(path.join(root, ".rddf"), { recursive: true })
    writeFileSync(path.join(root, ".rddf", "commit-gate.json"), "{not json", "utf8")

    const decl = readDeclarationOrError(root)
    expect(decl.decl).toBeNull()
    expect(decl.error).toBeTruthy()

    const line = noticeLineForUndeclared(decl)
    expect(line).toContain("声明不可用")
    expect(line).toContain("D6")
    expect(line).not.toContain("未声明 ⇒")
  })
})

describe("尽力而为 · 写不进账本也不影响判定", () => {
  test("账本路径被占成目录 ⇒ appendNotice 静默（不抛错）", () => {
    const root = repo()
    mkdirSync(path.join(root, NOTICE_LEDGER), { recursive: true }) // 目录占位 ⇒ appendFile 必失败
    expect(() => appendNotice(root, "未声明 ⇒ 三测")).not.toThrow()
  })

  test(".rddf/state 不存在 ⇒ 自动创建后写入", () => {
    const root = repo()
    expect(existsSync(path.join(root, ".rddf", "state"))).toBe(false)
    appendNotice(root, "未声明 ⇒ x")
    expect(readFileSync(path.join(root, NOTICE_LEDGER), "utf8")).toContain("未声明")
  })
})

describe("D3/D6 · 已声明且合法 ⇒ 不留痕（不误报）", () => {
  test("合法声明：decl 非空、error 为空 ⇒ 不走留痕分支", () => {
    const root = repo()
    mkdirSync(path.join(root, ".rddf"), { recursive: true })
    writeFileSync(
      path.join(root, ".rddf", "commit-gate.json"),
      JSON.stringify({ verify_commands: [["./test.sh"]] }),
      "utf8",
    )
    const decl = readDeclarationOrError(root)
    expect(decl.decl).not.toBeNull()
    expect(decl.error).toBeUndefined()
    expect(existsSync(path.join(root, NOTICE_LEDGER))).toBe(false)
  })
})
