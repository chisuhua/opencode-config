# 审稿记录：ADR-front-stop-confirmation

> 对象：`docs/adr/ADR-front-stop-confirmation.md`（停机确认判据）
> 顺序：oracle（先）→ critic（后）。预算：oracle 1 + critic 2（第 2 轮为 BLOCKER 闭合复审）。

## 实测基座（本轮补的探针，可复跑）

| 探针 | 结果 |
|---|---|
| 空闲 session `wait` | 27ms |
| 运行中 `wait` | 173s，`time.idle` 前移 |
| `interrupt` + 清理期间再 prompt ⇒ `wait` | **2921ms**，`idle` 前移 ⇒ **覆盖后继 execution** |
| **跨实例**（后端在 B、`wait` 在 A） | **3ms** 返回，而 `busy` 有值、`idle`=null ⇒ **不可靠** |

脚本：`/tmp/opencode/probe/p2-session-wait-probe.ts`、`/tmp/opencode/probe/p2-cross-instance-probe.ts`。

## 轮次 1：oracle —— 方向成立，9 条必须修/建议

| # | 发现 | 处置 |
|---|---|---|
| O1 | `wait` 只覆盖「最后一次查表前」的后继；`wait` 返回**之后**的准入窗只能用写侧关 | ✅ 新增 **D2 写侧守卫** |
| O2 | S3 与决策自相矛盾（陈旧 busy 落 `running0=false` ⇒ 决策要求释放） | ✅ 拆成 S1（同进程）+ 跨实例残留 |
| O3 | 序列与 deadline 未写死（误读成「先等它跑完」） | ✅ 唯一序列 + **单一 W** |
| O4 | `wait` 抛 `NotFound` ⇒ 按 S5 会永不释放（与 D12 冲突、必死槽） | ✅ D3 + S5：`NotFound` ⇒ 视为已停机 |
| O5 | 退化路径 = 静默安全降级 | ✅ D4：默认拒绝释放 + `RDDF_SUSPEND_ALLOW_DEGRADED=1` 赎回 + 留痕 + 启动自检 |
| O6 | 「多等一个投影周期（毫秒级）」错述（实测 2921ms 是后继 run 的完整时长） | ✅ 改写 + 给 front 的文案 |
| O7 | S1/S2/S9 不可判定（循环论证 / 固定毫秒 / 「不显著」） | ✅ 改事件时间戳 / 配窗口 / 数值上限 |
| O8 | 实现约束：二次整段 context 读撑大释放窗；`wait` promise 不可取消 ⇒ 必须 catch | ✅ 写进「实现约束」 |
| O9 | 「关闭范围」表述会被高估 | ✅ D5 五段表 |

## 轮次 2：critic —— **REJECT**（1 BLOCKER + 7 SHOULD_FIX）

| # | 级别 | 发现 | 处置 |
|---|---|---|---|
| C1 | **BLOCKER** | 持久化的 `suspending` 态**无崩溃恢复规则**、且明写 reconcile 跳过 ⇒ 进程在 8s 窗口内死掉即**该工作树永久失去切换能力** | ✅ **改为进程内标记集（不落盘）**：崩溃即丢标记、`pair.json` 仍 `active` ⇒ 走 D7.1 reconcile ⇒ 无死槽；并把「持久化守卫」列为被否选项 **B6**；D6.3 / V07 / D12 矩阵**无需修订** |
| C2 | SHOULD_FIX | 「唯一序列」没有置守卫的步骤 ⇒ 与 D2 二义 | ✅ 序列 9 步（② 锁内置守卫 / ⑨ finally 清） |
| C3 | SHOULD_FIX | 父篇枚举与 D12 矩阵未回填 | ✅ 随 C1 消失（不落盘 ⇒ 无枚举变更） |
| C4 | SHOULD_FIX | 风险④误引 D8.3 + 「单实例是常态」无证据 | ✅ 改指 **B0 等价**，并把「单实例」上升为 D1 的**显式成立假设** |
| C5 | SHOULD_FIX | 逃生门不可观测 | ✅ `stop_judge` 三值 + `event:"suspend_degraded"` + S7(c)/S7b 断言 |
| C6 | SHOULD_FIX | 缺条件 2/3 的负向判据 | ✅ 新增 S3b / S3c |
| C7 | SHOULD_FIX | S4 只测 `dispatch` | ✅ 扩为 `dispatch` / `dispatch(resume=X)` / **同步 `delegate`** 三入口 |
| C8 | SHOULD_FIX | D2 缺独立取舍与撤销路径 | ✅ D2 补「为什么不持久化 / 撤销路径 / 代价」，选项表加 B6 |

## 轮次 3：critic 闭合复审 —— **APPROVE_WITH_CONDITIONS**（`mergeable: yes`）

| 判定 | 证据 |
|---|---|
| **BLOCKER C1：已闭合** | D2 改为进程内标记（`:59-66`）+ B6 把持久化列被否（`:101`）；死槽面成因（持久化中间态 + 无崩溃恢复）被**移除而非绕开**：进程死 ⇒ 标记消失、条目仍 `active` ⇒ `claimSlot` 的 reconcile 分支可回收 |
| 本轮新增 diff 的新 BLOCKER | **无** |
| 剩余 SHOULD_FIX（不阻断） | ① 守卫与 D7.3「强制接管」的交互边界未定义；② `:66` 指错断言编号（S4/S9 → S4b） | ✅ 均已修 |

## 收尾状态

- **Status：Draft → Proposed**（双审完成；**待用户签批转 Accepted**）。
- 关联 change：未立项 ⇒ 登记 `backlog: front-stop-confirmation`（planner 立项后回填）。
- ADR 结构自检：正文 175 行、决策段 63/250、选项 6 行、判据 16 条。
- 父篇 `ADR-front-multi-backend` D11.3 末尾已加「部分取代」指针（未改其决策正文）。
