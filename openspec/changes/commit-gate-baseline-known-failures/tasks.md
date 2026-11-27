# tasks: commit-gate-baseline-known-failures

> TDD 5 步/task；`- [ ]` 在实施时勾选。**判据真源** = ADR D10 + V20–V25（AC ↔ V 映射见 `proposal.md`）。
> **角色分工**：机制面 task ⇒ builder；**Task 6（治理面 D9⑰ 登记）⇒ architect**（与 Task 5 同 commit）。

## Task 1 — 声明形状 + 纯逻辑匹配（AC1 + AC2 + AC3）

- [x] **Step 1（红）** 新增 `tests/commit-gate-baseline.test.ts`：命中 ⇒ 放行 / 未命中 ⇒ 拒 / 无 `known_failures` ⇒ 逐字不变 / 多条目任一命中 / 无效条目（command 不逐字相等）/ 特异性违规（去空白 <8、纯数字、通用词整词）/ 超时按未命中 / 畸形声明总兜底 ⇒ 修复前红（无该字段 ⇒ 恒按旧逻辑）。
- [x] **Step 2（绿）** `lib/commit-gate.ts`：`CommitGateDeclaration` 扩 `known_failures` / `inspection`；新增 `matchKnownFailure()` + `isSpecificMatch()` + 声明校验（总兜底）；`evaluateCommitGate` 接入命中结果（命中 ⇒ 放行 + `notices`）。
- [x] **Step 3** 同文件补用例：**命中 ⇒ 产出 notice 文本**（`baseline 命中: … / match=…`）。
- [x] **Step 4** `bun test tests/commit-gate-baseline.test.ts` 全绿。
- [x] **Step 5** 清理：匹配与特异性判据**只在 `lib/commit-gate.ts`**（不复制到插件）。

## Task 2 — 接线：全量输出 + notice 落盘 + 巡检缺席 fail-closed（AC1 + AC4）

- [x] **Step 1（红）** 同文件（或新 `tests/commit-gate-plugin-baseline.test.ts`）：`run()` 返回 `merged`（全量）+ `tail`；命中时 notice **落盘**到 `.rddf/state/commit-gate-notices.jsonl`（通道被调用）；缺 `inspection` / `inspection.command` 非独立条目 / carrier 未 tracked / 是 symlink ⇒ **字段整体无效 ⇒ 退回硬门**；`known_failures` 绑定 `inspection.command` ⇒ 条目无效。
- [x] **Step 2（绿）** `plugins/commit-gate.ts`：捕获全量合并输出；命中 ⇒ 放行 + 落 notice；静态检查 `inspection`（存在性 / 独立条目 / git-tracked / 非 symlink）⇒ 不满足 ⇒ **按无 `known_failures` 处理**（硬门）。
- [x] **Step 3** 同文件补用例：**git ls-files 失败 / carrier 是 symlink** ⇒ 均按「缺席」⇒ 硬门。
- [x] **Step 4** `bun test tests/commit-gate-plugin-baseline.test.ts` 全绿。
- [x] **Step 5** 清理：插件不写业务判据（只做接线 + 静态检查）。

## Task 3 — 巡检层（AC5① + B1–B4）

- [x] **Step 1（红）** 新增 `tests/commit-gate-baseline-doctor.test.ts`：标识提取器（`bun test` 失败用例名 / `format.sh --check` 文件路径）；集合比对（不复用子串）；`3 fail` → `13 fail` ⇒ **膨胀被发现 ⇒ 红**；不再命中 ⇒ 「可清理」提示；无提取器 ⇒ 「无法提取标识」（不静默当通过）；退出码 0/1/2。
- [x] **Step 2（绿）** 新增 `scripts/commit-gate-baseline-doctor.ts`（**不动** `commit-gate-doctor.ts`）。
- [x] **Step 3** 同文件补用例：``known_failures`` 为空集 ⇒ 通过（exit 0）。
- [x] **Step 4** `bun test tests/commit-gate-baseline-doctor.test.ts` 全绿。
- [x] **Step 5** 清理：巡检脚本**不**读 iteration.json、不硬编码治理仓路径。

## Task 4 — 声明内容守卫（防增）（AC5② + AC5③）

- [x] **Step 1（红）** `tests/config-guards.test.ts` 扩展：声明的 `known_failures` 与期望集（`tests/fixtures/commit-gate-known-failures.expected.json`）**逐项相等** ⇒ 改声明 ⇒ 红；**真仓守卫确实被读取**（空集也走一遍比较）。
- [x] **Step 2（绿）** 期望集 fixture + 守卫断言。
- [x] **Step 3** 同文件补用例：期望集缺失 ⇒ 守卫红（不是「当作空集」）。
- [x] **Step 4** `bun test tests/config-guards.test.ts` 全绿。
- [x] **Step 5** 清理：期望集**只在** fixture 一处。

## Task 5 — D9 计数迁移（守卫侧）（AC6③）

- [x] **Step 1（红）** `tests/commit-gate-d9-registration.test.ts`：守卫接受**多标题**（新标题 + 旧标题）⇒ 已归档 proposal 的「十六项」小节**继续被收集**（并集不塌陷）；计数断言 16 → 17。
- [x] **Step 2（绿）** `AC_HEADINGS`（数组，保留旧标题）+ 计数改为 17 + 判别力用例（「加一行未登记 ⇒ 红」仍在）。
- [x] **Step 3** 同文件补用例：**旧标题**的归档载体仍被收集（用既有归档 proposal 断言 ①–⑯ 覆盖）。
- [x] **Step 4** `bun test tests/commit-gate-d9-registration.test.ts` 全绿。
- [x] **Step 5** 清理。

## Task 6 — 治理面 D9⑰ 登记（architect · 与 Task 5 同 commit）（AC6① + AC6②）

- [x] **Step 1** ADR D9 表加 **⑰** 行（标题逐字 = 「baseline 命中放行」）+ 「十六项 → 十七项」措辞（D9 标题 / 前言 / V10）；主题文档 §2.8.8 加 ⑰ 行 + 措辞；`tests/commit-gate-d9-registration.test.ts` 的 JSDoc 加 ⑰ 行（**测试注释面**）。
- [x] **Step 2** 本 `proposal.md` 的 AC 面小节标题与守卫常量**逐字相等**（已在本 change 的 proposal 内 ⇒ 核对一致）。
- [x] **Step 3** `bun test tests/commit-gate-d9-registration.test.ts` ⇒ 绿（17 项全登记）。
- [x] **Step 4** `openspec validate commit-gate-baseline-known-failures --strict` ⇒ valid。
- [x] **Step 5** 清理：治理面改动与机制面改动**同批一个 commit**（中间态红不接受）。

## Task 7 — 判别力（AC7 · 7 条变异）

- [x] **Step 1** 逐条实测并回滚：① 命中判定恒放行 ⇒ AC1 红；② 不留痕（不走 notice 通道）⇒ AC1 红；③ 「无条目」当命中 ⇒ AC2 红；④ 去特异性守卫 ⇒ AC3 红；⑤ 超时当命中 ⇒ AC3 红；⑥ 去 ⊆ / 让巡检复用子串 ⇒ AC5 红；⑦ 「巡检缺席」做成仍放行 ⇒ AC4 红。
- [x] **Step 2** 每条记录红/绿证据（进验收报告）。
- [x] **Step 3** 回滚后 `bun test tests/` 全绿。
- [x] **Step 4** `grep -rc MUTATION` == 0。
- [x] **Step 5** 清理。

## Task 8 — 回滚面 + 收口（AC8 + AC9）

- [x] **Step 1（红→绿）** `.rddf/rollback/commit-gate.json`（新增 delete / edits）+ `registry.json` 同批更新 ⇒ `bun test tests/rollback-manifests.test.ts tests/rollback-registry.test.ts` 绿。
- [x] **Step 2** **四步顺序**：commit（`4cbf5c0`）→ drill → 回填 `last_drill` → commit（`973b451`）。
- [x] **Step 3** `bun test tests/` **全绿**（1378 tests / 1377 pass / 1 skip / 0 fail；新增用例文件已被 glob 到）。
- [x] **Step 4** 遗留清扫：`TODO` / `FIXME` / `MUTATION` / `console.log` 残留 ⇒ 零。
- [x] **Step 5（门 AC9）** `openspec validate <change> --strict` ⇒ valid；验收报告落 `.rddf/reviews/commit-gate-baseline-known-failures-verify.md`。
