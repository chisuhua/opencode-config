---
状态: 待审查
优先级: P2
---
# delegate-base-resolved-return — 把「实际用的基线 sha」放进返回值契约

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。
> ⚠ **本文件由 builder 代 planner 起草**（用户直接指定）⇒ **待 planner 审查**（metis 1 轮）后方可立项。
> 来源：`delegate-base-channel` 的审稿残留 ⑪（`.rddf/reviews/session-handoff-20261114.md`）
> 决策依据：`openspec/changes/archive/2026-11-19-delegate-base-channel/design.md` 的 **D2**（resume 语义）+ **D4**（sha 冻结）
> 关联：`.rddf/reviews/delegate-base-channel-review.md` §7 残留 ②
> 执行路径预估：**常规 change**（触及 `lib/**` 返回契约 + 守卫 ⇒ 治理面 ⇒ oracle → critic 各 1 轮）

## Why

`delegate-base-channel`（v2.31）把基线**在派发时**解析成 sha 并写进后端简报：

```
- 基线（base）: HEAD~1 → 3f2a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3
```

它同时解决了两个真问题：相对 ref 会随 HEAD 漂移（冻结成 sha 后 resume 才自洽）；typo 在派发前被拒。

**但这个 sha 对派发方结构性不可达**：

| 面 | 现状 |
|---|---|
| 简报内容 | 只进**后端 session 的第一条用户消息**（`ctx.session.prompt`）⇒ 派发方看不到 |
| 返回契约 | `DELEGATE_RESULT_FIELDS`（27 项）**不含**它 |
| `sessions` 工具 | 读消息但只回状态 / `role_class` 类字段，**不回消息文本** |
| `pair.json` | `registerSession()` 存的字段集是**治理过的契约**，不含它 |

⇒ 而 design **D2** 承诺：「跨 resume 要同一基线 ⇒ **填当初简报里印出的 sha**」。

**这个句柄派发方拿不到** ⇒ D2 的承诺 bite 自己：跨 resume 换基线（`HEAD~1` 在续接时点解析成另一个 sha）时，
派发方**没有任何办法**复现当初的基线 —— 除非自己 shell 跑 `git rev-parse` 记笔记，而那恰恰绕开了
「派发时冻结」的价值（笔记可能记错/丢失；跨 front resume 时原 front 已亡则彻底无源）。

⇒ v2.31 已加**过渡兜底句**（「派发方自己 `git rev-parse <ref>^{commit}` 记一份」），
但那是**人工纪律**，不是**通道** —— 本仓的既有教训（`guard-authoring.md` §1）正是「散文判据是开集」。

## What Changes

### A. 返回契约加 `base_resolved`（**必改 2 处**；另 2 处**自动跟随、不得改实现**）

| 位置 | 改什么 | 类别 |
|---|---|---|
| `lib/delegate-core.ts` 的 `DELEGATE_RESULT_FIELDS` | 加 `base_resolved`（string \| null） | **必改** |
| `lib/delegate-core.ts` 的 `summary` 构造 | 填「本次实际解析出的 sha」（四态见 §B） | **必改** |
| `lib/delegate-core.ts` 的 `assertDelegateResultShape()` | **不改实现** —— 它按契约常量过滤（`!(f in result)`）⇒ 字段一进契约就**自动**要求它存在 | ⚠ **自动跟随**（改它等于改守卫语义） |
| `tests/config-guards.test.ts` 的 AC22 | **不改** —— 它从源码解析 `summary` 的键做**双向**比对 ⇒ 加 key 后**自动**跟随 | ⚠ **自动跟随** |
| `prompts/plan.md` / `prompts/front.md` | 「委托后怎么读结果」补一行 `base_resolved` 的语义 | 必改（**须配一条机检**，见 §D） |

⚠ **顺序不能错**：`assertDelegateResultShape` 跑在**序列化之后**的对象上（v2.28 的修复）⇒
字段值为 `undefined` 会**丢键** ⇒ 必须 `?? null`（**不是** `undefined`）—— 这正是 v2.28 critic 抓到的那个坑。

⚠ **一处例外（既有缺陷，本项不修但必须知道）**：`outcome=busy` 的**早退分支**
（`delegate-core.ts` 的 busy 早返回）**不跑 `assertDelegateResultShape`**、也不含任何契约字段
⇒ 「契约加了字段 ⇒ 自检自动 fail-closed」**在 busy 分支不成立**。⇒ 见 §E 的已知边界。

### B. `base_resolved` 的语义定义（**四态，必须写死，否则会被误用**）

| 情形 | `base_resolved` | 说明 |
|---|---|---|
| 非 verifier 类（builder / architect / knowledge） | `null` | **不适用**（不做基线对照） |
| verifier + **非 git 工程** | `null` | **豁免**（`vcs=false`） |
| 非 verifier **却传了 `base`** | `null` | ⚠ **静默忽略**（现状：`validateBrief` 只在 `kind==="knowledge"` 时拒 base；builder 传 base 被无声丢弃）⇒ 调用方**分不清**「不适用」与「没生效」 |
| `base` 不可解析 | **无返回值** | 派发被拒（在建 session 之前）⇒ 没有返回对象 |

- **它是「本次派发实际用的 sha」**，不是「调用方请求的 ref」⇒ 两者可能不同（`HEAD~1` → 具体 sha）。
- ⚠ **不是纯输入函数**：它是 `resolveCommitSha(base, workRoot)` 的结果 ⇒ 同 `base` 在不同
  `workRoot`（worktree 场景）下可能解析出不同 sha ⇒ 契约注释**不可**写成「`base` 的解析结果」。
- **不得由系统自动继承/回填**：resume 时须由调用方**显式**填上次的 sha。
  （`base` 接受 40 位 sha 作为 ref —— **已实测**：`git rev-parse --verify --end-of-options "<sha>^{commit}"`
  可解析，且可作两点 diff 的基线。）
- 同一 session 多次 resume、每次 `base` 可能不同 ⇒ 语义是「**最近一次**解析值」（last-write-wins），
  因为它就是「下一次要填的输入」。

### C. 不做什么（明确边界）

- **不**把 `base`（原始 ref）也放进返回契约：派发方自己知道请求了什么；返回「实际用的」才是新增信息。
- **不**把它加进 `DELEGATE_RESULT_CRITICAL_FIELDS`（派发方**必须知晓**的 7 个）——
  它是「resume 续接时需要」的字段，不是「每次派发都要读」的 ⇒ 先放全量契约，不进关键子集
  （若后续发现派发方普遍不读，再考虑提升）。
- **不**改 `base` 的入参语义、不改闸门逻辑、不改 `buildBrief` —— 本项只加**返回侧**的一个字段。

## Acceptance

- [ ] `DELEGATE_RESULT_FIELDS` 含 `base_resolved`，且 `summary` 构造填「本次实际解析出的 sha」
      （非 verifier / 未填 base / 非 git 工程 ⇒ `null`，**不是** `undefined` —— 否则序列化丢键）
- [ ] **负向回归**（既有机制，不是新判据）：临时移除 `summary` 的 `base_resolved` 键 ⇒
      `assertDelegateResultShape()` **抛错**且消息含字段名 ⇒ 证明「契约加字段 ⇒ 自检自动 fail-closed」
      这条回退保护**仍活着**（不新建判据，AC22 已双向钉住契约↔summary）
- [ ] AC22 的**双向**一致性守卫随之通过（契约字段集 ↔ `summary` 键），且**未新增**手抄清单
- [ ] 派发 verifier + 填 `base` ⇒ 返回对象的 `base_resolved` == 该次解析出的 sha（**真实值**，非形态）
- [ ] 派发 builder（非 verifier）⇒ `base_resolved === null`
- [ ] **跨 resume 同基线可复现**：第一次派发拿到 `base_resolved = S` ⇒ **让 HEAD 前移**（否则
      填 `HEAD~1` 也会得到 S ⇒ 判别力为零）⇒ 第二次 resume 时把 `base: S` 填进去 ⇒ 第二次的
      `base_resolved` **仍等于 S**。
      ⚠ **本条只覆盖「同一 front 连续两次派发」**；**跨 front resume 未覆盖**（见 §F 的形状决策）
- [ ] **四态各覆盖 1 条**：verifier+base ⇒ 实际 sha；非 verifier ⇒ `null`；
      verifier + **非 git** ⇒ `null`；**非 verifier 却传了 base ⇒ `null` 且不抛**（静默忽略的现状被钉住）
- [ ] **dispatch 面有显式决定**（三选一，见 §F）：返回带 `base_resolved` / 登记为已知缺口 /
      书面理由「不做」—— ⚠ **默不做声 = 不合格**（现状：`dispatch` 在 async 侧**算出了** baseline
      却**丢弃** ⇒ 异步派发方**永远**拿不到 sha ⇒ D2 在异步面 100% 不可达）
- [ ] `prompts/plan.md` 与 `prompts/front.md` 的「读结果」段各有一行 `base_resolved` 的语义说明
      （含「它是实际用的 sha，不是请求的 ref」与「resume 要同一基线 ⇒ 填上次的 sha」），
      **且有一条机检**（两文件各含 `base_resolved`）—— ⚠ 只写散文不加机检 = 重复现状的病
      （散文判据是开集，见 `guard-authoring.md` §1）
- [ ] `docs/CHANGELOG.md` 里「27 个字段」的**公开散文数字**同步为 28
- [ ] 回归：`bun test tests/` 全绿（**单独校验退出码**）；anchors 无 `FAIL` / 无 `SKIP`

## Capabilities

- 派发方**当场可观测**本次实际使用的基线（⚠ 「当场」是限定词 —— 见 §F：返回字段**不覆盖**
  「另一次调用 / 另一个 front 会话」的场景）
- 返回契约多一个字段，但**不**进关键子集 ⇒ 派发方的读取负担不变。
  理由（修正版）：关键子集的定义是「漏了 ⇒ 可能把『宿主说成功但无可验证交付证据』转述成『已完成』」
  ⇒ `base_resolved` **不承载成功/失败判定** ⇒ 不进。**先例**：`wait_error` / `status_age_ms`
  同为诊断字段，同样不进。
- 与 `base` 的入参语义形成**闭环**：入参是「请求的 ref」，出参是「实际用的 sha」

## Impact

- **返回契约变更**（27 → 28 字段）⇒ 派发方若按「字段全集」枚举输出，会有一个新字段出现（向前兼容）
- **fail-closed 自检**：契约加了字段而 `summary` 没填 ⇒ **运行时直接抛错**（而不是静默少一个字段）
  ⇒ 这正是 v2.28 修掉的那个坑（`wait_error` 恒 `undefined` ⇒ 线上只有 26/27 字段）的**制度化**
- **不破坏**现有派发：非 verifier 类的 `base_resolved` 恒 `null`；`base` 入参语义不变
- **风险**：若派发方把 `base_resolved` 当成「resume 时自动继承」⇒ 会误用 ⇒ 由 **Acceptance 第 6 条**
  （跨 resume 显式重填的端到端断言）与文档措辞共同守住
- **异步面（`dispatch`）当前拿不到 sha** ⇒ 若本项不覆盖它，D2 的承诺在异步面**仍不可达**
  ⇒ 必须做一次显式决定（§F）
- **busy 早返回分支不含契约字段**（既有缺陷）⇒ 那个分支下派发方拿不到 sha

## E. 已知边界（不假装覆盖）

- **返回字段只在派发当场存在** ⇒ 它**不覆盖**「跨 front 会话的 resume」场景（原 front 已亡 ⇒
  返回值随其上下文一起消失）⇒ 这正是 §F 的形状决策要回答的。
- **`busy` 早返回分支**不含任何契约字段、不跑自检（既有缺陷，本项不修）。
- **单 commit 仓库 / 浅克隆**：`HEAD~1` 不可解析 ⇒ verifier 派发被拒 ⇒ `base_resolved` 在该路径上拿不到。
- **非 verifier 传 base ⇒ 静默忽略**（四态之一）：不报错但也不生效。

## F. 形状决策 —— **已定：丙**（用户 2026-11-16 拍板）

> ✅ **决定：选丙**（要求派发方直接传 sha，`base` 已是合法 ref ⇒ **零契约变更**）。
> ⇒ 本 improvement **不新增返回字段**、**不改 `DELEGATE_RESULT_FIELDS`**、**不动 `pair.json`**。
> ⇒ 实际工作只剩「**把丙写进派发方的提示**」——已在 v2.33 落地（`prompts/plan.md` / `prompts/front.md`
>   的「基线身份由派发方持有」段 + 两个工具的 `base` description）。
>
> **为什么丙够**（对比甲/乙）：
> - 甲（返回字段）只覆盖「派发当场」⇒ 对「跨 front resume」零改善（返回值随原 front 上下文消失）；
> - 乙（落盘 + `sessions` 回显）能覆盖跨 front，但要动登记面 + `sessions` 输出 + 文档 ⇒ 面大；
> - **丙把「基线身份」交回派发方** ⇒ 派发方自己 `git rev-parse <ref>^{commit}` 解析并**记下 sha**，
>   填进 `base` ⇒ 派发与后续 resume 用**同一个 sha** ⇒ 基线不漂；
>   跨会话只需**把这个 sha 传下去**（对话历史 / 用户转述）⇒ 无需系统级存储。
> ⇒ **代价**：解析义务从服务端移回调用方（调用方要会 `git rev-parse`）；
>   但**闸门不丢**（填错的 sha 仍会被 `rev-parse --verify` 拒）。
>
> ⚠ **因此本 improvement 的后续动作**：
> - [x] 丙形态写进 `prompts/plan.md` / `prompts/front.md` / 两个工具的 `base` description（v2.33）
> - [x] **不**加 `base_resolved` 返回字段（甲）—— 结论已定，本项**关闭**
> - [x] **不**落盘 `pair.json`（乙）—— 结论已定，本项**关闭**
> - [ ] 归入 `docs/CHANGELOG.md` 的 v2.33 段（已在）并**关闭本 improvement**（登记为「已由丙形态覆盖」）

<details>
<summary>备选形状（保留作决策记录 —— 结论：均不采用）</summary>

## ~~F-旧. 形状决策（已由上面的「丙」取代）~~

> ⚠ **metis 审查的结论**：本草稿原先把「跨 resume 的基线句柄」与「派发当场多一个返回字段」
> 当成同一件事，而**返回字段只覆盖后者**。`Why` 里自己写的失败场景（「跨 front resume 时原 front
> 已亡」）⇒ 返回字段对它**零改善**。
>
> ⚠ **design D2 否掉的是「resume **自动继承**基线**」**（会静默携带过期基线），
> **不是**「把基线**存下来**」⇒ 第三种形状从未被评估过。

| 选项 | 形状 | 覆盖场景 | 成本 | 风险 |
|---|---|---|---|---|
| **甲**（本草稿原案） | 只加返回字段 `base_resolved` | **当场**可观测；同一 front 连续两次可守恒 | 必改 2 处 + 2 处 prompt + 1 条机检 | 跨 front 不可达（**已知边界**，须写进 Why） |
| **乙** | **落盘 `pair.json` + `sessions` 只读回显**（+ 返回字段为辅） | 跨 front 可达（`sessions` 是跨会话唯一读取面） | 落盘点已存在（`registerSession` / `setPairFields`）；`sessions` 已回显 `role_class` 等登记字段 ⇒ 边际成本低 | ⚠ 必须写死「**只读参考，不得自动填入**」⇒ 否则变成 design D2 否掉的「自动继承」 |
| **丙** | **要求派发方直接传 sha**（`base` 已接受 40 位 sha，**已实测**） | 跨 front 天然守恒（sha 在调用方手里） | **零契约变更** | 解析义务从服务端移回调用方 ⇒ 调用方要会 `git rev-parse`；且调用方填错 sha ⇒ 服务端仍会拒（不丢闸门） |

**判据（极短，供拍板）**：

> **「跨 front 会话的 resume」算不算本项要解决的场景？**
> - **算** ⇒ 甲**不合格**（对那个场景零改善）⇒ 选 **乙**（落盘 + 回显，且明写「不得自动填」）。
> - **不算** ⇒ 甲够用，但**必须**在 Why 里把「跨 front 不可达」登记为已知边界，
>   并**收窄** Acceptance 第 6 条（它现在只覆盖同一 front 连续两次）。
>
> **丙** 至少应进选项表（成本为零）；若选丙，本 improvement 退化为「一条 prompt 提示 + 零代码」。

</details>
