# Tasks — delegate-base-channel

> 判据真源：`proposal.md` 的「## 验收标准」（AC1–AC14）。
> 决策取舍：`design.md`（D1 schema 理由 / D2 resume 与 sha / D3 校验位置与顺序 / D4 `buildBrief` 第三参 /
> D5 服务端校验 / D6 AC29 转型 / D7 已知边界 / D8 dispatch 同步 / D9 消费端既有缺陷登记）。
> **TDD 5 步**：每个 Task 先写会失败的断言（红灯证据记录在案），再写最小实现，再转绿。
> ⚠ **本版按 critic 的 REJECT 修订**：消除了原版的 2 个 BLOCKER（AC12 判据可平凡满足、Task 1→9 红色窗口），
> 并把 10 个 Task 收敛为 **7 个**（合并同失败域、删重复、去掉不可执行的 Step）。

## 前置确认（动手前）

- [ ] **0.1** 确认 `git rev-parse --verify --end-of-options "v1.0^{commit}"` 在本机可用（annotated tag 形态 ⇒ AC7 的修法前提；D5）
- [ ] **0.2** 确认 `git rev-parse --verify --end-of-options HEAD~1` 在 fixture 仓返回 40 位 sha（AC2 的期望值来源）
- [ ] **0.3** 确认 `delegate-async.ts:1154` 的 `canonicalRoot` 解构位置（要补 `vcs`）+ `delegate-core.ts` 的 `buildBrief` 签名（要扩第三参）
- [ ] **0.4** 确认两处既有用例的位置：`tests/delegate-tool.test.ts:804`（verifier 派发成功路径）、`tests/delegate-async.test.ts:422`（`/越界/` 断言）

---

## Task 1：schema 加 `base` + 同步删登记 + dispatch description 语义（AC1 / AC11 的一半）

> ⚠ **删登记必须与 schema 改动同一步** —— AC29 是双向判据，`hasSchemaParam` 一为真就要求登记消失
> ⇒ 否则本 Task 落地当轮全 suite 红（原版 Task 1→9 红色窗口 = critic 的 BLOCKER 2(i)）。

- [ ] **Step 1:** 写失败断言 ——
      ① `delegateToolDefinition({}).input.properties.base` 存在且 `type === "string"`；
      ② dispatch 的 schema 同样；③ 两处 `required` **都不含** `base`；
      ④ `delegate` 的 `properties.base.description` 含「verifier」+「resume」语义；
      ⑤ `dispatch` 的**手抄** description（`async:1100-1104`）含同等语义（**它没有派生 ⇒ 必须手写**）
- [ ] **Step 2:** 跑测试确认红（失败信息指向「base 不存在」/「description 缺 base 语义」）
- [ ] **Step 3:** 最小实现 ——
      - 两处 `properties` 各加 `base`（`description`：「本次派发的基线；**verifier 类必填**，其它类可省；
        resume 时由调用方重填（跨 resume 要同一基线 ⇒ 用当初简报里印出的 sha）」）
      - `dispatch` 的手抄 description 补一句 base 的条件必填语义
      - **同步删掉** `KNOWN_UNIMPLEMENTED_CHANNELS` 里的 `delegate-base` 条目（否则 AC29 当轮红）
- [ ] **Step 4:** 跑测试确认绿 ⇒ **AC29 不再红**（红色窗口已关）

## Task 2：空值语义 + 注入加固 + knowledge 互斥（AC3 / AC4 / AC9）

> 三组判据同在 `validateBrief` 的**形态层** ⇒ 合成一个 Task（分开会重复搭脚手架）。

- [ ] **Step 1:** 写失败断言 ——
      ① `base: ""` 与 `base: null` 均抛（只认 `undefined` 为没填）；
      ② 四种注入形态各抛：`"--help"` / `"-h"` / `"HEAD~1 x"` / `"../etc"`（错误信息含被拒形态）；
      ③ `kind=knowledge` + `base` 已填 ⇒ 抛（与 `role_class`/`grants` 对 knowledge 的硬拒策略对齐）
- [ ] **Step 2:** 确认红
- [ ] **Step 3:** 最小实现：`validateBrief` 加 base 的形态校验（非 `undefined` 时必须为非空字符串、无空白、不以 `-` 开头、不含 `..`）+ knowledge 互斥
- [ ] **Step 4:** 确认绿

## Task 3：`buildBrief` 基线行（`<raw> → <sha>`）+ 第三参（AC2 / AC6 的一部分）

- [ ] **Step 1:** 写失败断言 ——
      ① `buildBrief(validateBrief({...合法 engineering 派发, base: "HEAD~1"}), root, { base: "<sha>" })`
      的输出含 `基线（base）: HEAD~1 → <40 位 hex>`（**行为断言**，sha 取 fixture 仓实测值）；
      ② `opts.vcs === false` 时输出含「无 VCS，基线不可用」
- [ ] **Step 2:** 确认红
- [ ] **Step 3:** 最小实现：`buildBrief(brief, root, opts?: { vcs?: boolean; base?: string })` ——
      engineering 分支渲染基线行（`opts.base` 缺省 ⇒ 不渲染）；`opts.vcs === false` ⇒ 渲染「无 VCS」行
- [ ] **Step 4:** 确认绿

## Task 4：`execute` 内硬拒 + sha 解析（AC5 / AC6 / AC7 / AC8 / AC12）

> **本 change 的核心**。四个 AC 同在 `execute` 的一处闸门 ⇒ 合成一个 Task。

- [ ] **Step 1:** 写失败断言（fake ctx，**delegate 与 dispatch 各一份**）——
      ① AC5：`role_class=verifier` + git 仓 + 无 base ⇒ 建 session **前**抛，文案含「base」+「verifier 派发必须声明基线」+「resume 须由调用方重填 base」
      ② AC6：`vcs=false` + verifier + 无 base ⇒ **放行**
      ③ AC7：不可解析 ref ⇒ 抛；**annotated tag（`v1.0`）不抛**
      ④ AC8：resume verifier + 重填 base ⇒ 简报含基线行（**大概率预期即绿** —— buildBrief 无独立 resume 分支，role_class 来自调用点 spread ⇒ 若红，查 `effectiveRoleClass` 注入路径）
      ⑤ AC12：verifier + **scope 越界** + 缺 base ⇒ 第一条错误是 **scope**（不是 base）
- [ ] **Step 2:** 确认每条各自红，且失败信息指向**预期那一条**（尤其 ⑤ 必须是 scope 错）
- [ ] **Step 3:** 最小实现 ——
      - **抽共享 helper**（如 `assertVerifierBaseline({ roleClass, vcs, base, workRoot })`）放 `delegate-core.ts`
        紧邻 `assertRoleClassCompatible`（既有先例：async 已从 core import 它）⇒ **两链路同层同序**调用
      - 校验顺序：`assertRoleClassCompatible` **之后** ⇒ 先判「你是谁」，再判「你缺什么」（D3）
      - sha 解析：`git rev-parse --verify --end-of-options "<base>^{commit}"`，`cwd = workRoot`（D5）
      - `async:1154` 的 `canonicalRoot` 解构补 `vcs`（**dispatch 侧原本没有**）
      - 两处 `execute` 把**已解析的 sha** 传给 `buildBrief`
- [ ] **Step 4:** 确认绿，且**既有用例已处置**：`tests/delegate-tool.test.ts:804` 补 `base: "HEAD~1"`；
      `tests/delegate-async.test.ts:422` 的 `/越界/` 断言仍成立

## Task 5：端到端静态闭环（AC2 的后半）

- [ ] **Step 1:** 写失败断言 —— 从 `buildBrief` 的输出**解析**出 sha，在 fixture git 仓真跑
      `git merge-base HEAD <parsed>` ⇒ **exit 0**（不需要 LLM ⇒ 证明「通道输出能被消费端第一条命令消费」）
- [ ] **Step 2:** 确认红
- [ ] **Step 3:** 最小实现（测试侧接线 + 必要的解析辅助）
- [ ] **Step 4:** 确认绿

## Task 6：文档同步（AC10 的五个面）

- [ ] **Step 1:** 写失败断言（守卫）—— 五个面逐条断：
      ① `plan.md` 的 verifier 行含「必填 `base`」；② `plan.md` 派发参数段含「resume … 重填」+「sha」；
      ③ `front.md:93` 的 verifier 行含 base；④ `front.md:84` 的标题计数 + `docs/backend-handoff-role-class.md:31` 参数流图；
      ⑤ 工具 description 含「verifier 必填 + resume 须重填」（delegate property + dispatch 手抄面）
      ⚠ **不判 `build.md:343` 的基线纪律** —— 原文**已是目标措辞** ⇒ 判它就是先天绿（原版 AC9 的半永绿子句，已删）
- [ ] **Step 2:** 确认红
- [ ] **Step 3:** 改五处
- [ ] **Step 4:** 确认绿

## Task 7：AC29 转行为断言 + 全量回归 + revert 留痕（AC11 / AC13 / AC14）

- [ ] **Step 1:** 把 AC29 的「有通道」分支改为**行为断言**（`buildBrief` 输出含基线行；当前是扫源码字样 ⇒ 太松，D6）
- [ ] **Step 2:** 跑测试确认绿（登记已在 Task 1 删除 ⇒ 不应红）
- [ ] **Step 3:** `bun test tests/` 全绿（**单独校验退出码**，不用管道串）+ `bash scripts/check-upstream-anchors.sh` 无 `FAIL` / 无 `SKIP`
- [ ] **Step 4:** **逐条 revert 映射表**（一次回退一条 ⇒ 指名哪条 AC 变红），记录写入
      `.rddf/reviews/delegate-base-channel-revert-map.md`（AC14 要求留痕）
- [ ] **Step 5:** 落 CHANGELOG 条目（结论按实际审查回填，**不预断言**）

## 审查（收口前）

- [ ] **R1:** 治理面（`prompts/**` + 守卫断言 + **公开契约 schema**）⇒ oracle 1 轮 → critic 1 轮
- [ ] **R2:** critic 的 BLOCKER 全闭（如有）⇒ 复审 1 次只验闭合
- [ ] **R3:** 审稿记录落 `.rddf/reviews/delegate-base-channel-review.md`

## 已知边界（写进测试注释，不假装覆盖）

- 「LLM 真的会填 `base`」**证不了**（需真实模型 e2e，属 `rdd-workflow-e2e` 的 CS 系列）—— 本 change 只到 fake-ctx 管道测试
- **消费端的三点 diff 在未提交工作树恒空**（`build.md:343` 的 `git diff --name-only <base>...HEAD`）——
  **先于本 change 存在的缺陷**，本 change 只登记，**另立 change** 修（D9）
- 非 git 工程的 verifier 仍「需要基线 ⇒ blocked」—— 既有语义，本 change 把「无 VCS，基线不可用」显式化
- `git rev-parse --end-of-options` 依赖 git ≥ 2.24 ⇒ 低版本环境回退到格式白名单（需记录实际版本）
- `base` 不落盘 ⇒ 跨会话 resume 时**必须**由调用方重填（`pair.json` 不存它）；要同一基线 ⇒ 用当初简报里的 sha
