# TODO — n4（判据面设计）

- [x] 读 `BRIEF.md` / `TOPIC.md`，确认边界（只设计判据，不写实现、不重复 n3 冲突分类）
- [x] 读前置 `nodes/n2/RESULT.md`（worktree 隔离 + 强制等级上限）与 `nodes/n3/RESULT.md`（合并语义 + 6 类冲突 + 两个薄弱点）
- [x] 读判据库范式：`lib/plan-topics.ts`（派生/闭集/两维/INFO_CODES）
- [x] 读 CLI 命令面与退出码：`scripts/plan-topic-check.ts`
- [x] 读 `docs/architecture/plan-topics-topic-model.md` §4/§6/§9/§10 与两篇 ADR（D2/D10/D11；停机证据/scope 差集/D4）
- [x] 读测试形态（负向 fixture；含 4 处「钉住缺陷」用例 `tests/plan-topics-dag.test.ts:374-416`）
- [x] 核验四处反哺证据：`owner` 零消费 / `.lock` 无写入点 / `scope-check` 单节点 / `baseline` 死字段
- [x] 产出判据清单（7 组 36 条，含阶段 / 严重度 / 可机判三列）
- [x] 产出违规码候选表（35 个候选码 + 4 个共享语义码说明 + 1 个跨域同名警戒）
- [x] 定退出码口径（沿用四值）与收敛信号（`converged` 调度信号 + `landed` 事实投影）
- [x] 产出反哺清单（6 条可复用 + 9 条缺陷，每条四要素）
- [x] 自检：正文 ≥100 行 / `path:line` 引用 ≥8 / info 级 ≥2 / 反哺 ≥4
