# PT-1 真宿主运行时证据（B1 真宿主层）

> 触发：路线图 B1 的「真宿主 PT-1」；用户裁决（2026-11-26）= **一次性首跑 + 变更触发**（不是「每批收尾都跑」）。
> 用例：`/workspace/main/rdd-workflow-e2e/tests/integration/test_plan_topics_runtime.bats`（`E2E_REAL_RUNTIME=1` 门控，默认 skip）。

## 1. 它证明什么（只证明这一格）

零模型层（`test_plan_topics_cli.bats`）已证明 **CLI 契约**对；**证明不了**的是：真 `plan` 会话里宿主的 **permission / shell 白名单 / 工具接线**允不允许协议命令执行。

⇒ PT-1 唯一要回答的就是：**真 plan agent 能不能真的跑 `claim` / `close` / `check`**。协议逻辑本身仍由 L1 覆盖，本条不重复。

## 2. 实跑结果（2026-11-26，1 次真会话）

`E2E_REAL_RUNTIME=1 bats tests/integration/test_plan_topics_runtime.bats` ⇒ **ok 1**。

模型**逐字执行**了提示里给的 5 条命令（无改写、无绕过）：

```
bun <OC_ROOT>/scripts/plan-topic-check.ts claim <topic> a1
printf -- '- [x] done\n' > <topic>/nodes/a1/TODO.md
printf '# 结论\n\n正文。\n' > <topic>/nodes/a1/RESULT.md
bun <OC_ROOT>/scripts/plan-topic-check.ts close <topic> a1
bun <OC_ROOT>/scripts/plan-topic-check.ts check <topic> --phase final --json
```

**零工具错误**（无 permission 拒绝、无 `cannot ask`）。

断言全部成立：
1. `claim` / `close` 都被**真的执行**（不是只被"看到"）；
2. 无 permission 拒绝；
3. 状态推进：`attempts` 恰 1 条、`finished_at` 已写（close 生效）、`input` 快照在位；
4. **收敛**（harness 侧独立复算，不采信模型自然语言）：`check --phase final --json` exit 0 且 `"converged":true`。

## 3. 由此确定了什么

**plan agent 的 shell 白名单放行协议命令**（`opencode.jsonc` 的 plan 块 `shell["*"] = allow`，且无针对 `bun` 的 deny）⇒ 「宿主接线」这一格**成立**，B1 的最后一格补齐。

## 4. 运维承诺（一次性 + 变更触发）

- **首跑已完成**（本文件）。
- **重跑触发 = 变更触发**：只在「plan agent 权限 / shell 白名单 / 工具接线」变更的批重跑。
  - 本仓 `scripts/e2e-runtime.sh` 的触发表已把 `prompts/plan.md` / `prompts/plan-worker.md` 映射到本文件（`test_plan_topics_runtime.bats`）；`opencode.jsonc*` 的映射也覆盖 role-gate/subagent-contract/push-gate 三族。
- **不做**「每批收尾都跑」—— 成本高在其绑定了错误的原因（见提案 `runtime-e2e-coverage-new-mechanisms` §0 子决策 B 的讨论）。

## 5. 诚实边界

- 本条**不覆盖**：模型行为面（是否照纪律转述）、`fork-join` 编排（spawn → 宿主合成消息唤醒 → join）—— token `PLAN-TOPICS-MODEL-BEHAVIOR-NOT-COVERED` / `PLAN-TOPICS-FORK-JOIN-NOT-COVERED` 保持。
- 本条默认 skip ⇒ 不进 CI；由本机触发机制或人工 `--all` 调起。
