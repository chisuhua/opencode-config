/**
 * push-gate —— **force push 的工具层兜底**（`docs/adr/ADR-commit-verification-gate.md` D4 / D9⑧ / Rev 2 / 2.1）
 *
 * **为什么要工具层再兜一层**：`opencode.jsonc` 里 force push 是 `deny`，但宿主把「Allow always」
 * 持久化后，与 config `deny` 的**优先级未知**（无源码锚点）⇒ 交互会话里曾点过 Always 的用户，
 * force push 可能不再被问（ADR D9⑧）。
 * ⇒ 与 commit 门禁**同一个插件**里做硬拒：不管权限层怎么合并，工具层直接抛错。
 *
 * **口径 = ADR D4 的 6 种形状**（`--force*` / `-f*` / `+refspec` / `--mirror*` / 短选项簇 / 带引号形态），
 * 由 `lib/commit-gate.ts::scanForcePush` 单一真源实现（config 侧是 **8 条** `deny` glob，
 * 工具层是它的**严格超集** —— config 的 glob 表达不了短选项簇与带引号形态 ⇒ 这是**收紧**，不是放松）。
 *
 * ⚠ **登记不做的**（ADR D9）：⑬ 命令行之外的强推（`remote.<n>.push` 带 `+` / `remote.<n>.mirror`）
 *   ⑭ 删除类 push（`--delete` / `-d` / `:refspec` / `--prune`）—— 两者仍落 `git push *` = `ask`。
 */
import {
  isGitCommandWord,
  parseGitSubcommandIndex,
  scanForcePush,
  stripHeredocs,
  tokenizeCommand,
  type Token,
} from "./commit-gate.ts"

export interface ForcePushInvocation {
  /** 是否是一次 force push */
  isForcePush: boolean
  /** 命中时的原因（用于错误文案）；未命中则 undefined */
  reason?: string
}

/**
 * 判定一条 shell 命令是不是一次 **force push**。
 *
 * ⚠ **只认顶层命令词**：`echo "git push --force"`（数据）不算；`bash -c 'git push --force'` 属
 *   「藏进字符串交给另一个解释器」的形态 ⇒ 由 `lib/commit-gate.ts` 的解释器闭口处理（不属本文件口径）。
 * ⚠ **heredoc 正文是数据**：先剥离（复用 `stripHeredocs` ⇒ 与 commit 门禁同一份前处理）
 *   ⇒ 正文里提到强推字面量**不**会被误判成强推（ADR 的实施对齐项）。
 */
// 运行时证据（2026-11-26）：`tool.execute.before` 先于 `permission.assert`（源码 `packages/core/src/tool.ts:390`
// → `packages/core/src/tool/plugin/shell.ts:356`；运行时证据见 `.rddf/reviews/runtime-e2e-push-gate-verify.md`）
export function detectForcePush(command: string): ForcePushInvocation {
  if (typeof command !== "string" || command.trim() === "") return { isForcePush: false }
  // ⚠ 与 commit 门禁**同一份** heredoc 前处理（正文是数据 ⇒ 不参与判定）
  const tokens = tokenizeCommand(stripHeredocs(command))
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
    // ⚠ **引号包住也算命令词**（`"git" push --force` 照样执行 git）⇒ 与 D5③ 同一立场
    const idx = seg.findIndex((t) => isGitCommandWord(t))
    if (idx < 0) continue
    // 子命令 = git 之后第一个非 `-` token（跳过全局选项与其值；与 commit-gate 同口径）
    // ⚠ `allowQuotedSub = true` ⇒ `git "push" --force` 也算（引号去掉后就是 push）
    const subIndex = parseGitSubcommandIndex(seg, idx + 1, true)
    if (subIndex === null) continue
    if (seg[subIndex]!.value !== "push") continue
    // push 之后出现强推指示符 ⇒ force push（单一真源：S1 前缀 / S2 短簇 / S3 `+refspec` / S4 quoted / S5 跳带值）
    const scan = scanForcePush(seg, subIndex + 1)
    if (scan.hit) {
      return {
        isForcePush: true,
        reason:
          `push-gate: 检测到 **force push**（\`git push … ${scan.token}\`）⇒ 拒绝` +
          `（force push 会重写远端历史；本兜底与 config 的 \`deny\` 同口径，不因历史授权而放行）`,
      }
    }
  }
  return { isForcePush: false }
}
