# Design — role-aware-permissions

> 判据真源：`proposal.md` 的「## 验收标准」（AC1–AC24）↔ 两份 ADR 的 V 项。**本文只记实现取舍**，不新增决策。

## D1 模块落点（**四个单一真源，各司其职**）

| 模块 | 职责 | 谁消费 |
|---|---|---|
| `lib/role-identity.ts` | **唯一身份解析器**：分区 → 同 sid 镜像 → 全局 → `general`；读侧根恒 `stateRoot` | 门控、租约、`role-switch.sh`（**同一函数、同一时刻取值**） |
| `lib/role-policy.ts` | 角色 → 可写路径集（`edit`/`write` 的根集合；`subagent` 的允许名单） | 门控插件、`delegate-core` 的 spawn 规则构建器 |
| `lib/role-lease.ts` | 租约算法（acquire/release/renew/takeover + `claim_gen` 围栏 + 判活 + ledger），**自己取 `.role.lock`** | 派发临界区、`role-switch.sh`（薄壳） |
| `scripts/role-switch.sh` | **薄壳**：解析参数 → 调 `lib/role-lease.ts` / `lib/role-identity.ts`（**自己不持锁**） | 人 / 模型（唯一写入口） |

⚠ **不做**的事：不在 shell 里重写一套租约逻辑（shell/TS 双实现必然漂移，与 D4 立单源的动机相反）。

## D2 状态文件与根

| 文件 | 位置 | 写入者 | 原子性 |
|---|---|---|---|
| `role.json` | **恒 `<stateRoot>/.rddf/state/role.json`** | `role-switch.sh`（主会话）/ `writeRoleSession`（仅后端 sid 的分区） | `tmp + rename`；**读-改-写保留其它分区**（今天有 6–7 个分区 + `legacy` 键） |
| `role-claims.json` | **恒 `<stateRoot>/.rddf/state/role-claims.json`** | `lib/role-lease.ts` | `writeJsonAtomic` 同款 |

⚠ **取代** `prompts/build.md:202/210/215` 的「双 session pair ⇒ stateRoot，否则 cwd」——该合同让**读根随一次派发翻转**（pair 登记后跳主仓）⇒ 同一会话分区不可见 ⇒ 身份跌 `general`（放大权限）⇒ 租约键改变 ⇒ 用户裁决②失效。代码侧写入**恒 stateRoot**（`lib/delegate-core.ts:1687`）⇒ 顺带把读侧对齐到写入侧。

## D3 锁协议（逐条照抄既有约定）

`.role.lock`（`<stateRoot>/.rddf/state/.role.lock`）：**`mkdir` 独占（禁 `-p`）** ⇒ EEXIST 自旋；陈旧回收 **30 s**；硬超时 **10 s**；**锁内不得再取锁**、不得 await（`lib/delegate-async.ts:15-16` 不变式 4 / D7.1）。
⇒ 租约检查 + 写入必须与**既有槽位检查同一临界区**（`lib/delegate-async.ts:605` 的 `withLock`）⇒ 否则 check-then-act ⇒ 双写者（`ADR-front-multi-backend` D7.4 的教训）。

## D4 读侧与门控的耦合点

- 门控插件（`tool.execute.before`）：先由 `lib/role-identity.ts` 取角色 → 查 `lib/role-policy.ts` 的写集 → 再由 `lib/role-lease.ts` 校验**本会话持有该角色租约且 `claim_gen` 匹配** ⇒ 三者顺序固定，避免「解析出的角色 ≠ 租约占用的角色」。
- **每次写类工具调用都校验租约**（不只开局）——否则接管后旧持有者仍能写工作树（`claim_gen` 围栏只挡租约层）。
- 插件**只门控 `build` agent 的主会话**；后端（`parentID != null`）与非 build 主会话**显式跳过**。

## D5 租约算法要点

- 键 `(workRoot, 工作角色)`；主会话角色 = **身份链解析结果**（不是"只读分区"——新会话首次切换前没有分区）；后端 = `role_class`。
- 独占集 `{architect, planner, builder, verifier, general}`；豁免 `{no-role}`。
- **判活**：宿主 session 活性优先（与后端同源的 `slotOccupants` / 会话上下文探针）⇒ `heartbeat_at` TTL（默认 30 min，`RDDF_ROLE_LEASE_TTL` 可覆盖）只作兜底；**接管前必须先探活**。
- **接管** = 直接接管 + 显式告警 + `ledger.jsonl` 留痕（用户裁决）；**围栏** = `claim_gen` 单调递增，旧持有者的租约写与写类工具调用**一律拒绝**。
- **拒绝语义**：派发 ⇒ 抛 `fail(...)` ⇒ 工具错误**回到调用方（主会话）**；切角色 ⇒ 非零退出 + 指名持有者 + **回滚**（保留旧角色与旧租约）。

## D6 迁移顺序（避免中间态全锁）

1. 先为现存会话写分区（依据顶层镜像 + `history`；来源不可考的标 `legacy`）
2. 再把读侧判据切到身份链
3. 顶层保留为镜像；`$OPENCODE_SESSION_ID` 缺失时退化为只读镜像路径并**告警**

## D7 与既有守卫的冲突处理（**同批**）

改 `prompts/build.md:593` 会撞 `tests/config-guards.test.ts:391-403`（三步字面须**全文各恰好 1 次** + 顺序）与 `:846-860`（对调突变依赖字面「② 更新项目级 `role.json`」）。
⇒ **推荐改法**：保留三步字面，在 ② 后追加「（经 `scripts/role-switch.sh`）」。
⇒ **禁忌**：不得改写「② 更新项目级 `role.json`」这 13 个字面。

## D8 残余与免宣称（六项）

shell 写盘 / shell pattern 盲区 / `role.json` 与 `role-claims.json` 可被改写 / saved approval（宿主 Allow always）/ **执行点缺席**（插件未激活 ⇒ 门控不生效、租约只剩 `role-switch.sh` 一个执行点）/ **非 build agent 主会话不参与**。

## 回滚

分三步：① 插件停用（门控与租约检查随之消失）；② `role-switch.sh` 退回「直接写 role.json 顶层」；③ 迁移的分区**保留**（不影响回滚）⇒ 每步都可单独回。
