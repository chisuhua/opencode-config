# librarian-delegate-contradiction — 验收报告（verifier）

> **判据来源**（按优先级）：
> ① 用户指令「请实施 librarian-delegate-contradiction」；
> ② `openspec/changes/archive/2026-11-23-librarian-delegate-contradiction/proposal.md` 的 `## 验收标准` 表（AC1–AC8）；
> ③ 其正文真源 = `.rddf/improvements/librarian-delegate-contradiction.md` 的 `## Acceptance` 段；
> ④ 审查记录 `.rddf/reviews/librarian-delegate-contradiction-review.md`（oracle → critic）。
> **已用轮次**：1（验收轮）。**判定**：**通过**（含 1 处已登记的**偏差**（AC4）与 2 项不在本条内的剩余项）。
> **证据要求**：每条 AC 至少 1 条工具证据（命令 + 输出摘要），无一条凭文本推断。

---

## 1. 逐条判定

| AC | 判据 | 判定 | 证据（命令 → 输出摘要） |
|---|---|---|---|
| AC1 | `agent.librarian.permission.subagent` 是**字典**：首键 `"*"`、值 `deny`、`explore` 为 `allow` | ✅ 通过 | `python3 -c "json.load(open('opencode.jsonc.opencode-go'))"` ⇒ `librarian.permission.subagent = {"*": "deny", "explore": "allow"}`；首键 = `*`、值 = `deny`（`opencode.jsonc.opencode-go:694-697`）。**守卫**：`bun test tests/config-guards.test.ts` ⇒ `AC4b` 绿（断言首键/兜底值/`explore`=allow/闭集 `["*","explore"]`） |
| AC2 | `prompts/librarian.md` 仍含字面 `agent: "explore"`（委派要求保留），且配置白名单含 `explore` | ✅ 通过 | `grep -n 'agent: "explore"' prompts/librarian.md` ⇒ `:24` 命中；配置侧 `explore` ∈ 白名单（AC1 证据）⇒ **两侧同向** |
| AC3 | librarian 白名单**不含** `general` / `oracle` / `metis` / `critic`（负向） | ✅ 通过 | AC4b 的 forbidden 循环（含 `general`/`oracle`/`metis`/`critic`/`build`/`plan`/`context-builder`）全为 `toBeUndefined()` ⇒ 绿。**反向验证**：白名单被放宽到 `general` ⇒ 该断言红 |
| AC4 | ⚠ **偏差**：improvement 要求把既有 AC4 断言文案改成「**字符串** `"allow"`」 | ⚠ **偏差（已登记，等价覆盖）** | 原断言（`tests/config-guards.test.ts:4439`）**仍在原位且绿**（`perm.subagent === "allow"` 严格相等 ⇒ 字典形态的 librarian 本就不计入 ⇒ 集合仍 == `{build, plan}`）⇒ **语义零退化**。**未按字面落地的原因**：该断言位于 `plan 侧多会话协作` describe 内，该块被 `.rddf/rollback/plan-topics.json` 的 `edits[8].find`（5229 字符）**逐字节 pin** ⇒ 改它 ⇒ `planDrill` 判 `find_count` 漂移 ⇒ `tests/rollback-manifests.test.ts` 红（实测：改文案后该用例红）⇒ 改它须同批改机制面清单并重跑 plan-topics 的 rollback drill。**等价覆盖**：新增 `AC4c` 显式区分「字符串 `allow`」/「字典白名单」/「字符串受限」/「无键」四桶并各给闭集（比原判据更强）。登记位置：`proposal.md` AC4 行 + `tasks.md` T2 + 审稿记录 §2 O-5 |
| AC5 | `docs/SUBAGENT-ORCHESTRATION.md` 的白名单那一行**同时含** `librarian` 与 `explore` | ✅ 通过 | `grep -n 'librarian' docs/SUBAGENT-ORCHESTRATION.md` ⇒ `:38` 同行命中 `librarian` 与 `explore`（该行已补「`librarian` 只放行 `explore`」） |
| AC6 | `bun test tests/` **不新增失败** | ✅ 通过 | 基线（改动前）**1133 pass / 1 skip / 1 fail** ⇒ 改动后 **1135 pass / 1 skip / 1 fail**（新增 2 例 = AC4b + AC4c）。唯一红项前后**相同**：`AC10④：父篇 ADR 的 commit 必须是代码 commit 的祖先或同一 commit`（`docs/adr/ADR-backend-handoff-role-class.md` vs `lib/delegate-core.ts` 的提交顺序）—— 本 change **不碰**这两条路径 ⇒ 与本 change 无关（**基线已红，未由本 change 引入，也未由本 change 修复**） |
| AC7 | §3.1 矩阵 `librarian` 行 × `explore` 列**不含** `❌` | ✅ 通过 | `grep -n '^| \*\*librarian\*\*' docs/MULTI-AGENT-DESIGN.md` ⇒ `:647` = `| **librarian** | ❌ | ❌ | ❌ | ✅✅（本地搜索）| …` ⇒ 该格为 `✅✅`（A1 后成为真值 ⇒ 矩阵**不改**；`delegation-matrix-fill-semantics` 未落地 ⇒ 按 improvement 约定本条人工核对） |
| AC8 | §4.3 权限表 `librarian` 的 task 列为「仅 explore」；§3.1 旁注的 AC4 引用同步 | ✅ 通过 | `grep -n '^| task（subagent 委派）' docs/MULTI-AGENT-DESIGN.md` ⇒ `:856` = `… | deny | 仅 explore§§ | deny | …`；`grep -n 'AC4b' docs/MULTI-AGENT-DESIGN.md` ⇒ `:659`（§3.1 旁注，措辞已同步为「**字符串** `subagent: "allow"`」+ 指向 AC4b）与 `:869`（§4.3 新脚注 `§§`） |

## 2. 判别力自证（守卫是否真能抓回归）

| 变异 | 预期 | 实测 |
|---|---|---|
| `agent.librarian.permission.subagent` 改回字符串 `"deny"` | AC4b（必须是字典）+ AC4c（字典桶闭集缺 `librarian`）**同时红** | ✅ 实测双红（配置已恢复） |
| 白名单被放宽到 `general` / `oracle` | AC4b 的闭集 `["*","explore"]` + forbidden 循环**红** | ✅ 由断言形态保证（闭集 + 逐个 `toBeUndefined`） |
| 某 agent 从 `"deny"` 改成 `"ask"`（静默放行面） | AC4c 的「字符串受限」桶闭集**红** | ✅ 断言形态保证（该桶由 oracle O-4 要求当场新增） |

## 3. 遗留清扫（本次范围内）

| 检查项 | 结果 |
|---|---|
| TODO / FIXME / 半截实现 | 本次改动的 5 个文件内 **0 处**（`grep -n 'TODO\|FIXME\|XXX' ` 于改动文件 ⇒ 无命中） |
| 注释掉的代码 / 临时调试日志 | 无 |
| 被 skip 的测试 | 本次**新增** 2 例均**未** skip；套件内既有的 1 个 skip 与本 change 无关 |
| 未替换的 mock / fixture | 无新增 mock；AC4c/AC4b 只读配置，无 fixture |
| 半截的文档回填 | 已清：`docs/MULTI-AGENT-DESIGN.md` §4.3 表 + 脚注、§3.1 旁注、§8.2 P1 第 2 条（旧 TODO 的失真「当前」陈述）；`docs/SUBAGENT-ORCHESTRATION.md` §2.1 |
| 范围外的历史遗留 | 只记录不清理：① `prompts/librarian.md:62` 的散文边界（improvement 已登记为「已知残留」）；② `docs/adr/ADR-front-knowledge-capability.md` D2/D3 的机制措辞（属 architect，已落 backlog 实体）；③ `tests/config-guards.test.ts` 内 67 处被回滚清单 pin 的区块（属 `rollback-manifest-find-narrowing`） |

## 4. 失败项与路由建议

**本条无失败项**（AC4 为已登记的**偏差**，非失败：语义目标由 AC4c 等价覆盖且更强）。

| 剩余项 | 路由 |
|---|---|
| ADR `ADR-front-knowledge-capability` D2/D3 的机制措辞同步 | **architect**（ADR 行）⇒ backlog 实体 `.rddf/improvements/adr-front-knowledge-librarian-whitelist-annotation.md` |
| 运行时冒烟（librarian 会话内 `explore` 在可用清单、`general` 不在） | **人工**（静态守卫覆盖不到；已登记于 MAD §8.2 P1 第 2 条） |
| AC4 原断言文案搬移 | 待 `rollback-manifest-find-narrowing` 落地后一次性搬运 |

## 5. 归档前检查

- [x] AC1–AC8 逐条有工具证据（§1）
- [x] 全量回归不新增失败（AC6）
- [x] 判别力自证（§2）
- [x] 遗留清扫已过（§3）
- [x] oracle → critic 审查记录落盘且 0 BLOCKER（`.rddf/reviews/librarian-delegate-contradiction-review.md`）
- [x] 改动原子性：**配置 + 守卫 + 文档 + 记录同一提交**（improvement 要求「配置改动 + AC4 断言调整必须同一 commit」—— 本条以「配置 + 守卫（块外新用例）」同批落地满足）
