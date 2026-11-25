# 审稿报告：上游语义锚点 P5 假红事故（ADR-plan-multi-session-collaboration 前置事实 ⑤ 的引用订正）

> 对象：`scripts/check-upstream-anchors.sh`（P5 锚点模式 + 新增 P5b + 注释口径）+ `docs/adr/ADR-plan-multi-session-collaboration.md`（前置事实行的 upstream 引用订正 / V15 行改写 / 实施记录新增事故段）
> 日期：2026-11-25｜作者：architect（主会话）｜审查者：oracle → critic（只读）
> 审查域：**治理面**（脚本 = 本仓唯一真实闸门之一 + ADR 引用；ADR 本体按本仓特例裁定属 ADR 行）

## 1. 事故与核实

**现象**：`bash scripts/check-upstream-anchors.sh` → `RESULT: DRIFT（1/29 个锚点不成立）` ⇒ 该脚本是 `.rddf/commit-gate.json` 的 `verify_commands` 之一 ⇒ **全仓进入「不可提交」状态**（与 2026-11-23 的 AC10④ 事故同型）。
**失败锚点**：`P5 子会话权限取 agent 自身配置` —— 模式 `merge\(agent\?\.permissions` 未命中。

**逐行核实（不是猜）**：

| 事实 | 核实结论 |
|---|---|
| 上游 `packages/core/src/permission.ts` | 权限解析已从 `merge(agent?.permissions, session?.permissions)` 重构为 `PermissionPolicy.fromRules(agent?.permissions ?? missingAgentPermissions, session.permissions ?? [])` ⇒ **agent 级配置 + session 级覆盖**的合并语义**不变**（函数名与行号变了，语义没变） |
| 上游 `packages/core/src/tool/plugin/subagent.ts` | 建会话调用为 `sessions.create({ parentID, title, agent: agent.id, model })` ⇒ **仍不传 permissions** ⇒ 子会话实际拿 agent 配置 ⇒ ADR「权限是 agent 级静态、不是每会话级」**前提仍成立** |
| 该文件里的 `selected.permissions` | 是**调用方**的权限（用于算「调用方能否拉起该 agent」= ADR 前置事实 ① 的语义），**不是**按会话下发 ⇒ 不构成对前提的推翻 |

⇒ 判定为**锚点形态过时（假红）**，不是语义漂移（真红）。脚本自身的要求也正是「重新核对 ADR 的技术前提，**勿只改行号**」。

**修法**：P5 改钉**语义 token**（`agent?.permissions`）+ 新增 **P5b**（`agent: agent\.id,` —— 建会话绑定 agent id ⇒ 权限随之取 agent 配置）⇒ 锚点基线 **29 → 30**，实测 30/30 全绿、exit 0。ADR 侧把前置事实里的 upstream **行号引用全部去掉**（改「文件 + 语义形状」）⇒ 与「锚点只写语义、不写行号」对齐。

## 2. oracle（治理面审查）

判定：**PASS-WITH-NOTES**（`治理面判定:` 行）。核心判断：旧模式钉住的是**上游内部组合子的函数名**，而函数名与行号同属「易变指针」—— 脚本头部自述「只校验语义」，但 `merge(` 被当成了语义，实际它是偶然词汇。

### finding 与处置（逐条）

| # | finding（oracle） | 处置 |
|---|---|---|
| F1 | **P5b 模式不唯一命中建会话调用**：`agent: agent\.id` 在上游命中**两处**（`:178` `sessions.create` 与 `:162` `sessions.switchAgent` 的 resume 换 agent 路径）⇒ 若上游把 create 的 agent 绑定改没而 switchAgent 保留，P5b 仍绿 ⇒ **假阴性** | **已改**：模式加尾逗号 → `agent: agent\.id,` ⇒ 实测只命中 `:178`（`:162` 为 `agent: agent.id })` 无尾逗号）⇒ 消歧成立 |
| F2 | **P5b 的 why-string「建会话不传 per-session permissions」越声称**：正向 grep 结构上无法断言「缺席」⇒ 上游若给 create 增加 `permissions` 入参，P5/P5b 全绿而残留 #1 的前提**静默反转** | **已改**：P5b 的 why-string 改为「只钉『建会话绑定 agent id』；⚠『不传 per-session permissions』**无法正向断言** ⇒ 上游若新增 permissions 下发入参，本锚点**不报警** ⇒ ADR 残留 #1 的前提需人工重估」；ADR 的 V15 行同步登记为「两处已知不可锚」 |
| F3 | **P5 token-only 的判别力依赖「token 单点出现」**：已核实 `agent?.permissions` 在 `permission.ts` 仅 `:194` 一处 ⇒ 今日成立；上游引入第二处即无声失效（旧模式至少钉住「作为解析调用首参」） | **决定：不升级为 `agent\?\.permissions \?\?`**（该模式要求 `??` 与 token 同行相邻 ⇒ 上游一次 prettier 重排即假红，当前该行仅 9 字符余量 ⇒ **假红阻断提交的风险高于漏检风险**）⇒ 改为**在脚本注释与 ADR V15 双处如实登记单点前提**（含「上游引入第二处即无声失效 ⇒ 人工复核」） |
| F4 | **V15 枚举行失准**：「前置事实 ①–⑦ 各有一条锚点」与实际清单不符（⑥ 是本仓语义、**无上游锚点**；⑤ 现在有两条） | **已改**：V15 改为「①②③④⑤⑦ 各有锚点（**⑤ 两条**：权限解析处咨询 agent 配置 + 建会话绑定 `agent: agent.id`；**⑥ 是本仓语义**（delegate 单槽）无上游锚点，由 `tests/delegate-core.test.ts` 覆盖）」+ 锚点基线 29 → 30 |
| F5 | **脚本 P 族注释 off-by-one**：`check-upstream-anchors.sh` 的 P 族注释写「前置事实 ①–⑥」，ADR ⑪ 与 V15 均写 ①–⑦ | **已改**：P 族注释改为 ①–⑦ |
| F6 | **补 CHANGELOG 条目**：同型事故（AC10④）有 CHANGELOG v2.69 条目，而 ADR 元数据自述「版本史见 CHANGELOG」⇒ 只记 ADR 会让该口径出现反例 | **已改**（待 critic 闭合后落 `docs/CHANGELOG.md` v2.73，与 ADR 段互指） |

### oracle 排除的替代方案（记录，防后人重提）

- **恢复旧模式 / 改钉 `fromRules\(agent\?\.permissions`**：重新钉住函数名 ⇒ 与本次事故同型。
- **强制上单行组合模式（`?? .*session\.permissions`）作默认**：判别力最强，但把 prettier 重排变成新假红源 ⇒ 作可选升级，不作默认。
- **在 ADR 前置事实 / V15 里显式写锚点 ID（P1–P6）**：把 ADR 耦合到脚本内部编号 ⇒ 锚点重编号时 ADR 静默过期（漂移病上移一层）⇒ 维持现有耦合方向（ADR 枚举语义项 + 脚本注释回指 ADR 事实编号）。
- **把事故记录移出 ADR（只放 CHANGELOG / 审稿报告）**：实施记录的自述禁令针对「逐条实测数据」；该段是**前提相关**的「为什么」记录（后来者问「⑤ 为什么没有行号、P5b 为什么存在」需要原地答案）⇒ 保留在 ADR，CHANGELOG 是**追加**不是替代。
- **为「不存在 permissions 键」新增负向断言语法**：超出本次范围（不改 `check` 匹配机制）⇒ 以 F2 登记替代。

### oracle 的附带建议（未做，登记）

「锚点 = 钉**前提面**、不钉**偶然词汇**（函数名 / 行号）」应成为下一批锚点的撰写口径（`docs/guard-authoring.md` **现无锚点专章**，需新开一节「指针型判据必漂移」—— 该文已有 §4「五个实测陷阱」与 §3「三条配套纪律」，新节宜挂在 §4 之后）。**本轮已把该口径写进脚本头部注释 + P 族注释**（就近可读 ⇒ 影响所有写新锚点的人），`docs/guard-authoring.md` 的正式补写留待后续批。

## 3. critic 合审

判定：**APPROVE_WITH_CONDITIONS**｜`治理面判定: PASS-WITH-NOTES`｜`mergeable: yes`｜`scope_exceeded: false`｜**无 BLOCKER**。

critic 的核心判断：**判别力没有被放松成假红豁免** —— 关键论据是「旧模式 `merge\(agent\?\.permissions` 对最危险的方向（上游给 subagent 工具新增 per-session permissions 下发通道）**同样不报警**（它钉的从来不是『不传 permissions』这个缺席性质）⇒ 本次把『函数名依赖』换成『token + 已核实单点前提 + 如实登记』，**丢失的判别力为零**，消除的假红面是实的」。三条 intent 前提均在上游实码核实为真（`permission.ts` 单点出现 ✓ / create 不传 permissions ✓ / `selected.permissions` 是调用方权限 ✓ / 工具 Input schema 无 permissions 参数 ✓）。

### finding 与处置（逐条）

| # | finding（critic） | 处置 |
|---|---|---|
| S1 | **ADR 前置事实 ⑪ 与风险行的枚举口径未与改后的 V15 同步**（⑥ 是本仓语义、无上游锚点 ⇒ 同一文档对「⑥ 锚在哪」给出两个答案） | **已改**：⑪ 改为「**①②③④⑤⑦ 这六条上游语义**…；**⑥ 是本仓语义**（delegate 单槽）⇒ **无上游锚点**，由 `tests/delegate-core.test.ts` 覆盖」；风险行同步改为「事实 **①②③④⑤⑦**」 |
| S2 | **ADR D4 正文残留一处 upstream 行号引用且已实测漂移**（`upstream subagent.ts:144-151` 的运行期 assert；实际在上游 `:251`）—— 与本次事故同型证据 | **已改**：D4 第 1 条去行号、改语义形状（「断言点在 upstream 的 `Permission.evaluate(name, agent.id, selected.permissions)` 处」）；`opencode.jsonc.opencode-go:102` 的行号一并去掉。**全篇 upstream 行号引用复查 = 0** |
| S3 | **P5b 的逗号消歧未做判别力前提登记（与 P5 不对称）** —— 判别力全押在尾逗号上；上游翻转逗号风格 ⇒ 假红或失锚 | **已改**：脚本补登记「**判别力全押在尾逗号**上（create 带逗号 / switchAgent 无逗号）⇒ 上游若翻转风格 ⇒ **失锚或假红** ⇒ 须人工复核（与 P5 单点前提同款登记）」 |
| S4 | **脚本撰写口径的作用域未标注**（A 族锚点大量钉函数名/类型名 ⇒ 表面矛盾） | **已改**：P 族注释补「⚠ **作用域**：本口径自 **P 族**起适用；**A 族历史锚点仍钉名称** ⇒ 漂移时再逐个语义化，**不在本次范围内**」 |
| N1 | 前置事实 ⑤ 的形状里写了函数名 ⇒ 加「当前形状」消歧 | **已改**：⑤ 补「**2026-11-25 核实的当前形状；函数名会变、语义不变** ⇒ 锚点改钉 token，见 V15」 |
| N2 | ⑪ 与实施记录以「P5」称呼锚点（重编号后会歧义） | **不改**：oracle 已排除「ADR 写 P1–P6 编号」的耦合方向（会把 ADR 耦合到脚本内部编号 ⇒ 漂移病上移一层）；事故叙述用锚点编号作**历史事件名**可接受，仅记录 |
| N3 | P5b why-field「grep 不能断言缺席」措辞略宽 | **已改**：改为「**无法正向断言**（**本脚本的 check helper 只支持正向 grep**）」 |
| N4 | P 族注释「前置事实 ①–⑦」精确应为「①–⑤、⑦」 | **已改**：P 族注释标题改为「①–⑤、⑦」+ 补一行「⚠ ⑥（delegate 单槽）是本仓语义 ⇒ 本脚本无其锚点，由 `tests/delegate-core.test.ts` 覆盖」 |

### 3.1 复审（第 2 轮，只验落笔）

结论：**S1–S4 全部「已闭合」**；N1 / N3 / N4 落笔无新问题；N2 的「不改」判定为**可接受**；`治理面判定: PASS`｜`mergeable: yes`｜`scope_exceeded: false`；本轮未发现新 BLOCKER / SHOULD_FIX / NITS。

复审核验摘录：S1 —— ⑪ 与风险行的枚举计数正确（①②③④⑤⑦ = 六条）且与 V15 一致，「同一文档对『⑥ 锚在哪』现只剩一个答案」；S2 —— D4 已去行号改语义形状，前置事实 ①–⑤⑧⑨⑩ 的 upstream 行号同步清除，**实测 `grep 'upstream[^)]*:[0-9]'` = 0**（另注：ADR 内残留的 4 处行号均为**本仓文件**引用，受 `bun test` 闸门保护、漂移可机判 ⇒ 不在 S2 的 upstream 射程内）；S3 —— P5b 判别力前提登记与 P5 的单点前提登记**对称**；S4 —— P/A 两族的表面矛盾消解。N2 —— 「P5」在 ⑪ 与实施记录中均出现于**历史事故叙述**语境，是历史事件名而非活引用 ⇒ 不改成立。

**收口结论**：双审闭合 ⇒ 版本史落 `docs/CHANGELOG.md` v2.73（ADR 段与 CHANGELOG 段互指）；配套 backlog 两条（见 §3.2）。

## 4. 收口自检

### 3.2 backlog（本轮不做）

- **把 P5 的「单点出现」前提从「如实登记」升级为「机判 loud fail」**：给 `check` helper 加计数模式（`grep -c == 1`）⇒ 上游引入第二处 `agent?.permissions` 即响亮失败，而不是等人复核。改动量最小、收益最大 ⇒ 下一批做。
- **`docs/guard-authoring.md` 新开一节「指针型判据必漂移」**：把「锚点钉前提面、不钉偶然词汇（函数名 / 行号 / 标点）」写成通用撰写口径（该文现无锚点专章，§3 三条纪律 / §4 五个陷阱之后最合适）。本轮已把口径写进脚本头部 + P 族注释（就近可读）。

## 4. 收口自检

| 项 | 结果 |
|---|---|
| 锚点 | **30/30 全绿**，exit 0；`git grep` 复核 P5b 只命中上游 `:178` 一处 |
| ADR 一致性 | 前置事实的 upstream 引用改为「文件 + 语义形状」（无行号）⇒ 与 V15 / 脚本注释口径一致；实施记录新增事故段（前提相关的「为什么」） |
| 未越界 | 未触碰 `lib/**` / `plugins/**`；未改 `check` 的匹配机制、退出码、其他锚点；未新增豁免机制 |
| 闸门 | `bun test tests/` = 1205 pass / 1 skip / 1 fail（唯一 fail 与本改动无关：`model-fallback` 把 `plan`/`front` 模型改写为 `minimax-cn-openai` 而 `docs/MULTI-AGENT-DESIGN.md` 仍写 `minimax-cn`）；`check-upstream-anchors.sh` = 30/30、exit 0 ⇒ **提交门的两条 verify_commands 中第二条恢复全绿**（第一条仍受上述预存漂移影响） |
| 残留 | 「上游若新增 per-session permissions 下发通道 ⇒ 锚点不报警」已登记在脚本 why-string 与 ADR V15（人工重估触发条件） |
