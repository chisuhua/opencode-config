# 审查记录：plan-topics 判据阶段化修订

> 作者：build（builder）｜日期：2026-11-24｜状态：**未提交**（oracle PASS-WITH-NOTES + critic APPROVE；SHOULD_FIX/NITS 见 §3）
> 范围：`lib/plan-topics.ts` + `scripts/plan-topic-check.ts` + 测试（`tests/plan-topics*.test.ts`、`tests/helpers/plan-topic-fixture.ts`、`tests/README.md`）

## 1. 改了什么

见 diff；一句话：把 `check` 从「一个不分阶段的终态校验器」改成「带阶段与严重度的两维口径」。

| 维度 | 旧 | 新 |
|---|---|---|
| 缓存分叉 | `cache_mismatch`（一律 exit 1） | `cache_ahead`（违规）/ `cache_behind`（info，不阻断） |
| 交付物 | 对所有节点无条件要求 | `final` 全量；`dispatch` 只对 `progress=complete` 的节点 |
| BRIEF | 对所有节点无条件要求 | `final` 全量；`dispatch` 只对 `deps 全 done` 的节点 |
| 默认口径 | 唯一口径 | `final`（保持枚举覆盖；退出码口径见下） |

## 2. oracle（审查域：治理面）

判定：**PASS-WITH-NOTES**。逐条处置：

| # | finding | 处置 |
|---|---|---|
| O1 | `scripts/plan-topic-check.ts` 头注仍写「0 = 全绿 / 1 = 有违规」，与实现矛盾 | 已改：0 = 无阻断项（info 不阻断），1 = 有阻断违规 |
| O2 | `CheckOptions` 注释自称「不静默改变调用方语义」，但退出码已变 | 已改：写明「枚举口径不变；退出码口径由 `INFO_CODES`/`isBlocking` 决定」 |
| O3 | `INFO_CODES` 注释把 `cache_behind` 一律定性为「正常滞后」，过强 | 已改：写明 behind ⊇ {良性滞后} ∪ {磁盘倒退}，代码不可区分；接受漏报的理由是磁盘权威 + 重派幂等 + final 全量兜底 |
| O4 | `prompts/plan.md:242,253-254` 的纪律随本变更失效，未列入 follow-up | **已登记**（见 §4 F1） |
| O5 | 预存在空洞：`deliverables: []` + 磁盘 complete ⇒ 两口径全绿但永不 done（`deriveStatus` 的 `length>0` + `missingDeliverables` 零迭代） | **已登记**（见 §4 F2），本批不修（属新判据） |
| O6（可选） | `--phase` 被全局解析，`ready`/`lock` 也接受该选项 | **不修**：参数解析器统一消费全局选项，`ready`/`lock` 不使用该值也无副作用；为单个选项加子命令白名单属过度设计 |

oracle 明确排除的替代方案（不再重开）：按进度序分向（status 非单调）、final 保留 behind 阻断（复现恒红）、用 heartbeat/precheck 区分良性滞后（无信号源）、dispatch 全量查交付物（复现恒红）。

## 3. critic（profile: build）

判定：**APPROVE** ｜ `mergeable: yes` ｜ `scope_exceeded: false` ｜ **无 BLOCKER**。

三条 focus 的核查结论（摘要）：

1. **漏报面**：分向只放行「磁盘倒退且缓存未声称完成」。因为解锁判据（`due` / `dispatchableNodes`）走**派生值**而非缓存，缓存滞后无法解锁任何下游 ⇒ 不是「坏状态被吞掉」，而是「节点按 D6 重建重新可派」。`cache_ahead` 两个方向仍阻断。
2. **dispatch 门控**：派生快照只算一次并同时喂给缓存判据与阶段门，消除同 run 内两次派生的自相矛盾；残留 TOCTOU 是既有固有问题，D7 独占使其出不了契约。未发现「上游未 done 却已可派下游」的路径。
3. **退出码变更**：与 `prompts/plan.md` / `docs/SUBAGENT-ORCHESTRATION.md:61` / 归档 design.md 的旧文本矛盾，但**已签批 ADR 未钉死严重度**（D2/V09 只钉「派生优先」），本改动是其更一致的实现 ⇒ 不构成「与 ADR 冲突且未走修订流程」；文档同步已登记（§4 F1），按规则不升格为 BLOCKER。

### SHOULD_FIX / NITS 处置

| # | 项 | 处置 |
|---|---|---|
| SF-1 | `checkTopic` 的 `due` 未排除「派生已 done」的节点 ⇒ dispatch 口径对**已完成**且缺 BRIEF 的节点也报 `missing_brief`（实测：done 节点无 BRIEF ⇒ dispatch exit 1）。对照 `dispatchableNodes` 有 `status !== "done"` 过滤 | **记录、不修**（按「只有 BLOCKER 触发返工」）。影响可忽略：该场景通常已同时被 `brief_tampered`（声明哈希时）或 `cache_ahead` 覆盖；随 F1 批一起改 |
| NIT-1 | CLI 头注 `0 = 无**阻断**项` 混入 markdown 加粗 | **不修**：该处在**源码注释**里，不进 usage 输出；usage 字符串无 `**` |
| NIT-2 | 默认 `final` ⇒ 在 F1 完成前 precheck 对目标场景仍恒红 | **已在 §4 F1 登记**，不重复处理；在此记录以免后续复审误判为回归 |

### critic 建议的验证（已执行）

```
两级 DAG 全图预声明、仅首层有 BRIEF
  check --phase dispatch → OK，exit 0
  check（final）         → exit 1（missing_brief ×1 / missing_deliverable ×2）

TODO.md 清空但 RESULT.md 与交付物俱在、缓存未声称完成
  check（final）         → [info] cache_behind [a1]: progress 缓存=partial 派生=todo
                           exit 0   ← 「磁盘倒退」漏报面按设计放行

ready <topic> --json     → {"ready":["a1"]}（与改动前一致）
```

## 4. follow-up 登记（下一批，不在本次范围）

| # | 项 | 证据 | 归属 |
|---|---|---|---|
| F1 | `prompts/plan.md` 的「多会话协作」段需同步：① `:242`「缓存与派生分叉 = 违规」→ 分向（ahead 违规 / behind info）；② `:253`「0 全绿」→「0 无阻断项」；③ `:254`「派发前 exit 0 才派」补一句 info 不阻断；④ precheck 凭据判别力恢复的前提是这一步同步 | `prompts/plan.md:242,253-254` | architect（治理面） |
| F2 | `deliverables: []` 静默卡死：progress complete 但永不 done ⇒ 下游永久 blocked，且 `check` 两口径全绿 | `lib/plan-topics.ts` 的 `deriveStatus`（`deliverables.length > 0`）与 `missingDeliverables`（空数组零迭代） | 下一批判据 |
| F3 | 无 `cancelled` 终态：取消节点只能伪造 done（cache_ahead）/ 保持 pending（下游永久 blocked）/ 删节点（dangling_dep） | `tests/plan-topics-dag.test.ts` C7 | 下一批（ADR 修订） |
| F4 | 无 in-flight 状态：`ready` 幂等，同一节点可被重复派发 | D1 / D2 | 下一批 |
| F5 | 无 converged 判据：要判收敛需父自行组合四个条件 | E1 | 下一批 |
| F6 | `heartbeat` 无读写面 ⇒ 挂死不可检 | ADR D5 字段，无实现 | 下一批 |
| F7 | `scope-check` 按 node 归因在并行下假阳性；baseline 用相对 ref 会漂移 | D5 / D6 | 下一批 |
| F8 | `ready` 不排除 `owner: "parent"` | B7 | 下一批 |

## 5. 证据

- `bun test tests/plan-topics.test.ts tests/plan-topics-dag.test.ts` ⇒ 73 pass / 0 fail
- `bun test tests/` ⇒ 1205 pass / 1 skip / 1 fail
- 唯一失败：`config-guards` 的「agent 模型清单：配置（真源）与两份文档一致」—— `opencode.jsonc.opencode-go` 的 `plan`/`front` 被 model-fallback 改为 `minimax-cn-openai`，`docs/MULTI-AGENT-DESIGN.md` 仍写 `minimax-cn`。**预存在、与本 diff 无关**（两文件都不在本轮 diff 内）；提交前需另行收敛。
- 真实 probe：`.rddf/plan-topics/e2e-probe` 在 `--phase dispatch` 下 exit 0（两条 `[info] cache_behind`），此前 exit 1。

## 6. 遗留清扫（本次范围）

| 检查项 | 结果 |
|---|---|
| 注释与实现矛盾 | 已清（O1/O2/O3 三处） |
| 临时调试输出 | 无 |
| 被 skip 的测试 | 无 |
| 未替换的 mock | 无（全部真文件 / 真 git fixture） |
| 死代码 | 无（`INFO_CODES` / `isBlocking` / `CheckPhase` 均有消费者） |
| 半截实现 | 无（`--phase` 两个口径均有测试） |
| SHOULD_FIX 遗留 | SF-1 已登记（本批不修，见 §3） |

范围外历史遗留（只记录、不清理）：`docs/MULTI-AGENT-DESIGN.md` 与 `opencode.jsonc.opencode-go` 的模型名漂移（见 §5）。
