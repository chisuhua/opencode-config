# Tasks — delegated-verifier-evidence-gap

> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC9）。
> 性质：**纯 prompts + 守卫**，无代码路径改动；治理面 ⇒ oracle → critic。

## A. `prompts/build.md` §verifier 产出契约

- [x] A1 新增「取证不可用 ⇒ 交回」段：**失败签名分类**（判据信号 ⇒ 直接 `ac-fail`；环境信号四类 ⇒ 基线臂 ⇒ `blocked`；内容类取证 ⇒ 基线臂适用但「未命中新增内容 / 产物未存在」仍是判据信号）→ AC1
- [x] A2 基线取法与两条 ⚠ 的**优先级**（`<base>` 不可解析 ⇒ 优先 `blocked`；新增文件默认 `ac-fail` 只在可解析且形态为判据信号时适用）→ AC1
- [x] A3 kind 优先级（含「pass 被禁止且无带证据的不通过 ⇒ `blocked`」）→ AC1 / AC3
- [x] A4 **受阻记录四要素**：verifier 自落 / 落点 / 权威序 / 轮次取较大值 + 不替代 feedback 凭据 + 主会话形态 → AC6 / AC7
- [x] A5 5 项**追加句**（③ 首句固定「阻塞类型：」；④ 逐条列已取证/未取证）+ 两条例外（判据来源为空 / skill 不可加载）→ AC6

## B. `prompts/build.md` §审查配对 例外段 + §被派发后端的运行身份

- [x] B1 例外段改**逐类独立 bullet**（architect / builder 架构面 / builder 逐 change 验收 / verifier）→ AC2
- [x] B2 「不得完成任何收口动作」里的「审稿报告」限定为**判定类**报告（受阻记录不在禁止范围）→ AC2
- [x] B3 §被派发后端的运行身份 增「逐类后果」**定义处**（例外段只做指针）→ AC2

## C. `prompts/plan.md`

- [x] C1 选类表 verifier 行：**简报必须声明可解析的 `<base>`**（否则一律 `blocked`）→ AC1 / AC6

## D. 守卫（扩展既有 describe，不新建第二份守同一段的守卫）

- [x] D1 AC1：三段文本 + 失败签名四类 + 负向（`⇒`/`则` 与「等同 / 意味着 / 即为」）→ AC1
- [x] D2 AC2：逐类 bullet + **首个类名必可解析** + `explore`×`blocked` 负向 + 「判定类」carve-out + 「逐类后果」定义处 → AC2
- [x] D3 AC3：kind 集合动态抽取 → AC3
- [x] D4 AC4/AC5：负向 + 未新增（`SLOT_STATES` / outcome 集合）→ AC4 / AC5
- [x] D5 AC6：文本锚点 + 受阻记录四要素 + 既有「0 工具调用判 pass = 作废」与「报告落点」句仍在 → AC6
- [x] D6 plan.md 的 `<base>` 声明要求锚点 → AC1
- [x] D7 回归：`bun test tests/` **531 pass / 0 fail**；anchors **23/23** → AC8

## E. e2e（`rdd-workflow-e2e` 仓）

- [x] E1 CS-3 扩展：受阻记录须由 verifier **自落** + 首行 `HANDOFF:` + 无 pass 结论 → **通过** → AC7
- [ ] E2 CS-5（新增）：修改文件上的测试失败 ⇒ `ac-fail` 而非 `blocked` → **未验证**（Token Plan 429，按纪律不重试）—— 用例已入库

## F. 评审与收口

- [x] F1 oracle 1 轮 **BLOCK**（6 条）→ 全落
- [x] F2 critic 1 轮 `APPROVE_WITH_CONDITIONS`（2 SHOULD_FIX + 2 NIT 全落，`mergeable: yes`）—— 记录见 `.rddf/reviews/delegated-verifier-evidence-gap-prompt-review.md`
- [x] F3 验收报告 `.rddf/reviews/delegated-verifier-evidence-gap-verify.md` + Acceptance 镜像逐条勾选（AC7 由 CS-3 覆盖；CS-5 未验证已如实登记）
