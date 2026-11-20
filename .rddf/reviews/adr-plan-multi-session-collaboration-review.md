# ADR 审稿报告：ADR-plan-multi-session-collaboration

> 产出角色：architect（誊写审查者结论；审查者只读）
> 审稿对象：`docs/adr/ADR-plan-multi-session-collaboration.md`
> 日期：2026-11-20
> 结论：**Accepted** —— oracle `治理面判定: PASS-WITH-NOTES`（5 条未覆盖面）→ 全部处置 → critic `APPROVE` / `mergeable: yes` / 无 BLOCKER / 无 SHOULD_FIX（3 条 NITS，2 条已落地、1 条经核实与本篇无关）

---

## 1. 审稿链

| 轮 | 审查者 | 判定 | 关键发现 | 处置 |
|---|---|---|---|---|
| 1 | oracle（治理面） | `治理面判定: PASS-WITH-NOTES` | ① **「`subagent` 调用点无插件插桩位」是事实错误** —— 本仓 `plugins/subagent-contract.ts:87-131` 的 L1 硬门就挂在 `ctx.tool.hook("execute.before", …)` 上（可读 `event.input.{agent,prompt,sessionID,background}` 与 `event.sessionID`，抛错即执行前被拒）⇒ 派发**事前闸门技术上可行**，本篇把「范围决定」写成了「能力上限」；② 上游 7 条语义无语义锚点；③ 「新增文件闸门」触发表述错（`docs/adr/` 是平铺闸门已知盲区）；④ `PLAN_REF_ROOTS` 不含 `.rddf/plan-topics/**` 未登记；⑤ `plan-worker` 可派者集合无守卫 | 全部采纳（5 条）：① 前置事实新增 ⑩ 并改写 D3/D8/后果段/已知不可机判清单/残留 #2 共四处表述 ⇒ 事实 ⑩ 明写「技术可行、本篇不建是**范围决定**、不是能力上限」；② 新增事实 ⑪ + V15（①–⑦ 各一条 `scripts/check-upstream-anchors.sh` 语义锚点，脚本只写语义不写行号）；③ 改写后果段 + 新增 V04b + 残留 #5（显式做一次决定：靠 review 流程兜底）；④ D1 新增 plan_ref 闭集边界登记；⑤ 新增 V02b（`subagent` 为 allow 的集合 == {build, plan}） |
| 2 | critic（arch + build） | `APPROVE` / `mergeable: yes` / `scope_exceeded: false` | 无 BLOCKER、无 SHOULD_FIX。3 条 NITS：① D2 判据 3「不得判 done」与「status 只能派生」措辞滑移；② V02b 依赖「顶层 `permission` 无 `subagent` 键」这一隐含前提；③ `cli.json` 与 `opencode.jsonc.opencode-go` 有未暂存改动，与 changes_summary 不符 | ① 已改写（`:60` 判据 3 改为「`graph.json` 的**缓存 `status`** 不得写成 `done`（须与派生值一致，见 V09）」）；② 已补（V02b 显式带上顶层无 `subagent` 键的前提 + 未来加键须复核口径）；③ **经核实与本篇无关**：`cli.json` 是 CLI `verbosity: low→medium`、`opencode.jsonc.opencode-go` 是 `metis` 模型 `commandcode/…→opencode-go/…`，均为**前轮工作区残留**，本篇未触碰（见 §3） |

---

## 2. oracle 明确核实「无需改动」的项（复审时不重复上报）

- **D4 否决 `mode: "all"` 的论据成立**：upstream `subagent.ts:142-143` 只拒 `mode === "primary"`；`:144-151` 的运行期 assert 与 `:288-294` 的可派清单**都按调用方**的 `subagent` 权限过滤 ⇒ `build` 的字符串 `allow`（`opencode.jsonc.opencode-go:102`）可拉起带 `delegate`/`question`/`skill` 的 plan 子会话 ⇒ 提权路径真实存在。
- **`plan-worker` 方案无提权面**：`plan-worker` 工具集 ⊆ `build` 自身（`edit *: allow`、`shell *: allow`）；全仓仅 `build` / `plan` 能拉起它；`front` 的 map 恰好 5 个只读 agent（守卫 `tests/config-guards.test.ts:267-276`）；其余 7 个 agent 的 `subagent` 全 `deny` ⇒ 无深度 2 嫁接路径。
- **D1 第三目录不与父篇冲突**：父篇收敛的是「plan 的**单篇计划产出**」（`ADR-plan-delegate-engineering-session.md:46`），非 `.rddf/plans/` 目录独占；`PLAN_REF_ROOTS` 不含 plan-topics（`lib/delegate-core.ts:1278-1283` 抽验成立）⇒ 不冻错 plan_ref 契约。
- **D4 与 `ADR-role-aware-permissions` 不冲突**：写门只门控 build 主会话、显式跳过非 build（`lib/role-policy.ts:291-296`）；与 `ADR-backend-handoff-role-class` 的 role_class 体系不相交（后者是 delegate 通道的派发参数，`plan-worker` 无 delegate）。
- **上游事实抽验通过**：`Wildcard.match` 的 `*` → `.*` 带 `s` flag（`util/wildcard.ts:8,13`，跨斜杠属实）；子会话权限 = agent 自身配置（`permission.ts:165` 的 merge；`subagent.ts:195` 建会话不传 permissions）；完成合成消息（`subagent-completion.ts:37`）；`.gitignore` 已有 `pair.json` / `role-claims.json` / `.rddf/**/*.lock` 先例 ⇒ D5 的 `plan-sessions.json` 与 D7 的锁文件均自然落进既有口径。

## 3. critic 的「验证建议」中与本篇有关的两项处置

- `bash scripts/check-upstream-anchors.sh` + `bun test tests/`：**本篇未触任何代码/配置/测试**，现状即绿；V15 落地后锚点数应从 23 → 23+7（critic 标注为推断、未验证）。⇒ 实施时以脚本实跑为准。
- `git diff cli.json opencode.jsonc.opencode-go`：**已核实**，两处均为前轮工作区残留（CLI `verbosity`、metis 模型切换），**与本篇无关**，本篇只新增 `docs/adr/ADR-plan-multi-session-collaboration.md` 一个文件。

## 4. 放行条件（critic 给出）

1. 实施时核 **V15**：前置事实 ①–⑦ 各有一条 `scripts/check-upstream-anchors.sh` 语义锚点（**只写语义 + 文件 + grep 模式，不写行号**），且脚本实跑 23+7 全绿。
2. 实施时核 **V02b**：`subagent` 为 `allow` 的 agent 集合 == {`build`, `plan`}（含顶层无 `subagent` 键的前提断言）。
3. 实施时核 **V04b**：`docs/adr/` 的归属决定（靠 review 流程兜底）须与残留 #5 一致，不得在实施中悄悄改为「已建清单守卫」或反向漂移。

## 5. 自指与独立证据声明

本轮只**新增一篇 ADR 文档**（`docs/adr/ADR-plan-multi-session-collaboration.md`），未改 `prompts/oracle.md` / `prompts/critic.md` / `prompts/build.md` 的审查契约本身 ⇒ 不存在「审查实例跑旧契约」的盲区。但本篇的 Verification（V01–V15）是**前瞻判据**，其成立性只能由实施后的实测提供 —— 本审稿**不构成**「新能力正确」的证据，只构成「决策自洽、与既有 ADR 不冲突」的证据。上游语义（事实 ①–⑦）在本仓不可完全验证，其兜底正是 V15 存在的意义。

## 6. 归档指针

- ADR：`docs/adr/ADR-plan-multi-session-collaboration.md`（Status = **Accepted**）
- 本报告：`.rddf/reviews/adr-plan-multi-session-collaboration-review.md`
- 关联 change：尚未立项（architect 不创建 openspec change）→ 暂记 `backlog: plan-multi-session-collaboration`；立项后回填 ADR 元数据的「关联 change」与「AC 映射」两行。
- 待办（本篇残留，不阻塞收口）：① 每节点精确写域；② 派发事前闸门（技术上可行，本期范围决定不做）；③ plan/plan-worker prompt 重复的漂移守卫；④ `plan-topics/**` 与 rdd-workflow 产品侧 `.rddf/` 约定边界；⑤ `docs/adr/` 平铺闸门盲区的归属决定。

## 7. 实施后核验（2026-11-20，builder 回填）

| 放行条件 | 核验结果 |
|---|---|
| ① V15：上游语义锚点全绿 | ✅ P1–P6 六条已进 `scripts/check-upstream-anchors.sh`；`RESULT: OK（29/29）`。⚠ **锚点运行时基线是 23**（静态 16 行 + A7 循环展开），ADR 正文的「23 → 23+N」成立，但 `grep -c` 只数静态行会误判为 16 |
| ② V02b：可派者集合钉死 | ✅ `tests/config-guards.test.ts` AC4：显式 `subagent:allow` == {build, plan}；无键 agent 闭集 == `["title"]`；front 不含 plan-worker；plan-worker 自身 deny |
| ③ V04b：`docs/adr/` 归属 = review 兜底 | ✅ 未建清单守卫，`EXPECTED` 闸门仍是平铺（`docs/` 子目录盲区保留），与残留 #5 一致 |
| 唯一真实闸门 | ✅ `bun test tests/` **969 pass / 0 fail**；`agent-guard-gen.ts --check` 无漂移 |
| 人工 e2e（V11/V12/V13） | ⏳ 待执行（主会话）—— 记录 `.rddf/reviews/plan-multi-session-collaboration-e2e.md` |

**实施中发现并在 ADR「实施记录」登记的两条不可机判项**：① 父死子仍活 ⇒ 双写者（纯协议兜底）；② `attempts[]` 无 session id ⇒ 越权无法归因。
