# Design — delegate-base-channel

> 判据真源：`proposal.md` 的「## 验收标准」（AC1–AC14）。本文只记**决策取舍**（为什么这么定、代价是什么），不复制判据。
> 裁决链：`oracle`（11 条建议 / 5 个技术缺陷）→ `metis`（P0-1..P0-6 / E1–E8 / 元层盲区）→ `critic`（**REJECT** + 9 条实施前必改）⇒ 本版按裁决修订。
> 记录：`.rddf/reviews/alignment-completeness-p0-review.md` §3。

## D1. 为什么是 schema 参数，而不是「写进 constraints」

| 方案 | 判据形态 | 绕过面 |
|---|---|---|
| **写进 `constraints` 自由文本**（旧现状） | 散文 | typo 无拦截；「声明了没有」不可机械核；后端要先解析中文再跑 git |
| **schema 加 `base` + 简报生成基线行**（本 change） | 结构化字段 + 派发前硬拒 | 仍不保证**模型会填**（见 D7），但保证「填错了会被拦」 |

关键事实：**消费方是后端 LLM**，它要的是**可解析的 git ref**，不是一段能读的中文。自由文本算「读得到」，不算「可解析有保证」。

代价：公开契约 +1 参数，`delegate` 与 `dispatch` **两处**必须同步。**这是本 change 的主要成本**，
所以它单独成一个 change。

## D2. resume 时 `base` 从哪来：调用方重填，且**必须用当初的 sha**

初版方案（oracle）主张「resume 除外，登记为已知缺口」。**该主张不可采纳** —— 它是方案内部矛盾：

- `prompts/plan.md` 要求 resume **不得**显式声明 `role_class`；
- 但 resume 的简报由 `buildBrief` **重新生成**，其中 `role_class` 来自登记值（`effectiveRoleClass`）；
- ⇒ 「新派发 + verifier 必填 base，resume 除外」的结果是：**resumed verifier 的简报里 `role_class=verifier`，
  却没有基线行** ⇒ 必然命中 `build.md` 的「取不到基线 ⇒ blocked」。

裁决：**`base` 是每次派发的参数，不是 session 继承的上下文。**

⚠ **但 metis 指出的语义漏洞成立**：初版论证说「base 与 scope/task 同构」，**这个类比不成立** ——
`scope` / `task` 是**文本**（不会漂移），`base` 是**相对 ref**（会随 HEAD 移动）：

- resume 时重填 `HEAD~1` 指的是**续接那一刻**的 HEAD，**不是当初的基线** ⇒ 基线不守恒；
- `dispatch` 的等待窗口内 HEAD 也可能前移 ⇒ 同理。

⇒ **采纳 P0-6：派发时把 `base` 解析成 sha 写进简报**（`- 基线（base）: HEAD~1 → <sha>`）。
理由（成本几乎为零 —— AC7 反正要跑一次 `git rev-parse`，捕获输出即可）：

1. typo 闭环更彻底（sha 不可变 ⇒ 消费端拿到的就是确定值）；
2. 消除 dispatch/resume 窗口内的基线漂移；
3. 让「resume 由调用方重填」**自洽**：**跨 resume 要同一基线 ⇒ 填当初简报里印出的 sha**；
4. 消解 `@{1}` 这类时间相关 ref（它在解析瞬间被冻结成 sha）。

⇒ D2 的最终表述：**base 不继承；但当初印出的 sha 是可重填的句柄。**

## D3. 校验位置与顺序：`execute`，且排在 `assertRoleClassCompatible` **之后**

`validateBrief` 是**纯输入校验**，拿不到 `workRoot` / `vcs`，也拿不到 `effectiveRoleClass`
（后者在 `execute` 内才由登记值解析）。

两个错误位置及其后果：

| 位置 | 后果 |
|---|---|
| `validateBrief` 按 `brief.role_class` 判 | **resume 必然漏判**（resume 不填 `role_class` ⇒ 缺省 `builder` ⇒ 跳过校验） |
| `validateBrief` 按「填了 `role_class=verifier` 就必须有 base」判 | **resume 无法通过**（resume 不许声明 `role_class`）⇒ 两个方向都错 |

⇒ 放在 `execute` 内、`effectiveRoleClass` 解析之后（与 `assertRoleClassCompatible` 同层）。
既有先例：`planRefCheck` 也在 `execute` 内。

⚠ **顺序也是决策**：`base` 闸门必须排在 `assertRoleClassCompatible` **之后**。
否则「scope 越界 + 缺 base」会先报 base，把「scope 越界」这条更根本的错误掩盖掉
（既有用例 `tests/delegate-async.test.ts:422` 的 `/越界/` 断言会破）。
哲学：**先判「你是谁」（class 相容性），再判「你缺什么」（base）** —— 与 resume 路径上
`assertResumeRoleClass` 先于 `assertRoleClassCompatible` 的既有顺序同源。

## D4. `buildBrief` 扩第三参：`opts?: { vcs?: boolean; base?: string }`

`buildBrief(brief, projectRoot)` 现有**两参**，结构上拿不到 `vcs`（它是 `canonicalRoot` 的产物，
在 `execute` 内才有）⇒ 「无 VCS，基线不可用」行与「已解析 sha」行都渲染不出来。

选**第三参**而不是往 brief 类型里加 `vcs` 字段：

| 方案 | 评估 |
|---|---|
| brief 加 `vcs` 字段 | `validateBrief` 结构上算不出它 ⇒ 恒 `undefined`；且每处 spread 都要手填 ⇒ 漏一处就错 |
| **第三参 `opts`** | 对既有调用（两参）**零破坏**；`opts` 缺省时不打印任何 VCS 行 ⇒ 既有断言（不出现可选字段）不受影响；execute 侧显式传入已解析值 |

⇒ `buildBrief(brief, root, opts?)`；`opts.base` 传**已解析的 sha**（不是原始 ref）。

## D5. 服务端校验：`git rev-parse --verify --end-of-options "<base>^{commit}"`，在 **workRoot** 跑

三条要求各自有理由：

| 要求 | 理由 |
|---|---|
| `--end-of-options` + 拒绝首字符 `-` | `base` 会进后端的 git 命令 ⇒ `--help` / `-h` / `--output=…` 会被当**选项**而非 ref（选项注入） |
| `^{commit}` peel | **annotated tag 用裸 ref 校验会失败**，而消费端 `git merge-base HEAD <base>` **会** peel tag ⇒ 不 peel 就是**误拒合法 base** |
| `cwd = workRoot`（不是 `stateRoot`） | worktree 场景下 `stateRoot` 指向**主仓** ⇒ 用它会解析到**主仓的 HEAD**，而后端 session 的 `location.directory = project_dir`（worktree）⇒ 校验通过但后端解析不一致 |

补充：bare repo ⇒ `canonicalRoot` 走 catch ⇒ `vcs=false` ⇒ 豁免，根本跑不到 rev-parse；
submodule ⇒ `workRoot` = submodule toplevel（与后端同上下文）⇒ 正确。

## D6. AC29 为什么要从「登记式」转「行为断言」

`v2.30` 的 AC29 在「无通道」分支下只做**登记检查**。通道落地后它应转为**行为断言** ——
当前实现（扫源码里有没有 `基线` 字样）太松：`database` / 注释 / 别的字段都能命中，
删掉基线行而别处提一句仍然绿。

⇒ 改为：`buildBrief(validateBrief({...base:"HEAD~1"}))` 的输出**必须含** `基线（base）: HEAD~1 → <sha>`。

⚠ **红色窗口**（critic 的 BLOCKER 2）：AC29 是**双向**判据 —— `hasSchemaParam` 一为真就要求登记消失。
而删登记若排在后面的 Task，**schema 加 `base` 的当轮就会全 suite 红** ⇒
⇒ **删登记必须与 schema 改动同一步**（不早不晚）。

## D7. 本 change **不**证明「LLM 真的会填 base」

静态层 + fake-ctx 管道测试最多证明**管道通**（schema 接受、简报生成、校验生效），
**不证明**模型在派发时会主动填这个字段。

⇒ 明确登记为 known boundary，不在 DoD 里暗示已覆盖。真正证明需一次真实模型派发
（e2e，吃额度），属 `rdd-workflow-e2e` 的 CS 系列。

⚠ **但 D7 不覆盖「通道输出可被消费」**：那部分由 **AC2 的端到端静态闭环**证明 ——
从 `buildBrief` 输出解析出 sha，在 fixture git 仓真跑 `git merge-base HEAD <sha>` ⇒ exit 0。
（这一条不需要 LLM。）

## D8. 为什么 `dispatch` 必须同批

`dispatch` 的 schema 是 `additionalProperties: false`。若只给 `delegate` 加 `base`：

- plan 按新规则给 `dispatch` 传 `base` ⇒ **schema 硬拒**（不是「忽略」，是报错）；
- 而 `dispatch` 与 `delegate` 共用 `validateBrief` / `buildBrief` / `assertRoleClassCompatible` ⇒ 语义必须一致。

⇒ 两处 schema 同一 commit，AC1 钉住两处。

⚠ **两条链路的拒绝顺序结构上不可完全拉平**：`delegate` 在 create 前查占槽、无全局上限；
`dispatch` 有全局上限且占槽判定在 create 之后 ⇒ 同一输入（占槽忙 + 缺 base）两条链路给的**第一错误**不同。
这是既有路径差异的延伸，**不是本 change 造的** ⇒ 接受为代价（AC12 只钉「base 在 scope 之后」这一共同点）。

## D9. 消费端的三点 diff 缺陷：**登记，不在本 change 修**

`build.md:343` 的 `git diff --name-only <base>...HEAD` 是**三点 diff（只比已提交）**，
而本仓后端**被禁止 commit** ⇒ 未提交工作树下该 diff **恒为空**（已实测）⇒
「取证对象是否被本 change 触及」永远得到「未触及」。

**该缺陷先于本 change 存在**（存量靠 `constraints` 塞基线的简报同样中招）⇒ **另立 change** 修：
那是「committed-range → 工作树」的语义迁移，需要自己的决策记录与「未提交改动下仍有判别力」的验证 fixture。

⇒ 本 change：**价值定位降级**为「通道保证 ref 可解析 + 可机械核」，
并在风险表 + 已知边界各登记一条（含后续 change 的 todo）。

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| **破坏性**：今天靠 `constraints` 塞基线的 verifier 派发**能跑通**，本 change 后**被硬拒** | 有意收紧（消除 typo 白烧一轮）。写入风险表 + CHANGELOG，不当回归处理 |
| **破坏性**：`resume` 一个变更前创建的 verifier session 也须重填 `base`（`pair.json` 不存它） | 硬拒的错误文案**必须**含「resume 须由调用方重填 base」（D2 的唯一运行期兜底） |
| 非 git 工程被误拒 | D4 的 vcs 闸门 + AC6 回归断言 |
| annotated tag 被误拒 | D5 的 `^{commit}` peel + AC7 |
| resume 路径漏判 | D3 的校验位置 + AC8 |
| `git rev-parse` 版本差异 | `--end-of-options` 需 git ≥ 2.24；低版本回退到格式白名单（需记录实际版本） |
| **消费端三点 diff 恒空**（既有缺陷） | D9：登记 + 另立 change；本 change 的价值不依赖它（AC2 只证明输出可被第一条命令消费） |
| **回滚** | 删两处 schema 的 `base` + 恢复 `plan.md`/`front.md`/`build.md` 口径 + 把 `delegate-base` 登记条目加回 `KNOWN_UNIMPLEMENTED_CHANNELS`（**双向判据会强制这一步**，不会静默留空） |
