# BRIEF — node a2

## 目标
作为 **a1 的并行兄弟**，验证「同一轮双派发」两个 worker 都成功。

## 期望交付（只写 `nodes/a2/TODO.md` 与 `nodes/a2/RESULT.md`）
1. `TODO.md`：先写 `- [ ] probe-2`，完成后再改成 `- [x] probe-2`（至少一项）。
2. `RESULT.md` 必须有实质正文，含：
   - 一行结论：说明你能读到本 `BRIEF.md` 与 `TOPIC.md`。
   - 一处 `path:line` 引用（例如 `docs/adr/ADR-plan-synthesis-offload.md:1`）。
   - 末行写 `## STATUS: COMPLETE`。

## 边界
只写 `nodes/a2/` 下的 `TODO.md` / `RESULT.md`。不碰其它 node、不碰 `TOPIC.md` / `graph.json` / `BRIEF.md`、不跑 `bun`/`node`、不写盘 shell。
