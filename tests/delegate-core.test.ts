/**
 * delegate 工具的纯逻辑单元测试。
 *
 * 覆盖双 session 功能的可测部分：brief 契约、grants 白名单、scope→edit 规则、
 * session permissions 组装、阻断提取、消息工具、越界判定、项目识别、
 * pair/role 登记与并发锁。
 *
 * 运行：bun test tests/
 */
import { afterAll, describe, expect, test } from "bun:test"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  utimesSync,
  symlinkSync,
} from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  ALLOWED_AGENTS,
  CONSTANT_DENY,
  GRANT_ALLOWED,
  GRANT_FORBIDDEN,
  READONLY_AGENTS,
  appendLedger,
  ARCH_FALLBACK_DIRS,
  archDenyRules,
  archRoots,
  assertResumeRoleClass,
  assertRoleClassCompatible,
  buildBrief,
  classAllowRoots,
  classPermissions,
  classSubagentRules,
  isPathWithin,
  realRelative,
  canonicalRoot,
  changedSince,
  extractBlocked,
  gitStatusPaths,
  kindOfAgent,
  lastAssistantText,
  lastMessageAt,
  lastMessageID,
  lookupPair,
  outOfScopeFiles,
  readJson,
  redactAndTruncate,
  registerSession,
  scopeEditRules,
  SLOT_STATES,
  sliceRoundMessages,
  summarizeDelivery,
  ownerAgentOf,
  planRefRootLabels,
  validateBrief,
  validatePlanRef,
  validateGrants,
  withLock,
  writeJsonAtomic,
} from "../lib/delegate-core.ts"

const TMP = mkdtempSync(path.join(tmpdir(), "delegate-core-test-"))

function gitRepo(name: string): string {
  const dir = path.join(TMP, name)
  mkdirSync(dir, { recursive: true })
  execFileSync("git", ["init", "-q"], { cwd: dir })
  writeFileSync(path.join(dir, "README.md"), "hello\n")
  execFileSync("git", ["add", "-A"], { cwd: dir })
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: dir })
  return dir
}

const VALID_INPUT = {
  project_dir: TMP,
  task: "把 README 的第一行改成 hi",
  goal: "改 README",
  scope: ["README.md"],
  acceptance: "README 首行为 hi",
}

// ───────────────────────────── brief 契约 ─────────────────────────────

describe("validateBrief：六必填", () => {
  test("合法输入被接受并归一化", () => {
    const brief = validateBrief({ ...VALID_INPUT })
    expect(brief.project_dir).toBe(TMP)
    expect(brief.agent).toBe("build")
    expect(brief.remove).toBe(false)
    expect(brief.grants).toEqual([])
    expect(brief.constraints).toBe("")
    expect(brief.resume_session).toBeUndefined()
  })

  test("task 缺失 → 报错", () => {
    expect(() => validateBrief({ ...VALID_INPUT, task: undefined })).toThrow(/task/)
  })

  test("goal 缺失 → 报错", () => {
    expect(() => validateBrief({ ...VALID_INPUT, goal: "  " })).toThrow(/goal/)
  })

  test("acceptance 缺失 → 报错", () => {
    expect(() => validateBrief({ ...VALID_INPUT, acceptance: "" })).toThrow(/acceptance/)
  })

  test("scope 缺失或为空 → 报错", () => {
    expect(() => validateBrief({ ...VALID_INPUT, scope: undefined })).toThrow(/scope/)
    expect(() => validateBrief({ ...VALID_INPUT, scope: [] })).toThrow(/scope/)
  })

  test("scope 元素非字符串 → 报错", () => {
    expect(() => validateBrief({ ...VALID_INPUT, scope: [123] })).toThrow(/scope/)
  })

  test("project_dir 必须是绝对路径且存在", () => {
    expect(() => validateBrief({ ...VALID_INPUT, project_dir: "relative/path" })).toThrow(/绝对路径/)
    expect(() => validateBrief({ ...VALID_INPUT, project_dir: "/definitely/not/here" })).toThrow(/不存在/)
  })
})

// ───────────────────────────── grants 白名单 ─────────────────────────────

describe("validateGrants：grants 不得撤销安全边界", () => {
  test("非数组 → 报错", () => {
    expect(() => validateGrants("x")).toThrow(/数组/)
  })

  test("缺 action / resource → 报错", () => {
    expect(() => validateGrants([{ resource: "*" }])).toThrow(/action/)
    expect(() => validateGrants([{ action: "shell" }])).toThrow(/resource/)
  })

  for (const action of ["question", "form", "edit", "write"]) {
    test(`${action} 永不可 grant`, () => {
      expect(() => validateGrants([{ action, resource: "*" }])).toThrow(/永不可 grant/)
      expect(GRANT_FORBIDDEN.has(action)).toBe(true)
    })
  }

  test("非白名单 action → 报错", () => {
    expect(() => validateGrants([{ action: "delete", resource: "*" }])).toThrow(/不允许 action/)
  })

  test("read .env 不可 grant", () => {
    expect(() => validateGrants([{ action: "read", resource: "**/.env" }])).toThrow(/\.env/)
  })

  test("白名单内的具体 grant 被接受并归一化为 allow", () => {
    const grants = validateGrants([
      { action: "shell", resource: "git push *" },
      { action: "external_directory", resource: "/workspace/project/Hub/*" },
    ])
    expect(grants).toEqual([
      { action: "shell", resource: "git push *", effect: "allow" },
      { action: "external_directory", resource: "/workspace/project/Hub/*", effect: "allow" },
    ])
  })

  test("白名单集合本身不含危险类目", () => {
    for (const forbidden of GRANT_FORBIDDEN) expect(GRANT_ALLOWED.has(forbidden)).toBe(false)
  })
})

// ───────────────────────────── scope → edit 规则 ─────────────────────────────

describe("scopeEditRules：scope 的强制点", () => {
  test("第一条恒为 edit:* deny", () => {
    const rules = scopeEditRules(TMP, ["src"])
    expect(rules[0]).toEqual({ action: "edit", resource: "*", effect: "deny" })
  })

  test("目录型 scope 同时产出 x 与 x/*", () => {
    const rules = scopeEditRules(TMP, ["src"])
    expect(rules.map((r) => r.resource)).toEqual(["*", "src", "src/*"])
    expect(rules.slice(1).every((r) => r.effect === "allow")).toBe(true)
  })

  test("文件型 scope 同时产出 x 与 x/*（回归：x/* 匹配不到 x）", () => {
    const rules = scopeEditRules(TMP, ["README.md"])
    expect(rules.map((r) => r.resource)).toEqual(["*", "README.md", "README.md/*"])
  })

  test("绝对路径 scope 归一为工程内相对路径", () => {
    const rules = scopeEditRules(TMP, [path.join(TMP, "docs")])
    expect(rules.map((r) => r.resource)).toEqual(["*", "docs", "docs/*"])
  })

  test("工程外的 scope 被跳过（不放宽边界）", () => {
    const rules = scopeEditRules(TMP, ["/etc"])
    expect(rules.map((r) => r.resource)).toEqual(["*"])
  })

  test("scope 为 '.' / './' / '' → 先 deny 再 allow（净效果：放行全部 edit）", () => {
    for (const value of [".", "./", ""]) {
      const rules = scopeEditRules(TMP, [value])
      expect(rules.map((r) => r.resource)).toEqual(["*", "*"])
      expect(rules[0].effect).toBe("deny")
      expect(rules[1].effect).toBe("allow")
    }
  })
})

// ───────────────────────────── session permissions 组装 ─────────────────────────────

describe("常量 deny 集：无人值守下 ask 会永久挂死", () => {
  test("覆盖 build 的危险 shell 类目", () => {
    const resources = CONSTANT_DENY.filter((r) => r.action === "shell").map((r) => r.resource)
    for (const p of ["git push *", "git reset --hard *", "rm -rf *", "sudo *", "cat *.env"]) {
      expect(resources).toContain(p)
    }
  })

  test("包含 question / form / external_directory / MCP 写（挂死源与写工具）", () => {
    const actions = CONSTANT_DENY.map((r) => r.action)
    expect(actions).toContain("question")
    expect(actions).toContain("form")
    expect(actions).toContain("external_directory")
    expect(actions.filter((a) => a.startsWith("codebase-memory-mcp_")).length).toBe(4)
  })

  test("规则顺序即策略：常量 deny 必须排在 grants 之前（否则 grants 会压掉 deny）", () => {
    const grants = validateGrants([{ action: "shell", resource: "git push *" }])
    const permissions = [
      ...CONSTANT_DENY.map((r) => ({ ...r, effect: "deny" })),
      ...scopeEditRules(TMP, ["README.md"]),
      ...grants,
    ]
    const denyIndex = permissions.findIndex((p) => p.action === "shell" && p.resource === "git push *" && p.effect === "deny")
    const grantIndex = permissions.findIndex((p) => p.action === "shell" && p.resource === "git push *" && p.effect === "allow")
    expect(denyIndex).toBeGreaterThanOrEqual(0)
    expect(grantIndex).toBeGreaterThan(denyIndex)
  })
})

// ───────────────────────────── 阻断提取 ─────────────────────────────

describe("extractBlocked：区分「因权限放弃」与「任务完成」", () => {
  const toolError = (error: any, input: any = {}) => ({
    type: "assistant",
    content: [{ type: "tool", name: "shell", state: { status: "error", input, error } }],
  })

  test("形态 A：规则级拒绝", () => {
    const messages = [toolError({ type: "permission.rejected", message: "Permission denied: edit" })]
    const r = extractBlocked(messages)
    expect(r.blocked_reason).toBe("Permission denied: edit")
    expect(r.blocked_action).toBe("edit")
    expect(r.blocked_all.length).toBe(1)
  })

  test("形态 B：用户显式拒绝", () => {
    const messages = [toolError({ type: "aborted", message: "The user declined this tool call" })]
    const r = extractBlocked(messages)
    expect(r.blocked_reason).toBe("The user declined this tool call")
    expect(r.blocked_action).toBeNull()
  })

  test("非阻断错误（工具执行失败）不算阻断", () => {
    const messages = [toolError({ type: "tool.execution", message: "File not found: /x" })]
    expect(extractBlocked(messages).blocked_reason).toBeNull()
  })

  test("无 tool part → 不阻断", () => {
    expect(extractBlocked([{ type: "assistant", content: [{ type: "text", text: "ok" }] }]).blocked_reason).toBeNull()
    expect(extractBlocked(undefined).blocked_reason).toBeNull()
  })

  test("多个阻断：全部收集，首个作为主因", () => {
    const messages = [
      toolError({ type: "permission.rejected", message: "Permission denied: external_directory" }),
      toolError({ type: "permission.rejected", message: "Permission denied: edit" }),
    ]
    const r = extractBlocked(messages)
    expect(r.blocked_all.length).toBe(2)
    expect(r.blocked_reason).toBe("Permission denied: external_directory")
  })
})

// ───────────────────────────── 消息工具 ─────────────────────────────

describe("消息读取工具", () => {
  const assistant = (text: string, id: string, created: number) => ({
    id,
    type: "assistant",
    time: { created },
    content: [{ type: "text", text }],
  })

  test("lastAssistantText 取最后一条含文本的 assistant 消息", () => {
    const messages = [assistant("first", "m1", 1), assistant("second", "m2", 2)]
    expect(lastAssistantText(messages)).toBe("second")
  })

  test("无文本 → 空串；非数组 → 空串", () => {
    expect(lastAssistantText([{ type: "assistant", content: [{ type: "reasoning", text: "x" }] }])).toBe("")
    expect(lastAssistantText(undefined)).toBe("")
  })

  test("lastMessageID / lastMessageAt", () => {
    const messages = [{ id: "m1", type: "user", time: { created: 100 } }, assistant("a", "m2", 200)]
    expect(lastMessageID(messages)).toBe("m2")
    expect(lastMessageAt(messages)).toBe(200)
    expect(lastMessageAt([])).toBe(0)
  })
})

// ───────────────────────────── 越界判定 ─────────────────────────────

describe("scope 越界检测", () => {
  test("changedSince 取前后差集（委托前的脏文件不算）", () => {
    expect(changedSince(["a.txt", "b.txt"], ["a.txt", "b.txt", "c.txt"])).toEqual(["c.txt"])
  })

  test("scope 内文件不算越界，scope 外文件算越界", () => {
    const changed = ["src/a.ts", "other.ts", "src/deep/b.ts"]
    expect(outOfScopeFiles(TMP, ["src"], changed)).toEqual(["other.ts"])
  })

  test("scope 指向单文件时只有该文件在界内", () => {
    const changed = ["README.md", "notes.md"]
    expect(outOfScopeFiles(TMP, ["README.md"], changed)).toEqual(["notes.md"])
  })

  test("绝对路径 scope 同样生效", () => {
    const changed = [path.join(TMP, "src/a.ts")]
    expect(outOfScopeFiles(TMP, [path.join(TMP, "src")], changed)).toEqual([])
  })
})

// ───────────────────────────── 项目识别 ─────────────────────────────

describe("项目识别与变更检测", () => {
  test("git 仓库 → stateRoot == workRoot（主仓场景两根恒等）+ vcs=true", () => {
    const repo = gitRepo("repo-a")
    const r = canonicalRoot(repo)
    expect(r.vcs).toBe(true)
    // 主仓：两个根都在仓库根，零行为变化（AC1）
    expect(path.resolve(r.stateRoot)).toBe(path.resolve(repo))
    expect(path.resolve(r.workRoot)).toBe(path.resolve(repo))
  })

  test("非 git 目录 → 绝对路径 + vcs=false（两根相同，零行为变化）", () => {
    const plain = path.join(TMP, "plain")
    mkdirSync(plain, { recursive: true })
    const r = canonicalRoot(plain)
    expect(r.vcs).toBe(false)
    expect(path.resolve(r.stateRoot)).toBe(path.resolve(plain))
    expect(path.resolve(r.workRoot)).toBe(path.resolve(plain))
  })

  test("gitStatusPaths 解析 porcelain 输出（含新增/修改/重命名）", () => {
    const repo = gitRepo("repo-b")
    writeFileSync(path.join(repo, "new.txt"), "x")
    writeFileSync(path.join(repo, "README.md"), "changed\n")
    execFileSync("git", ["mv", "README.md", "MOVED.md"], { cwd: repo })
    const paths = gitStatusPaths(repo)
    expect(paths).toContain("new.txt")
    expect(paths).toContain("MOVED.md")
    expect(paths).not.toContain("README.md")
  })
})

// ───────────────────────────── pair / role 登记 ─────────────────────────────

describe("pair / role 登记（single writer = 插件）", () => {
  test("registerSession 写 pair-v2 与 role.json 的 sessions 分区", () => {
    const repo = gitRepo("repo-pair")
    registerSession(repo, "ses_1", "ses_front", "build")
    const pair = readJson(path.join(repo, ".rddf/state/pair.json"))
    expect(pair.version).toBe("pair-v2")
    expect(pair.pairs["ses_1"].canonical_root).toBe(path.resolve(repo))
    expect(pair.pairs["ses_1"].front_session_id).toBe("ses_front")
    const role = readJson(path.join(repo, ".rddf/state/role.json"))
    expect(role.sessions["ses_1"].current_role).toBe("builder")
    expect(role.sessions["ses_1"].auto_switch_window).toBeNull()
  })

  test("两个工程 session 并存（pair-v2 不是单槽）", () => {
    const repo = gitRepo("repo-pair2")
    registerSession(repo, "ses_a", "ses_front", "build")
    registerSession(repo, "ses_b", "ses_front", "build")
    const pair = readJson(path.join(repo, ".rddf/state/pair.json"))
    expect(Object.keys(pair.pairs).sort()).toEqual(["ses_a", "ses_b"])
  })

  test("lookupPair 命中 / 未命中", () => {
    const repo = gitRepo("repo-pair3")
    registerSession(repo, "ses_x", null, "build")
    expect(lookupPair(repo, "ses_x")?.agent).toBe("build")
    expect(lookupPair(repo, "ses_missing")).toBeUndefined()
  })

  test("既有 role.json 的其它字段被保留（只增 sessions 分区）", () => {
    const repo = gitRepo("repo-pair4")
    const roleFile = path.join(repo, ".rddf/state/role.json")
    mkdirSync(path.dirname(roleFile), { recursive: true })
    writeFileSync(roleFile, JSON.stringify({ current_role: "architect", history: [{ role: "architect" }] }, null, 2))
    registerSession(repo, "ses_keep", null, "build")
    const role = readJson(roleFile)
    expect(role.current_role).toBe("architect")
    expect(role.history.length).toBe(1)
    expect(role.sessions["ses_keep"]).toBeDefined()
  })

  test("writeJsonAtomic 写出的文件是完整 JSON", () => {
    const file = path.join(TMP, "atomic.json")
    writeJsonAtomic(file, { a: 1 })
    expect(JSON.parse(readFileSync(file, "utf8")).a).toBe(1)
  })

  test("withLock 互斥：并发写入不丢更新", () => {
    const repo = gitRepo("repo-lock")
    const stateDir = path.join(repo, ".rddf/state")
    mkdirSync(stateDir, { recursive: true })
    const lockDir = path.join(stateDir, ".role.lock")
    for (let i = 0; i < 10; i++) {
      withLock(lockDir, () => {
        const file = path.join(stateDir, "counter.json")
        const current = readJson(file) ?? { n: 0 }
        current.n = current.n + 1
        writeJsonAtomic(file, current)
      })
    }
    expect(readJson(path.join(stateDir, "counter.json")).n).toBe(10)
  })
})

// ───────────────────────────── brief 文本组装 ─────────────────────────────

describe("buildBrief：委托简报（front 与工程 session 之间唯一的通道）", () => {
  test("包含 goal / scope / acceptance / task", () => {
    const brief = validateBrief({ ...VALID_INPUT })
    const text = buildBrief(brief, TMP)
    expect(text).toContain("改 README")
    expect(text).toContain("README.md")
    expect(text).toContain("README 首行为 hi")
    expect(text).toContain("把 README 的第一行改成 hi")
  })

  test("可选字段缺席时不出现在简报里", () => {
    const brief = validateBrief({ ...VALID_INPUT })
    const text = buildBrief(brief, TMP)
    expect(text).not.toContain("constraints")
    expect(text).not.toContain("grants")
  })

  test("constraints / grants 出现时写入简报", () => {
    const brief = validateBrief({
      ...VALID_INPUT,
      constraints: "不要 commit",
      grants: [{ action: "shell", resource: "git push *" }],
    })
    const text = buildBrief(brief, TMP)
    expect(text).toContain("不要 commit")
    expect(text).toContain("git push *")
  })

  test("简报要求只在 scope 内改动、不得绕过被拒操作", () => {
    const text = buildBrief(validateBrief({ ...VALID_INPUT }), TMP)
    expect(text).toContain("scope")
    expect(text).toContain("不要换写法绕过")
  })
})

// ───────────── front 知识获取能力（ADR-front-knowledge-capability） ─────────────

describe("agent 白名单与 kind 推导", () => {
  test("白名单 = build + 五个只读 agent", () => {
    expect([...ALLOWED_AGENTS].sort()).toEqual(
      ["build", "critic", "explore", "librarian", "metis", "oracle"].sort(),
    )
    expect([...READONLY_AGENTS].sort()).toEqual(["critic", "explore", "librarian", "metis", "oracle"].sort())
  })

  test("build → engineering；只读 agent → knowledge", () => {
    expect(kindOfAgent("build")).toBe("engineering")
    for (const a of READONLY_AGENTS) expect(kindOfAgent(a)).toBe("knowledge")
  })

  test("不在白名单的 agent → 在建 session 前拒绝", () => {
    for (const a of ["general", "plan", "title", "compaction", "context-builder"]) {
      expect(() => validateBrief({ ...VALID_INPUT, agent: a })).toThrow(/白名单/)
    }
  })

  test("知识 session 的 scope 可省略/为空；工程 session 仍必填", () => {
    const k = validateBrief({ ...VALID_INPUT, agent: "explore", scope: undefined })
    expect(k.scope).toEqual([])
    expect(k.kind).toBe("knowledge")
    expect(() => validateBrief({ ...VALID_INPUT, scope: [] })).toThrow(/scope/)
  })

  test("知识 session 不接受 grants", () => {
    expect(() =>
      validateBrief({
        ...VALID_INPUT,
        agent: "librarian",
        scope: [],
        grants: [{ action: "shell", resource: "git push *" }],
      }),
    ).toThrow(/不接受 grants/)
  })

  test("简报：知识 session 无 scope 行、要求只读", () => {
    const text = buildBrief(validateBrief({ ...VALID_INPUT, agent: "oracle", scope: [] }), TMP)
    expect(text).toContain("kind）: knowledge")
    expect(text).toContain("不要修改任何文件")
    expect(text).not.toContain("只在 scope 内改动")
  })
})

describe("知识 session 登记（不污染 role.json）", () => {
  test("registerSession(kind=knowledge) 只写 pair，不写 role.json", () => {
    const repo = gitRepo("repo-knowledge")
    registerSession(repo, "ses_k", "ses_front", "explore", "knowledge")
    const pair = readJson(path.join(repo, ".rddf/state/pair.json"))
    expect(pair.pairs["ses_k"].kind).toBe("knowledge")
    expect(pair.pairs["ses_k"].agent).toBe("explore")
    expect(existsSync(path.join(repo, ".rddf/state/role.json"))).toBe(false)
  })

  test("engineering 登记的 pair 条目同样带 kind", () => {
    const repo = gitRepo("repo-eng-kind")
    registerSession(repo, "ses_e", null, "build")
    expect(readJson(path.join(repo, ".rddf/state/pair.json")).pairs["ses_e"].kind).toBe("engineering")
  })

  test("重复登记保留 registered_at，只更新 last_used_at / front_session_id", () => {
    const repo = gitRepo("repo-reattach")
    registerSession(repo, "ses_r", null, "build")
    const first = readJson(path.join(repo, ".rddf/state/pair.json")).pairs["ses_r"]
    registerSession(repo, "ses_r", "ses_other", "build")
    const second = readJson(path.join(repo, ".rddf/state/pair.json")).pairs["ses_r"]
    expect(second.registered_at).toBe(first.registered_at)
    expect(second.front_session_id).toBe("ses_other")
  })
})

describe("ledger：历史事实（插件单写）", () => {
  test("appendLedger 追加 JSONL 行", () => {
    const repo = gitRepo("repo-ledger")
    appendLedger(repo, { outcome: "succeeded", goal: "x" })
    const raw = readFileSync(path.join(repo, ".rddf/state/ledger.jsonl"), "utf8")
    expect(JSON.parse(raw.trim()).goal).toBe("x")
  })

  test("redactAndTruncate 脱敏 + 截断", () => {
    const out = redactAndTruncate("token=oc_sk_abcdefgh12345678 and sk-1234567890abcdef end", 1000)
    expect(out).not.toContain("oc_sk_abcdefgh12345678")
    expect(out).not.toContain("sk-1234567890abcdef")
    expect(redactAndTruncate("a".repeat(20), 10)).toBe("a".repeat(10) + "…")
  })
})

describe("容错路径", () => {
  test("readJson：损坏 JSON / 空文件 → undefined", () => {
    const bad = path.join(TMP, "bad.json")
    writeFileSync(bad, "{not json")
    expect(readJson(bad)).toBeUndefined()
    const empty = path.join(TMP, "empty.json")
    writeFileSync(empty, "  \n")
    expect(readJson(empty)).toBeUndefined()
    expect(readJson(path.join(TMP, "missing.json"))).toBeUndefined()
  })

  test("withLock：陈旧锁（>30s）被回收，不阻塞", () => {
    const dir = path.join(TMP, "stale-lock")
    mkdirSync(dir, { recursive: true })
    const lock = path.join(dir, ".role.lock")
    mkdirSync(lock)
    const old = new Date(Date.now() - 60_000)
    utimesSync(lock, old, old)
    let ran = false
    withLock(lock, () => {
      ran = true
    })
    expect(ran).toBe(true)
    expect(existsSync(lock)).toBe(false)
  })
})

describe("summarizeDelivery：交付面证据（静默失败检测）", () => {
  const ROLE_OPENING = "【角色: builder | source: state-file】我可实施代码修改。"

  function assistant(parts: any[]) {
    return [{ id: "m1", type: "assistant", time: { created: 1 }, content: parts }]
  }

  test("停在角色开场白 + 无产物 → no_work_evidence=true", () => {
    const d = summarizeDelivery(assistant([{ type: "text", text: ROLE_OPENING }]), [])
    expect(d.final_is_role_opening).toBe(true)
    expect(d.no_work_evidence).toBe(true)
    expect(d.tool_calls).toBe(0)
    expect(d.artifacts).toBe(0)
  })

  test("正常结论文本 → no_work_evidence=false", () => {
    const d = summarizeDelivery(assistant([{ type: "text", text: "## 执行结果\n已创建 a.txt" }]), ["a.txt"])
    expect(d.final_is_role_opening).toBe(false)
    expect(d.no_work_evidence).toBe(false)
    expect(d.artifacts).toBe(1)
  })

  test("有写盘工具调用且有产物 → 即使结尾是开场白也不判 no_work_evidence", () => {
    const d = summarizeDelivery(
      assistant([
        { type: "tool", name: "edit", state: { status: "completed" } },
        { type: "text", text: ROLE_OPENING },
      ]),
      ["a.txt"],
    )
    expect(d.tool_calls).toBe(1)
    expect(d.write_tool_calls).toBe(1)
    expect(d.no_work_evidence).toBe(false)
  })

  test("shell 不算写盘工具（只有 edit/write/patch 系列算）", () => {
    const d = summarizeDelivery(
      assistant([
        { type: "tool", name: "shell", state: { status: "completed" } },
        { type: "text", text: ROLE_OPENING },
      ]),
      [],
    )
    expect(d.tool_calls).toBe(1)
    expect(d.write_tool_calls).toBe(0)
    expect(d.no_work_evidence).toBe(true)
  })

  test("非 assistant 消息不计入工具调用", () => {
    const d = summarizeDelivery(
      [{ id: "u1", type: "user", time: { created: 1 }, content: [{ type: "tool", name: "edit" }] }],
      [],
    )
    expect(d.tool_calls).toBe(0)
  })

  test("回归夹具：真实失败会话（只读 role.json → 角色开场白 → idle）必须被判为 no_work_evidence", () => {
    const fixture = JSON.parse(
      readFileSync(path.join(__dirname, "fixtures/real-no-work-session.json"), "utf8"),
    )
    const d = summarizeDelivery(fixture.messages, [])
    expect(d.tool_calls).toBeGreaterThan(0) // 确实调过工具（读 role.json）
    expect(d.write_tool_calls).toBe(0) // 但没有写盘调用
    expect(d.artifacts).toBe(0) // 也没有产物
    expect(d.final_is_role_opening).toBe(true)
    expect(d.model_switched).toBe(1) // 根因信号：run 中途换过模型
    expect(d.no_work_evidence).toBe(true)
  })

  test("model-switched 是根因信号：最终文本不是开场白也能判出来", () => {
    const d = summarizeDelivery(
      [
        { id: "m1", type: "assistant", time: { created: 1 }, content: [{ type: "text", text: "好的，我继续处理。" }] },
        { id: "m2", type: "model-switched", time: { created: 2 } },
      ],
      [],
    )
    expect(d.final_is_role_opening).toBe(false)
    expect(d.model_switched).toBe(1)
    expect(d.no_work_evidence).toBe(true)
  })

  test("全角冒号变体也算角色开场白", () => {
    const d = summarizeDelivery(
      [{ id: "m1", type: "assistant", time: { created: 1 }, content: [{ type: "text", text: "【角色：builder】…" }] }],
      [],
    )
    expect(d.final_is_role_opening).toBe(true)
    expect(d.no_work_evidence).toBe(true)
  })

  test("有产物（有变更文件）时，即使文本是开场白也不判 no_work_evidence", () => {
    const d = summarizeDelivery(
      [{ id: "m1", type: "assistant", time: { created: 1 }, content: [{ type: "text", text: "【角色: builder】…" }] }],
      ["a.txt"],
    )
    expect(d.artifacts).toBe(1)
    expect(d.no_work_evidence).toBe(false)
  })
})

describe("sliceRoundMessages：只保留本轮消息", () => {
  const msgs = [
    { id: "m1", type: "assistant" },
    { id: "m2", type: "assistant" },
    { id: "m3", type: "assistant" },
  ]

  test("从 baseline 之后开始切", () => {
    expect(sliceRoundMessages(msgs, "m2").map((m: any) => m.id)).toEqual(["m3"])
  })

  test("baseline 不在列表（消息被压缩/清理）→ 退回全量（保守：宁可漏报不误报）", () => {
    expect(sliceRoundMessages(msgs, "missing")).toHaveLength(3)
  })

  test("无 baseline → 全量", () => {
    expect(sliceRoundMessages(msgs, "")).toHaveLength(3)
  })
})

describe("D2：plan_ref 校验（ADR-plan-delegate-engineering-session D2）", () => {
  const mk = (rel: string, content = "plan") => {
    const p = path.join(TMP, "planref", rel)
    mkdirSync(path.dirname(p), { recursive: true })
    writeFileSync(p, content)
    return p
  }
  const root = path.join(TMP, "planref")

  test("缺失 + required ⇒ 拒绝，且错误信息列出 accepted roots", () => {
    const r = validatePlanRef({ planRef: undefined, projectDir: root, required: true })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain("plan_ref 必填")
      for (const label of [".rddf/plans/**", ".rddf/improvements/**", "openspec/changes/*/proposal.md"]) {
        expect(r.message).toContain(label)
      }
    }
  })

  test("缺失 + 非 required（知识后端）⇒ 放行", () => {
    const r = validatePlanRef({ planRef: undefined, projectDir: root, required: false })
    expect(r.ok).toBe(true)
  })

  test("accepted root 内且文件存在 ⇒ 放行（相对 project_dir 解析）", () => {
    mk(".rddf/plans/x.md")
    const r = validatePlanRef({ planRef: ".rddf/plans/x.md", projectDir: root, required: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.resolved.endsWith("/.rddf/plans/x.md")).toBe(true)
  })

  test("accepted root 内但文件不存在 ⇒ 拒绝（存在性是强制函数）", () => {
    const r = validatePlanRef({ planRef: ".rddf/plans/missing.md", projectDir: root, required: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain("不存在")
  })

  test("根外路径 ⇒ 拒绝（可写 ≠ 可引用）", () => {
    mk(".plans/x.md")
    mk("docs/adr/draft-x.md")
    for (const bad of [".plans/x.md", "docs/adr/draft-x.md", "openspec/changes/c1/design.md"]) {
      const r = validatePlanRef({ planRef: bad, projectDir: root, required: true })
      expect(r.ok, `${bad} 应被拒`).toBe(false)
      if (!r.ok) expect(r.message).toContain("accepted roots")
    }
  })

  test("越界相对路径（../）⇒ 拒绝", () => {
    const r = validatePlanRef({ planRef: "../../etc/passwd", projectDir: root, required: true })
    expect(r.ok).toBe(false)
  })

  test("绝对路径且命中 accepted root ⇒ 放行", () => {
    const abs = mk(".rddf/improvements/y.md")
    const r = validatePlanRef({ planRef: abs, projectDir: root, required: true })
    expect(r.ok).toBe(true)
  })

  test("owner_agent：只有 plan 是新主体；未知/缺失一律按 front 解释", () => {
    expect(ownerAgentOf("plan")).toBe("plan")
    expect(ownerAgentOf("front")).toBe("front")
    expect(ownerAgentOf(undefined)).toBe("front")
    expect(ownerAgentOf("build")).toBe("front")
  })
})


// ───────────────── role_class（ADR-backend-handoff-role-class） ─────────────────

/** 与内核 `evaluate` 同语义：findLast（后写覆盖先写）+ glob 匹配。 */
function evaluateEffect(
  rules: Array<{ action: string; resource: string; effect: string }>,
  action: string,
  resource: string,
): string {
  const glob = (pattern: string, value: string): boolean => {
    if (pattern === "*") return true
    if (!pattern.includes("*")) return pattern === value
    const escaped = pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")
    return new RegExp(`^${escaped}$`).test(value)
  }
  const matched = rules.filter((rule) => glob(rule.action, action) && glob(rule.resource, resource))
  return matched[matched.length - 1]?.effect ?? "ask"
}

function archRepo(name: string, opts?: { archPaths?: string[] | null; corrupt?: boolean }): string {
  const repo = gitRepo(name)
  mkdirSync(path.join(repo, "docs", "adr"), { recursive: true })
  mkdirSync(path.join(repo, "src"), { recursive: true })
  if (opts?.corrupt) {
    mkdirSync(path.join(repo, ".rddf", "config"), { recursive: true })
    writeFileSync(path.join(repo, ".rddf", "config", "arch-docs.json"), "{ broken json")
    return repo
  }
  if (opts?.archPaths !== null && opts?.archPaths !== undefined) {
    mkdirSync(path.join(repo, ".rddf", "config"), { recursive: true })
    writeFileSync(
      path.join(repo, ".rddf", "config", "arch-docs.json"),
      JSON.stringify({ arch_paths: opts.archPaths, exclude_paths: [] }),
    )
  }
  return repo
}

describe("role_class：值域与缺省（D1）", () => {
  test("缺省 = builder（缺省只认 undefined）", () => {
    expect(validateBrief({ ...VALID_INPUT }).role_class).toBe("builder")
    expect(validateBrief({ ...VALID_INPUT, role_class: undefined }).role_class).toBe("builder")
  })

  test("非法值 / null / 空串 ⇒ 抛（不是“没填”）", () => {
    for (const bad of ["Architect", "architect ", "general", null, "", 0]) {
      expect(() => validateBrief({ ...VALID_INPUT, role_class: bad as any })).toThrow(/role_class/)
    }
  })

  test("三类合法值被接受", () => {
    for (const rc of ["builder", "architect", "verifier"]) {
      expect(validateBrief({ ...VALID_INPUT, role_class: rc }).role_class).toBe(rc)
    }
  })

  test("知识 session 与 role_class 互斥", () => {
    expect(() =>
      validateBrief({ ...VALID_INPUT, agent: "explore", scope: [], role_class: "verifier" }),
    ).toThrow(/不接受 role_class/)
  })
})

describe("archRoots：配置三态（D3）", () => {
  test("态 1：配置可用且路径存在 ⇒ 用 arch_paths", () => {
    const repo = archRepo("arch-ok", { archPaths: ["docs/adr"] })
    expect(archRoots(repo)).toEqual(["docs/adr"])
  })

  test("态 2：配置缺失 ⇒ 回退 docs/adr（存在才用）", () => {
    const repo = archRepo("arch-missing", { archPaths: null })
    expect(archRoots(repo)).toEqual(["docs/adr"])
  })

  test("态 2：配置 arch_paths 为空 ⇒ 回退 docs/adr", () => {
    const repo = archRepo("arch-empty", { archPaths: [] })
    expect(archRoots(repo)).toEqual(["docs/adr"])
  })

  test("态 2：配置损坏 ⇒ 回退 docs/adr（不抛）", () => {
    const repo = archRepo("arch-corrupt", { corrupt: true })
    expect(archRoots(repo)).toEqual(["docs/adr"])
  })

  test("态 3：配置路径全部失效 ⇒ 回退 docs/adr", () => {
    const repo = archRepo("arch-stale", { archPaths: ["docs/gone"] })
    expect(archRoots(repo)).toEqual(["docs/adr"])
  })

  test("态 3：连 docs/adr 都没有 ⇒ 空集（architect 派发须被拒）", () => {
    const repo = gitRepo("arch-none")
    expect(archRoots(repo)).toEqual([])
    expect(() => assertRoleClassCompatible({ role_class: "architect", scope: ["docs/adr/x.md"] }, repo)).toThrow(
      /没有可写的架构文档目录/,
    )
  })
})

describe("class × scope 相容性（D8 ②层）", () => {
  test("architect：scope 必须落在类上限内（docs/adr / .rddf/reviews / arch-docs.json）", () => {
    const repo = archRepo("arch-scope", { archPaths: ["docs/adr"] })
    expect(() => assertRoleClassCompatible({ role_class: "architect", scope: ["src/**"] }, repo)).toThrow(/越界/)
    expect(() => assertRoleClassCompatible({ role_class: "architect", scope: ["docs/adr/x.md"] }, repo)).not.toThrow()
    expect(() =>
      assertRoleClassCompatible({ role_class: "architect", scope: [".rddf/reviews/x.md"] }, repo),
    ).not.toThrow()
    expect(() =>
      assertRoleClassCompatible({ role_class: "architect", scope: [".rddf/config/arch-docs.json"] }, repo),
    ).not.toThrow()
  })

  test("architect：scope 覆盖整个工程 ⇒ 拒", () => {
    const repo = archRepo("arch-dot", { archPaths: ["docs/adr"] })
    expect(() => assertRoleClassCompatible({ role_class: "architect", scope: ["."] }, repo)).toThrow(/整个工程/)
  })

  test("verifier：scope 只能落在 .rddf/reviews", () => {
    const repo = archRepo("verifier-scope", { archPaths: ["docs/adr"] })
    expect(() => assertRoleClassCompatible({ role_class: "verifier", scope: ["src/a.ts"] }, repo)).toThrow(/越界/)
    expect(() => assertRoleClassCompatible({ role_class: "verifier", scope: [".rddf/reviews"] }, repo)).not.toThrow()
  })

  test("builder：非 arch 路径的 scope 照常放行", () => {
    const repo = archRepo("builder-scope", { archPaths: ["docs/adr"] })
    expect(() => assertRoleClassCompatible({ role_class: "builder", scope: ["src/**"] }, repo)).not.toThrow()
  })

  test("scope 三种写法判定一致（归一化单一实现）", () => {
    const repo = archRepo("scope-forms", { archPaths: ["docs/adr"] })
    expect(() => assertRoleClassCompatible({ role_class: "architect", scope: ["docs/adr/x.md"] }, repo)).not.toThrow()
    expect(() => assertRoleClassCompatible({ role_class: "architect", scope: ["src/../docs/adr/x.md"] }, repo)).not.toThrow()
    expect(() =>
      assertRoleClassCompatible(
        { role_class: "architect", scope: [path.join(repo, "docs/adr/x.md")] },
        repo,
      ),
    ).not.toThrow()
    // 三种写法对**越界**项的判定也一致
    expect(() => assertRoleClassCompatible({ role_class: "architect", scope: ["src/a.ts"] }, repo)).toThrow(/越界/)
    expect(() => assertRoleClassCompatible({ role_class: "architect", scope: ["src/../src/a.ts"] }, repo)).toThrow(/越界/)
    expect(() =>
      assertRoleClassCompatible({ role_class: "architect", scope: [path.join(repo, "src/a.ts")] }, repo),
    ).toThrow(/越界/)
  })

  test("symlink 指向 scope 外 ⇒ 拒（语义越界，不只语法归一化）", () => {
    const repo = archRepo("arch-symlink", { archPaths: ["docs/adr"] })
    symlinkSync(path.join(repo, "src"), path.join(repo, "docs", "adr", "link"), "dir")
    expect(() => assertRoleClassCompatible({ role_class: "architect", scope: ["docs/adr/link"] }, repo)).toThrow(
      /越界/,
    )
  })
})

describe("权限组装：edit 与 subagent 净效果（D3 / D4）", () => {
  test("verifier：.rddf/reviews 可写、src 不可写", () => {
    const repo = archRepo("perm-verifier", { archPaths: ["docs/adr"] })
    const perms = classPermissions({
      roleClass: "verifier",
      workRoot: repo,
      scope: [".rddf/reviews"],
      kind: "engineering",
      grants: [],
    })
    expect(evaluateEffect(perms, "edit", ".rddf/reviews/x.md")).toBe("allow")
    expect(evaluateEffect(perms, "edit", "src/a.ts")).toBe("deny")
  })

  test("三类 subagent 白名单一致：只读 agent allow；general / context-builder / build deny", () => {
    const repo = archRepo("perm-subagent", { archPaths: ["docs/adr"] })
    for (const rc of ["builder", "architect", "verifier"] as const) {
      const perms = classPermissions({
        roleClass: rc,
        workRoot: repo,
        scope: ["docs"],
        kind: "engineering",
        grants: [],
      })
      for (const agent of ["explore", "librarian", "oracle", "metis", "critic"]) {
        expect(evaluateEffect(perms, "subagent", agent)).toBe("allow")
      }
      for (const agent of ["general", "context-builder", "build"]) {
        expect(evaluateEffect(perms, "subagent", agent)).toBe("deny")
      }
    }
  })

  test("知识 session 不获得 subagent 白名单（只读语义不被顺带放开）", () => {
    const repo = archRepo("perm-knowledge", { archPaths: ["docs/adr"] })
    const perms = classPermissions({
      roleClass: "builder",
      workRoot: repo,
      scope: [],
      kind: "knowledge",
      grants: [],
    })
    expect(perms.some((r) => r.action === "subagent" && r.effect === "allow")).toBe(false)
  })

  test("subagent 规则顺序：deny 在前、allow 在后（findLast 语义）", () => {
    const rules = classSubagentRules()
    expect(rules[0]).toEqual({ action: "subagent", resource: "*", effect: "deny" })
    expect(rules[1].effect).toBe("allow")
  })

  test("classAllowRoots：builder 无上限 / verifier 只 reviews / architect 三元并集", () => {
    const repo = archRepo("allow-roots", { archPaths: ["docs/adr"] })
    expect(classAllowRoots("builder", repo)).toEqual([])
    expect(classAllowRoots("verifier", repo)).toEqual([".rddf/reviews"])
    expect(classAllowRoots("architect", repo)).toEqual([
      "docs/adr",
      ".rddf/reviews",
      ".rddf/config/arch-docs.json",
    ])
  })
})

describe("简报：运行身份与按 class 分支的执行要求（D5）", () => {
  test("builder：含运行身份段 + acceptance 自验 + HANDOFF 契约", () => {
    const text = buildBrief(validateBrief({ ...VALID_INPUT }), TMP)
    expect(text).toContain("## 运行身份")
    expect(text).toContain("role_class = builder")
    expect(text).toContain("按 acceptance 自行验证")
    expect(text).toContain("HANDOFF")
    expect(text).toContain("省略角色开场报告")
    // 不含别类的专属句
    expect(text).not.toContain("只出证据与判决")
    expect(text).not.toContain("按 ADR 完成标志自查")
  })

  test("architect：含 ADR 完成标志自查，不含 builder / verifier 专属句", () => {
    const text = buildBrief(validateBrief({ ...VALID_INPUT, role_class: "architect" }), TMP)
    expect(text).toContain("role_class = architect")
    expect(text).toContain("按 ADR 完成标志自查")
    expect(text).not.toContain("按 acceptance 自行验证")
    expect(text).not.toContain("只出证据与判决")
  })

  test("verifier：含只出证据句，不含 builder / architect 专属句", () => {
    const text = buildBrief(validateBrief({ ...VALID_INPUT, role_class: "verifier" }), TMP)
    expect(text).toContain("role_class = verifier")
    expect(text).toContain("只出证据与判决")
    expect(text).not.toContain("按 acceptance 自行验证")
    expect(text).not.toContain("按 ADR 完成标志自查")
  })

  test("知识 session：不含运行身份段", () => {
    const text = buildBrief(validateBrief({ ...VALID_INPUT, agent: "explore", scope: [] }), TMP)
    expect(text).not.toContain("## 运行身份")
  })
})

describe("resume 的 class 一致性（D6）", () => {
  test("登记值与请求不一致 ⇒ 硬拒", () => {
    expect(() => assertResumeRoleClass({ role_class: "architect" }, "verifier", "ses_x")).toThrow(/不匹配/)
  })

  test("存量条目（无登记值）+ builder ⇒ 按 builder 解释（不抛）", () => {
    expect(assertResumeRoleClass({}, "builder", "ses_x")).toBe("builder")
  })

  test("存量条目 + architect ⇒ 拒（不能凭声明换类）", () => {
    expect(() => assertResumeRoleClass({}, "architect", "ses_x")).toThrow(/存量/)
  })

  test("登记值非法 ⇒ 拒", () => {
    expect(() => assertResumeRoleClass({ role_class: "nope" }, "builder", "ses_x")).toThrow(/非法/)
  })
})

describe("登记：role.json 分区与 pair 持久化（D2 / D6）", () => {
  test("role.json 出现独立 role_class，current_role 仍 builder；pair 同步落盘", () => {
    const repo = gitRepo("role-partition")
    registerSession(
      repo,
      "ses_a",
      "ses_front",
      "build",
      "engineering",
      undefined,
      { role_class: "architect" },
      undefined,
      { work_root: repo, state: "active" },
    )
    const role = readJson(path.join(repo, ".rddf/state/role.json"))
    expect(role.sessions["ses_a"].role_class).toBe("architect")
    expect(role.sessions["ses_a"].current_role).toBe("builder")
    const pair = readJson(path.join(repo, ".rddf/state/pair.json"))
    expect(pair.pairs["ses_a"].role_class).toBe("architect")
  })

  test("未传 role_class ⇒ 存量条目不写该字段（resume 时按缺省解释）", () => {
    const repo = gitRepo("role-legacy")
    registerSession(repo, "ses_b", "ses_front", "build", "engineering")
    const pair = readJson(path.join(repo, ".rddf/state/pair.json"))
    expect(pair.pairs["ses_b"].role_class).toBeUndefined()
    const role = readJson(path.join(repo, ".rddf/state/role.json"))
    expect(role.sessions["ses_b"].role_class).toBe("builder")
  })
})

describe("AC23：未新增 SlotState / outcome 值", () => {
  test("SlotState 枚举保持五个值", () => {
    expect([...SLOT_STATES]).toEqual(["dispatching", "active", "idle", "suspended", "tombstone"])
  })
})


// ───────── D3 修订：builder 上限 = scope − archRoots（两级规则，AC24–AC31） ─────────

describe("AC24：builder 的窄目标 ⇒ 派发被拒", () => {
  let seq = 0
  const case1 = (label: string, scope: string[]) =>
    test(label, () => {
      const repo = archRepo(`b-narrow-${++seq}`, { archPaths: ["docs/adr"] })
      expect(() => assertRoleClassCompatible({ role_class: "builder", scope }, repo)).toThrow(/架构文档目录内/)
    })

  case1("scope = docs/adr（目录本身）", ["docs/adr"])
  case1("scope = docs/adr/x.md（子树）", ["docs/adr/x.md"])
  case1("scope = docs/adr/../adr（穿越）", ["docs/adr/../adr"])
  case1("scope = ./docs/adr/（点斜杠 + 尾斜杠）", ["./docs/adr/"])
  case1("混合 scope（任一命中即拒）", ["src", "docs/adr"])
  test("绝对路径形式同样拒", () => {
    const repo = archRepo("b-narrow-abs", { archPaths: ["docs/adr"] })
    expect(() =>
      assertRoleClassCompatible({ role_class: "builder", scope: [path.join(repo, "docs/adr")] }, repo),
    ).toThrow(/架构文档目录内/)
  })
  test("错误信息指名 architect 类（可据此改派）", () => {
    const repo = archRepo("b-narrow-msg", { archPaths: ["docs/adr"] })
    try {
      assertRoleClassCompatible({ role_class: "builder", scope: ["docs/adr"] }, repo)
      throw new Error("应当抛错")
    } catch (e: any) {
      expect(String(e.message)).toContain("architect")
    }
  })
})

describe("AC25 / AC26：builder 的宽目标 ⇒ arch 路径被 deny（净效果）", () => {
  const perms = (repo: string, scope: string[]) =>
    classPermissions({ roleClass: "builder", workRoot: repo, scope, kind: "engineering", grants: [] })

  test("scope = ['.']：arch 路径 deny、scope 内其它路径 allow、兄弟目录 docs/adr2 allow", () => {
    const repo = archRepo("b-wide", { archPaths: ["docs/adr"] })
    const rules = perms(repo, ["."])
    expect(evaluateEffect(rules, "edit", "docs/adr/x.md")).toBe("deny")
    expect(evaluateEffect(rules, "edit", "docs/adr")).toBe("deny")
    expect(evaluateEffect(rules, "edit", "src/a.ts")).toBe("allow")
    expect(evaluateEffect(rules, "edit", "docs/adr2/x.md")).toBe("allow") // 负向：形态不得误伤兄弟目录
  })

  test("scope = ['docs']：同样吃到 arch deny", () => {
    const repo = archRepo("b-wide-docs", { archPaths: ["docs/adr"] })
    const rules = perms(repo, ["docs"])
    expect(evaluateEffect(rules, "edit", "docs/adr/x.md")).toBe("deny")
    expect(evaluateEffect(rules, "edit", "docs/other.md")).toBe("allow")
  })

  test("write / patch 与 edit 同一权限 action（一条 deny 覆盖全部写工具）", () => {
    const repo = archRepo("b-wide-action", { archPaths: ["docs/adr"] })
    const rules = perms(repo, ["."])
    const denies = rules.filter((r) => r.effect === "deny" && r.resource === "docs/adr")
    // 上游 `write.ts` / `patch.ts` 的 permission action 均为 "edit" ⇒ 不需要单独的 write/patch 规则
    expect(denies.every((r) => r.action === "edit")).toBe(true)
    expect(rules.some((r) => r.action === "write" || r.action === "patch")).toBe(false)
  })

  test("grants 无法抵消（edit 不可 grant）", () => {
    expect(() => validateGrants([{ action: "edit", resource: "docs/adr/*" }])).toThrow(/永不可 grant/)
  })

  test("arch deny **恒在数组末尾**（其后追加 allow 会经 findLast 翻盘）", () => {
    const repo = archRepo("b-wide-tail", { archPaths: ["docs/adr"] })
    const rules = perms(repo, ["."])
    const last = rules[rules.length - 1]
    expect(last.action).toBe("edit")
    expect(last.effect).toBe("deny")
  })

  test("知识 session 不追加 arch deny（只读语义无 class）", () => {
    const repo = archRepo("b-knowledge", { archPaths: ["docs/adr"] })
    const rules = classPermissions({ roleClass: "builder", workRoot: repo, scope: [], kind: "knowledge", grants: [] })
    expect(rules.some((r) => r.resource === "docs/adr")).toBe(false)
  })
})

describe("AC27：symlink 两方向", () => {
  test("(a) arch root 自身是软链 → src：scope 指向该目标 ⇒ 拒", () => {
    const repo = gitRepo("b-sym-arch")
    mkdirSync(path.join(repo, "src"), { recursive: true })
    mkdirSync(path.join(repo, "docs"), { recursive: true })
    symlinkSync(path.join(repo, "src"), path.join(repo, "docs", "adr"), "dir")
    mkdirSync(path.join(repo, ".rddf", "config"), { recursive: true })
    writeFileSync(
      path.join(repo, ".rddf", "config", "arch-docs.json"),
      JSON.stringify({ arch_paths: ["docs/adr"], exclude_paths: [] }),
    )
    expect(() => assertRoleClassCompatible({ role_class: "builder", scope: ["src"] }, repo)).toThrow(/架构文档目录内/)
  })

  test("(a) arch root 软链到工程根外 ⇒ 不构成类边界（不拒派发）", () => {
    const repo = gitRepo("b-sym-outside")
    const outside = path.join(TMP, "outside-arch")
    mkdirSync(outside, { recursive: true })
    mkdirSync(path.join(repo, "docs"), { recursive: true })
    symlinkSync(outside, path.join(repo, "docs", "adr"), "dir")
    mkdirSync(path.join(repo, ".rddf", "config"), { recursive: true })
    writeFileSync(
      path.join(repo, ".rddf", "config", "arch-docs.json"),
      JSON.stringify({ arch_paths: ["docs/adr"], exclude_paths: [] }),
    )
    expect(() => assertRoleClassCompatible({ role_class: "builder", scope: ["src"] }, repo)).not.toThrow()
  })

  test("(b) scope 项是软链、解析后落在 arch 树内 ⇒ 拒", () => {
    const repo = archRepo("b-sym-scope", { archPaths: ["docs/adr"] })
    mkdirSync(path.join(repo, "docs"), { recursive: true })
    symlinkSync(path.join(repo, "docs", "adr"), path.join(repo, "docs", "alias"), "dir")
    expect(() => assertRoleClassCompatible({ role_class: "builder", scope: ["docs/alias"] }, repo)).toThrow(
      /架构文档目录内/,
    )
  })

  test("目标文件尚不存在 ⇒ 按最近存在祖先解析（新文件写入仍能被判到 arch 树内）", () => {
    const repo = archRepo("b-sym-newfile", { archPaths: ["docs/adr"] })
    expect(realRelative(repo, "docs/adr/new-file.md")).toBe("docs/adr/new-file.md")
    expect(realRelative(repo, "docs/adr/a/b/c.md")).toBe("docs/adr/a/b/c.md")
  })

  test("悬空软链不抛异常（无法解析时按字面值处理）", () => {
    const repo = archRepo("b-sym-dangling", { archPaths: ["docs/adr"] })
    symlinkSync(path.join(repo, "docs", "adr", "not-yet"), path.join(repo, "docs", "dangling"), "dir")
    expect(realRelative(repo, "docs/dangling")).toBe("docs/dangling")
  })
})

describe("AC28：archRoots 为空 ⇒ 类边界不存在（减法退化）", () => {
  test("无架构目录：不拒派发、不追加 deny", () => {
    const repo = gitRepo("b-no-arch")
    expect(archRoots(repo)).toEqual([])
    expect(() => assertRoleClassCompatible({ role_class: "builder", scope: ["docs/adr"] }, repo)).not.toThrow()
    expect(archDenyRules(repo)).toEqual([])
    const rules = classPermissions({
      roleClass: "builder",
      workRoot: repo,
      scope: ["."],
      kind: "engineering",
      grants: [],
    })
    expect(evaluateEffect(rules, "edit", "docs/adr/x.md")).toBe("allow")
  })
})

describe("AC29：worktree 下与权限资源同根（workRoot）", () => {
  test("archRoots / archDenyRules 都按传入的 workRoot 解析", () => {
    const repo = gitRepo("b-wt-main")
    const wt = path.join(TMP, "b-wt-linked")
    execFileSync("git", ["worktree", "add", "-q", wt, "-b", "wt-branch"], { cwd: repo, stdio: "ignore" })
    mkdirSync(path.join(wt, "docs", "adr"), { recursive: true })
    expect(archRoots(wt)).toEqual(["docs/adr"])
    expect(archDenyRules(wt)).toEqual([
      { action: "edit", resource: "docs/adr", effect: "deny" },
      { action: "edit", resource: "docs/adr/*", effect: "deny" },
    ])
    // 主仓没有该目录 ⇒ 不构成边界（证明没有跨根串味）
    expect(archRoots(repo)).toEqual([])
  })
})

describe("AC31：builder 类简报回显不可写目录", () => {
  test("存在 arch 目录 ⇒ 运行身份段写明不可写", () => {
    const repo = archRepo("b-brief", { archPaths: ["docs/adr"] })
    const text = buildBrief(validateBrief({ ...VALID_INPUT, project_dir: repo }), repo)
    expect(text).toContain("架构文档目录（**不可写**，属 architect 类）: docs/adr")
  })

  test("architect / verifier 类不回显该行", () => {
    const repo = archRepo("b-brief-arch", { archPaths: ["docs/adr"] })
    const text = buildBrief(validateBrief({ ...VALID_INPUT, project_dir: repo, role_class: "architect" }), repo)
    expect(text).not.toContain("不可写**，属 architect 类")
  })
})

describe("fallback 目录集与路径判定工具", () => {
  test("ARCH_FALLBACK_DIRS 是闭合清单（顺序固定）", () => {
    expect([...ARCH_FALLBACK_DIRS]).toEqual([
      "docs/adr",
      "docs/architecture",
      "docs/architecture/adr",
      "docs/designs",
      "docs/design",
      "adr",
      "rfc",
      "specs",
    ])
  })

  test("fallback 取实际存在的那些（docs/architecture 也算）", () => {
    const repo = gitRepo("fb-multi")
    mkdirSync(path.join(repo, "docs", "architecture"), { recursive: true })
    mkdirSync(path.join(repo, "specs"), { recursive: true })
    expect(archRoots(repo)).toEqual(["docs/architecture", "specs"])
  })

  test("isPathWithin 按路径段判边界（docs/adr2 不在 docs/adr 内）", () => {
    expect(isPathWithin("docs/adr/x.md", "docs/adr")).toBe(true)
    expect(isPathWithin("docs/adr", "docs/adr")).toBe(true)
    expect(isPathWithin("docs/adr2/x.md", "docs/adr")).toBe(false)
    expect(isPathWithin("docs", "docs/adr")).toBe(false)
  })
})

afterAll(() => {
  try {
    rmSync(TMP, { recursive: true, force: true })
  } catch {
    /* 清理失败不影响测试结论 */
  }
})
