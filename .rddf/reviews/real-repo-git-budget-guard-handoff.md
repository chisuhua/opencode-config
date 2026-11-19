# 交接记录 — `real-repo-git-budget-guard` → `config-guards-ac10-timeout-flake`（D9）

> 触发：`real-repo-git-budget-guard` 的 **D9**（「本项后落地 ⇒ 在本项这次提交里**回写** sibling 的 D2 / AC3 / AC5 + 留痕」）。
> 被回写者已归档：`openspec/changes/archive/2026-11-19-config-guards-ac10-timeout-flake/proposal.md`（实施 commit `ed6fd44`）。
> ⚠ **处置方式**：归档 change 是**过程记录** ⇒ **不回改历史记述**，只在其 proposal 末尾**追加**「迁移注记」；本文件是交接的权威说明。

## 1. 为什么需要交接

sibling（①）把「访问真实仓的两个 helper」写在了 `tests/config-guards.test.ts` **内部**，并据此定了三条判据：

| ① 的条目 | ① 的原文（实施时成立） | 本项迁移后的事实 |
|---|---|---|
| **D2** | 「只抽这两个，不抽通用 git 工具层」⇒ `lastCommitSha` / `isAncestor` **在本文件内** | 迁到 `tests/helpers/real-repo-git.ts`，并补 `lastCommitShaInRepo` / `isAncestorInRepo` 两个真仓薄包装 + 两层预算常量 + per-call 超时抛错 |
| **AC3** | 「该文件内 `execFileSync("git"` 调用点 = **3**（2 helper + 1 fixture runner）；触真实仓历史的只有 helper 内 2 处」 | `tests/config-guards.test.ts` 现在**只剩 1 处** `execFileSync("git"`（`gitFixture`，cwd 恒为 `mkdtemp` 临时仓）；**触真实仓历史的调用已不在该文件内**（在 helper 里，2 处） |
| **AC5** | 「测试源码含 `["log","-1","--format=%H","--",file]` 与 `["merge-base","--is-ancestor",a,b]`（逐字）」 | 命令形态的**唯一落点**是 helper；① 新增的「命令形态不得漂移」守卫已改为**读 helper 文件**断言（判据强度不变） |

## 2. 语义核对的结论：**语义没有变，只是位置变了**

| 语义 | ① 的实现 | 本项之后 |
|---|---|---|
| `lastCommitSha` 非超时失败 ⇒ `""` ⇒ 调用方跳过 | `catch { return "" }` | **保留**（`catch (err) { rethrowIfCallTimeout(err, …); return "" }`） |
| `isAncestor` 非超时失败 ⇒ `false` ⇒ 判红 | `catch { return false }` | **保留**（同上） |
| 命令形态 | `git log -1 --format=%H -- <file>` / `git merge-base --is-ancestor` | **逐字保留**（且有源码级守卫钉住 + 元守卫的清单超时校验） |
| 用例级超时 | `{ timeout: 20000 }`（字面量） | `{ timeout: REAL_REPO_GIT_TEST_TIMEOUT_MS }`（= `20_000`） |
| per-call 超时 | **无**（① 明确拒绝加，理由是会被 `catch` 吞掉） | **有**（6s）+ **超时不再被吞**（`err.code === "ETIMEDOUT"` ⇒ 抛带指引的错） |

> ⚠ 最后一行的口径差异是**有意的**，不是回退：① 拒绝的是「加 timeout 但仍吞掉超时」（⇒ 判据静默消失）；
> 本项满足 ① 的**实质要求**（超时不得被吞），只是把「bun 用例级不可归因红」换成「helper 级可归因红」。
> ① 的 Out of Scope ①②（「不给 `execFileSync` 加 timeout」「不改 `catch` 错误处理」）描述的**仍是本项之后的真实边界** ——
> 因为超时**不被吞**、其它错误语义**不变**。

## 3. 「漏改会怎样」：fail-closed，不会静默

若将来有人把 helper 再搬走却没同步 ① 的形态守卫，**守卫会响红**（它读的路径不存在 ⇒ 抛错），
而本项的元守卫另有两条独立防线（R 形态 / 缺 cwd / 清单计数 / 用例超时下限）。
⇒ 交接漏做**不会**造成静默缺口，只是排查成本高 —— 本记录就是为了降低这个成本。

## 4. 复核命令（任何人可复现）

```bash
cd ~/.config/opencode
grep -n 'execFileSync("git"' tests/config-guards.test.ts     # 期望：只剩 1 处（gitFixture）
grep -n 'execFileSync("git"' tests/helpers/real-repo-git.ts  # 期望：2 处（两个 helper）
bun test tests/config-guards.test.ts -t "AC10④"              # 期望：3 pass
bun test tests/real-repo-git-budget.test.ts                  # 期望：6 pass
```
