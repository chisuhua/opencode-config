---
状态: 未立项
优先级: P2
---
# cross-repo-check-trigger-in-agent-checklist — 把「改了就跑」写进 agent 自查清单

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：`cross-repo-workspace-check` 的残留 ①（「**漏跑**」未解 —— 脚本只在被调用时生效）
> 关联：`openspec/changes/archive/2026-11-16-cross-repo-workspace-check/`（已实施；验收报告 `.rddf/reviews/cross-repo-workspace-check-verify.md` 残留段 ①）
> 关联落点：`docs/guard-authoring.md` §7 核对单（已有一行指向脚本，但**只对主动改文档的人**可见 —— 改 `prompts/**` 或改产品仓代码的人看不到它）
> ⚠ **实施归属 architect**：落点是 `prompts/build.md` ⇒ 治理面 ⇒ oracle → critic 必审（planner 不写 `prompts/**`）

## Why

`scripts/cross-repo-check.sh` 落地后，跨仓清单的一致性**在被核对时**是判得准的（四档出口码 + 双仓 sha + 只读）。但它管不到一件更靠前的事：**没人调用它**。

| 失效模式 | 现在 | 归谁管 |
|---|---|---|
| 改了产品仓 `_lib/verifier/state_paths.py::SKILL_OWNS_PATHS`，忘了跑核对 | 本仓与产品仓的 `owns:` 清单静默漂移，直到下一次**有人碰巧**跑脚本 | **agent 的行为规则**（不是工具能管的） |
| 改了本仓 `lib/delegate-core.ts::verifierWriteSetBlock()` 的 `owns:`，忘了跑核对 | 同上 | 同上 |

守卫只能覆盖「被调用后的判据」，覆盖不了「没被调用」。真正的触发点是**改清单这件事本身**，而改清单的绝大多数发生在两处：`prompts/**`（本仓治理面）与产品仓代码 —— 这两处**都不读 `docs/guard-authoring.md` §7**（§7 只对主动翻文档的人可见）。所以唯一有效的落点是 agent 的自查清单：`prompts/build.md` 的「自查清单」段每回合都会过。

这是**治理面改动**（`prompts/**`）⇒ 按 `prompts/build.md` §审查配对 的治理面行，实施需 architect 写盘 + oracle → critic（判据是否触发条件本身 ⇒ 必审）。

## What Changes

1. **`prompts/build.md`「自查清单」加一行**（逐字固定，供守卫锚定）：
   > 改 `owns:` 清单（本仓 `lib/delegate-core.ts::verifierWriteSetBlock()` 或产品仓 `_lib/verifier/state_paths.py::SKILL_OWNS_PATHS`）⇒ 跑 `scripts/cross-repo-check.sh`，并把 `RESULT:` 行贴进验收报告

2. **补一句「跨仓改动」的验收口径**（同一节）：跨仓清单类改动的验收报告里必须出现该脚本的一次 `RESULT:` 输出；缺失 ⇒ 视为**未取证的跨仓改动**，按 `implementation_gap` 路由（不是「已验证」）。

3. **配套静态守卫**（`tests/config-guards.test.ts`）：锚定第 1 条那一行的**存在 + 逐字文本** ⇒ 删行 / 改写即红（变红演练：临时删掉该行 ⇒ 守卫红 ⇒ 恢复）。

4. **不改** `scripts/cross-repo-check.sh` 的任何行为；不改 `docs/guard-authoring.md`（§7 已指向脚本）。

## Acceptance

- [ ] `prompts/build.md` 自查清单含第 1 条那一行，且**逐字文本**与本 improvement 一致（守卫按逐字比对，不按语义）
- [ ] 守卫断言落在 `tests/config-guards.test.ts`；**变红演练**：临时删掉该行 ⇒ 该用例红、失败信息指向预期断言；恢复后复绿
- [ ] 跨仓改动的验收口径句在位（缺 `RESULT:` 输出 ⇒ 按 `implementation_gap` 路由）
- [ ] 治理面审查记录落 `.rddf/reviews/cross-repo-check-trigger-in-agent-checklist-prompt-review.md`（oracle → critic，结论含 BLOCKER 闭合情况）
- [ ] 审查结论回写 `docs/CHANGELOG.md`（新版本条目）
- [ ] `bun test tests/` 全绿；既有守卫零回归

## Capabilities

- 跨仓清单漂移从「靠人记得跑」变成「**改了清单就必须跑**」的规则约束 —— 由逐字守卫兜住「规则被删/被改写」。
- 跨仓改动的验收证据链完整：改了什么清单、在哪个 commit 上、核对结果是 `OK` 还是 `DRIFT`，三者可比对。
- 与既有的「守卫作者核对单」呼应：`docs/guard-authoring.md` §7 已有一行指向脚本，本项补的是**触发侧**（谁在什么时候必须跑），不是重复。

## Impact

- 改动面：`prompts/build.md`（1 行 + 1 句）、`tests/config-guards.test.ts`（1 个用例）、`.rddf/reviews/<name>-prompt-review.md`（新增）、`docs/CHANGELOG.md`（1 条）。
- **治理面 ⇒ 审查必审**：`prompts/**` 属治理面作用域表（影响所有 agent 的上下文）；改「自查清单项」本身即触发条件 ⇒ **oracle → critic 必审**（不是只改叙述性文字的豁免路径）。守卫断言的增改同样在治理面表内 ⇒ 同规格审查。
- 兼容性：`prompts/build.md` 每回合注入上下文，多一行 ⇒ token 成本可忽略（单行）。
- 风险 ①：规则写在 prompt 里 ⇒ 靠**自觉**执行，不是机制强制 —— 真正的强制是「验收报告缺 `RESULT:` 输出 ⇒ 判 `implementation_gap`」，这条是**可机械判定**的（verifier 侧），两段合起来才闭合。
- 风险 ②：只覆盖 `owns:` 这一处跨仓事实；将来新增核对项，`scripts/cross-repo-check.sh` 的清单会变（核对项声明在 `.rddf/config/workspace.json`）⇒ 本行的「改 `owns:` 清单」措辞需随清单项增加而扩展，否则新核对项漏跑。**扩展规则本身由 `cross-repo-workspace-check` 的 design D2 约定**（清单声明式），本项不重复定义。
- 依赖：`cross-repo-workspace-check` 已实施并归档（脚本可用、清单存在）—— 本项是它的**触发侧补丁**，不是前置。
