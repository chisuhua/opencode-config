# 会话交接（2026-11-14）

> 目的：让下一个会话（或下一个人）**10 分钟内**知道「现在在哪、什么被卡住、下一步从哪进」。
> 不要复述历史 —— 每一步的判据与证据都在各自文件里，这里只给**指针**。

## 1. 现在在哪（5 个 ADR / change 的终态）

| 工件 | 状态 | 判据真源 | 验收/审稿记录 |
|---|---|---|---|
| `ADR-backend-handoff-role-class` | **Accepted**（D3 verifier 行已按子篇修订） | `docs/adr/ADR-backend-handoff-role-class.md` | `.rddf/reviews/adr-backend-handoff-role-class-review.md` |
| `role-class-rubric-alignment` | **已归档** `2026-11-14-…` | 归档 proposal 的 AC1–AC11 | `.rddf/reviews/role-class-rubric-alignment-verify.md` |
| `class-write-scope-alignment` | **已归档** `2026-11-14-…` | 归档 proposal 的 AC1–AC19 | `.rddf/reviews/class-write-scope-alignment-{verify,prompt-review}.md` |
| `adr-d5-async-completion-wording` | **已归档** `2026-11-14-…` | 归档 proposal 的 AC1–AC14 | `.rddf/reviews/adr-d5-async-completion-wording-{verify,prompt-review}.md` |
| `delegated-verifier-evidence-gap` | **已归档** `2026-11-14-…` | 归档 proposal 的 AC1–AC9 | `.rddf/reviews/delegated-verifier-evidence-gap-{verify,prompt-review}.md` |
| `subagent-contract-critic-enforce` | **OPEN**（3/3 artifacts，9/22 tasks） | `openspec/changes/subagent-contract-critic-enforce/proposal.md` | `.rddf/reviews/subagent-contract-critic-enforce-observation.md`（数据+结论） |

`openspec list` 现在**只有** `subagent-contract-critic-enforce`。

## 2. 两个外部依赖卡住的东西（不是代码问题）

| # | 卡点 | 表现 | 恢复后怎么跑 |
|---|---|---|---|
| 1 | **Token Plan 429 额度** | e2e `CS-5`（失败签名分类：修改文件上的测试失败 ⇒ `ac-fail` 而非 `blocked`）**两次尝试均 429**（10 次 retry、0 条文本、fixture 未被改） | `cd /workspace/main/rdd-workflow-e2e && E2E_REAL_RUNTIME=1 TMPDIR="$PWD/.tmp-l2" bats --filter CS-5 tests/integration/test_class_scope_runtime.bats`；通过后把该文件头的「未验证」注记删掉 |
| 2 | **产品仓写权限** | `rdd-verifier-state-consolidation`（把 4 个根下点文件收拢进 `.rddf/state/verifier/`）需改 `~/.agents/skills/rdd-workflow` | 按 `.rddf/reviews/rdd-verifier-state-consolidation-rfc.md` §4.8 的 8 步；完成后回本仓做同文件 §6 的 8 项收尾 |

## 3. 每个「唯一真源」在哪（别再手抄）

| 面 | 唯一真源 | 谁在读 |
|---|---|---|
| `role_class` 三类的**写集上限** | `lib/delegate-core.ts::classAllowRoots` / `VERIFIER_ALLOW_ROOTS` / `VERIFIER_OWNS_PATHS` | 代码 + `tests/config-guards.test.ts`（AC7/AC6） |
| 架构文档目录 | `lib/delegate-core.ts::ARCH_FALLBACK_DIRS` + `prompts/build.md` §架构文档范围（守卫从文档**动态抽取**比对） | 同上 |
| 架构内容分流（讨论/决策/实现） | `prompts/plan.md` 的「架构内容分流」小节（build.md 的「落点路由」是**被引用**的真源，只出现一次） | plan / front 按标题名引用 |
| 交回后的收尾三问 | `prompts/plan.md` 的同名小节 | `prompts/front.md` §3.3 按标题名引用 |
| HANDOFF kind 集合 | `prompts/build.md` §HANDOFF 契约的「kind 只用既有三类」句 | 守卫 AC3 **动态抽取** |
| verifier 状态路径 | `VERIFIER_OWNS_PATHS`（6 项 = owns 声明 4 + 实际写入未声明 2） | 守卫 + 状态收拢 RFC |
| 治理面归属 | `prompts/build.md` §治理面作用域表 + 「本仓特例裁定」（`docs/adr/**` = ADR 行） | 每次治理面改动 |

## 4. 下一动作的三个入口（按优先级）

1. **额度恢复时**：跑 CS-5（见 §2 #1，5 分钟）。
2. **任何时候**：`subagent-contract-critic-enforce` 的**触发条件是 `N ≥ 150`** —— 先跑
   `bun scripts/audit-subagent-prompts.ts --agent critic --json`，数 `messageIndex===0 && !evaluation.ok`；
   `≥150` 就按 `openspec/changes/subagent-contract-critic-enforce/tasks.md` 的**块 R**（R1–R8，逐条命令）复评。
3. **拿到产品仓权限时**：按 `.rddf/reviews/rdd-verifier-state-consolidation-rfc.md` §4.8 做 8 步迁移
   （**§4.0 必须最先做**：两处 `_cache_path` 先合成一个路径定义点，否则归档门会静默失效）。

## 5. 本轮踩过的坑（同类问题请直接对照）

| 坑 | 表现 | 教训 |
|---|---|---|
| **守卫的扫描集被自己写窄** | AC14 只扫 `prompts+docs+commands` ⇒ `.rddf/**` 里 3 处陈旧陈述漏网（其中 1 处措辞是「只有」，词表里没有） | 判据的**范围**和判据的**内容**一样要审；枚举式词表是开集假设 |
| **「基线对照」对执行类取证不可执行** | 不物化工作树就跑不了基线版本 ⇒ `ac-fail` 臂事实不可达 ⇒ 真 bug 被路由成交回 | 分类器要建在**可观测信号**（断言失败 vs runner 缺失）上，不是建在「重跑一遍」上 |
| **写集 ≠ 授权** | `classAllowRoots` 只是 scope 上限，edit 权限只由 `scopeEditRules` 派生 ⇒ 单独断言 allow 是恒真式 | 断言要写**组合路径**（派发被接受 + allow + 越界仍 deny） |
| **声称闭合实则未落盘** | 一个批量 patch 脚本中途 assert 失败 ⇒ 前面几条修改没写进文件，但记录里写了「已闭合」 | 改完必须**回读文件**验证（critic 用 grep 抓到） |
| **治理文件里预断言未发生的事** | CHANGELOG 写死了还没跑的审查结论与「已归档」 | 结论**只能在记录落盘后**写；守卫用 `existsSync` 做机械判据 |
| **两处 `_cache_path`** | 产品侧同一路径两个定义点 ⇒ 迁移只改一处 ⇒ 归档门静默失效 | 迁移前先**收敛定义点**；且注意 root 来源不同（worktree）不可合并 |

## 6. 验证基线（下次改动前的对照）

```
cd ~/.config/opencode        && bun test tests/            # 532 pass / 0 fail（8 files）
cd ~/.config/opencode        && bash scripts/check-upstream-anchors.sh   # 23/23
cd /workspace/main/rdd-workflow-e2e && bats -r tests/       # 88 ok（默认态，runtime 用例全 skip）
```
