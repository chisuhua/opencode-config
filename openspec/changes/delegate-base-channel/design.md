# Design — delegate-base-channel

> 判据真源：`proposal.md` 的「## 验收标准」。本文只记**决策取舍**（为什么这么定、代价是什么），不复制判据。
> 裁决来源：`oracle`（3 批方案）→ `metis`（gap 分析，4 条事实指控经核实全部属实）→ `critic`（逐条裁决，`APPROVE_WITH_CONDITIONS`，无 BLOCKER）。
> 记录：`.rddf/reviews/alignment-completeness-p0-review.md` 的 §3。

## D1. 为什么是 schema 参数，而不是「写进 constraints」

| 方案 | 判据形态 | 绕过面 |
|---|---|---|
| **写进 `constraints` 自由文本**（旧现状） | 散文 | typo 无拦截；「声明了没有」不可机械核；后端要先解析中文再跑 git |
| **schema 加 `base` + 简报生成基线行**（本 change） | 结构化字段 + 派发前硬拒 | 仍不保证**模型会填**（见 D7），但保证「填错了会被拦」 |

关键事实：**消费方是后端 LLM**，它要的是**可解析的 git ref**（`build.md` 的三条命令都是 git 原语），
不是一段能读的中文。自由文本算「读得到」，不算「可解析有保证」。

代价：公开契约 +1 参数（12→13），`delegate` 与 `dispatch` **两处**必须同步。**这是本 change 的主要成本**，
所以它单独成一个 change，不与 `v2.30` 的 P0 混在一起。

## D2. resume 时 `base` 从哪来：调用方重填（**不是**「resume 除外」）

初版方案（oracle）主张「resume 除外，登记为已知缺口」。**该主张不可采纳** —— 它是方案内部矛盾：

- `prompts/plan.md` 要求 resume **不得**显式声明 `role_class`（避免用 resume 换类）；
- 但 resume 的简报由 `buildBrief` **重新生成**，其中 `role_class` 来自登记值（`effectiveRoleClass`）；
- ⇒ 「新派发 + verifier 必填 base，resume 除外」的结果是：**resumed verifier 的简报里 `role_class=verifier`，
  却没有基线行** ⇒ 必然命中 `build.md` 的「取不到基线 ⇒ blocked」。

裁决：**`base` 是每次派发的参数，不是 session 继承的上下文。**

支撑：resume 时 `scope` / `task` 本来就是调用方重新提供的（`plan.md` 的 resume 三禁令里明确「新 scope ⊆ 原 scope」、
「新 task 用第 ⑤ 项草案」）—— **没有任何一项是从 `pair.json` 继承进简报的**。`base` 按同构处理即可。

⇒ 「resume 不继承上下文」这条禁令针对的是**后端 session 的上下文**，不是**派发参数**；
要求重填恰恰是「不继承」的贯彻。

## D3. 校验位置：`execute`（按 `effectiveRoleClass`），不是 `validateBrief`

`validateBrief` 是**纯输入校验**，拿不到 `workRoot` / `vcs`，也拿不到 `effectiveRoleClass`
（后者在 `execute` 内才由登记值解析）。

两个错误位置及其后果：

| 位置 | 后果 |
|---|---|
| `validateBrief` 按 `brief.role_class` 判 | **resume 必然漏判**（resume 时 `role_class` 不填 ⇒ 缺省 `builder` ⇒ 跳过校验） |
| `validateBrief` 按「填了 `role_class=verifier` 就必须有 base」判 | **resume 无法通过**（resume 不许声明 `role_class`）⇒ 两个方向都错 |

⇒ 放在 `execute` 内、`effectiveRoleClass` 解析之后（与 `assertRoleClassCompatible` 同层）。
既有先例：`planRefCheck` 也在 `execute` 内。

## D4. vcs 闸门：`vcs === false` 不要求 base

`canonicalRoot()` 对非 git 工程会静默回退（两个根相同、`vcs=false`）。
若无条件要求 base ⇒ **所有非 git 工程的 verifier 派发被全拒** = 行为回归。

⇒ `vcs === false` ⇒ 不要求 `base`；简报打印「本工程无 VCS，基线不可用」，后端按既有纪律兜底。

## D5. 注入加固：`base` 会进 `git` 命令行

`base` 的值最终拼进 `git merge-base` / `git diff` / `git show`。三类必须挡：

| 形态 | 为什么危险 | 挡法 |
|---|---|---|
| 首字符 `-`（`--help` / `-h` / `--output=…`） | 被 git 当**选项**而非 ref | 首字符拒绝 `-`；服务端用 `--end-of-options` |
| 空白 / 换行 | shell 分词 / 多行注入 | 拒绝 |
| `..` | 路径穿越形态 | 拒绝 |

服务端二次校验：`git rev-parse --verify --end-of-options <base>`
（`--end-of-options` 要求 git ≥ 2.24；本机版本满足，若将来不支持则回退到「只做格式白名单」并记录）。

## D6. AC29 为什么要从「登记式」转「行为断言」

`v2.30` 的 AC29 在「无通道」分支下只做**登记检查**（登记表里有条目即可），因为当时通道不存在。
通道落地后它应转为**行为断言** —— 当前实现（扫源码里有没有 `基线` 字样）太松：
`database` / 注释 / 别的字段都能命中，删掉基线行而别处提一句仍然绿。

⇒ 改为：`buildBrief(validateBrief({...base:"HEAD~1"}))` 的输出**必须含** `基线（base）: HEAD~1`。

同时**双向判据**会强制删掉 `KNOWN_UNIMPLEMENTED_CHANNELS` 的 `delegate-base` 条目
（有通道 + 仍登记 ⇒ 红）—— 这是 `v2.30` 设计时就留好的收口机制，本 change 不改判据结构，只走它的「已落地」分支。

## D7. 本 change **不**证明「LLM 真的会填 base」

静态层 + fake-ctx 管道测试最多证明**管道通**（schema 接受、简报生成、校验生效），
**不证明**模型在派发时会主动填这个字段。

⇒ 明确登记为 known boundary，不在 DoD 里暗示已覆盖。要真证明需一次真实模型派发（e2e，吃额度），
属另一个层级（`rdd-workflow-e2e` 的 CS 系列），不在本 change。

## D8. 为什么 `dispatch` 必须同批

`dispatch` 的 schema 是 `additionalProperties: false`。若只给 `delegate` 加 `base`：

- plan 按新规则给 `dispatch` 传 `base` ⇒ **schema 硬拒**（不是「忽略」，是报错）；
- 而 `dispatch` 与 `delegate` 共用 `validateBrief` / `buildBrief` ⇒ 语义必须一致。

⇒ 两处 schema 同一 commit，AC1 / AC12 分别钉住。

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| 改公开契约影响现有派发方 | `base` **选填**（`required` 不含它）；只有 verifier + git 仓才强制 ⇒ 现有 builder / architect / 知识类派发零影响 |
| 非 git 工程被误拒 | D4 的 vcs 闸门 + AC5 回归断言 |
| resume 路径漏判 | D3 的校验位置 + AC8 |
| `git rev-parse` 版本差异 | D5 的回退路径（格式白名单） |
| **回滚** | 删两处 schema 的 `base` + 恢复 `plan.md`/`build.md` 口径 + 把 `delegate-base` 登记条目加回 `KNOWN_UNIMPLEMENTED_CHANNELS`（双向判据会强制这一步，不会静默留空） |
