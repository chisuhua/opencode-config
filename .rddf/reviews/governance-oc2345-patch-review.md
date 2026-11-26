# 治理面审稿报告：OC-2 / OC-3 / OC-4 / OC-5 合并 patch series（+ §输出 事实化）

> **审查域**：治理面（`~/.config/opencode/prompts/**` + `tests/config-guards.test.ts` + 回滚清单/登记表）
> **产出者**：architect（治理面文案作者）｜**机制面配套**：builder（回滚清单 / registry / commit）
> **日期**：2026-11-27
> **提交序列**：`9b23636` → `0206fa7` → `81c0d2d` → `46650c0` → `143ea15` → `90ebb27` → `6bb9dbd`
> **审查链**：oracle 1 轮（治理面）→ critic 1 轮（arch 档）→ critic 复审 1 轮（BLOCKER 闭合）

---

## 1. 意图（为什么改）

两次真实会话（CppTLM `ses_de7dcca7` 立项 / `ses_de80d7eb` `rddf status` 重排）暴露 4 个**可判定**的执行缺口，
外加 1 条**事实陈述**缺失（agent 以为「未声明门禁」也跑过验证）：

| # | 缺口 | 证据 |
|---|---|---|
| OC-2 | 「立项」类口令在增强层路径下让 planner 空转（agent 只能停下问用户） | CppTLM `role.json` history 2026-11-26 有 **5 次** planner→builder 翻转（间隔 0.8–8.4 分钟，全部 `by: user`） |
| OC-3 | `role-switch.sh` 用法不可查（agent grep 脚本猜参数） | 会话首轮 5 次 shell 探路才找到 `--session` |
| OC-4 | 「外部事实 → librarian」有归口但**无触发判据** ⇒ 外部事实被「源码考古」代替 | 246 次工具调用、**0 次** subagent，其中 4 次进 pnpm store 读 openspec dist 源码 |
| OC-5 | metis 是 planner 的固定审查者，但「审过」的**凭据无载体** ⇒ 是否审过不可判定 | 目标 change 的 improvement 新建后未跑 metis（会话内 0 次 subagent 调用） |
| §输出 | 「未声明 ⇒ 三判据全不设门禁 ⇒ 放行」是 ADR D3:60 的明文决策，但正文未写 ⇒ agent 误以为验证跑过 | CppTLM 两仓无 `.rddf/commit-gate.json` ⇒ 两次 commit 只过形态识别 |

**范围边界**：只改治理面规则文本与守卫判据；**不改** `ADR-commit-verification-gate` D3 决策；**不改** `lib/**` / `plugins/**` 机制面。

## 2. oracle 第 1 轮（治理面）· `PASS-WITH-NOTES`（≈ APPROVE_WITH_CONDITIONS）

| finding | 内容 | 处置 | 落点 |
|---|---|---|---|
| **F1** | `--session` 的机制描述**是错的**：真实行为是「省略时回落 `$OPENCODE_SESSION_ID`，两者皆缺 ⇒ exit 2 响亮失败」；不存在「写不进 sessions 分区 ⇒ 顶层镜像回落」的代码路径；且「完整用法」漏 `--reset-claims` | ✅ 采纳并改 | `46650c0` |
| **F2** | 立项路由漏 **from-scratch 分支**：P0 硬前置不在场时切 builder 走不通 | ✅ 采纳并改 | `46650c0` |
| **F3** | 与「默认不自动切换」歧义 ⇒ agent 可能自行切换并以 `updated_by:"user"` 落账 | ✅ 采纳并改 | `46650c0` |
| **F4** | metis 载体措辞按写集现实重写（planner 写集不含 `.rddf/reviews/` ⇒ 默认路径 = improvement 头部段）；第 6 段的 rdd-workflow 侧容忍未跨仓验证 | ✅ 采纳并改（跨仓容忍**未写成事实**，登记 follow-up） | `46650c0` |
| **F5** | OC-4 补逃生句（工作对象本身是已安装产物 / 无 librarian 调用权 ⇒ 交回主会话） | ✅ 采纳并改 | `46650c0` |
| **F6** | D9② 先例句过度承诺（未声明留痕机制**今天不存在**） | ✅ 采纳并改（改为事实陈述） | `46650c0` |
| **F7** | `rdd-skills.sh` 给全路径 | ✅ 采纳并改 | `46650c0` |

**oracle 登记的未验证项**：① CppTLM `role.json` 的 5 次翻转系调用方提供；② rdd-workflow 侧对 improvement 第 6 段的解析容忍未跨仓验证；③ drill PASS 未由 oracle 重跑。

## 3. critic 第 1 轮（arch 档）· `REJECT`（mergeable: no）

| 级别 | 内容 | 处置 |
|---|---|---|
| **BLOCKER** | §审查配对表 builder 行声称「形态判据归生成器侧的**机械守卫**（**生成时自检，判据不过即拒生成**）」——该机制**不存在**（P0 不拒生成；结构级判据在 `plan_done` 转换门的 `openspec validate`，**事后**）⇒ 伪决策；且守卫锚点把它**钉死** | ✅ **已改**（`90ebb27`）：改写为事实陈述；锚点改为钉 4 条**事实** |
| SHOULD_FIX | planner 行 F2 改写时丢了 `installed` 前提，句尾 `installed` 注释**悬空**；且内置流程下 proposal 归 planner 内置起草 ⇒ 字面路由与内置流程冲突 | ✅ 已改（`90ebb27`）：恢复 `installed` 前提 + 补「不可用 ⇒ 内置流程 ⇒ planner 有动作」分支 |
| NIT | P0 前置判据因 AC12 守卫不能写路径字面量 ⇒ 补检查方法指引（指向 planner 写集机读块） | ✅ 已改（`90ebb27`） |

## 4. critic 复审（第 2 轮，只验 BLOCKER 闭合）

- **提交给复审的材料**：上一轮 BLOCKER 的闭合证据（改写后的正文逐字 + 4 条事实锚点）+ 本轮新增 diff（`90ebb27`：`prompts/build.md` 8 行 / `tests/config-guards.test.ts` 8 行）+ 验证证据（`bun test tests/` 1232 pass、rollback drill PASS @ `90ebb27`）。
- **结论**：见本文件末「复审结论」。

## 5. 机械判据（守卫）

`tests/config-guards.test.ts` 新增 `describe("治理面文案补丁（OC-2/3/4/5 合并 series）的机械判据")`，
**21 条内容锚点**（立项路由 6 / role-switch 5 / 调研委派 3 / metis 载体 2 / 立项产物形态 4 / 其它 1）。

⚠ **刻意不覆盖的条款**：`prompts/build.md` §输出 的「未声明 ⇒ 三判据全不设门禁 ⇒ 放行」**不配断言** ——
机制回滚（`.rddf/rollback/commit-gate.json` 的 step-2 edit）会把该行还原 ⇒ 钉住新措辞会让 rollback drill 假红。
其机械判据改由**清单锚点计数**把关（`tests/rollback-manifests.test.ts` 断言该 `find` 恰好出现 1 次）。

⚠ **本批自发现的额外问题**：AC12 守卫（角色列表「允许」列不得复述写集路径）因 F2 改写时写出路径字面量而变红
⇒ 改写为散文表述（「improvement 草稿」/「planner handoff」）后复绿。

## 6. 回滚清单 / registry 配套（机制面，builder 执行）

| 动作 | 依据 | 证据 |
|---|---|---|
| step-2 `find` 锚点随 §输出 措辞同步（两次） | ADR D5「清单实质改动 ⇒ 同批重跑 drill 并回填」 | drill PASS（`81c0d2d` / `6bb9dbd`） |
| 撤 `last_drill` + registry 退 `proving` → drill → 回填 → 转 `active` | 同上 | `last_drill.sha` = `90ebb27` |
| `watch[]` 改为**回滚后仍存在**的锚点（ADR / build.md / 清单本体） | M7（proving 态的 watch 路径必须存在；机制文件本身是 step-3 删除对象） | `0206fa7` |

## 7. 治理面降级自检清单（逐条自问并作答）

1. **与 3 条不变式是否冲突**（团队自足 / 不伪造前置条件 / 不代 workflow 推阶段）？—— 不冲突：改动只约束
   agent 行为规则，不新增 workflow 阶段，不伪造任何前置条件。
2. **与角色列表的权限边界是否矛盾**？—— 不矛盾：planner 仍不得写 `design.md`/`tasks.md`（只改路由**说明**）；
   builder 仍可写 `**`；OC-2 只规定「此刻该做什么」，不扩权。
3. **是否引入第二套判定标准**？—— 未引入：新增条款都是**单源**（立项路由只在角色列表一处；role-switch 用法只在
   §角色切换一处；可点数触发只在调研委派协议一处），且每条都配守卫锚点。
4. **触发条件是否可客观判定**？—— 是：立项路由 = 「口令关键词 + installed 布尔 + 两个前置是否在场」；
   可点数触发 = 「同一轮连续 ≥3 次读第三方已安装产物源码」（可点数）。
5. **是否有不可用降级路径，且降级后有落盘载体**？—— 有：审查者不可用时走内置自检清单 + 本报告 + 响应正文；
   metis 载体的默认路径 = improvement 头部「metis 结论」段（planner 写集不含 `.rddf/reviews/` ⇒ 事实路径）。
6. **预算是否与既有上限冲突**？—— 不冲突：治理面一次改动 = oracle 1 + critic 1（+ 1 次 BLOCKER 复审），
   本批实际 = oracle 1 + critic 1 + critic 复审 1（BLOCKER 闭合）⇒ 未超。

## 8. 复审结论

**critic 第 2 轮（只验 BLOCKER 闭合）· `APPROVE` / `mergeable: yes` / `scope_exceeded: false` / BLOCKER 0 / SHOULD_FIX 0 / NIT 0**

- **BLOCKER 已闭合**（复审逐条核实）：
  - 虚假声称已移除 —— 治理仓 `prompts/` + `tests/` 全文 grep「机械守卫 / 拒生成 / 生成时自检 / 判据不过即拒」**零命中**；
  - 新表述逐条对产品仓核实为真：`phase0_approval.sh:164-166`（缺 improvement 只留骨架继续）/ `_lib/gate.py:382`
    （`openspec_validate` 注册在 `plan_done` 转换门，**事后**）/ 根治路径的改进项**仅为草稿未实施**；
  - 守卫锚点不再钉死虚假声称（OC-5② 改为 4 条**事实**锚点）⇒ 伪决策（BLOCKER 第 4 类）转为「事实陈述 + 显式未决标记」；
  - 上轮 SHOULD_FIX（恢复 `installed` 前提 + 补「不可用 ⇒ 内置流程 ⇒ planner 有动作」分支）与 NIT（检查方法指引）均已闭合。
- **复审的验证建议（留作 follow-up，不在本批）**：
  - `bun test tests/config-guards.test.ts -t "OC-5②"` 单独复核 4 条事实锚；
  - **rdd-workflow 侧**待 `fix-spec-delta-generator-shape-and-semantics` 实施后，同步更新 `build.md` §审查配对 builder 行
    与 OC-5② 锚点（届时锚点变红**即为提醒**）—— 这条「提醒」是本批刻意留下的防腐 tripwire。
- **被排除的替代方案**（复审复核后维持排除）：① 在治理面新增审稿配对兜底形态错（与 verifier 行职责重叠）；② 直接删除该行不提根治路径（丢失「未实施 ⇒ 不得写成已决」的防复发约束）。

## 9. 本批交付与遗留

**已交付**：治理面 5 处规则变更（立项路由 / role-switch 用法 / 调研委派可点数触发 / 审查配对补口 / §输出 事实化）
+ 21 条守卫锚点 + 回滚清单与 registry 配套 + 演练证据（`last_drill.sha = 90ebb27`）+ 本报告。

**遗留（不在本批，登记为 follow-up）**：

| # | 遗留 | 归属 |
|---|---|---|
| 1 | 「未声明门禁」的可观测性（留痕 + 提示）尚未实现 | rdd-workflow 改进项 `add-commit-gate-declaration-bootstrap`（U7） |
| 2 | 声明生成入口 + baseline 机制 | rdd-workflow 改进项 U7 / U8（U8 前置 ADR SU） |
| 3 | 生成器侧形态守卫（根治路径） | rdd-workflow 改进项 `fix-spec-delta-generator-shape-and-semantics`（U2） |
| 4 | oracle 登记②「improvement 第 6 段的跨仓容忍」 | **已验证**（2026-11-27 本仓实跑：生成器容忍额外段；同时暴露兜底吞段缺陷 ⇒ 证据已回填 U1） |
| 5 | 治理面事实类锚点可再加「与事实源对拍」的交叉断言（如 OC-3 锚点对拍 `role-switch.ts` 子命令清单） | 另案（critic NIT） |
