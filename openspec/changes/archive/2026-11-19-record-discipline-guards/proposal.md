# record-discipline-guards — 把「记录纪律」装进提交门（7 条机械判据）

> 输入：`rdd-workflow-e2e` 的 `tests/integration/test_evidence_discipline.bats`（2026-11-19 新建；7 条判据 + 每条配反例 + 对历史快照的判别力实测）。
> 触发：用户 2026-11-19 指令「根据本会话教训创建 e2e 测试，若证明还会出错，就立项修到全绿」。
> 性质：**只增判据**（新增 1 个 shell 守卫 + 1 个薄包装测试 + 注册行），**不改任何既有判据、不改行为**。
> 决策真源：**无新决策** —— 本 change 不改 ADR，只把「已在 e2e 仓验证过的记录纪律」搬进本仓的提交门。
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置不存在 ⇒ 走**内置流程**。

## Why

2026-11-19 的多 change 收口会话里，**实现层没出错，出错的全是记录与判据层**。复盘出 7 类，每一类都能被一条机械判据抓住，并且已在 e2e 仓用**历史快照回归**证明有判别力：

| # | 事故（本会话真实发生） | 对应判据 | 历史快照回归 |
|---|---|---|---|
| 1 | AC 写「测试源码含 `git log -1 --format=%H --`（逐字）」，而参数写成数组后该**字符串永不出现** ⇒ 该 AC 不可满足 | **C1** 判据可机判（标「逐字」的字面量必须在该 AC 声称的**语料**里命中，且排除 change 自身目录） | `TARGET_REPO=<ed6fd44>` ⇒ **红**（精确点名该 AC） |
| 2 | `required-question-hard-pause-probe` 的 AC5（CHANGELOG）**勾了但没落**；`subagent-contract-critic-enforce` 的 Acceptance 镜像 15 条全未勾 | **C2** 勾选要有证据指针（`> **验收证据**` 注记 或 `.rddf/reviews/<name>*`） | 会话起点快照 ⇒ **红**（点名 2 个 change） |
| 3 | `N 112 → 326（≥150 已到）` 在两份文件里"互相印证"；处置是追加勘误，但勘误本身必须可复核 | **C3** 勘误要自足（权威源 + 原文位置） | 反例 + 当前仓绿 |
| 4 | 观察报告 §1 写「载体 pending」，§8.4 写「载体 A 已确认」⇒ 我据此给出**错误的"不归档理由"** | **C4** 过期段要标注（pending 与已确认并存 ⇒ 必须有取代标注） | 会话起点快照 ⇒ **红**（点名那份报告） |
| 5 | 归档后 `docs/adr/**` / `.rddf/improvements/**` 的 change 指针悬空 | **C5** 活文档指针不悬空 | 反例 + 当前仓绿 |
| 6 | 我用**混装 commit**（`9cc67c9` 含 `prompts/build.md`）作"没碰 prompts"的归因证据 | **C6** commit 级否定性归因必须带命令（**不接受 `git log` 作归因手段**：它列不出某提交的文件集） | 反例 + 当前仓绿 |
| 7 | 「门槛已到」类断言**没有取数指针** ⇒ 错误无法被复核 | **C7** 门槛达标断言必须带取数指针（同一 bullet 内） | 会话起点快照 ⇒ **红**（点名 CHANGELOG 那行） |

**为什么必须搬进本仓**：这 7 条现在只活在 e2e 仓的 bats 文件里 —— **跑不跑取决于有没有人手动跑**。而本仓的 `.rddf/commit-gate.json` 的 `verify_commands` 含 `bun test tests/` ⇒ 只要把它们做成一条测试，**提交时就会被拦**。

## What Changes

### D1 新增 `tests/verify_record_discipline.sh`（唯一实现）

移植 e2e 仓已验证的 7 条判据（逻辑同源，便于双向对照）：

| 检查 | 范围 |
|---|---|
| C1 | 有 AC 表的 change，且 AC 行含「逐字」⇒ code span（去占位符）必须在**该行语汇决定的语料**（说「源码/测试源码」⇒ `*.ts/*.sh/*.json`；说「文档/报告」⇒ `*.md`；否则全语料）里命中，**排除该 change 目录**（防自匹配） |
| C2 | 有 `## Acceptance（勾选镜像）` 且有 `- [x] AC` ⇒ 必须有 `> **验收证据` 注记 或 `.rddf/reviews/<name>*`（`<name>` 去归档日期前缀） |
| C3 | 每个「勘误（…）」块（后 10 行）必须同时含权威源（权威/真源）与原文位置（原文/上文/上条/本条/第 N 行） |
| C4 | `*-observation.md` 同时含「pending/未判定」与「✅/已确认/通过」⇒ 必须有取代标注（已被后续/已被取代/superseded/状态更新/过期） |
| C5 | `docs/adr/**` 与 `.rddf/improvements/**` 里的 `openspec/changes/<name>/` 必须存在（或同文件给出 archive 指针） |
| C6 | 含「未改/未碰/只碰/只改」**且**含提交语境（提交/commit/git log/sha）的行 ⇒ 同段必须有 `git show` / `git diff` / 按文件归属 |
| C7 | 含「已到/已达标」+`150` 的行 ⇒ 同一 bullet 内必须有完整 code span 形式的路经/命令指针；豁免勘误引用与「样本不足 / `<150`」语境 |

### D2 保鲜期（**生效日**，避免对历史存量判红）

`RECORD_EPOCH`（默认 `2026-11-19`）：只检查**该日之后被改动过**的文件（一次 `git log --since` + 一次 `git status` 预计算，**不要**逐文件跑 git）。理由：这些约定自该日建立；本仓惯例是历史记述**不回改**，对存量判红没有修复路径。

### D3 薄包装测试 `tests/record-discipline.test.ts`

照既有先例（`tests/arch-docs-scope.test.ts` 包 `verify_arch_docs_scope.sh`）：`spawnSync("bash", [script])` ⇒ 非零即红，并把脚本输出原样带出。

### D4 文档落点

`tests/README.md` 覆盖表加一行；`docs/test-authoring.md` §8 核对单补一条（「记录类判据是否已进守卫」）。

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | `tests/verify_record_discipline.sh` 存在且可执行；`bash tests/verify_record_discipline.sh` 在当前仓 **exit 0** | 结构 | 命令输出 |
| AC2 | 7 条检查全部落地（`grep -c '^check_c[1-7]' ` == 7）且每条都有**反例**自测（`--selftest` 模式：造错样例 ⇒ 必须报出） | 结构 | 脚本 `--selftest` 输出 |
| AC3 | `bun test tests/` 全绿（含新增的 `record-discipline.test.ts`） | 结构 | 全量 |
| AC4 | 判别力：把脚本指向 **历史快照**（`ed6fd44` 与 `0ff7f81`）时 C1/C2/C4/C7 **至少各红一次**；当前仓绿 | 结构 | 快照回归输出 |
| AC5 | 保鲜期生效：`RECORD_EPOCH` 之前的文件不被判红（当前仓 31 个归档 change 里 2026-11-19 之前的存量不报） | 结构 | 命令输出 |
| AC6 | 与 e2e 仓同源：`rdd-workflow-e2e` 的 `test_evidence_discipline.bats` 对当前仓 **22/22 绿** | 结构 | bats 输出 |
| AC7 | 回归：`bash scripts/check-upstream-anchors.sh` 无 FAIL；anchors 与 commit-gate 的 `verify_commands` 不变 | 结构 | 全量 |

## Acceptance（勾选镜像）

> 判据正文以上表为准；本段供 `rdd-verifier` 读取。

- [x] AC1 守卫脚本存在且本仓 exit 0
- [x] AC2 7 条检查全部落地 + `--selftest` 反例/正例
- [x] AC3 `bun test tests/` 全绿（含 wrapper）
- [x] AC4 历史快照判别力（C1/C2/C4/C7 各红一次）
- [x] AC5 保鲜期生效（存量不判红）
- [x] AC6 e2e 同源套件对当前仓 22/22 绿
- [x] AC7 anchors 无 FAIL + commit-gate 的 verify_commands 未改

> **验收证据（2026-11-19）**
> - `bash tests/verify_record_discipline.sh` ⇒ `RESULT: OK（…7 条判据全部通过；保鲜期 2026-11-19）`（4.5s）；`--selftest` ⇒ 14 项全过（7 反例被报出 + 7 正例不误报）。
> - `bun test tests/` ⇒ **924 pass / 0 fail**（新增 `record-discipline.test.ts` 2 例；套件 24.8s）。
> - **历史快照回归**：`0ff7f81`（会话起点）/ `ed6fd44`（实施提交）上 `RECORD_EPOCH=1970-01-01` ⇒ C1/C2/C4/C7 **各红**，当前仓绿（明细见 `.rddf/reviews/record-discipline-guards-verify.md` §1 AC4 与 `.rddf/reviews/evidence-discipline-e2e.md` §2）。
> - e2e 仓：`bats tests/integration/test_evidence_discipline.bats` ⇒ **22/22**；全仓 e2e `bats -r tests/` ⇒ **142 例 / 0 失败 / 68 skip（gated 运行时）/ exit 0**。
> - `bash scripts/check-upstream-anchors.sh` ⇒ **23/23**；`.rddf/commit-gate.json` 未改。
> **勘误（2026-11-19，归档后追加）**：上述 e2e 计数 **22/22 → 23/23**、全仓 **142 → 143 例**。
> **权威源**：`.rddf/reviews/record-discipline-guards-verify.md` §6；**原文位置**：本节上一段的 e2e 计数行。
> 变更原因：C6 的「提交语境」谓词剔除文件名 `commit-gate.json`（该误报命中本 change 自己的验收报告），
> 本仓脚本与 e2e bats 同口径收紧，并各补 1 条正例 ⇒ 只增不减判别力（反例仍必报）。

> - **写测试时的 4 个自捕错误**（`printf %H`、`--` 吞掉 `--include`、判据自匹配、`TOUCHED` 空转）如实记录在 `.rddf/reviews/evidence-discipline-e2e.md` §3 —— 与本次要防的错误同型。

## Out of Scope

| # | 不做 | 理由 |
|---|---|---|
| ① | 把 7 条判据写成 TS（重写一遍） | 双份实现 = 双份漂移；先单源（bash），TS 只做薄包装 |
| ② | 让本仓直接 `source` e2e 仓的 bats 文件 | 跨仓路径耦合（e2e 仓非必需依赖） |
| ③ | 对 2026-11-19 之前的存量做修复 | 历史记述不回改（本仓惯例）；存量只登记 |
| ④ | 行为层检查（"agent 是否真的这样做"） | 那要真实模型 + 额度 ⇒ 留在 e2e 仓的 gated 用例（本 change 只做**产物层**） |
| ⑤ | 把 C3/C5/C6 也做历史快照回归 | 那三类的失败形态出现在本会话**之后**，无对应快照；用**反例**证明判别力即可（脚本 `--selftest`） |
