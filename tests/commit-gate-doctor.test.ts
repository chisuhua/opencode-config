/**
 * commit-gate-doctor 的测试 —— **门禁在场性**（ADR D9② 的机械化）
 *
 * ## 覆盖两层
 *
 *   ① **纯逻辑层**（`lib/commit-gate-doctor.ts`）：解析 / 定位 / 判定三态（pass / fail / skip）。
 *   ② **活体层**：问**运行中的宿主**「commit-gate 插件在不在场」——
 *      这是 2026-11-20 那次事故（插件加载失败 ⇒ 门禁静默消失 **两天**，206 个单测全绿）
 *      **唯一能抓住**的层。
 *
 * ⚠ **活体层在无宿主环境（CI / 裸容器）自动 skip**：判定不可得 ≠ 失败（也不等于健康）。
 * ⚠ **活体层失败会让 `bun test tests/` 变红** ⇒ 而 `bun test tests/` 是 `.rddf/commit-gate.json`
 *   的 `verify_commands` 之一 ⇒ **每次运行测试都会尝试体检门禁本身是否在场**；
 *   ⚠ **措辞边界**：宿主在门禁的验证上下文里不可达时 ⇒ 该次体检**判定不可得**（skip，不判失败）——
 *   即「每次都会**尝试**」成立，「每次都**体检到**」不成立（不可判定 ≠ 健康）。
 *   已实测（2026-11-20）：门禁同款上下文（`execFile`、无 TTY、cwd=仓根）下宿主**可达** ⇒ 活体例**执行**（非 skip）。
 */
import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  COMMIT_GATE_PLUGIN_REL,
  evaluateLiveness,
  fetchPluginList,
  findLocalPlugin,
  parsePluginList,
  type PluginEntry,
} from "../lib/commit-gate-doctor.ts"

// ── ① 纯逻辑层 ─────────────────────────────────────────────────────────────

describe("插件列表解析", () => {
  test("宿主形状 { data: [...] } 与裸数组都能解析", () => {
    const one = { id: "commit-gate", source: { type: "local", path: "/x/plugins/commit-gate.ts" }, state: { status: "active" } }
    expect(parsePluginList(JSON.stringify({ location: "/x", data: [one] }))).toHaveLength(1)
    expect(parsePluginList(JSON.stringify([one]))).toHaveLength(1)
  })

  test("形状异常 ⇒ 抛（调用方按不可判定处理）", () => {
    expect(() => parsePluginList("{}")).toThrow()
    expect(() => parsePluginList("not json")).toThrow()
  })

  test("非对象元素被丢弃", () => {
    expect(parsePluginList(JSON.stringify({ data: [1, null, { id: "x" }] }))).toHaveLength(1)
  })
})

describe("本地插件定位", () => {
  const entry = (p: string, type = "local"): PluginEntry => ({
    id: p,
    source: { type, path: p },
    state: { status: "active" },
  })

  test("按目录内相对路径后缀匹配（跨平台分隔符无关）", () => {
    const found = findLocalPlugin(
      [entry("/home/u/.config/opencode/plugins/role-gate.ts"), entry("/home/u/.config/opencode/plugins/commit-gate.ts")],
      COMMIT_GATE_PLUGIN_REL,
    )
    expect(found?.source?.path).toEndWith("plugins/commit-gate.ts")
  })

  test("非 local 来源不算数（内置插件同名也不认）", () => {
    expect(findLocalPlugin([entry("/x/plugins/commit-gate.ts", "builtin")])).toBeUndefined()
  })
})

describe("在场性判定", () => {
  const active: PluginEntry = {
    id: "commit-gate",
    source: { type: "local", path: "/x/plugins/commit-gate.ts" },
    state: { status: "active" },
  }
  const failed: PluginEntry = {
    id: "commit-gate",
    source: { type: "local", path: "/x/plugins/commit-gate.ts" },
    state: { status: "failed", error: "Plugin failed to load" },
  }

  test("active ⇒ pass", () => {
    const r = evaluateLiveness([active], { reachable: true })
    expect(r.status).toBe("pass")
  })

  test("failed ⇒ fail（带宿主给的错误）", () => {
    const r = evaluateLiveness([failed], { reachable: true })
    expect(r.status).toBe("fail")
    expect(r.detail).toContain("Plugin failed to load")
  })

  test("插件缺失 ⇒ fail（门禁不存在）", () => {
    const r = evaluateLiveness([], { reachable: true })
    expect(r.status).toBe("fail")
    expect(r.reason).toContain("门禁不存在")
  })

  test("宿主不可达 ⇒ skip（不可判定 ≠ 健康）", () => {
    const r = evaluateLiveness([], { reachable: false, error: "connect ECONNREFUSED" })
    expect(r.status).toBe("skip")
    expect(r.detail).toContain("ECONNREFUSED")
  })
})

// ── ② 活体层：问运行中的宿主 ───────────────────────────────────────────────

/** 取数带重试（宿主可能在重启 ⇒ 偶发不可达不该直接判红）。 */
async function fetchWithRetry(attempts = 3): Promise<{ reachable: boolean; entries: PluginEntry[]; error?: string }> {
  let last: { reachable: boolean; entries: PluginEntry[]; error?: string } = { reachable: false, entries: [], error: "未取数" }
  for (let i = 0; i < attempts; i++) {
    last = await fetchPluginList({ timeoutMs: 8_000 })
    if (last.reachable) return last
    await new Promise((r) => setTimeout(r, 1500))
  }
  return last
}

const live = await fetchWithRetry()

describe("活体：运行中宿主的 commit-gate 插件", () => {
  test.skipIf(!live.reachable)(
    "commit-gate 插件处于 active（否则门禁不存在 ⇒ 门禁形同虚设）",
    () => {
      const r = evaluateLiveness(live.entries, { reachable: live.reachable, error: live.error })
      expect(r.status).toBe("pass")
    },
  )

  test.skipIf(live.reachable)("宿主不可达 ⇒ 本组跳过（判定不可得，不判失败）", () => {
    expect(live.reachable).toBe(false)
  })
})

// ── ③ CLI 出口码（用替身 `opencode` 二进制喂三种宿主状态）──────────────────

/** 造一个只吐插件列表 JSON 的替身 CLI（`OPENCODE_BIN` 指向它）。 */
function stubHost(payload: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cg-doctor-"))
  STUBS.push(dir)
  const bin = path.join(dir, "opencode-stub")
  writeFileSync(bin, `#!/bin/sh\ncat <<'JSON'\n${payload}\nJSON\n`)
  chmodSync(bin, 0o755)
  return bin
}

const STUBS: string[] = []

afterAll(() => {
  for (const dir of STUBS) rmSync(dir, { recursive: true, force: true })
})

function runDoctor(env: Record<string, string>): { code: number; stdout: string } {
  const r = spawnSync("bun", [path.join(import.meta.dir, "..", "scripts", "commit-gate-doctor.ts")], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  })
  return { code: r.status ?? -1, stdout: `${r.stdout ?? ""}${r.stderr ?? ""}` }
}

describe("CLI 出口码", () => {
  test("宿主 active ⇒ exit 0 且打印 PASS", () => {
    const bin = stubHost(
      JSON.stringify({
        data: [{ id: "commit-gate", source: { type: "local", path: "/x/plugins/commit-gate.ts" }, state: { status: "active" } }],
      }),
    )
    const r = runDoctor({ OPENCODE_BIN: bin })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("PASS")
  })

  test("宿主里插件 failed ⇒ exit 1 且打印 FAIL（门禁不存在）", () => {
    const bin = stubHost(
      JSON.stringify({
        data: [
          {
            id: "commit-gate",
            source: { type: "local", path: "/x/plugins/commit-gate.ts" },
            state: { status: "failed", error: "Plugin failed to load" },
          },
        ],
      }),
    )
    const r = runDoctor({ OPENCODE_BIN: bin })
    expect(r.code).toBe(1)
    expect(r.stdout).toContain("FAIL")
  })

  test("宿主不可达 ⇒ exit 2（skip：不可判定 ≠ 健康）", () => {
    const r = runDoctor({ OPENCODE_BIN: "/nonexistent/opencode-binary" })
    expect(r.code).toBe(2)
    expect(r.stdout).toContain("SKIP")
  })
})
