# Tasks — delegate-base-channel

> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC12）。
> 决策取舍：`design.md`（D1 schema 理由 / D2 resume 语义 / D3 校验位置 / D4 vcs 闸门 / D5 注入加固 / D6 AC29 转型）。
> **TDD 5 步**：每个 Task 先写会失败的断言（红灯证据记录在案），再写最小实现，再转绿。

## 前置确认（动手前）

- [ ] **0.1** 确认 `git rev-parse --verify --end-of-options HEAD~1` 在本机可用（D5 的护栏依赖 git ≥ 2.24）
- [ ] **0.2** 确认 `prompts/build.md` 的基线纪律原文与「缺省 `origin/main`」条款位置（AC9 要改）
- [ ] **0.3** 确认 `delegate-async.ts` 的 dispatch schema 位置（AC1 / AC12 要动）

---

## Task 1：schema 加 `base`（AC1）

- [ ] **Step 1:** 写失败断言 —— `delegateToolDefinition({}).input.properties.base` 存在且 `type === "string"`；
      `dispatch` 的 schema 同样；且两处 `required` **都不含** `base`
- [ ] **Step 2:** 跑测试确认红（Expected: FAIL，信息指向「base 不存在」）
- [ ] **Step 3:** 最小实现：两处 `properties` 各加 `base`（`description` 写明「供后端跑 `git merge-base`；
      `verifier` 类必填；resume 时由调用方重填」）
- [ ] **Step 4:** 跑测试确认绿

## Task 2：`buildBrief` 生成基线行（AC2）

- [ ] **Step 1:** 写失败断言 —— `buildBrief(validateBrief({...合法 engineering 派发, base: "HEAD~1"}), root)`
      的输出含 `基线（base）: HEAD~1`（**行为断言**，不是扫源码）
- [ ] **Step 2:** 确认红
- [ ] **Step 3:** 最小实现：`buildBrief` 在 engineering 分支加一行（`vcs === false` 时改为「无 VCS，基线不可用」）
- [ ] **Step 4:** 确认绿

## Task 3：空值语义（AC3）

- [ ] **Step 1:** 写失败断言 —— `base: ""` 与 `base: null` 均抛（`validateBrief` 只认 `undefined` 为没填）
- [ ] **Step 2:** 确认红
- [ ] **Step 3:** 最小实现：`validateBrief` 加 base 的形态校验（非 `undefined` 时必须为**非空字符串**）
- [ ] **Step 4:** 确认绿

## Task 4：注入加固（AC6）

- [ ] **Step 1:** 写失败断言 —— 4 种恶意形态各抛：`"--help"` / `"-h"` / `"HEAD~1 x"` / `"../etc"`；错误信息含被拒形态
- [ ] **Step 2:** 确认红
- [ ] **Step 3:** 最小实现：格式白名单/黑名单（首字符非 `-`、无空白、无 `..`）
- [ ] **Step 4:** 确认绿

## Task 5：`execute` 内硬拒（AC4 / AC5 / AC7）

> 三条件绞在一起，**同一 Task** 做（分开会让中间态出现「校验位置错」的假绿）。

- [ ] **Step 1:** 写三条失败断言（fake ctx）：
      - AC4：`role_class=verifier` + git 仓 + 无 base ⇒ 建 session **前**抛
      - AC5：`role_class=verifier` + `vcs=false` + 无 base ⇒ **放行**，简报含「无 VCS」
      - AC7：`base="nonexistent-ref-xyz"` ⇒ 派发前抛（`git rev-parse --verify --end-of-options` 校验）
- [ ] **Step 2:** 确认三条各自红、且失败信息指向预期那一条
- [ ] **Step 3:** 最小实现：
      - 位置：`effectiveRoleClass` 解析之后（与 `assertRoleClassCompatible` 同层）
      - 条件：`effectiveRoleClass === "verifier" && vcs && base === undefined` ⇒ 抛
      - 可解析性：`git rev-parse --verify --end-of-options <base>`（`cwd = workRoot`），失败 ⇒ 抛
- [ ] **Step 4:** 确认三条绿，且**既有** builder / architect / 知识类用例不受影响

## Task 6：resume 路径（AC8）

- [ ] **Step 1:** 写失败断言 —— resume verifier 且**重填** `base` ⇒ 简报含基线行（证明不需要「resume 例外」）
- [ ] **Step 2:** 确认红（若已绿 ⇒ 说明 Task 5 的位置选对了，记录为「预期即绿」）
- [ ] **Step 3:** 若红：修 `buildBrief` 的 resume 分支（`role_class` 来自 `effectiveRoleClass` 时同样渲染基线行）
- [ ] **Step 4:** 确认绿

## Task 7：`dispatch` 带 base 不再硬拒（AC12）

- [ ] **Step 1:** 写失败断言 —— `dispatch` 工具定义接受 `base`（`additionalProperties: false` 下不被拒）
- [ ] **Step 2:** 确认红
- [ ] **Step 3:** 最小实现：dispatch schema 加 `base`（Task 1 已做 ⇒ 此步可能已绿，记录为「Task 1 连带」）
- [ ] **Step 4:** 确认绿

## Task 8：文档同步（AC9）

- [ ] **Step 1:** 写失败断言（守卫）：四处文档的措辞与真源一致 —— `plan.md` 的 verifier 行含「必填 `base`」、
      `plan.md` 派发参数段含「resume … 重填」、`front.md` 的 verifier 行含 `base`、`build.md` 的基线纪律不再
      把 `origin/main` 当通用缺省（仅存量简报）
- [ ] **Step 2:** 确认红
- [ ] **Step 3:** 改四处文档
- [ ] **Step 4:** 确认绿

## Task 9：AC29 转行为断言 + 删登记（AC10）

- [ ] **Step 1:** 改 AC29：无通道分支已被「有通道」取代 ⇒ 断言改为**行为断言**（`buildBrief` 输出含基线行）；
      并删掉 `KNOWN_UNIMPLEMENTED_CHANNELS` 的 `delegate-base` 条目
- [ ] **Step 2:** 跑测试 —— **双向判据此时应红**（有通道 + 仍登记 ⇒ 红），证明收口机制生效
- [ ] **Step 3:** 删登记条目 ⇒ 绿
- [ ] **Step 4:** 确认 AC29 的行为断言能抓「删掉基线行」（revert 演练）

## Task 10：全量回归 + revert 映射（AC11）

- [ ] **Step 1:** `bun test tests/` 全绿（**单独校验退出码**，不用管道串）
- [ ] **Step 2:** `bash scripts/check-upstream-anchors.sh` 无 `FAIL` / 无 `SKIP`
- [ ] **Step 3:** **逐条 revert 映射表**（一次回退一条 ⇒ 指名哪条 AC 变红）：
      AC1 / AC2 / AC3 / AC4 / AC5 / AC6 / AC7 / AC8 / AC10 / AC12
- [ ] **Step 4:** 落 CHANGELOG 条目（结论按实际审查回填，**不预断言**）

## 审查（收口前）

- [ ] **R1:** 治理面（`prompts/**` + 守卫断言 + **公开契约 schema**）⇒ oracle 1 轮 → critic 1 轮
- [ ] **R2:** critic 的 BLOCKER 全闭（如有）⇒ 复审 1 次只验闭合
- [ ] **R3:** 审稿记录落 `.rddf/reviews/delegate-base-channel-review.md`

## 已知边界（写进测试注释，不假装覆盖）

- 「LLM 真的会填 `base`」**证不了**（需真实模型 e2e，属 `rdd-workflow-e2e` 的 CS 系列）—— 本 change 只到 fake-ctx 管道测试
- `git rev-parse --end-of-options` 依赖 git ≥ 2.24 ⇒ 低版本环境回退到格式白名单（需记录实际版本）
- `base` 不落盘 ⇒ 跨会话 resume 时**必须**由调用方重填（`pair.json` 不存它）
