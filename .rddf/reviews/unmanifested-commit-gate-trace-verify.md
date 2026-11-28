# verify: unmanifested-commit-gate-trace（U7b）

> **验收对象**：治理仓实现（提交 `873c71c` + 回滚面 `c14358d` / `3d605dd`）
> **判据来源**：`openspec/changes/unmanifested-commit-gate-trace/proposal.md` 的 AC1–AC7
> **决策真源**：ADR `D3`（未声明 ⇒ 不设门禁，**不改**）+ `D6`（坏声明 ⇒ fail-closed，**不改**）+ `D9②` 先例

## 逐条判定

| AC | 判据 | 证据 | 判定 |
|:--:|---|---|:--:|
| AC1 | 未声明仓 ⇒ 放行 + 账本 `未声明` 行 | `tests/commit-gate-undeclared-trace.test.ts`（4+1 例；`readDeclarationOrError` + `noticeLineForUndeclared` + 真实临时仓写账本） | ✅ |
| AC2 | 声明解析失败 ⇒ 账本 `声明不可用` 行 + **照旧拒**（D6） | 同文件（断言文案含 `声明不可用`、**不含** `未声明 ⇒`；插件分支保留 `throw`） | ✅ |
| AC3 | 写不进账本 ⇒ 仍放行 + 不抛错 | 同文件（账本路径被建成**目录** ⇒ `appendNotice` 不抛） | ✅ |
| AC4 | 已声明且合法 ⇒ 无该留痕（不误报） | 同文件（合法声明 ⇒ `decl != null` 且 **账本不存在**） | ✅ |
| AC5 | D9⑱ 四面齐备 + 计数 18 | `bun test tests/commit-gate-d9-registration.test.ts` ⇒ 18 项 × 三面齐全；ADAPTER 多标题兼容 ⇒ 归档载体继续有效 | ✅ |
| AC6 | 变异：留痕短路 ⇒ AC1 红；写失败抛错 ⇒ AC3 红 | 实测两条均 **RED**，回滚后全绿；`MUTATION` 残留 0 | ✅ |
| AC7 | 全仓绿 + 回滚面 | `bun test tests/` ⇒ **1392 tests / 0 fail**；清单按 base `4cbf5c0~1` 重建（⑰/⑱ **行级**回滚 + 措辞）⇒ `rollback-drill` ⇒ **PASS** ⇒ 回填 `last_drill`（`c14358d`）⇒ registry `commit-gate → active`；`bun scripts/rollback-registry.ts` ⇒ **PASS**（census: 15 active / 0 proving） | ✅ |

## 关键实现

- `plugins/commit-gate.ts`：`readDeclaration` 后分两条路 —— ①`decl === null`（未声明）⇒ 留痕 + **放行**（D3）；
  ②`error` 非空（声明不可用）⇒ 留痕 + **照旧拒**（D6，坏的声明 ≠ 未声明）；文案单一真源 `noticeLineForUndeclared`。
- 留痕**尽力而为**（`appendNotice` 的 try/catch），写不进 ⇒ 静默，**绝不影响判定**。
- **D9⑱**：ADR 表 + 测试注释 + MAD §2.8.8 + 本 change 的 AC 面（四载体）；计数 17 → 18。

## 回滚面教训（本轮再次实证）

首次 `rollback-drill` **FAIL**：清单把 ADR/MAD 的**措辞**改了回来（十八项 → 十六项），但 **⑰/⑱ 两个表格行**没撤
⇒ 回滚后「ADR 17 行 vs 测试期望 16 行」⇒ 红。
根因：**连续两行的表格行**落在同一个 hunk 里 ⇒ 我的「单行」过滤器整块跳过。
⇒ 修法：⑰/⑱ 行各自作为**显式单行 edit**（`find = 行原文`、`replace = ""`）⇒ 演练 PASS。
⇒ **规则（第二次登记）**：回滚清单里**表格行必须逐行**给 edit，不能依赖 hunk 或整段。

## 环境性 / 已知

- 宿主模块缓存：改过 `plugins/**` ⇒ 必须 `opencode service restart`（本轮已执行；doctor **PASS**）。
- `iteration.json` 的 `tasks_done` 类陈旧（本仓不用该机制）。

## 已用轮次

**1 / 3**。失败项：**0**。
