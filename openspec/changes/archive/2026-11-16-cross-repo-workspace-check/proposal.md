# cross-repo-workspace-check — 跨仓工作区清单与一致性核对

> 输入：`.rddf/improvements/cross-repo-workspace-check.md`（5 段草稿，metis 1 轮审后修订；**机制细节以该文件为准，本 proposal 只保留判据，不复制**）
> planner 审查：`.rddf/reviews/cross-repo-workspace-check-planner-review.md`（metis 16 条 finding 逐条处置）
> 来源：用户 2026-11-16「rdd-workflow / rdd-workflow-e2e 是否做本仓子项目」——结论**不做 submodule**（三条硬冲突见 improvement 的 Why），改走清单 + 核对脚本
> 性质：**新增本地核对工具**，无公开 API 变更、无 `lib/**` / `prompts/**` 改动
> ⚠ **本路径未启用 `rdd-planner` / `rdd-builder`**：canonical 前置（`.rddf/state/.{arch,planner}-handoff.json`）不存在 ⇒ 走**内置流程**。`design.md` / `tasks.md` 由本节 change 的执行者（builder）补，planner 不写。

## Why

`docs/guard-authoring.md` §6 已判定：跨仓事实（本仓常量 ↔ 产品仓清单）**无法进 CI**（另一仓在用户 home），只能「各自钉自己那半 + 人工 `diff`」。§6.1 给了那条 `diff` 命令，但它是手工命令 —— 两种失效模式都无提示，且**互相伪装**：

| 失效模式 | 现状 | 后果 |
|---|---|---|
| cwd 错 | 命令里两处 `cd` 靠手抄 | 拿到的是另一个 checkout 的清单 |
| 缺仓 / 执行失败 | 命令报错或输出空 ⇒ `diff` 必然报差异 | **假红**：把环境故障读成「两仓不一致」，人去改清单 |

反方向同样成立：若把命令写成「失败即跳过」，就变成 §6 警告的「等于没有守卫」。本 change 把这三种状态拆成**可 grep 的四个结论**（`OK` / `DRIFT` / `ENV` / `SKIP`）与**固定退出码**，并给 `canonical_path` 加身份校验（`realpath == show-toplevel` 且 `remote.origin.url == url`）—— 否则清单指向仓内子目录或另一个 checkout 都能「通过」。

**不采用 submodule 的三条判据**（记录在此，避免重复提出）：`canonicalRoot` 的 superproject 状态根（ADR-canonical-root-normalization D1）↔ 产品侧 ADR-0033 的 submodule 自根，两者相反；`git status --porcelain` / `git diff --name-only <base>` 会把子模块脏与指针移动算成本 change 的变更；`~/.agents/skills/*` 是指向源码的 symlink，`git submodule update` 会静默换掉 `rddf` 实际运行版本。

## What Changes

### A. 清单文件 `.rddf/config/workspace.json`

`schema_version` + `repos[]` + `checks[]`：

- `repos[]` 每条 = `id` / `url` / `canonical_path` / `required`。
- `checks[]` 每条 = `id` / `consumer` / `producer` / `consumer_cmd` / `producer_cmd` / `consumer_filter` / `producer_filter`（**取数命令写在清单里**，argv 数组，非 shell 串）。

- **无消费者的字段不入表**（`role` 已删）。
- 目录沿用既有 `.rddf/config/` 约定（`prompts/build.md:224` 的 `arch-docs.json` 是唯一先例）。⚠ 与产品侧 `.rddf/config.json`（**文件**，`_lib/config.py::load`）不是同一套 ⇒ 产品侧不会读本文件，完整性只由 B 段校验 + C 段测试承担。
- 当前清单：`opencode-config`（`canonical_path: "."` = 本仓自身）、`rdd-workflow`（`required:true`，**有核对项**）、`rdd-workflow-e2e`（`required:false`，**仅登记不核对** —— 输出必然带一行 `SKIP`，不留无声的绿）。
- `canonical_path` 一律**绝对路径**；**唯一例外** `"."` = 本仓自身（解析为脚本所在仓的根）—— 否则清单要写死机器家目录，换机器即失效；其余相对路径一律拒绝。

### B. `scripts/cross-repo-check.sh`

四段判定，顺序固定（清单坏 ⇒ 身份坏 ⇒ 核对 ⇒ 结论）：

1. **清单校验**（`python3` 读 JSON）：非法 JSON / `repos` 缺失或为 `[]` / `id` 重复 / 缺 `url` / `canonical_path` 非绝对路径或含 `~` / `schema_version` 主版本不是 1 ⇒ **`RESULT: CONFIG` / exit 1**。
2. **身份校验**：`realpath(canonical_path) == git -C <path> rev-parse --show-toplevel` **且** `git -C <path> config --get remote.origin.url == url`。`required:true` 不满足 ⇒ **exit 3**；`required:false` ⇒ 打 `SKIP [id] <原因>`，该仓核对项标为未评估、**不计入一致**。
3. **核对项 1（verifier 写集 `owns:`）**：消费者 = 本仓 `verifierWriteSetBlock()` 的 `owns:` 行；生产者 = 产品仓 `_lib/verifier/state_paths.py::SKILL_OWNS_PATHS` 渲染的 `owns:` 行。**比较粒度 = 整行逐字**（含 `owns: ` 前缀与 `, ` 分隔符）—— 只有写死粒度，将来重构渲染函数才不会被误判成红。两侧取数命令写在**清单**里（argv 数组，无 shell 串 —— 见 design D2：命令若写死在脚本里，DRIFT / ENV 三支只能对着真实产品仓构造 ⇒ 离线不可测）。任一侧命令非零退出 / 导入失败 / 过滤后为空 ⇒ **exit 3**（不得与漂移混同）。
4. **结论**：一致 ⇒ **exit 0** + `RESULT: OK`；`diff -u` 有差异 ⇒ **exit 2** + `RESULT: DRIFT`。**两个分支都打印两仓 `HEAD` sha**。末尾固定一行 `RESULT: <OK|SKIP|DRIFT|ENV|CONFIG|USAGE>`。

**退出码与 `scripts/check-upstream-anchors.sh` 对齐**：`0` OK/SKIP、`1` 用法错误、`2` 漂移；`3` = ENV 为本脚本新增档。同一 `scripts/` 目录里 `exit 2` 不得有两套含义 ⇒ 头部写对照表。

**只读约束**：不写两仓文件、不 `fetch`、不 `checkout`；python 侧强制 `-B` / `PYTHONDONTWRITEBYTECODE=1`（`__pycache__` 被 gitignore 藏住，不强制就验不出「已写盘」）。`--workspace <file>` 覆盖清单路径（供测试与本机多 checkout 使用）。

### C. `tests/verify_cross_repo_check.sh`

在 `/tmp/opencode` 造两个假 git 仓（各含一个最小 `owns:` 文本 + 一份清单），覆盖 **OK / DRIFT / ENV / SKIP / CONFIG** 五支。仓内已有 `tests/verify_*.sh` 惯例（`tests/verify_arch_docs_scope.sh`）。

### D. `docs/guard-authoring.md` 三处指向

§6 表格「人工 `diff`」行改为本脚本；§6.1 改为「**脚本为准**，下面是脚本不可用时的等价手工式」（避免两份并列真源）；§7 核对单加一行「改 `owns:` 清单 ⇒ 跑 `scripts/cross-repo-check.sh`」。**只动 `docs/**`，不进 `prompts/**`** ⇒ 不触发治理面审查。

## 验收标准

| AC | 判据 | 类型 | 证据载体 |
|---|---|---|---|
| AC1 | `.rddf/config/workspace.json` 通过 B.1 全部校验；构造任一违例（`repos: []` / 非法 JSON / `id` 重复 / 相对 `canonical_path`〔`.` 除外，见 A 段〕）⇒ `RESULT: CONFIG` / **exit 1**；**`repos: []` 不得 exit 0** | 结构 | `tests/verify_cross_repo_check.sh` + 本机实跑 |
| AC2 | 身份校验三支均为 exit 3：① `canonical_path` 指向不存在路径；② 指向仓内子目录（`/workspace/main/rdd-workflow/_lib`）；③ 路径是 `rdd-workflow-e2e` 但 `url` 写 `rdd-workflow`。`required:false` 且缺失 ⇒ 输出 `SKIP [id]` 且该行**不计入一致** | 结构 | 同上 |
| AC3 | 核对项 1 的比较粒度是**整行逐字**（`owns: ` 前缀 + `, ` 分隔符）；两侧取数命令写在**清单**里（`consumer_cmd` / `producer_cmd`，argv 数组）；改任一侧的一个字符 ⇒ 必红 | 结构 | 清单 + 脚本 + fixture |
| AC4 | **ENV ≠ DRIFT**：把产品侧取数命令替换为 `exit 1` 的影子 ⇒ `RESULT: ENV` / **exit 3**，不是 exit 2 | 结构 | fixture ENV 支 |
| AC5 | 一致 ⇒ `RESULT: OK` / exit 0，输出含**两仓** `HEAD` sha | 结构 | 本机实跑 |
| AC6 | 漂移 ⇒ `RESULT: DRIFT` / exit 2 + `diff -u` 两侧原文 + **两仓** `HEAD` sha | 结构 | fixture DRIFT 支 |
| AC7 | 只读：运行前后两仓 `git status --porcelain --ignored` 输出与 `__pycache__` 目录集合不变 | 结构 | 运行前后快照 |
| AC8 | 脚本头部含依赖声明（`bash` / `python3` / `bun`）+ 退出码对照表（含与 `check-upstream-anchors.sh` 的关系），`--help` 走 `sed -n '2,Np' "$0"` 风格（与 `check-upstream-anchors.sh` 同形，不另写一份帮助文本） | 结构 | 头部文本 |
| AC9 | `tests/verify_cross_repo_check.sh` 五支全绿；`bash -n` 对两个脚本通过 | 结构 | 测试输出 |
| AC10 | 不变量：`git diff --name-only <base>` 只含 `.rddf/config/workspace.json`、`scripts/cross-repo-check.sh`、`tests/verify_cross_repo_check.sh`、`docs/guard-authoring.md`、`openspec/changes/cross-repo-workspace-check/**`、`.rddf/{improvements,plans,reviews}/cross-repo-workspace-check*`；`lib/**` 与 `prompts/**` **零改动**；`bun test tests/` 全绿 | 结构 | git + 全量测试 |
| AC11 | `docs/guard-authoring.md` 三处指向落地：§6 表行改为脚本名、§6.1 首句为「脚本为准」、§7 含「改 `owns:` 清单 ⇒ 跑 `scripts/cross-repo-check.sh`」 | 结构 | `grep` 三处 |

## Acceptance（勾选镜像）

- [ ] AC1 清单校验 + `repos: []` 不得绿
- [ ] AC2 身份校验三支 + SKIP 可见
- [ ] AC3 整行逐字粒度
- [ ] AC4 ENV ≠ DRIFT
- [ ] AC5 一致：OK + 双 sha
- [ ] AC6 漂移：DRIFT + diff + 双 sha
- [ ] AC7 只读（`--ignored` + `__pycache__`）
- [ ] AC8 头部依赖与退出码对照
- [ ] AC9 五支 fixture + `bash -n`
- [ ] AC10 不变量（文件集 + 零碰 `lib/**` `prompts/**` + `bun test` 全绿）
- [ ] AC11 `docs/guard-authoring.md` 三处

## 非目标

- **不接 CI**：本仓无 `.github/`，私有仓 clone 需凭据 ⇒ 定位是本地门 + 取证。
- **不判 pin 陈旧**：不联网只判「当下两侧一致」；一致**不蕴含**上游没漂。
- **不处理「漏跑」**（改了一侧忘记跑脚本）：那是变更期提醒，另立项。
- **不处理「跨仓同改的流程」**（谁先谁后 / 一处改动两处落点）：仍靠 `docs/MULTI-AGENT-DESIGN.md` 的人工约定。
- **不改 `lib/delegate-core.ts:962-964` 注释**：它说的是「仓库 CI 的 `bun test` 不能依赖仓外 skill」，脚本存在后依然为真。
- **不加第二项核对**：产品仓没有 allow 侧真源（实测无 `SKILL_ALLOW_ROOTS`）⇒ 不虚构判据。

## 影响面与风险

- 新增 3 文件 + `docs/guard-authoring.md` 三处指向；`lib/**` / `prompts/**` 零改动 ⇒ 既有 `bun test` 期望零影响。
- 风险：`canonical_path` 是**本机约定**（`/workspace/main/*`）⇒ 换机器要改清单或 `--workspace`；清单与机器的绑定由身份校验兜住，不再靠人。
- 风险：`python3 -B` 是否足以让整条导入链不产 `__pycache__` —— 实施时实测；不足则改为 `PYTHONDONTWRITEBYTECODE=1` 或把 `__pycache__` 计入 AC7 的快照比对。
- 已知未覆盖：核对项只有 1 项；新增一项 = 脚本里加一个函数 + 一条 AC，不宣称通用扩展。

## 依赖与顺序

`A`（清单）必须先把字段定死（AC1/AC2 的判据依赖它）→ `C` 的 fixture 才能写（它要造清单）→ `B` 转绿 → `D` 最后（文档指向依赖脚本存在）。测试先行：`C` 在 `B` 之前落地且初始全红。
