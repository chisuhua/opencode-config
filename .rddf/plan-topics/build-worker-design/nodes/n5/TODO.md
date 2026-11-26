# TODO — n5：与 delegate 全局单槽的关系

- [x] 读输入契约（BRIEF / TOPIC）与前置输入（n1、n2 的 RESULT）
- [x] 读 ADR-plan-delegate-engineering-session（D1 / D2 / D4 / D5 / D7 / 选项表 / 已排除项）
- [x] 读 ADR-plan-multi-session-collaboration（D3 拒自造通道 / D4 可派者集合 / 前置事实⑤）
- [x] 读 lib/delegate-async.ts 的 planSlot / claimSlot / 租约 / 归属拒绝点
- [x] 读 lib/delegate-core.ts 的 slotOccupants / ownerAgentOf / classPermissions / PLAN_REF_ROOTS / 差集
- [x] 核实「单槽实际是四件耦合机制」：槽位表 + 角色租约 + 停机守卫 + 差集基准（含 role-lease / role-gate 侧证据）
- [x] 核实「后端递归」通道：classPermissions 无 delegate 规则 + session 规则排在 agent 规则之后
- [x] 写冲突点清单（≥5 类，含 BRIEF 点名的 5 项）
- [x] 写三种处置评估（并存 / 替代 / 分槽，各含改动面 / 新增不变式 / 失败面 / ADR 冲突程度）
- [x] 写单一推荐 + 明确否决项（含否决依据）
- [x] 写「替代」的前置条件清单（含 plan_ref 与 build 是否产出计划）
- [x] 写对既有 ADR 的影响面（点名 D1/D2/D4/D5/D7 与 redesign D6）
- [x] 写反哺清单（plan / plan-worker）与待父裁决
- [x] 自检：≥8 处 path:line、正文 ≥100 行、结论先行、末行 STATUS
