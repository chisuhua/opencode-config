# 咨询报告 — 「Allow always 纪律落点」与「角色感知权限」两问的裁决链

> 日期：2026-11-17
> 链：**metis**（意图/歧义/slop/边界）→ **oracle**（治理面审查，`PASS-WITH-NOTES`）→ **critic**（`REJECT`，3 BLOCKER）
> 本轮**零代码改动**：两问均为「是否立项/动手」的决策，产物是本报告 + 裁决建议。
> ⚠ 实施方（builder）**已复核** critic 的取证，并**更正其中一处误读**（见 §4）。

## 1. 两问与建议裁决

| # | 问题 | 建议 | 依据 |
|---|---|---|---|
| ① | 把「不对 `git commit` 弹窗点 Allow always」写进 `prompts/build.md` | ❌ **不写**；改落 `docs/MULTI-AGENT-DESIGN.md` 当前态 + **单一真源反向守卫** + 未覆盖清单登记；**不立 openspec change** | metis「范畴错误」成立（oracle/critic 均确认）；`prompts/build.md` 唯一消费者是模型，看不见宿主弹窗、控制不了点击 |
| ② | 为「角色感知权限」立 change | ⚠ **先立 ADR，不直接立 change** | `no-self-adjudication:115` 已把「权限层硬 deny」分类为**架构级**；且身份真源未定（§4 更正）+ 第四条路前提被证伪 |

## 2. 三方结论摘要

### metis
- ①**范畴错误成立**：写给错误读者（人 vs 模型）。落点应在**当前态**文档（`CHANGELOG.md:3-5` 自述只记历史）；**反对**读 `opencode.db` 的探针（环境耦合 + 前提未核实）。
- ②**设计死结**：gate 的身份真源 `role.json` 由**模型自己写**（`prompts/build.md:593`）⇒ 被拒后先写 `current_role:"general"` 再重试即自解锁（v2.44 已证明该失效模式）。
- ②三档：P1（`edit` 路径 map + `role.json: ask`）/ P2（插件 + `lib/role-policy.ts` 单源，门控 `edit`/`write`）/ P3（按 agent 拆角色，唯一不可自我提权）。
- ②粒度不可合并：矩阵禁止列混了**四种不可通约**的可达性（路径集 / 动作语义 / tool action / 前缀 shell）。

### oracle（`PASS-WITH-NOTES`）
- ①采纳换落点；**并加 `bun:sqlite` 只读探针**（断言 `permission` 表无 `git commit*` 的 allow 记录）—— **与 metis 正相反**。
- ②P1 单独做**最差**（弹窗疲劳 + always 同构复发 + 不门控禁止动作本身）⇒ 建议 P1 并入 P2。
- ②提出「第四条路」：**口令锚定的角色写门**，前提是「模型无法伪造 user 消息」。

### critic（`REJECT`，mergeable: no）
| 类 | 内容 |
|---|---|
| BLOCKER 1 | **剔除 db 探针**。取证：本仓测试**零**读用户级状态先例；`tests/config-guards.test.ts:1730-1739` 明确「`~` 与 `/` 无法守卫 —— **排除是刻意的**」⇒ 探针在干净机器上恒绿 = **假信心**。✅ 已复核成立 |
| BLOCKER 2 | **「模型无法伪造 user 消息」被证伪**。取证：`plugins/subagent-contract.ts:148-157` 是 **`isResume` 判定**（`history.some(m => m.type === "user")`），与消息真伪无关；本仓 user 型消息可由 tool content（`delegate-core.test.ts:646`）、程序化注入（`lib/delegate-core.ts:2449`、`lib/delegate-async.ts:1437`）、`question` 回答、compaction 摘要产生。✅ 已复核成立 |
| BLOCKER 3 | **P2 = 按角色硬 deny ⇒ 依 `no-self-adjudication:115` 属架构级**；oracle 却安排「新 change + design 修订立场句」⇒ 架空已签批分类。闭包只有两条：用户显式重分类，或 **ADR 先行**。 |
| SHOULD_FIX 1 | ①的反向守卫须写成**单一真源路由**形态（先例 `tests/config-guards.test.ts:1749`：正向「真源在此」+ 负向「别处不得自定义」绑在同一条规则），孤立负向断言会退化成双标准 |
| SHOULD_FIX 2 | ①的落点片段归属：`MULTI-AGENT-DESIGN.md` §4.4 是「权限加固要点」（权限层配置），这条是**用户纪律** ⇒ 应新开小节或与 §3.3「被权限拒绝后的纪律」（`:671-688`）同族 |
| SHOULD_FIX 3 | ②P2 宣称边界须补第 **4** 条：「`shell` 写 `role.json` 不在保证内」——死结只被**收窄**（双路变单路），**未闭合**；且三条免 declare 须同时落**测试注释 + 主题文档**两处（`no-self-adjudication` AC14 同款仓标准） |
| SHOULD_FIX 4 | ②顺序：**先**修 `prompts/build.md:593` 写规格（治理面 oracle→critic），**再**落插件门；反过来 = 新形态三层漂移 |

## 3. 建议裁决（细化到可执行）

### ① 采用 metis 版 + oracle 的落点，删掉 oracle 的探针句
1. `docs/MULTI-AGENT-DESIGN.md` 新增（或并入 §3.3 同族）小节：纪律正文 + 触发条件 + 为什么不能靠 prompt。
2. `tests/config-guards.test.ts` 加一条**单一真源路由**守卫（仿 `:1749`）：真源在该文档小节；`prompts/**` **不得**承载该纪律。
3. 既有「未覆盖清单」登记「saved approval 的存在性不可机械核」；**一次性人工核查结论**（`permission` 表 230 行无 `git commit`）作为 docs 证据句，**不固化为测试**。
4. 不立 openspec change（纯 docs + 一条断言；按 ADR-0047 D3 的档位判定归**执行 agent**，本报告不代替该判定）。

### ② 先 ADR，再 change
ADR 必须先裁三件事（缺任一，change 的 AC 无法写）：
1. **档位与宣称边界**：P2 是否属于 `no-self-adjudication:115` 所说的「架构级」；若重新分类，是谁签、依据什么。
2. **身份真源**：哪个字段是本会话的治理身份（见 §4 更正 —— 两份文档指向相反）。
3. **与派发后端机制的关系**：采纳 oracle 的「会话类型不相交」（插件只门控无 `parentID` 的主会话，后端维持宿主规则唯一门控）+ `lib/role-policy.ts` 单一映射。

第四条路（口令锚定）的处置：**收窄后可作为 ADR 的一个选项**，但宣称必须写成「防事故，不防绕过」，且前提句改为「仅当本回合 user 消息为 text-part、非摘要/非注入、且口令一次性可验」——**不得**写成「模型无法伪造 user 消息」。

P3（按 agent 拆角色）登记 backlog，本轮不启动。

## 4. ⚠ 实施方更正 critic 的一处取证（影响「谁签」）

critic 称「『分区权威』有 ADR 背书（`ADR-plan-delegate-engineering-session.md:88`），不需重签」。复核**不成立**：
- 该文件 `:88` 讲的是 `grants` 类目白名单与「question/form/edit/write 永不可 grant」——**与 role 分区无关**；`:147` 只说「plan 派发会让后端写 `role.json`，与主会话 role 镜像**可能打架**（本篇不改其语义，仅登记为残留）」。
- **反向证据**：`docs/adr/ADR-backend-handoff-role-class.md:42` 明写「`current_role` 仍写 `builder`。理由：`current_role` 是**治理身份**（值域含 architect/verifier 的签批语义）」⇒ **顶层 `current_role` 被该 ADR 当作治理身份**。
- 而 `prompts/build.md:209` 说 role-v2 里顶层 `current_role`「降级为展示镜像，**不作权限判据**」。

⇒ **两份文档对「谁是本会话的治理身份」指向相反**，且 `prompts/build.md:593` 的切换写规格**只写顶层**（分区在主会话流程里没有写入者 ⇒ 现存漂移：顶层 `builder` vs 本会话分区 `verifier`）。
⇒ 因此「身份真源」是**真未决**，必须由用户在 ADR 里裁定（或在 change 的 design 里显式裁定并受审），**不是**「已有背书、不需重签」。

## 5. 待用户拍板（6 条）

| # | 待签 | 默认建议 |
|---|---|---|
| 1 | ① 落点 = `MULTI-AGENT-DESIGN.md` + 单一真源反向守卫 + 未覆盖清单登记 + **不立 change** | ✅ 建议签 |
| 2 | ① **不做** db 探针（metis/critic），oracle 那条作废 | ✅ 建议签 |
| 3 | ② 立项**前置**：P2 是否属架构级 —— 用户显式**重分类** 或 **ADR 先行**（二选一） | ⚠ 建议 **ADR 先行** |
| 4 | ② 第四条路（口令锚定）：**收窄重述（降级宣称）** 或 **放弃** | ⚠ 建议收窄后作 ADR 选项 |
| 5 | ② **身份真源**裁定：顶层 `current_role` / 本 session 分区 / 两者语义再切分（§4） | ⚠ 必须签（不可由实现方自选） |
| 6 | ② P3 入 backlog、本轮不启动 | ✅ 建议签 |

## 6. 证据索引

- `tests/config-guards.test.ts:1730-1739`（`~`/`/` 排除是刻意的）、`:1749`（单一真源守卫先例）、`:1113-1170`（未覆盖清单）、`:1127-1131`（shell 写盘盲区）
- `plugins/subagent-contract.ts:135`（`tool.execute.before` 可拒绝）、`:148-157`（isResume）
- `prompts/build.md:196`（软约束立场）、`:209`（role-v2 展示镜像）、`:449-453`（矩阵禁止列四类可达性）、`:593`（切换只写顶层）
- `opencode.jsonc.opencode-go:50`（`edit: "allow"`）、`:55`、`:96`（prompt 注入）、`:194-200`（plan agent 的 edit 路径 map）
- `docs/adr/ADR-backend-handoff-role-class.md:42`（顶层 `current_role` = 治理身份）
- `docs/adr/ADR-plan-delegate-engineering-session.md:147`（后端写 role.json 与镜像打架，仅登记）
- `openspec/changes/no-self-adjudication/proposal.md:115`（硬 deny = 架构级）
- `docs/MULTI-AGENT-DESIGN.md:546`（已知边界）、`:673`（权限模型被绕承认）、`:783,:809`（shell 残余）
- `docs/CHANGELOG.md:3-5`（只记历史）、v2.43 / v2.44 条目
- `.rddf/state/role.json`（顶层 `builder` vs 本会话分区 `verifier`）

---

## 7. 落地记录（2026-11-17，角色 = architect）

### 7.1 用户拍板（6 条全签，按本报告建议）

① 落 `MULTI-AGENT-DESIGN.md` + 单向真源路由守卫 + **不立 change**；① **不做** db 探针；② **ADR 先行**；② 第四条路**收窄重述**作 ADR 选项；② 身份真源**必须用户签**；② P3 入 backlog。

### 7.2 ① 的落地（治理面，已过 oracle → critic）

| 文件 | 改动 |
|---|---|
| `docs/MULTI-AGENT-DESIGN.md` | 新增 **§3.4**（纪律正文 / 为什么不能进 `prompts/**` / 单向真源路由 / **判别力天花板** / saved approval 不可机械核）+ **§4.4.1** 补 `git commit` ask（v2.44 已生效但当前态缺载）+ 版本戳 v2.3.0 → **v2.3.1** |
| `tests/config-guards.test.ts` | 新 describe 3 条（真源侧 / **递归**遍历 `prompts/**` 负向 / 谓词判别力）+ 未覆盖清单加「用户侧批准纪律不可机械核」+ 旧「commit ⇒ 独立 change」按 v2.44 更正 |
| `docs/CHANGELOG.md` | v2.45 条目 |

**变红演练 ×2**（备份→突变→跑→恢复）：删 §3.4 标题 ⇒ 红；把措辞抄进 `prompts/build.md` ⇒ 红（恢复后 diff 为空）。

### 7.3 ② 的落地（ADR Draft）

`docs/adr/ADR-role-aware-permissions.md`（155 行，**Status: Draft**）：D1 档位（T2 目标 / T1 前置 / T0 否决 / T3 backlog）、**D2 身份真源（顶层 `current_role` 唯一权威）**、D3 门控面、D4 会话类型不相交 + `role-policy.ts` 单源、**D5 逃生口=切角色（口令锚定收窄，显式排除 `question` 回答）**、D6 宣称边界「防事故不防绕过」、选项对比表、后果/代价、V1–V12。

### 7.4 审查结论与闭合

- **oracle**：`PASS-WITH-NOTES`（0 BLOCKER）。4 条建议**全闭**：D5 排除 `question` 回答（它指出这是唯一「可机利用的提权缝」）/ D3 shell 脚注 / D2 并发后果 + `:209` 同批提升为 V11 / §3.4 天花板 + 测试注释指针改实 + 版本戳。
- **critic**：`APPROVE_WITH_CONDITIONS`（**0 BLOCKER** / 3 SHOULD_FIX / 3 NIT）。3 条 SHOULD_FIX **全闭**：
  1. **V11 升格为立场句清单** —— 收编 `prompts/build.md:196`（软约束句，门控后前半句为假且反向误导）、`:706`（选项 B「破例 X」与 D5 直接冲突，ADR 声明由 D5 取代）、`scripts/role-show.sh:39-53`（**分区优先读序** ⇒ 与 D2 分叉，属静默错门家族）；
  2. **证据句更正** —— fact 4 标注「2026-11-17 咨询链观测 + 已在同日切换时同步消除（现读文件看不到）」；`:41` 改为「规格未规定分区写入」并登记「已观测到非规范写入」；
  3. **顶层 back-fill** —— `lib/delegate-core.ts:1700` 会在顶层缺失时以分区值回填 ⇒ 派发可创造治理身份；D2 加处置（倾向**去掉回填**）+ **V12**。
  NIT 3 条亦闭：D3 写集以**归一绝对路径**为根 / 签批粒度句 / 守卫改**递归**扫描。

### 7.5 未闭合（等用户）

- **ADR D2 待签**（Status 保持 Draft；签了才转已决）。
- 立项（`openspec change`）在 D2 签署后由 **planner** 做；本 ADR 已把「立场句清单 + 插件门 + `role-policy.ts` + 守卫 + e2e」定为**同一 change 同批**（V11 / 反漂移）。

---

## 8. 第二轮：D2 反转 + 新增角色租约（2026-11-17，用户裁决 + oracle 增量审）

### 8.1 用户裁决（4 条）

1. 身份真源改为 **本 session 分区**（原 D2「顶层权威」被推翻）—— 触发证据：顶层 `session_id` 实测为旧会话，而真实会话由 `$OPENCODE_SESSION_ID` 给出。
2. **同一 worktree 同角色至多一个活跃 session**；不同角色可并行。
3. 后端↔后端**保留** `ADR-front-multi-backend` D6.2（同 workRoot 一个后端，更严）。
4. `no-role` 豁免、`general` 独占；陈旧租约**直接接管 + 显式告警**。

### 8.2 oracle 增量审：`REJECT`（6 类 BLOCKER），已逐条闭合

| # | BLOCKER | 闭合方式 |
|---|---|---|
| A | fallback 链把顶层镜像当判据 ⇒ 与 `build.md:209`「不作权限判据」**自相矛盾**；且与本文风险表描述的另一条链不一致 | 链改为「分区 → 镜像**仅当 `session_id` == 本会话** → 全局 → `general`」，并在身份 ADR 里把 `:209` 补一句「同 sid 时用于重建本会话身份」⇒ 语义一次说清 |
| B | 镜像兜底 ⇒ **跨 agent / 跨 worktree 继承他人身份**（front/plan 从不写分区 ⇒ 会继承 build 主会话的 architect） | ① sid 守卫；② 新增 **D3 身份域**：角色解析 / 门控 / 租约**只对 `build` agent 生效** |
| C | 「唯一写入口」是假的：`role-init.sh`、`role-migrate-v2.sh`、**授权窗口自动切换**、`writeRoleSession` 都写 role.json；且 `writeRoleSession` 是**整对象覆盖**会抹窗口字段 | 新增 **D2 写入口 × 字段 × 锁 × 原子性**表；`role-switch.sh` 支持 `--by auto`；写死「读-改-写保留其它分区 + tmp+rename」；`writeRoleSession` 只允许写后端 sid |
| E | 租约键把「治理身份」与「能力类」混在一格 ⇒ **主会话 builder + 后端 builder（最常见派发路径）被误拒** | ⚠ **保留用户规则**（同角色即冲突），并在后果/代价里**显式登记该路径受影响**；备选「命名空间分离」记入选项表为**已否决**及理由 |
| F | 接管无围栏 ⇒ **接管即制造双写** | 新增 `claim_gen` 单调 + 「旧持有者的租约写一律拒绝」+ V11 |
| G | 判活方向反了：主会话用自造 TTL、后端用宿主活性 | 统一为**宿主探活优先、TTL 兜底**，且**接管前必须探活** |
| H | 插件缺席时**门控与租约一起失效**，D5 只有 4 项免宣称 | 新增 **D5⑤ 执行点缺席**，免宣称变 5 项 |
| K | V11 漏「授权窗口写路径」与 **`tests/config-guards.test.ts:391/:849`**（改 `:593` 文本会让守卫变红 ⇒ V10 与 V11 互斥） | 身份 ADR 的 V9 明确「同步守卫三步锚点 + 突变锚点」 |
| L | 一篇承载 4 个决策点（D1 档位 / D2 身份 / D3-D6 门控 / D7 租约）⇒ 违反「一文档一决策」 | **拆两篇**：`ADR-role-session-identity.md`（身份）+ `ADR-role-aware-permissions.md`（档位/门控/租约，租约可独立否决） |
| D/M | 事实 5 用了已被消除的快照；`delegate-async.ts:12` 引错行；「后端恒 builder」是约定非强制 | 改为结构性论证 + 消解注记；引用改 `:15-16`；补「须断言 `agent === "build"`」 |

### 8.3 本轮产出

- 新 `docs/adr/ADR-role-session-identity.md`（身份 + 写入口所有权表 + 迁移顺序，V1–V9）
- 重写 `docs/adr/ADR-role-aware-permissions.md`（档位 / 门控面 / 破例 / 宣称 5 项 / 租约，V1–V14）
- 两篇 Status 均 **Draft**；租约可独立否决而不影响其余

### 8.4 critic 轮（拆篇后）：`REJECT`（2 BLOCKER / 6 SHOULD_FIX），已全闭

| # | finding | 闭合 |
|---|---|---|
| B1 | **身份文件的「根」从未钉死**，而既有合同「双 session pair ⇒ stateRoot，否则 cwd」会让**读根随一次派发翻转**（pair 登记后跳到主仓）⇒ 同一会话分区忽然不可见 ⇒ 身份跌到 `general`（放大权限）⇒ **租约键随之改变**，用户裁决②在该窗口失效 | 身份 ADR D1 新增「**文件根（钉死）**：恒 `<stateRoot>/.rddf/state/role.json`，与 `delegate-core.ts:1687` 写入侧同根」，**明确取代** `build.md:202/210/215`；新增 **V10**（linked worktree 下「切角色→派发→再读」三次同文件同分区）+ 同步清单（`:202/210/215` + `MULTI-AGENT-DESIGN.md:404-405`） |
| B2 | **`claim_gen` 围栏只挡租约写、不挡工作区写** ⇒ 接管后旧会话仍能写同一工作树 ⇒「至多一个活跃 session」在接管路径不成立，而风险表却把围栏登记为缓解 | 采**方案 a**：门控 ADR D2 新增「**每次写类工具调用都校验租约（holder + `claim_gen`）**」；D6 执行点 ③ 从「开局」改为「**每次写类调用（含开局）**」；并把因果断言改准（「只有租约层围栏是不够的」） |
| A | D5⑤ 称「门控与租约同时不生效」不实 —— `role-switch.sh` 是 bash 脚本，不经插件 | 改为「插件缺席 ⇒ **门控**不生效；租约**只剩 `role-switch.sh` 一个执行点**（派发/开局/写时校验随插件消失）」 |
| B | D6 标题无域限定；非 build 主会话不参与租约这件事未进免宣称 | 标题改「**build 域内**…」；D5 新增**第 ⑥ 项**（非 build 主会话不参与门控与租约 ⇒ 与 build 主会话并发时不受保护） |
| C | 全局兜底步无 sid 守卫，继承面与选项表否决理由同源却未登记 | 限定为「**用户级缺省**，不是任何会话的身份」+ 风险表登记继承面 + V2 覆盖三分支 |
| D | 身份链**没有归属模块** ⇒ 门控与租约可能各实现一份 | 门控 ADR D3 指定 `lib/role-identity.ts` 为**单一落点**，门控与租约同函数取值 |
| E | 锁归属两篇各说一半（脚本持锁 vs 模块持锁） | 身份 ADR D2 锁列改为「**由 `lib/role-lease.ts` 自己取**（脚本不持锁）」 |
| F | 「谁在何时确认该工作流」缺归属 | 写明「**签批 D6 即视为确认**；否决 ⇒ D6 不签、ADR 留 Draft」+ 联动修订 D1/D5 |
| G | V10 的「无分区 ⇒ `general`」缺前提 | 补「全局文件不存在或其值亦为 `general`」 |
| NIT | 「恒 builder」无条件表述 / 字段表漏 `auto_answer` | 均补 |

**预算**：oracle **2/2**（首轮 REJECT + 复审 REJECT，10 条 finding 已处置）；critic **1 轮**（本轮，2 BLOCKER + 6 SHOULD_FIX 全闭）。**未再开第二轮** —— 后续如再审需用户明确批准。
