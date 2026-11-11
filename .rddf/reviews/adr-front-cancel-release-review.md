# 审稿记录：ADR-front-cancel-release

> 产出角色：architect。审稿者：oracle（失败模式分析）+ critic（2 轮）。
> 本文件由 architect 从审稿输出誊写（审查者只读）。

## 0. 结论

| 轮次 | 审查者 | 结论 | mergeable |
|---|---|---|---|
| oracle 1 轮 | oracle | 失败模式分析（K1–K6 + 5 处既有 ADR 间矛盾）；推荐 **K2 + 共用停机判据 + per-call `force` + `cancel_pending` 钉住** | — |
| critic 第 1 轮 | critic | **REJECT**（3 BLOCKER，同源：**取代清单不完整** —— 本篇实际改了三处已签批决策，却只登记了一半 ⇒ 文档内同时存在「本篇已改」与「本篇声明不动」两套口径）+ 12 SHOULD_FIX + 5 NITS | no |
| critic 第 2 轮（复审） | critic | **APPROVE_WITH_CONDITIONS**（`mergeable: yes`，**0 BLOCKER**；B1/B2/B3 **全部闭合**；8 SHOULD_FIX + 4 NITS） | yes |

## 1. critic 第 1 轮的 BLOCKER 与处置

| # | BLOCKER 要点 | 处置 |
|---|---|---|
| **B1** | 本篇 D7（`cancel` 对不占槽条目也墓碑）与 stop-ownership **D1/S5** 互斥（后者要求 `active`/`dispatching`，并把 `idle`/`suspended` 判为 `slot_already_released`）；而 Parent 行写「**不动** stop-ownership D1」⇒ 既未取代又在 D7 里推翻它；实现上必须改 `releaseSlotAuthorized` 的判定顺序 | **放弃 D7**：`cancel` 对不占槽条目保持**幂等 no-op**（stop-ownership D1/S5 零改动 ⇒ 共享函数不动 ⇒ `suspend` 零变化）。改为「D7 已知行为与 backlog」（`backlog: cancel-idle-tombstone`） |
| **B2** | D2 的「D6.3 状态表 / D12 矩阵 / S6/S7 一律无需修订」被本篇 D7 与 D3② 推翻：① D7 给 `idle`/`suspended` 增加了 `→ tombstone` 转移（D6.3 表无此行、D12 的 ⚠️ 注记变成反向指引）；② D3② 要求 reconcile 不得自动放行 ⇒ multi-backend **D7.1/D7.3/V32–V33** 必须改写（实现里也无例外分支） | ① 随 D7 放弃而消失；② **修订清单显式列入** multi-backend D7.1/D7.3/V32–V33；D2 的断言改写为「D6.3 表 / D12 矩阵 / stop-ownership S6/S7 **不变**（本篇不改墓碑语义）」 |
| **B3** | D4（严格模式仍可 `force`）与 Parent 行「**不动** stop-ownership D2」冲突；S9 是否仍有效未登记 | **修订清单显式列入** stop-ownership D2/S9（偏离**仅限 per-call 通道**，env 通道在严格模式下仍不可用）⇒ Parent 行同步补登记 |

## 2. critic 第 1 轮的 SHOULD_FIX / NITS 处置（逐条）

| # | 要点 | 处置 |
|---|---|---|
| 1 | D3① 钉住基线**削弱**水位线判据；`running0` 未钉 ⇒ 二义 | **改为**：水位线一律相对**本次尝试**的快照；`baseline_idle`/`baseline_running` 只作**记录与诊断**；「跨重试一致」= 判据**形态**一致（ADR D3① + F11） |
| 2 | D3② 钉住依赖字段被保留；`registerSession` 固定字段重建会丢 `cancel_pending` | 写者纪律**扩展**到 `cancel_pending`（修订清单 + 实现约束 3 + F10） |
| 3 | D3② 钉住范围未界定（授权类拒绝会钉住**新占者**） | **限定**：只在**证据类拒绝且 `claim_gen` 未变**时写钉（ADR D3③ + F8） |
| 4 | D7「墓碑 ⇒ 已终止 ⇒ 槽位已释放」在 `force` 路径下不成立 | D7 放弃；该不变量改述为「**墓碑 ⇒ 槽位已释放**」无例外；「墓碑 ⇒ 已终止」仅在非 force 路径成立（修订清单 D9 行） |
| 5 | 未回答「是否就是 B6 反对的持久化中间态」；K5 与 K0 的口径不对称 | 新增「**与 B6 的区别**」小节：不是状态枚举值 ⇒ 不产生「状态未知 ⇒ 死槽」；但新增持久条件 ⇒ **必须**有崩溃恢复规则（重启**不解钉** ⇒ 三条出口 + `sessions` 可见）⇒ 作为「新增死槽面（已接受）」登记 |
| 6 | K3 的否决理由（「env 不可见」）与 stop-confirmation D4 冲突 | K3 理由**改立**在「部署级默认 ⇒ 全体 front 无差别放行、用户未逐次知情」；并注明两条 env/per-call 通道并存 |
| 7 | D1「从未起跑 ⇒ 停机成立」在严格模式不成立 | D1 结论**限定单实例口径**；并注明多实例下 D6 的代价 |
| 8 | stop-confirmation D2:68 的改写理由不准确 | 修订清单里改为：守卫**仍会挡住**该窗口内的 dispatch；真正窗口在**守卫清掉之后**；「cancel 恰恰产生新写入者」**只对 force 路径成立** |
| 9 | stop-ownership D3⑩ 的改写漏了「reconcile 顺带释放被钉住时不可用」 | D3⑩ 改写文本补上该句；Parent 行同步列 D3⑩ |
| 10 | 「stop-ownership 实现约束整节结案」会被读成全部作废 | 改为**仅结案其中 `cancel` 边界那一条**；其余 6 条继续有效 |
| 11 | 缺「实现约束」章 | 新增章（6 条：代号快照点 / 守卫 token 引用计数 / `cancel_pending` 写者纪律 / ledger 与 pair 同临界区 / `releaseSlotAuthorized` 改动范围 / `interrupt` 返回值只作诊断） |
| 12 | D2 的 reason 枚举只列证据类，授权类未定义 | 枚举补齐**两类**（证据类 5 + 授权类 4）；拒绝一律带 `forced_available:true` |
| 13 | knowledge-capability D5 只列了枚举 + 时机表，漏**字段表** | 修订清单补：**字段表** + `outcome` 恒 `null` 规则 |
| N1 | 「已排除」节无自有内容且引用不存在的文件 | **逐条理由内联**；审稿记录文件同步创建 |
| N2 | `cancel_pending` 清理路径三处口径不一 | 统一为「成功释放 / 后端被删 / 墓碑 ⇒ 字段消失」 |
| N3 | F11 只验「不占槽 ⇒ 墓碑」，未验交集格 | 新增 **F13**（不占槽 + 证据不足 ⇒ 拒绝、不墓碑） |
| N4 | `cancel` 返回体新增字段属**破坏性变更** | 修订清单里写明「**返回体新增字段**（下游按旧字段解析会失配）」 |
| N5 | K0 的「不改墓碑语义」在 force 路径下不成立 | K0 单元格改为「**不改变「墓碑 ⇒ 槽位已释放」**」 |

## 3. 关联工件

- ADR：`docs/adr/ADR-front-cancel-release.md`
- 探针（待固化进仓库，见 F19）：`/tmp/opencode/probe/probe-cancel-release.ts`
- 相关已归档 change：`openspec/changes/archive/2026-11-11-front-stop-ownership/`（授权释放 / tripwire 的来源）

## 4. critic 第 2 轮的 SHOULD_FIX / NITS 处置（逐条）

| # | 要点 | 处置 |
|---|---|---|
| S1 | D7 的「保持 front 认知」与 D1 冲突；「空闲后端」未定义 | D7 改为「**必须改写**」；术语拆成「**不占槽条目**（`idle`/`suspended`）」与「`active` 但未在跑」两类；并点名两处 front 文案必删改 |
| S2 | D7 第一行未排除**已删**后端 | 加「**session 仍存在时**」（已删走 D12 路径，见 F6） |
| S3 | `force` 的作用域未写死（是否跳过授权门控） | 写死：**只跳过停机证据门控，不跳过授权门控** ⇒ `idle`/`suspended` 仍 `slot_already_released` |
| S4 | F13 要求 `slot_already_released` 优先于证据类，但 D1 序列无这一步 | D1 序列前置 **⓪ 授权前置**（条目不存在 / 已是 `idle`\|`suspended`）⇒ 同 stop-ownership D1 的「授权类优先」 |
| S5 | 五处「点名旧口径的子句」未登记 | 全部进清单：multi-backend **D12 ⚠️ 注记** / **D1 工具表 `cancel` 行** / stop-ownership **D2 严格模式作用域** / **D3⑩ 前提** / stop-confirmation **D4 的 `stop_judge` 作用域** |
| S6 | front 两处点名旧句在钉住场景下变假 | 清单显式点名 `prompts/front.md:59` 与 `docs/front-delegate-usage.md:180` 必删改 |
| S7 | 「钉住须 `sessions` 可见」没有落点 | 清单补 **multi-backend V08 / V42**（`sessions` 每项含状态与证据字段 ⇒ 新增「已钉住」标记） |
| S8 | stop-ownership 实现约束「`cancel` 的边界」未点名 | 清单补该条 ⇒ 改为指向本篇（C7 已结案） |
| N1 | 「两条 env 通道」措辞会被读成 cancel 也有 env 通道 | 统一为「**一条 env 通道（suspend）+ 一条 per-call 通道（cancel）**」 |
| N2 | `sessions` 可见性错引 D3③ | 改为指向「sessions 可见性」落点 |
| N3 | `cancel_forced` 落 `baseline_idle` 未落 `baseline_running` | 字段补齐 |
| N4 | K0 代价项与「与 B6 的区别」小节重复 | 不影响判读（保留；后续整理） |

## 5. 结论

**APPROVE_WITH_CONDITIONS ⇒ 放行**（无 BLOCKER）。SHOULD_FIX 已全部落实 ⇒ 本篇可作为**实施依据**。
