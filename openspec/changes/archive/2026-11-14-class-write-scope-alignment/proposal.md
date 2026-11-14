# class-write-scope-alignment — 类写集与产品侧 skill / 审查配对的对齐

> 决策：`docs/adr/ADR-class-write-scope-alignment.md`（**Accepted** 2026-11-14，**用户签批「方向」**；oracle 2 轮：BLOCK → PASS-WITH-NOTES；critic 2 轮：REJECT → APPROVE / `mergeable: yes`）
> 父篇：`docs/adr/ADR-backend-handoff-role-class.md`（**修订其 D3 的 verifier 写集行**；D3 其余行 / D4 / D5 不动）
> 性质：**代码 + 父篇 ADR + 三处 prompt + 两份设计文档 + 守卫** ⇒ 治理面（守卫断言增删）⇒ oracle → critic 各 1 轮
> 关联 backlog：**本 change 建 stub** `.rddf/improvements/rdd-verifier-state-consolidation.md`（产品侧把 4 个根下点文件收拢进 `verifier/`；**本 change 不做**收拢）
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在 ⇒ 走**内置流程**。
> ⚠ **两套层级必须分清**（本 change 只动后者）：`prompts/build.md` 的**角色矩阵**（architect / planner / builder / verifier 这几个 **agent 角色**）与**被派发后端的运行身份**（`role_class` 能力面）是两回事；**角色矩阵不动**（skill 仍是 `.rddf/state/**` 的 single writer；「主会话代跑」= 主会话**执行 skill**，不是手工 edit 状态文件）。

## Why

两个实测缺口（都是「写集与别处契约不一致」，不是父篇 D3 的划分本身错）：

1. **越类**：`rdd-verifier` skill 的 `role.boundaries.owns` 是 **6 个路径**（`~/.agents/skills/rdd-verifier/SKILL.md:28-32` 的 4 项 + `:415` 的 halted audit + `scripts/run_verification.sh:7-9` 的 staged），其中**四个**在 `.rddf/state/` **根**下；且协议用 **Write 工具**写（`:278,286`）⇒ `verifier` 类写集（仅 `.rddf/reviews`）让 skill 的 Step 5 直接吃 `Permission denied`（按简报纪律只能 HANDOFF）。
2. **口径**：`prompts/build.md` §审查配对 的 `builder`（架构面）行产出去向写「`.rddf/reviews/` 或 change 的 notes」，而 `builder` 写集 = `scope` ⇒ 未把该路径写进 `scope` 的 builder **写不了自己的 findings**；且 `scope` 覆盖度**零结构性约束**（只有 `plan_ref` 有 `validatePlanRef` 硬 Gate）。

⚠ **机制语义**：**类允许集只是 scope 上限**（`assertRoleClassCompatible` 用它做上限校验），**edit 权限只由 `scopeEditRules(scope)` 派生**（`classPermissions` 不读 `roleClass`）⇒ 「加进写集」的实义是「该类派发的 **scope 现在可以包含它**」，**派发时仍须把该路径写进 `scope`**。**AC4 即这条语义的机械证据**（不另设散文说明）。

## What Changes

### A. 代码（`lib/delegate-core.ts`）

1. `classAllowRoots("verifier")` ⇒ `[".rddf/reviews", ".rddf/state/verifier"]`（**只加这一个子目录**）。
2. 导出**一个常量** `VERIFIER_OWNS_PATHS`（**6 项**，与 ADR 的 owns 清单对齐）+ 由它**派生**的 `VERIFIER_BACKLOG_ROOT_FILES`（= 6 项中**不**落在 `.rddf/state/verifier/` 下的 **4 项**，**不得手抄第二份**）。
3. **负向不变量**（只针对**内置**条目）：`.rddf/reviews` / `.rddf/state/verifier` / `.rddf/config/arch-docs.json` 三者中无一项等于或祖先于 `.rddf/state`；`.rddf/state/verifier`（后代）**仍被允许**（证明判据不是「含 state 子串」）。
   - **`archRoots(projectRoot)` 派生项不在本不变量范围内**（它是**运行时项目配置**，仓内守卫够不着他工程；加拒绝分支会违反「无新机制」）⇒ 改由 **prompt 承接**：`prompts/build.md` §架构文档范围 增一句「`arch_paths` **不得**取 `.rddf/state` 的祖先或本身（`.` / `.rddf` / `.rddf/state`）—— 状态目录不是架构文档面」（由文本守卫钉住）。
   - **对已签批 ADR V5 的收窄说明**（实施性解释，**不改 ADR**）：ADR V5 的量词是「**任何** `classAllowRoots(cls)` 的结果都不含等于或祖先于 `.rddf/state` 的条目」；本 change 实施时**只对内置条目**成立 —— `archRoots` 派生项随工程配置而变，无法进仓内不变量 ⇒ 其约束改由 §架构文档范围 的 prompt 规则承担（见上）。

### B. 父篇 ADR 落改（`docs/adr/ADR-backend-handoff-role-class.md`）

4. D3 表 **verifier 行** ⇒ 「`.rddf/reviews/**` + `.rddf/state/verifier/**`（过渡期规则见 `ADR-class-write-scope-alignment` D1b）」；Status 行追加修订记录（日期 + 「D3 verifier 写集修订」），并**删掉**当前那条「实施时与代码同批落改」的**未完成指针**（该指针在实施前是未兑现的承诺，实施后即为假；「本行描述现行实现」这半句在落改后仍成立，保留）。
5. **与代码同批**（顺序判据见 AC10）。

### C. 派发侧文本（`prompts/plan.md` / `prompts/front.md` / `prompts/build.md`）

6. **D1c 派发契约**：`verifier` 类派发的 `scope` **必须同时包含** `.rddf/reviews` 与 `.rddf/state/verifier`（走 rdd-verifier 时）；`prompts/plan.md` 选类表 + `prompts/front.md` §3.1 明写。
7. **D2b 派发硬规则**：产出 `.rddf/reviews/<change>-arch-review.md` 的 builder 任务，**派发时 `scope` 必须包含该路径**；未包含 ⇒ findings **只落响应正文**（不落盘 ≠ 失败，是边界生效）。`prompts/plan.md` 选类表 builder 行明写。
8. **D1b 过渡期规则**（`prompts/build.md` §verifier 产出契约）：verifier 类**只跑取证与判决**，判决落 `.rddf/reviews/<change>-verify.md`；**状态机落盘（verdict cache / loop state / audit）由主会话代跑**（过渡期**不改 skill 本体**，截断点 = Step 5 之前停手，证据与判决写响应正文）。**产品侧收拢目录后，后端可直写全部 skill 状态。**
9. **D3-3 收口** `prompts/build.md` 内部三处（`:324` / `:333` / `:393`）⇒ 统一为三元表述：**产品落点 `.rddf/reviews/` / 记账落点 `.rddf/state/verifier/` / 根下点文件待收拢**；三处**均不得**声称根下点文件已在 `verifier/` 内。
10. **D1d-2 落点区分**（`prompts/build.md` §verifier 产出契约）：`.rddf/reviews/` = 产品落点、`.rddf/state/verifier/` = 记账落点；**记账文件不得冒充验收报告**。

### D. 守卫（`tests/config-guards.test.ts`）

11. 三条断言：① `classAllowRoots("verifier")` ⊇ `VERIFIER_OWNS_PATHS` 中落在 `.rddf/state/verifier/` 下的项（**正向**）；② `VERIFIER_BACKLOG_ROOT_FILES` 的每一项**不被**任何 allow root 覆盖（**负向**）；③ 负向不变量（内置条目不等于/祖先于 `.rddf/state`，且后代仍允许）。
12. 文本断言：三处 prompt 的 D1c / D2b / 过渡期规则 / 三元表述（可 grep 具体 token）。
13. **全域陈旧陈述清除**：在 `prompts/**` + `docs/**` + `commands/**` 内（除 `openspec/changes/archive/**` 与 `.rddf/reviews/**` 历史记录），**不存在**把 verifier 写集描述为「仅 `.rddf/reviews`」的句子（正则命中数 == 0）。

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | `classAllowRoots("verifier", root)` 的**集合** == `{".rddf/reviews", ".rddf/state/verifier"}`（顺序无关） | 结构 | `tests/delegate-core.test.ts` |
| AC2 | `classAllowRoots("builder")` 仍 `[]`；`classAllowRoots("architect")` **不含** `.rddf/state/verifier` | 结构 | 同上 |
| AC3 | `assertRoleClassCompatible` 的 **6** 个形态：`scope:[".rddf/state/verifier/x.json"]` **放行** / `[".rddf/state/verifier"]`（目录本身）**放行** / `[".rddf/state/verifier/"]`（尾斜杠）**放行** / `[".rddf/state/pair.json"]` **拒** / `[".rddf/state/verifier2/x.json"]`（兄弟目录）**拒** / `[".rddf/reviews/../state/pair.json"]`（穿越）**拒** | 结构 | 同上 |
| AC4 | **组合路径**（`classPermissions` 不读 `roleClass` ⇒ 单独断言 allow 是恒真）：verifier 派发 `scope=[".rddf/reviews", ".rddf/state/verifier"]` ⇒ ① `assertRoleClassCompatible` **不抛**（派发被接受）② 同一 scope 下 `.rddf/state/verifier/x.json` 的 `edit` 为 `allow` ③ 同一 scope 下 `.rddf/state/pair.json` 的 `edit` 仍 `deny`（上限不泄漏为授权） | 结构 | `tests/delegate-core.test.ts`（**就地改**既有 :990-994 / :903-904，不新增重复用例） |
| AC5 | 负向不变量（**内置条目**）：`.rddf/reviews` / `.rddf/state/verifier` / `.rddf/config/arch-docs.json` 均**不**等于或祖先于 `.rddf/state`；且 `.rddf/state/verifier`（后代）**仍被允许**；`arch_paths=[".rddf/state/adr"]` 的 fixture **不红**（后代合法）。⚠ 不变量的**全部内容**是「等于或祖先于 `.rddf/state`」（如 `.` / `.rddf` / `.rddf/state` 本身）—— 祖先值属**配置错误**，由 §架构文档范围 的 prompt 禁句拦（**不改运行时**），仓内守卫只管内置条目 | 结构 | 同上 |
| AC6 | 常量与派生视图：`VERIFIER_OWNS_PATHS` 长度 **6**；`VERIFIER_BACKLOG_ROOT_FILES` 长度 **4** 且**等于**前者中不落在 `.rddf/state/verifier/` 下的项（**派生，不得手抄**）；守卫断言 ① allow ⊇ 常量中落在子目录下的项（**正向**）② backlog 4 项**不被**任何 allow root 覆盖（**负向**） | 结构 | 同上 + `tests/config-guards.test.ts` |
| AC7 | 文本三处一致（可 grep 具体 token）：`prompts/plan.md` 选类表 verifier 行 + `prompts/front.md` §3.1 的 `role_class` 行 + `prompts/build.md` 运行身份表 verifier 行 —— 含 `.rddf/state/verifier` **且**含正向 pattern「scope **必须同时包含**」（派发侧义务；避免「scope 不必包含」这类含 token 但语义相反的句子过关）；**build.md 运行身份表**的措辞为「`.rddf/reviews/**` + `.rddf/state/verifier/**`（过渡期由主会话代跑，见 §verifier 产出契约）」+ 括注「派发侧要求见 plan.md 选类表」（**后端无权改自己的 scope** ⇒ 不写成后端义务） | 结构 | `tests/config-guards.test.ts` |
| AC8 | `prompts/build.md` §verifier 产出契约 含**过渡期规则四要素**：① 只跑取证与判决 ② 判决落 `.rddf/reviews/<change>-verify.md` ③ 状态机落盘由主会话代跑（截断点 = Step 5 之前，证据与判决写响应正文）**+ 症状桥接句**「在 `.rddf/state/.ac-*` 收到 Permission denied = **本契约生效，不是故障** ⇒ 带证据与判决 `HANDOFF` 交回主会话」（先例：`prompts/build.md:538` 对 architect 的同类句式）④ 不改 skill 本体 +「产品侧收拢后后端直写」 | 结构 | 同上 |
| AC9 | `prompts/build.md` §审查配对 `builder`（架构面）行含「scope 必须包含」+「未包含时只落响应正文」 | 结构 | 同上 |
| AC10 | **父篇已落改**：① D3 verifier 行含 `.rddf/reviews/**` + `.rddf/state/verifier/**` + 「过渡期规则见 `ADR-class-write-scope-alignment` D1b」；② Status 行含日期 + 「D3 verifier 写集修订」，且**不再**含「本行当前描述的是现行实现」；③ D3 行不再出现孤立的「仅 `.rddf/reviews/**`」；④ **顺序**：`git log -1 --format=%H -- docs/adr/ADR-backend-handoff-role-class.md` 的 commit 是 `git log -1 --format=%H -- lib/delegate-core.ts` 的**祖先或同一 commit**（`git merge-base --is-ancestor`）⇒ **父篇滞后必红**（代码先改、父篇后改 ⇒ 不满足祖先）| 结构 + 顺序 | 该文件 + git |
| AC11 | `prompts/build.md` 内部三处（`:324` / `:333` / `:393`）**均**采用三元表述（产品落点 / 记账落点 / 根下点文件待收拢），且三处**均不得**声称根下点文件已在 `verifier/` 内；**`:324` 仍保留「verdict 缓存是归档门输入」的事实陈述**（该功能依赖不得在收口时改丢） | 结构 | 同上 |
| AC12 | **D1d-1 负向**：verifier 类派发 `scope` 分别取 `.rddf/state/pair.json` / `role.json` / `ledger.jsonl` / `sessions.json` ⇒ **全部拒** | 结构 | `tests/delegate-core.test.ts` |
| AC13 | **D1d-2 文本**：`prompts/build.md` §verifier 产出契约 含「`.rddf/reviews/` = 产品落点 / `.rddf/state/verifier/` = 记账落点；记账文件不得冒充验收报告」；**负向**：该节不得出现「状态/记账文件写入 `.rddf/reviews/`」类表述 | 结构 | `tests/config-guards.test.ts` |
| AC14 | **陈旧写集陈述清除（活文档）**：在 `prompts/**` + `docs/**` + `commands/**` 内（**排除** `docs/adr/**`（历史 ADR 描述的是**写作时点**的状态，父篇由 AC10 单独覆盖）、`openspec/changes/archive/**`、`.rddf/reviews/**`）正则 `/verifier[^\n]{0,40}(仅\|只允许\|只能)[^\n]{0,20}\.rddf\/reviews/` 的**命中数 == 0**（含 `仅` / `只允许` / `只能` 三种措辞）；命中清单**当前 4 处**：`docs/backend-handoff-role-class.md`、`docs/MULTI-AGENT-DESIGN.md`（**AC14 独有覆盖**）+ `prompts/build.md` 运行身份表、`prompts/plan.md` 选类表（**由 AC7 的改写顺带清除**，AC14 只需确认） | 结构 | `tests/config-guards.test.ts` |
| AC15 | **守卫变红演练**（手工，有记录）：临时把 `classAllowRoots("verifier")` 改回 `[".rddf/reviews"]`、或删掉三处 prompt 的 `.rddf/state/verifier` ⇒ 对应断言**必须红**；记录落验收报告 | 手工（有演练记录） | 验收报告 |
| AC16 | **无新机制**：`classAllowRoots` 签名仍 `(RoleClass, string) => string[]`；返回值无 glob token；`assertRoleClassCompatible` 未新增分支（`git diff` 范围核对） | 结构 | 代码 + git |
| AC17 | 回归：`bun test tests/` 全绿；`bash scripts/check-upstream-anchors.sh` 输出 `RESULT:` 行为全部锚点成立（**非 SKIP**；出现 `SKIP` ⇒ 报告记「锚点未验证」并**不勾选**本条）；`openspec validate class-write-scope-alignment` 通过 | 结构 | 全量 |
| AC18 | **backlog stub 已建**：`.rddf/improvements/rdd-verifier-state-consolidation.md` 存在（5 段式），其 Acceptance 含「核对 `VERIFIER_OWNS_PATHS` ↔ `SKILL.md:28-32` 的 owns 是否新增第 7 项」 | 结构 | 该文件 |
| AC19 | 治理面双审闭合：oracle → critic 各 1 轮（顺序不可颠倒），审稿记录落 `.rddf/reviews/class-write-scope-alignment-prompt-review.md`（含 oracle 与 critic 两节 + BLOCKER 全闭声明） | 流程 | 审稿记录 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [x] AC1 verifier allow 集合 == 两项
- [x] AC2 builder / architect 不受影响
- [x] AC3 6 个 scope 形态（放行/放行/放行/拒/拒/拒）
- [x] AC4 组合路径（不抛 + allow + 仍 deny）
- [x] AC5 `.rddf/state` 负向不变量（内置条目）+ 后代仍允许 + 合法配置不红
- [x] AC6 常量 6 项 + 派生视图 4 项 + 正负向断言
- [x] AC7 三处文本一致（含 scope 义务在派发侧）
- [x] AC8 过渡期规则四要素
- [x] AC9 builder 架构面产出的 scope 硬规则
- [x] AC10 父篇落改（内容 + 负向 + 顺序）
- [x] AC11 build.md 内部三处收口
- [x] AC12 D1d-1：四个 state 文件全拒
- [x] AC13 D1d-2：产品落点 vs 记账落点不混用
- [x] AC14 陈旧写集陈述全域清除
- [x] AC15 守卫变红演练
- [x] AC16 无新机制
- [x] AC17 回归绿 + anchors 非 SKIP + openspec validate 通过
- [x] AC18 backlog stub 已建
- [x] AC19 oracle → critic 双审闭合

## 非目标

- **不做**产品侧收拢（`rdd-verifier-state-consolidation` 的实施）—— 那是 `~/.agents/skills/**` 的改动，本仓无权限面；本 change 只**建 stub**。
- **不修改** `rdd-verifier` skill 本体。
- **不扩** `builder` 的写集（保持 `[]`）；`architect` 的写集不动。
- **不做**机制扩展（allow 集支持 per-change 文件族 / glob）—— 正确解法是产品侧收拢目录。
- 不改父篇 D3 的 builder / architect 两行，不改 D4 / D5；**不动 `prompts/build.md` 的角色矩阵**（agent 角色层）。

## 影响面与风险

| 面 | 影响 |
|---|---|
| `lib/delegate-core.ts` | `classAllowRoots("verifier")` + 两个常量 |
| `docs/adr/ADR-backend-handoff-role-class.md` | D3 表 verifier 行 + Status 修订记录（**与代码同批**） |
| `prompts/build.md` / `plan.md` / `front.md` | 写集描述 + 派发契约 + 过渡期规则 + 内部三处收口 + 落点区分 + **§架构文档范围 增一句**（`arch_paths` 不得取 `.rddf/state` 的祖先或本身） |
| `docs/backend-handoff-role-class.md` / `docs/MULTI-AGENT-DESIGN.md` | 陈旧写集陈述清除（AC14） |
| `tests/` | 新增断言（`delegate-core` / `delegate-async` / `delegate-tool` / `config-guards`） |
| 行为 | verifier 类派发可写 skill 的两个子目录状态文件；builder 的架构面 findings 落点规则确定 |
| 代价 | verifier 写集多一个目录（3 处 prompt + 2 份设计文档要改）；**过渡期 verifier 类不能完整跑 rdd-verifier 状态机**（显式功能缺口，主会话代跑） |
| 风险 | ①「加进上限」被误读为「已授权」⇒ AC4 组合路径 + D1c 写进 plan/front ②「常量 ↔ SKILL.md」同步仍是人工（ADR 已显式承认；AC18 把核对项写进 backlog stub 的 Acceptance）③ 将来有人整目录开放 `.rddf/state` ⇒ AC5 负向不变量 |

## 依赖与顺序

1. 依赖 `ADR-class-write-scope-alignment`（**Accepted**，方向已签批）。
2. 顺序：A（代码）⇒ B（父篇落改，与 A 同批）⇒ C（三处 prompt + 两份设计文档）⇒ D（守卫）⇒ 回归 ⇒ oracle → critic。
3. 治理面（改守卫断言）⇒ **oracle → critic 必审**。
