# governance-paths-config-migration — 治理面路径清单配置化（B1 机制落地）

> **判据真源**：`docs/adr/ADR-governance-paths-ownership.md`（**Status = Accepted**，2026-11-23 用户签批）的
> D5 实现清单 + Verification V1–V8。本文件把 V1–V8 编号为 AC1–AC8，**不复制判据正文**（ADR 是单一真源）。
> **登记来源**：`.rddf/improvements/governance-paths-config-migration.md`（5 段草稿）。
> **审计来源**：`.rddf/reviews/role-matrix-rdd-workflow-alignment-audit.md` §4.6 / §5。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在（无 `.rddf/state/.arch-handoff.json`）⇒ 走**内置流程**起草。

## Why

治理面路径清单 `GOVERNANCE_PATHS` 是**政策数据**，却写在**机制代码** `lib/role-policy.ts` 里。后果是归属与写权结构性反转：

- `architect` 的可写集 = `arch_paths` 命中目录 + `.rddf/reviews` + 治理面豁免；`lib/**` **不在** `GOVERNANCE_PATHS`，也不在 architect 写集 ⇒ **architect 改不了「什么算治理面」这份清单**。
- `builder` 凭 `**` 可以改 —— 而角色矩阵同时声明「治理面产出归属 architect」。
- 2026-11-23 已发生一次：为把 `opencode.json.*` 变体补进清单，须由 **builder 代改**（见 `.rddf/reviews/build-model-route-switch-ab.md` §6.1）。

ADR `ADR-governance-paths-ownership` 采 B1：把清单迁到 `.rddf/config/governance-paths.json`（与 `arch-docs.json` 同形，政策面归 architect），机制代码留在 builder 可写面 ⇒ **「architect 能改自己的政策」与「architect 拿不到机制代码写权」两句不变量同时成立**。本 change 落实该迁移。

## 入场条件

无（不依赖真实调用量或外部数据）。前置：ADR 已签批（✅ 2026-11-23 Accepted）。

## What Changes

### builder 面（机制实现）

1. **`lib/role-policy.ts`**
   - `GOVERNANCE_PATHS` → `DEFAULT_GOVERNANCE_PATHS`（注释「兜底默认，只收紧不放宽」），默认清单**追加自身路径** `.rddf/config/governance-paths.json`。
   - 新增 `resolveGovernancePaths(governanceRoot)`：三态解析（配置有效 → 用配置；缺失 / 损坏 / 为空 / 字段类型错 / **缺核心集** → 回退内置默认 + 告警；**绝不退化成空清单或全拒**）。读根 = **治理根**（不是项目根）。
   - `decideWrite` 的双命中（调用路径 ∪ realpath）消费点改吃**解析后清单**。
   - `architect.allow` **精确**追加 `.rddf/config/governance-paths.json`（**不得**用 `.rddf/config/**` 通配 —— `workspace.json` 是跨仓校验配置面）。
   - 写配置用 tmp+rename 原子替换；门控每次读清单不缓存（避免读到半文件）。

2. **`tests/config-guards.test.ts` 守卫族 V1–V7**：配置缺失/损坏/为空/字段类型错/缺核心集 ⇒ 回退默认且非全拒；收紧非核心条目 ⇒ 放行随配置变；移除核心集 ⇒ 运行期回退 + 守卫变红；架构师可写、planner/verifier 被拒；项目仓同名 json 不影响判定；默认清单定义点恰好 1 处；软链双命中毒桩在解析后清单上仍绿。

3. **`docs/CHANGELOG.md`** 一条（实现落地时写）。

### architect 面（B1 落地后自主）

4. **`.rddf/config/governance-paths.json`** 初值 = 现行清单 ∪ 自身路径；此后增删自主（走治理面审查口径）。
5. **`prompts/build.md`** 治理面作用域表**加一行** `governance-paths.json`（⇒ 表格行增删 ⇒ oracle→critic 必审）。

### 过渡期（B1 落地前）

清单变更须 builder 代改 + architect 在场 + critic 复核（ADR D4）。本 change 落地后该过渡结束。

## 验收标准

> 判据正文见 `docs/adr/ADR-governance-paths-ownership.md` 的 Verification 章（V1–V8）。本节只给编号映射与证据载体。

| AC | 对应 ADR | 判据（一句话） | 证据载体 |
|---|---|---|---|
| AC1 | V1 | 配置缺失 / 损坏 / 为空 / 字段类型错 / 缺核心集 ⇒ 行为与迁移前一致（默认清单生效 + 告警），**不是全拒**（修复通道开放） | `tests/config-guards.test.ts` |
| AC2 | V2 | 有效配置收紧非核心条目 ⇒ 放行行为随配置变化（读一次即生效，无需重启） | 同上 |
| AC3 | V3 | 有效配置移除核心集条目 ⇒ 运行期回退默认（不放宽）+ 告警；守卫用例变红 | 同上 |
| AC4 | V4 | architect 写 `.rddf/config/governance-paths.json` 成功且 `ledger.jsonl` 留 `role_gate_write` 行；planner / verifier 写同一文件被拒 | 同上 + ledger |
| AC5 | V5 | **项目仓**放同名 `.rddf/config/governance-paths.json` ⇒ 不影响治理面判定（读根 = 治理根） | 同上 |
| AC6 | V6 | 默认清单定义点恰好 1 处，且 `decideWrite` 内无字面清单（两处真源不成立） | 源码扫描断言 |
| AC7 | V7 | `d70a811` 的软链双命中毒桩在**解析后清单**上仍绿（治理名软链 → 仓库外目标仍识别为治理面） | 同上 |
| AC8 | V8 | `prompts/build.md` 治理面作用域表含 `governance-paths.json` 行 ⇒ 其变更进 oracle→critic 必审通道 | `prompts/build.md` |

## Acceptance（勾选镜像）

> 判据正文以 ADR Verification 章为准；本段供 `rdd-verifier` 读取。
>
> **验收证据**：`.rddf/reviews/governance-paths-config-migration-verify.md`（AC1–AC8 逐条判定 + 工具证据 + 判别力自证 8/8 变异体）；治理面审查记录 = `.rddf/reviews/governance-paths-config-migration-review.md`（oracle PASS-WITH-NOTES → critic REJECT(1 BLOCKER) → 修 → 复审 APPROVE）。

- [x] AC1 配置异常五态回退默认 + 告警 + 非全拒
- [x] AC2 收紧非核心条目放行随配置变（无需重启）
- [x] AC3 移除核心集 ⇒ 运行期回退 + 守卫变红
- [x] AC4 architect 可写 / planner·verifier 被拒 + ledger 留痕
- [x] AC5 项目仓同名 json 不影响判定
- [x] AC6 默认清单定义点恰好 1 处 + `decideWrite` 无字面清单
- [x] AC7 软链双命中毒桩在解析后清单上仍绿
- [x] AC8 `prompts/build.md` 作用域表含 `governance-paths.json` 行

## 非目标

- **不改治理面判定语义**（ADR Parent 明确：本 ADR 只裁定「清单这个数据」归谁维护）。
- **不把机制面（`lib/**` / `plugins/**`）加入清单**（ADR D2 明文否决 = 被否决的方案 A）。
- **不改 `arch_paths` 相关逻辑**（那是另一个面；审计 §4.6 已单独落地）。
- **不做清单变更的 UI / CLI**（初值落盘后，增删走手工编辑 + 治理面审查即可）。

## 影响面与风险

- **改动面**：`lib/role-policy.ts`（机制）+ `tests/config-guards.test.ts`（守卫）+ `.rddf/config/governance-paths.json`（新配置）+ `prompts/build.md`（作用域表一行）+ `docs/CHANGELOG.md`。
- **审查**：改 `lib/**` 与守卫断言 ⇒ **治理面必审**（oracle → critic；`prompts/build.md` §审查配对 治理面行，2026-11-23 v2.64 起已登记在审查口径表）。
- **回滚**：注册表 `governance-paths-config` 条目从 `exempt/not-implemented` 转 `active` + 配回滚清单 `.rddf/rollback/governance-paths-config.json`（`M3` 会在 watch 路径 `.rddf/config/governance-paths.json` 出现时强制重定性）。
- **残余风险 R1（沿 ADR）**：能改清单的角色不止 architect（`builder` / `general` 的 `**` + `governance: true`）⇒ 由核心集守卫 + 治理面审查 + `role_gate_write` ledger 三层兜底；本 change 不宣称比现状更强。
- **风险 R2**：运行期读点 ⇒ 需「不缓存 + 原子写」以免读到半文件；读失败走 AC1 兜底。

## 依赖与顺序

1. **先**：`.rddf/config/governance-paths.json` 初值 + `DEFAULT_GOVERNANCE_PATHS`（`lib/**`）。
2. **再**：`resolveGovernancePaths()` + `decideWrite` 消费改造。
3. **然后**：守卫族 V1–V7（测试先行，红 → 绿）。
4. **最后**：`prompts/build.md` 作用域表 + `docs/CHANGELOG.md` + registry 转 `active` + 回滚清单。
5. **收口**：oracle → critic（治理面）→ 提交；`rdd-verifier` 按 AC1–AC8 验收。
