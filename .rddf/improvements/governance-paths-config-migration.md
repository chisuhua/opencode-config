# governance-paths-config-migration — 治理面路径清单配置化（B1）

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：`docs/adr/ADR-governance-paths-ownership.md`（Status = **Accepted**，2026-11-23 用户签批）的 D5 实现清单 + Verification V1–V8。
> 关联 ADR：`ADR-governance-paths-ownership`（本次迁移的决策真源）、`ADR-role-aware-permissions`（D2 门控面 / D3 会话类型不相交 / D5 宣称边界 —— 本迁移**不改判定语义**）。
> ⚠ 本文件由 builder 按**内置流程**代写（`rdd-planner` skill 的 canonical precondition 未满足：本仓无 `.rddf/state/.arch-handoff.json`）⇒ 立项与 AC 编号由 planner 阶段补，之后回填 ADR 的 AC 映射。

## Why

治理面路径清单 `GOVERNANCE_PATHS` 是**政策数据**，却写在**机制代码** `lib/role-policy.ts` 里。后果是归属与写权结构性反转：architect 维护不了「什么算治理面」这份清单（`lib/**` 不在其写集），只能由 builder 凭 `**` 代改 —— 而角色矩阵同时声明「治理面产出归属 architect」。2026-11-23 实测已发生一次：为把 `opencode.json.*` 变体补进清单，须由 builder 代改。

ADR `ADR-governance-paths-ownership` 的 B1 方案：把清单迁到 `.rddf/config/governance-paths.json`（与 `arch-docs.json` 同形，政策面归 architect），机制代码留在 builder 可写面 ⇒ 「architect 能改自己的政策」与「architect 拿不到机制代码写权」两句不变量同时成立。本 improvement 落实该迁移。

## What Changes

**builder 面**

1. `lib/role-policy.ts`：`GOVERNANCE_PATHS` → `DEFAULT_GOVERNANCE_PATHS`（注释「兜底默认，只收紧不放宽」）；新增 `resolveGovernancePaths(governanceRoot)` 三态解析（读根 = **治理根**，非项目根）；`decideWrite` 的双命中消费点改吃**解析后清单**；`architect.allow` **精确**追加 `.rddf/config/governance-paths.json`；默认清单**追加自身路径**；写配置用 tmp+rename 原子替换。
2. `tests/config-guards.test.ts` 守卫族：V1–V7 的可测部分（含「项目仓同名 json 不影响判定」「双命中在解析后清单上回归」「解析后清单缺核心集 ⇒ 回退默认」）。
3. `docs/CHANGELOG.md` 一条（实现落地时写）。

**architect 面（B1 落地后自主）**

4. `.rddf/config/governance-paths.json` 初值 = 现行清单 ∪ 自身路径；此后增删自主（走治理面审查口径）。
5. `prompts/build.md` 治理面作用域表**加一行**（⇒ 表格行增删 ⇒ oracle→critic 必审）。

**过渡期（B1 落地前，ADR D4）**：清单变更须 builder 代改 + architect 在场 + critic 复核。

## Acceptance

逐条对应 ADR 的 Verification V1–V8（立项后由 planner 给出 AC 编号并回填 ADR 的 AC 映射）：

- [ ] **V1**：`.rddf/config/governance-paths.json` 缺失 / 损坏 / 为空 / 字段类型错 / **缺核心集条目** ⇒ 行为与迁移前**一致**（内置默认清单生效 + 告警），且**不是**「全拒」（修复通道保持开放）。
- [ ] **V2**：有效配置**收紧**非核心条目 ⇒ 放行行为随配置变化（读一次即生效，无需重启）。
- [ ] **V3**：有效配置**移除核心集条目** ⇒ ① 运行期**回退默认清单**（不放宽）+ 告警；② 守卫用例变红（核心集不可移除）。
- [ ] **V4**：architect 写 `.rddf/config/governance-paths.json` **成功**且 `ledger.jsonl` 留下 `role_gate_write` 行；`planner` / `verifier` 写同一文件**被拒**。
- [ ] **V5**：**项目仓**放同名 `.rddf/config/governance-paths.json` ⇒ **不影响**治理面判定（读根 = 治理根）。
- [ ] **V6**：默认清单的定义点**恰好 1 处**，且 `decideWrite` 内**无**字面清单（两处真源不成立）。
- [ ] **V7**：`d70a811` 的软链双命中毒桩在**解析后清单**上仍绿（治理名软链 → 仓库外目标仍被识别为治理面）。
- [ ] **V8**：`prompts/build.md` 治理面作用域表含 `governance-paths.json` 行 ⇒ 其变更进 oracle→critic 必审通道。

## Capabilities

- 政策所有者（architect）可直接维护「什么算治理面」，无需 builder 代改。
- 清单变更走 git 可见的配置文件 diff（不再藏在 `lib/role-policy.ts` 的常量里），审计面更清楚。
- 机制面（`lib/role-policy.ts`）仍归 builder ⇒ architect 拿不到机制代码写权（反向越权被挡）。
- 运行期 fail-closed 兜底：配置缺失 / 损坏 / 缺核心集 ⇒ 回退内置默认清单，修复通道不会因「治理面全拒」而死锁。

## Impact

- **改动面**：`lib/role-policy.ts` + `tests/config-guards.test.ts` + `.rddf/config/governance-paths.json`（新增）+ `prompts/build.md` + `docs/CHANGELOG.md`。三面（机制 / 守卫 / 配置）+ 治理面文档 ⇒ **须走 oracle→critic**（改 `lib/**` 与守卫断言 = 治理面必审）。
- **回滚**：B1 落地后 registry 的 `governance-paths-config` 条目须从 `exempt/not-implemented` 转 `active` + 配回滚清单（`.rddf/rollback/governance-paths-config.json`）；`M3` 会在 watch 路径 `.rddf/config/governance-paths.json` 出现时强制重定性。
- **残余风险 R1（沿 ADR）**：能改清单的角色不止 architect（builder / general 的 `**` 与 `governance: true`）⇒ 由核心集守卫 + 治理面审查 + `role_gate_write` ledger 留痕三层兜底；本迁移不宣称比现状更强。
- **不在本次范围**：`lib/**` 的架构文档归属收口（§4.6 / §4.4）与 planner 内置流程写集放开（§4.2）—— 那是另一批（已在角色对齐审计里裁决并单独落地）。
