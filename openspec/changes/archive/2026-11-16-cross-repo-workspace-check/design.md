# Design — cross-repo-workspace-check

> 判据真源：`proposal.md` 的「## 验收标准」（AC1–AC11）。
> 实施计划：`.rddf/plans/cross-repo-workspace-check.md`（TDD 5 步）。
> ⚠ 本篇由**执行者（builder）**补写（proposal 头注已声明「planner 不写」）。

## D1 — 清单落 `.rddf/config/workspace.json`

沿用本仓既有项目配置先例（`.rddf/config/arch-docs.json`）。⚠ 与产品侧的 `.rddf/config.json`（**文件**，`_lib/config.py::load`）**不是同一套** —— 产品侧不会读本文件，完整性只由脚本自身的校验 + 测试承担。

## D2 — 清单是**声明式**的：仓 + 核对项都在清单里

清单含两部分：

- `repos[]`：`id` / `url` / `canonical_path` / `required`
- `checks[]`：`id` / `consumer` / `producer` / `consumer_cmd` / `producer_cmd` / `consumer_filter` / `producer_filter`

**取数命令写在清单里（argv 数组），不写死在脚本里** —— 理由是**可测性**：命令若写死，DRIFT / ENV / 「过滤后为空」三支只能对着真实产品仓构造 ⇒ 离线不可测、且改动产品仓就可能让本仓测试变红。放在清单里后，fixture 用假仓 + 假命令走**同一条代码路径**，五支都可离线验。

**命令用 argv 数组而不是 shell 串** ⇒ 没有注入面，也没有引号转义问题。

> 与初版 proposal 的一处偏差（实施对齐）：初版 AC3 写「取数命令写死在脚本里」。实施中改为清单声明 —— 判据意图（比较粒度 = 整行逐字）不变，变的是**命令的位置**。proposal 已同步。

## D3 — `canonical_path` 必须是绝对路径；`.` = 本仓自身

外部仓的路径本就是本机约定 ⇒ 绝对路径。**唯一例外**：本仓自身用 `"."`（解析为脚本所在仓的根）—— 否则清单要写死 `/home/ubuntu/.config/opencode`，换机器即失效。其余相对路径**一律拒绝**（基准歧义 ⇒ 判不了身份）。

## D4 — 身份校验两条件：`realpath == toplevel` **且** `remote.origin.url == url`

- 只判「是不是 git 工作树」**不够**：`git -C <仓内子目录> rev-parse --is-inside-work-tree` 同样返回 true ⇒ 清单指向 `rdd-workflow/_lib` 也能「通过」。改用 `realpath(canonical_path) == realpath(show-toplevel)` ⇒ 子目录、另一个 checkout 都被判出。
- `remote.origin.url` 比较**先归一**（去 scheme / 去 user / `:`→`/` / 去 `.git` / 小写）⇒ `ssh://git@github.com/org/repo.git` 与 `git@github.com:org/repo.git` 视为同一个 ⇒ 换协议不误判，但**指向另一个仓**必判出。

## D5 — 四档结论 + 四个出口码；**ENV 先于 DRIFT**

`OK`(0) / `SKIP`(0) / `CONFIG`·`USAGE`(1) / `DRIFT`(2) / `ENV`(3)。

**ENV 先于 DRIFT**：ENV 意味着「有一项没评上」⇒ 本次结论**不完整**；此时即便另一项已漂移，也应先让人修环境（且漂移信息仍打印，不丢）。这与验收侧「取证不可用 ⇒ 不得判 pass」同构。

末尾固定一行 `RESULT: <OK|SKIP|DRIFT|ENV|CONFIG|USAGE>` ⇒ 可 grep（漏跑可被外部核）。

## D6 — 比较粒度 = **整行逐字**

含 `owns: ` 前缀与 `, ` 分隔符，逐字比。粒度写死 ⇒ 将来重构渲染函数（换前缀 / 换分隔符）会被**如实判红**，而不是被「宽松归一」悄悄放过。

## D7 — 只读

不写两仓文件、不 `fetch`、不 `checkout`。python 侧强制 `python3 -B` + `PYTHONDONTWRITEBYTECODE=1` —— `__pycache__` 被 gitignore 藏住，**不强制就验不出「已写盘」**（只读断言要靠 `--ignored` 快照才看得见）。

## D8 — `required:false` 的两层跳过

- **仓级**：路径不存在 ⇒ 打 `SKIP [repo] <id> <原因>`（库存行，不影响结论）。
- **核对项级**：某核对项依赖的仓未就绪 ⇒ 该项**未评估** ⇒ 不计入一致 ⇒ 整体 `RESULT: SKIP`（不是 `OK`）。

这条是 D5 的关键补丁：**「没评」不能算「一致」**。

## D9 — 测试用假 git 仓

`tests/verify_cross_repo_check.sh` 在 `/tmp/opencode` 造两个假 git 仓（各含一个 `owns.txt` + `remote.origin.url`），覆盖 OK / DRIFT / ENV（缺仓 / 子目录 / remote 不符 / 命令失败 / 过滤为空）/ SKIP / CONFIG 六类分支，另加只读性快照（`git status --porcelain --ignored` + `__pycache__` 集合前后一致）。

## D10 — 退出码与 `scripts/check-upstream-anchors.sh` 对齐

同在 `scripts/` 目录下，`exit 2` **不得有两套含义** —— 那边的 `2` 是「漂移」⇒ 本脚本的漂移也用 `2`，ENV 另开 `3`，并在脚本头部写对照表。

## 非目标（不在本 change）

不接 CI（无 `.github/`，私有仓 clone 需凭据）；不判 pin 陈旧（不联网）；不处理「漏跑」（变更期提醒，另立项）；不处理「跨仓同改的流程」；不改 `lib/delegate-core.ts:962-964` 的注释（脚本存在后依然为真）；不加第二项核对（产品仓无 allow 侧真源 ⇒ 不虚构判据）。
