# 审稿报告：ADR-plan-multi-session-collaboration —— D11 增补（收敛判据）

> 对象：`docs/adr/ADR-plan-multi-session-collaboration.md` 的 D11 增补 + 配套登记（选项表 +4 行 / 后果 ±3 条 / V30–V36 / 不可机判 +1 行 / 残留 #13 / 元数据 Proposed）（未提交工作树 diff）
> 日期：2026-11-25｜作者：architect（主会话）｜审查者：oracle → critic（只读）
> 审查域：其他审查（ADR 行 —— 按本仓特例裁定 `docs/adr/**` 不属治理面）

## 1. 增补了什么（一句话）

父根会话今天要回答「这个 topic 干完了吗」必须自己组合四个条件（终态 / 在飞 / 违规 / 可派），而 `check --json` 只吐 `{ok, violations}` ⇒ **不可机判**。D11 把这四类事实聚合成一个可读答案：`converged`（纯派生）⇔ 零阻断违规 ∧ 全节点派生 `status` ∈ {done, cancelled} ∧ 无在飞；形状 = 单一布尔 + 六桶明细 + 派生的 `needs_review` 布尔；**锁不进判据**；**相对集 = 全部节点**（不引入目标子集载体）；**不扩退出码 / 不并入 `ready` / 不落盘**；且被明确定位为**调度信号**（「还有没有未完成的活」）而非交付信号（残留 #13）。

## 2. 前置咨询与拍板

| 轮次 | 主题 | 结论 | 处置 |
|---|---|---|---|
| oracle 咨询 | 第 3 项 converged 判据 | 采纳「全部节点口径 + `check --json` 增 `converged` 布尔 + 六桶明细」；**不**采纳目标子集口径 / 多状态枚举 / 扩 exit 4 / 新子命令 / 并入 `ready` / 落盘 `converged_at`；**承认父能批量标 cancelled 使 converged=true** ⇒ 据此把判据**降格为调度信号** + `cancelled` 桶逐条列 `{id, reason, at}` | 已落 D11（选项表含 4 行否决，防重开） |
| oracle 咨询 | — | **事实校正（我接受）**：D9 / D10 目前**只存在于 ADR、代码未落地** ⇒ cancelled 终态豁免是 converged 的**前置依赖** ⇒ D9 与 D11 必须同批 | 已落 D11「落地顺序」条 |

## 3. oracle 审查

判定：**PASS-WITH-NOTES**（`判定:` 行）。核心结论：D11 的三子句**自洽、无永久卡死面** ——

- **(a) done + 末条 attempt 未闭合**（父死于 join 前）⇒ 按 D10 定义算在飞 ⇒ 子句③假 ⇒ `converged=false`；**不是永久卡死**（出口 = 同父续接后 `close`，或新根 `reap`/`close`）且**不产生违规码**（D10「在飞不是违规」）⇒ 父看到「exit 0 但未收敛」（语义正确：父确实还欠一个 join 动作）。
- **(b) cancelled + attempt 未闭合** ⇒ `cancelled_open_attempt` 阻断 ⇒ false；正常路径 cancel 事务原子补 `finished_at` ⇒ 不撞码（该码只兜手写绕过 / 事故）。
- **(c) cancelled 下游未消解** ⇒ `cancelled_dep_active` 阻断 ⇒ false；D9 消解在 cancel 事务内、默认拒绝未指定处置 ⇒ 事务完成后该码不存在。
- 边界自检：「全图墓碑」（全 cancelled）⇒ 三子句全真 ⇒ `converged=true`（与「可操纵性」条一致）；空图 ⇒ `empty_topic` 阻断 ⇒ false（既有语义自动继承，无空集漏洞）。
- **Q2 phase 口径（本轮最实质发现）**：`--phase` 改变违规集合 ⇒ 若 `converged` 跟随 phase，D10 落地后同一时刻两口径可能给出**两个答案**（dispatch 下 true / final 下 false）⇒ **裁决：恒 final**。
- **Q3 相对集 = 全集**：行为扭曲风险**方向相反** —— 藏节点的代价是脱离全部协议保护（无 BRIEF/TODO/RESULT、D6 不可重建、V10 判越界、父压缩后丢失）⇒ 全集口径**惩罚藏活、奖励摆上台面** ⇒ 可接受。
- **Q4 可操纵性**：缓解强度与威胁模型匹配 —— 「同屏列出」防**无意操纵**（压缩后失忆），防**有意操纵**无效（有意父本就能删整个 topic，同威胁级已登记）；**真正的取消成本来自两条既有约束**（`cancelled_unattributed` 强制编理由 + `cancelled_dep_active` 强制连带消解 ⇒ 爆炸半径在 diff 里强制展开）⇒ **不需要新机制**。

### finding 与处置（逐条）

| # | finding（oracle） | 处置 |
|---|---|---|
| F1（必须） | **phase 口径歧义**：`converged` 跟不跟 `--phase` 未写死 ⇒ D10 落地后同刻两答案 ⇒ 父读哪个成为未定义行为 | **已改**：定义条补「**口径恒定**：`converged` 与 `summary` **恒按 `final` 口径派生**；`--phase` 只作用于 `violations` 列表与退出码 ⇒ dispatch 下可出现 **`ok=true ∧ converged=false`**（健康但未完）—— 两者语义不同、不矛盾，父读 `converged`（不是 `ok`）」 |
| F2 | **文本自相矛盾**：定义条说「漂移只进明细」，但载体条的 summary 六桶**不含 `input_drift`** ⇒ 「明细」落空；父做「等还是 reap」决策需要漂移信息，若只能跑 `ready --json` 则「一条命令」承诺打折 | **已改**（采 oracle 推荐项）：summary 桶增 **`input_drift`**（与 `in_flight` 并列）⇒ 一条命令给出全部明细，父不必再跑 `ready --json` |
| F3 | **落地硬约束漏项**：E1 **逐键钉死** payload 里没有 `converged` ⇒ D11 落地必红 E1 ⇒ 该断言须同批反转（否则实现批撞「无关」的红） | **已改**：落地顺序条补「**既有钉死点同批反转**：`tests/plan-topics-dag.test.ts` 的 E1 逐键钉死 payload 里没有 `converged` ⇒ D11 落地必红 E1 ⇒ 该断言须**同批**按新语义改写」 |
| F4 | **判据覆盖缺口**：V31 只测「非 done 节点带未闭合 attempt」；Q1(a) 的「**done + 未闭合 attempt** ⇒ `converged=false` 且 exit 0」无对应判据（父死恢复路径上唯一「绿着但不收敛」的形态） | **已改**：新增 **V36**（`converged === false` ∧ `in_flight` 含该节点 ∧ **exit 0** ⇒ 出口是 `close` / `reap` ⇒ 闭合后 ②③ 恢复 ⇒ `converged === true`） |
| F5 | 「`ready` 非空」被列为未收敛侧，但三子句无显式 ready 条件（逻辑上冗余：ready 非空 ⇒ ②必假）⇒ 易被误读为第四条件 | **已改**：逐类归属条补「⚠ 其中「`ready` 非空」**只是明细导航**（逻辑上冗余：ready 非空 ⇒ ②必假），**不是第四个子句**」 |

### oracle 排除的替代方案（记录，防后人重提）

- **`converged` 跟随 `--phase`**：D10 落地后同刻两答案 ⇒ 否。
- **dispatch 口径下不输出 `converged`**：字段集随 phase 变 ⇒ 违反「字段集成为契约」，且让 E1 式形状断言复杂化 ⇒ 否。
- **目标子集 / scope 载体**、**多状态枚举**：ADR 选项表已否决，理由成立 ⇒ 维持。
- **为防操纵加码新机制**（如取消需二次确认）：`cancelled_unattributed` + `cancelled_dep_active` 已提供取消成本；有意父在单写者信任模型内本就不可防 ⇒ 不加码。
- **Q3 的「藏节点」扭曲**：评估为可接受（判据方向反而奖励显式化）⇒ 接受。

### oracle 的两处事实校正（记录）

1. 我在咨询 prompt 中引用的「done 节点被 `status !== "done"` 滤掉」**非 D10 原文**，实现依据是 `lib/plan-topics.ts:478`；ADR 正文无此误引 ⇒ 无落笔错误。
2. 已确认 D9 / D10 均未落地 ⇒ D11 的「同批」硬约束是**真实前置**，不是修辞。

## 4. critic 合审

判定：**APPROVE_WITH_CONDITIONS**（`mergeable: yes`｜`scope_exceeded: false`｜**无 BLOCKER**）。三个叠加面逐一推导均自洽：① D9 的 cancelled 短路使派生为**单值函数**，「既 done 又 cancelled」的组合不存在（缓存写 done + 标志 cancelled 由 `cache_ahead` 兜住）；② 「done + 未闭合 attempt」的归属已由 V36 钉死（`converged=false` + `close`/`reap` 出口），无卡死面；③ D11 恒按 final 派生是**在 D2 既有维度上选定截面**（非新增维度），dispatch 下 `ok=true ∧ converged=false` 已显式声明为刻意语义。「未决写成已决」排查通过 —— 交付信号的收窄如实登记于不可机判清单 + 残留 #13，元数据 Status 行如实标注 Proposed。

### finding 与处置（逐条）

| # | finding（critic） | 处置 |
|---|---|---|
| S1 | **「dispatch 下 `ok=true ∧ converged=false`」是定义条显式声明的刻意不一致，但 V30–V36 无一条以 `--phase dispatch` 断言它** ⇒ 实现批看到 ok/converged 一真一假并排，**极易当成 bug 顺手「统一」**（让 converged 跟随 phase） | **已改**：V31 增断言「**同一场景在 `--phase dispatch` 下 ⇒ `payload.ok === true ∧ payload.converged === false`**（**刻意的不一致**，见定义条 —— 断言它以防实现批把它当 bug「统一」掉）」 |
| S2 | **空 topic**（CLI 既有 `--allow-empty` 支持）下子句②③ vacuously true ⇒ `converged=true`，「刚建 topic 未拆节点」的父会读到「已收敛」；语义归属未钉 | **已改**：定义条补「**空 topic**：`--allow-empty` 是显式 opt-in ⇒ 此时无 `empty_topic` 阻断、②③ vacuously true ⇒ `converged === true`（「没有活要干」）；**未拆节点的新 topic 应用默认口径**（不加 `--allow-empty`）⇒ `empty_topic` 阻断 ⇒ `converged === false`」 |
| S3 | **回滚口径章缺 D11 段**（D9 / D10 各有回退段；D11 纯派生、零 schema、零落盘 ⇒ 回退显然无损，但章的完备性要求一句话登记） | **已改**：回滚口径补「**D11 增补的回退**：**纯派生、零 schema、零落盘**（`converged` / `summary` 只活在 `check` 输出里）⇒ **回退无损**（无运行态产物、无需数据迁移）」 |
| （验证建议） | V30 顺手断言 `converged=true` ⇒ `summary` 其余五桶全空 | **已改**：V30 增「且 `summary` 其余**六**桶（`cancelled` / `in_flight` / `input_drift` / `ready` / `blocking` / `needs_review`）**全空**」 |

### 4.1 复审（第 2 轮，只验落笔）

结论：**S1 / S2 / S3 全部「已闭合」**；`mergeable: yes`｜`scope_exceeded: false`；本轮未发现新的自相矛盾、未把未决写成已决。

复审核验摘录：S1 —— 与定义条表述互锁，且两个 V31 场景下 dispatch 均不产生阻断违规（在飞不设码、ready 非空非违规）⇒ `ok=true` 可达成，断言本身可满足；S2 —— 所引 `--allow-empty` 真实存在（`scripts/plan-topic-check.ts:63`、`lib/plan-topics.ts:508`），且与「任一阻断违规码 ⇒ 未收敛侧」的逐类归属条自洽；S3 —— 与「不落盘」决策条一致（`cancelled` / `input` 属 D9 / D10 字段，各有回退段，不在本句射程内）。

**复审顺带逮到的一处计数漂移（本轮已修）**：V30 的「其余五桶」标签下实际列了**六个**名字（`input_drift` 是 oracle F2 补进 summary 后新增的）⇒ 已改为「其余**六**桶」；同源漂移另有两处（后果章「六桶明细」「`summary` 六桶」）⇒ 一并改为**七桶**（`done` / `cancelled` / `in_flight` / `input_drift` / `ready` / `blocking` / `needs_review`）。

**收口结论**：双审闭合 ⇒ 元数据 Status 由 `Proposed` 转 **`Accepted`（2026-11-25 增补 D11）**；配套登记 `backlog: plan-topics-cancelled-semantics` 保留（立项后回填 AC 映射）；版本史落 `docs/CHANGELOG.md` v2.74。

## 5. 收口自检

| 项 | 结果 |
|---|---|
| 正文行数 | 325（**超 250 目标** ⇒ 按契约自问「是不是设计规格？」：**否** —— D9/D10/D11 是决策正文而非规格；未拆分的理由与 backlog 见 D10 报告 §5） |
| 四要素 | 元数据 / 决策（D1–D11）/ 选项对比表 / 后果·代价 / Verification（V01–V36 连续，含 V02b / V04b）齐备 |
| 表格自检 | 全部表格列数一致（awk 自检无输出）；无转义竖线；无乱码字符 |
| 与既有决策冲突 | 无（D1–D10 未改；D11 与 D9/D10 的耦合已在正文逐条写明） |
| 闸门 | `bun test tests/` 1205 pass / 1 skip / 1 fail（唯一 fail = 预存模型名漂移，与本 diff 无关）；`bash scripts/check-upstream-anchors.sh` = 30/30 全绿 |
| 关联 change | 尚未立项 ⇒ `backlog: plan-topics-cancelled-semantics`（立项后回填 AC 映射） |
| prompt / 回滚清单同步 | 未做（残留 #9）⇒ 归实现批（builder 面：`.rddf/rollback/plan-topics.json` 不在 architect 写集） |
