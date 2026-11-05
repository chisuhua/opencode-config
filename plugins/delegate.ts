import { Plugin } from "@opencode/plugin"
import { delegateToolDefinition } from "../lib/delegate-core.ts"

export default Plugin.define({
  id: "front-delegate",
  async setup(ctx: any) {
    await ctx.tool.transform((editor: any) => {
      editor.add(delegateToolDefinition(ctx))
    })
  },
})
