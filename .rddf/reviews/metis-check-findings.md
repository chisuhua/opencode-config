# metis 检查记录（M1–M3）：是否需要与 oracle 同级别的改造

> 触发：用户问「metis subagent 是否也需要改进」
> 角色：architect（治理面）
> 日期：2026-11-12
> 结论：metis **不需要** oracle 那种结构性改造；仅 3 处小问题。用户决定 **M2 + M3 直接做**；M1 随后以**改措辞**（不加 severity 字段）关闭。

---

## 1. 取证（不靠推测）

| 手段 | 结果 |
|---|---|
| `prompts/metis.md` | 6 节输出契约**写在自己 prompt 里**（对比 oracle 改前：输出要求只在调用方 `build.md`） |
| 配置 description | `Pre-planning gap analyzer. Surfaces hidden intent, ambiguity, and AI failure points before a plan hardens.` —— 与用途一致 |
| 真实库 metis 子会话（109 个，`session_v2` + `session_message` 只读） | 有文本输出的 89 个：**6 节全中 76（85%）**、≥3 节 77（86%）；前 1200 字符带产物路径 101（92%）；前 400 字符含「审/复核/gap/差距」104（95%） |
| 输出分级词（`blocker/quality/nice-to-have`，含中文对应） | 88% 自带分级；**11%（10 个）完全没有** |
| 父会话 agent | build 41 / plan 2 —— 与「planner 是固定调用方、build 可直调」一致 |
| `grep -rn "Prometheus" prompts/ docs/ commands/ tests/`（排除 CHANGELOG） | **只有 `prompts/metis.md:7` 一处** |

**与 oracle 的差异**：oracle 的问题是「判定规则写在调用方、执行体不知道」（26% 治理面审查拿不到判定行）；metis 的契约在自己手里，且实测符合率 85%。**不构成同型缺陷。**

## 2. 三条 finding 与处置

| # | 严重度 | 内容 | 处置 |
|---|---|---|---|
| M1 | LOW | 严重度分级只写在 `prompts/metis.md` Rules（第 4 条），Output 6 节无字段承载它；11% 输出无分级 | **已关闭（改措辞，未加三档）**：`metis.md:31` 改为「建议按优先级排序：说明哪些必须先解决、哪些可以后置」，与 Output 的「按优先级排序」收敛为同一判据。理由：三档全仓零消费方（grep 唯一命中是文件自身）、73% 会话本就用替代分级、`blocker` 与 critic 的闸门词跨界。oracle 复审 `PASS-WITH-NOTES`，判定「不必按原案加 Output 字段」 |
| M2 | LOW | `prompts/metis.md:7` 引用不存在的 agent `Prometheus` | **已做**：改为 `planner`；保留 `build agent`（`build.md:40` 的 build 直调路径 + `MULTI-AGENT-DESIGN.md:555` 委派矩阵双重背书） |
| M3 | LOW | 6 节契约三处（`metis.md` / `build.md:64` / `MULTI-AGENT-DESIGN.md:157`）零守卫 | **已做**：`tests/config-guards.test.ts` 新增有序全等断言 |

## 3. oracle 审查（治理面，固定第一审查者）

判定：`治理面判定: PASS-WITH-NOTES`，4 条 finding：

| finding | 内容 | 处置 |
|---|---|---|
| 1 | M2 事实订正准确（planner 三处互证；build 半边仍成立；无新 stale 引用） | 无需动作。注记：`opencode.jsonc` 无 `planner` 实体，此处指角色 —— 与 `build.md:45/419` 词汇一致，非漂移 |
| 2 | M3 守卫有真实假阴性：① 未钉顺序；② 单向 `toContain` 允许消费者携带陈旧多余项；③ 卡片锚点是魔法字符串；④ `## Output` 取到 EOF；⑤（低）`MULTI-AGENT-DESIGN.md:917` 散文投影未守卫 | **①–④ 当场补强**（见 §4）；⑤ 记备查，不处理 |
| 3 | 变异验证主张与代码相符（无法重放，逐行推演一致） | 无需动作；本轮补做两条真实变异（§4） |
| 4 | M1 不做与 M2/M3 无矛盾（M3 钉结构、M1 是节内内容） | 无需动作（M1 后续以措辞收敛关闭，仍未新增节） |

## 4. 守卫补强与变异证据

补强（`tests/config-guards.test.ts`）：

- 真源：`metis.md` 的 `## Output` 段**截到下一个 `## `**（修 ④），取 `### ` 列表；
- 消费者：从 `build.md` 的 `| metis |` 行用 `Markdown 6 节：([^|]+)` **提取名单**后 `toEqual`（修 ① ②）；
- 投影：搜索域收敛到 `#### metis` 到下一个 `#### ` 之间，再用 `Markdown 六节（…）` 提取名单后 `toEqual`（修 ③）；
- 三处均为**有序全等**，多余项/乱序/缺项都会失败。

变异（真实执行，非推演）：

| 变异 | 结果 |
|---|---|
| `metis.md` 的 `### 边界情况` → `### 边界条件（变异测试）` | ❌ 失败，报「build.md 的 metis 名单与 metis.md 不一致（含顺序）」 |
| `build.md` 的 metis 行首两节对调 | ❌ 失败，同上 |
| `build.md` 的 metis 行追加第 7 项「旧节名」 | ❌ 失败，同上 |
| 全部恢复 | ✅ 20 pass / 0 fail |

## 5. 残留（交用户决定）

- **M1**：**已关闭**（2026-11-12）—— 不加 severity 字段，改为 `metis.md:31` 与 Output 的「按优先级排序」对齐。见 §6。
- **`MULTI-AGENT-DESIGN.md:917`** 文件树注释「metis.md # 70 行（Markdown 六节输出）」（行数同样会漂）—— 属散文投影，未纳入守卫；低影响。
- metis 仍**不设输入契约 / 不设判定行**（反证见本轮检查：92% 调用方自带产物、产出是改稿建议不是通过闸门；加判定会诱发判定通胀）。

## 6. M1 关闭（改措辞方案，用户选 A）

**改动**（`prompts/metis.md:31`，单行）：

```diff
-- 把 gap 分类：blocker / quality / nice-to-have
+- 建议按优先级排序：说明哪些必须先解决、哪些可以后置
```

**为什么不按原案（加 Output 字段）**：

| 判据 | 证据 |
|---|---|
| 三档无消费方 | `grep -rn "nice-to-have|nice to have" prompts/ docs/ commands/ tests/ lib/ scripts/`（排除 CHANGELOG）只命中 `metis.md:31` 自身 |
| 已有一句等价要求 | Output 末节：「对计划的具体修改建议，**按优先级排序**」；原 Rules 是同一件事的第二套词面 |
| 词面早就不统一 | 89 个输出：`blocker` 57%、`quality/nice-to-have` 46%、替代分级（P0–P3 / 高·中·低 / critical）73%、三套都没有 4% |
| `blocker` 是 gate 术语 | `build.md:85-88`：critic 的 BLOCKER 触发返工/复审；metis 无 `mergeable`、无 PASS/BLOCK，不是闸门 |
| 分级信号并不依赖词表 | 75 个含「建议修改」段：条目中位 17、`blocker` 中位 1、0 个会话全标 blocker ⇒ 新措辞的「先/后」显式陈述足以承载信号 |

**oracle 复审**：`治理面判定: PASS-WITH-NOTES`（无 BLOCKER）。三条判定：

1. 收敛成立 —— 旧状态是「分类机制」与「排序机制」两套正交判据；新状态两语句指向同一可满足条件（与 `oracle.md` 的 Strategy↔Output 复述结构同型）。
2. 不丢信息 —— 丢的只是未被消费的词面；新措辞从「标签采纳制」变成「显式陈述制」，对原 4% 零分级的覆盖更强而非更弱。
3. 不引入新歧义 —— 反而消除 `blocker` 与 critic 闸门词的跨界；「可以后置」被误读为「可以不处理」是低影响 latent 可能，暂不加括注（本轮不做）。

**critic 不审的依据**：本 patch 只改叙述性规则文字，未增删表格行 / 不变式条目 / 自查清单项 / 触发条件 —— 按 `build.md:422` 的 critic 必审判据不触发。

**残留**：`metis.md:31` 与 Output 末节是**同义复述**（house pattern，与 oracle 的 Strategy↔Output 一致），不是两份判据；如果未来两处再次分叉，M3 只钉 6 节标题，抓不到这处 —— 属已知的"叙述性文字无守卫"限制。
