# 审稿记录：verifier 取证不可用 ⇒ 交回（`delegated-verifier-evidence-gap` 的实施）

- 审稿对象：`prompts/build.md`（§verifier 产出契约 新增段 / §审查配对 例外段逐类 bullet / §被派发后端的运行身份「逐类后果」）、`prompts/plan.md`（选类表 verifier 行的基线声明要求）、`tests/config-guards.test.ts`（扩展既有 describe）
- 变更类型：**治理面**（`prompts/**` + 守卫断言增删）⇒ 固定配对 **oracle → critic**（顺序不可颠倒）
- 审稿日期：2026-11-14
- 关联 change：`openspec/changes/delegated-verifier-evidence-gap/`
- 结论：**oracle `BLOCK`（5 条）→ 全落 → critic `APPROVE_WITH_CONDITIONS`（2 SHOULD_FIX + 2 NIT，全落，`mergeable: yes`）**

## 前序（不重开）

proposal 经 **metis 17 条 → oracle 7 条（BLOCK）→ critic 3 条 SHOULD_FIX**，全落盘（`.rddf/reviews/remaining-changes-review-trace.md`）。

## oracle（第一审）—— **`BLOCK`**，6 条 finding

| # | 影响 | finding | 处置 |
|---|---|---|---|
| 1 | **高（BLOCK）** | **基线对照对「执行类取证 × 被修改文件」不可执行**：条文要求「同一命令在基线上也报错/无法运行才算环境信号」，同时又**禁止** stash / checkout / worktree ⇒ 不物化工作树就跑不了基线版本 ⇒ 「基线也无法运行」恒真 ⇒ **`ac-fail` 臂事实上不可达**，真 bug 被系统性路由成 `blocked`（白烧 3 轮额度） | 改为**失败签名分类**：① **判据信号**（命令跑起来但产出**断言失败**）⇒ 直接 `ac-fail`，**不需基线对照** ② **环境信号**（runner/依赖缺失、超时、0 用例、collection error 四类）⇒ 走基线臂 ⇒ `blocked` ③ **内容类取证**（grep/读文件）⇒ 基线臂适用，但「未命中新增内容」「产物尚未存在」仍是判据信号 |
| 2 | 高 | `<base>` 缺省 `origin/main` 在本仓**不可解析**，且**无任何机制要求简报声明基线** ⇒ 常态「一切失败 ⇒ blocked」 | `prompts/plan.md` 选类表 verifier 行补「**简报必须声明可解析的 `<base>`**（如 `HEAD~1` / commit sha）；不声明 ⇒ 后端一律 `blocked`」 |
| 3 | 中 | **守卫 3 处缺口**：① 「逐类后果」**定义处**落在 AC2 切片外，被**指针句**假冒满足（删定义处仍绿）② 「不得落**判定类**报告」carve-out 无锚点 ③ 受阻记录四要素（落点 / 自落 / 权威序 / 轮次取较大值）零锚点 | 三处全部补锚点（定义处整句断言 / 「判定类」正向 + 负向「不得改回审稿报告」/ 四要素逐项断言）+ 失败签名四类 token |
| 4 | 中 | 两条 ⚠（`<base>` 不可解析 vs 新增文件默认 `ac-fail`）**优先级未定义** ⇒ 执行者可能按 bullet 顺序就近取用 | 显式写「`<base>` 不可解析 ⇒ **优先 `blocked`**；「新增文件默认 `ac-fail`」只在 `<base>` 可解析且形态为判据信号时适用」 |
| 5 | 低 | kind 优先级②未字面覆盖「7 条通过 + 1 条不可用 + 0 条失败」（按排除法只能 `blocked`，可推断但建议写明） | 改写为「**pass 被禁止且无任何带证据的不通过** ⇒ `blocked`（含该形态）」 |
| 6 | 低 | AC1 / AC2 各留「意思变了词还在」的缝（「等同」形态 / 行内连带类名） | AC1 负向补「等同 / 意味着 / 即为」；AC2 增「每个受例 bullet 的**首个类名**必可解析」 |

**oracle 已核实无问题的项**：受阻记录的载体够（verifier 写集含 `.rddf/reviews/**`，且 plan.md 要求 scope 必须含该目录；`Wildcard` 的 `*` 跨 `/` ⇒ 目录/glob 均可写 `<change>-verify-blocked.md`）；`builder` 架构面的新增受阻义务与 architect 先例同构且已显式承认；`verifier` 的 explore 收紧是「无人值守不自批」的合理延伸（主会话形态保留报告出口）。

## critic（第二审）—— `APPROVE_WITH_CONDITIONS`（`mergeable: yes`，`scope_exceeded: false`）

**BLOCKER：无。** critic 重点核了三处**冲突嫌疑**，均判不成立：

| 嫌疑 | critic 判定 |
|---|---|
| 受阻记录 vs D5「不新造落点」 | **不冲突**：落点在同一写集内、`build.md` 显式声明「不替代 feedback 凭据、凭据通道仍是唯一权威」；收尾三问的证据优先级链未改、也不读该文件 ⇒ 权威序无分叉 |
| 「轮次取较大值」vs 3 轮上限 | **不冲突**：聚合只发生在**本地验收路径**的两份同目录文件之间；skill 路径的记账仍归 `.rddf/state/verifier/<change>.json` ⇒ 不是第二本账 |
| 失败签名分类的闭合 | **成立**：判据信号 ⇒ 直接 `ac-fail` 直接闭合 oracle BLOCK；环境信号四类穷尽；内容类 carve-out 与基线臂分层清晰 |

| # | 类别 | finding | 处置 |
|---|---|---|---|
| 1 | SHOULD_FIX | `build.md` 与 `plan.md` 对「简报未声明 `<base>`」给出**不同后果**：plan.md 说「一律 blocked」，build.md 仍留「缺省 `origin/main`」⇒ 在 `origin/main` **可解析**的其它项目仓里，派发方预期与后端行为**分叉** | build.md 的缺省条款**限定范围**：「缺省 `origin/main` **仅对未声明基线的存量简报生效**（新派发已要求必声明）」 |
| 2 | SHOULD_FIX | plan.md 新增的「必须声明可解析 `<base>`」句在守卫里**零锚点** | 补锚点断言（verifier 行的 `<base>` + 「必须声明」+ `blocked`） |
| 3 | NIT | `<base>` 不可解析的优先级说了两遍（冗余） | 保留（第二遍的价值是与「新增文件默认 ac-fail」的相对优先级） |
| 4 | NIT | 受阻记录首行模板 `HANDOFF: <kind>` 未写明本场景 kind 不会 `needs-revision` | 补「本场景下 kind = 上面 kind 优先级选出的那一个，**不会是** `needs-revision`」 |

## 验证

- `bun test tests/` = **531 pass / 0 fail**（8 files，2435 expect）
- `scripts/check-upstream-anchors.sh` = **23/23** OK
- e2e（`rdd-workflow-e2e` 仓，`tests/integration/test_class_scope_runtime.bats`）：
  - **CS-3 通过**（受阻记录由 verifier 自落 + 首行 `HANDOFF:` + 无 pass 结论）
  - **CS-5 未验证**（新增的「修改文件上测试失败 ⇒ `ac-fail`」回归用例）：跑的时候撞 **Token Plan 429 用量上限**（`provider.rate-limit`，10 次 retry 后 error，0 条文本）⇒ 按纪律**不重试**；用例已入库，待额度恢复后跑

## 结论

治理面实施双审闭合（oracle 的 BLOCK 已闭；critic 无 BLOCKER，2 SHOULD_FIX + 2 NIT 全落）⇒ 可归档。
**如实登记的验证缺口**：CS-5（回归用例）因额度未验证；本 change 的核心手工判据（AC7）由 **CS-3 通过**覆盖。
