---
状态: 已批准·待实施
优先级: P1
revision_count: 0
last_feedback_id: null
last_feedback_at: null
feedback_status: none
---

# unmanifested-commit-gate-trace —— 未声明仓的 commit 留痕（检测 ≠ 拦截）

> **决策依据**：`docs/adr/ADR-commit-verification-gate.md` **D3**（未声明 ⇒ 不设门禁，**明文决策不改**）
> + **D9②** 的「事实性补登」先例（检测 ≠ 拦截）。**本 change 不新增决策**，只让「门禁没生效」这件事**可见**。
> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）—— builder 代 planner 起草
> （用户 2026-11-28 指定）。**metis**：与已归档的 U7a（rdd-workflow 半边）同源，判据已由 U7a 的 metis 轮覆盖
> （2026-11-27，9 份批量）；本稿只是**另一半**（治理仓），不新增判据维度 ⇒ 不另起轮。
> **归属**：机制面（`plugins/commit-gate.ts` + `tests/**`）⇒ builder；治理面（ADR D9 表 + 主题文档）⇒ **architect**。

## Why

ADR **D3** 明文：仓库没有 `.rddf/commit-gate.json` ⇒ 三判据**不设门禁**（不是 bug）。
⇒ 但「门禁根本没跑」对 agent **不可见**：commit 照样过，**没有任何痕迹**说明验证命令一条都没执行。
实测（CppTLM，2026-11-26）：两处使用方仓都无声明 ⇒ 门禁长期静默缺席，而 agent 会**误以为**验证过了。

U7a 已给使用方仓**生成入口**与 doctor 三面检测；本 change 补**最后一环**：**commit 发生时**留痕
（检测 ≠ 拦截）—— 让「这个仓没有门禁」在**运行轨迹**里查得到。

## What Changes

| # | 变更 | 落点 |
|---|---|---|
| A1 | `readDeclaration` 返回 `decl === null`（**未声明**）⇒ 向 `.rddf/state/commit-gate-notices.jsonl` 追加一行 `未声明 ⇒ 三判据不设门禁（ADR D3）`，**随后照常放行**（不改判定） | `plugins/commit-gate.ts` |
| A2 | 留痕是**尽力而为**：无 `.rddf/state/` 目录 / 写入失败 ⇒ **静默跳过**，**绝不**影响判定（不得因留痕失败而拒提交） | 同上 |
| A3 | 声明**存在但解析失败** ⇒ 同样留痕，**但照旧拒**（**D6 fail-closed 不变**：坏的声明 ≠ 未声明） | 同上 |
| B1 | **D9⑱** 登记：「未声明仓的留痕是尽力而为（无 `.rddf/state/` / 写失败 ⇒ 无痕）」——**ADR 表（真源）+ 三处载体**同批（测试注释 / 主题文档 §2.8.8 / 本 change proposal 的 AC 面） | ADR（治理面）+ MAD（治理面）+ `tests/commit-gate-d9-registration.test.ts` + 本 proposal |
| B2 | D9 计数的「十七项 → 十八项」随 B1 同批（守卫的期望集从 ADR 表派生 ⇒ 加 ⑱ 行即生效；**多标题兼容**已由 U8 落地） | 同上 |

## Acceptance

- [ ] **AC1（红→绿）** `tests/commit-gate-undeclared-trace.test.ts`（新）：**未声明**仓 ⇒ commit **放行** + 账本里出现
      `未声明` 行（`file = .rddf/state/commit-gate-notices.jsonl`）⇒ 修复前红（无该行）；
- [ ] **AC2（红→绿）** 同文件：声明**存在但解析失败** ⇒ 账本出现 `声明不可用` 行，且 **commit 照旧被拒**（D6 不变）；
- [ ] **AC3（红→绿 · 尽力而为）** 同文件：**写不进**账本（父路径不可写 / 目标是目录）⇒ commit **仍放行** + **不抛错**；
- [ ] **AC4（零回归）** **已声明且合法**的仓 ⇒ 账本**不新增** `未声明` 行（留痕不误报），既有 commit-gate 用例全绿；
- [ ] **AC5（D9⑱ 登记）** `tests/commit-gate-d9-registration.test.ts`：**⑱** 四面齐备（ADR 表 + 测试注释 + MAD §2.8.8 + 本 proposal 的 AC 面）⇒ 绿；缺一面 ⇒ 红；计数 **18**；
- [ ] **AC6（变异）** 把留痕短路为 no-op ⇒ AC1 必须红；把「写不进」做成抛错 ⇒ AC3 必须红；
- [ ] **AC7（门 + 回滚面）** `bun test tests/` 全绿；回滚清单同批更新（新测试入 `delete`、ADR/MAD 小锚点入 `edits`）⇒ 演练 PASS 后回填 `last_drill`。

## Capabilities

- MUST: 未声明（或声明不可用）的仓在 commit 时**留痕**，且**照常放行**（不改 D3）。
- MUST: 留痕**尽力而为** —— 写不进 ⇒ 静默，**不得**影响判定。
- MUST: 已声明且合法的仓**不产生**该留痕（不误报）。
- MUST: 新面按 **D9⑱** 四载体登记（ADR 表（真源）+ 三处载体）。
- MUST NOT: 拦截未声明仓的 commit（D3 是明文决策）；MUST NOT 因留痕失败而拒提交。

## Impact

| 面 | 影响 |
|---|---|
| `plugins/commit-gate.ts` | 未声明 / 声明不可用 ⇒ 账本一行（尽力而为） |
| `tests/commit-gate-undeclared-trace.test.ts`（新） | AC1–AC3 |
| `tests/commit-gate-d9-registration.test.ts` | 计数 17 → 18 + JSDoc ⑱ 行 |
| `docs/adr/ADR-commit-verification-gate.md`（治理面） | D9 表 ⑱ 行 + 措辞（十七项 → 十八项） |
| `docs/MULTI-AGENT-DESIGN.md`（治理面） | §2.8.8 ⑱ 行 |
| `.rddf/rollback/commit-gate.json` + `registry.json` | 清单同批 + proving → 演练 → active |
