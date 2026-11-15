# delegate-base-resolved-return — 把「实际用的基线 sha」放进返回值契约

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。
> ⚠ **本文件由 builder 代 planner 起草**（用户直接指定）⇒ **待 planner 审查**（metis 1 轮）后方可立项。
> 来源：`delegate-base-channel` 的审稿残留 ⑪（`.rddf/reviews/session-handoff-20261114.md`）
> 决策依据：`openspec/changes/delegate-base-channel/design.md` 的 **D2**（resume 语义）+ **D4**（sha 冻结）
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

### A. 返回契约加 `base_resolved`（**三处同批改，缺一即 fail-closed**）

| 位置 | 改什么 |
|---|---|
| `lib/delegate-core.ts` 的 `DELEGATE_RESULT_FIELDS` | 加 `base_resolved`（string \| null） |
| `lib/delegate-core.ts` 的 `summary` 构造 | 填「本次实际解析出的 sha」（非 verifier / 未填 ⇒ `null`） |
| `lib/delegate-core.ts` 的 `assertDelegateResultShape()` | 契约常量加了字段 ⇒ **自检自动 fail-closed**（缺字段即抛） |
| `tests/config-guards.test.ts` 的 AC22 | 契约字段集 ↔ `summary` 键**双向**一致 ⇒ 加字段后自动跟随 |
| `prompts/plan.md` / `prompts/front.md` | 「委托后怎么读结果」补一行 `base_resolved` 的语义（本次实际用的基线 sha；null = 未用基线） |

⚠ **顺序不能错**：`assertDelegateResultShape` 跑在**序列化之后**的对象上（v2.28 的修复）⇒
字段值为 `undefined` 会**丢键** ⇒ 必须 `?? null`（**不是** `undefined`）—— 这正是 v2.28 critic 抓到的那个坑。

### B. `base_resolved` 的语义定义（**必须写死，否则会被误用**）

- **它是「本次派发实际用的 sha」**，不是「调用方请求的 ref」⇒ 两者可能不同（`HEAD~1` → 具体 sha）。
- `null` = 本次**没有**用基线（非 verifier 类 / 未填 base / 非 git 工程）。
- 它**不可用于 resume**：resume 是**新的派发** ⇒ 它的 `base_resolved` 是**新一次**解析的结果。
  ⇒ 跨 resume 要同一基线 ⇒ 派发方必须把**上次**的 `base_resolved` **显式填进**下次调用的 `base`。
  （`base` 接受 40 位 sha 作为 ref —— 已实测 `git rev-parse --verify "<sha>^{commit}"` 可解析。）

### C. 不做什么（明确边界）

- **不**把 `base`（原始 ref）也放进返回契约：派发方自己知道请求了什么；返回「实际用的」才是新增信息。
- **不**把它加进 `DELEGATE_RESULT_CRITICAL_FIELDS`（派发方**必须知晓**的 7 个）——
  它是「resume 续接时需要」的字段，不是「每次派发都要读」的 ⇒ 先放全量契约，不进关键子集
  （若后续发现派发方普遍不读，再考虑提升）。
- **不**改 `base` 的入参语义、不改闸门逻辑、不改 `buildBrief` —— 本项只加**返回侧**的一个字段。

## Acceptance

- [ ] `DELEGATE_RESULT_FIELDS` 含 `base_resolved`，且 `summary` 构造填「本次实际解析出的 sha」
      （非 verifier / 未填 base / 非 git 工程 ⇒ `null`，**不是** `undefined` —— 否则序列化丢键）
- [ ] `assertDelegateResultShape()` 对「缺 `base_resolved` 键」**抛错**（fail-closed）——
      用「构造一个少该键的对象」断言它抛，且消息含字段名
- [ ] AC22 的**双向**一致性守卫随之通过（契约字段集 ↔ `summary` 键），且**未新增**手抄清单
- [ ] 派发 verifier + 填 `base` ⇒ 返回对象的 `base_resolved` == 该次解析出的 sha（**真实值**，非形态）
- [ ] 派发 builder（非 verifier）⇒ `base_resolved === null`
- [ ] **跨 resume 同基线可复现**：第一次派发拿到 `base_resolved = S` ⇒ 第二次 resume 时把 `base: S`
      填进去 ⇒ 第二次的 `base_resolved` **仍等于 S**（端到端断言，不只是形态）
- [ ] `prompts/plan.md` 与 `prompts/front.md` 的「读结果」段各有一行 `base_resolved` 的语义说明
      （含「它是实际用的 sha，不是请求的 ref」与「resume 要同一基线 ⇒ 填上次的 sha」）
- [ ] 回归：`bun test tests/` 全绿（**单独校验退出码**）；anchors 无 `FAIL` / 无 `SKIP`

## Capabilities

- 派发方**可观测**本次实际使用的基线 ⇒ 「跨 resume 同一基线」从**人工纪律**变成**通道**
- 返回契约多一个字段，但**不**进关键子集 ⇒ 派发方的读取负担不变
- 与 `base` 的入参语义形成**闭环**：入参是「请求的 ref」，出参是「实际用的 sha」

## Impact

- **返回契约变更**（27 → 28 字段）⇒ 派发方若按「字段全集」枚举输出，会有一个新字段出现（向前兼容）
- **fail-closed 自检**：契约加了字段而 `summary` 没填 ⇒ **运行时直接抛错**（而不是静默少一个字段）
  ⇒ 这正是 v2.28 修掉的那个坑（`wait_error` 恒 `undefined` ⇒ 线上只有 26/27 字段）的**制度化**
- **不破坏**现有派发：非 verifier 类的 `base_resolved` 恒 `null`；`base` 入参语义不变
- **风险**：若派发方把 `base_resolved` 当成「resume 时自动继承」⇒ 会误用 ⇒ 由 **Acceptance 第 6 条**
  （跨 resume 显式重填的端到端断言）与文档措辞共同守住
