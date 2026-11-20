# plan 侧工程派发退役演练（隔离副本，2026-11-20）

> **判据来源**：`docs/adr/ADR-plan-delegate-engineering-session.md` 的「**回滚口径**（三步）」。
> **动机**：该口径自称「本篇整体可逆，按此三步回退即可回到现状」，但**从未实测** —— 本报告给出实测结论。
> **纪律**：演练全部在**隔离副本**（`git clone`）里做 —— 绝不在宿主正在加载的 `lib/` / `plugins/` 路径上动手（否则宿主会缓存坏实例，见 CHANGELOG v2.52）。
> **可执行真源**：`.rddf/rollback/plan-delegate.json`（48 条 `edits`；`bun scripts/rollback-drill.ts .rddf/rollback/plan-delegate.json`）。

## 0. 方法

- 副本 = `git clone /home/ubuntu/.config/opencode`（HEAD `663cb31`）。
- 验证 = `bun test tests/`（本仓唯一真实闸门）。
- ⚠ 副本缺 gitignored 运行态（`.rddf/state/role.json`）⇒ 有一条守卫（SUBAGENT-ORCHESTRATION 引用路径存在性）**恒假红** ⇒ 演练用 `drill_env.seed_files` 补齐（**不是真红**）。

## 1. 实验 A：**只做 ADR 的三步**（不含任何同步面）

| 步骤 | 动作 | 结果 |
|---|---|---|
| ① | `opencode.jsonc.opencode-go`：plan 的五项 delegate 放行撤掉 | — |
| ② | `lib/delegate-async.ts`：`sessions` 的 owner 过滤撤回（全量列举） | — |
| ③ | `owner_agent` 保持写入、读取侧按缺失兼容读 | **无需改动**（现状即如此） |

**结果：4 处红**

| # | 红的用例 | 性质 | 处置 |
|---|---|---|---|
| 1 | `tests/delegate-async.test.ts`「owner 过滤：两个 owner 互不可见，但全局配额计数含两者（D3 硬约束）」 | **真红**（D3 本身被撤回 ⇒ 该断言失效） | 随 D3 一并撤回 |
| 2 | `tests/config-guards.test.ts`「delegate 通道的放行主体：顶层全 deny + front / plan 各自放行五项」 | **真红**（步骤 ① 改了被断言的事实） | 收窄为 front-only（并把 plan 移入「不得放行」侧 ⇒ **加强**） |
| 3 | `tests/config-guards.test.ts`「AC23：三个 agent 的能力面机读块 == lib 渲染的规范块」 | **真红**（`capability:plan` 是配置的逐字投影 ⇒ `delegate: yes` ⇒ `no`） | 同步机读块 |
| 4 | `tests/config-guards.test.ts`「SUBAGENT-ORCHESTRATION.md 引用的仓库内路径都存在」 | **假红**（副本缺 gitignored 运行态） | `drill_env.seed_files` 补齐 |

## 2. 实验 B：三步 **+ 3 处同步**（最小充分集）

只加上面 4 行里的 3 处同步（撤回 D3 用例 + 收窄放行主体守卫 + 同步 `capability:plan`）⇒ **套件全绿**（`1028 pass / 1 skip / 0 fail`，唯一剩下的红是第 4 处 clone 假红）。

⇒ **结论（订正 ADR 的口径）**：
- ADR 的「**三步即可回到现状**」在**形式上成立** —— 补 3 处同步后套件确实绿。
- 但那是**实质上的半退役**：此时 `prompts/plan.md` 仍在教 plan 派发工程 session、`docs/` 仍在说「plan 也是放行主体」、20 余处守卫仍要求 plan 覆盖派发契约 ⇒ **prompt 与权限层互相矛盾**（模型读到 plan.md 会尝试派发、被权限层拒 ⇒ **复现 v2.44 事故形态**）。
- ⇒ 要**实质退役**，还须做「教学退役 + 文档转述 + 守卫收窄 + 悬空指针清理」⇒ 本清单共 **48 条 edits**（= 最小集 5 条 + 其余 43 条实质退役工作）。

## 3. 实验 C：全量清单（48 条 edits）

`bun scripts/rollback-drill.ts .rddf/rollback/plan-delegate.json` ⇒ **PASS**（隔离副本 `bun test tests/` **1024 pass / 0 fail**）。

- 计数对账：真仓 **1031** − 副本 **1024** = 7 = **5** 条被撤回的守卫用例 + **2** 条清单漂移守卫用例（在 drill 副本里整组 skip，因副本正是「清单已执行完」的状态）。
- 同步面覆盖（按 critic 指出的漏项补全）：配置 / 代码 / `prompts/plan.md` / `prompts/build.md` / `prompts/front.md` / `docs/MULTI-AGENT-DESIGN.md` / `docs/SUBAGENT-ORCHESTRATION.md` / `tests/config-guards.test.ts` / `tests/delegate-async.test.ts`。

## 4. 残留（如实登记，见清单 `notes`）

① 代码内核保留（D2 `plan_ref` / D5 `owner_agent` / D7 优先级 / `role_class` 惰性）② `plan.md` 消费侧三小节成为死教学 ③ D3「配额 owner 无关」不变式失去双 owner 直接覆盖 ④ 存量 plan-owned 后端对 front **可见**但仍受 D7.3/D7.8 硬拒 ⑤ ADR 散文 ↔ 清单之间无机判 ⑥ 「同步面」枚举本身易漏（必须实测，不能照抄口径）。

## 5. 教训（写给下一个做清单的人）

1. **ADR 的回滚口径是写它那天的快照** —— 后续增量会侵蚀它；本例中口径的「三步」恰好够绿，但**语义上已经不够**（半退役）。
2. **「形式可逆」≠「实质可逆」** —— 判断标准是「prompt / 文档 / 守卫是否还在宣称那个能力」，不是「套件绿不绿」。
3. **同步面要按面扫**（配置 / 代码 / prompt / 文档 / 守卫），不能只改 ADR 点名的那几处 —— 本例中 critic 实测指出「索引 / 汇总转述面」整类漏了 8 处。
4. **clone 假红要单独标**（缺 gitignored 运行态）—— 否则会把「环境缺失」误判成「回滚不彻底」。
