# 审稿记录 — 对齐完备性 P0（描述面枚举闭集）

> 产物：`tests/config-guards.test.ts`（新 describe「对齐完备性」AC25–AC29）、`lib/delegate-core.ts`（description 派生化）、
> `prompts/plan.md` / `prompts/front.md`（kind 词表 + 派发参数）
> 治理面判定：触及 `prompts/**` + 守卫断言增删 + `lib/**` 公开契约面 ⇒ **oracle → metis → critic**（本批 critic 1 轮）
> 日期：2026-11-15

## 1. 起因：为什么「测试全绿」还会不对齐

用户三连问（「对齐了吗」→「为什么测试全绿还是不对齐」→「建能找出不对齐的测试」）指向同一个结构性成因：

> **v2.28 的三层对齐，其「对齐模型」本身不完整。** 守卫只证明了模型内部自洽（真源 ⇄ 两个派发方 prompt 的返回字段），
> 而同一事实的**第三、第四个投影**（工具 description、HANDOFF kind 词表、派发参数表）从未进入扫描集。

⇒ 测试全绿 = 「我定义的那几条关系没漂」，**不证明**「关系的清单是齐的」。

## 2. 五条判据（先红后绿）

| 判据 | 判什么 | 真源（运行时派生） | 修前红灯 |
|---|---|---|---|
| AC25 | description「返回」子句必须**派生**（源码无字段名字面量）+ 值 pin | `DELEGATE_RESULT_FIELDS` / `_CRITICAL_FIELDS` | `出现非契约字段：最后回复` |
| AC26 | description「选填」子句必须**派生** + 值 pin | `schema.properties − required` | `漏了参数：role_class` |
| AC27 | plan.md + front.md 都必须覆盖 HANDOFF kind | `build.md` §HANDOFF（与 AC3 同源） | `plan.md 未覆盖：ac-fail, needs-revision` |
| AC28 | 两个派发方都必须覆盖必填参数名 | `schema.required` | `plan.md 未提及：project_dir, goal` |
| AC29 | 派发要求必须有实现通道，或**已登记**（双向） | schema + `buildBrief()` + 登记表 | `无 base 参数、无基线行` |

## 3. 三方审查（oracle → metis → critic）

用户指令：`@oracle + @metis -> @critic 给出建议`。

### oracle（咨询）：3 批方案
A+B 派生 / C+D 副本 / E schema 加 `base`（含 rev-parse 校验）。**新发现**：`build.md:343` 的基线消费方真实存在（后端跑 `git merge-base`）。

### metis（gap 分析）：4 条事实指控，**全部核实属实**
1. **AC25/26 派生后会变成同源自证**（比较 X 与 X ⇒ 恒绿）。
2. 同一函数还有 3 处同款手抄（`:1975` agent 白名单 / `:1996` grant 禁区 / `:2008` enum），真源常量都在 lib。
3. `buildBrief:1422` 也手抄了一份 kind 枚举；`dispatch` schema 无 base 且 `additionalProperties:false`（会硬拒）。
4. 「front.md:141 指针失效」**诊断错误** —— 节存在，只是节内缺值。

### critic（裁决）：`APPROVE_WITH_CONDITIONS`，无 BLOCKER

| 冲突 | 裁决 |
|---|---|
| AC25/26 空转绿 | **双方各对一半**：值 pin 对「改回手抄」仍有效，但元判据层面归零 ⇒ **形态约束为主**（源码扫描：description 不得含字段名字面量）+ 值 pin 为次；**不做**全量快照（会锁死 gloss 文案） |
| kind 副本 vs 指针 | 诊断归 metis、**形态归 oracle**：用副本 + 派生比对（仓内既有 idiom）；同时在 `plan.md` 的 kind 表补给「收到后怎么路由」 |
| resume 的 base | **metis 正确**：base 是**派发参数**不是继承上下文 ⇒ resume 由调用方重填；校验下移到 `execute` 的 `effectiveRoleClass` 之后（E 批落地） |
| scope 是否扩 | **3 处同款本批做**（不做则「闭集」是假话）；`dispatch` base 跟随 E 同 PR；`buildBrief:1422` + delegate-async 两处**登记 follow-up** |
| gloss 机制 | `satisfies` + 运行期断言；critic 点破 `readonly string[]` 会让 `satisfies` 退化成同义反复 ⇒ 注释如实声明约束强度 |
| 「返回：」标签 | 改「返回（**关键字段**）…」+ 全集指针（不改 = 用更大的谎换小谎） |

## 4. 落地内容

### lib（`lib/delegate-core.ts`）
- 新增 `CRITICAL_FIELD_GLOSS`（7 个关键字段的一句话语义）+ `assertGlossCoverage()`（键集合**双向**相等 + 分隔符/嵌套括号校验，报错同时打印「缺」与「多」）+ `renderReturnClause()`（**唯一实现**）。
- `delegateToolDefinition()`：`input` 提升为局部变量 ⇒ description **完全派生**（必填/选填从 `required`/`properties` 现算；返回从 `renderReturnClause()`）；标签改「返回（关键字段；全集见 `DELEGATE_RESULT_FIELDS`）」。
- 三处同款手抄一并派生：agent 白名单 ← `ALLOWED_AGENTS`、grant 禁区 ← `GRANT_FORBIDDEN`、`enum` ← `ROLE_CLASSES`（渲染结果与原文逐字一致，证明派生正确）。

### prompts
- `plan.md`：kind 微表（3 行：值 / 后端在说什么 / 你的动作）+ 「派发参数」段（5 个必填名 + 指向 front.md 与 description，**不复制**）。
- `front.md`：`HANDOFF` 条目补 kind 三个值。
- ⚠ kind 微表**放在「交回后的收尾三问」段之前**：既有守卫 AC7（resume-precheck 投影）对该段有「不许出现新标识符」的负向约束 ⇒ **不动它的白名单**（会削弱防护），改为把表移到段外。

### 判据
- AC25/AC26：**形态约束（主）+ 值 pin（次）**；扫描范围锚定到 `delegateToolDefinition` 的 description 表达式（找不到 ⇒ 抛错，fail-closed）。
- AC27/AC28：真修 prompt（不是改判据）。
- AC29：**双向登记式** —— 无通道 ⇒ 必须已登记；通道落地后仍留登记 ⇒ 红。登记表 `KNOWN_UNIMPLEMENTED_CHANNELS` 含 `gap`/`impact`/`todo`（指向 `delegate-base-channel`）/`registered_at`。

## 5. 验证

| 项 | 结果 |
|---|---|
| `bun test tests/` | **550 pass / 0 fail**（exit 0） |
| `bash scripts/check-upstream-anchors.sh` | **23/23**（exit 0） |
| **逐条 revert 映射表**（critic 要求） | A→AC25 / B→AC26 / C→AC27 / D→AC28 / E→AC29，**每条精确命中、还原后全绿** ⇒ 无空转绿 |
| **「抄得完全正确的手抄体」** | 把返回子句换成 7 项全对、顺序对的手抄 ⇒ **AC25 仍红**（报错精确指向「必须调用 `renderReturnClause()`」）⇒ 形态约束有判别力，值 pin 做不到这一点 |
| 人读检查 | description 全文可读（关键字段带一句话语义，不是裸字段名列表） |

## 6. 残留（如实登记）

1. **AC29 的绿 = 已登记，不是已修**。`<base>` 仍无通道；E 另立 `delegate-base-channel`（含 delegate + dispatch 同步、`buildBrief` 基线行、`execute` 后验硬拒 + vcs gate + 注入加固、resume 调用方重填）。
2. **`buildBrief:1422` 手抄 kind 枚举**未修（后端实际读的投影）—— 登记 follow-up。
3. **`delegate-async.ts:1104` / `:1507` 手抄返回清单**未修 —— 登记 follow-up。
4. `DELEGATE_RESULT_CRITICAL_FIELDS` 仍是 `readonly string[]` ⇒ gloss 的 `satisfies` 无编译期约束（运行期断言兜底，注释已如实声明）。
5. AC28 只判**必填**参数名 ⇒ `plan.md` 未提 `grants`（选填语义）判不出。
6. AC25/26 的形态约束锚定函数位置 ⇒ 函数重构会抛错（fail-closed，需人更新判据）。
