# ac10-four-decision-anchor — 治理面审查记录（oracle → critic）

> **对象**：`openspec/changes/ac10-four-decision-anchor/`（守卫判据精化 + 机制面连带面）
> **档位**：oracle `审查域: 治理面`（词表 = `治理面判定:`）→ critic `review_profile: build, arch`
> **预算**：oracle 1 轮 + critic 1 轮（**0 BLOCKER** ⇒ 无需复审；复审额度未动用）
> **结论**：oracle `PASS-WITH-NOTES` → critic `APPROVE_WITH_CONDITIONS`（`mergeable: yes` · `scope_exceeded: false` · **0 BLOCKER** · 3 SHOULD_FIX **已当场处置**）

---

## 1. 审查对象与范围

| 项 | 内容 |
|---|---|
| 改动文件 | `tests/helpers/real-repo-git.ts`（可选第三参）· `tests/config-guards.test.ts`（AC10④ 判据 + 精度断言 + fixture 四态 + 命令形态增钉）· `.rddf/rollback/role-class-write-set.json`（**机制面**：三处 `find` + 撤 `last_drill`）· `.rddf/rollback/registry.json`（两条目退 `proving`）· `docs/test-authoring.md` §9 · `docs/CHANGELOG.md` v2.69 · 新建 `openspec/changes/ac10-four-decision-anchor/{proposal,tasks}.md` |
| 意图 | AC10④ 按**文件级**定位父篇 ⇒ 一次纯文档提交（`0f09b9c`）就让父篇「最后提交」比代码新 ⇒ 判红 ⇒ `bun test tests/` 退出非 0 ⇒ 工具层验证门 fail-closed ⇒ **本仓此后任何提交都被拒**（实测：`librarian-delegate-contradiction` 被拒）。本条把父篇侧定位收窄到**决策锚点**（D3 写集 roots 声明段的最后一次内容变更提交）⇒ 误报消除、判别力保留 |
| 不在范围 | `prompts/**` · 任何 `docs/adr/**` · `lib/**` · `plugins/**` · AC10①–③（内容判据）· 归档 spec · 其余清单的宽 `find`（backlog `rollback-manifest-find-narrowing`） |

## 2. oracle 结论与逐条处置

**判定行**：`治理面判定： PASS-WITH-NOTES`（oracle 用全角冒号输出；词表 = 治理面词表，无「审查域=未声明」标注 ⇒ 治理面审查成立）。
**证据边界声明**：oracle 的 shell 权限中途被拒 ⇒ 两条 `git log` 复测未由其独立完成，采信本 change 的实测记录（tasks T0d）。

| # | oracle finding | 处置 | 证据 |
|---|---|---|---|
| O-1（**实质**） | **漏检面**：`-S` 的触发条件是「该字面量**出现次数**变化」，不是「决策语义变化」⇒ 若父篇 D3 行的 verifier 单元格被改、但 `.rddf/state/verifier/**` 子串计数不变（如改**另一个根**）⇒ `-S` 不触发 ⇒ 顺序判据可能假绿 | **当场采纳并已实现**：锚点由「单个根」加宽为**roots 声明段**（`` `.rddf/reviews/**` + `.rddf/state/verifier/**` ``）⇒ 任一根增删/改名/顺序对调 ⇒ 锚点计数变化 ⇒ **必触发**；而单元格里的括注/交叉引用**不在**锚点内 ⇒ 改指针仍不触发 | `tests/config-guards.test.ts` 的 `DECISION_ANCHOR`；proposal 的 What Changes 抬头注 + 后果/代价表 |
| O-2 | 零 git 断言钉住「定位精度」，钉不住「触发完备性」；两者共享同一条静默路径（同盲） | **随 O-1 收窄**：改锚点字面量即同时收窄该盲区；残余面（D3 行内锚点之外的注记面）已显式登记，并说明由内容守卫兜底 | proposal Out of Scope §6 + 守卫用例注释 |
| O-3 | 机制面处置与 ADR 口径逐字一致（`ADR-rollback-manifest-enforcement.md:114` 明确登记 `active → proving` 的迁移边；V8 排除 `last_drill` 本身 ⇒ 撤除是使 `proving` 合法的最小操作；`proving` 的证据可缺失但「存在即须新鲜」）；无更省的等效路径 | 采纳（无改动） | manifest 撤 `last_drill` + registry 两条目 `proving` + notes |
| O-4（低 ①） | AC10④ 用例的注释仍写「2× `git log -1 --format=%H`」（实际是 1× 普通 + 1× `-S`） | **当场修**（oracle 说「改它要再付一次清单同批更新」—— 但本次**已在**付该成本 ⇒ 顺带修零成本） | 守卫用例注释 + manifest `find` 随本次重生成 |
| O-5（低 ②） | tasks 的 D2/D3（CHANGELOG + review/verify 记录）已勾但未落盘 | **当场闭合**：CHANGELOG v2.69 已写入；本记录 + `.rddf/reviews/ac10-four-decision-anchor-verify.md` 即 D3 产物 | 本文件；`.rddf/reviews/ac10-four-decision-anchor-verify.md` |
| O-6（低 ③） | 工作树混着第二个 change（`librarian-delegate-contradiction`）的载荷 ⇒ 提交顺序需明确 | **采纳**：提交顺序 = ① ac10（门恢复）② ac10 的 `last_drill` 回填（两段式第二段）③ librarian change | 本文件 §4 |

## 3. critic 结论与逐条处置

**结论**：`profile: mixed`（build / plan / arch）· `# 审查结论：APPROVE_WITH_CONDITIONS` · `mergeable: yes` · `scope_exceeded: false` · **BLOCKERS 0** · SHOULD_FIX 3 · NITS 3。

| # | critic finding | 处置 |
|---|---|---|
| C-1（arch 1） | 归档 AC10④ 的**父篇侧**命令形态（文件级 `git log -1 --format=%H -- <父篇>`）与本改动**字面冲突**，但**修订流程成立**（差异在 Out of Scope 2 显式登记 + 已走 oracle → critic）⇒ **不构成 BLOCKER 1**；且收窄后的实现**更忠实**于原意（C.5 针对父篇 D3 决策行） | 采纳（无改动） |
| C-2（arch 2） | 机制面处置与 ADR 逐字一致；「同批更新被 pin 的 `find`」**不是绕过判据**（清单仍逐字节 pin 新源码，回滚语义不变；不更新反而把清单退化成「禁止改判据」的锁）；方向相反的做法（为绿而弱判据）在本条中不存在 | 采纳（无改动） |
| C-3（**SHOULD_FIX 1**） | 本仓登记残余面的**示例与 `-S` 机制相反**：「两段 roots 顺序对调 ⇒ 计数 1→1 ⇒ 不触发」不成立（对调后锚点子串不再出现 ⇒ 计数 1→0 ⇒ **必触发**）；真实残余面更窄 = 「D3 行内**锚点之外**的语义编辑」，且该面**不完全**被 AC10① 的 pinned 字符串覆盖 | **当场修**：残余面登记改写为与机制一致的描述（roots 声明本身**任何**编辑必触发；残余只在锚点之外的注记面），并把「锚点之外的注记面不完全被 AC10① 覆盖」这一事实一并写明；守卫用例注释同步 |
| C-4（**SHOULD_FIX 2**） | 命令形态 pin 的语义注释需补一句：父篇侧的归档形态**已由本 change 取代**，pin 保留仅防 helper 形态漂移 | **当场修**：守卫用例注释补该句（critic 的理由：否则未来读者会误以为归档 AC10④ 仍照原字母执行） |
| C-5（**SHOULD_FIX 3**） | proposal 缺独立「后果 / 代价」段（代价散落） | **当场修**：proposal 新增「后果 / 代价」表（提交门恢复 / 判据强度 / 机制面成本 / pin 面 / 归档契约 五行） |
| C-6（NIT 1） | proposal 头部把 `tests/real-repo-git-budget.test.ts` 列入触碰面，但实际零改动 ⇒ 措辞改为「核对零改动」 | **当场修** |
| C-7（NIT 2） | tasks D3 已勾但 review/verify 文件未落盘（时序表面矛盾） | **当场闭合**（见 O-5） |
| C-8（NIT 3） | 零 git 断言与 `-S` 同盲 ⇒ 维持 NIT | 随 O-1 收窄（见 O-2） |

## 4. 提交顺序与两段式收口

1. **提交 ①**：`ac10-four-decision-anchor` 的全部载荷（守卫精化 + 机制面清单更新 + 撤 `last_drill` + registry 退 `proving` + 文档）⇒ 门恢复可用（`bun test tests/` 退出 0）。
2. **提交 ②**：`bun scripts/rollback-drill.ts .rddf/rollback/role-class-write-set.json`（隔离副本演练）⇒ PASS ⇒ 回填 `last_drill` + registry 两条目转回 `active`。
3. **提交 ③**：`librarian-delegate-contradiction` 的载荷（它有独立的审查链：oracle PASS-WITH-NOTES → critic APPROVE / 0 BLOCKER）。

## 5. 判别力与回归证据

| 判据 | 命令 | 结果 |
|---|---|---|
| 误报消除 | fixture 态④（锚点改动后另有纯元数据提交） | ✅ 绿；且断言「文件级定位会被带偏」⇒ 两种语义的差异被钉死 |
| 判别力保留 | fixture 态②（代码先改、锚点后改） | ✅ 显式断言 `isAncestor(...) === false`（必红） |
| 真实仓转绿 | `git log -1 -S'<roots 段>' --format=%H -- docs/adr/ADR-backend-handoff-role-class.md` ⇒ `8131d0c`；`git log -1 --format=%H -- lib/delegate-core.ts` ⇒ `4b31d19` | ✅ `8131d0c` 是 `4b31d19` 的祖先 ⇒ 精化后绿（critic 未独立复测，采信本 change 的实测记录 —— 见 §2 证据边界声明） |
| 全量回归 | `bun test tests/` | 改动前 1133 / 1 / **1 fail** ⇒ 改动后 **1137 / 1 / 0 fail** |
| 记录纪律 | `bash tests/verify_record_discipline.sh` | ✅ OK（7 条判据全通过） |
| 清单可执行性 | `bun test tests/rollback-manifests.test.ts` | ✅ 绿（三处 `find` 各命中 1 次） |
