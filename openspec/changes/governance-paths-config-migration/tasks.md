# Tasks — governance-paths-config-migration（B1 机制落地）

> **判据真源**：`docs/adr/ADR-governance-paths-ownership.md` 的 D5 实现清单 + Verification V1–V8（本文件不复制判据正文）。
> **执行纪律**：TDD 5 步 —— 每个判据先写**失败测试**（红），再实现（绿），最后全量回归。
> **审查**：改 `lib/**` 与守卫断言 ⇒ 治理面必审（oracle → critic）。

## 0. 前置核对

- [x] **T0** 确认 ADR Status = `Accepted`（2026-11-23）；确认无其它活跃 change 触碰 `lib/role-policy.ts`（`openspec/changes/` 下除本 change 外无相关项）；记录基线 `git rev-parse HEAD`。

## T. 测试先行（红）

- [x] **T1（AC6）** `tests/config-guards.test.ts`（或新测试文件）加「默认清单定义点恰好 1 处 + `decideWrite` 内无字面清单」的源码扫描断言 ⇒ 先红（当前 `GOVERNANCE_PATHS` 即字面清单）。
- [x] **T2（AC1）** 五态兜底用例：配置**缺失 / JSON 损坏 / `paths: []` / 字段类型错 / 缺核心集** ⇒ `resolveGovernancePaths` 回退默认清单 + 告警，且**不是**全拒（对治理面路径仍按默认清单判定）。先红。
- [x] **T3（AC2）** 收紧用例：有效配置删掉一个非核心条目 ⇒ 该路径**不再**判为治理面（读一次即生效）。先红。
- [x] **T4（AC3）** 核心集不可移除：配置删掉核心条目 ⇒ ① 运行期回退默认；② 守卫用例变红（判别力自证）。先红。
- [x] **T5（AC4）** `architect` 写 `.rddf/config/governance-paths.json` 成功；`planner` / `verifier` 写同一文件被拒（`decideWrite` 级，不依赖 plugin）。先红。
- [x] **T6（AC5）** **项目仓**放同名 `.rddf/config/governance-paths.json` ⇒ 治理面判定**不受影响**（读根 = 治理根）。先红。
- [x] **T7（AC7）** 复跑 `d70a811` 的软链双命中毒桩（治理名软链 → 仓库外目标），断言在**解析后清单**上仍判治理面。先红 / 或确认既有用例在迁移后仍绿。

## I. 实现（绿）

- [x] **I1** `lib/role-policy.ts`：`GOVERNANCE_PATHS` → `DEFAULT_GOVERNANCE_PATHS`（注释「兜底默认，只收紧不放宽」），默认清单**追加自身路径** `.rddf/config/governance-paths.json`。
- [x] **I2** 新增 `resolveGovernancePaths(governanceRoot)`：三态解析（有效 / 回退默认 + 告警 / 损坏告警），读根 = **治理根**；解析后清单须 **⊇ 核心集**，否则视为损坏回退默认。
- [x] **I3** `decideWrite` 的双命中消费点改吃解析后清单（**不缓存**每次读；读失败走 I2 兜底）。
- [x] **I4** `ROLE_WRITE_POLICY.architect.allow` **精确**追加 `.rddf/config/governance-paths.json`（**不用** `.rddf/config/**` 通配）。
- [x] **I5** 配置写入路径：tmp+rename 原子替换（供 architect 后续手工写；本 change 只保证读取侧安全）。
- [x] **I6** 跑 T1–T7 ⇒ 全绿。

## P. 配置与散文

- [x] **P1** 新建 `.rddf/config/governance-paths.json`：`{ schema_version, updated_at, updated_by, paths: [...现行清单 ∪ 自身路径...] }`（初值 = 当前 `GOVERNANCE_PATHS` 8 项 + 自身）。
- [x] **P2（AC8）** `prompts/build.md` 治理面作用域表**加一行** `governance-paths.json`（⇒ 表格行增删 ⇒ oracle→critic 必审）。
- [x] **P3** `docs/CHANGELOG.md` 一条（机制落地 + 过渡期结束）。
- [x] **P4** `docs/adr/ADR-governance-paths-ownership.md` 的「关联 change」回填指针（立项后回填；AC 映射已回填 AC1–AC8）。

## R. 注册与回滚

- [x] **R1** `.rddf/rollback/registry.json`：`governance-paths-config` 条目 `exempt/not-implemented` → **`proving`**（机制已落地、清单已写、**演练证据待回填** ⇒ `M3` 已因 watch 路径出现而强制重定性）→ drill PASS 后回填 `last_drill` ⇒ 转 **`active`**。⚠ **两段式**（与仓内 `model-fallback` 同款：证据只能由**已提交**的清单跑出来 ⇒ 必然晚一个提交）。
- [x] **R2** 新建 `.rddf/rollback/governance-paths-config.json` 回滚清单（delete 新配置 + edits 还原 `lib/role-policy.ts` 与 `prompts/build.md` 作用域表行）。
- [ ] **R3** 回滚演练：`bun scripts/rollback-drill.ts .rddf/rollback/governance-paths-config.json` ⇒ PASS 后回填 `last_drill`。

## V. 验证与审查

- [x] **V1** `bun test tests/` 全绿；`bash scripts/check-upstream-anchors.sh` 无 `FAIL` 且无 `SKIP`；`bun scripts/rollback-registry.ts` = PASS；`bash tests/verify_record_discipline.sh` = OK。
- [x] **V2** 治理面审查：oracle（`审查域: 治理面`）→ critic（`review_profile: build, arch`）；BLOCKER 全闭。
- [ ] **V3** `rdd-verifier` 按 AC1–AC8 逐条验收（证据落 `.rddf/reviews/governance-paths-config-migration-verify.md`）。

## 归档条件

- T1–T7 全绿（含判别力自证）；
- P1–P4 落盘；
- R1–R3 完成（registry `active` + drill PASS + `last_drill` 回填）；
- V1–V3 全绿，AC1–AC8 逐条有证据；
- 过渡期（ADR D4）结束声明写入 CHANGELOG。
