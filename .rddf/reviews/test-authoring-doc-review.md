# 审稿记录 — 测试构建指南（`docs/test-authoring.md`）

> 产物：`docs/test-authoring.md`（新增，198 行）+ `docs/MULTI-AGENT-DESIGN.md` §6 一行索引
> 治理面判定：改动触及 `docs/MULTI-AGENT-DESIGN.md`（治理面作用域表明确列出）⇒ **oracle → critic 各 1 轮**
> 日期：2026-11-15

## 1. 为什么新建而不是并进既有文档

用户诉求：「沉淀测试构建的指南文档，比如 TDD 测试和端到端的测试侧构建，以后有更多的测试构建可以有文档经验可询」。

先做分工判定（**不复制、只引用**）：

| 文档 | 职责 |
|---|---|
| `docs/front-delegate-testing.md` | 本仓测试**地图**（目录 / 怎么跑 / fixture / 覆盖矩阵 / 运行时清单） |
| `docs/guard-authoring.md` | **判据与守卫的写法**（真源→渲染→逐字比对 / 变红演练 / 五陷阱 / 扫描集 / 跨仓 diff） |
| `rdd-workflow-e2e` 仓 `docs/runtime-assertion-discipline.md` | 运行时**三条断言纪律** |
| **`docs/test-authoring.md`（新）** | **跨层选型与构建流程**：该写哪一层、怎么保证这条测试不骗人 |

oracle 复核了「不合并」这个决定（已排除方案：并进 `guard-authoring.md` —— 读者面不同：那边是「改守卫的人」，本文是「新增任何测试的人」；且 guard-authoring 已 262 行，再加选层与门控会稀释其聚焦度）。

## 2. 内容来源（全部可追溯，无杜撰）

| 节 | 来源 |
|---|---|
| §1 四层能证明 / 不能证明 | `v2.28` 的「静态守卫证明不了运行时转述」⇒ e2e `CS-7` 的必要性；`front-delegate-testing.md` §1 |
| §2 三种无效红灯 + 动态 import 技巧 | `v2.28` TDD 执行记录（`.rddf/plans/session-alignment-contract.md`） |
| §3.1 结构化事实优先 | `CS-7`（断言 `outcome` / `write_tool_calls` 而非模型措辞） |
| §3.2 规定措辞 vs 自由措辞 | `runtime-assertion-discipline.md` 纪律 1 的边界补充 |
| §3.3 序列化后断言 | critic 在 `v2.28` 抓到的真缺陷（`wait_error` 恒 `undefined` ⇒ `JSON.stringify` 丢键 ⇒ 双层守卫都看不见） |
| §4 确定性 | `f17e49b` 的 flaky 修复全流程（`pid+1` + 同 host ⇒ 3 次运行 1 次全红；确定性红练；跨 host 修法；AC11b 回归） |
| §5 门控 | e2e 的 `E2E_REAL_RUNTIME=1` 默认 skip |
| §6 指针 | `guard-authoring.md` §3.1 / §3.2 / §4.4 |

## 3. oracle — `PASS-WITH-NOTES`（8 条建议全部落地）

| # | 建议 | 落地 |
|---|---|---|
| 1 | §2 防漂移类不能只「如实标注」⇒ 补机械判法 | 加「**必须**附带注入演练记录；无记录的『防漂移』标注不被认可」 |
| 2 | §2「断言写错方向」与 `guard-authoring §3.2` 是同一规则的两处表述 | 该行补指针 |
| 3 | §1 手工验收「不能证明」列会被读成「可省」 | 补「不是兜底选项 + 只有这层能覆盖的面」段 |
| 4 | §3.3 序列化断言有过泛化风险 | 补作用域边界（仅跨边界；纯内部对象加了反而掩盖值错误） |
| 5 | §4.3「连跑 5 次」是经验值不是判据 | 标注两个判据强度不同（逻辑判据 vs 统计下限） |
| 6 | §5「进 CI」假定了一个尚不存在的 CI | 加脚注「规范性要求，本仓未接入」 |
| 7 | §6 差异表 75% 行不是差异、不能独立阅读 | 压缩为「一句真差异 + 三条指针」 |
| 8 | §0 缺「三层（物理位置）vs 四层（证明力）」映射 | 补映射段 |

## 4. critic — `APPROVE_WITH_CONDITIONS`（`mergeable: yes`，无 BLOCKER）

| # | finding | 闭合 |
|---|---|---|
| SHOULD_FIX 1 | **§4.3 算术方向反了**：「复现率 1/10 ⇒ 5 次漏检约 41%」实为 **0.9⁵ ≈ 59% 漏检 / 41% 检出** | 改为「5 次全绿概率 0.9⁵ ≈ 59% ⇒ 漏检约 59%」（并核算：`0.9**5 = 0.5905`）。critic 指出该笔误恰好撞上本文自己的元规则（宣称不得超出覆盖面）—— 已按同一标准修正 |
| NIT 1 | §1「进 CI」无语境限定，会被读成现状 | 两处补「规范性要求，见 §5」 |
| NIT 2 | §2 括注重述了演练动作，违反本文 §6 自己的「复述即漂」 | 括注改裸指针（规则本体保留 —— critic 确认「防漂移类必须有演练记录」是**测试侧增量**，不算双写） |
| NIT 3 | §1「走的本就是『本地验收』」语气过头（本地验收是 agent 执行的机械判据，非纯人工） | 改为「**含人工判断成分的**本地验收」 |

## 5. 验证

| 项 | 结果 |
|---|---|
| `bun test tests/` | **545 pass / 0 fail**（exit 0）—— 含散文类守卫 AC14 / AC20 对 `docs/**` 的扫描，新文档**不触发任何判据** |
| `bash scripts/check-upstream-anchors.sh` | **23/23**（exit 0） |

## 6. 残留（如实登记）

1. **未采纳**：`docs/MULTI-AGENT-DESIGN.md` §6 文件树缺 `front-delegate-testing.md` 等既有方法论文档条目（oracle 提出，critic 确认属**既有缺口**）。补它会把这批 1 行索引扩成文件树重排 ⇒ 不属本批 scope，已记入 `.rddf/reviews/session-handoff-20261114.md` 残留清单。
2. 本文是**方法论参考**（非契约）：与实现冲突一律以 `prompts/build.md` / 测试实现 / `lib/**` 为准（文档头已声明）。
3. 本文引用 `guard-authoring.md` 的**节号**（§3.1 / §3.2 / §4.4）—— 那边增删节时会漂，改守卫手册时须同步核一遍指针。
