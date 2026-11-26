# build-worker-design 场景验收记录

> **类型**：plan-topics 多节点真实场景跑通（**不是**机制变更的验收）
> **执行者**：build 主会话（父 / root-plan，session `ses_de8f57a3cffezCAvlmyBDCFShr`）
> **日期**：2026-11-26｜**分支**：`scenario/build-worker-design`｜**提交**：`097ce4b`
> **topic**：`.rddf/plan-topics/build-worker-design/`（7 节点 / 4 波 / 全部 closed）
> **合成稿**：`.rddf/plan-topics/build-worker-design/SYNTHESIS.md`

---

## 1. 场景是什么

**选题**：设计「`build` 侧多 wave 并行实施通道」。

**为什么是真问题**（n1 已证，本记录复核）：`build` **不存在**受治理的并行实施通道 —— 顶层五个 delegate 动作全 `deny`（`opencode.jsonc:30-34`），`build` 块无 delegate 键，8 个 subagent 的 `edit` 全 `deny`。且须把三件事分开记账：① 「build 无 delegate」= **刻意**（`.rddf/state/adr-front-agent-redesign.md:143,225`）；② 「build 无任何并行实施形态」= **能力缺口（无决策文本）**；③ 「同 worktree 并行写被拒」= **刻意排除**（单槽 + `(workRoot, builder)` 租约）。

**分解独立性**（防循环论证）：7 份 BRIEF 由**父手写**，未用 plan-topics 自身产出分解；BRIEF 点名的仓内路径由 worker 自行读取。

**波次结构**（真 DAG）：`wave1 {n1, n2}` → `wave2 {n3, n5, n6}` → `wave3 {n4}` → `wave4 {n7}`。

---

## 2. 机制行为实测（逐条）

| # | 判据 | 结果 | 证据 |
|---|---|---|---|
| M1 | 派发前 check（`--phase dispatch`） | ✅ exit 0 | 5 条 info 级 `cache_behind` |
| M2 | `claim` 闸门 | ✅ 7/7 成功；`precheck.exit=0` | attempt 台账 |
| M3 | `graph_rev` 稳定性 | ✅ **7 次 claim 全为 `3367e548…`** ⇒ D10「join 回填零污染」在真实负载下成立 | attempt 台账 |
| M4 | 重复派发闸门 | ✅ `claim` 后节点从 `ready` 消失、进入 `in_flight` | `ready --json` |
| M5 | deps 门控 | ✅ wave2 三节点仅在 wave1 close 后才 ready | 波次推进记录 |
| M6 | 真并行重叠 | ✅ wave1 = n1 332s ∥ n2 301s；wave2 = n3 351s ∥ n5 393s ∥ n6 305s | attempt 起止时间戳 |
| M7 | 跨 node 污染 | ✅ **0 例** —— 每个 node 目录只有 BRIEF/TODO/RESULT | `find` 实测 |
| M8 | topic 树外写入 | ✅ **0 例** —— `git status` 干净 | `git status --porcelain` |
| M9 | 哨兵与体量 | ✅ 7/7 末行 `## STATUS: COMPLETE`；174–407 行/节点（**远超 S2 的 100 行门槛**） | `wc -l` |
| M10 | `converged` | ✅ `true`；七桶 `done=7`、其余全 0 | `check --json` |
| M11 | final check | ✅ exit 0（**仅 14 条 info 级 `cache_behind`**） | `check --phase final` |
| M12 | 退出码四值 | ✅ 一致（0/1/2/3 未扩） | 全程观察 |
| M13 | `git merge` 绕开 commit-gate | ✅ **确认绕过**（`lib/commit-gate.ts:158-159` 只认 `commit`/`push`；全仓无 merge 处理） | 代码核实 |
| M14 | 「入 git」前提 | ✅ 24 文件提交成功，闸门（`bun test tests/` + 锚点 30/30）通过 | `097ce4b` |

---

## 3. 活体复现的既有机制缺陷（本次最硬的产出）

| # | 缺陷 | 复现方式 | 依据 |
|---|---|---|---|
| **R1** | **`owner` 字段被声明但从不消费** | **本 topic 埋的探针节点 n5 声明 `"owner": "parent"` ⇒ `ready` 照样列出、`claim` 照样放行 ⇒ 被派给 worker** | `lib/plan-topics.ts:61,197-199`（全文件仅 3 处命中）；ADR D2 `:62` |
| **R3** | **`scope-check` 文档承诺的 union 口径未实现** | **实测 `scope-check n1` 报 15+ 条假阳性**（兄弟节点文件全被算成 n1 的越界）⇒ alert fatigue | `scripts/plan-topic-check.ts:233-240`；文档 `plan-topics-topic-model.md:78,130`；ADR V10 `:255` |
| **R2** | topic 独占锁零机械强制 | `cmdLock` 纯只读；写命令只取 graph 短锁 | `scripts/plan-topic-check.ts:286-320,336-372`；`prompts/plan.md:280` |
| **R4** | `attempts[].baseline` 死字段 | `claim` 不写；全仓无写入点 | `lib/plan-topics.ts:50`；`scripts/plan-topic-check.ts:458-463` |
| **R5** | `precheck` 是自述式凭据 | `claim` 写、checker 从不读；`claim` 自注「不因此拒绝」 | `scripts/plan-topic-check.ts:455-461` |
| **X3** | `ownerAgentOf` 字面二值 | `agent === "plan" ? "plan" : "front"` ⇒ build 塌成 front | `lib/delegate-core.ts:1413-1415` |
| **X4** | agent 级 `delegate: allow` 泄漏到后端 ⇒ 递归 | `classPermissions` 无 delegate 规则 + session 规则 last-match-wins | `lib/delegate-core.ts:1266-1288,2460-2462` |
| **X1** | `general` 的 `shell:"*":allow` 且不在 `GUARDED_AGENTS` | 既存不受治理写旁路 | `opencode.jsonc:1006`；`scripts/agent-guard-rules.ts:84` |
| **X5** | `prompts/build.md:355` vs `:455` commit 口径自相矛盾 | grep 两处即得 | `prompts/build.md:355,455`；`lib/delegate-core.ts:1645` |
| **X6** | `rdd-builder` P2 从未在本仓跑过 | `.rddf/wt/`、`.rddf/state/builder/`、`.rddf/state/.planner-handoff.json` 全不存在 | 磁盘 `glob` 零命中 |

⇒ **这 10 条全部在 ADR 残留清单（#1–#13）之外** ⇒ 未登记。

---

## 4. 上下文成本实测（本次的第二个独有产出）

> **方法**：根会话在 wave 期间**只收指针 + 摘要，不读 RESULT.md 全文**（遵守「子结果只回指针」协议）；合成步骤单独计时。计量源：`session_v2.tokens_input`（真宿主 db）。

| 时刻 | input tokens | 增量 |
|---|---|---|
| T0 派发前 | 660,577 | — |
| T1 wave1 完成 | 675,095 | +14,518 |
| T_syn_start（7 节点全 closed，合成前） | 696,108 | — |
| T_syn_end（读完 7 份 RESULT.md） | 761,049 | **+64,941** |
| 终态（含写 SYNTHESIS.md） | 775,419 | **+114,842**（全 topic） |

- 合成产物总量 **244,703 bytes**（34,957 bytes/节点）⇒ **0.265 tokens/byte** ⇒ **每节点 ≈ 9,277 tokens**
- **合成读入占根会话全增量的 69%** ⇒ 合成是根成本的**主导项**
- compaction **未触发**
- 外推：N=10 ⇒ 92,773｜N=15 ⇒ 139,159｜**N=20 ⇒ 185,546**｜N=30 ⇒ 278,319
  ⇒ **断裂点 N\* ≈ 16–32**（视根会话剩余预算）

---

## 5. 由此得到的机制结论

1. **「合成外置」的收益已被实测证明存在**：把合成交给一个 merger worker，根**完全不吸收那 64,941** ⇒ 根的 per-topic 成本从 114,842 降到 **≈ 49,901（-56%）**，per-node 从 16,406 降到 ≈ 7,129。
2. **但移走 ≠ 消除**：merger 自己也要装下 244,703 bytes ⇒ **merger 的断裂点与根相同（N\* ≈ 16–32）**。⇒ 准确表述是「把上限从『根会话剩余预算』换成『一次性的 merger 上下文』」= **保住根会话的清醒**，不是无限规模。
3. **合成是一个叶节点任务**（读兄弟产物 → 写一份合并稿），**不是管理任务** ⇒ **不需要 `plan-manager` 那种带调度能力的 agent**；一个 merger 形态的 leaf worker 即可。
4. **需要一个位置放父的合成产物**：现有单一写者表只给了父 TOPIC/graph/BRIEF；父若把合并产物推到 `.rddf/plans/` 就**改变了它的语义**（变成正式件、可被派工程）⇒ 与「讨论稿 ≠ 可执行计划」冲突。**建议 topic 树增设 `SYNTHESIS.md`（父写）** —— 本次已按此落盘，为该建议的第一个实例。

---

## 6. 本场景**未**覆盖的（不得当已验证）

| 项 | 状态 | 说明 |
|---|---|---|
| **父死拒续接**（V12 ⑥） | ❌ **未执行** | 本次未造父会话死亡。⇒ `PLAN-TOPICS-FORK-JOIN-NOT-COVERED` token **只部分闭合**（fork/join 主体已覆盖，父死重建子项仍开放） |
| 模型行为面 | ⚠ 部分 | 7/7 worker 按 BRIEF 产出合规产物（≥174 行、哨兵齐、无越界）⇒ 覆盖「照纪律转述」的**正面例**，但未覆盖**违规例** |
| 换根重建 | ❌ 未执行 | D6 重建路径未触发 |
| `reap` / `cancel` 事务 | ❌ 未执行 | 本场景无取消/接手 |
| 单节点归因 | ❌ 未验证 | 本次全为单飞口径 |

⇒ **建议 architect 更新 ADR 实施记录段的 V12 状态**：从「仍未执行」改为「fork/join 主体已由 `097ce4b` 覆盖；父死重建子项仍开放」。

---

## 7. 建议的后续（按性价比）

| # | 动作 | 归属 | 成本 |
|---|---|---|---|
| 1 | **登记本记录的 10 条缺陷**（§3）进 ADR 残留清单 / 架构文档「已知边界」 | architect | 1h |
| 2 | **`R1` 二选一**：实现 `owner` 消费（`dispatchableNodes` + `claim` 拒绝）或删字段 + 删 ADR 那句 | architect + builder | 半天 |
| 3 | **`R3` 二选一**：`scope-check` 加 `--union` / 删文档承诺 | builder | 半天 / 15min |
| 4 | **`R2`**：把「拿锁 + 校验归属」并入 `claim`（新码 `owner_mismatch`）；或把文档的「独占」降级为「协议约定」 | builder | 1 天 / 30min |
| 5 | **`B6`**：扩 `gate()` 输入读台账 ⇒ 把「deps 未 done 不得派发」「未 claim 不得 spawn」从事后搬到事前 | builder | 1 天 |
| 6 | **`SYNTHESIS.md` 位置**写进单一写者表与 `prompts/plan.md` | architect | 30min |
| 7 | **合成外置**（merger leaf worker）—— 待 §4 的 N\* 触线时再做 | planner → builder | 一条 ADR + 实现批 |

---

## 8. 复现

```bash
# 场景产物
git checkout scenario/build-worker-design
cat .rddf/plan-topics/build-worker-design/SYNTHESIS.md        # 父的合成稿
cat .rddf/plan-topics/build-worker-design/nodes/*/RESULT.md    # 7 份子产出
bun scripts/plan-topic-check.ts check .rddf/plan-topics/build-worker-design --json
```

**基线**（本次跑前）：`bun test tests/` = **1232 pass / 0 fail / 66s**；`scripts/check-upstream-anchors.sh` = **30/30 OK**。
