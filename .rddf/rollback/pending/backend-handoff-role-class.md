# 欠账：`backend-handoff-role-class`

- **机制**：`backend-handoff-role-class`
- **决策记录**：`docs/adr/ADR-backend-handoff-role-class.md`
- **组**：**G3 role-class-write-set** —— 与同组机制**不可拆**（内核耦合）⇒ 退役必然连带全组 ⇒ 一份**组清单**覆盖全组
- **状态**：`unmanifested` —— 机制**在跑**、**回滚清单待写**（⚠ 这是**债**，不是豁免：机制真实存在且可退役，只是清单还没写）
- **为什么不现在写**：`role_class` 增量跨 **19 个文件**（`lib/delegate-core.ts` 64 处、`tests/delegate-core.test.ts` 58 处）⇒ 其「回滚口径」是**运行期用法**（停传字段），不是代码/文档回退 ⇒ 不能直接写成清单。
- **清单要覆盖的落点**（五类）：配置（无独立放行项）/ 代码（`lib/delegate-core.ts` 的 brief 校验 + `lib/role-policy.ts` 的 `classAllowRoots`）/ prompt（3 份的选类表）/ 文档（`docs/backend-handoff-role-class.md`）/ 守卫（role-class 投影守卫 + `tests/delegate-core.test.ts`）
- **锚点**（机制在跑 ⇒ `watch[]` 每条当前都存在）：`lib/role-policy.ts`
- **本文件的作用**：`ADR-rollback-manifest-enforcement` 的 **M7** 要求债指针**按机制命名且唯一**（`pending/<mechanism>.md`）⇒ 债**可见、可清账**（本文件即清账入口：写完清单后删本文件 + 把 registry 条目转 `active`）

> 参考：已完成的清单见 `.rddf/rollback/`（`commit-gate` / `plan-topics` / `plan-delegate` / `model-fallback`）。
