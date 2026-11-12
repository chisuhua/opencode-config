/**
 * subagent 输入契约的**纯逻辑内核**（无 opencode 宿主依赖，可独立单元测试）。
 *
 * 宿主接线（context / tool.execute.before / session.prompt 三个钩子）只在
 * plugins/subagent-contract.ts；审计 CLI 只在 scripts/audit-subagent-prompts.ts。
 * 两者共用本文件的规则表与判定函数 —— 规则真源唯一，避免"配置与实现漂移"
 * （本仓库已因配置漂移出过两次事故，见 tests/config-guards.test.ts 头注释）。
 *
 * 要解决的问题：
 *   内置 `subagent` 工具的 `prompt` 声明为 `string`，没有任何结构约束 ——
 *   父模型写什么就传给子 agent 什么（实测：同一父会话里 critic 子会话的
 *   prompt 有编号版 / 加粗版 / 复审版三种形态）。本模块提供**可判定的**契约，
 *   由宿主层在三个时点执行：生成前告知（L3）、执行前拦截（L1）、落库前兜底（L2）。
 *
 * 三条硬约束：
 *  1. **只判可判定的事**：小节齐不齐、长度上下限、是否含真实 diff。
 *     「intent 写得对不对」不可判定 —— 不做伪判定。
 *  2. **默认 warn 不拦**：拦截强度由配置决定（~/.config/opencode/subagent-contract.json），
 *     默认 warn（只记录 + 审计报告），避免误伤 critic 复审轮。
 *  3. **豁免优先**：复审轮（只提交上轮 BLOCK 闭合证据）不含完整字段集，
 *     用关键词豁免 + 父会话状态继承两条兜底，避免把合法复审判成违规。
 */

export type ContractMode = "off" | "warn" | "enforce"

export interface ContractPattern {
  name: string
  /** 字符串形式的正则（存 JSON 友好；实际使用时 new RegExp） */
  pattern: string
}

export interface ContractRule {
  /** 目标 agent id */
  agent: string
  /** 首轮（新建子会话）必须包含的小节名 */
  requiredSections?: string[]
  /** 续接已有子会话时是否同样强制（默认 false：续接只是补充说明） */
  enforceOnResume?: boolean
  /** prompt 最小字符数 */
  minChars?: number
  /** prompt 最大字符数（防整个仓库被贴进去） */
  maxChars?: number
  /** 必须包含真实 diff（找 "diff --git"） */
  requireDiff?: boolean
  /**
   * 关键词豁免的**结构前置条件**：缺失小节数 ≥ 该值才允许豁免。
   *
   * 为什么需要：关键词对全文做正则，"第 2 轮"/"closure" 在真实 diff、
   * changes_summary 里也会偶发命中 —— 一次误豁免会把整个父会话后续
   * 30 分钟都拉进复审模式。闭合证据式 prompt 天然缺很多小节；
   * 而"只缺一两个字段的懒散新评审"不会被放行。
   * 缺省 = ceil(必需小节数 / 2)。
   */
  exemptMinMissing?: number
  /**
   * 豁免判断只看 prompt 开头 N 个字符（"任务陈述区"；缺省 {@link EXEMPT_KEYWORD_WINDOW_CHARS}）。
   *
   * 为什么需要：prompt 后半段多是**输出模板/约束**（"SHOULD_FIX 会被 critic 复审时
   * 升级为 BLOCKER"、"不需要复审代码"、"不要要求复审上一轮没提的部分"），那里出现的
   * "复审/上一轮"描述的是规则本身，不是本次任务。实测 90 条豁免里 4 条属于这类
   * 尾部误命中（位置 1194 / 1634 / 1958 / 5377），而真豁免全部落在 47–231 字符内。
   *
   * 同一窗口也用于 {@link ContractRule.inheritIf}（继承前置同样看任务陈述区）。
   */
  exemptWindow?: number
  /** 命中即豁免（小节检查降级为长度检查） */
  exemptIf?: ContractPattern[]
  /**
   * 状态继承的**附加前置**：本轮 prompt 自身必须引用上一轮（否则不算复审轮）。
   *
   * 为什么需要：同一父会话里连着审不同对象（ADR-090 / ADR-091 / ADR-092、
   * "MD §2.8 批" / "kimi-code 批"）时，上一轮的"复审模式"会把**全新的评审**
   * 一并放行 —— 实测 90 条豁免里有 8 条属于这种跨对象继承误伤。
   * 缺省不设（= 旧行为：继承即豁免）。
   */
  inheritIf?: ContractPattern[]
}

/** 豁免判断的默认生效窗口（字符数，从 prompt 开头算） */
export const EXEMPT_KEYWORD_WINDOW_CHARS = 400

export interface ContractAgentOverride {
  mode?: ContractMode
  requiredSections?: string[]
  minChars?: number
  maxChars?: number
  requireDiff?: boolean
  exemptIf?: ContractPattern[]
  inheritIf?: ContractPattern[]
}

export interface ContractConfig {
  /** 全局默认模式；缺省 "warn" */
  mode?: ContractMode
  /** 按 agent 覆盖 */
  agents?: Record<string, ContractAgentOverride>
  /** 违规日志路径；缺省 ~/.local/share/opencode/subagent-contract.log */
  log?: string
}

/**
 * 规则真源。
 *
 * critic 的 7 字段契约来自 prompts/build.md「调 critic 前的上下文组装 SOP」的
 * 7 字段上下文契约（changes_summary / intent / focus / review_profile /
 * diff_or_paths / context / expected_format）—— 两处必须保持一致，由
 * tests/config-guards.test.ts 的 L4 断言钉住。
 */
export const CONTRACTS: ContractRule[] = [
  {
    agent: "critic",
    requiredSections: [
      "changes_summary",
      "intent",
      "focus",
      "review_profile",
      "diff_or_paths",
      "context",
      "expected_format",
    ],
    enforceOnResume: false,
    minChars: 200,
    maxChars: 80000,
    exemptIf: [
      // 复审轮：只提交"上一轮 BLOCK 闭合证据"，天然不含完整 7 字段
      { name: "re-review-round", pattern: "(复审|第\\s*\\d+\\s*轮|闭合证据|closure|verify\\s+closure)" },
    ],
    // 继承"复审模式"时，本轮自己也必须指向上一轮（防同一父会话里审不同对象时误继承）
    inheritIf: [
      {
        name: "prev-round-reference",
        pattern:
          "(上一轮|上轮|前\\s*\\d+\\s*轮|第\\s*\\d+\\s*轮|[二三四]\\s*轮|rev\\.\\s*\\d+|闭合|closure|本轮修复|本轮增量)",
      },
    ],
  },
]

export interface Violation {
  code: string
  detail: string
}

export interface PromptInput {
  agent: string
  prompt: string
  /** true = 续接已有子会话（subagent.sessionID 非空） */
  isResume: boolean
  /**
   * 同一父会话 + 同一 agent 的**上一次调用是否被判为"复审轮"**。
   *
   * 语义刻意收窄：继承的是"上一轮是复审"这个**模式**，不是"上一轮合规"——
   * 后者会把"同一父会话里的新评审"也放行（实测这正是误伤面）。
   */
  priorReviewRound?: boolean
  /** 是否做长度检查（默认 true；L2 落库兜底时关掉，长度由 L1 负责） */
  checkLength?: boolean
}

export interface Evaluation {
  agent: string
  ok: boolean
  /** 是否走了豁免（小节检查被跳过，仍做长度检查） */
  exempted: boolean
  exemption?: string
  violations: Violation[]
  /** 面向模型的错误文案（可执行：说清缺什么、怎么改） */
  message?: string
}

/**
 * 抽取文本里出现的"小节名"。
 *
 * 实测过真实父模型产出的 4 种写法，都要认：
 *   ## 1. changes_summary          （编号标题）
 *   ## changes_summary              （纯标题）
 *   ## 3. focus（**只审这三条**）    （标题 + 尾部补充说明）
 *   **changes_summary**             （加粗独立行）
 *   - **intent**: ...               （列表项）
 */
export function sectionHeadings(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split("\n")) {
    let line = raw.trim()
    if (!line) continue
    // markdown 标题：去掉 "#" 与空格
    const heading = /^(#{1,6})\s*(.*)$/.exec(line)
    if (heading) line = (heading[2] ?? "").trim()
    // 列表项：去掉 "- " / "* " / "+ " 与有序列表编号
    line = line.replace(/^[-*+]\s+/, "")
    line = line.replace(/^\d+[.)]\s*/, "")
    // 去掉加粗 / 反引号包裹
    line = line.replace(/^\*\*/, "").replace(/\*\*$/, "")
    line = line.replace(/^`/, "").replace(/`$/, "")
    // 取首段标识符（允许下划线与连字符）
    const id = /^([A-Za-z_][A-Za-z0-9_-]*)/.exec(line)
    if (id) out.push((id[1] as string).toLowerCase())
  }
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 小节是否出现。
 *
 * 除"标题式"外，还认两种实测到的行内写法（父模型经常这么写，不该判成违规）：
 *   review_profile = **arch**      （赋值式）
 *   按 4 段式返回。**intent**: …   （行内加粗提及）
 */
export function hasSection(text: string, name: string): boolean {
  const n = name.toLowerCase()
  if (sectionHeadings(text).includes(n)) return true
  const esc = escapeRegExp(n)
  // 赋值式：name（可带 ** / `）后跟 : 或 =（中文冒号也算）
  const assign = new RegExp(`(?:^|[^A-Za-z0-9_])${esc}(?:\\*\\*|\`)?\\s*[:=：]`, "i")
  // 行内加粗/反引号提及
  const inline = new RegExp(`(?:\\*\\*|\`)${esc}(?:\\*\\*|\`)`, "i")
  for (const line of text.split("\n")) {
    if (assign.test(line) || inline.test(line)) return true
  }
  return false
}

/** 规则查表；未登记的 agent 返回 undefined（不受约束） */
export function findRule(agent: string, rules: ContractRule[] = CONTRACTS): ContractRule | undefined {
  return rules.find((r) => r.agent === agent)
}

/** 合并配置覆盖到规则（配置只覆盖字段，不新增规则） */
export function resolveRule(
  agent: string,
  config: ContractConfig = {},
  rules: ContractRule[] = CONTRACTS,
): ContractRule | undefined {
  const base = findRule(agent, rules)
  if (!base) return undefined
  const override = config.agents?.[agent]
  if (!override) return base
  return {
    ...base,
    requiredSections: override.requiredSections ?? base.requiredSections,
    minChars: override.minChars ?? base.minChars,
    maxChars: override.maxChars ?? base.maxChars,
    requireDiff: override.requireDiff ?? base.requireDiff,
    exemptIf: override.exemptIf ?? base.exemptIf,
    inheritIf: override.inheritIf ?? base.inheritIf,
  }
}

/** 解析某 agent 的生效模式：agent 级 > 全局 > "warn" */
export function resolveMode(agent: string, config: ContractConfig = {}): ContractMode {
  return config.agents?.[agent]?.mode ?? config.mode ?? "warn"
}

/**
 * 核心判定。
 *
 * 判定顺序（短路）：长度 → 豁免 → 续接 → 状态继承 → 小节齐备。
 * 豁免/续接/状态继承都只跳过**小节检查**，长度检查始终执行。
 */
export function evaluatePrompt(rule: ContractRule, input: PromptInput): Evaluation {
  const violations: Violation[] = []
  const text = input.prompt ?? ""
  const checkLength = input.checkLength !== false
  const isResume = input.isResume === true

  // 长度：max 始终生效；min 对续接轮不生效（续接只是补充说明，允许很短）
  if (checkLength && rule.maxChars !== undefined && text.length > rule.maxChars) {
    violations.push({
      code: "too-long",
      detail: `prompt 有 ${text.length} 字符，超过上限 ${rule.maxChars}（不要把整个仓库贴进来）`,
    })
  }
  if (checkLength && !isResume && rule.minChars !== undefined && text.length < rule.minChars) {
    violations.push({
      code: "too-short",
      detail: `prompt 只有 ${text.length} 字符，少于下限 ${rule.minChars}`,
    })
  }

  // 先算缺失小节 —— 豁免的"结构前置条件"要用它
  const need = rule.requiredSections ?? []
  const missing = isResume ? [] : need.filter((s) => !hasSection(text, s))
  const exemptThreshold = rule.exemptMinMissing ?? (need.length > 0 ? Math.ceil(need.length / 2) : 0)
  /**
   * 只有缺失过半，才可能是"闭合证据式"输入，才允许走豁免。
   * 否则一次关键词误命中（真实 diff 里出现"第 2 轮"/"closure"）会把整个父会话
   * 后续 30 分钟都拉进复审模式。
   */
  const canExempt = exemptThreshold > 0 && missing.length >= exemptThreshold
  // 豁免只看"任务陈述区"：后文是输出模板/约束，那里的"复审/上一轮"描述的是规则本身
  const taskStatement = text.slice(0, rule.exemptWindow ?? EXEMPT_KEYWORD_WINDOW_CHARS)

  let exempted = false
  let exemption: string | undefined

  if (!isResume && canExempt) {
    for (const ex of rule.exemptIf ?? []) {
      if (safeTest(ex.pattern, taskStatement)) {
        exempted = true
        exemption = ex.name
        break
      }
    }
    // 状态继承兜底：上一轮被判为"复审轮" → 本轮也按复审轮处理。
    // 配了 inheritIf 时，本轮 prompt 自己也要指向上一轮，否则视为新评审。
    if (!exempted && input.priorReviewRound === true) {
      const hints = rule.inheritIf ?? []
      if (hints.length === 0 || hints.some((h) => safeTest(h.pattern, taskStatement))) {
        exempted = true
        exemption = "prior-review-round"
      }
    }
  }

  if (!isResume && !exempted && missing.length > 0) {
    violations.push({
      code: "missing-sections",
      detail: `缺少小节：${missing.join(", ")}`,
    })
  }

  if (!isResume && !exempted && rule.requireDiff === true && !/^diff --git /m.test(text)) {
    violations.push({
      code: "missing-diff",
      detail: "未包含真实 diff（应含 \"diff --git\" 段）",
    })
  }

  const ok = violations.length === 0
  return {
    agent: input.agent,
    ok,
    exempted,
    exemption,
    violations,
    message: ok ? undefined : buildRejectionMessage(input.agent, rule, violations),
  }
}

/**
 * 面向模型的错误文案。
 *
 * 硬要求：**说清缺什么、怎么改、不要原样重试** —— 否则模型会原样重发同一个
 * prompt 形成死循环（工具错误会回灌给模型，模型可同回合重试）。
 */
export function buildRejectionMessage(
  agent: string,
  rule: ContractRule,
  violations: Violation[],
): string {
  const lines = violations.map((v) => `- ${v.detail}`)
  const need = rule.requiredSections ?? []
  const hint =
    need.length > 0
      ? `重新调用时，prompt 必须包含以下小节标题（每个一行，用 markdown 标题）：\n${need.map((s) => `## ${s}`).join("\n")}`
      : "按上面的问题修正 prompt 后重新调用。"
  return [
    `subagent input rejected: agent="${agent}" 的 prompt 不满足输入契约。`,
    ...lines,
    hint,
    "不要原样重试；也不要自行猜测缺失字段的内容 —— 缺失的字段来自父 agent 的判断，仓库里读不出来。",
  ].join("\n")
}

/**
 * 生成注入到 subagent 工具描述里的契约说明（L3）。
 *
 * opencode 自己就用同一个 context 钩子注入 "Available subagents:" 目录，
 * 我们沿用同一手法追加一段契约，父模型在生成 prompt 之前就能看到判据。
 */
export function describeContract(rule: ContractRule): string {
  const need = rule.requiredSections ?? []
  const parts: string[] = []
  if (need.length > 0) {
    parts.push(`- agent="${rule.agent}" 时，prompt 必须包含以下小节（每个一行）：`)
    for (const s of need) parts.push(`  ## ${s}`)
  }
  if (rule.minChars !== undefined) parts.push(`- prompt 至少 ${rule.minChars} 字符`)
  if (rule.maxChars !== undefined) parts.push(`- prompt 至多 ${rule.maxChars} 字符`)
  if (rule.requireDiff) parts.push(`- prompt 必须含真实 diff（"diff --git"）`)
  if ((rule.exemptIf ?? []).length > 0) {
    const window = rule.exemptKeywordWindow ?? EXEMPT_KEYWORD_WINDOW_CHARS
    const inherit = (rule.inheritIf ?? []).length > 0
    parts.push(
      `- 复审轮可豁免小节要求（关键词需出现在开头 ${window} 字符内${inherit ? "；继承上一轮时本轮需引用上一轮" : ""}）`,
    )
  }
  parts.push(`- 不满足时工具调用会被拒绝并返回缺失项；请按缺失项补齐后重发，不要原样重试。`)
  return ["## Input contract（违反者调用会被拒绝）", ...parts].join("\n")
}

/** 注入文本的幂等标记（避免同一请求重复追加） */
export const CONTRACT_MARKER = "## Input contract（违反者调用会被拒绝）"

/** 判断某段描述是否已包含契约注入（幂等检查） */
export function hasContractMarker(description: string): boolean {
  return description.includes(CONTRACT_MARKER)
}

/**
 * 一条会话链的输入（父会话 → 若干子会话，按时间升序）。
 * 审计脚本用；运行时插件用自己的内存状态，语义一致。
 */
export interface ChainEntry {
  sessionID: string
  agent: string
  /** 首条 user 消息全文 */
  prompt: string
  /** 是否续接（父传入 sessionID） */
  isResume: boolean
}

/**
 * 对一条父会话的子会话链逐条判定。
 *
 * **规则按条目自己的 agent 解析**（同一个父会话可能既调 critic 又调 oracle）。
 * **状态继承**：同一父会话 + 同一 agent 内，一旦某轮被判为"复审轮"（关键词命中），
 * 后续轮次继承该模式 → 跳过小节检查。这是关键词豁免之外的兜底；
 * 注意继承的是"复审模式"而不是"合规"，避免把同一父会话里的**新评审**也放行。
 */
export function evaluateChain(
  entries: ChainEntry[],
  ruleFor: (agent: string) => ContractRule | undefined,
): { entry: ChainEntry; evaluation: Evaluation }[] {
  const priorReviewRound = new Map<string, boolean>()
  return entries.map((entry) => {
    const rule = ruleFor(entry.agent)
    if (!rule) {
      // 无契约的 agent：不受约束
      return {
        entry,
        evaluation: { agent: entry.agent, ok: true, exempted: false, violations: [] },
      }
    }
    const evaluation = evaluatePrompt(rule, {
      agent: entry.agent,
      prompt: entry.prompt,
      isResume: entry.isResume,
      priorReviewRound: priorReviewRound.get(entry.agent) === true,
    })
    // 复审模式持续传递；一次"完整合规但非复审"的调用会把模式重置（那是新评审）；
    // 续接轮不动状态（它既不是新评审，也不该清零）。
    if (evaluation.exempted) priorReviewRound.set(entry.agent, true)
    else if (evaluation.ok && !entry.isResume) priorReviewRound.set(entry.agent, false)
    return { entry, evaluation }
  })
}

/** 安全的正则测试（非法 pattern 不应让整条链路崩掉） */
export function safeTest(pattern: string, text: string): boolean {
  try {
    return new RegExp(pattern).test(text)
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 三个钩子的处理逻辑（放进内核 → 可用假事件直接单测；插件壳只做接线）
// ─────────────────────────────────────────────────────────────────────────────

/** 跨调用状态：父会话 + agent → 上一次调用的复审模式 + 时间戳 */
export type CompliantState = Map<string, { reviewRound: boolean; at: number }>

export function stateKey(parentSessionID: string, agent: string): string {
  return `${parentSessionID}::${agent}`
}

/** 复审模式的有效期（默认 30 分钟）：超时的链不再继承 */
export const REVIEW_ROUND_TTL_MS = 30 * 60 * 1000

/** L3：把契约注入 subagent 工具描述（幂等）。返回是否发生了改动。 */
export function applyContextInjection(
  tool: { description?: string } | undefined,
  config: ContractConfig,
  rules: ContractRule[] = CONTRACTS,
): boolean {
  if (!tool) return false
  if (hasContractMarker(tool.description ?? "")) return false // 幂等

  const blocks: string[] = []
  for (const rule of rules) {
    if (resolveMode(rule.agent, config) === "off") continue
    blocks.push(describeContract(rule))
  }
  if (blocks.length === 0) return false
  tool.description = [tool.description ?? "", "", ...blocks].join("\n")
  return true
}

export interface GateInput {
  /** 目标 agent（子会话的 agent） */
  agent: string
  /** prompt 全文 */
  prompt: string
  /** 是否续接已有子会话 */
  isResume: boolean
  /** 父会话 id（状态继承用） */
  parentSessionID?: string
  /** 本次调用的模式；缺省从 config 解析 */
  mode?: ContractMode
  /** 是否做长度检查（默认 true；L2 落库兜底时关掉，长度由 L1 负责） */
  checkLength?: boolean
}

export interface GateResult {
  /** 该不该拦（模式为 off / 无契约 / 合规 → 不拦） */
  blocked: boolean
  /** 是否记录（warn 与 enforce 都记录） */
  shouldLog: boolean
  evaluation: Evaluation
  mode: ContractMode
  /** 面向模型的错误文案（blocked 时非空） */
  message?: string
}

/** L1 / L2 共用的判定入口：判定 + 决定拦不拦 + 更新状态 */
export function gate(input: GateInput, config: ContractConfig, state: CompliantState): GateResult {
  const mode = input.mode ?? resolveMode(input.agent, config)
  const rule = resolveRule(input.agent, config)
  if (mode === "off" || !rule) {
    return {
      blocked: false,
      shouldLog: false,
      mode,
      evaluation: { agent: input.agent, ok: true, exempted: false, violations: [] },
    }
  }

  const key = input.parentSessionID ? stateKey(input.parentSessionID, input.agent) : undefined
  const now = Date.now()
  const prior = key ? state.get(key) : undefined
  const priorReviewRound =
    prior !== undefined && now - prior.at <= REVIEW_ROUND_TTL_MS ? prior.reviewRound : false

  const evaluation = evaluatePrompt(rule, {
    agent: input.agent,
    prompt: input.prompt,
    isResume: input.isResume,
    priorReviewRound,
    checkLength: input.checkLength,
  })

  if (key) {
    // 复审模式持续传递；一次"完整合规但非复审"的调用会把模式重置（那是新评审）。
    // 续接轮（isResume）既不是新评审也不该清零 → 不动状态。
    if (evaluation.exempted) state.set(key, { reviewRound: true, at: now })
    else if (evaluation.ok && !input.isResume) state.set(key, { reviewRound: false, at: now })
  }

  if (evaluation.ok) {
    return { blocked: false, shouldLog: false, evaluation, mode }
  }
  return {
    blocked: mode === "enforce",
    shouldLog: true,
    evaluation,
    mode,
    message: evaluation.message,
  }
}

/** 清理过期状态（长驻 server 下 Map 不应无限增长） */
export function pruneState(state: CompliantState, ttlMs = REVIEW_ROUND_TTL_MS): number {
  const now = Date.now()
  let removed = 0
  for (const [key, value] of state) {
    if (now - value.at > ttlMs) {
      state.delete(key)
      removed++
    }
  }
  return removed
}
