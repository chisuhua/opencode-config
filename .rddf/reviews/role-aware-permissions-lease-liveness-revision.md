# 审稿记录 — ADR-role-aware-permissions 的写路径判活缺陷修复 + D6 事实性修订

> **范围**：修 `lib/role-lease.ts::checkLeaseForWrite`（写类工具调用时的租约围栏）**从不做存活性判定** ⇒ 死会话的 active 租约**永久**挡住同一 `(workRoot, role)` 的所有 `edit`/`write`；并按审稿 finding 对 `docs/adr/ADR-role-aware-permissions.md` D6 做**事实性修订**（不改决策）。
> **角色**：builder（主会话）｜**审稿**：oracle（失败模式）+ critic（arch/build 档）｜**轮次**：critic 2 轮（上限 2）
> **日期**：2026-11-22

## 0. 缺陷与现场证据

| 项 | 内容 |
|---|---|
| 缺陷 | `checkLeaseForWrite` 的「持有者不是我」分支**只拒绝、不判活**；释放只发生在 `role-switch.sh` 的切角色/退出（崩溃/被杀死的会话不执行）⇒ 死会话的租约**无释放路径** |
| 现场 | `.rddf/state/role-claims.json` 的 `…\|general` claim 由 `ses_e12a4d135ffes9CrB7xABZzAe5`（2026-11-18 已死的 fork 会话）持有，`state:"active"`、`heartbeat_at:"2026-11-18T06:39:45.894Z"` ⇒ 新会话的 `write` 被拒（`role-lease: 角色「general」的租约由 ses_e12a4d13 持有…⇒ 拒绝写类工具`），且 `edit`/`write` 全被挡 |
| ADR 依据 | D6「判活与接管」：接管前必须先探活、探活失败才允许接管；接管 = 直接接管 + 显式告警 + `ledger.jsonl` 留痕；**必须有围栏**（`claim_gen` 单调递增，旧持有者此后任何租约相关写一律拒绝）—— 这些**只写在 ADR 里**，写路径上从未落地 |

## 1. 改动清单（4 文件）

| 文件 | 改动 |
|---|---|
| `lib/role-lease.ts` | ① `checkLeaseForWrite` 重排：**围栏先判**（我的 gen 已被接管 ⇒ 拒，消息带**恢复路径**）→ 我是持有者 ⇒ `acquireLease` **续心跳**放行 → 持有者不是我 ⇒ `isHolderAlive` **判活**（仍活 ⇒ 照旧拒绝并指名持有者；**已死 ⇒ 接管**）。② 新增 `leaseTtlMs()`：兑现 ADR D6 承诺但从未实现的 `RDDF_ROLE_LEASE_TTL` 覆盖（**单位 = 毫秒**，非法值回落 30 min；入参 `ttlMs` 优先），接到 `acquireLeaseLocked` 与 `checkLeaseForWrite` |
| `plugins/role-gate.ts` | 接线层传 `warnSink`（接管告警落 stderr）；**显式不传 `hostProbe`**（主会话无可用探针：`ctx.session.get` 对已死会话仍返回记录 ⇒ 探针恒真 ⇒ 接回去等于恢复本次故障） |
| `tests/role-lease-claims.test.ts` | 新增 10 条层 1b 用例（TTL 覆盖 2 + 判活/接管 8），含「现场形态」回放（死会话的过期 active claim ⇒ 新会话写调用放行）与「围栏优先」（旧持有者即便被判活为死也仍被 `claim_gen` 拒） |
| `docs/adr/ADR-role-aware-permissions.md` | D6「判活与接管」补 3 条**事实性补充**（③ 执行点无宿主探针 ⇒ 以 TTL 为唯一判据；探针不可用时「探活失败」= TTL 判死；被接管旧持有者的恢复路径）+ `RDDF_ROLE_LEASE_TTL` 单位；元数据「修订」行追加 2026-11-22 条目。**Status 行不动；决策条目/选项对比表不动** |

## 2. 验证证据

```bash
cd /home/ubuntu/.config/opencode
bun test tests/role-lease-claims.test.ts   # 34 pass / 0 fail
bun test tests/                              # 1084 pass / 1 skip / 0 fail
```

| 判据 | 证据 |
|---|---|
| 死持有者不再永久挡路 | 用例「持有者心跳过期（TTL 到期）⇒ 接管成功 ⇒ 写类工具放行 + claim 归我 + gen+1」；用例「现场形态：claims 里躺着**已死会话**的过期 active claim ⇒ 新会话的写类工具调用放行（gen+1）」 |
| 活持有者仍被拒 | 用例「持有者仍活（探活说活）⇒ 拒绝 + 指名持有者（**不**接管）」 |
| 围栏不回归 | 既有 AC21「围栏②：接管后**旧持有者的写类工具调用**失败（claim_gen != 即拒）」仍绿；新增用例「围栏优先：…即便它被判活为『死』」 |
| 续心跳（TTL 对活跃会话有效） | 用例「我是持有者 ⇒ 写类工具调用**续心跳**」断言 `heartbeat_at` 前移 |
| ADR 承诺兑现 | 用例「未设置 ⇒ 默认 30 min；合法值 ⇒ 生效；非法值 ⇒ 回落默认」+ 端到端「env 覆盖 ⇒ 写类工具调用按覆盖值判活」 |

## 3. 审稿 finding 的处置

| 来源 | finding | 处置 |
|---|---|---|
| oracle | 必须补 `RDDF_ROLE_LEASE_TTL`（ADR 承诺未兑现） | ✅ 已实现（`leaseTtlMs()` + 2 条用例） |
| oracle | 不动 `isHolderAlive` 的 OR 语义（被既有 AC22 钉死） | ✅ 维持现状 |
| oracle | 旧持有者的失写**有界**（对方 TTL 到期或释放后可自动接管回来） | ✅ 采纳；并在拒绝消息里写明恢复路径 |
| critic | SHOULD_FIX 1：③ 执行点不接 hostProbe 与 ADR 字面有落差 ⇒ 应走 ADR 事实性修订 | ✅ ADR D6 补 3 条事实性补充 + 「修订」行条目（**不改决策**） |
| critic | SHOULD_FIX 2：被接管方的拒绝文案没有恢复路径 | ✅ 拒绝消息追加恢复路径（`role-switch.sh` 重占 / `--reset-claims`） |
| critic | SHOULD_FIX 3：`RDDF_ROLE_LEASE_TTL` 单位契约缺口 | ✅ ADR 补「单位 = 毫秒」+ 代码注释钉死 |
| critic | NIT：写类热路径每次调用 = 1 次锁 + 1 次原子写 | 记录为后续项（读侧缓存），本次不动 |
| critic | NIT：`withLock` 10s 硬超时可能把合法写变成失败 | 既有语义，非本次引入 |
| critic（**第 2 轮**） | SHOULD_FIX：ADR 事实性补充的**落点范围过窄** —— 只写了执行点③，但证据是**全部生产调用点都不传 `hostProbe`**（`plugins/role-gate.ts:111` / `scripts/role-switch.ts` / `lib/delegate-core.ts:1812` / `lib/delegate-async.ts:661`）⇒ 只读 ADR 的 implementer 可能以为②已是探活优先 | ✅ 补充改为「**所有执行点**（①②③）都没有可用的宿主探针 ⇒ 全部以 TTL 为唯一判据」；并以 `grep -rn "hostProbe" lib/ plugins/ scripts/` 复核：生产侧**零命中**（仅 `lib/role-lease.ts` 的定义/注入点与插件注释） |
| critic（**第 2 轮**） | NIT：恢复路径第一条未指明执行者 ⇒ 模型可能自行跑 `scripts/role-switch.sh`（`shell` 不在门控内，且脚本默认 `by:"user"` ⇒ 动作会被记成用户发起） | ✅ 消息改为「**由用户**经 scripts/role-switch.sh 重占租约……或**由用户**执行 scripts/role-switch.sh --reset-claims」 |

**结论**：critic 第 1 轮 `APPROVE_WITH_CONDITIONS`（**无 BLOCKER**，`mergeable: yes`）；3 条 SHOULD_FIX 全部闭合 → 第 2 轮复审只判「新增 diff 是否引入新问题」，结论仍为 `APPROVE_WITH_CONDITIONS`（**无 BLOCKER**），新增的 1 条 SHOULD_FIX（ADR 落点范围）与 1 条 NIT 已按其给出的证据与口径当场订正。**critic 轮次已用满 2 轮（上限 2）**，故最后这两处措辞订正未再送第 3 轮，改以 critic 自带的 `grep` 证据自检复核。

## 4. 遗留（明确不做，交用户/后续）

1. **主会话的宿主探活**：需先验证「进程崩溃但记录残留」时探针返回死态，才能接回 `hostProbe`（接之前保持 TTL 兜底 + ADR 已留痕，防后人误接）。
2. **写类热路径 I/O**：每次写调用一次 `.role.lock` + 一次原子写；后续可考虑读侧缓存。
3. **`RDDF_ROLE_LEASE_TTL` 单位**：本次按毫秒实现（ADR 未写单位）⇒ 若与 architect 意图不符，改 `leaseTtlMs()` 一行即可。
