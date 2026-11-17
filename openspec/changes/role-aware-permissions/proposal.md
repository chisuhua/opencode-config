# role-aware-permissions — 角色写门从 prompt 软约束变为工具层保证 + 会话身份落点改造

> 判据真源：**两份 ADR**（`docs/adr/ADR-role-session-identity.md` / `docs/adr/ADR-role-aware-permissions.md`）
> —— 本 change 是它们的**实施**载体，**不新增任何决策**。
> 决策取舍：见两份 ADR（身份源 / 档位 / 门控面 / 破例 / 宣称边界 / 角色租约）。
> ⚠ **本 change 的 AC 表就是两份 ADR 的 V 项逐条映射**（身份 V1–V10 → AC1–AC10；门控+租约 V1–V14 → AC11–AC24）。
> ✅ **两份 ADR 已签批**（Status **Accepted**，2026-11-17 用户签批；D6 工作流同批确认）⇒ 本 change 可开工。

## Why

### 1. 软约束已被证伪（v2.44 实测 2/2）

`prompts/build.md` §输出 的「不要主动 `git commit` —— 等用户确认」曾被**权限层更具体的配置否决**（模型据
「不在 ask 档」自行 commit）。同一失效模式对**角色写面禁令**同样成立：角色矩阵里 architect / planner / no-role
的「禁 edit `src/**`」「禁写 `design.md`·`tasks.md`」「禁创建 openspec change」**全部是 prompt-only**，
而权限层对 build agent 是 `edit: "allow"`（完全放行）⇒ 模型信权限层 ⇒ 禁令形同虚设。

### 2. 身份落点本身是分裂的（三源不一致）

- 写侧：`prompts/build.md:593` 只写**顶层** `current_role`
- 读规格：`:210` 只提 `current_role`（未提分区）
- 工具层：`scripts/role-show.sh:37-48` **分区优先** ⇒ **显示 ≠ 实际**

且顶层**没有「当前会话」概念**（实测：顶层 `session_id` 曾是 11-16 的旧会话，而真实会话由 `$OPENCODE_SESSION_ID` 给出）。

### 3. 同 worktree 的同角色并发没有任何检测

`lib/delegate-async.ts:11-12` 的互斥只约束**后端占槽**（同 `workRoot` 一个后端）；**主会话不在槽位体系**里
⇒ 主会话 + 后端可共存于同一 worktree，**同角色时会互相踩**（git 索引 / 工作区）。

### 4. 用户已拍板的四条

① 身份真源 = **本 session 分区**；② **同一 worktree 同角色至多一个活跃 session**（不同角色可并行）；
③ 后端↔后端**保留** `ADR-front-multi-backend` D6.2；④ `no-role` 豁免 / `general` 独占 / 陈旧租约**直接接管 + 显式告警**。

## What Changes

### A. 身份落点（身份 ADR）

1. `prompts/build.md:593` 的切换写规格 ⇒ 改为**调用 `scripts/role-switch.sh`**（禁止模型手写 `role.json`）
2. **写入口收敛**：build.md 的 **5 个** role.json 写点（`:593` / `:596` / `:668` / `:694` / `:700`）全部经脚本
   （`:696` 不是写点）；`writeRoleSession` 只写**后端 sid** 的分区、**不写顶层**（去掉 `delegate-core:1700` 的回填）
3. **文件根恒 `stateRoot`**（取代「双 session ⇒ stateRoot，否则 cwd」——后者会随一次派发翻转）；⚠ AC10 的取证**禁把 `stateRoot` 注入成常量**
4. 读侧：分区 → 同 sid 镜像 → 全局 → `general`；身份域只对 `build` agent 生效
5. 迁移：先写分区再切读侧（避免中间态全锁）

### B. 写门与租约（门控 ADR）

6. 新插件在 `tool.execute.before` 上做**角色写集门控**（只覆盖 `edit` / `write` / `subagent`；`shell` 明确不在）
7. **角色租约**：`role-claims.json`（`<stateRoot>/.rddf/state/`），键 `(workRoot, 工作角色)`；
   同角色冲突 ⇒ 拒绝并**指名持有者**、**回到调用方**；不同角色 ⇒ 并行
8. **每次写类工具调用校验租约**（holder + `claim_gen`）——否则接管后旧持有者仍能写工作树
9. 破例通道 = **切角色**（唯一逃生口，可观测）；口令锚定收窄（排除 `question` 回答等）
10. **六项免宣称**（含非 build 域不参与 / 执行点缺席）

### C. 守卫与文档

11. 层 1 判据：身份链 / 写入口 / 租约键 / `claim_gen` 围栏 / 立场句同步（含**既有守卫的锚点必须保留**）
12. `prompts/build.md:196`（软约束句）与 `:706`（破例）同批改述；`:202/210/215` 与
    `docs/MULTI-AGENT-DESIGN.md:404-405` 的根口径同步

## 不做什么（scope 边界）

| 项 | 理由 |
|---|---|
| 按 agent 拆角色（T3） | 唯一不可自我提权的路线，但改写角色口令 / 矩阵 / 守卫 / e2e ⇒ 另立 ADR（已入 backlog） |
| 放宽 `ADR-front-multi-backend` D6.2 | 用户裁决 A：同 workRoot 一个后端保持 |
| 门控 `shell` 写盘 | 已知盲区（`sed -i` / `tee` / `>`）⇒ 登记为免宣称，不假装覆盖 |
| 把 `role_class` 当 `current_role` 用 | 「同名不同权」误配 + 「换类 = 必须 handoff」被打穿（`ADR-backend-handoff-role-class` D2） |
| 让 `front` / `plan` 参与门控或租约 | 身份域只对 `build` 生效（两份 ADR 的 D3）⇒ 登记为免宣称第 ⑥ 项 |
| 改 `scripts/role-init.sh` / `role-migrate-v2.sh` 的原子性 | 本次只登记为残留，不顺手改（超出 scope） |

## 验收标准

> 逐条对应两份 ADR 的 V 项。**身份 ADR** V1–V10 → AC1–AC10；**门控 ADR** V1–V14 → AC11–AC24。

| AC | 判据 | 类型 | 来源 |
|---|---|---|---|
| AC1 | 同一 worktree 两个会话各读各的分区，互不影响 | 行为 | 身份 V1 |
| AC2 | 分区缺失时：`session_id` 匹配 ⇒ 用镜像；不匹配 ⇒ 全局 ⇒ `general`（三分支各一例） | 行为 | 身份 V2 |
| AC3 | `front` / `plan` 会话**不参与**角色解析（镜像为 `architect` 时它们仍不获得该写集） | 行为 | 身份 V3 |
| AC4 | `role-switch.sh` **读-改-写**：切换后其它分区与 `legacy` 键**逐字节**保留、`history` 追加；**切换中途失败 ⇒ `role-claims.json` 与 `role.json` 均未变 + 非 0 退出 + 指名原因** | 结构 | 身份 V4 |
| AC5 | 写入原子性：注入 `rename`/`write` 失败 ⇒ **原文件逐字节不变 + 无 `.tmp-*` 残留**（`role.json` **与** `role-claims.json` 各一条） | 结构 | 身份 V5 |
| AC6 | `writeRoleSession` 仍写后端分区（`current_role:"builder"` + `role_class`）、**不写顶层**；`agent !== "build"` **抛错** | 结构 | 身份 V6 |
| AC7 | **无丢失更新 + 同临界区**：20 轮**强制交错**（barrier；A 的完成标记 = **读完成**；A 等 B 就绪设超时 T，超时即视为已串行）⇒ 两分区（含镜像）都在、计数无损；**分区写与镜像写在同一临界区**（无 check-then-act）；**必红证据：锁→no-op ⇒ 100% 红** | 结构+行为 | 身份 V7 |
| AC8 | 授权窗口自动切换走 `role-switch.sh --by auto`（`updated_by:"auto"`、`used+1`、超限拒绝） | 行为 | 身份 V8 |
| AC9 | 回归绿 + **既有守卫锚点未被破坏**（三步字面 + 突变锚点保留） | 结构 | 身份 V9 |
| AC10 | **文件根唯一**：linked worktree 里「切角色 → 派发（登记 pair）→ 再读」三次**读到同一文件路径、同一分区可见、解析角色不变**；另加 symlink 变体（两写法同键） | 行为 | 身份 V10 |
| AC11 | `architect` 会话对 `src/**` 的 `edit`/`write` **返回工具错误** | 行为 | 门控 V1 |
| AC12 | `builder` 会话写 `docs/adr/**`（`arch_paths` 命中）**成功** | 行为 | 门控 V2 |
| AC13 | `no-role` 会话对任意仓库文件 `edit` **被拒**，但**能完成角色切换** | 行为 | 门控 V3 |
| AC14 | `architect` 会话写治理面（`~/.config/opencode/prompts/**`）**成功** | 行为 | 门控 V4 |
| AC15 | `planner` 会话写 `src/**` **被拒**、写 `.rddf/roadmap/**` / `.rddf/improvements/**` **成功** | 行为 | 门控 V5 |
| AC16 | **单一真源**：插件与 spawn 规则构建器共用 `lib/role-policy.ts`；**身份解析单一落点** `lib/role-identity.ts`（门控与租约同函数取值） | 结构 | 门控 V6 |
| AC17 | **会话类型不相交**：后端（`parentID != null`）**不受插件门控**，仍走 `scopeEditRules`；非 build 主会话亦跳过 | 结构 | 门控 V7 |
| AC18 | **租约拒绝**：主会话 `builder` 活跃时派 `builder` 类后端 ⇒ **拒绝**，错误含 holder `session_id` + workRoot，且**回到调用方** | 行为 | 门控 V8 |
| AC19 | **异角色并行**：主 `architect` + 后端 `verifier` 同 worktree ⇒ 两者都成功 | 行为 | 门控 V9 |
| AC20 | **豁免与独占**：两个 `no-role` 可并存；第二个 `general` 被拒；**无分区**的新主会话（链落 `general`）与另一个 `general` 同样冲突 | 行为 | 门控 V10 |
| AC21 | **判活与接管围栏**：宿主探活失败 + TTL 超时 ⇒ 接管成功且告警；**旧持有者「租约写」与「写类工具调用」两条独立用例都必须失败**；`claim_gen` 比较语义为 **`!=` 即拒**且**单调不减**；`role-claims.json` **四种损坏形态**（截断/空/数组/缺字段）⇒ **保守拒绝**、gen 不回退 | 行为 | 门控 V11 |
| AC22 | **持锁互斥**：A 持锁并写标记 ⇒ B **等标记可见后** acquire **必须失败**（失败原因 = 锁占用/超时）；A 释放后 B 必须成功；**「两进程同时起跑」不作判据**；`mkdir` 不带 `-p`；陈旧回收 30 s（两条边界：`== 阈值` 阻塞 / `+1` 回收）；硬超时 10 s；**不按 pid 判活**；锁内不得再取锁 | 结构 | 门控 V12 |
| AC23 | **免宣称六项**在 AC + 测试注释 + 主题文档**三处**登记 | 结构 | 门控 V13 |
| AC24 | 回归绿 + anchors 无 FAIL；立场句（`:196` / `:706` / `:202` / `:210` / `:215`）与 `MULTI-AGENT-DESIGN.md:404-405` 同批落地 | 结构 | 门控 V14 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [x] AC1–AC10（身份落点：分区权威 / 写入口收敛 / 文件根唯一 / 迁移）
- [x] AC11–AC17（写门：门控面 / 单一真源 / 会话类型不相交）
- [x] AC18–AC22（角色租约：拒绝 / 并行 / 豁免独占 / 判活围栏 / 锁协议）
- [x] AC23–AC24（免宣称登记 + 回归与立场句同批）

## 免宣称六项（AC23 的登记面）

> 判据真源：`docs/adr/ADR-role-aware-permissions.md` D5。**三处登记**：本节（AC）+ `tests/role-exemptions.test.ts` 的文件头（测试注释）+ `docs/MULTI-AGENT-DESIGN.md` §2.8.7（主题文档）。
> 语义：**防事故，不防绕过** —— 六项之下，门控**不保证**拦住越权动作。

- **D5①** `shell` 写盘（`sed -i` / `tee` / `>` / `cp`）**不在**门控内。
- **D5②** shell 层 **pattern 盲区**（`git -c … commit` / `GIT_AUTHOR_NAME=x git commit`）不在范围。
- **D5③** `role.json` / `role-claims.json` **可被改写**（`shell` 或 `edit`）⇒ 身份与租约都可被伪造（写盘已进 `ask` 档，但**仍可绕过**）。
- **D5④** **saved approval**（宿主「Allow always」）会覆盖配置，层 1 看不见。
- **D5⑤** **非 build agent 主会话**不参与（`plan` / `front` 等）⇒ 它们与 build 主会话并发时**不受**本 ADR 保护。
- **D5⑥** **执行点缺席**（插件未激活 / `--standalone` / 改插件后未 `service restart` / 插件文件不在 `plugins/`）⇒ 门控不生效；租约仍剩 `role-switch.sh` 与**派发临界区**两个执行点。
