# Improvement: front-agent-redesign（front agent 重设计实施路径）

| 字段 | 值 |
|---|---|
| 状态 | draft（v2，已并入 metis gap 分析 + 两项用户决策） |
| 创建 | 2026-11-05 |
| 关联 ADR | `.rddf/state/adr-front-agent-redesign.md`（Status: Proposed，oracle + critic 双审通过，0 BLOCKER） |
| 关联审稿 | `.rddf/reviews/adr-front-agent-redesign-review.md` |
| 实施计划落点 | `.rddf/plans/front-agent-redesign.md`（builder 阶段生成） |
| 验收报告落点 | `.rddf/reviews/front-agent-redesign-acceptance.md`（Stage 6 产出） |
| 用户决策 | 2026-11-05：① Stage 1 功能空窗**接受**（Stage 1+2 同会话连续做）；② `external_directory` 只放行 `/workspace/**` + `~/.config/opencode/**` |

> 本仓库（`~/.config/opencode`）**没有 openspec**，也没有 `openspec/changes/` 流程。因此本 improvement 即 change 工件：ADR 提供决策，本文提供实施路径与验收，builder 据此生成 TDD plan 并执行。

## Why

`front` agent 名义上是"只对话、不改代码"的用户代理，但**实现与职责不符**，且委托链路是自研 HTTP 协议：

1. **权限层没有拦住任何东西**。`agent.front.permission.shell` 78 条规则首条为 `"*": "allow"`，其后仅 30 条 deny。last-match-wins 下，`bash -c`、`python3 -c`、`curl`、`mv`、`cp`、`tee`、`dd`、`chmod`、`make`、`cmake` 全部实际可执行。"不改代码"只是 prompt 里的承诺，无法验证、无法强制。
2. **委托实现有三个已知缺陷**：`scripts/delegate.sh` 每次 `start` 新建 session（无续接）、`cmd_wait` 用 `.data.outcome` 判空闲（该字段语义是"最后一次已结束 run 的结果"，会把还在跑的 run 报成成功）、`pair.json` 只读不写（pair 登记形同虚设）。
3. **`captoken.sh` 的 capability token 已失去对象**：它的存在前提是"front 直连 HTTP 只能带受限 token"；改为插件工具后 front 不持任何凭证、不发任何 HTTP。
4. **front 对工程目录 `external_directory: "ask"`**，每次读工程代码都要用户确认（用户已要求改 allow）。
5. **交互范式散在 `guide` skill**：状态扫描与菜单式意图路由本应是 front 的能力。

代价是直接的：一个声称"不改代码"的 agent 实际上能 `bash -c 'rm -rf …'`，也能把工程内容 `curl` 出去。

**目标形态（两个主角，不可只做其一）**：front 是**常驻的项目经理前台**——开场自己扫状态给菜单、说"改个东西"就自动组 brief + 预批权限 + 委托 + 拿回带归因的结果；同时它**在权限层真的碰不到代码**。下文 Stage 1 做后者，Stage 4 做前者，两者都有验收判据。

## What Changes

7 个阶段（Stage 0–6）。**Stage 顺序 = 依赖顺序**：Stage 0 的探针结论会改变 Stage 1/2 的实现形态，故排最前；Stage 1 不依赖新代码即消除现有权限漏洞。

### 全局前置说明（两条硬约束，先写死）

**G1 — 权威 only-read 清单**（Stage 1 使用，唯一来源，勿按 ADR D4 字面裁剪）：

```
rg  grep  ls  cat  head  tail  wc  sort  uniq  diff  file  stat  tree
du  df  which  basename  dirname  readlink  realpath  tr  cut  printf
date  test  expr  seq  nl  column  find
git log  git show  git diff  git status  git blame  git ls-files
git rev-parse  git ls-tree  git cat-file  git show-ref  git shortlog
git count-objects  git verify-commit  git config --get  git remote -v
git stash list  git worktree list
```

相对 ADR D4 字面清单**补入**：`find`、`du`、`df`、`which`、`readlink`、`tr`、`cut`、`printf`、`date`、`test`、`expr`、`seq`、`nl`、`column`、`git config --get`、`git remote -v`、`git stash list`、`git worktree list`（现行配置已在用，且均为只读）。**必须配套的守卫 deny**（否则这些命令可写文件）：`* > *`、`* >> *`、`find * -exec*`、`find * -execdir*`、`find * -delete`、`find * -fprint*`、`find * -fprintf*`、`sort * -o*`、`tee *`、`git * --output*`、`git * --format=*`（`--format` 后参数对 scanner 不可见）。

**G2 — 判据从属关系**：ADR 的 16 条 Verification 是**终验权威**；本文 AC1–AC17 是 **builder 阶段过程门禁**。两者冲突时以 ADR 为准，且 Stage 5 必须产出双向映射表（每条 ADR Verification → 对应 AC 编号，或标"仅 ADR 终验"）。不允许出现同一件事两处判据措辞不一致而没人裁决。

### Stage 0 — 前置探针（blocking）

| # | 探针 | 若结论不同则影响 |
|---|---|---|
| 0.1 | `session.update` 能否改已建 session 的 `permissions` | 可写 → D5 救援从"新 session 全量重跑"降级为"原地补 grant"，`acceptance` 重入约束可放宽 |
| 0.2 | 工程 session 被 deny 后，`context` 消息 part 中 permission-denied 标记的**确切结构** | 拿不到结构 → `blocked_reason` 不可提取，D5 救援退化为只报 `outcome`，AC8 需启用降级版判据 |
| 0.3 | 守卫用例真实拦截率：`sort a > b` / `git log --output=f` / `git log --format=x > f` / `find . -fprint f` / 裸 `> f` | 拦截率 <100% → 守卫清单 diff 必须显式列出并把差集写进 ADR 已知残留 |
| 0.4 | `external_directory` **按路径对象语法**（`{"*": "deny", "/workspace/**": "allow"}`）在 v2.2.5 是否可用 | 不可用 → Stage 1 退化为全局 `allow`，须回到 ADR 重新取舍（这是 ADR 未实测的一项，必须在改配置前验） |

**完成判据**：`.rddf/reviews/front-agent-redesign-p0-probes.md` 落盘，含每项结论 + 原始返回摘录；结论回填 ADR「遗留待验证」段；0.3 的拦截率与 0.4 的语法结论**明确写出对 Stage 1/2 的处置**（不改就不许进 Stage 1）。

### Stage 1 — 配置面（分 1a / 1b，中间有用户确认点）

**1a 先验后半改**：先跑 0.3 + 0.4（属 Stage 0，此处只消费结论）。

**1b 改 `opencode.jsonc.opencode-go`**（`opencode.jsonc` 是指向它的符号链接，front 权限块起于 :207）：

1. `agent.front.permission.shell` 三段式：`"*": "deny"` 打头 → G1 清单逐条 allow → **尾部守卫 deny**（G1 所列）。
2. `agent.front.permission.external_directory` 由 `"ask"` 改为路径对象形式，**枚举具体路径**（不写 `"*": "allow"`），范围已由用户 2026-11-05 拍板为**仅两条**：
   - `/workspace/**`（工程根，覆盖 `/workspace/main/*` 与 `/workspace/project/*`）
   - `/home/ubuntu/.config/opencode/**`（治理面自身）
   
   显式**不放行** `/tmp/opencode/**` 与 `~/.local/share/opencode/**`（用户决定）→ front 读这两处会触发询问，属预期行为，不得为图方便追加。
3. 顶层 `permission.delegate = "deny"` + `agent.front.permission.delegate = "allow"`（插件未就绪时 front 拿到 allow 也无工具，无副作用）。

**⚠️ 本阶段的功能代价（已决策）**：1b 落地后，front 现状的委托通道（`shell` 调 `scripts/delegate.sh` + `curl`）**立刻归零**，直到 Stage 2 完成。**用户 2026-11-05 决定采用 (a)**：

- **(a) 接受空窗（已采纳）**：Stage 1 与 Stage 2 在**同一 builder 会话内连续完成**，空窗期不跨天；现行 `delegate.sh` 本就有三个缺陷（无续接 / `wait` 判据错 / `pair` 只读），保留它无实际价值。空窗期能力边界：front 只能做理解性问答与状态摘要，不能委托——须写进风险表并在 Stage 1 完成时向用户复述一次。
- **(b) 过渡 allow（已否决）**：留 `bash /home/ubuntu/.config/opencode/scripts/delegate.sh *` 单条 allow 到 Stage 5。否决理由：使"front 只有 `delegate` 一个出口"的目标到 Stage 5 才成立，且需在 Stage 5 记得删除，属自造遗忘点。

**完成判据**：AC1–AC4 通过 + 回滚演练一条（恢复 `opencode.jsonc.bak-*` 后 `opencode debug agents` 的 front 权限指纹与改前一致）+ 正面能力回归（front 仅用 G1 清单命令完成一次"X 函数在哪 / 最近改了什么"回答，全程零权限询问）。

### Stage 2 — `delegate` 插件

新建 `plugins/delegate.ts`（目录已存在、当前为空），按 ADR D2/D3/D5 实现：

1. 骨架 + 工具注册（`Plugin.define` + `ctx.tool.transform(editor.add)`，`options: { permission: "delegate", codemode: false }`）。
2. brief 九字段校验与组装。**插件只做存在性 + 类型 + 结构校验**（`project_dir` 为绝对路径且存在、`scope` 为非空字符串数组、`grants` 元素形如 `{action, resource}`）；**语义质量归 prompt 侧**，插件不得"智能补全/猜测" brief。
3. 执行序列：resume 校验（pair 登记表 + `canonical_root` 匹配 + **`front_session_id` 身份匹配**）→ create-or-resume → baseline → prompt → wait → **新活动校验** → get → context → 可选 remove。
4. `blocked_reason` 提取（依赖 0.2）。
5. `out_of_scope_files`（`git status --porcelain` 过滤 `scope`）。
6. session permissions 组装：`[常量deny..., ...scope edit 规则, ...grants]`，顺序固定。
7. **grants 类目白名单（新增，堵 D5 自相矛盾）**：`grants` 只允许 `shell`（且 resource 必须命中 G1 之外的具体单条）+ `read`（`.env` 类除外）+ `external_directory` + MCP 读工具。**永久禁止 grant 的类目**：`question`、`form`、`edit`、`write`。理由：last-match-wins 下 grants 排最后会必然压掉前面的常量 deny 与 scope 规则——若允许 grant `question` 则挂死源复活、允许 grant `edit` 则 scope 强制点被洞穿。
8. **in-flight 保护**：目标 session 有进行中的 run 时，拒绝新 prompt（返回 `{outcome:"busy"}`）而非排队——排队会让 baseline 校验把 run1 的活动误判为 run2 的活动。

硬约束：`setup()` **零写盘**；工具内**禁止 HTTP**。

**完成判据**：AC5–AC11 + AC17 全部通过 + setup() 零写盘（6 个 location 各加载一次后 pair/role 文件 mtime 不变）+ 守卫拦截率实测落盘 + `failed`/`interrupted` 返回结构各验一次 + in-flight 拒绝验一次。

### Stage 3 — 登记、并发与清理

1. `pair.json` 升 `pair-v2`：`pairs: { <engineering_session_id>: { front_session_id, canonical_root, registered_at, last_used_at } }`。**定址：每个工程仓库一份** `<canonical_root>/.rddf/state/pair.json`（与 `role.json` 同址、同锁）；front 侧不建全局 pair 表。
2. `.rddf/state/.role.lock`（flock）包住 `role.json` 与 `pair.json` 的全部 RMW。
3. **同步改工程 session 侧**：`prompts/build.md` 角色矩阵段的 role.json 写盘契约改为取同一把锁（缺一侧则锁失效）。
4. **清理策略（ADR D2 承诺的落点）**：pairs 条目数上限 N（默认 32）或 `last_used_at` 超 T（默认 30 天）即可清理，清理前校验目标 session 已空闲且非当前活跃 pair。**若本轮不实现**，必须在本文"范围外"与 ADR 的已知 gap 中显式登记，不得静默省略（否则 `remove=false` 会让 session 无限累积）。
5. `canonical_root` 归一规则：`git rev-parse --show-toplevel` 优先；非 git 目录回退 `realpath`，并在 pair 条目标记 `vcs: false`（`vcs: false` 的 pair 允许 resume，但 `out_of_scope_files` 检测退化为不可用——须在返回里标 `scope_check: "unavailable"`）。

**完成判据**：AC12 通过（含可执行并发步骤）+ 漂移检测脚本落地（常量 deny 集 vs build agent `ask` 清单，diff 即失败）+ pairs 上限/过期清理行为验一次（或显式登记为不做）。

### Stage 4 — `prompts/front.md` 重写（交互主角）

按 ADR D1/D3/D5/D7 重写，六条工作项：

1. 四分类路由表（理解性 / 实施性 / 流程性 / 需裁决，以**产物形态**为判据）。
2. brief 六必填 + `grants` 预批话术（"这个任务需要 push + 读 .env，允许吗"），并写明**插件不做语义校验、brief 质量是 front 的责任**。
3. 流程性摘要强制带新鲜度标注。
4. **开场报状态**（ADR D7 承诺，勿漏）：新 session 首轮先给"当前工程 + 阶段 + 下一步选项"，不直接等用户提问。
5. **状态扫描清单**（ADR D7 承诺，勿漏）：front **不能**跑 `guide_entry.sh`（`bash` 已 deny、`skill` 已 deny），必须用 `read`/`glob`/`grep` **直读**以下路径并在 prompt 里列明：`.rddf/state/role.json`、`.rddf/state/iteration.json`、`.rddf/improvements/*.md`（状态字段）、`openspec/changes/*/tasks.md`、`.rddf/reviews/*.md`（最近一份的日期）。缺失文件按"未知"处理，不得猜。
6. 调试降级：`delegate` 不可见时显式报错并引导，不得静默退化；删除现 front.md 的"代答安全边界"整节（D5 已取消代答主路径）。

**完成判据**：AC13–AC16 通过 + `front.md` 全文 grep 无 `delegate.start` / `delegate.ask` / `delegate.wait` 旧工具面残留 + 六条工作项逐条对得上判据。

### Stage 5 — 退役与文档同步

1. 退役 `scripts/delegate.sh` + `scripts/captoken.sh`：**git 删除**（git 历史即备份；仓库 `.bak-*` 惯例是防手滑改配置的，不用于代码）。删除前 grep 全仓引用，输出存档。
2. 重写 `docs/dual-session-delegation.md`（工具化调用方式 + brief 模板 + 角色关系）。
3. 补 `docs/MULTI-AGENT-DESIGN.md` 的 front 覆盖（§2.1 表格 agent 数、§2.2 Primary Agents 数、§3.1 委派矩阵、§4.3 权限对比表、§2.8 front/pair 章节、§7.1 验证）。
4. `docs/CHANGELOG.md` 记录本次变更。
5. **ADR 双向映射表**：每条 ADR Verification（16 条）→ 对应 AC 编号或标"仅 ADR 终验"；差异超过 3 条时须回 ADR 补条（G2）。
6. **ADR D8 的处置决定**（critic NITS）：三条排障 runbook（`--standalone` 不激活插件、构建错误表现、env 端口不一致）移入 `docs/dual-session-delegation.md`，ADR 正文只留"插件内禁 HTTP"这条立场；二选一写死，不得两头挂。

**完成判据**：grep 引用数 = 0 的输出存档 + 文档 diff 清单 + 双向映射表落盘（阶段末 commit）。

### Stage 6 — 终验与收口

1. 逐条跑 ADR 16 条 Verification + 本文 AC1–AC17，产出 `.rddf/reviews/front-agent-redesign-acceptance.md`（每条 pass/fail + 工具证据 + 复现命令）。
2. 失败条目回指具体 Stage 重跑（不整段重来）。
3. **ADR Status `Proposed` → `Accepted`**（收口动作在此，执行者 = builder 在终验全绿后提交，用户确认合并）。
4. 清理 `role.json` / `pair-v2` 中的测试残留条目。

## Acceptance（change AC，过程门禁）

| # | 判据 | 可执行判定方式 |
|---|---|---|
| AC1 | front `shell` 首条为 `deny`、全文无 `"*": allow`；`delegate` 规则为 `[{*,deny},{*,allow}]`，其余 agent 只有 `[{*,deny}]` | `opencode debug agents` 输出中过滤上述字段做断言 |
| AC2 | front 执行 `bash -c 'echo x'`、`python3 -c 'pass'`、`curl https://example.com` 均**权限层**拒绝 | 断言出现 permission **deny 裁决**（不是"文件未创建"——`/tmp` 另受路径策略影响，不能用副作用判据） |
| AC3 | front 对 `/workspace/main/rdd-workflow` `read` 不触发 `external_directory` 询问；对 `/etc/passwd` 仍被拒 | 两次 read 的权限事件对比 |
| AC4 | **正面能力**：front 仅用 G1 清单命令完成一次"X 函数在哪 / 最近改了什么"回答，零权限询问 | 一次真实会话记录 + 0 次 ask |
| AC5 | `delegate` 在指定 `project_dir` 建 session 并让其真实写出文件，返回 `outcome=succeeded` + 最后 assistant 文本 + `status_age` | 目标文件内容断言 + 返回结构断言 |
| AC6 | `resume_session` 续接同一 session 时 session 数不增；未登记 id / `canonical_root` 不匹配 / **`front_session_id` 不匹配**三者均被拒 | 三次负例 + session 计数 |
| AC7 | 续接后 `wait` 返回但无新活动（**制造方式**：直接在目标 session 空闲时调 `delegate` 且 prompt 入队后被 interrupt 掉）时返回 `{outcome:"unknown", still_running:true}` | 返回体断言，不得返回旧 run 的 `succeeded` |
| AC8 | 工程 session 遇 `ask` 不挂死：**限时 120 s** 内以 `blocked_reason` 返回；`question` 同样不挂死 | 计时 + `blocked_reason` 非空；若 0.2 探针拿不到结构，降级判据 = 限时内返回 `outcome != succeeded` 且 `blocked_reason` 为 `"permission_denied"` 常量 |
| AC9 | `grants` 不能撤销安全边界：grant `question` / `form` / `edit` 被插件拒绝（白名单拦截）；grant 合法 `shell` 项后工程 session 回显的 permissions 含该条 | 非法 grant 三种 + 合法 grant 一种 |
| AC10 | `scope` 越界**被拒**或**可见**：scope 外写入被权限层拒绝（文件未修改）**或** `out_of_scope_files` 非空 | 刻意越界一次（原判据只写"可见"，实测实现更强：写入被拦 → 见验收报告 §一 AC9）|
| AC11 | **in-flight 保护**：目标 session 有进行中 run 时再次 `delegate` 返回 `{outcome:"busy"}`，不排队 | 长任务执行中二次调用 |
| AC12 | `pair-v2` 一 front 对两 session 两条并存；`role.json` 有对应 `sessions` 条目（不再落 `general`）；**并发无丢失更新**（制造方式：后台循环 20 次追加 role.json history，同时触发 3 次 delegate upsert，结束时两侧条目数 = 预期） | 条目数 diff + 两文件内容一致 |
| AC13 | front 收到"下一步做什么"返回摘要 + A/B/C 选项 + 新鲜度标注，且未调用 `skill` | 会话记录 + 工具调用清单 |
| AC14 | **开场报状态**：新 front session 首轮即给"当前工程 + 阶段 + 下一步选项"，不等用户提问 | 一次冷启动会话记录 |
| AC15 | **grants 预批端到端**：front 对需要 push 的任务先问"是否允许 push"，用户同意后 grants 出现在工程 session 的 permissions 回显中 | 会话记录 + `session.get().permissions` |
| AC16 | front transcript 不含账号级凭证：grep 模式 `sk-[A-Za-z0-9]{16,}`、`ghp_`、`xox[baprs]-`、`-----BEGIN [A-Z ]*PRIVATE KEY-----`、`password` 赋值形式，命中数 = 0 | 对 transcript 导出文件跑 grep |
| AC17 | `failed` / `interrupted` 返回结构：让工程 session 跑一个失败任务与一个被中断任务，分别返回 `outcome=failed` / `outcome=interrupted`，front 能据此给出不同话术 | 两次构造 + 返回体断言 |

## Capabilities

**MUST**

- front 的一切工程行动只能经 `delegate` 一个工具出口（无第二通道，无过渡期 shell 例外）。
- `delegate` 仅 front 可得；其余 agent（含 build/plan/各 subagent）不可见。
- 工程 session 权限在**建 session 时**由插件常量集 + brief `grants` + `scope` 规则定型，不依赖运行时代答。
- `grants` 受类目白名单约束，`question`/`form`/`edit`/`write` 永不可 grant。
- `blocked_reason` 从消息 part 提取（不看 `outcome`），使"因权限放弃"可区分于"任务完成"。
- 目标 session 有进行中 run 时拒绝新 prompt（不排队）。
- pair 登记与 `role.json` 分区写入由插件单写，且与工程 session 角色切换共享同一把 flock。
- front 能仅用 G1 清单完成理解性问答与状态扫描（正面能力，不只是"越权被拒"）。

**MUST NOT**

- 不得在插件内发 HTTP 请求（含"兜底"用途）。
- 不得在插件 `setup()` 内写盘。
- 不得在 `delegate` 返回中回传整段 transcript。
- 不得把 `"*": "allow"` 留在 front 的 shell 规则里。
- 不得让工程 session 在任何 `ask`（含 `question`）上无限等待。
- 不得让插件"智能补全" brief（语义质量归 prompt 侧）。

## 实施结果（2026-11-06，builder）

实施与验收已落地，逐条判定见 `.rddf/reviews/front-agent-redesign-acceptance.md`；探针实测见 `.rddf/reviews/front-agent-redesign-p0-probes.md`。

**已交付**：front shell 白名单化（含 `* /*` 禁绝对路径）、`external_directory` 路径对象、`delegate` 门控、`plugins/delegate.ts`（brief 校验 / grants 白名单 / create-or-resume / baseline 校验 / blocked 提取 / scope 检测 / pair+role 登记）、`prompts/front.md` 重写、旧脚本退役、三份文档同步。

**实施期推翻了 3 处设计假设**（已回写 ADR）：

| 原假设 | 实测结论 | ADR 修订 |
|---|---|---|
| `external_directory` 能约束 front 的跨目录访问 | **不约束 shell**（只约束 read/grep/glob） | D4.1（追加 `* /*` deny） |
| permissions 只能建时写 → 救援必须新建 session 全量重跑 | `session.update` **可原地改** | D5.1（救援降级为原地补 grant） |
| 跨会话代答"实现未验证" | **仅同 location 可用**（ctx 按 location 绑定） | D5.3 + 选项表改为"条件性保留" |

**本轮未做（已知缺口，已登记）**：pair 过期清理策略；并发写盘的实测；`failed`/`interrupted` 返回结构的实测；开场报状态与 grants 预批的端到端实测；shell 写操作对 scope 的收窄。

## Impact

**改动面**

| 路径 | 动作 |
|---|---|
| `opencode.jsonc.opencode-go` | 改：front shell 三段式 / `external_directory` 按路径 allow / `delegate` 门控 |
| `plugins/delegate.ts` | 新建 |
| `prompts/front.md` | 重写（六项工作；删代答安全边界节） |
| `prompts/build.md` | 改：role.json 写盘契约定用 `.role.lock` |
| `<canonical_root>/.rddf/state/pair.json` | 新建 / 升级 `pair-v2`（每工程仓库一份） |
| `scripts/delegate.sh`、`scripts/captoken.sh` | git 删除（先 grep 存档） |
| `docs/dual-session-delegation.md` | 重写（含承接 ADR D8 的 runbook） |
| `docs/MULTI-AGENT-DESIGN.md` | 补 front 六处 |
| `docs/CHANGELOG.md` | 追加条目 |
| `.rddf/reviews/front-agent-redesign-p0-probes.md`、`-acceptance.md` | 新建（Stage 0 / Stage 6） |

**风险与缓解**

| 风险 | 缓解 |
|---|---|
| Stage 1 后委托功能空窗（已采纳路径 a） | 与 Stage 2 同一 builder 会话内连续完成；Stage 1 完成时须向用户复述空窗期能力边界（只能理解性问答 + 状态摘要，不能委托） |
| shell 白名单破坏性收紧 | 阶段化 + AC4 正面回归保证理解性问答不退化 |
| matcher 绕过（重定向 / `--format` 截断 / 零节点跳过） | 尾部守卫 deny + 0.3 实测拦截率 + 差集写进 ADR 已知残留 |
| 常量 deny 集与 build `ask` 清单双写漂移 | Stage 3 落漂移检测脚本，diff 即失败 |
| flock 只有一侧生效 = 无锁 | AC12 明确"只有一侧加锁时判失败" |
| grants 压掉常量 deny / scope 规则 | Stage 2.7 grants 白名单 + AC9 |
| create 与登记之间 crash → 孤儿 session | 接受并记录为 known gap；pair 清理策略（Stage 3.4）兜底 |
| 插件 TS 构建错误表现为"激活卡死" | 排查顺序：先看 `--print-logs` 的 `failed to load plugin`；调试走后台服务（`--standalone` 下插件不激活） |

**回滚**

改动集中在"配置块 + 单个插件文件 + 已文档化的 pair schema"。回滚 = 恢复 `opencode.jsonc.opencode-go` 备份 + 删除 `plugins/delegate.ts` + `git checkout` docs/prompts；`delegate.sh`/`captoken.sh` 在 Stage 5 前始终在树内（`git show STAGE5_PREV:scripts/delegate.sh` 可取回）。无不可逆数据迁移（`pair.json` 为新建；`role.json` 只增 `sessions` 分区）。**回滚本身要有判据**（Stage 1 完成判据含回滚演练一条）。

**范围外（本次不做）**

- 跨会话代答权限请求（ADR 选项表列为条件性保留，需 SDK 支持后单独复审）。
- `guide` skill 的改造或删除（front 只借鉴交互范式，skill 保留）。
- 上游 opencode matcher bug 修复（#49948 / #54393，登记为升级回归检查点）。
- `rdd-workflow` 仓库侧改动。
- 若 Stage 3.4 的清理策略本轮不做，在此登记为 known gap（`remove=false` + 无清理 = session 累积）。
