# planner 审稿：resume-precheck-guidance

> 审查者：metis 1 轮（planner 固定审查者）
> 对象：`.rddf/improvements/resume-precheck-guidance.md`、`openspec/changes/resume-precheck-guidance/proposal.md`
> 预算：本 improvement 的 metis 轮次 = 1（已用满）

## metis 的关键发现与处置

| # | finding | 处置 |
|---|---|---|
| 1 | **AC1 异步分支的「`role_class` 符合预期」是恒真式**：`sessions` 回显的就是 `pair.json` 里派发时写进去的值，自己跟自己比 | **采纳**：改为**漂移检测**（条目 `role_class` 与本轮派发声明一致）；并明写「本文不判定能力正确性」⇒ 对 D3 修订免疫 |
| 2 | **「完成通知」机制不存在**（`dispatch` 只等消费确认） | **采纳**：触发点改为「用户回来 / 下次读 `sessions` 看到 `running=false`」，并加负向断言「不得出现『通知』」（AC7） |
| 3 | **AC2 的「逐字一致 `toEqual`」与它自己的目标相反**（两处正文 = 漂移面） | **采纳**：改为**单一真源 + 标题名引用**；旧重复正文（`plan.md` 硬规则 #5、`front.md §3.3`）**必须消失**（负向断言，AC5） |
| 4 | 缺**证据优先级**（三个来源并列会让主会话先看 `outcome`） | **采纳**：AC1 改为「有序证据链，下标递增」；AC2 明写「`succeeded` + `idle` ≠ 完成」 |
| 5 | 缺**feedback 增量/错配**处理（`list` 返回全部记录） | **采纳**：AC4 要求 `last_feedback_id` 记账 + 「只认新增条目」+ `rddf` 不可用时的文本兜底 |
| 6 | AC4 的「字段名集合相等」在 `build.md` 里是 ①②③④⑤ 散文，硬编码即假红 | **采纳**：改为**动态对照** `build.md` ①–⑤（测试内不得硬编码） |
| 7 | 「planner 自己改计划」与「不做自动闭环」打架 | **采纳**：改为「给草案 → 用户确认 → 再改」（①/② 表格行） |
| 8 | `suspend` 与「交回」混淆 | **采纳**：明写「交回后 `state=idle`、槽已释放 ⇒ 直接 resume 或重派，**不要先 suspend**」 |
| 9 | 存量条目对 D3 修订免疫不了（resume 不重设 permissions） | **采纳**：三条禁令之③「存量条目（无 `role_class` / scope 越新边界）一律重派、不复用」 |
| 10 | AI slop：`precheck` 一词诱导做工具/状态校验 | **采纳**：改名「交回后的收尾三问（写进 prompt，不落代码）」；负向 token 断言（AC7） |
| 11 | 交回后主会话可能自己上手做被交回的部分 | **采纳**：明写「主会话只做路由，不接管实施」（AC10 手工判据 + 正文） |
| 12 | 拆分是否成立 | **采纳**：三条判据写出（验证面不同 / 不改共享不变式 / 上游有 open `ac-fail` 会拖入签批阻塞）+ **解除条件**（若需改 `build.md` 5 项文本则回并） |

## 未采纳

无（12 条全部处置）。

## 结论

improvement + proposal 已按 metis 修订；`openspec validate` 通过。本 change 无代码路径改动，实施由 architect（prompts 属治理面）+ builder（守卫测试）完成，实施前需 oracle → critic 各 1 轮。
