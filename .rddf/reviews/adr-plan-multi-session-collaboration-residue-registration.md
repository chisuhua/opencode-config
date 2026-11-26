# plan-topics 机制缺陷登记 —— 落盘记录

> **类型**：架构决策文档的**登记面**修订记录（残留清单 + 已知边界），**未改任何决策条目**
> **执行者**：architect（session `ses_de88de076ffek2Jbxwocm8vbuf`；租约 `architect` / `claim_gen: 7`）
> **日期**：2026-11-26
> **依据**：topic `build-worker-design` 真实场景跑通（提交 `097ce4b`）｜**证据**：`.rddf/reviews/build-worker-design-scenario-verify.md`
> **审查**：登记面措辞 ⇒ 按 §审查配对 的 architect 行走 **只 oracle**（不改决策条目）；审查记录见 `.rddf/reviews/adr-plan-multi-session-collaboration-residue-registration-review.md`

---

## 1. 已落盘（A / B / C 三组）

| 组 | 落点 | 动作 | 条数 |
|---|---|---|---|
| **A** | `docs/adr/ADR-plan-multi-session-collaboration.md` §残留（登记，不在本篇处理） | #1 / #2 / #10 / #12 **追加或更正标记**（原句逐字保留）+ **新增 #14–#18** | 4 追加/更正 + 5 新增 |
| **B** | `docs/architecture/plan-topics-topic-model.md` §10「已知边界（如实登记，不假装有闸门）」 | 改写 1 条（`scope-check`）+ 新增 4 条 | 1 改写 + 4 新增 |
| **C** | `docs/adr/ADR-plan-delegate-engineering-session.md` §残留 | 新增 #4–#6 | 3 新增 |

### 1.1 A 组的四条追加/更正（**原句一律不改**）

| 目标 | 动作 | 依据的活体证据 |
|---|---|---|
| **#1**（每节点精确写域） | **追加**实测补充：7 节点真实负载下跨 node 污染 **0 例**、树外写入 **0 例** ⇒ 感知风险可下调一档、**不可归零** | `find` / `git status` 实测（提交 `097ce4b`） |
| **#2**（派发事前闸门） | **追加**可行路径具体化：L1 门能读 `event.input.{agent,prompt,sessionID,background}`，但 `gate()` 只传 `{agent,prompt,isResume}`、`evaluatePrompt(...)` **不读台账** ⇒ 需扩输入 + 加可选 `evaluateDispatchState()` | `plugins/subagent-contract.ts:9,87-94`；`lib/subagent-contract-core.ts:535-559` |
| **#10**（scope-check 按节点归因） | **更正**：原句「现行口径 = 单飞时节点级、**并行时 topic 级 union**」中的 union 口径**在 CLI 中不存在** ⇒ 文档承诺了不存在的口径 ⇒ 并行时按文档跑会收假阳性 ⇒ **alert fatigue** | 场景实测：`scope-check n1` 报 **15+ 条**假阳性（兄弟节点文件全被算成 n1 的越界） |
| **#12**（TTL 自动接管不做） | **补充**：写围栏缺失**不只影响 TTL 路径** —— `reap` 本身不吊销旧 worker ⇒ **人工接管同样留复活窗口** | `scripts/plan-topic-check.ts:499-511`；本篇 `:145` |

### 1.2 A 组新增 #14–#18

| # | 标题 | 一句话 |
|---|---|---|
| **14** | **`owner` 字段被声明但从不消费** | ADR D2 承诺「`owner:"parent"` 的节点 = 父自己做」vs 实现零消费（全文件仅 3 处命中）⇒ **活体复现**：探针节点 n5 被派给 worker 而 `check` 全绿 |
| **15** | **topic 独占锁零机械强制 + 释放步骤不可执行** | D7 承诺「仅 owner 可写/可派」无代码路径执行；`rmdir` 对含 `owner` 文件的目录**必然失败** ⇒ **活体证据**：唯一一次真实使用（2026-11-20 `e2e-probe`）的锁**6 天未释放** |
| **16** | **`attempts[].baseline` 是死字段** | 类型有、schema 示例有、`claim` 不写 ⇒ 全仓无写入点 ⇒ 与 D10「要么实装要么删除，不留死字段」同纪律 |
| **17** | **`precheck` 是自述式凭据，判据侧从不读** | `claim` 写、checker 从不读、`claim` 自注「不因此拒绝」⇒「派发前 check 必须 exit 0 才派」无机械强制 |
| **18** | **`claim` → `spawn` 两步无补偿** | spawn 失败后 attempt 仍开着 ⇒ 节点永久不可派 ⇒ 本篇 `:142` 的处方是纯散文 ⇒ 属「纪律型字段」类（与 `:156` 同型） |

### 1.3 B 组（当前态快照，只写「现在是什么样」，不复述处置方案）

- **改写** `scope-check` 条：补「**当前实现只有单节点口径**」「并行时应**暂不做** `scope-check`」
- **新增**：`owner` 字段不被消费 / topic 独占锁无机械强制（含释放步骤不可执行 + 盘上泄漏证据）/ 两个字段不被消费（`baseline` + `precheck`）/ **topic 树内没有留给「父的合成产物」的位置**（建议增设父写的 `SYNTHESIS.md`）

### 1.4 C 组（`ADR-plan-delegate-engineering-session` 残留新增）

| # | 标题 | 要点 |
|---|---|---|
| **4** | 归属枚举 `owner_agent` 是二值 | `ownerAgentOf` 字面二值 ⇒ 新派发主体塌成 front ⇒ front 可 resume/cancel 其后端 ⇒ D5 的「缺失按 front」兼容读规则需复核 |
| **5** | agent 级 `delegate: allow` 泄漏到后端 | `classPermissions` 无 delegate 规则 + session 规则 last-match-wins ⇒ 后端可递归派发 ⇒ 开权限必须与显式 deny **同批** |
| **6** | `general` 的 shell 写旁路与「subagent 只读」口径不一致 | `shell:"*":allow` 且不在 `GUARDED_AGENTS` ⇒ 无登记/台账/槽位/scope 差集的写旁路 ⇒ 本篇 `:29` 的裁决在该行被配置自身印证 ⇒ **只登记，不评价** |

---

## 2. **未**落进 ADR 的三条（及各自前置）

| # | 事项 | 为何不落在本批 | 落地前置 |
|---|---|---|---|
| **X2** | `git merge` / `git rebase` / `git cherry-pick` 产生的提交**不经过** commit-gate | ⚠ **不是缺陷** —— `ADR-commit-verification-gate` D5 明写「门禁识别 git 的 **`commit` 子命令本身**」，是**刻意的窄口径**（标题即「窄口径，避免误伤」）⇒ `merge` **在声明边界内**。且**直接加第 ⑰ 行会打红既有守卫** —— `tests/commit-gate-d9-registration.test.ts` 的期望集**从 D9 表派生**，且含一条判别力用例「**本文加第 ⑰ 行而未登记 ⇒ 必红**」；而 AC 面落在**已归档** proposal（`openspec/changes/archive/2026-11-18-commit-gate-d9-three-place-registration/proposal.md`），该 proposal 明写「**归档 proposal 不可回改** ⇒ 未来第 ⑰ 项只能登记在**新** change 的同名小节」 | ① 新建 openspec change 承载 `## D9 …登记（AC 面）` 小节（**planner 面**）；② `tests/commit-gate-d9-registration.test.ts` 的 JSDoc 头登记；③ `docs/MULTI-AGENT-DESIGN.md` §2.8.8 索引登记；④ D9 标题与 AC 面小节名的计数同步（「十六项」→「十七项」）；⑤ **V10 闭合**（当前仍是 `- [ ]`） |
| **X5** | `prompts/build.md:355`（「本仓后端**被禁止 commit**」）与 `:455`（「后端 session **可以 commit**」）自相矛盾；`lib/delegate-core.ts:1645` 的口径是「由工具层验证门决定」⇒ **三处不一致** | 属治理面 prompt 漂移，**与本篇决策无关**；且**不因 build-worker 是否采纳而搁置** | **builder 面**（`prompts/build.md` 治理面措辞修正）。⚠ 影响面：若按 `:355` 字面，「worker 在自己分支提交」不可能完成 ⇒ 相关判据恒红且**系统性失败被当成个体失败** |
| **X6** | `rdd-builder` P2 **从未在本仓跑过**（`.rddf/wt/`、`.rddf/state/builder/`、`.rddf/state/.planner-handoff.json` 三处落点全不存在）⇒ `prompts/build.md:412` 声明的前置在本仓**不成立** ⇒ P2 是**纸面可选层** | 属 rdd-workflow 产品侧，**跨仓** | 产品侧登记（遵循既有跨仓登记体例）。⚠ 附带发现：`docs/guard-authoring.md:222` 仍写「`.rddf/plans/**`（rdd-builder P1 产物，**当前不存在**）」，而盘上已有 3 个产物 ⇒ **过期快照**需刷新 |

---

## 3. 归口纪律

| 检查项 | 结论 |
|---|---|
| 是否改动任何**决策条目**（D1–D11 正文 / D1–D9 正文）？ | ❌ **否** —— 全部落在「残留清单」与「已知边界」两个登记面 |
| 是否**回改历史**？ | ❌ 否 —— #1/#2/#10/#12 采用**追加/更正标记**，原句**逐字保留**（沿用 #9/#11 的「✅ 已闭合 —— 原登记」体例；本批**无闭合项**，故改用「补充/更正」体例） |
| 新增编号是否冲突？ | ✅ 无 —— plan-topics 残留现有最大 13（#9/#11 为已闭合历史记录），新增取 **14–18**；plan-delegate 残留现有最大 3，新增取 **4–6** |
| 跨机制缺陷是否被塞进本篇 ADR？ | ❌ 否 —— X1/X3/X4 → `ADR-plan-delegate-engineering-session`；X2 → commit-gate（前置未满足，见 §2）；X5 → builder 治理面；X6 → 产品侧 |
| 是否把「刻意窄口径」误写成「缺陷」？ | ⚠ 已避免 —— X2 明确按 D5 的宣称边界处理，且**未**加进 D9 表 |
| 每条是否都有可核 `path:line` 或活体证据？ | ✅ 11/11（R1/R2/R3 另有**活体复现**：探针节点被派发、15+ 假阳性、`e2e-probe` 锁 6 天未释放） |
| 是否与既有残留重复？ | ✅ 已查 —— B2 并入 #12、B6 并入 #2、R3 并入 #10 ⇒ **plan-topics 新增 5 条**（而非 8 条）、**plan-delegate 新增 3 条** |

---

## 4. 机械验证

```bash
bun test tests/                        # 本仓唯一硬闸门之一
bash scripts/check-upstream-anchors.sh # 本仓唯一硬闸门之二
```

⚠ 本仓**无 CI、无生效 git hook** ⇒ **沉默 = 违规** —— 上两条必须真跑并把输出记进本记录的「验证」段。
