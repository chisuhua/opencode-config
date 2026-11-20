# design — plan-multi-session-collaboration

> 决策在 ADR（`docs/adr/ADR-plan-multi-session-collaboration.md`）；本文件只写**怎么做**。
> 任务拆分见 `tasks.md`；TDD 5 步见 `.rddf/plans/plan-multi-session-collaboration.md`。

## 1. 数据契约：`graph.json`

```jsonc
{
  "version": 1,
  "topic": "<== 目录名 slug>",
  "nodes": [
    {
      "id": "a1",                          // ^[a-z0-9][a-z0-9._-]{0,63}$ + 黑名单
      "title": "调研 delegate 现状",
      "deps": ["a0"],                      // 引用其它 node.id；允许空数组
      "owner": "parent",                   // "parent" | "child"
      "status": "pending",                 // "pending" | "blocked_by_deps" | "done"
      "progress": "todo",                  // "todo" | "partial" | "complete"
      "attempts": [
        { "agent": "plan-worker", "started_at": "2026-11-20T10:00:00Z",
          "finished_at": "2026-11-20T10:12:00Z",
          "precheck": { "at": "2026-11-20T09:59:00Z", "exit": 0, "graph_rev": "sha1:..." },
          "baseline": "<git sha 或空>" }
      ],
      "deliverables": ["nodes/a1/RESULT.md"],   // 相对 topic 根；每条须存在且非空
      "brief_sha256": "<父写 BRIEF.md 时的 sha256>"   // 可选
    }
  ]
}
```

**`progress` 与 `status` 正交（关键）**：

| 字段 | 定义 | 判据 |
|---|---|---|
| `progress` | 纯磁盘派生，**不看依赖** | `TODO.md` 全勾 ∧ `RESULT.md` 有实质内容 ⇒ `complete`；否则 `partial`（若 `TODO.md` 不存在或无 checkbox ⇒ `todo`） |
| `status` | 门控有效值 | `progress==complete ∧ deps 全 done ∧ deliverables 非空且每条路径存在且非空` ⇒ `done`；`progress==complete` 但 deps 未全 done ⇒ `blocked_by_deps`；否则 `pending` |

- **子先干完而依赖未完成 ⇒ `progress=complete` / `status=blocked_by_deps`**，是**合法状态**，checker 不得报错。
- `graph.json` 里的 `status` / `progress` 只是**缓存**；判据以派生为准（缓存分叉 ⇒ 违规，见 `check` 的 `cache_mismatch`）。

## 2. 模块契约：`lib/plan-topics.ts`

```ts
export type Progress = "todo" | "partial" | "complete"
export type Status = "pending" | "blocked_by_deps" | "done"
export interface Attempt { agent: string; started_at: string; finished_at?: string; precheck?: { at: string; exit: number; graph_rev?: string }; baseline?: string }
export interface Node { id: string; title: string; deps: string[]; owner: "parent" | "child"; status: Status; progress: Progress; attempts: Attempt[]; deliverables: string[]; brief_sha256?: string }
export interface Graph { version: number; topic: string; nodes: Node[] }
export interface Violation { code: string; node?: string; detail: string }

export const NODE_ID_RE: RegExp                  // ^[a-z0-9][a-z0-9._-]{0,63}$
export const NODE_ID_BLACKLIST: string[]         // 后缀 .lock / .env / .bak，前缀 backup
export class PlanTopicError extends Error { code: string }

export function parseGraph(raw: string): Graph   // JSON.parse + assertSchema；抛 PlanTopicError
export function assertSchema(g: Graph): void
export function assertValidNodeId(id: string): void
export function assertUniqueNodeIds(g: Graph): void
export function assertDepsExist(g: Graph): void
export function assertAcyclic(g: Graph): void    // DFS 三色
export function deriveProgress(topicDir: string, node: Node): Progress
export function isNonEmptyResult(text: string): boolean   // 剥离 HTML 注释与纯标题后仍有正文
export function deriveStatus(g: Graph, topicDir: string): Map<string, Status>
export function assertCacheConsistent(g: Graph, topicDir: string): Violation[]
export function assertBriefIntegrity(g: Graph, topicDir: string): Violation[]
export function assertNoOrphanNodes(g: Graph, topicDir: string): Violation[]
export function checkTopic(topicDir: string, opts?: { allowEmpty?: boolean }): Violation[]
```

**`isNonEmptyResult()` 判定**（对应 AC10）：去掉 fenced code block、HTML 注释（`<!-- … -->`）、空白、**单个** markdown 标题行后，若仍有非空正文 ⇒ 非空。可选强化：末行 `## STATUS: COMPLETE` 哨兵。

**`deriveProgress()` 解析口径**（闭集）：先剥离 fenced code block（``` … ```）；只认 `^- \[( |x|X)\] ` 开头（允许一个二级缩进 `^  - \[`）；**零 checkbox ⇒ `todo`**（不是 vacuous done）；全部 `[x]`/`[X]` ⇒ `complete`；存在未勾 ⇒ `partial`。

## 3. CLI 契约：`scripts/plan-topic-check.ts`

```
plan-topic-check check <topic-dir> [--json] [--allow-empty]
plan-topic-check scope-check <topic-dir> <node-id> --baseline <ref|sha> [--json]
plan-topic-check lock <topic-dir> [--json]
```

**退出码（四值互斥）**：

| code | 含义 | 约束 |
|---|---|---|
| `0` | 全绿 | — |
| `1` | 有违规 | 逐条列出（人读）或 `--json` 的 `violations[]` |
| `2` | 用法错误 | stdout **不含**违规列表 |
| `3` | `graph.json` 缺失或不可解析 | stdout **不含**违规列表 |

`--json` 输出：`{ ok: boolean, violations: Violation[] }`（`Violation.code` 属闭集：`schema_invalid` / `invalid_node_id` / `duplicate_node_id` / `cycle` / `dangling_dep` / `orphan_node_dir` / `missing_brief` / `cache_mismatch` / `brief_tampered` / `missing_deliverable` / `empty_topic` / `git_error`）。

**`scope-check`**：不复用 `lib/delegate-core.ts::gitStatusPaths`（它在 git 失败时 `return []` ⇒ 假绿）。自实现：`git status --porcelain -z` 解析；`git` 失败 ⇒ `exit 1` + code `git_error`；越界判定 = 变更路径 ∉ `nodes/<node-id>/` 前缀（相对 topic 根或工程根，按 baseline 差分的路径形态归一）。基线差分：`changedSince(baselinePaths, afterPaths)`。

**`lock`**：只读。读 `.rddf/state/plan-topics/<slug>.lock/owner`（若存在）+ `.rddf/state/plan-sessions.json`，输出 `{ present, owner, binding }`；不改文件。

## 4. 配置改动（`opencode.jsonc.opencode-go`，真源；`opencode.jsonc` 是符号链接）

### 4.1 新增 `plan-worker` agent

```jsonc
"plan-worker": {
  "mode": "subagent",
  "description": "plan 侧离线协作的子会话：只推进自己的 node todo（不派生、不问用户、不派工程）",
  "prompt": "{file:./prompts/plan-worker.md}",
  "permission": {
    "edit": { "*": "deny", ".rddf/plan-topics/*": "allow", "*.rddf/plan-topics/*": "allow" },
    "read": "allow", "grep": "allow", "glob": "allow", "list": "allow",
    "webfetch": "allow", "websearch": "allow",
    "subagent": "deny",
    "question": "deny",
    "skill": "deny",
    "lsp": "deny",
    "external_directory": "deny",
    "delegate": "deny", "delegate_dispatch": "deny", "delegate_sessions": "deny",
    "delegate_suspend": "deny", "delegate_cancel": "deny"
    // shell 由 scripts/agent-guard-gen.ts 从 GUARDED_AGENTS 生成（三段式只读、首键 deny、无 bun/node）
  }
}
```

> ⚠ `edit` 的路径形态（相对 vs 前导 `*`）由 `scripts/agent-guard-gen.ts` 的既有约定决定；两种都写以覆盖匹配口径差异 —— 但**必须**由 I2⑦⑧⑨ 的真实写入探针验证（见 tasks）。

### 4.2 `plan` 的 `edit` 白名单新增两条

```jsonc
"edit": {
  "*": "ask",
  ".rddf/plans/*.md": "allow",
  ".plans/*.md": "allow",
  "docs/adr/draft-*.md": "allow",
  "openspec/changes/*/design.md": "allow",
  ".rddf/plan-topics/*": "allow",
  ".rddf/state/plan-sessions.json": "allow"
}
```

> **顺序**：`"*"` 必须保持首条（last-match-wins ⇒ 后续 allow 覆盖 ask）。

### 4.3 `scripts/agent-guard-rules.ts`

`GUARDED_AGENTS` 数组加 `"plan-worker"` ⇒ `agent-guard-gen.ts --write` 会生成三段式 shell 白名单（`*: deny` 打头 + 只读命令 + `* > *` / `tee *` / `sort -o*` 守卫），且**不含** `bun` / `node`。

### 4.4 `prompts/plan.md`

- `<!-- capability:plan -->` 块：`edit:` 行追加 `.rddf/plan-topics/*, .rddf/state/plan-sessions.json`
- 新增「多会话协作」段（topic 形态 / 单一写者表 / schema / progress·status 正交 / 派发前跑 checker + `precheck` / 锁获取与释放 / 续接 vs 重建 / 子只回指针）
- **既有口径不动**：`.rddf/plans/<slug>.md`、`plan_ref`、delegate 五项权限

### 4.5 `prompts/plan-worker.md`（新增）

- **首行必须含 `plan-worker`**（既有闸门 `tests/config-guards.test.ts:2012-2025`）
- 职责：只推进自己 node 的 `TODO.md` / `RESULT.md`；写完 `RESULT.md` 末行可选 `## STATUS: COMPLETE`
- 禁令：不派生 / 不问用户 / 不派工程 / 不跑 `bun` / 不写自己 node 之外
- 最终消息**只回指针 + 摘要**（父上下文保护）
- 压缩后**先读盘**

### 4.6 `scripts/check-upstream-anchors.sh`

7 条新锚点（语义 + 文件 + ERE 模式，不写行号）：

| 锚点 | 文件 | 语义模式（示意） |
|---|---|---|
| P1 primary 拒绝作 subagent | `packages/core/src/tool/plugin/subagent.ts` | `cannot run as a subagent` |
| P2 建子会话设 parentID | 同上 | `parentID: context\.sessionID` |
| P3 完成合成消息投回父 | `packages/core/src/session/subagent-completion.ts` | `sessions\.synthetic` |
| P4 resume 校验 parentID | `packages/core/src/tool/plugin/subagent.ts` | `existing\.parentID !== context\.sessionID` |
| P5 子会话权限取 agent 配置 | `packages/core/src/permission.ts` | `merge\(agent\?\.permissions` |
| P6 Wildcard `*` 跨斜杠 | `packages/core/src/util/wildcard.ts` | `\.\*` |
| P7 delegate 按 workRoot 单槽 | `lib/delegate-core.ts`（**本仓**，非上游） | 单槽判据模式 |

> P7 指向本仓 `lib/delegate-core.ts`（`check` 函数支持相对路径？若只支持上游源码根，则 P7 改指向 `.rddf/...` 文档锚点或跳过 —— **实施时按脚本实际能力决定**，以 `RESULT: OK` 为准）。

## 5. 测试策略

| 测试文件 | 覆盖 | 关键手法 |
|---|---|---|
| `tests/plan-topics.test.ts` | A0/A/B 全部判据 | `mkdtemp` 造 topic 目录 + fixture `graph.json` / `TODO.md` / `RESULT.md`；CLI 用 `execFileSync("bun", ["scripts/plan-topic-check.ts", ...])` 断言 `$?` 与 stdout |
| `tests/config-guards.test.ts`（扩展） | 形态 / 可派者 / 投影块 / ignore / EXPECTED | 读 JSONC 配置；`capabilityBlock()` 渲染比对；`git check-ignore` |
| `tests/plan-topics.test.ts`（scope-check 子 describe） | 越界检出 / git 失败 / 只读 | `mkdtemp` + `git init` 的 **fixture 仓**（**不要**对真实仓跑 —— 踩 `tests/real-repo-git-budget.test.ts` 红线） |

**fixture 清单**（每条对应一个 AC）：
- schema：缺 `version` / `nodes` 非数组 / `status` 非枚举 / `deliverables` 非数组 / `attempts` 非数组 / JSON 截断
- node id：`..` / `/abs` / 含 `/` / 超长 / 空 / `.` / `foo.lock` / `.env` / `x.bak` / `backup1`
- 图：自环 / 二元环 / 三元环 / 悬空 dep / deps 内重复 / 重复 id
- 进度：0 checkbox / 全勾 / 部分勾 / fenced code block 内的假 checkbox / 缩进 checkbox / `* [X]`
- RESULT：空 / 纯空白 / 仅 HTML 注释 / 仅标题 / 正常段落 / 末行哨兵
- 交付物：`deliverables: []` / 路径不存在 / 路径为空文件 / 正常
- 一致性：缓存 `status=done` 但派生非 done（双向）/ `brief_sha256` 不符
- 孤儿：`nodes/x/` 存在但图无 x / 图有 x 但 `BRIEF.md` 缺失
- 空 topic：`nodes: []` / `--allow-empty` 放行

## 6. 实施细节裁决（来自路线图 §5，落地形态）

| # | 裁决 |
|---|---|
| 1 | plan 的 `edit` 加 `.rddf/state/plan-sessions.json`（精确单文件，非目录） |
| 2 | 锁 = 目录 + `owner` 文件；全节点 done ⇒ 父 `rmdir`；checker `lock` 只读 |
| 3 | checker 落 `lib/plan-topics.ts` + `scripts/plan-topic-check.ts` + `tests/plan-topics.test.ts` |
| 4 | `plan-worker` 在 `GUARDED_AGENTS` ⇒ shell 无 `bun`/`node` ⇒ checker 只能父会话跑 |
| 5 | `.rddf/plan-topics/*` 经 `Wildcard` 跨斜杠覆盖 `nodes/<id>/TODO.md`（实测） |
| 6 | 同步 `EXPECTED.lib` / `EXPECTED.prompts`；`scripts/`、`tests/` 不在任何清单（现状） |
| 7 | `docs/adr/` 不进闸门（残留 #5） |
| 8 | `edit` 路径形态由真实写入探针（I2⑦⑧⑨）钉死 |
| 9 | `plan-worker` **不**加 `capability:` 投影块；V02 用 `capabilityBlock()` 渲染比对 |
| 10 | 父派发前跑 checker 并把 `precheck` 写进 `attempts[]` |
| 11 | `plan-sessions.json` 由 checker `lock` 三方核对；写方原子替换 |
| 12 | `graph.json` 写方原子替换；checker 不可解析 ⇒ `exit 3` |
| 13 | 无 `subagent` 键的 agent 闭集断言（当前 `["title"]`） |
| 14 | 锚点数以脚本自报为准（运行时基线 23，不写魔数） |
