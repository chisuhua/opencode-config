# model-fallback 使用手册

> 面向**使用者**（不是实现者）。要看设计决策与选型表看 [MULTI-AGENT-DESIGN.md §5.4](./MULTI-AGENT-DESIGN.md#54-模型降级链model-fallback-插件)；要看为什么这么做看 [CHANGELOG v2.4](./CHANGELOG.md)；要看验收证据看 [model-fallback-verify.md](../.rddf/reviews/model-fallback-verify.md)。

## 1. 这套东西是什么

OpenCode v2.2.5 **没有**原生的"模型链"配置：`agent.model` 是单值，schema 里没有 `fallback` 字段。所以降级是一个本地插件实现的：

```
build agent ──请求模型 X──▶ X 挂了（401 / 403 / 5xx / 429 …）
                                    │
                                    ▼
              plugins/model-fallback.ts 挂在 session.retry 钩子上
                                    │
                     判定「原地重试 / 换下一个模型 / 放弃」
                                    │
                                    ▼
              session.switchModel(下一个) ──▶ 请求继续，任务不中断
```

| 性质 | 含义 |
|---|---|
| **只降级"模型/服务不可用"** | 内容策略拒绝、上下文超长、参数错误一律**不换模型** —— 换弱模型重试这些既无意义又有风险 |
| **链头 = 你正在用的模型** | 失败时正在用的那个模型就是链首；配置文件里写的是它后面的后备候选 |
| **不是静默的** | 切换会触发 TUI 模型指示器变化，并落一行日志 |
| **链耗尽就停** | 所有候选都不可用时直接报错给用户，不无限循环 |

## 2. 快速上手

### 默认模型（链头）改哪

在 `opencode.jsonc` 里改对应 agent 的 `model`：

```jsonc
{
  "agent": {
    "build": { "model": "minimax-cn/MiniMax-M3.1-Flash" }   // ← build 的默认模型 = 降级链的链头
  }
}
```

（示例是当前配置的实际值；你自己的链头以 `opencode debug agents` 里 build 的 model 为准。）

### 后备模型（候选）改哪

在 `~/.config/opencode/model-fallback.json` 里改 `chains`：

```json
{
  "chains": {
    "build": [
      { "providerID": "commandcode", "id": "deepseek/deepseek-v4.1-flash" },
      { "providerID": "minimax-cn",  "id": "MiniMax-M3.1-Flash" },
      { "providerID": "opencode-go", "id": "deepseek-v4.1-flash" }
    ]
  }
}
```

顺序即优先级，**从链首往后**逐个试。上例里 build 实际生效的链是：

```
minimax-cn/MiniMax-M3.1-Flash（链头 = build 的默认模型）
  → commandcode/deepseek/deepseek-v4.1-flash
  → opencode-go/deepseek-v4.1-flash
```

—— 链头是**自动补在第一位的**，候选里重复写了它也不会出现两次。`providerID` / `id` 就是模型 id 本身（用 `opencode models` 查全量），不是配置里的 `providers` 段写法。

### 改完必须重启

插件在 **server 启动时**加载，常驻 server 不会热加载：

```bash
opencode service restart
```

没重启就改配置 = 没改。

## 3. 降级行为

### 什么会换模型、什么不会

| 错误 | 判定 | 动作 |
|---|---|---|
| `401` / `403` / `404`、文案点名模型（`model not found` 等） | 模型不可用 | **立即换**下一个候选 |
| 订阅额度不足 / 余额不足（`subscription quota insufficient`、订阅额度不足） | 硬失败 | **立即换**（原地等也等不来） |
| `5xx` / `408` / 网络类（timeout、connection reset…） | 瞬时 | 先在**原模型**退避重试 2 次，仍失败再换 |
| `429` / `rate limit` | 限流 | 先按上游给的 `retryAfterMs` **原地等**，等不了再换（默认等 2 轮） |
| 内容策略拒绝（`content policy` / `forbidden by policy`） | 不降级 | **不换** —— 直接把错误报给你 |
| 上下文超限（`context length` / `token limit` / `max_tokens`） | 不降级 | **不换** —— 该压缩上下文，不是模型坏了 |
| `400` / `413` / `422`（参数、请求体、工具 schema 等） | 不降级 | **不换** |
| 认不出来的错误 | 不降级 | **不换** |

### 换到哪里、还回不回来

- 按候选顺序往后跳，**跳过冷却中的模型**（失败的模型冷却 5 分钟，冷却是**进程级**的：provider 挂了就是挂了，所有会话都跳它）。
- 走到链尾还能**绕回链首**（如果链首的冷却已过、它已恢复）。
- 一轮用户输入内的换链次数有上限（链长 × 2），超了直接放弃。
- **降级是会话级粘滞的**：切到哪个模型，本会话后续轮次继续用它，直到你 `/model` 改回或重开会话。

### 放弃时是什么样

链上所有候选都不可用 → 插件不再重试，**原始错误直接报给你**（例如 `订阅额度不足或未配置订阅: subscription quota insufficient`），不会变成一句含糊的"出错了"。

## 4. 配置项逐条

文件：`~/.config/opencode/model-fallback.json`（仓库根目录下的同名文件）。想放到别处：`MODEL_FALLBACK_CONFIG=/path/to.json`。

### `chains` —— 各 agent 的后备候选

```json
{ "chains": { "<agent 名>": [ { "providerID": "...", "id": "..." }, ... ] } }
```

- **键是 agent 的 id（小写）**：`build` / `explore` / `librarian` / `oracle` / `metis` / `critic`…（不是 display name `Build`）。用 `opencode debug agents` 输出里的 id 列核对。
- **候选里不用写链头**。链头 = 失败时正在用的模型，会自动补在第一位并去重。所以你只写"后备"即可。
- 想换掉**默认模型** → 改 `opencode.jsonc` 的 `agent.<名>.model`，别在这里写链头（写了也只是去重后仍排在第二位）。
- 当前各 agent 的默认模型见 `opencode debug agents`（输出里的 `model` 字段）—— **以它为准**，别照抄配置文件某一时点的内容。
- **删掉这个文件 = 退回内置默认**：内置默认只有 `build` 一个 agent（4 节候选，含 `openstarry`），其余 agent 会静默失去降级能力。

### `policy` —— 策略参数

| 键 | 默认 | 调大意味着 | 调小意味着 |
|---|---|---|---|
| `maxSameModelRetries` | 2 | 瞬时错误（5xx/网络）在原模型上多扛几次才换 | 更早换模型（更快换到备用，但更浪费请求） |
| `maxRateLimitWaits` | 2 | 429 时多等几轮再换 | 更快换模型（但可能撞上同样限流的其他 provider） |
| `baseDelayMs` | 500 | 退避起点更保守 | 更激进 |
| `maxDelayMs` | 15000 | 允许等更久（超过就不等了，改换模型） | 更早放弃等待 |
| `cooldownMs` | 300000 | 失败模型被跳得更久 | 更早重新尝试它 |

### `notify` —— 要不要在会话里说话

| 值 | 行为 |
|---|---|
| `"log"`（默认） | 只写日志。会话里能看到的只有 **TUI 模型指示器的变化** |
| `"synthetic"` | 额外在会话里发一条降级通知。**代价**：该消息会被当作新输入，**多触发一轮模型调用**，并把本轮降级状态重置 |

## 5. 排障

### 日志在哪

`~/.local/share/opencode/model-fallback.log`。两类记录：

```
2026-11-08T08:41:33.522Z loaded; config=/home/ubuntu/.config/opencode/model-fallback.json; agents=build,explore,...; notify=log
2026-11-08T08:41:47.599Z build: openstarry/deepseek-v4.1-flash -> commandcode/deepseek/deepseek-v4.1-flash; provider.auth/403: 订阅额度不足...
```

- `loaded; …` —— **启动记录**，每个 server 启动时写一次。它证明插件已加载、读的是哪个配置文件。
- `build: <原模型> -> <新模型>; <错误类型>/<状态码>: <消息>` —— 一次换链。
- `build: give up (<原因>); …` —— 链耗尽，放弃重试。

**原地重试 / 原地等待不写日志**（只有换链与放弃才写）。所以"日志里什么都没有"有几种可能，按下面顺序排查。

### "没有降级"怎么排查

| 现象 | 原因 | 怎么确认 |
|---|---|---|
| 日志里连 `loaded;` 都没有 | 插件没加载：改了配置没重启 / 插件文件不在 `plugins/` 目录 | `opencode plugin list` 里有没有 `model-fallback`；有就 `opencode service restart` |
| 有 `loaded;` 但没有换链记录 | 错误属**不降级类**（内容策略 / 上下文超限 / 400 / 413 / 422 / 认不出来的错误） | 看报错原文，对照 §3 的表 |
| 有 `loaded;` 但没有换链记录 | 链上没有第二个候选（链长 1） | 对照配置文件里 `chains.<agent>` 的候选数 |
| 报的是 `Model unavailable: provider/model` | 失败发生在**模型解析阶段**，早于 retry 钩子，插件接不到 | 重新 `opencode service restart` 让 catalog 重新加载；这不是降级能覆盖的场景 |
| 反复切来切去 | 该 provider 真的在抖（5xx 反复），或多个 provider 同时在限流 | 看日志里每次的错误类型；把不稳的候选从 `chains` 里去掉 |
| 切了之后没切回来 | 降级是会话级粘滞的 | `/model` 手动切回，或重开会话 |

### 临时停用降级

| 范围 | 做法 | 代价 |
|---|---|---|
| **全局** | 把 `plugins/model-fallback.ts` 移走（改名或移到别处）→ 插件不再加载 | 需要 `opencode service restart`；恢复后再移回 |
| **单个 agent** | 把 `chains.<agent>` 配成**该 agent 正在用的那一个模型** → 链长退化为 1 → 不再降级 | 前提是那个 agent 一直用这个模型；你 `/model` 换过模型后链长又会变回 2，降级会重新生效 |
| ~~某个 agent 置空~~ | ~~`"chains": { "build": [] }`~~ | **不管用**：空数组会被忽略并回落到内置默认链（实测仍发生切换）。别用这个 |

## 6. 已知边界

1. **解析阶段的模型不可用接不住**：`ModelUnavailableError`（模型在 catalog 里解析不出来）发生在 retry 钩子之前，插件无从介入。真实会话里"模型不可用"通常表现为请求级 `401/403/5xx`，这些是能接住的。
2. **降级是会话级粘滞的**，不会自动切回原模型。
3. **`decision.delay` 的单位、`variant` 透传是否跨轮沿用、`give-up` 后错误是否一定直接暴露** —— 三项构造困难，尚未专项实测（单测覆盖了决策层，宿主层行为属推断）。
4. **没有显式的开关字段**：想停用得靠"移走插件文件"或"把链配成长度 1"，见 §5。
5. **`safety` 词条偏宽**：provider 若把瞬时错误写成 `safety check timeout` 之类，会被判成不降级（少降级一次，方向安全）。

## 7. 相关文件

| 文件 | 作用 |
|---|---|
| `plugins/model-fallback.ts` | 宿主接线（retry / prompt 钩子、switchModel、日志） |
| `lib/model-fallback-core.ts` | 纯逻辑（错误分类、链推进、冷却、组链、配置解析） |
| `model-fallback.json` | 降级链与策略配置 |
| `tests/model-fallback-core.test.ts` | 单测（`bun test tests/model-fallback-core.test.ts`） |
| `.rddf/reviews/model-fallback-verify.md` | 验收报告（判据 + 证据 + 已知边界） |
