# 债务审计报告：front / delegate 改造后的遗留项

- 日期：2026-11-09
- 角色：verifier（只审计，不改）
- 范围：`~/.config/opencode`（治理面 + 实现 + 文档 + 测试）与 `/workspace/main/rdd-workflow-e2e`（E2E 仓）
- 方法：逐项取证（配置解析 / `git` 事实 / grep / 跑现成校验脚本），不做印象式判断

## 0. 结论

**有遗留，且有 1 项 P1 会让后来人得到与现状相反的结论。** 共 11 项：P1 四项、P2 四项、P3 三项。另有 4 类"已核实无债"的项（记录在 §4）。

## 1. P1 —— 建议本轮清理

| # | 债务 | 取证 | 风险 | 处置 | 归属 |
|---|---|---|---|---|---|
| **D1** | **旧 ADR `adr-front-agent-redesign.md` 未标注被取代** | `Status=Proposed`；其 D4「subagent 保持 deny」已被 `ADR-front-knowledge-capability` 作废；D2 的 outcome 枚举已被 `ADR-delegate-delivery-evidence` 扩展；`busy` 早已漂移进去却没回写；全文 **0 次**提到两篇新 ADR | 后来人读它会得出"front 不能调 subagent""outcome 只有 4 个"的**反向结论** | 在其元数据加"部分被取代"指针（哪条作废、哪条扩展），状态改 `Superseded`（部分） | architect |
| **D2** | **守卫无漂移检测、配置不可复现重建** | 五个 agent 的 shell 守卫是手写 JSON；本次由 `/tmp/opencode/probe/harden.py`（**临时脚本，未入库**）生成；`tests/` 无任何"配置 vs ADR D3.1 清单"的比对 | 本轮已因配置漂移出事**两次**（subagent 规则顺序、curl 首参形态）——下一次没有闸门 | ① 生成脚本入库（`scripts/agent-guard-gen.ts`）；② 加 `tests/config-guards.test.ts`：断言五个 agent 的 shell 键集合 ⊇ ADR D3.1 全清单、且 `front.subagent` 首条为 `*: deny` | builder |
| **D3** | **`prompts/front.md` §4.1 状态扫描清单缺 `ledger.jsonl`** | §4.1 的表只有 `role.json`/`iteration.json`/`improvements/`/`openspec/changes/*/tasks.md`/`reviews/`/`pair.json`；**没有 ledger.jsonl**（而 §2.1/§3.3 已要求"引用历史须出示 recorded_at"） | 规则与路径不自洽：front 被要求出示 `recorded_at`，但"去哪儿读状态"的表里没有账本 → 找不到账本、要么瞎编要么不用该能力 | §4.1 表加一行 `<工程>/.rddf/state/ledger.jsonl`（历史事实，含 `recorded_at`） | builder |
| **D4** | **e2e 仓 `.rddf/` 未被 gitignore** | e2e 仓 `.gitignore` 只有 `.bats-tmp/` 与 `.tmp-l2/`；`.rddf/state/`（含活的 session id）只是"未跟踪" | 主仓专门 ignore 了 `pair.json`/`role.json` 正是这个原因；e2e 仓一次 `git add -A` 就入库 | e2e 仓 `.gitignore` 加 `.rddf/`（或至少 `.rddf/state/`） | builder |

## 2. P2 —— 当前态文档漂移（建议本轮一并修）

| # | 债务 | 取证 |
|---|---|---|
| **D5** | `docs/MULTI-AGENT-DESIGN.md`（**当前态**文档）未收录 `unverified`；§2.1 脚注只写 `"*": deny`，**未表达"顺序是硬约束"**（ADR D2.1） | `grep unverified` 0 命中；:661 脚注无顺序说明 → 后人可能把 `*: deny`"修回"末尾，工具又被整体隐藏 |
| **D6** | `docs/front-delegate-testing.md` 测试项数过时 | 文档写「63 项 / core 51 / tool 12」；实际 **core 76 / tool 35 / model-fallback 33 = 144** |
| **D7** | 旧验收报告结论已过时 | `.rddf/reviews/front-knowledge-capability-verify.md` 仍写「3 项运行时强制判据**阻塞**，需 service restart 后复验」——已被 `front-knowledge-capability-acceptance.md`（AC1–AC31 全过）取代 |
| **D8** | 旧 improvement 仍是 draft | `.rddf/improvements/front-agent-redesign.md` 状态 `draft`、关联 ADR 写 "Status: Proposed" → 治理台账与现实脱节（其工作已由 `front-knowledge-capability` change 收口） |

## 3. P3 —— 卫生项（可后置）

| # | 债务 | 取证 | 处置建议 |
|---|---|---|---|
| **D9** | 守卫生成脚本未入库 | 仅存在于 `/tmp/opencode/probe/harden.py` | 随 D2 一并入库 |
| **D10** | E2E fixture 堆积 | `/workspace/main/rdd-workflow-e2e-l2/` 下 **36 个目录 / 14M**（含活 session 记录） | 加清理脚本或 CI 清理；至少手工清一次 |
| **D11** | `cli.json` 长期既不提交也不忽略 | 每次 `git status` 都脏 | 二选一：提交（它是本机 UI 偏好）或加进 `.gitignore` |

## 4. 已核实**无债**的项（避免重复排查）

| 项 | 核实方式 | 结论 |
|---|---|---|
| 旧委托链路脚本 | `ls scripts/` | `delegate.sh` / `captoken.sh` **已退役不存在**（旧 ADR 称其退役，已核实） |
| lib 死代码 | 逐个 export 的引用计数（`kindOfAgent`…`delegateToolDefinition`） | 全部 ≥1 次使用，**无未使用导出** |
| 治理面规则与 critic 判据漂移 | `bash tests/verify_arch_docs_scope.sh` | **PASS=64 FAIL=0** |
| 守卫首参形态是否漏配 | 解析五个 agent 的 shell 键集合 | AC7 要求的 16 个首参形态**全部在位**，0 缺失 |

## 5. 建议的清理批次

**批次 A（builder，一包）**：D2（脚本入库 + 漂移测试）、D3（front.md 扫描清单）、D4（e2e .gitignore）、D6（测试文档数字）、D7（旧报告加"已被取代"抬头）。
**批次 B（architect，一包）**：D1（旧 ADR 的被取代指针 + 状态）、D5（MULTI-AGENT-DESIGN 收录 `unverified` 与顺序约束）、D8（旧 improvement 状态）。
**批次 C（可选）**：D9/D10/D11（卫生）。

风险提示：D5 与 D1 都要改**当前态/已签批文档**，按治理面规则需 oracle→critic；建议与批次 A 合并为一次提交后再审。

---

## 6. 闭环记录（2026-11-09，verifier 复判）

| # | 状态 | 证据 |
|---|---|---|
| **D1** | ✅ | 旧 ADR 有「被取代条款」行 + `Status=Accepted——…**非终验全绿**…`（如实标注）+ 正文两处旧表述加删除线 |
| **D2** | ✅ | `scripts/agent-guard-rules.ts`（真源，覆盖 **front + 五个 subagent**）+ `scripts/agent-guard-gen.ts` + `tests/config-guards.test.ts`（**13 项**）；`bun scripts/agent-guard-gen.ts` → 无漂移；**顺带关掉 front 侧相对路径写 CWD 的绕过**（front 缺首参形态 → 已补，配置 88 → 117 条规则，allow 数不变） |
| **D3** | ✅ | `prompts/front.md` §4.1 已含 `ledger.jsonl`（grep 命中 2 处：规则 + 扫描表） |
| **D4** | ✅ | e2e 仓 `.gitignore` 含 `.rddf/`（commit `d21fe9a`） |
| **D5** | ✅ | `docs/MULTI-AGENT-DESIGN.md` 已收录 `unverified`（grep 命中）与「顺序是硬约束」；front shell 脚注补首参形态 + 真源/闸门指针 |
| **D6** | ✅ | `docs/front-delegate-testing.md` / `docs/dual-session-delegation.md` 数字统一为 **157 项**（core 76 / tool 35 / config-guards 13 / model-fallback 33） |
| **D7** | ✅ | 旧验收报告加「已被取代」抬头，指向 `front-knowledge-capability-acceptance.md` |
| **D8** | ✅ | 旧 improvement 状态改为「核心链路验收通过（非终验全绿）」+ ADR 指针；旧验收报告表头数字订正 |
| **D9** | ✅ | 生成脚本已入库（`scripts/agent-guard-gen.ts`），`--write` 幂等（重复执行无 diff） |
| **D10** | ✅ | E2E fixture 堆积 **36 目录 / 14M → 0 / 512B** |
| **D11** | ✅ | `cli.json` 已提交（commit `a55f82c`），工作区干净 |

**本轮新增并同批收口（原 P2-3）**：front 纳入真源并补首参形态（**安全修复**）、`REQUIRED_GUARD_SET`（真源 ↔ ADR 全量 deny 族锚）、**round-trip 用例**（注入漂移 → 修复 → JSON 可解析 → 规则全等 → 幂等）。取证实验结论：**单独改坏真源会被漂移测试抓到**（5 条失败）；真正的残留是「改坏真源 + 跑 `--write` 同步成坏源」→ 已由 ADR 锚覆盖。

**验证**：`bun test tests/` → **157 pass**；`bun scripts/agent-guard-gen.ts` → 无漂移；`bash tests/verify_arch_docs_scope.sh` → PASS=64 FAIL=0；E2E **15/15**（front 配置变更后复跑）。

**剩余开放项**：无（本审计 11 项 + 新增 3 项全部闭环）。已知残留仍是**有意披露**的边界（ADR D3.1 短选项组合 / `artifacts` git 可见口径），不属本审计范围。
