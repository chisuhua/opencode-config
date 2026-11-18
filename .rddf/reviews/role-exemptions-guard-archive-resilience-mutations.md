# role-exemptions-guard-archive-resilience —— 变红演练证据包（AC9）

> 判据真源：`openspec/changes/role-exemptions-guard-archive-resilience/proposal.md` 的 **AC9** 与「变红演练（6 条）」表（M1–M6）。
> 被验对象：`tests/role-exemptions.test.ts`（AC 面载体解析器 `resolveAcFace` + 三态文案）+ 真实载体 `openspec/changes/role-aware-permissions/proposal.md`。
> 执行方式：脚本 `/tmp/opencode/mutate_ac23.sh`（每条突变 → 跑单文件 → 复原 → 复跑绿；`trap` 兜底复原）。原始日志留档于 `/tmp/opencode/mutations.log`（不入仓，过程性 scratch）。
> 环境：`bun test v1.3.14`；基线单文件 **19 pass / 0 fail**。

## 汇总

| # | 突变点 | 必红断言（proposal 表） | 实测红 | 结论 |
|---|---|---|---|---|
| M1 | 删 `ambiguous` 分支（≥2 时静默返回第一个） | AC1「并存 ⇒ `ambiguous`」 | AC1「并存 ⇒ ambiguous」+ AC6② | ✅ |
| M2 | AC 面解析结果指向测试文件本身 | AC3「三处两两不同」 | AC3 + AC5(c) | ✅ |
| M3 | 载体缺失时 `throw`（替代返回 `none`） | AC4「判红而非未捕获异常」 | AC4 + AC1(none ×2) + AC5(a) | ✅ |
| M4 | 真实载体的 AC23 小节标题降级为 `###` | AC5(b)「文案含期望标题原文」 | AC1(AC 面)+AC2+AC3+AC6①+逐项正文 | ✅ |
| M5 | 删真实载体里的 `D5③` 行 | AC6①「删项仍红」 | AC1(AC 面)+逐项正文+AC6① | ✅ |
| M6 | 活跃缺项时静默回退到 archive 副本 | AC6②「不得静默回退」 | AC6② + AC5(c) | ✅ |

每条突变后均复原并复跑 **19 pass / 0 fail**；全部复原后全量 `bun test tests/` ⇒ **913 pass / 0 fail**。

## M1 删 `ambiguous` 分支

**突变**（`tests/role-exemptions.test.ts`）：

```diff
-  if (found.length > 1) return { kind: "ambiguous", paths: found.map((f) => rel(root, f.path)) }
```

**红输出**：

```
(fail) AC1 fixture：候选枚举三态（纯函数，传自己的 root） > 并存 ⇒ ambiguous（列出全部候选）
(fail) AC6② 判据强度：活跃缺项 + 归档齐全 ⇒ 仍红（不得静默回退） > 活跃 proposal 缺 D5③、archive 副本齐全 ⇒ ambiguous（不是静默取 archive）
 17 pass
  2 fail
error: expect(received).toBe(expected)
Expected: "ambiguous"
Received: "active"
```

**复原后**：19 pass / 0 fail。

## M2 AC 面解析结果指向测试文件本身

**突变**（把解析结果的相对路径替换成测试文件自身的路径）：

```diff
-  const relPath = resolved ? rel(root, resolved.path) : "(未解析到)"
+  const relPath = rel(root, SELF)
```

**红输出**：

```
(fail) AC3 身份与互异性：三处是三个不同文件 > AC 面 ∈ openspec/changes 且三处路径两两不同
(fail) AC5 文案三态分开 > (c) 有标题但六项不全：缺项文案的 label 含相对路径
 17 pass
  2 fail
error: expect(received).toBe(expected)
Expected: true
Received: false
error: Expected: "openspec/changes/role-aware-permissions/proposal.md"
       Received: "../../home/ubuntu/.config/opencode/tests/role-exemptions.test.ts"
```

**复原后**：19 pass / 0 fail。

> 这条正是 metis 的 **R2**：若解析器把 AC 面指到测试文件（本文件头本来就有六项），三条「六项齐全」用例会**全绿**，AC23 静默降级成「一处命中」。AC3 的互异性断言是唯一拦住它的那条。

## M3 载体缺失时抛异常

**突变**：

```diff
-  if (found.length === 0) return { kind: "none", searched, emptyDirs }
+  if (found.length === 0) throw new Error("AC23 的 AC 面载体缺失")
```

**红输出**：

```
(fail) AC1 fixture：候选枚举三态（纯函数，传自己的 root） > 都无 ⇒ none（searched 含两形态）
(fail) AC1 fixture：候选枚举三态（纯函数，传自己的 root） > 目录在但 proposal.md 缺 ⇒ none 且点名目录
(fail) AC4 失败形态：判红 + 可读文案（不抛异常） > 两次解析器调用都不抛（none 与 ambiguous 均返回诊断对象）
(fail) AC5 文案三态分开 > (a) 无载体：文案含解析根 + 两形态相对路径
 15 pass
  4 fail
error: AC23 的 AC 面载体缺失
error: expect(received).not.toThrow()
```

**复原后**：19 pass / 0 fail。

## M4 真实载体的小节标题降级为 `###`

**突变**（`openspec/changes/role-aware-permissions/proposal.md`）：

```diff
-## 免宣称六项（AC23 的登记面）
+### 免宣称六项（AC23 的登记面）
```

**红输出**：

```
(fail) AC23 免宣称六项在三处各自命中 > AC1 AC（proposal.md）：六项齐全
(fail) AC23 免宣称六项在三处各自命中 > AC1 六项**逐项**都有正文（不只是标识符）
(fail) AC23 免宣称六项在三处各自命中 > AC6① 判别力：删掉任一项 ⇒ 必红
(fail) AC2 真实态：AC 面恰好 1 个候选，且落在 openspec/changes 下 > 真实态解析
(fail) AC3 身份与互异性：三处是三个不同文件 > AC 面 ∈ openspec/changes 且三处路径两两不同
 14 pass
  5 fail
error: expect(received).toBeNull()
Received: "openspec/changes/role-aware-permissions/proposal.md 缺行首标题「## 免宣称六项（AC23 的登记面）」（找不到该字面的行首标题）"
```

**复原后**：19 pass / 0 fail。

> 这条同时证明 **AC5(b)** 的文案在**真实路径**上生效（文案含期望标题**原文**），且失败形态是**判红**（`expect(...).toBeNull()`）而非异常。

## M5 删真实载体里的 `D5③` 登记行

**突变**：删掉 `role-aware-permissions/proposal.md` 中第一处含 `D5③` 的整行（模拟「登记被删」）。

**红输出**：

```
(fail) AC23 免宣称六项在三处各自命中 > AC1 AC（proposal.md）：六项齐全
(fail) AC23 免宣称六项在三处各自命中 > AC1 六项**逐项**都有正文（不只是标识符）
(fail) AC23 免宣称六项在三处各自命中 > AC6① 判别力：删掉任一项 ⇒ 必红
 16 pass
  3 fail
error: AC（proposal.md：openspec/changes/role-aware-permissions/proposal.md） 缺免宣称项：D5③
error: AC（proposal.md：openspec/changes/role-aware-permissions/proposal.md） 缺 D5③
```

**复原后**：19 pass / 0 fail。

> 文案里带**相对路径**（AC5(c) 的要求）在真实失败里可见；`D5①` 等其余项仍在 ⇒ 缺项检查不是「全有全无」的恒真判定（原判别力未回退）。

## M6 活跃缺项时静默回退到 archive 副本

**突变**（候选只收「六项齐全」的 proposal）：

```diff
-  if (existsSync(activeProposal)) {
+  if (existsSync(activeProposal) && missingItems(readFileSync(activeProposal, "utf8")).length === 0) {
```

**红输出**：

```
(fail) AC5 文案三态分开 > (c) 有标题但六项不全：缺项文案的 label 含相对路径
(fail) AC6② 判据强度：活跃缺项 + 归档齐全 ⇒ 仍红（不得静默回退） > 活跃 proposal 缺 D5③、archive 副本齐全 ⇒ ambiguous（不是静默取 archive）
 17 pass
  2 fail
error: expect(received).toBeNull()
Received: "缺 AC23 的 AC 面载体：在 /tmp/ac23-guard-HJ8XzP 下找不到 …；目录在但缺 proposal.md：openspec/changes/role-aware-permissions ⇒ 见 docs/adr/ADR-role-aware-permissions.md D5"
error: Expected: "ambiguous"
       Received: "archived"
```

**复原后**：19 pass / 0 fail。

> `Received: "archived"` 是这条突变的核心证据：候选按**内容**过滤就会把「活跃缺项」静默让位给归档副本 ⇒ 判据强度被悄悄调低。按**文件存在性**计数才能得到 `ambiguous`。

## 复原与回归

| 步 | 结果 |
|---|---|
| 每条突变后复原 + 单文件复跑 | **19 pass / 0 fail**（6/6） |
| 全部复原后全量 `bun test tests/` | **913 pass / 0 fail** |
| 工作树 | 仅 `M tests/role-exemptions.test.ts`（本 change 的改动）+ `M cli.json`（运行时文件，刻意不提交） |
| 真实载体 | 与突变前逐字相同（`cp` 备份复原；`git status` 无载体改动） |
