# ADR 残留 #9 / #11 的闭合证据与拟改措辞（**待 architect 应用**）

> 目的：路线图 A 批遗留的 **A5**（ADR 残留「已闭合」标注）的前置材料 —— 证据与拟改措辞在此，**ADR 正文由 architect 改**（`docs/adr/**` 属 architect 面；builder 单方面改已签批 ADR 的登记内容属越权）。
> 审查配对：按 §审查配对 的 **ADR 行**，「只改措辞 / 闭合标注」⇒ **只 oracle**（不需 critic 双审）。
> 对象文件：`docs/adr/ADR-plan-multi-session-collaboration.md` §残留（`:316` / `:318`）。

## 1. 残留 #9（prompt 与回滚清单的同步）

**原文（`:316`）**：`prompt 与回滚清单的同步`：\`prompts/plan.md\` 的「多会话协作」整节与 \`docs/SUBAGENT-ORCHESTRATION.md\` §2.3 被 \`.rddf/rollback/plan-topics.json\` **逐字节钉死**（\`find\` 字符串）⇒ 同步它们**必须**同时改该清单，而该清单不在 architect 写集 ⇒ 归实现批（builder 面）。

**闭合证据**

| 证据 | 值 |
|---|---|
| 回滚清单的 `edits[]` | 共 **27** 条；其中 `prompts/plan.md` **9 条**（多会话协作整节：目录与单一写者 / `graph.json` / checker / fork-join-续接-重建-取消 / 同 topic 独占锁 / 运行态绑定 / 子结果只回指针）+ `docs/SUBAGENT-ORCHESTRATION.md` **2 条**（agent 表行 + §2.3）⇒ **两处都已逐字节钉进清单** |
| 回滚演练 | `bun scripts/rollback-drill.ts .rddf/rollback/plan-topics.json` ⇒ **PASS: plan-topics 回滚后验证全绿（bun test tests/）**（复跑实况：1127 tests / 0 fail） |
| 清单新鲜度 | `last_drill.content_hash` 已按 V8 回填（commit `cb91be2`）⇒ 清单与演练证据一致 |

**拟改措辞（建议）**：在条目前加闭合标注，保留原登记文字（历史不回改）——
`9. ✅ **已由 D9/D10/D11 批闭合（2026-11-26 复核）** —— prompt 与回滚清单的同步：…（原文保留）`

## 2. 残留 #11（D10 的落地顺序约束）

**原文（`:318`）**：\`input\` 快照与 \`stale_inputs\` 判据**不得早于** \`claim\` 写入点落地 ⇒ 否则 \`input\` 退化为「父手写的纪律型字段」（无机械强制 ⇒ 忘写即静默失效）⇒ 与 \`claim\` / \`close\` / \`cancel\` CLI 同批实现。

**闭合证据**

| 证据 | 值 |
|---|---|
| `input` 快照的写入点 | `scripts/plan-topic-check.ts:462` —— `cmdClaim` 在构造 attempt 时写 `input: currentInputProjection(topicDir, node)` ⇒ **快照由 claim 亲自产出**，不是父手写的字段 |
| `stale_inputs` 的产出点 | `lib/plan-topics.ts:691` —— 漂移判定发生在 **check** 侧（`final` 口径），且比的是「当前投影 vs attempt 快照」⇒ **不可能早于 claim 写入点** |
| 判据覆盖 | ADR 表 **V25**（claim 互斥 + attempt 含 `input` 快照）、**V27**（`stale_inputs` 指名）、**V28**（豁免与迁移，`dispatch` 口径不产生该码）均已通过（本批验收 21/21，见 `.rddf/reviews/plan-topics-d9-d10-d11-verify.md`；V25 的并发子句已在本批 A4 补进 CI） |

**拟改措辞（建议）**：`11. ✅ **已由 D9/D10/D11 批闭合（2026-11-26 复核）** —— D10 的落地顺序约束：…（原文保留）`

## 3. 同批可搭车的另一处（A5 的剩余半边，待确认是否同批做）

`docs/adr/ADR-plan-multi-session-collaboration.md` 的 **Verification 章导语**仍写「V01–V15 + V16–V21」，而表内已有 **V22–V36**（D10 / D11 增补）⇒ 导语与表的编号范围不一致（审计 SF-2）。
属同一 ADR 的**措辞订正**，可与上面两条同批改（同样走「只 oracle」路径）。

## 4. 建议的收口清单（architect 执行时逐条打勾）

- [ ] `:316` 残留 #9 加闭合标注（保留原文）
- [ ] `:318` 残留 #11 加闭合标注（保留原文）
- [ ] （可选）Verification 章导语补 V22–V36 的来源
- [ ] `bun test tests/` 全绿（ADR 文本改动不影响用例，但要跑一次确认没有守卫依赖 ADR 行号）
- [ ] 审查记录落 `.rddf/reviews/adr-plan-multi-session-collaboration-review-<n>.md`（oracle 判定 + 本文件作为证据附件）

⚠ **注意**：本仓有守卫会扫 `docs/**` 的路径 token（`tests/config-guards.test.ts` AC20 扫 `prompts` / `docs` / `commands` / `.rddf/improvements` / `.rddf/roadmap`）⇒ 改 ADR 时**不要引入新的旧路径字面量**（例如把 `.rddf/state/plan-sessions.json` 原样写进正文）。
