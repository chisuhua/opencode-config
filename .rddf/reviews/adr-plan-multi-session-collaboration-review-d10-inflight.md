# 审稿报告：ADR-plan-multi-session-collaboration —— D10 增补（在飞与派发台账）+ 阶段化追认

> 对象：`docs/adr/ADR-plan-multi-session-collaboration.md` 的 D10 增补与判据阶段化/严重度追认（未提交工作树 diff）
> 日期：2026-11-25｜作者：architect（主会话）｜审查者：oracle → critic（只读）
> 审查域：其他审查（ADR 行 —— 按本仓特例裁定 `docs/adr/**` 不属治理面）

## 1. 增补了什么

| 部分 | 内容 |
|---|---|
| **D10** | 「在飞」= `attempts[]` 末条缺 `finished_at`（派生自 `graph.json`）；统一口径「attempt 未闭合 = 在飞；闭合是唯一出口」（`cancel` = 闭合 + 墓碑；`reap` = 闭合 + 回可派）；先登记后 spawn（`claim` / `close` / `reap`）；`claim` 拒已有未闭合 attempt + 阻断码 `duplicate_open_attempt`；`attempt_open` 与 `stale_attempt` **不设违规码**（在飞只在 `ready --json` 的 `in_flight` 暴露）；判活 = `TODO.md` mtime（读时显示，**不授权接管**）；per-topic 短写互斥锁；**fence = 节点级输入投影**（`attempt.input` 快照 ⇒ checker 逐成分 diff 出 `stale_inputs`，final 阻断 / dispatch 不阻断 + `inputs_reviewed` 豁免写点）；**溯源 = 图级结构投影哈希**（`precheck.graph_rev` 要么实装要么删除，不留死字段） |
| **阶段化追认** | D2 增「判据有两维口径」段（阶段 `dispatch`/`final` × 严重度 `阻断`/`info`）；V09 改写为 progress/status 正交口径；V10 降级为「单飞口径 + 并行只做 topic 级 union」；**新增 V22（阶段）/ V23（严重度）**；残留 **#10**（scope-check 按节点归因不可判） |
| 配套 | 选项表 +4 行（两采纳 + 两组否决）；后果章 +3 正面 / +1 负面 / +4 风险；Verification **+V24–V28**；不可机判清单 +2 行（判活探针生产不可用 / fence 覆盖不到的变更）；残留 **+#11**（判据不得早于 `claim` 写入点落地）/ **+#12**（不做自动接管） |

文件 233 → 290 行；`Status` 行标 `Accepted（初版）｜Accepted（D9）｜Proposed（D10 + 阶段化追认，待双审）`。

## 2. 前置咨询与拍板（本增补的来源）

| 轮次 | 主题 | 结论 | 处置 |
|---|---|---|---|
| 用户拍板 | 第 2 项 in-flight | 「在飞」用 attempts 派生 + `claim`/`close` + per-topic 写互斥 + **显式接管**；`attempt_open` 不设码、`duplicate_open_attempt` 阻断、`stale_attempt` 不设码 | 已落 D10 |
| oracle 咨询 | 第 4 项 revision / fence | **目的 A（溯源）与目的 B（fence）一字段两用不成立** ⇒ 拆两个投影：溯源要**图级**（`precheck.graph_rev` = 结构投影 sha256）、fence 要**节点级**（`attempt.input` 快照 + 逐成分 diff）⇒ 兄弟免疫；`stale_inputs` final 阻断 / dispatch 不阻断 + `inputs_reviewed` 写点；图级 fence 被否（兄弟一改即全体误报 ⇒ alert fatigue）；monotonic revision 被否（bump 无机械强制 ⇒ 纪律型字段比死字段更糟） | 已落 D10 |
| oracle 咨询 | 第 7 项 挂死检测 | 宿主 session 探针**生产不可用**（`ctx.session.get` 对死会话恒真，`plugins/role-gate.ts:159-161`）⇒ 独立 heartbeat 方案被否（worker 无法写 `.rddf/state/`；扩白名单会让 N 个 worker 共写一文件）⇒ 改用 `TODO.md` mtime 读时 staleness + 显式接管 | 已落 D10，并登记为不可机判行 |
| 用户确认 | 分组与顺序 | 只再开一次决策会（item 4）；item 5 直接采纳「每会话一文件」；item 6 纯收口 | item 5/6 排入后续批 |

**事实更正（本轮 oracle 指出）**：给 oracle 的 prompt 里我引用了「C2/C10/C11」，但 `tests/plan-topics-dag.test.ts` 的 C 段**只到 C7**，无 C10/C11；与本项实际相关的是 **C2**（done 节点加依赖 ⇒ 派生回落但 attempt 无留痕）、**C6**（BRIEF 变更只有声明哈希才可判）、**C7**（取消三替代 ⇒ 已由 D9 解决）与 `tests/plan-topics.test.ts` 的 `brief_tampered` 两例。ADR 正文未引用这些编号，故无落笔错误。

## 3. oracle 审查

判定：**PASS-WITH-NOTES**（`判定:` 行）。三条 focus 的结论：

- **Q1 在飞 vs D2**：**结论成立，推理有一个洞**。「派发事件没有磁盘真值可分叉」对派发事件本身为真；但 D10 自己在判活条引入了弱磁盘信号（`TODO.md` mtime），而「与 D2 的关系」条却假装它不存在 ⇒ 正确表述应是「派发事件无真值；worker 活性有弱信号，但按设计不作判据（双活体写者风险，残留 #12）」。「随手补 `finished_at` 的枪」**确实存在，但在单写者信任模型内** —— 父是 `graph.json` 唯一写者，能补 `finished_at` 的父也能删整个 topic；台账防的是**健忘/崩溃的父**（压缩后重复派发 = D1/D2 钉住的真实缺陷），不是恶意父；且 `graph.json` 入 git ⇒ 每次闭合都是一行 diff。**真正缺的**是 fake close（worker 仍活、父写 `finished_at`）无机械交叉验证，而不可机判清单只登记了「worker 是否还活着」（判活），**没登记「闭合的真实性」（判死）** —— 同一缺口的两个方向只登记了一个。
- **Q2 闸门够不够**：(a) 僵尸→reap 路径闭合；(b) 双根 claim 是协议级闸门（ADR 已诚实声明非权限强制、与 D7 同威胁级），`duplicate_open_attempt` 作事后 tripwire 够用 —— 但**「陈旧回收」的回收条件未点明**：若仅按 mtime 回收，慢而非死的持有者可被回收 ⇒ 两 claim 同进临界区 ⇒ 双 open attempt；(c) spawn 失败同回合 close，close 再失败退化为 (a) ⇒ 闭合；(d) **续接不打架**（续接不是 claim、不追加 attempt）—— 但两个相邻接缝未规定：① D5 不存 session id ⇒ **父压缩后无法从台账找回子会话**，「同父优先续接」在压缩后不可用；② `reap` **不使旧 subagent session 失效**（`parentID` 校验对同父仍通过）⇒ 同父可复活已 reap 的 worker，而「显式确认」的责任清单未含「不再续接旧 session」。
- **Q3 D9×D10 交叉**：摘边路径已规定；级联路径**隐式**闭合（强制闭合 ⇒ 无 fence 对象）—— 行为正确但未明说。**真洞**：D9「阶段口径」的豁免清单**不含 `stale_inputs`** ⇒ cancel 事务闭合 attempt 后，父给 cancelled 节点的 BRIEF 补一句取消理由（极自然的文档动作）⇒ 投影漂移 ⇒ `final` **永久阻断**，须写 `inputs_reviewed` 才消 —— 正是本轮要根治的「正常状态判红」。deriveStatus 层无未定义组合（在飞×done 是合法瞬态；在飞×cancelled 被 `cancelled_open_attempt` 兜住）—— 缺口在 **checker 豁免层**。
- **跨问题含糊**：`stale_inputs` 只对**已闭合** attempt 定义，而动机要的是「在飞期间改图 ⇒ 产物新旧有信号」⇒ **在飞 attempt 的输入漂移无任何暴露面**；且 `ready --json` 里 `in_flight[].stale`（mtime 活性）与 fence 的 `stale` 列表（漂移）**同名不同义**。

### finding 与处置（逐条）

| # | finding（oracle） | 处置 |
|---|---|---|
| O1（SHOULD_FIX） | **D9 阶段口径的豁免清单不含 `stale_inputs`** ⇒ cancelled 节点补写取消理由 ⇒ 投影漂移 ⇒ `final` 永久阻断（正常状态判红复发） | **已改**：D9 阶段口径条补「cancel 事务在强制闭合 attempt 时把该 attempt 的 `input` 快照**刷新为当前投影**（冻结）⇒ 其后补写取消理由不再造成漂移」+ cancelled 节点**豁免 `stale_inputs`** |
| O2（SHOULD_FIX） | fence 条缺两款：① **在飞 attempt 的输入漂移**无暴露面；② `in_flight[].stale`（mtime 活性）与 fence 的 `stale` 列表**同名不同义** | **已改**：① fence 条补「在飞漂移**只报 info**（父在 worker 在飞时改图是合法操作 ⇒ 阻断会让 dispatch 复现恒红）并在 `ready --json` 顶层 `input_drift[]` 列出（快照就在 attempt 里 ⇒ checker 同法重算）」；② 命名消歧为 `in_flight[].liveness_stale`（活性）vs 顶层 `input_drift[]`（漂移），**V24 同步改写** |
| O3 | 不可机判清单缺「attempt **闭合**的真实性」（fake close 无机械交叉验证）—— 与已登记的「worker 是否还活着」互为正反 | **已改**：不可机判清单新增一行，并写明「台账防的是健忘/崩溃的父，不防恶意父（单写者信任模型内）」+ git diff 留痕 |
| O4 | 判活与接管条缺**压缩后**的恢复路径（D5 不存 session id ⇒ 同父续接在压缩后不可用） | **已改**：判活条补「压缩后退化为『查 `opencode.db` 按 `parent_id` 找回』或 reap-then-claim」 |
| O5 | 「接管须显式确认」的责任清单未含「不再 resume 旧 session」（`reap` 不吊销旧 session 的 `parentID` 校验） | **已改**：判活条补「确认责任含『旧 worker 已死**且不再被 resume**』」 |
| O6 | 写互斥条未点明**陈旧回收以硬超时为上界**（按 mtime 回收 ⇒ 慢持有者被回收 ⇒ 两 claim 同进临界区） | **已改**：写互斥条补「陈旧回收必须以**硬超时**为上界（**不按 mtime 判死** —— 持有者慢 ≠ 死）」 |
| O7 | V25 的并发 claim 用例**易 flaky** | **已改**：V25 验证方式列补「⚠ 实现批注意：该并发用例**易 flaky**，须用确定性编排而非裸并发」 |

### oracle 排除的替代方案（记录，防后人重提）

- **close 要求磁盘完成证据（RESULT 哨兵 / TODO 全勾）才允许闭合**：否决 —— 放弃中的 worker 也必须能 close；close 要求产物会把「中止」逼成「伪造完成」。
- **worker 自证 / 双账**（worker 侧 STARTED 心跳、写域内自标记）：否决 —— session 探针生产不可用 ⇒ 自证无判据可锚；且与 `TODO` 头 `owner_session_id` 协议重复。
- **在飞 attempt 的漂移也进 `stale_inputs` 阻断**：否决 —— 父在 worker 在飞时改图是合法操作 ⇒ 阻断 ⇒ dispatch 恒红（复现本轮要治的病）。
- **为「父恶意补 `finished_at`」加机械防御**：否决 —— 超出单写者信任模型；正确应对是 O3 的清单登记 + git 审计痕迹。

### oracle 的两点说明（调用方须知）

1. **本次审查对象 = ADR 文本 + 其声称的代码事实**（`lib/plan-topics.ts` / `scripts/plan-topic-check.ts` 的未提交 diff 只核对与 ADR 陈述的一致性，**未做实现级逐行审查**）⇒ 代码 diff 的审查结论在**另一份报告**：`.rddf/reviews/plan-topics-criteria-revision.md`（oracle `PASS-WITH-NOTES` → critic `APPROVE`）。
2. **分歧点（不影响判定，影响措辞落点）**：O2(i) 改变了 V24 的 JSON 形状断言范围 ⇒ 已同步改写 V24（实现批尚未开始 ⇒ 零成本）。

## 4. critic 合审

判定：**APPROVE_WITH_CONDITIONS**（`mergeable: yes`｜`scope_exceeded: false`｜**无 BLOCKER**）。四类 BLOCKER 逐项排查均不成立：与 D1–D9 无冲突（D10 与 D1 父唯一写者、D2 在飞不进 `deriveStatus`、D5 不存 session id、D7 长短锁分立且僵尸处置各自规定均相容）；选项表 +4 行且理由具体；未发现二义到「实施方无法判断」；focus Q2 的七项承诺逐条判定为**已决且有判据**或**属实现细节**，无伪决策。

### finding 与处置（逐条）

| # | finding（critic） | 处置 |
|---|---|---|
| S1（SHOULD_FIX） | **`stale_inputs` 的产生矩阵缺完整定义，三处措辞不齐**：① V27 未限定「已闭合 attempt」（focus Q3 的回答：是，需要限定）；② 耦合条「下游在飞 attempt 自动 `stale_inputs`」与「在飞漂移只报 info / `input_drift[]`」**字面冲突**；③ 「dispatch 不阻断」未钉是「dispatch 不产生该码」（phase-gating）还是「产生但 info」（severity 变 phase 的函数 ⇒ 破坏 D2 两维正交） | **已改**：fence 条新增「**产生矩阵（唯一定义）**」子条（仅已闭合 attempt × 仅 `final` 口径；`dispatch` **不产生该码**，并写明「**不是**产生但降级为 info」的理由）；耦合条改为「投影漂移**自动进入 fence**（已闭合 ⇒ `stale_inputs`；仍在飞 ⇒ `input_drift[]`）」；V27 标题限定「（**已闭合 attempt**）」；V28 补「`dispatch` 口径**不产生该码**、两种情形都不阻断」 |
| S2（SHOULD_FIX） | **D9 事务条的枚举未含「刷新 `input` 快照」**（O1 的冻结只写在阶段口径条 ⇒ 按事务条实现会漏掉刷新 ⇒ 「cancelled 节点补写理由 ⇒ final 永久阻断」复现） | **已改**：D9 事务枚举补一步「**把该 attempt 的 `input` 快照刷新为当前投影（冻结，见阶段口径条）**」⇒ 与阶段口径条、V28 末条三处互相咬合 |
| S3（SHOULD_FIX） | **`precheck.graph_rev` 无对应 V 判据**（目的 A 溯源是本次咨询两目的之一 ⇒ 缺验收钩子 ⇒ 实现批漏装无判据可抓） | **已改**：新增 **V29**（`precheck.graph_rev` 被写入且 == 图结构投影 sha256；仅回填缓存时哈希不变） |
| S4（SHOULD_FIX） | **回滚口径节缺 D10 行**（回滚实质已具备，缺的是显式登记） | **已改**：补「D10 增补的回退：同 D9 口径 ⇒ **回退无损**」 |
| N1（NIT） | 两个机制参数来源未钉（硬超时的值住哪、reap「显式确认」的机械形态） | **已改**：写互斥条补「硬超时**具体值属实现细节**（CLI 常量 / 可覆盖 flag，对齐 `lib/role-lease.ts` 的 TTL 模式）」；判活条补「reap 的显式确认形态 = **显式 flag**（如 `--confirm`），**非交互**」 |
| N2 | 焦点判定记录（非缺陷） | 无需落笔 |

### 4.1 复审（第 2 轮，只验 SHOULD_FIX 落笔）

结论：**S1 / S2 / S3 / S4 全部「已闭合」**；N1 两处落笔**无新问题**；`mergeable: yes`｜`scope_exceeded: false`。

复审核验摘录：S1 —— 「产生矩阵」子条与 V24（`input_drift[]` 含在飞漂移、info 不阻断）交叉一致，无新矛盾；S2 —— 事务条 / 阶段口径条 / V28 三处互相咬合，「cancelled 节点补写理由 ⇒ final 永久阻断」的复现路径已封死；S3 —— V29 与 D10 溯源条（投影成分逐一对齐、join 回填零污染）一致；S4 —— 与 D10 schema 条（可选字段 + version 不变）、D9 schema 条（未知键静默忽略）、写互斥条（`*.lock` 命中 `.gitignore`）对齐。

**收口结论**：双审闭合 ⇒ 元数据 Status 由 `Proposed` 转 **`Accepted`（2026-11-25 增补 D10 + 阶段化追认）**；配套登记 `backlog: plan-topics-cancelled-semantics` 保留（立项后回填 AC 映射）；版本史落 `docs/CHANGELOG.md` v2.72。

## 5. 收口自检

| 项 | 结果 |
|---|---|
| 正文行数 | 294（**超 250 目标** ⇒ 按契约自问「是不是设计规格？」：**否** —— D9 / D10 是决策正文而非规格；未拆分的理由：回滚 registry / rollback manifest / prompts 均按路径指向本文件，且拆分收益低于风险 ⇒ 登记为 backlog：再加第三项决策时须把「前置事实」与「实施期补充裁决」拆到 `docs/architecture/plan-topics-topic-model.md`） |
| 四要素 | 元数据 / 决策（D1–D10）/ 选项对比表 / 后果·代价 / Verification（V01–V29 连续）齐备 |
| 表格自检 | 全部表格列数一致（awk 自检无输出）；判据编号 V01–V28 连续（含 V02b / V04b） |
| 与既有决策冲突 | 无（D1–D9 未改；D9 已 Accepted 且与 D10 互补） |
| 被守卫钉死的文件 | 未触碰（回滚清单只钉 `prompts/plan.md` / `docs/SUBAGENT-ORCHESTRATION.md` / `docs/MULTI-AGENT-DESIGN.md` / 配置 / 测试；**未**钉 ADR 本体） |
| 闸门 | `bun test tests/` 1205 pass / 1 skip / 1 fail（唯一 fail = 预存模型名漂移，与本 diff 无关）；`tests/verify_record_discipline.sh` = OK |
| 关联 change | 尚未立项 ⇒ `backlog: plan-topics-cancelled-semantics`（元数据已写；立项后回填 AC 映射） |
| prompt / 回滚清单同步 | 未做（残留 #9）⇒ 归实现批（builder 面：`.rddf/rollback/plan-topics.json` 不在 architect 写集） |
