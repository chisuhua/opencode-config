# 验收报告 — role-aware-permissions

> **轮次**：**第 2 轮（终）**（`verifier` 角色，2026-11-17）｜**上限** 3 轮（`RDDF_VERIFIER_MAX_LOOPS`）
> **判据来源**（按优先级）：`openspec/changes/role-aware-permissions/proposal.md` 的 `## 验收标准`（AC1–AC24）
> ← 两份已签批 ADR 的 V 项（`ADR-role-session-identity` V1–V10 / `ADR-role-aware-permissions` V1–V14）。
> 用户本次未口头追加验收条件。

## 0. 结论（**第 2 轮 · 最终**）

| 项 | 结果 |
|---|---|
| 判据总数 | 24（AC1–AC24） |
| 通过 | **24** |
| 不通过 | 0 |
| 不可判定 | 0（层 2 的 8 条 representative **已实跑**，不是 skip） |
| 判定 | **PASS**（`ac-fail` 已闭合；轮 1 的 1 条已复验通过） |

**轮次轨迹**：
- **轮 1**：23/24 —— AC16 第三支不通过（`archRoots()` 与 `resolveArchPaths()` 是同一语义的两份实现）
  ⇒ `implementation_gap` ⇒ 路由回 builder。
- **轮 2**：24/24 —— builder 提交 `d396c08`（`archRoots()` 委托 `resolveArchPaths()` + 源码级/行为级守卫 +
  变红演练）⇒ 本轮只复验 AC16 + 全量回归 + 层 2 `RG-1`/`RG-2`（arch 边界影响派发面）。

（附注：AC16 措辞「spawn 规则构建器共用 `role-policy`」与 ADR D3「后端仍走 `scopeEditRules`」在**字面**上偏紧，
本轮按「单一真源 = arch 目录解析单点」判定；措辞校准交 planner 择机处理，**不阻塞**。）

## 1. 静态 / 单测（层 1a + 1b）

```bash
bun test tests/                                       # 689 pass / 0 fail   (exit 0)
bash scripts/check-upstream-anchors.sh                # RESULT: OK（23/23 个语义锚点全部命中）
openspec validate role-aware-permissions --strict     # Change 'role-aware-permissions' is valid
```

| AC | 命令 | 证据（摘要） | 判定 |
|---|---|---|---|
| AC1 | `bun test tests/role-identity.test.ts -t AC1` | 3 pass / 0 fail（SID_A=architect、SID_B=verifier，同文件不同结果） | ✅ |
| AC2 | `bun test tests/role-identity.test.ts -t AC2` | 5 pass / 0 fail（mirror / global / default 三分支断言 `source`；sid 缺失跳过镜像） | ✅ |
| AC3 | `bun test tests/role-policy.test.ts -t "非 build 主会话"` | 6 pass / 0 fail（`shouldGateSession({agent:"plan"\|"front"})` ⇒ false；成对 `build` ⇒ true） | ✅ |
| AC4 | `bun test tests/role-lease.test.ts -t AC4`（2 pass）+ 真脚本失败路径 | 切换后其它分区 deep-equal、`legacy` 未变、`history` 追加、上限 20；**中途失败**：`role-switch.sh` 冲突 ⇒ `exit=1` + `role.json` 与 `role-claims.json` **sha256 均未变** + 文案指名持有者 | ✅ |
| AC5 | `bun test tests/role-lease.test.ts -t AC5` | 2 pass（目录不可写 / 目标被占成目录）⇒ 原文逐字节不变、无 `.tmp-*`；`ls .rddf/state/.tmp-*` ⇒ 无残留 | ✅ |
| AC6 | `bun test tests/role-session-write.test.ts` | 5 pass（后端分区 `current_role:"builder"` + `role_class`；不写顶层；`agent!=="build"` 抛错） | ✅ |
| AC7 | `bun test tests/role-lease-ac7.test.ts` | 2 pass（子进程 barrier + 临界区内 sleep 15ms ⇒ 两分区都在、marker 各 1；`no-op` 锁变异 ⇒ 必然丢失） | ✅ |
| AC8 | `bun test tests/role-lease.test.ts -t AC8` | 5 pass（`by=auto` ⇒ `updated_by`/`history.by` 同步；`used+1`；超限拒；窗口外角色拒；`--exit` 清空） | ✅ |
| AC9 | 全量 + anchors + `tests/config-guards.test.ts` | 689 pass / 0 fail；anchors 23/23；三步字面与突变锚点由「独立会话机制」2 pass +「突变测试」3 pass 守住 | ✅ |
| AC10 | `bun test tests/role-identity.test.ts -t AC10` | 2 pass（真实 `canonicalRoot`；linked worktree 三次读同一文件同一分区；symlink 变体同键） | ✅ |
| AC11 | `bun test tests/role-policy.test.ts -t AC11` | 2 pass（`edit`/`write` 双动作均拒；message 含角色+路径+动作） | ✅ |
| AC12 | `-t AC12` | 1 pass（builder 写 `docs/adr/**` 放行，且不被治理面规则误伤） | ✅ |
| AC13 | `-t AC13` | 2 pass（`no-role` 连架构文档也拒；成对：角色切换仍能完成） | ✅ |
| AC14 | `-t AC14` | 2 pass（architect 写 `<gov>/prompts/**` 放行；成对 planner 被拒） | ✅ |
| AC15 | `-t AC15` | 3 pass（planner 写 `src/**` 拒 / roadmap・improvements 放行 / `design.md` 拒） | ✅ |
| AC16 | `bun test tests/role-policy.test.ts -t AC16` | **4 pass / 0 fail**（策略表定义点唯一；身份解析定义点唯一；插件不带自己的表；**arch 目录解析单源**：源码级 + 三态行为级） | ✅（轮 1 曾 ❌，见 §3） |
| AC17 | `-t AC17` | 6 pass（后端三判据：`parentID` / `pair.json` 登记 / 分区 `role_class`；成对 `parentID=null` 必拒；非 build 跳过） | ✅ |
| AC18 | `bun test tests/role-lease-claims.test.ts -t AC18` | 3 pass（同角色冲突拒 + 指名 holder session/workRoot；`claimSlot` 结构化返回；调用方 `throw fail`） | ✅ |
| AC19 | `-t AC19` | 2 pass（不同键互不冲突；主 architect + 后端 verifier 成功） | ✅ |
| AC20 | `-t AC20` | 3 pass（两 `no-role` 并存且不落 claims；第二个 `general` 拒；无分区落 `general` 同样冲突） | ✅ |
| AC21 | `-t AC21` | 6 pass（探活失败+TTL ⇒ 接管 + 告警 + ledger；围栏 ①释放 ①b续租 ②写类调用三条独立失败；`claim_gen` 单调不减；四种损坏形态保守拒绝） | ✅ |
| AC22 | `-t AC22`（4 pass）+ 直测 | `mkdirSync(lockDir,{recursive:false})`（L1647）；直测：A 持锁 ⇒ B `获取锁超时`，A 释放 ⇒ B 成功；陈旧锁两侧边界；不按 pid 判活；锁内不再取锁 | ✅ |
| AC23 | `bun test tests/role-exemptions.test.ts` | 5 pass（六项在 AC / 测试注释 / 主题文档三处逐项命中 + 逐项有实质说明 + 删 D5③ 必红） | ✅ |
| AC24 | 全量 + anchors + 立场句/ask 守卫 | 689 pass；anchors 23/23；「突变测试」3 pass（含 `:196` 退回「软约束」必红、`:706` 破例回退必红）、「ask 档」2 pass | ✅ |

## 2. 层 2（真模型 + 真宿主，e2e 仓）

文件：`/workspace/main/rdd-workflow-e2e/tests/integration/test_role_gate_runtime.bats`（8 例，`E2E_REAL_RUNTIME=1`）。

| 例 | 覆盖 | 实跑 |
|---|---|---|
| RG-1 | AC18 同角色派发被拒（指名持有者 + 不产生新槽位） | ✅ |
| RG-2 | AC19 异角色并行放行 | ✅ |
| RG-3 | AC21 接管后旧持有者写被拒（指名现持有者） | ✅ |
| RG-4 | AC1 两会话各读各分区 | ✅ |
| RG-5 | AC10 linked worktree 根唯一 | ✅ |
| RG-6 | AC11 architect 写 `src/**` ⇒ 真 Tool.Error | ✅ |
| RG-7 | AC17 真后端不受门控 | ✅ |
| RG-8 | AC17 非 build 主会话跳过 | ✅ |

**层 2 的净收益（不是重复层 1b）**：真跑抓出 4 个层 1a/1b 全绿时未暴露的实现缺陷，均已修并复跑通过：
① 宿主参数名是 `path` 而插件读 `filePath` ⇒ **门控静默 fail-open**；
② `ctx.session.create` 不设 `parentID` ⇒ 后端被当主会话门控；
③ 门控跳过时仍做租约校验 ⇒ 用身份链角色而非 `role_class` 占错键；
④ 同步 `delegate` 面 `registerSession` 按 10 参调 8 参签名 ⇒ `work_root`/`state`/`bumpClaim` 被静默丢弃。

## 3. 轮 1 的不通过项（已闭合）

### AC16 · 单一真源（第三支）

**要求**：「插件与 spawn 规则构建器共用 `lib/role-policy.ts`」。

**证据**：
```bash
grep -n "role-policy" lib/*.ts plugins/*.ts
#  lib/role-policy.ts:2      ← 定义
#  plugins/role-gate.ts:21   ← 消费（evaluateWrite / extractWriteTarget）
#  （delegate-core.ts 无任何 import）

grep -n -A14 "function archRoots" lib/delegate-core.ts    # L821：自己的 arch 目录解析（config → fallback）
grep -n "ARCH_FALLBACK_DIRS\|resolveArchPaths" lib/role-policy.ts   # L41/L167：**另一份**同语义实现
```
`archRoots()`（`lib/delegate-core.ts:821`）与 `resolveArchPaths()`（`lib/role-policy.ts:167`）逐条同构
（配置命中 ⇒ 用配置；否则 fallback 目录集中实际存在者），**是同一语义的两份实现** ⇒「单一真源」不成立。
其余两支成立：身份解析定义点唯一（`role-identity`）、插件不带自己的策略表（用例已钉）。

**分类**：`implementation_gap`（语义可收敛，不涉决策）。
**修复（builder，commit `d396c08`）**：`archRoots()` 改为委托 `resolveArchPaths()`
（无循环引用：`role-policy` 只依赖 `role-identity` 的类型）；新增守卫（源码级：不得自己读
`arch-docs.json` / 不得引用 `ARCH_FALLBACK_DIRS`；行为级：三态逐个同输出），并做**变红演练**
（把 `archRoots` 改回自实现 ⇒ 该用例红，随后还原）。

**轮 2 复验证据**：
```bash
bun test tests/role-policy.test.ts -t AC16     # 4 pass / 0 fail
bun test tests/                              # 690 pass / 0 fail
bash scripts/check-upstream-anchors.sh       # RESULT: OK（23/23）
openspec validate role-aware-permissions --strict  # valid
bats -f RG-1 / -f RG-2（E2E_REAL_RUNTIME=1）  # 两条均 ok（arch 边界影响派发面）
```

## 4. 遗留清扫（本次范围内）

| 项 | 结果 |
|---|---|
| `.tmp-*` 残留 | 无（`ls .rddf/state/.tmp-*` 空） |
| TODO / FIXME / `debugger` | 无（`scripts/role-switch.ts` 的 `console.log` 是 CLI 正常输出，非调试日志） |
| 被 `skip` 的测试 | 无（`tests/role-*.test.ts` 无 `test.skip`） |
| 未替换的 mock | 无新增（层 1b 一律真文件 / 真子进程） |
| 临时 fallback 分支 | 无（`arch_paths` 三态与 claims 四种损坏形态都是**登记在案**的行为，非临时兜底） |
| 工作树 | 干净，仅运行时状态 `role-claims.json` 未跟踪（见 §5 观察 1） |

## 5. 观察项（不阻塞，登记备查）

1. ~~`role-claims.json` 未进 git 排除~~ ⇒ **已在 `d396c08` 修**（`.gitignore` 补 `.rddf/state/role-claims.json`）。
2. **`checkLeaseForWrite` 命中自己租约不刷新 `heartbeat_at`**：长会话 >30 min 且无写类调用时可被 TTL 接管（已在 backlog）。
3. **verifier 写集与矩阵措辞**：`ROLE_WRITE_POLICY.verifier` 允许 `.rddf/state/verifier/**`，而角色矩阵写「**手工**写」禁止 —— 措辞差，行为一致（已在 backlog）。
4. **ask 档 + `--auto`**：层 2 用 `--auto` 跑，故 e2e **不证明** ask 档有效；ask 档由层 1a 守卫单独钉住。

## 6. 已用轮次

- 本 change 验收：**第 2 轮（终）** —— 轮 1 判 1 条不通过（AC16）⇒ 修复后轮 2 只验 AC16 + 全量回归 + 层 2 RG-1/RG-2，
  24/24 通过。累计打回 1 次（上限 3 次，未耗尽）。
