# 治理面审查记录 — governance-paths-config-migration（B1 机制落地）

> **判据真源**：`docs/adr/ADR-governance-paths-ownership.md`（Status = **Accepted**，2026-11-23 用户签批）的 D1–D5 + Verification V1–V8。
> **实施契约**：`openspec/changes/governance-paths-config-migration/{proposal.md,tasks.md}`。
> **本记录的角色**：builder 对**治理面**改动集的审查收口（`prompts/build.md` §审查配对 的「architect（治理面）」行：oracle → critic，顺序不可颠倒；一次改动 = 一个 patch series 内触及治理面文件的**集合**）。
> **改动集**（`git diff ba02361 --stat` + `git ls-files --others --exclude-standard`）：`lib/role-policy.ts`、`plugins/role-gate.ts`、`tests/config-guards.test.ts`、`tests/role-gate-plugin.test.ts`、`prompts/build.md`、`docs/MULTI-AGENT-DESIGN.md`、`.rddf/rollback/registry.json`、`.rddf/config/governance-paths.json`（新增）、`.rddf/rollback/governance-paths-config.json`（新增）、`openspec/changes/governance-paths-config-migration/tasks.md`。

## 0. 意图检查点（oracle 调用前）

- **意图已定**（可判定陈述）：治理面路径清单此前是**政策数据**却写在**机制代码** `lib/role-policy.ts` 里 ⇒ 归属与写权结构性反转（architect 改不了「什么算治理面」这份清单，builder 凭 `**` 可以改；2026-11-23 已实际发生一次排队卡死）。本改动把清单迁到 `.rddf/config/governance-paths.json`（政策配置面，归 architect，与 `arch-docs.json` 同形），机制代码只留**兜底默认** + 三态解析，并让写门每次判定**重读**该清单。
- **范围边界**：① 不改治理面判定语义（双命中 / fail-closed / allow 表 / 租约围栏不动）；② 不把机制面（`lib/**` / `plugins/**`）加入清单（ADR D2 明文否决 = 被否决的方案 A）；③ 不改 `arch_paths` 相关逻辑；④ 不做清单增删的 CLI/UI。
- **意图只有用户才知道的部分**：无（本 change 的 ADR 已签批 ⇒ 意图、边界、验收判据全部落库）。
- **metis 是否先行**：**未调用** —— 意图明确且无 ≥2 种合理解读 ⇒ 按 §oracle 调用前的意图检查点「意图明确 → 直接调 oracle」；歧义 / slop / 边界枚举由本记录 §2 / §3 的逐条 finding 处置承担。

## 1. oracle（`审查域: 治理面`）

- **判定行原文**：`治理面判定: PASS-WITH-NOTES`
- **focus**：① 兜底语义有无死路（治理面静默消失 / 全拒死锁）；② 「两处真源」是否成立；③ 告警可见性与新写权面；外加 **AC2（V2）实现口径**是否成立。

### 1.1 逐条 finding 处置（oracle 5 条 ⇒ 全部已应答）

| # | finding（impact×risk） | 处置 |
|---|---|---|
| ① | **高影响/低风险** — 告警去重记忆跨恢复周期**不复位**：`lastGovernanceWarning` 只在告警变化时更新，配置恢复健康时不清零 ⇒「坏 → 修 → 同款再坏」的第二次坏**永久不再告警**（这正是「配置坏了静默到无人察觉」的唯一可达路径） | **已修**（`plugins/role-gate.ts`）：`governanceWarning` 为空时 `lastGovernanceWarning = ""` ⇒「坏 → 修 → 同款再坏」仍告警 |
| ② | **中影响/低风险** — 工件状态不一致：`proposal.md:86` / `tasks.md` 写 registry「转 `active`」，实际是 `proving` → drill → `active` 两段式 | **已修**（`tasks.md` R1 措辞订正为两段式，并注明与仓内 `model-fallback` 同款）；`proposal.md` 的「回滚」段描述的是**终态** `active`，与两段式不矛盾 ⇒ 不改 |
| ③ | **中影响/低风险** — `docs/CHANGELOG.md` 缺本 change 的条目 | **已补**（见 §4；按仓库规则「结论只有在审稿记录落盘后才可写进 CHANGELOG」⇒ 本条在本记录落盘后写） |
| ④ | **低影响/低风险** — `writeGovernancePathsConfig` 零调用方、零测试 | **已修**：新增「写配置路径：原子替换 ⇒ 写后即生效，且不留 .tmp 残留 / 半文件」用例；初值配置即由该函数写出（原子写路径有真实调用方） |
| ⑤ | **低影响/低风险** — AC2 用例 step③ 是空操作（对 `DEFAULT` 过滤一个不在 `DEFAULT` 里的条目）⇒ 注释宣称的「成对」实际靠后续断言承担 | **已修**：step③ 改为「同一份含非核心条目的配置里，核心集条目仍是治理面」（真成对） |

### 1.2 oracle 对 AC2 口径的裁定（critic 第 1 轮亦复核认可）

今日常量下 `DEFAULT ≡ CORE`（13 条）⇒「相对默认清单收紧非核心条目」**不可观测**（默认每条都是核心，删任一条即触核心集地板 ⇒ 按损坏回退，生效清单不变）；唯一可观测的收紧形态 = 删掉**配置自增**的扩展条目（AC2 用例所测：加 `NON_CORE` ⇒ planner 被拒；删 ⇒ 同进程内放行）。因解析**不缓存**，「读一次即生效」由构造保证；未来若默认清单 ⊋ 核心集，「收紧默认非核心项」自动可观测且**机制无需改动**。⇒ **口径成立，不是实现缺陷。**

## 2. critic（第 1 轮，`review_profile: build, arch, plan`）

- **结论原文**：`# 审查结论：REJECT（1 个 BLOCKER）` / `mergeable: no` / `scope_exceeded: false`
- **开放问题裁决（critic 第 1 轮）**：(a) 三清单**不**构成 V6「两处真源」⇒ 可接受；(b) 核心集严格包含判定**不会**静默拒收合法配置（回退默认 = 超集 + 告警点名缺失条目 ⇒ fail-wider 且有声）⇒ 可接受；(c) `docs/MULTI-AGENT-DESIGN.md` §2.7 的那一行**非越界**，是必要的**投影同步**（不同步反而会再造一个审查真空）⇒ `scope_exceeded: false`；(d) 回滚清单形态（`delete` 新配置 + 清单自身 / `retire` 按身份 / `edits` 覆盖全部触面）与仓内既有清单同构。

### 2.1 BLOCKER 闭合（critic 第 1 轮 ⇒ 第 2 轮复审）

- **BLOCKER 原文要点**：`resolveGovernancePaths` 只校验下限（核心集 ⊆ 配置，防收紧），**不校验机制面根**（`lib` / `plugins`）不得入清单（防加宽）⇒ architect 把 `"lib"` 加进配置（该文件 architect 现在可写）后，写 `lib/role-policy.ts` 会按前缀命中治理面 ⇒ 走治理面分支 ⇒ `architect.governance: true` ⇒ **放行** ⇒ 即「architect 借治理面身份拿到机制代码写权」= ADR D2 明文否决的**方案 A**，与 ADR 背景 2 / D1 第一不变量冲突；且 ADR :55「机制面的安全由『机制面归 builder』保证，**不靠清单**」在清单配置化后不再成立。
- **闭合证据**：
  1. **结构性禁区（判定侧，load-bearing）**：`GOVERNANCE_FORBIDDEN_ROOTS = ["lib", "plugins"]` + `coversMechanismRoot()`；`decideWrite` 的**双命中两支同时**排除机制面路径 ⇒ 清单（配置或代码默认）即便含 `lib` / `plugins`，机制代码也拿不到治理面身份 ⇒ 落到「仓库内 ⇒ 命中 `allow` 才放行」分支 ⇒ architect 的 allow 不含 `lib/**` ⇒ **拒**。⇒ 安全**不靠清单**（ADR D2.4 原话）。
  2. **解析侧剔除 + 点名告警**：配置含机制面条目 ⇒ 该条目被剔除 + 告警点名，配置其余条目仍生效。
  3. **守卫用例**（`tests/config-guards.test.ts`，守卫族第 15 例）：① 解析侧剔除 + 点名；② **注入缝隔离验证判定侧**（`governancePaths:["**"]` ⇒ `governance.hit === false`）；③ 生产形（治理根 == 仓库根）下 architect 拒 / builder 放行 / planner 拒；④ 默认清单（代码兜底）不含机制面条目。
  4. **判别力自证**（隔离副本，8 个变异体全部被守卫抓到）：M7 去掉判定侧排除 ⇒ 该用例红；M8 去掉解析侧剔除 ⇒ 该用例红（另 M1–M6 见 §3）。
  5. 全量回归 `bun test tests/` ⇒ **1133 pass / 1 skip / 0 fail**（32 文件）。

## 3. critic（第 2 轮 = 复审，只判 BLOCKER 闭合）

- **结论原文**：`# 审查结论：APPROVE` / `mergeable: yes` / `scope_exceeded: true`
- **BLOCKER 闭合判定**：**闭合**（复推了 architect 加 `"lib"` 的完整攻击路径：双命中两支均被 `isMechanismPath` 排除 ⇒ `gov.hit=false` ⇒ 仓库内分支 ⇒ architect 的 allow 不命中 ⇒ 拒）。
- **待裁决点（build 选型）**：critic 第 1 轮建议「机制面条目 ⇒ 整份判损坏 → 回退默认」；build 实现为「**剔除 + 点名告警**」（理由：洞已由判定侧结构性闭合 ⇒ 整份拒收会让配置里的合法新增条目一并失效 ⇒ 治理面属性静默反转，正是本 change 其它守卫在防的形态）。**critic 第 2 轮认可该选型**（理由：安全由判定侧结构性承担，解析侧只属卫生与可观测性；告警经 `role-gate.ts` 去重上屏 ⇒ 不静默）。
- **第 2 轮 NITS 处置**：
  - NIT① `governanceWarning` 字段注释未涵盖「机制面条目已剔除（未回退默认）」这一形态 ⇒ **已修**（注释改为并列两种形态，并明写「都不改变判定结果，只保证可见」）。
  - NIT②（**既有观察，scope 外**）双命中语义下若 `prompts/x -> lib/role-policy.ts` 的 symlink 已存在，architect edit `prompts/x` 时 invoked 支命中治理名 ⇒ 放行，而 realpath 支落在 `lib/` 被排除 ⇒ 若宿主 edit 工具跟随 symlink 写真实目标，治理面身份可能被借道到机制文件。**该通道在本 change 之前即存在**（双命中 + invoked 支放行是既有语义），且需要 architect 先有建 symlink 的手段（`shell ln -s` 不在 edit/write 门控内；门控定位本身含「防事故不防绕过」口径）⇒ **记 backlog，不回溯为本轮问题**。

## 4. 判别力自证汇总（隔离副本变异，8/8 全部被守卫抓到）

| 变异 | 预期变红的用例 |
|---|---|
| M1 去掉核心集检查 | AC3 |
| M2 `decideWrite` 吃内置默认清单 | AC2 |
| M3 默认清单少一条核心条目 | AC3② |
| M4 清单从项目根读（读根 ≠ 治理根） | AC5 |
| M5 兜底退化成空清单 | AC1 |
| M6 清单被缓存 | AC2 |
| M7 去掉判定侧机制面排除 | 机制面禁区 |
| M8 去掉解析侧机制面条目剔除 | 机制面禁区 |

## 5. 自指审查声明

本改动的**治理面**部分触及 `prompts/build.md` 的「治理面作用域」表（**表格行增删**）与 `docs/MULTI-AGENT-DESIGN.md` §2.7 的对应投影 —— 即**审查口径表本身**。⇒ 按 `prompts/build.md` §审查配对 的自指审查条：审查实例跑的是**旧版契约**（旧表里没有 `governance-paths.json` 这一行）⇒ 本记录**不构成该行自身的独立证据**；该行的正确性另由 `tests/config-guards.test.ts` 的守卫族（AC8 对应面）与本 change 的 `AC8` 验收用例承担。

## 6. 遗留清扫（本 change 范围内）

- `lib/role-policy.ts`：无 TODO / 半截实现 / 临时日志 / 注释掉的代码 / 未替换的 mock / 临时 fallback 分支。
- `plugins/role-gate.ts`：无。
- `tests/**`：无。
- **backlog（本 change 不做，明确登记）**：
  1. 宿主 edit/write 工具对 symlink 文件是否**跟随写入真实目标**（决定 critic 第 2 轮 NIT② 的观察是否实际可达）—— 需调研宿主行为后再定。
  2. `proposal.md` 的「影响面」清单未列 `docs/MULTI-AGENT-DESIGN.md`（critic 判为 NITS：下次同步投影时补登，防后续 change 漏判投影义务）。
