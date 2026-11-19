# 验收报告 — config-guards-ac10-timeout-flake

> 判据来源：`openspec/changes/config-guards-ac10-timeout-flake/proposal.md` 的「## 验收标准」（AC1–AC9）与「## Acceptance（勾选镜像）」。
> 判据优先级：用户指令（「AC10④ 的抖动问题立项」）> 本 change 的 AC 段 > 实施承诺（commit `ed6fd44`）。
> 角色：verifier（只验不改；本轮无实现改动）。
> 已用轮次：**1**（首轮）。

## 1. 验证顺序与结果

| 步 | 项 | 命令 | 结果 |
|---|---|---|---|
| 1 | 静态检查（本仓无 tsconfig，TS 由 `bun test` 编译） | `bun test tests/config-guards.test.ts` | **118 pass / 0 fail**（编译通过） |
| 2 | 单元测试 | `bun test tests/config-guards.test.ts -t "AC10④"` | **3 pass**（真实仓用例 + fixture 三态 + 形态守卫） |
| 3 | 集成/全量 | `bun test tests/`（连跑 3 次） | **916 pass / 0 fail** ×3 |
| 4 | 边界与错误路径 | 见 §2（突变 M1–M5） | 逐条命中 |
| 5 | 遗留清扫 | `grep -nE "TODO\|FIXME\|XXX\|console\.(log\|debug)\|\.only\(\|test\.skip"` | **0 命中** |

## 2. 逐条判定 + 证据

| AC | 判定 | 证据（命令 + 输出摘要） |
|---|---|---|
| AC1 ① | ✅ | `grep -n "{ timeout: 20000 }" tests/config-guards.test.ts` ⇒ 命中 AC10④ 的 test 选项；`git show ed6fd44` 可见 `{ timeout: 20000 },` 紧随用例体 |
| AC1 ② | ✅ | 突变 M1（去掉 timeout + `await Bun.sleep(6000)`）⇒ `this test timed out after 5000ms`（**5000ms 是 bun 默认值**，不是 20s）⇒ 证明「有超时则慢不判红」 |
| AC1 ③ | ✅ | 突变 M2（`timeout: 2000` + `sleep(3000)`）⇒ `timed out after 2000ms` ⇒ 显式值真的生效 |
| AC1 ④ | ✅ | 提交后注入 M1 ⇒ `git checkout -- tests/config-guards.test.ts` ⇒ `git diff --exit-code … ` ⇒ **exit 0**；另 5 条突变逐条复原后 `sha256` == baseline（`7989ee70…`） |
| AC2 | ✅ | fixture 三态用例通过：父篇先改 ⇒ `isAncestor=true`；代码先改 ⇒ `=false`；同提交 ⇒ `=true`。真实仓一次：`bun test -t "AC10④"` ⇒ 3 pass。证据项：父篇 `6116839…`（`2026-11-14 22:29:39 +0800`）早于代码 `4b31d19…`（`2026-11-18 00:54:42 +0800`） |
| AC3 | ✅ | `grep -n 'execFileSync("git"'` ⇒ **3 处**：`:76`（`lastCommitSha`）、`:88`（`isAncestor`）、`:102`（`gitFixture`，cwd 恒为 `mkdtemp`）。触真实仓历史的只有前 2 处；AC10④ 与 fixture 用例共用那两个 helper；真实仓路径每次执行 3 次 git 调用（2 log + 1 merge-base） |
| AC4 | ✅ | 两 sha 均非空（见 AC2 行）；`bun test -t "AC10④"` ⇒ **3 pass** |
| AC5 | ✅ | `grep -nF '["log", "-1", "--format=%H", "--", file]'` / `'["merge-base", "--is-ancestor", a, b]'` 均命中；形态守卫用例通过；突变 M4（换 `rev-list`）⇒ 守卫红 |
| AC6 | ✅ | `grep -nF "慢执行不判红"`、`grep -nF "超时 ≠ 父篇滞后"` 均命中（在 AC10④ 的注释里，报告出现超时时能直接读到） |
| AC7 | ✅ | `bun test tests/` ×3 ⇒ 916/0；junit `AC10④…（父篇滞后必红）` 耗时 **0.443 / 0.265 / 0.260 s**；`check-upstream-anchors.sh` ⇒ **RESULT: OK（23/23）**；`openspec validate --strict` ⇒ **valid** |
| AC8 | ✅ | `grep -cE '\btest\.(skip|todo)\('` ⇒ **0**；突变 M3（`isAncestor` 恒真）⇒ fixture 反向态红 ⇒ 非恒真 |
| AC9 | ✅ | `.rddf/reviews/config-guards-ac10-timeout-flake-mutations.md`：M1–M5 各含「突变描述 + 红输出摘录 + 复原」，附 baseline/复原 `sha256` |

## 3. 失败项

无。

## 4. 遗留清扫结果

| 项 | 结果 |
|---|---|
| TODO / FIXME / XXX | 无 |
| 半截实现 | 无（AC1–AC9 全部落地） |
| 注释掉的旧代码 | 无（原内联 `sha()` 与 `try/catch` 已被 helper 替换，diff 里无残留注释块） |
| 临时调试日志 | 无（`console.log`/`console.debug` 0 命中） |
| 被 skip 的测试 | 无（`test.skip`/`test.todo` 0） |
| 未替换的 mock | 不适用（无 mock） |
| 临时 fallback | 无 |

**范围外历史遗留（只记录、不清理）**：`cli.json` 的 verbosity 运行时改动留在工作树（刻意不提交）；本 change 未触碰。

## 5. 如实登记的边界（不是失败项）

1. **5–20s 的「慢但正确」现在是绿**（原为随机假红）—— per-call 6s 的可归因错由 sibling `real-repo-git-budget-guard` 补上；本 change 按 D7 拒绝给 `execFileSync` 加 timeout（会被 `catch` 吞成静默跳过）。
2. **形态守卫钉住 helper 的形参名**（`file`/`a`/`b`）⇒ 纯改名也响红（可接受 brittleness）。
3. **无 git 环境下 fixture 用例响红**（`gitFixture` 无 catch）⇒ 已登记为 Out of Scope ⑩；AC10④ 真身的「无 git ⇒ 跳过」语义保留。
4. **形态守卫读本文件自身路径**属过渡形态 ⇒ 由 sibling 的 D4/D9 迁移并回写。

## 6. 结论

**通过（9/9 AC）**。可归档。
