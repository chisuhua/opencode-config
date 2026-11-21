# 欠账：`role-session-identity`

- **机制**：`role-session-identity`
- **决策记录**：`docs/adr/ADR-role-session-identity.md`
- **状态**：`unmanifested` —— 机制**在跑**、**回滚清单待写**（⚠ 这是**债**，不是豁免：机制真实存在且可退役，只是清单还没写）
- **为什么不现在写**：会话身份归一与 `role-aware-permissions` 同族；而后者的**教学面原生**（无回退基线）⇒ 本篇的退役清单无法独立成立。
- **清单要覆盖的落点**（五类）：代码（`lib/role-identity.ts` + `lib/role-lease.ts`）/ 文档（ADR + MAD）/ 守卫（`tests/role-identity.test.ts` 等）
- **锚点**（机制在跑 ⇒ `watch[]` 每条当前都存在）：`lib/role-identity.ts`
- **本文件的作用**：`ADR-rollback-manifest-enforcement` 的 **M7** 要求债指针**按机制命名且唯一**（`pending/<mechanism>.md`）⇒ 债**可见、可清账**（本文件即清账入口：写完清单后删本文件 + 把 registry 条目转 `active`）

> 参考：已完成的清单见 `.rddf/rollback/`（`commit-gate` / `plan-topics` / `plan-delegate` / `model-fallback`）。
