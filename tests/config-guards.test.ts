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
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
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
import { dispatchToolDefinition } from "../lib/delegate-async.ts"
import {
  ARCH_FALLBACK_DIRS,
  DELEGATE_RESULT_CRITICAL_FIELDS,
  DELEGATE_RESULT_FIELDS,
  buildBrief,
  capabilityBlock,
  delegateToolDefinition,
  validateBrief,
  PLAN_REF_ROOTS,
  PRIORITY_BLOCKED_FIELDS,
  SLOT_STATES,
  planRefRootsBlock,
  verifierWriteSetBlock,
} from "../lib/delegate-core.ts"

/**
 * 「已关闭 improvement」判定（**单一实现**，AC20 与 AC14 共用；不得各写一份）。
 *
 * 两种形态，机械可核程度不同：
 *   ① 状态行含 `已完成|已关闭|已归档` ⇒ **语义式关闭**（不可机械核 —— 伪造关闭属故意行为，
 *      超出漂移威胁模型，归 `rdd-doctor` / 流程评审）；
 *   ② `已立项` + 头部有 `openspec/changes/archive/<name>/` ⇒ **核该目录真存在**；
 *      不存在时只有**状态行本身**声明是外仓才豁免（live 消费者：
 *      `.rddf/improvements/rdd-verifier-state-consolidation.md` —— 状态行写「产品侧 rdd-workflow 仓」，
 *      archive 目录在产品仓、本地不存在）。
 */
function isClosedImprovement(head: string): boolean {
  const line = head.split("\n").find((l) => /^\s*>\s*\*\*(实施状态|状态)\*\*/.test(l)) ?? ""
  if (/已完成|已关闭|已归档/.test(line)) return true
  if (!/已立项/.test(line)) return false
  const m = head.match(/openspec\/changes\/archive\/([^/\s`)\]，。]+)/)
  if (!m) return false
  const localDir = path.join(import.meta.dir, "..", "openspec", "changes", "archive", m[1] as string)
  if (existsSync(localDir)) return true
  return /产品侧|外仓|其它仓|rdd-workflow/.test(line) // `rdd-workflow-e2e` 被 `rdd-workflow` 子串覆盖，不必并列
}

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

  /**
   * 只读 subagent 的**输出节数与名单**：`prompts/<agent>.md` 的 Output 段（真源）
   * ⇒ 三处投影（prompt 自述 / `build.md` 的返回结构表 / `MULTI-AGENT-DESIGN.md` 的卡片）
   * **有序全等**。
   *
   * ⚠ **为什么要有这条**：2026-11-15 实测发现 `explore` 的节数在**三处**都写成了「四」
   * （`explore.md:41` / `build.md:61` / design 卡片），而它实际只有 **3** 个 `###`
   * ⇒ 「一处错 ⇒ 三处手抄 ⇒ 三处都错」，且**没有任何守卫会发现**。
   *
   * ⚠ **数字必须派生**：节数一律从 `headings.length` 现算（prompt 自述里写的是**中文数字**
   * ⇒ 用 `cnNum()` 转，不手抄映射表）⇒ 增删小节时守卫会红，而不是让人去改三处数字。
   */
  /**
   * **async 四个工具的 description 形态约束**（派生的必要条件）。
   *
   * ⚠ **为什么**：2026-11-15 实测发现 `delegate-async.ts` 的 4 个工具 description **全部手抄**：
   *   - `dispatch` 的「必填/选填」清单（12 个参数名）—— 手抄 ⇒ 参数增减必漂；
   *   - `sessions` 的「返回：overall / headline / items」—— 与 delegate 的返回契约**不是一回事**，
   *     但两者在同一仓里 ⇒ 极可能被互相抄。
   * ⇒ 形态约束：description 表达式段内**不得出现** `DELEGATE_RESULT_*` 字段名或**参数名**的字面量
   *   （⇒ 「改回手抄」当场红）。
   */
  test("async 四个工具的 description：不得手抄返回字段名 / 参数名（形态约束）", () => {
    const asyncSrc = readFileSync(path.join(ROOT, "lib", "delegate-async.ts"), "utf8")
    const tools = ["dispatchToolDefinition", "sessionsToolDefinition", "suspendToolDefinition", "cancelToolDefinition"]
    for (const fn of tools) {
      const start = asyncSrc.indexOf(`export function ${fn}`)
      expect(start, `找不到 ${fn}`).toBeGreaterThan(-1)
      const seg = asyncSrc.slice(start, start + 6000)
      // ⚠ 必须从 `return {` **之后**找 `description:` —— properties 里每个参数也有 description:
      const retAt = seg.indexOf("return {")
      const dStart = seg.indexOf("description:", retAt >= 0 ? retAt : 0)
      const dEnd = seg.indexOf("input:", dStart)
      const descSeg = dStart >= 0 && dEnd > dStart ? seg.slice(dStart, dEnd) : ""
      expect(descSeg.length, `定位不到 ${fn} 的 description 表达式（函数被重构？请更新本判据）`).toBeGreaterThan(0)

      // ① 不得含 delegate 返回契约的字段名（防跨契约抄清单）
      const fields = DELEGATE_RESULT_FIELDS as readonly string[]
      const copied = fields.filter((f) => new RegExp(`["'\`]${f}["'\`]`).test(descSeg))
      expect(copied, `${fn} 的 description 里出现了 delegate 返回契约的字段名（应改为派生）：${copied.join(", ")}`).toEqual([])

      // ② 不得含**参数名**字面量（防手抄必填/选填清单）—— 只对有参数的工具判
      if (fn === "dispatchToolDefinition") {
        const props = dispatchToolDefinition({} as any).input?.properties ?? {}
        const names = Object.keys(props)
        const hardcoded = names.filter((n) => new RegExp(`["'\`]${n}["'\`]`).test(descSeg))
        expect(hardcoded, `dispatch 的 description 里出现硬编码参数名（应改为从 schema 派生）：${hardcoded.join(", ")}`).toEqual([])
        // 且必须真的调用了派生
        expect(descSeg, "dispatch 的 description 必须从 requiredNames / optionalNames 派生").toMatch(/requiredNames|optionalNames/)
      }
    }
  })

  /**
   * **新增文件闸门** —— 「增量门」里**唯一可机械**的那一半。
   *
   * ⚠ **边界（必须如实说）**：本判据只覆盖「**新增了文件**」；
   * 「在**已有**文件里新增了一条陈述」**不可机械识别** ⇒ 属 review 流程，不是测试能解决的
   * （本仓无 CI、无生效的 git hook ⇒ 「沉默 = 违规」今日只能靠跑 `bun test` 时生效）。
   *
   * ⇒ 新增一个投影面时，**逼一次决定**：建守卫 / 登记为已知盲区 / 明确排除。
   */
  test("新增文件闸门：`prompts/` `docs/` `lib/` 的文件集合 == 清单（多一个 ⇒ 必须做一次决定）", () => {
    const EXPECTED: Record<string, string[]> = {
      prompts: [
        "build.md", "plan.md", "front.md", "explore.md", "librarian.md", "oracle.md", "metis.md",
        "general.md", "critic.md", "context-builder.md",
      ],
      docs: [
        "MULTI-AGENT-DESIGN.md", "CHANGELOG.md", "SUBAGENT-ORCHESTRATION.md",
        "guard-authoring.md", "test-authoring.md",
        "backend-handoff-role-class.md", "front-delegate-architecture.md",
        "front-delegate-testing.md", "front-delegate-usage.md", "dual-session-delegation.md",
        "model-fallback-usage.md", "review-automation-backlog.md", "rdd-workflow-product-issues.md",
      ],
      lib: ["delegate-core.ts", "delegate-async.ts", "model-fallback-core.ts", "subagent-contract-core.ts"],
    }
    for (const [dir, expected] of Object.entries(EXPECTED)) {
      // ⚠ **已知边界（fail-closed 的反面，必须如实登记）**：`readdirSync` 是**平铺**的 ⇒
      //   **子目录整树被过滤** —— 新建 `docs/<任意子目录>/foo.md` **不会**被本闸命中。
      //   而 `docs/adr/` 恰是 arch 文档的高危面 ⇒ **子目录形态是本闸的盲区**。
      //   ⇒ 补法（本批不做，进 backlog）：递归枚举 + 对子目录单独登记。
      const actual = readdirSync(path.join(ROOT, dir)).filter((f) => {
        // 只看**真投影面**：排除备份 / 陈旧副本 / 非内容文件
        if (f.endsWith(".bak") || f.endsWith(".backup") || f.includes(".bak-")) return false
        if (!/\.(md|ts)$/.test(f)) return false
        return true
      }).sort()
      const missing = actual.filter((f) => !expected.includes(f))
      const gone = expected.filter((f) => !actual.includes(f))
      expect(missing, `${dir}/ 新增了文件但没进清单 —— 必须做一次决定（建守卫 / 登记已知盲区 / 明确排除）：${missing.join(", ")}`).toEqual([])
      expect(gone, `${dir}/ 清单里的文件不存在了（删了还是改名？）—— 同步清单：${gone.join(", ")}`).toEqual([])
    }
  })

  test("只读 subagent 的输出节数与名单：prompt 自述 / build.md / design 卡片 三处有序全等", () => {
    const buildMd = readFileSync(path.join(ROOT, "prompts", "build.md"), "utf8")
    const designMd = readFileSync(path.join(ROOT, "docs", "MULTI-AGENT-DESIGN.md"), "utf8")

    /** 阿拉伯数字 → 中文数字（1..10）—— 供 prompt 自述里的「N 个固定小节」比对。
     *  ⚠ >10 节 ⇒ 落 `String(n)` ⇒ 与自述里的中文数字不等 ⇒ **本守卫按红处理**（fail-closed）：
     *    届时需扩展本函数，而不是放宽判据。 */
    const cnNum = (n: number): string => ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][n] ?? String(n)
    const splitList = (raw: string) => raw.split("/").map((x) => x.trim()).filter(Boolean)

    // ⚠ `critic` **不在此列**：它没有 `## Output` 段（输出契约是「4 段式」而非 `###` 小节）⇒
    //   形态不同，本守卫的解析形态不适用 ⇒ **如实登记为未守卫面**（不是「它不需要」）。
    for (const agent of ["explore", "librarian", "oracle", "general"]) {
      const promptMd = readFileSync(path.join(ROOT, "prompts", `${agent}.md`), "utf8")
      const outM = promptMd.match(/^## Output\s*$/m)
      expect(outM, `prompts/${agent}.md 缺 ## Output 段`).toBeTruthy()
      const outputSection = promptMd.slice((outM as RegExpMatchArray).index).split(/^## /m).slice(1).join("\n## ")
      const headings = [...outputSection.matchAll(/^### (.+)$/gm)].map((m) => (m[1] as string).trim())
      expect(headings.length, `prompts/${agent}.md 的 Output 段应有小节`).toBeGreaterThan(0)

      // ① prompt 自述：「Markdown，N 个固定小节，顺序不变：」
      const selfLine = outputSection.split("\n").find((l) => /固定小节/.test(l)) ?? ""
      const cn = /Markdown，(.?)个固定小节/.exec(selfLine)?.[1] ?? ""
      expect(cn, `prompts/${agent}.md 的 Output 段自述节数缺失或格式变了：「${selfLine.trim()}」`).toBe(cnNum(headings.length))

      // ② build.md 的返回结构表行：「Markdown N 节：名1 / 名2 / …」
      //    ⚠ **逐项适用性**：build.md 的那张表是 **subagent 返回结构表** ⇒ 只含 subagent。
      //      `general` 是主会话 agent（不在该表里）⇒ 这一处对它**不适用** ——
      //      显式跳过（**不是「假装通过」**），其余三处（自述 / 卡片 / 文件树）照判。
      //    「适用」的判据 = **该行含「Markdown N 节：」**（subagent 返回结构表的形态）；
      //    不含 ⇒ 这一处投影对它**不适用**（`general` 是主会话 agent，它在 build.md 里出现
      //    于**别的表**）⇒ 显式记「不适用」，**不是「假装通过」**。
      const row = buildMd.split("\n").find((l) => l.startsWith("| `" + agent + "` |"))
      const rowM = row ? /Markdown (\d+) 节：([^|]+)/.exec(row) : null
      if (!rowM) {
        expect(
          agent,
          `build.md 里 ${agent} 的行**不含**「Markdown N 节：」—— 若它**是** subagent 则本守卫漏了它；` +
            `若不是（如 general 是主会话 agent）则这一处投影对它**不适用**，属预期`,
        ).toBe("general")
      } else {
        expect(Number(rowM[1]), `build.md 的 ${agent} 行节数与实际不符`).toBe(headings.length)
        expect(splitList(rowM[2]), `build.md 的 ${agent} 名单与 ${agent}.md 不一致（含顺序）`).toEqual(headings)
      }

      // ③ design 卡片：「Markdown N节（名1 / 名2 / …）」
      const cardM = new RegExp("^#### `" + agent + "`.*$", "m").exec(designMd)
      expect(cardM, `MULTI-AGENT-DESIGN.md 缺 ${agent} 卡片`).toBeTruthy()
      const card = designMd.slice((cardM as RegExpMatchArray).index).split(/^#### /m).slice(1).join("\n#### ")
      const cardOut = /Markdown (.+?)节（([^）]+)）/.exec(card)
      expect(cardOut, `design 的 ${agent} 卡片里找不到「Markdown N节（…）」`).toBeTruthy()
      expect(cnNum(headings.length), `design 的 ${agent} 卡片节数与实际不符`).toBe(cardOut![1])
      expect(splitList(cardOut![2] as string), `design 的 ${agent} 卡片名单与 ${agent}.md 不一致（含顺序）`).toEqual(headings)

      // ④ **文件树行**（第四处投影）：`│   ├── <agent>.md   # （Markdown N节输出）`
      const treeLine = designMd.split("\n").find((l) => l.includes(`├── ${agent}.md`) || l.includes(`└── ${agent}.md`))
      expect(treeLine, `design 的文件树里找不到 ${agent}.md 行`).toBeTruthy()
      const treeOut = /（Markdown (.+?)节输出）/.exec(treeLine as string)
      expect(treeOut, `design 文件树的 ${agent}.md 行里找不到「（Markdown N节输出）」`).toBeTruthy()
      expect(cnNum(headings.length), `design 文件树的 ${agent}.md 行节数与实际不符`).toBe(treeOut![1])
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
    // ⚠ 口径检查只看**散文**：机读块（capability:*）是配置的**逐字投影**，
    //    其中的 `.plans/*.md` 是配置里保留的 legacy **放行项**（不是计划产出口径）⇒ 不算违规。
    const stripMachineBlocks = (md: string) => md.replace(/<!-- capability:[a-z]+\n[\s\S]*?-->\n?/g, "")
    expect(stripMachineBlocks(planMd), "plan.md 不应再出现 .plans/ 口径").not.toContain(".plans/")
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

  test("accepted roots：真源（delegate-core.ts 的 PLAN_REF_ROOTS）与三份投影的**机读块**逐字一致（闭集）", () => {
    // v2.26：从「句子解析 + glob 形态过滤」升级为**逐字机读块**（与 verifier 写集同一范式）。
    // 旧实现的反向校验靠「取 `accepted roots：` 后第一句 + 抓反引号里含 `*` 的 token」——
    // 是**句子解析**，换句式即失效（本仓 2026-11-15 已在 verifier 写集那一族修过同款）。
    const roots = PLAN_REF_ROOTS.map((r) => r.label)
    expect(roots.length, "真源应声明 4 个 accepted root").toBe(4)
    const canonical = planRefRootsBlock()
    for (const rel of ["prompts/plan.md", "docs/MULTI-AGENT-DESIGN.md", "docs/SUBAGENT-ORCHESTRATION.md"]) {
      const text = readFileSync(path.join(ROOT, rel), "utf8")
      // ① 逐字块（**闭集**的机器判据；多/少/改一个字符 ⇒ 红）
      expect(text.includes(canonical), `${rel} 缺少或偏离 accepted-roots 规范块`).toBe(true)
      expect(text.split(canonical).length - 1, `${rel} 的规范块应恰好出现 1 次`).toBe(1)
      // ② 正向覆盖：真源的根仍要在**散文**里出现（agent 读的是散文）
      for (const r of roots) {
        expect(text, `${rel} 的 accepted roots 缺少「${r}」`).toContain(r)
      }
      // ③ **反向闭集（行级）**：散文的 accepted-roots 枚举不得出现真源之外的根 ——
      //    否则 agent 照散文行动而被 `validatePlanRef` 运行时拒绝（假承诺）。
      //    ⚠ 定位方式**不是**自由句子解析：找**每一行**含 `accepted roots` 的行（结构锚），
      //    只抓该行反引号里含 `*` 的 token（根形态）。
      //    ⚠ 必须遍历**所有**这样的行，不能只取第一处：`docs/SUBAGENT-ORCHESTRATION.md` 的第 5 行是
      //      「机器消费的值」的**类属提及**（无 glob token ⇒ 空转），真正的**枚举**在第 112 行 ——
      //      只取首个匹配会让该文件的 ③ 恒平凡满足（critic 抓到的静默空转）。
      //    ⚠ 锚的是**枚举形态**（`accepted roots：` 带冒号），不是**任意提及**：
      //      `MULTI-AGENT-DESIGN.md` 的 v2.17 订正行写着「`.plans/*.md` 的放行保留，但不再是口径，
      //      也**不在** accepted roots 内」——它含 `accepted roots` 字样**且含 glob**，但那是**排除**语境；
      //      按「任意提及」锚会把它误判成「列了真源没有的根」。
      // ⚠ 已知边界：**拆到下一行**的枚举（续行不含冒号形态）仍会漏（fail-closed 方向，登记备查）。
      const anchorLines = text.split("\n").filter((l) => /accepted roots[*`]*[：:]/.test(l))
      expect(anchorLines.length, `${rel} 找不到「accepted roots：」枚举行`).toBeGreaterThan(0)
      for (const anchorLine of anchorLines) {
        const listed = [...anchorLine.matchAll(/`([^`]+)`/g)]
          .map((m) => m[1] as string)
          .filter((t) => t.includes("*"))
        for (const l of listed) {
          expect(roots, `${rel} 的散文枚举列了真源没有的 accepted root「${l}」`).toContain(l)
        }
      }
    }
  })

  test("AC20-辅助：isClosedImprovement 的**外仓关闭分支**有 live 消费者（不是死代码）", () => {
    // v2.25 教训：判据分支可能是死代码（「分支存在 ≠ 分支生效」）⇒ 每个分支都要有**对应**证据。
    // B-2 分支（目录不存在 + 状态行声明外仓 ⇒ 豁免）的 live 消费者：
    //   `.rddf/improvements/rdd-verifier-state-consolidation.md`（关闭在产品仓）
    const p = path.join(import.meta.dir, "..", ".rddf", "improvements", "rdd-verifier-state-consolidation.md")
    expect(existsSync(p), "live 消费者文件不存在 ⇒ B-2 分支需重新取证").toBe(true)
    const head = readFileSync(p, "utf8").split("\n").slice(0, 15).join("\n")
    expect(isClosedImprovement(head), "该文件应被判为已关闭（外仓关闭形态）").toBe(true)
    // 且它的归档目录**确实不在本仓**（否则走的是 B-1 而非 B-2）
    const m = head.match(/openspec\/changes\/archive\/([^/\s`)\]，。]+)/)!
    expect(m, "该文件头部应含归档指针").toBeTruthy()
    expect(
      existsSync(path.join(import.meta.dir, "..", "openspec", "changes", "archive", m[1] as string)),
      "该目录若存在于本仓则走 B-1 ⇒ 本用例不再覆盖 B-2",
    ).toBe(false)
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

  // ── delegated-verifier-evidence-gap（扩展同一 describe，不新建第二份守同一段的守卫）──

  /** 例外段（逐类 bullet）与「取证不可用」段的切片 */
  const exceptionSection = () => {
    const start = lines.findIndex((item) => item.includes("审查者不可用时（必须降级，不得静默跳过）"))
    const end = lines.findIndex((item) => item.includes("实测：2026-11-04"))
    return lines.slice(start, end).join("\n")
  }
  const evidenceSection = () => {
    const start = lines.findIndex((item) => item.includes("**取证不可用 ⇒ 交回**"))
    if (start < 0) return ""
    const rest = lines.slice(start)
    let inFence = false
    let end = rest.length
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].trimStart().startsWith("```")) { inFence = !inFence; continue }
      if (!inFence && /^- \*\*三处落点/.test(rest[i])) { end = i; break }
    }
    return rest.slice(0, end).join("\n")
  }

  test("AC1：取证不可用段含三段文本（定义 / pass-失败分档 / kind 优先级）+ 负向边界形态", () => {
    const sec = evidenceSection()
    expect(sec).not.toBe("")
    // ① 定义句：基线对照
    expect(sec).toContain("取证**不可用**")
    expect(sec).toContain("基线对照")
    expect(sec).toContain("merge-base")
    expect(sec).toContain("不可解析")
    // ② 分档：pass 全量 / 失败单条
    expect(sec).toContain("pass 结论必须全量取证")
    expect(sec).toContain("失败结论只需单条带证据的不通过")
    // ③ kind 优先级两条
    expect(sec).toContain("ac-fail")
    expect(sec).toContain("`blocked`")
    // 边界：零用例 / 超时 / 重试 1 次 / 判据来源为空 / skill 不可加载
    expect(sec).toContain("未执行任何用例")
    expect(sec).toContain("超时")
    expect(sec).toContain("至多重试 1 次")
    expect(sec).toContain("判据来源为空")
    expect(sec).toContain("不可加载")
    // 负向：「取证不可用」与「blocked」之间不得出现 ⇒ / 则（禁无条件蕴含）
    expect(sec).not.toMatch(/取证不可用[^\n]{0,12}(⇒|则)[^\n]{0,12}blocked/)
    // 负向：也不得用「等同」等其它等价措辞绕过（只禁 ⇒/则 会漏）
    expect(sec).not.toMatch(/取证不可用[^\n]{0,12}(等同|意味着|即为)[^\n]{0,12}blocked/)
  })

  test("AC2：例外段逐类独立 bullet（受例 bullet 内类名与 HANDOFF: blocked 同行；类名至多一条受例 bullet）", () => {
    const sec = exceptionSection()
    const bullets = sec.split("\n").filter((l) => l.trimStart().startsWith("> - "))
    const ruled = bullets.filter((l) => l.includes("HANDOFF: blocked"))
    expect(ruled.length).toBeGreaterThanOrEqual(2) // architect + builder（架构面）
    for (const b of ruled) {
      expect(b).toMatch(/`(architect|builder)`/)
    }
    // 每个类名至多出现在一条**受例** bullet（按 bullet 的**首个类名**计 —— 行内提及别的类不算）
    for (const cls of ["architect", "builder", "verifier"]) {
      const hits = ruled.filter((l) => l.trimStart().startsWith("> - `" + cls + "`"))
      expect(hits.length).toBeLessThanOrEqual(1)
    }
    // 逐类后果的定义处（指针）+ 不受阻的两类
    expect(sec).toContain("逐类后果")
    expect(sec).toContain("只在")
    expect(bullets.some((l) => l.includes("`verifier`") && l.includes("不因 `subagent` 不可用而受阻"))).toBe(true)
    // 负向：explore 不得与 blocked 同行
    expect(sec).not.toMatch(/explore[^\n]*HANDOFF: blocked/)
    expect(sec).not.toMatch(/HANDOFF: blocked[^\n]*explore/)
    // 负向：受例 bullet 行内**顺带**提别的类名 ⇒ 计数按**首个类名**（行内提及不参与）——
    // 若实现者改成「按行内任意出现计数」，architect 会因 builder bullet 里的提���而被误判
    for (const b of ruled) {
      const lead = b.trimStart().match(/^> - `(architect|builder|verifier)`/)?.[1]
      expect(lead).toBeTruthy()
    }
    // 「判定类」carve-out：不得改回「审稿报告」（否则与受阻记录义务直接矛盾）
    expect(sec).toContain("判定类")
    expect(sec).not.toMatch(/不得落审稿报告/)
    // 「逐类后果」的**定义处**（运行身份段）也须存在 —— 例外段只做指针
    const identityIdx = lines.findIndex((l) => l.startsWith("#### 被派发后端的运行身份与交回契约"))
    expect(identityIdx).toBeGreaterThan(-1)
    const identity = lines.slice(identityIdx).join("\n")
    const defLine = identity.split("\n").find((l) => l.includes("逐类后果（被派发后端）"))!
    expect(defLine).toContain("architect")
    expect(defLine).toContain("builder")
    expect(defLine).toContain("HANDOFF: blocked")
  })

  test("AC3：HANDOFF 允许 kind 集合 == {needs-revision, ac-fail, blocked}（从 §HANDOFF 契约动态抽取）", () => {
    const start = lines.findIndex((l) => l.includes("#### HANDOFF：交回主会话的凭据化契约"))
    expect(start).toBeGreaterThan(-1)
    const rest = lines.slice(start + 1)
    const end = rest.findIndex((l) => /^#### /.test(l))
    const section = rest.slice(0, end < 0 ? rest.length : end).join("\n")
    // kind 集合取自「kind 只用既有三类：…」那句（`--kind <kind>` 是占位符，不是值域）
    const kindLine = section.split("\n").find((l) => l.includes("kind 只用既有三类"))!
    const kinds = new Set([...kindLine.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]))
    expect([...kinds].sort()).toEqual(["ac-fail", "blocked", "needs-revision"])
  })

  test("AC4/AC5：负向（explore×blocked）+ 未新增（token allowlist / SLOT_STATES / outcome 集合）", () => {
    const sec = exceptionSection()
    expect(sec).not.toMatch(/explore[^\n]*HANDOFF: blocked/)
    expect(sec).not.toMatch(/HANDOFF: blocked[^\n]*explore/)
    // 未新增：SlotState 枚举不变
    expect([...SLOT_STATES]).toEqual(["dispatching", "active", "idle", "suspended", "tombstone"])
  })

  // ⚠ 描述已随 `delegate-base-channel` 更新：缺 `<base>` 现在是**派发即被拒**（不再等到后端才 blocked）。
  //   判据面（三个 toContain/toMatch）**未变** —— 仍要求写明 `<base>` / 必须声明 / blocked 语义。
  test("plan.md 的 verifier 派发要求含「必须声明可解析 <base>」（缺它 ⇒ 派发即被拒；不再等到后端 blocked）", () => {
    const PLAN = readFileSync(path.join(import.meta.dir, "..", "prompts", "plan.md"), "utf8")
    const row = PLAN.split("\n").find((l) => l.includes("`verifier`") && l.includes(".rddf/state/verifier"))!
    expect(row).toContain("`<base>`")
    expect(row).toMatch(/必须声明/)
    expect(row).toContain("blocked")
  })

  test("AC6：文本锚点齐（基线 / 任一判据 / 不产出判定 / 阻塞类型：）+ 防回归句仍在", () => {
    const sec = evidenceSection()
    expect(sec).toContain("基线")
    expect(sec).toContain("任一判据")
    expect(sec).toContain("不产出判定")
    expect(sec).toContain("阻塞类型：")
    // 受阻记录四要素（落点 / 自落 / 权威序 / 轮次聚合）
    expect(sec).toContain(".rddf/reviews/<change>-verify-blocked.md")
    expect(sec).toContain("verifier 自己")
    expect(sec).toContain("以 `-verify.md` 为准")
    expect(sec).toContain("取较大值")
    // 失败签名分类（oracle BLOCK 的闭合点）
    expect(sec).toContain("判失败形态")
    expect(sec).toContain("判据信号")
    expect(sec).toContain("环境信号")
    expect(sec).toContain("collection error")
    // 防回归：既有「0 工具调用就判 pass = 假阳性，判定作废」句与报告落点句**仍在**
    const build = lines.join("\n")
    expect(build).toContain("0 工具调用就判 pass")
    expect(build).toContain("判定作废")
    expect(build).toContain("报告落点")
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

describe("能力面判据对齐（role-class-rubric-alignment 投影守卫）", () => {
  // ⚠ 覆盖边界（必须与 proposal 的风险行一致，不得宣称完备）：
  //   ① 本守卫钉的是**结构**（表行数 / 关键 token / 出现次数 / 段落结构），**不是路径全集** ——
  //      `archRoots` 是运行期按工程根算的（`lib/delegate-core.ts::archRoots`），prompt 只能写
  //      抽象名「架构文档目录」⇒ 路径级一致性由 lib 侧单测负责（`tests/delegate-core.test.ts`）。
  //   ② 反引号标识符白名单只覆盖**带反引号的** token + 显式禁用词；纯文本写出的新标识符不在覆盖内。
  //   ③ 关键词断言不是语义断言：文本改写后若仍含同样的 token，守卫不会红（结构类断言已尽量避开这一点）。

  const PLAN_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "plan.md"), "utf8")
  const FRONT_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "front.md"), "utf8")
  const BUILD_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "build.md"), "utf8")

  /** 锚点之后的表格行（到第一个非表格行为止） */
  const tableAfter = (md: string, anchor: string) => {
    const lines = md.split("\n")
    const start = lines.findIndex((l) => l.includes(anchor))
    if (start < 0) return [] as string[]
    const rows: string[] = []
    for (const line of lines.slice(start + 1)) {
      // 锚点与表格之间可能有空行或引用块（build.md 的运行身份表前有一段提示）
      if (line.trim() === "" || line.trimStart().startsWith(">")) continue
      if (!line.trimStart().startsWith("|")) break
      rows.push(line)
    }
    return rows
  }

  /** 某标题（`####` 级）之后的小节正文 */
  const sectionAfter = (md: string, heading: string) => {
    const lines = md.split("\n")
    const start = lines.findIndex((l) => l.trimStart().startsWith(heading))
    if (start < 0) return ""
    const rest = lines.slice(start + 1)
    let inFence = false
    let end = rest.length
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].trimStart().startsWith("```")) { inFence = !inFence; continue }
      if (!inFence && /^#{1,4} /.test(rest[i])) { end = i; break }
    }
    return rest.slice(0, end).join("\n")
  }

  const PLAN_TABLE = tableAfter(PLAN_MD, "选类：本次派发是哪一个角色类的工作")
  const BUILD_TABLE = tableAfter(BUILD_MD, "它决定本次允许写什么")
  const FLOW_SECTION = sectionAfter(PLAN_MD, "#### 架构内容分流")

  test("AC1：两份完整表的 builder 行一致（都含「减去架构文档目录」）且三行齐", () => {
    for (const rows of [PLAN_TABLE, BUILD_TABLE]) {
      expect(rows.length).toBeGreaterThanOrEqual(3)
      const builder = rows.find((l) => l.includes("`builder`"))!
      const architect = rows.find((l) => l.includes("`architect`"))!
      const verifier = rows.find((l) => l.includes("`verifier`"))!
      expect(builder).toBeTruthy()
      expect(architect).toBeTruthy()
      expect(verifier).toBeTruthy()
      expect(builder).toContain("减去架构文档目录")
    }
  })

  test("AC2：两份表的 architect / verifier 行一致；front.md 出现三个类名与 architect 落点", () => {
    for (const rows of [PLAN_TABLE, BUILD_TABLE]) {
      const architect = rows.find((l) => l.includes("`architect`"))!
      const verifier = rows.find((l) => l.includes("`verifier`"))!
      expect(architect).toContain(".rddf/reviews")
      expect(architect).toContain("arch-docs.json")
      expect(verifier).toContain(".rddf/reviews")
    }
    // 两表的 verifier 行**必须一致**（D3 修订后允许集已是两项：产品落点 + 记账落点）
    const [planVerifier, buildVerifier] = [PLAN_TABLE, BUILD_TABLE].map((rows) =>
      rows.find((l) => l.includes("`verifier`"))!,
    )
    for (const token of [".rddf/reviews", ".rddf/state/verifier"]) {
      expect(planVerifier).toContain(token)
      expect(buildVerifier).toContain(token)
    }
    for (const cls of ["`builder`", "`architect`", "`verifier`"]) {
      expect(FRONT_MD).toContain(cls)
    }
    expect(FRONT_MD).toContain("架构文档")
  })

  test("AC3：「选错类」的两种失败形态在 plan.md 与 front.md 都写到（结构锚定，非词频）", () => {
    // plan.md：定位「选错类有两种失败形态」后的两条子 bullet
    const planLines = PLAN_MD.split("\n")
    const anchor = planLines.findIndex((l) => l.includes("选错类有两种失败形态"))
    expect(anchor).toBeGreaterThan(-1)
    const narrowIdx = planLines.findIndex((l, i) => i > anchor && l.includes("① **窄目标**"))
    const wideIdx = planLines.findIndex((l, i) => i > anchor && l.includes("② **宽目标**"))
    expect(narrowIdx).toBeGreaterThan(-1)
    expect(wideIdx).toBeGreaterThan(narrowIdx)
    const narrow = planLines.slice(narrowIdx, wideIdx).join("\n") // 含续行
    const wide = planLines[wideIdx]
    expect(narrow).toContain("派发被拒")
    expect(narrow).toContain("改派")
    // 归因句：三种成因都要写到（类不相容 / scope 写错 / archRoots 为空 ⇒ 先初始化）
    expect(narrow).toContain("类 × scope 不相容")
    expect(narrow).toContain("原类重派")
    expect(narrow).toContain("arch-docs-init.sh")
    expect(wide).toContain("交回")
    expect(wide).toContain("重派")
    // front.md：role_class 字段说明行内两种形态齐
    const frontRow = FRONT_MD.split("\n").find((l) => l.includes("填错有两种形态"))!
    expect(frontRow).toContain("窄目标")
    expect(frontRow).toContain("派发被拒")
    expect(frontRow).toContain("改派")
    expect(frontRow).toContain("宽目标")
    expect(frontRow).toContain("交回")
    expect(frontRow).toContain("重派")
  })

  // ⚠ 边界：**字段值语义**（`null` / 空串 到底算不算「非法」）由 lib 侧单测负责（`tests/delegate-core.test.ts`
  //    的 validateBrief describe），本守卫只钉**文档口径**（plan/front 都写「始终生效」、plan 写 `kind=knowledge` 互斥）。
  test("AC3b：「始终生效」与 `kind=knowledge` 互斥被钉住（文档口径；字段值语义由 lib 侧负责）", () => {
    expect(PLAN_MD).toContain("始终生效")
    expect(FRONT_MD).toContain("始终生效")
    expect(PLAN_MD).toContain("kind=knowledge")
    expect(PLAN_MD).toContain("互斥")
  })

  test("AC3c：front.md 排障表有「类 × scope 不相容」的硬拒行（与占槽拒绝区分）", () => {
    const row = FRONT_MD.split("\n").find((l) => l.includes("类 × scope 不相容"))!
    expect(row).toContain("越界路径")
    expect(row).toContain("改派") // 或原类重派
    expect(row).toContain("重派")
  })

  test("AC4：过期降级句已删（plan/front）；存量派发兜底句仍在（build.md）", () => {
    expect(PLAN_MD).not.toContain("机制未启用")
    expect(FRONT_MD).not.toContain("机制未落地")
    expect(FRONT_MD).not.toContain("机制未启用")
    // build.md 的「存量派发 / 字段缺失 ⇒ 按缺省 builder」兜底仍然有效
    expect(BUILD_MD).toContain("机制未启用时的缺省口径")
    expect(BUILD_MD).toContain("不得因字段缺失臆造一个 class")
  })

  test("AC5：front.md 可见「架构决策落盘 ⇒ architect」且与 plan.md 分流判据同源", () => {
    expect(FRONT_MD).toContain("只解释、不落盘")
    expect(FRONT_MD).toContain("架构决策落盘")
    expect(FRONT_MD).toContain("架构内容分流") // 按标题名引用 plan.md
    // 同一组关键词（讨论 / 决策 / 落盘 / 架构文档）
    for (const kw of ["讨论", "决策", "落盘", "架构文档"]) {
      expect(FRONT_MD).toContain(kw)
      expect(PLAN_MD).toContain(kw)
    }
  })

  test("AC6：plan.md 的「架构内容分流」小节含三路 + 三个触发问题 + brief 必带候选集", () => {
    expect(FLOW_SECTION).not.toBe("")
    // 三路
    expect(FLOW_SECTION).toContain("① 讨论")
    expect(FLOW_SECTION).toContain("② 决策")
    expect(FLOW_SECTION).toContain("③ 实现")
    // 三个触发问题
    expect(FLOW_SECTION).toContain("候选收敛了吗")
    expect(FLOW_SECTION).toContain("要跨会话生效吗")
    expect(FLOW_SECTION).toContain("取舍")
    expect(FLOW_SECTION).toContain("怎么做")
    // brief 必带候选集 + 派 architect + 不重新发明备选（防两边各写一套）
    expect(FLOW_SECTION).toContain("brief 必带候选集")
    expect(FLOW_SECTION).toContain("role_class=architect")
    expect(FLOW_SECTION).toContain("不重新发明备选")
  })

  test("AC7：落点路由正文只出现一次（在 build.md）；plan.md / front.md 只引用", () => {
    const body = "决策与取舍 → ADR"
    const count = [PLAN_MD, FRONT_MD, BUILD_MD].filter((md) => md.includes(body)).length
    expect(count).toBe(1)
    expect(BUILD_MD).toContain(body)
    // plan.md 按「段名 + 条目名」引用，不复制正文
    expect(PLAN_MD).toContain("architect 产出形态契约")
    expect(PLAN_MD).toContain("落点路由")
    expect(PLAN_MD).not.toContain(body)
    // 同理：「只回答三件事」的**枚举正文**也不得被复制成第二份（critic SHOULD_FIX 1）
    const triad = "定什么、为什么这么定、代价是什么"
    expect([PLAN_MD, FRONT_MD, BUILD_MD].filter((md) => md.includes(triad)).length).toBe(1)
    expect(BUILD_MD).toContain(triad)
    // plan.md 只留条目名
    expect(PLAN_MD).toContain("决策文档只回答三件事")
    expect(PLAN_MD).not.toContain(triad)
  })

  test("AC8：未新增 —— token allowlist / SLOT_STATES / outcome 集合不变", () => {
    const known = new Set([
      "delegate", "dispatch", "sessions", "suspend", "cancel",
      "rddf", "feedback", "list", "kind", "scope", "role_class", "resume", "resume_session", "session",
      "last_assistant_text", "last_feedback_id", "created_at", "outcome", "state",
      "idle", "running", "succeeded", "slot", "pair", "json", "file", "line",
      "task", "plan", "ac", "tasks", "proposal", "true", "false", "subagent", "HANDOFF",
      "oracle", "prompts", "build", "md", "design", "open", "specs", "changes",
      "builder", "architect", "verifier", // 三个能力类
    ])
    const tokens = [...FLOW_SECTION.matchAll(/`([^`]+)`/g)]
      .flatMap((m) => m[1].split(/[^A-Za-z0-9_]+/))
      .filter((t) => /^[A-Za-z][A-Za-z0-9_]*$/.test(t))
    for (const token of new Set(tokens)) {
      expect(known).toContain(token)
    }
    expect([...SLOT_STATES]).toEqual(["dispatching", "active", "idle", "suspended", "tombstone"])
    // 新小节不引入新的 outcome / state 取值
    const used = [...FLOW_SECTION.matchAll(/(?:outcome|state)\s*=\s*`?([a-z_]+)/g)].map((m) => m[1])
    for (const value of used) {
      expect([...SLOT_STATES]).toContain(value)
    }
  })
})

describe("Accepted ADR 措辞修订 + 治理面归属守卫（adr-d5-async-completion-wording）", () => {
  const ADR = readFileSync(
    path.join(import.meta.dir, "..", "docs", "adr", "ADR-backend-handoff-role-class.md"),
    "utf8",
  )
  const SPEC = readFileSync(
    path.join(import.meta.dir, "..", ".rddf", "reviews", "backend-handoff-protocol-spec.md"),
    "utf8",
  )
  const PLAN_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "plan.md"), "utf8")
  const BUILD_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "build.md"), "utf8")

  /** D5 段里以 `- 识别：` 开头的那一行（不扫整段、不依赖行号） */
  const d5Identify = (() => {
    const d5 = ADR.split(/^### D5 /m)[1]?.split(/^### D6 /m)[0] ?? ""
    return d5.split("\n").find((l) => l.trimStart().startsWith("- 识别：")) ?? ""
  })()

  test("AC1：ADR D5 的识别条目含两个观测条件，且不含「完成通知后」的等待语义", () => {
    expect(d5Identify).not.toBe("")
    expect(d5Identify).toMatch(/running=false/)
    expect(d5Identify).toMatch(/state=idle/)
    // 只禁「在…后」的等待语义，允许正确的「没有完成通知」表述
    expect(d5Identify).not.toMatch(/完成通知后/)
    expect(d5Identify).toContain("没有完成通知")
    // 槽位释放是 reconcile-on-read（惰性）⇒ `state=idle` 不是必要条件（否则字面等待 = 卡死）
    expect(d5Identify).toContain("不必等")
    expect(d5Identify).toContain("reconcile-on-read")
    expect(d5Identify).toContain("outcome=succeeded")
  })

  test("AC4：spec 保留原文 + 行尾 v4 修订注 + 自定口径段含 v4", () => {
    expect(SPEC).toContain("v4 修订 2026-11-14")
    expect(SPEC).toContain("异步面无推送通道")
    expect(SPEC).toContain("v4 = v3 +")
    // 历史原文保留（不抹掉 v3 审计痕迹）
    expect(SPEC).toContain("异步在完成通知后")
  })

  test("AC12：plan.md 的临时消歧句已删；异步面 bullet 的正向内容仍在", () => {
    expect(PLAN_MD).not.toContain("没有推送通道")
    expect(PLAN_MD).not.toContain("ADR D5 所述的「完成」")
    expect(PLAN_MD).toContain("完成信号")
    expect(PLAN_MD).toContain("没有**完成信号")
    expect(PLAN_MD).toContain("running=false")
    // 与 ADR D5 同一口径：触发点 = running=false；完成判据以 feedback 为准；state=idle 非必要
    expect(PLAN_MD).toContain("完成判据以 `rddf feedback list` 为准")
    expect(PLAN_MD).toContain("不必等 `state=idle`")
  })

  test("AC13：build.md 作用域表有「本仓特例裁定」行（本仓 docs/adr/** 属 ADR 行）", () => {
    expect(BUILD_MD).toContain("本仓特例裁定")
    const line = BUILD_MD.split("\n").find((l) => l.includes("本仓特例裁定"))!
    expect(line).toContain("ADR 行")
    expect(line).toContain("不属治理面")
    expect(line).toContain("只 oracle")
    // 双重身份读法 + 守卫断言仍属治理面
    expect(line).toContain("配置根")
    expect(line).toContain("项目仓")
    expect(line).toContain("oracle → critic 必审")
  })

  test("AC14：build.md 有「Accepted ADR 描述性措辞修订」判例（含豁免路径 + 守卫必审 + Status 不动）", () => {
    const line = BUILD_MD.split("\n").find((l) => l.includes("判例（Accepted ADR 的描述性措辞修订）"))!
    expect(line).toContain("只 oracle")
    expect(line).toContain("oracle → critic 必审")
    expect(line).toContain("Status 行不动")
    expect(line).toContain("描述性措辞")
    // 可数的豁免边界：只改同一条 bullet 的表述
    expect(line).toContain("不增删 bullet")
    expect(line).toContain("不改表格行")
    // 排除清单四要素（删掉任一项 ⇒ 边界被架空 ⇒ 必须红）
    for (const excluded of ["选项对比表", "后果章", "Verification 章", "决策条目"]) {
      expect(line).toContain(excluded)
    }
    // 非豁免修订的默认归槽
    expect(line).toContain("默认按「决策相关」处理")
  })

  test("AC8：CHANGELOG 有本 change 的条目（判例要求的可追性）", () => {
    const CHANGELOG = readFileSync(path.join(import.meta.dir, "..", "docs", "CHANGELOG.md"), "utf8")
    expect(CHANGELOG).toContain("adr-d5-async-completion-wording")
    // 取 v2.22 这一**块**（含 ② 修正 / ③ 审查 / ④ 验证各行），不是只取含 change 名的那一行
    const changelogLines = CHANGELOG.split("\n")
    const blockStart = changelogLines.findIndex((l) => l.includes("v2.22 变更摘要"))
    expect(blockStart).toBeGreaterThan(-1)
    const blockRest = changelogLines.slice(blockStart + 1)
    const blockEnd = blockRest.findIndex((l) => l.trim() === "---")
    const entry = blockRest.slice(0, blockEnd < 0 ? blockRest.length : blockEnd).join("\n")
    expect(entry).toContain("adr-d5-async-completion-wording")
    // ⚠ 规则：**结论只有在审稿记录落盘后才可写进 CHANGELOG**（防「预先断言未发生的审查结论」）。
    //    这条判据是机械的：审稿记录文件存在 ⇒ 结论可写；不存在 ⇒ 只能是「待进行」。
    const verdictMarkers = ["APPROVE", "BLOCK", "无 BLOCKER", "mergeable"]
    const statesVerdict = verdictMarkers.some((m) => entry.includes(m))
    const recordPath = path.join(
      import.meta.dir, "..", ".rddf", "reviews", "adr-d5-async-completion-wording-prompt-review.md",
    )
    if (statesVerdict) {
      expect(existsSync(recordPath)).toBe(true) // 结论必须可追
    } else {
      expect(entry).toContain("待进行")
    }
  })

  test("未新增：SLOT_STATES 不变；新增文本未引入新标识符", () => {
    expect([...SLOT_STATES]).toEqual(["dispatching", "active", "idle", "suspended", "tombstone"])
    const known = new Set([
      "adr", "docs", "prompt", "prompts", "build", "md", "rddf", "reviews", "spec",
      "oracle", "critic", "tests", "config", "guards", "test", "ts", "running", "state",
      "idle", "role_class", "session", "sessions", "HANDOFF", "summary", "last_assistant_text",
      "feedback", "list", "true", "false", "as", "and", "or", "CHANGELOG", "ADR", "D5",
      "active", "read", "on", "reconcile", "idle", "outcome", "succeeded", "summary",
    ])
    const tokens = [d5Identify, ...BUILD_MD.split("\n").filter((l) => l.includes("判例（Accepted ADR"))]
      .flatMap((l) => [...l.matchAll(/`([^`]+)`/g)].map((m) => m[1]))
      .flatMap((t) => t.split(/[^A-Za-z0-9_]+/))
      .filter((t) => /^[A-Za-z][A-Za-z0-9_]*$/.test(t))
    for (const token of new Set(tokens)) {
      expect(known).toContain(token)
    }
  })
})

/**
 * 会话间对齐（派发方 ↔ 被派发方）：返回值契约 + 能力面。
 *
 * ⚠ **已知边界**（照本仓惯例登记，防后人误信完备）：
 *  - AC21 = **覆盖**判据（字段名出现即过）：否定句里出现也算过；威胁模型是**漂移**不是故意伪造。
 *  - AC21b = **措辞**判据：换同义词即红（fail-closed，逼改守卫的人同步改判据）。
 *  - AC24 = **词表**钉的是旧事故词汇；结构性的那半（能力面行必须指向 `capability:` 块）才是真守卫。
 *  - busy 早退返回（另一形状）是**拒绝**不是**结果** ⇒ 不在契约内（已知边界）。
 *  - `capabilityBlock()` 只渲染 **3 个维度**（edit / shell / delegate）⇒ 配置**新增** permission 维度
 *    （或翻转 `external_directory` 等）时**块与 AC23 都不会自动扩** ⇒ 需同步加维度 + 守卫。
 */
describe("会话间对齐（派发方 ↔ 被派发方：返回值契约与能力面）", () => {
  const PLAN_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "plan.md"), "utf8")
  const FRONT_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "front.md"), "utf8")

  test("AC21：两个派发方 prompt 都必须覆盖 delegate 返回值的**关键字段**（列表从契约派生，不手抄）", () => {
    // 真源 = lib/delegate-core.ts::DELEGATE_RESULT_CRITICAL_FIELDS（插件在返回前自检同一份契约）
    // ⇒ 派发方漏字段 ⇒ 守卫红；契约变 ⇒ 守卫跟着变。
    expect(DELEGATE_RESULT_CRITICAL_FIELDS.length, "关键字段不应为空").toBeGreaterThan(0)
    for (const [rel, text] of [
      ["prompts/plan.md", PLAN_MD],
      ["prompts/front.md", FRONT_MD],
    ] as const) {
      for (const f of DELEGATE_RESULT_CRITICAL_FIELDS) {
        expect(text.includes(f), `${rel} 未提及返回值字段「${f}」`).toBe(true)
      }
    }
  })

  test("AC21b：派发方必须写明「unverified / no_work_evidence ⇒ 不得转述为已完成」的纪律", () => {
    // AC21 只保证「提到字段」；这一条保证「提到的是**纪律**」——
    // 否则派发方知道字段名却仍会把它当成功转述。
    for (const [rel, text] of [
      ["prompts/plan.md", PLAN_MD],
      ["prompts/front.md", FRONT_MD],
    ] as const) {
      expect(text, `${rel} 缺「不得转述为已完成」的纪律句`).toMatch(
        /不得[^。\n]{0,12}转述[^。\n]{0,12}(已完成|完成)/,
      )
      expect(text, `${rel} 缺 unverified / no_work_evidence 的处置说明`).toMatch(
        /unverified|no_work_evidence/,
      )
    }
  })

  test("AC23：三个 agent 的**能力面机读块** == lib 渲染的规范块（逐字 + 恰好 1 处 + 标记行数）", () => {
    // 真源 = opencode.jsonc（配置）⇒ 块是**投影** ⇒ 配置改了而块没改 ⇒ 红。
    // 规范块由 `lib/delegate-core.ts::capabilityBlock()` 渲染（与另两块机读块同形）⇒
    // **派生规则只有一处**（不在测试里另写一份）。
    const BUILD_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "build.md"), "utf8")
    for (const [agentName, text] of [
      ["build", BUILD_MD],
      ["plan", PLAN_MD],
      ["front", FRONT_MD],
    ] as const) {
      const rel = `prompts/${agentName}.md`
      const canonical = capabilityBlock(agentName, (config.agent as Record<string, any>)[agentName].permission)
      // ① 逐字包含
      expect(text.includes(canonical), `${rel} 缺少或偏离能力面规范块`).toBe(true)
      // ② 恰好 1 处（陈旧副本 ⇒ 红）
      expect(text.split(canonical).length - 1, `${rel} 的能力面块应恰好出现 1 次`).toBe(1)
      // ③ 起始标记独占一行且仅 1 处（正文提及不算）
      const markers = text.split("\n").filter((l) => l.trim() === `<!-- capability:${agentName}`).length
      expect(markers, `${rel} 的能力面块起始标记应恰好出现 1 行`).toBe(1)
    }
  })

  test("AC24：能力面**不得**在散文里复述（必须指向机读块）—— 复述即漂", () => {
    // 「与 build 的关键区别」表曾写着「shell 全 allow / plan 需 ask 只读子集」——
    // 与 opencode.jsonc 的真实档位**不符**（build = allow+ask；plan = allow+deny）。
    // 根因：散文复述了能力面 ⇒ 两份会漂。⇒ 规则：**散文不复述，只指向机读块**。
    const planTable = PLAN_MD.split("\n").filter((l) => l.startsWith("| ") && l.includes("|"))
    const claims = ["全 allow", "需 ask；", "只允许安全子集", "仅可写"]
    for (const line of planTable) {
      // 只查「与 build 的关键区别」那张表（含维度名的行）
      if (!/^\|\s*(shell|编辑项目文件|写代码|输出|委派|派发工程实施)/.test(line)) continue
      for (const c of claims) {
        expect(line, `plan.md 的「与 build 的关键区别」表仍在复述能力面「${c}」⇒ 应指向 capability:* 块`).not.toContain(c)
      }
      if (/^\|\s*(shell|编辑项目文件)/.test(line)) {
        expect(line, "能力面行必须指向 capability:* 机读块").toContain("capability:")
      }
    }
  })

  test("AC22：契约字段集与插件实际产出的 summary 字段**逐项一致**（不靠手抄）", () => {
    // 从插件源码里取出 summary 对象的键 ⇒ 与契约比对。
    // （契约与实现在同一文件 ⇒ 若插件改了字段而忘了改契约，这条会红）
    const core = readFileSync(path.join(import.meta.dir, "..", "lib", "delegate-core.ts"), "utf8")
    const start = core.indexOf("const summary = {")
    expect(start, "未找到插件的 summary 构造").toBeGreaterThan(-1)
    const end = core.indexOf("\n          }\n", start)
    expect(end, "未找到 summary 的结束位置").toBeGreaterThan(start)
    const body = core.slice(start, end)
    // ⚠ 属性可能写成**简写**（`vcs,`）⇒ 匹配 `key:` 与 `key,` 两种形态
    const keys = [...body.matchAll(/^\s{12}([a-z_]+)[,:]/gm)].map((m) => m[1] as string)
    expect(keys.length, "未解析出 summary 字段").toBeGreaterThan(8)
    // 正向：契约里的每个字段，插件真的产出
    for (const f of DELEGATE_RESULT_FIELDS) {
      expect(keys, `契约字段「${f}」在插件 summary 里不存在`).toContain(f)
    }
    // 反向：插件产出的每个字段，都在契约里（契约不得漏项 ⇒ 否则派发方按契约读不到）
    for (const k of keys) {
      expect(DELEGATE_RESULT_FIELDS, `插件 summary 的字段「${k}」不在契约里`).toContain(k)
    }
  })
})

describe("能力面写集对齐（class-write-scope-alignment 投影守卫）", () => {
  const PLAN_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "plan.md"), "utf8")
  const FRONT_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "front.md"), "utf8")
  const BUILD_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "build.md"), "utf8")
  const ADR_PARENT = readFileSync(
    path.join(import.meta.dir, "..", "docs", "adr", "ADR-backend-handoff-role-class.md"),
    "utf8",
  )
  const BACKLOG = path.join(
    import.meta.dir, "..", ".rddf", "improvements", "rdd-verifier-state-consolidation.md",
  )

  test("AC19（结构比对）：三份 prompt 的 verifier 写集**机读块** == lib 渲染的规范块（逐字 + 唯一）", () => {
    // 真源 = `lib/delegate-core.ts::VERIFIER_ALLOW_ROOTS` / `VERIFIER_OWNS_PATHS`；
    // 投影 = build.md / plan.md / front.md 各嵌一块**逐字副本**。
    // 判据是**精确字符串比对**（不是散文解析）⇒ 多一个路径 / 少一个路径 / 改一个字符 ⇒ 红。
    const canonical = verifierWriteSetBlock()
    for (const rel of ["prompts/build.md", "prompts/plan.md", "prompts/front.md"]) {
      const text = readFileSync(path.join(import.meta.dir, "..", rel), "utf8")
      expect(text.includes(canonical), `${rel} 缺少或偏离规范机读块`).toBe(true)
      // ① 规范块**逐字**出现且恰好 1 处（多一份副本 / 少一份 ⇒ 红）
      expect(text.split(canonical).length - 1, `${rel} 的规范块应恰好出现 1 次`).toBe(1)
      // ② 起始标记**独占一行**且仅 1 处（陈旧副本的标记也会被抓；正文里「提及」不算）
      const markers = text.split("\n").filter((l) => l.trim() === "<!-- role-class-write-set:verifier").length
      expect(markers, `${rel} 的机读块起始标记应恰好出现 1 行（陈旧副本 ⇒ 红）`).toBe(1)
    }
  })

  test("AC20（路径闭集）：根下旧路径只许出现在历史语境；块内具体文件必须落在 owns 模式内", () => {
    // 取代「散文措辞词表」：**按路径判**，不按词判 ⇒ 换措辞绕不过。
    // ① 根下旧路径（`.rddf/state/.ac-*` / `.rddf/state/rdd-verify-context*`）—— 它们在 allow 根**之外**
    //    ⇒ 出现在现行语境就是**错的**（后端写不进去）⇒ 只允许出现在历史标注行；
    // ② 块内具体文件（`.rddf/state/verifier/<file>`）必须落在 **owns 模式**内
    //    （allow 根是目录根、覆盖其下一切 ⇒ 用它判**恒真、无判别力** ⇒ 不用）。
    // ⚠ 判据面就这两条 —— 不要以为它还能判别的（宁可少判，不要假信心）。
    const canonical = verifierWriteSetBlock()
    const allow = canonical
      .split("\n")
      .find((l) => l.startsWith("allow: "))!
      .slice("allow: ".length)
      .split(", ")
      .map((s) => s.trim())
    const owns = canonical
      .split("\n")
      .find((l) => l.startsWith("owns: "))!
      .slice("owns: ".length)
      .split(", ")
      .map((s) => s.trim())
    const norm = (p: string) => p.replace(/<[^>]+>/g, "*").replace(/\/+$/, "")
    // ⚠ **只用 owns 集合判「块内路径」**，**不用 allow 根**：
    //   allow 根是**目录根** ⇒ 其下任意路径都被它覆盖 ⇒ 拿它当判据**恒真、没有判别力**
    //   （oracle 建议的「allow 前缀覆盖」修法会让这一支变成活代码但仍恒真 ⇒ 假信心）。
    //   有判别力的问法是「这个**文件**是 skill owns 的吗」⇒ 只看 owns 的模式。
    const ownedPatterns = owns.map(norm)
    const owned = (token: string) =>
      ownedPatterns.some((k) => {
        if (k.includes("*")) {
          const re = new RegExp("^" + k.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$")
          return re.test(token)
        }
        // 非 glob 项：相等，或**目录前缀**（为「owns 未来出现目录项」预留；当前 3 个字面 owns 项走不到这里）
        return token === k || token.startsWith(k + "/")
      })
    // allow 根**作为目录引用**（token 是该目录本身，或其 `/**` 形态）⇒ 合法；
    // ⚠ 不能用「startsWith(根 + "/")」—— 那是**目录前缀**，会把根下一切文件都放行（同 allow 根恒真问题）。
    const allowRoots = allow.map(norm)
    const isAllowRootDir = (token: string) => {
      // 目录/目录通配形态（`.rddf/state/verifier` / `/**` / `/*`）⇒ 都归到该目录本身
      const dirRef = token.replace(/\/\*.*$/, "")
      return allowRoots.some((k) => dirRef === k)
    }

    // ⚠ **历史标记刻意不含裸「旧」**（单字太宽：「仍旧」「照旧」都会命中 ⇒ 豁免变后门）。
    //   只收**成词**的表述。
    // ⚠ **本仓还剩两处枚举式词表，并列登记（不要把其中一处写成「唯一」——会少记一面）**：
    //   ① 本处 HIST —— AC20 内部的**行级豁免闸门**（历史语境白名单）；
    //   ② AC14 的 stale 正则 —— 「写集被描述得**更窄**」的判据（原型证明无可替代的结构化写法）。
    //   其余判据（AC19 逐字块 / AC20 路径闭集）均**按路径或逐字内容判** ⇒ 换措辞绕不过。
    // ⚠ 已知残留（**故意不闭合**）：HIST 是**逐行**豁免 ⇒ 「活错误陈述 + 同行塞一个历史词」可同框洗白。
    //    收紧到「引用/标注语境」会误伤真实的退役注记 ⇒ 登记为已知面，不在此闭合。
    const HIST = /历史|退役|作废|legacy|pre-consolidation|旧路径|旧形态|旧版|收拢前|已收拢/
    // ⚠ **已关闭 improvement 的判定**：必须带**完成/归档**语义；`已立项` 只有在**同行**给出
    //   归档指针时才算已关闭（本仓惯例：`已立项 → openspec/changes/archive/…`）。
    //   且只认**头部区**（前 15 行）—— 正文中部引用一句他人状态行不得翻转整文件豁免。
    // 关闭判定走模块级 `isClosedImprovement`（与 AC14 共用同一实现，不得各写一份）
    // ⚠ **覆盖面与 AC14 同一口径**（未覆盖面：`.rddf/plans/**`、未归档 open change 的 proposal.md）。
    // TOKEN 必须三向：块内**新形态**路径（`verifier/…`）也要抽出来 —— 否则「块外新路径」这一面是死代码。
    // ⚠ 排除字符集必须含 `,` 与 `、`（机读块里 owns 是**逗号分隔**的一行 ⇒ 否则 token 会带上尾逗号）。
    //   另：闭集含 `.ac-*` / `rdd-verify-context*` / `.verifier-*` 三族 verifier 状态路径；
    //   `.verifier-*`（如曾悬空的 `.rddf/state/.verifier-report.json`）一并纳入，避免漏族。
    // ⚠ 已知边界（fail-safe 方向）：排除集**不含** ASCII `.` 与 `]` ⇒ 英文句点收尾的路径会带尾缀 ⇒ 误红。
    const TOKEN = /\.rddf\/state\/(verifier\/[^\s`）)，。；;,"'、]*|\.ac-[^\s`）)，。；;,"'、]*|rdd-verify-context[^\s`）)，。；;,"'、]*|\.verifier-[^\s`）)，。；;,"'、]*)/g
    const scanRoots = ["prompts", "docs", "commands", ".rddf/improvements", ".rddf/roadmap"]
    // ⚠ `docs/CHANGELOG.md` **必须排除**：它开头自述「**本文档不描述现状**，只记录『什么时候改了什么、
    //   为什么』」⇒ 是**历史记录**，不是现行指引；而它天然会**引用判据的字面形态**
    //   （如逐字引 AC14 的正则）⇒ 引用即命中判据本身 ⇒ 扫它必然假红。
    const excluded = ["docs/adr", "docs/CHANGELOG.md"]
    const hits: string[] = []
    const walk = (rel: string) => {
      if (excluded.some((e) => rel === e || rel.startsWith(e + "/"))) return
      const abs = path.join(import.meta.dir, "..", rel)
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        const next = rel ? `${rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(next)
        else if (entry.name.endsWith(".md")) {
          // 文件级排除（`excluded` 里既可能有**目录**（docs/adr）也可能有**单文件**（docs/CHANGELOG.md））
          if (excluded.some((e) => next === e)) continue
          const text = readFileSync(path.join(abs, entry.name), "utf8")
          // 已关闭的 improvement 是**历史记录**（记的是当时的路径）⇒ 不参与现行判据
          // （只看**头部区**前 15 行 —— 正文中部引用别人的状态行不得翻转整文件豁免）
          // ⚠ 已知残留（**部分收窄**，不追求闭合）：
          //    - 带**归档指针**的关闭 ⇒ **已机械核**（本仓目录必须真存在；跨仓须显式声明）；
          //    - 仅写「已完成/已关闭」而无指针 ⇒ **不可机械核**（语义式关闭）⇒ 「伪造关闭」属**故意**行为，
          //      超出本守卫的漂移威胁模型 ⇒ 其真伪由 `rdd-doctor` / 流程评审承担。
          const head = text.split("\n").slice(0, 15).join("\n")
          if (next.startsWith(".rddf/improvements/") && isClosedImprovement(head)) continue
          for (const [i, line] of text.split("\n").entries()) {
            const historical = HIST.test(line)
            for (const m of line.matchAll(TOKEN)) {
              const token = norm(m[0])
              if (token.startsWith(".rddf/state/verifier")) {
                // 目录根引用（`.rddf/state/verifier` 本身）合法；具体文件必须落在 owns 模式内
                if (!isAllowRootDir(token) && !owned(token)) {
                  hits.push(`${next}:${i + 1}: ${m[0]}（不在 owns 集合内）`)
                }
              } else if (!historical) {
                hits.push(`${next}:${i + 1}: ${m[0]}（根下旧路径且非历史语境）`)
              }
            }
          }
        }
      }
    }
    for (const r of scanRoots) walk(r)
    // 规格件单列（与 AC14 同款）：`.rddf/reviews/**` 整体是历史记录区，只白名单这一个规格件
    // （它被 ADR 元数据当权威引用 ⇒ 属「活文档」）
    const specPath = path.join(import.meta.dir, "..", ".rddf", "reviews", "backend-handoff-protocol-spec.md")
    if (existsSync(specPath)) {
      const specText = readFileSync(specPath, "utf8")
      for (const [i, line] of specText.split("\n").entries()) {
        if (HIST.test(line)) continue
        for (const m of line.matchAll(TOKEN)) {
          const token = norm(m[0])
          if (token.startsWith(".rddf/state/verifier")) {
            if (!isAllowRootDir(token) && !owned(token)) {
              hits.push(`.rddf/reviews/backend-handoff-protocol-spec.md:${i + 1}: ${m[0]}（不在 owns 集合内）`)
            }
          } else {
            hits.push(`.rddf/reviews/backend-handoff-protocol-spec.md:${i + 1}: ${m[0]}（根下旧路径且非历史语境）`)
          }
        }
      }
    }
    expect(hits.join(" | ")).toBe("")
  })

  test("AC7：三处文本一致（plan 选类表 / front §3.1 / build 运行身份表）含写集与 scope 义务", () => {
    // plan.md 选类表 verifier 行
    const planRow = PLAN_MD.split("\n").find((l) => l.includes("`verifier`") && l.includes(".rddf/reviews"))!
    expect(planRow).toContain(".rddf/state/verifier")
    expect(planRow).toContain("scope")
    expect(planRow).toMatch(/scope[^|]*必须/)
    // front.md §3.1 的 role_class 行
    const frontRow = FRONT_MD.split("\n").find((l) => l.includes("`role_class`（选填"))!
    expect(frontRow).toContain(".rddf/state/verifier")
    expect(frontRow).toMatch(/scope[^|]*必须同时包含/)
    // build.md 运行身份表 verifier 行（**在该段内**定位；后端侧：**不是**后端义务 ⇒ 括注指向派发侧）
    const buildLines = BUILD_MD.split("\n")
    const identityStart = buildLines.findIndex((l) => l.startsWith("#### 被派发后端的运行身份与交回契约"))
    expect(identityStart).toBeGreaterThan(-1)
    const buildRow = buildLines
      .slice(identityStart)
      .find((l) => l.startsWith("| `verifier` |"))!
    expect(buildRow).toContain(".rddf/reviews/**")
    expect(buildRow).toContain(".rddf/state/verifier/**")
    expect(buildRow).toContain("plan.md")
  })

  test("AC8：§verifier 产出契约 —— 过渡期规则**已退役** + 现行规则是「后端直写」+ 根下路径解读作废", () => {
    const sec = BUILD_MD.split("\n")
    // ① 退役标记 + 指向产品侧 change
    const retired = sec.find((l) => l.includes("过渡期规则") && l.includes("已退役"))!
    expect(retired).toContain("consolidate-verifier-state")
    // ② 现行规则：后端**直写**全部 skill 状态（single writer）
    expect(retired).toContain("直写")
    expect(retired).toContain("single writer")
    // ③ 负向：「主会话代跑」**不得**被写成现行规则（该措辞只允许出现在退役语境里）
    const live = sec.filter(
      (l) => l.includes("主会话代跑") && !l.includes("退役") && !l.includes("不再需要"),
    )
    expect(live).toEqual([])
    // ④ 历史注记：根下 `.ac-*` 的「症状桥接」解读**作废**
    const note = sec.find((l) => l.includes(".rddf/state/.ac-*") && l.includes("作废"))!
    expect(note).toContain("已收拢进")
  })

  test("AC9：§审查配对 builder（架构面）行含「scope 必须包含」+「未包含时只落响应正文」；plan.md 选类表 builder 行同款", () => {
    const row = BUILD_MD.split("\n").find((l) => l.includes("`builder`（架构面）"))!
    expect(row).toContain("scope")
    expect(row).toMatch(/scope[^|]*必须包含/)
    expect(row).toContain("只落响应正文")
    // D2b 的第二个落点：派发侧（plan.md 选类表 builder 行）—— 缺它 ⇒ 派发方无义务依据
    const planBuilder = PLAN_MD.split("\n").find((l) => l.includes("`builder`") && l.includes("架构文档目录"))!
    expect(planBuilder).toContain("scope")
    expect(planBuilder).toMatch(/scope[^|]*必须包含/)
    expect(planBuilder).toContain("只落响应正文")
  })

  test("AC10：父篇 D3 verifier 行已落改 + Status 有修订记录（未完成指针已删）", () => {
    const row = ADR_PARENT.split("\n").find((l) => l.startsWith("| `verifier` |"))!
    expect(row).toContain(".rddf/state/verifier/**")
    expect(row).toContain("ADR-class-write-scope-alignment")
    expect(row).not.toContain("仅 `.rddf/reviews/**`")
    const status = ADR_PARENT.split("\n").find((l) => l.includes("| Status |"))!
    expect(status).toContain("D3 verifier 写集修订")
    expect(status).not.toContain("实施时与代码同批落改")
  })

  test("AC11：build.md 内部状态文件描述收口为「全部在记账落点」+ 负向不得再有「待产品侧收拢」", () => {
    const rows = BUILD_MD.split("\n").filter((l) => l.includes(".rddf/state/verifier"))
    // 三处（状态落点句 / 退役句 / 归属表行 / 运行身份表行）都应出现
    expect(rows.length).toBeGreaterThanOrEqual(3)
    const joined = rows.join("\n")
    // 负向：产品侧收拢已完成 ⇒ 不得再有「待产品侧收拢」
    expect(joined).not.toContain("待产品侧收拢")
    // 正向：记账落点必须被点名（不是靠「全部」这种平凡词满足）
    expect(joined).toContain("记账落点")
    // ⚠ **路径负向已上移**：「根下旧路径只许出现在历史语境」由 **AC20（路径闭集）** 统一判 ——
    //   它按**路径**判（不按措辞）、且覆盖**全部活文档**；此处不再重复一份窄口径断言。
  })

  test("AC13：§verifier 产出契约 含落点区分（产品 vs 记账），负向不得写反", () => {
    const line = BUILD_MD.split("\n").find((l) => l.includes("verifier 状态落点"))!
    expect(line).toContain("产品落点")
    expect(line).toContain("记账落点")
    expect(line).toContain("记账文件不得冒充验收报告")
    // 负向：不得再声称有「根下点文件待收拢」
    expect(line).not.toContain("待产品侧收拢")
    expect(line).not.toMatch(/\.rddf\/state\/\.ac-verdict/)
    const sec = BUILD_MD.split("\n")
    expect(sec.some((l) => l.includes("状态/记账文件写入") && l.includes(".rddf/reviews/"))).toBe(false)
  })

  test("AC14（路径闭合）：活文档里「verifier 写集 = 仅 .rddf/reviews」类陈述必须同时给出记账落点", () => {
    // ── 判据（2026-11-15 升级：从「副词词表」换成「**路径闭合**」）──────────────────────
    // 旧判据只看**副词**（仅 / 只允许 / 只能 / 只有 / 限于）⇒ 实测漏网过一类：
    // `edit 上限=.rddf/reviews`（**无副词**）当时没被本条抓到，是 oracle 在 delegate 工具
    // schema 里人工发现的。新判据 = 「**写集动词/副词** + `.rddf/reviews`」⇒ 该行**必须**
    // 同时给出 `.rddf/state/verifier`（缺 ⇒ 把写集描述窄了）。
    // ⚠ 仍是**枚举式**词表（本仓最后两处之一，与 AC20 的 HIST 并列登记）：未知动词/副词会漏判。
    //   可接受的边界：这类陈述的**必要成分**是「写集动词」本身（不写动词就不构成写集声明）。
    // ⚠ **窗口取舍（6 字符）**：旧判据是 `{0,40}` + `{0,20}` 的宽窗口 —— 实测额外召回的**大多是误报**
    //   （「仅在通过验收后把报告写入 …」这类流程描述）。窄窗口是对**真实故障形态**（紧挨式写集声明）
    //   的定向修复；代价是「动词与路径隔 >6 字符」的松散形态会漏（fail-closed 方向，可接受）。
    // ⚠ 词表里**不写 `edit 上限`**：alternation 中 `上限` 在前 ⇒ 长分支被遮蔽（恒不可达），写了是噪声。
    const CLAIM = /(可写|能写|写集|上限|写入范围|仅|只允许|只能|只有|限于)[^。\n]{0,6}`?\.rddf\/reviews/
    const HIST = /历史|退役|作废|legacy|pre-consolidation|旧路径|旧形态|旧版|收拢前|已收拢/
    const root = path.join(import.meta.dir, "..")
    const scanRoots = ["prompts", "docs", "commands", ".rddf/improvements", ".rddf/roadmap"]
    // ⚠ 同 AC20：`docs/CHANGELOG.md` 是**历史记录**（自述「不描述现状」）且天然逐字引用判据形态
    //   ⇒ 引用即命中判据本身 ⇒ 必须排除，否则本条永远红。
    // ⚠ 未覆盖面（与 AC20 同口径）：`.rddf/plans/**`、未归档 open change 的 `proposal.md`。
    const excluded = ["docs/adr", "docs/CHANGELOG.md"]
    const hits: string[] = []
    const walk = (rel: string) => {
      if (excluded.some((e) => rel === e || rel.startsWith(e + "/"))) return
      const abs = path.join(root, rel)
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        const next = rel ? `${rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(next)
        else if (entry.name.endsWith(".md")) {
          if (excluded.some((e) => next === e)) continue
          const text = readFileSync(path.join(abs, entry.name), "utf8")
          // 已关闭的 improvement 是历史记录（**与 AC20 共用同一判定** —— 只此一份）
          if (next.startsWith(".rddf/improvements/")
              && isClosedImprovement(text.split("\n").slice(0, 15).join("\n"))) continue
          for (const [i, line] of text.split("\n").entries()) {
            if (HIST.test(line)) continue
            if (!line.includes("verifier")) continue
            if (!CLAIM.test(line)) continue
            // ⚠ 已知边界：本豁免只看「该行是否出现记账落点」。**否定/重定向语境**可洗白
            //   （如「不应写入 .rddf/state/verifier；verifier 写集只有 .rddf/reviews」）——
            //   启发式层面可接受（与 HIST 同属登记在案的边界），不在此闭合。
            if (line.includes(".rddf/state/verifier")) continue
            hits.push(`${next}:${i + 1}: ${line.slice(0, 100)}`)
          }
        }
      }
    }
    for (const r of scanRoots) walk(r)
    expect(hits.join(" | ")).toBe("")
  })

  test("AC5 承接：§架构文档范围 含「arch_paths 不得取 .rddf/state 的祖先或本身」禁句", () => {
    const line = BUILD_MD.split("\n").find((l) => l.includes("arch_paths") && l.includes(".rddf/state"))!
    expect(line).toContain("不得")
    expect(line).toContain("祖先或本身")
    expect(line).toContain("状态目录不是架构文档面")
  })

  test("AC10④：父篇 ADR 的 commit 必须是代码 commit 的祖先或同一 commit（父篇滞后必红）", () => {
    // 一次性判据（验后即冻）：用 git log -1 取**该文件**的最后提交
    const sha = (file: string) => {
      try {
        return execFileSync("git", ["log", "-1", "--format=%H", "--", file], {
          cwd: path.join(import.meta.dir, ".."),
          encoding: "utf8",
        }).trim()
      } catch {
        return ""
      }
    }
    const parentSha = sha("docs/adr/ADR-backend-handoff-role-class.md")
    const codeSha = sha("lib/delegate-core.ts")
    if (!parentSha || !codeSha) return // 环境无 git ⇒ 跳过（判据在验收报告里人工核对）
    // is-ancestor 退出码 0 ⇒ 父篇 commit 是代码 commit 的祖先或同一 commit（父篇滞后 ⇒ 退出码 1 ⇒ 红）
    let ok = true
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", parentSha, codeSha], {
        cwd: path.join(import.meta.dir, ".."),
        stdio: "ignore",
      })
    } catch {
      ok = false
    }
    expect(ok).toBe(true)
  })

  test("AC18：产品侧收拢 backlog stub 已建，且其 Acceptance 含 owns 核对项", () => {
    expect(existsSync(BACKLOG)).toBe(true)
    const text = readFileSync(BACKLOG, "utf8")
    expect(text).toContain("VERIFIER_OWNS_PATHS")
    expect(text).toContain("owns")
    expect(text).toMatch(/逐项一致|核对/)
  })
})

/**
 * 对齐完备性（元判据：**描述面枚举闭集**）。
 *
 * 为什么需要这一族：v2.28 的三层对齐只覆盖「真源 ⇄ 两个派发方 prompt」。
 * 同一个事实还有**第三、第四个投影**，此前没有任何判据扫到：
 *   ① 工具的 `description` —— **LLM 在派发瞬间实际读的文本**（`verifierAllowRootLabels()`
 *      的注释自己写明「它不读 prompt 填表」），但它手抄着 5 个旧字段名；
 *   ② HANDOFF 的 kind 词表 —— AC3 只扫 `build.md`，派发方 `plan.md` / `front.md` 一次都没读；
 *   ③ 派发参数名 —— `plan.md` 全缺 `project_dir` / `goal` / `constraints` / `grants`。
 * ⇒ 判据形态从「X 出现在这里」升级为「**所有描述同一事实的投影都必须与真源一致**」。
 *
 * ⚠ **已知边界**（照本仓惯例登记，防后人误信完备）：
 *  - 解析基于「返回：」「选填：」两个固定子句形态 —— 改写这两个词 ⇒ 判据**抛错**（fail-closed）。
 *    这是有意的：形态变了就该有人来更新判据，而不是让判据静默失效。
 *  - 只判「清单与真源是否一致」，**不判说明文字准不准**（措辞仍是开集）。
 *  - `kind` 集合的真源取 `build.md` 的 §HANDOFF 段（与 AC3 同一处）。若将来抽成 lib 常量，
 *    本族应改为直接引用该常量，且 AC3 需同改（否则两处真源）。
 *  - AC29 只判「要求有通道」，**不判通道是否够用**（例如 base 落在 constraints 里算不算可解析，
 *    是语义问题，超出静态层）。
 *  - AC28 只判**必填**参数名（`schema.required`）⇒ 选填参数的**语义**缺口不在覆盖内：
 *    例如 `plan.md` 全文未提 `grants`（用户预批），但它是选填、不填也能派发 ⇒ 静态层判不出「该讲没讲」。
 *  - AC25/AC26 的**形态约束**扫描范围锚定到 `delegateToolDefinition()` 的 description 表达式；
 *    函数被重构/移走 ⇒ 判据**抛错**（fail-closed），不会静默扩大或缩小范围。
 *    它们证明的是「description 不是手抄的」+「渲染器输出与契约逐项一致」；
 *    **不证明** gloss 文案的语义准确性（那是人读检查的事）。
 *  - AC29 已于 `delegate-base-channel` 落地：**从「双向登记式」转为「行为断言」**（断言简报输出含基线行）。
 *    登记表 `KNOWN_UNIMPLEMENTED_CHANNELS` 仍作为**其它**缺口的载体保留（本仓惯例）。
 */
describe("对齐完备性（元判据：描述面枚举闭集）", () => {
  const BUILD_MD = readFileSync(path.join(import.meta.dir, "..", "prompts", "build.md"), "utf8")
  const PLAN_MD2 = readFileSync(path.join(import.meta.dir, "..", "prompts", "plan.md"), "utf8")
  const FRONT_MD2 = readFileSync(path.join(import.meta.dir, "..", "prompts", "front.md"), "utf8")
  const CORE_SRC = readFileSync(path.join(import.meta.dir, "..", "lib", "delegate-core.ts"), "utf8")

  // `ctx` 只在 execute 内使用 ⇒ 传空对象安全（这里只读 schema 与 description）
  const tool: any = delegateToolDefinition({} as any)
  const desc: string = String(tool.description ?? "")
  const props: Record<string, unknown> = tool.input?.properties ?? {}
  const requiredNames: string[] = (tool.input?.required ?? []) as string[]
  const allNames = Object.keys(props)
  const optionalNames = allNames.filter((n) => !requiredNames.includes(n))

  /** 取「<label>…：…」子句（允许标签后带括注；**缺失即抛**，不静默）。 */
  const clause = (label: string): string => {
    const m = desc.match(new RegExp(`${label}[^：]*：([^。\\n]+)`))
    if (!m) throw new Error(`工具 description 里找不到 «${label}…：» 子句（形态变了 ⇒ 更新本判据）`)
    return m[1]!
  }
  /** 拆 token：去括号注、按 `/` 或 `、` 分、去尾句号。 */
  const tokens = (s: string): string[] =>
    s
      .replace(/（[^）]*）/g, "")
      .replace(/\([^)]*\)/g, "")
      .split(/[\/、]/)
      .map((x) => x.trim().replace(/[。.]$/, ""))
      .filter((x) => x.length > 0)
  /** 合法标识符形态（字段名 / 参数名）。 */
  const isIdent = (s: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)

  const RESULT_FIELDS: readonly string[] = DELEGATE_RESULT_FIELDS as readonly string[]
  const CRITICAL: readonly string[] = DELEGATE_RESULT_CRITICAL_FIELDS as readonly string[]

  /**
   * **已知「要求存在、实现通道缺失」的派发面** —— AC29 的唯一豁免载体。
   *
   * ⚠ 这不是「豁免名单」，是**登记表**：AC29 是**双向**判据 ——
   *   - 无通道 + 未登记 ⇒ **红**（不许静默缺着）
   *   - 有通道 + 仍登记 ⇒ **红**（登记不得变成永久豁免）
   * ⇒ 通道落地时必须删掉对应条目，否则守卫会挡住你。
   */
  /**
   * ⚠ **本表当前为空，且「空」是如实状态**（2026-11-15，metis 指出）：
   *   - `delegate-base` 那条已随 `delegate-base-channel` 落地而删除；
   *   - **登记表机制本身有已知局限**：它只能承载「**有对应红判据**」的盲区
   *     （条目必须能被某个守卫抓住）⇒ 像「`prompts/critic.md.bak-*` 这类**非 `.md` 后缀**的陈旧副本」
   *     （所有扫描器静默跳过 ⇒ 零守卫）**就承载不了** —— 登记表对它无效。
   *   ⇒ 本表的**长期价值**取决于「每条登记是否有可验证会红的判据」；
   *     缺那条判据的盲区必须**另找出路**（如：把陈旧副本纳入扫描后缀集）。
   */
  const KNOWN_UNIMPLEMENTED_CHANNELS: ReadonlyArray<{
    id: string
    gap: string
    impact: string
    todo: string
    registered_at: string
  }> = [
  ]

  /**
   * 定位 `delegateToolDefinition()` 的 **description 表达式**（形态约束的扫描范围）。
   *
   * ⚠ 只扫「return { … description: … input, }」这一段 —— 不扫整个函数体：
   *   input 的 properties 里本来就有大量 `description:`（那是参数说明，不是返回清单）。
   * 找不到 ⇒ 判据抛错（fail-closed）：函数被重构到别处时，应由人来更新判据。
   */
  const fnStart = CORE_SRC.indexOf("export function delegateToolDefinition")
  expect(fnStart, "找不到 delegateToolDefinition()").toBeGreaterThan(-1)
  const fnRest = CORE_SRC.slice(fnStart)
  const nextTop = fnRest.indexOf("\n/**", 10)
  const fnSeg = nextTop > 0 ? fnRest.slice(0, nextTop) : fnRest
  const retStart = fnSeg.indexOf("return {")
  const dStart = retStart >= 0 ? fnSeg.indexOf("description:", retStart) : -1
  const dEnd = dStart >= 0 ? fnSeg.indexOf("input,", dStart) : -1
  const descSeg = dStart >= 0 && dEnd > dStart ? fnSeg.slice(dStart, dEnd) : ""

  test("AC25：description 的「返回」子句必须**派生**（源码无字段名字面量）+ 值 pin", () => {
    expect(descSeg.length, "定位不到 delegateToolDefinition 的 description 表达式（函数被重构？请更新本判据）").toBeGreaterThan(0)
    // ① **形态约束（主）**：description 表达式内不得出现任何字段名的字符串字面量
    //    ⇒ 防「改回手抄」：抄得再对，也过不了这条（值 pin 抓不到「抄对了的手抄体」）。
    const hardcoded = RESULT_FIELDS.filter((f) => new RegExp(`["'\`]${f}["'\`]`).test(descSeg))
    expect(hardcoded, `description 里出现硬编码字段名（应改为从契约派生）：${hardcoded.join(", ")}`).toEqual([])
    // 必须真的调用渲染器（否则空 description 也能过形态约束）
    expect(descSeg, "description 必须调用 renderReturnClause()（不得自己拼清单）").toContain("renderReturnClause()")
    // ② **值 pin（次）**：渲染子句的 token 序列 == CRITICAL（顺序敏感）⇒ 抓渲染器漏项/乱序
    expect(tokens(clause("返回")), "「返回」子句的字段序列必须与 CRITICAL 逐项一致").toEqual([...CRITICAL])
  })

  test("AC26：description 的「选填」子句必须**派生**（源码无参数名字面量）+ 值 pin", () => {
    // 事故形态：`选填：agent、constraints、grants、resume_session、remove、plan_ref。`
    //   ⇒ properties 里有 role_class（enum 三值），摘要里没提 ⇒ 派发方可能不知道有这个参数
    // ① 形态约束（主）：description 表达式内不得出现任何**参数名**的字符串字面量
    const hardcoded = allNames.filter((n) => new RegExp(`["'\`]${n}["'\`]`).test(descSeg))
    expect(hardcoded, `description 里出现硬编码参数名（应改为从 schema 派生）：${hardcoded.join(", ")}`).toEqual([])
    expect(descSeg, "description 必须从 optionalNames / requiredNames 派生").toMatch(/optionalNames|requiredNames/)
    // ② 值 pin（次）
    expect(tokens(clause("选填")), "「选填」子句必须与 schema 的非必填参数逐项一致").toEqual(optionalNames)
  })

  test("AC27：两个派发方 prompt 都必须覆盖 HANDOFF 的 kind 词表（真源 = build.md §HANDOFF）", () => {
    // AC3 只证明「build.md 里的 kind 集合 == 三类」；它**不证明**派发方认识这三类。
    // 事故形态：后端写 `HANDOFF: ac-fail`（要改已签批 ADR）⇒ plan.md/front.md 里 `ac-fail` 出现 0 次
    //   ⇒ 派发方读不懂 kind，只能读散文 ⇒ 无法机械判断该转 architect 还是改 plan。
    const start = BUILD_MD.split("\n").findIndex((l) => l.includes("#### HANDOFF：交回主会话的凭据化契约"))
    expect(start, "build.md 缺 §HANDOFF 段").toBeGreaterThan(-1)
    const rest = BUILD_MD.split("\n").slice(start + 1)
    const end = rest.findIndex((l) => /^#### /.test(l))
    const section = rest.slice(0, end < 0 ? rest.length : end).join("\n")
    const kindLine = section.split("\n").find((l) => l.includes("kind 只用既有三类"))
    expect(kindLine, "§HANDOFF 段里找不到「kind 只用既有三类」那句").toBeTruthy()
    const kinds = [...new Set([...(kindLine as string).matchAll(/`([a-z-]+)`/g)].map((m) => m[1]))]
    expect(kinds.sort(), "kind 集合与预期不符（先修 AC3 的真源）").toEqual(["ac-fail", "blocked", "needs-revision"])
    for (const [rel, text] of [
      ["prompts/plan.md", PLAN_MD2],
      ["prompts/front.md", FRONT_MD2],
    ] as const) {
      const missing = kinds.filter((k) => !text.includes(k as string))
      expect(missing, `${rel} 未覆盖 HANDOFF kind：${missing.join(", ")}（后端会发这些值，派发方必须认识）`).toEqual([])
    }
  })

  test("AC28：两个派发方 prompt 都必须覆盖 delegate 的**必填参数名**（列表从 schema 派生）", () => {
    // 事故形态：plan.md 全文 `project_dir` / `goal` / `constraints` / `grants` 各 0 次
    //   ⇒ plan 派发时靠 schema 的 description 兜底，本侧没有任何参数填表，也没有指向前端表
    expect(requiredNames.length, "schema 的 required 不应为空").toBeGreaterThan(0)
    for (const [rel, text] of [
      ["prompts/plan.md", PLAN_MD2],
      ["prompts/front.md", FRONT_MD2],
    ] as const) {
      const missing = requiredNames.filter((n) => !text.includes(n))
      expect(missing, `${rel} 未提及必填参数：${missing.join(", ")}（派发方必须知道要填什么）`).toEqual([])
    }
  })

  test("AC29：`<base>` 的实现通道**已落地**（行为断言：简报输出含基线行；登记已删）", () => {
    // ⚠ 本判据**已从「登记式」转为「行为断言」**（design D6）：
    //   通道落地前它只做「登记表里有条目即可」；那太松（源码里出现「基线」二字就算数）。
    //   现在直接断言**行为**：`buildBrief` 的输出含基线行。
    // ⇒ 若有人删掉基线行渲染，本条红；登记条目（KNOWN_UNIMPLEMENTED_CHANNELS）也不得再有 delegate-base。
    const entry = KNOWN_UNIMPLEMENTED_CHANNELS.find((k) => k.id === "delegate-base")
    expect(entry, "通道已落地 ⇒ 登记必须删（登记不得变成永久豁免）").toBeFalsy()
    expect(
      Object.prototype.hasOwnProperty.call(props, "base"),
      "delegate schema 缺 base ⇒ 通道未落地",
    ).toBe(true)
    // 行为断言：简报里必须有基线行（`<raw> → <sha>`）
    const briefText = buildBrief(
      validateBrief({
        project_dir: mkdtempSync(path.join(tmpdir(), "ac29-")),
        task: "取证",
        goal: "取证",
        scope: ["src"],
        acceptance: "ok",
        base: "HEAD~1",
      } as any) as any,
      "/tmp",
      { base: { raw: "HEAD~1", sha: "0".repeat(40) } },
    )
    expect(briefText, "简报缺基线行 ⇒ 通道未真正落地").toContain("基线（base）: HEAD~1 → ")
    expect(briefText).toMatch(/基线（base）: HEAD~1 → [0-9a-f]{40}/)
  })
})

/**
 * delegate-base-channel（AC10）：**文档面一致** —— 「新增派发参数 ⇒ 五个面同步」。
 *
 * ⚠ **为什么判「面」而不是「数字」**：本仓明确厌恶**手抄计数**（front.md 标题曾写
 * 「五个必填字段 + 两个选填」，而 schema 的选填数早就不是 2 了 ⇒ 计数失真无人察觉）。
 * ⇒ 判据只钉「该说的地方说了 base / 说了 resume 重填 / 不再带计数」，
 *   **不钉具体数字** ⇒ 参数增减时不会把判据变成另一份手抄清单。
 */
describe("delegate-base-channel：文档面一致（AC10）", () => {
  const PLAN_T = readFileSync(path.join(import.meta.dir, "..", "prompts", "plan.md"), "utf8")
  const FRONT_T = readFileSync(path.join(import.meta.dir, "..", "prompts", "front.md"), "utf8")
  const HANDOFF_T = readFileSync(path.join(import.meta.dir, "..", "docs", "backend-handoff-role-class.md"), "utf8")

  test("AC10-①：plan.md 的 verifier 行必须写明 base 必填", () => {
    const row = PLAN_T.split("\n").find((l) => l.includes("`verifier`") && l.includes(".rddf/state/verifier"))
    expect(row, "plan.md 的 verifier 选类行未找到").toBeTruthy()
    expect(row!, "verifier 行未提 base").toContain("base")
    expect(row!, "verifier 行未说「必填」").toContain("必填")
  })

  test("AC10-②：plan.md 的派发参数段必须写明 resume 须重填 base（且跨 resume 用当初的 sha）", () => {
    const start = PLAN_T.indexOf("**派发参数**")
    expect(start, "plan.md 缺「派发参数」段").toBeGreaterThan(-1)
    const seg = PLAN_T.slice(start, PLAN_T.indexOf("\n\n", start) + 2)
    expect(seg, "派发参数段未提 resume").toContain("resume")
    expect(seg, "派发参数段未提 base").toContain("base")
    expect(seg, "派发参数段未说明跨 resume 要用当初的 sha").toContain("sha")
  })

  test("AC10-③：front.md 的 role_class 参数行必须写明 base 必填 + resume 重填", () => {
    // ⚠ 必须锚「`role_class`（选填」—— front.md:26 的选类说明行也含 role_class + verifier
    const row = FRONT_T.split("\n").find((l) => l.includes("`role_class`（选填"))
    expect(row, "front.md 的 role_class 参数行未找到").toBeTruthy()
    expect(row!, "front.md 的 role_class 行未提 base").toContain("base")
    expect(row!, "front.md 的 role_class 行未提 resume").toContain("resume")
  })

  test("AC10-④：front.md 的 3.1 标题不得带手抄计数（参数增减会让它失真）", () => {
    const title = FRONT_T.split("\n").find((l) => l.includes("### 3.1"))
    expect(title, "front.md 缺 3.1 标题").toBeTruthy()
    expect(title!, "3.1 标题仍带手抄计数（必填/选填个数）⇒ 参数增减时失真").not.toMatch(/个必填|个选填/)
  })

  test("AC10-④b：backend-handoff-role-class.md 的参数流图必须含 base", () => {
    const line = HANDOFF_T.split("\n").find((l) => l.includes("delegate | dispatch"))
    expect(line, "backend-handoff-role-class.md 的参数流图行未找到").toBeTruthy()
    expect(line!, "参数流图未含 base（新增参数未同步）").toContain("base")
  })

  test("AC10-⑤：两个工具的 description 都必须写明「verifier 必填」与「resume 重填」", () => {
    const tool: any = delegateToolDefinition({} as any)
    const d = String(tool.input?.properties?.base?.description ?? "")
    expect(d, "delegate 的 base description 未提 verifier").toContain("verifier")
    expect(d, "delegate 的 base description 未提 resume").toContain("resume")
    // dispatch 的 description 是**手抄**的 ⇒ 必须另钉（它不会随 schema 自动更新）
    const asyncSrc = readFileSync(path.join(import.meta.dir, "..", "lib", "delegate-async.ts"), "utf8")
    const seg = asyncSrc.slice(asyncSrc.indexOf("export function dispatchToolDefinition"))
    expect(seg.slice(0, 4000), "dispatch 的手抄 description 未提 base").toContain("base")
    expect(seg.slice(0, 4000), "dispatch 的手抄 description 未提 verifier").toContain("verifier")
    expect(seg.slice(0, 4000), "dispatch 的手抄 description 未提 resume").toContain("resume")
  })
})
