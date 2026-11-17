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

① shell 写盘 / ② shell pattern 盲区 / ③ `role.json` 与 `role-claims.json` 可被改写 / ④ saved approval（宿主 Allow always）/
⑤ **非 build agent 主会话不参与** / ⑥ **执行点缺席**（插件未激活**或身份判定不可用** ⇒ 门控不生效；租约仍剩 `role-switch.sh` 与**派发临界区**两个执行点 —— 后者属 delegate 路径，**不随门控插件消失**）（顺序与 ADR 对齐；AC23 断言按**集合相等**、不敏感顺序）

## 回滚

分三步：① 插件停用（门控与租约检查随之消失）；② `role-switch.sh` 退回「直接写 role.json 顶层」；③ 迁移的分区**保留**（不影响回滚）⇒ 每步都可单独回。

## D9 测试策略与可测性 seam（metis 审查后补，**P0**）

### D9.1 层级定义（权威：`docs/test-authoring.md` §1 —— 不是二分法）

| 层 | 形态 | 运行 | 门控 |
|---|---|---|---|
| **层 1a 静态契约** | 断言源文本/字幕/清单的形状（段作用域、逐字、唯一性） | `bun test tests/` | 无（进 CI） |
| **层 1b 纯逻辑单测** | 构造真实文件/锁目录/子进程，断言行为 | `bun test tests/` | 无（进 CI） |
| **层 2 行为端到端** | 真模型 + 真工具调用 | `rdd-workflow-e2e` 仓 bats | `E2E_REAL_RUNTIME=1` 才跑，默认 **skip** |
| 手工验收 | verifier 逐 AC 取证 | — | — |

⚠ **本仓无 e2e 目录**（`tests/README.md:39-42`）⇒ 层 2 一律落 e2e 仓；**禁止**在本仓加 `*.test.ts` 自称 e2e。

### D9.2 可测性 seam（**全部注入，不读 `process.env` / 不读真实 `HOME`**）

| seam | 签名 | 为什么必须注入 |
|---|---|---|
| 身份解析 | `resolveRole({ stateRoot, globalRoot, sessionID, agent }) → { role, source, warning? }` | `source ∈ partition\|mirror\|global\|default` 是 AC2 可分辨的前提；⚠ **sid 缺失 ⇒ 跳过镜像步**与「不中 ⇒ 落 default」**结果相同** ⇒ 用 `warning: "no-session-id"` 区分（否则 Task 1 Step 4 的告警不可条件化）；读真实 `HOME` 会环境耦合（consultation BLOCKER 1） |
| 租约时钟/判活 | `role-lease` 注入 `now()` / `ttlMs` / `hostProbe()` | 否则 30 min TTL 与「探活失败」不可测 |
| **锁（单源）** | `withLock(lockDir, fn, { staleMs?, deadlineMs? })` —— **给既有 `withLock` 加第三个可选参数**（既有 8 处两参调用不变） | 不新造第二份锁实现（否则 30 s / 10 s 两处常量必漂）；AC22 的两条边界靠参数注入 |
| **根解析** | **直接复用既有导出** `canonicalRoot(dir, gitRunner?)`（`lib/delegate-core.ts:476`，已带 `gitRunner` 注入点）—— **不写副本** | ⚠ **AC10 禁把 `stateRoot` 注入成常量**（否则「根恒定」恒真）；必须走真实解析路径（副本会让断言打在副本上） |
| **原子写注入** | `writeJsonAtomic(path, obj, { cleanupOnError? })` —— 新增可选参数（默认 `false` 保持既有 `pair.json` / `ledger.jsonl` 行为） | AC5 的「注入失败 ⇒ 原文不变 + 无 `.tmp-*`」需要注入点与 tmp 清理语义 |
| **告警出口** | `warnSink(msg)` / `appendLedgerLine(row)` 注入（复用既有 `lib/delegate-core.ts:1735`） | 身份 ADR 要求 `sid 缺失` 时 **stderr + ledger 各一条**，1b 需可观测面 |
| **门控取身份** | `tool.execute.before` 只能拿 `sessionID` + `input`；`agent` / `parentID` 经 `ctx.session.get()` **异步**取 | 1b 用假 ctx 证分支；**身份不可判定 ⇒ fail-closed（拒写 + 告警）**，不 fail-open |
| 单一临界区 | `withRoleLock(fn)` —— **一次锁内完成 claims + role.json**（必要时含 pair） | 避免「claims 一个临界区、role.json 另一个」⇒ `role-switch.sh` 与 `writeRoleSession` 并发互踩 |
| 写入顺序 | **先写 claims、后写 role.json**；role.json 写失败 ⇒ **回滚 claims** | 决不得出现「角色未切成但租约已占」 |

### D9.3 判据形态（**每条防漂移判据必须配变红演练**）

- **适用域**：**层 1a（静态契约）每条判据必须配演练**；**层 1b（TDD 用例）不要求破坏演练**，但须留「红 → 绿」记录；层 2 只记 skip / 实跑。
  （此前「没有演练条目就不计入 AC 覆盖」按字面会判 19/24 未覆盖，与 Task 6 Step 3 冲突 ⇒ 以此为准。）
- 形态沿用 `tests/config-guards.test.ts:3397` 的 `Mutation{ name, apply, expect, expectCls }`；
- **层 1a 判据没有演练条目 ⇒ 不计入 AC 覆盖**（层 1b 以「红→绿」记录为准）；
- 演练记录落 `.rddf/reviews/role-aware-permissions-mutations.md`（删锚点 / 插第二份策略表 / 改词 ⇒ 必红）。

### D9.4 恒真形态清单（**禁止照抄**）

| 禁止写法 | 为什么恒真 |
|---|---|
| 断言「模块文件存在且有 export」 | 缺实现时由 import 失败自然红，该断言零判别力 |
| AC7 写成「连续两次 switch 都成功」 | 锁换成 no-op 也绿 |
| AC22 照抄 `delegate-core.test.ts:425-439`（10 次顺序循环） | 非并发，锁失效也绿 |
| AC11–AC15 只断言「hook 返回 error」 | 任何 throw 都绿 |
| AC5 只断言「写完 `JSON.parse` 成功」 | 正常路径必然成功 |
| AC23 用「全文出现次数」 | 三处任意一处即可凑数 |
| **AC10 把 `stateRoot` 注入成常量** | 「根恒定」恒真（必须走真实解析，见 D9.2） |
| **AC7 写成「A,B,A,B 交替」** | 串行执行 ⇒ 锁换成 no-op 也绿 |
| **AC22 写成「两进程同时起跑」** | 可能串行 ⇒ 两方都成功（或断言「至多一方」即恒真） |
| **AC7 的 barrier 退化为「B 等 A 写完成」** | B 读到的是 A 写后的值 ⇒ 无丢失更新永不触发 ⇒ 锁→no-op 也绿 |
