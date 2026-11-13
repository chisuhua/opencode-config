# 审稿记录：类写集对齐 ADR（`ADR-class-write-scope-alignment`）

- 审稿对象：`docs/adr/ADR-class-write-scope-alignment.md`（**Proposed**，新建；修订父篇 `ADR-backend-handoff-role-class` 的 D3 verifier 写集行）
- 变更类型：**ADR 行**（`docs/adr/**`）
- 固定配对：**oracle → critic**（顺序不可颠倒）
- 审稿日期：2026-11-14
- 结论：oracle 首轮 `BLOCK`（3 条）→ 复审 `PASS-WITH-NOTES`（3 条全闭 + 4 处必改已落）；critic 首轮 **`REJECT`**（1 BLOCKER）→ 复审 **`APPROVE`**（`mergeable: yes`，`scope_exceeded: false`）

## 问题（两个实测缺口，都是「写集与别处契约不一致」）

1. **越类**：`rdd-verifier` skill 的 `role.boundaries.owns` 是 **6 个路径**（`SKILL.md:29-32` 的 4 项 + `:415` 的 halted audit + `scripts/run_verification.sh:7-9` 的 staged），其中**四个**在 `.rddf/state/` **根**下；且协议用 **Write 工具**写（`SKILL.md:278,286`）⇒ `verifier` 类写集（仅 `.rddf/reviews`）让 Step 5 直接吃 `Permission denied`。
2. **口径**：`prompts/build.md` §审查配对 的 `builder`（架构面）行产出去向写「`.rddf/reviews/` 或 change 的 notes」，而 `builder` 写集 = `scope` ⇒ 未把该路径写进 scope 的 builder 写不了自己的 findings；且 `scope` 覆盖度零结构性约束。

## oracle（第一审）—— 首轮 **`BLOCK`**（3 条）

| # | finding | 处置 |
|---|---|---|
| **B1** | D1 事实基础不完整：owns 是 **6 个路径**、其中 4 个在 `.rddf/state/` 根下、且用 **Write 工具**写 ⇒ 只开子目录时 Step 5 仍 deny，「V1–V4 全绿而缺口原样存在」；且「无权威内容」定性被 `build.md:324`（「结果以 `.ac-verdict-<change>.json` 为准」）/ `SKILL.md:79`（与 archive gate 共享）/ `:429`（rdd-doctor 读 blocked log）证伪 | 背景段**六路径全列**并标出「四个不在子目录内」；定性改为「**机器消费的门槛输入**（接受理由 = 单用途 + gitignored + 单一 skill 写者）」；D1b 把 4 个根下点文件 + staged 记**产品侧 backlog** `rdd-verifier-state-consolidation` + **过渡期显式规则**；V6 断言 backlog 项**仍不在**允许集内 |
| **B2** | 「写集」被当成授权：`classAllowRoots` 只是 `assertRoleClassCompatible` 的 **scope 上限**（`delegate-core.ts:786`），edit 权限只由 `scopeEditRules(scope)` 派生（`:884-906` / `classPermissions:891-894`）⇒ D1 实义只是「scope **可以**包含它」，**派发仍须写进 scope**；V4 会假绿 | 背景段加 ⚠「机制语义」块（引上述行号）+ **D1c 派发契约**（scope 必须同时含两目录，并申明「为产品侧收拢后即开即用」）+ **V4 带 scope 前提**（scope 含 ⇒ allow；不含 ⇒ deny） |
| **B3** | Parent 定位不实（「补充 D3，不取代任何决策」，但 D1 改的恰是 D3 的 verifier 行，父篇 `:50`） | Parent 改为「**修订** D3 verifier 写集行；该 D3 其余行、D4、D5 **不动**」 |

**oracle 复审** → `PASS-WITH-NOTES`：3 条 BLOCK 全闭；4 处必改（后果章「能写两个子目录状态文件」与 D1b「主会话代跑」自相矛盾；「六个路径里五个」算术错 ⇒ 四个；D1c 与 D2a 最小权限的张力需申明；V7 需增钉 `build.md` 的过渡期规则）**已全部落实**。

## critic（第二审）—— 首轮 **`REJECT`**（1 BLOCKER + 2 SHOULD_FIX + 2 NIT）

| # | 类别 | finding | 处置 |
|---|---|---|---|
| 1 | **BLOCKER** | **父篇 D3 verifier 行本身没有任何落点与验证项**：子篇宣告「修订 D3」，但后果章只枚举 `build.md` / `plan.md` / `front.md` 三处，**没有一条决策或 V 项要求改父篇正文** ⇒ 签批后父篇（**Accepted**）会原样冻结旧契约「仅 `.rddf/reviews/**`」，与代码和子篇并行 ⇒ 实施方只读父篇会实现错写集（同一决策两处矛盾文本 + 错契约留在签批文档里） | **D3 新增第 4 条**「父篇本体必须落改」：指定父篇 `:50` 的目标文本（`.rddf/reviews/**` + `.rddf/state/verifier/**` + 过渡期规则指针）+ 在父篇 **Status 行后续修订记录**（`:7` 已有先例）追加本次修订指针；明写「**子篇宣告 ≠ 父篇已改**」；**新增 V11** 作可勾选判据 |
| 2 | SHOULD_FIX | D3-1 的常量是**第 4 份手抄**（owns 6 路径进 `lib/`），守卫只钉「代码 ⊇ 常量」⇒ 常量 ↔ `SKILL.md` 仍是纯人工；且未记录「守卫直接读 `SKILL.md`」这个备选为何被拒 | D3-1 补两段：① 否决理由（skill 在 `~/.agents/skills/**` 用户 home，**仓库 CI 的 `bun test` 不能依赖仓外路径** ⇒ 该守卫在 CI 必然 SKIP）② **显式承认残留**（人工同步，第 7 个路径不会红），由 backlog 收拢时核对并写进其 AC |
| 3 | SHOULD_FIX | D1b 的「主会话代跑」**执行形态未决**却声称「不留灰色地带」⇒ 实施方会各自发明机制 | D1b 补「执行形态的前提」：过渡期**不改 skill 本体**；截断点 = 后端在 Step 5（写 verdict cache / loop state / audit）**之前停手**，证据与判决写响应正文（产品内容落 `.rddf/reviews/`），主会话按 skill 协议补状态机；具体步骤序列留给实施 change 的 tasks |
| 4 | NIT | D3-1「3–4 项」与 V6 的 4 项不一致 | 统一为 **4 项** |
| 5 | NIT | 元数据「关联 change」段跨行断行 | 「关联 backlog」独立成行 |

**critic 复审** → **`APPROVE`**（`mergeable: yes`，`scope_exceeded: false`）：BLOCKER 闭合（D3-4 锁父篇改法 + V11 可勾选）；两条 SHOULD_FIX 落实情况经核验成立；本轮新增无新 BLOCKER。1 条 NIT（后果段遗留「3–4 个根下点文件」旧表述）已统一。

**critic 对「Status 行追加修订指针是否触发元数据头膨胀」的判定**：**不触发** —— 父篇 `:7` 已有先例（「同日 D3 修订（用户选 J）」），本次粒度相同（日期 + 短标签一句话指针）；但提醒：若父篇继续原地修订，应适时把修订史迁出 Status 行到 changelog（本轮不报）。

## 状态与后续

- 本 ADR 仍为 **`Proposed`** —— 按本仓惯例，**决策签批由用户完成**（父篇即「用户签批」）。签批后 Status → `Accepted`，再进入实施。
- 实施顺序（待立项后）：① 代码（`classAllowRoots("verifier")` + 单点常量）② 父篇 D3 行落改 + Status 修订记录 ③ `prompts/**` 三处文本 + `build.md` 内部漂移收口 ④ 守卫（D3 五条 + V1–V11）⑤ 回归。
- 本 ADR 触及 `tests/config-guards.test.ts` 的**断言增删** ⇒ 按 §治理面作用域表属治理面 ⇒ 实施的 patch 需 **oracle → critic 必审**。
- 关联 backlog：`rdd-verifier-state-consolidation`（产品侧收拢目录 + 清理 dangling 的 `.rddf/state/.verifier-report.json`）。
