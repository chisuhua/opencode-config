# 验收报告 — subagent-input-contract

> 产出角色：builder ｜ 判据来源：`openspec/changes/subagent-input-contract/proposal.md` §验收标准（AC1–AC11）
> 验收日期：2026-11-11 ｜ 治理面改动（`~/.config/opencode/**`）⇒ 已过 critic 第 1 轮
> 结论：**PASS**（AC1–AC11 全过；critic 的 4 条 SHOULD_FIX 已全部处置并回归）

## 1. 逐条判定（每条至少一条工具证据）

| AC | 判定 | 证据 |
|---|---|---|
| AC1 规则真源 ↔ `prompts/critic.md` 双向一致 | ✅ | `bun test tests/config-guards.test.ts` →「critic.md 里声明的 7 字段 == core 表的 requiredSections（双向一致）」通过；core 表 `lib/subagent-contract-core.ts` 的 `CONTRACTS` |
| AC2 小节识别覆盖 5 种实测写法 | ✅ | `bun test tests/subagent-contract-core.test.ts` →「小节识别：父模型实测产出的 5 种写法都要认」5 例通过（编号标题 / 纯标题 / 标题+尾部说明 / 加粗独立行 / 行内赋值） |
| AC3 L3 注入契约且幂等 | ✅ | 单测「注入后包含契约段与标记」「重复注入不叠加（幂等）」；live：父会话 `subagent` 工具描述被追加「## Input contract（违反者调用会被拒绝）」 |
| AC4 L1 硬门 + 可执行文案 | ✅ | **live e2e**：enforce 模式下调用 `subagent(agent="critic", prompt="审查一下这个改动。")` 被拒，返回：<br>`subagent input rejected: agent="critic" 的 prompt 不满足输入契约。` + 缺失小节清单 + 「重新调用时，prompt 必须包含以下小节标题…」+「不要原样重试」 |
| AC5 L2 只检测不抛错 | ✅ | 宿主契约：`packages/core/src/plugin/hooks.ts` 的 `Failures` 类型把 session 域标为 `NoFailures`、tool 域为 `ToolFailures`；已登记锚点 A13/A13b → `bash scripts/check-upstream-anchors.sh` = **23/23 命中** |
| AC6 豁免：关键词 + 结构前置 + 状态继承 + 续接不清零 | ✅ | 单测「关键词豁免的结构前置条件：只缺 1-2 个小节时，命中关键词也不豁免」「复审链回归：完整评审 → 关键词复审 → resume → 无关键词闭合证据（第 4 步仍豁免）」 |
| AC7 审计 CLI | ✅ | `bun test tests/subagent-contract-audit.test.ts` 7 例通过（收集范围 / 按 agent 解析规则 / 违规报出 / 状态继承 / CLI 默认 exit 0 / `--strict` exit 1 / `--agent` 过滤） |
| AC8 默认 warn + 逐 agent 可覆盖 + 即时生效 | ✅ | `subagent-contract.json` = `{"mode":"warn","agents":{"critic":{"mode":"warn"}}}`；插件每次调用重读配置（`loadConfig()` 在三个钩子内调用） |
| AC9 live 证据 | ✅ | `~/.local/share/opencode/subagent-contract.log` 两行：gate=L1（too-short + missing-sections）与 gate=L2（missing-sections）；enforce 模式下调用被拒（见 AC4） |
| AC10 全量单测绿 | ✅ | `bun test tests/` → **352 pass / 0 fail**（新增 46 例：core 39 + audit 7 + config-guards L4 4） |
| AC11 build.md 补一条 | ✅ | `prompts/build.md` §评审预算与循环规则 →「**被输入契约拒绝的调用不计入评审轮**…」 |

## 2. critic 第 1 轮的 finding 逐条处置

critic 结论：`APPROVE_WITH_CONDITIONS`（mergeable: yes）。**2 条 BLOCKER + 4 条 SHOULD_FIX + 3 条 NITS**。

### BLOCKER 1 — `explore`/`librarian`/`title` 的 `variant: "low"` 可能不可用 → **误报，不改**

critic 称 `opencode-go/deepseek-v4.1-flash` 未声明 `low` variant ⇒ 解析期 `VariantUnavailableError`（`packages/core/src/model-resolver.ts:162-175`）。

**反证**：`ses_e365bc9f6ffelZ5UH5PYpr7Gqn`（explore 探测会话）的 assistant 消息记录了真实错误：
`provider.invalid-request` / HTTP 426 / `{"type":"UpgradeRequired","message":"OpenCode 1.18.0 or newer is required to use the free tier"}`。
⇒ 模型**已成功解析并发出请求**（若是 variant 解析失败，不会走到 provider）；失败原因是 provider 的免费档限制，与 variant 无关。

⇒ 不改配置（改动会牵动 explore/librarian/title 三个 agent 的模型归属，属另一条 change 的范围）。**残留**：explore/librarian 在当前 provider 下不可用 —— 与本 change 无关，但会让"用 explore 做本地检索"的路径失效，已在下面 §5 记录。

### BLOCKER 2 — L2 在 `session.hook("prompt")` 里 `throw` 与宿主契约冲突 → **已修**

宿主源码 `packages/core/src/plugin/hooks.ts`：

```ts
// Failure channel for each hook event. Only tool execute.before may fail: a Tool.Error rejects the call before it runs.
interface Failures extends Record<keyof Domains, unknown> {
  readonly session: NoFailures<SessionHooks>   // ← session 域不可失败
  readonly tool: ToolFailures                  // ← 只有 tool 域可失败
}
```

**处置**：L2 改为**只检测 + 记录**（移除 `throw`），并在插件头注释写明该边界；硬门只保留在 L1（`tool.execute.before`）。新增锚点 A13 / A13b 防止上游放开该通道后前提被静默改变。

### SHOULD_FIX 1 — 交付的配置文件是 `enforce`，与签批的"默认 warn"矛盾 → **已修**

enforce live 验证后的残留。**处置**：`subagent-contract.json` 翻回 `warn`（全局 + `agents.critic`）。

### SHOULD_FIX 2 — 状态继承的重置条件过宽（`evaluation.ok` 会把续接轮算进去） → **已修**

**处置**：重置条件收窄为 `ok && !isResume && !exempted`（core 的 `gate()` 与 `evaluateChain()` 同步改）；新增回归测试「复审链回归：完整评审 → 关键词复审 → resume → 无关键词闭合证据（第 4 步仍豁免）」。

### SHOULD_FIX 3 — L2 的 `isResume` 硬编码 `false` ⇒ 合法续接被记成违规，虚高灰度期的违规率 → **已修**

**处置**：L2 用 `ctx.session.context({sessionID})` 数已有 user 消息来判定续接（prompt 钩子在落库前触发 ⇒ 已有消息数即首轮之后的条数）。

### SHOULD_FIX 4 — 关键词对全文匹配 ⇒ 一次误豁免会把父会话后续 30 分钟拉进复审模式 → **已修**

**处置**：加**结构前置条件** —— 仅当缺失小节数 ≥ `ceil(必需小节数/2)`（critic = 4/7）时才允许豁免；闭合证据式输入天然满足，"只缺一两个字段的懒散新评审"不再被放行。新增单测覆盖该前置条件。

### NIT 1 — L2 与 L1 共用同一 state Map 但语义不同 → **随 SHOULD_FIX 3 消解**

L2 的 `isResume` 修正后，两侧判定语义一致；另在插件注释中声明共享状态的语义。

### NIT 2 — 契约拒绝与评审预算的关系未写明 → **已修**

`prompts/build.md` §评审预算补一条：「被输入契约拒绝的调用不计入评审轮」（该次调用未产生子会话、未产生评审结论，重发不算新一轮）。

### NIT 3 — L2 事件是副本，改写 prompt 改不到原件 → **已在插件注释注明**

`session/prompt.ts` 在落库前对事件做 `structuredClone` ⇒ L2 只能是检测层。

### 验证建议的处置

| critic 的建议 | 处置 |
|---|---|
| 复审链回归测试 | ✅ 已加（AC6） |
| 抽样 20 条豁免人工核对误命中 | ⚠️ 部分：已用**结构前置条件**把误命中面收窄到"缺 ≥4 个字段且命中关键词"的窄交集；**逐条人工抽样留作灰度期任务**（`tasks.md` 7.2） |
| L2 续接误报在真实库确认 | ✅ 已修（L2 用 `ctx.session.context` 判定续接） |
| 宿主契约锚点登记 | ✅ 已加 A13 / A13b（23/23 命中） |

## 3. 灰度期基线数据（warn 模式，真实库 330 次 critic 调用）

```
critic:  330 次调用 / 97 违规 / 90 豁免
其余 agent（explore / oracle / metis / librarian / general / context-builder）: 0 违规
豁免原因: re-review-round 79 / prior-review-round 11
违规按缺失小节数: 缺1/7=64  缺2/7=9  缺3/7=2  缺4/7=1  缺5/7=3  缺6/7=5  缺7/7=13
近 4 天: 89 次调用 / 15 违规（16.9%）
```

⇒ 合规率约 71%。**这是"先 warn 后 enforce"的依据**：直接 enforce 会打断约 1/4 的既有评审流。

## 4. 遗留清扫（本次范围内）

| 项 | 状态 |
|---|---|
| TODO / FIXME / 半截实现 | 无（新增代码无 TODO） |
| 临时调试日志 | 无（插件日志是设计产物：`subagent-contract.log`，JSON 行） |
| 被 skip 的测试 | 无 |
| 未替换的 mock | 无（审计器测试用真实 sqlite 夹具，不用 mock） |
| 临时 fallback 分支 | 无 |
| 注释掉的代码 | 无 |
| 调试残留文件 | `subagent-contract.json` 是设计产物（配置），非残留 |

## 5. 范围外残留（只记录，不在本 change 处理）

1. **explore / librarian 当前不可用**：provider 的免费档要求客户端 ≥ 1.18（HTTP 426），与 variant 无关。影响"用 explore 做本地检索"的路径。⇒ 建议另立 change（换模型或换 provider）。
2. **`docs/MULTI-AGENT-DESIGN.md` 的模型归属表漂移**：文档仍写 `opencode/deepseek-v4.1-flash-free`，配置已是 `opencode-go/deepseek-v4.1-flash`。⇒ 另立 change 同步（critic 第 1 轮 SHOULD_FIX，与本 change 无关）。

## 6. 已用轮次

- critic 评审：**1 轮**（治理面行预算 1 轮）→ `APPROVE_WITH_CONDITIONS`，4 条 SHOULD_FIX 已全部处置并回归。
- verifier（builder 角色内建）：**1 轮**（本报告）。
- 未使用 oracle（本次为 builder 交付的机制类改动，非 architect 产出的架构决策；若后续要把它升格为 ADR 或推广到其它 agent，需补 oracle → critic）。
