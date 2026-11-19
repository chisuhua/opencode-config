# ADR：会话身份的落点 —— 本 session 分区为权威

## 元数据

| 字段 | 值 |
|---|---|
| Status | **Accepted**（2026-11-17 用户签批 —— 会话内明确「切 architect 确认」） |
| Date | 2026-11-17 |
| Author | architect（主会话） |
| Parent | `ADR-backend-handoff-role-class`（D2：**能力类 vs 治理身份分离** —— 本文不改）；`ADR-canonical-root-normalization`（`workRoot` / `stateRoot` 分工）；**前向依赖** `ADR-role-aware-permissions`（其 D1/T1 的 `ask` 档是本文「模型绕过脚本直写 `role.json`」的缓解手段） |
| 关联 change | **已实施 + 已验收 + 已归档**（2026-11-19）：`openspec/changes/archive/2026-11-19-role-aware-permissions/`（**已立项 2026-11-17**；与门控/租约同一 change 同批落地；验收 = `.rddf/reviews/role-aware-permissions-verify.md` 第 2 轮终 **24/24 PASS**） |
| AC 映射 | 本文 **V1–V10 ↔ AC1–AC10**（change 的验收标准表） |
| 审稿报告 | `.rddf/reviews/role-aware-permissions-consultation.md`（oracle **2 轮** + critic **1 轮**；逐条闭合见 §8.3/§8.4） |
| 修订 | **2026-11-17（签批后）**：D4 第 3 步补「sid 缺失 ⇒ 跳过镜像步」+ 后果章同步；D2 锁归属补「`role.json` 读写在同一锁内」。**均为与 D1 对齐的事实性修正，不改决策** |

## 背景与问题

「本会话以什么角色工作」这一事实目前**有三个互不一致的来源**：

1. **写侧**：`prompts/build.md:593` 的切换写规格**只写顶层** `current_role`。
2. **读规格**：`prompts/build.md:210` 说「解析 `current_role`」，未提分区。
3. **工具层**：`scripts/role-show.sh:37-48` **分区优先**（`.sessions[$OPENCODE_SESSION_ID].current_role // .current_role`）⇒ **显示 ≠ 实际**。

结构性事实：

4. **顶层没有「当前会话」的概念**：它是全项目唯一一格；`role-show.sh` 之所以要分区，正是因为同一文件被多个会话共享。**实测（2026-11-17 咨询链）**：顶层 `session_id` 曾是 11-16 的旧会话，而真实会话由 `$OPENCODE_SESSION_ID` 给出（该观测已在当日切换时同步消除，原始记录见前置报告 §7.4）。
5. **写入口分散且质量不一**：**4 类既有写入口** —— `scripts/role-init.sh`（`cat >`，无锁、非原子）、`scripts/role-migrate-v2.sh`（jq + mv，一次性）、`lib/delegate-core.ts:1685` 的 `writeRoleSession`（**整对象覆盖**分区）、以及 **`prompts/build.md` 里的 5 个写点**（`:593` 口令切换 / `:596` 退出角色 / `:668` 授予窗口 / `:694` 窗口内自动切换 / `:700` 关闭窗口）—— 加上**尚未存在的统一入口**。⇒ "唯一写入口"目前并不成立。
6. **非 build agent 从不写分区**：`front` / `plan` 有各自 prompt（`prompts/front.md` / `prompts/plan.md`），角色矩阵只约束 `build` ⇒ 若用"顶层兜底"，它们会继承 **build 主会话**的身份。
7. **per-session 技术上可行**：bash 工具里 `$OPENCODE_SESSION_ID` 可用（实测），`role-switch.sh` 可据此写自己的分区。

## 决策

### D1 权威：本 session 分区；fallback 链含 **sid 守卫**

**读**（自上而下，命中即止）：

1. `sessions[<本会话 sid>].current_role`
2. 顶层 `current_role` —— **仅当** `role.json.session_id == 本会话 sid`（= 自己最近一次切换的重建）
3. 全局 `~/.rddf/state/role.json` 的 `current_role` —— **仅作「用户级缺省」，不是任何会话的身份**；
   ⚠ 它可能与其它项目的最后一次切换相同，**继承面如实登记在风险表**（V2 覆盖三种分支）
4. `general`

**文件根（钉死）**：身份文件**恒落 `<stateRoot>/.rddf/state/role.json`**（`stateRoot` 按 `ADR-canonical-root-normalization` 判别式；
与 `lib/delegate-core.ts:1687` 的写入侧**同根**）。
⚠ 这**取代** `prompts/build.md:202/210/215` 的「双 session pair 已登记 ⇒ stateRoot，否则 cwd」——该合同会让**读根随一次派发翻转**
（pair 登记后跳到主仓）⇒ 同一会话的分区忽然不可见 ⇒ 身份跌到 `general`（放大权限）⇒ **租约键随之改变**（用户裁决②失效）。
同步清单见 V10。

**写**：角色切换写**本 session 分区** + 更新**顶层镜像**（`current_role` / `updated_at` / `updated_by` / `session_id`）+ `history[]`。

**顶层语义**：**最近一次切换的镜像**；**不作跨会话权限判据**（**同 sid 时**用于重建本会话身份）。`prompts/build.md:209` 按此改述 —— 现措辞「展示镜像、不作权限判据」缺「同 sid」限定，字面上仍与 D1 的链第 2 步冲突。

**为什么加 sid 守卫**：无守卫时，新会话会继承「上一个会话的治理身份」；而 `front` / `plan` 从不写分区 ⇒ 会继承 build 主会话的角色（提权路径）。sid 守卫把镜像限定为「自己的记录」，同时保留旧会话的兼容性。

**不改的**：`sessions[sid].role_class` 语义（派发后端的能力类；后端 `current_role` 恒 `builder` —— **由 `agent === "build"` 分支保证**，须断言，见 D2 表与 V6；沿用 `ADR-backend-handoff-role-class` D2）。

### D2 写入口与字段所有权（**一张表钉死，防互相抹写**）

| 写入方 | 写什么 | 锁 | 原子性 | 约束 |
|---|---|---|---|---|
| **`scripts/role-switch.sh`**（新：主会话**唯一**写入口，支持 `--by user\|auto` / `--exit` / `--grant-window`） | 本 session 分区（`current_role`/`updated_at`/`updated_by`/`session_id`/`auto_switch_window`/**`auto_answer`**）+ 顶层镜像 + `history` | **由 `lib/role-lease.ts` 自己取**（脚本不持锁）；**`role.json` 的读-改-写也在同一锁内完成**（由该模块回调写入）——否则与 `writeRoleSession` 并发互踩 | `tmp + rename`；**读-改-写保留其它分区** | `prompts/build.md:593` 改为调用它；**禁止模型手写 JSON** |
| `lib/delegate-core.ts` `writeRoleSession` | **仅后端 sid 的分区**，**整对象覆盖**（`current_role:"builder"` + `role_class`） | 调用方已持锁 | `writeJsonAtomic` | **不得写顶层**（去掉 `:1700` 回填）；`agent === "build"` 须**断言**（否则非 build agent 会写入非法角色值） |
| `scripts/role-init.sh` | 缺失时创建 | **无锁** | 非原子（`cat >`） | 只在缺失时跑；**登记为残留** |
| `scripts/role-migrate-v2.sh` | 一次性迁移 | 无锁 | jq + mv | 迁移完成后退役 |
| `prompts/build.md` 的**全部** role.json 写点：`:593` 口令切换 / `:596` 退出角色 / `:668` 授予窗口 / `:694` 窗口内自动切换 / `:700` 关闭窗口 | 本 session 分区（按写点分别：`current_role`、`auto_switch_window`、`history`、`used+1`） | 经 `role-switch.sh` | 同上 | **不得**直接写 —— `role-switch.sh` 须支持 `--by auto`、`--exit`（切 `no-role`+清窗口）、`--grant-window` 子命令；⚠ **`:696` 不是写点**（窗口耗尽只输出 halted 报告） |

⚠ `writeRoleSession` 的**整对象覆盖**会重置 `auto_switch_window` / `auto_answer` ⇒ 因此它**只允许写自己的 sid**（后端分区），不得碰主会话分区。

### D3 身份域：只有 `build` agent 参与角色解析与门控

- 角色矩阵**仅对 `build` agent 生效**（`prompts/build.md:192` 的段标题 + `:194`「角色矩阵（仅 build agent 生效）」）；`plan` / `front` 有各自 prompt，**完全忽略该段**。
- ⇒ 角色解析、写门、租约**只对 `build` agent 生效**；其它 agent 固定不参与（不得因镜像/分区拿到 `architect` 等写集）。

### D4 迁移顺序（避免中间态全锁）

1. 先为现存会话写分区（依据：顶层镜像 + `history`；来源不可考的实例标 `legacy`）
2. 再把读侧判据切到 D1 的链
3. 顶层保留为镜像；⚠ `$OPENCODE_SESSION_ID` 缺失时**跳过镜像步**（无 sid 可比 ⇒ sid 守卫不可能成立）
   ⇒ 落到「全局 ⇒ `general`」，并**告警**（stderr + `ledger.jsonl` 各一条）——
   不得按 D1 第 2 步「用镜像」处理（那会与 sid 守卫自相矛盾）

## 选项对比表

| 选项 | 结论 | 理由 |
|---|---|---|
| **本 session 分区为权威**（D1） | ✅ 选中 | 工具层已按此实现（`role-show.sh`）；后端天然隔离（其分区恒 `builder`）；顶层 `session_id` 实测会漂；租约需按 session 归属 |
| 顶层为权威 | ❌ 否决 | 与事实 1/2/7 冲突；并发会话互相覆盖；后端会读到主会话角色 |
| 分区 + 镜像**无 sid 守卫** | ❌ 否决 | 新会话继承他人身份；`front`/`plan` 会继承 build 主会话的角色（提权） |
| **分区 + 镜像 + sid 守卫**（D1 细化） | ✅ 选中 | 兼容旧会话；不跨会话/跨 agent 继承 |
| 分区缺失 ⇒ 直接 `general`（不回落镜像） | ⚠ 备选 | 更简单、也不会继承；但会让**所有**旧会话在迁移前瞬间变成 `general`（放大权限）⇒ 需先迁移完才安全，D4 的窗口期风险更高 |

## 后果 / 代价

**正面**：消除「显示 ≠ 实际」的分裂；每个会话的身份可独立判定；旧会话经 sid 守卫平滑过渡。

**负面**：
- 角色切换多了两处写（分区 + 镜像）与一次锁竞争；
- `role-init.sh` 的无锁非原子写成为**已知残留**（只在首次初始化时触发）；
- `$OPENCODE_SESSION_ID` 缺失 ⇒ **跳过镜像步**（sid 守卫不可能成立）⇒ 落「全局 ⇒ `general`」+ **stderr 与 ledger 双告警**（不得按「用镜像」处理 —— 与 D1 第 2 步的 sid 守卫冲突）。

**风险与缓解**

| 风险 | 缓解 |
|---|---|
| `role-switch.sh` 整文件重写 ⇒ 抹掉别的会话分区 | 规格里写死「读-改-写 + 保留其它分区」+ V4 |
| 写入中断留半文件 | tmp + rename（V5） |
| 迁移期新会话拿到 `general`（放大权限） | D4 顺序 + 迁移后立刻写分区；V2 钉住兜底结果 |
| 模型绕过脚本直接写 `role.json` | `role.json` 写盘保持 `ask` 档（与 `role-aware-permissions` 的 D5 同源）+ 登记为可绕过 |
| **全局兜底步的继承面**：全局 `current_role` 可能来自别的项目/别的会话 | 已限定为「用户级缺省」+ 风险登记；V2 覆盖三分支 |

## Verification（可勾选验收判据，前瞻）

- [ ] **V1** 同一 worktree 两个会话：各读各的分区，互不影响（行为取证）
- [ ] **V2** 分区缺失：`session_id` 匹配 ⇒ 用镜像；不匹配 ⇒ 全局（若设）⇒ `general`（三种分支各一例）
- [ ] **V3** `front` / `plan` 会话**不参与**角色解析：镜像为 `architect` 时它们仍不获得 `architect` 写集
- [ ] **V4** `role-switch.sh` **读-改-写**：切换后其它分区与 `legacy` 键**原样保留**
- [ ] **V5** 原子性：写入过程中断（模拟）⇒ 文件仍可解析，无半截 JSON
- [ ] **V6** `writeRoleSession` 仍写后端分区（`current_role:"builder"` + `role_class`），**不写顶层**；`agent !== "build"` 时**抛错**（断言）
- [ ] **V7** 同一会话的并发写（分区 + 镜像）在**同一临界区**内完成（无 check-then-act）
- [ ] **V8** 授权窗口自动切换走 `role-switch.sh --by auto`（`updated_by:"auto"`、`used+1`、`limit` 拒绝）
- [ ] **V10** **文件根唯一**：身份文件**恒在 `<stateRoot>/.rddf/state/role.json`**；在 linked worktree 里「切角色 → 派发（登记 pair）→
      再读」三次读到的**是同一个文件**、同一分区可见、解析角色**不变**（防根翻转）；同步清单：`prompts/build.md:202/210/215`
      + `docs/MULTI-AGENT-DESIGN.md:404-405`
- [ ] **V9** 回归：`bun test tests/` 全绿 + anchors 无 FAIL。⚠ 改写 `prompts/build.md:593` **必须保留**三步字面锚点
      「校验目标角色合法」/「更新项目级 `role.json`」/「输出新角色的开场报告」（各**全文恰好 1 次**，顺序不变）
      与突变锚点「② 更新项目级 `role.json`」「③ **先输出新角色的开场报告**」——否则 `config-guards.test.ts:391` 判红、
      `:849` 的突变退化为静默 no-op。**推荐改法**：保留原三步字面，在 ② 后追加「（经 `scripts/role-switch.sh`）」
