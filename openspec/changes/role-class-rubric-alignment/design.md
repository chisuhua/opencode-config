# role-class-rubric-alignment — 设计（落点与取舍）

> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC11）
> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D1–D9，**Accepted**）+ `prompts/build.md` §architect 产出形态契约
> 性质：**纯 prompts + 守卫测试**，无代码路径改动。

## 1. 要解决的问题（两个面）

| 面 | 问题 | 实测证据 |
|---|---|---|
| **空间面** | 能力面 allow 集**手抄 4 份**（lib 1 + plan 1 + build 1 + front 2 行），无守卫 | 3 处漂移：① plan.md builder 行停留在 D3 之前（`a537b5d` 只改了 build.md）② 「选错类 ⇒ 后端交回」在窄目标下不成立 ③ 「机制未启用」窗口已过期但仍在 |
| **内容面** | 「架构内容该落哪、讨论 vs 决策怎么分」的判据**只在 architect 侧**（build.md 的落点路由 / 只回答三件事 / 一文档一决策 / 三层分离）；plan 侧只有一句禁令（不写 ADR） | plan 会话被禁止写 ADR，却不知道**何时该派 architect**、brief 该带什么 ⇒ 该派不派 或 乱派（两边各写一套） |

## 2. 落点

| 段 | 文件 | 形态 |
|---|---|---|
| 空间面投影 | `prompts/plan.md`（选类表 + 两种失败形态 + 归因句 + 始终生效句）、`prompts/front.md`（§3.1 字段说明 + §六 排障行） | 对齐 `lib/delegate-core.ts::classAllowRoots` 的**语义** |
| 内容面投影 | `prompts/plan.md` 新增 `#### 架构内容分流` 小节、`prompts/front.md` 四分类两行 | **按条目名引用** build.md 的「落点路由」与「只回答三件事」，**不复制正文** |
| 守卫 | `tests/config-guards.test.ts` 新增 describe（10 条断言 + 边界注释） | 结构锚定 + 计数断言 |

## 3. 关键取舍

| 取舍 | 选择 | 代价 / 边界 |
|---|---|---|
| 真源放哪 | 空间面 = **代码**（`classAllowRoots`）；内容面 = **build.md 既有判据**（不新建第二份） | prompt 只能写抽象名「架构文档目录」（`archRoots` 运行期算）⇒ **守卫钉结构不钉路径全集**（已写进边界注释与 proposal 风险行） |
| 分流小节放哪 | `prompts/plan.md`（派发侧，架构讨论发生的地方） | front 侧按**标题名**引用（与 `resume-precheck-guidance` 同法） |
| 分流小节标题级别 | `####`（不是 `###`） | `resume-precheck-guidance` 的守卫断言 plan.md 围栏外**唯一**的 `###` 标题（该标题即 front 的契约名）⇒ 新小节用 `####` 不进入该集合，**不放宽既有断言** |
| 派发被拒怎么写 | 拆「两种失败形态」+ **归因句**（三种成因） | 早期版本只写「后端交回」一条 ⇒ 派发方在窄目标下拿不到正确处置（oracle finding 1） |
| front 侧怎么改 | 理解性行加「只解释、不落盘」；实施性行加「架构决策落盘 ⇒ architect」 | **不新增第五类**（四分类结构保持） |
| 守卫强度 | 结构锚定（定位子 bullet / 表格行）+ 计数断言（落点路由正文、三件事枚举各只 1 次） | 关键词断言不是语义断言（已写进边界注释） |

## 4. 顺序与验证

1. A（plan.md 5 处）⇒ B（front.md 4 处）⇒ C（守卫）⇒ 回归。
2. 验证：`bun test tests/` **500 pass / 0 fail**；`scripts/check-upstream-anchors.sh` **23/23**；`openspec validate role-class-rubric-alignment` 通过。
3. 治理面 ⇒ oracle → critic 各 1 轮（顺序不可颠倒）。
4. **变红演练 4 例**（证明守卫真的能红）：builder 行退回 / 复制落点路由 / 删「派发被拒」/ 复制三件事枚举。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 守卫宣称 > 实际保证 | describe 头部**边界注释**三条 + proposal 风险行同口径 + AC7/AC8 用**计数断言**而非存在性断言 |
| 分流小节被误用成「逼用户做架构讨论」 | 三触发问题里第 3 问把「怎么做」路由到 ③；反向判据明写「需求澄清 / 实现细节不是决策」 |
| 「只引用不复制」被后人改成复制 | AC7 计数断言（落点路由正文 + 三件事枚举各只 1 次）⇒ 复制即红 |
| 新增小节破坏既有守卫 | 新小节用 `####`；`resume-precheck-guidance` 的 `PLAN_HEADINGS toHaveLength(1)` 未放宽（实测仍绿） |
