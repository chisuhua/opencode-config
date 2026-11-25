> **2026-11-25（D5 修订）之后**，plan 会话状态为 `.rddf/state/plan-sessions/` **目录**形态；本文其余处按当时路径记述，其中 **AC7 / AC9 / AC13 为历史验收判据**（不回改）。

# improvement: plan-multi-session-collaboration

> 措辞说明：本文件是**改进提案**（`.rddf/improvements/`），不是 openspec proposal。
> `openspec/changes/archive/2026-11-20-plan-multi-session-collaboration/` 由 **builder** 侧生成（工件归属：`rdd-builder` owns）；**已归档**（2026-11-20，验收 **pass**，round 3 ⇒ `.rddf/reviews/plan-multi-session-collaboration-verify.md`；e2e 证据 `.rddf/reviews/plan-multi-session-collaboration-e2e.md`）。
> ⚠ **本路径未启用 `add-improve`**：其 HARD-GATE 要求 YAML frontmatter + 7 段 + `**主题**` 精确匹配 `.rddf/roadmap.md` 的 Phase Skeleton Theme 列，而本仓（a）无 `.rddf/roadmap.md`，（b）既有 24 个 improvement 全为 5 段无 frontmatter ⇒ 走**内置流程**，形态与本仓惯例一致。
> 修订记录：**第 2 版** —— 按 metis gap 分析（1 轮）修订：Acceptance 段由「名词型」改为**可执行判据**；补充 `progress` / `status` 正交拆分、`graph.json` schema、node id 字符集、归档前置机械件。

## Why

用户诉求：**让多个 plan agent 会话协同完成比单会话更复杂的任务**。已拍板：

1. **解耦**：plan 是「正式件」的**上游** —— plan 侧只产离线讨论产物，正式工程计划 / 改进稿仍由 planner 侧产出；
2. **直接做 Phase 1**（跳过「只读扇出」过渡期），目标是**子会话能持续推进自己的 todo**；
3. **离线产物入 git**；
4. 根 plan 会话创建子会话；子会话**并行**；父会话判断依赖（fork/join）；
5. 离线计划与「当前 plan agent + session id」绑定。

现状为什么不够：

- **delegate 通道不能用**：语义是工程实施（scope / role_class / 停机证据 / 差集检测），槽位按 `workRoot` **全局单槽** ⇒ 并行被拒；且 delegate 后端**不进宿主会话树**（拿不到父子关系与完成唤醒）。
- **单会话内多线程不够**：父会话同时持有 N 个子任务上下文 ⇒ 父上下文被撑爆，「谁在做什么」只能靠散文维持。

决策载体：`docs/adr/ADR-plan-multi-session-collaboration.md`（**Accepted** 2026-11-20；oracle `治理面判定: PASS-WITH-NOTES`（5 条已处置）→ critic `APPROVE` / `mergeable: yes` / 无 BLOCKER / 无 SHOULD_FIX）。审稿报告：`.rddf/reviews/adr-plan-multi-session-collaboration-review.md`。

实施路线图：`.rddf/roadmap/plan-multi-session-collaboration.md`（TDD 任务分解 + 验证面设计 + 实施细节裁决 14 条，含 metis 修订记录）。

## What Changes

- **D1 协作区**：`.rddf/plan-topics/<topic-slug>/`，与 `.rddf/plans/` 分家。**每文件恰一写者**：父写 `TOPIC.md` / `graph.json` / `nodes/<id>/BRIEF.md`；子写 `nodes/<id>/TODO.md` + `RESULT.md`。**node id 字符集** `^[a-z0-9][a-z0-9._-]{0,63}$` + 黑名单（`.lock` 结尾 / `.env` / `.bak` / `backup*`）—— 防 `.gitignore` 把整个 node 目录误伤（否则「入 git」与跨机器重建同时失效）。
- **D2 fork/join 唯一载体 = `graph.json`**，且 **`progress` 与 `status` 正交**：
  - `progress`（纯磁盘派生，不看依赖）：`TODO.md` 全勾 **且** `RESULT.md` 有实质内容 ⇒ `complete`；零 checkbox ⇒ `partial`（**禁止 vacuous done**）。
  - `status`（门控有效值）：`progress==complete ∧ deps 全 done ∧ deliverables 非空且路径存在` ⇒ `done`；否则 `blocked_by_deps` / `pending`。
  - 三条机械判据：① 无环（含悬空 dep / 重复 id）；② 子可先 `progress=complete` 但 `status≠done`（**这是合法状态，不误报**）；③ join 必须有真实交付物。
  - 落 `lib/plan-topics.ts` + `scripts/plan-topic-check.ts` + `tests/plan-topics.test.ts`；**schema 前置**见路线图块 A0。
- **D3 父子会话 = 宿主 `subagent`**：并行 = 同轮多次 `background: true`；join = 宿主完成合成消息；续接 = `subagent(sessionID=…)`。
- **D4 新增 `plan-worker`**（`mode: "subagent"`），**不**把 `plan` 改 `mode: "all"`（否则 build 可拉起带 `delegate`/`question` 的 plan 子会话 ⇒ 提权）。`plan-worker`：`edit` 仅 `.rddf/plan-topics/*`；`shell` 三段式只读（进 `GUARDED_AGENTS`，白名单**无 `bun`/`node`** ⇒ checker 只能父会话跑）；`subagent`/`delegate*`/`question`/`skill`/`lsp`/`external_directory` 全 deny；**无 `ask` 档**。
- **D5 会话身份三落点**（路径不含 session id）：gitignored 的 `.rddf/state/plan-sessions.json`（运行态绑定，**checker 消费**做三方核对）+ `graph.json` 的 `attempts[]`（历史归属）+ `TODO.md` 头（恢复锚点）。
- **D6 续接 vs 重建**：同父会话内 resume；父死 / 换根 ⇒ 按 node 从 `BRIEF.md`+`TODO.md` 重建；**不承诺**跨会话续接。
- **D7 并行边界**：不同 topic 隔离；同 topic 独占锁（原子 `mkdir` + `owner` 文件 + **全节点 done 后释放** + 接管需人确认）。
- **D8 关闭范围**：不改 delegate / 单槽 / `role.json` / 角色矩阵 / rdd-workflow 产品侧；不派工程；不做 CI；**不建派发事前闸门**（技术上可行，本期范围决定；代价由 `attempts[].precheck` 事后可判来补一半）。

配套：`opencode.jsonc.opencode-go`（符号链接真源）+ `prompts/plan-worker.md`（新增）+ `prompts/plan.md`（能力块同步 + 协作段）+ `scripts/agent-guard-rules.ts`（`GUARDED_AGENTS`）+ `scripts/check-upstream-anchors.sh`（+7 锚点）+ `tests/config-guards.test.ts`（形态 / 可派者 / 投影块 / ignore 正反向）+ `.gitignore` + 文档投影。

## Acceptance

> **判据真源** = `openspec/changes/archive/2026-11-20-plan-multi-session-collaboration/proposal.md` 的「验收标准」表（立项后由 builder 起草、planner 审定）。本段是**最小可验收集合**，每条写成可直接执行的形态。

### A. 自动化（唯一真实闸门）

| # | 判据（可执行形态） | 对应 ADR |
|---|---|---|
| AC1 | `bun test tests/` 退出 0 且 0 fail | V01 |
| AC2 | `bash scripts/check-upstream-anchors.sh \| grep -q "RESULT: OK"` **且**脚本自报 `N ≥ 23`（运行时基线 23；本次 +6 ⇒ 29） | V15 |
| AC3 | `plan-worker` 形态断言绿：`mode=="subagent"`；`edit` 由 `capabilityBlock()` 渲染比对且恰好 `.rddf/plan-topics/*`；六个 action 全 deny；`shell` 首键 `"*":"deny"` 且含 `* > *` / `tee *` / `sort -o*`；白名单不含 `bun`/`node` | V02 |
| AC4 | 可派者集合：显式 `subagent:allow` == {`build`,`plan`}；**无 `subagent` 键的 agent 闭集 == `["title"]`**；`plan-worker` 自身 deny；front 清单不含它（引用既有 `:267-276` 断言） | V02b |
| AC5 | `GUARDED_AGENTS` 含 `plan-worker` **且** `bun scripts/agent-guard-gen.ts --check` 退出 0 | V03 |
| AC6 | `EXPECTED.prompts` 含 `"plan-worker.md"` **且** `EXPECTED.lib` 含 `"plan-topics.ts"` | V04 |
| AC7 | `prompts/plan.md` 的 `capability:plan` 块 == 配置派生值（含 `.rddf/plan-topics/*`、`.rddf/state/plan-sessions.json`） | V05 |
| AC8 | `plan` 的 `edit` 断言：首键 `"*"`，新两条 `indexOf > 0`（last-match-wins）；`plan-worker` 不含 `.rddf/plans/` / `.rddf/state/` | V06 |
| AC9 | `git check-ignore -v .rddf/state/plan-sessions.json` 退 0；`git check-ignore -q .rddf/plan-topics/<t>/nodes/<id>/RESULT.md` **非 0**（对合法 id）；黑名单 id（`foo.lock`/`.env`/`x.bak`/`backup1`）**被** ignore | V07 |
| AC10 | checker 负向 fixture 全绿：`graph.json` schema 六类违规（`exit 3`）/ node id 越界与黑名单 / 重复 id / 成环 / 悬空 dep / 零 checkbox（**不得** vacuous done）/ 模板占位 RESULT（**不得** complete）/ 缓存分叉 / `brief_sha256` 不符 / 孤儿节点双向 / 空 topic | V08 / V09 |
| AC11 | CLI 退出码四值互斥：`0` 绿 / `1` 违规 / `2` 用法 / `3` 不可解析；`2`/`3` 时 stdout 不含违规列表；`--json` stdout 可 `JSON.parse` 且 `violations[].code` 属闭集 | V08 |
| AC12 | `scope-check --baseline <sha>` 在 `mkdtemp` fixture 仓上：检出越界路径；`git` 失败 ⇒ 非零退出（不吞错）；跑前后 `git status --porcelain` 逐字相同（只读） | V10 |
| AC13 | `lock` 子命令只读报告：lock 存在性 / owner / 与 `plan-sessions.json` 绑定一致性；**不修改**任何文件 | V11 辅助 |
| AC14 | 既有口径零回归：`plan_ref` / `.rddf/plans/` 口径 diff 为空；delegate 五项权限断言绿；front 的 subagent 顺序守卫绿 | V14 |

### B. 人工 e2e（主会话执行，用户终裁；**无证据 = 判据不通过**）

| # | 判据 |
|---|---|
| AC15 | `opencode debug agents` 列出 `plan-worker` 且 `mode=subagent`；`plan` 工具清单含 `subagent`（V13） |
| AC16 | 九探针留证（`I2①`–`I2⑨`）；负向：子写 `lib/x.ts` / `..` 穿越**被拒**（配置级）；**跨 topic 写不被拒**（topic 树粒度 = ADR 残留 #1，靠 `scope-check` 事后核对）；记录落 `.rddf/reviews/plan-multi-session-collaboration-e2e.md`（V12） |
| AC17 | 两真实 plan 会话抢同 topic ⇒ 第二个被拒；全节点 done 后锁可释放（V11） |

**证据结构判据**（可机械）：`test -f .rddf/reviews/plan-multi-session-collaboration-e2e.md` 且 `grep -c '^| I2'` ≥ 9 且 `grep -c 'V11\|V13'` ≥ 2。

### C. 归档前置（机械）

| # | 判据 |
|---|---|
| AC18 | `test -f .rddf/state/verifier/plan-multi-session-collaboration.json` 且其 verdict == `pass`；否则**不得**归档 |

**否决条件**：① A/B 任一 AC 有工具证据失败；② `delegate` / 角色写门 / front 顺序守卫回归；③ `plan-worker` 出现在 front 可派清单（提权路径）；④ ADR 既有决策被静默改写（`plan_ref` 闭集、D8 关闭范围）。

## Capabilities

- 多个 plan 会话**并行**推进同一大任务的不同节点，「谁在做哪件事」有单一真源（`graph.json` + `plan-sessions.json`）。
- fork/join 判据**脚本可判**（`bun scripts/plan-topic-check.ts check <topic-dir>`），且 `progress` / `status` 正交 ⇒ **子先干完而依赖未完成是合法状态**，不再误报。
- 子会话进度**跨会话存活**（父死 ⇒ 按 node 重建，读 `BRIEF.md` + `TODO.md`），派生判据使进度仍可判。
- **自授权可被事后抓出**：`brief_sha256` 台账（谁改了验收标准判不出，但「被改过」判得出）；`attempts[].precheck` 让「父是否跳过派发前检查」事后可判。
- 上游语义漂移有 7 条锚点兜底；且判据用 `RESULT: OK`（**SKIP 不算绿**，修掉原 fail-open）。

## Impact

- **新增文件**：`lib/plan-topics.ts`、`scripts/plan-topic-check.ts`、`tests/plan-topics.test.ts`、`prompts/plan-worker.md`。前两者进「新增文件闸门」的 `EXPECTED.lib` / `EXPECTED.prompts`；**`scripts/`、`tests/` 新文件不在任何清单内（现状，本 change 不扩）** —— 如实登记原则。
- **配置面**：`opencode.jsonc.opencode-go`（符号链接，改真源）新增 `plan-worker`；`plan` 的 `edit` 加 `.rddf/plan-topics/*` 与 `.rddf/state/plan-sessions.json`（精确单文件）；`prompts/plan.md` 的 `capability:plan` 块同步（AC23 会红一次）。
- **守卫面**：`GUARDED_AGENTS` 加 `plan-worker`；`check-upstream-anchors.sh` 23 → 29 条（**数量以脚本自报为准**）。
- **文档投影**：`docs/MULTI-AGENT-DESIGN.md` / `AGENTS.md` / `docs/SUBAGENT-ORCHESTRATION.md` / `docs/CHANGELOG.md`。
- **兼容性**：`delegate` 通道、`role.json` / `role-claims.json` 语义、`prompts/build.md` 角色矩阵、`PLAN_REF_ROOTS` 集合**全部不变**；`plan` 的既有口径（`.rddf/plans/<slug>.md`、`plan_ref`）保持原样。
- **已知最弱一环**：单写者**在权限层不可保证**（`Wildcard` 跨斜杠 ⇒ 只能到 topic 树粒度）⇒ 协议 + 事后核对（`brief_sha256` / 重复 id / 孤儿 / scope-check 基线）。ADR「已知不可机判清单」7 项 + metis 补 2 项（**父死子仍活 ⇒ 双写者**；**attempts 无 session id ⇒ 越权无法归因**）须在 H3 回填 ADR。
- **风险**：上游语义漂移（锚点兜底）；父上下文被多子结果撑爆（prompt 约定「子只回指针」）；僵尸锁（人确认 + 新增释放协议）；人工 e2e 不可自动化（证据结构判据 + 主会话执行）。
- **回滚**：三步（移除 `plan-worker` 与两条 `edit` 放行 → 删 prompt 并撤出 `EXPECTED.prompts` → 保留已落盘的 `plan-topics/**`）。
