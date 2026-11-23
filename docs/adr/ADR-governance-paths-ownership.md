# ADR：治理面路径清单的归属（政策数据 vs 机制代码分离）

## 元数据

| 字段 | 值 |
|---|---|
| Status | **Proposed**（2026-11-23 architect 裁定；oracle **PASS-WITH-NOTES**（finding 已逐条处置）→ critic 结论与逐条处置见 `.rddf/reviews/governance-paths-ownership-review.md`（**待落**）⇒ **待用户签批**，签批后转 Accepted） |
| Date | 2026-11-23 |
| Author | architect（主会话；用户口令「切 architect：§6.1 / §6.2 / §6.3 / §6.8 + §6.7 的两处正文改写」授权做本裁定） |
| Parent | `ADR-role-aware-permissions`（D2 门控面 / D3 会话类型不相交 / D5 宣称边界 —— 本 ADR 只裁定**治理面清单这个数据**归谁维护，不改其判定语义） |
| 关联 change | **尚无 openspec change** ⇒ 登记 `backlog: governance-paths-config-migration`（实现清单见 §决策 D5；立项后回填指针与 AC 映射） |
| AC 映射 | 本 ADR **V1–V8 ↔ 待回填**（change 尚未立项；AC 编号由 planner 阶段给出后回填） |
| 审稿报告 | `.rddf/reviews/governance-paths-ownership-review.md`（oracle 1 轮 + critic 1 轮，逐条处置见该文件） |
| 修订 | —（本文为首版） |

## 背景与问题

1. **归属反转（已发生一次损失）**：治理面路径清单 `GOVERNANCE_PATHS` 写在 `lib/role-policy.ts`（机制文件）里；而 architect 的写集是 `[".rddf/config/arch-docs.json", ".rddf/reviews"]` + 治理面豁免，`lib/**` **不在** architect 写集（`lib/` 也不在 `GOVERNANCE_PATHS`）⇒ **architect 改不了「什么算治理面」这份清单**，而 builder 凭 `**` 可以改。角色矩阵同时声明「治理面产出归属 architect」⇒ 归属与写权结构性反转。2026-11-23 实测：为把 `opencode.json.*` 变体补进清单，须由 builder 代改（builder 的 `**` 反而更宽）。
2. **要守的不变量**：**门控机制代码不得被被门控角色修改**；治理面「范围/清单」是**政策**，应归治理面所有者（architect）决定。两句必须同时成立 ⇒ 政策数据与机制代码**不能放在同一文件**。
3. **同形先例已在仓内**：`.rddf/config/arch-docs.json`（架构文档目录 = architect 可写的配置面）由 `resolveArchPaths()` 三态解析（配置好 ⇒ 用配置；缺失/损坏 ⇒ 内置 fallback；空 ⇒ `[]`）。本 ADR 把同一形态套到治理面清单。
4. **不变量之外的事实约束**：`.rddf/config/` 下已有 `workspace.json`（跨仓 parity 检查的配置面）⇒ architect 的写集**不能用 `.rddf/config/**` 通配**，否则把跨仓校验流水线的定义面一并交给 architect（超出最小权限）。
5. **读根必须分清**：`arch-docs.json` 按 `repoRoot` 读是**项目级**语义；治理面清单是**全局级**（`~/.config/opencode`）⇒ 必须从 `governanceRoot` 读一份，否则任何项目仓放同名文件即可劫持治理面判定。

要解决的问题：**「什么算治理面」这份清单由谁维护、放在哪，才能既让政策所有者自主维护、又不让门控机制被治理者自改。**

## 决策

### D1 方向：清单迁到 architect 可写的配置面（B1），机制代码不动

- **采纳 B1**（治理面路径清单迁到 `.rddf/config/governance-paths.json`，与 `arch-docs.json` 同形），并按 C 的纪律执行「**数据 / 机制分离存放**」。
- **否决 A**（architect 写集加 `lib/role-policy.ts`）：architect 可改判定逻辑本身（allow 表 / 双命中 / fail-closed / 租约围栏）⇒ 违反不变量前半句。
- **B2（清单留代码 + builder 代改）降级为过渡模式**：仅在 B1 落地前有效；落地后不再是长期裁定（过渡期须 critic 在场复核，禁止单方代改 —— 见 D5）。
- **不触碰**（明确划界，超出本 ADR 范围）：写门判定语义（dual-hit / fail-closed / allow 表 / 租约围栏）、角色权限模型、**治理面归属语义**（现状 `builder` / `general` 亦 `governance: true` —— 本 ADR 不顺带「修正」它）。

### D2 四处必要修正（B1 若不采纳这四条，会引入新的审查真空与读根错误）

1. **精确枚举，不通配**：architect 的 allow 追加**精确路径** `.rddf/config/governance-paths.json`；**不得**扩成 `.rddf/config/**`（`.rddf/config/workspace.json` 是跨仓校验配置面，见背景 4）。
2. **清单自我纳入 + 登记进审查口径**：`governance-paths.json` 必须出现在**生效清单**里（否则它自身的变更**既不产生 `role_gate_write` 留痕**（留痕只对 `governance.hit` 的目标落行）、**也不进 oracle→critic 必审通道**（该通道由 `prompts/build.md` 治理面作用域表登记 ⇒ 见 V8）⇒ 审查真空 + 留痕真空）。同时在 `prompts/build.md` 的治理面作用域表**加一行**（表格行增删 ⇒ 必审）。
3. **读根 = 治理根**：清单从 `governanceRoot` 读**一份**（全局级语义）；**不得**按 `repoRoot` 读（否则项目仓同名文件劫持判定，见背景 5）。
4. **fail-closed 兜底 = 回退内置默认清单，禁止「全拒」**：配置缺失 / 损坏 / 为空 / 字段类型错 ⇒ 用**内置默认清单** + 告警；**绝不能**退化成「空清单」或「全拒」—— 全拒会让「修配置」本身也依赖治理面判定 ⇒ 修复通道死锁。**兜底触发条件再加一条**：**解析后清单 ⊉ 核心集 ⇒ 一律视为损坏 ⇒ 回退默认清单**（核心集不可移除在**运行期**也成立，不只靠测试期守卫 —— 运行期收到「格式合法但缺核心条目」的配置时不能照单全收）。

   **核心集（不可移除项；运行期 + 测试期双层守）** —— 下列条目**缺一即视为配置损坏 ⇒ 回退默认清单**：

   | # | 条目 | 为什么是核心 |
   |---|---|---|
   | 1 | `prompts` | agent 行为规则（含 `build.md` 本身）—— 治理面的最高优先面 |
   | 2 | `commands` | slash command = agent 行为指令，与 prompt 同级 |
   | 3 | `scripts` | 治理面规则**行为依赖**的脚本（规则指示 agent 运行它 / 依赖其退出码） |
   | 4 | `AGENTS.md` | 注入**所有** agent 上下文，影响力最大 |
   | 5 | `opencode.json` / `opencode.jsonc` / `opencode.json.*` / `opencode.jsonc.*` | 配置面本体（含变体与 `.bak-*` / `.backup-*` 备份） |
   | 6 | `docs/MULTI-AGENT-DESIGN.md` / `docs/CHANGELOG.md` / `docs/SUBAGENT-ORCHESTRATION.md` | 编排与委托通道的**汇总索引**（复述真源判据） |
   | 7 | `tests/config-guards.test.ts` | 守卫即「什么算漂移」的判据本身 |
   | 8 | `.rddf/config/governance-paths.json` | **清单自身**（自纳入 ⇒ 其变更也进留痕与必审通道） |

   ⚠ **机制面文件**（`lib/role-policy.ts` / `lib/role-identity.ts` / `lib/role-lease.ts`）**不进核心集** —— 把它们列进治理面清单，等于让 architect 借治理面身份拿到**机制代码**的写权（= 被否决的方案 A）⇒ 与 D1 冲突。机制面的安全由「机制面归 builder」保证，不靠清单。

### D3 落地分工（政策面归 architect，机制面归 builder）

| 面 | 内容 | 归属 |
|---|---|---|
| 政策面 | `.rddf/config/governance-paths.json`（初值 = 现行清单 ∪ 自身路径）的增删；`prompts/build.md` 治理面作用域表对应行 | **architect**（本 ADR 生效后自主维护） |
| 机制面 | `lib/role-policy.ts`：`GOVERNANCE_PATHS` → 默认清单 + `resolveGovernancePaths()` 三态解析 + `decideWrite` 消费解析后清单 + architect allow 精确追加；`tests/config-guards.test.ts` 守卫族 | **builder**（一次性；改动 `lib/**` 与守卫断言 ⇒ 治理面必审） |

### D4 过渡期纪律（B1 落地前）

治理面清单的变更须 **builder 代改 + architect 在场 + critic 复核**，禁止单方代改；B1 落地后本条失效。

### D5 落地分工与实现清单（登记给 builder 的一次性批次）

> 本节是**落地清单**，不是本 ADR 的验收判据（判据见「Verification」章 V1–V8）。

**builder 面**

1. `lib/role-policy.ts`：`GOVERNANCE_PATHS` → `DEFAULT_GOVERNANCE_PATHS`（注释「兜底默认，只收紧不放宽」）；新增 `resolveGovernancePaths(governanceRoot)` 三态解析（读根 = **治理根**）；`decideWrite` 的双命中消费点改吃**解析后清单**；`architect.allow` **精确**追加 `.rddf/config/governance-paths.json`；默认清单**追加自身路径**；写配置用 tmp+rename 原子替换。
2. `tests/config-guards.test.ts` 守卫族：V1–V7 的可测部分（含「项目仓同名 json 不影响判定」「双命中在解析后清单上回归」「解析后清单缺核心集 ⇒ 回退默认」）。
3. `docs/CHANGELOG.md` 一条（实现落地时写）。

**architect 面（B1 落地后自主）**

4. `.rddf/config/governance-paths.json` 初值 = 现行清单 ∪ 自身路径；此后增删自主（走治理面审查口径）。
5. `prompts/build.md` 治理面作用域表**加一行**（⇒ 表格行增删 ⇒ oracle→critic 必审）。

**过渡期（B1 落地前，§D4）**：清单变更须 builder 代改 + architect 在场 + critic 复核。

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **A. architect 写集加 `lib/role-policy.ts`（单文件）** | ❌ **否决** | architect 可改**判定逻辑本身**（allow 表 / dual-hit / fail-closed / 租约围栏）⇒ 被门控角色自改门控代码，直接违反不变量前半句；「改一行就多一份权力」的自扩权面无法用评审流程收窄到「只改清单」 |
| **B1. 清单迁到 `.rddf/config/governance-paths.json`（+ C 的分离纪律 + D2 四修正）** | ✅ **采纳** | 政策数据归政策所有者（architect 可写配置面），机制代码留在 builder 可写面 ⇒ **两句不变量同时成立**；与仓内 `arch-docs.json` 先例同形；成本是一次性 builder 改动 + 守卫族；残余风险（治理者可改自己的清单）由「核心集守卫 + 治理面审查 + ledger 留痕」三重兜底，且「清单+守卫」双改必然进必审通道 |
| **B2. 清单留代码，把「builder 代改」定为既定协作模式** | ⚠️ **过渡采纳，不作长期裁定** | 零代码改动、零新失败模式；但把已知坏状态制度化（2026-11-23 已实测一次排队卡死），且「机制 + 政策」同一手可触；真损失条件 = 清单变更时间敏感（安全事件紧急纳入/移出）× builder 不可用，或高频期代改反复发生 |
| **C. 作为独立第四方案（数据/机制拆两半）** | ↘️ **吸收进 B1** | C 与 B1 不互斥：「数据归政策面 / 机制归代码面」正是 B1 的正确实现纪律；单列为第四方案会让人误以为 B1 缺这层 |

## 后果 / 代价

**正面**

- architect 自主维护「什么算治理面」，**不再排队等 builder**（2026-11-23 的那类损失不再发生）。
- 「机制代码不可被治理者自改」这条不变量**第一次有了结构保障**（不是靠纪律，是靠文件位置）。
- 与 `arch-docs.json` 同形 ⇒ 不新增范式，读法一致（三态解析 + fallback）。

**负面 / 代价**

- **一次性成本**：builder 侧要改 `lib/role-policy.ts` + 新增守卫族 + 治理面必审（`tests/config-guards.test.ts` 属治理面）。
- **新增一个运行期读点**：门控每次判定要读清单 ⇒ 需「不缓存 + 原子写（tmp+rename）」以免读到半文件；读失败即走 D2.4 兜底。
- **两处真源的风险**：代码里的默认清单与配置文件可能漂移 ⇒ 用「配置是**完整清单**（非增量）+ 守卫断言有效配置 ⊇ 核心集」收口。
- **兜底必须 fail-closed 而非 fail-open**：清单为空 = 治理面静默消失 = 最坏结果 ⇒ 守卫钉死核心集不可移除。

**风险（含残余）**

- **残余风险 R1（诚实声明）**：能改清单的角色**不止 architect** —— 现状 `builder` / `general` 也是 `governance: true`（`lib/role-policy.ts:88,106`），B1 落地后它们同样可写清单文件 ⇒ **残余风险同构**（能把某个治理路径移出清单从而获得写权限）。这**是政策变更，不是绕过门控**（判定逻辑未变、通道是授权的、全程留痕）；防的是「静默变更」：① 核心集守卫（不可移除项，**运行期 + 测试期双层**）② 清单文件进治理面审查口径（oracle→critic）③ `role_gate_write` ledger 留痕（事后可审计）。**若治理面所有者本人被注入攻击，三层兜底无一是密码学阻止** —— 本 ADR 不宣称比现状更强。
- **风险 R2**：清单文件若被软链到仓外 ⇒ realpath 归一后落出 `.rddf/config/` ⇒ allow 精确匹配失效 ⇒ 兜底：**默认清单包含自身路径**，且双命中判定必须在**解析后清单**上跑。
- **风险 R3**：git revert 旧提交可能把清单静默回退 ⇒ 核心集守卫在规范命令（`bun test tests/`）里 ⇒ revert 必红。
- **风险 R4**：glob 方言漂移（配置条目无校验 ⇒ 语义非预期）⇒ 加载时逐条校验（非空字符串）+ 守卫快照当前清单的解析结果。

## Verification（可勾选验收判据，前瞻）

> 判据面向 **B1 落地后的实现**（builder 侧）；本 ADR 自身不以「代码已改」为完成条件。

- [ ] **V1**：`.rddf/config/governance-paths.json` 缺失 / 损坏 / 为空 / 字段类型错 / **缺核心集条目** ⇒ 行为与迁移前**一致**（内置默认清单生效 + 告警），且**不是**「全拒」（修复通道保持开放）。
- [ ] **V2**：有效配置**收紧**非核心条目 ⇒ 放行行为随配置变化（读一次即生效，无需重启）。
- [ ] **V3**：有效配置**移除核心集条目** ⇒ ① 运行期**回退默认清单**（不放宽）+ 告警；② 守卫用例变红（核心集不可移除）。
- [ ] **V4**：architect 写 `.rddf/config/governance-paths.json` **成功**且 `ledger.jsonl` 留下 `role_gate_write` 行；`planner` / `verifier` 写同一文件**被拒**。
- [ ] **V5**：**项目仓**放同名 `.rddf/config/governance-paths.json` ⇒ **不影响**治理面判定（读根 = 治理根）。
- [ ] **V6**：默认清单的定义点**恰好 1 处**，且 `decideWrite` 内**无**字面清单（两处真源不成立）。
- [ ] **V7**：`d70a811` 的软链双命中毒桩在**解析后清单**上仍绿（治理名软链 → 仓库外目标仍被识别为治理面）。
- [ ] **V8**：`prompts/build.md` 治理面作用域表含 `governance-paths.json` 行 ⇒ 其变更进 oracle→critic 必审通道。
