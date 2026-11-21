# rollback-drill-replace-pattern — `planDrill` 的替换文本被 `String.replace` 模式解释

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。
> 无 ADR：这是 `lib/rollback-drill.ts` 的**实现层缺陷**，不改 `ADR-rollback-manifest-enforcement` 的任何决策。
> ⚠ 缺陷在 **`planDrill` 的 edits 应用步骤**（`buf.replace(e.find, e.replace)`）；`applyDrill` 只是消费方
> （它落盘 `planDrill` 算出的 `after`）⇒ 按符号 grep 时请搜 `planDrill` 的 edit 循环。

## Why

`planDrill` 用 `buf.replace(e.find, e.replace)`（**字符串** replacement）把清单的 `edits[].replace` 落到文件内容上。JS 的 `String.prototype.replace(pattern, replacement)` 在 replacement 是字符串时会解释替换模式：

| 序列 | 被替换成 | 有判别力？ |
|---|---|---|
| `$&` | 匹配到的子串（即 `find`） | ✅ 静默改坏内容，drill 仍可能 PASS |
| `` $` `` | 匹配**前**的整段内容 | ✅ 通常令文件暴涨（结构坏掉 ⇒ 多会立刻红） |
| `$'` | 匹配**后**的整段内容 | ✅ 同上 |
| `$$` | 单个 `$` | ✅ 静默吞一个字符（真实代码片段里最常见） |
| `$1` / `$<x>` | 捕获组 | ❌ `find` 是字符串 pattern（无捕获组）⇒ 本就按字面保留 |

清单是**数据**，不是替换模式。`replace` 里出现前四类序列时，drill 写进文件的内容**不是**清单声明的文本；`$&` / `$$` 尤其危险 —— 它们不改变文件结构，**drill 会报 PASS**（验证跑的是被改坏的仓）。

**真实发生（起草阶段，不是事故）**：起草 G3 `role-class-write-set` 时，一条 edit 的 `replace` 需承载 `glob` 的转义正则（`/...$/g, "\\$&"`）⇒ 字符串 replacement 会把它改坏 ⇒ 当时改为**缩小 edit 粒度**（拆成更小的、replace 不含 `$` 的 edit）规避。规避有效，但代价是**回滚粒度被人为切碎**，且这条陷阱**没有任何作者可见的落点** —— 下一位作者不会知道「`replace` 不能含 `$&`」，要么继续绕开，要么写出静默失效的清单。

**现仓为何查不到现场**：规避后的最终清单里，`$&` / `` $` `` 只出现在 **`find`**（`role-class-write-set.json` / `plan-topics.json`）—— `find` 是字符串 pattern，**永不被解释** ⇒ 安全。这条「`find` 侧安全、`replace` 侧不安全」的不对称正是本项要钉的两个面（AC1 / AC3）。

## What Changes

1. **行为修复**（`lib/rollback-drill.ts`）：`buf.replace(e.find, e.replace)` ⇒ `buf.replace(e.find, () => e.replace)` —— 函数形式 replacement **不解析任何 `$` 模式**。
2. **作者可见的保证**（注销陷阱，这才是本项的产品面）：
   - `ManifestEdit.find` / `replace` 的 JSDoc 写明「`find` 是字符串 pattern」「`replace` 按字面写入，无需转义」；
   - `.rddf/rollback/README.md` 的「判据」段加同义的一条 bullet（清单作者读的那一页）。
3. **测试**（`tests/rollback-drill.test.ts`）：4 条 —— ① `replace` 含 `$&`/`` $` ``/`$'`/`$1` 逐字落盘；② `find` 含正则元字符 + `$&` 时按字面匹配；③ `planDrill.after` 与 `applyDrill` 落盘逐字一致（dry-run 同一条判据）；④ 空串 `replace` 仍删除该片段。

**Non-goal（明确不做）**：

- **不重写 G3 被切碎的 edit**。若将来碰 G3，可顺手恢复成自然粒度，核对方式 = `git show <引入 commit>:<path>` 对比原文（本项不改，登记为已知残留）。
- **不加转义 DSL**（`rawReplace` 字段 / `literal:` 前缀 / 自造 `\$\&`）—— 函数式 replacement 已是终点，再加一层 parser 是为已解决的问题造机制。
- **不加 manifest linter / AST 校验**：`replace` 是任意文本，不存在可校验的谓词（只会产出恒真判据）。
- **不重构 `planDrill` 的写入管线**（`byPath` 分组 / `replaceAll` / `String.raw`）—— 与本缺陷无关，且会动到「恰好 1 次」这条核心判据的载体。
- **不建常设 mutation-testing harness**：1 行修复的判别力验证是一次性留痕（见 AC 的「红证据」），不做常驻门禁。

## Acceptance

- **AC1（字面落盘）**：`replace` 含 `$&` / `` $` `` / `$'` / `$1` 时，目标文件逐字等于 `PRE + replace + POST`。
  **红证据**：撤掉修复（改回字符串 replacement）⇒ 该用例红（实测：变异 1 ⇒ 2 条红、其余 37 绿）。
- **AC2（不回归）**：`bun test tests/rollback-drill.test.ts` ⇒ **39 pass / 0 fail**（原有 36 条 + 新增 3 条）；未修改任何既有 `test()` 体。
- **AC3（`find` 侧不变量）**：`find = "a.*b [x] (y) $&"` 时按**字面**匹配。
  **红证据**：把 `buf.replace(e.find, …)` 改成 `new RegExp(e.find)` ⇒ 该用例红（实测：变异 2）。
- **AC4（dry-run 与 apply 同判据 + 空串）**：同一 fixture 下 `planDrill(...).writes[0].after` 逐字等于 `applyDrill` 落盘结果；`replace = ""` 时片段被删除。
  **红证据**：变异 1 下该用例红（`after` 与 `literal` 不等）。
- **AC5（清单不漂）**：`bun test tests/rollback-manifests.test.ts` 绿 ⇒ 8 份清单的 `find` 锚点在当前工作树仍恰好 1 次（含 README 新增的保证行不落在任何 `find` 范围内）。
- **AC6（陷阱已注销）**：`lib/rollback-drill.ts` 的 `ManifestEdit.replace` JSDoc 与 `.rddf/rollback/README.md` 的判据段都含「按字面」表述 ⇒ 作者从代码或清单文档任一入口都能读到该保证。

## Capabilities

- **无新依赖**：只改一行实现（字符串 replacement → 函数 replacement）+ 注释 / 文档。
- **无 API 变更**：`parseManifest` / `planDrill` / `applyDrill` / `DrillError` 的签名与错误码不变；`ManifestEdit` 字段不变。
- **无 schema 变更**：`replace` 仍是字符串，只是从此可安全承载任意文本。
- **不进 registry**：缺陷修复不产生新「机制」（无独立 ADR）；registry 是机制登记表，不是 bug 表。
- **无新判据载体**：不新增 linter / parser / harness（见 Non-goal）。

## Impact

- **正面**：清单作者不再需要知道「`replace` 不能含 `$` 序列」；`$&` / `$$` 这类在真实代码片段里常见的序列可直接承载，不必切碎 edit 粒度。陷阱从「口口相传」变成「JSDoc + README 两处明文」。
- **代价 / 已知残留**：G3 为规避陷阱而**切碎过 editorial 粒度** —— 本项不恢复（non-goal）。核对方式留档：若将来碰 G3，用 `git show <引入 commit>:<path>` 还原自然粒度并重跑 drill。
- **风险**：仅当既有清单**依赖** `$` 展开时才受影响。核查（可复现）：遍历 `.rddf/rollback/*.json` 的 `edits[]`，`replace` 内零命中 `$&` / `` $` `` / `$'` / `$$`；`find` 内有 2 处命中（`role-class-write-set` / `plan-topics`）但 `find` 侧本就安全 ⇒ 无清单依赖该行为。修复前后各跑一次 `planDrill` 全清单的 `after` 结果一致（AC5 的守卫 + 上面这条遍历）。
- **判别力边界（必须写清）**：drill 的 PASS 只证明「验证命令绿」，**不**证明「落盘字节 == 作者意图」—— 那是 U1 的语义面。本项只闭合「按字面落盘」这一**机械面**；别把 AC4/AC5 读成保真证明。
