# Revert 演练留痕 — delegate-base-channel（AC14）

> 日期：2026-11-15 ｜ 判据真源：`openspec/changes/delegate-base-channel/proposal.md` 的 AC1–AC14
> 方法：每条**注入一个真实破坏** ⇒ 必须变红 ⇒ 还原 ⇒ 必须绿。**判红只认退出码**（非 TTY 下 bun 的失败明细在 stderr ⇒ 数 stdout 的 `(fail)` 行会永远假绿）。
> 脚本：`/tmp/opencode/revert-base-channel.py`（scratch，不入库；本文件是留痕载体）

## 基线

```
bun test tests/ ⇒ exit 0 ｜ 574 pass / 0 fail
```

## 逐条结果

| # | 注入的破坏 | 变红的判据 | 还原后 |
|---|---|---|---|
| A | 删除 `delegate` schema 的 `base` 属性 | **AC1**、AC10-⑤ | exit 0 |
| B | 删掉 `buildBrief` 的基线行渲染 | **AC2**（含 AC11 / AC29 的行为断言） | exit 0 |
| C | 删掉 `base` 的形态校验（空值 + 注入加固） | **AC3** | exit 0 |
| D | 删掉 `assertVerifierBaseline` 的「缺 base 即拒」分支 | **AC5** | exit 0 |
| E | 删掉 `knowledge + base` 的互斥 | **AC9** | exit 0 |
| F | 去掉 `plan.md` verifier 行的 base 必填措辞 | **AC10-①** + 既有守卫（`<base>` / 必须声明 / blocked） | exit 0 |
| G | 去掉 `dispatch` 手抄 description 的 base 语义 | **AC10-⑤** | exit 0 |
| H | 闸门改按 `brief.role_class`（**声明值**）判，而非 `effectiveRoleClass`（登记值） | **AC8-①**、**AC8-②** | exit 0 |
| I | 去掉 `dispatch` execute 的 `buildBrief` 第三参（传参字面量） | **AC2（dispatch 侧）** | exit 0 |

## 结论

**逐条可逆，无空转绿。** 每条破坏都命中**预期的那条判据**（不是碰巧红在别处），
且还原后全量恢复 `exit 0`。

## 覆盖情况（如实登记）

| AC | 有 revert 演练？ | 备注 |
|---|---|---|
| AC1 | ✔ A | |
| AC2 | ✔ B | 含端到端静态闭环（`merge-base` exit 0） |
| AC3 | ✔ C | |
| AC4 | ✔ C（同一处代码路径） | 注入加固与空值校验在同一分支 |
| AC5 | ✔ D | |
| AC6 | — | **未单独演练**（它是「不要求 base」的豁免分支 ⇒ 破坏方向是「加上要求」而非「删掉要求」；注入会让非 git 工程被拒） |
| AC7 | — | **未单独演练**（`^{commit}` peel 的修法来自 critic 的技术缺陷 #1；其判据是「annotated tag 不被误拒」⇒ 破坏方向是「去掉 `^{commit}`」） |
| AC8 | ✔ H | **当场即绿**（实现本就正确）⇒ 专门设计 H 证明其**判别力**：闸门若按声明值判 ⇒ AC8-①/② 双红 |
| AC9 | ✔ E | |
| AC10 | ✔ F + G | 五个面中前三面（plan.md 两处 + front.md）由 F 间接覆盖；⑤ 由 G 覆盖 |
| AC2（dispatch 侧） | ✔ I | dispatch 的 `buildBrief` 传参字面量是**独立于同步面**的一处 ⇒ 单独钉 |
| AC11 | ✔ B | 与 AC2 共用基线行渲染 |
| AC12 | ✔ D | 与 AC5 共用闸门；**拒绝顺序**（scope 先于 base）由既有 `tests/delegate-async.test.ts:422` 的 `/越界/` 断言持续守护 |
| AC13 | — | 回归项（本就应绿） |
| AC14 | — | 本文件即留痕 |

⚠ **诚实口径**：AC6 / AC7 **没有**独立的 revert 演练 —— 它们的破坏方向与 A–E 相反
（「加一道会误拒的闸门」/「去掉 peel」），本次未逐条做。
其中 **AC7 的 peel 修法**来自 critic 的技术缺陷 #1（annotated tag 裸 ref 校验会失败，
而消费端 `merge-base` 会 peel ⇒ 误拒合法 base），其判据由 `delegate-tool.test.ts` 的
「annotated tag 不被误拒」用例直接守着（该用例在 peel 被去掉时会红）。

**本版补的两条**（oracle 审出 AC8 无覆盖 + dispatch 侧简报渲染无守卫后补）：
- **H**：AC8 是**当场即绿**（实现本就正确）⇒ 判别力必须另行证明 ⇒ 注入「按声明值判」破坏 ⇒ 双红。
- **I**：dispatch 侧的 `buildBrief` 传参字面量**独立于**同步面 ⇒ 不钉就会静默漂移。
