import { Plugin } from "@opencode/plugin"
import { delegateToolDefinition } from "../lib/delegate-core.ts"
import {
  cancelToolDefinition,
  dispatchToolDefinition,
  sessionsToolDefinition,
  suspendToolDefinition,
} from "../lib/delegate-async.ts"

export default Plugin.define({
  id: "front-delegate",
  async setup(ctx: any) {
    await ctx.tool.transform((editor: any) => {
      // 同步单发面（既有语义与既有判据全部不变）
      editor.add(delegateToolDefinition(ctx))
      // 异步派发面（ADR-front-multi-backend：dispatch / sessions / suspend / cancel）
      editor.add(dispatchToolDefinition(ctx))
      editor.add(sessionsToolDefinition(ctx))
      editor.add(suspendToolDefinition(ctx))
      editor.add(cancelToolDefinition(ctx))
    })
  },
})
