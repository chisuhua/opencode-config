# 审稿记录：prompt 侧派发契约（`role_class` + HANDOFF）

> 审稿对象：`prompts/build.md`、`prompts/plan.md`、`prompts/front.md`（+ ADR 状态与编号同步）
> 档位：`arch`（治理面）/ `plan`（change proposal 同步）
> 依据：ADR-backend-handoff-role-class（Accepted 2026-11-13）

## 轮次与判定

| 轮 | 审查者 | 判定 | 处置 |
|---|---|---|---|
| 1 | oracle | **`BLOCK`**（1 高 + 3 中 + 4 低） | 全部闭合，见下表 |
| 1 | critic | `APPROVE_WITH_CONDITIONS`，`mergeable: yes`（4 条在范围内 SHOULD_FIX + 2 条范围外 NITS） | 全部闭合 |

**预算**：治理面一次改动 = oracle 1 + critic 1；本 series 已用满，未触发复审轮。

## oracle BLOCK 的主因与闭合

**主因**：prompt 指定的权威信源（简报「运行身份」段 / `role_class` 字段）由 `lib/delegate-core.ts::buildBrief()` 生成，而该函数**尚未实现**该段（`grep role_class|assertRoleClassCompatible|archRoots|classPermissions` 在 `lib/*.ts` 零命中）⇒ 文本引用了一个不存在的字段，后端会走三条有害出路之一：自行从 scope 猜类并据此拒写代码 / 判为「无法确定身份」而 `HANDOFF: blocked` 空转（委托通道假死）/ 靠模型悟性碰巧按缺省 `builder` 走对。

**闭合**：在派发方与被派发方**两侧**都写死缺省口径 ——

- `prompts/build.md` 被派发节首段：「机制未启用时的缺省口径：若简报里没有「运行身份」段 / 没有 `role_class` 字段 ⇒ 按缺省 `builder` 执行，越类判据不适用，一切以简报的 `scope` 为准；**不得因字段缺失臆造一个 class，也不得因此停下拒活**。」
- `prompts/build.md`「状态来源」的 `role_class` 条目：「两者皆无该字段 ⇒ 视为缺省 `builder`，不得因字段缺失停下拒活。」
- `prompts/plan.md` 选类表下 + `prompts/front.md` §3.1 字段行：派发侧同义降级句（「该字段被忽略、后端按缺省 `builder` 执行 ⇒ 此时『选错类 ⇒ 后端交回』不成立，选类靠派发前自查」）。

**残留窗口**：`lib` A/B 落地前，派发方填 `role_class` 会被静默忽略（`validateBrief` 不拒未知键）⇒ 已在 `plan.md` / `front.md` 明写该限制，不假装生效。lib 落地即关闭该窗口。

## oracle 其余 finding 的闭合

| # | finding | 闭合 |
|---|---|---|
| 2 | `plan.md` 硬规则 5 的「按第 ④ 项」是失效引用（④ = 已完成/未完成，撑不起分流） | 改为「按交接 5 项模板的第 **③** 项（需要什么决策）」 |
| 3 | 系列内文档状态矛盾（proposal 头注仍写 Proposed；勘误指控 spec v3 写反但 v3 已改） | proposal 头注改 `Accepted`；勘误改述为「v2 曾写反，v3 已改；断言净效果」 |
| 4 | D5 的验收阶段 kind 映射无落点 | `build.md` HANDOFF 段补「`implementation_gap → ac-fail`、`proposal_drift → needs-revision`」 |
| 5 | 「收回后 `git status` 复核」放错读者面 | `plan.md` 选类表下、`front.md` §3.3 各补一句 |
| 6 | `front.md`「六个必填字段」标题与表内容错位 | 改为「五个必填字段 + 两个选填」 |
| 7 | verifier 能否跑测试三处口径不齐 | `plan.md` / `front.md` 的 verifier 行统一为「只取证与判决（跑测试取证、写验收报告），不改实现」 |
| 8 | 纯换类 ⇒ `blocked` 与 `blocked` 定义字面缝隙 | HANDOFF 段补「换类 = 缺主会话派发决策」 |

## critic finding 的闭合

| # | finding | 闭合 |
|---|---|---|
| 1 | 派发侧（plan/front）缺降级口径，与 build.md 不对齐 | 两条派发侧降级句（见上表 oracle 主因的闭合段） |
| 2 | `ac-fail` 语义超载：发现语境 = design_drift，验收语境 = AC 未过 | HANDOFF 段加一句显式消歧：「`ac-fail` 两个语境同标签，靠 5 项正文第 ③ 项区分，别按标签字面猜路由」（**不改** ADR D5 的映射本身） |
| 3 | proposal「依赖与顺序」已漂移（prompt 文本实际先于 lib 落地） | 改写为真实顺序：prompt 文本已先行（带"机制未启用"窗口）→ A → B 关窗；C.11 仍拆出 |
| 4 | 设计文档头注仍写「ADR 当前 Proposed」 | 改为「ADR **Accepted** 2026-11-13」 |
| 5（NITS，范围外） | improvement 头注 / spec v3 状态行过期 | 顺手同步（Accepted / 已落 docs+ADR+立项） |

## 验证

- `bun test tests/` = **404 pass / 0 fail**（8 files，1880 expect）
- `scripts/check-upstream-anchors.sh` = **23/23** OK

## 结论

无 BLOCKER 残留（oracle 的 BLOCK 已闭合、critic 无 BLOCKER）⇒ 本次治理面改动可合入；`lib` 侧 A/B 落地前，三份 prompt 的降级口径共同承担"机制未启用"窗口。
