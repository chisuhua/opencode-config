# role-exemptions-guard-archive-resilience —— 审查记录（oracle 治理面 + critic）

> 判据真源：`openspec/changes/role-exemptions-guard-archive-resilience/proposal.md` 的 **AC1–AC9**。
> **归档指针（2026-11-19）**：该 change 已归档为 `openspec/changes/archive/2026-11-19-role-exemptions-guard-archive-resilience/`。本文内出现的 `openspec/changes/role-exemptions-guard-archive-resilience/…` 是**归档前的历史记述**（过程记录不回改）。

> 被审对象：`tests/role-exemptions.test.ts`（改动 `8847aaf` + oracle 处置 `77af072` + 本次 SHOULD_FIX 处置）。
> 预算：oracle **1 轮** + critic **1 轮**（`prompts/build.md` §审查配对：治理面 = oracle → critic，各 1 轮）。

## 1. oracle（治理面，`治理面判定: PASS`）

审查域声明：`审查域: 治理面`。输入含可判定意图陈述（要解决的问题 + 范围边界）与 5 条关键设计选择。

| finding | 影响 | 处置 | 落点 |
|---|---|---|---|
| **F1** 归档匹配 `endsWith("-<name>")` ⇒ 名字**以** `-role-aware-permissions` 结尾的其它 change 会被捞成候选 ⇒ 常驻假红 | 中 | ✅ **修**：`ARCHIVE_DIR_RE = /^\d{4}-\d{2}-\d{2}-role-aware-permissions$/`（18/18 历史归档均为此形态，当日行为零变化）+ 新增判别力用例「`2026-01-01-extend-role-aware-permissions` 不算候选」 | `tests/role-exemptions.test.ts` |
| **F2** `emptyDirs` 只在 `none` 分支 surfaced（活跃副本在位 + 残留空归档目录时不提示） | 低 | ⛔ **不修**：并入 `ambiguous` 会让「活跃副本即权威 + 一个残留空目录」由**绿转红** ⇒ 属改判定面，超出本 change「只修载体解析」（D6）。登记为**已知诊断边界** | — |
| **F3** `ambiguous` 文案只说「删掉旧目录」，双归档场景可能删错 | 低 | ✅ **修**：改为「删掉多余的候选（活跃与归档并存 ⇒ 删 `archive/` 下的日期目录；两个归档并存 ⇒ 删旧的那个）」 | 同上 |
| **F4** ① `none` 文案里 `archive/*-…` 是 glob，读者可能当真实路径；② AC7 注释称「顺序证明未污染」因果过度 | 低 | ✅ **修**：① 加「（后者为 glob 形态）」；② 改为「作为真实态的廉价端到端复验」 | 同上 |

oracle 独立核验的结论（摘要）：
- **判据强度无漂移、只有增强**：「三处各自命中」保留、标识符后 ≥20 字说明保留（400 字窗口口径未变）、删任一项必红保留且经 M5 真实载体演练；新增的 AC3 互异性 / AC6② 不回退是**补上**原隐含保证。
- 「候选按文件存在性计数」被确认是**必要**的：M6 实测按内容过滤会把「活跃缺项 + 归档齐全」静默判成 `archived` 绿。
- 5 个被否掉的替代方案复核后**全部否得对**。
- 残余：oracle 的 shell 动词集不含 `bun`，无法独立复跑测试 ⇒ 要求调用方在归档前跑一次全量 + anchors（见 §3）。

## 2. critic（`APPROVE`，`mergeable: yes`，`scope_exceeded: false`）

| 级别 | finding | 处置 |
|---|---|---|
| **BLOCKER** | 无（focus 四点逐条核验：判据强度未调低 / 归档韧性真实 / 失败形态不可抛 / 与 `config-guards:142` 锚不冲突） | — |
| **SHOULD_FIX** | `proposal.md` 的 D1 仍写旧规则（`endsWith`）与旧 ambiguous 文案，AC1 仍写「四例」⇒ spec delta 与实现漂移，归档会把旧规则冻进历史 | ✅ **已修**：D1 改为精确式正则 + 加 F1 的判别力说明；ambiguous 文案同步；AC1 改为**六例**（补「目录在但文件缺」与「近似名」两例）；并在变红演练表后补「真实归档演练」执行证据 |
| **NIT** | `missingItems` 仍 `export` 但无跨文件消费者（基线遗留，本次未触碰签名；D7/D8 禁的是 export **解析器**，`resolveAcFace`/`acFaceFailures`/`acPlaceFor` 均未 export） | 不修，记 backlog（属基线遗留、与本 change 无关） |
| **NIT** | 唯一候选在解析期即读全文，未来体量变大可惰性读取 | 不修（当前无必要） |

## 3. 真实归档演练（critic 建议的执行证据）

| 步 | 结果 |
|---|---|
| `mv openspec/changes/role-aware-permissions openspec/changes/archive/2026-11-19-role-aware-permissions` | 活跃目录不存在、归档目录存在 |
| 候选解析 | 候选数 = **1**，`archived:…/archive/2026-11-19-role-aware-permissions/proposal.md` |
| 守卫 | `bun test tests/role-exemptions.test.ts` ⇒ **20 pass / 0 fail** |
| 全量 | `bun test tests/` ⇒ **914 pass / 0 fail** |
| `mv` 复原 | **914 pass / 0 fail**，`git status` 无残留 |

⇒ **「归档当天不崩」由执行证据直接证伪了旧风险**（旧实现此形态下抛 `ENOENT`）。

## 4. 回归（本轮提交前实跑）

| 检查 | 结果 |
|---|---|
| `bun test tests/` | **914 pass / 0 fail** |
| `bun test tests/role-exemptions.test.ts` | **20 pass / 0 fail** |
| `bash scripts/check-upstream-anchors.sh` | **23/23** |
| `openspec validate role-exemptions-guard-archive-resilience --strict` | **valid** |

## 5. 结论

- **无 BLOCKER**；SHOULD_FIX 已处置；两条 NIT 不修并记录理由。
- 判据真源 AC1–AC9 与实现逐条对应（对应关系见证据包 M1–M6 + 真实归档演练）。
- ⚠ **顺序硬约束仍成立**：本 change 已焊死 ⇒ `role-aware-permissions` 现在可以安全归档。
