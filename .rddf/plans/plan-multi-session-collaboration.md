# plan-multi-session-collaboration — TDD 实施计划（builder 产出）

> 输入：`openspec/changes/plan-multi-session-collaboration/{proposal.md,design.md,tasks.md}` + `.rddf/roadmap/plan-multi-session-collaboration.md`
> 决策：`docs/adr/ADR-plan-multi-session-collaboration.md`（Accepted 2026-11-20）

## 目标

让多个 plan 会话并行协作：`.rddf/plan-topics/<slug>/` 三对象（TOPIC / graph.json / nodes）+ 派生状态 + 宿主 `subagent` 父子会话 + 窄权限 `plan-worker`，判据全部可机判（落在 `bun test tests/`）。

## 背景与动机

见 ADR / proposal 的 Why：delegate 单槽不能并行、单会话多线程撑爆父上下文。

## 设计方案（已定，不在本文件重开）

- D1–D8 见 ADR；数据契约见 `design.md` §1–§3。
- 关键取舍：`progress`（磁盘派生）与 `status`（门控）**正交**——子先干完而依赖未完成是合法状态；这一条是 metis gap 分析抓出的 P0（原设计两者互斥会误报）。

## 实施步骤（TDD 5 步，每步 2–5 分钟）

1. **红**：`tests/plan-topics.test.ts` 写 A0.1 schema 负向 → 跑 ⇒ 红
2. **绿**：`lib/plan-topics.ts` 实现 `parseGraph` / `assertSchema` → 绿
3. **红→绿**：块 A（node id / 重复 id / DAG / progress / status / 缓存 / brief / 孤儿 / 空 topic）逐条红绿
4. **红→绿**：块 B CLI（退出码四值 / `--json` / `scope-check` fixture 仓 / `lock`）
5. **红→绿**：块 C 配置（`plan-worker` 形态 / `GUARDED_AGENTS` / 可派者闭集 / EXPECTED 清单 / plan 的 edit + capability 块）
6. **写**：块 D prompt（`plan-worker.md` 首行含 id；`plan.md` 协作段）
7. **红→绿**：块 E `.gitignore` 双向 + node id 反向守卫
8. **写+验**：块 F 7 条锚点（`RESULT: OK`）
9. **写**：块 G 文档投影
10. **验**：块 H 全量回归 + ADR 回填 + 归档前置
11. **人工**：块 I e2e 九探针

## 验收标准

以 `openspec/changes/plan-multi-session-collaboration/proposal.md` 的「验收标准」表 AC1–AC18 为唯一源。最小集合：

- [ ] AC1 `bun test tests/` 0 fail
- [ ] AC2 anchors `RESULT: OK` 且 N ≥ 23
- [ ] AC3–AC5 `plan-worker` 形态 / 可派者集合 / GUARDED_AGENTS
- [ ] AC6–AC8 EXPECTED 清单 / capability 块 / plan edit 顺序
- [ ] AC9 `.gitignore` 双向 + node id 反向
- [ ] AC10–AC13 checker 全部负向 fixture / CLI 退出码 / scope-check / lock
- [ ] AC14 既有口径零回归
- [ ] AC15–AC17 人工 e2e（主会话执行、用户终裁）
- [ ] AC18 归档前置（verifier verdict == pass）

## 风险与回滚

| 风险 | 处置 |
|---|---|
| 上游语义漂移 | 7 锚点 + `grep -q "RESULT: OK"` |
| `plan-worker` 提权 | 三 deny + 可派者闭集 + 无 bun/node |
| 单写者被破坏 | `brief_sha256` + 重复 id + 孤儿 + scope 基线 |
| 锁死锁 | 全 done ⇒ `rmdir` |
| 误提交既有残留 | 逐文件 stage（`cli.json` / `opencode.jsonc.opencode-go` 的 metis 模型改动与本篇无关） |

**回滚**：移除 `plan-worker` + plan 两条 edit 放行 → 删 `prompts/plan-worker.md` + 撤 `EXPECTED.prompts` → 保留 `.rddf/plan-topics/**`。

## 引用

- ADR：`docs/adr/ADR-plan-multi-session-collaboration.md`
- 设计：`openspec/changes/plan-multi-session-collaboration/design.md`
- 路线图：`.rddf/roadmap/plan-multi-session-collaboration.md`
- metis gap 分析：本轮 subagent 输出（P0 六条已全部落地：done 语义拆分 / schema / 锚点判据 / V02b fail-open / scope 基线 / e2e 分类）
