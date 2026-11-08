# model-fallback 验收报告

- **对象**：模型降级链插件（`plugins/model-fallback.ts` + `lib/model-fallback-core.ts` + `tests/model-fallback-core.test.ts` + `model-fallback.json`）与同批文档订正
- **角色**：builder（角色内建验收，非 rdd-verifier skill —— 本仓库无 `openspec/` 目录、不满足 skill 的 canonical preconditions）
- **日期**：2026-11-08
- **结论**：✅ 通过（可提交）

## 判据来源

按优先级取，本仓库无 ADR（§arch-docs 判定态 3），故以用户本次口径 + 本次变更自述行为为准：

1. 用户明确要求：「模型不可用时切到 `commandcode/deepseek/deepseek-v4.1-flash`」；后确认「重启服务并测试后备模型是否工作」。
2. 本次变更自述行为：按错误分类决定「原地退避 / 换链 / 放弃」，链耗尽即 `retry: false`。
3. 设计契约（2026-11-06 architect 设计，用户选定 D 方案）：内容策略 / 上下文超限一律不降级；不许静默换弱模型；链耗尽不循环。

## 逐条判定

| # | 判据 | 判定 | 工具证据 |
|---|---|---|---|
| 1 | 插件被宿主加载 | ✅ | `opencode plugin list` → `model-fallback  local  /home/ubuntu/.config/opencode/plugins/model-fallback.ts`；重启后日志 `loaded; config=...; agents=build,explore,librarian,oracle,metis,critic; notify=log` |
| 2 | 单元测试全绿 | ✅ | `bun test tests/` → **96 pass / 0 fail**（`bun test tests/model-fallback-core.test.ts` → 33 pass） |
| 3 | 端到端：真实 provider 失败时自动换链并成功作答 | ✅ | `opencode run --standalone --agent build -m openstarry/deepseek-v4.1-flash "只回复两个字：收到"` → 输出 `收到`；日志 `build: openstarry/deepseek-v4.1-flash -> commandcode/deepseek/deepseek-v4.1-flash; provider.auth/403: 订阅额度不足…` |
| 4 | 每次失败只切一次（无重复撞墙 / 无双切） | ✅ | 同一 e2e 的日志只有 **1 行**切换记录；`grep -c "build: openstarry"` → 1 |
| 5 | 内容策略 / 上下文超限不降级（BLOCKER 1） | ✅ | 单测：`400 + "content policy violation: request forbidden"` → client-error；`403 + "request forbidden by policy"` → client-error；`400 + "token limit exceeded, reduce input"` → client-error；`400 + "maximum context length is 1000000"` → client-error |
| 6 | 裸 403 仍降级（订阅未配置等硬失败） | ✅ | 单测：`403 + "Forbidden"`、`403 + "403 Forbidden"` → model-unavailable；e2e 中 openstarry 的 403 确实触发了换链 |
| 7 | 订阅额度不足属硬失败（不等退避直接换） | ✅ | 单测：`403 + "订阅额度不足或未配置订阅: subscription quota insufficient"` → model-unavailable；e2e 日志显示一次即切换 |
| 8 | 链耗尽即放弃，不循环 | ✅ | 单测「全部候选耗尽后 give-up」「switch 预算耗尽后 give-up」；`give-up` 分支置 `decision = { retry: false }` |
| 9 | 429 优先按上游 `retryAfterMs` 原地等待 | ✅ | 单测「带 retryAfterMs 时按上游建议等待」；超过 `maxDelayMs` 时改换链（单测覆盖） |
| 10 | 冷却生效且可绕回已恢复的链首 | ✅ | 单测「冷却中的模型会被跳过」「链尾失败且链首已恢复时绕回链首」；冷却表跨 session 共享（单测「createState 传入的冷却表被原样共享」） |
| 11 | 可见性（降级不静默） | ✅ | 切换触发 `session.model.selected`（TUI 模型指示器变化，e2e 输出可见 `> build · deepseek/deepseek-v4.1-flash`）；日志落 `~/.local/share/opencode/model-fallback.log` |
| 12 | 配置可改且生效 | ✅ | `model-fallback.json` 的链与 §5.4「当前生效链」逐节一致；`MODEL_FALLBACK_CONFIG=/tmp/opencode/mf-custom.json` 实测切到该文件（日志 `config=/tmp/opencode/mf-custom.json`） |
| 13 | 改配置后需重启才生效（文档已写明） | ✅ | §5.4「生效时机」行；实测改动前常驻 server 未加载插件，`opencode service restart` 后加载 |
| 14 | 文档与实现一致（BLOCKER 2） | ✅ | critic 复审 `mergeable: yes` / `APPROVE`；§5.4 区分「内置默认链」与「当前生效链」，§7.1 两条 e2e 记录按口径分列 |

## 失败项与路由建议

无失败项。

## 遗留清扫

范围：本次新增/修改的文件（`lib/model-fallback-core.ts`、`plugins/model-fallback.ts`、`tests/model-fallback-core.test.ts`、`model-fallback.json`、`docs/MULTI-AGENT-DESIGN.md`、`docs/CHANGELOG.md`）。

| 检查项 | 结果 |
|---|---|
| TODO / FIXME / XXX / 待办 | 无（`grep -nE "TODO\|FIXME\|XXX\|HACK\|待办\|暂时"` 无命中） |
| 临时调试日志 / `console.log` / `debugger` | 无（仅保留 `console.error` 的运行日志与受 `MODEL_FALLBACK_DEBUG` 控制的入口调试行） |
| 被 skip / only 的测试 | 无 |
| 注释掉的代码块 | 无 |
| 未替换的 mock / 临时 fallback 分支 | 无 |
| 未使用的导出 | 无（`isRetryable` 早前已删，全仓 0 引用；其余导出均有引用） |
| 范围外历史遗留 | `docs/MULTI-AGENT-DESIGN.md` §6 文件结构此前未列 `plugins/` `lib/` —— 本批已补齐；`cli.json`（`thinking: show→hide`）是本批之前的工作区改动，非本批产出，不在清扫范围 |

## 已用轮次

- 验收轮次：1（本地验收）
- critic 评审：2 轮（第 1 轮 REJECT / 2 BLOCKER → 修复并闭合；第 2 轮复审 APPROVE，只验闭合 + 新回归）
- 失败打回次数：0（无 `implementation_gap` / `proposal_drift`）

## 已知边界（不阻塞提交）

1. **解析阶段的模型不可用接不住**：`SessionRunnerModel.ModelUnavailableError`（模型在 catalog 里解析不出来）在 `retry` 钩子之前抛出，插件无从介入。实测只在临时 DB / 全新 server 的 catalog 未就绪时出现；真实会话里模型不可用表现为请求级 401/403/5xx，可接住。
2. **降级是会话级粘滞的**：切到哪个模型，本会话后续轮次继续用它，直到 `/model` 改回或重连。
3. **未验证项**（critic 指出，构造困难）：`decision.delay` 的单位是否被宿主按毫秒消费；`variant` 透传后下一轮是否沿用；`give-up` 后原始错误是否一定 surface 而不被宿主重试机制拉起。
4. **`safety` 词条偏宽**（critic NIT）：若 provider 把瞬时错误写成 `safety check timeout` 会被判 client-error（少降级一次，方向安全），未收窄。
