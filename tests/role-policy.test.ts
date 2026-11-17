/**
 * role-policy —— 角色感知写门（ADR-role-aware-permissions D2/D3；proposal AC11–AC17）
 *
 * 层级：**层 1b 纯逻辑单测**（`design.md` D9.1）—— 门控判定是纯函数，无需宿主。
 *
 * ⚠ fixture 硬规则（沿用本仓惯例）：
 *   - 每个用例独立父目录（`mkdtempSync`）⇒ 同族 fixture 不互相构成「先例」；
 *   - **禁读真实 HOME** ⇒ 治理根（`~/.config/opencode`）一律**注入**临时目录；
 *   - 仓库 fixture 用真实 7 分区形状的 `role.json`。
 */
import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { archRoots } from "../lib/delegate-core.ts"
import { switchRole } from "../lib/role-lease.ts"
import {
  ROLE_WRITE_POLICY,
  decideWrite,
  evaluateWrite,
  resolveArchPaths,
  shouldGateSession,
} from "../lib/role-policy.ts"

const REPO = path.resolve(import.meta.dir, "..")
const SID = "ses_aaaaaaaaaaaaaaaaaaaaaaaa"

interface Fixture {
  root: string
  repo: string
  gov: string
  cwd: string
}

/** 真实形状的仓库 + 治理根（治理根**不在**仓库内 ⇒ 治理面与项目面分离可见）。 */
function makeFixture(): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), "rp-"))
  const repo = path.join(root, "repo")
  const gov = path.join(root, "home", ".config", "opencode")
  mkdirSync(path.join(repo, ".rddf", "config"), { recursive: true })
  mkdirSync(path.join(repo, ".rddf", "state"), { recursive: true })
  mkdirSync(path.join(repo, ".rddf", "roadmap"), { recursive: true })
  mkdirSync(path.join(repo, ".rddf", "improvements"), { recursive: true })
  mkdirSync(path.join(repo, "docs", "adr"), { recursive: true })
  mkdirSync(path.join(repo, "src"), { recursive: true })
  mkdirSync(path.join(repo, "openspec", "changes", "c1"), { recursive: true })
  mkdirSync(path.join(gov, "prompts"), { recursive: true })

  writeFileSync(
    path.join(repo, ".rddf", "config", "arch-docs.json"),
    JSON.stringify({ arch_paths: ["docs/adr"], exclude_paths: [] }, null, 2) + "\n",
  )
  // 真实 7 分区形状（legacy 保持无毫秒）
  writeFileSync(
    path.join(repo, ".rddf", "state", "role.json"),
    JSON.stringify(
      {
        current_role: "architect",
        updated_at: "2026-11-17T00:00:00.000Z",
        updated_by: "user",
        session_id: SID,
        auto_switch_window: null,
        history: [],
        schema_version: "role-v2",
        sessions: {
          legacy: { current_role: "builder", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-05T16:01:58Z" },
          [SID]: { current_role: "architect", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:00.000Z" },
        },
      },
      null,
      2,
    ) + "\n",
  )
  writeFileSync(path.join(repo, "docs", "adr", "ADR-1.md"), "# ADR\n")
  writeFileSync(path.join(repo, "src", "foo.ts"), "export const x = 1\n")
  writeFileSync(path.join(repo, ".rddf", "roadmap", "r.md"), "# roadmap\n")
  writeFileSync(path.join(repo, ".rddf", "improvements", "i.md"), "# improvement\n")
  writeFileSync(path.join(repo, "openspec", "changes", "c1", "proposal.md"), "# proposal\n")
  writeFileSync(path.join(repo, "openspec", "changes", "c1", "design.md"), "# design\n")
  writeFileSync(path.join(gov, "prompts", "build.md"), "# build\n")
  return { root, repo, gov, cwd: repo }
}

function check(fx: Fixture, role: any, filePath: string, action: "edit" | "write" = "edit") {
  return decideWrite({
    role,
    action,
    filePath,
    cwd: fx.cwd,
    repoRoot: fx.repo,
    governanceRoot: fx.gov,
  })
}

describe("AC11 architect 写实施面被拒（成对：架构文档放行）", () => {
  test("architect edit src/foo.ts ⇒ 拒；message 含 角色+路径+动作", () => {
    const fx = makeFixture()
    const r = check(fx, "architect", "src/foo.ts")
    expect(r.allowed).toBe(false)
    expect(r.message).toContain("architect")
    expect(r.message).toContain("src/foo.ts")
    expect(r.message).toContain("edit")
    // 成对：同一角色写架构文档（arch_paths 命中）放行
    expect(check(fx, "architect", "docs/adr/ADR-1.md").allowed).toBe(true)
  })

  test("write 工具同样被拒（action 进 message）", () => {
    const fx = makeFixture()
    const r = check(fx, "architect", "src/foo.ts", "write")
    expect(r.allowed).toBe(false)
    expect(r.message).toContain("write")
  })
})

describe("AC12 builder 写 arch_paths 命中的架构文档成功", () => {
  test("builder edit docs/adr/ADR-1.md ⇒ 放行（且不被治理面规则误伤）", () => {
    const fx = makeFixture()
    expect(check(fx, "builder", "docs/adr/ADR-1.md").allowed).toBe(true)
    expect(check(fx, "builder", "src/foo.ts").allowed).toBe(true)
  })
})

describe("AC13 no-role 对任意仓库文件被拒，但**能完成角色切换**", () => {
  test("no-role edit src/foo.ts ⇒ 拒（连架构文档也拒：一切 edit）", () => {
    const fx = makeFixture()
    expect(check(fx, "no-role", "src/foo.ts").allowed).toBe(false)
    expect(check(fx, "no-role", "docs/adr/ADR-1.md").allowed).toBe(false)
    expect(check(fx, "no-role", "src/foo.ts").message).toContain("no-role")
  })

  test("成对：no-role 下角色切换仍能完成（切换不走 edit 工具）", () => {
    const fx = makeFixture()
    const w = switchRole({ stateRoot: fx.repo, sessionID: SID, role: "builder", by: "user" })
    expect(w.sessions[SID].current_role).toBe("builder")
  })
})

describe("AC14 architect 写治理面成功", () => {
  test("architect edit <gov>/prompts/build.md ⇒ 放行", () => {
    const fx = makeFixture()
    const r = check(fx, "architect", path.join(fx.gov, "prompts", "build.md"))
    expect(r.allowed).toBe(true)
  })

  test("成对：planner 写治理面被拒（治理面产出归属 architect）", () => {
    const fx = makeFixture()
    const r = check(fx, "planner", path.join(fx.gov, "prompts", "build.md"))
    expect(r.allowed).toBe(false)
    expect(r.message).toContain("architect")
  })
})

describe("AC15 planner 写 src/** 被拒、写 roadmap/improvements 成功", () => {
  test("planner edit src/foo.ts ⇒ 拒", () => {
    const fx = makeFixture()
    expect(check(fx, "planner", "src/foo.ts").allowed).toBe(false)
  })

  test("planner 写 .rddf/roadmap/** 与 .rddf/improvements/** ⇒ 放行", () => {
    const fx = makeFixture()
    expect(check(fx, "planner", ".rddf/roadmap/r.md").allowed).toBe(true)
    expect(check(fx, "planner", ".rddf/improvements/i.md").allowed).toBe(true)
  })

  test("planner 写 design.md ⇒ 拒（只能起草 proposal.md）", () => {
    const fx = makeFixture()
    expect(check(fx, "planner", "openspec/changes/c1/proposal.md").allowed).toBe(true)
    expect(check(fx, "planner", "openspec/changes/c1/design.md").allowed).toBe(false)
  })
})

describe("AC16 单一真源：策略表与身份解析各只有一处定义", () => {
  /** 扫代码面（不含 tests/）：统计「策略表定义点」与「身份解析定义点」。 */
  function scanCode(): { policyDefs: string[]; resolveDefs: string[] } {
    const policyDefs: string[] = []
    const resolveDefs: string[] = []
    const dirs = ["lib", "plugins", "scripts", "tools"]
    for (const d of dirs) {
      let names: string[] = []
      try {
        names = require("node:fs").readdirSync(path.join(REPO, d)) as string[]
      } catch {
        continue
      }
      for (const name of names) {
        if (!/\.(ts|js)$/.test(name)) continue
        const rel = `${d}/${name}`
        const text = readFileSync(path.join(REPO, d, name), "utf8")
        if (/(?:export\s+)?(?:const|let|var)\s+ROLE_WRITE_POLICY\b/.test(text)) policyDefs.push(rel)
        if (/export\s+(?:async\s+)?function\s+resolveRole\b/.test(text)) resolveDefs.push(rel)
      }
    }
    return { policyDefs, resolveDefs }
  }

  test("策略表定义点恰好 1 处（lib/role-policy.ts）；身份解析定义点恰好 1 处", () => {
    const { policyDefs, resolveDefs } = scanCode()
    expect(policyDefs).toEqual(["lib/role-policy.ts"])
    expect(resolveDefs).toEqual(["lib/role-identity.ts"])
  })

  test("⚠ 判别力：语料注入第二份策略表 ⇒ 必红", () => {
    const injected = {
      "lib/role-policy.ts": "export const ROLE_WRITE_POLICY = { architect: { allow: ['src'] } }",
      "lib/rogue-policy.ts": "const ROLE_WRITE_POLICY = { builder: { allow: ['**'] } }",
    }
    const defs = Object.entries(injected)
      .filter(([, t]) => /(?:export\s+)?(?:const|let|var)\s+ROLE_WRITE_POLICY\b/.test(t))
      .map(([f]) => f)
    expect(defs.length, "注入第二份策略表 ⇒ 守卫必须抓到").toBe(2)
  })

  test("AC16 第三支：spawn 规则构建器的 arch 目录解析**收敛**到 role-policy（不得有第二份实现）", () => {
    const core = readFileSync(path.join(REPO, "lib", "delegate-core.ts"), "utf8")
    const start = core.indexOf("export function archRoots(")
    expect(start, "archRoots 不存在").toBeGreaterThan(-1)
    const body = core.slice(start, core.indexOf("\n}\n", start))
    // ① 源码级：必须是**委托**，不得自己读配置 / 自己筛 fallback
    expect(body).toContain("resolveArchPaths(")
    expect(body).not.toContain("arch-docs.json")
    expect(body).not.toContain("ARCH_FALLBACK_DIRS")
    // ② 行为级：三态逐个与 role-policy 一致（同输入同输出）
    const fx = makeFixture()
    expect(archRoots(fx.repo)).toEqual(resolveArchPaths(fx.repo))
    rmSync(path.join(fx.repo, ".rddf", "config", "arch-docs.json"))
    expect(archRoots(fx.repo)).toEqual(resolveArchPaths(fx.repo))
    rmSync(path.join(fx.repo, "docs", "adr"), { recursive: true })
    expect(archRoots(fx.repo)).toEqual(resolveArchPaths(fx.repo))
  })

  test("插件消费单源：调用 resolveRole（身份）与 evaluateWrite（策略），不自带表", () => {
    const text = readFileSync(path.join(REPO, "plugins", "role-gate.ts"), "utf8")
    expect(text).toContain("resolveRole(")
    expect(text).toContain("evaluateWrite(")
    expect(text).not.toMatch(/ROLE_WRITE_POLICY/)
  })
})

describe("AC17 会话类型不相交：后端跳过 / 非 build 主会话跳过", () => {
  test("后端（parentID != null）⇒ 跳过门控（仍走 scopeEditRules）", () => {
    const fx = makeFixture()
    const r = evaluateWrite({
      agent: "build",
      parentID: "ses_parent",
      role: "architect",
      action: "edit",
      filePath: "src/foo.ts",
      cwd: fx.cwd,
      repoRoot: fx.repo,
      governanceRoot: fx.gov,
    })
    expect(r.gated).toBe(false)
    expect(r.skipped).toBe(true)
    expect(r.allowed).toBe(true)
  })

  test("成对：parentID = null ⇒ 门控生效 ⇒ 同样路径被拒", () => {
    const fx = makeFixture()
    const r = evaluateWrite({
      agent: "build",
      parentID: null,
      role: "architect",
      action: "edit",
      filePath: "src/foo.ts",
      cwd: fx.cwd,
      repoRoot: fx.repo,
      governanceRoot: fx.gov,
    })
    expect(r.gated).toBe(true)
    expect(r.allowed).toBe(false)
  })

  test("非 build 主会话（agent=plan）⇒ 跳过", () => {
    expect(shouldGateSession({ agent: "plan", parentID: null })).toBe(false)
    expect(shouldGateSession({ agent: "front", parentID: null })).toBe(false)
    expect(shouldGateSession({ agent: "build", parentID: null })).toBe(true)
  })

  // ⚠ 层 2 e2e 实测（2026-11-17）：`ctx.session.create` **不设** `parentID`
  //   ⇒ 只靠 parentID 会把被派发后端当成主会话（后端被门控 + 用错角色键占租约）。
  //   以下三条是**真实宿主**上的后端判据，各一例（成对：都不满足 ⇒ 仍门控）。
  test("后端判据②：`pair.json` 有登记 ⇒ 跳过", () => {
    expect(shouldGateSession({ agent: "build", parentID: null, registeredBackend: true })).toBe(false)
    expect(shouldGateSession({ agent: "build", parentID: null, registeredBackend: false })).toBe(true)
  })

  test("后端判据③：分区带 `role_class` ⇒ 跳过（`writeRoleSession` 只给后端写它）", () => {
    expect(
      shouldGateSession({ agent: "build", parentID: null, partitionRoleClass: "verifier" }),
    ).toBe(false)
    expect(shouldGateSession({ agent: "build", parentID: null, partitionRoleClass: null })).toBe(true)
  })

  test("插件接线：三条判据都读（源码级锚点，防回退成只看 parentID）", () => {
    const text = readFileSync(path.join(REPO, "plugins", "role-gate.ts"), "utf8")
    expect(text).toContain("registeredBackend")
    expect(text).toContain("partitionRoleClass")
    expect(text).toContain("readSessionPartition")
  })
})

describe("路径归一：相对 / ../ / symlink ⇒ 同一结论", () => {
  test("相对路径与绝对路径判定一致", () => {
    const fx = makeFixture()
    const a = check(fx, "architect", "src/foo.ts")
    const b = check(fx, "architect", path.join(fx.repo, "src", "foo.ts"))
    expect(a.allowed).toBe(false)
    expect(b.allowed).toBe(false)
    expect(a.absPath).toBe(b.absPath)
  })

  test("`../` 穿越后仍指向同一文件 ⇒ 同样被拒", () => {
    const fx = makeFixture()
    const cwd = path.join(fx.repo, ".rddf")
    const r = decideWrite({
      role: "architect",
      action: "edit",
      filePath: "../src/foo.ts",
      cwd,
      repoRoot: fx.repo,
      governanceRoot: fx.gov,
    })
    expect(r.allowed).toBe(false)
    expect(r.absPath).toBe(path.join(fx.repo, "src", "foo.ts"))
  })

  test("symlink 变体：链接路径 ⇒ 解析到真实目标后同判", () => {
    const fx = makeFixture()
    const link = path.join(fx.repo, "src", "link.ts")
    symlinkSync(path.join(fx.repo, "src", "foo.ts"), link)
    try {
      const r = check(fx, "architect", "src/link.ts")
      expect(r.allowed).toBe(false)
      expect(r.absPath).toBe(path.join(fx.repo, "src", "foo.ts"))
    } finally {
      rmSync(link, { force: true })
    }
  })
})

describe("arch_paths 三态（§架构文档范围）", () => {
  test("① 配置存在且命中 ⇒ 用配置（docs/adr）", () => {
    const fx = makeFixture()
    expect(resolveArchPaths(fx.repo)).toEqual(["docs/adr"])
  })

  test("② 配置缺失 ⇒ 落 fallback 目录集（取实际存在的）", () => {
    const fx = makeFixture()
    rmSync(path.join(fx.repo, ".rddf", "config", "arch-docs.json"))
    const fallback = resolveArchPaths(fx.repo)
    expect(fallback).toContain("docs/adr")
  })

  test("③ 两者皆无 ⇒ 空数组（architect 无受管架构文档）", () => {
    const fx = makeFixture()
    rmSync(path.join(fx.repo, ".rddf", "config", "arch-docs.json"))
    rmSync(path.join(fx.repo, "docs", "adr"), { recursive: true })
    expect(resolveArchPaths(fx.repo)).toEqual([])
  })
})

describe("策略表结构自检（防止有人把 allow 写成空数组而恒拒）", () => {
  test("builder / general 的 allow 含 `**`（否则实施面被误伤）", () => {
    expect(ROLE_WRITE_POLICY.builder.allow).toContain("**")
    expect(ROLE_WRITE_POLICY.general.allow).toContain("**")
  })

  test("no-role 是唯一 denyAll 的角色", () => {
    const denyAll = Object.entries(ROLE_WRITE_POLICY)
      .filter(([, p]) => p.denyAll)
      .map(([r]) => r)
    expect(denyAll).toEqual(["no-role"])
  })
})
