# 审稿记录 — oracle-governance-scope-declaration（治理面）

> 审查对：`openspec/changes/oracle-governance-scope-declaration/`（AC1a–AC6；design D1–D11）
> 审查预算：**oracle 1 轮 + critic 1 轮**（「一次改动」口径）；无 BLOCKER ⇒ 无复审。
> ⚠ **自指审查**：本 patch 改 `prompts/oracle.md` 模式段与 `prompts/build.md` 审查配对
> ⇒ 按 `prompts/build.md`「自指审查」条，本轮审查结论**不构成独立证据**；
> 替代取证 = 静态守卫（`tests/config-guards.test.ts` 新族 + 突变）+ e2e 观察（AC5a/5b/5c）。

## 0. 意图检查点（architect 路径的等效记录）

- **意图陈述**：在调 oracle 前已给出（要解决的问题 = 猜测分支无操作判据 + E-A 实测证据链；
  范围边界 = 只改审查域选择机制、不改词表 / 不拒发 / 不碰结构化契约）。
- **metis**：本 change 的 metis 轮发生在 **planner 阶段**（立项草稿的 gap 分析，13 条 finding，
  4 条结构性缺口推翻初稿：修复本体是删猜测分支而非加字段 / 标注必须有关闭闸门的消费方 /
  自指审查 / 表格转义连锁）。oracle 调用前的检查点因此**不再触发 metis**（「歧义已枚举」分支）。
- **没有被派发后端**：本 change 在主会话实施，无 brief 缺意图问题。

## 1. oracle（第 1 轮）

- **判定行**：`治理面判定: PASS-WITH-NOTES`
- **自指报告（如实记录）**：oracle 实例自述注入的模式段**已是新版**（与 `prompts/oracle.md:43-63` 一致），
  不是调用方预期的旧版 —— 说明配置在子会话创建时被重新读取。无论新旧，本轮结论仍按自指审查
  **不构成独立证据**登记（结论与静态守卫 / e2e 观察并列）。
- **权限拒绝**：oracle 无 shell 权限，`bun test` / `openspec validate` 未执行（如实报告，不重试）。

### finding 逐条处置

| # | finding | 处置 |
|---|---|---|
| 1 | **AC4 文本漂移**：proposal 仍写「同 patch 修正 `:1125-1137` 转义连锁」，实施走 D7 结构规避 | **已修**：proposal AC4 改为「既有断言保持未改即绿（D7 结构规避：词表定义行置于表外 ⇒ 转义连锁不发生；若挪进表格 ⇒ 该断言当场红，迁移被拦）」；Acceptance 镜像同步 |
| 2 | **守卫盲区**：猜测分支只按单短语锚点，等价措辞可逃逸 | **已登记**（v2.40 族未覆盖清单新增一条；不升级为语义级检测 —— 成本远超收益，同族其余判据亦然） |
| 3 | **守卫盲区**：verdict 新硬条件的后果从句（⇒ 不得收口）零突变覆盖 | **已修**：新增判据「该行必须同句含『不得收口』」+ 突变「弱化成『记录后放行』」→ 必须红（第 12 条突变） |
| 4 | **verdict 位置语义不精确**：「见到 `判定:` 词表」未写明行首语义 | **已修**：改为「见到**判定行以 `判定:` 开头**（而非 `治理面判定:`）」 |
| 5 | **最弱环定位**（确认而非新发现）：标注不是承重墙；真正最弱环在两个行为层 | **接受**：AC5 观察项承担；e2e 报告已记录（见 §3） |

## 2. critic（第 1 轮，profile: build, plan）

- **结论**：`APPROVE_WITH_CONDITIONS` / `mergeable: yes` / `scope_exceeded: false` / **无 BLOCKER**
- **SHOULD_FIX（1 条，已修，不触发复审）**：第 3 层「前缀 ⇒ 治理面」与 `build.md` 的本仓特例
  （`~/.config/opencode/docs/adr/**` 不属治理面）对同一对象给出相反分类。
  - 修法：第 3 层改为「前缀 **∧** 按 `build.md` 作用域表属治理面」，并写明 `docs/adr/**` 例外；
    守卫第 3 层判别词从「前缀」改成「作用域表」；design D2 / 两处投影 / CHANGELOG 同步。
- **NIT（1 条，已修）**：`MULTI-AGENT-DESIGN.md` 复制了机读标注字面（无漂移守卫）。
  - 修法：改为「第 4 层标注（字面以 `prompts/oracle.md` 为真源）」。
- **critic 确认不成立的疑点**（记录以备查）：四层表与词表单一真源不冲突（单一真源自己的内容）；
  「审查不成立」不是第三态（与 v2.37 拒发共用处置）；front / plan 豁免与角色矩阵不矛盾；
  无新增 fail-open（漏标注 + `判定:` 仍被抓；漏标注 + `治理面判定:` 是 over-strict，无害；
  无判定行由 v2.37 覆盖）。

## 3. e2e 行为层证据（上游 `oracle-intent-gate-e2e`）

e2e 仓 `rdd-workflow-e2e` 的观察报告（`.rddf/reviews/oracle-intent-gate-e2e-observation.md`）：

| 用例 | 结果 |
|---|---|
| **E-A（加声明 `审查域: 其他审查`）** | **通过**：oracle 返回 `**判定: REJECT**`（其他审查词表）⇒ 上游 AC2 的「词表选错」缺陷在真实行为上**消失** |
| **AC5b 两态** | 词表两态都是 `other`；**第 4 层标注只在态②（删声明）出现** ⇒ 声明确实被识别（默认层同为 other，故词表不变） |
| **AC7-①/①b（零模型变红演练）** | **通过**：删词表 / 删意图前提段 ⇒ 派生失败且指出缺哪一段（锚点已随 v2.40 的词表格式更新） |
| 门控三档 | 实测命中：一次父会话超时（`exit 124`）⇒ **skip 未判定**（不得当绿）；一次 `provider.rate-limit` ⇒ skip 不重试 |

⚠ **观察项纪律**：AC5b 是 N=1，**不排除采样噪声** ⇒ 只登记、不 fail（与上游 E-B 同型降级）。
⚠ **跑的是工作树文本**：观察表 `SC_SRC` 列记 `a4ea85b+dirty`（`prompts/oracle.md` / `prompts/build.md`
有未提交改动）—— `+dirty` 标记由 `oig_report_row` 计算，避免把 HEAD 误读成「跑的就是已提交文本」。

## 4. 预算与遗留

- 已用轮次：oracle 1 / critic 1；BLOCKER 0 ⇒ 未使用复审额度。
- 遗留（不在本 change 修）：① 「判定对象属治理面」类**等价措辞**的守卫逃逸（靠 review）；
  ② 结构化契约路线（`subagent-contract` 纳入 oracle）另立 change；③ 上游 `AC7-②`（需 hermetic HOME）。
