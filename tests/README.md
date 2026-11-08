# delegate 单元测试

`delegate` 插件（双 session 委托通道）的单元测试。**不依赖真实 opencode 运行时**：
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
| `delegate-core.test.ts` | brief 六必填校验、**agent 白名单与 kind 推导**、grants 白名单（question/form/edit/write 永不可 grant）、**知识 session 的 scope/grants 约束**、scope→edit 规则（含文件型 scope 的 `x` 与 `x/*`）、常量 deny 集与**规则顺序即策略**、阻断提取（两种形态）、消息工具、越界判定、项目识别（git / 非 git）、pair-v2 与 role 分区登记（**knowledge 不写 role**）、**ledger 追加与脱敏截断**、**交付面证据 summarizeDelivery（含真实失败会话回归夹具）**、目录锁并发、简报文本组装 |
| `delegate-tool.test.ts` | 工具契约（权限 action / 输入 schema）、端到端主链路（建 session → 权限定型 → 简报投递 → 结果回传 → pair/role 登记）、**agent 白名单（含 resume 绕过）**、**知识 session 只读语义**、**ledger 行产生时机（正常 / busy / 校验失败）**、**静默失败检测（no_work_evidence：开场白 / 正常交付 / 知识 session 不误报 / edit 写盘不误报）**、grants preflight、非法 grants 在建 session 前被拒、续接不新建、未登记 id 被拒、busy 不排队、blocked_reason 回传、越界文件可见、remove |

被委托的**示例工程 = `rdd-workflow-e2e`**（`/workspace/main/rdd-workflow-e2e`）：
测试复制其工作树到临时目录并重新 `git init`（只复制工作树、不复制 `.git` —— git 对象文件只读，
复制后不可写），因此测试不会污染该仓库的 git 状态。

## 与真实运行时的关系

单元测试覆盖**逻辑与契约**；依赖真实 opencode 运行时的那部分（门控生效、真实 session 驱动、
权限层实际裁决）在 `.rddf/reviews/front-agent-redesign-acceptance.md` 有实测记录。
重构 `plugins/delegate.ts` → `lib/delegate-core.ts` + 插件壳后，**必须回归真实运行时的端到端委托**
（`bun test` 覆盖不到宿主接线）。
