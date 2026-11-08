# 验收报告：front-knowledge-capability（builder 实施提交 c81af29）

- 日期：2026-11-08
- 验收角色：verifier（只验不改）
- 对象：commit `c81af29`（feat(front): front 获得知识获取能力）
- 整体结论：**条件通过**（静态检查 / 单测 / 契约判据全过；3 项运行时强制判据**阻塞**，需 `opencode service restart` 后复验）

## 0. 分流与判据来源

| 项 | 结果 |
|---|---|
| `openspec/changes/*/proposal.md` + AC 段 | **不存在**（`openspec/` 目录都没有） |
| `rdd-verifier` skill | 已安装（available 28/28），但分流条件 1 不满足 → **不走 skill** |
| `.rddf/state/iteration.json` | 不存在（无任务清单门槛） |
| 判据来源 | ① 用户拍板的 6 个决策点；② 本次提交自己声明的行为（commit body）；③ ADR `docs/adr/ADR-front-knowledge-capability.md` 的 Verification 15 条（第 4 优先级直接适用） |

## 1. 验证顺序与结果（1–5 步）

| 步 | 检查 | 结果 | 证据 |
|---|---|---|---|
| 1 | 构建 / 语法 | **通过** | `bun build lib/delegate-core.ts --target=bun` → Bundled 1 module, 27.11 KB |
| 2 | 单元测试 | **通过** | `bun test tests/` → **116 pass, 0 fail, 307 expect()** |
| 3 | 集成 / 端到端 | **部分通过** | 假 ctx 端到端（21 项）通过；**真实运行时未验证**（见 §3 阻塞项 S1） |
| 4 | 边界与错误路径 | **通过** | 非白名单 agent、非法 grants、未登记 resume、busy、空 scope、脱敏截断、幂等重登记均有用例（见 §2） |
| 5 | 遗留清扫复核 | **通过** | `TODO/FIXME/.skip(/console.log` 在 `lib/`、`tests/`、`plugins/` 均 0 命中；无临时日志；无未替换 mock |

## 2. ADR Verification 逐条判定

| # | 判据 | 判定 | 证据 |
|---|---|---|---|
| 1 | front 可调 5 个只读 agent；general/plan/build 被权限层拒 | **静态通过 / 运行时未验** | `opencode debug agents`：front 的 subagent 规则 = 五个 allow + `*: deny`；配置解析同（`opencode.jsonc.opencode_server` front 块）。运行时拒绝需真实会话（S1） |
| 2 | 加固证据：explore 的 `bash -c` / `tee` / `sort a > b` 被拒 | **静态通过 / 运行时未验** | 解析规则中 explore 有 102 条 shell 规则：index 0 是内置默认 `*: allow`，用户配置的 `*: deny` 在 index 1（其后才是各 allow），守卫 `* > *` / `tee *` 均在 allow 之后 → last-match-wins 下未命中命令落 deny。真实裁决需 S1 |
| 3 | librarian 深度 2 委派被拒 | **通过（配置层）** | `librarian.permission.subagent = deny`（配置 + `debug agents` 均确认） |
| 4 | librarian 网络写守卫：`curl -o` / `wget -O` deny、`git clone … /tmp/opencode` allow、`git clone … /etc/x` deny | **静态通过 / 运行时未验** | 解析规则索引：`curl *` allow@48 → `curl * -o*` deny@87；`git clone *` allow@50 → `git clone * /*` deny@98 → `git clone * /tmp/opencode/*` allow@99 |
| 5 | `delegate(agent="general"/"plan")` 建 session 前被拒 | **通过** | `tests/delegate-tool.test.ts:369`（非白名单 agent 在建 session 前被拒；断言 `calls.create === 0`） |
| 6 | resume 已登记但 agent 非白名单 → 拒 | **通过** | `tests/delegate-tool.test.ts:426`；实现 `lib/delegate-core.ts:607` |
| 7 | knowledge 的 grants 非空被拒；scope 为空不报错且不注入规则 | **通过** | `tests/delegate-tool.test.ts:411`；`tests/delegate-core.test.ts:466,473` |
| 8 | `delegate(agent="explore", scope=["src"])` 无 edit | **通过** | `tests/delegate-tool.test.ts:391`（edit 规则 = 单条 `* deny`）；实现 `:622-626` |
| 9 | knowledge 不写 role.json 分区；pair 有 `kind: "knowledge"` | **通过** | `tests/delegate-tool.test.ts:400`；`tests/delegate-core.test.ts:493`；实现 `:398-440` |
| 10 | ledger 行时机 / 字段 / 截断脱敏 | **通过** | `tests/delegate-tool.test.ts:457,479,489`；`tests/delegate-core.test.ts:520,527` |
| 11 | ledger 与 pair/role 同一临界区，并发无丢失 | **部分通过（代码级）** | 同一 `lockDir = .rddf/state/.role.lock`（`:398-441` 与 `:376-382`）；`withLock` 并发用例 `tests/delegate-core.test.ts:391` 通过。**缺并发 delegate 用例**（未覆盖两次 execute 并发） |
| 12 | resume 只由 pair 判定；伪造 ledger 无效 | **通过（代码级）** | `lookupPair` 只读 `pair.json`（`:444-450`）；`ledger.jsonl` 在 `lib/` 中**只有 append，无读**（全仓唯一命中是 `:372` 的 `appendFileSync`） |
| 13 | front 引用 ledger 出示 `recorded_at`；subagent 综述标注来源 | **未验证** | 属 prompt/模型行为，无工具判据；`prompts/front.md:32-36` 只有规则文本，无法自动断言（建议人工抽查一次对话） |
| 14 | 消防态：不存在"front 已放行但后端未加固" | **通过** | 同一 commit `c81af29` 同时包含 `opencode.jsonc`（5 agent 加固 + front 放行）与 `lib/`；`opencode debug agents` 复验 front 五 allow + 5 agent 首条 deny |
| 15 | reload 生效；front subagent 规则为五 allow + `*: deny` | **通过** | `opencode reload` → "Configuration reloaded"；`debug agents` 输出六条规则（顺序：explore/librarian/oracle/metis/critic → `*: deny`） |

## 3. 阻塞项（未验证，不判失败）

**S1 — 运行中的 service 仍是旧插件模块（关键）**

- 证据：`ps -eo lstart` → service 启动 **2026-11-08 16:41:23**；`lib/delegate-core.ts` mtime **18:47:24**；commit **18:50:30**。
- 含义：配置改动经 `opencode reload` 已生效；**`delegate` 的新逻辑（白名单 / 知识 session / ledger）在当前 service 中是旧代码**。
- 影响：判据 1/2/4 的"权限层真实裁决"与所有新 `delegate` 行为的真实运行无法验证。
- 未自行重启的原因：`opencode service restart` 会中断当前会话（本验收正在其中运行）。
- 复验命令（用户重启后或另开会话执行）：
  ```bash
  opencode service restart && opencode debug agents | grep -A2 subagent
  # 真实委托（front）：delegate(agent="general") 应被拒；delegate(agent="explore", scope=[]) 应成功且无 edit
  # 子 agent 侧：explore 执行 bash -c 'touch /tmp/x' 应被权限层拒
  ```

**S2 — 判据 13（prompt 行为）**：只能人工抽查。

**S3 — 判据 11 的并发 delegate**：现有 `withLock` 用例只覆盖单进程串行 + 锁语义；两次 `execute` 真并发未构造。建议下一轮补一条用例（用两个 `runDelegate` 同时触发同一工程）。

## 4. 失败项与路由

**无实现失败项**（0 项需回 build）。S1/S2/S3 均为验证覆盖缺口，不是实现缺陷。

## 5. 遗留清扫复核（第 5 步到底做了什么）

| 检查 | 结果 |
|---|---|
| `TODO` / `FIXME` / `XXX` | `lib/delegate-core.ts`、`tests/*.ts`、`plugins/delegate.ts`：0 命中 |
| 被 skip 的测试 | 0（`grep '.skip('` 无命中） |
| 临时调试日志 | 0（`console.log` 无命中） |
| 未替换的 mock | 假 ctx 是测试框架本体，非临时 mock |
| 死代码 | 已删的 `baselineUpdated` 确认不在当前文件（`grep` 0 命中） |
| 半截实现 | 4 项实现项均有用例覆盖（见 §2 #5–#10）；wiki / 并行委托按 ADR 明确后置，非半截 |
| 工作区脏文件 | 仅 `cli.json`（与本变更无关的 UI 偏好，未纳入本次提交） |

## 6. 已用轮次

- 本 change 验收轮次：**1 / 3**（`RDDF_VERIFIER_MAX_LOOPS=3`）。
- 无失败返工，未消耗重试额度。

## 7. 建议

1. **重启 service 后复跑 S1 的四条运行时判据**（这是唯一阻断"完整通过"的项）。
2. 补 S3 的并发 delegate 用例（可放到下一 change 的测试补齐，不阻断本次）。
3. S2 人工抽查一次 front 对话：引用历史时是否带 `recorded_at`、引用 subagent 结论时是否标注来源。
