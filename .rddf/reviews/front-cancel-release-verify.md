# 验收报告：front-cancel-release

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-11 |
| 验收者 | verifier（**只读 + 跑检查；不改实现**） |
| change | `openspec/changes/archive/2026-11-11-front-cancel-release/`（proposal AC1–AC19 ↔ ADR Verification F1–F19 同号） |
| 决策依据 | `docs/adr/ADR-front-cancel-release.md`（**Accepted**） |
| 判据来源（按优先级） | ① 用户本轮要求「独立一轮完整实现 + 独立验收（含变异验证与 E2E）」；② proposal 的 AC1–AC19；③ ADR 的 F1–F19；④ 实现自述（design.md） |
| 已用轮次 | 第 **1** 轮（上限 3） |
| 结论 | **PASS**（0 BLOCKER；2 项 SHOULD_FIX 已记录并修复；3 项环境限制如实登记） |

## 1. 验证顺序与结果

| # | 步骤 | 命令 / 证据 | 结果 |
|---|---|---|---|
| 1 | 静态检查 | `bunx --package typescript@5 tsc --noEmit ... lib/delegate-async.ts lib/delegate-core.ts` | **无新增错误**：仅 1 条 **pre-existing**（`delegate-async.ts:413` 的 `outcome.e` 窄化）；对 `HEAD` 版同文件比对确认改动前即存在 |
| 2 | 单元测试 | `bun test tests/` | **304 pass / 0 fail**（基线 284 + 新增 20）；1268 expect |
| 3 | 集成 / E2E | `E2E_REAL_RUNTIME=1 bats ... -f "L2-19\|L2-20\|L2-22\|L2-23\|L2-24"` | **L2-19 / L2-20 / L2-22 / L2-23 全绿**；**L2-24 绿**（见 `.rddf/reviews/front-cancel-release-e2e-evidence.md`） |
| 4 | 变异验证 | `scripts/mutate-cancel-release.sh` | **5/5 组变异均被对应用例捕获**（见 §3） |
| 5 | 上游锚点 | `scripts/check-upstream-anchors.sh --src /tmp/opencode/upstream-2.2.5` | **21/21**（19 既有 + 2 新增 A11/A12） |
| 6 | 遗留清扫 | `git diff` 的 `+` 行扫 TODO/FIXME/调试日志/注释代码/`.skip(` | **0 命中** |

## 2. 逐条 AC 判定（每条都有工具证据）

| AC | 判据摘要 | 证据（工具调用） | 判定 |
|---|---|---|---|
| AC1 | 假停机不放槽（`interrupt` 已受理但仍在跑 ⇒ 拒绝 + 仍占槽 + 后续 dispatch 被拒） | `tests/delegate-async.test.ts:612` 通过；变异 M1 让该用例变红 | **PASS** |
| AC2 | 终态可见 ⇒ 墓碑 + 放槽 + `event:"cancelled"`；槽位可再被占用 | 同文件 `:632` 通过 | **PASS** |
| AC3 | 退化 + 基线不在跑 ⇒ `degraded_no_evidence` + `stop_judge:"degraded"` | `:646` 通过 | **PASS** |
| AC4 | 退化 + 基线在跑 + 水位线前移 ⇒ 放行（`judge` 仍 `degraded`） | `:660` 通过 | **PASS** |
| AC5 | `wait_timeout` / `unreadable` ⇒ 拒绝、条目回原态 | `:670`（AC5a）+ `:680`（AC5b）通过 | **PASS** |
| AC6 | 已删（NotFound）⇒ D12：墓碑 + `outcome:"vanished"`（无 `event` 字段） | `:698` 通过（断言 `vanished.event === undefined`）；与 `ADR-front-multi-backend` 矩阵「已删 × 非墓碑 ⇒ 置 tombstone + 落 vanished」逐字一致（`grep` 核对 D12 表） | **PASS** |
| AC7 | `force` ⇒ 墓碑 + 放槽 + `cancel_forced` + `forced:true` + 风险文案 | `:721` 通过 | **PASS** |
| AC8 | 授权类拒绝 ⇒ `slot_reclaimed`、不墓碑、**不写** `cancel_pending`（**含 force 分支**） | `:735` 通过（`for withForce of [false,true]` 两轮） | **PASS** |
| AC9 | `cancel_pending` 挡住 reconcile（看起来空闲也不得被自动放行） | `:758` 通过；变异 M3 让该用例变红 | **PASS** |
| AC10 | `cancel_pending` 生命周期（`registerSession` 保留 / `sessions` 可见 / 成功释放与 D12 后消失） | `:779` + `:802`（AC10b）通过；变异 M4 让 AC10 变红 | **PASS** |
| AC11 | 钉住不削弱水位线（水位线相对**本次尝试**的快照） | `:822` 通过；变异 M5（改用钉住的基线）让该用例变红 | **PASS** |
| AC12 | 不占槽条目 ⇒ 幂等 no-op（`slot_already_released`） | `:843` 通过 | **PASS** |
| AC13 | 不占槽 + 证据不足 ⇒ 仍 `slot_already_released`（授权类优先） | `:854` 通过 | **PASS** |
| AC14 | ledger 可区分（`cancel_refused` / `cancel_forced`，不得混 `cancelled`） | `:864` 通过 | **PASS** |
| AC15 | 严格模式（多实例）+ `force` 仍可用（带 `strict_mode`） | `:882` 通过 | **PASS** |
| AC16 | 上游锚点全绿（≥19）+ 2 新增 | 脚本 **21/21**（`--src /tmp/opencode/upstream-2.2.5`，v2.2.5 导出） | **PASS** |
| AC17 | 单槽不变式 + 回归 + 新增 E2E | 用例 `:908` 通过（同一 `work_root` 占槽 ≤1）；单测 304/0；E2E L2-19/20/22/23 绿 + **L2-24 绿** | **PASS** |
| AC18 | 前端文案（四步序列 / 不得把裸 `cancel` 写成释放入口 / `force` 前用户知情 / 两处点名旧句已删改） | `:918` 通过（逐项断言 `cancel_pending` / `force` / `wait_no_op` / `cancel_refused` 存在，`"槽位会由下一次派发的回收顺带释放"` **不存在**） | **PASS** |
| AC19 | 探针固化进仓库且可复跑 | `:932` 通过（spawn `tests/probes/probe-cancel-release.ts`，断言输出「✅ cancel 未在后端仍在跑时释放槽位」）；独立跑 `bun tests/probes/probe-cancel-release.ts` ⇒ exit 0 | **PASS** |

## 3. 变异验证明细（`scripts/mutate-cancel-release.sh`）

| # | 变异 | 被哪条用例捕获 |
|---|---|---|
| M1 | 去掉停机证据门控（`if (false && !outcome.stopped && !force)`） | AC1（假停机不放槽） |
| M2 | 去掉授权门控（跳过 `claim_gen` 比对） | AC8（授权类拒绝） |
| M3 | 去掉 reconcile 例外（删 `if (pairs[c.session_id]?.cancel_pending) continue`） | AC9 |
| M4 | 去掉 `cancel_pending` 的写者保留纪律（删 `registerSession` 的保留行） | AC10 |
| M5 | 用钉住的基线代替本次尝试的快照 | AC11 |

⚠️ **M5 第一次跑未被捕获的原因（已修）**：最初锚点命中 `suspend` 里的同名语句（`replace(...,1)` 取首个匹配）
⇒ 变异落在 `suspend` 而非 `cancel`。修正为**唯一锚点**（含 `cancel` 的快照注释）后捕获成功。
⇒ 这条过程记录本身就是「变异必须验证落在目标位置」的证据。

## 4. 实现核对（不只是「脚本全绿」）

| 检查 | 证据 | 结论 |
|---|---|---|
| `suspend` 行为**零变化** | `releaseSlotAuthorized` 的 `ledgerRows` 只有 `cancel` 传（`lib/delegate-async.ts:2209`）；`suspend` 的调用（`:1798`）不传 ⇒ 走同一路径且无 ledger 行 | ✅ |
| `releaseSlotAuthorized` 判定顺序未改 | 顺序仍是「条目不存在 → `idle`/`suspended` 早退 → 代号 → 状态」（`:717-733`）；新增的 `ledgerRows` 在 `writePairs` **之后**追加 | ✅ |
| 墓碑必清 `cancel_pending` | `setSlotState` 在 `state==="tombstone"` 时 `delete next.cancel_pending`（`:655-666`）；`cancel` 的成功路径经 `extraFields: { cancel_pending: undefined }`（`JSON.stringify` 丢弃 `undefined`） | ✅ |
| 三个 tombstone 调用点都经 `setSlotState` | `:1164`（dispatch resume vanished）、`:1967`（cancel missing）、`:2123`（cancel 窗口内 missing）⇒ 都清钉 | ✅ |
| `markCancelPending` **不 bump** 归属版本 | `:790` 只写 `{...entry, cancel_pending: pending}`（无 `claim_gen`）⇒ 良性写（与 `setPairFields` 同口径） | ✅ |
| 拒绝路径的 ledger 与 pin **同临界区** | `markCancelPending` 的 `withLock` 内：先决定 pin 结果，再按 `ledgerRows(res)` 生成行并 `appendLedgerLine`（`:786-800`） | ✅ |
| 成功路径的 ledger 与 pair **同临界区** | `releaseSlotAuthorized` 的 `withLock` 内 `writePairs` 后 `appendLedgerLine`（`:741-748`） | ✅ |
| `interrupt` 返回值只作诊断 | `cancel` 里 `interrupted` 只出现在返回体与 ledger 的诊断字段，**不参与** `if` 判定（`grep` 核对 `:2089-2094`、`:2119`） | ✅ |
| `force` 不跳过授权门控 | `force` 只作用于 `if (!outcome.stopped && !force)`；随后仍走 `releaseSlotAuthorized`（含代号 + 状态前置）⇒ AC8 的 force 分支已验证 | ✅ |
| 严格模式 `stop_judge` 按分支 | `cancel` 传 `{strict: foreign}` 给 `waitStopped`；`running0=true` 时 `judge` 保持 `"wait"`（`waitStopped` 的分支逻辑未改） | ✅ |

## 5. 边界与错误路径核对

| 边界 | 证据 | 结论 |
|---|---|---|
| 未登记条目（`!entry`） | `cancel` 的 ⓪ 授权前置返回 `slot_entry_gone` | ✅ |
| `idle`/`suspended`（不占槽） | `slot_already_released` + `idempotent:true`（AC12/AC13） | ✅ |
| 未知状态 | `slot_state_changed` | ✅ |
| 读失败（基线取不到） | `unreadable` ⇒ 拒绝 + 钉住（AC5b） | ✅ |
| 停机窗口内被外部删除 | `outcome.reason === "missing"` ⇒ D12 墓碑 + vanished 行 | ✅ |
| 守卫释放 | `finally { leaveStopGuard(...) }`（成功/失败/异常都清） | ✅ |
| `force` + 证据成立 | `forced = force && !outcome.stopped` ⇒ 记 `cancelled`（**没有绕过门控 ⇒ 不谎报 forced**） | ✅（见 §6 SHOULD_FIX-1 的文案澄清） |
| 资源释放 | 无新增句柄；`wait` 的 race 已有界（`stopTimeoutMs`）；探针脚本 `rmSync` 清理 | ✅ |

## 6. 发现（非 BLOCKER，已修 / 已登记）

| # | 类型 | 内容 | 处置 |
|---|---|---|---|
| **SF-1** | SHOULD_FIX | **用例命名错位**：单槽不变式那条用例名为 `AC16`，但它对应 change 的 **AC17**（AC16 是上游锚点脚本）⇒ AC↔用例映射会误导 | **已修**：改名为 `AC17 单槽不变式…`（仅测试名，无行为变更），重跑单测 304/0 |
| **SF-2** | SHOULD_FIX | **返回形状不一致**：幂等墓碑分支（已是 tombstone）返回 `{session_id, interrupted, state, message}`，缺 `reason` / `forced` ⇒ 与 ADR 登记的「返回体新增 `reason`/`stop_judge`/`forced`/`forced_available`」不一致（front 解析同一工具会拿到两种形状）。E2E 实测到该形状（`.rddf/reviews/front-cancel-release-e2e-evidence.md` §1 的第二次 cancel） | **已修**：两条幂等墓碑分支补 `reason:"slot_already_released"` + `forced:false` |
| N-1 | 已登记（环境） | **E2E 无法在真实运行时确定性触发「拒绝」分支**（上游 settle 快）⇒ 该分支由 AC1/AC3/AC5 + 探针 + 变异 M1 承担；`L2-24` 断言的是契约可见的确定性不变量 | 写入 E2E 证据 §1/§4 |
| N-2 | 已登记（环境） | **E2E 后端清理不可靠 + 全局并发上限（3）易被跨场景残留吃掉** ⇒ L2-24 的两次重试分别失败于「并发上限」与「模型额度 429」 | 写入 E2E 证据 §3；属 E2E 工程债务，与本次 change 无关 |
| N-3 | 已登记（既有） | `claimSlot` 的 reconcile 读 `stateRoot` 的 pair，而 `markCancelPending` 写 `pairRoot`（存量 worktree 场景两者可能不同）⇒ 该场景下两者**一致地**互相看不见（既有行为，本次未恶化） | 不改（属 `ADR-canonical-root-normalization` 的既有边界） |

## 7. 遗留清扫复核（第 5 步）

| 项 | 结果 |
|---|---|
| 新增 TODO / FIXME | **0** |
| 半截实现 | **0**（tasks.md 16/17 已勾；仅剩 3.2「归档前路径引用扫尾」，属归档步骤） |
| 注释掉的代码 | **0** |
| 临时调试日志 / `console.log` | **0**（探针脚本的 `console.log` 是**输出协议**，不是调试残留） |
| 被 skip 的测试 / 未替换的 mock | **0** |
| 临时 fallback 分支 | **0** |
| 探针脚本的临时目录 | 用 `/tmp/opencode/probe-cancel-*`（AGENTS.md 约定）+ `rmSync` 清理 ✅ |

## 8. 判据的已知局限（如实声明）

- **AC16（锚点）**对 `/tmp/opencode/upstream-2.2.5`（`git archive v2.2.5` 导出）执行；本机
  `/workspace/project/opencode` 是开发 commit（2.1.2）⇒ **不能**拿它跑（会假红）。已在脚本 `--src` 上声明。
- **AC17 的 E2E** 在真实模型上跑；额度耗尽后无法重跑 ⇒ 有效证据是第一次通过的那轮（已固化在报告里）。
- **「锚点脚本全绿」不等于「上游语义没变」**：它只校验本仓依赖的**语义断言**（不校验行号），
  新增的 A11/A12 也只覆盖「`resume:false` 不提升 inbox」「`nextPromotable` 优先 steer」两条。

## 9. 结论与路由

**PASS**：AC1–AC19 全部满足（每条有工具证据）；0 BLOCKER；2 项 SHOULD_FIX 已修复；3 项环境限制已如实登记。

**修复后复跑证据（2026-11-11）**：

| 检查 | 结果 |
|---|---|
| `bun test tests/` | **304 pass / 0 fail** |
| `tsc --noEmit`（lib 两文件） | **1 条错误 = pre-existing**（无新增） |
| `scripts/mutate-cancel-release.sh` | **5/5 捕获** |
| `bun tests/probes/probe-cancel-release.ts` | **exit 0**（「✅ cancel 未在后端仍在跑时释放槽位」） |
| `scripts/check-upstream-anchors.sh --src .../upstream-2.2.5` | **21/21** |

**归档（2026-11-11，用户授权「提交并归档」）**：

| 步骤 | 结果 |
|---|---|
| commit | `09fdb01`（`opencode.jsonc.opencode-go` 未提交） |
| `openspec archive front-cancel-release --yes --skip-specs` | ✅ 归档为 `openspec/changes/archive/2026-11-11-front-cancel-release/`（⚠️ 该 change 无 specs delta ⇒ 必须 `--skip-specs`；`openspec validate` 对它返回 exit 1「No deltas found」属预期） |
| 路径引用扫尾 | ✅ 5 个文件 / 6 处：`improvement` / 本报告 / ADR-front-cancel-release（2 处）/ ADR-front-stop-ownership / `scripts/mutate-cancel-release.sh` + 归档目录内自引用 2 处；全仓复查 **0 残留** |
| ADR AC 映射回填 | ✅ `ADR-front-cancel-release` 的「关联 change」与「AC 映射」两行已回填为「已实施 + 已验收 + 已归档」 |
| docs 沉淀 | ✅ `docs/CHANGELOG.md`（v2.8 变更摘要）/ `docs/front-delegate-architecture.md` §4.4（当前态：四步切换 + 停机证据门控 + reconcile 例外）/ `docs/front-delegate-testing.md` §3（目录清单补 `tests/probes/` 与两个脚本） |
