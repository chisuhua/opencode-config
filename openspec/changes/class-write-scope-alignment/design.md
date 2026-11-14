# class-write-scope-alignment — 设计（落点与取舍）

> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC19）
> 决策：`docs/adr/ADR-class-write-scope-alignment.md`（**Accepted** 2026-11-14，用户签批「方向」）
> 父篇：`docs/adr/ADR-backend-handoff-role-class.md`（**修订其 D3 的 verifier 写集行**）

## 1. 为什么是「上限 + 派发契约」而不是「加权限」

| 事实 | 后果 |
|---|---|
| `classAllowRoots` 只是 `assertRoleClassCompatible` 的 **scope 上限校验** | 「加进写集」**不等于**授权 —— edit 权限只由 `scopeEditRules(scope)` 派生 |
| ⇒ 任何「verifier 现在能写 `.rddf/state`」的表述都是**假的** | 必须同时写**派发侧义务**（`scope` 必须包含）⇒ 「上限 ≠ 授权」成为可机械验证的组合路径（AC4） |

⇒ 实施形态：**一个类上限 + 一条派发契约 + 一个角色矩阵口径**，不引入任何新机制（AC16）。

## 2. 落点

| 层 | 落点 | 形态 |
|---|---|---|
| 类上限 | `lib/delegate-core.ts` → `classAllowRoots("verifier")` + 三个导出常量 | 代码 |
| 派发契约 | `prompts/plan.md` 选类表 + `prompts/front.md` §3.1 + `prompts/build.md` 运行身份表括注 | 治理面文本 |
| 后端口径 | `prompts/build.md` §verifier 产出契约（三元落点 + 过渡期四要素 + 症状桥接） | 治理面文本 |
| 审查配对 | `prompts/build.md` §审查配对 `builder`（架构面）行（scope 必须包含 / 未包含时只落响应正文） | 治理面文本 |
| 架构目录禁句 | `prompts/build.md` §架构文档范围（`arch_paths` 不得取 `.rddf/state` 的祖先或本身） | 治理面文本 |
| 签批文档 | 父篇 ADR D3 表 + Status 行（**与代码同批**） | ADR |
| 陈述收口 | `docs/backend-handoff-role-class.md` / `docs/MULTI-AGENT-DESIGN.md` | 文档 |
| 守卫 | `tests/delegate-core.test.ts` + `tests/config-guards.test.ts` | 测试 |
| 产品侧待办 | `.rddf/improvements/rdd-verifier-state-consolidation.md`（stub） | improvement |

## 3. 关键取舍

| 取舍 | 选择 | 代价 / 边界 |
|---|---|---|
| 只开子目录还是整目录 | 只开 `.rddf/state/verifier/**` | 4 个根下点文件仍写不进 ⇒ 过渡期需主会话代跑（产品侧 backlog 收拢后关闭） |
| 加在哪个类 | 只加 `verifier` | `builder` 仍可被派发时按 scope 写该目录（**既有语义**，非本 change 新增） |
| 「代跑」写在哪 | 后端侧（build.md）+ 派发侧提示（front.md §3.1） | 两处**同一契约的两个落点**，用「代跑状态机」措辞对齐；不由 plan.md 复述（避免第二漂移面） |
| 症状怎么说 | 「`.rddf/state/.ac-*` 收到 Permission denied = 本契约生效，不是故障」 | architect 写集结构性不含该路径 ⇒ 无误触发 |
| 归口负向不变量 | 只管**内置条目**；`archRoots` 派生项由 prompt 禁句承接 | 偏离 ADR V5 的量词（**已如实记录收窄说明**） |
| 是否给 `builder` 加 deny | 不加 | 属既有语义；deny 列表是开放策略（ADR 选项 G 已否决） |

## 4. 顺序与验证

1. A（代码）⇒ B（父篇落改，**与 A 同批**）⇒ C（三处 prompt + 两份文档）⇒ D（守卫）⇒ 回归。
2. 验证：`bun test tests/` **525 pass / 0 fail**；anchors **23/23**；**e2e CS-1..CS-4 全绿**；**变红演练 4 例**。
3. 治理面 ⇒ oracle → critic 各 1 轮（实施轮：oracle `PASS-WITH-NOTES` 5 条全落 → critic `APPROVE_WITH_CONDITIONS` 1 SHOULD_FIX + 4 NIT 全落）。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 「加进上限」被误读为「已授权」 | AC4 组合路径（派发被接受 + allow + `.rddf/state` 其它仍 deny）+ e2e CS-1/CS-2 |
| 过渡期 stall（`.ac-verdict` 不落 ⇒ 归档门不触发） | front.md §3.1 的代跑处置提示（触发锚放宽到 5 项正文任一项）+ 症状桥接句 |
| 常量 ↔ `SKILL.md` 同步是人工 | ADR 已显式承认；AC18 要求 backlog stub 的 Acceptance 含 owns 核对项 |
| 将来整目录开放 `.rddf/state` | AC5 负向不变量（内置条目）+ §架构文档范围 禁句（配置侧） |
