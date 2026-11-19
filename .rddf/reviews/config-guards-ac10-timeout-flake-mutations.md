# 突变演练 — config-guards-ac10-timeout-flake（AC9）

> 判据真源：`openspec/changes/config-guards-ac10-timeout-flake/proposal.md` 的 AC9 +「变红演练（5 条）」表。
> 被测文件：`tests/config-guards.test.ts`（唯一改动文件）。
> 基线：commit `ed6fd44`（实现落地后的 HEAD）。每次突变前 `cp` 出 baseline 并记 `sha256`，突变后**从 baseline 拷回**，
> 再校验 `sha256` 相等 ⇒ 「复原」不是口头声明。
> 命令：`bun test tests/config-guards.test.ts -t "AC10④"`（覆盖 AC10④ 真实仓用例 + 确定性 fixture + 形态守卫三个用例）。

## 0. 基线指纹

| 项 | 值 |
|---|---|
| baseline `sha256(tests/config-guards.test.ts)` | `7989ee706535c5146db350ca7858fe381d2d6ad2f05621384018f3e6c73614c4` |
| 5 条突变全部执行完、逐条复原后的 `sha256` | `7989ee706535c5146db350ca7858fe381d2d6ad2f05621384018f3e6c73614c4`（**相等**） |
| AC1④ 的 `git diff --exit-code`（提交后注入 M1 ⇒ `git checkout --` 复原） | **exit 0，无差异** |

## 1. M1 — 去掉 `{ timeout: 20000 }`（保留 `await Bun.sleep(6000)`）

- **突变**：用例改 `async () => { await Bun.sleep(6000)` + 删 `{ timeout: 20000 }`。
- **必红断言**：AC1①（源码含 `{ timeout: 20000 }`）+ AC1②（慢执行必须不判红）。
- **实测（`logout` 摘录）**：
  ```
  (fail) … > AC10④：父篇 ADR 的 commit 必须是代码 commit 的祖先或同一 commit（父篇滞后必红） [5000.10ms]
    ^ this test timed out after 5000ms.
  1 pass  1 fail
  ```
- **结论**：✅ 命中。bun 默认 **5000ms** 的假设被实测确认（5174 行的实现路径本身没变，红的是超时边界）。

## 2. M2 — `timeout` 改 2000 + `await Bun.sleep(3000)`

- **突变**：`{ timeout: 20000 }` ⇒ `{ timeout: 2000 }`，`sleep(3000)`。
- **必红断言**：AC1③（显式超时边界真会触发 ⇒ 该值不是摆设）。
- **实测**：
  ```
  (fail) … [2000.01ms]
    ^ this test timed out after 2000ms.
  1 pass  1 fail
  ```
- **结论**：✅ 命中（超时值确实生效，而不是被 bun 忽略）。

## 3. M3 — `isAncestor` 恒 `true`

- **突变**：函数体换成 `return true`（去掉 `merge-base --is-ancestor` 调用）。
- **必红断言**：AC2 反向用例（代码先改 ⇒ 父篇不是祖先 ⇒ 必须 false）+ AC8（fixture 非恒真）。
- **实测**：
  ```
  error: expect(received).toBe(expected)
  3232 |       expect(isAncestor(repo, parentSha, codeSha)).toBe(false)
  (fail) … > AC10④ 的祖先判定（确定性 fixture）：父篇先改 ⇒ 绿 / 代码先改 ⇒ 红 / 同提交 ⇒ 绿 [39.85ms]
  ```
- **结论**：✅ 命中。⇒ fixture 用例**不是恒真**，反向态有判别力。

## 4. M4 — 命令形态漂移（`git log` ⇒ `git rev-list -1 HEAD`）

- **突变**：`["log", "-1", "--format=%H", "--", file]` ⇒ `["rev-list", "-1", "HEAD", "--", file]`。
- **必红断言**：AC5（与归档 spec 逐字一致）。
- **实测（分两步，第二步暴露了一个真实缺口）**：
  1. **只跑两个行为用例**：`2 pass / 0 fail` —— 形态漂移后**行为等价 ⇒ 用例仍绿**。
  2. 因此本 change 补了一条**源码级形态守卫**（AC10④ 的命令形态不得漂移，期望串用变量拼出以免自匹配）。
     重跑：`(fail) … > AC10④ 的命令形态不得漂移 … [3.53ms]` + `error: expect(received).toContain(expected)` ⇒ **2 pass / 1 fail**。
- **结论**：✅ 命中（由形态守卫捕获）。
  ⚠ **登记的真实发现**：AC5 原先写作「测试源码含 `git log -1 --format=%H --`（逐字）」—— 该**字符串**在参数
  写成数组的形态下**不可能出现**（判据本身写错，无法满足）。已改为可机判的实际形态
  `["log", "-1", "--format=%H", "--", file]` / `["merge-base", "--is-ancestor", a, b]`（判据强度不变：仍是「与归档 spec 逐字一致」）。
  ⚠ **已知边界**：形态守卫只钉这两处字面量；换 `rev-list` 之外的等价改写（例如自带封装）仍需 review 判断 —— 与
  「措辞类判据的固有边界」同族。

## 5. M5 — `lastCommitSha` 恒返回 `""`

- **突变**：函数体换成 `return ""`（模拟「判据空跑」）。
- **必红断言**：AC2 fixture 用例（sha 必非空 ⇒ 判据不能空转）。
- **实测**：
  ```
  error: expect(received).not.toBe(expected)
  3217 |       expect(parentSha).not.toBe("")
  (fail) … > AC10④ 的祖先判定（确定性 fixture）… [14.82ms]
  ```
- **结论**：✅ 命中。⇒ 「抽取后语义被改成恒空」这类回退会被 fixture 抓住。

## 6. 汇总

| # | 突变 | 必红的断言 | 实测 | 命中 |
|---|---|---|---|---|
| M1 | 去掉 `{ timeout: 20000 }` + `sleep(6000)` | AC1① + AC1② | `timed out after 5000ms` | ✅ |
| M2 | `timeout: 2000` + `sleep(3000)` | AC1③ | `timed out after 2000ms` | ✅ |
| M3 | `isAncestor` 恒 `true` | AC2 反向用例 + AC8 | fixture 反向态 `expect(false)` 红 | ✅ |
| M4 | 命令形态 `git log` ⇒ `git rev-list` | AC5 | 行为用例**仍绿** ⇒ 补的形态守卫红 | ✅（并暴露 AC5 原文不可满足） |
| M5 | `lastCommitSha` 恒 `""` | AC2 fixture + AC8 | `expect(parentSha).not.toBe("")` 红 | ✅ |

**复原证据**：5 条全部 `sha256 == baseline`（见 §0）；AC1④ 另有 `git diff --exit-code` exit 0。
**不空转**：该文件 `test.skip` / `test.todo` 计数 **0**。
