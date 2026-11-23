# ac10-four-decision-anchor — 验收报告（verifier）

> **判据来源**：① 用户裁决（2026-11-23「先修判据，再提交本 change」）；② `openspec/changes/archive/2026-11-23-ac10-four-decision-anchor/proposal.md` 的 `## 验收标准` 表（AC1–AC8）；③ 审查记录 `.rddf/reviews/ac10-four-decision-anchor-review.md`（oracle → critic）。
> **已用轮次**：1。**判定**：**通过**（0 BLOCKER；3 条 SHOULD_FIX 已当场处置并复验）。
> **证据要求**：每条 AC 至少 1 条工具证据。

---

## 1. 逐条判定

| AC | 判据 | 判定 | 证据（命令 → 输出摘要） |
|---|---|---|---|
| AC1 | 父篇一侧用**内容锚点**（`-S`）定位「决策行最后一次变更提交」；代码一侧仍用文件级 `git log -1 --format=%H`；二者经 `git merge-base --is-ancestor` 判祖先 | ✅ 通过 | `tests/config-guards.test.ts` AC10④：`lastCommitShaInRepo(ADR_PARENT_REL, DECISION_ANCHOR)` + `lastCommitShaInRepo("lib/delegate-core.ts")` + `isAncestorInRepo(...)`；helper 的两条命令形态在源码里**逐字并存**（三元表达式），「命令形态不得漂移」用例三条断言全绿 |
| AC2 | 锚点（roots 声明段）在父篇 ADR 中**恰好 1 次**且位于 D3 写集行 | ✅ 通过 | 新增零 git 断言：父篇中 `DECISION_ANCHOR` 命中 **1** 次且该行以 `| \`verifier\` |` 开头 ⇒ 绿。**判别力自证**：把锚点字面量改掉 ⇒ 该断言红（`-S` 定位失准时响亮地红，非静默） |
| AC3 | **判别力不丢**：代码先改、锚点后改 ⇒ 仍**红** | ✅ 通过 | fixture 态②：`expect(isAncestor(repo, decisionSha, codeSha)).toBe(false)` ⇒ 绿（断言「必红」成立） |
| AC4 | **误报消除**：锚点改动之后再有纯元数据提交 ⇒ **绿** | ✅ 通过 | fixture 态④：`decisionAfter === decisionBefore`（锚点定位提交不变）且 `isAncestor(...) === true` ⇒ 绿；同时断言「文件级定位会被这次元数据提交带偏」⇒ 两种语义的差异被钉死 |
| AC5 | helper 新形态经唯一入口；预算登记零改动 | ✅ 通过 | `tests/real-repo-git-budget.test.ts` **零改动**（helper 计数仍 2、`budget` 仍 3、用例标题逐字保留 ⇒ 其被 pin 的片段零漂移）；`bun test tests/real-repo-git-budget.test.ts` ⇒ 绿 |
| AC6 | `bun test tests/` **全绿**（含本条自身；AC10④ 转绿 ⇒ 提交门恢复） | ✅ 通过 | 改动前 **1133 pass / 1 skip / 1 fail** ⇒ 改动后 **1137 pass / 1 skip / 0 fail**；`bash scripts/commit-gate-doctor.ts` ⇒ `PASS: commit-gate 插件在场且 active`；`bash tests/verify_record_discipline.sh` ⇒ `RESULT: OK` |
| AC7 | 归档 spec 的**两条原命令形态逐字保留**；新形态另钉 | ✅ 通过 | 「命令形态不得漂移」用例：`expect(src).toContain('["log", "-1", "--format=%H", "--", file]')` + `expect(src).toContain('["merge-base", "--is-ancestor", a, b]')` + 新形态 `["log", "-1", "-S", literal, "--format=%H", "--", file]` ⇒ 三条全绿 |
| AC8 | **机制面连带面**：组清单三处 `find` 与实现一致；撤 `last_drill` 后 registry 退 `proving`；演练 PASS 后回填 | ⚠ **分段收口** | ① `bun test tests/rollback-manifests.test.ts` ⇒ 绿（`edits[113]/[114]/[115]` 的 `find_count` == 1）；② `bun test tests/rollback-registry.test.ts` ⇒ 绿（`proving` 态 `last_drill` 可缺失）；③ **演练与回填在第二段**（`bun scripts/rollback-drill.ts .rddf/rollback/role-class-write-set.json` ⇒ PASS ⇒ 回填 `last_drill` + 两条目转 `active`）—— 见 §4 |

## 2. 判别力自证

| 变异 | 预期 | 实测 |
|---|---|---|
| fixture 态②（代码先改、锚点后改） | 判据**红** | ✅ 断言显式钉住（`toBe(false)`） |
| fixture 态④（锚点改动后另有纯元数据提交） | 判据**绿**且锚点定位提交不变 | ✅ 绿（并同时断言文件级定位会漂 ⇒ 差异被记录） |
| 锚点字面量在父篇里出现两次 / 被搬走 | 精度断言**红** | ✅ 断言形态（计数 == 1 + 行首前缀） |
| 真实仓：父篇锚点提交 `8131d0c` vs 代码提交 `4b31d19` | 祖先成立 ⇒ 绿 | ✅ `git merge-base --is-ancestor` 成立（critic 未独立复测，采信本 change 实测记录） |

## 3. 遗留清扫（本次范围内）

| 检查项 | 结果 |
|---|---|
| TODO / FIXME / 半截实现 | 本次改动的文件内 **0 处** |
| 注释掉的代码 / 临时调试日志 | 无 |
| 被 skip 的测试 | 本次**未**新增 skip；套件内既有 1 个 skip 与本条无关 |
| 未替换的 mock / fixture | 无新增 mock；fixture 为临时仓（`mkdtempSync`）⇒ 成本可忽略（`docs/test-authoring.md` §9 的 fixture 豁免） |
| 文档投影回填 | `docs/test-authoring.md` §9 规则 1（唯一入口 + 可选字面量形态 + 「属改判据 ⇒ 须走 oracle → critic」）· `docs/CHANGELOG.md` v2.69 · proposal 的「后果 / 代价」段（critic SF-3） |
| 范围外的历史遗留 | 只记录不清理：① `.rddf/rollback/**` 其余清单的宽 `find`（backlog `rollback-manifest-find-narrowing`）② `prompts/**` 的散文类守卫缺口（backlog） |

## 4. 失败项与路由建议

**本条无失败项**。剩余项：

| 剩余项 | 路由 |
|---|---|
| **两段式第二段**：演练 PASS ⇒ 回填 `last_drill` + registry 转 `active` | 本条**下一提交**（不可省：清单内容实质改动 ⇒ `active` 态的 V8 内容比对会红） |
| 归档 AC10④ 的**父篇侧**命令形态已不再被执行 | 归档件不可变 ⇒ 差异已登记（proposal Out of Scope 2 + 本报告）；helper 侧两条原形态**逐字保留** |
| 残余面：D3 行内**锚点之外**的注记面编辑不触发 `-S` | 已登记（proposal Out of Scope 6 + 守卫用例注释）⇒ 由内容守卫 `AC10①–③` 兜底 |
| `librarian-delegate-contradiction` 的提交 | 门恢复后按顺序提交（本条提交 ③） |

## 5. 归档前检查

- [x] AC1–AC8 逐条有工具证据（§1）
- [x] 全量套件全绿（AC6）
- [x] 判别力自证（§2）
- [x] 遗留清扫已过（§3）
- [x] oracle → critic 审查记录落盘（`.rddf/reviews/ac10-four-decision-anchor-review.md`），0 BLOCKER，3 SHOULD_FIX 已当场处置并复验
- [x] critic 的 3 条 SHOULD_FIX（残余面描述失真 / 命令形态 pin 的语义注释 / 缺「后果·代价」段）+ 1 条 NIT（触碰面措辞）**已当场修**并复跑全量（1137 / 1 / 0 fail）
- [ ] **两段式第二段未完成**（演练 + 回填 `last_drill` + 转 `active`）⇒ 归档前必须闭合
