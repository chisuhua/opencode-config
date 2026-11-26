# TODO — n3：合并与冲突语义

- [x] 读 `nodes/n2/RESULT.md`，确认隔离选型（A/B/C/D/E）并锁定本节点的消费分支
- [x] 读 `docs/adr/ADR-plan-delegate-engineering-session.md`（D1/D2/D4/D5/D7），取出 `owner_agent`、归属门控、单槽论证
- [x] 读 `lib/delegate-core.ts` 的 `scope` → edit 规则、`git status` 差集与越界判定，确认「合并时能机判什么」
- [x] 读 `docs/adr/ADR-plan-multi-session-collaboration.md` D9/D10/D11，取事务范式、短锁与硬超时口径
- [x] 读 `.rddf/rollback/README.md` + `registry.json`，把合并设计落到「回滚可达性」口径
- [x] 读 commit-gate 面（`docs/adr/ADR-commit-verification-gate.md`、`lib/commit-gate.ts`、`.rddf/commit-gate.json`、`plugins/role-gate.ts`），确认 `git merge` 是否被门控
- [x] 定合并模型：谁合 / 何时合 / 合到哪 / 合几次 / 幂等性
- [x] 写冲突分类表（≥4 类，每类「可机判 / 需人判」明确标注，含基线漂移单列）
- [x] 写「不可机判清单」+ 兜底，对齐 ADR 体例
- [x] 写与 D9/D10 事务范式的关系（锁粒度 + 超时 + 为什么不在锁内跑 verify）
- [x] 写「合并产物入 git」的理由与反例
- [x] 写回滚可达性映射（wave 前 reset / 合入后 revert -m 1 / 机制退役清单）
- [x] 自检：≥8 处 `path:line`（实得 50 处唯一引用）、正文 ≥100 行（实得 344 行）、结论先行、末行 STATUS 哨兵
