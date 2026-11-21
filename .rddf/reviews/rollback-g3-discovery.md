# G3 `role-class-write-set` 清单受阻 —— 退役面与**未登记机制**耦合

> 发现者：builder；日期：2026-11-21
> 阻塞对象：清存量债 G3（`backend-handoff-role-class` / `class-write-scope-alignment`，2 条）
> 性质：**决策级**（U12 T3 的「依赖归属」命中一条**未登记**机制）—— 不是清单写作体力问题。

## 1 G3 的退役面（已摸清，证据见下）

两份 ADR 的 `回滚口径` 都**不是**「删机制」：

- `ADR-backend-handoff-role-class:141-144`：「停传 `role_class` 即回到缺省 `builder` … 回滚不触碰
  `current_role` / `pair.json` 既有必填字段 / D4/D7 判据 —— 本决策的全部增量都在「新字段 + 新校验」，
  **删掉校验即可恢复旧行为**」。
- `ADR-class-write-scope-alignment:193-194`：「`classAllowRoots("verifier")` 去掉 `.rddf/state/verifier`（单点）
  + 三处 prompt 文本回退」。

落点（实测，`grep -rn role_class|roleClass|classAllowRoots`）：

| 面 | 落点 | 规模 |
|---|---|---|
| 代码 | `lib/delegate-core.ts`（`ROLE_CLASSES` / `parseRoleClass` / `classAllowRoots` / `assertRoleClassCompatible` / `assertResumeRoleClass` / `classSubagentRules` / `VERIFIER_ALLOW_ROOTS` / `VERIFIER_OWNS_PATHS` / `verifierWriteSetBlock` / `assertVerifierBaseline` / 工具 schema 的 `role_class` 参数 / 简报运行身份段） | **76 处** |
| 其它生产文件 | `lib/delegate-async.ts`（G1 删）/ `lib/role-lease.ts`（6）/ `lib/role-identity.ts`（5）/ `plugins/role-gate.ts`（4）/ `plugins/commit-gate.ts`（3）/ `lib/role-policy.ts`（3） | 21 处 |
| prompt | `prompts/plan.md`（选类表 + 机读块 + 换类教学 + resume 禁令）/ `front.md`（`role_class` 参数行 + 机读块 + 复核项 + 错误归因行）/ `build.md`（运行身份段 + 机读块 + 角色矩阵行） | ~14 段 |
| 文档 | `docs/backend-handoff-role-class.md`（**整份即本机制设计稿**，107 行）+ `MULTI-AGENT-DESIGN.md` + `guard-authoring.md` + 4 篇 ADR 的引用句 | ~8 段 |
| 守卫 / 测试 | `tests/config-guards.test.ts` 的三个专属 describe（role_class 投影 / 能力面判据对齐 / 能力面写集对齐 = `:2089-2104` / `:2428-2632` / `:2865-3267`）+ `tests/delegate-core.test.ts` 的 6 个 role_class describe + `tests/delegate-tool.test.ts` 的 2 个 + `role-session-write` / `role-policy` / `role-lease` 的混合断言 | ~14 段 |

## 2 三个耦合（决定「能不能写成一份清单」）

### ① `delegate-base-channel`（**未登记**机制）的执法点就是 `role_class === "verifier"`

`lib/delegate-core.ts::assertVerifierBaseline({ roleClass, vcs, base, workRoot })` ——
「verifier 后端必须声明基线」这条闸门**只对 `roleClass === "verifier"` 生效**。

⇒ 退役 `role_class`（回到缺省 builder）⇒ **这条闸门永不触发** ⇒ `delegate-base-channel`
被「顺带」退役，但它在 registry 里**没有条目**（census 16 条里没有它 ⇒ M1 无信号）。
⇒ 这正是 `ADR-rollback-manifest-enforcement` 要治的病（沉默退役）**在本机制自己身上复现**。

### ② `role_class` 字段被两条 `exempt` 机制依赖（字段 vs 能力）

- `role-aware-permissions`（exempt）：`plugins/role-gate.ts` 的后端判据③ = 「分区带 `role_class` ⇒ 跳过门控」；
  `ADR-role-aware-permissions:53` 明写「后端继续走 `scopeEditRules` / `classAllowRoots`」。
- `role-session-identity`（exempt）：`role.json` 的 `sessions[sid].role_class` 由 `writeRoleSession` 写、
  由 `readSessionPartition` 读。

⇒ 若**删字段** ⇒ 后端识别判据失去锚点（后端会被当成主会话门控）⇒ 改了 exempt 机制的语义。
⇒ 若**保留字段但恒 `builder`**（G2 采用的 Path 1 形态）⇒ 两条 exempt 机制行为不变 ✓
（代价：字段是残留，须登记）。

### ③ `class-write-scope-alignment` 的产物是 3 份 prompt 的**逐字机读块** + 3 个专属守卫

`verifierWriteSetBlock()` 渲染的 `<!-- role-class-write-set:verifier … -->` 嵌在
`build.md` / `plan.md` / `front.md`，守卫**逐字比对**；写集常量 `VERIFIER_ALLOW_ROOTS` /
`VERIFIER_OWNS_PATHS` 同时被 `classAllowRoots` 与守卫消费。

⇒ 退役它 = 同时删「渲染器 + 3 处块 + 3 个 describe」；**没有半撤的中间态**（块留一个字节就红）。

## 3 三条候选路径

- **A（推荐）务实版**：退役**能力**、保留**字段**（同 G2 的 Path 1）——
  ① 工具 schema 去掉 `role_class` 参数（派发方不能再选类）⇒ 一切走缺省 `builder`；
  ② `classAllowRoots` 三态退化为 builder 单态 ⇒ 删 architect/verifier 的写集上限；
  ③ 删 `verifierWriteSetBlock` + `VERIFIER_*` + 3 份 prompt 的机读块 + 3 个专属 describe；
  ④ `role.json` / lease / identity / role-gate / commit-gate 的 **`role_class` 字段保留**（恒 builder）
  ⇒ 两条 exempt 机制行为不变、无跨机制耦合；
  ⑤ **代价（须登记）**：`delegate-base-channel` 的「verifier 必填 base」闸门随之失效 ⇒
  **必须**同时处置它（见下）。
- **B（半退役，不推荐）**：只删输入与教学、内部保留三态 —— 套件绿但 `classAllowRoots` 仍在
  ⇒ 违反本文的 U3「实质退役」口径（prompt 不再教、代码仍能按类投影）。
- **C（合组）**：A + 把 `delegate-base-channel` **并入 G3 的 `retire[]` 与清单**（为它补一份
  ADR 或它自己的登记条目 —— 它现在**无 ADR、无条目**）。

## 4 为什么停下来（而不是继续写清单）

- U12 **T3 依赖归属**：「grep 该机制面的 import 方，若命中**另一条已登记条目**（尤其 `active`）⇒
  在「与该条目**合组**」与「**豁免**」之间二选一」。G3 命中的 `delegate-base-channel` 是
  **未登记**机制 ⇒ 规则没覆盖 ⇒ 需要 owner 决策（补登记后按 T3 处理，或直接合组）。
- 合组 = 把一条**没有决策记录**的机制并进 G3 的 `retire[]`（它的 `retired_evidence` 无处可指 ——
  M6 要求证据路径存在）⇒ 必须**先**给它补一份决策记录（`docs/adr/` 新篇，或
  `.rddf/reviews/*-verify.md`），后者属 architect/planner 的产出面。
- 结论：**G3 的清单在决策未定时写出来也会是错的**（要么漏掉 base-channel ⇒ 沉默退役；
  要么改动 exempt 机制语义 ⇒ 越权）。

## 5 G3 完成所需的最小前置（建议顺序）

1. **owner 裁决**：A（字段保留）+ 如何处理 `delegate-base-channel`（合组 / 单独补登记后豁免）。
2. 若合组 ⇒ 先给它补决策记录（新建 ADR 或确认既有 `.rddf/reviews/delegate-base-channel-*.md` 可作
   `adr_primary` —— M2 允许 `-verify.md`），再把它并入 G3 的 `adr_related[]` + `retire[]`。
3. builder 写清单（约 40–55 条 edits + `retire[]` 2–3 条）⇒ `--dry-run` ⇒ drill ⇒ 回填 ⇒ `active`。

## 6 当前状态（离开时）

- census：`declared=0 unmanifested=2 proving=0 active=11 retired=0 exempt=3`
  ⇒ 存量债 **10 → 2**（G1 四条 + G2 两条已清；剩 G3 两条）。
- 既有清单全部 `active` 且证据新鲜；`bun test tests/` 1069 pass / 1 skip / 0 fail。
- G3 的两份债指针仍在：`.rddf/rollback/pending/backend-handoff-role-class.md` /
  `.rddf/rollback/pending/class-write-scope-alignment.md`。
