# 验收报告：front-stop-ownership

> **验收者**：verifier（只验不改）。**判据来源**：① `openspec/changes/front-stop-ownership/proposal.md` 的 **AC1–AC18**；② `docs/adr/ADR-front-stop-ownership.md` 的 Verification **S1–S14**（AC1–AC14 ↔ S1–S14 同号；AC15–AC18 为 metis gap 分析新增的实施期判据）。
> **分流**：`rdd-verifier` skill 的前置条件（proposal 含 `## 验收标准` ✅）满足，但 **P3 archive gate 未触发**（`rddf rdd-verify --dry-run` → `No eligible changes to verify (empty queue)`；无 `iteration.json` 归档态）⇒ 走**本地 1–5 步**验收。
> **变更规模**：`lib/delegate-async.ts`、`lib/delegate-core.ts`、`tests/delegate-async.test.ts`（+18 用例）、`prompts/front.md`、`docs/front-delegate-usage.md`、`scripts/check-upstream-anchors.sh`（+2 锚点）、新 ADR + 改进稿 + 审稿记录。

## 1. 静态（含**读代码**核对，不只信测试）

| 检查 | 结果 |
|---|---|
| `tsc`（两个改动文件） | ✅ **0 条新错误**（既有 TS7006/TS2345/TS2591/TS5097 未变） |
| **授权判定顺序**（`lib/delegate-async.ts` `releaseSlotAuthorized`） | ✅ 逐条核对：**条目不存在 → `slot_entry_gone`；状态 `idle`/`suspended` → `slot_already_released`；`claim_gen` 不符 → `slot_reclaimed`；状态不在期望集 → `slot_state_changed`**（顺序 2 先于 3 ⇒ reconcile 不会把空闲后端误报成「被别人认领」） |
| **释放的原子性** | ✅ 状态翻转 + `suspended_at_message_id`/`steer_residue` 回填 + `claim_gen` bump 在**同一次 `withLock` 临界区**内完成（无「只写一半」路径） |
| **释放写回正确的 `pair.json`** | ✅ `locateBackend` 新增 `pairRoot`（`lookupPairWithRoot` 命中哪个根就写哪个根）⇒ 存量 worktree 条目不会静默 no-op |
| **bump 落点**（读代码） | ✅ `claimSlot` 登记（:626）、`claimSlot` reconcile 翻转（:610）、`setSlotState`（:654）、授权释放（:722）、`registerSession` 认领（`delegate-core`）—— **归属变更处都 bump**；良性写（`setPairFields`、`sessions` 回填）**不 bump** |
| **`registerSession` 保留 `claim_gen`** | ✅ 认领（`bumpClaim:true`）与收尾（默认）分开；不再整条重建丢计数器 |
| **`sessions` 回填不再整条替换** | ✅ 改为「锁内重读 + 只补缺失字段」⇒ 不会把锁外的旧 `claim_gen`/`state` 写回 |
| **裸 `setSlotState` 调用点** | ✅ 全仓仅剩「定义 + `updateSlotState` 包装」两处（源码断言：出现次数 = 2）；dispatch 已删路径已改为持锁路径 |
| **tripwire 判活** | ✅ **同 host 且 pid 存活**（`process.kill(pid,0)`，`EPERM` 视为存活）；跨 host 视为存活；**不以 mtime/TTL 判死**（避免把「活着但空闲」的实例误判成单实例）；存活计数按 **`(host,pid)` 去重**（同进程多插件副本不误判） |
| **严格模式** | ✅ `waitStopped(..., {strict})`：基线不在跑时**也要求水位线前移**；`stop_judge:"degraded"` + `foreign_instance:true` + ledger `foreign_instance`；`RDDF_SUSPEND_ALLOW_DEGRADED=1` 在严格模式**不生效** |
| **矛盾检测** | ✅ `wait` 有界返回 ∧ 判活为真 ⇒ reason `wait_no_op`（≠ `still_running`）；`still_running` 仍可达（`wait` 缺失 + 基线在跑） |
| **已删路径（D12）** | ✅ `git diff` 显示**动作未变**（`vanished` 分支逐字未动）；**不做**代号校验（已删会话不可能是活写者 ⇒ 校验零保护；加了反而会引入死槽）——口径已回写 ADR D1 |
| **暂停基线一次性消费** | ✅ dispatch 投递后清空 `suspended_at_message_id`（否则远古基线会误报 `steer_residue:"suspected"`） |

## 2. 单元测试

✅ **284 pass / 0 fail**（1172 expect；改动前 266 ⇒ **+18** 条）。本 change 区域（「授权释放」）**17 条**单独跑亦全绿。

## 3. 集成 / E2E（verifier 实跑，重启服务加载新插件后）

| 用例 | 结果 |
|---|---|
| L2-19（单槽：第二个 dispatch 被拒） | ✅ |
| L2-20（suspend 释放槽位 + `state=suspended`） | ✅ |
| L2-22（往返切换，A 同一 `session_id`） | ✅ |
| L2-23（运行中 resume 被拒） | ✅ |

## 4. 边界与错误路径

| 组 | 覆盖 |
|---|---|
| **授权** | 代号不符不释放（`slot_reclaimed`）／状态被改不释放（`slot_state_changed`）／条目缺失（`slot_entry_gone`）／已释放（`slot_already_released`）／良性写不误伤／cancel 同样条件化 |
| **tripwire** | 同 pid 两枚戳**不**判多实例／同 host 死 pid 不算实例／跨 host 保守算存活／严格模式不可赎回／ledger 留痕 |
| **判据** | 矛盾 ⇒ `wait_no_op`／`still_running` 仍可达／`wait` 缺失退化 |
| **回归** | 既有 266 条全绿（含被契约变更更新的 2 条：`dispatching` 拒绝改为结构化返回、`wait_no_op` 文案） |

**变异验证（5 组，证明新用例能失败）**

| 变异 | 结果 |
|---|---|
| 去掉代号比对 | ✅ AC2 / AC5 红 |
| 去掉状态前置 | ✅ AC3 红 |
| 去掉 bump | ✅ AC1 红 |
| 去掉 `(host,pid)` 去重 | ⚠️ **起初全绿 = 覆盖缺口** ⇒ 补成「**两枚**同 pid 戳」后红 ✅（单枚会被 `ensureInstanceStamp` 复用 ⇒ 测不出来） |
| 去掉严格模式 | ✅ AC8 / AC9 红 |

## 5. 遗留清扫

✅ 0 遗留（无 TODO/调试残留/`.only`/`.skip`）；`tasks.md` 19 项全绿。

## 6. 逐条 AC 判定

| AC | 判定 | 证据 |
|---|---|---|
| AC1（认领 bump；良性写不 bump） | ✅ | 单测 + 读代码（:610/:626/:654） |
| AC2（代号不符 ⇒ 不释放） | ✅ | 单测 + 变异红 |
| AC3（状态不符 ⇒ 不释放） | ✅ | 单测 + 变异红 |
| AC4（良性写不误伤） | ✅ | 单测 |
| AC5（cancel 条件化） | ✅ | 单测 + 变异红 |
| AC6（state 枚举不变；`claim_gen` 不参与判定） | ✅ | 单测 |
| AC7（已删路径逐字一致） | ✅ | `git diff` + 单测 |
| AC8（tripwire ⇒ 严格模式 + ledger + `foreign_instance`） | ✅ | 单测 + 变异红 |
| AC9（严格模式不可赎回） | ✅ | 单测 |
| AC10（`wait_no_op`；`still_running` 仍可达） | ✅ | 单测（两条） |
| AC11（戳的存活判定） | ✅ | 单测（死 pid / 跨 host） |
| AC12（`registerSession` 后代号不回退） | ✅ | 单测 + 读代码 |
| AC13（单槽不变式 + 回归 + 上游锚点） | ✅ | 单测（两个根）+ E2E 4/4 + 锚点 **19/19** |
| AC14（前端文案三形态） | ✅ | 文案断言（`front.md` + `usage.md`） |
| AC15（判定顺序） | ✅ | 单测（reconcile ⇒ `slot_already_released`） |
| AC16（写者与锁边界） | ✅ | 单测 + 源码断言 |
| AC17（tripwire 身份与容错） | ✅ | 单测（同 pid 两枚戳）+ 变异红 |
| AC18（返回契约一致性） | ✅ | 单测（结构化返回不抛错 / `slot_entry_gone` / `foreign_instance` 在失败返回）+ 读代码 |

## 7. 覆盖与代码规模

| 指标 | 改前 | 改后 |
|---|---|---|
| `lib/delegate-async.ts` 行覆盖 | 94.63% | **96.02%**（函数 100%） |
| `lib/delegate-core.ts` 行覆盖 | 97.88% | **96.70%**（新增的戳逻辑有分支未覆盖，见遗留） |
| 单测条数 | 266 | **284** |

## 8. 结论

**PASS（18/18）。** 授权模型、tripwire、矛盾检测、返回契约与 ADR/proposal 一致；关键实现细节（判定顺序、锁内原子性、bump 落点全集、pid 去重、已删路径豁免）经**读代码**确认，非仅依赖测试；5 组变异验证证明新用例会失败。

## 9. 遗留（已登记，不阻断）

| # | 内容 | 处置 |
|---|---|---|
| 1 | `delegate-core.ts` 96.70%：戳的 `SIGKILL` 残留 / `utimes` ENOENT 重建分支未直接覆盖 | **实测路径已覆盖**（AC11 死 pid ⇒ 判死）；ENOENT 重建为防御分支，无直接用例 |
| 2 | 跨 host 的远端残戳 ⇒ 保守判存活 ⇒ 可能长期钉住严格模式 | 已在 ADR 代价章登记；人工删戳是出口（ADR D2 已写） |
| 3 | `cancel` 的停机证据（墓碑是否保留槽位） | **另立 backlog** `cancel-stop-evidence`（ADR 选项表 C7） |
| 4 | 跨实例根治（原子准入+投递、跨进程执行可见性） | 上游 feature request 4 条（ADR 末章） |
| 5 | ADR 的三处**实施期口径收窄**（tripwire 判活改 pid 存活；已删路径不做代号校验；严格模式复用 `degraded` 枚举） | 已在 ADR 正文写明理由，并记入 `.rddf/reviews/adr-front-stop-ownership-review.md` |

**已用轮次**：本 change 第 1 轮 verifier 验收（PASS）。critic 轮次见审稿记录（ADR 侧 2 轮；第 3 轮需用户批准，未开）。
