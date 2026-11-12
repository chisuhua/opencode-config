# delegate 单元测试

本目录覆盖两类机制：`delegate` 插件（双 session 委托通道）与 `subagent 输入契约`（subagent 调用前的门）。**不依赖真实 opencode 运行时**：
用假 ctx（实现 `ctx.session.*`）驱动工具的 `execute`，因此可在 CI/本地秒级运行。

## 运行

```bash
cd ~/.config/opencode
bun test tests/            # 全部
bun test tests/delegate-core.test.ts   # 纯逻辑
bun test tests/delegate-tool.test.ts   # 假 ctx 端到端
```

`package.json` 在本仓库被 `.gitignore` 忽略（本地文件），其中的 `test` 脚本只是本地便利；
**入库的规范命令是 `bun test tests/`**。

## 覆盖范围

| 文件 | 覆盖 |
|---|---|
| `config-guards.test.ts` | **守卫漂移检测**（13 项）：受管 agent（front + 五个只读 subagent）的 shell 规则 == `scripts/agent-guard-rules.ts` 真源（含顺序）、D3.1 首参形态齐备、ADR D3/D3.1 全量 deny 族齐备、librarian clone 目标收敛顺序、deny-first、`front.subagent` 首条 `*: deny` + 五 allow 且不含 general/plan/build、**round-trip**（注入漂移 → 修复 → JSON 可解析 → 幂等） |
| `delegate-core.test.ts` | brief 六必填校验、**agent 白名单与 kind 推导**、grants 白名单（question/form/edit/write 永不可 grant）、**知识 session 的 scope/grants 约束**、scope→edit 规则（含文件型 scope 的 `x` 与 `x/*`）、常量 deny 集与**规则顺序即策略**、阻断提取（两种形态）、消息工具、越界判定、项目识别（git / 非 git）、pair-v2 与 role 分区登记（**knowledge 不写 role**）、**ledger 追加与脱敏截断**、**交付面证据 summarizeDelivery（含真实失败会话回归夹具）**、目录锁并发、简报文本组装 |
| `delegate-tool.test.ts` | 工具契约（权限 action / 输入 schema）、端到端主链路（建 session → 权限定型 → 简报投递 → 结果回传 → pair/role 登记）、**agent 白名单（含 resume 绕过）**、**知识 session 只读语义**、**ledger 行产生时机（正常 / busy / 校验失败）**、**静默失败检测（outcome=unverified / host_outcome / 时间窗 / 仍在跑不判定 / 知识 session 与 shell 写盘不误报）**、grants preflight、非法 grants 在建 session 前被拒、续接不新建、未登记 id 被拒、busy 不排队、blocked_reason 回传、越界文件可见、remove |
| `subagent-contract-core.test.ts` | **subagent 输入契约规则引擎**（40 例）：小节识别 5 种实测写法（编号标题/纯标题/标题+尾部说明/加粗独立行/行内赋值）、长度上下限、关键词豁免的结构前置（缺失 ≥ceil(n/2)）+ **任务陈述区窗口**（关键词只认开头 400 字符）、状态继承（继承"复审模式"且**本轮需引用上一轮**，续接轮不清零）、三个钩子处理函数（L3 注入幂等 / L1 门 warn-vs-enforce / L2 只检测）、配置解析 |
| `subagent-contract-audit.test.ts` | **审计 CLI**（8 例）：只收集有父会话的子会话、规则按条目 agent 解析、状态继承（引用上一轮才继承 / 不引用不放行）、`--strict` exit 1 / `--agent` 过滤（临时 sqlite 夹具，不依赖真实库） |

被委托的工程 = **测试自建的最小 git 仓库**（`fixtureProject()`）：临时目录 + `README.md`
+ `tests/` 目录 + 一次 commit。**不依赖任何外部仓库**（此前依赖
`/workspace/main/rdd-workflow-e2e`，会让「完全离线」在别的机器上不成立）。

## 与真实运行时的关系

单元测试覆盖**逻辑与契约**；依赖真实 opencode 运行时的那部分（门控生效、真实 session 驱动、
权限层实际裁决）在 `.rddf/reviews/front-agent-redesign-acceptance.md` 有实测记录。
重构 `plugins/delegate.ts` → `lib/delegate-core.ts` + 插件壳后，**必须回归真实运行时的端到端委托**
（`bun test` 覆盖不到宿主接线）。

`subagent 输入契约` 同样有单测覆盖不到的部分（**钩子是否真的挂上、失败是否真的被包成 Tool.Error**）：
证据见 `.rddf/reviews/subagent-contract-verify.md` —— warn 模式日志两条违规、enforce 模式调用被拒、合规调用放行。
上游前提（“只有 tool 域允许失败”）由 `scripts/check-upstream-anchors.sh` 的 A13/A13b 锚点守住。
豁免判据的**误伤面**靠真实语料复核（真实库 90 条豁免全量分类，误命中 12 条 → 已收紧），
证据见 `.rddf/reviews/subagent-contract-exemption-sampling.md` —— 这类抽样单测替代不了。
