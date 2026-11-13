# backend-handoff-role-class — 派发契约显式化：`role_class` + 凭据化 handoff

> 决策：`docs/adr/ADR-backend-handoff-role-class.md`（**Accepted**，2026-11-13 用户签批；oracle 1 + metis 1 + critic 1 轮）
> 设计：`docs/backend-handoff-role-class.md`　输入：`.rddf/improvements/backend-handoff-role-class.md`
> planner 审查：metis 1 轮（`.rddf/reviews/backend-handoff-role-class-planner-review.md`）
> **本文件的 AC 表是逐条验收的唯一口径**。此前的 `.rddf/reviews/backend-handoff-protocol-spec.md`（v3）AC 表已过时，两处勘误见 §勘误。

## Why

派发契约缺「本次允许做哪一类工作」。后果：写 ADR 的后端拿到代码 `scope`、跑验收的后端能改实现；后端遇计划决策时停下义务只在 prompt 里，主会话无凭据区分「交接」与「失败」；`resume` 不重设 permissions，扩 scope 必然白跑、brief 覆盖 class 则类漂移。同时派发方没有「任务 → 类」判据，新参数不会被填。

本 change 把身份变成**派发参数**（session 权限落实），把交回变成**凭据化流程**（`rddf feedback` + 首行标记 + 自然结束）。零新工具、零新状态机。

## What Changes

### A. 校验与权限（`lib/delegate-core.ts`）

1. `validateBrief`：`role_class` 值域与缺省（D1）；`kind=knowledge` 互斥（D1）。
2. 新增 `archRoots(workRoot)`（D3）：态 1 读 `arch-docs.json` 的 `arch_paths`；**态 2/3 回退 fallback 目录集的闭合清单** `ARCH_FALLBACK_DIRS`（8 项，与 `prompts/build.md` 目录集逐项一致、守卫钉住；取实际存在者）；仍无 ⇒ 空集 ⇒ architect 派发硬拒 + 提示跑 `scripts/arch-docs-init.sh`。**不在 TS 里复刻 survey 启发式**；survey 发现的其他目录须先固化进 `arch_paths` 才受管辖。
3. 新增 `assertRoleClassCompatible(brief, workRoot)`（D8）：`scope` 的**每一项**归一化后必须 ⊆ 该类 allow 集，**任一项越界即拒**（不是"有交集即放行"）；resume 与 `pair.json` 记录比对；落点在 `session.create` 与 `registerSession` 之前。
4. 新增 `classPermissions(roleClass)`（D4）：edit 规则 + subagent 规则单一实现，同步 / 异步两链路共用。顺序为 `edit:* deny` **在前**、按类 allow **在后**（`evaluate` 取 findLast）。**（D3 修订）**`builder` 类在数组**末尾**追加 arch root 的 `edit deny`（资源形态 `<root>` + `<root>/*`，含绝对路径形式；`write`/`patch` 同 action 一并覆盖），位置恒为末尾。
5. **（D3 修订）**`assertRoleClassCompatible` 的 `builder` 分支：任一 scope 项**落在** arch root 内 ⇒ 拒派发（realpath 解析，含软链两方向）；scope 为 arch root 祖先 ⇒ 放行（减法在权限层）；archRoots 为空 ⇒ 不校验。`archRoots` 的 fallback 用**闭合清单**（与 `prompts/build.md` 目录集一致，守卫钉住）。
5. `buildBrief()`（D5/D6）：新增「运行身份」段（含"发现实际任务不在本类 allowlist ⇒ 停手 `HANDOFF: blocked`"）+「执行要求」按 class 分支。
6. `writeRoleSession` / `registerSession` / resume 分支（D2/D6）：写 `role_class`（`current_role` 保持 `builder`）、`pair.json` 持久化、resume **忽略**入参 class 并用持久化值生成简报（不一致即抛）；存量条目缺字段按 `builder`。
7. `sessions` 工具 items（D6）：从 `pair.json` 回显 `role_class`（只读字段，零新状态）——否则主会话只能猜或手读状态文件。

### B. 工具入参（`lib/delegate-core.ts` / `lib/delegate-async.ts`）

8. `delegate` / `dispatch` 的 input schema 接受 `role_class`（缺省 `builder`）；`vanished` 重建（D12 路径）沿用被续接条目的 class，不回落缺省。

### C. Prompts（治理面文本，**归属 architect**，planner 不落笔）

9. `prompts/build.md`：
   - HANDOFF 契约（5 项模板、kind 枚举、先落记录后标记）；
   - **首行优先级**：HANDOFF 回合省略角色开场报告（否则 `final_is_role_opening=true` + 零写盘 ⇒ `no_work_evidence` ⇒ `outcome=unverified`，交接被系统判成失败）；
   - **被派发 session 禁用窗口内切角色**（`build.md:513/537-550` 现教 builder→architect/planner 自动切，与 D6 冲突）；
   - architect 转 Status 的硬边界（仅本次 Draft ADR + 双审闭合 + 完成标志 5 条，否则 `HANDOFF: blocked`）；
   - 「状态来源」补 `role_class` 读取规则。
10. `prompts/plan.md` 派发表 + `prompts/front.md`：加「任务 → 类」判据（实施 ⇒ builder；写改 ADR / 架构文档 ⇒ architect；只取证与判决 ⇒ verifier；选错 ⇒ `HANDOFF: blocked`）。
11. **拆出（已决策，2026-11-13 用户确认保持拆出）**：`prompts/plan.md` / `prompts/front.md` 的 **resume 前置判据**不服务本 change 的不变式（"身份在 create 时定型"），且与已归档的 `front-async-resume-guard` 判据相邻 ⇒ 单独立 **prompts-only change**，避免措辞争议污染 lib 验收。**该 change 的内容（4 条，立项时直接据此起草）**：
    1. **先确认状态**：`sessions` 看目标后端 `state`；在跑 ⇒ 不投递（lib 侧已有 `front-async-resume-guard` 的 `stillRunning` 结构性拒绝，prompt 只补"不要绕"）。
    2. **读凭据**：resume 前读 `rddf feedback list <proposal>`（权威）；`rddf` 不可用 ⇒ 读 `last_assistant_text` 的 5 项正文。
    3. **新 brief 逐条回应交接 5 项**：至少回应第 ③ 项（需要什么决策）→ 写成新 `task`。
    4. **扩 scope ⇒ 新建 session**：resume 不改 permissions ⇒ 只能新建，并声明"上下文不继承、计划要点重贴"。

    规模：2 文件 × 约 8–12 行，**0 行代码**，AC 全为 prompt 级（不进 CI）。**立项时机待定**（建议本 change 合并后）。

## 验收标准

| AC | 判据 | 证据载体 |
|---|---|---|
| AC1 | `role_class` 缺省 `builder`（仅指 `undefined`）；`null` / `""` / 其他值 ⇒ 抛 | `tests/delegate-core.test.ts` |
| AC2 | `kind=knowledge` + 任意 `role_class` ⇒ 抛 | 同上 |
| AC3 | `architect` + `scope: ["src/**"]` ⇒ 拒；+ `docs/adr/x.md` / `.rddf/reviews/x.md` / `.rddf/config/arch-docs.json` ⇒ 放行 | 同上（正反例） |
| AC4 | `verifier` 的 session 权限**净效果**：`edit .rddf/reviews/x.md` ⇒ allow，`edit src/a.ts` ⇒ deny（断言 `evaluate` 结果，**不按下标断言**）；`builder` 类同理按 scope 判 | `tests/delegate-async.test.ts` + `tests/delegate-core.test.ts` |
| AC5 | 三类 `subagent` 净效果：`explore/librarian/oracle/metis/critic` ⇒ allow，`general` / `context-builder` ⇒ deny | 同上 |
| AC6 | `role.json` 分区出现独立 `role_class`，`current_role` 仍为 `builder`；旧读者按 `?? "builder"` 解释该字段 | `tests/delegate-core.test.ts` |
| AC7 | `pair.json` 持久化 `role_class`；resume 带不同 class ⇒ 硬拒；简报文本取自持久化值 | 同上 |
| AC8 | HANDOFF 结束的**同步**轮次后 `pair.state === "idle"`（且同 owner 可即刻再派） | `tests/delegate-tool.test.ts` |
| AC9 | 简报文本包含 HANDOFF 5 项模板与正确 `rddf feedback add` 命令（字符串断言，CI 可测）；"记录实际落点正确"为手工项 | `tests/delegate-core.test.ts`（简报断言）+ 手工 |
| AC10 | `scope=["."]` / `["src/../docs/adr"]` / 绝对路径三种写法判定一致；`architect + ["."]` ⇒ 拒 | `tests/delegate-core.test.ts` |
| AC11 | 无 `set_class` 类工具（工具名表断言）；resume 不接受不同 class（= AC7） | `tests/delegate-tool.test.ts` |
| AC12 | 回归：`bun test tests/` 全绿 + `scripts/check-upstream-anchors.sh` 23/23 + 父篇 D4/D7 相关 describe 全绿（`slot` / `priority` / `owner`） | 全量 |
| AC13 | （prompt 判据）`builder` **scope 含 `docs/adr`** 时被要求"先改 ADR"⇒ `docs/adr/**` 零变更 + feedback 记录 + `idle`；scope 不含时由 AC3 结构性覆盖 | 手工 e2e（写死 scope） |
| AC14 | （prompt 判据）architect session 的 `subagent` 权限被置 deny（fixture：测试内构造该类 session 权限）⇒ 必须 `HANDOFF: blocked`，不得自审自批 | 手工 e2e + fixture |
| AC15 | `archRoots` 三态：配置可用 / 缺失 / 为空 / JSON 损坏；**全无 ⇒ architect 派发被拒**且错误信息指向 `scripts/arch-docs-init.sh` | `tests/delegate-core.test.ts` |
| AC16 | `buildBrief()` 输出含「运行身份」段、含本类专属执行要求、**不含**别类的执行要求 | 同上 |
| AC17 | 存量 `pair.json` 条目缺 `role_class` + resume ⇒ 按 `builder` 解释（不抛错） | 同上 |
| AC18 | `architect` + symlink 指向 `src` 的 scope ⇒ 拒（语义越界，不只语法归一化） | 同上 |
| AC19 | `vanished` 重建（D12 路径）沿用被续接条目的 `role_class`，不回落 `builder` | `tests/delegate-async.test.ts` |
| AC20 | `sessions` items 含 `role_class`（来自 `pair.json`） | 同上 |
| AC21 | HANDOFF fallback：`rddf` 不可用或额度耗尽（写不进）⇒ 仍输出首行 + 完整 5 项正文，主会话可读 `last_assistant_text` 恢复 | `tests/delegate-tool.test.ts`（CLI 缺失 fixture）+ 手工 |
| AC22 | `buildBrief` 文本含「HANDOFF 回合省略角色开场报告」的优先级句 | `tests/delegate-core.test.ts` |
| AC23 | 不为 HANDOFF 文本新增解析器 / 状态 / outcome 值：`SlotState` 枚举与 outcome 值集合无新增项 | `tests/config-guards.test.ts` 断言枚举 |
| AC24 | （D3 修订）`builder` + scope **落在** arch root 内（`docs/adr` / `docs/adr/x.md` / `docs/adr/../adr` / `./docs/adr/` / 绝对路径）⇒ **派发被拒**，错误信息指名 `architect` 类；混合 scope（`["src","docs/adr"]`）同样拒 | `tests/delegate-core.test.ts` + `delegate-tool.test.ts` |
| AC25 | （D3 修订）`builder` + scope 是 arch root 的**祖先**（`.` / `docs`）⇒ 放行，权限**净效果**：`edit docs/adr/x.md` ⇒ deny、`edit src/a.ts` ⇒ allow、`edit docs/adr2/x.md` ⇒ **allow**（负向）、绝对路径写形式 ⇒ deny | `tests/delegate-core.test.ts` |
| AC26 | （D3 修订）`write` / `patch` 工具与 `edit` **同一 action** ⇒ 同被 deny；`grants` 注入 `edit` 仍 deny（`GRANT_FORBIDDEN` 兜底） | 同上 |
| AC27 | （D3 修订）symlink 两方向：(a) arch root 自身是软链 ⇒ 派发按窄目标拒（解析后落在工程根外 ⇒ 按 AC28 处理）；(b) scope 项软链进 arch 树（`docs/x` → `docs/adr`）⇒ 派发被拒 | 同上（`symlinkSync` fixture） |
| AC28 | （D3 修订）`archRoots` 为空（无配置且 fallback 目录集**一项都不存在**）⇒ 减法退化为空集、不追加 deny、`builder` 按 scope 写；错误文案回退为「本工程没有架构文档目录」 | 同上 |
| AC29 | （D3 修订）worktree 下 `archRoots` 与权限资源**同根**（`workRoot`）：`git worktree` 中的派发，deny 命中 worktree 内路径 | `tests/delegate-tool.test.ts` |
| AC30 | （D3 修订）`archRoots` 的 fallback **闭合清单**（`docs/adr`、`docs/architecture`、`docs/architecture/adr`、`docs/designs`、`docs/design`、`adr`、`rfc`、`specs`）与 `prompts/build.md` §架构文档范围 的目录集**逐项一致**（守卫测试，防两份定义漂移） | `tests/config-guards.test.ts` |
| AC31 | （D3 修订）`builder` 类且存在 arch 目录 ⇒ 简报「运行身份」段回显不可写目录（`架构文档目录（不可写，属 architect 类）: …`） | `tests/delegate-core.test.ts` |


## Acceptance（勾选镜像）

> 判据正文以本文件「验收标准」表为准；本段只提供可勾选清单（供 `rdd-verifier` skill 读取）。**逐条证据见对应表行**。

- [ ] AC1 `role_class` 缺省 builder；非法 / `null` / `""` 抛
- [ ] AC2 `kind=knowledge` + `role_class` 抛
- [ ] AC3 class×scope 相容（正反例）
- [ ] AC4 edit 权限**净效果**（allow / deny 各一）
- [ ] AC5 subagent 白名单净效果 + 排除 `general` / `context-builder`
- [ ] AC6 `role.json` 独立 `role_class`，`current_role` 仍 `builder`
- [ ] AC7 `pair.json` 持久化 + resume 比对 + 简报取持久化值
- [ ] AC8 同步轮次后 `pair.state === "idle"`
- [ ] AC9 简报含 5 项模板与正确命令（CI）+ 实际落点（手工）
- [ ] AC10 scope 三种写法一致
- [ ] AC11 无 `set_class` 类工具
- [ ] AC12 全量回归绿 + anchors 23/23
- [ ] AC13 （手工）builder 越类写 ADR ⇒ 零变更 + feedback + idle
- [ ] AC14 （手工）`subagent` 被拒 ⇒ `HANDOFF: blocked`，不自审自批
- [ ] AC15 `archRoots` 四态 + 全无 ⇒ 派发被拒
- [ ] AC16 `buildBrief` 输出断言
- [ ] AC17 存量条目缺 `role_class` ⇒ `builder`
- [ ] AC18 symlink 语义越界 ⇒ 拒
- [ ] AC19 `vanished` 重建沿用 class
- [ ] AC20 `sessions` items 回显 `role_class`
- [ ] AC21 HANDOFF fallback（`rddf` 不可用 / 额度耗尽）
- [ ] AC22 简报含 HANDOFF 首行优先级句
- [ ] AC23 无新增 `SlotState` / outcome 值
- [ ] AC24（D3 修订）builder + scope 落 arch ⇒ 派发被拒
- [ ] AC25（D3 修订）宽 scope 的 arch deny 净效果（含 `docs/adr2` 负向）
- [ ] AC26（D3 修订）write/patch 同 action；grants 不能抵消
- [ ] AC27（D3 修订）symlink 两方向
- [ ] AC28（D3 修订）archRoots 空集退化
- [ ] AC29（D3 修订）worktree 同根
- [ ] AC30（D3 修订）fallback 闭合清单与 build.md 目录集一致
- [ ] AC31（D3 修订）简报回显不可写目录

## 非目标

- 不新增 `handoff` 工具、`SlotState`、delivery 判态、session metadata 字段；**HANDOFF 文本永不参与任何判定**（不为它新增正则门禁）。
- 不新增 `architect` / `verifier` agent；不扩 `ALLOWED_AGENTS`；不写三套 prompt。
- 不做自动闭环（不自动改计划、不自动 resume）；`auto_switch_window` 对被派发 session 不生效。
- 不做 per-class `shell` 沙箱（shell 永不参与 class 判定）。
- 不做三类并行的槽位改造（父篇 D4 / 父篇 D7 不动）。
- 不修跨 worktree 同 `plan_ref` 并发（已知缺口，另立 ADR）。
- 不含 `plan.md` / `front.md` 的 resume 前置判据（拆为后续 prompts-only change，见 What Changes C.11）。

## 影响面与风险

| 面 | 影响 |
|---|---|
| 派发入参 | 新增 `role_class`（有缺省 ⇒ 向后兼容） |
| 状态文件 | `pair.json` / `role.json` 分区新增字段（增量，旧读者 `?? "builder"`） |
| 观测面 | `sessions` items 新增只读 `role_class`（无新状态） |
| 行为 | 越类写盘由"可以但靠嘱咐"变为"结构性拒绝"；换类必须 handoff |
| 用户可感知 | **换类与扩 scope 都是新 session，模型上下文不继承**；延续的只有文件、凭据、登记 |
| 代价 | 三类共享 `revision_count`；单槽不豁免 ⇒ 串行 |
| 风险 | `shell` 仍可重定向越界（与现状等价）；architect 类被 `cancel` 留半成品 ADR（主会话复核收尾）；`rddf feedback` 通道已知不一致 ⇒ 必须有 AC21 的文本 fallback |

## 依赖与顺序

1. **C.9 / C.10（prompt 文本）已先行落地**（2026-11-13，用户指令）：治理面契约先入，让派发方与后端尽早对齐口径；**代价是落地 lib 前有一段"机制未启用"窗口**（三份 prompt 均带降级口径，见 C.9 的缺级句与 plan/front 的「机制未启用时」提示）。
2. **A → B**（入参依赖校验函数）→ 单测 → 文档同步。A/B 落地即**关掉该窗口**，三处降级口径随之失效（可保留作存量派发的兜底）。
3. **C.11 拆出（已决策）**：resume 前置判据属 prompts-only，**用户 2026-11-13 确认保持拆出**；该 change 的 4 条内容已写在 What Changes C.11，立项时直接据此起草（本 change 合并后）。
4. 不改父篇 D4/D7 判据；与 `ADR-plan-delegate-engineering-session` 无冲突。

## 勘误（此前文档已过时，以本表为准）

1. **权限顺序**：v2 的 AC 曾写「`edit: * deny` 在后」——**反了**（`scopeEditRules` 是 `* deny` 在前、按类 allow 在后，`lib/delegate-core.ts:547-553`，`evaluate` 取 findLast）。按错顺序实施会让 verifier 连 `.rddf/reviews/**` 都写不了，且测试若只断言「数组含两条」仍会通过。spec v3 与 ADR V4 已改为**断言净效果**，本表沿用。
2. `ADR` 元数据「AC 映射」写 `AC1–AC13`，正文实为 14 条——现由本表扩为 AC1–AC23，ADR 引用时应回填。
