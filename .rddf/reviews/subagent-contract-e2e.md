# subagent 输入契约 —— 端到端测试记录

> 对应：`openspec/changes/subagent-input-contract/`（AC3–AC7、AC9、AC11 的**运行时**面）
> 位置：`/workspace/main/rdd-workflow-e2e/tests/integration/test_subagent_contract_runtime.bats`
> 日期：2026-11-12
> 结论：**11 个场景全部可跑通**（其中 SC-7 依赖 provider 额度，额度不足时显式 skip 而非放过）。

---

## 1. 为什么需要它（单测覆盖不到什么）

单测（`bats` 之外的 `bun test tests/`，357 例）覆盖的是**纯逻辑**：小节识别、豁免语义、状态继承、三个钩子处理函数。
以下事实**只有真实运行时能证明**：

| 事实 | 单测能否证明 | 端到端如何证明 |
|---|---|---|
| 钩子真的挂上了（`session.hook("context"/"prompt")`、`tool.hook("execute.before")`） | ❌ | L3/L1/L2 三类日志记录真的出现 |
| L1 抛错被宿主包成受控 `Tool.Error`、父模型能同回合看到并重试 | ❌ | NDJSON 里 `subagent` 工具调用 `status=error` 且 `error` 文本是契约文案 |
| 被拒时**没有**创建子会话 | ❌ | 隔离 DB 里该父会话没有子会话行 |
| 放行时子会话真的建出来了 | ❌ | 同上，有子会话行 |
| 配置 `mode` 改一次就即时生效（每次调用重读） | 部分 | 同一文件内 warn → enforce 切换后行为随之改变 |
| 审计 CLI 对真实会话库给出结论 | ❌ | `--strict` exit 1 / exit 0 与 `--json` 形状 |

## 2. 隔离设计（hermetic HOME）

- `HOME` → `.tmp-sc/home`：契约配置、契约日志、会话 DB 全部隔离，不碰本机真实运行时。
- 配置目录：**符号链接农场**指向真实 `$SC_SRC`（默认 `~/.config/opencode`），只有 `subagent-contract.json` 是真文件
  ⇒ 测的是**真实安装态的插件与内核**，但配置写入只落在临时副本。
- 凭据：`auth.json` / `account.json` 链接过来（否则 provider 401）。
- 进程：`opencode run --standalone` 会留下 `serve` / `pty` 守护进程并占住临时 HOME ⇒ 按 `/proc/<pid>/environ`
  的 `OPENCODE_DB` 前缀精确清理（不误杀本机真实服务）。

## 3. 场景矩阵

| 用例 | 场景 | 关键断言 |
|---|---|---|
| SC-1 | L3 注入 | 日志有 `gate=L3, event=injected`（每进程一条） |
| SC-2 | L1 enforce 拒绝 | 工具 `status=error`；文案含"缺少小节"+"不要原样重试"；**无子会话** |
| SC-3 | L1 warn 只记录 + L2 兜底 | `gate=L1, mode=warn` 且工具 `completed`；另有 `gate=L2, enforceable=false`；子会话存在 |
| SC-5 | 合规调用放行 | 工具 `completed`；无 violation 记录；子会话存在（并校验模型逐字复制了模板：`missing:[]`） |
| SC-6 | 豁免（关键词在任务陈述区） | `level=exempted, exemption=re-review-round, mode=enforce` 且工具 `completed` |
| SC-7 | 尾部关键词不算豁免 | 工具 `status=error` + 日志 `exempted=false` |
| SC-8 | 继承需自证 | 同父会话两次调用：第 1 次豁免放行、第 2 次（无上一轮引用）被拒 |
| SC-9 | 续接轮 | `sessionID` 非空 ⇒ 短 prompt 也放行；续接那一轮无"缺小节"记录 |
| SC-10 | 逐 agent 覆盖 | `mode=warn` + `agents.critic.mode=enforce` ⇒ critic 被拒、oracle（无契约）放行 |
| SC-11 | `mode=off` | 工具 `completed`；契约日志**一条记录都没有**（L1/L2/L3 全无） |
| SC-12 | 审计 CLI | critic `--strict` exit 1；oracle `--strict` exit 0；`--json` 含 `summary.critic.violations ≥ 1` |

## 4. 跑法

```bash
cd /workspace/main/rdd-workflow-e2e
E2E_REAL_RUNTIME=1 TMPDIR="$PWD/.tmp-sc" bats tests/integration/test_subagent_contract_runtime.bats

# 父会话模型（默认 opencode-go/deepseek-v4.1-flash；额度打满时换一个）
SC_PARENT_MODEL=commandcode/deepseek/deepseek-v4.1-flash ... bats ...
# 只跑某几条
bats -f "SC-8|SC-9" tests/integration/test_subagent_contract_runtime.bats
```

默认（不设 `E2E_REAL_RUNTIME=1`）整文件 skip —— 与 `test_front_delegate_runtime.bats` 同一门控，不进 CI。

## 5. 额度与挂起（不做假通过）

每个用例都真实调用模型，实测会遇到 provider 额度打满（`provider.rate-limit`）与偶发挂起：

- **文件级选模 + 预检**：未显式指定 `SC_PARENT_MODEL` 时，按 `commandcode → opencode-go → minimax-cn`
  顺序探一次，挑第一个能用的并缓存到本次运行；全都不通则整文件 `skip`（不让 11 条用例各自失败掩盖真回归）。
- **用例级 skip**：provider 报 rate-limit，或父会话超时且**没产生任何 `subagent` 调用** ⇒ 该用例 `skip` 并显式标注
  "未判定"。**绝不**把没跑起来当通过。
- **超时重试一次**（`rc=124`）：偶发挂起不当契约回归。

## 6. 实测记录（本轮开发中发现并修掉的问题）

| # | 现象 | 根因 | 处置 |
|---|---|---|---|
| 1 | SC-1/SC-2 全部断言失败 | 断言 helper 输出的 JSON 带空格（`"i": 1`），grep 按紧凑格式匹配 | helper 改 `separators=(",", ":")` |
| 2 | 第二个用例起 setup 直接失败（`Device or resource busy`） | `opencode run --standalone` 留下的 serve/pty 守护进程占住临时 HOME | 按 `OPENCODE_DB` 前缀精确 kill，setup/teardown 都清 |
| 3 | 父会话报 `provider.rate-limit` | build 默认 minimax-cn 额度被打满 | 新增 `SC_PARENT_MODEL`（默认 opencode-go）+ 文件级预检 |
| 4 | SC-6/SC-8 复审 prompt 被拒 | 豁免**只跳过小节检查**，`minChars=200` 仍然生效（prompt 141/184 字符） | 复审 prompt 补足到 ≥200（这本身是正确行为的验证，不是 bug） |
| 5 | SC-7 未按预期被拒 | 关键词在 ~200 字符处（< 400 窗口）⇒ 属于豁免区 | 把关键词推到 400 字符之后（前面补审查指令） |
| 6 | SC-9 续接被拒 `not a child of the current session` | 第二次运行换了新父会话 id，子会话不属于它 | 第二次 `--session` 复用同一父会话 id |
| 7 | SC-10 explore 报 `Model unavailable` | explore 走 opencode-go，额度打满时 model-fallback 链也失败 | 无契约 agent 改用 oracle（kimi，额度独立） |
| 8 | **豁免放行在日志里零证据** | `gate()` 只在违规时 `shouldLog=true` ⇒ `exempted`/`exemption` 字段永远 false | **改产品代码**：豁免也落日志（`level:"exempted"`），合规调用仍不记 |
| 9 | SC-8 偶发失败：两次调用顺序被模型颠倒 | 模型可并行发起两次 `subagent`，先发"新评审"就不经过豁免状态 ⇒ 继承语义根本没被触发 | 改为**共享 server** 两轮（`opencode serve` + 两次 `opencode run --server`，同一父会话）——状态是进程内 Map，跨进程会丢，只有同 server 才测得到继承 |
| 10 | 共享 server 客户端报错 | server 启起来要求密码（`server password ...`），客户端没带 | 两端统一 `OPENCODE_SERVER_PASSWORD`（server 200 `/health`、客户端可用） |
| 11 | 拒绝类用例偶发跑满超时 | 模型被拒后反复重试 | prompt 里明确"报错就停止，不要重试、不要改写后再发" |
| 12 | SC-7 稳定挂起（多次都是 90–180s 无任何事件） | 父模型 opencode-go 被间歇性限流（`provider.rate-limit` 未落到 NDJSON，只表现为挂起） | 父模型改为**按候选顺序自动挑选**（commandcode → opencode-go → minimax-cn），每个运行只挑一次 |
| 13 | SC-7 判成"完成"（应被拒） | 模型**改写了 prompt**：关键词「复审」从 ~470 字符处被挪到 325 字符（< 400 窗口）⇒ 合法地进入豁免区 | 前置内容加长到 ~620 字符（6 条中性审查指令，模型倾向照抄列表）+ 加**位置自校验**：实测关键词 < 400 时 `skip` 并注明"模型改写，本用例未判定" |

第 8 条是端到端测试的**直接产出**：单测与审计 CLI 都发现不了"运行时日志里豁免不可见"，因为两者都不看运行时日志。

## 7. 已知限制

1. **依赖真实模型** ⇒ 不能进 CI；模型措辞不参与断言（只断结构性事实），但模型是否按指令发起两次调用会影响 SC-8 的稳定性。
2. **额度受限** ⇒ 额度打满时用例会 skip；`skip` 数量应当被观察（skip 多说明这一轮没验证到）。
3. **SC-8 用共享 server**（`opencode serve` + `--server`）：因为继承状态是进程内 Map，跨进程会丢；其余用例用 `--standalone`。
4. **模型可能改写 prompt** ⇒ SC-7 自带位置自校验（关键词被挪进窗口就 skip，不误判）；SC-5 自带 `missing:[]` 校验（没逐字复制模板就显式失败）。
5. **不覆盖 L2 的"不可拦"负向证明**：L2 路径只能检出，本套件断言了检出（`enforceable=false`），但没有构造"绕过 L1 的路径"（`command(subagent:true)`）来证明它真的拦不住。
