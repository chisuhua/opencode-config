/**
 * role-switch CLI —— 角色切换的唯一入口（**薄**：只解析参数 + 调 `lib/role-lease.ts`）
 *
 * ⚠ 语义全在 `lib/role-lease.ts`（单源）；本文件**不持锁、不写文件**。
 */
import { canonicalRoot } from "../lib/delegate-core.ts"
import { claimsPath, clearWindow, grantWindow, resetClaims, roleFilePath, switchRole } from "../lib/role-lease.ts"
import { ROLES, type Role } from "../lib/role-identity.ts"

const argv = process.argv.slice(2)
const opts: { stateRoot?: string; session?: string; by?: "user" | "auto" } = {}
const positional: string[] = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--state-root") opts.stateRoot = argv[++i]
  else if (a === "--session") opts.session = argv[++i]
  else if (a === "--by") opts.by = argv[++i] as "user" | "auto"
  else positional.push(a)
}

// ⚠ 默认根 = **canonical stateRoot**（与读侧 `lib/role-identity.ts` / `plugins/role-gate.ts` 同源）。
//   旧口径用 cwd ⇒ 仓库子目录 / linked worktree / submodule 三种情形下**写读不同根**
//   ⇒ 切换「成功」但角色不变 ⇒ 身份跌 general（ADR-role-session-identity D1 要杀掉的失败模式）。
const roots = canonicalRoot(process.cwd())
const stateRoot = opts.stateRoot ?? roots.stateRoot
const workRoot = roots.workRoot
const sessionID = opts.session ?? process.env.OPENCODE_SESSION_ID
if (!sessionID) {
  console.error("role-switch: 缺少会话 id（$OPENCODE_SESSION_ID 未设置且未传 --session）")
  process.exit(2)
}

const fail = (msg: string): never => {
  console.error(`role-switch: ${msg}`)
  process.exit(1)
}

try {
  const [mode, ...rest] = positional
  if (!mode) fail("缺少子命令（<role> | --exit | --grant-window | --close-window | --reset-claims）")
  if (mode === "--exit") {
    clearWindow({ stateRoot, workRoot, sessionID, toNoRole: true, warnSink: (m: string) => console.error(m) })
    console.log("ok: 已切到 no-role 并清空授权窗口")
  } else if (mode === "--close-window") {
    clearWindow({ stateRoot, sessionID })
    console.log("ok: 授权窗口已关闭")
  } else if (mode === "--grant-window") {
    const [csv, max] = rest
    const roles = (csv ?? "").split(",").map((x) => x.trim()).filter(Boolean) as Role[]
    for (const r of roles) if (!(ROLES as readonly string[]).includes(r)) fail(`非法角色: ${r}`)
    grantWindow({ stateRoot, sessionID, roles, maxRounds: Number(max) })
    console.log(`ok: 已授予窗口 roles=[${roles.join(",")}] max=${max}`)
  } else if (mode === "--reset-claims") {
    // 损坏恢复入口（**显式用户动作** ⇒ gen 重置；ledger 留痕）
    const res = resetClaims({ stateRoot, sessionID })
    if (!res.ok) fail(res.reason ?? "重置失败")
    console.log(`ok: 已重置 ${claimsPath(stateRoot)}（ledger 已留痕；claim_gen 重新计数）`)
  } else {
    if (!(ROLES as readonly string[]).includes(mode)) fail(`非法角色: ${mode}（允许：${ROLES.join(" / ")}）`)
    switchRole({
      stateRoot,
      workRoot,
      sessionID,
      role: mode as Role,
      by: opts.by ?? "user",
      warnSink: (m: string) => console.error(m),
    })
    console.log(`ok: ${sessionID} → ${mode}（by=${opts.by ?? "user"}）；文件 ${roleFilePath(stateRoot)}`)
  }
} catch (e: any) {
  fail(String(e?.message ?? e))
}
