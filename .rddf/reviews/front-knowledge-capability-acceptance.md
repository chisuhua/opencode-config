# 验收报告：front-knowledge-capability（第 1 轮）

- 日期：2026-11-09
- 验收角色：verifier（只验不改）
- 对象：`openspec/changes/front-knowledge-capability/proposal.md` 的 **AC1–AC31**
- 判据来源：proposal `## 验收标准`（优先）+ 两篇 Accepted ADR 的 Verification
- 结论：**不通过（1 项失败：AC31）** → 路由回 **builder**（`implementation_gap`）
- 轮次：**1 / 3**

> 说明：早前的 `.rddf/reviews/front-knowledge-capability-verify.md`（"运行时未验证"）已被本报告取代——真实运行时 E2E 已落地并实跑（15/15）。

## 0. 分流

| 条件 | 结果 |
|---|---|
| change + `## 验收标准` | ✅ `openspec/changes/front-knowledge-capability/proposal.md` |
| `rddf rdd-verify --dry-run` | `No eligible changes to verify (empty queue)` → P3 gate 未触发 |
| `rdd-verifier` skill | 已安装，但分流条件 2 不满足 → **走本地验收 1–5 步** |

## 1. 验证顺序

| 步 | 检查 | 结果 |
|---|---|---|
| 1 | 构建 / 静态 | ✅ `bun build lib/delegate-core.ts` 通过 |
| 2 | 单测 | ✅ **144 pass / 0 fail / 400 expect**（`bun test tests/`，覆盖 99.16%） |
| 3 | E2E（真实模型 + 真实宿主） | ✅ **15/15 ok**（`/workspace/main/rdd-workflow-e2e`，bats 入库 commit `87c8919`；运行时间 2026-11-09 01:35） |
| 4 | 边界与错误路径 | ✅ 见 AC9–AC13/AC25–AC27 的用例 |
| 5 | 遗留清扫复核 | ✅ 见 §4 |

## 2. 逐条判定（AC1–AC31）

| AC | 判定 | 证据 |
|---|---|---|
| AC1 | ✅ | `opencode.jsonc` 解析：`[("*","deny"),("explore","allow"),("librarian","allow"),("oracle","allow"),("metis","allow"),("critic","allow")]`；首条 deny、末条为具体 agent；`debug agents` 复核顺序一致 |
| AC2 | ✅ | E2E L2-15 ok（`subagent(agent="general")` → `error` + `Permission denied`）；`run-subagent-denied.json` 产物存在 |
| AC3 | ✅ | 静态：`general`/`plan`/`build` 在 front 的 subagent 规则中**无 allow** |
| AC4 | ✅ | E2E L2-12 ok（explore 的 `bash -c 'touch …'` 被权限层拒，文件未落盘） |
| AC5 | ✅ | `librarian.permission.subagent == "deny"`（配置 + `debug agents`） |
| AC6 | ✅ | E2E L2-13 ok（`curl -o` 被拒、文件未落盘）；规则索引：`git clone *` allow → `git clone * /*` deny → `/tmp/opencode/*` allow |
| AC7 | ✅ | 静态：五个 agent 的 shell 键集合均含全部首参形态（curl/wget/git/sort/uniq，0 缺失） |
| AC8 | ✅ | 单测 `delegate-tool.test.ts`（非白名单 agent，`create` 未调用）；E2E L2-9 ok |
| AC9 | ✅ | 单测：`resume 一个已登记但 agent 不在白名单的 session 被拒` |
| AC10 | ✅ | 单测：`resume 时显式 agent 与登记 agent 不一致 → 拒` |
| AC11 | ✅ | 单测：`resume 的 canonical_root 不匹配 → 拒` |
| AC12 | ✅ | 单测：知识 grants 被拒 / 空 scope 不报错；E2E L2-10 ok |
| AC13 | ✅ | 单测：`知识 session 即使传了非空 scope，也不获得 edit allow` |
| AC14 | ✅ | 单测（core + tool）；E2E L2-10 ok（`pair.kind == knowledge`、role 无该 session） |
| AC15 | ✅ | `lookupPair` 只读 `pair.json`；`ledger.jsonl` 在 lib 中仅 append（无读）；单测"未登记 id 被拒" |
| AC16 | ✅（超时行为由同一代码路径覆盖） | 单测：正常/ busy / 校验失败三用例；"单次不产生两行"已断言。**超时路径**走同一 `registerSession` 调用，未单独断言行数（代码证据） |
| AC17 | ✅ | 单测：`backend_session_id` / `recorded_at` / `kind` / `outcome` / `host_outcome` 等断言；行构造含 12 项字段（代码 `:832-844`）；脱敏由 `redactAndTruncate` 单测覆盖 |
| AC18 | ✅（同进程） | 单测：并发两次委托，pair/role/ledger 均无丢失（proposal 已注明不覆盖跨进程 flock） |
| AC19 | ✅ | `git show --stat c81af29`：同一 commit 含 `lib/delegate-core.ts` + `opencode.jsonc.opencode-go` |
| AC20 | ✅ | `opencode reload` 后 `debug agents` 仍为首条 `* deny` + 五 allow |
| AC21 | ✅ | 单测：真实失败会话夹具回放 → `outcome=unverified` / `host_outcome=succeeded` / `no_work_evidence=true` |
| AC22 | ✅ | 单测（正常交付）+ E2E L2-3 ok（`outcome=succeeded`、`host_outcome=succeeded`、`write_tool_calls≥1`） |
| AC23 | ✅ | 单测（知识 session 不判 unverified）+ E2E L2-10 ok |
| AC24 | ✅ | 单测：`resume：历史轮次的写盘调用不得掩盖本轮零交付` |
| AC25 | ✅ | 单测：`仍在跑（wait 超时）时不得判 no_work_evidence`（`still_running=true`） |
| AC26 | ✅ | 单测：`prompt 无新活动 → outcome=unknown，不采信旧 outcome` |
| AC27 | ✅ | 单测：`run 中途换过模型（model-switched）+ 本轮零交付 → 报出来` |
| AC28 | ✅ | 单测：ledger 行 `host_outcome` 断言 |
| AC29 | ✅ | `grep -n unverified prompts/front.md` → 枚举（:70）、`host_outcome`（:71）、`no_work_evidence`（:75）、禁止事项（:114）、排障表（:125） |
| AC30 | ✅ | `git show --stat 61edd9d` 命中全部 8 类文件；`grep "v2.6 增补" docs/CHANGELOG.md` 命中（增补不改历史） |
| **AC31** | **❌ 失败** | `grep -n 'recorded_at' prompts/front.md` → **0 命中**；"标注来源"未显式写（只有"引用须带证据定位（file:line / URL）"）。ADR-front D7 明确要求"引用 ledger 须出示 `recorded_at`；引用 subagent 综述须标注来源" |

## 3. 失败项与路由

| 项 | 分类 | 路由 | 复现 |
|---|---|---|---|
| **AC31** — front prompt 缺 D7 的第二半（ledger 引用须出示 `recorded_at`、综述须标注来源） | `implementation_gap`（实现缺失，非提案漂移：ADR D7 原文已要求，proposal 也列了该 AC） | **builder** | `grep -n 'recorded_at' prompts/front.md` → 无输出 |

> 其余 30 条无失败。判定依据均来自工具证据（单测名 / E2E 用例 / 配置解析 / `git show`），无"凭 AC 文本推断"的 pass。

## 4. 遗留清扫复核

| 检查 | 结果 |
|---|---|
| `TODO` / `FIXME` / `XXX`（`lib/`、`tests/`、`prompts/`、`plugins/`） | 0 |
| 被 skip 的测试 | 0（bats 默认 skip 是**门控设计**，非忽略失败；proposal 已把"skip ≠ pass"写成规则） |
| 临时调试日志 | 0（`console.log` 无命中） |
| 未替换的 mock | 假 ctx 是测试框架本体 |
| 半截实现 | 两篇 ADR 的"明确不做"均已文档化；无未标注半截 |
| 工作区脏文件 | `cli.json`（与本次无关的 UI 偏好，未提交）；e2e 仓库的 `.rddf/`（活 session 状态，有意不入库） |

## 5. 已用轮次

- 本 change 验收轮次：**1 / 3**（`RDDF_VERIFIER_MAX_LOOPS=3`）。
- 失败项 1 条，路由回 builder 补齐后进入第 2 轮（只复验 AC31 + 确认其它 AC 未被影响）。

---

## 6. 第 2 轮复验（2026-11-09）

- 触发：builder 提交 `945003f` 修复 AC31（front prompt 补 D7 的 ledger 引用规则）。
- 复验范围：**只验 AC31 是否闭合 + 改动是否引入回归**（未重跑全量 E2E——改动仅为 prompt，`prompts/` 不参与单测/E2E 的代码路径）。

| 检查 | 结果 |
|---|---|
| **AC31-a** 引用 ledger 须出示 `recorded_at` | ✅ `grep -n 'recorded_at' prompts/front.md` → :37（"引用历史（ledger）必须给出时间锚点 … 必须出示 `recorded_at`"） |
| **AC31-b** 引用 subagent 综述须标注来源 | ✅ `grep -n '标注来源' prompts/front.md` → :36（"引用必须标注来源（file:line / URL，并说明来自 explore/oracle 等综述）"） |
| **AC31-c** 不得当已批授权 | ✅ 同 :36（`grants` 仍须 `question` 问用户） |
| 回归 | ✅ 单测 **144 pass / 0 fail / 400 expect**（`prompts/` 改动不影响代码路径）；E2E 产物仍在（9 个 run 场景），AC2/4/6/8/12/14/22/23 的判定不变 |

**结论：通过。** AC1–AC31 全部有工具证据支撑。

**残余说明（不构成失败）**：
- AC16 的"超时落一行"与 AC18 的"并发"分别依赖同一代码路径与同进程并发（proposal 已注明边界）。
- E2E 证据来自 2026-11-09 01:35 的 15/15 运行（bats commit `87c8919`）+ `.tmp-l2/run-*.json` 产物；本次 prompt 改动不在此路径上，无需重跑。

- 已用轮次：**2 / 3**（上限 3）。无未决失败项。

