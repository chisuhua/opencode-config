# 评审自动化迁移清单（C 项）

> 状态：草案，2026-10-26
> 背景：critic 执行审计（145 个会话）显示，BLOCKER 中约 40% 是文档计数、格式、脚本卫生类问题。
> 这些由人工对抗式评审反复发现、反复返工，是评审轮次膨胀的主要燃料。
> 本文把「该由工具做的事」从 critic 手里拿走，留给 critic 的只有架构方向与关键决策。

## 1. 分层原则

| 层 | 负责 | 判据 | 失败处理 |
|---|---|---|---|
| L0 静态检查 | formatter / linter / shellcheck / clang-tidy | 格式、命名、死变量、未引用、语法 | pre-commit 阻断 |
| L1 一致性脚本 | 仓库内 `scripts/verify_*.sh` | 文档计数、表格结构、交叉引用、spec 数字 | CI 阻断 |
| L2 verifier | 执行验证 | 测试真跑、覆盖率、变异测试、护栏有效性 | 验收报告，返工实现 |
| L3 critic | 架构与决策 | ADR 一致性、契约走向、失败模式 | 评审结论，返工设计 |

规则：**L0/L1 能判定的问题，不允许出现在 critic 的 BLOCKERS 里**；出现了就是分层失效，应补脚本而不是加一轮评审。

### 1.1 「文档形态」类问题的归属（2026-10-28 补充）

架构决策文档越界成「设计规格 / 流程台账」是一类**新出现**的问题（实测：ADR 决策陈述占比低至 22%、正文混入审稿轮次与实测台账、缺独立后果章）。它**不属于** L0/L1：

| 判据 | 归属 | 载体 |
|---|---|---|
| 决策陈述被稀释 / 过程日志混入 / 缺后果章 / Verification 只写实测日志 / 一文档多决策 | **L3 critic 的 SHOULD_FIX**（不阻断） | `prompts/critic.md`「arch — SHOULD_FIX 的聚焦判据」 |
| 同类问题在**写作时**的预防 | **architect 角色约束**（提示词层） | `prompts/build.md`「architect 产出形态契约」 |
| 同类问题的机械回归 | **L1 脚本**（可选启用） | rdd-workflow `skills/rdd-arch/scripts/adr_shape_check.sh`（`ARCH_SHAPE_CHECK=yes` opt-in） |
| 计数漂移 / 悬空引用 / 索引缺项 | **L1 脚本**（不归 critic） | 见 §2 |

分工理由：形态问题的判据是「决策 vs 推导」的**语义比例**，脚本只能测代理指标（行数、章节存在性、过程日志标记），真正能判的是 critic + 写作时的约束。

## 2. 待自动化项（按收益排序）

### P0-1 文档计数一致性

- **问题**：`AGENTS.md` / `proposal.md` / `spec.md` 里的「19 个 target」「恰好 3 个」「6 条 Requirement」与实测不符，占 BLOCKER 最大头。
- **做法**：`scripts/verify_doc_counts.sh`
  - 文档中用固定标记声明可校验计数，例如 `<!-- count: targets-in:examples/riscv-mini -->19<!-- /count -->`；
  - 脚本按标记重算并与声明比对，不匹配即 fail；
  - 先只覆盖 `AGENTS.md` 的自动块 + `proposal.md` 的 Impact 表，逐步扩。
- **钩子**：pre-commit（改动文档时）+ CI。
- **验收**：故意改错一个计数 → exit 1；连续 10 次真实提交无误报。

### P0-2 Markdown 表格结构

- **问题**：header 列数与数据行不一致、缺 delimiter、表格被空行截断（GFM 下退化为纯文本）。
- **做法**：`scripts/verify_md_tables.sh`（python 标准库实现，逐行扫 `|` 数量；跳过代码块）。
- **钩子**：pre-commit（`*.md`）+ CI。
- **验收**：构造 4 列表头 + 3 列行 → fail；全仓现有文档 baseline 清零。

### P0-3 spec 数字 vs 可执行事实

- **问题**：spec 写「恰好 3 个用例」，实际 `ctest -R` 命中 4 个；归档后错误契约进主 spec。
- **做法**：`scripts/verify_spec_counts.sh`
  - spec 中可执行断言用标记：`<!-- verify: ctest -N -R cep_poc_spike | count -->3`；
  - 脚本执行命令并比对；不可执行的数字改为描述性文字（禁止裸数字承诺）。
- **钩子**：CI（`openspec validate` 之外单独 step）。
- **验收**：新增/修改 spec 时，含 `verify:` 标记的段落必须通过。

### P1-1 脚本卫生（shellcheck）

- **问题**：死变量、未加引号、`cd &&` 前缀、`set -e` 缺失导致护栏假绿。
- **做法**：shellcheck（`-S warning`）+ 仓库 `.shellcheckrc`；存量文件加 baseline 白名单，新增违规阻断。
- **钩子**：pre-commit + CI。
- **验收**：`shellcheck -S warning scripts/*.sh` 新增违规为 0。

### P1-2 死代码 / 未引用符号

- **问题**：死变量、孤儿头文件、未被任何 TU include 的头。
- **做法**：C++ 侧 `clang-tidy -checks=-*,misc-unused-*`（或 `-Wunused`）+ 头文件引用扫描脚本（项目已有类似 `verify_no_duplicate_rv32i_headers.sh` 可复用）。
- **钩子**：CI（增量文件）。
- **验收**：新增文件不得引入新的 unused 警告。

### P1-3 交叉引用 / 锚点校验

- **问题**：文档引用不存在的 `§9 BLOCKER N`、错误的 ADR 编号、失效相对链接。
- **做法**：`scripts/verify_doc_refs.sh`：抽取 `§`/`ADR-xxx`/markdown link，校验目标存在；ADR 编号查 `docs/adr/NUMBER-MAP`。
- **钩子**：pre-commit（`.md`）+ CI。
- **验收**：注入一个不存在的 ADR 引用 → fail。

### P2-1 tasks.md 勾选 vs verify 命令

- **问题**：`tasks.md` 标 `[x]`，但对应 verify 命令跑不过（或根本不存在）。
- **做法**：约定 `- [x] Task N — <verify: 命令>`；`scripts/verify_tasks_claims.sh` 对已勾选项执行命令，失败即报。
- **钩子**：归档前（`openspec archive` 前置）。
- **验收**：伪造一个 `[x]` + 失败命令 → 阻断归档。

### P2-2 命名 / 格式 / import 顺序

- **做法**：仓库已有 formatter 的直接接入 pre-commit；没有的先定 `clang-format` + `cmake-format`，只对改动文件生效。
- **钩子**：pre-commit。
- **验收**：CI 的 format check 与本地 pre-commit 结果一致。

### P2-3 守卫规则的真源 ↔ ADR 锚（2026-11-09 新增）

**背景**：五个只读 subagent 的 shell 守卫原本只以手写 JSON 存在于 `opencode.jsonc`，本轮因此出过两次事故
（① front 的 `subagent` 规则把 `"*": "deny"` 放末尾 → 整个工具被隐藏；② `curl * -o*` 匹配不到
`curl -o /tmp/x URL` → librarian 真落盘）。已建 `scripts/agent-guard-rules.ts`（真源）+
`scripts/agent-guard-gen.ts`（重建/检漂移）+ `tests/config-guards.test.ts`（漂移检测）。

**状态更新（2026-11-09 同日收口）**：下表三项**已全部落地** —— front 已纳入真源并补齐首参形态
（配置 88 → 117 条规则，allow 数不变 47）；新增 `REQUIRED_GUARD_SET`（真源 ↔ ADR 全量 deny 族锚）；
新增 round-trip 用例（注入漂移 → 修复 → JSON 可解析 → 规则全等 → 二次执行幂等）。以下保留为**设计说明**。

**残留缺口（三项，原始记录）**：

| # | 缺口 | 取证 | 建议 |
|---|---|---|---|
| 1 | **front 自己的 shell 不在真源内**（且缺 D3.1 首参形态） | 真源 `GUARDED_AGENTS` 只有五个 subagent；front 的 `shell * -o*` 之类**缺首参形态** → `sort -o out a` 这类**相对路径写 CWD**在 front 侧仍可写 | 把 front 纳入真源（需先抽差量：front 无 curl/wget allow、`git` allow 全带子命令、`* /*` 守卫）；并补 front 的首参形态守卫 |
| 2 | **真源 ↔ ADR D3.1 全量清单缺锚** | 现有测试只锚首参形态（`REQUIRED_FIRST_ARG_FORMS`）；其余 deny 族（重定向 / `tee *` / find 族 / `.env` 族）只存在于真源自身 | 加 `REQUIRED_GUARD_SET`（ADR D3/D3.1 全量 deny 族硬编码进测试）——**实测**：单独改坏真源**会**被漂移测试抓到（5 条失败），但"改坏真源 + 跑 `--write` 把配置同步成坏源"后二者一致 → 只有 ADR 锚能发现 |
| 3 | **`--write` 的修复路径无自动化验证** | 目前只测了"检测"（注入漂移 → 失败 → 恢复 → 全绿），**没测"修复"**（注入漂移 → `--write` → 断言 JSON 可解析、五块与真源全等、二次执行无 diff） | 加 round-trip 用例（临时副本） |

**教训（写进清理规程）**：数字/状态类修复必须**全仓 grep 同类模式**，不能只改审计点名的那几个文件
——本轮就漏了 `docs/MULTI-AGENT-DESIGN.md:974-975`（"63 项"/"96 pass"）与
`docs/dual-session-delegation.md`（同样的数字）。

## 3. 不建议自动化的部分

- 架构取舍是否成立（例如「收敛到单一权威头」vs「保留双副本」）。
- ADR 之间的语义冲突（编号校验可以自动，冲突判断不行）。
- 护栏脚本的逃逸面 / 变异测试：这属于 verifier 的验收职责，不是 lint，也不该回到 critic。

## 4. 迁移顺序

1. P0-1 / P0-2（收益最高、实现最轻，纯文本处理）。
2. P0-3（需要 spec 标记约定，先在一个 change 试点）。
3. P1-1 / P1-2（接入现有 CI，清 baseline）。
4. P1-3 / P2-1（依赖前几步的脚本骨架）。
5. 每完成一项，删除 critic prompt 里对应的「可报」空间（已在新版 `prompts/critic.md` 的「不要报」清单中先行声明）。

## 5. 验收指标（迁移完成后）

| 指标 | 现状（2026-10-26 审计） | 目标 |
|---|---|---|
| 单 change critic 轮次 | 最高 37 次（C1 19 轮 + C2 13 轮） | ≤2 轮（第 3 轮需用户批准） |
| BLOCKER 中文档/格式类占比 | ~40% | 0 |
| REJECT 中无 BLOCKER 的比例 | 约 10–20% | 0（结论与 `mergeable` 强制一致） |
| critic 工具调用中 shell 占比 | 83%（11,681 / 14,104） | < 20%（只读定位为主） |
| 因评审产生的返工 commit 数 | 每 change 5–10 个 | ≤2 个 |

## 6. 关联

- `prompts/critic.md`（v1.6/1.7：架构/决策审稿 + `review_profile` 分档 + 「不要报」清单）
- `prompts/build.md`（v1.6/1.7：评审预算与循环规则 + 7 字段契约 + 角色矩阵 + `arch-docs.json`）
- `prompts/context-builder.md`（v1.6：按路径推断 `review_profile`）
- `docs/MULTI-AGENT-DESIGN.md` §2.3 / §2.4
