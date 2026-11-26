# RESULT — node a1

## 结论（一行）

能读到本 node 的 `BRIEF.md` 与 topic 的 `TOPIC.md`：二者全文均成功读取（`BRIEF.md` 15 行、`TOPIC.md` 18 行），`BRIEF.md` 的目标（验证 plan-worker 在真宿主里被并行派发）与 `TOPIC.md:6-9` 的全局约束（a1/a2 无依赖、worker 只写自己 node 目录）可读且自洽，本 worker 按此边界执行。

## 依据与 `path:line` 引用

- `.rddf/plan-topics/v12-probe/nodes/a1/BRIEF.md:11` —— 要求「尝试调用 `subagent` 工具」并把拒绝错误原文逐字贴进「## 负向探针」小节；本文件按其执行。
- `.rddf/plan-topics/v12-probe/TOPIC.md:17` —— 「**负向探针**：worker 内调 `subagent` 是否被拒（AC4 的唯一运行时证据）」⇒ 本 node 回答的正是这一项。
- `opencode.jsonc:1500` —— `plan-worker` 的权限段里 `"subagent": "deny"`（同段 `question` / `delegate*` / `lsp` / `skill` 亦为 deny，`edit` 白名单仅 `*.rddf/plan-topics/*`）。
- `docs/adr/ADR-plan-multi-session-collaboration.md:14` —— 前置事实 ①：「宿主 `subagent` 工具对 primary agent 直接拒绝（upstream `core/src/tool/plugin/subagent.ts`）」；同段 ⑤ 说明子会话权限 = 该 agent 自己配置 ⇒ 与 `opencode.jsonc:1500` 的 deny 互相印证。
- 产出物：本 node 的 `TODO.md`（`probe-1` 已勾选）、本文件 `RESULT.md`。

## 本 worker 实际做了什么

1. 读 `BRIEF.md` + `TOPIC.md`（全部成功，无截断阻塞）。
2. 建立 `TODO.md`，先写 `- [ ] probe-1`，收尾后改为 `- [x] probe-1` 并补两条附注（见该文件）。
3. 按 BRIEF 要求**真的发起** `subagent` 调用（三次不同入参形态，均通过 Code Mode 的 `tools.*` 通道），逐字捕获错误原文，见下节。
4. 未触碰其它 node、未修改 `TOPIC.md` / `graph.json` / `BRIEF.md`；未跑 `bun` / `node`；未写盘 shell（唯一一次 `shell` 调用被宿主以 `Permission denied: shell` 拒绝，未产生副作用）。

## 负向探针

### 探针载荷（三次，均为「最小只读子会话」形态）

| # | 调用表达式 | 结果 |
|---|---|---|
| 1 | `tools.subagent({ agent: "explore", prompt: "只读探针：请回复 OK", background: true })` | 被拒 |
| 2 | `tools["subagent"]({ agent: "explore", prompt: "只读探针：请回复 OK" })` | 被拒 |
| 3 | `tools.subagent({ agent: "explore", prompt: "x", sessionID: "ses_probe" })`（续接形态） | 被拒 |

### 拒绝错误原文（逐字，三次完全一致）

```
Error: Unknown tool 'subagent'. Did you mean tools.opencode.session.interrupt?
```

（`e.message` 为去掉 `Error: ` 前缀的同一串：`Unknown tool 'subagent'. Did you mean tools.opencode.session.interrupt?`）

### 拒绝的形态说明（重要，供父裁决口径）

- 本次拒绝**不是**形如 `{"error":{"type":"permission.rejected","message":"Permission denied: subagent"}}` 的宿主任期拒绝，而是 **Code Mode 运行时在工具目录（catalog）里根本找不到 `subagent`** ⇒ 报 `Unknown tool 'subagent'`。
- 佐证：`search({ query: "subagent" })` 在工具目录中 0 命中 `subagent` 本体（仅命中两个描述里含该词的会话工具：`tools.opencode.session.interrupt` / `tools.opencode.session.search`）；`search({query:"spawn"})` 与 `search({query:"delegate"})` 均返回空列表。即：**`subagent`、`delegate*` 对 plan-worker 会话完全未暴露**，与 `opencode.jsonc:1500-1506` 的 deny 名单一一对应。
- 对照组：同一会话内 `shell` 是**已暴露但被拒**的工具，其拒绝形态才是 `{"error":{"type":"permission.rejected","message":"Permission denied: shell"}}`。两种拒绝形态并存，说明「catalog 过滤（未暴露）」与「执行期 permission.rejected」是本宿主的两种不同拒绝路径。
- 因此结论是**「被拒绝」成立**（AC4 的运行时证据成立，符合 BRIEF 预期「未被拒绝 ⇒ 写『意外：未被拒绝』」这一分支**未触发**），但**证据形态是「工具未注册 / 未暴露」而非「调用后被权限门拒」**。若父会话需要的是后者那种 `permission.rejected` 原文，需要另行造（例如用 `mode: primary` 且 `subagent: "allow"` 的 agent 会话做对照，或从宿主日志取 hook 级拒绝记录）。本 node 只能如实记录所见。

## 待父裁决

1. 「负向探针」的**通过判据**用哪一口径：(a) 「worker 内拿不到 `subagent` 能力」即算通过（本 node 证据充分）；还是 (b) 必须拿到 `permission.rejected` 原文才算通过（本 node 拿不到，需换 agent 形态另造）。
2. 是否需要把「catalog 过滤」这一现象补进 `docs/adr/ADR-plan-multi-session-collaboration.md` 的前置事实（当前 `:14` 只写了 primary agent 被拒，未写 subagent 会话侧是「未暴露」）—— 这是文档增补，超出本 node 写域，交父决定。

## STATUS: COMPLETE
