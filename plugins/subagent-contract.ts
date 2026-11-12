/**
 * subagent 输入契约的**宿主接线**（纯逻辑在 ../lib/subagent-contract-core.ts）。
 *
 * 三个时点，三层防护：
 *
 *   L3  session.hook("context")      —— 每个模型请求前，把契约写进 subagent 工具描述
 *                                       （父模型在生成 prompt 之前就能看到判据；
 *                                         opencode 自己就用同一手法注入 "Available subagents:"）
 *   L1  tool.hook("execute.before")  —— 父模型刚采样出 tool call、执行之前拦截
 *                                       （不合规 → 抛错 → 内部包成 Tool.Error → 模型看到原因 → 同回合重试；
 *                                         合规 → 放行，不改写 input）
 *   L2  session.hook("prompt")       —— 子会话消息落库前兜底（覆盖 command / 插件等其他写入路径）
 *
 * 强度由 ~/.config/opencode/subagent-contract.json 决定，默认 **warn**（只记录不拦）：
 *   { "mode": "warn" | "enforce" | "off", "agents": { "critic": { "mode": "enforce" } } }
 * 配置**每次调用都重读**（文件很小）→ 改配置即时生效，不需要重启或重载插件。
 *
 * 沙箱约束（与 plugins/model-fallback.ts 头注释一致）：
 *   宿主只提供 `effect` 与 `@opencode/plugin` 两个外部包；node 内置模块可用；
 *   相对路径 import ../lib/*.ts 可用。
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import { Plugin } from "@opencode/plugin"

import {
  type CompliantState,
  type ContractConfig,
  applyContextInjection,
  gate,
  pruneState,
} from "../lib/subagent-contract-core.ts"

const CONFIG_PATH = path.join(homedir(), ".config", "opencode", "subagent-contract.json")
const DEFAULT_LOG = path.join(homedir(), ".local", "share", "opencode", "subagent-contract.log")

/** 跨调用状态：父会话 + agent → 上一次调用的复审模式 + 时间戳（进程内内存，重启即失效）。 */
const state: CompliantState = new Map()

/** 状态清理节流：每 N 次调用清一次过期项，避免长驻 server 下 Map 无限增长 */
let callsSincePrune = 0
const PRUNE_EVERY = 50

/**
 * L3 注入的一次性标记。
 *
 * 注入发生在**每个模型请求前**（session.hook("context")），逐次记日志会淹没日志文件；
 * 但完全不记 ⇒ 线上无法判断"契约到底有没有注入进工具描述"（工具描述不进日志、不进 DB，
 * 服务端也没有 tool 列表接口）⇒ 每进程只记第一条，既可观测又不刷屏。
 */
let l3InjectedLogged = false

function loadConfig(): ContractConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as ContractConfig
  } catch {
    return {}
  }
}

function log(config: ContractConfig, record: Record<string, unknown>): void {
  try {
    const file = config.log ?? DEFAULT_LOG
    mkdirSync(path.dirname(file), { recursive: true })
    appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n")
  } catch {
    /* 日志失败不得影响主流程 */
  }
}

export default Plugin.define({
  id: "subagent-contract",
  async setup(ctx) {
    // ── L3：把契约注入 subagent 工具描述（生成前可见） ──────────────────────────
    await ctx.session.hook("context", (event: any) => {
      const config = loadConfig()
      const injected = applyContextInjection(event?.tools?.subagent, config)
      if (injected && !l3InjectedLogged) {
        l3InjectedLogged = true
        log(config, { level: "info", gate: "L3", event: "injected", agent: "critic", mode: config.mode ?? "warn" })
      }
    })

    // ── L1：执行前拦截（父模型刚采样出的 tool call） ───────────────────────────
    await ctx.tool.hook("execute.before", (event: any) => {
      if (event?.tool !== "subagent") return
      const input = event.input ?? {}
      const agent = typeof input.agent === "string" ? input.agent : ""
      if (!agent) return

      const config = loadConfig()
      const result = gate(
        {
          agent,
          prompt: typeof input.prompt === "string" ? input.prompt : "",
          // 续接（传了 sessionID）只是补充说明，不要求完整字段集
          isResume: typeof input.sessionID === "string" && input.sessionID.length > 0,
          parentSessionID: typeof event.sessionID === "string" ? event.sessionID : undefined,
        },
        config,
        state,
      )

      // 状态清理（节流）：避免长驻 server 下 Map 无限增长
      if (++callsSincePrune >= PRUNE_EVERY) {
        callsSincePrune = 0
        pruneState(state)
      }

      if (!result.shouldLog) return

      log(config, {
        // 豁免（复审轮）也记，但用不同 level：线上要能区分"放行因为豁免"与"放行因为合规"
        level: result.evaluation.exempted ? "exempted" : "violation",
        gate: "L1",
        mode: result.mode,
        agent,
        parentSessionID: event?.sessionID,
        isResume: typeof input.sessionID === "string" && input.sessionID.length > 0,
        exempted: result.evaluation.exempted,
        exemption: result.evaluation.exemption,
        violations: result.evaluation.violations,
      })

      if (result.blocked) throw new Error(result.message ?? "subagent input rejected")
    })

    // ── L2：落库前兜底（覆盖 command / 插件等其他写入路径） ─────────────────────
    // 注意：**本钩子不得抛错**。宿主契约（packages/core/src/plugin/hooks.ts）明确规定
    // 只有 tool.execute.before 允许失败（失败 → 受控 Tool.Error，调用在执行前被拒）；
    // session 域的钩子抛错会把流程打成 defect。因此 L2 只做**检测 + 记录**，
    // 硬拦截由 L1 负责；command(subagent:true) 这类不经 tool 的路径只能被检出、不能被拦。
    await ctx.session.hook("prompt", async (event: any) => {
      const text = event?.prompt?.text
      if (typeof text !== "string") return

      const session = await ctx.session.get({ sessionID: event.sessionID })
      if (!session?.parentID) return // 主会话的 user 消息不受契约约束

      const agent = session.agent
      if (!agent) return
      const config = loadConfig()

      // 续接判定：子会话已有 user 消息 → 本条是续接（不是首轮）
      // （prompt 钩子在落库前触发 → 已有消息数 = 首轮之后的条数）
      let isResume = false
      try {
        const history = await ctx.session.context({ sessionID: event.sessionID })
        isResume = history.some((m: any) => m.type === "user")
      } catch {
        isResume = false
      }

      const result = gate(
        {
          agent,
          prompt: text,
          isResume,
          parentSessionID: session.parentID,
          // 长度由 L1 负责；L2 只兜底"小节齐不齐"，避免续接轮被长度下限误伤
          checkLength: false,
        },
        config,
        state,
      )
      if (!result.shouldLog) return

      log(config, {
        level: result.evaluation.exempted ? "exempted" : "violation",
        gate: "L2",
        mode: result.mode,
        enforceable: false, // session 域钩子不能失败 → 本路径只能检出，不能拦
        agent,
        parentSessionID: session.parentID,
        childSessionID: event.sessionID,
        exempted: result.evaluation.exempted,
        exemption: result.evaluation.exemption,
        violations: result.evaluation.violations,
      })
    })
  },
})
