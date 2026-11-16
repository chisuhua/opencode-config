# Tasks — oracle-intent-gate-e2e

> 判据真源：`proposal.md` 的「## 验收标准」（AC1–AC8）。
> 决策取舍：`design.md`（D1 门禁只钉 V2 / D2 探针先行 / D3 两态差分 / D4 判定行形态 /
> D5 fixture 形状 / D6 拆 3 PR / D7 skip 三档 / D8 变红演练方向 / D9 采样与清理 / D10 台账回写）。
> ⚠ **实施落在 `rdd-workflow-e2e` 仓**（本仓只留 change 文档）。
> ⚠ **顺序不可反**：PR-1 → PR-2 → PR-3（D6）—— E-A 最贵且判别力被高估，**不许**卡住 E-B。

> **状态（2026-11-16）**：**PR-1 + PR-2 已落**（e2e 仓 `3e992e0` → `3e1cd23`）。
> - **AC1 探针跑通**（换 provider 绕过 Token Plan 上限）⇒ **载体 = A**；output 包在 `<subagent …>` 里
>   ⇒ 必须 unwrap + **多行匹配**。
> - **AC5 E-B 实测：两态都有判定行 ⇒ 不可分辨**。⚠ 结论**已降级**：态② 的产物本身含「背景与问题」+
>   范围声明 ⇒ 意图可从产物推断 ⇒ 「意图未给」前提未真正成立；要真正区分需**不含意图线索**的审查对象
>   （follow-up）。附带观察：**判定行的位置契约**同样只有软约束（态① 落在正文第 2 行）。
> - **下一步 = PR-3（E-A）**：需 architect 角色 fixture + 明确审查请求（AC2/AC3/AC4）+ AC7-② 演练。

## 前置确认（动手前）

- [x] **0.1** 读 e2e 仓 `docs/runtime-assertion-discipline.md` 三条纪律 + `tests/integration/test_subagent_contract_runtime.bats` 的门控写法（`E2E_REAL_RUNTIME` / `sc_preflight` / skip 纪律）
- [x] **0.2** 读 `test_independent_build_session.bats` 的 fixture 写法（`role.json` 预置 / 独立 HOME / `IB_ROOT`）
- [x] **0.3** **通道选定：不验证 `--agent oracle` 直跑，改走父会话 wrapper**（`opencode run --agent build` + `subagent` 工具调 `agent=oracle`）—— oracle 是 `mode: "subagent"`，直跑可行性未验证；wrapper 与 E-A 同一条父侧通道 ⇒ 少一个变量。代价：E-B 多带一个「父模型转述」变量（已登记报告已知边界）
- [x] **0.4** e2e 仓 `.rddf/reviews/` **存在**；但 `.rddf/` 被 **gitignore** ⇒ 报告不进版本库（沿 v2.36 先例：摘要回写本仓 CHANGELOG / change 文档）
- [x] **0.5** 本仓层 1 静态守卫全绿（`bun test tests/` → 591 pass / 0 fail）

---

## Task 1（PR-1）：探针 + 门控骨架 + 报告模板（AC1 / AC6 / AC8）

- [x] **Step 1:** 建 `tests/integration/test_oracle_intent_gate.bats`：独立 HOME/DB、`setup()`/`teardown()`、**默认 skip**（门控未开 ⇒ `skip` 并给出原因）；`teardown` 调 `sc_kill_sc_processes`（D9）
- [x] **Step 2:** 默认态确认：**零模型 2 pass + 运行时 1 skip**、exit 0（零模型用例**不**进门控，per-case `oig_require_runtime`）
- [x] **Step 3:** 写 **AC1 探针**：一次最小真跑（`agent=oracle`），打印 `part.state.output` 的**长度 + 首 200 字符**
- [x] **Step 4:** **载体 = A**（`state.output`，探针实测 194 字符）；⚠ 实测发现 output 包在 `<subagent …>` 里 ⇒ 必须 unwrap + **多行匹配**判定行（A `state.output` / B `.rddf/reviews/<adr>.md`）并写进报告（D2）；**禁止**不跑探针就假设 A 可用
- [x] **Step 5:** 写**门控骨架**：`provider.rate-limit` / `status != completed` / `error` 非空 ⇒ `skip`（D7 三档）
- [x] **Step 6:** 写**报告模板**（AC8 固定 9 列：`用例｜模型 id｜日期｜请求指纹｜尝试次数｜全部调用序号｜结论｜证据路径｜SC_SRC 路径 + HEAD`）
- [x] **Step 7:** 默认态验证通过；探针**最终跑通**（换 provider 绕过额度：`OIG_MODEL=commandcode/deepseek/deepseek-v4.1-flash`）⇒ `status=completed` / `output_len=194` / **载体 A**

## Task 2（PR-2）：E-B 两态差分（AC5）—— **判别力最强且最便宜，先做**

- [x] **Step 1:** 手工写**一份**完整审查输入（带意图：决策 + 理由 + 范围，**用叙述不用槽位名** —— D5）
- [x] **Step 2:** 跑态①（带意图）⇒ 记录输出里**有无** `^判定: (APPROVE|REJECT)`
- [x] **Step 3:** 由 **harness** 删掉意图段得到态②（不是让模型删）⇒ 跑态② ⇒ 记录有无判定行
- [x] **Step 4:** 观察「**两态可分辨**」（① 有 ② 无）；**不可分辨 ⇒ 记为「软约束被违反 / 失效」并如实登记，不 fail**（AC5）
- [x] **Step 5:** 两次调用原始片段 + `SC_SRC` HEAD 落报告（D9）

## Task 3（PR-3）：E-A smoke + 变红演练（AC2 / AC3 / AC4 / AC7）

- [ ] **Step 1:** 建 fixture（D5 全表）：`docs/adr/` + 预置 1 份既有 ADR、`role.json`（`role-v2` 全集 / `current_role: architect`）、请求指向 `docs/adr/draft-*.md`、**意图以叙述嵌入且无歧义**
- [ ] **Step 2:** 跑一次真会话（`--standalone --agent build --session <id> --format json`）⇒ 落 NDJSON
- [ ] **Step 3:** **AC3 前提**：解析 NDJSON 确认 ≥1 次 `agent=oracle` 的 `tool_use`；**未发生 ⇒ skip 并标注「父模型未调 oracle，未判定」**；另登记 `agent=metis` 是否出现（D5）
- [ ] **Step 4:** **AC2 门禁**：取**最后一次** `agent=oracle` 调用 ⇒ 按 Step 3 探针定下的载体断言 `^判定: (APPROVE|REJECT)`；**不接受** `治理面判定:`（D4）；`status != completed` / `error` 非空 ⇒ skip（D7）
- [ ] **Step 5:** **AC4 观察**：把 `input.prompt` **原文**逐字落报告 + 标注「含 / 不含真源派生的组成词」（**不判红**）
- [ ] **Step 6:** **AC7 变红演练 ①**：`SC_SRC` 指向删掉**判定行词表**的副本 ⇒ **AC2 必须红**；恢复后复绿（**零模型**）
- [ ] **Step 7:** **AC7 变红演练 ②**：`SC_SRC` 指向删掉**意图前提段**的副本 ⇒ 期望 **AC5 两态不可分辨**（**不是** AC2 红）；两次演练的实际结果都落报告（D8）

## Task 4：收口（AC8 定稿 + 台账回写）

- [ ] **Step 1:** 观察报告定稿：逐格填 9 列；**如实登记**通过 / 跳过（含理由）/ 暴露的真实缺陷（真实缺陷 ⇒ **另立 change**，不在本 change 修实现）
- [ ] **Step 2:** 回写 `docs/review-automation-backlog.md` P2-4：状态列 + **E-A/E-B 的定义**（D10 —— 否则两份文档并存时读错）
- [ ] **Step 3:** 本仓 `bun test tests/` 复跑（层 1 不被拖累）
- [ ] **Step 4:** `openspec validate oracle-intent-gate-e2e --strict` 复跑

---

## 验收对照（哪个 Task 闭合哪条 AC）

| AC | 闭合于 |
|---|---|
| AC1 探针 | Task 1 Step 3–4 |
| AC2 E-A 门禁 | Task 3 Step 4 |
| AC3 E-A 前提 | Task 3 Step 3 |
| AC4 E-A 观察 | Task 3 Step 5 |
| AC5 E-B 两态差分 | Task 2 Step 4 |
| AC6 skip 纪律 | Task 1 Step 5 |
| AC7 变红演练 ×2 | Task 3 Step 6–7 |
| AC8 报告表格化 | Task 1 Step 6 + Task 4 Step 1 |
