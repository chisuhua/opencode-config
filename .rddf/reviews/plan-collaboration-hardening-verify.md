# plan-collaboration-hardening — 验收报告

- **日期**：2026-11-27
- **角色**：verifier（`source: user`，session `ses_de55114cbffed9wnWk08aQmKWY`）
- **已用轮次**：**1 / 3**（首轮；无前序验收记录）
- **验证路径**：**本地验收**（1–5 步）。`rddf rdd-verify --dry-run` ⇒ `No eligible changes to verify (empty queue)`（本仓无 `.rddf/state/iteration.json`、change 无 `tasks.md` ⇒ P3 archive gate 不触发）⇒ 按 `rdd-verifier` 分流三条件未命中，走本地路径
- **判据来源（优先级序）**：
  1. 用户 2026-11-27 明确指示（V10b 取「现在就让 `v7-probe` 真绿」；V10c 取「补『判据生效前已结算』豁免条款」）
  2. `openspec/changes/archive/2026-11-28-plan-collaboration-hardening/proposal.md` §验收标准（AC1–AC13，AC↔V 映射）
  3. `docs/adr/ADR-plan-collaboration-hardening.md` §Verification（**V1–V13 判据真源**，含 v3 修订的 V8(f)/V10c）
  4. 本次变更自身的声明（commit 无、diff 承诺见 ADR D1–D6）

## 1. 静态检查

| 项 | 命令 | 结果 |
|---|---|---|
| 类型/打包 | `bun build lib/plan-topics.ts scripts/plan-topic-check.ts scripts/plan-synthesis-check.ts --target bun` | 三个目标全 **ok** |
| 形态 | `openspec validate plan-collaboration-hardening` | `Change 'plan-collaboration-hardening' is valid` |
| 测试门禁 | `bun test tests/plan-topics*.test.ts tests/plan-synthesis.test.ts tests/config-guards.test.ts tests/rollback-registry.test.ts tests/plan-models-check.test.ts` | **376 pass / 1 fail**（唯一 fail = **外部红**，见 §4） |

## 2. 逐条判定

| AC | 判定 | 证据（工具调用 + 输出摘要） |
|---|---|---|
| **AC1** (V1) | **pass** | `plan-models.json`：`schema_version=1`，`synthesis.model=opencode-go/kimi-k3.1-pro#high`，`fallback=['opencode-go/gemini-4-argon#high']`，`content.model=null`；`awk` 截取 `prompts/plan.md` 合成段后 `grep -E 'kimi\|minimax\|gemini\|claude\|gpt-\|qwen\|#high'` ⇒ **0 命中**（无硬编码模型 ID） |
| **AC2** (V2) | **pass** | `governance-paths.json` 的 `paths[]` 含 `plan-models.json`；`config-guards` 全绿（376 pass 批次内含该文件；A6 原先的外部红已被其所属 stream 修好） |
| **AC3** (V3) | **pass** | `bash scripts/plan-models-check.sh` ⇒ exit **0** + 「可用性比对：ok」（正向）；负向由 `tests/plan-models-check.test.ts` **16 pass** 覆盖：配置缺失 exit 2、schema 非法 exit 1、模型不在 `opencode models` 输出 exit 1、**`opencode models` 非零退出 exit 1**、输出为空 exit 1、找 CLI 不到 exit 1、fallback 形状非法 exit 1 —— 均 fail-closed |
| **AC4** (V4) | **pass（附口径偏差）** | `tests/plan-topics-add.test.ts` **11 pass**：已存在 id / 非法 id / deps 不存在 / **deps 指向 cancelled** / deps 重复 五类均 exit 1；合法 add exit 0 且 `check --phase dispatch` exit 0（BRIEF 已写 + 三节在场）、无 `.tmp-*` 残留。⚠ **偏差**：实现为 **6 类**（多「deps 重复」），且 **成环在 `add` 路径数学不可达**（自依赖会先被「deps 不存在」拒）⇒ ADR D2 的「成环」一条无语义（`assertAcyclic` 仍作防御性复检）。AC4 文本「五类」需 planner 对齐 |
| **AC5** (V5) | **pass** | `tests/plan-topics-lifecycle.test.ts`：V27 `stale_inputs` 指名（改 deps / BRIEF 各自被点名，兄弟节点变更不触发）、V28 `inputs_reviewed` 豁免 ⇒ final exit 0；V25 `claim` 互斥（二次被拒 + `graph.json` 逐字节不变 + 并发恰好一个成功）⇒ 「未 done 改 BRIEF 重新 claim / 在飞被拒」有机械证据；「已 done 走 add 新节点」由 AC4 正向用例覆盖 |
| **AC6** (V6) | **pass** | `tests/plan-synthesis.test.ts` **40 pass**（含 9 个 V6 用例）：零 C 定义 ⇒ `synth_conclusion_no_chain`；证据 `path:startline` 上游不存在 ⇒ `synth_evidence_unresolvable`；推断链无 `⇒`/`→` ⇒ `synth_reasoning_missing`；`C10a` 不被识别；区间写法 `path:437-465` 可被 `path:437` 对上；负向用例均带 `--strict-token` |
| **AC7** (V7) | **pass** | `tests/plan-topics-settlement.test.ts`（**29 pass**）：无记录 ⇒ `settlement_missing`；「合成节点全 cancelled ⇒ 门不适用」；`blockingBefore` 在推入门两码之前计算（实现见 `lib/plan-topics.ts` 结算门调用点，未使用 `reportTopic().converged`） |
| **AC8** (V8) | **pass** | 同上文件：(a) 过期、(b) 可修复码未追加、(c) 追加且 exit=0 后消失、(d) 全不可修复 + `accept-with-gap` + `gap_reason`、(e) 未分类码 fail-closed，全部有断言；**新增 (f) grandfather 及其 4 条负向**（漏列码 / `action: accept` / 闭合于生效日 / 无已闭合 attempt）+ 畸形 `finished_at`（空串 / `2026-1` / `yesterday`）不视为已闭合 |
| **AC9** (V9) | **pass** | `tests/plan-topics-goal-review.test.ts` **7 pass**：三节齐 ⇒ 不报；`TOPIC.md` 缺失 ⇒ 同码；缺节 / 空节 ⇒ 报该节名；ready 为空 ⇒ 不报；`final` 口径不跑该门；`ready` 与三节互补 |
| **AC10a** (V10a) | **pass** | 现场取证（临时移除记录再恢复，`diff` 确认复原）：`check .rddf/plan-topics/v7-probe --phase final` ⇒ `settlement_missing: 缺 ## 结算记录（含一个 yaml 围栏块）—— 有合成节点且已收尾时必填` |
| **AC10b** (V10b) | **pass（实质；节点 id 与 AC 字面不同，已交 planner）** | `plan-synthesis-check .rddf/plan-topics/v7-probe --strict-token` ⇒ `OK（无阻断项）`；`check --phase final` ⇒ exit 0；记录：`synthesis_check_exit: 0` / `answer_node: m4` / `action: supersede:m4` / `model_resolution: config` / `model_id: opencode-go/kimi-k3.1-pro#high`。真追加链路：`m2` 实测失败（漏载 n6 的 `execute-skill-retired`，可修复码）⇒ 按 D4 不修订、**追加 `m4`**（BRIEF 枚举全部 9 个标记 token）⇒ 跑通。**未使用 `accept-with-gap`**。⚠ AC 字面写「真追加 m2 + 记录 `supersede:m2`」，实际是 `m4`（`m2` 被 supersede、`m3` 因 `add` 漏 `--deps` 未派发即 cancel）⇒ 判定依据 = 用户明确指示「现在就让 `v7-probe` 真绿」+ V10b 四项实质全满足；**AC 文本已提交 planner 修订**（`feedback-20261127-003`，kind `needs-revision`） |
| **AC10c** (V10c) | **pass** | `check .rddf/plan-topics/build-worker-design --phase final` ⇒ **exit 0**；记录：`synthesis_check_exit: 1`（照抄实际值）、`blocking: [synth_brief_no_ruling_set]`（照抄）、`action: accept-with-gap`、`gap_reason` 含该码、`note` 注明 `--strict-token` 口径另报 `synth_token_missing×2` + `synth_conclusion_no_chain`。走 **ADR v3 的 grandfather 路径**（答案节点 `m2` 闭合 `2026-11-26T13:04:24Z` 严格早于 `2026-11-27`）。两条反例现场取证（临时改记录再恢复）：`action: accept` ⇒ `settlement_failed_not_superseded`；`gap_reason` 不含该码 ⇒ 报「grandfather 适用但 gap_reason 未覆盖这些码」 |
| **AC11** (V11) | **不适用（观察项）** | ADR 明确「**观察指标，不作 gate**」「不设 ≥10% 判定线（单样本不可判）」⇒ 无判定对象；已有 `V7 Probe B` 的 `62,720` 作基线记录 |
| **AC12** (V12) | **pass** | `ViolationCode` 闭集 = **23**（`grep -c '^  | "' lib/plan-topics.ts`）；`topic_goal_unreviewed` 在库内 2 处命中；`plan-topics-topic-model.md:75` 写「违规码闭集（23 个）」；§5 有 `add` 行、§10 已改写、§4 有 grandfather 例外句 |
| **AC13** (V13) | **pass（本机制）** | `registry.json` 含 `plan-collaboration-hardening` 且 `state=unmanifested`；`pending/plan-collaboration-hardening.md` 在盘；`bun scripts/rollback-registry.ts` 对本机制**无 M1/V8 红**（唯一 ✗ 属外部，见 §4） |

## 3. 边界与错误路径

| 面 | 证据 |
|---|---|
| grandfather 边界日 | `2026-11-26T23:59:59Z` ⇒ 适用；`2026-11-27T00:00:00Z` ⇒ 不适用（严格小于），用例钉死 |
| 畸形时间戳 | 空串 / `2026-1` / `yesterday` 均不视为已闭合（并用 `/^\d{4}-\d{2}-\d{2}/` 过滤，避免「空串很小 ⇒ 静默豁免」） |
| `max(finished_at)` | 数组里早的一次不能豁免（末次闭合在生效日 ⇒ 阻断） |
| 结算门自毁 | `blockingBefore` 在推入门两码之前计算 ⇒ 不出现「首跑红 ⇒ 次跑恒绿」 |
| 未闭合 attempt | 有在飞 ⇒ 收尾条件不成立 ⇒ 结算门整体不触发（该组合通过 helper 单测覆盖，用例内已注明原因） |
| 资源释放 | `add` 持有 graph 短锁 + `finally release()`；`add` 写图用原子写（无 `.tmp-*` 残留断言） |

## 4. 失败项与路由

### 4.1 本 change：无失败项

AC1–AC13 中 AC1–AC10、AC12、AC13 全 pass；AC11 为观察项（不适用）；AC10b 为「实质 pass + 字面偏差」（已路由）。

### 4.2 外部红（不计入本 change 判定）

| 项 | 证据 | 归属与路由 |
|---|---|---|
| `bun test ... tests/rollback-registry.test.ts` 的「机制登记表」用例 **1 fail** | `bun scripts/rollback-registry.ts` ⇒ `✗ [V8] commit-gate：清单在 last_drill（sha 90ebb271）之后被实质改动过 ⇒ 须同批重跑 drill 并回填 last_drill` | **`commit-verification-gate` 那条 stream**（工作树里 `.rddf/rollback/commit-gate.json`、`docs/adr/ADR-commit-verification-gate.md` 等为其 staged 改动）。本 change 无相关改动 ⇒ **不计入本 change 判定**，但**本 change 归档前该红应消失**（否则门禁不可称全绿） |

### 4.3 待 planner 处理的两处文本偏差（不阻断验收）

1. **AC10b**：字面 `m2` → 实际 `m4`（已提交 `feedback-20261127-003`）。
2. **AC4**：字面「五类」→ 实现 6 类（多 deps 重复），且「成环」一条在 `add` 路径不可达（ADR D2 与提案均沿用旧表述）。

## 5. 遗留清扫复核（独立重跑，不引用 builder 自述）

| 检查 | 命令 | 结果 |
|---|---|---|
| TODO / FIXME / XXX / `console.log` 新增面 | `git diff -U0 <6 个改动文件> \| grep '^+' \| grep -cE 'TODO\|FIXME\|XXX\|console\.log'` | **0** |
| 被 skip / only 的测试 | `grep -rc 'test.skip\|test.only\|describe.skip' tests/plan-topics*.test.ts tests/plan-synthesis.test.ts tests/plan-models-check.test.ts` | **0 个文件命中** |
| topic 内临时文件 | `find .rddf/plan-topics -name '*.tmp*' -o -name '_tmp*'` | **0**（builder 建的 `_tmp-bwd` 已删） |
| 注释掉的代码（新增行） | `git diff -U0 lib/plan-topics.ts \| grep '^+' \| grep -E '^\+\s*//\s*(if\|for\|return\|const\|let\|function)'` | **0** |
| 未替换的 mock / 临时代码 | 本次为判据库 + CLI + 配置脚本，无 mock 引入；`plan-models.json` 为**真实**配置（非 fixture） | — |

## 6. 结论

**本 change 验收通过（AC1–AC10、AC12、AC13 pass；AC11 观察项不适用；AC10b 实质 pass + 1 处已路由的文本偏差）**，附带两个前置条件：

1. **归档前**外部 V8 红（`commit-gate` 清单漂移）须由该 stream 重跑 drill 回填后消失 —— 否则仓库门禁不能称全绿。
2. **AC10b / AC4 的文本偏差**由 planner 在其一次修订里一并同步（`feedback-20261127-003` 已开；AC4 口径未单独提交，建议同批处理）。

**未改动任何实现代码**（verifier 边界）；本轮所有改动仅为临时移除/恢复 `TOPIC.md` 的结算记录做负向取证，均已 `diff` 确认复原。
