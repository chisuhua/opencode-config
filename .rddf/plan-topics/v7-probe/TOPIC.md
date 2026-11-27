# v7-probe — 主题

## 目标

回答一个真实的待定设计问题（`build-worker-design` 的复刻探针）：

> **`build` 主会话目前没有任何派发工程后端的通道**。是否应当引入一个 **`build-worker`** 子会话形态（借鉴 `plan-worker`），让 `build` 具备**多批次 / 多 wave** 的并行实施能力？若要引入，形态如何？

本 topic 是 **V7 探针的产物**：只产离线讨论稿，**不可直接派工程实施**（`.rddf/plan-topics/**` 不在 `PLAN_REF_ROOTS` 内）。

## 全局约束（所有节点共同遵守）

1. **只读本仓与已安装的上游**；不改实现代码、不改配置、不改 ADR 正文。
2. 每条事实断言必须带 `path:line` 引用（本仓文件）或明确标注「上游语义（未在本仓核实）」。
3. 明确区分「现状事实（可引用）」/「推断」/「建议」三类陈述，不得混写。
4. 不可机判的事要如实标注为不可机判，不得伪装成有闸门。
5. 每个节点的 `RESULT.md` 正文 **≥ 100 行**，并给出**明确结论**（不是罗列可能性）。

## 前提与证伪条件

- **前提 P1**：`build` 在 agent 级没有 `delegate: allow`（顶层 permission 对五个 delegate 动作全 `deny`）。
  - 证伪条件：`opencode.jsonc` 里 `build` 的 agent 块出现 `delegate: allow`，或顶层 permission 放行任一 delegate 动作。
  - 核验落点：n1（现有派发通道盘点）。
- **前提 P2**：delegate 的槽位键 = `workRoot`（「全局单槽」的实质是四件共用该键的机制）。
  - 证伪条件：`lib/delegate-async.ts` 的槽位键不是 `workRoot`（例如改成 topic / session 粒度）。
  - 核验落点：n5（与 delegate 全局单槽的关系）。
- **前提 P3**：合并语义可以只用 git 层表达（`--no-ff` + merge commit + 祖先判定），不需要自建状态机。
  - 证伪条件：存在无法用 git 层表达的合并语义（例如需要跨仓事务）。
  - 核验落点：n3 / n4。

## 非目标

- 不改 `lib/**` / `plugins/**` / `prompts/**` 任何一行（本 topic 只产讨论稿）。
- 不新增 agent、不改 `plan-worker` 权限模板。
- 不决定「是否真的立项」—— 立项由 architect + planner 在后续流程另行判断。
- 不评价 `ronud-builder` P2 的上游细节（skill 本体不在本仓，读取被拒）。

## 目标审查结论

- 2026-11-27 / 探针根会话：三条前提已逐条列出并指派核验节点（n1 / n5 / n3+n4）；截至本 topic 收尾，P1–P3 **均未被证伪**（详见各节点 `RESULT.md` 与合成稿 `nodes/m2/RESULT.md`）。
- 未做：目标「值不值得做」的价值判断（不可机判，见合成稿 §不声称的东西）。

## 结算记录

```yaml
checked_at: 2026-11-27T07:57:58Z
synthesis_check_exit: 0
blocking: none
answer_node: m4
action: supersede:m4
model_resolution: config
model_id: opencode-go/kimi-k3.1-pro#high
note: m2 因漏载 execute-skill-retired 被 m4 supersede；m3 漏 --deps 未派发即 cancel；m1/m2 留审计
```
