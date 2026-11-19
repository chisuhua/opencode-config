# required-question-hard-pause-probe — `rdd-builder` 的 **HARD pause** 在非交互环境的行为（**先勘，不改状态机**）

> 来源：`required-question-fallback`（v2.42）登记的「另 5 处『必须问用户』声明」之一（**风险最高的一处**）
> 性质：**治理面**（勘察 + 设计；**本 change 不改状态机、不加行为判据**）
> ⚠ **本 change 是「探路 change」**：产出 = **勘察结论 + 设计草案**，实施留给后续 change。

## Why

`prompts/build.md` §rdd-workflow 增强层：

> - **HARD pause 优先于 skill 内部的自动决策** —— `rdd-builder` 的 P0 / P2.5 是 HARD pause
>   （用户必须显式选择，不能跳过）。agent **不替用户拍板**：触发 pause 时把选项交给用户。

⇒ **非交互环境**（`opencode run`）拿不到用户选择 ⇒ **没有兜底**。

⚠ **但这一处与 v2.42 覆盖的两处有本质区别**：它不是「加一句兜底句」能解决的 ——
`rdd-builder` 的 P0 有**自己的 5 选项协议 + 落盘状态**（`openspec/changes/*/tasks.md`、
`.rddf/state/` 等）⇒ 把「停机并交付裁决请求」插进去会**与状态机交互**，而**这个交互完全未勘**
（v2.42 的 oracle 审明确指出：「P0 HARD pause 与 rdd-builder 状态机的交互完全未勘」）。

⇒ ⇒ **本 change 只做两件事**：① **勘察**（P0 在非交互环境的实际行为）② **设计草案**（兜底形态如何与状态机共存）。
⇒ **不改 `prompts/build.md` 的 HARD pause 条、不加行为判据**（在勘察结论出来之前，任何断言都是猜）。

## 勘察要回答的问题（Q1–Q5）

| # | 问题 | 为什么重要 |
|---|---|---|
| Q1 | 非交互环境跑 `rdd-builder`（P0 触发）时，它会**停下**、**自行选一个选项**、还是**报错退出**？ | 决定是否有真实缺陷 |
| Q2 | P0 的 pause 是否已**落盘**（`.rddf/state/` 里有「待用户选择」的记录）？ | 决定「停机」后能否**恢复**（无落盘 ⇒ 停机 = 丢状态） |
| Q3 | P2.5（review pause）与 P0 的行为是否一致？ | 决定是否要两套设计 |
| Q4 | `rdd-builder` 的 skill 文档里是否**已有**非交互口径？（`rdd-quick` / `execute` 子技能各自的门控） | 若已有 ⇒ 可能不必改 build.md |
| Q5 | 「停机并交付裁决请求」的形态与 P0 的 5 选项**能否并存**（例如：停机时把 5 个选项列成候选路径）？ | 决定兜底形态 |

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | **Q1–Q5 逐条有答案**（实测或代码/文档取证），且每条**标注证据来源**（命令 + 输出摘要 / 文件 + 行） | 勘察 | 观察报告 |
| AC2 | 若 Q1 显示**有缺陷**（自行选选项 / 无兜底）⇒ **如实登记**，并给出**设计草案**（兜底形态 + 与状态机的交互点 + 落盘/恢复）；若**无缺陷**（已停下并落盘）⇒ **如实写「无需改动」**并给证据 | 勘察 | 同上 |
| AC3 | 守卫「未覆盖清单」的对应条目**更新为**「已勘察（见报告 §X）/ 待实施（另立 change）」 | 结构（登记） | `tests/config-guards.test.ts` |
| AC4 | **不修改** `prompts/build.md` 的 HARD pause 条、**不修改** `rdd-builder` skill 的行为 ⇒ 本 change **不产生行为变更** | 结构（自检） | `git diff` 无 prompts 改动 |
| AC5 | CHANGELOG 落一条（结论按勘察结果回填） | 结构 | `docs/CHANGELOG.md` |

## Acceptance（勾选镜像）

- [x] AC1 Q1–Q5 逐条有答案 + 证据来源
- [x] AC2 有缺陷 ⇒ 登记 + 设计草案；无缺陷 ⇒ 如实写「无需改动」
- [x] AC3 守卫未覆盖清单已更新
- [x] AC4 **不改** prompts / skill 行为
- [x] AC5 CHANGELOG

> **验收证据（2026-11-19 归档轮核对）**
> - **AC1 / AC2**：`.rddf/reviews/required-question-hard-pause-probe-observation.md` §1（Q1–Q5 逐条答案 + 证据来源）与 §2（「**无需改动**」结论 + 残余缺口如实登记）。
> - **AC3**：`tests/config-guards.test.ts` 的未覆盖清单对应条目已写「② §rdd-workflow 增强层的 `rdd-builder` P0 / P2.5 HARD pause —— **2026-11-17 读证：不是缺陷** … 残余缺口 = 低置信度时的「暂停问用户」⇒ 登记为产品侧议题」。
> - **AC4**：本 change **未改** `prompts/**` 与 skill 行为。⚠ **取证口径**：本 change 的文档与 v2.43 遗留批量收尾在**同一个 commit**（`9cc67c9`）里落地 ⇒ **commit 级 diff 不能用来证明「没碰 prompts」**（该 commit 确实动了 `prompts/build.md`，但那是 v2.43 收尾、与本 change 无关）。**按文件归属核对**：本 change 的产出只有 `openspec/changes/required-question-hard-pause-probe/**`（design / proposal / tasks）+ 本次核对的观察记录 + `docs/CHANGELOG.md` 的 v2.46 条目。
> - **AC5**：`docs/CHANGELOG.md` 顶部新增 **v2.46 勘察结论**条目（结论按勘察结果回填，含「未真跑」的如实登记）。
> - **Task 2 的豁免依据**：`design.md` **D3**（「先读（零成本）⇒ 答得出就不必真跑」）—— 读证已直接否定立项时担心的形态（默认模式 `auto-decision` ⇒ 不真 pause）⇒ Task 2 Step 1/Step 2 均标「D3 读证豁免 / 未触发」，代价（低置信度分支未实测）写在观察记录 §3。
> - **归档口径（本次一次性判断，不构成全仓规则）**：**探路 change 允许以「勘察结论 + 设计草案」为终点归档**，前提是 ① 结论与其证据已落盘、② 未实测的分支**如实标注**（不声称覆盖）、③ 若勘察发现缺陷 ⇒ 实施另立 change。若上级口径不认可这条，本 change 应改为「勘察结论落盘后继续挂着」——两种处置都符合「宣称不得高于实现」，差别只在活跃列表是否长期占位。

