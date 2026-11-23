# 审稿记录 — ADR-governance-paths-ownership（治理面路径清单的归属）

> **对象**：`docs/adr/ADR-governance-paths-ownership.md`（新 ADR）+ `docs/adr/ADR-role-aware-permissions.md`（Accepted ADR 的 3 处正文 + 修订行）+ `docs/MULTI-AGENT-DESIGN.md`（2 处登记面）+ `prompts/build.md`（治理面作用域表 1 行）
> **触发**：`.rddf/reviews/build-model-route-switch-ab.md` §6.1 / §6.2 / §6.3 / §6.8 + §6.7 的只读调查结论落地
> **角色**：architect（主会话；用户口令授权做 §6.3 裁定）
> **日期**：2026-11-23
> **预算**：oracle 2 轮（1 轮方案咨询 + 1 轮治理面审查）+ critic 1 轮 ⇒ 均在额度内；无 BLOCKER，无复审

## 0. 结论

| 审查者 | 判定行原文 | 结果 |
|---|---|---|
| oracle（咨询轮，方案取舍） | `治理面判定: PASS-WITH-NOTES` | 采纳 B1 方向 + 4 处必要修正 |
| oracle（治理面审查轮，本批材料） | `治理面判定： PASS-WITH-NOTES` | 5 条 finding 全部处置（见 §2） |
| critic（本批 patch） | `APPROVE_WITH_CONDITIONS` / `mergeable: yes` / `scope_exceeded: false` / **无 BLOCKER** | 1 条 SHOULD_FIX 已修（见 §3） |

⇒ ADR `Status = Proposed`（待用户签批；签批后转 Accepted）。

## 1. oracle 咨询轮（方案取舍）要点

**根因**：治理面清单是「政策数据」，却被存放在「机制代码」文件里，而机制代码的写权不在政策所有者手中。

**采纳**：B1（清单迁到 `.rddf/config/governance-paths.json`，与 `arch-docs.json` 同形）+ C 的「数据/机制分离」纪律，并加 4 处修正：
1. architect allow **精确枚举** `.rddf/config/governance-paths.json`，**不得**用 `.rddf/config/**` 通配（`.rddf/config/workspace.json` 是跨仓校验配置面）；
2. 清单**自我纳入** + 登记进 `prompts/build.md` 治理面作用域表（否则既不留痕也不进必审通道）；
3. **读根 = 治理根**（不得按 `repoRoot` 读，否则项目仓同名文件劫持判定）；
4. 兜底 = **回退内置默认清单**，禁止「全拒」（全拒 ⇒ 修复通道死锁）。

**否决**：A（architect 写集加 `lib/role-policy.ts`）—— 可改判定逻辑本身 ⇒ 违反「机制代码不得被被门控角色自改」；B2（清单留代码 + builder 代改）降级为**过渡模式**；C 作为独立第四方案被吸收进 B1。

## 2. oracle 治理面审查轮：5 条 finding 的逐条处置

| # | finding | 处置 |
|---|---|---|
| N-A | §6.7 同批订正清单**漏了 AC23 强制登记面**：`docs/MULTI-AGENT-DESIGN.md:505`（§2.8.7 D5⑥）、`:1052`（文件树注释）、`tests/role-exemptions.test.ts:15`（测试注释） | ✅ **本批已改前两处**（均在 edit #5 锚点耦合面之外 ⇒ architect 可独立改，且未破坏任何清单锚点 —— 已用 `planDrill` 验证：`problems: []`）；第三处（`tests/role-exemptions.test.ts`）属 **builder 写集** ⇒ 进 builder 同批清单（ADR D5 + `build-model-route-switch-ab.md` §6.7） |
| N-B | 新 ADR 破六段骨架（多出第七段「§4.3 实现清单」） | ✅ 已删第七段，内容并入**决策段 D5**；两处 `§4.3` 引用改写；现结构 = 元数据 → 背景与问题 → 决策(D1–D5) → 选项对比表 → 后果/代价 → Verification（112 行 ≤ 250） |
| N-C | D2.4 兜底要加「解析后清单 ⊉ 核心集 ⇒ 视为损坏」；R1 要点名 `builder`/`general` 同权；V1/V3 随动 | ✅ D2.4 已加该触发条件；R1 已改写为「能改清单的角色不止 architect（现状 builder/general 亦 `governance:true`）⇒ 残余风险同构」；V1 增加「缺核心集条目」、V3 拆成「运行期回退默认 + 守卫红」 |
| N-D | 本批三处 ADR 改动形式上超出「只改同一条 bullet」的豁免 ⇒ 应走 oracle→critic | ✅ 已走（本记录 §3） |
| N-E | §6.1 表格行与实现逐形核对 | ✅ 核对通过（`globToRegExp` 确认 `.bak-*` / `.backup-*` 被 `opencode.json.*` / `opencode.jsonc.*` 覆盖）；N-E 的残余小缝（编辑器临时文件如 `.opencode.json.swp` 不在 glob 锚定内）**不修**，理由：编辑器临时文件不是 opencode 读取的配置面，纳入治理面不产生实际收益；登记为已知边界 |

## 3. critic 轮：finding 的逐条处置

**结论**：`APPROVE_WITH_CONDITIONS` / `mergeable: yes` / `scope_exceeded: false` / **无 BLOCKER**。

critic 的三项 focus 结论：① 本批对 Accepted ADR 的改动**确为事实性修订**（D1–D6 结论、选项对比表、后果/代价、Verification 章、Status 行均未动；D2 口径句 / D5⑥ 事实订正 / D5 留痕补充段三处均对应已落地事实）；② 新 ADR 与既有契约**不冲突**，且其「两句不变量同时成立」的声称**有边界**（R1 已诚实声明三层兜底「无一是密码学阻止」）；③ **「本批故意不改 MAD §5.4 与 usage 手册」的取舍成立**（usage 手册已有 2026-11-22 警示旗标；MAD §5.4 与回滚清单 edit #5 锚点耦合，纳入本批会把 architect 面修订拖进 builder 面锚点同步 + 回滚演练）。

| # | finding | 处置 |
|---|---|---|
| SHOULD_FIX | 「核心集」全文**未定义成员**，而 D2.4 兜底、守卫断言、R1、V1、V3 五个判据都压在它上面 ⇒ 实施方与验收方会各自发明定义，V1/V3 不可机判 | ✅ **已修**：D2.4 内新增**核心集成员表**（8 条：`prompts` / `commands` / `scripts` / `AGENTS.md` / `opencode.json(c)` 及变体备份 / 三份 `docs/` 汇总索引 / `tests/config-guards.test.ts` / 清单自身），并显式声明**机制面文件不进核心集**（进了就等于方案 A ⇒ 与 D1 冲突）。V1/V3 措辞随动 |
| NIT-1 | `ADR-role-aware-permissions` 修订行持续累积版本史（元数据头膨胀） | **不修**：既有体例如此（前序轮次同样追加），本轮不借机重构元数据头；该 SHOULD_FIX 已在历史轮次登记 |
| NIT-2 | D2.2 括号内把「进 ledger 留痕」（取决于生效清单）与「进 oracle→critic 必审通道」（取决于 `prompts/build.md` 表格行 = V8）两个机制并列，触发条件不同 | ✅ **已修**：D2.2 改为分别点明两个触发条件（留痕 ⇐ 生效清单含自身；必审 ⇐ 作用域表登记 = V8） |

## 4. 遗留（builder 侧，本批**未**落地）

1. **回滚机制登记表登记**（`bun test tests/` 当前 1 fail 的唯一来源）：新 ADR 需在 `.rddf/rollback/registry.json` 有条目（`M1`：ADR 全集 == registry 覆盖集）。建议条目：
   ```json
   { "mechanism": "governance-paths-config",
     "adr_primary": "docs/adr/ADR-governance-paths-ownership.md",
     "state": "exempt", "exempt_class": "not-implemented",
     "exempt_evidence": ".rddf/reviews/governance-paths-ownership-review.md",
     "watch": [".rddf/config/governance-paths.json"],
     "notes": "机制（治理面清单配置化）尚未落地（ADR 2026-11-23 裁定，实现清单见该 ADR D5）⇒ 无可回滚面；B1 落地后须转 active + 配清单（M4 会在 watch 路径出现时强制）" }
   ```
   ⇒ `.rddf/rollback/**` 属 builder 写集 ⇒ **本批 architect 无法提交**（门禁红）。
2. **§6.7 同批订正的 builder 侧**：MAD §5.4「生效时机」行 + `docs/model-fallback-usage.md`「改完必须重启」段 + `tests/role-exemptions.test.ts:15` 登记注释 + 回滚清单 `model-fallback.json` **edit #5 锚点**同步 + registry `model-fallback → proving` + 演练 + `last_drill` 回填。
3. **§6.2 的 lib 侧**：`lib/role-policy.ts` 头部 docstring 的路径口径同步（`lib/**` 属 builder 写集）。
4. **B1 实现**（本 ADR 的机制面，ADR D5 清单）：`lib/role-policy.ts` 改造 + `tests/config-guards.test.ts` 守卫族（V1–V7）+ `.rddf/config/governance-paths.json` 初值（architect 面）+ `prompts/build.md` 作用域表加一行（V8，architect 面）。**建议单独走一个 openspec change**（跨 `lib/` + 守卫 + 配置三面，且改动 `tests/config-guards.test.ts` ⇒ 治理面必审）。
