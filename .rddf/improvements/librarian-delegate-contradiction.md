# improvement: librarian-delegate-contradiction

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：治理面 P1 审查（`critic` 第 1 轮 focus 外发现，`scope_exceeded: true`）——
> 记录见 `rdd-workflow` 仓 `.rddf/reviews/governance-p1-docs-2026-11-23.md` §三、§六-4
> 与 `.rddf/reviews/docs-alignment-debt-audit-2026-11-23.md` §3.6。
> 关联 change：**已归档**（2026-11-23） —— `openspec/changes/archive/2026-11-23-librarian-delegate-contradiction/`（2026-11-23；oracle → critic 双审通过，见 `.rddf/reviews/librarian-delegate-contradiction-review.md`；验收报告 `.rddf/reviews/librarian-delegate-contradiction-verify.md`）。
> ⚠ **实施偏差（登记）**：下方 AC 第 4 条「把 AC4 断言文案改成『**字符串** `"allow"`』」**未按字面落地** —— 该断言所在的 describe 被 `.rddf/rollback/plan-topics.json` 的 `edits[8].find`（5229 字符）**逐字节 pin** 住（改它 ⇒ `find_count` 漂移 ⇒ `tests/rollback-manifests.test.ts` 红 ⇒ 须同批改机制面清单并重跑该机制的 rollback drill）。**语义等价覆盖**由新增用例 **AC4c** 提供（可派者四桶闭集，比原判据更强）⇒ 待 `rollback-manifest-find-narrowing`（backlog）落地后再一次性搬运。
> ⚠ **ADR 措辞同步已单独立项**（本条**不改**已签批 ADR）：`docs/adr/ADR-front-knowledge-capability.md` D2 `:69` / D3 `:139` 的机制记法失真（**不变量本身仍成立**）⇒ 属 architect 的 ADR 增补记录，backlog 实体：`.rddf/improvements/adr-front-knowledge-librarian-whitelist-annotation.md`。
> planner 审查：**metis 1 轮**（2026-11-23，与其余 3 份同批）。已按其建议修订：
> AC 全部改**闭集字面**（删「一致」这类人判词）· 补 symlink 处置 · 补「prompt 侧散文仍无守卫」已知残留 ·
> 补运行时冒烟建议 · 记「配置 + 守卫必须同一 commit（原子）」。
> 执行路径：**常规 change**（跨配置 / prompt / 文档 / 守卫 ⇒ 治理面 ⇒ oracle → critic）。
> ⚠ 优先级：**P1** —— 这是唯一会让 agent **按 prompt 行动必然失败**的项。

## Why

`librarian → explore` 这条委派在三处给出**互斥**表述，且已逐条核实：

| 层 | 表述 | 出处 |
|---|---|---|
| **机器层** | `agent.librarian.permission.subagent = "deny"` | `opencode.jsonc.opencode-go`（`opencode.jsonc` 当前符号链接目标） |
| **prompt 层** | 「用 `subagent` 工具委派：`agent: "explore"`，并明确说明搜索目标」；「**仅可委派给 `explore`**……不可委派 `general` / `oracle` / `metis` / 其它」 | `prompts/librarian.md:24` · `:62` |
| **文档层** | 矩阵 `librarian → explore = ✅✅（本地搜索）`；ASCII 图「librarian 可调 explore（本地代码搜索）」 | `docs/MULTI-AGENT-DESIGN.md` §3.1 矩阵 · `:628` |

**为什么会真的出错**（不是「文档不一致」这种级别）：
1. `prompts/librarian.md` 把「委派 explore」写成**核心职责的一部分**（`:19` 标题就是「委派规则：本地代码搜索 → `explore`」），并明确「**不要自己 `grep` / `glob` 整个项目**」——即它被要求**不能**自己搜。
2. 机器层 `subagent = "deny"` ⇒ 该工具对 librarian 不可用（被拒或直接不出现在工具清单里）。
3. ⇒ librarian 面对「本地代码搜索」这类任务时：**prompt 要求的动作被机器层禁止，prompt 又禁止它自己搜** ⇒ 只能自行编造、静默跳过、或报错——**三种都不是设计意图**，且哪一种是**实现相关**的（取决于宿主是否隐藏被拒工具）。

**同类项已排除**：`build` / `plan` 是 `subagent: "allow"` 全量，不受影响；`front` 是字典白名单（`{"*": "deny", "explore"/"librarian"/"oracle"/"metis"/"critic": "allow"}`）⇒ **已有「白名单」范式可照抄**。

## What Changes

**采用 A1（放开机器层）**：让机器层匹配已有的 prompt 与文档，而不是反过来削弱 librarian 的交叉验证能力。

1. **`opencode.jsonc.opencode-go`**：`agent.librarian.permission.subagent` 从 `"deny"` 改为**字典白名单**（与 `front` 同形）：
   ```jsonc
   "subagent": { "*": "deny", "explore": "allow" }
   ```
   ⚠ `"*": "deny"` **必须是第一条**（last-match-wins；`docs/SUBAGENT-ORCHESTRATION.md` §2.1 已记录「`*: deny` 放末尾会把整个工具隐藏」这一事故两次）。
   ⚠ **符号链接处置**：`opencode.jsonc` 是**符号链接**，当前指向 `opencode.jsonc.opencode-go`。本改动只改**目标文件**，
   **不动 symlink**。守卫（`tests/config-guards.test.ts`）读配置的路径以其现有实现为准 —— 实施时先确认它走的是
   symlink 路径还是目标路径，**两者都必须落到同一份内容**（若守卫读 symlink，改目标即生效；不得为迁就路径再复制一份配置）。
2. **`tests/config-guards.test.ts`**：AC4（`:4367`）当前断言「显式 `subagent: allow` 的 agent 集合 == `["build","plan"]`」——A1 后需改为「**字符串 `"allow"`** 的集合 == `["build","plan"]`」，并新增断言「`librarian` 的 subagent 白名单 == `{explore}`」。**这是守卫断言的增删 ⇒ 治理面必审。**
3. **`docs/SUBAGENT-ORCHESTRATION.md:29`**：现写「agent 级 `permission.subagent` 白名单：`front` 只放行 5 个只读…；`build` / `plan` 全量 allow。」⇒ 补 `librarian` 只放行 `explore`。
4. **`docs/MULTI-AGENT-DESIGN.md`**：§3.1 矩阵 `librarian → explore` 的 `✅✅（本地搜索）` 保持不变（A1 后它**成为真值**）；`:628` ASCII 图同步（已是对的，无需改，但需在 change 里确认为「已验证一致」）。
5. **`prompts/librarian.md`**：**不改**（A1 是让机器层追上它）。

**备选方案（已排除，理由记录在此）**：

| 方案 | 内容 | 为什么不选 |
|---|---|---|
| A2 | 收回 prompt 的委派要求（删 `:19-25`，允许 librarian 自己 grep） | librarian 的「本地用法 vs 上游文档」交叉验证靠 `explore` 的专用检索；让它自己 grep 全仓既慢又违背「单一职责」 |
| A3 | 保留矛盾，在 prompt 里写「本委派在当前配置下不可用，降级为……」 | 留下一条「文档承认不可用」的退化路径；且降级行为未定义 |

## Acceptance

**判据一律用闭集字面**（不用「一致」这类人判词）：

- [ ] `agent.librarian.permission.subagent` 是**字典**，且 `Object.keys(dict)[0] === "*"`、`dict["*"] === "deny"`、`dict["explore"] === "allow"`
- [ ] `prompts/librarian.md` **含字面** `agent: "explore"`（当前的委派要求保留），且配置白名单含 `explore`
- [ ] **负向验证**：`librarian` 的子集白名单**不含** `general` / `oracle` / `metis` / `critic` —— 由 `tests/config-guards.test.ts` 的新断言
      `expect(Object.keys(libSub).sort()).toEqual(["*", "explore"])` 钉住
- [ ] `tests/config-guards.test.ts` 的 AC4（`:4367`）已同步：原断言「显式 `subagent: allow` 的集合 == `["build","plan"]`」
      改为「**字符串** `"allow"` 的集合 == `["build","plan"]`」（`librarian` 现在是字典，不再是字符串）
- [ ] `docs/SUBAGENT-ORCHESTRATION.md:29` 那一行**同时含字面** `librarian` 与 `explore`（grep 两 token 同行命中）
- [ ] `bun test tests/` **全绿**（含 AC4 同步后的断言）
- [ ] `docs/MULTI-AGENT-DESIGN.md` §3.1 矩阵的 `librarian` 行 × `explore` 列**不含** `❌`（A1 后机器层允许）；
      若 `delegation-matrix-fill-semantics` 已落地，则由其机检断言覆盖此格（本条不重复判）

## Capabilities

- **MUST**：`librarian` 能按其 prompt 完成「本地代码搜索委派给 `explore`」这一核心流程（工具可用且被允许）
- **MUST NOT**：放开 `librarian` 对 `explore` 之外任何 subagent 的调用
- **MUST NOT**：把 `"*": "deny"` 放到字典末尾（会隐藏整个 subagent 工具）

## Impact

- **影响面**：`opencode.jsonc.opencode-go`（配置面，**在** `GOVERNANCE_PATHS` 清单内）·
  `prompts/librarian.md`（不改）· `docs/MULTI-AGENT-DESIGN.md`（矩阵保持不变）·
  `docs/SUBAGENT-ORCHESTRATION.md:29` · `tests/config-guards.test.ts`（AC4 + 新断言）
- **审查**：全属治理面 ⇒ **oracle → critic 双审**；改守卫断言按治理面必审规则处理
- **回滚**：改动面 3 处（配置 1 行 / SO 1 行 / 守卫 1 组）⇒ 回滚成本低；建议登记进
  `.rddf/rollback/`（与既有 26 个机制同范式），但要**先完成 B**（`rollback-manifest-find-narrowing`），
  否则新清单的 `find` 会再次 pin 住整表
- **依赖**：无前置。**被 D 依赖**（D 的矩阵对齐需先有本条定下的机器层真值）
- **已知成本**：`librarian` 获得 `explore` 后，会多一层「委派开销」（一次 subagent 往返）；
  可接受——这正是原设计意图
- **已知残留（本条不处理，记录备用）**：`prompts/librarian.md:62` 的「不可委派 `general` / `oracle` / `metis` / 其它」
  仍是**无守卫的散文** —— 本条只钉住**配置侧**（白名单不含这几个），prompt 侧改字不会让任何测试变红。
  这与 `role-write-set-machine-block` 诊断的病同构（方向相反），若要根治需另立项（或并入 C 的范式）
- **原子性**：配置改动 + AC4 断言调整**必须同一 commit**（拆开 ⇒ 中间态必红）。**不要**拆成本条 + 「守卫改」两半
- **运行时不确定性**：`"deny"` 工具是「不出现在工具清单」还是「调用时报错」取决于宿主实现
  （草稿 Why 已指出这是实现相关的）⇒ 落地后建议补一次**运行时冒烟**（不是静态断言能覆盖的）：
  在 librarian 会话里确认 `explore` 出现在可用 subagent 清单、`general` 不出现
