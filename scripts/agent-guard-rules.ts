/**
 * 五个只读 subagent 的 shell 守卫规则 —— **唯一真源**（single source of truth）。
 *
 * 背景：本轮因配置漂移出过两次事故（① `subagent` 规则顺序把整个工具隐藏；
 * ② `curl * -o*` 匹配不到 `curl -o /tmp/x`）。根因是这些规则**只存在于
 * `opencode.jsonc` 的手写 JSON 里**，没有任何真源、没有漂移检测。
 *
 * 配套：
 *   - `scripts/agent-guard-gen.ts` —— 从本文件重建配置里的 shell 块（`--check` 检漂移 / `--write` 写回）。
 *   - `tests/config-guards.test.ts` —— 漂移检测测试（配置 == 本文件的规则）。
 *
 * 规则口径见 `docs/adr/ADR-front-knowledge-capability.md` D3 / D3.1：
 *   三段式 = `*: deny` 打头 → 只读白名单 → 尾部守卫 deny。
 *   守卫必须同时覆盖**首参数形态**（`curl -o …` vs `curl … -o …`）。
 */

/** 只读白名单（allow）。 */
export const BASE_ALLOW: string[] = [
  "rg *", "grep *", "ls *", "cat *", "head *", "tail *", "wc *", "sort *",
  "uniq *", "diff *", "file *", "stat *", "tree *", "du *", "df *",
  "which *", "basename *", "dirname *", "readlink *", "realpath *",
  "tr *", "cut *", "printf *", "date *", "test *", "expr *", "seq *",
  "nl *", "column *", "find *",
  "git log *", "git show *", "git diff *", "git status *", "git blame *",
  "git ls-files *", "git rev-parse *", "git ls-tree *", "git cat-file *",
  "git show-ref *", "git shortlog *", "git count-objects *",
  "git verify-commit *", "git config --get *", "git remote -v",
  "git stash list", "git worktree list",
]

/** 破坏性命令（deny）——无人值守下必须直接拒，不能挂死。 */
export const DESTRUCTIVE_DENY: string[] = [
  "git push *", "git push", "git reset --hard *", "git reset --hard",
  "git clean -fd *", "git clean -fd", "git clean -fdx *", "git clean -fdx",
  "git checkout -- *", "git checkout .", "git restore *",
  "git branch -D *", "git stash drop *", "git stash clear *",
  "git commit *", "git commit",
  "rm -rf *", "rm -fr *", "rm -r *", "rm -f *", "sudo *",
]

/**
 * 尾部守卫（deny）。每条 `<工具> <旗标> …` 形态都必须同时有 `<工具> <旗标>*`（无空格）形态。
 */
export const COMMON_GUARDS: string[] = [
  "* > *", "* >> *",
  "find * -exec*", "find * -execdir*", "find * -delete",
  "find * -fprint*", "find * -fprintf*", "find * -fls*",
  "sort * -o*", "uniq * -o*", "tee *",
  "sort -o*", "uniq -o*",
  "git * --output*", "git * --format*", "git * --pretty*",
  "git --output*", "git --format*", "git --pretty*",
  "curl * -o*", "curl * --output*", "curl * -O*",
  "curl -o*", "curl --output*", "curl -O*",
  "curl * -T *", "curl * --upload-file *",
  "curl -T *", "curl --upload-file *",
  "curl * -d @*", "curl * --data @*", "curl * --data-binary @*",
  "curl -d @*", "curl --data @*", "curl --data-binary @*",
  "wget * -O*", "wget * --output-document*", "wget * -P*",
  "wget -O*", "wget --output-document*", "wget -P*",
]

/** `.env` 读取族（deny）。 */
export const ENV_DENY: string[] = [
  "cat *.env", "cat *.env.*", "head *.env", "head *.env.*",
  "tail *.env", "tail *.env.*",
]

/** librarian 专属：网络与 clone（allow）。 */
export const LIBRARY_ALLOW: string[] = ["curl *", "wget *", "git clone *", "git ls-remote *"]

/** librarian 专属：clone 目标收敛（deny → allow，后者压过前者）。 */
export const CLONE_GUARD: Array<[string, string]> = [
  ["git clone * /*", "deny"],
  ["git clone * /tmp/opencode/*", "allow"],
]

/** 受这套规则约束的 agent（五个只读 subagent）。 */
export const GUARDED_AGENTS = ["explore", "oracle", "metis", "critic", "librarian"] as const

export type GuardedAgent = (typeof GUARDED_AGENTS)[number]

/** ADR D3.1 要求"首参数形态"必须齐备的守卫族（漂移检测用）。 */
export const REQUIRED_FIRST_ARG_FORMS: string[] = [
  "curl -o*", "curl --output*", "curl -O*",
  "curl -T *", "curl --upload-file *",
  "curl -d @*", "curl --data @*", "curl --data-binary @*",
  "wget -O*", "wget --output-document*", "wget -P*",
  "git --output*", "git --format*", "git --pretty*",
  "sort -o*", "uniq -o*",
]

/**
 * 构造某个 agent 的完整 shell 规则序列（**有序**——顺序即策略，last-match-wins）。
 */
export function buildShellRules(agent: GuardedAgent): Array<[string, string]> {
  const rules: Array<[string, string]> = [["*", "deny"]]
  for (const k of BASE_ALLOW) rules.push([k, "allow"])
  if (agent === "librarian") for (const k of LIBRARY_ALLOW) rules.push([k, "allow"])
  for (const k of DESTRUCTIVE_DENY) rules.push([k, "deny"])
  // 绝对路径禁令只对非 librarian 生效（librarian 必须能 clone 到 /tmp/opencode）
  if (agent !== "librarian") rules.push(["* /*", "deny"])
  for (const k of COMMON_GUARDS) rules.push([k, "deny"])
  if (agent === "librarian") for (const [k, v] of CLONE_GUARD) rules.push([k, v])
  for (const k of ENV_DENY) rules.push([k, "deny"])
  return rules
}

/** 规则序列 → 配置里的对象形态（保持插入顺序）。 */
export function buildShellObject(agent: GuardedAgent): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of buildShellRules(agent)) out[k] = v
  return out
}
