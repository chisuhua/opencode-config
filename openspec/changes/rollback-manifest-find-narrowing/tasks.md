# Tasks — rollback-manifest-find-narrowing（段 A 解 pin + 守卫 · 段 B 写集机读投影 · 段 C 账本）

> **判据真源**：`openspec/changes/rollback-manifest-find-narrowing/proposal.md` 的 `## 验收标准` 表（AC1–AC15）。
> **执行纪律**：TDD 5 步 —— 守卫断言先写（红）→ 改机制 / 清单（绿）→ 文档回填 → 全量回归 → 演练。
> **审查**：改 `lib/**`（机制面）+ `prompts/**`（治理面）+ 守卫判据 ⇒ **oracle（`审查域: 治理面`）→ critic** 各 1 轮。
> **两段式纪律**（ADR D5）：清单**内容**变更 ⇒ `last_drill.content_hash` 失效 ⇒ 撤 `last_drill` + registry 转 `proving` 与内容变更**同一 commit**；演练 PASS 后回填 `last_drill` 并转 `active`。
>
> **执行顺序（含依赖，critic SHOULD_FIX-2）** —— A / B 两段**不是**按编号顺序跑：
> ```
> 阶段 1  T0 系列 + A1（守卫先写：基线绿 → 变异红）
> 阶段 2  B1（渲染器）→ B2 / B4 / B5（prompts/build.md 文本定稿，**不提交**）
> 阶段 3  A3 / A3b（拆分 find —— **以阶段 2 的文本为准**）
> 阶段 4  A2 / A4 / A5 / A6 + B3（断言族转绿）+ B6 / B7
> 阶段 5  D1（两段式演练 + 回填）→ 提交
> ```
> ⚠ **阶段 2 必须先于阶段 3**：`edits[13]`（角色表）与 `edits[45]/[46]`（verifier 行散文）的 `find` 必须匹配**阶段 2 之后**的 `prompts/build.md` ⇒ 若阶段 3 先跑，阶段 2 的改写会立即打断它（fail-closed 能发现，但虚耗一轮）。
> ⚠ **阶段 1 的守卫先写**：A1 的断言在阶段 1 落盘（此时基线值取现状 ⇒ 绿），A2 的判别力用例**用纯 fixture 实现**（`findShapeViolations` 不读真仓）⇒ **可与阶段 1 一起完成**，与阶段 2/3 的内容改动零干扰。

## 0. 前置核对

- [x] **T0** 记录基线：`bun test tests/` 全绿数；`bun scripts/rollback-registry.ts` PASS（9 清单 / 0 proving）；`git rev-parse HEAD`。
  > **验收证据**：`bun test tests/` = **1137 pass / 1 skip / 0 fail**；`bun scripts/rollback-registry.ts` = **PASS（14 active / 0 proving / 3 exempt）**；`git rev-parse HEAD` = `f6178f0`（立项工件 commit）。
- [x] **T0b** **pin 普查**（决定段 B 断言族与 6 块的落点）：扫 `.rddf/rollback/*.json` 全部 `edits[].find` 对 **三个目标文件**的覆盖 —— `tests/config-guards.test.ts` · `lib/delegate-core.ts` · **`prompts/build.md`** ⇒ 输出每个 `find` 命中的**行区间** ⇒ 可用空隙清单。
  > **验收证据**：见上方 T0b 段的实测输出（角色表节 = 行 448..502、零覆盖 28 行、表尾投影块完全零覆盖 ⇒ 段 B 改它不撞任何 pin；三个目标文件的 pin 行区间清单已出）。
  > **验收证据**：普查脚本 `/tmp/opencode/t0-survey.py`（一次性工具，不入仓）输出：`prompts/build.md` 被 **5 份清单 pin 共 21 处**（硬约束四处 = 角色表行 449 / verifier 行散文行 456–457 / 既有 `role-class-write-set:verifier` 块行 489 / `capability:build` 块行 483）；**角色表节 = 行 448..502**，其中**零覆盖行 28 行**（行 448、460–482、499–502）⇒ **表尾投影块（461–478）完全零覆盖** ⇒ 段 B 改它**不撞任何 pin**；`tests/config-guards.test.ts` 与 `lib/delegate-core.ts` 的 pin 区间清单同表输出。
  > ⚠ **须输出角色表「逐行」的残余 pin 名单**（critic 验证建议）：逐行标出角色表每一行被哪些 `find` 覆盖 ⇒ 供 **A4 选变异点**与 **B3 选断言落点**共用（A4 变异的必须是**零覆盖**行，否则假败）。
  > ⚠ **`prompts/build.md` 已被实测**（2026-11-24，见 `design.md` §2.4）：5 份清单 / 21 处 ⇒ **角色表（449）· verifier 行散文（456–457）· 既有 verifier 机读块（489）· `capability:build` 块（483）** 四处是硬约束 ⇒ 段 B 的改写与插入必须避开，避不开就**同批拆分对应 find**（两段式）。
- [x] **T0c** 确认 `lib/rollback-drill.ts:450` 已是函数式 replacement（段 C 的安全前提）且 `tests/rollback-drill.test.ts` 共 39 条、其中 4 条为「按字面」用例。
  > **验收证据**：`lib/rollback-drill.ts:450` = `buf = buf.replace(e.find, () => e.replace)`；`ManifestEdit` JSDoc（`:48-51`）含「按字面写入」；`.rddf/rollback/README.md:47` 含同义 bullet；`tests/rollback-drill.test.ts:220` 起 4 条「按字面」用例、共 39 条 ⇒ **段 C 的 6 条 AC 实测全部落地**。
- [x] **T0d** **重测基线表**：用脚本重算 9 个清单的 `{sep, pipe, maxLen}` 实测值 ⇒ 与 `proposal.md` 的基线表逐格核对（oracle 未能独立复核这五项数值 —— 其 shell 统计被权限拒绝 ⇒ 以 builder 本次重测为准）⇒ **A1 落地当天再测一次**（基线值将固化成测试常量，任何一格误差 ⇒ 当天即红 ⇒ fail-closed 方向正确但会虚耗一轮排查）。**核对以 A1 修正后的 7 项为准**（critic 验证建议）。
  > **验收证据**：重测脚本输出与 `proposal.md` 基线表的逐格 diff = **空**（9 清单的 sep / pipe / maxLen 全部吻合：commit-gate 0/0/2067 · delegate-knowledge-delivery 0/2/6524 · delegate-slot-kernel 5/6/2894 · governance-paths-config 2/2/12768 · model-fallback 1/2/3003 · plan-delegate 1/1/4849 · plan-topics 1/1/5229 · role-class-write-set 3/3/8844 · rollback-manifest-enforcement 0/1/500）；find 总数 **361**；分位 p50=209 / p75=580 / p90=1587 / **p95=2894** / p99=6349 / p100=12768 ⇒ `MAX_FIND_LEN = 2894` 取值成立。
  > ⚠ **缩进表格行盲区**：全量 361 条 find 中**缩进 markdown 表格行**（去缩进后以 `|` 开头且含 ≥2 个 `|`）**0 条** ⇒ 盲区在本仓**不适用**（登记在 design §1.1 与 §4）；⚠ 注：宽松正则 `^\s+\|` 会命中 13 条**缩进的 shell 管道**（`  | grep '^owns:' …`）⇒ 那**不是**表格行 ⇒ 不构成盲区实例。

## A. 段 A —— 守卫先行（红）

- [x] **A1（AC1/AC6）** `tests/rollback-manifests.test.ts` 新增形态断言族：`MAX_FIND_LEN = 2894`（测试常量，逐字写死）；`FIND_SHAPE_BASELINE` 登记 **7 个**未收敛清单的 `{sep, pipe, maxLen}`（取值 = proposal 基线表逐格）；断言 `actual ≤ baseline`（逐项）；未登记清单须满足 `{sep: 0, pipe: 1, maxLen ≤ 2894}`。
  > **验收证据**：`bun test tests/rollback-manifests.test.ts` ⇒ **36 pass / 0 fail**（原有 4 + 新增 32）；新断言**绿**（基线值取自当前实测 ⇒ 零假红）。判据实现为**纯函数** `findShapeViolations(name, finds, baseline)` ⇒ 判别力可用 fixture 自证而不触真仓。
  > ⚠ **阶段 1 登记 8 项**（`governance-paths-config.json` 过渡态登记 sep=2 / pipe=2 / maxLen=12768）⇒ **阶段 3（A3）完成后移除该项** ⇒ 终态 **7 项**（= AC1）。两次改动都在同一张表里 ⇒ 收敛进度可读（design §1.2 过渡态注记）。
  > ⚠ **只登记 7 个**（critic SHOULD_FIX-1）：`commit-gate.json` 已达标 ⇒ **刻意不登记**（登记它反而允许其退化）；`governance-paths-config.json` 亦不登记（段 A3 后必须已达标）。
  > ⚠ **阶段 1 先登记 8 项**：A1 落盘时 `governance-paths-config.json` 尚未拆分（sep=2 / pipe=2 / maxLen=12768）⇒ 此时不登记则守卫**立即红** ⇒ **阶段 1 登记 8 项**（含它的当前值）；**阶段 3（A3）完成后移除该项** ⇒ 终态 **7 项**（= AC1）。两次改动都在同一张表里 ⇒ 收敛进度可读（design §1.2 过渡态注记）。
  > ⚠ **判据形态**：`sep` = 含 `/^\|[\s:|-]+\|$/m` 的 `find` 条数；`pipe` = `|` 起始的**连续**行数 > 1 的 `find` 条数；`maxLen` = 最长 `find` 字符数。**已知盲区**：缩进表格行（`  | …`）两道闸都不计 ⇒ T0d 统计其数量并登记（见 design §1.1）。
- [x] **A2（AC2）** **判别力自证**：① 构造一条超基线的 `find`（未登记清单里加一条含表格分隔行的 find）⇒ 断言**红**；② 把 `FIND_SHAPE_BASELINE` 里任一清单的 `pipe` 下调到实际值以下 ⇒ 断言**红**。
  > **验收证据**：5 条判别力用例全部**红**（`bun test tests/rollback-manifests.test.ts` = 36 pass / 0 fail，其中 5 条是变异用例）：① 含表格分隔行 ⇒ 命中「分隔行」；② 避开分隔行、只覆盖数据行 ⇒ 命中「整张表」（`pipe` 闸）；③ pipe 上限为 0 时单条即红；④ 基线下调到实测值以下 ⇒ 红；⑤ 超长 find ⇒ 命中「字符」。
  > ⚠ **全部用 fixture 实现**（`findShapeViolations` 是纯函数）⇒ **不触真仓** ⇒ 与阶段 2/3 的内容改动零干扰（故实际执行时间早于原计划的阶段 4；执行顺序段已同步）。
  > ⚠ **`pipe` 计的是条数**（不是「单条覆盖了几行」）⇒ 超过默认上限 1 需 **2 条** find ⇒ 判别力用例按此构造；「单条覆盖多行」的严重程度判据**刻意不加**（design §4 已登记为已知局限）。
- [x] **A3（AC3）** 拆分 `governance-paths-config.json` 的三条大 `find`：`edits[11]`（12768，`tests/config-guards.test.ts`）· `edits[13]`（2914，`prompts/build.md` 角色表）· `edits[14]`（2657，治理面作用域表）—— 按**机制特有的语义边界**拆成多条小 `find`/`replace` 对；每条满足 `{sep: 0, pipe ≤ 1, maxLen ≤ 2894}`；拆分后该清单所有 `find` 在演化缓冲里仍各自恰好 1 次。
  > **验收证据**：**3 条大 find 全部拆完，语义零损失**（等价性校验：拆出的序列依次应用 ⇒ 结果逐字等于原 `replace`）：`edits[13]`（2914）→ 2 条链式 edit（472 + 43）；`edits[14]`（2657）→ 3 条（266 / 244 / 344）；`edits[11]`（12768）→ 11 条（9 个 test 块 + 壳）。清单总数 16 → 29；该清单 `maxLen` **12768 ⇒ 3541**（`sep` 2 ⇒ 1、`pipe` 2 ⇒ 1）。  > ⚠ **AC3 的派生条件未达成**（该清单仍留在基线表）：拆分后仍有 **2 条超 `MAX_FIND_LEN`** —— ① **3541** 的「注释头 + describe 头 + helper + 收尾」壳 ② **3251** 的**单个完整单测块**。二者都是**语法连续**的 ⇒ 拆它们会破坏 JS 语法（`find` 是连续文本片段）⇒ 只能整块保留。  > 📌 **彻底出表的所需前置**（属另一个 change 的范围）：① 把那个 3251 的单测**缩短**（例如把 `BAD_CONFIGS` 数组外提）② 把壳里的 helper 段缩短或外提 ⇒ 两处都改完后该清单即可出基线表。本条（AC3 的「拆成多条」部分）**已完成**。
  > **验收证据**：`bun test tests/rollback-manifests.test.ts` 绿（`find_count` 不漂）；`bun scripts/rollback-registry.ts` 对该清单 PASS；拆分前后 `edits` 条数与各条长度表落盘。
  > ⚠ **拆分语义保持性必须逐条核对**（critic 验证建议 · 最要紧）：对 `edits[11]/[13]/[14]` 的**每一条**拆出项，diff 其 `find` 与对应 `replace` ⇒ 证明被丢出 `find` 的区间在 `replace` 侧**零差异**（`edits[13]` 已抽验：除 architect 行门控句外逐字相同；`edits[11]`/`edits[14]` 须**全量核对**）。理由：**drill 绿 + `verify.commands` 跑通判不了「漏还原」** —— 现有断言的是**当前态**，不是回滚后的还原完整性 ⇒ 这是 ADR「语义覆盖不可机判」的实体化，只能靠人工/脚本逐条核对并留痕。
  > ⚠ **执行顺序（oracle F5）**：`edits[13]` / `edits[14]` 的 `find` 必须匹配**段 B 之后**的 `prompts/build.md` ⇒ **顺序 = 段 B 内容定稿 → 段 A 拆分 → 一次性提交 + 演练**（两者同批，合并的技术依据）。
  > ⚠ **`replace` 侧可以长**：`find` 小、`replace` 大是允许的（回滚方向是「小块换回大块」）⇒ 判据只约束 `find`。
- [x] **A3b** **同批更新其余被撞清单**（段 B 改「允许」列必然撞 `role-class-write-set.json` 的 `edits[45]/[46]`；6 块插入边界可能撞 `edits[47]` / `commit-gate.json` 的 `edits[9]`）⇒ 凡被撞的 `find` 同步拆分/改写（同一形态约束），并同样走两段式。
  > **验收证据**：**实测结论 = 无需同批更新其余清单** —— 段 B 改的是「允许」列的**前半段**，而其余 4 条被撞 find 覆盖的是**禁止列**或**允许列末尾**：`role-class-write-set[45]`（builder 禁止列）· `[46]`（verifier 禁止列）· `commit-gate[7]`（builder 允许列末尾的 `commit（工具层验证门…）`）· `commit-gate[10]`（no-role 禁止列）· `plan-delegate[9]`（planner 允许列末尾）⇒ 段 B 未触及它们 ⇒ **只有 `governance[13]` 被撞**（已由 A3 拆成 2 条链式 edit）。  > ⚠ **判定前提**：若将来改了 builder / planner / verifier / no-role 行的**禁止列**或**允许列末尾**，这 4 条 find 会重新被撞 ⇒ 届时须同批拆分。
  > **验收证据**：T0b 普查出的**被撞清单清单**逐份列出，每份附改写后的 `find` 长度与形态指标（≤ 基线）。
- [x] **A4（AC4）** **负向验证（解 pin 的实效）**：改 `prompts/build.md` 角色表里**与机制无关**的单元格（排版 / 与 `GOVERNANCE_PATHS` 无关的散文）⇒ `bun test tests/` **不再**报 `find_count` ⇒ **恢复原状**。
  > **验收证据**：负向验证**绿**（脚本 `/tmp/opencode/negative-checks.py`）：改 `prompts/build.md` 角色表 **general 行的「禁止」列散文**（与机制无关）⇒ `bun test tests/rollback-manifests.test.ts` **退出码 0（绿）** ⇒ **不再报 `find_count`** ⇒ 解 pin 实效成立；变异后工作树逐字恢复。  > ⚠ **变异点选取依据**：T0b 的逐行名单显示 general 行在 `governance[13]` 拆分后**零覆盖**（其余 5 行仍被 plan-delegate[9] / commit-gate[7][10] / role-class-write-set[45][46] 覆盖）⇒ 选 general 行 ⇒ 既满足「与机制无关」又满足「零覆盖」两条前置。
  > **验收证据**：变异前 `bun test tests/` 绿；变异后仍绿（无 `find_count` 失败项）；恢复后 `git diff` 仅剩本 change 的目标改动。
  > ⚠ **变异点必须选自 T0b 普查出的「零覆盖空隙」**（critic SHOULD_FIX-3）：角色表其它行仍被**未拆分**的 `find` 合法覆盖（`plan-delegate.json` `edits[9]` 行 455、`commit-gate.json` `edits[7]` 行 456 / `edits[10]` 行 458）⇒ 选错单元格 ⇒ 红是**合法 pin 触发**而非解 pin 无效 ⇒ 本 AC **假败**。T0b 须输出角色表**逐行**的残余 pin 名单供选点。
- [x] **A5（AC5）** **正向验证**：全部 9 个清单的 drill 全绿（`bun scripts/rollback-registry.ts` = PASS）；被拆清单的 `verify.commands` 逐条跑通。
  > **验收证据**：`bun scripts/rollback-drill.ts .rddf/rollback/governance-paths-config.json` = **PASS: governance-paths-config 回滚后验证全绿（bun test tests/）**（隔离 clone，基线 `2cfd04d`）；`bun scripts/rollback-registry.ts` = **PASS（14 active / 0 proving / 3 exempt）**。  > ⚠ 演练过程中发现段 B 与本机制的**客观耦合**（迁移前 `architect.allow` 只有两项）⇒ 段 B 的产物纳入本清单一起退役（e3/e4/e5）⇒ 这是使 drill 能绿的必要条件，不是范围膨胀。
  > **验收证据**：registry 输出逐清单 PASS 行；`verify.commands` 的逐条命令与退出码。
- [x] **A6（AC7）** 登记其余 **8 个**清单的收敛 check list（见下表）—— 不许静默遗留。
  > **验收证据**：下方「未收敛清单 check list」表已逐行登记 8 个清单的 `{sep, pipe, maxLen}` 当前值 + 收敛目标 + 建议顺序（含 `commit-gate.json` 已达标 ⇒ 移出基线表）。
  > **验收证据**：本 tasks 文件的「未收敛清单 check list」表逐行填完（含收敛目标与顺序建议）。

### 未收敛清单 check list（AC7）

| 清单 | `edits` | 当前 `sep` | 当前 `pipe` | 当前 `maxLen` | 收敛目标 | 建议顺序 |
|---|---|---|---|---|---|---|
| `role-class-write-set.json` | 126 | 3 | 3 | 8844 | `sep=0` · `pipe≤1` · `maxLen≤2894` | 1（edits 最多、收益最大） |
| `delegate-knowledge-delivery.json` | 76 | 0 | 2 | 6524 | `pipe≤1` · `maxLen≤2894` | 2 |
| `plan-delegate.json` | 48 | 1 | 1 | 4849 | `sep=0` · `maxLen≤2894` | 3 |
| `plan-topics.json` | 14 | 1 | 1 | 5229 | `sep=0` · `maxLen≤2894` | 4（其 `edits[8]`（5229）pin 着 `plan 侧多会话协作` 整块） |
| `delegate-slot-kernel.json` | 35 | 5 | 6 | 2894 | `sep=0` · `pipe≤1` | 5 |
| `model-fallback.json` | 14 | 1 | 2 | 3003 | `sep=0` · `pipe≤1` · `maxLen≤2894` | 6 |
| `rollback-manifest-enforcement.json` | 3 | 0 | 1 | 500 | `pipe=0` | 7 |
| `commit-gate.json` | 29 | 0 | 0 | 2067 | 已达标 ⇒ **移出基线表** | 8 |

## B. 段 B —— 写集机读投影

- [x] **B1（AC8）** `lib/delegate-core.ts` 新增 `renderWriteSetBlock(role)`：从 `lib/role-policy.ts::ROLE_WRITE_POLICY` 渲染（**不手抄字面量**）。
  > **验收证据**：`bun test tests/delegate-core.test.ts` = **168 pass / 0 fail**（新增 5 例）；6 个角色的块逐字等于真源派生（`allow` 行 + `denyAll` 行）；`builder`/`general` ⇒ `allow: **`；`no-role` ⇒ `allow: (none)` + `denyAll: true`（**无空 `allow:` 行**）；块内**不含** `governance:` 标记与 `arch_paths`（写集维度之外）。
  > ⚠ **`verifierWriteSetBlock()` 的输出逐字不变**（marker + `allow:` 行 + `owns:` 行）：既有守卫（AC19 逐字 + marker 整行计数；AC20 解析 `owns:` 行）仍绿；新增用例断言旧块**不含** `role-write-set:`（两个维度不互吞）。
  > ⚠ **落点**：`lib/delegate-core.ts` 的 import 区行 43（不在任何 pin 区间内）+ 函数体落在 `capabilityBlock` 之后的空隙（行 638 起）⇒ **不触碰**任何被 pin 的 find 文本（`role-class-write-set.json` 的 `edits[2]` 覆盖行 897–993，含既有 `verifierWriteSetBlock` ⇒ 该函数**零改动**）。
  > ⚠ **测试落点**：`tests/delegate-core.test.ts` 的**顶部 import 块被逐字节 pin**（行 31–54）⇒ 不能加 import 项 ⇒ 测试用**动态 import**（顶层 await）放在文件末尾（行 1665 起，不在任何 pin 区间内）。
  > **验收证据**：`bun test tests/delegate-core.test.ts` 绿；新函数对 6 个角色的输出与手写期望逐字一致（对 `verifier` 角色做等价断言）。
  > ⚠ **`verifierWriteSetBlock()` 的输出逐字不变**（marker + `allow:` 行 + `owns:` 行）：至多**共享 `allow` 行的 join 辅助**；**不得**改 marker、**不得**把 `owns:` 搬进新块 ⇒ 既有守卫（AC19 逐字 + marker 整行计数；AC20 解析 `owns:` 行）必须继续绿（oracle F1）。
- [x] **B2（AC9）** `prompts/build.md` 插入 **6 个**角色写集块（architect / planner / builder / no-role / general / verifier），内容 = `renderWriteSetBlock` 输出的**逐字**副本；起止标记各自独占一行。
  > **验收证据**：6 个块落盘且**逐字**等于 `renderWriteSetBlock` 输出，各**恰好 1 处**（`bun -e` 逐角色数出现次数 = 1）；起止标记独占一行；三种特殊形态正确（`builder`/`general` ⇒ `allow: **`；`no-role` ⇒ `allow: (none)` + `denyAll: true`）。
  > **验收证据**：6 块的存在与逐字一致性由 **B3 的断言族**验证（config-guards 的 6 角色族，先红后绿）（oracle F6 笔误修正）。
  > ⚠ **三种特殊形态**：`builder` / `general` ⇒ `allow: **`；`no-role` ⇒ `allow: (none)` + `denyAll: true`（**不写空 `allow:` 行** —— 守卫的 `split(", ")` 会得到 `[""]`）；其余四角色 ⇒ `allow: p1, p2, ...`。
  > ⚠ **两条散文事实必须同时存在**（块表达不了，删了就是信息丢失 —— oracle F9）：① `architect` / `builder` / `general` 的 `governance: true` 治理面授权；② `architect` 的 `arch_paths` 动态并入。
  > ⚠ **落点**：6 块插入点必须在 T0b 普查出的**空隙**内 ⇒ 避开行 449 / 456–457 / 483 / 489 四处被 pin 边界（见 `design.md` §2.4）。
- [x] **B3（AC10）** `tests/config-guards.test.ts` 新增断言族（对 6 个角色逐个）：块 == 渲染输出（逐字）· **恰好 1 处** · 标记独占一行。
  > **验收证据**：`tests/config-guards.test.ts` 新增 describe「角色写集机读投影（role-write-set:<role> —— 6 角色族）」= **152 pass / 0 fail**；对 6 个角色逐个断言块 == 渲染输出（逐字）· 恰好 1 处 · 起止标记独占一行。  > ⚠ **落点**：插在行 2944 之后（`能力面写集对齐` describe **之前**）—— 该位置不在任何 pin 的 find 文本**内部** ⇒ 不破坏 `find_count`（清单守卫绿）。  > ⚠ **import**：本文件顶部 import 块被 pin ⇒ 断言族用**动态 import**（`await import`）。
  > **验收证据**：先写断言 ⇒ 红（块尚未落盘）⇒ 落盘 ⇒ 绿。
  > ⚠ **落点约束**：必须落在 **T0b 普查出的未 pin 空隙**；若必须落在被 pin 的 describe 内 ⇒ 同批更新对应清单的 `find`（并按两段式处理 `last_drill`）。
- [x] **B4（AC11）** **负向验证**：① 改 `ROLE_WRITE_POLICY` 任一条 ⇒ 红；② 手改块内一个字符 ⇒ 红；③ 多复制一份块 ⇒ 红。三条各自恢复原状。
  > **验收证据**：三条负向验证**全部红**（脚本 `/tmp/opencode/negative-checks.py`，每条变异后跑测试并**逐字恢复**）：① 改 `ROLE_WRITE_POLICY` 的 architect allow 加一个路径 ⇒ 红；② 手改块内一个字符（`.rddf/state/verifier` → `...verifierx`）⇒ 红；③ 多复制一份 `role-write-set:general` 块 ⇒ 红。恢复后 `bun test` 回归绿，工作树与变异前逐字一致。
  > **验收证据**：三次变异的红态用例名与差异摘要。
- [x] **B5（AC12）** 角色列表「允许」列**不再复述写集路径**（改为指向机读块）；本轮引入的「表尾投影」散文块**删除**（不保留两份）。
  > **验收证据**：① 角色表 6 行的**允许列**经逐行解析（第 2 段）核对 ⇒ **写集路径字面 0 命中**（architect/planner/verifier 三行已改为「见本表下方的写集机读块」）；② 表尾投影块（写集复述）已删，**保留**了 critic NIT-3 指出的两条非写集事实（「禁止列机器层不拦」+「§4.x 悬空编号说明」）并改写了失效注记；③ **两条块表达不了的事实**（`governance: true` 治理面授权 / architect 的 `arch_paths` 动态并入）已入散文。  > ⚠ **AC12 判据范围修正**（实施中判定）：原措辞「节内 grep ⇒ 命中只允许落在块边界内」**按字面恒红** —— **禁止列**里 `.rddf/state/verifier/*`（rdd-verifier skill 的 owns 说明）是**正当提及**。⇒ 判据收窄为「**允许列**内不含写集路径字面」（AC12 的原意），守卫按表格第 2 段取列（已实现）。
  > **验收证据**：在**角色列表节内** grep 写集路径字面 ⇒ 命中只落在块边界内（节外命中数 == 0）（给出命令与输出）。
  > ⚠ **判据范围限定在角色列表节**（oracle F3）：`.rddf/reviews` / `.rddf/state/verifier` 在**其它节**（architect / verifier 产出契约、派发后端章节）有正当散文提及 ⇒ 文件级 grep 恒红 ⇒ 实施者被迫静默收窄判据。
  > ⚠ **同批改写失效注记**（oracle F8）：`prompts/build.md` 里「其余五角色写集机读块化属已知缺口（follow-up，非本轮）」那条注记在本段落地后即失真 ⇒ 随本条一并改写。
  > ⚠ **「表尾投影」整块不得整块删**（critic NIT-3）：`prompts/build.md:461-478` 的该块内**夹带两条与写集无关的事实** —— ① 「禁止列机器层不拦」（`:472-473`）② 「§4.x 悬空编号说明」（`:474-475`）⇒ 整块删除会顺带丢失 ⇒ **保留/迁移这两条**（移入散文或保留为独立 bullet），只删除「写集路径复述」那部分。
  > ⚠ **节界显式锚定**（critic 验证建议）：AC12 的「角色列表节」= `### 角色列表` 标题行**至下一个同级标题之前** ⇒ 守卫按**标题锚点**定位（不按行号）⇒ 防节界漂移导致判据静默收窄。
- [x] **B6（AC13）** ① `ROLE_WRITE_POLICY` 的「定义点恰好 1 处」守卫（AC16）仍绿；② `ROLE_WRITE_POLICY` **内容零改动**（`git diff lib/role-policy.ts` 为空）；③ **新增** deep-equal 断言：`ROLE_WRITE_POLICY.verifier.allow` 与 `VERIFIER_ALLOW_ROOTS` 逐元素相等（oracle F7：二者当前巧合相等但各自独立演化，无守卫则漂移互不报警）。
  > **验收证据**：① AC16「定义点恰好 1 处」仍绿；② `git diff --stat lib/role-policy.ts` = **空**（真源零改动）；③ 新增 deep-equal 用例：`ROLE_WRITE_POLICY.verifier.allow` 与 `VERIFIER_ALLOW_ROOTS` 逐元素相等 ⇒ 绿。
  > **验收证据**：`git diff --stat lib/role-policy.ts` 无输出；AC16 用例绿；新增 deep-equal 用例先红后绿。
- [x] **B7（AC14）** `bun test tests/` 全绿；`bash scripts/check-upstream-anchors.sh` 无 `FAIL` 且无 `SKIP`。
  > **验收证据**：`bun test tests/` = **1168 pass / 1 skip / 0 fail**；`bash scripts/check-upstream-anchors.sh` = **OK（29/29）**。

## C. 段 C —— 账本登记（不实施）

- [x] **C1（AC15）** `.rddf/improvements/rollback-drill-replace-pattern.md` 的状态行标为「**已实施**」并给出实测指针（`lib/rollback-drill.ts:450` · `lib/rollback-drill.ts:48-51` · `.rddf/rollback/README.md:47` · `tests/rollback-drill.test.ts` 4 条新用例 / 共 39 条）。
  > **验收证据**：`.rddf/improvements/rollback-drill-replace-pattern.md` 状态行改为「已实施」并给出四处实测指针；`grep -n "字面" .rddf/rollback/README.md` 命中行 47 存在；`bun test tests/rollback-drill.test.ts` = 39 pass / 0 fail。
  > **验收证据**：改动后 `grep -n "字面" .rddf/rollback/README.md` 命中行存在；`bun test tests/rollback-drill.test.ts` = 39 pass / 0 fail。

## D. 收口

- [x] **D1** 回滚演练：清单内容变更与「撤 `last_drill` + registry 转 `proving`」**同一 commit** ⇒ 演练 ⇒ 回填 `last_drill` + registry 转 `active`。
  > **验收证据**：两段式第 1 步（撤 `last_drill` + registry 转 `proving`）与清单内容变更同批提交（commit `5b5ec86` / `2cfd04d`）⇒ 演练 **PASS** ⇒ 第 2 步回填 `last_drill`（sha `2cfd04d` · at 2026-11-24 · result pass · content_hash `89474648f26c…`）+ registry 转 `active`。
  > **验收证据**：registry 输出 PASS（9 active / 0 proving）；`last_drill.content_hash` 与清单当前内容一致。
- [x] **D2** `docs/CHANGELOG.md` 一条版本条目。
  > **验收证据**：`docs/CHANGELOG.md` 的 v2.70 条目（含「未完成」的 AC3 残留登记）。
- [ ] **D3** 验收报告落 `.rddf/reviews/rollback-manifest-find-narrowing-verify.md`（AC1–AC15 逐条 + 工具证据）。
- [ ] **D4** 归档：`openspec archive` 前确认 `.openspec.yaml` 含 `skip_specs: true`。

## 未收敛清单 check list（AC7）

见上方 A6 段表格（8 个清单逐行登记；`commit-gate.json` 已达标 ⇒ 移出基线表）。
