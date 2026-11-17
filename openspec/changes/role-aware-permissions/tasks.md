# Tasks — role-aware-permissions

> 判据真源：`proposal.md` 的「## 验收标准」（AC1–AC24）↔ 两份 ADR 的 V 项。实现取舍：`design.md`（D1–D8）。
> **TDD 5 步**：先写会失败的断言，再写最小实现，再转绿。
> ⚠ **前置**：两份 ADR 签批（Status 转已决）后才开工。

## Task 0：前置（阻塞项）

- [ ] **Step 1:** 两份 ADR 签批（`ADR-role-session-identity` / `ADR-role-aware-permissions`）⇒ Status 转已决
- [ ] **Step 2:** 确认 **D6 已签**（签 D6 即视为确认「同角色派发被拒」这一工作流）；若否决 ⇒ 回到 ADR 修订

## Task 1：身份落点（AC1–AC3 / AC10）

- [ ] **Step 1:** 写 `lib/role-identity.ts` 的解析器（分区 → 同 sid 镜像 → 全局 → `general`；根恒 `stateRoot`）⇒ **先写会失败的层 1 判据**
- [ ] **Step 2:** 层 1 判据：解析链三分支（AC2）+ 两会话各读各的分区（AC1）+ 文件根唯一（AC10，linked worktree 三读同文件）
- [ ] **Step 3:** 非 build agent 不参与（AC3）
- [ ] **Step 4:** 同步 `prompts/build.md:202/210/215` + `docs/MULTI-AGENT-DESIGN.md:404-405`

## Task 2：写入口收敛（AC4–AC8）

- [ ] **Step 1:** `scripts/role-switch.sh`（薄壳）+ `lib/role-lease.ts` 取锁 ⇒ 层 1 判据先红
- [ ] **Step 2:** 读-改-写保留其它分区（AC4）+ 原子写（AC5）+ 同临界区（AC7）
- [ ] **Step 3:** build.md 的 5 个写点全部改走脚本（`:593`/`:596`/`:668`/`:694`/`:700`）；`:696` 确认不是写点
- [ ] **Step 4:** `writeRoleSession` 只写后端分区、**去 `:1700` 顶层回填**、`agent !== "build"` 抛错（AC6）
- [ ] **Step 5:** 授权窗口自动切换 `--by auto`（AC8）

## Task 3：写门（AC11–AC17）

- [ ] **Step 1:** `lib/role-policy.ts`（角色 → 写根）+ 门控插件（`tool.execute.before`）⇒ 层 1 判据先红
- [ ] **Step 2:** 门控面行为取证（AC11/AC12/AC13/AC14/AC15）
- [ ] **Step 3:** 单一真源断言（AC16）+ 会话类型不相交（AC17，含非 build 主会话跳过）
- [ ] **Step 4:** **每次写类工具调用**接入租约校验（与 Task 4 同批）

## Task 4：角色租约（AC18–AC22）

- [ ] **Step 1:** `lib/role-lease.ts`：acquire/release/renew + `claim_gen` 围栏 + 锁协议 ⇒ 层 1 判据先红
- [ ] **Step 2:** 派发临界区接入（**与槽位检查同一临界区**）⇒ 同角色派发被拒且**指名 holder + 回到调用方**（AC18）
- [ ] **Step 3:** 异角色并行（AC19）+ `no-role` 豁免 / `general` 独占 / 无分区 `general`（AC20）
- [ ] **Step 4:** 判活（宿主探活优先 → TTL 兜底 → 接管前探活）+ 接管告警 + ledger + **旧持有者的写必须被拒**（AC21）
- [ ] **Step 5:** 锁协议断言（AC22）

## Task 5：迁移与登记（AC9 / AC23 / AC24）

- [ ] **Step 1:** 迁移脚本（先写分区，再切读侧）⇒ 无孤儿分区
- [ ] **Step 2:** 免宣称**六项**在 AC + 测试注释 + 主题文档三处登记（AC23）
- [ ] **Step 3:** 立场句同批落地（`:196` / `:706`）+ **既有守卫锚点保留**（`:391` 三步字面 / `:846` 突变锚点）（AC9）
- [ ] **Step 4:** 层 2 e2e：至少覆盖「同角色派发被拒」「异角色并行」「接管后旧持有者写被拒」
- [ ] **Step 5:** 回归：`bun test tests/` 全绿（单独校验退出码）+ anchors 无 FAIL + `openspec validate --strict` valid（AC24）

## Task 6：审查与收口

- [ ] **Step 1:** 治理面改动（`prompts/**` + 守卫断言 + `opencode.jsonc`）⇒ **oracle 1 轮 → critic 1 轮**（⚠ 调 oracle 必声明 `审查域: 治理面`）
- [ ] **Step 2:** BLOCKER 全闭 ⇒ 复审 1 次只验闭合
- [ ] **Step 3:** 验收：切 verifier，逐条 AC 取证（每条要有工具证据）⇒ 报告落 `.rddf/reviews/role-aware-permissions-verify.md`

## 已知边界（写进测试注释 / 观察报告，不假装覆盖）

- `shell` 写盘、`git -c … commit` 等 pattern 盲区、状态文件可被改写、宿主「Allow always」、插件缺席、非 build 域不参与 ⇒ 六项免宣称。
- 同角色派发被拒 ⇒ **主会话须先切到不冲突角色**（用户裁决的工作流）。
- `scripts/role-init.sh` 的无锁非原子写 ⇒ 本次只登记为残留。
