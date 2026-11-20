# commit-gate 回滚路径演练（隔离副本，2026-11-20）

> **判据来源**：`docs/adr/ADR-commit-verification-gate.md` 的「回滚路径（三步，**不可只退一半**）」与 **V12**（「三步回滚后 `bun test tests/` 绿」）。
> **动机**：critic 第 2 轮指出「回滚路径未含 doctor ⇒ V12 不可执行」，本 drill 回答**完整清单是什么**、以及**「改回原措辞」能不能整文件还原**。
> **纪律**（本次事故固化）：演练全部在**隔离副本** `/tmp/opencode/rollback-drill` 里做 —— 绝不在宿主正在加载的 `lib/` / `plugins/` 路径上动手（否则宿主会缓存坏实例，见 CHANGELOG v2.52）。

## 0. 方法与基线

- 副本 = `git clone /home/ubuntu/.config/opencode`（HEAD `3e6bcad`）。
- 补一个 gitignored 运行态文件（`.rddf/state/role.json`），否则 `SUBAGENT-ORCHESTRATION.md 路径存在` 守卫因「克隆副作用」假红。
- **基线（副本、未改动）**：`996 pass / 1 skip / 0 fail`（与线上一致）。
- 对照组：另建 `/tmp/opencode/control`（同 HEAD、未改动）⇒ `tests/config-guards.test.ts` 125 pass / 0 fail。
- 「门禁落地前」的基线提交 = `2ab546e`（`4b31d19` 的父，即引入门禁前的状态）。

## 1. 七次实验（全部实测，A–G）

| # | 实验 | 结果 | 结论 |
|---|---|---|---|
| **A** | 只删 doctor 的 4 件，**不同步** `config-guards` 的 EXPECTED 清单 | `1 fail`：`新增文件闸门 → lib/ 清单里的文件不存在了：commit-gate-doctor.ts` | ADR 新增的那句「**并同步** EXPECTED 清单」**必要且正确** |
| **B** | 三步回滚，但 `prompts/build.md` / `docs/MULTI-AGENT-DESIGN.md` / `opencode.jsonc` 用 **`git checkout <旧提交> -- <文件>` 整文件还原** | `11 fail`：5 条属机制真回滚（落点完整性锚点、EXPECTED 2 项、d9 三处登记 4 条）+ **4 条与门禁无关**（模型清单 / 能力面块 / `rdd-skills` 同步）+ 2 条混合 | **「改回原措辞」不能整文件还原** —— 会把门禁之后的**无关变更**一起回退 |
| **C** | **只回滚机制**：删 9 件机制文件 + 同步 EXPECTED 3 项 + 移除「治理面落点完整性」守卫整块；**保留** ADR 与 `tests/commit-gate-d9-registration.test.ts` | **`783 pass / 0 fail`** | **V12 可达**（在该清单下）✔ |
| **D** | 在 C 基础上**再删** `tests/commit-gate-d9-registration.test.ts` | `1 fail`：`ADR-commit-verification-gate V10 宣称为机械载体的路径真实存在（改名 ⇒ 悬空必红）` | ADR **保留** ⇒ 它的三处登记守卫**必须保留** |
| **E** | 步骤 1 用 `git checkout 2ab546e -- opencode.jsonc` 还原配置 | **无变化（静默无效）** | `opencode.jsonc` 是**符号链接** ⇒ 还原链接不还原目标 |
| **F** | 步骤 1 改为还原**目标**文件 `opencode.jsonc.opencode-go` | `8+ fail`（含 `git commit * 应为 allow`、以及 `找不到 agent: plan-worker` —— 旧配置早于该 agent） | 步骤 1 也必须**逐条改**，且**改目标文件** |
| **G** | 删 `.rddf/commit-gate.json`（门禁声明），不动守卫 | `1 fail`：`缺门禁声明（未声明的仓库不设门禁）` | **删声明必须同批改那条守卫**（演练 C 未覆盖 ⇒ 未实测路径） |

## 2. 「C 的完整清单」（V12 可达的最小充分集，实测）

**机制文件（9 件，删）**

```
plugins/commit-gate.ts
lib/commit-gate.ts
lib/push-gate.ts          ← ADR 现在的 step 3 漏了这件（插件 import 它）
lib/commit-gate-doctor.ts
scripts/commit-gate-doctor.ts
tests/commit-gate-doctor.test.ts
tests/commit-gate-plugin.test.ts
tests/commit-gate.test.ts   ← ADR 未列（它 import lib/commit-gate.ts，留着则 import 失败）
tests/push-gate.test.ts     ← ADR 未列（同上）
```

**守卫期望同批复原（`tests/config-guards.test.ts`）**

- 「新增文件闸门」EXPECTED 移除 3 项（`commit-gate.ts` / `push-gate.ts` / `commit-gate-doctor.ts`）；
- 「治理面落点完整性」守卫**整块移除**（它断言的是 build.md / MAD 的门禁措辞，措辞回退后必红）；
- 「build 的 shell：`git commit *` ⇒ allow」一条**同批改回 `ask`**（实测 F）；
- **保留** `tests/commit-gate-d9-registration.test.ts` 与 V10 载体守卫（ADR 与 MAD §2.8.8 保留 ⇒ 三处登记仍成立；删它 ⇒ 实测 D 红）。

**明确不做**：整文件还原 `prompts/build.md` / `docs/MULTI-AGENT-DESIGN.md` / `opencode.jsonc`（实测 B / F 各触发无关红）。

## 3. 未实测的残留（如实登记）

- **步骤 2 的「逐段改措辞」未手工执行**：只移除了断言这些措辞的守卫（C 的清单里）。**推断**逐段改不会引入新红 —— 依据：B 里的 4 条无关红全部来自「与门禁无关的段落被整文件回退」（模型清单 / 能力面块 / 技能清单 / agent 取值），而逐段改不触碰这些段落。**该推断未用实测闭合。**
  ⇒ **已闭合（2026-11-20，见 §5）**：步骤 1/2 清单化后由 `rollback-drill` 在隔离副本实跑 ⇒ 推断成立。
- **`.rddf/commit-gate.json`**：回滚路径的原稿未提它；实验 **G** 证明「删它而不改守卫 ⇒ `缺门禁声明` 红」⇒ 订正后的 ADR 写明**保留**（插件退役后 `readDeclaration` 不再被调用 ⇒ 惰性无害），若确要删则须同批改那条守卫（**未实测**分支）。

## 4. 对 ADR 回滚路径的订正建议（**未应用**，需评审）

1. **步骤 1**：改为「**逐条**改 `opencode.jsonc` 的**目标文件**（本仓是符号链接 ⇒ `opencode.jsonc.opencode-go`）」：`git commit` / `git commit *` ⇒ `ask`；移除 force-push 八条 deny。**不得整文件还原**（旧版早于 `plan-worker` 等 agent ⇒ 实测 8+ 红）。
2. **步骤 2**：改为「**逐段**改」build.md（§输出 commit 两条 → 旧一条；点名条款；角色矩阵 `builder` 行；增强层 commit 契约）与 MAD（§3.4 / §2.6 / §4.4.1）。**不得整文件还原**（实测 4 条无关红）。
3. **步骤 3**：文件清单补全为上面的 **9 件**；「同批」补「EXPECTED 3 项 + 落点完整性守卫整块 + `git commit *` = allow 断言」；**保留** d9-registration 守卫（ADR 保留 ⇒ 三处登记仍成立）。
4. 新增一条：`.rddf/commit-gate.json` 删或注明（见 §3）。

## 5. 后续：步骤 1/2 清单化并实跑（2026-11-20）

§4 的 4 条订正**已应用**到 ADR（commit `98c7874`）；**步骤 1/2 的逐段清单**在 v2.54 的 `rollback-drill` 落地后补齐，并在隔离副本实跑：

- **清单**：`.rddf/rollback/commit-gate.json` —— `delete` 9 件 + `edits` 29 条（步骤 1/2 = 25 条；步骤 3 的守卫期望 = 4 条）。
- **判据**：每条 `edits.find` 必须**恰好出现 1 次**（`lib/rollback-drill.ts::planDrill`），两阶段（全内存模拟 → 全量落盘）⇒ 清单漂移即红，不会静默 no-op。
- **命令**：`bun scripts/rollback-drill.ts .rddf/rollback/commit-gate.json` ⇒ **PASS**。
- **结果**：隔离 clone 里 `bun test tests/` ⇒ **809 pass / 0 fail**（24 文件）；`check-upstream-anchors.sh` ⇒ **29/29**（该脚本校验上游源码语义锚点，与本仓回滚无关，仅作同批复跑记录）。
- **`--keep` 检视副本**：9 件机制文件已删；保留项（`tests/commit-gate-d9-registration.test.ts` / `.rddf/commit-gate.json`）仍在；`git diff --stat` = 17 文件 / +35 / −2609。
- **drill 额外暴露的保留项（原 §4.2 未列）**：
  1. `MAD §3.4` 的 **D9⑯ 指针行**必须保留 —— `commit-gate-d9-registration.test.ts` 的 AC5 以「§2.8.8 之外仍提到 D9⑯」为前提，删 ⇒ 该用例红；
  2. 步骤 2 的覆盖面比 §4.2 更宽：`capability:build` 机读块（派生自配置 ⇒ 必须 `allow-ask`）、`no-role` 行、MAD §4.4.3 与版本摘要行、`lib/delegate-core.ts` 后端 brief、`docs/dual-session-delegation.md`、父篇 ADR 的 `:43` / 修订行、`tests/role-exemptions.test.ts` 的 D5② 头注释 —— 都是同一批措辞的投影，漏一处即留悬空引用（未必变红，但回滚不完整）。
  3. 父篇 ADR 的修订行原有的**表格断裂**（行尾多出一个 `|`）在回退时顺带修掉。
- **已知观测（未修，记录在案）**：`bun scripts/commit-gate-doctor.ts` 与 `bun test tests/` **并行**跑时曾报 `FAIL: 宿主插件列表里没有 plugins/commit-gate.ts`，**串行重跑即 PASS**（2026-11-20 实测 1 次）。⇒ 后续核对门禁时**不要与套件并行**；doctor 侧「宿主可达但列表缺项」与「枚举失败」的区分待单独立项（本批不动 doctor：行为未受影响，改它的判定面属另一 change）。
- **用例数差（28 文件 → 24 文件、1022 pass → 809 pass）逐项对账**（不是静默 skip）：
  - 删掉的 4 个测试文件 = `tests/commit-gate.test.ts` / `commit-gate-plugin.test.ts` / `commit-gate-doctor.test.ts` / `push-gate.test.ts`，单独跑 ⇒ **213 tests / 212 pass / 1 skip**（那一 skip 是 doctor 的「宿主可达/不可达」互斥对里的另一半）⇒ `1022 − 212 = 810` **pass**、`1 → 0` **skip**；
  - `tests/config-guards.test.ts` 的「治理面落点完整性」整块被删 ⇒ 再 **−1** ⇒ **809 pass / 0 skip**。两处相加与 clone 实跑完全吻合。
- **边界判定登记（critic 提示）**：`tests/real-repo-git-budget.test.ts:5` 的注释也提到「卡住工具层验证门」，但那是**引用门禁的失败后果**（用例超时 = 门禁假红），不是「提交由验证门决定」这一执行点措辞，且出自 `0dbfdf7`（早于本批）⇒ **不纳入回滚清单**。与已纳入的 `role-exemptions.test.ts` 头注释的差别在于：后者复述的是**约定本身**（D5② 的闭合状态），不回退即失真。
