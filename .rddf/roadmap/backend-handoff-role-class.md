# backend-handoff-role-class — 执行计划（planner 产出）

> 决策：`docs/adr/ADR-backend-handoff-role-class.md`（**Accepted** 2026-11-13）
> 逐条验收口径：`openspec/changes/backend-handoff-role-class/proposal.md` 的「验收标准」表（AC1–AC23）
> 本文件是**builder 的输入**：canonical 的 `.rddf/plans/backend-handoff-role-class.md`（TDD 5 步）与 `openspec/changes/backend-handoff-role-class/tasks.md` 由 **builder** 生成（工件归属：`rdd-workflow-writing-plans` / `rdd-builder` owns）。本文件不替代它们，只给出可直接物化的任务分解与验收清单。

## 1. 实施分解

**已落地**（2026-11-13，用户指令先落治理面文本）：块 E（prompt 侧 C.9 / C.10）+ ADR 状态与编号同步 + 文档。**剩余**：块 A–D（lib 侧）。

TDD 纪律：**每块先写测试（红）→ 再实现（绿）→ 跑该块测试**。每任务 2–5 分钟粒度。

| # | 步 | 任务 | 产出 | 判据 | 依赖 |
|---|---|---|---|---|---|
| A1 | 红 | `validateBrief` 的 `role_class` 值域 + 缺省 + `null`/`""` 非法 + `kind=knowledge` 互斥 | `tests/delegate-core.test.ts` 新 describe | AC1 / AC2 / AC20 | — |
| A2 | 绿 | 实现值域归一与互斥校验（缺省只认 `undefined`） | `lib/delegate-core.ts` | A1 绿 | A1 |
| A3 | 红 | `archRoots` 四态（配置可用 / 缺失 / 空 / 损坏）+ **全无 ⇒ architect 派发被拒** + 错误信息指向 `arch-docs-init.sh` | 同 A1 文件 | AC15 | A2 |
| A4 | 绿 | 实现 `archRoots`（态 2/3 **只回退 `docs/adr`**，不复刻 `survey()` 启发式） | `lib/delegate-core.ts` | A3 绿 | A3 |
| A5 | 红 | class×scope 相容：`architect + ["src/**"]` 拒、`+ ["docs/adr/x.md"]` 放行、`+ ["."]` 拒、symlink 指向 `src` 拒、三种 scope 写法判定一致 | 同 A1 文件 | AC3 / AC10 / AC18 | A4 |
| A6 | 绿 | 实现 `assertRoleClassCompatible(brief, workRoot)`：**每项** ⊆ 类 allow 集（不是"有交集"）；落点在 `session.create` / `registerSession` 之前 | `lib/delegate-core.ts` | A5 绿 | A5 |
| A7 | 红 | `classPermissions` **净效果**断言（`evaluate` 结果，不按下标）：verifier 的 `edit .rddf/reviews/**` allow / `edit src/**` deny；三类 subagent 白名单 allow、`general`+`context-builder` deny | `tests/delegate-async.test.ts` + `tests/delegate-core.test.ts` | AC4 / AC5 | A6 |
| A8 | 绿 | 实现 `classPermissions`（`edit:* deny` 在前、按类 allow 在后）+ 两链路共用 | `lib/delegate-core.ts` | A7 绿 | A7 |
| B1 | 红 | `buildBrief()` 输出断言：含「运行身份」段、含本类专属执行要求、**不含**别类执行要求、含 HANDOFF 首行优先级句 | `tests/delegate-core.test.ts` | AC16 / AC22 | A8 |
| B2 | 绿 | 实现运行身份段 + 按 class 分支的执行要求 | `lib/delegate-core.ts` | B1 绿 | B1 |
| B3 | 红 | `role.json` 出现独立 `role_class` 且 `current_role` 仍 `builder`；`pair.json` 持久化；resume 带不同 class ⇒ 硬拒；简报文本取自持久化值 | 同 A1 文件 | AC6 / AC7 | B2 |
| B4 | 绿 | 实现持久化与 resume 比对（resume **忽略**入参 class） | `lib/delegate-core.ts` | B3 绿 | B3 |
| B5 | 红 | 存量条目缺 `role_class` ⇒ 按 `builder` 解释；`vanished` 重建沿用 class | `tests/delegate-core.test.ts` + `tests/delegate-async.test.ts` | AC17 / AC19 | B4 |
| B6 | 绿 | 实现兼容与沿用 | `lib/delegate-core.ts` + `lib/delegate-async.ts` | B5 绿 | B5 |
| B7 | 红 | `sessions` items 含 `role_class`（来自 `pair.json`） | `tests/delegate-async.test.ts` | AC20 | B6 |
| B8 | 绿 | 实现只读回显 | `lib/delegate-async.ts` | B7 绿 | B7 |
| C1 | 红 | `delegate` / `dispatch` 的 input schema 接受 `role_class`；未知/非法值按 A2 抛 | `tests/delegate-tool.test.ts` | AC1 / AC2 | A2 |
| C2 | 绿 | 工具入参 + 透传到简报与校验 | `lib/delegate-core.ts` + `lib/delegate-async.ts` | C1 绿 | C1 |
| D1 | 验 | HANDOFF fallback：`rddf` 不可用 / 额度耗尽 ⇒ 仍输出首行 + 完整 5 项正文（**prompt 级**，落 `prompts/build.md` 已完成；此处只需一条断言或明确标注为手工） | `tests/delegate-tool.test.ts` 或手工 | AC21 | — |
| D2 | 验 | 同步轮次结束后 `pair.state === "idle"` | `tests/delegate-tool.test.ts` | AC8 | — |
| D3 | 验 | 全量回归：`bun test tests/` + `scripts/check-upstream-anchors.sh` | — | AC12 | 全部 |
| D4 | 写 | 文档同步：`docs/MULTI-AGENT-DESIGN.md` 一句汇总 + `docs/CHANGELOG.md` 条目 | — | — | D3 |
| D5 | 写 | 生成 `.rddf/plans/backend-handoff-role-class.md`（TDD 5 步）+ `openspec/changes/backend-handoff-role-class/tasks.md`（勾选 A1–D4） | builder 工件 | — | 本文件 |

**实施顺序**：A → B → C → D。块内严格红→绿。**A 与 B 可并行**（不同文件、不同 describe），C 依赖 A2，D 收口。

## 2. 验收内容

### 2.1 判据来源（按 `prompts/build.md` §verifier 产出契约 的优先级）

1. 用户本次明确给出的验收条件 —— 本 change 无追加；
2. `openspec/changes/backend-handoff-role-class/proposal.md` 的「验收标准」表（AC1–AC23）+ `## Acceptance` 勾选镜像 —— **主判据**；
3. 本次变更自己声明的行为（ADR D1–D9）；
4. ADR「Verification」V1–V14（= AC1–AC14 的上位判据）。

### 2.2 验证方式分组

| 组 | AC | 方式 | 载体 / 命令 |
|---|---|---|---|
| **自动化**（进 CI） | AC1–AC12、AC15–AC20、AC23 | 单测 / 集成 | `bun test tests/`（`tests/delegate-core.test.ts` / `tests/delegate-async.test.ts` / `tests/delegate-tool.test.ts` / `tests/config-guards.test.ts`） |
| **手工 e2e**（不进 CI，模型行为不确定 ⇒ 会 flaky） | AC13 | 给 `builder` 类后端一个 scope **含** `docs/adr` 的「先改 ADR 再实现」任务 ⇒ 断言 `docs/adr/**` 零变更 + feedback 记录 + `idle` | 手工；scope 须写死，否则结构性已拒、断言无意义 |
| **手工 e2e** | AC14 | 用 fixture 构造 `subagent` 被 deny 的 architect session ⇒ 断言 `HANDOFF: blocked`、未自审自批 | 手工 + fixture |
| **手工**（外部 CLI 依赖，非 hermetic） | AC9（落点部分）、AC21 | `rddf feedback add` 实际落点、`rddf` 不可用时的文本 fallback | 手工；`rddf` 缺失 ⇒ 记 SKIP 并说明证据来源（`last_assistant_text`） |
| **观测项**（不作门禁） | AC3/AC8 的 handoff 首行、`summary.last_assistant_text` | 只读观测 | 不进断言（模型文本格式会漂移） |

### 2.3 验收顺序（早失败早停）

1. 编译 / 静态检查（本仓无编译步骤 ⇒ 以 lint/类型检查替代项：无；直接进单测）
2. 单元测试（`bun test tests/`）⇒ 必须 0 fail
3. 集成 / e2e：delegate / dispatch 派发链路（`tests/delegate-tool.test.ts`）+ `sessions` 回显（`tests/delegate-async.test.ts`）
4. 边界与错误路径：非法 class、`null`/`""`、knowledge 互斥、scope 越界 / `["."]` / symlink、resume class 不一致、存量条目缺字段、vanished 重建、`rddf` 不可用 / 额度耗尽
5. 遗留清扫复核（本次范围内）：TODO / 半截实现 / 注释掉的代码 / 临时日志 / 被 skip 的测试 / 未替换的 mock / 临时 fallback

### 2.4 验收角色与失败处置

- 验收人：**verifier**（角色内建，不改实现）。轮次上限 3（`RDDF_VERIFIER_MAX_LOOPS=3`）；第 3 轮仍失败 ⇒ `halted` 交用户裁决。
- 失败分类：`implementation_gap`（实现缺失 / 判据不满足）⇒ 回 **builder**；`proposal_drift`（实现与 AC 不符）⇒ 回 **planner**（改提案 AC）。
- 报告落点：`.rddf/reviews/backend-handoff-role-class-verify.md`（必含：判据来源、逐条判定 + 证据、失败项与路由、遗留清扫结果、已用轮次）。
- 路由判定（`prompts/build.md` §verifier 产出契约）：本 change **无 openspec spec delta**（`skip_specs: true`）⇒ `rddf rdd-verify --dry-run` 若报「No eligible changes」⇒ 走本地验收 2.1–2.3。

## 3. 派发方案（planner → 工程 session）

本 change 恰好是 `role_class` 机制的**首次真实使用**，但有先后手问题：

- **现在只能派 `builder` 类**：`role_class` 字段在 lib 落地前会被**静默忽略**（`validateBrief` 不拒未知键）⇒ 后端按缺省 `builder` 执行（prompt 降级口径已写）。
- ⇒ **实施派发**：`role_class` 留空 / 填 `builder`；别指望后端自己分角色。
- ⇒ **机制自举**：`architect` / `verifier` 类派发要等 A/B 落地（尤其 `buildBrief` 的运行身份段 = B2）才有意义；届时用本 change 自己做一次 dogfood（派一个 `verifier` 类后端验收本 change 的实现）。

派发简报要素（planner 出面，按 `prompts/plan.md` 的选类表 + 硬规则）：

| 字段 | 值 |
|---|---|
| `plan_ref` | `openspec/changes/backend-handoff-role-class/proposal.md` |
| `role_class` | `builder`（机制未启用 ⇒ 等价于缺省） |
| `scope` | `lib/delegate-core.ts`、`lib/delegate-async.ts`、`tests/delegate-core.test.ts`、`tests/delegate-async.test.ts`、`tests/delegate-tool.test.ts`、`tests/config-guards.test.ts` |
| `acceptance` | AC1–AC12、AC15–AC20、AC23（自动化组）+ 「`bun test tests/` 0 fail + anchors 23/23」 |
| `constraints` | 不 commit / 不 push；不改父篇 D4/D7 判据；不扩 `ALLOWED_AGENTS`；不新增 `SlotState` / outcome 值 |

## 4. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| 「机制未启用」窗口内派发方填 `role_class` 被静默忽略 | 三份 prompt 均带降级口径（`prompts/build.md` 派发节 + 状态来源 + plan/front 各一句） | 删 prompt 侧口径 ⇒ 回到"无 role_class 概念" |
| lib 侧实现偏差（顺序 / 归一化两处各写一份） | A5/A7 先写净效果断言；`classPermissions` 单点实现，两链路共用 | 校验函数抽回 `delegate-core` 单一导出 |
| 交接被误判失败（开场报告抢首行） | prompt 首行优先级 + AC22 断言 | 后端改回无 HANDOFF 标记（凭据仍在 feedback） |
| architect 类自审自批 | prompt 明禁 + AC14 手工 e2e | `subagent` 白名单改为空（后端退化为不可自审） |
| 跨 worktree 同 `plan_ref` 并发（已知缺口） | 单槽 + `revision_count` 共享 | 另立 ADR |

## 5. 待用户/后续决定

1. **实施是否走派发**（用本机制自己派自己）还是直接切 builder 在主会话做 —— 后者更简单，前者是 dogfood。
2. **C.11 已定拆出**（用户 2026-11-13 确认保持拆出）：prompts-only change，四条内容写在 proposal 的 What Changes C.11；**立项时机待定**（建议本 change 合并后）。
3. **跨 worktree 同 `plan_ref` 并发**的缺口另立 ADR 的时机。
