/**
 * push-gate —— **force push 的工具层兜底**（`docs/adr/ADR-commit-verification-gate.md` D4 / D9⑧）
 *
 * **为什么要工具层再兜一层**：`opencode.jsonc` 里 force push 是 `deny`，但宿主把「Allow always」
 * 持久化后，与 config `deny` 的**优先级未知**（无源码锚点）⇒ 交互会话里曾点过 Always 的用户，
 * force push 可能不再被问（ADR D9⑧）。
 * ⇒ 与 commit 门禁**同一个插件**里做硬拒：不管权限层怎么合并，工具层直接抛错。
 *
 * **口径 = config 四形态的严格超集**（`git push --force*` / `-f*` / `* --force*` / `* -f*`）：
 *   实现上等价于「`git push` 之后出现任一强推标志」⇒ 还覆盖 config 的 glob **表达不了**的短选项簇
 *   （`git push -uf origin main`）。这是**收紧**，不是放松。
 *
 * ⚠ **已知差异**（登记于 ADR D9⑬）：`git push origin +main`（`+refspec` 也是强推）**不在**本兜底口径内
 *   （config 的 `deny` 同样不覆盖）⇒ 两层口径一致，但两侧都留着这个口。
 */
import path from "node:path"

import { isForceFlagToken, tokenizeCommand, type Token } from "./commit-gate.ts"

export interface ForcePushInvocation {
  /** 是否是一次 force push */
  isForcePush: boolean
  /** 命中时的原因（用于错误文案）；未命中则 undefined */
  reason?: string
}

/** 该 token 是不是 `git` 命令词（basename 必须是 `git`）。 */
function isGitWord(value: string): boolean {
  if (!value.includes("/") && value !== "git") return false
  return path.basename(value) === "git"
}



/**
 * 判定一条 shell 命令是不是一次 **force push**。
 *
 * ⚠ **只认顶层命令词**：`echo "git push --force"`（数据）不算；`bash -c 'git push --force'` 属
 *   「藏进字符串交给另一个解释器」的形态 ⇒ 由 `lib/commit-gate.ts` 的解释器闭口处理（不属本文件口径）。
 */
export function detectForcePush(command: string): ForcePushInvocation {
  if (typeof command !== "string" || command.trim() === "") return { isForcePush: false }
  const tokens = tokenizeCommand(command)
  // 分段（引号外的 `;` / `&&` / `||` / `|` / `&` / 换行）
  const segments: Token[][] = [[]]
  for (const t of tokens) {
    if (!t.quoted && ["&&", "||", ";", "|", "&", "\n"].includes(t.value)) {
      segments.push([])
      continue
    }
    segments[segments.length - 1]!.push(t)
  }
  for (const seg of segments) {
    const idx = seg.findIndex((t) => !t.quoted && isGitWord(t.value))
    if (idx < 0) continue
    // 子命令 = git 之后第一个非 `-` token（与 commit-gate 同口径：跳过全局选项与其值）
    let j = idx + 1
    while (j < seg.length) {
      const v = seg[j]!.value
      if (!v.startsWith("-")) break
      const eq = v.indexOf("=")
      const name = eq >= 0 ? v.slice(0, eq) : v
      if (GIT_GLOBAL_VALUE_OPTIONS.has(name) && eq < 0) j += 1
      j += 1
    }
    const sub = seg[j]
    if (!sub || sub.quoted || sub.value !== "push") continue
    // push 之后出现强推标志 ⇒ force push
    for (let k = j + 1; k < seg.length; k++) {
      const t = seg[k]!
      if (t.quoted) continue
      if (isForceFlagToken(t)) {
        return {
          isForcePush: true,
          reason:
            `push-gate: 检测到 **force push**（\`git push … ${t.value}\`）⇒ 拒绝` +
            `（force push 会重写远端历史；本兜底与 config 的 \`deny\` 同口径，不因历史授权而放行）`,
        }
      }
    }
  }
  return { isForcePush: false }
}

/** git 全局选项里**带值**的那些（与 commit-gate 同口径，避免把 `<dir>` 当子命令）。 */
const GIT_GLOBAL_VALUE_OPTIONS = new Set([
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
  "-c",
  "-C",
])
