/**
 * role-lease —— 角色切换的写盘语义（身份 ADR D2；proposal AC4 / AC5 / AC8）
 *
 * 层级：**层 1b 纯逻辑单测**（`design.md` D9.1）。
 * fixture：每个用例独立父目录；真实 7 分区形状（`legacy` 保持无毫秒）。
 */
import { describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import path from "node:path"

import { clearWindow, grantWindow, roleFilePath, roleLockDir, switchRole } from "../lib/role-lease.ts"

const SID = "ses_aaaaaaaaaaaaaaaaaaaaaaaa"
const OTHER = "ses_bbbbbbbbbbbbbbbbbbbbbbbb"

function makeState(overrides: Record<string, any> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "rl-"))
  const dir = path.join(root, ".rddf", "state")
  mkdirSync(dir, { recursive: true })
  const role = {
    current_role: "architect",
    updated_at: "2026-11-17T00:00:00.000Z",
    updated_by: "user",
    session_id: SID,
    auto_switch_window: null,
    history: [{ role: "architect", at: "2026-11-17T00:00:00.000Z", by: "user", reason: "x" }],
    schema_version: "role-v2",
    sessions: {
      legacy: { current_role: "builder", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-05T16:01:58Z" },
      [SID]: { current_role: "architect", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:00.000Z" },
      [OTHER]: { current_role: "verifier", auto_switch_window: null, auto_answer: null, updated_at: "2026-11-17T00:00:02.000Z", role_class: "verifier" },
    },
    ...overrides,
  }
  writeFileSync(path.join(dir, "role.json"), JSON.stringify(role, null, 2) + "\n")
  return { root, dir, before: role }
}

describe("AC4 读-改-写：其余分区与 legacy 原样保留 + history 追加", () => {
  test("切换 SID → builder：其它分区 deep-equal、legacy 未变、history 追加、顶层镜像更新", () => {
    const { root, before } = makeState()
    const written = switchRole({ stateRoot: root, sessionID: SID, role: "builder", by: "user" })

    // 本分区已更新
    expect(written.sessions[SID].current_role).toBe("builder")
    // 顶层镜像更新（= 最近一次切换）
    expect(written.current_role).toBe("builder")
    expect(written.session_id).toBe(SID)
    // 其它分区 **deep-equal**（含 role_class 等未知字段）
    expect(written.sessions[OTHER]).toEqual(before.sessions[OTHER])
    expect(written.sessions.legacy).toEqual(before.sessions.legacy)
    // legacy 的时间戳保持**无毫秒**（任何规范化重写都会改它）
    expect(written.sessions.legacy.updated_at).toBe("2026-11-05T16:01:58Z")
    // history 追加（不替换）
    expect(written.history).toHaveLength(before.history.length + 1)
    expect(written.history.at(-1).role).toBe("builder")
    // 未知的顶层键保留
    expect(written.schema_version).toBe("role-v2")
  })

  test("history 上限 20：写入后不超过 20 条", () => {
    const { root } = makeState({
      history: Array.from({ length: 25 }, (_, i) => ({ role: "builder", at: `2026-11-17T00:00:${String(i).padStart(2, "0")}.000Z`, by: "user" })),
    })
    const w = switchRole({ stateRoot: root, sessionID: SID, role: "verifier", by: "user" })
    expect(w.history).toHaveLength(20)
    expect(w.history.at(-1).role).toBe("verifier")
  })
})

describe("AC8 --by auto：updated_by 与 history.by 同步", () => {
  test("by=auto ⇒ 顶层 updated_by=auto 且 history 末条 by=auto", () => {
    const { root } = makeState()
    // ⚠ auto 切换必须有授权窗口（AC8 的窗口语义）⇒ 先授予
    grantWindow({ stateRoot: root, sessionID: SID, roles: ["planner"], maxRounds: 2 })
    const w = switchRole({ stateRoot: root, sessionID: SID, role: "planner", by: "auto" })
    expect(w.updated_by).toBe("auto")
    expect(w.history.at(-1).by).toBe("auto")
  })
})

describe("AC5 原子性：失败 ⇒ 原文件逐字节不变 + 无 .tmp-* 残留", () => {
  test("目录不可写（注入失败）⇒ 抛错、原文逐字节不变、无 tmp", () => {
    const { root, dir } = makeState()
    const file = roleFilePath(root)
    const beforeBytes = readFileSync(file)

    chmodSync(dir, 0o500)
    try {
      expect(() => switchRole({ stateRoot: root, sessionID: SID, role: "builder", by: "user" })).toThrow()
    } finally {
      chmodSync(dir, 0o700)
    }

    expect(readFileSync(file).equals(beforeBytes)).toBe(true)
    expect(readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([])
  })

  test("目标被占成目录（rename 必失败）⇒ 抛错 + **清理 tmp**", () => {
    const { root, dir } = makeState()
    const file = roleFilePath(root)
    // 把 role.json 换成同名目录 ⇒ rename 必失败（此时 tmp 已写成功）
    require("node:fs").rmSync(file, { force: true })
    mkdirSync(file, { recursive: true })

    expect(() => switchRole({ stateRoot: root, sessionID: SID, role: "builder", by: "user" })).toThrow()
    expect(existsSync(file)).toBe(true)
    expect(readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([])
  })
})

describe("锁：switchRole 用 .role.lock 且锁会释放", () => {
  test("切换后 .role.lock 不残留；role.json 可解析", () => {
    const { root } = makeState()
    switchRole({ stateRoot: root, sessionID: SID, role: "builder", by: "user" })
    expect(existsSync(roleLockDir(root))).toBe(false)
    expect(() => JSON.parse(readFileSync(roleFilePath(root), "utf8"))).not.toThrow()
  })
})

describe("AC8 授权窗口（层 1b）：授予 / 计数 / 超额 / 角色白名单 / 退出清空", () => {
  test("grantWindow ⇒ used=0；两次 auto ⇒ used=2；第三次 auto 被拒", () => {
    const { root } = makeState()
    grantWindow({ stateRoot: root, sessionID: SID, roles: ["architect", "verifier"], maxRounds: 2 })
    let w = switchRole({ stateRoot: root, sessionID: SID, role: "architect", by: "auto" })
    expect(w.sessions[SID].auto_switch_window.used).toBe(1)
    w = switchRole({ stateRoot: root, sessionID: SID, role: "verifier", by: "auto" })
    expect(w.sessions[SID].auto_switch_window.used).toBe(2)
    expect(() => switchRole({ stateRoot: root, sessionID: SID, role: "architect", by: "auto" })).toThrow(/用完/)
  })

  test("auto 切到窗口外的角色 ⇒ 被拒", () => {
    const { root } = makeState()
    grantWindow({ stateRoot: root, sessionID: SID, roles: ["verifier"], maxRounds: 3 })
    expect(() => switchRole({ stateRoot: root, sessionID: SID, role: "architect", by: "auto" })).toThrow(/不在窗口/)
  })

  test("没有窗口时 auto 切换 ⇒ 被拒（不得静默降级为 user）", () => {
    const { root } = makeState()
    expect(() => switchRole({ stateRoot: root, sessionID: SID, role: "architect", by: "auto" })).toThrow(/没有授权窗口/)
  })

  test("--exit ⇒ 角色 no-role 且窗口清空；--close-window ⇒ 窗口清空但角色不变", () => {
    const { root } = makeState()
    grantWindow({ stateRoot: root, sessionID: SID, roles: ["verifier"], maxRounds: 1 })
    const exited = clearWindow({ stateRoot: root, sessionID: SID, toNoRole: true })
    expect(exited.sessions[SID].current_role).toBe("no-role")
    expect(exited.sessions[SID].auto_switch_window).toBe(null)

    grantWindow({ stateRoot: root, sessionID: SID, roles: ["verifier"], maxRounds: 1 })
    const closed = clearWindow({ stateRoot: root, sessionID: SID })
    expect(closed.sessions[SID].auto_switch_window).toBe(null)
    expect(closed.sessions[SID].current_role).toBe("no-role") // 不变
  })
})

describe("脚本默认根 = canonicalRoot（写读同源）", () => {
  test("在**仓库子目录**里跑不带 --state-root ⇒ 写到**仓根**，不写子目录", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "rl-repo-"))
    execFileSync("git", ["init", "-q"], { cwd: repo })
    const sub = path.join(repo, "sub")
    mkdirSync(sub, { recursive: true })

    execFileSync("bash", [path.join(import.meta.dir, "..", "scripts", "role-switch.sh"), "builder"], {
      cwd: sub,
      env: { ...process.env, OPENCODE_SESSION_ID: SID },
      stdio: "pipe",
    })

    expect(existsSync(path.join(repo, ".rddf", "state", "role.json")), "应写到仓根").toBe(true)
    expect(existsSync(path.join(sub, ".rddf", "state", "role.json")), "不得写到子目录（旧 cwd 口径的失败模式）").toBe(false)
  })
})
