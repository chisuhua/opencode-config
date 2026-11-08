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
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs"
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
  buildBrief,
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
  validateBrief,
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
  test("git 仓库 → canonical root + vcs=true", () => {
    const repo = gitRepo("repo-a")
    const r = canonicalRoot(repo)
    expect(r.vcs).toBe(true)
    expect(path.resolve(r.root)).toBe(path.resolve(repo))
  })

  test("非 git 目录 → 绝对路径 + vcs=false", () => {
    const plain = path.join(TMP, "plain")
    mkdirSync(plain, { recursive: true })
    const r = canonicalRoot(plain)
    expect(r.vcs).toBe(false)
    expect(path.resolve(r.root)).toBe(path.resolve(plain))
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

afterAll(() => {
  try {
    rmSync(TMP, { recursive: true, force: true })
  } catch {
    /* 清理失败不影响测试结论 */
  }
})
