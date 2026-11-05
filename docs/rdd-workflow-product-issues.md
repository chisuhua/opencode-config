# rdd-workflow 产品侧待提交 issue 清单

> **用途**：本文件汇总本仓（`~/.config/opencode`，opencode 配置仓）在实施治理面规则
> **v2.2.0「实施阶段的新发现」**时，通过阅读 rdd-workflow 产品源码发现的 **4 处产品缺陷**。
> 每个小节可直接作为**独立 issue** 提交到上游 `chisuhua/rdd-workflow`。
>
> **为什么现在提**：治理面 v2.2.0 新增了「builder 实施中发现设计漂移 → 落 feedback → 回环 architect/planner」
> 的规则，其读通道依赖产品的 `rddf feedback list` / `rddf arch feedback`。核查后发现产品侧
> **builder → planner-feedback 的提升链未接线**，且 `rddf arch feedback` 对 appender 产出的条目会崩。
> 治理面已按**现实**（而非文档描述）写规则，并在 `prompts/build.md` 的
> 「实施阶段的新发现」表里注明「勿依赖 `.planner-feedback.json` 提升链」。
> **产品侧修好后，治理面那行警示注释需要同步更新**（否则会变成过时描述）。
>
> **环境**：rdd-workflow（`~/.agents/skills/rdd-workflow` → `/workspace/main/rdd-workflow`），
> 核查日期 2026-11-05；证据均为源码行号，可用 `grep`/`sed` 直接复核。
>
> **优先级建议**：A/B 影响「agent 能否看见交回来的东西」→ 先修；C 影响数据不丢 → 次之；
> D 是文档与实现的一致性 → 随 A/B/C 一并收敛。

---

## Issue A — `route_feedback` 无生产调用方：builder → `.planner-feedback.json` 提升链未接线

**证据**

- `_lib/builder_feedback_router.py:10-27` 定义了 `route_feedback()`，其 `_append_to_planner_feedback()`
  会把 `kind == "ac-fail"` 的条目写进 `.rddf/state/.planner-feedback.json`。
- 全仓检索（`grep -rn "route_feedback" --include=*.py --include=*.sh .`）**除定义外只有测试引用**，
  `_lib/cli/`、`scripts/`、`skills/` 下**无任何生产调用方**。
- `rddf feedback add` 的 CLI 路径（`_lib/cli/feedback_cmd.py`）只调用 `append_feedback()`，
  **不调用** `route_feedback()`。

**影响**

`skills/rdd-builder/SKILL.md:401-403` 声明的
「Phase 2 ADR-drift detection → `rddf feedback add --kind ac-fail --from rdd-builder` →
Routed via `_lib/builder_feedback_router.py` to `.planner-feedback.json` → Architect reads via
`rddf arch feedback`」**在实现上不成立**：builder 提交的 `ac-fail` 只落在
`.rddf/improvements/<proposal>.md` 的 `## Feedback` 段，`.planner-feedback.json` 不会被写入。
结果是 **architect 侧的 advisory 视图看不到 builder 交回的 ADR 漂移**，回环静默断裂。

**复现**

```bash
rddf feedback add <proposal> --from rdd-builder --kind ac-fail --body "ADR-0007 前提不成立"
ls .rddf/state/.planner-feedback.json        # 不存在或无新增条目
rddf arch feedback                           # → "No planner feedback recorded."
```

**建议修法（二选一，倾向 a）**

- (a) 在 `rddf feedback add` 的 CLI 成功路径调用 `route_feedback(entry, project_root, ...)`，
  让「声明在 SKILL.md 里的通道」真正生效；
- (b) 若暂不接线，则删除 `_lib/builder_feedback_router.py` 的提升逻辑，并把
  `SKILL.md:401-403` 改写为「落 improvement 文件的 `## Feedback` 段；architect 经
  `rddf feedback list <proposal>` 读」——**二选一即可，但文档与实现必须一致**。

---

## Issue B — `rddf arch feedback` 对 `rddf feedback add` 产出的条目会抛 KeyError

**证据**

- `_lib/cli/rdd_arch_cmd.py:67-68` 逐条读取 `e['severity']`、`e['status']`、`e['proposal']`。
- `_lib/feedback_appender.py:111-133`（`_render_entry`）渲染的条目**只有**
  `source` / `kind` / `body`（+ `created_at` / `ref_change` / `resolution`），
  **不产出** `severity` / `status` / `proposal`。
- 两者一旦相遇（Issue A 修好后，builder 的 `ac-fail` 就会进入 `.planner-feedback.json`），
  `rddf arch feedback` 直接 KeyError traceback，而不是显示条目。

**影响**

architect 的 advisory 通道**崩溃**而非降级展示；一旦 Issue A 修好，architect 角色每次读 feedback
都会拿到 traceback → 回环无法读取交回内容。

**复现**

```bash
# 往 .rddf/state/.planner-feedback.json 里放一条 appender 形状的条目
# （source/kind/body/created_at/ref_change/resolution），然后：
rddf arch feedback        # → KeyError: 'severity'
```

**建议修法**

`_cmd_feedback` 改用 `.get()` + 默认值（该函数对 `stale` 已经这么做了，只是对前三个字段没有），
或让 `_append_to_planner_feedback()` 在写入前把 appender 条目**规范化**为 planner-feedback 的字段形状
（`kind` 需从 `ac-fail` 映射到 planner 侧词表 `{unmapped_proposal, coverage_gap, adr_drift, roadmap_staleness}`，
见 `_lib/planner_feedback.py:45`）。**两者必须同时做其中一件**，否则仍会崩。

---

## Issue C — planner-feedback 重算会静默丢弃 `open` / `acknowledged` 条目

**证据**

`_lib/planner_feedback.py` 的合并逻辑（`safe_recompute_planner_feedback` / `compute_planner_feedback`
的 merge 段，约 `:549-551`）：

```python
for fp, prior_e in prior_entries.items():
    if fp not in new_fps and prior_e.get("status") in ("resolved", "dismissed"):
        merged.append(prior_e)
```

即：**只有** `resolved` / `dismissed` 的旧条目在本次重算未复现时被保留；
`status ∈ {open, acknowledged}` 且 fingerprint 未被重新算出的条目**被直接丢弃**，无任何日志或标记。

**影响**

- builder 交回的、尚未被 planner/architect 处理的 open 条目，会在**下一次重算**时消失 → 漂移信号丢失，
  且用户看不到「有东西被丢了」。
- 数据结构里已有 `stale` 字段（`_lib/planner_feedback.py:70`）与 `reopened_count` 语义，
  说明设计意图是「保留 + 标记陈旧」，但实现只保留了终态。

**复现**

```bash
# 1) 造一条 open 条目（fingerprint 不由当前 state 推导得出）
# 2) 触发一次重算：rddf planner feedback sync
# 3) 该条目从 feedbacks[] 中消失
```

**建议修法**

把保留条件从 `status in ("resolved","dismissed")` 放宽为**全部旧条目**，
对未复现的旧条目置 `stale = True`（字段已存在）并保留原 `status`；
或至少在丢弃时写一条 `noted`/日志，让「静默丢弃」变成「显式陈旧」。

---

## Issue D — `skills/rdd-builder/SKILL.md` 的落点 / 读通道描述与实现不符

**证据**

| 位置 | 文档描述 | 实现事实 |
|---|---|---|
| `skills/rdd-builder/SKILL.md:291` | 「LLM 生成的 feedback body 经 `rddf feedback add` 写入 `.rddf/state/.planner-feedback.json`」 | `rddf feedback add` 写的是 `.rddf/improvements/<proposal>.md`（`_lib/cli/feedback_cmd.py` 的 description 明确写「Append feedback to .rddf/improvements/*.md files (single writer per ADR-0037)」）|
| `skills/rdd-builder/SKILL.md:401-403` | 「Routed via `_lib/builder_feedback_router.py` to `.planner-feedback.json`」 | 该路由**无生产调用方**（见 Issue A）|
| `skills/rdd-builder/SKILL.md:403` | 「Architect reads via `rddf arch feedback` (advisory)」 | 该命令读的是 `.planner-feedback.json`（`_lib/cli/rdd_arch_cmd.py:55-57`），而 builder 的条目落在 improvement 文件 → 读不到；且真读到会 KeyError（见 Issue B）|

**影响**

skill prompt 是 agent 的直接指令来源。文档说「写 A 处、从 B 处读」，实现是「写 C 处、可从 D 处读」——
agent 按文档操作会：把反馈提交到以为正确、实际无人消费的位置；architect 去读一个空文件；
两者叠加就是**回环静默断裂**（无报错、无痕迹）。

**复现**

按 `SKILL.md:291/401-403` 的描述执行一次 builder→architect 回环，
然后 `rddf arch feedback` 与 `rddf feedback list <proposal>` 分别查看 —— 两者内容不一致。

**建议修法**

随 Issue A / B / C 一并收敛：
- 若接线提升链 → 保留文档描述，但补齐字段规范化（否则触发 Issue B）；
- 若不接线 → 把三处描述统一改为「落 `.rddf/improvements/<proposal>.md` 的 `## Feedback` 段；
  architect 经 `rddf feedback list <proposal>` 读；`.planner-feedback.json` 提升链**当前未接线**」。

**注**：本仓（opencode 配置仓）的治理面已按「不接线」这一现实写规则并加了警示注释；
产品侧若改为接线，**该注释需同步更新**，否则治理面会指向一个已不成立的事实。
