# 验收报告：plan-topics D9 / D10 / D11 + D5 修订的实现批

> 作者：**verifier**（角色内建验收，非 subagent）｜日期：2026-11-25｜已用轮次：**第 1 轮**（本批首次验收）
> 对象：本批 = 基线 `3177feb` → `HEAD`（`43c1c55`），核心实现提交 `ec28138`「feat(plan-topics): 取消/在飞/收敛判据 + D5 每会话一文件」+ 7 个回滚清单 / 锚点补丁提交（`3f5dde5` `66d96bc` `ee252b8` `8c73f7c` `732507a` `c604113` `43c1c55`）
> 判定：**`needs-revision`**（1 项）——V16–V36 **全过**；本批 AC 21 项中 **1 项未闭合**（D5 落地硬约束 ⑥ 的 `notes` 散文 ⇒ `implementation_gap`，回 builder 一行）

---

## 1. 判据来源（按 `prompts/build.md` §verifier 产出契约 的优先级）

| 优先级 | 来源 | 本轮实际取用 |
|---|---|---|
| 1 | 用户本次明确给出的验收条件 | 「按 ADR 的 **V16–V36** + **本批 AC** 逐条取证，报告落 `.rddf/reviews/`」 |
| 2 | openspec change 的 AC 段 | **不适用** —— 本批无 openspec change（`openspec/changes/` 下只有无关的 `subagent-contract-critic-reeval`；`2026-11-20-plan-multi-session-collaboration` 已归档且属初版）⇒ 不满足 `rdd-verifier` skill 的分流前置（且 `.rddf/state/iteration.json` 不存在 ⇒ P3 归档门未触发）⇒ 走**本地验收** |
| 3 | 本次变更自己声明了什么 | `ec28138` commit body 的 7 条实现声明（见 §4 AC-B1…B21） |
| 4 | ADR 的 Verification 章 | `docs/adr/ADR-plan-multi-session-collaboration.md` V16–V36（21 条）+ 决策章 D5/D9/D10/D11 的**落地顺序（硬约束）** ⇒ 合并为「本批 AC」 |

**「本批 AC」的口径**（写明以便复审核对）：= ADR D5 的落地顺序 ①–⑧ + D9 / D10 / D11 的落地顺序与决策条款 + `ec28138` commit body 声明的实现面 ⇒ 展开为 **AC-B1…AC-B21**（见 §4）。

**不在本轮范围**（明确登记，不作判定）：V11 / V12（标注「人工」的 e2e，需两个真实 plan 会话）、V13 之外的初版判据 V01–V15 —— 但凡与本批改动面**相交**的配置/守卫面（V02 / V02b / V03 / V05 / V06 / V07 / V13 / V15）作为**回归面**一并复验（见 §5）。

---

## 2. 全量闸门（第一道：早失败早停）

| 闸门 | 命令 | 结果 |
|---|---|---|
| 单测全集 | `bun test tests/` | ✅ **1229 pass / 1 skip / 0 fail**（34 文件 / 5053 expect / 40.95s） |
| 上游语义锚点 | `bash scripts/check-upstream-anchors.sh` | ✅ `RESULT: OK（30/30 个语义锚点全部命中）` |
| 守卫派生一致性 | `bun scripts/agent-guard-gen.ts --check` | ✅ `OK：7 个 agent 的 shell 块与规则真源一致（无漂移）` |

> 唯一 skip 来自**本批范围外**的既有条件跳过（`tests/arch-docs-scope.test.ts` / `commit-gate-doctor` / `rdd-skills` / `rollback-manifests` 的 `skipIf`）⇒ 本批新增的 3 个测试文件**无 skip**。

---

## 3. V16–V36 逐条取证（21 条）

判据原文见 ADR Verification 表（`docs/adr/…collaboration.md:261-281`）。每条至少 1 条工具证据。

| 判据 | 判定 | 证据（文件:line + 实跑输出摘要） |
|---|---|---|
| **V16** 取消派生：`cancelled` ⇒ `status=cancelled`（无论磁盘有无产物）；下游 ⇒ `blocked_by_deps` | ✅ | 实现 `lib/plan-topics.ts:422`（`n.cancelled ? "cancelled" : …` 短路优先于 done）+ `:432`（cancelled 节点不参与迭代）｜测试 `tests/plan-topics-lifecycle.test.ts:72` |
| **V17** 派发排除：cancelled 节点不在可派集合 | ✅ | `lib/plan-topics.ts:730`（`status !== "cancelled"` 过滤）｜测试 `lifecycle.test.ts:87` |
| **V18** 强制消解：恰好**一条** `cancelled_dep_active` 且点名全部活跃下游；消解后零阻断；兄弟分支不受影响 | ✅ | `lib/plan-topics.ts:640-651`（按节点聚合、`detail` 列出全部 cancelled 下游 ⇒ **不是每条边一条**）｜测试 `lifecycle.test.ts:97`（`deps.length === 1` + detail 含 `a1`） |
| **V19** 完整性：`by ≠ "parent"` / `reason` 空 ⇒ `cancelled_unattributed`；未闭合 attempt ⇒ `cancelled_open_attempt` | ✅ | `lib/plan-topics.ts:625-638`｜测试 `lifecycle.test.ts:118` |
| **V20** 缓存兼容：缓存写 `done` ⇒ `cache_ahead`（阻断）；写 `pending` ⇒ 仅 `cache_behind`（info，exit 0） | ✅ | `lib/plan-topics.ts:530-546`（按「是否声称完成」分向，`INFO_CODES = {cache_behind}` `:116`）｜测试 `lifecycle.test.ts:132` |
| **V21** 迁移：无 `cancelled` 的 v1 fixture 全过既有例；cancelled 节点豁免 `missing_brief` / `missing_deliverable` | ✅ | 豁免实现 `lib/plan-topics.ts:812-819`（`alive` 集合过滤 ⇒ **不按集合减法**，final 走全量路径）｜测试 `lifecycle.test.ts:151`｜**全量回归**：`bun test tests/` 0 fail（既有 `plan-topics*.test.ts` fixture 零改动通过） |
| **V22** 阶段口径：dispatch 在健康 DAG 上 exit 0；final 才全量报；默认 final | ✅ | `lib/plan-topics.ts:809/818-819/828`（`phase` 分派）+ `scripts/plan-topic-check.ts:85-89`｜测试 `lifecycle.test.ts:170`（**真跑 CLI** 断言 exit 0 / 1）｜探针 3：`check --phase dispatch` exit 0、`codes=[]` |
| **V23** 严重度分向：`cache_ahead` 阻断 / `cache_behind` info；`--json` 每条带 `severity`；`ok` 只看阻断项 | ✅ | `scripts/plan-topic-check.ts:147-164`（`severity: isBlocking(v) ? "error" : "info"`；`ok = blocking.length === 0`）｜测试 `lifecycle.test.ts:176` + `dag.test.ts:475` |
| **V24** 在飞排除派发：未闭合 attempt ⇒ 不在可派集合；`ready --json` 有 `in_flight[{node,started_at,liveness_stale}]` + 独立顶层 `input_drift[]` | ✅ | `lib/plan-topics.ts:731`（在飞过滤）+ `scripts/plan-topic-check.ts:250-283`（`emitJson({ready, in_flight, input_drift})`）｜测试 `lifecycle.test.ts:189`｜**探针 3**：`ready=[]`、`in_flight=["a1"]`、`input_drift=[{"node":"a1","changed":["brief"]}]` |
| **V25** claim 互斥：首次 exit 0 且追加 attempt（含 `input` 快照）；二次 exit ≠ 0 且 `graph.json` **逐字节**不变；**并发 claim 恰好一个 exit 0** | ✅（**判据未进 CI**，见 §6 SF-1） | 顺序面：测试 `lifecycle.test.ts:204`（逐字节比对）｜**并发面：独立探针 5 轮 × 6 并发 ⇒ 每轮恰好 1 个 exit 0、`attempts=1`**（机制：`scripts/plan-topic-check.ts:336-372` 的 `mkdir` 原子短锁 + 硬超时回收） |
| **V26** close 与 reap：close 后重回可派集合；无未闭合 attempt 时 close ⇒ exit ≠ 0 且**无写**；reap 须显式确认 | ✅ | `scripts/plan-topic-check.ts:480-522`（`reap` 无 `--confirm` ⇒ 拒 `:484-487`）｜测试 `lifecycle.test.ts:215`｜**探针 2**：reap 无 `--confirm` exit 1；`--confirm` ⇒ exit 0 + 闭合 + 写 `inputs_reviewed`；close 无 open attempt ⇒ exit 1 且文件未变 |
| **V27** stale_inputs 指名：改 deps / BRIEF / deliverables 各被点名；**兄弟节点变更不触发** | ✅ | `lib/plan-topics.ts:464-481`（逐成分 diff）+ `:678-698`（**每节点恰好一条**）｜测试 `lifecycle.test.ts:230`（deps / brief / 兄弟免疫）｜**探针 4 补充（单测未覆盖 deliverables 成分）**：`stale_inputs` 恰好 1 条、detail = `输入已变：deliverables` |
| **V28** 豁免与迁移：`inputs_reviewed` ⇒ final exit 0；缺 ⇒ exit ≠ 0；dispatch **不产生该码**；畸形 `input` ⇒ `schema_invalid`（exit 3）；cancel 后补写取消理由 ⇒ final exit 0（快照冻结） | ✅ | `lib/plan-topics.ts:220-248`（input 形状校验）+ `:686`（`inputs_reviewed` 跳过）+ `:828`（stale_inputs **仅 final**）｜测试 `lifecycle.test.ts:258` + `:283`（V28b 冻结） |
| **V29** 溯源哈希：`precheck.graph_rev` == 图结构投影 sha256（排除 status/progress/attempts）；仅回填缓存时不变 | ✅ | 实现 `lib/plan-topics.ts:495-504` + `scripts/plan-topic-check.ts:461`（**实装，非死字段**）｜**探针独立重算**（不复用 lib 函数，自行按 ADR 投影口径重算）：`written == recomputed == 0a484092…ade11`；仅回填缓存后**不变** = true |
| **V30** 收敛（纯链）：全 done ⇒ `converged=true`、`done` 计数 == 节点数、其余**六**桶全空 | ✅ | `lib/plan-topics.ts:871-906`｜测试 `lifecycle.test.ts:319`（断言 6 桶全空） |
| **V31** 未收敛两种典型：链首完成 ⇒ `converged=false ∧ ready==[a2]`；未闭合 attempt ⇒ `in_flight` 含该节点；**dispatch 下 `ok=true ∧ converged=false`（刻意的不一致）** | ✅ | `lib/plan-topics.ts:872`（`reportTopic` 恒 `phase:"final"`）+ `scripts/plan-topic-check.ts:186-190`（violations/退出码按 phase，converged 恒 final）｜测试 `lifecycle.test.ts:335`（含刻意不一致断言） |
| **V32** 取消即收敛：取消叶子分支 + 其余全 done ⇒ `converged=true` ∧ cancelled 桶逐条 `{id, reason}` ∧ 豁免 `missing_brief` | ✅ | `lib/plan-topics.ts:881-884`（cancelled 桶逐条 `{id, reason, at}`）｜测试 `lifecycle.test.ts:365` |
| **V33** 阻断即未收敛：成环 / `cache_ahead` / `cancelled_dep_active` 任一 ⇒ `converged=false` ∧ blocking 桶指名节点 | ✅ | `lib/plan-topics.ts:894/899-903`｜测试 `lifecycle.test.ts:382`（cache_ahead）｜**探针 4 补齐另两子句**：成环 ⇒ `converged=false ∧ blocking 含 cycle`；`cancelled_dep_active` ⇒ `blocking` 指名 `a2` |
| **V34** 锁无关：全 done + 锁未释放 ⇒ `converged=true`；`check` 前后 `graph.json` 逐字节不变 | ✅ | 锁不进判据（`reportTopic` 不读锁）｜测试 `lifecycle.test.ts:395` + `dag.test.ts:504`（check/ready 只读，逐字节比对） |
| **V35** 待复核层：已闭合 attempt 的 BRIEF 被改且无 `inputs_reviewed` ⇒ `converged=false` ∧ `needs_review` 指名节点与成分；补 `inputs_reviewed` ⇒ `converged=true` | ✅ | `lib/plan-topics.ts:895-897`（needs_review 由 `stale_inputs` 派生）｜测试 `lifecycle.test.ts:410` |
| **V36** 「绿着但不收敛」：done + 末条 attempt 未闭合 ⇒ `converged=false` ∧ `in_flight` 含该节点 ∧ **exit 0** | ✅ | 在飞不设违规码（`ViolationCode` 闭集无 `attempt_open`：`lib/plan-topics.ts:78-98`）｜测试 `lifecycle.test.ts:431`（断言 exit 0）｜**探针 2**：在飞 ⇒ 无 `attempt_open` / `stale_attempt` 码 |

**V16–V36 汇总：21 / 21 通过**（其中 5 条的**部分子句**无对应自动化用例，由本轮独立探针补证：V25 并发子句、V27 的 deliverables 成分、V33 的成环与 `cancelled_dep_active` 子句、V29 的独立重算、V30/V31/V36 的 CLI 出口码）。

---

## 4. 本批 AC 逐条取证（AC-B1…B21）

| # | 判据（出处） | 判定 | 证据 |
|---|---|---|---|
| B1 | **D5①** plan 的 `edit` 白名单含 `*.rddf/state/plan-sessions/*`（否则父写不了自己的会话文件） | ✅ | `opencode.jsonc.opencode-go:219`（`"*.rddf/state/plan-sessions/*": "allow"`）+ `prompts/plan.md:70`（capability 块同步）｜派生守卫 AC23 绿 |
| B2 | **D5②** `.gitignore` 旧单文件条目 → 目录形态 | ✅ | `.gitignore:42-43`｜探针：`git check-ignore -v .rddf/state/plan-sessions/ses_abc123.json` ⇒ exit 0；`git check-ignore -v .rddf/state/plan-sessions.json` ⇒ **exit 1**（旧形态已退出 ignore，防形态回退）；`.rddf/plan-topics/demo/graph.json` ⇒ exit 1（协作产物不被 ignore） |
| B3 | **D5③** `prompts/plan.md` 两处（capability `edit:` 行 + 多会话协作整节）**连同**两份回滚清单的**逐字节 find 与 replace** | ✅ | `prompts/plan.md:70` + `:227-289`（JSON 形状 / checker 段 / fork-join 段 / 锁段 / 运行态绑定段）｜机读核验：`plan-delegate.json` 48 条 edit 的 find/replace **均不含**旧路径（`plan-sessions.json`）；`plan-topics.json` 27 条 edit 仅在**守卫用例文本**里出现旧路径（`not.toContain` / `not.toBe(0)` 的**反向断言**，属正确形态）｜两份清单的 find 串在当前工作树「恰好 1 次」由 `tests/rollback-manifests.test.ts:65` 保证（套件绿） |
| B4 | **D5④** `cmdLock` 的 binding 按 owner **直接构造路径** | ✅ | `scripts/plan-topic-check.ts:299-318`（`<sessionsDir>/<owner>.json`；owner 存在但文件缺失 ⇒ `binding=null`，读作「未知」）｜测试 `tests/plan-topics.test.ts:506-541`（含「崩溃窗口 ⇒ binding=null」用例） |
| B5 | **D5⑤** `tests/plan-topics.test.ts`（lock 报告用例）+ `tests/config-guards.test.ts`（AC8 / AC9 / AC23 / capability 派生守卫） | ✅ | `tests/plan-topics.test.ts:506-541`；`tests/config-guards.test.ts:4538+`（AC3 / AC4 / AC5 / AC8 / AC9 整块）+ AC4c `:310-343`｜套件绿 |
| **B6** | **D5⑥** `.rddf/rollback/README.md`（含旧路径）**与** `.rddf/rollback/plan-topics.json` 的 **`notes` 字段散文**（提到旧单文件路径 ⇒ 顺手刷新） | ❌ **未满足** | ✅ README 已刷新：`.rddf/rollback/README.md:141` ⇒ `.rddf/state/plan-sessions/`（每会话一文件）｜❌ **notes 未刷新**：`.rddf/rollback/plan-topics.json:5` 仍写「③ **保留** `.rddf/plan-topics/**` 已落盘产物与 `.rddf/state/plan-sessions.json`（停止写入即可）」⇒ 机读：`json.load(...)['notes']` 含 `plan-sessions.json` = **True**｜该批**确实动过** notes（同提交追加了 registry.json 编辑与 AC4c 两条说明）⇒ 属**同批漏刷**，非范围外 |
| B7 | **D5⑦** V07 断言同批反转（旧路径不再被 ignore） | ✅ | ADR V07 表已改为「目录形态 + 旧单文件路径**不再**被 ignore（反向断言，防形态回退）」｜守卫 `tests/config-guards.test.ts` AC9 同款断言 + 上表 B2 的实跑探针 |
| B8 | **D5⑧** `.rddf/roadmap/plan-multi-session-collaboration.md` 标注「2026-11-25 D5 修订已取代」 | ✅ | roadmap `:8`（顶部总注）+ `:25`（D5 行）+ `:277`（§5 第 1 条）+ `:303`（风险行）+ `:309`（回滚三步）共 5 处标注 |
| B9 | **D9 载体 + 形状校验**：可选字段 `cancelled{by,reason,at?}`；**畸形 ⇒ `schema_invalid`**，不得落进「未知键静默忽略」通道 | ✅ | `lib/plan-topics.ts:258-273`｜**探针 2**（5 种畸形：`cancelled` 是字符串 / 是数组 / `by:123` / 缺 `reason` / `at:5`）⇒ **全部 exit 3 + `schema_invalid`**（D9 critic 审稿「转实现批」验证建议 ② 要求的用例，原测试套件**无**此覆盖，由探针补证） |
| B10 | **D9 派生**：cancelled **短路**（优先于 done），不要求 TODO/RESULT/交付物/BRIEF | ✅ | `lib/plan-topics.ts:422` + `:810-819`（四类判定豁免）｜测试 `lifecycle.test.ts:72/151` |
| B11 | **D9 门控 = block + 强制消解**：cancelled 不满足下游 deps；新增不变量 `cancelled_dep_active` | ✅ | `lib/plan-topics.ts:640-651`｜测试 `lifecycle.test.ts:97` |
| B12 | **D9 消解**：级联取消 / 摘除该边；**默认拒绝**（列出活跃下游） | ✅ | `scripts/plan-topic-check.ts:559-573`（默认拒绝）+ `:588-600`（级联 / 摘边）｜**探针 2**：未消解 ⇒ exit 1 且 `graph.json` 未被改动；`--cascade` ⇒ exit 0 且下游 `reason="级联自 a1"`；`--detach a2` ⇒ exit 0 且 `a2.deps=[]`、`a2` 未被取消 |
| B13 | **D9 完整性三码**：`cancelled_unattributed` / `cancelled_open_attempt` / `cancelled_dep_active` | ✅ | `lib/plan-topics.ts:615-654`｜测试 `lifecycle.test.ts:118` |
| B14 | **D9 禁止「完成后取消」**：只能取消**派生** status 非 done 的节点；**只能走 `cancel` CLI**（硬拒） | ✅ | `scripts/plan-topic-check.ts:554-557`（按**派生** status 判定）｜**探针 2**：派生 done 的节点 ⇒ exit 1「禁止『完成后取消』」 |
| B15 | **D9 阶段口径**：cancelled 豁免 `missing_brief` / `missing_deliverable` / `due` / `finished` 四类（**不按集合减法**）**并豁免 `stale_inputs`**（快照冻结） | ✅ | `lib/plan-topics.ts:812-819`（`alive` 过滤）+ `:681`（cancelled 跳过 fence）｜**探针 2 的 cancelOne 路径**：取消时刷新该 attempt 的 `input` 快照为当前投影（`scripts/plan-topic-check.ts:579-580`）⇒ 测试 `lifecycle.test.ts:283`（V28b：补写取消理由 ⇒ final exit 0） |
| B16 | **D9 缓存**：写 `cancelled` 与派生一致 ⇒ 无违规；写 `done` ⇒ `cache_ahead`；写 `pending` ⇒ `cache_behind`（info）⇒ 缓存判据零改动 | ✅ | `lib/plan-topics.ts:530-546`（判据零改动，只分向）｜测试 `lifecycle.test.ts:132` |
| B17 | **D9 事务**：一次 `graph.json` **原子写**内完成「补 `finished_at` → 刷新 input 快照（冻结）→ 置 `cancelled` → 回填缓存 `status=cancelled` → 消解下游」 | ✅ | `scripts/plan-topic-check.ts:575-602`（`cancelOne` → `resolve` → **单次** `writeGraphAtomic`，原子写 = 临时文件 + rename `:375-380`） |
| B18 | **D10 在飞**：定义 = 末条 attempt 缺 `finished_at`；**先登记后 spawn**；claim 拒已有未闭合 attempt；`duplicate_open_attempt` **两口径都报** | ✅ | `lib/plan-topics.ts:453-461` + `:657-671`（`lib/plan-topics.ts:827` **无条件**调用 ⇒ 两口径都报）｜`scripts/plan-topic-check.ts:437-439`（claim 拒绝）｜**探针 2**：两条未闭合 attempt ⇒ final 与 dispatch **均**报 `duplicate_open_attempt` |
| B19 | **D10 在飞不是违规**：`attempt_open` / `stale_attempt` **不设码**；`liveness_stale` 只显示不授权接管；**reap 须显式 flag `--confirm`**（非交互） | ✅ | `ViolationCode` 闭集无此二码（`lib/plan-topics.ts:78-98`）｜**探针 2/3**：在飞 ⇒ violations 无 attempt_open/stale_attempt，dispatch exit 0｜`scripts/plan-topic-check.ts:484-487`（`--confirm` 强制）｜探针 2：reap 无 `--confirm` ⇒ exit 1 |
| B20 | **D10 fence**：节点级输入投影 `{brief_sha256, deps, deliverables}`；逐成分 diff 指名；**兄弟免疫**；`inputs_reviewed` 豁免；**在飞漂移只走 `ready --json` 的 `input_drift[]`**（不进 violations） | ✅ | `lib/plan-topics.ts:464-481`（投影 + diff）+ `:678-698`（仅**已闭合** attempt × 仅 **final**）+ `:700-713`（在飞漂移 → `input_drift`）｜**探针 3**：在飞期间父改 BRIEF ⇒ `ready --json` 报 `input_drift=[{"node":"a1","changed":["brief"]}]`，而 dispatch / final 的 violations **均无** `stale_inputs` |
| B21 | **D11 收敛**：`converged` ⇔ 零阻断 ∧ 全节点派生 ∈ {done, cancelled} ∧ 无在飞；**恒 final 口径**；七桶；**刻意不一致**（dispatch 下 ok=true ∧ converged=false）；**空 topic** 口径（默认阻断 ⇒ converged=false；`--allow-empty` ⇒ converged=true）；**E1 逐键钉死同批反转** | ✅ | `lib/plan-topics.ts:871-906`（`:872` 恒 final；`:899-903` 定义；`:880-890` 七桶）｜`scripts/plan-topic-check.ts:144-146/186-190`（converged/summary 恒 final，violations/退出码按 phase）｜测试 `lifecycle.test.ts:319/335` + `dag.test.ts:429`（E1 已按新语义改写，`converged` 进 payload）｜**探针 2b**：空 topic 默认 ⇒ `ok=false, converged=false, codes=[empty_topic]`；`--allow-empty` ⇒ `ok=true, converged=true, codes=[]` |

**本批 AC 汇总：21 项中 20 通过 / 1 未满足（B6）**。

---

## 5. 本批改动面的回归复验（与本批相交的配置 / 守卫面）

| 判据 | 判定 | 证据 |
|---|---|---|
| **V02** `plan-worker` 形态：`mode=subagent`；`edit` 恰好 `.rddf/plan-topics/*` 一条；六 action 全 deny；shell 首键 `*` + 三条写守卫；白名单无 `bun`/`node` | ✅ | `tests/config-guards.test.ts:4543`（AC3 整块）｜`opencode debug agents` ⇒ `plan-worker | mode= subagent`（V13）｜`bun scripts/agent-guard-gen.ts --check` 无漂移 |
| **V02b** 可派者集合钉死：字符串 `allow` == {build, plan}；字典白名单 == {front, librarian}；受限闭集 == 其余 7 个；无 subagent 键 == {title} | ✅ | `tests/config-guards.test.ts:310-343`（AC4c，**守卫已存在** ⇒ V02b 原文「当前无守卫 ⇒ fail-open 风险」已被前批闭合） |
| **V03** `plan-worker` 的 shell 规则在 `GUARDED_AGENTS` 内登记 | ✅ | `scripts/agent-guard-rules.ts`（含 `plan-worker`）｜`agent-guard-gen.ts --check` ⇒ 7 个 agent 一致 |
| **V05** `prompts/plan.md` 的 `capability:plan` 块 == 配置派生值 | ✅ | 派生守卫（AC23）绿｜本批改过该块（`plan-sessions/*` 同步） |
| **V06** plan 的 edit 含 `.rddf/plan-topics/*`；plan-worker **不含** `.rddf/plans/`、`.rddf/state/` | ✅ | `tests/config-guards.test.ts` AC8 块（含 D5 修订后的目录通配断言 + 旧单文件形态**不得**出现） |
| **V07** `.gitignore` 双向 + 旧形态反向断言 | ✅ | 见 §4 B2 的三条实跑探针（exit 0 / 1 / 1） |
| **V14** 既有文档口径同步（`docs/MULTI-AGENT-DESIGN.md` 计数与卡片 / `docs/SUBAGENT-ORCHESTRATION.md` §2.3 / `prompts/plan.md` 协作整节） | ✅ | 本批同步了 `docs/SUBAGENT-ORCHESTRATION.md:§2.3`（claim/close/reap/cancel + 在飞 + 收敛 + 短写锁）与 `prompts/plan.md` 整节（与回滚清单逐字节钉死）｜计数守卫绿 |
| **V15** 上游语义锚点（30 个，含 P5 语义 token / P5b） | ✅ | `bash scripts/check-upstream-anchors.sh` ⇒ `OK（30/30）` |

---

## 6. 失败项与路由建议（verifier 只验不改）

### F-1 ｜ AC-B6 未满足 ⇒ `implementation_gap` ⇒ 回 builder

- **判据**：ADR D5「落地顺序（硬约束）」⑥ —— 「`.rddf/rollback/README.md`（含旧路径）**与** `.rddf/rollback/plan-topics.json` 的 **`notes` 字段散文**（提到旧单文件路径 ⇒ 顺手刷新）」。
- **证据**：`.rddf/rollback/plan-topics.json:5` 的 `notes` 仍写「③ **保留** `.rddf/plan-topics/**` 已落盘产物与 `.rddf/state/plan-sessions.json`（停止写入即可）」⇒ 该路径已随 D5 修订变为目录形态 `.rddf/state/plan-sessions/`。同提交**确实改过** `notes`（追加了「另含一条对 `.rddf/rollback/registry.json` 的编辑」与「另含守卫 AC4c 的…改写」两段）⇒ **同批漏刷**，不是范围外。README 侧（`.rddf/rollback/README.md:141`）已刷新。
- **复现**：`python3 -c "import json;print('plan-sessions.json' in json.load(open('.rddf/rollback/plan-topics.json'))['notes'])"` ⇒ `True`（期望 `False`）。
- **影响面**：**机械影响为零** —— `notes` 是给回滚执行者看的散文；`delete[]` 不含该运行态路径、`edits[]` 的 27 条 find/replace 全部与当前工作树逐字节对齐（`tests/rollback-manifests.test.ts:65` 绿），回滚执行路径不受影响。属**文档口径陈旧**。
- **修复建议**（一行）：把 `notes` 里 ③ 的路径改为 `.rddf/state/plan-sessions/`（与 README 同措辞）；改后 `bun test tests/` 仍须绿（`notes` 不参与任何机械判据 ⇒ 只影响清单自述）。
- **是否阻断**：按 ADR 硬约束逐条计，**是未闭合项** ⇒ 本轮判定 `needs-revision`。若用户选择把该项按 **SHOULD_FIX**（文档口径）处理，则本批可判 **pass**（其余 41 条判据全过，含 21 条 V16–V36）。

### SHOULD_FIX / 观察项（不阻断，记录在案）

| # | 项 | 证据 | 归属 |
|---|---|---|---|
| **SF-1** | **V25 的并发子句未进 CI** —— ADR V25 明写「并发 `claim` 恰好一个 exit 0（⚠ 实现批注意：该并发用例易 flaky，须用**确定性编排**而非裸并发）」，但本批只落了**顺序**双 claim 的用例（`lifecycle.test.ts:204`），无确定性编排的并发用例 ⇒ 判据无 CI 保护（机制本身经本轮 5×6 并发探针验证通过） | `tests/plan-topics-lifecycle.test.ts:204-213`（仅顺序）｜探针：5 轮 × 6 并发，每轮恰好 1 个 exit 0、`attempts=1` | builder（建议下一批补：编排层用「预置锁 + 一次性放行」造并发临界区，避免裸并发 flaky） |
| **SF-2** | **ADR Verification 章导语与表不一致** —— 导语（`:240`）仍写「编号 V01–V15（初版）+ V16–V21（D9 增补）」，而表内已含 **V22–V36**（D10 / D11）；元数据「AC 映射」行（`:12`）同样只声明 V16–V21 | `docs/adr/…collaboration.md:240` 与 `:261-281` | architect（ADR 属 architect 产出，verifier 不改；D9/D10/D11 的 change 未立项 ⇒ AC 编号暂缺属既定状态，不阻塞） |
| **SF-3** | **`.rddf/improvements/plan-multi-session-collaboration.md` 仍写旧单文件路径**（6 处：`:37` D5 行、`:58` AC7、`:60` AC9、`:64` AC13、`:87` 后果、`:96` 配置面）⇒ D5 落地硬约束的枚举**只列了 roadmap**（⑧）⇒ 不属本批 AC ⇒ 登记为 D5 修订留下的陈旧引用 | `grep -n "plan-sessions\.json" .rddf/improvements/plan-multi-session-collaboration.md` ⇒ 6 处命中 | planner（历史 improvement 的清账，可与既有「清账 8 项改进提案」批次合并） |
| **SF-4** | **提交溯源**：ADR 的 D9 / D10 / D11 决策段 + 5 份 architect 审稿报告，与 builder 的实现同处一个提交 `ec28138` ⇒ git 历史里「决策内容」与「实现」的 authorship 不可分。决策本身的审稿链条完整（oracle→critic→复审，见 `docs/adr/…:4` Status 行 + `.rddf/reviews/adr-…-review-d{9,10,11}-*.md`）⇒ **实质无缺陷**，仅溯源粒度偏粗 | `git show --stat ec28138`（26 文件，含 ADR + 5 份审稿报告 + 全部实现） | 流程观察（下一批起建议 architect 段与 builder 段分开提交） |
| **SF-5** | **收尾项（用户自办）**：`docs/CHANGELOG.md` 缺 **v2.75**（记录本批实现）—— 现最新为 v2.74（记录 D11 / D5 修订的**决策**，未记录本批**实现**） | `docs/CHANGELOG.md:13`（v2.74 为最新） | 用户（已声明「我可随时补」）—— **verifier 不写**（不在 verifier 写集，且属实施侧收尾） |

---

## 7. 遗留清扫复核（本次范围）

| 检查项 | 结果 |
|---|---|
| TODO / FIXME / XXX / HACK | ✅ 无（本批 6 个改动文件内的 `TODO` 命中全部是**领域名词** `TODO.md`） |
| 临时调试输出（`console.log` / `debugger`） | ✅ 无（仅 `prompts/plan.md` 的 `console.log` 出现在 `bun -e` 渲染命令示例里） |
| 被 skip 的测试 | ✅ 无（本批新增 `plan-topics-lifecycle` / `plan-topics-dag` / `plan-topic-fixture` 无 `skip`；全仓唯一 1 skip 来自范围外的 `skipIf`） |
| 未替换的 mock | ✅ 无（全部真文件 / 真 git fixture） |
| 注释掉的代码 / 半截实现 | ✅ 无（`--phase` 两口径、四个写子命令、`converged` 七桶均有消费者与测试） |
| 临时代码 / fallback 分支 | ✅ 无（`scripts/plan-topic-check.ts:294` / `:331` 的 `path.resolve(topicDir, "..","..","..")` 是**非 git 仓**下的路径退化，非临时分支） |
| 死代码 / 死字段 | ✅ 无（`precheck.graph_rev` **实装**且经独立重算验证 —— 满足 D10「要么实装要么删除，不留死字段」） |
| 未闭合的硬约束 | ⚠ 1 项 —— F-1（`notes` 散文，文档级） |
| 范围外历史遗留（只记录、不清理） | `docs/MULTI-AGENT-DESIGN.md` 与 `opencode.jsonc.opencode-go` 的模型名口径（工作区 `model-fallback.json` 未提交改动把 `minimax-cn` 改为 `minimax-cn-openai`；当前套件绿 ⇒ 不影响本批判定）｜`.rddf/improvements/plan-multi-session-collaboration.md` 的旧路径 6 处（SF-3） |

---

## 8. 独立取证探针（可复现）

探针脚本为**只读 / 临时目录**性质（不改仓库），落在 scratch 目录 `/tmp/opencode/plan-topics-verify/`（不入库）：

| 探针 | 覆盖 | 结果摘要 |
|---|---|---|
| `probe.ts` | V25 并发子句（5 轮 × 6 并发 `claim`）、V29 **独立重算** `graph_rev`（不复用 lib 函数）、V27 的 deliverables 成分 | 5/5 轮「恰好 1 个 exit 0 + `attempts=1`」；`written == recomputed == 0a484092…ade11`，回填缓存后不变；`stale_inputs` 恰好 1 条、detail 含 `deliverables` |
| `probe2.ts` | D9 critic「转实现批」验证建议 ②（5 种畸形 `cancelled` ⇒ `schema_invalid`）+ D9 CLI 门控（禁止完成后取消 / 必须留理由 / 默认拒绝未消解下游 / `--cascade` / `--detach`）+ D10（reap `--confirm` / close 无写 / `duplicate_open_attempt` 两口径 / 在飞不设码） | 17/17 PASS（唯一 FAIL 系探针自身 fixture 造成的 `orphan_node_dir` 干扰 ⇒ 已由 `probe2b.ts` 用正确 fixture 重测 ⇒ PASS） |
| `probe2b.ts` | D11 空 topic 口径（默认阻断 + `converged=false`；`--allow-empty` ⇒ `converged=true`） | PASS |
| `probe3.ts` | V24 在飞漂移只走 `ready --json` 的 `input_drift[]`（不进 violations）+ `check --json` 七桶形状 | 7/7 PASS |
| `probe4.ts` | V33 三子句（成环 / `cache_ahead` / `cancelled_dep_active` ⇒ `converged=false` ∧ blocking 指名） | 3/3 PASS |

> 复现方式：`bun run /tmp/opencode/plan-topics-verify/probe*.ts`（需在仓根执行；脚本只读仓库、只写临时目录）。

---

## 9. 结论

1. **ADR V16–V36：21 / 21 通过**（含 5 条的部分子句由本轮独立探针补证）。
2. **本批 AC：20 / 21 通过**；唯一未闭合项 **F-1**（D5 硬约束 ⑥ 的 `plan-topics.json` `notes` 散文仍写旧单文件路径 ⇒ 文档级、零机械影响、一行可修）⇒ 分类 `implementation_gap` ⇒ **路由回 builder**。
3. 若 F-1 按 SHOULD_FIX 处理，则本批可判 **pass**；否则判定维持 **`needs-revision`（1 项）**。
4. **不建议在 F-1 闭合前宣告本批完成** —— 逐条判据的结论是「41 条判据全过、1 条硬约束未刷」；修 F-1 只需改 `.rddf/rollback/plan-topics.json:5` 的一个路径字串，改后跑一次 `bun test tests/` 即可闭合。
5. 收尾项：**`docs/CHANGELOG.md` v2.75**（记录本批实现）由用户补 —— verifier 不写（不在写集）。

**已用轮次**：第 1 轮（本批首次验收）｜**失败分类**：`implementation_gap`｜**重试上限**：3 轮（`RDDF_VERIFIER_MAX_LOOPS`），本轮未消耗重试额度。
