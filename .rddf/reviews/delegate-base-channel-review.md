# 审稿记录 — delegate-base-channel（v2.31）

> **归档指针（2026-11-19）**：该 change 已归档为 `openspec/changes/archive/2026-11-19-delegate-base-channel/`。本文内出现的 `openspec/changes/<name>/…` 是**归档前的历史记述**（过程记录不回改）。
> 产物：`openspec/changes/delegate-base-channel/`（proposal AC1–AC14 / design D1–D9 / tasks Task 0–7）
> 实施：`lib/delegate-core.ts`、`lib/delegate-async.ts`、`prompts/{plan,front}.md`、
> `docs/backend-handoff-role-class.md`、`tests/{delegate-core,delegate-tool,delegate-async,config-guards}.test.ts`
> 治理面判定：触及 `prompts/**` + 守卫断言增删 + **公开契约 schema** + `docs/**` ⇒ **oracle → metis → critic**
> 日期：2026-11-15

## 1. change 的实质

`prompts/plan.md` 早就要求 verifier 派发「必须声明可解析的 `<base>`」，`prompts/build.md:343` 的后端确实消费它
（`git merge-base HEAD <base>` / `git show <base>:<path>`）—— 但**通道不存在**：
两个工具的 schema 都没有 `base`，`buildBrief()` 不生成基线行 ⇒ 派发方只能塞进 `constraints` 自由文本
⇒ **typo 穿过派发、白烧一整轮**；「声明了没有」不可机械核。

## 2. 审查链（三轮，每轮的结论都改变了产物）

### 第 1 轮：oracle（咨询）→ 11 条建议 / **5 个真实技术缺陷**

① `git rev-parse --verify --end-of-options <base>` 对 **annotated tag** 失败，而消费端 `merge-base` **会** peel tag
⇒ **误拒合法 base**（修法 `^{commit}`）；
② **红色窗口**：AC29 双向判据在「schema 加 base」当轮即红，而删登记排在 Task 9；
③ **dispatch 侧没有 `vcs` 变量**（`async:1154` 只解构 stateRoot/workRoot）⇒ 照抄 vcs 闸门编译不过；
④ **`buildBrief` 只有两参**（core:1416）⇒ 拿不到 vcs ⇒「无 VCS」行渲染不出来；
⑤ **AC4/5/7 的证据载体全是同步面** ⇒ dispatch 侧行为无判据钉住 ⇒ 会漂移。

### 第 1 轮：metis（gap 分析）→ P0-1..P0-6 / E1–E8 / **元层盲区**

**元层盲区（连 oracle 都没看到，已实测确认）**：`build.md:343` 的 `git diff --name-only <base>...HEAD` 是
**三点 diff（只比已提交）**，而本仓后端**被禁止 commit** ⇒ 未提交工作树下**恒为空**
⇒ 「取证对象是否被本 change 触及」永远「未触及」⇒ **基线对照在真实用法下没有判别力**。
⇒ 本 change 精心修好输入侧，却在服务一个坏掉的消费者。

其余关键项：**AC25/26 派生后会变成同源自证**（推翻了 oracle 的核心论据）；
**「front.md:141 指针失效」诊断错误**（节存在，只是节内缺值）；**resume 的 base 语义不守恒**
（相对 ref 会漂移）；**7 处「想当然的 Step」**（如「修 buildBrief 的 resume 分支」—— 它没有 resume 分支）。

### 第 1 轮：critic → **REJECT**（2 个 plan 档 BLOCKER）

- **BLOCKER 1**：AC12 判据**可被平凡满足**（行为版先天绿 —— `validateBrief` 丢弃未知键；结构版与 AC1 重复）
- **BLOCKER 2**：Task 1→9 之间 suite **必然红**且无 Task 认领修复（红色窗口 + 既有用例 `delegate-tool.test.ts:804` 未点名修订）

⇒ **9 条实施前必改**全部落地（AC 重排为 14 条 / 删登记挪进 Task 1 / base 闸门排在相容性校验之后 /
`^{commit}` peel / **采纳派发时解析成 sha** / 采纳 E1 端到端静态闭环 / 价值定位降级 + 登记消费端既有缺陷 /
修掉先天绿子句 / 补两个漏面 / knowledge 互斥 / 删 0.2 与瘦 Task 7）。change 文档提交于 `0557509`。

### 第 2 轮：oracle（实施后）→ `PASS-WITH-NOTES`（8 条建议全部落地）

- **AC8 两侧无测试**（tasks 计划了、实际没写）⇒ 补两条（resume 重填 ⇒ 含基线行 / 不填 ⇒ 硬拒）
- **dispatch 侧简报渲染无行为断言**（传参字面量在两个调用点各写一遍）⇒ 补
- `resolveCommitSha` 无 timeout + 错误归因被压成一种 ⇒ 补 `timeout: 5000` + 区分 `git-missing`/`unresolvable`
- AC2 的 raw↔sha 不对应（sha 取 HEAD 而 raw 写 HEAD~1）⇒ 改真实解析值
- tasks.md 签名句落后于实现 ⇒ 对齐
- **「跨 resume 用当初简报印出的 sha」对派发方结构性不可达** ⇒ 登记为残留 ⑪ + 加过渡兜底句

### 第 2 轮：critic → **`APPROVE_WITH_CONDITIONS`**（无 BLOCKER；4 条 SHOULD_FIX 全部落地）

① 「用当初简报里的 sha」是**过承诺**（简报只进后端 session，不在返回契约）⇒ 加兜底句「派发方自己 `git rev-parse` 记一份」；
② AC2 execute 面只断 sha 形态、不断**对应性**（防「恒解析 HEAD」退化）⇒ 补真值断言；
③ dispatch 侧 AC6 未断「无 VCS」行、AC5 未断**零副作用** ⇒ 补；
④ CHANGELOG 未落 ⇒ 已落 v2.31。

## 3. TDD 证据（先红后绿）

| 阶段 | 红灯（实测） | 绿灯 |
|---|---|---|
| AC1/AC10/AC3/AC4/AC9 | 5 条全红，**每条精确指向预期断言**（中途修正两处测试数据错误：假 `project_dir`、空 `scope` 会掩盖真正原因） | 5 pass |
| AC2/AC6（简报面） | 「简报缺基线行」/「非 git 工程应打印『无 VCS』」 | 3 pass |
| AC5/AC7/AC12（execute） | 「verifier 缺 base 应被硬拒」/「不可解析的 ref 应被硬拒」/「简报缺基线行」 | 5 pass |
| AC10（文档面） | 5 红 1 绿（front.md 找行命中错行 ⇒ 判据精确化） | 6 pass |
| dispatch 侧 | 「dispatch 的简报缺基线行」（另修正：fake ctx 存 `messages` 而非 `prompts`） | 全绿 |
| AC8 | **当场即绿**（实现本就正确）⇒ 另设计注入破坏证明判别力 | 见 §4 |

## 4. 判别力证明（AC8 当场即绿 ⇒ 必须另证）

注入「闸门改按 `brief.role_class`（**声明值**）判，而非 `effectiveRoleClass`（登记值）」⇒
**AC8-① 与 AC8-② 双红** ⇒ 还原后全绿 ⇒ AC8 有判别力（D3 的核心论证不再零覆盖）。

## 5. revert 演练（AC14）

9 条（A–I）**逐条精确命中**预期判据、还原后全绿 —— 留痕：`.rddf/reviews/delegate-base-channel-revert-map.md`
（含**诚实口径**：AC6 / AC7 未单独演练，及其原因）。

## 6. 验证

| 项 | 结果 |
|---|---|
| `bun test tests/` | **577 pass / 0 fail**（exit 0） |
| `bash scripts/check-upstream-anchors.sh` | **23/23**（exit 0） |
| `openspec validate delegate-base-channel` | **valid** |

## 7. 残留（如实登记）

1. **破坏性收紧**：今天靠 `constraints` 塞基线的 verifier 派发**会被硬拒**（有意收紧 ⇒ 消 typo 白烧一轮）。
2. **派发方拿不到实际用的 sha**（`base_resolved` 未进返回契约）⇒ 跨 resume 的「同一基线」句柄**结构性不可达**
   ⇒ 已加过渡兜底句；返回侧留独立 improvement（交接清单 ⑪）。
3. **消费端三点 diff 在未提交工作树恒空**（`build.md:343`，**先于本 change 存在**）⇒ 另立 change。
4. 非 verifier 填 `base` 被**静默丢弃**（不解析、不印行）—— 已知边界。
5. git 超时 / `ENOENT` 的错误归因粒度偏粗 —— 已知边界。
6. 「两链路第一错误不同」在占槽/全局上限处仍有差异（既有架构差异的延伸，非本 change 造）⇒ 接受为代价。
