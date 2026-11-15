# delegate-base-channel — 给「简报必须声明基线」补上实现通道

> 来源：`v2.30` 的 AC29 登记（`tests/config-guards.test.ts` 的 `KNOWN_UNIMPLEMENTED_CHANNELS` 条目 `delegate-base`）
> 判据真源：本文件「## 验收标准」表（AC1–AC12）；实现步骤见 `tasks.md`；决策取舍见 `design.md`
> 性质：**公开契约变更**（delegate / dispatch 两个工具的 schema 各加一个参数）+ 输入校验 + 文档同步
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在 ⇒ 走**内置流程**（用户直接指定起草）。

## Why

`prompts/plan.md` 的选类表对 `verifier` 类写了一条**硬要求**：

> 取证命令要判「环境信号 vs 判据信号」时需要基线 ⇒ **简报必须声明可解析的 `<base>`**（如 `HEAD~1` 或 commit sha）；
> 不声明 ⇒ 后端一律 `blocked`

而 `prompts/build.md` 的取证纪律确实**消费**这个值 —— 后端要跑：

```bash
git merge-base HEAD <base>          # 定基线
git diff --name-only <base>...HEAD  # 判「取证对象是否被本 change 触及」
git show <base>:<path>              # 读基线内容
```

**但通道不存在**（`v2.30` 审计实测）：

| 环节 | 现状 |
|---|---|
| `delegate` 工具 schema | 12 个参数，**无 `base`** |
| `dispatch` 工具 schema | 同样无 `base`，且 `additionalProperties: false` ⇒ **传了会被硬拒** |
| `buildBrief()` | **不生成基线行** ⇒ 后端看不到 |
| `validateBrief()` | 不校验、也不存 |

⇒ 派发方只能把基线塞进 `constraints` 自由文本。后果有两层：

1. **无解析保证**：typo 的 ref（`HEAD-1` 而非 `HEAD~1`）会**穿过派发**，直到后端跑 `git merge-base` 才失败
   ⇒ **白烧一整轮派发**（后端按纪律交回 `blocked`，主会话重派）。
2. **不可判**：「基线声明了没有」无法被机械核 —— 正是本仓守卫体系要消灭的「散文是开集」失败类。

此外 `v2.30` 把 AC29 做成**双向登记式**判据（无通道 ⇒ 必须已登记；通道落地 ⇒ 必须删登记）——
**本 change 落地的标志之一，就是那条登记被删掉且判据自动转为「有通道」分支。**

## What Changes

### A. schema：两个工具同步加 `base`

| 工具 | 位置 | 变更 |
|---|---|---|
| `delegate` | `lib/delegate-core.ts` 的 `delegateToolDefinition()` | `properties.base`（string，选填但见 C） |
| `dispatch` | `lib/delegate-async.ts` 的 dispatch 工具定义 | 同上（**必须同批**：`additionalProperties: false` 会硬拒，不同步就是陷阱） |

`base` 的语义：**本次派发的基线**，供后端跑 `git merge-base` / `git diff <base>...HEAD`。
**它是「派发参数」，不是 session 继承的上下文** —— resume 时由调用方重新提供（理由见 `design.md` D2）。

### B. 简报：生成基线行

`buildBrief()` 在为 engineering 类生成简报时，若 `base` 已填，输出：

```
- 基线（base）: <值>
```

若工程**不是 git 仓**（`vcs=false`），输出「本工程无 VCS，基线不可用」而**不是**报错（见 D）。

### C. 校验：空值语义与派发方义务

- `validateBrief()`：只认 **`undefined`** 为「没填」；`""` / `null` 一律**非法**（与 `role_class` 的既有语义一致 ——
  避免再造一个「空串当没填」的静默分支）。
- **硬要求下移到 `execute`**（`effectiveRoleClass` 解析之后）：`effectiveRoleClass === "verifier"` 且 `vcs === true`
  且 `base` 未填 ⇒ **派发前硬拒**。
  - 为什么不在 `validateBrief` 判：`validateBrief` 拿不到 `effectiveRoleClass`（resume 时它由登记值解析），
    在那里按 `brief.role_class` 判会在 resume 路径上**必然漏判**（`design.md` D2）。
  - 为什么硬拒而不是让后端 `blocked`：错误尽早爆 —— 与 plan.md「硬拒发生在建 session 之前」的哲学一致。

### D. vcs 闸门：非 git 工程豁免

`vcs === false` ⇒ **不要求** `base`（否则非 git 工程的所有 verifier 派发会被全量拒绝 = 行为回归）。
简报打印「无 VCS，基线不可用」，后端按 `build.md` 的「取不到 ⇒ blocked」自行兜底。

### E. 注入加固

`base` 的值最终会进入后端的 `git` 命令。校验必须防「选项注入」：

- 拒绝首字符为 `-`（`--help` / `-h` / `--output=…` 会被 `git rev-parse` 当选项）；
- 拒绝含空白 / 换行；
- 拒绝含 `..`（路径穿越形态）；
- 服务端二次校验用 `git rev-parse --verify --end-of-options <base>`（`--end-of-options` 是 git ≥ 2.24 的护栏）。

### F. 文档同步（**同批**，否则 code 绿而文档打架）

| 文件 | 改动 |
|---|---|
| `prompts/plan.md` 的 verifier 行 | 从「简报必须声明可解析的 `<base>`」改为「**派发时必填 `base` 参数**（如 `HEAD~1` 或 sha）；不填 ⇒ 派发被拒」 |
| `prompts/plan.md` 的「派发参数」段 | 提到 resume verifier 也须重填 `base` |
| `prompts/front.md` 的 verifier 行 | 补 `base` 必填与语义 |
| `prompts/build.md` 的基线纪律 | 「缺省 `origin/main`」条款改为仅适用于**存量简报**（`origin/main` 在本仓不可解析，见 `.rddf/reviews/delegated-verifier-evidence-gap-prompt-review.md`） |
| `prompts/build.md` 的简报说明 | 补「基线（base）」行 |

### G. 判据收口

- **AC29 从「登记式」转为「行为断言」**：`buildBrief(validateBrief({...base:"HEAD~1"}))` 的输出必须含基线行
  （当前 AC29 只扫源码里有没有 `基线` 字样 —— 太松，见 `design.md` D6）。
- **删除 `KNOWN_UNIMPLEMENTED_CHANNELS` 里的 `delegate-base` 条目** —— 双向判据会强制这一点。

## 不做什么（scope 边界）

| 项 | 理由 |
|---|---|
| `buildBrief:1422` 的 kind 枚举手抄 | 不同失败域（kind 投影，不是 base 通道）；已在交接清单 ⑧ 登记 |
| `delegate-async.ts:1104` / `:1507` 的「返回：」清单手抄 | 同上，交接清单 ⑨ |
| `DELEGATE_RESULT_CRITICAL_FIELDS` 改 `as const` | 与本 change 无关（gloss 编译期约束），交接清单 ⑩ |
| 把 `base` 加进**返回**契约（回传解析后的 sha） | 输入侧闭环是本 change 的边界；结果侧携带基线留给独立 improvement |
| 真模型 e2e（证明「LLM 真的会填 base」） | 静态层证不了；本 change 只做到 fake-ctx 管道测试 + 登记 known boundary |

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | `delegate` 与 `dispatch` **两个** schema 都含 `properties.base`（`type: "string"`），且 `required` **仍不含** `base`（选填 + 条件必填，不是无脑必填） | 结构 | `tests/delegate-core.test.ts` |
| AC2 | `buildBrief(validateBrief({...合法派发, base: "HEAD~1"}))` 的输出含 `基线（base）: HEAD~1`（**行为断言**，不是扫源码字样） | 行为 | `tests/delegate-core.test.ts` |
| AC3 | `base: ""` 与 `base: null` ⇒ `validateBrief` **抛错**（只认 `undefined` 为没填） | 行为 | 同上 |
| AC4 | `role_class=verifier` + git 仓 + **未填 base** ⇒ `execute` 在建 session **之前**硬拒；错误信息含「base」且提示「verifier 派发必须声明基线」 | 行为（fake ctx） | `tests/delegate-tool.test.ts` |
| AC5 | `role_class=verifier` + **非 git 工程** + 未填 base ⇒ **放行**（vcs 闸门，防行为回归）；简报含「无 VCS，基线不可用」 | 行为（fake ctx） | 同上 |
| AC6 | `base: "--help"` / `"-h"` / 含空白 / 含 `..` ⇒ 被拒（选项注入加固）；错误信息指名被拒的形态 | 行为 | 同上 |
| AC7 | `base` 是**不可解析**的 ref（如 `nonexistent-ref-xyz`）⇒ 派发前硬拒（服务端 `git rev-parse --verify --end-of-options` 校验） | 行为 | 同上 |
| AC8 | **resume** verifier 且调用方重填 `base` ⇒ 简报含基线行（证明 resume 路径不需要「例外」） | 行为（fake ctx） | 同上 |
| AC9 | 四个文档面同批更新且**互不矛盾**：`plan.md` 的 verifier 行（必填 `base`）/ `plan.md` 派发参数段（resume 须重填）/ `front.md` 的 verifier 行 / `build.md` 的基线纪律（`origin/main` 缺省只适用于存量简报）+ 简报说明 | 结构（守卫） | `tests/config-guards.test.ts` |
| AC10 | AC29 **从登记式转为行为断言**：断言 `buildBrief` 输出含基线行；且 `KNOWN_UNIMPLEMENTED_CHANNELS` 里**不再有** `delegate-base` 条目（双向判据强制） | 结构 | `tests/config-guards.test.ts` |
| AC11 | 回归：`bun test tests/` 全绿（exit 0）；`bash scripts/check-upstream-anchors.sh` 无 `FAIL` / 无 `SKIP` | 结构 | 全量 |
| AC12 | `dispatch` 通道带 `base` **不再被 `additionalProperties: false` 硬拒**（否则「plan 按新规则给 dispatch 传 base」是陷阱） | 行为 | `tests/delegate-async.test.ts` |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [ ] AC1 两处 schema 都有 `base`，`required` 不含它
- [ ] AC2 `buildBrief` 输出含基线行（行为断言）
- [ ] AC3 `""` / `null` 被 `validateBrief` 拒
- [ ] AC4 verifier + git + 缺 base ⇒ 建 session 前硬拒
- [ ] AC5 非 git 工程 verifier 缺 base ⇒ 放行 + 简报说明
- [ ] AC6 选项注入形态被拒（`--help` / 空白 / `..`）
- [ ] AC7 不可解析 ref ⇒ 派发前硬拒
- [ ] AC8 resume verifier 重填 base ⇒ 简报含基线行
- [ ] AC9 四处文档同批且互不矛盾
- [ ] AC10 AC29 转行为断言 + 登记条目已删
- [ ] AC11 回归绿 + anchors 无 SKIP
- [ ] AC12 dispatch 带 base 不再硬拒
