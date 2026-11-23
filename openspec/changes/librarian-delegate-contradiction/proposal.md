# librarian-delegate-contradiction — librarian → explore 委派：机器层放开白名单（A1）

> **登记来源**：`.rddf/improvements/librarian-delegate-contradiction.md`（5 段草稿；planner 产出，metis 1 轮已处置）。
> **判据真源**：该 improvement 的 `## Acceptance` 段（AC 编号映射见下表；判据正文**不复制**，逐条指回）。
> **执行路径**：常规 change —— 跨配置 / 守卫 / 文档 ⇒ **治理面** ⇒ oracle（`审查域: 治理面`）→ critic。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在（`.rddf/state/.planner-handoff.json` 缺失）⇒ 走**内置流程**（本目录的 proposal / tasks 由实施者直接起草）。

## Why

`librarian → explore` 这条委派在三层给出**互斥**表述（improvement `## Why` 的逐条核实表）：

| 层 | 表述 | 出处 |
|---|---|---|
| 机器层 | `agent.librarian.permission.subagent = "deny"` | `opencode.jsonc.opencode-go`（`opencode.jsonc` 符号链接目标） |
| prompt 层 | 「用 `subagent` 工具委派：`agent: "explore"`」；「**仅可委派给 `explore`**」 | `prompts/librarian.md:24` · `:62` |
| 文档层 | 矩阵 `librarian → explore = ✅✅（本地搜索）`；§2.3 卡片「**只能**委派 `explore`」 | `docs/MULTI-AGENT-DESIGN.md` §3.1 · `:181` |

⇒ **prompt 要求的动作被机器层禁止，prompt 又禁止它自己搜**（`prompts/librarian.md:23`「不要自己 `grep` / `glob` 整个项目」）⇒ librarian 面对本地代码搜索只能编造 / 静默跳过 / 报错，**三者都不是设计意图**。

**采用 A1（放开机器层）**：让机器层追上已有的 prompt 与文档，而不是反过来削弱 librarian 的交叉验证能力。

## What Changes

1. **`opencode.jsonc.opencode-go`**：`agent.librarian.permission.subagent` 由字符串 `"deny"` 改为**字典白名单**（与 `front` 同形）：
   ```jsonc
   "subagent": { "*": "deny", "explore": "allow" }
   ```
   ⚠ `"*": "deny"` **必须是第一条**（last-match-wins：`"*": "deny"` 放末尾会隐藏整个 `subagent` 工具 —— 已发生过两次事故，见 `docs/SUBAGENT-ORCHESTRATION.md` §2.1）。
   ⚠ **符号链接处置**：`opencode.jsonc` 是符号链接（当前目标 `opencode.jsonc.opencode-go`）。本改动**只改目标文件、不动 symlink**；守卫 `tests/config-guards.test.ts` 经 `readFileSync(opencode.jsonc)` 跟随链接读到同一份内容 ⇒ 两侧落到同一份内容。
2. **`tests/config-guards.test.ts`**：
   - AC4（现 `tests/config-guards.test.ts:4439`）断言同步 ——「显式 `subagent: allow` 的集合 == `["build","plan"]`」改为「**字符串** `"allow"` 的集合 == `["build","plan"]`」（字典白名单的 agent 不计入）；⚠ 见下方 AC4 行的**偏差登记**（该断言位于被回滚清单整块 pin 的 describe 内，本次以**等价覆盖**的 `AC4c` 替代原地改文案）；
   - 新增 **AC4b**：`librarian` 的白名单闭集 == `["*", "explore"]`，首键为 `*` 且值为 `deny`，`explore` 为 `allow`，且**不含** `general` / `oracle` / `metis` / `critic` / `build` / `plan` / `context-builder`；
   - 新增 **AC4c**：可派者**四桶分类**闭集（字符串 `"allow"` / 字典白名单 / 字符串受限 / 无 `subagent` 键）—— 逐桶给出闭集 ⇒ 新增或改档任何 agent 都会红。
   ⚠ **落点约束**：新断言**放在新 describe 里**（`front 的 subagent 门控顺序` 之后），**不得**并入 `plan 侧多会话协作` 那个 describe —— 该块被 `.rddf/rollback/plan-topics.json` 的 `edits[8].find`（5229 字符）逐字节 pin 住 ⇒ 块内任何字节改动 ⇒ `find_count` 漂移 ⇒ `tests/rollback-manifests.test.ts` 红。
3. **`docs/SUBAGENT-ORCHESTRATION.md:38`**：agent 级 `permission.subagent` 白名单那一行补 `librarian` 只放行 `explore`。
4. **`docs/MULTI-AGENT-DESIGN.md`**：
   - §3.1 矩阵 `librarian → explore` 的 `✅✅（本地搜索）` **保持不变**（A1 后它成为真值）；
   - §2.3 `librarian` 卡片「**只能**委派 `explore`」**保持不变**（A1 后它成为真值）；
   - **§4.3 权限对比表**的 `task（subagent 委派）` 行：`librarian` 列由 `allow` 改为「仅 explore」+ 脚注（该表自述是「运行时实测值」⇒ 配置一改就必须回填；否则新增一处**反向**失真）；
   - §3.1 旁注（`:659`）引用 AC4 断言的措辞同步为「**字符串** `subagent: "allow"` 的集合」。
5. **`docs/CHANGELOG.md`**：一条版本条目（权限矩阵变更 ⇒ 历史增量可追）。

## 验收标准

> 判据正文真源 = `.rddf/improvements/librarian-delegate-contradiction.md` 的 `## Acceptance` 段；下表只给**编号映射 + 一句话 + 证据载体**。

| AC | 对应 improvement | 判据（一句话） | 证据载体 |
|---|---|---|---|
| AC1 | 第 1 条 | `agent.librarian.permission.subagent` 是**字典**：首键 `"*"`、值 `deny`、`explore` 为 `allow` | `tests/config-guards.test.ts` AC4b |
| AC2 | 第 2 条 | `prompts/librarian.md` 仍含字面 `agent: "explore"`（委派要求保留），且配置白名单含 `explore` | grep 证据 + AC4b |
| AC3 | 第 3 条 | librarian 白名单**不含** `general` / `oracle` / `metis` / `critic`（负向验证钉在守卫里） | `tests/config-guards.test.ts` AC4b |
| AC4 | 第 4 条 | ⚠ **偏差（已记录）**：原 AC4 断言文本**未改** —— 它位于 `plan 侧多会话协作` 那个被 `.rddf/rollback/plan-topics.json` **整块 pin** 的 describe 内（改它 ⇒ `find_count` 漂移 ⇒ `tests/rollback-manifests.test.ts` 红 ⇒ 须同批改机制面清单并重跑该机制的 rollback drill）。**语义等价覆盖**由新增用例 **AC4c** 提供：显式区分「字符串 `"allow"`」/「字典白名单」/「字符串受限」三桶并各给闭集 ⇒ 「可派者集合 == {build, plan}、`librarian` 不计入」这条不变式仍被**显式**钉住，且比原写法多钉一桶 | `tests/config-guards.test.ts` AC4c |
| AC5 | 第 5 条 | `docs/SUBAGENT-ORCHESTRATION.md` 的白名单那一行**同时含** `librarian` 与 `explore` | 该文件 grep |
| AC6 | 第 6 条 | `bun test tests/` **不新增失败**（基线已红项见下） | 验收报告 |
| AC7 | 第 7 条 | §3.1 矩阵 `librarian` 行 × `explore` 列**不含** `❌`（A1 后机器层允许；`delegation-matrix-fill-semantics` 未落地 ⇒ 本条由人工核对 + 散文回填覆盖） | `docs/MULTI-AGENT-DESIGN.md` |
| AC8 | **本 change 新增**（超出 improvement 显式 AC，但属**同一事实的回填**） | §4.3 权限表 `librarian` 的 task 列为「仅 explore」；§3.1 旁注的 AC4 引用同步 | `docs/MULTI-AGENT-DESIGN.md` |

> **AC6 的基线例外**：2026-11-23 基线（改动前）`bun test tests/` = **1133 pass / 1 skip / 1 fail**；唯一红项是
> `AC10④：父篇 ADR 的 commit 必须是代码 commit 的祖先或同一 commit`（`docs/adr/ADR-backend-handoff-role-class.md`
> vs `lib/delegate-core.ts`）—— 与本 change 无关（本 change 不碰这两条路径）⇒ 判据按「**不新增失败**」判。

## Out of Scope

1. **`prompts/librarian.md` 不改**（A1 是让机器层追上它）。其 `:62`「不可委派 `general` / `oracle` / `metis` / 其它」仍是**无守卫的散文** —— 本 change 只钉**配置侧**；prompt 侧改字不会让任何测试变红（improvement 已登记为「已知残留」，另立项）。
2. **不改已签批 ADR**：`docs/adr/ADR-front-knowledge-capability.md` D2/D3 的措辞提到 `librarian.subagent: deny`（历史加固动作）。本 change **不动决策内容**（深度 2 写链仍被封死：`general` 不在白名单）⇒ 措辞层面的同步属 architect 的 ADR 增补记录范围，登记为后续项。
3. **不登记 `.rddf/rollback/`**：按 improvement，登记须先完成 `rollback-manifest-find-narrowing`（否则新清单的 `find` 会再次 pin 住整表）⇒ 本次不做。
4. **不做运行时冒烟**（在 librarian 会话里确认 `explore` 出现在可用 subagent 清单、`general` 不出现）—— 需真实会话，属人工项，见验收报告。
5. **不改 §3.1 矩阵的填充语义**（`delegation-matrix-fill-semantics`，P2）—— 该 change **依赖本 change 先落地**（先定机器层真值，再让矩阵对齐）。
