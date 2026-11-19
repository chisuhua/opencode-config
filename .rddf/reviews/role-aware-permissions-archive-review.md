# role-aware-permissions 归档批 —— 审查记录（oracle 治理面 + critic）

> 批次：**归档 `role-aware-permissions` + 同步指针**（无代码改动）。
> 触发：用户指令「归档后 `role-aware-permissions` 即可安全归档（顺序约束已解除）」。
> 前置依赖：change `role-exemptions-guard-archive-resilience`（AC23 守卫的归档韧性）已实施 / 已验收（第 2 轮）/ 已归档 ⇒ 顺序约束解除。
> 预算：oracle **1 轮** + critic **1 轮**（治理面：ADR 元数据表格行被改 ⇒ 必审）。

## 1. 本批改动

| 文件 | 改动 |
|---|---|
| `docs/adr/ADR-role-aware-permissions.md:12` | 关联 change 行 → **已实施 + 已验收 + 已归档**（2026-11-19）+ archive 路径 + 验收报告指针（24/24 PASS） |
| `docs/adr/ADR-role-session-identity.md:11` | 同形态 |
| `docs/adr/ADR-commit-verification-gate.md:309` | V10 历史闭合注记里的旧活跃路径补归档括注 |
| `openspec/changes/role-aware-permissions/**` ⇒ `openspec/changes/archive/2026-11-19-role-aware-permissions/**` | 归档（4 件齐全；`openspec archive` 报 `Task status: ✓ Complete`） |
| `.rddf/reviews/role-aware-permissions-verify.md` / `-mutations.md` | 各追加 1 行归档指针（历史记述不回改） |

## 2. oracle（治理面，`治理面判定: PASS`）

核验结论：归档实体完整；两篇 ADR 改法与先例（`ADR-commit-verification-gate.md:11` 等 4 篇）逐字同构；**Status 行不改是正确的**（Status 承载决策签批态，与 change 生命周期是两个域；改 Status 会被读成「ADR 被撤销」）；Verification 章 V1–V14 的判据载体仍有效（AC23 的 AC 面由 `resolveAcFace` 解析，守卫明确不断言 active 形态 ⇒ 归档不红）；全仓旧路径引用已清点。

oracle 的三条建议与处置：

| # | 建议 | 处置 |
|---|---|---|
| 中（可选） | 「已归档」未显式携带「已验收」事实，读者要自己拼事实链 | ✅ **采纳**：改为「**已实施 + 已验收 + 已归档**」并挂验收报告指针（先例 `ADR-front-cancel-release.md:9` 同款措辞） |
| 低（可选） | 括注里保留「原活跃路径」是行内最后一个反引号路径，下游按粗糙正则会取到已不存在的路径 | ✅ **采纳**：去掉冗余原路径（立项日期 2026-11-17 单列保留，时序信息不丢） |
| 低（可选） | `ADR-commit-verification-gate.md:309` 的旧活跃路径 | ✅ **本批一并修**（oracle 建议登记为后续清扫；本批判断：**该路径变陈旧是本次归档动作的直接后果** ⇒ 属本批责任，且修法与 oracle 建议一致：加括注） |

oracle 另注：意图陈述写「三份 review 记录加指针」，实际只有 2 份 —— `role-aware-permissions-consultation.md` **全文无 change 路径引用** ⇒ 无指针可追（**表述偏差，不改文件**）。

## 3. critic（`APPROVE`，`mergeable: yes`，`scope_exceeded: false`）

| 级别 | finding | 处置 |
|---|---|---|
| **BLOCKER** | 无 | — |
| **SHOULD_FIX** | 无 | — |
| **NIT** | oracle 采纳「去掉冗余原路径」的理由写的是「行内最后一个反引号路径」，但新行最后一个反引号串实为**验收报告**路径、不是归档路径 ⇒ rationale 与结果不符 | 不改（**仅记录**：已确认无守卫解析该行，无实际后果） |

critic 对 focus 三点的判定：

1. **元数据行改法**与先例 `ADR-front-cancel-release.md:9` 逐字同构且信息更全；「已归档」修饰的是 change（行首即「关联 change」），Status 行独立承载 ADR 状态且未动 ⇒ 不存在「读成 ADR 被撤销」的风险。
2. **`:309` 括注不算越界**：该行的活跃路径是本批归档动作**直接制造**的悬空引用，留在活跃 ADR 的 Verification 章里恰是要消除的问题；括注为句中插入、不动判据文本（V10 的机械载体按上下文声明从 D9 表派生，不认该行正文）。
3. **悬空引用**：全仓 22 处 grep 命中全部可归因（`tests/role-identity.test.ts:4` 注释 = change Out of Scope ⑤ 已登记「不做」；`.rddf/improvements/**` 回溯性 hazard 记述；`.rddf/reviews/**` 历史记述，本批已补指针；两份已归档 change 的 proposal；`:309` 本批已修）⇒ **无活跃守卫 / 脚本 / 活跃文档依赖已不存在的活跃路径**。

## 4. 实测（归档后）

| 检查 | 结果 |
|---|---|
| `bun test tests/role-exemptions.test.ts` | **20 pass / 0 fail**（AC 面候选 = 1 个，形态 = `archived`） |
| `bun test tests/` | **914 pass / 0 fail**（连跑 3 次全绿；其间 1 次出现既有用例 `tests/config-guards.test.ts` 的 `AC10④` 偶发超时失败，已登记另案，与本批无关） |
| `bash scripts/check-upstream-anchors.sh` | **23/23** |
| 归档目录完整性 | `proposal.md` / `design.md` / `tasks.md` / `.openspec.yaml` **4/4** |

## 5. 登记为不做 / backlog

| # | 项 | 理由 |
|---|---|---|
| ① | 改 `tests/role-identity.test.ts:4` 的注释引用（仍写活跃路径） | change 的 Out of Scope ⑤ 已登记「不做」：只是注释、非判据、无机械收益 |
| ② | `tests/config-guards.test.ts` 的 `AC10④` 性能抖动 | 既有问题（串跑 3 次 git 子进程，全量负载下 5024–5097ms 越过 bun 默认 5000ms 超时；单跑 ~1.1s 通过）⇒ 另案 |
| ③ | oracle 建议「意向陈述写三份 review 记录、实际两份」的表述偏差 | 事实记录偏差，不改文件；已在 §2 记明 |
