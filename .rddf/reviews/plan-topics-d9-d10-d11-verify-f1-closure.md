# F-1 闭合补验记录（`plan-topics-d9-d10-d11-verify.md` 的追加复核）

> **本文件是追加复核记录，不是对原报告的改写** —— 原报告 `.rddf/reviews/plan-topics-d9-d10-d11-verify.md` 按「历史报告不回改」惯例保持原样（其 verdict 仍为 `needs-revision`，记的是**当时**的事实）。本文件只提供 F-1 闭合的**新证据**。
> 触发：路线图 `.rddf/roadmap/test-debt-e2e-followup.md` 任务 **A1**（critic SF-4 要求「闭合 needs-revision 必须产生新的可见证据」）。

## 1. 被验对象

- 原报告：`.rddf/reviews/plan-topics-d9-d10-d11-verify.md` §9 结论第 2 条
- 原判定：**`needs-revision`（1 项）**，唯一未闭合 = **F-1**：`.rddf/rollback/plan-topics.json` 的 `notes` 散文仍写旧单文件路径（ADR D5 硬约束 ⑥）
- 分类：`implementation_gap`（文档级、零机械影响）

## 2. 修复内容

| 项 | 值 |
|---|---|
| 文件 | `.rddf/rollback/plan-topics.json` |
| 字段 | `notes`（散文段落，非 `edits[]`/`delete`） |
| 改动 | `... 已落盘产物与 `.rddf/state/plan-sessions.json`（停止写入即可）` → `... 已落盘产物与 `.rddf/state/plan-sessions/`（目录形态；停止写入即可）` |
| 未动 | `edits[]`（27 条）**逐字节不变**（前后 `json.dumps(sort_keys=True)` 比对 == `True`）；`delete` / `drill_env` / `verify` / `retire` / `last_drill` 均未改 |

## 3. 复跑命令与输出

```bash
# AC ①：notes 不再含旧单文件路径
python3 -c "import json;print('plan-sessions.json' in json.load(open('.rddf/rollback/plan-topics.json'))['notes'])"
# => False

# AC ① 附：edits[] 逐字节未变（前后快照比对）
# => edits[] 逐字节不变: True | edits 条数: 27

# AC ③：回滚清单自检（含 bun test tests/）
bun scripts/rollback-drill.ts .rddf/rollback/plan-topics.json
# => PASS: plan-topics 回滚后验证全绿（bun test tests/）
```

`bun test tests/` 独立复跑：**1229 pass / 1 skip / 0 fail**（1230 例，34 文件）。
`bash scripts/check-upstream-anchors.sh`：**30/30**。

## 4. 结论

- **F-1 已闭合**（原报告的唯一未闭合项）。
- 按原报告 §9 第 3 条的口径 ⇒ **本批判定可转为 `pass`**；原报告文件**不改**，本记录即为转换依据。
- 遗留：`docs/CHANGELOG.md` v2.75 由用户补（verifier 不在写集）。
