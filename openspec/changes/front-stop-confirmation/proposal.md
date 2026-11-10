# front-stop-confirmation — 停机确认：execution 级证据 + 进程内准入守卫

## Why

`ADR-front-multi-backend` D11.3 的停机判据（判活为假 + 基线在跑时 `time.idle` 水位线前移）留了**两个可达的假停机窗口**（该篇风险章自陈），后果都是**两个写入者**：

1. **陈旧 busy**：session 曾空闲过（`idle > 0`），新一轮 execution 刚起、`Execution.Started` 未投影 ⇒ 读到陈旧 `busy`（`< idle`）⇒ 两级判活都不成立 ⇒ 基线判为「不在跑」⇒ 不要求水位线 ⇒ 判停机。
2. **后继 execution**：清理期间到达的 wake 在 `settle` 时起后继 ⇒ 水位线已前移而新一轮已在跑。**可达**：插件自己的 `dispatch(resume=X)` 会 ring 上游 doorbell。

D11.3 把「改用上游 `ctx.session.wait`」登记为待实测的备选；实测已完成：

| 探针 | 结果 |
|---|---|
| 空闲 / 运行中 `wait` | 27ms / 173s（跑完才返回） |
| `interrupt` + 清理期间再投递 ⇒ `wait` | **2921ms**、`idle` 前移 ⇒ **覆盖后继 execution** |
| **跨实例**（后端在 B、`wait` 在 A） | **3ms** 返回 ⇒ **不可靠** |

决策已签批：**`docs/adr/ADR-front-stop-confirmation.md`（Status: Accepted，2026-11-10）**。本 change 是该 ADR 的实施项。

来源：`.rddf/improvements/front-stop-confirmation.md`（planner；metis gap 分析记录 `.rddf/reviews/improvements-p2-metis.md`）。

## What Changes

按 ADR 的 D1–D5 落实：

- **D1 判据**：`suspend` 序列改为 9 步（锁外快照 → 锁内置守卫 → `interrupt` → `race(wait, deadline)` → 判活为假 → 水位线 → 锁内重验 → 释放 → `finally` 清守卫）；`W = min(RDDF_STOP_TIMEOUT_MS, 60s)`，**单一预算**；⑥/⑦ **各自至少判一次**（`W` 极小也不跳）。
- **D2 准入守卫**：以 `stateRoot`+`workRoot` 为键的**进程内标记**，带 **owner token + 引用计数**；**不写 `pair.json`**（崩溃即丢、无死槽、枚举不变）。
- **D3 已删后端**：`wait` 抛 `NotFound` ⇒ 视为已停机（按 D12 释放 + 置 `suspended`）；**`NotFound` 优先于「读失败」**。
- **D4 退化**：`stop_judge: "wait" | "degraded" | "degraded-forced"` 挂在 **`suspend` 返回值**（不污染只读的 `sessions`）；`wait` 缺失**或调用 4xx/HandlerNotFound** ⇒ `degraded`；`running0=false` + `degraded` ⇒ **拒绝释放**并提示 `cancel` / `RDDF_SUSPEND_ALLOW_DEGRADED=1`；强开而成功释放 ⇒ 落 `event:"suspend_degraded"`。
- **D5 残留可观测**：释放后**复检**一次判活，命中 ⇒ 落 `event:"stop_raced"` 并如实报（对应 ADR D5 ⑥ 的 `claimSlot→prompt` 窗口）。
- **共用入口**：与 `front-async-resume-guard` 共用 `preAdmission(ctx, { stateRoot, workRoot, sessionID? })` —— 本 change 提供**守卫标记段**（锁内重验），A 项提供**活体段**（锁外取数）。**不得在两处各写一份守卫。**

## 验收标准

> **不制造第二份真相**：AC **直接沿用 `ADR-front-stop-confirmation` 的 Verification S1–S11**（编号回填到本 change），另加下列本 change 新增的交叉/释放后判据。

| AC | 判据 | 证据 |
|---|---|---|
| **AC1** | 沿用 ADR **S1**：陈旧 busy（同进程，`wait` 不返回）⇒ **不释放**槽位 | 单测（需先扩夹具，见 AC12） |
| **AC2** | 沿用 ADR **S2**：`wait` 在 deadline 前 resolve 时，`suspend` 返回时刻 ≥ `wait` 的 resolve 时刻 | 单测 |
| **AC3** | 沿用 ADR **S3**：**成功释放**时，返回时刻 ≥ 后继的**终态事件时刻**（事件时间戳，不用固定毫秒） | 单测（事件订阅） |
| **AC4** | 沿用 ADR **S3b/S3c**：判活恒真 ⇒ 不释放；基线在跑但 `idle` 停在快照值 ⇒ 不释放 | 单测 |
| **AC5** | 沿用 ADR **S4**：守卫置上后，`dispatch` / `dispatch(resume=X)` / **同步 `delegate`** 三入口均拒绝，错误含占槽者 id；且 `delegate` 的 `excludeSessionID` **不得**排除守卫 | 单测（三入口 + 专项） |
| **AC6** | 沿用 ADR **S4b/S4c**：成功 ⇒ 守卫已清且 `dispatch` 立即成功；失败/异常 ⇒ 错误不得再是「正在停机」；`pair.json` 的 `state` 全程在五值枚举内（**无中间态**） | 单测 + 落盘断言 |
| **AC7** | 沿用 ADR **S5/S6**：`wait` 抛 `NotFound` ⇒ 释放 + `suspended`；其余失败 ⇒ `suspended:false` 且条目回 `active` | 单测 |
| **AC8** | 沿用 ADR **S7/S7b**：退化三分支 + `stop_judge` 三值（挂 `suspend` 返回值）+ `suspend_degraded` ledger 行 | 单测 |
| **AC9** | 沿用 ADR **S8/S9/S10/S11**：端点缺失自检 ⇒ `degraded`；总耗时 ≤ `W` + 1s；无 unhandled rejection；既有单测 + E2E L2-19/20/22 全绿；`S11` 按「准入发生在守卫置上之后」限定 | 单测 + E2E |
| **AC10** | **释放后三合一（新增 X1）**：`suspend(X)` 成功返回后**立即** `dispatch(resume=X)` **成功** | 单测 + E2E |
| **AC11** | **并发两次 `suspend`（新增 X2）**：先完成者的 `finally` 不得解除后完成者的守卫（owner + 引用计数）；两路都结束后守卫清空 | 单测 |
| **AC12** | **夹具先行（新增 X12）**：fake ctx 扩成可控 `wait`（hold / resolveAt / reject-NotFound / reject-其它）与可控 stale-busy（能表达 `busy < idle` 且仍在跑）——**先做，否则 AC1/AC4/AC7/AC8 全为假绿** | 测试改造 |
| **AC13** | **不重复读 context（新增 X11）**：`suspend` 全程 `ctx.session.context` 调用次数 ≤ 1 | fake ctx 计数 |
| **AC14** | **守卫可观测（新增 X9）**：导出只读测试钩子（如 `__pendingStops()`）或置/清日志，供 E2E 脏环境排障 | 单测 + E2E |
| **AC15** | **文案（新增 X10）**：`prompts/front.md` 含「该后端在暂停期间又被唤起 ⇒ 请再次 `suspend` 或 `cancel`」，且**不含**「重试 suspend」的循环暗示 | grep 断言 |
| **AC16** | **重启无死槽（新增 X8）**：守卫持有窗口内 kill + 重启（新进程读旧 `pair.json`）⇒ 该 `workRoot` 仍可正常 `dispatch` | 单测（进程模拟） |
| **AC17** | **交叉优先级（新增 X4，与 A 项共用 AC9）**：两判据同时命中 ⇒ 文案为「正在停机 + 发起者」，**不含**「请先 suspend」 | 单测（依赖 A 项） |
| **AC18** | **`W` 钳制（新增 X6/X7）**：`W` 设 `1` 时 ⑥/⑦ 仍各判一次（空闲后端仍成功）；`W` 设 `600000` 时被 `min(…, 60s)` 钳制 | 单测 |

## Out of Scope

- **运行窗口守卫**（`front-async-resume-guard`，已立项）：本 change 只做停机窗口那一段。
- **`claimSlot→prompt` 窗口**（ADR D5 ⑥）：只做「释放后复检 + `stop_raced` 留痕」，**不做**「准入 + 投递不可分割」的根治（另立 change）。
- **跨实例**：退化为现状判据（ADR 风险章已认领，不引入新风险、也不在本 change 解决）。
- backlog 其它项：`/404/` 宽判、上游行号/顺序漂移清单。

## Notes

- **实施顺序**：AC12（夹具）→ D1 判据 → D2 守卫 → D3/D4/D5。**AC9 的「既有单测全绿」在夹具改造完成前不能作为回归证据**（现 `wait: async () => ({})` 是死桩）。
- **实验性端点**：`ctx.session.wait` 走 `/api/experimental/...`，上游已把非实验别名标「Removed in the next minor」⇒ D4 的退化与自检是**必需项**，不是可选优化。
- **能力下降是有意的**：`wait` 消失后空闲后端将无法 `suspend`（只能 `cancel`），与 D7.2「宁可失去切换能力，不失去单写者」同口径。
