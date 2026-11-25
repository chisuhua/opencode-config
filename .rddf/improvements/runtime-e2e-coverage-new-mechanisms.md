---
状态: 待用户裁决
优先级: P2
---

# improvement: runtime-e2e-coverage-new-mechanisms — 本仓新机制的运行时 e2e 覆盖（plan-topics D9/D10/D11 + push-gate）

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：`.rddf/reviews/test-completeness-debt-e2e-audit-2026-11-25.md` §1.3（G-2 / G-3）与 §3.2（覆盖映射）+ `.rddf/reviews/plan-topics-d9-d10-d11-verify.md`。
> 关联：**尚未立项**（`backlog: runtime-e2e-coverage-new-mechanisms`）。
> 路线图：`.rddf/roadmap/test-debt-e2e-followup.md` 任务 **B1**（push-gate 部分 = **B2 前半**；model-fallback 部分**不在本条**，见 What Changes 第 6 条）。
> ⚠ **待用户裁决**：本条覆盖「要不要为新机制补运行时 e2e」这个**花钱 + 覆盖策略**的选择 ⇒ **未拍板不立项**。
> ⚠ **拍板可 grep**：`已拍板：<路径>（YYYY-MM-DD）`（无此行 ⇒ 未拍板）；**推动责任落点 = 路线图 §7 第 1 条**（由 planner 在下次会话呈现给用户；未拍板期间本条保持 `状态: 待用户裁决` ⇒ **不会被当成「已讨论」的僵尸**，也不会被误标完成）。
> **planner 审查（metis 1 轮）**：已处置 12 条 finding + 3 条隐藏意图（见文末「§7 metis 处置记录」）—— 其中 P0-3（**把 PT-2/3/4 从「真宿主」降为「零模型 CLI」**）**改变了本条的成本结构**（真宿主只剩 1 条 ⇒ 额度从 4 次真会话降到 1 次）。
> **顾问分析（oracle 1 轮）**：已并入（§8 oracle 处置记录）—— 其中一条**改变了选项空间**：零模型层**不再与真宿主层捆在一起**（见 What Changes 第 0 条）⇒ 「只做零模型层」成为独立的自洽选项。
> ⚠ **实施归属跨仓**（e2e 仓 `rdd-workflow-e2e` 新增 bats 文件）+ 本仓 builder 面（若需 prompt / fixture 配合）⇒ **planner 不实施**。

## Why

本仓的测试分层有四层（`docs/test-authoring.md` §1）：静态契约 / 纯逻辑单测 / **行为端到端（真宿主 + 真模型）** / 手工验收。§1 同段写着一条硬规矩：「**不要把『我在 A 层建了测试』说成『A+B 都被覆盖了』**」。

按这把尺子量，**本仓新长出来的机制全都停在 L1**：

| 机制 | L1（单测） | L2（行为端到端） | L3（人工） |
|---|---|---|---|
| `lib/plan-topics.ts` + `scripts/plan-topic-check.ts`（**D9 取消 / D10 在飞与 fence / D11 收敛**，21 条 V16–V36 全覆盖） | ✅ 96 例（`plan-topics` 35 + `plan-topics-dag` 39 + `plan-topics-lifecycle` 22） | ❌ **0 例**（e2e 仓 `grep plan-topics` ⇒ 0 命中） | ❌ **0**（人工 e2e 记录只有 2026-11-20 初版，V12 三项「⏳ 未执行」；D9/D10/D11 落地后**没有**任何人工 e2e） |
| `plugins/model-fallback.ts`（retry / prompt 两钩子接线） | ✅ 33 例（`model-fallback-core`） | ❌ 0 例 | ❌ |
| `lib/push-gate.ts`（force push 工具层硬拒） | ✅（`push-gate` 12 + `commit-gate` 75） | ❌ 0 例 | ❌ |

⇒ **单测能证明逻辑与契约，证明不了「宿主真的挂上了、真的按契约走了」**。对照 e2e 仓已有的 5 个机制（role-gate 8 例 / commit-gate 2 例 / subagent-contract 11 例 / delegate 26 例 / role_class 4 例）—— 本仓的**治理面**有运行时保护，本仓的**机制面**没有。

⚠ **但缺口要分清三层，否则会把预算花错地方**（这是本条最重要的判断）：

| 面 | 单测能不能证明 | 真宿主是不是必要 | 归属 |
|---|---|---|---|
| **协议逻辑**（取消事务 / 在飞排除 / 收敛桶 / 派生） | ✅ 能（21 条 V 已覆盖） | ❌ **不必要** ⇒ 真跑 CLI 即可（`lifecycle.test.ts` 已「真跑 CLI」，但那是**本仓内部**跑的） | **零模型 CLI 层**（e2e 默认套件） |
| **安装态 / 外部消费者视角**（`~/.config/opencode` 里的 CLI 被调、默认套件 cadence 下的漂移） | ❌ 不能 | ❌ **不需要模型** ⇒ 无 `E2E_REAL_RUNTIME` 时**不 skip 且全绿** | **零模型 CLI 层** |
| **宿主接线**（plan agent 的权限 / shell 白名单 / 工具接线在真宿主里允许协议命令被执行） | ❌ **不能**（单测不过权限层） | ✅ **只有真宿主能证明** | **真宿主层**（吃额度） |

⇒ **真正需要花额度的只有最后一格**。本条据此重排：真宿主用例**只留 1 条**，其余全部下沉到零模型层（**补上「本仓改 CLI 契约后无人发现」的洞** —— 零模型用例进 e2e 仓默认套件，而该仓 CI 在 push / PR / nightly cron 上跑 `bats tests/integration/ tests/_lib/`，见下方 §「零模型层的 CI 前提」）。

这正是本条的**隐藏意图**：**用最小额度买到「宿主接线漂移能被发现」**，而不是「把 4 条判据都跑一遍真会话」。

## What Changes

0. **选项空间修订（oracle）** —— **零模型层与真宿主层是两个独立子决策，不再捆在一条路径里**：

   | 子决策 | 内容 | 吃额度 | oracle 的判词 |
   |---|---|---|---|
   | **A：零模型 CLI 层**（PT-2/3/4） | 纯 CLI 契约 + 安装态 + 默认套件 cadence | ❌ **不吃** | 「**无论 ①/②/③ 都该批**」—— 它不需要覆盖策略拍板；把它放在「① 不补」的丢弃面里是**范畴错误** |
   | **B：真宿主层**（PT-1） | plan agent 的权限 / shell 白名单 / 工具接线 | ✅ 1 次真会话 | 「**③**（只覆盖宿主接线那一格）」，**但**只有「有运维承诺定期跑 `E2E_REAL_RUNTIME=1`」时才严格优于 ① ⇒ 无承诺 ⇒ 诚实选 ① |

   ⇒ **「只做子决策 A」是第 4 个自洽选项**（不吃额度、立刻补上「本仓改 CLI 契约无人发现」的洞）。
   ⇒ **B 的运维承诺形态**：绑定批次收尾 —— 「凡动 plan-topics 的批，收尾必须跑一次 PT-1，并按 §9 模板记录 HEAD sha + git status 干净度」。

1. **候选路径（**由用户拍板**，planner 建议 ③ 优先、② 次之）**：

   | 路径 | 形态 | 吃额度 | 新增的证明力 |
   |---|---|---|---|
   | ① **不补** | 现状 | — | 无（单层覆盖，宿主接线漂移无人发现） |
   | ② **最小 L2（真 worker）** | 真 `plan` 会话派真 `plan-worker` 子会话，走完「claim → 写产物 → close → converged」 | 是（每条一个真实子会话） | 最强：**含「模型照纪律执行」+ 含 fork-join 编排（spawn → 宿主唤醒 → join）** |
   | ③ **真宿主 + 假 worker（**建议**）** | 真 `opencode run --agent plan` 会话 + **假 worker 直接落盘** `TODO.md`/`RESULT.md` + 真 checker CLI 断言派生 | 少量（**1 次**真会话） | 中：证明「**plan agent 的权限 / 工具接线**让协议命令可执行」；**不覆盖** fork-join 编排与模型行为 |

   ⚠ 路径 ③ 的**诚实边界**（必须写进用例集与登记）：
   - **不含 spawn** ⇒ 「先登记后 spawn」的 **fork-join 编排部分**（spawn → 宿主合成消息唤醒父 → join）**只有 ② 能覆盖**；
   - **不含模型行为**（模型是否照 prompt 纪律转述）⇒ 只能靠 ② 或人工；
   - ⇒ 这两条**必须以机械 token 登记**（见第 5 条），否则下一批会把它读成「已覆盖」。

2. **零模型层（新增 e2e 仓 `tests/integration/test_plan_topics_cli.bats`；**不门控**、无 `E2E_REAL_RUNTIME` 时**照跑且全绿**）** —— 3 条：

   | # | 用例 | 断言要点 | 为什么属于这一层 |
   |---|---|---|---|
   | **PT-2** | 「取消事务」（**钉死 `--cascade`**，不留二选一） | `cancel --reason … --cascade` 后：派生 `status=cancelled` ∧ **下游也被取消且 `reason == "级联自 a1"`** ∧ `final` exit 0 ∧ `summary.cancelled` 逐条列 `{id, reason}` | 取消事务与级联口径是**协议**，单测覆盖的是库函数；这一层覆盖的是**CLI 契约 + 安装态** |
   | **PT-3** | 「在飞排除派发」 | `claim` 后该节点**不在** `ready` 里 ∧ `ready --json` 的 `in_flight` 含它 ∧ **`check --phase final` exit 0** ∧ **`converged === false`** | 「在飞不是违规」与「绿着但不收敛」是**两个不同断言**，必须分别写死；phase 不写清会被实现成 dispatch 口径而丢掉 D11 语义 |
   | **PT-4** | 「锁无关」 | 留一个未释放的 topic 锁 ⇒ `converged === true` ∧ `check` 前后 `graph.json` **逐字节不变** | 锁是磁盘目录、checker 不读锁 ⇒ **不需要真会话**；并入零模型层（不单列真宿主用例） |

   ⚠ **零模型层的额外价值与它的 CI 前提（critic S2 修订）**：它们进 e2e 仓**默认套件**（`bats -r tests/`，零模型 67 条那一组）⇒ **本仓改 CLI 输出契约后，e2e 仓会报「新增失败」**。
   - **实况核对**（取代此前「无 CI」的假设）：e2e 仓**有** `.github/workflows/test.yml` —— 触发 = `push`（master/main）/ `pull_request` / `workflow_dispatch` / **nightly cron `0 2 * * *`**；跑 `bats tests/integration/ tests/_lib/` ⇒ 新增的 `test_plan_topics_cli.bats` **必须落在 `tests/integration/`**（落在 `tests/` 根下 CI 不会跑它）。
   - ⚠ **实施后发现的 CI 缺口（2026-11-25 实测）**：该 workflow **只安装 `rdd-workflow`**（`install_testbed.sh --clone`），**既没有** opencode 配置仓（`OC_ROOT`，CLI 所在），**也没有装 `bun`** ⇒ 零模型用例在 CI 里会**显式 skip**（有原因、不假装通过），今天仍然**零判别力**。要兑现 L2 需在 workflow 增加两步：① `git clone <opencode 配置仓> ~/.config/opencode`；② 安装 bun。在此之前，零模型层的价值是 **L1（本地契约检查）** —— 改 `scripts/plan-topic-check.ts` 输出契约后本地立刻发现。
   - ⚠ **收益三层化（critic SF-1，已用 CI 实况核准）**：**L0 用例存在**（今天兑现）；**L1 本地可跑 + 可作 builder 的 CLI 契约检查**（今天兑现、成本≈0 ⇒ 足以支撑「现在批」）；**L2「CI 自动抓漂移」= 跟踪项**，前置 = **e2e 仓 CI 红清零**。实况（2026-11-25）：`gh run list` 近 5 次 nightly **全部 failure**；日志 `已知失败: 0 / 新增失败: 17`；根因 A = `origin/master` 的 `KNOWN_FAILURES.txt` **0 条有效条目**（8 条在**未推送**的本地 commit `073421b`）；根因 B = 另 **9 条真新增**（C1–C7、AC7-①/①b，性质未查明）⇒ **L2 今天不成立**，且 **C1 单靠迁移 8 条不足以修好**（还要推送基线 + 处置 9 条）。**L2 不进 B1 验收门**。
   - **跨仓漂移纪律**（本仓侧）：凡动 `scripts/plan-topic-check.ts` 输出契约的 change，其 AC 必须含「同步 e2e 期望」一步 —— 登记为**本仓 builder 的 AC 纪律**（不在本条范围，本条只提供被同步的对象）。

3. **真宿主层（e2e 仓 `tests/integration/test_plan_topics_runtime.bats`；**走 `E2E_REAL_RUNTIME=1` 门控 ⇒ 默认 skip**）** —— **只留 1 条**：

   | # | 用例 | 断言要点 |
   |---|---|---|
   | **PT-1** | 「**登记 → 交付 → 关闭**主链（**无 spawn**）」 | 真 `plan` 会话里 `claim` ⇒ 假 worker 落盘 ⇒ `close` ⇒ `check --phase final` exit 0 ∧ `converged=true` ∧ `summary.done` 含该节点 |

   ⚠ **PT-1 存在的唯一理由**（写死这句话，否则「③ vs 纯 CLI」永远说不清）：**plan agent 的权限 / shell 白名单 / 工具接线，在真宿主里允许 `claim`/`close` 这些协议命令被执行** —— 这一件事单测与纯 CLI **都证明不了**（单测不过权限层；纯 CLI 不经过 agent）。
   ⚠ **编排形态必须先探针钉死**（**前置探针 AC**）：「谁写假产物 + 几次会话 + 是否续接」三选一 —— ① harness 写产物 ⇒ 需要「claim → 注入 → close」交错 ⇒ 单次 `opencode run` 做不到 ⇒ **必须跨两次调用续接同一会话**（e2e 仓**全部**用例都是 fresh `--session` ⇒ **续接零先例、零探针**）；② plan 模型自己写 ⇒ 单轮可完成，但「父写子的产物」是**协议外形态**（plan 的 edit 白名单技术上允许，纪律上属 worker）；③ 两会话 ⇒ **偏离单父形态**。⇒ **探针结论出来前不写用例**；探针失败时的退路（换形态）与该形态的**偏差登记**（「覆盖的是协议面，不是 fork-join 编排」）必须一并写进提案。

4. **push-gate 的运行时用例（e2e 仓 `tests/integration/test_push_gate_runtime.bats`；**默认 skip**，因为它要真发一条 push 命令）** —— **重设计**（按 metis 的 P0-2）：

   - **形状必须选 config 8 条 `deny` glob 表达不了的超集形态**：`lib/push-gate.ts` 头注自承工具层是 config 的**严格超集**（S1 前缀 / S2 短选项簇 / S3 `+refspec` / S4 quoted / S5 跳带值）⇒ 朴素 `git push --force` **会先撞 config deny**，插件根本摸不到。
     ⚠ **形状的实测核对（critic S1 修订，取代 oracle 的推断）**：逐条对 config 的 8 条 `deny` glob（`opencode.jsonc.opencode-go:62-69`；`:70` 已是 `git commit *: allow`）做匹配核验（fnmatch 语义）——

     | 形状 | 是否撞 deny glob | 判定 |
     |---|---|---|
     | `git push -uf origin main` | ❌ 不撞 | **唯一候选**：无 ` -f` / `--force` / ` +\` 子串 |
     | `git push -fu origin main` | ⚠ **撞 `git push -f*`** | **f 不得居首** ——「短簇」二字不足以钉死簇序 |
     | `git push "origin" "+main:main"` | ❌ 不撞（fnmatch 语义） | ⚠ oracle 与 critic **均判它会撞** `git push * +*`，**实测为误**：该 glob 要求「空格 + `+`」，引号形态是 `"` 紧跟 `+` ⇒ 不匹配。但宿主 glob 引擎语义**未实测** ⇒ 仍不作为候选（`-uf` 已足够） |

     ⇒ **AC 只收 `-uf`**（带引号形态从选项删除，避免实施者按 AC 字面选到一个未经宿主验证的形状）。
   - **断言必须匹配精确文案**（不是「有 Tool.Error」）：插件抛的是 `push-gate: 检测到 **force push**（\`git push … <token>\`）⇒ 拒绝（…）`（`lib/push-gate.ts:68`）⇒ 断言须含 `push-gate:` 前缀 ⇒ **否则权限层的拒绝会冒充插件**（CG-1 已踩过「只匹配 `commit-gate:` 被别的判据冒充」的坑）。
   - **必须有正向对照**：非 force push（如 `git push origin main`）⇒ **不得**含 `push-gate:` 文案（否则「一律拒绝」式实现也全绿 —— CG-1/CG-2 成对教训）。
   - **安全硬要求**：fixture 必须用**本地 bare 远端**（`file://`）⇒ 断言「即便门禁失效，push 也只打到一次性本地远端」；**变红演练（临时摘插件）必须在零网络副作用下完成**。当前提案对「测失败时会不会真把 force push 打出去」零着墨 ⇒ 这是**硬要求**，不是可选项。
   - ⚠ **前置探针 AC（必做，否则这条用例大概率空转）**：**两分支处置已预承诺**（oracle）——
     - **结论 = 钩子先**（`tool.execute.before` 先于 permission）⇒ 写用例，目标如实**降级**为「证明插件**在 fresh 非交互会话里**挂在 push 路径上」。⚠ **critic S4：这个结论只对 fresh 世界成立** —— 而 push-gate 的存在理由（`lib/push-gate.ts:4-6`）是**持久化 Allow-always 覆盖 config deny 的交互世界** ⇒ 两者不是同一个世界 ⇒ 必须另登记第三个 token **`PUSH-GATE-ALLOW-ALWAYS-WORLD-UNVERIFIED`**，否则下一批会把「fresh 世界绿」读成「force-push 兜底已验证」；
     - **结论 = permission 先 / 结构性不可达 / 候选形状（含 `-uf`）全部到不了插件**（三种出口同归此类）⇒ **不写用例**；登记 `PUSH-GATE-E2E-UNREACHABLE` token（与 B1 同一套机械登记纪律）+ **探针证据进 backlog**；force-push 验证移交**人工验收层**（交互会话 + 已持久化 Allow-always + 本地 bare 远端）。
     ⇒ oracle 判词：「**没探针就干脆不做**是错的；**探针 documented 不可达后不做**是对的」⇒ backlog 条目**必须带探针证据**，防下一批重新吵一遍。
     ⇒ 探针本身**便宜且有独立价值**：1–2 条极简真会话（让模型原样执行一条指定 shell 命令，**不需要真 push 成功**）⇒ 闭合的正是 `lib/push-gate.ts:4-6` 登记的「Allow always 与 config deny 的优先级未知」⇒ 结论无论朝向都回写一份 review 记录。
   - ⚠ **探针 AC 展开**：① 宿主 **permission 评估**与 `tool.execute.before` **钩子的先后顺序**未探明 ⇒ 若 permission 先，插件永远摸不到 push；② push-gate 的存在理由（ADR D9⑧）是「宿主持久化的 Allow-always 覆盖了 config deny」⇒ **fresh 非交互会话没有持久化授权** ⇒ 「config 失效、只剩插件兜底」这个前提在非交互 e2e 里**结构上不存在** ⇒ 须**注入持久化授权**或如实把用例目标**降级**为「证明插件挂在 push 路径上」。⇒ **探针结论是「非交互下插件结构性不可达」时**，本条按降级目标写，**不许按现在的写法立项**（必产出空转或必红用例）。

5. **「未覆盖面」的登记改机械信号**（**两个 token + 一条重开触发器**，oracle 要求拆开）：

   | token | 覆盖的缺口面 | 为什么必须分开 |
   |---|---|---|
   | `PLAN-TOPICS-MODEL-BEHAVIOR-NOT-COVERED` | **模型行为面**（模型是否照 prompt 纪律转述） | 两者是**不同的面**；一个 token 会把它们揉成一笔糊涂账 ⇒ 下一批照样误读「已覆盖」 |
   | `PLAN-TOPICS-FORK-JOIN-NOT-COVERED` | **fork-join 编排**（spawn → 宿主合成消息唤醒 → join） | 路径③**结构性**不覆盖它（③ 要指示模型**不要** spawn） |

   **重开触发器**（让缺口有 owner-event，不只是一个标签）：「e2e 仓 harness-p1（capability 集，ADR-0003 P1）立项时，**模型行为面评估移交该处**」。

   固定 token 的**落点（只列真实存在的载体）**：① e2e 仓的 bats 文件头注；② e2e 仓 `docs/known-gaps-and-ownership.md` 的缺口登记行；③ **本提案的 AC 段**（可 grep）。
   ⚠ **critic S3 订正（原方案有一处前提为假）**：原稿称「本仓的审计模板（`.rddf/reviews/test-completeness-debt-e2e-audit-*.md` §3.2）增一行 grep 计数 ⇒ 下次审计可机判」—— 但 `.rddf/reviews/` 下**不存在任何审计模板文件**（审计报告是按日期的一次性产物）⇒ 该机制前提无载体，正是本提案自己批判过的「把新边界登记进一张已知会腐烂的表」。改为：
   - **机械载体**：token 只出现在上面三处（都可 grep；e2e 仓侧随代码演进、本提案侧随立项）；**不宣称**「下次审计自动机判」。
   - **消费方式（诚实口径）**：token 的**消费是流程动作** —— 下次审计/评审的执行者（verifier 或主会话）必须回答「token 存在 ⇒ 对应面是否仍开放」。让这条从散文变契约需改 `prompts/build.md` 的 verifier 产出契约（治理面，**planner 不写**）⇒ 登记为 **architect/builder 的治理面提案项**（不在本条范围）。
   - **防「用例名被误读」**：光有 token 不够 —— PT-2/3/4 的用例名（「取消事务」「在飞排除派发」「锁无关」）单看无法看出层级 ⇒ **用例名加 `CLI:` 前缀**（`CLI: cancel --cascade …`），让只 grep 用例名的人也能看出它不在宿主层。
   ⚠ **为什么不登记进散文表就完事**：那张表恰是审计发现的「17 天未复核、已闭合未标」的腐烂面 ⇒ 把新的诚实边界登记进一张已知会腐烂的表 ≈ **没有信号**。

6. **「不做」清单（显式，防范围蔓延 + 防读者按 Why 表期待全覆盖）**：
   - ❌ **`model-fallback` 的 L2 不在本条**（Why 表列了它）⇒ 归路线图 **B2 后半**，需**另立 improvement**（形态与 push-gate 完全不同：前者要真模型失败才触发链推进，flaky 最高）⇒ 本条**不承诺**覆盖它。
   - ❌ 不把 L2 用例塞进本仓 `bun test tests/`（层级不同）；不改本仓单测（已覆盖）；**不承诺**覆盖「模型行为面」（除非走 ②）；不做 e2e 仓的 `harness-p1`（评测集 + CI gate ⇒ 跨仓大件，另案）。

7. **门控与纪律**（沿用 e2e 仓既有规矩，不新立）：
   - **真宿主用例**走 `E2E_REAL_RUNTIME=1` 门控 ⇒ **默认 skip，不进 CI**（`docs/test-authoring.md` §5：需要真实运行时/模型的测试默认不进 CI）；**零模型用例**（PT-2/3/4）**不门控** ⇒ 默认跑；
   - **额度与超时按「未判定」处理**（不是 fail）：必须复用 e2e 仓既有的 `ib_skip_if_out_of_quota` / `ib_skip_if_timeout`（`tests/test_helper.bash:159/199`）⇒ 否则额度耗尽会被当成用例失败（判据失效）；
   - 每条用例有**一次变红演练记录**（e2e 仓 `docs/runtime-assertion-discipline.md` 三条纪律）；
   - 判据**审计记录** `{case_id, oracle_sha, auditor, author, defects[], verdict, date}`，且 `auditor ≠ author`（ADR-0003 转正规则）；
   - **ADR-0003 转正规则全引**（不半吊子）：可复放 fixture / 机械 oracle / 有 reference solution 且它通过该 oracle / **替代正确解也必须通过**（PT-1 的对应物：不同写法的合法 TODO/RESULT 也应派生 done）/ 有一次变红演练 / **每 trial 干净环境**（显式断言无跨 run 共享状态：`HOME`、opencode session 目录、git 历史、`TMPDIR`、工作区 —— **尤其 `.rddf/state/plan-topics/<slug>.lock` 与 `.graph.lock` 上一轮未清 ⇒ 下一轮 claim 被拒 / PT-4 假绿**）/ case 定义对被测 solver 不可达 / oracle 审计记录。

8. **本仓侧配合（若需要）**：`prompts/plan.md` 的「多会话协作」整节**不需改**（协议已写清）；若实跑发现 plan 会话**不会**自动跑 `claim`（纪律没落地），或**plan 的 shell 白名单根本不允许跑 `claim`/`close`/`cancel`**（2026-11-20 人工 e2e 只跑过 `check` 与 `lock` ⇒ **这三个写子命令的白名单覆盖从未实测**）⇒ 缺口在 prompt / 权限 ⇒ **登记为「prompt 纪律 vs 实测行为」的差异**，走治理面流程（architect + oracle → critic），**不在本条里顺手改 prompt**；权限拒在用例里**路由为「协议面缺口」**，不判用例失败。

9. **实跑证据模板**（含跨仓漂移的可复现性）：`.rddf/reviews/runtime-e2e-coverage-new-mechanisms-e2e.md` 每次实跑记录 **HEAD sha**（`git -C ~/.config/opencode rev-parse HEAD`）+ **`git status` 干净度**（e2e 仓测的是**活仓工作区** `OC_ROOT` 默认 `~/.config/opencode` ⇒ 本仓有未提交改动时测的是工作区不是某提交；2026-11-20 那次人工 e2e 就没记 sha ⇒ 证据不可复现）+ 真实输出片段（不是「应该能过」）。

## Acceptance

- [ ] **用户已拍板候选路径**（① / ② / ③）并写进本 improvement 头部（`已拍板：<路径>（YYYY-MM-DD）`，**可 grep**）；未拍板时本条保持 `状态: 待用户裁决`
- [ ] **前置探针完成并记录结论**（两条，缺一则对应用例不得写）：
  - [ ] **PT-1 编排探针**：`opencode run --session <existing>` 续接同一会话**是否可用**（e2e 仓零先例 ⇒ 需探针证据）⇒ 结论 + 选定的编排形态（续接 / 两会话 / 单轮模型自写）+ 若非「续接」⇒ 登记该形态的**偏差**（覆盖协议面、不覆盖 fork-join 编排）
  - [ ] **push-gate 探针**：宿主 permission 评估与 `tool.execute.before` 钩子的**先后顺序** + 「config 失效前提」如何构造（注入持久化授权 / 或如实降级用例目标）
- [ ] **零模型层**：新增 `test_plan_topics_cli.bats`；**无 `E2E_REAL_RUNTIME` 时不 skip 且全绿**（3 条：PT-2 `--cascade` / PT-3 `phase=final ∧ converged=false` / PT-4 锁无关）⇒ 与真宿主用例的 skip 断言**方向相反**，两条都要验
- [ ] **真宿主层**：新增 `test_plan_topics_runtime.bats`；默认 skip（`bats <file>` 输出 skip 且退出码 0），`E2E_REAL_RUNTIME=1` 下 PT-1 通过（**无 spawn**；名字与文档一致，不得声称覆盖 fork-join 编排）
- [ ] **push-gate 层**：新增 `test_push_gate_runtime.bats`；① 形状为 **`-uf` 短簇**（**f 不得居首**；带引号形态已排除 —— `-fu` 会撞 `git push -f*`）；② 断言含精确文案 `push-gate:`（**不只断言「有 Tool.Error」**）；③ **正向对照**：非 force push ⇒ 错误**不含** `push-gate:`；④ fixture 为**本地 bare 远端**（`file://`），变红演练零网络副作用
- [ ] **额度纪律**：真宿主用例复用 `ib_skip_if_out_of_quota` / `ib_skip_if_timeout` ⇒ 额度耗尽/超时判 **skip（未判定）** 而非 fail
- [ ] **每 trial 干净环境**：用例显式断言无跨 run 共享状态（`HOME` / opencode session 目录 / git 历史 / `TMPDIR` / 工作区 / **`.rddf/state/plan-topics/<slug>.lock` 与 `.graph.lock`**）
- [ ] **替代正确解也必须通过**（ADR-0003）：PT-1 的 oracle 在「不同写法的合法 TODO/RESULT」下同样通过（至少 1 个变体）
- [ ] 每条用例有**变红演练记录**（三条纪律齐备：断言只认事实 / 可证伪 / 变红演练）
- [ ] 每条用例有 **oracle 审计记录**（`auditor ≠ author`；字段齐备：case_id / oracle_sha / defects / verdict / date）
- [ ] **未覆盖面用机械 token 登记**：两个 token（`PLAN-TOPICS-MODEL-BEHAVIOR-NOT-COVERED` / `PLAN-TOPICS-FORK-JOIN-NOT-COVERED`）出现在 e2e 仓 bats 头注 **和** `known-gaps-and-ownership.md` 缺口登记行；**用例名带 `CLI:` / `RUNTIME:` 层标识**；不宣称「下次审计自动机判」（`.rddf/reviews/` 无模板载体 ⇒ 消费是流程动作，见 What Changes 第 5 条）
- [ ] **本仓侧零回归**：`bun test tests/` 全绿 + `bash scripts/check-upstream-anchors.sh` 全绿（本条不改本仓代码 ⇒ 只作基线）
- [ ] 实跑证据落 `.rddf/reviews/runtime-e2e-coverage-new-mechanisms-e2e.md`，含 **HEAD sha** + **`git status` 干净度** + 真实输出片段
- [ ] 若真跑中出现「plan 的 shell 白名单不允许 `claim`/`close`/`cancel`」⇒ **记为「协议面缺口」并路由**（不判用例失败、不在本条顺手改 prompt）

## Capabilities

- **补上「宿主接线」这一层的证明力**：本仓第一次有**机制类**（不是治理面）进入运行时 e2e ⇒ 后续新机制有可抄的形态（真宿主 + 真 CLI + 假 worker 的成本远低于真子会话；且**零模型层不进额度池**）。
- **顺带补上「契约漂移无人发现」的洞（带前提）**：PT-2/3/4 进 e2e 默认套件 ⇒ 本仓改 CLI 输出契约后，e2e 仓报「新增失败」⇒ 这一层的价值**不依赖**模型额度。⚠ **前提 = 基线干净**（C1 迁移那 8 条已知失败；否则「新增失败」淹没在既有噪声里）⇒ C1 未做前本条只宣称「用例能跑」，不宣称「漂移会被自动抓到」。
- **与本仓既有的「四层分工」纪律对齐**：`docs/test-authoring.md` §1 说「两层不能互替，缺哪层就缺哪层的证明力」⇒ 本条补的是 L2 那一层，且**明确不覆盖 L2 之上的模型行为面**（用机械 token 登记 ⇒ 不会被误读）。
- ⚠ **不宣称「范式可迁移到 model-fallback」**（形态完全不同：前者拦命令，后者要真模型失败才触发链推进 ⇒ flaky 最高）⇒ 待路线图 **B2 后半**落地后再评估。

## Impact

- 改动面：**e2e 仓**（新增 3 个 bats 文件 —— 零模型 1 个 / 真宿主 2 个；**不改**既有文件的行为；缺口登记行加 token）+ **本仓**（零代码改动；一条 review 记录）。⚠ 零模型用例须落在 `tests/integration/` 才被 CI 跑到；且**漂移信号的前提 = C1 迁移 8 条已知失败**（基线干净）。
- ⚠ **跨仓协调**：e2e 仓的 bats 需用 `~/.config/opencode` 作为被测仓（`OC_ROOT` / `TARGET_REPO` 默认值已是）⇒ 本仓**当前 HEAD** 即被测对象 ⇒ 本仓后续改动会让这些用例的期望漂移 ⇒ 期望值必须写成**结构化断言**（退出码 / 字段 / 计数），**不得**写死易漂的散文文本；且本仓动 CLI 契约的 change 必须同步 e2e 期望（登记为本仓 builder 的 AC 纪律）。
- 风险 ①：**额度与 flaky** ⇒ 缓解：默认 skip + 不进 CI + 复用额度/超时 skip 纪律 + 一次真会话（不是 4 次）；实跑失败先判「环境 vs 缺陷」。
- 风险 ②：**路径 ③ 的证明力被高估**（有人把「协议跑通」读成「机制正确」）⇒ 缓解：AC 明确要求机械 token 登记 + PT-1 改名去 spawn + 「唯一理由」那句话写死。
- 风险 ③：**push-gate 用例空转**（插件摸不到 / permission 先判）⇒ 缓解：前置探针 AC + 精确文案断言 + 正向对照 + 探针不可达时**降级目标**（不许硬写）。
- 风险 ④：**假 worker 产物不满足派生条件**（done 要求 TODO 全勾 + RESULT 实质正文 + 末行哨兵 + deliverables 路径存在 + input 快照未漂移）⇒ 注入清单必须钉死，且注入后**不得**碰 BRIEF / deps / deliverables ⇒ 否则 close 后 final 不收敛，用例红得莫名其妙。
- 风险 ⑤：**锁目录跨 run 泄漏** ⇒ 每 trial 干净环境必须显式覆盖锁目录与 topic fixture。
- 依赖：**无仓内依赖**；e2e 仓用例需要 `~/.agents/skills/rdd-workflow` 安装副本（已在）+ 真宿主 `opencode run`（已在）。
- 成本：**真会话 1 次**（PT-1）+ 零模型用例 3 条（不吃额度）+ push-gate 1 条（默认 skip，吃额度但无模型依赖）；其余为零。

---

## §7 metis 处置记录（planner 固定审查配对，1 轮）

> metis 输出 6 节（隐藏意图 / 歧义 / AI slop 风险 / 缺失的验收标准 / 边界情况 / 建议修改）。**逐条处置**如下（metis 的输出是材料，不是判据；以下为 planner 的处置决定）。

| # | 级别 | finding | 处置 |
|---|---|---|---|
| 1 | P0 | **拆解 PT-1 编排**：谁写假产物 + 几次会话 + 是否续接未钉；「续接可用性」本身是前置 AC | **已改**：What Changes 第 3 条写明三形态 + **前置探针 AC**（`opencode run --session <existing>` 续接可用性，e2e 仓零先例）+ 探针失败时的退路与**偏差登记** |
| 2 | P0 | **push-gate 用例重设计**：形状须超集 / 断言须精确文案 / fixture 须本地 bare / 须前置探针（permission vs 钩子顺序 + config 失效前提）；不可达时降级目标 | **已改**：What Changes 第 4 条全部落地（四小点 + 探针 AC + 降级条款） |
| 3 | P0 | **PT-2/3/4 应拆出真宿主**（纯 CLI、零模型、进默认套件）；真宿主只留 PT-1 并写明其唯一理由 | **已改**：新设「零模型层」（第 2 条，3 条用例，不门控）+ 真宿主层只留 PT-1（第 3 条）+ 「唯一理由」那句话写死 ⇒ **额度成本从 4 次真会话降到 1 次** |
| 4 | P0 | **「模型行为面未覆盖」改机械信号**（固定 token） | **已改**：What Changes 第 5 条 + AC 的 token 登记条（**双 token** + e2e bats 头注 + 缺口登记行 + 用例名层标识）。⚠ critic S3 已订正：「本仓审计模板 grep 计数」**前提为假**（`.rddf/reviews/` 无模板）⇒ 改为「只列真实载体 + 消费是流程动作」 |
| 5 | P1 | PT-1 改名去「spawn」；诚实边界补「fork-join 编排只有 ② 能覆盖」 | **已改**：PT-1 改名为「登记 → 交付 → 关闭主链（**无 spawn**）」+ What Changes 第 1 条 ③ 的边界两条 |
| 6 | P1 | PT-2 钉死 `--cascade`；PT-3 写明 phase + `converged=false` | **已改**：零模型层表内逐条钉死（PT-2 断言下游 `reason == "级联自 a1"`；PT-3 `phase=final ∧ converged===false`） |
| 7 | P1 | AC 补 ADR-0003 漏引两条（替代正确解 / 每 trial 干净环境） | **已改**：What Changes 第 7 条「转正规则**全引**」+ AC 两条对应项（含**锁目录**点名） |
| 8 | P1 | 拍板机械化 + 推动责任 | **已改**：头部加**可 grep** 的 `已拍板：<路径>（YYYY-MM-DD）` 行 + front-matter `状态: 待用户裁决` + 推动责任落点（路线图 §7 第 1 条） |
| 9 | P1 | 「不做」段未登记 model-fallback 的 L2（Why 表列了它） | **已改**：What Changes 第 6 条显式登记「不在本条 ⇒ 归 B2 后半另立 improvement」 |
| 10 | P2 | Capabilities 的「可迁移到 model-fallback」是无证据外推 | **已改**：Capabilities 改为「⚠ 不宣称可迁移 ⇒ 待 B2 后半落地后再评估」 |
| 11 | P2 | 实跑证据模板加 HEAD sha + git status | **已改**：What Changes 第 9 条 + AC 对应项（并注明 2026-11-20 那次没记 sha ⇒ 不可复现） |
| 12 | P2 | AC 末条按拆分后的用例集重写 | **已改**：AC 拆成「零模型层 / 真宿主层 / push-gate 层」三组 + 前置探针组 + 纪律组 |
| 13 | 隐藏意图 | 真实意图是「最小额度买到宿主接线漂移可被发现」⇒ 4 条真会话是刻板分配 | **已改**：Why 新增「缺口要分清三层」对照表 + 本条的成本结构改写（真宿主只剩 1 条） |
| 14 | 隐藏意图 | 「范式」若为真意图应显式化为交付物 | **已改**：Capabilities 改为**降级表述**（只说「后续新机制有可抄的形态」，并删掉对 model-fallback 的外推）⇒ **不把「范式」列为交付物** |
| 15 | 隐藏意图 | 「未拍板不立项」会变僵尸态（无人推动） | **已改**：头部写明「推动责任落点 = 路线图 §7 第 1 条」+ `状态: 待用户裁决` ⇒ 状态**可机判**（不是「待讨论」兜底） |
| 16 | 边界 | 额度耗尽/超时会被当 fail | **已改**：What Changes 第 7 条 + AC 的「额度纪律」条（复用 `ib_skip_if_out_of_quota` / `ib_skip_if_timeout`） |
| 17 | 边界 | 假 worker 产物不满足派生条件 | **已改**：Impact 风险④ 写明注入清单（TODO 全勾 + RESULT 实质正文 + 哨兵 + deliverables 存在 + 不碰 BRIEF/deps/deliverables） |
| 18 | 边界 | 锁目录跨 run 泄漏 | **已改**：What Changes 第 7 条 + AC 的「每 trial 干净环境」条点名两个锁路径 |
| 19 | 边界 | plan 的 shell 白名单对 claim/close/cancel 覆盖未实测 | **已改**：What Changes 第 8 条 + AC 末条（权限拒 ⇒ 记为「协议面缺口」并路由，不判用例失败） |
| 20 | 边界 | e2e 测的是活仓工作区 ⇒ 证据须记 sha | **已改**：What Changes 第 9 条 + AC 对应项 |
| 21 | 边界 | push-gate 变红演练的环境依赖（config 改 allow 即成真强推） | **已改**：What Changes 第 4 条把「本地 bare 远端」写成**硬要求**（非可选）+ AC 相应条目 |

## 8. critic 审查处置记录（第 1 轮，`review_profile: plan`，`APPROVE_WITH_CONDITIONS`，无 BLOCKER）

> 审查对象 = 并入 oracle 推荐后的版本。按预算规则：**无 BLOCKER ⇒ 不触发返工轮**；SHOULD_FIX 逐条处置如下。

| # | 级别 | finding（摘要） | 处置 |
|---|---|---|---|
| S1 | SHOULD_FIX | push-gate 形状判据三处自相矛盾：AC 仍并列「带引号 / 短簇」，且「短簇」未钉簇序（`-fu` 会撞 `git push -f*`） | **已改**：三处统一为唯一候选 `-uf` + 逐形状对照表。⚠ 另**推翻 oracle 与 critic 的共识**：`git push "origin" "+main:main"` 在 fnmatch 下**不撞**任何 8 条 glob（`git push * +*` 要求「空格 + `+`」，引号形态是 `"` 紧跟 `+`）⇒ 但仍不列（宿主 glob 语义未实测） |
| S2 | SHOULD_FIX | 「零模型层进默认套件 ⇒ CI 会红」的收益叙事超层（critic 依据其权限被拒未核到 CI，判「今天无定期运行者」） | **部分改、部分驳回**：实况核对 **e2e 仓有 CI**（`.github/workflows/test.yml`：push / PR / `workflow_dispatch` / nightly cron，跑 `bats tests/integration/ tests/_lib/`）⇒ critic 的事实前提**不成立**。但采用了它指向的**真前提**：基线带 8 条已知失败 ⇒ 新增失败信号被稀释 ⇒ **C1 成为先决条件**，并写进三处叙事 + B1 拍板文本 |
| S3 | SHOULD_FIX | 双 token「机械信号」无消费载体（`.rddf/reviews/` 无审计模板文件）；grep 计数不证真值 | **已改**：删掉「本仓审计模板」假前提 ⇒ 只列 3 处真实载体；明确「消费是流程动作」；补用例名 `CLI:`/`RUNTIME:` 层标识；治理面契约化登记为 architect/builder 的提案项（planner 不写 `prompts/**`） |
| S4 | SHOULD_FIX | B2「钩子先」分支的结论只对 fresh 世界成立，而 push-gate 防的是 Allow-always 世界 ⇒ 外推风险 | **已改**：降级目标加「**在 fresh 非交互会话里**」限定 + 第三个 token `PUSH-GATE-ALLOW-ALWAYS-WORLD-UNVERIFIED`；「形状全部失效」并入不可达出口 |
| NITS-1 | NITS | PT-2/3/4 用例名无层标识 | **已改**（并入 S3 处置）：名内加 `CLI:` 前缀 |

**未在本文件落地的两条**（属其他文件 / 其他角色，已在对应处处置）：

- **S5**（A6 缺 front-matter × AC20 15 行窗口的联合断言）⇒ 落 **roadmap A6 判据 ③**。
- **S6**（Q5 横幅列行号 ⇒ 插入后即失真）⇒ 落 **roadmap §7 第 5 条**。
- **S7**（roadmap §2 顺序行残留 A5）⇒ 落 **roadmap §2**。

## 9. 第 2 轮（oracle 复核 + metis 决策界面 gap 分析 → critic）的追加处置

> metis 第 2 轮为**用户显式授权**（超既定 1 轮预算）。本轮审查对象是「待拍板清单」而非本文正文；与本文直接相关的处置如下。

| # | 级别 | finding（摘要） | 处置 |
|---|---|---|---|
| SF-1 | SHOULD_FIX | B1 的「C1 是先决条件」仍乐观：推送 8 条后仍剩 9 条真新增 ⇒ CI 仍红 | **已改**（What Changes 第 2 条）：收益三层化 —— L0/L1 今天兑现，**L2「CI 自动抓漂移」降为跟踪项**，前置 = CI 红清零，**不进 B1 验收门** |
| SF-2 | SHOULD_FIX | oracle 的「源码先行」只能补充、不能替代探针；探针与用例必须分离 | **已改**（第 4 条探针 AC + roadmap §7.2）：固定链条 源码 → 窄探针/全量探针 → 三出口；补「无结论」第四态与 `PUSH-GATE-PROBE-INCONCLUSIVE` |
| SF-5 | SHOULD_FIX | A6 工件归属缺 §4 矩阵行与 §6 change 落点；A2 与 builder 面同 change 违反 §6 自定原则 | **已改**：采纳方案 B —— **A2 移出 change**（planner 自办）、A 批 change = A1/A3/A4/A6（全 builder 面）；本提案实施形态不变，仅立项落点变 |
| SF-6 | SHOULD_FIX | §3.2 `pending = 4` 与 A2 判据 `= 7` 矛盾 | **已改**（roadmap §3.2）：订正为 7 |
| — | 事实订正 | 行号 `opencode.jsonc.opencode-go:63-70` 偏一行 | **已改**：`62-69`（`:70` 已是 `git commit *: allow`） |

**未在本文件落地的**：SF-3（决策面压缩）、SF-4（A1 补验记录）、SF-7（CI 实况段）⇒ 均落 roadmap §2/§7。


