# tasks — oracle-governance-scope-declaration

> 判据真源：`proposal.md` 的「## 验收标准」（AC1a–AC6）；取舍见 `design.md`（D1–D11）。
> 执行顺序即编号顺序；**先文本、再守卫、最后 e2e**（守卫要能抓到文本漂移）。

## Task 1：执行体侧（AC1a / D1 / D2 / D5 / D6）

- [x] **1.1** 改 `prompts/oracle.md` 的「判定行」小节：
  - 删除 `- 输入明示「治理面」，或判定对象属治理面 ⇒ …` **及**其下一行的指针（`治理面范围见…`）；
  - 新增**词表定义行（表格外，不转义）**：`治理面 = `治理面判定: PASS | BLOCK | PASS-WITH-NOTES`；其他审查 = `判定: APPROVE | REJECT``；
  - 新增**四层优先级表**（右列只写词表名，不含 `|`）；
  - 新增四条规则：第 3 层只认绝对前缀 / 冲突按更严者 + `审查域=声明冲突（按治理面）` / 非法取值视同未声明并回显 / 第 4 层必须标注 `审查域=未声明（默认其他审查）`；
  - 新增一行：**意图未定 ⇒ 不给任何判定行（优先于本表）**。
- [x] **1.2** 自检：`grep -c '判定对象属治理面' prompts/oracle.md` → **0**；
      `grep -n "治理面判定: PASS | BLOCK | PASS-WITH-NOTES" prompts/oracle.md` → 命中定义行且**不含 `\|`**。
- [x] **1.3** 自检：「其他审查」术语沿用（**不新造「项目域」**）。

## Task 2：调用方侧 + 收口侧（AC1b / AC2 / D3 / D4）

- [x] **2.1** `prompts/build.md` §审查配对 的 `architect`（**治理面**）行：触发条件列加「**调用 oracle 时必须声明 `审查域: 治理面`**」。
- [x] **2.2** 同小节「#### oracle 调用前的意图检查点（architect 路径）」加 3 条 bullet：
  - **审查域声明（与意图陈述正交）**：治理面审查输入须含 `审查域: 治理面`；
  - **被派发后端**：缺声明 ⇒ **不 block**（走第 3/4 层兜底 + 响应报告缺失）；写明与 v2.37「缺意图 ⇒ `HANDOFF: blocked`」的**口径差异有据**（意图决定能不能判；审查域只决定用哪套词表）；
  - **`front` / `plan` 不需声明**（只读理解性 / 架构建议；从不审治理面对象 ⇒ 第 4 层 / 咨询模式即正确）。
- [x] **2.3** 同小节「**治理面判定（verdict）**」段加一条硬条件：
      治理面审查的判定行必须是 `治理面判定:`；见到 `判定:` 或第 4 层标注 ⇒ **审查不成立、不得收口**，补齐声明后重跑；并声明**不是第三态**（并入既有「审查不成立」）。
- [x] **2.4** 自检：`grep -n "审查域" prompts/build.md` 见 3 处；`grep -c "更严者" prompts/build.md` ≥ 1。

## Task 3：description（AC3 / D6）

- [x] **3.1** `opencode.jsonc` 的 `agent.oracle.description`：加一句**指针 + 可执行摘要**（声明优先 / 未声明路径兜底 / 再默认其他审查并标注 / 判据见 `prompts/oracle.md`「模式」段）。**不复制正文**。
- [x] **3.2** 自检：`python3 -c` 读 JSON 后 `desc` 含 `审查域` 且含 `prompts/oracle.md`。

## Task 4：静态守卫（AC4 / D7 / D8）

- [x] **4.1** 新增 `describe("oracle 审查域声明（v2.40）")`（兄弟块，**不塞进** v2.37 族）：
  - 纯函数 `scopeDeclViolations(corpus)`：10 条判据（分层行锚定 / 猜测分支已删 / 标注串 / verdict 硬条件 / 治理面行声明 / 检查点口径 / description 指针 / 优先级行 / 冲突与非法值规则）；
  - `MUTATIONS`：17 条突变（每条 expect 关键词唯一对应判据类；含 oracle 审出的「后果从句弱化」一条）；
  - 复用「判据类 ↔ 关键词唯一性」用例（同 v2.37 族的形态）；
  - 未覆盖清单（如实登记：无行为层、措辞不钉、跨族关键词不复用等）。
- [x] **4.2** v2.37 族的未覆盖清单加一行指向兄弟块。
- [x] **4.3** 验证：`bun test tests/config-guards.test.ts` → 全绿；`bun test tests/` → 全绿。
- [x] **4.4** 验证既有断言 `:1127/1132` **未修改**且绿（D7 结构规避的证据）。

## Task 5：投影同步（AC6 / D9）

- [x] **5.1** `docs/MULTI-AGENT-DESIGN.md`：§2.7 意图检查点段后加「审查域声明」摘要段（指向 `oracle.md`/`build.md`）。
- [x] **5.2** `docs/SUBAGENT-ORCHESTRATION.md`：§3 意图闸门段后加一句同义摘要。
- [x] **5.3** `docs/CHANGELOG.md`：加 v2.40 条目（真源 / 调用方 / 收口 / 守卫 / e2e / 自指审查声明）。
- [x] **5.4** 验证：`openspec validate oracle-governance-scope-declaration --strict` → valid。

## Task 6：e2e 闭环（AC5a / AC5b / AC5c / D10）

- [x] **6.1** `/workspace/main/rdd-workflow-e2e/tests/integration/test_oracle_intent_gate.bats` 的 E-A：prompt 加 `审查域: 其他审查`；记录 `$SC_SRC` HEAD。
- [x] **6.2** 新增两态观察用例：态① 带声明 / 态② harness 删声明行 ⇒ 只登记词表是否改变，**不 fail**；沿用三档 skip 纪律。
- [x] **6.3** 跑：`OIG_CARRIER=A OIG_MODEL=commandcode/deepseek/deepseek-v4.1-flash E2E_REAL_RUNTIME=1 …`
      - 额度不足 ⇒ skip 未判定（**不重试**），如实落报告；
      - 跑通 ⇒ 结果落 `.rddf/reviews/oracle-intent-gate-e2e-observation.md`。
- [x] **6.4** 默认态回归：`bats tests/integration/test_oracle_intent_gate.bats` → 零模型用例 pass、运行时用例 skip、exit 0。

## Task 7：审稿与收口（治理面强制）

- [x] **7.1** **oracle**（1 轮）：输入含可判定意图陈述 + `审查域: 治理面` 声明；逐条应答 finding。
- [x] **7.2** **critic**（1 轮，7 字段 + `review_profile: build, plan`）：只审与既有不变式 / 权限 / 规则是否冲突。
- [x] **7.3** BLOCKER ⇒ 修 + 1 次复审（只验闭合）；SHOULD_FIX / NITS ⇒ 记 notes 放行。
- [x] **7.4** 审稿记录落 `.rddf/reviews/oracle-governance-scope-declaration-review.md`（含**自指审查声明**）。
- [x] **7.5** 回写 `~/.config/opencode/docs/review-automation-backlog.md` P2-4 状态（若该 change 关单）；上游 `oracle-intent-gate-e2e` 的 AC2 状态据实测更新（**只改状态，不改判据**）。

## AC 对照

| AC | 对应 Task |
|---|---|
| AC1a | 1.1 / 1.2 / 4.1 |
| AC1b | 2.3 / 4.1 |
| AC2 | 2.1 / 2.2 / 4.1 |
| AC3 | 3.1 / 3.2 / 4.1 |
| AC4 | 4.1–4.4 |
| AC5a | 6.1 / 6.3 |
| AC5b | 6.2 / 6.3 |
| AC5c | 6.2 |
| AC6 | 4.3 / 5.1–5.4 / 7.4 |
