# 子代理编排与委托通道：当前态汇总（2026-11-13）

> **文档定位**：**汇总 + 索引**，不是规则真源。
> 规则以 `prompts/*.md`（agent 行为）、`docs/adr/*.md`（架构决策）、`opencode.jsonc.opencode-go`（权限矩阵）、`lib/*.ts`（实现）为准；本文只把它们的**当前态**汇到一处，并给出指针。
> **若本文与真源冲突，以真源为准**（本文不改判据，只描述现状）。要改规则，先改真源，再回填本文。

---

## 1. 角色与 agent 清单

| agent | 类型 | 模型 | 定位 | prompt |
|---|---|---|---|---|
| `build` | primary | `minimax-cn/MiniMax-M3.1-Flash` | 实施者（写代码） | `prompts/build.md` |
| `plan` | primary | 同上 | 设计者 / 规划者（**只读**，可**委托**工程 session 实施） | `prompts/plan.md` |
| `front` | primary | 同上 | 用户交互内核（只读，工程行动经 delegate） | `prompts/front.md` |
| `explore` | subagent | `commandcode/deepseek/deepseek-v4.1-flash` | 代码库定位 | `prompts/explore.md` |
| `librarian` | subagent | 同上 | 外部文档 / 上游源码 | `prompts/librarian.md` |
| `metis` | subagent | 同上 | 计划前 gap 分析（六节） | `prompts/metis.md` |
| `general` | subagent | 同上 | 杂活兜底（不可再委派） | `prompts/general.md` |
| `context-builder` | subagent | 同上 | **critic prompt 机械搬运工**（见 §7） | `prompts/context-builder.md` |
| `oracle` | subagent | `kimi-code/kimi-for-coding`（`variant: max`） | 顾问 + 对抗式审查（会怎么坏） | `prompts/oracle.md` |
| `critic` | subagent | 同上 | 第二审（与既有 ADR / 契约的冲突） | `prompts/critic.md` |
| `title` | primary(hidden) | `commandcode/deepseek/deepseek-v4.1-flash` | 会话标题生成 | — |

**模型选型原则**（`docs/MULTI-AGENT-DESIGN.md` §5.2 模型选择、§5.3 链路分档）：轻量链路（检索 / 机械搬运）用 `commandcode` 档；审查链路（oracle / critic）用推理档。`hidden` 只保留给 `title`（不出现在用户手选列表）；**`context-builder` 的 `hidden` 已移除** —— 隐藏会把它从父模型的「Available subagents」清单里过滤掉（`packages/core/src/tool/plugin/subagent.ts` 按 `!agent.hidden` 过滤），可见性直接决定采纳率。

## 2. 委派拓扑与门控

### 2.1 subagent（问答型）

- **清单由运行时拼装**：父模型的工具描述里追加「Available subagents」，过滤条件 = `mode !== "primary" && !hidden && permission !== deny`（`subagent.ts`）。**这就是 agent 可见性的唯一机器面**。
- `agent` 参数是**自由字符串**（不是 enum）—— 名字写错会在运行时被拒（`Unknown agent`），而不是被 schema 挡下。
- agent 级 `permission.subagent` 白名单：`front` 只放行 5 个只读（explore / librarian / oracle / metis / critic）；`build` / `plan` 全量 allow。
- **规则是 last-match-wins**：`"*": "deny"` 必须是**第一条**，放末尾会把整个工具隐藏（已发生过两次事故：① `*: deny` 放末尾导致工具被隐藏、② `curl * -o*` 漏首参形态致 librarian 落盘 —— 见 `docs/adr/ADR-front-knowledge-capability.md` D2.1 与 D3.1，事故记录见 `tests/config-guards.test.ts` 头注释）。

### 2.2 delegate（工程型，唯一通道）

五个工具由 `plugins/delegate.ts` 经 `ctx.tool.transform` 注册，**工具名 ≠ 权限项名**：

| 工具 | 权限项（`options.permission`） | 语义 |
|---|---|---|
| `delegate` | `delegate` | 同步：建/复用 → 投递 → 等 → 返回 |
| `dispatch` | `delegate_dispatch` | 异步：投递即返回（**≠ 任务完成**） |
| `sessions` | `delegate_sessions` | 只读名册（**按 owner 过滤**，见 §8） |
| `suspend` | `delegate_suspend` | 暂停（保留上下文，之后可 resume） |
| `cancel` | `delegate_cancel` | 终止（**先确认真的停了**才墓碑） |

门控：顶层 `permission` 五项**全 `deny`**；`front` 与 `plan` 在 agent 级各 `allow` 五项。**唯一性指门控边界唯一，不是工具名唯一**（`docs/adr/ADR-front-multi-backend.md` D1 + `ADR-plan-delegate-engineering-session.md` D1）。

## 3. 审查链与档位

| 产出角色 | 固定审查者 | 审什么 | 预算 |
|---|---|---|---|
| `architect` | **oracle → critic** | oracle：目标场景会怎么坏；critic：与既有 ADR / 契约 / 已签批决策的**冲突** | oracle 1 + critic 1（BLOCKER 后 1 次复审） |
| `planner` | **metis** | 隐藏意图 / 歧义 / AI slop / 缺失 AC / 边界情况 | 1 轮 |
| `builder` | **verifier**（角色内建）+ critic | AC 逐条有工具证据 / 边界与错误路径 / 资源释放 / 遗留清扫 | verifier 3 + critic 2 |

**档位（`review_profile`）是 critic 的判据轴**，四档：`arch`（ADR / 架构文档 / roadmap 决策）、`plan`（proposal / design / tasks / spec delta）、`build`（源码 / 测试 / 脚本）、`archive`（归档前增量）。
**权威映射在 `prompts/build.md` §档位选择**；`prompts/critic.md` 的路径推断只是 build 未给档位时的兜底（判据不一致时以 build 侧为准）。

**继承式档位**（`build.md` 复审协议）：复审轮必须带 `## review_profile`（写 `继承第 N 轮：<profile>`）—— 内容可豁免，**档位不可豁免**（它是判据前提；丢了会让同一 change 两轮用不同判据集）。critic 侧缺档位时按继承声明取值，否则 `mixed` 并声明。

## 4. 子代理输入契约（L1–L5）

规则真源：`lib/subagent-contract-core.ts`（`CONTRACTS`）+ `plugins/subagent-contract.ts`（接线）。**当前只对 `critic` 生效** —— 其余 agent 无判据（≠ 已合规）。

| 层 | 时点 | 作用 |
|---|---|---|
| **L3** | 生成前 | 把契约说明注入 `subagent` 工具描述（父模型看得见） |
| **L1** | 执行前（`tool.execute.before`） | 判定 + 拦截（可 `enforce` 阻断；默认 `warn` 只记录） |
| **L2** | 落库前（session prompt 钩子） | 兜底检测（只记录、不能拦） |
| **L4** | CI | `tests/config-guards.test.ts` 断言规则真源 ↔ prompt / description 一致 |
| **L5** | 离线 | `scripts/audit-subagent-prompts.ts` 审计 CLI |

判据要点：7 字段（`changes_summary` / `intent` / `focus` / `review_profile` / `diff_or_paths` / `context` / `expected_format`）；长度 `200 ≤ len ≤ 80000`；**豁免**（复审轮：关键词窗口 400 字符 + 继承自证）；**状态继承**（进程内 Map，key = 父会话 + agent，TTL 30min）；**续接轮不要求完整字段集**。
可观测：`~/.local/share/opencode/subagent-contract.log`，日志词表：`event` ∈ {`injected`, `profile_missing`}，`level` ∈ {`violation`, `exempted`}。其中 `profile_missing`（档位缺失）**独立于豁免**，用于统计档位声明率。

端到端：`/workspace/main/rdd-workflow-e2e/tests/integration/test_subagent_contract_runtime.bats`（11 场景，需真实模型额度；未跑 ≠ 通过）。

## 5. critic 的「评审对象边界」

评审对象必须是**证据自足、可签批的产物**（ADR / proposal / 代码 / 归档增量 / 治理面规则文件）。判据依赖对象里的证据 —— 对象里没有，判不了。

- **建议类产出不作评审对象**（oracle 的审查结论、metis 的 gap 分析）：它们是「关于某物的结论」，只审它等于审「报告写得像不像样」；且 `mergeable` 对建议类无合并语义，硬审会产出无法落地的 BLOCKER（而「只有 BLOCKER 触发返工」）。
- 建议类产出**只作上下文**；要复核某条建议 → 审它指向的产物；建议将被采纳 → 先落成产物再审。
- 整份输入都是建议类 ⇒ 走**无评审对象出口**：`profile: none` + 理由，**不产出任何 finding**、不给 `mergeable`。

## 6. oracle 的双模式与判定行

- **模式**：审查模式（默认，输入带产物 / 判据即成立）/ 咨询模式（只有问题、没有产物与判据）。**拿不准 ⇒ 按审查模式**（漏判代价远高于多一行）。
- **判定行**（审查模式写在「建议」段首行）：治理面 → `治理面判定: PASS | BLOCK | PASS-WITH-NOTES`；其他 → `判定: APPROVE | REJECT`（暂无硬消费方）。`BLOCK` 必须带证据，否则 `PASS-WITH-NOTES` + 列出未覆盖的判据面（反判定通胀）。
- **判定词表的单一真源 = `prompts/oracle.md` §模式**；`build.md` 与 `docs/MULTI-AGENT-DESIGN.md` 只指向它（`grep "治理面判定: PASS|PASS-WITH-NOTES"` 只应命中 oracle.md）。
- 职责切分：oracle **主审**失败模式（会怎么坏）；critic **主审**与既有 ADR / 契约的冲突。critic description 写明「description 只决定主次，不缩小 critic.md 正文的覆盖面」。

## 7. metis 与 context-builder

**metis**：六节输出契约（隐藏意图 / 歧义 / AI slop 风险 / 缺失的验收标准 / 边界情况 / 建议修改），**写在 `prompts/metis.md` 自己手里**（三处一致性由 `config-guards` 钉住）。三档 severity 词表已移除 —— 它零消费方、73% 的输出本就用替代分级、`blocker` 与 critic 的闸门词跨界；改为「按优先级排序：哪些必须先解决、哪些可以后置」。

**context-builder = 机械搬运工**：产出 `changes_summary` / `review_profile` / `diff_or_paths` / `context` / `expected_format`；`focus` 可推断但每条标「推断：」；**`intent` 不可推断** —— 缺失时首行 `ERROR: missing intent` 且不产出 prompt。
**已知取舍**（实测）：310 个 critic prompt 里只有 22 个（12%）真正用了它的输出。它被降级为**窄条件**（大 diff > 200 行 / 跨多文件 **且已给 intent**），不再是推荐路径。

## 8. delegate 工程通道的当前态

### 8.1 派发主体

`front` 与 `plan`（planner 角色）**并列**放行同一通道；plan 派**可写实施**时必须带 `plan_ref`：

- 解析根写死 `project_dir`（不用插件进程 cwd）；**accepted roots**：`.rddf/plans/**`、`.rddf/improvements/**`、`.rddf/roadmap/**`、`openspec/changes/*/proposal.md`。
- **可写 ≠ 可引用**：accepted roots 是唯一判据，与 plan 的 `edit` 白名单无包含关系。
- 存在性校验是「计划先行」的强制函数，**不是相关性证明**。
- plan 的计划产出口径收敛到 `.rddf/plans/<slug>.md`（配置里 `.plans/*.md` 的放行保留，但不再是口径，也不在 accepted roots 内）。

### 8.2 槽位、归属、优先级

- **单槽**：同一 `workRoot` 同时只允许一个后端在跑（`state ∈ {dispatching, active}` + 活体判定仍在跑）。判定**富化既有拒绝点**，不新建锁外预检（避免 TOCTOU 与两面「unknown 会话」口径漂移）。
- **归属**：`owner_agent`（`front` / `plan`）落 pair / ledger / session metadata；**缺失一律按 front 解释**。`sessions` **按 owner 过滤**（过滤只发生在 sessions 的 execute 内；全局配额统计与 dispatch 超限诊断保持 owner 无关）。
- **优先级（D7）**：**plan 优先、但不抢占**。目标工作树被**另一 owner-kind** 的活跃后端占用 ⇒ 报错**指名占用者**（`owner=plan` / `owner=front`）+ 可执行下一步。
  - **跨 owner-kind 的 resume 硬拒**（判据用 owner-kind 而非 session id ⇒ 同 kind 的「隔天回来继续」不受影响）；owner 会话已亡 ⇒ 放行（亡主例外）。
  - **跨 owner-kind 的 cancel 硬拒**（补齐归属门控只在 suspend 路径的缺口，否则 front 可绕过优先级直接终止 plan 的活后端）。
  - **owner 亡主本身不消解冲突**（冲突只看后端活体）；出口是既有亡主门控回收后再派。
  - 拒绝点落 ledger `priority_blocked`（`caller_kind` / `holder_kind` / `holder_state` / `holder_session_id` / `work_root` / `path`）。

## 9. 已知限制与残留

| # | 残留 | 状态 |
|---|---|---|
| 1 | 只有 `critic` 有输入契约；其余 agent 无判据（≠ 已合规） | tasks 7.4（前置未到） |
| 2 | 契约默认 `warn`（只记录不拦） | tasks 7.1 等灰度数据 |
| 3 | 档位声明率不足（实测首审轮 55% / 复审轮 33%，n=182） | 已上 A（继承式档位）+ C（首审默认骨架）+ D（`profile_missing` 可观测）；**B（缺档位一律 mixed）与 E（独立必填 + enforce）待线上数据** |
| 4 | `sessions` 按 owner 过滤后失去「全机后端」运维视图 | 候选增强 `scope: owner|all`，v1 不做 |
| 5 | plan 的后端转 `suspended` 后，front 仍可占用该工作树（plan resume 时才冲突） | 未加规则，登记备查 |
| 6 | 后端 session 写 `.rddf/state/role.json` 顶层镜像，与主会话 role 镜像可能打架（展示面，非权限冲突） | 登记 |
| 7 | `priority_blocked` 的线上频次统计 | 待部署后积累 |
| 8 | context-builder 采纳率 12% | 已降级为窄条件；若仍低可再议退役 |

## 10. 索引

**ADR**（`docs/adr/`）：`ADR-front-multi-backend`（多后端编排）、`ADR-front-stop-ownership`（归属与槽位释放）、`ADR-front-stop-confirmation`（停机证据）、`ADR-front-cancel-release`（取消放行）、`ADR-front-knowledge-capability`（只读 subagent 门控）、`ADR-delegate-delivery-evidence`（交付证据枚举）、`ADR-canonical-root-normalization`（stateRoot/workRoot 归一）、`ADR-plan-delegate-engineering-session`（**派发主体扩展 + D7 优先级**）。

**审稿 / 调研记录**（`.rddf/reviews/`）——**本轮相关子集**（该目录共 38 份，此处只列与本轮治理面改动直接相关者）：`adr-plan-delegate-engineering-session-review.md`（本篇 ADR 的 oracle/critic 审稿记录）、`subagent-oracle-intent-arch-review.md`、`subagent-oracle-intent-findings.md`、`metis-check-findings.md`、`review-profile-improvement-plan.md`、`context-builder-narrowing-spec.md`、`subagent-contract-e2e.md`、`subagent-contract-exemption-sampling.md`。

**变更史**：`docs/CHANGELOG.md`（v2.12–v2.19 覆盖本轮全部治理面改动）。

**守卫**：`tests/config-guards.test.ts`（权限矩阵 / 词表单源 / 六节三处一致 / 描述非 orphan / 本文档的**引用路径存在性**）、`tests/subagent-contract-core.test.ts`（契约纯逻辑）、`tests/delegate-async.test.ts`（派发主体 / 归属 / 优先级）。

> **守卫的能力边界**：路径守卫只验「被引用的文件还在」，**不验内容与章节号是否仍对得上** —— 章节号（§x.y）与内容一致性靠**人工维护 + 治理面审稿**兜底（oracle 核对本轮就抓到过一处错指）。不要把「路径都在」当成「引用没漂」。
