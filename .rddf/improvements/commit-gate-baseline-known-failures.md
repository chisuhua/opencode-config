---
状态: 已批准·待实施
优先级: P1
revision_count: 0
last_feedback_id: null
last_feedback_at: null
feedback_status: none
---

# commit-gate-baseline-known-failures —— 门禁声明支持 baseline / known_failures（有存量红的仓也能声明门禁）

> **决策依据**：`docs/adr/ADR-commit-verification-gate.md` 的 **Status Update 2026-11-27（D10）**
> （Status **Accepted**；oracle 1 轮 ⇒ BLOCK，6 条全采纳；critic 2 轮 ⇒ REJECT 2 BLOCKER ⇒ 复审
> **APPROVE_WITH_CONDITIONS**，0 BLOCKER）—— 判据真源 = **D10 段 + Verification V20–V25**
> （审稿报告 `.rdrf/reviews/commit-verification-gate-su-baseline-review.md`）。
> 本 improvement 只负责**实现**该已签批判据，**不新增决策**；判据正文不复述，只做 **AC 编号 ↔ V 编号映射**。
> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）—— **由 builder 代 planner 起草**
> （用户 2026-11-27 指定先起立项）⇒ **metis 1 轮（2026-11-27）审后已修订**（真实 finding 与逐条处置见 **§6**）。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在（`.rddf/state/.arch-handoff.json` /
> `.rddf/state/.planner-handoff.json` 均缺失）⇒ 走**内置流程**（`proposal.md` 由 planner 起草；
> `design.md` / `tasks.md` 归 builder）。
> **归属**：机制面（`lib/**` + `tests/**` + `scripts/**`）⇒ 归 **builder**；**治理面**（ADR 表 / 主题文档 /
> 命令 / prompt）⇒ 归 **architect** ⇒ 本 change 的 D9⑰ 登记段落由 architect 落笔。

## Why

D2① 是**硬门**：任一验证命令非 0 ⇒ **拒绝提交** ⇒ **有存量红的仓根本不能声明门禁** ⇒ 门禁在有历史债的
仓里只能**关着**；而「关着」对 agent **不可见** —— commit 照样过，没有任何痕迹说明「三判据一条都没跑」。

实测（CppTLM 仓，2026-11-26 → 2026-11-27）：`scripts/build/format.sh --check` 的存量红由 **5 个文件**
增至 **12 个文件**（单点观察，非速率）⇒ 「先把存量红修完」是**持续**成本，不是一次性 ⇒ 门禁在真实仓里
长期不可用。

用户裁决（2026-11-27）：**上 baseline / known_failures 机制**（OC-1c）。ADR 的 SU 已把该机制的**判据语义**
定死（D10 + V20–V25），本 change 把它**落地为可机械校验的实现**。

**为什么不能用更便宜的办法**：oracle 建议 11 要求的两个替代已被 SU 否决并留下实测依据 ——

- **只声明「绿的命令」**（存量红就先不管）⇒ 门禁形同虚设，且**不可见**（D10④ / 选项表 K）；
- **`verify_commands` 只跑暂存文件**（占位符）⇒ 「变更集绿 ≠ 主干绿」（D10④ / 选项表 J）。

## What Changes

**A. commit 路径的命中判定**（机制面 · `lib/commit-gate.ts` + `plugins/commit-gate.ts`）

| # | 变更 | SU 出处 |
|---|---|---|
| A0 | **识别机制（SU 未定义 ⇒ 本 change 定义）**：声明新增 `inspection: { command: string[], carrier: string }` ——<br>① `command` = 巡检守卫的 argv，**必须**作为 `verify_commands` 的**独立条目**出现（不得与其它命令共享合并输出）；<br>② `carrier` = 巡检载体文件路径（仓库相对），**必须 git-tracked**（symlink / untracked / 缺失 ⇒ 均按「缺席」处理）；<br>③ **任何 `known_failures` 条目不得绑定 `inspection.command`**（绑定即该条目**无效**）；<br>④ 声明含 `known_failures` ⇒ `inspection` **必须存在**且满足 ①②（否则**字段整体无效** ⇒ 退回 D2① 硬门，fail-closed）；<br>⚠ 门禁**不得硬编码治理仓路径**（`inspection` 里的 `carrier` 由声明给出 ⇒ 使用方仓可用自己的 CI job 文件接入） | D10② 三条硬约束（SU 未给识别机制 ⇒ 此处补） |
| A1 | 声明可带 `known_failures: [{ command: string[], match: string }]`；`command` 必须与某条 `verify_commands` argv **逐字相等**（不匹配 ⇒ 条目**无效**、不放行） | D10① |
| A2 | 命令失败 **且** 合并输出（**stdout + stderr 全量**，不是尾部）含 `match` ⇒ 视为通过；未命中 ⇒ **照旧拒** | D10① |
| A3 | **特异性守卫**：`match` **去空白后**长度 **≥ 8**；**通用词按词边界整词匹配**（`fail` / `failed` / `error` / `errors` 等，大小写**不敏感**）⇒ 命中即**不合法**（声明视作未声明） | D10① + 后果段风险② |
| A4 | **运行时留痕**：命中放行时输出**非抛错**提示 `baseline 命中: <command> / match=<…>`，**发射通道 = 门禁返回结构里的 notice 字段**（插件 `console.log` 会被宿主吞掉 ⇒ 不用它） | D10① + V20 |
| A5 | **超时按未命中处理**（超时 ⇒ 照旧拒；**不得**因已产出部分输出含 `match` 而放行） | 后果段风险①的方向（误拒优先） |
| A6 | **总兜底**：声明的**任何**解析 / 校验异常（`known_failures` 非数组 / `match` 非字符串 / `command` 非数组 / JSON 损坏 / `inspection` 形状非法）⇒ 一律**视作未声明 ⇒ 退回 D2① 硬门**（fail-closed，绝不默认放行） | D10② + D6 的 fail-closed 口径 |

**B. 巡检层（防腐坏 + 可清理）**（机制面 · **新增** `scripts/commit-gate-baseline-doctor.ts`；**不动** `commit-gate-doctor.ts`）

| # | 变更 | SU 出处 |
|---|---|---|
| B1 | **集合比对算法（不得复用子串语义）**：巡检层把命令输出解析为**失败标识集合**（逐工具提取器：`bun test` ⇒ 失败用例名；`format.sh --check` ⇒ 待格式化文件路径；无提取器 ⇒ 该命令**不参与**集合比对，只报「无法提取标识」）；条目 → 标识的映射规则 = 「该条目的 `match` 命中输出中的**标识行**」（标识行 = 提取器给出的行）⇒ `known_failures` 的每条**必须**映射到 ≥1 个当前实际标识 ⇒ 否则该条**不再命中** | D10② + 风险②（防「3 fail ⊆ 13 fail」） |
| B2 | **失败数膨胀必被发现**：登记 `3 fail` 而实际 `13 fail` ⇒ 标识集合大小变化 ⇒ 该条**不再命中** ⇒ 巡检**红**（这是巡检层不复用子串的**全部理由**） | 风险② |
| B3 | 不再命中的条目 ⇒ 「可清理」提示（清单不静默腐坏） | D10② |
| B4 | 巡检**退出码矩阵**（独立脚本 ⇒ 不与 `commit-gate-doctor.ts` 的 0/1/2 契约冲突）：`0` = 通过；`1` = 红（baseline ⊄ 实际失败 / 存在不再命中的条目）；`2` = skip（判定不可得：命令跑不了 / 无提取器） | D10② + A4（载体形态钉死） |

**C. 声明内容守卫（**防增**）**（机制面 · `tests/config-guards.test.ts` 扩展）

| # | 变更 | SU 出处 |
|---|---|---|
| C1 | 「baseline **不能增**」由**声明内容守卫**保证（D9① 的形态扩展到 `known_failures` 字段）：守卫**逐项相等**断言清单；**期望集载体 = 独立文件**（`tests/fixtures/commit-gate-known-failures.expected.json`）⇒ 改声明清单 ⇒ 守卫红 ⇒ 增长必须是一次**显式、可审**的动作 | D10③ + V24②（⊆ 交付不了这一条） |
| C2 | **两层判别力**：① **真仓守卫**：真仓声明当前**无** `known_failures` ⇒ 空集相等 ⇒ 恒绿，但守卫**必须真的读取该字段**（用例断言「真仓声明被守卫实际读取」⇒ 防止「fixture 红、真仓守卫没接线」的假绿）；② **fixture 红路径**：改 fixture / 改声明 ⇒ 红 | D10③ + 风险② |

**D. 免宣称面登记**（治理面 · **architect** 落笔；守卫侧 = 机制面 · builder）

| # | 变更 | SU 出处 |
|---|---|---|
| D1 | 新面「baseline 命中放行」登记为 **D9⑰**（**ADR 表（真源）+ 三处载体**同批：测试注释 / 主题文档 `docs/MULTI-AGENT-DESIGN.md` §2.8.8 / **AC 面**（本 change 的 `proposal.md`）） | D10③′ + V25② |
| D2 | **计数 16 → 17 的迁移（含一处陷阱）**：守卫 `tests/commit-gate-d9-registration.test.ts` 现**硬编码** `AC_HEADING = "## D9 十六项登记（AC 面）"`（`:38`）与计数 `16`（`:174` / `:269`）⇒ 若只把常量 bump 成「十七项」，`collectAcFaceFiles` 按**单一标题**收集 ⇒ **已归档 proposal 的「十六项」小节全部掉出 AC 面并集** ⇒ D9①–⑯ 的 AC 面登记**静默消失** ⇒ 守卫红且**归档 proposal 不可回改** ⇒ 修法：守卫改为**接受多标题**（旧标题 + 新标题并列）或标题**去计数化**（新标题 `## D9 免宣称项登记（AC 面）` + 旧标题仍被接受）⇒ **已归档载体继续有效** | D10③′（SU 的「四面同批」在计数迁移上的隐含后果） |

**E. 回滚面同批**（机制面 · `.rddf/rollback/`）

| # | 变更 | SU 出处 |
|---|---|---|
| E1 | 同批更新 `.rddf/rollback/commit-gate.json`（新增的守卫 / 巡检脚本 / fixture / baseline 字段相关的 **delete** 与 **edits** 条目）+ 机制登记表（`registry.json`）⇒ 并**同批重跑回滚演练**并回填 `last_drill`（registry 的 V8 判据） | D10⑥ |
| E2 | **四步顺序（drill 基于 HEAD ⇒ 工作区脏会得到假 PASS）**：① 先 commit 本批实现（该 commit 本身要过新门禁）→ ② 在**已提交**状态跑 drill → ③ 回填 `last_drill` → ④ 再 commit 回填 | D10⑥ + registry V8 |

## Acceptance

> **AC ↔ V 映射**（V 编号 = `docs/adr/ADR-commit-verification-gate.md` 的 Verification 章，唯一真源）

- [ ] **AC1（↔ V20，红→绿）** `tests/commit-gate-baseline.test.ts`（新增，治理仓 `bun test`）：命中 `known_failures` ⇒ **放行** + **运行时留痕**（notice 字段含 `baseline 命中: …`，且**通道被调用**）；未命中 ⇒ **拒**（错误仍指名失败命令 + 输出尾部）；**同一 command 多条目**时任一命中即放行。
- [ ] **AC2（↔ V22，红→绿）** 同文件：**无** `known_failures` 的声明 ⇒ 行为与 SU 前**逐字相同**（任一非 0 ⇒ 拒）。
- [ ] **AC3（↔ V23 + D10①，红→绿）** 同文件：① `known_failures.command` 与 `verify_commands` 任一条**不逐字相等** ⇒ 该条目**无效**（不放行）；② **特异性**：`match` 去空白后 < 8 字 / 纯数字 / 通用词（整词匹配、大小写不敏感）⇒ 声明**不合法**（视作未声明）；③ **超时按未命中**（不因部分输出含 `match` 而放行）；④ baseline **不豁免** D2②（暂存区为空）/ D2③（越写集）；⑤ **总兜底**：`known_failures` 非数组 / `match` 非字符串 / `command` 非数组 / JSON 损坏 / `inspection` 形状非法 ⇒ **视作未声明 ⇒ 硬门**。
- [ ] **AC4（↔ V25①，红→绿）** 同文件（**基于 `inspection` 字段**）：① 声明含 `known_failures` 但**缺 `inspection`** / `inspection.command` **不在** `verify_commands` 中 / `inspection.command` **与其它命令共享**（⇒ 合并输出会吞没）/ `inspection.carrier` **未 tracked** / **是 symlink** / 缺失 ⇒ **字段整体无效 ⇒ 退回硬门**（拒）；② **`known_failures` 绑定 `inspection.command`** ⇒ 该条目**无效**（不放行）。
- [ ] **AC5（↔ V24① + V24②，红→绿）** `tests/commit-gate-baseline-doctor.test.ts`（新增）+ `tests/config-guards.test.ts`：① **防腐坏**：巡检层按**标识集合**比对（**不复用子串语义**）⇒ `known_failures` 每条必须映射到 ≥1 个当前实际标识；登记 `3 fail` 而实际 `13 fail` ⇒ **膨胀被发现 ⇒ 红**；不再命中的条目 ⇒ 「可清理」提示；无提取器的命令 ⇒ 「无法提取标识」（不静默当通过）；② **防增**：**声明内容守卫**逐项相等断言清单（期望集 = 独立 fixture 文件）⇒ 改声明清单 ⇒ 红；③ **真仓守卫确实被接线**：用例断言真仓声明的 `known_failures` 被守卫**实际读取**（防「fixture 红、真仓守卫没接上」的假绿）。
- [ ] **AC6（↔ D9⑰ 登记，红→绿）** `tests/commit-gate-d9-registration.test.ts`：① **D9⑰** 在 **ADR 表（真源）+ 三处载体**齐全（测试注释 / 主题文档 §2.8.8 / 本 change proposal 的 AC 面）⇒ 守卫绿；缺任一处 ⇒ 红；② **本 change 的 `proposal.md` 含行首标题的 AC 面小节**且标题**与守卫常量逐字相等**（标题由守卫常量派生，不手抄）；③ 守卫**接受多标题**（或去计数化）⇒ **已归档 proposal 的「十六项」小节继续被收集**（计数迁移不塌陷）；④ **加一行未登记 ⇒ 红**的判别力仍在。
- [ ] **AC7（判别力 · 变异，7 条）** ① 命中判定短路为「恒放行」⇒ AC1 红；② 命中但**不留痕**（或留痕不走 notice 通道）⇒ AC1 红（V20 变红）；③ 把「无条目」当命中 ⇒ AC2 红（V22 变红）；④ 去掉特异性守卫 ⇒ AC3 红；⑤ 把「超时」当命中 ⇒ AC3 红；⑥ 去掉 ⊆ 断言 / 让巡检复用子串语义 ⇒ AC5 红（V24① 变红）；⑦ 把「巡检缺席」做成仍放行 ⇒ AC4 红（V25① 变红）。
- [ ] **AC8（回滚面，红→绿）** **四步顺序**（E2）：commit（本批实现，须过新门禁）→ drill → 回填 `last_drill` → 再 commit；`.rddf/rollback/commit-gate.json` + `registry.json` 与本批改动**同批**更新 ⇒ `bun test tests/rollback-manifests.test.ts tests/rollback-registry.test.ts` 绿 + 回滚演练通过。
- [ ] **AC9（门）** 治理仓 `bun test tests/` **全绿**（含本 change 新增/改动的用例，且新增用例文件**确实被 glob 到**）；`openspec validate commit-gate-baseline-known-failures --strict` ⇒ valid。

## Capabilities

- MUST: 声明带 `known_failures` 时，命中 ⇒ 放行（**并留痕**，走 notice 通道）；未命中 ⇒ 拒；无该字段 ⇒ 行为**逐字不变**。
- MUST: `match` 受**特异性约束**（去空白后 ≥ 8 字、非纯数字、通用词按词边界整词匹配）⇒ 宽泛模式不合法。
- MUST: **巡检缺席 ⇒ 字段无效 ⇒ 退回硬门**（fail-closed，判定在 commit 时；识别靠声明的 `inspection` 字段 ⇒ 机制 **repo-agnostic**，不硬编码治理仓路径）。
- MUST: 「baseline **不能增**」由**声明内容守卫**承担（改清单 ⇒ 守卫红）；⊆ 断言只承担**防腐坏**，且必须按**标识集合**比对（**不复用子串语义** ⇒ 失败数膨胀必被发现）。
- MUST: 新放行面按 **D9⑰** 登记（真源 + 三处载体同批）；**计数迁移不得让已归档载体掉出并集**。
- MUST NOT: 未经登记的失败被放过（未命中仍拒）。
- MUST NOT: 巡检缺席时 baseline 仍生效（⇒ 放行）。
- MUST NOT: **超时**被 baseline 豁免。
- MUST NOT: 声明的解析 / 校验异常导致**默认放行**（一律视作未声明 ⇒ 硬门）。
- MUST NOT: 用「时间窗口内忽略失败」这类**不可判定**机制。

## Impact

| 面 | 影响 |
|---|---|
| `lib/commit-gate.ts` | 声明形状（`known_failures` / `inspection`）+ 命中判定 + 特异性守卫 + 总兜底 + 巡检缺席 fail-closed |
| `plugins/commit-gate.ts` | 接线：捕获**全量**合并输出用于匹配（尾部只用于报错）+ notice 留痕 + 巡检缺席检查 |
| `scripts/commit-gate-baseline-doctor.ts`（新） | 巡检层：标识提取器 + 集合比对 + 可清理提示 + 退出码矩阵（0/1/2） |
| `tests/config-guards.test.ts` | 声明内容守卫扩展到 `known_failures`（防增）+ 期望集 fixture |
| `tests/fixtures/commit-gate-known-failures.expected.json`（新） | 防增守卫的**期望集**（独立载体） |
| `tests/commit-gate-d9-registration.test.ts` | 计数 16 → 17 + **多标题兼容**（防归档并集塌陷）+ JSDoc ⑰ 行 |
| `tests/commit-gate-baseline.test.ts`（新） | 本 change 的主用例（命中/未命中/默认不变/无效条目/特异性/超时/巡检缺席/总兜底） |
| `tests/commit-gate-baseline-doctor.test.ts`（新） | 巡检层用例（集合比对 / 膨胀发现 / 可清理 / 无提取器） |
| `docs/adr/ADR-commit-verification-gate.md`（治理面） | D9 表 + ⑰ 行 + 「十六项 → 十七项」措辞（architect 落笔） |
| `docs/MULTI-AGENT-DESIGN.md`（治理面） | §2.8.8 索引行 + ⑰ 行 + 措辞（architect 落笔） |
| `openspec/changes/archive/2026-11-28-commit-gate-baseline-known-failures/proposal.md` | **AC 面**（D9 登记 ①–⑰） |
| `.rddf/rollback/commit-gate.json` + `registry.json` | 回滚清单同批 + `last_drill` 回填 |
| `.rddf/improvements/commit-gate-baseline-known-failures.md` | 本文件（载体） |

**同批 commit 的归属与顺序**（metis H2）：D9 计数迁移要求 **ADR 表（治理面）+ 守卫计数/标题（机制面）+ 本 change
proposal 的 AC 面**落在**同一个 commit** ⇒ 否则中间态**守卫红**（可接受但须显式声明）。
⇒ 处置：**治理面改动（architect）与机制面改动（builder）分两次提交，第一提交只改治理面文字且**不改**计数
（⇒ 守卫仍按 16 项判定 ⇒ 绿），第二提交再改计数与守卫（此时 ADR 已有 ⑰ 行 ⇒ 期望集派生 ⇒ 需三处载体同批齐备）。
中间态红**不接受** ⇒ 顺序由 architect 与 builder 协同确定。

## 6. metis 轮（2026-11-27 · 1 轮 · 治理面语境）逐条处置

> **真实 finding**（metis 独立给出；本表逐条处置）。**先前草稿里的 M1–M5 是占位伪造，已全部删除**
> （metis 明确点名：伪称「已审」且携带未裁决的 fixture 路径，是本稿最严重的 slop）。

| # | finding（摘要） | 处置 |
|---|---|---|
| H1 | **识别机制缺失**：D10② 三条硬约束都以「门禁能识别哪条命令是巡检守卫」为前提，草稿从未定义（声明字段 / 约定路径都没有）⇒ 两种读法产物完全不同 | ✅ 采纳：**A0** 新增 `inspection: { command, carrier }` 声明字段（四条约束 + repo-agnostic 约束）；AC4 全部断言改基于该字段 |
| H2 | 治理面 / 机制面「同批」的 **commit 粒度时序**未定义 ⇒ architect 加 ⑰ 行的瞬间守卫「恰 16 项」立即红 | ✅ 采纳：Impact 增「同批 commit 的归属与顺序」段 ⇒ 给出**两提交顺序**（先治理面文字不改计数，后计数+守卫），中间态红**不接受** |
| H3 | 本 change 的 `proposal.md` **本身就是 D9⑰ 的 AC 面载体** ⇒ 起草时极易漏（openspec 模板无此节） | ✅ 采纳：AC6② 显式要求「proposal.md 含行首标题的 AC 面小节且标题与守卫常量逐字相等」 |
| H4 | 缺**总兜底原则**（声明解析/校验异常 ⇒ 视作未声明 ⇒ 硬门）⇒ 未枚举的畸形路径会默认放行 | ✅ 采纳：**A6** + Capabilities 的 MUST NOT |
| A1 | `inspection` 识别机制两种读法（草稿最大歧义，A5/B3/AC4 全部悬空） | ✅ 采纳（同 H1） |
| A2 | ⊆ 有两种读法：(a) 逐工具标识集合比对 / (b) 退化成子串语义 —— 而 (b) 正是 D10② **明令禁止**的；且「子串 ⊆ 标识集合」的比较关系本身未定义 | ✅ 采纳：**B1** 给出比较算法（提取器清单 + 条目→标识映射规则）+ **B2** 膨胀用例；AC5 加判据 |
| A3 | 「非通用词」判定口径未定义（整串相等？子串？大小写？）⇒ `"pre-existing failures in test_llm_cache"` 含 `fail` 会被误拒 | ✅ 采纳：**A3** 钉「通用词按**词边界整词匹配** + 大小写不敏感」；AC3② 配用例 |
| A4 | 巡检载体形态未定（doctor 扩展 vs 独立脚本），且 doctor 现有 0/1/2 退出码契约与 baseline 巡检的语义冲突未定义 | ✅ 采纳：**独立脚本**（doctor 不动）+ **B4** 独立退出码矩阵；Impact 表相应补 |
| A5 | C1 的「期望集载体」形态不唯一；真仓声明当前无 `known_failures` ⇒ 真仓守卫恒绿（空集相等），红路径只能靠 fixture ⇒ 两层未区分 | ✅ 采纳：**C1**（载体 = 独立 fixture 文件）+ **C2** 两层判别力（真仓守卫被实际读取 + fixture 红路径）；AC5③ |
| S1 | 抬头「metis 1 轮审后已修订」是**虚假声明**（metis 从未运行，M1–M5 是占位伪造，且携带未裁决的 fixture 路径会被后人当成已裁决设计） | ✅ 采纳：§6 全部替换为**真实 finding**（本表）；抬头改为「metis 1 轮（2026-11-27）审后已修订」并指向 §6；占位 M1–M5 **已删除** |
| S2 | 「既有守卫已如此、只需同步计数与标题」与事实不符（`:38` 硬编码标题、`:174/:269` 硬编码 16）；且 bump 成「十七项」后**已归档 proposal 的「十六项」小节会全部掉出 AC 面并集** ⇒ D9①–⑯ 登记静默消失 ⇒ 守卫红且归档不可回改 | ✅ 采纳：**D2** 改为如实的工作量描述 + **多标题兼容 / 去计数化**修法；AC6③ 把「归档并集不塌陷」写成判据 |
| S3 | B1 属于「看着完整实际不可执行」 | ✅ 采纳（同 A2） |
| S4 | 「非抛错提示」未钉发射通道（插件 `console.log` 会被宿主吞掉 ⇒ 留痕名存实亡） | ✅ 采纳：**A4** 钉「留痕走**返回结构的 notice 字段**」；AC1 断言通道被调用 |
| S5 | AC5 只测 fixture 不测真仓守卫接线 ⇒ 「fixture 红、真仓守卫没接上」的假绿 | ✅ 采纳：**C2** + AC5③ |
| M-1 | AC7 缺 4 条变红（不留痕 / 无条目当命中 / 去 ⊆ / 巡检缺席仍放行）⇒ 各 V 的「变红」子句是判据的一部分 | ✅ 采纳：AC7 扩为 **7 条**（逐条对应 V20 / V22 / V24① / V25① 的变红子句） |
| M-2 | 无 AC 覆盖「**失败数膨胀被巡检发现**」（ADR 风险②的具象化） | ✅ 采纳：**B2** + AC5①（`3 fail` → `13 fail` ⇒ 巡检红） |
| M-3 | AC8 缺**顺序判据**（drill 基于 HEAD ⇒ 工作区脏会得到假 PASS） | ✅ 采纳：**E2** 四步顺序 + AC8 明写 |
| M-4 | AC1 缺「同一 command 多条目任一命中即放行」与「大小写」用例 | ✅ 采纳：AC1 补多条目；大小写并入 AC3②（通用词判定含大小写口径） |
| M-5 | AC9 可补「新增用例文件确实被 `bun test tests/` glob 到」 | ✅ 采纳：AC9 明写 |
| E1 | **超时不得被 baseline 豁免**（挂死的测试套件可借 baseline 永久过关） | ✅ 采纳：**A5** + Capabilities 的 MUST NOT + AC3③ |
| E2 | **纯空白 match**（8 个空格）绕过特异性守卫 | ✅ 采纳：**A3** 的「**去空白后** ≥ 8」 |
| E3 | 畸形声明的总兜底未定义 | ✅ 采纳（同 H4） |
| E4 | D9 标题 bump 的**归档并集塌陷**（唯一会让既有绿测试变红且无法通过改归档修复的边界） | ✅ 采纳（同 S2） |
| E5 | 载体文件的 git-tracked 判定错误路径未枚举（`git ls-files` 失败 / symlink / 存在但未 tracked / worktree 内缺失） | ✅ 采纳：AC4① 枚举（symlink / untracked / 缺失 ⇒ 均按缺席） |
| E6 | `match` 跨行 / CRLF 差异；同一 argv 在 `verify_commands` 出现两次时的绑定检查行为 | ✅ 采纳：跨行/CRLF ⇒ **归一化换行后匹配**（方向安全）；同一 argv 两次 ⇒ 绑定检查按**全部出现位置**判定（保守） |
| E7 | 机制必须 **repo-agnostic**（lib 不得硬编码治理仓路径），否则使用方仓接不上 | ✅ 采纳：**A0** 的 repo-agnostic 约束（`carrier` 由声明给出）+ Capabilities 的 MUST |
