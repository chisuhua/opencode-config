# RESULT — m2：build 多 wave 实施形态合成稿

> 本稿只收敛 n1–n7 的离线讨论结论；「采纳」表示进入推荐设计，不表示已经立项、实施或验证。

## 结论

**C1【判定】** 若引入多 wave 实施，形态应是「`build` 主会话作为 delegate 第三调用方负责编排、现有 `build` 作为后端在独立 worktree 实施」，而不是新增 `build-worker` subagent 或第二套派发通道。
- 证据链：C1 ← n5 §0 ← `lib/delegate-async.ts:1371-1376`
- 推断链：delegate 能同时下发会话目录与 per-session 权限 ⇒ subagent 承载只剩静态权限和提示词约束 ⇒ 扩展既有唯一出口比复制登记、槽位和停机证据更闭合 ⇒ C1

**C2【判定】** 并行粒度固定为「一 wave 一 linked worktree 一活跃后端」，合并固定为 N 次 `wave → integ` 加一次 `integ → main`，且每次均以 `--no-ff --no-commit` 后接独立受门禁 commit 完成。
- 证据链：C2 ← n3 §0 ← `lib/commit-gate.ts:831`
- 推断链：槽位与差集都以 `workRoot` 为边界 ⇒ 跨 worktree 可并行而同树双写不可归因 ⇒ 每波及时合入集成分支可缩小冲突面 ⇒ merge 自动提交又绕过 commit-gate ⇒ C2

**C3【判定】** 只有退役方向裁决、三值 owner、`plan_ref` 门扩展和后端 delegate deny 同批闭合，才可向 `build` 开放派发权限，否则维持现状或退回串行上下文外置。
- 证据链：C3 ← n5 §6 ← `lib/delegate-core.ts:1413-1415`
- 推断链：当前 owner 二值会把 build 坍缩为 front ⇒ 当前 plan_ref 条件不会覆盖 build ⇒ 当前后端权限又可能继承 delegate 能力 ⇒ 只改配置会同时制造归属、计划门和递归派发缺口 ⇒ C3

**C4【判定】** 与 rdd-builder P2 的关系定为「路径可并存、worktree 机制复用、编排层单写生命周期」，但上游 P2 实读核实是立项前阻断条件而非可选补充。
- 证据链：C4 ← n6 §0 ← `prompts/build.md:413`
- 推断链：本仓已有 worktree context、双根和每树一槽的接口落点 ⇒ 另造生命周期会产生双写者与状态漂移 ⇒ 但 SKILL.md 步骤未在本仓核实且已有漂移记录 ⇒ 只能复用已核实语义并先核实上游 ⇒ C4

**C5【判定】** `converged` 仅作调度信号，回滚必须拆成机制面清单、运行态人工清理和产物面 `revert -m 1` 三层，任何一层绿都不得被表述为需求完成或历史已恢复。
- 证据链：C5 ← n7 §4.1 ← `.rddf/rollback/README.md:41-47`
- 推断链：git 对象能证明合并形态却不能证明目标达成 ⇒ 清单只能处理仓库文本而不能处理 worktree、分支和既有历史 ⇒ 调度、机制退役与产物回退是三个不同命题 ⇒ C5

## 各节点结论的合并

- **n1**：现状是 `build` 无受门控工程派发权，`general` shell 仅能算无登记写旁路；**父的取舍：采纳**，用双段表述保留旁路事实但不把它计入并行实施能力（`opencode.jsonc:30-34`、`opencode.jsonc:1006`）。
- **n2**：有效隔离单位是 worktree 而非分支或目录，承载者须为 delegate 系；**父的取舍：采纳**，同树方案、独立 clone 和 subagent 伪隔离均不进入推荐（`lib/delegate-core.ts:154-155`、`scripts/check-upstream-anchors.sh:174-176`）。
- **n3**：采用临时集成分支、每波即合、N+1 次合并、tip 幂等和六类冲突；**父的取舍：采纳并修正职责**，编排者决定顺序，实际写集成树者优先为独立 integ worktree 的 build 后端，以符合「编排不实施」（`opencode.jsonc:204-205`、`lib/delegate-core.ts:2593-2604`）。
- **n4**：采用 git 对象与 pair 台账派生的 15 条判据、四值退出码及五子句 `converged`；**父的取舍：采纳并收窄 D8**，双亲和 trailer 只能判合并形态，不能证明验证真实执行或无旁路（`plugins/commit-gate.ts:7`、`nodes/n4/RESULT.md:82`）。
- **n5**：采用「build 成为 delegate 第三调用方、后端仍叫 build、不改 workRoot 单槽」；**父的取舍：采纳**，并将 owner、plan_ref、权限 deny 与退役方向列为同批前置，而非后续优化（`lib/delegate-core.ts:2340`、`lib/delegate-core.ts:1266-1288`）。
- **n6**：采用 P2 机制复用和编排者独占 worktree 生命周期；**父的取舍：采纳并修正计划归属**，计划可在派发前由编排者物化后冻结，若后端需改写必须显式移交单写权，不接受长期双写（`prompts/build.md:413`、`prompts/build.md:418`）。
- **n7**：采用 12 类失败面、不可检出分层和三层回滚口径；**父的取舍：采纳原则但否决直接沿用其清单草案**，草案假设新增 subagent agent，与 C1 的最终形态不一致，实施时须按第三调用方改动面重生成（`.rddf/rollback/README.md:41-47`、`nodes/n7/RESULT.md:150-159`）。

**统一后的最小流程如下；它是推荐流程，不是现存实现。**

1. 用户在编排层选择单 change P2 或多 wave 路径，暂停和批准不复制到每个无人值守后端。
2. 编排者先把可派工程的计划物化到 `.rddf/plans/**`，不得直接以 `.rddf/plan-topics/**` 充当 `plan_ref`（`lib/delegate-core.ts:1321-1326`）。
3. 计划在派发前冻结；之后任何写者变化都显式交接，以时间段而不是路径重叠保证单写者。
4. 编排者在仓根之外创建每波 worktree 和分支，避免未跟踪目录污染其他会话差集（`lib/delegate-core.ts:2601-2604`）。
5. 编排者通过 dispatch 指定后端目录和 scope，后端类型沿用现有 `build`，不建立第二套 pair、slot 或 ledger。
6. 同树仍只一个写者，全局活跃后端仍受默认 3 的配额限制，更多 wave 排队而非拆槽（`lib/delegate-async.ts:96-101`）。
7. wave 后端独占本树实施、验证并提交，join 前必须有稳定 tip；P2 允许未提交的宽松口径在 wave 路径上加严（`prompts/build.md:429`）。
8. 后端离场且 tip 固定后，编排者才发出合并任务，禁止合入仍在变化的分支。
9. 合并优先进独立 integ worktree，每次记录 wave id、wave tip、base 和 verify exit，并以独立 commit 触发既有门禁。
10. 同 hunk 取舍、跨文件退让和生成物正确性交人判；验证红即停止推进，不以 `-X ours/theirs` 静默吞掉冲突。
11. 每波合入后立即验证，全部 wave 成为 integ 祖先且 integ 成为 main 祖先后，才允许计算调度收敛。
12. 收尾先核对未提交差集，再回收 worktree 和已合分支；危险清理由具备权限的主会话或人执行，不交给受限后端。
13. 若方向裁决选择整体退役 delegate，则停止第三调用方方案，不在旧出口上继续叠加主体（`docs/adr/ADR-plan-delegate-engineering-session.md:152-157`）。
14. 若并发需求长期不超过 1，或同批前置无法闭合，则退回串行实施加上下文外置，不引入半成品并行面。

**合并后各概念的唯一定位如下，避免跨节点同词异义。**

- 「build-worker」仅可作为非正式简称，指 build 编排加 delegate 后端会话，不指新 agent。
- 「wave 身份」由分支名和 tip 给出，不由另一份自述状态文件给出。
- 「wave 完成」只表示后端离场且有可合交付，不表示需求语义已达成。
- 「合并完成」表示受约束的 merge commit 已落盘且记录可对账，不表示行为必然正确。
- 「收敛」只表示没有已知未派、未合、在飞或未验证项，不表示目标集合天然完备。
- 「回滚」默认指机制退役；运行态另清，产物历史另 revert，三者不得互相替代。
- 「复用 P2」只复用本仓可核实的接口语义，不声称调用一个可编程的 P2 函数。
- 「编排者不实施」是职责边界和审计要求，不是已经存在的文件系统强制。

## 父的裁决汇总

无（BRIEF 未列裁决）。
上游各节点的「待父裁决」已转化为 C1–C5 的前置、停止条件或诚实边界，不伪称为 BRIEF 的 R1… 根裁决。

## 反哺清单

> 下列均为结论层载荷；格式为「现象 | 依据 | 建议动作」，前六项是本 BRIEF 指定不得丢失的最重项。

- （最重）`merge-commit-bypass` | merge 自建 commit 可绕开验证、写集门禁及 plan 的 commit deny | `lib/commit-gate.ts:831`、`plugins/commit-gate.ts:7`、`opencode.jsonc:204-205` | 禁止自动提交，固定 `--no-commit` 加独立 gated commit，并补 merge 形态判据。
- （最重）`merge-ungated-no-gate` | 双亲与 trailer 可事后检查，却不能证明当时没绕门或验证真跑过 | `plugins/commit-gate.ts:7`、`lib/commit-gate.ts:13` | 将 D8 明确标成形态判据，另保留不可机判披露，禁止宣传为完整防旁路闸门。
- （最重）`p2-unverifiable-upstream` | P2 的 SKILL.md 步骤未在本仓核实，脚本只预筛且最终依赖 skill 加载 | `scripts/rdd-skills.sh:56`、`prompts/build.md:405` | 立项前实读已安装上游并记录版本、步骤和产物，未读前不得把 P2 行为写成事实。
- （最重）`p2-upstream-drift` | 上游文档与产物落点已有漂移，复用接口可能随上游改版失效 | `docs/rdd-workflow-product-issues.md:132-140`、`prompts/build.md:405` | 建立版本化人工复核和语义锚点，漂移时停止复用，不用本仓 CI 伪装可覆盖上游。
- （最重）`orchestrator-write-unattributable` | git 差集只给变更路径，不能证明编排者没有写 wave worktree | `lib/delegate-core.ts:2593-2604` | 保留单写协议、逐树差集和人工复核，输出标为不可机判，不设虚假的归因而阻断。
- （最重）`stage3-not-manifestable` | 运行态 worktree、分支和锁不在仓库文本清单能力内 | `.rddf/rollback/README.md:41-47`、`.rddf/rollback/README.md:49` | 把第③步写成 ADR 人工步骤和命令级断言，绝不声称 rollback-drill 已覆盖它。
- 【必须上报】`owner-collapse` | 第三调用方会被二值 owner 映射成 front，破坏接管边界 | `lib/delegate-core.ts:1413-1415`、`lib/delegate-async.ts:568` | owner 三值、旧数据兼容、文案和守卫同批改，未改前不开 build allow。
- 【必须上报】`delegate-allow-leak` | 只给 build 加 allow 可能使 build 后端也获得再派发能力 | `lib/delegate-core.ts:1266-1288`、`lib/delegate-core.ts:2460-2462` | classPermissions 同批显式 deny 五个 delegate 动作，并加后端权限守卫。
- 【必须上报】`plan-ref-caller-keyed` | 计划门按 caller 字符串分叉，build 派发会静默绕过计划先行 | `lib/delegate-core.ts:2340`、`lib/delegate-core.ts:1321-1326` | 明确扩展到 build 或所有 engineering 派发，并用负例测试锁定，不接受先开后补。
- 【必须上报】`general-shell-write-bypass` | general 虽 edit deny，shell 仍可形成无登记写盘旁路 | `opencode.jsonc:1006`、`scripts/agent-guard-rules.ts:84` | 单独立项评估收口；在现状描述中始终披露，既不利用也不隐瞒。
- 【必须上报】`claim-spawn-gap` | claim 已写 attempt 而 spawn 失败会让节点卡在不可派状态 | `scripts/plan-topic-check.ts:437-440`、`docs/adr/ADR-plan-multi-session-collaboration.md:358-359` | 实现原子 claim-spawn 或 abandon-spawn 补偿，并记录 spawn_failed 关闭原因。
- 【必须上报】`reap-no-revoke` | reap 只闭合记录而不吊销旧会话，接管可能制造双活体写者 | `scripts/plan-topic-check.ts:499-511`、`docs/adr/ADR-plan-multi-session-collaboration.md:341-346` | 至少输出未吊销告警，后续用 generation 围栏产物；接管不得宣称已确认停机。
- `merge-order-no-carrier` | 工程侧没有表达波间依赖的既有载体，合并顺序只能书面声明 | `nodes/n3/RESULT.md:243`、`docs/adr/ADR-plan-multi-session-collaboration.md:53-63` | 若增加 Depends-On，必须同批让 D1 消费；否则只披露该缺口，不造无消费者字段。
- `baseline-dead-field-blocks-merge` | attempts baseline 未被写入，创建基线无法可信对账 | `docs/adr/ADR-plan-multi-session-collaboration.md:354`、`lib/plan-topics.ts:50` | 创建 worktree 时亲自记录完整 Base SHA，同时修复或删除既有死字段，不继续自述。
- `cross-file-semantic-invisible` | 跨文件接口破坏可以零 git 冲突，验证红也不能指出哪侧退让 | `nodes/n3/RESULT.md:139`、`nodes/n3/RESULT.md:153` | 按依赖排序并逐波验证，红即阻断，由人裁决退让，禁止默认自动修。
- `lock-leak-live` | topic 长锁无机械强制且释放步骤会留下 owner，已有真实泄漏形态 | `docs/adr/ADR-plan-multi-session-collaboration.md:351-353`、`prompts/plan.md:280-281` | 原子化取锁与归属校验，先删 owner 再 rmdir；未修前统一降级为协议约定。

## 本 topic 不声称的东西（诚实口径）

- 不声称已经决定立项；本稿回答「若做，形态如何」，价值与优先级仍由 architect 和 planner 裁决。
- 不声称现状已有 build 多 wave 能力；C1–C5 都是推荐设计，不是实施完成声明。
- 不声称推荐新增 `build-worker` agent；最终形态是 delegate 调用方角色加既有 build 后端。
- 不声称给 build 五项 allow 就足以落地；owner、plan_ref、后端 deny 和守卫是同批阻断项。
- 不声称需要或允许拆除 `workRoot` 单槽；并行来自不同 worktree，而不是同树多写者。
- 不声称目录 scope 能提供并行归因；它主要约束 edit，不能给 git 差集补写作者身份。
- 不声称 worktree 建、收、合生命周期已有本仓实现；目前只是推荐流程和既有语义落点。
- 不声称 subagent 能承载等价隔离；本稿明确排除静态权限加提示词的伪 worktree 隔离。
- 不声称 P2 上游步骤已核实；所有超出本仓接口落点的细节仍标为「上游语义（未在本仓核实）」。
- 不声称 P2 可以像本地函数一样直接调用；推荐的是机制复用和职责分层。
- 不声称 `.rddf/plan-topics/**` 可直接派工程；实施前必须形成 accepted roots 内的计划。
- 不声称 merge commit 的双亲或 trailer 能证明验证实际执行；它们只提供形态和对账证据。
- 不声称 `--no-commit` 流程已经有完整机械闸门；当前仍含流程纪律与事后检查成分。
- 不声称测试全绿等于语义正确；验证是必要条件，跨文件取舍和冲突解决仍需人判。
- 不声称 git 无冲突等于无冲突；基线漂移和跨文件接口破坏都可干净合入后暴露。
- 不声称跨 wave 文件作者可机判；**不可机判：谁写了哪个文件、是否发生隐秘双写**。
- 不声称编排者零写可由现有差集机判；**不可机判：路径变化究竟由编排者还是后端造成**。
- 不声称 worker 活性可由 mtime 机判；**不可机判：陈旧产物对应死亡、暂停还是仍在运行**。
- 不声称上游否定命题可由锚点完全机判；**不可机判：语义等价改写后是否仍不传某能力**。
- 不声称需求完成可机判；**不可机判：TOPIC 目标与合并产物是否在语义上相符**。
- 不声称 `converged` 等于 done；它只回答已知 wave 是否未派、未合、在飞或未验证。
- 不声称收敛无法被操纵；缺失目标集合或删除计划项仍需要声明与结果同屏及人审。
- 不声称回滚清单能清 worktree、分支或锁；运行态必须另有带前置校验的人工步骤。
- 不声称机制退役应删除已合入的用户代码；产物层退路是单独 revert，而非 reset 主分支。
- 不声称 n7 的 JSONC 草案可直接执行；其中省略号、形态假设和配置落点都须按最终设计重做。
- 不声称本 topic 修复了 plan-worker 的 claim、reap、锁或 scope-check 既有缺口；它们只被反哺登记。
- 不声称多 wave 一定缩短墙钟；任务可拆分性、依赖密度、验证成本和队列收益尚未实测。
- 不声称无人值守等于无需人；路径选择、语义冲突、接管、上游核实和最终交付仍保留人工裁决点。

## STATUS: COMPLETE
