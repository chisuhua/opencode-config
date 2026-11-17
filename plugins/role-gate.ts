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
import { homedir } from "node:os"
import path from "node:path"

import { Plugin } from "@opencode/plugin"

import { canonicalRoot } from "../lib/delegate-core.ts"
import { resolveRole } from "../lib/role-identity.ts"
import { checkLeaseForWrite } from "../lib/role-lease.ts"
import { evaluateWrite } from "../lib/role-policy.ts"

const WRITE_TOOLS = new Set(["edit", "write"])

export default Plugin.define({
  id: "role-gate",
  async setup(ctx) {
    await ctx.tool.hook("execute.before", async (event: any) => {
      const tool = event?.tool
      if (typeof tool !== "string" || !WRITE_TOOLS.has(tool)) return

      const input = event?.input ?? {}
      const filePath = typeof input.filePath === "string" ? input.filePath : ""
      if (!filePath) return

      const sessionID = typeof event?.sessionID === "string" ? event.sessionID : ""
      if (!sessionID) return

      const session = await ctx.session.get({ sessionID })
      const agent = typeof session?.agent === "string" ? session.agent : ""

      // 身份解析的**单一落点**（AC16）：门控与租约都从这里取角色
      const cwd = process.cwd()
      const { stateRoot, workRoot } = canonicalRoot(cwd)
      const resolved = resolveRole({
        stateRoot,
        // ⚠ `globalRoot` 是**仓根**语义（`resolveRole` 内部拼 `.rddf/state/role.json`）
        //   ⇒ 传 `~/.rddf/state` 会查成 `~/.rddf/state/.rddf/state/role.json` ⇒ 全局步恒空 ⇒ 恒落 general。
        globalRoot: homedir(),
        sessionID,
        agent,
      })

      const result = evaluateWrite({
        agent,
        parentID: session?.parentID ?? null,
        role: resolved.role,
        action: tool === "edit" ? "edit" : "write",
        filePath,
        cwd,
        repoRoot: workRoot,
      })

      if (!result.allowed) throw new Error(result.message ?? "role-gate: 拒绝")

      // ② 角色租约围栏（**每次**写类工具调用都校验 —— ADR D6 执行点③）：
      //    持有者 + `claim_gen` 都要对得上；被接管 ⇒ 拒绝（模型只能读 + 报告）。
      const lease = checkLeaseForWrite({
        stateRoot,
        workRoot,
        role: resolved.role,
        sessionID,
      })
      if (!lease.ok) throw new Error(lease.message ?? "role-gate: 租约校验失败")
    })
  },
})
