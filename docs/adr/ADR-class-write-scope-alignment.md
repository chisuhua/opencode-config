# ADR-class-write-scope-alignment — 能力面写集与产品侧 skill / 审查配对的对齐

## 元数据

- Status: **Accepted**（2026-11-14，**用户签批「方向」**：D1–D3 的决策方向与 V1–V11 判据；
  **实施另立 change**（代码 + 父篇 D3 行落改 + 三处 prompt + 守卫，治理面 ⇒ 再一轮 oracle → critic））
- Date: 2026-11-14
- Author: architect（role:architect）
- Parent: **修订** `ADR-backend-handoff-role-class` 的 **D3 verifier 写集行**（该 D3 其余行、D4、D5 **不动**）
- 关联 change: `backlog: class-write-scope-alignment`（尚未立项；立项后回填 `openspec/changes/<name>/`）
- 关联 backlog: `rdd-verifier-state-consolidation`（产品侧：把散在 `.rddf/state/` 根的 verifier 点文件
  ——`.ac-verdict-*` / `.ac-verification.jsonl` / `.ac-verifier-blocked.jsonl` / `rdd-verify-context-*`——
  收拢进 `verifier/`；并清理 dangling 的 `.rddf/state/.verifier-report.json`：`SKILL.md:49` 声明它、
  但全 skills 目录无组件写它）
- AC 映射: 待立项后由 planner 补（Verification 的 V1–V7b 即 AC 前身）
- 审稿记录: `.rddf/reviews/adr-class-write-scope-alignment-review.md`（oracle 2 轮：BLOCK → PASS-WITH-NOTES；
  critic 2 轮：REJECT → **APPROVE** / `mergeable: yes`）
- 签批范围说明：本次签的是**方向**（D1–D3 + V1–V11）；**父篇 D3 表 verifier 行的实际落改与代码改动
  在实施 change 内同批完成**（本 ADR 的 D3 第 4 条 + V11 钉住）—— 父篇 D3 行当前描述的是**现行实现**，
  父篇 Status 行已记「正在按本 ADR 修订」指针

## 背景与问题

`ADR-backend-handoff-role-class` 把「一次派发只做一个角色类」落成了结构性写集（`lib/delegate-core.ts::classAllowRoots`）：

| `role_class` | 写集（**scope 上限**，不是授权 —— 见下） |
|---|---|
| `builder` | 简报 `scope` **减去架构文档目录**（返回 `[]` ⇒ scope 自身即边界） |
| `architect` | 架构文档目录 + `.rddf/reviews` + `.rddf/config/arch-docs.json` |
| `verifier` | **仅** `.rddf/reviews` |

⚠ **机制语义（本 ADR 必须写清，否则后面全错）**：`classAllowRoots` 只是 `assertRoleClassCompatible` 用的
**scope 上限校验**（`delegate-core.ts:786`）；**edit 权限只由 `scopeEditRules(scope)` 派生**
（`:884-906` / `classPermissions:891-894`）—— 类允许集**不会**并入侵限。所以「加进写集」的实义是
「该类的派发 **scope 现在可以包含它**」，**派发时仍须把该路径写进 `scope`**。

缺口有两个（都是「写集与别处契约不一致」，不是 D3 的划分本身错）：

**缺口 1（越类，产品侧 skill 无法履行 owns）**：`rdd-verifier` skill 的 `role.boundaries.owns` 是 **4 个路径**
（`~/.agents/skills/rdd-verifier/SKILL.md:28-32`）：

1. `.rddf/state/verifier/<name>.json`
2. `.rddf/state/verifier/<name>.audit.jsonl`
3. **`.rddf/state/.ac-verdict-*.json`**（躺在 `.rddf/state/` **根**下，不在 `verifier/` 子目录）
4. **`.rddf/state/.ac-verification.jsonl`**（同上）

另外 skill 还会 append `.rddf/state/.ac-verifier-blocked.jsonl`（`SKILL.md:415`）与 staged
`.rddf/state/rdd-verify-context-<change>.json`（`scripts/run_verification.sh:7-9`）—— **六个路径里四个**不在 `verifier/` 子目录内。
而 skill 的协议明确用 **Write 工具**写 verdict cache 与 audit（`SKILL.md:278,286`），不是 shell ⇒
`verifier` 类的写集（仅 `.rddf/reviews`）会让 Step 5 **直接吃 `Permission denied`**（按简报纪律只能 HANDOFF）。

**这些状态文件不是「无权威内容的记账」**（本次修正的关键定性）：`prompts/build.md:324` 明写
「结果以 `.rddf/state/.ac-verdict-<change>.json` 为准」；`SKILL.md:79` 说该缓存与 `archive_gate_check` 共享；
`SKILL.md:407/437` 说 halted 状态是归档门的输入；`rdd-doctor` 读 `.ac-verifier-blocked.jsonl`。
⇒ 它们是**机器消费的门槛输入**，只是**单用途 / gitignored / 单一 skill 写者**。

**缺口 2（口径，builder 的架构面审查产出无落点）**：`prompts/build.md` §审查配对 的 `builder`（架构面）行
产出去向写「`.rddf/reviews/` 或 change 的 notes」，而 `builder` 写集 = `scope` ⇒ 未把该路径写进 `scope`
的 builder **写不了自己的 findings**，只能塞响应正文。且 `scope` 覆盖度**零结构性约束**（只有 `plan_ref` 有
`validatePlanRef` 硬 Gate，`delegate-core.ts:958-984`）⇒ 派发方会系统性遗忘。

**共同形态**：写集是一份契约，skill 的 `owns` 与 §审查配对 的「产出去向」是另外两份 —— 三者未对齐，且无守卫。

## 决策

### D1 `verifier` 类的 scope 上限增加 `.rddf/state/verifier`（+ 过渡期显式规则 + 定性修正）

- **D1a 加子目录**：`classAllowRoots("verifier")` ⇒ `[".rddf/reviews", ".rddf/state/verifier"]`
  —— 覆盖 owns 的 1 / 2 两个文件。
- **D1b 三个根下点文件**（`.ac-verdict-*.json` / `.ac-verification.jsonl` / `.ac-verifier-blocked.jsonl`）
  + staged `rdd-verify-context-*`：**本 ADR 不做机制扩展**（`classAllowRoots` 是路径段前缀语义，
  `delegate-core.ts:811`，表达不了 `.ac-verdict-<change>.json` 这种 per-change 文件族），
  改记**产品侧 backlog** `rdd-verifier-state-consolidation`（skill 下版把这些文件收拢进 `.rddf/state/verifier/`，
  一个目录覆盖全部 skill 写入）。
  **过渡期规则（必须写明，不留灰色地带）**：verifier 类后端**只跑 rdd-verifier 的取证与判决部分**，
  判决结果落 `.rddf/reviews/<change>-verify.md`（verifier 类的产品落点）；**需要 `rdd-verifier` 状态机
  落盘（verdict cache / loop state / audit）时，由主会话代跑**（主会话不受 `role_class` 约束）。
  - **执行形态的前提（钉死，不留实施方各自发明）**：过渡期**不修改 `rdd-verifier` skill 本体**；
    截断点 = verifier 类后端在 skill 的 Step 5（写 verdict cache / loop state / audit）**之前停手**，
    把已取得的证据与判决写进响应正文（产品内容落 `.rddf/reviews/`），由**主会话**按 skill 协议补齐
    状态机写入。具体步骤序列留给实施 change 的 tasks（本 ADR 只锁「不改 skill 本体 + 截断点在响应正文」）。
  ⇒ **verifier 类不与产品侧状态机耦合**是过渡期的明确形态，不是「忘了处理」。
- **D1c 派发契约（缺了它就是假绿）**：`verifier` 类派发的 `scope` **必须同时包含**
  `.rddf/reviews` 与 `.rddf/state/verifier`（走 rdd-verifier 时）；`prompts/plan.md` 选类表 +
  `prompts/front.md` §3.1 明写。**只把目录加进上限、不写 scope ⇒ 实跑仍 deny。**
  - 为何过渡期仍强制包含（与 D2a「最小权限」的张力，须申明）：**为产品侧收拢目录后即开即用** ——
    否则收拢完成那天所有既有派发模板都要改一遍；且语义上它是「该类**可以**写」的声明，不构成义务
    （后端在过渡期不写它也不违规）。
- **D1d 边界（同时成立）**：
  1. **不加** `.rddf/state` 的其它路径（`pair.json` / `role.json` / `ledger.jsonl` / `sessions.json` /
     其它 skill 状态仍不在允许集内）；
  2. `.rddf/reviews/**` 是**产品**落点，`.rddf/state/verifier/**` 是**记账**落点，两者不得混用
     （记账文件不得冒充验收报告）；
  3. `shell` 不受类约束这一既有事实**不变**（越过 `shell` 写仍是越类，由主会话收回后 `git status` 复核）；
  4. 定性：这些状态文件是**机器消费的门槛输入**，接受它们进 verifier 写集的理由是
     *单用途 + gitignored + 单一 skill 写者*，**不是**「无权威内容」。

### D2 `builder` 的写集**不扩**；架构面审查产出升级为**派发硬规则**

- **D2a `classAllowRoots("builder")` 保持 `[]`**。理由：`.rddf/reviews` 是 architect / verifier 的产品面，
  无条件给 builder 会让「谁写的审查记录」在三类之间无法区分（**最小权限 + 按需声明**）。
- **D2b 派发硬规则**：产出 `.rddf/reviews/<change>-arch-review.md` 的 builder 任务，**派发时 `scope`
  必须包含该路径**；未包含 ⇒ findings **只落响应正文**（不落盘 ≠ 失败，是边界生效）。
  `prompts/plan.md` 选类表 builder 行 + `prompts/front.md` §3.1 明写（与 D1c 同一处）。
- **D2c findings 不会永久丢失**：`delegate` 的 `last_assistant_text` 是全量回传（`delegate-core.ts:2112`），
  `prompts/front.md` 要求原样转述 ⇒ 丢的只是**入库的跨会话可追溯性**，已由「响应正文是唯一必然存在的载体」
  这一既有先例（`prompts/build.md:483`）覆盖。

### D3 三份契约由守卫钉住（防再漂移）+ 收口 build.md 内部漂移

1. **单点常量 + 守卫**：把 rdd-verifier 的 `owns` 全量（**6 个路径**）建成导出常量（仿
   `PRIORITY_BLOCKED_FIELDS` 的单点清单范式，`delegate-core.ts:306-313`），守卫断言
   「`classAllowRoots("verifier")` ⊇ 常量里**属于子目录**的部分」，并显式列出**产品侧 backlog 的 4 项**
   （断言它们仍**不在**允许集内 —— 防「以为已经给了」）。
   - **为什么不改成「守卫直接读 `SKILL.md` 抽 `owns`」**（被否决的备选，理由必须记下）：skill 在
     `~/.agents/skills/**`（用户 home），**仓库 CI 的 `bun test` 不能依赖仓外路径** ⇒ 该守卫在 CI 上
     必然 SKIP，等于没有守卫。
   - **残留（显式承认）**：常量 ↔ `SKILL.md` 的同步仍是**人工**——产品侧给 `owns` 加第 7 个路径时本守卫
     不会红。该残留由 backlog `rdd-verifier-state-consolidation` 收拢目录时一并核对并写进其 AC；
     本 ADR 不假装它是自动的。
2. **负向不变量**：任何类的 allow root **不得等于或祖先于** `.rddf/state`（防将来图省事整目录开放）。
3. **build.md 内部漂移收口**：同一套状态文件在 `prompts/build.md` 有三处描述（`.ac-verdict-<change>.json`
   /「轮次记在 `.rddf/state/verifier/<change>.json`」/ owns 描述）⇒ 统一为「产品落点 `.rddf/reviews/` +
   记账落点 `.rddf/state/verifier/`（+ 产品侧 backlog 的根下点文件）」。
4. **父篇本体必须落改（缺了它就是「签批文档里留两份矛盾契约」）**：`ADR-backend-handoff-role-class.md`
   的 **D3 表 verifier 行**（`:50`）改为「`.rddf/reviews/**` + `.rddf/state/verifier/**`（过渡期规则见
   `ADR-class-write-scope-alignment` D1b）」，并在该 ADR 的 **Status 行后续修订记录**（`:7` 已有先例：
   「同日 D3 修订（用户选 J）」）追加本次修订指针。**子篇宣告 ≠ 父篇已改** —— 父篇是 Accepted，实施方
   会读它；只写子篇等于留旧契约在签批文档里冻结。
5. **守卫钉文本**：`prompts/plan.md` 选类表与 `prompts/front.md` §3.1 的 D1c / D2b 规则字样。

## 选项对比表

| 选项 | 做法 | 结论 | 理由 |
|---|---|---|---|
| **A（选中）** | verifier 上限 += `.rddf/state/verifier`；三个根下点文件记产品侧 backlog + 过渡期显式规则；builder 不扩、改派发硬规则 | ✅ 采用 | 两处各自最小；不引入新机制；缺口与例外都**写清**而不是假装没有 |
| B | 让 skill 改写 `.rddf/reviews/` 下的状态文件 | ❌ 否 | ① 该目录是**产品落点**，塞状态会让「评审产物」与「记账」同源、并可能被当验收证据读走 ② skill 的 `owns` 在产品仓（`~/.agents/skills/**`），本仓无权限面 |
| C | 主会话代写 `.rddf/state/verifier/*` | ❌ 否 | 破坏 skill 的 **single writer**：loop state 是**跨 session 存活**的重试计数器（`route_loop.sh` load→append→save），写者必须是跑轮次的那一个，否则 3 轮上限在两个写者之间必漂 |
| D | 给 `builder` 也无条件加 `.rddf/reviews` | ❌ 否 | 最小权限 + 按需声明：`.rddf/reviews` 是 architect / verifier 的产品面，无条件给 builder 会让「谁写的审查记录」在三类之间无法区分（**注**：这不是「builder 从不写审稿报告」—— 它写，只是要**经 scope 声明**） |
| E | 靠 `shell` 绕过（现状默认行为） | ❌ 否 | D3 明写「越类判据是**写目标**，不是用什么工具写」⇒ 靠绕过得逞等于规则失效 |
| F | 机制扩展：allow 集支持 per-change 文件族（glob / 精确文件清单） | ❌ 否（本 ADR） | 前缀语义表达不了 `.ac-verdict-<change>.json`；而 per-change 白名单会把派发 `scope` 与产品侧文件命名耦合（skill 改 schema ⇒ 派发被拒）⇒ 正确解法是**产品侧收拢目录**（backlog），不是把命名耦合写进权限面 |
| G | 允许 `.rddf/state` 整目录 + 对敏感文件加 deny | ❌ 否 | deny 列表是**开放**的（以后新增的 state 文件默认被允许）⇒ 与「最小权限」相反；且 deny 与 allow 混排后 `findLast` 语义更易错 |

## 后果 / 代价

**正面**

- `verifier` 类的**上限已覆盖** skill 的两个子目录状态文件（`<name>.json` / `<name>.audit.jsonl`）——
  过渡期实际落盘仍由**主会话代跑**（见 D1b），产品侧把根下点文件收拢进 `verifier/` 子目录后，
  verifier 类后端即可**直写**全部 skill 状态（一个目录覆盖）。
- 缺口 1 的**剩余部分**（4 个根下点文件）从「隐性越类」变成**显式 backlog + 过渡期规则**，可追踪。
- `builder` 的架构面 findings 有确定规则（scope 含则落盘、否则响应正文），不再是「看情况」。
- 三份契约由**守卫**钉住（含 skill `owns` ↔ 代码），加一条负向不变量（`.rddf/state` 不得整目录开放）。

**负面**

- `verifier` 的写集描述要改 3 处（`prompts/build.md` 运行身份表 / `prompts/plan.md` 选类表 / `prompts/front.md` §3.1）。
- **过渡期 verifier 类不能完整跑 `rdd-verifier` 状态机**（verdict cache / loop state / audit 需主会话代跑）⇒ 这是
  **显式的功能缺口**，换来的是「不把 per-change 文件族写进权限面」的边界清晰。产品侧收拢目录后关闭。
- `builder` findings 未写进 scope 时只在响应正文（跨会话可追溯性略降）。

**风险**

| 风险 | 缓解 |
|---|---|
| 「加进上限」被误读为「已授权」 | D1c 显式写「scope 仍须包含」+ 守卫断言文本 + V4 带 scope 前提 |
| 过渡期规则被忽略，verifier 后端撞 `Permission denied` 后误判为故障 | D1b 明写「过渡期只跑取证与判决，状态机由主会话代跑」；`prompts/build.md` 的 verifier 段同步 |
| `.rddf/state` 将来被整目录开放 | D3-2 负向不变量（allow root 不得等于或祖先于 `.rddf/state`） |
| 三个根下点文件被当成「已解决」 | D3-1 断言它们**仍不在**允许集内（显式列出） |

**回滚**：`classAllowRoots("verifier")` 去掉 `.rddf/state/verifier`（单点）+ 三处 prompt 文本回退；
`builder` 侧只回退文档口径；产品侧 backlog 独立。

## Verification（可勾选验收判据）

- [ ] V1 `classAllowRoots("verifier", root)` 的**集合**等于 `[".rddf/reviews", ".rddf/state/verifier"]`（顺序无关）
- [ ] V2 `classAllowRoots("builder")` 仍 `[]`；`classAllowRoots("architect")` **不含** `.rddf/state/verifier`
- [ ] V3 `assertRoleClassCompatible({verifier, scope:[".rddf/state/verifier/x.json"]})` **放行**；
      `scope:[".rddf/state/pair.json"]` **仍拒**（只开子目录，不加根）
- [ ] V4 **权限净效果（带 scope 前提）**：verifier 派发 `scope` **含** `.rddf/state/verifier` ⇒
      该路径 `edit` 为 `allow`；**scope 不含** ⇒ `deny`（证明「上限 ≠ 授权」这一语义被正确表达）
- [ ] V5 负向不变量：任何 `classAllowRoots(cls)` 的结果都**不含**等于或祖先于 `.rddf/state` 的条目
- [ ] V6 产品侧 backlog 项**仍不在**允许集内（`.ac-verdict-*` / `.ac-verification.jsonl` /
      `.ac-verifier-blocked.jsonl` / `rdd-verify-context-*`），且 ADR / 守卫**显式列出**它们
- [ ] V7 文本三处一致：`prompts/build.md` 运行身份表 + `prompts/plan.md` 选类表含 `.rddf/state/verifier`
      与「scope 必须包含」；`prompts/front.md` §3.1 含同语义描述（该文件无写集表）
- [ ] V7b `prompts/build.md` §verifier 产出契约 含**过渡期规则**（verifier 类只跑取证与判决；
      状态机落盘由主会话代跑；产品侧收拢后后端直写）
- [ ] V8 `prompts/build.md` §审查配对 `builder`（架构面）行含「scope 必须包含」+「未包含时只落响应正文」
- [ ] V9 回归：`bun test tests/` 全绿；`scripts/check-upstream-anchors.sh` 无 FAIL
- [ ] V10 治理面审查：本 ADR 走 **oracle → critic** 各 1 轮（顺序不可颠倒），BLOCKER 全闭后方可实施
- [ ] V11 **父篇已落改**：`ADR-backend-handoff-role-class.md` 的 D3 verifier 行含 `.rddf/state/verifier`
      + 过渡期规则指针；其 Status 行后续有本次修订记录（日期 + 「D3 verifier 写集修订」）
