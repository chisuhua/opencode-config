# commit-gate-d9-three-place-registration —— 验收报告（第 1 轮）

> **角色**：verifier（独立验收；只出证据与判决，不改实现）
> **判据来源**：`openspec/changes/commit-gate-d9-three-place-registration/proposal.md` 的 `## 验收标准`（**AC1–AC13**）—— 本 change 明确声明「判据真源 = 该 AC 表」。
> **分流判定**：`rddf rdd-verify --dry-run` ⇒ `No eligible changes to verify (empty queue)`（无 `.rddf/state/iteration.json`、无 P3 archive gate 事件）⇒ 走**本地验收**（本报告）。
> ⚠ **本地验收的额外门（`tasks_done == tasks_total > 0`）不适用**：本 change **无 `tasks.md`**（`openspec archive` 也报 `Task status: No tasks`）⇒ 以 AC 表为唯一判据（proposal 的自我声明）。
> **已用轮次**：**第 1 轮**（上限 3）。

## 1. 验证顺序与基线

| 步 | 检查 | 结果 |
|---|---|---|
| 0 | 静态 / 编译 | 本仓**无 `tsconfig.json`**，TypeScript 由 `bun test` 编译 ⇒ 以单测运行即编译检查 |
| 1 | 单测（本次新增） | `bun test tests/commit-gate-d9-registration.test.ts` ⇒ **18 pass / 0 fail** |
| 2 | 单测（相关守卫） | `bun test tests/config-guards.test.ts` ⇒ **117 pass / 0 fail** |
| 3 | 全量 | `bun test tests/` ⇒ **899 pass / 0 fail** |
| 4 | 锚点 | `bash scripts/check-upstream-anchors.sh` ⇒ **23/23** |
| 5 | openspec | `openspec validate commit-gate-d9-three-place-registration --strict` ⇒ **valid** |

## 2. 逐 AC 判定（每条都有工具证据）

| AC | 判定 | 证据（本次实跑） |
|---|---|---|
| AC1 | ✅ | `bun test … -t "AC1 "` ⇒ **4 pass**（整体绿 + AC 面 / 测试注释 / 主题文档 三面覆盖） |
| AC2 | ✅ | `-t "AC2"` ⇒ **3 pass**（只写编号 / `……` / 标题截断 三条负例） |
| AC3 | ✅ | `-t "AC3"` ⇒ **2 pass**（16 项 / 唯一 / 标题非空 + 派生对文本变化敏感） |
| AC4 | ✅ | `-t "AC4"` ⇒ **1 pass**；**独立重跑 M5**（ADR 追加 `\| ⑰ \| **新增项标题** \| 描述 \|`）⇒ 守卫报 `AC 面 缺 D9⑰` / `测试注释 缺 D9⑰` / `主题文档 缺 D9⑰`；复原后 **18 pass** |
| AC5 | ✅ | `-t "AC5"` ⇒ **2 pass**（删 MAD 索引段一行后散文仍在 ⇒ 仍红；反引号散文不被当载体） |
| AC6 | ✅ | `-t "AC6"` ⇒ **2 pass**（临时 fixture 两形态 + 真实路径） |
| AC7 | ✅ | `-t "AC7"` ⇒ **2 pass**（行内负向词 / 索引段 `缓解：`） |
| AC8 | ✅ | `-t "AC8"` ⇒ **1 pass**（重复登记） |
| AC9 | ✅ | `-t "AC9"` ⇒ **1 pass**；`grep -cE "\.skip\(|\.todo\(" 新守卫文件` ⇒ **0** |
| AC10 | ✅ | `git diff --numstat 65895a5 -- docs/adr/ADR-commit-verification-gate.md` ⇒ **`9 2`**；`grep -c '^@@'` ⇒ **4**（hunk）；D9 表行改动 ⇒ **仅 ⑯ 行一处**（其余 15 行零差异） |
| AC11 | ✅（**措辞漂移**，见 §4） | 证据包含 **M1–M8 = 8 条**，每条有突变描述 + 红用例 + 断言文案 + 复原后复跑（**≥ 7 条**要求满足） |
| AC12 | ✅ | 全量 899 pass；anchors 23/23；validate valid；**§2.8.7 的 D5② 句 base↔HEAD 逐字相同**（`git show 65895a5:… \| grep -o` 与 HEAD 对比一致） |
| AC13 | ✅（**落点与措辞不符**，见 §4） | 16 行 verdict **存在**（`.rddf/reviews/commit-gate-d9-three-place-registration-review.md` §4，实测 verdict 行 = **16**）；抽查 D9⑪ / D9⑭：标题派生只取**加粗段**、括注留在 ADR ✓ |

## 3. 遗留清扫复核（**未通过**）

| # | 发现 | 证据 | 为什么算遗留 |
|---|---|---|---|
| L1 | `.rddf/improvements/commit-gate-d9-three-place-registration.md` 的 **13 条 AC 摘要全部仍是 `- [ ]`**（未勾选） | `grep -n "^- \[ \]"` ⇒ 13 行（:51–:63） | 实施已完成而清单未勾 ⇒ 读者会判「未完成」 |
| L2 | 同一文件的 **3 条摘要措辞已过时**：AC3 仍写「代码里无十六项 id 字面量数组」（proposal 已按 critic SHOULD_FIX 改为「由 AC4 证明」）；AC10 仍写「只碰 `:221`/`:240`/`:302` 三处句（表体零差异）」（proposal 已改为 numstat/4 hunk/仅 ⑯ 行）；AC11 仍写「7 条突变」（证据包 8 条） | :53 / :60 / :61 | 同一份记录在三处与真源不一致 ⇒ 正是本 change 要防的「宣称 ≠ 实现」，只是对象换成了自己 |
| L3 | `proposal.md` 的 **AC11** 写「7 条突变」，证据包实际 **8 条**（M8 为 oracle finding 的补充） | proposal:118 vs 证据包 M1–M8 | 措辞与产物不一致（要求本身满足：≥7） |
| L4 | `proposal.md` 的 **AC13** 写「16 行 verdict 落**证据包**」，实际落在**审查记录** §4（证据包中 verdict 行 = **0**） | proposal:120 vs 两文件计数 | 落点与措辞不符 |

✅ **清扫通过的部分**：新守卫文件**无** `console.log` / `FIXME` / 注释掉的代码（`grep` 命中的 `TODO` 全是**负向词黑名单本身及其用例**，非残留）；工作树仅 `M cli.json`（运行时文件，刻意不提交）；本批文件清单与 proposal 的 What Changes 一致（6 改 1 增 + 2 个 review 记录）；无临时脚本入仓。

## 4. 判定与路由

**判定：❌ 不通过（记录类 —— 全部 AC 满足，遗留清扫未通过）**

| 项 | 分类 | 路由 |
|---|---|---|
| AC1–AC13 | ✅ 全部满足（AC11/AC13 属措辞/落点漂移，非实现缺失） | — |
| L1 / L2（improvement） | **proposal_drift**（记录与真源不一致；该文件属 planner 产物） | **builder 校准即可**（无需改实现）：勾选 13 项 + 按 proposal 现措辞同步 AC3 / AC10 / AC11 摘要 |
| L3 / L4（proposal 措辞） | **proposal_drift** | **builder 校准即可**：AC11 改「7 条（另 M8 为补充）」；AC13 改「16 行 verdict 落审查记录 §4」 |
| — | 复验义务 | 清理后**第 2 轮复验**（只核 L1–L4 + 全量回归） |

⚠ **不改实现**（角色边界）：以上 4 项都是**记录校准**，不涉及代码；修复后需复跑 `bun test tests/` 与 `openspec validate --strict`。

## 5. 已用轮次

| 轮 | 结果 | 备注 |
|---|---|---|
| **1**（本报告） | ❌ 不通过（记录类） | AC 全绿；遗留清扫 4 项（L1–L4）⇒ 路由回 builder 校准，之后复验 |
