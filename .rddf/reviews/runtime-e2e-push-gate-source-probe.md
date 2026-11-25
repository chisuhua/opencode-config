# B2 源码先行探针：`tool.execute.before` 与 permission 的先后顺序

> 触发：路线图 §7.2 的 B2 最终推荐「**源码先行 → 窄探针**」。本文件是**源码层证据**（0 额度），不是运行时结论。
> 版本锚：`/workspace/main/opencode` @ `9cd59d91`（分支 `local/build`，2026-11-24，**工作区干净**）；本机二进制 `opencode v0.0.0-local-202611241340`（2026-11-24 构建）⇒ 源码树与二进制同批。

## 1. 被问的问题

`lib/push-gate.ts:4-6` 登记的未知：「**Allow always 持久化** vs config deny 的优先级未知」；以及前置探针的另一半：「permission 评估 与 `tool.execute.before` 钩子的先后顺序」。

## 2. 调用链（源码逐段）

| # | 位置 | 事实 |
|---|---|---|
| 1 | `packages/core/src/tool.ts:390` | 工具调用入口先 `const event = yield* beforeExecute(input.call.name, …)` |
| 2 | `packages/core/src/tool.ts:162-172` | `beforeExecute` = `hooks.trigger("tool", "execute.before", …)` |
| 3 | `packages/core/src/tool.ts:417` | 之后才 `return yield* executeTool(tool, name, event.input, context)` |
| 4 | `packages/core/src/tool.ts:185-186` | `executeTool` 里 `yield* execute(tool, input, context)` |
| 5 | `packages/core/src/tool/runtime.ts:40` / `:49` | `execute` = 解码后 `yield* tool.execute(decoded, context)`（**无 permission**） |
| 6 | `packages/core/src/tool/plugin/shell.ts:433`（`execute`）→ `:356`（`permission.assert`） | shell 工具的 `execute` 内，`prepare(...)` 里才 `permission.assert({...})` |
| 7 | `packages/core/src/plugin/hooks.ts:23` | 注释明确：「Only **tool execute.before** may fail: a `Tool.Error` rejects the call **before it runs**」 |

⇒ **顺序 = 插件钩子在前，permission 在后**。命令级 permission（`ShellPermissions.requests` + `permission.assert`）发生在 shell 工具的 `execute` 内部、`prepare` 阶段；而钩子在该工具 `execute` 之前触发。

## 3. 由此得出的两个结论

1. **`tool.execute.before` 能拦到 `git push`**（在 permission 决策之前），且**可以让调用失败**（`Tool.Error` 直接拒绝，命令不运行）⇒ push-gate 的介入点**结构上成立**。
2. **Allow-always 不能绕过 push-gate**：持久化授权只影响 `permission.assert`（第 6 步）的结果，而第 1–3 步的钩子在它**之前**且**无条件**执行 ⇒ 无论会话里是否已持久化「Allow always」，插件都会先看到命令。⇒ `lib/push-gate.ts:4-6` 登记的未知**在源码层已有答案**（插件在上游，不可被绕过）。

## 4. 残留（为什么还需要运行时确认）

- **二进制与源码树的等价性未做密码学证明**：只对齐了日期与工作区干净度（见版本锚）。若本地二进制含未提交改动，结论可能偏。
- **插件是否真的被加载**（配置里 `plugins` 挂载成功）是运行时事实，源码读不出。
- **`tool.execute.before` 的失败传播形态**（究竟是 `Tool.Error` 还是别的）在本机版本上未实测 —— 影响用例断言该匹配什么文案。
  ⇒ 因此 B2 用例的**首次 `E2E_REAL_RUNTIME=1` 真跑**仍需执行，作为运行时确认。

## 5. 对 B2 计划的影响

| 计划项 | 源码核实后的状态 |
|---|---|
| 「钩子先 ⇒ 写降级用例」 | ✅ 条件成立 ⇒ **可以写**（目标仍是「证明插件挂在 push 路径上」） |
| `PUSH-GATE-ALLOW-ALWAYS-WORLD-UNVERIFIED` token | **可降级但暂不撤**：源码表明 Allow-always 不能绕过钩子；撤除应以运行时确认为准（本文件只是源码证据，不是判定） |
| 「permission 先 / 结构性不可达」分支 | ❌ 源码层已排除（不是本分支） |
| 形状 `-uf` | 仍须实测（源码不涉及 glob 匹配语义） |

## 6. 复跑方式（只读，0 额度）

```bash
cd /workspace/main/opencode && git log -1 --format='%h %ad' --date=short   # 9cd59d91 2026-11-24
sed -n '390p;417p' packages/core/src/tool.ts
sed -n '40p;49p' packages/core/src/tool/runtime.ts
sed -n '354,357p' packages/core/src/tool/plugin/shell.ts
sed -n '23p' packages/core/src/plugin/hooks.ts
```
