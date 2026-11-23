# librarian-delegate-contradiction — 治理面审查记录（oracle → critic）

> **对象**：`openspec/changes/archive/2026-11-23-librarian-delegate-contradiction/`（配置真源 + 守卫 + 文档投影）
> **档位**：oracle `审查域: 治理面`（词表 = `治理面判定:`）→ critic `review_profile: build, arch`
> **预算**：oracle 1 轮 + critic 1 轮（critic 无 BLOCKER ⇒ 无需复审；**复审额度未动用**）
> **结论**：oracle `PASS-WITH-NOTES` → critic `APPROVE`（`mergeable: yes` · `scope_exceeded: false` · **0 BLOCKER**）

---

## 1. 审查对象与范围

| 项 | 内容 |
|---|---|
| 改动文件 | `opencode.jsonc.opencode-go`（配置真源）· `tests/config-guards.test.ts`（守卫）· `docs/MULTI-AGENT-DESIGN.md` · `docs/SUBAGENT-ORCHESTRATION.md`（文档投影）· 新建 `openspec/changes/archive/2026-11-23-librarian-delegate-contradiction/{proposal,tasks}.md` |
| 意图 | `librarian` 的 prompt 要求「本地代码搜索 → 委派 `explore`」，机器层却是 `subagent: "deny"` ⇒ prompt 要求的动作被机器层禁止、prompt 又禁止它自搜 ⇒ 只能编造 / 静默跳过 / 报错。**A1**：放开机器层为字典白名单 `{ "*": deny, explore: allow }`，让机器层追上 prompt 与文档 |
| 不在范围 | `prompts/librarian.md`（improvement 已登记「已知残留」）· 已签批 ADR（属 architect）· 新增回滚清单（须先做 `rollback-manifest-find-narrowing`）· §3.1 矩阵填充语义（`delegation-matrix-fill-semantics`，P2，依赖本条） |

## 2. oracle 结论与逐条处置

**判定行**：`治理面判定： PASS-WITH-NOTES`（oracle 用全角冒号输出；词表 = 治理面词表，且**无**「审查域=未声明」标注 ⇒ 治理面审查成立）。
**证据边界声明**：oracle 的 shell 权限被拒 ⇒ `bun test` 未能自跑，采信调用方给出的前后两次统计（1133/1 skip/1 fail → 1135/1 skip/1 fail）。

| # | oracle finding | 处置 | 证据 |
|---|---|---|---|
| O-1 | 深度 2 写链仍封死（`explore` 自身 `subagent: "deny"` + librarian 白名单不含 `general`）⇒ ADR D2 `:69` / D3 `:139` 的**措辞**失真，但**不变量**（默认拒绝一切非白名单目标）语义等同 ⇒ 属「同一不变量的另一种记法」 | **采纳**：ADR 不由本 change 改（越权 = 更大的流程违规）⇒ 登记为 **architect 的 ADR 增补记录**后续项，并落成 backlog 实体 `.rddf/improvements/adr-front-knowledge-librarian-whitelist-annotation.md` | 本文件 §4；`docs/MULTI-AGENT-DESIGN.md` §4.3 新脚注 `§§` 明写「深度 2 写链仍封死（依据 ADR D2/D3）」 |
| O-2 | 字典形态与 `front` 逐字同构（首条 `*: deny` + 末条具体 allow）⇒ last-match-wins 可见性语义无新增风险面 | **采纳**：AC4b 已钉首键 / 兜底值 / 闭集；`§§` 脚注写明「`"*": deny` 同样排在第一条」 | `tests/config-guards.test.ts` AC4b |
| O-3 | 守卫对两类回归（改回字符串 `deny` / 放宽到 `general`）均真红，无恒绿面 | **采纳**：判别力自证已做（改回 `"deny"` ⇒ AC4b + AC4c 同时红） | 本文件 §3 |
| O-4（观察 a） | AC4c 的三桶**不划分**全部 agent：若某 agent 从 `"deny"` 改成 `"ask"` 或新增字符串受限 agent，AC4c 会**静默放行** | **当场闭合**：AC4c 增第 4 桶「字符串受限（`deny`/`ask` …）」并给闭集（7 个）⇒ 静默放行面关闭 | `tests/config-guards.test.ts` AC4c（本次已改） |
| O-5（观察 c） | `tasks.md` 曾把「AC4 文案已改」写成完成项，与产物不符 ⇒ 后续审计会误判「造假」 | **当场闭合**：tasks.md 的 T2 改为显式**偏差登记**（未按字面落地 + 原因 + 等价覆盖 + 后续动作）；`proposal.md` 的 AC4 行同步登记偏差 | `openspec/changes/archive/2026-11-23-librarian-delegate-contradiction/tasks.md` T2 |
| O-6 | 人工项：运行时冒烟（librarian 会话内确认 `explore` 在可用清单、`general` 不在）—— 静态守卫覆盖不到 | **登记为人工剩余项**（`docs/MULTI-AGENT-DESIGN.md` §8.2 第 2 条末行 + 本文件 §4） | 同左 |

## 3. critic 结论与逐条处置

**结论**：`profile: build + arch` · `# 审查结论：APPROVE` · `mergeable: yes` · `scope_exceeded: false` · **BLOCKERS 0** · SHOULD_FIX 0。

| # | critic finding | 处置 |
|---|---|---|
| C-1（arch focus #1） | **不构成 BLOCKER**：不变量续持且被机检钉住（AC4b）；ADR 自有验收判据（`:252`「librarian 尝试深度 2 委派被拒」）仍成立；失真在机制措辞不在决策；本 change 越权代改 ADR 才是更大流程违规 | 采纳 ⇒ 同 O-1 的处置（登记 architect 增补记录，backlog 实体已建） |
| C-2（build focus #2） | 目标场景成立：字典与 `front` 逐字同形 ⇒ 工具可见；`explore` `mode=subagent` / `hidden=false` ⇒ 在运行时清单；消费者存在（`prompts/librarian.md:19-25`）；`subagent_depth: 2` 下 `front→librarian→explore` 恰在限内 | 采纳（无改动） |
| C-3（build focus #3） | AC4 偏差处置**不构成**「判据可被平凡满足」：原断言用 `=== "allow"` 严格相等（字典形态本就不计入）⇒ 语义零退化；AC4c 的四桶闭集**强于**原判据 | 采纳（无改动） |
| C-4（NITS-1） | ADR 措辞 follow-up **有沉底风险** ⇒ 归档前须确认该 follow-up 在 backlog 有**实体条目**承接 | **已闭合**：新建 `.rddf/improvements/adr-front-knowledge-librarian-whitelist-annotation.md`（backlog 实体） |
| C-5（NITS-2） | `proposal.md` 引「AC4（`:4367`）」行号与现文件实际位置（`tests/config-guards.test.ts:4439`）不符 | **已闭合**：proposal 的行号引用改为 `:4439`（并注明是「现位置」；行号会随文件演化漂移 ⇒ 以断言名为准） |
| C-6（验证建议） | 归档前核对 tasks 勾选但工作树未落地的两项：CHANGELOG 条目（V4）、improvement 状态行（V5） | **已闭合**：两者已在本提交内落盘（见 §4） |

## 4. 登记的剩余项（不在本 change 内）

| 项 | 归属 | 落点 |
|---|---|---|
| ADR `ADR-front-knowledge-capability` D2 `:69` / D3 `:139` 的机制措辞同步（`librarian.subagent: deny` → 默认拒绝字典） | **architect**（ADR 行） | backlog 实体：`.rddf/improvements/adr-front-knowledge-librarian-whitelist-annotation.md` |
| `prompts/librarian.md:62`「不可委派 general / oracle / metis / 其它」仍是无守卫的散文 | planner 立项 / builder 实施 | improvement「已知残留」段（已登记，本条只钉配置侧） |
| 运行时冒烟：librarian 会话内确认 `explore` 在可用 subagent 清单、`general` 不在 | **人工** | `docs/MULTI-AGENT-DESIGN.md` §8.2 P1 第 2 条末行 |
| AC4 原断言文案同步（被回滚清单整块 pin 阻挡） | 待 `rollback-manifest-find-narrowing` 落地后一次性搬运 | improvement 的 AC4 偏差登记 + 本文件 §2 O-5 |
| 新回滚清单登记（`librarian-delegate-contradiction` 机制退役路径） | 待 `rollback-manifest-find-narrowing` 先落地 | improvement「回滚」段（已登记） |

## 5. 判别力与回归证据

| 判据 | 命令 | 结果 |
|---|---|---|
| 先红后绿 | `bun test tests/config-guards.test.ts`（改配置前） | AC4b / AC4c **红**；改配置后 **绿** |
| 判别力自证 | 把 `agent.librarian.permission.subagent` 临时改回 `"deny"` | AC4b + AC4c **同时红**（已恢复配置） |
| 全量回归 | `bun test tests/` | 改动前 1133 pass / 1 skip / 1 fail ⇒ 改动后 **1135 pass / 1 skip / 1 fail**；唯一红项前后相同（`AC10④` 父篇 ADR commit 祖先判定，与本 change 不碰的两条路径有关） |
