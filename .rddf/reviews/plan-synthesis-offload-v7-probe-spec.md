# V7 探针规格（交接给新根会话）

> 判据真源：`ADR-plan-synthesis-offload` 的 **V7** ——
> 「根 per-topic 上下文降幅：根 `tokens_input` 增量 **≤ 60,000**（对照：自己做 = 114,842）；且根的 tool 调用中**无** `nodes/n[1-7]/RESULT.md` 的 read」。
> 本文把「怎么量」钉死，避免不同会话量出不同数字。

---

## 0. 为什么必须在新会话跑

本仓上一轮测量（`.rddf/reviews/plan-synthesis-offload-ab-verdict.md` §5）明确：

- `tokens_input` = **当前上下文大小（非累计）**；主会话从派发前的 `660,577` 单调增长到 `891,942` ⇒ 增量 `+114,842`。
- 主会话此前已吸收过全部 7 份 RESULT ⇒ **增量不可归因**（无法区分「做题成本」与「已有材料」）。

⇒ **V7 必须在一个「从未读过 `nodes/n*/RESULT.md`」的新根会话里跑。**

## 1. 量测口径（**必须照此算，否则数字不可比**）

```
增量 = 末条 assistant 的 tokens.input  −  首条 assistant 的 tokens.input
```

两条 SQL（`<SID>` 替换为被测会话 id）：

```sql
-- 首条 assistant 的上下文大小（基线）
SELECT json_extract(data,'$.tokens.input')
FROM session_message
WHERE session_id='<SID>' AND type='assistant'
ORDER BY seq LIMIT 1;

-- 末条 assistant 的上下文大小
SELECT json_extract(data,'$.tokens.input')
FROM session_message
WHERE session_id='<SID>' AND type='assistant'
ORDER BY seq DESC LIMIT 1;
```

> ⚠ **不要**用 `session_v2.tokens_input`（它是会话级的最后一次值，但跨压缩/跨轮次的语义未定；用 per-message 的 `$.tokens.input` 首末差最稳）。
> ⚠ **不要**用 `tokens_cache_read` 作口径（ab-verdict §6 第 3 条已实测其不可作单次测量）。

**S3 的读调用取证**：

```sql
SELECT data FROM session_part
WHERE session_id='<SID>' AND type='tool'
ORDER BY ordinal;
```
在输出里 grep `nodes/n[1-7]/RESULT.md`（或 `nodes/n1`…`nodes/n7`）⇒ **必须 0 命中**。

## 2. 两个探针（按忠实度排序）

### Probe B —— **V7 的正式判据**（忠实：跑完整 offloaded 路径）

在新根会话里复刻「合成外置」的完整链路，全程**不读**任何内容节点 RESULT：

| 步 | 动作 |
|---|---|
| 1 | 新建一个 topic（如 `v7-probe`），沿用 `build-worker-design` 的 7 个 BRIEF（内容可简化，但**节点数保持 7**、deps 结构保持） |
| 2 | 逐节点 `claim` → 派 `plan-worker` → `close`（**父不读产物**，只看 pointer + 摘要） |
| 3 | 加合成节点 `m1`（`deps` = 7 个内容节点），派发（**A 档：带 `model`**）→ `close` |
| 4 | 父**只读** `nodes/m1/RESULT.md`，据此作答 |
| 5 | 量 `增量` 与 S3 |

- **成本**：8 次子会话（7 内容 + 1 合成）+ 1 次真会话额度。
- **判据**：增量 ≤ 60,000 **且** S3 零命中 ⇒ **V7 PASS**。

### Probe A —— **便宜的先行检查**（只测「消费侧」，**不能替代 B**）

复用**已结算**的 `.rddf/plan-topics/build-worker-design/`（7 内容节点已完成，答案节点 = `m2`），在新根会话里：

| 步 | 动作 |
|---|---|
| 1 | 新根会话，**不读**任何 `nodes/n*/RESULT.md` |
| 2 | 只读 `nodes/m2/RESULT.md`（35,265 B），据此回答用户的问题 |
| 3 | 量 `增量` 与 S3 |

- **成本**：0 子会话（纯读 + 答）。
- **能证明什么**：**S3**（无 n1..n7 的 read）✅ 完全成立；**S2**（增量）只能给出**下界** —— 它跳过了 dispatch 阶段的上下文开销 ⇒ **增量会系统性偏低**，不能单独判 V7 通过。
- **用途**：先花 5 分钟确认「只读合成稿就够答」这件事成立；再决定要不要花 8 次子会话跑 B。

## 3. 通过条件

| 判据 | 通过条件 | 备注 |
|---|---|---|
| **S2** | `增量 ≤ 60,000` | 对照值 114,842（根自己读完全部材料并写合成稿） |
| **S3** | read 调用中 **0** 命中 `nodes/n[1-7]/RESULT.md` | 只看 `m*/RESULT.md` 与 `BRIEF.md` 不算违规 |
| 附加 | 答案正确（对照 `m2` 的结论） | 只答得省不算；要与合成稿一致 |

## 4. 交接用 prompt（可直接粘贴给新会话）

> 下面这段是给**新根会话**的。请按你的实际情况替换尖括号。

```
任务：跑 plan-synthesis-offload 的 V7 探针（只做这一件事，不要改仓库代码）。

背景：V7 = 「根 per-topic 上下文降幅 ≤ 60,000（对照 114,842）；且根的 tool 调用中无 nodes/n[1-7]/RESULT.md 的 read」。
规格见 .rddf/reviews/plan-synthesis-offload-v7-probe-spec.md，请先读它。

请做 Probe <A|B>：
<Probe A 的话> 复用 .rddf/plan-topics/build-worker-design/：不读任何 nodes/n*/RESULT.md，
              只读 nodes/m2/RESULT.md，然后回答「这个 topic 的结论是什么、最重的三条发现是什么」。
<Probe B 的话> 新开 topic v7-probe，沿用 build-worker-design 的 7 个 BRIEF，逐节点 claim→派 plan-worker→close
              （父不读产物），再加合成节点 m1（deps=7 内容节点，用 subagent 的 model 参数指定强模型），
              close 后父只读 nodes/m1/RESULT.md 作答。

完成后请报告三件事（全部用 SQL 取证，不要估算）：
1. 你的会话 id 与 S2 增量：首条/末条 assistant 的 json_extract(data,'$.tokens.input')，两者相减。
2. S3：session_part 里 type='tool' 的 data 中，是否有 nodes/n[1-7]/RESULT.md 的 read（逐条列出 read 的路径）。
3. 结论是否与 nodes/m2/RESULT.md（Probe B 用 m1）一致。

⚠ 不要用 session_v2.tokens_input，不要用 tokens_cache_read。
⚠ 不要改仓库文件；探针结论贴回来即可，不要提交。
```

## 5. 已知风险 / 陷阱

| 陷阱 | 后果 | 规避 |
|---|---|---|
| 用 `session_v2.tokens_input` 而非 per-message 首末差 | 数字与 114,842 不可比 | 照 §1 的两条 SQL |
| 用 `tokens_cache_read` 作口径 | ab-verdict 已实测其不可作单次测量 | 禁用 |
| Probe A 的增量被当成 V7 通过 | 系统性偏低（跳过 dispatch 开销） | Probe A 只判 S3 + 下界 |
| 父在中途「顺手」读了某个 `n*/RESULT.md` | S3 直接失败 | 派发后只认 pointer + 摘要 |
| 合成节点用了弱模型 | 答案质量下降 ⇒ 「答得省但答错」 | 合成节点必须带 `model`（A 档） |
| 新会话的 system prompt 本身很大 | 首条 `tokens.input` 已含它 ⇒ 增量口径不受影响（首末差已抵消） | 只需保证首末都用同一条口径 |
