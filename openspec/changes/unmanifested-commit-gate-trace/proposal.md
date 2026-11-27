# unmanifested-commit-gate-trace —— 未声明仓的 commit 留痕

> **登记来源**：`.rddf/improvements/unmanifested-commit-gate-trace.md`（5 段草稿）
> **决策依据**：`docs/adr/ADR-commit-verification-gate.md` **D3**（未声明 ⇒ 不设门禁，**不改**）+ **D9②**「事实性补登」先例。
> **范围**：只做**留痕**（检测 ≠ 拦截）—— **不改**判定、**不改** D3、**不新增**门禁面。
> **归属**：机制面 ⇒ builder；治理面（D9⑱）⇒ architect。

## Why

D3 明文：无 `.rddf/commit-gate.json` ⇒ 三判据**不设门禁**。但「门禁没跑」对 agent **不可见** ——
commit 照样过、**无任何痕迹**（CppTLM 实测：两处使用方仓长期静默缺席，agent 误以为已验证）。
U7a 已补「生成入口 + doctor 三面检测」；本 change 补**运行轨迹**这一环。

## What Changes

| # | 变更 | 落点 |
|---|---|---|
| A1 | 未声明（`decl === null`）⇒ 账本追加 `未声明 ⇒ 三判据不设门禁（ADR D3）`，**照常放行** | `plugins/commit-gate.ts` |
| A2 | **尽力而为**：无 `.rddf/state/` / 写失败 ⇒ 静默，**绝不影响判定** | 同上 |
| A3 | 声明**解析失败** ⇒ 同样留痕，**但照旧拒**（D6 fail-closed 不变 —— 坏的声明 ≠ 未声明） | 同上 |
| B1 | **D9⑱** 四载体登记（ADR 表（真源）+ 测试注释 + MAD §2.8.8 + 本 proposal） | 治理面 + 守卫 |
| B2 | D9 计数 17 → 18（守卫期望集从 ADR 表派生） | 守卫 |

## 验收标准

- [ ] **AC1（↔ 未声明留痕）** 未声明仓 ⇒ commit 放行 + 账本出现 `未声明` 行（先红后绿）。
- [ ] **AC2（↔ 声明不可用留痕）** 声明解析失败 ⇒ 账本出现 `声明不可用` 行，且 **commit 照旧被拒**（D6 不变）。
- [ ] **AC3（↔ 尽力而为）** 写不进账本 ⇒ **仍放行** + 不抛错。
- [ ] **AC4（↔ 零回归）** 已声明且合法 ⇒ **无**该留痕；既有用例全绿。
- [ ] **AC5（↔ D9⑱）** ⑱ 四面齐备 + 计数 18；缺一面 ⇒ 红。
- [ ] **AC6（变异）** 留痕短路 ⇒ AC1 红；写失败抛错 ⇒ AC3 红。
- [ ] **AC7（门 + 回滚面）** `bun test tests/` 全绿；清单同批 + 演练 PASS + 回填 `last_drill`。

## D9 免宣称项登记（AC 面）

> ⚠ 本小节是 **D9⑱ 的 AC 面载体**；①–⑰ 由既有载体承担（守卫**多标题兼容** ⇒ 并集恰好覆盖 ①–⑱）。

- **D9⑱** 未声明仓的留痕是尽力而为 ⇒ 见 ADR D9 表（判据真源）

## Capabilities

- MUST: 未声明 / 声明不可用的仓 commit 时留痕且**照常放行**。
- MUST: 留痕尽力而为（写不进 ⇒ 静默），**不得**影响判定。
- MUST: 已声明且合法 ⇒ **不**留该痕。
- MUST: 新面按 D9⑱ 四载体登记。

## Impact

见 `.rddf/improvements/unmanifested-commit-gate-trace.md` 的 Impact 表。
