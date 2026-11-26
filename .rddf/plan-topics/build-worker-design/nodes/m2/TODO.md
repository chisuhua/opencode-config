# TODO — m2：合成稿（A 档复测）

- [x] 读 `nodes/m2/BRIEF.md`（输入契约 / 硬判据 / 已知缺陷 3 条 / 五节结构）
- [x] 读 `nodes/n1..n7/RESULT.md` 全部 7 份（244,703 bytes / 2,241 行）
- [x] 读 `nodes/m1/RESULT.md`（**只读对照**，不作为素材）
- [x] 读 `TOPIC.md`（只读）
- [x] 读 `SYNTHESIS.md`（**只读**；结构参考，措辞不得照抄）
- [x] 直读核实 3 条已知缺陷的锚点：`lib/commit-gate.ts:158`（只认 `commit`；`merge`/`rebase`/`cherry-pick` 全文零命中）、`lib/delegate-core.ts:1266-1288`（`classPermissions` 无 delegate 规则）+ `:2460-2462`（last-match-wins）、`lib/delegate-core.ts:1413-1415`（`ownerAgentOf` 字面二值）
- [x] 补核 `.rddf/plan-topics/build-worker-design/graph.json:142`/`:147`（`owner:"parent"` vs `agent:"plan-worker"` 活体实例；**行号较 n4 记录漂移 +1**，已在 §4 标注）
- [x] 写 §1 结论（5 条，每条回指 node + 小节）
- [x] 写 §2 各节点结论的合并（覆盖 n1–n7 全部 7 行 + 跨节点一致性核对）
- [x] 写 §3 父的裁决汇总（33 条 ≥ 各节点「待父裁决」合计 31 条）
- [x] 写 §4 反哺清单（23 条，每条带稳定 `path:line`；**已知缺陷 3 条全部在内**）
- [x] 写 §5 不声称的东西（6 条，含「不可机判的是什么」）
- [x] 自查：正文 ≥ 100 行；总大小 ≤ 40,000 bytes；末行 `## STATUS: COMPLETE`
