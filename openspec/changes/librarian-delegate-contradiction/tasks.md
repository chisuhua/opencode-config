# Tasks — librarian-delegate-contradiction（A1：机器层放开 librarian → explore 白名单）

> **判据真源**：`openspec/changes/librarian-delegate-contradiction/proposal.md` 的 `## 验收标准` 表（AC1–AC8）；
> 其正文真源 = `.rddf/improvements/librarian-delegate-contradiction.md` 的 `## Acceptance` 段。
> **执行纪律**：TDD 5 步 —— 守卫断言先写（红）→ 改配置（绿）→ 文档回填 → 全量回归。
> **审查**：改 `opencode.jsonc.*` + 守卫断言 + 治理面文档 ⇒ **oracle（`审查域: 治理面`）→ critic** 必审。

## 0. 前置核对

- [x] **T0** 确认符号链接形态：`opencode.jsonc` → `opencode.jsonc.opencode-go`（只改目标、不动 symlink）；确认守卫 `tests/config-guards.test.ts` 经 `readFileSync(<root>/opencode.jsonc)` 读 ⇒ 跟随链接 ⇒ 两侧同源。
- [x] **T0b** 记录基线：`bun test tests/` = **1133 pass / 1 skip / 1 fail**（唯一红项 `AC10④` 父篇 ADR commit 祖先判定；与本 change 无关 —— 本 change 不碰 `docs/adr/ADR-backend-handoff-role-class.md` 与 `lib/delegate-core.ts`）。
- [x] **T0c** 确认无其它活跃 change 触碰本 change 的四个文件（`openspec/changes/` 下除本 change 外：`subagent-contract-critic-reeval`，只读 `docs/CHANGELOG.md` 的历史条目）。
- [x] **T0d** **pin 普查**（决定新断言的落点）：扫 `.rddf/rollback/*.json` 的全部 `edits[].find` 对 `tests/config-guards.test.ts` 的覆盖 ⇒ **67 处**被逐字节 pin（其中 `plan-topics.json` 的 `edits[8]` = 5229 字符 = `plan 侧多会话协作` 整块）。⇒ 新断言只能落在未被 pin 的空隙（本 change 选第 287 行之后的 `front 的 subagent 门控顺序` describe 之后）。
  > **验收证据**：普查脚本逐条定位 `find` 在文件中的行区间；未被 pin 的空隙含 193–1433 行 ⇒ 落点安全（改后 `bun test tests/` 全量不新增失败）。

## T. 测试先行（红）

- [x] **T1（AC1/AC2/AC3）** `tests/config-guards.test.ts` 新增 **AC4b**：`librarian.permission.subagent` 必须是字典白名单；首键 `"*"` 且值为 `deny`；`explore` 为 `allow`；键集合闭集 == `["*", "explore"]`；且 `general` / `oracle` / `metis` / `critic` / `build` / `plan` / `context-builder` 均**不在**其中。
  > **验收证据**：先跑 `bun test tests/config-guards.test.ts` ⇒ AC4b **红**（当前 librarian 的 `subagent` 是字符串 `"deny"`），其余用例不变。
  > ⚠ **落点约束（不可并入 `plan 侧多会话协作` 那个 describe）**：该 describe 整块被 `.rddf/rollback/plan-topics.json` 的 `edits[8].find`（5229 字符）**逐字节 pin 住** ⇒ 块内任何字节改动 ⇒ `planDrill` 判 `find_count` 漂移 ⇒ `tests/rollback-manifests.test.ts` 红 ⇒ 要么改机制面清单（须同批重跑 plan-topics 的 rollback drill 并回填 `last_drill`），要么等 `rollback-manifest-find-narrowing`（backlog）解 pin。⇒ 新断言放**块外**的新 describe。
- [x] **T1b（AC4 等价覆盖）** 同块新增 **AC4c**：可派者**三桶分类**闭集 —— 字符串 `"allow"` == `{build, plan}`；字典白名单 == `{front, librarian}`；字符串受限（`"deny"` / `"ask"` …）== 其余 7 个；无 `subagent` 键 == `{title}`。
  > **验收证据**：AC4c 绿（实测）；把配置改回 `"subagent": "deny"` ⇒ AC4b + AC4c **同时红**（判别力自证，已恢复配置）。
- [x] **T2（AC4）** ⚠ **偏差**：improvement 要求「把 AC4 断言文案改成『**字符串** `"allow"`』」—— **本条未按字面落地**。原 AC4 断言（`if (perm.subagent === "allow")` + 文案「显式 subagent:allow 的 agent 集合只能有 build / plan」）**位于被整块 pin 的 describe 内** ⇒ 改它即触发上述 `find_count` 漂移（机制面成本换零行为变化）。
  > **处置**：① 语义目标（librarian 不计入可派者集合）由 **T1b 的 AC4c** 显式钉住（比原写法多钉一桶）；② 偏差已登记在 `proposal.md` 的 AC4 行 + oracle 审稿记录；③ 待 `rollback-manifest-find-narrowing`（backlog）解 pin 后**一次性**把文案搬过去。
  > **验收证据**：`bun test tests/` 不新增失败；原 AC4 断言**仍然绿**（`librarian` 本就是字典 ⇒ `=== "allow"` 不收它 ⇒ 集合仍 == `{build, plan}`）⇒ 语义未退化。

## I. 实现（绿）

- [x] **I1（AC1）** `opencode.jsonc.opencode-go`：`agent.librarian.permission.subagent` 由 `"deny"` 改为字典 `{ "*": "deny", "explore": "allow" }`（`"*"` 在**第一条**）。
  > **验收证据**：`grep -n -A3 '"librarian"' opencode.jsonc.opencode-go` 命中字典形态；`bun test tests/config-guards.test.ts` ⇒ AC4b **绿**。
- [x] **I2** 跑 T1–T2 ⇒ **全绿**（除基线红项外无新增失败）。

## D. 文档回填（真源 → 投影）

- [x] **D1（AC5）** `docs/SUBAGENT-ORCHESTRATION.md` §2.1 的 agent 级白名单那一行补 `librarian` 只放行 `explore`。
  > **验收证据**：`grep -n 'librarian' docs/SUBAGENT-ORCHESTRATION.md` ⇒ 同行命中 `librarian` 与 `explore`。
- [x] **D2（AC8）** `docs/MULTI-AGENT-DESIGN.md` §4.3 权限对比表：`task（subagent 委派）` 行的 `librarian` 列由 `allow` 改为「仅 explore」+ 新脚注（该表自述「运行时实测值」）。
  > **验收证据**：该行 grep 命中「仅 explore」。
- [x] **D3（AC8）** 同文件 §3.1 旁注（`:659`）引用 AC4 断言的措辞同步为「**字符串** `subagent: "allow"` 的集合」并指向 AC4b。
  > **验收证据**：该行含「字典」「AC4b」两个 token。
- [x] **D4（AC7）** §3.1 矩阵 `librarian → explore` 与 §2.3 `librarian` 卡片「**只能**委派 `explore`」**确认已一致**（A1 后成为真值 ⇒ 不改）。
  > **验收证据**：`grep -n 'librarian' docs/MULTI-AGENT-DESIGN.md` ⇒ 矩阵行 `✅✅（本地搜索）` 与卡片行「只能」均在。
- [x] **D5（遗留清扫）** 扫出并修掉另一处**失真投影**：`docs/MULTI-AGENT-DESIGN.md` §8.2 P1 第 2 条「当前 `librarian.permission.subagent = "allow"`」（旧 TODO 的「当前」陈述）⇒ 改为定案后的真值 + 作废旧取舍 + 留「运行时冒烟」为人工项。
  > **验收证据**：该条含 `{ "*": "deny", "explore": "allow" }` 与「定案」字样。

## V. 验证与审查

- [x] **V1（AC6）** `bun test tests/` 全量回归 ⇒ 不新增失败。
  > **验收证据**：见 `.rddf/reviews/librarian-delegate-contradiction-verify.md`（含前后两次统计对比）。
- [x] **V2** 治理面审查：oracle（`审查域: 治理面`）→ critic（`review_profile: build, arch`）⇒ BLOCKER 全闭。
  > **验收证据**：`.rddf/reviews/librarian-delegate-contradiction-review.md`。
- [x] **V3** 归档前自查：遗留清扫（TODO / 半截实现 / 临时日志 / 被 skip 的测试 / 未替换的 mock）—— 本 change 范围内无遗留；范围外历史遗留只记录不清理。
- [x] **V4** `docs/CHANGELOG.md` 一条（版本条目 + 审查结论 + 回滚口径）。
- [x] **V5** `.rddf/improvements/librarian-delegate-contradiction.md` 的状态行更新（关联 change 指针 ⇒ C5 不悬空）。

## 归档条件

- T1–T2 判别力自证通过（先红后绿）；
- I1–I2 落地，D1–D4 回填完成；
- V1–V5 全绿，AC1–AC8 逐条有证据；
- oracle → critic 审查记录落盘且 BLOCKER 全闭。
