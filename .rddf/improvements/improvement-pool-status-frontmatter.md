---
状态: 待实施
优先级: P2
---

# improvement: improvement-pool-status-frontmatter — 改进池状态机读化（`rddf status` 的待办池不再混着已完成的事）

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：`.rddf/reviews/test-completeness-debt-e2e-audit-2026-11-25.md` §2.1（测试完备性 / 债务审计）+ 本机实测 `rddf status`。
> 关联：**尚未立项**（`backlog: improvement-pool-status-frontmatter`）。
> 路线图：`.rddf/roadmap/test-debt-e2e-followup.md` 任务 **A2**。
> 关联 improvement：`rddf-status-improvement-status-mismatch`（**跨仓**，修产品侧 `_lib/dashboard/improvement_status.py`）—— 本条是**本仓侧止血**，**不依赖**那条；两者可并行。
> **planner 审查（metis 1 轮）**：已处置 12 条 finding（见文末「§7 metis 处置记录」）—— 其中 5 条 P0 改了**判据口径本身**（key 语言、frontmatter 写入形态、名单资格、删掉夹带的旧路径清理、AC 时序自引用）。
> ⚠ **实施归属 planner**（落点 `.rddf/improvements/**` ⇒ 在 planner 写集内 ⇒ planner 可自办；**不改**任何治理面文件、**不改**产品侧、**不改**代码）。

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

⇒ STATUS 列**全**是兜底标签「待讨论」、PRI 列**全**是 `-`。

根因不在「忘了标状态」，而在**状态没有机读入口**：产品侧 `_lib/dashboard/__init__.py::collect_pending()` 判「已归档 ⇒ 不是待办」只有**两条**通路 ——

1. **同名短路**：improvement 文件名命中 `openspec/changes/archive/<date>-<name>/` 的 `<name>`；
2. **front-matter `状态` 字段**：`read_improvement_entries` 归一 `status`/`状态`（另有 `priority`/`优先级`、`phase`/`阶段`、`category`/`分类`、`source`/`来源`），`classify_improvement_status()` 按**前导匹配（`startswith`）**的词表分类（`已归档` / `已完成` / `已实施` / `archived` / `implemented` / `completed` … ⇒ terminal ⇒ 不进 pending；**空 ⇒ 兜底「待讨论」**）。

本仓**两条都不成立**：

- ① **名字对不上**：`adr-front-knowledge-librarian-whitelist-annotation` ↔ `2026-11-23-librarian-delegate-contradiction`；`delegate-base-resolved-return` ↔ `2026-11-19-delegate-base-channel`；`cross-repo-check-trigger-in-agent-checklist` ↔ `2026-11-16-cross-repo-workspace-check`；`rdd-verifier-state-consolidation` ↔ `2026-11-14-consolidate-verifier-state` —— improvement 名与 change 名**本就允许不同**，同名短路只是「恰好命中」。
- ② **字段为空**：`grep -lE "^(status|状态):" .rddf/improvements/*.md` ⇒ **0**（7 份文件有 YAML frontmatter，但只含 `feedback_status`）。

⚠ **一条方法论警告（本条自己踩过的坑，必须写进判据）**：「improvement 指向了已归档的 change ⇒ 它已完成」这个推断**不成立**。逐条核对 10 条 pending 的 Acceptance 后得到**三个反例**：

| improvement | 表面证据 | 实际 | 核法 |
|---|---|---|---|
| `adr-front-knowledge-librarian-whitelist-annotation` | 关联 change 已归档 | ❌ **未完成**：AC 要求「ADR 元数据表有一条 2026-11-23 增补记录」⇒ `docs/adr/ADR-front-knowledge-capability.md` **无 2026-11-23**；AC 要求「D2 `:69` 不再声称 librarian 的 `subagent` 是字符串 deny」⇒ `:69` **仍写**「深度 2 链由 D3 的 `librarian.subagent: deny` 封死」 | 核 Acceptance 的**每一条** |
| `cross-repo-check-trigger-in-agent-checklist` | 关联 change 已归档 | ❌ **未完成**：它的内容是「在 `prompts/build.md` 自查清单加一行跨仓核对纪律」⇒ `grep -n "cross-repo-check" prompts/build.md` ⇒ **0 命中** ⇒ 那行**根本没落地** | 核**产物是否在盘上** |
| `delegate-base-resolved-return` | 来源 change 已归档 | ❌ **未完成**：头部自陈「**待 planner 审查**（metis 1 轮）后方可立项」⇒ 连自己的 change 都没有 | 核头部状态自陈 |

⇒ 所以本条**不做**「按 change 指针批量标已完成」这种省事做法（那会把 3 个真待办**误标成已完成 ⇒ 债从视野里消失**）⇒ **逐条核 Acceptance / 核产物在盘上**，核完才落字段。

上一轮清账（commit `81131e8`）是**手工逐条改散文状态行**，一次清了 8 条 ⇒ **清得掉，但清不彻底、也不可重复** —— 下一批新增的提案又落回同样状态，且清账这件事在 commit body 里留了一条**永久残留**（feedback 条目的 `resolution` 字段仍为 `open`，因为 `rddf feedback` CLI 没有 resolve 子命令 ⇒ 无 single-writer 途径）。

## What Changes

> **实施第 0 步（先于一切判据）**：**本文件自己**先补 front-matter `状态: 已实施（<实施日期>）` + `优先级: P2`（见下表的写法）⇒ 否则本文件此刻就是 pending 的一员 ⇒ 下面所有「pending = N」的断言都以本条已自标为前提。

1. **逐条核完 10 条 pending，再落 front-matter** —— **核法 = 核该条的 Acceptance / 核它的产物是否在盘上**，**不是**看 change 指针（见 Why 的三个反例）：

   | 文件 | 核对结论（证据） | `状态:` | `优先级:` |
   |---|---|---|---|
   | `rdd-verifier-state-consolidation.md` | ✅ 已完成（`prompts/build.md:373` 「2026-11-14 起已收拢」+ `:375` 退役依据 = **产品侧仓** change `consolidate-verifier-state`；⚠ 该 change 的归档目录**不在本仓**） | `已归档（2026-11-14）` | `P2` |
   | `role-write-set-machine-block.md` | ✅ 已完成（**planner 实测确认**：`prompts/build.md:478-499` 六个角色写集机读块在位 + commit `5b5ec86`「角色写集机读投影」+ `lib/delegate-core.ts::renderWriteSetBlock`；⚠ 它**既无**归档 change 指针**也无** `> **实施状态**` 行 ⇒ 属「或 planner 实测确认」这一支） | `已实施（2026-11-25）` | `P2` |
   | `rollback-drill-replace-pattern.md` | ✅ 已完成（自陈「已实施（2026-11-23）」+ `lib/rollback-drill.ts:450` 函数式 replace 在位 + `tests/rollback-drill.test.ts` 4 条「按字面」用例） | `已实施（2026-11-23）` | `P3` |
   | `adr-front-knowledge-librarian-whitelist-annotation.md` | ❌ **未完成**（ADR 无 2026-11-23 增补记录；`:69` 仍写 `librarian.subagent: deny`） | `未立项` | `P3` |
   | `cross-repo-check-trigger-in-agent-checklist.md` | ❌ **未完成**（`prompts/build.md` 无该纪律行） | `未立项` | `P2` |
   | `delegate-base-resolved-return.md` | ❌ **未完成**（待 planner 审查，未立项） | `待审查` | `P2` |
   | `delegation-matrix-fill-semantics.md` | ❌ 未立项（backlog） | `未立项` | `P2` |
   | `front-agent-redesign.md` | ❌ 部分闭合（3 条未实测判据 AC14 / AC15 / AC17） | `部分闭合（已闭合的判据 3 条，未实测 3 条）` | `P1` |
   | `rddf-status-improvement-status-mismatch.md` | ❌ 未立项（跨仓） | `未立项` | `P2` |
   | `role-matrix-allow-deny-guard-design.md` | ❌ 设计草案（明写「先设计，不硬上弱断言」） | `规划输入` | `P3` |

   ⇒ **净效果：pending 10 → 7**（3 条已完成项移出）+ 7 条真待办的 STATUS 列**不再是兜底「待讨论」**、PRI 列**不再是 `-`**。

   ⚠ **写入形态的硬约束（4 行，不是 3 行）**：`---` / `状态: …` / `优先级: …` / `---`（**4 行**），置于文件最前；**目标文件已有 frontmatter 块时必须「合并键进既有块」**（如 `role-write-set-machine-block.md` 的块含 `feedback_status`）⇒ **禁止在最前新建第二块** —— 产品侧 `_parse_improvement_meta` 只读**第一个** `---` 块（`content.startswith("---\n")` + `content.find("\n---", 4)`）⇒ 新建第二块会把旧块降级成正文（`feedback_status` 消失 ⇒ 若有消费者即回归）。
   ⚠ **YAML 值形态**：**禁止半角冒号 + 空格**（如 `已实施: 2026-11-25`）⇒ 会炸 YAML ⇒ 触发 `_scan_meta_lines` 降级并记 `meta_parse_error`。日期一律用**全角括号**：`已归档（2026-11-14）`。
   ⚠ **`front-agent-redesign` 的 `部分闭合`**：产品侧 `_PARTIAL_MARKERS` 的 needle 是「**已闭合**」（`needle in marker`）⇒ 光写「部分闭合」**不含**该子串 ⇒ 会落到末尾 `marker[:16]` 兜底（依赖截断长度 ≥ 4 且产品侧不改 fallback ⇒ 脆弱）⇒ 故本条的值**必须含「已闭合」三字**（用上表的 `部分闭合（已闭合的判据 3 条，未实测 3 条）`）⇒ 走 `_PARTIAL_MARKERS` 正路，label 稳定为「部分闭合」。

2. **修 1 处失效指针**：`rollback-manifest-find-narrowing.md` 正文写「关联 change：**尚未立项**」，但其 change 已于 2026-11-24 归档（本仓 `openspec/changes/archive/2026-11-24-rollback-manifest-find-narrowing/` **确实存在**）⇒ 改为「**已归档**（2026-11-24）」（只改指针与状态字串，**不动正文判据**）。

3. **不动既有散文状态行**：**不删除、不移动**任何既有 `> **实施状态**` / `> **状态**` 引用行（AC20 的 `isClosedImprovement()` 只读**文件前 15 行**里第一个匹配的引用行）⇒ 加了 4 行 frontmatter 后既有行整体下移 4 行（`rollback-drill-replace-pattern` 的 line 5→9、`rdd-verifier-state-consolidation` 的 line 6→10 ⇒ **仍在 15 行窗口内**）⇒ **实施时不得再插空行 / 注释行**把它们挤出窗口（`rdd-verifier-state-consolidation` 正文含大量**旧路径** token（形如 `.rddf/state/` 根下的旧 verdict 缓存名），一旦被 AC20 重新当「未关闭」扫描就会变红 —— 目前靠「外仓关闭」分支豁免）。

4. **不改**产品侧任何文件；**不改** `.rddf/improvements/rddf-status-improvement-status-mismatch.md` 的正文（跨仓那条另立项）；**不改**任何 improvement 的 Why / Acceptance 段。

5. **本条不碰已关闭 improvement 的历史判据** —— 本仓惯例（`tests/config-guards.test.ts` AC20 注释）是「已关闭的 improvement 是**历史记录**（记的是当时的路径）⇒ 不参与现行判据」⇒ **历史不回改**。⇒ `plan-multi-session-collaboration.md` 里那 6 处旧单文件路径**不在本条范围**（其中 AC7 / AC13 是**历史验收判据** ⇒ 回改 = 篡改当时判据的真值）⇒ 已作为**独立裁决项**外化到路线图 §7（只允许动非判据位置：结论段 / 后果段 / 配置面；历史 AC 原样保留）。

## Acceptance

- [ ] **第 0 步已先做**：本文件自身补了 front-matter（`状态: 已实施（<日期>）`）⇒ 否则下面所有 pending 计数断言的前提不成立
- [ ] `rddf status` 的 improvement 区：`Total pending: 7`（= 上表 7 条真待办），且这 7 条的 STATUS 列**不是**「待讨论」、PRI 列**不是** `-`
- [ ] 3 条已完成项（`rdd-verifier-state-consolidation` / `role-write-set-machine-block` / `rollback-drill-replace-pattern`）**不出现在** pending 区（产品侧 terminal 判定命中 ⇒ 跳过）
- [ ] **词表硬断言**（不只看 `rddf status` 的输出）：用本机产品侧 lib 对**全部 10 个写入值**逐一断言 `classify_improvement_status()` 的返回值符合预期表 —— 3 条 `terminal == True`；7 条 `terminal == False` 且 `label` 分别为 `未立项`（×4）/ `待审查` / `部分闭合` / `规划输入`；**输出贴进完成证据**（`~/.agents/skills/rdd-workflow/_lib/dashboard/improvement_status.py`）
- [ ] `grep -lE "^(status|状态):" .rddf/improvements/*.md` ⇒ **命中 ≥ 10**（3 已完成 + 7 真待办）
- [ ] **frontmatter 形态断言**：① `role-write-set-machine-block.md` 仍含 `feedback_status` 键（合并而非新建第二块）；② 每个目标文件**只有一个** `---` 起块（`grep -c "^---$"` ⇒ 恰 2）
- [ ] **散文状态行不动**：各目标文件 `grep -cE "^\s*>\s*\*\*(实施状态|状态)\*\*"` 的**计数不变**，且该引用行**行号变化 == frontmatter 行数（4）**、**仍在文件前 15 行内**
- [ ] `rollback-manifest-find-narrowing.md` 的 change 指针指向 `openspec/changes/archive/2026-11-24-rollback-manifest-find-narrowing/`（与实际归档目录一致）
- [ ] **变红演练（带名字断言）**：删掉 `rdd-verifier-state-consolidation.md` 的 front-matter ⇒ pending 由 7 变 8 **且新增条目名 == `rdd-verifier-state-consolidation`** ⇒ 恢复后 pending 回 7 且该条 label 复原 ⇒ 证明判据有判别力（只数数字会被「删错文件也能复绿」骗过）
- [ ] **变红演练的对象约束**：演练对象必须**不是**同名短路项（即删掉 front-matter 不影响 pending ⇒ 演练假失败）⇒ 本仓当前 3 条已完成项均无同名 archive 条目 ⇒ 安全
- [ ] `bun test tests/` 全绿（其中 `tests/record-discipline.test.ts` 薄包装 `tests/verify_record_discipline.sh` ⇒ **C5「活文档指针不悬空」覆盖本条第 2 项的指针改动**；`tests/config-guards.test.ts` 的 **AC20** 覆盖 improvement 形态与「已关闭」判定 ⇒ 本条第 3 项的窗口约束由它兜底）
- [ ] `bash scripts/check-upstream-anchors.sh` 全绿
- [ ] 上述两条变红演练 + 词表硬断言的**真实输出**贴进验收报告（不是「应该能过」）

## Capabilities

- **债从「靠人记得清」变成「字段驱动」**：任何一份 improvement 只要写了 `状态`，`rddf status` 就能读出它是不是待办 ⇒ **本条只清存量**（10 条）。⚠ **增量侧不自清洁**：下一批新提案若不写字段，池子会重新变脏 ⇒ 「新增 improvement 默认带 `状态` + `优先级`」这条**约定**需要另立项（模板 / 产出规范的归属见下方 Impact 的边界），本条**不冒充**已解决。
- **「已完成」不再靠推断**：本条把「核 Acceptance / 核产物在盘上」这条判别方式**写进判据**，避免下一批又用「指向已归档 change ⇒ 已完成」的省事推断（已抓到 3 个反例）。
- **可见性分层**：STATUS 列不再全是兜底「待讨论」⇒ 「未立项 / 待审查 / 部分闭合 / 规划输入」这几档**终于能被区分**（产品侧词表已就位，缺的是数据）；PRI 列不再是 `-` ⇒ 真待办的 7 条能排序（`front-agent-redesign` 是 P1：它还挂着 3 条未实测判据）。
- **与跨仓那条正交**：`rddf-status-improvement-status-mismatch`（产品侧：让 `collect_pending` 能从正文里读出 change 指针）是**增强**；本条是**止血** ⇒ 两条并行不冲突，且**本条不阻塞**。

## Impact

- 改动面：`.rddf/improvements/` 共 **11 份文件**（10 份加/合并 front-matter + 1 份改指针）⇒ 全是**数据面**，无代码、无治理面 ⇒ **不触发治理面 oracle→critic 通道**。
- ⚠ **本仓形态提示**：本仓 32 份 improvement **全部没有 `状态` 字段**（7 份有 YAML frontmatter，但只含 `feedback_status`）⇒ 给它们加 `状态` 是**首次**在该目录引入这类字段 ⇒ ① 产品侧 `read_improvement_entries` 的解析器**容忍**「无 frontmatter 的旧文件」与「有 frontmatter 的新文件」**混存**（已实测：临时副本上混存可正常解析，`errors=0`）；② `tests/` 里若有「improvement 文件形态」类断言，需同步（**实施时先跑 `bun test tests/` 看红红在哪**，不要预判）。
- **25 → 10 的归账**：其余 15 份（32 − 10 已归档 + 7 真待办 − 5 被同名短路/approved 名单过滤）不在 pending 区，路径是「approved 名单过滤」与「同名 archive 短路」⇒ **AC1 的名单断言（pending 恰好 = 具名 7 条）已机判覆盖这份归账**，无需全表登记。
- 风险 ①：**把真待办误标成已归档** ⇒ 债从视野里消失 ⇒ 缓解：**逐条核 Acceptance / 核产物在盘上**（已核出 3 个「表面已完成、实际未完成」的反例，见 Why）；非 terminal 值一律用产品侧词表内的词。
- 风险 ②：**词表是「前导匹配（`startswith`）」而非精确匹配** ⇒ 「归档于 2026-11-23」这类写法**不命中**（会兜底成「待讨论」）⇒ 本条给出**固定措辞表**（见 What Changes 表），实施时逐字照抄；**兜底方式 = 用本机产品侧 lib 逐一断言**（AC 第 4 条），不是「产品侧会走自己的评审」那种软兜底。
- 风险 ③：**AC20 的 15 行窗口**被 frontmatter 挤出 ⇒ 该文件被重新当「未关闭」扫描 ⇒ 正文里的**旧路径** token（形如 `.rddf/state/` 根下的旧 verdict 缓存名）触发变红 ⇒ 缓解：What Changes 第 3 条 + AC 的「散文状态行不动」断言。
- 风险 ④：**已有 frontmatter 的文件被新建第二块** ⇒ `feedback_status` 消失 ⇒ 缓解：AC 的 frontmatter 形态断言（① 键仍在 ② 只一个 `---` 起块）。
- 依赖：**无**（产品侧 `collect_pending` 与词表**已就位**；实测已验证）。
- ⚠ **本条的能力边界（诚实口径）**：只让「已完成」**可判**（3 条移出池子 + 7 条标签可读）⇒ **不修**产品侧「从正文 change 指针推断」的能力。⚠ **oracle 的补充判断**：现规格的 C4（产品侧按正文 change 指针自动判 terminal）会把审计**亲手抓到的 3 个反例自动化、规模化**（真待办在无人核 Acceptance 的情况下被移出视野）⇒ **比「不做」更差** ⇒ 本仓侧改用**本地守卫 A6**（路线图 §2）实现增量自闭环，**不等跨仓**。
- **增量侧归 A6**：新增提案必须带 `状态` / `优先级` 的机械约束落在路线图的 **A6**（builder 面的小守卫 + 22 份存量祖父名单冻结）⇒ **本条只清存量，增量归 A6**，两者合计才闭环。
- ⚠ **「新增提案默认带字段」的机制归属未定**：那属于**模板 / 产出规范**（`add-improve` 模板在**产品侧**仓 `~/.agents/skills/add-improve/`；本仓的 5 段草稿是**内置流程**产物）⇒ **跨仓**，不在本条 ⇒ 本条不宣称已解决增量侧。

---

## §7 metis 处置记录（planner 固定审查配对，1 轮）

> metis 输出 6 节（隐藏意图 / 歧义 / AI slop 风险 / 缺失的验收标准 / 边界情况 / 建议修改）。**逐条处置**如下（metis 的输出是材料，不是判据；以下为 planner 的处置决定）。

| # | 级别 | finding | 处置 |
|---|---|---|---|
| 1 | P0 | **统一 key 语言**：What Changes 用英文 `status`/`priority`，AC3 却 grep `^状态:` ⇒ 按表实施则 AC3 必红 | **已改**：全篇统一中文键 `状态:` / `优先级:`；AC 改为 `grep -lE "^(status|状态):"`（两种都命中 ⇒ 既与散文惯例同构又不误杀） |
| 2 | P0 | **frontmatter 写入形态**：「各 3 行」实为 4 行；已有块必须合并键、禁止新建第二块（解析器只读第一个块） | **已改**：What Changes 第 1 条写明「4 行」+「有块合并、无块新建」+ 点名 `role-write-set-machine-block.md`；AC 加「frontmatter 形态断言」 |
| 3 | P0 | **`role-write-set-machine-block` 名单资格自相矛盾**（既无归档指针也无实施状态行） | **已改**：保留在名单里，但把筛选规则显式扩为「归档 change 指针 **或** planner 实测确认」并写出其完成证据（`prompts/build.md:478-499` 六个机读块 + commit `5b5ec86`） |
| 4 | P0 | **删掉第 4 项**（plan-multi-session 6 处旧路径）：与主题无关 + 违反「历史不回改」+ AC7/AC13 是历史判据 | **已改**：该子项**已从本条删除**；改列为 What Changes 第 3 条的「不动历史判据」约束 + 独立裁决项外化到路线图 §7（只允许动非判据位置） |
| 5 | P0 | **AC 时序自引用**：本条自标排在最后 ⇒ 按序执行时 pending 计数全错 | **已改**：新增「**实施第 0 步**」段落 + AC 第 1 条显式写「第 0 步已先做」 |
| 6 | P1 | 变红演练只数数字 ⇒ 删错文件也能「复绿」 | **已改**：AC 加**名字断言**（新增条目名 == 被删项）+ **对象约束**（演练对象不得是同名短路项） |
| 7 | P1 | 词表兜底是软的 | **已改**：AC 加**词表硬断言**（用本机产品侧 lib 逐一断言 `(terminal, label)`，输出贴证据）；风险②改写为「前导匹配（`startswith`）」 |
| 8 | P1 | `部分闭合` 不在词表（needle 是「已闭合」）⇒ 靠 `marker[:16]` 兜底 | **已改**：值改为 `部分闭合（已闭合的判据 3 条，未实测 3 条）`（含「已闭合」⇒ 走 `_PARTIAL_MARKERS` 正路）+ AC 钉住 label == 「部分闭合」 |
| 9 | P1 | 「散文状态行不动」无断言 ⇒ 实施者可能顺手清理 | **已改**：What Changes 第 3 条 + AC 的「散文状态行不动」断言（计数不变 + 行号位移 == 4 + 仍在 15 行窗口内） |
| 10 | P2 | 守卫传递链没点明 | **已改**：AC 的 `bun test` 条注明 `record-discipline.test.ts` 薄包装 `verify_record_discipline.sh`（C5 覆盖指针改动）+ `config-guards.test.ts` AC20（覆盖形态交互） |
| 11 | P2 | 25 → 6 归账没说清 | **已改**：Impact 增「25 → 10 的归账」段（approved 名单过滤 + 同名短路；AC1 的名单断言已机判覆盖） |
| 12 | P2 | 「前缀闭集」措辞误导 | **已改**：风险②改为「前导匹配（`startswith`）」，与风险①合并表述 |
| 13 | 隐藏意图 | **「池子自清洁」是愿景冒充结果**（本条只清存量，无机制改动） | **已改**：Capabilities 明确写「本条**只清存量**」+ 把「新增提案默认带字段」列为**待另立项**的机制；Impact 增「机制归属未定（跨仓：模板在产品侧）」 |
| 14 | 隐藏意图 | 「修 1 处失效指针」是诚实的范围披露，但 6 处旧路径属夹带 | **已改**：见 #4（外化为独立裁决项，不再夹带） |
| 15 | 边界 | AC20 的 15 行窗口 + `rdd-verifier-state-consolidation` 的旧 token | **已改**：What Changes 第 3 条 + AC 的窗口断言 |
| 16 | 边界 | YAML 半角冒号会炸 | **已改**：What Changes 加「禁半角冒号 + 空格、日期用全角括号」 |
| 17 | 边界 | 「本仓归档 vs 产品仓归档」措辞未区分 | **已改**：What Changes 表内 `rdd-verifier-state-consolidation` 行注明「**产品侧仓** change …；该归档目录**不在本仓**」 |
| 18 | 边界 | 演练对象若同名短路项 ⇒ 演练假失败 | **已改**：AC 加对象约束 |

## 8. critic 审查处置记录（第 1 轮，`review_profile: plan`，`APPROVE_WITH_CONDITIONS`，无 BLOCKER）

- **与本文直接相关的 finding 无**（S1/S2/S4 属提案 2；S6/S7 属路线图）。
- **S5（A6 缺 front-matter × AC20 15 行窗口的联合断言）**：本文 A2 侧的窗口风险已闭合（What Changes 第 3 条 + AC 的窗口断言：10 份文件行位移 == 4 且仍在 15 行内）；**A6 侧（新增文件日后被关闭）** 由 **roadmap A6 判据 ③** 闭合 ⇒ 两侧都有落点，不重复登记（回应 critic NITS-3：注明哪侧已闭、哪侧开放）。
- **S3（token 无消费载体）**：本文不涉及 token；其订正落在提案 2 §8。
- **oracle 的 C4 判断**：本文能力边界段已改写（C4 现规格会把 3 个反例自动化 ⇒ 不立项；增量归 A6）。
