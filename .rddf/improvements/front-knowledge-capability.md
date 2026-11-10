# improvement: front-knowledge-capability

## Why

`front` 原本是"只读交互内核"：`edit`/`skill`/`subagent` 全 deny，一切工程行动经 `delegate` 转交工程 session。这挡住了真实风险，但也把**知识获取能力**一起关掉了——front 无法用 explore/librarian/oracle 理解项目与外部知识，也无法可靠回答"以前做过什么"。

同时，实施过程中暴露了两个**只有真实运行时才看得见**的缺陷：
1. 五个"只读" subagent 的 `shell` 首条是 `"*": allow`（`bash -c`/`tee`/重定向可写）；`delegate` 的 `agent` 参数无白名单；scope 派生 `edit allow` 会覆盖只读 agent 的 `edit deny`。
2. 宿主把"只输出角色开场白就 idle"的 run 记为 `succeeded` → delegate 回传成功，front 向用户说"已完成"，实际零产出（**静默失败**）。

两篇 ADR 已 Accepted：`ADR-front-knowledge-capability`（front 获得知识获取能力 + 记忆层）、`ADR-delegate-delivery-evidence`（交付面证据 + `unverified` 结果）。

## What Changes

- **front 执行手段**：理解性请求可直读、或召五个只读 subagent（explore/librarian/oracle/metis/critic）；实施性仍只走 `delegate`。
- **后端加固**：五个只读 agent 的 shell 改三段式（deny 打头 + 只读白名单 + 尾部守卫，含首参形态）；librarian 封深度 2。
- **delegate 契约**：`agent` 白名单（create + resume）；`kind=engineering|knowledge`（知识 session 恒 `edit:* deny`、拒 grants、不写 role 分区）；`ledger.jsonl` 记忆层（插件单写、同锁、脱敏）。
- **交付面证据**：`no_work_evidence` / `tool_calls` / `write_tool_calls` / `artifacts` / `final_is_role_opening` / `model_switched`；判定为真时 `outcome="unverified"` + `host_outcome`。
- **消费方迁移**：front prompt、使用/架构/双 session 文档、ledger schema、单测与 E2E。

## Acceptance

见 `openspec/changes/archive/2026-11-10-front-knowledge-capability/proposal.md` 的 `## 验收标准`（AC1–AC31，逐条映射两篇 ADR 的 Verification）。

**最小可验收集合**（缺一即不通过）：AC1（规则顺序）、AC2（general 被拒）、AC4（explore 加固）、AC6（librarian 网络守卫）、AC8（delegate 白名单）、AC12（知识 session 约束）、AC14（knowledge 登记）、AC16+AC17（ledger 时机+字段）、AC21+AC22（unverified 与正常交付）、AC25（仍在跑不判定）。

**否决条件**：① 最小集合里任一 AC 有工具证据表明失败；② 出现 `outcome=succeeded` 但实际零交付的静默失败（AC21 的反例）。

## Capabilities

- front 可在不获得写权限的前提下获取项目/外部知识。
- 委托结果可机读判定"宿主说成功但没交付"，不再静默。
- 工程 session 的 agent 白名单、只读语义、登记类型、历史账本有强制点与审计链。

## Impact

- 影响面：`opencode.jsonc`（front + 五个 agent 的权限）、`prompts/front.md` 与四个 subagent prompt、`lib/delegate-core.ts`、`tests/*`、五份文档、两个 ADR。
- 兼容性：`delegate` summary 新增字段（向后兼容）；`outcome` 新增 `unverified`（**消费方必须同 patch 更新**，见 ADR D3.1）。
- 风险：守卫是 glob 尽力而为（已知残留：短选项组合、配置化输入）；`artifacts` 是 git 可见口径，会漏报工程根外/被忽略的产物（已知误报形态，ADR 已披露）。
