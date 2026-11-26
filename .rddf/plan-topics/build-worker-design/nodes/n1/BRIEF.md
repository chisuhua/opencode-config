# BRIEF — n1：现有派发通道盘点

## 目标

测绘本仓**当前实际存在**的全部「把工作派给另一个会话」的通道，逐条给出它能做什么、不能做什么、依据在哪，并明确判定：

> **`build` 主会话是否存在并行实施通道？若不存在，这是能力缺口还是刻意设计？**

## 边界（明确不做）

- 不设计任何新机制（选型、判据、合并语义都属 n2–n7）。
- 不改任何实现代码、配置、ADR 正文。
- 不评价某条通道「好不好」，只测绘「是什么、能与不能」。

## 必读材料

| 路径 | 要取什么 |
|------|----------|
| `opencode.jsonc` | 顶层 `permission` 的五个 delegate 动作；**agent 级** `delegate` / `subagent` 权限矩阵（`build` / `front` / `plan` / `title` / `plan-worker` 各自） |
| `docs/adr/ADR-plan-delegate-engineering-session.md` | 决策 D1（派发主体）、D4（槽位全局单槽）、D7（plan 优先不抢占）；**「前置事实」②④⑤**；以及正文里那句关于「用 subagent 拉一个可写 agent」的裁决表述 |
| `docs/adr/ADR-plan-multi-session-collaboration.md` | D3（为何用宿主 `subagent` 而非新造通道）、D4（为何不把 `plan` 改成 `mode:"all"`）；「已知不可机判清单」 |
| `lib/delegate-core.ts` | 后端 agent 白名单；`PLAN_REF_ROOTS` 定义；`plan_ref` 校验 |
| `lib/delegate-async.ts` | 槽位 claim / 回收 / 归属门控的实现位置 |
| `plugins/subagent-contract.ts` | L1 派发前门挂在哪个钩子、当前 `mode` 与覆盖范围 |
| `scripts/agent-guard-rules.ts` | `GUARDED_AGENTS` 的语义与覆盖哪些 agent |
| `docs/MULTI-AGENT-DESIGN.md` | agent 拓扑与委派矩阵（谁可派谁） |
| `prompts/build.md` | 角色矩阵里 `builder` / `verifier` 的配对与写集 |

## 期望交付（`RESULT.md`）

1. **通道清单表**：每条通道一行，列为 `通道 | 机制 | 能做什么 | 不能做什么 | 权限依据(path:line) | 写隔离语义 | 并发语义`。
   至少覆盖：宿主 `subagent`、`delegate` 同步、`delegate` 异步 `dispatch`、`.rddf/plan-topics/**` 协作区、`rdd-builder` 的 worktree/branch 准备。
2. **可派矩阵**：谁可以派谁（含「权限可达 ≠ 流程有消费者」这类区分）。
3. **`build` 缺口的判定**：三条以上证据，每条带 `path:line`；并明确区分其中哪些是**能力缺口**、哪些是**上游/本仓刻意串行化的设计**（刻意串行化的要给出「刻意」的依据出处）。
4. **结论段**：明确回答「`build` 有无并行实施通道」，一句话，不含糊。
5. 至少 **8 处 `path:line` 引用**；正文 **≥ 100 行**。
6. 每条陈述标注类别：事实 / 推断 / 建议。

## 验收口径

- 「刻意设计」与「能力缺口」的区分必须引用**具体依据出处**，不能只凭印象。
- 通道清单至少 5 条通道、至少 12 个字段有实质内容，不留「同上」。
- 对 `build` 的结论必须是可判定的布尔陈述，不得写「基本没有」「基本可以」。
- 若某条通道的语义在本仓找不到依据（例如上游行为），**如实标注「上游语义（未在本仓核实）」**，不得编造 `path:line`。
