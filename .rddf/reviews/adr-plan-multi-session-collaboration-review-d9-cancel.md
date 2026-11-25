# 审稿报告：ADR-plan-multi-session-collaboration —— D9 增补（取消语义）

> 对象：`docs/adr/ADR-plan-multi-session-collaboration.md` 的 D9 增补（未提交工作树 diff）
> 日期：2026-11-24｜作者：architect（主会话）｜审查者：oracle → critic（只读）
> 审查域：其他审查（ADR 行 —— 按本仓特例裁定 `docs/adr/**` 不属治理面）

## 1. 增补了什么（一句话）

动态调整 DAG 时父要「砍掉一个分支」，而 `status` / `progress` 只描述「有没有产物」⇒ 取消无处安放。D9 把「取消」定为**声明意图字段** `cancelled?: { by, reason, at? }`（写进 `graph.json`），由 `deriveStatus` 派生第四态 `"cancelled"`；门控 = **block + 强制消解**（`cancelled_dep_active` 不变量）；级联默认拒绝、需显式；「完成后取消」禁止。

配套：选项表 +2 行、后果 ±3 条、V16–V21 六条判据、不可机判 +2 行、残留 #6–#9、元数据（关联 change 登记 `backlog: plan-topics-cancelled-semantics`）、「实施记录」实测表移出正文（过程日志不进 ADR 正文）。

## 2. oracle（先行审查）

判定：**PASS-WITH-NOTES**（`判定:` 行）。三条 focus 的裁决：

- **Q1 声明意图是否破坏 D2**：不破坏。理由：「派生而非自述」的承重性质不是「只从磁盘派生」——`deps` / `owner` 自初版起就是父写进 `graph.json` 的**声明输入**，`deriveStatus` 的 `depsDone` 直接消费 `n.deps`；该性质的真身是「可重算 + 派生优先于缓存 + 分叉即违规」，cancelled 纳入后三条全部存活（V16 / V20 钉住）。派生值退化为「意图的影子」**仅对 cancelled 节点本身**成立（短路使磁盘事实对该节点不可见）——取消是言语行为，本无磁盘真值可对照。
- **Q2 不变量可判性与够用性**：可判且够用（纯函数、O(V+E)）。但**「已 done 下游豁免」是恒空死文字**：cancelled 节点永不派生 done ⇒ 其下游永不派生 done ⇒ 豁免集恒为空。
- **Q3 与 in-flight 的边界**：诚实。D9 未提前承诺 in-flight 能力（残留 #7 已登记「取消中断不了在飞 worker」；`cancelled_open_attempt` 只保证事后可判）。

### finding 与处置（逐条）

| # | finding（oracle） | 处置 |
|---|---|---|
| N1 | **D9 载体条的 schema 声称与实现不符**：`assertSchema` 不拒绝未知键 ⇒ 旧代码**静默忽略** `cancelled` 字段并照常派发；唯一 tripwire 是**缓存 `status="cancelled"`** 撞 `STATUSES` 枚举。**且事务条不含缓存写** ⇒ 取消后稳态是缓存 `pending` vs 派生 `cancelled`（永久 `cache_behind`），该窗口内「响亮报错」不成立 | **已改**：① 载体条改写为「未知键静默忽略；唯一 tripwire 是缓存 `status="cancelled"` 撞枚举 ⇒ 故缓存写必须同事务」；② 事务条改为四步：**补 attempt `finished_at` → 置 `cancelled` 字段 → 回填缓存 `status="cancelled"` → 消解下游** |
| N2 | 门控条「已 done 下游豁免」恒空，且未声明 done 指派生还是缓存 | **已改**：删除豁免条款，并写明「cancelled 永不派生 done ⇒ 其下游永远不可能派生 done ⇒ 豁免集恒空」；同时钉死「判定中的 done 一律指**派生值**，不指缓存值（缓存口径由 `cache_ahead` 兜住）」 |
| N3 | 阶段口径条的机制描述**不覆盖 final 口径**（`final` 下 `briefRequired` / 交付物检查是全量路径，集合减法不成立）⇒ V21 超出该机制描述 | **已改**：改为「cancelled 节点**豁免** `missing_brief` / `missing_deliverable` / `due` / `finished` 四类判定 —— **不按集合减法实现**（final 走全量路径）⇒ 直接跳过这四类判定」 |
| N4 | V18 的 multiplicity 未钉（多活跃下游时「恰好一条」有歧义） | **已改**：钉为「对**该取消节点**报恰好一条，并在同一条里点名**全部**活跃下游（不是每条边一条）」 |
| N5 | 三处审计缺口：attempt `finished_at` 的读法、「完成后取消」的口径限定、取消判定与原子写之间的 TOCTOU | **已改**：① 「已知不可机判清单」新增一行「取消节点上的 attempt `finished_at` 读作**废弃闭环时间**（非正常完工）—— 已知审计缺口」；② 「禁止完成后取消」条补「口径是**派生值**，不指缓存值」+「执行上只能走 `cancel` CLI，由 CLI 硬拒」；③ 事务条补 TOCTOU 登记（取消判定与原子写之间 worker 可能落盘 ⇒ 产物按审计痕迹处理） |

### oracle 排除的替代方案（记录，防后人重提）

- **正交字段**（`cancelled` 只影响门控、不产生第四态）：否决 —— 特判会散布到 `dispatchableNodes` / due / finished / 缓存比较 / join 判据各处，`Status` 单一真源破裂，净复杂度高于第四态。
- **`CANCELLED.md` 磁盘哨兵**：维持 ADR 否决，且证据更强 —— 哨兵落在 worker **合法**写域内（`nodes/<id>/` 是子自留地），伪造零协议代价、事后核对不可见；反之 worker 写 `graph.json` 越出 node 目录前缀会被 V10 `scope-check` 截住 ⇒ ADR「伪造最隐蔽」的排序成立。
- **立即支持 un-cancel / in-flight 中断**：同意 defer（残留 #6 / #7）。

## 3. critic（合审）

判定：**APPROVE_WITH_CONDITIONS**（`mergeable: yes`｜`scope_exceeded: false`｜**无 BLOCKER**）。四类 BLOCKER 逐一排查均不成立：与 D1–D8 无冲突（D9 为增补且元数据如实标 Proposed）；备选方案与取舍理由齐备（选项表含四个否决方案的理由）；文档内无二义（D9 显式声明短路优先级，覆盖 D2 旧公式的字面射程）；无伪决策（CLI 未建但登记为 backlog + 残留 #9，「完成后取消」的策略属性已在不可机判清单如实登记）。

核对要点（critic 自查）：D1 的 `graph.json` 整文件归父写 ⇒ `cancelled` 写者归属已被覆盖，无需新增写者行；D2 的「声明意图 vs 磁盘事实」二分与初版 `deps`/`owner` 消费方式同族，不破坏「派生而非自述」（可重算 + 派生优先 + 分叉即违规三条均存活）；D5 的 `cancelled.by` 只记角色不记 session id，与「不存 session id / 越权无法归因」口径一致；D6 的取消留痕入 git 唯一载体；D8 的关闭清单不含 graph.json schema / checker 判据面 ⇒ D9 不在其射程内；闭集兼容（`assertSchema` 不枚举键集合、只逐字段撞 `STATUSES`）成立；V16–V21 逐条可写成断言。

### finding 与处置（逐条）

| # | finding（critic） | 处置 |
|---|---|---|
| C1（SHOULD_FIX） | **D9 载体条未声明 `cancelled` 自身的 schema 校验面**：畸形 `cancelled`（字符串 / 数组 / `by` 非字符串）会落进「未知键静默忽略」通道被吞掉，且 V19 的 `cancelled_unattributed` 在畸形输入下语义未定义（`by` 无从读起） | **已改**：载体条补「`cancelled` 自身的**形状必须纳入逐字段校验**（`by`/`reason`/`at` 的类型）⇒ 畸形 ⇒ `schema_invalid`，**不得**落进未知键静默通道（否则 V19 无从读起）」 |
| C2（SHOULD_FIX） | **回滚口径只覆盖初版产物**，未提 D9 增补物的回退（BLOCKER 类型二要求决策有回滚路径） | **已改**：回滚口径补「**D9 增补的回退**：还原本增补 + 实现批回退 schema 扩展即可 —— `cancelled` 是可选字段、旧数据永不派生 cancelled ⇒ **回退无损**（无运行态产物需回滚）」 |
| C3（NIT） | D1 表内容列与 D2 节点字段枚举未列入 `cancelled`（读者需自行并集 D9） | **已改**：D2 节点字段行补 `cancelled?`（取消意图，见 D9） |
| C4（NIT） | D2 的 `status = done ⟺ …` 公式未加 `¬cancelled` 前置，靠 D9 反向覆盖 | **已改**：D2 该行补「（`¬cancelled` 前置见 D9 短路）」 |
| C5（NIT） | 「分两次写会在中间窗口亮红」措辞 overstated：无活跃下游时中间窗口对新代码仅 `cache_behind`（info，exit 0），对旧代码静默；仅当存在未消解活跃下游时才撞阻断码 | **已改**：改为「中间窗口**留下分叉**：无活跃下游时仅 `cache_behind`（info，exit 0）；**有未消解活跃下游时**才撞阻断码 `cancelled_dep_active`」 |
| C6（NIT） | 元数据 Status 行承载初版双审裁决结论 = 版本史入 Status 行的轻度膨胀 | **已改**：Status 行去掉初版裁决摘要，只留两段状态 + 指向 CHANGELOG / 审稿报告 |

critic 的验证建议（转实现批，不在本轮）：① 实现批落地后由 verifier 逐条执行 V16–V21；② 构造畸形 `cancelled` fixture（字符串 / 数组 / `by: 123`）断言处置口径（`schema_invalid`）；③ 全量回归 + 既有 `plan-topics*.test.ts` fixture（无 `cancelled` 字段）零改动通过（V21 前半）。

### 3.1 复审（第 2 轮，只验 SHOULD_FIX 落笔）

结论：**C1 / C2 已闭合**；C3–C6 落笔**无新问题**；`mergeable: yes`｜`scope_exceeded: false`。

| # | 判定 | 依据（复审自述） |
|---|---|---|
| C1 | **已闭合** | `:118` 载体条已含「`cancelled` 自身的形状必须纳入逐字段校验 ⇒ 畸形 ⇒ `schema_invalid`，不得落进未知键静默通道」。核验：① 引用的 V19 真实存在且语义对得上（`:203`）；② 与同条 ⚠ 注（旧代码射程）不矛盾；③ 分层自洽（形状畸形 ⇒ `schema_invalid`；形状合法但归属/理由缺失 ⇒ `cancelled_unattributed`） |
| C2 | **已闭合** | `:173` 回滚口径已补「D9 增补的回退 = 还原本增补 + 实现批回退 schema 扩展；`cancelled` 可选 ⇒ 回退无损」，与 `:118`「旧数据无字段 ⇒ 永不派生 cancelled」及 V21（`:205`）三方互洽 |
| C3–C6 | 无新问题 | C3（`:55` 节点字段列 `cancelled?`）、C4（`:56` `¬cancelled` 前置）与 D9 派生条（`:119` 短路优先）一致；C5（`:126` 分情形表述）与缓存条（`:125`）+ V20（`:204`）口径一致；C6（`:7` Status 行去膨胀）诚实 |
| — | 无新问题 | 交叉引用（`:118` → `:126`）一致；未发现落笔引入的自相矛盾或把未决写成已决 |

**收口结论**：双审闭合 ⇒ 元数据 Status 由 `Proposed` 转 **`Accepted`（2026-11-24 增补 D9）**；配套登记 `backlog: plan-topics-cancelled-semantics` 保留（change 立项后回填 AC 映射）；版本史落 `docs/CHANGELOG.md` v2.71。


## 4. 收口自检

| 项 | 结果 |
|---|---|
| 正文行数 | 248（≤ 250 目标；「实施记录」实测表已移出正文） |
| 必备四要素 | 元数据 / 决策（含 D9）/ 选项对比表（+2 行）/ 后果·代价（±3 条）/ Verification（+V16–V21）齐备 |
| 与既有决策冲突 | 无（D1–D8 未改；D2 仅增「派生输入分两类」一句） |
| 被守卫钉死的文件 | 未触碰（回滚清单只钉 `prompts/plan.md` / `docs/SUBAGENT-ORCHESTRATION.md` / `docs/MULTI-AGENT-DESIGN.md` / 配置 / 测试；**未**钉 ADR 本体） |
| 闸门 | `bun test tests/` 1205 pass / 1 skip / 1 fail（唯一 fail = 预存模型名漂移，与本 diff 无关） |
| 关联 change | 尚未立项 ⇒ 登记 `backlog: plan-topics-cancelled-semantics`（元数据已写；立项后回填 AC 映射） |
| prompt / 回滚清单同步 | 未做（残留 #9）⇒ 归实现批（builder 面：`.rddf/rollback/plan-topics.json` 不在 architect 写集） |
