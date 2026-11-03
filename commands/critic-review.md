---
description: 用 7 字段上下文契约调 critic 审查当前改动
agent: build
---

调 critic 审查当前工作区的改动。**重点是把上下文给够**，不是把脚本跑完就完事。

**用法**：
- `/critic-review` — 默认审查所有未提交改动（tracked）
- `/critic-review --staged` — 仅审查已 staged 改动
- `/critic-review --include-untracked` — 同时列出未跟踪文件
- `/critic-review main` — 与 main 分支对比
- `/critic-review <任意 ref>` — 与该 ref 对比

**完整流程**：

**Step 1：生成骨架**

跑下面的脚本，把输出捕获下来作为 critic prompt 的起点：

!`bash ~/.config/opencode/scripts/build_critic_prompt.sh $ARGUMENTS`

脚本会自动填 3 个字段（changes_summary + review_profile 的路径推断 + diff_or_paths），剩 4 个 TODO 字段需要补。

**Step 2：补全 4 个 TODO 字段并核对 `review_profile`**

- `intent` — 这次改动要解决什么问题、为什么这么做（最重要）
- `focus` — 评审重点 2-3 条架构级问题（如"是否符合 ADR-046" / "契约是否会被冻错" / "目标场景失败模式"）
- `review_profile` — 核对脚本推断的档位（`arch` / `plan` / `build` / `archive`，跨档写多个），按产物路径判，**不按 role.json 判**
- `context` — 相关测试路径、复现命令、关联 ADR/issue
- `expected_format` — 已预填"请按 4 段式返回 + mergeable/scope_exceeded"，无需动

如果改动很复杂、改动≥3 文件、跨模块、涉及并发/API 改动，**优先**走方式 A（用 context-builder subagent 自动组装）。否则按上面的骨架手填。

**Step 3：调 critic**

把 Step 2 补全后的完整 prompt 用 `subagent` 工具调 critic：

```
agent: "critic"
description: "审当前改动"
prompt: <Step 2 补全后的 7 字段 prompt>
```

**Step 4：处理 critic 返回**

- 有 BLOCKERS（`mergeable: no`）→ 修；**同一 change 最多 2 轮评审**，第 3 轮起需用户明确批准
- 无 BLOCKERS + 有 SHOULD_FIX → 记录到 change notes / backlog，放行
- `scope_exceeded: true` 的条目 → 记 backlog，不返工
- 无 → 继续下一步（commit / PR）
- 复审只提交「上一轮 BLOCKER 闭合证据 + 本轮新增 diff」，不要全量重审

**契约**：critic prompt 必须包含 7 字段（changes_summary / intent / focus / review_profile / diff_or_paths / context / expected_format），缺一会漏审。详见 `prompts/critic.md` 的"你的协作接口"章节。

**自检清单**（调 critic 前 30 秒过一遍）：
- [ ] 这次真的需要架构审稿吗？（纯执行改动 → verifier / CI）
- [ ] 本 change 已用几轮？≥2 轮且用户未批准 → 停手
- [ ] 改动文件数 / 模块数 / 契约面影响已识别？
- [ ] `intent` 写出来了？（不是"改 X"，而是"为什么改 X"）
- [ ] `focus` 列了 2-3 条架构级重点？
- [ ] `review_profile` 选对了吗？（按产物路径，不按角色）
- [ ] diff 只含本轮范围？
- [ ] 复现命令给了？
- [ ] 关联 ADR / issue 提了吗？
- [ ] prompt 里没有"攻击新判据 / 找逃逸 / 变异测试"这类开放式指令？