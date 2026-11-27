# TODO — n3：合并与冲突语义

- 执行者：plan-worker（`deepseek-v4.1-flash`）
- 起始：2026-11-27

- [x] 读 BRIEF / TOPIC / graph.json，确认 deps 与写域
- [x] 读 n2 `RESULT.md`（写隔离选型）并确认本文依据的分支
- [x] 读必读材料：两份 ADR（D5/D9/D10/D11）、`lib/delegate-core.ts` 差集段、`.rddf/rollback/*`
- [x] 核实「谁能执行 merge / commit」的权限面事实（`opencode.jsonc` 三个 agent 的 shell 块）
- [x] 定合并模型：谁合 / 何时合 / 合到哪 / 合几次 / 幂等键
- [x] 写冲突分类表（≥4 类，含跨文件依赖顺序与基线漂移单列）
- [x] 写「不可机判」清单（对齐 ADR 体例：项 / 为何不可判 / 兜底）
- [x] 写与 D9/D10 事务范式的关系（是否需要原子写、锁粒度、超时）
- [x] 写「合并产物必须入 git」的理由，并对接 `.rddf/rollback/` 口径
- [x] 自检：≥8 处 `path:line`、正文 ≥100 行、结论先行、每类冲突有可机判/需人判标注
- [x] 写 `RESULT.md` 并落 `## STATUS: COMPLETE`
