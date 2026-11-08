# 审稿报告：ADR-delegate-delivery-evidence

- 日期：2026-11-09
- 审稿对象：`docs/adr/ADR-delegate-delivery-evidence.md`（Status=Proposed）
- 档位：`arch`
- 结论：**APPROVE_WITH_CONDITIONS**（0 BLOCKER；5 条 SHOULD_FIX + 4 条 NITS 全部处置；无复审需求）

## 1. 审查序列与预算

| 序 | 审查者 | 轮次 | 结论 | 处置 |
|---|---|---|---|---|
| 1 | oracle | 1 | `PASS-WITH-NOTES`（0 BLOCKER，4 SHOULD_FIX + 2 NITS） | 全部修 |
| 2 | critic（arch） | 1 | `APPROVE_WITH_CONDITIONS`（0 BLOCKER，2 SHOULD_FIX + 4 NITS） | 全部修 |

预算：oracle 1 + critic 1（上限 critic 2）。未超。

## 2. oracle 的处置

| finding | 处置 |
|---|---|
| D1/后果的转述措辞"没有产出"对"产物在 git 视野外"是过度断言 | 全文改为"**没有可验证的交付证据**"，并要求报出证据字段 |
| 迁移面只写"所有消费方都要更新"过于松散 | 新增 **D3.1 迁移清单**（同 patch 原子完成）+ 2 条 Verification |
| Parent 缺精确取代条款，后来人会以为旧枚举仍完备 | Parent 写明"部分取代旧 D2 的 outcome 枚举"，并列目标枚举与该篇保留条款 |
| 与 Accepted 篇的 ledger schema 耦合未声明 | Parent 收窄为"决策面正交、ledger schema 单点耦合"；并在 Accepted 篇加"增补记录 2" |
| NITS：D2 措辞模糊 / `unknown` 优先级未写 | `succeeded` 行改为"不满足 D2 全部判定条件"；写明"无新活动时 `unknown` 优先于 `unverified`" |
| NITS：未把已知误报形态文档化 | 风险章 + Verification 增补"shell 写 git 可见之外 + 开场白收尾 → 判 unverified（有意边界）" |

## 3. critic 的处置

| finding | 处置 |
|---|---|
| 迁移清单漏 `docs/dual-session-delegation.md`（该文有完整 outcome 枚举表） | 已补为第 5 项（清单扩到 **8 项**） |
| 第 1 项只写 summary 构造，但 ledger append 是另一个写入点 | 已改为"实现（**两个写入点**）"，明确 summary **+** ledger 都要改 `host_outcome` |
| NITS：Parent 用"现枚举"把未落地值写成现状 | 改为"**目标枚举**" |
| NITS：未说明 `busy` 是历史漂移 | Parent 已注明"`busy` 是此前实现先行漂移进来的，旧 D2 枚举早已 stale，本次一并校正" |
| NITS：Accepted 篇 Status 行混入审稿溯源信息 | 记录，不阻断（单行尚短） |
| NITS：`front-delegate-usage.md` 的"6 种 outcome"计数 | 已并入迁移清单第 3 项（落地时核对） |

## 4. 关联 change

未立项，登记为 `backlog: delegate-delivery-evidence`。立项后由 planner 回填 AC 编号，architect 回填 AC 映射（Verification 8 条为候选）。

## 5. 落地前提（转 builder）

- D3.1 的 **8 项必须同 patch 完成**；落地后用 `git show --stat` 逐项核对。
- 落地后把本篇 Status 推进（Proposed → Accepted）并把 `host_outcome` 的真实回放加进回归夹具。
- 已知误报形态不修（有意边界），但必须在文档里保留判例。
