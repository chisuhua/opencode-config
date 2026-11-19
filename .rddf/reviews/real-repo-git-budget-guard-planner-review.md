# real-repo-git-budget-guard —— planner 审查记录（metis 1 轮）

> 审查者：**metis**（`subagent`，只读）
> 轮次：**1 轮**（按 `prompts/build.md` §审查配对：新建 improvement / proposal ⇒ metis 1 轮）
> 输入：`.rddf/improvements/real-repo-git-budget-guard.md`（rev 0）+ 指定必读（`tests/config-guards.test.ts:3124-3150`、`config-guards-ac10-timeout-flake/proposal.md`、fixture git 写法典型、`.rddf/commit-gate.json`、`docs/MULTI-AGENT-DESIGN.md`）
> 产出：improvement **rev 1** + `openspec/changes/real-repo-git-budget-guard/proposal.md`（立项）

## 0. metis 的取证限制与其要求的 P0 spike

metis 的 shell 只允许只读动词 ⇒ **无 `bun` 执行权限**；它对 rev 0「三态检测口径」的结论要求先做 **P0 spike**（建议 11：「不要用『规则的价值是预防性』直接跳过这个 spike —— 那正是规则在事后才生效的镜像」）。

**spike 已做**（脚本 `/tmp/opencode/spike_git_shapes.py`，scratch 不入仓），结果：

| 形态 | 数量 | 说明 |
|---|---|---|
| **R**（`cwd` 表达式含 `import.meta.dir` ⇒ 仓根） | **2** | 正是 AC10④ 的两处 ⇒ **零误报** |
| **缺 `cwd`**（省略 ⇒ 隐式真仓） | **0** | 今天零误报；是**最便宜的逃逸路径** ⇒ 必须 fail-closed |
| **U**（形参 `git(args,cwd)` 3 文件 / `cwd: dest\|project` 9 处 / `probes/**` 1 处） | 13 | 静态不可判定 ⇒ 登记为已知漏检面 |
| **F?**（fixture 仓） | 22 | 合法、不在规则范围 |

⇒ spike 结论直接决定 rev 1 的检测口径：**放弃命令形态匹配，改用 cwd 形态**。

## 1. metis 的 14 条 finding 与逐条处置

### 1.1 隐藏意图（4 条）

| # | finding | 处置 | 落点 |
|---|---|---|---|
| H1 | 真正的痛点是**提交门随机判红**，「结构性重构」不该排在止疼前面（rev 0 的 Impact 写「先落地本项」） | ✅ **采纳并改判顺序**：**先落 `config-guards-ac10-timeout-flake`，本项随后** ⇒ 交接面从 3 条 AC 缩到 1 条 | improvement 头部「实施顺序」+ Impact |
| H2 | 这条规则真正要防的是「下一个 AI 作者」⇒ **失败文案比检测本身更重要**，而 rev 0 的 AC 里**没有任何一条**约束报错文案 | ✅ **采纳**：新增 **AC6 的一部分 + D5** —— 报错须含三选一指引（迁移到 helper / 加 `{timeout}` 并登记 / 登记为已知盲区）；样板 = `tests/config-guards.test.ts:1473` | D5 + AC6（清单项）+ 验收报告要求 |
| H3 | 规则需要一个**规范性落点**，而 rev 0 的 D8「治理文档的事实性说明」**没指名任何文件** ⇒ 规则只能活在报错文案里 | ✅ **采纳**：D8 指名 `docs/test-authoring.md`（主，已在受管文档集内）+ `tests/README.md`（次），并给它一条 AC | D8 + AC8 |
| H4 | 「不改 ADR、不改判据语义」这条自我限制，可能掩盖了「想把已有两次抖动写进决策记录」的诉求 | ⏸ **不采纳为动作**（本项不写决策记录）⇒ **改为记录**：两次抖动的实证已经在 `config-guards-ac10-timeout-flake` 的 Why 段与本 improvement 的 Why 段里，事实链完整；「写进决策记录」= 新决策 ⇒ 需 architect 立项，不属本 change |

### 1.2 歧义（6 条）

| # | finding | 处置 | 落点 |
|---|---|---|---|
| A1 | 「显式超时」两层含义混用（用例级 vs 每次调用级）—— 同一常量承担两种语义是数值矛盾的总源头 | ✅ **采纳**：**两层常量** `REAL_REPO_GIT_TEST_TIMEOUT_MS = 20_000`（用例级）/ `REAL_REPO_GIT_CALL_TIMEOUT_MS = 6_000`（每次调用；3×6=18 < 20 留 2s 余量）⇒ **禁重试** | D2 + AC2 |
| A2 | 「子进程上限 3」的单位不一致（每次执行 vs 每个清单项） | ✅ **采纳**：统一为「**每个清单项登记的 helper 调用点数**」（静态计数，源码块内数） | D6 + AC5 |
| A3 | 「触真实仓历史」的边界未定义（`rev-parse` / `status` / `show` 算不算） | ✅ **采纳**：改用 **cwd 形态**作判据 ⇒ 命令清单不再需要（`rev-parse` / `status` 在 fixture 里也合法）；只认「cwd 指向仓根 / 缺 cwd」两形态 | D5 + AC1 |
| A4 | AC1（位置判据）与 AC5（形态判据）互倒置，且「真实仓」尚未判定 ⇒ AC1 不可判 | ✅ **采纳**：AC1 改为 **cwd 形态判据**（R 形态 + 缺 cwd），形态匹配整条删除 | D5 + AC1 |
| A5 | 治理面身份自相矛盾（Impact 说治理面 ⇒ 双审；D8 说「不改治理规则」） | ✅ **采纳**：D11 改为「**不写 `prompts/build.md` 的规范段**」（不是「不改治理面」）；Impact 保留「新增治理面守卫 ⇒ oracle + critic」 | D11 + Impact |
| A6 | 清单 schema 三处不一致（O1 / D6 / AC6 各写一套字段） | ✅ **采纳**：schema 定为 `{ file, testTitle, budget }`（`budget` = 允许的 helper 调用点数）；**不存超时值** | D7 + AC6 |

### 1.3 AI slop 风险（5 条）

| # | finding | 处置 | 落点 |
|---|---|---|---|
| S1 | 为 **1 个消费者**造「清单 + 元守卫 + 运行期计数器 + 3 条突变」，守卫代码量约为被保护代码量的 4–7 倍，且**不降低当前任何一次判红概率** | ✅ **采纳**：按 metis 的「最小正当集合」收缩 —— 去掉命令形态匹配器、去掉运行期计数器；保留「唯一入口 + 预算常量 + 迁移唯一消费者 + R 形态/缺 cwd 必须登记（fail-closed）」 | D1–D7 |
| S2 | 运行期模块级计数器与本仓「纯函数、无模块级缓存」立场直接冲突 | ✅ **采纳**：改**静态计数**（源码块内 helper 调用点数） | D6 + AC5 + Out of Scope ⑦ |
| S3 | 清单里存超时值 = 一份事实两个真源 | ✅ **采纳**：清单**不存超时值**；超时从源码读并校验 | D7 + AC6 |
| S4 | 形态匹配检测器会自己长成解析器，且明天一条 fixture 里的 `git log --name-only -- <path>` 就误报 ⇒ 白名单膨胀从后门回来 | ✅ **采纳**：整条形态匹配删除（cwd 形态对 fixture 写法**零误报**） | D5 |
| S5 | AC9 的突变全是「让检测器叫」，没有一条测**漏检** | ✅ **采纳**：AC9 明确要求**逃逸突变**（`Bun.spawnSync([git, …], {cwd: ROOT})`）—— 若不红，**如实登记为已知漏检**，不得假装覆盖 | AC9 |

### 1.4 缺失的验收标准（10 条）

| metis 建议 | 落点 |
|---|---|
| 元守卫报错文案的可操作性（三选一指引） | D5 + AC6 |
| 扫描根「空转」防线（文件集 == `readdirSync` 递归结果，不写死数字） | D5 + **AC7** |
| 扫描器自身豁免必须**显式且被断言**（集合 == {helper, 守卫自身}） | D5 + AC7 |
| registry 死项（清单项指向的 `test(...)` 已不再调用 helper ⇒ 必红） | **AC6**（清单项必须 `budget ≥ 1` 且源码块内调用点数相等） |
| helper 接口签名冻结（供 sibling change 机械改写） | D1（4 个导出逐字写死）+ **AC4** |
| 超时数值链自洽性证据（per-call 超时由 helper 报出，而不是被 bun 先杀） | D2/D3 + **AC3** |
| 不动 `tests/probes/**` / `tests/fixtures/**` 的决定必须写成判据或登记项 | **AC1**（U 面登记含 `probes/**` 1 处） |
| 超出范围的形式登记（`git -C`、`bash -c`、`Bun.spawn`、`process.chdir()`、`GIT_DIR` 泄漏） | **AC1** + Out of Scope ⑨ |
| （另）类型闸门缺失（`verify_commands` 无 typecheck） | 登记为不做（Out of Scope ⑧） |
| （另）`Bun.spawn` 已是本仓活形态 | 纳入 AC9 的逃逸突变 |

### 1.5 边界情况（13 条）

| finding | 处置 |
|---|---|
| **缺 `cwd` = 隐式真仓**（最便宜的逃逸路径） | ✅ **采纳并升级为 fail-closed 判据**（AC1：缺 cwd ⇒ 红；今天 0 处 ⇒ 零误报） |
| **cwd 是形参的泛型 helper**（3 个文件）⇒ 静态不可判 | ✅ 登记为 **U 面已知漏检**（AC1 显式列出 13 处） |
| `GIT_DIR` / `GIT_WORK_TREE` 泄漏 | ✅ 继承 sibling change 的同一条登记（Out of Scope ⑨） |
| `execFileSync` 的 `timeout` 抛错形态 | ✅ **builder 已实测**：`code = "ETIMEDOUT"`、`errno = -110`、`status = 0`；而非零退出是 `status = 128`（git）⇒ **可区分** ⇒ D3 的分层有据 |
| `merge-base` 退出码混同（1 非祖先 vs ≥128 异常） | ✅ 继承 sibling change 的登记；且 D3 规定 `isAncestor` **任何失败 ⇒ 红**（现状即如此 ⇒ 不改强度） |
| linked worktree / 无 `.git` 检出 | ✅ D1 的真仓薄包装按 **canonical-root 口径**取仓根（worktree 感知），**不引入 `.git` 存在性判断** |
| 仓库浅克隆（`git log --path` 返回空 ⇒ 跳过） | ✅ 不受影响；**不加**「sha 非空断言」（sibling change 的 P1 已因此把 AC4 降为证据项） |
| 并行化会让 per-call 超时失去总预算意义 | ✅ D2 明写「**顺序执行、不重试**」 |
| 突变演练插进去的代码会**真的打真实仓** | ✅ 纳入演练纪律：插在**不会被执行**的位置（不被执行的 describe / 非 `.test.ts`），复原证据用 `git diff --exit-code` |
| `tests/probes/**` 非 `.test.ts`（`bun test` 不跑） | ✅ 登记（AC1 的 U 面） |
| `GIT_DIR` 泄漏使 fixture 实际打真仓 | ✅ 登记 |
| `err.status === null` 的说法 | ⚠ **metis 的表述与实测不符**（实测 `status = 0`、`code = "ETIMEDOUT"`）⇒ 以实测为准，已写进 D3 |
| helper 若改 `execFile` + `Promise.all` | ✅ D2/D3 禁并发与重试 |

### 1.6 建议修改（14 条中的「必须做 / 交决定 / 不做」）

| metis 建议 | 处置 |
|---|---|
| 建议 1（必须）：检测口径改 cwd 三态 + 无 cwd ⇒ 红，未知 ⇒ fail-closed | ✅ **采纳**（含其「降级方案」：只判 R 形态 + 缺 cwd ⇒ 红，零误报；U 面登记） |
| 建议 2（必须）：错误语义**按函数拆**；「超时 ⇒ 抛错」**不算改强度**（现状无 per-call timeout ⇒ 挂死由 bun 用例级超时判红；helper 抛错只是把「bun 级不可归因红」换成「helper 级可归因红」） | ✅ **采纳**，并把后半句**逐字写进 proposal**（否则 reviewer 会按 sibling change 的 D8 判它违规） |
| 建议 3（必须）：两层超时常量 + 禁重试 | ✅ 采纳（D2 + AC2） |
| 建议 4（必须）：子进程上限改静态计数；删运行期计数器 | ✅ 采纳（D6 + AC5 + Out of Scope ⑦） |
| 建议 5（必须）：清单 schema 只定一次 + 不存超时值 | ✅ 采纳（D7 + AC6） |
| 建议 6（必须）：helper **cwd 参数化** + 真仓薄包装（否则 sibling 的 fixture 三态无法实现） | ✅ 采纳（D1 + AC4） |
| 建议 7（必须）：补扫描根空转 AC + 豁免显式断言 + **逃逸突变** | ✅ 采纳（AC7 + AC9） |
| 建议 8（必须）：规则落到**具体文档**并给它 AC | ✅ 采纳（D8 + AC8） |
| 建议 9（必须）：登记漏检面逐条理由 | ✅ 采纳（AC1 + Out of Scope ⑨） |
| 建议 10（决定）：两个 change 覆盖同一 27 行 ⇒ (a) 合并 / (b) 保持分离 + 后落地者回写前者 AC | ✅ **采纳 (b)**（合并要动一个已过 planner 审查的 proposal，代价更大）⇒ D9 + AC8 + 留痕文件 |
| 建议 11（决定）：Q1 立项正当性 + **先做 P0 spike** 再定检测口径 | ✅ **spike 已做**（§0）⇒ 检测口径由数据决定；**最小正当集合**按 metis 建议收缩 |
| 建议 12（决定）：**顺序**改为「先落 `config-guards-ac10-timeout-flake`」 | ✅ 采纳（rev 0 的「先落地本项」被推翻） |
| 建议 13（不做）：`verify_commands` 加 typecheck | ✅ 登记为不做（Out of Scope ⑧） |
| 建议 14（不做）：PATH shim / `bunfig` preload 做全量轨迹 | ✅ 登记为不做（Out of Scope ⑨），并写明「静态检测必然有漏检面」的根因 |

## 2. 自捕（2 条）

| # | 问题 | 后果 | 修法 |
|---|---|---|---|
| B1 | rev 0 的 Why 把「值得一次性把口径定死」写成**结论**（实际是**未验证的推论**） | 把推论写成事实 = 本仓反复强调的「宣称 ≠ 实现」 | rev 1 改为：spike 数据 + 「规则的价值是预防性」作为**动机**（明确标注为动机，不是已证结论） |
| B2 | rev 0 的「三种落地形态 O1/O2/O3」实际只有 O1 被展开，O2/O3 是稻草人 | 制造「已比较三个方案」的假象 | rev 1 **删除**该表，改写为「rev 0 的三个候选形态经 metis 与 spike 后**全部推翻**」+ 推翻理由 |

## 3. 预算

| 项 | 轮次 |
|---|---|
| metis（本记录） | **1 轮**（该 improvement 总计 1 轮） |
| oracle / critic | 待实施后：新增治理面守卫 ⇒ 各 1 轮 |

## 4. 结论

- **improvement rev 1 已修订**：14 条 finding 全处置（11 条采纳 / 1 条部分采纳 / 1 条以实测纠正 / 2 条自捕）。
- **立项完成**：`openspec/changes/real-repo-git-budget-guard/`（`proposal.md` + `.openspec.yaml`）。
- **判据真源**：proposal 的 **AC1–AC9**。
- ⚠ **实施顺序**：`config-guards-ac10-timeout-flake` 先落（止疼），本项随后；交接按方案 (b)（后落地者回写前者的 D2/AC3/AC5 + 留痕）。
- ⚠ **本项不改判据强度**：`lastCommitSha` 的「出错 ⇒ 空串跳过」与 `isAncestor` 的「任何失败 ⇒ 红」**逐字保留**；只有 per-call 超时新增**可归因的抛错**（现状无 per-call timeout ⇒ 挂死本就由 bun 用例级超时判红）。
