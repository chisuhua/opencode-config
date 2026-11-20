# tasks — plan-multi-session-collaboration

> 纪律：**每块先写测试（红）→ 再实现（绿）→ 跑该块测试**。勾选即「该任务完成且有测试证据」。
> 顺序：A0 → A → B → C → D → E → F → G → H → I。A 与 B 可并行；C 是 D 前置；E 独立。

## 块 A0 — 数据契约（`lib/plan-topics.ts` 类型 + schema 校验）

- [x] A0.1 红：schema 六类负向（缺 `version` / `nodes` 非数组 / `status` 非枚举 / `progress` 非枚举 / `deliverables` 非数组 / `deps` 非数组）⇒ 抛 `PlanTopicError` / CLI `exit 3`
- [x] A0.2 绿：`parseGraph()` + `assertSchema()`
- [x] A0.3 验：`bun test tests/plan-topics.test.ts` 该 describe 绿

## 块 A — 派生 / 门控 / fork-join 判据

- [x] A1 红：node id 字符集 + 黑名单（`.lock` / `.env` / `.bak` / `backup*`）+ 拒 `..` / 绝对路径 / `/` / 空 / `.`
- [x] A2 绿：`assertValidNodeId()`
- [x] A3 红：重复 node id 检测；`owner` 取值域
- [x] A4 绿：`assertUniqueNodeIds()`
- [x] A5 红：DAG 自环 / 二元环 / 三元环 / 悬空 dep / deps 内重复
- [x] A6 绿：`assertAcyclic()` + `assertDepsExist()`
- [x] A7 红：`progress` 派生（0 checkbox ⇒ `todo`；全勾 ∧ 非空 RESULT ⇒ `complete`；剥离 fenced code / HTML 注释 / 仅标题）
- [x] A8 绿：`deriveProgress()` + `isNonEmptyResult()`
- [x] A9 红：`status` 门控（complete ∧ deps 全 done ∧ deliverables 存在且非空 ⇒ done；否则 blocked_by_deps / pending）
- [x] A10 绿：`deriveStatus()`
- [x] A11 红：缓存一致性（`cache_mismatch` 双向）
- [x] A12 绿：`assertCacheConsistent()`
- [x] A13 红：`brief_sha256` 台账（`brief_tampered`）
- [x] A14 绿：`assertBriefIntegrity()`
- [x] A15 红：孤儿双向（`orphan_node_dir` / `missing_brief`）+ 不可派发
- [x] A16 绿：`assertNoOrphanNodes()` + `assertDispatchable()`
- [x] A17 红：空 topic（`empty_topic`，`--allow-empty` 放行）
- [x] A18 绿：`checkTopic()` 汇总
- [x] A19 验：块 A 全绿

## 块 B — CLI（`scripts/plan-topic-check.ts`）

- [x] B1 红：退出码四值（0/1/2/3）；2/3 时 stdout 不含违规列表
- [x] B2 红：`--json` 可解析且 `violations[].code` 属闭集
- [x] B3 绿：`check` 子命令
- [x] B4 红：`scope-check --baseline`（`mkdtemp` + `git init` fixture 仓；git 失败非零；`-z` 解析）
- [x] B5 绿：`scope-check` 子命令
- [x] B6 红：只读保证（跑前后 `git status --porcelain` 逐字相同）
- [x] B7 红：`lock` 只读报告（存在性 / owner / 绑定一致性）
- [x] B8 绿：`lock` 子命令
- [x] B9 验：块 B 全绿

## 块 C — 配置（`opencode.jsonc.opencode-go`）

- [x] C1 红：`plan-worker` 形态断言（`capabilityBlock()` 渲染比对；六 action deny；shell 首键 deny + 三段式；白名单无 `bun`/`node`）
- [x] C2 绿：加 `plan-worker` 条目
- [x] C3 红：`GUARDED_AGENTS` 含 `plan-worker` + `agent-guard-gen.ts --check` 绿
- [x] C4 绿：改 `agent-guard-rules.ts` + `--write` + `--check`
- [x] C5 红：可派者集合（显式 allow == {build,plan}；无键闭集 == ["title"]；plan-worker 自身 deny；front 引用既有断言）
- [x] C6 绿：实现断言
- [x] C7 红：`EXPECTED.prompts` 含 `plan-worker.md`；`EXPECTED.lib` 含 `plan-topics.ts`
- [x] C8 绿：两清单加条目
- [x] C9 红：`plan` 的 `edit` 含两条新项；首键 `"*"`；新项 `indexOf > 0`；`plan-worker` 不含 `.rddf/plans/` / `.rddf/state/`
- [x] C10 绿：改 `plan` 的 `edit` + 同步 `prompts/plan.md` 的 `capability:plan` 块（同时跑 AC7 + AC8）
- [x] C11 验：块 C 全绿

## 块 D — prompt

- [x] D1 写：`prompts/plan-worker.md`（首行含 `plan-worker`；职责 / 禁令 / 只回指针 / 压缩先读盘）
- [x] D2 写：`prompts/plan.md` 多会话协作段（topic / 单一写者 / schema / progress·status / precheck / 锁获取释放 / 续接 vs 重建）
- [x] D3 验：既有口径 diff 为空（`.rddf/plans/`、`plan_ref`、delegate 五项）

## 块 E — `.gitignore` + node id 反向守卫

- [x] E1 红：`plan-sessions.json` 被 ignore；`graph.json` / 合法 node 的 `RESULT.md` 不被 ignore；黑名单 id 被 ignore
- [x] E2 绿：`.gitignore` 加 `.rddf/state/plan-sessions.json`
- [x] E3 验：块 E 全绿

## 块 F — 上游语义锚点

- [x] F1 写：7 条锚点（只写语义 + 文件 + ERE，不写行号）
- [x] F2 验：`bash scripts/check-upstream-anchors.sh | grep -q "RESULT: OK"` 且自报 `N ≥ 23`

## 块 G — 文档投影

- [x] G1 `docs/MULTI-AGENT-DESIGN.md`（`plan-worker` 卡片 + 文件树 + 通道）
- [x] G2 `AGENTS.md`（agent 列举）
- [x] G3 `docs/SUBAGENT-ORCHESTRATION.md`（plan 侧离线协作通道）
- [x] G4 `docs/CHANGELOG.md`（一条 + V15 基线 23 注记）

## 块 H — 回归 + ADR 回填 + 归档前置

- [x] H1 `bun test tests/` 0 fail + anchors `RESULT: OK`
- [x] H2 既有口径零回归（`git diff` 复核 + delegate/front 断言绿）
- [x] H3 ADR 回填：关联 change / AC 映射 / 实施记录（注明 V15 基线 23（+6 ⇒ 29）+ 补 2 条不可机判项）
- [x] H4 审稿报告补「实施后核验」段
- [ ] H5 归档前置机械件（verifier verdict == pass + e2e 记录存在）

## 块 I — 人工 e2e（主会话执行）

- [ ] I1 `opencode debug agents` 列出 `plan-worker` / `mode=subagent`；plan 工具清单含 `subagent`
- [ ] I2 九探针（六正向 + 三负向）留证 → `.rddf/reviews/plan-multi-session-collaboration-e2e.md`
- [ ] I3 两 plan 会话抢锁 + 全 done 后释放
