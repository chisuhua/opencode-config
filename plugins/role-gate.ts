/**
 * role-gate —— **角色感知写门**的宿主接线（ADR-role-aware-permissions D2 / D3）
 *
 * 纯逻辑在 `../lib/role-policy.ts`（角色→写根的**单一真源**）+ `../lib/role-identity.ts`
 * （身份解析的**单一落点**）—— 本文件**只做接线**：取会话 → 取角色 → 判定 → 拒绝时抛错。
 *
 * 门控面（ADR D2）：`edit` / `write` 两个工具；`shell` 写盘**不在**门控内（D5① 免宣称）。
 *
 * ⚠ **执行点缺席**（D5⑥）：插件未激活 / `--standalone` / 改插件后未 `service restart` ⇒
 *   本门控**不生效**（D6 租约另有两个不随插件消失的执行点）。
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import { Plugin } from "@opencode/plugin"

import { canonicalRoot } from "../lib/delegate-core.ts"
import { readSessionPartition, resolveRole } from "../lib/role-identity.ts"
import { checkLeaseForWrite } from "../lib/role-lease.ts"
import { evaluateWrite, extractWriteTarget } from "../lib/role-policy.ts"

const WRITE_TOOLS = new Set(["edit", "write"])

/** 该会话是否在 `pair.json` 里登记过（派发面登记的权威标记；文件缺失/损坏 ⇒ false）。 */
function isRegisteredBackend(stateRoot: string, sessionID: string): boolean {
  try {
    const raw = readFileSync(path.join(stateRoot, ".rddf", "state", "pair.json"), "utf8")
    const doc = JSON.parse(raw) as { pairs?: Record<string, unknown> }
    return !!(doc?.pairs && typeof doc.pairs === "object" && sessionID in doc.pairs)
  } catch {
    return false
  }
}

export default Plugin.define({
  id: "role-gate",
  async setup(ctx) {
    await ctx.tool.hook("execute.before", async (event: any) => {
      const tool = event?.tool
      if (typeof tool !== "string" || !WRITE_TOOLS.has(tool)) return

      const input = event?.input ?? {}
      // ⚠ 宿主字段名是 `path`（层 2 e2e 实测）；取不到 ⇒ **fail-closed**
      //   （旧实现 `if (!filePath) return` = 静默放行 ⇒ 门控形同不存在）
      const filePath = extractWriteTarget(input)
      if (!filePath) {
        throw new Error(
          `role-gate: 无法从 ${tool} 的参数解析目标路径（工具契约变更？）⇒ 拒绝写类调用（fail-closed）`,
        )
      }

      // ⚠ 身份不可判定 ⇒ **fail-closed**（`design.md` D9.2 的 seam 契约），不得静默放行
      const sessionID = typeof event?.sessionID === "string" ? event.sessionID : ""
      if (!sessionID) {
        throw new Error("role-gate: 无 sessionID ⇒ 身份不可判定 ⇒ 拒绝写类调用（fail-closed）")
      }
      let session: any
      try {
        session = await ctx.session.get({ sessionID })
      } catch (e: any) {
        throw new Error(`role-gate: 取会话失败（${e?.message ?? e}）⇒ 身份不可判定 ⇒ 拒绝写类调用（fail-closed）`)
      }
      const agent = typeof session?.agent === "string" ? session.agent : ""
      if (!agent) {
        throw new Error("role-gate: 会话 agent 缺失 ⇒ 身份不可判定 ⇒ 拒绝写类调用（fail-closed）")
      }

      // 身份解析的**单一落点**（AC16）：门控与租约都从这里取角色
      // ⚠ **不用 `process.cwd()`**（critic BLOCKER B4）：一个插件进程只有一个 cwd，而同进程可能服务
      //   多个 location（多仓 / worktree）⇒ 用进程 cwd 会把 `repoRoot` 取成**另一个仓**的根，
      //   目标文件落进「④ 仓库外 ⇒ 不限制」分支 ⇒ 门控整条 **fail-open**。
      //   会话自己的目录在 `session.location.directory`（与 `lib/delegate-async.ts` 同源取法）。
      const loc = (session as any)?.location?.directory
      const cwd = typeof loc === "string" && loc.length > 0 ? loc : process.cwd()
      const { stateRoot, workRoot } = canonicalRoot(cwd)
      const resolved = resolveRole({
        stateRoot,
        // ⚠ `globalRoot` 是**仓根**语义（`resolveRole` 内部拼 `.rddf/state/role.json`）
        //   ⇒ 传 `~/.rddf/state` 会查成 `~/.rddf/state/.rddf/state/role.json` ⇒ 全局步恒空 ⇒ 恒落 general。
        globalRoot: homedir(),
        sessionID,
        agent,
      })

      // 后端识别（AC17）：`parentID` 不可靠（`ctx.session.create` 不设）⇒ 补两条登记面判据
      const partition = readSessionPartition(stateRoot, sessionID)
      const result = evaluateWrite({
        agent,
        parentID: session?.parentID ?? null,
        registeredBackend: isRegisteredBackend(stateRoot, sessionID),
        partitionRoleClass: partition?.roleClass ?? null,
        role: resolved.role,
        action: tool === "edit" ? "edit" : "write",
        filePath,
        cwd,
        repoRoot: workRoot,
      })

      if (!result.allowed) throw new Error(result.message ?? "role-gate: 拒绝")

      // ⚠ **门控跳过的会话**（被派发后端 / 非 build 主会话）**不参与租约校验**：
      //   D6 规定「后端的工作角色 = 它的 `role_class`」，而后端租约由**派发临界区**
      //   （`claimSlot`）按 `role_class` 占用；若这里再用**身份链解析出的角色**去查/占租约，
      //   会给后端占一条**错的**角色键（层 2 实测：role_class=verifier 的后端占出了 `builder` 键
      //   ⇒ 主会话之后想用 builder 就假冲突）。⇒ 只对 `gated === true` 的会话校验租约。
      if (!result.gated) return

      // ② 角色租约围栏（**每次**写类工具调用都校验 —— ADR D6 执行点③）：
      //    持有者 + `claim_gen` 都要对得上；被接管 ⇒ 拒绝（模型只能读 + 报告）。
      //    ⚠ **不传 hostProbe**：当前**全仓**没有任何生产调用点传它（`ctx.session.get`
      //    对已死会话仍返回记录 ⇒ 探针恒真 ⇒ 死会话永远挡不住写类工具）；
      //    ⇒ 判活落 `heartbeat_at` TTL 兜底（由租约侧在每次写调用时续心跳维持有效）。
      const lease = checkLeaseForWrite({
        stateRoot,
        workRoot,
        role: resolved.role,
        sessionID,
        warnSink: (m: string) => console.error(m),
      })
      if (!lease.ok) throw new Error(lease.message ?? "role-gate: 租约校验失败")
    })
  },
})
