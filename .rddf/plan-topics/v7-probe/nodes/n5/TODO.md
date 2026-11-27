# TODO — n5：与 delegate 全局单槽的关系

- [x] 读输入契约 `BRIEF.md` / `TOPIC.md` / `graph.json`，确认 deps = n1、n2 已产出
- [x] 消费 n1（无受门控通道 + `general` shell 旁路）与 n2（worktree + delegate 承载）的结论作为约束
- [x] 核实 delegate ADR 的 D1 / D4 / D7 / D2 / D5 / D6 与残留 #4、#5、#6，以及 2026-11-20 退役订正
- [x] 核实 `lib/delegate-core.ts` 的槽位键、`ownerAgentOf`、`plan_ref` 条件、`classPermissions`、差集检测
- [x] 核实 `lib/delegate-async.ts` 的 `claimSlot`、全局并发上限、`sessions` owner 过滤、停机证据门控
- [x] 核实 `opencode.jsonc` 的 build / plan / front / plan-worker 权限矩阵
- [x] 写冲突点清单（≥4，覆盖槽位竞争 / owner 语义 / 停机证据 / scope 差集 / PLAN_REF_ROOTS）
- [x] 写三种处置（并存 / 替代 / 分槽）的改动面、新增不变式、失败面、与 ADR 冲突程度
- [x] 给出单一推荐 + 明确否决项（否决理由 + 出处）
- [x] 给出「替代」的前置条件清单（`plan_ref` / build 是否产出计划 / owner 枚举 / 同批 deny）
- [x] 写对既有 ADR 的影响面（点名 D1/D2/D4/D5/D7/D8 与残留编号）
- [x] 自检：≥8 处 `path:line`、正文 ≥100 行、结论先行、单一推荐
