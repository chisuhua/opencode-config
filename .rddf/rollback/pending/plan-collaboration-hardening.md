# 债指针 — plan-collaboration-hardening

> `unmanifested` 的逐机制欠账说明（`ADR-plan-collaboration-hardening` 已 Proposed，
> 机制**尚未落地** ⇒ 清单待写）。清账路径：六批全部落地并演练 ⇒ 写
> `.rddf/rollback/plan-collaboration-hardening.json` ⇒ 删本文件 + 条目转 `active`。

## 为什么还没写

机制**一行都还没落**（P0–P5 未实施）。先写清单会把「不存在的路径」写进 `delete[]`，
制造永久红（同 `ADR-plan-synthesis-offload` D7 的「清单不得早于实现」约束）。⇒ 登记为
`unmanifested`，用本债指针记录**将覆盖的落点**，实施完成后再写清单。

## 清单要覆盖的落点（六批）

| 批 | 落点 | 回退动作 |
|---|---|---|
| **P0** | `.rddf/rollback/registry.json` 条目、本债指针 | 删条目 + 删本文件（回到无条目态） |
| **P1** | `~/.config/opencode/plan-models.json`、`scripts/plan-models-check.sh`、`prompts/plan.md:305-308`、`.rddf/config/governance-paths.json` 的 `plan-models.json` 条目 | 删两个新文件 + 还原 prompt 段（含硬编码模型 ID 与「先查 models 工具」原文）+ 撤清单条目 |
| **P2** | `prompts/plan.md`（结算记录义务 + grandfather 例外句）、`lib/plan-topics.ts`（两码 + 闭集 + **`SETTLEMENT_CRITERIA_SINCE` / `isSettledBeforeCriteria`**）、`scripts/plan-topic-check.ts`、`tests/plan-topics.test.ts`、`tests/plan-topics-settlement.test.ts`、`plan-topics-topic-model.md` §4/§5 | 撤两码与闭集条目 + 撤 grandfather 常量/helper 与例外句 + 还原 prompt 段 + 还原文档段 + 撤测试用例 |
| **P3** | `prompts/plan.md`（TOPIC 模板三节）、`topic_goal_unreviewed`、`plan-topics-topic-model.md` §10 `:138` | 撤码 + 还原 `:138` 原文（「不存在本轮目标集合载体」）+ 撤 prompt 段 |
| **P4** | `scripts/plan-topic-check.ts`（`add` 子命令）、`prompts/plan.md`（追问分流）、`plan-topics-topic-model.md` §5 命令面 | 删 `add` 分支 + 还原命令表 + 还原 prompt 段 |
| **P5** | `prompts/plan-worker.md`（token/证据链纪律）、`prompts/plan.md`（合成 BRIEF 第 4 条）、`scripts/plan-synthesis-check.ts`（V6 三码）、`tests/plan-synthesis.test.ts` | 撤三码 + 还原两处 prompt + 撤测试 |

## 锚点（判据回绿的最小命令）

```bash
bun scripts/rollback-registry.ts                                   # M1–M9 / V1–V16
bun test tests/plan-topics*.test.ts tests/plan-synthesis.test.ts tests/config-guards.test.ts
openspec validate plan-collaboration-hardening                      # 需 .openspec.yaml(skip_specs)
```

## 为什么 `unmanifested` 而不是别的态

- `declared` 要求 `watch[]` 的路径**尚不存在** ⇒ 本机制 watch 全是已存在文件（`prompts/plan.md` 等）⇒ 不可用。
- `proving` / `active` 需要**清单**（+ `active` 还需演练证据 `last_drill`）⇒ 机制未落地，过早。

## 关联

- 决策：`docs/adr/ADR-plan-collaboration-hardening.md`（Proposed；oracle 1 轮 + critic 2 轮 APPROVE）
- 立项：`.rddf/improvements/plan-collaboration-hardening.md`、`openspec/changes/plan-collaboration-hardening/`

## 已知悉（2026-11-27，P1 治理面 oracle NOTE #4）

父篇 `ADR-plan-multi-session-collaboration.md:358-359` 的告诫「不要只改 prompt」在本批**部分适用**：
P1 只改 prompt 面 + 新增配置文件（`plan-models.json` / `plan-models-check.sh`），**未**机械化 `claim`→`spawn`
的补偿动作（`abandon-spawn` / `claim --spawn` 原子回滚）。该机械化仍归父篇**残留 #18**，不在本 change
实施；本债指针显式登记以免「prompt 改了但机制没跟上」被读成已闭合。

## 已知失配（2026-11-27，P1 造成的清单漂移 —— 待有 commit 后刷新）

`plan-synthesis-offload` 清单的 `edits[0].find` 钉住了 `prompts/plan.md` **P1 之前的**合成派发段全文
（含 `minimax-cn/MiniMax-M3.1-Flash` 与「先查 `models` 工具」）。P1 改写该段后 **find 必然失配**
⇒ 若现在触发 plan-synthesis-offload 的回滚/演练，那条 edit 会响亮失败（不会静默改错）。

**为什么没在同一批修**：刷新 find 需要「先 commit（drill 用 `git clone`，看不到未提交改动）→ 重跑
`bun scripts/rollback-drill.ts .rddf/rollback/plan-synthesis-offload.json` → 回填 `last_drill`（含 `content_hash`）」。
本批尚未提交（用户流程未要求 commit），故按「登记债、不留静默漂移」处置 ⇒ registry 判据保持绿。

**刷新配方**（有 commit 后照做）：
1. `find` 取 `prompts/plan.md` 中从 `#### 合成节点（可选` 到 `\n## 计划文件输出` 之前的全文 + 1 个 `\n`（实测 `count == 1`）；
2. `edits[1].find` 需把 P5 新增的「BRIEF 若要求结论级证据链」那条并进去（回滚时一并删）；
3. 重跑 drill 并回填 `last_drill{sha,at,result,content_hash}`。

## 失配归因补充（2026-11-27，P2–P5）

上述 `edits[0].find` 失配**不只由 P1 造成**：P2–P5 又改写了同一区间（`prompts/plan.md` 的合成节点段：
结算记录 + 合成 BRIEF 第 5 条 + V6 措辞），且 `edits[1].find`（`prompts/plan-worker.md`）同样被改写。
刷新配方不变：find = 当前文件里「`#### 合成节点（可选` → `\n## 计划文件输出` 之前」全文（`count == 1`），
`edits[1].find` = 从「严重度标注必须带稳定 token」那条到「4. **做完就停**」之前的全文。

## 回滚债已闭合：两条相邻机制恢复演练证据（2026-11-27）

前述两条债已按「清单补齐 → 演练 → 回填」闭合（提交 `1edc020` 起）：

| 清单 | 修法 | 结果 |
|---|---|---|
| `plan-topics.json` | 补 4 条 `delete`（本 change 新增的 3 个测试 + `tests/plan-synthesis.test.ts`，回滚后都会 import 已删模块）+ 同批撤「合成节点段」（offload 所有；不撤则孤儿段把 `RESULT`/`BRIEF` token 泄进上一个 `###` 小节 ⇒ config-guards AC7 红） | drill **PASS**（`1edc020`）⇒ `last_drill` 已回填、转 `active` |
| `plan-synthesis-offload.json` | 支撑「回滚删 `scripts/plan-synthesis-check.ts`」⇒ registry 侧把本机制 `watch[]` 收窄到 `prompts/plan.md`（其余锚点随基础机制回滚消失，登记即触发 M7）；offload 自身 `watch` 去掉它回滚会删的测试文件 | drill **PASS**（`1edc020`）⇒ 回填、转 `active` |

**遗留（本机制自己的清单仍缺）**：`plan-collaboration-hardening` 仍是 `unmanifested`（债指针=本文件）；写清单时须把 `watch[]` 补全为 `prompts/plan.md` / `prompts/plan-worker.md` / `scripts/plan-topic-check.ts` / `scripts/plan-synthesis-check.ts` / `lib/plan-topics.ts`，并按本 change 的批序写 `delete` / `edits`。
