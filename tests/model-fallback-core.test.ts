/**
 * model-fallback 纯逻辑单元测试。
 *
 * 覆盖：错误分类、链推进、冷却、429 退避、不降级场景、链耗尽、状态不可变。
 *
 * 运行：bun test tests/
 */
import { describe, expect, test } from "bun:test"

import {
  DEFAULT_FALLBACKS,
  DEFAULT_POLICY,
  buildChain,
  classifyError,
  createState,
  formatModel,
  modelKey,
  parseConfig,
  planRetry,
  resetState,
  type FallbackState,
  type ModelRef,
  type RetryError,
} from "../lib/model-fallback-core.ts"

const CHAIN: ModelRef[] = [
  { providerID: "p1", id: "m1" },
  { providerID: "p2", id: "m2" },
  { providerID: "p3", id: "m3" },
]

const POLICY = { ...DEFAULT_POLICY, cooldownMs: 60_000, baseDelayMs: 100 }

function err(partial: Partial<RetryError>): RetryError {
  return { type: "error", message: "", ...partial }
}

function plan(
  state: FallbackState,
  model: ModelRef,
  error: RetryError,
  now = 1_000_000,
) {
  return planRetry({ state, chain: CHAIN, model, error, now, policy: POLICY })
}

describe("classifyError", () => {
  test("401/403/404 是 model-unavailable", () => {
    expect(classifyError(err({ status: 401 }))).toBe("model-unavailable")
    expect(classifyError(err({ status: 403 }))).toBe("model-unavailable")
    expect(classifyError(err({ status: 404 }))).toBe("model-unavailable")
  })

  test("5xx 与网络类是 transient", () => {
    expect(classifyError(err({ status: 500 }))).toBe("transient")
    expect(classifyError(err({ status: 503 }))).toBe("transient")
    expect(classifyError(err({ type: "network", message: "fetch failed" }))).toBe("transient")
    expect(classifyError(err({ message: "request timed out" }))).toBe("transient")
  })

  test("429 与 rate limit 文案是 rate-limited", () => {
    expect(classifyError(err({ status: 429 }))).toBe("rate-limited")
    expect(classifyError(err({ message: "rate limit exceeded" }))).toBe("rate-limited")
  })

  test("文案里的模型级错误优先于 400", () => {
    expect(classifyError(err({ status: 400, message: "model not found" }))).toBe("model-unavailable")
    expect(classifyError(err({ status: 400, message: "invalid model id" }))).toBe("model-unavailable")
  })

  test("上下文超长 / 参数错误 / 内容策略 都是 client-error（不降级）", () => {
    expect(classifyError(err({ status: 400, message: "context length exceeded" }))).toBe("client-error")
    expect(classifyError(err({ status: 422, message: "invalid tool schema" }))).toBe("client-error")
    expect(classifyError(err({ status: 400, message: "content policy violation" }))).toBe("client-error")
    expect(classifyError(err({ type: "unknown", message: "boom" }))).toBe("client-error")
  })

  test("内容策略文案里带 forbidden 也不降级（critic BLOCKER 1）", () => {
    expect(
      classifyError(err({ status: 400, message: "content policy violation: request forbidden" })),
    ).toBe("client-error")
    expect(classifyError(err({ status: 403, message: "request forbidden by policy" }))).toBe(
      "client-error",
    )
  })

  test("裸 403 Forbidden 仍要降级（订阅未配置等硬失败）", () => {
    expect(classifyError(err({ status: 403, message: "Forbidden" }))).toBe("model-unavailable")
    expect(classifyError(err({ status: 403, message: "403 Forbidden" }))).toBe("model-unavailable")
  })

  test("token limit exceeded 是上下文超限，不是限流（critic BLOCKER 1）", () => {
    expect(classifyError(err({ status: 400, message: "token limit exceeded, reduce input" }))).toBe(
      "client-error",
    )
    expect(classifyError(err({ status: 400, message: "maximum context length is 1000000" }))).toBe(
      "client-error",
    )
  })

  test("订阅额度不足属硬失败 → model-unavailable（换模型才有意义）", () => {
    expect(
      classifyError(
        err({ status: 403, message: "订阅额度不足或未配置订阅: subscription quota insufficient" }),
      ),
    ).toBe("model-unavailable")
    expect(classifyError(err({ status: 403, message: "insufficient balance" }))).toBe("model-unavailable")
  })

  test("真正的限流仍是 rate-limited", () => {
    expect(classifyError(err({ status: 429, message: "rate limit exceeded" }))).toBe("rate-limited")
    expect(classifyError(err({ message: "too many requests" }))).toBe("rate-limited")
  })
})

describe("planRetry — 不降级路径", () => {
  test("client-error 返回 none，且不推进链", () => {
    const state = createState()
    const result = plan(state, CHAIN[0], err({ status: 400, message: "context length exceeded" }))
    expect(result.action.kind).toBe("none")
    expect(result.state.index).toBe(-1)
    expect(result.state.switches).toBe(0)
  })
})

describe("planRetry — 即时换链", () => {
  test("401 直接切到下一个模型", () => {
    const result = plan(createState(), CHAIN[0], err({ status: 401 }))
    expect(result.action.kind).toBe("switch")
    if (result.action.kind !== "switch") throw new Error("unreachable")
    expect(modelKey(result.action.from)).toBe("p1/m1")
    expect(modelKey(result.action.to)).toBe("p2/m2")
    expect(result.action.delay).toBe(0)
    expect(result.state.index).toBe(1)
    expect(result.state.switches).toBe(1)
  })

  test("链外模型首次失败会落到链首", () => {
    const foreign = { providerID: "other", id: "x" }
    const result = plan(createState(), foreign, err({ status: 403 }))
    expect(result.action.kind).toBe("switch")
    if (result.action.kind !== "switch") throw new Error("unreachable")
    expect(modelKey(result.action.to)).toBe("p1/m1")
  })
})

describe("planRetry — 瞬态错误先原地重试", () => {
  test("503 首次原地退避，超过上限后换链", () => {
    let state = createState()
    const first = plan(state, CHAIN[0], err({ status: 503 }))
    expect(first.action).toEqual({ kind: "retry", delay: POLICY.baseDelayMs })
    expect(first.state.sameModelRetries).toBe(1)

    state = first.state
    const second = plan(state, CHAIN[0], err({ status: 503 }))
    expect(second.action.kind).toBe("retry")
    expect(second.state.sameModelRetries).toBe(2)

    state = second.state
    const third = plan(state, CHAIN[0], err({ status: 503 }))
    expect(third.action.kind).toBe("switch")
    if (third.action.kind !== "switch") throw new Error("unreachable")
    expect(modelKey(third.action.to)).toBe("p2/m2")
  })
})

describe("planRetry — 429 退避", () => {
  test("带 retryAfterMs 时按上游建议等待", () => {
    const result = plan(createState(), CHAIN[0], err({ status: 429, retryAfterMs: 3_000 }))
    expect(result.action).toEqual({ kind: "retry", delay: 3_000 })
  })

  test("retryAfterMs 超过 maxDelayMs 时不再原地等待，直接换链", () => {
    const result = plan(createState(), CHAIN[0], err({ status: 429, retryAfterMs: POLICY.maxDelayMs + 1 }))
    expect(result.action.kind).toBe("switch")
  })

  test("连续 429 超过 maxRateLimitWaits 后换链", () => {
    let state = createState()
    for (let i = 0; i < POLICY.maxRateLimitWaits; i++) {
      const step = plan(state, CHAIN[0], err({ status: 429 }))
      expect(step.action.kind).toBe("retry")
      state = step.state
    }
    const final = plan(state, CHAIN[0], err({ status: 429 }))
    expect(final.action.kind).toBe("switch")
  })
})

describe("planRetry — 冷却与耗尽", () => {
  test("冷却中的模型会被跳过", () => {
    const state = createState()
    state.cooldownUntil.set("p2/m2", 2_000_000)
    const result = plan(state, CHAIN[0], err({ status: 401 }), 1_000_000)
    expect(result.action.kind).toBe("switch")
    if (result.action.kind !== "switch") throw new Error("unreachable")
    expect(modelKey(result.action.to)).toBe("p3/m3")
  })

  test("全部候选耗尽后 give-up", () => {
    const state = createState()
    state.index = CHAIN.length - 1
    state.cooldownUntil.set("p1/m1", 2_000_000)
    state.cooldownUntil.set("p2/m2", 2_000_000)
    const result = plan(state, CHAIN[2], err({ status: 401 }))
    expect(result.action.kind).toBe("give-up")
  })

  test("链尾失败且链首已恢复时绕回链首", () => {
    const state = createState()
    state.index = CHAIN.length - 1
    state.cooldownUntil.set("p2/m2", 2_000_000)
    const result = plan(state, CHAIN[2], err({ status: 401 }))
    expect(result.action.kind).toBe("switch")
    if (result.action.kind !== "switch") throw new Error("unreachable")
    expect(modelKey(result.action.to)).toBe("p1/m1")
  })

  test("switch 预算耗尽后 give-up（防状态漂移无限换链）", () => {
    const state = createState()
    state.switches = CHAIN.length * 2
    const result = plan(state, CHAIN[0], err({ status: 401 }))
    expect(result.action.kind).toBe("give-up")
  })
})

describe("planRetry — 纯函数", () => {
  test("不修改传入 state", () => {
    const state = createState()
    plan(state, CHAIN[0], err({ status: 401 }))
    expect(state.index).toBe(-1)
    expect(state.switches).toBe(0)
    expect(state.cooldownUntil.size).toBe(0)
  })
})

describe("DEFAULT_FALLBACKS", () => {
  test("build 后备首选是 commandcode/deepseek，且无重复模型", () => {
    const build = DEFAULT_FALLBACKS.build
    expect(formatModel(build[0])).toBe("commandcode/deepseek/deepseek-v4.1-flash")
    const keys = build.map(modelKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test("候选全部有 provider 与 id", () => {
    for (const chain of Object.values(DEFAULT_FALLBACKS)) {
      for (const model of chain) {
        expect(model.providerID.length).toBeGreaterThan(0)
        expect(model.id.length).toBeGreaterThan(0)
      }
    }
  })
})

describe("buildChain", () => {
  const head = { providerID: "minimax-cn", id: "MiniMax-M3.1-Flash" }

  test("agent 自身配置的模型永远在链首", () => {
    const chain = buildChain(head, DEFAULT_FALLBACKS.build)
    expect(formatModel(chain[0])).toBe("minimax-cn/MiniMax-M3.1-Flash")
    expect(formatModel(chain[1])).toBe("commandcode/deepseek/deepseek-v4.1-flash")
  })

  test("链头已在候选里时不重复", () => {
    const chain = buildChain(DEFAULT_FALLBACKS.build[0], DEFAULT_FALLBACKS.build)
    expect(chain.length).toBe(DEFAULT_FALLBACKS.build.length)
    expect(formatModel(chain[0])).toBe("commandcode/deepseek/deepseek-v4.1-flash")
  })

  test("没有 agent 模型时以候选开头", () => {
    const chain = buildChain(undefined, DEFAULT_FALLBACKS.build)
    expect(formatModel(chain[0])).toBe("commandcode/deepseek/deepseek-v4.1-flash")
  })

  test("非法模型被丢弃", () => {
    const chain = buildChain(undefined, [
      { providerID: "", id: "x" },
      { providerID: "p", id: "y" },
    ] as ModelRef[])
    expect(chain.length).toBe(1)
    expect(formatModel(chain[0])).toBe("p/y")
  })
})

describe("冷却表跨 session 共享", () => {
  test("createState 传入的冷却表被原样共享（进程级冷却），内核不代写", () => {
    const shared = new Map<string, number>()
    const a = createState(shared)
    const b = createState(shared)
    const result = plan(a, CHAIN[0], err({ status: 401 }))
    expect(b.cooldownUntil).toBe(shared)
    // 内核保持纯函数：冷却条目由 plan.cooldown 带出，由调用方落盘
    expect(shared.size).toBe(0)
    expect(result.cooldown.size).toBe(1)
    expect(result.cooldown.get("p1/m1")).toBe(1_000_000 + POLICY.cooldownMs)
  })

  test("resetState 保留冷却表引用，不复制", () => {
    const shared = new Map<string, number>()
    const state = createState(shared)
    const reset = resetState(state)
    expect(reset.cooldownUntil).toBe(shared)
  })
})

describe("parseConfig", () => {
  test("读取 chains / policy / notify", () => {
    const parsed = parseConfig({
      chains: { build: [{ providerID: "p", id: "m" }] },
      policy: { maxSameModelRetries: 5, cooldownMs: 1000 },
      notify: "synthetic",
    })
    expect(parsed.chains.build?.length).toBe(1)
    expect(parsed.policy.maxSameModelRetries).toBe(5)
    expect(parsed.policy.cooldownMs).toBe(1000)
    expect(parsed.notify).toBe("synthetic")
  })

  test("非法项被忽略而不是抛错", () => {
    const parsed = parseConfig({
      chains: { build: "not-a-list", other: [{ providerID: "p" }] },
      policy: { maxSameModelRetries: -1, baseDelayMs: "x" },
      notify: "weird",
    })
    expect(parsed.chains.build).toBeUndefined()
    expect(parsed.chains.other).toBeUndefined()
    expect(parsed.policy.maxSameModelRetries).toBeUndefined()
    expect(parsed.policy.baseDelayMs).toBeUndefined()
    expect(parsed.notify).toBe("log")
  })

  test("非对象输入返回默认", () => {
    expect(parseConfig(undefined).chains).toEqual({})
    expect(parseConfig("x").notify).toBe("log")
  })
})
