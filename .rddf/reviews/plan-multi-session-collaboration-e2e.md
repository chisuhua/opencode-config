# e2e 记录：plan-multi-session-collaboration

> 执行角色：verifier（主会话）｜日期：2026-11-20
> 方式：`opencode run --agent plan --auto`（非交互真实 plan 会话，派真实 `plan-worker`）
> 说明：本仓无 e2e 框架；本条用非交互 CLI 起真实会话取证。

## 1. 会话树与子会话行为（I2② ③ ④ ⑤）

**探针**：plan 会话创建 `.rddf/plan-topics/e2e-probe/`（TOPIC.md / graph.json / nodes/a1/BRIEF.md），再 `subagent(agent="plan-worker")` 同步派发。

| 项 | 期望 | 实际 | 证据 |
|---|---|---|---|
| I2② 子会话 `parent_id` == 根会话 id | 相等 | ✅ 相等 | `sqlite3 ~/.local/share/opencode/opencode.db "SELECT id,parent_id,agent FROM session_v2 WHERE agent='plan-worker'"` → `ses_e08b134a0ffe9M47UGjFAgGH1o \| ses_e08b1e54bffeqgG8s08pjX7YxF \| plan-worker`；plan 会话 `ses_e08b1e54bffeqgG8s08pjX7YxF` |
| I2③ 子会话 `$OPENCODE_SESSION_ID` == 子 id | 相等 | ⚠ **不可取证** | `plan-worker` 的 shell 白名单无 `printenv`（BASE_ALLOW）⇒ 子会话内无法执行；间接证据：库中 plan-worker 会话 id 与父 id 不同 |
| I2④ 完成合成消息到父 | 父收到子结果 | ✅ | `opencode run` 输出中父会话转述了子会话返回全文：「node: a1 / RESULT: … / 摘要: 按 BRIEF 完成探针任务…」 |
| I2⑤ 父用 `sessionID` 续接 | 成功 | ⏳ 未执行 | 需同一父会话内二次派发；本次未做 |
| I2⑥ 父死后新根**不能**续接 | 被拒 | ⏳ 未执行 | 需父会话死亡场景 |
| I2① 同轮 `background` 派两个 | 两条并行 | ⏳ 未执行 | 本次为单个同步派发 |

**产物实测**：

```
.rddf/plan-topics/e2e-probe/nodes/a1/TODO.md   → "- [x] probe"
.rddf/plan-topics/e2e-probe/nodes/a1/RESULT.md → "probe done\n\n## STATUS: COMPLETE"
```

⇒ 子会话**确实**写了自己的 TODO/RESULT，且用了末行哨兵。

## 2. checker 端到端（派生判据）

```
$ bun scripts/plan-topic-check.ts check .rddf/plan-topics/e2e-probe
cache_mismatch [a1]: progress 缓存=todo 派生=complete
cache_mismatch [a1]: status 缓存=pending 派生=done
exit=1
```

⇒ **符合设计**：父会话（plan）未回填 `graph.json` 的缓存，checker 按派生值判出分叉。这验证了「缓存只能缓存、判据以派生为准」（D2）。

## 3. 负向探针（I2⑦ ⑧ ⑨）

| 项 | 期望（proposal 措辞） | 静态证据（配置） | 结论 |
|---|---|---|---|
| I2⑦ 子写 `lib/x.ts` | 权限拒 | `plan-worker` 的 `edit` = `{*: deny, *.rddf/plan-topics/*: allow}` ⇒ `lib/x.ts` 落在 `*: deny` | ✅ 配置级成立（未做行为探针） |
| I2⑧ 子写**别的 topic** | 权限拒 | ⚠ `*.rddf/plan-topics/*` **匹配所有 topic**（`Wildcard` 的 `*` 跨斜杠）⇒ 跨 topic 写**被允许** | ❌ **不成立** —— 见 §5 发现 |
| I2⑨ 子写 `.rddf/plan-topics/../state/role.json` | 权限拒 | `..` 归一后不在 `*.rddf/plan-topics/*` 前缀内 | ✅ 配置级成立（未做行为探针） |

## 4. 独占锁（V11）

```
mkdir .rddf/state/plan-topics/e2e-probe.lock   → first=OK
mkdir .rddf/state/plan-topics/e2e-probe.lock   → second=FAIL(符合预期，原子性成立)
bun scripts/plan-topic-check.ts lock .rddf/plan-topics/e2e-probe --json
  → {"present":true,"owner":"ses_probe","binding":null}
```

- **原子 mkdir**：✅ 取证（第二次失败）。
- **checker `lock` 只读报告**：✅ 取证（present / owner / binding）。
- **「第二个根会话对同 topic 的写入被拒」**：⚠ **不成立为机械判据** —— `plan` 的 `edit` 白名单是 `*.rddf/plan-topics/*`，第二个会话**有权限写**；「仅 owner 可写」只是 prompt 协议（ADR D7）。⇒ 归「协议级」而非权限门。

## 5. 配置生效（V13）

```
opencode debug agents → agents: [... 'plan-worker' ...]
plan-worker: mode=subagent; edit: {*: deny, *.rddf/plan-topics/*: allow};
             subagent/question/skill/lsp/external_directory/delegate*: deny
Plan: mode=primary; subagent=allow
```

✅ 配置生效。

## 6. 关键发现（verifier 记录，不修改实现）

1. **proposal/路线图的「子写别的 topic 被拒」与实现不符**：`edit` 白名单是 topic 树粒度（`*.rddf/plan-topics/*`），**跨 topic 写被允许**。这与 ADR D4 的「只能到 topic 树粒度」**一致**，但与 proposal AC16 / 路线图 §3.3 的措辞**不一致** ⇒ 属 `proposal_drift`（判据描述错，非实现错）。
2. **「第二个根会话被拒」是协议级**：权限层不拦（同 topic 树），只有 prompt 纪律 + checker 事后报告。ADR D7 已写「仅 owner 可写 / 可派」，但那是**协议**不是**闸门** —— proposal AC17 同样措辞过强。
