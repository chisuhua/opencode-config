# plan-multi-session-collaboration — plan 侧多会话离线协作机制（Phase 1 全量落地）

> 决策：`docs/adr/ADR-plan-multi-session-collaboration.md`（**Accepted** 2026-11-20）
> 实施路线图：`.rddf/roadmap/plan-multi-session-collaboration.md`（TDD 分解 + 验证面 + 14 条实施细节裁决，含 metis 修订记录）
> 改进提案：`.rddf/improvements/plan-multi-session-collaboration.md`
> 审稿报告：`.rddf/reviews/adr-plan-multi-session-collaboration-review.md`
> ⚠ 本路径未启用 `rdd-planner` / `rdd-builder`（canonical 前置 `.planner-handoff.json` 不存在）⇒ 走内置流程。

## Why

用户诉求：**让多个 plan agent 会话协同完成比单会话更复杂的任务**。已拍板：plan 是正式件上游；离线产物入 git；根 plan 会话创建子会话、子会话并行、父判 fork/join；子会话能持续推进自己的 todo；离线计划与「当前 plan agent + session id」绑定；**直接做 Phase 1**（无过渡期）。

为什么不能靠既有通道：

- **delegate 通道**：语义是工程实施（scope / role_class / 停机证据），槽位按 `workRoot` **全局单槽** ⇒ 并行被拒；且 delegate 后端**不进宿主会话树**（拿不到父子关系与完成唤醒）。
- **单会话内多线程**：父上下文被 N 个子任务撑爆，「谁在做什么」只能靠散文维持。

本 change 解决三件事：**(a)** 并行会话互不覆盖（写域 + 归属）；**(b)** 依赖关系可被机械判定（fork/join 从散文变成脚本）；**(c)** 子会话进度跨会话存活。

## What Changes

- **D1 协作区** `.rddf/plan-topics/<topic-slug>/`，与 `.rddf/plans/` 分家。单一写者：父写 `TOPIC.md` / `graph.json` / `nodes/<id>/BRIEF.md`；子写 `nodes/<id>/TODO.md` + `RESULT.md`。node id 字符集 `^[a-z0-9][a-z0-9._-]{0,63}$` + 黑名单（`.lock` 结尾 / `.env` / `.bak` / `backup*`）。
- **D2 `graph.json`** 为 fork/join 唯一载体；**`progress`（纯磁盘派生）与 `status`（门控有效值）正交**：
  - `progress`：`TODO.md` 全勾 ∧ `RESULT.md` 有实质内容 ⇒ `complete`；零 checkbox ⇒ `partial`（禁止 vacuous done）。
  - `status`：`progress==complete ∧ deps 全 done ∧ deliverables 非空且路径存在` ⇒ `done`；否则 `blocked_by_deps` / `pending`。
  - 三判据：无环（含悬空 dep / 重复 id）；子可先 complete 而 status≠done（合法）；join 必须有真实交付物。
- **D3** 父子会话 = 宿主 `subagent`（并行 = 同轮 `background`；join = 完成合成消息；续接 = `sessionID`）。
- **D4** 新增 `plan-worker`（`mode: "subagent"`，窄权限、无 `ask` 档、`shell` 无 `bun`/`node`）；**不**把 `plan` 改 `mode: "all"`。
- **D5** 会话身份三落点（路径不含 session id）：`plan-sessions.json`（gitignored，checker 消费）+ `attempts[]` + `TODO.md` 头。
- **D6** 续接 vs 重建；不承诺跨会话续接。
- **D7** 同 topic 独占锁（原子 `mkdir` + `owner` + **全节点 done 后释放**）。
- **D8** 不改 delegate / `role.json` / 角色矩阵 / rdd-workflow 产品侧 / CI；**不建派发事前闸门**（代价由 `attempts[].precheck` 事后可判补一半）。

## 验收标准

> 编号唯一源 = 本表。**A 组自动化**（唯一真实闸门）；**B 组人工 e2e**（主会话执行、用户终裁，无证据 = 不通过）；**C 组归档前置**。对应 ADR 的 Verification V01–V15。

| AC | 判据（可执行形态） | 类型 | 来源 |
|---|---|---|---|
| AC1 | `bun test tests/` 退出 0 且 0 fail | 自动 | V01 |
| AC2 | `bash scripts/check-upstream-anchors.sh \| grep -q "RESULT: OK"` 且脚本自报 `N ≥ 23`（运行时基线 23） | 自动 | V15 |
| AC3 | `plan-worker` 形态：`mode=="subagent"`；`edit` 由 `capabilityBlock()` 渲染比对且恰好 `.rddf/plan-topics/*`；六 action 全 deny；`shell` 首键 `"*":"deny"` 且含 `* > *`/`tee *`/`sort -o*`；白名单不含 `bun`/`node` | 自动 | V02 |
| AC4 | 可派者集合：显式 `subagent:allow` == {`build`,`plan`}；无 `subagent` 键 agent 闭集 == `["title"]`；`plan-worker` 自身 deny；front 清单不含它 | 自动 | V02b |
| AC5 | `GUARDED_AGENTS` 含 `plan-worker` 且 `bun scripts/agent-guard-gen.ts --check` 退出 0 | 自动 | V03 |
| AC6 | `EXPECTED.prompts` 含 `plan-worker.md` 且 `EXPECTED.lib` 含 `plan-topics.ts` | 自动 | V04 |
| AC7 | `prompts/plan.md` 的 `capability:plan` 块 == 配置派生值（含两条新 edit 项） | 自动 | V05 |
| AC8 | `plan` 的 `edit` 首键 `"*"`、新两条 `indexOf > 0`；`plan-worker` 不含 `.rddf/plans/` / `.rddf/state/` | 自动 | V06 |
| AC9 | `git check-ignore -v .rddf/state/plan-sessions.json` 退 0；`graph.json` 与合法 node 的 `RESULT.md` 退**非 0**；黑名单 node id 被 ignore | 自动 | V07 |
| AC10 | checker 负向 fixture 全绿：schema 六类违规（exit 3）/ node id 越界与黑名单 / 重复 id / 成环 / 悬空 dep / 零 checkbox / 模板占位 RESULT / 缓存分叉 / `brief_sha256` 不符 / 孤儿节点双向 / 空 topic | 自动 | V08/V09 |
| AC11 | CLI 退出码四值互斥（0/1/2/3）；2/3 时 stdout 不含违规列表；`--json` 可解析且 `violations[].code` 属闭集 | 自动 | V08 |
| AC12 | `scope-check --baseline <sha>` 在 `mkdtemp` fixture 仓：检出越界；`git` 失败 ⇒ 非零退出；跑前后 `git status --porcelain` 逐字相同 | 自动 | V10 |
| AC13 | `lock` 子命令只读报告（存在性 / owner / 与 `plan-sessions.json` 绑定一致），不修改文件 | 自动 | V11 辅助 |
| AC14 | 既有口径零回归：`plan_ref` / `.rddf/plans/` 口径 diff 为空；delegate 五项权限断言绿；front subagent 顺序守卫绿 | 自动 | V14 |
| AC15 | `opencode debug agents` 列出 `plan-worker` 且 `mode=subagent`；`plan` 工具清单含 `subagent` | 人工 | V13 |
| AC16 | 九探针留证（`I2①`–`I2⑨`）；负向：`lib/x.ts` 与 `..` 穿越**被拒**（配置级：`edit` allow 仅 `*.rddf/plan-topics/*`）；**跨 topic 写不被拒**（topic 树粒度 = ADR 残留 #1，靠 `scope-check` 事后核对）；记录落 `.rddf/reviews/plan-multi-session-collaboration-e2e.md` | 人工 | V12 |
| AC17 | 锁为**协议级**（非权限门）：原子 `mkdir` 第二次失败 + checker `lock` 只读报告；「第二个会话写入被拒」靠 prompt 协议 + 事后核对；全节点 done ⇒ 锁可释放 | 人工 | V11 |
| AC18 | 归档前置：`.rddf/state/verifier/plan-multi-session-collaboration.json` 存在且 verdict == `pass` | 机械 | 用户口径 |

**证据结构判据（可机械）**：`test -f .rddf/reviews/plan-multi-session-collaboration-e2e.md` 且 `grep -c '^| I2'` ≥ 9 且含 `V11` / `V13` 行。

**否决条件**：① A/B 任一 AC 有工具证据失败；② delegate / 角色写门 / front 顺序守卫回归；③ `plan-worker` 出现在 front 可派清单；④ ADR 既有决策被静默改写。

## 非目标

- ❌ 派发事前闸门（ADR 残留 #2，范围决定不做）。
- ❌ 每节点精确写域（ADR 残留 #1，宿主 `subagent` 不传 permissions）。
- ❌ `.rddf/plan-topics/**` 进 `PLAN_REF_ROOTS`；❌ `docs/adr/` 清单守卫（残留 #5 决定 = review 兜底）；❌ CI / git hook；❌ 改 delegate / role.json / 角色矩阵 / rdd-workflow 产品侧。

## 交付物

1. `lib/plan-topics.ts`（schema + progress/status 派生 + 判据）
2. `scripts/plan-topic-check.ts`（`check` / `scope-check` / `lock` 三子命令，退出码四值）
3. `tests/plan-topics.test.ts`（负向 fixture 全覆盖）
4. `prompts/plan-worker.md`（新增）+ `prompts/plan.md`（协作段 + capability 块同步）
5. `opencode.jsonc.opencode-go`（`plan-worker` + plan 的 edit 白名单）
6. `scripts/agent-guard-rules.ts`（`GUARDED_AGENTS`）+ `scripts/check-upstream-anchors.sh`（+6 上游锚点；第 7 条 delegate 单槽属本仓语义，由 delegate 测试覆盖）
7. `tests/config-guards.test.ts`（形态 / 可派者 / 投影块 / ignore 正反向 / EXPECTED 清单）
8. `.gitignore`、`docs/MULTI-AGENT-DESIGN.md`、`AGENTS.md`、`docs/SUBAGENT-ORCHESTRATION.md`、`docs/CHANGELOG.md`
9. `.rddf/plans/plan-multi-session-collaboration.md`（TDD 5 步）

## 风险

| 风险 | 处置 |
|---|---|
| 上游语义漂移 | 7 条锚点 + `grep -q "RESULT: OK"`（SKIP 不算绿） |
| `plan-worker` 提权 | 三 deny + 可派者集合断言（含无键闭集）+ 白名单无 `bun` |
| 单写者被破坏 | `brief_sha256` + 重复 id + 孤儿 + scope-check 基线 |
| 锁死锁 | 补释放协议（全 done ⇒ `rmdir`）+ 不自动抢占 |
| 人工 e2e 无证据 | 主会话执行 + 证据结构判据；无证据按**判据不通过**（不是「取证不可用」） |
| 工作区既有残留被误提交 | 逐文件 stage，不 `git add -A` |
