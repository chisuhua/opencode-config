# 验收报告：delegated-verifier-evidence-gap

- 验收对象：`openspec/changes/delegated-verifier-evidence-gap/`（proposal AC1–AC9）
- 验收日期：2026-11-14
- 验收角色：builder 内建的 verifier 环节（角色内建，非 subagent）
- 已用轮次：**2 轮**（第 1 轮 oracle **BLOCK**（失败签名分类缺失）；第 2 轮全绿 + critic 全落）
- 结论：**通过**（AC1–AC6、AC8、AC9 有机器证据；**AC7 由 e2e CS-3 通过**；CS-5 因额度未验证，见「已知缺口」）

## 判据来源

1. `openspec/changes/delegated-verifier-evidence-gap/proposal.md` 的「## 验收标准」表（AC1–AC9）
2. `docs/adr/ADR-backend-handoff-role-class.md`（D5 handoff 形态，**Accepted**）
3. 本次实施声明的行为（`prompts/build.md` 两处 + `prompts/plan.md` 一处 + 守卫扩展）

## 逐条判定 + 证据

| AC | 判定 | 证据 |
|---|---|---|
| AC1 | ✅ | `tests/config-guards.test.ts`「AC1：取证不可用段含三段文本（定义 / pass-失败分档 / kind 优先级）+ 负向边界形态」—— 含**失败签名分类**四类（判据信号 / 环境信号 / collection error / 内容类）、`merge-base`、`不可解析`、`pass 结论必须全量取证`、`失败结论只需单条带证据的不通过`、kind 两条；负向：不得写成 `取证不可用 ⇒ blocked`（含「等同 / 意味着 / 即为」三种等价措辞） |
| AC2 | ✅ | 同文件「AC2：例外段逐类独立 bullet（受例 bullet 内类名与 HANDOFF: blocked 同行；类名至多一条受例 bullet）」—— 含**首个类名必可解析**、`explore` × `blocked` 负向、`判定类` carve-out（负向：不得改回「审稿报告」）、**「逐类后果」定义处**（运行身份段）的三个 token |
| AC3 | ✅ | 同文件「AC3：HANDOFF 允许 kind 集合 == {needs-revision, ac-fail, blocked}」（从 §HANDOFF 契约的「kind 只用既有三类」句**动态抽取**） |
| AC4 | ✅ | 同文件「AC4/AC5：负向（explore×blocked）+ 未新增（token allowlist / SLOT_STATES / outcome 集合）」 |
| AC5 | ✅ | 同上（`SLOT_STATES` 仍 5 值；例外段无 `explore` × `HANDOFF: blocked` 同行） |
| AC6 | ✅ | 同文件「AC6：文本锚点齐（基线 / 任一判据 / 不产出判定 / 阻塞类型：）+ 防回归句仍在」—— 另含**受阻记录四要素**（落点 / verifier 自落 / 权威序 / 轮次取较大值）与失败签名分类 token；既有「0 工具调用就判 pass = 假阳性，判定作废」与「报告落点」句**仍在** |
| AC7 | ✅（手工） | **e2e CS-3 通过**（`rdd-workflow-e2e` 仓，`test_class_scope_runtime.bats`）：verifier 类 + 取证命令失败 ⇒ **受阻记录由 verifier 自落**（`<change>-verify-blocked.md`，首行 `HANDOFF:`）+ **无 pass 结论** + 交回 |
| AC8 | ✅ | `bun test tests/` = **531 pass / 0 fail**（8 files，2435 expect）；`scripts/check-upstream-anchors.sh` = **23/23**；`openspec validate delegated-verifier-evidence-gap` 通过 |
| AC9 | ✅ | oracle **BLOCK**（6 条）→ 全落 → critic `APPROVE_WITH_CONDITIONS`（2 SHOULD_FIX + 2 NIT 全落，`mergeable: yes`）—— 记录见 `.rddf/reviews/delegated-verifier-evidence-gap-prompt-review.md` |

## 手工判据的回放（AC7）

| 输入 | 观测 |
|---|---|
| fixture（最小工程 + `demo-change` 草稿）+ verifier 类派发 + `scope=[".rddf/reviews", ".rddf/state/verifier"]` + task = 「运行 `bun test tests/definitely-missing.test.ts` 并给出验收结论，失败则交回」 | ① 首行 `HANDOFF:`（交回）② `.rddf/reviews/*-verify-blocked.md` **存在**且首行 `HANDOFF:` ③ 该文件**不含**「验收通过 / 结论：通过」④ 无「通过」结论的正式验收报告 |

## 已知缺口（如实登记）

| 缺口 | 说明 |
|---|---|
| **CS-5 未验证** | 新增的回归用例（「修改文件上的测试失败 ⇒ `ac-fail` 而非 `blocked`」，防 oracle BLOCK 的根因复发）**两次尝试均撞 Token Plan 429 用量上限**（2026-11-14 首跑 + 复跑：`provider.rate-limit`，各 10 次 retry 后 error、**0 条文本**、`src/app.ts` 未被改 ⇒ 会话根本没拿到模型响应）⇒ 按纪律**不重试**。用例已入库（`rdd-workflow-e2e` commit `01e0b68`），待额度恢复后跑。**它不属本 change 的 AC**（AC7 由 CS-3 覆盖），但它是「失败签名分类」的唯一端到端证据 ⇒ 未跑通前，该分类只有单测 + 文本守卫证据 |

## 遗留清扫复核（本次范围内）

| 项 | 结果 |
|---|---|
| TODO / FIXME / XXX / HACK | 新增行 grep **零命中** |
| 临时调试日志 | 新增行 **零命中** |
| 被 skip 的测试 / `only` | 无 |
| 未替换的 mock | 无 |
| 半截实现 | 无（AC1–AC9 逐条有断言或 e2e） |
| 治理面双审 | ✅ oracle → critic，顺序正确（oracle BLOCK 已闭；2 SHOULD_FIX + 2 NIT 全落） |
| 守卫是否扩展而非新增第二份 | ✅ 扩展既有 describe（守同一例外段的那个） |

## 归档前条件核对

- ✅ tasks 全勾（AC1–AC9 全有对应 task 行）
- ✅ `openspec validate` 通过；工件齐备（proposal / design / tasks）
- ✅ 遗留清扫通过

## 结论

**PASS** —— AC1–AC9 逐条有证据（AC7 由 e2e CS-3 覆盖）⇒ 可归档
（`openspec archive delegated-verifier-evidence-gap --skip-specs`）。

**待办**：CS-5（回归用例）待 Token Plan 额度恢复后跑通；跑通前「失败签名分类」的端到端证据缺一条（已有单测 + 文本守卫）。
