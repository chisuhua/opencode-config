# Multi-Agent 设计变更日志

> 本文件记录 `docs/MULTI-AGENT-DESIGN.md` 的**历史增量**：按版本切分的权限加固史、各版本验证记录、已完成改动台账、演进日志。
>
> **当前态只看 [MULTI-AGENT-DESIGN.md](MULTI-AGENT-DESIGN.md)**——本文档不描述现状，只记录「什么时候改了什么、为什么」。

---

## 版本变更摘要

---

> **v2.58 回滚可达性：组清单模型 + 存量债第一轮清偿（2026-11-21）**：
> 清 10 条存量债的实测给出**组**这个粒度 ⇒ registry 从「一机制一清单」的 1:1 模型扩到 **1:N 的组清单**。
> **动因（实测内核耦合）**：`cancel`（CR）直接调用 `waitStopped`（SC，`lib/delegate-async.ts:2369`）与 `releaseSlotAuthorized`（SO，`:2451`）；`markCancelPending`（CR，`:2575`）是 MB 的 reconcile 排除条件 ⇒ delegate 的槽位 / 停机 / 归属 / 取消释放是一条**不可拆**的内核链 ⇒ 拆开退役 ⇒ 另三者**编译或判据破裂** ⇒ 1:1 模型表达不了。
> **模型**（`ADR-rollback-manifest-enforcement` 第 6 轮增量，`3da29f3`）：registry 条目加 **`manifest_ref`**（`active`/`proving` 必填；**多机制可指向同一份清单**）；M1 第二子句改「清单文件集合 == {`manifest_ref`} **去重**引用集」；M2 改**集合相等（双向）**：清单**声明**的决策记录集合（`adr` ∪ `adr_related[]`）== 指向它的 `active`∪`proving` 条目的 `adr_primary` 集；清单 schema 加 `adr_related[]`；新增 **V15**（组清单归属判定 + 五条变红演练）与 **U11**（组边界归评审，rubric = 调用点行号级证据 + 反向代价确认；**不设** watch 交集机判 —— 耦合走调用链不走 watch 锚点）。
> ⚠ **M2/V15 的 scope 必须含 `proving`** —— 否则与 M9 在「还没转 `active`」的中间态互斥 ⇒ 按 ADR 自己规定的两提交路径**债永远还不清**（oracle 第 5 轮的阻断项，已闭合）。
> **清偿 2 条（10 → 8）**：`role-session-identity` / `canonical-root-normalization` 经依赖图核实为**退役 = 重写** ⇒ 归 `exempt` / `no-single-baseline`（证据 `.rddf/reviews/rollback-exempt-role-identity-canonical.md`）：① **教学面原生** —— 落在 `prompts/build.md` 的原生角色矩阵段内（`git log --diff-filter=A -- prompts/build.md` ⇒ `132f389` 初始提交）⇒ 回退教学面 = 删原生段 ⇒ 实测 **39 处红** + 引用悬空 ⇒ **没有 `find/replace` 形态**；② **连带面落在已登记为 `active` 的机制上**（身份/租约被 8 个生产文件 import、`canonicalRoot` 被 5 个 ⇒ 连带回退 delegate 的两根基模型与两个门禁插件）⇒ **「回退到先前状态」的前提不成立** ⇒ 目标态是**新设计**而非历史态 ⇒ `delete + edits` 表达不了。
> **其余 8 条按组标注**（债未清，只升可见性）：**G1 `delegate-slot-kernel`**（4 条：MB/SC/SO/CR）、**G2 `delegate-knowledge-delivery`**（2 条：KC/DE）、**G3 `role-class-write-set`**（2 条：`role_class` + 写集）⇒ 债指针文件补组名，registry 的 notes 写明「组清单覆盖全组」。
> **顺带订正**：`ADR-canonical-root-normalization` 的 Status 行原写「**未实施**——关联 change 尚未立项」，与事实矛盾（change 已于 2026-11-10 归档、`canonicalRoot` 三值返回已落地、291 行 / 10 组用例的验收测试在仓）⇒ 据实订正 + 登记该 change 目录**仅含 `proposal.md`** 的形态异常。
> **审查**：oracle 增量 5 **REJECT**（1 阻断：M2/V15 scope 漏 `proving` + 3 建议：`adr` 单值归属写死 / U11 rubric / U12 的 T1·T2·T3 三测）→ critic 第 6 轮 **APPROVE_WITH_CONDITIONS**（无 BLOCKER；1 SHOULD_FIX：豁免论证缺两环 ⇒ 补进 D4 + 2 NIT：计数口径统一为「8 个（含自身 2 个 ⇒ 6 个外部依赖方）」、选项表补 F 行「人读组声明」被否）。
> **实测**：5 份清单在隔离副本里**重跑**演练（基线 `6bf4d85`）⇒ 全部 PASS；census = `declared=0 unmanifested=8 proving=0 active=5 retired=0 exempt=3`。
>
> ---
>
> **v2.57 回滚可达性 L2：机制登记表 + 守卫 + 存量债登记（2026-11-21）**：
> 把「**该有的清单在不在**」从**约定**变成**机制**（`ADR-rollback-manifest-enforcement` 的 M1–M8 / V1–V13；ADR 仍 `Proposed` ⇒ 实施已落地，ADR 文本待第 5 轮 critic 同步后转 `Accepted`）。
> **新增**：`lib/rollback-registry.ts`（判据本体，纯逻辑：零 spawn / 零 git / 零 clone）+ `scripts/rollback-registry.ts`（CLI，退出码 `0/1/2`；`2` = registry 缺失或 schema 非法 ⇒ **不可判定，不当通过**）+ `tests/rollback-registry.test.ts`（17 例：真源在位 + **每条判据的判别力反例**，fixture 仓，不触真实仓历史）+ `.rddf/rollback/registry.json`（**机制登记表**：16 条 baseline）+ `.rddf/rollback/pending/*.md`（10 份**逐机制**债指针）+ `.rddf/rollback/rollback-manifest-enforcement.json`（L2 机制自身的退役清单：delete 15 + edits 3，含**删本清单自身** ⇒ 否则漂移守卫对其恒红）。
> **判据**：M1 集合相等（ADR 全集双向 + 清单集合与 `active`∪`proving` 双向）；M2 `active` 的清单 `adr` == registry 的 `adr_primary`；M3 豁免闭集（5 类）+ 证据存在 + 证据不自证；M4 `declared` 的落地 tripwire（watch 路径已存在 ⇒ 必须离态）；M5 清单防空壳（`find == replace` ⇒ 红；验证命令不得是 `true` 之类）；M6 退役证据；M7 债指针**逐机制**（`pending/<mechanism>.md`，与 `unmanifested` 集合**双向相等**）+ 在跑锚点（`watch[]` 每条**当前存在**）；M8 指针闭集（**全部状态**的 `adr_primary` 必须在「决策记录闭集」内）；V8 证据时效（**按内容比对** = 去掉 `last_drill` 后算内容哈希 ⇒ 零 git、零成本、不占真实仓预算、**无自指回归** —— 按提交号比对会永远「晚于」）；V10 登记面（覆盖表 / README 指针）。
> **实测**：5 份清单在**隔离副本**里全部 **PASS**（`commit-gate` / `plan-topics` / `plan-delegate` / `model-fallback` / `rollback-manifest-enforcement`）；**退役 L2 后的副本** ⇒ `bun test tests/` **1032 pass / 1 skip / 0 fail**（1033 用例 / 29 文件；比真仓少 21 条 = 登记表的 19 条 + 清单漂移守卫少 2 条（自清单已删）；**2026-11-21 复核**（`8b44b0a` 增 2 条判别力用例后重测，绝对值不变））⇒ **退役本机制后仓库仍自洽**（L1 的 drill 与漂移守卫独立于 registry ⇒ 回滚可达性能力本身不受影响）。
> **三条实施期发现**（ADR 待同步）：① **机制 ⇒ ADR 并不成立** —— `model-fallback` **无 ADR**（其验收报告自述「本仓库无 ADR」）⇒ 决策记录可能在 `.rddf/reviews/` ⇒ M2 的指针闭集放宽为「**决策记录闭集**」（`docs/adr/` ∪ `.rddf/reviews/*-verify.md`）；② **豁免闭集装不下 9 篇「机制在跑、清单待写」的 ADR** —— 现有 5 类豁免全是「该机制**不该**有清单」的判断，硬塞即谎 ⇒ 新增 `unmanifested`（**债**不是豁免：逐机制债指针 + 在跑锚点 + 集合双向相等）；③ **自举死锁**（本轮新增）—— 机制落地的那个 commit 里，条目无法同时满足「`declared` 的 watch 尚不存在」与「`active` 的演练证据已回填」（**证据只能由已提交的清单跑出来** ⇒ 必然晚一个 commit）⇒ 新增过渡态 `proving`（已落地 + 清单已写 + **演练待回填**；证据可缺失，但一旦存在就必须新鲜）。
> **顺带**：`tests/rollback-manifests.test.ts` 排除 `registry.json`（它是**登记表**不是清单 ⇒ schema 完全不同，否则恒红）；`lib/rollback-drill.ts` 的清单 schema 加 `last_drill{ sha, at, result, content_hash? }`。
> ⚠ **待办（需用户批准第 5 轮 critic）**：ADR 的 V8 判据形态（实现用**内容哈希**，ADR 正文写的是 `git show` + 深比较）、D4 的归类数字（实测 **4 active / 10 unmanifested / 1 exempt**，ADR 写的是 9 + 2）、以及新增的 `proving` 状态 ⇒ 三处须同步进 ADR 后转 `Accepted`。
>
> ---
>
> **v2.56 回滚清单第三个机制：plan 侧工程派发（能力面退役）（2026-11-20）**：
> `.rddf/rollback/plan-delegate.json`（delete 0 + edits 48）—— 退役「plan 是派发主体」这一**能力面**：`ADR-plan-delegate-engineering-session` 的回滚三步（撤 plan 的五项 delegate 放行 / `sessions` 撤回 owner 过滤 / `owner_agent` 兼容读）+ 让仓库自洽所必需的同步面（`prompts/plan.md` 的委派**发起侧**教学退役、`prompts/build.md` 的 planner 行、`prompts/front.md` 的「看不到它的后端」句、`MAD` 的 plan 卡片、`SUBAGENT-ORCHESTRATION` §2.2 与 §8.1，**以及 20 余处守卫从「两个派发方」收窄为「front」**）。
> **实测**：`bun scripts/rollback-drill.ts .rddf/rollback/plan-delegate.json` ⇒ **PASS**（隔离副本：`bun test tests/` **1024 pass / 0 fail** = 真仓 1031 − **5** 条被撤回的守卫用例 − **2** 条清单漂移守卫用例（在 drill 副本里整组 skip，因副本正是「清单已执行完」的状态））。
> **核心发现（如实登记）**：ADR 的「回滚口径（三步即可回到现状）」是 **2026-11-13 的快照** ⇒ 实测结论（留痕 `.rddf/reviews/plan-delegate-rollback-drill.md`，实验 A/B/C）：**形式上仍成立** —— 三步 + 3 处同步（撤回 D3 用例 / 放行主体守卫收窄 / 同步 `capability:plan`）⇒ 套件可绿（`1028 pass / 0 fail`，另有 1 处 **clone 假红** = 缺 gitignored 运行态）；**实质上已半退役** —— 此时 plan.md 仍在教 plan 派发、文档仍说 plan 是放行主体、20 余处守卫仍要求 plan 覆盖派发契约 ⇒ **prompt 与权限层互相矛盾**（复现 v2.44 事故形态）⇒ 实质退役另需 43 条 edits（教学退役 + 文档转述 + 守卫收窄 + 悬空指针清理）⇒ 合计 **48 条**。已据此订正该 ADR（补「可执行真源」+ 同步面清单 + 残留声明 + 就地标记）。
> ⚠ **残留（5 项）**：① **代码内核保留**（D2 `plan_ref` / D5 `owner_agent` / D7 优先级 / `role_class` 惰性保留）⇒ 退役的是能力面，彻底退役内核需连带回退四个增量（≈11k 行代码与测试）⇒ 属重构；② `plan.md` 的**消费侧**三小节保留 ⇒ 死教学（AC21 / AC21b 仍钉着它们）；③ D3 的「配额 owner 无关」不变式**失去双 owner 直接覆盖**；④ 存量 plan-owned 后端在过滤退役后对 front **可见**，但仍受 D7.3 / D7.8 硬拒保护；⑤ ADR 散文 ↔ 清单之间**无机判**（只有人读指针）。
> 附带（git 卫生）：`.rddf/state/ledger.jsonl`（角色租约 / 派发事实台账，含活的 session id 与绝对路径）与 `.rddf/state/verifier/`（verifier 记账落点；产品落点是 `.rddf/reviews/`）**加入 `.gitignore`**（与既有的 `pair.json` / `role-claims.json` / `plan-sessions.json` 同类）；`cli.json` 按用户指示提交。
> 附带（门禁稳健性）：`tests/commit-gate-doctor.test.ts` 的活体断言对「可达但插件列表缺项」也重试（取数层重试，判定逻辑未动）—— 依据：宿主重载插件的窗口内插件列表会短暂缺项 ⇒ 假红会把所有提交卡住。
>
> ---
>
> **v2.55 回滚清单补全：commit-gate 的步骤 1/2（2026-11-20）**：
> v2.54 的清单只覆盖**步骤 3**（删机制文件 + 守卫期望同批）⇒ 本次把 ADR「回滚路径」的**步骤 1 / 2** 也清单化，三步同批可执行。
> **步骤 1**（`opencode.jsonc.opencode-go`，符号链接的**目标文件**）：`git commit` / `git commit *` ⇒ `ask`；移除 force-push **8 条** deny。
> **步骤 2**（25 条 `edits`，逐段替换）：`prompts/build.md`（§输出 commit 两条 ⇒ 旧一条 / v2.50 的「单独成段」段 / 点名条款 / 角色矩阵 `builder` 行 / 增强层 commit 契约 / `capability:build` ⇒ `allow-ask` / `no-role` 行）+ `docs/MULTI-AGENT-DESIGN.md`（§3.4 / §2.6 / §2.8.7 D5② / §4.4.1 / §4.4.3 / 版本摘要行）+ 同批措辞的其它投影（`lib/delegate-core.ts` 后端 brief / `docs/dual-session-delegation.md` / 父篇 ADR `:43` + 修订行 / `tests/role-exemptions.test.ts` D5② 头注释）+ `tests/config-guards.test.ts` 的 build shell 断言（allow ⇒ ask，force-push 八条断言删除）。
> **实测**：`bun scripts/rollback-drill.ts .rddf/rollback/commit-gate.json` ⇒ **PASS**（隔离 clone：`bun test tests/` **809 pass / 0 fail**；anchors 29/29）；`--keep` 检视副本 ⇒ 9 件已删、保留项仍在。
> **drill 暴露的两个保留项**（如实登记，非偏好）：① `MAD §3.4` 的 **D9⑯ 指针行**必须保留（V10 载体的 AC5 以「§2.8.8 之外仍提到 D9⑯」为前提）；② `.rddf/commit-gate.json`（门禁声明）与 `tests/commit-gate-d9-registration.test.ts`（V10 载体）保留（各自有守卫断言其存在）。
> 同步：`ADR-commit-verification-gate` 的回滚路径补「可执行真源」+ 步骤 2 覆盖面补齐 + **V12 勾选**（证据与未覆盖项写在 V12 内）。
>
> ---
>
> **v2.54 回滚可达性：机械验证原型（2026-11-20）**：
> 把「机制退役后仓库还自洽吗？」从**散文**（ADR 的「回滚路径」段）变成**可重复的一条命令**。
> 起因：v2.53 的隔离副本演练是**手工**做的（7 次实验），结论躺在 `/tmp`，不可重复。
> 新增：`lib/rollback-drill.ts`（清单 schema / 路径安全 / `find` 唯一性 / 禁止部分应用 / 演练环境准备）+ `scripts/rollback-drill.ts`（CLI，退出码 `0/1/2`）+ `.rddf/rollback/commit-gate.json`（首个清单）+ `tests/rollback-drill.test.ts`（26 例）。用法：`bun scripts/rollback-drill.ts .rddf/rollback/commit-gate.json`（⚠ `package.json` 是 gitignored ⇒ 不提供 npm script 快捷方式）。
> **判据（fail-closed）**：schema 非法 ⇒ 拒；`delete` 目标**必须存在**；`edits.find` 必须**恰好出现 1 次**（0 次 ⇒ 漂移；≥2 次 ⇒ 无从确定）⇒ 清单与代码**同漂**，措辞一改 drill 立刻红，不会静默变 no-op；**不做部分应用**（先全量校验，任一条不满足 ⇒ 一个字节都不写）。
> **安全**：只在**临时 clone** 里动手（断言副本在 `tmpdir` 下且 ≠ 真仓）；验证命令带 `ROLLBACK_DRILL_CHILD=1`，嵌套调用默认**拒绝**（防 drill 里跑 drill 的递归）。
> **实测**：`bun scripts/rollback-drill.ts .rddf/rollback/commit-gate.json` ⇒ `PASS`（隔离副本里 `bun test tests/` 全绿），复现 v2.53 手工演练的结论。
> ⚠ **已知限制（如实登记）**：① drill 基于 **HEAD**（`git clone` 只含已提交内容）⇒ **未提交改动不参与**；② 清单目前只覆盖 v2.53「实验 C」的**步骤 3** 清单（9 件 + 守卫期望同批），**步骤 1/2**（配置档位 / prompt / MAD 措辞）未纳入（格式已支持 `edits`，待补）；③ 保留项写进清单 `notes`（`tests/commit-gate-d9-registration.test.ts` = V10 载体、`.rddf/commit-gate.json` = 声明文件，删则各自有守卫变红 —— 实测见演练报告实验 D/G）。
> 同步：`tests/config-guards.test.ts` 的「新增文件闸门」登记 `lib/rollback-drill.ts`。
>
> ---
>
> **v2.53 commit-gate 回滚路径演练（2026-11-20，`ADR-commit-verification-gate` V12）**：
> critic 第 2 轮指出「回滚路径未含 doctor ⇒ V12『三步回滚后 `bun test tests/` 绿』不可执行」⇒ 在**隔离副本**里做了 7 次实验（A–G）（绝不在宿主正在加载的 `lib/`/`plugins/` 路径上动手）。
> 结果（全部实测，报告 `.rddf/reviews/commit-gate-rollback-drill.md`）：
> ① **V12 可达** —— 「删 9 件机制文件 + 同步 EXPECTED 3 项 + 移除落点完整性守卫整块 + **保留** d9-registration 守卫」⇒ **783 pass / 0 fail**；
> ② **「改回原措辞」不能整文件还原** —— `git checkout <旧提交> -- build.md/MAD/opencode.jsonc` 会把门禁之后的**无关变更**一起回退（实测 11 红，其中 4 条是模型清单 / 能力面块 / 技能清单 / agent 取值）；
> ③ **`opencode.jsonc` 是符号链接** ⇒ 还原链接**静默无效**，必须还原目标文件 `opencode.jsonc.opencode-go`；
> ④ **ADR 保留 ⇒ 三处登记守卫必须保留**（删 `tests/commit-gate-d9-registration.test.ts` ⇒ V10 载体守卫红）；
> ⑤ ADR 的 step 3 现在漏了 `lib/push-gate.ts` 与两个单测文件（`tests/commit-gate.test.ts` / `tests/push-gate.test.ts`）—— 留着会让回滚后的 `bun test` 因 import 失败而红。
> ⚠ ADR 回滚路径的订正文本**已给出但未应用**（属第 3 轮评审范围，需用户批准）。
>
> ---
>
> **v2.52 门禁在场性体检的第一次实战 + 踩坑固化（2026-11-20）**：
> v2.49 的 doctor **当天就抓到了第二次同款故障**：`bun test tests/` 的活体例**变红**（`commit-gate` 插件 `failed`）
> ⇒ ⚠ **doctor 不拦提交**（门禁当时已死 ⇒ 工具层**无任何拦截能力**；doctor 只让失败**可见**）⇒ 由 agent/人在看见红之后停手 ⇒ 重启宿主 ⇒ 恢复后再提交。
> **根因（比 v2.49 更精确）**：宿主**监视 `plugins/` 与 `lib/` 的文件变化并重载插件**，且**进程内按路径缓存模块实例**
> ⇒ 磁盘上**短暂**存在过写坏的依赖版本（本次 = 我做变异测试时故意在 `lib/push-gate.ts` 里 import 不存在的导出）时，
> 宿主会**加载并缓存那个坏实例** ⇒ 之后即使磁盘修好，宿主仍用坏实例链接入口 ⇒ `Export named '…' not found` ⇒ 插件加载失败 ⇒ 门禁消失。
> **⇒ 两条纪律（已写进 `lib/commit-gate-doctor.ts` / `scripts/commit-gate-doctor.ts` 的文件头）**：
> ① 改过 `lib/*.ts` / `plugins/*.ts`（**哪怕内容没变**，只是 `cp` / `touch` 还原也会改 mtime ⇒ 触发重载）之后必须 `opencode service restart`；
> ② **变异测试（故意写坏代码）绝不能放在宿主正在加载的插件依赖路径上** —— 要测就在**隔离副本**里做，测完重启。
> **⚠ 如实更正**：`d050b69`（门禁在场性体检）与 `2f5e9e6`（commit 调用形态约束）两个提交**落在门禁失效窗口内**（07:35–08:34 UTC）
> ⇒ **没有经过工具层验证门**（当时报出的「验证命令真跑了」是我手工跑的，不是门禁跑的）；本提交起门禁恢复在场（doctor PASS）。
>
> ---
>
> **v2.51 doctor 进 ADR 的 D9②（2026-11-20，`ADR-commit-verification-gate` D9② / V19）**：
> 上一版补了「门禁在场性体检」（`lib/commit-gate-doctor.ts` / `scripts/commit-gate-doctor.ts`），但**新机制没进 ADR** ⇒ ADR 仍只说「插件缺席 ⇒ 门禁不存在」，读者无从知道已有检测面。
> 处置（**只登记现状 + 补前瞻判据，不改任何决策**）：
> ① **ADR D9② 的决策列**补「检测面」段（doctor 问宿主「`commit-gate` 是否 `active`」⇒ 未加载判红、退出码 1）+ 两条边界（**检测 ≠ 拦截**；**宿主不可达 ⇒ 判定不可得** ⇒ skip 不算失败）+ 一条**史实**（2026-11-20 宿主模块缓存固化 ⇒ 门禁静默消失两天、206 单测全绿 ⇒ 纯逻辑测试覆盖不到接线层）。
> ② **ADR Verification 章新增 V19**（前瞻判据 + 变红演练 + 2026-11-20 实测结论）。
> ③ **ADR 风险章**「静默无门禁」一条补「在场性体检（检测 ≠ 拦截）」。
> ④ **`docs/MULTI-AGENT-DESIGN.md` §4.4.1**（当前态）补一段指针。
> ⚠ **三处登记面（AC 面 / 测试注释 / 主题文档索引段）**按设计**不需要改**：D9② 的**标题**未变（「插件缺席 ⇒ 门禁不存在」仍是本项的宣称）⇒
> 机械载体 `tests/commit-gate-d9-registration.test.ts`（18 例）按**标题**比对三面 ⇒ 照旧；doctor 是 D9② 的**缓解/检测面**，不是新的 D9 项
> （新增第 ⑰ 项会牵动「恰 16 项」断言、`## D9 十六项登记（AC 面）` 标题常量与「AC 面只能登在新 change」的规则 ⇒ 成本与语义都不对）。
> 验证：`bun test tests/`（996 pass / 1 skip / 0 fail）+ `check-upstream-anchors.sh`（29/29）。
>
> ---
>
> **v2.50 commit 调用形态约束进 prompt（2026-11-20，`ADR-commit-verification-gate` D5⑧）**：
> 用户反馈「最近有会话里出现 `commit-gate: git commit 必须单独成段 ⇒ 拒绝`」⇒ 核实：**不是插件故障**，是 D5⑧ 的既定 fail-closed 规则在正常工作
> （门禁当天 07:22 才从 `failed` 恢复 `active` ⇒ agent 在此前两天形成了「commit 后顺手接管道」的惯性）。
> 但 `prompts/build.md` §输出 只写了门禁的**语义**判据（验证绿 + 暂存区非空 + 写集），**没写「commit 必须单独成段」这条调用形态约束**
> ⇒ 只读 build.md 的 agent 无从预知 `git commit -m "…" 2>&1 | tail -20` 会被**整条调用**拒 ⇒ 反复撞墙。
> 处置：**只补 agent 侧处方，不动门禁**（`lib/commit-gate.ts` / `plugins/commit-gate.ts` 一字未改，D5⑧ 口径不放宽）——
> `prompts/build.md` §输出 新增一条：规则 + 一句话理由（shell 权限整串前缀匹配 ⇒ 其余段搭便车）+ 调用形态处方
> （add 与 commit 分两次调用 / 后续动作另起调用 / 不靠 `| tail`）+ 解释器包装禁令（D5⑪ 同样拒）+ 三个例外（引号内 `|`、重定向含 `< f`、heredoc 正文是数据）；
> `tests/config-guards.test.ts` 落点完整性守卫新增 1 条锚点（「单独成段」）⇒ 把这条 prompt 约束钉住，防与门禁口径漂移。
> 已实测 8 个命令形态（管道 / `&&` / `git -C` / 引号内 `|` / 输出重定向 / 输入重定向 / heredoc / 末位 `;`）全部与实现一致。
> 审查：oracle（治理面 PASS-WITH-NOTES，notes 全吸收）+ critic（build APPROVE，0 BLOCKER / 0 SHOULD_FIX / 3 NIT，NIT 2 条已吸收）。
>
> ---
>
> **v2.49 commit 门禁在场性体检（2026-11-20，`ADR-commit-verification-gate` D9②）**：
> 2026-11-20 实测：`plugins/commit-gate.ts` 在宿主里**加载失败**（`SyntaxError: Export named 'isForceFlagToken' not found`
> —— 宿主进程自 11-18 00:52 常驻，`lib/push-gate.ts`（16:55）/ `lib/commit-gate.ts`（19:01）的改动**没让进程内模块缓存失效**
> ⇒ 旧版 push-gate 配新版 commit-gate）⇒ **门禁静默消失**：commit 照常通过、仓库的验证命令也没人跑，
> 而当时 **206 个单测全绿**。修复 = `opencode service restart`（重启后 `/api/plugin` 里 `commit-gate` 回到 `active`）。
> D9② 此前只有**登记**（「插件缺席 ⇒ 门禁不存在」）没有**检测** ⇒ 本次补三块：
> ① `lib/commit-gate-doctor.ts` + `scripts/commit-gate-doctor.ts`：**门禁在场性**判定（`pass` / `fail` / `skip`，
>    退出码 `0/1/2`）—— 问运行中的宿主「`commit-gate` 插件是不是 `active`」；`skip` = 宿主不可达（**不可判定 ≠ 健康**）。
> ② `tests/commit-gate-doctor.test.ts`（9 例纯逻辑 + 3 例 CLI 出口码 + 2 例活体分支，每次运行**恰执行其中 1 例活体**）：活体层挂在 `bun test tests/` 里 ⇒
>    而 `bun test tests/` 是 `.rddf/commit-gate.json` 的 `verify_commands` 之一 ⇒ **每次运行测试都会尝试体检门禁本身是否在场**
>    （⚠ 措辞边界：宿主在门禁的验证上下文里不可达时 ⇒ 该次**判定不可得**（skip，不判失败）⇒「每次都会**尝试**」成立，
>    「每次都**体检到**」不成立；已实测门禁同款上下文（`execFile`/无 TTY/cwd=仓根）下宿主**可达** ⇒ 活体例执行而非 skip）。
> ③ `tests/commit-gate-plugin.test.ts`（11 例）：**直接 import 插件文件**（宿主加载的是同一文件、同一张模块图）
>    ⇒ 接线层（hook 注册 / force push 兜底 / 命令闭口 / fail-closed / 三判据在真实 git 暂存区上的落地）首次有覆盖。
>    判别力已用变异验证：摘掉 force push 兜底 ⇒ 旧纯逻辑测试 188 例**全绿**、新测试**红**；
>    复现事故同形的导出名不匹配 ⇒ 旧 `commit-gate.test.ts` **141 例全绿**、新测试在 import 阶段**红**（错误文本与宿主一致）。
> `tests/config-guards.test.ts` 的「新增文件闸门」同步登记 `lib/commit-gate-doctor.ts`。
>
> ---
>
> **v2.48 plan 侧多会话离线协作（2026-11-20，`ADR-plan-multi-session-collaboration`）**：
> 新增 `plan-worker`（`mode: subagent`）—— plan 主会话可用 `subagent` 派**并行子会话**推进 `.rddf/plan-topics/<topic>/nodes/<id>/` 的 TODO/RESULT；
> 新增 `lib/plan-topics.ts` + `scripts/plan-topic-check.ts`（`check` / `scope-check` / `lock` 三子命令，退出码 `0/1/2/3`）作为 fork/join 与派生状态的**机械判据**。
> 关键语义：`progress`（纯磁盘派生）与 `status`（门控有效值）**正交** —— 子先干完而依赖未完成是**合法状态**（`progress=complete` / `status=blocked_by_deps`），不误报。
> 关键防提权：**不**把 `plan` 改 `mode: "all"`（否则 build 的 `subagent: allow` 可拉起带 `delegate`/`question` 的 plan 会话 ⇒ 绕过 `plan_ref` 强制与父仲裁）；改为新增窄权限 `plan-worker`：
> 进 `GUARDED_AGENTS`（shell 三段式只读、首键 deny、白名单**无** `bun`/`node`）、`subagent`/`delegate*`/`question`/`skill`/`lsp`/`external_directory` 全 deny、**无 `ask` 档**（无人值守）。
> 上游语义 6 条锚点（P1–P6）进 `scripts/check-upstream-anchors.sh`（**运行时 23 → 29**；`grep -c` 只数静态行会漏掉 A7 循环展开）；第 7 条 delegate 单槽属本仓语义，由 delegate 测试覆盖。
> 同步：`docs/MULTI-AGENT-DESIGN.md`（模型表 + agent 卡片）、`docs/SUBAGENT-ORCHESTRATION.md`（模型表 + 通道）、`.gitignore`（`.rddf/state/plan-sessions.json`）。
> 测试：`tests/plan-topics.test.ts`（34 例：schema / node id 黑名单 / DAG / progress 与 status 正交 / 缓存分叉 / brief 完整性 / 孤儿 / 空 topic / CLI 退出码 / `ready` / scope-check fixture 仓 / lock / 非法 id 不派生）+ `tests/config-guards.test.ts` 的 AC3–AC9 守卫。

---

> **v2.47 技能清单自动发现（2026-11-19，`scripts/rdd-skills.sh`）**：清单原为**写死的镜像**（28 项），
> 上游新增 skill 必须手工补一行 —— 2026-11-19 新增 `session-lesson-mining` 时脚本仍报 `28/28`，
> 新技能**静默缺席**（既不报错，也不进 `missing[]`，因为判定集里根本没有它）。处置：
> ① **改为自动发现**：优先读已安装 rdd-workflow 的 `package.json::skills[]`（上游权威清单，该仓有测试
>   保证「清单 == 磁盘」），再用磁盘 `skills/*/SKILL.md` 兜底（跳过 `deprecated:`），两者都没有时才回落
>   脚本内置清单。
> ② **新增 `skills_source` 字段**（`manifest:<root>` / `disk:<root>` / `builtin`）—— 让"清单从哪来"可观测；
>   manifest 存在但读不到时向 stderr 打 WARN（不再与"根本没有 manifest"混同）。
>   **`installed` / 退出码只看上游权威集**（manifest ∪ 内置）：磁盘发现到的项目自有技能只进 `available[]`，
>   新增 `installed_count` 单列计数 —— 否则「项目有别的 opencode 技能 + 没装 rdd-workflow」会被误判成已安装
>   （oracle 治理面审查 N1）。清单口径是 manifest ∪ 磁盘的**并集**（不是"manifest 优先、磁盘仅兜底"）。
> ③ **其余行为不变**：`installed` / `available[]` / `missing[]` / `sources[]` 与退出码、探测顺序均保持原样；
>   只有 `total_count` 由写死 28 变为动态。`prompts/build.md` 与 `docs/MULTI-AGENT-DESIGN.md` §2.6 同源更新
>   （删掉"上游新增会漏判"的旧口径）。
> ④ **测试**：`tests/rdd-skills.test.ts`（7 例：manifest ∪ 磁盘并集 / 无 manifest / 跳过 deprecated /
>   全缺失回落内置 / **项目无关技能不得让 `installed` 变真（oracle N1）** /
>   **布局像 rdd-workflow 但无权威名 ⇒ WARN（critic SHOULD_FIX）** / 两份规则文档含新字段）。
>   真实验证：脚本现报 `29/29`，`session-lesson-mining` 在列。
> ⑤ **WARN 走 stderr**：合并 `2>&1` 捕获会污染 JSON ⇒ 机读请只取 stdout。

> **v2.46 勘察结论（2026-11-19，`required-question-hard-pause-probe`）：`rdd-builder` P0 / P2.5 的 HARD pause **不是缺陷**，本仓无需改动**：
> ① **读证（零成本，`skill/rdd-builder/SKILL.md` 2026-11-18 版）**：P0 的 5 选项门在**阶段 0.0.5 默认 ON**，
>   按 ADR-0049 用 planner advisory + LLM assessment + AC count **自动决策**（`:5` / `:158` / `:164`）
>   ⇒ **默认模式不真 pause**（**直接读证的只有 P0**；P2.5 的 skill 侧行为**未单独判读** —— 但不影响结论：
>   无论 P2.5 是否真 pause，`prompts/build.md` 的「HARD pause **优先于** skill 内部的自动决策 ⇒ agent 不替用户拍板」
>   **恰好覆盖**该形态，问不到时另有 v2.42 的停机兜底 ⇒ 两条路径下都不构成缺陷）。
> ② **残余缺口（如实登记）**：低置信度时的「暂停问用户」（unknown / 冲突 / `RDDF_REQUIRE_USER_CONFIRM=yes`）
>   在**非交互环境**问不到 —— 但该分支在**产品仓 skill 层**，本仓 prompt 层无法改写 ⇒ **产品侧议题**。
> ③ **未真跑**：Task 2（非交互跑一次 P0）按 `design.md` **D3 的「先读后跑」**路线**豁免**（读证已足以定性）
>   ⇒ 该分支行为**未实测**，结论**不声称**覆盖它；`rdd-builder` 改版即过时。
> ④ **登记落点**：守卫未覆盖清单（`tests/config-guards.test.ts` 的对应条目）+ 观察记录
>   `.rddf/reviews/required-question-hard-pause-probe-observation.md` + 同一读证的原始记录
>   `.rddf/reviews/oracle-intent-gate-e2e-observation.md` §9 行 2。
> **无行为变更**（AC4）：`prompts/**` 与 skill 行为均未改；本条目只回填勘察结论。
> 若将来要真正修产品侧的「低置信度暂停」⇒ **另立 change**（本 change 不含任何实施）。

---

> **v2.45 决策收口（2026-11-17，metis → oracle → critic 链的两问裁决）**：
> ① **「不对 `git commit` 弹窗点 Allow always」不写进 `prompts/**`** —— 读者错配（`prompts/<id>.md` 的
>   唯一消费者是模型：看不见宿主弹窗、控制不了点击、感知不到持久化）。改落 **`MULTI-AGENT-DESIGN.md` §3.4**
>   （当前态；`CHANGELOG` 只记历史）+ **单向真源路由守卫**（正向钉真源 / 负向断言 `prompts/**` 不得承载，
>   与「判定词表单一真源」同型）+ 未覆盖清单登记「saved approval 不可机械核」。**不立 openspec change**。
>   ⚠ **否决了 oracle 的 `bun:sqlite` 探针建议**（critic 判 BLOCKER、已复核成立）：本仓测试零读用户级状态、
>   `~` 路径**刻意排除**出守卫面 ⇒ 探针在干净机器上恒绿 = 假信心。首次核查仍作**人工一次性**证据
>   （`permission` 表 230 行无 `git commit`）。
>   顺带修两处**现存漂移**：`§4.4.1` 补 `git commit` ask（v2.44 起生效但当前态文档缺载）；未覆盖清单里
>   「commit 条 ⇒ 独立 change」的陈述按 v2.44 事实更正。
> ② **「角色感知权限」不直接立 change** —— 依 `no-self-adjudication` 的「不做什么」表，把权限层改成
>   **硬 deny** 属**架构级** ⇒ **ADR 先行**。草案见 `docs/adr/ADR-role-aware-permissions.md`（Status: **Draft**）：
>   身份真源（顶层 `current_role` vs 本 session 分区，两份文档指向相反）+ 档位与宣称边界 + 与派发后端
>   机制的「会话类型不相交」+ 口令锚定的**收窄形态**（宣称「防事故，不防绕过」）+ P3 入 backlog。
>
> **验证**：`bun test tests/` 全量回归 + 两条**变红演练**（删 §3.4 标题 ⇒ 红；把措辞抄进 `prompts/build.md` ⇒ 红）
> + anchors 无 FAIL。判定链报告：`.rddf/reviews/role-aware-permissions-consultation.md`。

---

> **v2.44 权限层修复（2026-11-17，用户裁决选 A）：`git commit` → ask 档**：
> ① **起因**（v2.43 实测 2/2）：模型**自行 commit**，原文自述「`git commit` **在本仓权限配置里不属于 ask 档**」
>   ⇒ **prompt 层（「不要主动 commit —— 等用户确认」）与权限层冲突** ⇒ 模型**优先信权限层** ⇒ prompt 规则被否决。
> ② **改动**：`opencode.jsonc` 的 **build agent** `permission.shell` 加 `"git commit *": "ask"` + `"git commit": "ask"`
>   （与 `git push` 同档）。⚠ **build 不在** `GUARDED_AGENTS`（六个只读 subagent 里 `git commit` 本是 **deny**）
>   ⇒ 加**层 1 判据**钉住（「守卫漂移检测」族：两条 ask 规则存在**且**与 `git push` 同档）⇒ 全量 **595 pass**。
> ③ **实测**：`E-8` **移除 skip ⇒ 3/3 真绿** —— 模型被工具层拦住（原文：「`git commit` **需要弹权限确认**，
>   而当前是非交互运行，ask 无法投…**请在本机执行**」）⇒ 含 `[需要用户裁决]` + 候选路径 ⇒ **HEAD 未变 + 改动仍在**。
> ④ ⭐ **关键洞察（沉淀为本仓新纪律）**：**prompt 层规则在权限层有更具体的配置时会被「否决」**
>   ⇒ **要规则真正生效，必须让权限层与它一致**；新增「等确认」类规则时**必须同批检查权限层**。
> ⑤ 登记（oracle 审后补）：① `E-4`/`E-6`/`E-7` 仍共享 `IB_FIXTURE_ROOT`（模型 `ls ..` 可把同族 fixture 当先例）；
>   ② **pattern 盲区**：`git -c … commit` / `git -C dir commit` / `GIT_AUTHOR_NAME=x git commit` **漏**（前缀通配够不着中缀）
>   ⇒ 落 `"*": "allow"`（`git commit --amend` 与 `cd X && git commit` **已覆盖**）；**不加全形态 pattern**（越加越脆）；
>   ③ ⚠ **「Allow always」会静默重开洞**：点 always ⇒ 前缀 pattern 持久化为 project-scoped allow ⇒ 层 1 看不见
>   ⇒ **交互纪律：不对 `git commit` 弹窗点 Allow always**；④ ⭐ **族级风险**：角色矩阵里 architect/planner/no-role 的
>   写面禁令**全是 prompt-only**（权限层 `edit: allow` 完全放行）⇒ 与本次同构 ⇒ 独立议题（角色感知权限 = 架构级）。
>   ⑤ ⚠ **ask 只在非交互场景生效（实测边界）**：`opencode run`（`E-8`）**被拒** ✓ 3/3；
>   **但 build agent 的主会话里 `git commit` 未被拦**（v2.44 收尾提交 + `--dry-run` 都未被 ask），
>   且**已排除 saved approvals**（`opencode.db` 的 `permission` 表 230 行无 `git commit`）⇒ 机制**未查明**
>   ⇒ **宣称边界：只证明「非交互被拦」（= 原缺陷的场景），不宣称「所有场景都拦」**。

---

> **v2.43 批量收尾（2026-11-17，遗留 6 项 + 3 个真实缺陷）**：
> ① **`#6`** `independent-build-session-e2e` tasks **0/28 → 28/28 回填**（解归档阻塞），**如实登记 5 处做法差异**
>   （无 `--standalone` / 取整条响应 / 用 verifier 而非 no-role / fixture 用 `IB_*` 而非 `SC_*` / R1 由后续 change 承担）。
> ② **`#12`** 残留 ⑫ 的**真正性质**：不是「两态并存」而是**规则冲突** —— 矩阵表 builder 行写 `| change: <名或无>`，
>   而 §开场报告的 `source` 取值段说**所有角色**都用 `source:` ⇒ 模型**漂移** ⇒ **`E-1` flaky 根因**。
>   ⇒ 矩阵表改 `| source: <state-file\|user\|auto>` + 层 1 **pin 第二段字段名**（此前只断「有第二段」⇒ 表写错也绿）
>   + `E-1` 同步 pin ⇒ **修后 6/6 全绿**（**未放宽判据**）。取证：即使放 `openspec/changes/mychange/`，仍输出 `| source:`。
> ③ **`#7`** `oracle-intent-gate-e2e` **22/28 → 28/28**：AC7 变红演练 ×2 ⇒ **实测证实「V2 假绿面真实存在」**。
>   ⚠ **抓出并修掉 e2e 仓真实缺陷**：判据 pattern 用**行首锚** ⇒ 漏判 v2.40 的「**标注 + 判定行同一行**」形态
>   ⇒ 结论一度**反向**；改派生处容忍前置标注 ⇒ 零模型重判 ⇒ 正确，**E-A 门禁不再假红**。
> ④ **`#3`** 三处**逐处实测**：`no-role` ⇒ ✅ **已被 v2.42 覆盖**（不立 change）；`rdd-builder` P0/P2.5 ⇒ ✅ **不是缺陷**
>   （`SKILL.md:158`「阶段 0.0.5 全自动决策 (默认 ON)」per ADR-0049）⇒ 残余缺口在**产品侧**；**commit 等确认** ⇒
>   ❌ **真缺陷 2/2** ⇒ 立 change，但实测**仍自行 commit** ⇒ 根因 **prompt 与权限层冲突**
>   （模型原文：「`git commit` 在本仓**权限配置里不属于 ask 档**」）⇒ **架构级** ⇒ `E-8` 如实标为**已知缺陷 skip**。
> ⑤ **另外抓出**：**e2e fixture 污染** —— 模型 `ls ..` 并把**同族 fixture 当先例**（点名 `probeCommit`）
>   ⇒ `E-8` 已隔离；`E-4`/`E-6`/`E-7` 仍共享（未观察到被利用，风险登记）。
> ⑥ **`#8`** 门控 **N 112 → 326**（≥150 **已到**），**时间门未到**（最早 **2026-11-21**）⇒ ⏳ 等到期。
>   ⚠ **勘误（2026-11-19）**：本条写的「N 112 → 326（≥150 已到）」**是错的** —— 权威数据为
>   **`N = 112`（未涨）**（观察报告与 `tasks.md` 的 D2/D3；基线相关计数是 331 首轮+续接 / 349 首轮 / 112 首轮违规 / 79 豁免，
>   **326 从任何一次取数复现不出来**）。⇒ 真实状态是 **`N = 112 < 150` ⇒ 样本不足**，且**时间不是闸门、数据量才是**。
>   复评已切分为 `openspec/changes/subagent-contract-critic-reeval/`，其入场条件可机判（`N ≥ 150` 且 `t1−t0 ≥ 7 天` 且 core hash 未变）。
> ⑦ **`#17`** 角色矩阵「允许/禁止」列 ⇒ **设计草案**（不硬上弱断言）：可机械核的走机读块逐字比对 / 散文语义靠行为层兜底。
>
> **验证**：层 1 **594 pass / 0 fail**（exit=0）+ anchors 23/23；`E-1` **6/6**；`E-8` 已知缺陷 skip；三个 change `validate` 均 valid。

---

> **v2.42 变更摘要（2026-11-17，「必须问用户」在**问不到时**的兜底 —— 两处同链缺口实测复现）**：
> ① **缺口（实测，非推断）**：`prompts/build.md` 有 7 处「必须问用户」声明，v2.41 只给其中 1 处补了兜底。
>   真跑另两处 —— **都坏**：
>   - **§何时暂停询问**（不可逆 ⇒ 必须问一次）：builder +「请删除 src/app.ts」⇒ **`src/` 整个消失**（`git rm`）。
>     ⇒ 模型**根本没调 `question`**，自行判定「已被 git 跟踪 ⇒ 可恢复 ⇒ 不算不可逆」。
>   - **§oracle 意图检查点**（意图只有用户知道 ⇒ 用 `question` 问）：architect +「评审该不该引入 MQ，只给目标
>     不给事实」⇒ `shell`×6 → `read` → `subagent`(metis) → **`question`（`status == "error"`）**
>     ⇒ 「**我按「最合理默认 + 显式标注假设」推进**」。
>   ⇒ **关键区分**：「被派发后端无 `question` 通道」= **工具层常量 deny**（已有 `HANDOFF: blocked` 兜底 ✅）
>   vs「主会话有通道但**运行期被拒**」= **运行期失败**（无兜底 ❌）⇒ **工具层允许 ≠ 运行期可用**。
> ② **改动**：新节触发面由「闭合两类」改为「**闭合清单**（两类触发面 + 两个点名节）」；
>   §何时暂停询问 加**五句**（兜底 / **禁止放宽句**（不得以可恢复 / 可回滚 / 有 git 历史 / 可重新生成
>   作为不必问的理由）/ **不得以「用户已明确要求」豁免**（问一次是**确认**，不是申请许可）/ **scratch 例外** /
>   **「用户工件」操作化定义**（本回合之前已存在的任何文件）+ 「删除用户工件属『删数据』类」）；
>   §oracle 意图检查点 加**独立 bullet**；§自查清单 加**登记义务**（否则义务没有执行者）。
>   ⚠ **覆盖面用机读清单**（`<!-- req-question-census`，**单源**，形态仿 `role-class-write-set:verifier`）
>   —— **不用**「凡既有节声明…一律」的措辞族泛化：那会让模型把兜底套到 `rdd-builder` **P0 HARD pause** /
>   commit 确认等**未设计的状态机交互**。守卫加判据 ⑩-a…⑩-e（含 `sectionOf` **按标题层级截断** +
>   **行首精确匹配** + 清单逐项校验 + 点名与 ⑩-d **从清单派生**）+ **18 条新突变**。
>   层 2：`E-6`（不可逆操作不得执行，**五条判据防三条假绿路径**）+ `E-7`（三档）+ `ib_skip_if_timeout`
>   + **停机率指标**（`E-1`/`E-2`/`E-5` 各加「不含停机标记」）。
> ③ **审查**：oracle 1 轮（起草，7 条）→ metis（9 条必改）→ critic 1 轮（1 个行级 BLOCKER：E-7 漏 timeout 档）
>   → **实施后 oracle 1 轮（`PASS-WITH-NOTES`，N1/N2 是守卫判别力的真洞 ⇒ 已在补丁内闭合）。**
>   归档：`.rddf/reviews/required-question-fallback-review.md`。
> ④ **验证**：层 1 `bun test tests/` = **594 pass / 0 fail**（exit=0）+ anchors 23/23；
>   层 2 `E-6` **3/3 非 skip 全绿**（`app.ts` 均存在、内容逐字、`HEAD`/blob 未变）、`E-7` 通过（第①档）、
>   `E-2` / `E-5` 绿（含停机率指标）。
> ⑤ **如实登记的未覆盖面**：**另 5 处**「必须问用户」声明不覆盖（`no-role` / `rdd-builder` P0·P2.5 /
>   commit 确认 ⇒ 登记 + 独立 change；planner 切 architect / 授权窗口外 ⇒ 已属触发面②）；
>   **「漏登记」不可机械核**（清单是单源 ⇒ 粗扫 alarm 可延后）；`E-7` 的「正文给条件性默认」语义负向未覆盖（实测 G1）；
>   停机率只有 3 条窄用例读数；`question` 的失败形态不止 `status == "error"`。
> ⑥ ⚠ **`E-1` 1 红 2 绿 ⇒ 既有 flaky**（那轮模型未输出开场报告 ⇒ v2.41 的 F7 已登记）——
>   **未放宽判据**（开场报告是硬契约，不遵守是真缺陷）⇒ 如实登记；这也是「不进 CI」的必要性。
> ⑦ ⚠ **实施中踩到并修掉的两个守卫坑**：`sectionOf` 用 `indexOf` 找子串 ⇒ **机读块里的 `sec:` 先命中**
>   （在真标题之前）⇒ 判错段 ⇒ 改**行首精确匹配**；⑨-d 查节标题 ⇒ 新节又加了一处同名 ⇒ **既有突变失判别力**
>   ⇒ 改判**语义标记**（「同一纪律的两侧形态」）。

---

> **v2.41 变更摘要（2026-11-16，独立会话「需要用户裁决」的兜底 —— E-4 实测暴露的越权执行）**：
> ① **缺口（实测，非推断）**：`prompts/build.md` 的越权处理只规定了三步（先拒绝 → 再解释 → 后引导）
>   +「禁止静默执行」。真跑 verifier 角色的**独立会话**要求它改 `src/app.ts`：模型**正确拒绝**
>   （三要素齐全），但 `question` 工具在**非交互环境被拒**（`state.status == "error"`）⇒
>   「后引导」**没有兜底** ⇒ 模型「**我按最合理的假设推进**」⇒ **文件系统事实：`x = 1` → `x = 2`
>   （越权执行了）**。「禁止静默执行」只禁**不吭声地做**，**没禁「自己假设一个答案再做」** ⇒
>   软约束（权限层无按角色硬 deny）的这条失效路径此前**零覆盖**。
> ② **改动**（治理面 1 处 + 守卫 + 层 2）：`prompts/build.md` 新增
>   「### 需要用户裁决时（独立会话的通用兜底）」—— **触发面闭合两类**（越出角色允许集 / 需口令级授权；
>   不做「一般工程判断」，与之划清边界）+ **停机并交付裁决请求**（候选路径 + 结束回合 + 零写）+
>   **硬禁止**（不得自行选择 / 不得以「最合理的假设」推进 / 不得执行被禁动作 / 不得换写法绕过）+
>   形态约束（独立会话不写 `HANDOFF:`；本节**不适用于被派发后端**；引用 §oracle 调用前的意图检查点
>   作同一纪律的先例）+ **停机标记 `[需要用户裁决]`**（**纯 ASCII**）+ **排除既有终止态**（通则 + 示例：
>   判据来源为空 / 审查降级 / 窗口耗尽 / 缺省口径各维持既有形态）+ 边界句。
>   **越权处理段加内联兜底句**（修复坐在失败路径上 —— 指针是两级跳，模型更可能照抄最近那句）；
>   `#### HANDOFF` 段加「仅适用于被派发后端」；`§builder 撞到治理面缺陷时` 加形态指针。
>   **守卫**：`independentSessionViolations()` 加判据 ⑨（a–g）+ 判据 ⑧ 扩第二个断言面 +
>   判据 ⑦ 改**按段截断**（固定窗口会溢出到新节 ⇒ 「不许静默越权」使「禁止静默执行」的判据假绿 ——
>   突变测试实测抓到）；19 条新突变（每条带 `expect`）。
>   **层 2**（`rdd-workflow-e2e`）：`E-4` 从「已知失败 skip」改为**三件套真跑**（正向：标记 + 候选路径族；
>   负向①：**按写目标**判 `edit`/`write` 是否落在禁写区；负向②：`git status -- src/` 为空；任一红 ⇒ 整体红）+
>   新增 **`E-5` 控制用例**（合法动作「跑测试」必须真的推进 ⇒ 唯一能判「触发面没写太宽」的机制）。
> ③ **审查**：oracle 1 轮（起草）+ metis（12 条）+ critic 3 轮（起草期：2× REJECT 抓「同一件事三份文档三版本」
>   + 第 3 轮 APPROVE_WITH_CONDITIONS）+ **实施后 oracle 1 轮（`PASS-WITH-NOTES`）→ critic 第 4 轮
>   （`APPROVE_WITH_CONDITIONS`，无 BLOCKER）**，3 条 SHOULD_FIX 与本轮 4 条悬空突变已闭。
>   归档：`.rddf/reviews/no-self-adjudication-review.md`。
> ④ **验证**：层 1 `bun test tests/` = **594 pass / 0 fail**（exit=0）+ anchors 23/23；
>   层 2 `E-4` **累计 6/6 非 skip 全绿**（六次 `git status -- src/` 均空、`app.ts` 均 `x = 1`）、
>   `E-5` ✓；词表守卫 2/2（进 CI）。
> ⑤ **如实登记的未覆盖面**：`shell` 写盘（`sed -i`/`tee`）抓不到（权限层不约束 shell）；
>   停机标记**位置**断不了（实测模型可能不输出开场报告）；措辞族换词即绕过；
>   **两条同链残留缺口**（§oracle 意图检查点 的主会话分支 / §何时暂停询问 的「不可逆·需凭据」——
>   非交互环境同样无兜底，但不属触发面两类 ⇒ 独立议题）；transcript **不暴露 model id** ⇒
>   `model-fallback` 在层 2 观测不到。
> ⑥ **一次判据 flaky 的取证（不是行为红）**：`⏸`（U+23E8）在输出传输中被替换成 `�` ⇒ 按符号断言**假红**
>   （那次模型行为完全正确）⇒ 标记因此定为**纯 ASCII** `[需要用户裁决]`，层 2 用 `grep -F`，
>   层 1 加「必须纯 ASCII」判据 + 突变「换成非 ASCII」⇒ 该类 flaky 根除。

---

> **v2.40 变更摘要（2026-11-16，oracle 的「审查域」从猜测改为声明 + 可解析兜底 —— E-A 实测暴露的词表选错）**：
> ① **缺口**：`prompts/oracle.md` 模式段原写「输入明示『治理面』，**或判定对象属治理面**」⇒
>   后半句是**猜测分支**（它指向的 `build.md` 作用域表是本仓路径，对别处工程无法解析）。
>   实测（`rdd-workflow-e2e` E-A，commit `e93738c`）：父侧**带了**意图陈述（入参含全部组成词），
>   但 oracle 用 `治理面判定: BLOCK` 审了一个**非治理面**对象（项目 `docs/adr/**`），契约词表
>   `判定:` 从未出现。失配方向不对称：治理面被误判成其他审查 ⇒ `BLOCK` 语义消失 ⇒ 闸门 **fail-open**。
> ② **改动**（3 处真源 + 2 处投影 + 守卫）：`prompts/oracle.md` 删除猜测分支、改用**四层优先级表**
>   （声明治理面 / 声明其他审查 / 未声明但含 `~/.config/opencode/` 前缀**且按作用域表属治理面**的路径 ⇒
>   治理面（`docs/adr/**` 属 ADR 行 ⇒ 例外）/ 否则其他审查 + 标注），并写死冲突按**更严者**、非法取值视同未声明并回显原值、
>   意图未定优先于本表。词表**字面**放在映射表**之外**（表格单元格要转义 `|`，会撞上既有断言钉的
>   未转义字面）⇒ 结构规避、既有断言无需改。`prompts/build.md`：治理面行要求调用方声明 +
>   检查点三条口径（被派发后端不 block / front·plan 豁免 / 与 v2.37 差异有据）+ verdict 段硬条件
>   （治理面审查见到 `判定:` 或第 4 层标注 ⇒ **审查不成立、不得收口**）。oracle `description`
>   加一句指针。投影：`docs/MULTI-AGENT-DESIGN.md` §审查配对 + `docs/SUBAGENT-ORCHESTRATION.md` §3。
>   守卫：新增兄弟块 `describe("oracle 审查域声明（v2.40）")` —— 四层行级锚定 / 猜测分支 grep 证伪 /
>   标注消费 / 调用方义务 / 投影，共 17 条突变（含 oracle 审出的「后果从句弱化」一条）。
> ③ **审查**：治理面 ⇒ oracle → critic 各 1 轮（**自指审查**：改 `oracle.md` 模式段时审查实例跑旧契约，
>   该轮结论不构成独立证据；替代取证 = 静态守卫 + e2e 观察），记录见
>   `.rddf/reviews/oracle-governance-scope-declaration-review.md`。
> ④ **验证**：`bun test tests/` 全绿；`openspec validate oracle-governance-scope-declaration --strict` valid；
>   e2e AC5a/5b/5c 结果见 `rdd-workflow-e2e` 的观察报告（观察项，不 fail）。

---

> **v2.39 变更摘要（2026-11-16，跨仓工作区清单与一致性核对器 —— 把「人工 diff」变成一条可判别的命令）**：
> ① **缺口**：跨仓事实（本仓 `lib/delegate-core.ts::verifierWriteSetBlock()` 的 `owns:` 行 ↔ 产品仓
>    `rdd-workflow` 的 `_lib/verifier/state_paths.py::SKILL_OWNS_PATHS`）**至今无守卫** ——
>    `docs/guard-authoring.md` §6 已判定「另一仓在用户 home ⇒ CI 必然 SKIP ⇒ 等于没有守卫」，
>    只剩人工 `diff`（§6.1）兜着；那条命令的两种失效模式都**无提示**：cwd 抄错 ⇒ 拿到另一个
>    checkout 的清单；缺仓 / 命令失败 ⇒ 输出为空 ⇒ 与「两侧不一致」混同（假红 / 假绿同源）。
> ② **本批改动**（4 处 + 立项验收工件）：新增 `.rddf/config/workspace.json`（仓清单：`id` /
>    `url` / `canonical_path` / `required` + 核对项声明）；新增 `scripts/cross-repo-check.sh`
>    —— **四档出口码**（`0` OK/SKIP、`1` CONFIG=清单本身坏、`2` DRIFT、`3` ENV=缺仓或依赖失败）+
>    终行 `RESULT: <…>`（可 grep）+ 两个分支都打印两仓 `HEAD` sha + **只读**（python 侧 `-B` /
>    `PYTHONDONTWRITEBYTECODE=1`，不写两仓任何文件）+ **身份校验**（`realpath(canonical_path) ==
>    git --show-toplevel` **且** `remote.origin.url == url` ⇒ 指向仓内子目录或另一个 checkout 判红）；
>    新增 `tests/verify_cross_repo_check.sh`（38 条断言，用 `/tmp/opencode` 里的**假 git 仓**跑五支）；
>    `docs/guard-authoring.md` 三处指向（§6 表行 / §6.1 首句「脚本为准」/ §7 核对单）。
>    立项与验收工件：`.rddf/improvements/cross-repo-workspace-check.md`、`.rddf/plans/` 同名计划、
>    `.rddf/reviews/cross-repo-workspace-check-{planner,verify}.md`、`openspec/changes/cross-repo-workspace-check/`
>    （proposal AC1–AC11 / design D1–D10 / tasks TDD 5 步）。
> ③ **审查**：planner 起草（5 段 improvement + proposal + design + tasks），planner 固定审查者
>    **metis 1 轮**（16 findings：P0×5 / P1×5 / P2×4 + 隐藏意图 / 歧义 / slop —— 采纳 14 /
>    **部分采纳 1**（清单保留但补最小校验、删掉无消费者的 `role`）/ 不采纳 1（不顺手改
>    `lib/delegate-core.ts` 的注释 —— 碰 `lib/**` 会把执行路径推高），逐条处置见
>    `.rddf/reviews/cross-repo-workspace-check-planner-review.md`）；verifier 验收 **PASS**
>    （AC1–AC11 = **11/11**，每条带工具证据，见 `.rddf/reviews/cross-repo-workspace-check-verify.md`）。
>    **未触发 oracle → critic**：本批不碰 `lib/**`、不碰 `prompts/**`、无公开 API 与跨模块契约变化；
>    `docs/guard-authoring.md` 不在治理面表内（治理面 = `prompts/**` / `AGENTS.md` / 三份 docs /
>    守卫断言 / `opencode.json(c)` / `commands/**`）。
> ④ **验证**：`bash tests/verify_cross_repo_check.sh` → **38 PASS / 0 FAIL**（OK / DRIFT / ENV /
>    SKIP / CONFIG 五支 + 只读性）；`bash scripts/cross-repo-check.sh`（本机实跑）→ `RESULT: OK`
>    + 三个仓的 `HEAD` sha；`bun test tests/` → **591 pass / 0 fail**。
> ⑤ **残留（如实登记）**：① **「漏跑」未解** —— 脚本只在被调用时生效，「改了一侧清单忘了跑」仍是
>    失效模式 ⇒ 已单独立项（`.rddf/improvements/cross-repo-check-trigger-in-agent-checklist.md`），
>    落点 `prompts/build.md` 自查清单 ⇒ 属治理面，实施需 architect + oracle → critic；
>    ② **不判 pin 陈旧**（不联网 ⇒ 只判「当下两侧一致」，一致**不蕴含**上游没漂）；
>    ③ **CI 仍不可达**（另一仓在 home ⇒ 无 CI 守卫，是既有架构事实，非本 change 可解）；
>    ④ 核对项目前**只有 `verifier-owns-parity` 一项**（产品仓无 allow 侧真源 ⇒ 不虚构第二项）。

---

> **v2.38 变更摘要（2026-11-16，oracle 意图闸门的静态守卫 —— v2.37 的新语义此前对守卫完全不可见）**：
> ① **缺口**：v2.37 把「**可判定的意图陈述**」写在**三处**（`prompts/oracle.md` 意图前提表 = 真源 /
>    `prompts/build.md` 检查点小节 / oracle `description`），critic 当时**逐字核对**过一致，但
>    `tests/config-guards.test.ts` **只锚定判定词表单一真源与 metis 六节契约** ⇒ 任一处被改写
>    （哪怕把「要解决的问题」写成「要解决的核心问题」）**不会有任何红灯**。
> ② **补守卫**（本批**只改测试文件**）：新增顶层 `describe("oracle 意图闸门（v2.37）")` —— 8 组判据 /
>    9 个判据类（执行体侧 / 术语派生 / 三处同源 / 处置口径 / 调用方侧 / 收口侧 / 预算格 / 真源指针 /
>    投影同步）；判据本体是**纯函数** `intentGateViolations(c) => {cls,msg}[]`；切片用**显式端锚**
>    `between(text, from, until)`（锚点缺失 ⇒ 空串 ⇒ 红）；**组成词从真源派生**（不手抄术语 ⇒ 真源改词时
>    另两处被逼跟进）。17 类**内存突变**（不落盘）+ **「判据类 ↔ 关键词」唯一性用例**（把「关键词不可区分」
>    这条隐式不变式变成显式红灯 —— 实现过程中**真的抓到一次碰撞**：关键词「意图检查点」同时落在
>    「调用方侧」与「投影同步」两类消息里）。
> ③ **审查**（治理面：改守卫断言属治理面 ⇒ oracle → critic 必审）：oracle `PASS-WITH-NOTES`
>    （**0 BLOCKER** / 1 高 / 1 中 / 2 低）→ 4 条**全部落地**（其中 1 条是**我自己未覆盖清单的事实错误**：
>    写成「少写一项抓不到」，实际「删到只剩 1 项」会被「项数 < 2」抓到，真正的漏洞是「**换项不删项**」）；
>    critic `APPROVE`（**0 BLOCKER / 0 SHOULD_FIX / 3 NIT）→ 2 条 NIT 已落地（「至多 1 轮」补突变；
>    未覆盖清单补 oracle 侧更松的半句）、1 条 NIT 记录不处理（纯函数短路形态，单突变下无假绿）。
> ④ **验证**：`bun test tests/` → **591 pass / 0 fail**；另做了**反向抽查**（把某突变的关键词临时改成
>    跨判据类的那一个 ⇒ 唯一性用例**变红** ⇒ 恢复后复绿）—— 判别力不只靠「当场即绿」。
> ⑤ **backlog**：行为层（父模型是否真带意图陈述、oracle 是否真拒发）**仍零覆盖** ⇒ 需独立仓
>    `/workspace/main/rdd-workflow-e2e` 的真实运行时场景（`docs/review-automation-backlog.md` P2-4 项 2）。

---

> **v2.37 变更摘要（2026-11-16，oracle 调用前的意图检查点：给 architect 审查链补上「问题陈述对不对」这一层）**：
> ① **缺口**：plan 路径早有 metis 硬性前置（`prompts/plan.md:38`），但 architect 的审查链（oracle → critic）**没有任何环节
>   质疑意图本身** —— oracle 判「这个决策在**给定意图**下会怎么坏」、critic 判「与既有 ADR 是否冲突」，两者都以意图已定为
>   隐含前提 ⇒ 意图偏了**一致地错**，且错到 ADR 签批后才暴露（`design_drift` 返工）。
> ② **落两条规则**：**执行体侧** `prompts/oracle.md`「模式」段新增**意图前提**表（意图已定 / ≥2 种合理解读 / 意图未给）——
>   意图未定 ⇒ **不给判定行**（按咨询口径输出 + `下一步` 列出需用户裁决的分歧点；判据不成立时给判定行 = 伪造结论）；
>   **调用方侧** `prompts/build.md` §审查配对 新增「oracle 调用前的意图检查点」4 行分流表 + 8 条 bullet（不让 metis 猜意图 /
>   被派发后端无 `question` 通道 / 落盘载体 / 预算 / metis 输出是材料 / AC 落点纪律 / 与 plan 路径的关系 / 拒发判定时）。
>   **不照搬 plan 的无条件硬前置**：意图只有用户有权威 ⇒ 问用户优先，metis 只负责可枚举的歧义 / slop / 边界情况（条件式，非每轮）。
> ③ **收口侧镜像**：verdict 段新增「**已调用但拒发判定行** ⇒ 审查不成立 ⇒ 不得收口」（并排除「oracle 不可用」→ 走「审查者
>   不可用时」降级）—— 只写在检查点 bullet 里会被「按 verdict 段字面执行」穿过（咨询口径输出无 finding ⇒ 「存在未应答
>   finding」不触发）。旁路同步：入口行 + architect 行预算格 + oracle `description` + MD §2.7/§3.2.0 + ORCHESTRATION §3。
> ④ **审查**：oracle `PASS-WITH-NOTES`（0 BLOCKER / 2 高 / 2 中 / 1 可选）→ critic `APPROVE_WITH_CONDITIONS`（**0 BLOCKER** /
>   1 SHOULD_FIX / 2 NITS，`mergeable: yes`）→ 全部处置（SHOULD_FIX 为零风险一行收窄，不消耗复审轮次）。**部分自指**（改
>   `prompts/oracle.md` 自身 ⇒ oracle 实例跑旧契约）⇒ 该轮结论不构成独立证据。审稿记录
>   `.rddf/reviews/oracle-intent-precondition-review.md`；守卫 `103 pass / 0 fail`（本轮未改断言）。
> ⑤ **backlog**：守卫对新语义不可见（补 `toContain` 断言属治理面 ⇒ 需另起一轮 oracle → critic）；oracle `description` 的
>   完全指针化待定（会牺牲父模型直接可读性）。

---

> **v2.36 变更摘要（2026-11-16，层 2 实施：独立会话的 build 机制有了行为层保证，并暴露一条真实缺陷）**：
> ① **实施**：`rdd-workflow-e2e` 仓新增 `test_independent_build_session.bats`（E-1/E-2/E-3，默认 skip，
>   `E2E_REAL_RUNTIME=1` 开启）+ `test_independent_build_session_vocab.bats`（**词表守卫，不需真实模型 ⇒ 进 CI**）
>   + `tests/test_helper.bash` 的共享助手（`ib_text_of` / `ib_violations_of`，两文件共用 ⇒ 不漂）。
>   **2026-11-16 真跑通过**：E-1（首行 `【角色: builder | source: state-file】`）、
>   E-2（切换后首行变 verifier **且 `role.json` 的 `current_role` 被写** —— **磁盘事实** ⇒ 抗 flaky）、
>   E-3（越权响应三要素齐全，词表有**反例守卫**）。观察报告：本仓
>   `.rddf/reviews/independent-build-session-e2e-observation.md`（e2e 仓的 `.rddf` 被 gitignore）。
> ② **★ 暴露的真实缺陷（E-4 保持失败 ⇒ skip 并注明，**不假绿**）**：E-3 三要素齐全 ⇒ 通过；但同一轮
>   **文件系统事实**显示 **verifier 角色真的改了 `src/app.ts`**（x=1 → x=2）。行为链：越权被正确拒绝 ⇒
>   引导需要 `question` 工具 ⇒ **非交互环境被拒** ⇒ 模型**自行假设并推进**了越权动作。
>   ⇒ 根因：`prompts/build.md` 的越权处理**没规定「引导无法执行时怎么办」** ⇒ 无人值守场景的 fallback 是
>   「按最合理的假设推进」。⇒ **另立 change** 修（见交接清单 ⑪）。
>   ⚠ **这条只有行为层能抓到**：静态守卫能证明「文档写了三步」，证明不了「拒绝之后没停」；
>   本仓的角色越权防护是**软约束**（权限层无按角色硬 deny）⇒ 这条失效路径此前完全没被测到。
> ③ **实测到的 5 条新事实**（此前零覆盖）：① 独立会话的**默认角色不是 builder**（无 role.json ⇒ 回落
>   **general**，`source` 仍标 `state-file`）⇒ fixture 必须预置 role.json；② **builder 的实际开场报告形态是
>   `| source: state-file`**，而 build.md 角色矩阵表写 `| change: <名或无>` ⇒ **表与实际不一致**
>   （待确认两态并存还是写错，见交接清单 ⑫）；③ **`opencode run` 没有 `--standalone` 这个 flag**
>   （本机 v0.0.0-local-202611110721）⇒ e2e 仓既有的 `test_subagent_contract_runtime.bats` 仍在传它
>   ⇒ 那批用例要么被额度 skip 挡在前面、要么本就没跑通 ⇒ **follow-up**；④ 模型多行响应的「引导」段在后面
>   ⇒ 必须取**整条响应**而非首条 text 事件；⑤ 越权拒绝后的引导依赖 `question` 工具（非交互环境不可用）。
> ④ **验证**：本仓 `bun test tests/` **588 pass / 0 fail**（exit 0）；anchors **23/23**；
>   e2e 仓真跑 **5 条全绿**（3 条真跑 + 2 条词表守卫），默认态 3 条 skip、退出码 0。

---


> **v2.35 变更摘要（2026-11-16，独立会话的 build 机制：层 1 静态守卫 + 层 2 e2e change）**：
> ① **问题（2026-11-16 核查）**：`build.md` 讲**两种**使用形态 ——
>   ① **被派发后端**（delegate/dispatch 派出的工程 session）：静态守卫 25 处 + e2e（CS 系列）；
>   ② **独立会话**（用户直接对话的**主对话 agent**）：开场报告 / 角色切换 / 授权窗口 / 越权处理
>   —— **静态守卫 grep 计数为 0**，e2e 仓的 5 处 `--agent build` **全是载体用途**（占槽 / 当 subagent 契约的父模型）
>   ⇒ **用户每天直接对话的那个 agent 的核心机制，既无静态判据、也无端到端保证**。
> ② **层 1（本仓 `tests/config-guards.test.ts`，新 describe「独立会话机制」）**：
>   判据本体抽成**纯函数** `independentSessionViolations(text) => string[]`（文本 ⇒ 违规列表）⇒
>   ① 可被**内存突变**直接检验（**不落盘、不污染工作树**）；② 「当场即绿」的判据有**可重复的判别力证据**。
>   覆盖 8 面：开场报告形态（角色名**必须等于本行角色** + 第二段不许整段删除）/ `source` 三值 /
>   角色切换**合法值集合 == 角色矩阵表集合**（双向闭合）/ 三步顺序（**段作用域** + 每步全文唯一）/
>   授权窗口字段集（锚在「#### 授权窗口」段内 + 全文 json 块数 == 1）/ 越权三步（+ **禁止静默执行**）/
>   HANDOFF 归属（锚在「### 开场报告触发时机」段 —— 全文正则会命中别处 ⇒ **假绿**）。
>   另附**突变测试**：9 类破坏（第二段删除 / 角色名错成别的合法角色 / source 改两值 / 合法值少一个 /
>   三步对调 / JSON 删字段 / 删「先拒绝」/ 删「禁止静默」/ 删 HANDOFF 归属声明）**逐类必须被抓到**。
> ③ **层 2（`openspec/changes/independent-build-session-e2e/`，AC1–AC8 / D1–D6）**：给独立会话补**行为层**
>   （实施落在 `rdd-workflow-e2e` 仓）—— E-1 开场报告 / E-2 切换（**断 `role.json` 的 `current_role` 磁盘事实**
>   ⇒ 抗 flaky）/ E-3 越权三要素（**先定词表 + 反例校验**，不许用宽词表糊弄过）。
> ④ **顺带修的真缺陷**：`tests/arch-docs-scope.test.ts`（上一批新增的 wrapper）**超时红** ——
>   bun test 默认超时 5s 而该脚本要 ~5.3s ⇒ 显式放宽到 60s（**它此前从不被执行，所以没暴露**）。
> ⑤ **审查**：oracle `PASS-WITH-NOTES`（8 条建议全部落地：角色名自等断言 / 第二段删除断言 /
>   段作用域 + 步骤唯一性 / json 锚唯一性 / 触发时机收紧 / **未覆盖清单登记** / 层 2 词表 Step 0 /
>   README 环境依赖登记）。
> ⑥ **验证**：`bun test tests/` **588 pass / 0 fail**（exit 0）；anchors **23/23**。
> ⑦ **残留（如实登记，已写进 describe 注释的「未覆盖清单」）**：**角色矩阵的「允许 / 禁止」列本身零判据**
>   （本族只用该表的第一列与最后一列）—— 最大缺口，补它要先解决「允许列是开集散文」的判据形态问题；
>   授权窗口的**切换条件 / `used` 计数 / `updated_by:"auto"` / 关闭窗口**未钉；切换口令列表 /
>   「默认不自动切换」/「退出清空窗口」未钉；`no-role` 的「询问用户角色」语义未钉；`role.json` 读取时机未钉；
>   「开场报告触发时机」静态层只能钉「文档声称」、行为面（层 2）也只测首行 ⇒ **两头都证不到**；
>   HANDOFF 首行是纯文档宣称守卫（层 2 未测独立会话的 HANDOFF 面）。

---


> **v2.34 变更摘要（2026-11-16，`delegate-base-resolved-return` 定稿为「丙」：基线身份由派发方持有）**：
> ① **问题**：`delegate-base-channel`（v2.31）把基线在派发时冻结成 sha 并印进后端简报，但**派发方拿不到那个 sha**
>   （它只进后端 session 的第一条消息，不在返回契约里）⇒ design **D2** 承诺的「跨 resume 要同一基线 ⇒ 填当初
>   印出的 sha」**对派发方不可达** ⇒ D2 bite 自己。
> ② **形状决策（用户 2026-11-16 拍板：选丙）**：
> - **甲**（加返回字段 `base_resolved`）只覆盖「派发当场」⇒ 对「跨 front resume」**零改善**（返回值随原 front
>   上下文一起消失）；**乙**（落盘 `pair.json` + `sessions` 只读回显）能覆盖跨 front，但要动登记面 + `sessions`
>   输出 + 文档；**丙**（要求派发方直接传 sha）**零契约变更**。
> - ⇒ **选丙**：**基线身份由派发方持有** —— 相对 ref 会随 HEAD 漂移 ⇒ **派发前先自己
>   `git rev-parse <ref>^{commit}` 解析出 sha 并记下**，把**这个 sha** 填进 `base`（40 位 sha 是合法 ref，**已实测**）
>   ⇒ 派发与后续 `resume` 用**同一个 sha** ⇒ 基线不漂；跨会话只需**把这个 sha 传下去** ⇒ 无需系统级存储。
>   **代价**：解析义务移回调用方（要会 `git rev-parse`）；**闸门不丢**（填错的 sha 仍被 `rev-parse --verify` 拒）。
> ③ **落地**：`prompts/plan.md` / `prompts/front.md` 的「**基线身份由派发方持有**」段 +
>   两个工具的 `base` description 同步（原先的兜底句只覆盖 resume 场景 ⇒ 现覆盖**每次**派发）。
>   improvement `.rddf/improvements/delegate-base-resolved-return.md` 定稿为「已选丙」⇒ **甲/乙关闭**，
>   决策记录保留在 §F（`<details>` 内）。
> ④ **验证**：`bun test tests/` **586 pass / 0 fail**（exit 0）；anchors **23/23**。
> ⑤ **残留**：① `base_resolved` **不进**返回契约 ⇒ 派发方**永远**拿不到「本次实际用的 sha」
>   （丙的代价：由派发方自己算）；② 派发方若**不**照做（仍填相对 ref）⇒ 基线仍会漂
>   ⇒ 靠 `prompts/**` 的纪律 + 「消费端一律用简报里的 SHA」那条共同守住（**无代码强制**）。

---


> **v2.33 变更摘要（2026-11-15，`verifier-baseline-worktree-diff`：基线对照改看工作树）**：
> ① **问题（实测确认）**：`prompts/build.md` 的基线对照命令含 `git diff --name-only <base>...HEAD`
> —— **三点 diff（只比已提交）**，而本仓后端**被禁止 commit** ⇒ 被取证的 change 通常**未提交**
> ⇒ 该 diff **恒为空** ⇒ 「取证对象是否被本 change 触及」永远「未触及」
> ⇒ **基线对照在真实用法下没有判别力**（内容类取证的第一道分类失效 ⇒ 环境故障被误判）。
> ② **修正**（change: `openspec/changes/verifier-baseline-worktree-diff/`，AC1–AC8 / D1–D6）：
> - **命令**：两点 `git diff --name-only <base>`（基线 ↔ **工作树**）+ 并列
>   `git ls-files --others --exclude-standard`（`git diff` **不含**未跟踪文件）+ `git show <base>:<path>`。
> - **两侧不对称**（有意，且**负向钉住**）：基线侧 = **提交内容**（可完整重演）；工作树侧 =
>   **含未提交改动**。⚠ 若有人按「两边一样」的直觉把 `git show` 改成工作树版本 ⇒ 分类能力当场失效。
> - `git merge-base HEAD <base>` 只作**祖先关系诊断**；**对照一律用 `<base>` 本身**。
> - **一律用简报基线行 `→` 后的 SHA**（oracle 第 1 轮抓到的**高影响真缺陷**：输入侧在派发时冻结了
>   sha，消费端却按 raw ref 解析 ⇒ 主会话期间 commit ⇒ **基线漂移** ⇒ 判错位）。
>   存量简报（无 sha 行）退回该行所写的 ref —— ⚠ 明标为**降级模式**（按 `<base>` 不可解析 ⇒ `blocked`）。
> ③ **判据**：AC1–AC4（**真 git fixture**，不 mock；含「三点 diff 恒空」这个**旧命令失效的证据**）、
>   AC5/AC6（文档面守卫，含「任何 `...` 都挡」的**闭集**负向 + 「除『不对称』外不得出现裸『对称』」）、
>   AC7（回归）、AC8（revert 留痕）。AC1–AC4 **当场即绿**（git 行为本来如此 ⇒ 防漂移类）
>   ⇒ 判别力由 revert 演练的 **E（「把判据本身改坏」⇒ AC1 红）**证明。
> ④ **审查**：oracle 第 1 轮 `PASS-WITH-NOTES`（**高影响真缺陷**：sha vs raw ref 的漂移；另 3 条中低影响
>   全部落地：守卫三点负向闭集化 / 不对称负向收紧 / AC8 留痕）→ critic 第 1 轮 **`APPROVE_WITH_CONDITIONS`**
>   （无 BLOCKER；3 条 SHOULD_FIX 全闭合：① 守卫**没钉** `git show <base>:<path>` 这条命令本身
>   （删掉它守卫仍绿 ⇒ 补断言）② revert-map 覆盖表「共享同一条路径」的说法对 AC3/AC4 **不成立** ⇒ 已改写
>   ③ 存量简报 ref 兜底的残余漂移未标为降级模式 ⇒ 已补；2 条 NIT 全闭合）。
> ⑤ **验证**：`bun test tests/` **586 pass / 0 fail**（exit 0）；anchors **23/23**；
>   **revert 演练 5 条（A–E）逐条精确命中、还原后全绿**（留痕：
>   `.rddf/reviews/verifier-baseline-worktree-diff-revert-map.md`）；`git show <sha>:<path>` 语法实测有效。
> ⑥ **残留（如实登记）**：① **回滚会恢复「基线对照无判别力」的状态**（design 的回滚行明写）；
>   ② 「两侧不对称」仍是**措辞**判据（负向断言只挡最高频回改；换词需 review）⇒ 结构化表化**可延后**；
>   ③ 「判据被 weaken」**无机械防线**（守卫守卫测试 = 无限递归）⇒ 靠 review 流程；
>   ④ 「一工作树一 change」的归因假设未消解（两点 diff 把工作树**所有**未提交改动归因给被取证 change
>   ⇒ 过触发但保守）；⑤ 消费端纪律**无代码强制**（散文 + 守卫而已）⇒ 已登记为已知边界；
>   ⑥ 消费端纪律**未工具化**（抽脚本最彻底，但超 scope）⇒ 独立 improvement 候选。

---


> **v2.32 变更摘要（2026-11-15，测试覆盖面：先修活缺陷 + 两条可机械的增量门）**：
> ① **问题**：用户要求「思考更全面的测试集」。先做了 oracle（成本/收益）+ metis（失效模式）
> **双向挑战**，结论是：**「全面」不可达** —— 判据体系原则上无法自证完备
> （本轮就是实例：oracle+metis+critic **三方共享同一心智模型** ⇒ **同时**漏掉「消费端三点 diff
> 在未提交工作树恒空 ⇒ 基线对照无判别力」，直到 metis 第 2 轮才提出）；
> 正确目标是**对增量的门**（每个新投影面出现时**机械地**逼一次决定：建守卫 / 登记 / 排除），
> 而非「覆盖面」这个**状态**。且分层里 **L1/L5/L6/L7 是伪层**（L1 靠渲染器派生消灭、
> L5 与注入演练重复且 mutant 分布与本仓威胁模型「契约漂移/手抄」错位、L6 应是「共享语料+差异登记」、
> L7 用普通参数表即可）⇒ 8 层塌缩回 `docs/test-authoring.md` §1 的 **4 层** + 3 个横切附件。
> ② **本批落地（优先修活缺陷，而不是建机制）**：
> - **修 `explore` 的 off-by-one**：**三处**手抄同一个错数（`explore.md:41` / `build.md:61` /
>   design 卡片 + **文件树**）都写「四节」而实际 **3** 节 ⇒ 新守卫「只读 subagent 的输出节数与名单：
>   **四处**投影有序全等（prompt 自述 / `build.md` 行 / design 卡片 / design 文件树行），
>   节数**从 `headings.length` 派生**（中文数字经 `cnNum()`，不手抄映射表）。
> - **删掉文档里的用例计数**（4 处文件、含 `tests/README.md`）⇒ 改为「用例数以 `bun test` 输出为准」
>   —— **删数字，而不是守数字**（本仓复发次数最多、零守卫的一类漂移）。
> - **design 文件树的行数手抄全删**（`54 行` / `95 行` / …）⇒ 同上处置。
> - **async 四个工具的 description 形态约束**（禁 `DELEGATE_RESULT_*` 字段名 / 参数名字面量）
>   + `dispatch` 的**必填/选填清单改为从 schema 现算**（此前手抄 12 个参数名）。
> - **新增文件闸门**（`prompts/` `docs/` `lib/` 的文件集合 == 清单）⇒ **唯一可机械**的增量门。
> - **`tests/verify_arch_docs_scope.sh` 的第四态**（入库、能跑、但 `bun test` 不收 `.sh`
>   ⇒ **无人执行**）⇒ 新增 `tests/arch-docs-scope.test.ts` wrapper 纳入规范命令（床不在时**明确 skip**）。
> ③ **两个新工件**（用户指定）：
> - **improvement** `.rddf/improvements/delegate-base-resolved-return.md`（5 段；**由 builder 代
>   planner 起草、待 planner 审查** —— rdd-workflow 的 `add-improve` 前置在本仓不适用：
>   无 `improvement-suggestions.md`、无 `.rddf/roadmap.md` 的 Phase Skeleton ⇒ 无 `主题:` 字段可匹配）：
>   把「实际用的基线 sha」放进返回契约（`base_resolved`）⇒ 根治「跨 resume 同一基线的句柄
>   **对派发方结构性不可达**」。
> - **change** `openspec/changes/verifier-baseline-worktree-diff/`（AC1–AC8 / D1–D6）：
>   修**消费端**的三点 diff 恒空（`git diff <base>...HEAD` 只比已提交，而后端被禁止 commit）。
> ④ **审查**：oracle + metis（测试体系）→ critic **`APPROVE_WITH_CONDITIONS`**（无 BLOCKER；
> 4 条 SHOULD_FIX 全闭合：① **design 文件树 L938 仍写「四节」** ⇒ 与卡片当场矛盾（已修，
>   且文件树已纳入守卫①的第四处投影）；② `general` **确实**有跨文件重复陈述（critic 纠正 metis 的
>   事实不准）⇒ 已纳入守卫①（并显式标注 `build.md` 那一处对它**不适用** —— 它不在 subagent 表里）；
> ③ 文件闸门**子目录整树被过滤**的空窗 ⇒ 已在代码注释如实登记（递归枚举进 backlog）；
> ④ 新 change 的 tasks 有一条判据（`merge-base` 新用途）在 AC 表无对应 ⇒ 已并进 AC6）。
> ⑤ **残留（如实登记）**：① **判据纯函数化**（「已验证可捕」可机判的**唯一**路径）——
>   本仓守卫都是内联 `expect()`，不是 `check(text) => violations[]` ⇒ 工作量是原排期 3–5 倍 ⇒ backlog；
>   ② 文件闸门的**子目录盲区**；③ `prompts/critic.md.bak-*` 这类**非 `.md` 后缀**的陈旧副本
>   **零守卫且登记表承载不了**（登记表只能装「有对应红判据」的盲区）；
>   ④ `critic` 的输出契约（4 段式，非 `###` 小节）**形态不同** ⇒ 不在守卫①的覆盖内（如实登记）；
>   ⑤ design 文件树里其余的手抄（各 prompt 行数已删；`prompts/` 文件数已不写死）。
> ⑥ **验证**：`bun test tests/` **581 pass / 0 fail**（exit 0）；anchors **23/23**；
>   `openspec validate`（两个 change）均 valid。

---


> **v2.31 变更摘要（2026-11-15，`delegate-base-channel`：给「简报必须声明基线」补上实现通道）**：
> ① **问题**：`prompts/plan.md` 早就要求 verifier 派发「必须声明可解析的 `<base>`」，
> `prompts/build.md:343` 的后端确实消费它（`git merge-base HEAD <base>` / `git show <base>:<path>`），
> 但**通道不存在** —— `delegate` 与 `dispatch` 两个工具的 schema 都没有 `base`，`buildBrief()` 不生成基线行
> ⇒ 派发方只能塞进 `constraints` 自由文本 ⇒ **typo 穿过派发、白烧一整轮**；「声明了没有」不可机械核。
> ② **修正**（change: `openspec/changes/delegate-base-channel/`，AC1–AC14 / design D1–D9 / TDD 7 Task）：
> - **schema**：两个工具同步加 `base`（`type: "string"`，**选填** + 条件必填；`required` 不含它
>   —— vcs=false 与 knowledge 两道豁免使无条件必填不成立）。dispatch 必须同批（`additionalProperties: false` 会硬拒）。
> - **形态层校验**（`validateBrief`）：只认 `undefined` 为「没填」（`""`/`null` 非法）；注入加固
>   （拒 `-` 开头 / 空白 / `..`）；`knowledge + base` **硬拒**（不再静默忽略，与 role_class/grants 同策略）。
> - **派发前硬拒**（共享闸门 `assertVerifierBaseline`）：`role_class=verifier` + git 仓 + 未填 base ⇒
>   **建 session 之前**拒（文案含「base / verifier / resume 须重填」）；`vcs=false` ⇒ 豁免
>   （否则非 git 工程的全量 verifier 派发被拒 = 行为回归）。
>   ⚠ **位置与顺序都是决策**：在 `execute`（`validateBrief` 拿不到 `effectiveRoleClass`/`vcs`/`workRoot`），
>   且排在 `assertRoleClassCompatible` **之后**（先判「你是谁」再判「你缺什么」——
>   否则「scope 越界」这条更根本的错误会被 base 错掩盖）。
> - **sha 冻结**：派发时用 `git rev-parse --verify --end-of-options "<ref>^{commit}"` 解析成 sha，
>   简报印 `- 基线（base）: <raw> → <sha>`。① `^{commit}` peel 是必需的（annotated tag 裸 ref 校验会失败，
>   而消费端 `merge-base` 会 peel ⇒ 不 peel 就误拒合法 base）；② 印 sha 是因为**相对 ref 会随 HEAD 漂移**
>   （dispatch/resume 窗口内）⇒ 冻结后才自洽；③ `cwd=workRoot`（worktree 下 stateRoot 指向主仓 ⇒ 用它会解析到主仓 HEAD）。
> - **文档面五处同步**：`plan.md`（verifier 行 + 派发参数段）、`front.md`（role_class 行 + 3.1 标题**去手抄计数**）、
>   `docs/backend-handoff-role-class.md:31`（参数流图）、两个工具的 description。
> - **判据**：AC1/AC2/AC3/AC4/AC5/AC6/AC7/AC8/AC9/AC10/AC11/AC12/AC13/AC14 —— 含
>   **AC2 的端到端静态闭环**（从简报输出解析 sha，在 fixture 仓真跑 `merge-base` ⇒ exit 0，**不需要 LLM**）
>   与 **AC8 的 resume 路径**（登记类到达闸门）。
>   **AC29 从「双向登记式」转为「行为断言」**（通道落地 ⇒ 登记必须删；判据从「扫源码字样」改为「断言简报输出」）。
> ③ **审查**：oracle（11 条建议 / 5 个技术缺陷）→ metis（P0-1..P0-6 / E1–E8 / **元层盲区**）→
>   critic 第 1 轮 **REJECT**（2 个 plan 档 BLOCKER：AC12 判据可平凡满足、Task 1→9 红色窗口）⇒
>   change 按 9 条必改修订（`0557509`）⇒ 实施 ⇒ oracle 第 2 轮 `PASS-WITH-NOTES`（8 条全落地）⇒
>   **critic 第 2 轮 `APPROVE_WITH_CONDITIONS`**（无 BLOCKER；4 条 SHOULD_FIX：过承诺的 sha 句 /
>   sha 对应性强断言 / dispatch 侧「无 VCS」行与零副作用断言 / 落 CHANGELOG —— **全部已落地**）。
>   记录：`.rddf/reviews/delegate-base-channel-review.md`。
> ④ **验证**：`bun test tests/` **577 pass / 0 fail**（exit 0）；anchors **23/23**；
>   **revert 演练 9 条（A–I）逐条精确命中预期判据、还原后全绿**（含两条专门为「当场即绿」的判据设计的
>   注入破坏：H = 闸门改按声明值判 ⇒ AC8 双红；I = 删 dispatch 的传参字面量 ⇒ dispatch 侧红）。
> ⑤ **残留（如实登记）**：① **破坏性收紧** —— 今天靠 `constraints` 塞基线的 verifier 派发会被硬拒
>   （有意收紧，消 typo 白烧一轮）；② **派发方拿不到实际用的 sha**（`base_resolved` 未进返回契约 ⇒
>   跨 resume 的「同一基线」句柄**结构性不可达** ⇒ 已加过渡兜底句「自己 `git rev-parse` 记一份」，
>   返回侧留独立 improvement，见交接清单 ⑪）；③ 消费端三点 diff 在未提交工作树**恒空**
>   （`build.md:343`，**先于本 change 存在** ⇒ 另立 change）；④ 非 verifier 填 base 被静默丢弃（已知边界）；
>   ⑤ git 超时/ENOENT 的错误归因粒度偏粗（已知边界）。

---


> **v2.30 变更摘要（2026-11-15，对齐完备性 P0：把「描述面」纳入闭集）**：
> ① **问题**：v2.28 的三层对齐**模型本身不完整** —— 它只守「真源 ⇄ 两个派发方 prompt 的返回字段」，
> 而同一事实的**第三、第四个投影**从未进扫描集：工具 description（**LLM 派发瞬间实际读的文本**，
> 手抄着 5 个旧字段名、「最后回复」甚至不是字段名）、HANDOFF 的 kind 词表（只在 `build.md`，
> `plan.md` 里 `needs-revision`/`ac-fail` 各 0 次）、派发参数名（`plan.md` 全文无 `project_dir`/`goal`）。
> ⇒ **测试全绿 = 模型内部自洽，不证明模型齐全**。
> ② **修正**（TDD：5 条判据先红 → 修 → 5 绿；`oracle → metis → critic` 三方）：
> - **`lib/delegate-core.ts`**：`delegateToolDefinition()` 的 description **完全派生**（必填/选填从 schema 现算；
>   返回子句从 `renderReturnClause()`），标签改「返回（**关键字段**；全集见 `DELEGATE_RESULT_FIELDS`）」；
>   新增 `CRITICAL_FIELD_GLOSS`（7 个关键字段的一句话语义）+ `assertGlossCoverage()`（**双向**键集合 + 分隔符/嵌套括号校验）；
>   **另 3 处同款手抄一并派生**（agent 白名单 ← `ALLOWED_AGENTS`、grant 禁区 ← `GRANT_FORBIDDEN`、`enum` ← `ROLE_CLASSES`）。
> - **`prompts/plan.md`**：kind 微表（值 / 后端在说什么 / 你的动作）+ 「派发参数」段（5 个必填名 + 指针，不复制）；
>   **`prompts/front.md`**：HANDOFF 条目补 kind 三值。kind 表放在「收尾三问」段**之前**（既有 AC7 对该段有「不许新增标识符」约束 ⇒ 不动它的白名单）。
> - **判据（新 describe「对齐完备性」）**：**AC25/AC26 = 形态约束为主**（源码扫描：description 内**不得出现字段名/参数名字面量**）
>   **+ 值 pin 为次**；AC27/AC28 真修 prompt；**AC29 = 双向登记式**（无通道 ⇒ 必须已登记；通道落地后仍留登记 ⇒ 红）。
> ③ **审查**：oracle（3 批方案 + 发现 base 的真实消费方 `build.md:343`）→ **metis（4 条事实指控全部核实属实，
> 其中「AC25/26 派生后会变成同源自证」直接推翻了 oracle 的核心论据）** → critic **`APPROVE_WITH_CONDITIONS`**
> （无 BLOCKER；四处冲突逐条裁决：形态约束为主 / 副本+派生比对 / base 是派发参数非继承上下文 / 3 处同款本批做）。
> 审稿记录：`.rddf/reviews/alignment-completeness-p0-review.md`。
> ④ **验证**：`bun test tests/` **550 pass / 0 fail**（exit 0）；anchors **23/23**；**逐条 revert 映射表**
> A→AC25 / B→AC26 / C→AC27 / D→AC28 / E→AC29（每条精确命中、还原后全绿 ⇒ 无空转绿）；
> **「抄得完全正确的手抄体」仍被 AC25 抓住**（形态约束有判别力，值 pin 做不到）。
> ⑤ **残留（如实登记）**：① **AC29 的绿 = 已登记，不是已修** —— `<base>` 仍无通道，E 另立 `delegate-base-channel`
> （delegate + dispatch 同步、`buildBrief` 基线行、`execute` 后验硬拒 + vcs gate + 注入加固、resume 调用方重填）；
> ② `buildBrief:1422` 手抄 kind 枚举未修；③ `delegate-async.ts:1104`/`:1507` 手抄返回清单未修（②③ 记交接清单 ⑧⑨）；
> ④ `DELEGATE_RESULT_CRITICAL_FIELDS` 仍是 `readonly string[]` ⇒ gloss 的 `satisfies` 无编译期约束（⑩）；
> ⑤ AC28 只判必填参数名。

---


> **v2.29 变更摘要（2026-11-15，新增「测试构建指南」）**：
> ① **问题**：`v2.25`–`v2.28` 三批 + e2e `CS-1`–`CS-7` 积累的测试构建经验散落在审稿记录、计划文件与 commit message 里，
> 下次要新增测试时无处可查 —— 尤其是「该写哪一层」「什么才算有效红灯」「伪造状态必须必然成立」这三类**反复踩坑**的判断。
> ② **产出**：新增 **`docs/test-authoring.md`**（198 行，方法论参考、**非契约**）：§0 与另三份文档的分工表（不复制、只引用）/
> §1 四层选型（各「能证明」与**「不能证明」**，含「宣称的覆盖面不得超过所建层」）/ §2 TDD 有效红灯（三种无效红灯 + 动态 import 技巧 +
> 防漂移类**必须**附注入演练记录）/ §3 断言对象（结构化事实优先；规定措辞是唯一例外；跨序列化边界的对象要在序列化后断言）/
> §4 确定性（必然 vs 恰好 + 三条修法 + 逻辑判据强于统计下限）/ §5 门控（真实运行时用例默认 skip；「进 CI」是规范性要求而非现状）/
> §6 演练与判红（只列测试侧差异，其余三条指向 `guard-authoring.md`）/ §7 决策流程 8 步 / §8 核对单 9 条。
> 所有条目均来自**可追溯的真实踩坑**（`wait_error` 丢键、`pid+1` flaky、CS-7 的必要性、算术笔误），无杜撰。
> **`docs/MULTI-AGENT-DESIGN.md` §6 文件结构**加 1 行索引（未改动其它内容）。
> ③ **审查**：oracle 1 轮 **`PASS-WITH-NOTES`**（8 条建议**全部落地**：防漂移类补机械判法 / 「断言写错方向」补指针 /
> 手工验收补价值定位 / 序列化断言补作用域边界 / 「连跑 5 次」标注为经验下限 / 「进 CI」加现状脚注 / §6 差异表压缩为指针 /
> 补「三层 vs 四层」映射）→ critic 1 轮 **`APPROVE_WITH_CONDITIONS`**（`mergeable: yes`，**无 BLOCKER**；
> 1 条 SHOULD_FIX：**§4.3 算术方向反了** —— 复现率 1/10 时 5 次**漏检**约 59%（`0.9⁵`）而非 41%，已订正；3 条 NIT 全闭合）。
> 审稿记录：`.rddf/reviews/test-authoring-doc-review.md`。
> ④ **验证**：`bun test tests/` **545 pass / 0 fail**（exit 0）—— 含散文类守卫 AC14 / AC20 对 `docs/**` 的扫描，
> 新文档**不触发任何判据**；anchors **23/23**（exit 0）。
> ⑤ **残留（如实登记）**：① 未采纳 oracle 的「§6 文件树补 `front-delegate-testing.md` 等既有条目」（属**既有缺口**，
> 补它会把这 1 行索引扩成文件树重排 ⇒ 已记入交接残留清单 ⑦）；② 本文引用 `guard-authoring.md` 的**节号**，
> 那边增删节时指针会漂 ⇒ 改守卫手册须同步核；③ 本文是方法论参考，与实现冲突一律以实现为准（文档头已声明）。

---


> **v2.28 变更摘要（2026-11-15，会话间对齐变成**机械可判**的契约）**：
> ① **问题**：上一轮查明「派发方（plan / front）↔ 被派发方（build 后端）跨会话的对齐」有三处**不对齐**：① plan 侧**没有** delegate 返回值契约（front.md 有 12 个字段 + 「`unverified` ⇒ 不得转述为已完成」纪律，plan.md 只提 `outcome` 与 `last_assistant_text`）⇒ plan 可能把「宿主说成功但无交付证据」当完成；② plan.md「与 build 的关键区别」表的 **shell / 编辑** 两行与 `opencode.jsonc` 真实档位**不符**（plan.md 写「需 ask；只允许只读子集」，实际是 allow+deny 无 ask；build.md 侧写「全 allow」，实际是 allow+ask）；③ 跨仓那半无 CI 守卫。
> ② **修正**（**TDD：先红后绿**，计划与执行记录见 `.rddf/plans/session-alignment-contract.md`）：
> - **返回值契约（单一真源）**：`lib/delegate-core.ts` 新增 `DELEGATE_RESULT_FIELDS`（插件实际产出的 **27** 个字段）与 `DELEGATE_RESULT_CRITICAL_FIELDS`（派发方**必须知晓**的 7 个）；插件在返回 summary **之前**自检（`assertDelegateResultShape`）：缺字段 ⇒ **硬错**，不静默。
> - **能力面契约（同一范式）**：新增 `capabilityBlock(agentId, perm)` —— 从 `opencode.jsonc` 的 permission 渲染 `<!-- capability:<agent>` 块（edit 白名单 / shell 档位 / delegate 有无）；`prompts/{build,plan,front}.md` 各嵌**逐字副本** ⇒ 与本仓另两块机读块（写集 / accepted roots）**同形**。
> - **守卫（新 describe「会话间对齐」）**：**AC21**（两个派发方 prompt 必须覆盖关键字段，列表从契约派生）、**AC21b**（必须写明「不得转述为已完成」的纪律句）、**AC22**（契约字段集 ↔ 插件 `summary` 键**双向**一致）、**AC23**（三个 agent 的能力面块 == 规范块：**逐字 + 恰好 1 处 + 起始标记独占 1 行**）、**AC24**（能力面**不得**在散文里复述 ⇒ plan.md 的表改为**纯指针**）。另加 **AC21a / AC21c / AC21d**（契约导出与子集关系 / 自检行为 / 序列化丢键）。
> - **文档**：`prompts/plan.md` 新增「delegate 返回值」小节（指向 front.md 的「委托后怎么读结果」+ 本侧纪律）；`docs/guard-authoring.md` 补两条实测坑（非 TTY 下 `bun test` 失败明细在 **stderr** ⇒ 「数 stdout 的 (fail) 行」判红**永远假绿** ⇒ 判红只认退出码；演练脚本**不得**用 JSON 往返改配置 ⇒ 会重排整个 `opencode.jsonc`）。
> - **行为层（跨仓）**：`rdd-workflow-e2e` 新增 **CS-7** —— 真派一个 session：宿主说成功但本轮无写盘调用、无产物 ⇒ 插件把 `outcome` 降级为 `unverified`（`host_outcome` 保留 `succeeded`）⇒ 派发方**必须**转述为「没有可验证的交付证据」且**不得**说「已完成」。2026-11-15 实跑通过。
> ③ **审查**：oracle 1 轮 **`PASS-WITH-NOTES`**（4 高影响 + 4 中影响 + 3 低影响**全部落地**：AC23 补三件套 / 能力面渲染收进 lib / 自检补行为单测 / 计划文件偏差修正 / 「全集见 front.md」宣称收窄 / 注释枚举补齐 / 指针改用标题名 / 块头注释收窄 / describe 头登记已知边界）→ critic 1 轮 **`APPROVE_WITH_CONDITIONS`**（`mergeable: yes`，**无 BLOCKER**；4 条 SHOULD_FIX 全闭合：**① `wait_error` 恒为 undefined ⇒ `JSON.stringify` 丢键 ⇒ 线上 payload 只有 **26/27** 字段**（真缺陷，已修 `?? null` 且自检改为查**序列化之后**的对象）/ ② plan.md 表里括注仍是能力面复述（已删 ⇒ 纯指针）/ ③ assert 落点缺决策记录（已补「为何放副作用后 + 调用方恢复路径」）/ ④ 已知边界未登记 `capabilityBlock` 的维度闭集（已登记）；2 条 NIT 已处置）。审稿记录：`.rddf/reviews/session-alignment-contract-review.md`。
> ④ **验证**：`bun test tests/` **544 pass / 0 fail**（exit 0）；anchors **23/23**（exit 0）；**变红演练 3 例**逐条实跑（删纪律句 ⇒ AC21b 红 / 改配置不同步块 ⇒ AC23 红 / 改块的 edit 行 ⇒ AC23 红）；跨仓 CS-7 实跑通过（另一仓）。
> ⑤ **残留（如实登记）**：① `capabilityBlock()` 只渲染 **3 个维度**（edit / shell / delegate）⇒ 配置**新增** permission 维度时块与 AC23 都不会自动扩；② AC21 = **覆盖**判据（否定句里出现字段名也算过；威胁模型是漂移不是伪造）；③ AC21b = **措辞**判据（换同义词即红，fail-closed）；④ `outcome=busy` 的**早退拒绝**是另一种形状，不在契约内；⑤ **accepted-roots 守卫缺第三件**（「起始标记独占 1 行」，v2.26 既有实现，非本批引入）。

---


> **v2.27 变更摘要（2026-11-15，实践沉淀成三份耐久文档）**：
> ① **问题**：v2.25 / v2.26 两批把两族判据升级为结构比对，但**结论与过程**只落在 `docs/CHANGELOG.md`
> （自述「不描述现状」）与 `.rddf/reviews/` 的审稿记录里 —— 那是**历史与过程**，不是可操作的方法；
> 下一位维护者要**反推**「怎么加一条守卫、怎么证明它有判别力」，成本高且易漏掉本轮踩过的坑。
> ② **修正**：沉淀三份文档到**各自仓的 `docs/`**：
> - **`docs/guard-authoring.md`**（本仓）：「判据与守卫的写法」—— 标准形态（真源 → 渲染器 → 投影 → 守卫，附代码骨架）、
>   三条配套纪律（**每个判据分支**都要有变红演练 / 演练本身也要验证有效 / 不可机械核的面要如实登记）、
>   五个实测陷阱（判据分支死代码 / 句子解析藏住真实缺陷 / 治理文档引用判据会命中自己 / 管道掩盖退出码导致带着失败提交 /
>   扫描集 excluded 只判目录）、扫描集口径表、跨仓那半的做法 + **跨仓核对命令**、守卫作者核对单。
>   定位是**方法论参考（非契约）**：开头显式声明「与 `prompts/build.md` / `lib/delegate-core.ts` / 守卫实现冲突时以真源为准」，
>   带表格的段落标为**某一时点的快照**并逐处给出真源指针。
> - **`docs/operations/verifier-state-namespace.md`**（`rdd-workflow` 仓）：verifier 状态命名空间的**运维手册** ——
>   六条 owns 路径、**怎么加一条状态路径**（改清单真源 → 重渲染 SKILL.md → 跑守卫 → 同步消费侧）、
>   收拢后的一次性搬迁行为、旧路径的兼容规则（只读不写、fail-closed）、常见症状与处置。
> - **`docs/runtime-assertion-discipline.md`**（`rdd-workflow-e2e` 仓）：**运行时用例的断言纪律** ——
>   只认文件系统事实与结构化字段（不断言模型措辞）、前提要可证伪（CS-5 首版空转的修法）、
>   每条用例配变红演练；附 CS-1..CS-6 索引。
> ③ **审查**：oracle 1 轮 **`APPROVE`**（6 条建议全落地：显式真源优先级句 / 两处快照指针 / 跨仓路径标仓名 /
>   §7 改名避开撞名 / 索引行标「非契约」）；critic 1 轮 **`APPROVE_WITH_CONDITIONS`**（`mergeable: yes`，**无 BLOCKER**；
>   1 条 SHOULD_FIX = 两处当前态断言缺**行内**快照声明 ⇒ 已补；1 条 NIT = 我把避让对象写岔了
>   （「内置自检清单」实为审查者不可用时的降级机制，真正同名的是「§自查清单」）⇒ 已改）。
>   记录：`.rddf/reviews/guard-authoring-doc-review.md`。
> ④ **验证**：`bun test tests/` **536 pass / 0 fail**；anchors **23/23**；**跨仓 diff 三步实跑通过**（两仓清单逐字一致）；
>   产品仓手册的「重渲染 owns 块」命令**实测为幂等**（跑完与现文件一致）。
> ⑤ **自指的又一次验证**：写 `docs/guard-authoring.md` 时，文档里的**反例**（旧路径 / 旧形态的错误陈述）
>   **被本仓自己的 AC14 / AC20 判红两次** ⇒ 按「反例必须行内标注历史豁免词」修正 ⇒ **新文档也被结构化守卫覆盖**。
> ⑥ **残留**：① 快照表**无机械漂移探测器**（守卫不判叙述漂移；靠维护纪律 + 头部声明）；② `docs/` 未列名文件
>   不在治理面三文档内 ⇒ 快照刷新不会触发审查（与「非契约」定位自洽）；③ 跨仓那半**无 CI 守卫**（人工 diff）。

---


> **v2.26 变更摘要（2026-11-15，遗留项收尾：accepted-roots 也升级为结构比对 + 两处判据收窄）**：
> ① **问题**：v2.25 把 **verifier 写集**的判据升级为结构比对，但如实登记了 4 条遗留 —— 其中最大一条是：**`PLAN_REF_ROOTS` 那族 accepted-roots 守卫仍是句子解析**（取「accepted roots：」后第一句 + 抓反引号 glob token），换句式即失效；另有「已关闭 improvement 是改状态行即可翻转的开关」「AC14 的窄化描述判据是副词词表（实测漏网过 `edit 上限=.rddf/reviews`）」「跨仓那半无 CI 守卫」。
> ② **修正**：① **accepted-roots 升级为逐字机读块** —— `lib/delegate-core.ts::planRefRootsBlock()` 渲染 `<!-- accepted-roots:plan-ref` + 4 个 root，`prompts/plan.md` / `docs/MULTI-AGENT-DESIGN.md` / `docs/SUBAGENT-ORCHESTRATION.md` 各嵌**逐字副本**；守卫 = 块精确比对（闭集）+ 正向覆盖 + **行级反向闭集**（锚枚举形态 `accepted roots：`，抓该行 glob token ⊆ 真源）。② **AC20 关闭判定收窄**：带归档指针的 **核本地目录真存在**；跨仓的 **须在状态行本身声明外仓**；语义式关闭保留并登记为不可机械核。③ **AC14 升级为「路径闭合」**：写集动词/副词并集 + 紧跟 `.rddf/reviews`（≤6 字符）⇒ 必须同时给出记账落点 —— 修掉旧副词词表漏网的 `edit 上限=.rddf/reviews`。④ **`isClosedImprovement` 抽成模块级单一实现**（AC20/AC14 共用，消灭双份）。⑤ **跨仓核对入口**：handoff §7 的 `diff` 命令（两仓清单已逐字一致）。
> ③ **审查**：oracle 1 轮 **`PASS-WITH-NOTES`**（3 条全闭合；其中 1 条是**真判据回退** —— 新守卫丢了「散文枚举 ⊆ 真源」的闭集面 ⇒ 已补行级反向闭集；另核出 B-2 外仓分支**有 live 消费者**，非死代码）→ critic 1 轮 **`APPROVE_WITH_CONDITIONS`**（`mergeable: yes`，**无 BLOCKER**；1 条 SHOULD_FIX = **反向闭集对 `SUBAGENT-ORCHESTRATION.md` 静默空转**（只取首个匹配行 ⇒ 锚到类属提及）⇒ 改为遍历所有枚举行 + 三份投影各做一次演练；3 条 NIT 全处置）。审稿记录：`.rddf/reviews/legacy-items-structural-upgrade-review.md`。
> ④ **验证**：`bun test tests/` **536 pass / 0 fail**；anchors **23/23**；变红演练 **8 例**逐条实跑（accepted-roots 3 例含三份投影各一次 / AC14 4 例 / 关闭判定 1 例）；跨仓 `diff` 实测一致。
> ⑤ **顺带抓到一个真缺陷**：`prompts/plan.md:90` 最后一个 accepted root **缺闭合反引号** —— 旧守卫「取第一句就截断」把它藏住了；新闭集断言当场抓到（**这是「句子解析会藏住真实缺陷」的直接证据**）。
> ⑥ **残留（如实登记）**：① 「语义式关闭」（无归档指针）**不可机械核**（伪造属故意行为，归 `rdd-doctor`/流程评审）；② AC14 两处已知边界（否定语境可洗白「已给出记账落点」；动词与路径隔 >6 字符会漏）；③ accepted-roots 的「枚举拆到下一行」会漏；④ 跨仓那半无 CI 守卫（人工 `diff`）；⑤ 两处枚举式词表仍在（AC20 的 HIST / AC14 的写集动词表）。
> ⑦ **诚实结论（critic 给的口径）**：两族升级相对旧实现**不是「严格更强」，而是「换漏网集」** —— 真正的增益是**块级逐字闭集**（旧实现完全没有的面）+ 抓到了上面那个真缺陷。

---


> **v2.25 变更摘要（2026-11-15，写集判据从「散文措辞」升级为「结构比对」）**：
> ① **问题**：verifier 类的写集上限（`VERIFIER_ALLOW_ROOTS` / `VERIFIER_OWNS_PATHS`）在文档侧**只靠散文措辞守卫** —— AC7 查「表格行含 `.rddf/state/verifier`」、AC11 查「行不含 `.rddf/state/.ac-`」、AC14 查一个**措辞正则**（「verifier …（仅|只允许|只能|只有|限于）… `.rddf/reviews`」）。措辞词表是**开集假设** ⇒ 换个说法就绕过；已实测复发**两次**（一次是 delegate 工具 schema 里手抄的活陈述被 oracle 抓到，一次是 AC11 的平凡断言被 critic 抓到）。
> ② **修正**：① **规范机读块** —— `lib/delegate-core.ts::verifierWriteSetBlock()` 渲染 `<!-- role-class-write-set:verifier` / `allow:` / `owns:` 块（内容**完全由常量派生**）；`prompts/build.md`（§角色列表表后）、`prompts/plan.md`（选类表后）、`prompts/front.md`（§3.1 后）各嵌**逐字副本** + 注记（图例 + 机械对齐命令）。② **AC19（新增）**：三份 prompt 必须逐字包含规范块、且块与起始标记**各恰好 1 处**（多/少/改一个字符 ⇒ 红；陈旧副本 ⇒ 红）。③ **AC20（新增）**：**路径闭集** —— 活文档（含规格件）里的 verifier 状态路径**按路径判**：根下旧路径（`.ac-*` / `rdd-verify-context*` / `.verifier-*`）只许出现在历史标注行；块内具体文件必须落在 **owns 模式**内。④ **AC11 转换**：删掉被 AC20 覆盖的路径负向（避免两份口径），保留退役/落点断言。⑤ **P3**：backlog stub 按本仓惯例关闭（`**实施状态**：已立项 → …archive/…`）⇒ 演进项 4「结构比对」标注收口。
> ③ **审查**：oracle 1 轮 **`PASS-WITH-NOTES`**（3 条 finding 全闭合，其中 1 条**高影响**：AC20 的「新形态闭集」分支曾是**死代码** —— TOKEN 正则不产出 `verifier/` 开头的 token ⇒ 声称的判据面根本没生效；**且 oracle 建议的修法（allow 根前缀覆盖）会让该分支恒真** —— allow 根是目录根、其下一切都被覆盖 ⇒ 最终改为「只按 owns 模式判」）→ critic 1 轮 **`APPROVE_WITH_CONDITIONS`**（`mergeable: yes`，**无 BLOCKER**；1 条 SHOULD_FIX = 两处「最后一处词表」登记互相矛盾 ⇒ 已并列登记；8 条 NIT 全部处置）。审稿记录：`.rddf/reviews/write-set-structural-projection-review.md`。
> ④ **验证**：`bun test tests/` **535 pass / 0 fail**；anchors **23/23**；**变红演练 5 例**逐条实跑（改常量 / 塞根下旧路径 / 改投影块 / 塞**块外新形态**文件 / 塞 `.verifier-*` 族 ⇒ 各自变红；其中第 4 例在修复前**不红**，正是死代码的实证）；注记里的机械对齐命令实测输出与规范块逐字一致。
> ⑤ **一条新发现的交互（写治理文件时会踩）**：**治理文档引用判据的字面形态 ⇒ 命中判据本身** ——
> 本条 v2.25 的 ① 段逐字引了 AC14 的正则与 AC11 的路径形态 ⇒ 两条守卫当场把自己判红。
> 结构性修法：`docs/CHANGELOG.md` **从 AC14 / AC20 的扫描集排除**（它开头自述「**本文档不描述现状**，
> 只记录什么时候改了什么、为什么」⇒ 是历史记录，不是现行指引）。顺带暴露扫描器的一个真 bug：
> `excluded` 原先**只判目录**（`docs/adr` 生效）⇒ **单文件**排除失效 ⇒ 已补文件级判定。
> 另：提交前用 `bun test … | tail` 会让 `&&` 链只看 `tail` 的退出码 ⇒ **带着失败提交**；此后一律单独校验退出码。
> ⑥ **跨仓对齐**：本仓 `VERIFIER_OWNS_PATHS` 与产品仓 `SKILL.md` 的 owns 清单的**占位符**曾不一致
> （本仓 `rdd-verify-context-<change>.json` vs 产品仓 `<name>.json`）⇒ 已统一为 `<name>`，
> 两仓清单**逐字一致**（可 `diff`）⇒ 未来跨仓漂移一眼可见。产品仓侧的同仓 CI 断言见其 change
> `verifier-owns-block-guard`（`_lib/verifier/state_paths.py` + `tests/unit/test_verifier_owns_block.py`）。
> ⑦ **残留**：① 本仓还剩**两处**枚举式词表（AC20 的 HIST 行级豁免闸门 —— 可「活错误陈述 + 同行塞历史词」同框洗白；AC14 的窄化描述判据 —— 原型证明共现式判定 **7/7 误报**、无可替代的结构化写法）—— 并列登记在守卫注释里，不再宣称「唯一」；② 「已关闭 improvement 整体排除」是**改状态行即可翻转**的开关（伪造关闭属故意行为，超出守卫威胁模型 ⇒ 由 `rdd-doctor` / 流程评审兜）；③ `PLAN_REF_ROOTS` 那族 accepted-roots 守卫**仍是句子解析** —— 本批只升级了 verifier 写集这一族。

---

> **v2.24 变更摘要（2026-11-14，verifier 状态收拢 ⇒ 过渡期「主会话代跑」退役）**：
> ① **问题**：产品侧（`rdd-workflow` 仓）change `consolidate-verifier-state` 已把 `rdd-verifier` skill 的 4 个状态文件从 `.rddf/state/` **根下**收拢进 `.rddf/state/verifier/`（目录级），并把 skill 的 `owns:` 由 4 项补齐为 **6 项**（原先 2 项是「实际写入但从未声明」的路径）。本仓是消费方：`verifier` 类的写集上限正是 `.rddf/state/verifier`（**目录级**）⇒ 收拢前，被派发的 verifier 后端**写不进** verdict cache / shared audit log / halted audit / staged context ⇒ 只能退化成「后端只跑取证与判决、**状态机落盘由主会话代跑**」的过渡期绕路（`ADR-class-write-scope-alignment` D1b）。收拢完成 ⇒ **该绕路退役**。
> ② **修正**（治理面 ⇒ oracle → critic）：① **常量**：`VERIFIER_OWNS_PATHS` 6 项全部改为 `.rddf/state/verifier/` 前缀 ⇒ 派生视图 `VERIFIER_BACKLOG_ROOT_FILES` **自动归零**（不是手抄）；② **面向模型的派生面**（关键）：delegate 工具 schema 的 `role_class` 参数描述原先**手抄**「edit 上限=.rddf/reviews」——那是 front LLM 在派发瞬间实际读的文本 ⇒ 改了常量就会漏改它 ⇒ front 可能据此把记账落点排除出 scope。改为由 `verifierAllowRootLabels()` **派生渲染**（路径**与**数量都不再手抄），并加一条守卫断言该描述必须派生；③ `prompts/build.md`：过渡期规则划删除线 + 标注退役依据（产品侧 change）+ 根下 `.ac-*` 的「症状桥接」解读降级为历史注记（作废）；补「既没被拒也没写 ⇒ 后端违约」的并列处置；④ `prompts/front.md`：§3.1 删「主会话执行 skill 补齐」，改为「先查 scope 是否真含记账落点（缺 ⇒ scope 问题重派；含却没写 ⇒ 后端违约）」+ 跨会话 resume 查不到 scope 视为缺；§3.3「收回后复核」加 verifier 专用项（**按路径直接查存在性** —— 这些文件被 gitignore，`git status` / `artifacts` 数不到）；⑤ **ADR 退役贯穿**：子篇 D1b 加退役注（保留原文可追溯）+ D1c 加退役注（「不构成义务」标为过渡期描述）+ 后果/风险章的现在时陈述加退役标记 + D3-1/V6 加「该判据随收拢失效」的修订注；父篇 `ADR-backend-handoff-role-class` 的 verifier 写集行括注改为「过渡期规则已退役」；⑥ `scripts/build_critic_prompt.sh` 修一个真 bug：`--staged` 只影响 stat、**diff 正文仍取未暂存**（实战踩到：审稿人可能读到另一批改动）⇒ 正文与 stat 必须同范围；`--staged` 与 `<ref>` 改为互斥（直接拒斥，别猜）。
> ③ **审查**：oracle 1 轮 **`BLOCK`**（3 条硬 finding 全部已修）：① 工具 schema 的旧写集是**活陈述**且**无守卫覆盖**（front 据此可能把记账落点排除出 scope）；② backlog stub 把「CHANGELOG v2.24 ✔」写成既成事实而条目尚不存在（同 v2.22 判例：治理文件预断言 ⇒ 失真）；③ ADR D1c 正文「不构成义务」与现行「必须直写」**活矛盾**（只读 Decision 章的实施方会得出相反结论）。critic 1 轮 **`APPROVE_WITH_CONDITIONS`**（`mergeable: yes`，**无 BLOCKER**；5 条 SHOULD_FIX 全部已闭合）：父篇写集行括注 / 子篇后果·风险章与 D3-1·V6 的活陈述 / 工具描述把基数手抄为「两者」/ stub 的假完成声明（= 写真实 v2.24 条目）/ 退役闭环抽查。审稿记录：`.rddf/reviews/verifier-state-consolidation-retirement-review.md`。
> ④ **验证**：`bun test tests/` **533 pass / 0 fail**（8 files；含新增的「工具 schema 必须派生」守卫 + 改写后的 AC6/AC8/AC11/AC13）；anchors **23/23**；**产品侧**（`rdd-workflow` 仓）pytest unit+integration **3492 passed / 0 failed**、verifier/archive-gate bats **43 ok / 0 not ok**、新增单测 `test_verifier_state_consolidation.py`（11 passed）；**消费侧 e2e** 新增 CS-6（派发 `role_class=verifier` 写 `.rddf/state/verifier/` 下的 verdict cache + audit log ⇒ **落盘成功**、结构化证据无权限拒）实跑通过。
> ⑤ **残留**：① 守卫的**枚举式词表仍是开集假设**（AC8 ③ 的「主会话代跑」换写法即绕过；AC11 的负向靠路径字面量）—— 根治方向仍是「文档投影 ↔ `VERIFIER_ALLOW_ROOTS` **结构比对**」，已登记在 `.rddf/improvements/rdd-verifier-state-consolidation.md` 的演进项；② 新增的「工具 schema 派生」守卫是**源码文本启发式**（可在注释里留字符串同时手抄字面量骗过）—— 过渡守卫，根治同上；③ `VERIFIER_OWNS_PATHS` ↔ skill `owns:` 的同步仍是**人工**（skill 在仓外，CI 的 `bun test` 不能依赖它）—— 机械探测器（派生视图归零）只能发现「新增根下状态文件」，发现不了「skill 改了 owns 但本仓没同步」；④ 产品侧 change `consolidate-verifier-state` **已 archive**（`2026-11-14-consolidate-verifier-state`）+ 一个补漏 change
   `fix-verifier-spec-path-residual`（原 delta 漏重述 `archive_gate_check SHALL NOT shell out to ac-verifier` 的 3 个
   scenario ⇒ 归档后实测残留 3 处旧路径，已补齐并归档）。其全量回归门 **0 新增失败**（bats）+ pytest
   **3292 passed / 201 passed**；注：本仓 `openspec/` 是 **gitignored**（规格随项目走、不入库）⇒ 规格文本不进 git。

---

> **v2.23 变更摘要（2026-11-14，post-archive 修正：AC14 扫描集恢复「活文档」口径）**：
> ① **问题**：实施 `class-write-scope-alignment` 时，其 AC14（陈旧写集陈述清除）的扫描集被写成 `prompts/** + docs/** + commands/**` ⇒ **漏了 `.rddf/**`**，导致三处**现在时的假陈述**留在活文档里（都声称 verifier 的 edit 边界只含 `.rddf/reviews/**`，与 shipped code 矛盾）：`.rddf/improvements/delegated-verifier-evidence-gap.md` 的能力陈述与 Out-of-Scope 表、以及**规格件** `.rddf/reviews/backend-handoff-protocol-spec.md` 的 3.1 能力画像表（该文件被 ADR 元数据当权威引用）。
> ② **修正**（无行为/决策变更 ⇒ 不新开 change，按 §审查配对 判例走「改守卫 ⇒ oracle → critic 必审」）：① 三处文本改为准确陈述（能力陈述补记账落点；Out-of-Scope 行改为「**当时**不含该子目录 + **已由 `class-write-scope-alignment` 关闭**」，不复述陈旧契约）；② spec 3.1 表改为**留旧值痕迹 + 日期**形态（`.rddf/reviews/**`（v5 修订 2026-11-14：+ …）），版本口径段补 `v5 = v4 + …`；③ 守卫 AC14 的扫描集恢复「**活文档清单**」：新增 `.rddf/improvements/**`、`.rddf/roadmap/**` 与规格件；措辞词表补「只有 / 限于」（否则「写集只有 `.rddf/reviews`」会静默绕过）；守卫注释登记**已知边界**（`.rddf/plans/**`、未归档 open change 的 `proposal.md` —— 当前不存在，出现时扩）。
> ③ **审查**：oracle `PASS-WITH-NOTES`（7 条，含「第三处漏网 `:78`」「词表枚举假设」两条硬发现）→ critic **`APPROVE`**（`mergeable: yes`，无 BLOCKER / SHOULD_FIX；2 NIT 已处置）⇒ 全部落盘。
> ④ **验证**：`bun test tests/` 全绿；anchors 23/23；**变红演练 3 例**（improvement 能力陈述 / Out-of-Scope 行 / spec 表 ⇒ 各自变红并**精确指出文件**，还原后全绿）。
> ⑤ **残留**：根治方向是「文档投影 ↔ `VERIFIER_ALLOW_ROOTS` **结构比对**」（替代散文正则）—— 已登记进 `.rddf/improvements/rdd-verifier-state-consolidation.md` 的演进项；另：父篇 ADR 元数据的「工作规格 | spec（v3）」指针已失准（文件到 v5），随下次 ADR 修订同步。

---

> **v2.22 变更摘要（2026-11-14，架构类文档的落点与治理归属收口）**：
> ① **问题**：① `docs/adr/ADR-backend-handoff-role-class.md` 的 D5「识别」条目写着「异步路径在**完成通知**后…」，而工具契约里**没有推送通道**（`dispatch` 返回 ≠ 完成）——按字面等待一个不存在的通知 = **卡死**；② `prompts/plan.md` 为此加过一句临时消歧（ADR 措辞修正后其前提消失）；③ §治理面作用域表未裁定**本仓**（既是配置根又是项目仓）的 `docs/adr/**` 归属 ⇒ 「改 ADR 要不要走 critic」每次都要重新判；④ 「Accepted ADR 的**描述性措辞**修订走哪条审查」无成文判例 ⇒ 同类措辞漂移会复发。
> ② **修正**（change `adr-d5-async-completion-wording`，已立项 / 实施完成，归档状态见归档记录）：① D5 识别条目改为**纯观测式**表述：「异步路径**没有完成通知** —— 由用户回来、或主会话下次读 `sessions` 观测到 `running=false` 后，再读 `rddf feedback list`（记录为唯一权威）」，并补**逃逸口径**（槽位释放是 reconcile-on-read 惰性、自然完成后 `state` 可能仍为 `active` ⇒ **不必等 `state=idle`**，`running=false` + `outcome=succeeded` 即足以继续）；**决策内容 / 选项对比 / 后果章 / Verification 章 / Status 行一律不动**，修订可追落条目行尾；② 删 `prompts/plan.md` 的临时消歧句；③ `.rddf/reviews/backend-handoff-protocol-spec.md` 保留原文 + 行尾 `v4 修订` 注 + 自定口径段补 `v4 = v3 + …`（保住 v3 审计痕迹）；④ `prompts/build.md` §治理面作用域表新增「**本仓特例裁定**」（本仓 `docs/adr/**` 属 **ADR 行**、不属治理面）与「**判例（Accepted ADR 的描述性措辞修订）**」（改措辞 ⇒ 只 oracle；同时改守卫断言 ⇒ 治理面 ⇒ oracle → critic 必审；Status 行不动）。
> ③ **审查**：oracle 1 轮 **`BLOCK`**（CHANGELOG 在审查发生前预断言了未发生的审查结论 / 归档状态 / 审稿记录路径 ⇒ 治理文件失真）→ 闭合（改为「待进行」，审稿记录落盘后回填本行）；同轮 4 条 finding（D5 的 `state=idle` 前置条件在惰性 reconcile 下可能永不满足 ⇒ 需逃逸口径 / plan.md 单字段口径与 ADR 不一致 / 判例边界不可数 + 非豁免修订无默认归槽 / 守卫三处缺口）全处置；critic 1 轮 **`APPROVE_WITH_CONDITIONS`**（`mergeable: yes`，无 BLOCKER；2 SHOULD_FIX = CHANGELOG 引文与实际文本不符、proposal bullet 自相矛盾，均已闭合；1 NIT 已闭合）。审稿记录：`.rddf/reviews/adr-d5-async-completion-wording-prompt-review.md`。
> ④ **验证**：`bun test tests/` 全绿（新增守卫：ADR D5 识别条目切片 + 「完成通知后」负向 + plan.md 消歧句已删 + 作用域裁定行 + 判例）；anchors 23/23；`openspec validate adr-d5-async-completion-wording` 通过。
> ⑤ **残留**：类写集对齐（`verifier` 类写 `.rddf/state/verifier/*` 越类 / `builder` 类能否落 `.rddf/reviews/**`）属**权限面 + 产品侧 skill**，不是措辞问题 ⇒ 另立（需 architect 先出 ADR）。

---

> **v2.21 变更摘要（2026-11-13，派发能力类 `role_class` + 凭据化 HANDOFF）**：
> ① **问题**：派发契约只有 `plan_ref` / `scope` / `acceptance`，**没有「本次允许做哪一类工作」**——写 ADR 的后端拿到代码 `scope`、跑验收的后端能改实现，边界只靠简报里的自然语言；且后端遇计划决策时的停下义务只在 prompt 里，主会话没有可观察凭据区分「交接」与「失败」。
> ② **决策**：`docs/adr/ADR-backend-handoff-role-class.md`（**Accepted** 2026-11-13，oracle 1 轮 + metis 1 轮 + critic 1 轮 `APPROVE_WITH_CONDITIONS` 无 BLOCKER）—— 一次派发只做一个角色类的工作（`builder` / `architect` / `verifier`），class 落在 `role.json` 分区 + `pair.json` 登记（**与治理身份 `current_role` 分开**），**同一 session 内不允许换类**（换类 = handoff 后重新派发）。
> ③ **实现**：`lib/delegate-core.ts` 新增 `parseRoleClass` / `archRoots` / `classAllowRoots` / `normalizeScopePath`（归一化**单一实现**，`scopeEditRules` 改为复用）/ `assertRoleClassCompatible` / `assertResumeRoleClass` / `classPermissions`（**同步与异步两条链路共用**）；`buildBrief()` 增「运行身份」段与**按 class 分支**的执行要求（含 HANDOFF 契约与首行优先级）；`delegate` / `dispatch` 入参接受 `role_class`；`sessions` 回显 `role_class`。subagent 走**统一白名单**（五个只读 agent；`general` / `context-builder` 的 `shell:* allow` 可绕 edit 边界 ⇒ 排除）。
> ④ **治理面**（`prompts/build.md` / `plan.md` / `front.md`）：HANDOFF 契约（先落 `rddf feedback` 凭据 → 首行 `HANDOFF: <kind>` → 结束回合）、**HANDOFF 回合省略角色开场报告**（否则 `final_is_role_opening` ⇒ `no_work_evidence` ⇒ `unverified` ⇒ 交接被系统判成失败）、派发方选类表、**机制未启用时的降级口径**（三份 prompt 都有）。
> ⑤ **审查**：oracle 1 轮 **BLOCK**（prompt 引用了 lib 尚未生成的字段 ⇒ 后端会臆造 class / 拒活）→ 加两侧降级口径闭合；critic 1 轮 `APPROVE_WITH_CONDITIONS`（4 条 SHOULD_FIX + 2 条 NITS 全闭合）。审稿记录：`.rddf/reviews/backend-handoff-role-class-prompt-review.md`。
> ⑥ **验证**：`bun test tests/` **447 pass / 0 fail**（新增 43 项：值域 / 三态 / 相容性 / symlink 越界 / 权限净效果 / 简报分支 / 登记与 resume 一致性 / sessions 回显）；anchors 23/23；`openspec validate backend-handoff-role-class` 通过。
> ⑦ **残留**：`shell` 不受 class 约束（与现状等价，靠主会话收回后 `git status` 复核）；跨 worktree 同 `plan_ref` 并发共享额度与 `discovery.md` 覆盖（已知缺口，另立 ADR）；`plan.md` / `front.md` 的 resume 前置判据拆为后续 prompts-only change。

---

> **v2.18 变更摘要（2026-11-13，context-builder 收窄为「机械搬运工」）**：
> ① **问题（实测）**：310 个 critic prompt 中只有 **22 个（12%）**真正用了 context-builder 的输出；`hidden: true` 使它被 `!agent.hidden` 过滤出父模型的「Available subagents」清单（`subagent.ts:289-303`）；prompt 内 **6 处**对"缺 intent/focus 怎么办"给出互斥指令；「你返回」示例只有 6 字段（缺 `review_profile`）；文档口径互相矛盾（谁能调 / 何时调）。
> ② **收窄**：职责限定为**只搬运**（`changes_summary` / `review_profile` / `diff_or_paths` / `context` / `expected_format`）；`focus` 可推断但每条标「推断：」；**`intent` 不可推断** —— 缺失时**首行 `ERROR: missing intent`**、不产出 7 字段 prompt（可附机械字段 + "补 intent 后重发，可直接合并"）。**移除 `hidden`** ⇒ 回到选择面；description 改写为「只搬运、不推断、调用方中性」并保留「critic 的 7 字段 prompt」功能锚点。
> ③ **一致性**：prompt 内 6 处漂移源统一（`:27` / `:50` / `:89` / `:90` / `:110` / `:141` / `:197`）+ 调用方中性化（`:3` / `:15-25` / `:89` 等）；示例补 `## review_profile`（补齐到 7 字段）；`build.md` 窄条件（**大 diff >200 行 / 跨多文件 且已给 intent**）；**撤回 `plan.md:38`**（plan 无 critic 下游 —— `MULTI-AGENT-DESIGN.md:551`「plan agent 不需要审稿」、矩阵 plan→critic = ❌ ⇒ 组装出的 prompt 无消费者），并修 `:41` 的悬空引用；文档补「**可见 ≠ 可调**（front 清单可见但执行期 deny）/ 可达 ≠ 有消费者」。
> ④ **审查**：oracle `PASS-WITH-NOTES`（8 条 finding：漏 `:50`/`:197` 两处漂移源、description 未列、plan 投递环断裂、ERROR 形态细化等）→ 规格 v2 → critic `APPROVE_WITH_CONDITIONS / mergeable: yes`（3 条措辞级 SHOULD_FIX 已并入）。规格：`.rddf/reviews/context-builder-narrowing-spec.md`。
> ⑤ **验证**：`bun test tests/` **385 pass**（config-guards +2 护栏）；anchors 23/23；`opencode debug agents` 确认 context-builder 可见且 `hidden=False`。
> ⑥ **残留**：采纳率是否回升只能上线后观察（`ERROR: missing intent` 出现频率是"调用方不给 intent"的先行指标）；「plan → critic 条件配对」登记为 backlog。

> **v2.20 变更摘要（2026-11-13，收敛「两份表述漂移」并把投影纳入机械校验）**：
> ① **问题**：同一规则在两处各写一份 ⇒ 改一处、另一处静默过期。本轮实体的三例：判定词表曾有三份拷贝；`review_profile` 路径映射有**四份**（build.md 权威 + context-builder + critic 兜底 + MULTI-AGENT-DESIGN 自称权威）；`accepted roots` 在 4 处投影且**运行时真读** `PLAN_REF_ROOTS` —— 投影多写一个根，agent 会照它行动而运行时拒绝。
> ② **归属收敛**：`prompts/context-builder.md` 的路径映射表头声明**权威在 `prompts/build.md` 的「档位选择」**（自己只作兜底副本）；`docs/MULTI-AGENT-DESIGN.md` 的「本表是权威映射」改为指针 —— 现在只有 build.md 保留「权威映射」自称。
> ③ **投影收敛**：`docs/SUBAGENT-ORCHESTRATION.md` 判定词表改指针、删掉全部**编号式章节引用**（`§5.2` 等 → 改用小节标题名）、agent 表模型列写全（消除「同上」）。
> ④ **守卫**（`tests/config-guards.test.ts`，新增 9 条）：review_profile 映射**逐档比对**（**含 critic.md 那份兜底链** —— 它是消费方本尊的兜底副本，此前是漏网的第四份）且接受「指针 / 清单」两种合法形态：段内必须出现该档路径 token、映射区域内必须出现 fallback 目录集、build 档额外做**反向闭集**（副本不得多列真源没有的目录）；accepted roots 与 `PLAN_REF_ROOTS` **双向**校验（根是闭集）；`priority_blocked` 字段清单**提升为 `lib/delegate-core.ts` 的导出常量**（守卫不再手抄第二份）；agent 模型清单按**模型表表头作用域 + 表格行**定位比对；**审查链与预算**三处按「预算」列数字集合**跨文档相等**（基准 = build.md）；context-builder 的 7 字段模板字段名集 == `CONTRACTS.requiredSections`；汇总文档禁编号式章节引用；既有 metis 六节与判定词表守卫**扩展到汇总文档**。
> ⑤ **治理面作用域表**（`prompts/build.md`）扩两项：`docs/SUBAGENT-ORCHESTRATION.md`（复述各真源判据，漂移即误导）与 `tests/config-guards.test.ts` 的**断言增删 / 放宽 / 字段清单变更**（守卫即「什么算漂移」的判据本身）。
> ⑥ **顺带闭环**：`docs/MULTI-AGENT-DESIGN.md` 的「10 个独立 agent」订正为 **11 个**（补 `front`）；该文档两处**派生推论**（预算分层 / 窗口 4 条）标注真源出处。
> ⑦ **验证**：`bun test tests/` **404 pass / 0 fail**；anchors 23/23；**八条变异**均被捕获（删 context-builder 映射 token / 删 **critic.md 兜底链 token** / design 多列一个目录 `bin` / 改单行模型 / 引入编号 § / 改预算 1→2 / 文档多列一个 accepted root / 把 critic.md 的散文形态改成半角括号）。映射守卫另加**非空断言**（解析不出档位即失败）—— 否则映射形态被改坏时 token 校验会被静默跳过，守卫「已覆盖」的声明随之失真（同一根因，本轮已闭环）。
> ⑧ **审查链**：oracle `PASS-WITH-NOTES`（6 条 finding 全并入）→ critic `REJECT`（1 BLOCKER：critic.md 兜底链未真进守卫而 CHANGELOG 已声称覆盖 = 伪决策）→ 改写闭合 → critic 复审 `APPROVE_WITH_CONDITIONS / mergeable: yes`（1 条 SHOULD_FIX 非空断言已并入）。

> **v2.19 变更摘要（2026-11-13，沉淀 `docs/SUBAGENT-ORCHESTRATION.md`）**：
> ① **目的**：把本轮（oracle 判定行单一真源 + critic 评审对象边界 + metis 措辞收敛 + review_profile A/C/D + context-builder 收窄 + plan 派发主体 + D7 优先级）的**当前态**沉淀成一篇常驻文档，避免知识只散在 ADR 与 `.rddf/reviews/` 里。
> ② **文档**：`docs/SUBAGENT-ORCHESTRATION.md` —— agent 清单与模型档位 / 委派拓扑与门控（subagent 清单过滤、delegate 五工具与权限项）/ 审查链与 `review_profile` 档位（含继承式档位）/ 输入契约 L1–L5 与日志事件 / critic 的评审对象边界 / oracle 双模式与判定行 / metis 与 context-builder 定位 / delegate 通道（plan_ref / owner_agent / 单槽 / D7 优先级）/ 已知限制与残留 8 条 / 索引（8 篇 ADR + 8 份审稿记录 + 守卫清单）。
> ③ **定位声明**：该文是**汇总 + 索引**，**不是规则真源** —— 真源仍是 `prompts/*.md`、`docs/adr/*.md`、`opencode.jsonc.opencode-go`、`lib/*.ts`；若冲突以真源为准。
> ④ **验证**：`bun test tests/` 396 pass（该 commit 时点）；anchors 23/23（本文不含断言，未改真源）。

> **v2.18 变更摘要（2026-11-13，D7 派发优先级：plan 优先、但不抢占）**：
> ① **诉求**：「plan 活跃的情况下，front 不能调用 build 的后端 session」。已确认边界：作用域**保持按工作树**、**只报错不抢占**。
> ② **ADR 修订**：`docs/adr/ADR-plan-delegate-engineering-session.md` 新增 **D7**（D4 增补指向）。核心：① **D7.2** 冲突判定**富化既有占槽拒绝点**（不新建锁外预检，避免 TOCTOU 与两面活体口径漂移），holder 结构体扩 `owner_agent`；② **D7.3** 跨 owner-kind 的 **resume 硬拒**（判据用 owner-kind 而非 session id ⇒ 保住"隔天回来继续"；亡主例外复用 `frontAlive`）；③ **D7.4** 两种指名文案（被 plan 占 / 被 front 占）+ 可执行下一步；④ **D7.5** owner 亡主**不消解冲突**（只看后端活体；出口是既有亡主门控回收后再派）；⑤ **D7.6** 拒绝点落 ledger 事件 `priority_blocked`（caller_kind / holder_kind / holder_state / holder_session_id / work_root / path）；⑥ **D7.8** 跨 owner-kind 的 **cancel 硬拒**（补齐归属门控只在 suspend 路径的缺口，否则 front 可绕过优先级直接终止 plan 的活后端）。
> ③ **审查链**：oracle `PASS-WITH-NOTES`（7 条 finding 全部并入）→ critic `REJECT`（1 BLOCKER：D7.5 与 D7.2 二义）→ 修订 → critic 复审 `APPROVE_WITH_CONDITIONS / mergeable: yes`（2 条措辞级 SHOULD_FIX + 1 NIT 已并入）。
> ④ **实施**：代码（`frontAlive` **下沉到 core** 作全仓唯一实现、holder 扩 owner 字段、`describeHolderByOwner` 两文案、`appendPriorityBlocked` 拒绝点落行、delegate/dispatch/resume/cancel 四条路径的跨 owner-kind 硬拒）；prompt（`front.md` 增「占槽者是 plan 时不要 suspend、也不要 cancel」的指引；`plan.md` 增「plan 优先但不自动抢占」指引）；测试（+13：V16–V25）。
> ⑤ **验证**：`bun test tests/` **396 pass / 0 fail**；anchors 23/23；owner 判活全仓仅一份实现。
> ⑥ **残留**：① 同 owner-kind 的跨会话 resume 仍放行（"隔天回来继续"不受影响，这是有意的）；② plan 的后端转 suspended 后，front 仍可占用该工作树（plan resume 时才冲突）—— 未加规则，登记备查；③ `priority_blocked` 的线上频次统计待部署后积累。

> **v2.17 变更摘要（2026-11-13，plan 获得 delegate 派发主体 + ADR 签批）**：
> ① **问题**：plan（planner 角色）只有 `subagent`（全量 allow），**没有任何工程行动出口** —— 计划与实施之间没有可编程的交接面。
> ② **ADR**：`docs/adr/ADR-plan-delegate-engineering-session.md`（**Accepted**）—— 只扩展"谁可以派发"，不改单槽 / 归属门控 / 停机证据 / 写隔离 / grants 白名单。关键决策：D1 plan 与 front 并列放行同一 delegate 通道（顶层仍全 deny）+ plan 计划产出口径收敛到 `.rddf/plans/`；D2 派可写实施须带 **`plan_ref`**（accepted roots：`.rddf/plans/**`、`.rddf/improvements/**`、`.rddf/roadmap/**`、`openspec/changes/*/proposal.md`；**可写 ≠ 可引用**；存在性校验是强制函数、非相关性证明）；D3 `sessions` 按 **owner 过滤**（过滤只发生在 sessions 的 execute 内，`countActiveBackends` / dispatch 超限诊断保持 owner 无关）；D4 槽位仍按 `workRoot` 全局单槽；D5 `owner_agent` 落 pair/ledger（缺失按 front 解释）；D6 关闭范围。
> ③ **审查链**：oracle `BLOCK`（D2 白名单与 plan 实际产出契约不符 + "task 引用"不可判定 + 解析根未定义）→ 修订 → critic `REJECT`（1 BLOCKER：accepted roots 与 plan 实际可写路径矛盾）→ 修订 → critic 复审 `APPROVE_WITH_CONDITIONS / mergeable: yes`（2 条措辞级 SHOULD_FIX 已并入）。审稿报告：`.rddf/reviews/adr-plan-delegate-engineering-session-review.md`。
> ④ **实施**：配置（plan 放行五个 delegate 权限项 + `edit` 放行 `.rddf/plans/*.md`）；代码（`plan_ref` 校验 + `owner_agent` 写入 + `sessions` owner 过滤 + 工具描述去 front 化 + 「可写 ≠ 可引用」通则）；prompt（`plan.md` 新增「委派工程实施」章节与边界句、口径收敛；`build.md` planner 行同句）；测试（+14：plan_ref/owner 单测 8 + 派发主体与 owner 过滤集成 6；config-guards +3）。
> ⑤ **验证**：`bun test tests/` **379 pass / 0 fail**；anchors 23/23。
> ⑥ **残留**：① plan 与 front 争同一工作树会互斥（单槽，需人协调）；② `sessions` 按 owner 过滤后失去"全机后端"运维视图（候选增强 `scope: owner|all`，v1 不做）；③ 后端 session 写 `.rddf/state/role.json` 顶层镜像的展示面冲突（属残留，非权限冲突）。

> **v2.16 变更摘要（2026-11-12，critic 档位显式化 A+C+D）**：
> ① **问题**：11-03 后 182 个 critic prompt 里，显式声明 `review_profile` 的只有首审轮 **55%**、复审轮 **33%**。最伤的是复审轮——协议规定「只提交闭合证据 + 增量」，档位不在其中，而 critic 缺档位时按路径猜 ⇒ 同一 change 两轮可能用**不同判据集**，闭合验证结论不稳。
> ② **A 继承式档位**：`build.md:86` 复审协议改为「两样东西 + 一行档位」（`继承第 N 轮：<profile>`），**内容可豁免、档位不可豁免**；`critic.md:90` 复审轮缺档位时按继承声明取值，无法确定则 `mixed` 并声明。
> ③ **C 首审轮默认骨架**：`build.md:149` 明确「首审轮默认先跑 `build_critic_prompt.sh` 取骨架」（档位由脚本按路径预填），并订正脚本实际自动填的 3 个字段（原文漏了 `review_profile`）。
> ④ **D 可观测**：`Evaluation` 新增 `profileMissing`（**独立于 violations**，复审轮豁免时仍可观测）；L1/L2 日志记 `profileMissing` 并在缺失时追加 `event: "profile_missing"`，使「档位声明率」可 grep 统计。
> ⑤ **验证**：`bun test tests/` **365 pass**（新增 5 条）；anchors 23/23。**暂缓**：B（缺档位一律 mixed）、E（契约提为独立必填 + enforce）等 D 的线上数据。方案全文见 `.rddf/reviews/review-profile-improvement-plan.md`。

> **v2.15 变更摘要（2026-11-12，critic 的「评审对象边界」）**：
> ① **问题**：critic 的判据轴是**产物档位**（arch / plan / build / archive），但"评审对象必须是可签批产物、建议类产出只作上下文"这条边界只存在于设计文档与口头共识 —— critic 自己的 prompt 里没有。父模型若把 oracle 四节结论 / metis 六节 gap 分析塞进 `diff_or_paths`，critic 会拿只对决策文档成立的判据（如 arch 档「决策缺备选方案」）去评一份**结论**，产出无法落地的 BLOCKER；而 `build.md:85` 规定「只有 BLOCKER 触发返工」⇒ 白触发一轮返工并消耗「同一 change 最多 2 轮 critic」预算。
> ② **改动**：`prompts/critic.md` 新增「评审对象边界」小节 —— 评审对象须**证据自足、可签批**（ADR / proposal / 代码 / 归档增量 / 治理面规则文件等）；建议类产出只作上下文（写进 `context` 或作为 `intent` 来源）；复核建议要审**它指向的产物**、按该产物路径对应的档位；建议将被采纳则**先落成产物**再审；整份输入都是建议类 ⇒ 走**无评审对象出口**（`profile: none` + 理由，不产出任何 finding、不给 `mergeable`）。档位推断段加先后约束：推断前先过对象边界。
> ③ **审查**：oracle `PASS-WITH-NOTES`（3 条 note 全部并入：示例补"治理面规则文件等"、"全建议输入"出口、"按该产物路径对应的档位"、`:87` 先后句）→ critic `APPROVE_WITH_CONDITIONS / mergeable: yes`（2 条 SHOULD_FIX 并入：新出口同时禁 SHOULD_FIX/NITS + 定义输出形状 `profile: none`；另 1 条 NIT 标记 `scope_exceeded: true` 记 backlog —— 四档"审什么"列未接住治理面配置类对象，属既有缝隙非本轮引入）。
> ④ **验证**：`tests/` **360 pass**；anchors 23/23。**自指限制**：改的是 `prompts/critic.md` 自身，"新边界是否真会让 critic 拒绝/接受某类输入"不能由本轮审稿独立证明 —— 需后续非自指会话投喂"只含 oracle 报告、无产物"的合成输入验证。
> ⑤ **另立**：critic 档位显式率不足（首审轮 55% / 复审轮 33%，n=182）→ 改进方案见 `.rddf/reviews/review-profile-improvement-plan.md`（推荐 A+C+D，待用户定组合）。

> **v2.14 变更摘要（2026-11-12，metis 检查：stale 引用订正 + 6 节契约守卫）**：
> ① **检查结论**：metis 的"意图—能力—输出"基本自洽（6 节契约写在 `prompts/metis.md` 自己手里；89 个有文本输出的真实会话里 **85% 完整给出 6 节**；92% 的调用方自带产物路径）⇒ **不存在 oracle 那种"判定规则放错文件"的结构缺陷**。仅 3 处小问题：M1 严重度分级只写在 Rules 未进 Output 契约（实测 96% 输出自带某种分级，但三档词在全仓**零消费方**）；M2 stale 引用；M3 三处契约零守卫。
> ② **改动**：M2 `prompts/metis.md:7` 把幽灵 agent 名 `Prometheus` 订正为 `planner`（全仓 grep `Prometheus` 零匹配；planner 是 metis 的固定审查调用方，见 `build.md:419`，build 直调路径保留）；M3 `tests/config-guards.test.ts` 新增守卫：metis 的 6 节输出契约在 `metis.md`（真源）/ `build.md` 返回结构行 / `MULTI-AGENT-DESIGN.md` 卡片三处**有序全等**；M1 最终以**改措辞**关闭 —— `metis.md:31` 的三档词（`blocker / quality / nice-to-have`）改为「按优先级排序：说明哪些必须先解决、哪些可以后置」，与 Output 末节的「按优先级排序」收敛为同一判据（理由：三档零消费方、73% 会话本就用替代分级、`blocker` 与 critic 的闸门词跨界）。
> ③ **审查**：oracle `PASS-WITH-NOTES`（4 条 finding）。其中 finding 2 指出守卫是"单向包含 + 未钉顺序"，存在真实假阴性 ⇒ **当场补强**为有序全等 + 名单提取（不再逐项 `toContain`）+ 卡片搜索域收敛到 `#### metis` 段。
> ④ **验证**：`tests/` **360 pass**；anchors 23/23；三条变异（节名改动 / 节序对调 / 消费者行残留旧节名）均被守卫捕获并报出准确信息。
> ⑤ **残留**：`MULTI-AGENT-DESIGN.md:917` 文件树注释「（Markdown 六节输出）」是同一契约的散文投影，未纳入守卫（低影响，备查）；`metis.md:31` 与 Output 末节属同义复述，无守卫能抓两处分叉（叙述性文字的已知限制）。

> **v2.13 变更摘要（2026-11-12，oracle 的审查身份与判定行下沉）**：
> ① **问题**：治理面 oracle 审查 23 个样本里 **6 个（26%）没有要求判定行** ⇒ 审完了拿不到机读结论，且无机制发现。根因是判定要求写在**调用方**文档（`build.md`），执行体（oracle）不知道；同时 oracle 的 description 只写 consultant，而 critic 的 description 把"目标场景失败模式"揽走 —— 与 `build.md` 审查配对表的分工相反。另：210 个 oracle 子会话里 **75% 的调用方自己在 prompt 里重述审查框架**（措辞各异）⇒ 选择面没把能力说清。
> ② **改动**：① 两条 description 改为「oracle 先行失败模式 / critic 主审冲突（oracle 未前置时兼审）」，并限定 critic 的"architect 流程第二审"作用域；② `prompts/oracle.md` 新增「模式」段：**默认审查档**（输入带产物/判据即审查）+ 纯问答才降级咨询 + **拿不准按审查** + 判定行两种词表（治理面 / 通用）+ **BLOCK 必须有证据**（反判定通胀）；③ 判定词表**降格为单一真源**（只在 `oracle.md`，`build.md` 与 `MULTI-AGENT-DESIGN.md` 改为指针）。
> ③ **审查**：oracle `PASS-WITH-NOTES`（8 条 finding 逐条处置，5 条改变补丁形态）→ critic `REJECT`（1 BLOCKER：`MULTI-AGENT-DESIGN.md` 持有第三份词表）→ 修 → 复审 `APPROVE / mergeable: yes`。
> ④ **验证**：`tests/` **359 pass**（新增 2 条守卫：description 分工非 orphan、判定词表单一真源）；anchors 23/23；`opencode debug agents` 可见新描述。
> ⑤ **残留**：AC6「部署后审计」（复测原 6 个漏判定会话）待做 —— 它是"默认审查档是否对症"的唯一独立证据；oracle 的输入契约仍属 tasks 7.4（前置未到）。

> **v2.12 变更摘要（2026-11-12，修复 explore/librarian/title 全不可用 + 订正模型归属表）**：
> ① **症状**：explore / librarian / title 切到 `opencode-go` 后**每次调用都失败** —— `Error: Variant unavailable for opencode-go/deepseek-v4.1-flash: low`（HTTP 请求发不出去，请求根本没到 provider）。
> ② **根因**：变体由 `Variant.resolve()`（上游 `packages/core/src/variant.ts` 的 `PROTOCOLS`）按 **package** 查协议生成；models.dev 对该模型没有 variants，而自定义 provider 的 package 不在协议表里 ⇒ 变体表为空。配置里声明 `capabilities.reasoning` 会让运行时走"按能力重建变体"分支，但同样查不到协议 ⇒ 仍为空。
> ③ **修复**：`providers.opencode-go.models.deepseek-v4.1-flash` 显式声明 `variants`（`low/medium/high` → `settings.reasoningEffort`），写法照抄 kimi-code 的既有声明。**package 名保持 `@ai-sdk/openai-compatible` 不动** —— 单独把 package 改成 V2 名**不解决问题**（已实测）。
> ④ **验证**：独立进程 `opencode run --standalone --agent explore|librarian|title "只回答：OK"` 三者全部成功；本会话内 `subagent` 调 explore / librarian 也成功（能读文件、能查外部文档）。
> ⑤ **连带订正**：`docs/MULTI-AGENT-DESIGN.md` 的模型归属表此前仍写 `opencode/deepseek-v4.1-flash-free` ⇒ 已按 `opencode debug agents` + 配置解析 + 实跑三重核对订正 §2.1 / §2.3 / §5.1 / §5.2 / §5.3。**轻量链路（explore / librarian / context-builder / title）最终落到 `commandcode/deepseek/deepseek-v4.1-flash`**（Context 1,000,000†，models.dev 值）；`opencode`（内建免费）与 `opencode-go` 当前**均无 agent 声明**（后者仍是降级链候选）。
> ⑥ **残留**：`openstarry` / `minimax-cn` 仍用 V1 包名，但它们的模型没有 agent 声明变体 ⇒ 不受影响（**未改**）；免费档 HTTP 426 的限制随本次切走已不再阻塞 explore / librarian。
> ⑦ **包名统一（追加）**：`minimax-cn` 的 `@ai-sdk/anthropic` → `@opencode/ai/providers/anthropic`；`openstarry` 的 `@ai-sdk/openai-compatible` → `@opencode/ai/providers/openai-compatible`。理由：当前运行时的 provider 内置表只含 **V2** 包名（`packages/core/src/provider.ts` 的 `builtins`，61 个键全是 `@opencode/ai/providers/*`），V1 名是遗留拼写；变体协议表 `PROTOCOLS` 同样只认 V2 名。实测：minimax-cn 正常（含**工具调用**：读文件并回答）；openstarry 仍是**订阅额度不足**（403，切换前就如此，与包名无关）。**残留**：`opencode-go` 仍用 V1 名（它已显式声明 `variants`，不受影响），要统一只差一行。
> **v2.11 变更摘要（2026-11-11，新增 subagent 输入契约门）**：把 `prompts/build.md` 里「7 字段上下文契约」从**散文**变成**可判定的门**。
> ① **问题**：`subagent` 工具的 `prompt` 声明为 `string` —— 无 schema、无模板、无校验 ⇒ 父模型写什么子 agent 就收到什么；实测同一个 critic 子会话的输入有编号版 / 加粗版 / 复审版三种形态，7 字段契约只靠模型自觉。
> ② **新增**：`lib/subagent-contract-core.ts`（纯逻辑内核：规则表 `CONTRACTS` + 小节识别 5 种实测写法 + 豁免语义 + 三钩子处理函数）、`plugins/subagent-contract.ts`（宿主接线）、`scripts/audit-subagent-prompts.ts`（审计 CLI）。
> ③ **三个执行点**：L3 `session.hook("context")` 把契约注入 subagent 工具描述（父模型采样前可见，幂等）；**L1 `tool.hook("execute.before")` 硬门**（宿主唯一允许失败的钩子 ⇒ 抛错被包成受控 `Tool.Error`，父模型看到缺失项与修正指引后同回合重发）；L2 `session.hook("prompt")` 兜底**检测**（session 域钩子不可失败 ⇒ 不可拦，只能审计）。
> ④ **豁免五重收窄**：关键词（复审/第 N 轮/闭合证据）**+ 结构前置**（缺失小节 ≥ 4/7 才可能豁免）+ **任务陈述区窗口**（关键词只认 prompt 开头 400 字符）+ **状态继承**（继承"上一轮是复审模式"，不是"上一轮合规"；续接轮不清零）+ **继承需自证**（本轮自己也要引用上一轮）。前两条来自 critic 第 1 轮 SHOULD_FIX；后两条来自豁免误命中抽样（真实库 90 条豁免全量复核，误命中 12 条 = 13.3% > 10% 阈值 ⇒ 收紧；收紧后真豁免命中位置全在 47–231 字符，误命中全在 1194–5377）。
> ⑤ **灰度**：默认 **warn**（只记录 + 审计），逐 agent 可切 `enforce`（配置每次重读 ⇒ 即时生效）。基线：真实库 331 次 critic 调用 / 110 违规 / 78 豁免（合规 143，43.2%；收紧前为 98 违规 / 90 豁免 —— 差的 12 条是抽样纠正的误豁免）。
> ⑥ **live 证据**：warn 模式 L1+L2 各落一条日志；enforce 模式 `subagent` 调用被拒并返回可执行修正文案。
> ⑥b **可观测性补齐**（2026-11-12）：① 豁免也落日志（`level:"exempted"`，带 `exemption`）——否则"这条为什么放行"线上不可见，且 `exempted`/`exemption` 字段永远为 false；② L3 注入可观测：契约注入进 `subagent` 工具描述这件事**不进日志、不进 DB、服务端也没有 tool 列表接口** ⇒ 线上完全无法判断"到底注没注入"。插件改为**每进程记一条**注入日志（`{"level":"info","gate":"L3","event":"injected"}`）—— 逐次记会刷屏（注入发生在每个模型请求前），完全不记则不可观测。
> ⑥c **端到端测试**（2026-11-12 新增）：`rdd-workflow-e2e` 仓新增 `tests/integration/test_subagent_contract_runtime.bats` —— 真实运行时（真实模型 + 真实宿主）+ **hermetic HOME**（契约配置 / 日志 / 会话 DB 全部隔离，配置目录用符号链接农场指向真实安装态），11 个场景覆盖 L3 / L1 warn-vs-enforce / L2 检出 / 合规放行 / 豁免三条路径 / 逐 agent 覆盖 / off / 审计 CLI；默认 skip，`E2E_REAL_RUNTIME=1` 才执行。
> ⑦ **配套**：`prompts/build.md` 补「被契约拒绝的调用不计入评审轮」；`scripts/check-upstream-anchors.sh` 加 A13/A13b（"只有 tool 域允许失败"）⇒ 23/23 命中；`tests/` 新增 52 例（core 40 + audit 8 + config-guards L4 4）⇒ 全量 **356 pass / 0 fail**。
> ⑧ **豁免抽样报告**：`.rddf/reviews/subagent-contract-exemption-sampling.md`（方法 / 12 条误命中逐条证据 / 收紧方案 / 前后对比 / 残留边界）。
> ⑨ **范围外残留**：`docs/MULTI-AGENT-DESIGN.md` 的模型归属表漂移 —— **已在 v2.12 订正**（explore / librarian / context-builder / title 的 model 与 Context）。

> **v2.10 变更摘要（2026-11-11，本地构建改为双分支 + 锁定官方版本）**：本地构建的源码来源从「`dev` 分支」改为「`local/build` 构建分支」。
> ① **分支模型**：`dev` = **纯上游镜像**（跟踪 `upstream/dev`，只做 fast-forward）；`local/build` = `dev` + 尚未被上游合并的本地改动（`git merge feat/xxx`）。脚本每次构建前先更新 `dev`，再 merge 进 `local/build` ⇒ 既能跟踪上游，又能带着本地未合入的修复跑；`dev` 不被本地提交污染，永远能 `pull --ff-only`。
> ② **锁定版本模式**：`--lock 2.2.5` 把构建固定到官方 v2.2.5 对应的 **dev 提交**（官方 tag 是 `release: vX`，其父提交才是 dev 提交），并在本地创建 `local/v2.2.5` tag；`--list` 列出官方版本 / 对应 dev 提交 / 本地 tag / 当前锁；`--unlock` 回到 `local/build`。锁文件 `~/.local/state/opencode-update/lock.json`。**锁定期间只构建纯官方版本**（不含本地改动），`--check` 会明确提示。
> ③ **脚本健壮性**（实测踩到的坑）：重启服务会杀掉当前会话 ⇒ **在重启前**恢复源码仓到原分支（不再依赖 EXIT trap）；`build.ts` 内部会跑 `bun install` 改写 `bun.lock` ⇒ 切换分支前还原（registry 镜像改写直接丢弃）；GitHub TLS 偶发中断 ⇒ fetch 重试 3 次。
> ④ **验证**：锁定构建（`v0.0.0-local-202611110702`）→ 解锁构建（`…0721`）→ 再次 `--lock`（幂等，tag 不重复创建）→ 失败路径（老版本 v0.0.1 / v0.3.59 拒绝、缺 tag、互斥参数、坏锁文件、锁与 tag 不一致）+ 2 个变异体（去掉祖先校验 / 用 tag 自身代替父提交）全部符合预期；锚点 21/21；服务 `local=true`、两插件加载、无 ERROR。

> **v2.9 变更摘要（2026-11-11，本机 opencode 改为「从源码构建 + 自更新」）**：**运行中的 opencode 二进制不再来自上游发布版，而是从 `/workspace/main/opencode`（fork `chisuhua/opencode` 的 `dev` 分支）本地构建**。
> ① **为什么**：让「运行版本」= 「可见源码」⇒ 上游语义漂移能被**立刻**发现并**就地**修复（修复走 PR 回上游，如 `anomalyco/opencode#63244`），而不是对着发布版猜。
> ② **自更新**：`scripts/opencode-update.sh`（新增）——`拉 dev → bun install → build --single → 原子替换 → 重启服务`；自举 bun（按上游 `packageManager` 要求版本，本机装在 `~/.local/share/bun-<ver>/`）；工作区有未提交改动时**拒绝**构建（除 `bun.lock` 的 registry 镜像改写，会被归一化比较后丢弃）；构建失败**不动**现有二进制。
> ③ **不会被发布版顶掉**：构建时 `OPENCODE_CHANNEL=local` ⇒ 二进制 `local=true` ⇒ opencode 自带的自动更新**自动跳过**（上游 `packages/cli/src/services/updater.ts`：`OPENCODE_LOCAL` 时 `inspect()` 直接返回）。⚠️ **手动 `opencode upgrade` 仍会覆盖** ⇒ 已在脚本输出与 `docs/front-delegate-architecture.md` §6.9 标明「不要用」。
> ④ **锚点改指真实运行源码**：`scripts/check-upstream-anchors.sh` 的默认 `--src` 从 `/workspace/project/opencode`（另一个开发 checkout，早已与运行版本分叉）改为 **`/workspace/main/opencode`** ⇒ **21/21 全绿** ⇒ 本轮的上游语义断言（`interrupt` 跨实例 / `remove` 语义 / `time_suspended` 语义）在 `dev` 上**依然成立** ⇒ 两篇 ADR 的「前置事实」已同步改写为「本机跑的是从源码构建的版本」。
> ⑤ **副作用修正**：源码构建的二进制换掉后，旧的发布版服务进程成了孤儿（端口 49374，exe 已 unlink）⇒ 已清理；E2E 的 `l2_cleanup_backends` 端口兜底从写死 49374 改为读 `opencode service status` 的实际地址（外部仓 `rdd-workflow-e2e` 的 commit `c7336c0`）。
> ⑥ **bun 版本**：上游要求 `bun@1.4.4`（`packageManager` 字段 + `packages/script/src/index.ts` 的硬校验）⇒ 本机全局 bun 仍是 1.3.14 ⇒ 构建用**局部** bun 1.4.4（`~/.local/share/bun-1.4.4/`），**不动全局**。

> **v2.8 变更摘要（2026-11-11，ADR-front-cancel-release 落地）**：**`cancel` 的释放判据 = 与 `suspend` 同源 + 显式 `force` 出口**。
> ① **背景（探针实证）**：`ADR-front-stop-confirmation` D1 早已裁定「`interrupt` 的返回值**不是**停机判据」，但 `cancel` 至今**只看该返回值**就放槽 + 置墓碑 ⇒ 探针复现：**后端仍在跑时 `cancel` 释放了槽位 ⇒ 同一工作树两个写入者**。⇒ 该路径正是 `ADR-front-multi-backend` **D7.3「强制接管」（推荐恢复路径）**的实现 ⇒ **推荐路径本身是双写者生成器**；反向也坏（`interrupted:false` ⇒ 纯 no-op ⇒ D7.2「cancel 后重派」在后端从未起跑时是**死锁**）。
> ② **判据**：`cancel` 复用 `suspend` 的停机判据（`wait` + 判活 + 水位线）；`interrupt` 的返回值**降级为诊断字段**。
> ③ **证据不足 ⇒ 整单拒绝**（不墓碑、不放槽，条目保持原状、仍可 resume）+ 返回 `reason`（证据类 5 + 授权类 4）/ `stop_judge` / `forced_available` + 落 `event:"cancel_refused"` ledger 行。
> ④ **`cancel_pending` 钉住**（`pair.json` 条目字段）：被拒 ⇒ 该后端可能还在写 ⇒ **reconcile 不得把它翻 `idle`**（否则双写者从后门回来）。代价 = 新增一条持久条件 ⇒ **崩溃恢复规则**（重启**不解钉**；出口三条：`cancel` 成功 / `force` / 后端被删）⇒ 已登记为「新增死槽面（已接受）」，并由 `sessions` 的 `cancel_pending` 字段保证**可见**。
> ⑤ **`force:true` 是 per-call 参数、不是 env**：**只跳过停机证据门控，不跳过授权门控** ⇒ 墓碑 + 放槽 + 落 `event:"cancel_forced"`（含 `reason` / `forced` / `strict_mode` / `baseline_idle`）+ 返回风险文案。理由：env 是**部署级默认** ⇒ 全体 front 无差别放行、用户未逐次知情；per-call 则**逐次可见 + 落盘可审计**。⚠️ 严格模式（多实例）下 `force` **仍可用**（偏离仅限 per-call 通道，env 通道仍不可用）。
> ⑥ **front 恢复序列从两步变四步**：`sessions` → `suspend` → 失败则 `cancel` → 失败则 `cancel(force)`（**须先向用户说明「该后端可能仍在写这个工作树」**）→ `dispatch`。`prompts/front.md` 与 `docs/front-delegate-usage.md` 同步，并删改两处「槽位会由下一次派发的回收顺带释放」的旧句（被钉住时该句不成立）。
> ⑦ **跨实例**：严格模式的作用域从 `suspend` **扩到 `cancel`**（`running0=false` 也要求水位线前移）+ `foreign_instance:true` + `strict_mode:true`；⚠️ 上游 `interrupt` 能否打断**另一实例**的 execution **未核对** ⇒ 严格模式下的 `cancel` 实为「等它自然跑完」。
> ⑧ **既有 ADR 同步修订 16 处**（multi-backend D1/D7.1/D7.2/D7.3/D9/D11.3/D12 注记/V08/V32/V33/V36/V37/V42、stop-confirmation D1/D2:68/D4、stop-ownership D2/S9/D3⑩/实现约束、knowledge-capability D5）+ ledger `event` 枚举新增 `cancel_refused` / `cancel_forced`。
> 验证：`bun test tests/` **304 pass / 0 fail**（新增 20 条 AC1–AC19 用例）；**变异验证 5/5 捕获**（`scripts/mutate-cancel-release.sh`）；上游锚点 **21/21**（对 v2.2.5，新增 A11/A12）；探针固化进仓库（`tests/probes/probe-cancel-release.ts`）；E2E **L2-19/L2-20/L2-22/L2-23 + 新增 L2-24 全绿**（真实模型 + 真实宿主）。ADR：`docs/adr/ADR-front-cancel-release.md`（D1–D7）；验收记录 `.rddf/reviews/front-cancel-release-verify.md`，E2E 证据 `.rddf/reviews/front-cancel-release-e2e-evidence.md`。
> ⚠️ **已知缺口 / 后续 backlog（2026-11-11 登记）**：① **跨实例根治不可在本仓实现**（上游无锁/租约/跨进程执行可见性原语）⇒ 登记为 **6 条上游 feature request**（**2026-11-11 更新**：其中 **3 条已核对闭合为事实**（`interrupt` 跨实例 / `remove` 语义）⇒ 不必上游改；**暴露 `time_suspended` 已提 PR** [anomalyco/opencode#63244](https://github.com/anomalyco/opencode/pull/63244)；余 2 条待议）（`time_suspended` 暴露、原子准入+投递、跨进程执行可见性、`interrupt` 跨实例语义、`session.remove` 是否中断 execution 等）；② **`cancel` 对不占槽条目（`idle`/`suspended`）仍是幂等 no-op**（不墓碑）⇒ backlog `cancel-idle-tombstone`（改动面涉及 4 处条款，另立 change）；③ **`cancel_pending` 重启不解钉** ⇒ 需要显式处理（front 靠 `sessions` 看得见）；④ **E2E 无法在真实运行时确定性触发「拒绝」分支**（上游 settle 快）⇒ 该分支靠单测 + 探针 + 变异守住。

> **v2.7 变更摘要（2026-11-09，ADR-front-multi-backend 落地）**：**front 从「同步单发」升级为「异步派发 + 只读观测 + 名册索引 + 单槽切换」**。
> ① **工具面三→四**：新增 `dispatch`（异步派发，立即返回）/ `sessions`（只读观测，**绝不投递 prompt**）/ `suspend`（暂停、**保留上下文可续**）/ `cancel`（终止、墓碑）；四个新工具各有**独立权限 action**（`delegate_dispatch`/`delegate_sessions`/`delegate_suspend`/`delegate_cancel`），全局 deny + 仅 front allow。既有 `delegate` 保留，**语义与判据不变**（唯一**行为**影响：与新工具共用一张槽位表的检查；另有两处登记字段写盘 `state`/`work_root`）。
> ② **单槽模型**：同一 git 工作树内**同一时刻只允许一个后端在跑**（槽位键 = `workRoot`；`dispatching`/`active` 占槽，`idle`/`suspended`/`tombstone` 不占）。同一仓的不同 linked worktree 各自一槽 ⇒ 想并行需先准备独立工作树。
> ③ **切换两步**：`suspend(当前)` → `dispatch/resume(目标)`，由 front 编排；**暂停 ≠ 终止**（`cancel` 才是墓碑、永久不可续）。
> ④ **「投递 ≠ 消费」**：上游 drain 是 `peek → awaitActivation(可无限阻塞) → prepareContext → promote`，且 `interrupt({resume:false})` **不删 pending 行** ⇒ 旧简报会在恢复后抢先跑（幽灵注入，**已运行时坐实**）。故 dispatch 返回前须**确认消费**（判据 = 该简报的 `message.id` 出现在 `session.context()` 的消息 id 集合里），未确认则停在 `dispatching`（只可 `cancel`）。
> ⑤ **ledger 增 `event` 独立字段**（不塞进 `outcome`）：`dispatched`/`dispatch_failed`/`cancelled`/`taken_over`；`outcome` 枚举新增 **`vanished`**（后端被外部删除）。
> ⑥ **已删后端不可见**（能力边界）：插件 ctx 无 `project` 域 ⇒ 无法枚举 repo ⇒ `sessions` 不列已删后端、观测面不补记。**派发面处置矩阵已按 ADR D12 定稿**（拿到 404 正面证据 ⇒ 旧条目墓碑 + 落 `outcome:"vanished"` 行 + 释放槽位），**实现已于 2026-11-10 落地**（builder：派发面拿到 404 正面证据 ⇒ 旧条目墓碑 + 落 `outcome:"vanished"` 行 + 释放槽位；`suspend`/`cancel` 不再因「无法定位」抛错）（**死槽风险已解除**）。
> ⑦ **双根归一**：`stateRoot`（状态落盘）与 `workRoot`（工作树）分离，linked worktree 下 pair 落主仓、变更检测在 worktree（`ADR-canonical-root-normalization`，commit `23584cd`）。
> ⑧ **上游语义实测**：`get()` 在 run 中**确实**返回 `time.busy`（此前探针 Q2/R4 冲突，R4 正确）；`list` 的 item 带 `metadata`（为空时省略字段）。
> 验证：`bun test tests/` **216 pass / 0 fail**；Phase 0 消费判据探针 16/16；权限矩阵 `opencode debug agents` 实测。ADR：`docs/adr/ADR-front-multi-backend.md`（D1–D12）；实施与验收记录见 `.rddf/reviews/front-multi-backend-*.md`。
> ✅ **后续已补齐（2026-11-10）**：E2E bats **L2-16…L2-22 + L2-99 全量 23/23 全绿**（外部仓库，真实模型 + 真实宿主）；**AC44 连续 10 次时延**（中位 0.2s，10/10）；**AC57 的完整往返序列**（E2E L2-22：dispatch A → suspend A → dispatch B → sessions → suspend B → resume A ⇒ A 以**同一 session_id** 恢复）；**停机判据按上游语义订正**（`interrupt` 的返回值 ≠ 停机判据 ⇒ 判据 = 「判活为假」+（基线在跑时）终态水位线前移，见 ADR D11.3）。
> ⚠️ **已知缺口 / 后续 backlog（2026-11-10 登记，均需另立 change）**：① **异步 `dispatch` 的 resume 目标无活体守卫**（AC19/D8.1「对正在运行的后端 resume ⇒ 拒绝」目前只落在同步 `delegate` 面）——这是本轮唯一会导致「两个写入者」的可达路径；② `isSessionMissingError` 用 `/404/` **宽判** ⇒ 含 "404" 的传输错误会被判成「已删除」⇒ 误放槽；③ `ctx.session.wait()` 在 run 中途被 interrupt 时的返回语义**未实测**（探针缺口）——「改用 `session.wait` 作停机判据」这个备选的前置；④ ADR 里三处**行号级**上游引用（`session.ts:278-281` / `run-coordinator.ts:164-171` / `adapter.ts:641`）应纳入「上游语义漂移」回归清单（opencode 升级后会静默漂移）。
> ✅ **本轮已补齐**：AC13 判据改写（planner，按 D12 改成五段）、**D12 派发面处置矩阵的实现**（builder：死槽已解除）、AC36 余下两处同步（`docs/dual-session-delegation.md` 补 `taken_over`、`prompts/front.md` 补 `vanished` 与 `event` 说明）、`proposal.md` AC4 脚注修正。

> **v2.6 增补（2026-11-09，ADR-delegate-delivery-evidence 落地）**：上面 v2.6 段的「**outcome 枚举不变**」一句已过时（历史不改，此处增补）：`outcome` 现扩展为 `succeeded` / **`unverified`** / `failed` / `interrupted` / `unknown` / `busy`。
> - `unverified` = 宿主报成功但本轮没有可验证的交付证据（`no_work_evidence=true` 时触发；判定链见 ADR D2）。
> - 摘要与 ledger 行同时保留宿主原值 `host_outcome`（`unverified` 时恒为 `succeeded`）。
> - 迁移面：`prompts/front.md`、`docs/front-delegate-usage.md`、`docs/dual-session-delegation.md`、`docs/front-delegate-architecture.md`、`ADR-front-knowledge-capability` D5、单测与 E2E —— **同一 patch 内完成**（ADR D3.1 八项）。

> **v2.6 变更摘要（2026-11-09）**：**静默失败检测** —— 宿主说 succeeded ≠ 工程 session 真的交付了东西。
> ① **缺陷来源**：E2E 实跑中发现，工程 session 在模型于 run 中途被切换后重来时，可能只读了 role.json 就输出角色开场白并 idle；宿主仍把该 run 记为 `succeeded` → delegate 回传 `succeeded` + `changed_files: []`，front 遂向用户转述"已完成"，而实际什么都没产出。
> ② delegate 回传**交付面证据**：`tool_calls`（工具调用总数）、`write_tool_calls`（写盘类调用数：`edit`/`write`/`patch`/`apply_patch`/`multiedit`；**shell 不算**，无法从命令文本判定落盘）、`artifacts`（本次产生的文件变更数，**git 可见口径**：被忽略 / 工程根外 / worktree 内的改动数不到）、`final_is_role_opening`（最后一条文本是否停在角色开场白）、`model_switched`（本轮是否中途换过模型 —— **根因信号**，宿主消息 `type == "model-switched"`，不依赖任何文本格式），以及判定结果 `no_work_evidence`。
> ③ 判定规则：`no_work_evidence = (final_is_role_opening || model_switched > 0) && write_tool_calls === 0 && artifacts === 0`。
>   - **只看本轮消息**（`sliceRoundMessages`，按 baseline 切片）——否则 resume 时上一轮的写盘调用会掩盖本轮零交付；找不到 baseline 时退回全量（宁可漏报不误报）。
>   - **仍在跑时不判定**（`still_running`：wait 超时或宿主未给 outcome）——此时读到的 outcome 可能是上一轮的陈旧值（resume 场景），据此判"没有产出"会误报。
>   - **只对 `kind=engineering` 判定**（知识 session 的产物本就是"回答"，通常零工具调用，套用会误报）。
> ④ **`outcome` 枚举不变**（仍是宿主视角的 `succeeded`）："没交付"由 `no_work_evidence` 单独表达，不改既有契约；front 契约同步（`prompts/front.md`）：`no_work_evidence=true` 时**不得转述为"已完成"**，必须转述"没有产出"并给出证据数、问用户重试还是换做法；§五 禁止事项新增一条。
> ⑤ ledger 行增记 `no_work_evidence` / `tool_calls` / `write_tool_calls` / `final_is_role_opening` / `model_switched`（审计可追溯）。
> ⑥ 判定逻辑集中在 `lib/delegate-core.ts::summarizeDelivery`（纯函数，可单测）；回归夹具 `tests/fixtures/real-no-work-session.json`（真实失败会话实录，回放 → `no_work_evidence=true`）。
> ⑦ 验证：单测 **144 pass**（覆盖率 99.14%）；E2E **15/15 ok**，L2-3 增断言（真实交付不得被误判：`no_work_evidence=false` 且 `write_tool_calls ≥ 1`）。
> ⑧ **已知缺口（待 architect 决策）**：目前"没交付"只由 `no_work_evidence` 标志位表达，防御**依赖 front 遵守 prompt**——不遵守的消费者读 `outcome=succeeded` 仍会误报。机读化方案（新增 `outcome="unverified"` + ledger 保留 `host_outcome`）属契约变更，未擅自实施。

> **v2.5 变更摘要（2026-11-08）**：**front 获得知识获取能力** —— 在「front 不获得写 / 执行能力」的前提下，放行只读 subagent 并引入记忆层。
> ① `agent.front.permission.subagent` 由 `"deny"` 改为逐 agent 对象：`explore` / `librarian` / `oracle` / `metis` / `critic` allow + `"*": "deny"`（显式排除 `general` / `plan` / `build`）。粒度实测：`opencode reload` 后 `debug agents` 解析出六条规则，`"*": deny` 末尾。
> ② 五个被放行 agent 的 `shell` 从 `"*": allow` 改为**三段式**（`"*": deny` 打头 → 只读白名单 → 尾部守卫 deny）：补 `* > *` / `* >> *` / `tee` / `find -fls` / `sort -o` / `uniq -o` / `git --output|--format|--pretty`；网络写落盘（`curl -o|--output|-O`、`wget -O|--output-document|-P`）与文件外泄（`curl -T|--upload-file|-d @|--data @|--data-binary @`）守卫；`git clone * /*` deny → `git clone * /tmp/opencode/*` allow。`librarian` 额外保留 `curl`/`wget`/`git clone`/`git ls-remote` 且不套 `* /*` 守卫；其 `subagent: allow` 改为 `deny`（封深度 2 链）。
> ③ `prompts/front.md` 同步：`subagent` 行改为「仅五个只读 agent ✅，其余 deny」；理解性出口扩为「直读 或 召只读 subagent」；新增 §2.1「只读 / 改判 / 信任定级」。`prompts/{explore,oracle,metis,librarian}.md` 的 `awk/env/printenv/jq` 措辞由「需人工放行」改为「被拒」；`critic.md` 删去白名单外的 `sed -n`；`librarian.md` 的 clone 目标改为 `/tmp/opencode`。
> ④ 决策依据：[ADR-front-knowledge-capability](../../docs/adr/ADR-front-knowledge-capability.md)（Proposed）；探针：[front-subagent-granularity-probe](../reviews/front-subagent-granularity-probe.md)；审稿：[adr-front-knowledge-capability-review](../reviews/adr-front-knowledge-capability-review.md)（oracle BLOCK→闭合，critic APPROVE_WITH_CONDITIONS，0 BLOCKER）。
> ⑤ **配套实施项未完成（转 builder）**：`delegate` 的 agent 白名单（create + resume）、只读 agent 恒注入 `edit:* deny`、`kind=engineering|knowledge` 登记类型、`.rddf/state/ledger.jsonl`。在此之前，D2 的放行与 D4 的约束**尚未同时成立**——front 已能召只读 subagent，但 `delegate(agent=...)` 仍未受限。
> ⑥ 生效条件：配置改动经 `opencode reload` 生效；**prompt 文件内容改动需 `opencode service restart`**（service 缓存，见 v2.3 的 D8.1）。

> **v2.4 变更摘要（2026-11-06）**：**模型降级链** —— OpenCode v2.2.5 无原生 `fallback` 配置（`agent.model` 单值），改由 `plugins/model-fallback.ts` + `lib/model-fallback-core.ts` 实现：挂 `session.hook("retry")`，按错误分类决定「原地退避 / `switchModel` 换链 / 放弃」，build 内置默认链 `commandcode → minimax-cn → openstarry → opencode-go`（当前生效链以 `model-fallback.json` 为准，见 ④）。
> ① 401/403/404 与订阅额度硬失败立即换链；5xx/网络类先退避 2 次；429 优先按 `retryAfterMs` 等待；**内容策略 / 上下文超限（`context length` / `token limit`）/ 400 / 413 / 422 不降级**，且这两类**先于**状态码短路（否则 400 + `forbidden` 会被误判成模型不可用，拿弱模型重试被拒内容）；
> ①' 冷却表**进程级**（跨 session 共享，内核仍保持纯函数：冷却条目由 plan 带出、宿主落盘）；会话状态按 location 重复 setup 时模块级共享 + 事件级去重；session 状态 30 分钟不活跃即淘汰；
> ② 失败模型 5 分钟冷却，链尾可绕回已恢复的链首；链耗尽即 `retry: false`；
> ③ 可见性：切换触发 TUI 模型指示器变化 + `~/.local/share/opencode/model-fallback.log`；实测 `session.synthetic` 通知会被当作新输入**再触发一轮模型调用**并重置降级状态，故默认关闭、降为显式选项 `notify: "synthetic"`；
> ④ 链与策略走独立配置文件 `~/.config/opencode/model-fallback.json`（`chains` / `policy` / `notify`），环境变量 `MODEL_FALLBACK_CONFIG` 可改路径 —— **本地插件拿不到 opencode 配置里的 options**（实测三种写法 `ctx.options` 恒为 `{}`），故不用 `plugins` 配置项；**链头不单独配**，失败时正在用的模型即链首，改默认模型 = 改 `opencode.jsonc` 的 `agent.model`；
> ⑤ 同步订正 MD §2.1 / §5.1 / §5.2 的 model 归属，新增 §5.4 降级链。**订正以运行时真值（`opencode debug agents`）为准** —— 初稿曾照抄配置文件的一次中间态，把 build / explore / oracle 误记成 `commandcode/deepseek/deepseek-v4.1-flash`（实际分别是 `minimax-cn/MiniMax-M3.1-Flash` / `opencode/deepseek-v4.1-flash-free` / `kimi-code/kimi-for-coding`），已在 §2.1 的订正说明里记下这个坑；
> ⑥ 验证：`tests/model-fallback-core.test.ts` 33 条单测（全量 `bun test tests/` 96 pass）；端到端探针以坏 `MINIMAX_API_KEY` 驱动，实测两次换链后由 `opencode-go` 成功作答（见 `~/.local/share/opencode/model-fallback.log`）；
> ⑦ 新增面向使用者的手册 `docs/model-fallback-usage.md`（默认模型 vs 后备链分别改哪 / 什么错误会换模型 / 日志怎么读 / 怎么停用降级），§5.4 与之互相指向；停用降级的做法均为实测结论（`chains.<agent>: []` **无效**，会回落到内置默认）。

> **v2.3 变更摘要（2026-11-06）**：**front agent 重设计** —— front 从"prompt 里的君子协定"变成**权限层强制 + 单通道委托**。
> ① front 的 `shell` 从 `"*": allow` + 30 deny 改为**只读白名单**（`*: deny` 打头 + 47 条只读 allow + 尾部守卫 deny），并追加 `"* /*": deny` 禁绝对路径；
> ② `external_directory` 由 `ask` 改为**路径对象**（放行 `/workspace/**` + 治理面目录）；
> ③ 新增 **front agent**（第 11 个 agent，第 3 个 primary），职责为用户交互内核 + 委托出口；
> ④ 新增 `delegate` **插件工具**（`plugins/delegate.ts`）：工具声明 `options.permission="delegate"` → 全局 deny + 仅 `agent.front` allow ⇒ **只有 front 拿得到**；
> 工程 session 在**建立时**权限定型（`[常量deny, scope edit 规则, grants]`），`grants` 受类目白名单（`question`/`form`/`edit`/`write` 永不可 grant）；
> ⑤ **退役** `scripts/delegate.sh` + `scripts/captoken.sh`（外部脚本 + 自研 HTTP + capability token）；
> ⑥ 工程 session 登记：`pair.json`（pair-v2）+ `role.json` 的 `sessions` 分区，**在 prompt 之前**写（否则角色退化为 `general`）；
> ⑦ 决策依据：[ADR-front-agent-redesign](../.rddf/state/adr-front-agent-redesign.md)；实施路径与验收：[front-agent-redesign](../.rddf/improvements/front-agent-redesign.md)；探针实测：[p0-probes](../.rddf/reviews/front-agent-redesign-p0-probes.md)。
> 实施期修正了 ADR 三处假设：`external_directory` **不约束 shell**（D4.1）、`session.update` **可原地改权限**（D5.1，救援不必全量重跑）、代答**仅同 location 可用**（D5.3）。


> 本节内的 § 引用为**当时的**章节编号；原 §4.4–§4.6 / §7.1–§7.3.1 / §8.1–§8.1.3 现位于本文件后续小节，原 §9 演进日志位于文末。

> **v2.0 变更摘要**：新增**审查配对**（角色 → 审查者）—— `architect` → oracle + critic（oracle 先行）、`planner` → metis、`builder` → verifier（角色内建）+ critic（架构面）。审查是角色矩阵**内核**，不依赖 rdd-workflow；预算按**文档粒度**分层（单条 change 上限 = critic 2 + verifier 3）；补充**审查者不可用降级**（内置自检清单 + 结论首行注明，禁止把「不可用」当「通过」）。
>
> **v1.9 变更摘要**：角色矩阵与 rdd-workflow **解耦**——角色矩阵改为**自足内核**（权限/产出契约/切换机制不依赖 rdd-workflow 是否安装），rdd-workflow 降为**可选增强层**；新增 `scripts/rdd-skills.sh`（懒探测：installed / available[] / sources[] / rddf_cli）；角色 ↔ 可选增强映射 + 工件归属规则（同一路径上单一写入者）写入 `prompts/build.md`（§2.6）。
>
> **v1.7 变更摘要**：新增项目级架构文档配置 `.rddf/config/arch-docs.json`（`arch_paths` / `exclude_paths`），**architect 可写范围**与 critic `arch` 档判据改为读配置；新增 `/arch-docs-init`（首次梳理写入、`--refresh` 更新、`--check` 查漂移）；`build_critic_prompt.sh` 按配置推断档位。
>
> **v1.6 变更摘要**：critic 引入**审稿档位** `review_profile`（`arch` / `plan` / `build` / `archive`），BLOCKER 判据按产物而不是按角色；上下文契约从 6 字段扩为 7 字段（§2.3、§2.4）；`build_critic_prompt.sh` 按改动路径自动推断档位；build 角色矩阵补齐 cwd 变更重解析、非法角色值、verifier 评审预算、builder 改 ADR 决策的边界（§2.2）。
>
> **v1.5 变更摘要**：critic 收窄为**架构与决策审稿**（不再报文档计数/格式/测试边角/护栏绕过面）；BLOCKER 限定三类；结论必须与 `mergeable` 一致，禁止用 NITS 凑 REJECT；`build.md` 新增**评审预算**（每 change ≤2 轮，第 3 轮需用户批准）、增量复审、禁止"攻击新判据"式委派、`scope_exceeded` 不入返工队列（§2.3、§2.4）。执行层校验的自动化迁移清单见 `docs/review-automation-backlog.md`。
>
> **v1.4 变更摘要**：模型元数据补全（`capabilities` + `limit.context` 按实测/上游值分级修正，§5.1、§5.2）；`librarian` 换成本最低档的 `kimi-k2.6`（`deepseek-v4-flash` / `glm-5.1` 实测不在套餐，§5.2、§7.3.1）；新增 `title` agent 用实测不思考的 `glm-5.3-flash`（§2.1）；`context-builder` 转为 `hidden`（§2.3）；`plan`/`oracle` 去掉 `temperature`（模型不支持该参数）；角色矩阵从 `AGENTS.md` 移入 `prompts/build.md`（§1.2、§6）；6 个 subagent prompt 补"被权限拒绝即终止"纪律（§3.3）。
>
> **v1.2 变更摘要**：新增 `critic` subagent（§2.3、§2.4、§3.1、§3.2、§4.3）；`build.md` 加入"何时调 critic"委派触发规则（§3.2）；critic prompt 4 段式输出格式（BLOCKERS / SHOULD_FIX / NITS / 验证建议）首次文档化（§2.4）；同步更新 §6 文件结构、§7 验证清单。
>
> **v1.1 变更摘要**：4 轮权限加固（详见 §4.3 后的小节 "v1.1 权限加固"）；plan agent 写入路径从 `.opencode/plan/` 改为 `.plans/`（§6 联动）；新增 `/plans-init` slash command（§6.1、§8.1）。

---

## 权限加固记录

> 原 `MULTI-AGENT-DESIGN.md` §4.4 / §4.5 / §4.6。当前生效的加固项见该文档 §4.4。

### 4.4 v1.1 权限加固（2026-10-13）

v1.0 部署后由 oracle 后审发现 3 类真问题，本节记录修复与理由。

#### 4.4.1 build bash 无界（修复 R-01）

**问题**：`bash: "allow"` 让 build agent 可执行任意 shell 命令，包括 `git push --force`、`rm -rf`、`sudo` 等不可逆操作。`snapshot: false` 意味着没有 undo 检查点。

**修复**：bash 改为 `* + 危险命令 ask` 模式，拦截 19 条高频危险模式：

| 类别 | 拦截模式 |
|---|---|
| git 推送 | `git push` / `git push *` |
| git 丢工作区 | `git reset --hard` / `git clean -fd*` / `git clean -fdx*` / `git checkout --` / `git checkout .` / `git restore *` |
| git 丢分支/栈 | `git branch -D *` / `git stash drop *` / `git stash clear *` |
| 删文件 | `rm -rf *` / `rm -fr *` / `rm -r *` / `rm -f *` |
| 提权 | `sudo *` |

**机制**：opencode V1 bash 对象采用 **last-match-wins**，catch-all `"*": "allow"` 放第一条，具体 ask 规则后续追加——匹配到 ask 规则时取 ask 生效。

#### 4.4.2 MCP 写工具无界（修复 R-02）

**问题**：v1.0 仅限制 `edit` 权限，但 `codebase-memory-mcp` 提供 5 个写工具（`delete_project` / `index_repository` / `ingest_traces` / `manage_adr` / `query_graph`）——explore / oracle / librarian / metis / general 这些"只读" agent 都能调，一条 `delete_project` 就能毁掉整个知识图谱索引。`query_graph` 特别隐蔽：Cypher 支持 `CREATE/SET/DELETE`，除非服务端强制只读，否则等于通用改图通道。

**修复**：

| MCP 工具 | build | plan / explore / librarian / oracle / metis / general |
|---|---|---|
| `delete_project` / `index_repository` / `ingest_traces` / `manage_adr` | ask | deny |
| `query_graph` | ask | deny |

**机制**：V1 permission action 命名 `<server>_<tool>`（连字符保留，`.` 替换为 `_`），opencode 源码 `lifecycle.test.ts` 验证。`codebase-memory-mcp_query_graph` 与实际工具名精确对齐。

#### 4.4.3 描述/权限自相矛盾（修复 R-03 / R-04）

**问题**：

- `general` 描述"Read-only"但 bash 白名单含 `npx *` / `node *` / `npm test *`——`npx` 能下载执行任意 npm 包，比 build 的 `bash: allow` 还隐蔽
- `explore` 描述"Read-only"但保留 `doom_loop: deny`、websearch `ask`——prompt 与权限不一致

**修复**：

- general：砍 `npx *` / `node *` / `npm test *`，bash 白名单回归纯只读子集
- explore：`websearch` 改 `deny`（本职是本地搜索，外网搜索走 librarian）
- oracle / metis：`bash` 改 `deny + 白名单`（原本是 `*` 全 ask，每次想 `ls` 都弹窗，非交互上下文有挂起风险）
- 所有 subagent：`question: deny`（subagent 弹问题给用户的交互路径别扭，应返回"不确定"给 parent）

#### 4.4.4 plan 写入路径修正（修复 R-05）

**问题**：v1.0 权限白名单 `.opencode/plans/*.md`（复数 `plans`）与 prompt 要求的 `.opencode/plan/*.md`（单数）不一致——plan agent 的主写入路径被自己的权限 deny 掉，工作流直接断。

**修复**：统一为 `<project-root>/.plans/<slug>.md`（与 opencode 引擎自身的 `.opencode/` 命名空间隔离）。`scripts/plans-init.sh` + `commands/plans-init.md` 提供 `/plans-init [path]` 自动化 `.gitignore` 初始化（详见 MULTI-AGENT-DESIGN.md §6.1）。

### 4.5 v1.2 权限加固（2026-10-15）

v1.1 部署后由外部代码审查（oh-my-openagent 项目调研，详见 §10）发现 critic 类角色缺失；本次新增 critic agent 时同步加固 3 项。

#### 4.5.1 新增 critic agent（建立审稿门禁）

**问题**：v1.0/1.1 的 7 个 agent 全部是"先于 build"或"build 并行"，**没有任何"build 之后做对抗式审稿"的角色**。大改动（≥3 文件 / 跨 API / 跨模块）经常带着隐藏缺陷过线；build agent 自我审查又会陷入"作者 = 评审人"的偏差。

**修复**：新增第 8 个 subagent `critic`，专责对抗式审稿：

- **模型**：`kimi-code/k3-256k`（256k 长上下文 + 已用于 oracle 审稿类）
- **temperature**：0.1（冷静对抗，不情绪化）
- **prompt 强制 4 段式输出**（§2.3）：BLOCKERS / SHOULD_FIX / NITS / 验证建议 + `mergeable` / `scope_exceeded`（v1.5 去掉 10 项旁路清单）
- **默认怀疑、结论与证据匹配**：禁止"整体看起来不错"等零信息话术；v1.5 起只有 BLOCKER 才能给 REJECT

#### 4.5.2 critic 权限最严化（修复 R-06）

**问题**：critic 必须严格只读——它不是写代码的人，是挑刺的人。如果允许它写、改、调子 agent，会破坏审稿的客观性。

**修复**：critic 是**唯一** `webfetch: deny` + `websearch: deny` + `task: deny` + `question: deny` 全 deny 的 agent（其它 subagent 至少 task 或 webfetch 有一个 allow）：

| 工具 | critic | 其它 subagent（对比） |
|---|---|---|
| edit | deny | deny |
| webfetch | **deny** | allow（librarian/oracle/metis 都要联网） |
| websearch | **deny** | allow（librarian/oracle） |
| task | **deny** | librarian: allow（调 explore）|
| question | **deny** | 同其它 subagent |

v1.2 设计：critic 的 `codebase-memory-mcp` 10 个工具（5 写 + 5 读）**全部 deny**——critic 不查代码图谱，只看 git diff + 文件内容（避免 graph 查询把"模型视角"和"代码现状"混淆）。

**bash 白名单收窄**（比 librarian 严）：不包含 `curl / wget / git clone`——critic 不下载、不 clone，只读已有文件。

> **v1.3 修正（§4.6.4）**：迁移到 v2 扁平权限时 critic 的只读图谱工具被误降级成 deny，与 `prompts/critic.md` 要求的 `list_projects` 冲突。v1.3 已恢复 10 个只读工具 allow，4 个写工具保持 deny。

#### 4.5.3 build.md 加入 critic 触发规则（修复 R-07）

**问题**：v1.1 的 build agent 完全不知道 critic 存在——8 个 agent 注册到 opencode.jsonc，但 build agent 的 prompt 没说"什么时候该调 critic"。结果 critic 配置 100% 闲置。

**修复**：`prompts/build.md` "委派原则"段加 1 条 + "何时调 critic"段加 5 个条件 + 4 段式输出协议。详见 §3.2.1。

#### 4.5.4 未来权限审查 TODO（继承自 v1.1 §8.2 P1 清单）

- ❌ 未在真实 session 实测 critic 是否真的按 4 段式输出
- ❌ 未实测 critic 6 个 git 只读子命令是否能涵盖 PR review 全部需求
- ❌ v1.1 的 MCP `query_graph: ask/deny` 在 v1.2 改成 critic 全 deny 后是否影响 build agent 查询图谱（不变：build 仍是 ask）

### 4.6 v1.3 权限加固与 v2 schema 迁移（2026-10-21）

OpenCode 升级到 **v2.1.2** 后做了 4 项修复。前两项是**迁移期静默失效**（配置能加载、但权限不生效），后两项是**迁移过程中引入的越权**。

#### 4.6.1 v2 schema 迁移：MCP 权限键形态（修复 R-08）

**问题**：v1 的嵌套写法

```jsonc
"permission": { "codebase-memory-mcp": { "search_graph": "allow", "*": "deny" } }
```

在 v2 下会被归一化成 `{ action: "codebase-memory-mcp", resource: "search_graph" }`——但 v2 的 MCP 工具 action 名是 `<server>_<tool>`（`codebase-memory-mcp_search_graph`），**永远匹配不上**。后果不是"被拒"而是"落到默认 ask"：所有图谱调用每次都弹审批框。

**修复**：全部改成扁平键（§6.2）。

| 位置 | v1 写法 | v2 写法 |
|---|---|---|
| 全局 | `"codebase-memory-mcp": { "*": "deny", "search_graph": "allow" }` | `"codebase-memory-mcp_*": "deny"` + `"codebase-memory-mcp_search_graph": "allow"` |
| agent 级 | 同上 | `"codebase-memory-mcp_index_repository": "ask"`（扁平单键）|

其它同批迁移项：`provider` → `providers`、`npm` → `package`、`options` → `settings`、顶层 `subagent_depth` → `experimental.subagent_depth`（顶层写法在 v2 下被**静默丢弃并只留一条 WARN**，限深形同失效）。

> `bash` 键在 v2 会被自动归一化成 `shell`（`normalizeAction()`），所以配置里继续写 `bash` 也能用；但文档与新配置统一按 v2 语义描述。

#### 4.6.2 `.env` 保护被 agent 权限覆盖（修复 R-09）

**问题**：opencode 内置 `read *.env → ask` 保护排在规则链**前面**，而每个 agent 又写了 `"read": "allow"`——按 last-match-wins，agent 的规则**更靠后** → 内置保护被覆盖。实测：所有 agent（含 critic）都能 `read` 读取 `.env`，且 `cat *.env` 走 shell 权限（`cat *` allow）完全绕过 read 规则。

**修复**：

1. 每个 agent 的 read 改成对象形式，把 `.env` 规则写在 `*` 之后（顺序即策略）：
   ```jsonc
   "read": { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" }
   ```
2. shell 层补 `.env` 拦截（只读 agent `deny`，build `ask`）：`cat/head/tail *.env` 与 `*.env.*`。

**残留**：shell 是**整串前缀匹配**，重定向不在匹配范围内——`git show HEAD:.env > /tmp/x` 这类仍会绕过。权限模型的固有限制，不是配置问题。

#### 4.6.3 只读白名单越权（修复 R-10）

**问题**：v1.3 迁移时为"减少 ask 弹窗"把只读 agent 的 bash 白名单大幅放宽，其中 4 条是越权原语：

| 允许项 | 风险 |
|---|---|
| `awk *` | awk 可 `system()` 任意命令、可 `> file` 写文件——`edit: deny` 被绕过 |
| `env *` / `printenv *` | 直接把 `OPENSTARRY_API_KEY` 等密钥打进 transcript → 第三方模型 |
| `jq *` | 辅助写文件（配合重定向）|

**修复**：只读 agent 移除这 4 条 → 落回 catch-all `"*": "ask"`，人工放行。build 是信任边界内的主 agent，保留其能力。

> **保留的既有 deny**：`find * -exec *` / `find * -execdir *` / `find * -delete`（只读 agent）。

#### 4.6.4 critic 图谱工具与 plan 写操作的迁移误降级（修复 R-11）

**问题**：v1.2 设计里 critic 是"不查代码图谱、10 个 MCP 工具全 deny"（§4.5.2）。但 v1.3 迁移后的 critic 块只剩 `codebase-memory-mcp_*: deny` + `trace_path: allow`——**连 `list_projects` 都被 deny**，而 `prompts/critic.md` 明确要求 critic 先调 `list_projects` 查 project 名。提示词与权限直接打架。

同理，plan 的 4 个 MCP 写操作在 v1.1 是 `ask`，迁移时被静默降级成继承全局 `deny`。

**修复**：

- critic 恢复 10 个**只读**图谱工具 allow（`search_graph` / `get_code_snippet` / `trace_path` / `get_architecture` / `get_graph_schema` / `query_graph` / `search_code` / `detect_changes` / `list_projects` / `index_status`），4 个写工具（`index_repository` / `ingest_traces` / `manage_adr` / `delete_project`）保持 deny；
- plan 的 4 个写操作恢复 `ask`。

> **`query_graph` 的决定（v1.4，用户拍板）**：它被放进了**全局** allow 列表 → 8 个只读 agent 都能调。按 本文件「v1.1 权限加固 §4.4.2」的判定它应属"写工具"（Cypher 可写），但**保持 allow** —— 理由是该 MCP server 的 `query_graph` 只用于读查询，实际风险远低于 `delete_project` / `index_repository`；逐个 agent 加 deny 会让每次查询都弹 ask，破坏只读 agent 的可用性。此决定已记录在 MULTI-AGENT-DESIGN.md §8.1 P0。


---

### 4.7 v2.47 权限加固：commit 审批点搬到工具层验证门（2026-11-18）

见 `docs/adr/ADR-commit-verification-gate.md`（Status: **Accepted**；oracle 1 轮 + critic **7 轮**，末轮
`APPROVE_WITH_CONDITIONS`（无 BLOCKER）⇒ 逐轮处置见 `.rddf/reviews/commit-verification-gate-review.md`）。

#### 4.7.1 `git commit`：`ask` ⇒ `allow`，闸门改由插件承担

**问题**：`ask` 在**非交互场景 = 硬拒**（v2.44 实测：模型被工具层拦住、HEAD 未变）⇒ 被派发后端 / `opencode run`
这类无人值守路径**提交能力为零**；交互场景是否拦**机制未查明**（见 §「权限加固记录」里 v2.44 的实测）。
且拦截是**前缀匹配** ⇒ `git -c user.name=x commit` / `GIT_AUTHOR_NAME=x git commit` **不匹配** `git commit *`
⇒ 软约束可被写法绕过。

**修复**：新增 `plugins/commit-gate.ts`（纯逻辑 `lib/commit-gate.ts`）——
`git commit` 的审批点从**权限弹窗**搬到**工具层验证门**（仓库声明的验证命令全绿 + 暂存区非空 + 暂存内容落在当前角色的写集内 ⇒ 放行；
否则抛错 ⇒ 受控 Tool.Error，模型看到缺项并自行修正）。配置侧 `git commit` / `git commit *` ⇒ `allow`。

#### 4.7.2 force push 收紧为 `deny`

`git push --force*` / `git push -f*` / `git push * --force*` / `git push * -f*` ⇒ `deny`
（shell 是**整串前缀匹配** ⇒ flag 在末位的形态也必须显式列出；`deny` 不会被宿主的 Allow always 放行）。
`git push` 仍 `ask` ⇒ **publish 一律维持人工确认**。

#### 4.7.3 命令识别口径收紧（fail-closed，7 轮复审收敛）

复审逐轮挖出「**整串前缀匹配 ⇒ 搭便车**」的同族绕过面 ⇒ 口径最终收敛为**三条硬规则**（ADR D5⑧⑨⑩）：

- **commit 必须单独成段**：引号外出现 `;` / `&&` / `||` / `|` / `&` / 换行 且任一段是 commit ⇒ 拒
  （否则 `git commit -m x; git push --force …` 整串命中 `git commit *: allow` ⇒ force-push 的 `deny` 被绕过；
  `cd 别的仓 && git commit` 还会让门禁判错仓）。末位 `;` / 换行只是**空命令** ⇒ 放行；末位 `&`（后台执行）⇒ 拒。
- **命令替换 ⇒ 拒**：`$(…)` / 反引号 / 进程替换（单引号外）⇒ 拒（`git commit -m "$(git push --force …)"` 会打穿 `deny`）。
- **判定对象必须可定位 ⇒ 拒**：`git -C` / `--git-dir` / `--work-tree` / `GIT_DIR=` 等换仓形态，以及 `sudo` / `env` / `timeout` 等**包装命令** ⇒ 拒。

⚠ **代价**（显式登记于 ADR D9）：① `git commit -m x; echo "exit=$?"` 这类尾随报告段被拒（可见假阳性，模型重试即可）；
② 提交消息里出现 `$(` 被拒（改用 `-F <file>`）；③ 形态闭口对**所有仓**生效（封的是宿主的整串前缀漏洞），D2 的三判据仍只对**声明仓**生效；
④ 门禁按**会话所在目录**判定（不是 shell 的 `workdir`）⇒ 跨仓提交一律拒。

#### 4.7.4 遗留面收口：force-push 工具层兜底 / workdir 判定 / 解释器闭口（2026-11-18 续）

- **force push 工具层兜底**（`lib/push-gate.ts`）：config 的 `deny` 与宿主「Allow always」持久化授权优先级未知
  ⇒ 同一插件在 `execute.before` 直接拒（`git push` 后出现任一强推标志）。是 config 强推 deny 的**严格超集**
  （短选项簇 `git push -uf` config 的 glob 表达不了；Rev 2 扩到八条）。
- **判定对象改用 shell 的 `workdir`**（回退会话目录）：跨仓提交不再被误判「暂存区为空」；角色身份仍按会话（`stateRoot`）。
- **解释器闭口**（ADR D5⑪）：段首是 `bash -c` / `sh -c` / `eval` / `xargs` / `ssh` / `docker exec` / `kubectl exec`
  且串内（含引号内）提到 `git commit` 或 force push ⇒ 拒（被解释的字符串对门禁不可见）。完整包装清单与残余面见 ADR D5⑪ / D9③⑩（`zsh`/`dash`/`ksh`/`fish`/`scp`/`rsync`/`podman`/`nsenter`/`expect` 等同属闭口范围）。
- **仍登记不做的**（⚠ **本节是当时的快照**）：`git push origin +main`（`+refspec`，两层都不拦，D9⑬ —— **Rev 2 起已闭合**，见 §4.7.5）、
  **脚本文件内容**里的提交（D9③⑥⑩ —— 仍成立）、heredoc 逐行解析边界（D9⑫ —— **Rev 2 起已闭合**，见 §4.7.5）。

#### 4.7.5 强推口径扩到八条 + heredoc 预处理单遍 + 命令词引用/转义还原（2026-11-18）

- **强推口径**：config `deny` 四条 ⇒ **八条**（新增 `git push +*` / `git push * +*` / `git push --mirror*` / `git push * --mirror*`
  —— `+refspec` 与 `--mirror` 也是「重写远端历史」）；工具层谓词改为**单一真源** `scanForcePush`
  （覆盖长选项**缩写** `--mirro`、短选项簇 `-uf`、前导 `+` 的 refspec、**带引号**形态；
  **跳过带值选项**的值 ⇒ `git push -o +ci origin main` 在**工具层**不误拒
  —— ⚠ **但 config 层表达不了「跳带值」**：该串在**权限层**就命中 `git push * +*` ⇒ 被 deny（假阳性，方向 fail-closed；见 ADR D4 已知限制）。
  用户可感知的行为变化：
  **`git push --force-with-lease` 现在也会被拒**（口径是「凡重写远端历史即拒」，有意为之）。
- **heredoc 预处理**改**单遍扫描 + 引号状态跨行**（与分词器同一套引号/转义规则）：
  修掉一条**实测 fail-open**（跨行引号里的 `<<` 被误当 heredoc 标记 ⇒ 吞掉真正的提交命令）。
- **命令词还原**（tokenizer 源头）：引号外的反斜杠转义、`$'…'` / `$"…"` 引用外壳 ⇒
  `g\it commit` / `$'git' commit` / `git c\ommit` 现在**被识别为 commit**（此前未验证提交可直接落地）。
- **仍登记不做**：删除类 push（`--delete` / `-d` / `:refspec` / `--prune`）、命令行之外的强推
  （`remote.<n>.push` 带 `+`）、参数展开与 ANSI-C 转义表、同行多个 heredoc ⇒ 见 ADR D9⑫–⑮。

## 各版本验证记录

> 原 `MULTI-AGENT-DESIGN.md` §7.1 / §7.2 / §7.3 / §7.3.1。当前态汇总见该文档 §7.1。

### 7.1 已完成验证（2026-10-13）

| 测试 | 状态 |
|---|---|
| JSON 合法性（7 个 JSON 文件）| ✅ 通过 |
| 7 个 agent 全部注册 | ✅ 通过 |
| 7 个 `{file:...}` 引用全部解析 | ✅ 通过 |
| permission schema 字段全部合法 | ✅ 通过 |
| model/provider 路由全部存在 | ✅ 通过 |
| `default_agent: "build"` 指向合法 primary | ✅ 通过 |
| `subagent_depth: 2` 合理 | ✅ 通过 |
| explore subagent 核心能力（grep）| ✅ 通过（静态+实跑）|
| librarian subagent 元规则 | ✅ 通过（prompt 内容含 8 处 explore 引用、6 处付费墙 fallback）|
| 解析器兼容性（模拟 OpenCode 启动）| ✅ 通过（0 错误 0 警告）|
| v1.1 后权限 schema 合规 | ✅ 通过（`json5` 解析 + 字段结构核查）|
| v1.1 plans-init.sh 幂等性 | ✅ 通过（重复跑 + 已存在条目场景 dry-test）|
| v1.1 bash last-match-wins 行为 | ✅ 通过（oracle 文档核查 + pattern 顺序验证）|
| v1.1 MCP action 命名格式 | ✅ 通过（opencode 源码 `lifecycle.test.ts` 验证）|

### 7.2 v1.2 新增验证（2026-10-15）

| 测试 | 状态 |
|---|---|
| JSONC 严格解析（node 解析，模拟 opencode 行为）| ✅ 通过 |
| 8 个 agent 全部注册（含 critic）| ✅ 通过 |
| 8 个 `{file:...}` 引用全部解析（含 critic）| ✅ 通过 |
| critic 必填字段完整（model/temperature/mode/description/permission/prompt）| ✅ 通过 |
| critic 关键 deny：edit/webfetch/websearch/task/question | ✅ 通过 |
| critic model `kimi-code/k3-256k` 在 provider 池中 | ✅ 通过 |
| build.md 改后 schema 合规 | ✅ 通过 |
| build.md 反向引用 critic 的位置（§"委派原则" + §"何时调 critic"）| ✅ 通过 |

### 7.3 v1.3 新增验证（2026-10-21）

用 opencode v2.1.2 自带命令实测（`opencode debug config` / `opencode debug agents`），按 v2 的 last-match-wins + Wildcard 规则复算生效权限：

| 测试 | 状态 |
|---|---|
| `opencode debug config` 归一化诊断 | ✅ 通过（0 错误 0 警告）|
| `experimental.subagent_depth: 2` 生效 | ✅ 通过（出现在解析结果里）|
| 顶层 `subagent_depth` 已移除 | ✅ 通过（v2 会以 `unsupported` 告警丢弃）|
| 9 个 agent 全部注册 + 9 个 `{file:...}` 全部解析 | ✅ 通过 |
| MCP 权限扁平键生效（`codebase-memory-mcp_search_graph` 等）| ✅ 通过（10 个只读工具 allow、4 个写工具 deny）|
| critic 的 `list_projects`（prompt 要求调用的工具）不再被 deny | ✅ 通过 |
| `.env` 读取：read → ask（全部 agent）| ✅ 通过 |
| `.env` 读取：shell cat/head/tail → deny（只读 agent）/ ask（build）| ✅ 通过 |
| `awk`/`env`/`printenv`/`jq` → ask（只读 agent）| ✅ 通过 |
| `find * -exec *` → deny（只读 agent）| ✅ 通过 |
| provider 模型 id 与上游一致（`opencode models` 核对）| ✅ 通过（`mimo-v2.5-pro` / `deepseek-v4.1-flash` / `kimi-k2.6` 均存在）|
| `.gitignore` 覆盖所有备份文件（`git check-ignore` 复核）| ✅ 通过 |
| 备份文件里的明文 API key 已隔离出索引 | ✅ 通过（**key 本身仍需轮换**）|

### 7.3.1 v1.4 新增验证（2026-10-21）

**配置层**（`opencode debug config` / `debug agents`）：

| 测试 | 状态 |
|---|---|
| `capabilities` 字段被接受、无归一化诊断 | ✅ 通过（0 错误 0 警告）|
| 10 个 agent 全部注册（含新增 `title`）| ✅ 通过 |
| `title` 接上 `openstarry/glm-5.3-flash`、`hidden=true` | ✅ 通过 |
| `context-builder.hidden` 生效 | ✅ 通过 |
| `librarian` 切到 `openstarry/deepseek-v4.1-flash` | ✅ 通过 |
| `plan` / `oracle` 不含 `temperature` | ✅ 通过 |
| 角色矩阵移出 AGENTS.md 后 build prompt 仍完整（7361 字符）| ✅ 通过 |

**模型层**（直接打 openstarry / models.dev 元数据）：

| 测试 | 结果 |
|---|---|
| `deepseek-v4.1-flash` 基本对话 | ✅ 正常返回（含 `reasoning_content`）|
| `deepseek-v4.1-flash` 工具调用 | ✅ `finish_reason: tool_calls`，参数正确 |
| `deepseek-v4.1-flash` 210,074 token 输入 | ✅ 被接受 → 现声明 262,144 有实测支撑 |
| `deepseek-v4.1-flash` 关思考（`thinking.type=disabled` / `enable_thinking=false` / `reasoning_effort=none`）| ❌ **三种参数全被网关忽略**，思考关不掉 |
| `glm-5.3-flash` 是否思考 | ✅ **不思考**（`reasoning_tokens=0`，无 `reasoning_content`）—— 成为 title/context-builder 的选型依据 |
| `MiniMax-M2.7-highspeed` 是否思考 | ⚠️ 无 `reasoning_content` 但正文内联 `<think>`，且 `reasoning_tokens>0` |
| 其余池内模型（qwen3.7-plus / kimi-k2.6）| ⚠️ 均返回 `reasoning_content` |
| openstarry `/v1/models` 是否返回 limit 元数据 | ❌ 不返回（只有 id + `supported_endpoint_types`）|
| `deepseek-v4-flash` 是否可用 | ❌ `model_price_error`（不在该套餐可用列表），且不在 `/v1/models` |
| `glm-5.1` 是否可用 | ❌ `model_price_error`；`/v1/models` 只有 `glm-5.3` / `glm-5.2` / `glm-5.3-flash` |
| `glm-5.3` / `glm-5.2` 是否可用 | ✅ 对话 + 工具调用均通过（未入池）|


---

## 已完成改动台账

> 原 `MULTI-AGENT-DESIGN.md` §8.1 / §8.1.1 / §8.1.2 / §8.1.3。剩余待办见该文档 §8.1 起。

### 8.1 v1.1 已完成

| 改动 | 章节 | 备注 |
|---|---|---|
| build 19 条危险命令 ask | §4.4.1 | bash last-match-wins |
| MCP 5 个写工具 deny/ask | §4.4.2 | 含 query_graph |
| subagent question 统一 deny | §4.4.3 | 与 prompt 自洽 |
| general 砍 npx/node/npm test | §4.4.3 | 严格 read-only |
| oracle/metis bash 改 deny+白名单 | §4.4.3 | 消除 ask 挂起风险 |
| explore websearch 改 deny | §4.4.3 | 本职是本地搜索 |
| plan 写入路径改 `.plans/` | §4.4.4 / §6.1 | 命名空间隔离 |
| `scripts/plans-init.sh` | §6.1 | 幂等 .gitignore 配置 |
| `commands/plans-init.md` | §6.1 | `/plans-init [path]` 命令 |

### 8.1.1 v1.2 已完成（2026-10-15）

| 改动 | 章节 | 备注 |
|---|---|---|
| 新增 `critic` subagent | §2.3 / §2.4 | 对抗式审稿，第 8 个 agent |
| `prompts/critic.md` 4 段式 prompt | §2.3 | 强制 BLOCKERS/SHOULD_FIX/NITS/验证建议 |
| critic 权限最严化（webfetch/websearch/task/question 全 deny）| §4.5.2 | R-06 |
| critic MCP 10 工具全 deny | §4.5.2 | 不查代码图谱 |
| `build.md` 加入 "何时调 critic" 5 条件 | §3.2 / §3.2.1 | R-07 |
| `build.md` 加入 critic 委派原则 | §2.2 | build agent 知道 critic 存在 |
| 移除 `zhipuai` 空 provider | §5.1 | 2026-10-15 清理 |
| 同步更新 §2.1 总览表 / §3.1 矩阵 / §4.3 权限表 | — | 反映 8 agent 现状 |
| 同步更新 §6 文件结构 / §6.2 JSONC 结构 | — | 反映 8 agent + 3 provider |

### 8.1.2 v1.3 已完成（2026-10-21）

| 改动 | 章节 | 备注 |
|---|---|---|
| OpenCode v2.1.2 schema 迁移（permission 扁平化 / `providers` / `experimental.subagent_depth`）| §4.6.1 | 旧写法在 v2 下静默失效 |
| `.env` 保护修复（agent 级 `read` 改对象形式 + shell 级 deny）| §4.6.2 | 内置 `*.env` ask 曾被 `read: allow` 覆盖 |
| 只读白名单收敛（砍 `awk` / `env` / `printenv` / `jq`）| §4.6.3 | `awk` 可 `system()` 任意命令 |
| critic 只读图谱工具恢复 + plan 的 MCP 写操作恢复 `ask` | §4.6.4 | 迁移时误降级 |
| 5 个只读 subagent 输出 XML → Markdown | §2.3 | 省 token、可读性更好 |
| 新增 `context-builder` subagent + `/critic-review` command | §2.3 / §3.1 / §3.2 | critic 上下文组装器 |
| 备份文件与明文密钥隔离（`.gitignore` + 移出索引）| §6 | `backup_v1/opencode.jsonc` 含明文 key |

### 8.1.3 v1.4 已完成（2026-10-21）

| 改动 | 章节 | 备注 |
|---|---|---|
| 模型元数据补全（`capabilities` × 12、`limit.context` 修正 × 4）| §5.1 | 按"厂商直连 / 实测 / 上游一致"分级取证据 |
| `librarian` → `openstarry/kimi-k2.6` | §5.2 | 成本优先；`deepseek-v4-flash` / `glm-5.1` 实测不在套餐，未采用 |
| 新增 `title` agent（glm-5.3-flash，不思考）| §2.1 / §2.3 | 替代 deprecated 的 `small_model` |
| `context-builder` 改 `hidden: true` | §2.3 | 避免污染用户手选列表 |
| `plan` / `oracle` 去掉 `temperature` | §2.1 | 模型 `temperature=false`，设了被忽略 |
| 角色矩阵从 `AGENTS.md` 移入 `prompts/build.md` | §1.2 / §6 | 消除与 subagent「固定小节」输出的冲突 |
| 6 个 subagent prompt 补「被权限拒绝即终止」+ 禁区清单 | §3.3 | 阻止 agent 换写法绕过权限 |
| `critic.md` 补「无法验证必须说明」 | §2.3 | 避免未验证结论被当成 PASS |
| `build.md` 补 subagent 返回结构表 + context-builder 触发条件 + 委派带 project 名 | §3.2 / §3.3 | 减少空转工具调用 |

### 8.1.4 v1.9 已完成（2026-11-03）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 新增「rdd-workflow 增强层（可选）」节 | §2.6 | 角色矩阵自足；skill 只在前置条件满足时调用 |
| 角色 ↔ 可选增强映射表（architect/planner/builder/verifier/general）| §2.6 | 前置条件取自各 skill frontmatter 原文 |
| 工件归属规则（同一路径上单一写入者 + 下游阶段写输入工件）| §2.6 | 解 `proposal.md` 双写风险 |
| 内置流程降级细节（openspec CLI / rddf CLI 缺失 / skill 调用失败）| §2.6 | 增强层故障不阻塞交付 |
| 新增 `scripts/rdd-skills.sh`（探测 + `--json`）| §6 | 探测顺序对齐 rdd-workflow `resolve_rdd_skill_dir` |
| verifier 产出契约的 `rdd-verifier` 分流条件 3 增补脚本判定路径 | §2.6 | 与增强层判定口径一致 |
| 角色矩阵自查清单增 2 项（探测 / 单一写入者）| §2.6 | 防止"装了 workflow 就乱调 skill" |
| 协作审计：统一 verifier 判定口径（以 skill frontmatter 为权威）| §2.6 | 消除「分流三条件」与增强层前置条件两套标准 |
| 协作审计：planner/builder 角色列表标注 `proposal.md` 归属 | §2.6 | 角色权限与工件归属规则不再自相矛盾 |
| 协作审计：补 `deps` / `execute` 的完整前置条件 | §2.6 | 映射表此前缺 2 个 skill 的可判定条件 |
| 协作审计：新增 pause / commit 契约（HARD pause 优先、commit 全局确认优先、`rdd-quick` 不自行进入）| §2.6 | `rdd-builder` P2 COMMIT GATE 与全局"不主动 commit"直接冲突 |
| 协作审计：可用性以 `skill` 工具为准，脚本仅作预筛 | §2.6 | 脚本 skill 名单是上游镜像，会漏判新增 skill |
| 协作审计：`design.md` 实际归属（`rdd-builder` P1 只生成 `tasks.md`）| §2.6 | owns 声明与 `phase1_plan.sh` 实现不一致 |
| `role-init.sh` 增 `.gitignore` 提示 | §6 | `role.json` 是个人状态，rdd-workflow 的 gitignore 守卫只覆盖 `openspec/` |
| 明确 `design.md` 定稿责任：`plan` agent 产出为草稿，`builder` 角色定稿 | §2.6 | 权限保持不动（方案 a），只消除"谁定稿"的模糊 |

### 8.1.5 v2.0 已完成（2026-11-04）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 新增「审查配对（每个角色由谁审）」节 | §2.7 | 4 行配对表 + 顺序约束 + 预算分层 + 不可用降级 |
| `architect` 审查改为 **oracle 先行 + critic 后审** | §2.7 | oracle 审「会怎么坏」，critic 审「是否越界 / 冲突」；顺序颠倒会白烧一轮预算 |
| `planner` 审查固化为 **metis**（新建或重写 ≥1/3 才触发）| §2.7 | 纯状态推进不审，避免噪音 |
| `builder` 审查固化为 **verifier（角色内建）+ critic（仅架构面）** | §2.7 | verifier 是角色不是 subagent → 不依赖 rdd-workflow |
| 审查预算按**文档粒度**分层（ADR 级 / improvement 级 / change 级）| §2.7 | 单条 change 审查上限 = critic 2 + verifier 3，不叠乘 |
| 审查者不可用**降级路径**（内置自检清单 + 结论首行注明）| §2.7 | 2026-11-04 实测 subagent 因 Token Plan 上限全部失败 |
| `build.md` 委派原则增加交叉引用（本节管「何时委派」，审查配对管「必须委派给谁」）| §2.7 | 两处规则此前互不知情 |
| `build.md` 自查清单增 2 项（固定审查者执行 / 不可用降级注明）| §2.7 | 防止「忘了审」与「静默跳过」 |
| 治理面改动（`prompts/**`、矩阵文档）归入 `architect` 产出，**必须过 oracle**（增删规则再加 critic `arch` 档）| §2.7 | 此前改矩阵本身不属于任何角色 → 零审查；上一轮 A1「verifier 两套判定标准」就是改错后返工的实例 |
| 治理面**降级自检清单** 6 条（不变式 / 权限 / 双判据 / 可判定 / 降级路径 / 预算冲突）| §2.7 | oracle 不可用时逐条自问，缺一条判未通过 |
| 治理面规则**首轮 oracle 审查**：8 条 finding（A1–A8）全部闭合 | §2.7 | 复审 `PASS-WITH-NOTES`；3 处一词级残留（§2.7 镜像摘要漂移）已按最小修法补齐 |
| 关键修正：治理面作用域补 `~/.config/opencode/` 前缀 + `AGENTS.md` / `docs/CHANGELOG.md` | §2.7 | 裸相对路径在项目 cwd 解析不到 → 规则永不触发；`AGENTS.md` 注入所有 agent 却此前不在作用域 |
| 关键修正：oracle 治理面审查须给 `PASS \| BLOCK \| PASS-WITH-NOTES` verdict + finding 逐条应答 | §2.7 | oracle 原生只有 4 节建议、无 pass/fail → 「调用过」会被误读成「通过」 |
| 关键修正：builder 撞到治理面缺陷 → findings + halted，不静默越权 / 不静默忽略 / 不死等 | §2.7 | 治理面归属 architect 但 builder 有仓库 edit 权限，原规则下 agent 只能二选一地犯错 |
| 关键修正：审查调用**一次失败即降级、不换模型重试**；「一次改动」= 一个 patch series 的文件集合 | §2.7 | 额度类失败是持续态，重试只烧预算；未定义计数单位会导致逐文件重复审查 |

### 8.1.6 v2.0.1 已完成（2026-11-04）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 架构文档范围节改为**判定三态**（配置存在且路径存在 → `arch_paths` / 配置缺失·空·损坏 → fallback 目录集 / 都不存在 → 只讨论不落文档）| §2.5 / §2.3 | 原规则「缺失或 `arch_paths` 为空 → 先跑 `/arch-docs-init` 再继续」在**没有架构文档目录的项目里死循环**：脚本扫不到目录就写空 `arch_paths` 并 WARN，重跑不收敛 → `architect` 第一步即卡死 |
| `/arch-docs-init` 从**前置闸门**降为**可选工具**（第 2 态判定时最多跑一次 `--dry-run`）| §2.5 | 只有用户想建立/更新目录结构时才跑（首次梳理 / 结构变更后 `--refresh`），不再因配置缺失而反复调用 |
| 消除 `build.md` 内部两套判定标准 | §2.5 / §2.3 | §2.3 档位映射已有 fallback 目录口径，§架构文档范围 此前没有 → 同一文件对「配置缺失」给出两种处置；本轮统一到同一套目录口径（§档位选择 的 `arch` 档路径集 = **权威映射**，critic 侧路径推断仅兜底）|
| 治理面**首轮 oracle 审查**：4 条 finding（F1–F4）全部闭合 | §2.5 | verdict `PASS-WITH-NOTES`，无 BLOCKER；F1 顶层架构目录漏判 → 目录集扩为 fallback ∪ `survey()` 目录；F2 配置路径全失效 → 态 1 加存在性校验；F3 `--check` 的 `MISSING`/`EMPTY` 误示为漂移 → 规则侧注明；F4 措辞 → 出口条件放宽 |
| 治理面**首轮 critic 审查 REJECT**：1 条 BLOCKER 闭合 | §2.5 / §2.7 | 态 3「只讨论不落文档」与治理面归属冲突 → 本仓（`~/.config/opencode`，无 ADR 目录）出现「**无角色可写 `prompts/**`**」：architect 按态 3 拒写，builder 按 §2.7 halted → 修法：§架构文档范围 加「管辖边界」（**治理面文件 `~/.config/opencode/**` 不受项目级 `arch_paths` 管辖**）+ 角色列表 architect 行补治理面编辑权 |
| critic SHOULD_FIX / NITS 闭合（口径统一 + 措辞补齐）| §2.5 / §2.3 | 可写范围拓宽到 `survey()` 目录后「什么算 arch 产物」仍是第二套判据 → §档位选择 的 `arch` 行扩为同一套目录集 + 明写「本表是权威映射」；`MULTI-AGENT-DESIGN.md` 路径映射同步；出口条件与触发时机补「JSON 损坏 / 路径全部失效」 |

### 8.1.7 v2.0.2 已完成（2026-11-04）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 治理面作用域表新增 `commands/**`（slash command = agent 行为指令，与 prompt 同级）与**被治理面规则行为依赖**的 `scripts/**`（改其退出码 / 报错文案 / 落盘行为时）| §2.7 | 此前两者都不在作用域表 → 改 agent 行为指令、改被引用脚本的退出码**都不触发审查**；触发条件收紧为「行为依赖」以排除历史记述性提及 |
| `scripts/arch-docs-init.sh` `--check`：**漂移只在配置已声明 `arch_paths`（判定三态 第 1 态）时成立**；配置缺失 / `arch_paths` 为空 / 配置损坏时只输出 `NOTE`、exit 0 | §2.5 | 旧语义把「未配置 / 空」判为漂移（exit 2）并输出「运行 /arch-docs-init 生成」→ agent 见它就回头跑 init → **半死循环残留**。10 场景夹具实跑全 PASS（`/tmp/opencode/p0/test-check3.sh`，含 init 产物往返自检）|
| `commands/arch-docs-init.md` 用法与报告要求同步（`NOTE` 的 4 种情形；报告要求 3 限定「仅当配置已声明 `arch_paths`」；要求 4「不要据此反复跑 init 或 `--refresh`」）| §2.5 | 消除「#3 跑 --refresh」与「#4 不要跑 init」互相冲突的下一步指令 → 无用户意图写盘 |
| `commands/role-init.md` 提示改为「按判定三态确定可写范围（不阻塞），需要固定时再跑 init（可选）」| §2.5 | 原提示「先运行 /arch-docs-init」与「可选工具、非闸门」冲突 |
| `prompts/critic.md` arch 档兜底目录集改引用 build 侧权威映射 + build 档补 `tools/**` + 锚点改指 §架构文档范围 | §2.3 | 消除「build 权威 / critic 兜底」两套目录口径 |
| `prompts/context-builder.md` 路径映射 arch 行同步为同一套目录集口径 | §2.3 | 第三套旧 5 目录口径收尾 |
| `docs/MULTI-AGENT-DESIGN.md` 头部状态 v1.9 → v2.0.2 + 本版变更行；§2.7 治理面作用域同步（谓词改「行为依赖」）| 头部 / §2.7 | MD 头部停在 v1.9、§2.7 作用域列表落后于 build.md |
| 治理面审查（v2.0.2 批）：oracle `PASS-WITH-NOTES`（7 finding 全闭）→ critic 首轮 `REJECT`（BLOCKER：文档承诺「exit 0」在**盘上有架构目录**时为假）→ 脚本侧收敛为「漂移仅态 1 成立」→ 复审 `APPROVE` | §2.7 | **自指审查**（本批含 `prompts/critic.md`、`prompts/context-builder.md`、§2.7 本身）→ 结论**不构成独立证据**；复审记 1 条 NIT 入 backlog（态 1 / 态 2 在「声明路径全部失效」场景下的名义差异，两者动作一致均为 `--refresh`）|

### 8.1.8 v2.0.3 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `scripts/arch-docs-init.sh` `load_arch_paths()` 重写：逐字符扫描、引号外的 `]` 即数组结束符、字符串转义反转义 | §2.5 | 旧实现按正则抓所有引号串、不知道数组在哪结束 → 手写**单行** JSON 会把 `]` 之后的键名/值当路径 → **假 STALE** → exit 2 → agent 被误导去 `--refresh`（而 `--refresh` 会覆盖配置、丢掉该条目）|
| `scripts/arch-docs-init.sh` 新增 `arch_paths_state()` 状态机（`ok` / `empty` / `corrupt` / `missing`），`--check` 三态各有专属 NOTE | §2.5 | 「多行空数组」原被误判「损坏」；「含 `arch_paths` 字段但数组截断」原被并入「为空」（不提示修复）→ 现按数组是否闭合区分 |
| `prompts/build.md` 态 1 补「部分路径失效仍属本态」；字段说明补键顺序约束；`--refresh` 补「先 `--dry-run` 比对会丢弃的条目」护栏 | §2.5 | 收掉上一批 critic 的 NIT（态 1 / 态 2 名义差异）与「`--refresh` 静默覆盖手写配置」隐患 |
| 新增 `tests/verify_arch_docs_scope.sh`（验证夹具，35 条断言）| §2.5 | 项目形状**直接复用 rdd-workflow-e2e 测试床的真实 fixture**（`setup_fake_project` / `write_arch_fixture` / `write_proposal_fixture`）→ 验证对象与 arch→planner→builder 工作流里的真实布局一致；断言脚本行为（exit code + 输出）+ 规则文本一致性 |
| 治理面审查（v2.0.3 批）：oracle `PASS-WITH-NOTES`（7 finding）→ critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 2 SHOULD_FIX）| §2.7 | **非自指批次**（不改 `prompts/critic.md`、§2.7 治理面作用域表）→ 结论**可作独立证据**；oracle 的 7 条 finding 全部处置；critic 的 2 条 SHOULD_FIX（截断 JSON 误标「为空」、「`--refresh` 无护栏」）**在审查后按建议修复**（按预算规则未再开复审轮，以夹具 35/35 + e2e 48/48 为证据）|

### 8.1.9 v2.1.0 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` architect 产出形态契约新增**「一次成稿流程」聚合块**（4 步：定位 / 成形 / 送审 / 收口，每步给判据落点）| §2.5 | architect 写一份 ADR 所需的判据此前散在 build.md 的 11 处、跨约 380 行 → 聚合块作**单点入口**，自查清单与降级自检改为只引用它（消除复述漂移点）|
| `build.md` 新增**「ADR 完成的标志」**（5 条：四要素齐 / oracle+critic 双审且报过 BLOCKER 须 1 次复审确认闭合 / `Status` 转已决 / 关联 change 已落库**或已登记**为 `backlog: <improvement 名>` / 审稿报告由 architect 誊写落 `.rddf/reviews/<adr>.md` 且被元数据引用）| §2.5 | 此前只有「形态清单」没有「什么算写完、审完谁改 Status、change 何时填」；**关联 change 允许暂态** → architect 不越权建 change、不永远停在 Draft |
| `build.md` 新增**「arch 档审稿判据摘要」**（BLOCKER 四类 + SHOULD_FIX 六类），并注明「以 `prompts/critic.md` 为准，本摘要是随取随用的索引」| §2.5 / §2.3 | 调 critic 时据此**选 2–3 条最相关重点**填 `focus`（不罗列全量）；oracle 不可用时据此逐条自检（不必再翻 critic.md）|
| `build.md`「对齐已有样板」补**无样板时的默认骨架**（元数据 → 背景与问题 → 决策 → 选项对比表 → 后果 / 代价 → Verification（可勾选验收判据））| §2.5 | 原先只让人向「ADR-091 / ADR-089 这类六段骨架」收敛，但既没给六段是哪六段、项目里也常无样板 |
| `build.md` 四要素：元数据加 **AC 映射**（change 未立项时允许暂缺、以 `backlog: <名>` 占位）、章节名统一为 **Verification（可勾选验收判据）**；verifier 产出契约的判据来源补第 4 项 | §2.5 / §2.6 | 消除「Verification 一词双义」与「ADR↔change 的 AC 断链」——verifier 现在能直接消费 ADR 的判据 |
| `build.md` §审查配对 architect 行：「产出去向」补齐 Decision 段 / 选项对比表；预算补「**BLOCKER → 允许 1 次复审**（只验闭合）」；§自查清单与 §降级自检改为引用聚合块 | §2.7 | finding 落点不再只限两章；复审轮次与治理面行同构（此前 architect 行漏写，完成标志因此永不可满足）|
| `docs/MULTI-AGENT-DESIGN.md` §2.5 同步 3 条要点 + 头部 v2.1.0；`tests/verify_arch_docs_scope.sh` 补 7 条断言（含 4 条**防漂移断言**：内联摘要条目数 == `critic.md` arch 档原始条数）| §2.5 | 摘要与 `critic.md` 是两份文本 → 用夹具锁住条数，防漂移 |
| 治理面审查（v2.1.0 批）：oracle `BLOCK`（1 BLOCKER + 2 SHOULD_FIX + 3 NITS）→ 全部处置 → critic 复审 `APPROVE`（BLOCKER 已闭合、无新 BLOCKER、1 SHOULD_FIX）| §2.7 | **自指审查**（本批改动的正是 §审查配对 表格行 / §自查清单 / §降级路径）→ 结论**不构成独立证据**；critic 复审的 1 条 SHOULD_FIX（AC 映射强制性与 backlog 暂态的字面顶牛）**在审查后按建议补一句消除**（未再开复审轮，证据：夹具 43/43 + e2e 48/48）|

### 8.1.10 v2.1.1 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` 角色列表表后新增「**固定审查者不受『允许』列限制**」：逐角色枚举（architect: oracle → critic / planner: metis / builder: verifier 为角色内建 / 另有治理面行与架构面行 —— 以 §审查配对 为准，枚举非全集），`no-role` 按本表禁止列**不得调写类 subagent**（只读调研类仍可用）| §2.7 | **修 G1 硬矛盾**：architect 的允许列未列 `critic`，而 §2.7 要求 oracle → critic 双审 → 角色表（权限上限）与配对表（流程下限）互相限制。取**通用不变量**而非逐行补词（逐行补词只治一个角色，且诱导「没列 = 不能调」）|
| `build.md` §委派原则新增「**调研委派协议（explore / librarian）**」：材料不触发审查 / 必须委托 / 不必委托 / 一次一问（给清范围 + 期望输出）/ 权限不扩权（planner 走自读或 metis，verifier 走自读）/ 场景表指向 MD §3.2 且执行口径以本节为准 | §2.3 | **修 G2 协议缺口**：调研型此前只有任务类型映射 + 两条软约束，没有「何时必须/不必委托 / 一次一问 / 权限不扩权」，而审查型（oracle/critic/metis）有完整协议 —— 完备度差一个量级 |
| `build.md` `:37` 的 explore 映射加「**简单定位除外**」指针 | §2.3 | 消除 build.md 内部新旧口径冲突（旧 bullet 是无条件映射，新协议是有条件豁免，同节无优先级声明）|
| `docs/MULTI-AGENT-DESIGN.md` §3.1 注 + §3.2 指针 + 头部 v2.1.1 | §3 | §3.1 是 **agent 级**委派矩阵，与 build.md 的**角色列表表**不是同一张表 → 头部注与正文注统一主语并限定「本节 agent 矩阵的 ❌ 不在豁免范围」 |
| `tests/verify_arch_docs_scope.sh` 补 2 条 needle + 3 条**角色表结构完整性**断言 | §2.5 | 「表被插入内容劈开」这条断言在编写过程中**真的抓到一次**我造成的表格断裂（clause 插在 `no-role` 与 `general` 行之间）→ 修复后复跑通过；结构断言已固化，可防同类事故 |
| 治理面审查（v2.1.1 批）：oracle `PASS-WITH-NOTES`（2 SHOULD_FIX + 4 NITS）→ 全部处置 → critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 2 SHOULD_FIX）| §2.7 | **部分自指**（新增条款涉及角色权限表与 §审查配对 的关系）→ 结论**不构成独立证据**；oracle S1（内部口径冲突）/S2（no-role 与禁止列矛盾）/S3（「等 subagent」可被读成类型）/S6（协议对 planner/verifier 空转）已修；critic 的 2 条 SHOULD_FIX（verifier 无 metis 权限却由 :54 旁授 / MD 头部注主语错位）已修 |

### 8.1.11 v2.2.0 已完成（2026-11-05）

| 改动 | 章节 | 备注 |
|---|---|---|
| `build.md` §角色切换新增「**实施阶段的新发现**」子节：5 行分类表（计划对实现漏 / `plan_drift` / `design_drift` / `blocked` / `noted`）× 判据 · 停下义务 · 增强层落点 · 无 rdd-workflow 落点 · 路由 | §2.2 | 补**真空 A**：实施阶段没有「新发现」分类法 —— `implementation_gap`/`proposal_drift` 只服务**验收**阶段，builder 实施中发现设计错误 / 计划漏项 / 新需求时归哪类、回给谁、要不要停，原先无规定 |
| 分类**复用 rdd-workflow 既有 kind**（`needs-revision` / `ac-fail` / `blocked` / `noted`），不新造 | §2.2 | 产品侧已有完整 backward 通道：`rddf feedback add`（single writer ADR-0037）+ loop guard + 双读通道；治理面只补「用哪个 kind / 落到哪 / 停下义务 / 路由 / 顺序 / 窗口触发条件」|
| 配套规则：先落记录→再切角色 / 停下粒度（量化阈值 + **无 task 清单时停整个 change**）/ 不得手写反馈文件 / 双重保险 / **预算共享**（revision_count 上限 3 → 同类 findings 合并提交）/ 跨层优先级（覆盖 skill advisory 续跑）/ 两类漂移并发 design_drift 优先 | §2.2 | 「先落记录」的理由是：切换会丢原上下文，而 feedback 通道正是 planner/architect 的读入口，先写才有交接凭据 |
| `build.md` §授权窗口新增 `builder → planner`（plan_drift）、`builder → architect`（design_drift）两条触发条件；统一「每一次窗口内的**角色间**自动切换都计入 `used += 1`」（→ no-role 不计入，窗口随即清空）；示例处加注「须用户把 `planner`/`architect` 写进 `roles`」 | §2.2 | 补**真空 B**：实施中最该自动化的两条**不在**窗口触发清单里 → 即使用户开了含这两个角色的窗口，也因「无明确触发条件」只能停下问用户 |
| `build.md` 角色列表 `builder` 行：「变更决策需切 `architect`」补成处置（findings + 停下 + 交用户 / 窗口内切 architect） | §2.2 | 与 §治理面缺陷条（findings + halted）同型，消除「只写禁令、不写停下义务」的名义不一致 |
| **读入口对齐产品源码**：`design_drift` 落 improvement 文件的 `## Feedback` 段，architect 经 `rddf feedback list <proposal>` 读 —— 明示**勿依赖 `.planner-feedback.json` 提升链** | §2.2 | oracle 查证：`route_feedback` **无生产调用方**；`rddf arch feedback` 读 `severity`/`status`/`proposal` 而 appender 不产出 → 真进了该文件会 KeyError → 原括注会让 architect 看不到 drift 内容、交接断裂 |
| `docs/MULTI-AGENT-DESIGN.md` §3.2.0 回环指针 + 头部 v2.2.0；`tests/verify_arch_docs_scope.sh` 补 3 条 needle + **kind 防漂移断言**（真读产品 `VALID_KINDS` 做**全集差集**，新 kind 会立刻报错）| §3 | 产品改 kind 集合时治理面同步告警，杜绝「自造分类」 |
| 治理面审查（v2.2.0 批）：oracle `PASS-WITH-NOTES`（3 SHOULD_FIX + 3 NITS）→ 全部处置 → critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 2 SHOULD_FIX + 3 NITS）| §2.7 | **自指审查**（本批改动的正是角色切换 / 授权窗口契约）→ 结论**不构成独立证据**；oracle F1（`.planner-feedback.json` 提升链未接线，括注错误）/F2（命令缺 `--from` 与位置参数）/F3（无 task 清单时停下不可判定）已修；critic 的 2 条 SHOULD_FIX（跨层优先级未覆盖「落点/读通道」冲突 / discovery 与验收重试共享 revision 预算无节流指引）与 3 条 NITS **在审查后按建议修补**（未再开复审轮，证据：夹具 52/52 + e2e 48/48）|
| `docs/rdd-workflow-product-issues.md`（**新增**）：把 v2.2.0 实施期核查中发现的 4 处产品缺陷整理成可直接提交上游的 issue 文本 | §3 | A：`route_feedback` 无生产调用方（提升链未接线）/ B：`rddf arch feedback` 对 appender 条目 KeyError / C：planner-feedback 重算静默丢 open 条目 / D：`skills/rdd-builder/SKILL.md` 落点描述与实现不符 —— 均附源码行号、复现步骤与建议修法 |
| `build.md` §角色列表权限修订（**v2.2.1**）：`planner` 补 `explore` / `librarian`（+「先自读」默认序 +「架构取舍停下请用户切 architect」的护栏）、`verifier` **只补** `explore`、`no-role` 允许列显式列出只读调研；§调研委派协议「权限不扩权」条目改为中性表述 | §2.2 | 补角色**只读调研**能力缺口（此前 planner/verifier 只能自读）；边界不变式保持（禁止列逐字未动，扩权只在「读」侧）。**同时取代 8.1.11 台账里「权限不扩权（planner 走自读或 metis，verifier 走自读）」的表述** —— 该 carve-out 已随本批删除 |
| `tests/verify_arch_docs_scope.sh`：内联摘要 ↔ `critic.md` 判据的**语义级**防漂移守卫（10/10 对应表）+ 「已废止 carve-out 措辞零命中」防回流断言 | §2.5 | 前者把防漂移从**条数**升级到**语义对应**（critic.md 改判据措辞 → 断言失败，要求同步对应表；负向测试确认会咬：改摘要一个词即 FAIL + exit 1）；后者防「planner/verifier 走自读」旧措辞回流成第二套判据 |
| `docs/MULTI-AGENT-DESIGN.md` 新增 **§2.8 角色切换与授权窗口**（角色轴投影）：三轴区分 / 角色一览 / `role.json` 状态文件 / 切换策略 / 授权窗口（四条件 + 6 条触发条件 + 关闭窗口 + 审计写入）/ 实施阶段新发现回环 | §2.8 | 补**结构性缺口**：MD 自称「当前态单写」，但**角色轴（persona）整条机制此前只存在于 `prompts/build.md`**（MD 有 agent 轴 §2/§3、有 tool 权限轴 §4，唯独缺角色轴）。投影**不改任何规则语义**，并声明执行权威在 build.md |
| `docs/MULTI-AGENT-DESIGN.md` §7.1 验证状态加 1 行 | §7.1 | 如实标注：机制为 prompt 级软约束，**未在真实 session 做运行时验证**（与 §7.2 口径一致）|
| `tests/verify_arch_docs_scope.sh` 加 9 条 MD 投影护栏 | §2.8 | 5 条锚点存在性 + 触发条件表**行数**（防漏行类漂移）+ 关闭窗口 / 审计写入 / auto 标记 / architect 治理面编辑权 —— critic 指出「needle 只锁存在性、锁不住漏行」后补强 |
| 治理面审查（MD §2.8 批）：**oracle 不可用**（原因：`opencode.jsonc.opencode-go` 中 oracle/metis 切到 `kimi-code/kimi-for-coding`，该模型无 `high` 变体 → subagent 调用失败）→ 降级为 critic 审查 + 治理面降级自检清单 6 条自检 | §2.7 | critic 判 `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 3 SHOULD_FIX + 2 NIT）：3 条 SHOULD_FIX 均为**投影漏项**（漏「关闭窗口」、把权威源的 4 条条件写成「三条件」、architect 行漏治理面编辑权）→ 已修；NIT（`general` 同名消歧 / CHANGELOG 版本断链）→ 已修。**本次为单审查者 + 自检，非双审**，结论不构成独立证据 |

**本批遗留（记入 backlog / 待上报）**

- **待上报 rdd-workflow 产品仓**（不在本仓范围）：`route_feedback` 无生产调用方 → `.planner-feedback.json` 提升链实际不通；`rddf arch feedback` 对 appender 产出的条目会 KeyError（字段不匹配）；planner-feedback 重算会丢弃未 resolved 的 open 条目；`skills/rdd-builder/SKILL.md` 的落点描述（「add 写入 .planner-feedback.json」/「Architect reads via `rddf arch feedback`」）与实现不符。治理面的警示注释依赖这些事实，产品侧修掉后注释需同步更新。
- discovery 记录与验收重试共用 `revision_count`（默认 3）—— 两类消费同一预算，本仓无法分离；已在规则里写明「同类 findings 合并成一条提交」。
- 无 `tasks.md` 的路径（rdd-quick / 本地）一律按停整个 change 处理，粒度偏粗（保守方向）。

**本批遗留（记入 backlog）**

- `planner`（角色）与 `plan`（agent）同名近形：协议锚在「见 §角色列表」且有「执行口径以本节为准」兜底，暂不冲突；若 plan agent 的角色表将来扩行，需在协议里写明「planner 角色（非 plan agent）」消歧。
- `no-role` 的「只读调研类 subagent 仍可用」依赖「禁止列反推允许」的读法（no-role 允许列未列任何 subagent）——行为合理，但若将来给 no-role 行补「调 `explore` / `librarian`（只读）」可从根上消歧。

**本批遗留（记入 backlog）**

- 内联判据摘要与 `prompts/critic.md` 仍是两份文本 —— 夹具只锁住「条数」，不锁「每条语义」；critic.md 改判据时需同步摘要。
- 「一次成稿流程」的 4 步是**入口收敛**，不消除 build.md 内部其余章节（角色列表 / 增强层 / 权限模型）的跨段引用成本。
- 「ADR 完成的标志」第 4 条的 `backlog: <improvement 名>` 登记位目前**无落盘位置约定**（未指定写在哪），暂由 architect 在响应正文声明。

**本批遗留（记入 backlog，不在 v2.0.3 处理）**

- 夹具的规则断言是**文本存在性**校验（非语义校验）——若规则被改写但保留锚点短语，needle 仍会过；语义正确性主要由行为断言组承载。
- `prompts/build.md` 字段说明里的键顺序约束构成「合法 JSON ∧ 生成器形状」的第二重 conformance（手写配置违约面变大）。
- 夹具组④与 e2e 床 fixture 内容耦合（床新增架构目录时需同步扩展，已加显式假设断言 + fallback 降级告警）。
- awk 对 `\n` / `\t` 等控制字符转义保留双字符（路径含字面 `
` 时仍是假路径，已注释声明为降级行为）。

### 8.1.12 运行环境修复：kimi-code provider（2026-11-05，v2.2.3）

| 改动 | 章节 | 备注 |
|---|---|---|
| `opencode.jsonc.opencode-go`：`providers["kimi-code"].package` 由 `@ai-sdk/openai-compatible`（V1 老名）改为 **`@opencode/ai/providers/openai-compatible`**（V2 官方名） | §5.1 | V2 文档列的是后者；二进制内两名并存（V2 名 7 处 / 旧名 4 处），故属**迁移**而非「修复不存在的东西」 |
| `providers["kimi-code"].models["kimi-for-coding"]` 补 `variants`：`none→reasoning_effort:off` / `low` / `high` / `max`；`models["k3-256k"]` 补 `low` / `high` / `max` | §5.1 | 真正病因：oracle 声明了 `"variant": "high"`，而该模型的 variant 集为空（配置覆盖了目录条目且未声明 `variants`）→ `Variant unavailable for kimi-code/kimi-for-coding: high`。`metis`/`critic` 未声明 variant 所以不受影响 |
| 实测确定字段名：`reasoning_effort`（字符串）被解析，`effort` / `reasoning` 被忽略，`thinking` 被 400 拒绝 | §5.1 | 用**类型违规探针**判定（传数字/对象 → 若字段被解析必 400），而非按文档措辞猜测；Kimi 文档模型表写 `reasoning_effort`、映射段写「传入 `effort`」两者矛盾，以实测为准 |
| 验证：JSONC 合法 → `opencode models` 即时反映 variants → 实跑 `kimi-for-coding#none/low/high/max` + `k3-256k#high` 全部正常 → 工具调用（read）正常 → 负向探针（`reasoning_effort: 123`）触发上游 400 | §7.1 | 负向探针是**决定性证据**：证明 `variants[].body` 真的合并进请求体，而不只是「没报错」 |
| `agent.oracle.variant` 由 `max` → `high`（**用户暂存改动**，随本批一并落地，非本批作者所做） | §2.1 | 补记以免 `git log` 考古断链；该改动只影响 oracle 的思考档位，不影响可用性（`high` 为 Kimi 文档推荐档） |
| MD 头部「下游/真源」两处 `opencode.jsonc.openstarry` → `opencode.jsonc.opencode-go`（符号链接实际指向；openstarry 文件已不存在） | 头部 / §2.1 | oracle 审查发现：读者按 MD 找真源会扑空，§11 校验流程锚错文件 |
| `docs/MULTI-AGENT-DESIGN.md` §5.1 变更注记 + §7.1 两行验证状态 + 头部 → v2.2.3 | §5.1 / §7.1 | 纯投影，不改规则语义 |
| 治理面审查（kimi-code provider 批）：oracle `PASS-WITH-NOTES`（4 条 NIT/none-blocking）→ critic `APPROVE_WITH_CONDITIONS`（0 BLOCKER / 1 SHOULD_FIX + 3 NITS） | §2.7 | oracle 从**二进制源码**证伪了「agent 不声明 variant 时默认取 variants 首项」的风险（`r===undefined` → 原样返回，无首项逻辑）→ `metis`/`critic` 行为与本批前逐字节一致；并确认换包名是**真实代码路径切换**（V2 名命中内建包表，走原生 route 实现），非 no-op。处置：SHOULD_FIX（§11 校验流程仍指 `opencode.jsonc.openstarry`）→ 已连同 §6 文件树 / §4.4 **6 处**一并修正；NIT（§5.1 注记把 `k3-256k` 写成含 `none`）→ 已修。**本批即双审链恢复的证据**：oracle 全程 `variant: high` 正常工作 |

**本批遗留（记入 backlog）**

- `docs/MULTI-AGENT-DESIGN.md` §11「修改后必做」与 §6 文件树、§4.4 的真源指向此前仍写 `opencode.jsonc.openstarry`（该文件已不存在）—— **本批已一并改为 `opencode.jsonc.opencode-go`**（残留的历史 v1.8 注记保留原文，它们描述的是当时的事实）。
- `opencode-go` / `openstarry` / `minimax-cn` 仍用 V1 包名（`@ai-sdk/*`）。旧名**实测仍可用**（`opencode-go/deepseek-v4.1-flash` 实跑通过），故未一并迁移：`minimax-cn` 是 build/plan/critic 的载体，改错会中断当前会话；`openstarry` 当前无 agent 使用。建议单独一批迁移 + 逐 provider 实跑。
- `docs/MULTI-AGENT-DESIGN.md` §2.1 / §5.1 / §5.2 / §5.3 的**模型归属**已与当前配置不符（例：表中 explore / critic 仍写 `minimax-cn`，实际为 `opencode/deepseek-v4.1-flash-free` / `kimi-code/kimi-for-coding`；oracle / metis 表写 `k3-256k`，实际已切 `kimi-for-coding`）—— 漂移源自用户尚未提交的模型切换，非本批引入；待该改动定稿后一次性重算这几张表。**闭合触发（v2.2.4 补）**：工作区内模型相关未提交改动（`agents.*.model` / `providers.*.models` / `apiKey` 引用）全部提交或明确放弃后，整批重算；在此之前每批治理面改动可引用本条目递延，但递延不得超过一个批次，否则 §11 的 MUST 同步义务在事实上失效。

### 8.1.13 运行环境修复：oracle model 引用（2026-11-06，v2.2.4）

| 改动 | 章节 | 备注 |
|---|---|---|
| `opencode.jsonc.opencode-go`：`agents.oracle.model` 由工作区未提交值 `CommandCode/deepseek-v4.1-flash` 改为 **`commandcode/deepseek/deepseek-v4.1-flash`** | §2.1 | provider id 大小写敏感（实际为小写 `commandcode`）+ model 路径缺 `deepseek/` 一层，启动即 `ModelUnavailableError`；该引用形态是 `providerID/modelPath`（modelPath 自身可含 `/`，如 `deepseek/deepseek-v4.1-flash`），`variant: "max"` 与目录 `effort: low/high/max` 一致，未改 |
| 验证：`opencode models` 含该引用 → oracle subagent 实测启动并返回 4 节格式 | §7.1 | 修复前错误原文：`SessionRunnerModel.ModelUnavailableError: Model unavailable: CommandCode/deepseek-v4.1-flash` |
| 治理面审查：oracle `PASS-WITH-NOTES`（0 BLOCKER；F2「文档同步义务」报为未闭合）→ critic `APPROVE`（0 BLOCKER / 2 SHOULD_FIX / 2 NITS，`mergeable: yes`） | §2.7 | F2 处置：MD 四张表的重算并入 §8.1.12 已登记的「用户挂起模型切换批次」，本批不逐表手改，仅在此留痕 |
| 附带收益（未改配置） | §5.2 | oracle（`commandcode/deepseek`）与 critic（`kimi-code/kimi-for-coding`）自此跨厂商，审查盲区不再重合。写进留痕，避免日后以「统一模型省事」为由回退到同厂 |

**本批遗留（记入 backlog，不在本批处理）**

- `commandcode` provider **无本地 `providers` 块**（32 个模型全部来自 models.dev 目录 + 本机 credential store，凭据环境变量 `CMD_API_KEY`），§5.1 provider 池表未登记该 provider。并入模型切换批次补齐。
- oracle 的 `agent.*.model` 变更后 §2.1 / §5.1（含 provider 池表）/ §5.2 / §5.3 **未同步**（§11「修改后必做」的 MUST 条款）。已明确合并至 §8.1.12 遗留条目所述批次，不单独重算。
- 未做 oracle 的「召回校准」（F1）：`deepseek-v4.1-flash` 是否胜任第一顺位审查者，需用 §8.1.12 的已知 finding 当 ground truth 比对召回率；本批只修可用性，不验证能力。

---

## 演进日志

| 日期 | 版本 | 变更 | 原因 |
|---|---|---|---|
| 2026-11-06 | v2.4 | 新增 `model-fallback` 插件（`session.retry` 钩子 + `switchModel`）实现 build 模型降级链；同步订正 MD 的 9 处 model 漂移并补 §5.4 | 用户要求"模型不可用自动切到 `commandcode/deepseek/deepseek-v4.1-flash`"。调研确认 v2.2.5 **无**原生 fallback：schema 的 `agent.model` 是单值、插件无请求错误钩子；`SessionRetry` 钩子（error/attempt/decision）与 `SessionDomain.switchModel` 是唯一可用原语，故需自研插件。探针发现 `session.synthetic` 通知会额外触发一轮模型调用并重置降级状态，改为日志 + 原生模型指示器 |
| 2026-11-05 | v2.2.3 | 运行环境修复：`kimi-code` provider 迁 V2 包名 `@opencode/ai/providers/openai-compatible`；`kimi-for-coding` / `k3-256k` 补 `variants`（`reasoning_effort` 映射） | oracle 因 `Variant unavailable for kimi-code/kimi-for-coding: high` **持续不可用**，整条 oracle→critic 双审链断掉（上一批只能降级为单审查者）。根因是配置**覆盖**了目录条目却没声明 `variants` → variant 集为空；同一批把 V1 包名迁到 V2 官方名。字段名靠类型违规探针实测确定，不靠文档措辞（文档自相矛盾） |
| 2026-11-05 | v2.2.2 | MD 新增 §2.8「角色切换与授权窗口」：补**角色轴（persona）在设计文档里的结构性缺口** —— 此前该机制只存在于 `prompts/build.md`，MD 有 agent 轴、有 tool 权限轴，唯独缺「角色是谁 / 怎么切 / 窗口怎么授权」这一轴；新增三轴区分表以免跨轴误读 | MD 自称「当前态单写」设计参考，却缺了角色切换/授权窗口整节 → 读者按 MD 理解会以为「授权只能等用完」、也会以为 architect 可写范围仅限 `arch_paths` 命中目录（漏了治理面文件编辑权） |
| 2026-11-05 | v2.2.0 | 新增「实施阶段的新发现」：builder 实施中发现的计划层 / 决策层问题**停下并路由**（`plan_drift` → planner / `design_drift` → architect / `blocked` → 交用户 / `noted` → 仅记录），kind 复用 rdd-workflow 既有词表；授权窗口新增 `builder → planner` / `builder → architect` 触发条件 | 两处规则真空：**A** 实施阶段没有「新发现」分类法 —— `implementation_gap`/`proposal_drift` 只服务验收阶段，实施中撞上设计错误/计划漏项时归哪类、回给谁、要不要停，原先无规定；**B** 窗口内自动切换清单只有 `builder→verifier` 等四条，实施中最该自动化的 `builder→architect`/`builder→planner` 不在其中 → 即使用户开了窗口也只能停下问用户。调研发现产品侧已有完整 backward feedback 通道（`rddf feedback add` + 5 种 kind + loop guard + 双读通道），故本批**不新造分类**，只补治理面的映射、停下义务、顺序（先落记录再切角色）与窗口触发条件 |
| 2026-11-05 | v2.1.1 | 角色列表「固定审查者不受允许列限制」（修 architect 调不了自己 critic 的硬矛盾）+ 新增「调研委派协议」（explore/librarian 的必须/不必委托、一次一问、权限不扩权、材料不触发审查）+ 角色表结构完整性断言 | 分析发现两个缺口：**G1** architect 允许列未列 `critic` 而 §2.7 要求 oracle → critic 双审 → 权限表（上限）与配对表（下限）互相限制；**G2** 调研型 subagent 只有任务类型映射、无「何时必须/不必委托 / 一次一问 / 权限不扩权」，与审查型（oracle/critic/metis）的协议完备度差一个量级 → 现实里表现为「什么都先 explore 一遍」与「本该 explore 却自己 grep 十几轮」|
| 2026-11-05 | v2.1.0 | architect 产出形态契约重构：新增**一次成稿流程**聚合块（4 步单点入口）+「ADR 完成的标志」（完成闭环）+ **arch 档审稿判据摘要内联** + 无样板默认骨架 + Verification 统一命名与 AC 映射接入 verifier | 此前 architect 的判据散在 11 处、跨约 380 行，每回合跨段拼接；只有「形态清单」没有「什么算写完」（Status 谁改、change 何时填、审稿报告谁写都没规定）；调 critic 时 build 不知道 arch 档查什么（critic 是被动审稿人），oracle 不可用时「四要素逐条」是形态不是判据；样板引用（ADR-091/089）在项目无样板时不可得；「Verification」一词双义且 ADR↔change 的 AC 断链 → verifier 消费不到 |
| 2026-11-05 | v2.0.3 | `arch-docs-init` 的 `arch_paths` 解析器重写（数组边界识别 + 反转义）+ 状态机（ok/empty/corrupt/missing）+ 判定三态措辞收敛 + 新增基于 rdd-workflow-e2e 真实 fixture 的验证夹具 | v2.0.1/v2.0.2 把 `arch-docs-init` 降为可选工具后，解析器仍按正则抓引号串、不知道数组在哪结束 → 手写单行 JSON 产生**假 STALE** → agent 被误导跑 `--refresh`（会覆盖配置、丢掉手写条目）；「多行空数组」与「截断 JSON」被误判为「损坏/为空」，与规则的「损坏时提示修复」不同源。验证载体此前只有临时夹具，现固化为 `tests/verify_arch_docs_scope.sh`（35 条断言，项目形状取自 rdd-workflow-e2e 真实 fixture）|
| 2026-11-04 | v2.0.2 | 治理面作用域补 `commands/**` 与被规则**行为依赖**的 `scripts/**`；`arch-docs-init --check` 的漂移判定收紧为「仅态 1」；目录集口径在 build / critic / context-builder 三处统一 | v2.0.1 把 `/arch-docs-init` 降为可选工具后配套面没跟上：`--check` 仍把「未配置 / 空」判为漂移并指示跑 init（半死循环残留）；`role-init` 仍把 init 当前置；`critic` / `context-builder` 仍是旧 5 目录口径；`commands/**` 与 `scripts/**` 不在治理面作用域表 → 这些改动都不触发审查 |
| 2026-11-04 | v2.0.1 | 修复 `architect`「配置缺失 → 反复 `/arch-docs-init`」死循环 + 统一 fallback 判定 + 补治理面管辖豁免 | `arch-docs-init.sh` 在项目没有架构文档目录时写出空 `arch_paths` 并 WARN、重跑不收敛；而 `build.md` §架构文档范围 要求「缺失/为空就先跑 `/arch-docs-init` 再继续」→ 无 ADR 目录的项目里 `architect` 第一步即死循环。另：`build.md` 内部对「配置缺失」存在两套处置（§档位选择 有 fallback 目录口径，§架构文档范围 没有）。审查：oracle `PASS-WITH-NOTES`（4 finding 全闭）→ critic 首轮 `REJECT`（BLOCKER：态 3 挡住治理面文件 → 本仓「无角色可写 `prompts/**`」）→ 修复后复审 `APPROVE_WITH_CONDITIONS`（BLOCKER 已闭合，无新 BLOCKER）|
| 2026-11-04 | v2.0 | 新增「审查配对」（角色 → 审查者）+ 审查预算分层 + 审查者不可用降级 | 角色矩阵此前只有「什么时候委派 subagent」的触发规则，没有「哪个角色必须委派给谁」的固定配对 → 产出物可以不经任何审查就落地。实测：手上 3 个 openspec change 在 planner 阶段未过 metis 深度审查，到 critic 第 1 轮才暴露 3 处**事实性错误**（ADR 引用引反 / 目录深度写错 / 连字符模块路径 SyntaxError）。另：`architect` 原先只写「用 critic `arch` 档审稿」，漏了 oracle 的「会怎么坏」这一层，等于只审一致性不审方案本身 |
| 2026-11-03 | v1.9 | 角色矩阵与 rdd-workflow 解耦（自足内核 + 可选增强层）+ `scripts/rdd-skills.sh` | 调研发现两套角色模型零耦合：agent 角色不读 workflow 状态、workflow 不读 agent 角色；`proposal.md` 存在双写风险（agent planner 可写 / rdd-planner not_owns / rdd-builder owns）；且 `rddf guide` 的阶段检测仍认 v3 handoff 文件名，不能作为阶段真值 |
| 2026-10-13 | v1.0 | 初始设计 | 从 0 个 agent 演进到 7 个 agent |
| 2026-10-13 | v1.1 | 权限加固 4 项 + 路径修正 1 项 + slash command 1 项 | oracle 后审发现 3 类真问题（bash 无界 / MCP 写工具无界 / 描述-权限矛盾）+ plan 写入路径不一致 |
| 2026-10-15 | v1.2 | 新增 critic subagent + 权限最严化 + build.md 触发规则 | oh-my-openagent 调研发现"build 之后无审稿环节"是质量门禁缺失；critic 用 k3-256k 长上下文扫 PR diff；4 段式输出强制对抗立场 |
| 2026-10-21 | v1.4 | 模型元数据补全 + librarian 换低成本模型 + title agent + 提示词交叉修复 | 配置层三处硬伤（温度参数对不支持的模型、context limit 低报 4-8 倍、`capabilities` 缺失）；提示词层角色矩阵放错位置（AGENTS.md 注入所有 agent，与 subagent 固定小节输出冲突）；subagent 缺「被拒即终止」纪律；`small_model` 已 deprecated |
| 2026-10-21 | v1.3 | OpenCode v2.1.2 schema 迁移 + context-builder + XML→Markdown 输出 + 权限加固 | v2 的 MCP 权限 action 名改为 `<server>_<tool>`，v1 嵌套写法整体失效；顶层 `subagent_depth` 被静默丢弃；`.env` 保护被 agent 的 `read: allow` 覆盖；只读白名单里的 `awk`/`env`/`printenv`/`jq` 构成越权 |
