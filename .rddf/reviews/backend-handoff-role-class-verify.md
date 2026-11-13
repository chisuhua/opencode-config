# 验收报告：backend-handoff-role-class

- 验收对象：`openspec/changes/backend-handoff-role-class/`（proposal AC1–AC31）
- 验收日期：2026-11-13
- 验收角色：builder 内建的 verifier 环节（角色内建，非 subagent）
- 已用轮次：**2 轮**（第 1 轮发现 3 处证据缺口 → 补测试；第 2 轮全绿）
- 结论：**通过**（31/31 AC 有工具证据；无未闭合失败项）

## 判据来源（按优先级）

1. `openspec/changes/backend-handoff-role-class/proposal.md` 的「## 验收标准」表（AC1–AC31）—— 本 change 自身的判据即最高优先级
2. `docs/adr/ADR-backend-handoff-role-class.md` 的「Verification（可勾选验收判据）」章（V1–V21 ↔ AC24–AC31 的映射已在 ADR 元数据回填）
3. 本次变更声明的行为（commit `9663ec5` / `366906d` / `f8b333f` / `a537b5d` / `277c206` / `22f32eb`）

## 逐条判定 + 证据

| AC | 判定 | 证据（工具调用 / 断言位置） |
|---|---|---|
| AC1 | ✅ | `tests/delegate-core.test.ts`「非法值 / null / 空串 ⇒ 抛（不是"没填"）」「三类合法值被接受」「未传 role_class ⇒ 存量条目不写该字段（resume 时按缺省解释）」 |
| AC2 | ✅ | 同文件「知识 session 与 role_class 互斥」 |
| AC3 | ✅ | 同文件「architect：scope 必须落在类上限内（docs/adr / .rddf/reviews / arch-docs.json）」（正例 3 + 反例 `src/**`） |
| AC4 | ✅ | 同文件「verifier：.rddf/reviews 可写、src 不可写」+ `tests/delegate-tool.test.ts` 同名用例（净效果断言，非下标） |
| AC5 | ✅ | 同文件「三类 subagent 白名单一致：只读 agent allow；general / context-builder / build deny」「知识 session 不获得 subagent 白名单」「subagent 规则顺序：deny 在前、allow 在后」 |
| AC6 | ✅ | 同文件「role.json 出现独立 role_class，current_role 仍 builder；pair 同步落盘」 |
| AC7 | ✅ | 同文件「登记值与请求不一致 ⇒ 硬拒」+ `delegate-tool.test.ts`「resume：class 不一致 ⇒ 硬拒」 |
| AC8 | ✅ | `delegate-tool.test.ts`「同步轮次结束后 pair.state === idle（AC8，槽已释放可再派）」 |
| AC9 | ✅ | `delegate-core.test.ts`「AC9 / AC21：简报含 HANDOFF 5 项模板 + rddf feedback add 命令 + 不可用时的文本兜底」（**第 1 轮补断言**） |
| AC10 | ✅ | `delegate-core.test.ts`「scope 三种写法判定一致（归一化单一实现）」「architect：scope 覆盖整个工程 ⇒ 拒」 |
| AC11 | ✅ | `delegate-tool.test.ts`「AC11：无换类工具入口（注册面只有五个委托工具，无 set_class 一类）」 |
| AC12 | ✅ | `bun test tests/` = **482 pass / 0 fail**（8 files，2075 expect）；`scripts/check-upstream-anchors.sh` = **23/23**；`openspec validate backend-handoff-role-class` 通过 |
| AC13 | ✅ | live e2e RC-1 + RC-2（`rdd-workflow-e2e` commit `5b37903`）：窄目标 ⇒ 派发被拒、不建 session；宽目标 ⇒ `docs/adr/**` 零变更 + `blocked_reason: Permission denied: edit` + feedback 落盘 |
| AC14 | ✅ | live e2e RC-4：ADR 保持 `Draft`（YAML / 表格两形态都挡）+ 首行 `HANDOFF: blocked` + feedback 凭据落盘 |
| AC15 | ✅ | `delegate-core.test.ts`「archRoots：配置三态（D3）」5 个用例 + 「态 3：fallback 目录集一项都不存在 ⇒ 空集（architect 派发须被拒）」（**第 1 轮补断言**：错误信息必须指向 `scripts/arch-docs-init.sh`） |
| AC16 | ✅ | 同文件 describe「简报：运行身份与按 class 分支的执行要求（D5）」4 个用例（三类各一 + 知识 session 反例） |
| AC17 | ✅ | 同文件「存量条目（无登记值）+ builder ⇒ 按 builder 解释（不抛）」 |
| AC18 | ✅ | 同文件「symlink 指向 scope 外 ⇒ 拒（语义越界，不只语法归一化）」 |
| AC19 | ✅ | `delegate-async.test.ts`「AC19：vanished 重建沿用原 role_class（不回落 builder）」（**第 1 轮补断言**：重建后 pair 与 sessions 均回显 `architect`） |
| AC20 | ✅ | 同文件「role_class 落 pair 登记 + sessions 回显（AC20）」 |
| AC21 | ✅ | 简报侧 = `delegate-core.test.ts`「AC9 / AC21」用例（含「仍输出首行 + 完整 5 项正文」）；落地侧 = live e2e RC-3（`rddf` 不可用 ⇒ **无** `## Feedback` 段、ADR 仍不变、权限拒绝仍是结构化证据） |
| AC22 | ✅ | `delegate-core.test.ts`「builder：含运行身份段 + acceptance 自验 + HANDOFF 契约」断言 `省略角色开场报告` |
| AC23 | ✅ | 同文件 describe「AC23：未新增 SlotState / outcome 值」 |
| AC24 | ✅ | 同文件 describe「AC24：builder 的窄目标 ⇒ 派发被拒」（6 用例）+ `delegate-tool.test.ts`「builder + scope 落在 docs/adr ⇒ 派发被拒（不建 session）」 |
| AC25 | ✅ | 同文件 describe「AC25 / AC26」首用例（`docs/adr` deny / `src/a.ts` allow / `docs/adr2/x.md` allow）+ `delegate-tool.test.ts`「builder + scope '.' ⇒ 权限末尾有 arch deny」 |
| AC26 | ✅ | 同文件「write / patch 与 edit 同一权限 action」「grants 无法抵消（edit 不可 grant）」「arch deny **恒在数组末尾**」 |
| AC27 | ✅ | 同文件 describe「AC27：symlink 两方向」4 用例（含悬空软链不抛异常） |
| AC28 | ✅ | 同文件 describe「AC28：archRoots 为空 ⇒ 类边界不存在（减法退化）」 |
| AC29 | ✅ | 同文件 describe「AC29：worktree 下与权限资源同根（workRoot）」（含「主仓没有该目录 ⇒ 不构成边界」负向） |
| AC30 | ✅ | `tests/config-guards.test.ts`「ARCH_FALLBACK_DIRS == prompts/build.md 的 fallback 目录集（逐项 + 顺序）」（从文档**动态抽取**比对，不硬编码第二份）+ `delegate-core.test.ts`「ARCH_FALLBACK_DIRS 是闭合清单（顺序固定）」 |
| AC31 | ✅ | `delegate-core.test.ts` describe「AC31：builder 类简报回显不可写目录」 |

## 第 1 轮发现的失败项与处置（分类：`implementation_gap` 的**证据侧**，非实现缺陷）

| # | AC | 现象 | 分类 | 处置 | 复验 |
|---|---|---|---|---|---|
| 1 | AC9 / AC21 | 简报只断言了 `toContain("HANDOFF")`，**未**断言「5 项模板齐全」与「`rddf feedback add` 命令形态」；AC21 声明的 CI 侧证据载体（`delegate-tool.test.ts` CLI 缺失 fixture）不存在 | 判据未被断言（证据缺口） | 补 `delegate-core.test.ts`「AC9 / AC21」用例：命令形态、①–⑤ 五项、`先落凭据`/`本回合首行`/`HANDOFF: <kind>`、不可用时的文本兜底 | 第 2 轮 ✅ |
| 2 | AC19 | `vanished` 重建沿用原 class 的**行为**在实现里正确（`effectiveRoleClass = assertResumeRoleClass(existing, …)`），但**无任何断言**钉住「不回落 builder」 | 同上 | 补 `delegate-async.test.ts`「AC19」用例（architect 派发 → 后端被删 → resume 不传 class ⇒ 重建后 pair / sessions 仍回显 `architect`） | 第 2 轮 ✅ |
| 3 | AC15 | 报错文本含「请先运行 scripts/arch-docs-init.sh 初始化」，但测试只断言了 `/没有可写的架构文档目录/`，**未**钉住脚本指向 | 同上 | 在同一用例补 `toThrow(/scripts\/arch-docs-init\.sh/)` | 第 2 轮 ✅ |

三条都不是实现缺陷（实现均正确），是**判据与证据脱节**——不补断言则 AC 处于「无人验证」状态，归档后会被当成已验证。故按 `implementation_gap` 的证据侧处理，补测试后复验。

> 另修（不属 AC）：`archRoots` 三态的 5 个**测试标题**仍写「回退 docs/adr」，与现行语义（fallback **目录集**）不符 ⇒ 改为「回退 fallback 目录集（本 fixture 只建了 docs/adr）」。断言未动（行为本就正确）。

## 遗留清扫复核（本次范围内）

| 项 | 结果 |
|---|---|
| TODO / FIXME / XXX / HACK | `git diff` 新增行 grep **零命中** |
| 临时调试日志（`console.log`） | 新增行 **零命中** |
| 被 skip 的测试 | 新增用例无 `skip` / `only` |
| 未替换的 mock / 临时 fallback | 无（测试用 `createFakeCtx` 为既有 helper） |
| 半截实现 | 无（`assertRoleClassCompatible` / `classPermissions` / `archRoots` 三态分支全覆盖，含负向用例） |
| 未跟踪文件 | 无遗漏（`design.md` 已补齐，`openspec status` = 3/3 artifacts） |

## 归档前条件核对

- ✅ `openspec/tasks` 全勾：**31/31**（C.11 行已改为「已拆出 → change `resume-precheck-guidance`」）
- ✅ `openspec validate backend-handoff-role-class` 通过
- ✅ 工件齐备：proposal / design / tasks（`skip_specs` ⇒ 无 spec delta）
- ✅ 治理面评审闭合：oracle 1 轮 BLOCK（已闭）→ critic 1 轮 BLOCK（已闭）→ critic 复审 2 轮（REJECT 已闭 → **APPROVE / mergeable: yes**）
- ✅ 遗留清扫通过

## 结论

**PASS** —— AC1–AC31 逐条有工具证据；第 1 轮发现的 3 处证据缺口已补测试并复验通过；无未闭合失败项。可归档
（`openspec archive backend-handoff-role-class --skip-specs`）。

## 附：AC 与 ADR V 的映射

ADR「Verification」章的 V1–V21 与本表 AC 的对应见 `docs/adr/ADR-backend-handoff-role-class.md` 元数据「AC 映射」行；
本次验收**未发现** V 与 AC 之间的矛盾（V15–V21 ↔ AC24–AC31 逐条对齐，AC 侧证据见上表）。
