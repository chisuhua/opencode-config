# 审稿报告：ADR-front-multi-backend + ADR-canonical-root-normalization

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-09 |
| 审稿者 | oracle（架构评审）→ critic（arch 档审稿） |
| 被审对象 | `docs/adr/ADR-front-multi-backend.md`（新起草）<br>`docs/adr/ADR-canonical-root-normalization.md`（新起草） |
| review_profile | arch |
| critic 结论 | **APPROVE_WITH_CONDITIONS**，`mergeable: yes`，`scope_exceeded: false`，**0 BLOCKER** |
| oracle 结论 | 3 条补充探针要求（其中 1 条判断被探针推翻），全部已在起草前补跑 |
| 收口状态 | **0 BLOCKER + 5 SHOULD_FIX + 2 NITS 全部闭合**（见 §4）→ Status 转 **Accepted**（未实施） |

## 1. oracle 评审（起草前）

oracle 的评审给出 3 个"必须先补的探针"与若干设计建议。**其中 1 条判断被探针推翻**：

| oracle 的说法 | 探针结论 |
|---|---|
| "run 进行中的可靠信号缺失，D5 聚合建在沙地上" | ❌ **推翻**。v2.2.5 的 `Session.Info.time` 有 `busy` 字段（`packages/schema/src/session.ts:49-50`）；2.1.2 快照里没有，v2.2.5 才有。判据 = `busy` 存在 ∧（`idle` 未定义 ∨ `busy > idle`），已写入 D4 |
| "插件能否 update 自己 session 的 metadata 未探针" | ✅ 可行且经 host 活动后不覆盖 → 支撑 D2.4 的 roster 快路径 |
| "interrupt 后 queued prompt 残留行为未探明" | ⚠️ 观测不足（插件 ctx **无 `inbox` API**，实测 `Object.keys(ctx.session)` 全集）→ 支撑 D7 的墓碑语义 |

oracle 另提出 3 条设计建议，均已采纳进 ADR：三工具优于 `async` 参数（静默开关的失败可检测性更差）、cancel 墓碑语义、goal 判等降维为 structured key。

## 2. critic 审稿（arch 档）

### 2.1 BLOCKER

**0 条。** critic 逐条核对了四类 BLOCKER：取代流程（两篇 Parent 条款均显式声明）、备选方案与取舍（两篇均有选项对比表）、同一决策自相矛盾（见 §4 SHOULD_FIX 1，措辞矛盾已改写）、未决问题伪装成已决（worktree 隔离、持久队列、编排 agent 均明确标注为后置/否决）。

### 2.2 critic 回答的 8 个定向问题

| # | 问题 | critic 结论 |
|---|---|---|
| 1 | 两篇 ADR 拆分是否正确 | ✅ 正确。归一是独立 bug 修复（非 worktree 零行为变化），multi-backend 是编排能力；依赖方向已在两篇 Parent 互相声明。不合并、不再拆 |
| 2 | 新增 dispatch 是否破坏 §6.1「单一工程出口」 | ⚠️ 字面冲突但化解方向正确 → 见 §4 SHOULD_FIX 2（已补口径扩写 + 承诺同步修订 §6.1） |
| 3 | D2 名册切分是否自洽、兜底路径是否有漂移面 | ⚠️ 兜底路径与探针脱节 → 见 §4 SHOULD_FIX 3（已补 cursor 续扫硬约束） |
| 4 | goal_key 判等是否名不副实 | ⚠️ 方向与提问相反：机制拦的是"换 slug 拒续接"（硬强制成立）；未覆盖的是"同 slug 异目标" → 见 §4 SHOULD_FIX 4（已补方向性说明） |
| 5 | D5 聚合与 `ADR-delegate-delivery-evidence` 是否一致 | ✅ 逐字同构，无措辞分叉 |
| 6 | Verification 是否都是前瞻判据 | ✅ 两篇全部是可勾选、可执行的场景构造，无实测日志复述 |
| 7 | D6「先互斥、worktree 后置」是否留返工缺口 | ⚠️ staging 成立，但缺前瞻注记 → 见 §4 NITS 2（已补互斥键改 workRoot 的注记） |
| 8 | D3 双值接受是否引入安全缺口 | ❌ 不构成缺口，但论证缺失 → 见 §4 SHOULD_FIX 5（已补安全边界论证） |

### 2.3 critic 要求的实跑核对

critic 标注了一条未验证的推断场景：「front 换代重建名册按探针 P2c 构造（造 2 个 idle 超 limit 窗口的后端，验证兜底路径是否漏扫）」。

→ **已转为 Verification 判据**（第一篇 Verification「兜底路径扫全量」条），由实施期/验收期实跑，非本轮结论。

## 3. 两篇 ADR 的关系

```
ADR-canonical-root-normalization（bug 修复，先落地）
        │ 提供归一后的 canonical_root（stateRoot/workRoot）
        ▼
ADR-front-multi-backend（编排能力，后落地）
        │ goal_key 引用归一后的 canonical_root
        │ D6 第二步（worktree 隔离）依赖 stateRoot/workRoot 拆分
        ▼
（后置）worktree 隔离 ADR —— 互斥键须改为 workRoot
```

依赖方向在两篇的 Parent 条款互相声明，无单向隐含。

## 4. SHOULD_FIX / NITS 闭合记录

| # | 级别 | 位置（critic 给） | 问题 | 处置 |
|---|---|---|---|---|
| 1 | SHOULD_FIX | `ADR-front-multi-backend.md:58` | 「既有 prompt/手册/E2E **全部不受影响**」与同文「prompt 契约必须同步改」**字面矛盾** | ✅ 改写为「`delegate` 既有语义与判据全部不变；prompt/手册需**新增** dispatch 三工具契约」 |
| 2 | SHOULD_FIX | `ADR-front-multi-backend.md:10,56` | 与 §6.1 不变式 1「唯一工程出口」字面冲突；化解论证未引用 §6.3 依据 | ✅ Parent 条款加「唯一工程通道 → 唯一门控插件出口」口径扩写；D1 补不变式说明 + §6.3 既有依据 + 承诺同步修订 §6.1 措辞 |
| 3 | SHOULD_FIX | `ADR-front-multi-backend.md:80-84` | D2.4 兜底路径与探针 P2c 脱节：未写 cursor 续扫要求；`directory` 过滤无法用于跨目录重建；`search` 依赖未定义的 title 前缀 | ✅ D2.4 重写为「全库 list + cursor 续扫」，列 3 条硬约束（必须续扫到全量 / 不能用 directory 过滤 / search 只能作可选优化且需定义 title 前缀）；Verification 补「兜底路径扫全量」判据 |
| 4 | SHOULD_FIX | `ADR-front-multi-backend.md:94` | 同 slug 异目标的**假接受方向**未披露 | ✅ D3 补「判等的方向性」小节（换 slug = 硬强制；同 slug 异目标 = prompt 纪律 + 可审计）；风险章补一行；Verification 补行为文档化判据 |
| 5 | SHOULD_FIX | `ADR-canonical-root-normalization.md:70` | D3 双值接受的安全边界论证缺失 | ✅ D3 补论证（workRoot 恒为真实 git toplevel ⇒ 跨仓冒充不成立，放宽的只是同仓内路径变体）；风险章补「workRoot 不得接受入参」的实施约束 |
| 6 | NITS | `ADR-front-multi-backend.md:60` | 探针编号错位（「R4 附注」实际记在 R6 节） | ✅ 改为「探针报告 R6 节记录的 round 4 现象」 |
| 7 | NITS | `ADR-front-multi-backend.md:123` | D6 第二步未注记互斥键需从 stateRoot 改为 workRoot | ✅ D6 补前瞻注记（供后续 ADR 引用） |

**复审判定**：critic 判 0 BLOCKER，评审预算（同一 change ≤ 2 轮）已用 1 轮；SHOULD_FIX 依评审规则直接修、不触发复审。5 SHOULD_FIX + 2 NITS 全部闭合，无新增 BLOCKER。

## 5. 已知残留（ADR 内已披露，非本轮可闭）

- **上游语义漂移**：`delivery` 默认值、`time.busy` 存在性、`session.list` 过滤字段都是上游行为 ⇒ 已写进两篇的风险章 + opencode 升级回归清单要求。
- **同 slug 异目标**无法机制识别 ⇒ 依赖 prompt 纪律 + ledger 事后审计。
- **插件 ctx 无 `inbox` API** ⇒ 队列内容不可直接观测 ⇒ D7 用墓碑语义规避。
- **front 换代后名册重建**为推断场景 ⇒ 已转为 Verification 判据，实施期实跑。
- **worktree 隔离、持久队列、编排 agent** 均明确后置/否决，未伪装成已决。

## 6. 审稿结论

**APPROVE。** 两篇 ADR 满足 arch 档四要素（元数据 / 背景与问题 / 决策 / 选项对比表 ≥3 行 / 独立后果代价章 / 前瞻 Verification），无 BLOCKER，SHOULD_FIX 已闭合，决策面与既有三篇 ADR 无未声明冲突。

**Status 转换**：`Proposed` → `Accepted`（**未实施**）。关联 change 尚未立项（`backlog: front-multi-backend` / `backlog: canonical-root-normalization`），AC 映射暂缺，待 planner 立项后回填。
