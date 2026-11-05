# 审稿报告：ADR-front-agent-redesign

| 字段 | 值 |
|---|---|
| 被审对象 | `.rddf/state/adr-front-agent-redesign.md` |
| 档位 | `arch` |
| 日期 | 2026-11-05 |
| 审查者 | oracle（第 1 轮）→ critic（第 1 轮） |
| 结论 | oracle：3 高危 + 3 中危，全部并入 D2–D7；critic：`APPROVE_WITH_CONDITIONS`，`mergeable: yes`，0 BLOCKER |

## oracle 第 1 轮

### 高危

1. **D5 的 grants 重委托救不回 mid-task 阻断，且 `blocked_reason` 拿不到**。
   必然失败任务集：`git push`（hub-spoke）、`rm -rf` 清理（归档后）、读 `.env` 的诊断、跨第二仓库目录（`external_directory` ask）、MCP index/ingest。原因是 `session.permissions` 只在 `create` 时可写 → 救援只能建新 session → 已做工作丢、需全量重跑、可能撞上下一个 ask 类目。且 deny 发生在工程 session 内部，`outcome` 仍可能是 `succeeded`，插件无法区分"完成"与"因权限放弃"。另：工程 session 的 `question` 仍是 `allow`，被 deny 后转 `question` 同样挂死。
   → 已处置：D5 改为 **preflight grant**（`grants` 进 brief，委托前一次预批，随 create 进入 permissions）；`blocked_reason` 改为扫消息 part 的 permission-denied 标记而**不看 `outcome`**；`question` 明确进常量 deny 集；`acceptance` 加"命令必须可重入"约束。

2. **D4 的判据"任意参数下不产生文件变更"在 v2 matcher 上不成立**。
   绕过族：重定向（`sort a > b`）、`--opt=value` 后参数不可见（`git log --output=f`，issue #54393）、`find -fprint`、**零节点跳过整个权限检查**（裸 `> file`，issue #49948）。
   → 已处置：D4 改为三段式 + **尾部守卫 deny**（`* > *`、`* >> *`、`git * --output*`、`find * -fprint*`、`* -fprintf*`、`sort * -o*`、`tee *`），并明写"尽力而非完备边界"、零节点路径规则层无法拦截。主决策句同步降低主张（critic SHOULD_FIX 1）。

3. **D2 生命周期时序**：`wait` 返回 ≠ 新 run 结束，`get(outcome)` 是陈旧值（旧 `delegate.sh` 就死于这个判据）；`remove` 与 `resume_session` 互斥；`resume_session` 可被 front 幻觉劫持。
   → 已处置：D2 加第 2 步 baseline + 第 4 步新活动校验（无新活动 → `outcome:"unknown", still_running:true`）；默认不 `remove`（`remove` 为显式参数）；第 0 步查 pair 登记表并校验 `canonical_root`。

### 中危

4. **D6 写盘协议挡不住已知写入方组合**：插件、工程 session 的角色切换、`role-migrate-v2.sh` 三方写同一文件；atomic rename 只防撕裂读，不防丢失更新；`pair.json` 单槽 schema 与"一 front 对 N 工程 session"冲突。
   → 已处置：D6 引入 `.rddf/state/.role.lock`（flock）包住全部 RMW，**显式取代旧 ADR 决策 3 的无锁立场**（旧 ADR 已加 superseded 注记）；`pair.json` 升 `pair-v2`（按 engineering_session_id 的 map）；`setup()` 禁止写盘。

5. **D3 的 `scope` 没有工具层强制**：只写进 brief 文本等于建议，越界无需恶意（读到带指令的文件即可偏离）。
   → 已处置：`scope` 双落点——强制（翻译成 session 级 edit 规则，scope 内 allow、其余 edit deny）+ 检测（返回 `out_of_scope_files`）。

6. **D1/D7 流程性摘要与"工程 session 是状态 single writer"不一致**：磁盘快照滞后、写入非原子、多 session 不标注归属。
   → 已处置：D7 强制新鲜度标注；D4 的 Verification 增加对应判据。

### oracle 对选项对比表的翻案

- **跨会话代答权限请求**：认为否决定理（"权限绕道"）不成立——用户逐次明示不构成绕道，真实原因是**实现未验证成功**。已把该项从"否决"改为**条件性保留**，注明若未来 SDK 支持则作为 D5 救援路径的优先替代重新复审。

## critic 第 1 轮

结论 `APPROVE_WITH_CONDITIONS`，`mergeable: yes`，`scope_exceeded: false`，**0 BLOCKER**。

- 确认 D4 与主决策不构成伪决策（D4 已自认残余面）；真正的矛盾是主决策句未带限定 → SHOULD_FIX。
- 确认 D5 闭合（代价、更优替代、未验证缺口均有明示，且救援不依赖未验证项）。
- 确认 D6 单方面取代在流程上合法（旧 ADR 同为 Draft、同日同作者），缺的是被取代方留痕。
- 确认无回滚段但**不升格**：改动面为配置 + 单插件文件 + 已文档化的 schema 变更，回滚可由文档推导。

### SHOULD_FIX 处置

| # | finding | 处置 |
|---|---|---|
| 1 | 主决策句"权限层而非 prompt 强制"与 D4 限定立场强度不一致 | 已改为"以权限层为**主要**强制点（已知残余绕过面见 D4）" |
| 2 | 决策正文混入 "oracle 第 N 条根因" 过程 provenance | 已全部移除（grep `oracle` = 0），理由改为 standalone |
| 3 | 旧 ADR `adr-double-session-delegation.md` 决策 3 未留 superseded 痕迹，两份 ADR 对 role.json 写盘契约断言矛盾 | 已在旧 ADR 决策 3 处加 superseded 注记（指明被 D6 取代 + 列明继续有效的条目） |
| 4 | Verification 缺"跨写入方锁已双侧采纳"判据 | 已补第 13 条：只有一侧加锁时该判据必须判失败 |

### NITS（未处置，记录）

- 跨 session 代答"重新复审"的触发条件无登记载体 → 立项时挂 backlog。
- D8 三条属排障 runbook 而非有取舍的架构决策 → 签批后可外移到运维文档，决策正文只留"插件内禁 HTTP"。

## 遗留待验证（实施期，不阻塞签批）

1. `session.update` 能否改已建 session 的 `permissions`（决定 D5 救援能否原地补 grant，而非必然全量重跑）。
2. 工程 session 被 deny 后消息 part 中 permission-denied 标记的**确切结构**（`blocked_reason` 提取依据）。
3. 四个守卫用例在真实 matcher 下的拦截率（重定向 / `--output` / `-fprint` / 裸重定向）。
