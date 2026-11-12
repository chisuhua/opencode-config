# tasks — subagent-input-contract

> 来源：`openspec/changes/subagent-input-contract/proposal.md`（AC1–AC11）。
> 验收记录：`.rddf/reviews/subagent-contract-verify.md`。

## 不做什么（防顺手）

- 不改内置 `subagent` 工具的 schema / 行为（不加结构化字段、不换 L0 方案）。
- 不给 explore / oracle / metis / librarian / general 设契约（本期只约束 critic）。
- 不让 `session.hook("prompt")` 抛错（宿主 `Failures` 契约：session 域不可失败）。
- 不做语义判定（"intent 对不对"）；不改 `prompts/critic.md` 的输出格式约定。
- 不动 `prompts/build.md` 的评审预算数值（2 轮）与 finding 处置规则。

## 实现

- [x] 1.1 **规则真源** `lib/subagent-contract-core.ts`：`CONTRACTS` 表（critic 7 字段 + 长度上下限 + 豁免关键词 + `exemptMinMissing`）— AC1
- [x] 1.2 **小节识别**：5 种实测写法（编号标题 / 纯标题 / 标题+尾部说明 / 加粗独立行 / 行内赋值）— AC2
- [x] 1.3 **豁免语义**：关键词 + 结构前置（缺失 ≥ ceil(n/2)）+ 状态继承（继承"复审模式"）+ 续接轮不清零 — AC6
- [x] 1.4 **三钩子处理函数下沉到 core**（`applyContextInjection` / `gate` / `pruneState`）⇒ 插件壳只做接线，逻辑可单测 — AC3/AC4/AC5
- [x] 2.1 **宿主接线** `plugins/subagent-contract.ts`：L3 `session.hook("context")`（注入 + 幂等）/ L1 `tool.hook("execute.before")`（硬门 + 可执行错误文案）/ L2 `session.hook("prompt")`（检测，**不抛错**）+ 配置每次重读 + 状态节流清理 — AC3/AC4/AC5/AC8
- [x] 3.1 **审计 CLI** `scripts/audit-subagent-prompts.ts`：按父会话分组 + 与运行时同一份 core 逻辑 + `--strict/--agent/--session/--since/--json` — AC7
- [x] 4.1 **单测** `tests/subagent-contract-core.test.ts`（规则引擎 39 例）+ `tests/subagent-contract-audit.test.ts`（审计器 + CLI 退出码 7 例）— AC2/AC6/AC7
- [x] 4.2 **L4 防漂移断言** 追加到 `tests/config-guards.test.ts`：7 字段 ↔ core 表 ↔ `prompts/build.md`；每个 agent 的 description 非空、prompt 文件存在且首行含 agent id — AC1
- [x] 4.3 **上游锚点** A13 / A13b 登记进 `scripts/check-upstream-anchors.sh`（"只有 tool 域允许失败"）— AC5
- [x] 4.4 **build.md 补一条**：「被输入契约拒绝的调用不计入评审轮」 — AC11
- [x] 5.1 **灰度配置** `subagent-contract.json`（默认 warn，逐 agent 可覆盖）— AC8
- [x] 6.1 **live e2e**：warn 模式确认 L1+L2 落日志；enforce 模式确认 `subagent` 调用被拒并返回可执行修正文案；随后翻回 warn — AC9
- [x] 6.2 **全量回归** `bun test tests/`（352 pass / 0 fail）— AC10

## 遗留 / 后续

- [ ] 7.1 **灰度观察**：默认 warn 期跑一周，用 `scripts/audit-subagent-prompts.ts --agent critic` 看违规率与豁免误命中率，再决定是否对 critic 开 enforce（用户已签批"先 warn 后 enforce"）。
      - 当前基线（2026-11-12，收紧后）：critic 331 次调用 / 违规 110 / 豁免 78 / 合规 143（43.2%）。
      - 观察命令：`bun scripts/audit-subagent-prompts.ts --agent critic --since <YYYY-MM-DD>`；误命中率按 `.rddf/reviews/subagent-contract-exemption-sampling.md` §1 的口径复核。
      - 决策门槛：误命中率 ≤ 2% 且违规率连续下降 ⇒ 可对 critic 开 enforce。**需等待一周数据，本轮未完成。**
- [x] 7.2 **豁免误命中抽样**：真实库 **90 条豁免全量复核**（不是抽 20 条），误命中 **12 条 = 13.3% > 10% 阈值** ⇒ 已收紧：① 豁免只看任务陈述区（prompt 开头 400 字符）② 状态继承需本轮自证引用上一轮。收紧后 110 违规 / 78 豁免，真豁免零误伤。证据：`.rddf/reviews/subagent-contract-exemption-sampling.md`。
- [-] 7.3 **L0 备选**：**本期明确不做**（用户已拍板：结构化子工具不在本期范围）。仅当 enforce 后的"拒绝→重发"token 成本不可接受时才重开此项。
- [ ] 7.4 **契约推广**：critic 稳定后再评估是否给 `oracle` / `metis` 设契约（它们没有 7 字段契约，收益形态不同）。**前置条件未到**（critic 仍为 warn 灰度，等 7.1 数据）。
