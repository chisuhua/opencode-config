# Session Alignment Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use skill_use("execute") to implement this plan task-by-task. Steps use commands 2-5 minutes.
> **纪律**：**先红后绿** —— 每个 Task 的 Step 1/2 先写出**会失败**的断言并实跑确认红，再写实现。

**Goal:** 把「派发方（plan / front）↔ 被派发方（build 后端）**跨会话**的对齐」变成**机械可判**的契约：
插件真实产出的返回值字段、派发方必须知晓的关键字段、以及派发方自己被授予的能力面 —— 三者都由**单一真源派生**比对，
而不是靠散文措辞。

**Architecture:** 三层对齐，每层一个真源 + 一个派生比对：
① **插件 ⇄ 简报**：`lib/delegate-core.ts` 导出返回值字段契约，插件在返回前**自检**（字段缺失 ⇒ 硬错），
   ⇒ 契约与实现不会无声漂移；② **插件 ⇄ 派发方 prompt**：守卫断言两个派发方 prompt 都覆盖「关键字段」
   （列表**从契约派生**，不手抄）；③ **配置 ⇄ 派发方 prompt**：plan/front 的**能力面**用机读块声明，
   守卫从 `opencode.jsonc` 派生比对（不手抄配置）。

**Tech Stack:** Bun test（`tests/`）、TypeScript（`lib/delegate-core.ts`）、`opencode.jsonc`（配置真源）。

---

## File Structure

### Production Code

| File | Responsibility |
|---|---|
| `lib/delegate-core.ts` | 导出 `DELEGATE_RESULT_FIELDS`（返回值字段契约）+ `DELEGATE_RESULT_CRITICAL_FIELDS`（派发方必须知晓的关键字段）+ 插件返回前的字段自检 |
| `prompts/plan.md` | 补「delegate 返回值」小节（指向 front.md §3.3 单一真源 + 自带「unverified 不得转述为完成」纪律）+ 能力面机读块 + 修「与 build 的关键区别」表 |
| `prompts/front.md` | 补能力面机读块（与 plan 同形） |

### Tests

| File | Responsibility |
|---|---|
| `tests/config-guards.test.ts` | AC21 派发方覆盖关键字段（派生）；AC22 能力面机读块 == `opencode.jsonc`（派生）；AC23 「关键区别」表的能力面陈述 == 机读块 |
| `tests/delegate-core.test.ts` | 返回值契约的导出与自检函数的行为 |

---

## Task 1: 返回值契约的单一真源

**Files:**
- Modify: `lib/delegate-core.ts`
- Test: `tests/delegate-core.test.ts`

- [x] **Step 1: Write the failing test**

```ts
test("AC21a：返回值字段契约存在，且关键字段是契约的子集", () => {
  expect(DELEGATE_RESULT_FIELDS.length).toBeGreaterThan(8)
  for (const f of DELEGATE_RESULT_CRITICAL_FIELDS) {
    expect(DELEGATE_RESULT_FIELDS).toContain(f)
  }
  // 关键字段必须覆盖「未验证」这一族（缺它 ⇒ 派发方会把未验证当完成）
  for (const f of ["outcome", "host_outcome", "blocked_reason", "no_work_evidence", "artifacts", "last_assistant_text"]) {
    expect(DELEGATE_RESULT_CRITICAL_FIELDS).toContain(f)
  }
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/delegate-core.test.ts -t "返回值字段契约"`
Expected: FAIL（`DELEGATE_RESULT_FIELDS` 未导出）

- [x] **Step 3: Write minimal implementation**

在 `lib/delegate-core.ts` 导出两个常量（字段名与插件实际产出一致），并在插件**返回前**加自检：
遍历契约字段，缺失即 `fail(...)`（硬错，不静默）。

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/delegate-core.test.ts`
Expected: PASS

---

## Task 2: 守卫 AC21 —— 派发方必须覆盖关键字段

**Files:**
- Modify: `tests/config-guards.test.ts`

- [x] **Step 1: Write the failing test**

```ts
test("AC21：两个派发方 prompt 都必须覆盖 delegate 返回值的**关键字段**（列表从契约派生）", () => {
  for (const rel of ["prompts/plan.md", "prompts/front.md"]) {
    const text = readFileSync(path.join(import.meta.dir, "..", rel), "utf8")
    for (const f of DELEGATE_RESULT_CRITICAL_FIELDS) {
      expect(text.includes(f), `${rel} 未提及返回值字段「${f}」`).toBe(true)
    }
  }
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/config-guards.test.ts -t "AC21"`
Expected: FAIL（`prompts/plan.md` 未提及 `host_outcome` / `blocked_reason` / `no_work_evidence` 等）

- [x] **Step 3: Write minimal implementation**

本 Task **不写实现** —— 它是给 Task 3 的红灯。跳过 Step 3（保持红）。

- [x] **Step 4: Run test to verify it still fails**

Run: `bun test tests/config-guards.test.ts -t "AC21"`
Expected: FAIL（记录红灯状态）

---

## Task 3: plan.md 补「delegate 返回值」小节

**Files:**
- Modify: `prompts/plan.md`

- [x] **Step 1: 确认红灯**（沿用 Task 2 的失败）

- [x] **Step 2: 记录红灯证据**（失败断言指向预期的那条）

- [x] **Step 3: Write minimal implementation**

在 `prompts/plan.md` 的「交回后的收尾三问」**之前**补一节（实现为 `####` 级 —— plan.md 围栏外**只允许一个 `###` 标题**，它是契约名）：
- 列出关键字段并**指向** `prompts/front.md` §3.3（单一真源，不复制全表）；
- 自带**本侧义务**：`outcome=unverified` / `no_work_evidence=true` ⇒ **不得转述为已完成**，
  必须转述为「无可验证的交付证据」并给出证据字段；
- `blocked_reason` 非空 ⇒ 按 §3.3 纪律**不换写法绕过**。

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/config-guards.test.ts -t "AC21"`
Expected: PASS

---

## Task 4: 能力面机读块 + 守卫 AC22（派生自 opencode.jsonc）

**Files:**
- Modify: `prompts/plan.md`、`prompts/front.md`
- Test: `tests/config-guards.test.ts`

- [x] **Step 1: Write the failing test**

```ts
test("AC22：派发方的能力面机读块 == opencode.jsonc 的真实 permission（派生比对）", () => {
  for (const rel of ["prompts/plan.md", "prompts/front.md"]) {
    const text = readFileSync(path.join(import.meta.dir, "..", rel), "utf8")
    const block = text.match(/<!-- capability:[a-z]+\n([\s\S]*?)-->/)
    expect(block, `${rel} 缺能力面机读块`).toBeTruthy()
    const edit = block![1].match(/^edit: (.*)$/m)![1].split(",").map((s) => s.trim())
    const cfgEdit = Object.entries(cfg.agent[agent].permission.edit as any)
      .filter(([k, v]) => k !== "*" && v === "allow").map(([k]) => k)
    expect(edit.sort()).toEqual(cfgEdit.sort())   // 派生比对，不手抄
  }
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/config-guards.test.ts -t "AC22"`
Expected: FAIL（三份 prompt 都还没有机读块）

- [x] **Step 3: Write minimal implementation**

在 build.md / plan.md / front.md 各放一块 `<!-- capability:<agent> … -->`。
**后续（oracle 轮）**：块改由 `lib/delegate-core.ts::capabilityBlock()` 渲染 ⇒ 守卫做**逐字三件套**比对（派生规则只有一处）。

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/config-guards.test.ts -t "AC22"`
Expected: PASS

---

## Task 5: 修「与 build 的关键区别」表 + 守卫 AC23

**Files:**
- Modify: `prompts/plan.md`
- Test: `tests/config-guards.test.ts`

- [x] **Step 1: Write the failing test**

断言 plan.md 的「与 build 的关键区别」表里 **shell / 编辑 两行**与**机读块 + 配置**一致
（不许手抄另一份 ⇒ 从机读块派生）。

- [x] **Step 2: Run test to verify it fails**

Run: `bun test tests/config-guards.test.ts -t "AC23"`
Expected: FAIL（当前表里的 shell 描述与配置不符）

- [x] **Step 3: Write minimal implementation**

改表：**能力面两行改为指向 `capability:*` 块**（不再复述 ⇒ 不会漂）。

- [x] **Step 4: Run test to verify it passes**

Run: `bun test tests/config-guards.test.ts`
Expected: PASS

---

## 执行记录（2026-11-15，实际执行）

| Task | 红灯 | 绿灯 | 偏差 |
|---|---|---|---|
| 1 契约真源 | ✔ `DELEGATE_RESULT_FIELDS 未导出` | ✔ 16 断言 | 测试用**动态 import**（让「未导出」表现为单条断言失败，而非整文件加载失败） |
| 2 守卫 AC21 | ✔ plan.md 缺 `host_outcome` / `blocked_reason` / `no_work_evidence` / `artifacts` / `out_of_scope_files` | ✔ | 拆成 **AC21（字段覆盖）+ AC21b（纪律句）** —— 只保证「提到字段」不够，要保证「提到的是纪律」 |
| 3 plan.md 实现 | — | ✔ | 新小节用 **`####`** 不用 `###` —— plan.md 围栏外**只允许一个 `###` 标题**（它是「交回后的收尾三问」的契约名，front.md 按标题名引用） |
| 4 能力面块 AC23 | ✔ 缺块 | ✔ | 后续（oracle 轮）再升级为「lib 渲染规范块 + **逐字 + 恰好 1 处 + 标记行数**」三件套（与 AC19 同形），并扩到 build/plan/front 三个 agent |
| 5 「关键区别」表 + AC24 | ✔ 表里能力面两行与配置不符 | ✔ AC24（散文不得复述能力面） | 守卫从「逐字段派生」升级为「**散文不得复述**」——复述即漂；表改为**指向** `capability:*` 块 |
| — | — | — | **AC22（契约 ↔ 插件 summary 逐项双向一致）当场即绿** —— 它是**防漂移**守卫（契约照实现写的），不是红→绿任务 |

**过程中发现并修掉的连带问题**（都是「插入内容 ⇒ 撞既有守卫」）：
1. `.plans/` **口径**检查被机读块里的 legacy 放行项命中 ⇒ 口径检查改为**只看散文**（剥离机读块）。
2. plan.md 围栏外**只允许一个 `###` 标题**（契约名）⇒ 新小节降级为 `####`。

## Task 6: 全量回归 + 变红演练

**Files:** —

- [x] **Step 1: 全量测试**

Run: `bun test tests/` ⇒ Expected: 0 fail
Run: `bash scripts/check-upstream-anchors.sh` ⇒ Expected: 23/23

- [x] **Step 2: 变红演练 3 例**（每例：注入 ⇒ 必须红 ⇒ 还原 ⇒ 必须绿）

1. 从 `prompts/plan.md` 删掉 `unverified` 纪律句 ⇒ AC21 红；
2. 改 `opencode.jsonc` 的 plan edit 白名单（不加同步）⇒ AC22 红；
3. 把 plan.md 能力面机读块的 `edit` 行改窄 ⇒ AC22 红。

- [x] **Step 3: 审查**：治理面（`prompts/**` + 守卫断言）⇒ **oracle → critic** 各 1 轮。
      —— oracle `PASS-WITH-NOTES`（11 条建议全落地）→ critic `APPROVE_WITH_CONDITIONS`（无 BLOCKER；4 SHOULD_FIX 全闭合，
      其中 1 条是**真缺陷**：`wait_error` 恒为 undefined ⇒ 序列化丢键 ⇒ 线上只有 27/28 字段 ⇒ 已修且自检改为查序列化后的对象）。
      记录：`.rddf/reviews/session-alignment-contract-review.md`。

- [x] **Step 4: 落 CHANGELOG 条目**（结论按实际审查回填，不得预断言）—— `docs/CHANGELOG.md` v2.28。
