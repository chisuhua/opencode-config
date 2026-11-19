# ADR：角色感知写门与角色租约

## 元数据

| 字段 | 值 |
|---|---|
| Status | **Accepted**（2026-11-17 用户签批 —— 会话内明确「切 architect 确认」）。**D6 角色租约同批确认** ⇒
按 D6 的签批语义，「主会话处于某角色时派同名类后端会被拒」这一工作流**已确认**（主会话须先切到不冲突角色再派发） |
| Date | 2026-11-17 |
| Author | architect（主会话） |
| Parent | **`ADR-role-session-identity`（依赖：身份来源 —— 本文的租约键依赖它）**；`ADR-front-multi-backend`（D6.1 槽位键 = `workRoot`；D6.2 同 `workRoot` 同时一个后端）；`no-self-adjudication`（「不做什么」表第 3 行：硬 deny 属架构级 ⇒ 由本文承担） |
| 关联 change | **已实施 + 已验收 + 已归档**（2026-11-19）：`openspec/changes/archive/2026-11-19-role-aware-permissions/`（**已立项 2026-11-17**；与身份 ADR 同一 change 同批落地；验收 = `.rddf/reviews/role-aware-permissions-verify.md` 第 2 轮终 **24/24 PASS**） |
| AC 映射 | 本文 **V1–V14 ↔ AC11–AC24**（change 的验收标准表） |
| 审稿报告 | `.rddf/reviews/role-aware-permissions-consultation.md`（oracle **2 轮** + critic **1 轮**；逐条闭合见 §8.3/§8.4） |
| 修订 | **2026-11-17（签批后）**：D6 陈旧根口径 → 两文件均恒 `stateRoot`；D5「五项」→**六项**（含顺序修正）与 V13 同步；风险表「五项」→六项；D5⑥ 改为「租约仍剩 `role-switch.sh` + 派发临界区」。**事实性修正，不改决策** |；**2026-11-18**：`:43` 的执行点由「权限层 ask」改为「工具层验证门」（`docs/adr/ADR-commit-verification-gate.md`）

## 背景与问题

1. **软约束已被证伪**：v2.44 实测 2/2 —— prompt 说「等用户确认 commit」，权限层更具体的配置说「不在 ask 档」⇒ 模型信后者、自行 commit。角色写面禁令同样只有 prompt。
2. **拦截技术上可行**：`tool.execute.before` 可在执行前拒绝（`plugins/subagent-contract.ts:135` 已在用）。
3. **并发写没有隔离**：`lib/delegate-async.ts:11-12`（不变式 1/2：槽位键 = `workRoot`、同 `workRoot` 同一时刻只有一个占槽）只约束**后端占槽**；**主会话不在槽位体系** ⇒ 主会话 + 后端可共存于同一 worktree，**同角色时会互相踩**（git 索引 / 工作区）。
4. **身份来源已由 `ADR-role-session-identity` 定案**：本 session 分区为权威 ⇒ 租约可按「会话自己的角色」为键。

要解决的问题：**角色禁令要不要变硬、以什么面变硬、同一 worktree 同角色并发怎么办、宣称到哪里。**

## 决策

### D1 档位：T2 为目标形态，T1 为其第一步；T0 否决；T3 入 backlog

- **T0 否决**：软约束在事实 1 下不可靠。
- **T1**（`edit` 改路径 map + `role.json`/`role-claims.json` 写 `ask`）**仅作 T2 前置**：不门控禁止动作本身，且高频切换会训练出「Allow always」。
- **T2**（插件门控 + 单一策略真源 + D6 租约）：目标形态。
- **T3**（按 agent 拆角色）唯一不可自我提权，但会改写角色口令 / 矩阵表 / 守卫 / e2e ⇒ **入 backlog，另立 ADR**。

### D2 门控面：只覆盖 `edit` / `write` / `subagent`；`shell` 明确不在

| 矩阵格 | T2 是否覆盖 | 说明 |
|---|---|---|
| 禁 `edit src/**` 一类**路径集** | ✅ | `edit`/`write` 按路径判 |
| 禁写 `design.md` / `tasks.md` / `.rddf/plans/**` | ✅ | 同为路径集 |
| 禁创建 `openspec/changes/**` | ✅ **仅 edit/write 工具路径** | ⚠ 经 `shell` 创建（`openspec new` / `mkdir`+重定向）不在门控内 |
| 禁调写类 `subagent` | ✅ | `subagent` 是独立 action，按 agent 名判 |
| 禁 `git commit`（实施类） | ✅ | 已由**工具层验证门**覆盖（`docs/adr/ADR-commit-verification-gate.md` D2③：暂存内容须落在角色写集内）；原「权限层 ask 覆盖」已于 2026-11-18 退役 |
| 禁「会改仓库状态的 `shell`」 | ❌ **不在** | 已登记盲区（`sed -i` / `tee` / `>`） |

写集判定以**归一绝对路径**为根（相对 cwd 先归一）。

**⚠ 每次写类工具调用都校验租约**（持有者 == 本会话 且 `claim_gen` 匹配；见 D6）；不匹配 ⇒ 拒绝并提示「租约已被接管」。
否则接管后旧持有者仍能继续写同一工作树 ⇒ 「同角色至多一个活跃 session」在接管路径上不成立。

### D3 会话类型不相交：插件只门控**主会话**，后端维持宿主规则

- 插件对 `parentID != null` **显式跳过** —— 后端继续走 `scopeEditRules` / `classAllowRoots`。
- 插件**只门控 `build` agent 的主会话**；`plan` / `front` / 其它 agent 的主会话**显式跳过**（沿用身份 ADR D3 的身份域），按各自 prompt 的既有写权限行事。
- 两者**永不同时适用于一个会话** ⇒ deny 语义无歧义。
- 防漂移：`lib/role-policy.ts` 作「角色 ↔ 写根」**单一映射**，插件与 spawn 规则构建器同消费。
- **身份解析单一落点**：`lib/role-identity.ts` 实现 `ADR-role-session-identity` D1 的链；**门控与租约都从它取角色**
  （同一函数、同一时刻取值）——否则「解析出的角色 ≠ 租约占用的角色」无法在架构层排除。

### D4 破例通道：唯一逃生口 = 切角色

- 现状逃生口「用户明说破例 X 才放行」是 prompt-only、**不可观测**，T2 下与硬门冲突 ⇒ **由本决策取代**（`prompts/build.md:706` 须同批改述）。
- 切换**走 `scripts/role-switch.sh`**（见身份 ADR D2），可观测、可审计。
- **口令锚定**（若采纳）：仅当**本回合用户直接键盘输入**的 user text-part 含合法口令、且写入值与目标一致时放行；
  窗口内自动切换按机械可验条件放行（目标 ∈ `window.roles`、`used < max`、`used += 1`、`updated_by: "auto"`）。
- ⚠ **必须显式排除 `question` 回答**（选项文案是模型写的）、tool content、程序化注入、compaction 摘要。

### D5 宣称边界：**防事故，不防绕过** —— 六项免宣称

须写进 change 的 AC / 测试注释 / 主题文档三处：

1. `shell` 写盘（`sed -i` / `tee` / `>` / `cp`）不在门控内；
2. shell 层 pattern 盲区（`git -c … commit` / `GIT_AUTHOR_NAME=x git commit`）不在范围；
3. **`role.json` / `role-claims.json` 可被 `shell` 或 `edit` 改写** ⇒ 身份与租约都可被伪造（处置：写盘进 `ask`；仍可绕过）；
4. saved approval（宿主「Allow always」）会覆盖配置，层 1 看不见（`MULTI-AGENT-DESIGN.md` §3.4）；
5. ⭐ **非 build agent 主会话不参与**：`plan` / `front` 等主会话不参与门控与租约（身份域见身份 ADR D3）⇒
   它们与 build 主会话在同一 worktree 并发时**不受本 ADR 保护**（worktree 互踩风险仍在）。
6. ⭐ **执行点缺席**：插件未激活 / `--standalone` / 改插件后未 `service restart` / 插件文件不在 `plugins/` ⇒ **D2 的门控不生效**；
   D6 的租约**仍剩两个执行点**：`role-switch.sh` 与**派发临界区**（后者属 `delegate` 路径，
   **不随门控插件消失**）；**开局 / 每次写类调用的校验随插件消失** ⇒ 「至多一个活跃 session」在插件缺席时**部分**不可保证。

### D6 角色租约：**build 域内**同一 worktree 同一角色至多一个活跃 session

**键与角色**

- 键 = `(workRoot 绝对路径, 工作角色)`；**工作角色**：
  · 主会话 = **按 `ADR-role-session-identity` D1 的链解析出的角色**（分区 → 同 sid 镜像 → 全局 → `general`）——
    ⚠ 不能只读分区：新会话在首次切换前**没有分区** ⇒ 只读分区会让租约键为空、独占静默失效；
  · 后端 = 它的 `role_class`（后端 `current_role` 恒 `builder`，用它会让所有后端抢同一格）。
- **独占集** = `{architect, planner, builder, verifier, general}`；**豁免** = `{no-role}`（只读，不冲突）。
- **主会话 ↔ 后端同角色 ⇒ 拒绝**（用户裁决：同角色至多一个代表）；**不同角色 ⇒ 并行**（主 `architect` + 后端 `verifier` ✅）。

**与既有槽位的关系**

- `ADR-front-multi-backend` D6.2（同 `workRoot` 同时只有一个**后端**）**保持不变**（用户裁决 A）。
- ⇒ **后端↔后端不再由本租约重复判**（D6.2 已覆盖且更严）；本租约的**真实增量 = 主会话 ↔ 后端**的同角色冲突。

**状态与锁**

- 文件：`<stateRoot>/.rddf/state/role-claims.json`（**恒 stateRoot**）；`role.json` **也恒 `<stateRoot>`** ——
  旧口径「双 session ⇒ stateRoot，否则 cwd」**已被 `ADR-role-session-identity` D1 取代**（它会随一次派发翻转读根）。
- 锁：复用 **`.role.lock`**，须逐条遵守既有协议 —— **`mkdir` 独占（禁 `-p`）/ 陈旧回收 30 s / 硬超时 10 s**（`lib/delegate-core.ts:1627-1646`）；
  **锁内不得再取锁**（`lib/delegate-async.ts:15-16`：不变式 4 / D7.1 —— 锁是同步不可重入，锁内不得 await、不得调自取锁的函数）。
- **单一实现**：租约算法收敛到 `lib/role-lease.ts`；`scripts/role-switch.sh` 只是**薄壳**（解析参数后调它），不在 shell 里重写一套。

**判活与接管**

- **判活优先用宿主 session 活性**（与后端同源：`slotOccupants` / 会话上下文探针）；`heartbeat_at` TTL（默认 30 min，`RDDF_ROLE_LEASE_TTL` 可覆盖）**只作兜底**。
- **接管前必须先做一次宿主探活**；探活失败才允许接管。
- 接管 = **直接接管 + 显式告警 + `ledger.jsonl` 留痕**（用户裁决）；⚠ **必须有围栏**：`claim_gen` 单调递增，
**旧 `claim_gen` 的持有者此后任何租约相关写一律拒绝**，且**写类工具调用也校验 `claim_gen`**（见 D2）——
两者合起来才使「接管不制造双写」成立；**只有租约层围栏是不够的**（旧持有者仍能写工作树）。

**执行点（三处，缺一就有漏；租约检查与既有槽位检查**同一临界区**）**

| 执行点 | 冲突时 |
|---|---|
| 派发（`delegate` / `dispatch` 临界区） | 抛 `fail(...)` ⇒ **工具错误直接回到调用方（主会话）** |
| 主会话切角色（`role-switch.sh`） | 非零退出 + 指名持有者；**回滚**（保留旧角色与旧租约，不留半状态） |
| **每次写类工具调用**（含开局；插件） | ① 无租约 ⇒ 拒绝写类工具 + 说明（模型只能读 + 报告）；② `claim_gen` 不匹配（已被接管）⇒ 同样拒绝 |

⚠ 第三点必须做：两个新会话都从 fallback 得到同一角色、都不切角色时，只在"切换"处检查永远查不到。

> 算法细节（acquire/release/renew/takeover 的状态机、字段级 schema、ledger 格式）**不在本文展开**，落立项后 change 的 `design.md`。

## 选项对比表

| 选项 | 结论 | 理由 |
|---|---|---|
| **T2 门控 + D6 租约** | ✅ 选中 | 覆盖矩阵可机表达者；复用 `tool.execute.before`；与身份 ADR 同源 |
| T1 单独 | ⚠ 仅前置 | 不门控禁止动作本身 |
| T3 拆 agent | ❌ 入 backlog | 唯一不可自我提权，但改写面过大 |
| T0 软约束 | ❌ 否决 | 事实 1 已证伪 |
| **租约键 = `(workRoot, role)`，主↔后端同角色互斥** | ✅ 选中（用户裁决） | 同角色并发必互踩；异角色可并行 |
| 租约键加命名空间（`identity` / `class` 分开，主 builder 与后端 builder 不冲突） | ❌ 否决 | 会让**最常见派发路径**合法化，违背用户定的「同角色至多一个代表」 |
| 放宽 D6.2 允许同 worktree 多后端 | ❌ 否决（用户裁决 A） | 同工作树并发写无隔离层 |
| 接管改为「拒绝 + 人工确认」 | ❌ 否决（用户裁决） | 无人在场时会卡死；改为「宿主探活优先 + 围栏 + 告警」加固 |

## 后果 / 代价

**正面**：越权写从「自觉」变**工具层拒绝**；主/后端共享单一策略真源；同角色并发从「无声互踩」变「明确拒绝 + 指名持有者」。

**负面**：
- 新增插件 + `lib/role-policy.ts` + `lib/role-lease.ts` + 状态文件 + e2e ⇒ 维护面扩大；
- 角色切换多一次 `ask` 写盘；
- ⚠ **同角色组合一律冲突**（不只 builder）：凡「主会话治理角色名 == 后端能力类名」——`builder`/`builder`、`architect`/`architect`、
  `verifier`/`verifier` 等 ⇒ **派发被拒**（需先把主会话切到不冲突的角色，如 `no-role`）。这是用户规则的直接后果，
  **签批 D6 即视为对该工作流的确认**；若用户否决该工作流 ⇒ **D6 不签、本 ADR 保持 Draft**，并按 Status 行的联动要求同步修订 D1 与 D5；
- 插件缺席 ⇒ 门控与**每次写调用**的租约校验消失；租约仍剩两个执行点（`role-switch.sh` + 派发临界区，D5⑥）。

**风险与缓解**

| 风险 | 缓解 |
|---|---|
| 宣称硬保证而可绕过 | D5 六项 + 三处登记 |
| 插件与 spawn 规则漂移 | `lib/role-policy.ts` 单源 + V6 |
| 门控误伤（architect 写治理面 / `arch_paths` 为空） | 写集显式含治理面（V4）+ `arch_paths` 三态口径 |
| 接管制造双写 | `claim_gen` 围栏（V11） |
| 长跑静默会话被误判死 | 宿主探活优先 + TTL 兜底 + 告警 |

## Verification（可勾选验收判据，前瞻）

- [ ] **V1** `architect` 会话对 `src/**` 的 `edit`/`write` **返回工具错误**
- [ ] **V2** `builder` 会话写 `docs/adr/**`（`arch_paths` 命中）**成功**
- [ ] **V3** `no-role` 会话对任意仓库文件 `edit` **被拒**，但**能完成角色切换**
- [ ] **V4** `architect` 会话写 `~/.config/opencode/prompts/**`（治理面）**成功**
- [ ] **V5** `planner` 会话写 `src/**` **被拒**、写 `.rddf/roadmap/**` / `.rddf/improvements/**` **成功**
- [ ] **V6** **单一真源**：插件与 spawn 规则构建器共用 `lib/role-policy.ts`；断言只有一处「角色→写根」实现
- [ ] **V7** **会话类型不相交**：后端（`parentID != null`）**不受插件门控**，仍走 `scopeEditRules`
- [ ] **V8** **租约拒绝**：主会话 `builder` 活跃时派 `builder` 类后端 ⇒ **拒绝**，错误含 holder `session_id` + workRoot，且**回到调用方**
- [ ] **V9** **异角色并行**：主 `architect` + 后端 `verifier` 同 worktree ⇒ 两者都成功
- [ ] **V10** **豁免与独占**：两个 `no-role` 可并存；第二个 `general` 被拒；⚠ **无分区的新主会话**（身份链落到 `general`）
      与另一个 `general` 会话**同样冲突**（前提：全局 `~/.rddf/state/role.json` 不存在或其 `current_role` 亦为 `general`）；证明租约键走身份链、不依赖分区存在
- [ ] **V11** **判活与接管围栏**：宿主探活失败 + TTL 超时 ⇒ 接管成功且告警；**旧持有者下一次租约写必须失败**（`claim_gen` 不匹配）
- [ ] **V12** **锁协议**：并发 `acquire` 只有一方成功；`mkdir` 不带 `-p`；陈旧回收 30 s；硬超时 10 s
- [ ] **V13** **免宣称六项**在 AC + 测试注释 + 主题文档三处登记
- [ ] **V14** 回归：`bun test tests/` 全绿、anchors 无 FAIL；立场句（`:196` 软约束→混合、`:706` 破例→切角色）同批落地
