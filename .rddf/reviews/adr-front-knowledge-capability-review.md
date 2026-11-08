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

