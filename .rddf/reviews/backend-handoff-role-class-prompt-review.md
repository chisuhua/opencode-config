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

---

# 追加审稿：被派发后端不适用「审查者不可用降级」（2026-11-13，live e2e AC14 驱动）

## 触发动机

真实 `delegate` 派发（`role_class=architect`，scope = `["docs/adr", ".rddf/reviews"]`），用 `OPENCODE_CONFIG`
把 oracle / critic 降为 `mode: primary` 使其不可作为 subagent：

| 步 | 观测 |
|---|---|
| 1 | 后端调 `subagent(agent="oracle")` / `subagent(agent="critic")` 各 1 次 → `Agent <name> cannot run as a subagent`（未重试，符合「审查调用失败不重试」） |
| 2 | 后端**按 §审查配对 的降级规则**改用「architect 内置自检清单」，把 ADR 写成 `Status: Accepted` |
| 3 | 审稿报告诚实声明「本报告的结论来自自检，不是独立对抗式审查……应视为未经独立签批」——诚实声明不改变「未经独立审查即已签批」的事实 ⇒ **自审自批** |

根因：降级规则默认「有人值守的主会话」（⚠️ 声明用户能看见），对无人值守的后端等于**授权自审自批**。

## 改动（3 处文本 + 1 组守卫）

| # | 落点 | 改动 |
|---|---|---|
| 1 | `prompts/build.md:482` | 新增例外段：被派发后端不适用本降级 ⇒ 必须 `HANDOFF: blocked`；受阻时**不得完成任何收口动作**（不转 Status / 不落审稿报告 / 不登记关联 change），即使保持 `Draft` 也不例外；本节第 1–3 条只适用于**主会话** |
| 2 | `prompts/build.md:539` | `architect` 类 Status 转换条尾句：`subagent` 不可用 ⇒ `HANDOFF: blocked`（**本条优先于**降级规则），不得自审自批 |
| 3 | `prompts/build.md:628` | 自查清单该条加主会话限定（否则后端收到两条相反指令） |
| 4 | `tests/config-guards.test.ts` | 新增 describe 钉三组 token（例外段限定 + 优先句 + 清单限定），含反向断言「降级第 1 条仍在」 |

## oracle（1 轮，`PASS-WITH-NOTES`）

| # | finding | 处置 |
|---|---|---|
| 1 | 自查清单 628 行未随例外段对齐（同文件两套口径） | 已修（改动 3） |
| 2 | 只堵「自检代替审查」，未堵「受阻时落收口产物」（写审稿报告 + 转 Status）；e2e 首轮失败正是这条路径 | 已修（改动 1 的「不得完成任何收口动作」句） |
| 3 | 「标 `Proposed` 绕过签批字面」已被既有条款堵住（Proposed/Accepted/Rejected 均属已决） | 无需改 |
| 4 | `verifier` 类后端「无法取证」无交回分支（同构缺口，确实存在）；`builder` 类无此缺口（`blocked` 行覆盖、自查走 shell） | **本次不做**，单独立项（见下「待立项」） |
| 5 | 可用 `config-guards` 钉三组 token | 已采纳（改动 4） |

## critic（1 轮，`APPROVE` / `mergeable: yes` / `scope_exceeded: false`）

- BLOCKER：无。SHOULD_FIX：无。
- NIT 1：482 是**全类**断言但只写 `architect` 的后果，`builder`/`verifier` 遇审查者不可用未声明 ⇒ 立项时把全类断言与各类后果写齐。**处置**：记入待立项条目。
- NIT 2：守卫只断言例外段存在，未反向断言降级规则仍在。**处置**：已补反向断言（改动 4）。
- 已核实的两个 focus：① 例外是对既有规则**划界**而非另立判据（`prompts/build.md:517` 的不对称先例支撑）；② 残留自审路径（伪造审稿报告、`Proposed` 绕字面）均已被文本封堵，剩余只有「后端谎称未受阻」，属 prompt 文本不可防面。

## 验证

- `bun test tests/` = **480 pass / 0 fail**（8 files，2060 expect）
- `scripts/check-upstream-anchors.sh` = **23/23** OK
- live e2e 对照（同一 harness，修复前 → 修复后）：`Status: Accepted`（自审自批）→ `Status: Draft` + 首行 `HANDOFF: blocked` + 「未把 Status 写成 Accepted，也未伪造双审结论」

## 待立项（本次不做）

`verifier` 类后端在「无法取证」（环境缺依赖 / 测试跑不起来）时无交回分支，而同位置它允许写 `.rddf/reviews/**` ⇒ 无人值守 + 无法取证 = 可伪造 pass 证据，与本次修的 architect 场景同构。立项时一并写齐 `prompts/build.md:482` 的全类断言与各类后果（回应 critic NIT 1）。归属 planner（improvement）。
