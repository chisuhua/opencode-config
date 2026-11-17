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
