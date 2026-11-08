# ADR-front-knowledge-capability：front 获得知识获取能力（只读 subagent + 后端 session + 记忆层）

## 元数据

| 字段 | 值 |
|------|-----|
| Status | Proposed |
| Date | 2026-11-08 |
| Author | architect |
| Parent | 部分取代 `adr-front-agent-redesign.md`：D4 中「`subagent` 保持 `deny`」一条作废；D3 的「`scope` 必填」仅对 `kind=engineering` 继续有效；D6 的登记协议扩展 `kind` 字段，其余继续有效。D1 产物判据、D2 唯一工程通道、D5 preflight grants、D6 的锁与 upsert 协议、D7 guide 归宿继续有效 |
| 关联 change | `backlog: front-knowledge-capability`（立项后回填） |
| AC 映射 | 待 planner 立项后回填 AC 编号（本文件 Verification 第 1–11 条为候选判据） |
| 审稿报告 | `.rddf/reviews/adr-front-knowledge-capability-review.md` |

## 背景与问题

`front` 当前是**只读交互内核**：`edit`/`skill`/`subagent` 全 deny，一切工程行动经 `delegate` 转交工程 session（`adr-front-agent-redesign.md` D1–D7）。这套约束防住了三件事，且都是真实风险：

1. **触到有写能力的 agent**：`general` 有 `skill: allow`、`plan` 有三类 `edit: allow`；放开 subagent 而不分级 = front 直连写通道。
2. **深度 2 的间接写路径**：`experimental.subagent_depth: 2` + `librarian.subagent: allow` → front→librarian→general→写。
3. **唯一可审计突变通道被旁路**：brief 九字段、grants 预批、scope 强制、pair 登记只在 `delegate` 路径上成立。

但这套约束**同时关掉了 front 的知识获取能力**，与"面向用户的全能助手"定位冲突。用户提出的诉求是：front 应能理解项目知识与外部知识（需要 explore / librarian / oracle 这类能力），并能准确记住"调用了哪些工程 session、产出是什么"。

调研后发现三个决定性事实：

1. **"只读 subagent"是假象**（已核对配置）：explore / oracle / metis / critic / context-builder / general 的 `shell` 首条均为 `"*": "allow"`，仅 deny `rm`/`sudo`/`git commit` 那批；`bash -c`、`tee`、`> file` 重定向**均未拦截**。`edit: deny` 只封 `edit` 工具，不封 shell 写入。
2. **`delegate` 的 `agent` 参数没有任何白名单**（`lib/delegate-core.ts:222`，自由字符串，默认 `build`）→ front 现在就能建 `plan`/`general` session，`subagent: deny` 事实上被绕过。
3. **`scope` 派生的 `edit: allow` 会覆盖只读 agent 自己的 `edit: deny`**（session 规则排在 agent 规则之后、last-match-wins）→ `delegate(agent="explore", scope=["src"])` 会把 explore 变成可写 session。

结论：问题不是"front 该不该调 subagent"的二元选择，而是**放行哪些 agent、以什么粒度放行、放行前必须先修什么**。

**前置探针（已通过）**：v2.2.5 配置层接受 `subagent` 的逐 agent 对象形态，解析出 `explore/librarian/oracle/metis/critic` 各一条 `allow` 且 `"*": "deny"` 排最后；上游 `permission.evaluate` 以目标 agent ID 为 resource 做 last-match-wins。探针记录见 `.rddf/reviews/front-subagent-granularity-probe.md`。

## 决策

**一条主决策**：front 获得**知识获取**能力，但不获得**写 / 执行**能力。放行只读 subagent 与后端知识 session，同时补齐 `delegate` 的 agent 白名单与记忆层；放行以**先加固后端 agent** 为前置条件，顺序不可颠倒。

### D1 意图分类不变，扩「执行手段」

四分类的判据是**产物形态**，保持不变：

| 类别 | 产物 | 出口（本次变化） |
|---|---|---|
| 理解性 | 回答 | front 直读 **或** 召只读 subagent **或** 召后端知识 session（三者产物同为"回答"，不新增类别） |
| 实施性 | 文件变更 | `delegate`（唯一工程通道，不变） |
| 流程性 | 状态摘要 | front 读磁盘快照 + **ledger**（新增数据源），必带新鲜度标注 |
| 需裁决 | 决策输入 | `question` 问用户（不变） |

**禁止混类仍然成立**：若理解性执行过程中发现需要文件变更，必须**改判实施性**走 `delegate`，不得就地写。

明确**不新增**"知识性"类别：它会与"理解性"形成永远打架的灰区，且产物形态相同。

### D2 front 放行五个只读 subagent（逐 agent 门控）

```
"subagent": { "explore": "allow", "librarian": "allow", "oracle": "allow",
              "metis": "allow", "critic": "allow", "*": "deny" }
```

- **显式排除** `general`（`skill: allow`）、`plan`（`edit` allow + `subagent: allow`）、`build`（写 agent）。
- front 的 `edit: deny` 已覆盖 `write` 工具（权限解析层不存在 `write` action），文档中"`edit`/`write` 均 deny"的措辞与此一致，无需额外配置。
- 深度 2 链由 D3 的 `librarian.subagent: deny` 封死。

### D3 加固后端（同一 patch 内先落加固、再开放，原子生效）

五个被放行的 subagent 的 `shell` 改为三段式（`"*": "deny"` 打头 → 只读白名单 → 尾部守卫 deny）。**不是 front 清单的复制**：各 agent 的工作方式不同，必须**逐 agent diff**，按下表落地。放行（D2）与加固（D3）**必须在同一 patch 内完成，不存在"front 已放行、后端未加固"的中间态**。

| agent | 相对 front 白名单的增量 | 相对 front 白名单的**减项** | 说明 |
|---|---|---|---|
| explore | 无 | 无 | 现有动词风格与 front 兼容 |
| oracle | 无 | `git branch *`、`git reflog *`、`git describe *` | 可接受损失（与 front 同级收敛），prompt 中未依赖这些动词 |
| metis | 无 | `git branch *`、`git reflog *`、`git describe *` | 同上 |
| critic | 无 | 无 | 已有 `webfetch/websearch: deny`，保持 |
| librarian | `curl *`、`wget *`、`git clone *`、`git ls-remote *` | **不套 `* /*` 绝对路径守卫** | librarian 必须能访问绝对路径（clone 到 `/tmp`），故绝对路径禁令仅对 front 生效 |

**尾部守卫 deny（五个 agent 全量）**：

- 写落盘：`* > *`、`* >> *`、`tee *`、`sort * -o*`、`uniq * -o*`、`find * -exec*`、`find * -execdir*`、`find * -delete`、`find * -fprint*`、`find * -fprintf*`、`find * -fls*`、`git * --output*`、`git * --format*`、`git * --pretty*`
- 网络写落盘：`curl * -o*`、`curl * --output*`、`curl * -O*`、`wget * -O*`、`wget * --output-document*`、`wget * -P*`
- 网络外泄（读文件后上传）：`curl * -T *`、`curl * --upload-file *`、`curl * -d @*`、`curl * --data @*`、`curl * --data-binary @*`
- clone 目标收敛：`git clone * /*` deny → `git clone * /tmp/opencode/*` allow（后者压过前者；本机沙箱禁止通用 `/tmp`，只放行 `/tmp/opencode`）
- `.env` 读取族：`cat/head/tail *.env*`（沿用 front）

**明确接受的残留（写入「后果 / 风险」）**：

- 无目标参数的 `git clone URL` 会写入 CWD（项目目录），守卫无法可靠区分"有无目标参数" → 由 librarian prompt 约束（必须显式给 `/tmp/opencode/...` 目标）+ 接受为 prompt 层残余。
- 守卫是对命令文本做 glob，上游已知绕过（`--opt=` 截断、零节点跳过）在修复前持续存在；加固只把 subagent 拉到与 front 同级，不产生完备边界。
- `general` / `context-builder` **本次不加固**：front 不可达，只有 build/plan 能调（属 build 自身权限的延伸，不在 front 边界内）；列入后置清单。

同时：`librarian` 去掉 `subagent: allow`（封深度 2 链）。

**顺序铁律**：加固与放行必须在**同一个 patch**内完成，仓库中不允许存在"front 已放行、后端未加固"的中间态。加固会破坏现有 build/plan→subagent 流中依赖裸 shell 拼接的步骤，需同批回归（至少跑 librarian 的 `git ls-remote`、clone 到 `/tmp`、`curl` 三个现网用例）。

### D4 `delegate` 的 agent 白名单与只读语义

| # | 缺口 | 修法 |
|---|---|---|
| H1a | `agent` 无白名单 | 插件内建白名单：`build`（默认）+ D2 的五个只读名。其余**一律拒绝**，在 `validateBrief` 阶段抛错（建 session 之前）。 |
| H1b | **resume 绕过白名单** | resume 分支在 `lookupPair` 之后**额外校验 pair 条目的 `agent` 字段**是否在白名单内，不在则拒。白名单必须在校验函数内统一实现，create 与 resume 共用。 |
| H2 | scope 派生 `edit: allow` 覆盖只读 agent 的 `edit: deny` | 对只读 agent **恒注入单条** `{edit, *, deny}`，**绝不注入** `scopeEditRules` 派生规则。不接受"不注入 `scopeEditRules`"这种依赖 agent 配置恒为 deny 的弱实现。 |
| H2' | brief 契约冲突：`scope` 必填 vs 知识 session 无 scope | `kind=knowledge` 时 `scope` 改为**可选并忽略**（不参与权限组装）；`validateBrief` 的空 scope 拒绝只对 `kind=engineering` 生效。 |
| H2'' | grants 可把只读语义还原 | `kind=knowledge` 时 `grants` 必须为空数组；实现上拒绝任何 grants（含 `shell`）。`GRANT_FORBIDDEN` 已封 `edit`/`write`，本行封 shell 面。 |
| H3 | 非工程 session 污染角色矩阵 | 新增登记类型 `kind: "engineering" \| "knowledge"`；只有 `engineering` 写入 `role.json` 的 `sessions` 分区（`current_role` 合法值仅限 architect/planner/builder/verifier/general/no-role），`knowledge` 只登记 `pair.json`，不产生 `current_role`。kind 分支必须覆盖 `registerSession` 的**两个调用点**（prompt 前、wait 后）。 |

**如实声明的现状语义**：resume 路径本来就**重新计算但不应用** `permissions`（`scope`/`grants` 在 resume 上被忽略）。这是**设计**，不是缺口：续接的 session 权限在创建时已定型；本 ADR 只补 `agent` 白名单校验，不改这一行为。知识 session 允许 resume，但必须同时通过白名单与 `kind` 校验。

**不改变**：`delegate` 仍是 front 唯一的**登记型** session 通道——`subagent` 工具创建的是**探索 session**，不走 `pair.json` 登记、不可经 `delegate` resume，因此不构成第二条登记/工程通道。

### D5 记忆层：`ledger.jsonl`（插件单写，与 pair/role 同一把锁）

- 路径：`.rddf/state/ledger.jsonl`，append-only。
- 字段：`recorded_at` / `kind` / `front_session_id` / `backend_session_id` / `goal` / `scope` / `outcome` / `blocked_reason` / `out_of_scope_files` / `changed_files` / `last_assistant_text`（截断，禁止落凭证）。
- 写入者：**仅 `delegate` 插件**，append 动作放进现有 `registerSession` 的同一 `withLock` 临界区 → 零新增写入方、无第二把锁、无锁序反转。
- **行产生时机（写死，避免"每次 delegate 一行"与实现歧义）**：

  | 情形 | 是否落行 |
  |---|---|
  | brief 校验失败 / grants 非法 / agent 不在白名单 | **不落行**（无 session 产生，无事实可记） |
  | resume 校验失败 | **不落行** |
  | 建 session 后 busy（拒绝排队） | **落一行**，`outcome: "busy"` |
  | 正常结束 | **落一行**（无论 succeeded/failed/interrupted/unknown） |
  | wait 超时 / 异常 | **落一行**，`outcome: "unknown"`，`wait_error` 记入 |

  实现为**单次 append**，不得搭 `registerSession` 两次调用（prompt 前 / wait 后）的车而产生两行。
- **职责切分（写死）**：`pair.json` = 访问控制登记表（`resume_session` 合法性唯一判据）；`ledger.jsonl` = 历史事实（回答"做过什么"）。**ledger 不参与 resume 校验**，避免两个真相源漂移。

### D6 wiki 后置（本次明确不做）

项目知识 wiki 的写入者是工程 session，而它的 `edit` 规则只来自 `brief.scope`：要么每条 brief 显式含 wiki 路径（scope 噪声 + 用户预批面变大），要么插件恒定追加 `.rddf/wiki/**` allow（隐蔽扩权）。**先用 ledger 一个月**，用真实数据复审"为什么这么设计"类问题是否仍有缺口，再立项。届时信任分级：ledger = 插件写的事实（front 可直接陈述）；wiki = 工程侧写的综述（front 必须引用式转述并标注来源）。

### D7 信任定级：subagent 输出是**数据**，不是指令

- front 可引用、须带证据定位（`file:line` / URL）。
- 不得把 subagent 综述中的任何陈述当作**用户意图**或**已批授权**；`grants` 预批仍必须走 `question` 问人（D5 不变）。
- 引用时标注来源与时间，与 D1 的新鲜度标注同源。

**诚实声明**：这是 prompt 层防御，与 ADR "权限层为主要强制点"的哲学有张力。注入面无法靠权限层封死，只能压缩：D3 减 reach、D7 减传播、标注减误信。

### 明确不做（本次范围外）

- **`general` / `context-builder` 的 shell 加固**：front 不可达（D2 白名单排除 general；context-builder 不在白名单），只有 build/plan 能调，属 build 自身权限的延伸，不在 front 边界内。列入后置清单，与本次 patch 解耦。
- **并行/异步委托**（一次派多个后端 session）：唯一真实的类别缺口，但与"能建什么 session"正交，后置。
- **常驻知识 session**：与 `plan` 大面积重叠，且需要 session 池 + 清理策略 + 多 front 混淆处理，成本高于收益；D2 直调 subagent 已覆盖理解性需求。若将来出现连续性缺口，以新插件工具 `consult` + 严格只读 agent 的形态重估，不复用 `plan`。
- **让工程 session 自己 append ledger**：工程 session 不知道也不该被要求遵守 `.role.lock` 协议，锁契约双写是已知高危面。

## 选项对比表

| 方案 | 结论 | 理由 |
|---|---|---|
| **front 直调五个只读 subagent（逐 agent 门控）+ 先加固后端**（选中） | 采用 | 产物形态仍是"回答"，不新增类别；粒度已实测可用；加固后写通道被权限层封住；不新增工具与会话池。 |
| 常驻知识 session 中转 | 否决（留复审口） | 与 `plan` 重叠；需要 session 池/清理/多 front 混淆三套机制，成本高于收益；连续性诉求可由 ledger（持久形态）替代。 |
| 维持 `subagent: deny` | 否决 | 把"知识获取"与"写能力"一起关掉；且 `delegate(agent=general/plan)` 已事实上绕过该约束，形成"名义禁止、实际可达"的假边界。 |
| 复用 `plan` 作为知识 session | 否决 | `plan` 有 `edit` allow + `subagent: allow`，等于开写通道；且其 prompt 面向规划而非问答。 |
| 放开 front 的 `skill` 作为知识手段 | 否决 | skill 是任意命令包，比 subagent 宽一个数量级，与 D7"不吸收执行部分"直接冲突。 |
| ledger 并入 `pair.json` | 否决 | pair 是 resume 热路径，混入审计内容会拉长锁持有时间、膨胀登记表，并把 ACL 与事实历史耦成一个真相源。 |
| 在本层新增"知识性"意图类别 | 否决 | 产物形态与"理解性"相同，新增只会制造灰区与双重判据。 |

## 后果 / 代价

**正面**

- front 从"工程任务分派器"变为"知识获取 + 任务分派"复合助手，且写能力仍为零。
- 顺带修掉两个既存洞：`delegate` 的 agent 白名单、只读 agent 被 scope 反转为可写。
- 记忆层让"做过什么"可回答，且写入者唯一、与既有锁复用。
- 加固 subagent 本身是还债：这些 agent 原本在 build/plan 的调用链里也是未加固的写通道。

**负面 / 代价**

- 五个 subagent 失去 `bash -c` 便利，现有调用链中依赖裸 shell 拼接的步骤会断，需一轮回归 + 漂移检测。
- D2 之后 front 的上下文会被 subagent 综述污染（注入面），只能靠 D7 的信任定级压缩，无法根除。
- ledger 落盘 `last_assistant_text` 有凭证泄漏风险，需截断策略与轮换策略（轮换后置，截断必须本次做）。
- 知识 session 的登记语义新增一个 `kind` 字段，`pair.json` 的消费方（front 读 `pair.json` 报状态）需同步理解新字段。

**风险**

- 守卫 deny 仍是**尽力而为**：上游已知绕过（重定向、`--opt=` 截断、零节点跳过）在修复前持续存在；D3 的加固不改变这一点，只是把 subagent 拉到与 front 同级。
- **D3 明确接受的残留**：① 无目标参数的 `git clone URL` 会写入 CWD，守卫无法可靠区分有无目标参数，只能靠 librarian prompt 约束 + 显式声明；② `curl` 的内联数据外泄（如 `curl -d "$(cat .env)"`）无法用 glob 可靠拦截，只封了 `-d @file` / `-T` / `--upload-file` 三条文件形态；③ `wget URL` 默认下载到 CWD，靠 `-O`/`-P` 守卫覆盖显式目标，裸 `wget` 属同类残余。
- `scopeEditRules` 的"只读 agent 恒注入单条 `edit:* deny`"若实现成"空 scope 特判"，容易与"整仓 scope = `.`"分支混淆（后者产出 `[deny *, allow *]` 净放行）→ 必须有测试固定 `["."]` 分支。
- ledger 与 pair 的职责切分若在实现中失守（例如用 ledger 末行判断 resume），会造出"两份真相"的 bug；Verification 有对应判据。
- 逐 agent 门控依赖"目标 agent 名"这一字符串；agent 改名或新增同级别名 agent 时，白名单会静默失配（新增 agent 默认落 `"*": "deny"`，属安全侧失败，可接受）。
- **librarian 的绝对路径读取全面放开**（不套 front 的 `* /*` 守卫）：这是为 clone 到 `/tmp/opencode` 所需，但意味着 librarian 可读任意绝对路径；跨目录读仍受 `external_directory` 约束（`read`/`grep`/`glob`），shell 读不受约束——与 front 的 D4.1 已知结论同源。
- 放行 subagent 后，front 的上下文会被 subagent 综述污染（注入面），只能靠 D7 的信任定级压缩，无法根除。

## Verification（可勾选验收判据，前瞻）

- [ ] front 可调用 explore / librarian / oracle / metis / critic；调用 general / plan / build 被**权限层**拒绝（非模型拒绝）。
- [ ] **加固证据**：front 召 explore 时，explore 执行 `bash -c 'touch /tmp/x'`、`tee /tmp/y`、`sort a > b` 均被权限层拒。
- [ ] librarian 尝试深度 2 委派（调用 general 等）被拒。
- [ ] **网络写落盘守卫**：librarian 执行 `curl -o /tmp/x URL`、`wget -O /tmp/x URL`、`git clone URL /tmp/opencode/repo` 时分别按规则判定（前两条 deny，第三条 allow）；`git clone URL /etc/x` 被拒。
- [ ] `delegate(agent="general")` / `delegate(agent="plan")` 在建 session 前被插件拒绝（白名单）。
- [ ] **resume 白名单**：resume 一个 `pair.json` 已登记但 `agent` 不在白名单的 session 被拒（不只校验存在性与 `canonical_root`）。
- [ ] **knowledge session 的 grants 约束**：`kind="knowledge"` 且 `grants` 非空时被拒；`kind="knowledge"` 的 `scope` 为空时不报错且不被注入权限规则。
- [ ] `delegate(agent="explore", scope=["src"])` 后，该 session 对 `src/` 无 `edit` 权限（只读语义未被 scope 反转）。
- [ ] 知识 session 登记后，`role.json` 的 `sessions` 分区**不新增**条目、不产生非法 `current_role`；`pair.json` 有对应 `kind: "knowledge"` 条目。
- [ ] ledger 行产生时机符合 D5 表：校验失败/resume 失败**不落行**、busy 落一行、正常结束与超时各落一行；单次 delegate 不产生两行；字段齐全；`last_assistant_text` 已截断且不含凭证。
- [ ] ledger 写入与 pair/role 写入处于同一临界区：并发触发两次委托时 `role.json`/`pair.json`/`ledger.jsonl` 均无丢失。
- [ ] resume 合法性只由 `pair.json` 判定：删除 ledger 中某行不影响 resume；伪造 ledger 行不能让未登记 session 通过校验。
- [ ] front 引用 ledger 时出示 `recorded_at`；引用 subagent 综述时标注来源，且未把综述当作已批授权。
- [ ] 配置变更顺序：消防态检查——任一时刻不存在"front 已放行但后端未加固"的配置组合（同一 patch 落地）。
- [ ] 改配置后 `opencode reload`（或 `service restart`）生效，且 `opencode debug agents` 中 front 的 subagent 规则为五个 `allow` + 末尾 `"*": "deny"`。
