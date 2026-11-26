---
状态: 待实施
优先级: P2
---

# improvement: model-fallback-runtime-e2e — model-fallback 接线面的运行时 e2e（链推进真的发生）

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：路线图 `.rddf/roadmap/test-debt-e2e-followup.md` 任务 **B2 后半**（前半 push-gate 已由 e2e 仓 `30b4d44` 落地）。
> 关联：`runtime-e2e-coverage-new-mechanisms`（B1/B2 方案；本条是它拆出的 model-fallback 半边）。
> **实施归属 planner**（落点 `.rddf/improvements/**`）；实施动作新增 e2e 仓 bats 文件（跨仓）。
> **planner 审查（metis 1 轮）**：已处置 12 条 finding（见文末「§7 metis 处置记录」）—— 其中 5 条 P0 改了**判据口径本身**（完成态四件套 / 探针阈值与两个终止 token / fixture 规格 / 对照臂写法 / 额度四档）。

## Why

`plugins/model-fallback.ts` 只有 **L1** 覆盖（`tests/model-fallback-core.test.ts` 33 例纯逻辑）。宿主接线的 `retry` 钩子（失败 → 决策 → 必要时 `switchModel` → 重试）**没有任何运行时证据** ⇒ 「模型真的失败时，链真的推进到下一个模型」今天**无法回答**。

⚠ **本条的用户真实意图有两半，风险不对称**：

| 面 | 问的是 | 今天的状态 |
|---|---|---|
| **正向** | 失败时**会不会**切 | 零运行时证据（本条要补的） |
| **负向** | **不该切时会不会乱切** | 零运行时证据 —— 而**误切更伤用户**（context 超长 / 内容策略被误判成「模型不可用」⇒ 悄悄切到更弱模型，用户无感） |

L1 的 33 例覆盖了**分类器**，但「分类错 ⇒ 运行时真的不切」这半在 L2 同样是零。
⇒ **本条只交付正向面**；负向面（确定性可构造、不受 provider 错误形态影响）**另立后续项**，见 Capabilities 与 §「不在本条范围」。

⚠ **Why 只承诺 `retry` 一个钩子**：`prompt` 钩子（重置降级状态）的 L2 需要「瞬时失败**恰好一次** ⇒ 新用户轮 ⇒ 再瞬时失败」的三轮剧本，而**真实 provider 无法被确定性地注入「恰好一次瞬时失败」** ⇒ L2 **结构性不可测** ⇒ 登记 token，不承诺证据。

与 push-gate 的形态差异（决定成本与 flaky 等级）：

| | push-gate（已落地） | model-fallback（本条） |
|---|---|---|
| 触发 | 命令**形状**判定（确定） | **模型真的失败**才走 retry（时机遇发） |
| 确定性来源 | `-uf` 短簇（预检已确认被识别） | **链首用无效 model id** —— 但这是**探针锁定的条件确定性**（特定 provider × 特定无效 id 组合下才成立，见 What Changes 探针） |
| flaky 等级 | 低 | **最高**（失败形态随 provider 而异；额度耗尽可能被误读成「链推进」） |

⇒ 本条的核心**不是「写用例」，而是先把确定性做出来**：用无效 model id 当链首，让失败成为确定事件，再观察链是否推进。

## What Changes

1. **先做探针（前置，不可跳过）** —— 五问，每问都要落**证据**：

   | 问 | 内容 | 通过阈值 |
   |---|---|---|
   | ① | 用一个**不存在的 model id** 启动会话，宿主是否**走 retry 钩子**（而不是直接终止会话）？**并回答：无效 id 能否被发射**（本仓 `opencode.jsonc` 的每个 provider 都有显式 `models` map ⇒ 宿主可能**启动期校验**） | 能启动会话 且 走到 retry ⇒ 通过；「启动期被拒」⇒ fixture 分支已预写（`opencode.jsonc` 转真文件 + 补 `models` map 条目），**不算方案推翻** |
   | ② | 失败形态是什么（provider 不存在 / 鉴权失败 / 其它）+ **插件如何分类** | 分类 ∈ {`model-unavailable`, `transient`} ⇒ 通过；= `client-error` ⇒ **登记 `MODEL-FALLBACK-CLASSIFY-UNREACHABLE` 并终止本条**（不硬写用例） |
   | ③ | 这次失败**是否消耗模型额度** | 记录即可（决定探针成本） |
   | ④ | 插件**不设置 `decision`** 时，宿主的默认行为与耗时（重试几次 / 多久 / 终止形态） | 记录实测值 ⇒ 对照臂的超时阈值按它 ×1.5 设 |
   | ⑤ | provider 是否**静默接受**未知 id（聚合商路由到默认模型） | 若静默接受 ⇒ 该 provider×id 组合**不可用** ⇒ 换组合重探（**不是**插件的错 ⇒ 不判 fail） |

   ⇒ **探针结论若是「不触发 retry」⇒ 本条结构性不成立** ⇒ 登记 `MODEL-FALLBACK-RETRY-UNREACHABLE` token 并终止（**不硬写用例**）。
   ⇒ **探针记录模板固定三件套**：① provider × 无效 id 组合 ② 原始错误形态（status + 文案）③ 插件分类结果。

2. **探针通过才写用例**（e2e 仓 `tests/integration/test_model_fallback_runtime.bats`，`E2E_REAL_RUNTIME=1` 门控，默认 skip）：

   **fixture 规格（照抄 e2e 仓既有 hermetic HOME 范式，勿自创）**

   - **符号链接农场**：`auth.json` / `account.json` 等链接带入，但**必须排除 `model-fallback.json`**（仿 `subagent-contract.json` 的排除式，见 `tests/integration/test_subagent_contract_runtime.bats:120`）⇒ 链配置写成**测试专用真文件**；若探针① 结论是需要补 `models` map，则**同时排除 `opencode.jsonc`** 并写明 JSONC 注释的处置方式。
     ⇒ 漏掉排除项 ⇒ 测试配置写进**活配置** ⇒ 下面的「字节不变」断言会（正确地）在第一步就炸。
   - **链配置**：主臂 `chains.build := [探针选定的一个有额度模型, 链首那个无效 model id]`（顺序：**链首无效在前**）⇒ **链长恰为 2**；`chains` 是**覆盖**语义（`mergedCandidates`）⇒ 不显式覆盖就会在内置 4 个候选间漂移，「第二个模型被使用」不可判定。
   - **对照臂**：`chains.build := [链首自身]`（`buildChain` 去重 ⇒ 链长 1 ⇒ 插件早退不切）。
     ⚠ **禁止**写 `chains.build: []` —— `parseConfig` 丢弃空列表（`lib/model-fallback-core.ts:149`）⇒ 会落回**内置 4 个候选** ⇒ 对照臂**真的会推进** ⇒ 因错误的原因变红。
   - **隔离与调用形态**：`env -u OPENCODE_SERVER_URL` + `opencode run --standalone`（防打到本机真实 server）+ `OPENCODE_DB` 落 MF_HOME + 每例新 session id + 复用 e2e 仓 `/proc` 前缀式进程清理（`sc_kill_sc_processes`）。
     ⇒ hermetic HOME 的理由是**隔离日志 / DB / 凭据**（**不是**「配置路径写死」—— `MODEL_FALLBACK_CONFIG` 环境变量已存在）。
   - **插件活性断言**：setup 断言 `$MF_HOME/.local/share/opencode/model-fallback.log` 含 `loaded;` 启动行（`plugins/model-fallback.ts:105`）⇒ 否则「零 switch 行」无法区分「插件没加载」与「钩子没触发」。

   **断言（主臂 = 完成态四件套，缺一不可）**

   ① `rc == 0`；② NDJSON 含 `"type":"text"`（完成态，非仅「开始说话」）；③ 日志中 `<head-key> -> <fallback-key>` 行**恰 1 条**（格式见 `plugins/model-fallback.ts:191`；`give up` 行 0 条）；④ 无额度 / 5xx 标记。
   ⇒ **只断 switch 日志行会假绿**：切换后 fallback 模型自身 401 / 额度死 ⇒ give-up ⇒ 会话失败但 switch 行已存在 ⇒ 必须叠加完成态判据。
   ⇒ run JSON 的 model 字段**仅在探针确认其存在后**作辅助通道（NDJSON 是否携带每条消息的 model 归属**未验证**）。

   **对照臂断言**：零 switch 行 + 会话**在超时前以错误终止**（不是「成功」）。
   ⚠ 链长 < 2 时插件**不碰** `event.decision`（`plugins/model-fallback.ts:149` 早退）⇒ 之后是**宿主默认重试策略**（探针④ 要量出它的耗时，否则对照臂会每次超时 ⇒ 永远 skip ⇒ 空转）。

3. **额度与超时纪律（四档）**：复用 e2e 仓既有 `ib_skip_if_out_of_quota` / `ib_skip_if_timeout`，但**模式清单要与插件 `describeError` 的实际输出对齐**（含空格形态 `insufficient quota`；既有清单只 grep `provider.rate-limit|rate_limit|insufficient_quota` ⇒ 否则该 skip 的会假红）。

   | 档 | 条件 | 判定 |
   |---|---|---|
   | ① | 没有 retry 尝试 | **skip（未判定）** |
   | ② | 发生了 switch，随后 give-up，且日志/stderr 含额度或 5xx 标记 | **skip（未判定）** ← 新增档 |
   | ③ | 断言不成立（且无上述特征） | **fail** |
   | ④ | 对照臂超时 | skip；**累计 2 次 ⇒ 登记 token**（防空转） |

   超时分臂：主臂参照 e2e 仓 SC 用例的 180s；对照臂 = 探针④ 实测宿主默认耗时 × 1.5。

4. **每条用例点名变红 mutation（防自证）**

   - 主臂：(a) **链次也填无效 id** ⇒ 期望「有 switch 行 ∧ 有 give up 行 ∧ 无完成态」；(b) **链首填可用模型** ⇒ 期望「零 switch 行 ∧ 在链首完成」。
   - 对照臂的反向演练：链首填可用模型 ⇒ 期望零 switch 行。
   - 记录落点写进 Acceptance（探针记录文件的哪一节）。

5. **不改本仓产品代码** —— 除非探针发现插件缺**必要**能力 ⇒ 那是独立子项，不在本条静默扩大。

## Acceptance

- [ ] 探针五问各有结论与证据（落 `.rddf/reviews/model-fallback-runtime-probe.md`），并记录**三件套**：provider × 无效 id 组合 / 原始错误形态（status + 文案）/ 分类结果
- [ ] 探针② 分类 ∈ {`model-unavailable`, `transient`}；= `client-error` ⇒ 登记 `MODEL-FALLBACK-CLASSIFY-UNREACHABLE` + 本条标「不实施（已判不可达）」⇒ **不产生空转用例**
- [ ] 探针① 若「无效 id 启动期被拒」⇒ fixture 分支已按「`opencode.jsonc` 转真文件 + 补 `models` map」落地，并记录处置方式
- [ ] 探针④ 给出宿主默认重试的次数 / 耗时 / 终止形态
- [ ] 探针⑤ 若 provider 静默接受未知 id ⇒ 换组合重探并记录（**不判 fail**）
- [ ] 探针结论 = 「不触发 retry」⇒ 登记 `MODEL-FALLBACK-RETRY-UNREACHABLE` token + 本条标「不实施（已判不可达）」
- [ ] 新增 `tests/integration/test_model_fallback_runtime.bats`：默认 skip 且退出码 0；`E2E_REAL_RUNTIME=1` 下通过
- [ ] **fixture 规格**：符号链接农场**排除 `model-fallback.json`**（必要时也排除 `opencode.jsonc`）+ 主臂 `chains.build` 覆盖为**链长恰 2** + 对照臂 `chains.build := [链首自身]`（**禁 `[]`**）+ `env -u OPENCODE_SERVER_URL` + `--standalone` + `OPENCODE_DB` 落 MF_HOME + `/proc` 前缀式进程清理
- [ ] **插件活性断言**：setup 断日志含 `loaded;` 启动行
- [ ] **主臂 = 完成态四件套**：`rc==0` ∧ NDJSON 含 `"type":"text"` ∧ `<head> -> <fallback>` 行**恰 1 条** ∧ `give up` 行 0 条 ∧ 无额度/5xx 标记
- [ ] **对照臂**：零 switch 行 + 会话在超时前以错误终止
- [ ] **额度四档**（含「switch 后 give-up ⇒ skip」）+ 额度文案模式与插件 `describeError` 输出对齐（含空格形态）
- [ ] **hermetic HOME 断言**：真配置的 `~/.config/opencode/model-fallback.json` 在真跑前后**逐字节不变**（setup 与 teardown 各取一次哈希）
- [ ] **变红演练**：主臂 (a)(b) + 对照臂反向演练，各有记录；记录落点 = `.rddf/reviews/model-fallback-runtime-probe.md` 的指定节
- [ ] 判据审计记录 `{case_id, oracle_sha, auditor, author, defects[], verdict, date}`（`auditor ≠ author`，ADR-0003 转正规则）
- [ ] **未覆盖面用机械 token 登记**（现在就点名清单，不许事后补票）：① `prompt` 钩子重置语义（L2 结构性不可注入）② 负向分类路径（不该切时不切）③ 多次切换预算 ④ 跨 provider 错误形态矩阵
- [ ] 本仓侧零回归：`bun test tests/` 全绿 + `bash scripts/check-upstream-anchors.sh` 全绿（本条不改本仓代码 ⇒ 只作基线）

## Capabilities

- **补上「宿主接线」这一格的 model-fallback 侧**：与 push-gate 的 PG-1/PG-2 合起来，两个「静默兜底」机制（命令兜底 / 模型兜底）**都有**运行时证据。
- **给出「模型兜底到底有没有生效」的可判定答案**：今天只能说「内核逻辑对」（33 例单测），不能说「真失败时会切」。
- **诚实边界（逐条）**：
  - 本条**只覆盖正向面**（失败 ⇒ 推进）。
  - **负向面（不该切时会不会乱切）本条不覆盖** —— 而它更伤用户 ⇒ 另立后续项（确定性可构造：context 超限 ⇒ 断言零 switch 行；不受 provider 错误形态影响）。
  - `prompt` 钩子的 L2 **结构性不可测**（无法确定性注入「恰好一次瞬时失败」）⇒ 登记 token。
  - provider 侧错误分类的完备性**不覆盖**（只覆盖本仓插件的分类与推进）。
  - 本条**不是回归网**：默认 skip、不进 CI、只由人工触发 ⇒ 重跑触发 = **每次 opencode 版本升级后人工跑一次**（已记入 Impact）。

## Impact

- 改动面：**e2e 仓**新增 1 个 bats 文件（默认 skip）+ 本仓一份探针记录；**不改**本仓产品代码（除非探针结论要求 ⇒ 独立子项）。
- ⚠ **额度**：真跑一次 = 至少 1 次真会话（探针阶段可能 0 额度，待实测）；**四档 skip 纪律是省额度的主要手段**。
- ⚠ **flaky 来源**：① provider 对无效 id 的错误形态可能因 provider 而异 ⇒ 结论只在**探针锁定的那个组合**上成立；② **冷却表是进程内 Map**（`plugins/model-fallback.ts:69/71`）⇒ **跨 run 无残留**（每次 `opencode run` 是新进程）⇒ 真正的残留风险只在「harness 复用已运行 server」时成立，已由 `--standalone` + `env -u OPENCODE_SERVER_URL` 封堵。
- ⚠ **与「`model-fallback.json` 的跟踪问题」的关系**：本条用 hermetic HOME ⇒ **不依赖**那个裁决；但「配置与状态两义」独立存在，仍需单独立项。
- **重跑触发**：opencode 版本升级后人工跑一次（接受「本条不是回归网」这一事实）。
- 归属：**跨仓**（e2e 仓新增文件）+ 本仓 planner 起草 / builder 实施。

## 不在本条范围（另立后续项）

1. **负向用例**：context 超限 ⇒ 断言零 switch 行（回答「兜底别害人」那一半；确定性可构造、不受 provider 错误形态影响）。
2. **`prompt` 钩子的运行时证据**（若将来出现可确定性注入瞬时失败的手段）。
3. **多次切换预算**与**跨 provider 错误形态矩阵**。

## §7 metis 处置记录（planner 固定审查配对，1 轮）

> metis 输出六节（隐藏意图 / 歧义 / AI slop 风险 / 缺失的验收标准 / 边界情况 / 建议修改）。**逐条处置**如下（metis 的输出是材料，不是判据；以下为 planner 的处置决定）。
> metis 的 verdict = **值得立项**，但「不改不许进 builder」。

| # | 级别 | finding | 处置 |
|---|---|---|---|
| 1 | P0 | 主臂断言「第二个模型被使用」会**假绿**（switch 后 fallback 自身额度死 ⇒ give-up ⇒ switch 行仍在） | **已改**：主臂 = **完成态四件套**（`rc==0` ∧ NDJSON `"type":"text"` ∧ switch 行恰 1 ∧ give up 行 0 ∧ 无额度/5xx 标记）；run JSON 的 model 字段降级为「探针确认存在后」的辅助通道 |
| 2 | P0 | 探针②**缺通过阈值**，且只有「不触发 retry」一个终止出口 | **已改**：探针② 加阈值（分类 ∈ {model-unavailable, transient}）⇒ 否则登记 **`MODEL-FALLBACK-CLASSIFY-UNREACHABLE`** 并终止；另加探针④（宿主默认重试行为与耗时）⑤（provider 是否静默接受未知 id） |
| 3 | P0 | fixture 规格不足（符号链接农场未排除 `model-fallback.json` / `opencode.jsonc`、链未显式覆盖、`--standalone` 与进程清理未锁定、缺插件活性断言） | **已改**：What Changes 第 2 条补全 fixture 规格（排除项 / `chains.build` 链长恰 2 / `env -u OPENCODE_SERVER_URL` + `--standalone` + `OPENCODE_DB` + `/proc` 清理 / setup 断 `loaded;` 行） |
| 4 | P0 | 对照臂「链只有 1 个模型」的实现陷阱：`chains.build: []` 会被 `parseConfig` 丢弃 ⇒ 落回内置 4 候选 ⇒ 因错误的原因变红 | **已改**：对照臂写成 `chains.build := [链首自身]`（`buildChain` 去重 ⇒ 链长 1）+ **显式禁止 `[]`** + 断言改为「零 switch 行 + 超时前以错误终止」 |
| 5 | P0 | 额度纪律三档缺「switch 后 give-up」一档；`ib_skip_if_out_of_quota` 的模式清单与插件 `describeError` 实际输出（含空格形态 `insufficient quota`）不对齐 | **已改**：改为**四档**（新增「switch 后 give-up ⇒ skip」）+ 要求模式清单对齐 |
| 6 | P1 | Why 承诺两个钩子，但 `prompt` 钩子的 L2 **结构性不可测** | **已改**：Why 缩圈到 `retry`；`prompt` 钩子改登记 token（Acceptance 的未覆盖 token 清单第 ① 项） |
| 7 | P1 | 「确定性」过度承诺（多 provider 下失败形态不唯一：404→model-unavailable / 400+非模型文案→client-error / 聚合商可能静默接受） | **已改**：全文改为「**探针锁定的条件确定性**」+ 探针记录固定三件套（组合 / 原始错误形态 / 分类结果） |
| 8 | P1 | 变红演练没点名 mutation（有自证风险）；记录落点未定 | **已改**：What Changes 第 4 条点名主臂 (a)(b) 与对照臂反向演练 + 记录落点写进 Acceptance |
| 9 | P1 | 超时分臂没写数值；对照臂可能永远超时（空转） | **已改**：主臂 180s（参照 e2e 仓 SC 用例）；对照臂 = 探针④ 实测 ×1.5；「对照臂超时 ⇒ skip；累计 2 次 ⇒ 登记 token」 |
| 10 | P2 | 事实错误两处：①「配置路径写死 `homedir()`」（`MODEL_FALLBACK_CONFIG` 已存在）②「冷却表残留 ⇒ 必须全新 HOME」（冷却表是**进程内** Map，跨 run 无残留） | **已改**：hermetic HOME 的理由改为**隔离日志 / DB / 凭据**；冷却表段改为「进程内 Map ⇒ 跨 run 无残留；风险仅在复用 server，已由 `--standalone` + `env -u` 封堵」 |
| 11 | P2 | 「什么事件触发重跑」没问出来（本条不是回归网） | **已改**：Capabilities 诚实边界 + Impact 各加一条「重跑触发 = 每次 opencode 版本升级后人工跑一次」 |
| 12 | P2 | 隐藏意图：用户可能更要「**兜底别害人**」（负向面） | **已改**：Why 加风险不对称表（正向/负向）+ Capabilities 明写「负向面本条不覆盖」+ 新增「不在本条范围」节（负向用例另立后续项） |
