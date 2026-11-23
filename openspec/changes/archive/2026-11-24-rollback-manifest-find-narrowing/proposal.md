# rollback-manifest-find-narrowing — 回滚清单的 `find` 粒度收窄 + 写集机读投影

> **登记来源**：`.rddf/improvements/rollback-manifest-find-narrowing.md`（主，5 段草稿，metis 1 轮已处置）·
> `.rddf/improvements/role-write-set-machine-block.md`（**段 B**，同批合并：同一块散文 + 同一批 pin）·
> `.rddf/improvements/rollback-drill-replace-pattern.md`（**段 C**：实测 6 条 AC **已全部落地** ⇒ 本 change 不实施，只做账本登记）。
> **判据真源**：本文件 `## 验收标准` 的 AC 表（**唯一真源**；三个 improvement 的 AC 正文不复制，逐条指回）。
> **执行路径**：常规 change —— 跨 `lib/**`（机制面）+ `prompts/**`（治理面）+ `tests/**`（守卫判据）+ `.rddf/rollback/**`（清单）⇒ **治理面** ⇒ **oracle（`审查域: 治理面`）→ critic** 各 1 轮。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在（`.rddf/state/.planner-handoff.json` 缺失）⇒ 走**内置流程**（本目录的 proposal / design / tasks 由实施者直接起草）。
> ⚠ **合并的技术依据（不是"省一轮"）**：回滚清单的 `find` 必须匹配**回滚动作发生时**的文件内容 ⇒ 段 B 改 `prompts/build.md` 的写集路径复述**必然撞 pin**（`role-class-write-set.json` 的 `edits[45]/[46]` 覆盖 verifier 行的「允许」列散文）⇒ **两份清单须同批更新、同批走两段式**；且两段改写互不干涉（段 B 不触碰段 A 锚定的门控句，edits[13] 的 diff 面已抽验只有那一处）⇒ 合并成一条 change 可**免证两批文本改写的非干涉性**。

## Why

两类**静默漂移**，都在同一块散文上交汇：

### 病根 1：回滚清单的 `find` 把整块散文 pin 住

`.rddf/rollback/*.json` 的 `edits[].find` 是「回滚时要被替换掉的原文片段」。`lib/rollback-drill.ts::planDrill` 断言每个 `find` 在演化缓冲里**恰好出现 1 次**，不满足即判 `find_count` 漂移 ⇒ `tests/rollback-manifests.test.ts` 红。

多个 `find` 的覆盖范围**远超机制特有片段**，把与机制无关的散文与整张表格也 pin 进去。实测（2026-11-24，全 9 个清单 / 361 条 `find`）：

| 清单 | `edits` 数 | 最大 `find` | 含表格分隔行 | `\|` 起始行 > 1 |
|---|---|---|---|---|
| `commit-gate.json` | 29 | 2067 | 0 | 0 |
| `delegate-knowledge-delivery.json` | 76 | 6524 | 0 | 2 |
| `delegate-slot-kernel.json` | 35 | 2894 | 5 | 6 |
| **`governance-paths-config.json`** | 16 | **12768** | 2 | 2 |
| `model-fallback.json` | 14 | 3003 | 1 | 2 |
| `plan-delegate.json` | 48 | 4849 | 1 | 1 |
| `plan-topics.json` | 14 | 5229 | 1 | 1 |
| `role-class-write-set.json` | 126 | 8844 | 3 | 3 |
| `rollback-manifest-enforcement.json` | 3 | 500 | 0 | 1 |

长度分位：p50 = 209 / p75 = 580 / p90 = 1587 / **p95 = 2894** / p99 = 6349 / max = 12768。

**已发生的事故（2026-11-23）**：要给 `prompts/build.md` 的角色列表表补两项（architect 行的 `.rddf/reviews`、verifier 行的 `.rddf/state/verifier`）+ 修两处悬空 `§4.x`，**全部被 `governance-paths-config.json` 的 `edits[13]`（2914 字符、整张角色表）挡住** ⇒ 改任一单元格即 `find_count` 漂移 ⇒ 必须同时改 `.rddf/rollback/**`（机制面，且**不在 `architect` 写集**）⇒ 最终**放弃表内修正**，改用「表尾投影」这一绕路（记录见 `rdd-workflow` 仓 `.rddf/reviews/governance-p1-docs-2026-11-23.md` §四）。

**代价**：治理面文档的正常编辑被一个**回滚用**的机制产物绑住，且这个绑定**不可见**（改之前不知道会红），只能靠跑 `bun test` 撞出来。

### 病根 2：写集路径被散文复述，形成无守卫副本

`lib/role-policy.ts::ROLE_WRITE_POLICY`（AC16 声明为「角色 → 写根的唯一真源」）有 6 个角色，但 `prompts/*.md` 里只有 `verifier` 一个有**规范机读块**；其余 5 个角色的写集路径由**散文**复述 ⇒ 散文与真源漂移时**无人报错**。段 B 的绕路（「表尾投影」）又添了**第三份无守卫副本**。

### 两者的交汇

病根 1 让病根 2 无法在原地修（改表格 ⇒ 撞 pin）⇒ 所以必须**先解 pin（段 A），再把散文改成机器渲染的投影（段 B）**。

## What Changes

### 段 A：收窄 `find` 粒度 + 建可机检的形态守卫（`rollback-manifest-find-narrowing`）

**A1. 拆分而非缩短**：把每个大 `find` 按**机制特有的语义边界**拆成 N 个小 `find`/`replace` 对。机制已支持 —— `planDrill` 逐条在演化缓冲里匹配（`lib/rollback-drill.ts:436-450`）；`path_overlap` 只检查「同一路径同时在 `delete` 与 `edits`」，**不禁止**同路径多条 `edits`（`governance-paths-config.json` 对 `lib/role-policy.ts` 就用了 7 条）。
- 本 change **只拆 `governance-paths-config.json` 一个清单**的 3 条大 `find`：`edits[11]`（12768，`tests/config-guards.test.ts`）、`edits[13]`（2914，`prompts/build.md` 角色表）、`edits[14]`（2657，治理面作用域表）。
- 其余 8 个清单**只登记 check list**（AC7），不在本 change 拆分 —— 理由见「非目标」。

**A2. 守卫：把「不许整表 pin」变成可机检的判据**。`tests/rollback-manifests.test.ts` 新增断言族，对每个清单计算三项形态指标并与**基线表**比对：

```
actual(M)  = { sep: 含 markdown 表格分隔行的 find 条数,
                pipe: find 内 "|" 起始行 > 1 的 find 条数,
                maxLen: 最长 find 的字符数 }
baseline(M) = FIND_SHAPE_BASELINE[M] ?? { sep: 0, pipe: 1, maxLen: MAX_FIND_LEN }
断言：actual.sep ≤ baseline.sep ∧ actual.pipe ≤ baseline.pipe ∧ actual.maxLen ≤ baseline.maxLen
```

- `MAX_FIND_LEN = 2894`（**实施时定死的测试常量**；取当前 361 条 `find` 的 **p95**，且恰为 `delegate-slot-kernel.json` 的当前最大值 ⇒ 零假红）。
- `FIND_SHAPE_BASELINE` 登记 **8 个未收敛清单的当前实测值**（上表逐格）⇒ **零增长**：任何新增违规立即红，存量违规不许增加；每个清单从表里移除一项 == 收敛一项（收敛进度机读）。
- ⚠ **不是豁免白名单**：豁免 = 该清单可以继续退化；基线 = 该清单**不许再退化**。二者的判别力差一个量级。
- ⚠ 表格分隔行判据用 `/^\|[\s:|-]+\|$/m`；`pipe` 判据用「`|` 起始的**连续**行数 > 1」（连续 ⇒ 跨空行不合并）。

**A3. 不改** `lib/rollback-drill.ts` 的 `find_count` 判据（判据是对的；错的是 `find` 的粒度）。

### 段 B：写集路径改为机器渲染的机读投影（`role-write-set-machine-block`）

**B1. 渲染器**：`lib/delegate-core.ts` 新增 `renderWriteSetBlock(role)`，**从 `ROLE_WRITE_POLICY` 渲染，不手抄字面量**。⚠ `verifierWriteSetBlock()` 的**输出逐字不变**（marker + `allow:` 行 + `owns:` 行）—— 新渲染器**不取代**它，只允许**共享 `allow` 行的 join 辅助**（详见 AC8；critic NIT-1）。

**B2. 三种特殊形态**（先在设计里定死，否则实施第一个就卡住）：
- `builder` / `general`：`allow = ["**"]` ⇒ 块内写 `allow: **`（单个 `**`）；
- `no-role`：`allow = []` + `denyAll: true` ⇒ 块内写 `allow: (none)` + `denyAll: true`（**不要**写成空 `allow:` 行 —— 守卫的 `split(", ")` 解析会得到 `[""]`）；
- 其余四角色：`allow: p1, p2, ...`（现有 `verifier` 形态）。

**B3. 落盘**：`prompts/build.md` 角色列表**之后**插入 6 块（architect / planner / builder / no-role / general / verifier），每块 = `renderWriteSetBlock` 输出的**逐字**副本；起止标记各自独占一行。

**B4. 散文去复述**：角色列表「允许」列**不再复述写集路径**，改为指向机读块；本轮引入的「表尾投影」散文块**删除**（不保留两份）。

**B5. 守卫断言族**：`tests/config-guards.test.ts` 把 AC19 的判据**泛化**成断言族（对 6 个角色）：块内容 == 渲染输出（逐字）· 恰好 1 处 · 起止标记独占一行。

**B6. 不改** `ROLE_WRITE_POLICY` 的内容（真源不动；本段只加强投影与守卫）。

### 段 C：`rollback-drill-replace-pattern` 的账本登记（**不实施**）

实测该 improvement 的 6 条 AC **已全部落地**：
- `lib/rollback-drill.ts:450` 已是 `buf = buf.replace(e.find, () => e.replace)`（函数式 replacement ⇒ 不解析 `$` 模式）；
- `ManifestEdit.find` / `replace` 的 JSDoc（`lib/rollback-drill.ts:48-51`）已写明「字符串 pattern」与「按字面写入」；
- `.rddf/rollback/README.md:47` 已含同义 bullet；
- `tests/rollback-drill.test.ts` 已有那 4 条新用例（`:220` 起），共 **39** 条。

⇒ 本 change **不实施**它，只把 improvement 的状态行改为「已实施」+ 指针（AC15）。
⚠ **段 C 是段 A 的安全前提**：`find` 侧「字符串 pattern ⇒ 正则元字符与 `$&` 按字面匹配」这条不变量，正是段 A 拆 `find` 时可以放心写入任意文本的依据。

## 非目标

| 不做 | 理由 |
|---|---|
| 普查其余 8 个清单并拆分 | 它们不在任何关键路径上；打包进 P1 会让交付被体力活拖住，且与「不要先拍数字」的谨慎原则一致 ⇒ 登记为 check list（AC7） |
| 放宽 `find_count` 判据（允许多次 / 只查前缀） | 直接削弱回滚安全性 —— 回滚要能**精确**还原，该判据是唯一保障 |
| 把 `.rddf/rollback/**` 写权交给 architect | 治标且与 `ADR-governance-paths-ownership` D2 的第一不变量冲突 |
| 重写 G3 被切碎的 edit | 与本 change 无关；核对方式 = `git show <引入 commit>:<path>` 对比原文（登记为已知残留） |
| 给 `replace` 加转义 DSL / manifest linter / 常驻 mutation harness | `replace` 是任意文本，不存在可校验的谓词（只会产出恒真判据）；函数式 replacement 已是终点 |
| 改 `prompts/plan.md` / `prompts/front.md` | 段 B 明确**只动 `prompts/build.md`**；plan / front 是否需要嵌块另立项决定（写进 AC 时会变成开放判据） |
| 改 `ROLE_WRITE_POLICY` 的内容 | 真源不动；本 change 只加强投影与守卫 |
| 给 `prompts/build.md` 的**散文**列加「含某词」的弱断言 | 本仓一贯避免假信心：散文语义判不了就如实登记，靠行为层 + 审查兜底 |

## 验收标准

> 判据一律**可机检**；每条都给出**红 / 绿证据**的取法。`ACn` 编号在 `tasks.md` 中逐条对应。

### 段 A

| AC | 判据 | 类型 |
|---|---|---|
| **AC1** | `tests/rollback-manifests.test.ts` 新增形态断言族：`MAX_FIND_LEN` 常量的值必须是 **2894**（当前 361 条 find 的 **p95**）；`FIND_SHAPE_BASELINE` 登记**全部未收敛清单**的形态三元组（sep / pipe / maxLen）当前实测值（**收敛一项移除一项**；当前 8 项 —— `governance-paths-config` 的出表条件见 AC3）；断言**实际值 ≤ 基线值**（逐项）；**未登记清单**须满足 sep = **0**、pipe ≤ **1**、maxLen ≤ **2894**。<br>⚠ **`commit-gate.json` 已达标 ⇒ 刻意不登记**（登记它反而允许其退化）；其余未收敛清单**全部登记**（零增长：实际值不得超基线） | 结构 |
| **AC2** | **判别力**：① 构造一条超基线的 `find`（任一未登记清单里加一条含表格分隔行的 find）⇒ 守卫**红**；② 把 `FIND_SHAPE_BASELINE` 里任一清单的 `pipe` 下调到实际值以下 ⇒ 守卫**红** | 结构 |
| **AC3** | `governance-paths-config.json` 的三条大 `find`（`edits[11]` 12768 / `edits[13]` 2914 / `edits[14]` 2657）**全部被拆成多条**，且拆分后该清单所有 `find` 在**演化缓冲**里仍各自恰好 1 次；**拆分正确性的判据 = 等价性**（拆出的序列依次应用 ⇒ 结果与原 `replace` **完全一致**，字节级）⇒ 回滚语义零损失。<br>⚠ **「该清单从 `FIND_SHAPE_BASELINE` 移除」是派生条件**（当且仅当该清单所有 `find` 的 `maxLen ≤ MAX_FIND_LEN`）：实测拆分后仍有 **2 条超限** —— ① `maxLen=3541` 的「注释头 + describe 头 + helper + 收尾」壳（删它必须连带删掉壳内的 test ⇒ 拆它会破坏 JS 语法）② `maxLen=3251` 的**单个完整单测块**（同上）⇒ **该清单仍留在基线表内**（登记实测值 `{sep:1, pipe:1, maxLen:3541}`，只减不增）。彻底出表需**改守卫源码**（缩短那两处）—— 属**另一个 change** 的范围（见 tasks 的 A3 残留登记）。 | 结构 |
| **AC4** | **负向验证（解 pin 的实效）**：改 `prompts/build.md` 角色表里**与机制无关**的单元格（排版 / 与 `GOVERNANCE_PATHS` 无关的散文）⇒ `bun test tests/` **不再**报 `find_count` ⇒ **恢复原状**。<br>⚠ **变异点须选自 T0b 普查出的「零覆盖空隙」**：角色表其它行仍被**未拆分**的 `find` 合法覆盖（如 `plan-delegate.json` `edits[9]` 行 455、`commit-gate.json` `edits[7]` 行 456 / `edits[10]` 行 458）⇒ 选错单元格 ⇒ `find_count` 红是**合法 pin 触发**而非解 pin 无效 ⇒ 本 AC 会**假败**（critic SHOULD_FIX-3） | 行为 |
| **AC5** | **正向验证（可还原性不削弱）**：`bun scripts/rollback-registry.ts` **PASS**（全部 9 个清单的 drill 全绿，每条 `find` 恰好 1 次）；被拆清单的 `verify.commands` 跑通 | 行为 |
| **AC6** | `bun test tests/rollback-manifests.test.ts` 绿；`bun test tests/` 全绿 | 结构 |
| **AC7** | `tasks.md` 登记其余 **8 个**清单各自的 `{sep, pipe, maxLen}` 当前值与收敛目标（含收敛顺序建议）—— **不许静默遗留** | 结构 |

### 段 B

| AC | 判据 | 类型 |
|---|---|---|
| **AC8** | `lib/delegate-core.ts` 新增 `renderWriteSetBlock(role)`，从 `ROLE_WRITE_POLICY` 渲染（**不手抄字面量**）。<br>⚠ **`verifierWriteSetBlock()` 的输出逐字不变**（marker `role-class-write-set:verifier` + `allow:` 行 + `owns:` 行）：至多**共享 `allow` 行的 join 辅助**；**不得**改 marker、**不得**把 `owns:` 搬进新块（搬进去就变成手抄 ⇒ 违反「不手抄字面量」）⇒ 既有守卫（AC19 的逐字比对 + marker 整行计数；AC20 解析 `owns:` 行）必须继续绿 | 结构 |
| **AC9** | `prompts/build.md` 含 **6 个**角色写集块（architect / planner / builder / no-role / general / verifier），每块内容 == `renderWriteSetBlock(role)` 输出（**逐字**）；起止标记各自独占一行。<br>⚠ **块只表达写集维度**：`governance` 标记与 architect 的 `arch_paths` **动态并入**都**不进块**（前者是治理面身份、后者不在 `ROLE_WRITE_POLICY` 里）⇒ 散文另行注明。<br>⚠ **与既有 `role-class-write-set:verifier` 块并存**：后者表达的是**被派发 verifier 后端**的写集（含 `owns:` 文件名模式），本块表达**主会话角色**的写集 ⇒ 散文必须消歧，**不得**把 `owns:` 搬进新块（搬进去就变成手抄） | 结构 |
| **AC10** | `tests/config-guards.test.ts` 的断言族对 **6 个角色**逐个断言：块 == 渲染输出（逐字）· **恰好 1 处** · 标记独占一行 | 结构 |
| **AC11** | **负向验证**：① 改 `ROLE_WRITE_POLICY` 任一条（给 `architect` 加一个路径 / 删一个）⇒ **红**；② 手改任一块内一个字符 ⇒ **红**；③ 多复制一份块 ⇒ **红** | 行为 |
| **AC12** | `prompts/build.md` 的**角色列表节**内 grep 写集路径字面（`.rddf/reviews` / `.rddf/state/verifier` / `.rddf/config/arch-docs.json` / `.rddf/roadmap` / `.rddf/improvements`）⇒ **该节内**的命中只允许出现在机读块边界内（块起止标记之间），**节外命中数 == 0**；且**不存在第三份无守卫副本**（本轮的「表尾投影」散文块已删除或改为对块的指针）。<br>⚠ **判据范围必须限定在角色列表节**：`.rddf/reviews` / `.rddf/state/verifier` 在**其它节**（architect 产出形态契约、verifier 产出契约、派发后端章节）有**正当**散文提及 ⇒ 文件级 grep 会**恒红** ⇒ 实施者被迫静默收窄判据（判据弱化）。<br>⚠ **两条散文事实必须保留**（块表达不了，删了就是信息丢失）：① `architect` / `builder` / `general` 的 `governance: true` 治理面授权；② `architect` 的 `arch_paths` **动态并入** | 结构 |
| **AC13** | ① `lib/role-policy.ts::ROLE_WRITE_POLICY` 的「定义点恰好 1 处」守卫（AC16）仍绿；② `ROLE_WRITE_POLICY` **内容零改动**（`git diff lib/role-policy.ts` 为空）；③ **新增** deep-equal 断言：`ROLE_WRITE_POLICY.verifier.allow` 与 `VERIFIER_ALLOW_ROOTS` **逐元素相等**（二者当前**巧合**相等但**各自独立演化** ⇒ 无守卫则漂移互不报警） | 结构 |
| **AC14** | `bun test tests/` 全绿；`bash scripts/check-upstream-anchors.sh` 无 `FAIL` 且无 `SKIP` | 结构 |

### 段 C

| AC | 判据 | 类型 |
|---|---|---|
| **AC15** | `.rddf/improvements/rollback-drill-replace-pattern.md` 的状态行标为「**已实施**」并给出实测指针（`lib/rollback-drill.ts:450` 函数式 replacement · `lib/rollback-drill.ts:48-51` JSDoc · `.rddf/rollback/README.md:47` · `tests/rollback-drill.test.ts` 4 条新用例 / 共 39 条） | 结构 |

## Capabilities

- **MUST**：治理面 / 架构文档的**非机制性**编辑不再触发回滚清单漂移。
- **MUST**：写集路径在 prompt 侧有**唯一**投影（机读块）且与真源**逐字一致**，任何漂移立即红。
- **MUST NOT**：削弱「`find` 恰 1 次」与「回滚可完整还原」这两条安全判据。
- **MUST NOT**：把 `.rddf/rollback/**` 的写权交给 architect。
- **MUST NOT**：改动 `ROLE_WRITE_POLICY` 的内容（真源不动）。

## Impact

| 面 | 影响 |
|---|---|
| `.rddf/rollback/governance-paths-config.json` | 3 条大 `find` 拆成多条小 `find`/`replace` 对（**清单内容变更 ⇒ `last_drill.content_hash` 失效 ⇒ 按 ADR D5 两段式：撤 `last_drill` + registry 转 `proving` → 演练 → 回填转 `active`**） |
| `.rddf/rollback/**`（其余清单） | **除 `governance-paths-config.json` 外**，`role-class-write-set.json` 等清单**可能同批更新** —— 实测 `prompts/build.md` 被 **5 份**清单 pin（21 处）：`governance-paths-config`(edits[13] 行 449 / edits[14] 行 544) · `role-class-write-set`(edits[44] 行 216 / [45][46] 行 456–457 **= verifier 行的「允许」列散文** / [47] 行 489 **= 既有 `role-class-write-set:verifier` 机读块** / [48] 行 606 / [49] 行 651 / [50] 行 674 / [51] 行 680 / [52] 行 344) · `commit-gate`(edits[5] 行 832 / [6] 行 755 / [7] 行 456 / [8] 行 428 / [9] 行 483 **= `<!-- capability:build` 块** / [10] 行 458) · `delegate-knowledge-delivery`(edits[52] 行 687) · `plan-delegate`(edits[9] 行 455 / [46] 行 344 / [47] 行 661)。⇒ **段 B 改「允许」列必然撞 `role-class-write-set` 的 edits[45]/[46]** ⇒ 该清单须同批更新（两段式）。具体范围以 T0b 普查为准 |
| `tests/rollback-manifests.test.ts` | 新增形态断言族 + `MAX_FIND_LEN` + `FIND_SHAPE_BASELINE`（**7 项**基线登记） |
| `lib/delegate-core.ts` | 新增 `renderWriteSetBlock(role)`；`verifierWriteSetBlock()` **输出逐字不变**（至多共享 `allow` 行的 join 辅助） |
| `prompts/build.md` | 插入 6 个角色写集块；角色列表「允许」列去复述；删除本轮引入的「表尾投影」散文块 |
| `tests/config-guards.test.ts` | 新增 6 角色断言族（**该文件被 9 个清单的 67 处 `find` 逐字节 pin ⇒ 落点必须避开被 pin 的 describe，或同批更新对应清单**） |
| `docs/CHANGELOG.md` | 一条版本条目 |
| 行为 | 治理面文档的正常编辑不再需要同步回滚清单；写集散文漂移由守卫立即报错 |

## 风险

| 风险 | 处置 |
|---|---|
| 拆得过细 ⇒ `find` 失去唯一性（`find_count` 反而不满足） | 每条拆出的片段必须在**演化后的缓冲**里仍唯一 ⇒ 逐条跑 `planDrill`（AC3 / AC5） |
| 拆分的 `replace` 写错 ⇒ 回滚后内容不是原样 | AC5 的 drill 全绿 + `verify.commands` 跑通；清单是纯数据 ⇒ 万一出错 `git revert` 即可 |
| `MAX_FIND_LEN = 2894` 定得过小 ⇒ 大面积假红 | 取**当前实测 p95** ⇒ 零假红；上限只对「未登记清单 / 新增 find」生效，存量由基线表兜住 |
| 段 B 的断言族落在被 pin 的 describe 内 ⇒ `find_count` 漂移 | 实施前先做 **pin 普查**（定位每个 `find` 的行区间）⇒ 落点选未 pin 的空隙；必要时同批更新对应清单的 `find` |
| 段 A 与段 B 分两条 change ⇒ 段 B 改「允许」列撞 pin，段 A 的 find 也要重写 | **合并为一条**（见开头的「合并的技术依据」）：两份清单同批更新 + 同批两段式 ⇒ 免证两批文本改写的非干涉性 |
| 回滚清单内容变更使 `last_drill` 失效 ⇒ 演练被判漂移 | 两段式（ADR D5）：内容变更与撤 `last_drill` + registry 转 `proving` **同一 commit**；演练 PASS 后回填并转 `active` |
