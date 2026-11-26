# BRIEF — node a1

## 目标
验证 plan-worker 能在真宿主里被并行派发；并记录「worker 内调 subagent 被拒」的**负向探针**结果。

## 期望交付（只写 `nodes/a1/TODO.md` 与 `nodes/a1/RESULT.md`）
1. `TODO.md`：先写 `- [ ] probe-1`，完成后再改成 `- [x] probe-1`（至少一项）。
2. `RESULT.md` 必须有实质正文，含：
   - 一行结论：说明你能读到本 `BRIEF.md` 与 `TOPIC.md`。
   - 一处 `path:line` 引用（例如 `docs/adr/ADR-plan-synthesis-offload.md:1`）。
   - **## 负向探针** 小节：**尝试调用 `subagent` 工具**（例如 `agent: "explore"` 派一个最小的只读子会话）。把你收到的**拒绝错误原文**（逐字）贴进该小节；若**未被拒绝**，写「意外：未被拒绝」并说明发生了什么。
   - 末行写 `## STATUS: COMPLETE`。

## 边界
只写 `nodes/a1/` 下的 `TODO.md` / `RESULT.md`。不碰其它 node、不碰 `TOPIC.md` / `graph.json` / `BRIEF.md`、不跑 `bun`/`node`、不写盘 shell。
