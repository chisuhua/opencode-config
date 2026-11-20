/**
 * commit-gate-doctor —— **门禁在场性体检**（ADR D9② 的机械化入口）
 *
 * ## 用途
 *
 * `lib/commit-gate.ts` 的单测只覆盖**判定逻辑**，覆盖不到「插件有没有真的加载上」。
 * 2026-11-20 实测的故障形态是：宿主进程模块缓存固化 ⇒ 插件 `SyntaxError` 加载失败
 * ⇒ **门禁静默消失**（commit 照常通过、验证命令也没人跑），而 206 个单测全绿。
 *
 * 本脚本回答唯一的问题：**此刻门禁在不在场？**
 *
 * ## 用法
 *
 *   bun scripts/commit-gate-doctor.ts            # 人读
 *   bun scripts/commit-gate-doctor.ts --json     # 机读
 *
 * ## 退出码
 *
 *   0 = pass（门禁在场且 active）
 *   1 = fail（插件缺失 / 状态非 active ⇒ 门禁不存在）
 *   2 = skip（连不上运行中的宿主 ⇒ 判定不可得；**不等于健康**）
 *
 * ## 修法提示（fail 时打印）
 *
 *   宿主进程里的模块缓存在 `lib/*.ts` 改动后不会失效 ⇒ 必须重启宿主：
 *   `opencode service restart`（然后重跑本脚本确认）。
 */
import { fetchPluginList, evaluateLiveness, type LivenessResult } from "../lib/commit-gate-doctor.ts"

const args = process.argv.slice(2)
const asJson = args.includes("--json")
const timeoutArg = args.find((a) => a.startsWith("--timeout="))
const timeoutMs = timeoutArg ? Number(timeoutArg.split("=")[1]) : undefined

function render(r: LivenessResult): string {
  const head = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "SKIP"
  const lines = [`${head}: ${r.reason}`]
  if (r.detail) lines.push(`  细节: ${r.detail}`)
  if (r.status === "fail") {
    lines.push("  修法: opencode service restart（宿主进程里的模块缓存不会随 lib/*.ts 改动失效）")
    lines.push("        然后重跑本脚本确认 PASS")
  }
  return lines.join("\n")
}

const { reachable, entries, error } = await fetchPluginList(timeoutMs ? { timeoutMs } : {})
const result = evaluateLiveness(entries, { reachable, error })

if (asJson) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n")
} else {
  process.stdout.write(render(result) + "\n")
}

process.exit(result.status === "pass" ? 0 : result.status === "fail" ? 1 : 2)
