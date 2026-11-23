# cross-repo-workspace-check — 跨仓工作区清单与一致性核对

> 5 段草稿（Why / What Changes / Acceptance / Capabilities / Impact）。planner 产出。
> 来源：用户 2026-11-16 提问「把 `rdd-workflow` / `rdd-workflow-e2e` 做为本仓子项目，方便跨仓工作吗」——结论 **不做 submodule**，改走「工作区清单 + 一条核对命令」。
> 关联遗留：`docs/guard-authoring.md` §6「跨仓那半无 CI 守卫（人工 diff，`diff` 命令见 §6.1）」、`.rddf/reviews/session-handoff-20261114.md` §7。
> 关联 ADR：无 —— 本方案**不改变** `docs/front-delegate-architecture.md` §2.3 的「4 个独立 git 仓库」边界。
> planner 审查：metis 1 轮 —— `.rddf/reviews/cross-repo-workspace-check-planner-review.md`（P0×5 / P1×5 / P2×4 findings 的逐条处置）
> 执行路径预估：**常规 change**（新增 `scripts/**` + `tests/**` + 项目配置文件 + `docs/guard-authoring.md` 三处指向；不动 `lib/**`、不动 `prompts/**` ⇒ 非治理面）。
> **实施状态**：✅ **已归档**（2026-11-16）⇒ `openspec/changes/archive/2026-11-16-cross-repo-workspace-check/`（逐条判据以该 proposal 的 AC 表为**唯一真源**；**验收报告 = `.rddf/reviews/cross-repo-workspace-check-verify.md`**；本文只保留**动机与机制**）。

## Why

跨仓真正的痛点**不是「找不到另一个仓」**，而是「两仓清单的一致性只能靠人工 `diff`」。`docs/guard-authoring.md` §6 已把三种做法逐一判过：在本仓守卫里直接读另一仓 ⇒ CI 必然 SKIP（等于没有守卫）；两边各自钉自己那半 ⇒ 覆盖不到「两仓之间」；于是只剩人工 `diff`。现有命令（§6.1）要手工切两次目录 + 三行重定向，两种失效模式全部**无提示**：

| 失效模式 | 现状 | 后果 |
|---|---|---|
| cwd 错 | 命令里两处 `cd` 靠手抄 | 拿到的是另一个 checkout 的清单 |
| 缺仓 / 执行失败 | 命令报错或输出空 ⇒ 与「两侧不一致」混同 | **假绿**：把环境故障读成业务结论（或反之） |

（第三种「漏跑」不在本方案射程 —— 它要的是变更期提醒，见 `Impact` 的边界登记。）

**为什么不用 submodule（记录判据，避免以后重复提出）**——三条都是本仓自己的机制：

1. **状态根语义对撞**：`lib/delegate-core.ts::canonicalRoot`（ADR-canonical-root-normalization D1）规定 submodule 下 `stateRoot = superproject`；产品侧 `_lib/cli/__main__.py`（ADR-0033）规定 submodule 用自己的 toplevel。两者相反 ⇒ 同一棵目录树上并存两套状态根。
2. **变更检测被污染**：`lib/delegate-core.ts` 用 `git status --porcelain` 与 `git diff --name-only <base>`；submodule 工作树脏 / 指针移动会作为「本 change 的变更」出现 ⇒ scope 与 verifier 取证失真。
3. **安装链被静默改写**：`~/.agents/skills/*` 是指向源码 checkout 的 symlink；`git submodule update` 一变 commit，`rddf` 实际运行的版本就换了，无提示。

且 submodule 换不来「少开 PR」（指针 bump 仍是独立提交），也帮不上 e2e（它测的是 `~/.agents/skills/rdd-workflow` 安装副本，fixture 路径硬编码 `/workspace/main/rdd-workflow-e2e-*`）。

## What Changes

1. **`.rddf/config/workspace.json`** —— 仓清单：`schema_version` + `repos[]`（`id` / `url` / `canonical_path` / `required`）。**只作清单，不含命令**。无消费者的字段不入表（`role` 已删）。
2. **`scripts/cross-repo-check.sh`** —— 一条命令完成核对，四段判定：
   - **清单校验**（`python3` 读 JSON）：非法 JSON / `repos` 缺失或为 `[]` / `id` 重复 / 缺 `url` / `canonical_path` 为相对路径或含 `~` / `schema_version` 主版本不认识 ⇒ **`RESULT: CONFIG` / exit 1**。
   - **身份校验**（每仓）：`realpath(canonical_path) == git -C <path> rev-parse --show-toplevel` **且** `remote.origin.url == url`。`required:true` 不满足 ⇒ **`RESULT: ENV` / exit 3**；`required:false` ⇒ 打 `SKIP [id] <原因>`，**该仓相关核对项标记未评估，不计入一致**。
   - **核对项 1（verifier 写集 `owns:`）**：本仓 `verifierWriteSetBlock()` 的 `owns:` 行 ↔ 产品仓 `_lib/verifier/state_paths.py::SKILL_OWNS_PATHS`，比较粒度 = **整行逐字**（含 `owns: ` 前缀与 `, ` 分隔符）。任一侧命令非零退出 / 导入失败 ⇒ **exit 3**（不得与漂移混同）。
   - **结论**：两侧一致 ⇒ **exit 0**；`diff -u` 有差异 ⇒ **exit 2**。**两个分支都打印两仓 `HEAD` sha**。
   - 末尾固定输出 `RESULT: <OK|SKIP|DRIFT|ENV|CONFIG|USAGE>`（可 grep ⇒ 漏跑可被外部核）。
   - 全程只读：不写两仓文件、不 `fetch`、不 `checkout`；python 侧强制 `-B` / `PYTHONDONTWRITEBYTECODE=1`（`__pycache__` 会被 gitignore 藏住，不强制就验不出「已写盘」）。`--workspace <file>` 覆盖清单路径。
   - **退出码与 `scripts/check-upstream-anchors.sh` 对齐**：`0` OK/SKIP、`1` 用法错误、`2` 漂移；`3` = ENV 为本脚本新增档（脚本头部写对照表）。
3. **`tests/verify_cross_repo_check.sh`** —— 在 `/tmp/opencode` 造两个假 git 仓 + 一份清单，覆盖 `OK / DRIFT / ENV / SKIP / CONFIG` 五支（本仓已有 `tests/verify_*.sh` 惯例）。
4. **`docs/guard-authoring.md`** 三处指向：§6 表格「人工 diff」→ 脚本；§6.1 改为「**脚本为准**，下面是脚本不可用时的手工等价式」；§7 核对单加一行「改 `owns:` 清单 ⇒ 跑 `scripts/cross-repo-check.sh`」（只动 `docs/**`，**不进 `prompts/**`** ⇒ 不触发治理面审查）。

**明确不做**：

- 不新增 CI 工作流 —— 本仓无 `.github/`，私有仓 clone 需凭据；定位是**本地门 + 取证**。
- 不判「pin 是否陈旧」—— 不联网只判「**当下**两侧是否一致」；陈旧 pin 的一致**不蕴含**上游没漂。
- 不处理「漏跑」（改了一侧忘记跑）：那条要变更期提醒，另立项。
- 不处理「跨仓同改的流程」（谁先谁后 / 一处改动两处落点）：仍靠 `docs/MULTI-AGENT-DESIGN.md` 的人工约定。
- e2e 仓只**登记**（`required:false`、无核对项）—— 输出里必然出现一行 `SKIP`，不留无声的绿。
- 不改 `lib/delegate-core.ts` 的「同步是人工的」注释（该注释在脚本存在后仍然为真）。

## Acceptance

- [ ] **缺仓**：清单里把某条 `canonical_path` 指向不存在路径 ⇒ `RESULT: ENV` / **exit 3**，输出含 `id` + 期望路径 + clone 命令（不得 exit 2）
- [ ] **漂移**：fixture 里篡改一侧 `owns:` 行 ⇒ `RESULT: DRIFT` / **exit 2** + `diff -u` 两侧原文
- [ ] **执行失败 ≠ 漂移**：把产品侧 python 命令换成 `exit 1` 的影子脚本 ⇒ **exit 3**（不是 exit 2）
- [ ] **身份校验**：`canonical_path` 指向仓内子目录（如 `/workspace/main/rdd-workflow/_lib`）⇒ **exit 3**；指向 e2e 仓路径但 `url` 是 rdd-workflow ⇒ **exit 3**
- [ ] **清单腐坏**：`repos: []` / 非法 JSON / `id` 重复 / `canonical_path` 为相对路径 ⇒ `RESULT: CONFIG` / exit 1（`repos: []` **不得** exit 0）
- [ ] **一致**：本机当前状态实跑 ⇒ `RESULT: OK` / exit 0，且输出里**同时**出现两仓 `HEAD` sha
- [ ] **只读**：运行前后两仓 `git status --porcelain --ignored` 输出与 `__pycache__` 集合不变
- [ ] **SKIP 可见**：`required:false` 且缺失的仓 ⇒ 输出 `SKIP [id]`，且该行不被计入一致结论
- [ ] `bash -n scripts/cross-repo-check.sh` 通过；`tests/verify_cross_repo_check.sh` 五支全绿
- [ ] 本 change 不改 `lib/**` / `prompts/**`（`git diff --name-only <base>` 可核）

## Capabilities

- 一条命令核对跨仓清单，不再依赖人工 `cd` 两次 + 三行重定向。
- 四态可判别且**可 grep**：`OK`（一致 + 双 sha）/ `DRIFT`（exit 2 + diff）/ `ENV`（exit 3 + 缺什么）/ `SKIP`（显式未评估）/ `CONFIG`（清单本身坏）。「缺仓」「执行失败」不再与「一致」或「不一致」混同。
- 清单条目从装饰变成判据：`url` 参与 remote 身份校验 ⇒ 指向另一个 checkout / 子目录可被判出。
- 验收报告可贴两个 `HEAD` sha ⇒ 一致性结论能追溯到「对着哪两个 commit 判的」。
- 新增核对项的代价明确：脚本里加一个函数 + 一条 AC（**不**宣称已支持任意扩展）。

## Impact

- 新增文件：`.rddf/config/workspace.json`、`scripts/cross-repo-check.sh`、`tests/verify_cross_repo_check.sh`；既有文件改动仅 `docs/guard-authoring.md` 三处指向（§6 表 / §6.1 / §7）。
- 兼容性：无公开符号变更、`lib/**` 零改动 ⇒ 既有 `bun test` 期望零影响。
- 风险：
  - `canonical_path` 是**本机约定**（`/workspace/main/*`）；换机器要么改清单，要么 `--workspace` 覆盖。清单与机器的绑定关系由身份校验（`url` + `show-toplevel`）兜住，不再靠人。
  - 核对项目前只有 `owns:` 一项；产品仓**没有** allow 侧真源（实测无 `SKILL_ALLOW_ROOTS`）⇒ 不虚构第二项。
  - 依赖 `python3`（本仓既有脚本风格已用）+ `bun`；缺失计入 ENV，不算漂移。
  - 「漏跑」与「跨仓同改流程」不在射程（见「明确不做」）⇒ 下次提到这俩不要当成本 change 的漏项。
