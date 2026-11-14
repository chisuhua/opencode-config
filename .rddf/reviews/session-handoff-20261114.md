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
| 1 | ~~**Token Plan 429 额度**~~ **已解除** | e2e `CS-5` 2026-11-14 额度恢复后实跑通过；且**首版断言是空转的**（fixture 初始就失败 + 被派发 verifier 按契约不能改 `src/**`）⇒ 已加固为「初始绿 → harness 改坏 → 断言失败签名 + ac-fail/blocked 分类 + 后端未改源码」 | 已完成（e2e commit `a0ac808`）；无需再跑 |
| 2 | **产品仓写权限** | `rdd-verifier-state-consolidation`（把 4 个根下点文件收拢进 `.rddf/state/verifier/`）需改 `~/.agents/skills/rdd-workflow` | 按 `.rddf/reviews/rdd-verifier-state-consolidation-rfc.md` §4.8 的 8 步；完成后回本仓做同文件 §6 的 8 项收尾 |

## 3. 每个「唯一真源」在哪（别再手抄）

| 面 | 唯一真源 | 谁在读 |
|---|---|---|
| `role_class` 三类的**写集上限** | `lib/delegate-core.ts::classAllowRoots` / `VERIFIER_ALLOW_ROOTS` / `VERIFIER_OWNS_PATHS` | 代码 + `tests/config-guards.test.ts`（AC7/AC6） |
| 架构文档目录 | `lib/delegate-core.ts::ARCH_FALLBACK_DIRS` + `prompts/build.md` §架构文档范围（守卫从文档**动态抽取**比对） | 同上 |
| 架构内容分流（讨论/决策/实现） | `prompts/plan.md` 的「架构内容分流」小节（build.md 的「落点路由」是**被引用**的真源，只出现一次） | plan / front 按标题名引用 |
| 交回后的收尾三问 | `prompts/plan.md` 的同名小节 | `prompts/front.md` §3.3 按标题名引用 |
| HANDOFF kind 集合 | `prompts/build.md` §HANDOFF 契约的「kind 只用既有三类」句 | 守卫 AC3 **动态抽取** |
| verifier 状态路径 | `VERIFIER_OWNS_PATHS`（**6 项，全部在 `.rddf/state/verifier/` 下** —— 2026-11-14 产品侧收拢完成；
  skill 的 `owns:` 也已补齐为 6 项） | 守卫 AC6（派生视图归零）+ 消费侧退役批 v2.24 |
| 治理面归属 | `prompts/build.md` §治理面作用域表 + 「本仓特例裁定」（`docs/adr/**` = ADR 行） | 每次治理面改动 |

## 4. 下一动作的三个入口（按优先级）

1. ~~**额度恢复时**：跑 CS-5~~ —— **已完成**（2026-11-14，e2e commit `a0ac808`；并**加固**了首版空转的断言）。
2. **任何时候**：`subagent-contract-critic-enforce` 的**触发条件是 `N ≥ 150`** —— 先跑
   `bun scripts/audit-subagent-prompts.ts --agent critic --json`，数 `messageIndex===0 && !evaluation.ok`；
   `≥150` 就按 `openspec/changes/subagent-contract-critic-enforce/tasks.md` 的**块 R**（R1–R8，逐条命令）复评。
   （当前 `N = 112`；`t1 − t0 = 0 < 7 天` ⇒ 两个门都未到。）
3. ~~**拿到产品仓权限时**：做 8 步迁移~~ —— **已完成**（2026-11-14，产品侧 change `consolidate-verifier-state`；
   消费侧退役批 = 本仓 `v2.24`）。**剩余**：产品侧该 change 的 `openspec archive`（待其仓全量回归门）。
4. ~~守卫的**枚举式词表**~~ —— **2026-11-15 已做**（批次 `v2.25`）：写集判据升级为**结构比对**
   （AC19 规范块逐字比对 + AC20 路径闭集）；**残留**：两处枚举式词表（AC20 的 HIST 行级豁免闸门
   / AC14 的窄化描述判据，原型证明无可替代的结构化写法）—— 已并列登记，不再宣称「唯一」。
5. **产品仓 P2**（`verifier-owns-block-guard`）：skill 的 `owns:` 清单 ↔ 代码绑定（**同仓** CI 可验）
   + 两仓清单占位符对齐为 `<name>`（逐字可 diff）。
6. **下一个自然触发点**：`subagent-contract-critic-enforce` 复评 —— **最早 2026-11-21**
   （`t0 = 2026-11-14` + 7 天；⚠ 提前跑 R1 会把封闭窗终点钉死）。

## 5. 本轮踩过的坑（同类问题请直接对照）

| 坑 | 表现 | 教训 |
|---|---|---|
| **守卫的扫描集被自己写窄** | AC14 只扫 `prompts+docs+commands` ⇒ `.rddf/**` 里 3 处陈旧陈述漏网（其中 1 处措辞是「只有」，词表里没有） | 判据的**范围**和判据的**内容**一样要审；枚举式词表是开集假设 |
| **「基线对照」对执行类取证不可执行** | 不物化工作树就跑不了基线版本 ⇒ `ac-fail` 臂事实不可达 ⇒ 真 bug 被路由成交回 | 分类器要建在**可观测信号**（断言失败 vs runner 缺失）上，不是建在「重跑一遍」上 |
| **写集 ≠ 授权** | `classAllowRoots` 只是 scope 上限，edit 权限只由 `scopeEditRules` 派生 ⇒ 单独断言 allow 是恒真式 | 断言要写**组合路径**（派发被接受 + allow + 越界仍 deny） |
| **声称闭合实则未落盘** | 一个批量 patch 脚本中途 assert 失败 ⇒ 前面几条修改没写进文件，但记录里写了「已闭合」 | 改完必须**回读文件**验证（critic 用 grep 抓到） |
| **治理文件里预断言未发生的事** | CHANGELOG 写死了还没跑的审查结论与「已归档」 | 结论**只能在记录落盘后**写；守卫用 `existsSync` 做机械判据 |
| **两处 `_cache_path`** | 产品侧同一路径两个定义点 ⇒ 迁移只改一处 ⇒ 归档门静默失效 | 迁移前先**收敛定义点**；且注意 root 来源不同（worktree）不可合并 |
| **e2e 断言拿模型措辞当证据** | CS-5 首版：断言①「测试失败」空转（fixture 初始就失败）+ 前提不可达（verifier 按契约不能改 `src/**`）；
  CS-6 首版：`! grep "Permission denied"` 命中模型**自述**「没有出现 Permission denied」⇒ 假阳性 | e2e 断言只认**文件系统事实**与**结构化字段**（工具 `state.error` / ledger `blocked_reason`），**不断言模型措辞** |
| **改了常量，漏改面向模型的派生面** | delegate 工具 schema 的 `role_class` 描述手抄「edit 上限=.rddf/reviews」—— front 据此可能把记账落点排除出 scope | 面向模型的文本必须**由常量派生**（`verifierAllowRootLabels()`），并加守卫钉住 |
| **治理工具自身的范围 bug** | `scripts/build_critic_prompt.sh --staged` 只影响 stat、diff 正文仍取未暂存 ⇒ 审稿人可能读到另一批改动 | diff 正文与 stat 必须**同范围**；组合参数直接**互斥拒斥** |
| **治理文档引用判据 ⇒ 命中判据自己** | CHANGELOG 逐字引了 AC14 的正则与 AC11 的路径形态 ⇒ 两条守卫当场把自己判红 | 结构性修：`docs/CHANGELOG.md`（自述「不描述现状」）从扫描集排除；并暴露扫描器 bug：`excluded` 原先**只判目录** ⇒ 单文件排除失效 |
| **管道掩盖退出码 ⇒ 带着失败提交** | `bun test … | tail -4 && git commit` ⇒ `&&` 看的是 `tail` 的退出码 | 提交前**单独**校验测试退出码；不用管道串起「测试 ⇒ 提交」 |
| **判据分支是死代码（声称的面没生效）** | AC20 的「新形态闭集」分支因 TOKEN 正则不产出对应 token ⇒ 不可达；**变红演练只测了旧路径那支** | 每个判据分支都要有**对应**的变红演练；「分支存在」≠「分支生效」 |

## 6. 验证基线（下次改动前的对照）

```
cd ~/.config/opencode        && bun test tests/            # 535 pass / 0 fail（8 files）
cd ~/.config/opencode        && bash scripts/check-upstream-anchors.sh   # 23/23
cd /workspace/main/rdd-workflow-e2e && bats -r tests/       # 默认态全 skip（runtime 用例不进 CI）
cd /workspace/main/rdd-workflow && python3 -m pytest tests/unit tests/integration -q   # 3492 passed / 2 skipped
cd /workspace/main/rdd-workflow && bats tests/integration/test_rdd_verifier_*.bats …   # 43 ok（verifier/archive-gate）
```
