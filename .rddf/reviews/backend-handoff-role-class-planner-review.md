# planner 审稿：backend-handoff-role-class（improvement + proposal）

> 审查者：metis 1 轮（planner 固定审查者，见 `prompts/build.md` §审查配对）
> 对象：`.rddf/improvements/backend-handoff-role-class.md`、`openspec/changes/backend-handoff-role-class/proposal.md`
> 决策基线：`docs/adr/ADR-backend-handoff-role-class.md`（Proposed）+ spec v3（**决策本身不重审**）

## 判定

metis 返回 6 条 P0 + 6 条 P1 + 4 条 P2，**2 条是真错误**（不是措辞问题）：

1. **AC4 的 deny 顺序写反**：`evaluate` 取 findLast，`scopeEditRules` 是 `* deny` 在前、allow 在后（`lib/delegate-core.ts:547-553`）。原 AC4「deny 在后」若照写，verifier 连 `.rddf/reviews/**` 都写不了，**测试还会通过**（若只断言数组含两条）。
2. **HANDOFF 首行与角色开场报告冲突**：`prompts/build.md:569` 要求每回合首条响应用 `【角色: …】`；若照此输出且本轮零写盘，`summarizeDelivery` 的 `final_is_role_opening=true` ⇒ `no_work_evidence=true` ⇒ `outcome=unverified`（`lib/delegate-core.ts:1283-1289`）⇒ **交接被系统判成失败**。

## 逐条处置

| # | metis finding | 级别 | 处置 | 落点 |
|---|---|---|---|---|
| 1 | AC4 的 `deny *` 顺序写反 | P0 | **采纳（勘误）**：改为断言 `evaluate` 净效果，不按下标；`deny` 在前 | proposal AC4 + §勘误；spec v3 AC7 待 architect 回填 |
| 2 | HANDOFF 首行 vs 角色开场报告 | P0 | **采纳**：`build.md` 契约写死「HANDOFF 回合省略开场报告」，并加 CI 断言（简报含该句） | proposal C.9 + AC22（prompts 落笔归 architect） |
| 3 | `build.md:513/537-550` 教窗口内自动切角色，与 D6「对被派发 session 不生效」冲突 | P0 | **采纳**：C.9 增「被派发 session 禁用窗口内切角色」 | proposal C.9 |
| 4 | `archRoots` 的 fallback 集未定义，易复刻 `survey()` 目录名启发式 | P0 | **采纳并简化**：态 2/3 只回退 `docs/adr`；仍无 ⇒ 空集 ⇒ 派发拒绝 + 指向 `arch-docs-init.sh`；明令不在 TS 复刻 survey | proposal A.2 + AC15 |
| 5 | 派发方没有「任务 → 类」判据，新参数会被空置 | P0 | **采纳**（用户诉求的另一半）：`plan.md` 派发表 + `front.md` 加列与「选错 ⇒ blocked」 | proposal C.10 |
| 6 | ADR 风险段的缓解措施（发现不符 ⇒ blocked）未落进简报模板 | P0 | **采纳**：写进 `buildBrief` 运行身份段 | proposal A.5 + C.9 |
| 7 | `sessions` 看不出 class，主会话只能猜 | P1 | **采纳**：items 回显 `role_class`（只读，零新状态） | proposal A.7 + AC20 |
| 8 | AC 编号三处不一致（ADR 元数据 AC1–AC13 vs 正文 14 条 vs spec 另一套） | P1 | **采纳**：proposal AC 表为唯一逐条口径；ADR 元数据回填归 architect | proposal 头注 + §勘误 |
| 9 | improvement / proposal / ADR 三份复述同一规则 | P1 | **部分采纳**：improvement 收敛为 3 面 + 指针；proposal 改为引用 D# 不复制规则；**ADR Verification 保留**（必备四要素要求可勾选判据，且同号 + 已声明口径） | improvement §What Changes；proposal §What Changes |
| 10 | AC8/AC9/AC12/AC4/AC5 证据载体不具体或指错文件 | P1 | **采纳**：权限断言落到 `delegate-core` / `delegate-async`；槽位回归落 `delegate-tool`；AC9 拆「简报文本（CI）+ 实际落点（手工）」，并写明 `rddf` 不可用时的替代证据 | proposal AC4/5/8/9/12 |
| 11 | 缺 6 条可自动化 AC | P1 | **采纳**：AC15（三态 + 空集拒）、AC16（简报分支）、AC17（存量兼容）、AC18（symlink 语义越界）、AC19（vanished 沿用 class）、AC20（sessions 回显）、AC23（枚举无新增） | proposal AC15–AC23 |
| 12 | HANDOFF 在 `rddf` 不可用 / 额度耗尽时无 fallback，可能死锁 | P1 | **采纳**：仍输出首行 + 完整 5 项正文，主会话读 `last_assistant_text`；复用 `build.md` 既有「无落点」分支，不新造通道 | proposal AC21 + Impact 外部依赖 |
| 13 | 建议两段式拆分 | P2 | **采纳**：`plan.md`/`front.md` 的 **resume 前置判据**拆出（prompts-only，待合并后立项）；**A/B + C.9 + C.10 不拆**（只有权限边界没有交回协议 = 受限 session 无出口） | proposal C.11 + 非目标 + 依赖与顺序 |
| 14 | 「若落实 D7 …」是带条件的 TODO | P2 | **采纳**：改为 `build.md` 的硬边界项（仅本次 Draft ADR + 双审闭合 + 完成标志 5 条） | proposal C.9 |
| 15 | 同一 `D7` 两个所指 | P2 | **采纳（规避）**：proposal 只写「父篇 D4 / 父篇 D7」，本 ADR 的 Status 决策按内容描述、不用编号 | proposal 非目标 / C.9 |
| 16 | Impact 未写「换类 = 新 session，上下文不继承」 | P2 | **采纳**：写入 Impact「用户可感知」行 | improvement §Impact；proposal §影响面 |

## 未采纳

无。metis 的 16 条全部处置（其中第 9 条按 ADR 必备要素部分保留）。

## 范围/权限说明

- `prompts/**` 属治理面，**planner 不落笔**：C.9 / C.10 记为归属 architect，由 architect 角色执行（本 change 的最小实现包不含它们的写权限）。
- `docs/adr/**` 属 architect 产出：AC4 勘误与 AC 编号回填需 architect 在原 ADR 上修正，本次只在 proposal 声明唯一口径。

## 结论

improvement + proposal 已按处置改写；`openspec validate` 通过。下一步需 builder 角色实施 A/B/C.9/C.10（本 change 无 `.rddf/plans/<name>.md`，实施需先由 builder 生成 plan）。
