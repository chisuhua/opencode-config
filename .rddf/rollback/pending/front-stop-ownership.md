# 欠账：`front-stop-ownership`

- **机制**：`front-stop-ownership`
- **决策记录**：`docs/adr/ADR-front-stop-ownership.md`
- **状态**：`unmanifested` —— 机制**在跑**、**回滚清单待写**（⚠ 这是**债**，不是豁免：机制真实存在且可退役，只是清单还没写）
- **为什么不现在写**：归属与槽位释放（claim_gen / 归属版本）被 `front-cancel-release` 部分取代（D2/S9/D3⑩）⇒ 退役面需三篇一起定。
- **清单要覆盖的落点**（五类）：同上（归属/槽位子集）
- **锚点**（机制在跑 ⇒ `watch[]` 每条当前都存在）：`lib/role-lease.ts`
- **本文件的作用**：`ADR-rollback-manifest-enforcement` 的 **M7** 要求债指针**按机制命名且唯一**（`pending/<mechanism>.md`）⇒ 债**可见、可清账**（本文件即清账入口：写完清单后删本文件 + 把 registry 条目转 `active`）

> 参考：已完成的清单见 `.rddf/rollback/`（`commit-gate` / `plan-topics` / `plan-delegate` / `model-fallback`）。
