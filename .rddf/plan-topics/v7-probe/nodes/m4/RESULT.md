# RESULT — m4：v7-probe topic 级合成稿

## 结论

**C1【判定】** 若继续推进，本 topic 的单一推荐不是新增 `build-worker` subagent 或第二派发通道，而是让 `build` 成为 delegate/dispatch 的第三调用方，仅做编排，由现有 `build` 后端在每 wave 一棵 linked worktree 中实施并保留 `workRoot` 单槽。
- 证据链：C1 ← n5 §0、§2、§5.1 ← `lib/delegate-async.ts:1371-1376`、`lib/delegate-core.ts:151-155`
- 推断链：build 当前无受门控派发权 ⇒ delegate 能同时下发目录与会话权限且 linked worktree 各自一槽 ⇒ 扩第三调用方并逐 wave 建树即可并行，无须新 agent、并存通道或按 owner 分槽 ⇒ C1

**C2【判定】** 给 `build` 开五项 delegate 权限之前，必须同批完成 owner 三值归属、engineering 的 `plan_ref` 门覆盖、后端 delegate deny、守卫与回滚设计，并先由 architect 裁决“扩主体”与“整体退役 delegate”的方向冲突，否则不得开放入口。
- 证据链：C2 ← n5 §3 C2/C5/C6、§5.4、§6 ← `lib/delegate-core.ts:1413-1415`、`lib/delegate-core.ts:2340`、`lib/delegate-core.ts:1266-1288`
- 推断链：二值 owner 会把 build 坍缩为 front ⇒ 计划门按 caller 字符串分叉且后端会继承 delegate 能力 ⇒ 只改配置会造成错误接管、无计划实施与后端再派发 ⇒ 前置项未同批闭合即停止 ⇒ C2

**C3【判定】** 合并采用 N 次 `wave → integ` 加 1 次 `integ → main`，由派入独立集成 worktree 的 `build` 后端逐次执行 `--no-ff --no-commit`，先在未提交集成态完成全量验证，再把 `Wave-Id`/`Wave-Tip`/`Base`/`Verify-Exit` 写入另一次受门禁的 commit，禁止 merge 自动提交。
- 证据链：C3 ← n3 §0、§2.2–§2.6、§8 ← `lib/commit-gate.ts:831`、`plugins/commit-gate.ts:7`
- 推断链：merge 自动提交不经过 commit-gate ⇒ 必须拆成无自动提交的 merge 与独立 gated commit；n3 的“提交后验证”与 n4 的“commit trailer 带验证结果”存在时序差 ⇒ 将全量验证前移到 commit 前并写入 trailer ⇒ C3

**C4【判定】** 判据面应复用 plan-topics 的派生范式而不复制其载体，以 git ref、merge-base、merge trailer、worktree 与 pair 槽位派生 15 项检查及五子句 `converged`，且 `converged` 只表示可调度和已收口，不表示需求已交付。
- 证据链：C4 ← n4 §0、§2、§3、§6 ← `docs/adr/ADR-plan-multi-session-collaboration.md:187`、`tests/helpers/real-repo-git.ts:97`、`scripts/plan-topic-check.ts:147-164`
- 推断链：wave tip 与祖先关系已经存在于 git ⇒ 再建 waves.json 会形成第二本账并可分叉；git 可判合并与在飞状态但不能理解 TOPIC 目标 ⇒ 判据落在既有对象且收敛只作调度信号 ⇒ C4

**C5【判定】** 当前方案只能作为带停止条件的离线设计稿，实施前必须把 `claim→spawn` 补偿、`reap` 后旧 worker 风险、运行态人工清理和产物层 revert 分别落成明确步骤，且不得声称一份 rollback manifest 能回退 worktree、分支或 git 历史。
- 证据链：C5 ← n7 §0、§4、§6、§8.1 ← `scripts/plan-topic-check.ts:418-467`、`scripts/plan-topic-check.ts:499-511`、`.rddf/rollback/README.md:41-47`
- 推断链：claim 与 spawn 两步无补偿会留下永久在飞节点 ⇒ reap 只闭合 attempt 而不吊销旧 worker 会留下双活体窗口；manifest 只覆盖仓库文本 ⇒ 失败处置须补偿/告警与人确认，回滚须拆机制面、运行态、产物面 ⇒ C5

## 各节点结论的合并

以下“父的取舍”是本合成稿代表父会话所做的编辑性收敛，不伪称已有额外根裁决；各条均可回指对应节点的小节。

- **n1｜现有派发通道盘点**：结论是 `build` 无受门控实施派发通道，但 `general` shell 构成无登记、无槽位、无差集、无停机证据的写旁路；**父的取舍：采纳两段式事实**，不把旁路计入能力账，也不再笼统写成“build 完全不能写代码”（n1 §0、§3.1、§3.2）。
- **n2｜写隔离方案选型**：结论是一个 wave 一棵 linked worktree、树内一个写者并由 delegate/dispatch 承载，否决同树分支、目录隔离、独立 clone 与 subagent 伪隔离；**父的取舍：采纳主选并保留 C4 串行退化路径**，同时修正措辞为“建树本身是协议动作，入树后的会话权限与差集才是既有机械面”，不声称文件系统级单写者（n2 §0、§3、§4、§5）。
- **n3｜合并与冲突语义**：结论是临时集成分支上的 N+1 次合并、build 执行、逐 wave 及时合入、`--no-ff --no-commit` 加独立 gated commit、六类冲突与祖先幂等；**父的取舍：采纳主干并修正验证时序和回滚措辞**，验证前移到 commit 前以兼容 trailer，正常产物回退用 `revert -m 1`，`reset` 仅限未收口且记录写失败等受控恢复场景（n3 §2、§3、§5、§7）。
- **n4｜判据面设计**：结论是 git 原生载体、15 条判据、13 个新码加 1 个复用码、沿用 0/1/2/3、五子句 `converged`；**父的取舍：采纳派生式判据与调度/交付区分**，但把 trailer 限定为“形态与对账证据”，不把可手写的 `Verify-Exit` 当成验证确实执行过的充分证明（n4 §2–§6）。
- **n5｜与 delegate 全局单槽的关系**：结论是“替代”即 build 成为第三调用方、只做编排，不改 `workRoot` 槽键、不新增 agent，并给出七项前置和 ADR 影响面；**父的取舍：采纳为 topic 主形态**，将 owner 三值、plan_ref、后端 deny 和退役方向裁决提升为开闸前 BLOCKER，否决并存与分槽（n5 §0、§4–§7）。
- **n6｜与 rdd-builder P2 worktree 模式的关系**：结论是“路径可并存、机制只复用一套”，编排者负责建树与一次批准，wave join 前额外要求 commit，P2 步骤和上游漂移尚未核实；**父的取舍：采纳复用与上游诚实边界，修正 `.rddf/plans/**` 归属为按时间移交的单写者**——编排者开工前创建并冻结计划，派发后由后端接手续写，避免“编排者零写”与“派前必须已有 plan_ref”自相矛盾（n6 §0、§2–§7）。
- **n7｜失败模式与回滚可达性**：结论是 12 类失败按可机判/提示/不可检出分层，回滚分机制、运行态、产物三面并保留 trailer 定位件；**父的取舍：采纳失败面与三层口径，修正其 build-worker agent 删除草案**——本合成形态没有新 agent，机制回滚应撤 build 的 delegate 入口及同批归属/计划门改动，该 JSONC 仍只是不可直接执行的草案（n7 §2、§4–§6、§8）。
- **横向收敛**：P1（build 无 delegate 派发权）、P2（槽键为 `workRoot`）、P3（合并可用 git 层表达）在七节点证据内均未被证伪，但这只支持当前设计前提，不证明未来实现或上游不会改变。
- **术语收敛**：“build-worker”若保留，仅作“build 编排者 + delegate build 后端 + 每 wave worktree”的简称，不指新增 subagent agent。
- **写域收敛**：`.rddf/plan-topics/**` 仍只承载离线讨论且不能作为 `plan_ref`；工程计划必须物化到 accepted roots 内的 `.rddf/plans/**`，不能以本合成稿直接派实施。
- **职责收敛**：编排者决定 wave、建树、冻结计划、join 与合并决策；工程写和合并写分别发生在 wave 后端与集成后端，任何“主会话完全零写”的表述都不扩展到它开工前创建计划的动作。

## 父的裁决汇总

无（BRIEF 未列裁决）

## 反哺清单

1. （最重）`merge-commit-bypass`
   - 现象：`git merge` 可自动创建 commit，而 commit-gate 只识别独立 `git commit`，会同时绕过验证、角色写集以及 plan 的 commit deny。
   - 依据：`lib/commit-gate.ts:831`、`plugins/commit-gate.ts:7`（n3 §0、§9.1）。
   - 建议动作：流程与判据共同禁止自动提交，固定 `--no-ff --no-commit`，在独立集成树内解决冲突、验证后再单独 commit。
   - 合成口径：双亲与 trailer 只能事后判形态，不能倒推验证动机；未补机械检查前明确标“当前无完整闸门”。

2. （最重）`merge-ungated-no-gate`
   - 现象：可以机判 merge commit 存在，却不能仅凭现有 commit-gate 证明该 merge 没绕过验证门。
   - 依据：`plugins/commit-gate.ts:7`、`lib/commit-gate.ts:13`（n4 §0）。
   - 建议动作：落地 `wave_merge_ungated` 的双亲、trailer、冲突残留形态检查，并增加 merge 调用留痕或可重放记录。
   - 合成口径：不把 `wave_merge_ungated` 绿解释为“绝对无旁路”，验证真实性仍需可执行日志与人审。

3. （最重）`p2-unverifiable-upstream`
   - 现象：本仓只能看到 P2 的语义落点和二手引用，不能读取当前 rdd-builder SKILL.md 来核实具体准备步骤。
   - 依据：`scripts/rdd-skills.sh:56`、`prompts/build.md:405`（n6 §0、§1.1）。
   - 建议动作：立项前由有权限的会话实读并记录上游版本、步骤与落点；无法核实时只复用本仓可引的双根、单槽和计划前置。
   - 合成口径：所有“P2 会替编排器做 X”的句子均标“上游语义（未在本仓核实）”，不得转成机判承诺。

4. 【必须上报】`execute-skill-retired`
   - 现象：`prompts/build.md` 仍把 execute 作为可选增强及 worktree context 的消费面，但预筛脚本已声明该 skill 于 2026-11-20 归档退役。
   - 依据：`scripts/rdd-skills.sh:39-45`、`prompts/build.md:413`（n6 §3 C5、§9）。
   - 建议动作：另列文档清理项，将“调 execute”改成“由执行该 change 的 agent 消费已设置的 worktree context”。
   - 合成口径：保留概念前置，不复制陈旧技能调用，也不把清文档误写成新增并行机制。

5. （最重）`p2-upstream-drift`
   - 现象：上游已有文档落点漂移记录，P2 改名、改步骤或改暂停点都会使“复用 P2”的约定失效，而本仓没有覆盖该语义的 CI。
   - 依据：`docs/rdd-workflow-product-issues.md:132-140`、`prompts/build.md:405`（n6 §3 C5、§7）。
   - 建议动作：核实后固定上游版本与检查日期，把人工复核列入启用和升级检查；漂移时停止 wave 复用并退回串行路径。
   - 合成口径：文本锚点或 skill 可加载不等于步骤语义未漂，不声称存在上游漂移自动闸门。

6. （薄弱点）`orchestrator-write-unattributable`
   - 现象：git status 差集只给变化路径、不写作者，无法机判“编排者没有写 wave worktree”或跨 wave 的真实写入者。
   - 依据：`lib/delegate-core.ts:2593-2604`（n6 §7，n5 §8 同结论）。
   - 建议动作：编排者与实施者分时、分树、分会话，保存各树前后差集与后端记录，异常交人工复核；跨 wave 归因只发 info。
   - 合成口径：worktree 提供可归因边界而非作者证明，不把协议纪律包装成文件系统强制或阻断判据。

7. （最重）`claim-spawn-gap`
   - 现象：claim 已写未闭合 attempt 后 spawn 若失败，重复 claim 会被拒，无人值守时该节点及下游可能永久饿死。
   - 依据：`scripts/plan-topic-check.ts:418-467`、`scripts/plan-topic-check.ts:437-440`（n7 §0、§6 F2-01）。
   - 建议动作：优先实现带失败补偿的 `claim --spawn`，或新增 `abandon-spawn` 写 `spawn_failed` 闭合理由，不只保留 prompt 散文。
   - 合成口径：这是既有 plan-worker 链路的反哺项，不误称为 delegate 已证实有同一实现缺陷；推荐的 delegate 形态仍须有自己的派发失败闭合记录。

8. （最重）`reap-no-revoke`
   - 现象：reap 只写 finished_at 与 inputs_reviewed，不吊销旧 subagent session，同父续接或人工接管可能制造双活体写者。
   - 依据：`scripts/plan-topic-check.ts:499-511`、`docs/adr/ADR-plan-multi-session-collaboration.md:341-346`（n7 §0、§6 F2-02）。
   - 建议动作：引入 attempt generation 并要求产物携带、校验 gen；完整改造前至少在 reap 输出显著警告“旧 worker 未吊销，接管须人确认”。
   - 合成口径：reap 不是停机证明，finished_at 不是完成原因；delegate 的停机证据也不得被概括为对所有 subagent 有效。

9. 【必须上报】`stage3-not-manifestable`
   - 现象：运行态清理涉及 worktree、分支、锁和未提交改动，而 rollback manifest 的 find/delete 只覆盖仓库文本，无法把第三步完整物化进清单。
   - 依据：`.rddf/rollback/README.md:41-47`（n7 §4.1、§6 F2-09、§8.1）。
   - 建议动作：ADR 单列人工第三步及命令级前置：脏树拒绝 remove、未合祖先拒绝删分支、保留未收口 integ，并由有权限的主会话执行。
   - 合成口径：机制面可 dry-run，运行态须人工核验，已合入产物只能按 merge commit 做 `revert -m 1`；三者不得合并成“manifest 一键回滚”。

**反哺执行顺序**：先处理归属、计划门与权限泄漏，再开放 build 入口；先固定无自动提交合并与 trailer，再允许多 wave；先有人工运行态清理路径，再宣称可退役。

**反哺适用边界**：`claim-spawn-gap`、`reap-no-revoke` 是现有 plan/subagent 机制的实证缺口，不能只用于否定新方案而不修旧机制，也不能未经核实直接投射成 delegate 的代码事实。

**反哺与停止条件**：P2 上游无法实读、owner/plan_ref/deny 无法同批、或合并只能依赖自动提交时，均退回“不并行 + 上下文外置”，而不是降低隔离与审计口径。

## 不声称的东西

- 不声称本 topic 已决定立项，也不声称并行一定比串行更有价值；墙钟收益、上下文收益与运维成本是否值得，属于不可由这些引用机判的价值判断。
- 不声称 `build` 当前已有受门控的并行实施通道；同时也不否认 `general` shell 的无保护写旁路存在，后者不计入合格工程能力。
- 不声称已修改 agent、权限、delegate、plan-worker、prompt、ADR 或回滚清单；本稿及七份输入均为离线讨论产物，本 topic 不能直接派工程实施。
- 不声称 P1–P3 被永久证明，只声称截至当前引用未被证伪；槽键、权限条件或合并需求变化时须重新核验。
- 不声称已核实 rdd-builder P2 的当前 SKILL.md、owns 清单、具体建树命令、archive.sh 实现或所谓 P2 配额；这些均为上游语义（未在本仓核实）。
- 不声称给 build 加五项 allow 是一行配置即可安全完成，也不声称第三调用方方向优先于整体退役 delegate；后者须由 architect 另行裁决。
- 不声称 worktree 是文件系统沙箱或能强制单写者；建树、编排者零写实施树、计划单写者移交仍有协议层成分，shell 与绝对路径不受 edit scope 完整约束。
- 不声称 git 无文本冲突等于语义安全；同 hunk 取舍、跨文件依赖谁退让、生成物内容是否合理以及基线漂移意图均需人判或额外验证。
- 不声称测试全绿等于需求正确；验证是必要条件而非充分条件，merge trailer 也是可手写的对账形态，不是验证执行真实性的密码学证明。
- **不可机判事项**包括：跨 wave 文件作者与真实越界者、编排者是否确实未写实施树、旧 worker 是否仍活、冲突应保留哪侧、依赖冲突谁该退让、上游否定式语义是否仍成立，以及 TOPIC 目标是否真正达成。
- 不声称 `converged=true` 等于“做完了”；它只覆盖阻断项、祖先关系、在飞状态和最后验证等调度事实，删除未计划的 wave 仍可能伪造表面收敛。
- 不声称回滚能恢复所有状态：manifest 主要回退仓库文本，运行态要单独清理，已合入主分支的用户代码不随机制退役自动回退。
- 不声称 n7 的 JSONC 草案已可执行或已跑 drill；其中省略号、文件名与“删除 build-worker agent”的路径必须按最终采纳形态重写后才能落盘。
- 不声称推荐新增 `build-worker` agent；本稿采纳的是 build 编排者与 delegate 后端会话形态，plan-topics 的 D8 关闭范围不被暗中改成 subagent 派工程。
- 不替父会话伪造根裁决；本 BRIEF 未列裁决，文中的采纳、修正与否决均是合成取舍，方向冲突与是否立项仍留给后续 architect + planner 流程。

## STATUS: COMPLETE
