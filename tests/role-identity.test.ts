/**
 * role-identity —— 会话身份解析（身份 ADR D1 / D4）
 *
 * 判据来源：`openspec/changes/role-aware-permissions/proposal.md` 的 AC1 / AC2
 *          （↔ `docs/adr/ADR-role-session-identity.md` V1 / V2）。
 * 层级：**层 1b 纯逻辑单测**（无门控、进 CI）—— 定义见 `design.md` D9.1。
 *
 * fixture 纪律（`tasks.md`「fixture 规则」）：
 *   ① 每个用例 `mkdtempSync` **独立父目录**（模型 `ls ..` 会把同族 fixture 当先例）；
 *   ② `role.json` 用**真实 7 分区形状**（`legacy` + 6 个 `ses_*`），`legacy.updated_at` 保持**无毫秒**；
 *   ③ **禁读真实 HOME** —— 全局根一律由 `globalRoot` 注入。
 */
import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// ⚠ 本文件在实现之前**必然红**（TDD Step 1）：`lib/role-identity.ts` 尚不存在。
import { resolveRole } from "../lib/role-identity.ts"

const SID_A = "ses_aaaaaaaaaaaaaaaaaaaaaaaa"
const SID_B = "ses_bbbbbbbbbbbbbbbbbbbbbbbb"

/** 真实 7 分区形状 + 顶层镜像（镜像的 session_id 由调用方指定）。 */
function makeState(opts: { mirrorRole: string; mirrorSid: string }): string {
  const root = mkdtempSync(path.join(tmpdir(), "ri-"))
  const stateDir = path.join(root, ".rddf", "state")
  mkdirSync(stateDir, { recursive: true })
  const role = {
    current_role: opts.mirrorRole,
    updated_at: "2026-11-17T00:00:00.000Z",
    updated_by: "user",
    session_id: opts.mirrorSid,
    auto_switch_window: null,
    history: [],
    schema_version: "role-v2",
    sessions: {
      // ⚠ 无毫秒格式（任何规范化重写都会改它 —— AC4 的字节级比较依赖这点）
      legacy: { current_role: "builder", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-05T16:01:58Z" },
      [SID_A]: { current_role: "architect", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:01.000Z" },
      [SID_B]: { current_role: "verifier", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:02.000Z" },
      ses_cccccccccccccccccccccccc: { current_role: "planner", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:03.000Z" },
      ses_dddddddddddddddddddddddd: { current_role: "builder", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:04.000Z" },
      ses_eeeeeeeeeeeeeeeeeeeeeeee: { current_role: "no-role", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:05.000Z" },
    },
  }
  writeFileSync(path.join(stateDir, "role.json"), JSON.stringify(role, null, 2) + "\n")
  return root
}

function makeGlobal(role: string | null): string {
  const root = mkdtempSync(path.join(tmpdir(), "ri-global-"))
  if (role !== null) {
    const dir = path.join(root, ".rddf", "state")
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, "role.json"),
      JSON.stringify({ current_role: role, schema_version: "role-v2", sessions: {} }, null, 2) + "\n",
    )
  }
  return root
}

describe("AC1 同一 role.json 上两个 sid 各读各的分区", () => {
  test("SID_A → architect，SID_B → verifier（同文件、不同结果）", () => {
    const stateRoot = makeState({ mirrorRole: "builder", mirrorSid: SID_A })
    const globalRoot = makeGlobal(null)

    const a = resolveRole({ stateRoot, globalRoot, sessionID: SID_A, agent: "build" })
    const b = resolveRole({ stateRoot, globalRoot, sessionID: SID_B, agent: "build" })

    expect(a.role).toBe("architect")
    expect(b.role).toBe("verifier")
    expect(a.role).not.toBe(b.role) // 只断「返回了某个角色」会塌成同支
    expect(a.source).toBe("partition")
    expect(b.source).toBe("partition")
  })
})

describe("AC2 三分支：镜像 / 全局 / default（断言 source，不只断 role）", () => {
  test("mirror：分区缺失且 role.json.session_id == 本会话 ⇒ 用顶层镜像", () => {
    const unknown = "ses_ffffffffffffffffffffffff"
    const stateRoot = makeState({ mirrorRole: "builder", mirrorSid: unknown })
    const r = resolveRole({ stateRoot, globalRoot: makeGlobal(null), sessionID: unknown, agent: "build" })
    expect(r).toEqual({ role: "builder", source: "mirror" })
  })

  test("global：分区缺失且 session_id 不匹配 ⇒ 全局", () => {
    const unknown = "ses_ffffffffffffffffffffffff"
    const stateRoot = makeState({ mirrorRole: "architect", mirrorSid: SID_A })
    const r = resolveRole({ stateRoot, globalRoot: makeGlobal("planner"), sessionID: unknown, agent: "build" })
    expect(r).toEqual({ role: "planner", source: "global" })
  })

  test("default：分区/镜像/全局都无 ⇒ general", () => {
    const unknown = "ses_ffffffffffffffffffffffff"
    const stateRoot = makeState({ mirrorRole: "architect", mirrorSid: SID_A })
    const r = resolveRole({ stateRoot, globalRoot: makeGlobal(null), sessionID: unknown, agent: "build" })
    expect(r).toEqual({ role: "general", source: "default" })
  })

  test("sid 缺失 ⇒ 跳过镜像步（不得用镜像）+ warning=no-session-id", () => {
    const stateRoot = makeState({ mirrorRole: "architect", mirrorSid: SID_A })
    const r = resolveRole({ stateRoot, globalRoot: makeGlobal("planner"), sessionID: undefined, agent: "build" })
    // ⚠ 若实现「用镜像」，这里会得到 architect/mirror ⇒ 必须红
    expect(r.role).toBe("planner")
    expect(r.source).toBe("global")
    expect(r.warning).toBe("no-session-id")
  })
})
