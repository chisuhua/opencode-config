# ADR 审稿报告：ADR-plan-delegate-engineering-session

> 产出角色：architect（誊写审查者结论；审查者只读）
> 审稿对象：`docs/adr/ADR-plan-delegate-engineering-session.md`
> 日期：2026-11-13
> 结论：**Accepted** —— oracle `BLOCK` → 修订 → critic `REJECT`（1 BLOCKER）→ 修订 → critic 复审 `APPROVE_WITH_CONDITIONS / mergeable: yes`

---

## 1. 审稿链

| 轮 | 审查者 | 判定 | 关键发现 | 处置 |
|---|---|---|---|---|
| 1 | oracle | `治理面判定: BLOCK` | **BLOCK**：D2 的白名单（`.rddf/improvements` / `openspec proposal` / `.rddf/roadmap`）与 plan **实际计划产出契约**不符 —— plan 的 prompt 写 `.rddf/plans/<slug>.md`（`prompts/plan.md:45-47`）、配置只放行 `.plans/*.md`（`opencode.jsonc:194`），两条线都没进白名单 ⇒ 中心 happy path 被 D2 自己的校验击穿；且"task 里引用文件"无解析口径、路径解析根未定义（插件进程 cwd ≠ 派发方 session cwd） | 全部采纳（5 条 finding）：① 白名单追加 `.rddf/plans/**`；② "task 引用"改为**专用字段 `plan_ref`**（绝对路径或相对 `project_dir`，解析根写死）；③ V06/V07 改判据；④ 错误信息列 accepted roots；⑤ D3 补"过滤只发生在 `sessions` 的 execute 内"；⑥ D5 补"`owner_agent` 缺失一律按 `front` 解释"；⑦ V10/V11 升级为含"委托实施 ≠ 自己实施"边界句 |
| 2 | critic | `REJECT` / `mergeable: no` | **BLOCKER**：accepted roots 与 plan **实际可写路径**矛盾（`opencode.jsonc:192-196` 的 plan edit 只放行 `.plans/*.md`，其余 `*` = ask）⇒ 实施方二义（改白名单？还是把 `.plans/*.md` 加回 accepted roots？）；**SHOULD_FIX**：无回滚口径；跨 owner 可见性论证未引用既有通道；**NITS**：D2 未明示"存在性 ≠ 相关性"、accepted roots 未标流程阶段、V04 未断言全局配额计数 | 全部采纳：① 采用 critic 的**处置①**（改写）：把「plan edit 放行 `.rddf/plans/*.md` + `prompts/plan.md` 口径收敛」写进 D1，并新增 **V15**；② 后果章增**回滚口径**（三步回退）；③ D3 增"被动可见性既有两条通道"；④ D2 增"非相关性证明"声明 + roots 流程阶段标注；⑤ V04 增全局配额计数断言 |
| 3（复审） | critic | `APPROVE_WITH_CONDITIONS` / `mergeable: yes` | 无 BLOCKER；确认上一轮 BLOCKER 已闭合（决策层二义来源消除、事实层待实施）；两条**措辞级** SHOULD_FIX（不阻断，不触发新一轮复审）：① D1「机械重合」措辞过强 ⇒ 改「accepted roots 必须**覆盖** plan 需要引用的计划类产物，且 plan 产出口径 `.rddf/plans/<slug>.md` ⊆ accepted roots」；② D2 补通则「**可写 ≠ 可引用**；accepted roots 是唯一判据，与 plan edit 白名单无包含关系」 | 已并入（随 Status 转 Accepted 一起提交） |

## 2. oracle 明确核实"无需改动"的项（复审时不重复上报）

- **D4 与既有 ADR 自洽**：`ADR-front-multi-backend` D6.1「每 workRoot 一槽，同仓不同 worktree 可各占一槽」；plan 与 front 各占一槽写同仓不同工作树 = 既有已签批并发形态，无新增写隔离缺口（变更检测按工作树取 `gitStatusPaths(workRoot)`）。
- **问题 5②（role.json 冲突）**：写入是 **partition-scoped**（`writeRoleSession` 只写后端自己分区），plan 派发只增加顶层镜像翻转频率，属展示面而非权限冲突 ⇒ 残留 #1 登记足够。
- **D4 改按 owner 分槽**：破坏 `scope` + `git status` 差集检测的构造性前提 ⇒ 排除（ADR 已正确排除）。
- **plan 继承 front 的 owner 身份**：归属不可追溯 ⇒ 排除（ADR 已正确排除）。

## 3. 放行条件（critic 复审给出）

1. 实施后核 **V15**：`opencode.jsonc` 的 plan `edit` 白名单真实新增 `.rddf/plans/*.md`；`prompts/plan.md` 中 `.plans/` 口径**零命中**。
2. **V06** 负例集成测试除「缺失 / 不存在 / 根外路径」三例外，补断言 `plan_ref` 指向 `.plans/*.md`、`docs/adr/draft-*.md`、`openspec/changes/*/design.md` 均被拒且错误信息列出 accepted roots。
3. **V04** 的全局配额计数（`lib/delegate-async.ts:969-974`、`:1199-1204` 保持 owner 无关）交 build / verifier 实测。

## 4. 自指与独立证据声明

本轮只新增/修改**一篇 ADR 文档**，未改 `prompts/oracle.md` / `prompts/critic.md` / `prompts/build.md` 的审查契约本身 ⇒ 不存在"审查实例跑旧契约"的盲区。但 ADR 的 Verification（V01–V15）是**前瞻判据**，其成立性只能由实施后的实测提供 —— 本审稿**不构成**"新能力正确"的证据，只构成"决策自洽、与既有 ADR 不冲突"的证据。

## 5. 归档指针

- ADR：`docs/adr/ADR-plan-delegate-engineering-session.md`（Status = Accepted）
- 本报告：`.rddf/reviews/adr-plan-delegate-engineering-session-review.md`
- 关联 change：尚未立项（architect 不创建 openspec change）→ 暂记 `backlog: plan-delegate-engineering-session`；立项后回填 ADR 元数据的「关联 change」与「AC 映射」两行。
