# RESULT — m1：v7-probe topic 级合成稿

> 性质：离线讨论合成稿，不是 ADR、计划或实施许可；以下“裁决”只收敛本 topic 的内部口径，不代替 architect 的方向决策。

### 1. 结论

1. **在 delegate 继续作为唯一工程出口且实测并发需求大于 1 的前提下，应引入“build 编排 + 既有 build delegate 后端”的多 wave 形态，不应新增 `build-worker` subagent agent；若 delegate 整体退役或并发需求不大于 1，则不立项。**（来自 `n5 §0`、`n5 §5.1`、`n5 §5.4`）
2. **并行写隔离唯一采纳“一波一 linked worktree、一树一活跃后端、由 delegate/dispatch 指定目录并下发会话权限”，同树分支、同树目录、独立 clone 与 subagent 伪隔离均否决。**（来自 `n2 §0`、`n2 §3`、`n2 §4.1–4.6`）
3. **合并采用 N 次 `wave → integ` 加一次 `integ → main`，由独立集成 worktree 中的 build 后端执行，每次均以 `--no-ff --no-commit` 后接受门禁的独立 commit 落地。**（来自 `n3 §0`、`n3 §2.1–2.6`）
4. **判据以 git ref、merge-base、merge commit trailer、worktree 与 delegate pair 为真相源，`converged` 仅表示可调度的五子句收敛而不表示需求完成。**（来自 `n4 §0`、`n4 §2`、`n4 §6.2–6.3`）
5. **`owner_agent` 三值、后端 delegate deny、build 的 `plan_ref` 门与守卫必须同批闭合，否则不得给 build 开放五项 delegate 权限。**（来自 `n5 §3 C2/C5/C6`、`n5 §5.4`、`n5 §6`）

**推荐形态的最小闭环（建议，不新增结论）：**

1. architect 先确认保留 delegate 唯一出口，再启动第三调用方实施批。
2. build 编排者先写版本化总计划，逐 wave 固定写域、`Depends-On`、验证命令与 base。
3. P2 路径的一次 HARD pause 上提到编排层，不在无人值守后端逐 wave 重复询问。
4. 编排者在仓根之外创建 integ 与各 wave worktree，并记录分支和基线。
5. 编排者以 `plan_ref` dispatch 既有 build 后端，目录与权限在创建会话时一次定型。
6. 后端只实施并提交自己的 wave 分支，不建树、不合并、不再派后端。
7. 后端离场且 tip 稳定后才 join，空交付、在飞或输入漂移均阻断。
8. integ worktree 的独立 build 后端按依赖顺序逐 wave 合并并立即全量验证。
9. merge commit 写齐 `Wave-Id`、`Wave-Tip`、`Base`、`Verify-Exit`，重复 tip 只作 no-op。
10. 全部 wave 合入 integ 且零阻断后，再以同样受门禁形态执行一次 integ → main。
11. `build-wave-check` 只报告调度收敛与缺口，目标达成仍交人审。
12. 主会话按 ancestor 与 diff 前置条件收运行态，历史产物只用 revert 逆操作。

### 2. 各节点结论的合并

| 节点 | 节点结论（压缩） | 父的取舍 |
|---|---|---|
| n1 | build 无受门控实施派发通道，但存在 `general` shell 无保护写旁路；同树单槽与角色租约是刻意约束。 | **采纳**：保留双段式事实，旁路不计入能力账；“缺口”仅指范围空位，不预设必须补。 |
| n2 | 推荐 worktree + delegate 承载，否决同树分支/目录、独立 clone、subagent 伪隔离，C4 串行外置为退路。 | **采纳**：worktree 是隔离与归因边界；C4 不是并列推荐，只是前置失败或收益不足时的退化路径。 |
| n3 | N+1 次合并、临时集成分支、build 执行、禁止 merge 自动提交、六类冲突与 trailer 留痕。 | **采纳并收紧**：合并交给 integ worktree 的独立 build 后端；编排主会话只决策，不开 plan 的 commit 例外。 |
| n4 | git 原生载体、15 条判据、`wave_` 前缀、四值退出码、五子句 `converged`、跨 wave 归因仅 info。 | **采纳并补一处载体**：事前依赖写入版本化 wave 计划的机读 `Depends-On`，D1 消费；不新增第三 phase。 |
| n5 | build 成为 delegate 第三调用方、只做编排，不新增 agent、不拆 `workRoot` 槽，三项权限治理同批改。 | **采纳为主推荐**：这是对 TOPIC 形态问题的最终回答；“替代”指替代新通道设想，不替代 delegate。 |
| n6 | 与 P2 是路径并存、机制复用；编排者建树， HARD pause 上提，join 前必须有 commit，上游 P2 未核实。 | **采纳并修正**：计划由编排者先建、后端只写各自 wave 段以避免同路径双写；不得声称已核实 P2 或调用已退役 execute。 |
| n7 | 12 类失败、三层回滚边界、机制清单不能回退历史，突出 claim/spawn 与 reap 双活体风险。 | **采纳失败面与两层回滚，修正具体草案**：其新 subagent 文件名/配置删除示例不适用于本合稿的第三调用方形态，实施时须重写。 |

**合并时显式消解的三处冲突：**

- n5 的“build 产出计划”与 n6 的“编排者零写”按时间切分：编排者只在派发前写契约，派发后该 wave 计划由后端单写，禁止并行同写（`n5 §6-3`、`n6 §6.1`）。
- n3 的“派发方不碰文件”与“build 执行合并”按会话切分：编排主会话不合并，独立 integ build 后端合并（`n3 §2.2`）。
- n7 的新 agent 回滚模板与 n5 的第三调用方形态冲突时，以 n5 为准，n7 只保留分层原则和命令级判据（`n7 §5`、`n5 §5.1`）。

### 3. 父的裁决汇总

| # | 事项 | 裁决 |
|---|---|---|
| 1 | n1-1：现状是否采用“双段式”表述（`n1 §6-1`） | **是**：同时写“无受门控通道”和“存在无保护 shell 旁路”，后者不算实施能力。 |
| 2 | n1-2：“能力缺口”是否预设应补（`n1 §6-2`） | 统一为“**范围空位（能力缺口，不预设必补）**”；单槽与租约仍是刻意约束。 |
| 3 | n1-3：是否外部核实 P2（`n1 §6-3`） | **立项前必须实读上游 SKILL.md**；本 topic 不外查、不把上游步骤当事实。 |
| 4 | n2-1：C1 承载者措辞（`n2 §8-1`） | 保留“delegate 承载是必要前提”，由 n5 的第三调用方方案闭合，不另造承载者。 |
| 5 | n2-2：C4 是否并列推荐（`n2 §8-2`） | **不并列**：仅在方向否决、前置不成立或并发收益不足时采用串行上下文外置。 |
| 6 | n2-3：`general` 旁路是否改变选型（`n2 §8-3`） | **不改变**：它是独立安全风险，另立修复项，不能作为并行方案或隔离依据。 |
| 7 | n3-1：合并执行者是否硬绑定 build（`n3 §9.2-1`） | **接受**：由 integ worktree 的 build 后端执行；不给 plan 开 `git commit` 例外。 |
| 8 | n3-2：integ 分支是否新增运行态第二本账（`n3 §9.2-2`） | **不是第二本账**：它是需清理的 git 运行态工件，真相仍由 git 派生。 |
| 9 | n3-3：合并记录落点与 registry（`n3 §9.2-3`） | 采用 merge commit trailer；实现批同批做 D13 校验，暂无独立 CLI 前不加 registry `watch[]`。 |
| 10 | n3-4：同 hunk 是否一律退回重划（`n3 §9.2-4`） | **分两种**：非预期写域重叠先退回重划；事先声明的合理重叠由人裁决并独立 resolution commit。 |
| 11 | n4-1：D1 依赖声明载体（`n4 §9-1`） | 在 `.rddf/plans/<slug>.md` 的每 wave 机读段写 `Depends-On`，由 D1 唯一消费；不用事后才存在的 merge trailer 承担事前声明。 |
| 12 | n4-2：是否增加第三 phase（`n4 §9-2`） | **不增加**：“一波完成”归入下一波派发前截面，保持既有闭集。 |
| 13 | n4-3：是否接受 `wave_` 前缀（`n4 §9-3`） | **接受**：新增码全部前缀化，避免同名异义。 |
| 14 | n4-4：`out_of_scope` 复用还是新建（`n4 §9-4`） | **复用**于单 worktree 越界；跨 wave 不可归因只用 `cross_wave_unattributable` info。 |
| 15 | n4-5：F1/F2/F4 是否并入本讨论稿实施（`n4 §9-5`） | 不挟带进第三调用方首批；另开既有 plan 机制修复 change，build 侧只复用正确范式。 |
| 16 | n5-1：delegate 退役与扩主体的方向冲突（`n5 §9-1`） | **architect 先裁方向**：若整体退役则否决本方案；本稿仅在保留唯一 delegate 出口时推荐扩主体。 |
| 17 | n5-2：三值 owner 是否本批做（`n5 §9-2`） | **必须同批**：不接受 front 可接管 build 后端的窗口期。 |
| 18 | n5-3：`plan_ref` 推广范围（`n5 §9-3`） | 收窄为 `callerAgent ∈ {plan, build}` 且 engineering 必填；不改变 front 既有行为。 |
| 19 | n5-4：是否保留 build-worker 名词（`n5 §9-4`） | 正文用“**build 编排 + delegate 后端**”；build-worker 仅可作别名，绝不表示新 subagent。 |
| 20 | n6-1：复用还是分层并存（`n6 §9-1`） | 固定表述为“**路径并存、机制复用**”。 |
| 21 | n6-2：谁创建 worktree（`n6 §9-2`） | **编排者统一创建/回收**；wave 后端不得重复 provision。 |
| 22 | n6-3：一 change 多 wave 的完成判据（`n6 §9-3`） | 不限制一 change 一 wave；wave 完成看 tip 合入 integ，change 完成须全部规划 wave 收口后再走归档。 |
| 23 | n6-4：未核实上游依赖如何写（`n6 §9-4`） | 明确列为**立项阻断核实项**，实读前不得把 P2 步骤、配额或 owns 清单写成事实。 |
| 24 | n6-5：已退役 execute 的陈旧引用（`n6 §9-5`） | 另列 prompt 清理项；本方案只复用“worktree context 已设”概念，不调用 execute。 |
| 25 | n7-1：是否接受两层回滚（`n7 §8.2-1`） | **接受**：机制/运行态可清理，主分支产物仅 `revert -m 1`；禁止以强推 main 冒充通道回滚。 |
| 26 | n7-2：F2-01/F2-02 是否单开（`n7 §8.2-2`） | 另开修复 change；优先补 spawn 失败闭合，reap 先加未吊销告警，再评估 generation。 |
| 27 | n7-3：运行态清理由谁执行（`n7 §8.2-3`） | **build 主会话统一执行**；worker 不自删 worktree，`--force`、reset/clean/强删分支均禁止。 |
| 28 | n7-4：wave 分支保留期限（`n7 §8.2-4`） | 至少保留到 change 归档且确认已为 main 祖先；之后交互式批删，未合分支永不自动删。 |

### 4. 反哺清单

| # | 分类 | 现象 | 依据 path:line | 建议动作 |
|---|---|---|---|---|
| 1 | 【流程纪律】 | （最重）`claim-spawn-gap`：claim 写 attempt 后 spawn 失败无补偿，节点会永久在飞。 | `scripts/plan-topic-check.ts:437-465`、`docs/adr/ADR-plan-multi-session-collaboration.md:358-359` | 首选原子 `claim --spawn` 失败回滚；最低先加 `abandon-spawn` 并写 `close_reason=spawn_failed`。 |
| 2 | 【流程纪律】 | （最重）`reap-no-revoke`：reap 只闭合记录而不吊销旧子会话，接管可制造双活体写者。 | `scripts/plan-topic-check.ts:499-511`、`docs/adr/ADR-plan-multi-session-collaboration.md:341-346` | 先输出“旧 worker 未吊销”告警；后续以 attempt generation + 产物 gen 围栏闭合。 |
| 3 | 【声明与实现脱节】 | `owner` 被声明却不参与 ready/claim，parent 节点仍可派给 worker。 | `docs/adr/ADR-plan-multi-session-collaboration.md:348-350`、`lib/plan-topics.ts:197-199` | 实装 executor/owner_mismatch，或从 schema 与文档同批删除。 |
| 4 | 【流程纪律】 | `topic-lock-unenforced`：长锁无写路径消费，释放 `rmdir` 又因 owner 文件必失败且已有活例。 | `scripts/plan-topic-check.ts:286-320`、`prompts/plan.md:280-281`、`.rddf/state/plan-topics/e2e-probe.lock/owner:1` | 原子化拿锁与归属校验；先删 owner 再 rmdir；`lock` 改名 `lock-status`。 |
| 5 | 【声明与实现脱节】 | `scope-check-union-missing`：文档承诺并行 union，CLI 却强制 node 前缀，输出必然误报。 | `docs/architecture/plan-topics-topic-model.md:139`、`scripts/plan-topic-check.ts:233-240` | 实现 `--union`，或并行时直接 exit 2 且删除 union 承诺，禁止输出伪越界清单。 |
| 6 | 【插桩位空转】 | `baseline-precheck-dead-fields`：baseline 不写、precheck 不消费，名字像闸门却无强制。 | `docs/adr/ADR-plan-multi-session-collaboration.md:354-358`、`scripts/plan-topic-check.ts:455-463` | claim 时写真实 HEAD 全 SHA；precheck 非零拒 claim，否则删字段并同步文档。 |
| 7 | 【插桩位空转】 | `close-reason-absent`：finished_at 无法区分完成、spawn 失败、接管和取消，审计不能归因。 | `docs/adr/ADR-plan-multi-session-collaboration.md:298`、`docs/adr/ADR-plan-multi-session-collaboration.md:301` | attempt 增加闭集 `close_reason`，close/reap/cancel/abandon 全部强制填写。 |
| 8 | 【模板复用风险】 | 钉住已知缺陷的测试缺 DEFECT id、触发条件和退出条件，修复后仍可能保留反向措辞。 | `docs/adr/ADR-plan-multi-session-collaboration.md:361`、`tests/plan-topics-dag.test.ts:374-416` | 每例补三行元数据，并在 checker `summary.known_gaps[]` 公布退出条件。 |
| 9 | 【声明与实现脱节】 | RESULT 判据只核实质正文，稳定 token 与结论质量靠 prompt，不能宣称机判质量。 | `lib/plan-topics.ts:359-369`、`prompts/plan-worker.md:29` | 保持质量人判；若要结构闸门，先实现稳定 token/小节抽取测试，再更新文档承诺。 |
| 10 | 【自述/命名】 | `converged-not-done`：收敛是调度信号，命名或汇总成 done 会伪造交付。 | `docs/adr/ADR-plan-multi-session-collaboration.md:158-162`、`docs/architecture/plan-topics-topic-model.md:107` | 保留现命名；所有投影同屏列未完成子句，目标达成始终 info/人判。 |
| 11 | 【流程纪律】 | `manifest-cannot-rollback-history`：回滚清单只覆盖仓库文本，不覆盖 worktree、分支与已合历史。 | `.rddf/rollback/README.md:41-47`、`.rddf/rollback/README.md:126-133` | ADR 固定分机制/运行态/产物三层；退役判据还要看是否仍宣称能力，不只看测试绿。 |
| 12 | 【本次场景活体复现】 | 本次 n7 草案按“新 build-worker agent”写删除项，而 n5 已收敛为第三调用方，说明模板会反向覆盖上游裁决。 | `nodes/n7/RESULT.md:154-168`、`nodes/n5/RESULT.md:208-211` | 合成稿显式判该草案不可直接落盘；后续 ADR 以实际文件差集重建 manifest，禁止复用省略号草案。 |
| 13 | 【顺带发现】 | `execute-skill-retired`：build prompt 仍把已退役 execute 当 P2 后增强入口。 | `prompts/build.md:413`、`scripts/rdd-skills.sh:39-45` | 单开 prompt 清理，只保留概念前置与现行执行者，不新增调用。 |

### 5. 本 topic 不声称的东西（诚实口径）

- 本 topic 未修改实现、配置或 ADR，也未产出可直接派工程的正式计划。
- P2 的具体步骤、owns、配额及归档脚本行为均属**上游语义（未在本仓核实）**，立项前必须实读。
- **不可机判的是跨 wave 文件作者、worker 是否仍活、编排者是否零写、冲突该保留哪侧、验证是否真跑以及需求是否真正完成。**
- 本 topic 未做墙钟或上下文收益基准测量，因此“应做”始终以真实并发需求大于 1 为条件。
- git 形态与 trailer 可判合并记录完整，但不证明验证全集充分，也不证明合并后的语义正确。
- n7 的回滚 JSONC 是带省略号且形态已过时的草案，本 topic 未执行 rollback drill，也不声称它可落盘运行。

## STATUS: COMPLETE
