# 验收报告：plan-multi-session-collaboration

> 验收角色：verifier（主会话）｜日期：2026-11-20｜已用轮次：**1 / 3**
> 判据来源（按优先级）：① 用户本次要求（「充分考虑验证面，最终通过 verifier 才归档」）；② `openspec/changes/plan-multi-session-collaboration/proposal.md` 的「验收标准」AC1–AC18（**主判据**）；③ 本次变更声明（ADR D1–D8）；④ ADR V01–V15。
> 结论：**不通过（`needs-revision` / `proposal_drift`）** —— A 组自动化与配置面**全部通过**；2 条 AC 的**判据描述与实现不符**（不是实现缺陷），需 planner 修正措辞后复审。

---

## 1. 逐条判定

### A 组：自动化（唯一真实闸门）

| AC | 判定 | 证据 |
|---|---|---|
| AC1 `bun test tests/` 0 fail | ✅ | `969 pass / 0 fail / 4149 expect() calls / 25 files` |
| AC2 anchors `RESULT: OK` 且 N ≥ 23 | ✅ | `RESULT: OK（29/29 个语义锚点全部命中）` |
| AC3 `plan-worker` 形态 | ✅ | `tests/config-guards.test.ts` AC3（mode=subagent / edit 恰好一条 / 六+四 action deny / shell 首键 deny + `* > *`·`tee *`·`sort -o*` / 白名单无 bun·node）；`opencode debug agents` 佐证 `edit: {*: deny, *.rddf/plan-topics/*: allow}` |
| AC4 可派者集合 | ✅ | 同文件 AC4（显式 allow == {build, plan}；无键闭集 == ["title"]；front 不含 plan-worker；plan-worker 自身 deny）；`debug agents` 佐证 Plan.subagent=allow |
| AC5 GUARDED_AGENTS | ✅ | `agent-guard-gen.ts --check` → `OK：7 个 agent 的 shell 块与规则真源一致（无漂移）` |
| AC6 EXPECTED 清单 | ✅ | 新增文件闸门用例通过（`EXPECTED.prompts` 含 plan-worker.md；`EXPECTED.lib` 含 plan-topics.ts） |
| AC7 capability 块 | ✅ | AC23 用例通过（plan 块 == 配置派生值，含两条新 edit 项） |
| AC8 plan edit 顺序 | ✅ | AC8 用例通过（首键 `*`；两条新项 `indexOf > 0`） |
| AC9 `.gitignore` 双向 + 黑名单 | ✅ | AC9 用例（fixture 仓）：`plan-sessions.json` exit 0；协作产物非 0；`foo.lock` / `x.bak` / `backup1` exit 0 |
| AC10 checker 负向 fixture | ✅ | `tests/plan-topics.test.ts` 31 例（schema / node id / 重复 id / 成环 / 悬空 dep / 零 checkbox / 模板占位 RESULT / 缓存分叉 / brief 篡改 / 孤儿双向 / 空 topic） |
| AC11 CLI 退出码 + `--json` | ✅ | 同文件（0/1/2/3 四值；2/3 stdout 为空；`--json` 可解析且 code 属闭集） |
| AC12 `scope-check` | ✅ | 同文件（fixture 仓检出越界；非仓 ⇒ git_error 非零；跑前后 `git status` 逐字相同） |
| AC13 `lock` 只读报告 | ✅ | 同文件（present / owner / binding；不改文件）+ 本次真实取证 `{"present":true,"owner":"ses_probe","binding":null}` |
| AC14 既有口径零回归 | ✅ | 全量 969 pass（delegate / 角色写门 / front 顺序守卫未回归）；`prompts/plan.md` 的 `.rddf/plans/` 与 `plan_ref` 口径未改 |

### B 组：人工 e2e（主会话执行）

| AC | 判定 | 证据 |
|---|---|---|
| AC15 配置生效 | ✅ | `opencode debug agents` 列出 `plan-worker`（mode=subagent）；`Plan` mode=primary、subagent=allow |
| AC16 九探针 | ⚠ **部分不成立** | ①③④⑤⑥ 中：②④ 有证据（子会话 `parent_id` == plan 父会话；父收到子结果全文）；③ 不可取证（plan-worker 无 `printenv`）；①⑤⑥ 未执行。**⑦ 成立、⑨ 成立（配置级）；⑧（「子写别的 topic 被拒」）不成立** —— 见 §2 |
| AC17 抢锁 | ⚠ **部分** | 原子 `mkdir` ✅（第二次失败）；`lock` 只读报告 ✅；**「第二个根会话的写入被拒」不成立为机械判据** —— 见 §2 |

### C 组：归档前置

| AC | 判定 | 证据 |
|---|---|---|
| AC18 verifier verdict == pass | ❌ | 本报告结论为 `needs-revision` ⇒ 不得归档 |

---

## 2. 失败项与路由（`proposal_drift`）

### 失败项 1：AC16 的「子写**别的 topic** 被拒」不成立

- **判据文本**（proposal AC16 / 路线图 §3.3 I2⑧）：子会话 edit 别的 topic 路径 ⇒ 权限拒。
- **实际**：`plan-worker` 的 `edit` allow = `*.rddf/plan-topics/*`；`Wildcard` 的 `*` → `.*` **跨斜杠**（锚点 P6 钉住）⇒ **匹配所有 topic** ⇒ 跨 topic 写**被允许**。
- **与 ADR 一致**：ADR D4 明写「前缀语义，只能到 **topic 树粒度**，不能到 node 粒度」⇒ 实现没错，是 **proposal 的判据描述写错**。
- **路由**：**planner**（改 proposal AC16 + 路线图 §3.3 的措辞）。建议改为：「跨 topic 写**不被拒**（topic 树粒度，ADR 残留 #1）；同 topic 内跨 node 写也不被拒 —— 越界靠 `scope-check` 事后核对」。

### 失败项 2：AC17 的「第二个根会话被拒」是协议级，不是权限级

- **判据文本**（proposal AC17）：两真实 plan 会话抢同 topic ⇒ 第二个被拒。
- **实际**：`plan` 的 `edit` 白名单同样是 `*.rddf/plan-topics/*` ⇒ 第二个会话**有权限写**；「仅 owner 可写」只是 prompt 协议（ADR D7），不是权限门。
- **可机判的部分**：原子 `mkdir`（✅ 已取证）+ checker `lock` 只读报告（✅）。
- **路由**：**planner**（把 AC17 改为「协议级」：`mkdir` 原子性 + checker 报告；并发语义靠协议 + 人确认，ADR D7 已如此声明）。

---

## 3. 遗留清扫复核（本次范围内）

| 检查项 | 结果 |
|---|---|
| TODO / FIXME / XXX | 无（grep 命中的均为文档/注释中的「TODO.md」文件名） |
| 半截实现 | 无（tasks.md 58/62 已勾；未勾 4 项 = H5 + I1–I3，其中 I1–I3 已在本报告取证/登记） |
| 注释掉的代码 | 无 |
| 临时调试日志 | 无（无 `console.log`） |
| 被 skip 的测试 | 无（无 `test.skip` / `describe.skip`） |
| 未替换的 mock | 无（测试全部用 `mkdtemp` 真文件 + `git init` fixture 仓） |
| 临时 fallback | 无 |

**范围外的历史遗留（只记录，不清理）**：`.rddf/state/ledger.jsonl`（角色租约台账）未被 `.gitignore` 覆盖 —— 属既有缺口，本 change 未处理。

## 4. 已用轮次

**1 / 3**。修完 §2 的 2 条 proposal 措辞后，**第 2 轮只复审这 2 条**（不做全量重验）。

## 5. 归档门

AC18 要求 `.rddf/state/verifier/plan-multi-session-collaboration.json` 的 verdict == `pass`。

---

## 6. 复审（第 2 轮，只验第 1 轮的 2 项）

| 项 | 修正 | 复核证据 | 结论 |
|---|---|---|---|
| AC16 | 改为「`lib/x.ts` 与 `..` 穿越**被拒**（配置级）；**跨 topic 写不被拒**（topic 树粒度 = ADR 残留 #1）」 | `Wildcard.match(…, "*.rddf/plan-topics/*")` 实测 4/4：`lib/x.ts` → false；跨 topic → **true**；`.rddf/state/role.json` → false；同 topic node → true | ✅ 措辞与实现一致 |
| AC17 | 改为「锁为**协议级**（非权限门）：原子 `mkdir` 第二次失败 + checker `lock` 只读报告」 | 第 1 轮已取证：`mkdir` 首次 OK / 第二次 FAIL；`lock` → `{present:true, owner:"ses_probe", binding:null}` | ✅ 措辞与实现一致 |

**回归**：`bun test tests/` **969 pass / 0 fail**；`check-upstream-anchors.sh` → `RESULT: OK（29/29）`。

**环境噪音（已复位，非本次变更）**：复审期间 `opencode run` 的 model-fallback 改写配置（explore / librarian / general / title 的 model），已 `git checkout -- opencode.jsonc.opencode-go` 恢复到已提交状态；重跑全绿。

**结论：`pass`**（已用轮次 2 / 3）。AC18 满足 ⇒ 允许 `openspec archive`。

---

## 7. 归档后债务清理（第 3 轮，2026-11-20）

用户要求「还有遗漏/债务吗」⇒ 全量盘点后**已修**：

| # | 债务 | 类型 | 处置 |
|---|---|---|---|
| 1 | `checkTopic` 对**非法 node id** 仍做磁盘派生（`nodes/../evil/TODO.md` 可读到 topic 外） | **真缺陷（安全/正确性）** | 派生类检查改用「只含合法 id」的图；新增测试「非法 id 不产 cache_mismatch」 |
| 2 | `dispatchableNodes` 是**死导出**（tasks 声称的 `assertDispatchable` 未接任何入口） | 半截实现 | 接 CLI `ready <topic>` 子命令 —— D2 判据 2（deps 未全 done 不得派发）有了机械载体；新增 3 例测试 |
| 3 | `scope-check` 的 `before` 过滤**恒真**（多一次 `git ls-tree` 且误导读者） | 死逻辑 | 删除，`changed = diff ∪ untracked` |
| 4 | `graph.json` 的 `attempts` 元素**不校验结构** | schema 过松 | 加 `agent` / `started_at` 必填校验 + 3 例负向测试 |
| 5 | `lock` 的 `sessions[owner ?? ""]` | 小边界 | 改为 `owner && …` |
| 6 | 测试文件末尾 `import` + 冗余 `writeNode(tmpTopic(), id)` | 代码卫生 | import 移顶部；删冗余 |
| 7 | `docs/MULTI-AGENT-DESIGN.md` 写「10 个 agent」（实际 12） | 既有文档漂移 | 改为 12（4 primary + 8 subagent） |
| 8 | roadmap 的「关联 change：待立项」 | 归档后漂移 | 改为已归档路径 |

**登记为债务、本轮不修**（写明理由，交用户决定）：

| # | 项 | 为什么不修 |
|---|---|---|
| 1 | `.rddf/state/plan-sessions.json` **无写入脚本** | 父会话可用 `edit` 写（`plan` 的 edit 白名单已放行该文件）；补脚本需定义原子写的触发点，属新功能 |
| 2 | `prompts/plan.md` 与 `prompts/plan-worker.md` 的**共同纪律段重复**（ADR 残留 #3） | 需先定「共同段」的抽取规则，否则守卫会误伤措辞差异 |
| 3 | `countCheckboxes` 对**缩进 fenced code**（`  ``` `）不剥离 | 边界极窄（TODO.md 惯例顶格），且可用 `isNonEmptyResult` 兜底 |
| 4 | `.rddf/plan-topics/e2e-probe/graph.json` 缓存故意过期 | 作为 e2e 证据（证明 checker 抓分叉）；可随时删 |
| 5 | `.rddf/state/ledger.jsonl` 未被 gitignore | **范围外既有缺口**，只记录不清理 |

**清理后回归**：`bun test tests/` → **972 pass / 0 fail**（27 文件 / 4158 断言）；`check-upstream-anchors.sh` → `RESULT: OK（29/29）`；`agent-guard-gen --check` 无漂移。
