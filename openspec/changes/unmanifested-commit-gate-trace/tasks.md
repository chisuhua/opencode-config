# tasks: unmanifested-commit-gate-trace

> TDD 5 步/task；`- [ ]` 在实施时勾选。判据真源 = `proposal.md` 的 AC1–AC7。

## Task 1 — 未声明 / 声明不可用 ⇒ 留痕（AC1 + AC2）

- [ ] **Step 1（红）** 新增 `tests/commit-gate-undeclared-trace.test.ts`：未声明仓 ⇒ 放行 + 账本含 `未声明`；
      声明解析失败 ⇒ 账本含 `声明不可用` **且照旧被拒**（D6）⇒ 修复前红。
- [ ] **Step 2（绿）** `plugins/commit-gate.ts`：`decl === null` ⇒ `appendNotice`（按 `error` 区分文案）。
- [ ] **Step 3** 同文件补用例：**已声明且合法** ⇒ 账本**不新增**该两行（不误报）。
- [ ] **Step 4** `bun test tests/commit-gate-undeclared-trace.test.ts` 全绿。
- [ ] **Step 5** 清理：留痕只在 `appendNotice` 一处（不复制写盘逻辑）。

## Task 2 — 尽力而为（AC3）

- [ ] **Step 1（红）** 同文件：把账本路径建成**目录**（写不进）⇒ commit **仍放行** + **不抛错**。
- [ ] **Step 2（绿）** 确认 `appendNotice` 的 try/catch 覆盖（失败静默）。
- [ ] **Step 3** 同文件补用例：`.rddf/state/` 不存在 ⇒ 自动创建后写入（正常路径）。
- [ ] **Step 4** `bun test tests/commit-gate-undeclared-trace.test.ts` 全绿。
- [ ] **Step 5** 清理。

## Task 3 — D9⑱ 四面登记（AC5）

- [ ] **Step 1** ADR D9 表加 ⑱ 行 + 「十七项 → 十八项」措辞；MAD §2.8.8 加 ⑱ 行；
      `tests/commit-gate-d9-registration.test.ts` JSDoc 加 ⑱ 行 + 计数 17 → 18。
- [ ] **Step 2** `bun test tests/commit-gate-d9-registration.test.ts` ⇒ 18/18 覆盖、绿。
- [ ] **Step 3** 变异探针改用**未登记** id（⑲）⇒ 报「三面缺 D9⑲」。
- [ ] **Step 4** 全绿。
- [ ] **Step 5** 清理。

## Task 4 — 变异腿（AC6）+ 回滚面（AC7）

- [ ] **Step 1** 留痕短路为 no-op ⇒ AC1 必须红。
- [ ] **Step 2** 「写不进」改为抛错 ⇒ AC3 必须红。
- [ ] **Step 3** 回滚清单：新测试入 `delete`；ADR / MAD 小锚点入 `edits`；撤 `last_drill` + registry 退 `proving`。
- [ ] **Step 4** commit → `rollback-drill commit-gate.json` ⇒ PASS → 回填 `last_drill` + 转回 `active` → commit。
- [ ] **Step 5** `bun test tests/` 全绿 + `bun scripts/commit-gate-doctor.ts` ⇒ PASS（**改过 plugins/** ⇒ 必须 `opencode service restart`**）。
