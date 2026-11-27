import { describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

/**
 * `scripts/plan-models-check.sh` 的判据（ADR-plan-collaboration-hardening D1 / **V3**）。
 *
 * 覆盖：合法配置 ⇒ 0；schema 非法 / 模型不在 `opencode models` 输出中 / 配置文件缺失 ⇒ ≠0（fail-closed）；
 * `content.model: null` 合法；`--skip-models` 跳过比对。
 *
 * 注入假的 `opencode` 可执行文件（临时 PATH）⇒ 不依赖真实 provider 列表，可重复。
 */

const SCRIPT = path.join(import.meta.dir, "..", "scripts", "plan-models-check.sh")

interface Fixture {
  dir: string
  config: string
  bin: string
}

/** 建临时目录：`config.json` + 假 `opencode`（输出固定模型清单）。 */
function makeFixture(cfg: unknown, models: string[] = ["opencode-go/kimi-k3.1-pro", "opencode-go/gemini-4-argon"]): Fixture {
  const dir = mkdtempSync(path.join(tmpdir(), "plan-models-"))
  const config = path.join(dir, "plan-models.json")
  if (cfg !== undefined) writeFileSync(config, typeof cfg === "string" ? cfg : JSON.stringify(cfg))
  const bin = path.join(dir, "bin")
  mkdirSync(bin, { recursive: true })
  const opencode = path.join(bin, "opencode")
  writeFileSync(opencode, `#!/usr/bin/env bash\n${models.map((m) => `echo ${JSON.stringify(m)}`).join("\n")}\n`)
  chmodSync(opencode, 0o755)
  return { dir, config, bin }
}

function run(fx: Fixture, extra: string[] = []): { code: number; stdout: string; stderr: string } {
  const p = Bun.spawnSync(["bash", SCRIPT, "--config", fx.config, ...extra], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PATH: `${fx.bin}:${process.env.PATH ?? ""}` },
  })
  return { code: p.exitCode ?? -1, stdout: p.stdout.toString(), stderr: p.stderr.toString() }
}

const OK_CONFIG = {
  schema_version: 1,
  synthesis: { model: "opencode-go/kimi-k3.1-pro#high", fallback: ["opencode-go/gemini-4-argon#high"] },
  content: { model: null },
}

describe("plan-models-check：正向", () => {
  test("合法配置（模型在清单中）⇒ exit 0", () => {
    const fx = makeFixture(OK_CONFIG)
    const r = run(fx)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("plan-models OK")
  })

  test("--json 输出可解析且 ok=true", () => {
    const fx = makeFixture(OK_CONFIG)
    const r = run(fx, ["--json"])
    expect(r.code).toBe(0)
    const payload = JSON.parse(r.stdout) as { ok: boolean; synthesis_model: string }
    expect(payload.ok).toBe(true)
    expect(payload.synthesis_model).toBe("opencode-go/kimi-k3.1-pro#high")
  })

  test("content.model 非 null 且合法 ⇒ exit 0", () => {
    const fx = makeFixture({ ...OK_CONFIG, content: { model: "opencode-go/gemini-4-argon" } })
    expect(run(fx).code).toBe(0)
  })

  test("--skip-models ⇒ 不做可用性比对，exit 0", () => {
    const fx = makeFixture({ ...OK_CONFIG, synthesis: { model: "opencode-go/whatever#high", fallback: [] } })
    const r = run(fx, ["--skip-models"])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("skipped")
  })

  test("fallback 模型不可用 ⇒ 只告警，不阻断", () => {
    const fx = makeFixture({ ...OK_CONFIG, synthesis: { model: "opencode-go/kimi-k3.1-pro", fallback: ["opencode-go/gone"] } })
    const r = run(fx)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("gone")
  })

  test("fallback 条目形状非法 ⇒ exit 1", () => {
    const fx = makeFixture({ ...OK_CONFIG, synthesis: { model: "opencode-go/kimi-k3.1-pro", fallback: ["garbage"] } })
    expect(run(fx).code).toBe(1)
  })
})

describe("plan-models-check：负向（fail-closed）", () => {
  test("schema_version 非法 ⇒ exit 1", () => {
    const fx = makeFixture({ ...OK_CONFIG, schema_version: 2 })
    const r = run(fx)
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("schema_version")
  })

  test("synthesis.model 类型非法 ⇒ exit 1", () => {
    const fx = makeFixture({ ...OK_CONFIG, synthesis: { model: 42 } })
    expect(run(fx).code).toBe(1)
  })

  test("synthesis.model 不在 `opencode models` 输出中 ⇒ exit 1", () => {
    const fx = makeFixture({ ...OK_CONFIG, synthesis: { model: "opencode-go/no-such-model#high" } })
    const r = run(fx)
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("不在 `opencode models` 输出中")
  })

  test("配置文件缺失 ⇒ exit 2（≠0；fail-closed，不得回落放行）", () => {
    const fx = makeFixture(undefined)
    expect(run(fx).code).toBe(2)
  })

  test("JSON 不可解析 ⇒ exit 1", () => {
    const fx = makeFixture("{not json")
    expect(run(fx).code).toBe(1)
  })

  test("synthesis 缺失 ⇒ exit 1", () => {
    const fx = makeFixture({ schema_version: 1, content: { model: null } })
    expect(run(fx).code).toBe(1)
  })

  test("未知参数 ⇒ exit 2（用法错误）", () => {
    const fx = makeFixture(OK_CONFIG)
    expect(run(fx, ["--nope"]).code).toBe(2)
  })

  test("找不到 `opencode` CLI ⇒ exit 1（不得静默降级为「未比对」）", () => {
    const fx = makeFixture(OK_CONFIG)
    const bash = Bun.which("bash")
    const py = Bun.which("python3")
    expect(bash).toBeTruthy()
    expect(py).toBeTruthy()
    // 只把 python3 放进 PATH：`bash` 用绝对路径启动，`opencode` 确实找不到
    const emptyBin = mkdtempSync(path.join(tmpdir(), "plan-models-nobin-"))
    symlinkSync(py as string, path.join(emptyBin, "python3"))
    const p = Bun.spawnSync([bash as string, SCRIPT, "--config", fx.config], {
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: emptyBin },
    })
    expect(p.exitCode).toBe(1)
    expect(p.stderr.toString()).toContain("opencode")
  })

  test("`opencode models` 输出为空 ⇒ exit 1", () => {
    const fx = makeFixture(OK_CONFIG, [])
    expect(run(fx).code).toBe(1)
  })

  test("`opencode models` 非零退出 ⇒ exit 1（fail-closed）", () => {
    const fx = makeFixture(OK_CONFIG)
    writeFileSync(path.join(fx.bin, "opencode"), "#!/usr/bin/env bash\nexit 7\n")
    chmodSync(path.join(fx.bin, "opencode"), 0o755)
    const r = run(fx)
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("退出码")
  })
})
