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
import { ARCH_FALLBACK_DIRS, PLAN_REF_ROOTS, PRIORITY_BLOCKED_FIELDS, SLOT_STATES } from "../lib/delegate-core.ts"

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

  test("oracle / critic 的 description 声明审查分工（防 orphan 描述回退）", () => {
    const oracle = (config.agent.oracle as { description?: string }).description ?? ""
    const critic = (config.agent.critic as { description?: string }).description ?? ""
    // oracle 必须在**选择面**上暴露"审查者"身份 —— 只写 consultant 会让父模型跳过 oracle 先行
    expect(/审查|review/i.test(oracle), "oracle description 未声明审查身份").toBe(true)
    // 分工与顺序：两边都要能看出对方的存在
    expect(oracle, "oracle description 未提及 critic（协同关系）").toContain("critic")
    expect(critic, "critic description 未提及 oracle（顺序/兜底）").toContain("oracle")
    expect(critic, "critic description 未声明主审范围（冲突/一致性）").toMatch(/冲突/)
    // description 只决定主次，不得缩小 critic.md 正文的覆盖面
    expect(critic).toMatch(/主审|不缩小覆盖面/)
  })

  test("metis 的 6 节输出契约在 metis.md / build.md / MULTI-AGENT-DESIGN.md 三处**有序全等**", () => {
    const splitList = (raw: string) => raw.split("/").map((x) => x.trim()).filter(Boolean)

    // 真源：metis.md 的 Output 段（截到下一个 `## `，避免把后续章节的 ### 也算进来）
    const metisMd = readFileSync(path.join(ROOT, "prompts", "metis.md"), "utf8")
    const outputSection = ((metisMd.split(/^## Output\s*$/m)[1] ?? "").split(/^## /m)[0] ?? "")
    const headings = [...outputSection.matchAll(/^### (.+)$/gm)].map((m) => (m[1] as string).trim())
    expect(headings.length, `metis.md 的 Output 段应有 6 节，实为 ${headings.length}`).toBe(6)

    // 消费者：build.md 的 metis 返回结构行里 "Markdown 6 节：" 之后、" |" 之前的名单
    const buildMd = readFileSync(path.join(ROOT, "prompts", "build.md"), "utf8")
    const metisRow = buildMd.split("\n").find((l) => l.startsWith("| `metis` |"))
    expect(metisRow, "build.md 的 subagent 返回结构表里找不到 metis 行").toBeTruthy()
    const rowList = /Markdown 6 节：([^|]+)/.exec(metisRow as string)
    expect(rowList, "build.md 的 metis 行里找不到「Markdown 6 节：…」名单").toBeTruthy()
    expect(splitList(rowList![1] as string), "build.md 的 metis 名单与 metis.md 不一致（含顺序）").toEqual(headings)

    // 投影：MULTI-AGENT-DESIGN.md 的 `#### metis` 卡片里的 "Markdown 六节（…）"
    const designMd = readFileSync(path.join(ROOT, "docs", "MULTI-AGENT-DESIGN.md"), "utf8")
    const cardSection = ((designMd.split(/^#### `metis`.*$/m)[1] ?? "").split(/^#### /m)[0] ?? "")
    const cardList = /Markdown 六节（([^）]+)）/.exec(cardSection)
    expect(cardList, "MULTI-AGENT-DESIGN.md 的 metis 卡片里找不到「Markdown 六节（…）」").toBeTruthy()
    expect(splitList(cardList![1] as string), "MULTI-AGENT-DESIGN.md 的 metis 卡片与 metis.md 不一致（含顺序）").toEqual(headings)

    // 汇总文档（投影）也必须与真源一致 —— 少一处就成第二份定义
    const orchMd = readFileSync(path.join(ROOT, "docs", "SUBAGENT-ORCHESTRATION.md"), "utf8")
    for (const h of headings) {
      expect(orchMd, `SUBAGENT-ORCHESTRATION.md 的 metis 段缺少「${h}」`).toContain(h)
    }
  })

  test("delegate 通道的放行主体：顶层全 deny + front / plan 各自放行五项（ADR-plan-delegate-engineering-session D1）", () => {
    const ACTIONS = ["delegate", "delegate_dispatch", "delegate_sessions", "delegate_suspend", "delegate_cancel"]
    const top = (config.permission ?? {}) as Record<string, string>
    for (const a of ACTIONS) {
      expect(top[a], `顶层 permission.${a} 应保持 deny`).toBe("deny")
    }
    for (const agent of ["front", "plan"]) {
      const perm = (config.agent[agent] as any).permission as Record<string, string>
      for (const a of ACTIONS) {
        expect(perm[a], `${agent} 的 ${a} 应为 allow`).toBe("allow")
      }
    }
    // 其它 agent 不得被放行（唯一门控边界不扩散）
    for (const agent of ["build", "explore", "librarian", "oracle", "metis", "critic"]) {
      const perm = (config.agent[agent] as any)?.permission as Record<string, string> | undefined
      for (const a of ACTIONS) {
        expect(perm?.[a], `${agent} 不应放行 ${a}`).toBeUndefined()
      }
    }
  })

  test("plan 的计划产出口径收敛到 .rddf/plans/（ADR-plan-delegate-engineering-session V15）", () => {
    const edit = (config.agent.plan as any).permission.edit as Record<string, string>
    expect(edit[".rddf/plans/*.md"], "plan 应放行写 .rddf/plans/*.md").toBe("allow")
    const planMd = readFileSync(path.join(ROOT, "prompts", "plan.md"), "utf8")
    expect(planMd, "plan.md 不应再出现 .plans/ 口径").not.toContain(".plans/")
    expect(planMd, "plan.md 应写明 .rddf/plans/<slug>.md").toContain(".rddf/plans/<slug>.md")
  })

  test("plan.md 含委派实施的规则与边界句；build.md planner 行同句（V10 / V11）", () => {
    const planMd = readFileSync(path.join(ROOT, "prompts", "plan.md"), "utf8")
    for (const needle of ["plan_ref", "dispatch` 返回 ≠ 任务完成", "单槽", "委托实施 ≠ 自己实施"]) {
      expect(planMd, `plan.md 缺少「${needle}」`).toContain(needle)
    }
    const buildMd = readFileSync(path.join(ROOT, "prompts", "build.md"), "utf8")
    // build.md 有两张 planner 表（增强层 + 角色矩阵）；边界句必须在**角色矩阵**那张上
    const plannerRows = buildMd.split("\n").filter((l) => l.startsWith("| `planner` |"))
    expect(plannerRows.length, "build.md 找不到 planner 行").toBeGreaterThan(0)
    const matrixRow = plannerRows.find((l) => l.includes("起草、讨论"))
    expect(matrixRow, "build.md 找不到角色矩阵的 planner 行").toBeTruthy()
    expect(matrixRow as string, "build.md 的 planner 行缺边界句").toContain("委托实施 ≠ 自己实施")
  })

  test("context-builder 收窄为搬运工：未 hidden / 只搬运不推断 intent / 示例与模板同为 7 字段", () => {
    const cb = config.agent["context-builder"] as any
    // ① 不再 hidden（否则被过滤出父模型的「Available subagents」清单）
    expect(cb.hidden, "context-builder 不应再 hidden（实测采纳率仅 12%）").toBeFalsy()

    // ② description：声明「只搬运 / 不推断 intent」，且调用方中性
    const desc = String(cb.description ?? "")
    expect(desc, "description 未声明只搬运").toContain("只搬运")
    expect(desc, "description 未声明不推断 intent").toContain("不推断")
    expect(desc, "description 仍把调用方写死为 build agent").not.toContain("build agent")

    const cbMd = readFileSync(path.join(ROOT, "prompts", "context-builder.md"), "utf8")
    // ③ 缺 intent 的唯一行为 = ERROR 停下；模板内的「intent 可推断」授权必须消失
    expect(cbMd, "prompt 缺 ERROR: missing intent 规则").toContain("ERROR: missing intent")
    expect(cbMd, "模板内仍授权推断 intent").not.toContain("这里写你的推断")
    expect(cbMd, "仍把 focus 说成不是你的责任").not.toContain("focus 字段是 build agent 的责任")
    // 调用方中性（不应把 build agent 当唯一调用方）
    expect(cbMd, "输入段仍写死 build agent").not.toContain("你的输入（build agent 会给你什么）")

    // ④ 模板段与示例段的小节数都为 7（含 review_profile）
    const countHeadings = (text: string) => [...text.matchAll(/^## ([a-z_]+)/gm)].length
    const templateStart = cbMd.indexOf("## 输出格式")
    const templateEnd = cbMd.indexOf("## 7 字段填法详解")
    expect(templateStart, "找不到模板段").toBeGreaterThan(-1)
    expect(templateEnd, "找不到填法详解段").toBeGreaterThan(-1)
    expect(countHeadings(cbMd.slice(templateStart, templateEnd))).toBe(7)

    const exampleStart = cbMd.indexOf("**你返回**")
    expect(exampleStart, "找不到示例段").toBeGreaterThan(-1)
    const example = cbMd.slice(exampleStart, cbMd.indexOf("## 与 critic 的边界", exampleStart))
    expect(countHeadings(example)).toBe(7)
    expect(example, "示例缺 review_profile").toContain("## review_profile")
  })

  test("context-builder 的调用口径三处一致：build 专用 + 先给 intent + 可达≠有消费者", () => {
    const buildMd = readFileSync(path.join(ROOT, "prompts", "build.md"), "utf8")
    expect(buildMd, "build.md 未写明 context-builder 需要先给 intent").toContain("ERROR: missing intent")
    expect(buildMd, "build.md 未写明窄条件（大 diff）").toContain("大 diff")

    const planMd = readFileSync(path.join(ROOT, "prompts", "plan.md"), "utf8")
    expect(planMd, "plan.md 仍列出 context-builder 路径（plan 无 critic 下游）").not.toContain("context-builder")

    const designMd = readFileSync(path.join(ROOT, "docs", "MULTI-AGENT-DESIGN.md"), "utf8")
    expect(designMd, "MULTI-AGENT-DESIGN.md 未记录「可达 ≠ 有消费者」").toContain("可达 ≠ 有消费者")
    expect(designMd, "MULTI-AGENT-DESIGN.md 未记录移除 hidden 的理由").toContain("不再 `hidden`")
  })

  test("review_profile 路径映射：build.md（真源）与三份副本逐档一致（含 critic.md 兜底链）", () => {
    // 解析「档位 → 路径文本」：表格形态（`| <路径> | `profile` |`）与散文形态（`<路径> → `profile``）都支持。
    const mappingPairs = (text: string): Map<string, string> => {
      const out = new Map<string, string>()
      for (const line of text.split("\n")) {
        // 表格行：最后一格是档位
        const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
        if (cells.length >= 2 && /^`?(arch|plan|build|archive)`?$/.test(cells[cells.length - 1] as string)) {
          const p = (cells[cells.length - 1] as string).replace(/`/g, "")
          if (!out.has(p)) out.set(p, cells.slice(0, -1).join(" | "))
        }
        // 散文形态：`<路径> → `profile``（design.md）或 `<路径>（`profile`）`（critic.md）
        for (const m of line.matchAll(/([^；;]+?)(?:→|（)\s*`(arch|plan|build|archive)`/g)) {
          const p = m[2] as string
          if (!out.has(p)) out.set(p, (m[1] as string).trim())
        }
      }
      return out
    }
    const readCopyArea = (rel: string): string => {
      const text = readFileSync(path.join(ROOT, rel), "utf8")
      const head = text.indexOf("改动路径 | profile")
      const sect = text.indexOf("review_profile 路径映射")
      const from = head >= 0 ? head : sect
      return from >= 0 ? text.slice(from).split(/\n\n/)[0] ?? "" : text
    }
    const readCopy = (rel: string): Map<string, string> => {
      const text = readFileSync(path.join(ROOT, rel), "utf8")
      const head = text.indexOf("改动路径 | profile")
      const sect = text.indexOf("review_profile 路径映射")
      const from = head >= 0 ? head : sect
      const scoped = from >= 0 ? text.slice(from).split(/\n\n/)[0] ?? "" : text
      return mappingPairs(scoped)
    }
    const truth = readCopy("prompts/build.md")
    expect(truth.get("build"), "build.md 的档位表应能解析出 build 档").toBeTruthy()
    const truthTokens = (s: string): string[] => [
      ...new Set(
        [...s.matchAll(/`([^`]+)`/g)]
          .map((m) => m[1] as string)
          .flatMap((x) => x.split("|"))
          .map((x) => x.replace(/\/\*\*$/, "").trim())
          .filter((x) => /^[a-z][a-z0-9_-]*$/.test(x)),
      ),
    ]
    // 分两层：**段内**必须出现的 token（该档自己的路径集）与 **区域内**必须出现的 token
    // （散文形态下 fallback 目录集可能写在同段的另一句里）
    const TOKENS_IN_SEGMENT: Record<string, string[]> = {
      arch: ["arch_paths[]"],
      plan: ["openspec/changes", ".rddf/roadmap", ".rddf/improvements"],
      build: ["src", "include", "tests", "scripts", "tools"],
      archive: [],
    }
    const TOKENS_IN_AREA: Record<string, string[]> = {
      arch: ["docs/adr", "docs/architecture", "docs/designs", "docs/design"],
      plan: [],
      build: [],
      archive: ["delta"],
    }
    const isPointer = (text: string): boolean =>
      text.includes("prompts/build.md") && (text.includes("档位选择") || text.includes("目录集口径"))
    const COPY_LIST = ["prompts/context-builder.md", "docs/MULTI-AGENT-DESIGN.md", "prompts/critic.md"]
    for (const rel of COPY_LIST) {
      const copy = readCopy(rel)
      const area = readCopyArea(rel)
      // ⚠️ 非空断言：解析不出任何档位 ⇒ 说明该副本的映射形态被改坏了（例如把
      // critic.md 的「（`arch`）」改成半角括号）⇒ 后续 token 校验会被 `continue` 静默跳过，
      // 守卫「覆盖了它」的声明随之失真。此处必须失败而不是跳过。
      expect(copy.size, `${rel} 解析不出任何 review_profile 档位（映射形态被改坏？）`).toBeGreaterThan(0)
      for (const p of ["arch", "plan", "build"]) {
        expect(copy.get(p), `${rel} 解析不出 ${p} 档（映射形态被改坏？）`).toBeTruthy()
      }
      for (const p of Object.keys(TOKENS_IN_SEGMENT)) {
        const text = copy.get(p)
        if (!text) continue // 该副本未单列此档
        if (isPointer(text)) continue // 指针形态：集合由真源推导 ⇒ 等价
        for (const t of TOKENS_IN_SEGMENT[p] as string[]) {
          expect(text, `${rel} 的 ${p} 档映射缺少路径 token「${t}」`).toContain(t)
        }
        for (const t of TOKENS_IN_AREA[p] as string[]) {
          expect(area, `${rel} 的映射区域缺少 ${p} 档的路径 token「${t}」`).toContain(t)
        }
      }
      // 反向（仅 build 档：词表封闭可枚举）—— 副本不得多列真源没有的目录
      const copyBuild = copy.get("build")
      if (copyBuild) {
        const extra = truthTokens(copyBuild).filter((t) => !truthTokens(truth.get("build") as string).includes(t))
        expect(extra, `${rel} 的 build 档多列了真源没有的目录：${extra.join(", ")}`).toEqual([])
      }
      // 归属：副本不得自称权威映射
      const raw = readFileSync(path.join(ROOT, rel), "utf8")
      expect(raw, `${rel} 不应自称权威映射（应指向 build.md）`).not.toContain("本表是权威映射")
    }
    // 权威归属：只有 build.md 可以自称权威映射
    const buildRaw = readFileSync(path.join(ROOT, "prompts/build.md"), "utf8")
    expect(buildRaw, "build.md 应自称权威映射").toContain("本表是权威映射")
    for (const rel of COPY_LIST) {
      const raw = readFileSync(path.join(ROOT, rel), "utf8")
      expect(raw, `${rel} 应指向 prompts/build.md 的权威映射`).toContain("prompts/build.md")
      expect(
        raw.includes("档位选择") || raw.includes("目录集口径"),
        `${rel} 应指向 prompts/build.md 的「档位选择」或「目录集口径」`,
      ).toBe(true)
    }
  })

  test("accepted roots：真源（delegate-core.ts 的 PLAN_REF_ROOTS）与三份投影一致（双向）", () => {
    const roots = PLAN_REF_ROOTS.map((r) => r.label)
    expect(roots.length, "真源应声明 4 个 accepted root").toBe(4)
    for (const rel of ["prompts/plan.md", "docs/MULTI-AGENT-DESIGN.md", "docs/SUBAGENT-ORCHESTRATION.md"]) {
      const text = readFileSync(path.join(ROOT, rel), "utf8")
      // 正向：真源的根都要在投影里
      for (const r of roots) {
        expect(text, `${rel} 的 accepted roots 缺少「${r}」`).toContain(r)
      }
      // 反向：根是**闭集** —— 投影多写一个根 ⇒ agent 会照它行动而运行时拒绝
      // 只取「accepted roots：」之后的**第一句**（允许 markdown 强调夹在中间，如 `accepted roots**：`）
      const seg = (text.split(/accepted roots[*`]*[：:]/)[1] ?? "").split(/[。\n]/)[0]
      expect(seg.length, `${rel} 里找不到「accepted roots：」清单段（反向校验形同虚设）`).toBeGreaterThan(0)
      // 只把 **glob 形态**（含 `*`）的 token 当作「根」—— 普通文件路径（如 ADR 引用）不算
      const listed = [...seg.matchAll(/`([^`]+)`/g)]
        .map((m) => m[1] as string)
        .filter((t) => t.includes("*"))
        .slice(0, 8)
      for (const l of listed) {
        expect(roots, `${rel} 列了真源没有的 accepted root「${l}」`).toContain(l)
      }
    }
  })

  test("priority_blocked 字段：真源（delegate-core.ts）与 ADR / 汇总文档一致", () => {
    const core = readFileSync(path.join(ROOT, "lib", "delegate-core.ts"), "utf8")
    const fields = [...PRIORITY_BLOCKED_FIELDS]
    expect(fields.length, "字段清单应有 6 项").toBe(6)
    for (const f of fields) {
      expect(core, `真源应写入字段「${f}」`).toContain(f)
    }
    for (const rel of [
      "docs/adr/ADR-plan-delegate-engineering-session.md",
      "docs/SUBAGENT-ORCHESTRATION.md",
    ]) {
      const text = readFileSync(path.join(ROOT, rel), "utf8")
      for (const f of fields) {
        expect(text, `${rel} 的 priority_blocked 字段清单缺少「${f}」`).toContain(f)
      }
    }
  })

  test("agent 模型清单：配置（真源）与两份文档一致", () => {
    const designMd = readFileSync(path.join(ROOT, "docs", "MULTI-AGENT-DESIGN.md"), "utf8")
    const orchMd = readFileSync(path.join(ROOT, "docs", "SUBAGENT-ORCHESTRATION.md"), "utf8")
    for (const [id, agent] of Object.entries(config.agent)) {
      const model = (agent as { model?: string }).model
      if (!model) continue
      // 按**该 agent 所在行**定位（整篇 contains 会漏检「只改了其中一行」）
      for (const [label, text] of [
        ["MULTI-AGENT-DESIGN.md", designMd],
        ["SUBAGENT-ORCHESTRATION.md", orchMd],
      ] as const) {
        // 必须落在**模型表**的行上（正文里提到 agent 名的行不算；表头之前也不行）
        const lines = text.split("\n")
        const headerIdx = lines.findIndex(
          (l) => l.trim().startsWith("|") && /agent/i.test(l) && /(model|模型)/i.test(l),
        )
        expect(headerIdx, `${label} 找不到含「模型」的表头`).toBeGreaterThan(-1)
        const row = lines
          .slice(headerIdx)
          .find((l) => l.trim().startsWith("|") && (l.includes("`" + id + "`") || l.includes("**" + id + "**")))
        expect(row, `${label} 找不到 ${id} 所在的行`).toBeTruthy()
        expect(row as string, `${label} 的 ${id} 行未写模型「${model}」`).toContain(model)
      }
    }
  })

  test("汇总文档不得用编号式章节引用（§x.y 会随真源演进而漂）", () => {
    const orchMd = readFileSync(path.join(ROOT, "docs", "SUBAGENT-ORCHESTRATION.md"), "utf8")
    const numbered = [...orchMd.matchAll(/§\s*\d+(\.\d+)*/g)].map((m) => m[0] as string)
    expect(numbered, `汇总文档出现编号式章节引用（应改用标题名）：${numbered.join(", ")}`).toEqual([])
  })

  test("审查链与预算：build.md（真源）与两份投影的「角色 → 审查者 → 预算」一致", () => {
    // 投影有两种合法形态：critic 预算可以单列在「builder（架构面）」行（build.md / design.md），
    // 也可以并进 builder 行（汇总文档）—— 两种都必须给出同一组数字。
    const pick = (rel: string) => {
      const lines = readFileSync(path.join(ROOT, rel), "utf8").split("\n")
      const hi = lines.findIndex((l) => l.trim().startsWith("|") && l.includes("产出角色") && l.includes("审查者"))
      expect(hi, `${rel} 找不到「审查配对」表头`).toBeGreaterThan(-1)
      // 去首尾的 `|` 后再切，表头与数据行的列下标才对得上
      const header = lines[hi]!
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim())
      const budgetIdx = header.findIndex((c) => c.includes("预算"))
      expect(budgetIdx, `${rel} 的审查配对表缺「预算」列`).toBeGreaterThan(-1)
      const rows: Array<{ role: string; reviewers: string; budget: string }> = []
      for (const l of lines.slice(hi + 2)) {
        if (!l.trim().startsWith("|")) break
        const cells = l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
        rows.push({
          role: (cells[0] ?? "").replace(/`/g, ""),
          reviewers: (cells[1] ?? "").replace(/[*`]/g, ""),
          budget: (cells[budgetIdx] ?? "").replace(/[*`]/g, ""),
        })
      }
      return rows
    }
    // ⚠️ 数组**首位必须是真源**（build.md）—— 基准数字由它写入，其余两份与它比对
    const canonical: Record<string, string[]> = {}
    for (const rel of ["prompts/build.md", "docs/MULTI-AGENT-DESIGN.md", "docs/SUBAGENT-ORCHESTRATION.md"]) {
      const rows = pick(rel)
      const architect = rows.find((r) => r.role.startsWith("architect") && !r.role.includes("治理面"))
      const planner = rows.find((r) => r.role.startsWith("planner"))
      const builders = rows.filter((r) => r.role.startsWith("builder"))
      expect(architect, `${rel} 缺 architect 行`).toBeTruthy()
      expect(planner, `${rel} 缺 planner 行`).toBeTruthy()
      expect(builders.length, `${rel} 缺 builder 行`).toBeGreaterThan(0)
      // architect：oracle + critic
      expect((architect as any).reviewers, `${rel} 的 architect 行应含 oracle 与 critic`).toMatch(/oracle/)
      expect((architect as any).reviewers, `${rel} 的 architect 行应含 oracle 与 critic`).toMatch(/critic/)
      // planner：metis
      expect((planner as any).reviewers, `${rel} 的 planner 行应含 metis`).toMatch(/metis/)
      // builder：verifier（critic 预算可单列在「builder（架构面）」行，也可并入 builder 行）
      const builderText = builders.map((b) => `${b.reviewers} ${b.budget}`).join(" | ")
      expect(builderText, `${rel} 的 builder 行应含 verifier`).toMatch(/verifier/)
      // **预算数字跨文档一致**（只比「预算」列，不被触发条件里的数字干扰）
      const digitsOf = (s: string): string[] => [...new Set((s.match(/\d+/g) ?? []).sort())]
      const perRole = {
        architect: digitsOf((architect as any).budget),
        planner: digitsOf((planner as any).budget),
        builder: digitsOf(builders.map((b) => b.budget).join(" ")),
      }
      for (const [role, digits] of Object.entries(perRole)) {
        expect(digits.length, `${rel} 的 ${role} 预算列应有数字`).toBeGreaterThan(0)
        if (!canonical[role]) canonical[role] = digits
        else {
          expect(digits, `${rel} 的 ${role} 预算与其它文档不一致`).toEqual(canonical[role])
        }
      }
    }
  })

  test("context-builder 的 7 字段模板 == CONTRACTS.requiredSections（字段名集合）", () => {
    const cbMd = readFileSync(path.join(ROOT, "prompts", "context-builder.md"), "utf8")
    const template = cbMd.split(/^## 7 字段填法详解$/m)[0] ?? ""
    // 标题可能带尾部说明（如 `## focus（评审重点，请优先看）`）⇒ 只取标识符
    const headings = [...template.matchAll(/^## ([a-z_]+)/gm)].map((m) => m[1] as string)
    expect(new Set(headings), "context-builder 的模板字段集应等于契约字段集").toEqual(
      new Set(CONTRACTS.find((c) => c.agent === "critic")?.requiredSections ?? []),
    )
  })

  test("SUBAGENT-ORCHESTRATION.md 引用的仓库内路径都存在（索引防漂移）", () => {
    const doc = readFileSync(path.join(ROOT, "docs", "SUBAGENT-ORCHESTRATION.md"), "utf8")
    const tokens = [...doc.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string)
    const candidates = tokens.filter(
      (t) =>
        t.includes("/") &&
        !t.includes("*") &&
        !t.includes(" ") &&
        !t.includes("<") && // 占位符（如 .rddf/plans/<slug>.md）不是真实路径
        !t.includes(">") &&
        // `~`（home 目录运行时路径，如 ~/.local/share/opencode/subagent-contract.log）与
        // `/`（外部仓绝对路径，如 e2e 套件）都不在本仓内，无法守卫 —— 排除是刻意的
        !t.startsWith("~") &&
        !t.startsWith("/") &&
        !t.startsWith("packages/") && // 上游 opencode 仓的路径不在本仓
        /\.(md|ts|sh|bats|jsonc|json)$/.test(t),
    )
    expect(candidates.length, "汇总文档应引用若干仓库内文件（守卫才有意义）").toBeGreaterThan(8)
    for (const c of candidates) {
      expect(existsSync(path.join(ROOT, c)), `汇总文档引用的路径不存在：${c}`).toBe(true)
    }
  })

  test("判定词表单一真源：只在 prompts/oracle.md 定义，build.md / MULTI-AGENT-DESIGN.md 只指向它", () => {
    const oracleMd = readFileSync(path.join(ROOT, "prompts", "oracle.md"), "utf8")
    expect(oracleMd).toContain("治理面判定: PASS | BLOCK | PASS-WITH-NOTES")

    for (const rel of ["prompts/build.md", "docs/MULTI-AGENT-DESIGN.md", "docs/SUBAGENT-ORCHESTRATION.md"]) {
      const text = readFileSync(path.join(ROOT, rel), "utf8")
      expect(
        text.includes("治理面判定: PASS | BLOCK | PASS-WITH-NOTES"),
        `${rel} 仍在定义判定词表（应改为指向 prompts/oracle.md）`,
      ).toBe(false)
      expect(text, `${rel} 未指向 prompts/oracle.md`).toContain("prompts/oracle.md")
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

describe("role_class 投影守卫（ADR-backend-handoff-role-class D3 修订）", () => {
  const BUILD_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "build.md"), "utf8")

  test("ARCH_FALLBACK_DIRS == prompts/build.md 的 fallback 目录集（逐项 + 顺序）", () => {
    const line = BUILD_MD.split("\n").find((item) => item.includes("fallback 目录集") && item.includes("`docs/adr`"))
    expect(line).toBeTruthy()
    // 只取「fallback 目录集（…）」这一段里的反引号 token；过滤脚本名、去尾斜杠
    const start = line!.indexOf("fallback 目录集")
    const segment = line!.slice(start, line!.indexOf("）", start))
    const documented = [...segment.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1].replace(/\/+$/, ""))
      .filter((token) => /^[a-z][a-z0-9/_-]*$/.test(token))
      .filter((token) => !token.includes("."))
    expect(documented).toEqual([...ARCH_FALLBACK_DIRS]) // 顺序即口径：取"实际存在"的第一个优先级也依赖它
  })
})

describe("被派发后端的审查降级例外守卫（live e2e AC14 实证的 prompt 冲突）", () => {
  const BUILD_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "build.md"), "utf8")
  const lines = BUILD_MD.split("\n")

  test("例外段存在且限定为「只适用于主会话」", () => {
    const start = lines.findIndex((item) => item.includes("审查者不可用时（必须降级，不得静默跳过）"))
    const end = lines.findIndex((item) => item.includes("实测：2026-11-04"))
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const section = lines.slice(start, end).join("\n")
    expect(section).toContain("例外：被派发的后端不适用本降级")
    expect(section).toContain("HANDOFF: blocked")
    // 带 ** 匹配：裸「主会话」在正文多处出现，会让守卫失真
    expect(section).toContain("只适用于**主会话**")
    expect(section).toContain("不得完成任何收口动作")
    // 反向断言：降级规则第 1 条仍在（防止未来「升级例外」变成删掉主会话降级路径）
    expect(section).toContain("执行该角色的**内置自检清单**")
  })

  test("architect 类 Status 转换条保留「本条优先于」+ HANDOFF: blocked", () => {
    const line = lines.find((item) => item.includes("把自己本次产出的 Draft ADR 向前转"))
    expect(line).toBeTruthy()
    expect(line!).toContain("**本条优先于**")
    expect(line!).toContain("HANDOFF: blocked")
  })

  test("自查清单条目带主会话限定（不与例外段相反）", () => {
    const line = lines.find((item) => item.includes("是否执行了内置自检清单"))
    expect(line).toBeTruthy()
    expect(line!).toContain("主会话")
  })
})

describe("交回后的收尾三问（resume-precheck-guidance 投影守卫）", () => {
  const PLAN_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "plan.md"), "utf8")
  const FRONT_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "front.md"), "utf8")
  const BUILD_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "build.md"), "utf8")

  /** 去掉围栏代码块后的标题（模板里的 `### 选项 A` 不是真标题） */
  const headings = (md: string) => {
    const out: string[] = []
    let inFence = false
    for (const line of md.split("\n")) {
      if (line.trimStart().startsWith("```")) { inFence = !inFence; continue }
      if (!inFence && line.startsWith("### ")) out.push(line.slice(4).trim())
    }
    return out
  }

  /** A 小节：标题行到下一个标题（围栏外）为止 */
  const sectionOf = (md: string, title: string) => {
    const lines = md.split("\n")
    const start = lines.findIndex((l) => l === `### ${title}`)
    if (start < 0) return { body: "", rows: [] as string[] }
    const rest = lines.slice(start + 1)
    let inFence = false
    let end = rest.length
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].trimStart().startsWith("```")) { inFence = !inFence; continue }
      if (!inFence && /^#{2,3} /.test(rest[i])) { end = i; break }
    }
    const body = rest.slice(0, end)
    return { body: body.join("\n"), rows: body.filter((l) => l.trimStart().startsWith("|")) }
  }

  // 小节标题**从 plan.md 动态抽取**（plan.md 围栏外只有这一个 `###` 标题 ⇒ 它就是契约名）
  const PLAN_HEADINGS = headings(PLAN_MD)
  const TITLE = PLAN_HEADINGS[0] ?? ""
  const { body: aSection, rows: tableRows } = sectionOf(PLAN_MD, TITLE)

  const norm = (text: string) => text.replace(/\s+/g, "").replace(/[*`]/g, "")

  test("AC1：A 小节存在且是表格；**表内** feedback → last_assistant_text → outcome 下标递增", () => {
    expect(PLAN_HEADINGS).toHaveLength(1) // 围栏外唯一标题 ⇒ front.md 可按标题名引用
    expect(aSection).not.toBe("")
    // 表格：有表头 + 分隔行
    expect(tableRows.length).toBeGreaterThanOrEqual(4)
    expect(tableRows[1]).toMatch(/^\|[\s:|-]+\|$/)
    // 下标只在**表行**内计算（判据说的是「表内按序」）
    const table = tableRows.join("\n")
    const iFeedback = table.indexOf("feedback")
    const iLast = table.indexOf("last_assistant_text")
    const iOutcome = table.indexOf("outcome")
    expect(iFeedback).toBeGreaterThan(-1)
    expect(iLast).toBeGreaterThan(iFeedback)
    expect(iOutcome).toBeGreaterThan(iLast)
  })

  test("AC2：含「outcome=succeeded + state=idle 不等于完成」断言句", () => {
    expect(aSection).toContain("outcome=succeeded")
    expect(aSection).toContain("state=idle")
    expect(aSection).toContain("不等于完成")
  })

  test("AC3：三条 resume 禁令齐全（扩 scope / 改 role_class / 存量条目重派）+ 可续接的正向条件", () => {
    expect(aSection).toContain("不得用 resume 扩")
    expect(aSection).toContain("不得显式声明不同的")
    expect(aSection).toContain("role_class")
    expect(aSection).toContain("一律重派、不复用")
    // 正向条件（与「切换是四步」区分开）
    expect(aSection).toContain("可续接的正向条件")
    expect(aSection).toContain("不需要也不应先")
  })

  test("AC4：增量记账（last_feedback_id / created_at）+ rddf 写不进时的文本兜底 + 记账缺失时的降级", () => {
    expect(aSection).toContain("last_feedback_id")
    expect(aSection).toContain("created_at")
    expect(aSection).toContain("写不进")
    expect(aSection).toContain("文本 5 项正文")
    // 派发时刻/记账缺失 ⇒ 退到 ②，不得凭猜测取条目
    expect(aSection).toContain("不得凭猜测取条目")
  })

  test("AC5：front.md 按**标题名**引用；plan.md 硬规则 #5 与 front.md §3.3 的旧正文已消失", () => {
    expect(FRONT_MD).toContain(TITLE)
    const refLine = FRONT_MD.split("\n").find((l) => l.includes(TITLE))!
    expect(refLine).not.toMatch(/§\d/)
    // 旧重复正文已消失
    expect(PLAN_MD).not.toContain("按交接 5 项模板的第 **③** 项（需要什么决策）分流")
    expect(FRONT_MD).not.toContain("按 kind 分流：改计划 / 换类重派 / 交用户")
    // plan.md 硬规则 #5 已改为引用
    expect(PLAN_MD).toContain(`走下方「${TITLE}」小节`)
  })

  test("AC6：5 项模板字段名与 prompts/build.md 的 ①–⑤ 动态对照，且**顺序一致**", () => {
    const line = BUILD_MD.split("\n").find((l) => l.includes("5 项缺一即无效"))!
    expect(line).toBeTruthy()
    // 恰好 5 项（build.md 扩到 ⑥ 时必须变红，不能被 slice 截断吞掉）
    expect([...line.matchAll(/[①②③④⑤⑥⑦]/g)].map((m) => m[0])).toEqual(["①", "②", "③", "④", "⑤"])
    const labels = (text: string) =>
      text
        .split(/[①②③④⑤]/)
        .slice(1, 6)
        .map((part) => norm(part.split(/[（(；;：:]/)[0]).replace(/[。、,，]+$/, ""))
    const fromBuild = labels(line)
    expect(fromBuild).toHaveLength(5)
    for (const label of fromBuild) {
      expect(label.length).toBeGreaterThan(0)
      expect(norm(aSection)).toContain(norm(label))
    }
    // plan.md 自己的 ①–⑤ 顺序必须与 build.md 一致（编号有语义：③ = 需要什么决策）
    const planLine = aSection.split("\n").find((l) => l.includes("缺一即无效"))!
    expect(labels(planLine)).toEqual(fromBuild)
  })

  test("AC7：负向 —— 无 handoff_pending / set_class / 正则 / 门禁 / 通知；无新标识符（含大写）", () => {
    for (const forbidden of ["handoff_pending", "set_class", "正则", "门禁", "通知"]) {
      expect(aSection).not.toContain(forbidden)
    }
    // 反引号里的标识符必须都在已知集合内（新增工具名 / 状态名会在这里被挡）。
    // ⚠ 边界：本守卫只覆盖**反引号 token** + 上面 5 个明文禁用项；写成纯文本的新标识符不在覆盖范围内。
    const known = new Set([
      "delegate", "dispatch", "sessions", "suspend", "cancel", // 五个委托工具
      "rddf", "feedback", "list", // 只读通道
      "kind", "scope", "role_class", "resume", "resume_session", "session",
      "last_assistant_text", "last_feedback_id", "created_at", "outcome", "state",
      "idle", "running", "succeeded", "slot", "pair", "json", "file", "line",
      "task", "plan", "ac", "tasks", "proposal",
      "true", "false", // 布尔字面量（非标识符）
      "subagent", // 既有概念（不是新工具）
      "HANDOFF", // 既有契约标记
    ])
    const tokens = [...aSection.matchAll(/`([^`]+)`/g)]
      .flatMap((m) => m[1].split(/[^A-Za-z0-9_]+/))
      .filter((t) => /^[A-Za-z][A-Za-z0-9_]*$/.test(t))
    for (const token of new Set(tokens)) {
      expect(known).toContain(token)
    }
  })

  test("AC8：未新增状态字段 / outcome 值（SLOT_STATES 与 front.md 记录的 outcome 集合不变）", () => {
    expect([...SLOT_STATES]).toEqual(["dispatching", "active", "idle", "suspended", "tombstone"])
    // outcome 值集合从 front.md §3.3 的说明行**动态抽取**
    const outcomeLine = FRONT_MD.split("\n").find((l) => l.trimStart().startsWith("- `outcome`"))!
    const knownOutcomes = new Set([...outcomeLine.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]))
    expect(knownOutcomes.size).toBeGreaterThan(0)
    const used = [...aSection.matchAll(/(?:outcome|state)\s*=\s*`?([a-z_]+)/g)].map((m) => m[1])
    for (const value of used) {
      expect([...knownOutcomes, ...SLOT_STATES]).toContain(value)
    }
  })
})
