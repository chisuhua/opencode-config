# 验收报告 — governance-paths-config-migration（B1 治理面清单配置化）

> **判据来源**（按优先级）：`openspec/changes/governance-paths-config-migration/proposal.md` 的「验收标准」表（AC1–AC8）⇒ 其判据正文以 `docs/adr/ADR-governance-paths-ownership.md`（Status = **Accepted**）的 Verification 章 **V1–V8** 为单一真源（ADR ↔ AC 编号映射见 ADR 元数据「AC 映射」行）。
> **实现基线**：`e547f47`（机制落地提交）→ `last_drill` 的演练基线同此。
> **审查记录**（治理面）：`.rddf/reviews/governance-paths-config-migration-review.md`（oracle `治理面判定: PASS-WITH-NOTES` → critic 第 1 轮 `REJECT`（1 BLOCKER）→ 修复 → critic 复审 `APPROVE` / `mergeable: yes`）。

## 0. 验收路径（为何走本地验收而非 `rdd-verifier` skill）

按 `prompts/build.md` §verifier 产出契约 的**分流三条件**逐条检测：

| 条件 | 检测 | 结论 |
|---|---|---|
| ① change 存在且 `proposal.md` 含 `## 验收标准` / `## Acceptance Criteria` 段 | `openspec/changes/governance-paths-config-migration/proposal.md` 含 `## 验收标准`（第 47 行） | ✅ 满足 |
| ② rdd-builder 的 P3 archive gate 已触发（`iteration.json` 的 `status ∈ {in_worktree, completed}`、`tasks_done == tasks_total > 0`、未归档） | `.rddf/state/iteration.json` **不存在**（本仓未装 rdd-workflow 流水线 ⇒ 本 change 走**内置流程**） | ❌ **不满足** |
| ③ `skill` 工具能加载 `rdd-verifier` | `~/.config/opencode/scripts/rdd-skills.sh --json` ⇒ `installed: true`（能力在），但 ② 不满足 ⇒ 前置条件不成立 | — |

⇒ **未命中分流三条件** ⇒ 走**内置流程的本地验收**（1–5 步），判据取自上面的「判据来源」；本报告即产物落点（`.rddf/reviews/<change>-verify.md`）。⚠ **未另写一份重复 verdict**（无 `.ac-verdict-*.json`）。

## 1. 验证顺序与结果

| 步 | 内容 | 命令 | 结果 |
|---|---|---|---|
| ① 静态/编译 | 仓库**未声明** typecheck 命令（`package.json` 的 scripts 仅 `test`；无 `tsconfig.json`）⇒ 以规范验证命令代替 | `bash scripts/check-upstream-anchors.sh` | ✅ 29/29 命中（无 FAIL / SKIP） |
| ② 单元测试 | 全量 | `bun test tests/` | ✅ **1133 pass / 1 skip / 0 fail**（32 文件 / 4633 expect） |
| ③ 集成/端到端 | 门控**接线层**（留痕 + 告警） | `bun test tests/role-gate-plugin.test.ts` | ✅ 9/9 pass（含清单本体 allow/deny 各一行 ledger） |
| ③' 回滚可达性 | **隔离副本**演练（真仓只读） | `bun scripts/rollback-drill.ts .rddf/rollback/governance-paths-config.json` | ✅ **PASS**（回滚后 `bun test tests/` 全绿） |
| ④ 边界与错误路径 | 五态异常 + 缓存 + 读根 + 机制面禁区 + 原子写 | 见 §2 的判别力自证（8 变异体） | ✅ 全部被守卫抓到 |
| ⑤ 遗留清扫 | 本 change 范围内的 TODO / 半截实现 / 临时日志 / 被 skip 的测试 / 未替换的 mock / 临时 fallback | 见 §4 | ✅ 无（唯一 skip = `tests/arch-docs-scope.test.ts` 的环境依赖用例，**既有**、非本 change 引入） |

**登记面自检**：`bun scripts/rollback-registry.ts` ⇒ PASS（census: active=14 proving=0 exempt=3）；`bash tests/verify_record_discipline.sh` ⇒ OK（7 条判据全过）。

## 2. 逐条判定（AC1–AC8 ⇒ 证据）

判别力自证（隔离副本 `cp` + 变异 + 跑守卫，**绝不在活仓 `lib/` 上变异**）：**8/8 变异体全部被守卫抓到** ⇒ 下列用例不是恒绿。

### AC1（V1）配置异常五态 ⇒ 回退默认 + 告警 + **不是全拒** — ✅ 通过

- **证据**：`tests/config-guards.test.ts` 守卫族「治理面清单配置化」的 **6 个 AC1 用例**（配置缺失 / JSON 损坏 / `paths: []` / `paths` 字段类型错 / `paths` 元素类型错 / 缺核心集条目）⇒ 每个断言 `source === "default"` + `paths == DEFAULT_GOVERNANCE_PATHS` + `warning !== ""` + **architect 仍放行**（非全拒）+ planner 被拒。
  命令：`bun test tests/config-guards.test.ts -t "治理面清单配置化"` ⇒ **15 pass / 0 fail**（其中 AC1 6 例）。
- **判别力**：变异体 **M5**（兜底退化成空清单 ⇒ 治理面静默消失）⇒ AC1 红。

### AC2（V2）有效配置收紧非核心条目 ⇒ 放行行为随配置变化（读一次即生效）— ✅ 通过

- **证据**：AC2 用例三段 —— ① 配置含非核心条目（`docs/guard-authoring.md`）⇒ planner 被拒且 `governance.hit === true`；② **同进程内**改写配置删掉该条目 ⇒ `governance.hit === false` 且 planner **放行**（不需重启 ⇒ 清单**不缓存**）；③ 同一份含非核心条目的配置里核心集条目**仍**是治理面。
- **口径说明**（oracle 与 critic 两轮均裁定「成立，不是实现缺陷」）：今日常量下 `DEFAULT ≡ CORE`（13 条）⇒「相对默认清单收紧非核心条目」**不可观测**；唯一可观测的收紧形态 = 删掉**配置自增**的扩展条目（即本用例）。未来若默认清单 ⊋ 核心集，「收紧默认非核心项」自动可观测且**机制无需改动**。
- **判别力**：变异体 **M2**（`decideWrite` 吃内置默认清单）与 **M6**（清单被缓存）⇒ AC2 红。

### AC3（V3）移除核心集条目 ⇒ 运行期回退默认（不放宽）+ 守卫变红 — ✅ 通过

- **证据**：AC3 用例（配置删掉 `prompts` ⇒ `source === "default"` + `paths == DEFAULT` + 告警非空 + **planner 仍被拒** ⇒ 不放宽）；AC3② 用例（`默认 ⊇ 核心` 断言 + 判别力自证：抽掉一个核心条目 ⇒ 同一判据必须抓到）。
- **判别力**：变异体 **M1**（去掉核心集检查）⇒ AC3 红；**M3**（默认清单少一条核心）⇒ AC3② 红。

### AC4（V4）architect 写清单本体成功且留痕；planner / verifier 被拒 — ✅ 通过

- **证据（判定层）**：AC4 用例 —— architect 写 `<治理根>/.rddf/config/governance-paths.json` ⇒ 放行且 `governance == {hit: true, relPath: ".rddf/config/governance-paths.json"}`（⇒ 驱动留痕）；planner / verifier 写同一文件 ⇒ 被拒且 message 含「治理面」。
- **证据（接线层 / ledger）**：`tests/role-gate-plugin.test.ts` 的「治理面清单本体」用例 ⇒ architect **放行 + ledger 一行 `role_gate_write` allow**（`path = ".rddf/config/governance-paths.json"`）；planner **被拒 + ledger 一行 deny**（同 path）。
  命令：`bun test tests/role-gate-plugin.test.ts -t "治理面清单本体"` ⇒ 1 pass。

### AC5（V5）项目仓放同名配置 ⇒ 不影响治理面判定（读根 = 治理根）— ✅ 通过

- **证据**：AC5 用例 —— 治理根有**有效**配置、**项目仓**放同名且**有效**的配置（多一条非核心条目）⇒ 生效清单**不含**项目仓那条 + `prompts` 仍是治理面（planner 被拒）+ 项目仓那份扩展不生效；成对：项目仓若放一份「想把核心集移出治理面」的配置 ⇒ 该配置**无效**（缺核心集）⇒ 被拒绝。
- **判别力**：变异体 **M4**（清单从项目根读）⇒ AC5 红。

### AC6（V6）默认清单定义点恰好 1 处 + `decideWrite` 内无字面清单 — ✅ 通过

- **证据**：AC6 用例 —— 扫 `lib/` `plugins/` `scripts/` `tools/` 顶层：`DEFAULT_GOVERNANCE_PATHS` / `GOVERNANCE_CORE_PATHS` 的定义点**恰好 1 处**（`lib/role-policy.ts`）；`decideWrite` 函数体内**不含**任何清单条目字面量（扫描「核心集 ∪ 默认清单」的**并集**，前瞻：默认清单日后长出非核心条目也必须不在其中）。

### AC7（V7）软链双命中毒桩在**解析后清单**上仍绿 — ✅ 通过

- **证据**：AC7 用例 —— 先写一份**有效**配置（断言 `source === "config"` ⇒ 判据确实落在**解析后清单**上，而不是兜底默认），再复现 `d70a811` 的中毒桩（`<治理根>/opencode.jsonc` → **仓库外**目标）⇒ planner 仍被拒 + `governance.hit === true` + `relPath === "opencode.jsonc"`（报调用者写下的名字）。
- **回归**：既有用例「治理名链接 → 仓库外目标：invoked 支不可省」仍绿（`bun test tests/role-policy.test.ts -t "治理名链接"` ⇒ 1 pass）。

### AC8（V8）`prompts/build.md` 治理面作用域表含 `governance-paths.json` 行 — ✅ 通过

- **证据**：`prompts/build.md:531` 新增行 `| \`~/.config/opencode/.rddf/config/governance-paths.json\`（**治理面路径清单本体** = 政策数据…） | **无豁免**（清单与守卫双改 ⇒ 必然进 oracle→critic 必审通道） |`；同表下方注记（:537）与角色列表 architect 行（:454）的门控口径已随实现同步（指向门控清单配置文件 + 代码内兜底默认）。
- **配套**：`docs/MULTI-AGENT-DESIGN.md` §2.7 的「算」列投影同步（critic 第 1 轮裁定：**非越界，是必要的投影同步**）。

### 附加：机制面禁区（critic BLOCKER 的闭合，AC 之外的不变量）

- **证据**：`tests/config-guards.test.ts` 的「机制面禁区」用例 —— ① 配置含 `lib` / `plugins/**` ⇒ 该条目**被剔除** + 告警**点名** + 配置其余条目仍生效；② **注入 `governancePaths: ["**"]`**（绕开解析侧，隔离验证判定侧）⇒ `governance.hit === false`；③ 生产形（治理根 == 仓库根）下 architect **拒** / builder **放行** / planner **拒**；④ 默认清单（代码兜底）不含机制面条目。
- **判别力**：变异体 **M7**（去掉判定侧排除）⇒ 该用例红；**M8**（去掉解析侧剔除）⇒ 该用例红。

## 3. 失败项与路由建议

**无失败项**（AC1–AC8 全绿；8/8 变异体被抓住）。已用轮次：**1**（`RDDF_VERIFIER_MAX_LOOPS = 3` ⇒ 无需打回 builder）。

**已登记的 backlog（本 change 不做，scope 外）**：
1. 宿主 edit/write 工具对 symlink 文件是否**跟随写入真实目标**（决定 critic 第 2 轮 NIT②「`prompts/x -> lib/role-policy.ts` 借道」是否实际可达）—— 需先调研宿主行为。
2. `proposal.md` 的「影响面」清单未列 `docs/MULTI-AGENT-DESIGN.md`（critic 判为 NITS：下次同步投影时补登）。

## 4. 遗留清扫复核（本次范围内）

| 检查项 | 结果 |
|---|---|
| TODO / FIXME / 待办注释 | 无（`lib/role-policy.ts`、`plugins/role-gate.ts`、`tests/config-guards.test.ts`、`tests/role-gate-plugin.test.ts`、`prompts/build.md` 的本 change 增量内均无） |
| 半截实现 / 临时分支 | 无（`resolveGovernancePaths` 五态齐备；`writeGovernancePathsConfig` 有真实调用方 + round-trip 用例） |
| 注释掉的代码 | 无 |
| 临时调试日志 | 无（插件侧只有 `console.error` 的告警行，属**产品行为**而非调试残留） |
| 被 skip 的测试 | 无新增；全量套件的 1 个 skip = `tests/arch-docs-scope.test.ts` 的环境依赖用例（**既有**，依赖 `E2E_BED_DIR`） |
| 未替换的 mock | 无 |
| 临时 fallback 分支 | 无（兜底默认清单是**产品语义**，非临时代码） |
| 调试脚本留在仓内 | 无（变异/清单生成脚本在 `/tmp/opencode/`，未入库） |

## 5. 归档条件核对（`tasks.md`）

| 归档条件 | 状态 |
|---|---|
| T1–T7 全绿（含判别力自证） | ✅ 8/8 变异体被抓住 |
| P1–P4 落盘 | ✅（P3 = CHANGELOG v2.67；P4 = ADR 关联 change + AC 映射，落地前已回填） |
| R1–R3 完成（registry `active` + drill PASS + `last_drill` 回填） | ✅（drill 基线 `e547f47` PASS；`last_drill.content_hash = f6540cf6…`；registry census `active=14`） |
| V1–V3 全绿，AC1–AC8 逐条有证据 | ✅（本报告 §2） |
| 过渡期（ADR D4）结束声明写入 CHANGELOG | ✅（v2.67「⚠ 过渡期结束」段：清单增删此后由 architect 自主维护，不再需要 builder 代改） |
