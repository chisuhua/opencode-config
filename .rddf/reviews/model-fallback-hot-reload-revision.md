# 审稿记录 — §6.7 热加载 vs 重启口径收口（C4）

> **对象**：`docs/MULTI-AGENT-DESIGN.md` §5.4「生效时机」行 / `docs/model-fallback-usage.md`「改完必须重启」段 / `.rddf/rollback/model-fallback.json` edit #6 锚点 / `.rddf/rollback/registry.json`（`proving → active`）/ `docs/adr/ADR-role-aware-permissions.md` D5⑥ / `tests/role-exemptions.test.ts` D5⑥ 注释 / `docs/CHANGELOG.md` v2.65
> **触发**：`.rddf/reviews/build-model-route-switch-ab.md` §6.7 + §7.2；角色对齐审计 `.rddf/reviews/role-matrix-rdd-workflow-alignment-audit.md` 的遗留清单
> **角色**：builder（主会话）
> **日期**：2026-11-23
> **预算**：oracle 1 轮（`审查域: 治理面`）+ critic 1 轮 ⇒ 均在额度内；无 BLOCKER，无复审

## 0. 结论

| 审查者 | 判定 | 结果 |
|---|---|---|
| oracle（`审查域: 治理面`） | `治理面判定: PASS-WITH-NOTES` | 1 条 NOTE：`tests/role-exemptions.test.ts:15` 的 D5⑥ 注释仍写「未 `service restart`」，与 ADR D5⑥「已同批订正」不符 ⇒ **已修** |
| critic（`review_profile: arch, build`） | `APPROVE_WITH_CONDITIONS` / `mergeable: yes` / `scope_exceeded: false` / **0 BLOCKER** | 1 条 SHOULD_FIX：ADR D5⑥ 写「已…并重跑 drill」时态二义（drill 尚未跑）⇒ **已改为时态中性、指向 `last_drill` 证据**；2 条 NITS 记录不改 |

## 1. oracle 要点

- 两处新口径一致且如实（源码构建版 vs 发布版）；「运行中会话立即换用新配置」的**未实证**标注充分，不诱导过度推断。
- edit #6 是唯一需要同步的笔误锚点：usage 手册在 `delete` 列表（非 edit）；其余 MAD 引用（provider 表 / 选型表 / 文件树 / 验证表 / 已知限制 6）不含「生效时机」旧文本。
- `proving` 状态机符合 ADR M9（清单存在 / `adr_primary` ∈ 声明集 / `watch` 三路径存在 / 无 `pending_backlog` / `last_drill` 可缺失）；「提交 A → drill → 回填转 active → 提交 B」正是自举死锁段的标准解法。
- NOTE 的处置：改 `tests/role-exemptions.test.ts` 注释，删「未 `service restart`」+ 加订正注记（守卫只查 `D5⑥` 标识符与说明长度，不查措辞）。

## 2. critic 要点

**focus 应答**：
1. **口径一致性**：MAD §5.4 与 usage 手册对版本区分一致，无矛盾；限定与 ADR D5⑥ 同源；无新的绝对断言（「发布版才需重启」标 `历史事实` + 有「不确定就重启」兜底）。
2. **锚点同步完整性**：14 条 edit 逐一核过，仅 edit #6 含被改正文；`proving` 分支允许证据缺失，M1 把 proving 与 active 同等纳入清单集合比对 ⇒ 过渡态成立。
3. **测试注释耦合**：无 —— 守卫只查标识符存在；判别力变异测试变异对象是 AC 面文本，非本文件头。

**SHOULD_FIX 处置**：ADR D5⑥ 的「…并**重跑 drill**」改为「…清单变更按 D5 走 `proving → active`（drill 基于含本订正的提交，回填证据见该清单的 `last_drill`）」—— 不声称已完成也不声称待办，指向证据本身。

**NITS（记录不改）**：① 旧文「edit #5」被静默修正为「edit #6」（按数组序确为第 6 条，修正正确）；② `docs/model-fallback-usage.md` 排障表仍保留 `service restart` 建议 ⇒ oracle 已登记为后续债（其它机制文档口径，不在本批）。

## 3. 落地与验证

| 步 | 内容 | 结果 |
|---|---|---|
| 提交 A | `ddaa0a0`：文档口径 + edit #6 锚点同步 + registry 转 `proving` + ADR D5⑥ + role-exemptions 注释 + CHANGELOG v2.65 | 7 文件 |
| drill | `bun scripts/rollback-drill.ts .rddf/rollback/model-fallback.json`（隔离副本，基线 `ddaa0a0`） | **PASS**（回滚后 `bun test tests/` 全绿） |
| 回填 | `last_drill = { sha: ddaa0a056393fabb2afe10ee965b31829eddacd8, at: 2026-11-23, result: pass, content_hash: 481b7a74… }`；registry `proving → active` | `bun scripts/rollback-registry.ts` = PASS（active=13 / proving=0） |
| 提交 B | `c5b79e2`：回填 last_drill + registry notes | 2 文件 |

**验证**：`bun test tests/` = 1115 pass / 1 skip / 0 fail；`scripts/check-upstream-anchors.sh` = 29/29；`bun scripts/rollback-registry.ts` = PASS；`content_hash` 复算与记录一致。

## 4. 后续债（本批不做）

- `docs/dual-session-delegation.md` / `docs/front-delegate-testing.md` / `docs/front-delegate-usage.md` 的 `opencode service restart` 排障建议与源码构建版热加载事实有张力 —— 属**其它机制的排障口径**，oracle 建议登记为后续债，不在 §6.7 范围。
- `prompts/build.md` 角色列表 architect 行「编辑治理面文件 `~/.config/opencode/**`」的括注收紧（oracle NOTE-1，另批）。
