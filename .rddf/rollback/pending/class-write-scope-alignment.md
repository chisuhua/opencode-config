# 欠账：`class-write-scope-alignment`

- **机制**：`class-write-scope-alignment`
- **决策记录**：`docs/adr/ADR-class-write-scope-alignment.md`
- **状态**：`unmanifested` —— 机制**在跑**、**回滚清单待写**（⚠ 这是**债**，不是豁免：机制真实存在且可退役，只是清单还没写）
- **为什么不现在写**：写集口径散在 3 份 prompt 的选类表 + `lib/role-policy.ts` 的 `classAllowRoots` ⇒ 退役面要同时覆盖「配置投影」与「守卫断言」两套面。
- **清单要覆盖的落点**（五类）：代码（`lib/role-policy.ts`）/ prompt（3 份的选类表）/ 文档（父篇 ADR）/ 守卫（class-write 投影守卫）
- **锚点**（机制在跑 ⇒ `watch[]` 每条当前都存在）：`lib/role-policy.ts`
- **本文件的作用**：`ADR-rollback-manifest-enforcement` 的 **M7** 要求债指针**按机制命名且唯一**（`pending/<mechanism>.md`）⇒ 债**可见、可清账**（本文件即清账入口：写完清单后删本文件 + 把 registry 条目转 `active`）

> 参考：已完成的清单见 `.rddf/rollback/`（`commit-gate` / `plan-topics` / `plan-delegate` / `model-fallback`）。
