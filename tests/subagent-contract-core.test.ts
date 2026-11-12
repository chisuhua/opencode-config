/**
 * subagent 输入契约的**纯逻辑单测**（不依赖真实 opencode 运行时）。
 *
 * 覆盖：小节识别（5 种实测写法）/ 判定与豁免 / 状态继承 / 三个钩子的处理逻辑 /
 *       配置解析 / 错误文案可执行性。
 *
 * 运行：bun test tests/subagent-contract-core.test.ts
 */
import { describe, expect, test } from "bun:test"

import {
  CONTRACT_MARKER,
  type CompliantState,
  CONTRACTS,
  type ContractConfig,
  EXEMPT_KEYWORD_WINDOW_CHARS,
  applyContextInjection,
  describeContract,
  evaluateChain,
  evaluatePrompt,
  findRule,
  gate,
  hasContractMarker,
  hasSection,
  resolveMode,
  resolveRule,
  sectionHeadings,
} from "../lib/subagent-contract-core.ts"

const CRITIC = findRule("critic")!

/** 一份合规的 7 字段 prompt（父模型实测产出过的形态） */
const COMPLIANT = [
  "请审查以下改动：",
  "",
  "## changes_summary",
  "- src/foo.cpp: 修 bug",
  "",
  "## intent",
  "修掉崩溃",
  "",
  "## focus",
  "1. 契约兼容",
  "2. 失败模式",
  "",
  "## review_profile",
  "build",
  "",
  "## diff_or_paths",
  "```diff",
  "diff --git a/src/foo.cpp b/src/foo.cpp",
  "```",
  "",
  "## context",
  "- 相关测试: tests/foo.test.ts",
  "",
  "## expected_format",
  "4 段式 + mergeable / scope_exceeded",
  "",
  "补充说明：这里是正文内容，用来满足最小长度要求。" + "x".repeat(120),
].join("\n")

describe("小节识别：父模型实测产出的 5 种写法都要认", () => {
  test("编号标题：## 1. changes_summary", () => {
    expect(hasSection("## 1. changes_summary\n- x", "changes_summary")).toBe(true)
  })

  test("纯标题：## intent", () => {
    expect(hasSection("## intent\n正文", "intent")).toBe(true)
  })

  test("标题 + 尾部补充说明：## 3. focus（**只审这三条**）", () => {
    expect(hasSection("## 3. focus（**只审这三条，其他不审**）\n正文", "focus")).toBe(true)
  })

  test("加粗独立行：**changes_summary**", () => {
    expect(hasSection("**changes_summary**\n- x", "changes_summary")).toBe(true)
  })

  test("列表项：- **intent**: ...", () => {
    expect(hasSection("- **intent**: 修掉崩溃", "intent")).toBe(true)
  })

  test("行内赋值：按…返回。review_profile = **arch**。", () => {
    expect(hasSection("按 **4 段式** 返回。review_profile = **arch**。", "review_profile")).toBe(true)
  })

  test("未出现 → false", () => {
    expect(hasSection("这里什么都没提", "intent")).toBe(false)
  })

  test("sectionHeadings 只取标识符，不带尾部说明", () => {
    expect(sectionHeadings("## 3. focus（只审三条）")).toEqual(["focus"])
  })
})

describe("判定：结构合规 / 不合规 / 长度", () => {
  test("7 字段齐全 → 合规", () => {
    const r = evaluatePrompt(CRITIC, { agent: "critic", prompt: COMPLIANT, isResume: false })
    expect(r.ok).toBe(true)
    expect(r.violations).toEqual([])
  })

  test("缺小节 → 违规，且列出缺哪几个", () => {
    const r = evaluatePrompt(CRITIC, {
      agent: "critic",
      prompt: "审查一下这个改动。" + "x".repeat(200),
      isResume: false,
    })
    expect(r.ok).toBe(false)
    expect(r.violations.map((v) => v.code)).toContain("missing-sections")
    const detail = r.violations.find((v) => v.code === "missing-sections")!.detail
    for (const s of CRITIC.requiredSections!) expect(detail).toContain(s)
  })

  test("too-short / too-long 独立判定", () => {
    const short = evaluatePrompt(CRITIC, { agent: "critic", prompt: "短", isResume: false })
    expect(short.violations.map((v) => v.code)).toContain("too-short")

    const long = evaluatePrompt(
      { ...CRITIC, requiredSections: [], maxChars: 50 },
      { agent: "critic", prompt: "x".repeat(100), isResume: false },
    )
    expect(long.violations.map((v) => v.code)).toContain("too-long")
  })
})

describe("豁免：复审轮（关键词）+ 状态继承（兜底）", () => {
  test("关键词豁免：prompt 含「复审」→ 跳过小节检查（长度仍查）", () => {
    const r = evaluatePrompt(CRITIC, {
      agent: "critic",
      prompt: "这是复审（第 2 轮），只判定上一轮 BLOCK 是否闭合。" + "x".repeat(200),
      isResume: false,
    })
    expect(r.ok).toBe(true)
    expect(r.exempted).toBe(true)
    expect(r.exemption).toBe("re-review-round")
  })

  test("关键词豁免不豁免长度", () => {
    const r = evaluatePrompt(CRITIC, {
      agent: "critic",
      prompt: "复审",
      isResume: false,
    })
    expect(r.ok).toBe(false)
    expect(r.violations.map((v) => v.code)).toContain("too-short")
  })

  test("状态继承：上一轮是复审，且本轮引用了上一轮 → 视为复审轮", () => {
    const r = evaluatePrompt(CRITIC, {
      agent: "critic",
      prompt: "已按上轮意见修复，补充说明。" + "x".repeat(200),
      isResume: false,
      priorReviewRound: true,
    })
    expect(r.ok).toBe(true)
    expect(r.exemption).toBe("prior-review-round")
  })

  test("状态继承有前置：上一轮是复审但本轮不引用上一轮 → 按新评审判（不豁免）", () => {
    // 同一父会话里连着审不同对象（ADR-090 → ADR-091）时不能继承"复审模式"
    const r = evaluatePrompt(CRITIC, {
      agent: "critic",
      prompt: "请审另一份 ADR 草案的技术正确性。" + "x".repeat(200),
      isResume: false,
      priorReviewRound: true,
    })
    expect(r.exempted).toBe(false)
    expect(r.violations.map((v) => v.code)).toContain("missing-sections")
  })

  test("关键词只在前 400 字符内生效：后文输出模板里的「复审」不构成豁免", () => {
    const r = evaluatePrompt(CRITIC, {
      agent: "critic",
      prompt:
        "请审这份刚起草的 ADR 草案。" +
        "x".repeat(600) +
        "\n### SHOULD_FIX（会被 critic 复审时升级为 BLOCKER）\n" +
        "y".repeat(200),
      isResume: false,
    })
    expect(r.exempted).toBe(false)
    expect(r.violations.map((v) => v.code)).toContain("missing-sections")
  })

  test("续接（isResume）跳过小节检查与长度下限（续接只是补充说明）", () => {
    const ok = evaluatePrompt(CRITIC, { agent: "critic", prompt: "补充：再加一条。", isResume: true })
    expect(ok.violations.map((v) => v.code)).not.toContain("missing-sections")
    expect(ok.violations.map((v) => v.code)).not.toContain("too-short")

    const long = evaluatePrompt(
      CRITIC,
      { agent: "critic", prompt: "x".repeat(200000), isResume: true },
    )
    expect(long.violations.map((v) => v.code)).toContain("too-long")
  })

  test("checkLength=false → 不做长度检查（L2 兜底路径）", () => {
    const r = evaluatePrompt(CRITIC, {
      agent: "critic",
      prompt: "短",
      isResume: false,
      checkLength: false,
    })
    expect(r.violations.map((v) => v.code)).not.toContain("too-short")
  })
})

describe("会话链：规则按条目自己的 agent 解析 + 状态继承", () => {
  test("同一父会话里 critic 与 oracle 混调 → oracle 不被 critic 的规则判违规", () => {
    const entries = [
      { sessionID: "c1", agent: "critic", prompt: "审查一下" + "x".repeat(200), isResume: false },
      { sessionID: "c2", agent: "oracle", prompt: "随便问问" + "x".repeat(200), isResume: false },
    ]
    const out = evaluateChain(entries, (agent) => resolveRule(agent))
    expect(out[0]!.evaluation.ok).toBe(false) // critic 违规
    expect(out[1]!.evaluation.ok).toBe(true) // oracle 无契约
  })

  test("先合规后违规 → 后者**不**被豁免（新一轮评审不放行，避免误伤面扩大）", () => {
    const entries = [
      { sessionID: "c1", agent: "critic", prompt: COMPLIANT, isResume: false },
      { sessionID: "c2", agent: "critic", prompt: "只有一句话" + "x".repeat(200), isResume: false },
    ]
    const out = evaluateChain(entries, (agent) => resolveRule(agent))
    expect(out[0]!.evaluation.ok).toBe(true)
    expect(out[1]!.evaluation.ok).toBe(false) // 新评审 → 仍判违规
    expect(out[1]!.evaluation.violations.map((v) => v.code)).toContain("missing-sections")
  })

  test("复审链：关键词命中后，后续轮次继承复审模式 → 豁免", () => {
    const entries = [
      {
        sessionID: "c1",
        agent: "critic",
        prompt: "这是复审（第 2 轮），只判定上一轮 BLOCK 是否闭合。" + "x".repeat(200),
        isResume: false,
      },
      {
        sessionID: "c2",
        agent: "critic",
        prompt: "继续核对上一轮 BLOCK。" + "x".repeat(200),
        isResume: false,
      },
    ]
    const out = evaluateChain(entries, (agent) => resolveRule(agent))
    expect(out[0]!.evaluation.exemption).toBe("re-review-round")
    expect(out[1]!.evaluation.exemption).toBe("prior-review-round")
    expect(out[1]!.evaluation.ok).toBe(true)
  })
})

describe("配置解析：agent 级 > 全局 > 默认 warn", () => {
  test("默认 warn", () => {
    expect(resolveMode("critic", {})).toBe("warn")
  })

  test("全局覆盖", () => {
    expect(resolveMode("critic", { mode: "enforce" })).toBe("enforce")
  })

  test("agent 级覆盖全局", () => {
    const cfg: ContractConfig = { mode: "enforce", agents: { critic: { mode: "off" } } }
    expect(resolveMode("critic", cfg)).toBe("off")
    expect(resolveMode("oracle", cfg)).toBe("enforce")
  })

  test("配置可覆盖 requiredSections / 长度", () => {
    const rule = resolveRule("critic", { agents: { critic: { requiredSections: ["intent"] } } })!
    expect(rule.requiredSections).toEqual(["intent"])
  })

  test("未登记的 agent 无规则", () => {
    expect(resolveRule("explore")).toBeUndefined()
  })
})

describe("L3：契约注入（幂等）", () => {
  test("注入后包含契约段与标记", () => {
    const tool: { description?: string } = { description: "Spawns an agent..." }
    expect(applyContextInjection(tool, {})).toBe(true)
    expect(tool.description).toContain(CONTRACT_MARKER)
    expect(tool.description).toContain("## intent")
    expect(hasContractMarker(tool.description!)).toBe(true)
  })

  test("重复注入不叠加（幂等）", () => {
    const tool: { description?: string } = { description: "x" }
    applyContextInjection(tool, {})
    const first = tool.description
    expect(applyContextInjection(tool, {})).toBe(false)
    expect(tool.description).toBe(first)
  })

  test("mode=off → 不注入", () => {
    const tool: { description?: string } = { description: "x" }
    expect(applyContextInjection(tool, { mode: "off" })).toBe(false)
    expect(tool.description).toBe("x")
  })

  test("describeContract 列出必需小节", () => {
    const text = describeContract(CRITIC)
    for (const s of CRITIC.requiredSections!) expect(text).toContain(s)
  })

  test("describeContract 说明豁免前置（关键词窗口 + 继承需引用上一轮）", () => {
    const text = describeContract(CRITIC)
    expect(text).toContain(`开头 ${EXEMPT_KEYWORD_WINDOW_CHARS} 字符`)
    expect(text).toContain("继承上一轮时本轮需引用上一轮")
  })
})

describe("L1 / L2 门：warn 只记录、enforce 才拦", () => {
  test("warn：不合规 → shouldLog=true、blocked=false", () => {
    const state: CompliantState = new Map()
    const r = gate(
      { agent: "critic", prompt: "审查一下", isResume: false, parentSessionID: "p1" },
      { mode: "warn" },
      state,
    )
    expect(r.shouldLog).toBe(true)
    expect(r.blocked).toBe(false)
    expect(r.message).toBeTruthy()
  })

  test("enforce：不合规 → blocked=true，且错误文案可执行", () => {
    const state: CompliantState = new Map()
    const r = gate(
      { agent: "critic", prompt: "审查一下", isResume: false, parentSessionID: "p1" },
      { mode: "enforce" },
      state,
    )
    expect(r.blocked).toBe(true)
    expect(r.message).toContain("缺少小节")
    expect(r.message).toContain("不要原样重试")
    expect(r.message).toContain("## intent")
  })

  test("enforce：复审链 —— 关键词命中后，后续轮次继承复审模式", () => {
    const state: CompliantState = new Map()
    // 第 1 轮：命中关键词 → 豁免，并把"复审模式"记进状态
    const r = gate(
      {
        agent: "critic",
        prompt: "这是复审（第 2 轮），只判定上一轮 BLOCK 是否闭合。" + "x".repeat(200),
        isResume: false,
        parentSessionID: "p1",
      },
      { mode: "enforce" },
      state,
    )
    expect(r.blocked).toBe(false)
    expect(r.evaluation.exemption).toBe("re-review-round")
    expect(state.get("p1::critic")?.reviewRound).toBe(true)

    // 第 2 轮：关键词没命中，但继承"上一轮是复审" → 仍豁免小节检查
    const r2 = gate(
      {
        agent: "critic",
        prompt: "继续核对上一轮的 BLOCK 是否已闭合。" + "x".repeat(200),
        isResume: false,
        parentSessionID: "p1",
      },
      { mode: "enforce" },
      state,
    )
    expect(r2.blocked).toBe(false)
    expect(r2.evaluation.exemption).toBe("prior-review-round")
  })

  test("enforce：一次完整合规的评审会把复审模式重置（新一轮不该继承豁免）", () => {
    const state: CompliantState = new Map()
    // 先来一轮完整合规
    const r = gate(
      { agent: "critic", prompt: COMPLIANT, isResume: false, parentSessionID: "p2" },
      { mode: "enforce" },
      state,
    )
    expect(r.blocked).toBe(false)
    expect(state.get("p2::critic")?.reviewRound).toBe(false)

    // 紧接着一次"缺小节"的新评审 → 不该被豁免 → 应被拦
    const r2 = gate(
      {
        agent: "critic",
        prompt: "另一个评审任务，只写了一句话。" + "x".repeat(200),
        isResume: false,
        parentSessionID: "p2",
      },
      { mode: "enforce" },
      state,
    )
    expect(r2.blocked).toBe(true)
    expect(r2.evaluation.violations.map((v) => v.code)).toContain("missing-sections")
  })

  test("关键词豁免的结构前置条件：只缺 1-2 个小节时，命中关键词也不豁免", () => {
    // 缺 6/7 → 超过阈值（ceil(7/2)=4）→ 允许豁免
    const mostly = evaluatePrompt(CRITIC, {
      agent: "critic",
      prompt:
        "这是复审（第 2 轮）。\n## changes_summary\n- x\n## intent\n修\n## focus\n1. a\n" + "x".repeat(200),
      isResume: false,
    })
    expect(mostly.exempted).toBe(true)

    // 只缺 1 个小节（expected_format）→ 不到阈值 → 即使命中关键词也不豁免
    const almost = evaluatePrompt(CRITIC, {
      agent: "critic",
      prompt:
        "第 2 轮修订说明。\n## changes_summary\n- x\n## intent\n修\n## focus\n1. a\n## review_profile\nbuild\n## diff_or_paths\ndiff --git a/x b/x\n## context\n- t\n" +
        "x".repeat(200),
      isResume: false,
    })
    expect(almost.exempted).toBe(false)
    expect(almost.violations.map((v) => v.code)).toContain("missing-sections")
  })

  test("复审链回归：完整评审 → 关键词复审 → resume → 无关键词闭合证据（第 4 步仍豁免）", () => {
    const state: CompliantState = new Map()
    const step = (prompt: string, isResume: boolean) =>
      gate({ agent: "critic", prompt, isResume, parentSessionID: "p3" }, { mode: "enforce" }, state)

    // ① 完整评审
    const s1 = step(COMPLIANT, false)
    expect(s1.blocked).toBe(false)
    expect(s1.evaluation.exempted).toBe(false)

    // ② 关键词复审（缺全部 7 个小节 → 超过阈值）
    const s2 = step("这是复审（第 2 轮），只判定上一轮 BLOCK 是否闭合。" + "x".repeat(220), false)
    expect(s2.blocked).toBe(false)
    expect(s2.evaluation.exemption).toBe("re-review-round")
    expect(state.get("p3::critic")?.reviewRound).toBe(true)

    // ③ resume 补充说明 → 不该把复审模式清零
    const s3 = step("补充：再加一条。", true)
    expect(s3.blocked).toBe(false)
    expect(state.get("p3::critic")?.reviewRound).toBe(true)

    // ④ 无关键词的闭合证据 → 继承复审模式 → 仍豁免
    const s4 = step("已按上轮修复，diff 如下。" + "x".repeat(220), false)
    expect(s4.blocked).toBe(false)
    expect(s4.evaluation.exemption).toBe("prior-review-round")
  })

  test("豁免 → shouldLog=true（豁免也要可观测）、blocked=false", () => {
    const state: CompliantState = new Map()
    const r = gate(
      {
        agent: "critic",
        prompt: "这是复审（第 2 轮），只判定上一轮 BLOCK 是否闭合。" + "x".repeat(220),
        isResume: false,
        parentSessionID: "p-ex",
      },
      { mode: "enforce" },
      state,
    )
    expect(r.blocked).toBe(false)
    expect(r.evaluation.exempted).toBe(true)
    expect(r.shouldLog).toBe(true)
    expect(state.get("p-ex::critic")?.reviewRound).toBe(true)
  })

  test("off → 完全不管", () => {
    const state: CompliantState = new Map()
    const r = gate(
      { agent: "critic", prompt: "审查一下", isResume: false },
      { mode: "off" },
      state,
    )
    expect(r.shouldLog).toBe(false)
    expect(r.blocked).toBe(false)
  })

  test("无契约的 agent → 完全不管", () => {
    const state: CompliantState = new Map()
    const r = gate(
      { agent: "oracle", prompt: "x", isResume: false },
      { mode: "enforce" },
      state,
    )
    expect(r.shouldLog).toBe(false)
    expect(r.blocked).toBe(false)
  })
})

describe("规则真源自洽", () => {
  test("critic 契约登记且字段非空", () => {
    expect(CONTRACTS.find((r) => r.agent === "critic")).toBeDefined()
    expect(CRITIC.requiredSections!.length).toBe(7)
  })
})
