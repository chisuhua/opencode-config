# BRIEF — m4：合成稿（V4/V5/V6 全绿 + 9 项载荷）

## 目标

把本 topic（`v7-probe`）各内容节点（`deps` 所列 `n1`–`n7`）的 `RESULT.md` **收敛**成**一份** topic 级合成稿，写入 `nodes/m4/RESULT.md`。

**「收敛」不是「拼接」**：7 份子产出合计约 208,000 bytes。你要做的是**判断与取舍**，输出远小于输入。

**本稿是追加式重做**（`m1`/`m2` 留作审计痕迹）：前两稿分别漏了上游标记项与结论级证据链。**不要读、不要照抄** `nodes/m1`/`m2`/`m3`（它们不在你的 `deps` 里）。

## 边界（明确不做）

- **只读** `nodes/n1..n7/RESULT.md` 与 `TOPIC.md`；**只写** `nodes/m4/RESULT.md`。
- 不改 `graph.json` / `TOPIC.md` / 任何 `BRIEF.md`；不写 `.rddf/plans/**`。
- 不跑 `bun` / `node` / 写盘 shell。
- 不编造 `path:line`：找不到依据就如实标注「上游语义（未在本仓核实）」。

## 期望交付（`nodes/m4/RESULT.md`）

**恰好五节，顺序固定**：

### 1. 结论

- 3–5 条，每条**一句话可判定**。
- ⚠ 每条必须写成 `**C<n>【判定】** <一句话>`，**`**` 必须在行首**（不要加 `- ` 列表符号），`n` 限 C1–C99。
- 每条 C 定义行之后 **3 行内**必须有两行：

  ```
  - 证据链：C1 ← n3 §3 ← `scripts/plan-topic-check.ts:437-465`
  - 推断链：F1（可引事实）⇒ F2（可引事实）⇒ C1
  ```

  - 证据链里的 `path:startline` **必须在证据链回指的那个节点**的 `RESULT.md` 里**字面存在**（写 `path:437-465` 或 `path:437` 均可，判据只比 `path:start`）。
  - 推断链行必须含 `⇒` 或 `→`。

### 2. 各节点结论的合并

- 覆盖 `n1`–`n7` **全部 7 个**（标题：现有派发通道盘点 / 写隔离方案选型 / 合并与冲突语义 / 判据面设计 / 与 delegate 全局单槽的关系 / 与 rdd-builder P2 worktree 模式的关系 / 失败模式与回滚可达性）；每节点一行「结论（压成一行）+ 父的取舍（采纳 / 修正 / 否决 + 一句理由）」。

### 3. 父的裁决汇总

- 本 BRIEF 的 `## 根裁决集` 为「无」⇒ 本节写「无（BRIEF 未列裁决）」即可。

### 4. 反哺清单（**结论层**）

⚠ 下列 **9 个上游标记项的载荷 token 必须逐条字面出现在本小节**（写成行内 `` `token` `` 即可，不得只作依据引用）：

| 来源 | token | 上游标记 |
|---|---|---|
| n3 | `merge-commit-bypass` | 最重 |
| n4 | `merge-ungated-no-gate` | 最重 |
| n6 | `p2-unverifiable-upstream` | 最重 |
| n6 | `execute-skill-retired` | 必须上报 |
| n6 | `p2-upstream-drift` | 最重 |
| n6 | `orchestrator-write-unattributable` | 薄弱点 |
| n7 | `claim-spawn-gap` | 最重 |
| n7 | `reap-no-revoke` | 最重 |
| n7 | `stage3-not-manifestable` | 必须上报 |

- 每条给「现象 | 依据 `path:line` | 建议动作」；可另有其它条目，但上述 9 条不得少、token 必须与上表**逐字一致**。

### 5. 本 topic 不声称的东西（诚实口径）

- 至少 4 条「不声称」，含「不可机判的是什么」这一类。

## 验收口径

- **可回指**：第 1、3 节每条结论都能指到某个 `nodes/<id>/RESULT.md` 的具体小节。
- **覆盖完整**：第 2 节覆盖 n1–n7 全部；第 4 节含上表 9 个 token。
- **长度**：正文 **≥ 100 行**；输出 **≤ 40,000 bytes**；末行写 `## STATUS: COMPLETE`。

## 根裁决集

无
