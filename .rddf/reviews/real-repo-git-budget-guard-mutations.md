# 突变演练 — real-repo-git-budget-guard（AC9）

> 判据真源：`openspec/changes/real-repo-git-budget-guard/proposal.md` 的 AC9 +「变红演练（6 条）」表。
> 被测对象：`tests/real-repo-git-budget.test.ts`（元守卫）+ `tests/helpers/real-repo-git.ts`（唯一入口）。
> 命令：`bun test tests/real-repo-git-budget.test.ts`。
> 复原：每条突变前对**全部四个**受影响文件取 `sha256`，突变后按字节拷回并逐个校验（见 §7）。

## 1. 基线指纹

| 文件 | 角色 |
|---|---|
| `tests/real-repo-git-budget.test.ts` | 元守卫自身 |
| `tests/helpers/real-repo-git.ts` | 唯一入口（M3 的对象） |
| `tests/config-guards.test.ts` | 清单里的被守护用例（M1 / M5 / M6 的注入点） |
| `tests/verifier-baseline.test.ts` | 任意一个既有 git 调用点（M2 的注入点） |

6 条突变全部执行完、逐条复原后：**四个文件的 `sha256` 全部与基线相等**（脚本内断言）。

## 2. M1 — 注入清单外的 **R 形态**（`cwd` 指向仓根）

- **突变**：在 `tests/config-guards.test.ts` 末尾追加**死代码**（不执行）：
  `execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.join(import.meta.dir, "..") })`。
- **必红断言**：AC1（R 形态只允许在 helper 内）。
- **实测**：`(fail) AC1：R 形态（cwd 指向仓根）只允许在 helper 内；缺 cwd ⇒ 红`，`Expected: ""`，`Received: "tests/config-guards.test.ts: cwd = path.join(import.meta.dir, "..")"`。
- **M1b（同族变体，单独实测）**：`cwd: __M1B_ROOT`，其中同文件有 `const __M1B_ROOT = path.join(import.meta.dir, "..")`
  ⇒ `Received: "tests/config-guards.test.ts: cwd = __M1B_ROOT"` ⇒ **也红**（判据做了**同文件常量解析**）。
- **M1c（别名链，单独实测）**：`const __M1C_ROOT = path.join(import.meta.dir, "..")` + `const __M1C_ALIAS = __M1C_ROOT`
  ⇒ `cwd: __M1C_ALIAS` ⇒ `Received: "… cwd = __M1C_ALIAS"` ⇒ **红**（常量解析是**传递闭包**，不是一阶）。
- **M7（`process.cwd()`）**：`cwd: process.cwd()` ⇒ `Received: "… cwd = process.cwd()"` ⇒ **红**。
  ⚠ 这一条是**治理面审查（oracle）挖出来的真实缺口**：`process.cwd()` 与**省略 `cwd`** 行为逐字等价
  （`bun test` 进程 cwd = 仓根），是写测试的**第一直觉**写法 —— 不检测它等于把刚封死的逃逸口换个拼法重开。
- **M7b（已知漏检，登记）**：`cwd: path.resolve(".")` ⇒ **不红**（不在检测的三种形态内）⇒ 已登记进漏检面清单
  （`docs/test-authoring.md` §9 + 守卫文件头）。
- **结论**：✅ 命中（四种 R 形态写法都捕获；`path.resolve()` 等其它等价写法登记为已知漏检）。

## 3. M2 — 删掉某调用点的 `cwd`（隐式真仓）

- **突变**：`tests/verifier-baseline.test.ts` 的 `execFileSync("git", ["init", "-q"], { cwd: dir })` ⇒ `{ }`。
- **必红断言**：AC1（缺 `cwd` ⇒ fail-closed）。
- **实测**：`Received: "tests/verifier-baseline.test.ts: 缺 cwd（隐式真仓）"` ⇒ AC1 红。
- **结论**：✅ 命中（最便宜的逃逸路径被挡住）。

## 4. M3 — 把 per-call 超时**吞成空串 / false**

- **突变**：删掉 helper 两个 `catch` 里的 `rethrowIfCallTimeout(err, …)`（超时退化成 `return ""` / `return false`）。
- **必红断言**：AC3。
- **实测（改版后复跑）**：`(fail) AC3b：per-call 超时不得被吞（行为 + 接线）`，`Received: 0`（两个 catch 的首句都不再是 `rethrowIfCallTimeout`；期望 2）⇒ 其余 5 条仍绿。
- **结论**：✅ 命中。
  ⚠ **如实登记（验证手段的边界）**：端到端「真的挂死 6s」不做 —— bun 的 `execFileSync` **不认运行期
  `process.env.PATH` 变更**（实测：变更后仍解析到系统 git；只有显式 `env.PATH` 生效，而 helper 刻意不接受 env）
  ⇒ 造不出「永不返回的 git」。**补偿**：超时识别逻辑已导出为纯函数 `isGitCallTimeout`，AC3b 用**真实错误对象**
  做行为断言（`{code:"ETIMEDOUT"}` ⇒ `true`；`{status:128}` ⇒ `false`），剩下的「接线」用结构判据钉住。
  非超时分支另有行为证据（非 git 目录 ⇒ `""` / `false`）。

## 5. M4 — 清单 `budget` 3 → 5

- **突变**：`REAL_REPO_GUARDS[0].budget = 5`。
- **必红断言**：AC5（静态计数不等 ⇒ 红）。
- **实测**：`(fail) AC5/AC6：清单项的静态子进程计数 + 用例超时下限`，报错含「清单 budget=5，源码实测 3 个 helper 调用点」。
- **结论**：✅ 命中。

## 6. M5 — 被守护用例的 `{ timeout }` 改成 6000（低于用例级常量）

- **突变**：`tests/config-guards.test.ts` 里 `{ timeout: REAL_REPO_GIT_TEST_TIMEOUT_MS }` ⇒ `{ timeout: 6_000 }`。
- **必红断言**：AC6（超时下限）。
- **实测**：`(fail) AC5/AC6：…`，报错含「用例超时 6_000 低于用例级预算 20000ms」。
- **结论**：✅ 命中。

## 7. M6 — **逃逸形态**：`Bun.spawnSync(["git", …], { cwd: <仓根> })`

- **突变**：在 `tests/config-guards.test.ts` 末尾追加死代码：
  `Bun.spawnSync(["git", "log", "-1", "--", "x"], { cwd: path.join(import.meta.dir, "..") })`。
- **预期**：本次检测口径只看 `execFileSync("git"` ⇒ **不红**。
- **实测**：`6 pass / 0 fail`（exit 0）⇒ **如预期不红**。
- **结论**：❌ 未捕获 ⇒ **如实登记为已知漏检面**（`docs/test-authoring.md` §9 的已知漏检面清单 + 元守卫文件头的注释都已列 `Bun.spawnSync`）。
  ⚠ 这是「静态检测必然有漏检面」的诚实代价：要精确区分真实仓与 fixture 只能靠 PATH shim / `bunfig.toml`
  preload 记录全量轨迹 ⇒ 需改进程启动配置（Out of Scope ⑨）。

## 8. 汇总

| # | 突变 | 必红的断言 | 实测 | 命中 |
|---|---|---|---|---|
| M1 | 清单外 R 形态（`cwd: ...import.meta.dir...`） | AC1 | AC1 红（报出文件名 + cwd 表达式） | ✅ |
| M1b | 同族变体：`cwd: <由 import.meta.dir 派生的常量>` | AC1 | AC1 红（`cwd = __M1B_ROOT`） | ✅ |
| M1c | 别名链：`const B = A`（A 为仓根常量） | AC1 | AC1 红（`cwd = __M1C_ALIAS`） | ✅ |
| M7 | `cwd: process.cwd()`（≡ 省略 cwd） | AC1 | AC1 红（`cwd = process.cwd()`） | ✅ |
| M7b | `cwd: path.resolve(".")` | （登记项） | **不红** ⇒ 登记为已知漏检 | ❌ 登记 |
| M2 | 删掉 `cwd` | AC1 | AC1 红（「缺 cwd（隐式真仓）」） | ✅ |
| M3 | 超时吞成 `""` / `false` | AC3 | AC3b 红 | ✅ |
| M4 | 清单 `budget` 3→5 | AC5 | AC5/AC6 红 | ✅ |
| M5 | 用例 `{ timeout: 6_000 }` | AC6 | AC5/AC6 红 | ✅ |
| M6 | `Bun.spawnSync` 逃逸 | （AC9 要求如实记录） | **不红** | ❌ **登记为已知漏检** |

**复原证据**：四文件 `sha256` 全部回到基线（脚本断言 + 本节记录）。
**不空转**：守卫 6 个用例里 4 条为「取红」判据（AC1 / AC3 / AC5 / AC6 的机械载体），M1–M5 逐条证明其判别力。
