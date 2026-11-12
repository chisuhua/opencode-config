# subagent-input-contract — subagent 输入契约：把"7 字段上下文"从散文变成可判定的门

> 本 change 无 ADR（新增机制，不改动既有架构决策）；决策记录在 `docs/adr/` 之外（本仓约定：机制类改动走 openspec change）。
> 审稿：oracle + critic（治理面改动，§审查配对 治理面行）。critic 第 1 轮结论 `APPROVE_WITH_CONDITIONS`（4 条 SHOULD_FIX，已全部处置，见 `.rddf/reviews/subagent-contract-verify.md`）。

## Why

`subagent` 工具的 `prompt` 声明为 `string`：**没有 schema、没有模板、没有校验**。父模型写什么，子 agent 就收到什么。

实测（`scripts/audit-subagent-prompts.ts` 扫真实库 330 次 critic 调用）：

- 同一个 critic 子会话的输入出现**三种形态**：编号版（`## 1. changes_summary`）、加粗版（`**changes_summary**`）、复审版（只有闭合证据）
- `prompts/build.md` 里的「7 字段上下文契约」是**散文**：只对 critic 生效、对模型只是建议，没有任何机器可判定的强制点
- 后果链：critic 自己的 `prompts/critic.md` 写着「缺 `intent` → 只看显式契约冲突，不评估设计取舍」⇒ **契约缺失时，评审质量静默下降**，而父会话看不到任何信号

⇒ 需要一层**可判定**的输入契约：规则真源机器可读、宿主在生成前后各有执行点、违规可审计。

## What Changes

1. **规则真源**：`lib/subagent-contract-core.ts` 的 `CONTRACTS` 表（critic = 7 字段 + 长度上下限 + 复审豁免关键词）。零宿主依赖、零 npm 依赖 ⇒ 可独立单测。
2. **小节识别**：支持 5 种实测写法（编号标题 / 纯标题 / 标题+尾部说明 / 加粗独立行 / 行内赋值 `review_profile = **arch**`）—— 第一版只认标题，漏判 2 例真实调用。
3. **L3（生成前）**：`session.hook("context")` 把契约注入 `subagent` 工具描述 ⇒ 父模型在采样前就看到判据（与 opencode 注入 `Available subagents:` 同一手法，幂等）。
4. **L1（执行前，硬门）**：`tool.hook("execute.before")` 校验 `input.agent` + `input.prompt`；不合规 ⇒ **抛错** ⇒ 宿主包成受控 `Tool.Error` ⇒ 父模型看到缺失项与修正指引，同回合重发。**这是宿主唯一允许失败的钩子**（`packages/core/src/plugin/hooks.ts` 的 `Failures` 类型）。
5. **L2（落库前，检测）**：`session.hook("prompt")` 兜底覆盖 `command(subagent:true)` 等不经 tool 的路径。**不得抛错**（session 域钩子不可失败）⇒ 只检测 + 记录。
6. **豁免语义（关键词优先 + 结构前置 + 任务陈述区窗口 + 状态继承 + 继承自证）**：
   - 关键词命中（复审 / 第 N 轮 / 闭合证据 / closure）⇒ 豁免小节检查
   - **结构前置条件**：仅当缺失小节 ≥ 半数（ceil(7/2)=4）才允许豁免 —— 否则"第 2 轮"这类措辞在真实 diff 里的偶发命中会误放行
   - **任务陈述区窗口**：关键词只认 prompt 开头 400 字符 —— 后半段输出模板里的"复审/上一轮"（"不需要复审代码"、"会被 critic 复审时升级为 BLOCKER"）不构成豁免依据
   - **状态继承**：继承的是"上一轮被判为复审轮"这个**模式**（不是"上一轮合规"）⇒ 复审链可持续豁免，而同一父会话里的**新评审不会被放行**
   - **继承需自证**：走继承路径时，本轮 prompt 自己也要引用上一轮 —— 防"连着审不同对象"（ADR-090/091/092）时把新评审一并放行
7. **L5 审计 CLI**：`scripts/audit-subagent-prompts.ts` 用**同一份** core 逻辑评估历史子会话 ⇒ 灰度期的决策依据；`--strict` 时有违规 exit 1（可作 CI 断言）。
8. **灰度**：默认 `warn`（只记录 + 审计），配置可逐 agent 切 `enforce`；配置每次调用重读 ⇒ 改配置即时生效，无需重启。

## 验收标准

| AC | 判据 | 证据 |
|---|---|---|
| AC1 | 规则真源存在且与 `prompts/critic.md` 声明的 7 字段**双向一致** | `tests/config-guards.test.ts` L4 断言 |
| AC2 | 小节识别覆盖 5 种实测写法 | `tests/subagent-contract-core.test.ts` |
| AC3 | L3 注入契约且幂等（重复触发不叠加） | 同上 + live 观察父会话工具描述 |
| AC4 | L1：enforce 下拦截并给出**可执行**修正文案；warn 下只记录 | live e2e（见验收报告） |
| AC5 | L2 只检测不抛错（宿主 `Failures` 契约） | `scripts/check-upstream-anchors.sh` A13/A13b |
| AC6 | 豁免：关键词 + 结构前置 + 任务陈述区窗口 + 状态继承 + 继承需自证；续接轮不清零复审模式 | 单测「复审链回归」「关键词只在前 400 字符内生效」「状态继承有前置」+ `.rddf/reviews/subagent-contract-exemption-sampling.md` |
| AC7 | 审计 CLI：报告 / `--strict` exit 1 / `--agent` `--session` `--since` `--json` | `tests/subagent-contract-audit.test.ts`（含 CLI 子进程退出码） |
| AC8 | 默认 warn；逐 agent 可覆盖；配置即时生效 | `subagent-contract.json` + 插件每次调用重读 |
| AC9 | live：warn 模式日志留下 L1+L2 违规记录；enforce 模式 `subagent` 调用被拒 | `~/.local/share/opencode/subagent-contract.log` + 会话记录 |
| AC10 | 全量单测绿 | `bun test tests/` |
| AC11 | build.md 补一条「被契约拒绝的调用不计入评审轮」 | `prompts/build.md` §评审预算 |

## 非目标（明确不做）

- **L0 结构化子工具**（用结构化字段替代自由文本 `prompt`）⇒ 用户已决定本期不做；收益与"拒绝→重试"路径重叠，成本高一个数量级。
- **对其它 agent（explore / oracle / metis / librarian / general）设契约** ⇒ 本期只约束 critic（唯一有 7 字段契约的 agent）。
- **替换或修改内置 `subagent` 工具** ⇒ 只加钩子，不改内置行为。
- **让 L2 具备拦截能力** ⇒ 宿主契约不允许（session 域钩子不可失败）。
- **语义判定**（"intent 写得对不对"）⇒ 不可判定，只判结构。
