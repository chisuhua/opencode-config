# 审稿记录 — 遗留项收尾批次（v2.26）

> 批次：`v2.26`（`docs/CHANGELOG.md` v2.26 条目）—— 承接 v2.25 登记的 4 条遗留
> 范围：`lib/delegate-core.ts`（`planRefRootsBlock()`）、`prompts/plan.md`、
> `docs/MULTI-AGENT-DESIGN.md`、`docs/SUBAGENT-ORCHESTRATION.md`、`tests/config-guards.test.ts`、
> `.rddf/reviews/session-handoff-20261114.md`
> 治理面判定：`prompts/**` + 治理面汇总索引 + 守卫断言增删 + `lib/**` ⇒ **oracle → critic 各 1 轮**

## 1. 四条遗留的收口

| 遗留 | 处理 |
|---|---|
| **#3** `PLAN_REF_ROOTS` 那族仍是**句子解析** | 升级为**逐字机读块**（`planRefRootsBlock()` + 三份投影逐字副本 + 精确比对），旧句子解析的**反向校验换成行级反向闭集** |
| **#2** 「已关闭 improvement」是**改状态行即可翻转**的开关 | 收窄：带归档指针的 **核本地目录真存在**；跨仓的 **须在状态行本身声明外仓**；语义式关闭保留并如实登记为不可机械核 |
| **#1** AC14 的**窄化描述**判据是副词词表 | 升级为**路径闭合**（写集动词/副词并集 + 紧跟 `.rddf/reviews` ⇒ 必须同时给出记账落点）—— 修掉旧词表**实测漏网**的 `edit 上限=.rddf/reviews` |
| **#4** 跨仓那半无 CI 守卫 | 落**人工 `diff` 入口**（handoff §7；两仓清单已逐字一致，实测通过） |

## 2. oracle（咨询模式）— `PASS-WITH-NOTES`

3 条 finding **全部闭合**，其中 1 条是**真判据回退**：

| # | finding | 闭合方式 |
|---|---|---|
| 1 | **accepted-roots 的反向校验丢了**：新守卫只做「块逐字 + 正向覆盖」，**不查「散文枚举 ⊆ 真源」** ⇒ 往散文塞第 5 个根不会红（而 agent 会照散文行动、被 `validatePlanRef` 运行时拒绝） | 补**行级反向闭集**：锚定**枚举形态**（`accepted roots：` 带冒号）的行，抓该行反引号 glob token ⊆ 真源。⚠ 不是回到自由句子解析（结构锚 + 闭集比对） |
| 2 | **B-2 分支（外仓关闭）可能是死代码** —— oracle 无权跑 shell 无法核实 | **有 live 消费者**：`rdd-verifier-state-consolidation.md` 状态行写「产品侧 rdd-workflow 仓」、归档目录在产品仓（本地不存在）⇒ 新增**证据用例**：断言「该文件被判为已关闭」+「其归档目录确实不在本仓」（后者保证走 B-2 而非 B-1） |
| 3 | **AC14 / AC20 的 closed 判定双份**（未来收窄一处会漂移） | 抽成模块级 `isClosedImprovement`，两处共用（全仓仅一处实现） |

oracle 的 NIT 也已处置：AC14 注释补**窗口取舍**（6 字符 vs 旧 40+20 的误报教训）；删掉被 `上限` 遮蔽的 `edit 上限` 分支；§7 输出改 `/tmp/opencode/`。

## 3. critic（4 段式）— `APPROVE_WITH_CONDITIONS`

`mergeable: yes`，`scope_exceeded: false`，**无 BLOCKER**。1 条 SHOULD_FIX + 3 NIT，全部处置。

| # | finding | 处置 |
|---|---|---|
| SHOULD_FIX | **反向闭集对 `docs/SUBAGENT-ORCHESTRATION.md` 静默空转**：`find()` 只取**首个**含 `accepted roots` 的行 ⇒ 锚到第 5 行的**类属提及**（无 glob token），而真正枚举在第 112 行 ⇒ 该文件的 ③ 恒平凡满足 | 改为**遍历所有**枚举行（锚 `accepted roots：` 带冒号）；**三份投影各做一次**「塞第 5 个根」演练 ⇒ 全部红（修复前 orch.md 会全绿） |
| NIT 1 | `rdd-workflow-e2e` 被 `rdd-workflow` 子串覆盖（冗余） | 删除并列项并注明原因 |
| NIT 2 | AC14 的「已给出记账落点」豁免可被**否定/重定向语境**洗白 | 登记为已知边界（与 HIST 同属登记在案的边界） |
| NIT 3 | 「枚举拆到下一行」形态仍会漏 | 登记为已知边界（fail-closed 方向） |

### critic 对 focus 1 的如实回答（值得记下）

> accepted-roots ①②③ 相对旧句子解析**不是严格更强**；AC14 同理 —— 属**换漏网集**而非严格更强。
> 但新判据独有的真实增益是：**块级逐字闭集**（旧实现完全没有的面）+ **抓到了 `plan.md:90` 缺闭合反引号**这个真缺陷。

## 4. 顺带抓到的真缺陷

`prompts/plan.md:90` 最后一个 accepted root **缺闭合反引号** —— 旧守卫「取第一句就截断」（`.split(/[。\n]/)[0]`）把它藏住了；新闭集断言当场抓到。**这是「句子解析会藏住真实缺陷」的直接证据。**

## 5. 验证

| 项 | 结果 |
|---|---|
| `bun test tests/` | **536 pass / 0 fail**（8 files） |
| `bash scripts/check-upstream-anchors.sh` | **23/23** |
| 变红演练：accepted-roots | ① 改真源（加 root）⇒ 红；② 文档块少一根 ⇒ 红；③ **三份投影各塞第 5 根 ⇒ 全红** |
| 变红演练：AC14 | ① 副词式 ⇒ 红；② `edit 上限=.rddf/reviews`（旧漏网）⇒ 红；③ 写集式 ⇒ 红；④ 合法（报告落点）⇒ **不红** |
| 变红演练：关闭判定 | 伪造本地归档指针（目录不存在、无外仓声明）⇒ **不当豁免** ⇒ AC20 红 |
| 跨仓 `diff` | 两仓 verifier owns 清单**逐字一致** |

## 6. 遗留（如实登记）

1. **`isClosedImprovement` 的「语义式关闭」**（无归档指针，仅写「已完成」）**不可机械核** —— 伪造关闭属故意行为，超出守卫威胁模型（归 `rdd-doctor` / 流程评审）。
2. **AC14 的两处已知边界**：① 「已给出记账落点」豁免可被否定/重定向语境洗白；② 动词与路径隔 >6 字符的松散形态会漏（fail-closed）。
3. **accepted-roots 的「枚举拆到下一行」**形态会漏（续行不含冒号形态）。
4. 跨仓那半**无 CI 守卫**（skill 在用户 home）⇒ 人工 `diff`（handoff §7）。
5. 两处**枚举式词表**仍在（AC20 的 HIST 行级豁免 + AC14 的写集动词词表）。
