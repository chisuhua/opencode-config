/**
 * `scripts/rdd-skills.sh` 的**技能清单自动发现**。
 *
 * 背景：清单原来是写死的镜像（28 项），上游新增 skill 必须手工补——2026-11-19 新增
 * `session-lesson-mining` 时就是这样漏掉的（脚本报 `28/28`，新技能静默缺席）。
 * 现在的口径：
 *   ① 已安装 rdd-workflow 的 `package.json::skills[]`（上游权威清单）
 *   ② 磁盘 `<root>/skills/*​/SKILL.md`（清单缺失/落后时兜底，跳过 `deprecated:`）
 *   ③ 内置清单（一个安装都没找到时）
 *
 * 每个用例都覆盖「发现到了」与「发现不到」两侧，避免断言恒真。
 */
import { describe, expect, test } from "bun:test"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const SCRIPT = path.join(import.meta.dir, "..", "scripts", "rdd-skills.sh")

type Probe = {
  installed: boolean
  available: string[]
  missing: string[]
  total_count: number
  available_count: number
  installed_count: number
  skills_source: string
}

function mkdirp(p: string) {
  mkdirSync(p, { recursive: true })
}

function skillFile(dir: string, body = "---\nname: x\n---\n") {
  mkdirp(dir)
  writeFileSync(path.join(dir, "SKILL.md"), body)
}

function probe(projectRoot: string, home: string): { json: Probe; status: number } {
  try {
    const out = execFileSync("bash", [SCRIPT, "--json", projectRoot], {
      env: { ...process.env, HOME: home, RDD_WORKFLOW_SRC: "", PROJECT_ROOT: "" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { json: JSON.parse(out) as Probe, status: 0 }
  } catch (err: any) {
    return { json: JSON.parse(String(err.stdout)) as Probe, status: err.status ?? 1 }
  }
}

describe("rdd-skills.sh：技能清单自动发现", () => {
  test("manifest 为准 + 磁盘兜底：磁盘独有技能也进 available，未安装的进 missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rdd-skills-a-"))
    const home = path.join(root, "home")
    const proj = path.join(root, "proj")
    mkdirp(proj)
    const wf = path.join(home, ".agents/skills/rdd-workflow")
    mkdirp(wf)
    writeFileSync(
      path.join(wf, "package.json"),
      JSON.stringify({ skills: ["fixture-manifest-skill", "absent-skill"] }),
    )
    // 已安装：manifest 里的一个、以及只存在于磁盘的一个
    skillFile(path.join(home, ".agents/skills/fixture-manifest-skill"))
    skillFile(path.join(home, ".agents/skills/disk-only-skill"))
    skillFile(path.join(wf, "skills/fixture-manifest-skill"))
    skillFile(path.join(wf, "skills/disk-only-skill"))

    const { json } = probe(proj, home)
    expect(json.skills_source.startsWith("manifest:")).toBe(true)
    expect(json.available).toContain("fixture-manifest-skill")
    expect(json.available).toContain("disk-only-skill") // 不在 manifest 也能被发现
    expect(json.missing).toContain("absent-skill") // manifest 里有但没装 ⇒ missing
    expect(json.total_count).toBe(json.available_count + json.missing.length)
    // 权威集只算 manifest ∪ 内置：磁盘独有的 disk-only-skill 不进 installed_count
    expect(json.installed).toBe(true)
    expect(json.installed_count).toBe(1)
  }, 20_000)

  test("没有 package.json 时用磁盘清单（skills/*/SKILL.md）", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rdd-skills-b-"))
    const home = path.join(root, "home")
    const proj = path.join(root, "proj")
    mkdirp(proj)
    // 老安装（没有 package.json）用**上游技能名**代表 rdd-workflow 存在
    skillFile(path.join(home, ".agents/skills/rdd-workflow/skills/rdd-builder"))
    skillFile(path.join(home, ".agents/skills/rdd-builder"))

    const { json } = probe(proj, home)
    expect(json.skills_source.startsWith("disk:")).toBe(true)
    expect(json.available).toContain("rdd-builder")
    expect(json.installed).toBe(true)
  }, 20_000)

  // N1（oracle 审查）：磁盘兜底会把项目自有技能并入 available，但**不能**因此把
  // 「没装 rdd-workflow」判成「已安装」—— installed / 退出码只看上游权威集。
  test("项目只有无关技能、且未装 rdd-workflow ⇒ installed=false 且 exit 1", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rdd-skills-e-"))
    const home = path.join(root, "empty-home")
    const proj = path.join(root, "proj")
    mkdirp(home)
    skillFile(path.join(proj, ".opencode/skills/deploy"))

    const { json, status } = probe(proj, home)
    expect(json.available).toContain("deploy") // 能被发现
    expect(json.installed).toBe(false) // 但不计入增强层可用
    expect(json.installed_count).toBe(0)
    expect(status).toBe(1)
  }, 20_000)

  test("磁盘清单跳过 deprecated 技能", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rdd-skills-c-"))
    const home = path.join(root, "home")
    const proj = path.join(root, "proj")
    mkdirp(proj)
    skillFile(
      path.join(home, ".agents/skills/rdd-workflow/skills/old-skill"),
      "---\nname: old-skill\nmetadata:\n  deprecated: true\n---\n",
    )
    skillFile(path.join(home, ".agents/skills/rdd-workflow/skills/live-skill"))
    skillFile(path.join(home, ".agents/skills/old-skill"))
    skillFile(path.join(home, ".agents/skills/live-skill"))

    const { json } = probe(proj, home)
    expect(json.available).toContain("live-skill")
    expect(json.available).not.toContain("old-skill")
    expect(json.installed).toBe(false) // 非上游技能名 ⇒ 不计入增强层可用
  }, 20_000)

  test("一个安装都没有 ⇒ 回落内置清单，installed=false 且 exit 1", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rdd-skills-d-"))
    const home = path.join(root, "empty-home")
    const proj = path.join(root, "empty-proj")
    mkdirp(home)
    mkdirp(proj)

    const { json, status } = probe(proj, home)
    expect(json.installed).toBe(false)
    expect(json.available_count).toBe(0)
    expect(json.skills_source).toBe("builtin")
    expect(json.total_count).toBeGreaterThan(20) // 内置清单仍在（只是没有可用的）
    expect(status).toBe(1)
  }, 20_000)

  // critic SHOULD_FIX 1：无 manifest + 技能名全被改名 ⇒ 判未安装，但必须留下 WARN
  test("rdd-workflow 布局但无权威名 ⇒ installed=false + stderr WARN（不静默）", () => {
    const root = mkdtempSync(path.join(tmpdir(), "rdd-skills-f-"))
    const home = path.join(root, "home")
    const proj = path.join(root, "proj")
    mkdirp(proj)
    skillFile(path.join(home, ".agents/skills/rdd-workflow/skills/renamed-skill"))
    skillFile(path.join(home, ".agents/skills/renamed-skill"))

    const res = spawnSync("bash", [SCRIPT, "--json", proj], {
      env: { ...process.env, HOME: home, RDD_WORKFLOW_SRC: "", PROJECT_ROOT: "" },
      encoding: "utf8",
    })
    const json = JSON.parse(String(res.stdout)) as Probe
    expect(json.available).toContain("renamed-skill")
    expect(json.installed).toBe(false)
    expect(res.status).toBe(1)
    expect(String(res.stderr)).toContain("WARN")
  }, 20_000)

  // 契约面同步：脚本新增的字段必须在两份规则文档里都有记录（防止"实现改了、文档没跟"）
  test("skills_source / installed_count 在脚本与两份规则文档中同步出现", () => {
    const root = path.join(import.meta.dir, "..")
    for (const f of ["scripts/rdd-skills.sh", "prompts/build.md", "docs/MULTI-AGENT-DESIGN.md"]) {
      const text = readFileSync(path.join(root, f), "utf8")
      expect(text, `${f} 缺 skills_source`).toContain("skills_source")
      expect(text, `${f} 缺 installed_count`).toContain("installed_count")
    }
  })

  // 真实安装面：本机装了 rdd-workflow 时，新技能必须被自动感知（不必改脚本）
  const REAL_HOME = process.env.HOME ?? ""
  const REAL_WF = path.join(REAL_HOME, ".agents/skills/rdd-workflow/package.json")
  test.skipIf(!existsSync(REAL_WF))("真实安装：新技能 session-lesson-mining 被自动发现", () => {
    const proj = path.join(import.meta.dir, "..")
    const { json } = probe(proj, REAL_HOME)
    expect(json.skills_source.startsWith("manifest:")).toBe(true)
    expect(json.available).toContain("session-lesson-mining")
  }, 20_000)
})
