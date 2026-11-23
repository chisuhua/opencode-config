# improvement: adr-front-knowledge-librarian-whitelist-annotation

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。
> ⚠ **本文件由 builder 按内置流程代写**（`rdd-planner` skill 的 canonical precondition 未满足：无 `.rddf/state/.arch-handoff.json`）⇒ **登记稿**，未经 planner / metis 流程；立项时须补齐 5 段审查与 AC 编号。
> **来源**：`librarian-delegate-contradiction` 的 critic 第 1 轮 **NITS-1**（「登记有沉底风险 —— 归档前请确认该 follow-up 在 backlog 有实体条目承接」）+ oracle O-1（最小必要动作 = architect 补一条 ADR 增补记录）。
> 关联 change：`openspec/changes/archive/2026-11-23-librarian-delegate-contradiction/`（**已实施**，2026-11-23；审查与验收记录：`.rddf/reviews/librarian-delegate-contradiction-review.md` / `.rddf/reviews/librarian-delegate-contradiction-verify.md`）。
> **归属**：ADR 行（`docs/adr/**` 按 `prompts/build.md` §治理面作用域表**不属**治理面）⇒ 落笔由 **architect** 承担。

## Why

`docs/adr/ADR-front-knowledge-capability.md` 有两处**机制措辞**在 2026-11-23 之后失真：

| 位置 | 现文 | 机器层真值（`opencode.jsonc.opencode-go`） |
|---|---|---|
| D2（`:69`） | 「深度 2 链由 D3 的 `librarian.subagent: deny` 封死。」 | `librarian.permission.subagent = { "*": "deny", "explore": "allow" }` |
| D3（`:139`） | 「同时：`librarian` 去掉 `subagent: allow`（封深度 2 链）。」 | 同上（**不是** `deny`，也**不是** `allow`） |

**失真的是记法，不是决策**：ADR 的规范性决策是「**封死深度 2 写链**」；该不变量在 A1 之后**依然成立**（`general` / `oracle` / `metis` / `critic` 全部回落首条 `"*": "deny"`；新放行的 `explore` 自身 `subagent: "deny"` + `edit: deny` ⇒ 终止于只读叶）。ADR 自有的验收判据（`:252`「librarian 尝试深度 2 委派（调用 general 等）被拒」）仍成立，且已由守卫 `tests/config-guards.test.ts` 的 **AC4b** 钉住。

**为什么要立项**（不是「措辞洁癖」）：ADR 的读者会**按字面**实施 —— 下一个人照 D3 写「librarian 去掉 `subagent: allow`」时，很可能顺手把 librarian 整条 `subagent` 能力删掉（因为 D3 的字面结论是「去掉」），**把本条刚修好的矛盾重新掰断**（`prompts/librarian.md:24` 的委派要求随即再次不可能）。⇒ 需要一处**可被指到**的增补记录，而不是只在 change 的散文里提一句。

## What Changes

1. **ADR 元数据表增一条「增补记录」**（沿用本篇已有的「增补记录 1–3」体例，**Status 行不动**）：
   - 记法：`librarian.permission.subagent` 于 2026-11-23 由字符串 `"deny"` 改为**默认拒绝字典** `{ "*": "deny", "explore": "allow" }`；
   - 不变量续持依据：默认拒绝一切非白名单目标（`explore` 自身 `subagent: "deny"` ⇒ 深度 2 写链仍断）；
   - 证据：守卫 AC4b / AC4c（`tests/config-guards.test.ts`）+ 验收报告 `.rddf/reviews/librarian-delegate-contradiction-verify.md`。
2. **D2 `:69` / D3 `:139` 两句**改为指向该增补记录的表述（**只改这一处机制措辞**，决策、选项、后果、Verification 章不动；`git diff --numstat` 应为小改动）。
3. **不改** D2 的决策内容、Status 行、Verification 章（`:252` 仍成立）。

## Acceptance

| 判据 | 类型 |
|---|---|
| ADR 元数据表存在一条 2026-11-23 的增补记录，写明 librarian 的 subagent 真值形态与不变量续持依据 | 结构 |
| D2 `:69` 与 D3 `:139` 的机制措辞不再声称 librarian 的 `subagent` 是字符串 `deny` / 已被整体去掉 | 结构 |
| ADR 的 **Status 行 / 决策条目 / 选项对比表 / 后果章 / Verification 章**零改动（`git diff --numstat` 可核） | 结构 |
| 守卫 `tests/config-guards.test.ts` 的 AC4b / AC4c 仍绿（`bun test tests/config-guards.test.ts`） | 回归 |
| `docs/CHANGELOG.md` 有一条对应条目 | 结构 |

## Capabilities

- **新增**：ADR 与机器层真值之间的一处**可指到**的增补记录（防「按字面实施 ⇒ 重新掰断」）。
- **不新增**：任何决策、权限、工具、agent。
- **不改**：ADR 的 Status 与任何决策内容。

## Impact

| 面 | 影响 |
|---|---|
| `docs/adr/ADR-front-knowledge-capability.md` | 元数据增补记录 1 行 + D2/D3 各 1 句措辞 |
| `docs/CHANGELOG.md` | 1 条条目 |
| 行为 | **无运行时变化**（纯文档） |
| 审查 | ADR 行 ⇒ 按 `prompts/build.md` §审查配对 的 **ADR 行**规则（描述性措辞修订 ⇒ **只 oracle**）；若同时改守卫断言 ⇒ 升级为 **oracle → critic** |
| 归属 | **architect**（`docs/adr/**` 不属治理面，实施者不代改） |
