# rollback-drill-replace-pattern — `applyDrill` 的替换文本被 `String.replace` 模式解释

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。
> 无 ADR：这是 `lib/rollback-drill.ts` 的**实现层缺陷**，不改 `ADR-rollback-manifest-enforcement` 的任何决策。

## Why

`planDrill` 用 `buf.replace(e.find, e.replace)`（`lib/rollback-drill.ts:447`）把清单的 `edits[].replace` 落到文件内容上。JS 的 `String.prototype.replace(pattern, replacement)` 在 `replacement` 是**字符串**时会解释替换模式：

| 序列 | 被替换成 |
|---|---|
| `$&` | 匹配到的子串（即 `find`） |
| `` $` `` | 匹配**前**的整段内容 |
| `$'` | 匹配**后**的整段内容 |
| `$n` / `$<name>` | 捕获组（无捕获组时按引擎保留字面） |

清单是**数据**，不是替换模式。`replace` 里出现这些序列时，drill 写进文件的内容**不是**清单声明的文本 ⇒ 回滚结果被静默扭曲（drill 自己仍会报 PASS，因为验证命令跑的是一份被改坏的仓）。

**已实测发生**：G3 `role-class-write-set`（126 条 edits）里有两处 `replace` 需要承载 `$&`（`glob` 的转义正则）与 `` $` ``（`` new RegExp(`^${escaped}$`) ``）⇒ 当时的清单只能**改写措辞绕开**这两个序列。绕开是可行的，但那是**未登记陷阱**：下一位作者写清单时不会知道「`replace` 不能含 `$&`」。

## What Changes

1. `lib/rollback-drill.ts`：`buf.replace(e.find, e.replace)` ⇒ `buf.replace(e.find, () => e.replace)` —— 函数形式的 replacement **不解析任何 `$` 模式**，`replace` 按字面落盘。
2. `tests/rollback-drill.test.ts`：新增一条 `applyDrill` 负向用例 —— `replace` 含 `$&` / `` $` `` / `$'` / `$1` 时，写盘内容必须**逐字**等于 `replace`（当前实现下该用例红）。
3. 不改清单格式、不改 `find` 唯一性判据、不改 `retire[]` 语义 —— 缺陷只在「替换结果如何落盘」这一步。

## Acceptance

- **AC1（判别力）**：`applyDrill` 在 `replace = "A$&B$`C$'D$1E"` 时，目标文件内容逐字含该串（不得出现 `find` 的原文、匹配前文或匹配后文）。当前实现下此断言必红。
- **AC2（不回归）**：`bun test tests/` 全绿；`tests/rollback-drill.test.ts` 既有 34 条用例语义不变（`countOccurrences` / `find` 唯一性 / 部分应用禁止 / `retire[]` 六约束）。
- **AC3（真仓清单不受影响）**：`tests/rollback-manifests.test.ts` 仍绿（每份清单的 `planDrill` 在当前工作树可执行）。
- **AC4（历史清单可回滚）**：G3 清单（`role-class-write-set.json`）与 L2 自身清单仍 `bun scripts/rollback-drill.ts <清单>` PASS —— 修复不改变既有清单的语义（它们绕开 `$` 只是**不再必要**，不是**必需**）。

## Capabilities

- **无新依赖**：只改一行实现（字符串 replacement → 函数 replacement）。
- **无 API 变更**：`parseManifest` / `planDrill` / `applyDrill` / `DrillError` 的签名与错误码不变。
- **无 schema 变更**：`ManifestEdit.replace` 仍是字符串，只是从此可以安全承载任意文本。
- **不进 registry**：缺陷修复不产生新「机制」（无独立 ADR）；registry 是机制登记表，不是 bug 表。

## Impact

- **正面**：清单作者不再需要知道「`replace` 不能含 `$&` / `` $` `` / `$'` / `$1`」这条隐性约束；未来清单可直接承载含这些序列的真实代码片段。
- **代价**：无。函数式 replacement 与字符串 replacement 在**不含** `$` 序列时行为完全相同；含这些序列时行为从「被解释」变为「按字面」——这正是清单语义。
- **风险**：若**既有**清单的 `replace` 依赖了 `$` 模式（即刻意利用这个解释行为），修复会改变其结果。核查结论：本仓现存 10 份清单的 `replace` 全部是**字面文本**，无人依赖该行为（G3 反而是被它逼着绕开）⇒ 风险为零。
- **已知边界（不改）**：`planDrill` 的 `countOccurrences` 用 `indexOf`（不受影响）；`retire[]` 段用 `JSON.stringify` 重写 registry（不走 replace）⇒ 缺陷面仅 `edits[]` 这一处，已单点修复。
