# class-write-scope-alignment — 类写集与产品侧 skill / 审查配对的对齐

> 决策：`docs/adr/ADR-class-write-scope-alignment.md`（**Accepted** 2026-11-14，**用户签批「方向」**；oracle 2 轮：BLOCK → PASS-WITH-NOTES；critic 2 轮：REJECT → APPROVE / `mergeable: yes`）
> 父篇：`docs/adr/ADR-backend-handoff-role-class.md`（**修订其 D3 的 verifier 写集行**；D3 其余行 / D4 / D5 不动）
> 性质：**代码 + 父篇 ADR + 三处 prompt + 守卫** ⇒ 治理面（守卫断言增删）⇒ oracle → critic 各 1 轮
> 关联 backlog：`rdd-verifier-state-consolidation`（产品侧把 4 个根下点文件收拢进 `verifier/`；本 change **不做**）
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置（`.arch-handoff.json` / `.planner-handoff.json`）不存在 ⇒ 按工件归属规则第 3 条走**内置流程**。

## Why

两个实测缺口（都是「写集与别处契约不一致」，不是父篇 D3 的划分本身错）：

1. **越类**：`rdd-verifier` skill 的 `role.boundaries.owns` 是 **6 个路径**（`~/.agents/skills/rdd-verifier/SKILL.md:29-32` 的 4 项 + `:415` 的 halted audit + `scripts/run_verification.sh:7-9` 的 staged），其中**四个**在 `.rddf/state/` **根**下；且协议用 **Write 工具**写（`SKILL.md:278,286`）⇒ `verifier` 类写集（仅 `.rddf/reviews`）让 skill 的 Step 5 直接吃 `Permission denied`（按简报纪律只能 HANDOFF）。
2. **口径**：`prompts/build.md` §审查配对 的 `builder`（架构面）行产出去向写「`.rddf/reviews/` 或 change 的 notes」，而 `builder` 写集 = `scope` ⇒ 未把该路径写进 `scope` 的 builder **写不了自己的 findings**；且 `scope` 覆盖度**零结构性约束**（只有 `plan_ref` 有 `validatePlanRef` 硬 Gate）。

⚠ **关键机制事实**（决定本 change 的全部措辞）：`classAllowRoots` 只是 `assertRoleClassCompatible` 的 **scope 上限校验**（`lib/delegate-core.ts:786`）；**edit 权限只由 `scopeEditRules(scope)` 派生**（`:884-906` / `classPermissions:891-894`）—— 类允许集**不会**并入侵限 ⇒「加进写集」的实义是「该类派发的 **scope 现在可以包含它**」，**派发时仍须把该路径写进 `scope`**。

## What Changes

### A. 代码（`lib/delegate-core.ts`）

1. `classAllowRoots("verifier")` ⇒ `[".rddf/reviews", ".rddf/state/verifier"]`（**只加这一个子目录**）。
2. 新增**单点常量**（仿 `PRIORITY_BLOCKED_FIELDS` 范式，`:306-313`）：rdd-verifier 的 `owns` 全量 **6 个路径** + 产品侧 backlog 的 **4 项**（显式标注「**不在**允许集内」）。
3. **负向不变量**：任何类的 allow root **不得等于或祖先于** `.rddf/state`（防将来整目录开放）。

### B. 父篇 ADR 落改（`docs/adr/ADR-backend-handoff-role-class.md`）

4. D3 表 **verifier 行** ⇒ 「`.rddf/reviews/**` + `.rddf/state/verifier/**`（过渡期规则见 `ADR-class-write-scope-alignment` D1b）」；Status 行追加本次修订记录（日期 + 「D3 verifier 写集修订」）。**与代码同批落改** —— 父篇是 Accepted，实施方会读它。

### C. 派发侧文本（`prompts/plan.md` / `prompts/front.md` / `prompts/build.md`）

5. **D1c 派发契约**：`verifier` 类派发的 `scope` **必须同时包含** `.rddf/reviews` 与 `.rddf/state/verifier`（走 rdd-verifier 时）；`prompts/plan.md` 选类表 + `prompts/front.md` §3.1 明写。
6. **D2b 派发硬规则**：产出 `.rddf/reviews/<change>-arch-review.md` 的 builder 任务，**派发时 `scope` 必须包含该路径**；未包含 ⇒ findings **只落响应正文**（不落盘 ≠ 失败，是边界生效）。`prompts/plan.md` 选类表 builder 行明写。
7. **D1b 过渡期规则**（`prompts/build.md` §verifier 产出契约）：verifier 类**只跑取证与判决**，判决落 `.rddf/reviews/<change>-verify.md`；**状态机落盘（verdict cache / loop state / audit）由主会话代跑**（过渡期**不改 skill 本体**，截断点 = Step 5 之前停手，证据与判决写响应正文）。
8. **D3-3 收口** `prompts/build.md` 内部三处对同一套状态文件的不一致描述（`:324` / `:333` / `:393`）⇒ 统一为「产品落点 `.rddf/reviews/` + 记账落点 `.rddf/state/verifier/`（+ 产品侧 backlog 的根下点文件）」。

### D. 守卫（`tests/config-guards.test.ts`）

9. 「verifier allow ⊇ 常量里属于子目录的部分」+「backlog 的 4 项**仍不在**允许集内」+「任何类 allow root ≠ 也不祖先于 `.rddf/state`」+ 三处 prompt 文本（D1c / D2b / 过渡期规则）+ 父篇 D3 行已落改。

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | `classAllowRoots("verifier", root)` 的**集合** == `{".rddf/reviews", ".rddf/state/verifier"}`（顺序无关） | 结构 | `tests/delegate-core.test.ts` |
| AC2 | `classAllowRoots("builder")` 仍 `[]`；`classAllowRoots("architect")` **不含** `.rddf/state/verifier` | 结构 | 同上 |
| AC3 | `assertRoleClassCompatible({verifier, scope:[".rddf/state/verifier/x.json"]})` **放行**；`scope:[".rddf/state/pair.json"]` **仍拒** | 结构 | 同上 |
| AC4 | **权限净效果（带 scope 前提）**：verifier 派发 `scope` **含** `.rddf/state/verifier` ⇒ 该路径 `edit` 为 `allow`；**scope 不含** ⇒ `deny` | 结构 | `tests/delegate-async.test.ts` / `delegate-tool.test.ts` |
| AC5 | **负向不变量**：任何 `classAllowRoots(cls)` 的结果都**不含**等于或祖先于 `.rddf/state` 的条目 | 结构 | `tests/delegate-core.test.ts` |
| AC6 | 单点常量含 owns 全量 6 项 + backlog 4 项；守卫断言「backlog 4 项**仍不在**允许集内」 | 结构 | 同上 + `tests/config-guards.test.ts` |
| AC7 | 文本三处一致：`prompts/build.md` 运行身份表 + `prompts/plan.md` 选类表含 `.rddf/state/verifier` 与「scope 必须包含」；`prompts/front.md` §3.1 含同语义描述（该文件无写集表） | 结构 | `tests/config-guards.test.ts` |
| AC8 | `prompts/build.md` §verifier 产出契约 含**过渡期规则**（只跑取证与判决 / 状态机由主会话代跑 / 不改 skill 本体） | 结构 | 同上 |
| AC9 | `prompts/build.md` §审查配对 `builder`（架构面）行含「scope 必须包含」+「未包含时只落响应正文」 | 结构 | 同上 |
| AC10 | **父篇已落改**：`ADR-backend-handoff-role-class.md` 的 D3 verifier 行含 `.rddf/state/verifier` + 过渡期规则指针；Status 行有本次修订记录 | 结构 | 该文件 |
| AC11 | `prompts/build.md` 内部三处状态文件描述已收口（同一套路径的三处表述一致） | 结构 | 同上 |
| AC12 | 回归：`bun test tests/` 全绿；`scripts/check-upstream-anchors.sh` 无 FAIL | 结构 | 全量 |
| AC13 | 治理面双审闭合（oracle → critic 各 1 轮）+ 审稿记录落 `.rddf/reviews/class-write-scope-alignment-prompt-review.md` | 结构 | 审稿记录 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [ ] AC1 verifier allow 集合 == 两项
- [ ] AC2 builder / architect 不受影响
- [ ] AC3 子目录放行 / 根目录仍拒
- [ ] AC4 权限净效果（带 scope 前提）
- [ ] AC5 `.rddf/state` 负向不变量
- [ ] AC6 单点常量 + backlog 项仍不在允许集
- [ ] AC7 三处文本一致
- [ ] AC8 过渡期规则在 build.md
- [ ] AC9 builder 架构面产出的 scope 硬规则
- [ ] AC10 父篇 D3 行已落改 + Status 修订记录
- [ ] AC11 build.md 内部三处收口
- [ ] AC12 回归绿 + anchors 无 FAIL
- [ ] AC13 oracle → critic 双审闭合

## 非目标

- **不做**产品侧收拢（`rdd-verifier-state-consolidation`：把 4 个根下点文件收进 `verifier/`）—— 那是 `~/.agents/skills/**` 的改动，本仓无权限面。
- **不修改** `rdd-verifier` skill 本体（过渡期靠「截断点 + 主会话代跑」实现）。
- **不扩** `builder` 的写集（保持 `[]`）；`architect` 的写集不动。
- **不做**机制扩展（allow 集支持 per-change 文件族 / glob）—— 正确解法是产品侧收拢目录。
- 不改父篇 D3 的 builder / architect 两行，不改 D4 / D5。

## 影响面与风险

| 面 | 影响 |
|---|---|
| `lib/delegate-core.ts` | `classAllowRoots("verifier")` + 单点常量 |
| `docs/adr/ADR-backend-handoff-role-class.md` | D3 表 verifier 行 + Status 修订记录（**与代码同批**） |
| `prompts/build.md` / `plan.md` / `front.md` | 写集描述 + 派发契约（scope 必须包含）+ 过渡期规则 + 内部三处收口 |
| `tests/` | 新增断言（`delegate-core` / `delegate-async` / `delegate-tool` / `config-guards`） |
| 行为 | verifier 类派发可写 skill 的两个子目录状态文件；builder 的架构面 findings 落点规则确定 |
| 代价 | verifier 写集多一个目录（3 处 prompt 描述要改）；**过渡期 verifier 类不能完整跑 rdd-verifier 状态机**（显式功能缺口，主会话代跑） |
| 风险 | ①「加进上限」被误读为「已授权」⇒ AC4 带 scope 前提 + D1c 写进 plan/front ②「常量 ↔ SKILL.md」同步仍是人工（ADR 已显式承认，由 backlog 收拢时核对）③ 将来有人整目录开放 `.rddf/state` ⇒ AC5 负向不变量 |

## 依赖与顺序

1. 依赖 `ADR-class-write-scope-alignment`（**Accepted**，方向已签批）。
2. 顺序：A（代码）⇒ B（父篇落改，与 A 同批）⇒ C（三处 prompt）⇒ D（守卫）⇒ 回归 ⇒ oracle → critic。
3. 治理面（改守卫断言）⇒ **oracle → critic 必审**。
