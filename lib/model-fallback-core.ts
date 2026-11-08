/**
 * model-fallback 的**纯逻辑内核**（无 opencode 宿主依赖，可独立单元测试）。
 *
 * 宿主接线（session retry hook 注册）只在 plugins/model-fallback.ts。
 *
 * 设计依据（2026-11-06 architect 设计，用户选定 D 方案）：
 *  - OpenCode v2.2.5 没有原生"模型链"配置；agent.model 是单值。
 *  - 但 SessionDomain 暴露了 `retry` 钩子（含 error / attempt / decision）与
 *    `switchModel`，足以实现"失败 → 换链上下一个模型 → 重试"。
 *  - 宿主插件沙箱只提供 `effect` 与 `@opencode/plugin` 两个外部包；node 内置模块
 *    （node:fs / node:os / node:path）可用。本文件**不得依赖任何第三方 npm 包**。
 *
 * 三条硬约束：
 *  1. 只对"模型/服务不可用"类错误降级；上下文超长、内容策略、工具调用错误一律不降级。
 *  2. 链耗尽即放弃（decision.retry = false），不循环、不无限重试。
 *  3. 降级必须可见 —— 由 plugins 层记日志 + 触发 session.model.selected（TUI 模型指示器
 *     立即变化）；会话内 synthetic 通知是可选的（实测会多触发一轮模型调用，默认关闭）。
 */

export interface ModelRef {
  providerID: string
  /** 模型 id。对应 opencode 的 Model.Ref.id（不是 modelID） */
  id: string
  variant?: string
}

export interface RetryError {
  type: string
  message: string
  status?: number
  response?: { body: string }
  /** 上游建议的重试等待（毫秒） */
  retryAfterMs?: number
}

export type ErrorClass = "model-unavailable" | "transient" | "rate-limited" | "client-error"

export type FallbackAction =
  | { kind: "none" }
  | { kind: "retry"; delay: number }
  | { kind: "switch"; from: ModelRef; to: ModelRef; delay: number }
  | { kind: "give-up"; from: ModelRef; reason: string }

export interface FallbackPolicy {
  /** 同一模型上允许的瞬时错误重试次数，超过后换链 */
  maxSameModelRetries: number
  /** 429 且未给 retryAfterMs 时，允许的原地等待次数 */
  maxRateLimitWaits: number
  baseDelayMs: number
  maxDelayMs: number
  /** 判定为不可用的模型在该时长内会被跳过 */
  cooldownMs: number
}

export interface FallbackState {
  /** 当前模型在链上的下标；-1 表示不在链上（首次降级会落到链首） */
  index: number
  sameModelRetries: number
  rateLimitWaits: number
  switches: number
  /** modelKey -> 冷却截止 epoch ms */
  cooldownUntil: Map<string, number>
}

export const DEFAULT_POLICY: FallbackPolicy = {
  maxSameModelRetries: 2,
  maxRateLimitWaits: 2,
  baseDelayMs: 500,
  maxDelayMs: 15_000,
  cooldownMs: 5 * 60_000,
}

/**
 * 默认**后备**候选（不含链头）：同型号优先、provider 分散。
 * 链头 = 该 agent 在 opencode.jsonc 里配置的模型，由宿主运行时注入（见 buildChain）。
 */
export const DEFAULT_FALLBACKS: Record<string, ModelRef[]> = {
  build: [
    { providerID: "commandcode", id: "deepseek/deepseek-v4.1-flash" },
    { providerID: "minimax-cn", id: "MiniMax-M3.1-Flash" },
    { providerID: "openstarry", id: "deepseek-v4.1-flash" },
    { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
  ],
}

export type NotifyMode = "log" | "synthetic"

export interface FallbackConfig {
  /** 每个 agent 的后备候选（链头由 agent 自身配置决定） */
  chains: Record<string, ModelRef[]>
  policy: Partial<FallbackPolicy>
  notify: NotifyMode
}

/**
 * 组装最终链：agent 自身配置的模型永远在链首，其余按候选顺序追加，去重。
 * 改 agent 的默认模型 = 改链头；改后备 = 改配置文件。
 */
export function buildChain(head: ModelRef | undefined, candidates: readonly ModelRef[]): ModelRef[] {
  const out: ModelRef[] = []
  const seen = new Set<string>()
  for (const model of [head, ...candidates]) {
    if (!model || !model.providerID || !model.id) continue
    const key = modelKey(model)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...model })
  }
  return out
}

/** 解析用户配置文件；任何非法项一律忽略，不让坏配置炸掉插件加载。 */
export function parseConfig(raw: unknown): FallbackConfig {
  const result: FallbackConfig = { chains: {}, policy: {}, notify: "log" }
  if (!raw || typeof raw !== "object") return result
  const source = raw as Record<string, unknown>

  if (source.notify === "synthetic") result.notify = "synthetic"

  const policy = source.policy
  if (policy && typeof policy === "object") {
    const p = policy as Record<string, unknown>
    const numbers: Array<keyof FallbackPolicy> = [
      "maxSameModelRetries",
      "maxRateLimitWaits",
      "baseDelayMs",
      "maxDelayMs",
      "cooldownMs",
    ]
    for (const key of numbers) {
      const value = p[key]
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        ;(result.policy as Record<string, number>)[key] = value
      }
    }
  }

  const chains = source.chains
  if (chains && typeof chains === "object") {
    for (const [agent, list] of Object.entries(chains as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const models = list.filter(
        (item): item is ModelRef =>
          !!item &&
          typeof item === "object" &&
          typeof (item as ModelRef).providerID === "string" &&
          typeof (item as ModelRef).id === "string",
      )
      if (models.length > 0) result.chains[agent] = models.map((model) => ({ ...model }))
    }
  }

  return result
}

export function modelKey(model: ModelRef): string {
  return `${model.providerID}/${model.id}`
}

export function formatModel(model: ModelRef): string {
  return modelKey(model)
}

/**
 * 创建会话状态。`cooldownUntil` 可传入**跨会话共享**的 Map —— 某个 provider 挂了
 * 对所有会话都是挂了，冷却表应当是进程级的，不该每个 session 各一份。
 */
export function createState(cooldownUntil: Map<string, number> = new Map()): FallbackState {
  return { index: -1, sameModelRetries: 0, rateLimitWaits: 0, switches: 0, cooldownUntil }
}

/** 新用户轮开始时重置推进状态，但保留冷却表（避免立刻再撞刚失败的模型）。 */
export function resetState(state: FallbackState): FallbackState {
  return {
    index: -1,
    sameModelRetries: 0,
    rateLimitWaits: 0,
    switches: 0,
    cooldownUntil: state.cooldownUntil,
  }
}

/** 明确不可降级：内容策略 / 拒绝回答。命中即短路，哪怕文案里带 forbidden。 */
// 注意：不能把裸 "forbidden" 算进来 —— provider 的 403 Forbidden（订阅未配置等）
// 恰恰是要降级的场景。只有出现 policy / content / safety 这类"被拒绝"语义才短路。
const CONTENT_POLICY_PATTERN =
  /(content[ _-]?polic|safety|moderation|policy[ _-]?violation|policy[ _-]?(forbidden|denied|reject|block)|(forbidden|denied|reject|block).{0,20}policy|refused to (answer|comply))/i
/** 明确不可降级：上下文 / 输入长度超限。该压缩上下文，不是模型坏了。 */
const CONTEXT_LIMIT_PATTERN =
  /(context[ _-]?(length|window|limit)|maximum context|context_length_exceeded|too many tokens|token[ _-]?limit|input[ _-]?too[ _-]?long|prompt[ _-]?too[ _-]?long|max_tokens|request too large)/i
/**
 * 订阅 / 额度耗尽型硬失败：换模型才有意义（原地等也等不来）。
 * quota 系词条的归属以本条为准 —— 下面 RATE_LIMIT_PATTERN 只认 `quota exceeded`，
 * 两边不要互相添加对方的词根。
 */
const SUBSCRIPTION_PATTERN =
  /(subscription (quota|not (configured|active|enabled)|expired)|insufficient (quota|balance|credit)|not configured subscription|订阅额度|未配置订阅|额度不足)/i
/** 明确的模型级信号：只在文案直接点名"模型"时才命中，泛化的 forbidden/unauthorized 不算。 */
const MODEL_UNAVAILABLE_PATTERN =
  /(model[ _-]?(not[ _-]?(found|available|supported|enabled|exist)|does not exist|unavailable)|no such model|unknown[ _-]?model|invalid[ _-]?model|unsupported[ _-]?model|model_not_found|model[ _-]?disabled)/i
const RATE_LIMIT_PATTERN = /(rate[ _-]?limit|too many requests|quota exceeded|并发.{0,4}限|限流)/i
const TRANSIENT_PATTERN =
  /(network|timeout|timed out|econn|socket|fetch failed|connection (reset|refused)|overloaded|service unavailable|internal server|bad gateway|gateway timeout)/i

/**
 * 错误分类。判定顺序刻意固定：
 *   1. 明确的"不可降级"信号（内容策略 / 上下文超限）先短路 —— 换弱模型重试这些
 *      既无意义又危险（上下文超限该走 compaction，内容策略该直接报错）。
 *   2. 订阅/额度硬失败 → 模型不可用（换模型才有意义）。
 *   3. 明确的模型级文案 → 模型不可用。
 *   4. 限流文案 → 限流。
 *   5. HTTP 状态兜底。
 *   6. 其余 → client-error（不降级）。
 */
export function classifyError(error: RetryError): ErrorClass {
  const text = `${error.type ?? ""} ${error.message ?? ""}`

  if (CONTENT_POLICY_PATTERN.test(text)) return "client-error"
  if (CONTEXT_LIMIT_PATTERN.test(text)) return "client-error"
  if (SUBSCRIPTION_PATTERN.test(text)) return "model-unavailable"
  if (MODEL_UNAVAILABLE_PATTERN.test(text)) return "model-unavailable"
  if (RATE_LIMIT_PATTERN.test(text)) return "rate-limited"

  const status = error.status
  if (status === 429) return "rate-limited"
  if (status === 401 || status === 403 || status === 404) return "model-unavailable"
  if (status === 408) return "transient"
  if (typeof status === "number" && status >= 500) return "transient"
  if (status === 400 || status === 413 || status === 422) return "client-error"

  if (TRANSIENT_PATTERN.test(text)) return "transient"
  return "client-error"
}

function backoff(attempt: number, policy: FallbackPolicy): number {
  const n = Math.max(1, attempt)
  return Math.min(policy.baseDelayMs * 2 ** (n - 1), policy.maxDelayMs)
}

export function indexOfModel(chain: readonly ModelRef[], model: ModelRef): number {
  const key = modelKey(model)
  return chain.findIndex((candidate) => modelKey(candidate) === key)
}

function currentIndex(state: FallbackState, chain: readonly ModelRef[], model: ModelRef): number {
  const found = indexOfModel(chain, model)
  return found !== -1 ? found : state.index
}

/**
 * 从 fromIndex 之后找第一个未冷却的候选；走到链尾后绕回链首（跳过当前模型与冷却中的模型）。
 * 绕回是必要的：链尾模型失败时，链首可能已恢复（冷却到期）。
 */
function nextAvailableIndex(
  state: FallbackState,
  chain: readonly ModelRef[],
  fromIndex: number,
  now: number,
): number | undefined {
  const start = fromIndex < 0 ? -1 : fromIndex
  for (let step = 1; step <= chain.length; step++) {
    const i = (start + step + chain.length) % chain.length
    if (i === fromIndex) continue
    const key = modelKey(chain[i])
    const until = state.cooldownUntil.get(key) ?? 0
    if (until <= now) return i
  }
  return undefined
}

export interface RetryInput {
  state: FallbackState
  chain: readonly ModelRef[]
  model: ModelRef
  error: RetryError
  now: number
  policy?: FallbackPolicy
}

export interface RetryPlan {
  action: FallbackAction
  state: FallbackState
  /** 本次决策要写入冷却表的条目（modelKey -> 截止 epoch ms）。由调用方落盘，保持本函数纯。 */
  cooldown: Map<string, number>
}

/**
 * 纯函数决策：不修改入参 state，返回新 state。
 *
 * 调用方（plugins 层）在 `switchModel` 成功后采用 nextState；失败则保留旧 state
 * 并自行降级为 retry（见 plugins/model-fallback.ts）。
 */
export function planRetry(input: RetryInput): RetryPlan {
  const policy = input.policy ?? DEFAULT_POLICY
  const state = cloneState(input.state)
  const chain = input.chain
  const cls = classifyError(input.error)

  if (cls === "client-error") {
    return { action: { kind: "none" }, state, cooldown: new Map() }
  }

  const index = currentIndex(state, chain, input.model)

  if (cls === "rate-limited") {
    if (state.rateLimitWaits < policy.maxRateLimitWaits) {
      const delay = input.error.retryAfterMs ?? backoff(state.rateLimitWaits + 1, policy)
      if (delay <= policy.maxDelayMs) {
        state.rateLimitWaits += 1
        return { action: { kind: "retry", delay }, state, cooldown: new Map() }
      }
    }
    return switchPlan(state, chain, index, input, policy)
  }

  if (cls === "transient") {
    if (state.sameModelRetries < policy.maxSameModelRetries) {
      state.sameModelRetries += 1
      return {
        action: { kind: "retry", delay: backoff(state.sameModelRetries, policy) },
        state,
        cooldown: new Map(),
      }
    }
    return switchPlan(state, chain, index, input, policy)
  }

  // model-unavailable：不原地重试，直接换链
  return switchPlan(state, chain, index, input, policy)
}

function switchPlan(
  state: FallbackState,
  chain: readonly ModelRef[],
  index: number,
  input: RetryInput,
  policy: FallbackPolicy,
): RetryPlan {
  const from = input.model
  // 冷却条目不在这里落盘：交给调用方写进进程级冷却表，保持本函数纯
  const cooldown = new Map<string, number>([
    [modelKey(from), input.now + policy.cooldownMs],
  ])

  // 防止状态漂移导致无限换链
  if (state.switches >= chain.length * 2) {
    return {
      action: { kind: "give-up", from, reason: "switch budget exhausted" },
      state,
      cooldown,
    }
  }

  const next = nextAvailableIndex(state, chain, index, input.now)
  if (next === undefined) {
    return {
      action: { kind: "give-up", from, reason: "no available fallback model" },
      state,
      cooldown,
    }
  }

  state.index = next
  state.switches += 1
  state.sameModelRetries = 0
  state.rateLimitWaits = 0
  return { action: { kind: "switch", from, to: chain[next], delay: 0 }, state, cooldown }
}

function cloneState(state: FallbackState): FallbackState {
  return {
    index: state.index,
    sameModelRetries: state.sameModelRetries,
    rateLimitWaits: state.rateLimitWaits,
    switches: state.switches,
    // 冷却表按引用共享：决策是纯函数，但冷却语义是进程级的
    cooldownUntil: state.cooldownUntil,
  }
}

