# design — subagent-input-contract

> 来源：`openspec/changes/subagent-input-contract/proposal.md`（AC1–AC11）。

## 1. 问题定位：约束点在哪

父模型生成 `subagent` 调用时的**输入上下文** = 父会话那次请求的全部内容：

```
system[0] = prompts/<父agent>.md      ← 父的 SOP 在这里
system[1] = core/* 指令层（AGENTS.md / skill / date / env）
messages  = 父会话历史
tools     = 含 subagent 工具（description 里追加了 Available subagents 目录）
```

⇒ **子 agent 的 system prompt 不在这个上下文里**（它在子会话里），**所以约束"父写什么"的唯一入口是父侧的可编程点**。

可编程点按强度排序（宿主契约 `packages/core/src/plugin/hooks.ts` 的 `Failures` 类型是硬边界）：

| 机制 | 时点 | 能否失败 | 用途 |
|---|---|---|---|
| `session.hook("context")` | 请求前 | ❌ | **告知**判据（L3） |
| `tool.hook("execute.before")` | 执行前 | ✅ | **硬门**（L1） |
| `session.hook("prompt")` | 落库前 | ❌ | **检测**（L2） |

⇒ 结论：**硬门只能落在 L1**；L2 只能检出（`command(subagent:true)` 这类不经 tool 的路径因此不可拦，只能审计）。

## 2. 关键取舍

### 取舍 1：自由文本 vs 结构化字段（L0）

| 方案 | 优点 | 代价 | 结论 |
|---|---|---|---|
| A. 结构化字段（替换内置工具或新增工具） | 生成即受约束 | 要重写深度检查 / 权限断言 / 前后台 job / 续接 | **二期** |
| B. 自由文本 + 拒绝重试（L1） | 不动内置行为 | 模型多烧一轮 token | **本期** |

用户已选定 B。理由：B 能达到"不合规的调用根本执行不了"这一硬保证，而 A 的增量收益（模型被迫逐字段表态）B 通过"拒绝→重试"也能逼近。

### 取舍 2：豁免的判据（误伤 vs 漏放）

初版：关键词命中即豁免。**实测反例**：`第 2 轮` / `closure` 在真实 diff、changes_summary 里也会偶发命中 ⇒ 一次误豁免 + 状态继承 ⇒ 整个父会话后续 30 分钟进复审模式。

终版（五重收窄）：

```
① 关键词命中            （"复审 / 第 N 轮 / 闭合证据 / closure"）
② 结构前置条件          （缺失小节 ≥ ceil(7/2) = 4 才可能豁免）
③ 任务陈述区窗口        （关键词只认 prompt 开头 400 字符）
④ 状态继承              （继承"上一轮是复审模式"，不是"上一轮合规"）
⑤ 继承需自证            （本轮 prompt 自己也要引用上一轮）
⑥ 续接轮不清零          （isResume 既不是新评审，也不该重置复审模式）
```

②④ 是 critic 第 1 轮 SHOULD_FIX 的直接产物（见 `.rddf/reviews/subagent-contract-verify.md`）。

③⑤ 是**豁免误命中抽样**的产物（tasks 7.2，见 `.rddf/reviews/subagent-contract-exemption-sampling.md`）：
真实库 90 条豁免全量复核，误命中 12 条 = 13.3% > 10% 阈值 —— 3 条是关键词落在后半段输出模板
（"不需要复审代码" / "会被 critic 复审时升级为 BLOCKER"），9 条是**跨对象继承**（同一父会话连着审
ADR-090/091/092、连着审"治理面 MD §2.8 批"与"kimi-code 批"）。收紧依据：真豁免的命中位置全在
47–231 字符，误命中全在 1194–5377 字符。收紧后 110 违规 / 78 豁免，真豁免零误伤。

### 取舍 3：默认强度

默认 **warn**（只记录 + 审计），逐 agent 切 enforce。理由：历史数据里 critic 的 7 字段合规率约 71%（330 次调用 / 97 次违规），直接 enforce 会打断约 1/4 的既有评审流；warn 期用审计数据看趋势。

## 3. 状态与生命周期

```
父会话 P + agent A ──► state[P::A] = { reviewRound: boolean, at: timestamp }
```

- **写**：合规且非豁免 → `reviewRound=false`（新一轮评审）；豁免 → `reviewRound=true`（复审链）；违规 → 不动
- **读**：仅当 `now - at ≤ 30min`（`REVIEW_ROUND_TTL_MS`）才继承
- **清理**：`pruneState()` 节流调用（每 50 次调用清一次过期项）⇒ 长驻 server 下 Map 不无限增长

## 4. 规则真源与防漂移

| 表述 | 位置 | 漂移检测 |
|---|---|---|
| 机器可读 | `lib/subagent-contract-core.ts` 的 `CONTRACTS` | —— |
| 人类可读（critic 侧） | `prompts/critic.md` 的协作接口段 | `tests/config-guards.test.ts` L4：双向集合相等 |
| 人类可读（build 侧） | `prompts/build.md` 的 7 字段 SOP | 同上：每个字段名必须出现 |
| 宿主前提 | `packages/core/src/plugin/hooks.ts` 的 `Failures` | `scripts/check-upstream-anchors.sh` A13 / A13b |

⇒ **规则只有一份**（core 表）；配置文件 `subagent-contract.json` 只覆盖**模式/开关/字段覆盖**，不重复规则内容。

## 5. 已知边界（不掩盖）

1. **语义不可判定** —— 只判结构；"intent 写得对不对"没有任何自动手段。
2. **L2 不可拦** —— `command(subagent:true)` 的输入只能被检出与审计。
3. **关键词是启发式** —— 豁免仍可能被误命中（② 的阈值把误命中限制在"缺≥4个字段"且命中关键词的窄交集；③ 的窗口把"后文模板里的复审"排除）。
4. **任务陈述区窗口是启发式** —— 真复审轮若把"上一轮"写在开头 400 字符之后，会被误判为新评审（代价：多报一次违规；反向误放行代价更大）。
5. **继承无对象级校验** —— 只要求"引用上一轮"，不校验"上一轮的对象 = 本轮的对象"；连续审两个对象且第二个明写"上一轮"仍会被继承放行（当前语料 0 例）。
6. **状态是进程内的** —— 服务重启后复审链继承失效（退回关键词豁免）。
7. **prompt 长度下限对新评审是硬约束** —— 续接轮除外；新子会话没有历史可依赖，短 prompt 确实不可用。
