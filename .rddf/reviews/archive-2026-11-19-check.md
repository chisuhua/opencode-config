# 归档轮核对记录 — 2026-11-19（批量）

> 触发：用户指令「检查所有 `openspec list` 看到的 change，并对完成的进行归档，并对其他 change 给出后续如何处理建议」。
> 范围：`openspec list` 的**全部 11 个活跃 change**（归档面原有 20 个目录，本批新增 6 个）。
> 治理面审查：**oracle（治理面，`治理面判定: PASS`，带 3 项强制条件）** —— 本记录即其中「批量归档核对载体」那一条的落点。
> ⚠ **证据形态说明**：本批 6 个 change **均无** `.rddf/reviews/<name>-verify.md` 形态的独立验收报告（该形态在本仓自本批起才有）⇒ 验收证据取自各 change 自己的 review / observation / revert-map 记录，并**逐条抄进各 change 的 proposal 内**（可复核）。

## 1. 归档的 6 个（tasks 全完成 + 验收证据已入档）

| change | tasks | AC 勾选状态（本批处理前 → 后） | 验收证据（载体） | 如实保留的 caveat |
|---|---|---|---|---|
| `required-question-commit-confirm` | 21/21 | 全勾 → 全勾（**AC5/AC6 按 ADR 改写**） | ① `docs/CHANGELOG.md` v2.43/v2.44 段 ② `tasks.md` 追加段（层 2 E-8 移除 skip ⇒ 3/3 真绿）③ `docs/adr/ADR-commit-verification-gate.md` 的关联 backlog 行 | **无独立 review 记录**（本批 6 个里唯一）⇒ 已把上述三处写进其 proposal 的「验收证据」注记 |
| `required-question-fallback` | 30/30 | 全勾 → 全勾 | `.rddf/reviews/required-question-fallback-review.md`（oracle 第 1 轮 PASS-WITH-NOTES 7 条全落地 → metis 9 条 → critic 第 1 轮 APPROVE_WITH_CONDITIONS，B1 BLOCKER 已闭） | critic 的 APPROVE_WITH_CONDITIONS 条件项已在该记录内 |
| `no-self-adjudication` | 23/23 | 全勾 → 全勾 | `.rddf/reviews/no-self-adjudication-review.md`（oracle 7 条 → metis → critic 第 2 轮 REJECT（2 BLOCKER + 1 新）→ **第 3 轮 APPROVE_WITH_CONDITIONS，无 BLOCKER**） | critic 第 3 轮明示「修复后**无需再走一轮 full 复审**，归入归档轮核对即可」⇒ 本记录即该「归档轮核对」 |
| `verifier-baseline-worktree-diff` | 26/26 | **未勾 → 已勾 8 条** | `.rddf/reviews/verifier-baseline-worktree-diff-review.md` §4（`bun test tests/` 586 pass / 0 fail + revert 演练 5 条 A–E 逐条命中）+ `-revert-map.md`（AC1–AC8 逐条标记） | ⚠ **AC2–AC4 未逐条独立注入**（与 AC1 共享同一 git 行为路径）；AC3/AC4 的**文档面**已由新增守卫断言覆盖（critic 第 2 轮补）；「不对称」仍是**措辞**判据 |
| `delegate-base-channel` | 36/36 | **未勾 → 已勾 14 条** | `.rddf/reviews/delegate-base-channel-review.md` §3（TDD 逐条红灯 ⇒ 精确指向预期断言）/ §4（AC8 判别力注入 ⇒ 双红）/ §5（revert 演练）/ §6（577 pass / 0 fail、anchors 23/23、validate valid）+ `-revert-map.md`（AC1–AC14 逐条标记） | ⚠ **AC6 / AC7 未单独演练**（豁免分支 / `^{commit}` peel 的破坏方向相反）；§7 残留 6 条（破坏性收紧、`base_resolved` 未进返回契约、三点 diff 恒空、非 verifier 填 base 静默丢弃等） |
| `independent-build-session-e2e` | 28/28 | **未勾 → 已勾 8 条** | `.rddf/reviews/independent-build-session-e2e-observation.md` §1（逐条三态）+ §4（**AC1–AC8 逐条 ✅ 表**）+ §6（E-4 修复后复跑 3/3 非 skip 全绿；层 1 静态守卫 588 pass、anchors 23/23） | §2/§3 的未覆盖面与观察边界（如「措辞族判定的固有边界」「shell 写盘不受角色约束」）已如实登记 |

### 1.1 `required-question-commit-confirm` 的特殊处理（ADR 明写的前置义务）

`docs/adr/ADR-commit-verification-gate.md` 的**关联 backlog 行**原文写着：该 change 的 AC5/AC6 以「权限层加 ask」为机制结论（**已勾未归档**）⇒ **该 ADR 反转该档位** ⇒ **该 change 待归档时须按本文改写**。

⇒ 归档前已改写（2026-11-19）：
- **AC5**：保留原文引用 + 追加「**当时机制 = 权限层 ask**，现行机制以该 ADR 为准（审批点 = 工具层验证门 `plugins/commit-gate.ts`，权限层 `git commit` 改 `allow` 仅作显式声明）」；
- **AC6 ③**：从「✅ 已修（权限层加 ask + 层 1 判据钉住）」改为「**✅ 已修，但修复方式已被该 ADR 反转** ⇒ 机制结论以该 ADR 为准」；
- **AC6 ⑨**（ask 时代机制观察）追加同口径的**历史事实**声明；
- 勾选镜像行 sync（原写「如实 skip + 注明已知缺陷」，与表格行的「✅ 3/3 真绿」及 `tasks.md` 的「移除 skip ⇒ 3/3 真绿」自相矛盾 ⇒ 已改为「已实现且 3/3 真绿（skip 已移除）」）；
- ADR 的关联 backlog 行同步为**归档指针 + 「已按本文改写」的记录**。

⇒ 记录口径：**不是「该 change 原本就错」，而是「该 change 的机制结论被后续 ADR 反转 ⇒ 归档时按 ADR 改写，历史事实保留」**。

## 2. 不归档的 5 个 + 建议

| change | 状态 | **不归档的真实理由** | 建议（下一步） |
|---|---|---|---|
| `oracle-intent-gate-e2e` | tasks 28/28，AC **未勾** | **不是「探针没跑」**（该理由曾被我误用）：观察报告 §8.4 与 `tasks.md` 状态头显示「**AC1 探针 ✅ 载体 A**」（换 provider 绕过额度上限后复跑）⇒ 真实缺口是 ① **报告内部矛盾**：§1「主证据载体 pending / 未判定（额度耗尽）」是**过期段**，与 §8.4 冲突；② **AC8 的「固定 9 列」记录表是空的**；③ AC5（E-B 两态差分）结论**已降级为「不可分辨」**（态② 产物含意图线索 ⇒ 前提未真正成立）；④ AC7-② 需 hermetic HOME、AC5b 采样 N=1 | **先做一次 verifier 勾稽轮**：把 §1 的过期段标注为已被 §8.4 取代、填 9 列表、把 AC5 的「已降级」如实写成 AC（改成「两态**不可分辨**已登记，follow-up 另立」）、再逐条勾选。**不要**重跑探针（额度是持续态故障，重跑无收益）；**不要**拿 §8.4 当「已通过」直接归档（那会给「补勾 = 通过」开坏先例） |
| `required-question-hard-pause-probe` | tasks **7/10**，proposal 的 AC1–AC5 **已全勾** | **不是「没做完」**：缺的是 ① **Task 2 两格的条件跳步未记录**（design D3 本可「读证豁免」，证据散在 `tests/config-guards.test.ts:1332-1336` 与 `oracle-intent-gate-e2e-observation.md` §9，**本 change 无专属观察报告** —— 而 AC1 的证据载体写的是「观察报告」）；② **R1（治理面审查触发器）从未被评估**（design.md 无 prompt 措辞 ⇒ 条件可能未触发，但没人勾掉）；③ **无 review 记录** | **不归档**（归档会静默吞掉「跳步是有意的」与「R1 未评估」两条信息）。闭合路径：R1 评估并勾选（条件未触发 ⇒ 注明）、Task 2 标「D3 读证豁免」并补证据指针、或补一份本 change 的观察报告 ⇒ 再归档。⚠ 它是「**探路 change**」（产出 = 勘察结论 + 设计草案，实施留给后续 change）⇒ **另需用户裁决口径**：这种 change 是否允许「以勘察结论为终点」归档 |
| `subagent-contract-critic-enforce` | tasks **9/22** | **时间闸门未到**：`tasks.md` 明写「**最早可复评日：2026-11-21**（`t0 = 2026-11-14` + 7 天）」⇒ 今天 2026-11-19 ⇒ 差 2 天 | **等 2026-11-21 后**再跑 R1–R8（复算四元组 / 判 N 门槛 / 豁免侧抽样 / mode 快照 / 不变量 / 趋势 / 回归 / 结论二选一）。⚠ **须先解决一处记录矛盾**：`CHANGELOG.md:72` 与 `required-question-fallback-review.md:123` 写「门控 N 112→326、≥150 已到」，而权威观察报告 `subagent-contract-critic-enforce-observation.md:89-100` 与 `tasks.md:21-23` 写「**N = 112 未涨**」⇒ **326 系错误记录**；复评以**全量重算**为准（本就有该命令），流程无害，但须防「N 门已到」的误读 |
| `config-guards-ac10-timeout-flake` | 新立项（No tasks） | 未实施 | **先实施**（止疼：AC10④ 的假红）。顺序：helper → 显式超时 → fixture 三态 → 命令形态核对 → 5 条突变 → 回归 → oracle → critic → 独立验收 |
| `real-repo-git-budget-guard` | 新立项（No tasks） | 未实施 | **随后实施**（结构）：元守卫 + 唯一入口 helper + 交接（回写 `config-guards-ac10-timeout-flake` 的 D2/AC3/AC5 + 留痕） |

## 3. 同步与不动的地方

| 项 | 处置 | 理由 |
|---|---|---|
| `docs/adr/ADR-commit-verification-gate.md` 的关联 backlog 行 | **已改**（→ 归档指针 + 「已按本文改写」） | 该行是**归档前置义务**的载体；ADR 行属治理面 ⇒ 本批已走 oracle（治理面） |
| `docs/adr/ADR-role-aware-permissions.md` 的 Parent 行提到 `no-self-adjudication` | **不动** | 那是**裸 change 名**（无路径）⇒ 归档后仍可解析；改它属治理面表格行变动，无必要 |
| `docs/CHANGELOG.md` 的历史条目（`:308` / `:356` / `:415` / `:440` 等提到 change 路径） | **不动** | 该文件自述只记历史增量；仓内 20 个既有归档目录**无回改先例**；归档路径由 `archive/YYYY-MM-DD-<name>` 约定钉死 ⇒ 可机推 |
| `docs/review-automation-backlog.md` 提到 `oracle-intent-gate-e2e` | **不动** | 该 change 不归档 ⇒ 路径仍有效 |
| `.rddf/improvements/delegate-base-resolved-return.md` 的指针 | **已改**（→ 归档路径） | 它是**活文档**（只剩一个关闭动作），不在「历史记述不回改」的豁免范围 |
| `.rddf/reviews/**` 的历史记述 | **不回改**；本批**已各追加一行归档指针**（7 份：`required-question-fallback-review` / `no-self-adjudication-review` / `verifier-baseline-worktree-diff-review` + `-revert-map` / `delegate-base-channel-review` + `-revert-map` / `independent-build-session-e2e-observation`） | 既有惯例 |
| `openspec/changes/independent-build-session-e2e/tasks.md:102-103` 的活路径互引（指向同批归档的 `no-self-adjudication/` 与 `required-question-fallback/`） | **不改** | 该文件随目录**整体入 archive** ⇒ 属历史记述；且它描述的是「发现两处同链缺口 ⇒ 另立 change」的历史事实 |

## 4. 回归（归档前后各一次）

| 阶段 | 结果 |
|---|---|
| 归档前（校准后） | `bun test tests/` ⇒ **914 pass / 0 fail**；`check-upstream-anchors.sh` ⇒ **23/23** |
| **归档后**（同一 commit 内，与移动原子落地） | `bun test tests/` ⇒ **914 pass / 0 fail**；`check-upstream-anchors.sh` ⇒ **23/23** |
| 归档面 | 新增 6 个目录：`archive/2026-11-19-{required-question-commit-confirm,required-question-fallback,no-self-adjudication,verifier-baseline-worktree-diff,delegate-base-channel,independent-build-session-e2e}/` |
| `openspec list` 剩余活跃 change | **5 个**：`config-guards-ac10-timeout-flake`（新）、`real-repo-git-budget-guard`（新）、`oracle-intent-gate-e2e`（待勾稽）、`required-question-hard-pause-probe`（7/10）、`subagent-contract-critic-enforce`（9/22） |

⚠ **原子性要求**（oracle 强制条件 1）：ADR 行改写（该行已写「已归档 ⇒ `openspec/changes/archive/2026-11-19-required-question-commit-confirm/`」）与 6 个 change 的移动**必须同一 commit 落地** ⇒ 否则 git 历史出现**悬空指针**窗口。
