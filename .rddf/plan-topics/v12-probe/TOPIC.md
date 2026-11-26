# TOPIC — v12-probe

## 目标
验证 `plan` 侧多会话协作的 **fork-join 运行时行为**（ADR V12 六子项中可在单会话内验证的部分）。

## 全局约束
- 两个内容节点 `a1` / `a2` **无相互依赖**（用于验证「同一轮并行派发」）。
- 每个 worker 只写自己 `nodes/<id>/` 下的 `TODO.md` / `RESULT.md`。
- 判据：`bun scripts/plan-topic-check.ts check .rddf/plan-topics/v12-probe --phase final`。

## 本探针要回答的
1. 同轮 `background` 并行派两个 `plan-worker` 是否都成功（V12 ①）
2. 两个子会话的 `parent_id` 是否都等于本根会话 id（V12 ②）
3. 子会话内 `$OPENCODE_SESSION_ID` 是否等于其自身 id（V12 ③）
4. 两条完成合成消息是否都到达父（V12 ④）
5. 同父 `subagent(sessionID=)` 续接是否成功且子能读自己的 `TODO.md`（V12 ⑤）
6. **负向探针**：worker 内调 `subagent` 是否被拒（AC4 的唯一运行时证据）
7. V12 ⑥（父死重建 / 新根拒续接）**本会话无法造**（需新根会话）⇒ 另行登记
