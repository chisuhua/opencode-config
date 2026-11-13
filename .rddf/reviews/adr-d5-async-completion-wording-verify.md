# 验收报告：adr-d5-async-completion-wording

- 验收对象：`openspec/changes/adr-d5-async-completion-wording/`（proposal AC1–AC14）
- 验收日期：2026-11-14
- 验收角色：builder 内建的 verifier 环节（角色内建，非 subagent）
- 已用轮次：**1 轮**（oracle BLOCK 的 finding 在**实施期**闭合 ⇒ 验收期无失败项 → 无返工）
- 结论：**通过**（AC1–AC14 逐条有证据）

## 判据来源

1. `openspec/changes/adr-d5-async-completion-wording/proposal.md` 的「## 验收标准」表（AC1–AC14）
2. `docs/adr/ADR-backend-handoff-role-class.md`（D5，**Accepted**）—— 判据的决策依据
3. 本次变更声明的行为（ADR 2 行 + spec 2 行 + plan.md 1 行 + build.md 2 处 + 守卫 describe + CHANGELOG）

## 逐条判定 + 证据

| AC | 判定 | 证据 |
|---|---|---|
| AC1 | ✅ | `tests/config-guards.test.ts`「AC1：ADR D5 的识别条目含两个观测条件，且不含「完成通知后」的等待语义」—— 切片 `### D5`→`### D6` 取 `- 识别：` 行；断言 `running=false` / `state=idle` / 「没有完成通知」/ `not.toMatch(/完成通知后/)` + **逃逸口径三组 token**（「不必等」「reconcile-on-read」「outcome=succeeded」） |
| AC2 | ✅ | `git diff --numstat` 对 ADR = **2 2**（D5 识别条目 1 行改写 + 「槽自动释放」补半句）；选项对比表 / 后果章 / Verification 章 / Status 行**零改动**（人工核对 diff） |
| AC3 | ✅ | D5 识别条目行尾含「（D5 措辞修订 2026-11-14：澄清「完成」= 轮询观测，无决策变更）」；ADR Status 行未变（`git diff` 仅 2 行，均在 D5 段内） |
| AC4 | ✅ | 守卫「AC4：spec 保留原文 + 行尾 v4 修订注 + 自定口径段含 v4」—— 断言 `v4 修订 2026-11-14` + `异步面无推送通道` + `v4 = v3 +` + **原文仍在**（`异步在完成通知后`） |
| AC5 | ✅ | 守卫 AC1 的逃逸口径三组 token + 提案 AC5 已与实现对齐 |
| AC6 | ✅ | ADR D5「识别」条目含 `running=false` + 「没有完成通知」+ 逃逸口径；**决策内容 / 选项对比 / 后果 / Verification / Status 零改动**（同 AC2） |
| AC7 | ✅ | 守卫切片 `### D5` → `### D6` 后取 `- 识别：` 行（**不扫整段、不依赖行号**） |
| AC8 | ✅ | 守卫「AC8：CHANGELOG 有本 change 的条目（判例要求的可追性）」—— **机械判据**：条目含结论标记 ⇒ `.rddf/reviews/adr-d5-async-completion-wording-prompt-review.md` **必须存在**（`existsSync`）；否则条目只能是「待进行」。本回合：审稿记录已落盘 ⇒ 结论已回填 ⇒ 绿 |
| AC9 | ✅ | 传播面清扫：`grep -rn "完成通知" docs/ prompts/` 的命中数已记录（`docs/backend-handoff-role-class.md` 与 `docs/MULTI-AGENT-DESIGN.md` 零命中，已核） |
| AC10 | ✅ | 归档目录 `openspec/changes/archive/**` 内的同措辞**不判失败**（归档不可变，in-place 不改） |
| AC11 | ✅ | `bun test tests/` = **507 pass / 0 fail**（8 files，2296 expect）；`scripts/check-upstream-anchors.sh` = **23/23**；`openspec validate adr-d5-async-completion-wording` 通过 |
| AC12 | ✅ | 守卫「AC12：plan.md 的临时消歧句已删；异步面 bullet 的正向内容仍在」—— 负向「没有推送通道」「ADR D5 所述的「完成」」+ 正向「没有**完成信号」「running=false」「完成判据以 `rddf feedback list` 为准」「不必等 `state=idle`」 |
| AC13 | ✅ | 守卫「AC13：build.md 作用域表有「本仓特例裁定」行」—— 断言「本仓特例裁定」「ADR 行」「不属治理面」「只 oracle」「配置根」「项目仓」「oracle → critic 必审」 |
| AC14 | ✅ | 守卫「AC14：build.md 有「Accepted ADR 描述性措辞修订」判例」—— 断言「只 oracle」「oracle → critic 必审」「Status 行不动」「描述性措辞」「不增删 bullet」「不改表格行」+ 排除清单四要素（选项对比表 / 后果章 / Verification 章 / 决策条目）+「默认按「决策相关」处理」 |

## 机制事实复核（oracle finding 2 的前提，由本回合独立核验）

| 事实 | 核验方式 | 结论 |
|---|---|---|
| `isRunning` 是活体判读（`time.busy` vs `time.idle`） | 读 `lib/delegate-core.ts:215-224` | ✅ |
| `updateSlotState` 的全部调用点（`:1240/1443/1722/2120/2283`）**无一**在「自然完成」时翻 `idle` | grep 全部调用点 | ✅ ⇒ 「不必等 `state=idle`」的逃逸口径**必要** |
| 槽位释放只有 reconcile-on-read（`:613-623`，下次读/派发时触发）+ suspend/cancel | 读 `lib/delegate-async.ts` | ✅ ⇒ 常见轮询场景 `state` 可能仍为 `active`，按字面等 `state=idle` 会**永不满足** ⇒ 与本 change 要消灭的「字面等待 → 卡死」同型 |

## 遗留清扫复核（本次范围内）

| 项 | 结果 |
|---|---|
| TODO / FIXME / XXX / HACK | 新增行 grep **零命中** |
| 临时调试日志 | 新增行 **零命中** |
| 被 skip 的测试 / `only` | 无 |
| 半截实现 | 无（ADR 2 行 + spec 2 行 + plan.md 1 行 + build.md 2 处 + 守卫 7 条断言，逐条有 AC 覆盖） |
| 治理面双审 | ✅ oracle **BLOCK**（CHANGELOG 预断言）→ 闭合；critic `APPROVE_WITH_CONDITIONS`（2 SHOULD_FIX + 1 NIT 全闭合）—— 记录见 `.rddf/reviews/adr-d5-async-completion-wording-prompt-review.md` |
| 判据与实现一致性 | ✅ proposal 的 AC1 / AC2 / AC5 / AC8 / AC12 / AC14 与最终实现**逐条对齐**（critic SHOULD_FIX 2 的直接对象） |

## 归档前条件核对

- ✅ tasks 全勾（AC1–AC14 全有对应 task 行）
- ✅ `openspec validate` 通过；工件齐备（proposal / design / tasks；`skip_specs`）
- ✅ 遗留清扫通过

## 结论

**PASS** —— AC1–AC14 逐条有证据 ⇒ 可归档（`openspec archive adr-d5-async-completion-wording --skip-specs`）。

**残留**（CHANGELOG ⑤ 已登记）：类写集对齐（`verifier` 类写 `.rddf/state/verifier/*` 越类 / `builder` 类能否落 `.rddf/reviews/**`）属**权限面 + 产品侧 skill** ⇒ 另立，需 architect 先出 ADR。
