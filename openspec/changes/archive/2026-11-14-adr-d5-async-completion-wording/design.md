# adr-d5-async-completion-wording — 设计（落点与取舍）

> 判据真源：`proposal.md` 的「## 验收标准」表（AC1–AC14）
> 决策依据：`docs/adr/ADR-backend-handoff-role-class.md`（D5，**Accepted**）+ `prompts/build.md` §治理面作用域表 / §审查配对
> 性质：跨 ADR / prompts / 守卫 / changelog 四处 ⇒ 治理面双审。

## 1. 四项遗留合并的理由

| 项 | 问题 | 为什么与 ADR 措辞修订同批 |
|---|---|---|
| ① ADR D5「完成通知」措辞 | 工具契约里**没有推送通道** ⇒ 按字面等待 = 卡死 | 本体 |
| ② `prompts/plan.md` 临时消歧句 | 是 ① 的**补丁**（前提消失后冗余） | **必须**在 ① 之后删（否则消歧句失效而 ADR 仍说旧话） |
| ③ §治理面作用域表对本仓 `docs/adr/**` 的归属裁定 | 「改 ADR 要不要走 critic」每次重新判 | 决定 ① 这类改动的**审查路径** |
| ④ 「Accepted ADR 描述性措辞修订」判例 | 同类措辞漂移会复发（`docs/adr/` 12+ 篇） | ① 就是它的**第一个判例** |

⇒ 四者同主题（**架构类文档的落点与治理归属**）⇒ 一个 change、一次双审（而不是 4 次）。

## 2. 落点

| 段 | 文件 | 形态 |
|---|---|---|
| ADR | `docs/adr/ADR-backend-handoff-role-class.md` | D5「识别」条目 1 行改写 + 行尾修订注；「槽自动释放」补半句 |
| 规格件 | `.rddf/reviews/backend-handoff-protocol-spec.md` | 保留原文 + 行尾 `v4 修订` 注 + 自定口径段 `v4 = v3 + …` |
| 派发侧 | `prompts/plan.md` | 删消歧句 + 与 ADR 同口径 |
| 治理面 | `prompts/build.md` | 作用域表**新增裁定行** + **新增判例** |
| 守卫 | `tests/config-guards.test.ts` | 新增 describe（7 条断言，含**机械判据**：结论 ⇒ 审稿记录必须存在） |
| 台账 | `docs/CHANGELOG.md` | v2.22 条目（结论**回填**，不预断言） |

## 3. 关键取舍

| 取舍 | 选择 | 代价 / 边界 |
|---|---|---|
| ADR 措辞怎么写 | **纯观测式**（轮询 `sessions` → 读 `rddf feedback list`）+ **逃逸口径**（不必等 `state=idle`） | 「完成」不作为名词出现（ADR 标题本就是「handoff = 自然结束」） |
| `state=idle` 要不要保留为条件 | **不保留** | 槽位释放是 reconcile-on-read 惰性 ⇒ 该条件可能**永不满足**（oracle finding 2）⇒ 反而制造新的「字面等待」 |
| 规格件怎么改 | **用注不改写** | 保住 v3 审计痕迹；代价是文件里同时存在新旧两种表述（行尾注标明 v4） |
| 消歧句 | **删**（不是留在 plan.md） | plan 侧保留 ADR 的权威表述，不留第二份 |
| 归属裁定 | **新增一行**，不改表结构 | 右列预设「配置根 ≠ 项目仓」，本仓双重身份 ⇒ 显式读作 ADR 行（消歧，非重复） |
| 判例边界 | **可数正向句** + 排除清单 + **默认归槽** | 「描述性措辞」不可判 ⇒ 换成「只改同一条 bullet 的表述」；非豁免 ⇒ 默认按决策相关处理（举证责任在修订者） |
| CHANGELOG 何时写结论 | **审稿记录落盘后回填** | 守卫用 `existsSync` 机械判据：结论可写 ⇔ 记录存在 ⇒ 既禁预断言又允许如实记录 |

## 4. 顺序与验证

1. ADR D5 措辞 → 删 plan.md 消歧句 → 作用域裁定 + 判例 → 守卫 → 回归。
2. 验证：`bun test tests/` **507 pass / 0 fail**；anchors **23/23**；`openspec validate` 通过。
3. 治理面 ⇒ oracle → critic 各 1 轮（oracle 首轮 **BLOCK**，闭合后 critic `APPROVE_WITH_CONDITIONS`）。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 改 ADR 正文时误删决策内容 | `git diff --numstat` 形状判据（`2 2`：仅 D5 两行）+ 选项对比 / 后果 / Verification / Status **零改动** |
| 逃逸口径给假信号（后端其实还在跑） | 机制复核：`isRunning` 是活体判读；插件 re-dispatch 先 `claimSlot`（写侧及时）⇒ 契约内不可达；唯一窗口是「绕过插件直触后端」（`ADR-front-stop-confirmation:98` 已登记，后果有界） |
| 判例被当成绕过双审的后门 | 可数豁免条件 + **默认归槽**（不满足 ⇒ oracle → critic，举证责任在修订者）+ 守卫逐 token 钉 |
| CHANGELOG 再次预断言 | 守卫机械判据（`existsSync`）+ F2/F3 任务行 |
