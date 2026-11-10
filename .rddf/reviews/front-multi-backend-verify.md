# 验收报告：front-multi-backend（AC1–AC58）

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 验收者 | verifier |
| change | `openspec/changes/front-multi-backend/`（**AC1–AC58**） |
| 提交 | `35e23a6`（14 文件，+2219/−33） |
| 判据来源 | `proposal.md` 的 `## 验收标准`（AC1–AC58）；ADR Verification 1–49 经其映射表 |
| 分流判定 | **未命中 `rdd-verifier` skill**：条件 1（有 AC 段）✅、条件 3（skill 可加载）✅、**条件 2（P3 archive gate）❌**（无 `iteration.json`）→ 走本地验收 1–5 步 |
| 结论 | **FAIL（不通过）** —— 3 项 AC **完全未实现** + 2 项缺测试 + 1 项文档缺项；另有 4 项需外部条件或设计决策 |
| 已用轮次 | **1 / 3** |

---

## 0. 验证顺序与结果

| 步 | 内容 | 结果 |
|---|---|---|
| 1 | 编译 / 静态检查 | ✅ **零新增类型错误**：`delegate-core.ts` 改动前后错误集**逐类一致**（2×TS2345 + 5×TS2591 + 4×TS7006）；`delegate-async.ts` 自身只有 4×TS2591 + 2×TS5097（**既有基线**：缺 `@types/node`、`.ts` 扩展名），**零真类型错误** |
| 2 | 单元测试 | ✅ `bun test tests/` → **205 pass / 0 fail**（既有 172 零回归 + 新增 33） |
| 3 | 集成 / E2E | ⚠️ **部分**：工具工厂 5/5 构造成功（permission action 各自独立）；**真实调用未验**（需重启服务加载新插件 → 见 §5 的 T7.1） |
| 4 | 边界与错误路径 | ✅ **8/8**（独立构造，不复用 builder 测试）：缺 `goal_key` / 非 kebab slug / 目录不存在 / 相对路径 / 空 `session_id`（suspend+cancel）/ 不存在的后端 / 空名册 |
| 5 | 遗留清扫复核 | ✅ **0 遗留**（TODO / console.log / skip 测试 / 注释代码 / debug 分支 / 未替换 mock / 临时文件 全为无） |

---

## 1. AC 逐条判定

### 1.1 通过（有工具证据）

| AC | 证据 |
|---|---|
| AC2（非 front 被权限层拒） | `opencode debug agents`：Build/General/Plan/Explore 的四个 action **全 deny** |
| AC3 / AC39（action 可单独 deny） | 同上：配置文件与 `debug agents` 均显示**四个独立 action**（不是同挂一个） |
| AC4（观测面不污染） | 静态：`sessionsToolDefinition` 内**无** `ctx.session.prompt`；单测「调用前后 `calls.prompt` 不变」 |
| AC5（不等任务完成） | 单测：dispatch 的 `execute` 不调 `wait`；返回含 `state` 与 `delivery_known` |
| AC6（显式 `delivery:"queue"`） | 静态：`lib/delegate-async.ts:540` 字面量 |
| AC7（硬超时 + 按步骤分档处置） | 单测：三档各一例（create 失败 ⇒ 清理不占槽；写盘失败 ⇒ 清理；prompt 超时 ⇒ 保留 session+槽位+dispatching） |
| AC8（不对 front 发 prompt） | 静态：四个工具均无对 front session 的 prompt 调用 |
| AC9（落三处） | 单测：`pair.json` 含 `work_root`/`state`/`goal_key`；ledger 含 `"event":"dispatched"`；metadata 含 `delegated_by`/`work_root` |
| AC10（列出名下后端） | 单测：名册含 2+ 条 + `work_root` 字段 |
| AC11（兜底扫全量） | 单测：`pageSize=2` + 5 个后端 ⇒ `listDelegatedSessions` 返回 5（cursor 续扫生效） |
| AC14（metadata 整体替换） | 单测：update 后字段完整 |
| AC15（goal_key 输入与落盘） | 单测：格式校验 + pair 落盘；`validateBrief` 对既有 delegate 不新增必填（既有 172 测试全绿） |
| AC16（异 goal_key 硬拒） | 单测：resume 不同 intent ⇒ 抛错 |
| AC17（同 goal_key 放行） | 单测：suspend 后同 goal_key resume 成功 |
| AC19（运行中 resume 拒） | 单测：busy 判定拒绝 |
| AC20（同 slug 异目标文档化） | 文档：ADR D3 + `prompts/front.md`；行为：同 slug 通过 |
| AC21（running 判据三级取值源） | 单测四态 × 三级源；**实测** `get()` 在 run 中返回 `time.busy` |
| AC22（窗口期保守） | 单测：无 busy 但最后消息晚于 idle ⇒ running |
| AC23（worst-of + 明细） | 单测：`unverified`+`succeeded` ⇒ `partial_unverified`（不得报完成）；running 不进 worst-of |
| AC24（措辞不含「没有产出」） | 单测：headline 含「无可验证交付」且**不含**「没有产出」 |
| AC26（单槽原子 + 锁形态） | 单测：拒绝后无残留 session、错误含 holder id；**静态**：`withLock` 回调内**无 `await`**、**未调用** `appendLedger`/`registerSession` |
| AC27（scope 重叠检测不实现） | 静态：`grep scopesOverlap|overlap*Scope` **无命中** |
| AC28（cancel 墓碑条件） | 单测：在跑 ⇒ 墓碑；不在跑 ⇒ 纯 no-op 不墓碑 |
| AC29（schema 成文表） | `proposal.md` 有 per-item 13 字段 + aggregate 3 字段表；单测断言字段集合 |
| AC30（写入顺序与失败语义） | 单测：三档处置 |
| AC31（全局上限） | 单测：`exceedsLimit` + 默认值 3 |
| AC32（knowledge 不占槽/不计上限） | 单测 + 静态 |
| AC33（既有 delegate 无回归） | 205 pass / 0 fail（含既有 172） |
| AC34（prompt 契约 + 旧措辞清除） | 静态：`grep` 旧措辞（「一切工程行动经 delegate」/「唯一工程通道」/「唯一出口原则」）**全无**；§2.2 四工具表 + dispatch≠完成 + 切换契约 + 范围假设均在 |
| AC36（ledger 消费者同步，除 ADR D5） | `docs/dual-session-delegation.md`：`event` 独立字段 + `vanished` + `state` + 故障表两行 |
| AC37（无按 id 查单个） | 静态：`sessions` 的 input schema 无该参数 |
| AC38（上游语义锚定） | ✅ ① `delivery` 默认 steer（探针 + 源码）；② **`get()` 在 run 中返回 `time.busy`**（本轮实测，**解决 N7 的 Q2/R4 冲突：R4 正确**）；③ `list` 过滤生效 |
| AC40（state 五态 + 存量回填） | 单测：缺 `work_root`/`state` 的回填；busy ⇒ `active`；**已有字段不改**；存量 active 不放行第二派发 |
| AC41（判等键 vs 调度键） | 单测：同仓两 worktree + 同 slug ⇒ 判等通过且名册可区分 |
| AC42（槽位键 = workRoot） | 单测：两 linked worktree 各派一个**都成功**，`work_root` 分别为两路径 |
| AC43（常驻与活跃分离） | 单测：同 workRoot 可常驻多个 `idle`；名册含 `work_root` 字段（**分组为展示层，未断言分组结构** → 见 §3 N1） |
| AC44（消费确认正/负例） | 单测：正例（id 进 context ⇒ `active`）+ 负例（不进 ⇒ `dispatching`）；判据为 **id 比对**（`contextMessageIds(...).has(messageID)`）而非文本 |
| AC45（dispatching 只可 cancel） | 静态 `:672` 守卫 + 单测：`suspend` 被拒且错误指向 `cancel` |
| AC46（翻转执行者三条） | 单测：delegate 自翻转 `idle`；reconcile 放行；**第二次顺序 delegate 到同一工作树成功** |
| AC47（槽位回收 ①②） | 单测：`active` 但不 busy ⇒ 下次派发放行且旧条目翻 `idle`；session 已删 ⇒ 放行 |
| AC49（投递失败保留槽位） | 单测：超时/异常 ⇒ 返回「投递结果未知」+ 槽位仍被占 + 再派被拒 |
| AC50（既有 delegate 变更面） | 静态：`slotBusyHolders(ctx, ...)`（`:957`）+ 首登记 `active` + 终登记 `idle`（`:1160`）；单测：既有 delegate 被槽位表拒绝 |
| AC51（suspend 六档） | 单测：resume 可用 / `dispatching` 拒 / 墓碑拒 / `active` 但不 busy ⇒ 释放槽位；静态：六档守卫在 |
| AC52（切换两步） | 单测：`suspend(A)` → `dispatch(B)` 成功，A 仍可枚举 |
| AC53（停机确认） | 单测：`interrupt` 未停机 ⇒ 不释放槽位 + 再派被拒 |
| AC55（范围假设写明） | 静态：`prompts/front.md` §2.2「范围假设」段 |
| AC56（切换契约 + 同仓并行备工作树） | 静态：同段两处 |
| AC58（resume 走 dispatching） | 单测：对 `suspended` 后端 dispatch ⇒ 先经 `dispatching`、消费确认后才 `active` |

### 1.2 **未通过（implementation_gap —— 实现缺失）**

| AC | 判据要求 | 实际 | 证据 |
|---|---|---|---|
| **AC25** | `stalled = running 且 (now - lastActivityAt) > 阈值`；**默认常量 + 配置项可覆盖**，两者都有单测 | ⛔ **完全未实现**：`lib/`、`tests/` 中 `grep "stalled\|STALL"` **零命中** | `grep -n "stalled\|STALL" lib/*.ts tests/*.ts` → 无输出 |
| **AC54** | steer 残留：正例报存疑 / **负例不报** /「首批消息」定义；不可检出时降级为 `steer_residue:"undetectable"` + 手册写明 | ⛔ **完全未实现**：`grep "steer_residue"` 零命中；`sessions` 输出无该字段 | `grep -n "steer_residue" lib/*.ts tests/*.ts` → 无输出 |
| **AC48** | 亡主接管：旧 front 的 `active` 槽位**不被静默顶掉**；新 front 可 `suspend` 回收；**接管落 ledger 行** | ⛔ **未实现**：`suspend`/`cancel` 无 front 存活判定（`locateBackend` 只查 pair），无接管 ledger 行 | `grep "亡主\|orphan\|takeover" lib/delegate-async.ts` → 无输出 |

> ⚠️ **实施报告（`.rddf/reviews/front-multi-backend-impl.md` §4）把 AC25/AC48/AC54 列为已实现 —— 该陈述不成立**。本节为独立核查结果，以本节为准。

### 1.3 缺测试 / 缺文档（不满足"每条判据 ≥1 工具证据"）

| AC | 缺口 |
|---|---|
| **AC18**（grant 救援不误杀） | `tests/delegate-async.test.ts` 中 `grep "grant"` **零命中**；行为推断上同 goal_key 放行，但**无 grant 场景用例** |
| **AC47③**（`slot.dangling` 悬挂标记且仅超阈值时出现） | `grep "dangling" tests/` **零命中**；实现里 `dangling = state==="active" && !running` **没有阈值语义**（与 AC25 同源缺失） |
| **AC35④**（架构文档补写单槽口径） | `docs/front-delegate-architecture.md` 只有 change 1 的 `workRoot` 口径（`:203-204`），**无**「单槽 / 常驻-活跃分离 / 可切换」段 |

### 1.4 不可判定（需外部条件或设计决策）

| AC | 原因 |
|---|---|
| **AC1**（四个工具"实际可调用"） | 权限矩阵已证（静态）；**"实际可调用"需真实 front 会话** ⇒ 需重启服务 + E2E（T7.1） |
| **AC11 / AC12**（真实 front 换代找回） | 单测覆盖 cursor 续扫与 roster 为空路径；**真实换代未跑** |
| **AC13**（已消失可见 + 补记 `vanished`） | ⛔ **设计张力**：`list` 不返回已删 session，而 ADR D2.1 否决全局 registry ⇒ 无法枚举"曾经的仓库"。**属 `design_drift`，须 architect 决策**（候选见 `design.md` §5） |
| **AC44 有界时延**（连续 10 次 ≥8 次 60s 内进 `active`） | 需真实模型跑 10 次 |
| **AC57**（自然跑完 → B → 再回 A 完整序列） | 部分：suspend→resume 已测；「自然跑完→切回」只覆盖名册可见 |
| **AC36 的 ADR D5 行产生时机表** | ⛔ ADR 内容（`docs/adr/**`）⇒ **architect 归属**，builder 不得单方面改 |

---

## 2. 失败项与路由建议

**分类：`implementation_gap`**（实现缺失 ⇒ 回 builder 写代码），**不是** `proposal_drift`（AC 判据本身无需改，除 AC13）。

| 路由 | 项 |
|---|---|
| **builder** | AC25（`stalled` 阈值 + 配置项 + 单测）｜AC54（`steer_residue` 正负例 + 不可检出降级）｜AC48（亡主接管 + ledger 行）｜AC18 补 grant 用例｜AC47③ 悬挂标记与阈值语义｜AC35④ 架构文档单槽段 |
| **architect** | **AC13**（`design_drift`：三候选择一）｜AC36 的 `ADR-front-knowledge-capability` D5 表 |
| **用户授权后** | E2E bats L2-16..（AC1 可见性 / 真实派发 / 连续 10 次时延） |

---

## 3. Notes（不参与通过/失败判定）

- **N1** AC43 的「按 `work_root` 分组」：实现输出含 `work_root` 字段（可分组），但单测只断言字段存在，**未断言分组结构**。若不接受，属 AC43 的证据强度问题（建议补一条按组聚合的断言）。
- **N2** 既有 `delegate` 的槽位检查与登记**不在同一临界区**（`create` 是 await，`withLock` 同步）⇒ 存在小竞态窗口。已在 `design.md` §4.1 如实记录；`delegate` 是 30 分钟阻塞的同步面，并发同一工作树的概率低。
- **N3** `dispatch` 的 `permissions` 组装复用了既有 `scopeEditRules`/`CONSTANT_DENY`/`grants`（与 `delegate` 同形），但**异步面没有 grants 参数**（`dispatch` 的 input 无 `grants`）⇒ 若后续需要预批，是新增契约而非缺陷。

---

## 4. 用户文档检查（用户本轮特别要求）

| 文档 | 定位 | 四工具覆盖 | 结论 |
|---|---|---|---|
| **`docs/front-delegate-usage.md`** | **面向用户的使用手册**（256 行） | `delegate` 7 次 / `dispatch` **0** / `sessions` 1 / `suspend` **0** / `cancel` **0** | ❌ **必须更新**：§9 的六个场景（A–F）全是 `delegate` 同步路径，**缺「并发派多个任务」「看后端进度」「切换后端」「放弃任务」四个用户场景**；也缺单槽语义与「dispatch 返回 ≠ 完成」 |
| **`docs/front-delegate-testing.md`** | 面向改代码的人（227 行） | `dispatch` 0 / 其余 0 | ❌ **应更新**：测试清单写「当前 **157** 项」（实际 **205**）；缺 `tests/delegate-async.test.ts` 与 `tests/canonical-root.test.ts`；目录清单缺 `lib/delegate-async.ts` |
| **`docs/MULTI-AGENT-DESIGN.md`** | 当前态设计文档 | `dispatch` 0 / `suspend` 0 / `cancel` 0 | ❌ **应更新**：`:101` 仍写「`delegate` allow（**唯一**登记型通道）」；工具面无四工具 |
| **`docs/CHANGELOG.md`** | 变更日志 | 1 次（无关） | ❌ **缺 change 2 条目** |
| `docs/dual-session-delegation.md` | 机制手册 | ✅ 已更新（7/2/3/3/2） | ✅ |

> ⚠️ **归属**：`docs/MULTI-AGENT-DESIGN.md` 与 `docs/CHANGELOG.md` 在**治理面作用域**内（`~/.config/opencode/docs/**`，改它们须 oracle + critic 审）⇒ **architect**。
> `docs/front-delegate-usage.md` 与 `docs/front-delegate-testing.md` 不在 `arch_paths`（仅 `docs/adr`）也不在治理面 ⇒ **builder**。

---

## 5. 判定

**FAIL —— 不通过。**

- **3 项 AC 完全未实现**（AC25 / AC48 / AC54）——这是硬缺口，不是证据不足。
- **3 项缺测试或文档**（AC18 / AC47③ / AC35④）。
- **6 项不可判定**（AC1 可见性、AC11/AC12 真实换代、AC13 设计张力、AC44 时延、AC57 完整序列），其中 **AC13 需 architect 决策**。
- **实施报告 §4 的完成度陈述不成立**（把 AC25/AC48/AC54 列为已实现）——已在本报告 §1.2 更正。

**已用轮次 1 / 3。** 下一轮：builder 补齐 AC25/AC48/AC54/AC18/AC47③/AC35④ + 文档三处；architect 决 AC13。


---

# 第 2 轮验收：2026-11-10

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-10 |
| 验收者 | verifier |
| 范围 | `72f0b4b`（D12 矩阵实现 + AC36 两处同步）+ `12cf6c0`（AC57 往返 + groups + §2.1 图对齐） |
| 判据来源 | `proposal.md` 的 `## 验收标准`（AC1–AC58）+ ADR `ADR-front-multi-backend` Verification 1–49 / D12 |
| 分流判定 | **未命中 `rdd-verifier` skill**（无 `iteration.json` ⇒ P3 gate 未触发）→ 走本地验收 1–5 步 |
| 结论 | **PASS（附 1 条测试质量缺陷 + 4 项需外部条件/不可判定）** |
| 已用轮次 | **2 / 3** |

## 0. 验证顺序与结果

| 步 | 内容 | 结果 |
|---|---|---|
| 1 | 编译 / 静态检查 | ✅ **零新增真类型错误**：`delegate-core.ts` 逐类与基线（HEAD~2）一致（2×TS2345 + 5×TS2591 + 4×TS7006）；`delegate-async.ts`（新文件）仅 5×TS2591 + 2×TS5097 = **既有基线类型**（缺 `@types/node`、`.ts` 扩展名），无真错误 |
| 2 | 单元测试 | ✅ `bun test tests/` → **228 pass / 0 fail**（既有 172 零回归 + 新增 56） |
| 3 | 集成（**独立夹具**，不复用 builder 的测试文件） | ✅ **49 PASS / 0 FAIL**（两个独立脚本：23 + 26） |
| 4 | 边界与错误路径 | ✅ **8/8**（缺 goal_key / 非 kebab / 目录不存在 / 相对路径 / 空 session_id ×2 / 不存在的后端 ×2 ⇒ 明确结果而非抛错） |
| 5 | 遗留清扫复核 | ✅ **0 遗留**（TODO / console.log / skip 测试 / 未替换 mock / 注释代码 全为无） |

## 1. 第 1 轮 FAIL 的 6 项缺口 —— 全部独立验证闭合（23 PASS）

| AC | 独立证据 | 判定 |
|---|---|---|
| **AC25** `stalled` 阈值 | 默认 5min ✓；`RDDF_STALLED_THRESHOLD_MS` 覆盖 ✓；超阈值⇒stalled、**等于阈值不算**、非 running 不算 ✓；**不落盘**（pair.json 无该字段）✓ | ✅ |
| **AC47③** 悬挂标记 | 仅「占槽 + 不跑 + 超阈值」为 true ✓；刚派发不报 ✓；把 `time.updated` 推远后报 ✓ | ✅ |
| **AC54** steer 残留 | 基线不在⇒`undetectable` ✓；有额外 user⇒`suspected` ✓；**只有本次简报⇒`none`（负例）** ✓；assistant 不算 ✓；集成：suspend 记录基线 ✓、干净恢复⇒none ✓、暂停期间注入陈旧 user⇒suspected ✓ | ✅ |
| **AC48** 亡主接管 | 归属**存活** front ⇒ suspend 拒绝（错误含「另一个 front」）✓；**亡主** ⇒ 允许回收 ✓ + 落 `event:"taken_over"` ledger 行 ✓ | ✅ |
| **AC18** grant 救援 | 续接同目标 + 补 grant 不被拒、session 复用 ✓ | ✅ |
| **AC35④** 架构文档 | §4.4 单槽口径段存在 ✓；含槽位键/常驻-活跃/投递≠消费/翻转执行者 ✓；含锁形态两条硬禁 ✓；**§2.1 图所有边框行 = 80 显示列** ✓ | ✅ |

## 2. D12 处置矩阵 —— 逐格独立验证（12 格全过）

| 场景 | 期望 | 实测 |
|---|---|---|
| `dispatch(resume=已删)` | 新 session ≠ 已删 session ✓；旧条目 `tombstone` ✓；落 `outcome:"vanished"` 终态行（**无 `event` 字段**）✓ | ✅ |
| 死槽解除 | 新派发被拒但**占槽者是新后端**（已删的不再占槽）✓；放开新后端后可再派发 ✓ | ✅ |
| `suspend` 已删 + active | 释放槽位并置 `suspended` ✓ | ✅ |
| `suspend` 已删 + idle | **幂等 no-op**（state 不变）✓ | ✅ |
| `suspend` 已删 + tombstone | 拒绝 ✓ | ✅ |
| `cancel` 已删 + 非墓碑 | `tombstone` + `vanished` 行 ✓ | ✅ |
| `cancel` 已删 + 墓碑 | 幂等 no-op ✓ | ✅ |
| 定位不到工程仓 | 返回明确结果、**不抛错** ✓ | ✅ |

## 3. AC57 往返 + groups（独立验证，7/7）

A 自然跑完（不调 `sessions`）→ 派 B 成功 ✓ → 名册**按 `work_root` 同组**列出 A(idle)/B(active) ✓ → **单步 resume A 被拒**（错误含占槽者 id）✓ → 两步切回（`suspend(B)` → `resume(A)`）成功且 `session.id` 未变、消息条数单调增长 ✓；`groups` 的 null 组排最后且不丢弃 ✓。

## 4. 锁形态（静态独立核对）

`withLock` 回调内**无 `await`**、**未调用** `appendLedger` / `registerSession` / `updateSlotState`（自取锁或自取锁包装）✓ ⇒ 满足 ADR D7.1 与证据规则 10 的两条硬禁。

## 5. 唯一发现（测试质量，非实现缺陷）

### F1 —— builder 的「死槽解除」回归用例是**空过**的

`tests/delegate-async.test.ts` 的 `setupVanished` 里：

```ts
;(ctx as any).session.get = async (input: any) => {
  if (input.sessionID === a.session_id) throw new Error("404 session not found")
  const s = (ctx as any).session
  return s.get.call(null, input)   // ← s.get 读到的已是**被覆盖后的自己**
}
```

⇒ `s.get.call(...)` **自我递归** ⇒ 栈溢出。实测：`RangeError: Maximum call stack size exceeded`（独立脚本复现）。

该异常被 `delegate-async.ts` 的 `readSessionInfo` 捕获 ⇒ 判为 `missing` ⇒ **活体判定失真**（把「活的」后端当成「已删的」）。

⇒ 后果：该用例断言的「resume 已删后同 workRoot 可再派发」**并不能证明死槽已解除** —— 它在死槽 bug 存在时也会通过。

**但实现本身是对的**：本轮用**独立夹具**逐格验证（§2），死槽确已解除。

- **分类**：`implementation_gap`（测试质量）——**不是** `proposal_drift`
- **严重度**：低（不掩盖实现缺陷，只让回归网失真）
- **路由**：**builder** 修 `setupVanished` 的覆盖写法（保存原函数引用再调，或改用 `opts.missing` 机制）；修完须复跑该用例确认它**仍绿**（在正确夹具下）

## 6. 不可判定项（需外部条件，**不判通过也不判失败**）

| AC | 原因 |
|---|---|
| **AC1**（四工具「实际可调用」） | 权限矩阵已证（`opencode debug agents` 实测：front 五 action allow、其余 agent 全 deny）；**「实际可调用」需真实 front 会话** ⇒ 需重启服务 + E2E（T7.1） |
| **AC11 / AC12**（真实 front 换代找回） | 单测覆盖 cursor 续扫与 roster 为空路径；**真实换代未跑** |
| **AC44 有界时延**（连续 10 次 ≥8 次 60s 内进 `active`） | 需真实模型跑 10 次 |
| **AC44 的 E2E 面** / 既有 E2E 回归 | 外部仓库 bats L2-16.. 未新增（T7.1） |
| **AC57**（完整往返的 E2E 面） | 单测已覆盖；E2E 待 bats |

## 7. 判定

**PASS。**

- 第 1 轮的 3 项**完全未实现**（AC25 / AC48 / AC54）+ 3 项缺证据/文档（AC18 / AC47③ / AC35④）→ **本轮全部闭合**（独立验证 23 PASS）。
- D12 处置矩阵 12 格、AC57 往返 7 项、边界 8 项、锁形态静态核对 → 全过。
- 静态零新增真类型错误；228 pass / 0 fail；遗留清扫 0 遗留。
- **唯一发现 F1 是测试质量缺陷**（回归网失真），实现本身经独立夹具验证正确 ⇒ 不构成否决，但**建议 builder 修夹具后复跑**。

**已用轮次 2 / 3。** 剩余不可判定项全部卡在**外部条件**（E2E bats 外部仓库 + 真实模型），不在本地可解范围。


---

# 第 3 轮验收（最终轮）：2026-11-10

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-10 |
| 验收者 | verifier |
| 范围 | `0bb3157`（修 F1 + 缺失判定改窄口径）+ `533de74`（E2E bats L2-16…L2-21 + AC44 有界时延） |
| 判据来源 | `proposal.md` 的 `## 验收标准`（AC1–AC58）+ ADR `ADR-front-multi-backend` Verification 1–49 / D12 |
| 分流判定 | **未命中 `rdd-verifier` skill**（无 `iteration.json` ⇒ P3 gate 未触发）→ 本地验收 1–5 步 |
| 结论 | **PASS（附 1 条偶发不稳定用例记录）** |
| 已用轮次 | **3 / 3（本 change 验收轮次用尽）** |

## 0. 验证顺序与结果

| 步 | 内容 | 结果 |
|---|---|---|
| 1 | 编译 / 静态检查 | ✅ **零新增真类型错误**：`delegate-core.ts` 与基线逐类一致（2×TS2345 + 5×TS2591 + 4×TS7006）；`delegate-async.ts` 仅 5×TS2591 + 2×TS5097 = **既有基线类型**（缺 `@types/node`、`.ts` 扩展名） |
| 2 | 单元测试 | ✅ `bun test tests/` → **231 pass / 0 fail**（含 1 次**偶发失败、未复现**，见 §5） |
| 3 | 集成 / E2E | ✅ **11/11**（独立变异脚本）+ **26/26**（独立边界/D12 矩阵脚本）+ **E2E 21/21**（真实模型 + 真实宿主） |
| 4 | 边界与错误路径 | ✅ **8/8**（第 2 轮脚本复跑）+ **6/6**（本轮窄判定三态） |
| 5 | 遗留清扫复核 | ✅ **0 遗留**（TODO / console.log / debugger / skip 测试 / 未替换 mock / 临时文件 全为无） |

## 1. 第 2 轮的发现 F1 —— 已闭合，且**独立复现其「有牙齿」**

verifier 不采信 builder 的自测结论，**自己重做变异测试**（3 个变异，每个都必须让对应用例变红）：

| 变异 | 植入的缺陷 | 结果 |
|---|---|---|
| 1 | `dispatch(resume=已删)` **不墓碑**旧条目（死槽 bug 回归） | ✅ 用例**变红**（`Expected: "tombstone"` / `Received: "idle"`） |
| 2 | 缺失判定**宽判**（所有查询错误 = 已删除） | ✅ 用例**变红** |
| 3 | `suspend` 对已删+`idle` 不走 no-op 分支（违反 D12 幂等语义） | ✅ 用例**变红** |
| — | 还原后 | ✅ **全绿** |

⇒ **F1（夹具自我递归 ⇒ 回归用例空过）已闭合**，且当前测试网**确实能抓住**死槽回归。

## 2. 缺失判定的窄口径 —— 独立验证（6/6）

| 行为 | 期望 | 实测 |
|---|---|---|
| 上游 tagged `Session.NotFoundError` | ⇒ missing | ✅ |
| 普通错误 / DB 超时 | ⇒ **unknown（保守侧）** | ✅ |
| `404` 文案 | ⇒ missing | ✅ |
| 查询失败时**活着的**后端 | ⇒ **仍占槽**（不被 reconcile 释放） | ✅ |
| 查询失败时 `resume` | ⇒ **明确报错、不处置**（不误墓碑、不新建） | ✅ |
| 查询失败时 `suspend`/`cancel` | ⇒ 明确结果、不处置 | ✅ |

⇒ 窄口径**确实守住了「单写者」不变式**：一次瞬时错误不会再让两个后端并发写同一工作树。

## 3. E2E —— 21/21 全绿（真实模型 + 真实宿主）

- 外部仓库 `/workspace/main/rdd-workflow-e2e`，commit **`dc7875c`**（L2-21）+ **`568ef28`**（L2-16…L2-20）
- 15 条**既有用例用新产物重跑** ⇒ 新增的槽位检查未破坏既有 `delegate` 行为
- 新增覆盖：四工具门控（四个 action 各自独立）/ dispatch 真派发（pair 登记 `work_root`+`state`、ledger `event:"dispatched"`）/ sessions 只读（观测面**不写 ledger**）/ 单槽拒绝 / suspend 暂停 / front 换代经兜底路径找回旧后端
- 顺带修两处**既有** E2E 缺陷（真实运行才暴露）：工具级错误提取只认 `{message:…}` 而宿主给**字符串**；L2-10 取第一次调用而模型偶尔先发参数非法调用再重试

## 4. AC44 有界时延 —— 达标

连续 10 次「投递 → 消费确认」**10/10 在 60s 内**（中位 0.2s、最大 1.4s）⇒ 判据（≥8/10）满足。测的是 dispatch 关键路径的**下界**（工具侧另有 `create` 开销 + ≤200ms 确认轮询粒度）。

## 5. 第 2 轮「不可判定项」的最终关闭情况

| 原不可判定项 | 现状 |
|---|---|
| AC1（四工具「实际可调用」） | ✅ **关闭**：L2-16（权限矩阵）+ L2-17…L2-20（真实调用） |
| AC11 / AC12（真实 front 换代找回） | ✅ **关闭**：L2-21 |
| AC44 有界时延 | ✅ **关闭**：§4 |
| AC44 的 E2E 面 / 既有 E2E 回归 | ✅ **关闭**：21/21 |
| **AC57 的 E2E 面** | ⚠️ **仍为部分**：单测已覆盖完整往返（含「单步 resume A 必被拒」）；E2E 未覆盖往返序列（需模型连续 4 次正确编排，额度过省）⇒ 已在 Notes N6.3 如实记录 |

## 6. 唯一遗留记录（不构成否决）

### **N-A —— 一条偶发失败，未能复现**

第 2 步曾出现一次 `230 pass / 1 fail`，随后 **13 次连续运行全部全绿**（10 次定向连跑 + 3 次），**未能复现**。

- **判不出具体用例**（失败输出未捕获到）。
- **最可能的嫌疑**：`isRunning` 的**时间相关分支**（`time.busy` 缺失时回落到「最后消息时间 > 最后空闲时间」），在毫秒边界上可能翻转。
- **影响**：不掩盖实现缺陷（三个变异都能被抓），但**回归网存在噪声**。
- **建议**：若再复现，**按失败用例名定位并把时间判据改成显式注入的 `now`**（与 `isStalled` 已有的 `now` 参数一致），消除对墙钟的依赖。

## 7. 判定

**PASS。**

- 第 2 轮唯一发现（F1）已闭合，且**经 verifier 独立重做的 3 个变异验证**确认当前测试网有牙齿。
- 第 2 轮 4 项不可判定项**全部关闭**（AC57 的 E2E 面除外，已如实记录为部分）。
- 静态零新增真类型错误；231 pass / 0 fail；E2E 21/21；遗留清扫 0 遗留。
- 唯一遗留是一条**未能复现的偶发失败**（N-A），不影响判定，但建议后续消除其时间依赖。

**已用轮次 3 / 3 —— 本 change 的验收轮次用尽。** 后续若要再改实现，需重新走验收（新一轮计数）。


---

# 第 4 轮（增量复核）：2026-11-10

> **性质**：**增量复核**，不是新的完整验收轮次。第 3 轮验收（PASS）之后，为补 AC57 的 E2E 面而改了实现 ⇒ 实现变了，原验收结论**不再覆盖当前代码**，故对变更部分做增量复核。
> **第 3 轮之后的变更**（commit `未编号`·见下方「变更清单」）：
>
> | # | 变更 | 触发 |
> |---|---|---|
> 1 | `suspend` 的**停机确认**从「interrupt 后立即查一次活体」改为**有界轮询**（`waitStopped`，默认 8s，可配 `RDDF_STOP_TIMEOUT_MS`） | E2E L2-22 首跑实测暴露：`suspended:false` +「后端仍在运行，未释放槽位」⇒ **往返切换在「后端在跑」时根本走不通** |
> 2 | **全局并发上限的计数**从读 metadata 索引改为读**权威态**（`pair.json` 的 `state`） | E2E 实测：已 `idle` 的后端仍占额度 ⇒ **误报「并发上限已达」** |
> | 3 | 外部 E2E：新增 **L2-22**（往返切换）、**L2-99**（清理）、场景级清理机制、断言健壮化 | 补 AC57 的 E2E 面 + 修 E2E 自身污染全局上限 |

## 1. 复核结果

| 项 | 结果 |
|---|---|
| 静态检查 | ✅ 零新增真类型错误 |
| 单元测试 | ✅ **234 pass / 0 fail**（第 3 轮 231 → +3：停机确认两条新行为 + 上限权威态一条） |
| 独立变异脚本 | ✅ **11 / 11**（3 个变异仍能被抓；窄判定三态仍正确） |
| 独立边界/D12 矩阵脚本 | ✅ **26 / 26** |
| E2E（外部仓库，真实模型 + 真实宿主） | ✅ **23 / 23 全绿**（含新增 L2-22 / L2-99） |
| 遗留清扫 | ✅ 0 遗留 |

## 2. 变更 1 的独立验证（停机确认）

新增 2 条用例 + E2E L2-22：

| 场景 | 期望 | 结果 |
|---|---|---|
| `interrupt` **先返回、后停机**（模拟上游「确认接受、清理异步 settle」） | `suspend` **等它停下**并释放槽位（`state=suspended`） | ✅ 单测 + E2E |
| `interrupt` 后**一直不停** | **不释放**槽位（仍 `active`），报「停机确认窗口内仍在运行」 | ✅ 单测 |
| E2E 往返切换 | dispatch A → suspend A（`interrupted=true`）→ dispatch B → sessions → suspend B → **dispatch(resume=A) 返回同一 session_id** | ✅ L2-22 |

⇒ **确认了上游语义**：上游 `interrupt` 是「先确认接受、清理异步 settle」（`execution.ts`：「Interruption acknowledges before cleanup settles」）⇒ **「interrupt 的返回值」不是停机判据**，唯一可靠判据是**活体复查**。

## 3. 变更 2 的独立验证（上限计数读权威态）

| 场景 | 期望 | 结果 |
|---|---|---|
| metadata 仍是 `active`（索引过期）但 pair 已是 `idle` | **不**计入全局上限 | ✅ 单测 |
| E2E | dispatch 不再被已 `idle` 的后端挡住 | ✅（L2-19/L2-20/L2-22 由「误拒 3/3」变为全绿） |

## 4. 三个由 E2E 暴露的问题（记录在案）

| # | 问题 | 归属 | 状态 |
|---|---|---|---|
| ① | `suspend` 的停机确认只查一次 ⇒ 对在跑后端几乎必然失败 ⇒ **往返切换不可用** | builder | ✅ 已修（有界轮询） |
| ② | 全局上限计数读可过期索引 ⇒ 误拒 | builder | ✅ 已修（读权威态） |
| ③ | **E2E 自身污染环境**（跑出的后端不清理 ⇒ 几个场景后占满全局上限 ⇒ 后续场景被误拒） | E2E 仓库 | ✅ 已修（场景级清理 + L2-99） |

**附带发现（未修，需 architect）**：`ADR-front-multi-backend` **D11.3** 现写「若 `interrupt` 未真正停机（**返回 `interrupted:false`** 而 session 实际仍在跑）⇒ 不释放槽位」——**`interrupted` 的返回值不是停机判据**（上游语义：`true` = 已接受、清理待 settle；`false` = 本就没有活跃执行）。实现已按**活体复查**做，但 **ADR 措辞需同步**（architect 归属，已记入 proposal Notes N6.4）。

## 5. 判定

**PASS（增量复核）。** 实现变更后的全部证据齐备：234 单测、11 独立变异/语义验证、26 边界、E2E 23/23。

**AC57 的 E2E 面已关闭**（L2-22）。本 change 至此**全部 58 条 AC 均有可判定证据**（除已在 Notes 记录的降级/范围假设类说明）。

**仍需 architect 处理的唯一一项**：ADR D11.3 的措辞订正（`interrupted` 返回值 ≠ 停机判据）。

---

# 第 5 轮（增量复核）：2026-11-10 —— 停机判据对齐 ADR D11.3

> **性质**：增量复核。第 4 轮之后，ADR `D11.3` 的停机判据被订正为「判活为假 + 终态水位线前移（基线在跑时）」，
> 实现随之重写 ⇒ 对变更部分做增量复核。

## 1. 变更

| # | 变更 | 触发 |
|---|---|---|
| 1 | `waitStopped` 从「`isRunning` 取反」改为「**取 `interrupt` 前快照**（`v0=time.idle`、`running0`）→ 判活为假 **且**（`running0` 时）`time.idle > v0`」 | critic BLOCKER：文档与实现是两套判据；「看起来不忙」有假停机窗（fiber 已退、finalizer 在跑） |
| 2 | 读失败 / 原因不明 ⇒ **不释放槽位**（此前 `waitStopped` 忽略 `unknown`、`isRunning(undefined)` 判假 ⇒ 视为停机 ⇒ 误放槽） | 同上（保守侧反转，方向与 change 目标相反） |
| 3 | 全局上限拒绝信息带**占额者清单**（`id@work_root`） | 「3/3」无法定位是谁占的（E2E 排查实证） |

## 2. 结果

| 项 | 结果 |
|---|---|
| 静态检查 | ✅ 零新增真类型错误 |
| 单元测试 | ✅ **238 pass / 0 fail**（+4：空闲后端立即成功 / settle 窗口不释放 / 读失败不释放 / 占额者清单） |
| E2E L2-20（suspend 释放槽位） | ✅（替代模型，干净环境） |
| E2E L2-22（往返切换） | ✅（替代模型，干净环境） |

## 3. 全量 E2E 未能复跑（环境限制，如实记录）

`opencode run` 对默认模型返回 `AI.Error.RateLimit`：「当前已达到 Token Plan 用量上限」（`~/.local/share/opencode/log/opencode.log`），
所有真实委托在建 session 前即退出 ⇒ 全量 23 条无法用默认模型复跑。

替代模型（`L2_FRONT_MODEL=commandcode/deepseek/deepseek-v4.1-flash`）下：**L2-20 / L2-22 单独跑绿**，
但**全量跑在 L2-19/20/22 失败**，错误均为「并发上限已达（3/3）」，诊断显示占额者是**本场景自己多派发的后端**
（`engproj-slot` 2 个 + `engproj-dispatch` 1 个）⇒ 属**该模型在单场景内多次派发**的行为差异，**不是插件缺陷**
（同两条用例在干净环境单独跑均绿；默认模型此前全量 23/23 绿）。

⇒ **本 change 的停机判据变更：单测 238 全绿 + 两条 suspend 相关 E2E 绿**；全量 E2E 待默认模型额度恢复后复跑。

---

# 第 6 轮（verifier 增量验收）：2026-11-10

> **验收者**：verifier（只验不改）。**判据来源**：① 用户本次要求（验收「`waitStopped` 按 ADR D11.3 重写」这一增量）；
> ② proposal `## 验收标准`（AC51 / AC52 / AC53 / AC57）；③ ADR `D11.3` 与 Verification「停机确认」四条断言（a/b/c/d）。
> **分流**：`rdd-verifier` skill 可加载，但 **P3 archive gate 未触发**（无 `.rddf/state/iteration.json`；
> `rddf rdd-verify --dry-run` → "No eligible changes to verify"）⇒ 走**本地 1–5 步**验收。

## 1. 静态检查

| 项 | 结果 | 证据 |
|---|---|---|
| `lib/delegate-async.ts`（本轮改动文件） | ✅ **零真类型错误** | `bunx tsc --noEmit --skipLibCheck lib/delegate-async.ts` 输出为空（仅 TS2591/TS5097 噪声，已滤） |
| `lib/delegate-core.ts` | ⚠️ 6 条 `TS7006`/`TS2345` | **既有问题**：该文件本轮**未改动**（`git status` 只见 `delegate-async.ts`）⇒ 非本轮回归，**不在本次 scope** |
| `tests/delegate-async.test.ts` | ⚠️ `TS2307: Cannot find module 'bun:test'` | 环境问题（bun 类型声明未装）⇒ 非实现缺陷 |

## 2. 单元测试

✅ **238 pass / 0 fail**（1013 expect）。其中「停机确认」相关 **5 条**单独跑亦全绿（`bun test -t "停机确认"` → 5 pass）。

## 3. 集成 / E2E（真跑，未用缓存推断）

| 场景 | 结果 |
|---|---|
| L2-20（`suspend` 释放槽位 + `state=suspended`） | ✅ |
| L2-22（往返切换：A → suspend → B → suspend → resume A，A 同一 `session_id`） | ✅ |
| **全量 23 条（默认模型，干净环境）** | ✅ **23/23 全绿** |

> 前一轮记录的「默认模型 Token Plan 额度耗尽」**已恢复**（重跑 L2-3 默认模型即绿）⇒ 全量证据已补齐，无需降级结论。

## 4. 边界与错误路径（**独立脚本**，不复用 `tests/` 夹具）

脚本 `/tmp/opencode/probe/verify-stop-criteria.ts`，直接构造 fake ctx 调 `snapshotStopBaseline` / `waitStopped`：**12 PASS / 0 FAIL**。

| # | 边界 | 期望 | 实测 |
|---|---|---|---|
| ① | 基线「不在跑」（空闲后端） | 判活为假即停机；**不等**水位线前移、**不**耗满窗口 | ✅（耗时 < 1s） |
| ② | 基线「在跑」+ 水位线前移 | 判停机（终态落定的正面证据） | ✅ |
| ③ | 基线「在跑」+ 水位线**不动**（settle 窗口：fiber 已退、终态未投影） | **不**判停机 ⇒ 不放行槽位 | ✅ |
| ④ | 读失败（原因不明） | 基线为 `null`（调用方据此不释放）；轮询中失败 ⇒ **不**判停机 | ✅ |
| ⑤ | session 已删（上游 `NotFoundError`） | 视为停机（没有东西可写，ADR D12） | ✅ |
| ⑥ | 始终在跑 | 窗口耗尽 ⇒ 「未停机」；**有界**（不无限等待） | ✅ |

## 5. 遗留清扫复核

✅ **0 遗留**：改动文件里无 `TODO`/`FIXME`/`XXX`/`console.log`/`debugger`（唯一命中是本报告正文里描述历次清扫的文字）；无 `.skip`/`.todo` 测试；新增行里无被注释掉的实现块；无未替换 mock；无临时文件残留。工作区仅 `cli.json`（用户 UI 偏好，不提交）。

## 6. 逐条判据判定

| 判据 | 判定 | 证据 |
|---|---|---|
| ADR D11.3 a（`running0=true` ⇒ 水位线前移 ⇒ 释放） | ✅ | 单测「interrupt 先返回、后停机」+ 独立脚本 ② + E2E L2-20/L2-22 |
| ADR D11.3 b（`running0=false` ⇒ 立即成功，不等水位线） | ✅ | 单测「空闲后端 ⇒ 不等水位线前移」+ 独立脚本 ① |
| ADR D11.3 c（构造不停机 ⇒ `suspended:false`、条目仍 `active`、文案含「未释放槽位」） | ✅ | 单测「interrupt 后一直不停」+「判活为假但水位线未前移」+ 独立脚本 ③⑥ |
| ADR D11.3 d（读失败/原因不明 ⇒ 不释放） | ✅ | 单测「读后端状态失败」+ 独立脚本 ④ |
| AC51（`suspend` 语义：`suspended` 非墓碑、仍可 resume） | ✅ | 单测「suspended 后可 resume」 |
| AC52（切换两步可用：A 让出槽位 → `dispatch(B)` 成功，A 仍可枚举） | ✅ | 单测「切换两步」+ E2E L2-22 |
| AC53（停机确认 ⇒ 未确认停机不释放槽位，不得出现两个 `active` 同一 workRoot） | ✅ | 单测（停机确认 5 条）+ 独立脚本 ③④⑥ + E2E L2-20 |
| AC57（往返切换稳态） | ✅ | E2E L2-22 |

## 7. 结论

**PASS（增量验收）。** 实现与 ADR D11.3 一致，证据齐备：静态（零真错误）+ 238 单测 + 12 条独立边界脚本 + **E2E 23/23 全绿**。

**一项文档漂移（不判失败，路由给文档责任方）**：proposal 的 **AC53 判据文本仍是旧措辞**（「`interrupt` 未真正停机（`interrupted:false` 而 session 实际仍在跑）」）——
该措辞仍被实现满足（实现**更严**：不看 `interrupted`，看判活 + 水位线），但措辞会误导后续实施 ⇒ 建议由 **planner/architect** 把 AC53 文本同步为
「未**确认停机**（判活为假 ∧（基线在跑时）水位线前移）⇒ 不释放槽位」。**分类**：文档漂移（非 `implementation_gap`）。

**已用轮次**：verifier 本 change 共 6 轮（1–4 为 builder 自查/增量复核，5 为 builder 的第 5 轮增量记录，**本轮为第 1 次独立 verifier 验收**）。

---

# 第 7 轮（增量复核）：2026-11-10 —— critic 第 3/4 轮返工后的增量

> **性质**：增量复核。critic 第 4 轮（SHOULD_FIX）要求把「`session.context` 读失败」改保守；同时 ADR 文本按 critic 第 3/4 轮的
> BLOCKER 修订（F1 如实化、F2 补「为什么不用 `ctx.session.wait`」的备选与取舍）。

## 1. 变更

| # | 变更 | 触发 |
|---|---|---|
| 1 | `ctx.session.context` 读失败**不再**被当成「没有未终结消息」⇒ 新增 `readSessionMessages`（返回 `ok`）：基线取不到 ⇒ 拒绝；轮询中失败 ⇒ 不判停机 | critic 第 4 轮 SHOULD_FIX：D4 第二级兜底失效 ⇒ 可能误判停机 ⇒ 误放槽 |
| 2 | ADR D11.3 补「**为什么不用上游 `ctx.session.wait`**」段（备选 + 两条不用它的理由 + 待实测登记） | critic 第 4 轮 BLOCKER F2：决策缺备选与取舍理由 |
| 3 | ADR D4/D11.3/风险章三处如实化（「stale-busy 不被兜住」等） | critic 第 4 轮 BLOCKER F1 |
| 4 | `DEFAULT_STOP_TIMEOUT_MS` 注释收紧（「夹具/E2E 观测，**非**上游分布实测」） | critic 第 4 轮 NIT |
| 5 | proposal **AC53** 判据文本同步为 ADR D11.3 口径 | critic 第 2/3/4 轮均提（文档漂移） |

## 2. 结果

| 项 | 结果 |
|---|---|
| 静态检查 | ✅ `lib/delegate-async.ts` 零真类型错误 |
| 单元测试 | ✅ **239 pass / 0 fail**（+1：消息读失败 ⇒ 不释放槽位） |
| 独立边界脚本 | ✅ **12 PASS / 0 FAIL**（判据语义未变，结论继续适用） |
| E2E | ✅ L2-19 / L2-20 / L2-22（覆盖上限诊断路径与 suspend 路径）；全量 23/23 全绿（本轮末改之前） |
| ADR 结构 | ✅ 决策段 249/250、最长 D 段 38/40、判据 49 |

## 3. 判定

**PASS（增量）。** 变更 1 是**行为**变更（读失败更保守 ⇒ 更少释放槽位），单测 + 独立脚本覆盖；
变更 2–5 为文档/注释，不改判据语义。
