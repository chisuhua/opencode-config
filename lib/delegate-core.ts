import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs"
import path from "node:path"

/**
 * delegate 工具的**纯逻辑内核**（无 opencode 宿主依赖，可独立单元测试）。
 *
 * 宿主接线（工具注册）只在 plugins/delegate.ts；本文件同时导出工具定义工厂，
 * 便于用假 ctx 做端到端单测。
 *
 * 原设计说明：
 * front → 工程 session 的唯一委托通道。
 *
 * 设计依据（ADR .rddf/state/adr-front-agent-redesign.md + Stage 0 探针报告
 * .rddf/reviews/front-agent-redesign-p0-probes.md）：
 *  - 工具声明 options.permission = "delegate" → 权限 action 名独立于工具名，
 *    全局 deny + agent.front allow ⇒ 只有 front 能拿到本工具。
 *  - 工程 session 的权限在 **建 session 时**由 [常量deny, scope edit 规则, grants] 定型；
 *    last-match-wins ⇒ 顺序即策略，grants 排最后，但 grants 有类目白名单，
 *    question/form/edit/write 永不可 grant（否则会压掉常量 deny 与 scope 规则）。
 *  - 救援用 session.update 原地补 grant（已实测可写），不新建 session、不全量重跑。
 *  - 插件 setup 只做注册；所有耗时工作都在工具 execute 内（location 销毁会中止 setup）。
 *  - setup 阶段禁止写盘（全局插件目录对每个 location 各加载一次）。
 */

const TOOL_NAME = "delegate"

/** build agent 的 ask 类目 → session 级 deny（无人值守下 ask 会永久挂死）。 */
export const CONSTANT_DENY: Array<{ action: string; resource: string }> = [
  { action: "shell", resource: "git push *" },
  { action: "shell", resource: "git push" },
  { action: "shell", resource: "git reset --hard *" },
  { action: "shell", resource: "git reset --hard" },
  { action: "shell", resource: "git clean -fd *" },
  { action: "shell", resource: "git clean -fd" },
  { action: "shell", resource: "git clean -fdx *" },
  { action: "shell", resource: "git clean -fdx" },
  { action: "shell", resource: "git checkout -- *" },
  { action: "shell", resource: "git checkout ." },
  { action: "shell", resource: "git restore *" },
  { action: "shell", resource: "git branch -D *" },
  { action: "shell", resource: "git stash drop *" },
  { action: "shell", resource: "git stash clear *" },
  { action: "shell", resource: "rm -rf *" },
  { action: "shell", resource: "rm -fr *" },
  { action: "shell", resource: "rm -r *" },
  { action: "shell", resource: "rm -f *" },
  { action: "shell", resource: "sudo *" },
  { action: "shell", resource: "cat *.env" },
  { action: "shell", resource: "cat *.env.*" },
  { action: "shell", resource: "head *.env" },
  { action: "shell", resource: "head *.env.*" },
  { action: "shell", resource: "tail *.env" },
  { action: "shell", resource: "tail *.env.*" },
  { action: "external_directory", resource: "*" },
  { action: "question", resource: "*" },
  { action: "form", resource: "*" },
  { action: "codebase-memory-mcp_index_repository", resource: "*" },
  { action: "codebase-memory-mcp_ingest_traces", resource: "*" },
  { action: "codebase-memory-mcp_manage_adr", resource: "*" },
  { action: "codebase-memory-mcp_delete_project", resource: "*" },
]

/** grants 允许的 action（用户可为本次任务预批的类目）。 */
export const GRANT_ALLOWED = new Set([
  "shell",
  "read",
  "grep",
  "glob",
  "list",
  "external_directory",
  "webfetch",
  "websearch",
  "lsp",
])

/** grants 永久禁止的类目：这些一旦被 grant 会破坏 D5 的三条规则。 */
export const GRANT_FORBIDDEN = new Set(["question", "form", "edit", "write"])

/**
 * front 可委托的 agent 白名单（ADR-front-knowledge-capability D2/D4）。
 * `build` = 工程 session（写）；其余 = 知识 session（只读）。
 */
export const READONLY_AGENTS = ["explore", "librarian", "oracle", "metis", "critic"] as const

export const ALLOWED_AGENTS = new Set<string>(["build", ...READONLY_AGENTS])

export type DelegateKind = "engineering" | "knowledge"

/** kind 由 agent 推导，不由调用方声明（front 无法伪造类型）。 */
export function kindOfAgent(agent: string): DelegateKind {
  return agent === "build" ? "engineering" : "knowledge"
}

export const WAIT_TIMEOUT_MS = 30 * 60 * 1000

export function fail(message: string): Error {
  return new Error(message)
}

export function isAbsolute(p: string): boolean {
  return path.isAbsolute(p)
}

export function toMillis(value: unknown): number {
  if (value == null) return 0
  if (typeof value === "number") return value
  if (value instanceof Date) return value.getTime()
  const parsed = Date.parse(String(value))
  return Number.isNaN(parsed) ? 0 : parsed
}

export function canonicalRoot(dir: string): { root: string; vcs: boolean } {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    const root = out.trim()
    if (root) return { root, vcs: true }
  } catch {
    // 非 git 目录：回退到路径本身
  }
  return { root: path.resolve(dir), vcs: false }
}

export function gitStatusPaths(root: string): string[] {
  try {
    const out = execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const trimmed = line.replace(/^[ MADRCU?!]{1,2}\s+/, "")
        const arrow = trimmed.indexOf(" -> ")
        return arrow >= 0 ? trimmed.slice(arrow + 4).trim() : trimmed.trim()
      })
      .filter((p) => p.length > 0)
  } catch {
    return []
  }
}

/** scope 前缀 → session 级 edit 资源（相对工程根，file-access 用相对路径做资源）。 */
export function scopeEditRules(projectRoot: string, scope: string[]): Array<{ action: string; resource: string; effect: string }> {
  const rules: Array<{ action: string; resource: string; effect: string }> = [
    { action: "edit", resource: "*", effect: "deny" },
  ]
  for (const raw of scope) {
    const trimmed = raw.trim().replace(/^\.\//, "").replace(/\/+$/, "")
    // "" / "." / "./" 三者等价于「整个工程」：先 deny 再 allow，净效果放行全部 edit。
    if (trimmed.length === 0 || trimmed === ".") {
      rules.push({ action: "edit", resource: "*", effect: "allow" })
      continue
    }
    const absolute = isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(projectRoot, trimmed)
    const relative = path.relative(projectRoot, absolute)
    if (relative.startsWith("..")) continue
    const normalized = relative.split(path.sep).join("/")
    // scope 可能是目录（"src"）也可能是文件（"answer.txt"）：
    // 文件型 scope 必须同时放行文件本身与其子路径，否则 "x/*" 匹配不到 "x"。
    if (normalized.length === 0) {
      rules.push({ action: "edit", resource: "*", effect: "allow" })
      continue
    }
    rules.push({ action: "edit", resource: normalized, effect: "allow" })
    rules.push({ action: "edit", resource: `${normalized}/*`, effect: "allow" })
  }
  return rules
}

export function validateGrants(grants: any): Array<{ action: string; resource: string; effect: string }> {
  if (grants === undefined || grants === null) return []
  if (!Array.isArray(grants)) throw fail("grants 必须是数组")
  const out: Array<{ action: string; resource: string; effect: string }> = []
  for (const item of grants) {
    if (!item || typeof item !== "object") throw fail("grants 元素必须是 {action, resource} 对象")
    const action = String((item as any).action ?? "")
    const resource = String((item as any).resource ?? "")
    if (action.length === 0 || resource.length === 0) throw fail("grants 元素必须同时有 action 与 resource")
    if (GRANT_FORBIDDEN.has(action)) {
      throw fail(`grants 不允许 action=${action}（question/form/edit/write 永不可 grant，否则会压掉安全边界）`)
    }
    if (!GRANT_ALLOWED.has(action)) {
      throw fail(`grants 不允许 action=${action}（可 grant：${[...GRANT_ALLOWED].join(", ")}）`)
    }
    if (action === "read" && resource.includes(".env")) {
      throw fail("grants 不允许 read .env")
    }
    out.push({ action, resource, effect: "allow" })
  }
  return out
}

export function validateBrief(input: any): {
  project_dir: string
  agent: string
  agentProvided: boolean
  kind: DelegateKind
  task: string
  goal: string
  scope: string[]
  acceptance: string
  constraints: string
  grants: Array<{ action: string; resource: string; effect: string }>
  resume_session?: string
  remove: boolean
} {
  const projectDir = String(input.project_dir ?? "")
  if (projectDir.length === 0) throw fail("project_dir 必填")
  if (!isAbsolute(projectDir)) throw fail("project_dir 必须是绝对路径")
  if (!existsSync(projectDir)) throw fail(`project_dir 不存在: ${projectDir}`)

  const task = String(input.task ?? "")
  const goal = String(input.goal ?? "")
  const acceptance = String(input.acceptance ?? "")
  for (const [name, value] of [
    ["task", task],
    ["goal", goal],
    ["acceptance", acceptance],
  ] as const) {
    if (value.trim().length === 0) throw fail(`${name} 必填且不能为空`)
  }

  const agentProvided = input.agent !== undefined && input.agent !== null
  const agent = String(input.agent ?? "build").trim() || "build"
  if (!ALLOWED_AGENTS.has(agent)) {
    throw fail(`agent 不在白名单内: ${agent}（允许：${[...ALLOWED_AGENTS].join(", ")}）`)
  }
  const kind = kindOfAgent(agent)

  // scope：工程 session 必填非空；知识 session 可省略或为空（不参与权限组装）。
  const scope = input.scope
  const scopeList: string[] = []
  if (scope !== undefined && scope !== null) {
    if (!Array.isArray(scope)) throw fail("scope 必须是字符串数组")
    for (const item of scope) {
      if (typeof item !== "string" || item.trim().length === 0) throw fail("scope 元素必须是非空字符串")
      scopeList.push(item.trim())
    }
  }
  if (kind === "engineering" && scopeList.length === 0) {
    throw fail("scope 必填且必须是非空字符串数组（仅工程 session 需要）")
  }

  const constraints = String(input.constraints ?? "")
  const resume = input.resume_session === undefined ? undefined : String(input.resume_session)
  const remove = input.remove === true
  const grants = validateGrants(input.grants)
  if (kind === "knowledge" && grants.length > 0) {
    throw fail("知识 session 不接受 grants（只读语义不允许任何预批放宽）")
  }

  return {
    project_dir: projectDir,
    agent,
    agentProvided,
    kind,
    task,
    goal,
    scope: scopeList,
    acceptance,
    constraints,
    grants,
    resume_session: resume,
    remove,
  }
}

export function buildBrief(brief: ReturnType<typeof validateBrief>, projectRoot: string): string {
  const lines: string[] = []
  lines.push("## 委托简报（来自 front）")
  lines.push("")
  lines.push(`- 目标（goal）: ${brief.goal}`)
  lines.push(`- 工程根: ${projectRoot}`)
  lines.push(`- 类型（kind）: ${brief.kind}`)
  if (brief.kind === "engineering") {
    lines.push(`- 允许变更范围（scope）: ${brief.scope.join(", ")}`)
  } else {
    lines.push(`- 允许变更范围（scope）: 无（知识 session 只读，不产生文件变更）`)
  }
  lines.push(`- 验收判据（acceptance）: ${brief.acceptance}`)
  if (brief.constraints.trim().length > 0) {
    lines.push(`- 额外约束（constraints）: ${brief.constraints}`)
  }
  if (brief.grants.length > 0) {
    lines.push(`- 用户已预批的操作（grants）: ${brief.grants.map((g) => `${g.action}:${g.resource}`).join(", ")}`)
  }
  lines.push("")
  lines.push("## 任务原话（task）")
  lines.push("")
  lines.push(brief.task)
  lines.push("")
  lines.push("## 执行要求")
  lines.push("")
  if (brief.kind === "engineering") {
    lines.push("1. 只在 scope 内改动；scope 外的文件不得写入。")
    lines.push("2. 按 acceptance 自行验证，报告实际执行的命令与结果。")
    lines.push("3. 不要 git commit / git push —— 提交由用户确认后另行发起。")
    lines.push("4. 遇到权限被拒（Permission denied）不要换写法绕过，直接说明被拒的操作并停下。")
  } else {
    lines.push("1. 这是只读的知识/调研任务：**不要修改任何文件**，不要 commit。")
    lines.push("2. 给出结论时标注证据（`file:line` / URL）；不确定的地方明确说不确定。")
    lines.push("3. 若任务实际需要文件变更，请在结论中说明并停下——变更必须转工程 session。")
    lines.push("4. 遇到权限被拒（Permission denied）不要换写法绕过，直接说明被拒的操作并停下。")
  }
  return lines.join("\n")
}

/** 目录锁（原子 mkdir），用于 role.json / pair.json 的跨写入方互斥。 */
export function withLock(lockDir: string, fn: () => void): void {
  const staleMs = 30_000
  const deadline = Date.now() + 10_000
  for (;;) {
    try {
      mkdirSync(lockDir, { recursive: false })
      break
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e
      try {
        const age = Date.now() - statSync(lockDir).mtimeMs
        if (age > staleMs) {
          rmSync(lockDir, { recursive: true, force: true })
          continue
        }
      } catch {
        continue
      }
      if (Date.now() > deadline) throw fail(`获取锁超时: ${lockDir}`)
      // 协作式让步：同步睡眠 20ms（Atomics.wait 阻塞当前线程，不依赖外部命令）
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
  try {
    fn()
  } finally {
    try {
      rmSync(lockDir, { recursive: true, force: true })
    } catch {
      /* 锁清理失败不阻塞主流程 */
    }
  }
}

export function readJson(file: string): any {
  try {
    if (!existsSync(file)) return undefined
    const raw = readFileSync(file, "utf8")
    if (raw.trim().length === 0) return undefined
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function writeJsonAtomic(file: string, value: any): void {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n")
  renameSync(tmp, file)
}

/** ledger 行（JSONL）追加；调用方必须已持有 `.role.lock`。 */
function appendLedgerLine(root: string, row: any): void {
  const stateDir = path.join(root, ".rddf", "state")
  mkdirSync(stateDir, { recursive: true })
  appendFileSync(path.join(stateDir, "ledger.jsonl"), JSON.stringify(row) + "\n")
}

/** 供 busy 等无登记写入的分支使用：自己取同一把锁后追加一行。 */
export function appendLedger(root: string, row: any): void {
  const stateDir = path.join(root, ".rddf", "state")
  const lockDir = path.join(stateDir, ".role.lock")
  mkdirSync(stateDir, { recursive: true })
  withLock(lockDir, () => appendLedgerLine(root, row))
}

/** 截断 + 脱敏：ledger 落盘时 last_assistant_text 可能含凭证。 */
export function redactAndTruncate(text: string, max = 800): string {
  let s = String(text ?? "")
  s = s.replace(/\b(?:oc_sk|sk|xox[baprs]|ghp|gho|ghu|ghs|ghr)[-_][A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
  s = s.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
  s = s.replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1[REDACTED]")
  if (s.length > max) s = s.slice(0, max) + "…"
  return s
}

/**
 * 登记 pair + role.json 的 session 分区（single writer = 本插件）。
 * `kind=knowledge` 只写 pair（含 kind 字段），**不触碰 role.json**——
 * 否则会在 sessions 分区产生非法 `current_role`（如 "explore"）。
 */
export function registerSession(
  root: string,
  sessionID: string,
  frontSessionID: string | undefined,
  agent: string,
  kind: DelegateKind = kindOfAgent(agent),
  ledgerRow?: any,
): void {
  const stateDir = path.join(root, ".rddf", "state")
  const lockDir = path.join(stateDir, ".role.lock")
  mkdirSync(stateDir, { recursive: true })
  withLock(lockDir, () => {
    const pairFile = path.join(stateDir, "pair.json")
    const pair = readJson(pairFile) ?? {}
    const pairs = pair.pairs && typeof pair.pairs === "object" ? pair.pairs : {}
    const existing = pairs[sessionID]
    pairs[sessionID] = {
      front_session_id: frontSessionID ?? null,
      canonical_root: root,
      agent,
      kind,
      registered_at: existing?.registered_at ?? new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    }
    writeJsonAtomic(pairFile, { version: "pair-v2", pairs })

    if (kind === "engineering") {
      const roleFile = path.join(stateDir, "role.json")
      const role = readJson(roleFile) ?? {}
      const sessions = role.sessions && typeof role.sessions === "object" ? role.sessions : {}
      sessions[sessionID] = {
        current_role: agent === "build" ? "builder" : agent,
        auto_switch_window: null,
        auto_answer: null,
        updated_at: new Date().toISOString(),
      }
      role.sessions = sessions
      role.current_role = role.current_role ?? sessions[sessionID].current_role
      role.updated_at = new Date().toISOString()
      writeJsonAtomic(roleFile, role)
    }

    if (ledgerRow) appendLedgerLine(root, ledgerRow)
  })
}

export function lookupPair(root: string, sessionID: string): any {
  const pairFile = path.join(root, ".rddf", "state", "pair.json")
  const pair = readJson(pairFile)
  if (!pair || typeof pair.pairs !== "object") return undefined
  return pair.pairs[sessionID]
}

/** scope 前缀 → 绝对路径（相对工程根解析；工程外的前缀保留原样）。 */
export function scopeAbsolutePaths(root: string, scope: string[]): string[] {
  return scope.map((s) => {
    const t = s.replace(/^\.\//, "").replace(/\/+$/, "")
    return isAbsolute(t) ? path.resolve(t) : path.resolve(root, t)
  })
}

/** 本次委托期间新增/变更的文件（前后 git status 差集）。 */
export function changedSince(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before)
  return after.filter((file) => !beforeSet.has(file))
}

/** 越界文件：变更文件中不在 scope 前缀之下的那些。 */
export function outOfScopeFiles(root: string, scope: string[], changed: string[]): string[] {
  const scopeAbs = scopeAbsolutePaths(root, scope)
  return changed.filter((file) => {
    const absolute = path.resolve(root, file)
    return !scopeAbs.some((prefix) => absolute === prefix || absolute.startsWith(prefix + path.sep))
  })
}

/** 从消息 part 中提取权限阻断信息（两种形态，见 Stage 0 报告 0.2）。 */
export function extractBlocked(messages: any): {
  blocked_reason: string | null
  blocked_action: string | null
  blocked_all: Array<{ reason: string; action: string | null }>
} {
  const arr = Array.isArray(messages) ? messages : []
  const blocked_all: Array<{ reason: string; action: string | null }> = []
  for (const message of arr) {
    const content = message?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type !== "tool") continue
      const state = part?.state
      if (!state || state.status !== "error") continue
      const error = state.error
      if (!error) continue
      const messageText = String(error.message ?? "")
      if (error.type === "permission.rejected" || messageText.includes("Permission denied")) {
        const action = messageText.split(":")[1]?.trim() ?? null
        blocked_all.push({ reason: messageText, action })
      } else if (error.type === "aborted" && messageText.includes("declined")) {
        blocked_all.push({ reason: messageText, action: null })
      }
    }
  }
  const first = blocked_all[0]
  return {
    blocked_reason: first?.reason ?? null,
    blocked_action: first?.action ?? null,
    blocked_all,
  }
}

export function lastAssistantText(messages: any): string {
  const arr = Array.isArray(messages) ? messages : []
  for (let i = arr.length - 1; i >= 0; i--) {
    const message = arr[i]
    if (message?.type !== "assistant") continue
    const content = message?.content
    if (!Array.isArray(content)) continue
    const texts = content
      .filter((part: any) => part?.type === "text" && typeof part.text === "string")
      .map((part: any) => part.text)
    if (texts.length > 0) return texts.join("\n")
  }
  return ""
}

/** 写盘类工具名（edit / write / patch 系列）——用于判断工程 session 是否真的"动手"过。 */
export const WRITE_TOOLS = new Set(["edit", "write", "patch", "apply_patch", "apply-patch", "multiedit"])

/**
 * 交付面证据（静默失败检测）。
 *
 * 背景：工程 session 可能只输出角色开场白就 idle（例如模型在 run 中途被切换后重来），
 * 宿主仍把该 run 记为 succeeded → delegate 回传 succeeded，但**什么都没产出**。
 * front 只看 outcome 就会把"没做"转述成"做完了"。
 *
 * 判定（全部基于结构化事实，不猜模型意图）：
 *   - final_is_role_opening：最后一条 assistant 文本停在角色开场白（`【角色:` / `【角色：`）
 *     → agent 停在了自我介绍这一步；
 *   - model_switched：本轮窗口内出现过宿主消息 `type == "model-switched"`
 *     → run 中途换过模型（新模型可能从头再来）；这是**根因信号**，不依赖任何文本格式；
 *   - write_tool_calls：写盘类工具调用数；artifacts：本次委托产生的文件变更数；
 *   - no_work_evidence：命中上述任一"停住"信号 **且** 无写盘调用 **且** 无产物。
 *
 * ⚠ 消息窗口必须只含**本轮**：判定入参应是以 baselineMessageID 切片后的消息
 * （见 sliceRoundMessages）——否则 resume 时上一轮的写盘调用会掩盖本轮零交付。
 *
 * 知识 session（kind=knowledge）不适用：它的产物本就是"回答"，通常零工具调用。
 */
export function summarizeDelivery(messages: any, changedFiles: string[]): {
  tool_calls: number
  write_tool_calls: number
  artifacts: number
  model_switched: number
  final_is_role_opening: boolean
  no_work_evidence: boolean
} {
  const arr = Array.isArray(messages) ? messages : []
  let toolCalls = 0
  let writeCalls = 0
  let modelSwitched = 0
  for (const message of arr) {
    if (message?.type === "model-switched") modelSwitched++
    if (message?.type !== "assistant") continue
    const content = message?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type !== "tool") continue
      toolCalls++
      const name = String(part?.name ?? "").toLowerCase()
      if (WRITE_TOOLS.has(name)) writeCalls++
    }
  }
  const finalText = lastAssistantText(arr).trimStart()
  const finalIsRoleOpening = /^【角色\s*[:：]/.test(finalText)
  const artifacts = Array.isArray(changedFiles) ? changedFiles.length : 0
  // 析取 → 合取：写盘调用与产物**都**没有，才算"没有交付证据"。
  // （早先用析取会把"用 shell 写文件"（write_tool_calls=0 但 artifacts≥1）误判成无产出。）
  const stoppedEarly = finalIsRoleOpening || modelSwitched > 0
  const noWorkEvidence = stoppedEarly && writeCalls === 0 && artifacts === 0
  return {
    tool_calls: toolCalls,
    write_tool_calls: writeCalls,
    artifacts,
    model_switched: modelSwitched,
    final_is_role_opening: finalIsRoleOpening,
    no_work_evidence: noWorkEvidence,
  }
}

/**
 * 只保留本轮消息（baseline 之后的部分）。
 * 判定"本轮有没有交付"必须只看本轮——resume 时历史轮次的写盘调用会掩盖本轮零交付。
 * 找不到 baseline（消息被压缩/清理）时退回全量（保守：宁可漏报也不误报）。
 */
export function sliceRoundMessages(messages: any[], baselineMessageID: string): any[] {
  if (!Array.isArray(messages)) return []
  if (!baselineMessageID) return messages
  const idx = messages.findIndex((m: any) => m?.id === baselineMessageID)
  if (idx < 0) return messages
  return messages.slice(idx + 1)
}

export function lastMessageAt(messages: any): number {
  const arr = Array.isArray(messages) ? messages : []
  for (let i = arr.length - 1; i >= 0; i--) {
    const created = toMillis(arr[i]?.time?.created)
    if (created > 0) return created
  }
  return 0
}

export function lastMessageID(messages: any): string {
  const arr = Array.isArray(messages) ? messages : []
  return arr.length > 0 ? String(arr[arr.length - 1]?.id ?? "") : ""
}


/**
 * 生成 delegate 工具定义（宿主无关部分全在这里，便于用假 ctx 做端到端单测）。
 * 插件入口只负责把它注册进 opencode 的工具表。
 */
export function delegateToolDefinition(ctx: any): any {
  return {
        name: TOOL_NAME,
        description:
          "把一个工程任务交给另一个工程 session 执行（agent=build），并取回结果。这是 front 唯一的工程行动出口。" +
          "必填：project_dir（工程根绝对路径）、task（任务原话）、goal（一句话目标）、scope（允许变更的路径前缀数组）、acceptance（可判定的验收判据）。" +
          "选填：agent、constraints、grants（用户预批的操作 [{action,resource}]）、resume_session、remove。" +
          "返回：session_id / outcome / 最后回复 / blocked_reason / out_of_scope_files。",
        input: {
          type: "object",
          properties: {
            project_dir: { type: "string", description: "工程根目录的绝对路径" },
            agent: { type: "string", description: "会话的 agent，默认 build。白名单：build / explore / librarian / oracle / metis / critic" },
            task: { type: "string", description: "给工程 session 的任务原话" },
            goal: { type: "string", description: "一句话目标" },
            scope: {
              type: "array",
              items: { type: "string" },
              description: "允许变更的路径前缀（相对工程根或绝对路径）；知识 session 可传空数组",
            },
            acceptance: { type: "string", description: "可判定的验收判据" },
            constraints: { type: "string", description: "额外禁止动作" },
            grants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  resource: { type: "string" },
                },
                required: ["action", "resource"],
                additionalProperties: false,
              },
              description: "用户已预批的操作（question/form/edit/write 不可 grant）",
            },
            resume_session: { type: "string", description: "续接既有工程 session 的 id" },
            remove: { type: "boolean", description: "完成后删除工程 session，默认 false" },
          },
          required: ["project_dir", "task", "goal", "scope", "acceptance"],
          additionalProperties: false,
        },
        options: { permission: "delegate", codemode: false },
        async execute(input: any, toolContext: any) {
          const brief = validateBrief(input)
          const { root, vcs } = canonicalRoot(brief.project_dir)
          const frontSessionID = toolContext?.sessionID

          // —— resume 校验：必须在该工程仓库的 pair 登记表内 ——
          // 登记表本身就是访问控制（只能续接本工程登记过的 session）。
          // 不硬校验 front_session_id：每次新对话都是新 front session，硬校验会让
          // "隔天回来继续"这种正常用法失效；改为返回软信号，由 front 告知用户。
          let existing: any = undefined
          let resumedByOtherFront = false
          let effectiveAgent = brief.agent
          let kind = brief.kind
          if (brief.resume_session) {
            existing = lookupPair(root, brief.resume_session)
            if (!existing) {
              throw fail(`resume_session 未登记: ${brief.resume_session}（只能续接本工程仓库 pair.json 中登记的 session）`)
            }
            if (existing.canonical_root !== root) {
              throw fail(`resume_session 的 canonical_root 不匹配: ${existing.canonical_root} != ${root}`)
            }
            // 白名单对 resume 同样生效（否则 create 校验、resume 放行 = 结构性绕过）。
            const existingAgent = String(existing.agent ?? "build")
            if (!ALLOWED_AGENTS.has(existingAgent)) {
              throw fail(`resume_session 的 agent 不在白名单内: ${existingAgent}`)
            }
            if (brief.agentProvided && brief.agent !== existingAgent) {
              throw fail(`resume_session 的 agent 不匹配: ${brief.agent} != ${existingAgent}`)
            }
            effectiveAgent = existingAgent
            kind = kindOfAgent(effectiveAgent)
            resumedByOtherFront = Boolean(
              existing.front_session_id && frontSessionID && existing.front_session_id !== frontSessionID,
            )
          }

          // 只读 session 恒注入单条 edit deny，绝不注入 scope 派生 allow
          // （session 规则排在 agent 规则之后、last-match-wins，会覆盖只读 agent 自身的 edit: deny）。
          const editRules =
            kind === "engineering"
              ? scopeEditRules(root, brief.scope)
              : [{ action: "edit", resource: "*", effect: "deny" }]

          const permissions = [
            ...CONSTANT_DENY.map((rule) => ({ ...rule, effect: "deny" })),
            ...editRules,
            ...brief.grants,
          ]

          let sessionID = brief.resume_session
          if (!sessionID) {
            const created = await ctx.session.create({
              location: { directory: brief.project_dir },
              agent: effectiveAgent,
              title: brief.goal.slice(0, 60),
              permissions,
            })
            sessionID = created.id
          }

          // 登记必须发生在 prompt 之前：工程 session 开局就要读自己的 role.json 分区，
          // 否则它会去找全局 fallback，而全局 fallback 属于 external_directory（默认 deny）。
          registerSession(root, sessionID, frontSessionID, effectiveAgent, kind)
          const statusBefore = vcs ? gitStatusPaths(root) : []

          const before = await ctx.session.get({ sessionID })
          const beforeMessages = await ctx.session.context({ sessionID })
          const baselineMessageID = lastMessageID(beforeMessages)
          const baselineIdle = toMillis((before as any)?.time?.idle)
          const baselineLastMessageAt = lastMessageAt(beforeMessages)

          // in-flight 保护：最后一条消息晚于最后空闲时间 → 上一次运行仍在进行，不排队。
          // （不能用 `time.updated > time.idle`：首次运行中的 session 从未 idle 过，idle 为 0，会漏判。）
          const busy = baselineLastMessageAt > baselineIdle
          const ledgerBase = {
            recorded_at: new Date().toISOString(),
            kind,
            front_session_id: frontSessionID ?? null,
            backend_session_id: sessionID,
            agent: effectiveAgent,
            goal: brief.goal,
            scope: brief.scope,
          }
          if (busy) {
            appendLedger(root, {
              ...ledgerBase,
              outcome: "busy",
              blocked_reason: null,
              out_of_scope_files: [],
              changed_files: [],
              last_assistant_text: "",
            })
            return {
              content: JSON.stringify(
                {
                  session_id: sessionID,
                  outcome: "busy",
                  still_running: true,
                  message: "目标工程 session 上一次运行仍在进行，已拒绝排队。请稍后重试或换新任务。",
                },
                null,
                2,
              ),
            }
          }

          const promptText = buildBrief(brief, root)
          await ctx.session.prompt({ sessionID, text: promptText })

          // 超时上限：默认 30 分钟；测试可用 DELEGATE_WAIT_TIMEOUT_MS 缩短。
          const waitTimeoutMs = (() => {
            const v = Number(process.env.DELEGATE_WAIT_TIMEOUT_MS)
            return Number.isFinite(v) && v > 0 ? v : WAIT_TIMEOUT_MS
          })()
          let waitError: string | undefined
          let waitTimedOut = false
          try {
            await Promise.race([
              ctx.session.wait({ sessionID }),
              new Promise((resolve) =>
                setTimeout(() => {
                  waitTimedOut = true
                  resolve(undefined)
                }, waitTimeoutMs),
              ),
            ])
          } catch (e: any) {
            waitError = e?.message ?? String(e)
          }

          const after = await ctx.session.get({ sessionID })
          const messages = await ctx.session.context({ sessionID })
          const afterMessageID = lastMessageID(messages)
          const newActivity = afterMessageID !== baselineMessageID || messages.length !== beforeMessages.length

          let outcome = (after as any)?.outcome ?? null
          if (!newActivity) {
            outcome = "unknown"
          }

          const { blocked_reason, blocked_action, blocked_all } = extractBlocked(messages)
          const assistantText = lastAssistantText(messages)

          const statusAfter = vcs ? gitStatusPaths(root) : []
          const beforeSet = new Set(statusBefore)
          // 只报告本次委托期间新增/变更的文件（委托前就存在的脏文件不算越界）
          const changed = statusAfter.filter((file) => !beforeSet.has(file))
          const scopeAbs = brief.scope.map((s) => {
            const t = s.replace(/^\.\//, "").replace(/\/+$/, "")
            return isAbsolute(t) ? path.resolve(t) : path.resolve(root, t)
          })
          const outOfScope = changed.filter((file) => {
            const absolute = path.resolve(root, file)
            return !scopeAbs.some((prefix) => absolute === prefix || absolute.startsWith(prefix + path.sep))
          })

          // 交付面证据：宿主说 succeeded ≠ 工程 session 真的交付了东西。
          // 判定只看向**本轮**的消息（resume 时历史轮次不得掩盖本轮零交付）。
          // 只对工程 session 判定（知识 session 的产物本就是"回答"，通常零工具调用）。
          // ⚠ 仍在跑（wait 超时 / 宿主未给 outcome）时**不判定**：此时读到的 outcome
          //   可能是上一轮的陈旧值（resume 场景），据此判"没有产出"会误报。
          const roundMessages = sliceRoundMessages(messages, baselineMessageID)
          const delivery = summarizeDelivery(roundMessages, changed)
          const stillRunning = waitTimedOut || outcome == null
          const noWorkEvidence =
            kind === "engineering" && outcome === "succeeded" && !stillRunning && delivery.no_work_evidence

          registerSession(root, sessionID, frontSessionID, effectiveAgent, kind, {
            ...ledgerBase,
            outcome,
            blocked_reason,
            out_of_scope_files: outOfScope,
            changed_files: changed,
            last_assistant_text: redactAndTruncate(assistantText),
            no_work_evidence: noWorkEvidence,
            tool_calls: delivery.tool_calls,
            write_tool_calls: delivery.write_tool_calls,
            final_is_role_opening: delivery.final_is_role_opening,
            model_switched: delivery.model_switched,
          })

          if (brief.remove) {
            try {
              await ctx.session.remove({ sessionID })
            } catch (e: any) {
              waitError = waitError ?? `remove 失败: ${e?.message}`
            }
          }

          const summary = {
            session_id: sessionID,
            project_root: root,
            vcs,
            agent: effectiveAgent,
            kind,
            resumed: Boolean(brief.resume_session),
            resumed_by_other_front: resumedByOtherFront,
            outcome,
            new_activity: newActivity,
            blocked_reason,
            blocked_action,
            blocked_all,
            out_of_scope_files: outOfScope,
            changed_files: changed,
            scope_check: vcs ? "ok" : "unavailable",
            last_assistant_text: assistantText,
            // 交付面证据（静默失败）：no_work_evidence=true 时 outcome 仍可能是 succeeded，
            // 调用方**不得**把它转述成"已完成"。
            tool_calls: delivery.tool_calls,
            write_tool_calls: delivery.write_tool_calls,
            artifacts: delivery.artifacts,
            final_is_role_opening: delivery.final_is_role_opening,
            model_switched: delivery.model_switched,
            no_work_evidence: noWorkEvidence,
            still_running: stillRunning,
            wait_timed_out: waitTimedOut,
            status_age_ms: Math.max(0, Date.now() - toMillis((after as any)?.time?.updated)),
            wait_error: waitError,
          }

          return { content: JSON.stringify(summary, null, 2) }
        },
}
}
