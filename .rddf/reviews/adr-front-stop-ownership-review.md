# 审稿记录：ADR-front-stop-ownership

> 产出角色：architect。审稿者：oracle（失败模式分析）+ critic（2 轮）。
> 本文件由 architect 从审稿输出誊写（审查者只读）。

## 0. 结论

| 轮次 | 审查者 | 结论 | mergeable |
|---|---|---|---|
| oracle 1 轮 | oracle | 四方案失败模式分析（形态 A–D）；推翻「跨进程异步锁」，提出「代号条件化 + 前置复检 + 机器化 tripwire」 | — |
| critic 第 1 轮 | critic | **REJECT**（3 BLOCKER：B1 D12 矩阵冲突 / B2 重新采纳父篇已否决的 B4 未登记 / B3「只能 cancel 兜底」与实现矛盾）+ 7 SHOULD_FIX + 3 NITS | no |
| critic 第 2 轮（复审） | critic | **REJECT**（B2/B3 判定**闭合**；B1 判定**部分闭合** ⇒ 新 BLOCKER：改写新引入的 D12 矩阵**动作混写**）+ 8 SHOULD_FIX + 5 NITS | no |
| 第 2 轮后 | architect（自检闭合） | **按预算规则未开第 3 轮**（每 ADR ≤ 2 轮 critic；第 3 轮需用户批准）⇒ 第 2 轮唯一 BLOCKER（两处括号的动作混写）**逐字机械核对**后修正（见 §3），并逐条落实 8 SHOULD_FIX + 5 NITS | — |

## 1. critic 第 1 轮（REJECT）的 BLOCKER 与处置

| # | BLOCKER 原文要点 | 处置（写进 ADR） |
|---|---|---|
| **B1** | D1 的「状态前置条件」与父篇 **D12 矩阵**冲突（已删 × `dispatching` ⇒ 释放并置 `suspended`；已删 × `idle`/`suspended` ⇒ 墓碑）：按 D1 字面实施会让 `dispatching` 路径**死槽**；且文档同时说「D12 已修订」与「无需修订」⇒ 自相矛盾 | D1 增加**适用范围**：代号校验适用所有释放路径、**状态前置条件只适用「会话仍存在」**；已删路径按父篇 D12/V09 处置，**D12 矩阵无需修订**；D3 增行 ⑧ |
| **B2** | D2 的严格模式等价于父篇**已否决的 B4**，与父篇 `:267` / stop-confirmation Parent 行 / 选项表 B4 冲突，且**未登记** | Parent 行改为「**部分取代** stop-confirmation D1 条件③ 的分支结构（**仅多实例**）」；选项表新增 **C8**（B4 的条件性重新采纳 + 父篇否决理由为何在此被接受为代价）；**单实例口径不变** |
| **B3** | 「只能 cancel 兜底」与实现矛盾（`interrupted:false` ⇒ cancel 是**纯 no-op**）⇒ 多实例下「释放空闲后端」**没有直接动作**；原文把未决问题写成已决 | 代价章改写为真实形态：`cancel` 不是兜底；实际出口 ① 下一次 `dispatch` 的 reconcile 顺带释放（**保留** `suspended_at_message_id`）、② 后端在另一实例确实在跑 ⇒ 工作树被**正确**占住；D3 ③ 相应改述 |

第 1 轮 SHOULD_FIX 1–7 / NITS 的处置：写者全集 + 禁止整条替换（S12）｜`stop_judge` 词汇不扩展父篇枚举（S8/S9）｜tripwire 生命周期 + 假阳性代价（S11）｜reason 拆四类 + 文案不得声称被占用｜快照点写死｜释放与回填同一临界区（S4）｜证据表补 `interrupt` 行 + feature request 第 4 条｜Status 退 Draft、关联 change 标「待建」｜统一为**两个可见性轴**｜「释放 = 一次授权」限定为 `suspend`/`cancel`。

## 2. critic 第 2 轮（复审）的判定

| 首轮 BLOCKER | 第 2 轮判定 |
|---|---|
| B1 | **部分闭合**（原始两子问题已闭合；但改写新引入 D12 矩阵**动作混写** ⇒ 记为新 BLOCKER） |
| B2 | **闭合**（Parent/C8 登记完整；`stop_judge` 未扩展枚举、未谎报 `"wait"`、不可赎回理由已写） |
| B3 | **闭合**（错误表述已删；D3 ③ 与代价一致） |

**新 BLOCKER（第 2 轮）**：`:54`（D1 适用范围）与 `:168`（S7）把 D12 矩阵的**两个动作混写成一条按状态组的规则**（「`idle`/`suspended` ⇒ 置墓碑 + `outcome:"vanished"`」——这对 `suspend` 是**错的**，实现是幂等 no-op）⇒ 与父篇 V09 冲突、与 S7 自身的「与改动前完全一致」矛盾、且会被逐字抄进 AC ⇒ 属「与已签批 ADR 冲突」+「文档内自相矛盾」两型。

第 2 轮 SHOULD_FIX 1–8 / NITS 的处置：前端文案义务写进 D2 + **S14**｜Parent 行登记父篇 S7b 在严格模式下不成立｜reason 双来源词汇表 + **授权类优先**｜写者改为「原则 + bump 落点」｜判读后才知已删的优先级（**已删路径仍做代号校验**）｜禁令收窄为「不得丢弃 `claim_gen`」+ 登记附带变化（保留 D9 基线）｜tripwire 描述改正（同一实例多副本**会**被检出；真问题是假阳性）｜D3 增行 ⑩（多实例下空闲后端无直接释放动作）｜reconcile 文案（判活**确认为** false）｜`cancel` 引用改为实现位置｜`wait_no_op` 文案限定子情形｜`foreign_instance` 落行频率（每次触发一行）。

## 3. 第 2 轮 BLOCKER 的闭合证据（机械核对）

第 2 轮唯一 BLOCKER 是**两处括号里的动作混写**。处置：

- `:54`（D1 适用范围）改为**只指向父篇**：「已删后端按父篇 D12 矩阵 + `ADR-front-stop-confirmation` D3 处置（矩阵逐动作措辞见 `ADR-front-multi-backend` Verification **V09**「终止 / 暂停面」段；**本篇不改一个字**）」。
- `:168`（S7）改为「父篇 D12 矩阵各组（已删 × `dispatching`/`active`/`idle`/`suspended`/`tombstone`）的 `suspend`/`cancel` 处置**与改动前完全一致**（逐字比对父篇 V09「终止 / 暂停面」段）」——**删除任何自撰的动作描述**。
- 核验命令与结果：
  ```
  $ grep -n "D12\|已删" docs/adr/ADR-front-stop-ownership.md
  ⇒ 仅剩「指向父篇」的引用，无任何自撰的动作混写
  $ grep -n "终止 / 暂停面" docs/adr/ADR-front-multi-backend.md
  387: - **终止 / 暂停面**（按 D12 矩阵）：已删 X 且条目 `dispatching`/`active` ⇒ `suspend` 释放槽位并置 `suspended`、…
  ```
- 附带修正：D3 ⑧ 行由「D1 明确不约束该路径」改为「**动作不变**；D1 在该路径上**只叠加代号校验**，不改变动作」（与新写的适用范围一致）。

⚠️ **未做第 3 轮 critic**（预算规则：每 ADR ≤ 2 轮 critic，第 3 轮需用户明确批准）⇒ 若用户要求，可再开一轮**仅验闭合**的复审。

## 4. 遗留（不阻断，记入 backlog）

| # | 来源 | 内容 |
|---|---|---|
| 1 | critic 第 2 轮 | **前端文案**（`prompts/front.md` + `docs/front-delegate-usage.md`）在严格模式 / `wait_no_op` 下的措辞必须同步（已写进 ADR 的 D2 + Verification S14）⇒ 属 change 的任务项 |
| 2 | critic 第 2 轮 | 父篇 `ADR-front-stop-confirmation` Verification S7b 在严格模式下不成立 ⇒ 已在 Parent 行登记，**不回改父篇**（父篇为 Accepted，存量不追溯） |
| 3 | oracle | **`cancel` 的停机证据**（墓碑是否保留槽位 / `cancel` 是否复用停机判据）⇒ 另立 backlog：`backlog: cancel-stop-evidence`（本篇选项表 C7） |
| 4 | oracle | **跨实例根治**依赖上游：暴露 `time_suspended`、「准入 + 投递」原子原语、跨进程执行可见性、`interrupt` 跨实例语义 ⇒ 已写入 ADR 的「上游 feature request」4 条 |
| 5 | critic 第 1 轮 | tripwire 具体实现（uuid 生成、utimes 刷新粒度、TTL 粒度）、ledger 行字段、命令命名 ⇒ 实施期自定，critic 明确**不作为 finding** |

## 5. 实施期的三处**口径收窄**（builder 实作时发现，已回写 ADR 正文并在此登记）

| # | 收窄 | 理由 | 证据 |
|---|---|---|---|
| 1 | **tripwire 的存活判定 = 同 host 且 pid 存活**（原措辞含「mtime 在 TTL 内」） | TTL 会把「**活着但空闲**（60s 无工具调用）的实例」判成死 ⇒ **多实例被当成单实例** ⇒ 正是本篇要防的假停机方向。⇒ TTL/mtime 只作诊断 | metis「边界情况」条（TTL 假阴性方向错误）；实现见 `lib/delegate-core.ts` 的 `detectForeignInstances` |
| 2 | **已删路径不做代号校验**（原措辞「代号校验适用所有释放路径」） | 已删会话**不可能是活写者**；真正的占槽者必是**另一个 session id**（自己的条目）⇒ 校验**零保护**；加了反而会引入「拒绝释放 ⇒ 死槽」的新风险 ⇒ **死槽避免优先** | 实现：`lib/delegate-async.ts` 的 D12 分支逐字未动；`git diff` 佐证 |
| 3 | **严格模式复用父篇 `stop_judge:"degraded"`**（不新增枚举值） | 父篇 D4 已把 `stop_judge` 钉死为三值；新增第四值属对 Accepted ADR 的契约扩展 ⇒ 改用「**没有 execution 级证据**」的既有语义 + 独立布尔 `foreign_instance:true` 区分 | Parent 行已登记「父篇 S7b 在严格模式下不成立」 |

⚠️ 三处收窄均**收紧或等价**，未放宽任何「不释放」的保守侧；其中 #2 是**唯一**减少校验的收窄，其理由（零保护 + 死槽风险）已写进 ADR 正文。

## 6. 关联工件

- ADR：`docs/adr/ADR-front-stop-ownership.md`
- 实施 change：`openspec/changes/archive/2026-11-11-front-stop-ownership/`（AC1–AC18；AC1–AC14 ↔ S1–S14 同号）
- 验收报告：`.rddf/reviews/front-stop-ownership-verify.md`（PASS 18/18）
- 上游锚点：`scripts/check-upstream-anchors.sh`（17/17，对 `git archive v2.2.5` 导出目录）
