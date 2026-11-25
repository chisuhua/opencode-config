# improvement: improvement-pool-status-frontmatter — 改进池状态机读化（`rddf status` 的待办池不再混着已完成的事）

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：`.rddf/reviews/test-completeness-debt-e2e-audit-2026-11-25.md` §2.1（测试完备性 / 债务审计）+ 本机实测 `rddf status`。
> 关联：**尚未立项**（`backlog: improvement-pool-status-frontmatter`）。
> 路线图：`.rddf/roadmap/test-debt-e2e-followup.md` 任务 **A2**（并合并 A5③）。
> 关联 improvement：`rddf-status-improvement-status-mismatch`（**跨仓**，修产品侧 `_lib/dashboard/improvement_status.py`）—— 本条是**本仓侧止血**，**不依赖**那条；两者可并行。
> ⚠ **实施归属 planner**（落点 `.rddf/improvements/**` ⇒ 在 planner 写集内 ⇒ planner 可自办；**不改**任何治理面文件）。

## Why

本仓有 **32 份**改进提案（`.rddf/improvements/*.md`），其中 **25 份指向已归档的 change** ⇒ 池里 **25/32 是已完成的事**。可它们在 `rddf status` 里长这样：

```
📋 Improvement proposals
   Total pending: 10
NAME                                         PRI    STATUS       PHASE
adr-front-knowledge-librarian-whitelist-anno -      待讨论          -
cross-repo-check-trigger-in-agent-checklist  -      待讨论          -
delegate-base-resolved-return                -      待讨论          -
delegation-matrix-fill-semantics             -      待讨论          -
front-agent-redesign                         -      待讨论          -
rdd-verifier-state-consolidation             -      待讨论          -
rddf-status-improvement-status-mismatch      -      待讨论          -
role-matrix-allow-deny-guard-design          -      待讨论          -
role-write-set-machine-block                 -      待讨论          -
rollback-drill-replace-pattern               -      待讨论          -
```

⇒ **10 条待办里 6 条其实已完成**（真正待办只有 `delegation-matrix-fill-semantics` / `front-agent-redesign` / `rddf-status-improvement-status-mismatch` / `role-matrix-allow-deny-guard-design` 4 条）；STATUS 列**全**是兜底标签「待讨论」、PRI 列**全**是 `-`。

根因不在「忘了标状态」，而在**状态没有机读入口**：产品侧 `_lib/dashboard/__init__.py::collect_pending()` 判「已归档 ⇒ 不是待办」只有**两条**通路 ——

1. **同名短路**：improvement 文件名命中 `openspec/changes/archive/<date>-<name>/` 的 `<name>`；
2. **front-matter `状态` 字段**：`read_improvement_entries` 归一 `status`/`状态`（另有 `priority`/`优先级`、`phase`/`阶段`、`category`/`分类`、`source`/`来源`），`classify_improvement_status()` 按**前导标记**分类（`已归档`/`已完成`/`已实施`/`archived`/`implemented`… ⇒ terminal ⇒ 不进 pending；**空 ⇒ 兜底「待讨论」**）。

本仓**两条都不成立**：

- ① **名字对不上**：`adr-front-knowledge-librarian-whitelist-annotation` ↔ `2026-11-23-librarian-delegate-contradiction`；`delegate-base-resolved-return` ↔ `2026-11-19-delegate-base-channel`；`cross-repo-check-trigger-in-agent-checklist` ↔ `2026-11-16-cross-repo-workspace-check`；`rdd-verifier-state-consolidation` ↔ `2026-11-14-consolidate-verifier-state` —— improvement 名与 change 名**本就允许不同**，同名短路只是「恰好命中」。
- ② **字段为空**：`grep -l "^状态:" .rddf/improvements/*.md` ⇒ **0**（7 份文件有 YAML frontmatter，但只含 `feedback_status`）。

⇒ 结果：**已完成的事留在待办池**，而真正待办的事被淹没在兜底标签里。上一轮清账（commit `81131e8`）是**手工逐条改散文状态行**，一次清了 8 条 ⇒ **清得掉，但清不彻底、也不可重复** —— 下一批新增的提案又落回同样状态，且清账这件事在 commit body 里留了一条**永久残留**（feedback 条目的 `resolution` 字段仍为 `open`，因为 `rddf feedback` CLI 没有 resolve 子命令 ⇒ 无 single-writer 途径）。

⚠ **一条方法论警告（本条自己踩过的坑，必须写进判据）**：「improvement 指向了已归档的 change ⇒ 它已完成」这个推断**不成立**。逐条核对 10 条 pending 的 Acceptance 后得到**三个反例**：

| improvement | 表面证据 | 实际 | 核法 |
|---|---|---|---|
| `adr-front-knowledge-librarian-whitelist-annotation` | 关联 change 已归档 | ❌ **未完成**：AC 要求「ADR 元数据表有一条 2026-11-23 增补记录」⇒ `docs/adr/ADR-front-knowledge-capability.md` **无 2026-11-23**；AC 要求「D2 `:69` 不再声称 librarian 的 subagent 是字符串 deny」⇒ `:69` **仍写**「深度 2 链由 D3 的 `librarian.subagent: deny` 封死」 | 核 Acceptance 的**每一条** |
| `cross-repo-check-trigger-in-agent-checklist` | 关联 change 已归档 | ❌ **未完成**：它的内容是「在 `prompts/build.md` 自查清单加一行跨仓核对纪律」⇒ `grep -n "cross-repo-check" prompts/build.md` ⇒ **0 命中** ⇒ 那行**根本没落地** | 核**产物是否在盘上** |
| `delegate-base-resolved-return` | 来源 change 已归档 | ❌ **未完成**：头部自陈「**待 planner 审查**（metis 1 轮）后方可立项」⇒ 连自己的 change 都没有 | 核头部状态自陈 |

⇒ 所以本条**不做**「按 change 指针批量标已完成」这种省事做法（那会把 3 个真待办**误标成已完成 ⇒ 债从视野里消失**）⇒ **逐条核 Acceptance / 核产物在盘上**，核完才落 front-matter。

本条要做的是：**把状态从散文搬进机读字段**，让「已完成」这件事**可判**，而不依赖人工逐条清理。

## What Changes

1. **逐条核完 10 条 pending，再落 front-matter**（各 3 行，`---` 包裹，置于文件最前）—— **核法 = 核该条的 Acceptance / 核它的产物是否在盘上**，**不是**看 change 指针（见 Why 的三个反例）：

   | 文件 | 核对结论 | `status` | `priority` |
   |---|---|---|---|
   | `rdd-verifier-state-consolidation.md` | ✅ 已完成（`prompts/build.md:373` 「2026-11-14 起已收拢」+ `:375` 退役依据 = 产品侧 change `consolidate-verifier-state`） | `已归档（2026-11-14）` | `P2` |
   | `role-write-set-machine-block.md` | ✅ 已完成（`prompts/build.md:478-499` 六个机读块在位 + commit `5b5ec86`） | `已实施（2026-11-25）` | `P2` |
   | `rollback-drill-replace-pattern.md` | ✅ 已完成（自陈「已实施（2026-11-23）」+ `lib/rollback-drill.ts:450` 函数式 replace 在位） | `已实施（2026-11-23）` | `P3` |
   | `adr-front-knowledge-librarian-whitelist-annotation.md` | ❌ **未完成**（ADR 无 2026-11-23 增补记录；`:69` 仍写 `librarian.subagent: deny`） | `未立项` | `P3` |
   | `cross-repo-check-trigger-in-agent-checklist.md` | ❌ **未完成**（`prompts/build.md` 无该纪律行） | `未立项` | `P2` |
   | `delegate-base-resolved-return.md` | ❌ **未完成**（待 planner 审查，未立项） | `待审查` | `P2` |
   | `delegation-matrix-fill-semantics.md` | ❌ 未立项 | `未立项` | `P2` |
   | `front-agent-redesign.md` | ❌ 部分闭合（3 条未实测判据 AC14/AC15/AC17） | `部分闭合` | `P1` |
   | `rddf-status-improvement-status-mismatch.md` | ❌ 未立项（跨仓） | `未立项` | `P2` |
   | `role-matrix-allow-deny-guard-design.md` | ❌ 设计草案（明写「先设计，不硬上弱断言」） | `规划输入` | `P3` |

   ⇒ **净效果：pending 10 → 7**（3 条已完成项移出）+ 7 条真待办的 STATUS 列**不再是兜底「待讨论」**、PRI 列**不再是 `-`**。
   ⚠ **`status` 的前导词必须命中产品侧词表**：terminal 词表 = `已归档` / `已完成` / `已实施` / `archived` / `implemented` / `completed` …；非 terminal 词表 = `未立项` / `待立项` / `已立项` / `待审查` / `待回填` / `已推迟` / `规划输入` / `backlog` / `draft`；部分闭合 = `已闭合`（含于文中即可）。**不要**写成「归档于 2026-11-23」这类非词表形态 ⇒ 会被兜底成「待讨论」。

2. **修 1 处失效指针**：`rollback-manifest-find-narrowing.md` 正文写「关联 change：**尚未立项**」，但其 change 已于 2026-11-24 归档 ⇒ 改为「**已归档**（2026-11-24）」（只改指针与状态字串，**不动正文判据**）。

3. **顺带刷掉 `plan-multi-session-collaboration.md` 的 6 处旧路径**（`.rddf/state/plan-sessions.json` ⇒ `.rddf/state/plan-sessions/<session_id>.json`）：D5 行 / AC7 / AC9 / AC13 / 后果段 / 配置面 —— **只改路径字串**，不改判据语义（这 6 处是 D5 修订留下的陈旧引用；D5 硬约束只点名了 roadmap，故这批顺手清）。

4. **不改**产品侧任何文件；**不改** `.rddf/improvements/rddf-status-improvement-status-mismatch.md` 的正文（跨仓那条另立项）；**不改**任何 improvement 的 Why / Acceptance 段。

## Acceptance

- [ ] `rddf status` 的 improvement 区：`Total pending: 7`（= 上表 7 条真待办），且这 7 条的 STATUS 列**不是**「待讨论」、PRI 列**不是** `-`
- [ ] 3 条已完成项（`rdd-verifier-state-consolidation` / `role-write-set-machine-block` / `rollback-drill-replace-pattern`）**不出现在** pending 区（产品侧 terminal 判定命中 ⇒ 跳过）
- [ ] `grep -l "^状态:" .rddf/improvements/*.md` ⇒ **命中 ≥ 10**（3 已完成 + 7 真待办）
- [ ] `rollback-manifest-find-narrowing.md` 的 change 指针指向 `openspec/changes/archive/2026-11-24-rollback-manifest-find-narrowing/`（与实际归档目录一致）
- [ ] `grep -n "plan-sessions\.json" .rddf/improvements/plan-multi-session-collaboration.md` ⇒ **0 命中**（历史记述句若保留，须逐条写明为何保留）
- [ ] **变红演练**：临时删掉某条已完成项的 front-matter ⇒ `rddf status` 的 pending 回到 8 ⇒ 恢复后复绿 ⇒ 证明该判据有判别力（不是恒绿）
- [ ] **反向演练（防「批量误标」）**：把 3 条真待办里任意一条临时标成 terminal（如 `已归档`）⇒ pending 降到 6 ⇒ 恢复后复绿 ⇒ 证明「逐条核 Acceptance」这条纪律可被检验（而不是靠人自觉）
- [ ] `bun test tests/` 全绿（既有守卫零回归；特别关注 `tests/rollback-registry.test.ts` / `tests/record-discipline.test.ts`）
- [ ] `bash scripts/check-upstream-anchors.sh` 全绿
- [ ] 本条改进提案自身补 front-matter（`status: 已实施（<日期>）`）⇒ 避免「做完又留在池里」

## Capabilities

- **债从「靠人记得清」变成「字段驱动」**：任何一份 improvement 只要写了 `status`，`rddf status` 就能读出它是不是待办 ⇒ 新增提案**默认带字段**后，池子会自己保持干净。
- **「已完成」不再靠推断**：本条把「核 Acceptance / 核产物在盘上」这条判别方式**写进判据**，避免下一个批次又用「指向已归档 change ⇒ 已完成」的省事推断（已抓到 3 个反例）。
- **可见性分层**：STATUS 列不再全是兜底「待讨论」⇒ 「未立项 / 待审查 / 待回填 / 部分闭合 / 已归档」这几档**终于能被区分**（产品侧词表已就位，缺的是数据）。
- **优先级可排**：PRI 列不再是 `-` ⇒ 真待办的 4 条能排序（`front-agent-redesign` 是 P1：它还挂着 3 条未实测判据）。
- **与跨仓那条正交**：`rddf-status-improvement-status-mismatch`（产品侧：让 `collect_pending` 能从正文里读出 change 指针）是**增强**；本条是**止血** ⇒ 两条并行不冲突，且**本条不阻塞**。

## Impact

- 改动面：`.rddf/improvements/` 共 **11 份文件**（10 份加 front-matter + 1 份改指针与 6 处路径）⇒ 全是**数据面**，无代码、无治理面 ⇒ **不触发治理面 oracle→critic 通道**。
- ⚠ **本仓形态提示**：本仓 32 份 improvement **全部没有 `状态` 字段**（7 份有 YAML frontmatter，但只含 `feedback_status`）⇒ 给它们加 `status` 是**首次**在该目录引入这类字段 ⇒ ① 产品侧 `read_improvement_entries` 的解析器**容忍**「无 frontmatter 的旧文件」与「有 frontmatter 的新文件」**混存**（已实测：临时副本上混存可正常解析，`errors=0`）；② `tests/` 里若有「improvement 文件形态」类断言，需同步（**实施时先跑 `bun test tests/` 看红红在哪**，不要预判）。
- 风险 ①：**把真待办误标成已归档** ⇒ 债从视野里消失 ⇒ 缓解：**逐条核 Acceptance / 核产物在盘上**（已核出 3 个「表面已完成、实际未完成」的反例，见 Why）；非 terminal 词一律用产品侧词表内的词。
- 风险 ②：产品侧 terminal 词表是**前导匹配**（「归档于…」不命中）⇒ 缓解：本条给出**固定措辞表**（见 What Changes 表），实施时逐字照抄。
- 风险 ③：`status` 的词表若在产品侧升级 ⇒ 本仓这批措辞可能不再命中 ⇒ 缓解：产品侧词表是**前缀闭集**且已含中英双语，本条用的词都在内；真要变，变更会走产品侧自己的评审。
- 依赖：**无**（产品侧 `collect_pending` 与词表**已就位**；实测已验证）。
- ⚠ **本条的诚实边界**：本条只让「已完成」**可判**（3 条移出池子 + 7 条标签可读）⇒ **不修**产品侧「从正文 change 指针推断」的能力（那是跨仓 `rddf-status-improvement-status-mismatch` 的事）⇒ 若那条不立项，本仓这 10 份文件**仍需人工**保持 front-matter 与实际状态同步（新增提案时顺手写字段 ⇒ 成本 ≈ 0）。
- 成本：11 份文件的机械小改（可脚本化），单次 `rddf status` 复验 + 一次 `bun test tests/`。
