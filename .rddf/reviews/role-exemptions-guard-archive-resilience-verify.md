# role-exemptions-guard-archive-resilience —— 验收报告（第 1 轮）

> **角色**：verifier（独立验收；只出证据与判决，**不改实现**）
> **判据来源**：`openspec/changes/role-exemptions-guard-archive-resilience/proposal.md` 的 `## 验收标准`（**AC1–AC9**）—— 本 change 明确声明「判据真源 = 该 AC 表」。
> **分流判定**：`rddf rdd-verify --dry-run` ⇒ `No eligible changes to verify (empty queue)`；**`.rddf/state/iteration.json` 不存在** ⇒ **P3 archive gate 未触发**（`rdd-verifier` skill 虽 `available`，但 canonical 前置不满足）⇒ 走**本地验收**（本报告）。
> ⚠ **本地验收的额外门（`tasks_done == tasks_total > 0`）不适用**：本 change **无 `tasks.md`**（`openspec archive` 对同族 change 也报 `Task status: No tasks`）⇒ 以 proposal 的 AC 表为唯一判据。
> **被验提交**：`8847aaf`（实现）→ `77af072`（oracle 处置）→ `7f09fc5`（critic SHOULD_FIX + 审查记录）。
> **已用轮次**：**第 1 轮**（上限 3）。

## 1. 验证顺序与基线

| 步 | 检查 | 结果 |
|---|---|---|
| 0 | 静态 / 编译 | 本仓**无 `tsconfig.json`**，TS 由 `bun test` 编译 ⇒ 单测运行即编译检查 |
| 1 | 单测（被改文件） | `bun test tests/role-exemptions.test.ts` ⇒ **20 pass / 0 fail**（103 ms） |
| 2 | 全量 | `bun test tests/` ⇒ **914 pass / 0 fail** |
| 3 | 锚点 | `bash scripts/check-upstream-anchors.sh` ⇒ **23/23** |
| 4 | openspec | `openspec validate role-exemptions-guard-archive-resilience --strict` ⇒ **valid** |
| 5 | 判别力 | verifier **自写两条新突变**（不复用 builder 脚本）⇒ 均红在预期断言上（§3） |
| 6 | 集成（真实归档） | verifier **独立重做归档演练** ⇒ 归档形态下守卫 20 绿、全量 914 绿；复原后同样 914 绿（§4） |

## 2. 逐 AC 判定（每条都有工具证据）

| AC | 判定 | 证据（verifier 本次实跑） |
|---|---|---|
| AC1（三态六例） | ✅ | `bun test … -t "AC1"` ⇒ **10 pass / 0 fail**；六例（仅活跃 / 仅归档 / 并存 / 都无 / 目录在文件缺 / 近似名不算候选）逐条在文件内；**独立突变 V1**（把归档匹配退回 `endsWith`）⇒ 「近似名不算候选」用例**变红** ⇒ 该例有判别力 |
| AC2（真实态恰好 1 候选） | ✅ | `resolveAcFace(ROOT)` 实测候选数 = **1**、路径 ∈ `openspec/changes`；`kind` **未被断言**（符合「修正自 metis 建议 6」）—— grep 确认实现里无 `kind === "active"` 断言 |
| AC3（身份 + 互异性） | ✅ | `-t "AC3"` ⇒ 1 pass；实现含 `new Set([ac, self, mad]).size === 3`；**独立突变 V2 之外的 builder M2**（AC 面指向测试文件本身）红在 AC3（证据包 `:43-68`）⇒ 降级路径被封死 |
| AC4（判红不抛异常） | ✅ | `-t "AC4"` ⇒ 1 pass；**V2**（诊断整体失效）红在 AC5/AC6②；builder **M3**（`throw` 替代返回 `none`）红 5 例 ⇒ 抛异常形态被证伪 |
| AC5（文案三态分开） | ✅ | `-t "AC5"` ⇒ **3 pass**；(a) 含解析根 + 两形态相对路径 + ADR 指针，(b) 含**期望标题原文**「`## 免宣称六项（AC23 的登记面）`」，(c) label 含相对路径 —— **V2** 逐条把这三态打红 |
| AC6（判据强度不变） | ✅ | `-t "AC6"` ⇒ 2 pass；① 真实载体删 `D5③` ⇒ 仍红（M5）；② fixture「活跃缺项 + archive 齐全」⇒ **仍红**（M6 实测 `Received: "archived"`）；`missingItems` 签名与实现**逐字未变**（`:126-128`） |
| AC7（不空转 / 无缓存） | ✅ | `grep -cE "\.skip\(|\.todo\("` ⇒ **0**；`console.log` / `FIXME` / 注释掉的代码 ⇒ **0**；「同一 root 形态变化立即反映」用例绿（活跃 → 归档），「fixture 用例跑完后真实态仍解析为单一候选」用例绿 |
| AC8（回归） | ✅ | 全量 **914 pass / 0 fail**；anchors **23/23**；`validate --strict` **valid**；`config-guards:142` 锚点 needle `D5 **部分闭合**` 在被改文件里 **1 处命中**，锚本身在 `tests/config-guards.test.ts:142` |
| AC9（证据包） | ✅ | `.rddf/reviews/role-exemptions-guard-archive-resilience-mutations.md`：M1–M6 **6 条**（要求 ≥3），每条含「突变描述 + 红输出 + 复原 + 复跑绿」（「复原后…20 pass / 0 fail」出现 **6** 次） |

**旁证（oracle / critic 的可核声称）**：
- 归档目录形态：实测 `openspec/changes/archive/` 共 **18** 个目录，**18/18** 符合 `^\d{4}-\d{2}-\d{2}-.+`（oracle 与 F1 改法的依据成立）；
- F3 / F4 文案确实落在实现里（`删掉多余的候选` / `后者为 glob 形态`）；
- F2「不修」与实现一致：`emptyDirs` 只在 `none` 分支 surfaced（`:94` / `:108`），resolved 分支不提；
- 残留旧措辞扫描：proposal 与 review 记录里出现的 `endsWith` 全部是**说明性/历史记述**（「⚠ 不用 `endsWith`」与 finding 描述），**无残留规则**；
- 本 change 触及文件 5 个，与审查记录一致；`scripts/mutate-cancel-release.sh` 是历史文件（`73811ef`），非本 change 引入；scratch 脚本只在 `/tmp`。

## 3. verifier 独立变红演练（不复用 builder 脚本）

| # | 突变 | 实测红 | 结论 |
|---|---|---|---|
| **V1** | 归档匹配退回 `endsWith("-<name>")` | `AC1 fixture … > 近似名（2026-01-01-extend-role-aware-permissions）不算候选` **红**（19 pass / 1 fail） | ✅ F1 的判别力用例**确有**判别力（builder 的 M1–M6 未覆盖此点） |
| **V2** | `acFaceFailures` 恒返回 `[]`（诊断整体失效） | `AC5(a)`、`AC5(b)`、`AC6②` **红**（17 pass / 3 fail） | ✅ 三态文案与「不得静默回退」文案都**依赖**诊断函数，不是摆设 |

两条突变后均复原并复跑 **20 pass / 0 fail**；复原后全量 **914 pass / 0 fail**。

## 4. verifier 独立归档演练（集成路径）

| 步 | 结果 |
|---|---|
| `mv openspec/changes/role-aware-permissions openspec/changes/archive/2026-11-19-role-aware-permissions` | 活跃目录**不存在**、归档目录存在 |
| `bun test tests/role-exemptions.test.ts` | **20 pass / 0 fail** |
| `bun test tests/` | **914 pass / 0 fail** |
| `mv` 复原 | **914 pass / 0 fail**；`git status` 仅 `M cli.json`（运行时文件） |

⇒ 本 change 的立项理由（「该 change 一归档即崩」）在**真实归档形态**下被直接证伪。

## 5. 遗留清扫复核（**未通过：1 项**）

| # | 发现 | 证据 | 为什么算遗留 |
|---|---|---|---|
| **L1** | `.rddf/improvements/role-exemptions-guard-archive-resilience.md` 的 **AC8 摘要仍写「全量 `bun test tests/` 全绿（913）」**，实测为 **914** | `grep -o "全绿（[0-9]*）"` ⇒ `全绿（913）`；实测 `bun test tests/` ⇒ **914 pass** | 数字在 oracle 处置（F1 加了第 20 条用例）后已过时 ⇒ **宣称 ≠ 实现**（本仓反复强调的同一类病：记录侧滞后于实现） |

✅ **清扫通过的部分**：被改文件无 `console.log` / `FIXME` / `.skip` / `.todo` / 注释掉的代码（`grep` 全空）；工作树仅 `M cli.json`（运行时文件，刻意不提交）；无临时脚本入仓（scratch 只在 `/tmp/opencode`）；proposal / improvement / 证据包 / 审查记录之间的措辞与数字除 L1 外全部一致（逐项扫描过残留旧措辞）。

## 6. 判定与路由

**判定：❌ 不通过（记录类 —— AC1–AC9 全满足，遗留清扫 1 项未闭合）**

| 项 | 分类 | 路由 |
|---|---|---|
| AC1–AC9 | ✅ 全部满足（每条附 verifier 自跑证据） | — |
| **L1**（improvement 的 AC8 数字 913） | **proposal_drift**（记录与实测不一致；该文件是 planner 产物） | **builder 校准即可**（**不改实现**）：把 `（913）` 改为 `（914）`（或去掉数字、改为「全量绿」以免再次漂移） |
| — | 复验义务 | 清理后**第 2 轮复验**（只核 L1 + 全量回归） |

⚠ **不改实现**（角色边界）：L1 是**记录校准**，不涉及代码；校准后需复跑 `bun test tests/` 与 `openspec validate --strict`。

## 7. 已用轮次

| 轮 | 结果 | 备注 |
|---|---|---|
| **1**（§1–§6） | ❌ 不通过（记录类） | AC1–AC9 全绿（含 verifier 自写 V1/V2 两条新突变 + 独立归档演练）；遗留清扫 1 项（L1）⇒ 路由回 builder 校准，之后复验 |
| **2**（§8） | ✅ **通过** | L1 闭合 + 全量回归全绿 |

## 8. 第 2 轮复验（只核 L1 + 全量回归）

> 被验提交：`d9eec65`（builder 的 L1 校准）。本轮**只**核第 1 轮列出的 1 项遗留 + 全量回归，**不做全量重审**。

| 项 | 判定 | 证据（本次实跑） |
|---|---|---|
| **L1** improvement 的 AC8 摘要数字滞后（913 vs 914） | ✅ 闭合 | `grep -c "全绿（913）"` ⇒ **0**（旧数字已无）；现文为「**全绿**（本次实测 **914** pass / 0 fail；⚠ 数字随用例增删变，以实跑为准）」—— 数字已对齐，且加了「以实跑为准」的免漂提示 |
| **回归** | ✅ | `bun test tests/` ⇒ **914 pass / 0 fail**；`check-upstream-anchors.sh` ⇒ **23/23**；`openspec validate role-exemptions-guard-archive-resilience --strict` ⇒ **valid**；工作树仅 `M cli.json`（运行时文件） |

## 9. 最终判定

**✅ 通过（2026-11-19，第 2 轮）**

- **AC1–AC9 全部满足**，每条有 verifier 自跑证据（§2），外加 verifier 自写的新突变 V1/V2（§3）与独立归档演练（§4）；
- **遗留清扫**：L1 闭合；被改文件无调试残留 / skip / todo / 注释掉的代码；工作树干净；仓内无临时脚本；
- **未启用 `rdd-verifier` skill**（canonical 前置不满足：无 `iteration.json` ⇒ P3 archive gate 未触发）⇒ 走本地验收（本报告）。
