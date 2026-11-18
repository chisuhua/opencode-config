# role-exemptions-guard-archive-resilience —— planner 审查记录（metis 1 轮）

> 审查者：**metis**（`subagent`，只读）
> 轮次：**1 轮**（按 `prompts/build.md` §审查配对：新建 improvement / proposal ⇒ metis 1 轮）
> 输入：`.rddf/improvements/role-exemptions-guard-archive-resilience.md`（rev 0）+ 指定必读（`tests/role-exemptions.test.ts`、`tests/commit-gate-d9-registration.test.ts`、D9 的验收报告、`role-aware-permissions/proposal.md:113-123`）
> 产出：improvement **rev 1** + `openspec/changes/role-exemptions-guard-archive-resilience/proposal.md`（立项）

## 1. metis 的 finding 与逐条处置

### 1.1 隐藏意图

| # | finding | 处置 | 落点 |
|---|---|---|---|
| H1 | 真目标不是「修一个文件」，而是「**判据载体不得随 change 归档而消亡**」这条口径可复用 | ✅ 采纳：proposal 的 What Changes 写成**可判定规则**（三态），并在 Capabilities 写明「与 D9 守卫同一套读法」 | proposal §What Changes / §Capabilities |
| H2 | 用户不接受「顺序性启发式」⇒ 要**三态可分**（正常归档 / 脏并存 / 载体彻底缺失） | ✅ 采纳（rev 0 的「先活跃后归档」被**推翻**） | D1 + AC1 |
| H3 | 真正怕的是「**修脆了**」：改造把「三处各自命中」悄悄降级成「一处命中」而测试照样绿 | ✅ 采纳 | D2（身份互异性）+ AC3 |
| H4 | **归档时点与提交门互相卡死**：`verify_commands` 含 `bun test tests/` ⇒ 先归档会让那次 commit 被卡红 | ✅ 采纳（rev 0 把它写成「不会加成本」，是错的） | proposal §Why 顺序陷阱 + §Impact 顺序行 |

### 1.2 歧义

| # | finding | 处置 | 落点 |
|---|---|---|---|
| A1 | 「先活跃后归档」是**探查顺序不是判定规则**；与 D9 的「并集 + 唯一性判红」口径不一致 | ✅ 采纳：改为候选枚举 + 三态 | D1 |
| A2 | 「两形态」的 glob 边界未定（`*-role-aware-permissions-2`? 日期格式? `archive/` 不存在?） | ✅ 采纳：定为 `archive/*-<name>`（`endsWith("-" + name)`）+ `archive/` 不存在时按 0 候选处理（`existsSync` 兜） | D1 + AC1 |
| A3 | 「带指引的专用错误」有两种实现（抛自定义 Error vs 判红），判据不等价 | ✅ 采纳：**返回诊断对象 + 测试判红**（不抛） | D4 + AC4 |
| A4 | D4 的「或只用 fixture」让最弱实现过关 | ✅ 采纳：拆成两条（真实载体删项 + fixture 活跃缺项/archive 齐全） | D6 + AC6 |
| A5 | 「三处是三个不同文件」这层保证在改造后**消失**，而 AC4 只要求 `missingItems` 语义未变 | ✅ 采纳（这是本项最关键的隐藏降级） | D2 + AC3 |
| A6 | 「2 个消费者」的论证单位用错（指两个守卫文件，不是两个调用点） | ✅ 采纳措辞（Out of Scope ① 已改为「两个守卫文件」） | Out of Scope ① |
| A7 | 证据包命名是新造（`<name>-mutations.md`） | ✅ **planner 决定**：沿用 `<name>-mutations.md`（与刚归档的 `commit-gate-d9-three-place-registration` 同款；既有两份样例） | AC9 |

### 1.3 AI slop 风险

| # | finding | 处置 | 落点 |
|---|---|---|---|
| S1 | 照搬 D9 的 `Texts` / `faces()` / `violations()` 框架 ⇒ 72 行文件变 ~200 行 | ✅ 采纳：**不重构框架** | Out of Scope ② |
| S2 | 通用「openspec change 定位器」（扫全部 proposal 按标题找）⇒ 过度泛化，把「脏并存」退化成「出现 2 次」 | ✅ 采纳：AC23 的面是**名字绑定**的，只按名字定位 | D1 |
| S3 | 引入 `execSync("openspec list")` / `git mv` 判归档态 ⇒ 慢、易抖（本仓已有 5s 超时抖动先例） | ✅ 采纳：只用 `existsSync` / `readdirSync` | D1 |
| S4 | 为「将来可能有第三个消费者」预留接口 / 依赖注入 | ✅ 采纳：解析器**不 `export`** | D8 + Out of Scope ⑦ |
| S5 | AC 条数膨胀到 8–10 条 | ✅ 采纳：保持 **9** 条（含证据包与回归），新要求塞进现有判据句 | 验收标准 |

### 1.4 缺失的验收标准 → 已并入 AC1–AC9

| metis 建议 | 落点 |
|---|---|
| 载体身份 / 互异性（AC 面 ∈ `openspec/changes` 且 ≠ 另两处） | **AC3** |
| 脏并存的判定 | **AC1**（`ambiguous` 态） |
| 「文件在但标题被改名」态 | **AC5（b）** |
| 失败形态 = **判红**而非未捕获异常 | **AC4** |
| 真实仓库态（恰好 1 候选） | **AC2** |
| 残留断言可读性（label 加相对路径） | **AC5（c）** |
| 突变 ≥3 条（删项 / 零候选 / 脏并存） | **AC9** |

### 1.5 边界情况

| finding | 处置 | 落点 |
|---|---|---|
| `archive/` 不存在（浅克隆） | ✅ `existsSync` 兜 ⇒ 0 候选路径（fixture 覆盖） | AC1 |
| 多条 archive 命中（重复归档 / 尾缀近似） | ✅ `ambiguous` 态 | D1 + AC1 |
| 目录在、`proposal.md` 缺（归档中途失败） | ✅ 文案点名目录 | AC5（a） |
| 文件在、标题缺 | ✅ 文案点名文件 + 期望标题 | AC5（b） |
| **六项被注释掉仍命中**（纯 `includes`） | ✅ **登记为不做**（改它 = 改判据强度） | Out of Scope ③ |
| 临时目录清理（`mkdtemp` + `finally rmSync`） | ✅ 采纳 | D3 |
| `os.tmpdir()` vs `/tmp/opencode` 冲突 | ✅ **planner 决定**：测试 fixture 用 `os.tmpdir()`（D9 同款；AGENTS.md 的 `/tmp/opencode` 管的是 **agent 的 scratch**，不是测试 fixture） | Impact 风险 ② |
| 路径比较口径（相对化） | ✅ 采纳（断言用 `path.relative`） | AC2/AC3 |
| 归档与修复的**提交顺序** | ✅ 采纳 | §Impact 顺序 + §Why |

## 2. 我对 metis 建议的一处**修正**

| metis 建议 | 我的处理 | 理由 |
|---|---|---|
| 建议 6：真实态断言「恰好 1 个候选**且为活跃路径**」 | **修正为**：真实态断言「**恰好 1 个候选**且路径在 `openspec/changes` 下」；`kind = active` 只作为**验收报告里的实测记录**，**不写成断言** | 若写成断言，`role-aware-permissions` 一归档该断言**自己就红** ⇒ 修完当天就埋下同一颗炸弹（与 metis 自己的 H1/H4 逻辑冲突） |

## 3. 自捕（1 条）

| # | 问题 | 后果 | 修法 |
|---|---|---|---|
| B1 | rev 0 的草稿里把 9 条验收框误写成 `- [x]`（实施还没做） | 正是上一轮独立验收抓到的「宣称高于实现」同类病 | 立即改回 `- [ ]`，并在立项后保持未勾选直到实施完成 |

## 4. 预算

| 项 | 轮次 |
|---|---|
| metis（本记录） | **1 轮**（该 improvement 总计 1 轮） |
| oracle / critic | 待实施后：治理面（AC23 判据载体）⇒ 各 1 轮 |

## 5. 结论

- **improvement rev 1 已修订**（7 处：三态判定 / 身份互异 / 纯函数 / 判红不抛 / 三态文案 / 顺序陷阱 / 不重构框架）。
- **立项完成**：`openspec/changes/role-exemptions-guard-archive-resilience/`（`proposal.md` + `.openspec.yaml`）。
- **判据真源**：proposal 的 **AC1–AC9**。
- ⚠ **实施顺序是硬约束**：先落地本项，再归档 `role-aware-permissions`（否则归档 commit 被 `bun test tests/` 卡红）。
