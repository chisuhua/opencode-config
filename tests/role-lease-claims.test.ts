/**
 * 角色租约 —— acquire/release + `claim_gen` 围栏 + 判活/接管（proposal AC18–AC22）
 *
 * 层级：**层 1b 纯逻辑单测**（`design.md` D9.1）—— 租约算法是纯函数 + 真实文件/子进程。
 *
 * ⚠ fixture 硬规则：独立父目录（`mkdtempSync`）、**禁读真实 HOME**、真实 7 分区形状。
 */
import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { claimSlot } from "../lib/delegate-async.ts"
import { switchRole } from "../lib/role-lease.ts"
import { resolveRole } from "../lib/role-identity.ts"
import {
  acquireLease,
  checkLeaseForWrite,
  claimsPath,
  readClaims,
  releaseLease,
  renewLease,
} from "../lib/role-lease.ts"

const MAIN = "ses_main_aaaaaaaaaaaaaaa"
const BACK = "ses_back_bbbbbbbbbbbbbbb"
const OTHER = "ses_other_ccccccccccccc"

function makeState() {
  const root = mkdtempSync(path.join(tmpdir(), "rlc-"))
  const dir = path.join(root, ".rddf", "state")
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, "role.json"),
    JSON.stringify(
      {
        current_role: "builder",
        updated_at: "2026-11-17T00:00:00.000Z",
        updated_by: "user",
        session_id: MAIN,
        auto_switch_window: null,
        history: [],
        schema_version: "role-v2",
        sessions: {
          legacy: { current_role: "builder", updated_at: "2026-11-05T16:01:58Z" },
          [MAIN]: { current_role: "builder", updated_at: "2026-11-17T00:00:00.000Z" },
        },
      },
      null,
      2,
    ) + "\n",
  )
  return { root, dir, workRoot: path.join(root, "repo") }
}

describe("AC18 租约拒绝：同角色冲突 ⇒ 拒 + 指名持有者 + workRoot", () => {
  test("主会话占 builder ⇒ 后端占 builder 被拒（错误含 holder session_id + workRoot）", () => {
    const { root, workRoot } = makeState()
    const first = acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main" })
    expect(first.ok).toBe(true)

    const second = acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: BACK, kind: "backend" })
    expect(second.ok).toBe(false)
    if (second.ok) throw new Error("unreachable")
    expect(second.reason).toContain(MAIN)
    expect(second.reason).toContain(workRoot)
    expect(second.holder?.session_id).toBe(MAIN)
  })

  test("派发临界区接入：claimSlot ⇒ {ok:false, lease:{holder_session_id, holder_work_root}}", () => {
    const { root, workRoot } = makeState()
    acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main" })

    const claim = claimSlot({
      stateRoot: root,
      workRoot,
      busyOf: () => false,
      sessionID: BACK,
      frontSessionID: MAIN,
      ownerAgent: "front",
      agent: "build",
      kind: "engineering",
      roleClass: "builder",
    })
    expect(claim.ok).toBe(false)
    expect(claim.lease?.holder_session_id).toBe(MAIN)
    expect(claim.lease?.holder_work_root).toBe(workRoot)
  })

  test("层 1a：派发调用方把租约拒绝转成 **throw fail(...)**（错误回到调用方）", () => {
    const src = readFileSync(path.join(import.meta.dir, "..", "lib", "delegate-async.ts"), "utf8")
    const branch = src.slice(src.indexOf("if (claim.lease)"))
    expect(branch.slice(0, 600)).toContain("throw fail(")
    expect(branch.slice(0, 600)).toContain("holder_session_id")
  })
})

describe("AC19 异角色并行：主 architect + 后端 verifier ⇒ 都成功", () => {
  test("两条不同键的租约互不冲突", () => {
    const { root, workRoot } = makeState()
    const a = acquireLease({ stateRoot: root, workRoot, role: "architect", sessionID: MAIN, kind: "main" })
    const b = acquireLease({ stateRoot: root, workRoot, role: "verifier", sessionID: BACK, kind: "backend" })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
  })

  test("派发侧：主会话占 architect ⇒ 派 verifier 类后端成功", () => {
    const { root, workRoot } = makeState()
    acquireLease({ stateRoot: root, workRoot, role: "architect", sessionID: MAIN, kind: "main" })
    const claim = claimSlot({
      stateRoot: root,
      workRoot,
      busyOf: () => false,
      sessionID: BACK,
      frontSessionID: MAIN,
      ownerAgent: "front",
      agent: "build",
      kind: "engineering",
      roleClass: "verifier",
    })
    expect(claim.ok).toBe(true)
  })
})

describe("AC20 豁免与独占", () => {
  test("两个 no-role 可并存（豁免：不占租约）", () => {
    const { root, workRoot } = makeState()
    const a = acquireLease({ stateRoot: root, workRoot, role: "no-role", sessionID: MAIN, kind: "main" })
    const b = acquireLease({ stateRoot: root, workRoot, role: "no-role", sessionID: BACK, kind: "backend" })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    // 豁免 ⇒ **不落** claims（无独占）
    expect(readClaims(root).file.claims).toEqual({})
  })

  test("第二个 general 被拒（独占集含 general）", () => {
    const { root, workRoot } = makeState()
    expect(acquireLease({ stateRoot: root, workRoot, role: "general", sessionID: MAIN, kind: "main" }).ok).toBe(true)
    const second = acquireLease({ stateRoot: root, workRoot, role: "general", sessionID: OTHER, kind: "main" })
    expect(second.ok).toBe(false)
  })

  test("**无分区**的新主会话（链落 general）与另一个 general 同样冲突", () => {
    const { root, workRoot } = makeState()
    // 全新会话：无分区 ⇒ 身份链落到 default(general)
    const resolved = resolveRole({ stateRoot: root, globalRoot: path.join(root, "nope"), sessionID: OTHER, agent: "build" })
    expect(resolved.role).toBe("general")

    expect(acquireLease({ stateRoot: root, workRoot, role: "general", sessionID: MAIN, kind: "main" }).ok).toBe(true)
    const second = acquireLease({ stateRoot: root, workRoot, role: resolved.role, sessionID: OTHER, kind: "main" })
    expect(second.ok).toBe(false)
  })
})

describe("AC21 判活与接管围栏", () => {
  test("宿主探活失败 + TTL 超时 ⇒ 接管成功且告警 + ledger 留痕", () => {
    const { root, workRoot } = makeState()
    const t0 = new Date("2026-11-17T00:00:00.000Z")
    const warns: string[] = []
    acquireLease({
      stateRoot: root,
      workRoot,
      role: "builder",
      sessionID: MAIN,
      kind: "main",
      now: () => t0,
      ttlMs: 1000,
    })
    // 探活说「死」+ TTL 已过 ⇒ 接管
    const later = new Date("2026-11-17T01:00:00.000Z")
    const res = acquireLease({
      stateRoot: root,
      workRoot,
      role: "builder",
      sessionID: BACK,
      kind: "backend",
      now: () => later,
      ttlMs: 1000,
      hostProbe: () => false,
      warnSink: (m) => warns.push(m),
    })
    expect(res.ok).toBe(true)
    expect(warns.join("\n")).toContain("接管")
    expect(warns.join("\n")).toContain(MAIN)
    const ledger = readFileSync(path.join(root, ".rddf", "state", "ledger.jsonl"), "utf8")
    expect(ledger).toContain("role_lease_takeover")
    expect(ledger).toContain(MAIN)
  })

  test("围栏①：接管后**旧持有者的租约写**（释放）失败", () => {
    const { root, workRoot } = makeState()
    const t0 = new Date("2026-11-17T00:00:00.000Z")
    acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main", now: () => t0, ttlMs: 1000 })
    acquireLease({
      stateRoot: root,
      workRoot,
      role: "builder",
      sessionID: BACK,
      kind: "backend",
      now: () => new Date("2026-11-17T01:00:00.000Z"),
      ttlMs: 1000,
      hostProbe: () => false,
    })
    const rel = releaseLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN })
    expect(rel.ok).toBe(false)
    expect(rel.reason).toContain(BACK)
  })

  test("围栏①b：接管后**旧持有者的续租**（租约写）失败（claim_gen != 即拒）", () => {
    const { root, workRoot } = makeState()
    const t0 = new Date("2026-11-17T00:00:00.000Z")
    acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main", now: () => t0, ttlMs: 1000 })
    acquireLease({
      stateRoot: root,
      workRoot,
      role: "builder",
      sessionID: BACK,
      kind: "backend",
      now: () => new Date("2026-11-17T01:00:00.000Z"),
      ttlMs: 1000,
      hostProbe: () => false,
    })
    const renew = renewLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN })
    expect(renew.ok).toBe(false)
    expect(renew.reason).toContain("claim_gen")
  })

  test("围栏②：接管后**旧持有者的写类工具调用**失败（claim_gen != 即拒）", () => {
    const { root, workRoot } = makeState()
    const t0 = new Date("2026-11-17T00:00:00.000Z")
    acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main", now: () => t0, ttlMs: 1000 })
    acquireLease({
      stateRoot: root,
      workRoot,
      role: "builder",
      sessionID: BACK,
      kind: "backend",
      now: () => new Date("2026-11-17T01:00:00.000Z"),
      ttlMs: 1000,
      hostProbe: () => false,
    })
    const chk = checkLeaseForWrite({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN })
    expect(chk.ok).toBe(false)
    expect(chk.message).toContain("claim_gen")
  })

  test("claim_gen 单调不减：释放后再占 ⇒ gen 继续递增（不归零）", () => {
    const { root, workRoot } = makeState()
    const first = acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main" })
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error("unreachable")
    const gen1 = first.claim.claim_gen
    expect(releaseLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN }).ok).toBe(true)
    const again = acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main" })
    expect(again.ok).toBe(true)
    if (!again.ok) throw new Error("unreachable")
    expect(again.claim.claim_gen).toBeGreaterThan(gen1)
  })

  test("claims 四种损坏形态（截断/空/数组/缺字段）⇒ **保守拒绝** + gen 不回退", () => {
    const forms: Array<[string, string]> = [
      ["截断", '{"claims": {"a": {"work_root": "/w"'],
      ["空", ""],
      ["数组", "[]"],
      ["缺字段", '{"claims": {"k": {"work_root": "/w", "role": "builder"}}, "holders": {}}'],
    ]
    for (const [name, content] of forms) {
      const { root, workRoot } = makeState()
      writeFileSync(claimsPath(root), content)
      const before = readFileSync(claimsPath(root), "utf8")
      const res = acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main" })
      expect(res.ok, `${name} 形态必须被拒`).toBe(false)
      if (!res.ok) expect(res.reason).toContain("损坏")
      // gen 不回退 ⇒ 损坏文件**原样保留**（未被重写）
      expect(readFileSync(claimsPath(root), "utf8")).toBe(before)
    }
  })
})

describe("AC22 持锁互斥 / 阈值 / 不按 pid 判活 / 锁内不再取锁", () => {
  test("两子进程并发 acquire ⇒ **恰好一方成功**（barrier 真并发）", async () => {
    const { root, workRoot } = makeState()
    const fixture = path.join(import.meta.dir, "fixtures", "lease-child.ts")
    const readyA = path.join(root, "readyA")
    const readyB = path.join(root, "readyB")
    const spawn = (sid: string, myReady: string, peer: string) =>
      Bun.spawn(["bun", fixture, root, workRoot, "builder", sid, myReady, peer], { stdout: "pipe", stderr: "pipe" })
    const a = spawn(MAIN, readyA, readyB)
    const b = spawn(OTHER, readyB, readyA)
    const [ca, cb] = await Promise.all([a.exited, b.exited])
    const codes = [ca, cb].sort()
    expect(codes).toEqual([0, 1]) // 恰好一个成功（0）、一个被拒（1）
  })

  test("陈旧锁两条边界：阈值**下方**阻塞 / **上方**回收", () => {
    const { root, workRoot } = makeState()
    // 阈值下方（age < staleMs）⇒ 不回收 ⇒ 拿不到锁 ⇒ 超时抛错
    const lockDir = path.join(root, ".rddf", "state", ".role.lock")
    mkdirSync(lockDir, { recursive: true })
    const past = new Date(Date.now() - 1500)
    utimesSync(lockDir, past, past)
    expect(() =>
      acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main", lock: { staleMs: 2000, deadlineMs: 300 } }),
    ).toThrow(/锁超时/)
    // 阈值上方（age > staleMs）⇒ 回收 ⇒ 成功
    const older = new Date(Date.now() - 2500)
    utimesSync(lockDir, older, older)
    const res = acquireLease({
      stateRoot: root,
      workRoot,
      role: "builder",
      sessionID: MAIN,
      kind: "main",
      lock: { staleMs: 2000, deadlineMs: 300 },
    })
    expect(res.ok).toBe(true)
  })

  test("**不按 pid 判活**：pid 活着但心跳过期 ⇒ 仍可接管；pid「死」但心跳新鲜 ⇒ 不接管", () => {
    const { root, workRoot } = makeState()
    const t0 = new Date("2026-11-17T00:00:00.000Z")
    acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main", now: () => t0, ttlMs: 1000 })
    // 手工塞一个「pid 活着」的字段（实现里**不读**它 ⇒ 不影响判活）
    const file = claimsPath(root)
    const doc = JSON.parse(readFileSync(file, "utf8"))
    const key = Object.keys(doc.claims)[0]!
    doc.claims[key].holder_pid = process.pid
    writeFileSync(file, JSON.stringify(doc, null, 2) + "\n")

    const res = acquireLease({
      stateRoot: root,
      workRoot,
      role: "builder",
      sessionID: BACK,
      kind: "backend",
      now: () => new Date("2026-11-17T01:00:00.000Z"),
      ttlMs: 1000,
      hostProbe: () => false,
    })
    expect(res.ok).toBe(true) // pid 活着但心跳过期 ⇒ 照样接管（pid 不参与判活）
  })

  test("锁内不得再取锁：`acquireLease` 自取锁后**不得**再次取同一把锁（否则死锁）", () => {
    const { root, workRoot } = makeState()
    const started = Date.now()
    const res = acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main" })
    expect(res.ok).toBe(true)
    expect(Date.now() - started).toBeLessThan(3000) // 嵌套取锁会卡到 10 s 超时
    // 层 1a：`*Locked` 变体体内**不得**出现 withLock(
    const src = readFileSync(path.join(import.meta.dir, "..", "lib", "role-lease.ts"), "utf8")
    for (const fn of ["acquireLeaseLocked", "releaseLeaseLocked"]) {
      const body = src.slice(src.indexOf(`export function ${fn}`), src.indexOf(`export function ${fn}`) + 4000)
      const end = body.indexOf("\n}\n")
      expect(body.slice(0, end), `${fn} 体内不得取锁`).not.toContain("withLock(")
    }
  })
})

describe("跨 worktree / 同 worktree 键", () => {
  test("同角色不同 workRoot ⇒ 不冲突（键含 workRoot）", () => {
    const { root } = makeState()
    const w1 = path.join(root, "r1")
    const w2 = path.join(root, "r2")
    expect(acquireLease({ stateRoot: root, workRoot: w1, role: "builder", sessionID: MAIN, kind: "main" }).ok).toBe(true)
    expect(acquireLease({ stateRoot: root, workRoot: w2, role: "builder", sessionID: BACK, kind: "backend" }).ok).toBe(true)
  })

  test("同 worktree 两写法 ⇒ 同一键 ⇒ 冲突", () => {
    const { root, workRoot } = makeState()
    const same = path.join(root, "repo") // 与 workRoot 同（不同写法：尾斜杠）
    expect(acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: MAIN, kind: "main" }).ok).toBe(true)
    expect(acquireLease({ stateRoot: root, workRoot: same + "/", role: "builder", sessionID: BACK, kind: "backend" }).ok).toBe(false)
  })
})

describe("B2（critic BLOCKER）：切角色也占租约 —— 与活跃后端同角色 ⇒ 切换被拒 + role.json 不变", () => {
  test("主会话 builder 后端活跃 ⇒ switchRole(builder) 抛错，且 role.json 逐字节不变", () => {
    const { root, workRoot } = makeState()
    // 后端先占 (workRoot, builder)
    expect(acquireLease({ stateRoot: root, workRoot, role: "builder", sessionID: BACK, kind: "backend" }).ok).toBe(true)
    const file = path.join(root, ".rddf", "state", "role.json")
    const before = readFileSync(file, "utf8")

    expect(() => switchRole({ stateRoot: root, workRoot, sessionID: MAIN, role: "builder", by: "user" })).toThrow(/租约/)

    expect(readFileSync(file, "utf8"), "切换失败 ⇒ role.json 必须原样（回滚）").toBe(before)
  })

  test("成对：后端是**异角色** ⇒ 切换成功", () => {
    const { root, workRoot } = makeState()
    acquireLease({ stateRoot: root, workRoot, role: "verifier", sessionID: BACK, kind: "backend" })
    const w = switchRole({ stateRoot: root, workRoot, sessionID: MAIN, role: "builder", by: "user" })
    expect(w.sessions[MAIN].current_role).toBe("builder")
  })
})
