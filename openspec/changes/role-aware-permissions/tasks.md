# Tasks — role-aware-permissions

> 判据真源：`proposal.md` 的「## 验收标准」（AC1–AC24）↔ 两份 ADR 的 V 项。实现取舍：`design.md`（D1–D9）。
> **TDD 5 步**：先写会失败的断言，再写最小实现，再转绿。
> ⚠ **前置**：两份 ADR 已签批（Status **Accepted**，2026-11-17）；D6 工作流（同角色派发被拒）已同批确认。

## 层定义（权威：`docs/test-authoring.md` §1；细则见 `design.md` D9.1）

- **层 1a 静态契约**：源文本/清单形状（段作用域、逐字、唯一性）— `bun test tests/`，进 CI
- **层 1b 纯逻辑单测**：构造真实文件 / 锁目录 / 子进程 — `bun test tests/`，进 CI
- **层 2 行为端到端**：真模型 + 真工具调用 — **`rdd-workflow-e2e` 仓** bats，`E2E_REAL_RUNTIME=1` 才跑、默认 skip
- **手工验收**：verifier 逐 AC 取证

⚠ **禁止**在本仓加 `*.test.ts` 自称 e2e（`tests/README.md:39-42`）。⚠ **skip ≠ pass**：未实跑 ⇒ 该 AC 判「不可判定」，须改用降级证据。

## AC → 用例 → 层 → 判别力（**缺一行即该 Task 未完成**）

| AC | 用例（核心断言） | 层 | 变红演练 | fixture |
|---|---|---|---|---|
| AC1 | 同一 `role.json` 上两个 sid 各读一次 ⇒ 结果**不同**且各等于自己的分区值 | 1b / 2 | — | 真实 7 分区（`legacy` + 6 `ses_*`） |
| AC2 | 三分支各一例，**断言 `source`**（`mirror`/`global`/`default`；`partition` 在「分区缺失」前提下不可达）+ 角色（只断角色会塌成同支）+ `warning=no-session-id` 一例 | 1b | — | 注入 `globalRoot`（**不读 HOME**） |
| AC3 | `agent:"front"/"plan"` + 该 sid 分区=architect ⇒ hook 返回 `undefined`；**成对**：`agent:"build"` 同输入必须拒 | 1b | — | 假 ctx |
| AC4 | 切角色后**其余 6 个分区 + `legacy` 子树 deep-equal（值相等）**；整文件**字节级**比较仅对 `legacy` 子树、且 fixture 用同款序列化生成；`history` 追加而非替换；**切换中途失败 ⇒ claims 与 role.json 均未变 + 非 0 退出** | 1b | — | `legacy.updated_at` 保持无毫秒格式 |
| AC5 | 目标路径造成目录（`renameSync` 必失败）**或** 用 `writeJsonAtomic(..., {cleanupOnError:true})` ⇒ **原文件逐字节不变 + 无 `.tmp-*` 残留**（`role.json` **与** `role-claims.json` 各一条） | 1b | — | 必失败路径 |
| AC6 | 正向：`sessions[后端sid]` 写入；**负向：顶层 `current_role`/`updated_at` 未变**；`agent:"plan"` ⇒ `throw` | 1b | — | 同上 |
| AC7 | **无丢失更新（判据性质）**：20 轮**强制交错**（barrier：A 写前等 B 就绪、**B 读前等 A 的「读完成」标记**；A 等 B 就绪设**超时 T**，超时即视为已串行）⇒ 两分区（含镜像）都在且计数无损；**必红证据：把锁换成 no-op ⇒ 该用例 100% 红** | 1b | ✅ 锁→no-op 必红 | 子进程 + barrier 文件 |
| AC8 | `--by auto` ⇒ `updated_by:"auto"` + `used+1`；**边界 `used == max`** ⇒ 拒绝 | 1b | — | 窗口 fixture |
| AC9 | 既有守卫锚点保留：三步字面各**恰好 1 次** + 顺序 + 对调突变仍红 | 1a | ✅ 复用 `config-guards.test.ts:846-858` | — |
| AC10 | linked worktree：切角色 → 派发（登记 pair）→ 再读，**三次打印的真实路径为同一文件**、同一分区可见、角色不变；symlink 变体另一条。⚠ **禁把 `stateRoot` 注入成常量**（走真实 `canonicalRoots`） | 1b / 2 | — | 真 `git worktree add` |
| AC11 | architect × `src/**` 拒 **且 message 含「角色+路径+动作」三要素**；成对：允许集放行 | 1b / 2 | — | 假 ctx |
| AC12 | builder × `docs/adr/**` 放行；`arch_paths` 三态（命中/空/缺失）各一条 | 1b | — | 临时 `arch-docs.json` |
| AC13 | `no-role` 任意 edit 拒，但**切角色成功** | 1b | — | 同上 |
| AC14 | architect × 治理面 `prompts/**` 放行、× 项目 `src/**` 拒（治理面写根**不得写成全局 allow**） | 1b | — | 同上 |
| AC15 | planner × `src/**` 拒 + `.rddf/roadmap/**` 放行；路径归一（相对 / `../` / symlink）三条 | 1b | — | 临时目录 |
| AC16 | 插件与 spawn 规则构建器**取到同一函数引用**（不是「字符串相同」） | 1b | ✅ 语料注入第二份策略表 ⇒ 必红 | 源码语料 |
| AC17 | 后端（`parentID != null`）跳过；**成对**：`parentID=null` 必须拒；非 build 主会话亦跳过 | 1b / 2 | — | 假 ctx |
| AC18 | 主 builder 活跃 ⇒ 派 builder 后端被拒，**走 throw 通道**且 message 含 sid + workRoot | 1b / 2 | — | 临时 stateRoot |
| AC19 | 主 architect + 后端 verifier 并存成功 | 1b / 2 | — | 同上 |
| AC20 | 两个 `no-role` 并存 / 第二个 `general` 拒 / **无分区**主会话落 `general` 与另一 `general` 冲突 | 1b | — | 无分区 role.json + 注入 globalRoot（不存在或 general） |
| AC21 | 探活失败 + TTL 超时 ⇒ 接管 + 告警 + ledger 有痕；**旧持有者「租约写」与「写类工具调用」两条独立用例都必须失败**；claims **四种损坏形态**（截断/空/数组/缺字段）⇒ 保守拒绝且 gen 不回退；**且存在恢复入口**（`role-switch.sh --reset-claims` ⇒ 重建 claims + ledger 留痕 + 走 `ask`） | 1b / 2 | — | 注入 `hostProbe`/`now`/`ttlMs` |
| AC22 | **持锁互斥（判据性质）**：A 持锁并写标记文件 ⇒ B **等标记可见后** acquire **必须失败**；A 释放后 B 必须成功。（「两进程同时起跑」**不作为判据** —— 可能串行。）另：`mkdir` 不带 `-p`；陈旧锁**两条边界**（`== 阈值` 阻塞 / `+1` 回收）；**不按 pid 判活**；锁内不得再取锁 | 1b | ✅ 锁→no-op ⇒ 失败分支必红；嵌套 `withLock` ⇒ 必红 | 标记文件 + `utimesSync` |
| AC23 | 免宣称**六项** × 三处（AC / 测试注释 / 主题文档）**各自**命中且语义指向同一清单 | 1a | ✅ 删一处 ⇒ 必红 | 三份语料 |
| AC24 | 立场句 `:196`/`:706` + 根口径 `:202/210/215` + `MULTI-AGENT-DESIGN.md:404-405` 同批；回归 `bun test tests/` **退出码 0 + 回读 pass 数（不写死 598）** + anchors 无 FAIL + `openspec validate --strict` | 1a | ✅ 措辞突变 | 语料 |

## fixture 规则（**硬性**，E-8 教训）

1. 每个用例 `mkdtempSync` **独立父目录**，**禁共享 fixture 根** —— 模型会 `ls ..` 并把同族 fixture 当先例。
2. `role.json` fixture 用**真实 7 分区形状**；`legacy.updated_at` 保持**无毫秒**格式（任何规范化重写都会改它）。
3. **禁读真实 `HOME`**（`~/.rddf/state/role.json`）—— 用注入的 `globalRoot`。
4. 层 2 fixture：独立父目录 + 真 `git worktree add`；跨 worktree 用例不得复用同一 fixture。

## Task 0：前置（已完成）

- [x] **Step 1:** 两份 ADR 签批（Status → **Accepted**，2026-11-17 用户签批）
- [x] **Step 2:** D6 工作流确认（「同角色派发被拒」由用户在签批时同批确认）

## Task 1：身份落点（AC1–AC3 / AC10）

- [x] **Step 1:** 写 `resolveRole({stateRoot, globalRoot, sessionID, agent}) → {role, source, warning?}`（**全注入、不读 env**）⇒ 先写会失败的 1b 用例
- [x] **Step 2:** AC1（两会话各读各）/ AC2（三分支 + `source`）/ AC3（非 build 成对）
- [x] **Step 3:** AC10：linked worktree 三次读同一文件同分区 + symlink 变体
- [x] **Step 4:** `$OPENCODE_SESSION_ID` 缺失 ⇒ **跳过镜像步** ⇒ 全局 ⇒ `general` + stderr/ledger 双告警（1b 一条）

## Task 2：写入口收敛（AC4–AC8）

- [x] **Step 1:** `withRoleLock(fn)`（**一次锁内完成 claims + role.json**）+ `scripts/role-switch.sh`（薄壳、不持锁）⇒ 先写会失败的 1b 用例
- [x] **Step 2:** AC4：**其余分区 + `legacy` 逐字节相等** + `history` 追加；**中途失败 ⇒ 双未变 + 非 0 退出**
- [x] **Step 3:** AC5：注入 rename/write 失败 ⇒ 原文件不变 + 无 `.tmp-*`（`role.json` 与 `role-claims.json` 各一条）
- [x] **Step 4:** AC7：**20 次两进程交替 RMW** 无丢失
- [x] **Step 5:** AC6：正向 + **负向（顶层未被回填）** + `agent:"plan"` 抛错
- [x] **Step 6:** AC8：`--by auto`（`used+1`、`used == max` 拒绝）+ 四个子命令（切换/退出/授予窗口/关闭窗口）各写对字段
- [x] **Step 7:** build.md 的 5 个写点全走脚本（`:593`/`:596`/`:668`/`:694`/`:700`）；`:696` 确认非写点
- [x] **Step 8:** **1a**：`build.md` 内不得出现直接写 `role.json` 的指令（检测形态：`>` / `tee` / `jq` / 「写入 role.json」动作句；⚠ **白名单**：必须保留的三步字面「更新项目级 `role.json`」恰好 1 次，不得被判红）（**MUTATIONS**：改回直写 ⇒ 必红）

## Task 3：写门（AC11–AC17）

- [x] **Step 1:** `lib/role-policy.ts`（角色 → 写根）+ 插件 `tool.execute.before` ⇒ 先写会失败的 1b 用例
- [x] **Step 2:** AC11–AC15 各一条「拒/放行**成对**」用例；message 含**角色 + 路径 + 动作**三要素
- [x] **Step 3:** AC16：**同一函数引用**断言（**MUTATIONS**：语料注入第二份策略表 ⇒ 必红）
- [x] **Step 4:** AC17：后端跳过 + **成对** `parentID=null` 必拒 + 非 build 主会话跳过
- [x] **Step 5:** 路径归一（相对 / `../` / symlink）
- [x] **Step 6:** 接入**每次写类工具调用的租约校验**（holder + `claim_gen`）—— 与 Task 4 同批

## Task 4：角色租约（AC18–AC22）

- [x] **Step 1:** `lib/role-lease.ts`（acquire/release/renew + `claim_gen` **`!=` 即拒** + 单调不减）⇒ 先写会失败的 1b 用例
- [x] **Step 2:** 派发临界区接入（**与槽位检查同一临界区**）⇒ AC18（throw 通道 + sid + workRoot）
- [x] **Step 3:** AC19 异角色并行；AC20 豁免/独占/无分区 general
- [x] **Step 4:** AC21：探活优先 → TTL 兜底 → 接管前探活；告警 + ledger；**两条独立围栏用例**（租约写 / 写类工具调用）；**claims 四种损坏形态**
- [x] **Step 5:** AC22：两子进程并发（恰好一方成功）+ 陈旧锁两条边界 + **不按 pid 判活** + 锁内不再取锁（1a + MUTATIONS）
- [x] **Step 6:** 跨 worktree（同角色不同 workRoot 不冲突）/ 同 worktree 两写法同键
- [x] **Step 7:** `role-switch.sh --reset-claims`（损坏恢复入口；`ask` 档 + ledger 留痕）

## Task 5：迁移 / 登记 / 层 2（AC9 / AC23 / AC24）

- [x] **Step 1:** 迁移脚本（先写分区再切读侧）⇒ 无孤儿分区；存量 `legacy` 键不被覆盖
- [x] **Step 2:** AC23：免宣称**六项**三处各自命中（**MUTATIONS**：删一处 ⇒ 必红）
- [x] **Step 3:** AC24：立场句 + 根口径同批；**既有守卫锚点保留**（`:391` 三步字面 / `:846` 突变锚点）
- [ ] **Step 4:** **层 2（e2e 仓，8 条 representative）**—— ⚠ e2e 仓不可用时记「**不可判定**」并降级（**不阻塞 AC 判定**，skip ≠ pass）：同角色派发被拒 / 异角色并行 / 接管后旧持有者写被拒 / 两会话各读各分区 / linked worktree 根唯一 / architect×`src/**` 真 Tool.Error / 真后端不受门控 / 非 build 主会话跳过
- [ ] **Step 5:** 回归：`bun test tests/` 退出码 0 + **回读实测 pass 数** + anchors 无 FAIL + `openspec validate --strict`

## Task 6：审查与收口

- [ ] **Step 1:** 治理面改动（`prompts/**` + 守卫断言 + `opencode.jsonc`）⇒ **oracle 1 轮 → critic 1 轮**（⚠ 调 oracle 必声明 `审查域: 治理面`）
- [ ] **Step 2:** BLOCKER 全闭 ⇒ 复审 1 次只验闭合
- [ ] **Step 3:** **变红演练记录**落 `.rddf/reviews/role-aware-permissions-mutations.md`：
      **层 1a 判据每行一条**（破坏动作 / 期望红理由 / 实跑结果）；**层 1b 用例记「红→绿」记录**，
      **其中 AC7/AC16/AC22 另需「附加变异」行**（锁→no-op / 语料注入第二份策略表 / 嵌套 `withLock`）；层 2 记 skip/实跑
- [ ] **Step 4:** 切 verifier 逐 AC 取证 ⇒ 按下方**取证表**填证据，报告落 `.rddf/reviews/role-aware-permissions-verify.md`

## verifier 取证表（Task 6 Step 4 的输入）

| AC | 命令 | 证据文件 | 期望片段 | 不可判定条件 |
|---|---|---|---|---|
| AC1 | `bun test tests/ -t <用例名>` | 测试输出 | 两 sid 结果不同 | 测试未实现 |
| AC3 | 同上 | 测试输出 | front/plan 不获得写集（成对：build 必拒） | — |
| AC5 | 同上 | 测试输出 + `ls .tmp-*` | 原文不变、无残留 | — |
| AC6 | 同上 | 测试输出 | 顶层 `current_role`/`updated_at` 未变 | — |
| AC7 | 同上 | 测试输出 + 变异记录 | 无丢失更新 + **锁→no-op 100% 红** | — |
| AC8 | 同上 | 测试输出 | `used+1` / `used==max` 拒绝 | — |
| AC9 | 同上 | 测试输出 | 三步字面各 1 次 + 对调突变红 | — |
| AC17 | 同上 | 测试输出 | 后端跳过（成对：null 必拒） | — |
| AC2 | 同上 | 测试输出 | `source=mirror|global` 各一 | globalRoot 注入缺失 |
| AC4 | 同上 | 测试输出 + fixture 快照 | 6 分区 + legacy 逐字节相等 | — |
| AC10 | 同上 + `git worktree list` | 测试输出 | 三次读到同一文件 | 无 git worktree 支持 |
| AC11–AC15 | 同上 | 测试输出 | 拒/放行成对 | — |
| AC16 | 同上 | 测试输出 | 同一函数引用 | — |
| AC18–AC21 | 同上 | 测试输出 + ledger 行 | 拒绝 message 含 sid+workRoot | — |
| AC21（层 2） | e2e 仓 `bats -f <用例>` | bats 输出 | 真会话被拒 | `E2E_REAL_RUNTIME` 未开 ⇒ **不可判定** |
| AC22 | 同上 | 测试输出 | 恰好一方成功 | — |
| AC23/AC24 | `bun test tests/` + `check-upstream-anchors.sh` | 退出码 + 输出 | exit 0、anchors OK | — |

## 已知边界（写进测试注释 / 观察报告，不假装覆盖）

- 六项免宣称：`shell` 写盘 / shell pattern 盲区 / 状态文件可被改写 / saved approval / 执行点缺席 / 非 build agent 不参与。
- 同角色派发被拒 ⇒ 主会话须先切到不冲突角色（用户已确认该工作流）。
- `scripts/role-init.sh` 的无锁非原子写 ⇒ 只登记，本次不改。
- 层 2 的 8 条只是 representative；**AC4/AC5/AC6/AC7/AC16/AC22/AC23 不进层 2**（层 2 比 1b 多证明不了任何东西）。
