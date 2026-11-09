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
