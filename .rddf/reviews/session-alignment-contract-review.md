# 审稿记录 — 会话间对齐契约批次（v2.28）

> 批次：`v2.28`（`docs/CHANGELOG.md` v2.28 条目）
> 范围：`lib/delegate-core.ts`、`prompts/{plan,build,front}.md`、`tests/config-guards.test.ts`、
> `tests/delegate-core.test.ts`、`docs/guard-authoring.md`、`.rddf/plans/session-alignment-contract.md`
> 治理面判定：改了 `prompts/**` + 守卫断言增删 + `lib/**` ⇒ 属治理面 ⇒ **oracle → critic 各 1 轮**

## 1. 做了什么（三层对齐，每层一个真源）

| 层 | 真源 | 投影 | 守卫 |
|---|---|---|---|
| ① 插件 ⇄ 简报 | `DELEGATE_RESULT_FIELDS`（**27** 字段）/ `DELEGATE_RESULT_CRITICAL_FIELDS`（7 字段） | 插件运行时**自检**（`assertDelegateResultShape`，缺字段 ⇒ 硬错） | AC21 / AC21b / AC22 |
| ② 插件 ⇄ 派发方 prompt | 同 ① | `prompts/plan.md` 的「delegate 返回值」小节 + front.md 的既有小节 | AC21（字段覆盖）/ AC21b（纪律句） |
| ③ 配置 ⇄ prompt | `opencode.jsonc` 的 permission | `capabilityBlock()` 渲染的 `<!-- capability:<agent>` 块（三份 prompt 各一） | AC23（逐字 + 恰好 1 处 + 标记独占 1 行）/ AC24（散文不得复述） |

**跨仓行为层**（另一仓）：`rdd-workflow-e2e` 的 **CS-7**（真派 session ⇒ `unverified` 降级 ⇒ 派发方不得说「已完成」）。

## 2. TDD 证据（先红后绿）

| 任务 | 红灯 | 绿灯 |
|---|---|---|
| 契约真源 | `DELEGATE_RESULT_FIELDS 未导出（返回值契约缺单一真源）` | 16 断言通过 |
| AC21 / AC21b | plan.md 缺 `host_outcome` / `blocked_reason` / `no_work_evidence` / `artifacts` / `out_of_scope_files`；缺纪律句 | 通过 |
| AC23 | 三份 prompt 都缺能力面块 | 通过（后续升级为逐字三件套） |
| AC22 | **当场即绿**（契约照实现写的 ⇒ 它是**防漂移**守卫，不是红→绿任务） | 通过 |
| 变红演练 3 例 | ① 删 plan.md 纪律句 ⇒ AC21b 红；② 改配置的 plan edit 白名单（块未同步）⇒ AC23 红；③ 改块的 edit 行 ⇒ AC23 红 | 还原后全绿 |

## 3. oracle — `PASS-WITH-NOTES`（11 条建议全部落地）

4 条高影响：① AC23 补「恰好 1 处 + 标记独占 1 行」（镜像 AC19 三件套）；② 能力面块渲染收进 lib
（`capabilityBlock`，与另两块同形 ⇒ **派生规则只有一处**）；③ `assertDelegateResultShape` 补行为级单测
（此前**零调用**）；④ 计划文件与实际执行的偏差修正（编号、勾选、oracle 轮的后续升级）。

4 条中影响：⑤ 「字段全集见 front.md」的宣称**超出守卫覆盖** ⇒ 收窄为「全集 = 插件清单；语义 = front 小节」
（配套的 AC23b 随之删除 —— 它要求 front.md 列出全部 27 个字段 ⇒ prompt 噪音）；⑥ 注释枚举补 `out_of_scope_files`；
⑦ plan.md 的指针改用**标题名**（本仓约定禁 `/§\d/` 引用）；⑧ 能力面块头注释的**覆盖宣称收窄**。

3 条低影响：⑨ AC21 的 `outcome` 平凡性（子串）；⑩ describe 头登记已知边界；⑪ assert 顺序（不改，理由见 §4）。

## 4. critic — `APPROVE_WITH_CONDITIONS`（无 BLOCKER；4 SHOULD_FIX 全闭合）

| # | finding | 闭合方式 |
|---|---|---|
| 1 | **真缺陷**：`wait_error` 取值恒为 `undefined` ⇒ `JSON.stringify` **丢键** ⇒ 线上 payload 只有 **26/27** 个契约字段，而运行时自检（用 `in` 判内存对象）与静态 AC22（扫源码）**两层都看不见** | ① `wait_error: waitError ?? null`；② 自检改为查**序列化之后**的对象（通用防线）；③ 新增 **AC21d** 单测把「undefined ⇒ 序列化丢键 ⇒ 自检必须查序列化后」钉住；④ 另核：其余 5 个简写字段（`vcs`/`kind`/`outcome`/`blocked_reason`/`blocked_action`/`blocked_all`）**必然有值** ⇒ 本类缺陷仅此一处 |
| 2 | plan.md 的表两行虽改为指向块，**括注仍是能力面复述**（不受 AC24 保护）⇒ 漂移风险复活 | 括注**删除** ⇒ 纯指针（AC24 的结构判据：能力面行必须含 `capability:`） |
| 3 | assert 落点（副作用**之后**）缺决策记录与恢复路径 | lib 注释补：两个备选（前置 ⇒ 槽位滞留；后置 ⇒ 终态已落盘可取证）＋「失败要响，但状态不许腐」 |
| 4 | 已知边界未登记 `capabilityBlock` 的**维度闭集**（只渲染 edit/shell/delegate） | describe 头补该边界 |
| NIT 1 | accepted-roots 守卫缺第三件（v2.26 既有，非本批） | 记入交接残留清单 ⑥ |
| NIT 2 | build.md / front.md 的块头注释照抄了 plan.md 版本 | 改为各自的措辞 |

## 5. 验证

| 项 | 结果 |
|---|---|
| `bun test tests/` | **544 pass / 0 fail**（exit 0） |
| `bash scripts/check-upstream-anchors.sh` | **23/23**（exit 0） |
| 变红演练 3 例 | 逐条实跑通过（注入红 / 还原绿） |
| 跨仓 CS-7 | 实跑通过（另一仓） |

## 6. 残留（如实登记）

1. `capabilityBlock()` 只渲染 **3 个维度** ⇒ 配置**新增** permission 维度时块与 AC23 都不会自动扩。
2. AC21 = **覆盖**判据（否定句里出现字段名也算过；威胁模型是漂移不是伪造）。
3. AC21b = **措辞**判据（换同义词即红 —— fail-closed，逼改守卫的人同步改判据）。
4. `outcome=busy` 的**早退拒绝**是另一种形状，不在契约内。
5. **accepted-roots 守卫缺第三件**（v2.26 既有实现）。
6. 跨仓那半**无 CI 守卫**（人工 `diff`）。
