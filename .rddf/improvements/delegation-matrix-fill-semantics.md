# improvement: delegation-matrix-fill-semantics

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：治理面 P1 审查（`oracle` focus-1 + `critic` SF-2 / 清单外发现，均标 `scope_exceeded`）——
> 记录见 `rdd-workflow` 仓 `.rddf/reviews/governance-p1-docs-2026-11-23.md` §三 SF-2 / §六-4
> 与 `.rddf/reviews/docs-alignment-debt-audit-2026-11-23.md` §3.6。
> 关联 change：**尚未立项**（`backlog: delegation-matrix-fill-semantics`）。
> planner 审查：**metis 1 轮**（2026-11-23，与其余 3 份同批）。已按其建议修订：
> 机检**落点写死 `tests/config-guards.test.ts`**（落 `scripts/` 会逃出 `bun test` 闭环）·
> **位置解析也闭集化**（表头闭集字面 + 每行标签 ∈ 闭集 + 格值正则），不只闭集格值 ·
> 「最小解」退路加**触发条件**（须双审判定「双值格不可读」才可走）· 补配置三形态的推导覆盖。
> 执行路径：**常规 change**（治理面 MAD ⇒ oracle → critic）。
> ⚠ 优先级：**P2** —— 不阻断流程（每格都有旁注可判），但它让矩阵**失去「一眼可判」的价值**。
> ⚠ **依赖 `librarian-delegate-contradiction` 先落地**（先定机器层真值，再让矩阵对齐）。

## Why

`docs/MULTI-AGENT-DESIGN.md` §3.1 委派矩阵自声明「**本矩阵只回答「允许调谁」**」（`:660`）——
即**权限语义**。但实测填充规则**三轨并存**：

| 格 | 填的什么 | 机器层真值（`permission.subagent`） | 判定 |
|---|---|---|---|
| `build → general` | `✅` | `build` = `"allow"`（全量） | 按权限 ✅（一致） |
| `build → plan-worker` | `✅`（本轮新增） | 同上 | 按权限 ✅（一致） |
| `plan → plan-worker` | `✅`（本轮新增） | `plan` = `"allow"`（全量） | 按权限 ✅（一致） |
| `plan → context-builder` | **`❌`** | `plan` = `"allow"` ⇒ **权限上可调** | **按流程填**（旁注自认「权限拓扑上 build/plan 均可调」） |
| `librarian → explore` | **`✅✅（本地搜索）`** | `librarian` = **`"deny"`** ⇒ **权限上不可调** | **与机器层相反**（见 `librarian-delegate-contradiction`） |

⇒ 同一个 `✅` 有时表示「权限允许」、有时表示「流程会用」；同一个 `❌` 有时是「机器拒绝」、
有时是「机器允许但流程不用」；还有一格 `✅✅` 是**机器拒绝**。

**同文档还有一处直接矛盾**：ASCII 拓扑图 `:630` 写
「general (subagent, 独立分支，**不能被任何 agent 调**，也不能调别人)」，
而矩阵 `build → general = ✅`、`plan → general = ✅✅（优先）`（`:641-642`）。

**后果**（不是「文档不整齐」）：
1. **读者无法从矩阵推出「能不能调」** —— 矩阵的首要用途失效；
2. **agent 据矩阵做派发决策会误判** —— 例如读 `plan → context-builder = ❌` 就以为调不了，
   或读 `librarian → explore = ✅✅` 就去调一个被机器层拒绝的工具；
3. 本轮已因此付出代价：`oracle` 与 `metis` 对「`build → plan-worker` 填什么」给出**相反结论**，
   原因是两人对矩阵语义的解读不同 —— **一个文档让两个审查者读出两个意思**，本身就是判据缺陷。

## What Changes

**采用 D1（拆两轴）**：让「权限」与「流程」各自可核实，不再挤在同一格。

1. **矩阵改成双值格**（推荐形态，最小结构改动）：
   `权限/流程`，例如 `✅/✅`、`✅/—`（权限允许但流程无消费者）、`❌/—`（机器拒绝）。
   - 表头下一行给图例：`✅ = 允许 · ❌ = 拒绝 · — = 无消费者（流程上不使用）`
   - `plan → context-builder` ⇒ `✅/—`（旁注说明「流程上只由 build 调」）
   - `build → plan-worker` ⇒ `✅/—`（旁注说明「流程上只由 plan 派」）
   - `librarian → explore` ⇒ 视 `librarian-delegate-contradiction` 的裁决：
     若采纳 A1（放开白名单）⇒ `✅/✅`；若采纳 A2（收回 prompt）⇒ `❌/—`
2. **自声明改写**：`：660` 的「本矩阵只回答「允许调谁」」→「本矩阵给**两轴**：`权限`（= 机器层
   `permission.subagent`，可机检）+ `流程`（= 是否有消费者，指到对应 prompt 段）」。
3. **修正 ASCII 图 `:630`**：general 那句与矩阵二选一（要么改图说「build / plan 可调，但流程上不用」，
   要么矩阵改成 `❌`——但后者与守卫 AC4 冲突，故**改图**）。
4. **加机检断言（落点写死 `tests/config-guards.test.ts`）**：解析矩阵的**权限轴** ↔ 配置 `permission.subagent`；
   只允许「权限 ✅ / 流程 —」这一种合理差异，其余不一致 ⇒ 红。
   ⚠ **落 `tests/` 不落 `scripts/`** —— 只有落 `tests/` 才在 `bun test` 闭环内（落 `scripts/` 会逃出 CI 门）。
   ⚠ **解析必须两处都闭集化**（只闭集格值不够）：
   - **位置闭集**：先断言**表头行** == 闭集字面（`| 调用方 ↓ \ 被调方 → | front | build | plan | explore | librarian | oracle | metis | general | critic | context-builder | plan-worker |`），
     且**每行行首标签** ∈ 同一闭集 ⇒ 行列位置可确定，不靠模糊匹配；
   - **格值闭集**：格值正则 `/^(✅|❌|—)\/(✅|❌|—)$/`（或 `✅✅` 类的既有例外需显式列入）。
   - 备选（更彻底）：给矩阵加**机读锚注释**（仿 `role-class-write-set` 标记），把「权限轴」直接写成
     一格一块的机读投影，彻底去掉 markdown 结构解析 —— 若位置解析仍显脆，走这条。

**备选方案（已排除）**：

| 方案 | 内容 | 为什么不选 |
|---|---|---|
| D2 | 统一按**权限**填 + 流程限定全移旁注 | 会让 `plan → context-builder` 从 ❌ 变 ✅；旁注承担了 5 条以上限定 ⇒ 旁注变成第二套矩阵 |
| D3 | 统一按**流程**填 + 旁注标「权限上可调」 | `build → plan-worker` 要变 ❌，与守卫 AC4（可派者集合 == `{build, plan}`）直接矛盾；本轮已否决 |
| D4 | 删掉矩阵，只留 ASCII 图 | 图无法表达 11×11；且矩阵是 agent 的可查表 |

## Acceptance

- [ ] 矩阵每一格的**权限轴**都能由 `permission.subagent` 机检复现（`tests/config-guards.test.ts` 的断言，
      允许的差异只有「权限 ✅ / 流程 —」）；⚠ 配置有三种形态（字符串 `"allow"` / 字典白名单 / 字符串 `"deny"`），
      推导逻辑须覆盖三者
- [ ] 解析**位置**与**格值**都闭集：表头行 == 闭集字面（含 `plan-worker` 列）、每行行首标签 ∈ 闭集、
      格值匹配 `/^(✅|❌|—)\/(✅|❌|—)$/`（`✅✅` 类既有例外须显式列入白名单）
- [ ] `:660` 的自声明文本**含字面** `权限` 与 `流程`（双轴）；不再含「只回答「允许调谁」」这一单轴表述
- [ ] `:630` 的 ASCII 图**不再含字面** `不能被任何 agent 调`
- [ ] `librarian → explore` 格的权限轴 == 配置推导结果（由上面 AC1 的机检断言覆盖，不单独判）
- [ ] `bun test tests/` 全绿

## Capabilities

- **MUST**：任一格的两个轴都能追溯到**一个可机检的真源**（权限 = 配置；流程 = 指名到 prompt 段落）
- **MUST NOT**：保留「同一符号两种语义」的双轨填充
- **MUST NOT**：用旁注替代矩阵的第二轴（旁注只解释，不承担判据）

## Impact

- **影响面**：`docs/MULTI-AGENT-DESIGN.md` §3.1 矩阵 + `:630` ASCII 图 + `:660` 自声明；
  可能新增 `scripts/` 下的解析脚本或 `tests/config-guards.test.ts` 断言（后者 ⇒ 治理面必审）
- **审查**：治理面 ⇒ **oracle → critic**（改表格行 + 自声明 + 可能改守卫）
- **回滚**：纯文档 + 可能一条守卫；`git revert` 即可
- **依赖**：**依赖 `librarian-delegate-contradiction`**（否则 `librarian → explore` 那一格无真值可依）
- **风险**：双值格会略微降低可扫读性 —— 用图例行 + 旁注补偿。
  **退路（须满足条件才可走）**：若**双值格在 oracle/critic 双审中被判定「不可读」**，
  则退到「只把 `plan → context-builder` 改为 `✅/—` 并在该格注明『已知例外』」。
  ⚠ 该退路**只在上述条件成立时才允许** —— 否则它会变成「用旁注替代第二轴」，
  与 D2 的排除理由（旁注承担限定 ⇒ 第二套矩阵）冲突。
