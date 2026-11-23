# Design — rollback-manifest-find-narrowing（段 A 解 pin + 守卫 · 段 B 写集机读投影）

> 判据真源 = `proposal.md` 的 `## 验收标准` 表（AC1–AC15）。本文只给**实施形态**：格式定义、拆分策略、落点选择、纪律。
> 本文件由**实施者（builder）**定稿 —— `rdd-builder` **not_owns** `design.md`（工件归属规则：执行该 change 的 agent 写）。

## 1. 段 A：形态守卫的判据形态

### 1.1 三个指标（逐清单计算）

```ts
/** 单条 find 的形态指标。 */
function findShape(find: string) {
  const lines = find.split("\n")
  // ① 表格分隔行：| --- | --- | 这种（整行只有 - / : / | / 空白）
  const sep = /^\|[\s:|-]+\|$/m.test(find)
  // ② 「| 起始的连续行」最大段长 > 1
  let run = 0, maxRun = 0
  for (const l of lines) {
    if (l.startsWith("|")) { run++; maxRun = Math.max(maxRun, run) } else run = 0
  }
  return { sep, pipe: maxRun > 1, len: find.length }
}
```

⚠ **`pipe` 是「连续」**：`find` 里两段表格行被散文行隔开 ⇒ 各自算 1 段 ⇒ 不触发。判据要堵的是「**一张**表被整块 pin」，不是「文件里出现多张表」。
⚠ **`sep` 与 `pipe` 是两道不同的闸**：`sep` 抓「含分隔行」；`pipe` 抓「分隔行之后的数据行被整块覆盖」——**从分隔行之后开始、避开分隔行**是 `sep` 抓不到而 `pipe` 抓得到的绕过路径 ⇒ 两道都要。
⚠ **已知绕过面（缩进表格行）**：`pipe` 用 `startsWith("|")` ⇒ 前导空格的 `  | …` 行**不计入**；`sep` 的正则 `/^\|[\s:|-]+\|$/m` 同样不匹配缩进行 ⇒ **缩进表格行是两道闸的共同盲区**。本仓表格**无缩进风格**（T0d 顺手统计全仓 361 条 `find` 的缩进表格行数，若为 0 则登记为「已知盲区 · 本仓不适用」；若非 0 ⇒ 必须改判据）。**不为此引入新机制**（避免为不存在的场景造机制）。

### 1.2 基线表（不是豁免白名单）

```ts
const MAX_FIND_LEN = 2894   // 当前 361 条 find 的 p95；恰为 delegate-slot-kernel 的当前最大值

/** 未收敛清单的**已知违规基线**（实际值 ≤ 基线值；不许增加）。收敛一项 ⇒ 从表里移除一项。 */
const FIND_SHAPE_BASELINE: Record<string, { sep: number; pipe: number; maxLen: number }> = {
  "delegate-knowledge-delivery.json": { sep: 0, pipe: 2, maxLen: 6524 },
  "delegate-slot-kernel.json":        { sep: 5, pipe: 6, maxLen: 2894 },
  "model-fallback.json":              { sep: 1, pipe: 2, maxLen: 3003 },
  "plan-delegate.json":               { sep: 1, pipe: 1, maxLen: 4849 },
  "plan-topics.json":                 { sep: 1, pipe: 1, maxLen: 5229 },
  "role-class-write-set.json":        { sep: 3, pipe: 3, maxLen: 8844 },
  "rollback-manifest-enforcement.json":{ sep: 0, pipe: 1, maxLen: 500 },
  // ⚠ **只 7 项**：`commit-gate.json` 已达标（sep=0 / pipe=0 / maxLen=2067）⇒ **刻意不登记**
  //   （登记它反而允许它退化）；`governance-paths-config.json` 亦不登记（段 A3 后必须已达标）
}
```

判定：

```
baseline(M) = FIND_SHAPE_BASELINE[M] ?? { sep: 0, pipe: 1, maxLen: MAX_FIND_LEN }
断言：actualSep(M) ≤ baseline.sep ∧ actualPipe(M) ≤ baseline.pipe ∧ actualMaxLen(M) ≤ baseline.maxLen
```

⚠ **`commit-gate.json` 刻意不登记**：它已达标（`sep=0 / pipe=0 / maxLen=2067`）⇒ 未登记 ⇒ 适用全局硬上限 ⇒ 若将来有人往里加一条含表格的 find ⇒ **立即红**（登记了就会变成"允许 1 条"的漏洞）。
⚠ **`governance-paths-config.json` 也不登记**：段 A3 完成后它必须**已达标** ⇒ 适用全局硬上限 ⇒ 三条大 `find` 拆不到位就红。
⚠ 登记表本身是**数据**（不是代码分支）⇒ 收敛进度可被 `grep` 出来，也可在后续 check list 里逐项减少。

### 1.3 拆分策略（`governance-paths-config.json` 三条大 find）

拆分原则：**按机制特有的语义边界切** —— 每条 `find` 只覆盖「这条 edit 真正要还原的那几行」，**不带**相邻的表格行 / 散文行。

| 原 edit | 目标文件 | 原长度 | 语义边界 | 预计条数 |
|---|---|---|---|---|
| `edits[11]` | `tests/config-guards.test.ts` | 12768 | 按**断言族**切（每个 `test("ACxx…` 块一条） | ≥ 5 |
| `edits[13]` | `prompts/build.md` | 2914 | 只覆盖「architect 行里『门控按 `GOVERNANCE_PATHS` 整文件判定』那一句」+ 其紧邻注记 | 1–2 |
| `edits[14]` | `prompts/build.md` | 2657 | 只覆盖「新增行 + 紧邻注记」 | 1–2 |

⚠ **`edits[13]` / `edits[14]` 的 `replace` 侧必须与 `find` 侧严格配对**：回滚要把「原状」写回去 ⇒ `replace` = 拆分前的原文片段（可长 ⇒ `replace` 无长度上限；`MAX_FIND_LEN` 只管 `find`）。
⚠ **`replace` 侧可以长**：`find` 小、`replace` 大是允许的（回滚方向是「小块换回大块」）—— 判据只约束 `find`（正向匹配的那一侧）。

## 2. 段 B：写集机读投影

### 2.1 渲染器

```ts
// lib/delegate-core.ts
export function renderWriteSetBlock(role: Role): string {
  const p = ROLE_WRITE_POLICY[role]
  const allow = p.allow.length === 0 ? "(none)" : p.allow.join(", ")
  const lines = [`<!-- role-write-set:${role}`, `allow: ${allow}`]
  if (p.denyAll) lines.push("denyAll: true")
  lines.push("-->")
  return lines.join("\n")
}
```

⚠ **`allow` 为空 ⇒ 渲染 `(none)`**，**不渲染空 `allow:` 行** —— 守卫按 `split(", ")` 解析会得到 `[""]`（一个空串元素）⇒ 逐字比对必红。
⚠ **三种特殊形态**：`builder` / `general` ⇒ `allow: **`（单元素）；`no-role` ⇒ `allow: (none)` + `denyAll: true`；其余四角色 ⇒ `allow: p1, p2, ...`。
⚠ **`governance` 不进块**：`governance: true`（architect / builder / general）表达的是「治理面身份」而非「写集路径」⇒ 进块会让块不再是写集维度的逐字投影 ⇒ 在**散文**里另行说明（AC12 的两条事实之一）。
⚠ **architect 的动态并入不进块**：`arch_paths` 命中的目录在 `decideWrite` 里**动态并入**（`lib/role-policy.ts`）⇒ 块只表达**固定部分**（`ROLE_WRITE_POLICY.architect.allow`）⇒ 散文必须注明「另有动态并入」（AC12 的两条事实之二）。
⚠ **`verifierWriteSetBlock()` 的输出逐字不变**（oracle F1）：它渲染的是 `allow` + **`owns:`** 两行、marker 为 `role-class-write-set:verifier` ⇒ 新函数**不得**取代它，只允许**共享 `allow` 行的 join 辅助** ⇒ 既有守卫（AC19 逐字比对 + marker 整行计数；AC20 解析 `owns:` 行）必须继续绿。

### 2.2 与既有 `role-class-write-set:verifier` 块的关系（**两块并存，不是两份副本**）

| 块 | 来源 | 语义 | 维度 |
|---|---|---|---|
| `role-class-write-set:verifier`（**既有，保留不动**） | `VERIFIER_ALLOW_ROOTS` + `VERIFIER_OWNS_PATHS` | **被派发 verifier 后端**能写什么（路径根 + **文件名模式** `owns:`） | 派发后端 |
| `role-write-set:<role>`（**本段新增，6 块**） | `ROLE_WRITE_POLICY` | **主会话角色**能写什么（路径根 + `denyAll`） | 主会话角色 |

⚠ 两者 `allow` 恰好相同（`ROLE_WRITE_POLICY.verifier.allow` == `VERIFIER_ALLOW_ROOTS`）但**语义不同** ⇒ **必须消歧**：散文里写明「本块 = 主会话 `verifier` 角色；被派发 verifier 后端的 `owns:` 约束见另一块」。
⚠ **不得**把 `owns:` 搬进新块（`owns` 不在 `ROLE_WRITE_POLICY` 里 ⇒ 搬进去就变成手抄 ⇒ 违反「不手抄字面量」）。

### 2.3 守卫断言族（`tests/config-guards.test.ts`）

对 6 个角色逐个断言：
1. `prompts/build.md` 内 `role-write-set:<role>` 块**恰好 1 处**；
2. 起止标记各自**独占一行**（`<!-- role-write-set:x` 与 `-->` 单独成行）；
3. 块内容（起止标记之间）**逐字**等于 `renderWriteSetBlock(role)`。

⚠ **落点约束**：`tests/config-guards.test.ts` 被 9 个清单的 67 处 `find` 逐字节 pin ⇒ 新断言**必须**落在 T0b 普查出的未 pin 空隙；若无可用空隙 ⇒ 同批更新对应清单的 `find`（并按两段式处理 `last_drill`）。

⚠ **AC12 的「角色列表节」边界必须显式锚定**（critic 验证建议）：节界 = `prompts/build.md` 里 `### 角色列表` 标题行**至下一个同级标题（`###` / `##`）之前** ⇒ 守卫按**这两个锚点**定位节区间（不按固定行号 —— 行号会随内容漂移）⇒ 防节界漂移导致判据**静默收窄**。

### 2.4 `prompts/build.md` 的已 pin 行区间（2026-11-24 实测 · T0b 的起点）

段 B 要改该文件的三处：角色表「允许」列 · 「表尾投影」bullets · 6 块插入边界 ⇒ **插在哪一行**由下表决定。

| 清单 | edit | 起始行 | 长度 | 覆盖内容 |
|---|---|---|---|---|
| `governance-paths-config.json` | `edits[13]` | **449** | 2914 | 角色列表表（含表头行 ⇒ 整表被 pin —— 段 A 的主目标） |
| `governance-paths-config.json` | `edits[14]` | **544** | 2657 | 治理面作用域表 |
| `role-class-write-set.json` | `edits[44]` | 216 | 256 | 「`role_class` 是能力类不是治理身份」条 |
| `role-class-write-set.json` | `edits[45]` / `[46]` | **456–457** | 58 / 114 | **verifier 行的「允许」列散文**（含 `.rddf/state/verifier`）⇒ 段 B 改该列**必然撞这两条** |
| `role-class-write-set.json` | `edits[47]` | **489** | 753 | **既有 `role-class-write-set:verifier` 机读块** ⇒ 6 个新块**不得**插在它的边界上 |
| `role-class-write-set.json` | `edits[48]` | 606 | 523 | 审查者不可用时的降级段 |
| `role-class-write-set.json` | `edits[49]` | 651 | 2219 | 「被派发后端的运行身份与交回契约」节 |
| `role-class-write-set.json` | `[50]`/`[51]`/`[52]` | 674 / 680 / 344 | 59 / 42 / 70 | HANDOFF 契约各处引用 |
| `commit-gate.json` | `edits[9]` | **483** | 95 | **`<!-- capability:build` 机读块** ⇒ 新块**不得**插在它的边界上 |
| `commit-gate.json` | `edits[7]`/`[10]`/`[8]`/`[6]`/`[5]` | 456 / 458 / 428 / 755 / 832 | — | commit 门相关散文 |
| `delegate-knowledge-delivery.json` | `edits[52]` | 687 | 161 | HANDOFF 首行优先级 |
| `plan-delegate.json` | `edits[9]`/`[46]`/`[47]` | 455 / 344 / 661 | — | 派发面引用 |

⚠ **可用的空隙**（行区间之间的空白）由 T0b 脚本确定；**插入点必须在空隙内** ⇒ 若 6 个块放不进任一空隙 ⇒ 必须**拆分**某些被 pin 的 `find`（= 段 A 的手法扩展到 `role-class-write-set.json`）⇒ 该清单的 `last_drill` 同样走两段式。

⚠ **段 A 与段 B 的文本依赖**：`edits[13]`（角色表）与 `edits[45]/[46]`（verifier 行散文）的 `find` 必须匹配**段 B 之后**的 `prompts/build.md` ⇒ **执行顺序** = 段 B 内容定稿 → 段 A 拆分（以 post-B2 文本为准）→ 一次性提交 + 演练。合并成一条 change 的技术依据正在于此。

## 3. 纪律

### 3.1 两段式（ADR D5）—— 清单内容变更必走

```
① 改清单内容 + 同一 commit 里：撤 last_drill + registry 该机制转 proving
② 跑演练（bun scripts/rollback-registry.ts）⇒ PASS
③ 同一 commit（或紧随的 commit）回填 last_drill + registry 转 active
```

⚠ 演练**克隆的是已提交的 HEAD** ⇒ 未提交的修复在克隆里看不到 ⇒ 演练前必须先提交。
⚠ `find` 文本被截断（少了结尾 `  })` 之类）⇒ 克隆里语法错 ⇒ 演练报 "Unexpected }" ⇒ **逐条核对 `find` 的首尾**（今天 AC10④ 那次就是这么抓到的）。

### 3.2 提交纪律

- `git commit` **单独成段**（`git add` 与 `git commit` 分两次调用；不写 `cd … &&` 前缀）。
- 提交门 = `bun test tests/` + `bash scripts/check-upstream-anchors.sh` **全绿**（fail-closed）⇒ 任一红 ⇒ 提交被工具层拒绝。

## 4. 已知残留（不在本 change 修）

| 残留 | 处置 |
|---|---|
| G3 被切碎的 edit（`role-class-write-set.json` 里因 `$&` 转义而被切碎的粒度） | 段 C 落地后 `replace` 侧已安全 ⇒ 可恢复自然粒度；核对方式 = `git show <引入 commit>:<path>` 对比原文。本 change 不动，登记为已知残留 |
| 其余 8 个清单的 `find` 形态违规 | AC7 的 check list（逐项登记）⇒ 后续单独立项收敛 |
| `prompts/plan.md` / `prompts/front.md` 是否也要嵌写集块 | 另立项决定（写进 AC 会变成开放判据） |
| `prompts/build.md` 角色列表「禁止」列的散文语义 | 本仓一贯避免假信心：散文判不了就如实登记，靠行为层（e2e 的越权拒绝用例）+ 审查兜底 |
