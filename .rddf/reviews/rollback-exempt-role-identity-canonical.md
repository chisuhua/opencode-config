# 豁免证据：`role-session-identity` / `canonical-root-normalization` ⇒ `no-single-baseline`

> **用途**：`ADR-rollback-manifest-enforcement` 的 **M3**（`exempt_class` 闭集）+ **U12**（成立性归评审）要求：报 `no-single-baseline` 必须能指出**混合基线的 git 事实证据**（教学面自初始提交即存在 / 实现面被多个增量重塑）。本文件是该证据的存档。
> **性质**：**只读**的取证记录（不是清单、不是 ADR）。撰写：architect（主会话）；复核：见 §5。

## 1. 结论

两条机制的**退役 = 重写**（不是「找不到回退基线的某一段」，而是「退役会连带改写原生教学面 + 回退 delegate 的两根基模型 + 拆掉两个门禁插件」）⇒ 归 `exempt_class = no-single-baseline`（定义：**无单一可回退状态 ⇒ 退役 = 重写**）。

**为什么不是 `one-way`**：M3 的 tie-break 规定 —— 能举出**混合基线的 git 事实证据**时**不报 `one-way`**。本文给出：教学面**自初始提交即存在**（§2）+ 实现面**被多个增量重塑**（§3）⇒ 混合基线成立 ⇒ 按实际理由归 `no-single-baseline`。

**为什么不是 `not-implemented`**：其实现**已落地** —— `canonicalRoot()` 返回 `{stateRoot, workRoot, vcs}` 三值（`lib/delegate-core.ts`）+ 291 行 / 10 组用例的验收测试（`tests/canonical-root.test.ts`）+ 关联 change 已归档（`openspec/changes/archive/2026-11-10-canonical-root-normalization/`）。⇒ M3 的 `not-implemented` 机器前提（`watch[]` 每条路径当前**都不得存在**）**不成立** ⇒ 报 `not-implemented` 必红。

## 2. 教学面：**自初始提交即存在**（原生）

```text
$ git log --diff-filter=A --format="%h %ad %s" --date=short -- prompts/build.md | tail -1
132f389 2026-11-03 update1          ← 初始提交
```

- 角色矩阵段（**`prompts/build.md:192`**，段体至 `:798`，现 **642 行**）自 `132f389` 起就在 ⇒ 该段是**原生教学面**。
- 两条机制的教学面**落在该段内**：
  - `role-session-identity` ⇒ `prompts/build.md:200-217`（「状态来源」段的四级解析链 + `sessions` 分区 + `resolveRole` 唯一落点 + sid 守卫 + `/role-init` 残留 + `role-switch.sh` 唯一写入口）；
  - `canonical-root-normalization` ⇒ `prompts/build.md:203-207`（canonical 判别式：superproject / `--git-common-dir` / `stateRoot` vs `workRoot`）。
- **已实测的后果**（记录于 `.rddf/rollback/README.md:136`）：删掉 `## 角色矩阵` 段 ⇒ **39 处红**，且 `## 输出` / `§HANDOFF` / `§越权处理` 的 `⇒ 按 §需要用户裁决时` 引用全部悬空 ⇒ 只能**重写**、不能 `find/replace`。

## 3. 实现面：**被多个增量重塑**（混合基线）

引入提交（`git log --diff-filter=A`）：

| 文件 | 引入 | 性质 |
|---|---|---|
| `lib/role-identity.ts` | `0152534` 2026-11-17 | 后加（有基线） |
| `lib/role-lease.ts` | `c713a58` 2026-11-17 | 后加（有基线） |
| `lib/delegate-async.ts`（`canonicalRoot` 的使用者） | `35e23a6` 2026-11-09 | 后加 |

⇒ **教学面原生 + 实现面后加** = M3 所说的**混合基线**。

依赖图（生产文件 ⇒ 被依赖的机制面）：

```text
$ grep -ln "role-identity\|role-lease" lib/*.ts plugins/*.ts scripts/*.ts
lib/delegate-async.ts      lib/delegate-core.ts      lib/role-identity.ts
lib/role-lease.ts          lib/role-policy.ts       plugins/commit-gate.ts
plugins/role-gate.ts       scripts/role-switch.ts          ← 8 个（含机制自身 2 个 ⇒ 6 个外部依赖方）

$ grep -ln "canonicalRoot" lib/*.ts plugins/*.ts scripts/*.ts
lib/delegate-async.ts      lib/delegate-core.ts      plugins/commit-gate.ts
plugins/role-gate.ts       scripts/role-switch.ts          ← 5 个（全部是外部依赖方）
```

⇒ 退役任一条 ⇒ 连带回退：

1. **delegate 内核的两根基模型** —— `stateRoot`（项目键）与 `workRoot`（工作树键 / 槽位键）在 `lib/delegate-core.ts` 里成对使用（`:152-169` 槽位键 = `workRoot`、`:323-334` ledger 双根、`:366-394` 停机守卫键 = 双根）；收回 `canonicalRoot` 的三值返回 ⇒ 两根塌缩成一个 ⇒ **槽位 / 停机守卫 / ledger** 的键语义全变 ⇒ 连带 G1 的内核（`delegate-slot-kernel`）。
2. **两个门禁插件** —— `plugins/commit-gate.ts`（身份链 + 根）与 `plugins/role-gate.ts`（身份解析 + 租约围栏 + 根）都 import 这两个面 ⇒ 退役 ⇒ 门禁**要么失效、要么重写**（而 role-gate 的教学面在原生段内 ⇒ 重写）。
3. **唯一写入口** —— `scripts/role-switch.ts`（薄壳，语义在 `lib/role-lease.ts`）⇒ 退役 ⇒ 「角色切换唯一写入口」这条不变式（原生段内）失去载体。

⇒ 三条连带里**至少一条落在原生教学面** ⇒ 退役路径不可用 `delete` + `edits` 表达 ⇒ **退役 = 重写** ⇒ 清单做不到。

## 4. 与 registry 的对应

| 机制 | `adr_primary` | `state` | `exempt_class` | `exempt_evidence` |
|---|---|---|---|---|
| `role-session-identity` | `docs/adr/ADR-role-session-identity.md` | `exempt` | `no-single-baseline` | 本文件 |
| `canonical-root-normalization` | `docs/adr/ADR-canonical-root-normalization.md` | `exempt` | `no-single-baseline` | 本文件 |

⚠ `canonical-root-normalization` 的 ADR Status 行自述「**未实施**——关联 change 尚未立项」，与事实矛盾（change 已归档、实现已落地）⇒ **同批订正**（见该 ADR 的修订行）。

## 5. 复核记录

| 项 | 结果 |
|---|---|
| 教学面原生的 git 事实 | `git log --diff-filter=A -- prompts/build.md` ⇒ `132f389`（初始提交）—— 已复核 |
| 实现面引入提交 | `0152534` / `c713a58` / `35e23a6` —— 已复核 |
| 依赖图 | 8 个 / 5 个生产文件 —— 已复核（命令见 §3） |
| 「删角色矩阵 ⇒ 39 处红」 | 引自 `.rddf/rollback/README.md:136`（2026-11-20 隔离副本实测存档）—— **二手引用**，本次未复测 |
| 评审 | U12 的成立性评审（本条即其证据；ADR 第 6 轮 critic 已复审） |
