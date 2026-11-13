# resume-precheck-guidance — 设计（落点与取舍）

> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D5 / D6，**Accepted**）
> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC10）
> 性质：**纯 prompts + 守卫测试**，无代码路径改动。

## 1. 要解决的问题

后端交回后，主会话最容易犯的三个错都源于**认错证据**：

| 错 | 机制 | 本 change 的对策 |
|---|---|---|
| 把「交回完成」读成「任务完成」 | 真完成与交回完成**都是** `outcome=succeeded` + `state=idle` | A 小节断言句：**`outcome=succeeded` + `state=idle` 不等于完成**（AC2） |
| 把上一轮的 `blocked` 当成本轮的 | `rddf feedback list <proposal>` 返回**全部**记录 | 增量记账：派发时记 `last_feedback_id`，只认 `created_at` 晚于派发时刻的条目（AC4） |
| 交回后错误地 resume / 换类 | resume 不重设 permissions；`role_class` 显式改写被硬拒 | resume 三条禁令（AC3） |

## 2. 落点

| 段 | 文件 | 形态 |
|---|---|---|
| A（唯一真源） | `prompts/plan.md` | 新增 `### 交回后的收尾三问`：三问表格 + 证据优先级链 + 6 条要点（断言句 / 无完成信号 / 增量记账 / 5 项模板 / 三条禁令 / 不接管实施） |
| C（引用） | `prompts/plan.md` | 硬规则 #5 由「凭据在哪 + 按第 ③ 项分流」正文改为**引用小节标题名** |
| B（引用） | `prompts/front.md` | §3.3 的 `HANDOFF:` 分流句改为**引用小节标题名**（不写 `§x.y` 编号），旧重复正文删除 |
| D（守卫） | `tests/config-guards.test.ts` | 新增 describe，8 条断言覆盖 AC1–AC8 |

**为什么 A 在 `plan.md` 而不是 `front.md`**：交回后的路由决策发生在**派发方**（plan / front 都能派），但 plan 是派发主路径；放 plan.md ⇒ front 只留引用，避免两份正文漂移（这正是 proposal AC5 的意图）。

**为什么引用按「标题名」而不是「§编号」**：小节会被增删，编号会漂；标题名由守卫测试钉住（AC5 断言 front.md 含该标题且不含 `§数字`）。

## 3. 关键取舍

| 取舍 | 选择 | 代价 |
|---|---|---|
| 证据优先级并列还是有序 | **有序**（`feedback` > `last_assistant_text` 首行 > `outcome`/`state`） | 多一次只读调用（`rddf feedback list`）；换来「先看权威凭据」 |
| `rddf` 通道已知不一致 | **主证据 + 文本兜底**（不新造通道） | 兜底路径要靠模型读首行，弱于结构化记录 |
| 是否自动闭环（自动改计划 / 自动 resume） | **不做** | 交回后仍要人工/模型一次判断 |
| 是否改 `prompts/build.md` | **不改**（后端侧契约已闭环；AC6 只**读**它做动态对照） | 少一处跨文件耦合 |
| 5 项字段名在 A 小节**复述**还是**引用** | **复述**（但守卫从 build.md 动态抽取比对） | 文本重复，但读者不必跳转；漂移由守卫挡住 |

## 4. 顺序与验证

1. A（真源） → C（plan 引用） → B（front 引用） → D（守卫） → 回归 —— 可一次合入。
2. 验证：`bun test tests/` **490 pass / 0 fail**；`scripts/check-upstream-anchors.sh` **23/23**；`openspec validate resume-precheck-guidance` 通过。
3. 治理面 ⇒ oracle → critic 各 1 轮（`prompts/**` 属治理面）。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| A 小节变成散文、失去可执行结构 | 守卫断言「是表格」+「三段证据下标递增」（AC1） |
| 两份正文漂移（plan 与 front 各写一份） | front 只留标题名引用；守卫负向断言旧重复正文**已消失**（AC5） |
| 守卫本身变成第二份定义（字段名硬编码） | 5 项字段名从 build.md **动态抽取**；outcome 集合从 front.md 动态抽取；`SLOT_STATES` 从 lib 导入（AC6 / AC8） |
| 提示词新增了未登记的工具 / 状态 / outcome | 守卫负向：反引号标识符 ⊆ 已知集合；`SLOT_STATES` 与 outcome 集合断言不变（AC7 / AC8） |

## 6. 遗留登记（critic SHOULD_FIX 2 要求「可追」）

| # | 事项 | 归属 | 状态 |
|---|---|---|---|
| L1 | `docs/adr/ADR-backend-handoff-role-class.md:84`（D5）写着「异步路径在**完成通知**后 `rddf feedback list`（权威）+ `sessions` 确认 `idle`」—— **描述性措辞陈旧**：D5 的可操作决策（不新增状态/工具、feedback 记录为唯一权威、选项 E「推送完成通知」被拒）本身就是「**没有**完成通知」的来源；本 change 的小节按工具契约写「异步面没有完成信号」，并就地加了一句消歧 | **architect**（Accepted ADR 的措辞修订走 ADR 修订流程，不在 prompts-only change 内改） | 待立项 |
| L2 | `.rddf/reviews/backend-handoff-protocol-spec.md:45` 同一处陈旧措辞（既有产物） | architect（随 L1 一并修订） | 待立项 |
| L3 | `prompts/build.md:482` 的降级例外是**全类断言**，但只写了 `architect` 类的后果（`builder` / `verifier` 类遇审查者不可用时未声明） | planner（立项时与 verifier 类取证缺口一并写齐） | 待立项 |

> L1 / L2 的**实质决策**与本 change 不冲突：oracle 判定「处置方向可接受、不构成『已签批 ADR 与实现矛盾』」—— 矛盾只存在于 ADR 的描述性措辞与其机制决策之间；critic 判定「plan.md 就地消歧事实准确、避开了 AC7 的负向 token」，但要求 follow-up **落在可追台账**（即本表）。
