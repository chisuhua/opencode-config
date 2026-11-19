# delegate-base-channel — 给「简报必须声明基线」补上实现通道

> 来源：`v2.30` 的 AC29 登记（`tests/config-guards.test.ts` 的 `KNOWN_UNIMPLEMENTED_CHANNELS` 条目 `delegate-base`）
> 判据真源：本文件「## 验收标准」表（AC1–AC14）；实现步骤见 `tasks.md`；决策取舍见 `design.md`
> 性质：**公开契约变更**（delegate / dispatch 两个工具的 schema 各加一个参数）+ 输入校验 + 文档同步
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在 ⇒ 走**内置流程**（用户直接指定起草）。
> **审查**：`oracle`（11 条建议 / 5 个技术缺陷）→ `metis`（P0-1..P0-6 / E1–E8 / 元层盲区）→ `critic`（**REJECT**，2 个 plan 档 BLOCKER）⇒ 本版按裁决修订。

## Why

`prompts/plan.md` 的选类表对 `verifier` 类写了一条**硬要求**：

> 取证命令要判「环境信号 vs 判据信号」时需要基线 ⇒ **简报必须声明可解析的 `<base>`**（如 `HEAD~1` 或 commit sha）；
> 不声明 ⇒ 后端一律 `blocked`

而 `prompts/build.md:343` 的后端确实**消费**这个值（`git merge-base HEAD <base>` / `git show <base>:<path>`）。

**但通道不存在**（`v2.30` 审计实测）：

| 环节 | 现状 |
|---|---|
| `delegate` 工具 schema | 无 `base` 参数 |
| `dispatch` 工具 schema | 同样无 `base`，且 `additionalProperties: false` ⇒ **传了会被硬拒** |
| `buildBrief()` | **不生成基线行** ⇒ 后端看不到 |
| `validateBrief()` | 不校验、也不存 |

⇒ 派发方只能把基线塞进 `constraints` 自由文本。后果：

1. **无解析保证**：typo 的 ref（`HEAD-1` 而非 `HEAD~1`）会**穿过派发**，直到后端跑 `git merge-base` 才失败
   ⇒ **白烧一整轮派发**（后端按纪律交回 `blocked`，主会话重派）。
2. **不可判**：「基线声明了没有」无法被机械核 —— 正是本仓守卫体系要消灭的「散文是开集」失败类。

### 本 change 承诺什么、**不**承诺什么（如实划界）

| 承诺 | 不承诺 |
|---|---|
| 通道存在：`base` 是**结构化参数**，派发前校验可解析 | ❌ **不承诺「基线对照有判别力」** —— 消费端 `build.md:343` 的 `git diff --name-only <base>...HEAD` 是**三点 diff（只比已提交）**，而本仓后端**被禁止 commit** ⇒ 未提交工作树下该 diff **恒为空** ⇒ 「取证对象是否被本 change 触及」永远得到「未触及」。**该缺陷先于本 change 存在**（存量靠 `constraints` 塞基线的简报同样中招）⇒ **另立 change 修**（语义迁移 + 需自己的验证 fixture），本 change 只**登记**（见「不做什么」） |
| ref 在**派发时**被解析成 sha 写进简报 ⇒ 不可变、可跨 resume 重填 | ❌ 不承诺「resume 时 `HEAD~1` 守恒」—— 它指续接时点的 HEAD；**跨 resume 要同一基线 ⇒ 填当初简报里印出的 sha** |
| 「声明了没有」可机械核（AC11 的判据直接钉住简报输出） | ❌ 不承诺「LLM 真的会填 `base`」—— 静态层证不了（见 D7） |

## What Changes

### A. schema：两个工具同步加 `base`

| 工具 | 位置 | 变更 |
|---|---|---|
| `delegate` | `lib/delegate-core.ts` 的 `delegateToolDefinition()` | `properties.base`（string，选填但见 C） |
| `dispatch` | `lib/delegate-async.ts` 的 dispatch 工具定义 | 同上（**必须同批**：`additionalProperties: false` 会硬拒，不同步就是陷阱） |

`base` 的语义：**本次派发的基线**，供后端跑 `git merge-base` / `git show`。
**它是「派发参数」，不是 session 继承的上下文** —— resume 时由调用方重新提供（理由见 `design.md` D2）。

### B. 简报：生成基线行（**派发时已解析成 sha**）

`buildBrief()` 在为 engineering 类生成简报时输出：

```
- 基线（base）: HEAD~1 → 3f2a1b9c…（40 位 sha）
```

- **派发时**（`execute` 内）用 `git rev-parse --verify --end-of-options "<base>^{commit}"` 解析出 sha，
  把**已解析值**交给 `buildBrief`（故 `buildBrief` 扩第三参，见 design D4）。
- 若工程**不是 git 仓**（`vcs=false`），输出「本工程无 VCS，基线不可用」而**不是**报错（见 D）。
- 印出 sha 的理由：相对 ref 会随 HEAD 移动（`dispatch`/`resume` 窗口内），sha 不可变 ⇒ 跨 resume 可重填同一基线。

### C. 校验：空值语义、注入加固、knowledge 互斥

- `validateBrief()`：只认 **`undefined`** 为「没填」；`""` / `null` 一律**非法**（与 `role_class` 的既有语义一致）。
- **注入加固**：`base` 的值最终会进后端的 `git` 命令 ⇒ 拒绝首字符 `-`（`--help` / `-h` / `--output=…` 会被当选项）、
  含空白 / 换行、含 `..`。
- **knowledge + base ⇒ 硬拒**（与 `role_class` / `grants` 对 knowledge 的既有硬拒策略对齐；今天是**静默忽略**）。

### D. 派发前硬拒（位置与顺序都是决策）

- **硬要求下移到 `execute`**（`effectiveRoleClass` 解析之后）：`effectiveRoleClass === "verifier"` 且 `vcs === true`
  且 `base` 未填 ⇒ **派发前硬拒**。
  - 为什么不在 `validateBrief` 判：`validateBrief` 拿不到 `effectiveRoleClass` / `workRoot` / `vcs`
    （resume 时它由登记值解析）⇒ 在那里判会在 resume 路径上**两个方向都错**（design D3）。
  - **顺序**：`base` 闸门排在 `assertRoleClassCompatible` **之后** —— 否则「scope 越界 + 缺 base」会先报 base，
    把「scope 越界」这条更根本的错误掩盖掉（既有用例 `tests/delegate-async.test.ts:422` 的 `/越界/` 断言会破）。
- **vcs 闸门**：`vcs === false` ⇒ **不要求** `base`（否则非 git 工程的所有 verifier 派发会被全量拒绝 = 行为回归）。
- **可解析性校验**：`git rev-parse --verify --end-of-options "<base>^{commit}"`，在 **`workRoot`** 下跑
  （worktree 场景下 `stateRoot` 指向主仓 ⇒ 用它会解析到**主仓的 HEAD**，与后端实际解析不一致）。
  - `^{commit}` 是必需的：annotated tag 用裸 ref 校验会失败，而消费端 `git merge-base` **会** peel tag
    ⇒ 不 peel 就是**误拒合法 base**。

### E. 文档同步（**同批**，否则 code 绿而文档打架）

| 文件 | 改动 |
|---|---|
| `prompts/plan.md` 的 verifier 行 | 「派发时**必填** `base` 参数（如 `HEAD~1` 或 sha）；不填 ⇒ 派发被拒」 |
| `prompts/plan.md` 的「派发参数」段 | 提到 resume verifier 也须重填 `base`（**跨 resume 要同一基线 ⇒ 填当初简报里的 sha**） |
| `prompts/front.md` 的 verifier 行（`:93`） | 补 `base` 必填 + resume 须重填 |
| `prompts/front.md` 的标题（`:84`） | 「五个必填字段 + 两个选填」计数随参数变化（否则失真） |
| `prompts/build.md` | 简报字段说明补「基线（base）」行。⚠ **`:343` 的基线纪律原文已是目标措辞**（「缺省 `origin/main` 仅对未声明基线的存量简报生效」）⇒ **确认即可，不必改** |
| `docs/backend-handoff-role-class.md:31` | 参数流图 `{ plan_ref, scope, acceptance, role_class }` 补 `base` |
| **工具 description** | `delegate` 的 `properties.base.description` + **`dispatch` 的手抄 description**（`async:1100-1104`）都要写明「verifier 类必填 + resume 须重填」—— **派发瞬间 LLM 读的就是它** |

### F. 判据收口

- **AC29 从「登记式」转为「行为断言」**：`buildBrief(validateBrief({...base:"HEAD~1"}))` 的输出必须含基线行
  （当前 AC29 只扫源码里有没有 `基线` 字样 —— 太松，见 design D6）。
- **删除 `KNOWN_UNIMPLEMENTED_CHANNELS` 里的 `delegate-base` 条目** —— 双向判据会强制这一点，
  且**必须与 schema 改动同批**（否则 Task 1 落地当轮即红）。

## 不做什么（scope 边界）

| 项 | 理由 |
|---|---|
| **修消费端的三点 diff**（`build.md:343` 的 `git diff --name-only <base>...HEAD` → 两点 `git diff --name-only <base>`） | 缺陷**先于本 change 存在**；修它是「committed-range → 工作树」语义迁移，需自己的决策记录与验证 fixture ⇒ **另立 change**。本 change 只登记（design 风险表 + 已知边界） |
| `buildBrief:1422` 的 kind 枚举手抄 | 不同失败域；已在交接清单 ⑧ 登记 |
| `delegate-async.ts:1104` / `:1507` 的「返回：」清单手抄 | 同上，交接清单 ⑨ |
| `DELEGATE_RESULT_CRITICAL_FIELDS` 改 `as const` | 与本 change 无关，交接清单 ⑩ |
| 把 `base` 加进**返回**契约（回传解析后的 sha） | 输入侧闭环是本 change 的边界；结果侧留给独立 improvement |
| `dispatch` description 全面派生化 | 超范围；本 change 只补 base 语义 + 加结构守卫 |
| base 落盘 `pair.json` 供 resume 继承 | 违背已定决策；且会让 resume 静默携带**过期**基线 |
| 真模型 e2e（证明「LLM 真的会填 base」） | 静态层证不了；本 change 只做到 fake-ctx 管道测试 + 登记 known boundary（D7） |

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | `delegate` 与 `dispatch` **两个** schema 都含 `properties.base`（`type: "string"`），且两处 `required` **都不含** `base`（选填 + 条件必填，不是无脑必填） | 结构 | `tests/delegate-core.test.ts` + `tests/delegate-async.test.ts` |
| AC2 | `buildBrief(validateBrief({...合法派发, base: "HEAD~1"}))` 的输出含 `基线（base）: HEAD~1 → <sha>`（**行为断言**，sha 为 40 位 hex）；**且**该 sha 在 fixture git 仓里 `git merge-base HEAD <sha>` **exit 0**（端到端静态闭环：不依赖 LLM 即可证明「通道输出能被消费端第一条命令消费」） | 行为 | `tests/delegate-core.test.ts` |
| AC3 | `base: ""` 与 `base: null` ⇒ `validateBrief` **抛错**（只认 `undefined` 为没填） | 行为 | 同上 |
| AC4 | 注入加固：`"--help"` / `"-h"` / 含空白 / 含 `..` ⇒ 被拒；错误信息指名被拒形态 | 行为 | 同上 |
| AC5 | `role_class=verifier` + git 仓 + **未填 base** ⇒ `execute` 在建 session **之前**硬拒；错误信息含「base」+「verifier 派发必须声明基线」+「resume 须由调用方重填 base」。**delegate 与 dispatch 两侧各一份** | 行为（fake ctx） | `tests/delegate-tool.test.ts` + `tests/delegate-async.test.ts` |
| AC6 | `role_class=verifier` + **非 git 工程** + 未填 base ⇒ **放行**（vcs 闸门，防行为回归）；简报含「无 VCS，基线不可用」 | 行为（fake ctx） | 同上 |
| AC7 | `base` 是**不可解析**的 ref ⇒ 派发前硬拒；且 **annotated tag**（`v1.0`）**不被误拒**（校验用 `^{commit}` peel） | 行为 | 同上 |
| AC8 | **resume** verifier 且调用方重填 `base` ⇒ 简报含基线行（证明 resume 路径不需要「例外」） | 行为（fake ctx） | 同上 |
| AC9 | `kind=knowledge` + 填了 `base` ⇒ **硬拒**（与 `role_class` / `grants` 对 knowledge 的硬拒策略对齐，不再静默忽略） | 行为 | `tests/delegate-core.test.ts` |
| AC10 | **文档面一致**（五个面，互相不矛盾）：① `plan.md` 的 verifier 行（必填 `base`）；② `plan.md` 派发参数段（resume 须重填 + 跨 resume 用当初 sha）；③ `front.md` 的 verifier 行（`:93`）；④ `front.md` 的标题计数（`:84`）与 `docs/backend-handoff-role-class.md:31` 参数流图；⑤ **工具 description**（`delegate` 的 `properties.base.description` + `dispatch` 的手抄 description）含「verifier 必填 + resume 须重填」。⚠ `build.md:343` 的基线纪律**原文已是目标措辞 ⇒ 确认即可，不作判据** | 结构（守卫） | `tests/config-guards.test.ts` |
| AC11 | AC29 **从登记式转为行为断言**：断言 `buildBrief` 输出含基线行；且 `KNOWN_UNIMPLEMENTED_CHANNELS` 里**不再有** `delegate-base` 条目（双向判据强制） | 结构 | `tests/config-guards.test.ts` |
| AC12 | **拒绝顺序**：`verifier` + `scope` 越界 + 缺 `base` ⇒ 第一条错误必须是 **scope**（`base` 闸门排在 `assertRoleClassCompatible` 之后）。且既有用例 `tests/delegate-tool.test.ts:804`（verifier 派发成功路径）**已补 `base`**、`tests/delegate-async.test.ts:422` 的 `/越界/` 断言**仍成立** | 行为（fake ctx） | `tests/delegate-async.test.ts` + `tests/delegate-tool.test.ts` |
| AC13 | 回归：`bun test tests/` 全绿（**单独校验退出码**）；`bash scripts/check-upstream-anchors.sh` 无 `FAIL` / 无 `SKIP` | 结构 | 全量 |
| AC14 | **revert 演练留痕**：逐条回退 ⇒ 指名哪条 AC 变红；记录写入 `.rddf/reviews/delegate-base-channel-revert-map.md` | 结构 | 该文件 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [x] AC1 两处 schema 都有 `base`，`required` 不含它
- [x] AC2 简报基线行 `<raw> → <sha>` + 该 sha 的 `merge-base` exit 0
- [x] AC3 `""` / `null` 被拒
- [x] AC4 四种注入形态被拒
- [x] AC5 verifier 缺 base ⇒ 两侧链路都硬拒（文案含三点）
- [x] AC6 非 git 工程 ⇒ 放行 + 简报说明
- [x] AC7 不可解析 ref 被拒；annotated tag 不被误拒
- [x] AC8 resume verifier 重填 base ⇒ 简报含基线行
- [x] AC9 knowledge + base ⇒ 硬拒
- [x] AC10 五个文档面一致（含 `:84` 计数与参数流图与工具 description）
- [x] AC11 AC29 转行为断言 + 登记条目已删
- [x] AC12 拒绝顺序（scope 先于 base）+ 两处既有用例已处置
- [x] AC13 回归绿 + anchors 无 SKIP
- [x] AC14 revert 演练留痕

> **验收证据（2026-11-19 归档前补记）**：`.rddf/reviews/delegate-base-channel-review.md` §3（TDD 逐条红灯 ⇒ 精确指向预期断言）+ §4（AC8 的判别力注入：闸门改按声明值判 ⇒ AC8-①/② 双红）+ §5（revert 演练）+ §6（`bun test tests/` **577 pass / 0 fail**、anchors **23/23**、`openspec validate` **valid**）+ `.rddf/reviews/delegate-base-channel-revert-map.md`（**AC1–AC14 逐条标记**：AC6/AC7 **未单独演练**及其理由（豁免分支 / peel 修法的破坏方向相反）、AC13 为回归项、AC14 即该留痕本身）。
