/**
 * model-fallback 宿主接线：把 session 的 retry 钩子接到纯逻辑内核上。
 *
 * 只做三件事：
 *  1. 注册 `retry` 钩子：失败 → 决策 →（必要时）switchModel → 重试
 *  2. 注册 `prompt` 钩子：新用户轮重置降级状态（冷却表保留，避免立刻再撞同一模型）
 *  3. 记录每次切换（stderr + `~/.local/share/opencode/model-fallback.log`）
 *
 * 配置来源（优先级由高到低）：
 *  1. 环境变量 `MODEL_FALLBACK_CONFIG` 指向的 JSON 文件
 *  2. `~/.config/opencode/model-fallback.json`
 *  3. 内置默认值（lib/model-fallback-core.ts 的 DEFAULT_FALLBACKS）
 *
 * 文件格式：
 *   {
 *     "chains":  { "build": [{ "providerID": "minimax-cn", "id": "MiniMax-M3.1-Flash" }] },
 *     "policy":  { "maxSameModelRetries": 2, "maxRateLimitWaits": 2, "cooldownMs": 300000 },
 *     "notify":  "log"
 *   }
 *
 * 链头不单独配：**失败时正在用的那个模型就是链首**（即 agent 的默认模型，或用户
 * 临时 /model 切过去的模型），文件里的 chains 是它后面的后备候选。
 *
 * 可见性：切换模型会触发 session.model.selected，TUI 的模型指示器会立即变化；
 * 另有日志可追溯。默认**不**发 synthetic 消息 —— 实测它会被当作新输入再触发一轮
 * 模型调用，并在 prompt 钩子里重置降级状态（notify: "synthetic" 可显式开启）。
 *
 * 纯逻辑（分类 / 链推进 / 冷却 / 组链）全部在 lib/model-fallback-core.ts，可单测。
 *
 * 运行时装载约束：宿主插件沙箱只提供 `effect` 与 `@opencode/plugin` 两个外部包，
 * 但 **node 内置模块（node:fs / node:os / node:path）可用**（实测 e2e 通过）；
 * 相对路径 import 同目录的 ../lib/*.ts 也可用。
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import { Plugin } from "@opencode/plugin"
import {
  DEFAULT_FALLBACKS,
  DEFAULT_POLICY,
  buildChain,
  createState,
  formatModel,
  indexOfModel,
  parseConfig,
  planRetry,
  resetState,
  type FallbackPolicy,
  type FallbackState,
  type ModelRef,
  type NotifyMode,
  type RetryError,
} from "../lib/model-fallback-core.ts"

const LOG_PREFIX = "[model-fallback]"
const LOG_DIR = path.join(homedir(), ".local", "share", "opencode")
const LOG_FILE = path.join(LOG_DIR, "model-fallback.log")
const CONFIG_ENV = "MODEL_FALLBACK_CONFIG"
const DEFAULT_CONFIG_PATH = path.join(homedir(), ".config", "opencode", "model-fallback.json")
/** 空闲超过该时长的 session 状态被淘汰，避免长驻 server 下 Map 单调增长。 */
const SESSION_TTL_MS = 30 * 60_000

/**
 * 插件按 location 重复 setup（同一进程可能为多个 location 各建一份 hook）。
 * 状态因此放在**模块级**：多份 hook 共享同一份 session 状态与冷却表，
 * 并用事件级标记保证同一个 retry 事件只被处理一次。
 */
const states = new Map<string, FallbackState>()
/** 每个 session 的降级链（首次失败时按"当时正在用的模型"构链） */
const chains = new Map<string, ModelRef[]>()
/** 进程级冷却表：provider 挂了就是挂了，不该每个 session 各记一份 */
const cooldown = new Map<string, number>()
/** sessionID -> 最近活跃时间，用于淘汰过期状态 */
const touched = new Map<string, number>()
/** 插件在 server 启动时加载；启动日志只打一次 */
let announced = false

export default Plugin.define({
  id: "model-fallback",
  async setup(ctx: any) {
    const log = (line: string) => {
      const text = `${new Date().toISOString()} ${line}\n`
      try {
        mkdirSync(LOG_DIR, { recursive: true })
        appendFileSync(LOG_FILE, text)
      } catch {
        // 日志失败不能影响重试链路
      }
      try {
        console.error(`${LOG_PREFIX} ${line}`)
      } catch {
        // 同上
      }
    }

    const config = parseConfig(loadConfig())
    const policy: FallbackPolicy = { ...DEFAULT_POLICY, ...config.policy }
    const notifyMode: NotifyMode = config.notify
    const candidates = mergedCandidates(config.chains)

    if (!announced) {
      announced = true
      log(
        `loaded; config=${configPath()}; agents=${Object.keys(candidates).join(",")}; notify=${notifyMode}`,
      )
    }

    const stateFor = (sessionID: string): FallbackState => {
      touched.set(sessionID, Date.now())
      const existing = states.get(sessionID)
      if (existing) return existing
      const created = createState(cooldown)
      states.set(sessionID, created)
      return created
    }

    await ctx.session.hook("retry", async (event: any) => {
      // 多份 hook（按 location 重复 setup）时，同一事件只处理一次
      if (event?.__modelFallbackHandled) return
      try {
        event.__modelFallbackHandled = true
      } catch {
        // 宿主传入冻结的事件对象：无法去重，退化为单份 hook 语义
      }

      const agent = String(event?.agent ?? "")
      const agentCandidates = candidates[agent]
      if (!agentCandidates || agentCandidates.length === 0) return

      const model: ModelRef = {
        providerID: String(event.model?.providerID ?? ""),
        id: String(event.model?.id ?? ""),
        ...(typeof event.model?.variant === "string" && event.model.variant !== "default"
          ? { variant: event.model.variant }
          : {}),
      }
      if (!model.providerID || !model.id) return

      // 链头 = 失败时正在用的模型；用户中途 /model 切过就重新构链
      let chain = chains.get(event.sessionID)
      if (!chain || indexOfModel(chain, model) === -1) {
        chain = buildChain(model, agentCandidates)
        chains.set(event.sessionID, chain)
        // 换了一条链 → 旧的推进下标不再成立，重置推进状态（冷却表保留）
        const existing = states.get(event.sessionID)
        states.set(event.sessionID, existing ? resetState(existing) : createState(cooldown))
      }
      if (chain.length < 2) return

      const current = stateFor(event.sessionID)
      const error: RetryError = event.error ?? { type: "unknown", message: "" }
      const plan = planRetry({
        state: current,
        chain,
        model,
        error,
        now: Date.now(),
        policy,
      })

      if (plan.action.kind === "none") return

      // 冷却条目由调用方落盘（内核保持纯函数）：写进进程级冷却表
      for (const [key, until] of plan.cooldown) cooldown.set(key, until)

      if (plan.action.kind === "give-up") {
        states.set(event.sessionID, plan.state)
        log(`${agent}: give up (${plan.action.reason}); ${describeError(error)}`)
        event.decision = { retry: false }
        return
      }

      if (plan.action.kind === "retry") {
        states.set(event.sessionID, plan.state)
        event.decision = { retry: true, delay: plan.action.delay }
        return
      }

      const { from, to } = plan.action
      try {
        await ctx.session.switchModel({ sessionID: event.sessionID, model: to })
      } catch (cause) {
        // 切换失败：保留旧 state，原地退避重试，不中断会话
        log(`${agent}: switch ${formatModel(from)} -> ${formatModel(to)} failed: ${String(cause)}`)
        event.decision = { retry: true, delay: policy.baseDelayMs }
        return
      }

      states.set(event.sessionID, plan.state)
      log(`${agent}: ${formatModel(from)} -> ${formatModel(to)}; ${describeError(error)}`)
      if (notifyMode === "synthetic") {
        await sendNotice(
          ctx,
          event.sessionID,
          `[model-fallback] ${agent} 的 ${formatModel(from)} 不可用（${describeError(error)}），本轮已切换到 ${formatModel(to)}；如需改回请用 /model。`,
          log,
        )
      }
      event.decision = { retry: true, delay: plan.action.delay }
    })

    await ctx.session.hook("prompt", (event: any) => {
      if (!event?.sessionID) return
      const existing = states.get(event.sessionID)
      states.set(event.sessionID, existing ? resetState(existing) : createState(cooldown))
      touched.set(event.sessionID, Date.now())
      pruneSessions()
    })
  },
})

/** 淘汰长时间不活跃的 session 状态，避免长驻 server 下 Map 单调增长。 */
function pruneSessions(): void {
  const now = Date.now()
  for (const [sessionID, at] of touched) {
    if (now - at > SESSION_TTL_MS) {
      touched.delete(sessionID)
      states.delete(sessionID)
      chains.delete(sessionID)
    }
  }
}

function configPath(): string {
  return process.env[CONFIG_ENV] || DEFAULT_CONFIG_PATH
}

function loadConfig(): unknown {
  const file = configPath()
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException)?.code
    if (code !== "ENOENT") {
      console.error(`${LOG_PREFIX} config ${file} unreadable: ${String(cause)}`)
    }
    return undefined
  }
}

/** 配置文件里的候选覆盖内置默认；未覆盖的 agent 用内置默认。 */
function mergedCandidates(configured: Record<string, ModelRef[]>): Record<string, ModelRef[]> {
  const merged: Record<string, ModelRef[]> = {}
  for (const [agent, list] of Object.entries(DEFAULT_FALLBACKS)) {
    merged[agent] = list.map((model) => ({ ...model }))
  }
  for (const [agent, list] of Object.entries(configured)) {
    merged[agent] = list.map((model) => ({ ...model }))
  }
  return merged
}

function describeError(error: RetryError): string {
  const status = typeof error.status === "number" ? `/${error.status}` : ""
  const type = error.type || "error"
  const message = (error.message ?? "").slice(0, 120)
  return message ? `${type}${status}: ${message}` : `${type}${status}`
}

async function sendNotice(
  ctx: any,
  sessionID: string,
  text: string,
  log: (line: string) => void,
): Promise<void> {
  try {
    await ctx.session.synthetic({
      sessionID,
      text,
      description: "model-fallback",
      delivery: "queue",
    })
  } catch (cause) {
    log(`notice failed: ${String(cause)}`)
  }
}
