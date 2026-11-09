# metis 审查修订记录（planner）

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 审查者 | metis（planner 的固定审查者；本 improvement 总计 1 轮预算） |
| 被审对象 | 2 份 improvement + 2 份 proposal（canonical-root-normalization / front-multi-backend） |
| metis 结论 | **7 BLOCKER + 8 QUALITY + 2 NICE** |
| 本轮处置 | **6 BLOCKER + 全部 QUALITY/NICE 已闭合**；**1 BLOCKER（ADR D3 论证错误）需 architect** → 已 halt 交用户 |
| 复核状态 | 修订后自洽性已用脚本校验（AC 编号连续 / 映射覆盖 / 引用无悬空） |

## 1. 已核实为真的 BLOCKER（逐条取证）

| # | metis 指控 | 取证 | 处置 |
|---|---|---|---|
| 1 | 两份 improvement 的「最小可验收集合」AC 编号**整体错位** | 脚本对照：improvement 1 说 AC5=resume（proposal 实际 AC5=非 git）；improvement 2 说 AC3=立即返回（实际 AC3=cancel deny）、AC5=ledger 行（实际 AC5=立即返回）、AC11=回归（实际 AC11=cursor 续扫） | ✅ 两份 improvement 的该段按 proposal 最终编号重写，并加「以 proposal 的 `## 验收标准` 为唯一编号源」 |
| 2 | goal_key 无契约与落盘（`validateBrief` 无该字段，AC15/16/18 无实现基础） | `grep goal/slug/intent lib/delegate-core.ts` → 只有自由文本 `goal`，无 goal_key/slug/intent | ✅ 新增 **AC15**（输入 + pair 落盘 + 存量回填）、拆 **AC16/AC17/AC18** |
| 3 | AC4 判据不充分且与 AC13 互斥（ledger 行数不变证明不了没投递；AC13 又要补写 ledger） | 读过 AC4/AC13 原文；且 ledger 由父插件在结束时写，prompt 投递不立即产生行 | ✅ AC4 改为「`session.context` 消息条数与最后消息 id + `time.updated` 不变」；AC13 补幂等（同一次消失只补一行）+ `outcome:"vanished"` |
| 4 | E2E 用例不存在（bats 只有 L2-1..L2-15，AC10–AC13 不可判定） | 实跑 `grep -oE "L2-[0-9]+"` 于外部仓库 → 确为 1–15 | ✅ 证据规则 2 写明「需新增 L2-16..，实施方提交 commit + 记录 SHA」；AC10–AC13 全部补单测降级证据 |
| 5 | AC24 原子性无法用「跑两次」证明；`withLock` 是同步签名而 `create` 是 await | 读过 `withLock(lockDir, fn: () => void)` 签名 + `canonicalRoot` 调用点 | ✅ AC26 写明三条：检查与登记同临界区、**顺序必须定死**（create → 锁内 check+register 或改 withLock 支持 async）、拒绝时不得残留 session |
| 6 | p1 的存量覆盖论证不成立（存量 pair.json 物理在 workRoot，`lookupPair(stateRoot)` 在校验前就已未登记） | 读过 `lookupPair(root, ...)` → `path.join(root, ".rddf","state","pair.json")`；归一后 root=stateRoot | ⚠️ **需 architect** —— proposal 已按「stateRoot 主查 + workRoot 读回退」写死 AC8，但 **ADR D3 正文仍写旧论证**（见 §3） |
| 7 | p1 必须覆盖 `prompts/build.md:195,199`（只写 common-dir 归一，无 superproject 优先） | 读过该段 → 确认无 superproject 规则 | ✅ 新增 **AC11/AC12**（build.md 同步 + 两侧口径同构）；impact 标注 prompts/build.md 的**归属待确认**（治理面文件，architect 归属） |

## 2. 已闭合的 QUALITY / NICE

| metis 项 | 处置 |
|---|---|
| AC1 证据不匹配（debug agents 只证明权限矩阵，不证明工具注册） | ✅ AC1 拆成「矩阵有规则 **+** front 会话真实调用」 |
| AC2 降级证据语义相反（"无 allow"在缺省策略下仍是 allow） | ✅ 改为「全局 permission 块存在三条显式 `deny` + 仅 front allow」 |
| AC25（scope 重叠）是死代码（互斥先拦） | ✅ AC27 写明与互斥的优先级，并明确「本批若不实现 worktree 隔离，须标为**预检**语义」，风险章加「实施前必须二选一确认」 |
| roster 快路径无 AC 支撑 | ✅ **移出本批 scope**（Out of Scope 2），AC14 补「不保证条目级不丢」 |
| AC7 场景自相矛盾（dispatch 不 wait 后端） | ✅ 改为「fake ctx 的 create/prompt/update 永不 settle → 超时返回 + 清理」 |
| Impact 列的文档一半没 AC | ✅ 补 AC34（prompt）/AC35（架构文档）/AC36（ledger 消费者）；usage/CHANGELOG 明确标「无 AC，顺手同步」 |
| 映射表 23–28 重复表述 | ✅ 合并到同源 AC（不再单列 6 行） |
| D1 表里「按 id 查单个」「cancel remove」无 AC | ✅ 明确移出 scope（Out of Scope 9/10），AC37 判「按 id 查不存在」 |
| AC18 是「文档已写」型 AC | ✅ 并入 AC20（同 slug 异目标文档化） |
| p2 目标行写「Verification 1–22」与表不符 | ✅ 改为 1–28 |
| 缺并发上限 / stalled 阈值 / sessions 输出 schema | ✅ 新增 AC31（并发上限）、AC25（stalled 阈值）、AC29（输出 schema） |
| 缺 ledger 消费者同步 AC | ✅ 新增 AC36，并裁定 `dispatched`/`dispatch_failed` 为**独立 `event` 字段**（不污染 outcome 6 值枚举）、`vanished` 为 outcome 新值 |
| AC15 与 ADR risk 章矛盾（同 goal_key 重复 resume） | ✅ 拆 AC17 三层：本 front+空闲 → 放行；他 front 或在跑 → 拒 |
| AC26 墓碑条件不清（no-op vs 永久墓碑） | ✅ AC28：仅 `interrupted:true` 才墓碑；`false` 为纯 no-op |
| 权限文件名不一致（`opencode.jsonc` vs `.opencode-go`） | ✅ 证据规则 5 写明符号链接关系 + `readlink -f` 解析 |
| p1 AC6 未列调用点清单 | ✅ AC6 列为四组逐点（状态落盘 / git status / scope 基准 / brief+summary 的 project_root） |
| p1 AC7 无 mock 注入点 | ✅ 新增 AC14（`canonicalRoot` 接受可选 `gitRunner`），证据规则 6 禁 `mock.module` |
| knowledge session 与互斥/上限关系未定 | ✅ 新增 AC32 |
| 缺 dispatch 写入顺序与失败语义 | ✅ 新增 AC30（create → pair → ledger → metadata → prompt + 每步失败清理与留痕） |
| 缺「终态补记」判据（正常结束但未被观测） | ✅ 部分并入 AC13（vanished）+ AC30（dispatch_failed）；**AC13 只覆盖"外部删除"**，正常结束但从未观测的补记仍在 D2.2 语义下，未单列 AC（记为本 proposal 的已知留白，见 §4） |

## 3. ⚠️ 需 architect 的项（本轮的 halt 点）

**BLOCKER 6 —— ADR-canonical-root-normalization D3 的论证错误**

| 项 | 内容 |
|---|---|
| ADR 现文本 | 「resume 校验必须同时接受两种历史值……**这不是妥协，是必要的：存量 pair.json 的错误值无法批量修正**」 |
| 实际事实 | 存量 worktree 场景下，旧代码把 `pair.json` 写在 **worktree 副本**的 `.rddf/state/`。新代码 `lookupPair(stateRoot)` 读主仓路径，**那条记录根本不在那里** —— 在比较 `canonical_root` 之前就已"未登记"。**双值接受单独不足**，还必须**读回退**（stateRoot 主查 → workRoot 回退） |
| 影响 | 若只改 ADR 提到的双值接受，存量用户的 worktree 后端会全部失联，而 ADR 声称"已覆盖" |
| 本 proposal 的处置 | AC8 已按**修正后的语义**写死（读回退 + 双值接受），并在映射表下加了 ⚠️ 说明与风险章列出"ADR 未补正就实施会冲突" |
| 需要 architect 做 | 修订 `docs/adr/ADR-canonical-root-normalization.md` D3：把「读回退」写进决策，并修正"双值接受已覆盖存量"的论证 |

## 4. 本轮新增的已知留白（如实登记，未静默省略）

1. **正常结束但从未被观测的后端，其终态补记**：AC13 只覆盖"外部删除"（→ `vanished`）。后端正常跑完、但 front 从未查询 ⇒ ledger 缺终态行。ADR D2.2 的"查询即 reconcile"覆盖了"查询时补记"，但**"从不查询"的兜底（开场 reconcile）没有 AC**。→ 本批不新增 AC，理由是它属"产品承诺边界"而非可实现判据（front 是否有开场扫描是 prompt 行为，AC 只能判文本）。已在 ADR 风险章与 proposal 风险章披露。
2. **`docs/front-delegate-usage.md` / `docs/CHANGELOG.md` 的同步无 AC**：标为"顺手同步"，不构成本批 AC 失败。
3. **`sessions` 按 id 查单个 / `cancel` 的 remove**：明确移出 scope。

## 5. 自洽性校验（修订后）

| 校验项 | canonical-root-normalization | front-multi-backend |
|---|---|---|
| AC 编号连续 | ✅ 1–18 | ✅ 1–38 |
| AC 无重复 | ✅ | ✅ |
| 映射覆盖 ADR Verification | ✅ 1–12 | ✅ 1–28 |
| ADR 元数据区间 == 实际 | ✅ Verification 1–12 → AC1–18 | ✅ Verification 1–28 → AC1–38 |
| improvement 引用的 AC 均存在且**语义对得上** | ✅ | ✅ |
| proposal 正文「见 ACxx」无悬空 | ✅ | ✅ |
| ADR 与 proposal 的判据措辞无冲突 | ✅ | ✅（AC4 观测面判据、AC7 超时场景已对齐） |

> 校验脚本：`/tmp/opencode/probe/check_refs.py`（5 项检查：AC 连续 / 映射覆盖 / ADR 元数据区间 / improvement 引用**语义抽样** / 「见 ACxx」悬空）。
>
> ⚠️ **上一版脚本 `check_acs.py` 的盲区**（metis 指出）：它只做数值连续与覆盖，**查不出"引用指向存在的 AC 但语义错了"**。故本轮补了 `check_refs.py` 的语义抽样（从 improvement 的标签里取关键词，断言它出现在 proposal 对应 AC 的描述里）。

## 6. metis 第二轮复核（闭合确认）

**结论：REJECT** —— BLOCKER 1 未闭合。

| 项 | metis 判定 | 根因 | 本轮处置 |
|---|---|---|---|
| BLOCKER 1 | **未闭合** | 我只加了「以 proposal 为唯一编号源」这句话，**没有真正重写编号列表** —— 这是仪式性修改，读者仍会照错误编号去查 | ✅ 真正重写：improvement 2 的 `AC15→AC16`、`AC19→AC21`、`AC21→AC23`、`AC24→AC26`、`AC26→AC28`、`AC27→AC33`（含否决条件里的）；`AC36/37/38→AC34/35/36`；improvement 1 的 `AC11/AC12→AC15/AC16` |
| BLOCKER 2–7 | 闭合 | — | — |
| 新问题 1 | proposal:32 的 `AC28` 应为 `AC38` | 重编号时的漏改 | ✅ |
| 新问题 2 | proposal:58 的「见 AC27」应为 `AC36` | 同上 | ✅ |
| 新问题 3 | front ADR:12 元数据 `AC1–AC30` 过期 | 修订后未同步 | ✅ 改为 AC1–AC38 |
| 新问题 4 | canonical ADR:12 元数据 `AC1–AC16` 过期 | 同上 | ✅ 改为 AC1–AC18 |
| 新问题 5 | canonical proposal:19「Verification 1–9」过期 | 同上 | ✅ 改为 1–12 |
| 新问题 6 | front ADR:206 Verification 6 仍写「构造永不 settle 的后端」与 AC7 矛盾 | ADR 未随 proposal 修订同步 | ✅ 改为「构造 create/prompt/update 永不 settle」 |
| 新问题 7 | front ADR:211 Verification 11 仍以 ledger 行数为判据与 AC4 矛盾 | 同上 | ✅ 改为 context 快照 + time.updated |

**教训（记录，避免复发）**：`脚本全绿 ≠ 可放行`。数值连续性/覆盖只是必要条件；**引用语义、ADR 元数据区间、跨文档措辞一致性**必须另行校验——本轮的 `check_refs.py` 就是补这个盲区。

---

# 第三轮：2026-11-09 proposal 同步 ADR 改写（front-multi-backend）

**触发**：ADR `ADR-front-multi-backend` 于 2026-11-09 整体改写（槽位键改 `workRoot` + 单槽切换模型），Verification 由 28 条扩到 **49 条** ⇒ proposal 必须重做 AC 编号与映射表。
**改写规模**：222 增 / 80 删（原 176 行 → 319 行），比值 1.7 ⇒ 触发 metis 审查条件。
**metis 预算**：该 improvement 的 metis 总计 1 轮 ⇒ 本轮用尽，**不再复审**；以下为逐条闭合记录。

## metis 提出的问题与处置

| # | 级别 | 问题 | 处置 |
|---|---|---|---|
| 1 | **必须** | **映射表 V23 起整体错位一行 + 伪造 V48 + 漏真实 V23**（ADR 的 V23 = 明细永远输出，V24 = 槽位键；表把 V23 写成「槽位键」⇒ 之后每行大 1） | ✅ 按 ADR 原文逐条重排；`V23（明细永远输出）→ AC23` 独立成行；**删除伪造的 V48 行**；V49 → AC38 ④。自检脚本校验「V01–V49 连续无缺」通过 |
| 2 | **必须** | **AC7 与 AC49/AC30 冲突**：AC7 要求超时时「不留下已创建的 session（清理）」，AC49 要求「保留槽位」⇒ 组合出「session 已删但槽位保留」⇒ `cancel` 无对象、工作树永久堵死 | ✅ AC7 改为**按失败步骤三档**：`create`/写盘失败 ⇒ 清理+不占槽+留痕；`prompt`/消费确认超时 ⇒ 保留 session+保留槽位+`dispatching`；AC30 同步同一张表 |
| 3 | **必须** | **AC44 缺正例与有界时延** ⇒「永远停在 `dispatching`」的实现能让 AC44/45/51 全绿，而用户永远切不了 | ✅ AC44 补**正例**（已 promote ⇒ `active`）+ **负例** + **有界时延**（连续 10 次 dispatch，≥8 次 60s 内进 `active`；否则**不判"可切换已实现"通过**）。并把「判据是否可靠」**移出 AC** → 新增 **Phase 0 前置测量任务**（产出物 + 结论，非 AC） |
| 4 | **必须** | **AC21 钉死 `get` 而 N7 允许回退 ⇒ 自相矛盾**（AC 会红却被指示"不许判失败"） | ✅ AC21 改为判**判活函数的行为**：`get` → `list` → 「最后消息时间 + 无 `outcome`」三级取值源，各覆盖一例；上游是否暴露 `time.busy` 变成 **AC38 ② 的输入**而非 AC21 的通过条件 |
| 5 | **必须** | **AC47 判据含「展示层信号」但证据只测 reconcile；且「后端被删」这一支完全没测** | ✅ 证据拆三条：(a) `active`+不 busy → 放行；(b) **session 已删（get 抛错/404）→ 放行**；(c) `sessions` 输出悬挂标记（仅超阈值时出现）；AC29 schema 补 `slot.dangling` 承载该信号 |
| 6 | **必须** | **AC54 缺负例 ⇒「永远报警」的实现可蒙混过关** | ✅ 补**负例**（干净恢复 ⇒ 不报存疑）+ 定义「首批消息」= `baseline_message_id` 之后新增的 user/assistant 消息 |
| 7 | **必须** | **AC51② 与 ADR V42 冲突**（no-op vs 释放槽位） | ✅ AC51 改为**按 `state` 分派**六档：`active`+不 busy ⇒ **释放它所占据的槽位**（同时满足 D11.4 与 V42）；`idle`/`suspended` ⇒ 幂等 no-op；`tombstone`/`dispatching` ⇒ 拒绝。⚠️ 该张力是 **ADR 内部**的，已记 **N17** 并建议 architect 回填 D11.4 措辞 |
| 8 | **必须** | **AC27 的静态断言会误伤既有合法代码**（`lib/delegate-core.ts:538` 有合法的 `startsWith`；`:520`/`:204` 是 scope 归一） | ✅ 判据改为**点名符号 + 显式豁免**（`outOfScopeFiles`/`scopeAbsolutePaths`/`scopeEditRules`），并写明「`grep startsWith` 不能作为判据」 |
| 9 | **必须** | **锁内自取锁会死锁**：`withLock` 不可重入（`mkdirSync(recursive:false)`、10s deadline `:388`），而 `appendLedger`（`:431`）/ `registerSession`（`:460`）自取同一把 `.role.lock` | ✅ 证据规则 10 补**第二条硬禁**（锁内不得调用自取锁的函数）；AC26③ 补可判定证据（锁内回调**不返回 Promise** + 断言未调用 `appendLedger`/`registerSession` + 调用序列 `lock→recheck→flip→ledger(unlocked)→unlock`） |
| 10 | **必须** | **AC46/AC47 的「下一次派发」未含 `delegate`** ⇒ 残留 `active` 永久堵死同步主路径而 AC47 仍绿 | ✅ AC46/AC47 明确「`dispatch` 与 `delegate` **两条派发面**都执行 reconcile」；AC50 措辞改为「**成功路径语义不变**，但新增一条拒绝路径」（不再宣称"语义完全不变"） |
| 11 | **必须** | **降级清单不完整 ⇒ 残留互相矛盾的 AC**（原只列 AC39/51/52/53/54） | ✅ 改为**逐条两列表**（保留 / 改写 / 作废），**覆盖全部 58 条 AC**；补 AC45/AC56/AC34/AC35/AC55/AC29/AC40/AC8/AC9/AC5/AC3/**AC7**（其第③档在降级形态下不成立）；并补「降级后槽位的强制释放路径 = reconcile + cancel，均不依赖 `suspend`」 |
| 12 | **必须** | **缺「常驻与往返切换」与「resume 路径」两条 AC**（用户诉求的稳态形态未被兑现） | ✅ 新增 **AC57**（A 自然跑完 → B 接管 → A 仍常驻可枚举、`session.id`/`baseline_message_id` 未变）与 **AC58**（resume 同样走 `dispatching` → 消费确认 → `active`）；⚠️ 二者对应 ADR D6.2/D7.2 但 **ADR Verification 未覆盖** ⇒ 已记入「ADR 覆盖缺口」（第三处）并建议 architect 回填 |
| 13 | **必须** | **AC29 的 schema 表当前不存在**（仓库无 design.md） | ✅ 在 proposal 内**直接给出成文表**（per-item 13 字段 + aggregate 3 字段，各带类型/取值/**来源**/语义），并写明 `state`（登记态）与 `running`（观测态）相互独立 |
| 14 | 建议 | AC4 与 AC40 的「只读」冲突 | ✅ AC4 加裁定：`sessions` 的只读 = 只读**后端会话**；允许写本地 `pair.json`/ledger，不计入污染判据 |
| 15 | 建议 | AC13 的 `vanished` 既是 outcome 又说「独立字段」 | ✅ 统一为 `outcome:"vanished"`（AC36 的枚举扩展） |
| 16 | 建议 | AC24 证据与判据不匹配 | ✅ 改为单测（headline 字符串 == 「无可验证交付」且不含「没有产出」） |
| 17 | 建议 | AC25「写死且可配置」自相矛盾 | ✅ 改为「默认常量 + 配置项可覆盖，两者都有单测覆盖」 |
| 18 | 建议 | AC31 无上限默认值；AC32 留「二选一」 | ✅ AC31 定 `RDDF_MAX_ACTIVE_BACKENDS` **默认 3**；AC32 **定死**：knowledge 不占槽**且不计入全局上限** |
| 19 | 建议 | AC15③ 回填 goal_key 缺取值 | ✅ 写死「用本次续接简报的 `goal_key`，并落盘」 |
| 20 | 建议 | 证据类型覆盖不了「实测/存档」 | ✅ 证据规则 3 增第四类 **`探测`**（可重放脚本 + 原始返回存档 + 结论） |
| 21 | 建议 | AC1 可见性无单测降级 | ✅ AC1 补「fake ctx 工具注册表含四工具」单测；证据规则 2 的「全部给了单测降级」加例外说明 |
| 22 | 建议 | AC2/AC3/AC39 的静态证据需临时改生产配置，未写还原步骤 | ✅ 三条均补「**必须记录改前内容并在验证后原样还原；还原失败即判证据无效**」 |
| 23 | 建议 | 跨 front 顺序接管未披露 | ✅ 新增 **N13**（软信号 ⇒ 另一 front 可顺序接管，本批不拦，AC17 不覆盖该方向） |
| 24 | 建议 | 同 stateRoot 共用锁 ⇒ 跨 worktree 串行化 | ✅ 新增 **N14**（AC42 的"两者都成功"成立但**不是真并行**） |
| 25 | 建议 | 同 goal_key 在多 worktree 下不唯一 | ✅ 新增 **N15**（实现须用 `(work_root, goal_key)` 或 `session_id` 定位，不得只用 `goal_key`） |
| 26 | 建议 | AC26② 拒绝信息无可执行性 | ✅ 补判据：错误信息必须含占槽后端 `session_id` + 「先 `suspend` 该后端」的提示 |
| 27 | 建议 | AC38④ 无路径 | ✅ 改为「路径由实施期确定并写进 Notes；断言用 `grep`」 |
| 28 | **误报（不采纳）** | `workRoot` 无 realpath ⇒ 符号链接会造出第二槽位 | ❌ **实测不成立**：git 的 `--show-toplevel` 返回**物理路径**，真实路径与符号链接路径解析出的 `workRoot` **相同**（已实测）。⇒ 记 **N16**「已验证，无需 realpath 归一」 |
| 29 | **误报（不采纳）** | 映射表「自 V05 起错位」是本轮引入 | ❌ **错位是前一版既有**（旧 ADR 的 V05 = 「dispatch 落三处」，旧表却写「6（显式 delivery:queue）」）⇒ 非本轮引入，已在映射说明中**如实记录该既有缺陷** |

## 闭合后的自检结果

| 检查项 | 结果 |
|---|---|
| AC 编号 | **AC1–AC58**，58 条，无重复、无缺号 |
| 映射覆盖 | ADR **V01–V49 连续无缺**（脚本校验） |
| 悬空引用 | 正文与映射表引用的 AC **全部有定义**；定义的 AC **全部被映射或列入扩展项** |
| 降级表覆盖 | **全部 58 条 AC** 均有「保留 / 改写 / 作废」处置 |
| AC6/AC8/AC38①–③/AC57/AC58 | 明确标注**无 V 编号**（ADR Verification 覆盖缺口，已建议 architect 回填） |

**教训（沿用上一轮）**：脚本全绿 ≠ 可放行。本轮自检脚本初版只校验「V 编号连续」，**校验不出「编号与主题错位」**——metis 抓到的正是这一点。⇒ 映射表类产物必须**逐条对照 ADR 原文人工核对**，不能只靠编号连续性。
