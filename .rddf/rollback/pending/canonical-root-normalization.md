# 欠账：`canonical-root-normalization`

- **机制**：`canonical-root-normalization`
- **决策记录**：`docs/adr/ADR-canonical-root-normalization.md`
- **状态**：`unmanifested` —— 机制**在跑**、**回滚清单待写**（⚠ 这是**债**，不是豁免：机制真实存在且可退役，只是清单还没写）
- **为什么不现在写**：`canonical_root` 决定 `pair.json` / `ledger.jsonl` / `role.json` 的落盘基准 ⇒ 与 `role-session-identity` 强耦合；且本篇 ADR 的 Status 写「未实施」而其 change 实际已归档（口径待订正）⇒ 先订正再写清单。
- **清单要覆盖的落点**（五类）：代码（`lib/delegate-core.ts::canonicalRoot`）/ 文档（ADR + MAD）/ 守卫（`tests/canonical-root.test.ts` + `tests/delegate-core.test.ts`）
- **锚点**（机制在跑 ⇒ `watch[]` 每条当前都存在）：`tests/canonical-root.test.ts`、`lib/delegate-core.ts`
- **本文件的作用**：`ADR-rollback-manifest-enforcement` 的 **M7** 要求债指针**按机制命名且唯一**（`pending/<mechanism>.md`）⇒ 债**可见、可清账**（本文件即清账入口：写完清单后删本文件 + 把 registry 条目转 `active`）

> 参考：已完成的清单见 `.rddf/rollback/`（`commit-gate` / `plan-topics` / `plan-delegate` / `model-fallback`）。
