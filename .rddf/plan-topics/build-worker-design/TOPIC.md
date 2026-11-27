# build-worker-design — 主题

## 目标

回答一个真实的待定设计问题：

> **`build` 主会话目前没有任何派发工程后端的通道**（顶层 `permission` 对五个 delegate 动作全 `deny`；agent 级只有 `front` 与 `plan` 有 `delegate: allow`；`build` 没有）。
> 大型改造因此只能由单一 `build` 会话串行完成 —— 上下文压力与墙钟时间都随改动规模线性增长。
>
> 是否应当引入一个 **`build-worker`** 子会话形态（借鉴 `plan-worker` 的思路），让 `build` 具备**多批次 / 多 wave** 的并行实施能力？若要引入，形态如何？

本 topic **只产离线讨论稿**。正式 ADR 由 architect 角色在后续流程中另行产出（`.rddf/plan-topics/**` 不在 `PLAN_REF_ROOTS` 内 ⇒ 本目录产物不可直接派工程实施）。

## 全局约束（所有节点共同遵守）

1. **只读本仓与已安装的上游**；不改任何实现代码、不改配置、不改 ADR 正文。
2. **每条事实断言必须带 `path:line` 引用**（本仓文件）或明确标注「上游语义（未在本仓核实）」。
3. **明确区分**「现状事实（可引用）」/「推断」/「建议」三类陈述，不得混写。
4. **不可机判的事要如实标注为不可机判**，不得伪装成有闸门。
5. 每个节点的 `RESULT.md` 正文 **≥ 100 行**，且必须给出**明确结论**（不是罗列可能性）。
6. 讨论稿形态对齐架构决策文档（ADR）的骨架：结论先行 → 选项对比 → 后果/代价 → 验证判据。

## 节点分解（父写，见 `graph.json`）

| id | 标题 | deps | owner |
|----|------|------|-------|
| n1 | 现有派发通道盘点 | — | child |
| n2 | 写隔离方案选型 | — | child |
| n3 | 合并与冲突语义 | n2 | child |
| n4 | 判据面设计 | n2, n3 | child |
| n5 | 与 delegate 全局单槽的关系 | n1, n2 | **parent** |
| n6 | 与 rdd-builder P2 worktree 模式的关系 | n1 | child |
| n7 | 失败模式与回滚可达性 | n3, n4 | child |

## 预期产出

- 一份可供 architect 消费的**讨论稿合集**（各节点 `RESULT.md`）。
- 一个**明确结论**：`build-worker` 该不该做、若做取哪种形态、以及在什么条件下应当否决。
- 一份**对 `plan` / `plan-worker` 既有机制的反哺清单**（在 n4 / n5 / n7 中登记）。

## 结算记录

```yaml
checked_at: 2026-11-27T09:30:00Z
synthesis_check_exit: 1
blocking: [synth_brief_no_ruling_set]
answer_node: m2
action: accept-with-gap
gap_reason: 合成与结算发生在判据生效日（2026-11-27）之前（m2 闭合于 2026-11-26T13:04:24Z）⇒ 按 D4 grandfather 不再重做；synth_brief_no_ruling_set（合成 BRIEF 缺 `## 根裁决集`，该字段在 `ADR-plan-synthesis-offload` D4 审查后补，本 topic 的 BRIEF 写在其之前）为历史产物，未修。
model_resolution: none
model_id: unknown（2026-11-26 合成，早于 plan-models.json 与 model 留痕）
note: --strict-token 口径另报 synth_token_missing（n3/n7）×2 与 synth_conclusion_no_chain（V6 三码，判据生效后新增面）；本记录按默认口径记 exit 与 blocking
```
