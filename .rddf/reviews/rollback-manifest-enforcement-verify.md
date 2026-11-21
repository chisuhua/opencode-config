# 验收报告：L2 回滚可达性强制化（机制登记表 + 守卫 + 存量债登记）

- **验收对象**：`ADR-rollback-manifest-enforcement` 的**实施**（L2）
- **验收时间**：2026-11-21
- **验收角色**：verifier（角色内建，builder 的固定审查者；本报告为**誊写**：审查者不写实现）
- **已用轮次**：**1**（上限 3）

## 1. 判据来源（按优先级）

| 优先级 | 来源 | 内容 |
|---|---|---|
| 1（用户明确给出） | 用户指令「L2 的实施」「批准第 4/5 轮 critic」 | 落地范围 = registry + 守卫 + baseline + 清单回填 + 自清单；ADR 收口后转 Accepted |
| 2（change 的 AC 段） | **无 openspec change**（ADR `关联 change` = `backlog: rollback-manifest-enforcement`，未立项） | ⇒ 本次以第 4 项为准 |
| 3（本次变更自述） | 提交 `6c79142` / `8edb45a` / `8b44b0a` / `613401c` / `a0fe68d` / `466b983` 的 commit message | 实现承诺的行为 |
| 4（ADR 的 Verification 章） | `docs/adr/ADR-rollback-manifest-enforcement.md` 的 **V1–V14** + D2 的 **M1–M9** | 逐条判定如下 |

⚠ **本仓没有 AC 段可对照**（未立项）⇒ 判据全部来自 ADR 的 Verification 章与提交自述；**未立项本身登记为残留**（见 §6）。

## 2. 验证顺序与证据

### ① 静态 / 类型检查

- `bun test tests/` = **1053 pass / 1 skip / 0 fail**（1054 用例 / 30 文件，耗时 ≈28s）。
- ⚠ **本仓无独立类型检查步骤**（`package.json` 被 gitignore ⇒ 无 npm script；无 `tsc`；bun 的转译**不做类型检查**）⇒ **类型面未覆盖**（如实登记，见 §6 残留 R4）。

### ② 单元测试

`bun test tests/rollback-registry.test.ts` = **19 pass / 0 fail**（守卫自测）；`bun test tests/rollback-manifests.test.ts` = 12 pass（清单漂移守卫）。

### ③ 集成 / 端到端（隔离副本真演练）

`bun scripts/rollback-drill.ts .rddf/rollback/<mechanism>.json`（**真跑**，非推断）：

| 清单 | 演练基线 | 结果 |
|---|---|---|
| `commit-gate` | `8b44b0a` | **PASS** |
| `plan-topics` | `8b44b0a` | **PASS** |
| `plan-delegate` | `8b44b0a` | **PASS** |
| `model-fallback` | `8b44b0a` | **PASS** |
| `rollback-manifest-enforcement`（自清单） | `8b44b0a` | **PASS** |

**退役后自洽**（自清单的副本，`--keep` 后在副本里实跑）：`bun test tests/` = **1032 pass / 1 skip / 0 fail**（1033 用例 / 29 文件）⇒ **撤掉 L2 守卫 + registry + 债指针 + 自清单之后，仓库仍然自洽**（L1 的 drill 与漂移守卫独立于 registry ⇒ 回滚可达性能力本身不受影响）。

### ④ 边界与错误路径

守卫的 **19 例里 16 例是判别力反例**（每条判据都有一个「能被抓到」的反例 ⇒ 否则守卫是恒真的装饰）：ADR 未覆盖 / `adr_primary` 悬空 / 落在闭集外 / `active` 缺清单 / 清单 `adr` 不一致 / 豁免类越界 / 证据不存在 / 缺债指针 / 债文件与条目不一一对应 / `declared` 的 watch 已存在 / no-op 替换 / 空壳验证命令 / `last_drill` 缺失 / 内容哈希过期 / 证据自证 / `proving` 的四个前提 / 清单未登记 / 键序无关 / `pending_backlog` 挂错状态。

**fail-closed**：`parseRegistry` 对非法 JSON / 非对象 / `version ≠ 1` / `entries` 非数组 / 重复 `mechanism` / 非法 `state` 一律**抛**（`RegistryError`）⇒ **删掉 registry = 全部豁免**不成立（CLI 退出码 `2` = 不可判定，不当通过）。

### ⑤ 遗留清扫复核（本次范围内）

| 项 | 结果 |
|---|---|
| TODO / FIXME / XXX | **0**（`grep` 五个新增/改动文件） |
| 临时调试日志（`console.log` / `debugger`） | **0** |
| 被 skip 的测试 | 仅 `tests/rollback-manifests.test.ts` 的 `describe.skipIf(IN_DRILL)` —— **设计性**（副本正是「清单已执行完」的状态，在那里跑必恒红；注释已写明） |
| 半截实现 / 未替换 mock | **0**（无 mock；fixture 为自建临时仓，用后即删） |
| 临时 fallback / 死代码 | **0** |
| 未提交残留 | `git status` 干净（`466b983` 后） |

## 3. 逐条判定

### 机器判据（M1–M9）

| 判据 | 判定 | 证据 |
|---|---|---|
| **M1** 集合相等（双向） | ✅ | `bun -e` 实测：ADR 总数 **15** == registry 的 `docs/adr` 指针 **15**；未覆盖 `[]`、悬空 `[]`；清单集合 ↔ `active`∪`proving` 双向（反例见守卫 L214） |
| **M2** 指针有效 + 有范围 | ✅ | `checkRegistry` 0 问题；反例：清单 `adr` 不一致 ⇒ 红（L120） |
| **M3** 豁免闭集 + 前提可判 | ✅ | 存量唯一豁免 = `role-aware-permissions` / `no-single-baseline`（证据 `.rddf/rollback/README.md` 存在）；反例：类越界 / 证据不存在 ⇒ 红（L130） |
| **M4** 落地 tripwire | ✅ | 存量 `declared` = 0 条；反例：watch 已存在仍 `declared` ⇒ 红（L146） |
| **M5** 清单形态（防空壳）+ 证据不自证 | ✅ | 反例：no-op 替换 / 空壳验证命令 / 证据自证 ⇒ 红（L151 / L180）；存量 5 份清单均过 |
| **M6** 退役证据 | ✅ | 存量 `retired` = 0 条（判据已实现于 `lib/rollback-registry.ts`） |
| **M7** 债可见（逐机制）+ 全状态卫生 | ✅ | 实测：债文件 **10** == `unmanifested` **10**（`diff` 双向为空）；反例：缺指针 / 孤儿债文件 / `pending_backlog` 挂错状态 ⇒ 红（L138 / L240） |
| **M8** 指针闭集（全部状态） | ✅ | 15 条 `adr_primary` 全在决策记录闭集内；反例：悬空 / 闭集外 ⇒ 红（L107 / L112） |
| **M9** 过渡态（`proving`）可判 | ✅ | 反例：缺清单 / watch 不存在 / 证据陈旧 ⇒ 红（L187）；证据**可缺失**（`proving` 的定义）⇒ 不判红（同一用例的正向断言） |

### 验收判据（V1–V14）

| 判据 | 判定 | 证据 |
|---|---|---|
| **V1** 映射集合相等（双向） | ✅ | 同 M1 的实测输出 |
| **V2** 指针有效且有范围 | ✅ | 同 M2 / M8 |
| **V3** 豁免闭集 + 前提可判 | ✅ | 同 M3 |
| **V4** 必填性单一真源 | ✅ | `lib/rollback-drill.ts` 的 schema **不含**必填性断言（只保证 drill 能跑）；必填性只在 registry 守卫 ⇒ 无第二真源（`grep` 实测） |
| **V5** baseline 完整 | ✅ | 15 篇 ADR 全有 registry 条目（实测 15/15，未覆盖 `[]`） |
| **V6** 生命周期 + 落地 tripwire | ✅ | 存量：`active` 5 / `proving` 0 / `declared` 0 / `retired` 0；反例见 L146 / L187 |
| **V7** 弱判据（如实登记） | ⚠️ **未落地**（如实登记） | ADR 的 V7 要求对「存在即证明在跑」的插件枚举断言其条目**不得**标 `no-mechanism` ⇒ **实现里没有这条枚举**（枚举手维护、ADR 自称弱判据）⇒ **本次未实现**，登记为残留 R2 |
| **V8** 证据时效 | ✅ | 5 份清单的 `last_drill.content_hash` 与当前内容**逐份一致**（bun 侧用 `contentHash` 复算）；反例：缺失 / 过期 ⇒ 红（L165）；键序无关（L230）、数组重排仍敏感（L230） |
| **V9** 零成本 | ✅ | `lib/rollback-registry.ts` 与守卫测试**无** `spawn` / `exec` / `clone`（grep 实测）；守卫 19 例耗时 < 0.1s |
| **V10** 文档登记 | ✅ | `tests/README.md` 覆盖表有 `rollback-registry.test.ts` 行；`.rddf/rollback/README.md` 指向 `registry.json` 并有「机制登记表」章（V10 的「改为派生或指向 registry」二选一已满足） |
| **V12** 清单形态（防空壳） | ✅ | 同 M5 |
| **V13** 债指针可查 + 逐机制 | ✅ | 同 M7 |
| **V14** 过渡态可判 | ✅ | 同 M9 |
| **V11** 退化可见性（census） | ✅ | `bun scripts/rollback-registry.ts` 输出 `census: declared=0 unmanifested=10 proving=0 active=5 retired=0 exempt=1` + `PASS`（**六态**齐） |

**判定汇总**：**V1–V14 中 13 条通过；V7 未落地（如实登记为残留 R2）**；M1–M9 全通过；无失败项。

## 4. 失败项与路由建议

**无失败项**（无须回 builder 的实现缺口）。唯一需要动代码的是一条**标题漂移**（不影响判据）：

| # | 残留 | 位置 | 路由 |
|---|---|---|---|
| R1 | 用例标题仍写「M1–M8 / V1–V13」（实际 M1–M9 / V1–V14） | `tests/rollback-registry.test.ts:33` | builder（一行文案；不影响任何判据） |

## 5. 残留（本次不做，交用户决定）

| # | 残留 | 为什么本次不做 |
|---|---|---|
| R1 | 用例标题漂移（见 §4） | 一行文案，随下一次触碰该文件时一并修 |
| R2 | **V7 未落地**（插件枚举的「不得标 `no-mechanism`」断言） | ADR 自称**弱判据**（枚举手维护 ⇒ 新增插件不会自动被覆盖）⇒ 需先决定「能否从 `plugins/` + `lib/` 派生」再实现；本次不动（范围外） |
| R3 | **10 条存量债**（`unmanifested`）未清偿 | 债的清偿需要逐机制写清单（各篇的退役面需先定，见 `.rddf/rollback/pending/*.md`）⇒ 属后续 change，不在本次范围 |
| R4 | **类型面未覆盖**（无 tsc / 无 typecheck 步骤） | 本仓无该步骤（`package.json` gitignored）⇒ 非本次引入；登记备查 |
| R5 | **change 未立项**（`关联 change` = `backlog: rollback-manifest-enforcement`） | 立项属 planner 职责；ADR 的 `AC 映射` 已如实写「待立项后回填」 |
| R6 | U1 / U2 / U3 / U10 四类**不可机判**面 | ADR 的「已知不可机判」表已登记 ⇒ 本次不假装覆盖 |
| R7 | `/tmp` 下的演练副本残留（5 × 38M + 3 个工作副本） | 临时目录，宿主会回收；用户此前未答复是否删除 ⇒ 未擅自删 |

## 6. 本报告的边界

- 本报告是**誊写**：结论与逐条证据在本文件内，过程细节以各轮 subagent 输出与提交记录为准。
- **未覆盖**：语义覆盖（U1）、豁免成立性（U2）、实质退役（U3）、`proving` 停留时长与哈希真实性（U10）—— 机器判不了，ADR 已如实登记 ⇒ 本次不宣称覆盖。
- 验收不修改实现；R1 的修复由 builder 以独立提交完成。
