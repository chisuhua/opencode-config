# plan-topics V12 —— fork-join 运行时取证（2026-11-27）

> 目的：执行 `ADR-plan-multi-session-collaboration` 的 **V12**（真宿主 fork-join），此前该判据标注「人工」且**从未执行**。
> 执行者角色：builder（根会话 `ses_de7908654ffeSbqmduJukt5pYT`）。证据载具：`.rddf/plan-topics/v12-probe/`（入 git）。

## 结论

- **V12 ①–⑥ 全部通过**（真宿主；⑥ 由**另开的新根会话** `ses_de64c417dffeXNNqB77l8AehIT` 验证）。
- **负向探针通过**（worker 内拿不到 `subagent` 能力），但**证据形态与预期不同** ⇒ 新增一条前置事实更正（见 §4）。

## 1. 环境

| 项 | 值 |
|---|---|
| 根会话 | `ses_de7908654ffeSbqmduJukt5pYT` |
| 子 a1 | `ses_de754e19bffeAzkKmYT6eP5ztj`（agent=`plan-worker`，model=`opencode-go/deepseek-v4.1-flash`） |
| 子 a2 | `ses_de754e18fffeEXG38C3JeyES4t`（同上） |
| topic | `.rddf/plan-topics/v12-probe/`（2 个**无依赖**节点，用于验证同轮并行） |
| 派发方式 | 同一轮两次 `subagent(agent="plan-worker")`（先 `claim` 后 spawn） |

## 2. 逐项证据

| V12 子项 | 判定 | 证据 |
|---|---|---|
| ① 同轮并行派发 | ✅ | `graph.json` 两条 attempt 的 `started_at` = `16:23:05.466Z`（a1）/ `16:23:05.523Z`（a2），相差 **57 ms**，同一轮两次派发 |
| ② `parent_id` == 根会话 id | ✅ | `SELECT id,parent_id FROM session_v2`：两子的 `parent_id` 均 = `ses_de7908654ffeSbqmduJukt5pYT` |
| ③ 子内 `$OPENCODE_SESSION_ID` == 自身 id | ✅ | 续接 a2 后跑 `printf '%s\n' "$OPENCODE_SESSION_ID"` → `ses_de754e18fffeEXG38C3JeyES4t`（自身 id） |
| ④ 两条完成合成消息到达父 | ✅ | a1 / a2 的 `<background-result … state=completed>` **均收到** |
| ⑤ 同父续接 + 子能读自己的 `TODO.md` | ✅ | `subagent(sessionID=ses_de754e18…)` 续接成功，返回 `TODO.md` 逐字内容与 `RESULT.md` 末行 `## STATUS: COMPLETE` |
| ⑥ 新根拒续接旧子 | ✅ | 新根会话 `ses_de64c417dffeXNNqB77l8AehIT`（agent=build，`parent_id` 为空 ⇒ 真根）调 `subagent(agent="plan-worker", sessionID="ses_de754e18fffeEXG38C3JeyES4t")` ⇒ **拒**：`Session ses_de754e18fffeEXG38C3JeyES4t is not a child of the current session`（`error.type=tool.execution`）；**未 spawn 任何子会话**、工作树无副作用 |

**机制侧收尾**：两节点 `close` 后 `check --phase final` → `ok=true`、**`converged=true`**、`done=['a1','a2']`、`in_flight=[]`、`blocking=[]`、`needs_review=[]`。

## 3. 负向探针（AC4 的运行时证据）

a1 在同一会话内发起 **3 次**不同入参形态的 `subagent` 调用，全部被拒，错误原文一致：

```
Error: Unknown tool 'subagent'. Did you mean tools.opencode.session.interrupt?
```

补充：`search({query:"subagent"})` 在工具目录**0 命中本体**；`search({query:"spawn"})` / `search({query:"delegate"})` 均空列表。

⇒ **「worker 不可派生」在运行时成立**（比配置断言强：能力根本没有暴露）。

## 4. 新发现：两种拒绝路径并存（前置事实更正）

`ADR-plan-multi-session-collaboration:14` 前置事实 ① 只写「宿主 `subagent` 工具对 primary agent 直接拒绝」。本次探针发现 **subagent 会话侧是另一种形态**：

| 场景 | 拒绝形态 |
|---|---|
| `subagent` / `delegate*` 对 plan-worker | **catalog 过滤（工具根本未注册）** ⇒ `Unknown tool 'subagent'` |
| `shell` 对 plan-worker | **已暴露但被拒** ⇒ `permission.rejected: Permission denied: shell` |

⇒ **AC4 的判据措辞需明确**：若要求「拿到 `permission.rejected` 原文」则本形态**不满足**；若接受「worker 内拿不到该能力」（catalog 不暴露 or permission.rejected），则**成立**。

**建议**（登记为 backlog，父篇不在本次范围）：在父篇前置事实补一条「subagent 会话侧 = catalog 未暴露，与执行期 permission.rejected 是两条不同拒绝路径」。

## 5. V12⑥ 执行结果（新根会话）

- **执行者**：新根会话 `ses_de64c417dffeXNNqB77l8AehIT`（`session_v2.parent_id` 为空 ⇒ 真根；agent=`build`；角色自报 `general`）。
- **调用**：`subagent(agent="plan-worker", sessionID="ses_de754e18fffeEXG38C3JeyES4t", prompt=…)`（a2 的旧子会话）。
- **拒绝原文（逐字）**：

  ```
  Session ses_de754e18fffeEXG38C3JeyES4t is not a child of the current session
  ```
  （`error.type = tool.execution`）

- **语义吻合**：宿主校验 `existing.parentID === context.sessionID`；a2 的 `parentID` 是 `ses_de7908654ffeSbqmduJukt5pYT`，新根是 `ses_de64c417dffe…`，两者不等 ⇒ 拒。错误文本带 `child of the current session` 的父子语义，**不是**超时/配额/未知 agent 之类的伪失败。
- **副作用核查**：`session_v2` 中 `parent_id = ses_de64c417dffe…` 的子会话 **0 条**（未 spawn）；`git status` 与探针前一致；**未杀父进程**（避免引入「孤儿 worker 仍活」这个无关变量）。
- **结论**：**V12⑥ PASS**。⇒ 「换根必须按 node 重建、不能续接旧子」这一条在真宿主成立。

## 6. 遗留

| 项 | 状态 |
|---|---|
| 父篇前置事实补「catalog 过滤」 | 📋 backlog（architect 面） |
| `.rddf/plan-topics/v12-probe/` | 作为证据保留（入 git） |
| **V12 六子项** | ✅ **全部通过**（①–⑤ 本会话、⑥ 新根会话） |
