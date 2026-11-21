# 欠账：`front-cancel-release`

- **机制**：`front-cancel-release`
- **决策记录**：`docs/adr/ADR-front-cancel-release.md`
- **组**：**G1 delegate-slot-kernel** —— 与同组机制**不可拆**（内核耦合）⇒ 退役必然连带全组 ⇒ 一份**组清单**覆盖全组
- **状态**：`unmanifested` —— 机制**在跑**、**回滚清单待写**（⚠ 这是**债**，不是豁免：机制真实存在且可退役，只是清单还没写）
- **为什么不现在写**：部分取代 `front-multi-backend` / `front-stop-confirmation` / `front-stop-ownership` 三篇 ⇒ 单独退役它会让另外三篇的「已被取代」条款悬空。
- **清单要覆盖的落点**（五类）：同上（cancel 放行子集）
- **锚点**（机制在跑 ⇒ `watch[]` 每条当前都存在）：`lib/delegate-async.ts`
- **本文件的作用**：`ADR-rollback-manifest-enforcement` 的 **M7** 要求债指针**按机制命名且唯一**（`pending/<mechanism>.md`）⇒ 债**可见、可清账**（本文件即清账入口：写完清单后删本文件 + 把 registry 条目转 `active`）

> 参考：已完成的清单见 `.rddf/rollback/`（`commit-gate` / `plan-topics` / `plan-delegate` / `model-fallback`）。
