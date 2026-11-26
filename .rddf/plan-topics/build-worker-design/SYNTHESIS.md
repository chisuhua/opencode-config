# SYNTHESIS — build-worker-design 合成稿

> ⚠ **本文件是「父手写基线（golden standard）」，不是本机制认可的落点。**
> 按 `ADR-plan-synthesis-offload` D2，合成产物的**正式位置 = 合成节点自己的 `RESULT.md`**
> （本目录下 `nodes/m1/RESULT.md` = C 档实测、`nodes/m2/RESULT.md` = A 档实测）。
> ⇒ 本文件与 `m1`/`m2` **三份合成产物并存**，仅因各有用途：
> **本文件** = 父手写基线（A/B 判据的对照物）｜**`m1`** = 弱模型（C 档）实测｜**`m2`** = 强模型（A 档）实测。
> ⇒ 按 D2 的答案惯例（取**最新非 cancelled 的合成节点**），**当前答案是 `nodes/m2/RESULT.md`**。
> ⚠ 本文件**不作为**正式落点，**不进**单一写者表（父篇 D1 无需新增一行）——
>   父篇 `ADR-plan-multi-session-collaboration` 残留 #19 已按此口径闭合。

> **写者：父会话（build 主会话，session `ses_de8f57a3cffezCAvlmyBDCFShr`）**
> 合成时间：2026-11-26｜topic：`build-worker-design`｜节点：n1–n7 全部 `done`（`converged=true`）
> 输入：各 node 的 `RESULT.md`（7 份，共 244,703 bytes）｜本文是**父的合并产物**，不是子节点的产出
> ⚠ 本文件是**离线讨论稿**，**不在** `PLAN_REF_ROOTS`（`lib/delegate-core.ts:1321-1326`）⇒ **不可直接派工程实施**

---

## 0. 结论（父裁决）

### 0.1 关于 `build-worker`：**不该新建 agent 形态；该做的是「替代 + 换工作树」**

| 结论 | 内容 |
|---|---|
| **要做** | 把 `build` 纳入既有 `delegate` 通道作**第三个派发主体**（`ADR-plan-delegate-engineering-session` D1 增补），`build` 只做编排；「多 wave 并行」由 **linked worktree 隔离**提供（每棵 worktree 恰一个可写会话 = delegate 单槽语义的字面沿用） |
| **不新建 agent** | ❌ 否决 `build-worker` 作为**新 agent 形态**。理由：n5 已证「单槽不是一条不变式，而是**共用同一 `workRoot` 键的四件机制**（槽位表 / 角色租约 / 停机守卫 / 差集基准）」—— 新 agent 走 `subagent` 通道 ⇒ 无 per-session 权限（ADR 前置事实⑤）+ `role-gate` 对 `parentID != null` 的会话整段跳过 ⇒ **写隔离零强制**，比现状更差 |
| **不新建通道** | ❌ 否决「并存」（自建槽位）与「分槽」（按 owner 细分）。并存要**复制**四件机制；分槽要**拆掉**其中一件（`ADR-plan-delegate…:77` 的否决理由逐字命中），且**分槽得不到并行**（同 worktree 两个 `builder` 仍撞 `(workRoot, builder)` 租约，`lib/role-lease.ts:284`）⇒ 改得最贵而拿不到并行 |
| **触发条件** | 重启「替代」需三条同时成立：① 出现「单次改造可切成 ≥2 批且各批写域不相交」的实测需求；② 该批计划文件已落 `.rddf/plans/**`（可作 `plan_ref`）；③ 目标 worktree 可显式准备。**彻底放弃**的条件：维持「build 永不可见 delegate」且不为其新建 agent 形态 ⇒ 此时本 topic 的答案就是「**不做**」，`build` 的上下文压力只能靠「不并行 + 上下文外置」缓解 |

### 0.2 三层结论必须分开记账（n1 的核心贡献）

| 陈述 | 性质 | 依据 |
|---|---|---|
| 「`build` 无 delegate 通道」 | **刻意设计** | `.rddf/state/adr-front-agent-redesign.md:143,225`（D6「仅 front 可得」+ 验收条目「除 front 外任一 agent 调用 delegate 时工具不可见」） |
| 「`build` 无**任何**并行实施形态」 | **能力缺口（无决策文本）** | `docs/adr/` 全目录无对应篇；`ADR-plan-delegate:23` 只给 plan 立过项 |
| 「同 worktree 并行写被拒」 | **刻意排除** | 单槽 `ADR-front-multi-backend:155-157` + `(workRoot, builder)` 租约独占 `lib/role-lease.ts:262,284` |

⇒ **混记这三件事，就会把「不该给 build 开 delegate」误当成「build 不需要并行能力」。**

### 0.3 机制层面的净效果

- **新增不变式：0 条写隔离不变式被削弱**。净效果 = D1 主体扩一次 + D2 判据收紧一档 + D5/D7 各加一个枚举值 + 取代一条已过时的旧验收条目。
- **唯一必须同批落地的硬约束**：开 `delegate: allow` **必须与** `classPermissions` 加 delegate deny、`plan_ref` 必填判据扩到 `kind==="engineering"`、`owner_agent` 增第三值 **同批提交**。分两批 = 中间态是「有 delegate、无防递归、无计划门、归属冒充 front」的窗口，且**三条都是静默型**（递归要跑起来才看见、计划门失效无报错、归属冒充只在冲突文案里暴露）。

---

## 1. 各节点结论合并（父的取舍）

| 节点 | 结论 | 父的处置 |
|---|---|---|
| **n1** 通道盘点 | 6 条通道 + 20 条事实；`build` 无受治理并行实施通道 | 采纳；「能力缺口」措辞加限定「无决策文本（未设计）」 |
| **n2** 写隔离选型 | **推荐 A：linked worktree 隔离**；否决 B/C/E；D（不并行+上下文外置）保留为回退基线 | 采纳 A；「A 的强制等级取决于通道」一条由 §0.1 的「替代」结论关闭 |
| **n3** 合并语义 | **只有父合**；每 wave 合一次到集成分支、收尾合一次到目标分支；冲突 6 类；解决权归**后写者**；幂等靠禁用 `--no-ff`/`--squash` + 祖先判定；合并**做不到一条 git 命令原子** ⇒ 台账原子写 + `MERGE_HEAD` 作在飞标记 | 采纳；集成分支工作树归属由父定：父建父收，路径 `.rddf/state/build-waves/<slug>/integration-wt/`（**运行态**，不入 git） |
| **n4** 判据面 | 36 条 / 7 组；可机判 27 / 条件 3 / 需人判 4 / 两段 2；info 仅 3 条；退出码沿用四值、**否决扩 4**；收敛信号沿用 D11 口径；事实投影命名 **`landed`**（不叫 `delivered`） | 采纳；**G3 `abi_declared` 删除**（依赖新增字段，违反「没有第四个性字段」纪律）⇒ info 数 3→2；`merge_unverified` **保持 info**（当前无机制能产出合格证据 ⇒ 升阻断必恒红，与 R7「必须同批」冲突） |
| **n5** 与 delegate 单槽 | **替代**；单槽 = 四件共用 `workRoot` 键的机制；否决并存/分槽/subagent 无槽；9 条冲突点（C1–C9）；开权限当天即生效的三坑（C2 归属塌陷 / C5 plan_ref 失效 / C6 后端递归） | 采纳；**`owner_agent` 增第三值 `build`**（不推荐塌陷成 front）；**`plan_ref` 必填收紧到 `kind==="engineering"`**（有意同时收紧 front ⇒ 必须在 ADR 影响面点名） |
| **n6** 与 rdd-builder P2 | **并存（分层）**：P2 是「实施层内一个 change 的树准备」，新通道是「派发层」；**P2 从未在本仓跑过** | 采纳；`.rddf/wt/**` **保留给 skill**，新通道换根；`tasks.md` 勾选权归**父**（worker 不勾）⇒ 避免跨 wave 多写者 |
| **n7** 失败模式与回滚 | 失败模式 10 条（可机判 5 / 仅提示 3 / **不可检出 2**）；最重的是**双活体写者**（build 面只在合并期可见，比 plan 面更难发现）；回滚三步（关闸→收树→倒序 `revert -m 1`）；回滚条目草案（6 处必须逐字节钉死） | 采纳；**回滚清单落地时机**：ADR 先出、清单同批（草案现在停在 `declared`）；**`retire[]` 走路线 A**（删清单转 `retired`）；**`worktree_leaked` 保持 info**；**写围栏（`generation`）值得引入** —— 它是唯一能把 FM4/FM5 从「不可检出」变成「可检出」的手段 |

---

## 2. ⭐ 对既有 `plan` / `plan-worker` 机制的反哺清单（父合并 n4 R1–R9 + n7 B1–B7 + 本场景活体实例）

> 分类：**【声明与实现脱节】**（4 条）｜**【自述/命名】**（2 条）｜**【流程纪律】**（2 条）｜**【模板复用风险】**（1 条）｜**【本次场景活体复现】**（1 条）
> 每条：`现象 | 依据 path:line | 建议动作`

### 2.1 【声明与实现脱节】

| # | 现象 | 依据 | 建议动作 |
|---|---|---|---|
| **R1** | **`owner` 字段被声明但从不消费** —— ADR D2 承诺「`owner:"parent"` 的节点 = 父自己做」，实现零消费 | `lib/plan-topics.ts:61,197-199`（全文件仅 3 处命中）；ADR `:62`；**本 topic 活体实例**：`.rddf/plan-topics/build-worker-design/graph.json` 中 n5 声明 `"owner": "parent"`，同一节点 attempt 记 `"agent": "plan-worker"`，`check` 全绿不报警 | 二选一：(a) `dispatchableNodes` 输出 `executor:"parent"` + `claim` 拒非父会话对 parent 节点 claim（新码 `owner_mismatch`）；(b) 删字段 + 删 ADR 那一句。**不可维持现状**：声明即承诺，字段在场而无人读 = 读者必然误信 |
| **R2** | **topic 独占锁零机械强制** —— D7 承诺「仅 owner 可写/可派」，但 `lock` 子命令**纯只读**、全仓无写入点；写命令只取 graph 短锁 | `scripts/plan-topic-check.ts:286-320`（`cmdLock` 只读）、`:336-372`（短锁只管 `graph.json`）；`prompts/plan.md:280`（`mkdir` 是人工动作）；`tests/plan-topics-dag.test.ts:374,385`（用例名写「钉住缺陷：无锁判据」） | 把「拿锁 + 校验归属」合并成**一个原子命令**（`claim` 内先校验 owner，不等即拒 `owner_mismatch`）；`lock` 改名 `lock-status`（命名即承诺）。若本期不动 ⇒ **必须**把 `prompts/plan.md:276-283` 的「独占」降级为「协议约定（无机械强制）」并删掉「必须是」类暗示 |
| **R3** | **`scope-check` 文档承诺的 union 口径未实现** —— 文档三处承诺「并行只做 topic 级 union」，实现只接受单 node 且 `allowedPrefix` 恒为 `nodes/<nodeId>` | `docs/architecture/plan-topics-topic-model.md:78,130`；ADR V10 `:255`；`scripts/plan-topic-check.ts:233-240`；`tests/plan-topics-dag.test.ts:395-404`（用例名「钉住缺陷」） | 加 `--union <node...>` / `--topic` 模式，**或**删掉文档承诺。**承诺未实现比没有承诺更坏**：读者按 union 跑并行 → 见假阳性 → 学会忽略告警（alert fatigue，与 ADR `:151` 同型） |
| **R4** | **`attempts[].baseline` 是死字段** —— 类型里有、schema 文档示例里有，`claim` 不写 ⇒ 全仓无写入点；且相对 ref 当基线会漂 | `lib/plan-topics.ts:50`；`docs/architecture/plan-topics-topic-model.md:35`；`scripts/plan-topic-check.ts:458-463`；`tests/plan-topics-dag.test.ts:406-416` | `claim` 追加 `baseline: git rev-parse HEAD`（全 SHA 不存 ref），并让 `stale_inputs`/`scope-check` 消费它；或删字段与文档示例。ADR `:153` 已定「要么实装要么删除，不留死字段」 |

### 2.2 【自述 / 命名】

| # | 现象 | 依据 | 建议动作 |
|---|---|---|---|
| **R5** | **`precheck` 是自述式凭据，判据侧从不读** —— `claim` 写 `precheck:{at,exit,graph_rev}`，checker 从不读；`claim` 自注「不因此拒绝」 | `scripts/plan-topic-check.ts:455-461`；ADR `:61`（记过「恒为 1 ⇒ 凭据判别力归零」事故） | 并入 `summary` 当历史快照并标明「不参与判定」，**或**删字段。**保留 + 不消费 + 名字像闸门**是三件坏事同时发生 |
| **R6** | **名字与强制等级脱节** —— `lock` 像闸门（实为只读）、`scope-check` 像闸门（实为事后核对）、`liveness_stale` 像判活（实为 mtime 提示） | `scripts/plan-topic-check.ts:286-320`；`docs/architecture/plan-topics-topic-model.md:130`；`lib/plan-topics.ts:852-865`；ADR `:144` | 给 `Violation` 增可选 `enforcement`（纯增量、不改码集），四值闭集：`权限强制 / CLI 强制 / 协议 / 仅事后可见`；`--json` 每条带该字段。成本极低，收益是「读者不会被名字骗」 |

### 2.3 【流程纪律】

| # | 现象 | 依据 | 建议动作 |
|---|---|---|---|
| **B1** | **`claim` → `spawn` 是两步、无补偿** —— spawn 失败后 attempt 仍开着 ⇒ 节点永久不可派，只能人工 `reap --confirm`；ADR 的「spawn 失败同回合 close」是纯散文 | `scripts/plan-topic-check.ts:418-477,480-487`；ADR `:142,225` | 新增 `abandon-spawn <topic> <node>`（闭合 attempt + `reason:"spawn_failed"`），并用独立字段消掉「`finished_at` 读作正常完工」的歧义（ADR `:298` 已登记）。**不要只改 prompt** —— 本仓已证纪律型字段会静默失效（ADR `:156`） |
| **B2** | **`reap` 不吊销旧 worker ⇒ 可复活 ⇒ 双活体写者** —— `reap` 只写两个字段，无吊销；ADR 自述「同父仍可复活它」；活体探针生产不可用 | `scripts/plan-topic-check.ts:499-511`；ADR `:145,319,332`；`plugins/role-gate.ts:159-161`（探针恒真） | 给 attempt 加**写围栏**（`claim_gen` / 递增 `generation`，worker 产物必须带 `gen`）—— 这是唯一能在「旧 worker 复活」时判出「这是上一代的产物」的机械手段。在此之前，至少把 `reap` 输出改为 `ok:true, warning:"旧 worker 未被吊销；若其复活将产生双写者"`，**让危险出现在父的上下文里** |

### 2.4 【插桩位已在手但只用来校验 prompt 段】

| # | 现象 | 依据 | 建议动作 |
|---|---|---|---|
| **B6** | **L1 硬门只校 prompt，不读台账** —— `subagent-contract` 的 L1 挂在 `tool.hook("execute.before")` 上，能读 `event.input.{agent,prompt,sessionID,background}`，但 `gate()` 判定函数 `evaluatePrompt(...)` **完全不读 `graph.json`/台账** ⇒ 「deps 未 done 不得派发」「未 claim 不得 spawn」这两条技术上可判的事一条都没判 | `plugins/subagent-contract.ts:9,87-94`；`lib/subagent-contract-core.ts:535-559`；ADR 前置事实⑩（插桩位可行，本期范围决定不做）、残留 #2 | 把 `gate()` 输入扩成 `{agent, prompt, parentSessionID, topicDir?}`，加**可选**判定器 `evaluateDispatchState()`：plan 侧（`owner=parent` / 未 claim / deps 未 done ⇒ 拒）、build 侧（`base_sha` 非全 SHA / 未建树 / `scope` 空 ⇒ 拒）。默认 `warn`、`enforce` 由配置开 ⇒ 成本极低，把 B1/R2/R1 从「事后」搬到「事前」 |

### 2.5 【模板复用风险】

| # | 现象 | 依据 | 建议动作 |
|---|---|---|---|
| **R8** | **`plan-worker` 的权限模板不能照抄** —— 它 `edit` 默认 deny 只放行 `*.rddf/plan-topics/*`、`git commit` 显式 deny、shell 只读 ⇒ 任何 build 侧 worker 若照抄，「在自己的分支提交」这一步**不可能完成** ⇒ 第一条判据恒红，且**系统性失败被当个体失败** | `opencode.jsonc:1373,1435-1436,1443-1451,1491-1494`；`prompts/plan-worker.md:36` | build 侧 worker 的**前提清单**须写死三条：① `git commit` 必须 allow ② shell 必须能跑 `.rddf/commit-gate.json` 的验证命令 ③ `edit` 范围 ⊇ 其 cwd 树。并提供 `doctor --json` 把三条当**环境自检**（其失败不是违规，是「判据面不适用」） |

### 2.6 【本次场景活体复现】

| # | 现象 | 依据 | 建议动作 |
|---|---|---|---|
| **S1** | **本场景的 7 个 node 在真实负载下：跨 node 污染 0 例、topic 树外写入 0 例、`converged=true` 一次达成（`done=7`，其余七桶全 0）、final check exit 0（仅 14 条 info 级 `cache_behind`）** | 本 topic 的 `git status` 与 `find` 实测；`check --json` 输出 | ✅ **正面证据**：在 BRIEF 明确写域 + 单一写者协议下，弱模型 worker 未越界 ⇒ 「写域只到 topic 树粒度」的风险在**有明确 BRIEF**时未兑现。⇒ 现有风险评估可以下调一档（但**不可归零**） |

### 2.7 顺带发现（不在本 topic 范围内，但同源）

| # | 现象 | 依据 | 建议动作 |
|---|---|---|---|
| **X1** | **`general` 的 `shell: "*": "allow"` 且不在 `GUARDED_AGENTS`** ⇒ 存在一条**不受治理的写旁路**（无登记 / 无台账 / 无槽位 / 无 scope 差集），与 ADR「subagent 只读」口径矛盾 | `opencode.jsonc:1006,1082`；`scripts/agent-guard-rules.ts:84` | 登记为独立缺陷。**不在本 topic 范围**（不评价、只登记） |
| **X2** | **`git merge` / `rebase` / `cherry-pick` 绕过 commit-gate** ⇒ 任何走 merge 的写盘路径不受「验证命令全绿 + 暂存落在写集内」约束 | `lib/commit-gate.ts:158-159`（只认 `commit`/`push`）；全仓无 merge 处理分支 | 若将来采纳多 wave 合并 ⇒ **必须**扩提交闸门的子命令闭口。此项与 build-worker 是否采纳**无关**，是既有闸门的独立缺口 |
| **X3** | **`ownerAgentOf` 字面二值** ⇒ `agent === "plan" ? "plan" : "front"`，`build` 塌成 `front` ⇒ 可被 front resume/cancel | `lib/delegate-core.ts:1413-1415` | 与 n5 的 P4 同源；若采纳「替代」必须同批扩第三值 |
| **X4** | **agent 级 `delegate: allow` 会泄漏到后端 ⇒ 递归** —— `classPermissions` 无 delegate 规则，而 session 规则排在 agent 规则之后（last-match-wins）⇒ 未列出的动作沿用 agent 级值 | `lib/delegate-core.ts:1266-1288,2460-2462` | 与 n5 的 P2 同源；同批修 |
| **X5** | **`prompts/build.md:355`（「后端被禁止 commit」）与 `:455`（可 commit）自相矛盾** | `prompts/build.md:355` vs `:455`；`lib/delegate-core.ts:1645` | 治理面措辞漂移；属 builder 写集，**不因本 topic 采纳与否而搁置** |
| **X6** | **`rdd-builder` P2 从未在本仓跑过** —— `.rddf/wt/`、`.rddf/state/builder/`、`.rddf/state/.planner-handoff.json` 全不存在 ⇒ P2 是**纸面可选层** | 磁盘事实（`glob` 零命中）；`prompts/build.md:412` 要求前置成立 | 任何「复用 P2」的设计必须先回答「未装 / 前置不成立时怎么办」 |
| **X7** | **`docs/guard-authoring.md:222` 仍写「`.rddf/plans/**` 当前不存在」**，但盘上已有 3 个产物 | 磁盘 vs 文档 | 过期快照，登记 |

---

## 3. 场景自身的测量数据（本次 topic 的独有产出）

> **方法**：根会话在 wave 期间**只收指针 + 摘要，不读 RESULT.md 全文**（遵守「子结果只回指针」协议）；合成步骤单独计时。
> 计量源：`session_v2.tokens_input`（真宿主 db，`~/.local/share/opencode/opencode.db`）。

| 指标 | 值 |
|---|---|
| T0 派发前 | input 660,577 |
| T1 wave1 完成（2 worker） | input 675,095（**+14,518**） |
| T_syn_start（7 节点全 closed，**合成前**） | input 696,108 |
| T_syn_end（**读完 7 份 RESULT.md**） | input 761,049（**+64,941**） |
| 合成产物总量 | 244,703 bytes（平均 34,957 bytes/节点） |
| **单位合成成本** | **0.265 tokens/byte ⇒ 每节点 ≈ 9,277 tokens** |
| compaction 触发 | **未触发**（`time_compacting` 为空） |
| 真实并行重叠 | wave1 = n1 332s ∥ n2 301s；wave2 = n3 351s ∥ n5 393s ∥ n6 305s ⇒ **串行之和 ≈ 2,315s，实际 ≈ 1,000s** |

**外推（同一产出密度下）**：

| N（节点数） | 合成必读体量 | 合成 token 成本 |
|---|---|---|
| 7（实测） | 239 KB | **64,941** |
| 10 | 341 KB | 92,773 |
| 15 | 512 KB | 139,159 |
| **20** | **683 KB** | **185,546** |
| 30 | 1,024 KB | 278,319 |

### 3.1 这组数字回答了什么

1. **「父上下文收益」是真问题，且可量化**：本 topic 里，**合成读入占根会话全增量的 65%**（64,941 / 100,472）。⇒ 合成是根会话成本的**主导项**，不是边角。
2. **断裂点 N\***：根会话的合成预算 ÷ 9,277 = N\*。若给根留 150k tokens 做合成 ⇒ **N\* ≈ 16**；留 300k ⇒ **N\* ≈ 32**。⇒ **超过 N\* 后，「让根读完全部 RESULT」这条路必然先撞窗口。**
3. **把合成移走能省多少**：若由一个「merger」worker 读 7 份并写合并稿，**根完全不吸收那 64,941** ⇒ 根的 per-topic 成本从 100,472 降到 **≈ 35,531（-65%）**。⇒ **「合成外置」的收益已被实测证明存在（-65%），不是假想。**
4. **但移走不等于消除**：merger 自己也要装下 244,703 bytes ⇒ **merger 的断裂点与根相同（N\* ≈ 16–32）**。⇒ 收益的准确表述是「**把上限从『根会话的剩余预算』换成『一次性的 merger 上下文』**」，即**保住根会话的清醒**，**不是**让规模无上限。
5. **⇒ 决策**：**值得做合成外置**（成本已被实测证明：把 65% 的根成本移走）；**且不需要新建 `plan-manager` 这种带调度能力的 agent** —— 合成是一个**叶节点任务**（读兄弟产物 → 写一份合并稿），不是管理任务。

---

## 4. 父的待裁决汇总（本文即裁决记录）

| # | 事项 | 裁决 |
|---|---|---|
| 1 | 通道前提（n2 待裁决 1） | **delegate**（与 n5 的「替代」一致）⇒ 写隔离落在**权限层**（per-session `scope`），非协议层 |
| 2 | 「能力缺口」措辞（n1 待裁决 1） | 保留「能力缺口」，加限定「**无决策文本（未设计）**」 |
| 3 | 集成分支工作树归属（n3 待裁决 1） | **父建父收**；路径 `.rddf/state/build-waves/<slug>/integration-wt/`（运行态，不入 git） |
| 4 | 「接口面」字段（n3 待裁决 2 / n4 待裁决 2） | **不新增** ⇒ G3 `abi_declared` 删除；C4 `drift_recorded` 保持「条件可机判」；维持「没有第四个性字段」纪律 |
| 5 | `prompts/build.md:355` commit 口径（n3#3 / n4#3 / n6#1 / n7#5） | **必须同批修**，归 **builder**（治理面）；不修则 B1 恒红且**系统性失败被当个体失败** |
| 6 | 判据载体归属（n4 待裁决 1） | `.rddf/build-waves/<topic>/`（与 `.rddf/plan-topics/**` **分家**，两个 CLI 两个载体） |
| 7 | `merge_unverified` 升阻断？（n4 待裁决 4） | **保持 info**（升阻断必恒红，且与 R7「必须同批」冲突） |
| 8 | `owner_agent` 第三值（n5 待裁决 2） | **接受扩第三值**；不接受塌陷成 front |
| 9 | `plan_ref` 收紧到 front？（n5 待裁决 3） | **收紧**（有意统一「计划先行」）⇒ 必须在 ADR 影响面**点名 front 行为变更** |
| 10 | `.rddf/wt/**` 归属（n6 待裁决 2） | **保留给 `rdd-builder`**；新通道换根 |
| 11 | `tasks.md` 勾选权（n6 待裁决 3） | **父勾**；worker 不勾（避免跨 wave 多写者） |
| 12 | 回滚清单落地时机（n7 待裁决 1） | **ADR 先出，清单同批**；草案现停 `declared`，**不得**先写清单 |
| 13 | `retire[]` 路线（n7 待裁决 2） | **路线 A**（删清单转 `retired` + `retired_at` + `retired_evidence`） |
| 14 | `worktree_leaked` 升阻断？（n7 待裁决 3） | **保持 info**（升阻断需新增 `active_wave` 字段 ⇒ 违反第 4 条裁决） |
| 15 | 写围栏 `generation`（n7 待裁决 4） | **值得引入** —— 唯一能把 FM4/FM5 从「不可检出」变「可检出」的手段 |
| 16 | `build-worker` 显式 `subagent: deny`？（n7 待裁决 6） | **显式 deny**（少一处回滚断言 + 堵「孙会话」路径） |
| 17 | **本 topic 树缺「父的合成产物」位置**（父新发现） | 建议在 topic 树内**增设 `SYNTHESIS.md`（父写）** —— 现有单一写者表只给了父 TOPIC/graph/BRIEF；父若把合并产物推到 `.rddf/plans/` 就**改变了它的语义**（变成正式件、可被派工程）⇒ 与「讨论稿 ≠ 可执行计划」冲突。**本文件即该位置的第一个实例** |

---

## 5. 本 topic 不声称的东西（诚实口径）

1. **不声称本 topic 的讨论稿可直接派工**：`.rddf/plan-topics/**` 不在 `PLAN_REF_ROOTS` ⇒ 正式 ADR 须由 architect 产出到 `docs/adr/`，或由合法写入者物化到 `.rddf/plans/`，才能作 `plan_ref`。
2. **不声称「合并干净」= 「功能正确」**：n3 §5 的六条不可机判项成立；语义等价性需人读 diff。
3. **不声称 `converged=true` = 交付完成**：D11 口径，父必须读目标段 + diff。
4. **不声称双活体写者有兜底**：只有「别让它发生」的协议，没有「发生了能判出来」的判据（除非引入第 15 条裁决的写围栏）。
5. **不声称本次测量的 N\* 是普适阈值**：它基于本 topic 的产出密度（34,957 bytes/节点）与根会话的当前预算；换题型须重测。
6. **不声称本 topic 已验证 fork-join 的宿主接线**：本次跑的是**真实宿主 + 真实 worker** 的完整 fork/join（7 节点、4 波、全部 closed、`converged=true`）⇒ **这补上了 `PLAN-TOPICS-FORK-JOIN-NOT-COVERED` 的主体部分**；但 V12 的「父死拒续接」子项仍**未执行**（本次未造父会话死亡）。
