# improvement: runtime-e2e-coverage-new-mechanisms — 本仓新机制的运行时 e2e 覆盖（plan-topics D9/D10/D11 + push-gate）

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：`.rddf/reviews/test-completeness-debt-e2e-audit-2026-11-25.md` §1.3（G-2 / G-3）与 §3.2（覆盖映射）+ `.rddf/reviews/plan-topics-d9-d10-d11-verify.md`。
> 关联：**尚未立项**（`backlog: runtime-e2e-coverage-new-mechanisms`）。
> 路线图：`.rddf/roadmap/test-debt-e2e-followup.md` 任务 **B1 / B2**。
> ⚠ **待用户裁决**：本条覆盖「要不要为新机制补运行时 e2e」这个**花钱 + 覆盖策略**的选择（候选路径见 What Changes 第 1 条）⇒ **未拍板前不立项**。
> ⚠ **实施归属跨仓**（e2e 仓 `rdd-workflow-e2e` 新增 bats 文件）+ 本仓 builder 面（若需 prompt / fixture 配合）⇒ **planner 不实施**。

## Why

本仓的测试分层有四层（`docs/test-authoring.md` §1）：静态契约 / 纯逻辑单测 / **行为端到端（真宿主 + 真模型）** / 手工验收。§1 同段写着一条硬规矩：「**不要把『我在 A 层建了测试』说成『A+B 都被覆盖了』**」。

按这把尺子量，**本仓新长出来的机制全都停在 L1**：

| 机制 | L1（单测） | L2（行为端到端） | L3（人工） |
|---|---|---|---|
| `lib/plan-topics.ts` + `scripts/plan-topic-check.ts`（**D9 取消 / D10 在飞与 fence / D11 收敛**，21 条 V16–V36 全覆盖） | ✅ 96 例（`plan-topics` 35 + `plan-topics-dag` 39 + `plan-topics-lifecycle` 22） | ❌ **0 例**（e2e 仓 `grep plan-topics` ⇒ 0 命中） | ❌ **0**（人工 e2e 记录只有 2026-11-20 初版，V12 三项「⏳ 未执行」；D9/D10/D11 落地后**没有**任何人工 e2e） |
| `plugins/model-fallback.ts`（retry / prompt 两钩子接线） | ✅ 33 例（`model-fallback-core`） | ❌ 0 例 | ❌ |
| `lib/push-gate.ts`（force push 工具层硬拒） | ✅（`push-gate` / `commit-gate` 共 87 例） | ❌ 0 例 | ❌ |

⇒ **单测能证明逻辑与契约，证明不了「宿主真的挂上了、真的按契约走了」**。对照 e2e 仓已有的 5 个机制（role-gate 8 例 / commit-gate 2 例 / subagent-contract 11 例 / delegate 26 例 / role_class 4 例）—— 本仓的**治理面**有运行时保护，本仓的**机制面**没有。

这正是「每批新机制只配单测」的累积效应：本批（D9/D10/D11）是本仓第一次出现「**协议 + 状态机 + 取消事务 + 收敛信号**」这种体量的机制，它的行为面（真 `plan` 会话派真 `plan-worker`、真锁、真取消事务）**一次都没在真宿主里跑过**。

## What Changes

1. **候选路径（**由用户拍板**，planner 建议 ③ 优先、② 次之）**：

   | 路径 | 形态 | 吃额度 | 新增的证明力 |
   |---|---|---|---|
   | ① **不补** | 现状 | — | 无（单层覆盖，宿主接线漂移无人发现） |
   | ② **最小 L2（真 worker）** | 真 `plan` 会话派真 `plan-worker` 子会话，走完「claim → 写产物 → close → converged」 | 是（每条一个真实子会话） | 最强：含「模型照纪律执行」 |
   | ③ **真宿主 + 假 worker（**建议**）** | 真 `opencode run --agent plan` 会话 + **假 worker 直接落盘** `TODO.md`/`RESULT.md` + 真 checker CLI 断言派生 | 少量（每次一个 plan 会话） | 中：证明「协议在真宿主里可执行」，**不承诺模型照纪律做** |

   ⚠ 路径 ③ 的**诚实边界**：它证明的是「父会话能跑 `claim`/`close`/`cancel` 且 checker 的派生与真实磁盘一致」，**不证明**「模型会照 prompt 的纪律走」⇒ 后者只能靠 ② 或人工 ⇒ 若走 ③，须把「模型行为面未覆盖」**如实登记**（e2e 仓 `docs/known-gaps-and-ownership.md` 已有同类登记范式）。

2. **e2e 仓新增 `tests/integration/test_plan_topics_runtime.bats`**（走 ③ 时）—— 4 条候选用例：

   | # | 用例 | 断言要点 |
   |---|---|---|
   | **PT-1** | 「先登记后 spawn」主链 | 真 plan 会话里 `claim` ⇒ 假 worker 落盘（TODO 全勾 + RESULT 正文）⇒ `close` ⇒ `check --phase final` exit 0 ∧ `converged=true` ∧ `summary.done` 含该节点 |
   | **PT-2** | 「取消事务」 | `cancel --reason` 后：派生 `status=cancelled` ∧ 下游被摘边或级联 ⇒ `final` exit 0 ∧ `summary.cancelled` 逐条列出 `{id, reason}` |
   | **PT-3** | 「在飞排除派发」 | `claim` 后该节点**不在** `ready` 里 ∧ `ready --json` 的 `in_flight` 含它 ∧ `check` exit 0（**在飞不是违规**） |
   | **PT-4** | 「锁无关」 | topic 锁未释放时 `converged` 仍为 `true`（D11 语义：锁不进判据） |

3. **e2e 仓新增 `tests/integration/test_push_gate_runtime.bats`**（B2 的低风险那一半）：真发一条 `git push --force` ⇒ 断言工具层抛 `Tool.Error`（**证明硬拒真的生效**，而不是只测 `scanForcePush` 的纯逻辑）。

4. **门控与纪律**（沿用 e2e 仓既有规矩，不新立）：
   - 全部用例走 `E2E_REAL_RUNTIME=1` 门控 ⇒ **默认 skip，不进 CI**（`docs/test-authoring.md` §5：需要真实运行时/模型的测试默认不进 CI）；
   - 每条用例有**一次变红演练记录**（e2e 仓 `docs/runtime-assertion-discipline.md` 三条纪律：事实非措辞 / 可证伪 / 变红演练）；
   - 判据**审计记录** `{case_id, oracle_sha, auditor, author, defects[], verdict, date}`，且 `auditor ≠ author`（e2e 仓 ADR-0003 的转正规则）⇒ 提案者与审计者分离。

5. **本仓侧配合（若需要）**：`prompts/plan.md` 的「多会话协作」整节**不需改**（协议已写清）；若实跑发现 plan 会话**不会**自动跑 `claim`（即纪律没落地），则缺口在 prompt ⇒ **登记为「prompt 纪律 vs 实测行为」的差异**，走治理面流程（architect + oracle → critic），**不在本条里顺手改 prompt**。

6. **不做**：不把 L2 用例塞进本仓 `bun test tests/`（层级不同）；不改本仓单测（已覆盖）；不承诺覆盖「模型行为面」（除非走 ②）。

## Acceptance

- [ ] **用户已拍板候选路径**（① / ② / ③）并写进本 improvement 的头部（未拍板不立项）
- [ ] e2e 仓新增的 bats 文件落地，且每条用例**默认 skip**、走 `E2E_REAL_RUNTIME=1` 才跑（断言：`bats <file>` 无 `E2E_REAL_RUNTIME` 时输出 `skip` 且退出码 0）
- [ ] 每条用例有**变红演练记录**（e2e 仓 `docs/runtime-assertion-discipline.md` 的三条纪律齐备：断言只认事实 / 可证伪 / 变红演练）
- [ ] 每条用例有 **oracle 审计记录**（`auditor ≠ author`；字段齐备：case_id / oracle_sha / defects / verdict / date）
- [ ] **未覆盖面如实登记**：若走 ③，必须在 e2e 仓 `docs/known-gaps-and-ownership.md` 登记「模型行为面（agent 是否照纪律转述）未被本条覆盖」⇒ 不得留空
- [ ] 本仓侧零回归：`bun test tests/` 全绿 + `bash scripts/check-upstream-anchors.sh` 全绿（本条不改本仓代码 ⇒ 只作基线）
- [ ] 实跑证据落 `.rddf/reviews/runtime-e2e-coverage-new-mechanisms-e2e.md`（**真实输出片段**，不是「应该能过」）
- [ ] 若走 ③：PT-1…PT-4 四条**各跑一次真实会话**并记录真输出；任一条跑不通 ⇒ 记为「协议面缺口」并**路由回 planner/architect**（不静默删用例）

## Capabilities

- **补上「宿主接线」这一层的证明力**：本仓第一次有机制类（不是治理面）进入运行时 e2e ⇒ 后续新机制有可抄的范式（真宿主 + 真 CLI + 假 worker 的成本远低于真子会话）。
- **与本仓既有的「四层分工」纪律对齐**：`docs/test-authoring.md` §1 说「两层不能互替，缺哪层就缺哪层的证明力」⇒ 本条补的是 L2 那一层，且**明确不覆盖 L2 之上的模型行为面**。
- **可迁移到后续机制**：`push-gate` 的「真被拒」范式（真调用 + 断言 `Tool.Error`）可复用到 `model-fallback` 接线面、`commit-gate` 反绕过（e2e 仓已有的 CG-2 正向对照可作模板）。
- **对 e2e 仓本身的价值**：新增两个 bats 文件 ⇒ 契约层从「治理面为主」扩到「机制面」，与其 ADR-0003 的 contract 层扩容方向一致。

## Impact

- 改动面：**e2e 仓**（新增 2 个 bats 文件，**不改**既有文件的行为；可能新增 `docs/known-gaps-and-ownership.md` 一行登记）+ **本仓**（零代码改动；可能一条 review 记录）。
- ⚠ **跨仓协调**：e2e 仓的 bats 需用 `~/.config/opencode` 作为被测仓（`OC_ROOT` / `TARGET_REPO` 默认值已是）⇒ 本仓**当前 HEAD** 即被测对象 ⇒ 本仓后续改动会让这些用例的期望漂移 ⇒ 期望值必须写成**结构化断言**（退出码 / 字段 / 计数），**不得**写死易漂的散文文本。
- 风险 ①：**额度与 flaky** ⇒ 缓解：默认 skip + 不进 CI + 每条用例留变红演练记录；实跑失败先判「环境 vs 缺陷」（`docs/test-authoring.md` §5）。
- 风险 ②：**路径 ③ 的证明力被高估**（有人把「协议跑通」读成「机制正确」）⇒ 缓解：AC 明确要求登记未覆盖面；判据只断言可观察事实。
- 风险 ③：本仓机制继续演进 ⇒ e2e 用例漂移 ⇒ 缓解：期望只写结构化字段；e2e 仓的 KNOWN_FAILURES / 缺口表机制承接「已知漂移」。
- 依赖：**无仓内依赖**；但 e2e 仓用例需要 `~/.agents/skills/rdd-workflow` 安装副本（已在）+ 真宿主 `opencode run`（已在）。
- 成本：路径 ③ ≈ 4 条用例 × 1 次真实 plan 会话；路径 ② 另加真子会话（额度翻倍）；B2 的 push-gate 一条**不吃额度**（只需真工具调用）。
