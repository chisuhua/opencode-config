# 验收报告 — rollback-manifest-find-narrowing（第 1 轮）

> **判据来源**：`openspec/changes/rollback-manifest-find-narrowing/proposal.md` 的 `## 验收标准` 表（AC1–AC15，唯一真源）。
> **验收角色**：build agent（general 通用模式）的自查 —— ⚠ 不是独立 verifier 会话。
> **判定**：**`needs-revision`** —— **AC3 部分未完成**（见 §2），其余 14 条通过。
> **已用轮次**：1 / 3。

## 1. 逐条判定

| AC | 判定 | 工具证据 |
|---|---|---|
| **AC1** 形态守卫 + 基线表 | ✅ | `tests/rollback-manifests.test.ts` = **36 pass / 0 fail**；`MAX_FIND_LEN = 2894` 为测试常量；`FIND_SHAPE_BASELINE` **8 项**（阶段 1 过渡态，含 `governance-paths-config: sep2/pipe2/maxLen12768`） |
| **AC2** 判别力 | ✅ | 5 条 fixture 用例（纯函数 `findShapeViolations`，不触真仓）：含分隔行 ⇒ 红 / 避开分隔行但覆盖多行 ⇒ pipe 闸红 / pipe 上限 0 时单条即红 / 基线下调 ⇒ 红 / 超长 ⇒ 红 |
| **AC3** 拆三条大 `find` | ❌ **部分** | `edits[13]`（2914）**已拆**成 2 条链式 edit（472 + 43 字符，语义保持性核对通过）；**`edits[11]`（12768，`tests/config-guards.test.ts` 的治理面守卫 describe）与 `edits[14]`（2657，治理面作用域表）未拆** ⇒ 该清单仍超 `MAX_FIND_LEN` ⇒ 仍需留在基线表内 |
| **AC4** 解 pin 实效 | ✅ | 改 `prompts/build.md` general 行「禁止」列散文 ⇒ `bun test tests/rollback-manifests.test.ts` **退出码 0（绿）**；变异后工作树逐字恢复（脚本 `/tmp/opencode/negative-checks.py`） |
| **AC5** 可还原性 | ✅ | `bun scripts/rollback-drill.ts .rddf/rollback/governance-paths-config.json` = **PASS（回滚后 `bun test tests/` 全绿）**；`bun scripts/rollback-registry.ts` = PASS（14 active / 0 proving / 3 exempt） |
| **AC6** 清单+全量 | ✅ | `tests/rollback-manifests.test.ts` 绿；`bun test tests/` = **1168 pass / 1 skip / 0 fail** |
| **AC7** 8 清单 check list | ✅ | `tasks.md` 的 A6 段表格逐行登记（含 `commit-gate.json` 已达标 ⇒ 移出基线表） |
| **AC8** 渲染器 | ✅ | `renderWriteSetBlock(role)` 从 `ROLE_WRITE_POLICY` 渲染；`verifierWriteSetBlock()` **输出逐字不变**（marker + allow + owns，新增用例断言旧块不含 `role-write-set:`） |
| **AC9** 6 块落盘 | ✅ | 6 块逐字等于渲染输出、各**恰好 1 处**；三种特殊形态正确（`builder`/`general` ⇒ `allow: **`；`no-role` ⇒ `allow: (none)` + `denyAll: true`） |
| **AC10** 断言族 | ✅ | `tests/config-guards.test.ts` 新增 describe = **152 pass / 0 fail**（6 角色逐个：逐字 / 恰好 1 处 / 标记独占一行） |
| **AC11** 负向验证 | ✅ | 三条全红：改真源（architect allow 加路径）/ 手改块内一字符 / 多复制一份块；恢复后回归绿 |
| **AC12** 允许列去复述 | ✅ | 角色表 6 行允许列逐行解析 ⇒ 写集路径字面 **0 命中**；表尾投影的写集复述已删（保留两条非写集事实）；⚠ **判据范围已修正**为「允许列」（原「节内 grep」按字面恒红 —— 禁止列的 `.rddf/state/verifier/*` 是 skill owns 的正当提及） |
| **AC13** 真源不动 + 相等守卫 | ✅ | `git diff lib/role-policy.ts` = 空；AC16 绿；新增 deep-equal 用例（`ROLE_WRITE_POLICY.verifier.allow` vs `VERIFIER_ALLOW_ROOTS`） |
| **AC14** 全量 + anchors | ✅ | `bun test tests/` 1168 pass / 0 fail；`check-upstream-anchors.sh` = OK（29/29） |
| **AC15** 段 C 账本 | ✅ | `rollback-drill-replace-pattern.md` 状态行标「已实施」+ 四处实测指针；README:47 命中；`rollback-drill.test.ts` = 39 pass |

## 2. 失败项与路由

| 失败项 | 类别 | 证据 | 路由 |
|---|---|---|---|
| **AC3**：`edits[11]`（12768）/ `edits[14]`（2657）未拆 | `implementation_gap` | 两条 find 仍在清单里（长度超 `MAX_FIND_LEN=2894`） | 回 builder 补做；**本 change 不归档** |

**残留的具体工作量**（供下一轮直接接手）：

1. `edits[11]`（`tests/config-guards.test.ts`，12768）：回滚语义 = **删除整个「治理面路径清单配置化守卫族」describe**（原 replace 是 85 字符前缀 + 空）。拆法 = 按 `test(...)` 逐条拆（每条 find = 一个 test 块，replace = `""`）；每条须 ≤ 2894、`sep=0`、`pipe≤1`、在当前文件里唯一。
2. `edits[14]`（`prompts/build.md`，2657）：回滚语义 = 治理面作用域表的 3 行被替换。拆法 = 每行 1 条（3 条），每条 `pipe=1` 合规。
3. 两条都拆完 ⇒ 从 `FIND_SHAPE_BASELINE` **移除** `governance-paths-config.json` 项 ⇒ 终态 **7 项**（= AC1）⇒ 该清单适用全局硬上限。
4. 拆完后按 ADR D5 两段式：撤 `last_drill` + registry 转 `proving` ⇒ 演练 ⇒ 回填 + 转 `active`。

## 3. 遗留清扫

| 项 | 状态 |
|---|---|
| TODO / FIXME / 半截实现（改动文件内） | 0（`grep` 零命中） |
| 临时调试日志 / `.only` / `.skip` | 0 |
| 未替换的 mock | 不适用（无 mock） |
| 一次性工具脚本 | 均在 `/tmp/opencode/`（`t0-survey.py` / `find-diff.py` / `apply-split13.py` / `negative-checks.py` / `two-phase-step1.py` / `two-phase-step2.ts` / `tick-tasks.py` / `finish-tick.py` / `finish-step2.py` / `add-couple-edits.py`）⇒ **未入仓** |
| **未完成的判据** | **AC3**（已在上表逐条登记，未静默遗留） |
| `tasks.md` 未勾项 | A3（AC3）/ D3（本报告）/ D4（归档 —— **AC3 未完成 ⇒ 不得归档**） |

## 4. 附带发现（登记，不在本轮修）

- **段 B 与治理面清单配置化的客观耦合**：迁移前 `ROLE_WRITE_POLICY.architect.allow` 只有两项、迁移后多 `.rddf/config/governance-paths.json` ⇒ 回滚该机制会改真源 ⇒ 段 B 的 architect 块必然失配。处置 = 段 B 的产物（architect 块 / 6 角色断言族 / 渲染器单测）纳入同一回滚清单一起退役（e3/e4/e5）。**这不是设计失误**（耦合是真实的），已在清单 notes 与 CHANGELOG 里写明。
- **`MAX_FIND_LEN` 与 e4/e5 的长度冲突**：两块的 find 原本 2958 / 2954（超 2894）⇒ 压缩了冗余注释（都在未 pin 的文本内）⇒ 落回上限内。⚠ 提示：若将来给这两处加注释，须同时检查是否再次超限。
