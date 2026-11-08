# front + delegate 测试文档

> 面向**改这套代码的人**。用户视角见 [front-delegate-usage.md](./front-delegate-usage.md)。

## 1. 测试分三层

| 层 | 跑在哪 | 依赖真实 opencode 运行时？ | 覆盖什么 | 产物 |
|---|---|---|---|---|
| **单元测试** | `bun test tests/` | ❌ | 纯逻辑 + 工具契约 + 假 ctx 端到端 | 本仓库 `tests/` |
| **运行时验证** | 真实 `opencode run` + 真实服务 | ✅ | 门控生效、真实 session 驱动、权限层实际裁决 | 探针/验收报告 |
| **验收判定** | 人工按 ADR 判据逐条跑 | ✅ | ADR 的 18 条 Verification | `.rddf/reviews/front-agent-redesign-acceptance.md` |

**为什么分三层**：opencode 的插件 API 只有在宿主里才有意义（`ctx.session.*`、`ctx.tool.transform`、
权限判定都在宿主进程内）。所以单元测试用**假 ctx**驱动工具逻辑，宿主接线（插件能否加载、门控是否生效、
真实 session 是否被驱动）只能靠运行时验证补。**两层都要做，不能互相替代。**

## 2. 怎么跑

```bash
cd ~/.config/opencode

bun test tests/                          # 全部（当前 157 项，约 4 秒）
bun test tests/delegate-core.test.ts     # 纯逻辑（76 项）
bun test tests/delegate-tool.test.ts     # 假 ctx 端到端（35 项）
bun test tests/config-guards.test.ts     # 守卫漂移检测（13 项）
bun test tests/model-fallback-core.test.ts # 模型降级链内核（33 项）

npm test                                 # 等价（package.json 被 .gitignore 忽略，仅本地便利）
```

**入库的规范命令是 `bun test tests/`**（`package.json` 不入库）。

要求：bun ≥ 1.3（本机 1.3.14）。不需要 opencode 服务在跑——单元测试完全离线。

## 3. 目录与职责

```
lib/delegate-core.ts          纯逻辑内核 + 工具定义工厂（无 opencode 宿主依赖）
plugins/delegate.ts           插件壳：只把工具注册进 opencode 的工具表（11 行）
tests/delegate-core.test.ts   纯逻辑单元测试
tests/delegate-tool.test.ts   假 ctx 端到端单元测试
tests/config-guards.test.ts   守卫漂移检测（配置 == scripts/agent-guard-rules.ts 真源）
tests/model-fallback-core.test.ts 模型降级链内核单元测试
tests/fixtures/               真实会话回归夹具（如 no-work 形状）
tests/README.md               本目录的说明（覆盖范围、fixture 约定、与真实运行时的关系）
```

**架构纪律**：任何**可测的逻辑**都必须落在 `lib/delegate-core.ts`；`plugins/delegate.ts` 里只允许出现
"宿主接线"（注册工具、调用 `ctx.*`）。判据很简单：

> 宿主接线之外的一切，都应该能在 `bun test` 下被断言。

`plugins/` 目录下的每个 `.ts` 都会被 opencode 当插件加载，所以**核心逻辑不能放在 `plugins/` 里**
（会被当成插件入口加载失败）。这也是当初拆出 `lib/` 的原因。

## 4. 覆盖矩阵

| 功能 | 单元测试 | 运行时验证 | 判据来源 |
|---|---|---|---|
| 工具门控（仅 front 可见）| ✗（属宿主行为）| ✅ `opencode debug agents` 看权限矩阵 | ADR D6 / AC1 |
| 工具契约（权限 action、输入 schema）| ✅ `delegate-tool` | ✅ `opencode plugin list` | ADR D2 |
| brief 六必填校验 | ✅ `core` | ✅ 真实委托 | ADR D3 / AC1 |
| grants 白名单（question/form/edit/write 禁）| ✅ `core` + `tool` | ✅ 实跑非法 grant 被拒 | ADR D5 / AC8 |
| session 权限定型 + **规则顺序即策略** | ✅ `core`（顺序断言）| ✅ 真实权限裁决 | ADR D5 |
| scope → edit 规则（强制点）| ✅ `core` | ✅ 真实越界写入被拒 | ADR D3 / AC9 |
| 越界检测（前后差集）| ✅ `core` + `tool` | ✅ | ADR D3 / AC10 |
| 阻断提取（两种形态）| ✅ `core` | ✅ 实跑被拒后回传 | ADR D5.2 / AC7 |
| `unknown`（没有新活动）| ✗（宿主时间线行为）| ⚠ 未实测 | ADR D2 / AC7 |
| `busy`（in-flight 不排队）| ✅ `tool`（两段式）| ✅ 实跑 sleep 中续接 | ADR D2 / AC11 |
| 续接不新建 session | ✅ `tool` | ✅ 实跑 | ADR D2 / AC6 |
| 未登记 id / canonical_root 不匹配被拒 | ✅（未登记）/ ✗（root 不匹配）| ⚠ 未实测 | ADR D2 |
| pair-v2 + role.json 分区登记 | ✅ `core` | ✅ 实跑（工程 session 拿到 builder）| ADR D6 / AC11 |
| 目录锁并发无丢失更新 | ✅ `core` | ⚠ 未实测 | ADR D6 / AC11 |
| 工程 session 真实驱动（写文件、取回结果）| ✗（假 ctx）| ✅ 实跑 | ADR D2 / AC5 |
| front 四分类路由 | ✗（模型行为）| ✅ 实跑（理解性/实施性各一次）| ADR D1 / AC4 |
| front shell 白名单 / 禁绝对路径 | ✗（宿主权限）| ✅ 实跑 5 个守卫用例 | ADR D4 / AC2,AC3 |
| front transcript 无凭证 | ✗ | ✅ 扫描 front 会话消息 | ADR D6 / AC16 |

## 5. fixture 约定

被委托的**示例工程 = `rdd-workflow-e2e`**，实际路径 `/workspace/main/rdd-workflow-e2e`
（注意：`/workspace/project/rdd-workflow-e2e` 不存在）。

fixture 构造（`tests/delegate-tool.test.ts::fixtureProject`）：

1. 复制其**工作树**到临时目录，**排除 `.git`**；
2. 重新 `git init` + `git add -A` + 一次 commit。

为什么排除 `.git`：git 对象文件是只读（444），复制后不可写 → `cpSync` 会以 EACCES 失败。
为什么重新 init：测试需要**可提交、可算 diff**的工程；原仓库的 `.git` 复制过来也没意义。

为什么用临时副本而不是直接用真仓库：测试会写文件（scope 内/外的越界用例），**不能污染示例仓库的 git 状态**。
每个测试用例用独立目录（`rdd-workflow-e2e-N`），避免第二次调用时 `git commit` 报
"nothing to commit"。

要换示例工程：改 `tests/delegate-tool.test.ts` 顶部的 `EXAMPLE_PROJECT` 常量即可。

## 6. 假 ctx 契约

`tests/delegate-tool.test.ts::createFakeCtx` 实现工具用到的全部宿主能力：

| 方法 | 语义（必须与真实宿主一致，否则测试结论不可信） |
|---|---|
| `session.create({location, agent, title, permissions})` | 返回 `{id, agent, location:{directory}}`；**记录 permissions**（断言权限定型的唯一入口） |
| `session.prompt({sessionID, text})` | 记录简报；追加 user/assistant 消息；更新 `time.idle`、`outcome` |
| `session.wait({sessionID})` | 立即 resolve（真实实现会等到运行结束） |
| `session.get({sessionID})` | 返回 `{id, agent, permissions, outcome, time:{idle, updated}}` |
| `session.context({sessionID})` | 返回消息数组（`content[]` 里含 `type:"tool"` 的 part 是阻断提取的输入） |
| `session.remove({sessionID})` | 标记删除 |

两个容易写错、但会直接改变测试结论的语义：

- **空闲判据**：真实宿主里 `time.idle` 是"最后一次运行结束的时刻"，`time.updated` 是"最后更新时刻"。
  工具判定 in-flight 用的是「**最后一条消息的创建时间 > 最后空闲时间**」，不是 `updated > idle`
  ——首次运行中的 session 从未 idle 过（idle=0），用后者会漏判 busy。
- **新活动判据**：工具用「最后一条消息 id 变了 或 消息数变了」判断有没有新活动，
  然后才采信 `outcome`（`outcome` 是"上一次已结束 run"的结果，可能是陈旧值）。

## 7. 写新测试

### 纯逻辑测试（`delegate-core.test.ts`）

```ts
import { describe, expect, test } from "bun:test"
import { scopeEditRules } from "../lib/delegate-core.ts"

describe("scopeEditRules", () => {
  test("文件型 scope 同时产出 x 与 x/*", () => {
    expect(scopeEditRules("/tmp/proj", ["a.txt"]).map((r) => r.resource)).toEqual(["*", "a.txt", "a.txt/*"])
  })
})
```

### 端到端测试（`delegate-tool.test.ts`）

```ts
const project = fixtureProject()                       // rdd-workflow-e2e 的临时副本
const { ctx, calls, sessions } = createFakeCtx({        // 假 ctx
  onPrompt: (session) => writeFileSync(path.join(project, "tests/x.py"), "# ok\n"),
})
const summary = await runDelegate(ctx, { ...BASE, project_dir: project })
expect(summary.outcome).toBe("succeeded")
expect(calls.create).toBe(1)
```

断言优先级：**先断言"发生了什么"（outcome / changed_files / out_of_scope_files），
再断言"为什么"（permissions 的内容与顺序）**。

### 加一条新功能时的检查清单

1. 逻辑写在 `lib/delegate-core.ts`（不要写进 `plugins/`）。
2. 在 `delegate-core.test.ts` 加纯逻辑断言。
3. 若是宿主行为（权限、时间线、真实 session），**不要**在单元测试里假装能测——
   写进运行时验证清单（§8），在真实环境跑一次并记录到验收报告。
4. 改完跑 `bun test tests/`，再跑一次**真实运行时端到端**（见 §8）。

## 8. 运行时验证清单（单元测试覆盖不到的部分）

改 `plugins/delegate.ts`、改 `opencode.jsonc` 的权限块、改 `prompts/front.md` 之后**必须**回归：

```bash
# 0. 重启服务（插件/配置/prompt 内容都被服务缓存）
opencode service restart

# 1. 插件加载 + 权限矩阵
opencode plugin list
opencode debug agents | grep -A3 '"name": "front"'

# 2. 真实委托（front → delegate → 工程 session → 真实写文件）
opencode run --agent front "在 /tmp/opencode/engproj 里新建 smoke.txt，内容 ok，别的不用动。"
cat /tmp/opencode/engproj/smoke.txt

# 3. 理解性路由（不应建工程 session）
opencode run --agent front "帮我看看 /workspace/main/rdd-workflow/tests/unit 下有多少测试文件"

# 4. 门控：非 front 看不到 delegate
opencode run --agent plan "列出你可用的工具名，若有 delegate 请说明"
```

**特别注意**：`opencode run --agent X` 会**延续同 agent 的最近会话**。做独立探针时用
`opencode run --session <new-id> --agent front ...` 隔离，否则模型会复用上一轮上下文里的 id。

## 9. 重构纪律

| 改动 | 必须做的回归 |
|---|---|
| 改 `lib/delegate-core.ts` 的逻辑 | `bun test tests/`（逻辑）+ 真实委托一次（接线） |
| 改 `plugins/delegate.ts`（接线）| 真实委托一次（单元测试覆盖不到宿主行为） |
| 改 `opencode.jsonc` 的 front 权限块 | `opencode debug agents` 看矩阵 + 3 条越权用例实测被拒 |
| 改 `prompts/front.md` | 理解性 + 实施性各跑一次（换 prompt **路径**或重启服务，否则内容不生效） |
| 改 `delegate` 的输入字段 | 同步 `tests/delegate-core.test.ts` 的 schema 断言 + `prompts/front.md` 的 brief 表 |

## 10. CI 接入建议

```yaml
# .github/workflows/test.yml
- uses: oven-sh/setup-bun@v2
  with: { bun-version: "1.3.14" }
- run: bun test tests/
```

单元测试**不需要** opencode 服务、不需要模型、不需要网络 → CI 里零依赖。
运行时验证（§8）需要模型与本地服务，留在本地/人工环节，不进 CI。

## 11. 测试挂了的常见原因

| 症状 | 原因 |
|---|---|
| `Export named 'xxx' not found in module '../lib/delegate-core.ts'` | core 里漏了 `export` |
| `SyntaxError: Unexpected end of file` | 抽段/拼接文件时括号配平出错 → `bun build lib/delegate-core.ts --target=bun --outfile /dev/null` 先验语法 |
| `EACCES ... .git/objects/...` | fixture 复制了 `.git` → 只复制工作树 |
| `git commit ... nothing to commit` | fixture 目录被复用 → 每个用例独立目录 |
| `test.for is not a function` | bun 1.3 无 `test.for` → 用普通 `for` 循环 |
| 断言失败但"代码看起来对" | 假 ctx 的语义与真实宿主不一致 → 对照 §6 逐条核 |
| 改了 core 但插件行为没变 | 服务缓存了插件模块 → `opencode service restart` |

## 12. 相关文档

| 文档 | 内容 |
|---|---|
| [tests/README.md](../tests/README.md) | 本目录的速查版（覆盖范围、fixture、与真实运行时的关系） |
| [front-delegate-usage.md](./front-delegate-usage.md) | 使用手册 |
| [front-delegate-architecture.md](./front-delegate-architecture.md) | 开发者架构文档（扩展前必读）|
| [dual-session-delegation.md](./dual-session-delegation.md) | 架构与排障 |
| 探针报告 `.rddf/reviews/front-agent-redesign-p0-probes.md` | 4 项前置探针 + 5 项计划外发现（含代答的 location 边界） |
| 验收报告 `.rddf/reviews/front-agent-redesign-acceptance.md` | 逐条判定（PASS/PARTIAL/未测）与复现命令 |
| ADR `.rddf/state/adr-front-agent-redesign.md` | 决策与取舍 |
