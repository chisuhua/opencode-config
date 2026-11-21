# G1 `delegate-slot-kernel` 清单演练受阻 —— `design_drift` 记录

> 发现者：builder（`rdd-builder` 路径）；日期：2026-11-21
> 阻塞对象：清存量债 G1（`front-multi-backend` / `front-stop-confirmation` /
> `front-stop-ownership` / `front-cancel-release`）
> 结论：**不是清单 bug，是 L2 机制（`ADR-rollback-manifest-enforcement`）的判据缺口** ⇒ 需改已签批 ADR 的决策 ⇒ 交 architect。

## 1 现象

`bun scripts/rollback-drill.ts .rddf/rollback/delegate-slot-kernel.json` 在 HEAD `7b99eb0` 上红 2 条：

```
[M7] front-stop-confirmation：watch 路径不存在（机制已不在跑 ⇒ 重新定性）：lib/delegate-async.ts
[M7] front-cancel-release：watch 路径不存在（机制已不在跑 ⇒ 重新定性）：lib/delegate-async.ts
```

清单（delete 4 / edits 35）的其余落点全部应用成功，套件其余部分（876 pass / 15 skip）。

## 2 取证：把条目临时置 `active` 后同一份清单全绿

隔离 clone（`git clone --no-hardlinks`，未触碰真实仓）里：① 4 条 registry 条目 → `active`；
② 清单回填合成 `last_drill`（`content_hash` 用真实 `contentHash()`）；③ `applyDrill` + `bun test tests/`：

```
877 pass
15 skip
0 fail
exit: 0
```

⇒ 缺口**只**在 `proving` 阶段的 watch 存在性检查。

## 3 根因（两点，缺一不可）

1. **`proving` 要求 watch 每条当前存在**：`lib/rollback-registry.ts:439-446`。
   G1 清单的退役面就是删 `lib/delegate-async.ts`，而
   `front-stop-confirmation` 的 watch 恰是它（`front-cancel-release` 同）⇒ 清单执行后
   「机制已不在跑」，与 `proving` 的自称矛盾 ⇒ M7 红。
   `active` 分支**不查 watch**（`:454-479`）⇒ 只有过渡态撞墙。
2. **清单无法表达「把条目转 `retired`」**：清单唯一手段是 `find/replace`，而 `find`
   必须逐字锚定条目的当前状态（`"state": "proving"` / `"active"`）；状态随证据流转
   ⇒ **状态自指**（ADR 第 128 行已为 Status 行记过同类陷阱）。实测：上一版把 `find`
   锚在 `proving` 形态，回填证据转 `active` 后 `find` 命中 0 次 ⇒ 漂移守卫红。

## 4 影响面

| 组 | 成员 watch | 清单是否删 watch 目标 | `proving` 阶段可 drill？ |
|---|---|---|---|
| **G1** `delegate-slot-kernel` | `delegate-async.ts` / `role-lease.ts` / `delegate.ts` / `delegate-core.ts` | **是**（删 `delegate-async.ts`） | **否**（本记录） |
| G2 `delegate-knowledge-delivery` | `delegate-core.ts` | 否 | 是 |
| G3 `role-class-write-set` | `role-policy.ts` | 否 | 是 |

⇒ G2/G3 不阻塞（可先清）；只有 G1 需要本次决策。

## 5 候选路径（用户已裁决 **A**）

- **A（已选）**：清单加**结构化** `retire[]` —— drill 按 JSON 结构把条目转 `retired`
  （`retired_at` + `retired_evidence` = 各自的 `adr_primary`，撤 `watch` / `manifest_ref`）
  + 同批自删清单 ⇒ 清单执行后**真自洽**，退役不再需要手工两步。
  代价：ADR 修订（schema / D5 / V 判据 / 修订行）+ oracle→critic 各 1 轮 + 实现（`lib/rollback-drill.ts` 约 60 行）+ 负例测试。
- B：放宽 M7 —— `proving` 不查 watch 存在性（与 `active` 对齐）。少一条漂移检测；
  退役仍需手工两步。仍需 ADR 修订。
- C：反序证据流（先回填进 `active` 再 drill）—— 不解决退役手工两步，且偏离 V8 的
  `commit → drill → 回填` 口径。

## 6 交接：architect 需拍板的改动点

1. **清单 schema**：新增 `retire?: string[]`（机制名列表）；语义 = 在隔离副本里把
   registry 的对应条目转 `retired`（`retired_at` = 演练日期；`retired_evidence` =
   该条目的 `adr_primary`；删 `watch` / `manifest_ref` / `pending_backlog`）。
   允许的**来源态**：`active` / `proving`（`unmanifested` 的退役连带删债指针 ⇒ 是否纳入待定）。
2. **`planDrill` 新判据**：`retire[]` 每条必须在 registry 中**存在**且处于允许来源态；
   `registry.json` 必须存在且可解析（fail-closed）。
3. **D5 生命周期**：补「`retire[]` 是 `active|proving → retired` 的机械通道」；
   明确 retired 仍须删清单（与现 D5 一致）。
4. **Verification**：补一行（如 V16）「清单的 `retire[]` 覆盖其全部 `manifest_ref`
   指向者」——否则清单可只删代码不改 registry（M7 会红，但把判据写实更好）。
5. **修订行**：ADR 修订记录追加一条（第 7 轮）。
6. **不变式**：`retired_evidence` 必须指向存在的文件（复用 M6）；禁止 `retire[]`
   指向不存在 / 已 retired 的条目（fail-closed，不猜意图）。

## 7 当前工作树状态（离开时）

- `.rddf/rollback/delegate-slot-kernel.json`：`delete` 4 件（`lib/delegate-async.ts` /
  `tests/delegate-async.test.ts` / `tests/probes/probe-cancel-release.ts` /
  `scripts/mutate-cancel-release.sh`）+ `edits` 35 条；**无** registry 面、**无**自删；
  `notes` 记录了「两步手工收口」的临时口径（A 落地后应改写为 `retire[]`）。
- registry：G1 4 条 = `proving`（`manifest_ref=delegate-slot-kernel`），自机制 = `active`。
  这是**合法**状态（V6：proving 有清单 + watch 存在）⇒ 真实仓套件绿（1057 pass / 1 skip / 0 fail）。
- 债指针：G1 的 4 份已删；G2/G3 的 4 份仍在。
