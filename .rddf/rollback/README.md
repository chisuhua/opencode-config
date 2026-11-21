# `.rddf/rollback/` —— 机制退役的回滚清单

每个文件 = **一个机制**的「退役脚本」：`delete`（要删的文件）+ `edits`（逐段改回原措辞）。
由 `scripts/rollback-drill.ts` 在**隔离 clone** 里执行，再跑清单声明的验证命令。

## 用法

```bash
# 只检查清单在当前内容上是否可执行（find 恰好 1 次 / delete 目标存在 / 不同路径重叠）
bun scripts/rollback-drill.ts .rddf/rollback/<mechanism>.json --dry-run

# 真演练：clone → 应用清单 → 跑验证命令（默认 `bun test tests/`）
bun scripts/rollback-drill.ts .rddf/rollback/<mechanism>.json

# 保留副本取证（打印路径）
bun scripts/rollback-drill.ts .rddf/rollback/<mechanism>.json --keep
```

退出码：`0` 通过 / `1` 失败（清单漂移或验证红）/ `2` 跳过（非 git 仓、clone 失败、嵌套调用）。

## 清单格式

```jsonc
{
  "version": 1,
  "mechanism": "commit-gate",          // 与文件名一致
  "adr": "docs/adr/….md",              // 决策真源（人读）
  "notes": "覆盖面 + 保留项 + 为什么",  // 人读；drill 不解析
  "delete": ["plugins/x.ts"],           // 仓库内相对路径；目标必须存在
  "edits": [{ "path": "prompts/x.md", "find": "…", "replace": "…" }],
  "retire": ["mech-a"],                  // 结构化退役：把这些机制在 registry 里转 `retired`
  "drill_env": {                        // 演练环境准备（不属于回滚步骤）
    "seed_files": [{ "path": ".rddf/state/role.json", "content": "…" }]
  },
  "verify": { "commands": [["bun", "test", "tests/"]] }
}
```

**判据（fail-closed，实现在 `lib/rollback-drill.ts`）**

- schema 非法 ⇒ 拒；
- `delete` 目标**必须存在**（不存在 ⇒ 清单已漂移）；
- `edits.find` 在**运行中的内容**里必须**恰好出现 1 次**（0 次 = 已漂移；≥2 次 = 无从确定改哪处）⇒ 清单与代码**同漂**，措辞一改就红，不会静默变 no-op；
- `delete` 与 `edits` **不得指向同一路径**（判同键 = `path.posix.normalize`，`./a.txt` 与 `a.txt` 视为同一路径）；
- `retire[]`（**结构化退役**，ADR 第 7 轮 / V16）⇒ 六条 fail-closed：registry 存在可解析、条目存在且组内不重名、来源态 ∈ {`active`,`proving`}、同清单归属、与「删整个登记面」互斥、与「edits 触碰登记面」互斥；**校验材料 = 应用前的 registry 原文**（转态按**身份**、不按可变字段 ⇒ 无状态自指）；
- **不做部分应用**：先全内存模拟（同一个文件的多条 edits 按声明顺序作用在运行中的内容上），全过才落盘。

**安全**：只在 `mkdtempSync(tmpdir())` 下的 clone 里动手（断言副本路径 ≠ 真仓）；验证命令带 `ROLLBACK_DRILL_CHILD=1`，嵌套调用默认拒绝。

**drill 基于 HEAD**：`git clone` 只含**已提交**内容 ⇒ 未提交改动不参与。改完清单要**先提交**再跑，否则测的是旧 HEAD。

## 与默认套件的关系（零成本漂移守卫）

`bun test tests/` 里有一条 `tests/rollback-manifests.test.ts`：用**同一个判据**（`planDrill`）在**当前工作树**上做内存校验（毫秒级、零写盘）—— `delete` 目标存在 / `find` 恰好 1 次 / 无路径重叠 / `mechanism` 与文件名一致 / `adr` 存在 / `verify` 非空。

⇒ 任何改动让某条清单漂移，**本次 `bun test` 立刻红**，不必等有人想起来跑 drill。

⚠ 它在 drill 的副本里**跳过**（`ROLLBACK_DRILL_CHILD=1`）：副本正是「清单已执行完」的状态，`find` 必然不再匹配 ⇒ 在那里跑会恒红。**真演练**（clone + 跑验证命令，≈30s/清单）仍按需手动执行 —— 本守卫证明「清单**现在**可执行」，drill 证明「执行后**仓库仍自洽**」，两者不能互替。

## 机制登记表（`registry.json`）—— L2 强制化

**它回答什么**：不是「已有的清单能不能跑」（那是上面的漂移守卫），而是「**该有的清单在不在**」：

```bash
bun scripts/rollback-registry.ts            # 人读：五态 census + 逐条报错（带判据编号）
bun scripts/rollback-registry.ts --json     # 机读
```

退出码：`0` 全绿 / `1` 有判据不通过 / `2` registry 缺失或 schema 非法（**不可判定**，不当通过）。

**组清单（1:N）**：机制之间存在**不可拆的内核耦合**时，退役必须同批 ⇒ 一份清单覆盖**一组**机制。
⇒ registry 条目用 **`manifest_ref`** 指向所属清单（`active` / `proving` 必填）；**多个机制可指向同一份清单**；
清单的 `mechanism` 字段 = **组名**；清单用 `adr` ∪ `adr_related[]` **逐条声明**组内各机制的决策记录
（M2 的**集合相等（双向）**：清单声明集 == 指向它的条目的 `adr_primary` 集 ⇒ 既不能声明没人指的 ADR，也不能漏声明）。
⚠ **组的边界是评审面**（ADR 的 U11）：须给出**调用点行号级依赖证据**；组划错 ⇒ 退役会连带撤掉不该撤的东西。

**存量债的分组（实测内核耦合 ⇒ 3 组）**：

| 组 | 成员 | 为什么同组（证据） |
|---|---|---|
| **G1 `delegate-slot-kernel`** | `front-multi-backend` / `front-stop-confirmation` / `front-stop-ownership` / `front-cancel-release` | `cancel`（CR）调用 `waitStopped`（SC，`lib/delegate-async.ts:2369`）与 `releaseSlotAuthorized`（SO，`:2451`）；`markCancelPending`（CR，`:2575`）是 MB 的 reconcile 排除条件 |
| **G2 `delegate-knowledge-delivery`** | `front-knowledge-capability` / `delegate-delivery-evidence` | 共用 `kind` 契约与 ledger / `outcome` 枚举 |
| **G3 `role-class-write-set`** | `backend-handoff-role-class` / `class-write-scope-alignment` | 共用 `classAllowRoots`（`lib/delegate-core.ts:903`）与 3 份 prompt 的同一行 |

⚠ 另有 **2 条已判为「退役 = 重写」⇒ 豁免**（`no-single-baseline`，证据 `.rddf/reviews/rollback-exempt-role-identity-canonical.md`）：
`role-session-identity` / `canonical-root-normalization` —— 教学面落在 `prompts/build.md` 的**原生**角色矩阵段内（实测删段 ⇒ 39 处红 + 引用悬空 ⇒ 没有 `find/replace` 形态），且连带面落在**已登记为 active 的机制**上 ⇒「回退到先前状态」的前提不成立。

**六态**（判据编号见 `docs/adr/ADR-rollback-manifest-enforcement.md` 的 M1–M9）：

| 状态 | 含义 | 清单 | 证据 | 债指针 |
|---|---|---|---|---|
| `declared` | 已签、**未落地** | 无 | — | — |
| `unmanifested` | **机制在跑、清单待写**（存量债） | **不得有** | — | **必填**（`pending/<mechanism>.md`，逐机制命名） |
| `proving` | **过渡态**：已落地、清单已写、**演练证据待回填** | 必填 | 可缺失（存在即须新鲜） | — |
| `active` | 已落地 + 清单齐 + **演练证据齐且新鲜** | 必填 | 必填 | — |
| `retired` | 已退役 | **不得有** | `retired_at` + `retired_evidence` | — |
| `exempt` | **该机制不该有清单**（闭集 5 类） | **不得有** | `exempt_class` + `exempt_evidence` | — |

⚠ **`proving` 为什么存在（自举死锁）**：机制落地的那个 commit 里，条目无法同时满足
「`declared` 的 watch 路径尚不存在」与「`active` 的演练证据已回填」——
**证据只能由已提交的清单跑出来 ⇒ 必然晚一个 commit** ⇒ 没有过渡态就永远转不了 `active`。
⇒ `proving` = 清单已写、机制已落地、**演练待跑**；回填证据后转 `active`。

**债指针**（`pending/<mechanism>.md`）：`unmanifested` 机制的**逐机制**欠账说明（为什么还没写 / 清单要覆盖哪些落点 / 锚点在哪）⇒ 债**可见、可清账**（写完清单 ⇒ 删债文件 + 条目转 `active`）。
⚠ 债**不是豁免**：`exempt` = 「不该有清单」，`unmanifested` = 「该有但还没写」⇒ 两者表态成本相同，但机器前提不同（`exempt` 要**闭集理由 + 证据**，`unmanifested` 要**逐机制债指针 + 在跑锚点**）。

**守卫**：`tests/rollback-registry.test.ts`（零成本：只读文件 + 内存比较，不 spawn / 不跑 drill / 不 clone）；
判据本体在 `lib/rollback-registry.ts`（纯逻辑层，**ADR 是决策真源**，两处口径冲突回 ADR）。

## 现有清单

| 清单 | 机制 | 规模 | 实测 |
|---|---|---|---|
| `commit-gate.json` | commit 工具层验证门（`ADR-commit-verification-gate`） | delete 9 + edits 29 | `809 pass / 0 fail`（隔离副本） |
| `plan-topics.json` | plan 侧多会话协作：`plan-worker` + topic checker（`ADR-plan-multi-session-collaboration`） | delete 4 + edits 14 | `983 pass / 0 fail`（隔离副本） |
| `plan-delegate.json` | plan 侧工程派发（`ADR-plan-delegate-engineering-session`）—— **能力面**退役 | delete 0 + edits 48 | `1024 pass / 0 fail`（隔离副本） |
| `model-fallback.json` | 模型降级链插件（**无 ADR** ⇒ 决策真源 = 验收报告） | delete 5 + edits 14 | `998 pass / 0 fail`（隔离副本，零悬空引用） |
| `delegate-slot-kernel.json` | **G1 组清单**（delegate 槽位 / 停机 / 归属 / 取消释放内核链 ⇒ 4 机制同批退役） | delete 5 + edits 35 + retire 4 | 见清单的 `last_drill` |
| `delegate-knowledge-delivery.json` | **G2 组清单**（知识后端 `kind` + 交付证据 ⇒ 2 机制同批退役） | delete 2 + edits 76 + retire 2 | 见清单的 `last_drill` |
| `role-class-write-set.json` | **G3 组清单**（`role_class` 选类能力 + verifier 写集 ⇒ 2 机制同批退役；**退役能力、保留字段**） | delete 2 + edits 126 + retire 2 | 见清单的 `last_drill` |
| `rollback-manifest-enforcement.json` | **L2 强制化机制自身**（退役 = 撤守卫 + 删 registry + 删本清单） | delete 9 + edits 3 | 见清单的 `last_drill` |

> **清单清单以 `registry.json` 为准**（L2 强制化）：本表只是**人读摘要**，改清单/改机制都先改 registry。

## 「骨架机制」怎么退役（plan-delegate 的实测结论）

`plan-delegate` 是第一个**触到骨架**的清单 —— 但它能做，靠的是「**有回退基线**」（plan 的五项 delegate 放行是 2026-11-13 才加的），不是「它是能力面」。

- **能做**：配置关闸（撤 plan 的五项 delegate 放行）+ 代码回退一处（`sessions` 的 owner 过滤）+ 退役 prompt 的**发起侧**教学（通道 / 选类表 / 派发参数 / 硬规则）+ **20 余处守卫从「两个主体」收窄为「一个」**。
- **不能做（不属清单能力范围）**：退役**内核**（D2 `plan_ref` / D5 `owner_agent` / D7 优先级 / `role_class`）—— 那要连带回退四个其它 ADR 的增量（≈11k 行代码与测试）⇒ 是**重构**，不是清单。
- **代价**：① 守卫覆盖面**变窄**（对象从 front+plan 变成 front）⇒ 这是**收窄**，不是放宽 —— 但每处收窄都是一次判断（本次 48 条 edits 里 20 余条是这类判断）；② 退役后 `plan.md` 的**消费侧**三小节成为**死教学**（plan 不再派发却仍在讲怎么读派发结果）⇒ 登记为残留。
- **教训**：ADR 的「回滚口径」是**写它那天**的快照。实测（留痕 `.rddf/reviews/plan-delegate-rollback-drill.md`）：「三步即可回到现状」**形式上成立**（三步 + 3 处同步 ⇒ 套件可绿），**实质上已半退役**（prompt / 文档 / 守卫仍宣称 plan 能派发 ⇒ prompt 与权限层互相矛盾 ⇒ 复现 v2.44 事故形态）⇒ 判据不是「套件绿不绿」，而是「prompt / 文档 / 守卫是否还在宣称那个能力」。

## 保留项（实测得出，不是偏好）

回滚**退役的是机制**，不是决策记录本身 —— ADR / CHANGELOG / 评审报告一律保留。除此之外，以下**必须保留**，否则套件红：

- `tests/commit-gate-d9-registration.test.ts`（commit-gate 的 V10 载体）与 `.rddf/commit-gate.json`（门禁声明）—— 各有守卫断言其存在；
- `docs/MULTI-AGENT-DESIGN.md` 的 §2.8.8（D9 索引段）与 §3.4 的 **D9⑯ 指针行** —— 载体用例以「索引段之外仍提到 D9⑯」为前提。
- `.rddf/plan-topics/**` / `.rddf/state/plan-sessions.json`（plan-topics）—— 已落盘的协作文档是版本化产物，退役后停止写入即可。

## 机制 ⇒ ADR **并不成立**（实测）

`model-fallback` **没有 ADR**（它的验收报告自述「本仓库无 ADR（§arch-docs 判定态 3）」，决策记录 = 该报告）。
⇒ 本仓存在**无 ADR 的机制** ⇒ 清单的 `adr` 字段允许指向**验收报告 / 其他决策记录**（`model-fallback.json` 即指向 `.rddf/reviews/model-fallback-verify.md`）。
⇒ 这同时暴露了 `ADR-rollback-manifest-enforcement` 的 **M2 口径缺口**：`adr_primary`「必须落在 `docs/adr/`」对这类机制**不成立** ⇒ 该机制无法合法登记 ⇒ **已补口径**（2026-11-21 第 3 轮增量）：M2 的指针闭集改为「**决策记录闭集**」= `docs/adr/` ∪ `.rddf/reviews/*-verify.md`（指针**语义**是否对应本机制归评审，见 U8）。

## 哪些机制适合做清单（边界）

**真正的判别式不是「能力面 vs 内核」，而是「有没有回退基线」**：

| 机制类型 | 可做清单？ | 为什么 | 实测样本 |
|---|---|---|---|
| **后加机制**（有「引入之前」的状态可回退） | ✅ | 回退目标是一个**真实存在过**的状态 ⇒ 逐段 `find/replace` 即可到达 | `commit-gate` / `plan-topics` / `plan-delegate` |
| **原生机制**（自初始提交就在） | ❌ | **没有回退目标** ⇒ 所谓「退役」= 从零设计一个没有它的状态 = **重写** ⇒ 需 ADR + change，不是清单 | `role-gate`（见下） |

**原生机制的实测数据（2026-11-20，隔离副本）**：
- `## 角色矩阵` 段在 `prompts/build.md` 里 **608 行**、97 处 `role` 提及；删掉它 ⇒ **39 处红**（而 `plan-delegate` 的「三步」只有 4 处红）。
- `git log --diff-filter=A -- prompts/build.md` ⇒ 最早版本 = **`132f389`（初始提交）** ⇒ 角色系统**没有「之前」**；`auto_switch_window` / 授权窗口同样自 `132f389` 起就在。
- 删掉后会留**悬空引用**：`## 输出`、`§HANDOFF`、`§越权处理` 都 `⇒ 按 §需要用户裁决时 …`，而该节在角色段内 ⇒ 必须**重写**这些引用，不是删掉就完。
- `role_class` 增量同样不可清单化：跨 **19 个文件**（`lib/delegate-core.ts` 64 处、`tests/delegate-core.test.ts` 58 处）；其 ADR 的回滚口径是「**停传** `role_class`」（**运行期用法**），不是代码/文档回退。

⇒ **结论**：清单适合**后加机制**（能指出「退回到哪天」）；**原生机制**的退役是一次**产品形态变更**，必须走 ADR + change。

⚠ **清单之间会耦合**：每个清单只对**它写就时的树**有效；在真实仓执行过一次回滚后，其它清单可能因措辞已变而失效（`tests/rollback-manifests.test.ts` 会立刻红）。回滚是**单向**操作。
