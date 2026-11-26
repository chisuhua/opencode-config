# TODO — n7：失败模式与回滚可达性

- [x] 读 n3 / n4 的 RESULT（前置输入），钉死本节点只消费哪一层（冲突失败面 / 判据面）
- [x] 读 ADR-plan-multi-session-collaboration（D10 / 已知不可机判 / 残留 / 实施记录）与 ADR-plan-delegate-engineering-session（D7 停机证据与亡主接管）
- [x] 读 `.rddf/rollback/README.md` + `.rddf/rollback/plan-topics.json`（清单体例、`find` 恰好 1 次、`replace` 也钉死、retire[]）
- [x] 读 `docs/architecture/plan-topics-topic-model.md` §10（已知边界写法）
- [x] 核代码落点：`scripts/plan-topic-check.ts`（lock 只读 / claim / close / reap）、`lib/plan-topics.ts`（owner 字段）、`lib/subagent-contract-core.ts`（L1 门只校 prompt）、`plugins/role-gate.ts`（探针恒真）
- [x] 产出失败模式表（10 条，覆盖 BRIEF 点名七类 + 双方值标注 + 三分统计）
- [x] 产出回滚路径三步式（动作 + 落点 + 可验证判据）+ 保留/清理清单
- [x] 产出回滚条目草案（`edits[]` / `notes` / `retire[]`）+ 6 处逐字节钉死清单与原因
- [x] 产出反哺清单第二部分（7 条，现象 | 依据 path:line | 建议动作）
- [x] 自检：≥8 处 `path:line`（实测 60+）、正文 390+ 行、末行 `## STATUS: COMPLETE`
