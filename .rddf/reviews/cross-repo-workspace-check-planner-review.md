# planner 审稿：cross-repo-workspace-check（improvement）

> 审查者：metis 1 轮（planner 固定审查者，见 `prompts/build.md` §审查配对）
> 对象：`.rddf/improvements/cross-repo-workspace-check.md`
> 决策基线：用户 2026-11-16 选定「工作区清单 + 核对脚本」，**不做 submodule**（决策本身不重审）

## 判定

metis 返回 P0×5 / P1×5 / P2×4。**其中 3 条会直接产出一个误报或假绿的门**，不是措辞问题：

1. **执行失败被读成漂移**：`bun -e` / `python3 -c` 非零退出 ⇒ 输出空 ⇒ `diff` 必报差异 ⇒ 判 DRIFT。环境故障被路由成「两仓不一致」，人会去改清单。
2. **`repos: []` 一路绿灯**：逐仓循环零次 ⇒ 无失败 ⇒ exit 0。清单坏掉的最典型形态恰好被判成一致。
3. **身份校验太弱**：`git -C <path> rev-parse --is-inside-work-tree` 对**仓内子目录**也返回 true ⇒ 清单指向 `rdd-workflow/_lib` 或另一个 checkout 都能通过。

另有 1 条属论文自相矛盾：`required` 字段无定义、无 AC，而三态判定依赖它。

## 逐条处置

| # | metis finding | 级别 | 处置 | 落点 |
|---|---|---|---|---|
| 1 | `required` 无定义、与三态矛盾 | P0 | **采纳**：`required:true` 缺失 ⇒ ENV(3)；`required:false` ⇒ 打 `SKIP [id]` 且**不计入一致** | What Changes 第 2 段 + AC「SKIP 可见」 |
| 2 | 执行失败 ≠ 漂移 | P0 | **采纳**：非零退出 / 导入失败 ⇒ exit 3；只有 `diff` 有差异才 exit 2 | What Changes + AC「执行失败 ≠ 漂移」 |
| 3 | 身份校验只判「是不是仓」 | P0 | **采纳并加强**：`realpath == show-toplevel` **且** `remote.origin.url == url` | What Changes 第 2 段 + AC「身份校验」 |
| 4 | 退出码与 `check-upstream-anchors.sh` 相反（2 在那边 = 漂移） | P0 | **采纳**：`0` OK/SKIP、`1` 用法、`2` 漂移对齐既有脚本；ENV 另开 `3` 并在脚本头部写对照表 | What Changes 第 2 段 |
| 5 | `workspace.json` 可能是「把一条命令换成另一个文件」（无 loader / validator / 第二读者） | P0 | **部分采纳**：保留清单（用户批准的交付形态），但补最小校验（非法 JSON / `repos` 空 / `id` 重复 / 缺 `url` / 相对路径 ⇒ CONFIG/1）+ 删掉无消费者的 `role`。metis 的「脚本内常量表」备选**记录在案但不采纳**：它把「改清单」退化成「改脚本」，与用户选的形态不同 | What Changes 1 + AC「清单腐坏」 |
| 6 | 漂移分支不打印 sha ⇒ 结论不可复现 | P1 | **采纳**：两个分支都打印两仓 `HEAD` sha | What Changes + AC「一致」 |
| 7 | 「只读」AC 会被 `__pycache__` 骗过（gitignore 藏住） | P1 | **采纳**：python 侧 `-B` / `PYTHONDONTWRITEBYTECODE=1`；AC 改为比 `--ignored` 输出 + `__pycache__` 集合 | What Changes + AC「只读」 |
| 8 | 变红演练路径不可执行（`--workspace` 只覆盖清单，不覆盖仓路径） | P1 | **采纳**：改在 `/tmp/opencode` 造两个假 git 仓 + 清单，落成 `tests/verify_cross_repo_check.sh`（五支） | What Changes 3 + AC 末条 |
| 9 | 「漏跑」列进失效表但零覆盖 | P1 | **采纳**：从失效表删掉（机制上要变更期提醒），并在「明确不做」写明 | Why 表 + 明确不做 |
| 10 | e2e 仓无核对项 ⇒ 「有它但永远绿」的第三种假绿 | P1 | **采纳**：只登记（`required:false`），输出必有 `SKIP [id]` 行 | 明确不做 + AC「SKIP 可见」 |
| 11 | §6.1 与脚本并列会成为两份真源 | P2 | **采纳**：§6.1 改为「脚本为准，下面是等价手工式」 | What Changes 4 |
| 12 | `schema_version` 要么校验要么删 | P2 | **采纳**：主版本不认识 ⇒ CONFIG/1 | What Changes 2 |
| 13 | 脚本头部要写依赖与 `--help` 风格 | P2 | **采纳**：对齐 `check-upstream-anchors.sh`（`sed -n '2,25p' "$0"`） | What Changes 2 |
| 14 | 顺带改 `lib/delegate-core.ts:962-964` 注释指向新脚本 | P2 | **不采纳**：该注释说的是「仓库 CI 的 bun test 不能依赖仓外 skill」，脚本存在后依然为真；且碰 `lib/**` 会把执行路径从「常规 change」推高，收益不成比例 | 「明确不做」末条 |
| 15 | 隐藏意图：「同时改两仓」无替代物 | — | **采纳（登记）**：写进「明确不做」，下次提到不当漏项 | 明确不做 |
| 16 | Capabilities「为后续核对项提供挂载点」是把未兑现的扩展性当成果 | — | **采纳**：改为「新增一项 = 加一个函数 + 一条 AC」，不宣称通用扩展 | Capabilities 末条 |

## 未闭合项（交 builder / 实施时确认）

- `python3 -B` 是否足以让 `from _lib.verifier.state_paths import ...` 不产 `__pycache__`：**需实跑核**（导入链上的模块也写）。若 `-B` 不足，改为 `PYTHONDONTWRITEBYTECODE=1` 或把产品仓 `__pycache__` 计入只读快照比对。→ 已在 AC 里要求「`__pycache__` 集合不变」，实施时以实测为准。
- `remote.origin.url` 在 worktree 场景由 `git -C <path> config --get remote.origin.url` 读取，与清单 `url` 逐字比较（本机为 `git@github.com:chisuhua/rdd-workflow.git`）；若清单写 https 形态会 ENV —— 这是**期望行为**（清单与 checkout 不一致就该停）。
