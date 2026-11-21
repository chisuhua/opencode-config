# 欠账：`delegate-delivery-evidence`

- **机制**：`delegate-delivery-evidence`
- **决策记录**：`docs/adr/ADR-delegate-delivery-evidence.md`
- **状态**：`unmanifested` —— 机制**在跑**、**回滚清单待写**（⚠ 这是**债**，不是豁免：机制真实存在且可退役，只是清单还没写）
- **为什么不现在写**：outcome 枚举与 `delegate-base-channel` 的 `unverified` 口径联动（实测两篇的 brief 字段交叉）⇒ 退役面需一并定。
- **清单要覆盖的落点**（五类）：同上（outcome 枚举子集）
- **锚点**（机制在跑 ⇒ `watch[]` 每条当前都存在）：`lib/delegate-core.ts`
- **本文件的作用**：`ADR-rollback-manifest-enforcement` 的 **M7** 要求债指针**按机制命名且唯一**（`pending/<mechanism>.md`）⇒ 债**可见、可清账**（本文件即清账入口：写完清单后删本文件 + 把 registry 条目转 `active`）

> 参考：已完成的清单见 `.rddf/rollback/`（`commit-gate` / `plan-topics` / `plan-delegate` / `model-fallback`）。
