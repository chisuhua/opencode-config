# 探针报告：subagent 权限粒度与只读性（v2.2.5）

- 日期：2026-11-08
- 执行角色：architect（治理面配置探针）
- 目的：为 `docs/adr/ADR-front-knowledge-capability.md` D1/D2 提供前置事实
- 环境：opencode v2.2.5，后台 service `http://127.0.0.1:49374`

## 1. 逐 agent 权限粒度（结论：通过）

**改动**（临时）：`agent.front.permission.subagent` 由 `"deny"` 改为对象形态：

```jsonc
"subagent": {
  "explore": "allow", "librarian": "allow", "oracle": "allow",
  "metis": "allow", "critic": "allow", "*": "deny"
}
```

**命令**：`opencode reload` → `opencode debug agents`

**解析结果**（front 的 `permissions` 中 action=subagent 的规则，按顺序）：

```
{action: subagent, resource: explore,   effect: allow}
{action: subagent, resource: librarian, effect: allow}
{action: subagent, resource: oracle,    effect: allow}
{action: subagent, resource: metis,     effect: allow}
{action: subagent, resource: critic,    effect: allow}
{action: subagent, resource: *,         effect: deny}
```

**上游佐证**：`permission.evaluate` 以 `resource` 匹配目标 agent ID，`findLast` 决定生效规则；`subagent` 工具的断言点为 `subagent.ts`（`permission.assert({action:"subagent", resources:[agent.id]})`）。

**回滚**：恢复探针前配置并 `opencode reload`，复验 front 规则回到单条 `{subagent,*,deny}`。

## 2. 附带事实 A：`write` 不是独立权限 action

**证据**：`opencode debug agents` 全 agent 解析出的 action 集合中**不存在 `write`**（存在 `edit`）。
**结论**：`write` 工具归并到 `edit` action。`adr-front-agent-redesign.md` D4 与 `prompts/front.md` 中"`edit`/`write` 均 deny"的表述与配置**一致**，但文档写法暗示两个独立开关，建议改为"`edit` deny（含 write 工具）"。

## 3. 附带事实 B：subagent 的"只读"不成立于权限层

**证据**（`opencode.jsonc`，解析后规则）：

| agent | shell 首条 | `edit` | 额外 |
|---|---|---|---|
| explore / oracle / metis / critic / context-builder / general | `"*": "allow"` | deny | `bash -c`、`tee`、`>` 重定向均未 deny |
| librarian | `"*": "allow"` | deny | `curl`/`wget`/`git clone` allow + `subagent: allow` |

**结论**：`edit: deny` 只封 `edit` 工具；shell 写入通道在 5 个"只读" subagent 上均敞开。front 放行 subagent 前必须先加固（ADR D3）。

## 4. 附带事实 C：`delegate` 的 `agent` 参数无白名单

**证据**：`lib/delegate-core.ts:222` —— `const agent = String(input.agent ?? "build").trim() || "build"`，无枚举校验；`validateBrief` 其余字段均有必填/类型校验，仅 `agent` 自由。
**结论**：front 现在即可通过 `delegate(agent="plan"|"general")` 建立具备 `skill: allow` / `edit` allow 的 session，`subagent: deny` 被事实上绕过（ADR D4 H1）。

## 5. 附带事实 D：scope 派生 edit 规则会覆盖只读 agent 的 edit deny

**证据**：`lib/delegate-core.ts:520-524` 中 `permissions = [常量deny, ...scopeEditRules(root, scope), ...grants]`；opencode 权限合并顺序为 agent 规则在前、session 规则在后、`findLast` 生效。
**结论**：`delegate(agent="explore", scope=["src"])` 会为该 session 生成 `edit: src/** allow`，覆盖 explore 自身的 `edit: deny`（ADR D4 H2）。

## 未覆盖

- 未做端到端运行时强制测试（需真实 front session 驱动模型调用 subagent，受模型行为与耗时影响）；ADL Verification 保留为前瞻判据。
- 未测加固后的回归面（build/plan→subagent 现有流程），该回归归实施阶段。
