# review_profile 改进方案（critic 档位显式化）

> 角色：architect（治理面）
> 日期：2026-11-12
> 状态：**A + C + D 已实施**（2026-11-12，用户选定）；B / E 暂缓，等 D 的数据再定
> 前置：本轮已给 `prompts/critic.md` 补「评审对象边界」（oracle `PASS-WITH-NOTES` → critic `APPROVE_WITH_CONDITIONS / mergeable: yes`）

---

## 1. 问题定义（可量化）

取数：`~/.local/share/opencode/opencode.db`（只读），critic 会话首条 user prompt。

### P1 档位声明率低

| 轮次 | 样本 | 显式声明 `## review_profile` |
|---|---|---|
| 首审轮 | 92 | 51（**55%**） |
| 复审轮 | 90 | 30（**33%**） |
| 合计（11-03 后） | 182 | 81（44%） |

> 口径说明：轮次用「复审 / 第 N 轮 / 闭合证据 / 只验 / 上一轮」关键词在首 600 字符分类，存在少量误分类；字段存在性用 `^#+\s*review_profile` 标题级匹配（宽松匹配会高估）。

### P2 复审轮按协议就不带档位 ⇒ 轮间可能换档（**最有伤害的一条**）

`prompts/build.md:88`：「复审只提交两样东西：上一轮 BLOCKER 的闭合证据 + 本轮新增 diff」—— 档位不在其中。而 `prompts/critic.md:88` 的档位推断是**按路径猜**：第 1 轮审 `docs/adr/**` → 猜 `arch`；第 2 轮修的是 `src/**` → 猜 `build`。**同一 change 的两轮用了不同判据集**，闭合验证的结论因此不稳。

（对照：契约机制对复审轮是**豁免**的 —— `lib/subagent-contract-core.ts` 的 `exemptIf: re-review-round` + `inheritIf` 自证，所以闸门不会拦复审轮；但豁免的是「小节齐全」，**不等于档位该丢**。）

### P3 档位映射两份

- 权威：`prompts/build.md` §档位选择（产物路径 → profile）
- 副本：`prompts/critic.md:88` 的路径推断配方（把 `arch_paths[]` 推断规则抄了一遍）

与本轮已清理的"判定词表三份拷贝"同型。两处漂移时，critic 侧的兜底会与 build 侧不一致。

### P4 缺档位不可观测

L3 日志只记 `violation` / `exempted` / `injected`（`~/.local/share/opencode/subagent-contract.log`），**不记"档位未声明"** ⇒ 只能靠抽样 DB 查询才能知道 55% 这个数，无法监控回归。

## 2. 方案选项

| # | 方案 | 解决 | 代价 | 归属 |
|---|---|---|---|---|
| **A** | **继承式档位**：复审轮**必须**携带档位（`## review_profile` + 「继承第 N 轮：arch」）；内容字段仍可豁免 —— **内容豁免 ≠ 档位豁免**。critic 侧：复审轮缺档位 → 继承上一轮；无法确定 → `mixed` 并声明 | P2（主要）、P1 复审侧 | build.md 复审协议 +1 句；critic.md 档位段 +1 句 | architect（治理面） |
| **B** | **缺档位不猜**：critic.md 删掉路径推断配方，一律 `mixed`（通用兜底）+ 声明所用档位 | P1、P3 | 判定可能比人工推断**更宽松**（arch 四类 BLOCKER vs 通用三条）—— 真实影响未知，需数据 | architect |
| **C** | **首审轮默认走骨架**：把「先跑 `scripts/build_critic_prompt.sh` 取骨架」写进 build.md 的 SOP 第一步（现在只有 `/critic-review` 命令强制），档位由脚本按路径预填、人工可覆盖 | P1 首审侧 | 依赖脚本路径覆盖（仅 `/critic-review` 一条路径）；手写路径仍需显式写 | architect + scripts（build 档产物，implement 建议 builder） |
| **D** | **可观测**：L3 日志新增 `profile_missing` 事件（agent / parentSessionID / 是否复审轮 / 是否有路径线索），审计报告出「档位声明率」指标 | P4 | `lib/subagent-contract-core.ts` + `plugins/subagent-contract.ts`（**builder**） | builder |
| **E** | **契约层收紧**：把 `review_profile` 从「7 字段之一」提为「独立必填」—— 缺它即 violation（复审轮豁免其余 6 字段，但档位不可豁免） | P1 | 需要 enforce 模式才生效（默认 warn）；改 `CONTRACTS` 判定（builder） | builder |

## 3. 推荐组合：**A + C + D**（B 作为 A 的兜底，E 待 D 出数据后再定）

理由：

1. **A 解决最有伤害的一条**（P2 轮间漂移），且改动最小（两句话）；「内容豁免 ≠ 档位豁免」这条区分本身就是闸门该有的语义。
2. **C 提高首审轮声明率**，且**不新增机制** —— 脚本已经在做路径→档位推断（`build_critic_prompt.sh` v1.6），只是没被强制使用。
3. **D 先把指标建起来**：现在 55% / 33% 是抽样值，没有持续观测就无法判断 A/C 是否有效，也无法判断 B/E 值不值得做。
4. **B（不猜）先不做**：它会用"更宽松的 mixed"换"确定性"，真实影响（BLOCKER 漏判率）目前无数据；D 的数据能支持这个决策。
5. **E 先不做**：默认 warn 模式下把 `review_profile` 提为独立必填，行为上只多一条日志；等 D 的数据证明"缺档位确实与漏判相关"，再考虑 enforce。

## 4. 验收判据

| # | 判据 | 证据 |
|---|---|---|
| AC1 | 复审轮携带档位 ≥ 90% | 日志（需 D 落地）或抽样 DB |
| AC2 | 首审轮档位声明率 ≥ 85% | 同上 |
| AC3 | 轮间档位一致：复审轮声明档位 == 首审轮声明档位 | 抽样比对 |
| AC4 | `prompts/critic.md` 不再持有路径推断配方（单一真源） | grep 断言（`tests/config-guards.test.ts`，builder） |
| AC5 | L3 日志出现 `profile_missing` 事件 | 日志样本 |
| AC6 | 无回归 | `bun test tests/` 全绿 + `scripts/check-upstream-anchors.sh` 23/23 |

## 5. 不做（明确排除）

- **不新增 profile**（如 `advisory` / `process`）：没有消费方；建议类与流程级审计当前都不该开档。
- **不改四档语义**（arch / plan / build / archive 审什么）。
- **不按上游 agent 推断档位**（critic 的轴是产物类型，见 critic.md:17）。
- **不把档位做成"critic 自选"**：档位是判据前提，必须由 build 侧给定或从路径**确定性地**推出。

## 6. 待用户决定

1. 采用哪个组合？（推荐 A + C + D）
2. B（缺档位一律 mixed）是否现在就做？—— 取决于是否接受"更宽松但确定"的取舍。
3. E（契约提为独立必填 + enforce）是否等 D 的数据？
4. D / E / AC4 涉及 `lib/**` 与 `tests/**`（builder 归属）—— 是否由我出规格后切 builder 实施？

---

## 7. 实施记录（A + C + D）

| 项 | 落点 | 改动 |
|---|---|---|
| **A 继承式档位** | `prompts/build.md:86` | 复审协议改为「两样东西 + **一行档位**」：`## review_profile` 写 `继承第 N 轮：<profile>`；内容可豁免，**档位不可豁免** |
| | `prompts/critic.md:90` | 复审轮缺档位时：有「继承第 N 轮：X」就用 X；无法确定 → `profile: mixed` 并在输出首行声明所用档位 |
| **C 首审轮默认骨架** | `prompts/build.md:149` | 「首审轮默认先跑方式 C 取骨架」，再按 A / B 补 4 个字段；并修正方式 C 的陈旧描述（脚本实际自动填 `changes_summary` / `review_profile` / `diff_or_paths`） |
| **D 可观测** | `lib/subagent-contract-core.ts` | `Evaluation` 新增 `profileMissing`；`evaluatePrompt` 计算 `!isResume && !hasSection(text, "review_profile")` —— **独立于 violations**，复审轮豁免时仍为 true |
| | `plugins/subagent-contract.ts` | L1 / L2 日志记录 `profileMissing`，缺失时追加 `event: "profile_missing"`（可用 grep 统计档位声明率） |
| | `tests/subagent-contract-core.test.ts` | 新增 5 条：齐备=false / 首审缺=true 且判违规 / 复审豁免但缺=true / 复审声明继承=false / 续接不要求 |

**验证**：`bun test tests/` = **365 pass / 0 fail**（+5）；anchors 23/23。

**AC 状态**：

| AC | 状态 |
|---|---|
| AC1 复审轮携带档位 ≥90% | ⏳ 需线上数据（D 已就绪，等新日志累计） |
| AC2 首审轮声明率 ≥85% | ⏳ 同上 |
| AC3 轮间档位一致 | ⏳ 同上 |
| AC4 critic.md 不再持有路径推断配方 | **不适用**（AC4 属方案 B，本轮未做 B；路径推断仍作为 build 未给档位时的兜底） |
| AC5 日志出现 `profile_missing` 事件 | ✅ 代码就绪；实测需下一次真实 critic 调用 |
| AC6 无回归 | ✅ 365 pass + anchors 23/23 |

**暂缓**：

- **B（缺档位一律 mixed）**：等 D 的「档位声明率 / 缺档位与漏判的相关性」数据。
- **E（契约提为独立必填 + enforce）**：同上；且当前默认 warn 模式下 E 只多一条日志。
