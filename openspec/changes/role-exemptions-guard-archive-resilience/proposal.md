# role-exemptions-guard-archive-resilience — AC23 守卫写死未归档路径 ⇒ 该 change 一归档即崩

> 输入：`.rddf/improvements/role-exemptions-guard-archive-resilience.md`（5 段草稿，**metis 1 轮审后修订**；机制细节以该文件为准，本 proposal 只保留**可验收的那一层**）。
> planner 审查：`.rddf/reviews/role-exemptions-guard-archive-resilience-planner-review.md`（metis 六节 finding 逐条处置 + 1 处对其建议的修正）。
> 来源：`commit-gate-d9-three-place-registration` 的 **Out of Scope ④**（登记为另案隐患）+ 用户 2026-11-18 指令「AC23 守卫的路径硬编码立项」。
> 决策真源：`docs/adr/ADR-role-aware-permissions.md` **D5** + **AC23** —— 本 change **不改决策、不改判据强度**，只修**载体解析**。
> 性质：**只改测试**（`tests/role-exemptions.test.ts`）⇒ 运行时**零影响**。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置（`.rddf/state/.{arch,planner}-handoff.json`）不存在 ⇒ 走**内置流程**（同 `cross-repo-workspace-check` 先例）。

## Why

`tests/role-exemptions.test.ts` 用 `PLACES` 把三处登记路径**写死**，其中 AC 面是**未归档路径**：

```ts
// :28-32
const PLACES = [
  ["AC（proposal.md）", path.join(ROOT, "openspec", "changes", "role-aware-permissions", "proposal.md")],
  ["测试注释（本文件头）", path.join(ROOT, "tests", "role-exemptions.test.ts")],
  ["主题文档（MULTI-AGENT-DESIGN.md）", path.join(ROOT, "docs", "MULTI-AGENT-DESIGN.md")],
] as const
```

**炸弹是活的**：`role-aware-permissions` 现为「✓ Complete」且 proposal 未勾项 **0** ⇒ 随时可归档；归档后 `readFileSync`（`:42 / :50 / :62`）抛 **`ENOENT`** ⇒ **整组崩溃**（不是逐项判红），且错误信息**不含「缺哪个载体」**。

**三个真风险**（metis 指出，本 proposal 逐条对应）：

| # | 风险 | 对应 |
|---|---|---|
| **R1** | 「先活跃、后归档」是**探查顺序**而非判定规则 ⇒ 两形态并存时**静默选一个** ⇒ 同一仓库状态两种权威（且与 D9 守卫的「并集 + 唯一性判红」口径不一致） | **D1 三态判定** / AC1 |
| **R2** | 去掉写死路径会**连带丢掉**「三处是三个不同文件」这层保证 ⇒ 解析器若把 AC 面指到测试文件（本来就有六项）⇒ 三个 `test` 全绿 ⇒ **AC23 静默降级成「一处命中」**（= 改判据强度） | **D2 身份互异性** / AC3 |
| **R3** | 判别力用例（`:61-71`）与解析共用同一结果 ⇒ 解析错、用例跟着错 ⇒ **自证** | **D3 纯函数 + fixture** / AC6 / AC7 |

⚠ **顺序陷阱**：`role-aware-permissions` 若在本项**落地前**归档 ⇒ 那次归档的 commit 会被 `.rddf/commit-gate.json` 的 `verify_commands`（`bun test tests/`）**卡红**。⇒ **先焊死，再归档**。

## What Changes

### D1 候选枚举 + 三态判定（替换「先活跃后归档」）

```ts
const AC_NAME = "role-aware-permissions"
const AC_HEADING = "## 免宣称六项（AC23 的登记面）"

type AcFace =
  | { kind: "active" | "archived"; path: string; text: string }
  | { kind: "none"; searched: string[] }
  | { kind: "ambiguous"; paths: string[] }

/** 纯函数（无模块级缓存）：候选 = 活跃 + archive/*-<name>；恰好 1 个才通过。 */
function resolveAcFace(root: string): AcFace { /* 见 proposal 下方「判定表」 */ }
```

| 候选数 | `kind` | 判定 | 文案要求 |
|---|---|---|---|
| 1（`openspec/changes/<name>/proposal.md`） | `active` | ✅ 通过 | — |
| 1（`openspec/changes/archive/*-<name>/proposal.md`） | `archived` | ✅ 通过 | — |
| **0** | `none` | ❌ 红 | 含**解析根** + 两形态**相对路径**（含「目录在但 `proposal.md` 缺」子情形：点名目录） |
| **≥2** | `ambiguous` | ❌ 红 | 列出**全部候选路径** + 「删掉多余的候选（活跃与归档并存 ⇒ 删 `archive/` 下的日期目录；两个归档并存 ⇒ 删旧的那个）」 |

- 归档目录匹配 = **精确式** `^\d{4}-\d{2}-\d{2}-<name>$`（本仓归档一律 `YYYY-MM-DD-<change>`，18/18 历史归档均为此形态）。
  ⚠ **不用** `e.name.endsWith("-" + AC_NAME)` —— 后缀匹配会把名字**以** `-role-aware-permissions` 结尾的其它 change 捞成候选（常驻假红）；判别力用例：`2026-01-01-extend-role-aware-permissions` 不算候选（oracle 复审 F1）。
- `archive/` 不存在 ⇒ 视为 0 候选（`existsSync` 兜，不抛）。
- **不**扫全部 proposal（AC23 的面是**名字绑定**的 ⇒ 通用扫描会把「脏并存」退化成「出现 2 次」，诊断变差）。

### D2 载体身份与互异性（补回 R2 丢掉的保证）

- AC 面路径 **必须** ∈ `openspec/changes`；
- 三处路径**两两不同**：`new Set([acPath, selfPath, madPath]).size === 3`。

### D3 纯函数 + fixture（堵 R3）

- `resolveAcFace(root)` 无模块级缓存；测试用 `mkdtempSync` 造 fixture 并 `try/finally rmSync`。
- 断言里路径一律 `path.relative(root, p)` 归一（避免前缀差异造成假红）。

### D4 失败形态 = **判红** + 可断言文案（不抛异常）

解析器返回 `none` / `ambiguous` ⇒ 由 `test` 里的 `expect` 判红（保住**逐项失败计数**），**不得** `throw`（抛出会让整组崩，且与 D9 的 `violations` 口径不一致）。

### D5 文案分三态（诊断质量）

| 态 | 触发 | 文案要点 |
|---|---|---|
| **(a) 无载体** | 两形态都无 `proposal.md`（含目录在文件缺） | 解析根 + 两形态相对路径 + 「缺 AC23 的 AC 面载体 ⇒ 见 `ADR-role-aware-permissions` D5」 |
| **(b) 有文件无标题** | `proposal.md` 在，但**行首** `## 免宣称六项（AC23 的登记面）` 找不到（改名 / 降级 / 加粗） | 文件相对路径 + **期望标题原文** |
| **(c) 有标题六项不全** | 小节在、六项不全 | 保留原 `「${label} 缺免宣称项：…」`，**label 里加相对路径** |

### D6 明确不改

- D5 六项**内容**、AC23 **判据强度**（三处各自命中 + 标识后须有实质说明 + 删任一项必红）、另两处 `PLACES` 的语义。

### D7 不 `export` 解析器

跨 `.test.ts` import **实测不可用**（`bun -e 'import …'` 在对方 `describe(` 处抛错）⇒ `export` 只是空转，且与「不抽模块」口径冲突。

## 验收标准

> 每条配工具证据；`skip` ≠ `pass`。

| AC | 判据 | 类型 | 来源 |
|---|---|---|---|
| AC1 | **三态**：fixture 六例 —— 仅活跃 ⇒ `active`；仅归档 ⇒ `archived`；并存 ⇒ **`ambiguous`**；都无 ⇒ **`none`**（且 `searched` 含两形态）；目录在但 `proposal.md` 缺 ⇒ `none` 且点名目录；**近似名**（`2026-01-01-extend-<name>`）不算候选 ⇒ `none` | 结构 | metis H2 / A1 + oracle F1 |
| AC2 | **真实态**：本仓当前状态解析 ⇒ **恰好 1 个候选**且路径 ∈ `openspec/changes`（⚠ `kind` 只记入验收报告、**不做断言** —— 否则该 change 一归档本判据自己就红；修正自 metis 建议 6） | 结构 | metis 建议 6（修正） |
| AC3 | **身份与互异性**：AC 面 ∈ `openspec/changes`；`new Set([ac, self, mad]).size === 3` | 结构 | metis 建议 2 |
| AC4 | **失败形态**：`none` / `ambiguous` ⇒ **测试判红 + 文案可断言**（含解析根与两形态相对路径）；实测**无未捕获异常** | 结构 | metis 建议 4 |
| AC5 | **文案三态分开**：(a) 无文件 / (b) 有文件无行首标题（文案含**期望标题原文**）/ (c) 有标题六项不全（label 含相对路径） | 结构 | metis 建议 5 |
| AC6 | **判据强度不变**：① 删真实载体里的 `D5③` ⇒ 仍红（原判别力）；② fixture「活跃 proposal 缺项 + archive 副本齐全」⇒ **仍红**（不得静默回退到 archive） | 结构 | metis 建议 3 |
| AC7 | **不空转 / 无缓存**：0 `skip` / 0 `todo`；同一 root 两次调用结果一致；fixture root 不污染真实 root（真实态断言在 fixture 用例跑完后仍绿） | 结构 | metis 建议 3 |
| AC8 | **回归**：`bun test tests/` 全绿；anchors 全绿；**`tests/config-guards.test.ts:142` 的 `tests/role-exemptions.test.ts D5②（部分闭合）` 锚仍绿** | 结构 | — |
| AC9 | **证据包**：**≥3** 条突变（删项 / 零候选 / 脏并存）的「突变描述 + 红输出 + 复原 + 复跑绿」落 `.rddf/reviews/role-exemptions-guard-archive-resilience-mutations.md` | 结构 | metis 建议 3 |

**取红 / 钉住 分档**

| 分档 | AC | 说明 |
|---|---|---|
| 🔴 **取红**（有对应突变，突变后必红） | AC1（M1）、AC3（M2）、AC4（M3）、AC5（M4）、AC6（M5/M6） | 这五条提供本 change 的判别力 |
| 🟡 **钉住** | AC2（真实态）、AC7（无缓存）、AC8（回归）、AC9（证据包） | 只防回归，不得写成「红」 |

**变红演练（6 条；一判据一行）**

| # | 突变点 | 必红的断言 |
|---|---|---|
| M1 | 删 `ambiguous` 分支（≥2 时返回第一个） | AC1「并存 ⇒ `ambiguous`」 |
| M2 | 让解析器把 AC 面返回**测试文件本身** | AC3「三处两两不同」 |
| M3 | 载体缺失时 `throw new Error(...)`（替代返回 `none`） | AC4「判红而非未捕获异常」 |
| M4 | 把 AC23 小节的标题改成 `### 免宣称六项` | AC5(b)「文案含期望标题原文」 |
| M5 | 删真实载体里的 `D5③` 行 | AC6①「删项仍红」 |
| M6 | 让解析器在活跃缺项时**回退**到 archive 副本 | AC6②「不得静默回退」 |

**真实归档演练（非突变，执行证据）**：把 `openspec/changes/role-aware-permissions` 实际 `mv` 到 `openspec/changes/archive/2026-11-19-role-aware-permissions` 后 ⇒ 候选数 = 1 且为 `archived`、守卫 **20 pass / 0 fail**、全量 **914 pass / 0 fail**；`mv` 回来后同样 914 绿。（旧实现在这一形态下抛 `ENOENT`。）


## Out of Scope

| # | 不做 | 理由 |
|---|---|---|
| ① | 抽公共解析器模块 | 跨 `.test.ts` import 实测不可用；`lib/**` 有新增文件闸门且语义不属运行时；当前只有**两个守卫文件**（不是两个调用点） |
| ② | 把 AC23 守卫重构成 D9 的 `Texts` / `faces()` / `violations()` 框架 | AI slop：AC23 不需要标题保真 / 负向词 / 并集唯一性 |
| ③ | **`stripNoise` 类假绿边界**（`<!-- -->` / 围栏里的 `D5③` 仍算命中） | 改它 = 改判据强度（D6 禁止）⇒ 登记为**已知边界**，威胁模型 = 故意手改（与 D9 守卫同款话术） |
| ④ | 把「守卫不得硬编码未归档 change 路径」升级为**仓级闸门**（`config-guards` 扫描） | 属新需求；**触发条件**：出现**第三个**守卫消费者时再立项 |
| ⑤ | `tests/role-identity.test.ts:4` 的注释引用 | 只是注释、非判据 |
| ⑥ | 预先实现「D5 扩项 ⇒ 并集 + 按面唯一性」 | 现在没有第二个消费者；预先实现是无需求设计 |
| ⑦ | `export` 解析器 / 「将来可复用」的接口 | 无真实消费者（跨 `.test.ts` import 不可用） |

## 实施顺序（**硬约束**）

1. 写解析器 + 三态表（D1）；
2. 把 `PLACES` 改为按解析结果构造 + 身份断言（D2）；
3. 三态文案（D5）；
4. fixture 用例（D3 / AC1 / AC6② / AC7）；
5. 突变演练 6 条（AC9）；
6. 回归（AC8）；
7. ⚠ **最后才归档 `role-aware-permissions`** —— 顺序颠倒 ⇒ 归档 commit 被 `bun test tests/` 卡红。
