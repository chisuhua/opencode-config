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
