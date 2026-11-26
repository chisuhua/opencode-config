# TODO — n2 写隔离方案选型

- [x] 读齐 BRIEF 点名的仓内材料（两篇 ADR / delegate-core / MULTI-AGENT-DESIGN / 配置与测试实证）
- [x] 抽取「不变式四条」的可引用落点：scope 差集、delegate 单槽、PLAN_REF_ROOTS、单一写者
- [x] 写候选 A：linked worktree 隔离（机制 / 粒度 / 四条不变式 / 代价 / 失效模式）
- [x] 写候选 B：同工作树分支隔离
- [x] 写候选 C：目录/子树隔离
- [x] 写候选 D：不并行 + 上下文外置（对照项）+ 候选 E：独立 clone/独立进程
- [x] 出选项对比表（每行含结论 + 理由，含被否决项）
- [x] 出「最细粒度」一节，区分权限层强制与协议层约定
- [x] 写推荐 + 否决项 + 待父裁决，正文 ≥100 行且 ≥8 处 path:line
