# 审稿报告：ADR-front-knowledge-capability

- 日期：2026-11-08
- 审稿对象：`docs/adr/ADR-front-knowledge-capability.md`
- 档位：`arch`
- 结论：**APPROVE_WITH_CONDITIONS**（0 BLOCKER；3 条 SHOULD_FIX 已修；无复审需求）
- 关联探针：`.rddf/reviews/front-subagent-granularity-probe.md`

## 1. 审查序列与预算

| 序 | 审查者 | 轮次 | 结论 | 处置 |
|---|---|---|---|---|
| 1 | oracle | 1 | `BLOCK`（2 BLOCKER） | 修 ADR |
| 2 | oracle（闭合复审） | 1 | `PASS-WITH-NOTES`，两 BLOCKER 均闭合 | 收 Notes |
| 3 | critic（arch） | 1 | `APPROVE_WITH_CONDITIONS`，`mergeable: yes`，`scope_exceeded: false` | 修 3 条 SHOULD_FIX |

预算：oracle 1 轮 + 1 次闭合复审（BLOCKER 允许）｜critic 1 轮（上限 2）。未超。

## 2. oracle 第一轮 BLOCKER 与闭合证据

| BLOCKER | 内容 | 闭合证据 |
|---|---|---|
| 1 · D3 | ADR 声称 curl 写入被守卫拦截，但清单无 curl/wget 规则；缺 `find -fls`；`git clone` 目标不可约束；D3 不能是 front 清单的复制 | D3 增加逐 agent diff 表；补齐网络写落盘 6 条 + 网络外泄 5 条 + `find * -fls*`；clone 目标收敛为 `git clone * /* deny` → `git clone * /tmp/opencode/* allow`；无目标 clone 写 CWD 列为明示残留 |
| 2 · D4(H1) | resume 分支只校验 pair 存在性 + `canonical_root`，不校验 agent，白名单被绕过 | D4 新增 H1b 行：resume 时校验 pair 条目的 `agent` 字段，白名单在 create/resume 共用；Verification 增对应判据 |

## 3. oracle 闭合复审的 Notes 与处置

| Note | 处置 |
|---|---|
| `/tmp` vs `/tmp/opencode`（本机沙箱禁止通用 `/tmp`） | 已改为 `git clone * /tmp/opencode/* allow`，残留说明与 Verification 用例同步 |
| librarian 绝对路径读取全面放开需明示 | 已加入「后果 / 风险」：不套 front 的 `* /*` 守卫，read/grep/glob 受 `external_directory` 约束、shell 读不受约束 |

## 4. critic 结论与 SHOULD_FIX 处置

| finding | 级别 | 处置 |
|---|---|---|
| Parent 元数据未声明旧 D3（scope 必填）与 D6（登记协议）的取代/保留边界 | SHOULD_FIX | 已改 Parent：明确旧 D3 的 scope 必填仅对 `kind=engineering` 有效；D6 扩展 `kind` 字段，其余继续有效 |
| "`delegate` 仍是唯一 session 创建通道"与 subagent 会建 session 的事实矛盾 | SHOULD_FIX | 已改为"唯一的**登记型**通道"；subagent 建的探索 session 不走 pair 登记、不可 resume |
| D3 标题"必须先于 D2"与"同一 patch"措辞张力 | SHOULD_FIX | 已统一为"同一 patch 内先落加固、再开放，原子生效" |

NITS（记录、不改）：

- D5 的 append 锚定哪个调用点需在 tasks 中写明（busy 分支早退 / wait 后数据才齐）。
- H3 落地时知识 session 在 wait 后调用点的行为需明确（更新 `last_used_at` 但不碰 `role.json`）。

## 5. 复核建议（转 planner / builder）

- `sed -n '30,78p' lib/delegate-core.ts` 核对 `GRANT_FORBIDDEN`/`GRANT_ALLOWED`（critic 标注为推断未验证）。
- `sed -n '186,240p' lib/delegate-core.ts` 作为 H1a 的落地锚点。
- 配置消防态检查（Verification 第 15 条）：不存在"front 已放行、后端未加固"的组合。

## 6. 关联 change

未立项，登记为 `backlog: front-knowledge-capability`。立项后由 planner 回填 AC 编号，architect 回填 ADR 的 AC 映射。

---

## 7. 治理面配置 patch 审查（同一 patch series）

- 送审对象：`opencode.jsonc`（→ `opencode.jsonc.opencode-go`）、`prompts/front.md`、`prompts/{explore,oracle,metis,librarian}.md`
- 档位：`arch`
- 结论：**APPROVE_WITH_CONDITIONS**，`mergeable: yes`，`scope_exceeded: false`，**0 BLOCKER**

critic 逐块核实：front 六条 subagent 规则忠实 D2；五个 shell 块均为 `"*": deny` 首条、守卫在 allow 之后；librarian clone 收敛自洽且无 `* /*`；消防态闭合（放行与加固同 batch）；front.md §2.1 与旧 ADR D1/D2/D5 无冲突。

| SHOULD_FIX | 处置 |
|---|---|
| oracle/metis 的 `git describe *` 为未声明减项 | ADR D3 减项表已补 `git describe *` |
| `critic.md` 教 `sed -n`，但白名单无 `sed` | 已从 critic.md 的工具纪律中删去 `sed -n` |
| `librarian.md` 的 clone 目标写 `/tmp`，配置只放行 `/tmp/opencode/*` | prompt 两处已改为 `/tmp/opencode` |
| ADR 守卫清单漏列 `git * --format*` / `git * --pretty*` | ADR D3 已补 |
| NIT：front.md「其余 agent（general/plan/build）」不够精确 | 已改为「其余全部」 |

**遗留（未在本次修复，转 verifier）**：端到端运行时强制测试未做；prompt 内容改动需 `opencode service restart` 才生效。

---

## 8. 增补复审（2026-11-08，E2E 实测触发的 D2.1 / D3.1）

**触发原因**：实现落地后的真实运行时 E2E（bats，`/workspace/main/rdd-workflow-e2e/tests/integration/test_front_delegate_runtime.bats`）暴露两处静态检查看不出来的约束——① front 的 `subagent` 规则把 `"*": "deny"` 放在末尾 ⇒ opencode 的 `whollyDisabled`（取该 action 最后一条匹配规则）**把整个工具隐藏**，逐 agent allow 从未生效；② glob 守卫 `curl * -o*` 匹配不到 `curl -o /tmp/x URL`（首参形态），实测 librarian 真的落盘。ADR 是漂移检查与实现的唯一依据，故必须回填。

| 序 | 审查者 | 结论 | 处置 |
|---|---|---|---|
| 1 | oracle | `PASS-WITH-NOTES`，0 BLOCKER，5 条 SHOULD_FIX | 全部修（见下） |
| 2 | critic | `APPROVE_WITH_CONDITIONS`，0 BLOCKER，4 条 SHOULD_FIX | 全部修（见下） |

**oracle 5 条 SHOULD_FIX 的处置**：

| finding | 处置 |
|---|---|
| D3.1 对 `git --output=x` 的推理错误（称 `*` 可匹配空串即命中——实际模式含两个字面空格，不命中） | 已订正，并据此把 git 首参形态纳入对照表；新增"实现状态"列区分决策与落地 |
| 通则过强（把"补首参形态"说成充分条件） | 已拆为：① 通则（必要条件）② 短选项组合 / 配置化输入（`curl -so`、`curl -sO`、`curl -K -`）列入**已知残留**，明示不可由 glob 穷举 |
| D2.1 对 L2-14/L2-15 分工的表述与实现不符（L2-14 当时只检集合、不检顺序） | 已改为准确表述，并新增"顺序的回归闸"小节（L2-14 须含顺序断言，**当前缺**） |
| D3 守卫清单与 D3.1 对照表两处维护会漂移 | 已在 D3 加"实现纪律"段（必须同批落地、写进同一份规则） |
| 元数据指向的"审稿报告 §8"悬空 | 即本节 |

**critic 4 条 SHOULD_FIX 的处置**：

| finding | 处置 |
|---|---|
| §8 悬空引用 | 即本节（oracle 提、critic 复核仍悬空——本节补齐后闭合） |
| **`sort -o*` / `uniq -o*` 首参形态缺失**（D3.1 对照表只列 curl/wget/git） | 已补入对照表；并在 ADR 中论证 `tee` / `find` 为何不需要首参形态 |
| git 首参形态被"已补"二字掩盖成已落地 | 对照表新增"当前落地状态"列，git / sort / uniq 标为 **⬜ 待落地** |
| D2.1 与风险章把 L2-14 的顺序断言说成已覆盖 | 已改为"须含顺序断言（当前缺）" |

**本节遗留的实现动作（转 builder）**：① 配置补 git / sort / uniq 的首参形态守卫；② L2-14 补顺序断言；③ 两项落地后回填 ADR 对照表的落地状态与本节。

