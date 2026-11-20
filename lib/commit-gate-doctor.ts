/**
 * commit-gate-doctor —— **门禁「在场性」的纯逻辑**（`docs/adr/ADR-commit-verification-gate.md` D9② 的机械化）
 *
 * ## 为什么需要这一层
 *
 * ADR D9② 登记的是：**插件缺席 ⇒ 门禁不存在**。这句话在原实现里只有**登记**、没有**检测**：
 * 插件加载失败（宿主报 `failed to load plugin`）时，门禁**静默消失** ——
 * `git commit` 照常通过、没有任何报错，仓库的验证命令也没人跑。
 *
 * 2026-11-20 实测：该形态真实发生过两次 ——
 * ① 宿主进程**常驻不刷新**（进程自 11-18 00:52 起，而 `lib/push-gate.ts` / `lib/commit-gate.ts`
 *    在其后被改过）⇒ 进程内模块实例过期 ⇒ 插件 `SyntaxError` 加载失败 ⇒ 门禁消失**两天**，
 *    期间 206 个单测全绿；
 * ② 宿主**按文件变化重载插件**时命中了**不一致的依赖实例**（磁盘上短暂存在过写坏的版本）⇒ 同样加载失败。
 *
 * ⇒ 本模块把「门禁在不在场」变成**可判定**的：
 *   ① `parsePluginList` —— 解析宿主 `/api/plugin` 的返回；
 *   ② `evaluateLiveness` —— 判定 `pass` / `fail` / `skip`（**纯函数** ⇒ 可单测）；
 *   ③ `fetchPluginList` —— 取数（薄 I/O：调 `opencode api get /api/plugin`）。
 *
 * ⚠ **判定口径**：宿主插件列表里 `source.type === "local"` 且路径命中 `plugins/commit-gate.ts`
 *   的那条 ⇒ 才是本仓的门禁插件；**状态不是 `active` 即 fail**（`failed` / 缺失都算门禁不存在）。
 *
 * ⚠ **skip 的含义**：**连不上运行中的宿主** ⇒ 判定不可得（不是「门禁健康」）。
 *   本仓的用法：skip 不算失败（CI / 无宿主环境），但**必须显式打印**，不许当 pass 宣称。
 *
 * ⚠ **踩坑记录（2026-11-20，代价 = 门禁消失近 1 小时）**：宿主会**监视 `plugins/` 与 `lib/` 的文件变化并重载插件**，
 *   且**进程内按路径缓存模块实例** ⇒ ① 改过 `lib/*.ts` / `plugins/*.ts`（**哪怕内容没变**，只是 `cp` / `touch` 还原）
 *   之后必须 `opencode service restart`，否则宿主可能用**过期 / 写坏的依赖实例**链接入口 ⇒ `Export named '…' not found`
 *   ⇒ 插件加载失败 ⇒ 门禁消失；② **变异测试（故意写坏代码）绝不能放在宿主正在加载的插件依赖路径上**
 *   （宿主的 watcher 会立刻加载并缓存那个坏实例）—— 要测就在**隔离副本**里做，测完 `service restart`。
 *   ⇒ 判据：`bun scripts/commit-gate-doctor.ts`（`PASS` 才算门禁在场）。
 */
import { execFile } from "node:child_process"

export interface PluginEntry {
  id?: string
  source?: { type?: string; path?: string }
  state?: { status?: string; error?: string }
}

export type LivenessStatus = "pass" | "fail" | "skip"

export interface LivenessResult {
  status: LivenessStatus
  /** 一句话结论（可 grep） */
  reason: string
  /** 补充细节（错误文本 / 命中的插件 id） */
  detail?: string
}

/** 本仓门禁插件的**目录内相对路径**（用于在宿主插件列表里定位它）。 */
export const COMMIT_GATE_PLUGIN_REL = "plugins/commit-gate.ts"

/** 取数失败 / 宿主不可达时的默认超时（毫秒）—— 超时 ⇒ skip，不判失败。 */
export const DEFAULT_FETCH_TIMEOUT_MS = 20_000

/**
 * 解析宿主 `/api/plugin` 的返回。
 *
 * 形状：`{ location, data: [...] }`（本仓实测）；宽容接受**裸数组**。
 * ⚠ 解析失败 ⇒ 抛（调用方按「不可判定」处理 ⇒ skip，不是 fail）。
 */
export function parsePluginList(raw: string): PluginEntry[] {
  const parsed = JSON.parse(raw) as unknown
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { data?: unknown }).data)
      ? ((parsed as { data: unknown[] }).data as unknown[])
      : null
  if (!arr) throw new Error("插件列表形状异常：既不是数组，也没有 data 数组")
  return arr.filter((e): e is PluginEntry => !!e && typeof e === "object")
}

/** 在插件列表里定位**本地**插件（按目录内相对路径后缀匹配，跨平台路径分隔符无关）。 */
export function findLocalPlugin(entries: PluginEntry[], rel: string = COMMIT_GATE_PLUGIN_REL): PluginEntry | undefined {
  const norm = (p: string) => p.replace(/\\/g, "/")
  const want = norm(rel)
  return entries.find((e) => {
    if (e.source?.type !== "local") return false
    const p = e.source?.path
    if (!p) return false
    const n = norm(p)
    // 既接受绝对路径后缀，也接受「路径恰是该相对路径」形态
    return n === want || n.endsWith(`/${want}`)
  })
}

/**
 * 判定门禁插件的**在场性**。
 *
 * - `reachable === false` ⇒ **skip**（判定不可得；调用方须显式声明，不得当 pass）
 * - 找不到该插件 ⇒ **fail**（宿主没加载它 ⇒ 门禁不存在）
 * - `state.status === "active"` ⇒ **pass**
 * - 其余状态（`failed` / 未知）⇒ **fail**（附 `state.error`）
 */
export function evaluateLiveness(
  entries: PluginEntry[],
  opts: { reachable: boolean; rel?: string; error?: string },
): LivenessResult {
  if (!opts.reachable) {
    return {
      status: "skip",
      reason: "连不上运行中的 opencode 宿主 ⇒ 门禁在场性不可判定（不等于健康）",
      detail: opts.error,
    }
  }
  const entry = findLocalPlugin(entries, opts.rel)
  if (!entry) {
    return {
      status: "fail",
      reason: `宿主插件列表里没有 ${opts.rel ?? COMMIT_GATE_PLUGIN_REL} ⇒ 门禁不存在（ADR D9②）`,
    }
  }
  const status = entry.state?.status
  if (status === "active") {
    return { status: "pass", reason: "commit-gate 插件在场且 active ⇒ 门禁生效", detail: entry.id }
  }
  return {
    status: "fail",
    reason: `commit-gate 插件状态为 ${status ?? "(缺失)"} ⇒ 门禁不存在（ADR D9②）`,
    detail: entry.state?.error,
  }
}

/** 取数结果（`reachable=false` ⇒ 未连上宿主）。 */
export interface FetchResult {
  reachable: boolean
  entries: PluginEntry[]
  error?: string
}

/**
 * 从运行中的宿主取插件列表（`opencode api get /api/plugin`）。
 *
 * ⚠ **只读**：不写任何文件、不改任何状态。
 * ⚠ 宿主不可达 / CLI 不存在 / 超时 ⇒ `reachable: false`（调用方据此 skip，**不判失败**）。
 */
export function fetchPluginList(opts: { timeoutMs?: number; bin?: string } = {}): Promise<FetchResult> {
  const timeout = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  const bin = opts.bin ?? process.env.OPENCODE_BIN ?? "opencode"
  return new Promise<FetchResult>((resolve) => {
    execFile(
      bin,
      ["api", "get", "/api/plugin"],
      { timeout, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ reachable: false, entries: [], error: String(err.message ?? err) })
          return
        }
        try {
          resolve({ reachable: true, entries: parsePluginList(stdout) })
        } catch (e: any) {
          resolve({ reachable: false, entries: [], error: `插件列表解析失败：${e?.message ?? e}（stderr: ${stderr?.slice(0, 200) ?? ""}）` })
        }
      },
    )
  })
}
