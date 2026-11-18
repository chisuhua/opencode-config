# commit-gate-d9-three-place-registration —— 审查记录（oracle → critic）

> 判据真源：`openspec/changes/commit-gate-d9-three-place-registration/proposal.md` 的 **AC1–AC13**。
> 审查顺序：**oracle（治理面）→ critic**（按 `prompts/build.md` §审查配对：治理面 / ADR 行）。
> 预算：oracle 1 轮 + critic **2 轮**（第 2 轮只验 BLOCKER 闭合；本 change 的 critic 上限 2 轮，已用满）。

## 1. oracle（`审查域: 治理面`）—— **PASS-WITH-NOTES**

| # | finding | 处置 | 落点 |
|---|---|---|---|
| O1 | **AC10 措辞自相矛盾**：写「决策列零差异」，但 ⑯ 行的决策列本身就是三处许可落点之一（主题文档指针 §2.8.7 → §2.8.8） | ✅ 改为可机械复核：`numstat = 9 2`、4 hunk、D9 表仅 ⑯ 行一处、决策内容逐字未变 | proposal AC10 |
| O2 | **ADR `:223` 缺「每项只在一处小节登记」不变式** ⇒ 未来 change 重登十六项会让守卫恒红而 ADR 无提示 | ✅ 补判别口径（含「两个**活跃** change 同时登记同一新项 ⇒ 亦红，需其一归档后合流」） | ADR `:223` |
| O3 | **ADR 内部并存两套「三处」**（⑯ 行的旧句 vs 前言定义） | ✅ ⑯ 行旧句改**沿革注**并显式指向前言「现行三处载体以 `:221` 段为准」 | ADR ⑯ 行 |
| O4 | **§2.8.8 标题语义藏在括号里**，agent 只扫标题会当成语义清单 | ✅ 标题改「**只索引，不定义语义**」；§2.8.7 末尾加分流 pointer「两节勿混读」 | MAD |
| O5 | **V10 指名了载体路径，却没有守卫核对该路径存在** ⇒ 改名后 V10 悬空 | ✅ 新增 `config-guards` 锚（改名 ⇒ 必红），并用「临时改名」实测有判别力（证据包 **M8**） | `tests/config-guards.test.ts` |
| O6（低） | `stripNoise` 只剥**配对良好**的围栏 / 注释（未闭合 ⇒ 假绿方向） | ✅ 登记为已知边界（需故意手改 ⇒ 超出漂移威胁模型） | 守卫文件注释 |
| O7（低） | 圈码类只到 `㉟`（35）⇒ Out of Scope ⑥ 原写「天然兼容」不准确 | ✅ 改为「到 35 项；`㊱` 及以后须扩字符类（登记为边界）」 | proposal Out of Scope ⑥ |
| O8 | **AC13 十六项语义逐项核** | ✅ **16/16 一致**（无偏差项） | 本节 §4 |

⚠ oracle 的取证限制（如实记录）：本机对 `sed -n` 与 `bun test` 两条 shell 被权限拒绝 ⇒ 它以**静态读码**完成判定，运行时结论以本报告 §5 的实测为准。

## 2. critic（第 1 轮）—— **REJECT**（1 BLOCKER / 1 SHOULD_FIX / 2 NITS）

| 条目 | 内容 | 处置 |
|---|---|---|
| **BLOCKER** | D9 前言 `:223` 的「三处载体」枚举写成「① **本文 D9 表**；② proposal 小节；③ 索引段」⇒ **把真源表算成登记面、漏掉测试注释面** ⇒ 未来按该句登记会**自认三处齐全而守卫红**（同一篇 ADR 内部自相矛盾） | ✅ 改为「真源 = 本文 D9 表（**不是登记面**）+ 三面 = AC 面小节 / 测试文件 JSDoc 头 / 主题文档索引段」⇒ 与守卫 `faces()`、`:221` 原句、⑯ 行沿革注**四者同构** |
| SHOULD_FIX | AC3 第二子句「守卫代码里不出现 id 字面量数组」**无实现** | ✅ 改为「**不写死由 AC4 的判别力用例证明**」，并注明**不**声称自扫描（本文件 JSDoc 头本就含十六项 ⇒ 自扫描会自匹配） |
| NIT | ADR 修订行未登记本次增补 | ✅ `:15` 补一句溯源（并声明「不改任何决策内容」） |
| NIT | 「按面唯一性」的并发碰撞未登记 | ✅ 并入 `:223` 判别口径 |

critic 对 focus 1 的裁定（重要）：**本批属「执行点落地」而非决策变更** —— 三处登记承诺与 V10 的「删掉任一处 ⇒ 红」都是已签批文本，本批只补**载体位置 / 标识口径 / 执行点**，不触 `lib/**` / `plugins/**` / 运行时；与 `ADR-role-aware-permissions` 的 D5 + AC23 **不构成两套并行判据**（主体不同、守卫分离、MAD 节区隔离且已加分流 pointer）。

## 3. critic（第 2 轮，**只验 BLOCKER 闭合**）—— **APPROVE**

`mergeable: yes` / `scope_exceeded: false`。判定依据（逐条对应第 1 轮指控）：

- 「把真源表算成登记面」⇒ `:223` 新增限定语逐字声明「真源 = 本文 D9 表 …… **不含本表**」，旧枚举的「① 本文 D9 表」已移除；
- 「漏掉测试注释面」⇒ `:225` 新增「② **测试注释面** = `tests/commit-gate-d9-registration.test.ts` 的 JSDoc 头」；
- 「照 ADR 做仍红」⇒ 消除：`faces()` 三面（`tests/commit-gate-d9-registration.test.ts:156/157/161`）与 ADR 枚举一一对应，四面同构。
- 本轮新增 diff（`94f4072..02af310`，2 文件 +8/−4）逐行亲验，**未引入新 BLOCKER**。

## 4. AC13：十六项语义逐项核（oracle，人工核 —— 机器不判语义）

**16/16 一致，无偏差项**。摘要（逐项 verdict 见 oracle 输出，其口径 = 「该行标题是否仍准确描述 ADR D9 表对应项的免宣称面」）：

| 项 | verdict | 备注（oracle 原话要点） |
|---|---|---|
| D9① | 一致 | 标题 verbatim；决策列 `verify_commands` 改空壳面 ⇔ 「可被改写 / 被弱化」 |
| D9② | 一致 | 「插件缺席 ⇒ 门禁不存在」⇔ 执行点缺席面 |
| D9③ | 一致 | 脚本内提交面（`bash x.sh` / `make commit`） |
| D9④ | 一致 | 无声明仓放行面 |
| D9⑤ | 一致 | `ask` ⇒ 硬拒后的非交互路径无人复核面 |
| D9⑥ | 一致 | 别名 / 函数 / 脚本内容的解析盲区 |
| D9⑦ | 一致 | 验证命令覆盖不到的语义类缺陷 |
| D9⑧ | 一致 | saved approval vs config `deny`（工具层 push-gate 兜底） |
| D9⑨ | 一致 | `decideWrite` 含治理面 / `classAllowRoots` 不含 ⇒ 提交面宽于 edit 面 |
| D9⑩ | 一致 | 字符串级判定残余（与 ③ 同源） |
| D9⑪ | 一致 | **加粗段止于「为准」、括注留在 ADR** ⇒ 派生正确；`workdir` 行为反转面 |
| D9⑫ | 一致 | 多 heredoc 只处理第一个（误拒方向） |
| D9⑬ | 一致 | git 配置驱动的强推不可见 |
| D9⑭ | 一致 | 加粗段不含括注，`--delete` 等括注留在 ADR ⇒ 派生正确 |
| D9⑮ | 一致 | 参数展开 / 转义序列表不可静态判定 + 行吞后果面 |
| D9⑯ | 一致 | fail-closed 误拒面；标题 verbatim |

## 5. 实现的验证证据（builder 自查；**独立 verifier 尚未介入**）

| 项 | 实测 |
|---|---|
| 守卫单文件 | `bun test tests/commit-gate-d9-registration.test.ts` ⇒ **19 pass / 0 fail** |
| 全量 | `bun test tests/` ⇒ **899 pass / 0 fail**（连跑两次；有一次既有用例 `AC10④` 抖动失败，单跑通过且它只读两个本批未碰文件的 git 历史 ⇒ 判环境抖动） |
| anchors | `bash scripts/check-upstream-anchors.sh` ⇒ **23/23** |
| openspec | `openspec validate commit-gate-d9-three-place-registration --strict` ⇒ **valid** |
| 变红演练 | **8 条**全部被抓到、复原后全绿（`.rddf/reviews/commit-gate-d9-registration-mutations.md`） |
| ADR 改动面 | `git diff --numstat 65895a5 -- docs/adr/…` = **`9 2`**、4 hunk、D9 表**仅 ⑯ 行**一处（决策内容逐字未变） |

## 6. 已知不做（与 proposal `## Out of Scope` 一致，未静默留尾）

| # | 不做 | 另案指针 |
|---|---|---|
| ① | 十六项语义机判 | 交 oracle 人工核（AC13，本报告 §4） |
| ② | 三处互相复制同一句错话的检测 | 不可机判；缓解 = 只写标题 + pointer + AC7 禁 `缓解：` |
| ③ | **V10 第二子句**（`role-aware-permissions/proposal.md` 的 D5② 旧措辞「不在范围」） | **仍红**；本 change 只闭「十六项三处登记」子句（改法已在该 proposal 的 Out of Scope ③） |
| ④ | 既有 AC23 守卫的**路径写死**（`role-aware-permissions` 一归档即断） | 另案（本守卫 AC6 只保证**自己**有归档韧性） |
| ⑤ | `D8` 的 20 点守卫迁移 / 通用登记框架 / 生成器 | 过度设计 |
| ⑥ | 编号 >㉟（35）的方案 | 派生口径到 35 项够用；`㊱` 起须扩字符类 |
| ⑦ | 符号链接去重 / `cli.json` 等运行时文件 | 与本 change 无关 |
