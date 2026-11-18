---
revision_count: 1
last_feedback_id: null
last_feedback_at: null
feedback_status: none
---

# role-exemptions-guard-archive-resilience — AC23 守卫写死未归档路径 ⇒ 该 change 一归档即崩

> **实施状态**：**已立项**（2026-11-18）⇒ `openspec/changes/role-exemptions-guard-archive-resilience/`（逐条判据以该 proposal 的 **AC1–AC9** 为唯一真源；本文只保留动机与机制）
> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。**由 builder 代 planner 起草**（用户 2026-11-18 指定「AC23 守卫的路径硬编码立项」）⇒ **metis 1 轮审后已修订**（rev 1；逐条处置见 `.rddf/reviews/role-exemptions-guard-archive-resilience-planner-review.md`）。
> 决策依据：`docs/adr/ADR-role-aware-permissions.md` **D5** + **AC23** —— 本项**不改任何决策、不改判据强度**，只修**载体解析**。
> 事实依据：`tests/role-exemptions.test.ts:29`（写死未归档路径）+ `:42 / :50 / :62`（三处 `readFileSync` 无回退）⇒ 该 change 一归档即 **`ENOENT` 崩溃**（不是判红）。
> 来源：`commit-gate-d9-three-place-registration` 的 **Out of Scope ④** + 用户指令立项。
> 关联 change：`openspec/changes/role-exemptions-guard-archive-resilience/`（**已立项** 2026-11-18）。
> 执行路径预估：**常规 change**（只改 `tests/role-exemptions.test.ts` ⇒ AC23 判据载体 ⇒ 治理面：**oracle + critic 各 1 轮**）。

## Why

AC23 要求「免宣称六项在三处各自命中」，守卫用 `PLACES` 把**三个路径写死**，其中 AC 面是**未归档路径**：

```ts
// tests/role-exemptions.test.ts:28-32
const PLACES = [
  ["AC（proposal.md）", path.join(ROOT, "openspec", "changes", "role-aware-permissions", "proposal.md")],
  ["测试注释（本文件头）", path.join(ROOT, "tests", "role-exemptions.test.ts")],
  ["主题文档（MULTI-AGENT-DESIGN.md）", path.join(ROOT, "docs", "MULTI-AGENT-DESIGN.md")],
] as const
```

**炸弹是活的**：`role-aware-permissions` 现为「✓ Complete」且 proposal 未勾项 = 0 ⇒ **随时可归档**；归档把 proposal 移到 `archive/<date>-role-aware-permissions/` ⇒ `readFileSync` 抛 `ENOENT`（**整个文件崩**，不是逐项判红，也没有「缺哪个载体」的指引）。

**同一类缺陷今天刚被证明可解**：`tests/commit-gate-d9-registration.test.ts` 内建归档韧性（活跃 + `archive/*` 两形态），并在**本日真实归档**中验证 —— `commit-gate-d9-three-place-registration` 归档后其 AC 面载体切到 `archive/…`，守卫 **18 例仍全绿**（无需改一行）。

**metis 指出的三个真风险（rev 1 已吸收）**：

| # | 风险 | 若不处理的后果 |
|---|---|---|
| R1 | 「先活跃、后归档」是**探查顺序**而非判定规则 | 两形态并存时**静默选一个** ⇒ 同一仓库状态得到两种权威；且与 D9 的「并集 + 唯一性判红」口径不一致 |
| R2 | 去掉写死路径会把「三处是**三个不同文件**」的保证**一起丢掉** | 解析器若把 AC 面也指到测试文件（本来就有六项）⇒ 三个 `test` 仍全绿 ⇒ **AC23 静默降级成「一处命中」**（等于改判据强度） |
| R3 | 判别力用例（`:61-71`）与解析共用一个结果 | 解析错 ⇒ 用例跟着错 ⇒ **自证** |

**还有一个顺序陷阱**：`role-aware-permissions` 若在**本项落地前**归档 ⇒ 那次归档的 commit 会被 `.rddf/commit-gate.json` 的 `verify_commands`（`bun test tests/`）**卡红**（守卫崩在 `ENOENT`）⇒ **必须先焊死再归档**。

## What Changes

| # | 变更 | 落点 |
|---|---|---|
| D1 | **候选枚举 + 三态判定**（替换「先活跃后归档」）：`resolveAcFace(root)` ⇒ `{kind:"active"\|"archived", path, text}` / `{kind:"none", searched}` / `{kind:"ambiguous", paths}`。规则：**恰好 1 个候选才通过**；0 ⇒ 载体缺失文案；≥2 ⇒ 「形态并存，权威不明」文案 | `tests/role-exemptions.test.ts` |
| D2 | **载体身份与互异性断言**：解析出的 AC 面路径必须在 `openspec/changes` 下，且与另两处路径**互不相同**（`new Set([ac, self, mad]).size === 3`）⇒ 保住 R2 那条隐含保证 | 同上 |
| D3 | **解析器是纯函数 `f(root)`、无模块级缓存**；测试用 `mkdtempSync` fixture 传 root（`try/finally` + `rmSync`）⇒ 真实用例与 fixture 用例互不污染（堵 R3） | 同上 |
| D4 | **失败形态 = 测试判红 + 可断言文案**（返回诊断对象，**不抛自定义 `Error`**）⇒ 保住逐项失败计数 | 同上 |
| D5 | **三态文案分开**：(a) 无 `proposal.md`（含「目录在但文件缺」子情形，文案点名目录）；(b) `proposal.md` 在但**找不到行首标题** `## 免宣称六项（AC23 的登记面）`（点名文件 + 期望标题）；(c) 有标题但六项不全（保留原 `label 缺免宣称项：…`，label 加**相对路径**） | 同上 |
| D6 | **判别力拆两条**：① 真实载体文本删 `D5③` ⇒ 仍红（保留原语义）；② fixture「活跃 proposal 缺项 + archive 副本齐全」⇒ **必须红**（钉住不得静默回退到 archive 副本） | 同上 + 证据包 |
| D7 | **明确不改**：D5 六项内容、AC23 判据强度、另两处 `PLACES` 的语义 | — |
| D8 | **不 `export`** 解析器（跨 `.test.ts` import 实测不可用 ⇒ `export` 只是空转，且与「不抽模块」口径冲突） | — |

## Acceptance

> 每条要工具证据；`skip` ≠ `pass`。判据真源 = proposal 的 **AC1–AC9**（本文只摘要）。

- [x] **AC1** 三态解析（四例）：仅活跃 ⇒ `active` / 仅归档 ⇒ `archived` / 并存 ⇒ `ambiguous` / 都无 ⇒ `none`（`searched` 含两形态）
- [x] **AC2** **真实态**：本仓当前状态 ⇒ **恰好 1 个候选**且路径 ∈ `openspec/changes`（⚠ `kind` 只记入验收报告、**不做断言** —— 否则该 change 一归档本判据自己就红）
- [x] **AC3** 身份与互异性：AC 面 ∈ `openspec/changes`；`new Set([ac, self, mad]).size === 3`
- [x] **AC4** 失败形态：`none` / `ambiguous` ⇒ **测试判红 + 可断言文案**（含解析根与两形态相对路径），实测**无未捕获异常**
- [x] **AC5** 文案三态分开：(a) 无文件（含「目录在但 `proposal.md` 缺」点名目录）/ (b) 有文件无行首标题（含**期望标题原文**）/ (c) 有标题六项不全（label 含相对路径）
- [x] **AC6** 判据强度不变：① 删真实载体的 `D5③` ⇒ 仍红；② fixture「活跃缺项 + archive 齐全」⇒ **仍红**（不得静默回退到 archive）；`missingItems` 语义逐字未变
- [x] **AC7** 不空转 / 无缓存：0 `skip` / 0 `todo`；同一 root 两次调用一致（形态变化立即反映）；fixture root 不污染真实 root
- [x] **AC8** 回归：`bun test tests/` 全绿（913）；anchors 23/23；`config-guards:142` 的 `tests/role-exemptions.test.ts D5②（部分闭合）` 锚仍绿
- [x] **AC9** 证据包：**6** 条突变（M1–M6，含删项 / 零候选 / 脏并存）的三件套落 `.rddf/reviews/role-exemptions-guard-archive-resilience-mutations.md`

## Capabilities

- AC23 守卫**不再依赖「某 change 永不归档」**（今天的失败形态是**抛异常**，比判红更难诊断）。
- 与 D9 守卫**同一套读法**（归档韧性 + 载体缺失专用文案 + 判别力自证），且**不重构成 D9 的 `Texts`/`violations` 框架**（AC23 只有 3 路径 × 6 项，照搬是为对称而对称）。
- 顺手补上原先**隐含**的保证：三处必须是三个不同文件（R2）。

## Impact

| 面 | 影响 |
|---|---|
| 运行时 | **零影响**（只改测试） |
| 治理面 | **是**（AC23 判据载体）⇒ **oracle + critic 各 1 轮** |
| 体量 | 1 文件 + ≈ 60 行（解析器 + 三态文案 + fixture 用例）+ 证据包 |
| 顺序 | ⚠ **先落地本项，再归档 `role-aware-permissions`**（否则归档 commit 被 `bun test tests/` 卡红） |
| 风险 | ① 增量代码量（~60 行 vs 原 72 行文件）⇒ 已用「不重构框架」压住；② fixture 用 `os.tmpdir()`（与 D9 守卫同款；AGENTS.md 的 `/tmp/opencode` 约束管的是 agent 的 scratch，不是测试 fixture） |

## 不做什么（Out of Scope）

| # | 不做 | 理由 |
|---|---|---|
| ① | 抽公共解析器模块 | 跨 `.test.ts` import 实测不可用；`lib/**` 有新增文件闸门且语义不属运行时；当前只有 2 个消费者 |
| ② | 把 AC23 守卫重构成 D9 的 `Texts` / `faces()` / `violations()` 框架 | metis 指出的 AI slop：AC23 无需标题保真 / 负向词 / 并集唯一性 |
| ③ | **`stripNoise` 类假绿边界**（`<!-- -->` 或围栏里的 `D5③` 仍算命中） | 改它 = 改判据强度（D7 禁止）；登记为已知边界，威胁模型 = 故意手改 |
| ④ | 把「守卫不得硬编码未归档 change 路径」升级为**仓级闸门** | 属新需求；本次只做 grep 结论。**触发条件**：出现**第三个**守卫消费者时再立项 |
| ⑤ | `tests/role-identity.test.ts:4` 的注释引用 | 只是注释、非判据 |
| ⑥ | 预先实现「D5 扩项 ⇒ 并集 + 按面唯一性」 | 现在没有第二个消费者 |
| ⑦ | `export` 解析器 / 加「将来可复用」的接口 | 无真实消费者（跨 `.test.ts` import 不可用） |
