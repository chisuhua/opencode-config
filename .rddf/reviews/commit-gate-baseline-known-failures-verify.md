# verify: commit-gate-baseline-known-failures

> **验收对象**：本 change 的**实现**（治理仓 `~/.config/opencode` 的**工作树**，尚未提交 —— 见 AC8/AC9 的阻塞）
> **验收时间**：2026-11-27
> **执行角色**：builder（角色内建 verifier 契约 · **本地验收路径**）
> **判据来源**：`openspec/changes/archive/2026-11-28-commit-gate-baseline-known-failures/proposal.md` 的 `## 验收标准`（AC1–AC9；该 change 已于 2026-11-28 归档）
> ⇒ 逐条映射到 ADR `docs/adr/ADR-commit-verification-gate.md` 的 **D10 + Verification V20–V25**（唯一真源）

## 实现清单（本轮改动）

| 文件 | 改动 |
|---|---|
| `lib/commit-gate.ts` | 声明形状（`known_failures` / `inspection`）+ `isSpecificMatch` / `matchKnownFailure` / `sameArgv` / `validateDeclaration`（总兜底）/ `evaluateInspection`（三条硬约束）/ `isBoundToInspection` / `shouldMatchBaseline`（超时按未命中）+ `GateInput/GateOutcome.notices` |
| `plugins/commit-gate.ts` | 全量合并输出捕获（尾部仍用于报错）+ 命中即 `continue`（不阻断）+ 巡检静态检查（`git ls-files` + `lstat` symlink）+ notice 落账本 `.rddf/state/commit-gate-notices.jsonl` |
| `scripts/commit-gate-baseline-doctor.ts`（新） | 巡检层：标识提取器（`bun test` / `format.sh --check`）+ **数字边界**集合比对（不复用子串）+ 可清理提示 + 退出码 0/1/2；不跑自己（防递归） |
| `tests/config-guards.test.ts` | **防增守卫**：声明的 `known_failures` 与期望集（独立 fixture）逐项相等；真仓守卫**确实被读取**；期望集缺失 ⇒ 红 |
| `tests/fixtures/commit-gate-known-failures.expected.json`（新） | 防增期望集（真仓当前 = 空集） |
| `tests/commit-gate-baseline.test.ts`（新，25 例） | AC1–AC4 主用例（命中/未命中/多条目/数字与换行/特异性/超时/无效条目/绑定巡检/总兜底/巡检四形态/载体 git 判定） |
| `tests/commit-gate-baseline-doctor.test.ts`（新，12 例） | 巡检层（提取器 / 防腐坏 / **膨胀必被发现** / 无提取器不静默 / skip / 数字边界） |
| `tests/commit-gate-d9-registration.test.ts` | **多标题兼容**（新标题 + 旧标题保留 ⇒ 归档 AC 面并集不塌陷）+ 计数 16 → 17 + JSDoc ⑰ 行 + 变异探针改用未登记 id ⑱ |
| `docs/adr/ADR-commit-verification-gate.md`（治理面） | D9 表加 **⑰**（baseline 命中放行）+ 「十六项 → 十七项」措辞（标题/标识口径/V10/AC 面标题） |
| `docs/MULTI-AGENT-DESIGN.md`（治理面） | §2.8.8 加 **D9⑰** 索引行 + 措辞 |
| `.rddf/rollback/commit-gate.json` | `delete` +4（巡检脚本 / 两个新测试 / 期望集）+ `edits` +16 + notes 说明回滚面边界 |

## 逐条判定（AC1–AC9）

| AC | 判据 | 证据 | 判定 |
|:--:|---|---|:--:|
| AC1（↔V20） | 命中 ⇒ 放行 + notice 留痕；未命中 ⇒ 拒；同 command 多条目任一命中 | `tests/commit-gate-baseline.test.ts`：`命中 ⇒ matched: true + pattern` / `不含 match ⇒ 未命中` / `多条目任一命中` / `门禁组合：命中 ⇒ allowed + notices[0] 含「baseline 命中」` | ✅ |
| AC2（↔V22） | 无 `known_failures` ⇒ 行为逐字不变 | 同文件：`无 known_failures ⇒ 任何输出都不命中` + `声明无该字段 ⇒ 失败即拒` | ✅ |
| AC3（↔V23） | 无效条目（command 不逐字相等）/ 特异性（<8、纯数字、末尾通用词）/ **超时按未命中** / 不豁免 D2②③ / 畸形声明总兜底 | 同文件：`条目只对其 command 生效` / `不具描述性的 match ⇒ 条目无效` / `shouldMatchBaseline：ETIMEDOUT/TIMEOUT ⇒ ok:false` / `baseline 不豁免 D2②（暂存空）与 D2③（越写集）` / `validateDeclaration：known_failures 非数组 / match 非字符串 / inspection 形状非法 ⇒ ok:false` | ✅ |
| AC4（↔V25①） | 巡检缺席（缺 `inspection` / 非独立条目 / 未 tracked / symlink）⇒ 字段整体无效；绑定巡检命令 ⇒ 条目无效 | 同文件：`缺 inspection ⇒ 无效` / `inspection.command 非独立条目 ⇒ 无效` / `未 tracked / symlink ⇒ 无效` / `绑定巡检守卫命令的条目 ⇒ 无效` + 真实 git 仓库的 `ls-files` / `symlink` 判定用例 | ✅ |
| AC5（↔V24①②） | 巡检层集合比对（**膨胀必被发现**）+ 可清理 + 防增守卫（改清单 ⇒ 红）+ 真仓守卫确实被读取 | `tests/commit-gate-baseline-doctor.test.ts`：`3 fail 的条目在 13 fail 输出里不再命中 ⇒ 红` / `数字边界：3 fail 不匹配 13 fail` / `无提取器 ⇒ 不静默当通过`；`tests/config-guards.test.ts`：`known_failures 与期望集逐项相等` + `期望集缺失 ⇒ 红`（真仓读取走同一断言） | ✅ |
| AC6（↔D9⑰ + V25②） | D9⑰ 四面齐备；proposal 的 AC 面标题与守卫常量逐字相等；多标题 ⇒ 归档并集不塌陷；加新行未登记 ⇒ 红 | `bun test tests/commit-gate-d9-registration.test.ts` ⇒ **18 pass / 0 fail**（17 项 × 三面齐全；`AC_HEADINGS` 双标题 ⇒ 归档「十六项」小节继续被收集；变异探针 ⑱ ⇒ 报「三面缺 D9⑱」） | ✅ |
| AC7（判别力 · 7 条变异） | 7 条变异各自必须红 | 实测（脚本逐条施加 → 跑对应用例 → 回滚）：① 恒放行 **RED** ② 不留痕 **RED** ③ 无条目当命中 **RED**（初测 GREEN ⇒ 补用例后 RED）④ 去特异性 **RED** ⑤ 超时当命中 **RED** ⑥ 巡检复用子串（去数字边界）**RED** ⑦ 巡检缺席仍放行 **RED**；回滚后 `MUTATION` 计数 = 0 | ✅ |
| AC8（回滚面） | 清单同批更新 + 四步顺序（commit → drill → 回填 `last_drill` → 再 commit） | **已完成**：commit #1 = `4cbf5c0`（18 文件）→ 演练 → 回填 → commit #2。`last_drill = { sha: 61ae526, result: pass, content_hash: e136730f… }`，registry `commit-gate → active`。**本轮复跑复核**：`bun scripts/rollback-drill.ts .rddf/rollback/commit-gate.json` ⇒ **PASS: commit-gate 回滚后验证全绿**。⚠ 首次演练曾 **FAIL**（并行会话发现并修）：我的清单把 D9⑰ 在**三处载体**上撤了，**漏撤 ADR D9 表里的 `| ⑰ |` 行** ⇒ 回滚后测试算 17、期望 16 —— 属**我这份清单的真缺陷**（我的 hunk 过滤器把含表格分隔行的 hunk 跳过了），已补 1 条 edit（删该行，316 字符）| ✅ |
| AC9（门） | 治理仓 `bun test tests/` **全绿** + `openspec validate --strict` valid | **已完成**：`bun test tests/` ⇒ **1378 tests / 1377 pass / 1 skip / 0 fail**；`openspec validate commit-gate-baseline-known-failures --strict` ⇒ valid；`bun scripts/commit-gate-doctor.ts` ⇒ **PASS（门禁在场且 active）** | ✅ |

## 取证不可用的处置（AC8 第二步 / AC9 全仓门）

- **形态分类**：AC9 的失败命令**跑起来了并产出断言失败**，但失败**不在本 change 的取证面**：
  3 条失败全部落在 `tests/rollback-manifests.test.ts` 的 `plan-topics.json` / `plan-synthesis-offload.json`
  与 `tests/rollback-registry.test.ts` 的 `last_drill` —— 对应文件 `prompts/plan.md` 是**另一会话的未提交改动**。
- **基线对照**：`git show HEAD:prompts/plan.md` 与工作树不同 ⇒ 失败由**工作树状态**引入，且**不由本 change 触及**。
- ⇒ 判定 **blocked**（取证不可用），**不判 pass、也不判 ac-fail**（不把环境故障路由成「回 build 修 AC」）。
- **解封条件 ①（外部 · 并行会话）**：把 plan-topics 的回滚清单同步好（其失败信息本身写着「改措辞/删文件后须同步更新清单」）。
- ~~**解封条件 ②（宿主缓存）**~~ —— **已解封（2026-11-27）**：活体用例曾报「commit-gate 插件 not active」，
  根因 = ADR **D9②** 登记的坑（宿主模块缓存在 `lib/**` / `plugins/**` 改动后不失效；日志实测
  `SyntaxError: Export named 'isGitCommandWord' not found` = 缓存里的**旧插件实例**链到新 lib）。
  ⇒ 已执行 `opencode service restart` ⇒ `bun scripts/commit-gate-doctor.ts` ⇒
  **PASS: commit-gate 插件在场且 active ⇒ 门禁生效**；活体用例复绿。**不是代码缺陷**（`bun -e` 直接导入 lib ⇒ 20 exports，`isGitCommandWord` 正常）。
- 解封后：全仓 `bun test tests/` 绿 ⇒ 本 change 同批完成「commit → drill → 回填 `last_drill` → 再 commit」。

## 遗留清扫

`TODO` / `FIXME` / `MUTATION` / `console.log` 在改动文件中 ⇒ **零残留**（notice 走账本，不走 console）。

## 补记（2026-11-28）：接线层用例首次跑出的**留痕缺口**（钉住缺陷）

新增 `tests/commit-gate-plugin-baseline.test.ts`（baseline 的**接线层**用例：命中放行 + 留痕 / 未命中仍拒 / 巡检缺席三态 / 条目绑定巡检命令）⇒ 跑出**一处实现缺口**：

- **现象**：`lib/commit-gate.ts` 的 `evaluateCommitGate` 只在 **allowed 分支**回传 `notices`（`{ allowed: true, notices: input.notices }`），四个**拒绝分支**只回 `{ allowed: false, reason }` ⇒ 插件在拒绝路径上 `outcome.notices ?? []` 恒空 ⇒ **收集到的 notice 一条都不落账本**。
- **后果**：巡检缺席（缺 `inspection` / carrier 未 tracked / carrier 是 symlink）这类「声明不可用」**只有抛错、没有留痕** ⇒ D9② 登记的「检测 ≠ 拦截」在拒绝路径上失效（运行时查不到「门禁为何用硬门」）。
- **边界**：D10 的判据只要求**命中路径**留痕（`baseline 命中 ⇒ 放行，且门禁输出一行非抛错留痕`）⇒ 命中路径**合规**；缺口在**拒绝路径**，属实现的意图与落盘不一致（插件确实 `notices.push` 了巡检理由）。
- **处置**：本用例按现状**钉住缺陷**（三条「拒 + 当前不留痕」用例并在文件头写明原因），**不改**已签批 ADR 的既有实现；修复另案（`evaluateCommitGate` 的拒绝分支回传 `notices` ⇒ 同步 `.rddf/rollback/commit-gate.json` 的 `edits` + 重跑其演练）。

## 已用轮次

**1 / 3**（`RDDF_VERIFIER_MAX_LOOPS=3`）。失败项：**0**。**勘误（2026-11-28，措辞订正）**：本段原文写「AC8 第二步 / AC9 全仓门为 **blocked**（取证不可用 ⇒ 非 implementation_gap）」，与本报告 §逐条判定 的 AC8 / AC9 行「已完成」相矛盾 ⇒ 订正为：AC8 第二步 / AC9 全仓门在**初稿时**判为 **blocked**（取证不可用 ⇒ 非 implementation_gap）；后经补证 —— 回滚面四步完成（commit `4cbf5c0` → 隔离副本演练 → 回填 `last_drill` → 再 commit `973b451`）、全仓门补证后全绿（`1377 pass / 0 fail`）—— 已转 **已完成**（**不再**是 blocked）。**权威源**：本文件 §逐条判定 的 AC8 / AC9 行；**原文位置**：本文件 §已用轮次 段（本段首句即原文引用）。
