# improvement: rollback-manifest-find-narrowing

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：治理面 P1 审查（本轮**执行时被守卫抓到两次**）——
> 记录见 `rdd-workflow` 仓 `.rddf/reviews/governance-p1-docs-2026-11-23.md` §三 SF-3 / §四
> 与 `.rddf/reviews/docs-alignment-debt-audit-2026-11-23.md` §3.6。
> 关联 change：**尚未立项**（`backlog: rollback-manifest-find-narrowing`）。
> planner 审查：**metis 1 轮**（2026-11-23，与其余 3 份同批）。已按其建议修订：
> **9 清单全量普查从 P1 剥离**为后续 check list（避免被体力活拖住）· 守卫加「`|` 起始行 ≤ 1」
> 堵住「避开分隔行仍 pin 表」的绕过 · AC 去掉「不含任何与机制无关的行」这一开放判据 ·
> 长度上限改为**实施时定死的测试常量**（不留开放值）。
> 执行路径：**常规 change**（机制面 `.rddf/rollback/**` + 守卫断言 ⇒ builder 主导 + oracle → critic）。
> ⚠ 优先级：**P1** —— 它**阻塞 C**（C 要往 `prompts/build.md` 加机读块，不先解开 pin 就会被判漂移）。

## Why

`.rddf/rollback/*.json` 的 `edits[].find` 是「回滚时要被替换掉的原文片段」。`lib/rollback-drill.ts`
的 `planDrill` 断言每个 `find` 在**演化中的缓冲**里**恰好出现 1 次**（`:437-446`），
不满足即判 `find_count` 漂移 ⇒ `tests/rollback-manifests.test.ts` 红。

**问题**：多个 `find` 的覆盖范围**远超机制特有片段**，把**与机制无关的散文与整张表格**也 pin 了进去。
实测（2026-11-23）：

| 清单 | `edits` 数 | 最大 `find` | 备注 |
|---|---|---|---|
| `governance-paths-config.json` | 16 | **12768**（`tests/config-guards.test.ts`）· **2914 / 2657**（`prompts/build.md` ×2） | 两条 `find` **含角色表表头行**（`| 角色 |`）⇒ 整表被 pin |
| `role-class-write-set.json` | 126 | 8844 | 同类 |
| `delegate-knowledge-delivery.json` | 76 | 6524 | 同类 |
| `plan-topics.json` | 14 | 5229 | 同类 |
| `plan-delegate.json` | 48 | 4849 | 同类 |
| 其余 4 个 | 3–35 | 500–3003 | — |

⇒ **这是系统性问题，不是单个清单的手滑。**

**已发生的事故（本轮）**：要给 `prompts/build.md` 的角色列表表补两项（architect 行的 `.rddf/reviews`、
verifier 行的 `.rddf/state/verifier`）+ 修两处悬空 `§4.x`，**全部被 `edits[13]` 的 2914 字符整表 `find` 挡住**：
改任一单元格 ⇒ `find_count` 漂移 ⇒ 必须同时改 `.rddf/rollback/**`（机制面，且不在 `architect` 写集）
⇒ 最终**放弃表内修正**，改用「表尾投影」这一绕路（见 `.rddf/reviews/governance-p1-docs-2026-11-23.md` §四）。

**代价**：治理面文档的**正常编辑**（改一行散文、补一个路径）被一个**回滚用**的机制产物绑住，
且这个绑定**不可见**（改之前不知道会红），只能靠跑 `bun test` 撞出来。

## What Changes

1. **拆分而非缩短**：把每个「大 `find`」按**机制特有的语义边界**拆成 N 个小的 `find`/`replace` 对。
   机制本身已支持——`governance-paths-config.json` 对 `lib/role-policy.ts` 就用了 **7 条**独立 `edits`
   （`edits[0..6]`），`planDrill` 逐条在演化缓冲里匹配（`:436-450`）；`path_overlap` 只检查
   「同一路径同时在 `delete` 与 `edits`」（`:301`），**不禁止**同路径多条 `edits`。
   - 具体到 `edits[13]`（`prompts/build.md` 角色表，2914）：机制只改了 architect 行的
     「门控按 `GOVERNANCE_PATHS` 整文件判定」那一句 ⇒ `find` 应**只覆盖那一句**（其余表格行不进 `find`）。
   - `edits[14]`（2657，治理面作用域表）：同上，只覆盖「新增行 + 紧邻注记」。
   - `edits[11]`（12768，`tests/config-guards.test.ts`）：按断言族拆成多条。
2. **加守卫（可机检的「不许整表 pin」判据）**：在 `tests/rollback-manifests.test.ts` 加断言：
   - `find` **不得包含 markdown 表格分隔行**（`/^\|[\s:|-]+\|$/m`）；
   - ⚠ **这条不够**（可绕过：从分隔行**之后**开始、覆盖全部数据行、避开分隔行 ⇒ 守卫绿而表仍被 pin）
     ⇒ 追加闭集判据：**`find` 内以 `|` 起始的连续行 ≤ 1**（即最多一行表格行）；
   - 单条 `find` 长度上限（**上限值在实施首个清单时按实际分布定死，并写成测试常量**；不要留开放值）。
   - ⚠ 上限值必须由「拆分后的实际分布」定，不要先拍一个数字导致大面积假红。
3. **全量普查（**与解 pin 分开交付**）**：9 个清单逐条过一遍，凡 `find` 覆盖了与机制无关的散文 / 整表 / 多段，一律拆分。
   ⚠ **普查不算本条的 P1 范围**：本条 P1 只承诺「解除 `prompts/build.md` 的 pin + 守卫框架」；
   其余清单（`role-class-write-set` 126 edits / `delegate-knowledge-delivery` 76 / `plan-topics` 14 /
   `plan-delegate` 48 / `model-fallback` 14 / `delegate-slot-kernel` 35 / `commit-gate` 29 /
   `rollback-manifest-enforcement` 3）作为**后续 check list** 推进，或单独立项。
   理由：它们不在任何关键路径上，打包进 P1 会让交付被体力活拖住，且与本条「不要先拍数字」的谨慎原则一致。
4. **不改** `lib/rollback-drill.ts` 的 `find_count` 判据（判据是对的；错的是 `find` 的粒度）。

**备选方案（已排除）**：

| 方案 | 内容 | 为什么不选 |
|---|---|---|
| B2 | 放宽 `find_count` 判据（允许出现多次 / 只查前缀） | 直接削弱回滚安全性 —— 回滚要能**精确**还原，判据是唯一保障 |
| B3 | 让 `.rddf/rollback/**` 进 `architect.allow`，让文档作者自己同步 | 治标：仍然要求「改散文 ⇒ 同步回滚清单」，只是换了个人做；且把机制面写权交给 architect，与 `ADR-governance-paths-ownership` D2 的第一不变量冲突 |

## Acceptance

**判据一律可机检**（不用「不含任何与机制无关的行」这类开放判据）：

- [ ] `governance-paths-config.json::edits[13]` 的 `find` **不含**表头行字面（`| 角色 |`）、
      **`|` 起始的连续行 ≤ 1**、**长度 ≤ 测试常量 `MAX_FIND_LEN`**（该常量在实施首个清单时定死）；`edits[14]` / `edits[11]` 同理
- [ ] **负向验证**：改 `prompts/build.md` 角色表里与机制无关的单元格（如某行的排版 / 与 `GOVERNANCE_PATHS` 无关的散文）⇒ `bun test tests/` **不再**报 `find_count`
- [ ] **正向验证**：回滚演练仍能完整还原（`planDrill` 全绿 + 该清单的 `verify.commands` 跑通）—— 拆小不能破坏可还原性
- [ ] 新守卫断言生效：任一 `find` 含表格分隔行 / `|` 起始行 > 1 / 超 `MAX_FIND_LEN` ⇒ 红
- [ ] **本条改动范围内**的清单（`governance-paths-config.json`）通过新守卫；其余 8 个在**后续 check list** 里逐条收敛
      （⚠ 不要求本条一次过 9 个 —— 但须在 change 的 tasks 里登记那 8 条，不允许静默遗留）
- [ ] `bun test tests/` 全绿（含 `rollback-manifests.test.ts` 的 20 例）

## Capabilities

- **MUST**：治理面 / 架构文档的**非机制性**编辑不再触发回滚清单漂移
- **MUST NOT**：削弱「`find` 恰 1 次」与「回滚可完整还原」这两条安全判据
- **MUST NOT**：把 `.rddf/rollback/**` 的写权交给 architect（与 ADR D2 冲突）

## Impact

- **影响面**：`.rddf/rollback/governance-paths-config.json`（+ 其余 8 个清单的普查）·
  `tests/rollback-manifests.test.ts`（新增断言）
- **审查**：改守卫断言 = **治理面必审**（按 `build.md` §审查配对：`tests/config-guards.test.ts`
  同规格；`rollback-manifests.test.ts` 是同一类「什么算漂移」的判据）⇒ **oracle → critic**
- **回滚**：本条自身无「机制」可回滚（是清单维护 + 守卫加固）；若拆分出错，
  `git revert` 即可（清单是纯数据）
- **依赖**：**无前置**；**被 C 依赖**（C 加机读块前须先解开 pin）
- **风险**：拆分过细会让 `find` 失去唯一性（`find_count` 反而不满足）⇒ 每条拆出的片段必须在
  **演化后的缓冲**里仍唯一；实施时逐条跑 `planDrill`
