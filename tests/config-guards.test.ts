/**
 * 守卫漂移检测：配置里的 shell 规则必须与 `scripts/agent-guard-rules.ts`（唯一真源）**完全一致**。
 *
 * 为什么必须有这个测试：本轮因配置漂移出过两次事故——
 *   ① front 的 `subagent` 规则把 `"*": "deny"` 放在末尾 → opencode 的工具可见性判定
 *      （取该 action 最后一条匹配规则）把整个 `subagent` 工具隐藏，逐 agent allow 失效；
 *   ② `curl * -o*` 匹配不到 `curl -o /tmp/x URL`（首参形态）→ librarian 真的落盘了文件。
 * 两次都没有任何自动化闸门能拦住，本测试就是那道闸门。
 *
 * 复现：`bun test tests/config-guards.test.ts`
 */
import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import {
  GUARDED_AGENTS,
  REQUIRED_FIRST_ARG_FORMS,
  REQUIRED_GUARD_SET,
  buildShellRules,
  type GuardedAgent,
} from "../scripts/agent-guard-rules.ts"
import { applyRules } from "../scripts/agent-guard-gen.ts"
import { CONTRACTS } from "../lib/subagent-contract-core.ts"

const CONFIG_PATH = path.join(import.meta.dir, "..", "opencode.jsonc")
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"))

describe("守卫漂移检测：配置 == 规则真源", () => {
  for (const agent of GUARDED_AGENTS) {
    test(`${agent}：shell 规则与 scripts/agent-guard-rules.ts 完全一致（含顺序）`, () => {
      const actual = config.agent[agent].permission.shell as Record<string, string>
      const expected = Object.fromEntries(buildShellRules(agent as GuardedAgent))
      expect(Object.keys(actual)).toEqual(Object.keys(expected)) // 顺序即策略
      expect(actual).toEqual(expected)
    })
  }

  test("每个受管 agent（front + 五个 subagent）的守卫都含 ADR D3.1 的首参数形态（且都是 deny）", () => {
    for (const agent of GUARDED_AGENTS) {
      const shell = config.agent[agent].permission.shell as Record<string, string>
      for (const form of REQUIRED_FIRST_ARG_FORMS) {
        expect(shell[form], `${agent} 缺少首参形态守卫 ${form}`).toBe("deny")
      }
    }
  })

  test("每个 agent 都含 ADR D3/D3.1 的全量 deny 族（真源 ↔ ADR 的第三层锚）", () => {
    for (const agent of GUARDED_AGENTS) {
      const shell = config.agent[agent].permission.shell as Record<string, string>
      for (const guard of REQUIRED_GUARD_SET) {
        // librarian 例外：它必须能 clone 到 /tmp/opencode，故不设绝对路径禁令
        if (guard === "* /*" && agent === "librarian") continue
        expect(shell[guard], `${agent} 缺少 ADR 要求的守卫 ${guard}`).toBe("deny")
      }
    }
  })

  test("round-trip：注入漂移 → applyRules 修复 → JSON 仍可解析、规则全等、二次执行幂等", () => {
    const original = readFileSync(CONFIG_PATH, "utf8")
    const drifted = original.replace(/^\s*"tee \*": "deny",\n/m, "")
    expect(drifted, "注入漂移失败：没找到 tee * 守卫").not.toBe(original)

    const { text: fixed, changed } = applyRules(drifted)
    expect(changed.length).toBeGreaterThan(0)

    const parsed = JSON.parse(fixed) // 修复后必须仍是合法 JSON
    for (const agent of GUARDED_AGENTS) {
      expect(parsed.agent[agent].permission.shell).toEqual(
        Object.fromEntries(buildShellRules(agent as GuardedAgent)),
      )
    }
    expect(applyRules(fixed).changed.length, "二次执行应无变化（幂等）").toBe(0)
  })

  test("librarian：clone 目标收敛顺序正确（allow 在 deny 之后才生效）", () => {
    const shell = config.agent.librarian.permission.shell as Record<string, string>
    const keys = Object.keys(shell)
    expect(shell["git clone * /tmp/opencode/*"]).toBe("allow")
    expect(shell["git clone * /*"]).toBe("deny")
    expect(keys.indexOf("git clone * /tmp/opencode/*")).toBeGreaterThan(keys.indexOf("git clone * /*"))
    expect(keys.indexOf("git clone * /*")).toBeGreaterThan(keys.indexOf("git clone *"))
    // curl 的首参形态必须晚于 curl 的整体 allow，否则会被 allow 压掉
    expect(keys.indexOf("curl -o*")).toBeGreaterThan(keys.indexOf("curl *"))
  })

  test("每个 agent 的 shell 首条都是 `\"*\": \"deny\"`（deny-first）", () => {
    for (const agent of GUARDED_AGENTS) {
      const shell = config.agent[agent].permission.shell as Record<string, string>
      expect(Object.keys(shell)[0], `${agent} 首条不是 *: deny`).toBe("*")
      expect(shell["*"]).toBe("deny")
    }
  })
})

describe("front 的 subagent 门控顺序（ADR D2.1：顺序即语义）", () => {
  const sub = config.agent.front.permission.subagent as Record<string, string>

  test("首条是 `\"*\": \"deny\"`，末条是具体 agent 的 allow", () => {
    const keys = Object.keys(sub)
    expect(keys[0]).toBe("*")
    expect(sub["*"]).toBe("deny")
    expect(keys[keys.length - 1]).not.toBe("*")
    expect(sub[keys[keys.length - 1]]).toBe("allow")
  })

  test("恰好五个只读 agent 被 allow，general/plan/build 不在其中", () => {
    const allowed = Object.entries(sub)
      .filter(([, effect]) => effect === "allow")
      .map(([agent]) => agent)
      .sort()
    expect(allowed).toEqual(["critic", "explore", "librarian", "metis", "oracle"])
    for (const danger of ["general", "plan", "build"]) {
      expect(allowed).not.toContain(danger)
    }
  })
})

/**
 * L4 防漂移：subagent 输入契约的**规则真源**必须与
 * ① prompts/critic.md 里声明的 7 字段契约、② 每个 agent 的 description / prompt 文件一致。
 *
 * 为什么要有：契约有两份表述 —— 人类可读的（prompts/*.md）与机器可读的
 * （lib/subagent-contract-core.ts 的 CONTRACTS 表）。两份漂移 = 审计器按一套判、
 * 父模型按另一套被要求 → 误判。本测试就是那道闸门。
 */
describe("subagent 输入契约：规则真源 ↔ prompt / description 一致", () => {
  const ROOT = path.join(import.meta.dir, "..")
  const criticRule = CONTRACTS.find((r) => r.agent === "critic")!

  test("critic.md 里声明的 7 字段 == core 表的 requiredSections（双向一致）", () => {
    const criticMd = readFileSync(path.join(ROOT, "prompts", "critic.md"), "utf8")
    const line = criticMd
      .split("\n")
      .find((l) => l.includes("changes_summary") && l.includes("expected_format"))
    expect(line, "critic.md 里找不到 7 字段契约声明行").toBeTruthy()
    const declared = [...(line as string).matchAll(/`([a-z_]+)`/g)].map((m) => m[1] as string)
    expect(new Set(declared)).toEqual(new Set(criticRule.requiredSections))
  })

  test("build.md 的 7 字段上下文契约里也出现全部 requiredSections", () => {
    const buildMd = readFileSync(path.join(ROOT, "prompts", "build.md"), "utf8")
    for (const section of criticRule.requiredSections) {
      expect(buildMd, `build.md 里找不到字段 ${section}`).toContain(section)
    }
  })

  test("每个 agent 的 description 非空（父模型唯一能看到的语义依据）", () => {
    for (const [id, agent] of Object.entries(config.agent)) {
      const description = (agent as { description?: string }).description
      expect(description, `${id} 缺 description`).toBeTruthy()
      expect((description as string).trim().length, `${id} 的 description 是空串`).toBeGreaterThan(0)
    }
  })

  test("每个 agent 的 prompt 指向的 prompts/<id>.md 存在，且首行含 agent id", () => {
    for (const [id, agent] of Object.entries(config.agent)) {
      // title 是 opencode 内部的会话标题 agent，无系统提示（无 prompt 字段）
      if (id === "title") continue
      const prompt = (agent as { prompt?: string }).prompt
      expect(prompt, `${id} 缺 prompt`).toBeTruthy()
      const file = /\{file:\.\/(.+)\}/.exec(prompt as string)
      expect(file, `${id} 的 prompt 不是 {file:...} 形式：${prompt}`).toBeTruthy()
      const abs = path.join(ROOT, file![1] as string)
      expect(existsSync(abs), `${id} 的 prompt 文件不存在：${abs}`).toBe(true)
      const first = readFileSync(abs, "utf8").split("\n")[0] ?? ""
      expect(first, `${file![1]} 首行未含 agent id「${id}」`).toContain(id)
    }
  })
})
