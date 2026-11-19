# oracle-intent-gate-e2e — 给「oracle 意图闸门」补上行为层的**可观测性与取证**

> 来源：v2.37（规则）与 v2.38（静态守卫）之后的覆盖面核查 —— `docs/review-automation-backlog.md` **P2-4 项 2**
> 判据真源：本文件「## 验收标准」表（AC1–AC8）；实现步骤见 `tasks.md`；决策取舍见 `design.md`（**均属 builder 阶段**）
> 性质：**跨仓**（实施落在 `rdd-workflow-e2e` 仓；本仓只留 change 文档）
> 前置：**层 1**（本仓静态守卫，`tests/config-guards.test.ts` 的 `describe("oracle 意图闸门（v2.37）")`）已落地
> ⇒ 本 change 补的是它**证明不了**的那一层：**静态判据只证明「文档写了」，不证明「agent 照做了」**。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置（`.rddf/state/.planner-handoff.json`）不存在 ⇒ 走**内置流程**（用户直接指定立项）。

## Why

### 层 1（v2.38）钉住了什么

| 钉住的 | 判据形态 |
|---|---|
| 三处表述的**组成词一致**（`oracle.md` 意图前提表 = 真源 / `build.md` 检查点小节 / oracle `description`） | 从真源派生，不手抄术语 |
| 执行体侧 / 调用方侧 / 收口侧三段规则**本体都在** | 存在性 + 8 组判据 |
| 两份汇总索引不漂 | 投影同步 |

### 层 1 证不到的三件事

1. **父模型是否真的把意图陈述带进 oracle 的输入**；
2. **oracle 是否真的会因意图未定而拒发判定行**（本仓权限层是**软约束**，靠 prompt + 自觉）；
3. **拒发后父模型是否回到检查点补齐再重跑**。

v2.36 的 E-4 已实证过「**只有行为层能抓到**」的失效路径：静态守卫能证明文档写了三步越权处理，
证明不了「拒绝之后没停」。⇒ 这一层非补不可。

### 可观测性核查（2026-11-16，读 e2e 仓源码，非推断）

| 目标 | 可观测面 | 证据 |
|---|---|---|
| 父模型对 oracle 的调用**入参** | NDJSON：`type=tool_use` ∧ `part.tool=subagent` ∧ `input.agent=oracle` ⇒ `input.prompt`（**自由文本**） | `tests/integration/test_subagent_contract_runtime.bats:282-331`（`sc_subagent_calls`） |
| oracle 的**返回** | 同事件的 `part.state.output` —— ⚠ **现有 helper 只取 `input`，`output` 通道从未被验证过** | 同上 `:318`；`docs/real-runtime-prereqs.md` 的样例只有 `read` |
| **落盘载体**（备选主证据） | `.rddf/reviews/<adr>.md` —— `build.md` 的「落盘载体」bullet 要求它记录**判定行原文**或「无判定（意图未定）」 | `prompts/build.md:506` |
| 会话角色 | `<工程>/.rddf/state/role.json` 的 `current_role` | `test_independent_build_session.bats:78-83`（fixture 预置的先例） |
| 额度 / 未完成纪律 | `sc_preflight` + `provider.rate-limit ⇒ skip` + 超时重试一次 | `test_subagent_contract_runtime.bats:179-226` |
| 断言纪律（**必须遵守**） | 只认**文件系统事实**与**结构化字段**，**不断言自然语言措辞** | `docs/runtime-assertion-discipline.md:11-63` |
| 词表真源 | `$SC_SRC/prompts/oracle.md`（`$SC_SRC` 默认 `~/.config/opencode`）—— ⚠ 跑的是**安装态**，不是某个 commit | 同上 `:101` |

### ⚠ 核心设计张力（**本 change 最需要被攻击的一点**）

「父模型有没有带意图陈述」在 NDJSON 里**只以 `input.prompt`（自由文本）出现** ⇒ 按纪律 1 直接断言
「prompt 里含某串」是**措辞断言**：模型把「降 p95」改写成「降低读取延迟」就**假红**。

| 变体 | 断言对象 | 纪律 1 | 判别力 | 主要风险 |
|---|---|---|---|---|
| **V1** | oracle 的 `input.prompt` 含真源派生的组成词（「要解决的问题」「范围边界」） | ⚠ **边界情形** —— 只有把两个**槽位名**升为「规定措辞」（纪律 1 的 CS-7 豁免）才成立；现 rule 只给**语义定义** | 强（直测父侧） | **假红**高（同义改写） |
| **V2** | **oracle 的返回**含判定行（**契约短语** —— 判定行本就由 rule 规定） | ✅ 合规 | 中（测「审查链走通」，**不测意图**） | **假绿**：oracle 自身非合规时两态不可分 |

**本 change 的取舍**（**已按 metis 的 gap 分析修正**）：

- **门禁只钉 V2 能证的那件事** —— 并把它如实命名为「**审查链可达性 smoke**」（`proposal` 原称「意图闸门」，
  它证不了意图 ⇒ 改名，避免宣称高于实际）；
- **V1 只作观察数据**（`input.prompt` 原文逐字落报告 + 标注含/不含组成词，**不判红**）；
- **V2 的假绿面由 E-B 的「两态差分」直接测量**（带意图 / 缺意图两态**是否可分辨**），E-B **不 fail**；
- **最强的修法登记为后续**（见文末「依赖 / 后续」）：把 oracle 纳入 `subagent-contract` 契约并新增
  `intent` 必填 ⇒ 「父模型带没带意图」变成插件日志里的结构化 `missing[]`（**纪律 1 完全合规、且无需真模型**）。

## What Changes

### A. e2e 仓新增 `tests/integration/test_oracle_intent_gate.bats`

| 用例 | 硬门禁？ | 断言 / 记录 |
|---|---|---|
| **AC0 探针**（E-A 的前置） | — | 一次**最小真跑**，打印 `subagent` 的 `part.state.output` **长度 + 首 200 字符**；据此**定死主证据载体**（`output` / `.rddf/reviews/<adr>.md`），写进报告 |
| **E-A（审查链可达性 smoke）** | ✅ 是 | architect 角色 + 明确的**审查**请求 ⇒ **最后一次** `agent=oracle` 调用的返回含 **`^判定: (APPROVE\|REJECT)`**（**不接受** `治理面判定:` —— 项目 `docs/adr/**` 不属治理面） |
| **E-A 前提**（纪律 2） | 前置门 | 确有 ≥1 次 `agent=oracle` 的 `tool_use`；未发生 ⇒ **skip 并标注未判定**（不得当绿）；另登记 `agent=metis` 是否插入 |
| **E-A 观察（V1）** | ❌ 不判红 | `input.prompt` **原文**逐字落报告 + 标注「含 / 不含真源派生的组成词」 |
| **E-B（两态差分）** | ❌ 观察项 | 同一份审查输入跑两次：① 带完整意图 ② **harness 删掉意图段** ⇒ 记录**两态是否可分辨**（①有判定行 ②无判定行）；不可分辨 ⇒ 记为「软约束被违反 / 失效」，**如实登记，不 fail** |

### B. 门控与额度（沿 e2e 仓既有约定）

- 无 `E2E_REAL_RUNTIME=1` ⇒ **全部 skip**，`bats` 退出码 0（默认态，不进 CI）；
- **`provider.rate-limit` ⇒ skip**；**调用 `status != completed` 或 `error` 非空 ⇒ skip「该次调用未完成（未判定）」**
  （否则一次 401 会被误判成契约回归）；
- 采样口径：**N=1 + 超时/额度重试 1 次**；报告须打印**尝试次数**与**全部调用序号**（含被跳过的中间调用）；
- 清理幂等：沿 `sc_kill_sc_processes` 的既有做法（否则 `opencode serve --stdio` 残留会让下一次 `rm -rf` 撞 `Device or resource busy`）。

### C. 产物

- 观察报告：**落 e2e 仓** `.rddf/reviews/oracle-intent-gate-e2e-observation.md`（本仓 change 只引用路径）；
- 报告为**固定列表格**（见 AC8），含每次实跑原始片段、模型 id、`SC_SRC` 路径与其 `HEAD`/mtime。

## ⚠ 已知边界（实施前必须知道）

| # | 边界 | 处置 |
|---|---|---|
| 1 | **V2 有假绿面**（oracle 自身非合规 ⇒ 有意图/无意图都发判定行，两态不可分） | 由 **E-B 两态差分**直接测量；报告**不得只报 E-A 绿** |
| 2 | **`state.output` 通道未验证** | **AC0 探针先行**；不通则主证据降级为 `.rddf/reviews/<adr>.md`（文件系统事实，纪律 1 更合规，还顺带覆盖收口侧） |
| 3 | **E-A 触发依赖父模型真走审查路径** | fixture 的用户请求给**明确审查**语义（产物 + 判据）；若走成「咨询」（**咨询不需要意图陈述**）⇒ 该轮**未判定**（skip），不得判红 |
| 4 | **fixture 可能触发 metis**（意图已定但歧义未枚举 ⇒ 先单独调 metis，其输出作为材料进 oracle 输入） | fixture 请求必须**意图明确、无 ≥2 种解读**；报告登记 `agent=metis` 是否出现 |
| 5 | **architect 写 ADR 的权限形态** | 请求措辞落到 `docs/adr/draft-*.md`（配置只对该 glob 放行）；否则会引入一个**与被测对象无关的权限故障** |
| 6 | **`docs/adr/` 必须实际存在** | 判定三态的第 3 态是「一个都不存在 ⇒ 只讨论、不落文档」⇒ 必须先 `mkdir -p docs/adr` 并**预置一份既有 ADR**（既作审查对象，也撑起「反转既有决策」触发） |
| 7 | **`--agent oracle` 能否直跑未验证**（配置里 oracle 是 `mode: "subagent"`） | E-B 的载体**先验证**；不可行则退到 `subagent` 最小 wrapper，并在报告注明「该退让使 E-B 多带一个父侧变量」 |
| 8 | **`role.json` 字段全集** | 用 `role-v2` 形状（`current_role` / `updated_at` / `updated_by` / `session_id` / `history` + `sessions`），缺字段可能被视为无效 |
| 9 | **判定行可能出现在「引用 / 示例」里** | 低概率；报告保留原始片段以便人工排除 |

## 不做什么（scope 边界）

| 项 | 理由 |
|---|---|
| 改 `prompts/**`（含把槽位名升为「规定措辞」、或把 oracle 纳入 `subagent-contract` 契约） | **治理面** ⇒ 需 oracle → critic，须另立 change；本 change 只登记为依赖 |
| 把 E-B 升级为硬门禁 | 软约束的遵从率是**模型的真相**；硬门禁会把「模型不合规」变成 CI 红 ⇒ 须先定 known-fail / 重试策略（e2e 仓 `KNOWN_FAILURES.txt`） |
| 「拒发后补齐重跑」的完整闭环 | 需 **2 轮同 session** 交互（`--standalone` 两轮**状态不继承**，须用 `sc_run_parent_via_server`）+ 额度；留 follow-up（并在文中点明该约束） |
| 覆盖被派发后端（`role_class=architect`）的同一行为 | 后端无 `question` 通道 ⇒ 行为路径不同；另立 |
| 在 e2e 仓再抄一份静态词表守卫 | 静态 prompt 文本归本仓 CI（v2.38 已钉）；e2e 仓只负责**运行时响应** |
| 校验 `$SC_SRC` 与发布版本的对应关系 | 属发布流程；报告只记 `SC_SRC` 路径 + `HEAD`/mtime，供事后对照 |

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| **AC1** | **可观测性探针**：一次最小真跑打印 `subagent` 的 `part.state.output` 长度 + 首 200 字符；据此**定死主证据载体**（`output` / `.rddf/reviews/<adr>.md`）并写进报告 | 行为（真模型） | 观察报告 |
| **AC2** | **E-A 门禁**：architect 角色 + 明确审查请求 ⇒ **最后一次** `agent=oracle` 调用的返回含 **`^判定: (APPROVE\|REJECT)`**；**不得**接受 `治理面判定:`（项目 `docs/adr/**` 不属治理面）；`status != completed` 或 `error` 非空 ⇒ **skip 未判定** | 行为 | 同上 |
| **AC3** | **E-A 前提（纪律 2）**：确有 ≥1 次 `agent=oracle` 的 `tool_use`；**未发生 ⇒ skip 并标注「父模型未调 oracle，未判定」**，不得当绿；报告登记 `agent=metis` 是否插入 | 行为 | 同上 |
| **AC4** | **E-A 观察（V1，不判红）**：`input.prompt` **原文**逐字落报告 + 标注「含 / 不含真源派生的组成词」 | 证据 | 同上 |
| **AC5** | **E-B 两态差分（观察项）**：同一审查输入 × 两态（带意图 / harness 删掉意图段）⇒ 记录**两态是否可分辨**；不可分辨 ⇒ 记「软约束被违反 / 失效」，**如实登记，不 fail** | 行为 | 同上 |
| **AC6** | **未完成 / 额度 ⇒ skip 而非 fail**：`provider.rate-limit` ⇒ skip；`status != completed` 或 `error` 非空 ⇒ skip（理由可见） | 行为 | 同上 |
| **AC7** | **变红演练（纪律 3，零模型）**：① `$SC_SRC` 指向**删掉判定行词表**的副本 ⇒ 派生为空 ⇒ **AC2 判据红**（失败信息须指出「真源缺判定行词表」）；② `$SC_SRC` 指向**删掉意图前提段**的副本 ⇒ 期望 **AC5 两态不可分辨**（而**不是** AC2 红）—— 这是「V2 假绿面真实存在」的实验；两次演练的实际结果都落报告 | 证据 | 观察报告 |
| **AC8** | **观察报告表格化**：固定列 = `用例｜模型 id｜日期｜请求指纹｜尝试次数｜全部调用序号｜结论（通过/跳过/未判定/违规）｜证据路径｜SC_SRC 路径 + HEAD` | 结构 | e2e 仓 `.rddf/reviews/` |

**行事约定**（不是 AC，但实施时须遵守）：本仓只新增 `openspec/changes/oracle-intent-gate-e2e/**` ⇒
`git diff --stat` 可证伪（不要写成「静态守卫仍全绿」—— 本 change 不碰本仓代码，那是恒真断言）。

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [x] AC1 探针跑过，主证据载体已定死并写进报告
- [x] AC2 E-A：最后一次 oracle 调用含 `判定: APPROVE|REJECT`（不接受治理面词表）
- [x] AC3 E-A 前提：确有 oracle 调用；未发生则 skip 未判定；metis 是否插入已登记
- [x] AC4 E-A 观察：`input.prompt` 原文 + 组成词标注（不判红）
- [x] AC5 E-B：两态差分结果如实记录；违反软约束不 fail
- [x] AC6 额度 / 未完成 ⇒ skip 不 fail
- [x] AC7 变红演练两次（删词表 ⇒ AC2 红；删意图前提 ⇒ AC5 两态不可分辨）
- [x] AC8 报告表格化（固定 9 列）
> **验收证据（2026-11-19 勾稽轮；**未重跑探针**—— 额度是持续态故障）**
> - **载体（AC1）**：`A`（`part.state.output` 有全文）；两次独立探针判 A（输出长度 194 / 151），记录在
>   `.rddf/reviews/oracle-intent-gate-e2e-observation.md` 的两处「AC1 探针实测」与 §2 表的第 1 / 第 9 行。
>   ⚠ 该报告 **§1 的「pending」是首次尝试时的记录**（那次额度耗尽、未判定），已在 §1 顶部标注**被后续实测取代**（历史不回改）。
> - **门禁（AC2 / AC3 / AC4）**：E-A 最后一次调用返回**契约判定行**（非 `治理面判定:`）；`metis` 未插入；入参含全部组成词、原文落盘。
>   期间修掉一个**判据假阴性**（v2.40 起 oracle 把「第 4 层标注 + 判定行」写在同一行，行首锚 pattern 漏判）⇒ 修**派生**处而非手抄，修后 E-A 复跑绿（§8.3 / §8.4）。
> - **两态差分（AC5）**：**如实写「不可分辨」** —— 常规 E-B 在修复 pattern 后重判为「两态都有判定行」；且**存在未排除的替代解释**
>   （态② 的审查产物本身含意图线索 ⇒「意图未给」前提未真正成立）⇒ **不据此断言「软约束被违反」**。观察项不 fail；「换不含意图线索的审查对象」登记为 follow-up。
> - **额度 / 未完成（AC6）**：`provider.rate-limit` ⇒ skip 未判定；D8 ② 复跑的一次父会话超时（exit 124）⇒ 记未判定、改用**同条件已保存输出**零模型重判。
> - **变红演练（AC7）**：① 删判定行词表 ⇒ **派生 fail-fast**（零模型、默认进 CI）；② 删意图前提档 ⇒ **实测「两态不可分辨」** ⇒ **「V2 假绿面」真实存在**。
> - **表格化（AC8）**：报告 §2 = 固定 9 列、13 行（含 2 行零模型演练）；各小节历史行不回改，只在 §2 集中。
> - **§10 是勾稽轮的结论汇总**（AC1–AC8 逐条 + 「勾稽时没做的事」+ 已知边界），本 proposal 的勾选以它为准。
> - **实施落点**：`rdd-workflow-e2e` 仓的 `tests/integration/test_oracle_intent_gate.bats`（本仓只留 change 文档与观察报告 —— 试跑需 `E2E_BED_DIR` + `E2E_REAL_RUNTIME=1` + 额度，本机未设 `E2E_BED_DIR`）。


## 实施顺序（交 builder 阶段，**不拆 change，拆 PR**）

1. **PR-1**：`AC1` 探针 + `AC6` 门控骨架 + 报告模板 —— 便宜、无判别力争议，先把载体定死；
2. **PR-2**：`AC5` E-B 两态差分 —— 判别力最强且**最便宜**（定向单次调用）⇒ **不要被 E-A 的超时/标定阻塞**；
3. **PR-3**：`AC2/AC3/AC4` E-A smoke + `AC7` 变红演练 —— 最贵（architect 全流程可能超 `SC_CASE_TIMEOUT`）⇒ 最后上。

> 理由：E-A 的判别力**被高估**（它测的是「审查链走通」，不测意图），且依赖未验证的输出通道；
> 让它决定 E-B 的交付节奏 = 用最贵的一路卡住最便宜的一路。

## 依赖 / 后续

| 项 | 关系 / 为什么是「后续」 |
|---|---|
| **把 oracle 纳入 `subagent-contract` 契约 + 新增 `intent` 必填** | **最强修法** —— 「父模型带没带意图」变成插件日志的结构化 `missing[]`/`violations[]`（**纪律 1 完全合规，且无需真模型**）。代价：治理面 + 改变 oracle 调用形态 ⇒ 另立 change |
| 把「要解决的问题 / 范围边界」升为**规定措辞** | **弱版修法** —— 使 V1 变成合规的契约检查、可进硬门禁；但只是「照抄检查」，不如上一条 |
| 「拒发后补齐重跑」的闭环 | 需 2 轮同 session（`sc_run_parent_via_server`）+ 额度 |
| E-B 升级为硬门禁 | 需先定 known-fail / 重试策略 |
| 回写 `docs/review-automation-backlog.md` P2-4 状态列 | 本 change 关单时**必做**，否则台账漂移 |

## 偏离台账的说明（`docs/review-automation-backlog.md` P2-4）

台账把 **E-A** 定义为「父侧 `tool_use` 入参含组成词（结构可观测）」、**E-B** 定义为「oracle 收到缺意图输入 ⇒ 无判定行」。
本 proposal **有意偏离**：

| 台账 | 本 change | 理由 |
|---|---|---|
| E-A = 入参含组成词 | E-A = **审查链可达性 smoke**（oracle 返回含判定行）；入参含组成词降为**观察数据** | 入参是**自由文本** ⇒ 直接断言**违反 e2e 仓纪律 1**（同义改写会假红）；台账说「入参结构可观测」**不成立** |
| E-B = 单点（缺意图 ⇒ 无判定行） | E-B = **两态差分**（带意图 vs 缺意图是否可分辨） | 单点无法区分「闸门生效」与「oracle 一律不发判定行」；两态差分才是对 V2 假绿面的直接测量 |

⇒ 关单时回写台账 `:129` 状态列 + `:138-143` 的定义，避免两份文档并存时下一个人读错。
