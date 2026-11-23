# improvement: role-write-set-machine-block

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：治理面 P1 审查（本轮**被迫用「表尾投影」绕路**）——
> 记录见 `rdd-workflow` 仓 `.rddf/reviews/governance-p1-docs-2026-11-23.md` §三 NIT-4 / §四
> 与 `.rddf/reviews/docs-alignment-debt-audit-2026-11-23.md` §3.2 / §3.6。
> 关联 change：**尚未立项**（`backlog: role-write-set-machine-block`）。
> planner 审查：**metis 1 轮**（2026-11-23，与其余 3 份同批）。已按其建议修订：
> **删除「全角色汇总块」退让**（与 AC「每角色一块」互斥、白加守卫复杂度）· 范围**缩到只动
> `prompts/build.md`**（plan.md / front.md 另立项）· 补 `builder`/`general`（`**`）与
> `no-role`（`(none)` + `denyAll`）的**渲染形态定义** · AC 后半给 grep 判据 ·
> 依赖表述改为「**B 是硬前置**」（现有 `role-class-write-set.json` 已 pin 着这张表）。
> 执行路径：**常规 change**（机制面 `lib/**` + `tests/**` + 治理面 `prompts/**` ⇒ builder 主导 + oracle → critic）。
> ⚠ 优先级：**P2** —— 不阻断任何流程，但它是「写集散文静默漂移」这一类的**根治项**。

## Why

`lib/role-policy.ts::ROLE_WRITE_POLICY`（AC16 声明为「角色 → 写根的唯一真源」）有 **6 个角色**，
但 `prompts/*.md` 里只有 **`verifier` 一个**有**规范机读块**：

| 角色 | 机读块 | 守卫 |
|---|---|---|
| `verifier` | ✅ `<!-- role-class-write-set:verifier -->`，由 `lib/delegate-core.ts:935::verifierWriteSetBlock()` 渲染，**三份 prompt**（`build.md` / `plan.md` / `front.md`）各嵌逐字副本 | ✅ `tests/config-guards.test.ts:2885` AC19：**精确字符串比对 + 恰好 1 处 + 标记独占一行** |
| `architect` · `planner` · `builder` · `no-role` · `general` | ❌ **只有散文** | ❌ 无 |

**为什么散文必漂**：`lib/delegate-core.ts` 自己的注释把这套推理写得很清楚
（`:925-934`）：「散文是**开集**的（换一种说法就绕过判据）；机读块是**闭集**的（只能等于渲染结果）」。
⇒ 五角色的写集**只能用散文表达** ⇒ **没有任何守卫比对** ⇒ 改 `ROLE_WRITE_POLICY` 不会让任何测试变红。

**已发生的漂移（本轮实测）**：
- `architect.allow` 含 `.rddf/reviews`，但 `build.md:454` 的「允许」列**不提**它；
- `verifier.allow` 含 `.rddf/state/verifier`，但 `build.md:457` 的「允许」列**不提**它；
- 两者都**逃过了全部守卫**（`bun test` 在此前 1133 项里无一覆盖）——只有人工对齐审查才发现。

**本轮的绕路暴露了问题的性质**：因回滚清单 pin 住整表（见 `rollback-manifest-find-narrowing`），
只能新增「表尾 6 角色写集逐字投影」块 —— 那是**第三份无守卫副本**（另一份是散文，再一份是
`ROLE_WRITE_POLICY` 本身），**问题只是被搬了个位置**。

## What Changes

1. **`lib/delegate-core.ts`**：加 5 个角色块渲染（`architect` / `planner` / `builder` / `noRole` / `general`），
   **与 `verifierWriteSetBlock()` 完全同范式**（从 `ROLE_WRITE_POLICY` 渲染，不手抄字面量）。
   建议抽一个通用 `renderWriteSetBlock(role)`，避免 6 份重复实现（`verifier` 那份改为调它）。
   ⚠ **三种特殊形态必须先在设计里定死**（否则实施第一个就卡住）：
   - `builder` / `general`：`allow: ["**"]` ⇒ 块内写 `allow: **`（单个 `**`）
   - `no-role`：`allow: []` + `denyAll: true` ⇒ 块内写 `allow: (none)` + `denyAll: true`
     （**不要**写成空 `allow:` 行 —— 守卫的 `split(", ")` 解析会得到 `[""]`）
   - 其余四角色：`allow: p1, p2, ...`（现有 `verifier` 形态）
2. **`prompts/build.md`**：角色列表表**之后**（或每角色的小节里）插入 6 块机读块；
   **「允许」列的散文改为指向本块，不再复述写集路径**（这是 `delegate-core.ts:928-931` 已定的原则）。
   ⚠ 原「表尾投影」散文块要么删除、要么改为对机读块的指针（**不要留两份**）。
3. **`tests/config-guards.test.ts`**：把 AC19 的判据**泛化**成断言族（对 6 个角色）：
   「机读块 == lib 渲染的规范块（逐字）· 恰好 1 处 · 起始标记独占一行」。
   AC19 现有的 verifier 那一条保留（或改为族的一员）。
4. **本条只动 `prompts/build.md`**。`prompts/plan.md` / `prompts/front.md` 要不要嵌「非 verifier」角色的块
   **另立项决定**（「按实际需要补」在 AC 里无法验收 —— 会变成开放判据）。
   理由：这三个角色（architect / planner / builder / no-role / general）的写集**主要约束 build agent**；
   plan / front 是否受影响需单独判断，不与本条捆绑。
5. **不改** `ROLE_WRITE_POLICY` 的内容（真源不动；本条只加强投影与守卫）。

**备选方案（已排除）**：

| 方案 | 内容 | 为什么不选 |
|---|---|---|
| C2 | 只加「表尾一块」散文投影（= 本轮已做的） | 无守卫副本 ⇒ 下次照漂；本轮已证明这个绕路只是把问题搬位置 |
| C3 | 用手写脚本定期 diff 散文 ↔ `ROLE_WRITE_POLICY` | 又回到「解析散文」≈ 开集判据；且要人跑，不在 `bun test` 里 |
| C4 | 让「允许」列直接生成（文档由代码渲染） | 改动面过大（`prompts/*.md` 是 agent 的 system prompt，需保证可读性与人工编辑性） |

## Acceptance

- [ ] **6 个角色**各有写集机读块，且 `bun test` 的断言族对每个块做**逐字比对 + 恰好 1 处 + 标记独占一行**（照 AC19 `:2885` 范式）
- [ ] **三种特殊形态**都被覆盖：`builder` / `general` 的块含 `allow: **`；`no-role` 的块含 `allow: (none)` + `denyAll: true`
      （**不是**空 `allow:` 行）
- [ ] **负向验证**：改 `ROLE_WRITE_POLICY` 的任一条（如给 `architect` 加一个路径 / 删一个）⇒ `bun test` **红**
- [ ] **负向验证**：手改任一机读块的一个字符 ⇒ 红；多复制一份 ⇒ 红
- [ ] `prompts/build.md` 的角色列表「允许」列**不再复述写集路径**（改为指向块）；
      **判据**：在 `prompts/build.md` 内 grep `.rddf/reviews` / `.rddf/state/verifier` / `.rddf/config/arch-docs.json`
      等写集路径，**只允许出现在机读块边界内**（块起止标记之间），块外的命中数 == 0
- [ ] **不存在第三份无守卫副本**（判据同上：本轮的表尾散文投影已删除或改为对块的指针）
- [ ] `bun test tests/` 全绿
- [ ] `lib/role-policy.ts::ROLE_WRITE_POLICY` 的「定义点恰好 1 处」守卫（AC16）仍绿

## Capabilities

- **MUST**：任一角色的写集与 `ROLE_WRITE_POLICY` 漂移都能被 `bun test` 发现
- **MUST NOT**：让散文继续承担写集判据（`delegate-core.ts:928-931` 已定的原则）
- **MUST NOT**：在文档里保留多份写集副本（每角色**一块**，散文指向它）

## Impact

- **影响面**：`lib/delegate-core.ts`（+5 渲染函数或 1 个通用函数）· `prompts/build.md`（6 块 + 散文改写）·
  `tests/config-guards.test.ts`（AC19 泛化）· 可能 `prompts/plan.md` / `front.md`
- **审查**：机制面（`lib/**`）+ 守卫断言变更 ⇒ **治理面必审** ⇒ oracle → critic
- **回滚**：建议登记进 `.rddf/rollback/`（与 `role-class-write-set.json` 同族）
- **依赖**：**B 是硬前置，不是「预防性」** —— `role-class-write-set.json`（126 edits / max find 8844）
  **现在就已经 pin 着 `prompts/build.md` 的角色表**，C 的第一步（改表）立刻会撞 `find_count` 漂移。
  不做 B ⇒ C 无法起步。
- **风险**：6 个块让 `prompts/build.md` 变长（每块 4 行 × 6 = 24 行）—— 可接受（换来可机检）。
  ⚠ **不建议**改成「一块全角色汇总块」：它与 AC1「6 个角色各有块」互斥，且需要守卫支持第二种渲染形态 ⇒
  白加复杂度换 20 行篇幅，不划算。
