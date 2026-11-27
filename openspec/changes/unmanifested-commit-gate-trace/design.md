# design: unmanifested-commit-gate-trace

> 判据真源：`proposal.md` 的 `## 验收标准`（AC1–AC7）。**不改** ADR D3 / D2 的任何判定。

## D-1 钩子点：`readDeclaration` 之后、判定之前

`plugins/commit-gate.ts` 现状：`const { decl, error } = readDeclaration(workRoot)` ⇒ 未声明时 `decl === null`
⇒ `evaluateCommitGate` 直接放行（`if (!input.declaration) return { allowed: true }`）。

⇒ 在拿到结果后插入**留痕**（只写账本，**不改** `decl`、**不 throw**）：

```ts
if (decl === null) {
  appendNotice(workRoot, `未声明 ⇒ 三判据不设门禁（ADR D3）${error ? ` · ${error}` : ""}`)
  // 注意：解析失败也走到这里（readDeclaration 返回 error + decl=null）⇒ 同一条留痕路径
}
```

⚠ **两条路径的判定不同**：
- 未声明（`decl === null` 且 `error` 为空）⇒ 留痕 + **放行**（D3）；
- 声明存在但**解析失败**（`error` 非空）⇒ 留痕 + **照旧拒**（**D6 fail-closed 不变** —— 坏的声明 ≠ 未声明）。
⇒ 文案前缀：`error` 非空 ⇒ `声明不可用`；否则 `未声明`（AC1 / AC2 分别断言）。

## D-2 尽力而为（AC3）

`appendNotice` 已有 try/catch（写失败 ⇒ 静默）。本 change 只**复用它**，并加一条用例：
把账本父路径变成**不可写**（如把 `.rddf/state/commit-gate-notices.jsonl` 建成**目录**）⇒ 仍必须放行、不抛错。

## D-3 D9⑱（治理面）

| 面 | 落点 |
|---|---|
| 真源 | ADR D9 表 ⑱ 行（「未声明仓的留痕是尽力而为」+ 防什么 / 不防什么 / 缓解） |
| 测试注释 | `tests/commit-gate-d9-registration.test.ts` 的 JSDoc 加 ⑱ 行 |
| 主题文档 | `docs/MULTI-AGENT-DESIGN.md` §2.8.8 加 ⑱ 行 |
| AC 面 | 本 change 的 `proposal.md`（已含） |

⚠ 计数 17 → 18；**多标题兼容**（U8 已落地）⇒ 既有归档载体继续有效。

## D-4 回滚面

`plugins/commit-gate.ts` 已在 `delete` 里（整文件回滚）⇒ 无需 edits；新测试文件入 `delete`；
ADR / MAD 的小锚点入 `edits`；清单改动 ⇒ **撤 `last_drill` + registry 退 `proving`** → commit → 演练 → 回填 → commit。

## D-5 不做什么

- **不**拦截未声明仓的 commit（D3 明文决策）；
- **不**改 D2 三判据；**不**改 D9①–⑰；
- **不**因留痕失败而拒提交；**不**在记账失败时抛错；
- **不**新增账本文件（复用 `.rddf/state/commit-gate-notices.jsonl`）。
